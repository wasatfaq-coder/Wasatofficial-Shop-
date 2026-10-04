// What one visit costs the database: documents read and bytes from Firestore, on the emulator with the shop of
// catalog300.ts (docs/catalog-scale-plan.md). Counts what the browser receives on the Listen channel — each document
// there is one billed read — and the bytes of every response from the Firestore emulator.
import { test, type Page, type CDPSession } from '@playwright/test';
import fs from 'node:fs';
import { productId } from './catalog300';
import { ADMIN } from '../e2e/store';
import { gunzipText } from '../../src/utils/catalogIndex';

const FIRESTORE = '127.0.0.1:8080';

interface Point {
  step: string;
  /** documents received on the Listen channel: one billed read each */
  docs: number;
  /** queries and documents the page listens to */
  targets: number;
  /** bytes of every Firestore response, as the emulator sends them (JSON, no compression) */
  kb: number;
  docsByCollection: Record<string, number>;
  /** the text of the documents per collection, KB */
  kbByCollection: Record<string, number>;
}

interface Counter {
  targets: number;
  bytes: number;
  /** decoded Listen text per request */
  texts: Map<string, string>;
}

const DOC_RE = /"documentChange"\s*:\s*\{\s*"document"\s*:\s*\{\s*"name"\s*:\s*"projects\/[^/]+\/databases\/[^/]+\/documents\/([^/"]+)/g;

/**
 * Watches the Firestore traffic through the DevTools protocol, whatever transport the SDK picks: bytes of every
 * response from the emulator and the text of the Listen channel
 */
async function watchFirestore(page: Page): Promise<Counter> {
  // only the local site and emulators, as in the e2e scenarios
  await page.context().route(
    (url) => url.hostname !== '127.0.0.1' && url.hostname !== 'localhost',
    (route) => route.abort()
  );
  const cdp: CDPSession = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  const c: Counter = { targets: 0, bytes: 0, texts: new Map() };
  const firestore = new Set<string>();
  const append = (id: string, base64: string) =>
    c.texts.set(id, (c.texts.get(id) ?? '') + Buffer.from(base64, 'base64').toString('utf8'));
  cdp.on('Network.requestWillBeSent', (e) => {
    if (!e.request.url.includes(FIRESTORE)) return;
    firestore.add(e.requestId);
    if (e.request.url.includes('/Listen/')) {
      if (e.request.method === 'GET') c.texts.set(e.requestId, '');
      const body = e.request.postData ?? '';
      c.targets += (decodeURIComponent(body.replace(/\+/g, ' ')).match(/"addTarget"/g) ?? []).length;
    }
  });
  cdp.on('Network.responseReceived', (e) => {
    if (!c.texts.has(e.requestId)) return;
    cdp
      .send('Network.streamResourceContent', { requestId: e.requestId })
      .then((r) => r.bufferedData && append(e.requestId, r.bufferedData))
      .catch(() => {});
  });
  cdp.on('Network.dataReceived', (e) => {
    if (!firestore.has(e.requestId)) return;
    c.bytes += e.encodedDataLength || e.dataLength;
    if (c.texts.has(e.requestId) && e.data) append(e.requestId, e.data);
  });
  return c;
}

/** Waits until the Firestore traffic stops for 3 s (max 90 s) */
async function settle(page: Page, c: Counter) {
  let last = -1;
  let quietSince = Date.now();
  const start = Date.now();
  while (Date.now() - start < 90_000) {
    await page.waitForTimeout(500);
    if (c.bytes !== last) {
      last = c.bytes;
      quietSince = Date.now();
    } else if (Date.now() - quietSince > 3_000) return;
  }
}

async function point(page: Page, c: Counter, step: string): Promise<Point> {
  await settle(page, c);
  const docsByCollection: Record<string, number> = {};
  const chars: Record<string, number> = {};
  let docs = 0;
  for (const text of c.texts.values()) {
    const hits = [...text.matchAll(DOC_RE)];
    hits.forEach((m, i) => {
      const end = i + 1 < hits.length ? hits[i + 1].index : text.length;
      docs += 1;
      docsByCollection[m[1]] = (docsByCollection[m[1]] ?? 0) + 1;
      chars[m[1]] = (chars[m[1]] ?? 0) + (end - m.index);
    });
  }
  const kbByCollection = Object.fromEntries(Object.entries(chars).map(([k, v]) => [k, Math.round(v / 1024)]));
  return { step, docs, targets: c.targets, kb: Math.round(c.bytes / 1024), docsByCollection, kbByCollection };
}

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
  // stage 6: and the previews out of the products
  const products = await storedDocs('products');
  const light = products.filter((p) => p.fields.previewKey?.stringValue).length;
  const avgProduct = products.length ? Math.round(products.reduce((a, p) => a + p.size, 0) / products.length / 1024) : 0;
  return `индекс: ${parts.length} ч., ${entries} товаров, ${Math.round(packed / 1024)} КБ сжатых строк; миниатюр ${thumbs.length}, в среднем ${avg} КБ (макс. ${Math.round(Math.max(0, ...thumbChars) / 1024)} КБ); баннеров без картинки внутри ${moved} из ${banners.length}; товаров без превью внутри ${light} из ${products.length}, товар в среднем ${avgProduct} КБ`;
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

// Customers read the index the owner's session writes (stages 2–3), the banners it moves pictures out of (stage 5) and
// the products it moves previews out of (stage 6):
// the shop gets them before the visits are measured, as the real one does the first time the owner opens the site
test('сессия владельца пишет индекс каталога и миниатюры', async ({ page }) => {
  await page.goto('/');
  await signInOwner(page);
  let report: string | null = null;
  for (let i = 0; i < 180; i++) {
    await page.waitForTimeout(1000);
    report = await indexReport();
    const moved = [...(report?.matchAll(/внутри (\d+) из (\d+)/g) ?? [])];
    if (report?.includes('миниатюр 300') && moved.length === 2 && moved.every((m) => m[1] === m[2])) break;
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
