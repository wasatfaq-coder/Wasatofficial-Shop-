// Цвета товара из других источников: код цвета читается, у нового цвета появляются варианты (03.10)
import { describe, expect, test } from 'bun:test';
import {
  colorHexForName,
  normalizeProductColors,
  readColorCode,
  splitColorEntry,
  UNKNOWN_COLOR_HEX,
} from '../../src/utils/colorCode';
import { generateSkuCode, withMissingSkus } from '../../src/utils/inventory';
import { parseProductsFromCSV } from '../../src/utils/csvHelpers';
import type { Product } from '../../src/types';

describe('the code field reads a colour copied from anywhere', () => {
  test('HEX with and without «#», short, with alpha, spaces and lower case', () => {
    expect(readColorCode('#1E2B37', { bare: true })).toBe('#1E2B37');
    expect(readColorCode(' #1e2b37 ', { bare: true })).toBe('#1E2B37');
    expect(readColorCode('1E2B37', { bare: true })).toBe('#1E2B37');
    expect(readColorCode('#1E2B37FF', { bare: true })).toBe('#1E2B37');
    expect(readColorCode('#fff', { bare: true })).toBe('#FFFFFF');
    expect(readColorCode('FFF', { bare: true })).toBe('#FFFFFF');
    expect(readColorCode('HEX: 1E2B37', { bare: true })).toBe('#1E2B37');
    expect(readColorCode('0x1E2B37', { bare: true })).toBe('#1E2B37');
  });

  test('rgb and rgba', () => {
    expect(readColorCode('rgb(30, 43, 55)', { bare: true })).toBe('#1E2B37');
    expect(readColorCode('rgba(30,43,55,0.5)', { bare: true })).toBe('#1E2B37');
    expect(readColorCode('rgb(30 43 55)', { bare: true })).toBe('#1E2B37');
  });

  test('not a code — null, and the old field no longer turns «rgb(30,» into a wrong #B30', () => {
    expect(readColorCode('', { bare: true })).toBeNull();
    expect(readColorCode('#1E2B3', { bare: true })).toBeNull();
    expect(readColorCode('Хаки', { bare: true })).toBeNull();
    expect(readColorCode('rgb(30,', { bare: true })).toBeNull();
  });
});

describe('a code pasted together with the name', () => {
  test('«Хаки #556B2F», «Хаки (556B2F)», «Navy: rgb(31, 42, 68)»', () => {
    expect(splitColorEntry('Хаки #556B2F')).toEqual({ name: 'Хаки', hex: '#556B2F' });
    expect(splitColorEntry('Хаки (556B2F)')).toEqual({ name: 'Хаки', hex: '#556B2F' });
    expect(splitColorEntry('Navy: rgb(31, 42, 68)')).toEqual({ name: 'Navy', hex: '#1F2A44' });
    expect(splitColorEntry('#556B2F')).toEqual({ name: '', hex: '#556B2F' });
  });

  test('a name without a code stays as it is; a word of hex letters is not a code', () => {
    expect(splitColorEntry('Тёмно-синий')).toEqual({ name: 'Тёмно-синий', hex: null });
    expect(splitColorEntry('Facade')).toEqual({ name: 'Facade', hex: null });
    // a supplier's number is the article of the colour, not its shade
    expect(splitColorEntry('Хаки 100200')).toEqual({ name: 'Хаки 100200', hex: null });
    expect(readColorCode('100200', { bare: true })).toBe('#100200');
  });

  test('while the name is typed, «#55» is not taken for a code yet', () => {
    expect(splitColorEntry('Хаки #55', 6)).toEqual({ name: 'Хаки #55', hex: null });
    expect(splitColorEntry('Хаки #556B2F', 6).hex).toBe('#556B2F');
  });
});

describe('a shade by the name', () => {
  test('common clothing colours, compound names first, ё and spaces do not matter', () => {
    expect(colorHexForName('Хаки')).toBe('#6B6B47');
    expect(colorHexForName('Тёмно-синий')).toBe('#1F2A44');
    expect(colorHexForName('темно синий')).toBe('#1F2A44');
    expect(colorHexForName('Синий')).toBe('#2F5DA8');
    expect(colorHexForName('Черный')).toBe('#1A1A1A');
    expect(colorHexForName('Серебристый')).toBe('#C0C0C0');
    expect(colorHexForName('Navy blue')).toBe('#1F2A44');
  });

  test('a name that says nothing about the shade — null (the form keeps the chosen code)', () => {
    expect(colorHexForName('Принт')).toBeNull();
    expect(colorHexForName('')).toBeNull();
  });

  test('an old colour saved as a string gets a shade; an unreadable code — by the name or neutral', () => {
    expect(normalizeProductColors(['Черный', { name: 'Хаки', hex: '556b2f' }, { name: 'Принт', hex: 'нет' }, { hex: '#FFF' }])).toEqual([
      { name: 'Черный', hex: '#1A1A1A' },
      { name: 'Хаки', hex: '#556B2F' },
      { name: 'Принт', hex: UNKNOWN_COLOR_HEX },
    ]);
    expect(normalizeProductColors(undefined)).toEqual([]);
  });
});

describe('a colour added from elsewhere gets its variations', () => {
  const product = (extra: Partial<Product>): Product =>
    ({ id: 'p1', title: 'Рубашка', price: 4000, category: 'shirts', inStock: true, ...extra }) as unknown as Product;

  test('new colour × every size with stock 0; the existing variations keep their stock', () => {
    const shirt = product({
      colors: [{ name: 'Белый', hex: '#FFFFFF' }, { name: 'Хаки', hex: '#556B2F' }],
      sizes: ['M', 'L'],
      skus: [
        { id: 'a', color: 'Белый', size: 'M', stock: 3, skuCode: 'A' },
        { id: 'b', color: 'белый', size: 'l', stock: 1, skuCode: 'B' },
      ],
    });
    const skus = withMissingSkus(shirt);
    expect(skus.slice(0, 2).map((s) => s.stock)).toEqual([3, 1]);
    expect(skus.slice(2).map((s) => `${s.color} ${s.size} ${s.stock}`)).toEqual(['Хаки M 0', 'Хаки L 0']);
  });

  test('without colours or sizes nothing is invented', () => {
    expect(withMissingSkus(product({ colors: [], sizes: ['M'], skus: [] }))).toEqual([]);
  });

  test('«Ё» in a colour name stays in the article code', () => {
    expect(generateSkuCode({ id: 'p1', category: 'shirts' }, 'Ёлочный', 'M', 'WS')).toBe('WS-SH1-ЁЛО-M');
  });
});

describe('CSV import reads colour codes', () => {
  const csv = (colors: string) =>
    `ID,Название,Категория,Цена,Старая цена,В наличии,Остаток,Размеры,Цвета,Картинка,Описание\np1,Рубашка,shirts,4000,,Да,0,M; L,"${colors}",https://x/1.jpg,`;

  test('a code from the file, otherwise a shade by the name, otherwise neutral', () => {
    const { products } = parseProductsFromCSV(csv('Хаки #556B2F; Тёмно-синий; Принт; rgb(30, 43, 55)'));
    expect(products[0].colors).toEqual([
      { name: 'Хаки', hex: '#556B2F' },
      { name: 'Тёмно-синий', hex: '#1F2A44' },
      { name: 'Принт', hex: UNKNOWN_COLOR_HEX },
      { name: '#1E2B37', hex: '#1E2B37' },
    ]);
  });

  test('a colour of an existing product written without a code keeps its shade and spelling; a new one gets a shade by the name', () => {
    const catalog = [{ id: 'p1', colors: [{ name: 'Тёмно-синий', hex: '#1C2836' }] }] as Product[];
    const { products } = parseProductsFromCSV(csv('темно-синий; Хаки'), catalog);
    expect(products[0].colors).toEqual([
      { name: 'Тёмно-синий', hex: '#1C2836' },
      { name: 'Хаки', hex: '#6B6B47' },
    ]);
  });

  test('an empty colours cell leaves the colours of an existing product as they are', () => {
    const { products } = parseProductsFromCSV(csv(''));
    expect('colors' in products[0]).toBe(false);
  });
});
