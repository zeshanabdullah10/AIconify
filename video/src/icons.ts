import { ellipseD, polyD, roundRectD } from '../../src/lib/paths';
import { SAMPLES, sampleSvg, type Sample } from '../../src/lib/samples';
import type { IconStyle, StyleLock } from '../../src/lib/types';

/**
 * A sixteen-icon industrial set, drawn in the same form as the app's style samples: a closed
 * body, extra line work, and the part that moves or lights up. Every picture in the film is
 * made from these by the app's own code.
 */
export const SET: Sample[] = [
  SAMPLES[0], // Pump
  SAMPLES[1], // Valve
  SAMPLES[2], // Lamp
  SAMPLES[3], // Start
  { name: 'Fan', body: ellipseD(12, 12, 8.5), part: 'M12 12L12 5.8M12 12L17.4 15.1M12 12L6.6 15.1' },
  { name: 'Motor', body: roundRectD(3, 7, 13, 10, 2), lines: 'M16 12L21 12M6 17L6 19.5M13 17L13 19.5', part: 'M6.5 12L8 10L10 14L11.5 12L13 12' },
  { name: 'Tank', body: roundRectD(5, 3, 14, 18, 3), part: 'M8 14Q10 12.5 12 14Q14 15.5 16 14' },
  { name: 'Heater', body: roundRectD(4, 4, 16, 16, 2.5), part: 'M8.5 16Q7 14 8.5 12Q10 10 8.5 8M12 16Q10.5 14 12 12Q13.5 10 12 8M15.5 16Q14 14 15.5 12Q17 10 15.5 8' },
  { name: 'Flow meter', body: ellipseD(12, 12, 6), lines: 'M2 12L6 12M18 12L22 12', part: 'M9 12L15 12M13 10L15 12L13 14' },
  { name: 'Gauge', body: ellipseD(12, 12, 8.5), lines: 'M6.6 15.4L7.9 14.6M17.4 15.4L16.1 14.6M12 5L12 6.5', part: 'M12 12.5L15.5 8.5' },
  {
    name: 'Thermometer',
    body: 'M10 14.2L10 5C10 3.9 10.9 3 12 3C13.1 3 14 3.9 14 5L14 14.2C15.2 14.9 16 16.2 16 17.5C16 19.7 14.2 21.5 12 21.5C9.8 21.5 8 19.7 8 17.5C8 16.2 8.8 14.9 10 14.2Z',
    part: 'M12 17.5L12 8.5',
  },
  { name: 'Alarm', body: 'M6.5 16.5L6.5 11C6.5 8 9 5.5 12 5.5C15 5.5 17.5 8 17.5 11L17.5 16.5L19 18.5L5 18.5Z', lines: 'M10.5 21L13.5 21', part: 'M3.5 8.5Q4 6 6 4.3M20.5 8.5Q20 6 18 4.3' },
  { name: 'Stop', body: polyD([[8.3, 3], [15.7, 3], [21, 8.3], [21, 15.7], [15.7, 21], [8.3, 21], [3, 15.7], [3, 8.3]]), part: 'M8.5 12L15.5 12' },
  { name: 'Trend', body: roundRectD(3, 4, 18, 16, 2), part: 'M6.5 16L10 11.5L13 14L17.5 8.5' },
  { name: 'Settings', body: ellipseD(12, 12, 6.5), lines: 'M12 2.5L12 5.5M12 18.5L12 21.5M2.5 12L5.5 12M18.5 12L21.5 12M5.3 5.3L7.4 7.4M16.6 16.6L18.7 18.7M5.3 18.7L7.4 16.6M16.6 7.4L18.7 5.3', part: ellipseD(12, 12, 2.3) },
  {
    name: 'Log data',
    body: 'M5 6C5 4.3 8.1 3 12 3C15.9 3 19 4.3 19 6L19 18C19 19.7 15.9 21 12 21C8.1 21 5 19.7 5 18Z',
    lines: 'M5 6C5 7.7 8.1 9 12 9C15.9 9 19 7.7 19 6',
    part: 'M5 12C5 13.7 8.1 15 12 15C15.9 15 19 13.7 19 12',
  },
];

export const BRAND = { name: 'Fernleaf Instruments', primary: '#1f4d3a', accent: '#5fbf4a' };

export const LOOK: StyleLock = { style: 'outline', strokeWeight: 2, corners: 'rounded', colorMode: 'brand', primary: BRAND.primary, accent: BRAND.accent, parts: true };

export function iconSvg(i: number, style: IconStyle = 'outline', patch: Partial<StyleLock> = {}): string {
  return sampleSvg(SET[i % SET.length], style, { ...LOOK, style, ...patch });
}

export const byName = (name: string) => SET.findIndex((s) => s.name === name);
