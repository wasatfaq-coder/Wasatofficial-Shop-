import type { DeliveryMethod, Order, Product, PromoCode, StorefrontSettings } from '../types';
import { calcPromoDiscount, getAvailableDeliveryMethods, isQuickOrderDelivery, type PricingLine } from '../shared/orderPricing';
import { linePrice } from '../shared/orderLine';

/** What the order is compared with besides the catalog: the store's codes, delivery and payment methods */
export interface OrderCheckContext {
  promos?: PromoCode[];
  deliveryMethods?: DeliveryMethod[];
  settings?: Partial<Pick<StorefrontSettings, 'paymentMethods' | 'freeDeliveryThreshold' | 'isExpressEnabled'>>;
}

/** A 1-click order and an old one without a choice: the manager agrees payment with the buyer */
const AGREED_BY_MANAGER = 'Уточнит менеджер';

const rub = (value: number) => `${value.toLocaleString('ru-RU')} ₽`;

/**
 * «Цены не совпадают с каталогом» (audit 02.10, stage 5 without Blaze): an order from the browser is written by the
 * buyer, and its prices nobody but `placeOrder` checks — a made-up order could cost 1 ₽. The owner confirms the payment
 * by hand, so before «Подтвердить оплату» the order is compared with today's catalog and with its own sum, and — with
 * `shop` — its discount with the promo code, its delivery fee with the delivery method and its payment method with
 * «Оплата» (check 04.10, finding 2: a made-up discount, a missing fee or «при получении» passed unnoticed).
 * A price could also change after the order — the text asks to check, it does not accuse.
 */
export function orderPriceIssues(order: Order, products: Product[], shop: OrderCheckContext = {}): string[] {
  // the server already checked its prices; a paid, refunded or cancelled order is past the moment of checking
  if (order.placedVia === 'server' || order.isCancelled) return [];
  if (order.paymentStatus === 'paid' || order.paymentStatus === 'refunded') return [];

  const issues: string[] = [];
  const byId = new Map(products.map((p) => [p.id, p]));
  const lines: PricingLine[] = [];
  for (const item of order.items ?? []) {
    const price = linePrice(item);
    const quantity = Number(item.quantity) || 0;
    const catalog = item.product?.id ? byId.get(item.product.id) : undefined;
    // the category for the promo is the catalog's: the line's copy is written by the buyer
    lines.push({ productId: item.product?.id ?? '', category: catalog?.category ?? item.product?.category, price, quantity });
    if (catalog && catalog.price !== price) {
      issues.push(`«${catalog.title}»: в заказе ${rub(price)}, в каталоге ${rub(catalog.price)}`);
    }
    if (quantity <= 0) issues.push(`«${item.product?.title ?? 'строка'}»: количество ${quantity}`);
  }
  const subtotal = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const deliveryFee = Number(order.deliveryFee) || 0;
  const discount = Number(order.discountAmount) || 0;

  // a 1-click order is written without its fee: no fee is 0 ₽, not «not checked»
  const expected = subtotal + deliveryFee - discount;
  if (Math.abs(expected - (Number(order.totalPrice) || 0)) > 1) {
    issues.push(`итог ${rub(Number(order.totalPrice) || 0)} не сходится со строками заказа: ${rub(expected)}`);
  }

  if (discount > 0 && !order.promoCode) issues.push('скидка без промокода');
  if (discount > 0 && order.promoCode && shop.promos) {
    const code = order.promoCode.toUpperCase();
    const promo = shop.promos.find((p) => p.code.toUpperCase() === code);
    if (!promo) {
      issues.push(`промокода ${order.promoCode} нет в «Промокодах»`);
    } else {
      const allowed = calcPromoDiscount(lines, promo);
      if (discount > allowed + 1) issues.push(`скидка ${rub(discount)} больше, чем даёт ${promo.code}: ${rub(allowed)}`);
    }
  }

  if (shop.deliveryMethods && !isQuickOrderDelivery(order.deliveryMethod)) {
    const method = getAvailableDeliveryMethods(shop.deliveryMethods, shop.settings, subtotal).find(
      (m) => m.title === order.deliveryMethod
    );
    if (method && deliveryFee < (method.price || 0)) {
      issues.push(`доставка ${rub(deliveryFee)}, а «${method.title}» стоит ${rub(method.price || 0)}`);
    }
  }

  const paymentMethods = (shop.settings?.paymentMethods ?? []).filter((m) => m.title.trim());
  const payment = (order.paymentMethod ?? '').trim();
  if (paymentMethods.length > 0 && payment && payment !== AGREED_BY_MANAGER) {
    // the checkout writes the title, «при получении» methods as «Наличные (при получении)» (CheckoutScreen)
    const known = paymentMethods.some((m) => {
      const title = m.title.trim();
      return payment === title || payment === `${title} (при получении)`;
    });
    if (!known) issues.push(`способа оплаты «${payment}» нет в «Оплате»`);
  }
  return issues;
}
