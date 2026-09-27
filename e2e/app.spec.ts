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
  await expect(page.getByRole('heading', { name: 'Set up the icon set' })).toBeVisible();

  // 1. Set up: the brand comes first
  await page.getByLabel('Upload logo').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: logoPng() });
  await expect(page.getByRole('img', { name: 'Your logo' })).toBeVisible();
  await page.getByLabel('Upload brand guidelines PDF').setInputFiles({ name: 'guidelines.pdf', mimeType: 'application/pdf', buffer: guidelinesPdf() });
  await expect(page.getByText(/1 pages · \d+ characters read/)).toBeVisible();
  await page.getByRole('button', { name: 'Analyze brand' }).click();
  await expect(page.getByText('Brand analyzed.')).toBeVisible();
  await expect(page.getByLabel('Set name')).toHaveValue('Fernleaf');
  // PDF text is read in the browser and only the text goes to the model
  expect(JSON.stringify(log.chat[0].body.messages)).toContain('Never use gradients');
  expect(JSON.stringify(log.chat[0].body.messages)).toContain('#1f4d3a');
  // What was found shows up front; editing it is one click away
  await expect(page.getByRole('list', { name: 'Brand colors' })).toContainText('#1f4d3a');
  await expect(page.getByLabel('Your brand').getByText(/Organic/)).toBeVisible();
  await page.getByRole('button', { name: /^Edit colors, personality and rules/ }).click();
  await expect(page.getByRole('button', { name: 'Remove Organic' })).toBeVisible();
  // the logo went to the vision model
  expect(JSON.stringify(log.chat[0].body.messages)).toContain('data:image/png;base64');
  expect(log.chat[0].body.model).toBe('deepseek/deepseek-v4.1-flash');

  // The analysis suggested icons, and the look is previewed as LabVIEW buttons
  await expect(page.getByRole('list', { name: 'Icon names' }).getByRole('listitem')).toHaveCount(16);
  await expect(page.getByRole('img', { name: 'Pump button, false' })).toBeVisible();
  await page.getByRole('radio', { name: /^Duotone/ }).click();
  await page.getByRole('button', { name: 'Prompt' }).click();
  await expect(page.getByText(/duotone icons/)).toBeVisible();
  await page.getByRole('button', { name: 'Suggest' }).click();
  await expect(page.getByRole('list', { name: 'Icon names' }).getByRole('listitem')).toHaveCount(18);
  await page.getByRole('button', { name: 'Remove Wifi' }).click();
  await page.getByRole('button', { name: 'Remove Parking' }).click();

  // 2. Draw: names not drawn yet show as empty tiles
  await page.getByRole('button', { name: 'Continue to Draw' }).click();
  await expect(page.getByLabel('Cart, not drawn yet')).toBeVisible();
  await page.getByRole('button', { name: 'Generate icons' }).click();
  await expect(page.getByText('16 icons ready.')).toBeVisible({ timeout: 30_000 });
  expect(log.images).toHaveLength(1);
  expect(log.images[0].body).toMatchObject({ model: 'openai/gpt-image-2.5-flare', n: 2, background: 'transparent' });
  expect(String(log.images[0].body.prompt)).toContain('exactly 4 rows and 4 columns');
  await page.getByRole('radio', { name: 'Option B' }).click();
  await expect(page.getByRole('radio', { name: 'Option B' })).toHaveAttribute('aria-checked', 'true');

  // Review on the same screen
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

  await page.getByRole('radiogroup', { name: 'Show as' }).getByRole('radio', { name: 'Buttons' }).click();
  await expect(page.getByRole('img', { name: 'Cart button, true' })).toBeVisible();

  // 3. Export: LabVIEW is the default; switch this set to web and design tools
  await page.getByRole('button', { name: 'Continue to Export' }).click();
  await expect(page.getByRole('heading', { name: 'Export', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^LabVIEW/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /^LabVIEW/ }).click();
  await page.getByRole('button', { name: /^Web & apps/ }).click();
  await page.getByRole('button', { name: /^Design tools/ }).click();
  await page.getByRole('button', { name: /^Files & formats/ }).click();
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
  // Duotone line work is traced as real strokes at the style's weight.
  expect(svg).toMatch(/stroke="#1f4d3a" stroke-width="2"/);
  const png = await zip.file('png/48/cart.png')!.async('uint8array');
  expect(Array.from(png.slice(1, 4))).toEqual([80, 78, 71]); // "PNG"

  // spend is tracked from the API's own cost numbers
  await expect(page.getByTitle(/What this project has cost/)).toHaveText(/\$0\.0/);

  // state survives a reload
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Export', exact: true })).toBeVisible();
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

test('industrial set: HMI look, reference icons, LabVIEW and indicator exports', async ({ page }) => {
  const log = await mockOpenRouter(page);
  await page.goto('/');
  await page.getByLabel('Upload logo').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: logoPng() });
  await page.getByRole('button', { name: 'Analyze brand' }).click();
  await expect(page.getByText('Brand analyzed.')).toBeVisible();
  await page.getByRole('button', { name: 'Match an existing icon set' }).click();

  // Match an existing set: two SVG icons in one red, then take their color
  const ref = (d: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${d}" fill="#c0392b"/></svg>`);
  await page.getByLabel('Upload reference icons').setInputFiles([
    { name: 'valve.svg', mimeType: 'image/svg+xml', buffer: ref('M2 6l10 6-10 6zM22 6l-10 6 10 6z') },
    { name: 'pump.svg', mimeType: 'image/svg+xml', buffer: ref('M4 12a8 8 0 1 0 16 0 8 8 0 1 0-16 0z') },
  ]);
  const refs = page.getByRole('list', { name: 'Reference icons' });
  await expect(refs.getByRole('img')).toHaveCount(2);
  await expect(refs.getByRole('img', { name: 'valve' })).toBeVisible();
  const valvePng = await refs.getByRole('img', { name: 'valve' }).getAttribute('src');
  await page.getByRole('button', { name: 'Use their color' }).click();
  await expect(page.getByText(/Main color set to #[0-9A-F]{6} from your icons\./)).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Main color' }).getByRole('radio', { name: /^Reference / })).toHaveAttribute('aria-checked', 'true');

  // Industrial HMI look switches to one ISA-101 grey
  await page.getByRole('radio', { name: 'Industrial HMI' }).click();
  await expect(page.getByRole('radio', { name: 'HMI grey #4d4d4d' })).toHaveAttribute('aria-checked', 'true');

  // Generate: the prompt carries the HMI style and the uploaded icons go first as references
  await page.getByRole('button', { name: 'Continue to Draw' }).click();
  await page.getByRole('button', { name: 'Generate icons' }).click();
  await expect(page.getByText('16 icons ready.')).toBeVisible({ timeout: 30_000 });
  const body = log.images[0].body;
  expect(String(body.prompt)).toContain('ISA-101');
  const inputs = (body.input_references as { image_url: { url: string } }[]).map((r) => r.image_url.url);
  expect(inputs.length).toBeGreaterThanOrEqual(2);
  expect(inputs[0]).toBe(valvePng);

  await page.getByRole('button', { name: 'Approve all' }).click();
  await expect(page.getByText('16 icons · 16 approved')).toBeVisible();

  // Export: LabVIEW is on already; add HMI, see them in place, then fine-tune
  await page.getByRole('button', { name: 'Continue to Export' }).click();
  await page.getByRole('button', { name: /^HMI \/ SCADA/ }).click();
  const place = page.locator('[aria-label="See it in place"]');
  await expect(place.getByLabel('LabVIEW front panel preview')).toBeVisible();
  await place.getByRole('radio', { name: 'HMI screen' }).click();
  await expect(place.getByRole('img', { name: /, Alarm$/ })).toBeVisible();
  await page.getByRole('button', { name: /^Files & formats/ }).click();
  await expect(page.getByRole('switch', { name: /^EMF/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('switch', { name: /^Button states/ })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('radiogroup', { name: 'Button style' }).getByRole('radio', { name: 'Toggle' }).click();
  await page.getByRole('radio', { name: 'Wide, for Boolean text' }).click();
  await expect(page.getByRole('list', { name: 'Button state preview' }).getByRole('listitem')).toHaveCount(4);
  await page.getByLabel(/^Banner text/).fill('daq');
  await expect(page.getByRole('img', { name: /VI icon$/ }).first()).toBeVisible();
  await expect(page.getByRole('list', { name: 'Status preview' }).getByRole('listitem')).toHaveCount(8);
  await page.getByRole('group', { name: 'Indicator kinds' }).getByRole('button', { name: 'Tank level' }).click();

  const count = Number((await page.getByText(/^\d+ files$/).innerText()).split(' ')[0]);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download zip' }).click()]);
  const zip = await JSZip.loadAsync(await readFile((await download.path())!));
  const files = Object.keys(zip.files).filter((f) => !zip.files[f].dir);
  expect(files).toHaveLength(count); // the on-screen list and the zip come from one list

  expect(files).toContain('png/48/cart.png');
  expect(files).toContain('png/48/cart@2x.png');
  expect(files).toContain('emf/cart.emf');
  for (const s of ['false', 'true', 'false-to-true', 'true-to-false']) expect(files).toContain(`labview/buttons/cart/${s}.png`);
  expect(files).toContain('labview/buttons/cart/true@2x.png');
  expect(files).toContain('labview/buttons/cart/true.emf');
  expect(files).toContain('labview/vi-icons/cart.png');
  expect(files).toContain('labview/glyphs/cart.png');
  for (const s of ['normal', 'on', 'off', 'warning', 'alarm', 'manual', 'disabled', 'offline']) expect(files).toContain(`states/${s}/cart.svg`);
  expect(files).toContain('states/on/48/cart.png');
  expect(files).toContain('labview/buttons/cart/true@2x.png');
  expect(files).toContain('labview/indicators/round-led-green-on.png');
  expect(files).toContain('labview/indicators/round-led-red-off.svg');
  expect(files).toContain('labview/indicators/tank-green-050.png');
  expect(files).toContain('labview/README.md');

  const emf = await zip.file('emf/cart.emf')!.async('uint8array');
  expect(new TextDecoder().decode(emf.slice(40, 44))).toBe(' EMF');
  const vi = await zip.file('labview/vi-icons/cart.png')!.async('uint8array');
  expect(new DataView(vi.buffer, vi.byteOffset).getUint32(16)).toBe(32); // IHDR width
  // State parts: the hub the model drew in the key colour is its own layer, and only it changes.
  expect(await zip.file('svg/cart.svg')!.async('string')).toContain('class="active"');
  expect(await zip.file('states/on/cart.svg')!.async('string')).toMatch(/class="active" (fill|stroke)="#2fb344"/);
  const alarm = await zip.file('states/alarm/cart.svg')!.async('string');
  expect(alarm.toLowerCase()).toContain('#d62d20');
  expect(alarm).toMatch(/(fill|stroke)="#4d4d4d"/); // the icon itself stays grey
  expect(await zip.file('labview/README.md')!.async('string')).toMatch(/LabVIEW/);
});
