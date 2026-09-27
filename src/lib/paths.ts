/**
 * Tiny toolkit for the SVGs this app writes itself: `<path>` elements that are either filled
 * (`fill="#hex"`) or stroked centerlines (`fill="none" stroke="#hex" stroke-width`), with absolute
 * M/L/Q/C/Z commands only. That is enough to move, scale, snap and re-emit icons (and to convert
 * them to EMF) without a DOM or a general SVG parser.
 *
 * A path may carry `class="active"`: the part of the icon that changes with state (a pump's
 * impeller, a valve's disc, a lamp's glow). States and buttons recolour only that part.
 */

export type Seg =
  | { c: 'M' | 'L'; p: [number, number] }
  | { c: 'Q'; p: [number, number, number, number] }
  | { c: 'C'; p: [number, number, number, number, number, number] }
  | { c: 'Z' };

export type Part = 'active';

export interface FillPath {
  /** Fill colour, or 'none' for a stroked centerline. */
  fill: string;
  d: string;
  /** Stroke colour; set only for stroked paths. */
  stroke?: string;
  /** Stroke width in viewBox units. */
  width?: number;
  /** Line ends and corners: round, or square ends with mitred corners. */
  cap?: 'round' | 'square';
  part?: Part;
}

/** The colour a path is drawn in, whether filled or stroked. */
export function colorOf(p: FillPath): string {
  return p.stroke ?? p.fill;
}

/** The same path drawn in another colour. */
export function paint(p: FillPath, color: string): FillPath {
  return p.stroke ? { ...p, stroke: color } : { ...p, fill: color };
}

export function isStroke(p: FillPath): boolean {
  return !!p.stroke;
}

const ARITY = { M: 2, L: 2, Q: 4, C: 6, Z: 0 } as const;

export function parseD(d: string): Seg[] {
  const out: Seg[] = [];
  let cmd: keyof typeof ARITY | null = null;
  let nums: number[] = [];
  const flush = () => {
    if (!cmd) return;
    const n = ARITY[cmd];
    if (n === 0) {
      out.push({ c: 'Z' });
    } else {
      // Extra number groups repeat the command (a second pair after M means L).
      for (let i = 0; i + n <= nums.length; i += n) {
        const c = cmd === 'M' && i > 0 ? 'L' : cmd;
        out.push({ c, p: nums.slice(i, i + n) } as Seg);
      }
    }
    nums = [];
  };
  for (const m of d.matchAll(/([MLQCZ])|(-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?)/gi)) {
    if (m[1]) {
      flush();
      const c = m[1].toUpperCase() as keyof typeof ARITY;
      if (c !== m[1]) throw new Error(`Relative path commands are not supported: ${m[1]}`);
      cmd = c;
      if (c === 'Z') {
        flush();
        cmd = null;
      }
    } else {
      nums.push(parseFloat(m[2]));
    }
  }
  flush();
  return out;
}

const fmt = (v: number) => {
  const r = Math.round(v * 100) / 100;
  return String(Object.is(r, -0) ? 0 : r);
};

export function formatD(segs: Seg[]): string {
  return segs.map((s) => (s.c === 'Z' ? 'Z' : s.c + s.p.map(fmt).join(' '))).join('');
}

/** Apply x' = x·s + dx, y' = y·s + dy to every point. */
export function transformD(d: string, s: number, dx: number, dy: number): string {
  return formatD(
    parseD(d).map((seg) => (seg.c === 'Z' ? seg : ({ c: seg.c, p: seg.p.map((v, i) => v * s + (i % 2 ? dy : dx)) } as Seg))),
  );
}

/**
 * Hint an outline for a pixel grid of `unit` viewBox units, the way font hinting does: straight
 * vertical and horizontal edges move onto whole pixels, so stems and bars render sharp instead of
 * as two half-grey columns. Curves and diagonals are left alone; snapping those point by point
 * pinches thin strokes shut.
 */
export function snapD(d: string, unit: number): string {
  const segs = parseD(d);
  // On-curve points, grouped into subpaths.
  const pts: { seg: number; x: number; y: number; sx?: number; sy?: number }[] = [];
  const subpaths: number[][] = [];
  segs.forEach((seg, i) => {
    if (seg.c === 'Z') return;
    if (seg.c === 'M') subpaths.push([]);
    pts.push({ seg: i, x: seg.p[seg.p.length - 2], y: seg.p[seg.p.length - 1] });
    subpaths[subpaths.length - 1]?.push(pts.length - 1);
  });
  const snap = (v: number) => Math.round(v / unit) * unit;
  // Straight vertical (x) and horizontal (y) edges: where they are, where they snap to, and the
  // span they cover along the other axis.
  type Edge = { a: (typeof pts)[number]; b: (typeof pts)[number]; axis: 'x' | 'y'; at: number; to: number; lo: number; hi: number };
  const edges: Edge[] = [];
  for (const sub of subpaths) {
    for (let k = 0; k < sub.length; k++) {
      const a = pts[sub[k]];
      const b = pts[sub[(k + 1) % sub.length]];
      // Only straight edges: the segment ending at b (or the implicit closing line) must be a line.
      const into = segs[b.seg].c;
      if (k + 1 < sub.length && into !== 'L') continue;
      const dx = Math.abs(b.x - a.x);
      const dy = Math.abs(b.y - a.y);
      if (dy > 0 && dx <= dy * 0.08) {
        const at = (a.x + b.x) / 2;
        edges.push({ a, b, axis: 'x', at, to: snap(at), lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y) });
      } else if (dx > 0 && dy <= dx * 0.08) {
        const at = (a.y + b.y) / 2;
        edges.push({ a, b, axis: 'y', at, to: snap(at), lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x) });
      }
    }
  }
  // A bar thinner than a pixel has both sides round to the same line and would vanish. Keep it one
  // pixel wide: move whichever side rounding moved further one pixel back towards where it was.
  for (const axis of ['x', 'y'] as const) {
    const list = edges.filter((e) => e.axis === axis).sort((e, f) => e.at - f.at);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length && list[j].at - list[i].at < 2 * unit; j++) {
        const [e, f] = [list[i], list[j]];
        if (e.to !== f.to || f.at - e.at < unit * 0.05 || Math.min(e.hi, f.hi) <= Math.max(e.lo, f.lo)) continue;
        if (Math.abs(f.at - f.to) >= Math.abs(e.at - e.to)) f.to += unit;
        else e.to -= unit;
      }
    }
  }
  for (const e of edges) {
    const key = e.axis === 'x' ? 'sx' : 'sy';
    e.a[key] ??= e.to;
    e.b[key] ??= e.to;
  }
  const moved = segs.map((seg) => (seg.c === 'Z' ? seg : ({ ...seg, p: [...seg.p] } as Seg)));
  for (const pt of pts) {
    const seg = moved[pt.seg];
    if (seg.c === 'Z') continue;
    seg.p[seg.p.length - 2] = pt.sx ?? pt.x;
    seg.p[seg.p.length - 1] = pt.sy ?? pt.y;
  }
  // Drop lines that collapsed onto their start point.
  const out: Seg[] = [];
  let last: number[] | null = null;
  for (const seg of moved) {
    if (seg.c === 'Z') {
      out.push(seg);
      continue;
    }
    const end = seg.p.slice(-2);
    if (seg.c === 'L' && last && last[0] === end[0] && last[1] === end[1]) continue;
    out.push(seg);
    last = end;
  }
  return formatD(out);
}

export function parseSvg(svg: string): { width: number; height: number; paths: FillPath[] } {
  const vb = /viewBox="([\d.\s-]+)"/.exec(svg);
  const [, , width, height] = (vb ? vb[1].trim().split(/\s+/).map(Number) : [0, 0, 24, 24]) as number[];
  const paths: FillPath[] = [];
  for (const m of svg.matchAll(/<path\b([^>]*)\/?>/g)) {
    const attr = (name: string) => new RegExp(`(?:^|\\s)${name}="([^"]+)"`).exec(m[1])?.[1];
    const d = attr('d');
    if (!d) continue;
    const path: FillPath = { fill: attr('fill') ?? '#000000', d };
    const stroke = attr('stroke');
    if (stroke && stroke !== 'none') {
      path.stroke = stroke;
      path.width = parseFloat(attr('stroke-width') ?? '1');
      path.cap = attr('stroke-linecap') === 'square' ? 'square' : 'round';
    }
    if (attr('class')?.split(/\s+/).includes('active')) path.part = 'active';
    paths.push(path);
  }
  return { width, height, paths };
}

export function pathXml(p: FillPath): string {
  const cls = p.part ? ` class="${p.part}"` : '';
  if (!p.stroke) return `<path${cls} fill="${p.fill}" d="${p.d}"/>`;
  const join = p.cap === 'square' ? 'miter' : 'round';
  return `<path${cls} fill="none" stroke="${p.stroke}" stroke-width="${fmt(p.width ?? 1)}" stroke-linecap="${p.cap ?? 'round'}" stroke-linejoin="${join}" d="${p.d}"/>`;
}

export function toSvg(paths: FillPath[], width: number, height = width): string {
  const body = paths.filter((p) => p.d).map(pathXml);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${body.join('')}</svg>`;
}

/**
 * Hint a stroked centerline: the stroke width becomes whole pixels, and straight horizontal and
 * vertical runs move so both stroke edges land on pixel boundaries (onto pixel centres for odd
 * widths, onto grid lines for even ones).
 */
export function snapStroke(p: FillPath, unit: number): FillPath {
  const px = Math.max(1, Math.round((p.width ?? 1) / unit));
  const offset = px % 2 ? unit / 2 : 0;
  const snap = (v: number) => Math.round((v - offset) / unit) * unit + offset;
  const segs = parseD(p.d).map((seg) => (seg.c === 'Z' ? seg : ({ ...seg, p: [...seg.p] } as Seg)));
  let prev: number[] | null = null;
  let start: number[] | null = null;
  const fix = (a: number[], b: number[]) => {
    const dx = Math.abs(b[0] - a[0]);
    const dy = Math.abs(b[1] - a[1]);
    if (dy > 0 && dx <= dy * 0.08) a[0] = b[0] = snap((a[0] + b[0]) / 2);
    else if (dx > 0 && dy <= dx * 0.08) a[1] = b[1] = snap((a[1] + b[1]) / 2);
  };
  // Endpoints are shared views into the segment arrays, so a fix on one edge moves its neighbours too.
  const end = (seg: Seg) => (seg.c === 'Z' ? null : seg.p);
  for (const seg of segs) {
    const pt = end(seg);
    if (seg.c === 'M') {
      prev = start = pt;
      continue;
    }
    if (seg.c === 'Z') {
      prev = start;
      continue;
    }
    if (seg.c === 'L' && prev) {
      const a = [prev[prev.length - 2], prev[prev.length - 1]];
      const b = [pt![0], pt![1]];
      fix(a, b);
      prev[prev.length - 2] = a[0];
      prev[prev.length - 1] = a[1];
      pt![0] = b[0];
      pt![1] = b[1];
    }
    prev = pt;
  }
  return { ...p, width: px * unit, d: formatD(segs) };
}

/** Snap a whole icon for crisp rendering at `px` pixels. */
export function snapSvg(svg: string, px: number): string {
  const { width, height, paths } = parseSvg(svg);
  const unit = width / px;
  return toSvg(
    paths.map((p) => (p.stroke ? snapStroke(p, unit) : { ...p, d: snapD(p.d, unit) })),
    width,
    height,
  );
}

/** Stroke width multipliers for the weight setting. */
export const WEIGHTS = { light: 0.75, regular: 1, bold: 1.35 } as const;

/**
 * Stroke widths for rendering at `px` pixels: `weight` scales every stroke (light, regular,
 * bold), and small sizes get relatively heavier lines so they don't fade, the way type designers
 * cut optical sizes. Filled paths are unchanged.
 */
export function opticalSvg(svg: string, px: number, weight = 1): string {
  const { width, height, paths } = parseSvg(svg);
  if (!paths.some(isStroke)) return svg;
  const optical = Math.pow(24 / Math.max(8, px), 0.25);
  return toSvg(
    paths.map((p) => (p.stroke ? { ...p, width: (p.width ?? 1) * weight * optical } : p)),
    width,
    height,
  );
}

/** Place an icon's paths inside another drawing: scale, then offset. */
export function placePaths(svg: string, size: number, x: number, y: number): FillPath[] {
  const { width, paths } = parseSvg(svg);
  const s = size / (width || 24);
  return paths.map((p) => ({ ...p, d: transformD(p.d, s, x, y), ...(p.stroke ? { width: (p.width ?? 1) * s } : {}) }));
}

export function rectD(x: number, y: number, w: number, h: number): string {
  return formatD([
    { c: 'M', p: [x, y] },
    { c: 'L', p: [x + w, y] },
    { c: 'L', p: [x + w, y + h] },
    { c: 'L', p: [x, y + h] },
    { c: 'Z' },
  ]);
}

export function roundRectD(x: number, y: number, w: number, h: number, r: number): string {
  r = Math.min(r, w / 2, h / 2);
  if (r <= 0) return rectD(x, y, w, h);
  return formatD([
    { c: 'M', p: [x + r, y] },
    { c: 'L', p: [x + w - r, y] },
    { c: 'Q', p: [x + w, y, x + w, y + r] },
    { c: 'L', p: [x + w, y + h - r] },
    { c: 'Q', p: [x + w, y + h, x + w - r, y + h] },
    { c: 'L', p: [x + r, y + h] },
    { c: 'Q', p: [x, y + h, x, y + h - r] },
    { c: 'L', p: [x, y + r] },
    { c: 'Q', p: [x, y, x + r, y] },
    { c: 'Z' },
  ]);
}

/** Circle (or ellipse) as four cubic arcs. */
export function ellipseD(cx: number, cy: number, rx: number, ry = rx): string {
  const k = 0.5523;
  const [kx, ky] = [rx * k, ry * k];
  return formatD([
    { c: 'M', p: [cx + rx, cy] },
    { c: 'C', p: [cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry] },
    { c: 'C', p: [cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy] },
    { c: 'C', p: [cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry] },
    { c: 'C', p: [cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy] },
    { c: 'Z' },
  ]);
}

/** A polygon from a list of points. */
export function polyD(points: [number, number][]): string {
  return formatD([...points.map((p, i) => ({ c: i ? 'L' : 'M', p }) as Seg), { c: 'Z' }]);
}
