/**
 * Admin sections: ids and types only (no UI). The profile screen imports these eagerly; the admin UI itself
 * (AdminNav, the sections, Base UI, charts) is a separate chunk loaded when the panel opens.
 */
export const ADMIN_TAB_IDS = [
  // «Сегодня»: what waits for the owner; the panel opens on it
  'today',
  // «Ещё»: the list of the sections that are not on the bottom bar (phone)
  'more',
  'analytics',
  'orders',
  'customers',
  'support',
  'products',
  'categories',
  'inventory',
  'rates',
  'wholesale',
  'promos',
  'banners',
  'delivery',
  'payment',
  'faq',
  'legal',
  'storefront',
] as const;

export type AdminTab = (typeof ADMIN_TAB_IDS)[number];

export function isAdminTab(value: unknown): value is AdminTab {
  return typeof value === 'string' && (ADMIN_TAB_IDS as readonly string[]).includes(value);
}

/** What waits for the admin: a number on the section and its group */
export type AdminNavCounts = Partial<Record<AdminTab, { value: number; label: string }>>;
