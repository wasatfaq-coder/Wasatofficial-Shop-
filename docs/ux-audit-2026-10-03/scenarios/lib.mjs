import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
export const BASE = process.env.BASE || 'http://127.0.0.1:5580/';
export const UX = process.env.UX_OUT || '/tmp/claude-0/-home-user-Wasatofficial-Shop-/2b208f14-8bf5-5160-a59d-115c60d1396c/scratchpad/audit/ux';

const scanFn = () => {
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; };
  const name = (e) => (e.getAttribute('aria-label') || e.getAttribute('title') || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  const parseRGB = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const a = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: a[0], g: a[1], b: a[2], a: a[3] ?? 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const bgOf = (e) => { for (let n = e; n; n = n.parentElement) { const s = getComputedStyle(n); if (s.backgroundImage && s.backgroundImage !== 'none') return null; const c = parseRGB(s.backgroundColor); if (c && c.a > 0.9) return c; } return { r: 255, g: 255, b: 255, a: 1 }; };
  const small = [], lowContrast = [], tinyTargets = [], noName = [], noLabel = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (walker.nextNode()) {
    const t = walker.currentNode; if (!t.textContent.trim()) continue;
    const e = t.parentElement; if (!e || seen.has(e) || !vis(e)) continue; seen.add(e);
    if (e.closest('svg,[aria-hidden="true"],.recharts-wrapper')) continue;
    const s = getComputedStyle(e); const fs = parseFloat(s.fontSize);
    if (fs < 11) small.push(`${fs}px «${t.textContent.trim().slice(0, 30)}»`);
    const fg = parseRGB(s.color); const bg = bgOf(e);
    if (fg && bg && fg.a > 0.5 && !e.closest('button:disabled,[aria-disabled="true"]')) {
      const L1 = lum(fg), L2 = lum(bg); const cr = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const large = fs >= 24 || (fs >= 18.66 && Number(s.fontWeight) >= 700);
      const op = Number(s.opacity) * Number(getComputedStyle(e.parentElement || e).opacity);
      if (cr < (large ? 3 : 4.5) || op < 0.6) lowContrast.push(`${cr.toFixed(2)}${op < 0.6 ? ' op' + op.toFixed(2) : ''} ${s.color}/${`rgb(${bg.r},${bg.g},${bg.b})`} «${t.textContent.trim().slice(0, 30)}»`);
    }
  }
  for (const e of document.querySelectorAll('button,a[href],[role=button],[role=radio],[role=tab],[role=switch],[role=checkbox],input,select,textarea')) {
    if (!vis(e) || e.disabled) continue;
    const r = e.getBoundingClientRect();
    if ((r.width < 24 || r.height < 24) && !(e.tagName === 'A' && getComputedStyle(e).display === 'inline')) tinyTargets.push(`${Math.round(r.width)}x${Math.round(r.height)} ${e.tagName.toLowerCase()} «${name(e)}»`);
    if (['BUTTON', 'A'].includes(e.tagName) || e.getAttribute('role')) { if (!name(e) && !e.getAttribute('aria-labelledby')) noName.push(e.outerHTML.slice(0, 120)); }
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.tagName) && !['hidden', 'submit', 'button'].includes(e.type)) {
      const lab = e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || (e.id && document.querySelector(`label[for="${CSS.escape(e.id)}"]`)) || e.closest('label');
      if (!lab) noLabel.push(`${e.tagName.toLowerCase()}[${e.type}] placeholder=«${e.placeholder || ''}» name=${e.name || ''}`);
    }
  }
  const sw = document.scrollingElement.scrollWidth;
  return { hscroll: sw > innerWidth ? `${sw}>${innerWidth}` : '', small: [...new Set(small)], lowContrast: [...new Set(lowContrast)], tinyTargets: [...new Set(tinyTargets)], noName, noLabel };
};

export async function start(tag, W, opts = {}) {
  const OUT = `${UX}/${tag}-${W}`;
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const phone = W < 1024;
  const ctx = await b.newContext({ viewport: { width: W, height: phone ? (W <= 320 ? 640 : 844) : 900 }, locale: 'ru-RU', timezoneId: opts.tz || 'Europe/Moscow', isMobile: phone, hasTouch: phone, deviceScaleFactor: 1 });
  await ctx.route((url) => !url.hostname.includes('127.0.0.1') && !url.hostname.includes('localhost'), (route) =>
    route.request().resourceType() === 'image'
      ? route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="6" height="8"><rect width="6" height="8" fill="#9FB0C4"/></svg>' })
      : route.abort()
  );
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const cons = []; p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') cons.push(m.text().slice(0, 300)); });
  const log = [];
  const note = (s) => { log.push(s); console.log(s); };
  let n = 0;
  const shot = async (name, full = false) => { await p.waitForTimeout(400); const f = `${OUT}/${String(++n).padStart(2, '0')}-${name}.png`; await p.screenshot({ path: f, fullPage: full }); note(`  [shot] ${f.replace(UX + '/', '')}`); return f; };
  const step = async (name, fn) => {
    note(`STEP ${name}`);
    try { await fn(); } catch (e) {
      note(`  !! FAIL ${name}: ${e.message.split('\n').slice(0, 2).join(' | ')}`);
      await shot(`fail-${name.replace(/[^\wа-яё]+/gi, '_')}`).catch(() => {});
    }
  };
  const toasts = () => p.evaluate(() => [...document.querySelectorAll('[role="status"], [role="alert"]')].map((t) => t.textContent.trim()).filter(Boolean).join(' | '));
  const scan = async (where) => { const r = await p.evaluate(scanFn); const parts = []; for (const k of ['hscroll', 'small', 'lowContrast', 'tinyTargets', 'noName', 'noLabel']) if (r[k] && r[k].length) parts.push(`${k}: ${Array.isArray(r[k]) ? r[k].slice(0, 12).join(' ; ') + (r[k].length > 12 ? ` (+${r[k].length - 12})` : '') : r[k]}`); note(`  [scan ${where}] ${parts.join(' || ') || 'ok'}`); return r; };
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
    note(`console errors: ${cons.length ? [...new Set(cons)].slice(0, 10).join(' || ') : 'none'}`);
    fs.writeFileSync(`${OUT}/log.txt`, log.join('\n'));
    await b.close();
  };
  const fresh = async (hash = '') => {
    await p.goto(BASE);
    await p.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
    await p.goto(BASE + hash);
    await p.waitForTimeout(3500);
  };
  const go = async (hash) => { await p.evaluate((h) => { location.hash = h; }, hash); await p.waitForTimeout(1500); };
  // axe-core, WCAG 2.1 A/AA: violations with impact and a few targets
  const axe = async (where) => {
    await p.addScriptTag({ path: UX + '/axe/node_modules/axe-core/axe.min.js' }).catch(() => {});
    const res = await p.evaluate(async () => {
      const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, resultTypes: ['violations'] });
      return r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, targets: v.nodes.slice(0, 4).map((x) => x.target.join(' ').slice(0, 90) + (x.any?.[0]?.data?.contrastRatio ? ` (${x.any[0].data.contrastRatio}:1 ${x.any[0].data.fgColor}/${x.any[0].data.bgColor})` : '')) }));
    });
    note(`  [axe ${where}] ${res.length ? res.map((v) => `${v.id}/${v.impact}×${v.n}: ${v.targets.join(' | ')}`).join(' || ') : 'ok'}`);
    return res;
  };
  return { b, ctx, p, OUT, W, phone, note, shot, step, toasts, scan, signIn, finish, fresh, go, errs, axe };
}
