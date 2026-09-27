import { centerline, distanceTransform, simplify, thin } from './centerline';
import { parseD } from './paths';

const N = 240;

function mask(draw: (x: number, y: number) => boolean): Uint8Array {
  const m = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) m[y * N + x] = draw(x + 0.5, y + 0.5) ? 1 : 0;
  return m;
}
const bar = (x0: number, y0: number, x1: number, y1: number) => (x: number, y: number) => x >= x0 && x < x1 && y >= y0 && y < y1;
const subpaths = (d: string) => parseD(d).filter((s) => s.c === 'M').length;

describe('centerline tracing', () => {
  it('measures distance to the background', () => {
    const d = distanceTransform(mask(bar(100, 100, 140, 140)), N);
    expect(d[120 * N + 120]).toBeCloseTo(20.0, 0);
    expect(d[0]).toBe(0);
  });

  it('thins a thick bar to a one-pixel line', () => {
    const sk = thin(mask(bar(40, 110, 200, 130)), N);
    const rows = new Set<number>();
    for (let i = 0; i < N * N; i++) if (sk[i]) rows.add(Math.floor(i / N));
    expect(rows.size).toBeLessThanOrEqual(3);
  });

  it('traces a ring as one closed curve at the right width', () => {
    const ring = mask((x, y) => Math.abs(Math.hypot(x - 120, y - 120) - 80) <= 10);
    const r = centerline(ring, N)!;
    expect(r).not.toBeNull();
    expect(r.width).toBeCloseTo(2, 0); // 20 px of 240 = 2 units of 24
    expect(r.fit).toBeGreaterThan(0.85);
    expect(subpaths(r.d)).toBe(1);
    expect(r.d).toMatch(/Z$/);
    expect(r.d).toContain('C');
    // Every point sits near the ring's centreline (radius 8 units around 12,12).
    for (const s of parseD(r.d)) if (s.c === 'M' || s.c === 'L') expect(Math.abs(Math.hypot(s.p[0] - 12, s.p[1] - 12) - 8)).toBeLessThan(0.4);
  });

  it('traces an L as straight lines with a sharp corner', () => {
    const l = mask((x, y) => bar(40, 40, 60, 200)(x, y) || bar(40, 180, 200, 200)(x, y));
    const r = centerline(l, N)!;
    expect(subpaths(r.d)).toBe(1);
    expect(r.d).not.toContain('C');
    const pts = parseD(r.d).filter((s) => s.c !== 'Z').map((s) => (s as { p: number[] }).p);
    expect(pts.length).toBeLessThanOrEqual(4);
  });

  it('keeps a junction: a plus sign becomes lines meeting in the middle', () => {
    const plus = mask((x, y) => bar(110, 30, 130, 210)(x, y) || bar(30, 110, 210, 130)(x, y));
    const r = centerline(plus, N)!;
    expect(subpaths(r.d)).toBeGreaterThanOrEqual(2);
    expect(subpaths(r.d)).toBeLessThanOrEqual(4);
    // All four arms end at the centre (within half a pixel).
    const centre = parseD(r.d).filter((seg) => seg.c !== 'Z' && Math.hypot(seg.p[0] - 12, seg.p[1] - 12) < 0.1);
    expect(centre.length).toBe(4);
  });

  it('keeps short stubs (calendar tabs) and draws solid dots at their real size', () => {
    // A bar with a stub 2 units long, plus a solid dot 4 units across.
    const m = mask((x, y) => bar(30, 110, 210, 130)(x, y) || bar(110, 90, 130, 120)(x, y) || Math.hypot(x - 120, y - 190) < 20);
    const r = centerline(m, N)!;
    const ends = parseD(r.d).filter((seg) => seg.c !== 'Z' && seg.p[1] < 10.5);
    expect(ends.length).toBeGreaterThan(0); // the stub's free end, above the bar
    expect(r.dots).toHaveLength(1);
    expect(r.dots[0].r).toBeCloseTo(2, 0);
    expect(r.dots[0].y).toBeCloseTo(19, 0);
  });

  it('rejects solid shapes so they are traced as fills', () => {
    expect(centerline(mask((x, y) => Math.hypot(x - 120, y - 120) < 90), N)).toBeNull();
    expect(centerline(new Uint8Array(N * N), N)).toBeNull();
  });

  it('simplifies nearly straight runs to their ends', () => {
    expect(simplify([[0, 0], [5, 0.3], [10, 0]], 0.5)).toEqual([[0, 0], [10, 0]]);
  });
});
