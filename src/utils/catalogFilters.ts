/**
 * The catalog filters as data and the one check of a product against them (`matchesCatalogFilters`): the catalog list,
 * the «Показать N товаров» counter and the tests use it. No React here: `functions/test` checks it without JSX
 */
import type { Product } from '../types';
import { isHiddenFromSale, isProductInStock } from './inventory';
import { productRatingValue } from './productRating';
import { sizeMatches } from './sizeScale';
import { sellsWholesale } from '../shared/wholesalePricing';
import { buyerPrice } from './wholesaleOffer';
import { shownOldPrice } from './productBadge';

export interface FilterState {
  minPrice: number;
  maxPrice: number;
  selectedSizes: string[];
  selectedMaterials: string[];
  onlyInStock: boolean;
  onlyNew: boolean;
  onlyDiscount: boolean;
  /** «Оптом»: only products sold wholesale (stages 16–17 of docs/admin-wholesale-plan.md) */
  onlyWholesale: boolean;
  minRating: number;
}

/** No upper price bound: products of any price are shown */
export const NO_MAX_PRICE = Number.POSITIVE_INFINITY;

export const DEFAULT_FILTER_STATE: FilterState = {
  minPrice: 0,
  maxPrice: NO_MAX_PRICE,
  selectedSizes: [],
  selectedMaterials: [],
  onlyInStock: false,
  onlyNew: false,
  onlyDiscount: false,
  onlyWholesale: false,
  minRating: 0,
};

export const hasPriceFilter = (f: FilterState) => f.minPrice > 0 || Number.isFinite(f.maxPrice);

/** Catalog filters (without the search text); the catalog list and the «Показать N товаров» counter use the same check */
export function matchesCatalogFilters(p: Product, category: string, f: FilterState): boolean {
  return (
    (category === 'all' || p.category === category) &&
    buyerPrice(p) >= f.minPrice &&
    buyerPrice(p) <= f.maxPrice &&
    matchesMaterialFilter(p.material, f.selectedMaterials) &&
    (f.selectedSizes.length === 0 ||
      f.selectedSizes.some((sel) => p.sizes.some((sz) => sizeMatches(sz, sel) && isProductAvailableInSize(p, sz)))) &&
    (!f.onlyInStock || isProductInStock(p)) &&
    (!f.onlyNew || Boolean(p.isNew)) &&
    (!f.onlyDiscount || shownOldPrice(p) !== null) &&
    (!f.onlyWholesale || sellsWholesale(p)) &&
    productRatingValue(p) >= f.minRating
  );
}

export const MATERIAL_CATEGORIES = [
  { id: 'cotton', name: 'Хлопок / Пике', keywords: ['хлопок', 'cotton', 'пике'] },
  { id: 'linen', name: 'Лен', keywords: ['лён', 'лен', 'linen'] },
  { id: 'wool', name: 'Шерсть / Кашемир', keywords: ['шерсть', 'wool', 'кашемир', 'cashmere'] },
  { id: 'denim', name: 'Деним', keywords: ['деним', 'джинс', 'эластан'] },
  { id: 'blend', name: 'Смесовые ткани', keywords: ['полиэстер', 'вискоза', 'смесов', 'polyester'] },
];

export const matchesMaterialFilter = (productMaterial: string, selectedMaterialIds: string[]): boolean => {
  if (selectedMaterialIds.length === 0) return true;
  const matLower = (productMaterial || '').toLowerCase();
  return selectedMaterialIds.some((matId) => {
    const foundCat = MATERIAL_CATEGORIES.find((c) => c.id === matId);
    if (!foundCat) {
      return matLower.includes(matId.toLowerCase());
    }
    return foundCat.keywords.some((kw) => matLower.includes(kw));
  });
};

export const isProductAvailableInSize = (product: Product, size: string): boolean => {
  if (product.inStock === false || isHiddenFromSale(product)) return false;
  if (!product.sizes.includes(size)) return false;
  if (product.skus && product.skus.length > 0) {
    const matchingSkus = product.skus.filter((sku) => sku.size === size);
    if (matchingSkus.length > 0) {
      return matchingSkus.some((sku) => sku.stock > 0);
    }
  }
  return true;
};
