import { expect, test } from '@playwright/test';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';
import { guidelinesPdf, logoPng, mockOpenRouter } from './mock';

const problems = new WeakMap<object, string[]>();

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('aiconify.openrouter.key', 'sk-or-test'));
  // The production build ships a Content-Security-Policy; any violation or uncaught error fails the test.
  const list: string[] = [];
  problems.set(page, list);
  page.on('pageerror', (e) => list.push(`pageerror: ${e.message}`));
  page.on('console', (m) => /Content Security Policy|Refused to/i.test(m.text()) && list.push(`csp: ${m.text()}`));
});

test.afterEach(async ({ page }) => {
  expect(problems.get(page) ?? []).toEqual([]);
});

test('brand kit → icon set → zip, fully offline', async ({ page }) => {
  const log = await mockOpenRouter(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Start with your brand.' })).toBeVisible();

  // 1. Brand
  await page.getByLabel('Upload logo').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: logoPng() });
  await expect(page.getByRole('img', { name: 'Your logo' })).toBeVisible();
  await page.getByLabel('Upload brand guidelines PDF').setInputFiles({ name: 'guidelines.pdf', mimeType: 'application/pdf', buffer: guidelinesPdf() });
  await expect(page.getByText(/1 pages · \d+ characters read/)).toBeVisible();
  await page.getByRole('button', { name: 'Analyze brand' }).click();
  await expect(page.getByText('Brand analyzed.')).toBeVisible();
  await expect(page.getByLabel('Brand name')).toHaveValue('Fernleaf');
  // PDF text is read in the browser and only the text goes to the model
  expect(JSON.stringify(log.chat[0].body.messages)).toContain('Never use gradients');
  expect(JSON.stringify(log.chat[0].body.messages)).toContain('#1f4d3a');
  await expect(page.getByRole('button', { name: 'Remove Organic' })).toBeVisible();
  // the logo went to the vision model
  expect(JSON.stringify(log.chat[0].body.messages)).toContain('data:image/png;base64');
  expect(log.chat[0].body.model).toBe('deepseek/deepseek-v4.1-flash');

  // 2. Style
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Lock one look for the set.' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Icon names' }).getByRole('listitem')).toHaveCount(16);
  await page.getByRole('radio', { name: /Duotone/ }).click();
  await expect(page.getByText(/duotone icons/)).toBeAttached();
  await page.getByRole('button', { name: 'Suggest' }).click();
  await expect(page.getByRole('list', { name: 'Icon names' }).getByRole('listitem')).toHaveCount(18);
  await page.getByRole('button', { name: 'Remove Wifi' }).click();
  await page.getByRole('button', { name: 'Remove Parking' }).click();

  // 3. Generate
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Generate icons' }).click();
  await expect(page.getByText('16 icons ready.')).toBeVisible({ timeout: 30_000 });
  expect(log.images).toHaveLength(1);
  expect(log.images[0].body).toMatchObject({ model: 'openai/gpt-image-2.5-flare', n: 2, background: 'transparent' });
  expect(String(log.images[0].body.prompt)).toContain('exactly 4 rows and 4 columns');
  await page.getByRole('radio', { name: 'Option B' }).click();
  await expect(page.getByRole('radio', { name: 'Option B' })).toHaveAttribute('aria-checked', 'true');

  // 4. Review
  await page.getByRole('button', { name: 'Review icons' }).click();
  await expect(page.getByText('16 icons · 0 approved')).toBeVisible();
  await page.getByRole('button', { name: 'Approve all' }).click();
  await expect(page.getByText('16 icons · 16 approved')).toBeVisible();
  await page.getByRole('button', { name: /^Cart,/ }).click();
  await expect(page.getByLabel('Icon name')).toHaveValue('Cart');
  await page.getByLabel('Change it with a sentence').fill('make the wheels bigger');
  await page.getByRole('button', { name: /^Apply/ }).click();
  await expect(page.getByText('Edited.', { exact: true })).toBeVisible({ timeout: 20_000 });
  const edit = log.images[1].body;
  expect(String(edit.prompt)).toContain('make the wheels bigger');
  expect((edit.input_references as unknown[]).length).toBeGreaterThan(1);
  await expect(page.getByText('Earlier versions (1)')).toBeVisible();
  await page.getByRole('button', { name: 'Approve', exact: true }).click();

  // 5. Export
  await page.getByRole('button', { name: 'Export' }).click();
  await expect(page.getByRole('heading', { name: 'Take it everywhere.' })).toBeVisible();
  await page.getByRole('switch', { name: 'SVG sprite' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download zip' }).click()]);
  expect(download.suggestedFilename()).toBe('fernleaf-icons.zip');
  const zip = await JSZip.loadAsync(await readFile((await download.path())!));
  const files = Object.keys(zip.files);
  expect(files).toContain('svg/coffee-cup.svg');
  expect(files).toContain('png/512/coffee-cup.png');
  expect(files).toContain('react/CoffeeCup.tsx');
  expect(files).toContain('sprite.svg');
  expect(files).toContain('figma/icons.svg');
  const svg = await zip.file('svg/cart.svg')!.async('string');
  expect(svg).toContain('viewBox="0 0 24 24"');
  expect(svg).toMatch(/fill="#1f4d3a"/);
  const png = await zip.file('png/48/cart.png')!.async('uint8array');
  expect(Array.from(png.slice(1, 4))).toEqual([80, 78, 71]); // "PNG"

  // spend is tracked from the API's own cost numbers
  await expect(page.getByTitle(/What this project has cost/)).toHaveText(/\$0\.0/);

  // state survives a reload
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Take it everywhere.' })).toBeVisible();
  await expect(page.getByText('fernleaf-icons.zip')).toBeVisible();
});

test('asks to connect OpenRouter before spending, validates pasted keys', async ({ page }) => {
  // Runs after the beforeEach script, so this page starts without a key.
  await page.addInitScript(() => localStorage.removeItem('aiconify.openrouter.key'));
  await mockOpenRouter(page);
  await page.goto('/');
  await page.getByLabel('Anything else we should know?').fill('A bakery');
  await page.getByRole('button', { name: 'Analyze brand' }).click();
  const dialog = page.getByRole('dialog', { name: 'Connect OpenRouter' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Connect with OpenRouter' })).toBeVisible();

  await dialog.getByLabel('API key').fill('bad');
  await dialog.getByRole('button', { name: 'Save key' }).click();
  await expect(page.getByText(/key was rejected/)).toBeVisible();

  await dialog.getByLabel('API key').fill('sk-or-good');
  await dialog.getByRole('button', { name: 'Save key' }).click();
  await expect(page.getByText('OpenRouter key saved.')).toBeVisible();
  await page.getByRole('button', { name: 'OpenRouter settings' }).click();
  await expect(page.getByText(/\$4\.50 left on this key/)).toBeVisible();
});

test('shows API errors instead of failing silently', async ({ page }) => {
  await mockOpenRouter(page);
  await page.route('https://openrouter.ai/api/v1/chat/completions', (r) =>
    r.fulfill({ status: 402, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"error":{"message":"no credits"}}' }),
  );
  await page.goto('/');
  await page.getByLabel('Anything else we should know?').fill('A bakery');
  await page.getByRole('button', { name: 'Analyze brand' }).click();
  await expect(page.getByRole('alert')).toContainText('balance is too low');
});

test('finishes the OpenRouter sign-in it started, and ignores planted codes', async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem('aiconify.openrouter.key'));
  const log = await mockOpenRouter(page);

  // A link with a code this tab never asked for must not connect anything.
  await page.goto('/?code=planted');
  await expect(page.getByRole('alert')).toContainText('not started from this tab');
  await expect(page.getByRole('button', { name: 'Connect OpenRouter' })).toBeVisible();
  expect(log.auth).toHaveLength(0);
  expect(page.url()).not.toContain('code=');

  // The real flow: Connect stores a PKCE verifier and sends us to OpenRouter, which redirects back.
  await page.route('https://openrouter.ai/auth?**', (r) => {
    const back = new URL(new URL(r.request().url()).searchParams.get('callback_url')!);
    back.searchParams.set('code', 'good');
    return r.fulfill({ status: 302, headers: { location: back.toString() } });
  });
  await page.getByRole('button', { name: 'Connect OpenRouter' }).click();
  await page.getByRole('button', { name: 'Connect with OpenRouter' }).click();
  await expect(page.getByText('OpenRouter connected.')).toBeVisible();
  expect(log.auth).toHaveLength(1);
  expect(log.auth[0].body).toMatchObject({ code: 'good', code_challenge_method: 'S256' });
  expect(await page.evaluate(() => localStorage.getItem('aiconify.openrouter.key'))).toBe('sk-or-from-oauth');
});
