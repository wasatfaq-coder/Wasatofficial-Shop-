import type React from 'react';
import { Sparkles, Watch, Footprints } from 'lucide-react';
import { JacketIcon, PantsIcon, ShirtIcon, SweatshirtIcon, TShirtIcon } from '../components/CategoryIcons';
import type { Product, StoreCategory, StorefrontSettings } from '../types';

type IconComponent = React.FC<{ className?: string }>;

/** Icons the admin can pick for a category */
export const CATEGORY_ICONS: { key: string; label: string; Icon: IconComponent }[] = [
  { key: 'shirt', label: 'Рубашка', Icon: ShirtIcon },
  { key: 'tshirt', label: 'Футболка', Icon: TShirtIcon },
  { key: 'jacket', label: 'Куртка', Icon: JacketIcon },
  { key: 'pants', label: 'Брюки', Icon: PantsIcon },
  { key: 'sweatshirt', label: 'Свитшот', Icon: SweatshirtIcon },
  { key: 'shoes', label: 'Обувь', Icon: Footprints as IconComponent },
  { key: 'accessory', label: 'Аксессуар', Icon: Watch as IconComponent },
  { key: 'other', label: 'Другое', Icon: Sparkles as IconComponent },
];

/** Icons of the categories products were created with before the «Категории» section existed */
const LEGACY_ICON_BY_ID: Record<string, string> = {
  shirts: 'shirt',
  tshirts: 'tshirt',
  jackets: 'jacket',
  trousers: 'pants',
  sweatshirts: 'sweatshirt',
  accessories: 'accessory',
};

export function categoryIcon(category: Pick<StoreCategory, 'id' | 'icon'>): IconComponent {
  const key = category.icon || LEGACY_ICON_BY_ID[category.id] || 'other';
  return (CATEGORY_ICONS.find((i) => i.key === key) ?? CATEGORY_ICONS[CATEGORY_ICONS.length - 1]).Icon;
}

/** Categories set in Admin → «Категории». Empty until the owner adds them: nothing is made up. */
export function getCategories(settings?: Partial<StorefrontSettings> | null): StoreCategory[] {
  return (settings?.categories ?? []).filter((c) => c.id && c.name.trim());
}

export function categoryName(categories: StoreCategory[], id: string, fallback = ''): string {
  return categories.find((c) => c.id === id)?.name || fallback;
}

/**
 * Categories the existing products already use, for the admin's «Взять из товаров» action:
 * the real ids and names stored on products, not a template list.
 */
export function categoriesFromProducts(products: Product[], existing: StoreCategory[]): StoreCategory[] {
  const known = new Set(existing.map((c) => c.id));
  const found: StoreCategory[] = [];
  for (const p of products) {
    if (!p.category || known.has(p.category)) continue;
    known.add(p.category);
    found.push({ id: p.category, name: p.categoryLabel || p.category, icon: LEGACY_ICON_BY_ID[p.category] || 'other' });
  }
  return found;
}

/** Latin id for a new category name: «Верхняя одежда» → «verkhnyaya-odezhda» */
export function categoryIdFromName(name: string, taken: string[]): string {
  const map: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
    н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
    ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  };
  const base =
    name
      .toLowerCase()
      .split('')
      .map((ch) => map[ch] ?? ch)
      .join('')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'category';
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`;
  return id;
}
