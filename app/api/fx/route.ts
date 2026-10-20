import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Tipo de cambio MXN por 1 USD de una fecha. Primero busca en la tabla fx_rates (caché),
// luego en Frankfurter (BCE, gratis, sin key) y si falla en open.er-api.com.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return Response.json({ error: "No autenticado" }, { status: 401 });

  if (request.nextUrl.searchParams.get("currency") === "CLP") return clpRates();

  const today = new Date().toISOString().slice(0, 10);
  const asked = request.nextUrl.searchParams.get("date") ?? today;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(asked) && asked <= today ? asked : today;

  const { data: cached } = await supabase.from("fx_rates").select("mxn_per_usd").eq("date", date).maybeSingle();
  if (cached) return Response.json({ date, rate: Number(cached.mxn_per_usd), source: "cache" });

  const frank = await fetchJson<{ date: string; rates: { MXN: number } }>(
    `https://api.frankfurter.dev/v1/${date === today ? "latest" : date}?base=USD&symbols=MXN`,
  );
  if (frank?.rates?.MXN) {
    const rate = Math.round(frank.rates.MXN * 10000) / 10000;
    // Solo guardamos si el dato corresponde exactamente a ese día (fines de semana / antes de publicar no).
    if (frank.date === date) {
      await supabase.from("fx_rates").upsert({ date, mxn_per_usd: rate }, { ignoreDuplicates: true });
    }
    return Response.json({ date, rate, source: "frankfurter" });
  }

  const er = await fetchJson<{ rates: { MXN: number } }>("https://open.er-api.com/v6/latest/USD");
  if (er?.rates?.MXN) {
    return Response.json({ date, rate: Math.round(er.rates.MXN * 10000) / 10000, source: "open.er-api" });
  }

  return Response.json({ error: "No se pudo obtener el tipo de cambio" }, { status: 502 });
}

// Pesos chilenos por 1 USD: dólar observado del Banco Central de Chile (mindicador.cl, último mes,
// gratis y sin key); si falla, el valor actual de open.er-api.com.
async function clpRates() {
  const mi = await fetchJson<{ serie?: { fecha: string; valor: number }[] }>("https://mindicador.cl/api/dolar");
  if (mi?.serie?.length) {
    const rates = Object.fromEntries(mi.serie.map((s) => [s.fecha.slice(0, 10), Number(s.valor)]));
    return Response.json({ rates, latest: Number(mi.serie[0].valor), source: "mindicador" });
  }
  const er = await fetchJson<{ rates: { CLP: number } }>("https://open.er-api.com/v6/latest/USD");
  if (er?.rates?.CLP) {
    return Response.json({ rates: {}, latest: Math.round(er.rates.CLP * 100) / 100, source: "open.er-api" });
  }
  return Response.json({ error: "No se pudo obtener el dólar en CLP" }, { status: 502 });
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}
