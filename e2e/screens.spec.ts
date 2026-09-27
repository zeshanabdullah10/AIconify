import { test } from '@playwright/test';
import { logoPng, mockOpenRouter } from './mock';

// Captures every step for docs and visual review: `SCREENS=1 npx playwright test screens`.
test.skip(!process.env.SCREENS, 'screenshots only on demand');

for (const scheme of ['light', 'dark'] as const) {
  test(`screens ${scheme}`, async ({ page }, info) => {
    const dir = `screens/${info.project.name}-${scheme}`;
    await page.emulateMedia({ colorScheme: scheme });
    await page.addInitScript(() => localStorage.setItem('aiconify.openrouter.key', 'sk-or-test'));
    await mockOpenRouter(page);
    await page.goto('/');
    await page.screenshot({ path: `${dir}/0-empty.png`, fullPage: true });
    await page.getByLabel('Upload logo').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: logoPng() });
    await page.getByRole('button', { name: 'Analyze brand' }).click();
    await page.getByText('Brand analyzed.').waitFor();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${dir}/1-brand.png`, fullPage: true });
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('radio', { name: /Duotone/ }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${dir}/2-style.png`, fullPage: true });
    await page.getByLabel('Upload reference icons').setInputFiles({ name: 'mark.png', mimeType: 'image/png', buffer: logoPng() });
    await page.getByRole('img', { name: 'mark' }).waitFor();
    await page.getByRole('radio', { name: 'Industrial HMI' }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${dir}/2b-style-industrial.png`, fullPage: true });
    await page.getByRole('button', { name: 'Remove reference mark' }).click();
    await page.getByRole('radiogroup', { name: 'Look' }).getByRole('radio', { name: 'Brand' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${dir}/3a-generate.png`, fullPage: true });
    await page.getByRole('button', { name: 'Generate icons' }).click();
    await page.getByText('16 icons ready.').waitFor();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${dir}/3b-generated.png`, fullPage: true });
    await page.getByRole('button', { name: 'Review icons' }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${dir}/4-review.png`, fullPage: true });
    await page.getByRole('button', { name: 'Export' }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${dir}/5-export.png`, fullPage: true });
    for (const name of [/^EMF/, /^Button states/, /^VI icons/, /^Status variants/, /^Indicators/]) await page.getByRole('switch', { name }).click();
    await page.getByLabel(/^Banner text/).fill('DAQ');
    await page.getByRole('group', { name: 'Indicator kinds' }).getByRole('button', { name: 'Tank level' }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${dir}/5b-export-labview.png`, fullPage: true });
  });
}
