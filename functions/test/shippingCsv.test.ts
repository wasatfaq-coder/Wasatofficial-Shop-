// Stage 15 of docs/admin-wholesale-plan.md: weight and package of a product in the catalog CSV
import { describe, expect, test } from 'bun:test';
import { parseProductsFromCSV, weightFromCell } from '../../src/utils/csvHelpers';
import { packageCell, packageFromCell } from '../../src/utils/productShipping';

const OLD_HEADER = 'ID,Название,Категория,Цена,Старая цена,В наличии,Остаток,Размеры,Цвета,Картинка,Описание';
const HEADER = `${OLD_HEADER},Валюта закупки,Закупка,Своя наценка (%),Поставщик,Артикул поставщика,Вес,Габариты`;
const row = (shipping: string) => `${HEADER}\np1,Рубашка,shirts,4000,,Да,0,M,Белый,https://x/1.jpg,,,,,,,${shipping}`;

describe('weight and package columns of the catalog CSV', () => {
  test('weight and package are read; «30 x 20 x 5», «30×20×5 см» and a comma are the same package', () => {
    const p = parseProductsFromCSV(row('350,"30 x 20 x 5"')).products[0];
    expect(p.weightGrams).toBe(350);
    expect(p.packageCm).toEqual({ l: 30, w: 20, h: 5 });
    expect(parseProductsFromCSV(row('1200,"30×20×5 см"')).products[0].packageCm).toEqual({ l: 30, w: 20, h: 5 });
    expect(parseProductsFromCSV(row(',"30,5×20×5"')).products[0].packageCm).toEqual({ l: 30.5, w: 20, h: 5 });
  });

  test('what the export writes the import reads back', () => {
    const cell = packageCell({ packageCm: { l: 30.5, w: 20, h: 5 } });
    expect(cell).toBe('30.5×20×5');
    expect(packageFromCell(cell)).toEqual({ l: 30.5, w: 20, h: 5 });
    expect(packageCell({})).toBe('');
    const p = parseProductsFromCSV(row(`350,"${cell}"`)).products[0];
    expect(p).toMatchObject({ weightGrams: 350, packageCm: { l: 30.5, w: 20, h: 5 } });
  });

  test('empty cells keep the product\'s weight and package', () => {
    const { products, badShipping } = parseProductsFromCSV(row(','));
    expect('weightGrams' in products[0] || 'packageCm' in products[0]).toBe(false);
    expect(badShipping).toBe(0);
  });

  test('«-», «—» and «нет» remove them', () => {
    const removed = parseProductsFromCSV(row('-,—')).products[0];
    expect('weightGrams' in removed && removed.weightGrams === undefined).toBe(true);
    expect('packageCm' in removed && removed.packageCm === undefined).toBe(true);
    expect(weightFromCell('нет')).toBeNull();
    expect(packageFromCell('нет')).toBe('remove');
  });

  test('a wrong weight or package is counted and leaves the product as it was', () => {
    for (const bad of ['0', '-5', '350.5', 'много', '100001']) expect(weightFromCell(bad)).toBe('invalid');
    for (const bad of ['30×20', '30×20×0', 'a×b×c', '600×20×5']) expect(packageFromCell(bad)).toBeNull();
    const { products, badShipping } = parseProductsFromCSV(row('abc,"30×20"'));
    expect(badShipping).toBe(1);
    expect('weightGrams' in products[0] || 'packageCm' in products[0]).toBe(false);
  });

  test('an old file without the columns changes nothing', () => {
    const old = `${OLD_HEADER}\np1,Рубашка,shirts,4000,,Да,0,M,Белый,https://x/1.jpg,`;
    const { products, badShipping } = parseProductsFromCSV(old);
    expect('weightGrams' in products[0] || 'packageCm' in products[0]).toBe(false);
    expect(badShipping).toBe(0);
    // the file of stage 11 ends with the supplier columns
    const stage11 = `${OLD_HEADER},Валюта закупки,Закупка,Своя наценка (%),Поставщик,Артикул поставщика\np1,Рубашка,shirts,4000,,Да,0,M,Белый,https://x/1.jpg,,,,,Фабрика,A1`;
    expect('weightGrams' in parseProductsFromCSV(stage11).products[0]).toBe(false);
  });
});
