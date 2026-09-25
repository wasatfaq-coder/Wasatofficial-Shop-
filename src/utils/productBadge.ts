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
