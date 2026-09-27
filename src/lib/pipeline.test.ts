import JSZip from 'jszip';
import { GREEN, fillRect, makeSheet, nodeCodec, toPngDataUrl } from '../test/fixtures';
import { applyTargets, buildZip, planFiles } from './exporter';
import { emfRecords } from './emf';
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

// These trace whole sheets (up to 20 icons with centerline fitting): about 3 s locally, more on CI runners.
describe('generateIcons', { timeout: 20_000 }, () => {
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
    const o = { ...applyTargets(p.exportOptions, ['web', 'design']), sprite: true, pngSizes: [24] };
    const planned = planFiles(p, o);
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

describe('LabVIEW and industrial export', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#1f4d3a" d="M2 2L22 2L22 22L2 22Z"/></svg>';
  const p = project({ icons: [{ id: 'a', name: 'Pump', status: 'approved', svg, flags: [], history: [] }] });
  const all = {
    ...p.exportOptions,
    svg: false,
    png: true,
    pngSizes: [24],
    pngScales: [1, 2],
    react: false,
    figma: false,
    emf: true,
    buttons: true,
    viIcons: true,
    bannerText: 'Pumps',
    states: true,
    indicators: true,
    indicatorKinds: ['round-led', 'tank'],
    indicatorColors: ['#2fb344'],
  };

  it('lists exactly what it zips, with every density and state', async () => {
    const planned = planFiles(p, all);
    expect(planned).toEqual(
      expect.arrayContaining([
        'png/24/pump.png',
        'png/24/pump@2x.png',
        'emf/pump.emf',
        'labview/buttons/pump/false.png',
        'labview/buttons/pump/true@2x.png',
        'labview/buttons/pump/false-to-true.emf',
        'labview/buttons/pump/true-to-false.png',
        'labview/vi-icons/pump.png',
        'labview/glyphs/pump.png',
        'states/alarm/pump.svg',
        'states/offline/24/pump.png',
        'states/on/pump.svg',
        'states/manual/24/pump@2x.png',
        'labview/indicators/round-led-green-on.png',
        'labview/indicators/tank-green-050.svg',
        'labview/README.md',
      ]),
    );
    const zip = await JSZip.loadAsync(await buildZip(p, all, async (_svg, size) => new Uint8Array([size])));
    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
    expect(names.sort()).toEqual([...planned].sort());
    // @2x doubles the pixel size; VI icons are always 32
    expect(await zip.file('png/24/pump@2x.png')!.async('uint8array')).toEqual(new Uint8Array([48]));
    expect(await zip.file('labview/vi-icons/pump.png')!.async('uint8array')).toEqual(new Uint8Array([32]));
    expect(emfRecords(await zip.file('emf/pump.emf')!.async('uint8array'))[0].type).toBe(1);
    const emf = await zip.file('labview/buttons/pump/true.emf')!.async('uint8array');
    expect(emfRecords(emf).at(-1)!.type).toBe(14);
    const guide = await zip.file('labview/README.md')!.async('string');
    expect(guide).toContain('Customize');
    expect(guide).toContain('Picture Ring');
  });

  it('snaps small PNGs to the pixel grid only when asked', async () => {
    const rendered: string[] = [];
    const tilted = { ...p, icons: [{ ...p.icons[0], svg: svg.replace('M2 2', 'M2.4 2.3') }] };
    const o = { ...all, buttons: false, viIcons: false, states: false, indicators: false, emf: false, pngScales: [1] };
    await buildZip(tilted, o, async (s) => (rendered.push(s), new Uint8Array()));
    expect(rendered[0]).toContain('M2 2');
    rendered.length = 0;
    await buildZip(tilted, { ...o, pixelSnap: false }, async (s) => (rendered.push(s), new Uint8Array()));
    expect(rendered[0]).toContain('M2.4 2.3');
  });

  it('exports indicators even before any icon exists', () => {
    const empty = project();
    expect(planFiles(empty, { ...all, buttons: false })).toContain('labview/indicators/round-led-green-off.svg');
  });
});

describe('reference icons', () => {
  it('sends uploaded icons first, then approved ones, and says to match them', async () => {
    const { client, calls } = fakeClient();
    const ref = toPngDataUrl(makeSheet(32));
    const approved = toPngDataUrl(makeSheet(48));
    const p = project({
      references: [{ id: 'r', name: 'existing', png: ref }],
      icons: [{ id: 'a', name: 'Cup', status: 'approved', png: approved, svg: '<svg/>', flags: [], history: [] }],
    });
    await generateIcons({ client, codec: nodeCodec, onCost: () => {} }, p, ['Home']);
    expect(calls.images[0].input_references).toEqual([ref, approved]);
    expect(calls.images[0].prompt).toContain('Match the exact style');
  });

  it('adds the HMI style sentence to every prompt', async () => {
    const { client, calls } = fakeClient();
    const p = project();
    await generateIcons({ client, codec: nodeCodec, onCost: () => {} }, { ...p, style: { ...p.style, hmi: true } }, ['Pump']);
    expect(calls.images[0].prompt).toContain('ISA-101');
  });
});

describe('export targets', () => {
  it('default to LabVIEW, and combine', () => {
    const d = defaultProject().exportOptions;
    expect(applyTargets(d, ['labview'])).toEqual(d);
    const lv = d;
    expect(lv).toMatchObject({ png: true, emf: true, buttons: true, viIcons: true, svg: false, react: false, states: false, pngSizes: [16, 32], pngScales: [1, 2] });
    const both = applyTargets(d, ['labview', 'hmi']);
    expect(both).toMatchObject({ buttons: true, states: true, indicators: true, svg: true, pngSizes: [16, 24, 32, 48] });
    // Settings that aren't about which files to make survive.
    expect(applyTargets({ ...d, prefix: 'fl-', buttonSkin: 'toggle' }, ['hmi'])).toMatchObject({ prefix: 'fl-', buttonSkin: 'toggle' });
    // Nothing picked still exports SVG.
    expect(applyTargets(d, []).svg).toBe(true);
  });
});
