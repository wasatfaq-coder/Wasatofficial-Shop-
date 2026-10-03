// Пустая база: покупатель видит «не настроено», а не выдуманные товары; владелец — шаги запуска магазина
// (аудит UX 03.10, сценарий Г)
import { test, expect } from '../fixtures';
import { ADMIN } from '../store';

test('покупатель видит «не настроено» вместо выдуманных данных', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('status').filter({ hasText: 'Каталог: не настроено' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Категории: не настроено' })).toBeVisible();
  await expect(page.locator('a[href^="#/product/"]')).toHaveCount(0);

  // a link to a product that is not there leads to the catalog
  await page.goto('/#/product/nope');
  await expect(page).toHaveURL(/#\/catalog$/);

  await page.goto('/#/cart');
  await expect(page.getByRole('heading', { name: 'Ваша корзина пуста' })).toBeVisible();
});

test('владелец видит, что осталось до первой продажи', async ({ page, signIn }) => {
  await page.goto('/#/profile');
  await signIn(ADMIN);
  await page.getByRole('button', { name: /^Панель администратора/ }).click();
  const panel = page.getByRole('dialog', { name: 'Панель администратора' });
  const launch = panel.getByRole('region', { name: 'Запуск магазина' });
  await expect(launch.getByText('осталось 5 шагов из 5')).toBeVisible();

  // a step opens its section
  await launch.getByRole('button', { name: /^Первый товар/ }).click();
  await expect(panel.getByRole('tab', { name: 'Товары', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(panel.getByRole('button', { name: 'Добавить товар' })).toBeVisible();
});
