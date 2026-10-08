// Гость вводит промокод в корзине и оформляет заказ: скидка в заказе, а у кода — одно использование и отметка
// promo_uses/{заказ}, записанные сайтом под входом гостя (аудит 07.10, находка 47: раньше счётчик проверялся копией записи)
import { test, expect, chooseSize, rub } from '../fixtures';
import { queryDocs, readDoc, writeDocs } from '../emulator';
import { COURIER, PRODUCTS } from '../store';

test('гость с промокодом: скидка в заказе, счётчик кода +1 и отметка использования', async ({ page }, info) => {
  // phone and desktop run at the same time on one database: each its own code, so each counter is exactly 1
  const promoId = `e2e-promo-${info.project.name}`;
  const code = `E2E${info.project.name.toUpperCase()}`;
  const email = `promo-${info.project.name}@example.ru`;
  const polo = PRODUCTS.polo;
  await writeDocs({
    [`promos/${promoId}`]: {
      id: promoId, code, title: 'Проверка', description: '', active: true, isPublic: false,
      discountType: 'percent', discountValue: 10, discountPercent: 10, usedCount: 0,
    },
  });

  await page.goto(`/product/${polo.id}`);
  await chooseSize(page, /^M\b/);
  await page.getByRole('button', { name: 'В корзину', exact: true }).first().click();
  await expect(page.getByRole('status').filter({ hasText: 'Добавлено в корзину' })).toBeVisible();
  await page.getByRole('button', { name: 'Корзина' }).first().click();
  await expect(page.getByRole('heading', { name: polo.title })).toBeVisible();

  await page.getByRole('textbox', { name: 'Промокод' }).fill(code.toLowerCase());
  await page.getByRole('button', { name: 'Применить', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: `Промокод ${code} применен` })).toBeVisible();
  const discount = Math.round(polo.price * 0.1);

  await page.getByRole('button', { name: 'Оформить заказ' }).first().click();
  await expect(page.getByRole('heading', { name: 'Оформление заказа', level: 1 })).toBeVisible();
  await page.getByRole('textbox', { name: 'Фамилия' }).fill('Скидкин');
  await page.getByRole('textbox', { name: 'Имя', exact: true }).fill('Пётр');
  await page.getByRole('textbox', { name: /^Отчество/ }).fill('Ильич');
  await page.getByRole('textbox', { name: 'Телефон' }).fill('+79991234568');
  await page.getByRole('textbox', { name: 'E-mail' }).fill(email);
  await page.getByRole('radio', { name: new RegExp(`^${COURIER.title}`) }).check();

  await page.getByRole('button', { name: 'Редактировать адрес' }).click();
  const address = page.getByRole('dialog', { name: 'Редактировать адрес' });
  await address.getByRole('textbox', { name: 'Город' }).fill('Москва');
  await address.getByRole('textbox', { name: 'Улица' }).fill('Тверская');
  await address.getByRole('textbox', { name: 'Номер дома' }).fill('7');
  await address.getByRole('textbox', { name: 'Подъезд' }).fill('1');
  await address.getByRole('textbox', { name: 'Квартира / Офис' }).fill('3');
  await address.getByRole('textbox', { name: 'Код домофона' }).fill('3');
  await address.getByRole('button', { name: 'Сохранить' }).click();
  await expect(address).toBeHidden();

  await page.getByRole('radio', { name: /^Перевод по номеру телефона/ }).check();
  const total = polo.price - discount + COURIER.price;
  const confirm = page.getByRole('button', { name: /^Подтвердить заказ/ });
  await expect(confirm).toContainText(rub(total));
  await confirm.click();
  await expect(page).toHaveURL(/\/order-success$/);

  const [order] = await queryDocs('orders', 'customerEmail', email);
  expect(order).toMatchObject({ promoCode: code, discountAmount: discount, totalPrice: total, deliveryFee: COURIER.price });
  // the code's use is written after the success screen, under the guest's own sign-in (firestore.rules, isOrderPromoUse)
  await expect.poll(() => readDoc(`promos/${promoId}`)).toMatchObject({ usedCount: 1, lastOrderId: order.id });
  await expect.poll(() => readDoc(`promo_uses/${order.id}`)).toMatchObject({ orderId: order.id, promoId });
});
