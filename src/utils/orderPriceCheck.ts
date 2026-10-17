import type { DeliveryMethod, Order, Product, PromoCode, StorefrontSettings } from '../types';
import { calcPromoDiscount, getAvailableDeliveryMethods, isQuickOrderDelivery, type PricingLine } from '../shared/orderPricing';
import { linePrice } from '../shared/orderLine';
import { orderTimestamp } from '../shared/orderDate';
import { pricesAtOrderTime, wholesalePricesAtOrderTime } from './priceHistory';
import { isBrokenPackLine, isWholesaleLine, priceCartLines, sellsWholesale } from '../shared/wholesalePricing';
import { groupOrderLines, isPackLine, packGroupCompositionText, soldPack } from '../shared/packLines';
import { sizePackPrice } from '../shared/sizePacks';

/** What the order is compared with besides the catalog: the store's codes, delivery and payment methods */
export interface OrderCheckContext {
  promos?: PromoCode[];
  deliveryMethods?: DeliveryMethod[];
  settings?: Partial<Pick<StorefrontSettings, 'paymentMethods' | 'freeDeliveryThreshold' | 'isExpressEnabled' | 'wholesale' | 'brokenPackDiscount'>>;
}

/** A 1-click order and an old one without a choice: the manager agrees payment with the buyer */
const AGREED_BY_MANAGER = 'Уточнит менеджер';

const rub = (value: number) => `${value.toLocaleString('ru-RU')} ₽`;

/** The server writes `updatedAt` with every write of an order; the buyer's clock may differ this much from it */
const SERVER_CLOCK_SLACK_MS = 10 * 60 * 1000;

/**
 * Nobody has changed the order since it was placed: still «Принят», one entry of the history, no payment or cancellation.
 * Its server `updatedAt` is then the moment it was written, and the price check leans on it — so a write that only adds
 * a field (`productIds` by the admin's session) must leave such an order alone (review 12.10)
 */
export function isUntouchedSincePlaced(
  order: Pick<Order, 'status' | 'statusLog' | 'paymentLog' | 'cancelledAt' | 'paymentReceipt'>
): boolean {
  return order.status === 'accepted' && (order.statusLog?.length ?? 0) <= 1 && !order.paymentLog?.length
    && !order.cancelledAt && !order.paymentReceipt;
}

/**
 * The moment the order's prices are checked at. `createdAt` is written by the buyer's browser, and an order dated back
 * would pass with a lower price the product had weeks ago; while nobody has changed the order since it was placed, its
 * server `updatedAt` is the moment it was written, and the order is not older than that (review of finding 1)
 */
function checkedOrderTime(order: Order): number | null {
  const created = orderTimestamp(order);
  if (created === null || !isUntouchedSincePlaced(order) || typeof order.updatedAt !== 'number') return created;
  return Math.max(created, order.updatedAt - SERVER_CLOCK_SLACK_MS);
}

/**
 * «Цены не совпадают с каталогом» (audit 02.10, stage 5 without Blaze): an order from the browser is written by the
 * buyer, and its prices nobody but `placeOrder` checks — a made-up order could cost 1 ₽. The owner confirms the payment
 * by hand, so before «Подтвердить оплату» the order is compared with the catalog's prices at the time of the order
 * (`priceHistory` and `wholesalePriceHistory`) and with its own sum, and — with
 * `shop` — its discount with the promo code, its delivery fee with the delivery method and its payment method with
 * «Оплата» (check 04.10, finding 2: a made-up discount, a missing fee or «при получении» passed unnoticed).
 * A price could also change after the order — the text asks to check, it does not accuse.
 */
export function orderPriceIssues(order: Order, products: Product[], shop: OrderCheckContext = {}): string[] {
  // the server already checked its prices; a paid, refunded or cancelled order is past the moment of checking. An
  // adjusted order is still checked: the buyer's own lines stay in it (review 16.10, finding 6)
  if (order.placedVia === 'server' || order.isCancelled) return [];
  if (order.paymentStatus === 'paid' || order.paymentStatus === 'refunded') return [];

  const issues: string[] = [];
  const byId = new Map(products.map((p) => [p.id, p]));
  const orderTime = checkedOrderTime(order);
  const lines: PricingLine[] = [];
  const items = order.items ?? [];
  // the broken pack discount is a storefront field next to «Опт» (as in the checkout and placeOrder)
  const wholesaleSettings = shop.settings?.brokenPackDiscount
    ? { ...shop.settings.wholesale, brokenPackDiscount: shop.settings.brokenPackDiscount }
    : shop.settings?.wholesale;
  const expectedWholesale = priceCartLines(
    items.map((item) => {
      const catalog = item.product?.id ? byId.get(item.product.id) : undefined;
      return catalog ? { ...item, product: catalog } : item;
    }),
    wholesaleSettings
  );
  items.forEach((item, i) => {
    const price = linePrice(item);
    const quantity = Number(item.quantity) || 0;
    const catalog = item.product?.id ? byId.get(item.product.id) : undefined;
    const wholesale = isWholesaleLine(item);
    // a broken pack line: wholesale minus the broken pack discount, no promo (review 16.10, finding 2)
    const broken = isBrokenPackLine(item);
    // the category for the promo is the catalog's: the line's copy is written by the buyer
    lines.push({
      productId: item.product?.id ?? '',
      category: catalog?.category ?? item.product?.category,
      price,
      quantity,
      ...(wholesale ? { wholesale: true } : {}),
      ...(broken ? { broken: true } : {}),
    });
    // a size pack is checked whole below: its lines carry the pack's price split per item
    if (isPackLine(item)) {
      if (quantity <= 0) issues.push(`«${item.product?.title ?? 'строка'}»: количество ${quantity}`);
      return;
    }
    if (wholesale || broken) {
      if (catalog && !sellsWholesale(catalog)) {
        issues.push(`«${catalog.title}»: в заказе оптовая цена ${rub(price)}, а товар оптом не продаётся`);
      } else if (catalog) {
        const bases = wholesalePricesAtOrderTime(catalog, orderTime);
        const allowed =
          bases.length > 0
            ? Array.from(
                new Set(
                  bases.map((wp) => {
                    const priced = priceCartLines(
                      items.map((it) => {
                        const cat = it.product?.id ? byId.get(it.product.id) : undefined;
                        if (!cat) return it;
                        return { ...it, product: cat.id === catalog.id ? { ...cat, wholesalePrice: wp } : cat };
                      }),
                      wholesaleSettings
                    );
                    return linePrice(priced[i]);
                  })
                )
              )
            : [linePrice(expectedWholesale[i])];
        if (!allowed.includes(price)) {
          const kind = broken ? 'разбитая упаковка' : 'опт';
          issues.push(`«${catalog.title}»: в заказе ${kind} ${rub(price)}, в каталоге ${allowed.map(rub).join(' или ')}`);
        }
      }
      if (quantity <= 0) issues.push(`«${item.product?.title ?? 'строка'}»: количество ${quantity}`);
      return;
    }
    // the price in the catalog when the order was placed: «Курсы и наценка» may have changed it since (admin audit
    // 09.10, finding 1)
    const then = catalog ? pricesAtOrderTime(catalog, orderTime) : [];
    if (catalog && !then.includes(price)) {
      issues.push(`«${catalog.title}»: в заказе ${rub(price)}, в каталоге ${then.map(rub).join(' или ')}`);
    }
    if (quantity <= 0) issues.push(`«${item.product?.title ?? 'строка'}»: количество ${quantity}`);
  });
  // a size pack (stage 20): the price of one pack (including wholesale/retail price history when the pack derives its
  // price from per-unit price) and its composition as the catalog sells them
  for (const group of groupOrderLines(items)) {
    if (group.kind !== 'pack') continue;
    const catalog = group.item.product?.id ? byId.get(group.item.product.id) : undefined;
    if (!catalog) continue;
    const name = `«${catalog.title}», ${group.title}`;
    const pack = soldPack(catalog, group.item.packId, String(group.item.selectedColor ?? ''));
    if (!pack) {
      issues.push(`${name}: такой ростовки в этом цвете в каталоге нет`);
      continue;
    }
    const allowedPackPrices = Array.from(
      new Set(
        [
          ...wholesalePricesAtOrderTime(catalog, orderTime).map((wp) => sizePackPrice({ wholesalePrice: wp }, pack)),
          sizePackPrice(catalog, pack),
        ].filter((p): p is number => typeof p === 'number')
      )
    );
    if (allowedPackPrices.length > 0 && !allowedPackPrices.includes(group.packPrice)) {
      issues.push(`${name}: в заказе ${rub(group.packPrice)} за упаковку, в каталоге ${allowedPackPrices.map(rub).join(' или ')}`);
    }
    if (packGroupCompositionText(group.sizes) !== packGroupCompositionText(pack.sizes)) {
      issues.push(`${name}: в заказе состав ${packGroupCompositionText(group.sizes)}, в каталоге ${packGroupCompositionText(pack.sizes)}`);
    }
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
