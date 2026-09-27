import { resize } from './raster';
import type { Raster } from './types';

/** Image I/O the pipeline needs. The browser uses canvas; tests plug in a Node implementation. */
export interface Codec {
  decode(dataUrl: string): Promise<Raster>;
  encode(img: Raster): Promise<string>;
  /** Render an SVG string to PNG bytes at size × size. */
  rasterizeSvg(svg: string, size: number): Promise<Uint8Array>;
}

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read that image.'));
    img.src = src;
  });
}

function toBytes(c: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) =>
    c.toBlob(async (b) => (b ? resolve(new Uint8Array(await b.arrayBuffer())) : reject(new Error('PNG encode failed'))), 'image/png'),
  );
}

export const browserCodec: Codec = {
  async decode(dataUrl) {
    const img = await loadImage(dataUrl);
    // SVG logos may have no intrinsic size; give them a sensible one.
    const w = img.naturalWidth || 512;
    const h = img.naturalHeight || 512;
    const c = canvas(w, h);
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h);
    return { width: w, height: h, data: d.data };
  },
  async encode(img) {
    const c = canvas(img.width, img.height);
    c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
    return c.toDataURL('image/png');
  },
  async rasterizeSvg(svg, size) {
    const withSize = svg.replace('<svg ', `<svg width="${size}" height="${size}" `);
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(withSize)}`;
    const img = await loadImage(url);
    const c = canvas(size, size);
    c.getContext('2d')!.drawImage(img, 0, 0, size, size);
    return toBytes(c);
  },
};

export function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('Could not read file'));
    r.readAsDataURL(file);
  });
}

/** Downscale big logos before sending them to the vision model (fewer tokens, same meaning). */
export async function logoForVision(dataUrl: string, codec: Codec, max = 512): Promise<string> {
  const img = await codec.decode(dataUrl);
  if (img.width <= max && img.height <= max && dataUrl.startsWith('data:image/png')) return dataUrl;
  const s = Math.min(1, max / Math.max(img.width, img.height));
  return codec.encode(resize(img, Math.max(1, Math.round(img.width * s)), Math.max(1, Math.round(img.height * s))));
}
