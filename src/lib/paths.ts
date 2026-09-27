/**
 * Tiny toolkit for the SVGs this app writes itself: `<path fill="#hex" d="...">` with absolute
 * M/L/Q/C/Z commands only. That is enough to move, scale, snap and re-emit icons (and to convert
 * them to EMF) without a DOM or a general SVG parser.
 */

export type Seg =
  | { c: 'M' | 'L'; p: [number, number] }
  | { c: 'Q'; p: [number, number, number, number] }
  | { c: 'C'; p: [number, number, number, number, number, number] }
  | { c: 'Z' };

export interface FillPath {
  fill: string;
  d: string;
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
        const x = snap((a.x + b.x) / 2);
        a.sx ??= x;
        b.sx ??= x;
      } else if (dx > 0 && dy <= dx * 0.08) {
        const y = snap((a.y + b.y) / 2);
        a.sy ??= y;
        b.sy ??= y;
      }
    }
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
    const fill = /fill="([^"]+)"/.exec(m[1]);
    const d = /\bd="([^"]+)"/.exec(m[1]);
    if (d) paths.push({ fill: fill ? fill[1] : '#000000', d: d[1] });
  }
  return { width, height, paths };
}

export function toSvg(paths: FillPath[], width: number, height = width): string {
  const body = paths.filter((p) => p.d).map((p) => `<path fill="${p.fill}" d="${p.d}"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${body.join('')}</svg>`;
}

/** Snap a whole icon for crisp rendering at `px` pixels. */
export function snapSvg(svg: string, px: number): string {
  const { width, height, paths } = parseSvg(svg);
  const unit = width / px;
  return toSvg(
    paths.map((p) => ({ ...p, d: snapD(p.d, unit) })),
    width,
    height,
  );
}

/** Place an icon's paths inside another drawing: scale, then offset. */
export function placePaths(svg: string, size: number, x: number, y: number): FillPath[] {
  const { width, paths } = parseSvg(svg);
  const s = size / (width || 24);
  return paths.map((p) => ({ fill: p.fill, d: transformD(p.d, s, x, y) }));
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
