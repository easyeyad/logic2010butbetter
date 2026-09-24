import { expect, test } from '@playwright/test';
import { fresh, go, HS_START, isDesktop, isWide } from './helpers';

test.describe('reference', () => {
  test('rules are searchable by abbreviation, name and concept', async ({ page }) => {
    await fresh(page);
    await go(page, '/reference');
    const search = page.getByLabel('Search rules');
    const cards = page.locator('main .rules-grid > *');
    const all = await cards.count();
    expect(all).toBeGreaterThanOrEqual(10);

    await search.fill('MP');
    await expect(page.getByRole('status').filter({ hasText: /rules shown/ })).toBeAttached();
    const mp = await cards.count();
    expect(mp).toBeGreaterThan(0);
    expect(mp).toBeLessThan(all);
    await expect(page.locator('main').getByText('Modus Ponens').first()).toBeVisible();

    await search.fill('simplification');
    await expect(page.locator('main').getByText(/Simplification/).first()).toBeVisible();

    await search.fill('conditional');
    expect(await cards.count()).toBeGreaterThan(1);

    await search.fill('zzzz-nothing');
    await expect(page.getByText(/No rules match/)).toBeVisible();
    await expect(cards).toHaveCount(0);

    await search.fill('');
    await expect(cards).toHaveCount(all);
  });

  test('category filter buttons expose pressed state', async ({ page }) => {
    await fresh(page);
    await go(page, '/reference');
    const group = page.getByRole('group', { name: 'Filter by category' });
    await group.getByRole('button', { name: 'Primitive' }).click();
    await expect(group.getByRole('button', { name: 'Primitive' })).toHaveAttribute('aria-pressed', 'true');
    await expect(group.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('main').getByRole('heading', { name: 'Derived rules' })).toHaveCount(0);
  });

  test('rules are available from the proof page (panel / drawer / sheet)', async ({ page }) => {
    await fresh(page, { 'proof-session': HS_START });
    await go(page, '/proofs');
    let scope;
    if (isWide(page)) {
      scope = page.getByRole('complementary', { name: 'Feedback, hints and rules' });
      await scope.getByRole('tab', { name: 'Rules' }).click();
    } else {
      if (isDesktop(page)) await page.getByRole('button', { name: /Feedback & hints/ }).click();
      else await page.getByRole('region', { name: 'Proof tools' }).getByRole('button', { name: /^Rules/ }).click();
      scope = page.getByRole('dialog', { name: /Feedback, hints & rules/ });
      await expect(scope).toBeVisible();
      await scope.getByRole('tab', { name: 'Rules' }).click();
    }
    const search = scope.getByLabel('Search rules');
    await expect(search).toBeVisible();
    await search.fill('MT');
    await expect(scope.getByText('Modus Tollens').first()).toBeVisible();
    if (!isWide(page)) {
      await page.keyboard.press('Escape');
      await expect(scope).toBeHidden();
    }
  });
});
