import { pluralRu } from '../../utils/pluralize';
import { AdminHint } from './AdminHint';
import { AdminAnalyticsEmptyState as EmptyState } from './AdminAnalyticsPromos';
import React, { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { AdminSiteErrorsCard } from './AdminSiteErrorsCard';
import {
  TrendingUp,
  ShoppingBag,
  RotateCcw,
  Award,
  BarChart3,
  LineChart as LineChartIcon,
  Loader2,
  Flame,
  Coins,
  PackageOpen,
  Layers,
  Receipt,
  RotateCw,
  Trash2,
  CalendarClock,
  CalendarRange,
  ChevronDown,
  FileDown,
} from 'lucide-react';
import type { Order, Product, PromoCode } from '../../types';
import { OrderLineThumbImage } from '../ProductThumbImage';
import { generateAnalyticsPDF, preloadPdfLibraries } from '../../utils/pdfExport';
import {
  computeFirestoreDailySales,
  computePeriodBreakdown,
  orderRevenue,
  type ChannelFilter,
  type OrderStatusFilter,
  type DailyDataPoint,
} from '../../utils/analyticsEngine';
import {
  allowedGroupings,
  groupingText,
  isCustomPeriod,
  perBucketText,
  periodRangeText,
  resolvePeriod,
  type AnalyticsGrouping,
  type PeriodSelection,
} from '../../utils/analyticsPeriods';
import { currentCostMap, profitByChannel, type CostSources, type OrderCostSnapshot } from '../../utils/salesProfit';
import { AdminAnalyticsPeriodDialog, periodTitle } from './AdminAnalyticsPeriodDialog';
import { AdminAnalyticsProfitCard } from './AdminAnalyticsProfitCard';
import { AdminAnalyticsPromos } from './AdminAnalyticsPromos';
import { orderTimestamp } from '../../shared/orderDate';
import { adminStatusLabel } from '../../utils/orderFlow';
import { subscribeToAnalyticsResetAt, saveAnalyticsResetAt, subscribeToOrderCosts } from '../../utils/firebaseSync';
import { AdminDailySalesInspector } from './AdminDailySalesInspector';
import { triggerChartHapticFeedback } from './AdminChartNeumorphicShapes';
import { ConfirmDialog } from '../ConfirmDialog';

// The chart library (recharts, most of this section's code) loads apart: the cards and lists show first
const AdminAnalyticsChart = lazy(() => import('./AdminAnalyticsChart'));

/** Keeps the chart's place while its code loads */
const ChartLoading: React.FC = () => (
  <div role="status" className="h-full w-full flex items-center justify-center gap-2 text-[11px] font-bold text-[#4E5C70]">
    <Loader2 className="w-4 h-4 animate-spin text-accent" aria-hidden="true" />
    Загрузка графика…
  </div>
);

interface AdminAnalyticsTabProps {
  orders: Order[];
  /** The catalog: photos of the top products come only from it, never from the order (audit 07.10, finding 7) */
  products: Product[];
  promos?: PromoCode[];
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
  onSelectOrder?: (order: Order) => void;
}

export type ChartType = 'area' | 'bar';
export type ActiveMetric = 'revenue' | 'orders' | 'returns' | 'avgCheck' | 'cogs' | 'netProfit';

/** Chart colours: brand tokens (accent, success, warning) as hex for SVG */
const METRICS: { id: ActiveMetric; label: string; unit: string; color: string; fill: string }[] = [
  { id: 'revenue', label: 'Выручка', unit: '₽', color: '#2C4A6B', fill: 'url(#colorRevenueArea)' },
  { id: 'netProfit', label: 'Чистый доход', unit: '₽', color: '#3B6652', fill: 'url(#colorOrdersArea)' },
  { id: 'cogs', label: 'Закупка', unit: '₽', color: '#5A6F8C', fill: 'url(#colorAvgCheckArea)' },
  { id: 'orders', label: 'Заказы', unit: 'шт', color: '#3B6652', fill: 'url(#colorOrdersArea)' },
  { id: 'avgCheck', label: 'Средний чек', unit: '₽', color: '#5A6F8C', fill: 'url(#colorAvgCheckArea)' },
  { id: 'returns', label: 'Отмены', unit: 'шт', color: '#8C733E', fill: 'url(#colorReturnsArea)' },
];

const CHANNEL_FILTERS: { id: ChannelFilter; label: string }[] = [
  { id: 'all', label: 'Все продажи' },
  { id: 'retail', label: 'Розница' },
  { id: 'wholesale', label: 'Опт' },
];

const GROUPINGS: { id: AnalyticsGrouping; label: string }[] = [
  { id: 'day', label: 'Дни' },
  { id: 'week', label: 'Недели' },
  { id: 'month', label: 'Месяцы' },
];

const STATUS_FILTERS: { id: OrderStatusFilter; label: string }[] = [
  { id: 'all', label: 'Все заказы' },
  { id: 'paid', label: 'Оплаченные' },
  { id: 'delivered', label: 'Полученные' },
];

const rub = (value: number) => `${value < 0 ? '−' : ''}${Math.abs(value).toLocaleString('ru-RU')} ₽`;

const formatMoment = (ms: number) =>
  new Date(ms).toLocaleString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Change against the previous period of the same length: sign and colour follow the value */
const Growth: React.FC<{ value: number; hasBase: boolean }> = ({ value, hasBase }) => {
  if (!hasBase) return <span className="text-[#4E5C70] font-medium">нет данных за прошлый период</span>;
  const cls = value > 0 ? 'text-success' : value < 0 ? 'text-danger' : 'text-[#4E5C70]';
  return (
    <span className={`font-bold ${cls}`}>
      {value > 0 ? '+' : value < 0 ? '−' : ''}
      {Math.abs(value)}% к прошлому периоду
    </span>
  );
};


const KPI_HINTS: Record<ActiveMetric, string> = {
  revenue: 'Деньги только за заказы с отметкой «Оплачен». Неоплаченные не считаются',
  orders: 'Все оформленные заказы, кроме отменённых — и неоплаченные тоже',
  avgCheck: 'Выручка, делённая на число оплаченных заказов',
  returns: 'Заказы, которые отменили покупатель или магазин',
  cogs: 'Себестоимость: сколько стоили в закупке товары оплаченных заказов',
  netProfit: 'Деньги за товары оплаченных заказов (со скидками, без доставки) минус их себестоимость',
};

const Segments = <T extends string>({
  label,
  value,
  options,
  onChange,
  grid,
}: {
  label: string;
  value: T;
  options: { id: T; label: React.ReactNode; title?: string }[];
  onChange: (v: T) => void;
  /** Grid classes instead of a wrapping row (all options the same width, no lone option on a second line) */
  grid?: string;
}) => (
  <div className={`neu-flat-sm rounded-xl p-1 gap-1 ${grid ? `grid ${grid}` : 'flex flex-wrap'}`} role="radiogroup" aria-label={label}>
    {options.map((o) => (
      <button
        key={o.id}
        type="button"
        role="radio"
        aria-checked={value === o.id}
        title={o.title}
        onClick={() => onChange(o.id)}
        className={`flex-1 h-8 px-2.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
          value === o.id ? 'neu-pill-active' : 'text-[#4E5C70] hover:text-[#2D3A4E]'
        }`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

/**
 * Admin → «Аналитика»: orders of the period by day, week or month, retail and wholesale together or apart, KPIs (with
 * the net profit) against the previous period, the period's
 * top products, categories and promo codes, the PDF report. Everything is counted from orders (dated by
 * createdAt) placed after the statistics reset; orders themselves are never deleted here.
 */
export const AdminAnalyticsTab: React.FC<AdminAnalyticsTabProps> = ({ orders, products, promos = [], onShowToast, onSelectOrder }) => {
  const [period, setPeriod] = useState<PeriodSelection>('7d');
  // null — the period's own grouping (by day, by month for 6 and 12 months)
  const [chosenGrouping, setChosenGrouping] = useState<AnalyticsGrouping | null>(null);
  const [channel, setChannel] = useState<ChannelFilter>('all');
  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>('all');
  const [activeMetric, setActiveMetric] = useState<ActiveMetric>('revenue');
  const [chartType, setChartType] = useState<ChartType>('bar');
  const [selectedDay, setSelectedDay] = useState<DailyDataPoint | null>(null);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [resetAt, setResetAt] = useState<number | null>(null);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isPeriodOpen, setIsPeriodOpen] = useState(false);

  useEffect(() => subscribeToAnalyticsResetAt(setResetAt), []);

  // Cost of each order at the moment of sale (order_costs); an order without it — today's cost, an estimate (salesProfit.ts)
  const [snapshots, setSnapshots] = useState<Map<string, OrderCostSnapshot>>(() => new Map());
  useEffect(() => subscribeToOrderCosts(null, setSnapshots), []);
  const costs = useMemo<CostSources>(() => ({ current: currentCostMap(products), snapshots }), [products, snapshots]);
  const { dailyData, summary, periodOrders, undatedCount, grouping } = useMemo(
    () =>
      computeFirestoreDailySales(orders, period, statusFilter, resetAt, new Date(), {
        grouping: chosenGrouping ?? undefined,
        channel,
        costs,
      }),
    [orders, period, statusFilter, resetAt, chosenGrouping, channel, costs]
  );
  // «Розница и опт» shows both channels whatever channel is chosen above
  const allChannelOrders = useMemo(
    () =>
      channel === 'all'
        ? periodOrders
        : computeFirestoreDailySales(orders, period, statusFilter, resetAt, new Date(), { costs }).periodOrders,
    [channel, periodOrders, orders, period, statusFilter, resetAt, costs]
  );
  const byChannel = useMemo(() => profitByChannel(allChannelOrders, costs), [allChannelOrders, costs]);
  const groupingOptions = useMemo(() => {
    const allowed = allowedGroupings(resolvePeriod(period));
    return GROUPINGS.filter((g) => allowed.includes(g.id));
  }, [period]);
  const breakdown = useMemo(() => computePeriodBreakdown(periodOrders), [periodOrders]);
  const {
    totalRevenue,
    prevTotalRevenue,
    revenueGrowth,
    totalOrders,
    prevTotalOrders,
    ordersGrowth,
    avgDailyRevenue,
    peakDay,
    avgCheck,
    totalReturns,
    returnRate,
    profit,
    prevNetProfit,
    netProfitGrowth,
  } = summary;

  const bucketName = grouping === 'day' ? 'день' : grouping === 'week' ? 'неделю' : 'месяц';
  const periodName = periodTitle(period);
  const channelName = CHANNEL_FILTERS.find((c) => c.id === channel)!.label;
  // part of the cost is today's purchase price: the numbers are marked «≈»
  const approx = profit.estimatedOrders > 0 ? '≈ ' : '';
  const metric = METRICS.find((m) => m.id === activeMetric)!;

  // What a reset takes out of the statistics (orders placed since the current starting point)
  const countedNow = useMemo(() => {
    const counted = orders.filter((o) => {
      const t = orderTimestamp(o);
      return resetAt === null || (t !== null && t >= resetAt);
    });
    return { count: counted.length, revenue: counted.reduce((sum, o) => sum + orderRevenue(o), 0) };
  }, [orders, resetAt]);

  const selectedDayIndex = selectedDay ? dailyData.findIndex((d) => d.dateKey === selectedDay.dateKey) : -1;
  // keep the open day in sync with fresh orders
  const openDay = selectedDayIndex >= 0 ? dailyData[selectedDayIndex] : null;

  const changePeriod = (next: PeriodSelection) => {
    setPeriod(next);
    setChosenGrouping(null);
    setSelectedDay(null);
    triggerChartHapticFeedback('light');
  };

  const handleChartClick = useCallback((point: DailyDataPoint) => {
    setSelectedDay(point);
    triggerChartHapticFeedback(point.isPeakDay ? 'double' : 'medium');
  }, []);

  const showPeakDay = () => {
    const peak = dailyData.find((d) => d.isPeakDay);
    if (!peak) return;
    setSelectedDay(peak);
    setActiveMetric('revenue');
    triggerChartHapticFeedback('double');
  };

  const handleReset = async () => {
    try {
      await saveAnalyticsResetAt(Date.now());
      setSelectedDay(null);
      onShowToast('Статистика сброшена: считается с этого момента. Заказы не удалены', 'success');
    } catch (err) {
      console.error('Analytics reset was not saved:', err);
      onShowToast('Не удалось сбросить статистику', 'error');
    }
  };

  const handleRestoreHistory = async () => {
    try {
      await saveAnalyticsResetAt(null);
      onShowToast('Статистика снова считается по всей истории заказов', 'success');
    } catch (err) {
      console.error('Analytics history was not restored:', err);
      onShowToast('Не удалось вернуть историю', 'error');
    }
  };

  const handleExportPDF = async () => {
    setIsExportingPDF(true);
    try {
      const recentOrders = [...periodOrders]
        .sort((a, b) => (orderTimestamp(b) ?? 0) - (orderTimestamp(a) ?? 0))
        .slice(0, 6)
        .map((o) => ({
          id: String(o.id),
          date: String(o.date),
          itemsCount: (o.items || []).reduce((sum, it) => sum + (it.quantity || 1), 0),
          status: o.isCancelled ? 'Отменен' : adminStatusLabel(o),
          total: o.totalPrice || 0,
        }));
      await generateAnalyticsPDF({
        periodLabel: isCustomPeriod(period) ? periodRangeText(period) : periodName,
        channelLabel: channelName,
        profit: { ...byChannel, estimated: byChannel.retail.estimatedOrders + byChannel.wholesale.estimatedOrders > 0 },
        totalRevenue,
        prevRevenue: prevTotalRevenue,
        revenueGrowthPercent: revenueGrowth,
        totalOrdersCount: totalOrders,
        prevOrdersCount: prevTotalOrders,
        avgCheck,
        returnRate,
        totalReturnsCount: totalReturns,
        categoryStats: breakdown.categories,
        topProducts: breakdown.topProducts.map((p) => ({ title: p.title, quantity: p.quantity, revenue: p.revenue })),
        recentOrders,
        resetNote: resetAt ? `Статистика считается с ${formatMoment(resetAt)}` : undefined,
      });
      onShowToast('PDF-отчет сохранен на устройство', 'success');
    } catch (err) {
      console.error('PDF export error:', err);
      onShowToast('Не удалось сформировать PDF. Попробуйте еще раз', 'error');
    } finally {
      setIsExportingPDF(false);
    }
  };

  const formatYAxis = (val: number) => {
    const sign = val < 0 ? '−' : '';
    const abs = Math.abs(val);
    if (metric.unit === '₽') {
      if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
      if (abs >= 1000) return `${sign}${Math.round(abs / 1000)}k`;
    }
    return `${sign}${abs}`;
  };

  // The KPI cards are also the chart's metric switch
  const kpis: {
    metric: ActiveMetric;
    title: string;
    icon: typeof TrendingUp;
    value: string;
    footer: React.ReactNode;
    extra: React.ReactNode;
  }[] = [
    {
      metric: 'revenue',
      title: 'Выручка',
      icon: TrendingUp,
      value: rub(totalRevenue),
      footer: <Growth value={revenueGrowth} hasBase={prevTotalRevenue > 0} />,
      extra: <span className="text-[11px] text-[#4E5C70]">Только оплаченные заказы</span>,
    },
    {
      metric: 'netProfit',
      title: 'Чистый доход',
      icon: Coins,
      value: `${approx}${rub(profit.netProfit)}`,
      footer: <Growth value={netProfitGrowth} hasBase={prevNetProfit > 0} />,
      extra: (
        <span className="text-[11px] text-[#4E5C70]">
          Маржа {profit.marginPercent === null ? '—' : `${approx}${profit.marginPercent}%`} · без доставки
          {profit.missingCostLines > 0 && (
            <span className="block text-warning font-bold">Завышен: не у всех товаров есть себестоимость</span>
          )}
        </span>
      ),
    },
    {
      metric: 'cogs',
      title: 'Закупка',
      icon: PackageOpen,
      value: `${approx}${rub(profit.cogs)}`,
      footer: <span className="text-[11px] text-[#4E5C70]">Себестоимость проданных товаров</span>,
      extra: null,
    },
    {
      metric: 'orders',
      title: 'Заказы',
      icon: ShoppingBag,
      value: `${totalOrders.toLocaleString('ru-RU')} шт.`,
      footer: <Growth value={ordersGrowth} hasBase={prevTotalOrders > 0} />,
      extra: (
        <span className="text-[11px] text-[#4E5C70]">
          В среднем {(totalOrders / Math.max(1, dailyData.length)).toFixed(1)} {perBucketText(grouping)}
        </span>
      ),
    },
    {
      metric: 'avgCheck',
      title: 'Средний чек',
      icon: Receipt,
      value: rub(avgCheck),
      footer: (
        <span className="text-[11px] text-[#4E5C70]">
          Выручка {perBucketText(grouping)}: {rub(avgDailyRevenue)}
        </span>
      ),
      extra: null,
    },
    {
      metric: 'returns',
      title: 'Отмены',
      icon: RotateCcw,
      value: `${totalReturns} шт.`,
      footer: <span className="text-[11px] text-[#4E5C70]">{returnRate}% оформленных заказов</span>,
      extra: null,
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-5 text-[#2D3A4E]">
      <AdminSiteErrorsCard onShowToast={onShowToast} />
      {/* 1. Header: title, period, reset state */}
      <section className="neu-flat rounded-3xl p-4 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-extrabold tracking-tight flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-accent shrink-0" />
              Аналитика продаж
            </h3>
            <p className="text-xs text-[#4E5C70]">
              {channel === 'all' ? 'Розница и опт' : channelName}, {groupingText(grouping)}. Сравнение — с предыдущим периодом той
              же длины
            </p>
          </div>
          <div className="flex items-center gap-1 self-stretch sm:self-auto min-w-0">
          <button
            type="button"
            onClick={() => setIsPeriodOpen(true)}
            aria-haspopup="dialog"
            className="min-h-11 px-3.5 py-2 neu-button rounded-2xl flex items-center gap-2.5 text-left cursor-pointer flex-1 sm:flex-none shrink-0"
          >
            <CalendarRange className="w-4 h-4 text-accent shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-extrabold">{periodName}</span>
              <span className="block text-[11px] text-[#4E5C70]">{periodRangeText(period)}</span>
            </span>
            <ChevronDown className="w-4 h-4 text-[#4E5C70] shrink-0" />
          </button>
          <AdminHint label="Период">За какой срок считать цифры и с каким прошлым сроком сравнивать</AdminHint>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
          <div className="flex items-center gap-1 min-w-0">
            <div className="flex-1 sm:w-72">
              <Segments<ChannelFilter> label="Продажи" grid="grid-cols-3" value={channel} options={CHANNEL_FILTERS} onChange={setChannel} />
            </div>
            <AdminHint label="Продажи">
              Опт — заказы, в которых есть строка по оптовой цене; остальные — розница. Меняет все цифры на странице
            </AdminHint>
          </div>
          <div className="flex items-center gap-1 min-w-0">
            <div className="flex-1 sm:w-64">
              <Segments<AnalyticsGrouping>
                label="Группировать"
                grid={groupingOptions.length === 3 ? 'grid-cols-3' : groupingOptions.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}
                value={grouping}
                options={groupingOptions}
                onChange={(g) => {
                  setChosenGrouping(g);
                  setSelectedDay(null);
                }}
              />
            </div>
            <AdminHint label="Группировать">Один столбик графика — день, неделя (с понедельника) или месяц</AdminHint>
          </div>
        </div>
        {resetAt !== null && (
          <div className="neu-inset rounded-2xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <p className="text-xs text-[#2D3A4E] flex items-start gap-2">
              <CalendarClock className="w-4 h-4 text-accent shrink-0 mt-0.5" />
              <span>
                Статистика считается с <strong>{formatMoment(resetAt)}</strong>. Более ранние заказы сохранены, но в
                аналитике не учитываются
              </span>
            </p>
            <button
              type="button"
              onClick={handleRestoreHistory}
              className="h-9 px-3 neu-button rounded-xl text-[11px] font-bold text-accent flex items-center gap-1.5 cursor-pointer shrink-0 self-start sm:self-auto"
            >
              <RotateCw className="w-3.5 h-3.5" />
              Вернуть всю историю
            </button>
          </div>
        )}
      </section>

      {/* 2. KPIs: a card shows its number and puts the metric on the chart (raised → pressed in when chosen) */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3" role="radiogroup" aria-label="Показатель на графике">
        {kpis.map((k) => {
          const selected = activeMetric === k.metric;
          return (
            <div key={k.metric} className="relative min-w-0">
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => {
                setActiveMetric(k.metric);
                triggerChartHapticFeedback('light');
              }}
              className={`neu-pressable w-full h-full rounded-2xl p-3.5 space-y-1.5 min-w-0 text-left cursor-pointer ${
                selected ? 'neu-pill-active' : 'neu-flat'
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className={`text-[11px] font-bold uppercase tracking-wider pr-7 ${selected ? 'text-accent' : 'text-[#4E5C70]'}`}>
                  {k.title}
                </span>
                <span
                  className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                    selected ? 'neu-fill-accent' : 'neu-inset text-accent'
                  }`}
                >
                  <k.icon className="w-3.5 h-3.5" />
                </span>
              </span>
              <span className={`block text-lg sm:text-xl font-extrabold tracking-tight tabular-nums break-words ${selected ? 'text-accent' : ''}`}>
                {k.value}
              </span>
              <span className="block text-[11px] leading-snug">{k.footer}</span>
              {k.extra}
            </button>
            <AdminHint label={k.title} className="absolute top-3 right-[46px]">
              {KPI_HINTS[k.metric]}
            </AdminHint>
            </div>
          );
        })}
      </div>

      {/* 3. Chart */}
      <section className="neu-flat rounded-3xl p-4 sm:p-5 space-y-3.5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <h4 className="text-xs font-extrabold uppercase tracking-wider flex items-center gap-1.5 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: metric.color }} aria-hidden="true" />
              {metric.label} {groupingText(grouping)}
            </h4>
            {peakDay && (
              <span className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={showPeakDay}
                title={grouping === 'day' ? 'Открыть пиковый день' : `Открыть лучш${grouping === 'week' ? 'ую неделю' : 'ий месяц'}`}
                className="h-8 px-2.5 neu-button rounded-xl text-[11px] font-bold text-[#2D3A4E] flex items-center gap-1 cursor-pointer shrink-0"
              >
                <Flame className="w-3.5 h-3.5 text-accent" />
                Пик: {peakDay.label} · {rub(peakDay.revenue)}
              </button>
              <AdminHint label="Пик">День (или месяц) с самой большой выручкой. Нажмите — увидите его заказы</AdminHint>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Segments<OrderStatusFilter> label="Какие заказы учитывать" grid="grid-cols-3" value={statusFilter} options={STATUS_FILTERS} onChange={setStatusFilter} />
            <AdminHint label="Какие заказы учитывать">Меняет все цифры на странице: всё, только оплаченное или только полученное</AdminHint>
            <Segments<ChartType>
              label="Вид графика"
              value={chartType}
              options={[
                { id: 'bar', label: <><BarChart3 className="w-3.5 h-3.5" /> Столбцы</> },
                { id: 'area', label: <><LineChartIcon className="w-3.5 h-3.5" /> Линия</> },
              ]}
              onChange={setChartType}
            />
          </div>
        </div>

        <div className="neu-inset rounded-2xl p-3 sm:p-4 select-none">
          <div className="h-72 sm:h-80 w-full">
            <Suspense fallback={<ChartLoading />}>
              <AdminAnalyticsChart
                chartType={chartType}
                dailyData={dailyData}
                activeMetric={activeMetric}
                metric={metric}
                grouping={grouping}
                selectedDate={openDay?.date}
                onChartClick={handleChartClick}
                formatYAxis={formatYAxis}
              />
            </Suspense>
          </div>
        </div>
        <div className="text-[11px] text-[#4E5C70] space-y-1">
          <p>Нажмите на {bucketName} на графике, чтобы увидеть заказы.</p>
          {undatedCount > 0 && (
            <p>
              Без даты (оформлены до обновления магазина): {undatedCount} {pluralRu(undatedCount, ['заказ', 'заказа', 'заказов'])} — в графике
              и показателях их нет, в разделе «Заказы» они есть.
            </p>
          )}
        </div>
      </section>

      {openDay && (
        <AdminDailySalesInspector
          dayData={openDay}
          onClose={() => setSelectedDay(null)}
          onSelectOrder={onSelectOrder}
          onPrevDay={() => selectedDayIndex > 0 && setSelectedDay(dailyData[selectedDayIndex - 1])}
          onNextDay={() => selectedDayIndex < dailyData.length - 1 && setSelectedDay(dailyData[selectedDayIndex + 1])}
          hasPrev={selectedDayIndex > 0}
          hasNext={selectedDayIndex < dailyData.length - 1}
          dayIndex={selectedDayIndex}
          totalDays={dailyData.length}
        />
      )}

      <AdminAnalyticsProfitCard byChannel={byChannel} />

      {/* 4. Products and categories of the period */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
        <section className="neu-flat rounded-3xl p-4 space-y-3">
          <h4 className="text-xs font-extrabold uppercase tracking-wider flex items-center gap-1.5">
            <Award className="w-4 h-4 text-accent" />
            Топ товаров за период
          </h4>
          {breakdown.topProducts.length === 0 ? (
            <EmptyState text="Продаж за выбранный период нет" />
          ) : (
            <ol className="space-y-2">
              {breakdown.topProducts.map((p, idx) => (
                <li key={p.id} className="neu-inset rounded-2xl p-2.5 flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {/* only the catalog's photo: a link in the order is written by the visitor (finding 7) */}
                    <OrderLineThumbImage
                      line={p}
                      catalog={products}
                      alt=""
                      className="w-10 h-10 rounded-xl object-cover shrink-0"
                      loading="lazy"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate">
                        <span className="text-accent font-extrabold mr-1">{idx + 1}.</span>
                        {p.title}
                      </p>
                      <p className="text-xs text-[#4E5C70]">Продано: {p.quantity} шт.</p>
                    </div>
                  </div>
                  <span className="text-xs font-extrabold text-accent tabular-nums shrink-0">{rub(p.revenue)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="neu-flat rounded-3xl p-4 space-y-3">
          <h4 className="text-xs font-extrabold uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-accent" />
            Категории за период
          </h4>
          {breakdown.categories.length === 0 ? (
            <EmptyState text="Продаж за выбранный период нет" />
          ) : (
            <ul className="space-y-2.5">
              {breakdown.categories.map((c) => (
                <li key={c.name} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-bold truncate">{c.name}</span>
                    <span className="font-extrabold text-accent shrink-0">
                      {c.share}% <span className="text-[11px] text-[#4E5C70] font-normal">({rub(c.revenue)})</span>
                    </span>
                  </div>
                  <div className="neu-inset rounded-full h-2 overflow-hidden p-0.5">
                    <div style={{ width: `${c.share}%` }} className="neu-fill-accent h-full rounded-full transition-all duration-500" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* 5. Promo codes of the period */}
      <AdminAnalyticsPromos promos={breakdown.promos} storePromos={promos} periodOrders={periodOrders} />

      {/* 6. Report and reset */}
      <section className="neu-flat rounded-3xl p-4 flex flex-col sm:flex-row sm:items-stretch gap-2.5">
        <button
          type="button"
          onClick={handleExportPDF}
          disabled={isExportingPDF}
          aria-busy={isExportingPDF}
          onPointerEnter={preloadPdfLibraries}
          onFocus={preloadPdfLibraries}
          className="w-full sm:flex-1 min-h-14 px-4 py-2.5 neu-button-accent rounded-2xl text-white flex items-center gap-3 text-left cursor-pointer disabled:opacity-70 disabled:cursor-wait"
        >
          <span className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
            {isExportingPDF ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-extrabold">{isExportingPDF ? 'Формируем отчет…' : 'Скачать отчет PDF'}</span>
            <span className="block text-[11px] text-white/80 leading-snug">
              {periodName}{channel === 'all' ? '' : ` · ${channelName}`} · {totalOrders} {pluralRu(totalOrders, ['заказ', 'заказа', 'заказов'])} на {rub(totalRevenue)}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => setIsResetConfirmOpen(true)}
          disabled={countedNow.count === 0}
          title={countedNow.count === 0 ? 'С момента последнего сброса заказов нет' : undefined}
          className="w-full sm:w-auto min-h-14 px-4 neu-button-danger rounded-2xl font-extrabold text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Trash2 className="w-4 h-4" />
          Сбросить статистику
        </button>
        <AdminHint label="Сбросить статистику" className="self-center">Цифры начнут считаться с нуля. Сами заказы не удаляются, историю можно вернуть</AdminHint>
      </section>

      {isPeriodOpen && (
        <AdminAnalyticsPeriodDialog value={period} onChange={changePeriod} onClose={() => setIsPeriodOpen(false)} />
      )}

      <ConfirmDialog
        isOpen={isResetConfirmOpen}
        title="Сбросить статистику?"
        confirmLabel="Сбросить"
        preview={
          <div className="text-xs min-w-0">
            <p className="font-bold text-[#2D3A4E]">Перестанут учитываться: {countedNow.count} {pluralRu(countedNow.count, ['заказ', 'заказа', 'заказов'])}</p>
            <p className="text-[#4E5C70]">на сумму {rub(countedNow.revenue)}</p>
          </div>
        }
        message="Графики, показатели, топ товаров, категории и промокоды начнут считаться с этого момента. Заказы не удаляются — они остаются у покупателей и в разделе «Заказы», а всю историю можно вернуть."
        onConfirm={handleReset}
        onClose={() => setIsResetConfirmOpen(false)}
      />
    </div>
  );
};
