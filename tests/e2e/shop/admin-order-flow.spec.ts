// Владелец ведёт заказ Почтой в «Заказах»: «Скомплектован», без трек-номера «Передан в Почту России» не ставится, трек,
// «Передан», «Оплачен», затем «Отменить и вернуть на склад» с причиной — оплата становится «Возврат средств», товар
// возвращается по журналу (аудит 07.10, находка 41: смена статуса, оплата и отмена в админке не были проверены в браузере)
import { test, expect } from '../fixtures';
import { queryDocs, readDoc, writeDocs } from '../emulator';
import { ADMIN, PRODUCTS } from '../store';

test('владелец передаёт заказ в Почту с трек-номером, отмечает оплату и отменяет с возвратом', async ({ page, phone, signIn }) => {
  // phone and desktop run at the same time on one database: each its own order and product
  const orderId = phone ? 'WS-E2EFLOWP' : 'WS-E2EFLOWD';
  const item = phone ? PRODUCTS.wallet : PRODUCTS.umbrella;
  const track = phone ? '80085012345678' : '80085087654321';
  // older than 2 minutes: «Заказы» check the write-off of an order once its buyer's browser had time for it
  const createdAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  await writeDocs({
    [`orders/${orderId}`]: {
      id: orderId, createdAt, date: 'Сегодня', status: 'accepted', paymentStatus: 'pending',
      items: [{ id: 'l1', product: { id: item.id, title: item.title, price: item.price, category: item.category }, quantity: 1, selectedColor: 'Черный', selectedSize: 'Единый' }],
      deliveryMethod: 'Почта России', deliveryKind: 'carrier', trackingCompany: 'pochta', deliveryFee: 0, totalPrice: item.price,
      paymentMethod: 'Перевод по номеру телефона', deliveryAddress: 'Казань, ул. Баумана, 1', customerName: 'Покупатель Почтой',
      customerPhone: '+79990000001', customerUid: `buyer-${orderId}`,
    },
    // the write-off the buyer's browser made: the return gives back exactly this
    [`stock_movements/${orderId}_0`]: {
      id: `${orderId}_0`, createdAt, date: 'Сегодня', type: 'order', orderId, lineIndex: 0, skuIndex: 0, productId: item.id,
      productTitle: item.title, skuCode: '', color: 'Черный', size: 'Единый', changeQuantity: -1, reason: `Заказ #${orderId}`, operator: 'Покупатель',
    },
  });

  await page.goto('/profile');
  await signIn(ADMIN);
  await page.getByRole('button', { name: /^Панель администратора/ }).click();
  const panel = page.getByRole('dialog', { name: 'Панель администратора' });
  await panel.getByRole('tab', { name: 'Продажи', exact: true }).click();
  await panel.getByRole('tab', { name: /^Заказы/ }).click();
  await panel.getByRole('textbox', { name: 'Поиск заказов' }).fill(orderId);
  await expect(panel.getByText(`№ ${orderId}`)).toBeVisible();

  const chooseStatus = async (current: string, next: string) => {
    await panel.getByRole('button', { name: `Статус заказа: ${current}` }).click();
    await page.getByRole('menuitemradio', { name: next }).click();
  };

  await chooseStatus('Новый', 'Скомплектован');
  await expect.poll(async () => (await readDoc(`orders/${orderId}`))?.status).toBe('assembling');

  // without a tracking number the order is not handed to the carrier
  await chooseStatus('Скомплектован', 'Передан в Почту России');
  await expect(page.getByText(`Сначала укажите трек-номер: без него заказ № ${orderId} нельзя передать в Почту России`)).toBeVisible();
  expect((await readDoc(`orders/${orderId}`))?.status).toBe('assembling');

  // the tracking number field opens right in the card
  await panel.getByRole('textbox', { name: 'Трек-номер отправления' }).fill(track);
  await panel.getByRole('button', { name: 'Сохранить' }).click();
  await expect.poll(async () => (await readDoc(`orders/${orderId}`))?.trackingNumber).toBe(track);

  await chooseStatus('Скомплектован', 'Передан в Почту России');
  await expect.poll(async () => (await readDoc(`orders/${orderId}`))?.status).toBe('in_transit');

  // the prices match the catalog: «Оплачен» without the «Отметить оплаченным?» question
  await panel.getByRole('button', { name: 'Статус оплаты: Ожидает оплаты' }).click();
  await page.getByRole('menuitemradio', { name: 'Оплачен' }).click();
  await expect.poll(async () => (await readDoc(`orders/${orderId}`))?.paymentStatus).toBe('paid');

  await panel.getByRole('button', { name: 'Ещё' }).click();
  await page.getByRole('menuitem', { name: 'Отменить и вернуть на склад' }).click();
  const cancel = page.getByRole('dialog', { name: `Отменить заказ № ${orderId}?` });
  await cancel.getByRole('radio', { name: 'Товара нет в наличии' }).click();
  await cancel.getByRole('button', { name: 'Отменить заказ' }).click();
  await expect(cancel).toBeHidden();

  await expect
    .poll(async () => {
      const order = await readDoc(`orders/${orderId}`);
      return order && { isCancelled: order.isCancelled, cancelledBy: order.cancelledBy, paymentStatus: order.paymentStatus, stockReturned: order.stockReturned };
    })
    .toEqual({ isCancelled: true, cancelledBy: 'admin', paymentStatus: 'refunded', stockReturned: true });
  const moves = await queryDocs('stock_movements', 'orderId', orderId);
  expect(moves.map((m) => [m.id, m.changeQuantity]).sort()).toEqual([[`${orderId}_0`, -1], [`${orderId}_0_return`, 1]]);
});
