import type { Order, Product } from '../types';

/**
 * «Цены не совпадают с каталогом» (audit 02.10, stage 5 without Blaze): an order from the browser is written by the
 * buyer, and its prices nobody but `placeOrder` checks — a made-up order could cost 1 ₽. The owner confirms the payment
 * by hand, so before «Подтвердить оплату» the order is compared with today's catalog and with its own sum.
 * A price could also change after the order — the text asks to check, it does not accuse.
 */
export function orderPriceIssues(order: Order, products: Product[]): string[] {
  // the server already checked its prices; a paid, refunded or cancelled order is past the moment of checking
  if (order.placedVia === 'server' || order.isCancelled) return [];
  if (order.paymentStatus === 'paid' || order.paymentStatus === 'refunded') return [];

  const issues: string[] = [];
  const byId = new Map(products.map((p) => [p.id, p]));
  let subtotal = 0;
  for (const item of order.items ?? []) {
    const price = Number(item.product?.price) || 0;
    const quantity = Number(item.quantity) || 0;
    subtotal += price * quantity;
    const catalog = item.product?.id ? byId.get(item.product.id) : undefined;
    if (catalog && catalog.price !== price) {
      issues.push(
        `«${catalog.title}»: в заказе ${price.toLocaleString('ru-RU')} ₽, в каталоге ${catalog.price.toLocaleString('ru-RU')} ₽`
      );
    }
    if (quantity <= 0) issues.push(`«${item.product?.title ?? 'строка'}»: количество ${quantity}`);
  }
  const expected = subtotal + (Number(order.deliveryFee) || 0) - (Number(order.discountAmount) || 0);
  // old orders did not store their delivery fee: their sum is not checked
  if (order.deliveryFee !== undefined && Math.abs(expected - (Number(order.totalPrice) || 0)) > 1) {
    issues.push(
      `итог ${(Number(order.totalPrice) || 0).toLocaleString('ru-RU')} ₽ не сходится со строками заказа: ${expected.toLocaleString('ru-RU')} ₽`
    );
  }
  if ((Number(order.discountAmount) || 0) > 0 && !order.promoCode) issues.push('скидка без промокода');
  return issues;
}
