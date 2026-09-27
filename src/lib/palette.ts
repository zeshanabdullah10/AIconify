import { distanceSq, rgbToHex, type RGB } from './color';
import type { Raster } from './types';

export interface Swatch {
  hex: string;
  share: number;
}

/**
 * Dominant colours of a logo via k-means on opaque pixels. Near-white and near-black pixels
 * are kept (they can be brand colours) but tiny clusters are dropped as anti-aliasing noise.
 */
export function extractPalette(img: Raster, k = 5, maxSamples = 20000): Swatch[] {
  const px: RGB[] = [];
  const total = img.width * img.height;
  const step = Math.max(1, Math.floor(total / maxSamples));
  for (let p = 0; p < total; p += step) {
    const i = p * 4;
    if (img.data[i + 3] < 200) continue;
    px.push({ r: img.data[i], g: img.data[i + 1], b: img.data[i + 2] });
  }
  if (px.length === 0) return [];

  // k-means++ style seeding keeps results stable for flat-colour logos.
  const centers: RGB[] = [px[0]];
  while (centers.length < k) {
    let far = px[0];
    let farD = -1;
    for (const c of px) {
      let d = Infinity;
      for (const ce of centers) d = Math.min(d, distanceSq(c, ce));
      if (d > farD) {
        farD = d;
        far = c;
      }
    }
    if (farD <= 0) break;
    centers.push(far);
  }

  const assign = new Int32Array(px.length);
  for (let iter = 0; iter < 12; iter++) {
    for (let i = 0; i < px.length; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const d = distanceSq(px[i], centers[c]);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      assign[i] = best;
    }
    const acc = centers.map(() => ({ r: 0, g: 0, b: 0, n: 0 }));
    for (let i = 0; i < px.length; i++) {
      const a = acc[assign[i]];
      a.r += px[i].r;
      a.g += px[i].g;
      a.b += px[i].b;
      a.n++;
    }
    for (let c = 0; c < centers.length; c++) {
      const a = acc[c];
      if (a.n) centers[c] = { r: a.r / a.n, g: a.g / a.n, b: a.b / a.n };
    }
  }

  const counts = new Array(centers.length).fill(0);
  for (let i = 0; i < px.length; i++) counts[assign[i]]++;
  const swatches = centers
    .map((c, i) => ({ hex: rgbToHex(c), share: counts[i] / px.length }))
    .filter((s) => s.share >= 0.02)
    .sort((a, b) => b.share - a.share);

  // Merge clusters that ended up visually identical.
  const merged: Swatch[] = [];
  for (const s of swatches) {
    const twin = merged.find((m) => hexDistance(m.hex, s.hex) < 18);
    if (twin) twin.share += s.share;
    else merged.push({ ...s });
  }
  return merged;
}

function hexDistance(a: string, b: string): number {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const dr = ((pa >> 16) & 255) - ((pb >> 16) & 255);
  const dg = ((pa >> 8) & 255) - ((pb >> 8) & 255);
  const db = (pa & 255) - (pb & 255);
  return Math.sqrt(dr * dr + dg * dg + db * db);
}
