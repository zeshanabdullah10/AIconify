export interface RGB {
  r: number;
  g: number;
  b: number;
}

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isHex(value: string): boolean {
  return HEX_RE.test(value.trim());
}

export function normalizeHex(value: string): string {
  const m = HEX_RE.exec(value.trim());
  if (!m) throw new Error(`Not a hex color: ${value}`);
  let h = m[1].toLowerCase();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return `#${h}`;
}

export function hexToRgb(hex: string): RGB {
  const h = normalizeHex(hex).slice(1);
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

export function rgbToHex({ r, g, b }: RGB): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function distanceSq(a: RGB, b: RGB): number {
  // Weighted ("redmean") distance tracks perceived difference better than plain RGB.
  const rm = (a.r + b.r) / 2;
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
}

export function nearestIndex(color: RGB, palette: RGB[]): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const d = distanceSq(color, palette[i]);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Pull every #rrggbb / #rgb looking token out of free text (brand PDFs list them a lot). */
export function findHexColors(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) found.add(normalizeHex(m[0]));
  return [...found];
}

/** Blend `a` toward `b` by t (0 = a, 1 = b). */
export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t });
}

export const darken = (hex: string, t: number) => mix(hex, '#000000', t);
export const lighten = (hex: string, t: number) => mix(hex, '#ffffff', t);

/** A validated #rrggbb, or the fallback. Guards every colour that ends up inside SVG markup. */
export function safeHex(value: string | undefined, fallback: string): string {
  return value && isHex(value) ? normalizeHex(value) : fallback;
}

/** White or near-black, whichever reads better on `bg`. */
export function onColor(bg: string): string {
  return contrastRatio(bg, '#ffffff') >= contrastRatio(bg, '#1d1d1f') ? '#ffffff' : '#1d1d1f';
}
