import { crop, ensureTransparent, fitSquare, type Box } from './raster';
import type { Raster } from './types';

export interface SliceResult {
  index: number;
  /** Square, padded, transparent crop of just this cell's shapes. */
  image: Raster;
  box: Box | null;
  flags: string[];
  components: number;
}

export interface SliceOptions {
  cols: number;
  rows: number;
  /** Edge length of each output crop. */
  size?: number;
  alphaThreshold?: number;
}

interface Component {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  area: number;
  label: number;
}

/**
 * Label 8-connected foreground regions. Returns the label map (0 = background) and component
 * stats. Implemented as an iterative flood fill so large sheets don't blow the stack.
 */
export function labelComponents(img: Raster, threshold = 96): { labels: Int32Array; comps: Component[] } {
  const { width: w, height: h, data } = img;
  const labels = new Int32Array(w * h);
  const comps: Component[] = [];
  const stack = new Int32Array(w * h);
  let next = 1;
  for (let p = 0; p < w * h; p++) {
    if (labels[p] || data[p * 4 + 3] <= threshold) continue;
    const c: Component = { minX: w, minY: h, maxX: -1, maxY: -1, area: 0, label: next };
    let sp = 0;
    stack[sp++] = p;
    labels[p] = next;
    while (sp) {
      const q = stack[--sp];
      const x = q % w;
      const y = (q - x) / w;
      c.area++;
      if (x < c.minX) c.minX = x;
      if (x > c.maxX) c.maxX = x;
      if (y < c.minY) c.minY = y;
      if (y > c.maxY) c.maxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          const n = ny * w + nx;
          if (!labels[n] && data[n * 4 + 3] > threshold) {
            labels[n] = next;
            stack[sp++] = n;
          }
        }
      }
    }
    comps.push(c);
    next++;
  }
  return { labels, comps };
}

/**
 * Find `count` content bands along one axis from an occupancy profile. Gaps (runs of empty
 * lines) separate bands; when the model packed icons unevenly we merge across the narrowest
 * gaps. Returns the cut positions between bands, or null if the profile can't support `count`.
 */
export function findCuts(profile: number[], count: number): number[] | null {
  if (count <= 1) return [];
  const bands: { start: number; end: number }[] = [];
  let start = -1;
  for (let i = 0; i < profile.length; i++) {
    if (profile[i] > 0 && start < 0) start = i;
    if (profile[i] === 0 && start >= 0) {
      bands.push({ start, end: i - 1 });
      start = -1;
    }
  }
  if (start >= 0) bands.push({ start, end: profile.length - 1 });
  if (bands.length < count) return null;
  while (bands.length > count) {
    let best = 0;
    let bestGap = Infinity;
    for (let i = 0; i < bands.length - 1; i++) {
      const gap = bands[i + 1].start - bands[i].end;
      if (gap < bestGap) {
        bestGap = gap;
        best = i;
      }
    }
    bands.splice(best, 2, { start: bands[best].start, end: bands[best + 1].end });
  }
  const cuts: number[] = [];
  for (let i = 0; i < bands.length - 1; i++) cuts.push(Math.round((bands[i].end + bands[i + 1].start) / 2));
  return cuts;
}

function uniformCuts(length: number, count: number): number[] {
  return Array.from({ length: count - 1 }, (_, i) => Math.round(((i + 1) * length) / count));
}

function cellOf(v: number, cuts: number[]): number {
  let i = 0;
  while (i < cuts.length && v >= cuts[i]) i++;
  return i;
}

/**
 * Cut an icon sheet into one image per grid cell. Shapes are assigned to the cell holding their
 * centre, so detached parts (the dot of an "i", steam over a cup) stay with their icon and
 * a neighbour's overhang never leaks into the crop.
 */
export function sliceSheet(sheet: Raster, opts: SliceOptions): SliceResult[] {
  const { cols, rows } = opts;
  const size = opts.size ?? 256;
  const threshold = opts.alphaThreshold ?? 96;
  const img = ensureTransparent(sheet);
  const { labels, comps } = labelComponents(img, threshold);

  const minArea = Math.max(6, Math.round(img.width * img.height * 0.00002));
  const kept = comps.filter((c) => c.area >= minArea);

  const colProfile = new Array(img.width).fill(0);
  const rowProfile = new Array(img.height).fill(0);
  for (const c of kept) {
    for (let x = c.minX; x <= c.maxX; x++) colProfile[x]++;
    for (let y = c.minY; y <= c.maxY; y++) rowProfile[y]++;
  }
  const xCuts = findCuts(colProfile, cols) ?? uniformCuts(img.width, cols);
  const yCuts = findCuts(rowProfile, rows) ?? uniformCuts(img.height, rows);
  const xEdges = [0, ...xCuts, img.width];
  const yEdges = [0, ...yCuts, img.height];

  const byCell: Component[][] = Array.from({ length: cols * rows }, () => []);
  for (const c of kept) {
    const cx = (c.minX + c.maxX) / 2;
    const cy = (c.minY + c.maxY) / 2;
    byCell[cellOf(cy, yCuts) * cols + cellOf(cx, xCuts)].push(c);
  }

  const areas = byCell.map((cs) => cs.reduce((s, c) => s + c.area, 0)).filter((a) => a > 0);
  const medianArea = areas.length ? [...areas].sort((a, b) => a - b)[areas.length >> 1] : 0;

  return byCell.map((cs, index) => {
    const flags: string[] = [];
    if (cs.length === 0) {
      return { index, image: fitSquare(crop(img, 0, 0, 1, 1), size), box: null, flags: ['missing'], components: 0 };
    }
    const box = {
      x: Math.min(...cs.map((c) => c.minX)),
      y: Math.min(...cs.map((c) => c.minY)),
      w: 0,
      h: 0,
    };
    box.w = Math.max(...cs.map((c) => c.maxX)) - box.x + 1;
    box.h = Math.max(...cs.map((c) => c.maxY)) - box.y + 1;

    const col = index % cols;
    const row = Math.floor(index / cols);
    const cellW = xEdges[col + 1] - xEdges[col];
    const cellH = yEdges[row + 1] - yEdges[row];
    const spill = 0.12;
    if (
      box.x < xEdges[col] - cellW * spill ||
      box.x + box.w > xEdges[col + 1] + cellW * spill ||
      box.y < yEdges[row] - cellH * spill ||
      box.y + box.h > yEdges[row + 1] + cellH * spill
    ) {
      flags.push('overlaps-neighbour');
    }
    const area = cs.reduce((s, c) => s + c.area, 0);
    if (medianArea && area < medianArea * 0.2) flags.push('very-small');
    if (cs.length > 8) flags.push('fragmented');

    // Copy only pixels belonging to this cell's components (plus their soft edges).
    const pad = 2;
    const bx = Math.max(0, box.x - pad);
    const by = Math.max(0, box.y - pad);
    const bw = Math.min(img.width, box.x + box.w + pad) - bx;
    const bh = Math.min(img.height, box.y + box.h + pad) - by;
    const mine = new Set(cs.map((c) => c.label));
    const piece = crop(img, bx, by, bw, bh);
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        const l = labels[(y + by) * img.width + (x + bx)];
        if (l && !mine.has(l)) piece.data[(y * bw + x) * 4 + 3] = 0;
      }
    }
    return { index, image: fitSquare(piece, size), box, flags, components: cs.length };
  });
}

/** Rows × columns for n icons: as square as possible, never more than `maxCols` wide. */
export function gridFor(n: number, maxCols = 5): { cols: number; rows: number } {
  const cols = Math.min(maxCols, Math.max(1, Math.ceil(Math.sqrt(n))));
  return { cols, rows: Math.max(1, Math.ceil(n / cols)) };
}
