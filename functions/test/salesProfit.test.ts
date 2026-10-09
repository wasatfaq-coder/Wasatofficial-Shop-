// «Аналитика»: опт и розница, чистый доход (выручка − себестоимость закупки) и периоды по дням, неделям и месяцам
// (этап 19 docs/admin-wholesale-plan.md, src/utils/salesProfit.ts, src/utils/analyticsPeriods.ts). Время — местное,
// как в analyticsEngine.test.ts: даты строятся местным конструктором Date.
import { describe, expect, test } from 'bun:test';
import { computeFirestoreDailySales } from '../../src/utils/analyticsEngine';
import { isWholesaleLine, orderSalesChannel } from '../../src/shared/orderLine';
import {
  currentCostMap,
  lineCostKey,
  orderCogs,
  orderGoodsRevenue,
  profitByChannel,
  summarizeProfit,
  type CostSources,
} from '../../src/utils/salesProfit';
import {
  allowedGroupings,
  defaultGrouping,
  fitGrouping,
  periodBuckets,
  periodRangeText,
  resolvePeriod,
} from '../../src/utils/analyticsPeriods';
import type { CartItem, Order } from '../../src/types';

// 7 октября 2026 (среда), 15:00 по местному времени
const NOW = new Date(2026, 9, 7, 15, 0);
const at = (month: number, day: number, hours = 12) => new Date(2026, month - 1, day, hours, 0);

const line = (id: string, price: number, quantity: number, over: Partial<CartItem> = {}): CartItem =>
  ({
    id: `l-${id}-${over.selectedSize ?? 'M'}`,
    product: { id, title: `Товар ${id}`, price },
    quantity,
    selectedSize: 'M',
    selectedColor: 'Синий',
    ...over,
  }) as unknown as CartItem;

const order = (id: string, placed: Date, items: CartItem[], over: Partial<Order> = {}): Order =>
  ({
    id,
    createdAt: placed.toISOString(),
    date: '',
    status: 'accepted',
    items,
    totalPrice: items.reduce((s, it) => s + (it.unitPrice ?? it.product.price) * it.quantity, 0),
    paymentStatus: 'paid',
    deliveryAddress: '',
    deliveryMethod: 'Курьер',
    ...over,
  }) as Order;

// закупка сегодня: футболка 400 ₽, брюки 1 500 ₽; у «нового» товара себестоимости нет
const costs: CostSources = { current: currentCostMap([
  { id: 'tee', costPrice: 400 },
  { id: 'pants', costPrice: 1500 },
  { id: 'free', costPrice: 0 },
  { id: 'nocost' },
]) };

describe('разделение заказов на розницу и опт', () => {
  test('опт — если хоть одна строка по оптовой цене или упаковкой; старые заказы — розница', () => {
    expect(isWholesaleLine({})).toBe(false);
    expect(isWholesaleLine({ priceKind: 'retail' })).toBe(false);
    expect(isWholesaleLine({ priceKind: 'wholesale' })).toBe(true);
    expect(isWholesaleLine({ priceKind: 'pack' })).toBe(true);

    const historical = order('old', at(10, 1), [line('tee', 1000, 2)]);
    const retail = order('r', at(10, 1), [line('tee', 1000, 1, { priceKind: 'retail', unitPrice: 1000 })]);
    const wholesale = order('w', at(10, 1), [line('tee', 1000, 20, { priceKind: 'wholesale', unitPrice: 700 })]);
    const pack = order('p', at(10, 1), [line('tee', 1000, 5, { priceKind: 'pack', unitPrice: 650 })]);
    const mixed = order('m', at(10, 1), [line('tee', 1000, 1), line('pants', 3000, 10, { priceKind: 'wholesale', unitPrice: 2400 })]);
    expect([historical, retail, wholesale, pack, mixed].map(orderSalesChannel)).toEqual([
      'retail', 'retail', 'wholesale', 'wholesale', 'wholesale',
    ]);
    // заказ без строк (очень старый или испорченный) не ломает разделение
    expect(orderSalesChannel({} as Order)).toBe('retail');
  });

  test('фильтр «Розница» и «Опт» оставляет только свои заказы, «Все продажи» — сумма обоих', () => {
    const orders = [
      order('r1', at(10, 6), [line('tee', 1000, 2)]),
      order('w1', at(10, 6), [line('tee', 1000, 20, { priceKind: 'wholesale', unitPrice: 700 })]),
    ];
    const all = computeFirestoreDailySales(orders, '7d', 'all', null, NOW, { costs });
    const retail = computeFirestoreDailySales(orders, '7d', 'all', null, NOW, { costs, channel: 'retail' });
    const wholesale = computeFirestoreDailySales(orders, '7d', 'all', null, NOW, { costs, channel: 'wholesale' });
    expect(retail.periodOrders.map((o) => o.id)).toEqual(['r1']);
    expect(wholesale.periodOrders.map((o) => o.id)).toEqual(['w1']);
    expect(retail.summary.totalRevenue).toBe(2000);
    expect(wholesale.summary.totalRevenue).toBe(14_000);
    expect(all.summary.totalRevenue).toBe(16_000);
    expect(all.summary.profit.netProfit).toBe(retail.summary.profit.netProfit + wholesale.summary.profit.netProfit);
  });
});

describe('чистый доход = выручка − себестоимость закупки', () => {
  test('розница: промокод уменьшает выручку, доставка в доход не входит', () => {
    // 2 × 1 000 ₽, скидка 10 % (200 ₽), доставка 300 ₽: оплачено 2 100 ₽
    const o = order('r', at(10, 6), [line('tee', 1000, 2)], { totalPrice: 2100, discountAmount: 200, deliveryFee: 300, promoCode: 'SALE10' });
    expect(orderGoodsRevenue(o)).toBe(1800);
    expect(orderCogs(o, costs)).toEqual({ cogs: 800, estimated: true, missingLines: 0 });
    expect(summarizeProfit([o], costs)).toMatchObject({ revenue: 1800, cogs: 800, netProfit: 1000, marginPercent: 55.6, orders: 1 });
  });

  test('опт: выручка — по оптовой цене строки со скидкой от объёма, а не по розничной', () => {
    // ступень «от 20 шт. — 700 ₽» вместо 1 000 ₽, упаковка брюк — 2 400 ₽ за штуку вместо 3 000 ₽
    const o = order('w', at(10, 6), [
      line('tee', 1000, 20, { priceKind: 'wholesale', unitPrice: 700 }),
      line('pants', 3000, 5, { priceKind: 'pack', unitPrice: 2400, selectedSize: '48' }),
      line('pants', 3000, 5, { priceKind: 'pack', unitPrice: 2400, selectedSize: '50' }),
    ]);
    expect(o.totalPrice).toBe(14_000 + 24_000);
    const p = summarizeProfit([o], costs);
    // закупка: 20 × 400 + 10 × 1 500 = 23 000
    expect(p).toMatchObject({ revenue: 38_000, cogs: 23_000, netProfit: 15_000, marginPercent: 39.5 });
    expect(profitByChannel([o], costs).retail.orders).toBe(0);
    expect(profitByChannel([o], costs).wholesale.netProfit).toBe(15_000);
  });

  test('наценка и правка заказа администратором: доход — от того, что заплатили', () => {
    // администратор поднял сумму заказа (корректировка), покупатель оплатил 2 500 ₽
    const o = order('adj', at(10, 6), [line('tee', 1000, 2)], { totalPrice: 2500, isAdjusted: true });
    expect(summarizeProfit([o], costs)).toMatchObject({ revenue: 2500, cogs: 800, netProfit: 1700 });
  });

  test('неоплаченные и отменённые не приносят дохода и не тратят себестоимость; частичный возврат вычитается', () => {
    const orders = [
      order('unpaid', at(10, 6), [line('tee', 1000, 1)], { paymentStatus: 'pending' }),
      order('cancelled', at(10, 6), [line('tee', 1000, 1)], { isCancelled: true }),
      order('refund-full', at(10, 6), [line('tee', 1000, 1)], { paymentStatus: 'refunded' }),
      order('refund-part', at(10, 6), [line('tee', 1000, 2)], { paymentStatus: 'refunded', refundAmount: 500 }),
    ];
    // только частично возвращённый: 2 000 − 500 = 1 500 выручки, себестоимость обеих штук — 800
    expect(summarizeProfit(orders, costs)).toMatchObject({ revenue: 1500, cogs: 800, netProfit: 700, orders: 1 });
  });

  test('убыток: продажа ниже закупки даёт отрицательный доход и маржу', () => {
    const o = order('loss', at(10, 6), [line('pants', 1200, 1)]);
    expect(summarizeProfit([o], costs)).toMatchObject({ revenue: 1200, cogs: 1500, netProfit: -300, marginPercent: -25 });
  });

  test('пустой период — нули, маржа не делится на ноль', () => {
    expect(summarizeProfit([], costs)).toMatchObject({ revenue: 0, cogs: 0, netProfit: 0, marginPercent: null, orders: 0 });
  });
});

describe('себестоимость на момент продажи и обратная совместимость', () => {
  const sold = order('o1', at(10, 6), [line('tee', 1000, 3), line('pants', 3000, 1, { selectedSize: '50' })]);

  test('снимок заказа важнее сегодняшней закупки: прошлый отчёт не меняется, когда закупка дорожает', () => {
    const snapshot = { lines: { [lineCostKey(sold.items[0])]: 350, [lineCostKey(sold.items[1])]: 1400 } };
    const withSnapshot: CostSources = { ...costs, snapshots: new Map([['o1', snapshot]]) };
    expect(orderCogs(sold, withSnapshot)).toEqual({ cogs: 3 * 350 + 1400, estimated: false, missingLines: 0 });
    // закупка выросла — снимок тот же, доход тот же
    const pricier: CostSources = { current: new Map([['tee', 900], ['pants', 2500]]), snapshots: withSnapshot.snapshots };
    expect(orderCogs(sold, pricier).cogs).toBe(3 * 350 + 1400);
  });

  test('старый заказ без снимка — по сегодняшней себестоимости, с пометкой «оценка»', () => {
    expect(orderCogs(sold, costs)).toEqual({ cogs: 3 * 400 + 1500, estimated: true, missingLines: 0 });
    expect(summarizeProfit([sold], costs).estimatedOrders).toBe(1);
  });

  test('строка снимка нет (добавлена правкой состава) — только она по сегодняшней себестоимости', () => {
    const snapshots = new Map([['o1', { lines: { [lineCostKey(sold.items[0])]: 350 } }]]);
    expect(orderCogs(sold, { ...costs, snapshots })).toEqual({ cogs: 3 * 350 + 1500, estimated: true, missingLines: 0 });
  });

  test('товар без себестоимости (не задана, 0 или товар удалён) — по 0 ₽ и считается отдельно', () => {
    const o = order('o2', at(10, 6), [line('nocost', 500, 1), line('free', 500, 1), line('deleted', 500, 2), line('tee', 1000, 1)]);
    expect(orderCogs(o, costs)).toEqual({ cogs: 400, estimated: true, missingLines: 3 });
    expect(summarizeProfit([o], costs).missingCostLines).toBe(3);
  });

  test('исторические заказы без доставки, количества и признака опта считаются без сбоев', () => {
    const legacy = {
      id: 'legacy',
      createdAt: at(10, 5).toISOString(),
      date: '',
      status: 'delivered',
      totalPrice: '1500',
      paymentStatus: 'paid',
      items: [{ id: 'x', product: { id: 'tee', price: 1500 }, selectedSize: 'M', selectedColor: '' }],
    } as unknown as Order;
    const { summary, dailyData } = computeFirestoreDailySales([legacy], '7d', 'all', null, NOW, { costs });
    expect(orderSalesChannel(legacy)).toBe('retail');
    expect(summary.profit).toMatchObject({ revenue: 1500, cogs: 400, netProfit: 1100, estimatedOrders: 1 });
    expect(dailyData.find((d) => d.dateKey === '2026-10-05')).toMatchObject({ revenue: 1500, cogs: 400, netProfit: 1100 });
    // без себестоимостей (вызов как раньше, «Сегодня») — доход равен выручке от товаров
    expect(computeFirestoreDailySales([legacy], '7d', 'all', null, NOW).summary.profit.cogs).toBe(0);
  });
});

describe('доход по дням и сравнение с прошлым периодом', () => {
  test('у каждого дня своя себестоимость и чистый доход; рост — к прошлым 7 дням', () => {
    const orders = [
      order('today', at(10, 7), [line('tee', 1000, 2)]),
      order('yesterday', at(10, 6), [line('pants', 3000, 1)]),
      order('prev', at(9, 28), [line('tee', 1000, 1)]),
    ];
    const { dailyData, summary } = computeFirestoreDailySales(orders, '7d', 'all', null, NOW, { costs });
    expect(dailyData[6]).toMatchObject({ cogs: 800, netProfit: 1200 });
    expect(dailyData[5]).toMatchObject({ cogs: 1500, netProfit: 1500 });
    expect(summary.profit.netProfit).toBe(2700);
    expect(summary.prevNetProfit).toBe(600);
    expect(summary.netProfitGrowth).toBe(350);
  });
});

describe('периоды: день, неделя, месяц, свои даты', () => {
  test('свои даты — оба дня включительно, прошлый период — столько же дней перед ними; порядок дат не важен', () => {
    const p = resolvePeriod({ from: '2026-09-10', to: '2026-09-01' }, NOW);
    expect(p.start).toEqual(new Date(2026, 8, 1));
    expect(p.end).toEqual(new Date(2026, 8, 11));
    expect(p.days).toBe(10);
    expect(p.prevStart).toEqual(new Date(2026, 7, 22));
    expect(periodRangeText({ from: '2026-09-01', to: '2026-09-10' }, NOW)).toBe('1 сент. — 10 сент.');
  });

  test('недели — с понедельника, крайние недели обрезаны по периоду', () => {
    // 30 дней: 8 сентября (вторник) — 7 октября (среда)
    const buckets = periodBuckets(resolvePeriod('30d', NOW), 'week');
    expect(buckets.map((b) => b.dateKey)).toEqual(['W2026-09-08', 'W2026-09-14', 'W2026-09-21', 'W2026-09-28', 'W2026-10-05']);
    expect(buckets[0]).toMatchObject({ label: '8 сен', fullDate: '8–13 сентября 2026', weekday: 'Неделя' });
    expect(buckets[3].fullDate).toBe('28 сен – 4 окт 2026');
    expect(buckets[4].end).toBe(new Date(2026, 9, 8).getTime());
  });

  test('заказы ложатся в свою неделю и свой месяц', () => {
    const orders = [
      order('mon', at(10, 5, 0), [line('tee', 1000, 1)]),
      order('sun', at(10, 4, 23), [line('tee', 1000, 2)]),
      order('aug', at(8, 31), [line('tee', 1000, 3)]),
    ];
    const weeks = computeFirestoreDailySales(orders, '30d', 'all', null, NOW, { grouping: 'week', costs });
    expect(weeks.grouping).toBe('week');
    expect(weeks.dailyData.map((d) => d.revenue)).toEqual([0, 0, 0, 2000, 1000]);
    const months = computeFirestoreDailySales(orders, { from: '2026-08-01', to: '2026-10-07' }, 'all', null, NOW, {
      grouping: 'month',
      costs,
    });
    expect(months.dailyData.map((d) => [d.dateKey, d.revenue])).toEqual([['2026-08', 3000], ['2026-09', 0], ['2026-10', 3000]]);
    expect(months.summary.profit.netProfit).toBe(6000 - 6 * 400);
  });

  test('по дням — только до ~3 месяцев, по неделям — до ~2 лет; недоступная группировка заменяется', () => {
    expect(allowedGroupings({ days: 30 })).toEqual(['day', 'week', 'month']);
    expect(allowedGroupings({ days: 365 })).toEqual(['week', 'month']);
    expect(allowedGroupings({ days: 3 * 365 })).toEqual(['month']);
    expect(fitGrouping('day', { days: 365 })).toBe('week');
    expect(defaultGrouping('7d', NOW)).toBe('day');
    expect(defaultGrouping('1y', NOW)).toBe('month');
    expect(defaultGrouping({ from: '2026-08-01', to: '2026-10-07' }, NOW)).toBe('week');
    // год по дням не рисуется: 365 столбиков — недели
    const year = computeFirestoreDailySales([], { from: '2025-10-08', to: '2026-10-07' }, 'all', null, NOW, { grouping: 'day' });
    expect(year.grouping).toBe('week');
  });

  test('готовые периоды считаются как раньше', () => {
    expect(computeFirestoreDailySales([], '7d', 'all', null, NOW).dailyData.map((d) => d.label)[0]).toBe('Чт 1');
    expect(computeFirestoreDailySales([], '6m', 'all', null, NOW).dailyData.map((d) => d.dateKey)).toEqual([
      '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10',
    ]);
  });
});
