// Новое меню админки (этап 2 плана docs/admin-wholesale-plan.md, вариант А): панель открывается на «Сегодня», строка
// ведёт в свой раздел; на телефоне редкие разделы — в «Ещё» списком с пояснениями
import { test, expect, openAdminSection } from '../fixtures';
import { ADMIN } from '../store';

test('«Сегодня» показывает, что ждёт, и ведёт в раздел; «Ещё» — остальные разделы', async ({ page, phone, signIn }) => {
  await page.goto('/profile');
  await signIn(ADMIN);
  await page.getByRole('button', { name: /^Панель администратора/ }).click();
  const panel = page.getByRole('dialog', { name: 'Панель администратора' });
  const nav = panel.getByRole('navigation', { name: 'Разделы панели' });

  await expect(panel.getByRole('heading', { name: 'Сегодня', exact: true })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Сегодня', exact: true })).toHaveAttribute('aria-current', 'page');
  const waiting = panel.getByRole('region', { name: 'Что ждёт' });
  await expect(waiting.getByRole('button', { name: /^Новые заказы/ })).toBeVisible();
  await expect(waiting.getByRole('button', { name: /^Ждут ответа в чате/ })).toBeVisible();
  await expect(panel.getByRole('heading', { name: /^Выручка за 7 дней/ })).toBeVisible();

  // a line opens its section
  await waiting.getByRole('button', { name: /^Заканчивается на складе/ }).click();
  await expect(panel.getByRole('button', { name: 'Оформить операцию', exact: true })).toBeVisible();
  if (phone) {
    // a section from «Ещё»: «Ещё» is lit on the bottom bar, «Все разделы» goes back to the list
    await expect(nav.getByRole('button', { name: 'Ещё', exact: true })).toHaveAttribute('aria-current', 'page');
    await panel.getByRole('button', { name: 'Все разделы' }).click();
    const all = panel.getByRole('navigation', { name: 'Все разделы' });
    await expect(all.getByRole('button', { name: /^Витрина/ })).toContainText('приём заказов');
  } else {
    await expect(nav.getByRole('button', { name: 'Склад и SKU', exact: true })).toHaveAttribute('aria-current', 'page');
  }

  await openAdminSection(panel, 'Витрина');
  await expect(panel.getByRole('heading', { name: /Управление витриной/ })).toBeVisible();
  await openAdminSection(panel, 'Сегодня');
  await expect(panel.getByRole('heading', { name: 'Сегодня', exact: true })).toBeVisible();
});
