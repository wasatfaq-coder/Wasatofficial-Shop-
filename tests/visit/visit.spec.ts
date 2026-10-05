// What one visit costs the database: documents read and bytes from Firestore, on the emulator with the shop of
// catalog300.ts (docs/catalog-scale-plan.md). Counts what the browser receives on the Listen channel — each document
// there is one billed read — and the bytes of every response from the Firestore emulator.
import { test, type Page } from '@playwright/test';
import { point, watchFirestore, type Point } from './firestoreTraffic';
import fs from 'node:fs';
import { productId } from './catalog300';
import { ADMIN } from '../e2e/store';
import { gunzipText } from '../../src/utils/catalogIndex';

const FIRESTORE = '127.0.0.1:8080';

const results: Record<string, Point[]> = {};
const notes: string[] = [];

const config = JSON.parse(fs.readFileSync(new URL('../../firebase-applet-config.json', import.meta.url), 'utf8'));
const DOCUMENTS = `http://${FIRESTORE}/v1/projects/${config.projectId}/databases/${config.firestoreDatabaseId}/documents`;
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

/** Documents of a collection as stored (the emulator's admin token, rules skipped), with their JSON size */
async function storedDocs(collectionId: string): Promise<{ fields: Record<string, Record<string, string>>; size: number }[]> {
  const res = await fetch(`${DOCUMENTS}:runQuery`, {
    method: 'POST',
    headers: OWNER,
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId }] } }),
  });
  const rows = (await res.json()) as { document?: { fields: Record<string, Record<string, string>> } }[];
  return rows.filter((r) => r.document).map((r) => ({ fields: r.document!.fields, size: JSON.stringify(r.document).length }));
}

/** The index and miniatures the admin session wrote (stage 2): how many and how big */
async function indexReport(): Promise<string | null> {
  const parts = await storedDocs('catalog_index');
  if (parts.length === 0) return null;
  let entries = 0;
  let packed = 0;
  for (const p of parts) {
    const bytes = Buffer.from(p.fields.entries.bytesValue, 'base64');
    packed += bytes.byteLength;
    entries += (JSON.parse(await gunzipText(new Uint8Array(bytes))) as unknown[]).length;
  }
  const thumbs = await storedDocs('product_thumbs');
  const thumbChars = thumbs.map((t) => t.fields.data.stringValue.length);
  const avg = thumbChars.length ? Math.round(thumbChars.reduce((a, b) => a + b, 0) / thumbChars.length / 1024) : 0;
  // stage 5: the session moves banner pictures out of the banners
  const banners = await storedDocs('banners');
  const moved = banners.filter((b) => !b.fields.image?.stringValue).length;
  return `индекс: ${parts.length} ч., ${entries} товаров, ${Math.round(packed / 1024)} КБ сжатых строк; миниатюр ${thumbs.length}, в среднем ${avg} КБ (макс. ${Math.round(Math.max(0, ...thumbChars) / 1024)} КБ); баннеров без картинки внутри ${moved} из ${banners.length}`;
}

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

/** Signs in as the owner on the site the page has open */
async function signInOwner(page: Page) {
  await page.waitForFunction(() => 'e2eSignIn' in window);
  await page.evaluate((u) => (window as unknown as { e2eSignIn: (x: typeof u) => Promise<unknown> }).e2eSignIn(u), ADMIN);
}

// Customers read the index the owner's session writes (stages 2–3) and the banners it moves pictures out of (stage 5):
// the shop gets them before the visits are measured, as the real one does the first time the owner opens the site
test('сессия владельца пишет индекс каталога и миниатюры', async ({ page }) => {
  await page.goto('/');
  await signInOwner(page);
  let report: string | null = null;
  for (let i = 0; i < 180; i++) {
    await page.waitForTimeout(1000);
    report = await indexReport();
    if (report?.includes('миниатюр 300') && /внутри (\d+) из \1$/.test(report)) break;
  }
  notes.push(report ?? 'индекс каталога не записан за 3 минуты');
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
