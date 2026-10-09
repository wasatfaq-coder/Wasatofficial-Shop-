import React from 'react';
import { Clock, Heart, Trash2, X } from 'lucide-react';
import { Product } from '../types';
import { RatingBadge } from './RatingBadge';
import { NeumorphicImage } from './NeumorphicImage';
import { photoBadgeClass, shownBadge, shownOldPrice } from '../utils/productBadge';
import { getProductRating } from '../utils/productRating';
import { useProductThumbs } from '../utils/productThumbs';
import { productHref } from '../utils/navigation';

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
  const photoOf = useProductThumbs(recentlyViewed ?? []);
  if (!recentlyViewed || recentlyViewed.length === 0) {
    return null;
  }

  return (
    <div className={`space-y-3 pt-2 ${className}`}>
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl neu-inset flex items-center justify-center text-accent">
            <Clock className="w-4 h-4 stroke-[2.2]" />
          </div>
          <h3 className="text-sm font-bold text-[#2D3A4E] tracking-tight">{title}</h3>
          <span className="text-[11px] font-bold text-[#4E5C70] neu-photo-badge px-2 py-0.5 rounded-full">
            {recentlyViewed.length}
          </span>
        </div>

        {onClearRecentlyViewed && (
          <button
            onClick={onClearRecentlyViewed}
            className="neu-button-danger rounded-xl px-2.5 py-1 text-[11px] font-bold transition-colors flex items-center gap-1.5"
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
          const thumbImage = photoOf(product);

          return (
            <div
              key={`recently-viewed-${product.id}-${idx}`}
              className="group relative neu-flat-sm rounded-2xl overflow-hidden w-36 sm:w-40 shrink-0 transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98] flex flex-col justify-between select-none"
            >
              <div className="space-y-2">
                {/* Thumbnail Image Container */}
                <div className="relative w-full aspect-[3/4] overflow-hidden mb-1">
                  <NeumorphicImage
                    src={thumbImage}
                    alt=""
                    priority={idx < 2}
                    containerClassName="w-full h-full"
                    className="w-full h-full object-cover object-top group-hover:scale-[1.03] transition-transform duration-500"
                  />

                  {/* Remove Button from History */}
                  {onRemoveFromRecentlyViewed && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveFromRecentlyViewed(product.id);
                      }}
                      className="absolute top-1.5 left-1.5 w-8 h-8 rounded-full neu-photo-btn flex items-center justify-center text-[#4E5C70] hover:text-danger transition-transform z-10"
                      title="Удалить из истории"
                      aria-label={`Удалить из истории: ${product.title}`}
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
                      className="absolute top-1.5 right-1.5 w-8 h-8 rounded-full neu-photo-btn flex items-center justify-center text-[#4E5C70] hover:text-danger transition-transform z-10"
                      title={isFav ? 'Убрать из избранного' : 'В избранное'}
                      aria-label={`В избранное: ${product.title}`}
                      aria-pressed={isFav}
                    >
                      <Heart
                        className={`w-3.5 h-3.5 ${
                          isFav ? 'fill-danger text-danger' : 'text-[#4E5C70]'
                        }`}
                      />
                    </button>
                  )}

                  {/* Badge */}
                  {shownBadge(product) && (
                    <span className={`absolute bottom-1.5 left-1.5 ${photoBadgeClass(shownBadge(product)!)} font-bold text-[11px] uppercase px-2 py-0.5 rounded-full z-10`}>
                      {shownBadge(product)}
                    </span>
                  )}
                </div>

                {/* Info */}
                <div className="space-y-0.5 px-2.5">
                  <p className="text-[11px] font-bold text-[#4E5C70] uppercase tracking-wider truncate">
                    {product.categoryLabel}
                  </p>
                  {/* The card opens with its title link stretched over it, as ProductCard (Tab reaches it) */}
                  <h4 className="text-xs font-bold text-[#2D3A4E] truncate leading-tight group-hover:text-accent transition-colors">
                    <a
                      href={productHref(product.id)}
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                        e.preventDefault();
                        onSelectProduct(product);
                      }}
                      className="rounded-md cursor-pointer after:absolute after:inset-0 after:rounded-2xl after:content-['']"
                    >
                      {product.title}
                    </a>
                  </h4>
                </div>
              </div>

              {/* Price & Rating */}
              <div className="pt-2 mt-1 mx-2.5 mb-2.5 border-t border-[#BAC5D5]/40 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-[#2D3A4E]">
                    {product.price.toLocaleString('ru-RU')} ₽
                  </span>
                  {shownOldPrice(product) !== null && (
                    <span className="text-[11px] text-[#4E5C70] line-through block leading-none">
                      {shownOldPrice(product)!.toLocaleString('ru-RU')} ₽
                    </span>
                  )}
                </div>
                <RatingBadge rating={getProductRating(product)?.rating} size="sm" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

