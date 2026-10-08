// «Аналитика» и отчёт PDF (аудит 07.10, находка 44): числа экрана считаются computeFirestoreDailySales и
// computePeriodBreakdown (src/utils/analyticsEngine.ts). Время — местное время браузера владельца, поэтому даты
// заказов и «сейчас» строятся местным конструктором Date: тест не зависит от часового пояса машины.
import { describe, expect, test } from 'bun:test';
import { computeFirestoreDailySales, computePeriodBreakdown } from '../../src/utils/analyticsEngine';
import type { CartItem, Order } from '../../src/types';

// 7 октября 2026, 15:00 по местному времени
const NOW = new Date(2026, 9, 7, 15, 0);
const at = (month: number, day: number, hours = 12, minutes = 0) => new Date(2026, month - 1, day, hours, minutes);

const order = (id: string, placed: Date, over: Partial<Order> = {}): Order =>
  ({
    id,
    createdAt: placed.toISOString(),
    date: '',
    status: 'accepted',
    items: [],
    totalPrice: 1000,
    paymentStatus: 'paid',
    deliveryAddress: '',
    deliveryMethod: 'Курьер',
    customerName: 'Покупатель',
    customerPhone: '+79990000000',
    paymentMethod: 'Перевод',
    ...over,
  }) as Order;

describe('периоды по дням', () => {
  test('7 дней — с полуночи шестого дня назад по сегодня; заказ минутой раньше — в прошлом периоде', () => {
    const orders = [
      order('first-minute', at(10, 1, 0, 0), { totalPrice: 700 }),
      order('last-minute-before', at(9, 30, 23, 59), { totalPrice: 500 }),
      order('today', at(10, 7, 14, 59), { totalPrice: 1000 }),
      order('prev-start', at(9, 24, 0, 0), { totalPrice: 300 }),
      order('before-prev', at(9, 23, 23, 59), { totalPrice: 10_000 }),
    ];
    const { dailyData, summary, periodOrders } = computeFirestoreDailySales(orders, '7d', 'all', null, NOW);
    expect(dailyData.map((d) => d.dateKey)).toEqual([
      '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07',
    ]);
    expect(periodOrders.map((o) => o.id).sort()).toEqual(['first-minute', 'today']);
    expect(summary.totalRevenue).toBe(1700);
    // the previous period of the same length: 24.09 00:00 — 30.09 23:59
    expect(summary.prevTotalRevenue).toBe(800);
    expect(summary.prevTotalOrders).toBe(2);
    expect(summary.revenueGrowth).toBe(112.5);
    expect(summary.periodDaysCount).toBe(7);
    expect(summary.avgDailyRevenue).toBe(Math.round(1700 / 7));
    expect(dailyData[6]).toMatchObject({ date: '7 окт', fullDate: '7 октября 2026', revenue: 1000, orders: 1, isPeakDay: true });
    expect(summary.peakDay).toEqual({ date: '7 октября 2026', label: '7 окт', revenue: 1000 });
  });

  test('14 и 30 дней: столько же столбиков, у 30 дней подпись — дата', () => {
    const d14 = computeFirestoreDailySales([], '14d', 'all', null, NOW).dailyData;
    expect(d14.length).toBe(14);
    expect(d14[0].dateKey).toBe('2026-09-24');
    const d30 = computeFirestoreDailySales([], '30d', 'all', null, NOW).dailyData;
    expect(d30.length).toBe(30);
    expect(d30[0].dateKey).toBe('2026-09-08');
    expect(d30[29].label).toBe('7 окт');
  });

  test('пустой период: нули и нет «пика», рост без прошлого периода — 0', () => {
    const { summary } = computeFirestoreDailySales([], '7d', 'all', null, NOW);
    expect(summary).toMatchObject({ totalRevenue: 0, totalOrders: 0, avgCheck: 0, returnRate: '0', peakDay: null, revenueGrowth: 0 });
  });
});

describe('месяцы', () => {
  test('6 месяцев — с первого числа пятого месяца назад; прошлый период — 6 месяцев до него', () => {
    const orders = [
      order('may-first', at(5, 1, 0, 0), { totalPrice: 400 }),
      order('april-last', at(4, 30, 23, 59), { totalPrice: 600 }),
      order('prev-first', new Date(2025, 10, 1), { totalPrice: 50 }),
      order('october', at(10, 7, 9), { totalPrice: 1000 }),
    ];
    const { dailyData, summary } = computeFirestoreDailySales(orders, '6m', 'all', null, NOW);
    expect(dailyData.map((d) => d.dateKey)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    expect(dailyData.map((d) => d.label)).toEqual(['МАЙ', 'ИЮН', 'ИЮЛ', 'АВГ', 'СЕН', 'ОКТ']);
    expect(dailyData[0]).toMatchObject({ revenue: 400, fullDate: 'Май 2026', weekday: 'Месяц' });
    expect(summary.totalRevenue).toBe(1400);
    // 01.11.2025 — 30.04.2026
    expect(summary.prevTotalRevenue).toBe(650);
  });

  test('год — 12 месяцев с ноября прошлого года', () => {
    const { dailyData } = computeFirestoreDailySales([], '1y', 'all', null, NOW);
    expect(dailyData.length).toBe(12);
    expect(dailyData[0].dateKey).toBe('2025-11');
    expect(dailyData[11].dateKey).toBe('2026-10');
  });
});

describe('какие заказы приносят выручку', () => {
  const orders = [
    order('paid', at(10, 7, 10), { totalPrice: 1000 }),
    order('unpaid', at(10, 7, 11), { totalPrice: 2000, paymentStatus: 'pending' }),
    order('cancelled', at(10, 6, 10), { totalPrice: 3000, isCancelled: true }),
    order('refund-part', at(10, 5, 10), { totalPrice: 1000, paymentStatus: 'refunded', refundAmount: 400 }),
    order('refund-full', at(10, 5, 11), { totalPrice: 500, paymentStatus: 'refunded' }),
    order('delivered-unpaid', at(10, 4, 10), { totalPrice: 900, paymentStatus: 'paid_on_delivery', status: 'delivered' }),
  ];

  test('выручка — только оплаченное за вычетом возврата; отменённые — в «возвратах», не в заказах', () => {
    const { dailyData, summary } = computeFirestoreDailySales(orders, '7d', 'all', null, NOW);
    expect(summary.totalRevenue).toBe(1600);
    expect(summary.totalOrders).toBe(5);
    expect(summary.totalReturns).toBe(1);
    expect(summary.returnRate).toBe('16.7');
    // the check of paid orders only: «paid» and the partly refunded one
    expect(summary.avgCheck).toBe(800);
    expect(summary.paidOrdersCount).toBe(1);
    const today = dailyData[6];
    expect(today).toMatchObject({ orders: 2, revenue: 1000, avgCheck: 1000, returns: 0 });
    expect(today.realOrdersList.map((o) => o.id).sort()).toEqual(['paid', 'unpaid']);
    expect(dailyData[5]).toMatchObject({ orders: 0, returns: 1, revenue: 0, hasRealOrders: true });
    expect(dailyData[4]).toMatchObject({ orders: 2, revenue: 600, avgCheck: 600 });
  });

  test('фильтр «Оплаченные» — только «Оплачен», «Врученные» — только полученные', () => {
    const paid = computeFirestoreDailySales(orders, '7d', 'paid', null, NOW);
    expect(paid.periodOrders.map((o) => o.id)).toEqual(['paid']);
    expect(paid.summary.totalRevenue).toBe(1000);
    const delivered = computeFirestoreDailySales(orders, '7d', 'delivered', null, NOW);
    expect(delivered.periodOrders.map((o) => o.id)).toEqual(['delivered-unpaid']);
    // delivered but not paid yet: no revenue
    expect(delivered.summary.totalRevenue).toBe(0);
  });
});

describe('сброс статистики (resetAt) и заказы без даты', () => {
  const undated = order('old', at(10, 7), { createdAt: undefined, date: 'Сегодня, 14:30' });

  test('заказы до сброса не считаются; заказ без даты — отдельно, пока сброса нет', () => {
    const orders = [order('before', at(10, 3, 9, 59), { totalPrice: 5000 }), order('after', at(10, 3, 10, 0)), undated];
    const all = computeFirestoreDailySales(orders, '7d', 'all', null, NOW);
    expect(all.summary.totalRevenue).toBe(6000);
    expect(all.undatedCount).toBe(1);
    expect(all.summary.realOrdersCount).toBe(3);

    const reset = computeFirestoreDailySales(orders, '7d', 'all', at(10, 3, 10, 0).getTime(), NOW);
    expect(reset.summary.totalRevenue).toBe(1000);
    expect(reset.periodOrders.map((o) => o.id)).toEqual(['after']);
    expect(reset.undatedCount).toBe(0);
  });

  test('сброс отрезает и прошлый период: рост не считается от удалённой истории', () => {
    const orders = [order('prev', at(9, 28), { totalPrice: 4000 }), order('now', at(10, 6))];
    const reset = computeFirestoreDailySales(orders, '7d', 'all', at(10, 1, 0, 0).getTime(), NOW);
    expect(reset.summary.prevTotalRevenue).toBe(0);
    expect(reset.summary.revenueGrowth).toBe(0);
  });
});

describe('computePeriodBreakdown — товары, категории и промокоды периода', () => {
  const line = (id: string, price: number, quantity: number, categoryLabel?: string, images?: string[]): CartItem =>
    ({ id: `l-${id}`, product: { id, title: `Товар ${id}`, price, categoryLabel, images }, quantity, selectedSize: 'M' }) as unknown as CartItem;

  test('цены и названия — из заказа; отменённые не считаются; топ по штукам, затем по сумме', () => {
    const orders = [
      order('o1', at(10, 7), { items: [line('a', 1000, 2, 'Рубашки', ['img-a']), line('b', 3000, 1, 'Брюки')], promoCode: ' sale10 ', discountAmount: 500, totalPrice: 4500 }),
      order('o2', at(10, 6), { items: [line('b', 3000, 1, 'Брюки'), line('c', 500, 1)], promoCode: 'SALE10', discountAmount: 100, totalPrice: 3400, paymentStatus: 'pending' }),
      order('o3', at(10, 5), { items: [line('d', 10_000, 5, 'Пальто')], isCancelled: true, promoCode: 'SALE10' }),
      order('o4', at(10, 5), { items: [line('c', 500, 1)] }),
    ];
    const { topProducts, categories, promos } = computePeriodBreakdown(orders, 2);
    // a, b and c — 2 pieces each: the larger sum first, the top is cut to 2
    expect(topProducts).toEqual([
      { id: 'b', title: 'Товар b', image: undefined, quantity: 2, revenue: 6000 },
      { id: 'a', title: 'Товар a', image: 'img-a', quantity: 2, revenue: 2000 },
    ]);
    // items total 9000: Брюки 6000, Рубашки 2000, «Без категории» 1000
    expect(categories).toEqual([
      { name: 'Брюки', revenue: 6000, share: 67 },
      { name: 'Рубашки', revenue: 2000, share: 22 },
      { name: 'Без категории', revenue: 1000, share: 11 },
    ]);
    // one code whatever the case and spaces; the revenue — only paid money; share of the period's active orders
    expect(promos).toEqual([{ code: 'SALE10', orders: 2, revenue: 4500, discount: 600, share: 66.7 }]);
  });

  test('пустой период — пустые списки без деления на ноль', () => {
    expect(computePeriodBreakdown([])).toEqual({ topProducts: [], categories: [], promos: [] });
  });
});
