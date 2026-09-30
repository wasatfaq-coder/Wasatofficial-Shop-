// axe-core scan of every screen (adapted from ../design/shoot.mjs)
// usage: node scan.mjs <out.json> <width> <full|empty>
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const A11Y = '/tmp/claude-0/-home-user-Wasatofficial-Shop-/6ae9196d-6e10-572e-9337-53506395115c/scratchpad/a11y';
const AXE = A11Y + '/node_modules/axe-core/axe.min.js';
const [OUT, W, MODE] = [process.argv[2], Number(process.argv[3]), process.argv[4] || 'full'];
const H = W < 600 ? 844 : 900;
const BASE = process.env.BASE || 'http://127.0.0.1:3100/';
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const SHOTS = OUT.replace(/\.json$/, '') + '-shots';
fs.mkdirSync(SHOTS, { recursive: true });

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, locale: 'ru-RU' });
const tones = [['#C9B8A0', '#8E7A61'], ['#9FB0C4', '#5E7189'], ['#B7B09E', '#6F6857'], ['#A9A2B5', '#645C73'], ['#C4A99A', '#86695A'], ['#9EB3A5', '#5C7564']];
await ctx.route((url) => !url.hostname.includes('127.0.0.1') && !url.hostname.includes('localhost'), async (route) => {
  if (route.request().resourceType() !== 'image') return route.abort();
  let h = 0; for (const ch of route.request().url()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [a, c] = tones[h % tones.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${c}"/></linearGradient></defs><rect width="600" height="800" fill="url(#g)"/><path d="M300 250a40 40 0 1 1 40-40M300 250v30L140 420h320L300 280" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg });
});
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
const results = [];
const failed = [];

const ensureAxe = async () => {
  if (!(await p.evaluate(() => typeof window.axe !== 'undefined'))) await p.addScriptTag({ path: AXE });
};

// run axe on the whole document and, for an open dialog, scoped to it
const scan = async (screen, { dialog = false } = {}) => {
  await p.waitForTimeout(1200);
  await ensureAxe();
  await p.screenshot({ path: `${SHOTS}/${String(results.length).padStart(3, '0')}-${screen}.png` }).catch(() => {});
  const scopes = dialog ? ['document', 'dialog'] : ['document'];
  for (const scope of scopes) {
    const r = await p.evaluate(async ({ scope, TAGS }) => {
      let target = document; let scopeInfo = 'document';
      if (scope === 'dialog') {
        const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
        const cands = [...document.querySelectorAll('[role="dialog"],[role="alertdialog"],.neu-modal')]
          .filter((e) => vis(e) && !e.closest('[role="alert"]'));
        if (!cands.length) return { error: 'no dialog found' };
        // last in DOM order = the top-most layer (portals are appended to <body>)
        let el = cands[cands.length - 1];
        // prefer the role=dialog wrapper if the neu-modal sits inside one
        const withRole = el.closest('[role="dialog"],[role="alertdialog"]');
        if (withRole) el = withRole;
        target = el;
        scopeInfo = el.tagName.toLowerCase() + (el.getAttribute('role') ? `[role=${el.getAttribute('role')}]` : '') + ' .' + [...el.classList].slice(0, 4).join('.');
      }
      const res = await window.axe.run(target, { runOnly: { type: 'tag', values: TAGS }, resultTypes: ['violations', 'incomplete'] });
      const slimCheck = (c) => {
        const d = c.data && JSON.stringify(c.data).length < 600 ? c.data : undefined;
        return { id: c.id, message: c.message, data: d, related: (c.relatedNodes || []).slice(0, 2).map((n) => ({ target: n.target, html: (n.html || '').slice(0, 200) })) };
      };
      const slim = (x) => ({
        id: x.id, impact: x.impact, help: x.help, description: x.description, helpUrl: x.helpUrl, tags: x.tags,
        nodes: x.nodes.map((n) => ({ target: n.target, html: n.html.slice(0, 400), impact: n.impact, failureSummary: n.failureSummary, checks: [...n.any, ...n.all, ...n.none].map(slimCheck) })),
      });
      return { scopeInfo, url: location.href, violations: res.violations.map(slim), incomplete: res.incomplete.map(slim), testEngine: res.testEngine?.version };
    }, { scope, TAGS });
    results.push({ screen, width: W, mode: MODE, scope, ...r });
    const v = r.violations || []; const inc = r.incomplete || [];
    console.log(`scan ${screen} [${scope}] violations=${v.length} (${v.map((x) => x.id + ':' + x.nodes.length).join(', ')}) incomplete=${inc.length}${r.error ? ' ERROR ' + r.error : ''}`);
  }
};

const safe = async (name, fn) => { try { await fn(); } catch (e) { failed.push({ name, width: W, mode: MODE, error: e.message.split('\n')[0] }); console.log('FAIL', name, e.message.split('\n')[0]); } };
const nav = async (label) => { await p.locator(`button[aria-label="${label}"]`).last().click(); await p.waitForTimeout(900); };
// the app restores the last tab from sessionStorage (checkout has no bottom nav): start from home
const home = async () => { await p.goto(BASE); await p.evaluate(() => { try { sessionStorage.removeItem('manstyle_active_tab'); } catch {} }); await p.goto(BASE); await p.waitForTimeout(3500); };

const signInAdmin = async () => {
  await home();
  await nav('Профиль');
  const authUrl = await p.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name).find((x) => x.includes('/deps/firebase_auth.js')));
  await p.evaluate(async (authUrl) => {
    const { auth } = await import('/src/firebase.ts'); const m = await import(authUrl);
    await m.signInWithCredential(auth, m.GoogleAuthProvider.credential(JSON.stringify({ sub: 'admin-1', email: 'gunh83975@gmail.com', email_verified: true, name: 'Администратор' })));
  }, authUrl);
  await p.waitForTimeout(3000);
};
const openAdmin = async () => { await p.locator('#admin-panel-trigger-btn').click(); await p.waitForTimeout(1500); };
const adminTab = async (t) => { await p.locator('.admin-tab-bar button', { hasText: t }).first().click(); await p.waitForTimeout(1500); };
const slug = (t) => t.replace(/[^a-zA-Zа-яА-Я]/g, '');

await home();
if (MODE === 'full') {
  await safe('home', () => scan('home'));
  await safe('menu', async () => { await p.locator('button[aria-label="Открыть меню"]').first().click(); await scan('menu', { dialog: true }); });
  await home();
  await safe('search', async () => { const s = p.locator('input[type="search"], input[placeholder*="оиск"]').first(); await s.click(); await s.fill('руб'); await p.waitForTimeout(800); await scan('search'); });
  await home();
  await safe('cart-empty', async () => { await nav('Корзина'); await scan('cart-empty'); });
  await safe('favorites-empty', async () => { await nav('Избранное'); await scan('favorites-empty'); });
  await safe('profile-guest', async () => { await nav('Профиль'); await scan('profile-guest'); });
  await safe('catalog', async () => { await nav('Каталог'); await scan('catalog'); });
  await safe('catalog-filters', async () => { await p.locator('button[aria-label="Расширенная фильтрация"], button[aria-label="Фильтры"]').first().click(); await scan('catalog-filters', { dialog: true }); });
  await home();
  await safe('quick-view', async () => { await nav('Каталог'); await p.locator('button[aria-label="Быстрый просмотр"]').first().click(); await scan('quick-view', { dialog: true }); });
  await home();
  await safe('product', async () => { await nav('Каталог'); await p.locator('h3').first().click(); await p.waitForTimeout(1200); await scan('product'); });
  await safe('cart', async () => { await p.locator('button:has-text("В корзину")').first().click(); await p.waitForTimeout(1000); await nav('Корзина'); await scan('cart'); });
  await safe('checkout', async () => { await p.locator('button:has-text("Оформить заказ")').first().click(); await p.waitForTimeout(1200); await scan('checkout'); });
  await safe('support-chat', async () => {
    await home(); await p.locator('button[aria-label="Открыть меню"]').first().click(); await p.waitForTimeout(800);
    await p.locator('button:has-text("Онлайн-чат с магазином")').first().click(); await p.waitForTimeout(2000);
    await scan('support-chat', { dialog: true });
  });
  await signInAdmin();
  await safe('profile-admin', () => scan('profile-admin'));
  await safe('admin', async () => {
    await openAdmin();
    const tabs = ['Аналитика', 'Каталог', 'Категории', 'Склад и SKU', 'Заказы', 'Доставка и ПВЗ', 'Оплата', 'Клиенты', 'Промокоды', 'Баннеры', 'Чат поддержки', 'FAQ', 'Витрина'];
    for (const t of tabs) await safe('admin-' + t, async () => { await adminTab(t); await scan('admin-' + slug(t), { dialog: true }); });
    await safe('admin-product-form', async () => {
      await adminTab('Каталог');
      await p.locator('button:has-text("Добавить товар"), button:has-text("Новый товар")').first().click(); await p.waitForTimeout(1500);
      await scan('admin-product-form', { dialog: true });
    });
  });
} else {
  // empty store: nothing seeded
  await safe('empty-home', () => scan('empty-home'));
  await safe('empty-catalog', async () => { await nav('Каталог'); await scan('empty-catalog'); });
  await safe('empty-cart', async () => { await nav('Корзина'); await scan('empty-cart'); });
  await signInAdmin();
  await safe('empty-admin', async () => {
    await openAdmin();
    for (const t of ['Каталог', 'Заказы', 'Клиенты']) await safe('empty-admin-' + t, async () => { await adminTab(t); await scan('empty-admin-' + slug(t), { dialog: true }); });
  });
}
fs.writeFileSync(OUT, JSON.stringify({ width: W, mode: MODE, results, failed, pageErrors: errs }, null, 1));
console.log('pageerrors', JSON.stringify(errs));
console.log('failed', JSON.stringify(failed));
await b.close();
