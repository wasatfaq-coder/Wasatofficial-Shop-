import React, { useMemo, useState } from 'react';
import { Heart, ArrowRight, Trash2, ShoppingBag } from 'lucide-react';
import { Product, ActiveTab } from '../types';
import { ProductCard } from '../components/ProductCard';
import { hasOrderableVariant } from '../utils/variantSelection';
import { buyerPrice } from '../utils/wholesaleOffer';

interface FavoritesScreenProps {
  products: Product[];
  favorites: string[];
  onSelectProduct: (product: Product) => void;
  onToggleFavorite: (product: Product, e: React.MouseEvent) => void;
  /** false — nothing added yet (the customer is asked for a size) */
  onAddToCart: (product: Product, e: React.MouseEvent) => boolean | void;
  onClearFavorites?: () => void;
  preorderMode?: boolean;
  setActiveTab: (tab: ActiveTab) => void;
}

type FavSort = 'default' | 'price_asc' | 'price_desc';

export const FavoritesScreen: React.FC<FavoritesScreenProps> = ({
  products,
  favorites,
  onSelectProduct,
  onToggleFavorite,
  onAddToCart,
  onClearFavorites,
  preorderMode = false,
  setActiveTab,
}) => {
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [sortBy, setSortBy] = useState<FavSort>('default');
  const [confirmClear, setConfirmClear] = useState(false);

  const favoriteProducts = useMemo(
    () => products.filter((p) => favorites.includes(p.id)),
    [products, favorites]
  );

  const displayedProducts = useMemo(() => {
    const filtered = onlyInStock
      ? favoriteProducts.filter((p) => hasOrderableVariant(p, preorderMode))
      : favoriteProducts;
    if (sortBy === 'price_asc') {
      return [...filtered].sort((a, b) => buyerPrice(a) - buyerPrice(b));
    }
    if (sortBy === 'price_desc') {
      return [...filtered].sort((a, b) => buyerPrice(b) - buyerPrice(a));
    }
    return filtered;
  }, [favoriteProducts, onlyInStock, sortBy, preorderMode]);

  if (favoriteProducts.length === 0) {
    return (
      <div className="py-12 space-y-5 text-center animate-in fade-in duration-300">
        <div className="w-24 h-24 rounded-full neu-flat flex items-center justify-center mx-auto text-danger">
          <Heart className="w-10 h-10 stroke-[1.5]" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-text-primary">Избранных товаров пока нет</h2>
          <p className="text-xs text-text-secondary max-w-xs mx-auto">
            Нажимайте сердечко на понравившихся моделях, чтобы легко найти их позже
          </p>
        </div>
        <button
          onClick={() => setActiveTab('catalog')}
          className="neu-button-accent rounded-full px-6 py-3 font-bold text-xs inline-flex items-center gap-2 cursor-pointer"
        >
          <span>В каталог</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-28 lg:pb-10 animate-in fade-in duration-300">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <h2 className="text-base font-bold text-text-primary">
          Сохраненные модели ({favoriteProducts.length})
        </h2>

        {onClearFavorites && (
          <div className="flex items-center gap-1.5">
            {confirmClear ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onClearFavorites();
                    setConfirmClear(false);
                  }}
                  className="px-2.5 py-1.5 rounded-xl neu-tone-danger text-[11px] font-extrabold text-danger cursor-pointer"
                >
                  Точно очистить
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="px-2.5 py-1.5 rounded-xl neu-button text-[11px] font-bold text-text-secondary cursor-pointer"
                >
                  Отмена
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="px-2.5 py-1.5 rounded-xl neu-button text-[11px] font-bold text-text-secondary hover:text-danger inline-flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Очистить</span>
              </button>
            )}
          </div>
        )}
      </div>

      {favoriteProducts.length > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <button
            type="button"
            aria-pressed={onlyInStock}
            onClick={() => setOnlyInStock((v) => !v)}
            className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 ${
              onlyInStock
                ? 'neu-inset text-accent ring-1 ring-accent/40'
                : 'neu-button text-text-secondary hover:text-text-primary'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Только в наличии</span>
          </button>

          <div className="flex items-center gap-1.5">
            {(
              [
                { id: 'default', label: 'По порядку' },
                { id: 'price_asc', label: 'Дешевле' },
                { id: 'price_desc', label: 'Дороже' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                aria-pressed={sortBy === opt.id}
                onClick={() => setSortBy(opt.id)}
                className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                  sortBy === opt.id
                    ? 'neu-inset text-accent ring-1 ring-accent/40'
                    : 'neu-button text-text-secondary hover:text-text-primary'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {displayedProducts.length === 0 ? (
        <div className="neu-flat rounded-3xl p-6 text-center space-y-2">
          <p className="text-xs font-bold text-text-primary">Среди избранных товаров сейчас нет моделей в наличии</p>
          <button
            type="button"
            onClick={() => setOnlyInStock(false)}
            className="px-4 py-2 rounded-xl neu-button text-xs font-bold text-accent cursor-pointer"
          >
            Показать все ({favoriteProducts.length})
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 lg:gap-5">
          {displayedProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              isFavorite={true}
              onSelect={onSelectProduct}
              onToggleFavorite={onToggleFavorite}
              onAddToCart={onAddToCart}
            />
          ))}
        </div>
      )}
    </div>
  );
};

