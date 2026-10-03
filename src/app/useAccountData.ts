import React, { useState } from 'react';
import type { User } from 'firebase/auth';
import type { Order, UserProfile } from '../types';
import { subscribeToOrders, subscribeToOwnUserProfile, subscribeToProductCosts, subscribeToUsers } from '../utils/firebaseSync';
import { loadGuestOrders } from './guestOrders';

type AuthState = { authLoading: boolean; isAdmin: boolean; currentUser: User | null };

/**
 * Orders and customer profiles are private (see firestore.rules): admins see everything (and the cost prices of
 * `product_costs`), signed-in customers only their own data, guests keep their orders in this browser only.
 */
export function useAccountData({ authLoading, isAdmin, currentUser }: AuthState) {
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  // Admin only: cost prices from `product_costs` (a product document is readable by every visitor)
  const [productCosts, setProductCosts] = useState<Record<string, number>>({});

  React.useEffect(() => {
    if (authLoading) return;

    if (isAdmin) {
      const unsubOrders = subscribeToOrders((loadedOrders) => setOrders(loadedOrders));
      const unsubUsers = subscribeToUsers((loadedUsers) => setAllUsers(loadedUsers));
      const unsubCosts = subscribeToProductCosts(setProductCosts);
      return () => {
        unsubOrders();
        unsubUsers();
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
        },
        undefined,
        currentUser.uid
      );
      const unsubUsers = subscribeToOwnUserProfile(currentUser.uid, (loadedUsers) =>
        setAllUsers(loadedUsers)
      );
      return () => {
        unsubOrders();
        unsubUsers();
      };
    }

    setOrders(loadGuestOrders());
    setAllUsers([]);
  }, [authLoading, isAdmin, currentUser]);

  return { allUsers, orders, setOrders, productCosts, setProductCosts };
}
