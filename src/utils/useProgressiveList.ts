import { startTransition, useEffect, useState } from 'react';

/**
 * Long admin lists (orders, customers) whose cards are heavy: the first `first` items render with the section,
 * the rest right after the first paint (a transition, so typing and clicks stay responsive).
 * After that the whole list always renders.
 */
export function useProgressiveList<T>(items: T[], first = 6): T[] {
  const [showAll, setShowAll] = useState(false);
  const needsMore = !showAll && items.length > first;
  useEffect(() => {
    if (!needsMore) return;
    // two frames: the first cards are painted before the rest is rendered
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => startTransition(() => setShowAll(true)));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [needsMore]);
  return needsMore ? items.slice(0, first) : items;
}
