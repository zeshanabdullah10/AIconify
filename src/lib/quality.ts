import { parseD, parseSvg, type FillPath, type Seg } from './paths';
import type { IconItem, StyleLock } from './types';

/**
 * Consistency checks across a set, measured from the traced SVGs: the things a designer eyeballs
 * when reviewing an icon family. They are advice, not errors, so they don't change an icon's status.
 */

export type CheckId = 'heavier' | 'lighter' | 'off-centre' | 'busy' | 'not-line-art' | 'no-state-part';

export const CHECK_TEXT: Record<CheckId, string> = {
  heavier: 'Looks heavier than the rest of the set.',
  lighter: 'Looks lighter than the rest of the set.',
  'off-centre': 'Sits off-centre in its square.',
  busy: 'A lot of detail: it may blur together at 16 px.',
  'not-line-art': 'Has solid areas, so it was traced as shapes: the line weight setting won’t change it.',
  'no-state-part': 'No moving or glowing part was marked, so states show a badge instead.',
};

/** An edit instruction that usually fixes the note, offered as a one-click suggestion. */
export const CHECK_FIX: Partial<Record<CheckId, string>> = {
  heavier: 'use fewer, thinner shapes so it matches the lighter icons',
  lighter: 'make the shapes larger and bolder',
  'off-centre': 'center the icon in its square',
  busy: 'simplify it so it reads at 16 px: fewer details, larger gaps',
  'not-line-art': 'redraw it as line art with no solid fills',
  'no-state-part': 'draw the part that moves or lights up in the state colour',
};

type Pt = [number, number];

/** Curves flattened to polylines, one per subpath. */
function flatten(d: string, steps = 8): Pt[][] {
  const out: Pt[][] = [];
  let cur: Pt = [0, 0];
  let line: Pt[] = [];
  for (const s of parseD(d) as Seg[]) {
    if (s.c === 'M') {
      if (line.length) out.push(line);
      cur = [s.p[0], s.p[1]];
      line = [cur];
    } else if (s.c === 'L') {
      cur = [s.p[0], s.p[1]];
      line.push(cur);
    } else if (s.c === 'Q' || s.c === 'C') {
      const [x0, y0] = cur;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const u = 1 - t;
        if (s.c === 'Q') {
          const [qx, qy, x, y] = s.p;
          line.push([u * u * x0 + 2 * u * t * qx + t * t * x, u * u * y0 + 2 * u * t * qy + t * t * y]);
        } else {
          const [ax, ay, bx, by, x, y] = s.p;
          line.push([u ** 3 * x0 + 3 * u * u * t * ax + 3 * u * t * t * bx + t ** 3 * x, u ** 3 * y0 + 3 * u * u * t * ay + 3 * u * t * t * by + t ** 3 * y]);
        }
      }
      cur = line[line.length - 1];
    } else if (line.length) {
      line.push(line[0]);
      cur = line[0];
    }
  }
  if (line.length) out.push(line);
  return out;
}

function segDist(p: Pt, a: Pt, b: Pt): number {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** Ink coverage on an n×n grid over the viewBox: filled shapes (even-odd) and stroked lines. */
export function coverage(paths: FillPath[], viewBox: number, n = 48): Uint8Array {
  const out = new Uint8Array(n * n);
  const cell = viewBox / n;
  for (const p of paths) {
    const lines = flatten(p.d);
    if (p.stroke) {
      const r = (p.width ?? 1) / 2;
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          if (out[y * n + x]) continue;
          const c: Pt = [(x + 0.5) * cell, (y + 0.5) * cell];
          out[y * n + x] = lines.some((l) => l.some((pt, i) => (i ? segDist(c, l[i - 1], pt) <= r : Math.hypot(c[0] - pt[0], c[1] - pt[1]) <= r))) ? 1 : 0;
        }
      continue;
    }
    for (let y = 0; y < n; y++) {
      const cy = (y + 0.5) * cell;
      const xs: number[] = [];
      for (const l of lines)
        for (let i = 1; i < l.length; i++) {
          const [a, b] = [l[i - 1], l[i]];
          if (a[1] > cy === b[1] > cy) continue;
          xs.push(a[0] + ((cy - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
        }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2)
        for (let x = Math.max(0, Math.ceil(xs[k] / cell - 0.5)); x < n && (x + 0.5) * cell <= xs[k + 1]; x++) out[y * n + x] = 1;
    }
  }
  return out;
}

export interface Measure {
  /** Share of the square covered by ink, 0–1. */
  ink: number;
  /** Distance of the ink's bounding-box centre from the square's centre, in 24-unit icon units. */
  offset: number;
  /** Total length of stroked lines, in icon units. */
  lineLength: number;
  hasStrokes: boolean;
  hasFills: boolean;
  hasPart: boolean;
}

export function measure(svg: string): Measure {
  const { width, paths } = parseSvg(svg);
  const vb = width || 24;
  const n = 48;
  const cov = coverage(paths, vb, n);
  let ink = 0;
  let [x0, y0, x1, y1] = [n, n, -1, -1];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if (!cov[y * n + x]) continue;
      ink++;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  const unit = 24 / n;
  const offset = ink ? Math.hypot(((x0 + x1 + 1) / 2 - n / 2) * unit, ((y0 + y1 + 1) / 2 - n / 2) * unit) : 0;
  const lineLength = paths
    .filter((p) => p.stroke)
    .flatMap((p) => flatten(p.d))
    .reduce((s, l) => s + l.reduce((t, pt, i) => (i ? t + Math.hypot(pt[0] - l[i - 1][0], pt[1] - l[i - 1][1]) : 0), 0), 0) * (24 / vb);
  return {
    ink: ink / (n * n),
    offset,
    lineLength,
    hasStrokes: paths.some((p) => p.stroke),
    hasFills: paths.some((p) => !p.stroke && p.fill !== 'none'),
    hasPart: paths.some((p) => p.part === 'active'),
  };
}

const LINE_STYLES: StyleLock['style'][] = ['outline', 'duotone', 'schematic'];

/** Advice per icon id, comparing each icon with the rest of the set. */
export function checkSet(icons: IconItem[], style: StyleLock): Record<string, CheckId[]> {
  const measured = icons.filter((i) => i.svg).map((i) => ({ id: i.id, m: measure(i.svg!) }));
  const inks = measured.map((x) => x.m.ink).sort((a, b) => a - b);
  const median = inks[Math.floor(inks.length / 2)] ?? 0;
  const lineStyle = LINE_STYLES.includes(style.style);
  const out: Record<string, CheckId[]> = {};
  for (const { id, m } of measured) {
    const notes: CheckId[] = [];
    // Weight needs a few icons to compare against.
    if (measured.length >= 4 && median > 0) {
      if (m.ink > median * 1.5) notes.push('heavier');
      else if (m.ink < median * 0.6) notes.push('lighter');
    }
    if (m.offset > 1.5) notes.push('off-centre');
    if (m.lineLength > 95) notes.push('busy');
    if (lineStyle && m.hasFills && !m.hasStrokes) notes.push('not-line-art');
    if (style.parts && !m.hasPart) notes.push('no-state-part');
    if (notes.length) out[id] = notes;
  }
  return out;
}
