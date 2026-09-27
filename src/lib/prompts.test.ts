import { activeColor, iconName, parseBrand, parseBrief, parseJson, parseSuggestions, partKey, sheetPrompt, styleLock } from './prompts';
import type { BrandKit, StyleLock } from './types';

const brand: BrandKit = {
  name: 'Fernleaf',
  notes: '',
  palette: [],
  traits: ['Warm', 'Organic'],
  dos: [],
  donts: ['Gradients'],
  fonts: {},
  analyzed: true,
};
const lock: StyleLock = { style: 'outline', strokeWeight: 2, corners: 'rounded', colorMode: 'brand', primary: '#1f4d3a', accent: '#6bbf59' };

describe('prompts', () => {
  it('locks style, colour and mood', () => {
    const s = styleLock(lock, brand);
    expect(s).toContain('2px stroke');
    expect(s).toContain('#1f4d3a');
    expect(s).toContain('warm, organic');
    expect(s).toContain('Avoid: gradients');
  });

  it('uses both brand colours for duotone', () => {
    expect(styleLock({ ...lock, style: 'duotone' }, brand)).toContain('#6bbf59');
  });

  it('lays icons out row by row', () => {
    const p = sheetPrompt({ names: ['Home', 'Cart', 'Chat'], descriptions: { Cart: 'a basket' }, cols: 2, rows: 2, transparent: true }, 'STYLE');
    expect(p).toContain('exactly 2 rows and 2 columns');
    expect(p).toContain('Row 1, column 2: "Cart" — a basket');
    expect(p).toContain('Row 2, column 1: "Chat"');
    expect(p).toContain('fully transparent');
  });

  it('asks opaque models for a white background', () => {
    expect(sheetPrompt({ names: ['A'], cols: 1, rows: 1, transparent: false }, 'S')).toContain('pure white');
  });
});

describe('parsers', () => {
  it('reads fenced JSON', () => {
    expect(parseJson('Sure!\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(() => parseJson('no json')).toThrow();
  });

  it('survives trailing text, extra objects and braces inside strings', () => {
    // The live smoke run once failed on a reply shaped like this.
    expect(parseJson('{"name":"Fernleaf Co."}\n{"traits":["Warm"]}')).toEqual({ name: 'Fernleaf Co.', traits: ['Warm'] });
    expect(parseJson('{"a":"x}y"} and that is all}')).toEqual({ a: 'x}y' });
    expect(parseJson('{"a":1,} {"b":2}')).toEqual({ b: 2 });
    expect(parseJson('{"a":"say \\"hi\\" {"}')).toEqual({ a: 'say "hi" {' });
    expect(() => parseJson('{"a": ')).toThrow(/valid JSON/);
  });

  it('turns slugs into readable icon names', () => {
    expect(iconName('coffee-bean')).toBe('Coffee bean');
    expect(iconName('store_locator ')).toBe('Store locator');
    expect(parseSuggestions('{"icons":["gift-card","Gift card","Map"]}', ['map'])).toEqual(['Gift card']);
  });

  it('validates brand analysis', () => {
    const a = parseBrand(
      JSON.stringify({
        name: 'Fernleaf',
        palette: [{ role: 'Primary', hex: '#1F4D3A' }, { role: 'Bad', hex: 'green' }],
        traits: ['Warm', 3, ''],
        style: { style: 'duotone', corners: 'rounded', strokeWeight: '2' },
        suggestedIcons: ['Home', 'Cart'],
      }),
    );
    expect(a.palette).toEqual([{ role: 'Primary', hex: '#1f4d3a' }]);
    expect(a.traits).toEqual(['Warm']);
    expect(a.style).toEqual({ style: 'duotone', corners: 'rounded', strokeWeight: 2 });
    expect(a.suggestedIcons).toEqual(['Home', 'Cart']);
  });

  it('maps briefs back to names', () => {
    const b = parseBrief('{"icons":[{"name":"Home","description":"a house"},{"description":"a cart"}]}', ['Home', 'Cart']);
    expect(b).toEqual({ Home: 'a house', Cart: 'a cart' });
  });

  it('drops suggestions that already exist', () => {
    expect(parseSuggestions('{"icons":["home","Map"]}', ['Home'])).toEqual(['Map']);
  });
});

describe('state parts', () => {
  const base: StyleLock = { style: 'outline', strokeWeight: 2, corners: 'rounded', colorMode: 'brand', primary: '#1f4d3a', accent: '#6bbf59' };

  it('asks for the state part in a key colour far from the brand colours', () => {
    expect(partKey(base)).toBeUndefined();
    expect(styleLock(base, brand)).not.toContain('State part');
    const key = partKey({ ...base, parts: true })!;
    expect(styleLock({ ...base, parts: true }, brand)).toContain(`draw only that part in exactly ${key}`);
    // A magenta brand gets a different key.
    expect(partKey({ ...base, parts: true, primary: '#ff10f0', accent: '#e000ff' })).not.toBe('#ff00ff');
  });

  it('shows active parts in the accent in brand mode, and the main colour in one-colour mode', () => {
    expect(activeColor(base)).toBe('#6bbf59');
    expect(activeColor({ ...base, colorMode: 'mono' })).toBe('#1f4d3a');
  });
});

