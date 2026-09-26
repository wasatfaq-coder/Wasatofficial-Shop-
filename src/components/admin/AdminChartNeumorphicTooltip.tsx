import React from 'react';
import { Flame } from 'lucide-react';
import { DailyDataPoint } from '../../utils/analyticsEngine';

type ActiveMetricType = 'revenue' | 'orders' | 'returns' | 'avgCheck';

interface AdminChartNeumorphicTooltipProps {
  active?: boolean;
  payload?: { payload?: DailyDataPoint }[];
  activeMetric: ActiveMetricType;
  /** Line colour of the metric (the value is shown in it) */
  color: string;
}

const METRIC_TITLE: Record<ActiveMetricType, string> = {
  revenue: 'Выручка',
  orders: 'Заказы',
  avgCheck: 'Средний чек',
  returns: 'Отмены',
};

const rub = (value: number) => `${value.toLocaleString('ru-RU')} ₽`;

/**
 * Compact tooltip of a chart point: date, the selected metric and a one-line summary.
 * Small on purpose — on a phone a large card covered the chart it describes.
 */
export const AdminChartNeumorphicTooltip: React.FC<AdminChartNeumorphicTooltipProps> = ({
  active,
  payload,
  activeMetric,
  color,
}) => {
  const data = payload?.[0]?.payload;
  if (!active || !data) return null;

  const value = data[activeMetric] ?? 0;
  const formatted = activeMetric === 'revenue' || activeMetric === 'avgCheck' ? rub(value) : `${value} шт.`;

  return (
    <div
      style={{ backgroundColor: '#F4F6F9' }}
      className="w-[196px] px-3 py-2.5 rounded-2xl neu-dropdown border border-white text-xs space-y-1 pointer-events-none select-none"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-[#2D3A4E] truncate">{data.fullDate}</span>
        {data.isPeakDay && (
          <span className="text-[11px] font-black text-warning flex items-center gap-0.5 shrink-0">
            <Flame className="w-3 h-3" />
            Пик
          </span>
        )}
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-[#4E5C70]">{METRIC_TITLE[activeMetric]}</span>
        <span style={{ color }} className="text-sm font-black tabular-nums">
          {formatted}
        </span>
      </div>
      <p className="text-[11px] text-[#4E5C70] tabular-nums">
        {activeMetric !== 'orders' && `Заказов: ${data.orders}`}
        {activeMetric === 'orders' && `Выручка: ${rub(data.revenue)}`}
        {data.returns > 0 && activeMetric !== 'returns' && ` · отмен: ${data.returns}`}
      </p>
    </div>
  );
};
