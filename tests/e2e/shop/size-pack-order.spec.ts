// Упаковки (ростовки) в «Оптом» и «Разбитая упаковка» у покупателя (этап 20 плана админки + этапы 1–4 docs/broken-pack-plan.md):
// «Оптом» на странице товара продаёт полными упаковками по цене упаковки (кнопка «Ростовкой» убрана),
// а при неполной упаковке и «В розницу и оптом» доступен режим «Разбитая упаковка»
import { test, expect, rub } from '../fixtures';
import { queryDocs, readDoc } from '../emulator';
import { COURIER, PRODUCTS } from '../store';

test('покупатель берёт упаковку в «Оптом» и видит «Разбитая упаковка»: страница товара, корзина, оформление, заказ', async ({ page, phone }, info) => {
  // phone and desktop share the database: each buys its own product
  const item = phone ? PRODUCTS.packBuyP : PRODUCTS.packBuyD;
  const email = `pack-${info.project.name}@example.ru`;

  await page.goto(`/product/${item.id}`);
  // the packs come with the product's full document; «Ростовкой» is merged into «Оптом», and «Разбитая упаковка» is shown for both-channel
  const modes = page.getByRole('radiogroup', { name: 'Как покупаете' });
  await expect(modes.getByRole('radio', { name: /^Ростовкой/ })).toHaveCount(0);
  await expect(modes.getByRole('radio', { name: /^Разбитая упаковка/ })).toBeVisible();
  await expect(modes.getByRole('radio', { name: /^Оптом/ })).toBeVisible();
  await modes.getByRole('radio', { name: /^Оптом/ }).click();

  // the size buttons are replaced by the packs of the colour (blue: both)
  await expect(page.getByRole('radiogroup', { name: 'Размер' })).toHaveCount(0);
  const packs = page.getByRole('radiogroup', { name: 'Упаковка' });
  await expect(packs.getByRole('radio')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Заказать в 1 клик' })).toHaveCount(0);

  // «Ростовка 48–52»: 4 шт., 4 000 ₽ — 1 000 ₽ a piece, 2 packs fit the stock (50-е: 5 ÷ 2)
  await packs.getByRole('radio', { name: /^Ростовка 48–52/ }).click();
  await expect(packs.getByRole('radio', { name: /^Ростовка 48–52/ })).toBeChecked();
  await expect(page.getByText('48 ×1 · 50 ×2 · 52 ×1').first()).toBeVisible();
  await expect(page.getByText(rub(4000)).first()).toBeVisible();
  await expect(page.getByText('4 шт. × 1 000 ₽/шт.').first()).toBeVisible();
  await expect(page.getByText('Доступно упаковок: 2')).toBeVisible();

  // «Ростовка 50–52»: 3 501 ₽ ÷ 4 does not split into roubles — «≈»; one pack fits (52: 5 ÷ 3)
  await packs.getByRole('radio', { name: /^Ростовка 50–52/ }).click();
  await expect(page.getByText('4 шт. × ≈ 875 ₽/шт.').first()).toBeVisible();
  await expect(page.getByText('Доступно упаковок: 1')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Увеличить число упаковок' })).toBeDisabled();

  // two packs of the first one into the cart
  await packs.getByRole('radio', { name: /^Ростовка 48–52/ }).click();
  await page.getByRole('button', { name: 'Увеличить число упаковок' }).click();
  await expect(page.getByText('2 уп.', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'В корзину', exact: true }).first().click();
  await expect(page.getByRole('status').filter({ hasText: 'Ростовка в корзине' })).toBeVisible();

  // the cart already holds all of this pack: the button is off and the line says why
  await expect(page.getByText('Доступно упаковок: 0')).toBeVisible();
  await expect(page.getByText('Весь остаток этой упаковки уже в вашей корзине')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Нет в наличии' })).toBeDisabled();

  // red: no size 52, the pack cannot be taken, the missing size is named
  await page.getByRole('button', { name: 'Цвет: Красный' }).click();
  await expect(packs.getByRole('radio')).toHaveCount(1);
  await expect(page.getByText('Нет размера 52: целая упаковка недоступна')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Нет в наличии' })).toBeDisabled();

  // the cart: one row, no size to change
  await page.getByRole('button', { name: 'Корзина' }).first().click();
  const packName = `${item.title}, Ростовка 48–52`;
  await expect(page.getByText('48 ×1 · 50 ×2 · 52 ×1').first()).toBeVisible();
  await expect(page.getByText('× 2 уп. = 8 шт.').first()).toBeVisible();
  await expect(page.getByText(rub(8000)).first()).toBeVisible();
  await expect(page.getByRole('button', { name: `Удалить товар: ${packName}` })).toBeVisible();
  await expect(page.getByRole('button', { name: new RegExp(`^Цвет и размер:.*${item.title}`) })).toHaveCount(0);
  // the whole stock of the pack is in the cart: no more packs
  await expect(page.getByRole('button', { name: `Увеличить количество: ${packName}` })).toBeDisabled();

  await page.getByRole('button', { name: 'Оформить заказ' }).first().click();
  await expect(page.getByText('2 уп. = 8 шт.').first()).toBeVisible();
  await page.getByRole('textbox', { name: 'Фамилия' }).fill('Ростовкин');
  await page.getByRole('textbox', { name: 'Имя', exact: true }).fill('Роман');
  await page.getByRole('textbox', { name: /^Отчество/ }).fill('Романович');
  await page.getByRole('textbox', { name: 'Телефон' }).fill('+79991234511');
  await page.getByRole('textbox', { name: 'E-mail' }).fill(email);
  await page.getByRole('radio', { name: new RegExp(`^${COURIER.title}`) }).check();
  await page.getByRole('button', { name: 'Редактировать адрес' }).click();
  const address = page.getByRole('dialog', { name: 'Редактировать адрес' });
  await address.getByRole('textbox', { name: 'Город', exact: true }).fill('Москва');
  await address.getByRole('textbox', { name: 'Улица' }).fill('Тверская');
  await address.getByRole('textbox', { name: 'Номер дома' }).fill('7');
  await address.getByRole('textbox', { name: 'Подъезд' }).fill('2');
  await address.getByRole('textbox', { name: 'Квартира / Офис' }).fill('12');
  await address.getByRole('textbox', { name: 'Код домофона' }).fill('12');
  await address.getByRole('button', { name: 'Сохранить' }).click();
  await page.getByRole('radio', { name: /^Перевод по номеру телефона/ }).check();
  const confirm = page.getByRole('button', { name: /^Подтвердить заказ/ });
  await expect(confirm).toContainText(rub(8000 + COURIER.price));
  await confirm.click();
  await expect(page).toHaveURL(/\/order-success$/);

  // the order keeps the pack as lines of its sizes, the stock goes down by them (5 − 2 × [1, 2, 1])
  const [order] = await queryDocs('orders', 'customerEmail', email);
  expect(order).toMatchObject({ totalPrice: 8000 + COURIER.price });
  const lines = order.items as Record<string, unknown>[];
  expect(lines.map((line) => line.selectedSize)).toEqual(['48', '50', '52']);
  expect(lines.map((line) => line.quantity)).toEqual([2, 4, 2]);
  expect(lines.every((line) => line.priceKind === 'pack' && line.packId === 'pack-a' && line.selectedColor === 'Синий')).toBe(true);
  await expect
    .poll(async () => {
      const skus = (await readDoc(`products/${item.id}`))?.skus as { color: string; size: string; stock: number }[];
      return ['48', '50', '52'].map((size) => skus.find((sku) => sku.color === 'Синий' && sku.size === size)?.stock);
    })
    .toEqual([3, 1, 3]);
});
