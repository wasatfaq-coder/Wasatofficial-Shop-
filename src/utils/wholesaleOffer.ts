/**
 * What the buyer is shown of a product's wholesale offer (stages 16–17 of docs/admin-wholesale-plan.md, part 2): the
 * wholesale price, the pack, the minimum and the volume-discount steps. Prices themselves are counted only by
 * `src/shared/wholesalePricing.ts`; this file only words them for the screens.
 */
import type { Product } from '../types';
import {
  hasWholesalePrice,
  saleChannelOf,
  minPacksOf,
  packSizeOf,
  readVolumeDiscount,
  sellsRetail,
  sellsWholesale,
  volumeDiscountedPrice,
  type VolumeDiscountKind,
  type VolumeDiscountTier,
  type WholesaleSettings,
} from '../shared/wholesalePricing';
import { pluralRu } from './pluralize';

type OfferProduct = Pick<Product, 'saleChannel' | 'wholesalePrice' | 'wholesalePackSize' | 'wholesaleMinPacks' | 'price'>;

export interface WholesaleStep {
  minPacks: number;
  /** One item's price on this step */
  unitPrice: number;
  /** «−10 %» or «−50 ₽ с шт.» */
  discount: string;
}

export interface WholesaleOffer {
  /** The wholesale price of one item before the volume discount */
  unitPrice: number;
  packSize: number;
  /** One pack at the wholesale price before the volume discount: `unitPrice` × `packSize` */
  packPrice: number;
  minPacks: number;
  /** The product is not sold by the item at its retail price */
  onlyWholesale: boolean;
  /** Counted per product (all its colours and sizes) or over all wholesale lines of the order */
  countBy: 'product' | 'order';
  steps: WholesaleStep[];
}

const rub = (value: number) => `${value.toLocaleString('ru-RU')} ₽`;

export function volumeDiscountLabel(tier: VolumeDiscountTier, kind: VolumeDiscountKind): string {
  return kind === 'fixed' ? `−${rub(tier.value)} с шт.` : `−${tier.value.toLocaleString('ru-RU')} %`;
}

/** The product's wholesale offer; null — the product is not sold wholesale */
export function wholesaleOfferOf(product: OfferProduct, settings?: WholesaleSettings | null): WholesaleOffer | null {
  if (!sellsWholesale(product)) return null;
  const unitPrice = product.wholesalePrice as number;
  const scale = readVolumeDiscount(settings?.volumeDiscount);
  const packSize = packSizeOf(product);
  return {
    unitPrice,
    packSize,
    packPrice: unitPrice * packSize,
    minPacks: minPacksOf(product),
    onlyWholesale: !sellsRetail(product),
    countBy: scale?.countBy ?? 'product',
    steps: (scale?.tiers ?? []).map((tier) => ({
      minPacks: tier.minPacks,
      unitPrice: volumeDiscountedPrice(unitPrice, tier, scale!.kind),
      discount: volumeDiscountLabel(tier, scale!.kind),
    })),
  };
}

/**
 * The price a buyer compares products by (catalog filter, sorting, card): the retail price, or the wholesale one of a
 * product sold only wholesale — its retail price is not shown anywhere
 */
export function buyerPrice(product: OfferProduct): number {
  return !sellsRetail(product) && hasWholesalePrice(product) ? (product.wholesalePrice as number) : product.price;
}

/** «4 уп. по 5 шт.» for a pack of several items, «4 шт.» for a pack of one */
export function packsText(quantity: number, packSize: number): string {
  if (packSize <= 1) return `${quantity} шт.`;
  return `${Math.floor(quantity / packSize)} уп. по ${packSize} шт.`;
}

/** «Упаковка — 5 шт. · от 2 уп.»: what the buyer has to order; the minimum is left out when it is one pack */
export function packTermsText(offer: Pick<WholesaleOffer, 'packSize' | 'minPacks'>): string {
  const parts: string[] = [];
  if (offer.packSize > 1) parts.push(`Упаковка — ${offer.packSize} шт.`);
  if (offer.minPacks > 1) {
    parts.push(
      offer.packSize > 1
        ? `от ${offer.minPacks} уп.`
        : `от ${offer.minPacks} ${pluralRu(offer.minPacks, ['штуки', 'штук', 'штук'])}`
    );
  }
  return parts.join(' · ');
}

/** «от 5 уп.» / «от 5 шт.» of a volume step */
export function stepThresholdText(minPacks: number, packSize: number): string {
  return packSize > 1 ? `от ${minPacks} уп.` : `от ${minPacks} шт.`;
}

/**
 * «Опт» in the admin's «Товары»: products offered wholesale, and «Только оптом» ones without a wholesale price yet —
 * those are sold at retail until the owner sets it, so the owner should see them there
 */
export function isWholesaleListed(product: OfferProduct): boolean {
  return sellsWholesale(product) || saleChannelOf(product) === 'wholesale';
}
