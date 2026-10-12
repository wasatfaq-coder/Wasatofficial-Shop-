// Size packs in an order (stage 19): the pack price split into lines, lines back into one pack
import { describe, expect, test } from 'bun:test';
import { expandPackLines, groupOrderLines, orderPackCounts, removePackGroup, setPackGroupCount, splitPackPrice, type CartPackLine } from '../../src/shared/packLines';
import { refundedLinesText, variantStockDiff } from '../../src/utils/orderAdjustment';
import { calcSubtotal, toPricingLine } from '../../src/shared/orderPricing';
import type { CartItem, Product } from '../../src/types';

const product = { id: 'p1', title: 'Рубашка', price: 3000, sizes: ['48', '50', '52'], colors: [{ name: 'Синий', hex: '#2F5DA8' }] } as unknown as Product;
const sizes = [
  { size: '48', qty: 1 },
  { size: '50', qty: 2 },
  { size: '52', qty: 1 },
];
const packLine = (price: number, quantity: number): CartPackLine => ({
  id: 'c1',
  product,
  selectedColor: 'Синий',
  selectedSize: '',
  quantity,
  priceKind: 'pack',
  packId: 'pack-1',
  packTitle: 'Ростовка 48–52',
  packPrice: price,
  packSizes: sizes,
});
const sum = (lines: { qty?: number; quantity?: number; unitPrice?: number }[]) =>
  lines.reduce((s, l) => s + (l.unitPrice ?? 0) * (l.qty ?? l.quantity ?? 0), 0);

describe('splitPackPrice', () => {
  test('an even price gives one price per item', () => {
    const parts = splitPackPrice(10_000, sizes);
    expect(parts.map((p) => p.unitPrice)).toEqual([2500, 2500, 2500]);
    expect(sum(parts)).toBe(10_000);
  });
  test('the remainder goes to the first items, a size split at the boundary', () => {
    const parts = splitPackPrice(10_002, sizes);
    expect(sum(parts)).toBe(10_002);
    expect(parts).toEqual([
      { size: '48', qty: 1, unitPrice: 2501 },
      { size: '50', qty: 1, unitPrice: 2501 },
      { size: '50', qty: 1, unitPrice: 2500 },
      { size: '52', qty: 1, unitPrice: 2500 },
    ]);
  });
  test('no items — no parts', () => {
    expect(splitPackPrice(100, [])).toEqual([]);
  });
});

describe('expandPackLines', () => {
  test('a pack line becomes lines of its sizes; the sum is price × packs', () => {
    const plain: CartItem = { id: 'c0', product, selectedColor: 'Синий', selectedSize: '48', quantity: 2 };
    const lines = expandPackLines([plain, packLine(10_002, 3)]);
    expect(lines[0]).toBe(plain);
    const pack = lines.slice(1);
    expect(pack.every((l) => l.packGroup === 'c1' && l.packCount === 3 && l.priceKind === 'pack')).toBe(true);
    expect(pack.reduce((s, l) => s + l.quantity, 0)).toBe(12);
    expect(sum(pack)).toBe(30_006);
    expect(calcSubtotal(lines.map(toPricingLine))).toBe(30_006 + 2 * 3000);
    expect(new Set(lines.map((l) => l.id)).size).toBe(lines.length);
    expect(pack.some((l) => 'packSizes' in l)).toBe(false);
  });
});

describe('groupOrderLines', () => {
  test('the lines of a pack come back as one pack with its composition and price', () => {
    const lines = expandPackLines([{ id: 'c0', product, selectedColor: 'Синий', selectedSize: '48', quantity: 1 }, packLine(10_002, 2)]);
    const groups = groupOrderLines(lines);
    expect(groups.length).toBe(2);
    expect(groups[0].kind).toBe('line');
    const pack = groups[1];
    if (pack.kind !== 'pack') throw new Error('pack expected');
    expect(pack.packCount).toBe(2);
    expect(pack.packPrice).toBe(10_002);
    expect(pack.total).toBe(20_004);
    expect(pack.pieces).toBe(8);
    expect(pack.sizes).toEqual(sizes);
    expect(pack.indexes).toEqual([1, 2, 3, 4]);
    expect(pack.title).toBe('Ростовка 48–52');
  });
  test('an old order without groups is single lines', () => {
    const items: CartItem[] = [{ id: 'a', product, selectedColor: 'Синий', selectedSize: '50', quantity: 1 }];
    expect(groupOrderLines(items)).toEqual([{ kind: 'line', item: items[0], index: 0 }]);
  });
  test('packs and items of an order', () => {
    const lines = expandPackLines([{ id: 'c0', product, selectedColor: 'Синий', selectedSize: '48', quantity: 2 }, packLine(10_000, 3)]);
    expect(orderPackCounts(lines)).toEqual({ packs: 3, pieces: 14 });
  });
});

describe('whole packs in «Правка состава»', () => {
  test('a pack changes its count on every size line; removing takes all its lines', () => {
    const lines = expandPackLines([{ id: 'c0', product, selectedColor: 'Синий', selectedSize: '48', quantity: 1 }, packLine(10_002, 1)]);
    const two = setPackGroupCount(lines, 'c1', 2);
    expect(two[0]).toBe(lines[0]);
    expect(two.slice(1).map((l) => l.quantity)).toEqual([2, 2, 2, 2]);
    expect(two.slice(1).every((l) => l.packCount === 2)).toBe(true);
    const groups = groupOrderLines(two);
    expect(groups[1].kind === 'pack' && groups[1].total).toBe(20_004);
    expect(removePackGroup(two, 'c1')).toEqual([lines[0]]);
  });
});

describe('variantStockDiff', () => {
  test('two lines of one size count as one variant', () => {
    const lines = expandPackLines([packLine(10_002, 1)]);
    const { returnedItems, addedItems } = variantStockDiff(lines, setPackGroupCount(lines, 'c1', 3));
    expect(returnedItems).toEqual([]);
    expect(addedItems.map((l) => [l.selectedSize, l.quantity])).toEqual([
      ['48', 2],
      ['50', 4],
      ['52', 2],
    ]);
  });
  test('a removed pack returns each size with the money it left with', () => {
    const lines = expandPackLines([packLine(10_002, 1)]);
    const { returnedItems, addedItems } = variantStockDiff(lines, []);
    expect(addedItems).toEqual([]);
    expect(returnedItems.map((l) => [l.selectedSize, l.quantity, l.refundSum])).toEqual([
      ['48', 1, 2501],
      ['50', 2, 5001],
      ['52', 1, 2500],
    ]);
    // the refund text adds up to the pack price, not a rouble more
    expect(refundedLinesText(returnedItems)).toContain('× 2 — 5');
    expect(refundedLinesText(returnedItems).replace(/\s/g, '')).toContain('×2—5001₽');
  });
  test('a preorder line is a separate variant', () => {
    const plain: CartItem = { id: 'a', product, selectedColor: 'Синий', selectedSize: '50', quantity: 1 };
    const pre: CartItem = { ...plain, id: 'b', isPreorder: true };
    const { returnedItems, addedItems } = variantStockDiff([plain], [plain, pre]);
    expect(returnedItems).toEqual([]);
    expect(addedItems.map((l) => [l.id, l.isPreorder])).toEqual([['b', true]]);
  });
});

describe('«Аналитика»: items and packs', () => {
  test('a pack counts its items and one pack per pack ordered', async () => {
    const { computePeriodBreakdown } = await import('../../src/utils/analyticsEngine');
    const items = expandPackLines([{ id: 'c0', product, selectedColor: 'Синий', selectedSize: '48', quantity: 1 }, packLine(10_000, 2)]);
    const [top] = computePeriodBreakdown([{ id: 'WS-1', items } as never]).topProducts;
    expect(top.quantity).toBe(9);
    expect(top.packs).toBe(2);
    expect(top.revenue).toBe(3000 + 20_000);
  });
});

describe('stage 20: a size pack in the cart', () => {
  const packProduct = {
    ...product,
    wholesalePrice: 2000,
    sizePacks: [{ id: 'pack-1', sizes: [{ size: '48', qty: 1 }, { size: '50', qty: 2 }, { size: '52', qty: 1 }] }],
  } as unknown as Product;
  const cartPack = (over: Partial<CartItem> = {}): CartItem => ({
    id: 'c1', product: packProduct, selectedColor: 'Синий', selectedSize: '', quantity: 2, priceKind: 'pack', packId: 'pack-1', ...over,
  });

  test('the price of a pack comes from the product: wholesale × pieces, no volume step', async () => {
    const { priceCartLines } = await import('../../src/shared/wholesalePricing');
    const settings = { volumeDiscount: { kind: 'percent' as const, countBy: 'order' as const, tiers: [{ minPacks: 1, value: 50 }] } };
    const [line] = priceCartLines([cartPack()], settings);
    expect(line.unitPrice).toBe(8000);
    expect(line.packPrice).toBe(8000);
    expect(line.packTitle).toBe('Ростовка 48–52');
    expect(line.packSizes).toEqual([{ size: '48', qty: 1 }, { size: '50', qty: 2 }, { size: '52', qty: 1 }]);
    expect(line.volumeDiscountPerUnit).toBeUndefined();
    // the cart total is packs × pack price; the order lines add up to the same
    const order = expandPackLines([line]);
    expect(calcSubtotal(order.map(toPricingLine))).toBe(16_000);
  });

  test('a pack the product no longer has is not ordered', async () => {
    const { priceCartLines } = await import('../../src/shared/wholesalePricing');
    const { packLineProblems } = await import('../../src/shared/packLines');
    const [gone] = priceCartLines([cartPack({ packId: 'pack-x' })]);
    expect(packLineProblems([gone]).length).toBe(1);
    const [ok] = priceCartLines([cartPack()]);
    expect(packLineProblems([ok])).toEqual([]);
  });

  test('a pack line does not count toward wholesale packs or their minimum', async () => {
    const { wholesaleLineProblems, priceCartLines } = await import('../../src/shared/wholesalePricing');
    expect(wholesaleLineProblems(priceCartLines([cartPack({ quantity: 3 })]))).toEqual([]);
  });
});
