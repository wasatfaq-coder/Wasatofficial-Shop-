// Отзывы: кто что видит после решения владельца, «Покупка подтверждена» и отзыв только по полученному заказу
// (задание владельца 11.10; src/utils/reviewModeration.ts, src/utils/adminReviews.ts, src/utils/reviews.ts)
import { describe, expect, test } from 'bun:test';
import type { Order, Product, ReviewModeration, StoredReview } from '../../src/types';
import {
  buildAdminReviewRows,
  countByStatus,
  countPendingReviews,
  decisionTime,
  filterAdminReviews,
} from '../../src/utils/adminReviews';
import {
  decisionsById,
  isReceivedOrderOf,
  moderationNote,
  reviewableOrders,
  reviewVisibility,
  viewReview,
} from '../../src/utils/reviewModeration';
import { getProductRating } from '../../src/utils/productRating';
import { mergeProductReviews } from '../../src/utils/reviews';

const review = (uid: string, overrides: Partial<StoredReview> = {}): StoredReview => ({
  id: `p1_${uid}`,
  productId: 'p1',
  uid,
  authorName: uid,
  rating: 5,
  comment: 'Отличное пальто',
  date: '1 октября 2026 г.',
  createdAt: '2026-10-01T10:00:00.000Z',
  ...overrides,
});

const decision = (id: string, overrides: Partial<ReviewModeration> = {}): ReviewModeration => ({
  id,
  productId: 'p1',
  status: 'published',
  at: 2000,
  ...overrides,
});

const product = { id: 'p1', title: 'Пальто', colors: [], sizes: [], skus: [] } as unknown as Product;

describe('reviewVisibility', () => {
  test('without a decision: shown while checking is off, waiting while it is on', () => {
    expect(reviewVisibility(review('a'), undefined, false)).toBe('published');
    expect(reviewVisibility(review('a'), undefined, true)).toBe('pending');
  });

  test('a current decision decides, whatever the setting', () => {
    const r = review('a', { updatedAt: 1000 });
    expect(reviewVisibility(r, decision('p1_a', { status: 'published', at: 2000 }), true)).toBe('published');
    expect(reviewVisibility(r, decision('p1_a', { status: 'rejected', at: 2000 }), false)).toBe('rejected');
    // the same moment is not older
    expect(reviewVisibility(r, decision('p1_a', { status: 'published', at: 1000 }), true)).toBe('published');
  });

  test('a review changed after the decision is checked again', () => {
    const edited = review('a', { updatedAt: 3000 });
    expect(reviewVisibility(edited, decision('p1_a', { status: 'published', at: 2000 }), true)).toBe('pending');
    expect(reviewVisibility(edited, decision('p1_a', { status: 'published', at: 2000 }), false)).toBe('published');
    // a rejected review that was rewritten waits for the owner even with checking off
    expect(reviewVisibility(edited, decision('p1_a', { status: 'rejected', at: 2000 }), false)).toBe('pending');
  });

  test('a review without updatedAt (written before) keeps its decision', () => {
    expect(reviewVisibility(review('a'), decision('p1_a', { status: 'rejected', at: 1 }), false)).toBe('rejected');
  });
});

describe('viewReview: who sees what', () => {
  const rejected = decision('p1_a', { status: 'rejected', reason: 'Не по теме' });
  const ctx = (viewerUid: string | null, premoderation = false) => ({
    decisions: decisionsById([rejected]),
    premoderation,
    viewerUid,
  });

  test('a rejected review is hidden from everybody but its author, who sees the reason', () => {
    expect(viewReview(review('a'), ctx(null))).toBeNull();
    expect(viewReview(review('a'), ctx('b'))).toBeNull();
    const own = viewReview(review('a'), ctx('a'));
    expect(own?.moderation).toBe('rejected');
    expect(moderationNote(own!)).toBe('Отзыв отклонён: Не по теме');
  });

  test('a review nobody has decided on waits when checking is on: only the author sees «На проверке»', () => {
    const fresh = review('c');
    expect(viewReview(fresh, ctx('b', true))).toBeNull();
    expect(viewReview(fresh, ctx(null, true))).toBeNull();
    expect(viewReview(fresh, ctx('c', true))?.moderation).toBe('pending');
    expect(viewReview(fresh, ctx('b', false))?.moderation).toBeUndefined();
  });

  test('an own hidden review is not counted in the rating, a published one is', () => {
    const view = { decisions: decisionsById([rejected]), premoderation: false, viewerUid: 'a' };
    const [merged] = mergeProductReviews([product], [review('a'), review('b', { rating: 3 })], [], view);
    expect(merged.reviews?.map((r) => r.id).sort()).toEqual(['p1_a', 'p1_b']);
    expect(getProductRating(merged)).toEqual({ rating: 3, count: 1 });
    // for the owner's catalog (the index customers read) the hidden one is not there at all
    const [forIndex] = mergeProductReviews([product], [review('a'), review('b', { rating: 3 })], [], { ...view, viewerUid: null });
    expect(forIndex.reviews?.map((r) => r.id)).toEqual(['p1_b']);
  });

  test('without a view context every review is shown, as before', () => {
    const [merged] = mergeProductReviews([product], [review('a'), review('b')], []);
    expect(merged.reviews).toHaveLength(2);
  });
});

describe('a review is written for a received order', () => {
  const line = (id: string) => ({ id: `l-${id}`, product: { id }, selectedColor: 'Чёрный', selectedSize: 'M', quantity: 1 });
  const order = (id: string, overrides: Partial<Order> = {}) =>
    ({ id, status: 'delivered', customerUid: 'alice', items: [line('p1')], ...overrides }) as unknown as Order;

  test('only the customer\'s delivered, not cancelled order counts', () => {
    expect(isReceivedOrderOf(order('A'), 'alice')).toBe(true);
    expect(isReceivedOrderOf(order('A'), 'bob')).toBe(false);
    expect(isReceivedOrderOf(order('A', { status: 'in_transit' }), 'alice')).toBe(false);
    expect(isReceivedOrderOf(order('A', { isCancelled: true }), 'alice')).toBe(false);
  });

  test('the orders offered for a product are the received ones that contain it', () => {
    const orders = [
      order('A'),
      order('B', { items: [line('p2')] }),
      order('C', { status: 'accepted' }),
      order('D', { customerUid: 'bob' }),
      order('E', { items: [line('p2'), line('p1')] }),
    ];
    expect(reviewableOrders(orders, 'p1', 'alice').map((o) => o.id)).toEqual(['A', 'E']);
    expect(reviewableOrders(orders, 'p9', 'alice')).toEqual([]);
  });
});

describe('«Отзывы» in the admin panel', () => {
  const reviews = [
    review('a', { createdAt: '2026-10-01T10:00:00.000Z', comment: 'Тёплое', rating: 5, orderId: 'WS-1' }),
    review('b', { createdAt: '2026-10-03T10:00:00.000Z', comment: 'Мало', rating: 2, authorName: 'Борис' }),
    review('c', { createdAt: '2026-10-02T10:00:00.000Z', comment: 'Реклама', rating: 1 }),
  ];
  const decisions = [
    decision('p1_a', { status: 'published', at: Date.parse('2026-10-05') }),
    decision('p1_c', { status: 'rejected', reason: 'Реклама', at: Date.parse('2026-10-05') }),
  ];
  const rows = buildAdminReviewRows(reviews, decisions, [{ id: 'p1', title: 'Пальто' }], true);

  test('newest first, with the product title and the status', () => {
    expect(rows.map((r) => r.review.id)).toEqual(['p1_b', 'p1_c', 'p1_a']);
    expect(rows.map((r) => r.status)).toEqual(['pending', 'rejected', 'published']);
    expect(rows[0].productTitle).toBe('Пальто');
    expect(countByStatus(rows)).toEqual({ pending: 1, rejected: 1, published: 1 });
  });

  test('filters: status, rating, search over author, text, product and order', () => {
    const ids = (f: Parameters<typeof filterAdminReviews>[1]) => filterAdminReviews(rows, f).map((r) => r.review.id);
    expect(ids({ status: 'pending', rating: 'all', query: '' })).toEqual(['p1_b']);
    expect(ids({ status: 'all', rating: 5, query: '' })).toEqual(['p1_a']);
    expect(ids({ status: 'all', rating: 'all', query: 'борис' })).toEqual(['p1_b']);
    expect(ids({ status: 'all', rating: 'all', query: 'ws-1' })).toEqual(['p1_a']);
    expect(ids({ status: 'all', rating: 'all', query: 'пальто' })).toHaveLength(3);
  });

  test('a deleted product is named, the pending counter follows the setting', () => {
    expect(buildAdminReviewRows(reviews, [], [], false)[0].productTitle).toBe('Товар удалён');
    expect(countPendingReviews(reviews, decisions, true)).toBe(1);
    expect(countPendingReviews(reviews, decisions, false)).toBe(0);
  });

  test('a decision is never older than the review it is about', () => {
    expect(decisionTime({ updatedAt: 5000 }, 1000)).toBe(5000);
    expect(decisionTime({}, 1000)).toBe(1000);
  });
});
