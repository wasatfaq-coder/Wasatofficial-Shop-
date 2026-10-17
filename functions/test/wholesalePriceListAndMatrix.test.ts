import { describe, expect, test } from 'bun:test';
import {
  buildWholesalePriceListRows,
  WHOLESALE_PRICE_LIST_CSV_HEADERS,
  wholesalePriceListCsvRows,
} from '../../src/utils/wholesalePriceList';
import {
  matrixCellKey,
  maxSizePacksForCell,
  maxWholesalePacksForCell,
  summarizePackMatrix,
  summarizeWholesaleMatrix,
} from '../../src/utils/wholesaleMatrix';
import { wholesaleOfferOf } from '../../src/utils/wholesaleOffer';
import type { CartItem, Product } from '../../src/types';

const makeProduct = (extra: Partial<Product> = {}): Product =>
  ({
    id: 'p1',
    title: 'Классическая рубашка',
    price: 2500,
    wholesalePrice: 1500,
    wholesalePackSize: 5,
    wholesaleMinPacks: 2,
    category: 'shirts',
    categoryLabel: 'Рубашки',
    sizes: ['M', 'L'],
    colors: [
      { name: 'Белый', hex: '#FFFFFF' },
      { name: 'Синий', hex: '#2C4A6B' },
    ],
    images: ['https://example.com/shirt.jpg'],
    material: 'Хлопок 100%',
    inStock: true,
    skus: [
      { id: 's1', color: 'Белый', size: 'M', stock: 12 },
      { id: 's2', color: 'Белый', size: 'L', stock: 4 },
      { id: 's3', color: 'Синий', size: 'M', stock: 15 },
      { id: 's4', color: 'Синий', size: 'L', stock: 10 },
    ],
    ...extra,
  }) as Product;

describe('buildWholesalePriceListRows and CSV export', () => {
  test('filters only products sold wholesale and formats packs, tiers, sizePacks and stock', () => {
    const wholesaleShirt = makeProduct({
      sizePacks: [
        {
          id: 'pack-1',
          title: 'Стандарт M–L',
          sizes: [
            { size: 'M', qty: 2 },
            { size: 'L', qty: 2 },
          ],
          price: 5600,
        },
      ],
    });
    const retailOnly = makeProduct({
      id: 'p2',
      title: 'Розничное поло',
      saleChannel: 'retail',
      wholesalePrice: 1200,
    });
    const noWholesalePrice = makeProduct({
      id: 'p3',
      title: 'Брюки без опта',
      wholesalePrice: undefined,
    });

    const wholesaleSettings = {
      minOrderAmount: 15000,
      volumeDiscount: {
        kind: 'percent' as const,
        countBy: 'product' as const,
        tiers: [{ minPacks: 5, value: 10 }],
      },
    };

    const rows = buildWholesalePriceListRows(
      [wholesaleShirt, retailOnly, noWholesalePrice],
      wholesaleSettings
    );

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.id).toBe('p1');
    expect(row.categoryLabel).toBe('Рубашки');
    expect(row.saleChannelLabel).toBe('В розницу и оптом');
    expect(row.wholesaleUnitPrice).toBe(1500);
    expect(row.packSize).toBe(5);
    expect(row.packPrice).toBe(7500);
    expect(row.minPacks).toBe(2);
    expect(row.retailPrice).toBe(2500);
    expect(row.stepsText).toContain('от 5 уп.');
    expect(row.sizePacksText).toContain('Стандарт M–L');
    expect(row.sizePacks[0]?.totalPacks).toBe(7); // Белый: 2 уп. + Синий: 5 уп.
    expect(row.totalStock).toBe(41);

    const table = wholesalePriceListCsvRows([wholesaleShirt, retailOnly], wholesaleSettings);
    expect(table).toHaveLength(2);
    expect(table[0]).toEqual(WHOLESALE_PRICE_LIST_CSV_HEADERS);
    expect(table[1][0]).toBe('p1');
    expect(table[1][1]).toBe('Классическая рубашка');
    expect(String(table[1][10])).toContain('Стандарт M–L');
  });

  test('hides retail price for wholesale-only products', () => {
    const onlyWholesale = makeProduct({ saleChannel: 'wholesale' });
    const rows = buildWholesalePriceListRows([onlyWholesale]);
    expect(rows).toHaveLength(1);
    expect(rows[0].saleChannelLabel).toBe('Только оптом');
    expect(rows[0].retailPrice).toBeNull();
  });
});

describe('maxWholesalePacksForCell and summarizeWholesaleMatrix', () => {
  test('calculates available packs per color/size and applies volume tier and minPacks check', () => {
    const prod = makeProduct();
    const settings = {
      volumeDiscount: {
        kind: 'percent' as const,
        countBy: 'product' as const,
        tiers: [{ minPacks: 4, value: 10 }],
      },
    };
    const offer = wholesaleOfferOf(prod, settings)!;

    // Белый M has 12 pcs -> 2 packs of 5
    expect(maxWholesalePacksForCell(prod, 'Белый', 'M', [])).toBe(2);
    // Белый L has 4 pcs -> 0 packs of 5
    expect(maxWholesalePacksForCell(prod, 'Белый', 'L', [])).toBe(0);
    // Синий M has 15 pcs -> 3 packs of 5
    expect(maxWholesalePacksForCell(prod, 'Синий', 'M', [])).toBe(3);

    // Select 1 pack of Белый M (below minPacks = 2)
    const subMin = summarizeWholesaleMatrix(prod, offer, [], {
      [matrixCellKey('Белый', 'M')]: 1,
    });
    expect(subMin.selectedPacks).toBe(1);
    expect(subMin.selectedPieces).toBe(5);
    expect(subMin.minPacksRemaining).toBe(1);
    expect(subMin.effectiveUnitPrice).toBe(1500);
    expect(subMin.totalPrice).toBe(7500);

    // Select 2 packs of Белый M + 2 packs of Синий M = 4 packs total -> hits 10% tier (1350 ₽/pc)
    const withTier = summarizeWholesaleMatrix(prod, offer, [], {
      [matrixCellKey('Белый', 'M')]: 2,
      [matrixCellKey('Синий', 'M')]: 2,
    });
    expect(withTier.selectedPacks).toBe(4);
    expect(withTier.selectedPieces).toBe(20);
    expect(withTier.minPacksRemaining).toBe(0);
    expect(withTier.effectiveUnitPrice).toBe(1350);
    expect(withTier.totalPrice).toBe(27000);
    expect(withTier.lines).toHaveLength(2);
  });

  test('subtracts stock already held in cart and counts cart packs toward minPacks', () => {
    const prod = makeProduct();
    const offer = wholesaleOfferOf(prod)!;
    const cartItems: CartItem[] = [
      {
        id: 'c1',
        product: prod,
        selectedColor: 'Белый',
        selectedSize: 'M',
        quantity: 5,
        priceKind: 'wholesale',
      },
    ];

    // 12 in stock - 5 in cart = 7 left -> 1 pack of 5 available
    expect(maxWholesalePacksForCell(prod, 'Белый', 'M', cartItems)).toBe(1);

    // Selecting 1 more pack in matrix + 1 pack already in cart meets minPacks = 2
    const summary = summarizeWholesaleMatrix(prod, offer, cartItems, {
      [matrixCellKey('Белый', 'M')]: 1,
    });
    expect(summary.minPacksRemaining).toBe(0);
  });
});

describe('maxSizePacksForCell and summarizePackMatrix', () => {
  test('calculates available size-packs per color and summarizes selection', () => {
    const pack = {
      id: 'sp-1',
      name: 'Ростовка M+L',
      sizes: [
        { size: 'M', qty: 2 },
        { size: 'L', qty: 2 },
      ],
      price: 5200,
    };
    const prod = makeProduct({
      sizePacks: [pack],
    });

    // Белый has M:12 (6 packs), L:4 (2 packs) -> bottleneck is L -> 2 packs
    expect(maxSizePacksForCell(prod, pack, 'Белый', [pack], [], {})).toBe(2);
    // Синий has M:15 (7 packs), L:10 (5 packs) -> bottleneck is L -> 5 packs
    expect(maxSizePacksForCell(prod, pack, 'Синий', [pack], [], {})).toBe(5);

    const summary = summarizePackMatrix(prod, [pack], [], {
      [matrixCellKey('Белый', 'sp-1')]: 2,
      [matrixCellKey('Синий', 'sp-1')]: 3,
    });
    expect(summary.selectedPacks).toBe(5);
    expect(summary.selectedPieces).toBe(20);
    expect(summary.totalPrice).toBe(5 * 5200);
    expect(summary.lines).toHaveLength(2);
  });
});
