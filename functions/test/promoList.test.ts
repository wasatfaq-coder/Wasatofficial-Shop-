// «Промокоды» в админке: поиск, чипы, пачка одной строкой и проверка генератора (этап 8 плана админки, часть 2)
import { describe, expect, test } from 'bun:test';
import {
  batchInputErrors,
  categoryNamesText,
  isPromoUsedUp,
  promoFilterCounts,
  promoListRows,
  uniquePromoCode,
} from '../../src/utils/promoList';
import type { PromoCode } from '../../src/types';

const promo = (extra: Partial<PromoCode> = {}): PromoCode => ({
  id: 'promo-1',
  code: 'WASAT20',
  discountPercent: 20,
  discountType: 'percent',
  discountValue: 20,
  title: 'Скидка 20%',
  description: '',
  usedCount: 0,
  active: true,
  ...extra,
});

const batchCode = (run: number, i: number, extra: Partial<PromoCode> = {}) =>
  promo({ id: `batch-${run}-${i}`, code: `SMS-${run}${i}X`, isBatch: true, usageLimit: 1, batchName: 'Пачка SMS- (3 шт.)', ...extra });

describe('the list of «Промокоды»', () => {
  const list = [
    promo(),
    batchCode(1000, 0),
    batchCode(1000, 1, { usedCount: 1 }),
    batchCode(1000, 2, { active: false }),
    promo({ id: 'promo-2', code: 'BLOG10', isReferral: true, partnerName: '@alex' }),
    batchCode(5000, 0),
  ];

  test('a batch is one row in its first code\'s place, two runs — two rows', () => {
    const rows = promoListRows(list, 'all', '');
    expect(rows.map((r) => (r.kind === 'batch' ? r.batch.key : r.promo.code))).toEqual([
      'WASAT20',
      'batch-1000|Пачка SMS- (3 шт.)',
      'BLOG10',
      'batch-5000|Пачка SMS- (3 шт.)',
    ]);
    const batch = rows[1].kind === 'batch' ? rows[1].batch : null;
    // the prefix the owner typed, from the batch's name, not the longer common start of the random codes
    expect(batch?.prefix).toBe('SMS-');
    expect(batch?.codes).toHaveLength(3);
    expect(batch?.used).toBe(1);
    // the used and the paused code are not worth sending
    expect(batch?.unused.map((p) => p.id)).toEqual(['batch-1000-0']);
    expect(batch?.active).toBe(2);
  });

  test('the search finds one code of a batch as its own row; by partner too', () => {
    expect(promoListRows(list, 'all', 'sms-10001x').map((r) => r.kind === 'promo' && r.promo.id)).toEqual(['batch-1000-1']);
    expect(promoListRows(list, 'all', 'ALEX').map((r) => r.kind === 'promo' && r.promo.code)).toEqual(['BLOG10']);
  });

  test('the chips: working, paused, partners, batches; a batch counts as its codes', () => {
    expect(promoFilterCounts(list)).toMatchObject({ all: 6, active: 4, paused: 1, partners: 1, batches: 4, expired: 0 });
    expect(promoListRows(list, 'partners', '').map((r) => r.kind === 'promo' && r.promo.code)).toEqual(['BLOG10']);
  });

  test('a code whose every use is taken does not «действует»', () => {
    expect(isPromoUsedUp(promo({ usageLimit: 1, usedCount: 1 }))).toBe(true);
    expect(isPromoUsedUp(promo({ usedCount: 50 }))).toBe(false);
    expect(promoFilterCounts([promo({ usageLimit: 1, usedCount: 1 })]).active).toBe(0);
  });

  test('a batch from before the run id is grouped by its name', () => {
    const old = [
      promo({ id: 'a', code: 'VIP-AAAAA', isBatch: true, batchName: 'Рассылка' }),
      promo({ id: 'b', code: 'VIP-ABBBB', isBatch: true, batchName: 'Рассылка' }),
    ];
    const rows = promoListRows(old, 'all', '');
    expect(rows).toHaveLength(1);
    // no prefix in the name: the common start of the codes
    expect(rows[0].kind === 'batch' && rows[0].batch.prefix).toBe('VIP-A');
  });

  test('the old generator read the clock per code: neighbouring times are one batch, a later run — another', () => {
    const name = { batchName: 'Пачка SMS- (3 шт.)' };
    const codes = [
      batchCode(1000, 0, name),
      batchCode(1000, 1, name),
      batchCode(1001, 2, name),
      batchCode(9000, 0, name),
    ];
    const rows = promoListRows(codes, 'all', '');
    expect(rows.map((r) => (r.kind === 'batch' ? r.batch.codes.length : 0))).toEqual([3, 1]);
  });

  test('a batch without a prefix is not named by a letter its random codes share', () => {
    const name = { batchName: 'Пачка без префикса (2 шт.)' };
    const rows = promoListRows([batchCode(5, 0, { ...name, code: 'KAAAA' }), batchCode(5, 1, { ...name, code: 'KBBBB' })], 'all', '');
    expect(rows[0].kind === 'batch' && rows[0].batch.prefix).toBe('');
  });

  test('under a chip a batch is shown whole: its numbers and «Удалить пачку» cover every code', () => {
    const paused = promoListRows(list, 'paused', '');
    expect(paused).toHaveLength(1);
    expect(paused[0].kind === 'batch' && paused[0].batch.codes.map((p) => p.id)).toEqual(['batch-1000-0', 'batch-1000-1', 'batch-1000-2']);
    const working = promoListRows(list, 'active', '');
    const batch = working.find((r) => r.kind === 'batch' && r.batch.key.startsWith('batch-1000|'));
    expect(batch?.kind === 'batch' && batch.batch.used).toBe(1);
  });

  test('categories by their names; a removed one keeps its id', () => {
    expect(categoryNamesText(['shirts', 'gone'], [{ id: 'shirts', name: 'Рубашки' }])).toBe('Рубашки, gone');
  });
});

describe('the batch generator', () => {
  const ok = { prefix: 'SMS-', count: 10, discountType: 'fixed' as const, discountValue: 500, minOrder: 0 };

  test('wrong values are listed, not clamped', () => {
    expect(batchInputErrors(ok)).toEqual([]);
    expect(batchInputErrors({ ...ok, count: 150 })).toEqual(['Количество кодов — от 1 до 100']);
    expect(batchInputErrors({ ...ok, discountType: 'percent', discountValue: 95 })).toEqual(['Размер скидки — от 1 до 90 %']);
    expect(batchInputErrors({ ...ok, discountValue: Number.NaN })).toHaveLength(1);
    expect(batchInputErrors({ ...ok, prefix: 'СКИДКА' })).toEqual(['Префикс — до 12 латинских букв, цифр или дефисов']);
  });

  test('a new code is never one another promo has, whatever the case', () => {
    let calls = 0;
    // the first five draws repeat the taken code, then the generator moves on
    const random = () => (calls++ < 5 ? 0 : 0.99);
    const code = uniquePromoCode('sms-', ['SMS-AAAAA'], random);
    expect(code).toBe('SMS-99999');
    expect(uniquePromoCode('', [], () => 0, 3)).toBe('AAA');
  });
});
