// Покупатель с входом оформляет заказ в пункт выдачи, находит его в профиле и пишет о нём в чат
// (аудит UX 03.10, сценарий Б)
import { test, expect } from '../fixtures';
import { queryDocs } from '../emulator';
import { PICKUP, PRODUCTS } from '../store';

test('покупатель оформляет заказ и пишет о нём в чат', async ({ page, signIn }, info) => {
  const buyer = { sub: `buyer-${info.project.name}`, email: `olga-${info.project.name}@example.ru`, name: 'Ольга Покупатель' };
  const chinos = PRODUCTS.chinos;

  await page.goto('/profile');
  await signIn(buyer);
  await expect(page.getByRole('heading', { name: buyer.name })).toBeVisible();

  await page.goto(`/product/${chinos.id}`);
  await page.getByRole('radio', { name: /^50\b/ }).click();
  await page.getByRole('button', { name: 'В корзину', exact: true }).first().click();
  await page.goto('/cart');
  await page.getByRole('button', { name: 'Оформить заказ' }).first().click();

  // the account's e-mail is filled in from the profile
  await expect(page.getByRole('textbox', { name: 'E-mail' })).toHaveValue(buyer.email);
  await page.getByRole('textbox', { name: 'Фамилия' }).fill('Покупатель');
  await page.getByRole('textbox', { name: 'Имя', exact: true }).fill('Ольга');
  await page.getByRole('textbox', { name: /^Отчество/ }).fill('Сергеевна');
  await page.getByRole('textbox', { name: 'Телефон' }).fill('+79997654321');
  await page.getByRole('radio', { name: new RegExp(`^${PICKUP.title}`) }).check();
  await page.getByRole('radio', { name: /^Наличными или картой/ }).check();
  await page.getByRole('button', { name: /^Подтвердить заказ/ }).click();

  const number = page.getByRole('heading', { name: /^Заказ № WS-\d+$/ });
  await expect(number).toBeVisible();
  const orderId = (await number.textContent())!.replace('Заказ № ', '').trim();

  await page.getByRole('button', { name: 'Профиль' }).first().click();
  await page.getByRole('button', { name: /^Заказы и трекинг/ }).click();
  const orders = page.getByRole('dialog', { name: 'История и трекинг заказов' });
  await expect(orders.getByText(orderId)).toBeVisible();
  await orders.getByRole('button', { name: 'Написать в службу поддержки' }).click();

  // the chat opens with the order's number in the message field
  const box = page.getByRole('textbox', { name: /^Сообщение/ });
  await expect(box).toHaveValue(new RegExp(`Вопрос по заказу № ${orderId}`));
  await box.fill(`Вопрос по заказу № ${orderId}: можно забрать завтра вечером?`);
  await page.getByRole('button', { name: 'Отправить сообщение' }).click();
  await expect(page.getByRole('dialog').last().getByText('можно забрать завтра вечером?')).toBeVisible();

  await expect
    .poll(async () => (await queryDocs('chat_messages', 'text', `Вопрос по заказу № ${orderId}: можно забрать завтра вечером?`)).length)
    .toBe(1);
});
