import { parseBrand, parseBrief, parseJson, parseSuggestions, sheetPrompt, styleLock } from './prompts';
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
