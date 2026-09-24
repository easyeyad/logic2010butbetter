import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fresh, go, HS_START, ROUTES, SCREENSHOT_DIR } from './helpers';

const AXE_PROJECTS = ['desktop-1440', 'phone-390'];

type Found = { id: string; impact: string | null | undefined; help: string; nodes: string[] };

async function scan(page: Page, info: TestInfo, label: string): Promise<Found[]> {
  const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const found = res.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.slice(0, 6).map((n) => `${n.target.join(' ')} :: ${(n.failureSummary ?? '').split('\n').slice(1, 2).join(' ').trim()}`),
  }));
  mkdirSync(`${SCREENSHOT_DIR}/axe`, { recursive: true });
  writeFileSync(`${SCREENSHOT_DIR}/axe/${label}-${info.project.name}.json`, JSON.stringify(found, null, 2));
  return found;
}

const summary = (f: Found[]) => f.map((v) => `[${v.impact}] ${v.id}: ${v.help}\n    ${v.nodes.join('\n    ')}`).join('\n');

test.describe('axe (WCAG 2 A/AA)', () => {
  for (const scheme of ['light', 'dark'] as const) {
    for (const r of ROUTES) {
      test(`${scheme}: ${r.path}${r.inFlux ? ' (page in flux)' : ''}`, async ({ page }, info) => {
        test.skip(!AXE_PROJECTS.includes(info.project.name), 'axe runs at 1440 and 390 only');
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
        await fresh(page, r.path === '/proofs' ? { 'proof-session': HS_START } : {});
        await go(page, r.path);
        // populate result areas so their markup gets scanned too
        if (r.path === '/truth-tables') await page.getByLabel('Formula 1', { exact: true }).fill('(P ∧ Q) → R');
        if (r.path === '/countermodels') await page.getByRole('button', { name: 'Check validity' }).click();
        await page.waitForTimeout(400);
        const found = await scan(page, info, `${scheme}${r.path.replace(/\//g, '_') || '_root'}`);
        expect(found, summary(found)).toEqual([]);
      });
    }
  }

  test('truth-table practice grid and dialogs', async ({ page }, info) => {
    test.skip(!AXE_PROJECTS.includes(info.project.name), 'axe runs at 1440 and 390 only');
    await fresh(page);
    await go(page, '/truth-tables');
    await page.getByLabel('Formula 1', { exact: true }).fill('P ∧ ¬P');
    await page.getByRole('button', { name: 'Practice', exact: true }).click();
    await page.getByRole('button', { name: 'Check', exact: true }).click();
    let found = await scan(page, info, 'tt-practice');
    expect(found, summary(found)).toEqual([]);
    await page.getByRole('button', { name: 'Show solution' }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    found = await scan(page, info, 'tt-confirm-dialog');
    expect(found, summary(found)).toEqual([]);
  });

  test('proof editor with an error line and the close-box dialog', async ({ page }, info) => {
    test.skip(!AXE_PROJECTS.includes(info.project.name), 'axe runs at 1440 and 390 only');
    await fresh(page, {
      'proof-session': {
        problem: { id: 'custom', title: 'HS', premises: ['P → Q', 'Q → R'], goal: 'P → R' },
        lines: [
          { id: 'a', kind: 'premise', text: 'P → Q', depth: 0 },
          { id: 'b', kind: 'premise', text: 'Q → R', depth: 0 },
          { id: 'c', kind: 'show', text: 'P → R', depth: 0 },
          { id: 'd', kind: 'assumption', text: 'P', depth: 1, assumption: 'CD' },
          { id: 'e', kind: 'step', text: 'Q', depth: 1, rule: 'S', refs: [1] },
        ],
      },
    });
    await go(page, '/proofs');
    await page.getByLabel('Line 5 formula', { exact: true }).focus();
    await page.waitForTimeout(400);
    let found = await scan(page, info, 'proof-error');
    expect(found, summary(found)).toEqual([]);
    await page.keyboard.press('Control+Shift+Enter');
    await expect(page.getByRole('dialog', { name: /Close the box/ })).toBeVisible();
    found = await scan(page, info, 'proof-close-dialog');
    expect(found, summary(found)).toEqual([]);
  });
});

test.describe('keyboard focus visibility', () => {
  for (const r of ROUTES) {
    test(`tab order shows a visible focus indicator: ${r.path}`, async ({ page }, info) => {
      test.skip(info.project.name !== 'desktop-1440' && info.project.name !== 'phone-390', 'two viewports are enough');
      await fresh(page, r.path === '/proofs' ? { 'proof-session': HS_START } : {});
      await go(page, r.path);
      const problems: string[] = [];
      const seen = new Set<string>();
      for (let i = 0; i < 30; i++) {
        await page.keyboard.press('Tab');
        const info2 = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || el === document.body) return null;
          // The indicator may be drawn on the element or on a wrapper (e.g. .fi__box:focus-within).
          const ring = (n: HTMLElement) => {
            const cs = getComputedStyle(n);
            return (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none');
          };
          let outline = false;
          let n: HTMLElement | null = el;
          for (let k = 0; k < 3 && n; k++, n = n.parentElement) if (ring(n)) outline = true;
          // Compact proof-line fields: accent border + highlighted row (weaker, noted in the report).
          const shadow = Boolean(el.closest('.line.is-focused') && el.closest('.fi__box, .picker, .refs'));
          const r = el.getBoundingClientRect();
          const desc = `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${String(el.className).split(' ').slice(0, 2).join('.')} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}"`;
          return { desc, visible: outline || shadow, size: r.width > 0 && r.height > 0, focusVisible: el.matches(':focus-visible') };
        });
        if (!info2) continue;
        if (seen.has(info2.desc)) continue;
        seen.add(info2.desc);
        if (!info2.size) problems.push(`zero-size focus target: ${info2.desc}`);
        else if (!info2.visible) problems.push(`no outline/box-shadow on focus: ${info2.desc}`);
      }
      expect(seen.size, 'Tab should reach several controls').toBeGreaterThan(3);
      expect(problems, problems.join('\n')).toEqual([]);
    });
  }
});

test.describe('reduced motion', () => {
  test('prefers-reduced-motion disables transitions and animations', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop-1440' && info.project.name !== 'phone-390', 'two viewports are enough');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await fresh(page);
    await go(page, '/truth-tables');
    await page.getByLabel('Formula 1', { exact: true }).fill('(P ∧ Q) → R');
    await expect(page.locator('table.tt')).toBeVisible();
    // open a dialog / sheet so their enter animations are included
    if (info.project.name === 'phone-390') await page.getByRole('button', { name: 'More' }).click();
    const offenders = await page.evaluate(() => {
      const secs = (s: string) =>
        Math.max(0, ...s.split(',').map((t) => (t.trim().endsWith('ms') ? parseFloat(t) / 1000 : parseFloat(t) || 0)));
      const out: string[] = [];
      const all = [...document.querySelectorAll<HTMLElement>('body *')];
      for (const el of all) {
        for (const pseudo of [null, '::before', '::after']) {
          const cs = getComputedStyle(el, pseudo);
          const tr = secs(cs.transitionDuration);
          const an = cs.animationName !== 'none' ? secs(cs.animationDuration) * (cs.animationIterationCount === 'infinite' ? 1000 : 1) : 0;
          if (tr > 0.011 || an > 0.011) out.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}${pseudo ?? ''} transition=${cs.transitionDuration} animation=${cs.animationName} ${cs.animationDuration}`);
        }
      }
      return [...new Set(out)].slice(0, 15);
    });
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  test('Settings "Reduce motion" works even when the OS allows motion', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop-1440', 'one viewport is enough');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await fresh(page, { settings: { theme: 'system', motion: 'reduce', derivedRules: false, asciiDisplay: false } });
    await go(page, '/');
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduce');
    const dur = await page.evaluate(() => {
      const el = document.querySelector('.nav-link') as HTMLElement;
      return getComputedStyle(el).transitionDuration;
    });
    expect(parseFloat(dur)).toBeLessThanOrEqual(0.01);
  });
});
