// Владелец заполняет размерную сетку в форме товара (этап 14 плана docs/admin-wholesale-plan.md): замер — чипом,
// значение — по размеру; пустой замер не сохраняется, предпросмотр — как у покупателя
import { test, expect } from '../fixtures';
import { queryDocs } from '../emulator';
import { ADMIN } from '../store';

test('размерная сетка в форме нового товара', async ({ page, phone, signIn }) => {
  // phone and desktop run at the same time: each creates its own product
  const title = `Рубашка с сеткой ${phone ? '390' : '1280'}`;

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
  await form.getByRole('textbox', { name: /^Название товара/ }).fill(title);
  await form.getByRole('combobox', { name: 'Категория' }).click();
  await page.getByRole('option', { name: 'Рубашка' }).click();
  await form.getByRole('spinbutton', { name: /^Цена, ₽/ }).fill('2490');
  await form.getByRole('textbox', { name: 'Ссылка на фото' }).fill('https://img.test/chart-shirt.jpg');
  await form.getByRole('textbox', { name: 'Ссылка на фото' }).press('Enter');
  await form.getByRole('textbox', { name: 'Название нового цвета' }).fill('Белый');
  await form.getByRole('textbox', { name: 'Название нового цвета' }).press('Enter');
  await form.getByRole('button', { name: 'M', exact: true }).click();
  await form.getByRole('button', { name: 'L', exact: true }).click();

  const chart = form.getByRole('region', { name: 'Размерная сетка', exact: true });
  await chart.getByRole('button', { name: 'Длина изделия', exact: true }).click();
  await chart.getByRole('button', { name: 'Ширина плеч', exact: true }).click();
  await chart.getByRole('textbox', { name: 'Длина изделия, размер M, см' }).fill('70');
  await chart.getByRole('textbox', { name: 'Длина изделия, размер L, см' }).fill('72');
  // the preview shows only the filled measurement
  const preview = chart.getByRole('region', { name: /^Размерная сетка/ }).getByRole('table');
  await expect(preview.getByRole('columnheader')).toHaveText(['Размер', 'Длина изделия']);
  await expect(preview.getByRole('rowheader')).toHaveText(['M', 'L']);

  // a measurement with values needs a name: listed over «Создать товар», nothing is saved
  await chart.getByRole('textbox', { name: 'Название замера 1' }).fill('');
  await form.getByRole('button', { name: 'Создать товар' }).click();
  await expect(form.getByRole('alert')).toContainText('Назовите замер');
  await chart.getByRole('textbox', { name: 'Название замера 1' }).fill('Длина по спинке');
  await form.getByRole('button', { name: 'Создать товар' }).click();
  await expect(form).toBeHidden();

  await expect.poll(async () => (await queryDocs('products', 'title', title)).length).toBe(1);
  const [saved] = await queryDocs('products', 'title', title);
  expect(saved.sizeChart).toEqual({
    columns: [{ key: 'm1', label: 'Длина по спинке' }],
    rows: [
      { size: 'M', values: { m1: '70' } },
      { size: 'L', values: { m1: '72' } },
    ],
  });
});
