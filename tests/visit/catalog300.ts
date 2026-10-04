// A shop of the size the roadmap plans for half a year after launch (docs/roadmap.md): 300 products with 3–4 photos,
// reviews, votes, promos and banners. Written to the emulator only (`bun run measure:visit`): the real database cannot
// be restored from the repository. Photos are random base64 of the measured size — bytes matter here, not pictures
import { randomBytes } from 'node:crypto';
import { storeDocs } from '../e2e/store';

export const PRODUCT_COUNT = 300;
/** A preview inside the product (480 px, q 0.7): 45–46 KB measured in stage 6 of the 02.10 audit */
export const PREVIEW_CHARS = 45_000;
/** A full photo in `product_photos` (processImageFiles before the preview) */
export const FULL_PHOTO_CHARS = 250_000;
/** Every product has its full photos: the preview pages read the first one of each (scripts/share-pages.ts) */
export const PRODUCTS_WITH_FULL_PHOTOS = PRODUCT_COUNT;

const CATEGORIES = [
  ['shirts', 'Рубашки', 'Рубашка'],
  ['tshirts', 'Футболки', 'Футболка'],
  ['polo', 'Поло', 'Поло'],
  ['trousers', 'Брюки', 'Брюки'],
  ['jackets', 'Куртки', 'Куртка'],
  ['sweatshirts', 'Свитшоты', 'Свитшот'],
  ['suits', 'Костюмы', 'Костюм'],
  ['accessories', 'Аксессуары', 'Ремень'],
] as const;
const COLORS = [
  { name: 'Белый', hex: '#FFFFFF' },
  { name: 'Черный', hex: '#111111' },
  { name: 'Темно-синий', hex: '#1F2A44' },
  { name: 'Бежевый', hex: '#D8C8A8' },
  { name: 'Хаки', hex: '#556B2F' },
  { name: 'Серый', hex: '#8A8F98' },
];
const SIZES = ['S', 'M', 'L', 'XL', 'XXL'];

// deterministic, so two runs measure the same shop
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T,>(list: readonly T[]) => list[Math.floor(rnd() * list.length)];
const photo = (chars: number) => `data:image/jpeg;base64,${randomBytes(Math.ceil((chars * 3) / 4)).toString('base64').slice(0, chars)}`;

export const productId = (i: number) => `p${String(i).padStart(3, '0')}`;

function product(i: number) {
  const id = productId(i);
  const [category, categoryLabel, single] = CATEGORIES[i % CATEGORIES.length];
  const colors = [0, 1, 2].map((k) => COLORS[(i + k) % COLORS.length]);
  const photoCount = 3 + (i % 2);
  const photoIds = Array.from({ length: photoCount }, (_, k) => `${id}_ph${k}`);
  const price = 990 + Math.round(rnd() * 90) * 100;
  return {
    id,
    title: `${single} модель ${i + 1} ${pick(['классик', 'базовая', 'премиум', 'лён', 'хлопок'])}`,
    category,
    categoryLabel,
    price,
    ...(i % 5 === 0 ? { originalPrice: price + 1000 } : {}),
    description:
      'Свободный крой, плотная ткань, которая держит форму после стирки. Подходит к джинсам и брюкам, носится круглый год. ' +
      'Шов усилен в плечах, пуговицы пришиты вручную. Модель садится по размеру — смотрите таблицу размеров ниже.',
    material: 'Хлопок',
    fabricComposition: [
      { fiber: 'Хлопок', percentage: 95 },
      { fiber: 'Эластан', percentage: 5 },
    ],
    fabricDensity: '185',
    careInstructions: [
      { icon: 'wash', label: 'Стирка 30°', desc: 'Деликатный режим, вывернуть наизнанку' },
      { icon: 'iron', label: 'Глажка', desc: 'Средняя температура' },
    ],
    features: [
      { title: 'Плотный хлопок', text: 'Не просвечивает и держит форму' },
      { title: 'Усиленные швы', text: 'Прослужит не один сезон' },
    ],
    specs: [{ label: 'Застежка', value: 'Пуговицы' }],
    countryOfOrigin: 'Россия',
    images: photoIds.map(() => photo(PREVIEW_CHARS)),
    photoIds,
    colors,
    sizes: SIZES,
    inStock: true,
    isPopular: i % 6 === 0,
    isNew: i % 9 === 0,
    rating: 0,
    reviewsCount: 0,
    fit: 'regular',
    skus: colors.flatMap((c) =>
      SIZES.map((size) => ({ id: `${id}-${c.name}-${size}`, color: c.name, size, stock: Math.floor(rnd() * 12), skuCode: `WS-${id}-${size}` }))
    ),
  };
}

/** Batches of documents for writeDocs: a few products per commit keeps each request small */
export function* catalogBatches(): Generator<Record<string, Record<string, unknown>>> {
  const base = storeDocs();
  // the scenario products of the e2e store are not part of this shop
  for (const key of Object.keys(base)) if (key.startsWith('products/')) delete base[key];
  const storefront = base['settings/storefront'] as Record<string, unknown>;
  storefront.categories = CATEGORIES.map(([id, name]) => ({ id, name, icon: 'shirt' }));
  yield base;

  for (let i = 0; i < PRODUCT_COUNT; i += 10) {
    const batch: Record<string, Record<string, unknown>> = {};
    for (let k = i; k < Math.min(i + 10, PRODUCT_COUNT); k++) {
      const p = product(k);
      batch[`products/${p.id}`] = p;
      if (k < PRODUCTS_WITH_FULL_PHOTOS) {
        // full photos are big: a commit of their own per product
        yield Object.fromEntries(p.photoIds.map((pid) => [`product_photos/${pid}`, { id: pid, productId: p.id, data: photo(FULL_PHOTO_CHARS) }]));
      }
    }
    yield batch;
  }

  // ≈ half a year of a small shop: 150 reviews, 300 «Полезно», 10 promos, 3 banners
  const extra: Record<string, Record<string, unknown>> = {};
  for (let r = 0; r < 150; r++) {
    const pid = productId((r * 7) % PRODUCT_COUNT);
    const id = `${pid}_user${r}`;
    extra[`reviews/${id}`] = {
      id,
      productId: pid,
      uid: `user${r}`,
      authorName: `Покупатель ${r}`,
      rating: 4 + (r % 2),
      comment: 'Хорошая ткань, размер подошёл, после стирки не села. Доставка быстрая.',
      sizePurchased: 'M',
      colorPurchased: 'Белый',
      date: '2026-09-01',
      createdAt: '2026-09-01T10:00:00.000Z',
    };
  }
  for (let v = 0; v < 300; v++) {
    const r = v % 150;
    const pid = productId((r * 7) % PRODUCT_COUNT);
    extra[`review_votes/${pid}_user${r}_voter${v}`] = { reviewId: `${pid}_user${r}`, productId: pid, uid: `voter${v}` };
  }
  for (let k = 0; k < 10; k++) {
    extra[`promos/promo${k}`] = { id: `promo${k}`, code: `SALE${k}`, discountType: 'percent', discountValue: 10, isActive: k < 4, usedCount: k };
  }
  yield extra;
  for (let b = 0; b < 3; b++) {
    yield {
      [`banners/b${b}`]: {
        id: `b${b}`,
        title: `Новая коллекция ${b + 1}`,
        subtitle: 'Лён и хлопок на лето',
        btnText: 'Смотреть',
        image: photo(120_000),
        actionType: 'catalog',
        active: true,
        order: b,
      },
    };
  }
}
