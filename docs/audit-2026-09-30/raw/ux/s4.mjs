// Scenario 4: empty database — first buyer and owner's first day
import { start, BASE } from './lib.mjs';
const W = Number(process.argv[2] || 390);
const t = await start(process.env.TAG || 's4', W);
const { p, note, shot, step, toasts, visibleButtons, phone } = t;
const mainText = async () => (await p.locator('main').innerText().catch(() => p.locator('body').innerText())).replace(/\s+/g, ' ');
await t.fresh();
if (!process.env.SKIP_BUYER) {
  await step('buyer home', async () => { await shot('home'); note('  home: ' + (await mainText()).slice(0, 500)); });
  await step('buyer catalog', async () => { await p.goto(BASE + '#/catalog'); await p.waitForTimeout(1500); await shot('catalog'); note('  catalog: ' + (await mainText()).slice(0, 300)); });
  if (process.env.PRODUCT) {
    await step('buyer product → checkout', async () => {
      await p.goto(BASE + '#/product/p-first'); await p.waitForTimeout(1800);
      await shot('product');
      note('  product: ' + (await mainText()).slice(0, 400));
      await p.locator('[role="radiogroup"][aria-label="Размер"] [role="radio"]').first().click().catch(() => note('  no size radios'));
      await p.getByRole('button', { name: /^В корзину/ }).locator('visible=true').first().click().catch((e) => note('  add fail ' + e.message.slice(0, 80)));
      await p.waitForTimeout(700);
      await p.goto(BASE + '#/cart'); await p.waitForTimeout(1500);
      await shot('cart');
      note('  cart: ' + (await mainText()).slice(0, 500));
      const co = p.getByRole('button', { name: /Оформить заказ/ }).locator('visible=true').first();
      note('  checkout enabled: ' + (await co.isEnabled().catch(() => 'n/a')));
      await co.click().catch(() => {});
      await p.waitForTimeout(1500);
      await shot('checkout'); await shot('checkout-full', true);
      note('  checkout: ' + (await mainText()).slice(0, 1500));
      const conf = p.getByRole('button', { name: /Подтвердить/ }).locator('visible=true').last();
      note('  confirm enabled: ' + (await conf.isEnabled().catch(() => 'n/a')));
    });
  }
  await step('buyer menu + profile', async () => {
    await p.getByRole('button', { name: 'Открыть меню' }).locator('visible=true').first().click(); await p.waitForTimeout(700);
    await shot('menu'); note('  menu: ' + (await p.getByRole('dialog').last().innerText()).replace(/\s+/g, ' ').slice(0, 400));
    await p.keyboard.press('Escape'); await p.waitForTimeout(400);
    await p.goto(BASE + '#/offer'); await p.waitForTimeout(1200); await shot('offer'); note('  offer: ' + (await mainText()).slice(0, 300));
  });
}
if (!process.env.SKIP_OWNER) {
  await step('owner signs in', async () => {
    await p.goto(BASE + '#/profile'); await p.waitForTimeout(1500);
    await t.signIn();
    await p.goto(BASE + '#/profile'); await p.waitForTimeout(2000);
    await shot('owner-profile');
    await p.locator('#admin-panel-trigger-btn').click(); await p.waitForTimeout(2500);
    await shot('owner-panel-first');
    note('  first panel: ' + (await p.getByRole('dialog').last().innerText()).replace(/\s+/g, ' ').slice(0, 900));
  });
  const panel = () => p.getByRole('dialog', { name: /Панель администратора/ });
  for (const [g, secs] of [['Магазин', null], ['Продажи', null], ['Каталог', null], ['Маркетинг', null]]) {
    await step(`owner group ${g}`, async () => {
      await panel().getByRole('tablist', { name: 'Разделы панели' }).getByRole('tab').filter({ hasText: g }).click(); await p.waitForTimeout(1200);
      const tabs = await panel().getByRole('tab').evaluateAll((ts) => ts.map((x) => x.textContent.trim()));
      note(`  ${g} tabs: ` + JSON.stringify(tabs));
      const inner = await panel().getByRole('tablist').nth(1).getByRole('tab').allTextContents().catch(() => []);
      for (const name of inner) {
        await panel().getByRole('tablist').nth(1).getByRole('tab').filter({ hasText: name }).first().click(); await p.waitForTimeout(1600);
        const safe = name.replace(/[^\wа-яё]+/gi, '_').slice(0, 20);
        await shot(`owner-${safe}`);
        const txt = (await panel().innerText()).replace(/\s+/g, ' ');
        const k = txt.indexOf(name.trim().split(/\d/)[0], 150);
        note(`  [${g} → ${name.trim()}] ` + txt.slice(Math.max(0, k), k + 450));
      }
    });
  }
}
await t.finish();
