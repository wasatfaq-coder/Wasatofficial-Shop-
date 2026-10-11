// Копия товара получает свои фото, удалённый товар забирает свои (дорожная карта, направление 3, «Риски»)
import { test, expect, openAdminSection } from '../fixtures';
import { queryDocs, readDoc } from '../emulator';
import { ADMIN, PRODUCTS } from '../store';

test('копия товара со своими фото, удаление товара удаляет его фото', async ({ page, phone, signIn }) => {
  // phone and desktop run at the same time: each copies and deletes its own product
  const item = phone ? PRODUCTS.scarf : PRODUCTS.tie;
  const originalPhoto = `product_photos/${item.photoIds[0]}`;
  const copyTitle = `${item.title} (Копия)`;

  await page.goto('/profile');
  await signIn(ADMIN);
  await page.getByRole('button', { name: /^Панель администратора/ }).click();
  const panel = page.getByRole('dialog', { name: 'Панель администратора' });
  await openAdminSection(panel, 'Товары');
  const search = panel.getByRole('textbox', { name: 'Поиск товаров' });

  await search.fill(item.title);
  await panel.getByRole('button', { name: 'Дублировать товар (копировать)' }).click();
  await expect.poll(async () => (await queryDocs('products', 'title', copyTitle)).length).toBe(1);
  const [copy] = await queryDocs('products', 'title', copyTitle);
  const copyPhotoIds = copy.photoIds as string[];
  expect(copyPhotoIds).toHaveLength(1);
  expect(copyPhotoIds[0]).not.toBe(item.photoIds[0]);
  const copyPhoto = `product_photos/${copyPhotoIds[0]}`;
  expect(await readDoc(copyPhoto)).toEqual({ productId: copy.id, data: (await readDoc(originalPhoto))?.data });

  // deleting the copy deletes its photo; the original keeps its own
  await search.fill(copyTitle);
  await panel.getByRole('button', { name: 'Удалить товар' }).click();
  await page.getByRole('dialog', { name: 'Удалить товар?' }).getByRole('button', { name: 'Удалить', exact: true }).click();
  await expect.poll(() => readDoc(copyPhoto)).toBeNull();
  expect(await readDoc(`products/${copy.id}`)).toBeNull();
  expect(await readDoc(originalPhoto)).not.toBeNull();

  // and deleting the original deletes its photo too
  await search.fill(item.title);
  await panel.getByRole('button', { name: 'Удалить товар' }).click();
  await page.getByRole('dialog', { name: 'Удалить товар?' }).getByRole('button', { name: 'Удалить', exact: true }).click();
  await expect.poll(() => readDoc(originalPhoto)).toBeNull();
});
