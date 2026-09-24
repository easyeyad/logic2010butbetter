import { expect, test } from '@playwright/test';
import { fresh, go, isPhone, ROUTES, trackErrors } from './helpers';

const MOBILE_TABS = ['/', '/proofs', '/truth-tables', '/countermodels', '/reference'];

test.describe('navigation', () => {
  test('every page is reachable from the main navigation; active link has aria-current', async ({ page }) => {
    const errors = trackErrors(page);
    await fresh(page);
    await go(page, '/');
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav).toBeVisible();

    for (const r of ROUTES) {
      if (isPhone(page)) {
        if (MOBILE_TABS.includes(r.path)) {
          await nav.locator(`a[href="#${r.path}"]`).click();
        } else {
          await nav.getByRole('button', { name: 'More' }).click();
          const sheet = page.getByRole('dialog', { name: 'More' });
          await expect(sheet).toBeVisible();
          await sheet.locator(`a[href="#${r.path}"]`).click();
          await expect(sheet).toBeHidden();
        }
      } else {
        await nav.locator(`a[href="#${r.path}"]`).click();
      }
      await expect(page).toHaveURL(new RegExp(`#${r.path.replace(/\//g, '\\/')}$`));
      await expect(page.locator('h1')).toHaveText(r.h1);

      if (isPhone(page) && !MOBILE_TABS.includes(r.path)) {
        // the "More" tab represents the current page
        await expect(nav.getByRole('button', { name: 'More' })).toHaveAttribute('aria-current', 'page');
      } else {
        await expect(nav.locator(`a[href="#${r.path}"]`)).toHaveAttribute('aria-current', 'page');
      }
      // exactly one current link in the main nav
      await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
    }
    expect(errors).toEqual([]);
  });

  test('focus moves to the page heading after navigation (page chunk already loaded)', async ({ page }) => {
    await fresh(page);
    await go(page, '/reference');
    await go(page, '/');
    const nav = page.getByRole('navigation', { name: 'Main' });
    if (isPhone(page)) await nav.locator('a[href="#/reference"]').click();
    else await nav.locator('a[href="#/reference"]').click();
    await expect(page.locator('h1')).toHaveText('Reference');
    await expect(page.locator('h1')).toBeFocused();
  });

  // BUG (ui, minor/a11y): AppShell focuses #page-title in an effect on pathname
  // change, but lazy pages are still suspended then (no h1 yet), so on the FIRST
  // visit to Proofs/Truth Tables/Countermodels/Reference/Settings focus stays on
  // the nav link and screen-reader users aren't told the page changed.
  test.fail('BUG: focus moves to the page heading on first visit to a lazy-loaded page', async ({ page }) => {
    await fresh(page);
    await go(page, '/');
    const nav = page.getByRole('navigation', { name: 'Main' });
    await nav.locator('a[href="#/reference"]').click();
    await expect(page.locator('h1')).toHaveText('Reference');
    await expect(page.locator('h1')).toBeFocused({ timeout: 3000 });
  });

  test('skip link is the first tab stop and moves focus to main content', async ({ page }) => {
    await fresh(page);
    await go(page, '/truth-tables');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page.locator('main#main')).toBeFocused();
    // next Tab goes into the page content, not back into the nav
    await page.keyboard.press('Tab');
    const inMain = await page.evaluate(() => document.getElementById('main')!.contains(document.activeElement));
    expect(inMain).toBe(true);
  });

  test('More sheet closes with Escape and returns focus to the More button (phone only)', async ({ page }) => {
    test.skip(!isPhone(page), 'phone layouts only');
    await fresh(page);
    await go(page, '/');
    const more = page.getByRole('button', { name: 'More' });
    await more.click();
    const sheet = page.getByRole('dialog', { name: 'More' });
    await expect(sheet).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(more).toBeFocused();
  });

  test('tablet/desktop nav can be expanded/collapsed and keeps working', async ({ page }) => {
    test.skip(isPhone(page), 'no sidebar on phones');
    await fresh(page);
    await go(page, '/');
    const toggle = page.getByRole('button', { name: /Expand|Collapse/ });
    await expect(toggle).toBeVisible();
    const before = await toggle.getAttribute('aria-expanded');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', before === 'true' ? 'false' : 'true');
    await page.getByRole('navigation', { name: 'Main' }).locator('a[href="#/settings"]').click();
    await expect(page.locator('h1')).toHaveText('Settings');
  });
});
