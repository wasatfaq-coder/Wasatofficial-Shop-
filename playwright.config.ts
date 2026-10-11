import { defineConfig, devices } from '@playwright/test';

// Scenarios of the customer and the owner on the Firebase emulators: `bun run test:e2e` (README, «Сценарии в браузере»)
const PORT = 4174;
const phone = { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 };
const desktop = { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } };

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 4,
  reporter: process.env.CI ? [['list'], ['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    // On GitHub runners Chrome is installed already: no browser download in CI
    channel: process.env.CI ? 'chrome' : undefined,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'seed', testMatch: 'setup/seed.setup.ts' },
    { name: 'phone', testDir: 'tests/e2e/shop', use: phone, dependencies: ['seed'] },
    { name: 'desktop', testDir: 'tests/e2e/shop', use: desktop, dependencies: ['seed'] },
    // orders through the placeOrder function (functions emulator): «Проверка заказов на сервере» switches the whole shop,
    // so these run after the browser-order scenarios (audit 07.10, finding 43)
    { name: 'server-phone', testDir: 'tests/e2e/server', use: phone, dependencies: ['phone', 'desktop'] },
    { name: 'server-desktop', testDir: 'tests/e2e/server', use: desktop, dependencies: ['phone', 'desktop'] },
    // the empty shop runs after the rest: it clears the same database
    { name: 'clear', testMatch: 'setup/clear.setup.ts', dependencies: ['server-phone', 'server-desktop'] },
    { name: 'empty-phone', testDir: 'tests/e2e/empty', use: phone, dependencies: ['clear'] },
    { name: 'empty-desktop', testDir: 'tests/e2e/empty', use: desktop, dependencies: ['clear'] },
  ],
  webServer: {
    command: `bunx vite preview --outDir dist-e2e --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
});
