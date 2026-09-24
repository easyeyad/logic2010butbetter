import { expect, test, type Page } from '@playwright/test';
import { fresh, go } from './helpers';

async function argument(page: Page, premises: string[], conclusion: string) {
  // default page state has two premise rows
  for (let i = 0; i < premises.length; i++) {
    const field = page.getByLabel(`Premise ${i + 1}`, { exact: true });
    if (!(await field.count())) await page.getByRole('button', { name: 'Add premise' }).click();
    await page.getByLabel(`Premise ${i + 1}`, { exact: true }).fill(premises[i]);
  }
  await page.getByLabel('Conclusion', { exact: true }).fill(conclusion);
  await page.getByRole('button', { name: 'Check validity' }).click();
}

async function assignment(page: Page): Promise<Record<string, string>> {
  const cards = page.locator('.atom-card');
  const out: Record<string, string> = {};
  for (const c of await cards.all()) {
    const name = (await c.locator('.atom-card__name').innerText()).trim();
    const text = await c.innerText();
    out[name] = /True/.test(text) ? 'T' : /False/.test(text) ? 'F' : '?';
  }
  return out;
}

test.describe('countermodels', () => {
  test.beforeEach(async ({ page }) => {
    await fresh(page);
    await go(page, '/countermodels');
  });

  test('P → Q, Q ⊢ P is invalid with countermodel P false, Q true', async ({ page }) => {
    await argument(page, ['P → Q', 'Q'], 'P');
    const verdict = page.getByRole('region', { name: 'Verdict' });
    await expect(verdict.getByText('Invalid', { exact: true })).toBeVisible();
    expect(await assignment(page)).toEqual({ P: 'F', Q: 'T' });
    // evaluation list: premises true, conclusion false, in words not just color
    const evals = page.locator('.eval-list li');
    await expect(evals.nth(0)).toContainText('True');
    await expect(evals.nth(1)).toContainText('True');
    await expect(evals.nth(2)).toContainText('False');
  });

  test('P → Q, P ⊢ Q is valid', async ({ page }) => {
    await argument(page, ['P → Q', 'P'], 'Q');
    const verdict = page.getByRole('region', { name: 'Verdict' });
    await expect(verdict.getByText('Valid', { exact: true })).toBeVisible();
    await expect(verdict).toContainText('checked 4 rows');
    await expect(page.locator('.atom-card')).toHaveCount(0);
  });

  test('inconsistent premises: valid vacuously, explained', async ({ page }) => {
    await argument(page, ['P', '¬P'], 'Q');
    await expect(page.getByText(/valid vacuously/)).toBeVisible();
  });

  test('ill-formed input gives a clear message instead of a verdict', async ({ page }) => {
    await argument(page, ['P → ', 'Q'], 'P');
    await expect(page.getByText(/Premise 1 isn't well-formed/)).toBeVisible();
  });

  test('example chip runs immediately (Affirming the consequent)', async ({ page }) => {
    await page.getByRole('button', { name: 'Affirming the consequent' }).click();
    await expect(page.getByRole('region', { name: 'Verdict' }).getByText('Invalid', { exact: true })).toBeVisible();
  });

  test('Enter in the conclusion field submits', async ({ page }) => {
    await page.getByLabel('Premise 1', { exact: true }).fill('P ∧ Q');
    await page.getByLabel('Premise 2', { exact: true }).fill('R');
    await page.getByLabel('Conclusion', { exact: true }).fill('Q');
    await page.getByLabel('Conclusion', { exact: true }).press('Enter');
    await expect(page.getByRole('region', { name: 'Verdict' }).getByText('Valid', { exact: true })).toBeVisible();
  });
});
