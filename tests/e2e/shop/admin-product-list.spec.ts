// «Товары» (этап 4 плана docs/admin-wholesale-plan.md, часть 2): цена и остаток меняются прямо из строки списка,
// действия с отмеченными товарами — на панели внизу с «Ещё», перед массовой скидкой видно, у кого цена станет ниже закупки
import { test, expect, openAdminSection } from '../fixtures';
import { queryDocs, readDoc, writeDocs } from '../emulator';
import { ADMIN, PRODUCTS } from '../store';

test('цена и остаток из строки списка, панель выбора и товары ниже закупки', async ({ page, phone, signIn }) => {
  // phone and desktop run at the same time on one database: each changes its own product
  const item = phone ? PRODUCTS.overshirt : PRODUCTS.vest;
  await writeDocs({ [`product_costs/${item.id}`]: { costPrice: 5000 } });
  const stockOf = async (size: string) =>
    ((await readDoc(`products/${item.id}`))?.skus as { size: string; stock: number }[] | undefined)?.find((s) => s.size === size)?.stock;

  await page.goto('/profile');
  await signIn(ADMIN);
  await page.getByRole('button', { name: /^Панель администратора/ }).click();
  const panel = page.getByRole('dialog', { name: 'Панель администратора' });
  await openAdminSection(panel, 'Товары');
  await panel.getByRole('textbox', { name: 'Поиск товаров' }).fill(item.title);

  // the price: a window of two fields instead of the whole form (finding 28); below the cost — a warning, not a ban (А9)
  await panel.getByRole('button', { name: new RegExp(`изменить цену «${item.title}»`) }).click();
  const priceDialog = page.getByRole('dialog', { name: 'Цена товара' });
  await expect(priceDialog).toContainText(/Закупка: 5\s?000\s?₽/);
  const price = priceDialog.getByRole('spinbutton', { name: 'Цена, ₽', exact: true });
  await price.fill('4500');
  await expect(priceDialog.getByText(/Цена ниже закупки на 500/)).toBeVisible();
  await price.fill('6290');
  await expect(priceDialog.getByText(/Цена ниже закупки/)).toHaveCount(0);
  await priceDialog.getByRole('spinbutton', { name: 'Старая цена, ₽' }).fill('6000');
  await priceDialog.getByRole('button', { name: 'Сохранить' }).click();
  await expect(priceDialog.getByRole('alert')).toHaveText(/Старая цена должна быть выше цены/);
  await priceDialog.getByRole('spinbutton', { name: 'Старая цена, ₽' }).fill('6990');
  await priceDialog.getByRole('button', { name: 'Сохранить' }).click();
  // closes only after the database has answered
  await expect(priceDialog).toBeHidden();
  await expect.poll(async () => (await readDoc(`products/${item.id}`))?.price).toBe(6290);
  expect((await readDoc(`products/${item.id}`))?.originalPrice).toBe(6990);

  // the stock of each colour × size, by the difference with what was shown when the window opened, with a journal entry
  await panel.getByRole('button', { name: new RegExp(`^Остаток: 10 шт\\. — изменить «${item.title}»`) }).click();
  const stockDialog = page.getByRole('dialog', { name: 'Остаток товара' });
  await stockDialog.getByRole('spinbutton', { name: 'Хаки, S', exact: true }).fill('8');
  // a customer buys one S while the window is open: 5 → 4, the window shows it, and the sale stays sold
  const doc = (await readDoc(`products/${item.id}`))!;
  const skus = (doc.skus as { size: string; stock: number }[]).map((s) => (s.size === 'S' ? { ...s, stock: 4 } : s));
  await writeDocs({ [`products/${item.id}`]: { ...doc, skus } });
  await expect(stockDialog.getByText('сейчас 4 шт.')).toBeVisible();
  await stockDialog.getByRole('button', { name: 'Сохранить' }).click();
  await expect(stockDialog).toBeHidden();
  // +3 to what was on the shelf: 5 → 8 typed, minus the one sold
  await expect.poll(() => stockOf('S')).toBe(7);
  expect(await stockOf('M')).toBe(5);
  const journal = await queryDocs('stock_movements', 'productId', item.id);
  expect(journal.find((m) => m.reason === 'Правка остатка из списка товаров')).toMatchObject({ size: 'S', changeQuantity: 3 });
  await expect(panel.getByRole('button', { name: new RegExp(`^Остаток: 12 шт\\.`) })).toBeVisible();

  // the selected products: «Выбрано: n», two actions and «Ещё» at the bottom (finding 27)
  await panel.getByRole('checkbox', { name: `Выбрать товар «${item.title}»` }).click();
  const bar = panel.getByRole('region', { name: 'Выбранные товары' });
  await expect(bar).toContainText('Выбрано: 1');
  await expect(bar.getByRole('button', { name: 'Снять с продажи', exact: true })).toBeVisible();
  await bar.getByRole('button', { name: 'Ещё: выбранные товары' }).click();
  await page.getByRole('menuitem', { name: 'Скидка' }).click();

  // the bulk window opens on the discount: −30 % of 6 990 ₽ is 4 890 ₽, below the cost of 5 000 ₽
  const bulk = page.getByRole('dialog', { name: 'Массовые операции каталога' });
  await bulk.getByRole('button', { name: '-30%' }).click();
  const below = bulk.getByRole('list', { name: 'Ниже закупки' });
  await expect(bulk.getByText(/Цена станет ниже закупки у 1 товара/)).toBeVisible();
  await expect(below.getByRole('listitem').filter({ hasText: item.title })).toContainText(/−110\s?₽/);
  // nothing is applied: the scenario only checks the warning
  await bulk.getByRole('button', { name: 'Отмена' }).click();
  await expect(bulk).toBeHidden();
  expect((await readDoc(`products/${item.id}`))?.price).toBe(6290);

  await bar.getByRole('button', { name: 'Снять выбор' }).click();
  await expect(bar).toBeHidden();
});
