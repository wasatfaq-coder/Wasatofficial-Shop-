// A shop of the size the roadmap plans for half a year after launch (docs/roadmap.md): 300 products with 3–4 photos,
// reviews, votes, promos and banners. Written to the emulator only (`bun run measure:visit`): the real database cannot
// be restored from the repository. Previews, full photos and banners are real JPEGs of the measured size drawn by Chromium:
// the admin session makes miniatures from the previews, and the speed measure (speed.spec.ts) waits for the photos to paint
import { storeDocs } from '../e2e/store';

export const PRODUCT_COUNT = 300;
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

// Descriptions differ like real ones (≈ 350 characters of varied words): the index is compressed, and identical texts
// would compress far better than the shop's own
const WORDS = (
  'свободный крой плотная ткань держит форму после стирки подходит к джинсам брюкам носится круглый год шов усилен ' +
  'плечах пуговицы пришиты вручную модель садится по размеру мягкий хлопок лён дышит летом тёплый зимой воротник ' +
  'манжеты карман на груди прямой силуэт удлинённая спинка не мнётся легко гладить цвет не выгорает подкладка ' +
  'застёжка молния петли обработаны вискоза эластан тянется по фигуре офис прогулка выходные вечер классика'
).split(' ');
const describe = () => {
  const out: string[] = [];
  while (out.join(' ').length < 350) out.push(pick(WORDS));
  return `${out.join(' ')}.`;
};

export const productId = (i: number) => `p${String(i).padStart(3, '0')}`;

/**
 * Real previews (480 px long side, JPEG 0.7): a canvas with a gradient, shapes and grain, ≈ 47 000 characters each.
 * With a size — banner pictures (processImageFiles keeps 1 000 px), so the home page paints its slide as the real one
 */
export async function drawPreviews(count = 8, width = 360, height = 480, quality = 0.7): Promise<string[]> {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    return await page.evaluate(([n, w, h, q]) => {
      const out: string[] = [];
      for (let k = 0; k < n; k++) {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const g = c.getContext('2d')!;
        const grad = g.createLinearGradient(0, 0, w, h);
        grad.addColorStop(0, `hsl(${k * 45},30%,80%)`);
        grad.addColorStop(1, `hsl(${k * 45 + 40},40%,35%)`);
        g.fillStyle = grad;
        g.fillRect(0, 0, w, h);
        for (let i = 0; i < 400; i++) {
          g.fillStyle = `hsla(${Math.random() * 360},40%,${30 + Math.random() * 50}%,0.35)`;
          g.beginPath();
          g.arc(Math.random() * w, Math.random() * h, 2 + Math.random() * 30, 0, 7);
          g.fill();
        }
        const img = g.getImageData(0, 0, w, h);
        for (let i = 0; i < img.data.length; i += 4) {
          const noise = (Math.random() - 0.5) * 40;
          img.data[i] += noise;
          img.data[i + 1] += noise;
          img.data[i + 2] += noise;
        }
        g.putImageData(img, 0, 0);
        out.push(c.toDataURL('image/jpeg', q));
      }
      return out;
    }, [count, width, height, quality] as const);
  } finally {
    await browser.close();
  }
}

function product(i: number, previews: string[]) {
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
    description: describe(),
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
    images: photoIds.map((_, k) => previews[(i + k) % previews.length]),
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
export function* catalogBatches(
  previews: string[],
  bannerPictures: string[],
  fullPhotos: string[]
): Generator<Record<string, Record<string, unknown>>> {
  const base = storeDocs();
  // the scenario products of the e2e store are not part of this shop
  for (const key of Object.keys(base)) if (key.startsWith('products/')) delete base[key];
  const storefront = base['settings/storefront'] as Record<string, unknown>;
  storefront.categories = CATEGORIES.map(([id, name]) => ({ id, name, icon: 'shirt' }));
  yield base;

  for (let i = 0; i < PRODUCT_COUNT; i += 10) {
    const batch: Record<string, Record<string, unknown>> = {};
    for (let k = i; k < Math.min(i + 10, PRODUCT_COUNT); k++) {
      const p = product(k, previews);
      batch[`products/${p.id}`] = p;
      if (k < PRODUCTS_WITH_FULL_PHOTOS) {
        // full photos are big: a commit of their own per product
        yield Object.fromEntries(
          p.photoIds.map((pid, n) => [`product_photos/${pid}`, { id: pid, productId: p.id, data: fullPhotos[(k + n) % fullPhotos.length] }])
        );
      }
    }
    yield batch;
  }

  // ≈ half a year of a small shop: 150 reviews, 300 «Полезно», 10 promos, 3 banners (1 000 × 500, ≈ 127 000 characters)
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
        image: bannerPictures[b % bannerPictures.length],
        actionType: 'catalog',
        active: true,
        order: b,
      },
    };
  }
}
