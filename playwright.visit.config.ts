import { defineConfig, devices } from '@playwright/test';

// Measure of one visit on the emulators with a 300-product shop: `bun run measure:visit` (docs/catalog-scale-plan.md)
const PORT = 4175;

export default defineConfig({
  testDir: 'tests/visit',
  // the speed measure has its own config (playwright.speed.config.ts): throttled, long
  testIgnore: 'speed.spec.ts',
  timeout: 300_000,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    ...devices['Pixel 7'],
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    channel: process.env.CI ? 'chrome' : undefined,
  },
  webServer: {
    command: `bunx vite preview --outDir dist-e2e --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: true,
  },
});
