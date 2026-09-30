import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
export const BASE = process.env.BASE || 'http://127.0.0.1:3100/';
export const UX = '/tmp/claude-0/-home-user-Wasatofficial-Shop-/6ae9196d-6e10-572e-9337-53506395115c/scratchpad/risk/ux';

export async function start(tag, W) {
  const OUT = `${UX}/${tag}-${W}`;
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const phone = W < 1024;
  const ctx = await b.newContext({ viewport: { width: W, height: phone ? (W <= 320 ? 640 : 844) : 900 }, locale: 'ru-RU', isMobile: phone, hasTouch: phone, deviceScaleFactor: phone ? 2 : 1 });
  await ctx.route((url) => !url.hostname.includes('127.0.0.1') && !url.hostname.includes('localhost'), (route) =>
    route.request().resourceType() === 'image'
      ? route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="6" height="8"><rect width="6" height="8" fill="#9FB0C4"/></svg>' })
      : route.abort()
  );
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const cons = []; p.on('console', (m) => { if (m.type() === 'error') cons.push(m.text().slice(0, 300)); });
  const log = [];
  const note = (s) => { log.push(s); console.log(s); };
  let n = 0;
  const shot = async (name, full = false) => { await p.waitForTimeout(350); const f = `${OUT}/${String(++n).padStart(2, '0')}-${name}.png`; await p.screenshot({ path: f, fullPage: full }); note(`  [shot] ${f.replace(UX + '/', '')}`); return f; };
  const step = async (name, fn) => {
    note(`STEP ${name}`);
    try { await fn(); } catch (e) {
      note(`  !! FAIL ${name}: ${e.message.split('\n').slice(0, 2).join(' | ')}`);
      await shot(`fail-${name.replace(/[^\wа-яё]+/gi, '_')}`).catch(() => {});
    }
  };
  const toasts = () => p.evaluate(() => [...document.querySelectorAll('[role="status"], [role="alert"]')].map((t) => t.textContent.trim()).filter(Boolean).join(' | '));
  const visibleButtons = () => p.evaluate(() => [...document.querySelectorAll('button,a,[role=radio],[role=tab]')].filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.height && r.bottom > 0 && r.top < innerHeight; }).map((e) => (e.getAttribute('aria-label') || e.textContent).trim().replace(/\s+/g, ' ').slice(0, 40)).filter(Boolean));
  const signIn = async (who = { sub: 'admin-1', email: 'gunh83975@gmail.com', name: 'Администратор' }) => {
    const authUrl = await p.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name).find((x) => x.includes('/deps/firebase_auth.js')));
    await p.evaluate(async ({ authUrl, who }) => {
      const { auth } = await import('/src/firebase.ts'); const m = await import(authUrl);
      await m.signInWithCredential(auth, m.GoogleAuthProvider.credential(JSON.stringify({ ...who, email_verified: true })));
    }, { authUrl, who });
    await p.waitForTimeout(3000);
  };
  const finish = async () => {
    note(`pageerrors: ${errs.length ? errs.join(' | ') : 'none'}`);
    note(`console errors: ${cons.length ? [...new Set(cons)].slice(0, 8).join(' || ') : 'none'}`);
    fs.writeFileSync(`${OUT}/log.txt`, log.join('\n'));
    await b.close();
  };
  const fresh = async (hash = '') => {
    await p.goto(BASE);
    await p.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
    await p.goto(BASE + hash);
    await p.waitForTimeout(3000);
  };
  const noHScroll = async (where) => { const r = await p.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, w: innerWidth })); if (r.sw > r.w) note(`  !! horizontal scroll on ${where}: ${JSON.stringify(r)}`); };
  return { b, ctx, p, OUT, W, phone, note, shot, step, toasts, visibleButtons, signIn, finish, fresh, noHScroll, errs };
}
