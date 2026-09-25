import React from 'react';
import { Heart, ArrowRight } from 'lucide-react';
import { Product, ActiveTab } from '../types';
import { ProductCard } from '../components/ProductCard';

interface FavoritesScreenProps {
  products: Product[];
  favorites: string[];
  cartItemIds: string[];
  onSelectProduct: (product: Product) => void;
  onToggleFavorite: (product: Product, e: React.MouseEvent) => void;
  onAddToCart: (product: Product, e: React.MouseEvent) => void;
  setActiveTab: (tab: ActiveTab) => void;
}

export const FavoritesScreen: React.FC<FavoritesScreenProps> = ({
  products,
  favorites,
  cartItemIds,
  onSelectProduct,
  onToggleFavorite,
  onAddToCart,
  setActiveTab,
}) => {
  const favoriteProducts = products.filter((p) => favorites.includes(p.id));

  if (favoriteProducts.length === 0) {
    return (
      <div className="py-12 space-y-5 text-center animate-in fade-in duration-300">
        <div className="w-24 h-24 rounded-full neu-flat flex items-center justify-center mx-auto text-rose-400">
          <Heart className="w-10 h-10 stroke-[1.5]" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-slate-900">Избранных товаров пока нет</h2>
          <p className="text-xs text-slate-500 max-w-xs mx-auto">
            Нажимайте сердечко на понравившихся моделях, чтобы легко найти их позже
          </p>
        </div>
        <button
          onClick={() => setActiveTab('catalog')}
          className="neu-button-primary rounded-full px-6 py-3 font-bold text-xs inline-flex items-center gap-2 cursor-pointer"
        >
          <span>В каталог</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-28 animate-in fade-in duration-300">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-base font-bold text-slate-900">
          Сохраненные модели ({favoriteProducts.length})
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-3.5">
        {favoriteProducts.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            isFavorite={true}
            isInCart={cartItemIds.includes(product.id)}
            onSelect={onSelectProduct}
            onToggleFavorite={onToggleFavorite}
            onAddToCart={onAddToCart}
          />
        ))}
      </div>
    </div>
  );
};
