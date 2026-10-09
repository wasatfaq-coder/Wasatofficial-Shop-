// Ошибка на экране покупателя попадает владельцу в «Аналитика» → «Ошибки на сайте» без почты покупателя
// (docs/ops-plan.md, этап 2)
import { test, expect, openAdminSection } from '../fixtures';
import { queryDocs } from '../emulator';
import { ADMIN } from '../store';

test('владелец видит ошибку покупателя в «Ошибках на сайте»', async ({ page, phone, signIn }) => {
  // phone and desktop run at the same time on one database: each its own error
  const tag = `e2e-${phone ? 'phone' : 'desktop'}`;
  const failure = `Order was not saved: ${tag} для buyer@example.com`;

  // A customer without sign-in: the site logs a failed operation
  await page.goto('/catalog');
  await page.evaluate((text) => console.error(text, new Error('Missing or insufficient permissions.')), failure);
  // the report is in the database before the page changes, and without the e-mail
  await expect
    .poll(
      async () => (await queryDocs('client_errors', 'page', '/catalog')).map((r) => String(r.message)).find((m) => m.includes(tag)),
      // the write waits for the page's connection to the database, which is slow when the whole suite runs at once
      { timeout: 20_000 }
    )
    .toBe(`Order was not saved: ${tag} для [почта] Missing or insufficient permissions.`);

  await page.goto('/profile');
  await signIn(ADMIN);
  await page.getByRole('button', { name: /^Панель администратора/ }).click();
  const panel = page.getByRole('dialog', { name: 'Панель администратора' });
  await openAdminSection(panel, 'Аналитика');

  const card = panel.getByRole('region', { name: 'Ошибки на сайте' });
  const report = card.getByRole('listitem').filter({ hasText: tag });
  await expect(report).toBeVisible();
  // the customer's e-mail is cut out before the report leaves the browser
  await expect(report).toContainText('для [почта]');
  await expect(report).toContainText('Missing or insufficient permissions.');
  await expect(report).toContainText('/catalog');
  await expect(card).not.toContainText('buyer@example.com');
});

// Сайт опубликовали заново, пока вкладка была открыта: кода экрана по старому адресу уже нет. Вместо белого экрана —
// «Сайт обновился» и «Обновить страницу», после обновления корзина на месте
test('экран, которого нет после публикации, не роняет сайт', async ({ page }) => {
  await page.route(/\/assets\/ProfileScreen-[^/]*\.js$/, (route) => route.abort());
  await page.goto('/catalog');
  await page.getByRole('button', { name: 'Профиль' }).first().click();

  const alert = page.getByRole('alert').filter({ hasText: 'Сайт обновился' });
  await expect(alert).toBeVisible();
  await expect(alert).toContainText('корзина и избранное сохранятся');
  await page.unroute(/\/assets\/ProfileScreen-[^/]*\.js$/);
  await alert.getByRole('button', { name: 'Обновить страницу' }).click();
  await expect(page.getByRole('heading', { name: 'Сайт обновился' })).toBeHidden();
});
