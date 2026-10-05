// How fast the shop opens on an average Android phone: `bun run measure:speed` (docs/performance-plan.md). The shop of
// catalog300.ts on the emulators, the build served as Hosting serves it (hostingServer.ts: gzip, cached /assets), the
// «slow phone» profile of the earlier measures (docs/ui-audit-plan.md, docs/audit-2026-10-02-plan.md): 150 ms latency,
// 1,6 Mbit/s, CPU ×4, 390 × 844 at 3× pixels. Every run is a new browser profile (first visit, empty cache); the result
// is the median of SPEED_RUNS runs (5 by default). Emulator only: the browser talks to 127.0.0.1 alone
import { test, devices, type Browser, type BrowserContext, type Page } from '@playwright/test';
import fs from 'node:fs';
import { productId } from './catalog300';
import { ownerPreparesShop } from './ownerSession';

const RUNS = Number(process.env.SPEED_RUNS ?? 5);
const SITE = `http://127.0.0.1:${process.env.SPEED_PORT ?? 4176}`;
const SLOW_NETWORK = { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 };
const SLOW_CPU = 4;
/** No long task for this long: the page is interactive (Lighthouse's TTI window) */
const QUIET_MS = 5_000;

interface Request {
  url: string;
  start: number;
  end: number;
  kb: number;
}

type Bytes = Record<'html' | 'js' | 'css' | 'font' | 'firestore' | 'auth' | 'other', number>;

interface Load {
  /** first paint with content, ms from the start of navigation */
  fcp: number;
  /** largest paint (Largest Contentful Paint) and its element */
  lcp: number;
  lcpElement: string;
  /** the screen shows what the customer came for (cards with photos, the product, the form) */
  ready: number;
  /** end of the last long task before 5 s without them (Lighthouse's Time to Interactive) */
  tti: number;
  /** blocked main thread between the first paint and TTI: sum of (task − 50 ms) */
  tbt: number;
  bytes: Bytes;
  /** JS downloaded by the time the screen was ready (the rest is the idle prefetch of other screens) */
  jsAtReady: number;
  jsFiles: number;
  /** requests of the visit, s from the page's request */
  waterfall: Request[];
}

interface Step {
  /** from the tap to the screen ready, ms */
  ms: number;
  /** the tap's own response: input delay, handler and the next paint (Event Timing, as INP) */
  response: number;
  /** blocked main thread from the tap until quiet */
  tbt: number;
  /** bytes downloaded for the step */
  kb: number;
}

const loads: Record<string, Load[]> = {};
const steps: Record<string, Step[]> = {};
const notes: string[] = [];

/** Collects paints, long tasks and taps in the page from its first script on */
function observe() {
  const w = window as unknown as { __speed: { lt: [number, number][]; lcp: [number, string][]; events: [number, number, string][] } };
  w.__speed = { lt: [], lcp: [], events: [] };
  const s = w.__speed;
  try {
    new PerformanceObserver((l) => l.getEntries().forEach((e) => s.lt.push([e.startTime, e.duration]))).observe({ type: 'longtask', buffered: true });
    new PerformanceObserver((l) =>
      l.getEntries().forEach((e) => {
        const el = (e as PerformanceEntry & { element?: Element }).element;
        s.lcp.push([e.startTime, el ? `${el.tagName.toLowerCase()}${el.tagName === 'IMG' ? '' : `: ${(el.textContent ?? '').trim().slice(0, 30)}`}` : '']);
      })
    ).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) =>
      l.getEntries().forEach((e) => s.events.push([e.startTime, e.duration, e.name]))
    ).observe({ type: 'event', buffered: true, durationThreshold: 16 } as PerformanceObserverInit);
  } catch {
    // an old browser: the measure needs Chromium
  }
}

const kindOf = (url: string, type: string): keyof Bytes => {
  if (url.includes(':8080')) return 'firestore';
  if (url.includes(':9099')) return 'auth';
  if (type === 'Document') return 'html';
  if (/\.js(\?|$)/.test(url)) return 'js';
  if (/\.css(\?|$)/.test(url)) return 'css';
  if (/\.woff2?(\?|$)/.test(url)) return 'font';
  return 'other';
};

/** A slow phone: a new profile (empty cache), throttled network and CPU, traffic counted by kind */
async function slowPhone(browser: Browser, cart?: string) {
  const context = await browser.newContext({
    ...devices['Pixel 7'],
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    baseURL: SITE,
  });
  await context.addInitScript(observe);
  if (cart) await context.addInitScript((c) => localStorage.getItem('manstyle_cart') || localStorage.setItem('manstyle_cart', c), cart);
  const page = await context.newPage();
  const traffic = await throttle(context, page);
  return { context, page, traffic };
}

/** Google's own scripts the Auth SDK may fetch: blocked, the measure talks to 127.0.0.1 alone (not by routing — it turns
 * the HTTP cache off, and the repeat visit would download the scripts again) */
const OUTSIDE = ['*://*.googleapis.com/*', '*://*.google.com/*', '*://*.gstatic.com/*', '*://*.firebaseapp.com/*', '*://*.web.app/*'];
const outside = new Set<string>();

async function throttle(context: BrowserContext, page: Page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setBlockedURLs', { urls: OUTSIDE });
  await cdp.send('Network.emulateNetworkConditions', SLOW_NETWORK);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: SLOW_CPU });
  const kinds = new Map<string, keyof Bytes>();
  const bytes: Bytes = { html: 0, js: 0, css: 0, font: 0, firestore: 0, auth: 0, other: 0 };
  let jsFiles = 0;
  // the waterfall: when each request started and got its last byte, s from the first request (the page)
  const rows = new Map<string, Request>();
  let t0 = 0;
  const seen = (id: string, t: number) => {
    const row = rows.get(id);
    if (row) row.end = +(t - t0).toFixed(3);
  };
  cdp.on('Network.requestWillBeSent', (e) => {
    if (e.request.url.startsWith('data:')) return;
    t0 ||= e.timestamp;
    rows.set(e.requestId, { url: e.request.url.replace(/^https?:\/\/[^/]+/, '').split('?')[0].slice(0, 80), start: +(e.timestamp - t0).toFixed(3), end: 0, kb: 0 });
    if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(e.request.url)) outside.add(e.request.url.split('?')[0]);
    const kind = kindOf(e.request.url, e.type ?? '');
    kinds.set(e.requestId, kind);
    if (kind === 'js') jsFiles += 1;
  });
  // bytes as they arrive (Firestore's channel stays open), and the rest with the response's end (headers, small files)
  const got = new Map<string, number>();
  const add = (id: string, n: number) => {
    const kind = kinds.get(id);
    if (!kind || n <= 0) return;
    bytes[kind] += n;
    const row = rows.get(id);
    if (row) row.kb = +(row.kb + n / 1024).toFixed(1);
    got.set(id, (got.get(id) ?? 0) + n);
  };
  cdp.on('Network.dataReceived', (e) => {
    add(e.requestId, e.encodedDataLength);
    seen(e.requestId, e.timestamp);
  });
  cdp.on('Network.loadingFinished', (e) => {
    add(e.requestId, e.encodedDataLength - (got.get(e.requestId) ?? 0));
    seen(e.requestId, e.timestamp);
  });
  return { bytes: () => ({ ...bytes }), jsFiles: () => jsFiles, waterfall: () => [...rows.values()].map((r) => ({ ...r })) };
}

const kb = (b: number) => Math.round(b / 1024);
const total = (b: Bytes) => Object.values(b).reduce((a, x) => a + x, 0);

/** Waits for the screen and then for the main thread to be quiet; the page's own clock */
async function untilReady(page: Page, ready: () => boolean): Promise<number> {
  const handle = await page.waitForFunction(ready, null, { polling: 50, timeout: 180_000 });
  await handle.dispose();
  return page.evaluate(() => performance.now());
}

async function untilQuiet(page: Page, since: number) {
  for (let i = 0; i < 120; i++) {
    const idle = await page.evaluate(
      ([from, quiet]) => {
        const s = (window as unknown as { __speed: { lt: [number, number][] } }).__speed;
        const last = Math.max(from, ...s.lt.map(([t, d]) => t + d));
        return performance.now() - last >= quiet;
      },
      [since, QUIET_MS] as const
    );
    if (idle) return;
    await page.waitForTimeout(500);
  }
}

/** First visit of a screen by its address */
async function firstLoad(page: Page, traffic: Awaited<ReturnType<typeof throttle>>, url: string, ready: () => boolean): Promise<Load> {
  await page.goto(url, { waitUntil: 'commit' });
  const readyAt = await untilReady(page, ready);
  const jsAtReady = traffic.bytes().js;
  await untilQuiet(page, readyAt);
  const m = await page.evaluate(() => {
    const s = (window as unknown as { __speed: { lt: [number, number][]; lcp: [number, string][] } }).__speed;
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0;
    const lcp = s.lcp.at(-1) ?? [0, ''];
    const after = s.lt.filter(([t]) => t >= fcp);
    const tti = Math.max(fcp, ...after.map(([t, d]) => t + d));
    const tbt = after.filter(([t]) => t < tti).reduce((a, [, d]) => a + Math.max(0, d - 50), 0);
    return { fcp, lcp: lcp[0], lcpElement: lcp[1], tti, tbt };
  });
  return { ...m, ready: readyAt, bytes: traffic.bytes(), jsAtReady, jsFiles: traffic.jsFiles(), waterfall: traffic.waterfall() };
}

/** A tap in the open shop: until the next screen is ready and the main thread quiet */
async function tap(page: Page, traffic: Awaited<ReturnType<typeof throttle>>, act: () => Promise<void>, ready: () => boolean): Promise<Step> {
  const before = total(traffic.bytes());
  const start = await page.evaluate(() => performance.now());
  await act();
  const readyAt = await untilReady(page, ready);
  await untilQuiet(page, readyAt);
  const m = await page.evaluate((from) => {
    const s = (window as unknown as { __speed: { lt: [number, number][]; events: [number, number, string][] } }).__speed;
    const taps = s.events.filter(([t, , name]) => t >= from && /pointerup|click|pointerdown|keydown/.test(name));
    const tbt = s.lt.filter(([t]) => t >= from).reduce((a, [, d]) => a + Math.max(0, d - 50), 0);
    return { response: Math.max(0, ...taps.map(([, d]) => d)), tbt };
  }, start);
  return { ms: Math.round(readyAt - start), response: Math.round(m.response), tbt: Math.round(m.tbt), kb: kb(total(traffic.bytes()) - before) };
}

// What each screen waits for. Product photos are JPEG data: URLs (miniatures, previews); the placeholder is SVG
const cardsWithPhotos = () =>
  [...document.querySelectorAll<HTMLImageElement>('main img[src^="data:image/jpeg"]')].some(
    (img) => img.naturalWidth > 0 && img.closest('main')?.querySelector('a[href^="/product/"]')
  );
// the slide's photo (its alt is the product's name; the strip under it has none)
const productShown = () =>
  [...document.querySelectorAll<HTMLImageElement>('main img[src^="data:image/jpeg"]')].some((img) => img.alt && img.naturalWidth > 0);
const shirtsOnly = () => {
  const links = [...document.querySelectorAll('main a[href^="/product/"]')];
  return links.length > 0 && links.every((a) => (a.textContent ?? '').includes('Рубашка'));
};
const cartShown = () => [...document.querySelectorAll('main button')].some((b) => (b.textContent ?? '').includes('Оформить заказ'));
const checkoutShown = () => [...document.querySelectorAll('button')].some((b) => /Подтвердить/.test(b.textContent ?? ''));

const openTab = (page: Page, name: RegExp) => page.getByRole('navigation').getByRole('button', { name }).first().click();

/** The cart the customer's path collected: the checkout's first visit starts with it */
let savedCart = '';

test.describe.configure({ mode: 'serial', timeout: 1_800_000 });

test('сессия владельца пишет индекс каталога и миниатюры', async ({ page }) => {
  notes.push(await ownerPreparesShop(page));
});

test('путь покупателя: главная → каталог → фильтр → товар → корзина → оформление', async ({ browser }) => {
  for (let run = 0; run < RUNS; run++) {
    const { context, page, traffic } = await slowPhone(browser);
    (loads['Главная, первый визит'] ??= []).push(await firstLoad(page, traffic, '/', cardsWithPhotos));

    const add = (name: string, s: Step) => (steps[name] ??= []).push(s);
    add('Главная → Каталог', await tap(page, traffic, () => openTab(page, /^Каталог/), cardsWithPhotos));
    add('Каталог → фильтр «Рубашки»', await tap(page, traffic, () => page.getByRole('radio', { name: 'Рубашки' }).click(), shirtsOnly));
    add('Каталог → товар', await tap(page, traffic, () => page.getByRole('main').getByRole('link', { name: /Рубашка/ }).first().click(), productShown));
    // a size in stock and «В корзину»: the page stays, a toast says it is added
    await page.getByRole('radiogroup', { name: 'Размер' }).locator('[role="radio"]:not([aria-label*="нет"]):not([disabled])').first().click();
    await page.getByRole('button', { name: 'В корзину', exact: true }).first().click();
    await page.waitForFunction(() => /"quantity"/.test(localStorage.getItem('manstyle_cart') ?? ''));
    add('Товар → Корзина', await tap(page, traffic, () => openTab(page, /^Корзина/), cartShown));
    add('Корзина → Оформление', await tap(page, traffic, () => page.getByRole('button', { name: /Оформить заказ/ }).first().click(), checkoutShown));
    savedCart = (await page.evaluate(() => localStorage.getItem('manstyle_cart'))) ?? '';

    // the same customer comes back later: the scripts are in the cache, the data is not (no Firestore cache)
    const again = await context.newPage();
    const traffic2 = await throttle(context, again);
    (loads['Главная, повторный визит'] ??= []).push(await firstLoad(again, traffic2, '/', cardsWithPhotos));
    await context.close();
  }
});

test('первый визит по ссылке на товар, в каталог с фильтром и на оформление', async ({ browser }) => {
  for (let run = 0; run < RUNS; run++) {
    for (const [name, url, ready, cart] of [
      ['Товар по ссылке из мессенджера', `/product/${productId(3)}`, productShown, undefined],
      ['Каталог, первый визит', '/catalog', cardsWithPhotos, undefined],
      ['Оформление с корзиной, первый визит', '/checkout', checkoutShown, savedCart],
    ] as const) {
      const { context, page, traffic } = await slowPhone(browser, cart);
      (loads[name] ??= []).push(await firstLoad(page, traffic, url, ready));
      if (name === 'Каталог, первый визит') {
        (steps['Каталог (первый визит) → фильтр «Рубашки»'] ??= []).push(
          await tap(page, traffic, () => page.getByRole('radio', { name: 'Рубашки' }).click(), shirtsOnly)
        );
      }
      await context.close();
    }
  }
});

const median = (list: number[]) => {
  const s = [...list].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const sec = (ms: number) => (ms / 1000).toFixed(2).replace('.', ',');
const range = (list: number[]) => `${sec(Math.min(...list))}–${sec(Math.max(...list))}`;

test.afterAll(() => {
  const out = process.env.SPEED_OUT ?? 'test-results/speed.json';
  fs.mkdirSync('test-results', { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ loads, steps, notes }, null, 2));
  for (const n of notes) console.log(`\n${n}`);
  if (outside.size) console.log(`\nЗаблокированы запросы вне 127.0.0.1: ${[...outside].join(', ')}`);
  console.log(`\nПервые визиты, медиана из ${RUNS} (мин–макс), с`);
  for (const [name, list] of Object.entries(loads)) {
    const pick = (f: (l: Load) => number) => list.map(f);
    const b = (k: keyof Bytes) => kb(median(pick((l) => l.bytes[k])));
    console.log(
      `  ${name}: FCP ${sec(median(pick((l) => l.fcp)))}, LCP ${sec(median(pick((l) => l.lcp)))} (${range(pick((l) => l.lcp))}, ${list.at(-1)?.lcpElement}), ` +
        `экран готов ${sec(median(pick((l) => l.ready)))} (${range(pick((l) => l.ready))}), TTI ${sec(median(pick((l) => l.tti)))}, TBT ${Math.round(median(pick((l) => l.tbt)))} мс; ` +
        `КБ: всего ${kb(median(pick((l) => total(l.bytes))))}, JS ${b('js')} (к готовности ${kb(median(pick((l) => l.jsAtReady)))}, ${median(pick((l) => l.jsFiles))} файлов), CSS ${b('css')}, шрифты ${b('font')}, HTML ${b('html')}, Firestore ${b('firestore')}, Auth ${b('auth')}, прочее ${b('other')}`
    );
  }
  console.log(`\nПереходы, медиана из ${RUNS}`);
  for (const [name, list] of Object.entries(steps)) {
    console.log(
      `  ${name}: ${sec(median(list.map((s) => s.ms)))} с (${range(list.map((s) => s.ms))}), отклик на нажатие ${median(list.map((s) => s.response))} мс, ` +
        `TBT ${median(list.map((s) => s.tbt))} мс, загружено ${median(list.map((s) => s.kb))} КБ`
    );
  }
});
