import { Product, DeliveryMethod, Order } from '../types';
import { generateDefaultSKUs } from '../utils/inventory';

export const CATEGORIES = [
  { id: 'all', name: 'Все', icon: 'Sparkles' },
  { id: 'shirts', name: 'Рубашки', icon: 'Shirt' },
  { id: 'tshirts', name: 'Футболки', icon: 'Shirt' },
  { id: 'jackets', name: 'Куртки', icon: 'Overcoat' },
  { id: 'trousers', name: 'Брюки', icon: 'Pants' },
  { id: 'sweatshirts', name: 'Свитшоты', icon: 'Layers' },
];

const RAW_PRODUCTS: Product[] = [
  {
    id: 'linen-shirt-01',
    title: 'Рубашка льняная',
    category: 'shirts',
    categoryLabel: 'Рубашка',
    price: 2990,
    originalPrice: 3500,
    badge: 'Новинка',
    description: 'Легкая и дышащая рубашка из натурального льна. Идеально подходит для теплой погоды и премиального повседневного стиля.',
    material: '100% лён',
    images: [
      'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&q=80&w=800',
      'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&q=80&w=800',
      'https://images.unsplash.com/photo-1620012253295-c15cc3e65df4?auto=format&fit=crop&q=80&w=800',
      'https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&q=80&w=800'
    ],
    colors: [
      { name: 'Бежевый', hex: '#E5D3B3' },
      { name: 'Белый', hex: '#FFFFFF' },
      { name: 'Голубой', hex: '#9BB5CE' },
      { name: 'Темно-синий', hex: '#1E2B37' }
    ],
    sizes: ['S', 'M', 'L', 'XL'],
    inStock: true,
    isPopular: true,
    isNew: true,
    rating: 4.9,
    reviewsCount: 42,
    fit: 'regular',
    skus: [
      { id: 'linen-shirt-01-Бежевый-S', color: 'Бежевый', size: 'S', stock: 4, skuCode: 'MS-SH01-BEI-S', barcode: '460710001001' },
      { id: 'linen-shirt-01-Бежевый-M', color: 'Бежевый', size: 'M', stock: 3, skuCode: 'MS-SH01-BEI-M', barcode: '460710001002' },
      { id: 'linen-shirt-01-Бежевый-L', color: 'Бежевый', size: 'L', stock: 5, skuCode: 'MS-SH01-BEI-L', barcode: '460710001003' },
      { id: 'linen-shirt-01-Бежевый-XL', color: 'Бежевый', size: 'XL', stock: 1, skuCode: 'MS-SH01-BEI-XL', barcode: '460710001004' },
      { id: 'linen-shirt-01-Белый-S', color: 'Белый', size: 'S', stock: 2, skuCode: 'MS-SH01-WHT-S', barcode: '460710001005' },
      { id: 'linen-shirt-01-Белый-M', color: 'Белый', size: 'M', stock: 6, skuCode: 'MS-SH01-WHT-M', barcode: '460710001006' },
      { id: 'linen-shirt-01-Белый-L', color: 'Белый', size: 'L', stock: 0, skuCode: 'MS-SH01-WHT-L', barcode: '460710001007' },
      { id: 'linen-shirt-01-Белый-XL', color: 'Белый', size: 'XL', stock: 2, skuCode: 'MS-SH01-WHT-XL', barcode: '460710001008' },
      { id: 'linen-shirt-01-Голубой-S', color: 'Голубой', size: 'S', stock: 3, skuCode: 'MS-SH01-BLU-S', barcode: '460710001009' },
      { id: 'linen-shirt-01-Голубой-M', color: 'Голубой', size: 'M', stock: 2, skuCode: 'MS-SH01-BLU-M', barcode: '460710001010' },
      { id: 'linen-shirt-01-Голубой-L', color: 'Голубой', size: 'L', stock: 4, skuCode: 'MS-SH01-BLU-L', barcode: '460710001011' },
      { id: 'linen-shirt-01-Голубой-XL', color: 'Голубой', size: 'XL', stock: 0, skuCode: 'MS-SH01-BLU-XL', barcode: '460710001012' },
      { id: 'linen-shirt-01-Темно-синий-S', color: 'Темно-синий', size: 'S', stock: 1, skuCode: 'MS-SH01-NAV-S', barcode: '460710001013' },
      { id: 'linen-shirt-01-Темно-синий-M', color: 'Темно-синий', size: 'M', stock: 5, skuCode: 'MS-SH01-NAV-M', barcode: '460710001014' },
      { id: 'linen-shirt-01-Темно-синий-L', color: 'Темно-синий', size: 'L', stock: 3, skuCode: 'MS-SH01-NAV-L', barcode: '460710001015' },
      { id: 'linen-shirt-01-Темно-синий-XL', color: 'Темно-синий', size: 'XL', stock: 2, skuCode: 'MS-SH01-NAV-XL', barcode: '460710001016' },
    ]
  },
  {
    id: 'polo-classic-02',
    title: 'Поло классическое',
    category: 'tshirts',
    categoryLabel: 'Поло',
    price: 2490,
    badge: 'Хит',
    description: 'Элегантное поло приталенного кроя из гладкого хлопка пике. Классический воротник и лаконичные пуговицы.',
    material: '100% хлопок пике',
    images: [
      'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=800',
      'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&q=80&w=800',
      'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?auto=format&fit=crop&q=80&w=800'
    ],
    colors: [
      { name: 'Темно-синий', hex: '#1C2836' },
      { name: 'Белый', hex: '#FFFFFF' },
      { name: 'Черный', hex: '#111111' },
      { name: 'Серый', hex: '#8B939C' }
    ],
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    inStock: true,
    isPopular: true,
    rating: 4.8,
    reviewsCount: 89,
    fit: 'slim',
    skus: [
      { id: 'polo-classic-02-Темно-синий-S', color: 'Темно-синий', size: 'S', stock: 4, skuCode: 'MS-PL02-NAV-S', barcode: '460720002001' },
      { id: 'polo-classic-02-Темно-синий-M', color: 'Темно-синий', size: 'M', stock: 5, skuCode: 'MS-PL02-NAV-M', barcode: '460720002002' },
      { id: 'polo-classic-02-Темно-синий-L', color: 'Темно-синий', size: 'L', stock: 6, skuCode: 'MS-PL02-NAV-L', barcode: '460720002003' },
      { id: 'polo-classic-02-Темно-синий-XL', color: 'Темно-синий', size: 'XL', stock: 2, skuCode: 'MS-PL02-NAV-XL', barcode: '460720002004' },
      { id: 'polo-classic-02-Темно-синий-XXL', color: 'Темно-синий', size: 'XXL', stock: 0, skuCode: 'MS-PL02-NAV-XXL', barcode: '460720002005' },
      { id: 'polo-classic-02-Белый-S', color: 'Белый', size: 'S', stock: 3, skuCode: 'MS-PL02-WHT-S', barcode: '460720002006' },
      { id: 'polo-classic-02-Белый-M', color: 'Белый', size: 'M', stock: 4, skuCode: 'MS-PL02-WHT-M', barcode: '460720002007' },
      { id: 'polo-classic-02-Белый-L', color: 'Белый', size: 'L', stock: 1, skuCode: 'MS-PL02-WHT-L', barcode: '460720002008' },
      { id: 'polo-classic-02-Белый-XL', color: 'Белый', size: 'XL', stock: 3, skuCode: 'MS-PL02-WHT-XL', barcode: '460720002009' },
      { id: 'polo-classic-02-Белый-XXL', color: 'Белый', size: 'XXL', stock: 2, skuCode: 'MS-PL02-WHT-XXL', barcode: '460720002010' },
      { id: 'polo-classic-02-Черный-S', color: 'Черный', size: 'S', stock: 2, skuCode: 'MS-PL02-BLK-S', barcode: '460720002011' },
      { id: 'polo-classic-02-Черный-M', color: 'Черный', size: 'M', stock: 0, skuCode: 'MS-PL02-BLK-M', barcode: '460720002012' },
      { id: 'polo-classic-02-Черный-L', color: 'Черный', size: 'L', stock: 5, skuCode: 'MS-PL02-BLK-L', barcode: '460720002013' },
      { id: 'polo-classic-02-Черный-XL', color: 'Черный', size: 'XL', stock: 2, skuCode: 'MS-PL02-BLK-XL', barcode: '460720002014' },
      { id: 'polo-classic-02-Черный-XXL', color: 'Черный', size: 'XXL', stock: 1, skuCode: 'MS-PL02-BLK-XXL', barcode: '460720002015' },
      { id: 'polo-classic-02-Серый-S', color: 'Серый', size: 'S', stock: 3, skuCode: 'MS-PL02-GRY-S', barcode: '460720002016' },
      { id: 'polo-classic-02-Серый-M', color: 'Серый', size: 'M', stock: 4, skuCode: 'MS-PL02-GRY-M', barcode: '460720002017' },
      { id: 'polo-classic-02-Серый-L', color: 'Серый', size: 'L', stock: 2, skuCode: 'MS-PL02-GRY-L', barcode: '460720002018' },
      { id: 'polo-classic-02-Серый-XL', color: 'Серый', size: 'XL', stock: 0, skuCode: 'MS-PL02-GRY-XL', barcode: '460720002019' },
      { id: 'polo-classic-02-Серый-XXL', color: 'Серый', size: 'XXL', stock: 1, skuCode: 'MS-PL02-GRY-XXL', barcode: '460720002020' },
    ]
  },
  {
    id: 'bomber-jacket-03',
    title: 'Куртка бомбер',
    category: 'jackets',
    categoryLabel: 'Куртка',
    price: 4990,
    originalPrice: 6200,
    badge: 'Хит',
    description: 'Стильный бомбер из плотной влагоотталкивающей ткани. Эластичные манжеты и удобные карманы на молнии.',
    material: '80% полиэстер, 20% хлопок',
    images: [
      'https://images.unsplash.com/photo-1548883354-7622d03aca27?auto=format&fit=crop&q=80&w=800',
      'https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&q=80&w=800',
      'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&q=80&w=800'
    ],
    colors: [
      { name: 'Синий', hex: '#1E3A8A' },
      { name: 'Черный', hex: '#1A1D20' },
      { name: 'Серый', hex: '#717D8A' },
      { name: 'Хаки', hex: '#4A5340' }
    ],
    sizes: ['M', 'L', 'XL'],
    inStock: true,
    isPopular: true,
    rating: 4.95,
    reviewsCount: 64,
    fit: 'regular',
    skus: [
      // Exact example from user prompt: «Куртка L Синий — 3 шт., М Чёрный — 0 шт.»
      { id: 'bomber-jacket-03-Синий-M', color: 'Синий', size: 'M', stock: 4, skuCode: 'MS-JK03-BLU-M', barcode: '460730003001' },
      { id: 'bomber-jacket-03-Синий-L', color: 'Синий', size: 'L', stock: 3, skuCode: 'MS-JK03-BLU-L', barcode: '460730003002' },
      { id: 'bomber-jacket-03-Синий-XL', color: 'Синий', size: 'XL', stock: 1, skuCode: 'MS-JK03-BLU-XL', barcode: '460730003003' },
      { id: 'bomber-jacket-03-Черный-M', color: 'Черный', size: 'M', stock: 0, skuCode: 'MS-JK03-BLK-M', barcode: '460730003004' },
      { id: 'bomber-jacket-03-Черный-L', color: 'Черный', size: 'L', stock: 5, skuCode: 'MS-JK03-BLK-L', barcode: '460730003005' },
      { id: 'bomber-jacket-03-Черный-XL', color: 'Черный', size: 'XL', stock: 2, skuCode: 'MS-JK03-BLK-XL', barcode: '460730003006' },
      { id: 'bomber-jacket-03-Серый-M', color: 'Серый', size: 'M', stock: 3, skuCode: 'MS-JK03-GRY-M', barcode: '460730003007' },
      { id: 'bomber-jacket-03-Серый-L', color: 'Серый', size: 'L', stock: 4, skuCode: 'MS-JK03-GRY-L', barcode: '460730003008' },
      { id: 'bomber-jacket-03-Серый-XL', color: 'Серый', size: 'XL', stock: 0, skuCode: 'MS-JK03-GRY-XL', barcode: '460730003009' },
      { id: 'bomber-jacket-03-Хаки-M', color: 'Хаки', size: 'M', stock: 2, skuCode: 'MS-JK03-KHK-M', barcode: '460730003010' },
      { id: 'bomber-jacket-03-Хаки-L', color: 'Хаки', size: 'L', stock: 3, skuCode: 'MS-JK03-KHK-L', barcode: '460730003011' },
      { id: 'bomber-jacket-03-Хаки-XL', color: 'Хаки', size: 'XL', stock: 2, skuCode: 'MS-JK03-KHK-XL', barcode: '460730003012' },
    ]
  },
  {
    id: 'tshirt-oversize-04',
    title: 'Футболка Oversize',
    category: 'tshirts',
    categoryLabel: 'Футболка',
    price: 1890,
    description: 'Базовая футболка свободного кроя из плотного гребенного хлопка. Держит форму и невероятно мягкая к телу.',
    material: '100% премиум хлопок (240 г/м²)',
    images: [
      'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&q=80&w=800',
      'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&q=80&w=800'
    ],
    colors: [
      { name: 'Белый', hex: '#FFFFFF' },
      { name: 'Песочный', hex: '#D2B48C' },
      { name: 'Черный', hex: '#121212' }
    ],
    sizes: ['S', 'M', 'L', 'XL'],
    inStock: true,
    isPopular: false,
    isNew: true,
    rating: 4.7,
    reviewsCount: 31,
    fit: 'oversize',
    skus: [
      { id: 'tshirt-oversize-04-Белый-S', color: 'Белый', size: 'S', stock: 5, skuCode: 'MS-TS04-WHT-S', barcode: '460740004001' },
      { id: 'tshirt-oversize-04-Белый-M', color: 'Белый', size: 'M', stock: 7, skuCode: 'MS-TS04-WHT-M', barcode: '460740004002' },
      { id: 'tshirt-oversize-04-Белый-L', color: 'Белый', size: 'L', stock: 4, skuCode: 'MS-TS04-WHT-L', barcode: '460740004003' },
      { id: 'tshirt-oversize-04-Белый-XL', color: 'Белый', size: 'XL', stock: 2, skuCode: 'MS-TS04-WHT-XL', barcode: '460740004004' },
      { id: 'tshirt-oversize-04-Песочный-S', color: 'Песочный', size: 'S', stock: 2, skuCode: 'MS-TS04-SND-S', barcode: '460740004005' },
      { id: 'tshirt-oversize-04-Песочный-M', color: 'Песочный', size: 'M', stock: 3, skuCode: 'MS-TS04-SND-M', barcode: '460740004006' },
      { id: 'tshirt-oversize-04-Песочный-L', color: 'Песочный', size: 'L', stock: 0, skuCode: 'MS-TS04-SND-L', barcode: '460740004007' },
      { id: 'tshirt-oversize-04-Песочный-XL', color: 'Песочный', size: 'XL', stock: 1, skuCode: 'MS-TS04-SND-XL', barcode: '460740004008' },
      { id: 'tshirt-oversize-04-Черный-S', color: 'Черный', size: 'S', stock: 4, skuCode: 'MS-TS04-BLK-S', barcode: '460740004009' },
      { id: 'tshirt-oversize-04-Черный-M', color: 'Черный', size: 'M', stock: 6, skuCode: 'MS-TS04-BLK-M', barcode: '460740004010' },
      { id: 'tshirt-oversize-04-Черный-L', color: 'Черный', size: 'L', stock: 5, skuCode: 'MS-TS04-BLK-L', barcode: '460740004011' },
      { id: 'tshirt-oversize-04-Черный-XL', color: 'Черный', size: 'XL', stock: 3, skuCode: 'MS-TS04-BLK-XL', barcode: '460740004012' },
    ]
  },
  {
    id: 'chinos-pants-05',
    title: 'Брюки чинос',
    category: 'trousers',
    categoryLabel: 'Брюки',
    price: 3490,
    originalPrice: 4100,
    description: 'Универсальные зауженные брюки чинос из стретч-хлопка. Идеальны как для офиса, так и для прогулок.',
    material: '98% хлопок, 2% эластан',
    images: [
      'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?auto=format&fit=crop&q=80&w=800',
      'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?auto=format&fit=crop&q=80&w=800'
    ],
    colors: [
      { name: 'Бежевый', hex: '#C2B280' },
      { name: 'Темно-синий', hex: '#1B263B' },
      { name: 'Графит', hex: '#3A3B3C' }
    ],
    sizes: ['48 (M)', '50 (L)', '52 (XL)', '54 (XXL)'],
    inStock: true,
    isPopular: true,
    rating: 4.85,
    reviewsCount: 52,
    fit: 'slim',
    skus: [
      { id: 'chinos-pants-05-Бежевый-48 (M)', color: 'Бежевый', size: '48 (M)', stock: 4, skuCode: 'MS-TR05-BEI-48', barcode: '460750005001' },
      { id: 'chinos-pants-05-Бежевый-50 (L)', color: 'Бежевый', size: '50 (L)', stock: 2, skuCode: 'MS-TR05-BEI-50', barcode: '460750005002' },
      { id: 'chinos-pants-05-Бежевый-52 (XL)', color: 'Бежевый', size: '52 (XL)', stock: 3, skuCode: 'MS-TR05-BEI-52', barcode: '460750005003' },
      { id: 'chinos-pants-05-Бежевый-54 (XXL)', color: 'Бежевый', size: '54 (XXL)', stock: 1, skuCode: 'MS-TR05-BEI-54', barcode: '460750005004' },
      { id: 'chinos-pants-05-Темно-синий-48 (M)', color: 'Темно-синий', size: '48 (M)', stock: 3, skuCode: 'MS-TR05-NAV-48', barcode: '460750005005' },
      { id: 'chinos-pants-05-Темно-синий-50 (L)', color: 'Темно-синий', size: '50 (L)', stock: 5, skuCode: 'MS-TR05-NAV-50', barcode: '460750005006' },
      { id: 'chinos-pants-05-Темно-синий-52 (XL)', color: 'Темно-синий', size: '52 (XL)', stock: 0, skuCode: 'MS-TR05-NAV-52', barcode: '460750005007' },
      { id: 'chinos-pants-05-Темно-синий-54 (XXL)', color: 'Темно-синий', size: '54 (XXL)', stock: 2, skuCode: 'MS-TR05-NAV-54', barcode: '460750005008' },
      { id: 'chinos-pants-05-Графит-48 (M)', color: 'Графит', size: '48 (M)', stock: 2, skuCode: 'MS-TR05-GRF-48', barcode: '460750005009' },
      { id: 'chinos-pants-05-Графит-50 (L)', color: 'Графит', size: '50 (L)', stock: 4, skuCode: 'MS-TR05-GRF-50', barcode: '460750005010' },
      { id: 'chinos-pants-05-Графит-52 (XL)', color: 'Графит', size: '52 (XL)', stock: 2, skuCode: 'MS-TR05-GRF-52', barcode: '460750005011' },
      { id: 'chinos-pants-05-Графит-54 (XXL)', color: 'Графит', size: '54 (XXL)', stock: 0, skuCode: 'MS-TR05-GRF-54', barcode: '460750005012' },
    ]
  },
  {
    id: 'minimal-sweatshirt-06',
    title: 'Свитшот минималистичный',
    category: 'sweatshirts',
    categoryLabel: 'Свитшот',
    price: 3290,
    badge: 'Новинка',
    description: 'Мягкий толстовочный свитшот с круглым вырезом и эластичными подвязками. Внутренняя сторона с лёгким начесом.',
    material: '80% хлопок, 20% полиэстер',
    images: [
      'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&q=80&w=800',
      'https://images.unsplash.com/photo-1578587018452-892bacefd3f2?auto=format&fit=crop&q=80&w=800'
    ],
    colors: [
      { name: 'Молочный', hex: '#F0EAD6' },
      { name: 'Серый меланж', hex: '#A8B0B8' },
      { name: 'Темно-зеленый', hex: '#2A3F35' }
    ],
    sizes: ['M', 'L', 'XL'],
    inStock: true,
    isPopular: false,
    isNew: true,
    rating: 4.9,
    reviewsCount: 19,
    fit: 'oversize',
    skus: [
      { id: 'minimal-sweatshirt-06-Молочный-M', color: 'Молочный', size: 'M', stock: 4, skuCode: 'MS-SW06-MLK-M', barcode: '460760006001' },
      { id: 'minimal-sweatshirt-06-Молочный-L', color: 'Молочный', size: 'L', stock: 2, skuCode: 'MS-SW06-MLK-L', barcode: '460760006002' },
      { id: 'minimal-sweatshirt-06-Молочный-XL', color: 'Молочный', size: 'XL', stock: 1, skuCode: 'MS-SW06-MLK-XL', barcode: '460760006003' },
      { id: 'minimal-sweatshirt-06-Серый меланж-M', color: 'Серый меланж', size: 'M', stock: 3, skuCode: 'MS-SW06-GRY-M', barcode: '460760006004' },
      { id: 'minimal-sweatshirt-06-Серый меланж-L', color: 'Серый меланж', size: 'L', stock: 5, skuCode: 'MS-SW06-GRY-L', barcode: '460760006005' },
      { id: 'minimal-sweatshirt-06-Серый меланж-XL', color: 'Серый меланж', size: 'XL', stock: 0, skuCode: 'MS-SW06-GRY-XL', barcode: '460760006006' },
      { id: 'minimal-sweatshirt-06-Темно-зеленый-M', color: 'Темно-зеленый', size: 'M', stock: 2, skuCode: 'MS-SW06-GRN-M', barcode: '460760006007' },
      { id: 'minimal-sweatshirt-06-Темно-зеленый-L', color: 'Темно-зеленый', size: 'L', stock: 3, skuCode: 'MS-SW06-GRN-L', barcode: '460760006008' },
      { id: 'minimal-sweatshirt-06-Темно-зеленый-XL', color: 'Темно-зеленый', size: 'XL', stock: 2, skuCode: 'MS-SW06-GRN-XL', barcode: '460760006009' },
    ]
  },
  {
    id: 'blazer-classic-07',
    title: 'Пиджак классический',
    category: 'shirts',
    categoryLabel: 'Пиджак',
    price: 7990,
    badge: 'Премиум',
    description: 'Однобортный пиджак приталенного силуэта. Итальянская полушерстяная ткань, шлицы сзади, мягкая подкладка.',
    material: '60% шерсть, 40% вискоза',
    images: [
      'https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&q=80&w=800',
      'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?auto=format&fit=crop&q=80&w=800'
    ],
    colors: [
      { name: 'Темно-синий', hex: '#16233B' },
      { name: 'Темно-серый', hex: '#2C3539' }
    ],
    sizes: ['48 (M)', '50 (L)', '52 (XL)'],
    inStock: true,
    isPopular: true,
    rating: 5.0,
    reviewsCount: 27,
    fit: 'slim',
    skus: [
      { id: 'blazer-classic-07-Темно-синий-48 (M)', color: 'Темно-синий', size: '48 (M)', stock: 2, skuCode: 'MS-BL07-NAV-48', barcode: '460770007001' },
      { id: 'blazer-classic-07-Темно-синий-50 (L)', color: 'Темно-синий', size: '50 (L)', stock: 3, skuCode: 'MS-BL07-NAV-50', barcode: '460770007002' },
      { id: 'blazer-classic-07-Темно-синий-52 (XL)', color: 'Темно-синий', size: '52 (XL)', stock: 1, skuCode: 'MS-BL07-NAV-52', barcode: '460770007003' },
      { id: 'blazer-classic-07-Темно-серый-48 (M)', color: 'Темно-серый', size: '48 (M)', stock: 0, skuCode: 'MS-BL07-DGR-48', barcode: '460770007004' },
      { id: 'blazer-classic-07-Темно-серый-50 (L)', color: 'Темно-серый', size: '50 (L)', stock: 2, skuCode: 'MS-BL07-DGR-50', barcode: '460770007005' },
      { id: 'blazer-classic-07-Темно-серый-52 (XL)', color: 'Темно-серый', size: '52 (XL)', stock: 2, skuCode: 'MS-BL07-DGR-52', barcode: '460770007006' },
    ]
  }
];

export const PRODUCTS: Product[] = RAW_PRODUCTS.map((prod) => {
  const skus = prod.skus && prod.skus.length > 0 ? prod.skus : generateDefaultSKUs(prod);
  const totalStock = skus.reduce((sum, s) => sum + s.stock, 0);
  // Default cost price if not specified is approximately 42% - 48% of retail price
  const costPrice = prod.costPrice || Math.round(prod.price * 0.44);
  return {
    ...prod,
    costPrice,
    skus,
    inStock: totalStock > 0,
  };
});

export const DELIVERY_METHODS: DeliveryMethod[] = [
  {
    id: 'courier',
    title: 'Курьером до двери',
    duration: '1–2 дня',
    price: 0,
    icon: 'Bike'
  },
  {
    id: 'pickup',
    title: 'Пункт выдачи',
    duration: '2–3 дня',
    price: 250,
    icon: 'Store'
  },
  {
    id: 'post',
    title: 'Почта России',
    duration: '3–5 дней',
    price: 350,
    icon: 'Mail'
  }
];

export const INITIAL_USER_PROFILE = {
  name: 'Администратор MANSTYLE',
  email: 'gunh83975@gmail.com',
  phone: '+7 (999) 000-11-22',
  avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=300',
  address: {
    street: 'Пресненская наб.',
    house: '12',
    entrance: '1',
    floor: '45',
    apartment: 'оф. 4502',
    intercom: '4502',
    city: 'Москва',
    postalCode: '123317'
  },
  savedAddresses: [
    {
      id: 'addr-1',
      title: 'Офис MANSTYLE',
      city: 'Москва',
      street: 'Пресненская наб.',
      house: '12',
      entrance: '1',
      floor: '45',
      apartment: 'оф. 4502',
      intercom: '4502',
      postalCode: '123317',
      isDefault: true
    },
    {
      id: 'addr-2',
      title: 'Дом',
      city: 'Москва',
      street: 'ул. Тверская',
      house: '7',
      entrance: '2',
      floor: '4',
      apartment: 'кв. 18',
      intercom: '18K',
      postalCode: '125009',
      isDefault: false
    }
  ],
  savedCards: [],
  notificationsEnabled: true,
  bonusPoints: 1500,
  bodyMeasurements: {
    height: 184,
    weight: 94,
    chest: 104,
    waist: 95,
    hips: 98,
    fitPreference: 'regular' as const,
    preferredSize: 'XL',
    russianSizeTop: 'RU 52 (XL)',
    russianSizeBottom: 'RU 52 (W35–W36)',
    heightGroup: '5-я ростовка (182–188 см)',
    bodyType: '3-я (Плотное телосложение)'
  }
};

export const INITIAL_ORDERS: Order[] = [];

