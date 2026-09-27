import ImageTracer from 'imagetracerjs';
import { hexToRgb, nearestIndex, rgbToHex } from './color';
import { createRaster, resize } from './raster';
import type { Raster } from './types';

export const VIEWBOX = 24;

export interface VectorizeOptions {
  /** Brand colours the icon may use. Every opaque pixel snaps to the nearest one. */
  palette: string[];
  /** Resolution the bitmap is traced at; higher = smoother curves, slower. */
  traceSize?: number;
  /** Drop specks smaller than this many traced pixels. */
  minPath?: number;
}

/** Snap every pixel to fully transparent or exactly one palette colour. */
export function quantize(img: Raster, palette: string[]): Raster {
  const pal = palette.map(hexToRgb);
  const out = createRaster(img.width, img.height);
  const s = img.data;
  const d = out.data;
  for (let i = 0; i < s.length; i += 4) {
    if (s[i + 3] < 128) continue;
    const c = pal[nearestIndex({ r: s[i], g: s[i + 1], b: s[i + 2] }, pal)];
    d[i] = c.r;
    d[i + 1] = c.g;
    d[i + 2] = c.b;
    d[i + 3] = 255;
  }
  return out;
}

function scalePath(d: string, factor: number): string {
  return d
    .replace(/-?\d*\.?\d+(?:e-?\d+)?/gi, (n) => {
      const v = Math.round(parseFloat(n) * factor * 100) / 100;
      return String(Object.is(v, -0) ? 0 : v);
    })
    .replace(/\s+/g, ' ')
    .replace(/ ?([MLQZ]) ?/g, '$1')
    .trim();
}

/** Trace a transparent icon crop into a compact 24×24 SVG with one <path> per colour. */
export function vectorize(img: Raster, opts: VectorizeOptions): string {
  const size = opts.traceSize ?? 512;
  const src = img.width === size && img.height === size ? img : resize(img, size, size);
  const q = quantize(src, opts.palette);
  const pal = [{ r: 0, g: 0, b: 0, a: 0 }, ...opts.palette.map((h) => ({ ...hexToRgb(h), a: 255 }))];

  const raw: string = ImageTracer.imagedataToSVG(
    { width: q.width, height: q.height, data: q.data },
    {
      pal,
      colorquantcycles: 1,
      ltres: 1,
      qtres: 1,
      pathomit: opts.minPath ?? 24,
      rightangleenhance: false,
      linefilter: true,
      strokewidth: 0,
      roundcoords: 2,
      blurradius: 0,
      viewbox: true,
      scale: 1,
    },
  );

  const byColor = new Map<string, string[]>();
  for (const m of raw.matchAll(/<path ([^>]*?)\/>/g)) {
    const attrs = m[1];
    const opacity = /opacity="([\d.]+)"/.exec(attrs);
    if (opacity && parseFloat(opacity[1]) === 0) continue;
    const fill = /fill="rgb\((\d+),(\d+),(\d+)\)"/.exec(attrs);
    const d = /d="([^"]+)"/.exec(attrs);
    if (!fill || !d) continue;
    const hex = rgbToHex({ r: +fill[1], g: +fill[2], b: +fill[3] });
    const list = byColor.get(hex) ?? [];
    list.push(scalePath(d[1], VIEWBOX / size));
    byColor.set(hex, list);
  }

  // Keep palette order so the primary colour is painted first and accents sit on top.
  const order = opts.palette.map((h) => h.toLowerCase());
  const paths = [...byColor.entries()]
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([hex, ds]) => `<path fill="${hex}" d="${ds.join('')}"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}">${paths.join('')}</svg>`;
}
