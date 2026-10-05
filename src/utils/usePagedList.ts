import { useState } from 'react';

/** Cards of a long admin list (orders, customers) shown at first and added by «Показать ещё» */
export const ADMIN_PAGE_SIZE = 20;

/**
 * Long admin lists whose cards are heavy (docs/orders-scale-plan.md, stage 1): the first `pageSize` items, more on
 * «Показать ещё». Filters and search work on the whole list; a new `resetKey` (search, filter, sort) starts again from
 * the first page. Replaces drawing every card after the first paint, which froze «Клиенты» for ≈ 18 s at 1 800 orders.
 */
export function usePagedList<T>(items: T[], resetKey: string, pageSize = ADMIN_PAGE_SIZE) {
  const [count, setCount] = useState(pageSize);
  const [key, setKey] = useState(resetKey);
  if (key !== resetKey) {
    // reset during render: the new list does not first paint with the old count
    setKey(resetKey);
    setCount(pageSize);
  }
  const visible = items.slice(0, count);
  return { visible, hidden: items.length - visible.length, showMore: () => setCount((c) => c + pageSize) };
}
