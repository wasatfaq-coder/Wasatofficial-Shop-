// What the owner's work in the admin panel costs the database at half a year of orders (orders1800.ts,
// docs/orders-scale-plan.md): `bun run measure:admin`. Skipped by `bun run measure:visit`, whose shop has no orders.
import { test, type Page } from '@playwright/test';
import fs from 'node:fs';
import { point, watchFirestore, type Point } from './firestoreTraffic';
import { ADMIN } from '../e2e/store';
import { readDoc } from '../e2e/emulator';
import { PRODUCT_COUNT, productId } from './catalog300';

test.skip(!process.env.VISIT_ORDERS, 'замер админки — bun run measure:admin');
test.describe.configure({ mode: 'serial', timeout: 600_000 });

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

// The owner's first sign-in writes the catalog index and miniatures (docs/catalog-scale-plan.md) and the orders index
// (docs/orders-scale-plan.md, stage 4): done before the
// measure, as on the real site, so that the measured visit reads what the owner reads every day
test('сессия владельца пишет индексы каталога и заказов', async ({ page }) => {
  await page.goto('/');
  await signInOwner(page);
  for (let i = 0; i < 180 && !(await readDoc('catalog_index/p0')); i++) await page.waitForTimeout(1000);
  // the miniatures follow the index; a minute is enough for 300 of them on CI
  await page.waitForTimeout(60_000);
  // and the session moves the previews out of the products one by one (docs/catalog-scale-plan.md, stage 6): the measured
  // visit starts after the last one. Otherwise its writes fall into the measure, and the emulator, which sends a listener
  // the whole result again on every change, turns 300 writes into 90 000 reads that the real database does not make
  for (let i = 0; i < 300 && !(await readDoc(`product_previews/${productId(PRODUCT_COUNT - 1)}`)); i++) await page.waitForTimeout(1000);
  // the orders index (docs/orders-scale-plan.md, stage 4) is written from all orders on the first sign-in
  let index: Record<string, unknown> | null = null;
  for (let i = 0; i < 60 && !(index = await readDoc('orders_index/p0')); i++) await page.waitForTimeout(1000);
  console.log(index ? `Индекс заказов записан: частей ${index.parts}` : 'Индекс заказов не записан за минуту');
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
