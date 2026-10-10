import { GoogleGenAI } from "@google/genai";
import type { Category, Currency, ScanResult } from "./types";

const PROMPT = `Eres un asistente que lee boletas, tickets y facturas (normalmente de México) para un registro de viáticos.
Devuelve SOLO el JSON pedido.
- merchant: nombre del comercio tal como aparece (corto, sin razón social larga si hay nombre comercial).
- total: el TOTAL FINAL pagado, incluyendo propina si está escrita. Usa punto decimal. Si no se ve, usa 0.
- currency: "MXN" por defecto. Solo "USD" si la boleta dice explícitamente USD, US$, dólares o "dollars". En México el símbolo "$" significa pesos.
- date: fecha de la compra en formato YYYY-MM-DD. Si no hay fecha, usa "".
  Las boletas mexicanas en español usan dd/mm/aaaa, pero las apps en inglés (Uber, Uber Eats, DiDi, Airbnb, aerolíneas) usan mm/dd/aa: "10/8/26" en un recibo en inglés es 8 de octubre de 2026.
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

// Si el modelo en curso no respondió en este tiempo, lanzamos el siguiente en paralelo.
const HEDGE_DELAY_MS = 4_000;

export type ScanContext = { today?: string; tripStart?: string; tripEnd?: string };

function contextPrompt(ctx: ScanContext) {
  const lines: string[] = [];
  if (ctx.today) lines.push(`Hoy es ${ctx.today}; la compra no puede ser posterior a hoy.`);
  if (ctx.tripStart && ctx.tripEnd) {
    lines.push(
      `El viaje es del ${ctx.tripStart} al ${ctx.tripEnd}. Si la fecha es ambigua (día/mes o mes/día), elige la interpretación que cae dentro del viaje.`,
    );
  }
  return lines.length ? `\nContexto:\n- ${lines.join("\n- ")}` : "";
}

/** Lee una boleta con Gemini y devuelve los datos ya validados. */
export async function scanWithGemini(opts: {
  apiKey: string;
  model?: string;
  base64: string;
  mimeType: string;
  context?: ScanContext;
}): Promise<ScanResult> {
  const prompt = PROMPT + contextPrompt(opts.context ?? {});
  const ai = new GoogleGenAI({ apiKey: opts.apiKey });
  const models = [...new Set([opts.model, ...FALLBACK_MODELS].filter(Boolean) as string[])];
  return firstSuccessful(models, (model) => scanOnce(ai, model, opts.base64, opts.mimeType, prompt));
}

/**
 * Prueba los modelos en orden, escalonados: si uno falla con un error recuperable se lanza el
 * siguiente de inmediato, y si solo tarda se lanza el siguiente en paralelo tras HEDGE_DELAY_MS.
 * Gana la primera respuesta correcta.
 */
function firstSuccessful<T>(models: string[], run: (model: string) => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    let next = 0;
    let running = 0;
    let settled = false;
    let lastError: unknown;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const launch = () => {
      clearTimeout(timer);
      if (settled || next >= models.length) return;
      const model = models[next++];
      running++;
      run(model)
        .then(
          (result) => finish(() => resolve(result)),
          (e) => {
            lastError = e;
            if (!shouldTryNextModel(e)) return finish(() => reject(e));
            console.warn(`Gemini ${model} falló (${(e as { status?: number }).status ?? (e as Error).message}), probando otro modelo`);
            launch();
          },
        )
        .finally(() => {
          running--;
          if (running === 0 && next >= models.length) finish(() => reject(lastError));
        });
      timer = setTimeout(launch, HEDGE_DELAY_MS);
    };

    launch();
  });
}

async function scanOnce(ai: GoogleGenAI, model: string, base64: string, mimeType: string, prompt: string) {
  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [{ inlineData: { mimeType, data: base64 } }, { text: prompt }],
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
