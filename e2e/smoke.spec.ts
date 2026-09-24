import { expect, test } from '@playwright/test';
import { fresh, go, noHorizontalOverflow, overflowCulprits, ROUTES, shot, trackErrors } from './helpers';

test.describe('smoke: every route', () => {
  for (const r of ROUTES) {
    test(`${r.path} loads with an h1, no errors, no horizontal overflow${r.inFlux ? ' (page in flux)' : ''}`, async ({ page }, info) => {
      const errors = trackErrors(page);
      await fresh(page);
      await go(page, r.path);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('h1')).toHaveText(r.h1);
      await expect(page.locator('main#main')).toBeVisible();
      // give debounced effects a moment
      await page.waitForTimeout(300);
      const culprits = await overflowCulprits(page);
      if (culprits.length) await shot(page, info, `overflow${r.path.replace(/\//g, '_')}`);
      await noHorizontalOverflow(page);
      expect(errors, errors.join('\n')).toEqual([]);
      // document title set per page
      await expect(page).toHaveTitle(/Logic Studio/);
    });
  }

  test('unknown route shows a not-found page with a way back', async ({ page }) => {
    const errors = trackErrors(page);
    await fresh(page);
    await go(page, '/does-not-exist');
    await expect(page.locator('h1')).toContainText(/not found/i);
    await expect(page.locator('main a[href]').first()).toBeVisible();
    expect(errors).toEqual([]);
  });
});
