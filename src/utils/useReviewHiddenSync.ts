import React from 'react';
import type { AdminReviewsData } from './useAdminReviews';
import { loadReviewPremoderation, saveReviewHiddenMarks } from './firebaseSync';
import { decisionsById, reviewHiddenChanges } from './reviewModeration';

/** A decision, then its snapshot: written once the lists settle */
const SETTLE_MS = 2_000;

/**
 * The admin's session keeps the `hidden` mark of reviews in step with what customers should see (owner's decision 12.10):
 * after a decision, the switch «Проверять отзывы» and once for reviews written before 12.10. Only `hidden` changes. The
 * switch is read from the database right before writing (the browser's copy of the settings may be old), and nothing
 * is written while reviews or decisions are not read — a refused list would publish rejected reviews.
 */
export function useReviewHiddenSync(data: AdminReviewsData, premoderation: boolean): void {
  // Marks tried this session, by the review's version and the decision: a refused write is not repeated on every
  // snapshot, while a new version or a new decision is written again (review 12.10: publish, edit, publish again)
  const tried = React.useRef(new Set<string>());
  const { reviews, decisions, loaded, failed, decisionsFailed } = data;

  React.useEffect(() => {
    if (!loaded || failed || decisionsFailed) return;
    const byId = decisionsById(decisions);
    if (reviewHiddenChanges(reviews, byId, premoderation).length === 0) return;
    let alive = true;
    const timer = window.setTimeout(async () => {
      try {
        const stored = await loadReviewPremoderation();
        if (!alive) return;
        const versions = new Map(reviews.map((r) => [r.id, r.updatedAt]));
        const keyOf = (c: { id: string; hidden: boolean }) => {
          const d = byId.get(c.id);
          return [c.id, c.hidden, versions.get(c.id) ?? '', d?.status ?? '', d?.at ?? '', d?.reviewedVersion ?? ''].join(':');
        };
        const changes = reviewHiddenChanges(reviews, byId, stored).filter((c) => !tried.current.has(keyOf(c)));
        if (changes.length === 0) return;
        changes.forEach((c) => tried.current.add(keyOf(c)));
        // the version the mark is for: an author's save in between keeps its own mark
        await saveReviewHiddenMarks(changes.map((c) => ({ ...c, version: versions.get(c.id) })));
      } catch (error) {
        // customers then see these reviews by the old mark until the next session
        console.error('Review hidden marks were not saved:', error);
      }
    }, SETTLE_MS);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [reviews, decisions, loaded, failed, decisionsFailed, premoderation]);
}
