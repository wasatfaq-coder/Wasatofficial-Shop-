import React, { useState } from 'react';
import { Star, ThumbsUp, CheckCircle2, Plus } from 'lucide-react';
import { Product, ProductReview, UserProfile } from '../types';
import { getProductRating } from '../utils/productRating';
import { helpfulCount } from '../utils/reviews';
import { deleteReviewFromFirestore, setReviewVoteInFirestore } from '../utils/firebaseSync';
import { useAuth } from '../context/AuthContext';
import { ConfirmDialog } from './ConfirmDialog';
import { pluralRu } from '../utils/pluralize';
import { LazyMount } from './LazyMount';
import { ReviewFormModal } from './lazyWindows';
import { loadReviewFormModal } from '../customerLoaders';

interface ProductReviewsSectionProps {
  product: Product;
  userProfile?: UserProfile;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

/** Five stars as one picture with its text: a screen reader hears «Оценка 4 из 5» (audit 07.10, finding 33) */
const RatingStars: React.FC<{ rating: number; className: string }> = ({ rating, className }) => (
  <div role="img" aria-label={`Оценка ${rating} из 5`} className="flex items-center gap-0.5">
    {[1, 2, 3, 4, 5].map((star) => (
      <Star
        key={star}
        aria-hidden="true"
        className={`${className} ${star <= rating ? 'fill-warning text-warning' : 'text-[#4E5C70]'}`}
      />
    ))}
  </div>
);

/**
 * Reviews are stored in the `reviews` collection, one per customer and product (firestore.rules
 * let only the author change it); «Полезно» is one vote per person in `review_votes`.
 */
export const ProductReviewsSection: React.FC<ProductReviewsSectionProps> = ({
  product,
  userProfile,
  onShowToast,
}) => {
  const { currentUser, isAdmin } = useAuth();
  const uid = currentUser && !currentUser.isAnonymous ? currentUser.uid : null;
  const myReview = uid ? product.reviews?.find((r) => r.fromCollection && r.uid === uid) : undefined;
  const [reviewToDelete, setReviewToDelete] = useState<ProductReview | null>(null);
  const [isWriteReviewOpen, setIsWriteReviewOpen] = useState(false);
  const [sortBy, setSortBy] = useState<'newest' | 'helpful'>('newest');

  // Only real reviews; the summary is computed from them (stored rating fields may be template numbers)
  const reviews: ProductReview[] = product.reviews ?? [];
  const ratingInfo = getProductRating(product);
  const recommendShare = reviews.length > 0
    ? Math.round((reviews.filter((r) => r.rating >= 4).length / reviews.length) * 100)
    : 0;

  const handleToggleHelpful = async (review: ProductReview) => {
    if (!uid) {
      onShowToast('Войдите через Google в профиле, чтобы отметить отзыв', 'info');
      return;
    }
    if (review.uid === uid) {
      onShowToast('Свой отзыв отметить нельзя', 'info');
      return;
    }
    const isLiked = Boolean(review.voterUids?.includes(uid));
    try {
      await setReviewVoteInFirestore({ reviewId: review.id, productId: product.id, uid }, !isLiked);
      onShowToast(isLiked ? 'Вы отменили голос' : 'Спасибо! Ваш голос учтен', 'info');
    } catch (err) {
      console.error('Review vote failed:', err);
      onShowToast('Не удалось сохранить голос. Попробуйте еще раз', 'error');
    }
  };

  const openReviewForm = () => {
    if (!uid) {
      onShowToast('Войдите через Google в профиле, чтобы оставить отзыв', 'info');
      return;
    }
    setIsWriteReviewOpen(true);
  };

  const handleDeleteReview = async () => {
    if (!reviewToDelete) return;
    try {
      await deleteReviewFromFirestore(reviewToDelete.id);
      onShowToast('Отзыв удален', 'info');
    } catch (err) {
      console.error('Review delete failed:', err);
      onShowToast('Не удалось удалить отзыв', 'error');
    }
    setReviewToDelete(null);
  };

  const sortedReviews = [...reviews].sort((a, b) => {
    if (sortBy === 'helpful') {
      const aCount = helpfulCount(a);
      const bCount = helpfulCount(b);
      return bCount - aCount;
    }
    return 0; // default order
  });

  return (
    <div className="space-y-4 pt-4 border-t border-[#BAC5D5]/40 text-[#2D3A4E]">
      {/* Header with Title & Write Review Button */}
      {/* the button moves under the title on a narrow screen instead of squeezing it to two lines */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div>
          <h3 className="text-base font-extrabold text-[#2D3A4E] flex items-center gap-2">
            <span>Отзывы покупателей</span>
            <span className="neu-inset px-2.5 py-0.5 rounded-full text-xs font-bold text-accent">
              {reviews.length}
            </span>
          </h3>
        </div>

        <button
          type="button"
          onClick={openReviewForm}
          onPointerEnter={() => void loadReviewFormModal().catch(() => {})}
          onFocus={() => void loadReviewFormModal().catch(() => {})}
          className="neu-button px-3.5 py-2 rounded-xl text-xs font-bold text-accent flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-all cursor-pointer hover:opacity-90"
        >
          <Plus className="w-4 h-4" />
          <span>{myReview ? 'Изменить мой отзыв' : 'Написать отзыв'}</span>
        </button>
      </div>

      {!ratingInfo && (
        <p className="py-2 text-xs font-bold text-[#4E5C70] text-center">
          Отзывов пока нет. Станьте первым, кто оценит этот товар.
        </p>
      )}

      {/* Rating Summary Card */}
      {ratingInfo && (
      <div className="neu-flat rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl neu-inset flex flex-col items-center justify-center shrink-0">
            <span className="text-2xl font-extrabold text-accent leading-none">
              {ratingInfo.rating.toFixed(1)}
            </span>
            <span className="text-[11px] text-[#4E5C70] font-bold mt-1">из 5.0</span>
          </div>

          <div>
            <RatingStars rating={Math.round(ratingInfo.rating)} className="w-4 h-4" />
            <p className="text-xs font-bold text-[#2D3A4E] mt-1">
              {ratingInfo.count} {pluralRu(ratingInfo.count, ['отзыв', 'отзыва', 'отзывов'])}
            </p>
            <p className="text-xs text-success font-semibold flex items-center gap-1 mt-0.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {recommendShare}% покупателей оценили на 4–5
            </p>
          </div>
        </div>

        {/* Sort controls */}
        <div className="grid grid-cols-2 gap-1.5 neu-flat-sm p-1 rounded-xl w-full sm:w-auto sm:flex sm:items-center">
          <button
            type="button"
            onClick={() => setSortBy('newest')}
            className={`py-2 px-3 sm:px-4 rounded-lg text-xs font-bold transition-all cursor-pointer text-center flex items-center justify-center ${
              sortBy === 'newest' ? 'neu-pill-active' : 'text-[#4E5C70] hover:text-[#2D3A4E]'
            }`}
          >
            Сначала новые
          </button>
          <button
            type="button"
            onClick={() => setSortBy('helpful')}
            className={`py-2 px-3 sm:px-4 rounded-lg text-xs font-bold transition-all cursor-pointer text-center flex items-center justify-center ${
              sortBy === 'helpful' ? 'neu-pill-active' : 'text-[#4E5C70] hover:text-[#2D3A4E]'
            }`}
          >
            Полезные
          </button>
        </div>
      </div>

      )}

      {/* Reviews List */}
      <div className="space-y-3">
        {sortedReviews.map((rev) => {
          const isLiked = Boolean(uid && rev.voterUids?.includes(uid));
          const currentHelpful = helpfulCount(rev);
          // Authors remove their own review, the admin any review from the collection
          const canDelete = rev.fromCollection && (isAdmin || (uid !== null && rev.uid === uid));

          return (
            <div key={rev.id} className="neu-flat rounded-2xl p-4 space-y-3">
              {/* Author & Rating info */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full neu-flat-sm flex items-center justify-center font-extrabold text-xs text-accent uppercase shrink-0">
                    {rev.authorName ? rev.authorName[0] : 'U'}
                  </div>
                  <div>
                    <span className="text-xs font-bold text-[#2D3A4E]">{rev.authorName}</span>
                    <p className="text-xs text-[#4E5C70]">{rev.date}</p>
                  </div>
                </div>

                <RatingStars rating={rev.rating} className="w-3.5 h-3.5" />
              </div>

              {/* Purchase specs */}
              {(rev.sizePurchased || rev.colorPurchased) && (
                <div className="flex items-center gap-2 text-[11px] text-[#4E5C70]">
                  {rev.sizePurchased && (
                    <span className="neu-inset px-2 py-0.5 rounded-md font-semibold">
                      Размер: {rev.sizePurchased}
                    </span>
                  )}
                  {rev.colorPurchased && (
                    <span className="neu-inset px-2 py-0.5 rounded-md font-semibold">
                      Цвет: {rev.colorPurchased}
                    </span>
                  )}
                </div>
              )}

              {/* Text */}
              <p className="text-xs text-[#2D3A4E] leading-relaxed">{rev.comment}</p>

              {/* Pros & Cons with tactile Neumorphic Inset (эффект углубления) */}
              {rev.pros && (
                <div className="text-xs space-y-0.5 neu-inset p-3 rounded-2xl border border-success/25">
                  <span className="font-extrabold text-success">Достоинства: </span>
                  <span className="text-[#2D3A4E] leading-relaxed">{rev.pros}</span>
                </div>
              )}

              {rev.cons && (
                <div className="text-xs space-y-0.5 neu-inset p-3 rounded-2xl border border-danger/25">
                  <span className="font-extrabold text-danger">Недостатки: </span>
                  <span className="text-[#2D3A4E] leading-relaxed">{rev.cons}</span>
                </div>
              )}

              {/* Helpful footer */}
              <div className="flex items-center justify-end gap-2 pt-1">
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => setReviewToDelete(rev)}
                    className="neu-button-danger px-2.5 py-1 rounded-xl text-[11px] font-bold cursor-pointer"
                  >
                    Удалить
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleToggleHelpful(rev)}
                  className={`neu-button px-2.5 py-1 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    isLiked ? 'text-success' : 'text-[#4E5C70] hover:text-[#2D3A4E]'
                  }`}
                >
                  <ThumbsUp className={`w-3.5 h-3.5 ${isLiked ? 'fill-success' : ''}`} />
                  <span>Полезно ({currentHelpful})</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* «Оставить отзыв»: its own chunk (NeumorphicSelect, Base UI), loaded on the first tap */}
      {uid && (
        <LazyMount when={isWriteReviewOpen}>
          <ReviewFormModal
            isOpen={isWriteReviewOpen}
            onClose={() => setIsWriteReviewOpen(false)}
            product={product}
            myReview={myReview}
            uid={uid}
            userProfile={userProfile}
            onShowToast={onShowToast}
          />
        </LazyMount>
      )}

      <ConfirmDialog
        isOpen={Boolean(reviewToDelete)}
        title="Удалить отзыв?"
        message="Отзыв исчезнет со страницы товара, рейтинг пересчитается."
        onConfirm={handleDeleteReview}
        onClose={() => setReviewToDelete(null)}
      />
    </div>
  );
};
