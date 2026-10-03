// Аудит UX 03.10, сценарий Б: покупатель с входом оформил заказ, вернулся к нему и написал в чат
import { start } from './lib.mjs';
const W = Number(process.argv[2] || 390);
const t = await start('s51', W);
const { p, note, shot, step, scan, fresh, toasts, axe, go } = t;
const check = async (name) => { await shot(name); await scan(name); await axe(name); };
const dialog = () => p.locator('[role=dialog]').last();

await step('sign-in-and-order', async () => {
  await fresh('#/profile');
  await t.signIn({ sub: 'buyer-s51', email: 'olga.s51@example.ru', name: 'Ольга Покупатель' });
  await go('#/product/polo-classic-02');
  await p.waitForTimeout(1500);
  await p.getByRole('radio', { name: /^L\b/ }).first().click();
  await p.getByRole('button', { name: /В корзину/ }).last().click();
  await p.waitForTimeout(600);
  await go('#/cart');
  await p.waitForTimeout(1000);
  await p.getByRole('button', { name: /Оформить заказ/ }).first().click();
  await p.waitForTimeout(1500);
  note('  prefilled: ' + (await p.evaluate(() => ['checkout-last-name', 'checkout-first-name', 'checkout-email'].map((id) => `${id}=${document.getElementById(id)?.value}`).join(' '))));
  await p.fill('#checkout-last-name', 'Покупатель');
  await p.fill('#checkout-first-name', 'Ольга');
  await p.fill('#checkout-middle-name', 'Сергеевна');
  await p.fill('#checkout-phone', '+79997654321');
  await p.getByRole('radio', { name: /^Пункт выдачи/ }).click();
  await p.getByRole('radio', { name: /^Наличными или картой/ }).click();
  await p.locator('#checkout-confirm').click();
  await p.waitForTimeout(4500);
  note('  url ' + p.url().split('#')[1] + '; toasts: ' + (await toasts()));
  await shot('success');
});

await step('profile-orders', async () => {
  await go('#/profile');
  await p.waitForTimeout(1500);
  await check('profile');
  await shot('profile-full', true);
  await p.getByRole('button', { name: /Заказы/ }).first().click();
  await p.waitForTimeout(1200);
  await check('orders');
  note('  orders dialog buttons: ' + (await dialog().getByRole('button').allTextContents()).map((s) => s.trim().replace(/\s+/g, ' ').slice(0, 28)).filter(Boolean).slice(0, 25).join(' | '));
});

await step('order-detail', async () => {
  await dialog().getByRole('button', { name: /Подробнее|Детали|WS-/ }).first().click();
  await p.waitForTimeout(1200);
  await check('order-detail');
  await shot('order-detail-full', true);
  note('  detail text: ' + (await dialog().innerText()).replace(/\s+/g, ' ').slice(0, 900));
});

await step('chat-from-order', async () => {
  const chatBtn = dialog().getByRole('button', { name: /Чат|Написать|Вопрос|Консьерж/ }).last();
  note('  chat button: ' + (await chatBtn.textContent())?.trim());
  await chatBtn.click();
  await p.waitForTimeout(2500);
  const box = dialog().locator('textarea').last();
  note('  draft: «' + (await box.inputValue()) + '»');
  await check('chat');
  await box.fill((await box.inputValue()) + ' Можно забрать завтра вечером?');
  await box.press('Enter');
  await p.waitForTimeout(3000);
  note('  messages: ' + (await dialog().innerText()).replace(/\s+/g, ' ').slice(-300));
  await shot('chat-sent');
  await p.goBack();
  await p.waitForTimeout(1200);
  note('  Back with the chat open → ' + p.url().split('#')[1] + ', dialogs ' + (await p.locator('[role=dialog]').count()));
  await shot('chat-after-back');
});

await t.finish();
