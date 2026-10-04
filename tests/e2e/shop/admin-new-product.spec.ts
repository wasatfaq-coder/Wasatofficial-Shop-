// Владелец заводит товар на телефоне: состав и страна — нажатием на чипы, без набора текста
// (быстрое заведение товара, этап 1, docs/fast-product-entry-spec.md)
import { test, expect } from '../fixtures';
import { queryDocs } from '../emulator';
import { ADMIN } from '../store';

test('новый товар: состав и страна чипами', async ({ page, phone, signIn }) => {
  // phone and desktop run at the same time: each creates its own product
  const title = `Футболка базовая ${phone ? '390' : '1280'}`;

  await page.goto('/profile');
  await signIn(ADMIN);
  await page.getByRole('button', { name: /^Панель администратора/ }).click();
  const panel = page.getByRole('dialog', { name: 'Панель администратора' });
  await panel.getByRole('tab', { name: 'Каталог', exact: true }).click();
  await panel.getByRole('tab', { name: 'Товары', exact: true }).click();
  await panel.getByRole('button', { name: 'Добавить товар' }).click();

  const form = page.getByRole('dialog', { name: 'Новый товар каталога' });
  // hidden from the shop window: the customer scenarios running alongside see the same catalog
  await form.getByRole('group', { name: 'Статус товара' }).getByRole('button', { name: 'Снят с витрины' }).click();

  // a new product opens «Состав ткани» at once
  const fibers = form.getByRole('group', { name: 'Добавить волокно' });
  await fibers.getByRole('button', { name: 'Хлопок' }).click();
  await fibers.getByRole('button', { name: 'Эластан' }).click();
  const shares = form.getByRole('spinbutton', { name: 'Доля, %' });
  await expect(shares.first()).toHaveValue('100');
  await shares.first().fill('95');
  await expect(shares.nth(1)).toHaveValue('5');

  await form.getByRole('button', { name: /^Характеристики/ }).click();
  await form.getByRole('group', { name: 'Выбрать страну' }).getByRole('button', { name: 'Турция' }).click();
  await expect(form.getByRole('textbox', { name: 'Страна производства' })).toHaveValue('Турция');

  await form.getByRole('textbox', { name: /^Название товара/ }).fill(title);
  await form.getByRole('combobox', { name: 'Категория' }).click();
  await page.getByRole('option', { name: 'Рубашка' }).click();
  await form.getByRole('spinbutton', { name: /^Цена, ₽/ }).fill('1990');
  await form.getByRole('textbox', { name: 'Ссылка на фото' }).fill('https://img.test/new-tee.jpg');
  await form.getByRole('textbox', { name: 'Ссылка на фото' }).press('Enter');
  await form.getByRole('textbox', { name: 'Название нового цвета' }).fill('Белый');
  await form.getByRole('textbox', { name: 'Название нового цвета' }).press('Enter');
  await form.getByRole('button', { name: 'M', exact: true }).click();
  await form.getByRole('button', { name: 'Создать товар' }).click();
  await expect(form).toBeHidden();

  await expect.poll(async () => (await queryDocs('products', 'title', title)).length).toBe(1);
  const [saved] = await queryDocs('products', 'title', title);
  expect(saved.fabricComposition).toEqual([
    { fiber: 'Хлопок', percentage: 95 },
    { fiber: 'Эластан', percentage: 5 },
  ]);
  expect(saved.material).toBe('95% хлопок, 5% эластан');
  expect(saved.countryOfOrigin).toBe('Турция');
});
