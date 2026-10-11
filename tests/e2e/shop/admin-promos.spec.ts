// «Промокоды» (этап 8 плана docs/admin-wholesale-plan.md, часть 2): форма и «Пачка кодов» — отдельными экранами,
// у лимита — предупреждение про вход Google, список с поиском и чипами, пачка — одной строкой
import { test, expect, openAdminSection } from '../fixtures';
import { queryDocs } from '../emulator';
import { ADMIN } from '../store';

test('владелец создаёт код с лимитом и пачку кодов, находит их в списке', async ({ page, signIn }, info) => {
  // phone and desktop run at the same time on one database: each its own codes
  const tag = info.project.name === 'phone' ? 'PH' : 'DT';
  const code = `LIMIT${tag}`;
  const prefix = `B${tag}-`;

  await page.goto('/profile');
  await signIn(ADMIN);
  await page.getByRole('button', { name: /^Панель администратора/ }).click();
  const panel = page.getByRole('dialog', { name: 'Панель администратора' });
  await openAdminSection(panel, 'Промокоды');

  // the form is a screen of its own; no limit by default — a guest can apply the code
  await panel.getByRole('button', { name: 'Новый промокод' }).click();
  await expect(panel.getByRole('heading', { name: 'Новый промокод' })).toBeVisible();
  await expect(panel.getByRole('searchbox', { name: 'Найти промокод' })).toHaveCount(0);
  const limit = panel.getByRole('spinbutton', { name: 'Лимит использований (шт)' });
  await expect(limit).toHaveValue('');
  await panel.getByRole('textbox', { name: 'Код промокода *' }).fill(code);
  await limit.fill('5');
  await expect(panel.getByText(/Код с лимитом применит только покупатель, вошедший через Google/)).toBeVisible();
  await panel.getByRole('button', { name: 'Создать промокод' }).click();
  await expect(panel.getByRole('button', { name: 'Новый промокод' })).toBeVisible();
  await expect.poll(async () => (await queryDocs('promos', 'code', code))[0]?.usageLimit).toBe(5);

  // the list: search, the card says the code needs a Google sign-in, pause from the list
  await panel.getByRole('searchbox', { name: 'Найти промокод' }).fill(code.toLowerCase());
  const card = panel.getByRole('article', { name: `Промокод ${code}` });
  await expect(card).toContainText('Только после входа Google');
  await card.getByRole('switch', { name: `Действует: ${code}` }).click();
  await expect(card.getByRole('switch', { name: `Действует: ${code}` })).toHaveAttribute('aria-checked', 'false');
  await expect.poll(async () => (await queryDocs('promos', 'code', code))[0]?.active).toBe(false);

  // «Пачка кодов»: wrong values are listed, then 3 single-use codes
  await panel.getByRole('searchbox', { name: 'Найти промокод' }).fill('');
  await panel.getByRole('button', { name: 'Пачка кодов' }).click();
  await panel.getByRole('textbox', { name: 'Префикс кодов' }).fill(prefix);
  await panel.getByRole('spinbutton', { name: 'Количество кодов' }).fill('150');
  await panel.getByRole('button', { name: 'Создать 150 кодов' }).click();
  await expect(panel.getByRole('alert')).toContainText('Количество кодов — от 1 до 100');
  await panel.getByRole('spinbutton', { name: 'Количество кодов' }).fill('3');
  await panel.getByRole('button', { name: 'Создать 3 кода' }).click();
  await expect(panel.getByRole('region', { name: 'Созданные коды' })).toContainText('Создано 3 кода');
  await expect
    .poll(async () => (await queryDocs('promos', 'batchName', `Пачка ${prefix} (3 шт.)`)).map((p) => p.usageLimit))
    .toEqual([1, 1, 1]);

  // the batch is one row under «Пачки», with the codes worth sending
  await panel.getByRole('button', { name: 'К списку' }).click();
  await panel.getByRole('radiogroup', { name: 'Какие промокоды показать' }).getByRole('radio', { name: /^Пачки/ }).click();
  const batch = panel.getByRole('article', { name: new RegExp(`^Пачка ${prefix}`) });
  await expect(batch).toContainText('3 кода · использовано 0 · можно отправить 3');
  await expect(batch.getByRole('button', { name: 'Скопировать неиспользованные (3)' })).toBeEnabled();
});
