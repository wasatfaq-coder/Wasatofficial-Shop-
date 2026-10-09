// Владелец заводит товар на телефоне: состав и страна — нажатием на чипы, уход — значками с бирки, описание —
// черновиком из характеристик (быстрое заведение товара, этапы 1–3, docs/fast-product-entry-spec.md)
import { test, expect, openAdminSection } from '../fixtures';
import { queryDocs } from '../emulator';
import { ADMIN } from '../store';

test('новый товар: состав и страна чипами, уход значками, описание из характеристик', async ({ page, phone, signIn }) => {
  // phone and desktop run at the same time: each creates its own product
  const title = `Футболка базовая ${phone ? '390' : '1280'}`;

  await page.goto('/profile');
  await signIn(ADMIN);
  await page.getByRole('button', { name: /^Панель администратора/ }).click();
  const panel = page.getByRole('dialog', { name: 'Панель администратора' });
  await openAdminSection(panel, 'Товары');
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

  await form.getByRole('button', { name: /^Уход и стирка/ }).click();
  const care = form.getByRole('group', { name: 'Значки ухода' });
  await care.getByRole('button', { name: 'Стирка при 30 °C' }).click();
  await care.getByRole('button', { name: 'Не отбеливать' }).click();
  await care.getByRole('button', { name: 'Гладить при температуре до 110 °C' }).click();
  await care.getByRole('button', { name: 'Не подвергать химчистке' }).click();
  // one wash symbol, as on a label: 40 °C replaces 30 °C
  await care.getByRole('button', { name: 'Стирка при 40 °C' }).click();
  await expect(care.getByRole('button', { name: 'Стирка при 30 °C' })).toHaveAttribute('aria-pressed', 'false');
  await expect(form.getByRole('textbox', { name: 'Правило ухода' })).toHaveCount(4);

  await form.getByRole('textbox', { name: /^Название товара/ }).fill(title);
  await form.getByRole('combobox', { name: 'Категория' }).click();
  await page.getByRole('option', { name: 'Рубашка' }).click();
  const description = form.getByRole('textbox', { name: /^Описание товара/ });
  await description.fill('Базовая футболка на каждый день.');
  await form.getByRole('button', { name: 'Черновик из характеристик', exact: true }).click();
  await expect(description).toHaveValue(
    'Базовая футболка на каждый день.\n\nСостав: 95% хлопок, 5% эластан. Страна производства — Турция.'
  );
  await expect(form.getByRole('button', { name: 'Черновик из характеристик', exact: true })).toBeDisabled();
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
  expect(saved.description).toBe('Базовая футболка на каждый день.\n\nСостав: 95% хлопок, 5% эластан. Страна производства — Турция.');
  expect((saved.careInstructions as { label: string }[]).map((c) => c.label)).toEqual([
    'Стирка при 40 °C',
    'Не отбеливать',
    'Гладить при температуре до 110 °C',
    'Не подвергать химчистке',
  ]);
});
