// What the owner's work in the admin panel costs the database at half a year of orders (orders1800.ts,
// docs/orders-scale-plan.md): `bun run measure:admin`. Skipped by `bun run measure:visit`, whose shop has no orders.
import { test, type Page } from '@playwright/test';
import fs from 'node:fs';
import { point, watchFirestore, type Point } from './firestoreTraffic';
import { ADMIN } from '../e2e/store';
import { readDoc } from '../e2e/emulator';

test.skip(!process.env.VISIT_ORDERS, 'замер админки — bun run measure:admin');
test.describe.configure({ mode: 'serial', timeout: 300_000 });

const results: Record<string, Point[]> = {};
/** Main-thread work of each step (long tasks over 50 ms, summed): how long the screen is busy drawing */
const busy: string[] = [];

test.afterAll(() => {
  if (Object.keys(results).length === 0) return;
  console.log(`\nЗанятость страницы (долгие задачи, мс): ${busy.join('; ')}`);
  fs.mkdirSync('test-results', { recursive: true });
  fs.writeFileSync(process.env.VISIT_OUT ?? 'test-results/admin-visit.json', JSON.stringify(results, null, 2));
  for (const [name, points] of Object.entries(results)) {
    console.log(`\n${name}`);
    for (const p of points) {
      const data = Object.values(p.kbByCollection).reduce((a, b) => a + b, 0);
      console.log(`  ${p.step}: ${p.docs} чтений, данные ${data} КБ (по сети ${p.kb} КБ), подписок и запросов ${p.targets}`);
      console.log(`    чтений: ${JSON.stringify(p.docsByCollection)}`);
      console.log(`    КБ: ${JSON.stringify(p.kbByCollection)}`);
    }
  }
});

async function signInOwner(page: Page) {
  await page.waitForFunction(() => 'e2eSignIn' in window);
  await page.evaluate((u) => (window as unknown as { e2eSignIn: (x: typeof u) => Promise<unknown> }).e2eSignIn(u), ADMIN);
}

const openTab = (page: Page, name: string) => page.getByRole('navigation').getByRole('button', { name }).first().click();

/** A section of a group; its tab name may carry a counter («Заказы, новых заказов: 8») */
async function openSection(page: Page, group: string, section: string) {
  const panel = page.getByRole('dialog', { name: 'Панель администратора' });
  await panel.getByRole('tab', { name: group, exact: true }).click();
  await panel.getByRole('tab', { name: new RegExp(`^${section}( ,|$)`) }).click();
}

// The owner's first sign-in writes the catalog index and miniatures (docs/catalog-scale-plan.md): done before the
// measure, as on the real site, so that the measured visit reads what the owner reads every day
test('сессия владельца пишет индекс каталога', async ({ page }) => {
  await page.goto('/');
  await signInOwner(page);
  for (let i = 0; i < 180 && !(await readDoc('catalog_index/p0')); i++) await page.waitForTimeout(1000);
  // the miniatures follow the index; a minute is enough for 300 of them on CI
  await page.waitForTimeout(60_000);
});

test('владелец: сайт → панель → «Заказы» → «Клиенты» → «Аналитика»', async ({ page }) => {
  const c = await watchFirestore(page);
  const points: Point[] = (results['Владелец: сайт → панель → разделы'] = []);
  await page.addInitScript(() => {
    const w = window as unknown as { __busy: number };
    w.__busy = 0;
    new PerformanceObserver((list) => list.getEntries().forEach((e) => (w.__busy += e.duration))).observe({ type: 'longtask', buffered: true });
  });
  const step = async (name: string) => {
    points.push(await point(page, c, name));
    busy.push(`${name} ${Math.round(await page.evaluate(() => { const w = window as unknown as { __busy: number }; const v = w.__busy; w.__busy = 0; return v; }))}`);
  };

  await page.goto('/');
  await page.waitForFunction(() => 'e2eSignIn' in window);
  await step('сайт до входа');
  await signInOwner(page);
  await step('вошёл как владелец');

  await openTab(page, 'Профиль');
  await page.getByRole('button', { name: /^Панель администратора/ }).click();
  await step('панель («Аналитика»)');

  await openSection(page, 'Продажи', 'Заказы');
  await step('«Заказы»');

  await openSection(page, 'Продажи', 'Клиенты');
  await step('«Клиенты»');

  await openSection(page, 'Продажи', 'Аналитика');
  await step('«Аналитика»');
});
