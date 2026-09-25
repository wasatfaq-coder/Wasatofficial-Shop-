import { DeliveryMethod, PickupPoint } from '../types';

export const INITIAL_DELIVERY_METHODS: DeliveryMethod[] = [
  {
    id: 'courier',
    title: 'Курьером до двери',
    duration: '1–2 дня',
    price: 350,
    icon: 'Bike',
    type: 'courier',
    description: 'Штатный курьер Wasat Shop с примеркой до 15 минут прямо у вас дома или в офисе.',
    freeThreshold: 5000,
    isActive: true,
    sortOrder: 1,
    highlightBadge: 'Удобно',
  },
  {
    id: 'pickup',
    title: 'Пункт выдачи',
    duration: 'Сегодня или 1 день',
    price: 0,
    icon: 'Store',
    type: 'pickup',
    description: 'Самовывоз из фирменного бутика Wasat Shop с примеркой и персональным стилистом.',
    isActive: true,
    sortOrder: 2,
    highlightBadge: 'Бесплатно',
  },
  {
    id: 'express',
    title: 'Экспресс день в день',
    duration: '2–4 часа',
    price: 690,
    icon: 'Zap',
    type: 'express',
    description: 'Срочная доставка Яндекс Доставкой или курьером в течение 2-4 часов после подтверждения.',
    isActive: true,
    sortOrder: 3,
    highlightBadge: 'Срочно',
  },
  {
    id: 'post',
    title: 'Почта России',
    duration: '3–5 дней',
    price: 350,
    icon: 'Mail',
    type: 'post',
    description: 'Отправление 1-го класса с трек-номером и SMS-оповещением в любое отделение РФ.',
    isActive: true,
    sortOrder: 4,
  },
  {
    id: 'cdek',
    title: 'СДЭК (ПВЗ / До двери)',
    duration: '2–3 дня',
    price: 420,
    icon: 'Truck',
    type: 'custom',
    description: 'Экспресс-доставка СДЭК до ближайшего к вам пункта выдачи или курьером.',
    isActive: true,
    sortOrder: 5,
  },
];

export const INITIAL_PICKUP_POINTS: PickupPoint[] = [
  {
    id: 'pickup-presnya',
    name: 'Флагманский бутик Wasat Shop (Москва-Сити)',
    city: 'Москва',
    address: 'Пресненская наб., 12, ММДЦ «Москва-Сити», Башня Федерация Восток, 45 этаж, бутик 4502',
    metro: 'Деловой центр / Выставочная',
    schedule: 'Ежедневно: 10:00 – 22:00 (без выходных)',
    phone: '+7 (495) 790-12-34',
    note: 'Проход через центральный ресепшн. Индивидуальные примерочные залы, чай, кофе и услуги портного.',
    isActive: true,
    isDefault: true,
  },
  {
    id: 'pickup-tverskaya',
    name: 'Шоурум Wasat Shop Тверская',
    city: 'Москва',
    address: 'ул. Тверская, 15, строение 1, 2 этаж',
    metro: 'Тверская / Пушкинская / Чеховская',
    schedule: 'Пн–Сб: 10:00 – 21:00, Вс: 11:00 – 20:00',
    phone: '+7 (495) 629-88-10',
    note: 'Вход со стороны Малого Гнездниковского переулка. Доступна быстрая выдача и примерка.',
    isActive: true,
    isDefault: false,
  },
  {
    id: 'pickup-spb',
    name: 'Бутик Wasat Shop Невский',
    city: 'Санкт-Петербург',
    address: 'Невский проспект, 54, Галерея бутиков, 1 этаж',
    metro: 'Гостиный двор / Маяковская',
    schedule: 'Ежедневно: 10:00 – 22:00',
    phone: '+7 (812) 412-55-90',
    note: 'Парковка для клиентов, выдача интернет-заказов в день обращения при наличии товара.',
    isActive: true,
    isDefault: false,
  },
];

export function loadLocalDeliveryMethods(): DeliveryMethod[] {
  try {
    const saved = localStorage.getItem('manstyle_delivery_methods');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('Error reading delivery methods from localStorage:', e);
  }
  // No demo fallback: the list comes from Firestore (settings in Admin → «Доставка и ПВЗ»)
  return [];
}

export function saveLocalDeliveryMethods(methods: DeliveryMethod[]) {
  try {
    localStorage.setItem('manstyle_delivery_methods', JSON.stringify(methods));
  } catch (e) {
    console.warn('Error saving delivery methods to localStorage:', e);
  }
}

export function loadLocalPickupPoints(): PickupPoint[] {
  try {
    const saved = localStorage.getItem('manstyle_pickup_points');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('Error reading pickup points from localStorage:', e);
  }
  return [];
}

export function saveLocalPickupPoints(points: PickupPoint[]) {
  try {
    localStorage.setItem('manstyle_pickup_points', JSON.stringify(points));
  } catch (e) {
    console.warn('Error saving pickup points to localStorage:', e);
  }
}
