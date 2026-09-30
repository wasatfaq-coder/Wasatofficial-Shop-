// usage: node measure.mjs <outJson> <runs>; env BASE, CAP_MS (limit for cards), THR=0 to disable throttling
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const OUT = process.argv[2]; const RUNS = Number(process.argv[3] || 3);
const BASE = process.env.BASE || 'http://127.0.0.1:3300/';
const CAP = Number(process.env.CAP_MS || 180000);
const THR = process.env.THR !== '0';
const INIT = () => {
  window.__m = { lcp: [], lt: [], cards: null, empty: null, emptyGone: null };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__m.lcp.push({ t: e.startTime, size: e.size, tag: e.element?.tagName, src: (e.url || '').slice(0, 40) }); }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__m.lt.push({ s: e.startTime, d: e.duration }); }).observe({ type: 'longtask', buffered: true }); } catch {}
  const tick = () => {
    const m = window.__m; const now = performance.now();
    const txt = document.body?.innerText || '';
    const empty = txt.includes('Товары появятся здесь');
    if (empty && m.empty == null) m.empty = now;
    if (!empty && m.empty != null && m.emptyGone == null) m.emptyGone = now;
    if (m.cards == null && document.querySelector('a[href^="#/product/"]')) m.cards = now;
    if (m.cards == null || m.emptyGone == null && m.empty != null) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  window.__watch = (pred) => {
    const w = { t0: null, done: null }; window.__w = w;
    document.addEventListener('click', (e) => { if (w.t0 == null) w.t0 = performance.now(); }, { capture: true, once: true });
    const f = () => { if (w.t0 != null && pred()) { w.done = performance.now(); return; } requestAnimationFrame(f); };
    requestAnimationFrame(f);
  };
};
const PREDS = {
  catalog: `() => location.hash === '#/catalog' && document.querySelectorAll('main a[href^="#/product/"], a[href^="#/product/"]').length > 0 && !!document.querySelector('[role=radiogroup], main')`,
  product: `() => location.hash.startsWith('#/product/') && !!document.querySelector('[role=radiogroup][aria-label="Размер"]')`,
  cart: `() => location.hash === '#/cart' && !!document.querySelector('button[aria-label="Удалить товар"]')`,
};
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost'] });
const results = [];
for (let run = 0; run < RUNS; run++) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'ru-RU' });
  await ctx.addInitScript(INIT);
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Network.enable'); await cdp.send('Performance.enable');
  const net = new Map(); let phase = 'load';
  cdp.on('Network.requestWillBeSent', (e) => { if (!net.has(e.requestId)) net.set(e.requestId, { url: e.request.url, phase, bytes: 0 }); });
  cdp.on('Network.dataReceived', (e) => { const r = net.get(e.requestId); if (r) { r.bytes += e.encodedDataLength; (r.byPhase ??= {})[phase] = (r.byPhase[phase] || 0) + e.encodedDataLength; } });
  cdp.on('Network.loadingFinished', (e) => { const r = net.get(e.requestId); if (r) r.fin = e.encodedDataLength; });
  if (THR) {
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }
  const tNav = Date.now();
  await p.goto(BASE, { waitUntil: 'commit' });
  let timedOut = false;
  try { await p.waitForFunction(() => window.__m && window.__m.cards != null, null, { timeout: CAP, polling: 250 }); }
  catch { timedOut = true; }
  const wall = Date.now() - tNav;
  const cls = (u) => /:8380/.test(u) ? 'firestore' : /:9399|identitytoolkit|securetoken/.test(u) ? 'auth' : /\.js(\?|$)/.test(u) ? 'js' : /\.css/.test(u) ? 'css' : /\.woff2?/.test(u) ? 'font' : u.startsWith('data:') ? 'data-uri' : 'other';
  const snap = (ph) => { const o = { reqs: 0 }; for (const r of net.values()) { const k = cls(r.url); if (k === 'data-uri') continue; const by = ph ? (r.byPhase?.[ph] || 0) : Math.max(r.bytes, r.fin || 0); if (ph && r.phase !== ph && !by) continue; o[k] = (o[k] || 0) + by; o.reqs++; } return o; };
  const atCards = snap();
  if (!timedOut) await p.waitForTimeout(4000);
  const m = await p.evaluate(() => ({ ...window.__m, cardsCount: document.querySelectorAll('a[href^="#/product/"]').length, domNodes: document.getElementsByTagName('*').length }));
  const heap = (await cdp.send('Performance.getMetrics')).metrics.filter((x) => ['JSHeapUsedSize', 'Nodes'].includes(x.name)).map((x) => [x.name, Math.round(x.value / (x.name === 'Nodes' ? 1 : 1048576))]);
  const load = { wall, timedOut, bytesAtCards: atCards, bytesSettled: snap(), lcp: m.lcp.at(-1), lcpAll: m.lcp.length, cards: m.cards && Math.round(m.cards), empty: m.empty && Math.round(m.empty), emptyGone: m.emptyGone && Math.round(m.emptyGone), cardsCount: m.cardsCount, domNodes: m.domNodes, heap, ltSum: Math.round(m.lt.reduce((a, t) => a + t.d, 0)), ltMax: Math.round(Math.max(0, ...m.lt.map((t) => t.d))) };
  const steps = {};
  if (!timedOut && process.env.NO_NAV !== '1') {
    const step = async (name, pred, action) => {
      phase = name;
      const ls = await p.evaluate(() => window.__m.lt.length);
      await p.evaluate(`window.__watch(${pred})`);
      await action();
      try { await p.waitForFunction(() => window.__w.done != null, null, { timeout: 120000, polling: 100 }); } catch { steps[name] = { timeout: true }; return false; }
      await p.waitForTimeout(1500);
      const r = await p.evaluate((ls) => ({ ms: Math.round(window.__w.done - window.__w.t0), lt: window.__m.lt.slice(ls).map((t) => Math.round(t.d)) }), ls);
      r.ltSum = r.lt.reduce((a, x) => a + x, 0); r.net = snap(name); steps[name] = r; return true;
    };
    await step('catalog', PREDS.catalog, () => p.getByRole('navigation', { name: 'Основная навигация' }).getByRole('button', { name: 'Каталог' }).click());
    // product with photos first (live: the only one with photos)
    await step('product', PREDS.product, async () => { const id = process.env.PRODUCT_HREF || await p.evaluate(() => { for (const a of document.querySelectorAll('a[href^="#/product/"]')) { let c = a; for (let i = 0; i < 6 && c; i++) { c = c.parentElement; if (c && c.querySelector('img[src^="data:image/jpeg"]')) return a.getAttribute('href'); } } return null; }); await (id ? p.locator(`a[href="${id}"]`).first() : p.locator('a[href^="#/product/"]').first()).click(); });
    phase = 'addToCart';
    const lsA = await p.evaluate(() => window.__m.lt.length);
    const tA = Date.now();
    await p.locator('[role=radiogroup][aria-label="Размер"] [role=radio]:not([disabled])').first().click();
    await p.getByRole('button', { name: /^В корзину$/ }).first().click();
    await p.waitForTimeout(1500);
    const ltA = await p.evaluate((ls) => window.__m.lt.slice(ls).map((t) => Math.round(t.d)), lsA);
    steps.addToCart = { lt: ltA, ltSum: ltA.reduce((a, x) => a + x, 0), lsBytes: await p.evaluate(() => (localStorage.getItem('manstyle_cart') || '').length) };
    await step('cart', PREDS.cart, () => p.getByRole('navigation', { name: 'Основная навигация' }).getByRole('button', { name: /^Корзина/ }).click());
  }
  if (process.env.REPEAT === '1' && !timedOut) {
    phase = 'reload'; const t = Date.now();
    await p.goto(BASE + '?repeat=1', { waitUntil: 'commit' });
    await p.waitForFunction(() => window.__m && window.__m.cards != null, null, { timeout: CAP, polling: 250 });
    const c = await p.evaluate(() => Math.round(window.__m.cards));
    await p.waitForTimeout(3000);
    steps.reload = { cards: c, net: snap('reload'), lsCart: await p.evaluate(() => (localStorage.getItem('manstyle_cart') || '').length) };
  }
  await p.screenshot({ path: OUT.replace(/\.json$/, `-run${run}.png`) });
  results.push({ run, load, steps, errs: errs.slice(0, 5) });
  console.log(`run ${run}: wall ${wall}ms timedOut=${timedOut} cards=${load.cards} LCP=${Math.round(load.lcp?.t)}(${load.lcp?.tag}) empty=${load.empty}->${load.emptyGone} js=${atCards.js} fs=${atCards.firestore} reqs=${atCards.reqs} | steps ${Object.entries(steps).map(([k, v]) => `${k}:${v.ms ?? ''} lt${v.ltSum}`).join(' ')} ${errs.length ? 'ERR ' + errs[0] : ''}`);
  await ctx.close();
}
fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
await b.close();
