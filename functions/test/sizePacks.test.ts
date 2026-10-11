// Ростовки (этап 18 плана docs/admin-wholesale-plan.md): состав упаковки по размерам, цена, «можно собрать N»,
// штрихкод на цвет упаковки (уникален вместе со штрихкодами вариантов) и столбец CSV «Ростовки»
import { describe, expect, test } from 'bun:test';
import {
  productSizePacks,
  sizePackColors,
  sizePackLabelLine,
  sizePackPieces,
  sizePackPrice,
  sizePacksAvailable,
  sizePackTitle,
} from '../../src/shared/sizePacks';
import {
  collectBarcodes,
  findBarcodeProblems,
  findSizePackBarcodeProblems,
  isValidEan13,
  sizePackBarcodeKey,
  withSizePackBarcodes,
} from '../../src/shared/barcode';
import { mergeSizePacks, sizePacksCell, sizePacksFromCell } from '../../src/utils/sizePackCsv';
import type { Product } from '../../src/types';

const product = (extra: Partial<Product> = {}): Product =>
  ({
    id: 'p1',
    title: 'Футболка',
    price: 1500,
    sizes: ['48', '50', '52', '54'],
    colors: [{ name: 'Синий', hex: '#1F3A93' }, { name: 'Чёрный', hex: '#111111' }],
    skus: [
      { id: 's1', color: 'Синий', size: '48', stock: 5, barcode: '2000000000015' },
      { id: 's2', color: 'Синий', size: '50', stock: 9, barcode: '2000000000015' },
      { id: 's3', color: 'Синий', size: '52', stock: 2, barcode: '2000000000015' },
      { id: 's4', color: 'Чёрный', size: '48', stock: 1, barcode: '2000000000022' },
      { id: 's5', color: 'Чёрный', size: '50', stock: 0, barcode: '2000000000022' },
    ],
    ...extra,
  }) as unknown as Product;

describe('productSizePacks', () => {
  test('keeps only the product\'s sizes in its order, sane items and its colours', () => {
    const p = product({
      sizePacks: [
        { id: 'a', sizes: [{ size: '52', qty: 1 }, { size: '48', qty: 1 }, { size: '60', qty: 1 }, { size: '50', qty: 2 }] },
        { id: 'b', sizes: [{ size: '48', qty: 0 }, { size: '50', qty: 100 }] },
        { id: 'c', colors: ['синий', 'Зелёный'], sizes: [{ size: '50', qty: 1 }], price: 999.6 },
        { id: 'd', colors: ['Зелёный'], sizes: [{ size: '50', qty: 1 }] },
      ],
    });
    expect(productSizePacks(p)).toEqual([
      { id: 'a', sizes: [{ size: '48', qty: 1 }, { size: '50', qty: 2 }, { size: '52', qty: 1 }] },
      // a colour the product does not have is dropped; a pack left without its colours is dropped, not «every colour»
      { id: 'c', colors: ['Синий'], sizes: [{ size: '50', qty: 1 }], price: 1000 },
    ]);
  });

  test('a product without packs or with broken data has none', () => {
    expect(productSizePacks(product())).toEqual([]);
    expect(productSizePacks(product({ sizePacks: 'x' as never }))).toEqual([]);
    expect(productSizePacks(null)).toEqual([]);
  });
});

describe('pack price, pieces, colours, name and label line', () => {
  const pack = { id: 'a', sizes: [{ size: '48', qty: 1 }, { size: '50', qty: 2 }, { size: '52', qty: 1 }] };
  test('price — its own, else wholesale × pieces, else none', () => {
    expect(sizePackPieces(pack)).toBe(4);
    expect(sizePackPrice(product(), { ...pack, price: 4500 })).toBe(4500);
    expect(sizePackPrice(product({ wholesalePrice: 1100 }), pack)).toBe(4400);
    expect(sizePackPrice(product(), pack)).toBeUndefined();
  });
  test('every colour when the pack names none; the name and the label line', () => {
    expect(sizePackColors(product(), pack)).toEqual(['Синий', 'Чёрный']);
    expect(sizePackTitle(pack)).toBe('Ростовка 48–52');
    expect(sizePackTitle({ ...pack, title: ' Летняя ' })).toBe('Летняя');
    expect(sizePackLabelLine(pack)).toBe('48-50-52 / 1-2-1');
  });
});

describe('sizePacksAvailable', () => {
  const pack = { sizes: [{ size: '48', qty: 1 }, { size: '50', qty: 2 }, { size: '52', qty: 1 }] };
  test('the smallest number of whole packs over the sizes of the colour', () => {
    // Синий: 48 — 5, 50 — 9 ÷ 2 = 4, 52 — 2 → 2 packs
    expect(sizePacksAvailable(product(), pack, 'Синий')).toBe(2);
    expect(sizePacksAvailable(product(), pack, 'синий')).toBe(2);
    // Чёрный: no 52 at all → 0
    expect(sizePacksAvailable(product(), pack, 'Чёрный')).toBe(0);
  });
});

describe('pack barcodes', () => {
  const packed = product({ sizePacks: [{ id: 'a', sizes: [{ size: '48', qty: 1 }, { size: '50', qty: 1 }] }] });

  test('one new internal EAN-13 per colour, unique with the variations', () => {
    const [p] = withSizePackBarcodes([packed]);
    const codes = p.sizePacks![0].barcodes!;
    expect(codes.map((b) => b.color)).toEqual(['Синий', 'Чёрный']);
    expect(codes.every((b) => isValidEan13(b.code) && b.code.startsWith('2'))).toBe(true);
    expect(new Set(codes.map((b) => b.code)).size).toBe(2);
    expect(codes.some((b) => ['2000000000015', '2000000000022'].includes(b.code))).toBe(false);
    expect(collectBarcodes([p]).has(codes[0].code)).toBe(true);
    expect(findSizePackBarcodeProblems([p]).size).toBe(0);
  });

  test('a saved code stays; a code of a variation or of another pack is replaced', () => {
    const [once] = withSizePackBarcodes([packed]);
    const [again] = withSizePackBarcodes([once]);
    expect(again.sizePacks).toEqual(once.sizePacks);

    const clash = product({
      sizePacks: [{ id: 'a', colors: ['Синий'], sizes: [{ size: '48', qty: 1 }], barcodes: [{ color: 'Синий', code: '2000000000015' }] }],
    });
    expect(findSizePackBarcodeProblems([clash]).get(sizePackBarcodeKey('p1', 'a', 'Синий'))).toBe('duplicate');
    const [fixed] = withSizePackBarcodes([clash]);
    expect(fixed.sizePacks![0].barcodes![0].code).not.toBe('2000000000015');
  });

  test('a variation given a pack\'s code is the duplicate: the pack keeps it', () => {
    const [p] = withSizePackBarcodes([packed]);
    const code = p.sizePacks![0].barcodes![0].code;
    const other = product({ id: 'p2', sizePacks: undefined, skus: [{ id: 'x', color: 'Синий', size: '48', stock: 1, barcode: code }] });
    expect(findBarcodeProblems([p, other]).get('p2::x')).toBe('duplicate');
  });

  test('only the given products change; others keep their packs as they are', () => {
    const other = { ...packed, id: 'p2' };
    const [, untouched] = withSizePackBarcodes([packed, other], new Set(['p1']));
    expect(untouched).toBe(other);
  });
});

describe('CSV «Ростовки»', () => {
  test('a cell with colours, sizes and a price; empty, «-» and junk', () => {
    expect(sizePacksFromCell('(Синий) 48:1; 50:2 = 4 500 ₽ | 46:1;48:1')).toEqual([
      { colors: ['Синий'], sizes: [{ size: '48', qty: 1 }, { size: '50', qty: 2 }], price: 4500 },
      { sizes: [{ size: '46', qty: 1 }, { size: '48', qty: 1 }] },
    ]);
    expect(sizePacksFromCell('48 (M):1; 50 (L):1')).toEqual([{ sizes: [{ size: '48 (M)', qty: 1 }, { size: '50 (L)', qty: 1 }] }]);
    expect(sizePacksFromCell('')).toBe('');
    expect(sizePacksFromCell(' - ')).toBe('remove');
    expect(sizePacksFromCell('48;50')).toBeNull();
    expect(sizePacksFromCell('48:0')).toBeNull();
    expect(sizePacksFromCell('48:1; 48:2')).toBeNull();
    expect(sizePacksFromCell('48:1 = 0')).toBeNull();
  });

  test('export and import of the same product keep id, name and barcodes', () => {
    const [p] = withSizePackBarcodes([
      product({ sizePacks: [{ id: 'a', title: 'Летняя', colors: ['Синий'], sizes: [{ size: '48', qty: 1 }, { size: '50', qty: 2 }], price: 4500 }] }),
    ]);
    const cell = sizePacksCell(p);
    expect(cell).toBe('(Синий) 48:1; 50:2 = 4500');
    const merged = mergeSizePacks(p.sizePacks, sizePacksFromCell(cell) as never);
    expect(merged).toEqual(p.sizePacks!);
  });

  test('a new pack in the file gets a new id and no barcode yet', () => {
    const merged = mergeSizePacks([{ id: 'pack-1', sizes: [{ size: '48', qty: 1 }] }], [{ sizes: [{ size: '50', qty: 1 }] }]);
    expect(merged).toEqual([{ id: 'pack-2', sizes: [{ size: '50', qty: 1 }] }]);
  });
});
