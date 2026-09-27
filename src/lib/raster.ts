import { distanceSq, type RGB } from './color';
import type { Raster } from './types';

export function createRaster(width: number, height: number): Raster {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

export function cloneRaster(src: Raster): Raster {
  return { width: src.width, height: src.height, data: new Uint8ClampedArray(src.data) };
}

/** Share of pixels that are clearly see-through. */
export function transparentShare(img: Raster): number {
  let n = 0;
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] < 16) n++;
  return n / (img.width * img.height);
}

/** Median colour of the outermost pixel ring — a robust guess at a flat background. */
export function estimateBackground(img: Raster): RGB {
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const push = (x: number, y: number) => {
    const i = (y * img.width + x) * 4;
    rs.push(img.data[i]);
    gs.push(img.data[i + 1]);
    bs.push(img.data[i + 2]);
  };
  for (let x = 0; x < img.width; x++) {
    push(x, 0);
    push(x, img.height - 1);
  }
  for (let y = 1; y < img.height - 1; y++) {
    push(0, y);
    push(img.width - 1, y);
  }
  const med = (a: number[]) => a.sort((p, q) => p - q)[a.length >> 1];
  return { r: med(rs), g: med(gs), b: med(bs) };
}

/**
 * Make sure the image has a real alpha channel. Models that can't output transparency are asked
 * for a flat background; we key that colour out with a soft ramp so anti-aliased edges survive.
 */
export function ensureTransparent(img: Raster, opts: { tolerance?: number; softness?: number } = {}): Raster {
  if (transparentShare(img) > 0.05) return img;
  const bg = estimateBackground(img);
  const tol = opts.tolerance ?? 40;
  const soft = opts.softness ?? 60;
  // distanceSq is ~9x a plain squared RGB distance at most; scale thresholds to match.
  const lo = tol * tol * 9;
  const hi = (tol + soft) * (tol + soft) * 9;
  const out = cloneRaster(img);
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    const dist = distanceSq({ r: d[i], g: d[i + 1], b: d[i + 2] }, bg);
    if (dist <= lo) d[i + 3] = 0;
    else if (dist < hi) d[i + 3] = Math.round((d[i + 3] * (dist - lo)) / (hi - lo));
  }
  return out;
}

export function crop(img: Raster, x: number, y: number, w: number, h: number): Raster {
  const out = createRaster(w, h);
  for (let yy = 0; yy < h; yy++) {
    const sy = y + yy;
    if (sy < 0 || sy >= img.height) continue;
    for (let xx = 0; xx < w; xx++) {
      const sx = x + xx;
      if (sx < 0 || sx >= img.width) continue;
      const si = (sy * img.width + sx) * 4;
      const di = (yy * w + xx) * 4;
      out.data[di] = img.data[si];
      out.data[di + 1] = img.data[si + 1];
      out.data[di + 2] = img.data[si + 2];
      out.data[di + 3] = img.data[si + 3];
    }
  }
  return out;
}

/** Bilinear resize with premultiplied alpha so transparent pixels don't bleed dark fringes. */
export function resize(img: Raster, width: number, height: number): Raster {
  const out = createRaster(width, height);
  const sx = img.width / width;
  const sy = img.height / height;
  const src = img.data;
  for (let y = 0; y < height; y++) {
    const fy = Math.max(0, (y + 0.5) * sy - 0.5);
    const y0 = Math.min(img.height - 1, Math.floor(fy));
    const y1 = Math.min(img.height - 1, y0 + 1);
    const wy = fy - y0;
    for (let x = 0; x < width; x++) {
      const fx = Math.max(0, (x + 0.5) * sx - 0.5);
      const x0 = Math.min(img.width - 1, Math.floor(fx));
      const x1 = Math.min(img.width - 1, x0 + 1);
      const wx = fx - x0;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      const taps: [number, number, number][] = [
        [x0, y0, (1 - wx) * (1 - wy)],
        [x1, y0, wx * (1 - wy)],
        [x0, y1, (1 - wx) * wy],
        [x1, y1, wx * wy],
      ];
      for (const [tx, ty, w] of taps) {
        const i = (ty * img.width + tx) * 4;
        const al = (src[i + 3] / 255) * w;
        r += src[i] * al;
        g += src[i + 1] * al;
        b += src[i + 2] * al;
        a += al;
      }
      const o = (y * width + x) * 4;
      if (a > 0) {
        out.data[o] = r / a;
        out.data[o + 1] = g / a;
        out.data[o + 2] = b / a;
      }
      out.data[o + 3] = a * 255;
    }
  }
  return out;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Tight bounding box of pixels with alpha above threshold, or null when empty. */
export function alphaBounds(img: Raster, threshold = 96): Box | null {
  let minX = img.width;
  let minY = img.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * Center the visible content on a square canvas so every icon ends up with the same optical
 * padding: the longest side of the content fills `fill` of the output edge.
 */
export function fitSquare(img: Raster, size: number, fill = 20 / 24): Raster {
  const b = alphaBounds(img, 8);
  if (!b) return createRaster(size, size);
  const content = crop(img, b.x, b.y, b.w, b.h);
  const scale = (size * fill) / Math.max(b.w, b.h);
  const w = Math.max(1, Math.round(b.w * scale));
  const h = Math.max(1, Math.round(b.h * scale));
  const scaled = resize(content, w, h);
  const out = createRaster(size, size);
  const ox = Math.round((size - w) / 2);
  const oy = Math.round((size - h) / 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 4;
      const di = ((y + oy) * size + (x + ox)) * 4;
      out.data.set(scaled.data.subarray(si, si + 4), di);
    }
  }
  return out;
}
