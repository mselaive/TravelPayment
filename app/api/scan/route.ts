import { GoogleGenAI } from "@google/genai";
import { getUserId } from "@/lib/supabase/server";
import type { Category, Currency, ScanResult } from "@/lib/types";

const PROMPT = `Eres un asistente que lee boletas, tickets y facturas (normalmente de México) para un registro de viáticos.
Devuelve SOLO el JSON pedido.
- merchant: nombre del comercio tal como aparece (corto, sin razón social larga si hay nombre comercial).
- total: el TOTAL FINAL pagado, incluyendo propina si está escrita. Usa punto decimal. Si no se ve, usa 0.
- currency: "MXN" por defecto. Solo "USD" si la boleta dice explícitamente USD, US$, dólares o "dollars". En México el símbolo "$" significa pesos.
- date: fecha de la compra en formato YYYY-MM-DD. En México las fechas suelen venir como dd/mm/aaaa o dd-mm-aa. Si no hay fecha, usa "".
- category: "comida" (restaurantes, cafés, súper, propinas de comida), "transporte" (taxi, Uber, gasolina, casetas, estacionamiento, vuelos), "hospedaje" (hotel, Airbnb) u "otro".
- is_receipt: false si la imagen no parece una boleta o comprobante de pago.`;

const SCHEMA = {
  type: "object",
  properties: {
    is_receipt: { type: "boolean" },
    merchant: { type: "string" },
    total: { type: "number" },
    currency: { type: "string", enum: ["MXN", "USD"] },
    date: { type: "string", description: "YYYY-MM-DD o vacío" },
    category: { type: "string", enum: ["comida", "transporte", "hospedaje", "otro"] },
  },
  required: ["is_receipt", "merchant", "total", "currency", "date", "category"],
};

const MAX_BYTES = 6 * 1024 * 1024;

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "No autenticado" }, { status: 401 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "El escaneo no está configurado (falta GEMINI_API_KEY)" }, { status: 503 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "No llegó la imagen" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "La imagen es demasiado grande" }, { status: 413 });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const data = Buffer.from(await file.arrayBuffer()).toString("base64");
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-flash-latest",
      contents: [
        {
          role: "user",
          parts: [{ inlineData: { mimeType: file.type || "image/jpeg", data } }, { text: PROMPT }],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: SCHEMA,
        temperature: 0,
      },
    });

    const raw = JSON.parse(response.text ?? "{}");
    return Response.json(sanitize(raw));
  } catch (e) {
    console.error("scan error", e);
    const status = (e as { status?: number }).status;
    const message =
      status === 429
        ? "Se alcanzó el límite gratuito de escaneos por ahora. Intenta en un minuto o escribe el monto."
        : "No se pudo leer la boleta. Escribe los datos a mano.";
    return Response.json({ error: message }, { status: 502 });
  }
}

function sanitize(raw: Record<string, unknown>): ScanResult {
  const total = Number(raw.total);
  const date = typeof raw.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : null;
  const currency: Currency = raw.currency === "USD" ? "USD" : "MXN";
  const categories: Category[] = ["comida", "transporte", "hospedaje", "otro"];
  const category = categories.includes(raw.category as Category) ? (raw.category as Category) : "otro";
  return {
    is_receipt: raw.is_receipt !== false,
    merchant: typeof raw.merchant === "string" ? raw.merchant.trim().slice(0, 80) : "",
    total: Number.isFinite(total) && total > 0 ? Math.round(total * 100) / 100 : null,
    currency,
    date,
    category,
  };
}
