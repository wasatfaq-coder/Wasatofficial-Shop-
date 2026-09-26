import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  TrendingUp,
  ShoppingBag,
  RotateCcw,
  Award,
  BarChart3,
  LineChart as LineChartIcon,
  Download,
  Loader2,
  Tag,
  Flame,
  Layers,
  Receipt,
  RotateCw,
  Trash2,
  CalendarClock,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { Order, PromoCode } from '../../types';
import { generateAnalyticsPDF } from '../../utils/pdfExport';
import {
  computeFirestoreDailySales,
  computePeriodBreakdown,
  orderRevenue,
  AnalyticsPeriod,
  OrderStatusFilter,
  DailyDataPoint,
} from '../../utils/analyticsEngine';
import { orderTimestamp } from '../../shared/orderDate';
import { ORDER_STATUS_LABELS } from '../../utils/deliveryStages';
import { subscribeToAnalyticsResetAt, saveAnalyticsResetAt } from '../../utils/firebaseSync';
import { AdminDailySalesInspector } from './AdminDailySalesInspector';
import { AdminChartNeumorphicTooltip } from './AdminChartNeumorphicTooltip';
import {
  NeumorphicSVGDefs,
  NeumorphicBarShape,
  NeumorphicActiveDot,
  NeumorphicCursor,
  NeumorphicAxisTick,
  NeumorphicRechartsLegend,
  triggerChartHapticFeedback,
} from './AdminChartNeumorphicShapes';
import { ConfirmDialog } from '../ConfirmDialog';

interface AdminAnalyticsTabProps {
  orders: Order[];
  promos?: PromoCode[];
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
  onSelectOrder?: (order: Order) => void;
}

type ChartType = 'area' | 'bar';
type ActiveMetric = 'revenue' | 'orders' | 'returns' | 'avgCheck';

const PERIODS: { id: AnalyticsPeriod; label: string; title: string }[] = [
  { id: '7d', label: '7 дн', title: 'Последние 7 дней' },
  { id: '14d', label: '14 дн', title: 'Последние 14 дней' },
  { id: '30d', label: '30 дн', title: 'Последние 30 дней' },
  { id: '6m', label: '6 мес', title: 'Последние 6 месяцев' },
  { id: '1y', label: '12 мес', title: 'Последние 12 месяцев' },
];

/** Chart colours: brand tokens (accent, success, warning) as hex for SVG */
const METRICS: { id: ActiveMetric; label: string; unit: string; color: string; fill: string }[] = [
  { id: 'revenue', label: 'Выручка', unit: '₽', color: '#2C4A6B', fill: 'url(#colorRevenueArea)' },
  { id: 'orders', label: 'Заказы', unit: 'шт', color: '#3B6652', fill: 'url(#colorOrdersArea)' },
  { id: 'avgCheck', label: 'Средний чек', unit: '₽', color: '#5A6F8C', fill: 'url(#colorAvgCheckArea)' },
  { id: 'returns', label: 'Отмены', unit: 'шт', color: '#8C733E', fill: 'url(#colorReturnsArea)' },
];

const STATUS_FILTERS: { id: OrderStatusFilter; label: string }[] = [
  { id: 'all', label: 'Все заказы' },
  { id: 'paid', label: 'Оплаченные' },
  { id: 'delivered', label: 'Врученные' },
];

const rub = (value: number) => `${value.toLocaleString('ru-RU')} ₽`;

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

/** Nothing sold in the period: a plain note (not «не настроено» — there is nothing to set up) */
const EmptyState: React.FC<{ text: string }> = ({ text }) => (
  <p role="status" className="neu-inset rounded-2xl p-3 text-xs text-[#4E5C70] text-center">
    {text}
  </p>
);

const Segments = <T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: React.ReactNode; title?: string }[];
  onChange: (v: T) => void;
}) => (
  <div className="neu-flat-sm rounded-xl p-1 flex gap-1 flex-wrap" role="radiogroup" aria-label={label}>
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
 * Admin → «Аналитика»: orders of the period by day or month, KPIs against the previous period, the period's
 * top products, categories and promo codes, the PDF report. Everything is counted from orders (dated by
 * createdAt) placed after the statistics reset; orders themselves are never deleted here.
 */
export const AdminAnalyticsTab: React.FC<AdminAnalyticsTabProps> = ({ orders, promos = [], onShowToast, onSelectOrder }) => {
  const [period, setPeriod] = useState<AnalyticsPeriod>('7d');
  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>('all');
  const [activeMetric, setActiveMetric] = useState<ActiveMetric>('revenue');
  const [chartType, setChartType] = useState<ChartType>('bar');
  const [selectedDay, setSelectedDay] = useState<DailyDataPoint | null>(null);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [resetAt, setResetAt] = useState<number | null>(null);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

  useEffect(() => subscribeToAnalyticsResetAt(setResetAt), []);

  const { dailyData, summary, periodOrders, undatedCount } = useMemo(
    () => computeFirestoreDailySales(orders, period, statusFilter, resetAt),
    [orders, period, statusFilter, resetAt]
  );
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
  } = summary;

  const isMonthly = period === '6m' || period === '1y';
  const periodInfo = PERIODS.find((p) => p.id === period)!;
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

  const changePeriod = (next: AnalyticsPeriod) => {
    setPeriod(next);
    setSelectedDay(null);
    triggerChartHapticFeedback('light');
  };

  const handleChartClick = useCallback((e: { activePayload?: { payload: DailyDataPoint }[] } | null) => {
    const point = e?.activePayload?.[0]?.payload;
    if (point) {
      setSelectedDay(point);
      triggerChartHapticFeedback(point.isPeakDay ? 'double' : 'medium');
    }
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
    } catch {
      onShowToast('Не удалось сбросить статистику', 'error');
    }
  };

  const handleRestoreHistory = async () => {
    try {
      await saveAnalyticsResetAt(null);
      onShowToast('Статистика снова считается по всей истории заказов', 'success');
    } catch {
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
          status: o.isCancelled ? 'Отменен' : ORDER_STATUS_LABELS[o.status] || o.status,
          total: o.totalPrice || 0,
        }));
      await generateAnalyticsPDF({
        periodLabel: periodInfo.title,
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
    if (metric.unit === '₽') {
      if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
      if (val >= 1000) return `${Math.round(val / 1000)}k`;
    }
    return `${val}`;
  };

  const xAxisInterval = period === '30d' ? 3 : period === '14d' ? 1 : 0;
  const chartKey = `${period}-${activeMetric}-${chartType}-${statusFilter}`;
  const tooltip = (
    <Tooltip
      content={
        <AdminChartNeumorphicTooltip
          activeMetric={activeMetric}
          compareWithPrevious={false}
          avgDailyRevenue={avgDailyRevenue}
          totalPeriodRevenue={totalRevenue}
        />
      }
      cursor={<NeumorphicCursor />}
      allowEscapeViewBox={{ x: false, y: true }}
      offset={10}
      wrapperStyle={{ outline: 'none', zIndex: 100, pointerEvents: 'none' }}
    />
  );
  const axes = (
    <>
      <NeumorphicSVGDefs activeColor={metric.color} />
      <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#BAC5D5" strokeOpacity={0.35} />
      <XAxis
        dataKey="label"
        stroke="#4E5C70"
        tickLine={false}
        axisLine={{ stroke: '#BAC5D5', strokeOpacity: 0.6 }}
        dy={4}
        interval={xAxisInterval}
        tick={<NeumorphicAxisTick selectedDate={openDay?.date} period={period} dailyData={dailyData} />}
      />
      <YAxis stroke="#4E5C70" fontSize={11} fontWeight={700} tickLine={false} axisLine={false} tickFormatter={formatYAxis} />
      {tooltip}
      <Legend
        verticalAlign="top"
        align="left"
        content={<NeumorphicRechartsLegend activeMetric={activeMetric} compareWithPrevious={false} chartType={chartType} />}
      />
    </>
  );

  const kpis = [
    {
      title: 'Выручка',
      icon: TrendingUp,
      value: rub(totalRevenue),
      footer: <Growth value={revenueGrowth} hasBase={prevTotalRevenue > 0} />,
      extra: peakDay ? (
        <button
          type="button"
          onClick={showPeakDay}
          className="text-[11px] font-bold text-accent underline underline-offset-2 cursor-pointer flex items-center gap-1"
        >
          <Flame className="w-3 h-3" />
          {isMonthly ? 'Лучший месяц' : 'Пиковый день'}: {peakDay.label}
        </button>
      ) : null,
    },
    {
      title: 'Заказы',
      icon: ShoppingBag,
      value: `${totalOrders.toLocaleString('ru-RU')} шт.`,
      footer: <Growth value={ordersGrowth} hasBase={prevTotalOrders > 0} />,
      extra: (
        <span className="text-[11px] text-[#4E5C70]">
          В среднем {(totalOrders / Math.max(1, dailyData.length)).toFixed(1)} {isMonthly ? 'в месяц' : 'в день'}
        </span>
      ),
    },
    {
      title: 'Средний чек',
      icon: Receipt,
      value: rub(avgCheck),
      footer: (
        <span className="text-[11px] text-[#4E5C70]">
          Выручка {isMonthly ? 'в месяц' : 'в день'}: {rub(avgDailyRevenue)}
        </span>
      ),
      extra: null,
    },
    {
      title: 'Отмены',
      icon: RotateCcw,
      value: `${totalReturns} шт.`,
      footer: <span className="text-[11px] text-[#4E5C70]">{returnRate}% оформленных заказов</span>,
      extra: null,
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-5 text-[#2D3A4E]">
      {/* 1. Header: title, period, reset state */}
      <section className="neu-flat rounded-3xl p-4 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-black tracking-tight flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-accent shrink-0" />
              Аналитика продаж
            </h3>
            <p className="text-xs text-[#4E5C70]">
              {periodInfo.title}, {isMonthly ? 'по месяцам' : 'по дням'}. Сравнение — с предыдущим периодом той же длины
            </p>
          </div>
          <Segments
            label="Период"
            value={period}
            options={PERIODS.map((p) => ({ id: p.id, label: p.label, title: p.title }))}
            onChange={changePeriod}
          />
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

      {/* 2. KPIs */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3" aria-label="Показатели периода">
        {kpis.map((k) => (
          <div key={k.title} className="neu-flat rounded-2xl p-3.5 space-y-1.5 min-w-0">
            <div className="flex items-center justify-between gap-2 text-[#4E5C70]">
              <span className="text-[11px] font-bold uppercase tracking-wider">{k.title}</span>
              <span className="w-7 h-7 rounded-lg neu-inset flex items-center justify-center text-accent shrink-0">
                <k.icon className="w-3.5 h-3.5" />
              </span>
            </div>
            <p className="text-lg sm:text-xl font-black tracking-tight tabular-nums break-words">{k.value}</p>
            <div className="text-[11px] leading-snug">{k.footer}</div>
            {k.extra}
          </div>
        ))}
      </section>

      {/* 3. Chart */}
      <section className="neu-flat rounded-3xl p-4 sm:p-5 space-y-3.5">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-2.5">
          <Segments
            label="Показатель на графике"
            value={activeMetric}
            options={METRICS.map((m) => ({ id: m.id, label: m.label }))}
            onChange={(m) => {
              setActiveMetric(m);
              triggerChartHapticFeedback('light');
            }}
          />
          <div className="flex items-center gap-2 flex-wrap">
            <Segments label="Какие заказы учитывать" value={statusFilter} options={STATUS_FILTERS} onChange={setStatusFilter} />
            <Segments
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
            <ResponsiveContainer key={chartKey} width="100%" height="100%">
              {chartType === 'area' ? (
                <AreaChart data={dailyData} margin={{ top: 16, right: 14, left: -6, bottom: 20 }} onClick={handleChartClick} style={{ cursor: 'pointer' }}>
                  {axes}
                  <Area
                    type="monotone"
                    dataKey={activeMetric}
                    name={metric.label}
                    stroke={metric.color}
                    strokeWidth={3}
                    fillOpacity={1}
                    fill={metric.fill}
                    animationDuration={700}
                    activeDot={<NeumorphicActiveDot stroke={metric.color} activeMetric={activeMetric} />}
                  />
                </AreaChart>
              ) : (
                <BarChart data={dailyData} margin={{ top: 16, right: 14, left: -6, bottom: 20 }} onClick={handleChartClick} style={{ cursor: 'pointer' }}>
                  {axes}
                  <Bar
                    dataKey={activeMetric}
                    name={metric.label}
                    shape={<NeumorphicBarShape selectedDate={openDay?.date} activeMetric={activeMetric} />}
                    maxBarSize={period === '30d' ? 20 : 36}
                    animationDuration={700}
                  />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
        <div className="text-[11px] text-[#4E5C70] space-y-1">
          <p>Нажмите на {isMonthly ? 'месяц' : 'день'} на графике, чтобы увидеть его заказы.</p>
          {undatedCount > 0 && (
            <p>
              {undatedCount} заказ(ов) оформлены до обновления магазина и не содержат даты — в графике и показателях
              их нет, в разделе «Заказы» они есть.
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

      {/* 4. Products and categories of the period */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
        <section className="neu-flat rounded-3xl p-4 space-y-3">
          <h4 className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
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
                    {p.image ? (
                      <img src={p.image} alt="" className="w-10 h-10 rounded-xl object-cover shrink-0" loading="lazy" />
                    ) : (
                      <span className="w-10 h-10 rounded-xl neu-flat-sm shrink-0" aria-hidden="true" />
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate">
                        <span className="text-accent font-black mr-1">{idx + 1}.</span>
                        {p.title}
                      </p>
                      <p className="text-[11px] text-[#4E5C70]">Продано: {p.quantity} шт.</p>
                    </div>
                  </div>
                  <span className="text-xs font-black text-accent tabular-nums shrink-0">{rub(p.revenue)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="neu-flat rounded-3xl p-4 space-y-3">
          <h4 className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
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
                    <span className="font-black text-accent shrink-0">
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
      <section className="neu-flat rounded-3xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h4 className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
            <Tag className="w-4 h-4 text-accent" />
            Промокоды за период
          </h4>
          {breakdown.promos.length > 0 && (
            <span className="text-[11px] text-[#4E5C70]">
              Выручка: <strong className="text-accent">{rub(breakdown.promos.reduce((s, p) => s + p.revenue, 0))}</strong> · скидки:{' '}
              <strong className="text-[#2D3A4E]">{rub(breakdown.promos.reduce((s, p) => s + p.discount, 0))}</strong>
            </span>
          )}
        </div>
        {breakdown.promos.length === 0 ? (
          <EmptyState text="За выбранный период заказов с промокодом нет" />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {breakdown.promos.map((p) => {
              const promo = promos.find((x) => x.code.toUpperCase() === p.code);
              return (
                <div key={p.code} className="neu-inset rounded-2xl p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-black tracking-wider break-all">{p.code}</span>
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                        !promo ? 'text-[#4E5C70] bg-[#4E5C70]/10' : promo.active ? 'text-success bg-success-soft' : 'text-[#4E5C70] bg-[#4E5C70]/10'
                      }`}
                    >
                      {!promo ? 'Удален' : promo.active ? 'Активен' : 'Выключен'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-center pt-1 border-t border-[#BAC5D5]/40">
                    <div>
                      <span className="text-[11px] text-[#4E5C70] block">Заказов</span>
                      <span className="text-xs font-extrabold">{p.orders}</span>
                    </div>
                    <div>
                      <span className="text-[11px] text-[#4E5C70] block">Выручка</span>
                      <span className="text-xs font-extrabold text-accent">{rub(p.revenue)}</span>
                    </div>
                    <div>
                      <span className="text-[11px] text-[#4E5C70] block">Доля заказов</span>
                      <span className="text-xs font-extrabold">{p.share}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 6. Report and reset */}
      <section className="neu-flat rounded-3xl p-4 flex flex-col sm:flex-row gap-2.5">
        <button
          type="button"
          onClick={handleExportPDF}
          disabled={isExportingPDF}
          className="flex-1 h-11 px-4 neu-button-accent rounded-2xl font-black text-xs text-white flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {isExportingPDF ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {isExportingPDF ? 'Готовим PDF…' : `Скачать отчет за период (PDF)`}
        </button>
        <button
          type="button"
          onClick={() => setIsResetConfirmOpen(true)}
          disabled={countedNow.count === 0}
          title={countedNow.count === 0 ? 'С момента последнего сброса заказов нет' : undefined}
          className="h-11 px-4 neu-button-danger rounded-2xl font-black text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Trash2 className="w-4 h-4" />
          Сбросить статистику
        </button>
      </section>

      <ConfirmDialog
        isOpen={isResetConfirmOpen}
        title="Сбросить статистику?"
        confirmLabel="Сбросить"
        preview={
          <div className="text-xs min-w-0">
            <p className="font-bold text-[#2D3A4E]">Перестанут учитываться: {countedNow.count} заказ(ов)</p>
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
