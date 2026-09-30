import React from 'react';
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import type { AnalyticsPeriod, DailyDataPoint } from '../../utils/analyticsEngine';
import { AdminChartNeumorphicTooltip } from './AdminChartNeumorphicTooltip';
import {
  NeumorphicSVGDefs,
  NeumorphicBarShape,
  NeumorphicActiveDot,
  NeumorphicCursor,
  NeumorphicAxisTick,
} from './AdminChartNeumorphicShapes';
import type { ActiveMetric, ChartType } from './AdminAnalyticsTab';

interface AdminAnalyticsChartProps {
  chartType: ChartType;
  dailyData: DailyDataPoint[];
  activeMetric: ActiveMetric;
  metric: { label: string; unit: string; color: string; fill: string };
  period: AnalyticsPeriod;
  /** The day (or month) open in the inspector */
  selectedDate?: string;
  /** The day (or month) the admin clicked on the chart */
  onChartClick: (point: DailyDataPoint) => void;
  formatYAxis: (val: number) => string;
}

/**
 * The «Аналитика» chart: a chunk of its own (recharts is most of the section's code), so the KPI cards and
 * lists render before it arrives. Loaded with React.lazy from AdminAnalyticsTab.
 */
const AdminAnalyticsChart: React.FC<AdminAnalyticsChartProps> = ({
  chartType,
  dailyData,
  activeMetric,
  metric,
  period,
  selectedDate,
  onChartClick,
  formatYAxis,
}) => {
  // Recharts 3 passes the index of the clicked point (activePayload of Recharts 2 is gone)
  // Without an active tooltip (a tap that did not hover first) the index is null — not day 0
  const handleClick = (state: { activeTooltipIndex?: number | string | null } | null) => {
    const raw = state?.activeTooltipIndex;
    if (raw === null || raw === undefined || raw === '') return;
    const point = dailyData[Number(raw)];
    if (point) onChartClick(point);
  };
  // A bar knows its own day: a tap on it works even when the tooltip is not shown
  const handleBarClick = (_: unknown, index: number) => {
    const point = dailyData[index];
    if (point) onChartClick(point);
  };
  const xAxisInterval = period === '30d' ? 3 : period === '14d' ? 1 : 0;
  // The chart is not re-created on every switch: Recharts animates from the old values to the new ones
  const tooltip = (
    <Tooltip
      content={<AdminChartNeumorphicTooltip activeMetric={activeMetric} color={metric.color} />}
      cursor={<NeumorphicCursor />}
      isAnimationActive={false}
      allowEscapeViewBox={{ x: false, y: false }}
      offset={14}
      wrapperStyle={{ outline: 'none', zIndex: 20, pointerEvents: 'none' }}
    />
  );
  const axes = (
    <>
      <NeumorphicSVGDefs />
      <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#BAC5D5" strokeOpacity={0.35} />
      <XAxis
        dataKey="label"
        stroke="#4E5C70"
        tickLine={false}
        axisLine={{ stroke: '#BAC5D5', strokeOpacity: 0.6 }}
        dy={4}
        interval={xAxisInterval}
        tick={<NeumorphicAxisTick selectedDate={selectedDate} period={period} dailyData={dailyData} />}
      />
      <YAxis
        stroke="#4E5C70"
        fontSize={11}
        fontWeight={700}
        tickLine={false}
        axisLine={false}
        tickFormatter={formatYAxis}
        width={44}
        allowDecimals={metric.unit === '₽'}
      />
      {tooltip}
    </>
  );

  return (
    <ResponsiveContainer width="100%" height="100%">
      {chartType === 'area' ? (
        <AreaChart data={dailyData} margin={{ top: 12, right: 12, left: 0, bottom: 20 }} onClick={handleClick} style={{ cursor: 'pointer' }}>
          {axes}
          <Area
            // monotoneX keeps the curve smooth without overshooting below zero between days
            type="monotoneX"
            dataKey={activeMetric}
            name={metric.label}
            stroke={metric.color}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            fillOpacity={1}
            fill={metric.fill}
            dot={dailyData.length <= 14 ? { r: 3, fill: '#E3E8EF', stroke: metric.color, strokeWidth: 2 } : false}
            activeDot={<NeumorphicActiveDot stroke={metric.color} activeMetric={activeMetric} />}
            animationDuration={450}
            animationEasing="ease-out"
          />
        </AreaChart>
      ) : (
        <BarChart data={dailyData} margin={{ top: 12, right: 12, left: 0, bottom: 20 }} onClick={handleClick} style={{ cursor: 'pointer' }}>
          {axes}
          <Bar
            onClick={handleBarClick}
            dataKey={activeMetric}
            name={metric.label}
            shape={<NeumorphicBarShape selectedDate={selectedDate} activeMetric={activeMetric} />}
            maxBarSize={period === '30d' ? 20 : 36}
            animationDuration={450}
            animationEasing="ease-out"
          />
        </BarChart>
      )}
    </ResponsiveContainer>
  );
};

export default AdminAnalyticsChart;
