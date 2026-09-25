import React, { useState } from 'react';
import { Plus, Eye, Check, Star } from 'lucide-react';
import { Product } from '../types';
import { NeumorphicImage } from './NeumorphicImage';
import { AnimatedFavoriteButton } from './AnimatedFavoriteButton';

interface ProductCardProps {
  product: Product;
  isFavorite: boolean;
  isInCart: boolean;
  onSelect: (product: Product) => void;
  onToggleFavorite: (product: Product, e: React.MouseEvent) => void;
  onAddToCart: (product: Product, e: React.MouseEvent) => void;
  onQuickView?: (product: Product, e: React.MouseEvent) => void;
  className?: string;
  priority?: boolean;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  isFavorite,
  isInCart,
  onSelect,
  onToggleFavorite,
  onAddToCart,
  onQuickView,
  className = '',
  priority = false,
}) => {
  const [justAdded, setJustAdded] = useState(false);

  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAddToCart(product, e);
    setJustAdded(true);
    setTimeout(() => {
      setJustAdded(false);
    }, 1000);
  };

  const mainImage = product.images && product.images.length > 0 ? product.images[0] : '';
  const formattedRating = (Math.round((product.rating || 5) * 10) / 10).toFixed(1);

  // Calculate discount percentage if old price exists
  const discountPercent =
    product.originalPrice && product.originalPrice > product.price
      ? Math.round((1 - product.price / product.originalPrice) * 100)
      : null;

  return (
    <div
      onClick={() => onSelect(product)}
      className={`group neu-inset neu-product-card rounded-3xl p-3 flex flex-col justify-between cursor-pointer select-none h-full bg-[#E3E8EF] border border-transparent/60 hover:border-white/90 ${className}`}
    >
      {/* Product Image Box: Strictly 3:4 aspect ratio */}
      <div className="relative w-full aspect-[3/4] rounded-2xl overflow-hidden mb-2.5 group/img shrink-0">
        <NeumorphicImage
          src={mainImage}
          alt={product.title}
          priority={priority}
          loading={priority ? 'eager' : 'lazy'}
          containerClassName="w-full h-full rounded-2xl"
          className="w-full h-full object-cover object-center rounded-xl transition-transform duration-300 group-hover:scale-105"
        />

        {/* Badge in top-left corner */}
        {product.badge && (
          <div className="absolute top-2.5 left-2.5 z-10">
            <span className="h-6 px-2.5 rounded-full neu-photo-badge text-[10px] tracking-wider uppercase text-[#2D3A4E] font-bold inline-flex items-center justify-center leading-none">
              {product.badge}
            </span>
          </div>
        )}

        {/* Favorite & QuickView Buttons in bottom-right corner of photo */}
        <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5 z-10">
          {onQuickView && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onQuickView(product, e);
              }}
              className="w-7 h-7 rounded-full neu-photo-btn flex items-center justify-center text-[#5C6B80] hover:text-[#2D3A4E] transition-transform active:scale-90"
              title="Быстрый просмотр"
              aria-label="Быстрый просмотр"
            >
              <Eye className="w-3.5 h-3.5 stroke-[1.8]" />
            </button>
          )}
          <AnimatedFavoriteButton
            isFavorite={isFavorite}
            onToggle={(e) => onToggleFavorite(product, e)}
            size="sm"
            className="neu-photo-btn"
          />
        </div>
      </div>

      {/* Product Details */}
      <div className="flex flex-col flex-1 justify-between gap-1.5 px-0.5">
        <div>
          {/* Category & Rating Row */}
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="text-[10px] font-bold text-[#5C6B80] uppercase tracking-wider truncate">
              {product.categoryLabel}
            </span>
            <div className="flex items-center gap-1 font-bold text-[#2D3A4E] text-[11px] shrink-0">
              <Star className="w-3 h-3 fill-[#5C6B80] text-[#5C6B80] shrink-0" strokeWidth={0} />
              <span>{formattedRating}</span>
            </div>
          </div>

          {/* Title - fixed 2 lines baseline */}
          <h3 className="text-[14px] font-semibold text-[#2D3A4E] line-clamp-2 leading-snug break-words min-h-[38px]">
            {product.title}
          </h3>
        </div>

        {/* Price & Add to Cart Action */}
        <div className="flex items-end justify-between pt-1 mt-auto gap-1">
          <div className="flex flex-col min-h-[36px] justify-end">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[15px] font-bold text-[#2D3A4E] leading-none">
                {product.price.toLocaleString('ru-RU')} ₽
              </span>
              {discountPercent ? (
                <span className="text-[10px] font-bold text-[#5F6ED0] bg-[#E3E8EF] px-1.5 py-0.5 rounded-md border border-white/60 leading-none">
                  -{discountPercent}%
                </span>
              ) : null}
            </div>
            {product.originalPrice && product.originalPrice > product.price ? (
              <span className="text-[12px] text-[#6B7280] line-through font-normal leading-tight mt-0.5">
                {product.originalPrice.toLocaleString('ru-RU')} ₽
              </span>
            ) : (
              <span className="text-[12px] opacity-0 font-normal leading-tight mt-0.5 select-none" aria-hidden="true">
                0 ₽
              </span>
            )}
          </div>

          {/* Add to cart: secondary action repeated on every card, so not filled */}
          <button
            onClick={handleAddToCart}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all shrink-0 mb-0.5 cursor-pointer ${
              justAdded
                ? 'neu-inset text-[#3F6E58]'
                : 'neu-button text-[#5F6ED0]'
            }`}
            aria-label={justAdded ? 'Добавлено в корзину' : 'Добавить в корзину'}
            title={justAdded ? 'Добавлено в корзину' : 'Добавить в корзину'}
          >
            {justAdded ? (
              <Check className="w-4 h-4 stroke-[3] animate-in zoom-in-50 duration-200" />
            ) : (
              <Plus className="w-4 h-4 stroke-[2.5]" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

