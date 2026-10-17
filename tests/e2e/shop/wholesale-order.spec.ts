// Опт у покупателя (этапы 16–17 плана админки, часть 2): «Оптом» на странице товара, упаковки, скидка за объём
// в корзине, заказ с отметкой «Опт»; «Только оптом» — без розничной цены; в «Заказах» — чип «Опт / Розница»
import { test, expect, chooseSize, rub, openAdminSection } from '../fixtures';
import { queryDocs, writeDocs } from '../emulator';
import { ADMIN, COURIER, PRODUCTS } from '../store';

test('покупатель заказывает оптом: упаковки, скидка за объём, отметка «Опт»', async ({ page, phone }, info) => {
  const email = `wholesale-${info.project.name}@example.ru`;
  const tee = PRODUCTS.workTee;
  // phone and desktop share the database: each buys its own size
  const size = phone ? 'M' : 'L';

  // «Только оптом»: the card shows the wholesale price and «+» opens the product page (packs are chosen there)
  await page.goto('/catalog');
  await page.getByRole('textbox', { name: 'Поиск по товарам' }).first().fill('Майка оптовая');
  await expect(page.getByText('Только оптом, за шт.').first()).toBeVisible();
  await page.getByRole('button', { name: `Купить оптом: ${PRODUCTS.bulkTank.title}` }).first().click();
  await expect(page).toHaveURL(new RegExp(`/product/${PRODUCTS.bulkTank.id}$`));
  // a pack of 10: the price is per pack, the item price under it (owner task 11.10, item 3)
  await expect(page.getByText('/уп. оптом').first()).toBeVisible();
  await expect(page.getByText('10 шт. × 450 ₽').first()).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Как покупаете' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Заказать в 1 клик' })).toHaveCount(0);

  await page.goto(`/product/${tee.id}`);
  await page.getByRole('radio', { name: /^Оптом/ }).click();
  await expect(page.getByText('Упаковка — 5 шт. · от 2 уп.')).toBeVisible();
  await expect(page.getByText('1 080 ₽/шт. · 5 400 ₽/уп. (−10 %)')).toBeVisible();
  await chooseSize(page, new RegExp(`^${size}\\b`));
  // «Оптом» starts at the product's minimum: 2 packs
  await expect(page.getByText('2 уп.', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'В корзину', exact: true }).first().click();
  await expect(page.getByRole('status').filter({ hasText: 'Оптом в корзину' })).toBeVisible();

  await page.getByRole('button', { name: 'Корзина' }).first().click();
  await expect(page.getByText('2 уп. по 5 шт.', { exact: false }).first()).toBeVisible();
  await expect(page.getByText(rub(12000)).first()).toBeVisible();
  // one pack more reaches the step «от 3 уп.»: 1 080 ₽ instead of 1 200 ₽
  await page.getByRole('button', { name: `Увеличить количество: ${tee.title}` }).click();
  await expect(page.getByText(/скидка за объём −120 ₽\/шт\./)).toBeVisible();
  await expect(page.getByText(rub(16200)).first()).toBeVisible();

  await page.getByRole('button', { name: 'Оформить заказ' }).first().click();
  await page.getByRole('textbox', { name: 'Фамилия' }).fill('Оптовиков');
  await page.getByRole('textbox', { name: 'Имя', exact: true }).fill('Олег');
  await page.getByRole('textbox', { name: /^Отчество/ }).fill('Олегович');
  await page.getByRole('textbox', { name: 'Телефон' }).fill('+79991234500');
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
  const total = 16200 + COURIER.price;
  const confirm = page.getByRole('button', { name: /^Подтвердить заказ/ });
  await expect(confirm).toContainText(rub(total));
  await confirm.click();
  await expect(page).toHaveURL(/\/order-success$/);

  const [order] = await queryDocs('orders', 'customerEmail', email);
  expect(order).toMatchObject({ totalPrice: total });
  expect((order.items as Record<string, unknown>[])[0]).toMatchObject({
    priceKind: 'wholesale',
    unitPrice: 1080,
    quantity: 15,
    selectedSize: size,
  });

  // «Повторить заказ» brings the line back wholesale — 3 packs at 1 080 ₽, not 15 items at the retail 1 990 ₽
  await page.getByRole('button', { name: 'Профиль' }).first().click();
  await page.getByRole('button', { name: /^Заказы и трекинг/ }).click();
  const orders = page.getByRole('dialog', { name: 'История и трекинг заказов' });
  await expect(orders.getByText(order.id as string)).toBeVisible();
  await orders.getByRole('button', { name: 'Детали' }).first().click();
  const details = page.getByRole('dialog', { name: `Заказ № ${order.id}` });
  await expect(details.getByText('Опт', { exact: true })).toBeVisible();
  await details.getByRole('button', { name: 'Повторить заказ' }).click();
  await expect(page.getByRole('heading', { name: tee.title })).toBeVisible();
  await expect(page.getByText('3 уп. по 5 шт.', { exact: false }).first()).toBeVisible();
  await expect(page.getByText(rub(16200)).first()).toBeVisible();
});

test('«Заказы»: чип «Опт / Розница» и отметка «Опт» у заказа', async ({ page, phone, signIn }) => {
  const orderId = phone ? 'WS-E2EOPTP' : 'WS-E2EOPTD';
  const tee = PRODUCTS.workTee;
  await writeDocs({
    [`orders/${orderId}`]: {
      id: orderId, createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(), date: 'Сегодня', status: 'accepted',
      paymentStatus: 'pending',
      items: [{
        id: 'l0', quantity: 10, selectedColor: 'Серый', selectedSize: 'M', priceKind: 'wholesale', unitPrice: 1200,
        product: { id: tee.id, title: tee.title, price: tee.price, category: tee.category, wholesalePrice: 1200, wholesalePackSize: 5 },
      }],
      deliveryMethod: 'Курьером до двери', deliveryKind: 'courier', deliveryFee: 0, totalPrice: 12000,
      paymentMethod: 'Перевод по номеру телефона', deliveryAddress: 'Москва, ул. Тверская, 1',
      customerName: 'Оптовый Покупатель', customerPhone: '+79990000003', customerUid: `buyer-${orderId}`,
    },
  });

  await page.goto('/profile');
  await signIn(ADMIN);
  await page.getByRole('button', { name: /^Панель администратора/ }).click();
  const panel = page.getByRole('dialog', { name: 'Панель администратора' });
  await openAdminSection(panel, /^Заказы/);
  const channels = panel.getByRole('radiogroup', { name: 'Опт или розница' });
  await channels.getByRole('radio', { name: /^Опт \d/ }).click();
  await panel.getByRole('textbox', { name: 'Поиск заказов' }).fill(orderId);
  await expect(panel.getByText('Оптовый Покупатель')).toBeVisible();
  await panel.getByRole('button', { name: `Подробнее: заказ № ${orderId}` }).click();
  await expect(panel.getByText(/2 уп\. по 5 шт\. \(10 шт\.\)/)).toBeVisible();
  // «Розница» hides it
  await channels.getByRole('radio', { name: /^Розница/ }).click();
  await expect(panel.getByText('Оптовый Покупатель')).toHaveCount(0);
});

