// Владелец переносит данные магазина в бесплатную базу (default): все коллекции «Скачать копию базы», в том числе фото
// товаров, фото из чата и использования промокодов (docs/firestore-free-tier-plan.md, этап 2). Идёт после остальных
// сценариев магазина: перенос читает всю базу, и параллельные записи сбили бы сверку
import { test, expect } from '../fixtures';
import { clearDatabase, FREE_DATABASE, listDocs, writeDocs } from '../emulator';
import { ADMIN, PRODUCTS } from '../store';

// The collections of BACKUP_COLLECTIONS (src/utils/firebaseSync.ts) and the catalog index with its miniatures
const COLLECTIONS = [
  'products', 'product_photos', 'product_costs', 'promos', 'settings', 'banners', 'banner_images', 'delivery_methods', 'pickup_points',
  'orders', 'users', 'customer_notes', 'admins', 'reviews', 'review_votes',
  'chat_messages', 'chat_images', 'support_threads', 'support_status', 'stock_movements', 'promo_uses', 'payment_templates',
  'catalog_index', 'product_thumbs',
];

const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
const product = PRODUCTS.linen.id;
const at = new Date('2026-10-01T09:30:00.123Z');

// A document in every collection the shop seed leaves empty: what an owner's database holds after a few weeks
const oldShopDocs = {
  [`product_photos/move-photo`]: { productId: product, data: PHOTO },
  [`product_costs/${product}`]: { costPrice: 1200 },
  'promos/move-promo': { id: 'move-promo', code: 'MOVE10', discountPercent: 10, usedCount: 1, generatedRevenue: 0 },
  'banners/move-banner': { id: 'move-banner', title: 'Осень', image: 'https://img.test/banner.jpg' },
  'banner_images/move-banner': { bannerId: 'move-banner', image: PHOTO },
  [`product_thumbs/${product}`]: { productId: product, key: 'move-thumb', data: PHOTO },
  'orders/WS-MOVE-1': { id: 'WS-MOVE-1', customerUid: 'move-buyer', totalPrice: 2990, status: 'accepted', createdAt: at.toISOString() },
  'users/move-buyer': { uid: 'move-buyer', name: 'Покупатель Переноса', email: 'move@example.com' },
  'customer_notes/move-buyer': { notes: 'Звонить после 18:00', tags: ['постоянный'] },
  'admins/move-staff': { role: 'admin' },
  [`reviews/${product}_move-buyer`]: {
    id: `${product}_move-buyer`, productId: product, uid: 'move-buyer', authorName: 'Иван', rating: 5,
    comment: 'Хорошая рубашка', date: '1 октября 2026 г.', createdAt: at.toISOString(),
  },
  [`review_votes/${product}_move-buyer_move-fan`]: { reviewId: `${product}_move-buyer`, productId: product, uid: 'move-fan' },
  'chat_messages/move-msg': {
    id: 'move-msg', threadId: 'move-buyer', sender: 'user', text: 'Есть размер L?', isInternalNote: false, sentAt: at, imageId: 'move-msg',
  },
  'chat_images/move-msg': { threadId: 'move-buyer', data: PHOTO },
  'support_threads/move-buyer': { status: 'open', priority: 'normal' },
  'support_status/move-buyer': { status: 'open' },
  'stock_movements/WS-MOVE-1_0': { id: 'WS-MOVE-1_0', orderId: 'WS-MOVE-1', productId: product, changeQuantity: -1, createdAt: at.toISOString() },
  'promo_uses/WS-MOVE-1': { promoId: 'move-promo', code: 'MOVE10' },
  'payment_templates/move-card': { id: 'move-card', title: 'Карта', details: '2200 0000 0000 0000' },
};

test('владелец переносит данные в бесплатную базу, и таблица сходится', async ({ page, phone, signIn }) => {
  test.setTimeout(60_000);
  // phone moves into an empty database; desktop runs after it and moves again on top of the copy (reviews and votes
  // already there are not written twice)
  if (phone) {
    await clearDatabase(FREE_DATABASE);
    await writeDocs(oldShopDocs);
  }

  await page.goto('/profile');
  await signIn(ADMIN);
  await page.getByRole('button', { name: /^Панель администратора/ }).click();
  const panel = page.getByRole('dialog', { name: 'Панель администратора' });
  await panel.getByRole('tab', { name: 'Магазин', exact: true }).click();
  await panel.getByRole('tab', { name: 'Витрина', exact: true }).click();
  const move = panel.getByRole('button', { name: 'Перенести данные в бесплатную базу' });
  const table = panel.getByRole('table', { name: /Сверка на/ });

  if (phone) {
    // administrators are added in Firebase Console: the table shows the row until the owner does it
    await move.click();
    await expect(panel.getByText(/Не сошлось: 1 строка таблицы/)).toBeVisible({ timeout: 20_000 });
    await expect(table.getByRole('row', { name: /Администраторы.*Firebase Console/ })).toBeVisible();
    // the owner sees which administrator to add
    await expect(panel.getByRole('listitem').filter({ hasText: /^move-staff$/ })).toBeVisible();
    await writeDocs({ 'admins/move-staff': { role: 'admin' } }, FREE_DATABASE);
  }

  await move.click();
  await expect(panel.getByText(/Таблица сошлась/)).toBeVisible({ timeout: 20_000 });
  await expect(table.getByRole('row', { name: /^Фото из чата 1 1$/ })).toBeVisible();
  await expect(table.getByRole('row', { name: /^Использования промокодов 1 1$/ })).toBeVisible();
  // without the index the catalog of the new database would be empty until the owner opens the site
  await expect(table.getByRole('row', { name: /^Индекс каталога [1-9]\d* [1-9]\d*$/ })).toBeVisible();

  // every document of every collection is in the new database as it is in the old one, dates included
  for (const name of COLLECTIONS) {
    const [before, after] = await Promise.all([listDocs(name), listDocs(name, FREE_DATABASE)]);
    expect(Object.keys(before).length, name).toBeGreaterThan(0);
    expect(after, name).toEqual(before);
  }
  expect((await listDocs('chat_messages', FREE_DATABASE))['move-msg']?.sentAt).toBe(at.toISOString());
});
