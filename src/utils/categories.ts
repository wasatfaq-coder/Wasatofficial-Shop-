import type React from 'react';
import {
  Backpack,
  Briefcase,
  Crown,
  Dumbbell,
  Footprints,
  Gem,
  Gift,
  Glasses,
  Leaf,
  Moon,
  Percent,
  ShoppingBag,
  Snowflake,
  Sparkles,
  Sun,
  Umbrella,
  Wallet,
  Watch,
} from 'lucide-react';
import {
  BeltIcon,
  BlazerIcon,
  CapIcon,
  CoatIcon,
  HoodieIcon,
  JacketIcon,
  PantsIcon,
  PoloIcon,
  ShirtIcon,
  ShortsIcon,
  SocksIcon,
  SweaterIcon,
  SweatshirtIcon,
  TieIcon,
  TShirtIcon,
  UnderwearIcon,
  VestIcon,
} from '../components/CategoryIcons';
import type { Product, StoreCategory, StorefrontSettings } from '../types';

type IconComponent = React.FC<{ className?: string }>;

export type CategoryIconGroup = 'clothes' | 'accessories' | 'collections';

/** Groups of the icon picker (Admin → «Категории») */
export const CATEGORY_ICON_GROUPS: { id: CategoryIconGroup; label: string }[] = [
  { id: 'clothes', label: 'Одежда' },
  { id: 'accessories', label: 'Обувь и аксессуары' },
  { id: 'collections', label: 'Подборки' },
];

/** Icons the admin can pick for a category. Keys are stored in categories: never rename or remove one */
export const CATEGORY_ICONS: { key: string; label: string; group: CategoryIconGroup; Icon: IconComponent }[] = [
  { key: 'shirt', label: 'Рубашка', group: 'clothes', Icon: ShirtIcon },
  { key: 'tshirt', label: 'Футболка', group: 'clothes', Icon: TShirtIcon },
  { key: 'polo', label: 'Поло', group: 'clothes', Icon: PoloIcon },
  { key: 'sweatshirt', label: 'Свитшот', group: 'clothes', Icon: SweatshirtIcon },
  { key: 'hoodie', label: 'Худи', group: 'clothes', Icon: HoodieIcon },
  { key: 'sweater', label: 'Свитер', group: 'clothes', Icon: SweaterIcon },
  { key: 'blazer', label: 'Пиджак', group: 'clothes', Icon: BlazerIcon },
  { key: 'vest', label: 'Жилет', group: 'clothes', Icon: VestIcon },
  { key: 'jacket', label: 'Куртка', group: 'clothes', Icon: JacketIcon },
  { key: 'coat', label: 'Пальто', group: 'clothes', Icon: CoatIcon },
  { key: 'pants', label: 'Брюки', group: 'clothes', Icon: PantsIcon },
  { key: 'shorts', label: 'Шорты', group: 'clothes', Icon: ShortsIcon },
  { key: 'underwear', label: 'Белье', group: 'clothes', Icon: UnderwearIcon },
  { key: 'socks', label: 'Носки', group: 'clothes', Icon: SocksIcon },
  { key: 'homewear', label: 'Для дома', group: 'clothes', Icon: Moon as IconComponent },
  { key: 'shoes', label: 'Обувь', group: 'accessories', Icon: Footprints as IconComponent },
  { key: 'accessory', label: 'Часы', group: 'accessories', Icon: Watch as IconComponent },
  { key: 'cap', label: 'Головной убор', group: 'accessories', Icon: CapIcon },
  { key: 'tie', label: 'Галстук', group: 'accessories', Icon: TieIcon },
  { key: 'belt', label: 'Ремень', group: 'accessories', Icon: BeltIcon },
  { key: 'bag', label: 'Сумка', group: 'accessories', Icon: ShoppingBag as IconComponent },
  { key: 'backpack', label: 'Рюкзак', group: 'accessories', Icon: Backpack as IconComponent },
  { key: 'briefcase', label: 'Портфель', group: 'accessories', Icon: Briefcase as IconComponent },
  { key: 'wallet', label: 'Кошелек', group: 'accessories', Icon: Wallet as IconComponent },
  { key: 'glasses', label: 'Очки', group: 'accessories', Icon: Glasses as IconComponent },
  { key: 'jewelry', label: 'Украшения', group: 'accessories', Icon: Gem as IconComponent },
  { key: 'umbrella', label: 'Зонт', group: 'accessories', Icon: Umbrella as IconComponent },
  { key: 'sport', label: 'Спорт', group: 'collections', Icon: Dumbbell as IconComponent },
  { key: 'summer', label: 'Лето', group: 'collections', Icon: Sun as IconComponent },
  { key: 'winter', label: 'Зима', group: 'collections', Icon: Snowflake as IconComponent },
  { key: 'eco', label: 'Эко', group: 'collections', Icon: Leaf as IconComponent },
  { key: 'premium', label: 'Премиум', group: 'collections', Icon: Crown as IconComponent },
  { key: 'sale', label: 'Скидки', group: 'collections', Icon: Percent as IconComponent },
  { key: 'gift', label: 'Подарки', group: 'collections', Icon: Gift as IconComponent },
  { key: 'other', label: 'Другое', group: 'collections', Icon: Sparkles as IconComponent },
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
  return (CATEGORY_ICONS.find((i) => i.key === key) ?? CATEGORY_ICONS.find((i) => i.key === 'other')!).Icon;
}

/** Categories set in Admin → «Категории». Empty until the owner adds them: nothing is made up. */
export function getCategories(settings?: Partial<StorefrontSettings> | null): StoreCategory[] {
  return (settings?.categories ?? []).filter((c) => c.id && c.name.trim());
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
