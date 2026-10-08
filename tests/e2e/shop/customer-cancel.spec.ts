// Покупатель со входом отменяет свой заказ в профиле: причина, «Отменён», товар возвращается на склад по журналу
// (аудит 07.10, находка 40: отмена была проверена только тестами правил, не кодом экрана)
import { test, expect } from '../fixtures';
import { queryDocs, readDoc } from '../emulator';
import { PICKUP, PRODUCTS } from '../store';

test('покупатель отменяет заказ, и товар возвращается на склад', async ({ page, phone, signIn }, info) => {
  // one order per 30 s from one sign-in (order_rate): each run — its own buyer
  const run = `${info.project.name}-${info.repeatEachIndex}`;
  const buyer = { sub: `cancel-${run}`, email: `pavel-${run}@example.ru`, name: 'Павел Отмена' };
  // phone and computer run at the same time: each writes off its own product
  const item = phone ? PRODUCTS.cap : PRODUCTS.gloves;

  await page.goto('/profile');
  await signIn(buyer);
  await expect(page.getByRole('heading', { name: buyer.name })).toBeVisible();

  // one size: «В корзину» right away
  await page.goto(`/product/${item.id}`);
  await page.getByRole('button', { name: 'В корзину', exact: true }).first().click();
  await page.goto('/cart');
  await page.getByRole('button', { name: 'Оформить заказ' }).first().click();
  await page.getByRole('textbox', { name: 'Фамилия' }).fill('Отмена');
  await page.getByRole('textbox', { name: 'Имя', exact: true }).fill('Павел');
  await page.getByRole('textbox', { name: /^Отчество/ }).fill('Ильич');
  await page.getByRole('textbox', { name: 'Телефон' }).fill('+79991112233');
  await page.getByRole('radio', { name: new RegExp(`^${PICKUP.title}`) }).check();
  await page.getByRole('radio', { name: /^Наличными или картой/ }).check();
  await page.getByRole('button', { name: /^Подтвердить заказ/ }).click();

  const number = page.getByRole('heading', { name: /^Заказ № WS-\d+$/ });
  await expect(number).toBeVisible();
  const orderId = (await number.textContent())!.replace('Заказ № ', '').trim();
  // the write-off of the line comes after «Заказ оформлен»
  await expect.poll(async () => (await readDoc(`stock_movements/${orderId}_0`))?.changeQuantity).toBe(-1);

  await page.getByRole('button', { name: 'Профиль' }).first().click();
  await page.getByRole('button', { name: /^Заказы и трекинг/ }).click();
  const orders = page.getByRole('dialog', { name: 'История и трекинг заказов' });
  await expect(orders.getByText(orderId)).toBeVisible();
  await orders.getByRole('button', { name: 'Детали' }).click();
  const details = page.getByRole('dialog', { name: `Заказ № ${orderId}` });
  await details.getByRole('button', { name: 'Отменить заказ' }).click();

  const cancel = page.getByRole('dialog', { name: `Отменить заказ № ${orderId}?` });
  // no reason — the window says so and stays
  await cancel.getByRole('button', { name: 'Отменить заказ' }).click();
  await expect(cancel).toBeVisible();
  await cancel.getByRole('radio', { name: 'Слишком долгая доставка' }).click();
  await cancel.getByRole('button', { name: 'Отменить заказ' }).click();
  await expect(cancel).toBeHidden();

  await expect
    .poll(async () => {
      const order = await readDoc(`orders/${orderId}`);
      return order && { isCancelled: order.isCancelled, cancelledBy: order.cancelledBy, cancelReason: order.cancelReason, stockReturned: order.stockReturned };
    })
    .toEqual({ isCancelled: true, cancelledBy: 'customer', cancelReason: 'Слишком долгая доставка', stockReturned: true });
  // exactly what the order took goes back, once
  const returns = await queryDocs('stock_movements', 'orderId', orderId);
  expect(returns.map((m) => [m.id, m.changeQuantity]).sort()).toEqual([[`${orderId}_0`, -1], [`${orderId}_0_return`, 1]]);
  // the order shows as cancelled with the reason, without «Отменить заказ»
  await expect(details.getByText('Причина: Слишком долгая доставка')).toBeVisible();
  await expect(details.getByRole('button', { name: 'Отменить заказ' })).toHaveCount(0);
});
