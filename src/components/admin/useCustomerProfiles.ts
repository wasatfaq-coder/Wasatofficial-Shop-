import { useEffect, useState } from 'react';
import type { UserProfile } from '../../types';
import { subscribeToUsers } from '../../utils/firebaseSync';

/**
 * Customers' profiles with the manager's notes — only while «Клиенты» are open (docs/orders-scale-plan.md, stage 1):
 * every sign-in of the owner read them, ≈ 480 documents at half a year, though nothing else needs them.
 * `loaded` — the first answer of the database came.
 */
export function useCustomerProfiles(): { users: UserProfile[]; loaded: boolean } {
  const [users, setUsers] = useState<UserProfile[] | null>(null);
  // a refused read leaves the cards built from orders (console.warn in subscribeToUsers)
  useEffect(() => subscribeToUsers(setUsers, () => setUsers(NO_PROFILES)), []);
  return { users: users ?? NO_PROFILES, loaded: users !== null };
}

const NO_PROFILES: UserProfile[] = [];
