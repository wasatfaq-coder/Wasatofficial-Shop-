// Гость находит рубашку поиском, выбирает размер и оформляет заказ с курьером (аудит UX 03.10, сценарий А)
import { test, expect, rub } from '../fixtures';
import { queryDocs, readDoc } from '../emulator';
import { COURIER, PRODUCTS } from '../store';

test('гость находит товар и оформляет заказ с курьером', async ({ page }, info) => {
  const email = `guest-${info.project.name}@example.ru`;
  const shirt = PRODUCTS.linen;

  await page.goto('/');
  await page.getByRole('textbox', { name: 'Поиск по товарам' }).first().fill('льнян');
  await page.getByRole('link', { name: shirt.title }).first().click();
  await expect(page).toHaveURL(new RegExp(`#/product/${shirt.id}$`));

  // the size is not chosen in advance: «В корзину» without it adds nothing
  await expect(page.getByRole('radio', { checked: true })).toHaveCount(0);
  await page.getByRole('radio', { name: /^M\b/ }).click();
  await page.getByRole('button', { name: 'В корзину', exact: true }).first().click();
  await expect(page.getByRole('status').filter({ hasText: 'Добавлено в корзину' })).toBeVisible();

  await page.getByRole('button', { name: 'Корзина' }).first().click();
  await expect(page.getByRole('heading', { name: shirt.title })).toBeVisible();
  await page.getByRole('button', { name: 'Оформить заказ' }).first().click();
  await expect(page.getByRole('heading', { name: 'Оформление заказа', level: 1 })).toBeVisible();

  // empty form: the order is not sent, the first field with an error gets the focus
  const confirm = page.getByRole('button', { name: /^Подтвердить заказ/ });
  await confirm.click();
  await expect(page.getByRole('textbox', { name: 'Фамилия' })).toBeFocused();
  await expect(page.getByRole('textbox', { name: 'Фамилия' })).toHaveAttribute('aria-invalid', 'true');

  await page.getByRole('textbox', { name: 'Фамилия' }).fill('Покупателев');
  await page.getByRole('textbox', { name: 'Имя', exact: true }).fill('Пётр');
  await page.getByRole('textbox', { name: /^Отчество/ }).fill('Ильич');
  await page.getByRole('textbox', { name: 'Телефон' }).fill('+79991234567');
  await page.getByRole('textbox', { name: 'E-mail' }).fill(email);
  await page.getByRole('radio', { name: new RegExp(`^${COURIER.title}`) }).check();

  await page.getByRole('button', { name: 'Редактировать адрес' }).click();
  const address = page.getByRole('dialog', { name: 'Редактировать адрес' });
  await address.getByRole('textbox', { name: 'Город' }).fill('Москва');
  await address.getByRole('textbox', { name: 'Улица' }).fill('Тверская');
  await address.getByRole('textbox', { name: 'Номер дома' }).fill('7');
  await address.getByRole('textbox', { name: 'Подъезд' }).fill('2');
  await address.getByRole('textbox', { name: 'Квартира / Офис' }).fill('12');
  await address.getByRole('textbox', { name: 'Код домофона' }).fill('12');
  await address.getByRole('button', { name: 'Сохранить' }).click();
  await expect(address).toBeHidden();

  await page.getByRole('radio', { name: /^Перевод по номеру телефона/ }).check();
  const total = shirt.price + COURIER.price;
  await expect(confirm).toContainText(rub(total));
  await confirm.click();

  await expect(page).toHaveURL(/#\/order-success$/);
  await expect(page.getByRole('heading', { name: /^Заказ № WS-\d+$/ })).toBeVisible();
  await expect(page.getByText(/Тверская, д\. 7/)).toBeVisible();

  const [order] = await queryDocs('orders', 'customerEmail', email);
  expect(order).toMatchObject({ totalPrice: total, deliveryFee: COURIER.price, customerName: 'Покупателев Пётр Ильич' });
  // the stock is written off with a journal entry, under firestore.rules
  expect(await readDoc(`stock_movements/${order.id}_0`)).toMatchObject({ productId: shirt.id, size: 'M', changeQuantity: -1 });
});
