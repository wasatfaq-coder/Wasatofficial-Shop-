// Каталог помнит сортировку и «Показать ещё» после возврата с товара; новый поиск, фильтр или сортировка — с первых 8
// (аудит 07.10, находка 22)
import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_CATALOG_VIEW,
  PRODUCTS_PAGE_SIZE,
  catalogListKey,
  shownProductCount,
  withNextPortion,
  type CatalogView,
} from '../../src/utils/productListing';

const filters = { minPrice: 0, maxPrice: Number.POSITIVE_INFINITY, selectedSizes: [] as string[], onlyInStock: false };
const shirts = catalogListKey('shirts', '', filters, 'popular');

describe('portions of the catalog', () => {
  test('a fresh catalog shows the first portion', () => {
    expect(shownProductCount(DEFAULT_CATALOG_VIEW, shirts)).toBe(PRODUCTS_PAGE_SIZE);
  });

  test('«Показать ещё» twice, a product and back: the same 24 (before: the screen forgot them, 8 again)', () => {
    const view = withNextPortion(withNextPortion(DEFAULT_CATALOG_VIEW, shirts), shirts);
    expect(shownProductCount(view, shirts)).toBe(3 * PRODUCTS_PAGE_SIZE);
    // the screen is shown again with the same category, search, filters and sort: the same key
    expect(shownProductCount(view, catalogListKey('shirts', '', { ...filters }, 'popular'))).toBe(3 * PRODUCTS_PAGE_SIZE);
  });

  test('another category, search, filter or sort starts from the first portion', () => {
    const view = withNextPortion(DEFAULT_CATALOG_VIEW, shirts);
    expect(shownProductCount(view, catalogListKey('trousers', '', filters, 'popular'))).toBe(PRODUCTS_PAGE_SIZE);
    expect(shownProductCount(view, catalogListKey('shirts', 'лён', filters, 'popular'))).toBe(PRODUCTS_PAGE_SIZE);
    expect(shownProductCount(view, catalogListKey('shirts', '', { ...filters, onlyInStock: true }, 'popular'))).toBe(PRODUCTS_PAGE_SIZE);
    expect(shownProductCount(view, catalogListKey('shirts', '', filters, 'price-asc'))).toBe(PRODUCTS_PAGE_SIZE);
  });

  test('the search filters without case and edge spaces: «Лён » is the same list as «лён»', () => {
    expect(catalogListKey('all', 'Лён ', filters, 'popular')).toBe(catalogListKey('all', 'лён', filters, 'popular'));
  });

  test('«Показать ещё» on a new list: the second portion of it, not of the old one', () => {
    const view: CatalogView = { sortBy: 'popular', listKey: shirts, shownCount: 5 * PRODUCTS_PAGE_SIZE };
    const sorted = catalogListKey('shirts', '', filters, 'price-desc');
    const next = withNextPortion({ ...view, sortBy: 'price-desc' }, sorted);
    expect(shownProductCount(next, sorted)).toBe(2 * PRODUCTS_PAGE_SIZE);
    expect(next.sortBy).toBe('price-desc');
  });
});
