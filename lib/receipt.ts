import type { SupabaseClient } from "@supabase/supabase-js";
import { uid } from "./format";
import { compressImage } from "./image";
import type { ScanResult } from "./types";

export async function prepareReceipt(file: File): Promise<Blob> {
  try {
    return await compressImage(file);
  } catch {
    return file;
  }
}

export async function uploadReceipt(supabase: SupabaseClient, userId: string, blob: Blob): Promise<string> {
  const path = `${userId}/${uid()}.jpg`;
  const { error } = await supabase.storage
    .from("receipts")
    .upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: false });
  if (error) throw error;
  return path;
}

export type ScanHints = { today: string; tripStart?: string; tripEnd?: string };

export async function scanReceipt(blob: Blob, hints: ScanHints, signal?: AbortSignal): Promise<ScanResult> {
  const body = new FormData();
  body.append("image", blob, "boleta.jpg");
  // Ayuda a resolver fechas ambiguas como 10/8/26 (8 de octubre en recibos en inglés).
  body.append("today", hints.today);
  if (hints.tripStart && hints.tripEnd) {
    body.append("trip_start", hints.tripStart);
    body.append("trip_end", hints.tripEnd);
  }
  const res = await fetch("/api/scan", { method: "POST", body, signal });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "No se pudo leer la boleta");
  return json as ScanResult;
}
