import { useEffect, useState } from 'react';

const colors = new Map<string, string | null>();

/** Average colour of an image (8x8 downsample), or null if the image can not be read (CORS). */
function sample(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 8;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, 8, 8);
        const { data } = ctx.getImageData(0, 0, 8, 8);
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let i = 0; i < data.length; i += 4) {
          // skip near-black/near-white pixels so the tint stays colourful
          const lum = (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
          if (lum < 24 || lum > 235) continue;
          r += data[i]!;
          g += data[i + 1]!;
          b += data[i + 2]!;
          n++;
        }
        resolve(n ? `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})` : null);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export function useArtColor(url: string | null | undefined): string | null {
  const [color, setColor] = useState<string | null>(url ? (colors.get(url) ?? null) : null);
  useEffect(() => {
    if (!url) return setColor(null);
    if (colors.has(url)) return setColor(colors.get(url) ?? null);
    let live = true;
    void sample(url).then((c) => {
      colors.set(url, c);
      if (live) setColor(c);
    });
    return () => {
      live = false;
    };
  }, [url]);
  return color;
}
