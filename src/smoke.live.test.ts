/**
 * Live smoke test against the real OpenRouter API. Spends roughly $0.03–0.08.
 *
 *   OPENROUTER_API_KEY=sk-or-... npm run smoke
 *
 * Writes every sheet, crop and traced SVG to smoke-output/ plus an index.html to eyeball quality,
 * and prints the real cost of each call as reported by OpenRouter.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fillCircle, nodeCodec, toPngDataUrl } from './test/fixtures';
import { createRaster } from './lib/raster';
import { createClient } from './lib/openrouter';
import { analyzeBrand, generateIcons, type Deps } from './lib/pipeline';
import { defaultProject } from './lib/project';
import type { Project } from './lib/types';

const key = process.env.OPENROUTER_API_KEY;
const out = 'smoke-output';
const NAMES = ['Home', 'Search', 'Cart', 'Profile', 'Coffee cup', 'Leaf', 'Map pin', 'Calendar', 'Gift'];
const MODELS = (process.env.SMOKE_MODELS ?? 'openai/gpt-image-2.5-flare,openai/gpt-image-1-mini').split(',');

describe.skipIf(!key)('live OpenRouter', () => {
  const costs: { step: string; usd: number }[] = [];
  const deps = (step: string): Deps => ({
    client: createClient({ apiKey: key!, referer: 'https://github.com/zeshanabdullah10/AIconify' }),
    codec: nodeCodec,
    onCost: (usd) => costs.push({ step, usd }),
  });
  let project: Project = defaultProject();
  const report: string[] = [];

  beforeAll(() => mkdirSync(out, { recursive: true }));
  afterAll(() => {
    const total = costs.reduce((s, c) => s + c.usd, 0);
    console.table(costs);
    console.log(`TOTAL: $${total.toFixed(4)}`);
    writeFileSync(
      `${out}/index.html`,
      `<!doctype html><meta charset="utf-8"><title>AIconify smoke</title><body style="font:14px system-ui;margin:24px">
<h1>Smoke run · $${total.toFixed(4)}</h1><pre>${JSON.stringify(costs, null, 1)}</pre>${report.join('\n')}</body>`,
    );
  });

  it('DeepSeek V4.1 Flash reads the logo', async () => {
    const logo = createRaster(256, 256);
    fillCircle(logo, 128, 128, 100, [31, 77, 58, 255]);
    fillCircle(logo, 128, 128, 40, [107, 191, 89, 255]);
    const dataUrl = toPngDataUrl(logo);
    project = {
      ...project,
      brand: { ...project.brand, logo: { dataUrl, fileName: 'logo.png' }, notes: 'Fernleaf, a specialty coffee roaster. Friendly, organic.' },
    };
    const { brand, analysis } = await analyzeBrand(deps('brand'), project.brand, dataUrl);
    console.log('brand analysis', JSON.stringify(analysis, null, 1));
    expect(brand.palette.length).toBeGreaterThan(0);
    project = { ...project, brand, style: { ...project.style, primary: brand.palette[0].hex, accent: brand.palette[1]?.hex ?? '#6bbf59' } };
    report.push(`<h2>Brand</h2><pre>${JSON.stringify(analysis, null, 1)}</pre>`);
  }, 120_000);

  for (const modelId of MODELS) {
    it(`${modelId} draws and we slice a 3×3 sheet`, async () => {
      const p = { ...project, modelId, quality: 'low' as const, candidates: 1 };
      const res = await generateIcons(deps(modelId), p, NAMES);
      const slug = modelId.replace(/\W+/g, '-');
      const sheet = res.runs[0].candidates[0].dataUrl;
      writeFileSync(`${out}/${slug}-sheet.png`, Buffer.from(sheet.split(',')[1], 'base64'));
      res.icons.forEach((icon, i) => icon.svg && writeFileSync(`${out}/${slug}-${i}-${icon.name.replace(/\W+/g, '-')}.svg`, icon.svg));
      report.push(
        `<h2>${modelId} · $${res.runs[0].candidates[0].cost.toFixed(4)}</h2><img src="${slug}-sheet.png" width="360" style="background:repeating-conic-gradient(#eee 0 25%,#fff 0 50%) 0/16px 16px">`,
        `<div style="display:flex;gap:12px;flex-wrap:wrap">${res.icons
          .map((i) => `<figure style="margin:0;width:96px;text-align:center"><div style="width:72px;height:72px;margin:auto">${(i.svg ?? '').replace('<svg ', '<svg width="72" height="72" ')}</div><figcaption>${i.name}<br><small>${i.flags.join(', ')}</small></figcaption></figure>`)
          .join('')}</div>`,
      );
      const traced = res.icons.filter((i) => i.svg).length;
      console.log(modelId, `traced ${traced}/${NAMES.length}`, res.icons.map((i) => `${i.name}:${i.flags.join('|') || 'ok'}`).join(' '));
      expect(traced).toBeGreaterThanOrEqual(NAMES.length - 2);
    }, 240_000);
  }
});
