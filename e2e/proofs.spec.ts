import { expect, test, type Page } from '@playwright/test';
import {
  fresh,
  go,
  HS_START,
  isDesktop,
  isPhone,
  isWide,
  lineFormula,
  lineRefs,
  lineRule,
  noHorizontalOverflow,
  overflowCulprits,
  proofDoc,
  shot,
  trackErrors,
} from './helpers';

const lines = (page: Page) => page.locator('ol.proof-lines > li');

async function typeLine(page: Page, n: number, formula: string, rule: string, refs?: string) {
  await expect(lineFormula(page, n)).toBeFocused();
  await page.keyboard.type(formula, { delay: 10 });
  await page.keyboard.press('Tab');
  await expect(lineRule(page, n)).toBeFocused();
  await page.keyboard.type(rule, { delay: 10 });
  if (refs !== undefined) {
    await page.keyboard.press('Tab');
    await expect(lineRefs(page, n)).toBeFocused();
    await page.keyboard.type(refs, { delay: 10 });
  }
}

/** Open the side panel tab (column, drawer or bottom sheet depending on width). */
async function openAssist(page: Page, tab: 'Feedback' | 'Hints' | 'Rules') {
  if (isWide(page)) {
    await page.getByRole('complementary', { name: 'Feedback, hints and rules' }).getByRole('tab', { name: new RegExp(`^${tab}`) }).click();
    return page.getByRole('complementary', { name: 'Feedback, hints and rules' });
  }
  if (isDesktop(page)) {
    await page.getByRole('button', { name: /Feedback & hints/ }).click();
  } else {
    await page.getByRole('region', { name: 'Proof tools' }).getByRole('button', { name: new RegExp(`^${tab}`) }).click();
  }
  const dlg = page.getByRole('dialog', { name: /Feedback, hints & rules/ });
  await expect(dlg).toBeVisible();
  await dlg.getByRole('tab', { name: new RegExp(`^${tab}`) }).click();
  return dlg;
}

test.describe('proofs', () => {
  test('hypothetical syllogism, keyboard only, reaches "Proof complete"', async ({ page }, info) => {
    const errors = trackErrors(page);
    await fresh(page, { 'proof-session': HS_START });
    await go(page, '/proofs');
    await expect(lines(page)).toHaveCount(4);
    await lineFormula(page, 4).focus();

    // 4: P  ASS CD
    await typeLine(page, 4, 'P', 'ass cd');
    await page.keyboard.press('Enter'); // pick from the list (or no-op)
    await expect(lineRule(page, 4)).toHaveValue('ASS CD');
    // Enter inserts a new line inside the box
    await lineFormula(page, 4).focus();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await expect(lines(page)).toHaveCount(5);
    // 5: Q  MP 1,4
    await typeLine(page, 5, 'Q', 'mp', '1 4');
    await page.keyboard.press('Enter');
    await expect(lines(page)).toHaveCount(6);
    // 6: R  MP 2,5
    await typeLine(page, 6, 'R', 'mp', '2,5');
    await expect(lineRule(page, 6)).toHaveValue('MP');

    // close the box: Ctrl+Shift+Enter from inside the box
    await lineFormula(page, 6).focus();
    await page.keyboard.press('Control+Shift+Enter');
    const dlg = page.getByRole('dialog', { name: /Close the box for line 3/ });
    await expect(dlg).toBeVisible();
    await expect(dlg.getByRole('radio', { name: /CD/ })).toBeChecked();
    const refs = dlg.getByLabel('Cited lines');
    await refs.focus();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('6');
    await page.keyboard.press('Enter');
    await expect(dlg).toBeHidden();

    await expect(page.locator('.proof-done')).toContainText('Proof complete', { timeout: 5000 });
    await expect(page.locator('.proof-done')).toHaveAttribute('role', 'status');
    await shot(page, info, 'proof-complete');
    expect(errors).toEqual([]);
  });

  test('invalid step shows an explanatory message and a non-color status', async ({ page }) => {
    await fresh(page, {
      'proof-session': proofDoc([
        { id: 'a', kind: 'premise', text: 'P → Q', depth: 0 },
        { id: 'b', kind: 'premise', text: 'Q → R', depth: 0 },
        { id: 'c', kind: 'show', text: 'P → R', depth: 0 },
        { id: 'd', kind: 'assumption', text: 'P', depth: 1, assumption: 'CD' },
        { id: 'e', kind: 'step', text: 'Q', depth: 1, rule: 'S', refs: [1] },
      ]),
    });
    await go(page, '/proofs');
    const row = lines(page).nth(4);
    await lineFormula(page, 5).focus();
    // status is conveyed with an icon + hidden text, not color alone
    await expect(row.locator('.line__status svg')).toHaveCount(1, { timeout: 5000 });
    await expect(row.locator('.line__status')).toContainText(/problem/i);
    await expect(row).toHaveAttribute('aria-label', /Line 5: Has a problem/);
    const msg = row.locator('.line__msg--error').first();
    await expect(msg).toBeVisible();
    const text = await msg.innerText();
    expect(text).toMatch(/S|Simplification/);
    expect(text).toMatch(/conditional|conjunction/i);
    expect(text.length).toBeGreaterThan(40);
    expect(text).not.toMatch(/^\s*error:\s*incorrect\.?\s*$/i);
    await expect(msg.locator('svg')).toHaveCount(1);
    // message is tied to the input for screen readers
    const describedBy = await lineFormula(page, 5).getAttribute('aria-describedby');
    expect(describedBy ?? '').toContain('line-msg-');
  });

  test('editing an earlier line keeps later lines', async ({ page }) => {
    await fresh(page, {
      'proof-session': proofDoc([
        { id: 'a', kind: 'premise', text: 'P → Q', depth: 0 },
        { id: 'b', kind: 'premise', text: 'Q → R', depth: 0 },
        { id: 'c', kind: 'show', text: 'P → R', depth: 0 },
        { id: 'd', kind: 'assumption', text: 'P', depth: 1, assumption: 'CD' },
        { id: 'e', kind: 'step', text: 'Q', depth: 1, rule: 'MP', refs: [1, 4] },
        { id: 'f', kind: 'step', text: 'R', depth: 1, rule: 'MP', refs: [2, 5] },
      ]),
    });
    await go(page, '/proofs');
    await expect(lines(page)).toHaveCount(6);
    const f5 = lineFormula(page, 5);
    await f5.click();
    await page.keyboard.press('End');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('S');
    await expect(f5).toHaveValue('S');
    await expect(lines(page)).toHaveCount(6);
    await expect(lineFormula(page, 6)).toHaveValue('R');
    await expect(lineRule(page, 6)).toHaveValue('MP');
    await expect(lineRefs(page, 6)).toHaveValue(/2,\s*5/);
    // line 5 is now flagged; line 6 still present and depends on it
    await expect(lines(page).nth(4)).toHaveAttribute('aria-label', /Has a problem/, { timeout: 5000 });
    // put it back: everything is fine again
    await f5.click();
    await page.keyboard.press('End');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('Q');
    await expect(lines(page).nth(4)).toHaveAttribute('aria-label', /Correct/, { timeout: 5000 });
  });

  test('delete a line from its menu, then undo (toast and Ctrl+Z)', async ({ page }) => {
    await fresh(page, {
      'proof-session': proofDoc([
        { id: 'a', kind: 'premise', text: 'P → Q', depth: 0 },
        { id: 'b', kind: 'premise', text: 'Q → R', depth: 0 },
        { id: 'c', kind: 'show', text: 'P → R', depth: 0 },
        { id: 'd', kind: 'assumption', text: 'P', depth: 1, assumption: 'CD' },
        { id: 'e', kind: 'step', text: 'Q', depth: 1, rule: 'MP', refs: [1, 4] },
        { id: 'f', kind: 'step', text: 'R', depth: 1, rule: 'MP', refs: [2, 5] },
      ]),
    });
    await go(page, '/proofs');
    await page.getByRole('button', { name: 'Actions for line 5' }).click();
    await page.getByRole('menuitem', { name: /Delete line/ }).click();
    await expect(lines(page)).toHaveCount(5);
    await expect(lineFormula(page, 5)).toHaveValue('R');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(lines(page)).toHaveCount(6);
    await expect(lineFormula(page, 5)).toHaveValue('Q');
    // keyboard: delete shortcut + Ctrl+Z
    await lineFormula(page, 6).focus();
    await page.keyboard.press('Control+Shift+Backspace');
    await expect(lines(page)).toHaveCount(5);
    await page.keyboard.press('Control+z');
    await expect(lines(page)).toHaveCount(6);
    await expect(lineFormula(page, 6)).toHaveValue('R');
  });

  // BUG (ui, minor): currently fails at 1440 and 1280 (three-column layout squeezes the
  // derivation column: a depth-2/depth-4 Show line's formula field is 106–112px and wraps
  // onto 3 lines) and at 375 (depth-4 Show line 119px). Passes at 1024/768/430/390.
  test('long proof (22 lines, 4+ nesting levels) stays usable at this width', async ({ page }, info) => {
    const ls: Array<Record<string, unknown>> = [
      { id: 'p1', kind: 'premise', text: '(P → Q) ∧ (R → S)', depth: 0 },
      { id: 'p2', kind: 'premise', text: '(Q ∨ S) → ((T ↔ U) ∧ ¬(V ∨ W))', depth: 0 },
      { id: 's0', kind: 'show', text: '((P ∧ R) → (T ↔ U)) ∧ ¬¬((V → W) ∨ (W → V))', depth: 0 },
      { id: 's1', kind: 'show', text: '(P ∧ R) → (T ↔ U)', depth: 1 },
      { id: 'a1', kind: 'assumption', text: 'P ∧ R', depth: 2, assumption: 'CD' },
      { id: 's2', kind: 'show', text: '¬¬(T ↔ U)', depth: 2 },
      { id: 'a2', kind: 'assumption', text: '¬(T ↔ U)', depth: 3, assumption: 'ID' },
      { id: 's3', kind: 'show', text: 'Q ∨ S', depth: 3 },
      { id: 'a3', kind: 'assumption', text: '¬(Q ∨ S)', depth: 4, assumption: 'ID' },
      { id: 's4', kind: 'show', text: 'Q', depth: 4 },
      { id: 'x1', kind: 'step', text: 'P', depth: 5, rule: 'S', refs: [5] },
      { id: 'x2', kind: 'step', text: 'P → Q', depth: 5, rule: 'S', refs: [1] },
      { id: 'x3', kind: 'step', text: 'Q', depth: 5, rule: 'MP', refs: [12, 11] },
      { id: 'x4', kind: 'step', text: 'Q ∨ S', depth: 4, rule: 'ADD', refs: [10] },
      { id: 'x5', kind: 'step', text: '(T ↔ U) ∧ ¬(V ∨ W)', depth: 3, rule: 'MP', refs: [2, 8] },
      { id: 'x6', kind: 'step', text: 'T ↔ U', depth: 3, rule: 'S', refs: [15] },
      { id: 'x7', kind: 'step', text: 'T ↔ U', depth: 2, rule: 'R', refs: [16] },
      { id: 'x8', kind: 'step', text: 'T ↔ U', depth: 2, rule: 'DN', refs: [6] },
      { id: 's5', kind: 'show', text: '¬¬((V → W) ∨ (W → V))', depth: 1 },
      { id: 'a5', kind: 'assumption', text: '¬((V → W) ∨ (W → V))', depth: 2, assumption: 'ID' },
      { id: 'x9', kind: 'step', text: '¬(V → W)', depth: 2, rule: 'S', refs: [20] },
      { id: 'x10', kind: 'step', text: '', depth: 2 },
    ];
    await fresh(page, {
      'proof-session': proofDoc(ls, { id: 'custom', title: 'Long', premises: ['(P → Q) ∧ (R → S)', '(Q ∨ S) → ((T ↔ U) ∧ ¬(V ∨ W))'], goal: ls[2].text as string }),
    });
    await go(page, '/proofs');
    await expect(lines(page)).toHaveCount(22);
    await page.waitForTimeout(500);
    const culprits = await overflowCulprits(page);
    const file = await shot(page, info, 'long-proof');
    expect(culprits, `overflowing elements (screenshot ${file})`).toEqual([]);
    await noHorizontalOverflow(page);
    const vw = page.viewportSize()!.width;
    for (let n = 1; n <= 22; n++) {
      const num = lines(page).nth(n - 1).locator('.line__num');
      await expect(num).toHaveText(String(n));
      const nb = (await num.boundingBox())!;
      expect(nb.x, `line ${n} number starts on screen`).toBeGreaterThanOrEqual(0);
      expect(nb.x + nb.width, `line ${n} number ends on screen`).toBeLessThanOrEqual(vw);
      const input = lineFormula(page, n);
      const ib = (await input.boundingBox())!;
      expect(ib.width, `line ${n} formula input width`).toBeGreaterThanOrEqual(120);
      expect(ib.x + ib.width, `line ${n} formula input right edge`).toBeLessThanOrEqual(vw + 1);
    }
    // deepest line can still be edited
    await lineFormula(page, 13).click();
    await page.keyboard.press('End');
    await page.keyboard.type(' ');
    await expect(lineFormula(page, 13)).toBeFocused();
  });

  test('hints come first; "Show solution" requires confirmation', async ({ page }) => {
    // BUG (ui, major, phones): the mobile action bar swaps its Feedback/Hints/Rules
    // buttons for the symbol bar on focusin anywhere inside `.actionbar`
    // (useFormulaFocus in ProofsPage). Pressing "Hints" focuses the button, it is
    // unmounted before `click` fires, and the sheet never opens.
    test.fail(!isDesktop(page), 'BUG: phone/tablet action-bar buttons never open the sheet');
    await fresh(page, { 'proof-session': HS_START });
    await go(page, '/proofs');
    const panel = await openAssist(page, 'Hints');
    await panel.getByRole('button', { name: /Get a hint/ }).click();
    const hint = panel.locator('.hint').first();
    await expect(hint).toBeVisible();
    await expect(hint).toContainText(/Level 1/);
    // the first hint must not give away the full proof
    await expect(page.locator('.proof-done')).toHaveCount(0);
    await expect(lines(page)).toHaveCount(4);
    // level 2
    await panel.getByRole('button', { name: /Hint level 2/ }).click();
    await expect(panel.locator('.hint')).toHaveCount(2);

    await panel.getByRole('button', { name: 'Show solution' }).click();
    const confirm = page.getByRole('alertdialog', { name: /Show the full solution/ });
    await expect(confirm).toBeVisible();
    await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirm).toBeHidden();
    await expect(lines(page)).toHaveCount(4);

    await panel.getByRole('button', { name: 'Show solution' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Show solution' }).click();
    // close overlay if any, then check
    if (!isWide(page)) await page.keyboard.press('Escape');
    await expect(page.locator('.proof-done')).toContainText('Proof complete', { timeout: 5000 });
  });

  test('symbol bar inserts into the focused proof line', async ({ page }) => {
    await fresh(page, { 'proof-session': HS_START });
    await go(page, '/proofs');
    const input = lineFormula(page, 4);
    await input.click();
    await page.keyboard.type('P');
    const bar = isDesktop(page)
      ? page.locator('.editor__symbols').getByRole('toolbar')
      : page.getByRole('region', { name: 'Proof tools' }).getByRole('toolbar');
    await bar.getByRole('button', { name: 'Insert and (conjunction)' }).click();
    await expect(input).toHaveValue(/^P\s*∧\s*$/);
    await expect(input).toBeFocused();
  });

  // BUG (ui, major on phones): at 390x844 the focused last line sits under the fixed
  // action bar (symbol bar) — its rule/refs fields are hidden; no scroll-padding.
  test('phone: the action bar does not cover the last proof line', async ({ page }) => {
    test.skip(!isPhone(page), 'phones only');
    await fresh(page, { 'proof-session': HS_START });
    await go(page, '/proofs');
    const last = lineFormula(page, 4);
    await last.click();
    await last.scrollIntoViewIfNeeded();
    const lb = (await last.boundingBox())!;
    const bar = (await page.getByRole('region', { name: 'Proof tools' }).boundingBox())!;
    const tabs = await page.locator('.tabbar').boundingBox();
    const coverTop = Math.min(bar.y, tabs?.y ?? Infinity);
    expect(lb.y + lb.height, 'focused line hidden under the action bar').toBeLessThanOrEqual(coverTop + 1);
  });
});
