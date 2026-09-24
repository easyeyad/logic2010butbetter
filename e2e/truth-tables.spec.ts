import { expect, test, type Page } from '@playwright/test';
import { fresh, go, noHorizontalOverflow } from './helpers';

/** Standard row order: first letter T for the top half. */
function valuations(atoms: string[]): Record<string, boolean>[] {
  const n = atoms.length;
  return Array.from({ length: 1 << n }, (_, r) => Object.fromEntries(atoms.map((a, i) => [a, ((r >> (n - 1 - i)) & 1) === 0])));
}

async function enter(page: Page, formula: string) {
  await page.getByLabel('Formula 1', { exact: true }).fill(formula);
}

async function mainColumn(page: Page): Promise<boolean[]> {
  const cells = page.locator('table.tt tbody tr').locator('.tt__main');
  const texts = await cells.allInnerTexts();
  return texts.map((t) => {
    const v = t.trim();
    if (v !== 'T' && v !== 'F') throw new Error(`unexpected cell text "${v}"`);
    return v === 'T';
  });
}

test.describe('truth tables (automatic)', () => {
  test.beforeEach(async ({ page }) => {
    await fresh(page);
    await go(page, '/truth-tables');
  });

  test('(P → Q) ↔ (¬Q → ¬P) is a tautology', async ({ page }) => {
    await enter(page, '(P → Q) ↔ (¬Q → ¬P)');
    await expect(page.locator('table.tt tbody tr')).toHaveCount(4);
    expect(await mainColumn(page)).toEqual([true, true, true, true]);
    await expect(page.locator('.verdict .badge')).toHaveText(/Tautology/);
    // not color only: badge has an icon + word
    await expect(page.locator('.verdict .badge svg')).toHaveCount(1);
  });

  test('P ∧ ¬P is a contradiction', async ({ page }) => {
    await enter(page, 'P ∧ ¬P');
    await expect(page.locator('table.tt tbody tr')).toHaveCount(2);
    expect(await mainColumn(page)).toEqual([false, false]);
    await expect(page.locator('.verdict .badge')).toHaveText(/Contradiction/);
  });

  test('(P ∧ Q) → R is contingent with 8 correct rows', async ({ page }, info) => {
    await enter(page, '(P ∧ Q) → R');
    await expect(page.locator('table.tt tbody tr')).toHaveCount(8);
    const expected = valuations(['P', 'Q', 'R']).map((v) => !(v.P && v.Q) || v.R);
    expect(await mainColumn(page)).toEqual(expected);
    // atom columns in standard order
    const firstCol = await page.locator('table.tt tbody tr').locator('th.tt__atom >> nth=0').allInnerTexts();
    expect(firstCol.map((t) => t.trim())).toEqual(['T', 'T', 'T', 'T', 'F', 'F', 'F', 'F']);
    await expect(page.locator('.verdict .badge')).toHaveText(/Contingent/);
    await expect(page.getByText(/True in 7 of 8 rows/)).toBeVisible();
    // headers expose the main formula to AT
    await expect(page.locator('table.tt thead th.tt__main')).toContainText('(main formula)');
    // wide tables scroll inside their region, not the page
    await noHorizontalOverflow(page);
    void info;
  });

  test('multiple formulas via comma produce one verdict each', async ({ page }) => {
    await page.getByLabel('Formula 1', { exact: true }).fill('P ∨ ¬P, P ∧ ¬P');
    await expect(page.getByLabel('Formula 2', { exact: true })).toHaveValue('P ∧ ¬P');
    await expect(page.locator('.verdict')).toHaveCount(2);
  });

  test('10 sentence letters: 1024 rows render without page overflow', async ({ page }) => {
    test.setTimeout(60_000);
    await enter(page, '((A ∧ B) ∨ (C → D)) ↔ ((E ∨ F) ∧ ((G → H) ∨ ¬(I ↔ J)))');
    await expect(page.locator('table.tt tbody tr')).toHaveCount(1024, { timeout: 15_000 });
    await noHorizontalOverflow(page);
  });
});

test.describe('truth tables (practice)', () => {
  test.beforeEach(async ({ page }) => {
    await fresh(page);
    await go(page, '/truth-tables');
    await enter(page, 'P ∧ ¬P');
    await page.getByRole('button', { name: 'Practice', exact: true }).click();
    await expect(page.getByRole('grid')).toBeVisible();
  });

  test('keyboard entry + check gives per-cell feedback (icon + word) and a summary', async ({ page }) => {
    const grid = page.getByRole('grid');
    const first = grid.locator('[data-cell="0:1"]');
    await first.focus();
    // column ¬P: row0 F, row1 T (typing moves down)
    await page.keyboard.press('f');
    await page.keyboard.press('t');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowUp');
    await expect(grid.locator('[data-cell="0:2"]')).toBeFocused();
    // main column: deliberately wrong on row 0
    await page.keyboard.press('t');
    await page.keyboard.press('f');
    await page.getByRole('button', { name: 'Check', exact: true }).click();
    const status = page.getByRole('status').filter({ hasText: /cells correct/ });
    await expect(status).toContainText('3 of 4 cells correct');
    await expect(status).toContainText('1 incorrect');
    await expect(grid.locator('[data-cell="0:2"]')).toHaveAttribute('aria-label', /incorrect/);
    await expect(grid.locator('[data-cell="0:2"] svg')).toHaveCount(1);
    // fix it
    await grid.locator('[data-cell="0:2"]').focus();
    await page.keyboard.press('f');
    await page.getByRole('button', { name: 'Check', exact: true }).click();
    await expect(page.getByText('All correct!')).toBeVisible();
  });

  test('hint explains a column before any solution is shown', async ({ page }) => {
    await page.getByRole('button', { name: 'Hint', exact: true }).click();
    await expect(page.getByText(/Hint for column/)).toBeVisible();
    await expect(page.getByText(/negation/i).first()).toBeVisible();
    // cells still blank
    await expect(page.getByRole('grid').locator('[data-cell="0:2"]')).toHaveAttribute('aria-label', /blank/);
  });

  test('Show solution requires confirmation; cancel leaves the grid untouched', async ({ page }) => {
    await page.getByRole('button', { name: 'Show solution' }).click();
    const dlg = page.getByRole('alertdialog', { name: 'Show the solution?' });
    await expect(dlg).toBeVisible();
    // safe default focus is Cancel
    await expect(dlg.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await dlg.getByRole('button', { name: 'Cancel' }).click();
    await expect(dlg).toBeHidden();
    await expect(page.getByRole('grid').locator('[data-cell="0:2"]')).toHaveAttribute('aria-label', /blank/);
    await page.getByRole('button', { name: 'Show solution' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Show solution' }).click();
    await expect(page.getByText(/All correct!/)).toBeVisible();
    await expect(page.getByText(/solution shown/)).toBeVisible();
  });
});
