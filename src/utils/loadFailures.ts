import React from 'react';

/**
 * Subscriptions that ended with an error (audit 07.10, finding 15): the screens that show their data say so instead of
 * an empty list — before, a refused orders subscription looked to the owner like «заказов нет». A failed subscription
 * does not come back by itself: the notice offers «Обновить страницу».
 */
export type LoadFeed = 'orders';

const failed = new Set<LoadFeed>();
const listeners = new Set<() => void>();
let version = 0;

export function setLoadFailed(feed: LoadFeed, isFailed: boolean) {
  if (failed.has(feed) === isFailed) return;
  if (isFailed) failed.add(feed);
  else failed.delete(feed);
  version += 1;
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function useLoadFailed(feed: LoadFeed): boolean {
  React.useSyncExternalStore(subscribe, () => version);
  return failed.has(feed);
}
