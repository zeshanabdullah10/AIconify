import { darken, luminance, onColor, safeHex } from './color';
import { parseSvg, placePaths, polyD, rectD, roundRectD, snapSvg, toSvg, type FillPath } from './paths';

/* ---------- boolean button states ---------- */

/** LabVIEW custom booleans take one picture per state, in this order in the Control Editor. */
export const BUTTON_STATES = ['false', 'true', 'false-to-true', 'true-to-false'] as const;
export type ButtonState = (typeof BUTTON_STATES)[number];

export const BUTTON_STATE_LABELS: Record<ButtonState, string> = {
  false: 'False',
  true: 'True',
  'false-to-true': 'False → True',
  'true-to-false': 'True → False',
};

const BUTTON = 48;

/** Recolour every fill of an icon to one colour. */
function mono(paths: FillPath[], fill: string): FillPath[] {
  return paths.map((p) => ({ ...p, fill }));
}

/**
 * One icon drawn as a push button in each boolean state. "True" fills the face with the brand
 * colour; the two transition states are the pressed look (darker face, glyph nudged down).
 */
export function buttonState(iconSvg: string, state: ButtonState, primary: string): string {
  const brand = safeHex(primary, '#1d1d1f');
  // A very light brand colour would vanish as a face; fall back to a darker shade of it.
  const face = luminance(brand) > 0.75 ? darken(brand, 0.45) : brand;
  const on = state === 'true' || state === 'true-to-false';
  const pressed = state === 'false-to-true' || state === 'true-to-false';
  const colors = on
    ? { border: darken(face, pressed ? 0.45 : 0.3), face: pressed ? darken(face, 0.18) : face }
    : { border: pressed ? '#8a8a8e' : '#a1a1a6', face: pressed ? '#dcdcdf' : '#f2f2f4' };
  const icon = placePaths(iconSvg, 28, 10, pressed ? 11 : 10);
  const glyph = on ? mono(icon, onColor(colors.face)) : icon;
  return toSvg(
    [
      { fill: colors.border, d: roundRectD(1, 1, BUTTON - 2, BUTTON - 2, 9) },
      { fill: colors.face, d: roundRectD(2.5, 2.5, BUTTON - 5, BUTTON - 5, 7.5) },
      ...glyph,
    ],
    BUTTON,
  );
}

/* ---------- HMI status variants (ISA-101 style) ---------- */

/**
 * High-performance HMI practice (ISA-101): equipment is drawn in muted greys when normal, and
 * colour is kept for conditions that need attention.
 */
export const STATUS = [
  { id: 'normal', label: 'Normal', color: null },
  { id: 'warning', label: 'Warning', color: '#e8a200' },
  { id: 'alarm', label: 'Alarm', color: '#d62d20' },
  { id: 'disabled', label: 'Disabled', color: '#c2c2c6' },
  { id: 'offline', label: 'Offline', color: '#8e8e93' },
] as const;
export type StatusId = (typeof STATUS)[number]['id'];

export function statusVariant(iconSvg: string, status: StatusId): string {
  const { width, height, paths } = parseSvg(iconSvg);
  const def = STATUS.find((s) => s.id === status)!;
  if (!def.color) return toSvg(paths, width, height);
  const out = mono(paths, def.color);
  if (status === 'offline') {
    // A diagonal bar, so "offline" still reads without relying on colour.
    const u = width / 24;
    out.push({ fill: '#ffffff', d: polyD([[3 * u, 1.5 * u], [22.5 * u, 21 * u], [21 * u, 22.5 * u], [1.5 * u, 3 * u]]) });
    out.push({ fill: def.color, d: polyD([[3 * u, 2.4 * u], [21.6 * u, 21 * u], [21 * u, 21.6 * u], [2.4 * u, 3 * u]]) });
  }
  return toSvg(out, width, height);
}

/* ---------- VI icons (32×32) ---------- */

// 3×5 pixel font for icon banners: crisp at 32 px, where no system font is. Five rows per glyph.
const FONT_ROWS: Record<string, string> = {
  A: '.#. #.# ### #.# #.#',
  B: '##. #.# ##. #.# ##.',
  C: '.## #.. #.. #.. .##',
  D: '##. #.# #.# #.# ##.',
  E: '### #.. ##. #.. ###',
  F: '### #.. ##. #.. #..',
  G: '.## #.. #.# #.# .##',
  H: '#.# #.# ### #.# #.#',
  I: '### .#. .#. .#. ###',
  J: '..# ..# ..# #.# .#.',
  K: '#.# #.# ##. #.# #.#',
  L: '#.. #.. #.. #.. ###',
  M: '#.# ### #.# #.# #.#',
  N: '##. #.# #.# #.# #.#',
  O: '### #.# #.# #.# ###',
  P: '##. #.# ##. #.. #..',
  Q: '.#. #.# #.# ### .##',
  R: '##. #.# ##. #.# #.#',
  S: '.## #.. .#. ..# ##.',
  T: '### .#. .#. .#. .#.',
  U: '#.# #.# #.# #.# ###',
  V: '#.# #.# #.# #.# .#.',
  W: '#.# #.# ### ### #.#',
  X: '#.# #.# .#. #.# #.#',
  Y: '#.# #.# .#. .#. .#.',
  Z: '### ..# .#. #.. ###',
  '0': '.#. #.# #.# #.# .#.',
  '1': '.#. ##. .#. .#. ###',
  '2': '##. ..# .#. #.. ###',
  '3': '##. ..# .#. ..# ##.',
  '4': '#.# #.# ### ..# ..#',
  '5': '### #.. ##. ..# ##.',
  '6': '.## #.. ### #.# ###',
  '7': '### ..# .#. .#. .#.',
  '8': '### #.# ### #.# ###',
  '9': '### #.# ### ..# ##.',
  '-': '... ... ### ... ...',
  '_': '... ... ... ... ###',
  '.': '... ... ... ... .#.',
  ' ': '... ... ... ... ...',
};
const FONT: Record<string, string> = Object.fromEntries(Object.entries(FONT_ROWS).map(([k, v]) => [k, v.replace(/ /g, '')]));


export const BANNER_MAX = 7;

export function bannerText(text: string): string {
  return text
    .toUpperCase()
    .split('')
    .filter((c) => c in FONT)
    .join('')
    .trim()
    .slice(0, BANNER_MAX)
    .trim();
}

/** Pixel-font text as one path of 1×1 squares, left edge at x, top at y. */
function textPath(text: string, x: number, y: number): string {
  const rects: string[] = [];
  [...text].forEach((ch, i) => {
    const bits = FONT[ch] ?? FONT[' '];
    for (let k = 0; k < 15; k++) if (bits[k] === '#') rects.push(rectD(x + i * 4 + (k % 3), y + Math.floor(k / 3), 1, 1));
  });
  return rects.join('');
}

export interface ViIconOptions {
  banner?: string;
  bannerColor?: string;
}

/**
 * A 32×32 VI icon in the usual LabVIEW layout: 1 px frame, optional library banner with a pixel
 * font, and the glyph snapped to the 32 px grid so its edges stay sharp.
 */
export function viIcon(iconSvg: string, opts: ViIconOptions = {}): string {
  const text = bannerText(opts.banner ?? '');
  const band = safeHex(opts.bannerColor, '#1d1d1f');
  const hasBanner = !!text || !!opts.bannerColor;
  const [gx, gy, gs] = hasBanner ? [6, 11, 20] : [3, 3, 26];
  const glyph = parseSvg(snapSvg(toSvg(placePaths(iconSvg, gs, gx, gy), 32), 32)).paths;
  const paths: FillPath[] = [
    { fill: '#1d1d1f', d: rectD(0, 0, 32, 32) },
    { fill: '#ffffff', d: rectD(1, 1, 30, 30) },
  ];
  if (hasBanner) {
    paths.push({ fill: band, d: rectD(1, 1, 30, 9) });
    if (text) paths.push({ fill: onColor(band), d: textPath(text, 1 + Math.floor((30 - (text.length * 4 - 1)) / 2), 3) });
  }
  return toSvg([...paths, ...glyph], 32);
}

/** The glyph alone on a transparent 32×32 canvas, for LabVIEW's Icon Editor glyph library. */
export function glyph(iconSvg: string): string {
  return snapSvg(toSvg(placePaths(iconSvg, 28, 2, 2), 32), 32);
}

/* ---------- import guide ---------- */

export function labviewGuide(opts: { buttons: boolean; viIcons: boolean; indicators: boolean; emf: boolean; states: boolean }): string {
  const lines = [
    '# Using these files in LabVIEW',
    '',
    'Classic LabVIEW does not import SVG. Use the PNG files (they keep transparency) or, on Windows, the EMF files, which stay sharp at any size.',
    '',
  ];
  if (opts.buttons)
    lines.push(
      '## Custom boolean buttons (`labview/buttons/`)',
      '',
      'Each icon has one picture per boolean state.',
      '',
      '1. Place a boolean (for example a Flat Square Button) on the front panel, right-click it and choose **Advanced » Customize…**.',
      '2. In the Control Editor, switch to **Customize Mode** (the wrench button).',
      '3. Right-click the button face and choose **Import from File…**, then pick `false.png`.',
      '4. Right-click again, open **Picture Item** and select the next picture. LabVIEW names them False, True, True to False and False to True; import the file with the matching name for each.',
      '5. Save the control as a `.ctl` and use it like any other control.',
      '',
    );
  if (opts.viIcons)
    lines.push(
      '## VI icons (`labview/vi-icons/`, `labview/glyphs/`)',
      '',
      '- `vi-icons/*.png` are finished 32×32 icons. Open the VI\'s Icon Editor and import or paste the image over the whole icon.',
      '- `glyphs/*.png` are the glyphs alone. Copy them into the `Glyphs` folder under your LabVIEW Data directory (usually `Documents\\LabVIEW Data\\Glyphs`) and they appear in the Icon Editor\'s glyph library.',
      '',
    );
  if (opts.indicators)
    lines.push(
      '## Indicators (`labview/indicators/`)',
      '',
      '- LEDs and lamps come as `-on` and `-off` pairs: customize a boolean indicator the same way as the buttons, using the off picture for False and the on picture for True.',
      '- Tank levels are numbered frames. Put them in a **Picture Ring** (right-click » Import Picture After) to show a level from a number.',
      '',
    );
  if (opts.states)
    lines.push(
      '## Status variants (`states/`)',
      '',
      'Normal, warning, alarm, disabled and offline versions of each icon, following high-performance HMI practice (ISA-101): grey when normal, colour only when something needs attention. Put them in a Picture Ring and drive it with the equipment state.',
      '',
    );
  if (opts.emf)
    lines.push(
      '## EMF vectors',
      '',
      'On Windows, drag an `.emf` file onto the front panel or import it as a decoration. It scales without blurring on high-DPI screens.',
      '',
    );
  lines.push('## High-DPI screens', '', 'LabVIEW does not rescale images, so `@1.5x` and `@2x` PNGs are included when selected. Use the size that matches your display scaling.', '');
  return lines.join('\n');
}
