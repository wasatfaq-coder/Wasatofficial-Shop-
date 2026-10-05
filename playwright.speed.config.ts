import { defineConfig } from '@playwright/test';
import visit from './playwright.visit.config';

// Speed of the shop on a slow phone: `bun run measure:speed` (docs/performance-plan.md). The visit measure's setup, and
// the build served as Hosting serves it (gzip, cached /assets) for the throttled visits of speed.spec.ts
export default defineConfig({
  ...visit,
  testMatch: 'speed.spec.ts',
  testIgnore: [],
  timeout: 1_800_000,
  webServer: [
    ...(Array.isArray(visit.webServer) ? visit.webServer : visit.webServer ? [visit.webServer] : []),
    { command: 'bun tests/visit/hostingServer.ts', url: 'http://127.0.0.1:4176', reuseExistingServer: true },
  ],
});
