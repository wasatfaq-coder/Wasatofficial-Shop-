import React from 'react';
import { buildOrdersIndex, isWholeOrdersIndex, ordersIndexParts, type OrdersIndexPart } from '../utils/ordersIndex';
import { saveOrdersIndex, subscribeToOrdersIndex, type StoredOrders } from '../utils/firebaseSync';

/** A status change writes the order and its stock in a few snapshots in a row: the index is written once they settle */
const SETTLE_MS = 2_000;

/**
 * The admin's session keeps the orders index (docs/orders-scale-plan.md, stage 4) in step with the orders: after an
 * order is placed, changed or deleted, by the owner or by a customer. No index yet, another format or a restore — it is
 * built from all orders. Without Cloud Functions nobody else can write it; the admin reads it from stage 5. Nothing is
 * written while the stored index already matches or a write of this browser is not confirmed yet.
 *
 * `stored` — the admin's orders as stored (subscribeToOrders), null until they come.
 */
export function useOrdersIndexSync(stored: StoredOrders | null) {
  const [index, setIndex] = React.useState<{ parts: number; hash: string } | null>(null);
  const running = React.useRef(false);
  const enabled = stored !== null;

  React.useEffect(() => {
    if (!enabled) return;
    const unsub = subscribeToOrdersIndex((parts: OrdersIndexPart[]) =>
      setIndex({ parts: parts.length, hash: isWholeOrdersIndex(parts) ? parts[0].hash : '' })
    );
    return () => {
      unsub();
      setIndex(null);
    };
  }, [enabled]);

  React.useEffect(() => {
    if (!stored || stored.pending || !index) return;
    // Built only after the snapshots settle: building serializes and hashes every order, and one status change brings
    // several snapshots in a row — building on each of them repeated that work for nothing
    const timer = window.setTimeout(() => {
      if (running.current) return;
      const built = buildOrdersIndex(stored.rows);
      if (built.hash === index.hash) return;
      running.current = true;
      void ordersIndexParts(built.rows, built.hash, built.syncedUpTo)
        .then((parts) => saveOrdersIndex(parts, index.parts))
        .catch((err) => console.error('Orders index was not saved:', err))
        .finally(() => {
          running.current = false;
        });
    }, SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [stored, index]);
}
