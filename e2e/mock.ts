import type { Page, Route } from '@playwright/test';
import { makeSheet, toPngDataUrl, fillCircle } from '../src/test/fixtures';
import { createRaster } from '../src/lib/raster';

export const SUGGESTED = ['Home', 'Search', 'Cart', 'Profile', 'Heart', 'Bell', 'Coffee cup', 'Leaf', 'Map pin', 'Calendar', 'Chat', 'Star', 'Truck', 'Gift', 'Lock', 'Settings'];

export function logoPng(): Buffer {
  const img = createRaster(200, 200);
  fillCircle(img, 100, 100, 80, [31, 77, 58, 255]);
  fillCircle(img, 100, 100, 30, [107, 191, 89, 255]);
  return Buffer.from(toPngDataUrl(img).split(',')[1], 'base64');
}

/** A full sheet with every cell drawn (the unit-test fixture leaves cell 10 empty on purpose). */
function fullSheet(): string {
  const img = makeSheet(1024);
  fillCircle(img, 2.5 * 256, 2.5 * 256, 70, [31, 77, 58, 255], 16);
  return toPngDataUrl(img).split(',')[1];
}

/** A cols × rows grid of rings, for edits (1×1) and variations (2×2). */
function grid(cols: number, rows: number): string {
  const size = 1024;
  const img = createRaster(size, size);
  const cw = size / cols;
  const ch = size / rows;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) fillCircle(img, (c + 0.5) * cw, (r + 0.5) * ch, Math.min(cw, ch) * 0.3, [31, 77, 58, 255], 18);
  return toPngDataUrl(img).split(',')[1];
}

export interface MockLog {
  chat: { body: Record<string, unknown> }[];
  images: { body: Record<string, unknown> }[];
  auth: { body: Record<string, unknown> }[];
}

/** Stand in for OpenRouter so the whole app runs end to end without spending money. */
export async function mockOpenRouter(page: Page): Promise<MockLog> {
  const log: MockLog = { chat: [], images: [], auth: [] };
  const sheet = fullSheet();
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });

  await page.route('https://openrouter.ai/api/v1/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    const url = req.url();
    if (url.endsWith('/key')) {
      const auth = req.headers()['authorization'];
      if (auth === 'Bearer bad') return json(route, { error: { message: 'bad key' } }, 401);
      return json(route, { data: { label: 'e2e key', usage: 0.12, limit_remaining: 4.5 } });
    }
    const body = req.postDataJSON() as Record<string, unknown>;
    if (url.endsWith('/auth/keys')) {
      log.auth.push({ body });
      return json(route, { key: 'sk-or-from-oauth' });
    }
    if (url.endsWith('/chat/completions')) {
      log.chat.push({ body });
      const text = JSON.stringify(body.messages);
      let content: unknown;
      if (text.includes('senior brand designer')) {
        content = {
          name: 'Fernleaf',
          palette: [
            { role: 'Primary', hex: '#1f4d3a' },
            { role: 'Accent', hex: '#6bbf59' },
          ],
          traits: ['Warm', 'Organic', 'Friendly'],
          dos: ['Rounded corners'],
          donts: ['Gradients'],
          fonts: { display: 'Recoleta', body: 'Nunito Sans' },
          style: { style: 'outline', corners: 'rounded', strokeWeight: 2 },
          suggestedIcons: SUGGESTED,
        };
      } else if (text.includes('Suggest')) {
        content = { icons: ['Wifi', 'Parking'] };
      } else {
        content = { icons: [] };
      }
      return json(route, { choices: [{ message: { content: JSON.stringify(content) } }], usage: { cost: 0.0002 } });
    }
    if (url.endsWith('/images')) {
      log.images.push({ body });
      const n = Number(body.n ?? 1);
      const prompt = String(body.prompt);
      const b64 = prompt.startsWith('Redraw') ? grid(1, 1) : prompt.includes('exactly 2 rows and 2 columns') ? grid(2, 2) : sheet;
      return json(route, { data: Array.from({ length: n }, () => ({ b64_json: b64, media_type: 'image/png' })), usage: { cost: 0.006 * n } });
    }
    return json(route, { error: { message: 'not mocked' } }, 404);
  });
  return log;
}

/** A one-page PDF whose text layer mentions a brand colour, small enough to write by hand. */
export function guidelinesPdf(): Buffer {
  const text = 'Fernleaf brand guidelines. Primary green #1F4D3A. Never use gradients.';
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((o, i) => {
    const at = pdf.length;
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
    return at;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}
