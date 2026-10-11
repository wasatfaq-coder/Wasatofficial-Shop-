import type { FreeDeliveryOffer } from '../shared/orderPricing';

/** Up to this many method titles are named, the rest — «и ещё N» */
const NAMED_METHODS = 2;

/**
 * Which methods the free-delivery promise is about: '' when every method the customer can choose becomes free
 * from the same sum, otherwise «Курьер», «Курьер, Почта» or «Курьер, Почта и ещё 2». The sum itself and the
 * methods come only from freeDeliveryOffer (src/shared/orderPricing.ts), the same thresholds the fee uses.
 */
export function freeDeliveryMethodsText(offer: FreeDeliveryOffer): string {
  if (offer.forAllMethods) return '';
  const named = offer.methodTitles.slice(0, NAMED_METHODS).join(', ');
  const rest = offer.methodTitles.length - NAMED_METHODS;
  return rest > 0 ? `${named} и ещё ${rest}` : named;
}
