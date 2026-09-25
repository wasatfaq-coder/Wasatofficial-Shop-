import React from 'react';
import {
  Calendar,
  Flame,
  ArrowUpRight,
  ArrowDownRight,
  ShoppingBag,
  TrendingUp,
  RotateCcw,
  MousePointerClick,
  Zap,
} from 'lucide-react';
import { DailyDataPoint } from '../../utils/analyticsEngine';

type ActiveMetricType = 'revenue' | 'orders' | 'returns' | 'avgCheck';

interface AdminChartNeumorphicTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
  activeMetric: ActiveMetricType;
  compareWithPrevious: boolean;
  avgDailyRevenue?: number;
  totalPeriodRevenue?: number;
}

export const AdminChartNeumorphicTooltip: React.FC<AdminChartNeumorphicTooltipProps> = ({
  active,
  payload,
  label,
  activeMetric,
  compareWithPrevious,
  avgDailyRevenue = 0,
  totalPeriodRevenue = 0,
}) => {
  if (!active || !payload || !payload.length || !payload[0]?.payload) {
    return null;
  }

  const data: DailyDataPoint = payload[0].payload;
  const currentVal = data[activeMetric] ?? 0;

  const prevKey =
    activeMetric === 'revenue'
      ? 'prevRevenue'
      : activeMetric === 'orders'
      ? 'prevOrders'
      : activeMetric === 'returns'
      ? 'prevReturns'
      : 'avgCheck';

  const prevVal = (data as any)[prevKey] ?? 0;
  const diff = currentVal - prevVal;
  const percentDiff = prevVal > 0 ? ((diff / prevVal) * 100).toFixed(1) : '+0.0';
  const isPositive = diff >= 0;

  // Comparison with daily average revenue
  const diffFromAvg = avgDailyRevenue > 0 ? ((data.revenue - avgDailyRevenue) / avgDailyRevenue) * 100 : 0;
  const isAboveAvg = diffFromAvg >= 0;

  // Percentage contribution to total period revenue
  const periodShare = totalPeriodRevenue > 0 ? ((data.revenue / totalPeriodRevenue) * 100).toFixed(1) : '0';

  const isMonthly = data.weekday === 'Месяц';

  const metricConfig = {
    revenue: {
      title: isMonthly ? 'Выручка за месяц' : 'Суточная выручка',
      color: '#5F6ED0',
      badgeClass: 'text-[#5F6ED0] bg-[#5F6ED0]/10 border-[#5F6ED0]/30',
      valueFormatted: `${currentVal.toLocaleString('ru-RU')} ₽`,
      prevFormatted: `${prevVal.toLocaleString('ru-RU')} ₽`,
      diffFormatted: `${diff >= 0 ? '+' : ''}${diff.toLocaleString('ru-RU')} ₽`,
    },
    orders: {
      title: isMonthly ? 'Заказы за месяц' : 'Заказы за день',
      color: '#10B981',
      badgeClass: 'text-emerald-700 bg-emerald-500/10 border-emerald-500/30',
      valueFormatted: `${currentVal} шт.`,
      prevFormatted: `${prevVal} шт.`,
      diffFormatted: `${diff >= 0 ? '+' : ''}${diff} шт.`,
    },
    avgCheck: {
      title: 'Средний чек',
      color: '#0284C7',
      badgeClass: 'text-sky-700 bg-sky-500/10 border-sky-500/30',
      valueFormatted: `${currentVal.toLocaleString('ru-RU')} ₽`,
      prevFormatted: `${prevVal.toLocaleString('ru-RU')} ₽`,
      diffFormatted: `${diff >= 0 ? '+' : ''}${diff.toLocaleString('ru-RU')} ₽`,
    },
    returns: {
      title: 'Возвраты',
      color: '#F59E0B',
      badgeClass: 'text-amber-700 bg-amber-500/10 border-amber-500/30',
      valueFormatted: `${currentVal} шт.`,
      prevFormatted: `${prevVal} шт.`,
      diffFormatted: `${diff >= 0 ? '+' : ''}${diff} шт.`,
    },
  }[activeMetric];

  return (
    <div
      style={{
        boxShadow:
          '6px 10px 22px rgba(145, 160, 185, 0.6), -6px -6px 18px rgba(255, 255, 255, 0.95), inset 1px 1px 0 rgba(255, 255, 255, 0.9)',
      }}
      className="w-[236px] sm:w-[258px] p-2.5 sm:p-3 rounded-2xl bg-[#E3E8EF] border border-white/90 text-xs space-y-2 pointer-events-none select-none animate-in fade-in-50 zoom-in-95 duration-150 transition-all z-50 shadow-xl"
    >
      {/* --- 1. NEUMORPHIC HEADER: DATE & PEAK BADGE --- */}
      <div className="flex items-center justify-between gap-1.5 border-b border-[#BAC5D5]/50 pb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-5 h-5 rounded-lg neu-inset flex items-center justify-center text-[#5F6ED0] bg-[#E3E8EF] shrink-0">
            <Calendar className="w-3 h-3" />
          </div>

          <div className="min-w-0">
            <p className="font-black text-[#2D3A4E] text-[11px] sm:text-xs truncate leading-tight">
              {data.fullDate || label}
            </p>
            <p className="text-[9px] font-bold text-[#5C6B80] truncate leading-tight">
              {isMonthly ? 'Месячный срез' : `${data.weekday} • Суточный срез`}
            </p>
          </div>
        </div>

        {data.isPeakDay && (
          <span className="text-[8px] font-black text-amber-800 bg-amber-200 border border-amber-300 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 shrink-0 animate-pulse">
            <Flame className="w-2.5 h-2.5 text-amber-600 fill-amber-500" />
            Пик
          </span>
        )}
      </div>

      {/* --- 2. PRIMARY METRIC HERO CARD (NEU-INSET) --- */}
      <div className="neu-inset rounded-xl p-2 bg-[#E3E8EF] space-y-1 border border-white/40">
        <div className="flex items-center justify-between text-[#5C6B80] gap-1">
          <span className="text-[9px] font-extrabold uppercase tracking-wider truncate">
            {metricConfig.title}
          </span>
          <span
            className={`text-[8px] font-black px-1.5 py-0.2 rounded-md border shrink-0 ${metricConfig.badgeClass}`}
          >
            Срез
          </span>
        </div>

        <div className="flex items-baseline justify-between gap-1.5">
          <p
            style={{ color: metricConfig.color }}
            className="text-base sm:text-lg font-black tracking-tight tabular-nums truncate leading-none"
          >
            {metricConfig.valueFormatted}
          </p>

          {/* Share of Period */}
          {activeMetric === 'revenue' && totalPeriodRevenue > 0 && (
            <span
              className="text-[9px] font-extrabold text-[#5C6B80] neu-inset px-1.5 py-0.5 rounded-md bg-[#E3E8EF] shrink-0"
              title="Доля в общей выручке выбранного периода"
            >
              {periodShare}% оборота
            </span>
          )}
        </div>

        {/* Benchmark against daily average */}
        {activeMetric === 'revenue' && avgDailyRevenue > 0 && !isMonthly && (
          <div className="flex items-center justify-between text-[9px] pt-0.5 border-t border-[#BAC5D5]/30">
            <span className="text-[#5C6B80]">К норме дня:</span>
            <span
              className={`font-black flex items-center gap-0.5 ${
                isAboveAvg ? 'text-emerald-700' : 'text-[#7E525E]'
              }`}
            >
              {isAboveAvg ? (
                <>
                  <ArrowUpRight className="w-2.5 h-2.5 text-emerald-600" />+
                  {diffFromAvg.toFixed(1)}%
                </>
              ) : (
                <>
                  <ArrowDownRight className="w-2.5 h-2.5 text-[#7E525E]" />
                  {diffFromAvg.toFixed(1)}%
                </>
              )}
            </span>
          </div>
        )}
      </div>

      {/* --- 3. COMPARISON VS PREVIOUS CYCLE (IF ENABLED) --- */}
      {compareWithPrevious && activeMetric !== 'avgCheck' && (
        <div className="neu-inset rounded-xl p-2 bg-[#E3E8EF] space-y-0.5 text-[10px] border border-white/40">
          <div className="flex items-center justify-between text-[#5C6B80]">
            <span className="flex items-center gap-1 text-[9px] font-medium">
              <span className="w-2 h-0.5 bg-[#94A3B8] rounded-full" />
              Пред. период:
            </span>
            <span className="font-bold text-[#64748B] tabular-nums text-[10px]">
              {metricConfig.prevFormatted}
            </span>
          </div>

          <div className="flex items-center justify-between pt-0.5 border-t border-[#BAC5D5]/25 text-[9px]">
            <span className="text-[#5C6B80]">Динамика:</span>
            <div className="flex items-center gap-1">
              <span className="font-semibold text-[#5C6B80] text-[9px]">
                {metricConfig.diffFormatted}
              </span>
              <span
                className={`font-black px-1 py-0.2 rounded text-[8px] flex items-center gap-0.5 ${
                  isPositive
                    ? 'text-emerald-800 bg-emerald-100'
                    : 'text-rose-800 bg-rose-100'
                }`}
              >
                {isPositive ? `+${percentDiff}%` : `${percentDiff}%`}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* --- 4. DETAILED DAILY SNAPSHOT METRICS GRID --- */}
      <div className="grid grid-cols-3 gap-1 text-center">
        <div className="neu-inset rounded-lg p-1.5 bg-[#E3E8EF] space-y-0.5">
          <span className="text-[8px] font-bold text-[#5C6B80] block truncate">
            Заказов
          </span>
          <p className="text-[11px] font-black text-[#2D3A4E] tabular-nums leading-tight">
            {data.orders} <span className="text-[8px] font-normal text-[#5C6B80]">шт</span>
          </p>
        </div>

        <div className="neu-inset rounded-lg p-1.5 bg-[#E3E8EF] space-y-0.5">
          <span className="text-[8px] font-bold text-[#5C6B80] block truncate">
            Ср. чек
          </span>
          <p className="text-[11px] font-black text-emerald-700 tabular-nums leading-tight truncate">
            {data.avgCheck >= 1000
              ? `${Math.round(data.avgCheck / 1000)}k`
              : data.avgCheck} ₽
          </p>
        </div>

        <div className="neu-inset rounded-lg p-1.5 bg-[#E3E8EF] space-y-0.5">
          <span className="text-[8px] font-bold text-[#5C6B80] block truncate">
            Возвраты
          </span>
          <p
            className={`text-[11px] font-black tabular-nums leading-tight ${
              data.returns === 0 ? 'text-[#2D3A4E]' : 'text-amber-700'
            }`}
          >
            {data.returns} <span className="text-[8px] font-normal text-[#5C6B80]">шт</span>
          </p>
        </div>
      </div>

      {/* --- 5. REAL FIRESTORE ORDERS PREVIEW IF PRESENT --- */}
      {data.hasRealOrders && data.realOrdersList.length > 0 && (
        <div className="neu-inset rounded-lg px-2 py-1 bg-[#E3E8EF] flex items-center justify-between text-[9px] border border-indigo-200/50 text-indigo-800">
          <span className="flex items-center gap-1 font-extrabold">
            <Zap className="w-2.5 h-2.5 text-indigo-600 shrink-0" />
            В Firestore:
          </span>
          <span className="font-bold neu-inset px-1.5 py-0.2 rounded bg-[#E3E8EF]">
            {data.realOrdersList.length} зак. (
            {data.realOrdersList
              .reduce((sum, o) => sum + (o.totalPrice || 0), 0)
              .toLocaleString('ru-RU')}{' '}
            ₽)
          </span>
        </div>
      )}

      {/* --- 6. FOOTER INTERACTION HINT --- */}
      <div className="pt-0.5 text-center border-t border-[#BAC5D5]/35">
        <span className="text-[8px] text-[#5C6B80] font-bold flex items-center justify-center gap-1">
          <MousePointerClick className="w-2.5 h-2.5 text-[#5F6ED0]" />
          Кликните для деталей дня
        </span>
      </div>
    </div>
  );
};
