/**
 * Stock journal (`stock_movements`): every change of stock is a document the admin reads in «Склад и SKU» →
 * «Журнал движений». The journal used to live in the browser of whoever changed the stock, so the owner never saw
 * write-offs by customer orders. Shared with Cloud Functions — no browser APIs.
 */
import type { CartItem, StockMovementLog } from '../types';
import { formatOrderDate } from './orderDate';

export const STOCK_MOVEMENTS_COLLECTION = 'stock_movements';

/** Id of the journal entry of an order line: one entry per line, so a repeated write cannot add a second one */
export function orderMovementId(orderId: string, lineIndex: number): string {
  return `${orderId}_${lineIndex}`;
}

/** Id of the entry returning an order line to stock on the buyer's cancellation: one per line, like the write-off */
export function orderReturnMovementId(orderId: string, lineIndex: number): string {
  return `${orderMovementId(orderId, lineIndex)}_return`;
}

/** Reason of a return entry; the rules require exactly this text */
export function orderReturnReason(orderId: string): string {
  return `Отмена заказа #${orderId}`;
}

/**
 * How much a cancelled order line gives back to stock: exactly what its write-off entry `{заказ}_{строка}` took, never
 * more than ordered. No entry — nothing was taken (every line but a preorder gets one since 02.10), so nothing comes
 * back: returning the ordered quantity turned a made-up order for 100 000 pieces into 100 000 pieces of stock the shop
 * does not have (check 04.10, finding 1).
 */
export function lineReturnQuantity(
  taken: Pick<StockMovementLog, 'changeQuantity'> | undefined,
  line: Pick<CartItem, 'quantity'>
): number {
  if (!taken) return 0;
  const quantity = -(Number(taken.changeQuantity) || 0);
  return Math.max(0, Math.min(quantity, Number(line.quantity) || 0));
}

/**
 * How much of an order line its write-off entry did not take: the stock was short when the buyer's browser wrote it
 * off — two buyers ordered the last piece, and the second order took 0 (check 04.10, finding 3). No entry — that is
 * «Товар не списан со склада», not a shortage: 0.
 */
export function lineShortfall(
  line: Pick<CartItem, 'quantity'>,
  taken: Pick<StockMovementLog, 'changeQuantity'> | undefined
): number {
  if (!taken) return 0;
  return Math.max(0, (Number(line.quantity) || 0) + (Number(taken.changeQuantity) || 0));
}

/**
 * Author of an order entry. Constant: the customer's name comes from the order form, so a fake order could sign
 * an entry «Администратор» (audit 02.10, finding 8); the order number in `reason` leads to the customer.
 */
export const ORDER_MOVEMENT_OPERATOR = 'Покупатель';

/** Journal entry of one order line; `changeQuantity` defaults to the ordered quantity taken in full */
export function orderLineMovement(
  orderId: string,
  line: CartItem,
  lineIndex: number,
  at: Date,
  skuCode = '',
  changeQuantity = -line.quantity
): StockMovementLog {
  return {
    id: orderMovementId(orderId, lineIndex),
    createdAt: at.toISOString(),
    date: formatOrderDate(at),
    type: 'order',
    orderId,
    lineIndex,
    productId: line.product.id,
    productTitle: String(line.product.title ?? '').slice(0, 200),
    skuCode: skuCode.slice(0, 80),
    color: String(line.selectedColor ?? '').slice(0, 60),
    size: String(line.selectedSize ?? '').slice(0, 30),
    changeQuantity,
    reason: `Заказ #${orderId}`,
    operator: ORDER_MOVEMENT_OPERATOR,
  };
}

/**
 * Journal entries of a new order placed by placeOrder: one per line taken from stock (preorder lines are not taken).
 * The browser writes its entries one by one together with the stock (deductOrderLineStock in firebaseSync.ts).
 */
export function orderStockMovements(
  order: { id: string; items: CartItem[] },
  at: Date,
  skuCodeOf: (line: CartItem) => string = () => ''
): StockMovementLog[] {
  const movements: StockMovementLog[] = [];
  order.items.forEach((line, lineIndex) => {
    if (line.isPreorder) return;
    movements.push(orderLineMovement(order.id, line, lineIndex, at, skuCodeOf(line)));
  });
  return movements;
}
