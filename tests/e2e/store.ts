// The shop the scenarios work with: a few products, delivery, payment and requisites. Written to the emulator only
// (seed.setup.ts); on the real site all of this is set by the owner in the admin panel
export const ADMIN = { sub: 'e2e-admin', email: 'gunh83975@gmail.com', name: 'Владелец' };

const sizes = (id: string, colors: string[], list: string[], stock: number) =>
  colors.flatMap((color) => list.map((size) => ({ id: `${id}-${color}-${size}`, color, size, stock, skuCode: `WS-${id}-${size}` })));

const product = (p: {
  id: string;
  title: string;
  category: string;
  categoryLabel: string;
  price: number;
  colors: { name: string; hex: string }[];
  sizes: string[];
  stock?: number;
}) => {
  const { stock = 50, ...rest } = p;
  return {
    description: `${p.title} для проверки сценариев.`,
    material: 'Хлопок',
    images: [`https://img.test/${p.id}.jpg`],
    inStock: true,
    isPopular: true,
    rating: 0,
    reviewsCount: 0,
    ...rest,
    skus: sizes(p.id, p.colors.map((c) => c.name), p.sizes, stock),
  };
};

export const PRODUCTS = {
  linen: product({
    id: 'e2e-linen-shirt',
    title: 'Рубашка льняная',
    category: 'shirts',
    categoryLabel: 'Рубашка',
    price: 2990,
    colors: [{ name: 'Бежевый', hex: '#D8C8A8' }],
    sizes: ['S', 'M', 'L'],
  }),
  polo: product({
    id: 'e2e-polo',
    title: 'Поло классическое',
    category: 'polo',
    categoryLabel: 'Поло',
    price: 2490,
    colors: [{ name: 'Темно-синий', hex: '#1F2A44' }],
    sizes: ['M', 'L', 'XL'],
  }),
  chinos: product({
    id: 'e2e-chinos',
    title: 'Брюки чинос',
    category: 'trousers',
    categoryLabel: 'Брюки',
    price: 4590,
    colors: [{ name: 'Хаки', hex: '#556B2F' }],
    sizes: ['48', '50', '52'],
  }),
  cap: product({
    id: 'e2e-cap',
    title: 'Кепка хлопковая',
    category: 'accessories',
    categoryLabel: 'Аксессуары',
    price: 1290,
    colors: [{ name: 'Черный', hex: '#111111' }],
    sizes: ['Единый'],
  }),
  // the owner's scenario changes their prices: one product per screen size, so parallel runs do not collide
  belt: product({
    id: 'e2e-belt',
    title: 'Ремень кожаный',
    category: 'accessories',
    categoryLabel: 'Аксессуары',
    price: 1990,
    colors: [{ name: 'Коричневый', hex: '#6B4226' }],
    sizes: ['Единый'],
  }),
  socks: product({
    id: 'e2e-socks',
    title: 'Носки хлопковые',
    category: 'accessories',
    categoryLabel: 'Аксессуары',
    price: 490,
    colors: [{ name: 'Серый', hex: '#8A8F98' }],
    sizes: ['Единый'],
  }),
  // the owner copies and deletes these (with their photo documents): one per screen size
  scarf: { ...product({
    id: 'e2e-scarf',
    title: 'Шарф шерстяной',
    category: 'accessories',
    categoryLabel: 'Аксессуары',
    price: 1790,
    colors: [{ name: 'Серый', hex: '#8A8F98' }],
    sizes: ['Единый'],
  }), isPopular: false, photoIds: ['e2e-scarf_full'] },
  tie: { ...product({
    id: 'e2e-tie',
    title: 'Галстук шёлковый',
    category: 'accessories',
    categoryLabel: 'Аксессуары',
    price: 1590,
    colors: [{ name: 'Темно-синий', hex: '#1F2A44' }],
    sizes: ['Единый'],
  }), isPopular: false, photoIds: ['e2e-tie_full'] },
};

/** A full photo of a product as `product_photos` keeps it (the product holds a preview) */
export const fullPhoto = (productId: string) => ({ productId, data: 'data:image/jpeg;base64,' + 'A'.repeat(400) });

export const COURIER = { id: 'courier', title: 'Курьером до двери', type: 'courier', price: 350, duration: '1–2 дня', icon: 'truck' };
export const PICKUP = { id: 'pickup', title: 'Пункт выдачи', type: 'pickup', price: 0, duration: 'завтра', icon: 'store' };

export function storeDocs(): Record<string, Record<string, unknown>> {
  const categories = [...new Map(Object.values(PRODUCTS).map((p) => [p.category, { id: p.category, name: p.categoryLabel, icon: 'shirt' }])).values()];
  return {
    ...Object.fromEntries(Object.values(PRODUCTS).map((p) => [`products/${p.id}`, p])),
    ...Object.fromEntries(
      Object.values(PRODUCTS).flatMap((p) => ('photoIds' in p ? p.photoIds.map((id) => [`product_photos/${id}`, fullPhoto(p.id)]) : []))
    ),
    'settings/storefront': {
      storeName: 'Wasat Shop',
      phone: '+7 (495) 111-22-33',
      email: 'shop@example.ru',
      telegram: '',
      whatsapp: '',
      pickupAddress: '',
      workingHours: '',
      isStoreOnline: true,
      isExpressEnabled: false,
      lowStockThreshold: 3,
      legalEntityName: 'ИП Проверочный Иван Иванович',
      inn: '772012345678',
      ogrn: '321774600123456',
      legalAddress: 'г. Москва, ул. Тверская, д. 7',
      categories,
      labelFormats: [{ id: 'f58x40', name: '58×40 мм', widthMm: 58, heightMm: 40 }],
      paymentMethods: [
        { id: 'transfer', title: 'Перевод по номеру телефона', description: 'Менеджер пришлет номер для перевода.', isActive: true },
        { id: 'cash', title: 'Наличными или картой при получении', onDelivery: true, isActive: true },
      ],
    },
    'settings/server': { serverOrdersEnabled: false },
    [`delivery_methods/${COURIER.id}`]: { ...COURIER, isActive: true, sortOrder: 1 },
    [`delivery_methods/${PICKUP.id}`]: { ...PICKUP, isActive: true, sortOrder: 2 },
    'pickup_points/pp1': {
      id: 'pp1',
      name: 'Пункт выдачи на Тверской',
      city: 'Москва',
      address: 'ул. Тверская, 7',
      schedule: '10:00–21:00',
      phone: '+7 (495) 111-22-33',
      isActive: true,
      isDefault: true,
    },
  };
}
