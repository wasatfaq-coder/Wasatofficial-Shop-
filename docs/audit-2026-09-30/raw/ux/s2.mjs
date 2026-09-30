// Scenario 2: return to the order and write to support — guest (A) and signed-in customer (B)
import { start, BASE } from './lib.mjs';
const W = Number(process.argv[2] || 390);
const WHO = process.argv[3] || 'guest';
const t = await start(`s2${WHO}`, W);
const { p, note, shot, step, toasts, visibleButtons, phone } = t;
const nav = async (name) => {
  if (phone) await p.getByRole('navigation', { name: 'Основная навигация' }).getByRole('button', { name: new RegExp(name) }).click();
  else await p.getByRole('button', { name: new RegExp('^' + name) }).first().click();
  await p.waitForTimeout(1500);
};
const placeOrder = async () => {
  await p.goto(BASE + '#/product/polo-classic-02'); await p.waitForTimeout(2000);
  await p.locator('[role="radiogroup"][aria-label="Размер"] [role="radio"]').filter({ hasText: /^M/ }).first().click();
  await p.getByRole('button', { name: /^В корзину/ }).locator('visible=true').first().click();
  await p.waitForTimeout(600);
  await nav('Корзина');
  await p.getByRole('button', { name: /Оформить заказ/ }).locator('visible=true').first().click();
  await p.waitForTimeout(1500);
  await p.fill('#checkout-name', 'Иван Петров');
  await p.fill('#checkout-phone', '+7 999 000 11 22');
  await p.fill('#checkout-email', 'ivan@example.ru');
  await p.getByRole('radio', { name: /Пункт выдачи/ }).first().click();
  await p.waitForTimeout(500);
  const pts = p.locator('#checkout-address [role="radio"]');
  if (await pts.count()) await pts.first().click();
  await p.getByRole('radio', { name: /Перевод по номеру/ }).first().click();
  await p.getByRole('button', { name: /Подтвердить/ }).locator('visible=true').last().click();
  await p.waitForTimeout(3000);
  note('  order placed: ' + (await p.evaluate(() => location.hash)) + ' ' + (await toasts()));
};

await t.fresh('#/profile');
if (WHO === 'customer') {
  await step('sign in as customer', async () => {
    await t.signIn({ sub: 'buyer-77', email: 'buyer77@example.ru', name: 'Олег Покупатель' });
    await p.goto(BASE + '#/profile'); await p.waitForTimeout(2500);
    await shot('profile-signed-in');
  });
}
await step('place order', placeOrder);
await step('success screen', async () => { await shot('success'); note('  buttons: ' + JSON.stringify(await visibleButtons())); });

// the buyer comes back later: reload the site
await step('come back later', async () => {
  await p.goto(BASE); await p.waitForTimeout(3000);
  await nav('Профиль');
  await shot('profile');
  const txt = (await p.locator('main').innerText()).replace(/\s+/g, ' ');
  note('  profile top: ' + txt.slice(0, 300));
});

await step('open orders', async () => {
  await p.getByRole('button', { name: /Заказы и трекинг/ }).first().click();
  await p.waitForTimeout(1200);
  await shot('orders');
  const dlg = p.getByRole('dialog').last();
  note('  orders dialog: ' + (await dlg.innerText()).replace(/\s+/g, ' ').slice(0, 700));
  note('  buttons: ' + JSON.stringify(await visibleButtons()));
});

await step('open order detail', async () => {
  const dlg = p.getByRole('dialog').last();
  const cand = dlg.getByRole('button', { name: /WS-|Подробнее|Детали|Отследить/ });
  note('  candidates: ' + JSON.stringify(await cand.allTextContents()));
  if (await cand.count()) await cand.first().click();
  await p.waitForTimeout(1200);
  await shot('order-detail');
  note('  after click: ' + (await p.getByRole('dialog').last().innerText()).replace(/\s+/g, ' ').slice(0, 900));
  note('  buttons: ' + JSON.stringify(await visibleButtons()));
});

await step('order detail bottom', async () => {
  await p.evaluate(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); d.querySelectorAll('*').forEach((e) => { if (e.scrollHeight > e.clientHeight + 20 && getComputedStyle(e).overflowY !== 'visible') e.scrollTop = e.scrollHeight; }); });
  await p.waitForTimeout(500);
  await shot('order-detail-bottom');
  const d = p.getByRole('dialog').last();
  note('  detail buttons: ' + JSON.stringify(await d.getByRole('button').allTextContents()));
});
await step('write to support from orders list', async () => {
  await p.keyboard.press('Escape'); await p.waitForTimeout(600);
  const b = p.getByRole('button', { name: /Написать в службу поддержки/ }).locator('visible=true');
  note('  found: ' + (await b.count()));
  await b.first().click(); await p.waitForTimeout(2500);
  await shot('chat-open');
  const chat = p.getByRole('dialog').last();
  note('  chat: ' + (await chat.innerText()).replace(/\s+/g, ' ').slice(0, 500));
  const input = chat.locator('textarea, input[type="text"]').last();
  note('  prefilled input: ' + JSON.stringify(await input.inputValue()));
  await input.fill('Здравствуйте! Можно поменять размер в моем заказе на L?');
  await chat.getByRole('button', { name: /Отправить/ }).last().click();
  await p.waitForTimeout(3500);
  await shot('chat-sent');
  note('  chat after send: ' + (await chat.innerText()).replace(/\s+/g, ' ').slice(-400));
  note('  toasts: ' + (await toasts()));
});

await step('reload keeps chat', async () => {
  await p.reload(); await p.waitForTimeout(3500);
  await p.getByRole('button', { name: 'Открыть меню' }).locator('visible=true').first().click();
  await p.waitForTimeout(700);
  await p.getByRole('button', { name: /Поддержка/ }).first().click(); await p.waitForTimeout(2500);
  const chat = p.getByRole('dialog').last();
  note('  chat after reload: ' + (await chat.innerText()).replace(/\s+/g, ' ').slice(-400));
  await shot('chat-after-reload');
});
await t.finish();
