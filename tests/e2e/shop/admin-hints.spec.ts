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

// Pointed at «?», read the opened hint, then pressed: the press keeps it open (Base UI closed a hint opened by hover
// when the press came later than 0.5 s — on main 11.10 this failed the scenario above on the slower CI browser)
test('нажатие на «?» после наведения не закрывает подсказку', async ({ page, phone, signIn }) => {
  test.skip(phone, 'наведение мышью — только на компьютере');
  await page.goto('/profile');
  await signIn(ADMIN);
  await page.getByRole('button', { name: /^Панель администратора/ }).click();
  const panel = page.getByRole('dialog', { name: 'Панель администратора' });
  await openAdminSection(panel, 'Аналитика');

  const trigger = panel.getByRole('button', { name: 'Что это: Выручка' });
  const hint = page.getByText('Деньги только за заказы с отметкой «Оплачен»', { exact: false });
  await trigger.hover();
  await expect(hint).toBeVisible();
  // a deliberate pause, not a wait for the app: the press must come later than Base UI's 0.5 s «patient click» after
  // the hover opened the hint — the case that closed it
  await page.waitForTimeout(800);
  await trigger.click();
  // pinned: the pointer leaves «?» and the hint stays (the closing animation is 150 ms — 300 ms would show it)
  await page.mouse.move(0, 0);
  await page.waitForTimeout(300);
  await expect(hint).toBeVisible();
  // the next press closes it
  await trigger.click();
  await expect(hint).toBeHidden();
});
