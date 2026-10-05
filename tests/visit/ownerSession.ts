// The owner's session on the measured shop: customers read the catalog index, miniatures, banner pictures and previews
// it writes (docs/catalog-scale-plan.md, stages 2–6), as the real shop gets them the first time the owner opens the site.
// Used by the visit (visit.spec.ts) and speed (speed.spec.ts) measures; emulator only
import type { Page } from '@playwright/test';
import fs from 'node:fs';
import { ADMIN } from '../e2e/store';
import { gunzipText } from '../../src/utils/catalogIndex';

const FIRESTORE = '127.0.0.1:8080';

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
export async function indexReport(): Promise<string | null> {
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

/** Signs in as the owner on the site the page has open */
export async function signInOwner(page: Page) {
  await page.waitForFunction(() => 'e2eSignIn' in window);
  await page.evaluate((u) => (window as unknown as { e2eSignIn: (x: typeof u) => Promise<unknown> }).e2eSignIn(u), ADMIN);
}

/** Signs in as the owner and waits until the session has written the index and moved banner pictures and previews out */
export async function ownerPreparesShop(page: Page): Promise<string> {
  await page.goto('/');
  await signInOwner(page);
  let report: string | null = null;
  for (let i = 0; i < 240; i++) {
    await page.waitForTimeout(1000);
    report = await indexReport();
    const moved = [...(report?.matchAll(/внутри (\d+) из (\d+)/g) ?? [])];
    if (report?.includes('миниатюр 300') && moved.length === 2 && moved.every((m) => m[1] === m[2])) break;
  }
  return report ?? 'индекс каталога не записан за 4 минуты';
}
