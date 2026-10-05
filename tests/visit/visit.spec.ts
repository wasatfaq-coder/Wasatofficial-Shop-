// What one visit costs the database: documents read and bytes from Firestore, on the emulator with the shop of
// catalog300.ts (docs/catalog-scale-plan.md). Counts what the browser receives on the Listen channel — each document
// there is one billed read — and the bytes of every response from the Firestore emulator.
import { test, type Page } from '@playwright/test';
import { point, watchFirestore, type Point } from './firestoreTraffic';
import fs from 'node:fs';
import { productId } from './catalog300';
import { ownerPreparesShop, signInOwner } from './ownerSession';

const results: Record<string, Point[]> = {};
const notes: string[] = [];

/** A screen from the bottom menu (phone width) */
const openTab = (page: Page, name: string) => page.getByRole('navigation').getByRole('button', { name }).first().click();

test.afterAll(() => {
  const out = process.env.VISIT_OUT ?? 'test-results/visit.json';
  fs.mkdirSync('test-results', { recursive: true });
  fs.writeFileSync(out, JSON.stringify(results, null, 2));
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

test.afterAll(() => {
  for (const n of notes) console.log(`\n${n}`);
});

test.describe.configure({ mode: 'serial', timeout: 300_000 });

// Customers read the index the owner's session writes (stages 2–3), the banners it moves pictures out of (stage 5) and
// the products it moves previews out of (stage 6):
// the shop gets them before the visits are measured, as the real one does the first time the owner opens the site
test('сессия владельца пишет индекс каталога и миниатюры', async ({ page }) => {
  notes.push(await ownerPreparesShop(page));
});

test('главная → каталог, две порции «Показать ещё» → товар', async ({ page }) => {
  const c = await watchFirestore(page);
  const points: Point[] = (results['Главная → каталог → товар'] = []);

  await page.goto('/');
  points.push(await point(page, c, 'главная'));

  await openTab(page, 'Каталог');
  points.push(await point(page, c, 'каталог'));
  for (let k = 0; k < 2; k++) await page.getByRole('button', { name: /Показать ещё/ }).click();
  points.push(await point(page, c, 'каталог + 2 × «Показать ещё»'));

  await page.getByRole('main').getByRole('link', { name: /модель/ }).first().click();
  points.push(await point(page, c, 'страница товара'));
});

test('ссылка на товар из мессенджера → каталог', async ({ page }) => {
  const c = await watchFirestore(page);
  const points: Point[] = (results['Ссылка из Telegram → товар → каталог'] = []);

  await page.goto(`/product/${productId(3)}`);
  points.push(await point(page, c, 'страница товара'));

  await openTab(page, 'Каталог');
  points.push(await point(page, c, 'каталог'));
});

test('владелец открывает сайт и панель администратора', async ({ page }) => {
  const c = await watchFirestore(page);
  const points: Point[] = (results['Владелец: сайт → панель'] = []);

  await page.goto('/');
  await page.waitForFunction(() => 'e2eSignIn' in window);
  const before = await point(page, c, 'сайт до входа');
  await signInOwner(page);
  points.push(before, await point(page, c, 'вошёл как владелец'));

  await openTab(page, 'Профиль');
  await page.getByRole('button', { name: /^Панель администратора/ }).click();
  points.push(await point(page, c, 'панель (первый раздел)'));
});
