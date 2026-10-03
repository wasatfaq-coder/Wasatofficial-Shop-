// Владелец входит в панель, меняет цену товара и скачивает этикетки (аудит UX 03.10, сценарий В)
import fs from 'node:fs';
import { test, expect, rub } from '../fixtures';
import { readDoc } from '../emulator';
import { ADMIN, PRODUCTS } from '../store';

test('владелец меняет цену и печатает этикетки', async ({ page, phone, signIn }) => {
  // phone and desktop run at the same time: each changes its own product
  const item = phone ? PRODUCTS.belt : PRODUCTS.socks;
  const newPrice = item.price + 500;

  await page.goto('/#/profile');
  await signIn(ADMIN);
  await page.getByRole('button', { name: /^Панель администратора/ }).click();
  const panel = page.getByRole('dialog', { name: 'Панель администратора' });
  await panel.getByRole('tab', { name: 'Каталог', exact: true }).click();
  await panel.getByRole('tab', { name: 'Товары', exact: true }).click();
  await panel.getByRole('textbox', { name: 'Название, артикул или штрихкод' }).fill(item.title);
  await panel.getByRole('button', { name: 'Редактировать' }).click();

  const form = page.getByRole('dialog', { name: 'Редактирование товара' });
  await expect(form.getByRole('textbox', { name: /^Название товара/ })).toHaveValue(item.title);
  await form.getByRole('spinbutton', { name: /^Цена, ₽/ }).fill(String(newPrice));
  await form.getByRole('button', { name: 'Сохранить изменения' }).click();
  // the form closes only after the database has answered
  await expect(form).toBeHidden();
  await expect.poll(async () => (await readDoc(`products/${item.id}`))?.price).toBe(newPrice);

  await panel.getByRole('tab', { name: 'Склад и SKU' }).click();
  await panel.getByRole('button', { name: `Этикетки: ${item.title}` }).click();
  const labels = page.getByRole('dialog', { name: 'Этикетки и штрихкоды' });
  const download = page.waitForEvent('download');
  await labels.getByRole('button', { name: /Скачать PDF/ }).click();
  const pdf = await download;
  expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);
  expect(fs.readFileSync((await pdf.path())!).subarray(0, 5).toString()).toBe('%PDF-');

  // a customer in another tab sees the new price
  const shop = await page.context().newPage();
  await shop.goto(`/#/product/${item.id}`);
  await expect(shop.getByRole('main').getByText(rub(newPrice)).first()).toBeVisible();
});
