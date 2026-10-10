/** Reduce la foto en el celular antes de subirla (≈200–400 KB en vez de varios MB). */
export async function compressImage(file: File, maxSize = 1600, quality = 0.72): Promise<Blob> {
  const source = await loadImage(file);
  const scale = Math.min(1, maxSize / Math.max(source.width, source.height));
  const width = Math.round(source.width * scale);
  const height = Math.round(source.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(source.image, 0, 0, width, height);
  if ("close" in source.image) source.image.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  return blob ?? file;
}

type Loaded = { image: ImageBitmap | HTMLImageElement; width: number; height: number };

async function loadImage(file: File): Promise<Loaded> {
  if ("createImageBitmap" in window) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { image: bitmap, width: bitmap.width, height: bitmap.height };
    } catch {
      // Algunos formatos (p. ej. HEIC en Chrome) fallan aquí; probamos con <img>.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { image: img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}
