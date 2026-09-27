import { test } from '@playwright/test';
import { logoPng, mockOpenRouter } from './mock';

// Captures every step for docs and visual review: `SCREENS=1 npx playwright test screens`.
test.skip(!process.env.SCREENS, 'screenshots only on demand');

for (const scheme of ['light', 'dark'] as const) {
  test(`screens ${scheme}`, async ({ page }, info) => {
    const dir = `screens/${info.project.name}-${scheme}`;
    const shot = async (name: string) => {
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
    };
    await page.emulateMedia({ colorScheme: scheme });
    await page.addInitScript(() => localStorage.setItem('aiconify.openrouter.key', 'sk-or-test'));
    await mockOpenRouter(page);
    await page.goto('/');
    await shot('0-empty');

    // Set up: a LabVIEW pack, then the brand kit
    await page.getByRole('button', { name: 'Add Operator panel pack' }).click();
    await shot('1-setup');
    await page.getByLabel('Upload logo').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: logoPng() });
    await page.getByRole('button', { name: 'Analyze brand' }).click();
    await page.getByText('Brand analyzed.').waitFor();
    await page.getByRole('radio', { name: /^Duotone/ }).click();
    await shot('1b-setup-brand');
    await page.getByRole('radio', { name: 'Industrial HMI' }).click();
    await shot('1c-setup-hmi');
    await page.getByRole('radio', { name: 'Your colors' }).click();
    await page.getByRole('button', { name: 'Clear' }).click();
    await page.getByRole('button', { name: 'Add Process equipment pack' }).click();

    // Draw
    await page.getByRole('button', { name: 'Continue to Draw' }).click();
    await shot('2a-draw-empty');
    await page.getByRole('button', { name: 'Generate icons' }).click();
    await page.getByText('16 icons ready.').waitFor();
    await shot('2b-draw');
    await page.getByRole('radiogroup', { name: 'Show as' }).getByRole('radio', { name: 'Buttons' }).click();
    await shot('2c-draw-buttons');

    // Export
    await page.getByRole('button', { name: 'Continue to Export' }).click();
    await shot('3a-export');
    await page.getByRole('button', { name: /^HMI \/ SCADA/ }).click();
    const place = page.locator('[aria-label="See it in place"]');
    for (const [tab, file] of [['HMI screen', '3b-hmi'], ['Web', '3c-web'], ['Sizes', '3d-sizes']]) {
      await place.getByRole('radio', { name: tab }).click();
      await page.waitForTimeout(300);
      await place.screenshot({ path: `${dir}/${file}.png` });
    }
    await shot('3e-export-hmi');
  });
}
