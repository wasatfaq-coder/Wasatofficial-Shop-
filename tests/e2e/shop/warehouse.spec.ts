// «Склад» и «Категории» (этап 9 плана docs/admin-wholesale-plan.md): приход нескольких размеров одной операцией,
// окно удаления категории говорит, сколько в ней товаров
import { test, expect, openAdminSection } from '../fixtures';
import { readDoc } from '../emulator';
import { ADMIN, PRODUCTS } from '../store';

test('приход нескольких размеров одной операцией', async ({ page, phone, signIn }) => {
  // phone and desktop run at the same time: each receives its own product
  const item = phone ? PRODUCTS.hoodie : PRODUCTS.sweater;
  const stockOf = async (size: string) =>
    ((await readDoc(`products/${item.id}`))?.skus as { size: string; stock: number }[] | undefined)?.find((s) => s.size === size)?.stock;

  await page.goto('/profile');
  await signIn(ADMIN);
  await page.getByRole('button', { name: /^Панель администратора/ }).click();
  const panel = page.getByRole('dialog', { name: 'Панель администратора' });
  await openAdminSection(panel, 'Склад и SKU');
  await panel.getByRole('button', { name: 'Оформить операцию', exact: true }).click();

  const operation = page.getByRole('dialog', { name: 'Складская операция' });
  await operation.getByRole('combobox', { name: 'Товар' }).click();
  await page.getByRole('option', { name: item.title }).click();
  await operation.getByRole('spinbutton', { name: 'Количество: Серый, S' }).fill('3');
  await operation.getByRole('spinbutton', { name: 'Количество: Серый, L' }).fill('2');
  await expect(operation.getByText('Итого: +5 шт. в 2 вариантах')).toBeVisible();
  await operation.getByRole('button', { name: 'Провести операцию' }).click();
  // the window closes only after the database has answered
  await expect(operation).toBeHidden();

  await expect.poll(() => stockOf('S')).toBe(7);
  expect(await stockOf('M')).toBe(4);
  expect(await stockOf('L')).toBe(6);
});

test('удаление категории называет число её товаров', async ({ page, signIn }) => {
  await page.goto('/profile');
  await signIn(ADMIN);
  await page.getByRole('button', { name: /^Панель администратора/ }).click();
  const panel = page.getByRole('dialog', { name: 'Панель администратора' });
  await openAdminSection(panel, 'Категории');
  await panel.getByRole('button', { name: 'Удалить: Футболки' }).click();

  const confirm = page.getByRole('alertdialog', { name: 'Удалить запись?' });
  await expect(confirm.getByText(/В категории \d+ товар.*останутся без категории/)).toBeVisible();
  // nothing is deleted: the scenarios running alongside use this category
  await confirm.getByRole('button', { name: 'Отмена' }).click();
  await expect(confirm).toBeHidden();
});
