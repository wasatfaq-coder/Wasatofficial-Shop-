import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, X, Tag, Sparkles, Shirt, Layers, Package, Palette, ArrowRight, Check } from 'lucide-react';
import { Product } from '../types';
import { RatingBadge } from './RatingBadge';
import { photoBadgeClass } from '../utils/productBadge';
import { getProductRating } from '../utils/productRating';
import type { StoreCategory } from '../types';

interface AutocompleteSearchProps {
  /** From Admin → «Категории» */
  categories?: StoreCategory[];
  products: Product[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelectProduct: (product: Product) => void;
  onSelectCategory?: (category: string) => void;
  onSearchSubmit?: (query: string) => void;
  placeholder?: string;
  className?: string;
}

export const AutocompleteSearch: React.FC<AutocompleteSearchProps> = ({
  categories = [],
  products,
  searchQuery,
  onSearchChange,
  onSelectProduct,
  onSelectCategory,
  onSearchSubmit,
  placeholder = 'Поиск по названию, артикулу, цвету...',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside or Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const cleanQuery = searchQuery.trim().toLowerCase();

  // Search logic across Categories, SKU/Article, Colors, Titles, Materials
  const searchResults = useMemo(() => {
    if (!cleanQuery) {
      return {
        matchedCategories: [],
        matchedColors: [],
        matchedProducts: [],
      };
    }

    // Matched categories
    const matchedCategories = categories.filter(
      (c) => c.name.toLowerCase().includes(cleanQuery) || c.id.toLowerCase().includes(cleanQuery)
    );

    // Collect matching unique color names across products
    const colorSet = new Set<{ name: string; hex: string }>();
    products.forEach((p) => {
      (p.colors || []).forEach((c) => {
        if (c?.name && c.name.toLowerCase().includes(cleanQuery)) {
          colorSet.add(c);
        }
      });
    });
    const matchedColors = Array.from(colorSet);

    // Matched products by Title, SKU/ID, CategoryLabel, Colors, Material, Description
    const matchedProducts = products.filter((p) => {
      const matchTitle = (p.title || '').toLowerCase().includes(cleanQuery);
      const matchSku = (p.id || '').toLowerCase().includes(cleanQuery);
      const matchCategoryLabel = (p.categoryLabel || '').toLowerCase().includes(cleanQuery);
      const matchMaterial = (p.material || '').toLowerCase().includes(cleanQuery);
      const matchDesc = (p.description || '').toLowerCase().includes(cleanQuery);
      const matchColor = (p.colors || []).some((c) => c?.name && c.name.toLowerCase().includes(cleanQuery));

      return (
        matchTitle || matchSku || matchCategoryLabel || matchMaterial || matchDesc || matchColor
      );
    });

    return {
      matchedCategories,
      matchedColors,
      matchedProducts,
    };
  }, [products, categories, cleanQuery]);

  const hasResults =
    cleanQuery.length > 0 &&
    (searchResults.matchedCategories.length > 0 ||
      searchResults.matchedColors.length > 0 ||
      searchResults.matchedProducts.length > 0);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onSearchChange(val);
    if (val.trim()) {
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  const handleClear = () => {
    onSearchChange('');
    setIsOpen(false);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsOpen(false);
    if (onSearchSubmit) {
      onSearchSubmit(searchQuery);
    }
  };

  const handleCategoryClick = (catId: string) => {
    setIsOpen(false);
    if (onSelectCategory) {
      onSelectCategory(catId);
    }
  };

  const handleProductClick = (product: Product) => {
    setIsOpen(false);
    onSelectProduct(product);
  };

  const handleColorClick = (colorName: string) => {
    onSearchChange(colorName);
    setIsOpen(true);
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Search Input Form */}
      <form onSubmit={handleFormSubmit} className="relative flex items-center">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#4E5C70]">
          <Search className="w-4 h-4 stroke-[2]" />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={handleInputChange}
          onFocus={() => {
            if (cleanQuery) setIsOpen(true);
          }}
          placeholder={placeholder}
          className="w-full neu-inset rounded-full h-11 py-2.5 pl-9 pr-8 text-[13px] text-[#2D3A4E] placeholder:text-[#56647A] transition-all"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute inset-y-0 right-3 flex items-center text-[#4E5C70] hover:text-[#2D3A4E] transition-colors cursor-pointer"
            aria-label="Закрыть"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </form>

      {/* Autocomplete Dropdown Popup */}
      {isOpen && cleanQuery.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-2 z-50 neu-dropdown rounded-3xl p-4 border border-white/90 space-y-4 max-h-[75vh] overflow-y-auto no-scrollbar animate-in fade-in duration-200">
          {/* 1. Category Matches */}
          {searchResults.matchedCategories.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#4E5C70] uppercase tracking-wider px-1">
                <Tag className="w-3.5 h-3.5 text-accent" />
                <span>Категории</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {searchResults.matchedCategories.map((cat, catIdx) => (
                  <button
                    key={`search-cat-${cat.id}-${catIdx}`}
                    type="button"
                    onClick={() => handleCategoryClick(cat.id)}
                    className="neu-button px-3.5 py-1.5 rounded-full text-xs font-extrabold text-[#2D3A4E] hover:text-accent flex items-center gap-1.5 active:scale-95 transition-transform cursor-pointer"
                  >
                    <span>{cat.name}</span>
                    <ArrowRight className="w-3 h-3 text-[#4E5C70]" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 2. Color Matches */}
          {searchResults.matchedColors.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#4E5C70] uppercase tracking-wider px-1">
                <Palette className="w-3.5 h-3.5 text-accent" />
                <span>Найденные цвета</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {searchResults.matchedColors.map((color, idx) => (
                  <button
                    key={`search-color-${color.name}-${idx}`}
                    type="button"
                    onClick={() => handleColorClick(color.name)}
                    className="neu-flat-sm px-3 py-1 rounded-full text-xs font-bold text-[#2D3A4E] hover:text-accent flex items-center gap-2 border border-white/80 active:scale-95 transition-transform cursor-pointer"
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-black/15"
                      style={{ backgroundColor: color.hex }}
                    />
                    <span>{color.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 3. Products List with Instant Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-[#4E5C70] uppercase tracking-wider px-1">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-accent" />
                <span>Товары ({searchResults.matchedProducts.length})</span>
              </span>
              {searchResults.matchedProducts.length > 0 && (
                <span className="text-[11px] text-[#4E5C70] font-normal">
                  Артикул / Модель
                </span>
              )}
            </div>

            {searchResults.matchedProducts.length === 0 ? (
              <div className="neu-inset rounded-2xl p-4 text-center space-y-1">
                <p className="text-xs font-bold text-[#2D3A4E]">Ничего не найдено</p>
                <p className="text-[11px] text-[#4E5C70]">
                  Попробуйте поискать по категории (рубашки, куртки) или артикулу.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {searchResults.matchedProducts.slice(0, 5).map((product, pIdx) => (
                  <div
                    key={`search-prod-${product.id}-${pIdx}`}
                    onClick={() => handleProductClick(product)}
                    className="neu-flat-sm rounded-2xl p-2.5 flex items-center justify-between gap-3 border border-white/80 hover:border-accent/60 cursor-pointer active:scale-[0.99] transition-all group"
                  >
                    {/* Thumbnail */}
                    <div className="w-12 h-12 rounded-xl overflow-hidden neu-inset p-0.5 shrink-0">
                      <img
                        src={product.images?.[0] || 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600&auto=format&fit=crop&q=80'}
                        alt={product.title}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover object-top rounded-lg group-hover:scale-105 transition-transform"
                      />
                    </div>

                    {/* Product Details */}
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-extrabold text-[#2D3A4E] truncate group-hover:text-accent transition-colors">
                          {product.title}
                        </span>
                        {product.badge && (
                          <span className={`text-[11px] font-black ${photoBadgeClass(product.badge)} px-1.5 py-0.5 rounded-md shrink-0`}>
                            {product.badge}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-[#4E5C70] font-medium">
                        <span className="truncate">{product.categoryLabel}</span>
                      </div>

                      {/* Color dots preview */}
                      <div className="flex items-center gap-1 pt-0.5">
                        {product.colors.map((c, i) => (
                          <span
                            key={`search-prod-col-${product.id}-${c.name}-${i}`}
                            className="w-2.5 h-2.5 rounded-full border border-[#BAC5D5]"
                            style={{ backgroundColor: c.hex }}
                            title={c.name}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Price & Rating Action */}
                    <div className="text-right shrink-0 space-y-1">
                      <RatingBadge rating={getProductRating(product)?.rating} className="ml-auto" />
                      <div>
                        <span className="text-xs font-black text-[#2D3A4E] block">
                          {product.price.toLocaleString('ru-RU')} ₽
                        </span>
                        {product.originalPrice && (
                          <span className="text-[11px] text-[#4E5C70] line-through block">
                            {product.originalPrice.toLocaleString('ru-RU')} ₽
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer View All Action */}
          {searchResults.matchedProducts.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                if (onSearchSubmit) onSearchSubmit(searchQuery);
              }}
              className="w-full py-2.5 neu-button rounded-2xl text-xs font-extrabold text-[#2D3A4E] hover:text-accent flex items-center justify-center gap-2 active:scale-[0.98] transition-all border border-white cursor-pointer"
            >
              <span>Смотреть все результаты ({searchResults.matchedProducts.length})</span>
              <ArrowRight className="w-4 h-4 stroke-[2.5]" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
