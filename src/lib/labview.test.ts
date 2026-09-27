import { emfRecords, svgToEmf } from './emf';
import { indicatorFiles, TANK_LEVELS } from './indicators';
import { BUTTON_STATES, bannerText, buttonState, glyph, statusVariant, viIcon } from './labview';
import { ellipseD, parseD, parseSvg, snapD, transformD } from './paths';

const ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#1f4d3a" d="M2.3 2.2L21.6 2.4L21.7 21.8Q12 23 2.1 21.7Z"/></svg>';
const DUO = ICON.replace('</svg>', '<path fill="#6bbf59" d="M8 8L16 8L16 16L8 16Z"/></svg>');

describe('paths', () => {
  it('parses, repeats implicit commands and round-trips', () => {
    const segs = parseD('M1 2 3 4L5 6Q7 8 9 10C1 2 3 4 5 6Z');
    expect(segs.map((s) => s.c)).toEqual(['M', 'L', 'L', 'Q', 'C', 'Z']);
    expect(transformD('M1 2L3 4Z', 2, 10, 20)).toBe('M12 24L16 28Z');
  });

  it('rejects relative commands instead of drawing garbage', () => {
    expect(() => parseD('m1 2l3 4')).toThrow(/Relative/);
  });

  it('moves straight vertical and horizontal edges onto whole pixels', () => {
    // A 1.6-unit vertical stem and a horizontal bar, drawn off-grid.
    expect(snapD('M2.3 2.2L3.9 2.2L3.9 9.6L2.3 9.6Z', 1)).toBe('M2 2L4 2L4 10L2 10Z');
    // At 16 px the grid is 1.5 units.
    expect(snapD('M2.3 2.2L3.9 2.2L3.9 9.6L2.3 9.6Z', 1.5)).toBe('M3 1.5L4.5 1.5L4.5 9L3 9Z');
  });

  it('leaves curves and diagonals alone so thin strokes never pinch shut', () => {
    const diagonal = 'M2.3 2.2L9.7 9.4L10.6 9.1L3.2 1.9Z';
    expect(snapD(diagonal, 1)).toBe(diagonal);
    expect(snapD('M2.2 5L2.2 8Q5.5 9.5 8.8 8L8.8 5Z', 1)).toBe('M2 5L2 8Q5.5 9.5 9 8L9 5Z');
  });

  it('never collapses a stem to zero width', () => {
    for (let x = 0; x < 3; x += 0.13) {
      const snapped = parseD(snapD(`M${x} 0L${x + 1.1} 0L${x + 1.1} 10L${x} 10Z`, 1));
      const xs = snapped.flatMap((s) => (s.c === 'Z' ? [] : [s.p[0]]));
      expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('button states', () => {
  it('draws four distinct states, recolouring the glyph when the button is on', () => {
    const svgs = BUTTON_STATES.map((s) => buttonState(ICON, s, '#1f4d3a'));
    expect(new Set(svgs).size).toBe(4);
    for (const svg of svgs) expect(svg).toContain('viewBox="0 0 48 48"');
    // off: brand-coloured glyph on a light face; on: white glyph on a brand face
    expect(parseSvg(svgs[0]).paths.at(-1)!.fill).toBe('#1f4d3a');
    expect(parseSvg(svgs[1]).paths[1].fill).toBe('#1f4d3a');
    expect(parseSvg(svgs[1]).paths.at(-1)!.fill).toBe('#ffffff');
  });

  it('never puts an unvalidated colour into the markup', () => {
    expect(buttonState(ICON, 'true', '"/><script>alert(1)</script>')).not.toContain('script');
  });
});

describe('status variants', () => {
  it('keeps the icon for normal and recolours the rest', () => {
    expect(parseSvg(statusVariant(DUO, 'normal')).paths.map((p) => p.fill)).toEqual(['#1f4d3a', '#6bbf59']);
    expect(new Set(parseSvg(statusVariant(DUO, 'alarm')).paths.map((p) => p.fill))).toEqual(new Set(['#d62d20']));
    // offline adds a slash so it doesn't rely on colour alone
    expect(parseSvg(statusVariant(ICON, 'offline')).paths.length).toBeGreaterThan(parseSvg(ICON).paths.length);
  });
});

describe('VI icons', () => {
  it('cleans banner text down to what the pixel font can draw', () => {
    expect(bannerText('daq-mx <script>')).toBe('DAQ-MX');
    expect(bannerText('verylongname')).toHaveLength(7);
  });

  it('builds a 32×32 icon with a frame, banner and snapped glyph', () => {
    const svg = viIcon(ICON, { banner: 'DAQ', bannerColor: '#1f4d3a' });
    const { width, paths } = parseSvg(svg);
    expect(width).toBe(32);
    expect(paths[0].fill).toBe('#1d1d1f'); // frame
    expect(paths[2].fill).toBe('#1f4d3a'); // banner
    expect(paths[3].fill).toBe('#ffffff'); // text reads on a dark banner
    // the glyph's straight top edge and its left and right sides sit on whole pixels
    const [m, l] = parseD(paths[4].d) as { p: number[] }[];
    [...m.p, ...l.p].forEach((v) => expect(Number.isInteger(v)).toBe(true));
  });

  it('uses the whole body when there is no banner', () => {
    expect(parseSvg(viIcon(ICON)).paths).toHaveLength(3);
    expect(parseSvg(glyph(ICON)).paths).toHaveLength(1);
  });
});

describe('indicators', () => {
  it('makes on/off pairs and tank frames', () => {
    expect(indicatorFiles('round-led', '#2fb344').map((f) => f.name)).toEqual(['round-led-green-off', 'round-led-green-on']);
    expect(indicatorFiles('square-led', '#123456').map((f) => f.name)).toEqual(['square-led-123456-off', 'square-led-123456-on']);
    const [off, on] = indicatorFiles('pilot-lamp', '#d62d20');
    expect(off.svg).not.toBe(on.svg);
    const tanks = indicatorFiles('tank', '#1c7ed6');
    expect(tanks.map((t) => t.name)).toEqual(TANK_LEVELS.map((l) => `tank-blue-${String(l).padStart(3, '0')}`));
    // an empty tank has no liquid layer
    expect(tanks[0].svg).not.toContain('#1c7ed6');
    expect(tanks[4].svg).toContain('#1c7ed6');
  });
});

describe('EMF', () => {
  it('writes a well-formed metafile with one filled path per colour', () => {
    const svg = DUO.replace('</svg>', `<path fill="#000000" d="${ellipseD(12, 12, 3)}"/></svg>`);
    const bytes = svgToEmf(svg, 32);
    const records = emfRecords(bytes);
    const view = new DataView(bytes.buffer);
    expect(records[0]).toEqual({ type: 1, size: 108 });
    expect(view.getUint32(40, true)).toBe(0x464d4520); // " EMF"
    expect(view.getUint32(48, true)).toBe(bytes.length);
    expect(view.getUint32(52, true)).toBe(records.length);
    expect(records.at(-1)!.type).toBe(14); // EOF
    expect(records.filter((r) => r.type === 62)).toHaveLength(3); // FILLPATH
    expect(records.filter((r) => r.type === 39)).toHaveLength(3); // one brush per colour
    // Q and C both become cubic Béziers
    expect(records.filter((r) => r.type === 5).length).toBe(1 + 4);
  });
});
