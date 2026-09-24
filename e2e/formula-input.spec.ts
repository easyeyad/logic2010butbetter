import { expect, test } from '@playwright/test';
import { fresh, go, trackErrors } from './helpers';

test.describe('formula input', () => {
  test.beforeEach(async ({ page }) => {
    await fresh(page);
    await go(page, '/truth-tables');
  });

  test('typing ASCII "~P & Q -> R" becomes "¬P ∧ Q → R" and is accepted', async ({ page }) => {
    const errors = trackErrors(page);
    const input = page.getByLabel('Formula 1', { exact: true });
    await input.click();
    await page.keyboard.type('~P & Q -> R', { delay: 20 });
    await expect(input).toHaveValue('¬P ∧ Q → R');
    await expect(page.getByText('Well-formed formula')).toBeAttached();
    await expect(input).not.toHaveAttribute('aria-invalid', 'true');
    // table appears
    await expect(page.locator('table.tt')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('other ASCII aliases: <-> and v and |', async ({ page }) => {
    const input = page.getByLabel('Formula 1', { exact: true });
    await input.click();
    await page.keyboard.type('(P v Q) <-> (Q | P)', { delay: 15 });
    await expect(input).toHaveValue('(P ∨ Q) ↔ (Q ∨ P)');
  });

  test('"¬(P ∧ → Q)" shows an explanatory error that mentions → and highlights the span', async ({ page }) => {
    const input = page.getByLabel('Formula 1', { exact: true });
    await input.fill('¬(P ∧ → Q)');
    const err = page.locator('.fi__error');
    await expect(err).toBeVisible();
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    // error is programmatically associated with the input
    const describedBy = await input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const msgText = await page.locator(`[id="${describedBy!.split(' ')[0]}"]`).innerText();
    expect(msgText).toMatch(/→|∧/);
    expect(msgText).toContain('→');
    expect(msgText).toMatch(/Not well-formed/);
    // highlighted span
    const mark = err.locator('mark.fx-err');
    await expect(mark).toHaveCount(1);
    const marked = (await mark.innerText()).trim();
    expect(['→', '∧', '∧ →', '', ' ']).toContain(marked);
    // no table while invalid
    await expect(page.getByText('Fix the highlighted formula first')).toBeVisible();
  });

  test('symbol toolbar inserts at the caret, not at the end', async ({ page }) => {
    const input = page.getByLabel('Formula 1', { exact: true });
    await input.fill('P Q');
    await input.click();
    // caret right after "P"
    await input.evaluate((el: HTMLInputElement) => el.setSelectionRange(1, 1));
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowRight');
    const bar = page.getByRole('toolbar', { name: /Insert symbol into Formula 1/ });
    await bar.getByRole('button', { name: 'Insert and (conjunction)' }).click();
    await expect(input).toHaveValue(/^P\s*∧\s*Q$/);
    await expect(input).toBeFocused();
    // insert ¬ at the very start
    await input.evaluate((el: HTMLInputElement) => el.setSelectionRange(0, 0));
    await bar.getByRole('button', { name: 'Insert not (negation)' }).click();
    await expect(input).toHaveValue(/^¬P\s*∧\s*Q$/);
  });

  test('symbol toolbar buttons are keyboard operable', async ({ page }) => {
    const input = page.getByLabel('Formula 1', { exact: true });
    await input.fill('P');
    const btn = page.getByRole('button', { name: 'Insert if … then (conditional)' });
    await btn.focus();
    await page.keyboard.press('Enter');
    await expect(input).toHaveValue(/^P\s*→\s*$/);
  });

  test('empty and whitespace input shows the empty state, not an error', async ({ page }) => {
    const input = page.getByLabel('Formula 1', { exact: true });
    await input.fill('   ');
    await expect(page.getByText('Your table will appear here')).toBeVisible();
    await expect(page.locator('.fi__error')).toHaveCount(0);
  });

  test('pathological input does not crash the page', async ({ page }) => {
    const errors = trackErrors(page);
    const input = page.getByLabel('Formula 1', { exact: true });
    for (const s of ['🙂', 'P → 🙂', '))))((((', 'p & q', 'Ρ ∧ Q', 'P'.repeat(500), '('.repeat(300) + 'P' + ')'.repeat(300)]) {
      await input.fill(s);
      await page.waitForTimeout(250);
      await expect(page.locator('h1')).toHaveText('Truth Tables');
    }
    expect(errors.filter((e) => !/Maximum call stack/.test(e))).toEqual([]);
  });
});
