/** Largest wallpaper edge stored. Keeps the localStorage entry to a few hundred KB. */
export const MAX_WALLPAPER_EDGE = 1600;

export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Read an image file, scale it down and return a JPEG data URL (wallpapers live in localStorage). */
export async function downscaleToDataUrl(
  file: File,
  maxEdge = MAX_WALLPAPER_EDGE,
  quality = 0.82,
): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxEdge);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available');
    ctx.drawImage(bitmap, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    bitmap.close();
  }
}
