import { PNG } from 'pngjs';
import type { Codec } from '../lib/codec';
import { createRaster } from '../lib/raster';
import type { Raster } from '../lib/types';

export function fillCircle(img: Raster, cx: number, cy: number, r: number, rgba: [number, number, number, number], ring = 0) {
  for (let y = Math.floor(cy - r); y <= cy + r; y++) {
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
      const d = Math.hypot(x - cx, y - cy);
      if (d <= r && (!ring || d >= r - ring)) img.data.set(rgba, (y * img.width + x) * 4);
    }
  }
}

export function fillRect(img: Raster, x0: number, y0: number, w: number, h: number, rgba: [number, number, number, number]) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) img.data.set(rgba, (y * img.width + x) * 4);
}

export const GREEN: [number, number, number, number] = [31, 77, 58, 255];

/**
 * A 4×4 "icon sheet" like a model would return. Cell 5 has a detached dot (like an "i"),
 * cell 10 is empty, and one shape is placed off-centre to exercise gutter detection.
 */
export function makeSheet(size = 512, opaqueBg?: [number, number, number]): Raster {
  const img = createRaster(size, size);
  if (opaqueBg) for (let i = 0; i < img.data.length; i += 4) img.data.set([...opaqueBg, 255], i);
  const cell = size / 4;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const i = r * 4 + c;
      if (i === 10) continue;
      const cx = c * cell + cell / 2 + (i === 3 ? 8 : 0);
      const cy = r * cell + cell / 2;
      if (i % 3 === 0) fillCircle(img, cx, cy, cell * 0.3, GREEN, 6);
      else if (i % 3 === 1) fillRect(img, Math.round(cx - cell * 0.25), Math.round(cy - cell * 0.2), Math.round(cell * 0.5), Math.round(cell * 0.4), GREEN);
      else fillCircle(img, cx, cy, cell * 0.28, GREEN);
      if (i === 5) fillCircle(img, cx, cy - cell * 0.36, 5, GREEN);
    }
  }
  return img;
}

export function toPngDataUrl(img: Raster): string {
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data);
  return `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`;
}

export function fromPngDataUrl(url: string): Raster {
  const b64 = url.slice(url.indexOf(',') + 1);
  const png = PNG.sync.read(Buffer.from(b64, 'base64'));
  return { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) };
}

export const nodeCodec: Codec = {
  async decode(url) {
    return fromPngDataUrl(url);
  },
  async encode(img) {
    return toPngDataUrl(img);
  },
  async rasterizeSvg(_svg, size) {
    return new Uint8Array(PNG.sync.write(Object.assign(new PNG({ width: size, height: size }))));
  },
};
