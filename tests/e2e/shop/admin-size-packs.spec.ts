// Ростовки (этап 18 плана docs/admin-wholesale-plan.md): в форме товара — упаковка одного цвета из нескольких размеров
// (проверка со всей формой на «Сохранить», штрихкод цвета упаковки выдаётся при сохранении); на складе — сколько
// упаковок собирается из остатков, и этикетка ростовки
import { test, expect, openAdminSection } from '../fixtures';
import { readDoc } from '../emulator';
import { ADMIN, PRODUCTS } from '../store';

test('ростовка: форма товара, «можно собрать» на складе и этикетка', async ({ page, phone, signIn }) => {
  // phone and desktop run at the same time on one database: each adds a pack to its own product
  const item = phone ? PRODUCTS.packTeeP : PRODUCTS.packTeeD;
  const packsOf = async () => (await readDoc(`products/${item.id}`))?.sizePacks as
    | { sizes: { size: string; qty: number }[]; price?: number; barcodes?: { color: string; code: string }[] }[]
    | undefined;

  await page.goto('/profile');
  await signIn(ADMIN);
  await page.getByRole('button', { name: /^Панель администратора/ }).click();
  const panel = page.getByRole('dialog', { name: 'Панель администратора' });
  await openAdminSection(panel, 'Товары');
  await panel.getByRole('textbox', { name: 'Поиск товаров' }).fill(item.title);
  await panel.getByRole('button', { name: 'Редактировать' }).click();
  const form = page.getByRole('dialog', { name: 'Редактирование товара' });

  // packs are in «Варианты и остатки», next to the sizes and colours they are made of
  const block = form.getByRole('button', { name: 'Варианты и остатки', exact: true });
  if ((await block.getAttribute('aria-expanded')) === 'false') await block.click();
  await form.getByRole('button', { name: 'Добавить ростовку' }).click();

  // an empty pack is not saved: the error is in the list over the buttons
  await form.getByRole('button', { name: 'Сохранить изменения' }).click();
  await expect(form.getByRole('alert')).toContainText('укажите штуки хотя бы у одного размера');
  expect(await packsOf()).toBeUndefined();

  await form.getByRole('textbox', { name: '48, шт.', exact: true }).fill('1');
  await form.getByRole('textbox', { name: '50, шт.', exact: true }).fill('2');
  await form.getByRole('textbox', { name: '52, шт.', exact: true }).fill('1');
  await form.getByRole('textbox', { name: 'Цена упаковки, ₽', exact: true }).fill('4500');
  await expect(form.getByText('4 шт. в упаковке')).toBeVisible();
  await form.getByRole('button', { name: 'Сохранить изменения' }).click();
  // closes only after the database has answered
  await expect(form).toBeHidden();

  await expect.poll(async () => (await packsOf())?.[0]?.sizes).toEqual([
    { size: '48', qty: 1 },
    { size: '50', qty: 2 },
    { size: '52', qty: 1 },
  ]);
  const [pack] = (await packsOf())!;
  expect(pack.price).toBe(4500);
  // one barcode for the pack's colour, an internal EAN-13 not used by the variations
  expect(pack.barcodes).toHaveLength(1);
  expect(pack.barcodes![0]).toMatchObject({ color: 'Синий', code: expect.stringMatching(/^2\d{12}$/) });
  const variationCodes = ((await readDoc(`products/${item.id}`))?.skus as { barcode?: string }[]).map((s) => s.barcode);
  expect(variationCodes).not.toContain(pack.barcodes![0].code);

  // «Склад и SKU»: 5 of each size → 48: 5, 50: 5 ÷ 2 = 2, 52: 5 → 2 packs
  await openAdminSection(panel, 'Склад и SKU');
  await panel.getByRole('searchbox', { name: 'Поиск по складу' }).or(panel.getByRole('textbox', { name: 'Поиск по складу' })).fill(item.title);
  const model = panel.getByRole('button', { name: new RegExp(item.title) }).and(panel.locator('[aria-expanded]'));
  if ((await model.getAttribute('aria-expanded')) === 'false') await model.click();
  const packs = panel.getByRole('group', { name: `Ростовки: ${item.title}` });
  await expect(packs).toContainText('Ростовка 48–52 (4 шт.): можно собрать — Синий 2');

  // the pack's label: its colour is ticked and printed like a variation
  await packs.getByRole('checkbox', { name: 'Этикетка ростовки: Ростовка 48–52, Синий' }).click();
  await panel.getByRole('button', { name: 'Этикетки (1)' }).click();
  const labels = page.getByRole('dialog', { name: 'Этикетки и штрихкоды' });
  await expect(labels).toBeVisible();
  await expect(labels.getByText(/нет штрихкода|штрихкод повторяется|штрихкод с ошибкой/)).toHaveCount(0);
});
