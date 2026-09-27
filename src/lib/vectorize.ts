import ImageTracer from 'imagetracerjs';
import { centerline } from './centerline';
import { ellipseD } from './paths';
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
  /** Pixels in `key` (which must be in the palette) become the `active` part, drawn in `color`. */
  active?: { key: string; color: string };
  /**
   * Trace each colour as stroked centerlines where it is made of even-width lines (outline
   * styles). `width` fixes the stroke width in viewBox units so every icon in a set matches;
   * colours that aren't line work (solid shapes) are traced as fills as usual.
   */
  lines?: { cap: 'round' | 'square'; width?: number };
  /** Rebuild the icon as pixel art on a grid this many pixels across (e.g. 32). */
  pixel?: number;
}

/**
 * Pixel art on an exact grid: the ink is fitted to the grid (with a 2-pixel margin) and each grid
 * pixel takes the colour that covers most of it, or stays empty when less than half is ink. The
 * SVG keeps the usual 24-unit viewBox, so one pixel is 24/grid units and renders exactly at the
 * grid size and its multiples.
 */
export function pixelize(img: Raster, opts: VectorizeOptions, grid: number): string {
  const q = quantize(img, opts.palette);
  const { width: w, height: h, data } = q;
  let [x0, y0, x1, y1] = [w, h, -1, -1];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (data[(y * w + x) * 4 + 3]) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  const header = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}">`;
  if (x1 < 0) return header + '</svg>';
  const content = grid - 4;
  const span = Math.max(x1 - x0 + 1, y1 - y0 + 1);
  const step = span / content;
  // Centre the ink box on the grid.
  const ox = x0 - ((content - (x1 - x0 + 1) / step) / 2 + 2) * step;
  const oy = y0 - ((content - (y1 - y0 + 1) / step) / 2 + 2) * step;
  const pal = opts.palette.map((hex) => ({ hex: hex.toLowerCase(), ...hexToRgb(hex) }));
  const cells: (number | -1)[] = new Array(grid * grid).fill(-1);
  for (let gy = 0; gy < grid; gy++)
    for (let gx = 0; gx < grid; gx++) {
      const counts = new Array(pal.length).fill(0);
      let total = 0;
      let ink = 0;
      for (let sy = Math.floor(oy + gy * step); sy < oy + (gy + 1) * step; sy++)
        for (let sx = Math.floor(ox + gx * step); sx < ox + (gx + 1) * step; sx++) {
          total++;
          if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
          const i = (sy * w + sx) * 4;
          if (!data[i + 3]) continue;
          ink++;
          const k = pal.findIndex((c) => c.r === data[i] && c.g === data[i + 1] && c.b === data[i + 2]);
          if (k >= 0) counts[k]++;
        }
      if (total && ink / total >= 0.5) cells[gy * grid + gx] = counts.indexOf(Math.max(...counts));
    }
  // One path per colour, horizontal runs of pixels merged into rectangles.
  const u = VIEWBOX / grid;
  const f = (v: number) => String(Math.round(v * 1000) / 1000);
  const key = opts.active?.key.toLowerCase();
  const paths = pal
    .map((c, k) => {
      let d = '';
      for (let gy = 0; gy < grid; gy++)
        for (let gx = 0; gx < grid; gx++) {
          if (cells[gy * grid + gx] !== k) continue;
          let end = gx;
          while (end + 1 < grid && cells[gy * grid + end + 1] === k) end++;
          const [x, y, xe, ye] = [gx * u, gy * u, (end + 1) * u, (gy + 1) * u];
          d += `M${f(x)} ${f(y)}L${f(xe)} ${f(y)}L${f(xe)} ${f(ye)}L${f(x)} ${f(ye)}Z`;
          gx = end;
        }
      if (!d) return '';
      return c.hex === key ? `<path class="active" fill="${opts.active!.color}" d="${d}"/>` : `<path fill="${c.hex}" d="${d}"/>`;
    })
    .join('');
  return header + paths + '</svg>';
}

/** Resolution centerlines are traced at: 10 pixels per viewBox unit. */
const LINE_SIZE = 240;

function lineWork(img: Raster, opts: VectorizeOptions): Map<string, string> {
  const out = new Map<string, string>();
  if (!opts.lines) return out;
  const q = quantize(img.width === LINE_SIZE ? img : resize(img, LINE_SIZE, LINE_SIZE), opts.palette);
  const key = opts.active?.key.toLowerCase();
  for (const hex of opts.palette.map((h) => h.toLowerCase())) {
    const { r, g, b } = hexToRgb(hex);
    const mask = new Uint8Array(LINE_SIZE * LINE_SIZE);
    for (let i = 0, j = 0; i < q.data.length; i += 4, j++) mask[j] = q.data[i + 3] && q.data[i] === r && q.data[i + 1] === g && q.data[i + 2] === b ? 1 : 0;
    const res = centerline(mask, LINE_SIZE, { viewBox: VIEWBOX });
    if (!res) continue;
    const width = Math.round((opts.lines.width ?? res.width) * 100) / 100;
    const color = hex === key ? opts.active!.color : hex;
    const join = opts.lines.cap === 'square' ? 'miter' : 'round';
    const cls = hex === key ? ' class="active"' : '';
    const stroke = res.d ? `<path${cls} fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="${opts.lines.cap}" stroke-linejoin="${join}" d="${res.d}"/>` : '';
    const dots = res.dots.length ? `<path${cls} fill="${color}" d="${res.dots.map((c) => ellipseD(c.x, c.y, c.r)).join('')}"/>` : '';
    out.set(hex, stroke + dots);
  }
  return out;
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
  if (opts.pixel) return pixelize(img, opts, opts.pixel);
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
  const key = opts.active?.key.toLowerCase();
  const lines = lineWork(img, opts);
  const paths = [...byColor.entries()]
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([hex, ds]) =>
      lines.get(hex) ??
      (hex === key ? `<path class="active" fill="${opts.active!.color}" d="${ds.join('')}"/>` : `<path fill="${hex}" d="${ds.join('')}"/>`),
    );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}">${paths.join('')}</svg>`;
}
