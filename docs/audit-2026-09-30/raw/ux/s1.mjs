// Scenario 1: find a shirt by size and price, order with courier (guest)
import { start } from './lib.mjs';
const W = Number(process.argv[2] || 390);
const t = await start('s1', W);
const { p, note, shot, step, toasts, visibleButtons, phone } = t;
await t.fresh();
await step('home', async () => { await shot('home'); await t.noHScroll('home'); });

await step('open catalog', async () => {
  if (phone) await p.getByRole('navigation', { name: 'Основная навигация' }).getByRole('button', { name: 'Каталог' }).click();
  else await p.getByRole('button', { name: /^Каталог/ }).first().click();
  await p.waitForTimeout(1500);
  await shot('catalog');
});

await step('filter size L + price', async () => {
  let scope;
  if (phone) {
    await p.locator('button[aria-label="Фильтры"]:visible').first().click();
    await p.waitForTimeout(900);
    scope = p.getByRole('dialog', { name: 'Фильтры' });
  } else scope = p.locator('aside').filter({ hasText: 'Ценовой диапазон' }).first();
  const txt = (await scope.innerText()).replace(/\s+/g, ' ');
  note('  filter text: ' + txt.slice(0, 700));
  // category shirts if present
  const cat = scope.getByRole('button', { name: /^Рубашки/ });
  if (await cat.count()) { await cat.first().click(); note('  picked category Рубашки'); } else note('  !! no category chip «Рубашки» in filter');
  const size = scope.getByRole('button', { name: /^L\s*5/ });
  if (await size.count()) { await size.first().click(); note('  picked size L'); } else note('  !! no size L chip');
  const chips = await scope.locator('button').filter({ hasText: /₽$/ }).allTextContents();
  note('  price chips: ' + JSON.stringify(chips));
  if (chips.length) await scope.getByRole('button', { name: chips[0], exact: true }).click();
  await p.waitForTimeout(400);
  await shot('filter-set');
  if (phone) {
    const show = scope.getByRole('button', { name: /^Показать|Ничего не найдено/ }).last();
    note('  apply button: ' + (await show.textContent()));
    await show.click();
    await p.waitForTimeout(900);
  }
  await shot('catalog-filtered');
  const names = await p.locator('main a[href^="#/product/"], main [href*="product/"]').allTextContents().catch(() => []);
  note('  products shown: ' + JSON.stringify(names.map((x) => x.trim().slice(0, 40))));
});

await step('open shirt', async () => {
  const link = p.locator('a[href="#/product/linen-shirt-01"]:visible').first();
  if (await link.count()) await link.click(); else { note('  !! linen shirt not in filtered list; opening by URL'); await p.goto(t.b ? `${process.env.BASE || 'http://127.0.0.1:3100/'}#/product/linen-shirt-01` : ''); }
  await p.waitForTimeout(1800);
  await shot('product');
  await t.noHScroll('product');
});

await step('add without size', async () => {
  await p.getByRole('button', { name: /^Выберите размер|^В корзину/ }).locator('visible=true').first().click();
  await p.waitForTimeout(700);
  note('  toasts: ' + (await toasts()));
  await shot('add-no-size');
});

await step('pick L and add', async () => {
  await p.locator('[role="radiogroup"][aria-label="Размер"] [role="radio"]').filter({ hasText: /^L/ }).first().click();
  await p.getByRole('button', { name: /^В корзину/ }).locator('visible=true').first().click();
  await p.waitForTimeout(900);
  note('  toasts: ' + (await toasts()));
  await shot('added');
});

await step('go to cart', async () => {
  const act = p.getByRole('button', { name: /^В корзину$|Перейти в корзину|Открыть корзину/ });
  note('  visible: ' + JSON.stringify((await visibleButtons()).slice(-12)));
  if (phone) await p.getByRole('navigation', { name: 'Основная навигация' }).getByRole('button', { name: /Корзина/ }).click();
  else await p.getByRole('button', { name: /Корзина/ }).first().click();
  await p.waitForTimeout(1500);
  await shot('cart');
  note('  cart text: ' + (await p.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 600));
});

await step('checkout', async () => {
  await p.getByRole('button', { name: /Оформить заказ/ }).locator('visible=true').first().click();
  await p.waitForTimeout(1800);
  await shot('checkout-top');
  await shot('checkout-full', true);
});

await step('submit empty', async () => {
  await p.getByRole('button', { name: /Подтвердить/ }).locator('visible=true').last().click();
  await p.waitForTimeout(900);
  const inv = await p.evaluate(() => [...document.querySelectorAll('[aria-invalid="true"]')].map((e) => e.id || e.getAttribute('aria-label') || e.textContent.slice(0, 30)));
  note('  invalid fields: ' + JSON.stringify(inv) + ' focused=' + (await p.evaluate(() => document.activeElement?.id)));
  note('  toasts: ' + (await toasts()));
  await shot('submit-empty');
});

await step('fill contacts', async () => {
  await p.fill('#checkout-name', 'Иван Петров');
  await p.fill('#checkout-phone', '+7 999 000 11 22');
  await p.fill('#checkout-email', 'ivan@example.ru');
  await p.getByRole('radio', { name: /Курьером до двери/ }).first().click();
  await p.waitForTimeout(600);
  await shot('courier-picked');
});

await step('address', async () => {
  const btns = p.locator('#checkout-address button');
  note('  address buttons: ' + JSON.stringify(await btns.allTextContents()));
  await btns.first().click();
  await p.waitForTimeout(900);
  const dlg = p.getByRole('dialog').last();
  note('  address dialog: ' + (await dlg.innerText()).replace(/\s+/g, ' ').slice(0, 500));
  await shot('address-modal');
  const labels = await dlg.locator('label').allTextContents();
  note('  labels: ' + JSON.stringify(labels));
  const fill = async (re, v) => { const l = dlg.getByLabel(re).first(); if (await l.count()) { await l.fill(v); return true; } note('  !! no field ' + re); return false; };
  await fill(/Город/i, 'Москва');
  await fill(/Улица/i, 'ул. Тверская');
  await fill(/Дом/i, '7');
  await fill(/Квартира|кв/i, '12');
  await fill(/Подъезд/i, '2');
  await fill(/Домофон/i, '12К');
  await shot('address-filled');
  await dlg.getByRole('button', { name: /Сохранить|Готово|Применить/ }).last().click();
  await p.waitForTimeout(800);
  await shot('address-saved');
});

await step('payment + submit', async () => {
  await p.getByRole('radio', { name: /Перевод по номеру/ }).first().click();
  await p.waitForTimeout(400);
  const legal = await p.locator('#checkout-form').innerText();
  note('  legal note present: ' + /оферт/i.test(legal));
  await shot('before-submit');
  await p.getByRole('button', { name: /Подтвердить/ }).locator('visible=true').last().click();
  await p.waitForTimeout(3000);
  note('  hash: ' + (await p.evaluate(() => location.hash)));
  note('  toasts: ' + (await toasts()));
  const inv = await p.evaluate(() => [...document.querySelectorAll('[aria-invalid="true"]')].map((e) => e.id));
  note('  invalid: ' + JSON.stringify(inv));
  await shot('after-submit');
  note('  page: ' + (await p.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 700));
});

await step('order in profile', async () => {
  if (phone) await p.getByRole('navigation', { name: 'Основная навигация' }).getByRole('button', { name: 'Профиль' }).click();
  else await p.getByRole('button', { name: /Профиль/ }).first().click();
  await p.waitForTimeout(1500);
  await shot('profile');
  note('  profile: ' + (await p.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 600));
  note('  guest orders in LS: ' + (await p.evaluate(() => Object.keys(localStorage).filter((k) => k.includes('order')).map((k) => k + ':' + localStorage.getItem(k).length))));
});
await t.finish();
