import { ellipseD, rectD, toSvg } from './paths';
import { checkSet, coverage, measure } from './quality';
import type { IconItem, StyleLock } from './types';

const style: StyleLock = { style: 'outline', strokeWeight: 2, corners: 'rounded', colorMode: 'mono', primary: '#1d1d1f', accent: '#0071e3' };
const ring = (r: number, cx = 12, cy = 12) => toSvg([{ fill: 'none', stroke: '#1d1d1f', width: 2, cap: 'round', d: ellipseD(cx, cy, r) }], 24);
const icon = (id: string, svg: string): IconItem => ({ id, name: id, status: 'draft', svg, flags: [], history: [] });

describe('quality checks', () => {
  it('measures filled and stroked ink', () => {
    const square = toSvg([{ fill: '#000000', d: rectD(6, 6, 12, 12) }], 24);
    expect(measure(square).ink).toBeCloseTo(0.25, 1);
    // A ring of radius 8, 2 wide: area ≈ 2π·8·2 ≈ 100 of 576.
    expect(measure(ring(8)).ink).toBeCloseTo(100 / 576, 1);
    expect(measure(ring(8)).lineLength).toBeCloseTo(2 * Math.PI * 8, 0);
    // A hole stays empty (even-odd).
    const donut = coverage([{ fill: '#000', d: rectD(0, 0, 24, 24) + rectD(6, 6, 12, 12) }], 24, 24);
    expect(donut[12 * 24 + 12]).toBe(0);
    expect(donut[1 * 24 + 1]).toBe(1);
  });

  it('flags icons that are much heavier, lighter or off-centre than the set', () => {
    const icons = [icon('a', ring(8)), icon('b', ring(7.5)), icon('c', ring(8.5)), icon('d', ring(8)), icon('solid', toSvg([{ fill: '#1d1d1f', d: ellipseD(12, 12, 9) }], 24)), icon('tiny', ring(3)), icon('left', ring(5, 6, 12))];
    const out = checkSet(icons, style);
    expect(out.a).toBeUndefined();
    expect(out.solid).toEqual(expect.arrayContaining(['heavier', 'not-line-art']));
    expect(out.tiny).toContain('lighter');
    expect(out.left).toContain('off-centre');
  });

  it('notes missing state parts only when parts are on', () => {
    const icons = [icon('a', ring(8))];
    expect(checkSet(icons, style).a).toBeUndefined();
    expect(checkSet(icons, { ...style, parts: true }).a).toEqual(['no-state-part']);
    const withPart = toSvg([{ fill: 'none', stroke: '#1d1d1f', width: 2, cap: 'round', d: ellipseD(12, 12, 8), part: 'active' }], 24);
    expect(checkSet([icon('p', withPart)], { ...style, parts: true }).p).toBeUndefined();
  });
});
