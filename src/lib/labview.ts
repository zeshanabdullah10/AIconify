import { darken, isHex, luminance, mix, onColor, safeHex } from './color';
import { colorOf, ellipseD, paint, parseSvg, placePaths, polyD, rectD, roundRectD, snapSvg, toSvg, type FillPath } from './paths';

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

export const BUTTON_SKINS = [
  { id: 'isa', label: 'ISA-101', hint: 'Flat grey button; a bar underneath shows the state' },
  { id: 'flat', label: 'Modern', hint: 'Light face; true gets a tinted face and a coloured outline' },
  { id: 'classic', label: 'Classic', hint: 'Bevelled system button that stays pressed in when true' },
  { id: 'toggle', label: 'Toggle', hint: 'A switch, with the icon on its knob' },
] as const;
export type ButtonSkin = (typeof BUTTON_SKINS)[number]['id'];
export type ButtonShape = 'square' | 'wide';

export interface ButtonOptions {
  skin?: ButtonSkin;
  /** Wide buttons leave room on the right for LabVIEW's own Boolean text. */
  shape?: ButtonShape;
  /** Brand colour, for the glyph on light faces. */
  primary: string;
  /** Colour that shows "true". Defaults to near-black for ISA-101 and the brand colour otherwise. */
  stateColor?: string;
}

/** Drawing size of a button in its own units (square buttons are 48×48). */
export function buttonBox(shape: ButtonShape = 'square'): [number, number] {
  return shape === 'wide' ? [112, 40] : [48, 48];
}

/** The icon placed at `size`, body in one colour and its active part in another. */
function glyphAt(iconSvg: string, size: number, x: number, y: number, body: string, active: string, wholeWhenNoPart = false): FillPath[] {
  const paths = placePaths(iconSvg, size, x, y);
  const hasPart = paths.some((p) => p.part === 'active');
  return paths.map((p) => paint(p, p.part === 'active' || (!hasPart && wholeWhenNoPart) ? active : body));
}

/**
 * One icon drawn as a boolean button in one state. True is shown the way the skin's real
 * counterpart shows it (an indicator bar, a tinted face, a pressed-in bevel, a switch position),
 * and only the icon's active part lights up, not the whole glyph.
 */
export function buttonState(iconSvg: string, state: ButtonState, opts: ButtonOptions): string {
  const skin = opts.skin ?? 'isa';
  const [w, h] = buttonBox(opts.shape);
  const wide = opts.shape === 'wide';
  const brand = safeHex(opts.primary, '#1d1d1f');
  let on = safeHex(opts.stateColor, skin === 'isa' ? '#1d1d1f' : brand);
  // A very light state colour would vanish on a light face.
  if (luminance(on) > 0.7) on = darken(on, 0.4);
  const isOn = state === 'true' || state === 'true-to-false';
  const pressed = state === 'false-to-true' || state === 'true-to-false';
  const off = '#aeaeb2';
  const paths: FillPath[] = [];

  if (skin === 'toggle') {
    const [tx, tw] = wide ? [58, 46] : [4, 40];
    const ty = (h - 22) / 2;
    paths.push({ fill: isOn ? on : '#d1d1d6', d: roundRectD(tx, ty, tw, 22, 11) });
    // Pressed knobs stretch towards the side they are moving to, like a real switch under a thumb.
    const r = 9.5;
    const left = tx + 11;
    const right = tx + tw - 11;
    const cx = isOn ? right : left;
    const stretch = pressed ? 2.5 : 0;
    const kx = cx + (isOn ? -stretch / 2 : stretch / 2);
    paths.push({ fill: '#b0b0b5', d: ellipseD(kx, h / 2, r + 0.75 + stretch / 2, r + 0.75) });
    paths.push({ fill: '#ffffff', d: ellipseD(kx, h / 2, r + stretch / 2, r) });
    paths.push(...glyphAt(iconSvg, 13, kx - 6.5, h / 2 - 6.5, '#3a3a3c', isOn ? on : off));
    if (wide) paths.push(...glyphAt(iconSvg, 24, 12, 8, brand, isOn ? on : off));
    return toSvg(paths, w, h);
  }

  const [gs, gx, gy] = wide ? [24, 10, 8] : skin === 'isa' ? [26, 11, 7] : [28, 10, 10];
  const dy = pressed ? 1 : 0;

  if (skin === 'isa') {
    paths.push({ fill: '#8e8e93', d: roundRectD(0.5, 0.5, w - 1, h - 1, 4) });
    paths.push({ fill: pressed ? '#c9c9cc' : '#dcdcde', d: roundRectD(1.5, 1.5, w - 3, h - 3, 3) });
    paths.push(...glyphAt(iconSvg, gs, gx, gy + dy, '#3a3a3c', isOn ? on : off));
    // The state bar: a quiet grey when false, the state colour when true.
    const bar = wide ? { x: w - 10, y: 8, w: 3, h: h - 16 } : { x: 10, y: h - 8, w: w - 20, h: 3 };
    paths.push({ fill: isOn ? on : '#b8b8bc', d: roundRectD(bar.x, bar.y, bar.w, bar.h, 1.5) });
  } else if (skin === 'flat') {
    const face = isOn ? mix(on, '#ffffff', pressed ? 0.74 : 0.86) : pressed ? '#ececef' : '#ffffff';
    paths.push({ fill: isOn ? on : '#c7c7cc', d: roundRectD(1, 1, w - 2, h - 2, 9) });
    const inset = isOn ? 2.5 : 2;
    paths.push({ fill: face, d: roundRectD(inset, inset, w - inset * 2, h - inset * 2, 9 - inset + 1) });
    paths.push(...glyphAt(iconSvg, gs, gx, gy + dy, brand, isOn ? on : off, isOn));
  } else {
    // Classic bevel: a dark rim, then light and shadow strips; sunken when true or pressed.
    const sunken = isOn || pressed;
    const [lit, shade] = sunken ? ['#8a8a8e', '#ffffff'] : ['#ffffff', '#8a8a8e'];
    paths.push({ fill: '#3a3a3c', d: roundRectD(0, 0, w, h, 2) });
    paths.push({ fill: shade, d: rectD(1, 1, w - 2, h - 2) });
    paths.push({ fill: lit, d: rectD(1, 1, w - 3.5, h - 3.5) });
    // A button under the pointer is pushed in further than one latched true.
    paths.push({ fill: pressed ? '#bebec1' : sunken ? '#c8c8ca' : '#d4d4d6', d: rectD(2.5, 2.5, w - 5, h - 5) });
    const glow = isOn ? on : pressed ? mix(on, '#8a8a8e', 0.5) : off;
    paths.push(...glyphAt(iconSvg, gs, gx + (sunken ? 1 : 0), gy + (sunken ? 1 : 0), '#1d1d1f', glow, isOn));
  }
  return toSvg(paths, w, h);
}

/* ---------- equipment states (ISA-101 style) ---------- */

/**
 * High-performance HMI practice (ISA-101): equipment stays grey and calm, and state is shown by
 * the part that changes (the impeller of a running pump fills in) or by a small badge whose
 * shape, not only its colour, says what is wrong. The icon itself is never repainted red.
 */
export const STATUS = [
  { id: 'normal', label: 'Normal' },
  { id: 'on', label: 'On' },
  { id: 'off', label: 'Off' },
  { id: 'warning', label: 'Warning' },
  { id: 'alarm', label: 'Alarm' },
  { id: 'manual', label: 'Manual' },
  { id: 'disabled', label: 'Disabled' },
  { id: 'offline', label: 'Offline' },
] as const;
export type StatusId = (typeof STATUS)[number]['id'];

const WARNING = '#e8a200';
const ALARM = '#d62d20';
const MANUAL = '#2f6fd6';
const RIM = '#1d1d1f';

/** An exclamation mark centred on (x, y), `s` units per 24-unit icon. */
function bang(x: number, y: number, s: number, fill: string): FillPath[] {
  return [
    { fill, d: rectD(x - 0.65 * s, y - 3.3 * s, 1.3 * s, 3.8 * s) },
    { fill, d: rectD(x - 0.65 * s, y + 1.2 * s, 1.3 * s, 1.3 * s) },
  ];
}

/** A 5×5 pixel "M": the 3-wide banner font's M reads as an H at badge size. */
function bigM(cx: number, cy: number, s: number): string {
  const rows = ['#...#', '##.##', '#.#.#', '#...#', '#...#'];
  const out: string[] = [];
  rows.forEach((row, y) => [...row].forEach((c, x) => c === '#' && out.push(rectD(cx + (x - 2.5) * s, cy + (y - 2.5) * s, s, s))));
  return out.join('');
}

function badge(status: StatusId, u: number, onColorHex: string): FillPath[] {
  const [cx, cy] = [19 * u, 18.5 * u];
  const shape = (pts: [number, number][], grow: number) => polyD(pts.map(([x, y]) => [cx + x * grow * u, cy + y * grow * u]));
  if (status === 'warning') {
    const tri: [number, number][] = [[0, -5.3], [5.3, 4], [-5.3, 4]];
    return [{ fill: RIM, d: shape(tri, 1.2) }, { fill: WARNING, d: shape(tri, 1) }, ...bang(cx, cy + 0.6 * u, u, RIM)];
  }
  if (status === 'alarm') {
    const dia: [number, number][] = [[0, -5], [5, 0], [0, 5], [-5, 0]];
    return [{ fill: RIM, d: shape(dia, 1.2) }, { fill: ALARM, d: shape(dia, 1) }, ...bang(cx, cy, 0.85 * u, '#ffffff')];
  }
  if (status === 'manual') {
    return [
      { fill: RIM, d: roundRectD(cx - 5 * u, cy - 5 * u, 10 * u, 10 * u, 2 * u) },
      { fill: MANUAL, d: roundRectD(cx - 4.2 * u, cy - 4.2 * u, 8.4 * u, 8.4 * u, 1.5 * u) },
      { fill: '#ffffff', d: bigM(cx, cy, 1.1 * u) },
    ];
  }
  // "On" for an icon without an active part: a small lit dot, top right.
  return [{ fill: RIM, d: ellipseD(20 * u, 4 * u, 3.6 * u) }, { fill: onColorHex, d: ellipseD(20 * u, 4 * u, 2.8 * u) }];
}

export function statusVariant(iconSvg: string, status: StatusId, opts: { onColor?: string } = {}): string {
  const { width, height, paths } = parseSvg(iconSvg);
  const u = width / 24;
  const on = safeHex(opts.onColor, '#2fb344');
  const hasPart = paths.some((p) => p.part === 'active');
  // Normal shows the equipment at rest in one colour, so only "on" has a coloured part.
  const bodyColor = colorOf(paths.find((p) => p.part !== 'active') ?? paths[0] ?? { fill: '#4d4d4d', d: '' });
  let out = status === 'normal' ? paths.map((p) => (p.part === 'active' ? paint(p, bodyColor) : p)) : paths;
  if (status === 'on') out = hasPart ? paths.map((p) => (p.part === 'active' ? paint(p, on) : p)) : [...paths, ...badge('on', u, on)];
  if (status === 'off') out = paths.map((p) => (p.part === 'active' ? paint(p, '#c7c7cc') : p));
  if (status === 'warning' || status === 'alarm' || status === 'manual') out = [...paths, ...badge(status, u, on)];
  if (status === 'disabled') out = paths.map((p) => paint(p, isHex(colorOf(p)) ? mix(colorOf(p), '#f2f2f4', 0.65) : '#c2c2c6'));
  if (status === 'offline') {
    out = paths.map((p) => paint(p, '#8e8e93'));
    // A diagonal bar, so "offline" still reads without relying on colour.
    out.push({ fill: '#ffffff', d: polyD([[3 * u, 1.5 * u], [22.5 * u, 21 * u], [21 * u, 22.5 * u], [1.5 * u, 3 * u]]) });
    out.push({ fill: '#8e8e93', d: polyD([[3 * u, 2.4 * u], [21.6 * u, 21 * u], [21 * u, 21.6 * u], [2.4 * u, 3 * u]]) });
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
  Q: '### #.# #.# ##. ..#',
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

/** Pixel-font text as one path of squares `s` units wide, left edge at x, top at y. */
function textPath(text: string, x: number, y: number, s = 1): string {
  const rects: string[] = [];
  [...text].forEach((ch, i) => {
    const bits = FONT[ch] ?? FONT[' '];
    for (let k = 0; k < 15; k++) if (bits[k] === '#') rects.push(rectD(x + (i * 4 + (k % 3)) * s, y + Math.floor(k / 3) * s, s, s));
  });
  return rects.join('');
}

export interface ViIconOptions {
  banner?: string;
  bannerColor?: string;
  /** The icon is 32×32 pixel art: use it at its own size inside the frame, never rescaled. */
  pixel?: boolean;
}

/**
 * A 32×32 VI icon in the usual LabVIEW layout: 1 px frame, optional library banner with a pixel
 * font, and the glyph snapped to the 32 px grid so its edges stay sharp.
 */
export function viIcon(iconSvg: string, opts: ViIconOptions = {}): string {
  if (opts.pixel) {
    // Pixel art already fills the 32 grid with a 2-pixel margin; a banner would force a rescale.
    const frame: FillPath[] = [
      { fill: '#1d1d1f', d: rectD(0, 0, 32, 32) },
      { fill: '#ffffff', d: rectD(1, 1, 30, 30) },
    ];
    return toSvg([...frame, ...placePaths(iconSvg, 32, 0, 0)], 32);
  }
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
export function glyph(iconSvg: string, pixel = false): string {
  if (pixel) return toSvg(placePaths(iconSvg, 32, 0, 0), 32);
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
      '3. Right-click the button face and choose **Import from File…**, then pick `false.emf` (or `false.png`).',
      '4. Right-click again, open **Picture Item** and select the next picture. LabVIEW names them False, True, True to False and False to True; import the file with the matching name for each.',
      '5. Save the control as a `.ctl` and use it like any other control.',
      '',
      'Wide buttons leave the right side free: turn on **Visible Items » Boolean Text** and LabVIEW draws your label there in its own font, so it stays sharp and translatable.',
      '',
    );
  if (opts.viIcons)
    lines.push(
      '## VI icons (`labview/vi-icons/`, `labview/glyphs/`)',
      '',
      '- `vi-icons/*.png` are finished 32×32 icons. Open the VI\'s Icon Editor and import or paste the image over the whole icon.',
      '- The `.emf` next to each PNG is the same picture as a vector, for places where LabVIEW scales it.',
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
      'One version of each icon per equipment state, following high-performance HMI practice (ISA-101): the icon stays calm and only what changed stands out.',
      '',
      '- `on` / `off`: only the moving or glowing part (impeller, valve disc, lamp) changes. Icons without such a part get a small lit dot for `on`.',
      '- `warning` (triangle), `alarm` (diamond) and `manual` (M): a badge in the corner. The shape tells them apart without relying on colour.',
      '- `disabled` and `offline`: greyed out, offline with a slash.',
      '',
      'SVG and EMF files sit in `states/<state>/`, PNGs in `states/<state>/<size>/`. Put one icon\'s states in a **Picture Ring** and drive it with the equipment state.',
      '',
    );
  if (opts.emf)
    lines.push(
      '## EMF vectors',
      '',
      'Every picture above also comes as an `.emf` next to its PNG: icons in `emf/`, button states, VI icons and glyphs, states and indicators. On Windows, import one with **Import from File…** or drag it onto the front panel; it scales without blurring on high-DPI screens.',
      '',
      'The EMFs use only solid colours and filled polygons (lines are converted to outlines), the subset every Windows EMF player draws the same way. They carry no transparency information beyond what is not drawn, so the background shows through.',
      '',
    );
  lines.push('## High-DPI screens', '', 'LabVIEW does not rescale images, so `@1.5x` and `@2x` PNGs are included when selected. Use the size that matches your display scaling.', '');
  return lines.join('\n');
}
