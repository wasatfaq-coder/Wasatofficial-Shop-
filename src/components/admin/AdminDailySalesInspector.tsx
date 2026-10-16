import React from 'react';
import {
  Calendar,
  DollarSign,
  ShoppingBag,
  RotateCcw,
  X,
  Package,
  TrendingUp,
  User,
  Phone,
  ChevronRight,
  ChevronLeft,
  Flame,
  Hash,
} from 'lucide-react';
import { DailyDataPoint } from '../../utils/analyticsEngine';
import { Order } from '../../types';
import { triggerChartHapticFeedback } from './AdminChartNeumorphicShapes';
import { orderStatusChip } from '../../utils/orderStatusStyle';

interface AdminDailySalesInspectorProps {
  dayData: DailyDataPoint | null;
  onClose: () => void;
  onSelectOrder?: (order: Order) => void;
  onPrevDay?: () => void;
  onNextDay?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  dayIndex?: number;
  totalDays?: number;
}

export const AdminDailySalesInspector: React.FC<AdminDailySalesInspectorProps> = ({
  dayData,
  onClose,
  onSelectOrder,
  onPrevDay,
  onNextDay,
  hasPrev = false,
  hasNext = false,
  dayIndex,
  totalDays,
}) => {
  if (!dayData) return null;
  // a bar of the chart is a day, a week or a month (src/utils/analyticsPeriods.ts)
  const unit =
    dayData.weekday === 'Неделя'
      ? { name: 'Неделя', of: 'недели' }
      : dayData.weekday === 'Месяц'
        ? { name: 'Месяц', of: 'месяца' }
        : { name: 'День', of: 'дня' };

  return (
    <div className="neu-flat rounded-3xl p-4 sm:p-5 space-y-4 animate-in fade-in duration-200">
      {/* Header with Day Navigator & Close */}
      <div className="flex items-center justify-between gap-3 flex-wrap neu-divider-b pb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl neu-inset flex items-center justify-center text-accent shrink-0">
            <Calendar className="w-5 h-5" />
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-accent">
                Срез {unit.of}
              </span>
              {dayIndex !== undefined && totalDays !== undefined && (
                <span className="text-[11px] font-bold text-accent neu-tone-info px-2 py-0.5 rounded-full">
                  {unit.name} {dayIndex + 1} из {totalDays}
                </span>
              )}
              {dayData.isPeakDay && (
                <span className="text-[11px] font-extrabold neu-tone-warning px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Flame className="w-3 h-3 text-warning fill-warning" />
                  Пик периода
                </span>
              )}
              {dayData.hasRealOrders && (
                <span className="text-[11px] font-extrabold text-accent neu-tone-info px-2 py-0.5 rounded-full flex items-center gap-1">
                  Заказов: {dayData.realOrdersList.length}
                </span>
              )}
            </div>

            <h4 className="text-sm sm:text-base font-extrabold text-text-primary mt-0.5 flex items-center gap-2">
              <span>{dayData.fullDate}</span>
              <span className="text-xs font-bold text-accent">({dayData.weekday})</span>
            </h4>
          </div>
        </div>

        {/* Action Controls: Navigation arrows & Close */}
        <div className="flex items-center gap-1.5">
          {onPrevDay && (
            <button
              onClick={() => {
                onPrevDay();
                triggerChartHapticFeedback('light');
              }}
              disabled={!hasPrev}
              type="button"
              className="p-2 rounded-xl neu-button text-text-secondary hover:text-text-primary cursor-pointer disabled:cursor-not-allowed flex items-center gap-1 text-[11px] font-bold"
              title="Предыдущий день"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Пред.</span>
            </button>
          )}

          {onNextDay && (
            <button
              onClick={() => {
                onNextDay();
                triggerChartHapticFeedback('light');
              }}
              disabled={!hasNext}
              type="button"
              className="p-2 rounded-xl neu-button text-text-secondary hover:text-text-primary cursor-pointer disabled:cursor-not-allowed flex items-center gap-1 text-[11px] font-bold"
              title="Следующий день"
            >
              <span className="hidden sm:inline">След.</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={() => {
              onClose();
              triggerChartHapticFeedback('light');
            }}
            type="button"
            className="p-2 rounded-xl neu-button text-text-secondary hover:text-text-primary cursor-pointer ml-1"
            title="Свернуть детализацию дня"
            aria-label="Свернуть детализацию дня"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 4 Mini Cards for Selected Day with Typographic Hierarchy */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {/* Card 1: Revenue */}
        <div className="neu-inset rounded-2xl p-3 space-y-1">
          <div className="flex items-center justify-between text-text-secondary">
            <span className="text-[11px] font-bold uppercase tracking-wider">Выручка</span>
            <div className="w-5 h-5 flex items-center justify-center text-accent">
              <DollarSign className="w-3 h-3" />
            </div>
          </div>
          <p className="text-base sm:text-lg font-extrabold text-accent tracking-tight">
            {dayData.revenue.toLocaleString('ru-RU')} ₽
          </p>
          <div className="text-[11px] text-text-secondary flex items-center justify-between gap-1">
            <span>Чистый доход:</span>
            <strong className={dayData.netProfit < 0 ? 'text-danger' : 'text-text-primary'}>
              {dayData.netProfit < 0 ? '−' : ''}
              {Math.abs(dayData.netProfit).toLocaleString('ru-RU')} ₽
            </strong>
          </div>
        </div>

        {/* Card 2: Orders Count */}
        <div className="neu-inset rounded-2xl p-3 space-y-1">
          <div className="flex items-center justify-between text-text-secondary">
            <span className="text-[11px] font-bold uppercase tracking-wider">Число заказов</span>
            <div className="w-5 h-5 flex items-center justify-center text-text-primary">
              <ShoppingBag className="w-3 h-3" />
            </div>
          </div>
          <p className="text-base sm:text-lg font-extrabold text-text-primary tracking-tight">
            {dayData.orders} <span className="text-xs font-bold text-text-secondary">шт.</span>
          </p>
          <div className="text-[11px] text-text-secondary flex items-center justify-between">
            <span>Заказов в базе:</span>
            <strong className="text-accent font-bold">{dayData.realOrdersList.length}</strong>
          </div>
        </div>

        {/* Card 3: Average Check */}
        <div className="neu-inset rounded-2xl p-3 space-y-1">
          <div className="flex items-center justify-between text-text-secondary">
            <span className="text-[11px] font-bold uppercase tracking-wider">Средний чек</span>
            <div className="w-5 h-5 flex items-center justify-center text-success">
              <TrendingUp className="w-3 h-3" />
            </div>
          </div>
          <p className="text-base sm:text-lg font-extrabold text-success tracking-tight">
            {dayData.avgCheck.toLocaleString('ru-RU')} ₽
          </p>
          <div className="text-[11px] text-text-secondary">
            На 1 завершенную покупку
          </div>
        </div>

        {/* Card 4: Returns */}
        <div className="neu-inset rounded-2xl p-3 space-y-1">
          <div className="flex items-center justify-between text-text-secondary">
            <span className="text-[11px] font-bold uppercase tracking-wider">Отмены</span>
            <div className="w-5 h-5 flex items-center justify-center text-warning">
              <RotateCcw className="w-3 h-3" />
            </div>
          </div>
          <p className="text-base sm:text-lg font-extrabold text-text-primary tracking-tight">
            {dayData.returns} <span className="text-xs font-bold text-text-secondary">шт.</span>
          </p>
          <div className="text-[11px] text-text-secondary">
            {dayData.returns === 0 ? (
              <span className="text-success font-bold">Без отмен</span>
            ) : (
              <span className="text-warning font-bold">В выручку не входят</span>
            )}
          </div>
        </div>
      </div>

      {/* Orders List for This Day */}
      <div className="space-y-2.5 pt-1">
        <div className="flex items-center justify-between text-xs font-bold text-text-secondary">
          <span className="flex items-center gap-1.5 text-text-primary">
            <Package className="w-4 h-4 text-accent" />
            Реестр заказов за {dayData.date}:
          </span>
          <span className="text-[11px] neu-tone-info text-accent px-2.5 py-1 rounded-lg font-extrabold">
            {dayData.realOrdersList.length > 0
              ? `Заказов: ${dayData.realOrdersList.length}`
              : 'Заказов нет'}
          </span>
        </div>

        {dayData.realOrdersList.length > 0 ? (
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {dayData.realOrdersList.map((ord) => {
              const statusCfg = orderStatusChip(ord);

              return (
                <button
                  type="button"
                  key={ord.id}
                  onClick={() => {
                    onSelectOrder?.(ord);
                    triggerChartHapticFeedback('medium');
                  }}
                  disabled={!onSelectOrder}
                  className="w-full text-left neu-button rounded-2xl p-3 flex items-center justify-between gap-3 text-xs cursor-pointer group disabled:cursor-default"
                >
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-extrabold text-text-primary text-[12px] group-hover:text-accent transition-colors flex items-center gap-0.5">
                        <Hash className="w-3 h-3 text-text-secondary" />
                        {ord.id}
                      </span>
                      <span className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full border ${statusCfg.className}`}>
                        {statusCfg.label}
                      </span>
                      {ord.isAdjusted && (
                        <span className="text-[11px] font-extrabold neu-tone-warning px-1.5 py-0.2 rounded-md">
                          Скорректирован (-{ord.refundAmount || 0} ₽)
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-text-secondary flex-wrap">
                      {ord.customerName && (
                        <span className="flex items-center gap-1 font-medium text-text-primary">
                          <User className="w-3 h-3 text-text-secondary" />
                          {ord.customerName}
                        </span>
                      )}
                      {ord.customerPhone && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3 text-text-secondary" />
                          {ord.customerPhone}
                        </span>
                      )}
                      <span>
                        Товаров:{' '}
                        <strong className="text-text-primary">
                          {(ord.items || []).reduce((sum, it) => sum + (it.quantity || 1), 0)} шт.
                        </strong>
                      </span>
                    </div>

                    {/* Items preview */}
                    {ord.items && ord.items.length > 0 && (
                      <p className="text-xs text-text-secondary truncate neu-flat-sm px-2 py-0.5 rounded-lg">
                        {ord.items.map((it) => `${it.product?.title || 'Товар'} (${it.quantity}x)`).join(', ')}
                      </p>
                    )}
                  </div>

                  <div className="text-right shrink-0 space-y-1">
                    <p className="text-sm font-extrabold text-accent tabular-nums">
                      {ord.totalPrice.toLocaleString('ru-RU')} ₽
                    </p>
                    <span className="text-[11px] text-text-secondary block">
                      {ord.paymentMethod}
                    </span>
                    <span className="text-[11px] font-bold text-accent group-hover:underline flex items-center justify-end gap-0.5">
                      Детали <ChevronRight className="w-2.5 h-2.5" />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="neu-inset rounded-2xl p-3.5 text-center text-xs text-text-secondary space-y-1">
            <p className="font-semibold text-text-primary">Заказов за этот период нет</p>
          </div>
        )}
      </div>
    </div>
  );
};
