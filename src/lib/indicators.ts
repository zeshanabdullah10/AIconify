import { darken, lighten, mix, safeHex } from './color';
import { ellipseD, rectD, roundRectD, toSvg, type FillPath } from './paths';

/**
 * Front-panel indicators drawn from plain shapes, so they need no AI call and match the palette
 * exactly. Everything is solid fills (no opacity) so the same drawing converts cleanly to EMF.
 */

export const INDICATOR_KINDS = [
  { id: 'round-led', label: 'Round LED' },
  { id: 'square-led', label: 'Square LED' },
  { id: 'pilot-lamp', label: 'Pilot lamp' },
  { id: 'tank', label: 'Tank level' },
] as const;
export type IndicatorKind = (typeof INDICATOR_KINDS)[number]['id'];

/** Common signal colours, offered next to the brand palette. */
export const SIGNAL_COLORS = [
  { role: 'Green', hex: '#2fb344' },
  { role: 'Red', hex: '#d62d20' },
  { role: 'Amber', hex: '#f0a202' },
  { role: 'Blue', hex: '#1c7ed6' },
];

/** Dim a colour the way an unlit lamp looks. */
const unlit = (hex: string) => mix(hex, '#3a3a3c', 0.72);

export const TANK_LEVELS = [0, 25, 50, 75, 100];

const S = 32;

function led(shape: 'round' | 'square', color: string, on: boolean): FillPath[] {
  const body = on ? color : unlit(color);
  const bezel = '#5a5a5e';
  const shade = darken(body, 0.25);
  const shine = on ? lighten(color, 0.6) : lighten(body, 0.18);
  if (shape === 'round') {
    return [
      { fill: bezel, d: ellipseD(16, 16, 14) },
      { fill: shade, d: ellipseD(16, 16, 11.5) },
      { fill: body, d: ellipseD(16, 15.2, 10.5) },
      { fill: shine, d: ellipseD(12.5, 11.5, 4, 2.8) },
    ];
  }
  return [
    { fill: bezel, d: roundRectD(2, 2, 28, 28, 5) },
    { fill: shade, d: roundRectD(4.5, 4.5, 23, 23, 3.5) },
    { fill: body, d: roundRectD(5, 5, 22, 21, 3) },
    { fill: shine, d: roundRectD(8, 7.5, 9, 3.5, 1.75) },
  ];
}

function lamp(color: string, on: boolean): FillPath[] {
  const body = on ? color : unlit(color);
  const paths: FillPath[] = [];
  // A lit lamp gets a soft halo ring so on/off reads even in greyscale.
  if (on) paths.push({ fill: lighten(color, 0.55), d: ellipseD(16, 16, 15.5) });
  paths.push(
    { fill: '#8e8e93', d: ellipseD(16, 16, 13.5) },
    { fill: '#48484a', d: ellipseD(16, 16, 11.5) },
    { fill: body, d: ellipseD(16, 16, 9.5) },
    { fill: on ? lighten(color, 0.7) : lighten(body, 0.2), d: ellipseD(13, 12.5, 3.2, 2.2) },
  );
  return paths;
}

function tank(color: string, level: number): FillPath[] {
  const inner = { x: 9, y: 4, w: 14, h: 24 };
  const h = (inner.h * Math.max(0, Math.min(100, level))) / 100;
  const paths: FillPath[] = [
    { fill: '#6e6e73', d: roundRectD(7, 2, 18, 28, 3) },
    { fill: '#f2f2f4', d: rectD(inner.x, inner.y, inner.w, inner.h) },
  ];
  if (h > 0) paths.push({ fill: color, d: rectD(inner.x, inner.y + inner.h - h, inner.w, h) });
  // Tick marks at each quarter, drawn last so they sit on top of the liquid.
  for (const q of [0.25, 0.5, 0.75]) paths.push({ fill: '#6e6e73', d: rectD(inner.x, inner.y + inner.h * (1 - q) - 0.5, 3, 1) });
  return paths;
}

export interface IndicatorFile {
  /** File name without extension, e.g. `round-led-green-on`. */
  name: string;
  svg: string;
}

function colorSlug(hex: string): string {
  return SIGNAL_COLORS.find((c) => c.hex === hex)?.role.toLowerCase() ?? hex.slice(1);
}

/** Every picture for one indicator kind in one colour: on/off pairs, or one frame per tank level. */
export function indicatorFiles(kind: IndicatorKind, colorHex: string): IndicatorFile[] {
  const color = safeHex(colorHex, '#2fb344');
  const slug = `${kind}-${colorSlug(color)}`;
  if (kind === 'tank') return TANK_LEVELS.map((l) => ({ name: `${slug}-${String(l).padStart(3, '0')}`, svg: toSvg(tank(color, l), S) }));
  const draw = (on: boolean) => (kind === 'pilot-lamp' ? lamp(color, on) : led(kind === 'round-led' ? 'round' : 'square', color, on));
  return [
    { name: `${slug}-off`, svg: toSvg(draw(false), S) },
    { name: `${slug}-on`, svg: toSvg(draw(true), S) },
  ];
}
