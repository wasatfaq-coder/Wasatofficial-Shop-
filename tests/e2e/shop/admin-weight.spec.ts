// Вес и габариты товара (этап 15 плана docs/admin-wholesale-plan.md): блок формы «Вес и габариты» проверяется при
// «Сохранить» (одни длина без ширины и высоты — ошибка), вес и габариты попадают в товар, закрытый блок показывает
// сводку; вес заказа — «Вес товаров» в карточке заказа под «Подробнее»
import { test, expect, openAdminSection } from '../fixtures';
import { readDoc, writeDocs } from '../emulator';
import { ADMIN, PRODUCTS } from '../store';

test('вес и габариты в форме товара: ошибка, сохранение в базу и сводка блока', async ({ page, phone, signIn }) => {
  // phone and desktop run at the same time on one database: each changes its own product
  const item = phone ? PRODUCTS.parka : PRODUCTS.anorak;

  await page.goto('/profile');
  await signIn(ADMIN);
  await page.getByRole('button', { name: /^Панель администратора/ }).click();
  const panel = page.getByRole('dialog', { name: 'Панель администратора' });
  await openAdminSection(panel, 'Товары');
  await panel.getByRole('textbox', { name: 'Поиск товаров' }).fill(item.title);
  await panel.getByRole('button', { name: 'Редактировать' }).click();
  const form = page.getByRole('dialog', { name: 'Редактирование товара' });

  // an edited product opens on the name and the prices: the weight block is closed and says it is empty
  const block = form.getByRole('button', { name: 'Вес и габариты', exact: true });
  await expect(block).toHaveAttribute('aria-expanded', 'false');
  await expect(form.getByText('Не заполнено')).toBeVisible();
  await block.click();

  // only the length: the package needs all three sides, nothing is saved
  await form.getByRole('textbox', { name: 'Длина, см', exact: true }).fill('30');
  await form.getByRole('button', { name: 'Сохранить изменения' }).click();
  await expect(form.getByRole('alert')).toContainText('все три');
  expect((await readDoc(`products/${item.id}`))?.packageCm).toBeUndefined();

  await form.getByRole('textbox', { name: 'Вес одной штуки, г', exact: true }).fill('350');
  await form.getByRole('textbox', { name: 'Ширина, см', exact: true }).fill('20');
  await form.getByRole('textbox', { name: 'Высота, см', exact: true }).fill('5');
  await expect(form.getByText('350 г · 30 × 20 × 5 см')).toBeVisible();
  await form.getByRole('button', { name: 'Сохранить изменения' }).click();
  // closes only after the database has answered
  await expect(form).toBeHidden();
  await expect.poll(async () => (await readDoc(`products/${item.id}`))?.weightGrams).toBe(350);
  expect((await readDoc(`products/${item.id}`))?.packageCm).toEqual({ l: 30, w: 20, h: 5 });

  // opened again: the closed block shows what is kept
  await panel.getByRole('button', { name: 'Редактировать' }).click();
  const again = page.getByRole('dialog', { name: 'Редактирование товара' });
  await expect(again.getByRole('button', { name: 'Вес и габариты', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(again.getByText('350 г · 30 × 20 × 5 см')).toBeVisible();
});

test('вес заказа в карточке «Заказов»: «Вес товаров»', async ({ page, phone, signIn }) => {
  const orderId = phone ? 'WS-E2EWEIGHTP' : 'WS-E2EWEIGHTD';
  const item = phone ? PRODUCTS.parka : PRODUCTS.anorak;
  // older than 2 minutes: «Заказы» check the write-off of an order once its buyer's browser had time for it
  const createdAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  await writeDocs({
    [`orders/${orderId}`]: {
      id: orderId, createdAt, date: 'Сегодня', status: 'accepted', paymentStatus: 'pending',
      // the line keeps the weight of one item as it was ordered: 2 × 350 g
      items: [{ id: 'l1', product: { id: item.id, title: item.title, price: item.price, category: item.category, weightGrams: 350 }, quantity: 2, selectedColor: item.skus[0].color, selectedSize: item.skus[0].size }],
      deliveryMethod: 'Почта России', deliveryKind: 'carrier', deliveryFee: 0, totalPrice: item.price * 2,
      paymentMethod: 'Перевод по номеру телефона', deliveryAddress: 'Тверь, ул. Советская, 7', customerName: `Покупатель с весом ${phone ? '390' : '1280'}`,
      customerPhone: '+79990000003', customerUid: `buyer-${orderId}`,
    },
  });

  await page.goto('/profile');
  await signIn(ADMIN);
  await page.getByRole('button', { name: /^Панель администратора/ }).click();
  const panel = page.getByRole('dialog', { name: 'Панель администратора' });
  await openAdminSection(panel, /^Заказы/);
  await panel.getByRole('textbox', { name: 'Поиск заказов' }).fill(orderId);
  await expect(panel.getByText(`№ ${orderId}`)).toBeVisible();

  // the weight is under «Подробнее», not on the short card
  await expect(panel.getByText('Вес товаров')).toHaveCount(0);
  await panel.getByRole('button', { name: `Подробнее: заказ № ${orderId}` }).click();
  await expect(panel.getByText('Вес товаров: 700 г')).toBeVisible();
});
