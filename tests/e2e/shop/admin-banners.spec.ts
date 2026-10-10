// «Баннеры» (этап 8 плана docs/admin-wholesale-plan.md, часть 1): готовое фото — фото товара магазина, а не сток;
// предпросмотр на телефоне и компьютере; показ по времени — по Москве; баннер появляется у покупателя на главной
import { test, expect, openAdminSection } from '../fixtures';
import { queryDocs } from '../emulator';
import { ADMIN, PRODUCTS } from '../store';
import { bannerTime } from '../../../src/utils/bannerSchedule';

test('баннер с фото товара и показом на сутки виден покупателю', async ({ page, secondPage, phone, signIn }) => {
  // phone and desktop run at the same time on one database: each its own banner
  const title = phone ? 'Лён этого лета' : 'Лён на каждый день';
  const item = PRODUCTS.linen;

  await page.goto('/profile');
  await signIn(ADMIN);
  await page.getByRole('button', { name: /^Панель администратора/ }).click();
  const panel = page.getByRole('dialog', { name: 'Панель администратора' });
  await openAdminSection(panel, 'Баннеры');
  await panel.getByRole('button', { name: 'Новый баннер' }).click();
  await panel.getByRole('textbox', { name: 'Главный заголовок *' }).fill(title);

  // no stock pictures: the store's own product photo goes to the phone and the computer
  await expect(panel.getByText(/unsplash|Готовые стильные/i)).toHaveCount(0);
  await panel.getByRole('combobox', { name: 'Товар для фото баннера' }).click();
  await page.getByRole('option', { name: item.title }).click();
  await panel.getByRole('button', { name: `Взять фото 1 из 1: ${item.title}` }).click();
  await expect(panel.getByText('Загружено')).toHaveCount(2);

  // a real preview: the computer is chosen and stays chosen
  const screens = panel.getByRole('radiogroup', { name: 'Экран предпросмотра' });
  await expect(screens.getByRole('radio', { name: 'Телефон' })).toHaveAttribute('aria-checked', 'true');
  await screens.getByRole('radio', { name: 'Компьютер' }).click();
  await expect(screens.getByRole('radio', { name: 'Компьютер' })).toHaveAttribute('aria-checked', 'true');

  // «Сутки» from this minute, by Moscow time (before: UTC, the start moved 3 hours)
  await panel.getByRole('switch', { name: 'Показ по времени' }).click();
  await panel.getByRole('button', { name: 'Сутки', exact: true }).click();
  const start = await panel.getByLabel('Начало показа (МСК)').inputValue();
  const end = await panel.getByLabel('Конец показа (МСК)').inputValue();
  expect(Math.abs((bannerTime(start) ?? 0) - Date.now())).toBeLessThan(2 * 60 * 1000);
  expect((bannerTime(end) ?? 0) - (bannerTime(start) ?? 0)).toBe(24 * 60 * 60 * 1000);

  await panel.getByRole('button', { name: 'Опубликовать баннер' }).click();
  await expect.poll(async () => (await queryDocs('banners', 'title', title)).map((b) => [b.startDate, b.endDate])).toEqual([[start, end]]);
  await expect(panel.getByText('Показывается по расписанию').first()).toBeVisible();

  // the buyer sees it on the home screen
  await secondPage.goto('/');
  await expect(secondPage.getByRole('region', { name: 'Баннеры' }).getByRole('button', { name: title })).toBeVisible();
});
