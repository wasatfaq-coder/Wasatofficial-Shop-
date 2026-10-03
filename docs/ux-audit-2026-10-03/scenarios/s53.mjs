// Аудит UX 03.10: пустая база — покупатель и первый вход владельца (запускать после `node seed.mjs empty`)
import { start } from './lib.mjs';
const W = Number(process.argv[2] || 390);
const t = await start('s53', W);
const { p, note, shot, step, scan, fresh, toasts, axe, go } = t;
const check = async (name) => { await shot(name); await scan(name); await axe(name); };
const text = async () => (await p.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 500);

await step('customer', async () => {
  await fresh('');
  await check('home');
  note('  home: ' + (await text()));
  await go('#/catalog');
  await p.waitForTimeout(1500);
  await check('catalog');
  note('  catalog: ' + (await text()));
  await go('#/product/nope-1');
  await p.waitForTimeout(2000);
  note('  product link to nothing → ' + p.url().split('#')[1] + '; toasts: ' + (await toasts()));
  await go('#/cart');
  await p.waitForTimeout(1200);
  await check('cart');
  note('  cart: ' + (await text()));
  await go('#/profile');
  await p.waitForTimeout(1500);
  await check('profile');
  // the side menu: brand, requisites, documents
  await p.getByRole('button', { name: /Меню|Открыть меню/ }).first().click().catch(() => note('  no menu button'));
  await p.waitForTimeout(800);
  await check('side-menu');
  note('  side menu: ' + (await p.locator('[role=dialog]').last().innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 500));
});

await step('owner-first-visit', async () => {
  await fresh('#/profile');
  await t.signIn();
  await p.getByRole('button', { name: /Панель администратора/ }).first().click();
  await p.waitForTimeout(3000);
  await check('admin');
  note('  admin: ' + (await p.locator('[role=dialog]').first().innerText()).replace(/\s+/g, ' ').slice(0, 700));
});

await t.finish();
