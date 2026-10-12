import React from 'react';
import type { ReviewModeration, ReviewVote, StoredReview } from '../types';
import { subscribeToReviewModeration, subscribeToReviewVotes, subscribeToReviews } from './firebaseSync';

/**
 * Reviews and «Полезно» votes of the products whose page is open (docs/catalog-scale-plan.md, stage 4). A customer
 * reads the catalog from the index, where every line carries its rating: the reviews themselves are needed only on the
 * product page, so a visit no longer reads every review of the shop. While the catalog is read whole (the admin, or no
 * index) `useCatalog` reads every review and nothing is read here.
 */

/** Reviews of a product nobody shows are still listened to for this long (back from the cart to the product) */
const KEEP_MS = 10_000;

interface Entry {
  reviews?: StoredReview[];
  votes?: ReviewVote[];
  /** The owner's decisions on this product's reviews (`review_moderation`) */
  moderation?: ReviewModeration[];
  unsub: () => void;
}

const entries = new Map<string, Entry>();
const counts = new Map<string, number>();
const listeners = new Set<() => void>();
let enabled = false;
let version = 0;

function notify() {
  version += 1;
  listeners.forEach((l) => l());
}

function start(id: string) {
  if (entries.has(id)) return;
  const entry: Entry = { unsub: () => {} };
  entries.set(id, entry);
  const unsubReviews = subscribeToReviews((reviews) => {
    entry.reviews = reviews;
    notify();
  }, id);
  const unsubVotes = subscribeToReviewVotes((votes) => {
    entry.votes = votes;
    notify();
  }, id);
  // a refused read (the rules of the collection are not published yet) leaves the reviews as they were: no decisions
  const unsubModeration = subscribeToReviewModeration(
    (decisions) => {
      entry.moderation = decisions;
      notify();
    },
    id,
    () => {
      entry.moderation = [];
      notify();
    }
  );
  entry.unsub = () => {
    unsubReviews();
    unsubVotes();
    unsubModeration();
  };
}

function stop(id: string) {
  const entry = entries.get(id);
  if (!entry) return;
  entry.unsub();
  entries.delete(id);
  // the product goes back to the rating of its index line
  notify();
}

/** `useCatalog`: the catalog comes from the index (true) or whole with every review (false) */
export function setLiveReviewsEnabled(on: boolean) {
  if (enabled === on) return;
  enabled = on;
  for (const [id, n] of counts) if (n > 0) (on ? start : stop)(id);
}

export interface LiveReviewsOfProduct {
  reviews: StoredReview[];
  votes: ReviewVote[];
  moderation: ReviewModeration[];
}

/** Products whose reviews, votes and moderation decisions are all read, with them */
export function liveReviews(): Map<string, LiveReviewsOfProduct> {
  const read = new Map<string, LiveReviewsOfProduct>();
  for (const [id, e] of entries) {
    if (e.reviews && e.votes && e.moderation) read.set(id, { reviews: e.reviews, votes: e.votes, moderation: e.moderation });
  }
  return read;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const useLiveReviewsVersion = () => React.useSyncExternalStore(subscribe, () => version);

/** Keeps the reviews of this product read while the component (the product page) is shown */
export function useLiveReviews(productId: string | null | undefined) {
  React.useEffect(() => {
    if (!productId) return;
    counts.set(productId, (counts.get(productId) ?? 0) + 1);
    if (enabled) start(productId);
    return () => {
      const n = (counts.get(productId) ?? 1) - 1;
      if (n > 0) {
        counts.set(productId, n);
        return;
      }
      counts.delete(productId);
      window.setTimeout(() => {
        if (!counts.has(productId)) stop(productId);
      }, KEEP_MS);
    };
  }, [productId]);
}
