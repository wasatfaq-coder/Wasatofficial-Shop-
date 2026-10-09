/**
 * Badge style on product photos. Brand badges (Хит, Premium, Limited, Exclusive) are gold,
 * sale badges (Sale, -20%) use the danger tone, the rest (New, Eco, custom text) stay graphite.
 */
const GOLD = /хит|hit|premium|премиум|limited|exclusive|эксклюзив/i;
const SALE = /sale|скидк|распрод|^-?\d+\s*%/i;

export function photoBadgeClass(badge: string): string {
  if (GOLD.test(badge)) return 'neu-photo-badge-gold';
  if (SALE.test(badge.trim())) return 'neu-photo-badge-sale';
  return 'neu-photo-badge text-[#2D3A4E]';
}

/** A badge that only states a discount: «-15%», «−20 %» */
const PERCENT_BADGE = /^[-−–]\s*\d+\s*%$/;

/**
 * The struck-out old price, only when it is above the price: after «Курсы и наценка» or a manual change it may be
 * lower, and «4 800 ₽ ~~4 500 ₽~~» is not a discount (admin audit 09.10, finding 2)
 */
export function shownOldPrice(product: { price: number; originalPrice?: number }): number | null {
  const { price, originalPrice } = product;
  return typeof originalPrice === 'number' && originalPrice > price ? originalPrice : null;
}

/**
 * The badge a customer sees. A «-N%» badge is written once (the bulk discount) while the price follows the rate: it
 * shows the discount the prices give now, and no badge when there is none (admin audit 09.10, finding 3)
 */
export function shownBadge(product: { price: number; originalPrice?: number; badge?: string }): string | null {
  const badge = product.badge?.trim();
  if (!badge) return null;
  if (!PERCENT_BADGE.test(badge)) return badge;
  const old = shownOldPrice(product);
  if (old === null) return null;
  const percent = Math.round((1 - product.price / old) * 100);
  return percent > 0 ? `-${percent}%` : null;
}
