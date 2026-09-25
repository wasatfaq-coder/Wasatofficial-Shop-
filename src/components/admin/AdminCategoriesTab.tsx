import React from 'react';
import type { Product, StoreCategory, StorefrontSettings } from '../../types';
import { CATEGORY_ICONS, categoriesFromProducts, categoryIcon, categoryIdFromName } from '../../utils/categories';
import { AdminListEditor } from './AdminListEditor';

interface AdminCategoriesTabProps {
  settings: StorefrontSettings;
  products: Product[];
  onUpdateSettings?: (settings: StorefrontSettings) => void;
  /** Renaming a category also updates the name stored on its products (categoryLabel) */
  onUpdateProducts?: (products: Product[]) => void;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

/** Admin → «Категории»: the one category list for the storefront, filters, catalog and promos */
export const AdminCategoriesTab: React.FC<AdminCategoriesTabProps> = ({
  settings,
  products,
  onUpdateSettings,
  onUpdateProducts,
  onShowToast,
}) => {
  const categories = settings.categories ?? [];
  const productCount = (id: string) => products.filter((p) => p.category === id).length;

  return (
    <AdminListEditor<StoreCategory>
      title="Категории товаров"
      description="Используются на главной, в каталоге, поиске, карточках товаров, баннерах и промокодах. Первые четыре показываются на главной."
      emptyTitle="Категории"
      emptyHint="Добавьте категории или возьмите их из уже заведённых товаров."
      items={categories}
      addLabel="Добавить категорию"
      createItem={() => ({ id: '', name: '', icon: 'other' })}
      fields={[
        { key: 'name', label: 'Название', type: 'text', required: true, placeholder: 'Рубашки' },
        {
          key: 'icon',
          label: 'Иконка',
          type: 'select',
          options: CATEGORY_ICONS.map((i) => ({ value: i.key, label: i.label })),
        },
      ]}
      quickAction={{
        label: 'Взять из товаров',
        disabledReason: 'Все категории товаров уже есть в списке',
        run: (items) => [...items, ...categoriesFromProducts(products, items)],
      }}
      renderSummary={(c) => {
        const Icon = categoryIcon(c);
        const count = productCount(c.id);
        return (
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl neu-inset flex items-center justify-center text-[#2D3A4E] shrink-0">
              <Icon className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-black text-[#2D3A4E] truncate">{c.name}</p>
              <p className="text-[11px] text-[#4E5C70]">
                Товаров: {count}
                <span className="font-mono ml-2 opacity-80">{c.id}</span>
              </p>
            </div>
          </div>
        );
      }}
      onSave={(next) => {
        // New categories get a stable latin id from their name (stored in product.category)
        const taken: string[] = [];
        const withIds = next.map((c) => {
          const id = c.id || categoryIdFromName(c.name, [...taken, ...next.map((x) => x.id).filter(Boolean)]);
          taken.push(id);
          return { ...c, id, name: c.name.trim() };
        });
        onUpdateSettings?.({ ...settings, categories: withIds });
        const nameById = new Map(withIds.map((c) => [c.id, c.name]));
        const renamed = products.filter((p) => nameById.has(p.category) && p.categoryLabel !== nameById.get(p.category));
        if (renamed.length > 0 && onUpdateProducts) {
          onUpdateProducts(
            products.map((p) => (nameById.has(p.category) ? { ...p, categoryLabel: nameById.get(p.category)! } : p))
          );
        }
      }}
      onShowToast={onShowToast}
    />
  );
};
