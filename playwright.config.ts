import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

/**
 * E2E + accessibility suite. OWNER: QA / Accessibility.
 * Uses the preinstalled Chromium (never run `playwright install`).
 */
const PORT = 4173;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const launchOptions = existsSync(CHROME) && !process.env.PW_BUNDLED ? { executablePath: CHROME } : {};

const desktop = (w: number, h: number) => ({
  ...devices['Desktop Chrome'],
  viewport: { width: w, height: h },
  launchOptions,
});
const phone = (w: number, h: number) => ({
  ...devices['Desktop Chrome'],
  viewport: { width: w, height: h },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  launchOptions,
});

export default defineConfig({
  testDir: './e2e',
  outputDir: './node_modules/.cache/playwright-results',
  timeout: 45_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort --host 127.0.0.1`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    { name: 'desktop-1440', use: desktop(1440, 900) },
    { name: 'desktop-1280', use: desktop(1280, 800) },
    { name: 'laptop-1024', use: desktop(1024, 768) },
    { name: 'tablet-768', use: { ...desktop(768, 1024), hasTouch: true } },
    { name: 'phone-430', use: phone(430, 932) },
    { name: 'phone-390', use: phone(390, 844) },
    { name: 'phone-375', use: phone(375, 667) },
  ],
});
