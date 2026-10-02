import { expect, type Page, type TestInfo } from '@playwright/test';

/** Every route in the app (HashRouter). In-flux pages are marked. */
export const ROUTES: { path: string; h1: RegExp; inFlux?: boolean }[] = [
  { path: '/', h1: /./ },
  { path: '/practice', h1: /Practice/, inFlux: true },
  { path: '/proofs', h1: /Proofs/ },
  { path: '/truth-tables', h1: /Truth Tables/ },
  { path: '/symbolization', h1: /Symbolization/, inFlux: true },
  { path: '/countermodels', h1: /Countermodels/ },
  { path: '/reference', h1: /Reference/ },
  { path: '/progress', h1: /Progress/, inFlux: true },
  { path: '/settings', h1: /Settings/ },
];

export const SCREENSHOT_DIR =
  '/tmp/claude-0/-home-user-logic2010butbetter/bc88dcf1-5a6f-5a3b-89a9-af4513536878/scratchpad/qa';

export const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1440) < 768;
export const isWide = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1280;
export const isDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;

/** Collect console errors and uncaught page errors. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

/** Start from a clean slate; optionally seed localStorage (keys without the logic-studio: prefix). */
export async function fresh(page: Page, seed: Record<string, unknown> = {}) {
  await page.addInitScript((s) => {
    if (sessionStorage.getItem('qa-seeded')) return;
    sessionStorage.setItem('qa-seeded', '1');
    localStorage.clear();
    // Skip the dashboard onboarding so it never covers other content.
    for (const [k, v] of Object.entries(s)) localStorage.setItem('logic-studio:' + k, JSON.stringify(v));
  }, seed);
}

export async function go(page: Page, path: string) {
  await page.goto('/#' + path);
  await expect(page.locator('h1').first()).toBeVisible();
  // lazy chunks + debounced checks
  await page.waitForLoadState('networkidle');
}

export async function noHorizontalOverflow(page: Page) {
  const m = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    inner: window.innerWidth,
    body: document.body.scrollWidth,
  }));
  expect(m.scroll, `documentElement.scrollWidth ${m.scroll} > innerWidth ${m.inner}`).toBeLessThanOrEqual(m.inner + 1);
}

/** Elements that stick out past the right edge (for diagnosing overflow). */
export async function overflowCulprits(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const w = window.innerWidth;
    const out: string[] = [];
    document.querySelectorAll<HTMLElement>('body *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.right > w + 1 && r.width > 0) {
        // skip children of scroll containers
        let p = el.parentElement;
        while (p) {
          const o = getComputedStyle(p).overflowX;
          if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return;
          p = p.parentElement;
        }
        out.push(`${el.tagName.toLowerCase()}.${el.className} right=${Math.round(r.right)}`);
      }
    });
    return out.slice(0, 8);
  });
}

export async function shot(page: Page, info: TestInfo, name: string) {
  const file = `${SCREENSHOT_DIR}/${name}-${info.project.name}.png`;
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

/** Hypothetical syllogism draft, as the proof editor stores it. */
export function proofDoc(lines: Array<Record<string, unknown>>, problem = { id: 'custom', title: 'Hypothetical syllogism', premises: ['P → Q', 'Q → R'], goal: 'P → R' }) {
  return { problem, lines };
}

export const HS_START = proofDoc([
  { id: 'a', kind: 'premise', text: 'P → Q', depth: 0 },
  { id: 'b', kind: 'premise', text: 'Q → R', depth: 0 },
  { id: 'c', kind: 'show', text: 'P → R', depth: 0 },
  { id: 'd', kind: 'step', text: '', depth: 1 },
]);

export const lineFormula = (page: Page, n: number) => page.getByLabel(`Line ${n} formula`, { exact: true });
export const lineRule = (page: Page, n: number) => page.getByLabel(`Line ${n} justification`, { exact: true });
export const lineRefs = (page: Page, n: number) => page.getByLabel(`Line ${n} cited lines`, { exact: true });
