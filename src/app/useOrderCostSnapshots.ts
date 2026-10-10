import React from 'react';
import type { Order, Product } from '../types';
import { saveOrderCosts, subscribeToOrderCosts } from '../utils/firebaseSync';
import { buildOrderCostDoc, orderCostsWindowStart, ordersNeedingCostSnapshot, type OrderCostDoc } from '../utils/orderCosts';
import { currentCostMap } from '../utils/salesProfit';

/** New orders come a few snapshots in a row (the order, then its stock): they are written once they settle */
const SETTLE_MS = 2_000;

/**
 * The admin's session keeps the cost of each new order at the moment it sees it (`order_costs`, owner's decision 09.10):
 * «Аналитика» counts past net profit by it, not by today's purchase price. Without Cloud Functions nobody else can:
 * the buyer cannot read costs. Reads only the snapshots of recent orders; each order is tried once a session.
 */
export function useOrderCostSnapshots(isAdmin: boolean, orders: Order[], products: Product[], productsLoaded: boolean): void {
  const [have, setHave] = React.useState<Set<string> | null>(null);
  const tried = React.useRef(new Set<string>());

  React.useEffect(() => {
    if (!isAdmin) {
      setHave(null);
      return;
    }
    return subscribeToOrderCosts(orderCostsWindowStart(), (snapshots) => setHave(new Set(snapshots.keys())));
  }, [isAdmin]);

  React.useEffect(() => {
    if (!isAdmin || !productsLoaded || have === null) return;
    const costs = currentCostMap(products);
    // no cost read yet (or none set): a snapshot now would keep nothing
    if (costs.size === 0) return;
    const timer = window.setTimeout(() => {
      const now = new Date();
      const docs: OrderCostDoc[] = [];
      for (const order of ordersNeedingCostSnapshot(orders, have, tried.current, now)) {
        tried.current.add(order.id);
        try {
          const entry = buildOrderCostDoc(order, costs, now);
          if (entry) docs.push(entry);
        } catch (error) {
          // one broken order must not stop the snapshots of the others
          console.warn('Order cost snapshot skipped:', order.id, error);
        }
      }
      if (docs.length === 0) return;
      saveOrderCosts(docs).catch((error) => {
        // the report then counts these orders by today's cost («≈ — оценка»); the next session tries again
        console.error('Order cost snapshots were not saved:', error);
      });
    }, SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [isAdmin, productsLoaded, have, orders, products]);
}
