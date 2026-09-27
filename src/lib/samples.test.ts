import { buttonState } from './labview';
import { parseSvg } from './paths';
import { SAMPLES, sampleSvg } from './samples';
import type { StyleLock } from './types';

const s: StyleLock = { style: 'outline', strokeWeight: 2, corners: 'rounded', colorMode: 'brand', primary: '#1f4d3a', accent: '#6bbf59' };

describe('style samples', () => {
  it('draws each style with a marked state part the button code can light up', () => {
    for (const style of ['outline', 'filled', 'duotone', 'badge', 'schematic', 'pixel'] as const) {
      const svg = sampleSvg(SAMPLES[0], style, s);
      const { paths } = parseSvg(svg);
      expect(paths.filter((p) => p.part === 'active')).toHaveLength(1);
      expect(buttonState(svg, 'true', { primary: s.primary, stateColor: '#2fb344' })).toContain('#2fb344');
    }
  });

  it('follows the line weight and corners', () => {
    const bold = parseSvg(sampleSvg(SAMPLES[1], 'outline', { ...s, weight: 'bold' })).paths.find((p) => p.stroke)!;
    expect(bold.width).toBeCloseTo(2.7);
    expect(bold.cap).toBe('round');
    expect(parseSvg(sampleSvg(SAMPLES[1], 'schematic', s)).paths.find((p) => p.stroke)!.cap).toBe('square');
    // Filled bodies are solid, and badge sits on a tile in the main colour.
    expect(parseSvg(sampleSvg(SAMPLES[0], 'filled', s)).paths[0]).toMatchObject({ fill: '#1f4d3a' });
    expect(parseSvg(sampleSvg(SAMPLES[0], 'badge', s)).paths[0]).toMatchObject({ fill: '#1f4d3a' });
  });
});
