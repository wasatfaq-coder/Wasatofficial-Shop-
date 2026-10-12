import React from 'react';
import type { ReviewModeration, StoredReview } from '../types';
import { subscribeToReviewModeration, subscribeToReviews } from './firebaseSync';

export interface AdminReviewsData {
  reviews: StoredReview[];
  decisions: ReviewModeration[];
  /** Both are read (the decisions count as read when the collection is refused: no decisions) */
  loaded: boolean;
  /** The reviews could not be read */
  failed: boolean;
  /** The decisions could not be read (shown as none): nothing may be written from such a list */
  decisionsFailed: boolean;
}

/**
 * Every review and every decision of the owner, while the component is shown («Отзывы», «Сегодня»). The admin's catalog
 * already listens to the same queries, so the database serves them once.
 */
export function useAdminReviews(enabled = true): AdminReviewsData {
  const [reviews, setReviews] = React.useState<StoredReview[] | null>(null);
  const [decisions, setDecisions] = React.useState<ReviewModeration[] | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [decisionsFailed, setDecisionsFailed] = React.useState(false);
  React.useEffect(() => {
    if (!enabled) return;
    const unsubReviews = subscribeToReviews(
      (list) => {
        setReviews(list);
        setFailed(false);
      },
      undefined,
      () => {
        setReviews((current) => current ?? []);
        setFailed(true);
      }
    );
    // the rules of the collection not published yet: no decisions rather than an empty screen
    const unsubDecisions = subscribeToReviewModeration(
      (list) => {
        setDecisions(list);
        setDecisionsFailed(false);
      },
      undefined,
      () => {
        setDecisions([]);
        setDecisionsFailed(true);
      }
    );
    return () => {
      unsubReviews();
      unsubDecisions();
    };
  }, [enabled]);
  return { reviews: reviews ?? [], decisions: decisions ?? [], loaded: reviews !== null && decisions !== null, failed, decisionsFailed };
}
