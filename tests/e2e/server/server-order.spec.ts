// «Проверка заказов на сервере» включена: гость оформляет заказ, а записывает его функция placeOrder (эмулятор функций) —
// цена по каталогу, склад и журнал в той же транзакции, без отметки order_rate, которую пишет только браузер
// (аудит 07.10, находка 43: placeOrder не был проверен вместе с сайтом)
import { test, expect } from '../fixtures';
import { queryDocs, readDoc, writeDocs } from '../emulator';
import { PICKUP, PRODUCTS } from '../store';

test('при серверных заказах гость оформляет заказ через функцию placeOrder', async ({ page, phone }, info) => {
  // the browser-order scenarios are over (playwright.config.ts): the whole shop takes orders through the function now
  await writeDocs({ 'settings/server': { serverOrdersEnabled: true } });
  const email = `server-${info.project.name}@example.ru`;
  // phone and desktop run at the same time: each writes off its own product
  const item = phone ? PRODUCTS.cap : PRODUCTS.gloves;

  await page.goto(`/product/${item.id}`);
  await page.getByRole('button', { name: 'В корзину', exact: true }).first().click();
  await page.goto('/cart');
  await page.getByRole('button', { name: 'Оформить заказ' }).first().click();
  await page.getByRole('textbox', { name: 'Фамилия' }).fill('Серверов');
  await page.getByRole('textbox', { name: 'Имя', exact: true }).fill('Игорь');
  await page.getByRole('textbox', { name: /^Отчество/ }).fill('Петрович');
  await page.getByRole('textbox', { name: 'Телефон' }).fill('+79995554433');
  await page.getByRole('textbox', { name: 'E-mail' }).fill(email);
  await page.getByRole('radio', { name: new RegExp(`^${PICKUP.title}`) }).check();
  await page.getByRole('radio', { name: /^Перевод по номеру телефона/ }).check();
  await page.getByRole('button', { name: /^Подтвердить заказ/ }).click();

  await expect(page.getByRole('heading', { name: /^Заказ № WS-\d+$/ })).toBeVisible();
  const [order] = await queryDocs('orders', 'customerEmail', email);
  expect(order).toMatchObject({ totalPrice: item.price, deliveryFee: 0, customerName: 'Серверов Игорь Петрович', paymentStatus: 'pending' });
  // written by the function: the browser writes the order only together with its rate mark
  expect(await readDoc(`order_rate/${order.customerUid}`)).toBeNull();
  // the stock and its journal entry — in the function's transaction, already there with the order
  expect(await readDoc(`stock_movements/${order.id}_0`)).toMatchObject({ productId: item.id, changeQuantity: -1 });
});
