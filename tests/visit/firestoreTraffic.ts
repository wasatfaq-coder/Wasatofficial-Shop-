// What the browser reads from Firestore on the emulator: documents received on the Listen channel (each is one billed
// read) and the bytes of every response from the Firestore emulator. Used by the visit (visit.spec.ts) and admin
// (admin.spec.ts) measures
import type { Page, CDPSession } from '@playwright/test';

const FIRESTORE = '127.0.0.1:8080';

export interface Point {
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
export async function watchFirestore(page: Page): Promise<Counter> {
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

export async function point(page: Page, c: Counter, step: string): Promise<Point> {
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

