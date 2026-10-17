import React, { useState } from 'react';
import { Palette, Plus, Ruler, X } from 'lucide-react';
import type { Product } from '../../../types';
import { UNKNOWN_COLOR_HEX, colorHexForName, storeColorsOf, storeSizesOf } from '../../../utils/colorCode';
import { AdminHint } from '../AdminHint';
import type { StorefrontSectionProps } from './storefrontForm';

interface StorefrontPaletteSectionProps extends StorefrontSectionProps {
  products?: Product[];
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

/**
 * «Витрина» → «Цвета и размеры товаров» (быстрое заведение товаров с телефона, этап 1):
 * единая палитра цветов и сетка размеров магазина, которые показываются готовыми чипами в форме товара.
 */
export const StorefrontPaletteSection: React.FC<StorefrontPaletteSectionProps> = ({
  settings,
  patch,
  products = [],
  onShowToast,
}) => {
  const colors = storeColorsOf(settings, products);
  const sizes = storeSizesOf(settings, products);

  const [newColorName, setNewColorName] = useState('');
  const [newColorHex, setNewColorHex] = useState('#1A1A1A');
  const [colorHexTouched, setColorHexTouched] = useState(false);
  const [newSizeInput, setNewSizeInput] = useState('');

  const handleColorNameChange = (value: string) => {
    setNewColorName(value);
    if (!colorHexTouched && value.trim()) {
      setNewColorHex(colorHexForName(value) ?? UNKNOWN_COLOR_HEX);
    }
  };

  const handleAddColor = () => {
    const trimmed = newColorName.trim();
    if (!trimmed) return;
    if (colors.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
      onShowToast(`Цвет «${trimmed}» уже есть в палитре`, 'info');
      return;
    }
    if (colors.length >= 40) {
      onShowToast('В палитре магазина может быть не больше 40 цветов', 'info');
      return;
    }
    const hex = /^#[0-9A-Fa-f]{6}$/.test(newColorHex)
      ? newColorHex.toUpperCase()
      : (colorHexForName(trimmed) ?? UNKNOWN_COLOR_HEX);
    patch({ productColors: [...colors, { name: trimmed, hex }] });
    setNewColorName('');
    setNewColorHex('#1A1A1A');
    setColorHexTouched(false);
  };

  const handleRemoveColor = (name: string) => {
    patch({ productColors: colors.filter((c) => c.name !== name) });
  };

  const handleAddSize = () => {
    const trimmed = newSizeInput.trim();
    if (!trimmed) return;
    if (sizes.some((s) => s.toLowerCase() === trimmed.toLowerCase())) {
      onShowToast(`Размер «${trimmed}» уже есть в списке`, 'info');
      return;
    }
    if (sizes.length >= 30) {
      onShowToast('В списке магазина может быть не больше 30 размеров', 'info');
      return;
    }
    patch({ productSizes: [...sizes, trimmed] });
    setNewSizeInput('');
  };

  const handleRemoveSize = (size: string) => {
    patch({ productSizes: sizes.filter((s) => s !== size) });
  };

  return (
    <div className="neu-flat rounded-3xl p-4 sm:p-5 space-y-4">
      <div className="flex items-center gap-2.5 pb-2.5 neu-divider-b">
        <div className="w-8 h-8 rounded-xl neu-inset flex items-center justify-center text-accent shrink-0">
          <Palette className="w-4 h-4 shrink-0" />
        </div>
        <div>
          <h3 className="font-display font-bold text-sm text-text-primary flex items-center gap-1.5">
            Цвета и размеры товаров
            <AdminHint label="Цвета и размеры товаров">
              Чипы для быстрого добавления вариантов в карточке товара в одно касание на телефоне.
            </AdminHint>
          </h3>
          <p className="text-[11px] text-text-muted">
            Готовые кнопки цветов и размеров в форме создания и редактирования товара
          </p>
        </div>
      </div>

      {/* Палитра цветов */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-text-secondary">
            Палитра цветов магазина ({colors.length}/40)
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Палитра цветов магазина">
          {colors.map((c) => (
            <div
              key={c.name}
              className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-xl neu-inset text-xs font-semibold text-text-primary"
            >
              <span
                className="w-3.5 h-3.5 rounded-full border border-slate-300 shrink-0"
                style={{ backgroundColor: c.hex }}
              />
              <span>{c.name}</span>
              <button
                type="button"
                onClick={() => handleRemoveColor(c.name)}
                aria-label={`Удалить цвет из палитры: ${c.name}`}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-danger transition-colors cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 pt-1">
          <label
            className="relative flex items-center justify-center w-9 h-9 rounded-xl neu-button cursor-pointer shrink-0"
            title="Оттенок цвета"
          >
            <input
              type="color"
              aria-label="Оттенок нового цвета палитры"
              value={/^#[0-9A-Fa-f]{6}$/.test(newColorHex) ? newColorHex : '#1A1A1A'}
              onChange={(e) => {
                setNewColorHex(e.target.value.toUpperCase());
                setColorHexTouched(true);
              }}
              className="sr-only"
            />
            <span
              className="w-5 h-5 rounded-full border border-slate-300"
              style={{ backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(newColorHex) ? newColorHex : '#1A1A1A' }}
            />
          </label>
          <input
            type="text"
            aria-label="Название цвета для палитры"
            value={newColorName}
            onChange={(e) => handleColorNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddColor();
              }
            }}
            placeholder="Новый цвет (например: Графит, Олива)"
            className="flex-1 min-w-[160px] neu-inset rounded-xl px-3 py-2 text-xs text-text-primary"
          />
          <button
            type="button"
            onClick={handleAddColor}
            className="px-3 py-2 rounded-xl neu-button text-xs font-bold text-text-primary hover:text-accent flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" /> Добавить цвет
          </button>
        </div>
      </div>

      {/* Сетка размеров */}
      <div className="space-y-2.5 pt-3 neu-divider-t">
        <div className="flex items-center gap-1.5">
          <Ruler className="w-3.5 h-3.5 text-accent shrink-0" />
          <span className="text-xs font-bold text-text-secondary">
            Размеры магазина ({sizes.length}/30)
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Размеры магазина">
          {sizes.map((size) => (
            <div
              key={size}
              className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-xl neu-inset text-xs font-bold text-text-primary"
            >
              <span>{size}</span>
              <button
                type="button"
                onClick={() => handleRemoveSize(size)}
                aria-label={`Удалить размер из палитры: ${size}`}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-danger transition-colors cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <input
            type="text"
            aria-label="Новый размер для палитры"
            value={newSizeInput}
            onChange={(e) => setNewSizeInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddSize();
              }
            }}
            placeholder="Новый размер (например: 46 (S) или 3XL)"
            className="flex-1 neu-inset rounded-xl px-3 py-2 text-xs text-text-primary"
          />
          <button
            type="button"
            onClick={handleAddSize}
            className="px-3 py-2 rounded-xl neu-button text-xs font-bold text-text-primary hover:text-accent flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" /> Добавить размер
          </button>
        </div>
      </div>
    </div>
  );
};
