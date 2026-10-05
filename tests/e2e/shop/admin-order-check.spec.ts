// Владелец видит в «Заказах» поддельный заказ и заказ, которому не хватило товара (проверка перед запуском 04.10,
// docs/audit-2026-10-04-plan.md, находки 2 и 3)
import { test, expect } from '../fixtures';
import { writeDocs } from '../emulator';
import { ADMIN, COURIER, PRODUCTS } from '../store';

test('владелец видит подделанную скидку и недостачу последнего товара', async ({ page, phone, signIn }) => {
  // phone and desktop run at the same time on one database: each its own orders
  const tag = phone ? 'P' : 'D';
  const fakeId = `WS-E2EFAKE${tag}`;
  const shortId = `WS-E2ESHORT${tag}`;
  const item = PRODUCTS.linen;
  // older than 2 minutes: «Заказы» check the write-off of an order once its buyer's browser had time for it
  const createdAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const line = { id: 'l1', product: { id: item.id, title: item.title, price: item.price, category: item.category }, quantity: 1, selectedColor: 'Бежевый', selectedSize: 'M' };
  const order = (id: string, extra: Record<string, unknown>) => ({
    id, createdAt, date: 'Сегодня', status: 'accepted', paymentStatus: 'pending', items: [line], deliveryMethod: COURIER.title,
    deliveryFee: COURIER.price, totalPrice: item.price + COURIER.price, paymentMethod: 'Перевод по номеру телефона',
    deliveryAddress: 'Москва', customerName: `Покупатель ${id}`, customerPhone: '+79990000000', customerUid: `buyer-${id}`, ...extra,
  });
  await writeDocs({
    'promos/e2e-sale': { id: 'e2e-sale', code: 'E2E10', title: '', description: '', active: true, discountType: 'percent', discountValue: 10, discountPercent: 10, usedCount: 0 },
    // made up: 1 ₽ by a code the shop does not have, no delivery fee, «при получении» the shop does not take
    [`orders/${fakeId}`]: order(fakeId, {
      totalPrice: 1, discountAmount: item.price - 1, promoCode: 'NOPE', deliveryFee: 0,
      paymentMethod: 'Наличные курьеру (при получении)', paymentStatus: 'paid_on_delivery',
    }),
    // the second buyer of the last piece: the write-off took nothing
    [`orders/${shortId}`]: order(shortId, {}),
    [`stock_movements/${shortId}_0`]: {
      id: `${shortId}_0`, createdAt, date: 'Сегодня', type: 'order', orderId: shortId, lineIndex: 0, skuIndex: 1, productId: item.id,
      productTitle: item.title, skuCode: '', color: 'Бежевый', size: 'M', changeQuantity: 0, reason: `Заказ #${shortId}`, operator: 'Покупатель',
    },
  });

  await page.goto('/profile');
  await signIn(ADMIN);
  await page.getByRole('button', { name: /^Панель администратора/ }).click();
  const panel = page.getByRole('dialog', { name: 'Панель администратора' });
  await panel.getByRole('tab', { name: 'Продажи', exact: true }).click();
  await panel.getByRole('tab', { name: /^Заказы/ }).click();
  const search = panel.getByRole('textbox', { name: 'Поиск заказов' });

  await search.fill(fakeId);
  const fake = panel.getByRole('note').filter({ hasText: 'Цены не совпадают с каталогом' });
  await expect(fake).toContainText('промокода NOPE нет в «Промокодах»');
  await expect(fake).toContainText(`доставка 0 ₽, а «${COURIER.title}» стоит 350 ₽`);
  await expect(fake).toContainText('способа оплаты «Наличные курьеру (при получении)» нет в «Оплате»');

  await search.fill(shortId);
  await expect(panel.getByRole('note').filter({ hasText: 'Не хватило на складе' })).toContainText(
    `«${item.title}» (Бежевый, M) — списано 0 из 1`
  );
  await page.screenshot({ path: `test-results/admin-order-check-${phone ? 390 : 1280}.png`, fullPage: false });
});
