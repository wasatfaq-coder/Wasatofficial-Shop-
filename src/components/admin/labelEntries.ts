import type { Product, ProductSKU } from '../../types';
import { compositionToMaterial, getProductFabricComposition } from '../../utils/productAttributes';
import type { LabelData } from '../../utils/labels';
import { articleCode, type BarcodeProblem } from '../../shared/barcode';
import { sizePackBarcode, sizePackLabelLine, sizePackPrice, sizePackTitle, type SizePack } from '../../shared/sizePacks';

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

/** Label data straight from the catalog: the product card and its variation */
export const labelData = (product: Product, sku: ProductSKU): LabelData => ({
  title: product.title,
  color: sku.color,
  size: sku.size,
  article: articleCode(product, sku.color) || sku.skuCode || '',
  // the card's fibres first; product.material is the same text saved from them
  composition: compositionToMaterial(getProductFabricComposition(product)) || (product.material ?? '').trim(),
  barcode: sku.barcode ?? '',
  price: product.price,
  oldPrice: product.originalPrice,
});

/** Label data of a pack colour: the pack's name as the article, its composition instead of the size, its own barcode */
export const packLabelData = (product: Product, pack: SizePack, color: string): LabelData => {
  const price = sizePackPrice(product, pack);
  return {
    title: product.title,
    color,
    size: '',
    article: sizePackTitle(pack),
    packLine: sizePackLabelLine(pack),
    composition: compositionToMaterial(getProductFabricComposition(product)) || (product.material ?? '').trim(),
    barcode: sizePackBarcode(pack, color),
    price: price ?? 0,
    noPrice: price === undefined,
  };
};

export type PrintItem = { target: SkuLabelTarget; product: Product; sku: ProductSKU };
export type PackPrintItem = { target: PackLabelTarget; product: Product; pack: SizePack; color: string };

/** A label to print: a variation or a pack colour, with the data drawn on it */
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
}

/** «Футболка · Синий / 48» or «Футболка · Ростовка 48–52, Синий» */
export const entryName = (e: LabelEntry) =>
  e.sku ? `${e.product.title} · ${e.sku.color} / ${e.sku.size}` : `${e.product.title} · ${sizePackTitle(e.pack!)}, ${e.data.color}`;
