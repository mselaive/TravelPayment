import { scanWithGemini } from "@/lib/scan";
import { getUserId } from "@/lib/supabase/server";

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

  const isoField = (key: string) => {
    const v = form?.get(key);
    return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
  };

  try {
    const result = await scanWithGemini({
      apiKey,
      model: process.env.GEMINI_MODEL,
      base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
      mimeType: file.type || "image/jpeg",
      context: { today: isoField("today"), tripStart: isoField("trip_start"), tripEnd: isoField("trip_end") },
    });
    return Response.json(result);
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
