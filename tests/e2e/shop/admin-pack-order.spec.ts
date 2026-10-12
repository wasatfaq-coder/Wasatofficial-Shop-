// Ростовка в заказе (этап 19 плана docs/admin-wholesale-plan.md): заказ хранит упаковку строками по размерам
// (`expandPackLines`), а «Заказы» показывают её одной строкой — название, число упаковок, состав и сумма; «Правка состава»
// меняет только целые упаковки
import { test, expect, openAdminSection, rub } from '../fixtures';
import { readDoc, writeDocs } from '../emulator';
import { ADMIN, PRODUCTS } from '../store';
import { expandPackLines } from '../../../src/shared/packLines';
import type { CartItem } from '../../../src/types';

test('ростовка в заказе: одна строка в «Заказах» и целые упаковки в «Правке состава»', async ({ page, phone, signIn }) => {
  // phone and desktop run at the same time on one database: each its own order and product
  const orderId = phone ? 'WS-E2EPACKORDP' : 'WS-E2EPACKORDD';
  const product = phone ? PRODUCTS.packTeeP : PRODUCTS.packTeeD;
  const packLine = {
    id: `pack-${orderId}`,
    product: { id: product.id, title: product.title, price: product.price, category: product.category },
    quantity: 2,
    selectedColor: 'Синий',
    selectedSize: '',
    priceKind: 'pack',
    packId: 'pack-1',
    packTitle: 'Ростовка 48–52',
    packPrice: 10002,
    packSizes: [
      { size: '48', qty: 1 },
      { size: '50', qty: 2 },
      { size: '52', qty: 1 },
    ],
  } as unknown as CartItem;
  const items = expandPackLines([packLine]);
  expect(items.length).toBeGreaterThan(1); // a size the price boundary falls inside is two lines
  await writeDocs({
    [`orders/${orderId}`]: {
      id: orderId, createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(), date: 'Сегодня', status: 'new',
      paymentStatus: 'unpaid',
      items,
      deliveryMethod: 'Курьером до двери', deliveryKind: 'courier', deliveryFee: 0,
      totalPrice: 20004, paymentMethod: 'Перевод по номеру телефона',
      deliveryAddress: 'Москва, ул. Тверская, 1', customerName: 'Покупатель Ростовки', customerPhone: '+79990000003',
      customerUid: `buyer-${orderId}`,
    },
  });

  await page.goto('/profile');
  await signIn(ADMIN);
  await page.getByRole('button', { name: /^Панель администратора/ }).click();
  const panel = page.getByRole('dialog', { name: 'Панель администратора' });
  await openAdminSection(panel, /^Заказы/);
  await panel.getByRole('textbox', { name: 'Поиск заказов' }).fill(orderId);
  const more = panel.getByRole('button', { name: `Подробнее: заказ № ${orderId}` });
  await expect(more).toBeVisible();
  await more.click();

  // the lines of the order are one row: title, packs, composition, price of a pack and the sum
  // the search leaves only this order in the list
  const card = panel;
  await expect(card.getByText(product.title, { exact: true })).toHaveCount(1);
  await expect(card.getByText(/Синий, Ростовка 48–52 · 2 уп\./)).toBeVisible();
  await expect(card.getByText('48 ×1 · 50 ×2 · 52 ×1', { exact: true })).toBeVisible();
  await expect(card.getByText(new RegExp(`${rub(10002).source}/уп\\.`))).toBeVisible();
  await expect(card.getByText(rub(20004)).first()).toBeVisible();

  // «Правка состава»: the pack is one row and is changed by whole packs
  await panel.getByRole('button', { name: `Ещё: заказ № ${orderId}` }).click();
  await page.getByRole('menuitem', { name: 'Правка состава и склад' }).click();
  const modal = page.getByRole('dialog', { name: 'Корректировка состава заказа' });
  await expect(modal.getByText('48 ×1 · 50 ×2 · 52 ×1 · только целой упаковкой')).toBeVisible();
  await expect(modal.getByText('2 уп.', { exact: true })).toBeVisible();
  await modal.getByRole('button', { name: /^Увеличить число упаковок:/ }).click();
  await expect(modal.getByText('3 уп.', { exact: true })).toBeVisible();

  // leave without saving: the window asks, and the order in the database stays as it was
  await modal.getByRole('button', { name: 'Отмена' }).click();
  await page.getByRole('alertdialog', { name: 'Закрыть без сохранения?' }).getByRole('button', { name: 'Не сохранять' }).click();
  await expect(modal).toBeHidden();
  const saved = await readDoc(`orders/${orderId}`);
  expect(saved?.totalPrice).toBe(20004);
  expect((saved?.items as unknown[]).length).toBe(items.length);
});
