// Правка ростовок в форме товара (этап 18 плана docs/admin-wholesale-plan.md): черновик из товара, проверка на «Сохранить»,
// ростовки и штрихкоды сохранённого товара, строка закрытого блока
import { describe, expect, test } from 'bun:test';
import {
  newPackDraft,
  packDraftColors,
  packDraftsFromProduct,
  packFromDraft,
  productWithSizePacks,
  sizePackErrors,
  sizePacksSummary,
  type SizePackDraft,
} from '../../src/utils/sizePackEditing';
import { isValidEan13 } from '../../src/shared/barcode';
import { SIZE_PACKS_MAX } from '../../src/shared/sizePacks';
import type { Product } from '../../src/types';

const SIZES = ['48', '50', '52', '54'];
const COLORS = [
  { name: 'Синий', hex: '#1F3A93' },
  { name: 'Чёрный', hex: '#111111' },
];

const draft = (extra: Partial<SizePackDraft> = {}): SizePackDraft => ({ ...newPackDraft([]), qty: { '48': '1', '50': '2' }, ...extra });

const product = (extra: Partial<Product> = {}): Product =>
  ({ id: 'p1', title: 'Футболка', price: 1500, sizes: SIZES, colors: COLORS, skus: [], ...extra }) as Product;

describe('черновики', () => {
  test('новая ростовка получает pack-N, которого ещё нет', () => {
    expect(newPackDraft([]).id).toBe('pack-1');
    expect(newPackDraft([draft({ id: 'pack-1' }), draft({ id: 'pack-3' })]).id).toBe('pack-2');
  });

  test('черновик из товара хранит id, штрихкоды, цвета и штуки по размерам', () => {
    const drafts = packDraftsFromProduct(
      product({
        sizePacks: [
          {
            id: 'pack-7',
            title: 'Базовая',
            colors: ['Синий'],
            sizes: [{ size: '50', qty: 2 }, { size: '48', qty: 1 }],
            price: 4400,
            barcodes: [{ color: 'Синий', code: '2000000000015' }],
          },
        ],
      })
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ id: 'pack-7', title: 'Базовая', allColors: false, colors: ['Синий'], price: '4400' });
    expect(drafts[0].qty).toEqual({ '48': '1', '50': '2' });
    expect(drafts[0].barcodes).toEqual([{ color: 'Синий', code: '2000000000015' }]);
  });

  test('товар без ростовок — пустой список', () => {
    expect(packDraftsFromProduct(product())).toEqual([]);
  });
});

describe('проверка на «Сохранить»', () => {
  test('верная ростовка без цены — не ошибка', () => {
    expect(sizePackErrors([draft()], SIZES, COLORS)).toEqual([]);
  });

  test('ростовка без размеров', () => {
    const errors = sizePackErrors([draft({ qty: {} })], SIZES, COLORS);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('хотя бы у одного размера');
  });

  test('штуки вне размеров товара не считаются', () => {
    expect(sizePackErrors([draft({ qty: { '60': '1' } })], SIZES, COLORS)).toHaveLength(1);
  });

  test('штуки — целое от 1 до 99', () => {
    for (const bad of ['0', '100', '1,5', 'два', '-1']) {
      expect(sizePackErrors([draft({ qty: { '48': bad } })], SIZES, COLORS)).toHaveLength(1);
    }
    expect(sizePackErrors([draft({ qty: { '48': '99' } })], SIZES, COLORS)).toEqual([]);
  });

  test('цвет: не «все цвета» и ни одного выбранного', () => {
    expect(sizePackErrors([draft({ allColors: false, colors: [] })], SIZES, COLORS)).toHaveLength(1);
    // выбранный цвет, которого в товаре уже нет
    expect(sizePackErrors([draft({ allColors: false, colors: ['Красный'] })], SIZES, COLORS)).toHaveLength(1);
    expect(sizePackErrors([draft({ allColors: false, colors: ['синий'] })], SIZES, COLORS)).toEqual([]);
  });

  test('цена: целое больше нуля и не больше предела', () => {
    for (const bad of ['0', '12,5', 'abc', '-5', '10000001']) {
      expect(sizePackErrors([draft({ price: bad })], SIZES, COLORS)).toHaveLength(1);
    }
    expect(sizePackErrors([draft({ price: '4 400 ₽' })], SIZES, COLORS)).toEqual([]);
  });

  test('больше десяти ростовок', () => {
    const many = Array.from({ length: SIZE_PACKS_MAX + 1 }, (_, i) => draft({ id: `pack-${i + 1}` }));
    expect(sizePackErrors(many, SIZES, COLORS)).toHaveLength(1);
  });

  test('сообщение называет ростовку по названию или номеру', () => {
    const errors = sizePackErrors([draft(), draft({ title: 'Летняя', qty: {} })], SIZES, COLORS);
    expect(errors[0]).toContain('«Летняя»');
    expect(sizePackErrors([draft({ qty: {} })], SIZES, COLORS)[0]).toContain('«Ростовка 1»');
  });
});

describe('ростовка из черновика', () => {
  test('строки идут в порядке размеров товара, пустые отброшены', () => {
    const pack = packFromDraft(draft({ qty: { '52': '1', '48': '2', '50': '' } }), SIZES, COLORS);
    expect(pack.sizes).toEqual([{ size: '48', qty: 2 }, { size: '52', qty: 1 }]);
  });

  test('«все цвета» и выбор всех цветов не пишут поле colors', () => {
    expect(packFromDraft(draft(), SIZES, COLORS).colors).toBeUndefined();
    expect(packFromDraft(draft({ allColors: false, colors: ['Синий', 'Чёрный'] }), SIZES, COLORS).colors).toBeUndefined();
    expect(packFromDraft(draft({ allColors: false, colors: ['Синий'] }), SIZES, COLORS).colors).toEqual(['Синий']);
  });

  test('цвета ростовки', () => {
    expect(packDraftColors(draft(), COLORS)).toEqual(['Синий', 'Чёрный']);
    expect(packDraftColors(draft({ allColors: false, colors: ['Чёрный'] }), COLORS)).toEqual(['Чёрный']);
  });

  test('название обрезается по пределу, цена — число', () => {
    const pack = packFromDraft(draft({ title: ' '.concat('а'.repeat(80)), price: '4 400' }), SIZES, COLORS);
    expect(pack.title?.length).toBe(60);
    expect(pack.price).toBe(4400);
  });
});

describe('товар с ростовками', () => {
  test('штрихкод на каждый цвет, остальные коды не повторяются', () => {
    const other = product({
      id: 'p2',
      skus: [{ skuCode: 'A', color: 'Синий', size: '48', stock: 1, barcode: '2000000000015' }] as Product['skus'],
    });
    const saved = productWithSizePacks(product(), [draft(), draft({ id: 'pack-2', allColors: false, colors: ['Чёрный'] })], [other]);
    const codes = saved.sizePacks!.flatMap((p) => p.barcodes ?? []);
    expect(codes).toHaveLength(3);
    for (const { code } of codes) expect(isValidEan13(code)).toBe(true);
    expect(new Set(codes.map((c) => c.code)).size).toBe(3);
    expect(codes.some((c) => c.code === '2000000000015')).toBe(false);
  });

  test('правка ростовки оставляет её штрихкоды', () => {
    const first = productWithSizePacks(product(), [draft()], []);
    const reopened = packDraftsFromProduct(first);
    reopened[0].qty = { '48': '2', '50': '2' };
    const second = productWithSizePacks(first, reopened, []);
    expect(second.sizePacks![0].barcodes).toEqual(first.sizePacks![0].barcodes);
  });

  test('цвет убрали из ростовки — штрихкод его уходит, новый цвет получает свой', () => {
    const first = productWithSizePacks(product(), [draft()], []);
    const reopened = packDraftsFromProduct(first);
    reopened[0].allColors = false;
    reopened[0].colors = ['Чёрный'];
    const second = productWithSizePacks(first, reopened, []);
    expect(second.sizePacks![0].barcodes!.map((b) => b.color)).toEqual(['Чёрный']);
    expect(second.sizePacks![0].barcodes![0].code).toBe(first.sizePacks![0].barcodes!.find((b) => b.color === 'Чёрный')!.code);
  });

  test('без ростовок поле sizePacks убирается', () => {
    const before = productWithSizePacks(product(), [draft()], []);
    const after = productWithSizePacks(before, [], []);
    expect(after.sizePacks).toBeUndefined();
  });
});

describe('строка закрытого блока', () => {
  test('диапазон размеров и штук', () => {
    const drafts = [draft({ qty: { '48': '1', '50': '1', '52': '2' } }), draft({ id: 'pack-2', qty: { '54': '3' } })];
    expect(sizePacksSummary(drafts, SIZES, COLORS)).toBe('2 ростовки: 48–52 (4 шт.), 54 (3 шт.)');
  });

  test('склонение и пустой результат', () => {
    expect(sizePacksSummary([draft()], SIZES, COLORS)).toBe('1 ростовка: 48–50 (3 шт.)');
    expect(sizePacksSummary([], SIZES, COLORS)).toBe('');
    expect(sizePacksSummary([draft({ qty: {} })], SIZES, COLORS)).toBe('');
  });
});
