import { emfRecords, emfToSvg, flattenPath, strokeOutline, svgToEmf } from './emf';
import { indicatorFiles } from './indicators';
import { BUTTON_SKINS, buttonState, glyph, statusVariant, viIcon } from './labview';
import { parseSvg, toSvg, type FillPath } from './paths';
import { SAMPLES, sampleSvg } from './samples';
import type { StyleLock } from './types';

type Pt = [number, number];
const N = 48;

/** Winding number of (x, y) against a polygon. */
function winding(x: number, y: number, poly: Pt[]): number {
  let w = 0;
  for (let i = 0; i < poly.length; i++) {
    const [a, b] = [poly[i], poly[(i + 1) % poly.length]];
    if (a[1] <= y) {
      if (b[1] > y && (b[0] - a[0]) * (y - a[1]) - (x - a[0]) * (b[1] - a[1]) > 0) w++;
    } else if (b[1] <= y && (b[0] - a[0]) * (y - a[1]) - (x - a[0]) * (b[1] - a[1]) < 0) w--;
  }
  return w;
}

function segDist([x, y]: Pt, a: Pt, b: Pt): number {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)) : 0;
  return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
}

/**
 * The picture as a grid of colours, painted in order. Strokes in the source are measured without
 * the EMF code: round lines by distance to the centreline, square ones as rectangles whose open
 * ends reach half the width past the end points.
 */
function paint(paths: FillPath[], width: number, height: number, fromSource: boolean): string[] {
  const out = new Array<string>(N * N).fill('');
  for (const p of paths) {
    const color = (p.stroke ?? p.fill).toLowerCase();
    const lines = flattenPath(p.d);
    const r = (p.width ?? 1) / 2;
    const square = p.cap === 'square';
    const segs = lines.flatMap(({ pts, closed }) => {
      if (pts.length === 1) return [[pts[0], pts[0]] as [Pt, Pt]];
      const list = pts.slice(0, closed ? pts.length : -1).map((q, i) => [q, pts[(i + 1) % pts.length]] as [Pt, Pt]);
      if (square && !closed) {
        const ext = ([a, b]: [Pt, Pt], atStart: boolean): [Pt, Pt] => {
          const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
          const [dx, dy] = [((b[0] - a[0]) / l) * r, ((b[1] - a[1]) / l) * r];
          return atStart ? [[a[0] - dx, a[1] - dy], b] : [a, [b[0] + dx, b[1] + dy]];
        };
        list[0] = ext(list[0], true);
        list[list.length - 1] = ext(list[list.length - 1], false);
      }
      return list;
    });
    const inRect = ([x, y]: Pt, [a, b]: [Pt, Pt]) => {
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const [ux, uy] = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
      const along = (x - a[0]) * ux + (y - a[1]) * uy;
      return along >= 0 && along <= l && Math.abs(-(x - a[0]) * uy + (y - a[1]) * ux) <= r;
    };
    const polys = lines.map((l) => l.pts);
    const boxes = polys.map((poly) => [Math.min(...poly.map((q) => q[0])), Math.min(...poly.map((q) => q[1])), Math.max(...poly.map((q) => q[0])), Math.max(...poly.map((q) => q[1]))]);
    // The source is SVG (nonzero rule). The EMF is read with the even-odd rule, the stricter of
    // the two: some players use it whatever the file asks for.
    const inside = (w: number) => (fromSource ? w !== 0 : w % 2 === 1);
    for (let gy = 0; gy < N; gy++)
      for (let gx = 0; gx < N; gx++) {
        // Sample just off the cell centres, so no sample sits exactly on an edge drawn on a quarter-unit grid.
        const c: Pt = [((gx + 0.5371) * width) / N, ((gy + 0.4629) * height) / N];
        const hit =
          fromSource && p.stroke
            ? segs.some((sg) => (square ? inRect(c, sg) : segDist(c, sg[0], sg[1]) <= r))
            : inside(polys.reduce((w, poly, k) => (c[0] < boxes[k][0] || c[0] > boxes[k][2] || c[1] < boxes[k][1] || c[1] > boxes[k][3] ? w : w + (fromSource ? winding(c[0], c[1], poly) : Math.abs(winding(c[0], c[1], poly)))), 0));
        if (hit) out[gy * N + gx] = color;
      }
  }
  return out;
}

/** Share of inked cells where the SVG and its EMF agree on the colour. */
function agreement(svg: string): number {
  const src = parseSvg(svg);
  const back = parseSvg(emfToSvg(svgToEmf(svg, 48)));
  const a = paint(src.paths, src.width, src.height, true);
  const b = paint(back.paths, back.width, back.height, false);
  let inked = 0;
  let same = 0;
  for (let i = 0; i < a.length; i++) {
    if (!a[i] && !b[i]) continue;
    inked++;
    if (a[i] === b[i]) same++;
  }
  return same / inked;
}

const s: StyleLock = { style: 'outline', strokeWeight: 2, corners: 'rounded', colorMode: 'brand', primary: '#1f4d3a', accent: '#6bbf59' };
const icon = sampleSvg(SAMPLES[0], 'outline', s);

describe('EMF', () => {
  it('writes a well-formed metafile of filled polygons only', () => {
    const bytes = svgToEmf(icon, 32);
    const records = emfRecords(bytes);
    const view = new DataView(bytes.buffer);
    expect(records[0]).toEqual({ type: 1, size: 108 });
    expect(view.getUint32(40, true)).toBe(0x464d4520); // " EMF"
    expect(view.getUint32(48, true)).toBe(bytes.length);
    expect(view.getUint32(52, true)).toBe(records.length);
    expect(records.at(-1)!.type).toBe(14); // EOF
    const types = new Set(records.map((r) => r.type));
    // No paths, pens or Béziers: only what every EMF player draws the same way.
    for (const t of [59, 60, 62, 64, 5, 95]) expect(types.has(t)).toBe(false);
    expect(records.filter((r) => r.type === 8)).toHaveLength(parseSvg(icon).paths.length); // POLYPOLYGON
  });

  it('gives every polygon record real bounds inside the picture', () => {
    const bytes = svgToEmf(icon, 48);
    const view = new DataView(bytes.buffer);
    for (let at = 0; at < bytes.length; ) {
      const type = view.getUint32(at, true);
      if (type === 8) {
        const [l, t, r, b] = [0, 1, 2, 3].map((k) => view.getInt32(at + 8 + k * 4, true));
        expect(r).toBeGreaterThan(l);
        expect(b).toBeGreaterThan(t);
        expect(l).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(47);
      }
      at += view.getUint32(at + 4, true);
    }
  });

  it('expands strokes into outlines that cover the line and nothing more', () => {
    const polys = strokeOutline('M4 12L20 12', 2, 'round');
    const inside = (x: number, y: number) => polys.reduce((w, p) => w + winding(x, y, p), 0) !== 0;
    expect(inside(12, 12.9)).toBe(true);
    expect(inside(12, 13.1)).toBe(false);
    expect(inside(3.2, 12)).toBe(true); // round cap
    expect(inside(2.9, 12)).toBe(false);
    const sq = strokeOutline('M4 12L20 12', 2, 'square');
    const inSq = (x: number, y: number) => sq.reduce((w, p) => w + winding(x, y, p), 0) !== 0;
    expect(inSq(3.1, 12.9)).toBe(true); // square cap reaches the corner
    // A closed square keeps its hole.
    const ring = strokeOutline('M4 4L20 4L20 20L4 20Z', 2, 'square');
    const inRing = (x: number, y: number) => ring.reduce((w, p) => w + winding(x, y, p), 0) !== 0;
    expect(inRing(12, 12)).toBe(false);
    expect(inRing(3.2, 3.2)).toBe(true); // mitred corner
  });

  it('draws the same picture as the SVG for icons, buttons, states, VI icons and indicators', { timeout: 60_000 }, () => {
    const cases: [string, string][] = [];
    for (const style of ['outline', 'filled', 'duotone', 'badge', 'schematic'] as const) for (const sm of SAMPLES.slice(0, 2)) cases.push([`${style} ${sm.name}`, sampleSvg(sm, style, s)]);
    for (const k of BUTTON_SKINS) for (const st of ['false', 'true'] as const) cases.push([`${k.id} ${st}`, buttonState(icon, st, { skin: k.id, primary: s.primary })]);
    cases.push(['wide', buttonState(icon, 'true', { skin: 'flat', shape: 'wide', primary: s.primary })]);
    for (const st of ['on', 'alarm', 'manual', 'offline'] as const) cases.push([st, statusVariant(icon, st)]);
    cases.push(['vi', viIcon(icon, { banner: 'DAQ', bannerColor: '#2f9e44' })], ['glyph', glyph(icon)]);
    cases.push(['led', indicatorFiles('round-led', '#2fb344')[1].svg]);
    for (const [name, svg] of cases) {
      // Differences left are single cells on an edge (EMF stores coordinates to 1/100 of a unit),
      // plus, for square schematic lines, the mitred corner tips the reference leaves out.
      expect(agreement(svg), name).toBeGreaterThan(name.startsWith('schematic') ? 0.95 : 0.97);
    }
  });

  it('keeps fills with holes as holes', () => {
    const donut = toSvg([{ fill: '#000000', d: 'M2 2L22 2L22 22L2 22ZM8 8L8 16L16 16L16 8Z' }], 24);
    expect(agreement(donut)).toBeGreaterThan(0.99);
  });
});
