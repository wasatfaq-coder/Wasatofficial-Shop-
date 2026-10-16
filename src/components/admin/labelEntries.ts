import type { Product, ProductSKU, StorefrontSettings } from '../../types';
import { compositionToMaterial, getProductFabricComposition } from '../../utils/productAttributes';
import type { LabelData } from '../../utils/labels';
import { articleCode, type BarcodeProblem } from '../../shared/barcode';
import {
  sizePackBarcode,
  sizePackLabelLine,
  sizePackPieces,
  sizePackPrice,
  sizePackTitle,
  sizePacksAvailable,
  type SizePack,
} from '../../shared/sizePacks';
import { hasWholesalePrice, sellsRetail } from '../../shared/wholesalePricing';
import { buyerPrice, packTermsText, stepThresholdText, wholesaleOfferOf } from '../../utils/wholesaleOffer';

/**
 * What «Этикетки и штрихкоды» prints (`AdminLabelGenerator`): a variation or a colour of a size pack, and the data drawn
 * on its label — only from the catalog. Apart from the window, to keep it under 800 lines.
 */

/** One variation (colour × size) of a product */
export interface SkuLabelTarget {
  productId: string;
  skuId: string;
  packId?: undefined;
  color?: undefined;
}

/** One colour of a size pack («ростовка») of a product: its own label with the pack's barcode */
export interface PackLabelTarget {
  productId: string;
  packId: string;
  color: string;
  skuId?: undefined;
}

export type LabelTarget = SkuLabelTarget | PackLabelTarget;

export const PROBLEM_TEXT: Record<BarcodeProblem, string> = {
  missing: 'нет штрихкода',
  duplicate: 'штрихкод повторяется',
  invalid: 'штрихкод с ошибкой',
  mismatch: 'у размеров разные штрихкоды',
};

/** Label data straight from the catalog: the product card, its variation, and its wholesale offer */
export const labelData = (product: Product, sku: ProductSKU, settings?: StorefrontSettings): LabelData => {
  const offer = wholesaleOfferOf(product, settings?.wholesale);
  const effectivePrice = buyerPrice(product);
  const retailPrice = sellsRetail(product) && product.price > 0 ? product.price : undefined;
  const wholesaleUnitPrice =
    offer?.unitPrice ?? (hasWholesalePrice(product) ? (product.wholesalePrice as number) : undefined);
  const packSize = offer && offer.packSize > 1 ? offer.packSize : undefined;
  const packPrice = offer && offer.packSize > 1 ? offer.packPrice : undefined;
  const terms = offer ? packTermsText(offer) : '';

  return {
    title: product.title,
    color: sku.color,
    size: sku.size,
    article: articleCode(product, sku.color) || sku.skuCode || '',
    // the card's fibres first; product.material is the same text saved from them
    composition: compositionToMaterial(getProductFabricComposition(product)) || (product.material ?? '').trim(),
    barcode: sku.barcode ?? '',
    price: effectivePrice,
    oldPrice: product.originalPrice,
    retailPrice,
    wholesaleUnitPrice,
    packPieces: packSize,
    packPrice,
    packTitle: packSize ? `Упаковка ${packSize} шт.` : undefined,
    wholesaleTerms: terms || undefined,
    wholesaleSteps: offer?.steps.map((step) => ({
      threshold: stepThresholdText(step.minPacks, offer.packSize),
      price: step.unitPrice,
      discount: step.discount,
    })),
    noPrice: effectivePrice <= 0,
  };
};

/**
 * Label data of a pack colour: keeps the true product article code (`MS-JK03-BLU`), sets `packTitle` and `packSizes`
 * for the size-run breakdown, and calculates both unit price and full pack price.
 */
export const packLabelData = (
  product: Product,
  pack: SizePack,
  color: string,
  settings?: StorefrontSettings
): LabelData => {
  const totalPackPrice = sizePackPrice(product, pack);
  const pieces = sizePackPieces(pack);
  const title = sizePackTitle(pack);
  const realArticle = articleCode(product, color);
  const offer = wholesaleOfferOf(product, settings?.wholesale);
  const unitWhPrice =
    totalPackPrice !== undefined && pieces > 0
      ? Math.round(totalPackPrice / pieces)
      : hasWholesalePrice(product)
      ? (product.wholesalePrice as number)
      : undefined;
  const retailUnit = sellsRetail(product) && product.price > 0 ? product.price : undefined;
  const proportionalOldPrice =
    product.originalPrice &&
    product.originalPrice > (retailUnit ?? unitWhPrice ?? 0) &&
    pieces > 0 &&
    totalPackPrice !== undefined &&
    product.originalPrice * pieces > totalPackPrice
      ? Math.round(product.originalPrice * pieces)
      : undefined;

  return {
    title: product.title,
    color,
    size: '',
    article: realArticle || title,
    packTitle: title,
    packLine: sizePackLabelLine(pack),
    packSizes: pack.sizes.map((l) => ({ size: l.size, qty: l.qty })),
    packPieces: pieces,
    composition: compositionToMaterial(getProductFabricComposition(product)) || (product.material ?? '').trim(),
    barcode: sizePackBarcode(pack, color),
    price: totalPackPrice ?? 0,
    oldPrice: proportionalOldPrice,
    retailPrice: retailUnit,
    wholesaleUnitPrice: unitWhPrice,
    packPrice: totalPackPrice,
    wholesaleTerms: offer ? packTermsText(offer) : undefined,
    wholesaleSteps: offer?.steps.map((step) => ({
      threshold: stepThresholdText(step.minPacks, offer.packSize),
      price: step.unitPrice,
      discount: step.discount,
    })),
    noPrice: totalPackPrice === undefined,
  };
};

export type PrintItem = { target: SkuLabelTarget; product: Product; sku: ProductSKU };
export type PackPrintItem = { target: PackLabelTarget; product: Product; pack: SizePack; color: string };

/** A label to print: a variation or a pack colour, with the data drawn on it and its available physical stock */
export interface LabelEntry {
  key: string;
  /** Labels of one article are the same without a size; a pack colour is an article of its own */
  articleKey: string;
  product: Product;
  /** Set for a variation */
  sku?: ProductSKU;
  /** Set for a pack colour */
  pack?: SizePack;
  data: LabelData;
  /** Physical stock in pieces (for SKU) or whole available packs (for SizePack) */
  stockCount: number;
}

/** Build the stock count for a variation or a pack colour */
export const entryStockCount = (product: Product, sku?: ProductSKU, pack?: SizePack, color?: string): number => {
  if (sku) return Math.max(0, Math.floor(Number(sku.stock) || 0));
  if (pack && color) return Math.max(0, sizePacksAvailable(product, pack, color));
  return 0;
};

/** «Футболка · Синий / 48» or «Футболка · Ростовка 48–52, Синий» */
export const entryName = (e: LabelEntry) =>
  e.sku ? `${e.product.title} · ${e.sku.color} / ${e.sku.size}` : `${e.product.title} · ${sizePackTitle(e.pack!)}, ${e.data.color}`;
