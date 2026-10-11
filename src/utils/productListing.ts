/**
 * How many products are shown at once: «Популярное» on the home page (the rest behind «Смотреть все») and one portion
 * of the catalog (the next ones behind «Показать ещё»). The owner's choice: 8.
 */
export const PRODUCTS_PAGE_SIZE = 8;

export type CatalogSort = 'popular' | 'price-asc' | 'price-desc' | 'newest';

/**
 * The catalog list as the customer left it: the sort and the portions opened with «Показать ещё». Kept by App, not by
 * the catalog screen, so «Назад» from a product returns to the same list and its scroll (audit 07.10, finding 22)
 */
export interface CatalogView {
  sortBy: CatalogSort;
  /** The list the portions were opened for (`catalogListKey`): another search, filter or sort starts from the first */
  listKey: string;
  shownCount: number;
}

export const DEFAULT_CATALOG_VIEW: CatalogView = { sortBy: 'popular', listKey: '', shownCount: PRODUCTS_PAGE_SIZE };

/** One list of the catalog: the category, the search as it filters (case and edge spaces aside), the filters, the sort */
export function catalogListKey(category: string, search: string, filters: object, sortBy: CatalogSort): string {
  return JSON.stringify([category, search.toLowerCase().trim(), filters, sortBy]);
}

/** Products shown: the portions opened for this very list, else the first portion */
export function shownProductCount(view: CatalogView, listKey: string): number {
  return view.listKey === listKey ? Math.max(view.shownCount, PRODUCTS_PAGE_SIZE) : PRODUCTS_PAGE_SIZE;
}

/** «Показать ещё»: one more portion of this list */
export function withNextPortion(view: CatalogView, listKey: string): CatalogView {
  return { ...view, listKey, shownCount: shownProductCount(view, listKey) + PRODUCTS_PAGE_SIZE };
}
