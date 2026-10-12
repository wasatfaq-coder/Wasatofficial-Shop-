// Накладная («Заказы» → «Ещё» → «Печать чека») печатает деньги самого заказа: товары по строкам, скидку по промокоду,
// платную доставку и итог. Раньше доставка всегда была «Бесплатно», а «скидкой» считалась разница с суммой до правки
// состава (`originalTotalPrice`)
import { test, expect, openAdminSection } from '../fixtures';
import { writeDocs } from '../emulator';
import { ADMIN, PRODUCTS } from '../store';

const rub = (n: number) => `${n.toLocaleString('ru-RU')} ₽`;

test('накладная: платная доставка, скидка по промокоду и итог заказа', async ({ page, phone, signIn }) => {
  const orderId = phone ? 'WS-E2EINVOICEP' : 'WS-E2EINVOICED';
  const [first, second] = [PRODUCTS.parka, PRODUCTS.anorak];
  const subtotal = first.price + second.price;
  const total = subtotal - 500 + 350;
  const lineOf = (item: typeof first, id: string) => ({
    id,
    product: { id: item.id, title: item.title, price: item.price, category: item.category },
    quantity: 1,
    selectedColor: item.skus[0].color,
    selectedSize: item.skus[0].size,
  });
  // older than 2 minutes: «Заказы» check the write-off of an order once its buyer's browser had time for it
  const createdAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  await writeDocs({
    [`orders/${orderId}`]: {
      id: orderId, createdAt, date: 'Сегодня', status: 'accepted', paymentStatus: 'pending',
      items: [lineOf(first, 'l1'), lineOf(second, 'l2')],
      deliveryMethod: 'Почта России', deliveryKind: 'carrier', deliveryFee: 350, discountAmount: 500, promoCode: 'E2EINV',
      // the sum before «Корректировка заказа» removed a third item: not a discount
      totalPrice: total, originalTotalPrice: total + 4000,
      paymentMethod: 'Перевод по номеру телефона', deliveryAddress: 'Тверь, ул. Советская, 7',
      customerName: `Покупатель с накладной ${phone ? '390' : '1280'}`, customerPhone: '+79990000004', customerUid: `buyer-${orderId}`,
    },
  });

  await page.goto('/profile');
  await signIn(ADMIN);
  await page.getByRole('button', { name: /^Панель администратора/ }).click();
  const panel = page.getByRole('dialog', { name: 'Панель администратора' });
  await openAdminSection(panel, /^Заказы/);
  await panel.getByRole('textbox', { name: 'Поиск заказов' }).fill(orderId);
  await panel.getByRole('button', { name: `Ещё: заказ № ${orderId}` }).click();
  await page.getByRole('menuitem', { name: 'Печать чека' }).click();

  const invoice = page.getByRole('dialog', { name: 'Товарная накладная и чек' });
  // the value next to its own label: a sum elsewhere on the document cannot match
  const valueOf = (term: string) =>
    invoice.locator('dl > div').filter({ has: page.getByRole('term').filter({ hasText: term }) }).getByRole('definition');
  await expect(valueOf('Товары:')).toHaveText(rub(subtotal));
  await expect(valueOf('Скидка по промокоду E2EINV:')).toHaveText(`−${rub(500)}`);
  await expect(valueOf('Доставка:')).toHaveText(rub(350));
  await expect(valueOf('ИТОГО К ОПЛАТЕ:')).toHaveText(rub(total));
  await expect(invoice.getByText('Бесплатно')).toHaveCount(0);
  // the parts add up to the total: no warning
  await expect(invoice.getByRole('alert')).toHaveCount(0);
});
