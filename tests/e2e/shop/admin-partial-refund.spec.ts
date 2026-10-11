// Частичный возврат по выбранной модели (решение владельца 10.10): в «Правке состава» владелец убирает одну модель
// из заказа с двумя и возвращает доставку — к возврату ровно эта модель и доставка, вторая модель остаётся в заказе,
// а доставка не вычитается из дохода второй раз (`deliveryFee` заказа — 0)
import { test, expect, openAdminSection } from '../fixtures';
import { readDoc, writeDocs } from '../emulator';
import { ADMIN, PRODUCTS } from '../store';

const DELIVERY = 350;

test('частичный возврат: одна модель и доставка, вторая модель остаётся', async ({ page, phone, signIn }) => {
  // phone and desktop run at the same time on one database: each its own order and returned product
  const orderId = phone ? 'WS-E2EREFUNDP' : 'WS-E2EREFUNDD';
  const kept = PRODUCTS.chinos;
  const returned = phone ? PRODUCTS.scarf : PRODUCTS.tie;
  const lineOf = (p: typeof kept, color: string, size: string, i: number) => ({
    id: `l${i}`,
    product: { id: p.id, title: p.title, price: p.price, category: p.category },
    quantity: 1,
    selectedColor: color,
    selectedSize: size,
  });
  await writeDocs({
    [`orders/${orderId}`]: {
      id: orderId, createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(), date: 'Сегодня', status: 'delivered',
      paymentStatus: 'paid',
      items: [lineOf(kept, 'Хаки', '50', 0), lineOf(returned, returned.colors[0].name, returned.sizes[0], 1)],
      deliveryMethod: 'Курьером до двери', deliveryKind: 'courier', deliveryFee: DELIVERY,
      totalPrice: kept.price + returned.price + DELIVERY, paymentMethod: 'Перевод по номеру телефона',
      deliveryAddress: 'Москва, ул. Тверская, 1', customerName: 'Покупатель Возврата', customerPhone: '+79990000002',
      customerUid: `buyer-${orderId}`,
    },
  });

  await page.goto('/profile');
  await signIn(ADMIN);
  await page.getByRole('button', { name: /^Панель администратора/ }).click();
  const panel = page.getByRole('dialog', { name: 'Панель администратора' });
  await openAdminSection(panel, /^Заказы/);
  await panel.getByRole('textbox', { name: 'Поиск заказов' }).fill(orderId);
  await panel.getByRole('button', { name: `Ещё: заказ № ${orderId}` }).click();
  await page.getByRole('menuitem', { name: 'Правка состава и склад' }).click();

  const modal = page.getByRole('dialog', { name: 'Корректировка состава заказа' });
  await modal.getByRole('button', { name: new RegExp(`^Вернуть модель: ${returned.title}`) }).click();
  await modal.getByRole('switch', { name: `Вернуть и доставку (${DELIVERY} ₽)` }).click();
  const back = (returned.price + DELIVERY).toLocaleString('ru-RU');
  await expect(modal.getByText(`Сумма к возврату клиенту: ${back} ₽`)).toBeVisible();
  await modal.getByRole('button', { name: `Сохранить (к возврату ${back} ₽)` }).click();
  await expect(modal).toBeHidden();

  await expect
    .poll(async () => {
      const saved = await readDoc(`orders/${orderId}`);
      return saved && { total: saved.totalPrice, delivery: saved.deliveryFee, refund: saved.refundAmount, lines: (saved.items as { product: { id: string } }[]).map((it) => it.product.id) };
    })
    .toEqual({ total: kept.price, delivery: 0, refund: returned.price + DELIVERY, lines: [kept.id] });
  const saved = await readDoc(`orders/${orderId}`);
  const log = (saved?.adjustmentLogs as { changedItemsSummary: string }[])[0];
  expect(log.changedItemsSummary).toContain(`${returned.title} (${returned.sizes[0]}, ${returned.colors[0].name}) × 1`);
  expect(log.changedItemsSummary).toContain(`доставка — ${DELIVERY} ₽`);
});
