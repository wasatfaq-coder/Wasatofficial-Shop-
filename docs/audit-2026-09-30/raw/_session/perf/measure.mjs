// Measures admin-panel open and section switches in the production build (emulators).
// usage: node measure.mjs <outJson> <throttled:0|1> <runs>
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const OUT = process.argv[2]; const THROTTLE = process.argv[3] === '1'; const RUNS = Number(process.argv[4] || 3);
const BASE = process.env.BASE || 'http://127.0.0.1:3200/';
const cfg = JSON.parse(fs.readFileSync('/home/user/Wasatofficial-Shop-/firebase-applet-config.json', 'utf8'));
const KEY = cfg.apiKey;

// Emulator sign-in (unsigned Google id_token is accepted by the Auth emulator)
async function emulatorSignIn() {
  const idTok = JSON.stringify({ sub: 'admin-1', email: 'gunh83975@gmail.com', email_verified: true, name: 'Администратор' });
  const r = await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ postBody: `id_token=${encodeURIComponent(idTok)}&providerId=google.com`, requestUri: 'http://localhost', returnSecureToken: true, returnIdpCredential: true }),
  });
  const j = await r.json(); if (!j.idToken) throw new Error('signIn failed ' + JSON.stringify(j));
  const now = Date.now();
  return {
    uid: j.localId, email: j.email, emailVerified: true, displayName: j.displayName || 'Администратор', isAnonymous: false,
    providerData: [{ providerId: 'google.com', uid: 'admin-1', displayName: j.displayName || 'Администратор', email: j.email, phoneNumber: null, photoURL: null }],
    stsTokenManager: { refreshToken: j.refreshToken, accessToken: j.idToken, expirationTime: now + Number(j.expiresIn) * 1000 },
    createdAt: String(now), lastLoginAt: String(now), apiKey: KEY, appName: '[DEFAULT]',
  };
}

const INIT = () => {
  window.__lt = [];
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push({ s: e.startTime, d: e.duration }); }).observe({ type: 'longtask', buffered: true }); } catch {}
  performance.setResourceTimingBufferSize?.(5000);
  const inner = () => { const ps = document.querySelectorAll('[role=tabpanel] [role=tabpanel]'); return ps[ps.length - 1] || null; };
  const dialog = () => [...document.querySelectorAll('[role=dialog]')].find((d) => d.textContent.includes('Панель администратора')) || null;
  const loading = () => { const d = dialog(); return !!d && d.textContent.includes('Загрузка раздела…'); };
  window.__arm = (kind) => {
    const panel = inner();
    const w = { kind, t0: null, oldChild: panel ? panel.firstElementChild : null, dialog: null, tablist: null, fallback: null, done: null, tab: null };
    window.__w = w;
    document.addEventListener('click', (e) => { if (w.t0 == null) w.t0 = e.timeStamp; }, { capture: true, once: true });
    const tick = () => {
      const now = performance.now();
      if (w.t0 != null) {
        const d = dialog();
        if (d && w.dialog == null) w.dialog = now;
        if (w.tablist == null && document.querySelector('[role=tablist][aria-label="Разделы панели"]')) w.tablist = now;
        if (w.fallback == null && loading()) w.fallback = now;
        const p = inner(); const c = p && p.firstElementChild;
        if (d && p && c && c !== w.oldChild && !loading() && c.textContent.trim().length > 0) {
          w.done = now; w.tab = document.querySelector('[role=tablist][aria-label^="Разделы группы"] [aria-selected=true]')?.textContent.trim().replace(/\d+$/, '');
          return;
        }
      }
      if (now - (w.t0 ?? now) < 60000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
};

const GROUPS = [
  ['Продажи', ['Аналитика', 'Заказы', 'Клиенты', 'Чат поддержки']],
  ['Каталог', ['Товары', 'Категории', 'Склад и SKU']],
  ['Маркетинг', ['Промокоды', 'Баннеры']],
  ['Магазин', ['Доставка и ПВЗ', 'Оплата', 'FAQ', 'Витрина']],
];

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost'] });
const results = [];
for (let run = 0; run < RUNS; run++) {
  const user = await emulatorSignIn();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'ru-RU' });
  await ctx.addInitScript(INIT);
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Network.enable');
  // CDP network log (encoded bytes per request)
  const net = new Map();
  cdp.on('Network.requestWillBeSent', (e) => net.set(e.requestId, { url: e.request.url, ts: e.timestamp, type: e.type }));
  cdp.on('Network.responseReceived', (e) => { const r = net.get(e.requestId); if (r) { r.status = e.response.status; r.fromCache = e.response.fromDiskCache || e.response.fromPrefetchCache; } });
  cdp.on('Network.loadingFinished', (e) => { const r = net.get(e.requestId); if (r) { r.end = e.timestamp; r.bytes = e.encodedDataLength; } });
  await p.goto(BASE + '#/profile');
  await p.waitForTimeout(1500);
  await p.evaluate(async ({ key, user }) => {
    await new Promise((res, rej) => {
      const o = indexedDB.open('firebaseLocalStorageDb', 1);
      o.onupgradeneeded = () => { if (!o.result.objectStoreNames.contains('firebaseLocalStorage')) o.result.createObjectStore('firebaseLocalStorage', { keyPath: 'fbase_key' }); };
      o.onsuccess = () => { const tx = o.result.transaction('firebaseLocalStorage', 'readwrite'); tx.objectStore('firebaseLocalStorage').put({ fbase_key: `firebase:authUser:${key}:[DEFAULT]`, value: user }); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); };
      o.onerror = () => rej(o.error);
    });
  }, { key: KEY, user });
  if (THROTTLE) {
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: Number(process.env.LAT || 150), downloadThroughput: Number(process.env.DOWN || 1.6e6) / 8, uploadThroughput: 750e3 / 8 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }
  // reload: main bundle comes from HTTP cache (returning visitor), admin chunks never loaded yet
  net.clear();
  const tLoad = Date.now();
  await p.reload();
  await p.locator('#admin-panel-trigger-btn').waitFor({ timeout: 60000 });
  const loadMs = Date.now() - tLoad;
  await p.waitForTimeout(THROTTLE ? 6000 : 3000);
  const pre = await p.evaluate(() => ({
    adminRes: performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /Admin|NeumorphicSelect|useCompositeListItem|html2canvas|jspdf/.test(n)).map((n) => n.split('/').pop()),
    prefetchLinks: [...document.querySelectorAll('link[rel=prefetch],link[rel=modulepreload]')].map((l) => l.href.split('/').pop()),
  }));
  // --- open the panel ---
  const markRes = await p.evaluate(() => performance.getEntriesByType('resource').length);
  const ltStart = await p.evaluate(() => window.__lt.length);
  const netBefore = new Set(net.keys());
  const cdpT0 = (await cdp.send('Runtime.evaluate', { expression: 'performance.timeOrigin + performance.now()', returnByValue: true })).result.value;
  await p.evaluate(() => window.__arm('open'));
  await p.locator('#admin-panel-trigger-btn').click();
  await p.waitForFunction(() => window.__w.done != null, null, { timeout: 90000, polling: 200 });
  await p.waitForTimeout(THROTTLE ? 4000 : 1500);
  const open = await p.evaluate(({ markRes, ltStart }) => {
    const w = window.__w; const rel = (x) => (x == null ? null : Math.round(x - w.t0));
    const res = performance.getEntriesByType('resource').slice(markRes).map((e) => ({ name: e.name.replace(location.origin, ''), start: Math.round(e.startTime - w.t0), end: Math.round(e.responseEnd - w.t0), transfer: e.transferSize, body: e.decodedBodySize, init: e.initiatorType }));
    const lt = window.__lt.slice(ltStart).map((t) => ({ s: Math.round(t.s - w.t0), d: Math.round(t.d) }));
    return { dialog: rel(w.dialog), tablist: rel(w.tablist), fallback: rel(w.fallback), done: rel(w.done), tab: w.tab, res, lt };
  }, { markRes, ltStart });
  open.cdpNet = [...net.entries()].filter(([k]) => !netBefore.has(k)).map(([, r]) => ({ url: r.url.replace(BASE, '/'), bytes: r.bytes, fromCache: r.fromCache, ms: r.end && r.ts ? Math.round((r.end - r.ts) * 1000) : null }));
  // --- sections: two passes ---
  const sections = [];
  const clickAndMeasure = async (loc, pass, via) => {
    const mr = await p.evaluate(() => performance.getEntriesByType('resource').length);
    const ls = await p.evaluate(() => window.__lt.length);
    await p.evaluate(() => window.__arm('tab'));
    await loc.click();
    await p.waitForFunction(() => window.__w.done != null, null, { timeout: 90000, polling: 100 });
    await p.waitForTimeout(THROTTLE ? 1500 : 500);
    const m = await p.evaluate(({ mr, ls }) => {
      const w = window.__w; const rel = (x) => (x == null ? null : Math.round(x - w.t0));
      return { tab: w.tab, fallback: rel(w.fallback), done: rel(w.done),
        chunks: performance.getEntriesByType('resource').slice(mr).filter((e) => e.name.endsWith('.js')).map((e) => ({ name: e.name.split('/').pop(), transfer: e.transferSize, end: Math.round(e.responseEnd - w.t0) })),
        fs: performance.getEntriesByType('resource').slice(mr).filter((e) => e.name.includes(':8080')).length,
        lt: window.__lt.slice(ls).map((t) => ({ s: Math.round(t.s - w.t0), d: Math.round(t.d) })) };
    }, { mr, ls });
    sections.push({ pass, via, ...m });
  };
  for (const pass of process.env.OPEN_ONLY ? [] : [1, 2]) {
    for (const [g, tabs] of GROUPS) {
      const groupTab = p.getByRole('tablist', { name: 'Разделы панели' }).getByRole('tab', { name: g });
      if ((await groupTab.getAttribute('aria-selected')) !== 'true') await clickAndMeasure(groupTab, pass, 'group:' + g);
      for (const t of tabs) {
        const tab = p.getByRole('tablist', { name: `Разделы группы «${g}»` }).getByRole('tab', { name: t });
        if ((await tab.getAttribute('aria-selected')) === 'true') continue;
        await clickAndMeasure(tab, pass, 'tab');
      }
    }
    // pass 2 must revisit analytics too
    if (pass === 1) { /* nothing */ }
  }
  await p.screenshot({ path: OUT.replace(/\.json$/, `-run${run}.png`) });
  results.push({ run, loadMs, pre, open, sections, errs });
  console.log(`run ${run}: open done ${open.done}ms (dialog ${open.dialog}, tablist ${open.tablist}, fallback ${open.fallback}) tab=${open.tab}`);
  for (const s of sections) console.log(`  p${s.pass} ${s.tab} ${s.done}ms fb=${s.fallback} chunks=${s.chunks.map((c) => c.name + ':' + c.transfer).join(',')} lt=${s.lt.map((x) => x.d).join('+')}`);
  await ctx.close();
}
fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
await b.close();
