// Сборка отзывов (аудит 07.10, находка 48): отзывы коллекции `reviews` и голоса «Полезно» подмешиваются в товар
// (mergeProductReviews) и вырезаются перед записью товара (withoutCollectionReviews, src/utils/reviews.ts): товар
// меняет только администратор, а отзыв — только его автор, поэтому чужие отзывы внутрь товара не пишутся.
import { describe, expect, test } from 'bun:test';
import { helpfulCount, mergeProductReviews, withoutCollectionReviews } from '../../src/utils/reviews';
import type { Product, ProductReview, ReviewVote, StoredReview } from '../../src/types';

const legacy = (id: string, over: Partial<ProductReview> = {}) =>
  ({ id, authorName: 'Старый', rating: 4, comment: 'Внутри товара', date: '1 сентября 2026 г.', ...over }) as ProductReview;

const stored = (productId: string, uid: string, createdAt: string, over: Partial<StoredReview> = {}): StoredReview =>
  ({
    id: `${productId}_${uid}`,
    productId,
    uid,
    authorName: uid,
    rating: 5,
    comment: `Отзыв ${uid}`,
    date: createdAt.slice(0, 10),
    createdAt,
    ...over,
  }) as StoredReview;

const vote = (reviewId: string, uid: string): ReviewVote => ({ reviewId, productId: reviewId.split('_')[0], uid }) as ReviewVote;

const product = (id: string, reviews?: ProductReview[]) => ({ id, title: `Товар ${id}`, price: 1000, reviews }) as Product;

describe('mergeProductReviews', () => {
  test('без отзывов и голосов — те же объекты товаров', () => {
    const products = [product('p1', [legacy('old1')])];
    expect(mergeProductReviews(products, [], [])).toBe(products);
  });

  test('новые отзывы — первыми, от свежего к старому, затем старые изнутри товара; каждому товару — свои', () => {
    const [p1, p2] = mergeProductReviews(
      [product('p1', [legacy('old1')]), product('p2')],
      [stored('p1', 'alice', '2026-10-01T10:00:00.000Z'), stored('p1', 'bob', '2026-10-05T10:00:00.000Z'), stored('p2', 'carol', '2026-10-02T10:00:00.000Z')],
      []
    );
    expect(p1.reviews!.map((r) => [r.id, r.fromCollection ?? false])).toEqual([
      ['p1_bob', true],
      ['p1_alice', true],
      ['old1', false],
    ]);
    expect(p2.reviews!.map((r) => r.id)).toEqual(['p2_carol']);
  });

  test('голоса «Полезно» — у своего отзыва, в том числе у старого; счёт — старое число плюс голоса', () => {
    const [p1] = mergeProductReviews(
      [product('p1', [legacy('p1_old', { helpfulCount: 3 })])],
      [stored('p1', 'alice', '2026-10-01T10:00:00.000Z')],
      [vote('p1_alice', 'bob'), vote('p1_alice', 'carol'), vote('p1_old', 'dave'), vote('p9_x', 'eve')]
    );
    const [fresh, old] = p1.reviews!;
    expect(fresh.voterUids).toEqual(['bob', 'carol']);
    expect(helpfulCount(fresh)).toBe(2);
    expect(old.voterUids).toEqual(['dave']);
    expect(helpfulCount(old)).toBe(4);
  });

  test('повторная сборка не удваивает отзывы и не копит голоса (подписка присылает снимки снова)', () => {
    const reviews = [stored('p1', 'alice', '2026-10-01T10:00:00.000Z')];
    const votes = [vote('p1_alice', 'bob')];
    const once = mergeProductReviews([product('p1', [legacy('old1')])], reviews, votes);
    const twice = mergeProductReviews(once, reviews, votes);
    expect(twice[0].reviews).toEqual(once[0].reviews);
    expect(twice[0].reviews!.length).toBe(2);
  });

  test('отзыв удалён из коллекции — пропадает из товара при следующей сборке', () => {
    const once = mergeProductReviews([product('p1')], [stored('p1', 'alice', '2026-10-01T10:00:00.000Z')], [vote('x_y', 'z')]);
    const after = mergeProductReviews(once, [], [vote('x_y', 'z')]);
    expect(after[0].reviews).toEqual([]);
  });
});

describe('withoutCollectionReviews — товар перед записью', () => {
  test('убирает отзывы коллекции и голоса, оставляет старые отзывы товара', () => {
    const [merged] = mergeProductReviews(
      [product('p1', [legacy('old1', { helpfulCount: 2 })])],
      [stored('p1', 'alice', '2026-10-01T10:00:00.000Z')],
      [vote('old1', 'bob')]
    );
    const clean = withoutCollectionReviews(merged);
    expect(clean.reviews).toEqual([legacy('old1', { helpfulCount: 2 })]);
    expect(clean.reviews![0]).not.toHaveProperty('voterUids');
    // the product passed in stays as it was (the catalog keeps showing the merged reviews)
    expect(merged.reviews!.length).toBe(2);
  });

  test('товар без подмешанного возвращается тем же объектом', () => {
    const plain = product('p1', [legacy('old1')]);
    expect(withoutCollectionReviews(plain)).toBe(plain);
    const empty = product('p2');
    expect(withoutCollectionReviews(empty)).toBe(empty);
  });
});
