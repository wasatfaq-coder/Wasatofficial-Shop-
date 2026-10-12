import React from 'react';
import type { Order } from '../types';
import { hasCurrentProductIds, orderProductIds } from '../shared/orderLine';
import { saveOrderProductIds } from '../utils/firebaseSync';
import { isUntouchedSincePlaced } from '../utils/orderPriceCheck';

/** New orders come a few snapshots in a row (the order, then its stock): they are checked once they settle */
const SETTLE_MS = 2_000;

/**
 * The admin's session writes `productIds` into orders without it (placed before 12.10 or from an open tab of the
 * previous site) and into orders whose list does not match their lines (owner's decision 12.10): the review rule checks
 * «Покупка подтверждена» by it. Only this field changes; each order is tried once a session.
 * An order nobody has changed since it was placed is left alone: its `updatedAt` is the moment the price check leans on
 * (`isUntouchedSincePlaced`), and a review needs a received order anyway — it gets the list after its first status change.
 */
export function useOrderProductIds(isAdmin: boolean, orders: Order[]): void {
  const tried = React.useRef(new Set<string>());

  React.useEffect(() => {
    if (!isAdmin) return;
    const timer = window.setTimeout(() => {
      const entries = orders
        .filter((order) => !tried.current.has(order.id) && order.items.length > 0 && !isUntouchedSincePlaced(order)
          && !hasCurrentProductIds(order))
        .map((order) => ({ orderId: order.id, productIds: orderProductIds(order.items) }));
      if (entries.length === 0) return;
      entries.forEach((entry) => tried.current.add(entry.orderId));
      saveOrderProductIds(entries).catch((error) => {
        // without the list a review of these orders loses «Покупка подтверждена»; the next session tries again
        console.error('Order product ids were not saved:', error);
      });
    }, SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [isAdmin, orders]);
}
