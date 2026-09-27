import JSZip from 'jszip';
import { GREEN, fillRect, makeSheet, nodeCodec, toPngDataUrl } from '../test/fixtures';
import { buildZip, planFiles } from './exporter';
import type { Client, ImageRequest } from './openrouter';
import { analyzeBrand, editIcon, generateIcons, iconPalette, iconVariations, retraceAll, type Deps } from './pipeline';
import { createRaster } from './raster';
import { defaultProject } from './project';
import type { Project } from './types';

function fakeClient(opts: { chat?: string; images?: (req: ImageRequest) => string[] } = {}) {
  const calls: { chat: unknown[]; images: ImageRequest[] } = { chat: [], images: [] };
  const client: Client = {
    async chat(messages) {
      calls.chat.push(messages);
      return { text: opts.chat ?? '{"icons":[]}', cost: 0.0001 };
    },
    async images(req) {
      calls.images.push(req);
      const imgs = opts.images?.(req) ?? Array.from({ length: req.n ?? 1 }, () => toPngDataUrl(makeSheet(256)));
      return { images: imgs, cost: 0.01 * imgs.length };
    },
    async keyInfo() {
      return {};
    },
  };
  return { client, calls };
}

function project(p: Partial<Project> = {}): Project {
  const base = defaultProject();
  return { ...base, style: { ...base.style, primary: '#1f4d3a' }, ...p };
}

describe('generateIcons', () => {
  it('makes one sheet per 16 icons and returns traced icons', async () => {
    const { client, calls } = fakeClient({ chat: '{"icons":[{"name":"A","description":"a thing"}]}' });
    let spent = 0;
    const deps: Deps = { client, codec: nodeCodec, onCost: (c) => (spent += c) };
    const names = Array.from({ length: 15 }, (_, i) => `Icon ${i + 1}`);
    const res = await generateIcons(deps, project({ candidates: 2 }), names);

    expect(calls.images).toHaveLength(1);
    expect(calls.images[0]).toMatchObject({ model: 'openai/gpt-image-2.5-flare', n: 2, background: 'transparent', quality: 'low' });
    expect(res.runs[0].candidates).toHaveLength(2);
    expect(res.icons).toHaveLength(15);
    // the fixture's empty cell 10 is reported, the rest are traced
    expect(res.icons[10].flags).toContain('missing');
    expect(res.icons[0].svg).toContain('<path');
    expect(spent).toBeCloseTo(0.0201, 4);
  });

  it('splits large sets and loops for single-image models', async () => {
    const { client, calls } = fakeClient();
    const deps: Deps = { client, codec: nodeCodec, onCost: () => {} };
    const names = Array.from({ length: 20 }, (_, i) => `Icon ${i}`);
    await generateIcons(deps, project({ modelId: 'black-forest-labs/flux.2-klein-4b', candidates: 2 }), names);
    expect(calls.images).toHaveLength(4);
    expect(calls.images[0].n).toBe(1);
    expect(calls.images[0].background).toBeUndefined();
    expect(calls.images[0].prompt).toContain('pure white');
  });

  it('keeps going when the brief model fails', async () => {
    const { client } = fakeClient();
    client.chat = async () => {
      throw new Error('boom');
    };
    const res = await generateIcons({ client, codec: nodeCodec, onCost: () => {} }, project(), ['A', 'B']);
    expect(res.icons).toHaveLength(2);
  });
});

describe('editing', () => {
  it('sends the icon and approved icons as references', async () => {
    const { client, calls } = fakeClient({ images: () => [toPngDataUrl(makeSheet(128))] });
    const png = toPngDataUrl(makeSheet(64));
    const p = project({
      icons: [
        { id: 'a', name: 'Cup', status: 'draft', png, svg: '<svg/>', flags: [], history: [] },
        { id: 'b', name: 'Leaf', status: 'approved', png, svg: '<svg/>', flags: [], history: [] },
      ],
    });
    const cell = await editIcon({ client, codec: nodeCodec, onCost: () => {} }, p, p.icons[0], 'thicker lines');
    expect(calls.images[0].input_references).toHaveLength(2);
    expect(calls.images[0].prompt).toContain('thicker lines');
    expect(cell.png).toMatch(/^data:image\/png/);
  });

  it('returns four variations from one 2×2 image', async () => {
    const { client, calls } = fakeClient();
    const p = project({ icons: [{ id: 'a', name: 'Cup', status: 'draft', flags: [], history: [] }] });
    const out = await iconVariations({ client, codec: nodeCodec, onCost: () => {} }, p, p.icons[0]);
    expect(calls.images).toHaveLength(1);
    expect(out).toHaveLength(4);
  });
});

describe('analyzeBrand', () => {
  it('merges model output with measured colours', async () => {
    const { client, calls } = fakeClient({
      chat: '{"name":"Fernleaf","palette":[{"role":"Primary","hex":"#1f4d3a"}],"traits":["Warm"],"suggestedIcons":["Home"]}',
    });
    const p = project();
    const brand = { ...p.brand, logo: { dataUrl: toPngDataUrl(makeSheet(64)), fileName: 'logo.png' } };
    const { brand: out, analysis } = await analyzeBrand({ client, codec: nodeCodec, onCost: () => {} }, brand, brand.logo.dataUrl);
    expect(out.name).toBe('Fernleaf');
    expect(out.palette[0].hex).toBe('#1f4d3a');
    expect(out.analyzed).toBe(true);
    expect(analysis.suggestedIcons).toEqual(['Home']);
    const content = (calls.chat[0] as { content: unknown }[])[0].content as { type: string }[];
    expect(content.some((c) => c.type === 'image_url')).toBe(true);
  });
});

describe('analyzeBrand retries', () => {
  it('asks once more when the reply is not JSON, and counts both calls', async () => {
    const replies = ['{"name": "Fern', '{"name":"Fernleaf","palette":[{"role":"Primary","hex":"#1f4d3a"}]}'];
    let calls = 0;
    const client = { ...fakeClient().client, chat: async () => ({ text: replies[calls++], cost: 0.001 }) };
    let spent = 0;
    const { brand } = await analyzeBrand({ client, codec: nodeCodec, onCost: (c) => (spent += c) }, project().brand);
    expect(calls).toBe(2);
    expect(brand.name).toBe('Fernleaf');
    expect(spent).toBeCloseTo(0.002, 6);
  });

  it('gives up after the retry', async () => {
    const client = { ...fakeClient().client, chat: async () => ({ text: 'sorry', cost: 0.001 }) };
    await expect(analyzeBrand({ client, codec: nodeCodec, onCost: () => {} }, project().brand)).rejects.toThrow(/valid JSON/);
  });
});

describe('retraceAll', () => {
  it('flags icons whose crop traces to nothing instead of exporting an empty SVG', async () => {
    const speck = createRaster(256, 256);
    fillRect(speck, 128, 128, 1, 1, GREEN);
    const p = project({ icons: [{ id: 'a', name: 'Leaf', status: 'approved', svg: '<svg/>', png: toPngDataUrl(speck), flags: [], history: [] }] });
    const [icon] = await retraceAll(nodeCodec, p);
    expect(icon.svg).toBeUndefined();
    expect(icon.status).toBe('flagged');
    expect(icon.flags).toContain('missing');
  });
});

describe('iconPalette', () => {
  it('follows the style', () => {
    const s = project().style;
    expect(iconPalette({ ...s, style: 'outline' })).toEqual([s.primary]);
    expect(iconPalette({ ...s, style: 'duotone', colorMode: 'brand' })).toEqual([s.primary, s.accent]);
    expect(iconPalette({ ...s, style: 'badge' })).toEqual([s.primary, '#ffffff']);
  });
});

describe('export', () => {
  it('plans and writes the zip', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#1f4d3a" d="M0 0L24 24Z"/></svg>';
    const p = project({
      icons: [
        { id: 'c', name: 'Missing', status: 'draft', flags: [], history: [] },
        { id: 'a', name: 'Coffee cup', status: 'approved', svg, flags: [], history: [] },
        { id: 'b', name: 'Coffee cup', status: 'approved', svg, flags: [], history: [] },
      ],
    });
    const o = { ...p.exportOptions, sprite: true, pngSizes: [24] };
    const planned = planFiles(['Coffee cup', 'Coffee cup'], o);
    expect(planned).toContain('svg/coffee-cup.svg');
    expect(planned).toContain('svg/coffee-cup-2.svg');
    expect(planned).toContain('react/CoffeeCup2.tsx');

    const bytes = await buildZip(p, o, async () => new Uint8Array([1, 2, 3]));
    const zip = await JSZip.loadAsync(bytes);
    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir).sort();
    expect(names).toEqual([...planned].sort());
    const tsx = await zip.file('react/CoffeeCup.tsx')!.async('string');
    expect(tsx).toContain('fill="currentColor"');
    expect(tsx).toContain('export function CoffeeCup');
    const readme = await zip.file('README.md')!.async('string');
    expect(readme).toContain('title="Coffee cup"');
    const sprite = await zip.file('sprite.svg')!.async('string');
    expect(sprite).toContain('<symbol id="coffee-cup"');
  });
});
