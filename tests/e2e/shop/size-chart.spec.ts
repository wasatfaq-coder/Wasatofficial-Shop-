// Размерная сетка модели на странице товара (этап 14 плана docs/admin-wholesale-plan.md): таблица под размерами,
// выбранный размер отмечен, пустой замер не показывается, страница не прокручивается вбок — только сама таблица
import { test, expect } from '../fixtures';
import { PRODUCTS } from '../store';

test('размерная сетка под выбором размера', async ({ page, phone }) => {
  await page.goto(`/product/${PRODUCTS.polo.id}`);
  const toggle = page.getByRole('button', { name: 'Размерная сетка' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');

  const table = page.getByRole('region', { name: /^Размерная сетка/ }).getByRole('table');
  await expect(table.getByRole('columnheader')).toHaveText(['Размер', 'Длина изделия', 'Ширина по груди', 'Ширина плеч', 'Длина рукава']);
  await expect(table.getByRole('rowheader')).toHaveText(['M', 'L', 'XL']);
  await expect(table.getByRole('row', { name: /^L\b/ })).toContainText('72');

  // the chosen size is marked for a screen reader too
  await page.getByRole('radiogroup', { name: 'Размер' }).getByRole('radio', { name: /^L\b/ }).click();
  await expect(table.getByRole('rowheader', { name: /^L\b.*выбран/ })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  if (phone) {
    // wider than the phone: the table scrolls by itself
    const region = page.getByRole('region', { name: /^Размерная сетка/ });
    expect(await region.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  }
});
