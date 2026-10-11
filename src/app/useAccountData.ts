import React, { useState } from 'react';
import type { User } from 'firebase/auth';
import type { Order, UserProfile } from '../types';
import { subscribeToOrders, subscribeToOwnUserProfile, subscribeToProductCosts, type ProductCostEntry } from '../utils/firebaseSync';
import { setLoadFailed } from '../utils/loadFailures';
import { loadGuestOrders } from './guestOrders';

type AuthState = { authLoading: boolean; isAdmin: boolean; currentUser: User | null };

/**
 * Orders and customer profiles are private (see firestore.rules): admins see every order (and the cost prices of
 * `product_costs`), signed-in customers only their own, guests keep their orders in this browser only. The profile is
 * always the visitor's own: the admin reads customers' profiles only while «Клиенты» are open (useCustomerProfiles,
 * docs/orders-scale-plan.md, stage 1).
 */
export function useAccountData({ authLoading, isAdmin, currentUser }: AuthState) {
  const [ownProfiles, setOwnProfiles] = useState<UserProfile[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  // Admin only: cost prices and purchases in a currency from `product_costs` (a product is readable by every visitor)
  const [productCosts, setProductCosts] = useState<Record<string, ProductCostEntry>>({});

  React.useEffect(() => {
    if (authLoading) return;
    // a failed subscription is said on «Заказы» and «Мои заказы» (finding 15), not shown as «заказов нет»
    const ordersFailed = () => setLoadFailed('orders', true);
    setLoadFailed('orders', false);

    if (isAdmin && currentUser) {
      const unsubOrders = subscribeToOrders((loadedOrders) => {
        setOrders(loadedOrders);
        setLoadFailed('orders', false);
      }, ordersFailed);
      const unsubProfile = subscribeToOwnUserProfile(currentUser.uid, setOwnProfiles);
      const unsubCosts = subscribeToProductCosts(setProductCosts);
      return () => {
        unsubOrders();
        unsubProfile();
        unsubCosts();
        setProductCosts({});
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
  }, [authLoading, isAdmin, currentUser]);

  return { ownProfiles, orders, setOrders, productCosts, setProductCosts };
}
