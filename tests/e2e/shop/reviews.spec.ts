// Отзывы (задание владельца 11.10): отзыв — только по полученному заказу с этим товаром, у отзыва «Покупка подтверждена»;
// из заказа в профиле «Оставить отзыв» / «Изменить отзыв»; владелец в «Отзывы» отклоняет отзыв с причиной — автор видит
// причину, остальные отзыв не видят — и публикует снова
import { test, expect, openAdminSection, signInOn } from '../fixtures';
import { deleteDoc, emulatorUidOf, readDoc, writeDocs } from '../emulator';
import { ADMIN, PRODUCTS } from '../store';

test('отзыв по полученному заказу: покупатель пишет, владелец отклоняет и публикует', async ({ page, secondPage, browser, baseURL, phone, signIn }, info) => {
  const run = info.project.name;
  const buyer = { sub: `review-${run}`, email: `vera-${run}@example.ru`, name: `Вера Отзыв ${run}` };
  // phone and desktop run at the same time on one database: each its own product, order and review
  const item = phone ? PRODUCTS.umbrella : PRODUCTS.wallet;
  const orderId = `WS-E2EREV${phone ? 'P' : 'D'}`;
  const comment = `Хороший товар, проверено (${run})`;
  const reason = `Отзыв не про товар (${run})`;

  await page.goto('/profile');
  await signIn(buyer);
  await expect(page.getByRole('heading', { name: buyer.name })).toBeVisible();
  await expect.poll(() => emulatorUidOf(buyer.email)).toBeTruthy();
  const uid = (await emulatorUidOf(buyer.email))!;
  const reviewId = `${item.id}_${uid}`;
  await deleteDoc(`reviews/${reviewId}`);
  await deleteDoc(`review_moderation/${reviewId}`);

  // no received order with the product yet: the form does not open and says why
  await page.goto(`/product/${item.id}`);
  await expect(page.getByText('Отзыв можно оставить после получения заказа с этим товаром').first()).toBeVisible();

  // the order is delivered
  const createdAt = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  await writeDocs({
    [`orders/${orderId}`]: {
      id: orderId, createdAt, date: 'Вчера', status: 'delivered', paymentStatus: 'paid',
      items: [{ id: 'l1', product: { id: item.id, title: item.title, price: item.price, category: item.category }, quantity: 1, selectedColor: 'Черный', selectedSize: 'Единый' }],
      deliveryMethod: 'Пункт выдачи', deliveryKind: 'pickup', deliveryFee: 0, totalPrice: item.price,
      paymentMethod: 'Наличными или картой', deliveryAddress: 'Москва', customerName: buyer.name, customerPhone: '+79990000007', customerUid: uid,
    },
  });

  // the review, written from the product page
  await page.goto(`/product/${item.id}`);
  await page.getByRole('button', { name: 'Написать отзыв' }).click();
  const form = page.getByRole('dialog', { name: 'Оставить отзыв' });
  // the only received order is chosen
  await expect(form.getByText(`№ ${orderId}`)).toBeVisible();
  await form.getByRole('textbox', { name: /^Текст отзыва/ }).fill(comment);
  await form.getByRole('button', { name: 'Опубликовать отзыв' }).click();
  await expect(form).toBeHidden();
  await expect(page.getByRole('paragraph').filter({ hasText: comment })).toBeVisible();
  await expect(page.getByText('Покупка подтверждена').first()).toBeVisible();
  await expect.poll(async () => (await readDoc(`reviews/${reviewId}`))?.orderId).toBe(orderId);

  // from the order in the profile: «Изменить отзыв» for the product already reviewed
  await page.getByRole('button', { name: 'Профиль' }).first().click();
  await page.getByRole('button', { name: /^Заказы и трекинг/ }).click();
  await page.getByRole('dialog', { name: 'История и трекинг заказов' }).getByRole('button', { name: 'Детали' }).first().click();
  const details = page.getByRole('dialog', { name: `Заказ № ${orderId}` });
  await expect(details.getByRole('button', { name: `Изменить отзыв: ${item.title}` })).toBeVisible();

  // the owner rejects it with a reason
  const owner = secondPage;
  await owner.goto('/profile');
  await signInOn(owner, ADMIN);
  await owner.getByRole('button', { name: /^Панель администратора/ }).click();
  const panel = owner.getByRole('dialog', { name: 'Панель администратора' });
  await openAdminSection(panel, 'Отзывы');
  await expect(panel.getByRole('heading', { name: 'Отзывы', exact: true })).toBeVisible();
  await panel.getByRole('radio', { name: /^Все/ }).click();
  await panel.getByRole('searchbox', { name: 'Найти отзыв' }).fill(comment);
  const card = panel.getByRole('listitem').filter({ hasText: comment });
  await expect(card).toContainText('Покупка подтверждена');
  await card.getByRole('button', { name: /^Отклонить отзыв/ }).click();
  const reject = owner.getByRole('dialog', { name: 'Отклонить отзыв?' });
  await reject.getByRole('textbox', { name: /^Причина/ }).fill(reason);
  await reject.getByRole('button', { name: 'Отклонить', exact: true }).click();
  await expect.poll(async () => (await readDoc(`review_moderation/${reviewId}`))?.status).toBe('rejected');
  await expect(card).toContainText('Отклонён');
  // the owner's session hides it from customers' reads (owner's decision 12.10)
  await expect.poll(async () => (await readDoc(`reviews/${reviewId}`))?.hidden).toBe(true);

  // the author sees the reason, nobody else sees the review
  await page.goto(`/product/${item.id}`);
  await expect(page.getByText(`Отзыв отклонён: ${reason}`)).toBeVisible();
  const guest = await browser.newContext({ baseURL, viewport: page.viewportSize() ?? undefined });
  const guestPage = await guest.newPage();
  await guest.route((url) => url.hostname !== '127.0.0.1' && url.hostname !== 'localhost', (route) => route.abort());
  await guestPage.goto(`/product/${item.id}`);
  await expect(guestPage.getByRole('heading', { name: /^Отзывы покупателей/ })).toBeVisible();
  await expect(guestPage.getByRole('paragraph').filter({ hasText: comment })).toHaveCount(0);
  await guest.close();

  // published again
  await card.getByRole('button', { name: /^Опубликовать отзыв/ }).click();
  await expect.poll(async () => (await readDoc(`review_moderation/${reviewId}`))?.status).toBe('published');
  await expect.poll(async () => (await readDoc(`reviews/${reviewId}`))?.hidden).toBe(false);
  await expect(page.getByText(`Отзыв отклонён: ${reason}`)).toBeHidden();
  await expect(page.getByRole('paragraph').filter({ hasText: comment })).toBeVisible();

  // rejected once more in the same session: the mark follows again (review 12.10 — a value written before is not skipped)
  await card.getByRole('button', { name: /^Отклонить отзыв/ }).click();
  await owner.getByRole('dialog', { name: 'Отклонить отзыв?' }).getByRole('textbox', { name: /^Причина/ }).fill(reason);
  await owner.getByRole('dialog', { name: 'Отклонить отзыв?' }).getByRole('button', { name: 'Отклонить', exact: true }).click();
  await expect.poll(async () => (await readDoc(`reviews/${reviewId}`))?.hidden).toBe(true);
});
