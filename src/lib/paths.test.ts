import { emfRecords, svgToEmf } from './emf';
import { opticalSvg, parseSvg, snapStroke, snapSvg, toSvg, type FillPath } from './paths';
import { colorsOf, reactComponent, recolor, withCurrentColor } from './svg';

const LINE: FillPath = { fill: 'none', stroke: '#1f4d3a', width: 2, cap: 'round', d: 'M4.3 3L4.3 20L19.6 20' };
const SVG = toSvg([LINE, { fill: '#6bbf59', d: 'M8 8L16 8L16 16L8 16Z', part: 'active' }], 24);

describe('stroked paths and parts', () => {
  it('round-trips strokes, caps and the active part through SVG markup', () => {
    expect(SVG).toContain('fill="none" stroke="#1f4d3a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"');
    expect(SVG).toContain('class="active" fill="#6bbf59"');
    const { paths } = parseSvg(SVG);
    expect(paths[0]).toEqual(LINE);
    expect(paths[1]).toMatchObject({ fill: '#6bbf59', part: 'active' });
    expect(paths[1].stroke).toBeUndefined();
    const square = parseSvg(toSvg([{ ...LINE, cap: 'square' }], 24)).paths[0];
    expect(square.cap).toBe('square');
  });

  it('snaps strokes to whole-pixel widths with edges on pixel boundaries', () => {
    // 2 units at 24 px = 2 px (even): the centerline sits on a grid line.
    const even = snapStroke(LINE, 1);
    expect(even.width).toBe(2);
    expect(even.d).toBe('M4 3L4 20L19.6 20');
    // 1.4 units at 16 px (unit 1.5) = 1 px (odd): the centerline sits on a pixel centre.
    const odd = snapStroke({ ...LINE, width: 1.4 }, 1.5);
    expect(odd.width).toBe(1.5);
    expect(odd.d).toBe('M3.75 3L3.75 20.25L19.6 20.25');
    // Never thinner than one pixel.
    expect(snapStroke({ ...LINE, width: 0.2 }, 1).width).toBe(1);
    // snapSvg leaves the fill path to the fill snapper and keeps its part.
    expect(parseSvg(snapSvg(SVG, 24)).paths[1]).toMatchObject({ part: 'active', d: 'M8 8L16 8L16 16L8 16Z' });
  });

  it('thickens lines at small sizes and applies the weight', () => {
    const w = (svg: string) => parseSvg(svg).paths[0].width!;
    expect(w(opticalSvg(SVG, 24))).toBeCloseTo(2);
    expect(w(opticalSvg(SVG, 16))).toBeGreaterThan(2);
    expect(w(opticalSvg(SVG, 64))).toBeLessThan(2);
    expect(w(opticalSvg(SVG, 24, 1.5))).toBeCloseTo(3);
    const filled = toSvg([{ fill: '#000000', d: 'M0 0L1 0L1 1Z' }], 24);
    expect(opticalSvg(filled, 16)).toBe(filled);
  });

  it('writes strokes to EMF as filled outlines', () => {
    const types = emfRecords(svgToEmf(SVG, 32)).map((r) => r.type);
    expect(types.filter((t) => t === 8)).toHaveLength(2); // POLYPOLYGON for the line and the part
    expect(types).not.toContain(95); // no pens
    expect(types.at(-1)).toBe(14);
  });

  it('recolours and exports strokes like fills', () => {
    expect(colorsOf(SVG)).toEqual(['#1f4d3a', '#6bbf59']);
    expect(recolor(SVG, { '#1f4d3a': '#000000' })).toContain('stroke="#000000"');
    const mono = toSvg([LINE], 24);
    expect(withCurrentColor(mono)).toContain('stroke="currentColor"');
    const tsx = reactComponent('Pump', SVG);
    expect(tsx).toContain('strokeWidth="2"');
    expect(tsx).toContain('strokeLinecap="round"');
    expect(tsx).toContain('className="active"');
    expect(tsx).not.toContain('stroke-width');
  });
});
