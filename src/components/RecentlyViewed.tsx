import React from 'react';
import { Clock, Heart, Trash2, X } from 'lucide-react';
import { Product } from '../types';
import { RatingBadge } from './RatingBadge';
import { NeumorphicImage } from './NeumorphicImage';

interface RecentlyViewedProps {
  recentlyViewed: Product[];
  onSelectProduct: (product: Product) => void;
  onToggleFavorite?: (product: Product, e: React.MouseEvent) => void;
  onClearRecentlyViewed?: () => void;
  onRemoveFromRecentlyViewed?: (productId: string) => void;
  favorites?: string[];
  title?: string;
  className?: string;
}

export const RecentlyViewed: React.FC<RecentlyViewedProps> = ({
  recentlyViewed,
  onSelectProduct,
  onToggleFavorite,
  onClearRecentlyViewed,
  onRemoveFromRecentlyViewed,
  favorites = [],
  title = 'Вы недавно смотрели',
  className = '',
}) => {
  if (!recentlyViewed || recentlyViewed.length === 0) {
    return null;
  }

  return (
    <div className={`space-y-3 pt-2 ${className}`}>
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl neu-inset flex items-center justify-center text-[#5F6ED0] bg-[#E3E8EF]">
            <Clock className="w-4 h-4 stroke-[2.2]" />
          </div>
          <h3 className="text-sm font-bold text-[#2D3A4E] tracking-tight">{title}</h3>
          <span className="text-[11px] font-bold text-[#5C6B80] neu-photo-badge px-2 py-0.5 rounded-full">
            {recentlyViewed.length}
          </span>
        </div>

        {onClearRecentlyViewed && (
          <button
            onClick={onClearRecentlyViewed}
            className="neu-button-danger rounded-xl px-2.5 py-1 text-[11px] font-bold transition-colors flex items-center gap-1.5 active:scale-95"
            title="Очистить историю просмотров"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Очистить</span>
          </button>
        )}
      </div>

      <div className="flex items-stretch gap-3.5 overflow-x-auto no-scrollbar pb-3 pt-1 px-1">
        {recentlyViewed.map((product, idx) => {
          const isFav = favorites.includes(product.id);
          const thumbImage = product.images && product.images.length > 0 ? product.images[0] : '';

          return (
            <div
              key={`recently-viewed-${product.id}-${idx}`}
              onClick={() => onSelectProduct(product)}
              className="group relative neu-inset rounded-2xl p-2.5 w-36 sm:w-40 shrink-0 cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] flex flex-col justify-between select-none bg-[#E3E8EF] border border-transparent"
            >
              <div className="space-y-2">
                {/* Thumbnail Image Container */}
                <div className="relative w-full aspect-[3/4] rounded-xl overflow-hidden mb-1">
                  <NeumorphicImage
                    src={thumbImage}
                    alt={product.title}
                    priority={idx < 2}
                    containerClassName="w-full h-full rounded-xl"
                    className="w-full h-full object-cover object-top rounded-xl group-hover:scale-105 transition-transform duration-300"
                  />

                  {/* Remove Button from History */}
                  {onRemoveFromRecentlyViewed && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveFromRecentlyViewed(product.id);
                      }}
                      className="absolute top-1.5 left-1.5 w-6 h-6 rounded-full neu-photo-btn flex items-center justify-center text-[#5C6B80] hover:text-danger transition-transform active:scale-90 z-10"
                      title="Удалить из истории"
                      aria-label="Удалить из истории"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Favorite Button */}
                  {onToggleFavorite && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(product, e);
                      }}
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full neu-photo-btn flex items-center justify-center text-[#5C6B80] hover:text-danger transition-transform active:scale-90 z-10"
                      title="В избранное"
                      aria-label="В избранное"
                    >
                      <Heart
                        className={`w-3.5 h-3.5 ${
                          isFav ? 'fill-danger text-danger' : 'text-[#5C6B80]'
                        }`}
                      />
                    </button>
                  )}

                  {/* Badge */}
                  {product.badge && (
                    <span className="absolute bottom-1.5 left-1.5 neu-photo-badge font-bold text-[9px] uppercase px-2 py-0.5 rounded-full text-[#2D3A4E] z-10">
                      {product.badge}
                    </span>
                  )}
                </div>

                {/* Info */}
                <div className="space-y-0.5">
                  <p className="text-[10px] font-bold text-[#5C6B80] uppercase tracking-wider truncate">
                    {product.categoryLabel}
                  </p>
                  <h4 className="text-xs font-bold text-[#2D3A4E] truncate leading-tight group-hover:text-[#5F6ED0] transition-colors">
                    {product.title}
                  </h4>
                </div>
              </div>

              {/* Price & Rating */}
              <div className="pt-2 mt-1 border-t border-[#BAC5D5]/40 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-[#2D3A4E]">
                    {product.price.toLocaleString('ru-RU')} ₽
                  </span>
                  {product.originalPrice && (
                    <span className="text-[9px] text-[#5C6B80] line-through block leading-none">
                      {product.originalPrice.toLocaleString('ru-RU')} ₽
                    </span>
                  )}
                </div>
                <RatingBadge rating={product.rating} size="sm" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

