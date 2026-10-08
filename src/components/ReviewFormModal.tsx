import React, { useEffect, useRef, useState } from 'react';
import { MessageSquarePlus, Star, X } from 'lucide-react';
import type { Product, ProductReview, StoredReview, UserProfile } from '../types';
import { initialSize } from '../utils/variantSelection';
import { reviewDocId } from '../utils/reviews';
import { saveReviewToFirestore } from '../utils/firebaseSync';
import { useDialogA11y } from '../utils/useDialogA11y';
import { NeumorphicSelect } from './NeumorphicSelect';

interface ReviewFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product;
  /** The customer's own review: the form edits it (one review per customer and product) */
  myReview?: ProductReview;
  uid: string;
  userProfile?: UserProfile;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

const RATING_WORDS: Record<number, string> = {
  1: 'Очень плохо',
  2: 'Не понравилось',
  3: 'Нормально',
  4: 'Хорошо',
  5: 'Превосходно!',
};

/**
 * «Оставить отзыв»: its own chunk, loaded on the first tap (lazyWindows.ts) — the size and colour pickers are
 * NeumorphicSelect (Base UI), which must not come back into the main bundle. Every field has its label (htmlFor),
 * the name field `autoComplete="name"`, the rating is a radio group (arrows change it; audit 07.10, findings 32, 33).
 */
export const ReviewFormModal: React.FC<ReviewFormModalProps> = ({
  isOpen,
  onClose,
  product,
  myReview,
  uid,
  userProfile,
  onShowToast,
}) => {
  const dialog = useDialogA11y(isOpen, onClose);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedRating, setSelectedRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [authorName, setAuthorName] = useState(userProfile?.name || '');
  const [commentText, setCommentText] = useState('');
  const [prosText, setProsText] = useState('');
  const [consText, setConsText] = useState('');
  // The size the customer bought: not guessed (a default «M» went into reviews unnoticed)
  const [selectedSize, setSelectedSize] = useState(() => initialSize(product));
  const [selectedColor, setSelectedColor] = useState(product.colors[0]?.name || '');
  const starRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Opening the form for one's own review fills it in — only on opening: `myReview` is a new object on every render
  // of the product, and the text being typed must stay
  const myReviewRef = useRef(myReview);
  myReviewRef.current = myReview;
  useEffect(() => {
    const myReview = myReviewRef.current;
    if (!isOpen || !myReview) return;
    setSelectedRating(myReview.rating);
    setAuthorName(myReview.authorName);
    setCommentText(myReview.comment);
    setProsText(myReview.pros ?? '');
    setConsText(myReview.cons ?? '');
    if (myReview.sizePurchased) setSelectedSize(myReview.sizePurchased);
    if (myReview.colorPurchased) setSelectedColor(myReview.colorPurchased);
  }, [isOpen]);

  /** Radio group keys: arrows move the choice (and the focus) to the next star, Home/End — to 1 and 5 */
  const handleRatingKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const next: Record<string, number> = {
      ArrowRight: Math.min(5, selectedRating + 1),
      ArrowUp: Math.min(5, selectedRating + 1),
      ArrowLeft: Math.max(1, selectedRating - 1),
      ArrowDown: Math.max(1, selectedRating - 1),
      Home: 1,
      End: 5,
    };
    const value = next[e.key];
    if (value === undefined) return;
    e.preventDefault();
    setSelectedRating(value);
    starRefs.current[value - 1]?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) {
      onShowToast('Пожалуйста, напишите текст отзыва', 'error');
      return;
    }

    const review: StoredReview = {
      id: reviewDocId(product.id, uid),
      productId: product.id,
      uid,
      authorName: (authorName.trim() || userProfile?.name?.trim() || 'Покупатель').slice(0, 60),
      rating: selectedRating,
      comment: commentText.trim().slice(0, 2000),
      ...(prosText.trim() ? { pros: prosText.trim().slice(0, 500) } : {}),
      ...(consText.trim() ? { cons: consText.trim().slice(0, 500) } : {}),
      ...(selectedSize ? { sizePurchased: selectedSize } : {}),
      colorPurchased: selectedColor,
      date: myReview?.date ?? new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }),
      createdAt: myReview?.createdAt ?? new Date().toISOString(),
    };

    setIsSaving(true);
    try {
      await saveReviewToFirestore(review);
      onClose();
      setCommentText('');
      setProsText('');
      setConsText('');
      onShowToast(myReview ? 'Отзыв обновлен' : 'Отзыв опубликован! Спасибо за обратную связь', 'success');
    } catch (err) {
      console.error('Review save failed:', err);
      onShowToast('Не удалось сохранить отзыв. Попробуйте еще раз', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const fieldId = (name: string) => `review-${product.id}-${name}`;
  const shownRating = hoverRating ?? selectedRating;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#2D3A4E]/50 backdrop-blur-sm animate-in fade-in">
      <div
        ref={dialog.ref}
        {...dialog.props}
        className="neu-modal rounded-3xl p-5 max-w-md w-full space-y-4 max-h-[90vh] overflow-y-auto no-scrollbar border border-white/80 text-[#2D3A4E]"
      >
        <div className="flex items-center justify-between border-b border-[#BAC5D5]/50 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl neu-inset flex items-center justify-center text-accent">
              <MessageSquarePlus className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h3 id={dialog.titleId} className="text-base font-extrabold text-[#2D3A4E]">Оставить отзыв</h3>
              <p className="text-xs text-[#4E5C70] truncate max-w-[220px]">{product.title}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer"
            aria-label="Закрыть"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          {/* Rating: a radio group of five stars, the word under it says the choice */}
          <div className="space-y-1.5 text-center p-3 neu-inset rounded-2xl">
            <p id={fieldId('rating')} className="text-xs font-bold text-[#2D3A4E]">Ваша оценка товару:</p>
            <div
              role="radiogroup"
              aria-labelledby={fieldId('rating')}
              className="flex items-center justify-center gap-1 py-1"
              onMouseLeave={() => setHoverRating(null)}
            >
              {[1, 2, 3, 4, 5].map((st) => (
                <button
                  key={st}
                  ref={(el) => {
                    starRefs.current[st - 1] = el;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={selectedRating === st}
                  aria-label={`${st} из 5 — ${RATING_WORDS[st]}`}
                  tabIndex={selectedRating === st ? 0 : -1}
                  onMouseEnter={() => setHoverRating(st)}
                  onClick={() => setSelectedRating(st)}
                  onKeyDown={handleRatingKeyDown}
                  className="w-9 h-9 flex items-center justify-center rounded-xl cursor-pointer transform hover:scale-125 transition-transform"
                >
                  <Star
                    aria-hidden="true"
                    className={`w-6 h-6 ${st <= shownRating ? 'fill-warning text-warning' : 'text-[#4E5C70]'}`}
                  />
                </button>
              ))}
            </div>
            <span className="text-[11px] font-bold text-accent" aria-hidden="true">
              {RATING_WORDS[selectedRating]}
            </span>
          </div>

          <div className="space-y-1">
            <label htmlFor={fieldId('name')} className="block font-bold text-[#2D3A4E]">Ваше имя:</label>
            <input
              id={fieldId('name')}
              type="text"
              autoComplete="name"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder="Например, Александр В."
              className="w-full py-2.5 px-3.5 rounded-xl neu-inset text-xs text-[#2D3A4E] placeholder:text-[#56647A]"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label htmlFor={fieldId('size')} className="block font-bold text-[#2D3A4E]">Размер:</label>
              <NeumorphicSelect
                id={fieldId('size')}
                value={selectedSize}
                options={product.sizes}
                onChange={setSelectedSize}
                placeholder="Размер"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor={fieldId('color')} className="block font-bold text-[#2D3A4E]">Цвет:</label>
              <NeumorphicSelect
                id={fieldId('color')}
                value={selectedColor}
                options={product.colors.map((c) => ({
                  value: c.name,
                  label: c.name,
                  icon: <span className="w-3.5 h-3.5 rounded-full border border-black/15" style={{ backgroundColor: c.hex }} />,
                }))}
                onChange={setSelectedColor}
                placeholder="Цвет"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor={fieldId('comment')} className="block font-bold text-[#2D3A4E]">Текст отзыва *:</label>
            <textarea
              id={fieldId('comment')}
              rows={3}
              aria-required="true"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Опишите ваши впечатления от посадки, ткани, деталей кроя..."
              className="w-full p-3 rounded-xl neu-inset text-xs text-[#2D3A4E] placeholder:text-[#56647A] resize-none"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor={fieldId('pros')} className="block font-bold text-[#2D3A4E]">Достоинства (необязательно):</label>
            <input
              id={fieldId('pros')}
              type="text"
              autoComplete="off"
              value={prosText}
              onChange={(e) => setProsText(e.target.value)}
              placeholder="Например: качественная ткань, идеальный воротник"
              className="w-full py-2 px-3.5 rounded-xl neu-inset text-xs text-[#2D3A4E] placeholder:text-[#56647A]"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor={fieldId('cons')} className="block font-bold text-[#2D3A4E]">Недостатки (необязательно):</label>
            <input
              id={fieldId('cons')}
              type="text"
              autoComplete="off"
              value={consText}
              onChange={(e) => setConsText(e.target.value)}
              placeholder="Например: маломерит на полразмера"
              className="w-full py-2 px-3.5 rounded-xl neu-inset text-xs text-[#2D3A4E] placeholder:text-[#56647A]"
            />
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="w-full py-3 rounded-2xl neu-button-accent text-white text-xs font-bold hover:scale-[1.01] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-60 disabled:cursor-wait"
          >
            {myReview ? 'Сохранить отзыв' : 'Опубликовать отзыв'}
          </button>
        </form>
      </div>
    </div>
  );
};
