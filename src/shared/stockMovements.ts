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

/**
 * Journal entries of a new order: one per line taken from stock (preorder lines are not taken).
 * The rules let a customer create exactly these entries — id, product and quantity must match the saved order.
 */
export function orderStockMovements(
  order: { id: string; items: CartItem[]; customerName?: string },
  at: Date,
  skuCodeOf: (line: CartItem) => string = () => ''
): StockMovementLog[] {
  const movements: StockMovementLog[] = [];
  order.items.forEach((line, lineIndex) => {
    if (line.isPreorder) return;
    movements.push({
      id: orderMovementId(order.id, lineIndex),
      createdAt: at.toISOString(),
      date: formatOrderDate(at),
      type: 'order',
      orderId: order.id,
      lineIndex,
      productId: line.product.id,
      productTitle: String(line.product.title ?? '').slice(0, 200),
      skuCode: skuCodeOf(line).slice(0, 80),
      color: String(line.selectedColor ?? '').slice(0, 60),
      size: String(line.selectedSize ?? '').slice(0, 30),
      changeQuantity: -line.quantity,
      reason: `Заказ #${order.id}`,
      operator: (order.customerName || 'Покупатель').slice(0, 80),
    });
  });
  return movements;
}
