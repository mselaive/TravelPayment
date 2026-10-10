import { GoogleGenAI } from "@google/genai";
import type { Category, Currency, ScanResult } from "./types";

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

// Si un modelo está saturado (503) o sin cuota gratis (429), probamos el siguiente:
// en la capa gratuita las cuotas son por modelo.
const FALLBACK_MODELS = ["gemini-flash-latest", "gemini-flash-lite-latest", "gemini-2.5-flash"];
const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);
// Tiempo máximo por modelo. Sin esto el SDK reintenta solo con esperas de hasta 60 s.
// Gemini rechaza plazos (deadline) menores a 10 s; cortamos nosotros a los 9 s.
const SERVER_DEADLINE_MS = 10_000;
const ATTEMPT_TIMEOUT_MS = 9_000;

function shouldTryNextModel(e: unknown) {
  const err = e as { status?: number; name?: string; message?: string };
  if (err.status) return RETRYABLE.has(err.status);
  return err.name === "AbortError" || err.name === "TimeoutError" || /abort|timeout|timed out|fetch failed/i.test(err.message ?? "");
}

/** Lee una boleta con Gemini y devuelve los datos ya validados. */
export async function scanWithGemini(opts: {
  apiKey: string;
  model?: string;
  base64: string;
  mimeType: string;
}): Promise<ScanResult> {
  const ai = new GoogleGenAI({ apiKey: opts.apiKey });
  const models = [...new Set([opts.model, ...FALLBACK_MODELS].filter(Boolean) as string[])];
  let lastError: unknown;
  for (const model of models) {
    try {
      return await scanOnce(ai, model, opts.base64, opts.mimeType);
    } catch (e) {
      lastError = e;
      if (!shouldTryNextModel(e)) throw e;
      console.warn(`Gemini ${model} falló (${(e as { status?: number }).status ?? (e as Error).message}), probando otro modelo`);
    }
  }
  throw lastError;
}

async function scanOnce(ai: GoogleGenAI, model: string, base64: string, mimeType: string) {
  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [{ inlineData: { mimeType, data: base64 } }, { text: PROMPT }],
      },
    ],
    config: {
      httpOptions: { timeout: SERVER_DEADLINE_MS, retryOptions: { attempts: 1 } },
      abortSignal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      responseMimeType: "application/json",
      responseJsonSchema: SCHEMA,
      temperature: 0,
    },
  });
  return sanitize(JSON.parse(response.text ?? "{}"));
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
