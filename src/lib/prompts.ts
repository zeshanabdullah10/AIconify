import { hexToRgb, isHex, normalizeHex } from './color';
import type { ChatMessage } from './openrouter';
import type { BrandKit, IconStyle, PaletteColor, StyleLock } from './types';

export const STYLE_LABELS: Record<IconStyle, { name: string; hint: string }> = {
  outline: { name: 'Outline', hint: 'Line icons' },
  filled: { name: 'Filled', hint: 'Solid shapes' },
  duotone: { name: 'Duotone', hint: 'Line + accent fill' },
  badge: { name: 'Badge', hint: 'Icon on a tile' },
  schematic: { name: 'Schematic', hint: 'P&ID line symbols' },
  pixel: { name: 'Pixel', hint: '32×32 pixel art' },
};

function styleSentence(s: StyleLock): string {
  const corners = s.corners === 'rounded' ? 'rounded line caps and softly rounded corners' : 'crisp square corners';
  switch (s.style) {
    case 'outline':
      return `minimal outline (line) icons with a uniform ${s.strokeWeight}px stroke on a 24px grid, ${corners}, no fills`;
    case 'filled':
      return `solid filled glyph icons built from simple flat shapes, ${corners}, small negative-space details`;
    case 'duotone':
      return `duotone icons: a uniform ${s.strokeWeight}px outline in ${s.primary} with a flat secondary fill in ${s.accent} behind parts of each shape, ${corners}`;
    case 'badge':
      return `icons drawn as simple white line art (${s.strokeWeight}px strokes) centered on a solid ${s.primary} rounded-square tile, ${corners}`;
    case 'schematic':
      return `engineering schematic symbols in the style of ISA-5.1 P&ID and IEC process diagrams: thin uniform ${s.strokeWeight}px lines on a 24px grid, built from geometric primitives (circles, triangles, rectangles, straight connecting lines), flat and front-on, no perspective, no shading, instrument bubbles as plain circles, like a clean CAD drawing`;
    case 'pixel':
      return `pixel-art icons drawn on a 32×32 pixel grid with large, clearly visible square pixels, hard edges and no anti-aliasing, a 1-pixel dark outline, flat colours, in the tradition of classic desktop and LabVIEW VI icons`;
  }
}

/** Saturated colours no brand icon uses; the one furthest from the set's colours marks active parts. */
const PART_KEYS = ['#ff00ff', '#00d0ff', '#ff7a00', '#7a00ff'];

/** The key colour for active parts, or undefined when parts are off. */
export function partKey(s: StyleLock): string | undefined {
  if (!s.parts) return undefined;
  const used = [s.primary, s.accent, '#ffffff'].filter(isHex).map(hexToRgb);
  const gap = (hex: string) => {
    const c = hexToRgb(hex);
    return Math.min(...used.map((u) => (u.r - c.r) ** 2 + (u.g - c.g) ** 2 + (u.b - c.b) ** 2));
  };
  return PART_KEYS.reduce((best, k) => (gap(k) > gap(best) ? k : best));
}

/** The colour active parts are shown in on the plain icon: the accent in brand mode. */
export function activeColor(s: StyleLock): string {
  if (s.colorMode === 'brand') return s.accent;
  return s.style === 'badge' ? '#ffffff' : s.primary;
}

/** The fixed style block that goes into every image prompt for a set — the main consistency lever. */
export function styleLock(s: StyleLock, brand: BrandKit): string {
  const colors =
    s.colorMode === 'mono' || s.style === 'outline' || s.style === 'filled' || s.style === 'schematic'
      ? `Use exactly one colour: ${s.primary}.`
      : `Use only ${s.primary} and ${s.accent}${s.style === 'badge' || s.style === 'pixel' ? ' plus white' : ''}.`;
  const mood = brand.traits.length ? ` Mood: ${brand.traits.slice(0, 5).join(', ').toLowerCase()}.` : '';
  const dont = brand.donts.length ? ` Avoid: ${brand.donts.slice(0, 4).join('; ').toLowerCase()}.` : '';
  const hmi = s.hmi
    ? ' Industrial HMI symbols in the ISA-101 high-performance style: functional, schematic and technical, like equipment on a control-room screen; readable at 16 px; no decoration, no people, no mascots.'
    : '';
  const key = partKey(s);
  const parts = key
    ? ` State part: where an icon has one part that moves, flows, glows or shows state (a pump's impeller, a valve's disc, a fan's blades, the liquid in a tank, a lamp's light, a lock's shackle), draw only that part in exactly ${key}, flat, in the same line style. Icons without such a part do not use ${key}.`
    : '';
  return `Style: ${styleSentence(s)}. Flat vector look, no gradients, no shadows, no 3D, no textures. ${colors}${parts}${hmi}${mood}${dont}`;
}

export interface SheetSpec {
  names: string[];
  descriptions?: Record<string, string>;
  cols: number;
  rows: number;
  transparent: boolean;
  hasReferences?: boolean;
}

export function sheetPrompt(spec: SheetSpec, lock: string): string {
  const lines: string[] = [];
  spec.names.forEach((name, i) => {
    const r = Math.floor(i / spec.cols) + 1;
    const c = (i % spec.cols) + 1;
    const desc = spec.descriptions?.[name];
    lines.push(`Row ${r}, column ${c}: "${name}"${desc ? ` — ${desc}` : ''}`);
  });
  const bg = spec.transparent
    ? 'The background must be fully transparent.'
    : 'The background must be plain flat pure white (#FFFFFF) everywhere.';
  const refs = spec.hasReferences
    ? ' Match the exact style, stroke weight, proportions and colours of the reference icons.'
    : '';
  return [
    `A clean icon set sheet: exactly ${spec.rows} rows and ${spec.cols} columns of icons (${spec.names.length} icons), evenly spaced on an invisible grid with wide empty gutters between icons.`,
    'Each cell holds exactly one icon, centered, all icons the same visual size. Icons must not touch or overlap. No text, no letters, no labels, no numbers, no grid lines, no frames.',
    bg,
    lock + refs,
    'Icons, left to right, top to bottom:',
    ...lines,
  ].join('\n');
}

export function editPrompt(name: string, instruction: string, lock: string, transparent: boolean): string {
  return [
    `Redraw the first reference image: a single "${name}" icon. Change: ${instruction.trim()}.`,
    'Keep everything else the same. If more reference icons are given, match their style exactly.',
    `One icon, centered, filling about 80% of the canvas. No text. ${transparent ? 'Fully transparent background.' : 'Plain flat pure white background.'}`,
    lock,
  ].join('\n');
}

export function variationsPrompt(name: string, description: string | undefined, lock: string, transparent: boolean): string {
  return sheetPrompt(
    {
      names: [0, 1, 2, 3].map(() => name),
      descriptions: {
        [name]: `${description ? `${description}; ` : ''}each of the four cells shows a different visual idea for this same icon`,
      },
      cols: 2,
      rows: 2,
      transparent,
      hasReferences: true,
    },
    lock,
  );
}

/* ---------- text model (DeepSeek V4.1 Flash) ---------- */

/** Every balanced top-level {...} in the text, skipping braces inside strings. */
function jsonObjects(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      if (depth > 0) inString = true;
    } else if (ch === '{') {
      if (depth++ === 0) start = i;
    } else if (ch === '}' && depth > 0 && --depth === 0) {
      out.push(text.slice(start, i + 1));
    }
  }
  return out;
}

/**
 * Pull a JSON object out of a model reply. Models sometimes wrap it in prose or a code fence, or split
 * one answer into several objects; those are merged, in order.
 */
export function parseJson<T = unknown>(text: string): T {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fenced ? fenced[1] : text;
  const parsed: Record<string, unknown>[] = [];
  for (const chunk of jsonObjects(body)) {
    try {
      const v = JSON.parse(chunk);
      if (v && typeof v === 'object' && !Array.isArray(v)) parsed.push(v);
    } catch {
      /* not valid JSON on its own; try the rest */
    }
  }
  if (parsed.length === 0) throw new Error('The model did not return valid JSON. Try again.');
  return (parsed.length === 1 ? parsed[0] : Object.assign({}, ...parsed)) as T;
}

/** "coffee-bean" → "Coffee bean": models often answer with slugs, the UI shows names. */
export function iconName(raw: string): string {
  const s = raw.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

const strings = (v: unknown, max = 12): string[] =>
  Array.isArray(v)
    ? v
        .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        .map((x) => x.trim().slice(0, 80))
        .slice(0, max)
    : [];

const dedupe = (list: string[]): string[] => {
  const seen = new Set<string>();
  return list.filter((x) => {
    const k = x.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

export interface BrandAnalysis {
  name?: string;
  palette: PaletteColor[];
  traits: string[];
  dos: string[];
  donts: string[];
  fonts: { display?: string; body?: string };
  style?: Partial<Pick<StyleLock, 'style' | 'corners' | 'strokeWeight'>>;
  suggestedIcons: string[];
}

export function brandMessages(input: {
  logoDataUrl?: string;
  guidelinesText?: string;
  notes?: string;
  logoColors: string[];
  documentColors: string[];
}): ChatMessage[] {
  const text = [
    'You are a senior brand designer preparing an icon set brief.',
    'Study the logo image and any brand guideline text. Return ONLY a JSON object with keys:',
    '"name" (brand name), "palette" (array of {"role","hex"}; roles like Primary, Accent, Warm, Surface, Ink; 2-6 entries; prefer the measured colours below),',
    '"traits" (3-6 single adjectives), "dos" (up to 4 short visual rules), "donts" (up to 4 short visual rules),',
    '"fonts" ({"display","body"} if known), "style" ({"style": one of outline|filled|duotone|badge, "corners": rounded|sharp, "strokeWeight": 1.5|2|2.5}),',
    '"suggestedIcons" (12-16 short, human-readable icon names like "Coffee cup", this brand most likely needs for its app or site).',
    `Colours measured from the logo pixels: ${input.logoColors.join(', ') || 'none'}.`,
    `Colours listed in the guidelines: ${input.documentColors.join(', ') || 'none'}.`,
    input.notes ? `Notes from the user: ${input.notes.slice(0, 1000)}` : '',
    input.guidelinesText ? `Brand guideline text (may be truncated):\n${input.guidelinesText.slice(0, 12000)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const content: ChatMessage['content'] = input.logoDataUrl
    ? [
        { type: 'text', text },
        { type: 'image_url', image_url: { url: input.logoDataUrl } },
      ]
    : text;
  return [{ role: 'user', content }];
}

export function parseBrand(text: string): BrandAnalysis {
  const raw = parseJson<Record<string, unknown>>(text);
  const palette: PaletteColor[] = Array.isArray(raw.palette)
    ? (raw.palette as { role?: unknown; hex?: unknown }[])
        .filter((p) => typeof p?.hex === 'string' && isHex(p.hex as string))
        .map((p, i) => ({
          role: typeof p.role === 'string' && p.role.trim() ? p.role.trim().slice(0, 20) : `Color ${i + 1}`,
          hex: normalizeHex(p.hex as string),
        }))
        .slice(0, 6)
    : [];
  const fonts = (raw.fonts ?? {}) as Record<string, unknown>;
  const style = (raw.style ?? {}) as Record<string, unknown>;
  const styles: IconStyle[] = ['outline', 'filled', 'duotone', 'badge'];
  return {
    name: typeof raw.name === 'string' ? raw.name.slice(0, 60) : undefined,
    palette,
    traits: strings(raw.traits, 6),
    dos: strings(raw.dos, 4),
    donts: strings(raw.donts, 4),
    fonts: {
      display: typeof fonts.display === 'string' ? fonts.display : undefined,
      body: typeof fonts.body === 'string' ? fonts.body : undefined,
    },
    style: {
      style: styles.includes(style.style as IconStyle) ? (style.style as IconStyle) : undefined,
      corners: style.corners === 'sharp' ? 'sharp' : style.corners === 'rounded' ? 'rounded' : undefined,
      strokeWeight: [1.5, 2, 2.5].includes(Number(style.strokeWeight)) ? Number(style.strokeWeight) : undefined,
    },
    suggestedIcons: dedupe(strings(raw.suggestedIcons, 24).map(iconName)),
  };
}

export function briefMessages(names: string[], brand: BrandKit, lock: string): ChatMessage[] {
  return [
    {
      role: 'user',
      content: [
        'You write image-generation briefs for icon sets. For each icon name, give one short, concrete visual description',
        '(max 14 words) of the simplest recognisable metaphor, suited to the brand. No colours, no style words — style is fixed separately.',
        `Brand: ${brand.name || 'unnamed'}; traits: ${brand.traits.join(', ') || 'n/a'}. Style: ${lock}`,
        `Icons: ${JSON.stringify(names)}`,
        'Return ONLY JSON: {"icons":[{"name":"...","description":"..."}]} in the same order.',
      ].join('\n'),
    },
  ];
}

export function parseBrief(text: string, names: string[]): Record<string, string> {
  const raw = parseJson<{ icons?: { name?: unknown; description?: unknown }[] }>(text);
  const out: Record<string, string> = {};
  (raw.icons ?? []).forEach((it, i) => {
    const name = typeof it?.name === 'string' && names.includes(it.name) ? it.name : names[i];
    if (name && typeof it?.description === 'string') out[name] = it.description.trim().slice(0, 140);
  });
  return out;
}

export function suggestMessages(brand: BrandKit, existing: string[], count: number): ChatMessage[] {
  return [
    {
      role: 'user',
      content: [
        `Suggest ${count} more icon names (1-3 words each) for ${brand.name || 'this brand'}'s app and website.`,
        `Brand traits: ${brand.traits.join(', ') || 'n/a'}. Notes: ${brand.notes.slice(0, 500) || 'n/a'}.`,
        `Already in the set (do not repeat): ${JSON.stringify(existing)}.`,
        'Return ONLY JSON: {"icons":["..."]}',
      ].join('\n'),
    },
  ];
}

export function parseSuggestions(text: string, existing: string[]): string[] {
  const raw = parseJson<{ icons?: unknown }>(text);
  const lower = new Set(existing.map((e) => e.toLowerCase()));
  return dedupe(strings(raw.icons, 24).map(iconName)).filter((n) => !lower.has(n.toLowerCase()));
}
