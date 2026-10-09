// Подсказки «для чего это» в админке (этап 3 плана docs/admin-wholesale-plan.md): «?» открывает текст, Escape закрывает
// только подсказку, а не панель
import { test, expect, openAdminSection } from '../fixtures';
import { ADMIN } from '../store';

test('подсказка «для чего это» открывается и закрывается, панель остаётся', async ({ page, signIn }) => {
  await page.goto('/profile');
  await signIn(ADMIN);
  await page.getByRole('button', { name: /^Панель администратора/ }).click();
  const panel = page.getByRole('dialog', { name: 'Панель администратора' });
  await openAdminSection(panel, 'Аналитика');

  await panel.getByRole('button', { name: 'Что это: Выручка' }).click();
  const hint = page.getByText('Деньги только за заказы с отметкой «Оплачен»', { exact: false });
  await expect(hint).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(hint).toBeHidden();
  await expect(panel).toBeVisible();
});
