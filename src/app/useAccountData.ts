import React, { useState } from 'react';
import type { User } from 'firebase/auth';
import type { Order, UserProfile } from '../types';
import {
  orderFromIndexRow,
  sortOrders,
  subscribeToDeletedOrderIds,
  subscribeToOrders,
  subscribeToOrdersIndex,
  subscribeToOwnUserProfile,
  subscribeToProductCosts,
  type ProductCostEntry,
  type StoredOrders,
} from '../utils/firebaseSync';
import { setLoadFailed } from '../utils/loadFailures';
import { canReadOrdersIndex, mergeOrdersIndex, readOrdersIndex, type OrderIndexRow } from '../utils/ordersIndex';
import { loadGuestOrders } from './guestOrders';
import { useOrderProductIds } from './useOrderProductIds';
import { useOrdersIndexSync, type OrdersIndexMeta } from './useOrdersIndexSync';

type AuthState = { authLoading: boolean; isAdmin: boolean; currentUser: User | null };
type OrdersSource = { mode: 'index'; sinceMs: number } | { mode: 'full' };

/** Normalized Order per OrderIndexRow reference: unchanged index rows are not parsed again on every delta snapshot */
const rowOrderCache = new WeakMap<OrderIndexRow, Order>();
function cachedOrderFromRow(row: OrderIndexRow): Order {
  let cached = rowOrderCache.get(row);
  if (!cached) {
    cached = orderFromIndexRow(row);
    rowOrderCache.set(row, cached);
  }
  return cached;
}

/**
 * Orders and customer profiles are private (see firestore.rules): admins see every order (from `orders_index` plus
 * orders changed since `syncedUpTo` — docs/orders-scale-plan.md, stage 5; and the cost prices of `product_costs`),
 * signed-in customers only their own, guests keep their orders in this browser only. The profile is always the
 * visitor's own: the admin reads customers' profiles only while «Клиенты» are open (useCustomerProfiles, stage 1).
 */
export function useAccountData({ authLoading, isAdmin, currentUser }: AuthState) {
  const [ownProfiles, setOwnProfiles] = useState<UserProfile[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  // Admin only: cost prices and purchases in a currency from `product_costs` (a product is readable by every visitor)
  const [productCosts, setProductCosts] = useState<Record<string, ProductCostEntry>>({});
  // Admin only: the orders index parts and rows (docs/orders-scale-plan.md, stages 4–5)
  const [ordersSource, setOrdersSource] = useState<OrdersSource | null>(null);
  const [indexRows, setIndexRows] = useState<OrderIndexRow[]>([]);
  const [indexMeta, setIndexMeta] = useState<OrdersIndexMeta | null>(null);
  const [changedStored, setChangedStored] = useState<StoredOrders | null>(null);
  const [removedOrderIds, setRemovedOrderIds] = useState<string[]>([]);

  // 1. Admin: subscribe to `orders_index` first; once the first snapshot arrives, lock the session's `ordersSource`
  // (`index` when a valid index with `syncedUpTo > 0` exists, else `full` so the first visit reads all orders and writes it)
  React.useEffect(() => {
    if (authLoading || !isAdmin || !currentUser) {
      setOrdersSource(null);
      setIndexRows([]);
      setIndexMeta(null);
      setChangedStored(null);
      setRemovedOrderIds([]);
      return;
    }
    if (!canReadOrdersIndex()) {
      setOrdersSource({ mode: 'full' });
      setIndexMeta({ parts: 0, hash: '' });
      return;
    }
    let alive = true;
    let latest = 0;
    const unsubIndex = subscribeToOrdersIndex(
      async (parts) => {
        const seq = ++latest;
        const parsed = parts.length > 0 ? await readOrdersIndex(parts).catch(() => null) : null;
        if (!alive || seq !== latest) return;
        setIndexMeta({ parts: parts.length, hash: parsed ? parsed.hash : '' });
        if (parsed && parsed.syncedUpTo > 0) {
          setIndexRows(parsed.rows);
          setOrdersSource((prev) => prev ?? { mode: 'index', sinceMs: parsed.syncedUpTo });
        } else {
          if (parts.length > 0 && !parsed) console.warn('Orders index is unreadable: reading every order');
          setOrdersSource((prev) => prev ?? { mode: 'full' });
        }
      },
      () => {
        if (!alive) return;
        setIndexMeta({ parts: 0, hash: '' });
        setOrdersSource((prev) => prev ?? { mode: 'full' });
      }
    );
    const unsubDeleted = subscribeToDeletedOrderIds((orderId) => {
      setRemovedOrderIds((prev) => (prev.includes(orderId) ? prev : [...prev, orderId]));
    });
    return () => {
      alive = false;
      unsubIndex();
      unsubDeleted();
    };
  }, [authLoading, isAdmin, currentUser]);

  // 2. Admin: profile + costs immediately; orders subscription starts once `ordersSource` is chosen
  React.useEffect(() => {
    if (authLoading) return;
    if (isAdmin && currentUser) {
      const unsubProfile = subscribeToOwnUserProfile(currentUser.uid, setOwnProfiles);
      const unsubCosts = subscribeToProductCosts(setProductCosts);
      return () => {
        unsubProfile();
        unsubCosts();
        setProductCosts({});
      };
    }
  }, [authLoading, isAdmin, currentUser]);

  React.useEffect(() => {
    if (authLoading) return;
    // a failed subscription is said on «Заказы» and «Мои заказы» (finding 15), not shown as «заказов нет»
    const ordersFailed = () => setLoadFailed('orders', true);
    setLoadFailed('orders', false);

    if (isAdmin && currentUser) {
      if (!ordersSource) return;
      const sinceMs = ordersSource.mode === 'index' ? ordersSource.sinceMs : undefined;
      const unsubOrders = subscribeToOrders(
        (loadedOrders, stored) => {
          if (ordersSource.mode === 'full') {
            setOrders(loadedOrders);
          }
          if (stored) {
            if (stored.removedIds.length > 0) {
              setRemovedOrderIds((prev) => [...new Set([...prev, ...stored.removedIds])]);
            }
            setChangedStored(stored);
          }
          setLoadFailed('orders', false);
        },
        ordersFailed,
        undefined,
        sinceMs
      );
      return () => {
        unsubOrders();
      };
    }

    if (currentUser) {
      // plus guest orders of this browser that the account does not hold (placed before the move or without a sign-in
      // of the guest, finding 26): they stay visible after signing in
      const unsubOrders = subscribeToOrders(
        (loadedOrders) => {
          const own = new Set(loadedOrders.map((o) => o.id));
          setOrders([...loadedOrders, ...loadGuestOrders().filter((o) => !own.has(o.id))]);
          setLoadFailed('orders', false);
        },
        ordersFailed,
        currentUser.uid
      );
      const unsubUsers = subscribeToOwnUserProfile(currentUser.uid, setOwnProfiles);
      return () => {
        unsubOrders();
        unsubUsers();
      };
    }

    setOrders(loadGuestOrders());
    setOwnProfiles([]);
  }, [authLoading, isAdmin, currentUser, ordersSource]);

  // 3. Admin in 'index' mode: merge index rows + changed orders minus deleted ids
  const mergedStored = React.useMemo<StoredOrders | null>(() => {
    if (!isAdmin || !currentUser || !ordersSource || !changedStored) return null;
    if (ordersSource.mode === 'full') return changedStored;
    const rows = mergeOrdersIndex(indexRows, changedStored.rows, removedOrderIds);
    return { rows, removedIds: [], pending: changedStored.pending };
  }, [isAdmin, currentUser, ordersSource, indexRows, changedStored, removedOrderIds]);

  React.useEffect(() => {
    if (!isAdmin || !currentUser || ordersSource?.mode !== 'index' || !mergedStored) return;
    setOrders(sortOrders(mergedStored.rows.map(cachedOrderFromRow)));
  }, [isAdmin, currentUser, ordersSource, mergedStored]);

  useOrdersIndexSync(isAdmin ? mergedStored : null, isAdmin ? indexMeta : undefined);
  useOrderProductIds(isAdmin, orders);

  return { ownProfiles, orders, setOrders, productCosts, setProductCosts };
}
