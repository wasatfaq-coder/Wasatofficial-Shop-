// Опт у покупателя: что показывают страница товара, карточка, корзина и фильтры (этапы 16–17 плана админки, часть 2)
import { describe, expect, test } from 'bun:test';
import {
  buyerPrice,
  isWholesaleListed,
  packTermsText,
  packsText,
  stepThresholdText,
  wholesaleOfferOf,
} from '../../src/utils/wholesaleOffer';
import { DEFAULT_FILTER_STATE, matchesCatalogFilters } from '../../src/components/CatalogAdvancedFilter';
import type { Product } from '../../src/types';

const product = (extra: Partial<Product> = {}): Product =>
  ({
    id: 'p1',
    title: 'Футболка',
    price: 2000,
    category: 'tshirts',
    sizes: ['M'],
    colors: [{ name: 'Синий', hex: '#2C4A6B' }],
    images: [],
    material: 'Хлопок',
    inStock: true,
    skus: [{ id: 's1', color: 'Синий', size: 'M', stock: 10 }],
    ...extra,
  }) as Product;

const percentScale = {
  volumeDiscount: { kind: 'percent' as const, countBy: 'product' as const, tiers: [{ minPacks: 5, value: 10 }, { minPacks: 10, value: 20 }] },
};

describe('the wholesale offer on the product page', () => {
  test('no wholesale price or «только в розницу» — no offer', () => {
    expect(wholesaleOfferOf(product())).toBeNull();
    expect(wholesaleOfferOf(product({ saleChannel: 'retail', wholesalePrice: 1500 }))).toBeNull();
  });

  test('the price, the pack, the minimum and the steps with their prices', () => {
    const offer = wholesaleOfferOf(product({ wholesalePrice: 1500, wholesalePackSize: 5, wholesaleMinPacks: 2 }), percentScale);
    expect(offer).toEqual({
      unitPrice: 1500,
      packSize: 5,
      minPacks: 2,
      onlyWholesale: false,
      countBy: 'product',
      steps: [
        { minPacks: 5, unitPrice: 1350, discount: '−10 %' },
        { minPacks: 10, unitPrice: 1200, discount: '−20 %' },
      ],
    });
  });

  test('roubles off one item; «по всему заказу»; «только оптом»', () => {
    const offer = wholesaleOfferOf(product({ saleChannel: 'wholesale', wholesalePrice: 1500 }), {
      volumeDiscount: { kind: 'fixed', countBy: 'order', tiers: [{ minPacks: 3, value: 100 }] },
    });
    expect(offer?.onlyWholesale).toBe(true);
    expect(offer?.countBy).toBe('order');
    expect(offer?.steps).toEqual([{ minPacks: 3, unitPrice: 1400, discount: '−100 ₽ с шт.' }]);
  });

  test('the terms are worded by the pack', () => {
    expect(packTermsText({ packSize: 5, minPacks: 2 })).toBe('Упаковка — 5 шт. · от 2 уп.');
    expect(packTermsText({ packSize: 1, minPacks: 10 })).toBe('от 10 штук');
    expect(packTermsText({ packSize: 1, minPacks: 1 })).toBe('');
    expect(packsText(20, 5)).toBe('4 уп. по 5 шт.');
    expect(packsText(3, 1)).toBe('3 шт.');
    expect(stepThresholdText(5, 6)).toBe('от 5 уп.');
    expect(stepThresholdText(5, 1)).toBe('от 5 шт.');
  });
});

describe('the price a buyer compares by', () => {
  test('«только оптом» — its wholesale price: the retail one is not sold', () => {
    expect(buyerPrice(product({ saleChannel: 'wholesale', wholesalePrice: 1500 }))).toBe(1500);
    expect(buyerPrice(product({ wholesalePrice: 1500 }))).toBe(2000);
    // «только оптом» without a wholesale price stays on retail sale
    expect(buyerPrice(product({ saleChannel: 'wholesale' }))).toBe(2000);
  });
});

describe('«Оптом» in the catalog filter and «Опт» in the admin\'s «Товары»', () => {
  test('the catalog shows only products that can be bought wholesale', () => {
    const f = { ...DEFAULT_FILTER_STATE, onlyWholesale: true };
    expect(matchesCatalogFilters(product({ wholesalePrice: 1500 }), 'all', f)).toBe(true);
    expect(matchesCatalogFilters(product(), 'all', f)).toBe(false);
    expect(matchesCatalogFilters(product({ saleChannel: 'retail', wholesalePrice: 1500 }), 'all', f)).toBe(false);
  });

  test('the price filter of the catalog takes the price the buyer sees', () => {
    const f = { ...DEFAULT_FILTER_STATE, maxPrice: 1600 };
    expect(matchesCatalogFilters(product({ saleChannel: 'wholesale', wholesalePrice: 1500 }), 'all', f)).toBe(true);
    expect(matchesCatalogFilters(product({ wholesalePrice: 1500 }), 'all', f)).toBe(false);
  });

  test('the admin also sees «только оптом» without a wholesale price yet', () => {
    expect(isWholesaleListed(product({ wholesalePrice: 1500 }))).toBe(true);
    expect(isWholesaleListed(product({ saleChannel: 'wholesale' }))).toBe(true);
    expect(isWholesaleListed(product())).toBe(false);
  });
});
