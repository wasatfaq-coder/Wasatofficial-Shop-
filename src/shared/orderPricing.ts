/**
 * Order pricing shared by the storefront (checkout UI) and Cloud Functions
 * (server-side order validation). Keep this module free of browser APIs.
 */
import type { AppliedPromoInfo, CartItem, DeliveryMethod, PromoCode, StorefrontSettings } from '../types';
import { linePrice } from './orderLine';

/** Delivery method id used by the one-click "quick order" flow (no fee, no promo). */
export const QUICK_ORDER_DELIVERY_ID = 'quick-order';
/**
 * A 1-click order has no delivery choice: the manager agrees delivery and payment with the buyer (the offer, 3.2).
 * Before the UX audit 03.10 (finding 22) it was saved as «Экспресс курьер (1 клик)» and showed buyers an express
 * courier the shop may not have.
 */
export const QUICK_ORDER_DELIVERY_TITLE = 'Заказ в 1 клик';

/** A 1-click order by its delivery title, the old «Экспресс курьер (1 клик)» too */
export function isQuickOrderDelivery(deliveryMethod?: string): boolean {
  return /1 клик/i.test(deliveryMethod ?? '');
}

export interface PricingLine {
  productId: string;
  category?: string;
  price: number;
  quantity: number;
}

/** The promo fields pricing needs; satisfied by both PromoCode and AppliedPromoInfo. */
export type PromoForPricing = Pick<
  PromoCode,
  'discountPercent' | 'discountType' | 'discountValue' | 'applicableCategories' | 'applicableProductIds' | 'minOrderAmount'
>;

type DeliverySettings = Pick<StorefrontSettings, 'freeDeliveryThreshold' | 'isExpressEnabled'>;

/** A storefront cart line as the pricing sees it */
export function toPricingLine(item: Pick<CartItem, 'product' | 'quantity' | 'unitPrice'>): PricingLine {
  return {
    productId: item.product.id,
    category: item.product.category,
    price: linePrice(item),
    quantity: item.quantity,
  };
}

export function calcSubtotal(lines: PricingLine[]): number {
  return lines.reduce((acc, line) => acc + line.price * line.quantity, 0);
}

function isRestricted(promo: Partial<PromoForPricing>): boolean {
  return Boolean(promo.applicableProductIds?.length || promo.applicableCategories?.length);
}

/** Subtotal of the lines a promo applies to (all lines for unrestricted promos). */
function calcEligibleSubtotal(lines: PricingLine[], promo: Partial<PromoForPricing>): number {
  if (promo.applicableProductIds && promo.applicableProductIds.length > 0) {
    return calcSubtotal(lines.filter((l) => promo.applicableProductIds!.includes(l.productId)));
  }
  if (promo.applicableCategories && promo.applicableCategories.length > 0) {
    return calcSubtotal(lines.filter((l) => l.category && promo.applicableCategories!.includes(l.category)));
  }
  return calcSubtotal(lines);
}

/**
 * Fixed (₽) or percent. Old codes without `discountType` are read the way the admin shows them:
 * a value above 100 is rubles (AdminPromoConstructorTab), otherwise percent.
 */
export function promoDiscountKind(promo: Partial<PromoForPricing>): 'fixed' | 'percent' {
  if (promo.discountType) return promo.discountType;
  return !promo.discountPercent && (promo.discountValue ?? 0) > 100 ? 'fixed' : 'percent';
}

/**
 * Discount for the current cart. Zero below the promo's minimum order amount: the cart may shrink after
 * the promo was applied, and the total must not keep the discount then.
 */
export function calcPromoDiscount(lines: PricingLine[], promo: Partial<PromoForPricing> | null | undefined): number {
  if (!promo) return 0;
  if (promo.minOrderAmount && calcSubtotal(lines) < promo.minOrderAmount) return 0;
  const base = calcEligibleSubtotal(lines, promo);
  if (promoDiscountKind(promo) === 'fixed' && promo.discountValue) {
    return Math.min(base, promo.discountValue);
  }
  if (promo.discountPercent) {
    return Math.round((base * promo.discountPercent) / 100);
  }
  if (promo.discountValue) {
    return Math.round((base * promo.discountValue) / 100);
  }
  return 0;
}

const MSK_OFFSET_MS = 3 * 60 * 60 * 1000; // Москва — UTC+3 круглый год
const RU_MONTHS = ['январ', 'феврал', 'март', 'апрел', 'ма', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'];

/**
 * The last day of a promo as «YYYY-MM-DD», or null for «без срока» and text that is not a date.
 * Reads the ISO date the admin form stores and the older text values («31 августа 2026 г.», «31.08.2026»).
 */
export function promoExpiryDate(expiresAt: string | undefined | null): string | null {
  const value = (expiresAt || '').trim().toLowerCase();
  if (!value) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dotted = value.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (dotted) return `${dotted[3]}-${pad(Number(dotted[2]))}-${pad(Number(dotted[1]))}`;
  const text = value.match(/^(\d{1,2})\s+([а-яё]+)\s+(\d{4})/);
  if (text) {
    // «мая»/«май» — самая короткая основа, поэтому ищем самое длинное совпадение
    let month = -1;
    RU_MONTHS.forEach((stem, i) => {
      if (text[2].startsWith(stem) && (month < 0 || stem.length > RU_MONTHS[month].length)) month = i;
    });
    if (month >= 0) return `${text[3]}-${pad(month + 1)}-${pad(Number(text[1]))}`;
  }
  return null;
}

/** End of the promo's last day by Moscow time (the code works through that day), or null without a date. */
export function promoExpiryTime(expiresAt: string | undefined | null): number | null {
  const date = promoExpiryDate(expiresAt);
  if (!date) return null;
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d + 1) - MSK_OFFSET_MS - 1;
}

/** The code's last day (Moscow time) has passed; a code without a date never expires */
export function isPromoExpired(promo: Pick<PromoCode, 'expiresAt'>, now: number = Date.now()): boolean {
  const end = promoExpiryTime(promo.expiresAt);
  return end !== null && now > end;
}

/** «до 31.08.2026» for the customer and admin lists; text that is not a date is shown as written */
export function formatPromoExpiry(expiresAt: string | undefined | null): string {
  const date = promoExpiryDate(expiresAt);
  if (!date) return (expiresAt || '').trim();
  const [y, m, d] = date.split('-');
  return `${d}.${m}.${y}`;
}

/** A code that can be used now: active, not expired, limit not reached (the cart is checked separately) */
export function isPromoUsable(promo: PromoCode, now: number = Date.now()): boolean {
  return validatePromo({ ...promo, minOrderAmount: 0 }, [], now) === null;
}

/**
 * Shown to customers in the «Промокоды» list. Partner, single-use batch and support-chat codes are personal:
 * they are hidden unless the admin marked the code public.
 */
export function isPromoListed(promo: PromoCode, now: number = Date.now()): boolean {
  const personal = Boolean(promo.isReferral || promo.isBatch || promo.id.startsWith('promo-care-'));
  return (promo.isPublic ?? !personal) && isPromoUsable(promo, now);
}

/**
 * Validates that a promo can be applied to the given cart.
 * Returns a user-facing error message, or null when the promo is valid.
 */
export function validatePromo(promo: PromoCode, lines: PricingLine[], now: number = Date.now()): string | null {
  if (!promo.active) {
    return 'Срок действия промокода приостановлен или завершен';
  }
  if (promo.usageLimit && (promo.usedCount || 0) >= promo.usageLimit) {
    return 'Лимит использований данного промокода исчерпан';
  }
  const expiry = promoExpiryTime(promo.expiresAt);
  if (expiry !== null && expiry < now) {
    return `Срок действия промокода ${promo.code} истек`;
  }
  const subtotal = calcSubtotal(lines);
  if (promo.minOrderAmount && subtotal < promo.minOrderAmount) {
    return `Минимальная сумма заказа для промокода ${promo.code}: ${promo.minOrderAmount.toLocaleString('ru-RU')} ₽ (в корзине: ${subtotal.toLocaleString('ru-RU')} ₽)`;
  }
  if (lines.length > 0 && isRestricted(promo) && calcEligibleSubtotal(lines, promo) === 0) {
    return promo.applicableProductIds?.length
      ? `Промокод ${promo.code} действует только на выбранные товары`
      : `Промокод ${promo.code} действует только на выбранные категории (рубашки, пиджаки и др.)`;
  }
  return null;
}

/** A code with a usage limit (one-time, «первые N»): `usageLimit` above 0, as the rules count it (`withinUsageLimit`) */
export function isLimitedPromo(promo: Pick<PromoCode, 'usageLimit'>): boolean {
  return typeof promo.usageLimit === 'number' && promo.usageLimit > 0;
}

export const PROMO_NEEDS_GOOGLE_TEXT = 'Код действует только после входа через Google';

/**
 * A code with a limit is applied only by a buyer signed in with Google (owner's decision 08.10, audit 07.10, finding 9):
 * anonymous sign-ins are free, and fake orders from them burned the limit. Codes without a limit work for guests.
 * Returns the reason for the buyer, or null
 */
export function promoSignInProblem(promo: Pick<PromoCode, 'usageLimit'>, signedInWithGoogle: boolean): string | null {
  return isLimitedPromo(promo) && !signedInWithGoogle ? PROMO_NEEDS_GOOGLE_TEXT : null;
}

/** The applied promo as the cart keeps it: the code's values from «Промокоды» */
export function appliedPromoFrom(promo: PromoCode): AppliedPromoInfo {
  return {
    code: promo.code,
    discountPercent: promo.discountPercent,
    discountType: promoDiscountKind(promo),
    discountValue: promo.discountValue !== undefined ? promo.discountValue : promo.discountPercent,
    minOrderAmount: promo.minOrderAmount,
    isReferral: promo.isReferral,
    partnerName: promo.partnerName,
    partnerCommissionPercent: promo.partnerCommissionPercent,
    applicableCategories: promo.applicableCategories,
    applicableProductIds: promo.applicableProductIds,
  };
}

/**
 * What an applied promo gives now: the owner may change the discount after the buyer applied the code, and the cart
 * and the order count by «Промокоды», not by the values at the moment of applying (check 04.10, finding 11).
 * null — the code is no longer in «Промокоды».
 */
export function currentAppliedPromo(applied: Pick<AppliedPromoInfo, 'code'>, promos: PromoCode[]): AppliedPromoInfo | null {
  const code = applied.code.toUpperCase();
  const promo = promos.find((p) => p.code.toUpperCase() === code);
  return promo ? appliedPromoFrom(promo) : null;
}

/**
 * Active delivery methods with the effective price for the given subtotal. The price is the method's own
 * («Доставка и ПВЗ»); free from the method's threshold, or from the storefront one when the method has none.
 */
export function getAvailableDeliveryMethods(
  methods: DeliveryMethod[],
  settings: Partial<DeliverySettings> | null | undefined,
  subtotal: number
): DeliveryMethod[] {
  // No threshold in «Витрина» — no free delivery from a sum (an invented 5 000 ₽ used to zero the fee)
  const freeThreshold = settings?.freeDeliveryThreshold ?? 0;
  const isExpressAllowed = settings?.isExpressEnabled !== false;

  return methods
    .filter((d) => d.isActive !== false)
    .map((d) => {
      const threshold = d.freeThreshold !== undefined ? d.freeThreshold : freeThreshold;
      return { ...d, price: threshold > 0 && subtotal >= threshold ? 0 : d.price };
    })
    .filter((d) => !(d.id === 'express' && !isExpressAllowed));
}

export interface OrderTotals {
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
}

export function calcOrderTotals(
  lines: PricingLine[],
  promo: Partial<PromoForPricing> | null | undefined,
  deliveryFee: number
): OrderTotals {
  const subtotal = calcSubtotal(lines);
  const discount = calcPromoDiscount(lines, promo);
  return {
    subtotal,
    discount,
    deliveryFee,
    total: Math.max(0, subtotal - discount + deliveryFee),
  };
}
