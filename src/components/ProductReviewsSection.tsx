import React, { useState, useRef, useEffect } from 'react';
import {
  Star,
  ThumbsUp,
  MessageSquarePlus,
  CheckCircle2,
  Filter,
  User,
  Sparkles,
  Plus,
  X,
  AlertCircle,
  ChevronDown,
  Check,
} from 'lucide-react';
import { Product, ProductReview, UserProfile } from '../types';

interface ProductReviewsSectionProps {
  product: Product;
  userProfile?: UserProfile;
  onAddReview: (review: ProductReview) => void;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

export const ProductReviewsSection: React.FC<ProductReviewsSectionProps> = ({
  product,
  userProfile,
  onAddReview,
  onShowToast,
}) => {
  const [isWriteReviewOpen, setIsWriteReviewOpen] = useState(false);
  const [selectedRating, setSelectedRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [authorName, setAuthorName] = useState(userProfile?.name || '');
  const [commentText, setCommentText] = useState('');
  const [prosText, setProsText] = useState('');
  const [consText, setConsText] = useState('');
  const [selectedSize, setSelectedSize] = useState(product.sizes[0] || 'M');
  const [selectedColor, setSelectedColor] = useState(product.colors[0]?.name || '');
  const [sortBy, setSortBy] = useState<'newest' | 'helpful'>('newest');
  const [helpfulLikedIds, setHelpfulLikedIds] = useState<Record<string, boolean>>({});

  // Dropdown states for custom neumorphic pickers
  const [isSizeDropdownOpen, setIsSizeDropdownOpen] = useState(false);
  const [isColorDropdownOpen, setIsColorDropdownOpen] = useState(false);
  const sizeDropdownRef = useRef<HTMLDivElement>(null);
  const colorDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (sizeDropdownRef.current && !sizeDropdownRef.current.contains(event.target as Node)) {
        setIsSizeDropdownOpen(false);
      }
      if (colorDropdownRef.current && !colorDropdownRef.current.contains(event.target as Node)) {
        setIsColorDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const currentColorObj = product.colors.find((c) => c.name === selectedColor) || product.colors[0];

  // Default seed reviews if product has none
  const reviews: ProductReview[] = product.reviews && product.reviews.length > 0
    ? product.reviews
    : [
        {
          id: `rev-${product.id}-1`,
          authorName: 'Александр В.',
          rating: 5,
          date: '12 сентября 2026',
          comment: 'Отличное качество пошива! Ткань приятная к телу, не мнется сильно. Село идеально размер в размер.',
          sizePurchased: product.sizes[1] || 'L',
          colorPurchased: product.colors[0]?.name || 'Основной',
          verifiedPurchase: true,
          pros: 'Премиальный материал, ровные швы, идеальная посадка',
          cons: 'Нет',
          helpfulCount: 14,
        },
        {
          id: `rev-${product.id}-2`,
          authorName: 'Дмитрий К.',
          rating: 5,
          date: '28 августа 2026',
          comment: 'Беру уже вторую вещь этого бренда. После стирки не садится и цвет не теряет. Очень рекомендую к покупке!',
          sizePurchased: product.sizes[0] || 'M',
          colorPurchased: product.colors[1]?.name || product.colors[0]?.name || 'Основной',
          verifiedPurchase: true,
          pros: 'Долговечность, стиль, приятная цена по акции',
          helpfulCount: 9,
        },
      ];

  const handleToggleHelpful = (reviewId: string) => {
    const isLiked = helpfulLikedIds[reviewId];
    setHelpfulLikedIds((prev) => ({ ...prev, [reviewId]: !isLiked }));
    onShowToast(
      isLiked ? 'Вы отменили голос' : 'Спасибо! Ваш голос учтен',
      'info'
    );
  };

  const handleSubmitReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) {
      onShowToast('Пожалуйста, напишите текст отзыва', 'error');
      return;
    }

    const newRev: ProductReview = {
      id: `rev-${Date.now()}`,
      authorName: authorName.trim() || 'Покупатель MANSTYLE',
      rating: selectedRating,
      date: 'Сегодня',
      comment: commentText.trim(),
      pros: prosText.trim() || undefined,
      cons: consText.trim() || undefined,
      sizePurchased: selectedSize,
      colorPurchased: selectedColor,
      verifiedPurchase: true,
      helpfulCount: 0,
    };

    onAddReview(newRev);
    setIsWriteReviewOpen(false);
    setCommentText('');
    setProsText('');
    setConsText('');
    onShowToast('Отзыв успешно опубликован! Спасибо за обратную связь', 'success');
  };

  const sortedReviews = [...reviews].sort((a, b) => {
    if (sortBy === 'helpful') {
      const aCount = (a.helpfulCount || 0) + (helpfulLikedIds[a.id] ? 1 : 0);
      const bCount = (b.helpfulCount || 0) + (helpfulLikedIds[b.id] ? 1 : 0);
      return bCount - aCount;
    }
    return 0; // default order
  });

  return (
    <div className="space-y-4 pt-4 border-t border-[#BAC5D5]/40 text-[#2D3A4E]">
      {/* Header with Title & Write Review Button */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-extrabold text-[#2D3A4E] flex items-center gap-2">
            <span>Отзывы покупателей</span>
            <span className="neu-inset px-2.5 py-0.5 rounded-full text-xs font-bold text-[#4B59BB]">
              {reviews.length}
            </span>
          </h3>
          <p className="text-xs text-[#4E5C70]">Реальный опыт и честные оценки покупателей</p>
        </div>

        <button
          type="button"
          onClick={() => setIsWriteReviewOpen(true)}
          className="neu-button px-3.5 py-2 rounded-xl text-xs font-bold text-[#4B59BB] flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer hover:opacity-90"
        >
          <Plus className="w-4 h-4" />
          <span>Написать отзыв</span>
        </button>
      </div>

      {/* Rating Summary Card */}
      <div className="neu-flat rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl neu-inset flex flex-col items-center justify-center shrink-0">
            <span className="text-2xl font-black text-[#4B59BB] leading-none">
              {product.rating.toFixed(1)}
            </span>
            <span className="text-[11px] text-[#4E5C70] font-bold mt-1">из 5.0</span>
          </div>

          <div>
            <div className="flex items-center gap-1 text-warning">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={`w-4 h-4 ${
                    star <= Math.round(product.rating)
                      ? 'fill-amber-400 text-amber-400'
                      : 'text-[#BAC5D5]'
                  }`}
                />
              ))}
            </div>
            <p className="text-xs font-bold text-[#2D3A4E] mt-1">
              {product.reviewsCount || reviews.length} отзывов от покупателей
            </p>
            <p className="text-[11px] text-success font-semibold flex items-center gap-1 mt-0.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              98% покупателей рекомендуют этот товар
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

      {/* Reviews List */}
      <div className="space-y-3">
        {sortedReviews.map((rev) => {
          const isLiked = !!helpfulLikedIds[rev.id];
          const currentHelpful = (rev.helpfulCount || 0) + (isLiked ? 1 : 0);

          return (
            <div key={rev.id} className="neu-flat rounded-2xl p-4 space-y-3">
              {/* Author & Rating info */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full neu-button flex items-center justify-center font-black text-xs text-[#4B59BB] uppercase shrink-0">
                    {rev.authorName ? rev.authorName[0] : 'U'}
                  </div>
                  <div>
                    <span className="text-xs font-bold text-[#2D3A4E]">{rev.authorName}</span>
                    <p className="text-[11px] text-[#4E5C70]">{rev.date}</p>
                  </div>
                </div>

                <div className="flex items-center gap-0.5 text-warning">
                  {[1, 2, 3, 4, 5].map((st) => (
                    <Star
                      key={st}
                      className={`w-3.5 h-3.5 ${
                        st <= rev.rating ? 'fill-amber-400 text-amber-400' : 'text-[#BAC5D5]'
                      }`}
                    />
                  ))}
                </div>
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
              <div className="flex items-center justify-end pt-1">
                <button
                  type="button"
                  onClick={() => handleToggleHelpful(rev.id)}
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

      {/* Modal: Write Review */}
      {isWriteReviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#2D3A4E]/50 backdrop-blur-sm animate-in fade-in">
          <div className="neu-modal rounded-3xl p-5 max-w-md w-full space-y-4 max-h-[90vh] overflow-y-auto no-scrollbar border border-white/80 text-[#2D3A4E]">
            <div className="flex items-center justify-between border-b border-[#BAC5D5]/50 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl neu-inset flex items-center justify-center text-[#4B59BB]">
                  <MessageSquarePlus className="w-5 h-5 stroke-[2.2]" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[#2D3A4E]">Оставить отзыв</h3>
                  <p className="text-[11px] text-[#4E5C70] truncate max-w-[220px]">
                    {product.title}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsWriteReviewOpen(false)}
                className="w-8 h-8 rounded-full neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitReview} className="space-y-3.5 text-xs">
              {/* Rating stars picker */}
              <div className="space-y-1.5 text-center p-3 neu-inset rounded-2xl">
                <p className="text-xs font-bold text-[#2D3A4E]">Ваша оценка товару:</p>
                <div className="flex items-center justify-center gap-2 text-warning py-1">
                  {[1, 2, 3, 4, 5].map((st) => (
                    <button
                      key={st}
                      type="button"
                      onMouseEnter={() => setHoverRating(st)}
                      onMouseLeave={() => setHoverRating(null)}
                      onClick={() => setSelectedRating(st)}
                      className="p-1 cursor-pointer transform hover:scale-125 transition-transform"
                      aria-label={`Оценка ${st} из 5`}
                    >
                      <Star
                        className={`w-6 h-6 ${
                          st <= (hoverRating ?? selectedRating)
                            ? 'fill-amber-400 text-amber-400'
                            : 'text-[#BAC5D5]'
                        }`}
                      />
                    </button>
                  ))}
                </div>
                <span className="text-[11px] font-bold text-[#4B59BB]">
                  {selectedRating === 5 && 'Превосходно!'}
                  {selectedRating === 4 && 'Хорошо'}
                  {selectedRating === 3 && 'Нормально'}
                  {selectedRating === 2 && 'Не понравилось'}
                  {selectedRating === 1 && 'Очень плохо'}
                </span>
              </div>

              {/* Author Name */}
              <div className="space-y-1">
                <label className="font-bold text-[#2D3A4E]">Ваше имя:</label>
                <input
                  type="text"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  placeholder="Например, Александр В."
                  className="w-full py-2.5 px-3.5 rounded-xl neu-inset text-xs text-[#2D3A4E] placeholder:text-[#56647A]"
                />
              </div>

              {/* Size & Color options with Custom Neumorphic Dropdowns */}
              <div className="grid grid-cols-2 gap-2.5">
                {/* Custom Size Dropdown */}
                <div className="space-y-1 relative" ref={sizeDropdownRef}>
                  <label className="font-bold text-[#2D3A4E]">Размер:</label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSizeDropdownOpen(!isSizeDropdownOpen);
                      setIsColorDropdownOpen(false);
                    }}
                    className={`w-full py-2.5 px-3 rounded-xl neu-inset text-xs font-semibold text-[#2D3A4E] flex items-center justify-between transition-all cursor-pointer ${
                      isSizeDropdownOpen ? 'ring-2 ring-[#5F6ED0]/40' : ''
                    }`}
                  >
                    <span className="font-bold">{selectedSize || 'Размер'}</span>
                    <ChevronDown
                      className={`w-4 h-4 text-[#4E5C70] transition-transform duration-200 shrink-0 ${
                        isSizeDropdownOpen ? 'rotate-180 text-[#4B59BB]' : ''
                      }`}
                    />
                  </button>

                  {isSizeDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1.5 bg-[#E3E8EF] rounded-2xl p-1.5 z-50 neu-dropdown border border-white/80 space-y-1 max-h-48 overflow-y-auto no-scrollbar">
                      {product.sizes.map((s) => {
                        const isSelected = selectedSize === s;
                        return (
                          <button
                            key={s}
                            type="button"
                            onClick={() => {
                              setSelectedSize(s);
                              setIsSizeDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-xs rounded-xl flex items-center justify-between transition-colors cursor-pointer ${
                              isSelected
                                ? 'neu-pill-active font-bold'
                                : 'text-[#2D3A4E] font-medium hover:bg-white/60'
                            }`}
                          >
                            <span>{s}</span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-[#4B59BB] stroke-[2.5]" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Custom Color Dropdown */}
                <div className="space-y-1 relative" ref={colorDropdownRef}>
                  <label className="font-bold text-[#2D3A4E]">Цвет:</label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsColorDropdownOpen(!isColorDropdownOpen);
                      setIsSizeDropdownOpen(false);
                    }}
                    className={`w-full py-2.5 px-3 rounded-xl neu-inset text-xs font-semibold text-[#2D3A4E] flex items-center justify-between transition-all cursor-pointer ${
                      isColorDropdownOpen ? 'ring-2 ring-[#5F6ED0]/40' : ''
                    }`}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      {currentColorObj?.hex && (
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-black/15 shrink-0 shadow-xs"
                          style={{ backgroundColor: currentColorObj.hex }}
                        />
                      )}
                      <span className="truncate font-bold">{selectedColor || 'Цвет'}</span>
                    </div>
                    <ChevronDown
                      className={`w-4 h-4 text-[#4E5C70] transition-transform duration-200 shrink-0 ${
                        isColorDropdownOpen ? 'rotate-180 text-[#4B59BB]' : ''
                      }`}
                    />
                  </button>

                  {isColorDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1.5 bg-[#E3E8EF] rounded-2xl p-1.5 z-50 neu-dropdown border border-white/80 space-y-1 max-h-48 overflow-y-auto no-scrollbar">
                      {product.colors.map((c) => {
                        const isSelected = selectedColor === c.name;
                        return (
                          <button
                            key={c.name}
                            type="button"
                            onClick={() => {
                              setSelectedColor(c.name);
                              setIsColorDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-xs rounded-xl flex items-center justify-between transition-colors cursor-pointer ${
                              isSelected
                                ? 'neu-pill-active font-bold'
                                : 'text-[#2D3A4E] font-medium hover:bg-white/60'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <span
                                className="w-3.5 h-3.5 rounded-full border border-black/15 shrink-0 shadow-xs"
                                style={{ backgroundColor: c.hex }}
                              />
                              <span className="truncate">{c.name}</span>
                            </div>
                            {isSelected && <Check className="w-3.5 h-3.5 text-[#4B59BB] stroke-[2.5] shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Comment Text */}
              <div className="space-y-1">
                <label className="font-bold text-[#2D3A4E]">Текст отзыва *:</label>
                <textarea
                  rows={3}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Опишите ваши впечатления от посадки, ткани, деталей кроя..."
                  className="w-full p-3 rounded-xl neu-inset text-xs text-[#2D3A4E] placeholder:text-[#56647A] resize-none"
                />
              </div>

              {/* Pros */}
              <div className="space-y-1">
                <label className="font-bold text-[#2D3A4E]">Достоинства (необязательно):</label>
                <input
                  type="text"
                  value={prosText}
                  onChange={(e) => setProsText(e.target.value)}
                  placeholder="Например: качественная ткань, идеальный воротник"
                  className="w-full py-2 px-3.5 rounded-xl neu-inset text-xs text-[#2D3A4E] placeholder:text-[#56647A]"
                />
              </div>

              {/* Cons */}
              <div className="space-y-1">
                <label className="font-bold text-[#2D3A4E]">Недостатки (необязательно):</label>
                <input
                  type="text"
                  value={consText}
                  onChange={(e) => setConsText(e.target.value)}
                  placeholder="Например: маломерит на полразмера"
                  className="w-full py-2 px-3.5 rounded-xl neu-inset text-xs text-[#2D3A4E] placeholder:text-[#56647A]"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-2xl neu-button-accent text-white text-xs font-bold hover:scale-[1.01] active:scale-[0.98] transition-all cursor-pointer"
              >
                Опубликовать отзыв
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
