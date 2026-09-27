import { mix } from './color';
import { WEIGHTS, ellipseD, polyD, roundRectD, toSvg, type FillPath } from './paths';
import { activeColor } from './prompts';
import type { IconStyle, StyleLock } from './types';

/**
 * Hand-drawn stand-ins for the set, used to preview a style before anything is generated. Each
 * has a body and a part that changes with state, like the icons the model is asked to draw.
 */
export interface Sample {
  name: string;
  /** Closed outline of the body, filled in the filled and duotone styles. */
  body: string;
  /** Extra line work that is never filled. */
  lines?: string;
  part: string;
}

export const SAMPLES: Sample[] = [
  { name: 'Pump', body: ellipseD(12, 12, 6.5), lines: 'M12 5.5L20 5.5M5 20.5L19 20.5', part: 'M12 9.5L12 14.5M9.5 12L14.5 12' },
  { name: 'Valve', body: polyD([[4, 9], [4, 17], [12, 13]]) + polyD([[20, 9], [20, 17], [12, 13]]), lines: 'M12 13L12 7', part: 'M8.5 5.5L15.5 5.5' },
  {
    name: 'Lamp',
    body: 'M8.8 16L8.8 13.5C6.9 12.3 6.3 10.6 6.5 8.8C6.9 5.8 9.3 3.5 12 3.5C14.7 3.5 17.1 5.8 17.5 8.8C17.7 10.6 17.1 12.3 15.2 13.5L15.2 16Z',
    lines: 'M9.5 19L14.5 19M10.5 21.5L13.5 21.5',
    part: 'M10.5 9.5L12 11.5L13.5 9.5',
  },
  { name: 'Start', body: ellipseD(12, 12, 8.5), part: polyD([[10, 8.5], [10, 15.5], [15.5, 12]]) },
];

/** A sample drawn in a style, as an SVG string the button and state code can use. */
export function sampleSvg(sample: Sample, style: IconStyle, s: StyleLock): string {
  const line = style === 'schematic' ? Math.min(s.strokeWeight, 1.5) : s.strokeWeight;
  const width = line * (['outline', 'duotone', 'schematic'].includes(style) ? WEIGHTS[s.weight ?? 'regular'] : 1);
  const cap: 'round' | 'square' = s.corners === 'rounded' && style !== 'schematic' && style !== 'pixel' ? 'round' : 'square';
  const part = activeColor({ ...s, style });
  const stroke = (d: string, color: string, extra: Partial<FillPath> = {}): FillPath => ({ fill: 'none', stroke: color, width, cap, d, ...extra });
  const paths: FillPath[] = [];
  const ink = style === 'badge' ? '#ffffff' : s.primary;
  if (style === 'badge') paths.push({ fill: s.primary, d: roundRectD(1, 1, 22, 22, s.corners === 'rounded' ? 5 : 1.5) });
  if (style === 'duotone') paths.push({ fill: mix(s.colorMode === 'brand' ? s.accent : s.primary, '#ffffff', 0.6), d: sample.body });
  if (style === 'filled') paths.push({ fill: s.primary, d: sample.body });
  if (style !== 'filled') paths.push(stroke(sample.body, ink));
  if (sample.lines) paths.push(stroke(sample.lines, ink));
  // On a filled body the part needs to stand out from the fill, so it is drawn light.
  const partColor = style === 'filled' && part === s.primary ? '#ffffff' : style === 'badge' && s.colorMode !== 'brand' ? '#ffffff' : part;
  paths.push(stroke(sample.part, partColor, { part: 'active' }));
  return toSvg(paths, 24);
}
