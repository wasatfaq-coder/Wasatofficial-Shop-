import React, { useState, useMemo, useCallback } from 'react';
import {
  TrendingUp,
  DollarSign,
  ShoppingBag,
  RotateCcw,
  Calendar,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  FileText,
  RefreshCw,
  Award,
  BarChart3,
  LineChart as LineChartIcon,
  Download,
  Loader2,
  CheckCircle2,
  Tag,
  Database,
  Filter,
  Check,
  Flame,
  ChevronRight,
  MousePointerClick,
  Activity,
  Zap,
  Trash2,
  AlertTriangle,
  X,
  ShieldAlert,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  Legend,
} from 'recharts';
import { Product, Order, PromoCode } from '../../types';
import { generateAnalyticsPDF } from '../../utils/pdfExport';
import {
  computeFirestoreDailySales,
  AnalyticsPeriod,
  OrderStatusFilter,
  DailyDataPoint,
} from '../../utils/analyticsEngine';
import { AdminDailySalesInspector } from './AdminDailySalesInspector';
import { AdminChartNeumorphicTooltip } from './AdminChartNeumorphicTooltip';
import {
  NeumorphicSVGDefs,
  NeumorphicBarShape,
  NeumorphicActiveDot,
  NeumorphicLineDot,
  NeumorphicCursor,
  NeumorphicAxisTick,
  NeumorphicRechartsLegend,
  triggerChartHapticFeedback,
} from './AdminChartNeumorphicShapes';
import { subscribeToOrders, deleteAllOrdersAndStatsFromFirestore } from '../../utils/firebaseSync';

interface AdminAnalyticsTabProps {
  orders: Order[];
  products: Product[];
  promos?: PromoCode[];
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
  onSelectOrder?: (order: Order) => void;
  onUpdateOrders?: (orders: Order[]) => void;
  onResubscribeFirestore?: () => Promise<void> | void;
}

type ChartType = 'area' | 'bar' | 'composed';
type ActiveMetric = 'revenue' | 'orders' | 'returns' | 'avgCheck';

export const AdminAnalyticsTab: React.FC<AdminAnalyticsTabProps> = ({
  orders,
  products,
  promos = [],
  onShowToast,
  onSelectOrder,
  onUpdateOrders,
  onResubscribeFirestore,
}) => {
  const [period, setPeriod] = useState<AnalyticsPeriod>('7d');
  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>('all');
  const [activeMetric, setActiveMetric] = useState<ActiveMetric>('revenue');
  const [chartType, setChartType] = useState<ChartType>('composed');
  const [selectedDay, setSelectedDay] = useState<DailyDataPoint | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isExportingPDF, setIsExportingPDF] = useState<boolean>(false);
  const [animationCycle, setAnimationCycle] = useState<number>(0);
  const [isConfirmDeleteModalOpen, setIsConfirmDeleteModalOpen] = useState<boolean>(false);
  const [isDeletingStats, setIsDeletingStats] = useState<boolean>(false);

  // Live Firestore listener subscription ref and state
  const [localOrders, setLocalOrders] = useState<Order[] | null>(null);
  const orderUnsubRef = React.useRef<(() => void) | null>(null);

  // Active dataset: uses live resubscribed Firestore orders if available, otherwise props
  const activeOrders = useMemo(() => {
    return localOrders || orders;
  }, [localOrders, orders]);

  // Cleanup Firestore listener on unmount
  React.useEffect(() => {
    return () => {
      if (orderUnsubRef.current) {
        orderUnsubRef.current();
        orderUnsubRef.current = null;
      }
    };
  }, []);

  // 1. Process real Firestore orders with dynamic daily bucket engine
  const { dailyData, summary } = useMemo(() => {
    return computeFirestoreDailySales(activeOrders, period, statusFilter);
  }, [activeOrders, period, statusFilter]);

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
    realOrdersCount,
  } = summary;

  // Selected Day Index for sequential navigation
  const selectedDayIndex = useMemo(() => {
    if (!selectedDay) return -1;
    return dailyData.findIndex((d) => d.date === selectedDay.date);
  }, [dailyData, selectedDay]);

  const handlePrevDay = useCallback(() => {
    if (selectedDayIndex > 0) {
      setSelectedDay(dailyData[selectedDayIndex - 1]);
      triggerChartHapticFeedback('light');
    }
  }, [dailyData, selectedDayIndex]);

  const handleNextDay = useCallback(() => {
    if (selectedDayIndex >= 0 && selectedDayIndex < dailyData.length - 1) {
      setSelectedDay(dailyData[selectedDayIndex + 1]);
      triggerChartHapticFeedback('light');
    }
  }, [dailyData, selectedDayIndex]);

  // Handle clicking on the Peak Day badge to immediately inspect it
  const handleInspectPeakDay = useCallback(() => {
    if (peakDay) {
      const foundPeak = dailyData.find((d) => d.isPeakDay);
      if (foundPeak) {
        setSelectedDay(foundPeak);
        setActiveMetric('revenue');
        triggerChartHapticFeedback('double');
        onShowToast(`Выбран пиковый день: ${foundPeak.fullDate} (${foundPeak.revenue.toLocaleString('ru-RU')} ₽)`, 'info');
      }
    }
  }, [peakDay, dailyData, onShowToast]);

  // Unique key to smoothly trigger Recharts entry animations whenever parameters change
  const chartAnimationKey = useMemo(() => {
    return `chart-${period}-${activeMetric}-${chartType}-${statusFilter}-${animationCycle}`;
  }, [period, activeMetric, chartType, statusFilter, animationCycle]);

  // 2. Real sales aggregation per product from Firestore
  const productSalesMap = useMemo(() => {
    const map = new Map<string, number>();
    activeOrders.forEach((o) => {
      if (o.isCancelled) return;
      o.items?.forEach((item) => {
        const prev = map.get(item.product.id) || 0;
        map.set(item.product.id, prev + item.quantity);
      });
    });
    return map;
  }, [activeOrders]);

  // Top selling products computation with real sales weight
  const topProducts = useMemo(() => {
    return [...products]
      .sort((a, b) => {
        const salesA = productSalesMap.get(a.id) || 0;
        const salesB = productSalesMap.get(b.id) || 0;
        if (salesA !== salesB) return salesB - salesA;
        return (b.reviewsCount || 0) * (b.rating || 4.8) - (a.reviewsCount || 0) * (a.rating || 4.8);
      })
      .slice(0, 4);
  }, [products, productSalesMap]);

  const topSalesCounts = useMemo(() => {
    return topProducts.map((p) => {
      return productSalesMap.get(p.id) || 0;
    });
  }, [topProducts, productSalesMap]);

  // Top categories stats calculated purely from real sales
  const categoryStats = useMemo(() => {
    const catMap = new Map<string, { name: string; revenue: number; color: string }>();
    const colorPalette = ['bg-[#5F6ED0]', 'bg-[#4B58B0]', 'bg-[#7A87E0]', 'bg-[#8F9BB3]', 'bg-[#BAC5D5]'];

    const defaultCategories = [
      { id: 'shirts', name: 'Рубашки и сорочки', color: 'bg-[#5F6ED0]' },
      { id: 'linen', name: 'Премиум лён', color: 'bg-[#4B58B0]' },
      { id: 'jackets', name: 'Куртки и бомберы', color: 'bg-[#7A87E0]' },
      { id: 'trousers', name: 'Брюки и чиносы', color: 'bg-[#8F9BB3]' },
      { id: 'accessories', name: 'Аксессуары', color: 'bg-[#BAC5D5]' },
    ];

    defaultCategories.forEach((c) => {
      catMap.set(c.id, { name: c.name, revenue: 0, color: c.color });
    });

    let calculatedTotal = 0;
    activeOrders.forEach((o) => {
      if (o.isCancelled) return;
      o.items?.forEach((item) => {
        const catId = item.product?.category || 'shirts';
        const catLabel = item.product?.categoryLabel || 'Товары';
        const itemPrice = (item.product?.price || 0) * (item.quantity || 1);
        calculatedTotal += itemPrice;
        const current = catMap.get(catId);
        if (current) {
          current.revenue += itemPrice;
        } else {
          catMap.set(catId, {
            name: catLabel,
            revenue: itemPrice,
            color: colorPalette[catMap.size % colorPalette.length],
          });
        }
      });
    });

    const list = Array.from(catMap.values());
    return list.map((c) => ({
      name: c.name,
      revenue: c.revenue,
      share: calculatedTotal > 0 ? Math.round((c.revenue / calculatedTotal) * 100) : 0,
      color: c.color,
    }));
  }, [activeOrders]);

  // Promo performance analytics synchronized with real orders in Firestore
  const promoPerformanceList = useMemo(() => {
    if (!promos || promos.length === 0) return [];

    return promos.map((p) => {
      const discountLabel =
        p.discountType === 'fixed'
          ? `Скидка ${p.discountValue.toLocaleString('ru-RU')} ₽`
          : `Скидка ${p.discountPercent || p.discountValue}%`;

      let realOrdersCount = 0;
      let realRevenue = 0;
      let realDiscountTotal = 0;

      activeOrders.forEach((o) => {
        if (o.isCancelled) return;
        const usedThisPromo =
          (o.promoCode && o.promoCode.toUpperCase() === p.code.toUpperCase()) ||
          (o.discount && o.discount > 0 && o.promoCode === p.code);
        if (usedThisPromo) {
          realOrdersCount++;
          realRevenue += o.totalPrice || 0;
          realDiscountTotal +=
            o.discount ||
            (p.discountType === 'fixed'
              ? p.discountValue
              : Math.round((o.totalPrice || 0) * ((p.discountPercent || p.discountValue) / 100)));
        }
      });

      if (p.usedCount && p.usedCount > realOrdersCount) {
        realOrdersCount = p.usedCount;
      }
      if (p.generatedRevenue && p.generatedRevenue > realRevenue) {
        realRevenue = p.generatedRevenue;
      }

      const totalActiveOrders = activeOrders.filter((o) => !o.isCancelled).length;
      const conversion =
        totalActiveOrders > 0
          ? `${((realOrdersCount / totalActiveOrders) * 100).toFixed(1)}%`
          : '0.0%';

      return {
        code: p.code,
        discount: discountLabel,
        ordersCount: realOrdersCount,
        revenue: realRevenue,
        discountTotal: realDiscountTotal,
        conversion,
        status: p.active ? ('active' as const) : ('paused' as const),
      };
    });
  }, [promos, activeOrders]);

  const totalPromoRevenue = promoPerformanceList.reduce((acc, p) => acc + p.revenue, 0);
  const totalPromoDiscounts = promoPerformanceList.reduce((acc, p) => acc + p.discountTotal, 0);

  // Full purge of statistics and orders from Firestore database
  const handleDeleteAllStats = async () => {
    try {
      setIsDeletingStats(true);
      const res = await deleteAllOrdersAndStatsFromFirestore();
      setLocalOrders([]);
      if (onUpdateOrders) {
        onUpdateOrders([]);
      }
      setSelectedDay(null);
      setAnimationCycle((c) => c + 1);
      setIsConfirmDeleteModalOpen(false);
      onShowToast(
        `Все статистические данные и заказы (${res.deletedCount} шт.) успешно удалены из базы Firestore`,
        'success'
      );
    } catch (err) {
      console.error('Error deleting statistics from Firestore:', err);
      onShowToast('Не удалось удалить данные статистики из базы', 'error');
    } finally {
      setIsDeletingStats(false);
    }
  };

  // Format axis ticks with proper currency / unit labels
  const formatYAxis = (val: number) => {
    if (activeMetric === 'revenue' || activeMetric === 'avgCheck') {
      if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M ₽`;
      if (val >= 1000) return `${Math.round(val / 1000)}k ₽`;
      return `${val} ₽`;
    }
    if (activeMetric === 'orders' || activeMetric === 'returns') {
      return `${val} шт`;
    }
    return `${val}`;
  };

  // Dedicated formatter for ComposedChart Left Axis which is always revenue
  const formatRevenueYAxis = (val: number) => {
    if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M ₽`;
    if (val >= 1000) return `${Math.round(val / 1000)}k ₽`;
    return `${val} ₽`;
  };

  // Smart interval to prevent tick crowding on smaller viewports
  const xAxisInterval = period === '30d' ? 3 : period === '14d' ? 1 : 0;

  const periodLabelMap: Record<AnalyticsPeriod, string> = {
    '7d': 'Последние 7 дней (по дням)',
    '14d': 'Две недели (14 дней по дням)',
    '30d': '30 дней (по дням)',
    '6m': 'Полгода (по месяцам)',
    '1y': 'Годовой срез (2026)',
  };

  const handleChartClick = useCallback((e: any) => {
    if (e && e.activePayload && e.activePayload.length > 0) {
      const clickedData = e.activePayload[0].payload as DailyDataPoint;
      setSelectedDay(clickedData);
      triggerChartHapticFeedback(clickedData.isPeakDay ? 'double' : 'medium');
    }
  }, []);

  const handleForceResubscribeFirestore = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    triggerChartHapticFeedback('double');

    try {
      // 1. Invoke parent sync callback if passed
      if (onResubscribeFirestore) {
        try {
          await onResubscribeFirestore();
        } catch (syncErr) {
          console.warn('[Firestore Resubscribe] Parent sync warning:', syncErr);
        }
      }

      // 2. Unsubscribe previous real-time listener if active
      if (orderUnsubRef.current) {
        try {
          orderUnsubRef.current();
        } catch (e) {
          console.warn('[Firestore Resubscribe] Error cleaning previous subscription:', e);
        }
        orderUnsubRef.current = null;
      }

      // 3. Initiate fresh real-time listener on Firestore 'orders' collection
      let loadedOrdersCount = activeOrders.length;
      const unsub = subscribeToOrders(
        (freshOrders) => {
          if (freshOrders && Array.isArray(freshOrders)) {
            setLocalOrders(freshOrders);
            loadedOrdersCount = freshOrders.length;
            if (onUpdateOrders) {
              onUpdateOrders(freshOrders);
            }
          }
        },
        (error) => {
          console.error('[Firestore Resubscribe] Subscription error:', error);
        }
      );
      orderUnsubRef.current = unsub;

      // Small delay for tactile button animation feedback
      await new Promise((r) => setTimeout(r, 650));

      setAnimationCycle((c) => c + 1);
      onShowToast(
        `Данные Firestore обновлены: переподписка выполнена (${loadedOrdersCount} заказов актуализировано в реальном времени)`,
        'success'
      );
    } catch (err) {
      console.error('[Firestore Resubscribe] Failed to resubscribe:', err);
      onShowToast('Не удалось обновить подписку Firestore. Проверьте соединение.', 'error');
    } finally {
      setIsRefreshing(false);
    }
  }, [activeOrders.length, onResubscribeFirestore, onUpdateOrders, onShowToast, isRefreshing]);

  const handleRefreshData = handleForceResubscribeFirestore;

  const handleExportPDF = async () => {
    try {
      setIsExportingPDF(true);
      onShowToast('Формирование официального PDF-отчёта продаж...', 'info');

      const recentOrdersData = activeOrders.slice(0, 15).map((o) => ({
        id: String(o.id),
        date: typeof o.date === 'string' ? o.date : new Date(o.date).toLocaleDateString('ru-RU'),
        itemsCount: Array.isArray(o.items) ? o.items.length : 1,
        status:
          o.status === 'accepted'
            ? 'Принят'
            : o.status === 'assembling'
            ? 'Собирается'
            : o.status === 'in_transit'
            ? 'В пути'
            : o.status === 'ready'
            ? 'Готов к выдаче'
            : 'Доставлен',
        total: (o as any).totalPrice ?? (o as any).total ?? 0,
      }));

      const topProductsFormatted = topProducts.map((p, idx) => ({
        title: p.title,
        price: p.price,
        salesCount: topSalesCounts[idx] || 45,
        revenue: p.price * (topSalesCounts[idx] || 45),
        rating: p.rating,
      }));

      await generateAnalyticsPDF({
        periodLabel: periodLabelMap[period],
        totalRevenue,
        prevRevenue: prevTotalRevenue,
        revenueGrowthPercent: revenueGrowth,
        totalOrdersCount: totalOrders,
        prevOrdersCount: prevTotalOrders,
        avgCheck,
        returnRate,
        totalReturnsCount: totalReturns,
        categoryStats,
        topProducts: topProductsFormatted,
        recentOrders: recentOrdersData,
      });

      onShowToast('PDF-отчет успешно сгенерирован и загружен на устройство', 'success');
    } catch (err) {
      console.error('PDF export error:', err);
      onShowToast('Не удалось сформировать PDF. Попробуйте еще раз.', 'error');
    } finally {
      setIsExportingPDF(false);
    }
  };

  const currentMetricPrevKey =
    activeMetric === 'revenue'
      ? 'prevRevenue'
      : activeMetric === 'orders'
      ? 'prevOrders'
      : 'prevReturns';

  return (
    <div className="space-y-4 sm:space-y-5 text-[#2D3A4E]">
      {/* ============================================================ */}
      {/* SECTION 1: HEADER & PERIOD SEGMENTED CONTROLLER              */}
      {/* ============================================================ */}
      <div className="neu-inset rounded-2xl p-4 bg-[#E3E8EF] flex flex-col md:flex-row md:items-center justify-between gap-3 border border-white/60">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-black uppercase tracking-wider text-[#4B59BB] bg-[#5F6ED0]/10 px-2 py-0.5 rounded-md">
              ФИНАНСОВАЯ АНАЛИТИКА FIRESTORE
            </span>
            {/* Live Firestore Connection Badge */}
            <div className="neu-inset px-2.5 py-0.5 rounded-full bg-[#E3E8EF] flex items-center gap-1.5 text-[11px] font-extrabold text-success border border-success/20">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse shadow-sm" />
              <span>База данных: {realOrdersCount} заказов онлайн</span>
            </div>
          </div>

          <h3 className="text-base sm:text-lg font-black text-[#2D3A4E] tracking-tight flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-[#4B59BB] shrink-0" />
            <span>Суточная выручка и динамика продаж</span>
          </h3>

          <p className="text-xs text-[#4E5C70]">
            Интерактивные графики Recharts с плавной анимацией появления данных и детальным суточным срезом
          </p>
        </div>

        {/* Time Period Filter Segmented Controller */}
        <div className="flex items-center gap-1.5 self-start md:self-auto">
          <span className="text-[11px] font-bold text-[#4E5C70] hidden lg:inline mr-1">
            Период:
          </span>
          <div className="neu-flat-sm rounded-xl p-1 flex gap-1 bg-[#E3E8EF] flex-wrap">
            {[
              { id: '7d', label: '7 дней' },
              { id: '14d', label: '14 дней' },
              { id: '30d', label: '30 дней' },
              { id: '6m', label: '6 мес' },
              { id: '1y', label: '1 год' },
            ].map((p) => {
              const isActive = period === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    setPeriod(p.id as AnalyticsPeriod);
                    setSelectedDay(null);
                    setAnimationCycle((c) => c + 1);
                    triggerChartHapticFeedback('light');
                  }}
                  className={`py-1 px-3 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer ${
                    isActive
                      ? 'neu-pill-active font-black'
                      : 'text-[#4E5C70] hover:text-[#2D3A4E] hover:bg-white/30'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* SECTION 2: INTERACTIVE METRICS CONTROLLERS (4 CARDS)          */}
      {/* ============================================================ */}
      <div>
        <div className="flex items-center justify-between pb-1.5 px-0.5">
          <span className="text-[11px] font-black uppercase tracking-wider text-[#4E5C70] flex items-center gap-1">
            <Activity className="w-3 h-3 text-[#4B59BB]" />
            Выберите показатель для отображения на графике:
          </span>
          <span className="text-[11px] text-[#8F9BB3] hidden sm:inline">
            Нажмите на карточку для переключения среза
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
          {/* Card 1: Revenue (Выручка) */}
          <div
            onClick={() => {
              setActiveMetric('revenue');
              setAnimationCycle((c) => c + 1);
              triggerChartHapticFeedback('light');
            }}
            className={`rounded-2xl p-3.5 space-y-1.5 transition-all duration-200 cursor-pointer relative overflow-hidden border group ${
              activeMetric === 'revenue'
                ? 'neu-pill-active border-transparent'
                : 'neu-flat border-transparent hover:-translate-y-0.5'
            }`}
          >
            <div className="flex items-center justify-between text-[#4E5C70]">
              <span className="text-[11px] font-bold uppercase tracking-wider">Выручка за период</span>
              <div className="w-6 h-6 rounded-lg neu-inset flex items-center justify-center bg-[#E3E8EF] text-[#4B59BB]">
                <DollarSign className="w-3.5 h-3.5" />
              </div>
            </div>

            <p className="text-lg sm:text-xl font-black text-[#2D3A4E] truncate tracking-tight tabular-nums">
              {totalRevenue.toLocaleString('ru-RU')} ₽
            </p>

            <div className="flex items-center justify-between text-[11px] font-bold text-success pt-0.5">
              <span className="flex items-center gap-0.5">
                <ArrowUpRight className="w-3 h-3" />
                +{revenueGrowth}%
              </span>
              <span className="text-[#4E5C70] font-normal truncate">
                пред. {(prevTotalRevenue / 1000).toFixed(0)}k ₽
              </span>
            </div>
          </div>

          {/* Card 2: Daily Average & Peak Day */}
          <div
            onClick={handleInspectPeakDay}
            className={`rounded-2xl p-3.5 space-y-1.5 transition-all duration-200 cursor-pointer relative overflow-hidden border group ${
              selectedDay?.isPeakDay
                ? 'neu-pill-active border-transparent'
                : 'neu-flat border-transparent hover:-translate-y-0.5'
            }`}
            title="Нажмите для мгновенной детализации пикового дня периода"
          >
            <div className="flex items-center justify-between text-[#4E5C70]">
              <span className="text-[11px] font-bold uppercase tracking-wider">В среднем в день</span>
              <div className="w-6 h-6 rounded-lg neu-inset flex items-center justify-center bg-[#E3E8EF] text-warning">
                <Flame className="w-3.5 h-3.5" />
              </div>
            </div>

            <p className="text-lg sm:text-xl font-black text-[#2D3A4E] truncate tracking-tight tabular-nums">
              {avgDailyRevenue.toLocaleString('ru-RU')} ₽
              <span className="text-[11px] font-bold text-[#4E5C70]">/сут</span>
            </p>

            <div className="flex items-center justify-between text-[11px] font-bold text-warning pt-0.5">
              <span className="truncate">
                Пик: {peakDay ? `${peakDay.label}` : '—'}
              </span>
              <span className="text-warning font-extrabold underline underline-offset-2">
                {peakDay ? `${Math.round(peakDay.revenue / 1000)}k ₽` : ''}
              </span>
            </div>
          </div>

          {/* Card 3: Orders Count (Заказы) */}
          <div
            onClick={() => {
              setActiveMetric('orders');
              setAnimationCycle((c) => c + 1);
              triggerChartHapticFeedback('light');
            }}
            className={`rounded-2xl p-3.5 space-y-1.5 transition-all duration-200 cursor-pointer relative overflow-hidden border group ${
              activeMetric === 'orders'
                ? 'neu-pill-active border-transparent'
                : 'neu-flat border-transparent hover:-translate-y-0.5'
            }`}
          >
            <div className="flex items-center justify-between text-[#4E5C70]">
              <span className="text-[11px] font-bold uppercase tracking-wider">Всего заказов</span>
              <div className="w-6 h-6 rounded-lg neu-inset flex items-center justify-center bg-[#E3E8EF] text-success">
                <ShoppingBag className="w-3.5 h-3.5" />
              </div>
            </div>

            <p className="text-lg sm:text-xl font-black text-[#2D3A4E] tracking-tight tabular-nums">
              {totalOrders.toLocaleString('ru-RU')} <span className="text-xs font-bold text-[#4E5C70]">шт.</span>
            </p>

            <div className="flex items-center justify-between text-[11px] font-bold text-success pt-0.5">
              <span className="flex items-center gap-0.5">
                <ArrowUpRight className="w-3 h-3" />
                +{ordersGrowth}%
              </span>
              <span className="text-[#4E5C70] font-normal">
                ~{(totalOrders / Math.max(1, dailyData.length)).toFixed(1)} / сут.
              </span>
            </div>
          </div>

          {/* Card 4: Average Check (Средний чек) */}
          <div
            onClick={() => {
              setActiveMetric('avgCheck');
              setAnimationCycle((c) => c + 1);
              triggerChartHapticFeedback('light');
            }}
            className={`rounded-2xl p-3.5 space-y-1.5 transition-all duration-200 cursor-pointer relative overflow-hidden border group ${
              activeMetric === 'avgCheck'
                ? 'neu-pill-active border-transparent'
                : 'neu-flat border-transparent hover:-translate-y-0.5'
            }`}
          >
            <div className="flex items-center justify-between text-[#4E5C70]">
              <span className="text-[11px] font-bold uppercase tracking-wider">Средний чек</span>
              <div className="w-6 h-6 rounded-lg neu-inset flex items-center justify-center bg-[#E3E8EF] text-sky-600">
                <TrendingUp className="w-3.5 h-3.5" />
              </div>
            </div>

            <p className="text-lg sm:text-xl font-black text-[#2D3A4E] truncate tracking-tight tabular-nums">
              {avgCheck.toLocaleString('ru-RU')} ₽
            </p>

            <div className="flex items-center justify-between text-[11px] text-[#4E5C70] pt-0.5">
              <span>Возвраты: {totalReturns} шт.</span>
              <span className="text-success font-bold">({returnRate}%)</span>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* SECTION 3: RECHARTS CHART CONTAINER WITH ANIMATION & CONTROLS */}
      {/* ============================================================ */}
      <div className="neu-inset rounded-2xl p-4 sm:p-5 space-y-4 bg-[#E3E8EF] border border-white/70">
        {/* Chart Block Header: Dynamic Title + Live Badge + Neumorphic 'Обновить данные' Button */}
        <div className="flex items-center justify-between gap-3 flex-wrap border-b border-[#BAC5D5]/50 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-[#4B59BB] shrink-0">
              <Activity className="w-4 h-4 text-[#4B59BB]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs sm:text-sm font-black text-[#2D3A4E] tracking-tight">
                  Динамика показателей продаж
                </h3>
                <span className="flex items-center gap-1 text-[11px] font-extrabold text-success bg-success-soft px-2 py-0.5 rounded-full border border-success/40">
                  <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                  Live Firestore
                </span>
              </div>
              <p className="text-[11px] text-[#4E5C70] font-medium">
                {periodLabelMap[period]} • {realOrdersCount} заказов в базе
              </p>
            </div>
          </div>

          {/* Neumorphic 'Обновить данные' button with icon, state and tactile press effect */}
          <button
            type="button"
            onClick={handleForceResubscribeFirestore}
            disabled={isRefreshing}
            className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all cursor-pointer select-none ${
              isRefreshing
                ? 'neu-inset text-[#4B59BB] bg-[#E3E8EF] scale-[0.98]'
                : 'neu-button text-[#2D3A4E] hover:text-[#4B59BB] active:scale-95'
            }`}
            title="Принудительно переподписаться на данные Firestore и обновить метрики в реальном времени"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-[#4B59BB] transition-transform ${
                isRefreshing ? 'animate-spin' : ''
              }`}
            />
            <span>{isRefreshing ? 'Синхронизация...' : 'Обновить данные'}</span>
          </button>
        </div>

        {/* Top Controls Bar: Metric Selector, Filter Chips, Compare, Chart Mode */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 border-b border-[#BAC5D5]/50 pb-3.5">
          {/* Quick Metric Selector Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-black uppercase text-[#4E5C70] mr-1">Метрика:</span>
            {[
              { id: 'revenue', label: 'Выручка (₽)', color: 'text-[#4B59BB] border-[#5F6ED0]' },
              { id: 'orders', label: 'Заказы (шт)', color: 'text-success border-[#10B981]' },
              { id: 'avgCheck', label: 'Средний чек (₽)', color: 'text-sky-700 border-[#0284C7]' },
              { id: 'returns', label: 'Возвраты (шт)', color: 'text-warning border-[#F59E0B]' },
            ].map((m) => {
              const isSelected = activeMetric === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => {
                    setActiveMetric(m.id as ActiveMetric);
                    setAnimationCycle((c) => c + 1);
                    triggerChartHapticFeedback('light');
                  }}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-extrabold transition-all duration-200 cursor-pointer ${
                    isSelected
                      ? `neu-pill-active font-black`
                      : 'neu-button text-[#4E5C70] hover:text-[#2D3A4E]'
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>

          {/* Right Toolbar: Order Status Filter, Comparison Toggle & Chart Type */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Order Status Filter Chips */}
            <div className="neu-flat-sm rounded-xl p-0.5 flex gap-0.5 bg-[#E3E8EF] text-[11px] font-bold">
              {[
                { id: 'all', label: 'Все' },
                { id: 'paid', label: 'Оплаченные' },
                { id: 'delivered', label: 'Врученные' },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    setStatusFilter(f.id as OrderStatusFilter);
                    setAnimationCycle((c) => c + 1);
                    triggerChartHapticFeedback('light');
                  }}
                  className={`px-2 py-1 rounded-lg transition-all cursor-pointer ${
                    statusFilter === f.id
                      ? 'neu-pill-active font-black'
                      : 'text-[#4E5C70] hover:text-[#2D3A4E]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Chart Type Switcher: Area | Bar | Composed */}
            <div className="neu-flat-sm rounded-xl p-0.5 flex gap-0.5 bg-[#E3E8EF]">
              <button
                type="button"
                onClick={() => {
                  setChartType('area');
                  setAnimationCycle((c) => c + 1);
                  triggerChartHapticFeedback('light');
                }}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  chartType === 'area'
                    ? 'neu-pill-active font-black'
                    : 'text-[#4E5C70] hover:text-[#2D3A4E]'
                }`}
                title="График площади с градиентом (Area Chart)"
                aria-label="График площади с градиентом (Area Chart)"
              >
                <LineChartIcon className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setChartType('bar');
                  setAnimationCycle((c) => c + 1);
                  triggerChartHapticFeedback('light');
                }}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  chartType === 'bar'
                    ? 'neu-pill-active font-black'
                    : 'text-[#4E5C70] hover:text-[#2D3A4E]'
                }`}
                title="Столбчатая диаграмма по дням (Bar Chart)"
                aria-label="Столбчатая диаграмма по дням (Bar Chart)"
              >
                <BarChart3 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setChartType('composed');
                  setAnimationCycle((c) => c + 1);
                  triggerChartHapticFeedback('light');
                }}
                className={`px-2 py-1 rounded-lg transition-all cursor-pointer text-[11px] font-black flex items-center gap-1 ${
                  chartType === 'composed'
                    ? 'neu-pill-active'
                    : 'text-[#4E5C70] hover:text-[#2D3A4E]'
                }`}
                title="Комбинированный график (Микс)"
              >
                <Layers className="w-3 h-3 text-[#4B59BB]" />
                <span>Микс</span>
              </button>
            </div>
          </div>
        </div>

        {/* Info & Haptic status bar */}
        <div className="flex items-center justify-between gap-2 flex-wrap text-xs text-[#4E5C70]">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#4E5C70]">
            <MousePointerClick className="w-3.5 h-3.5 text-[#4B59BB]" />
            <span>Нажмите на столбец или точку графика для детального среза дня</span>
          </div>

          <div className="flex items-center gap-1 text-[11px] font-bold text-[#4B59BB] neu-inset px-2.5 py-0.5 rounded-full bg-[#E3E8EF]">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse shadow-sm" />
            <span>Тактильный отклик Neumorphism</span>
          </div>
        </div>

        {/* Recharts Container with smooth entrance animations */}
        <div className="neu-inset rounded-2xl p-3 sm:p-4 bg-[#E3E8EF] select-none relative">
          <div className="h-72 sm:h-80 w-full">
            <ResponsiveContainer
              key={chartAnimationKey}
              width="100%"
              height="100%"
              className=""
            >
              {chartType === 'area' ? (
                <AreaChart
                  data={dailyData}
                  margin={{ top: 16, right: 14, left: -6, bottom: 20 }}
                  onClick={handleChartClick}
                  style={{ outline: 'none', cursor: 'pointer' }}
                  tabIndex={-1}
                >
                  <NeumorphicSVGDefs activeColor="#5F6ED0" />
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#BAC5D5" strokeOpacity={0.35} />
                  <XAxis
                    dataKey="label"
                    stroke="#4E5C70"
                    tickLine={false}
                    axisLine={{ stroke: '#BAC5D5', strokeOpacity: 0.6 }}
                    dy={4}
                    interval={xAxisInterval}
                    tick={
                      <NeumorphicAxisTick
                        selectedDate={selectedDay?.date}
                        period={period}
                        dailyData={dailyData}
                      />
                    }
                  />
                  <YAxis
                    stroke="#4E5C70"
                    fontSize={10}
                    fontWeight={700}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={formatYAxis}
                  />
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
                    wrapperStyle={{ outline: 'none', border: 'none', boxShadow: 'none', zIndex: 100, pointerEvents: 'none' }}
                  />
                  <Legend
                    verticalAlign="top"
                    align="left"
                    content={
                      <NeumorphicRechartsLegend
                        activeMetric={activeMetric}
                        compareWithPrevious={false}
                        chartType="area"
                      />
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey={activeMetric}
                    name={
                      activeMetric === 'orders'
                        ? 'Динамика заказов (шт)'
                        : activeMetric === 'returns'
                        ? 'Динамика возвратов (шт)'
                        : activeMetric === 'avgCheck'
                        ? 'Динамика чека (₽)'
                        : 'Суточная выручка (₽)'
                    }
                    stroke={
                      activeMetric === 'returns'
                        ? '#F59E0B'
                        : activeMetric === 'orders'
                        ? '#10B981'
                        : activeMetric === 'avgCheck'
                        ? '#0284C7'
                        : '#5F6ED0'
                    }
                    strokeWidth={3}
                    filter="url(#neu-area-glow)"
                    fillOpacity={1}
                    fill={
                      activeMetric === 'returns'
                        ? 'url(#colorReturnsArea)'
                        : activeMetric === 'orders'
                        ? 'url(#colorOrdersArea)'
                        : activeMetric === 'avgCheck'
                        ? 'url(#colorAvgCheckArea)'
                        : 'url(#colorRevenueArea)'
                    }
                    isAnimationActive={true}
                    animationBegin={200}
                    animationDuration={1000}
                    animationEasing="ease-out"
                    activeDot={
                      <NeumorphicActiveDot
                        stroke={
                          activeMetric === 'returns'
                            ? '#F59E0B'
                            : activeMetric === 'orders'
                            ? '#10B981'
                            : activeMetric === 'avgCheck'
                            ? '#0284C7'
                            : '#5F6ED0'
                        }
                        activeMetric={activeMetric}
                      />
                    }
                  />
                </AreaChart>
              ) : chartType === 'bar' ? (
                <BarChart
                  data={dailyData}
                  margin={{ top: 16, right: 14, left: -6, bottom: 20 }}
                  onClick={handleChartClick}
                  style={{ outline: 'none', cursor: 'pointer' }}
                  tabIndex={-1}
                >
                  <NeumorphicSVGDefs activeColor="#5F6ED0" />
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#BAC5D5" strokeOpacity={0.35} />
                  <XAxis
                    dataKey="label"
                    stroke="#4E5C70"
                    tickLine={false}
                    axisLine={{ stroke: '#BAC5D5', strokeOpacity: 0.6 }}
                    dy={4}
                    interval={xAxisInterval}
                    tick={
                      <NeumorphicAxisTick
                        selectedDate={selectedDay?.date}
                        period={period}
                        dailyData={dailyData}
                      />
                    }
                  />
                  <YAxis
                    stroke="#4E5C70"
                    fontSize={10}
                    fontWeight={700}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={formatYAxis}
                  />
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
                    wrapperStyle={{ outline: 'none', border: 'none', boxShadow: 'none', zIndex: 100, pointerEvents: 'none' }}
                  />
                  <Legend
                    verticalAlign="top"
                    align="left"
                    content={
                      <NeumorphicRechartsLegend
                        activeMetric={activeMetric}
                        compareWithPrevious={false}
                        chartType="bar"
                      />
                    }
                  />
                  <Bar
                    dataKey={activeMetric}
                    name={
                      activeMetric === 'orders'
                        ? 'Заказы (шт)'
                        : activeMetric === 'returns'
                        ? 'Возвраты (шт)'
                        : activeMetric === 'avgCheck'
                        ? 'Средний чек (₽)'
                        : 'Суточная выручка (₽)'
                    }
                    shape={
                      <NeumorphicBarShape
                        selectedDate={selectedDay?.date}
                        activeMetric={activeMetric}
                      />
                    }
                    maxBarSize={period === '30d' ? 20 : 36}
                    isAnimationActive={true}
                    animationBegin={220}
                    animationDuration={950}
                    animationEasing="ease-out"
                  />
                </BarChart>
              ) : (
                /* Composed Chart: Harmonized Neumorphic Hybrid (Area Gradient Fill + Tactile 3D Bars) */
                <ComposedChart
                  data={dailyData}
                  margin={{ top: 16, right: 14, left: -6, bottom: 20 }}
                  onClick={handleChartClick}
                  style={{ outline: 'none', cursor: 'pointer' }}
                  tabIndex={-1}
                >
                  <NeumorphicSVGDefs activeColor="#5F6ED0" />

                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#BAC5D5" strokeOpacity={0.35} />

                  <XAxis
                    dataKey="label"
                    stroke="#4E5C70"
                    tickLine={false}
                    axisLine={{ stroke: '#BAC5D5', strokeOpacity: 0.6 }}
                    dy={4}
                    interval={xAxisInterval}
                    tick={
                      <NeumorphicAxisTick
                        selectedDate={selectedDay?.date}
                        period={period}
                        dailyData={dailyData}
                      />
                    }
                  />

                  {/* Single Unified Left Axis */}
                  <YAxis
                    stroke="#4E5C70"
                    fontSize={10}
                    fontWeight={700}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={formatYAxis}
                  />

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
                    wrapperStyle={{ outline: 'none', border: 'none', boxShadow: 'none', zIndex: 100, pointerEvents: 'none' }}
                  />

                  {/* Recharts Legend in Neumorphic Style */}
                  <Legend
                    verticalAlign="top"
                    align="left"
                    content={
                      <NeumorphicRechartsLegend
                        activeMetric={activeMetric}
                        compareWithPrevious={false}
                        chartType="composed"
                      />
                    }
                  />

                  {/* Current Period Main Bar with Neumorphic 3D Bevel & Recessed Track */}
                  <Bar
                    dataKey={activeMetric}
                    name={
                      activeMetric === 'orders'
                        ? 'Динамика заказов (шт)'
                        : activeMetric === 'returns'
                        ? 'Динамика возвратов (шт)'
                        : activeMetric === 'avgCheck'
                        ? 'Динамика чека (₽)'
                        : 'Суточная выручка (₽)'
                    }
                    shape={
                      <NeumorphicBarShape
                        selectedDate={selectedDay?.date}
                        activeMetric={activeMetric}
                      />
                    }
                    maxBarSize={period === '30d' ? 20 : 36}
                    isAnimationActive={true}
                    animationBegin={220}
                    animationDuration={950}
                    animationEasing="ease-out"
                  />
                </ComposedChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* SECTION 4: SELECTED DAY DRILL-DOWN INSPECTOR                  */}
      {/* ============================================================ */}
      {selectedDay && (
        <AdminDailySalesInspector
          dayData={selectedDay}
          onClose={() => setSelectedDay(null)}
          onSelectOrder={onSelectOrder}
          onPrevDay={handlePrevDay}
          onNextDay={handleNextDay}
          hasPrev={selectedDayIndex > 0}
          hasNext={selectedDayIndex >= 0 && selectedDayIndex < dailyData.length - 1}
          dayIndex={selectedDayIndex}
          totalDays={dailyData.length}
        />
      )}

      {/* ============================================================ */}
      {/* SECTION 5: TOP PRODUCTS & TOP CATEGORIES BREAKDOWN            */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
        {/* Top Selling Products */}
        <div className="neu-inset rounded-2xl p-4 space-y-3 bg-[#E3E8EF] border border-white/60">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black uppercase text-[#2D3A4E] tracking-wider flex items-center gap-1.5">
              <Award className="w-4 h-4 text-[#4B59BB]" />
              Топ продаваемых товаров
            </h4>
            <span className="text-[11px] font-bold text-[#4E5C70]">По объёму из базы</span>
          </div>

          <div className="space-y-2">
            {topProducts.map((prod, idx) => {
              const salesCount = topSalesCounts[idx] || 50;
              const productRev = prod.price * salesCount;

              return (
                <div
                  key={prod.id}
                  className="neu-inset rounded-2xl p-2.5 flex items-center justify-between gap-2.5 bg-[#E3E8EF] border border-transparent hover:border-[#5F6ED0]/30 transition-all"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <img
                      src={
                        prod.images?.[0] ||
                        'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600&auto=format&fit=crop&q=80'
                      }
                      alt={prod.title}
                      className="w-10 h-10 rounded-xl object-cover shrink-0 neu-inset p-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-black text-[#4B59BB] neu-inset px-1.5 py-0.2 rounded-md">
                          #{idx + 1}
                        </span>
                        <p className="text-xs font-bold text-[#2D3A4E] truncate">{prod.title}</p>
                      </div>
                      <p className="text-[11px] text-[#4E5C70]">
                        Продано: <strong className="text-[#2D3A4E]">{salesCount} шт.</strong> •{' '}
                        {prod.price.toLocaleString('ru-RU')} ₽/шт
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-xs font-black text-[#4B59BB] tabular-nums">
                      {productRev.toLocaleString('ru-RU')} ₽
                    </p>
                    <span className="text-[11px] font-bold text-success">
                      ★ {prod.rating || '4.9'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top Categories Breakdown */}
        <div className="neu-inset rounded-2xl p-4 space-y-3 bg-[#E3E8EF] border border-white/60">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black uppercase text-[#2D3A4E] tracking-wider flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-[#4B59BB]" />
              Топ категорий по доле продаж
            </h4>
            <span className="text-[11px] font-bold text-[#4E5C70]">100% охват</span>
          </div>

          <div className="space-y-2.5">
            {categoryStats.map((cat, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[#2D3A4E]">{cat.name}</span>
                  <span className="font-black text-[#4B59BB]">
                    {cat.share}%{' '}
                    <span className="text-[11px] text-[#4E5C70] font-normal">
                      ({cat.revenue.toLocaleString('ru-RU')} ₽)
                    </span>
                  </span>
                </div>
                <div className="neu-inset rounded-full h-2 overflow-hidden p-0.5 bg-[#E3E8EF]">
                  <div
                    style={{ width: `${cat.share}%` }}
                    className={`${cat.color} h-full rounded-full transition-all duration-500`}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* SECTION 6: PROMO CODE PERFORMANCE & CAMPAIGNS               */}
      {/* ============================================================ */}
      <div className="neu-inset rounded-2xl p-4 space-y-3.5 bg-[#E3E8EF] border border-white/60">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#BAC5D5]/40 pb-2.5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl neu-inset flex items-center justify-center text-[#4B59BB] shrink-0 bg-[#E3E8EF]">
              <Tag className="w-3.5 h-3.5" />
            </div>
            <div>
              <h4 className="text-xs font-black uppercase text-[#2D3A4E] tracking-wider">
                Эффективность маркетинговых промокодов
              </h4>
              <p className="text-[11px] font-medium text-[#4E5C70]">
                Вклад промо-акций в общий объём продаж за {periodLabelMap[period].toLowerCase()}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] font-bold">
            <div className="neu-inset px-2.5 py-1 rounded-xl bg-[#E3E8EF] text-[#2D3A4E] flex items-center gap-1.5">
              <span className="text-[#4E5C70]">Выручка:</span>
              <span className="font-black text-[#4B59BB]">{totalPromoRevenue.toLocaleString('ru-RU')} ₽</span>
            </div>
            <div className="neu-inset px-2.5 py-1 rounded-xl bg-[#E3E8EF] text-[#2D3A4E] flex items-center gap-1.5">
              <span className="text-[#4E5C70]">Скидки:</span>
              <span className="font-black text-success">{totalPromoDiscounts.toLocaleString('ru-RU')} ₽</span>
            </div>
          </div>
        </div>

        {/* Promo Performance Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {promoPerformanceList.map((promo, idx) => (
            <div
              key={idx}
              className="neu-inset rounded-2xl p-3 bg-[#E3E8EF] border border-transparent space-y-2 relative overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="neu-inset px-2 py-0.5 rounded-lg bg-[#E3E8EF] font-mono text-[11px] font-black text-[#2D3A4E]">
                    {promo.code}
                  </span>
                  <span className="neu-inset px-1.5 py-0.5 rounded-md text-[11px] font-extrabold text-[#4B59BB] bg-[#E3E8EF]">
                    {promo.discount}
                  </span>
                </div>
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                    promo.status === 'active'
                      ? 'neu-inset text-success bg-success-soft'
                      : 'neu-inset text-[#4E5C70] bg-gray-500/10'
                  }`}
                >
                  {promo.status === 'active' ? 'Активен' : 'Пауза'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1 text-center pt-1 border-t border-[#BAC5D5]/30">
                <div>
                  <span className="text-[11px] text-[#4E5C70] block">Заказов</span>
                  <span className="text-xs font-extrabold text-[#2D3A4E]">{promo.ordersCount}</span>
                </div>
                <div>
                  <span className="text-[11px] text-[#4E5C70] block">Выручка</span>
                  <span className="text-xs font-extrabold text-[#4B59BB]">
                    {Math.round(promo.revenue / 1000)}k ₽
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-[#4E5C70] block">Конверсия</span>
                  <span className="text-xs font-extrabold text-success">{promo.conversion}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ============================================================ */}
      {/* SECTION 7: REPORTS & FIRESTORE SYNC FOOTER BAR               */}
      {/* ============================================================ */}
      <div className="neu-inset rounded-2xl p-4 space-y-3 bg-[#E3E8EF] border border-white/60">
        <div className="flex items-center justify-between text-xs font-bold text-[#4E5C70] px-0.5 flex-wrap gap-2">
          <span className="flex items-center gap-1.5 text-[#2D3A4E]">
            <FileText className="w-4 h-4 text-[#4B59BB]" />
            Генерация официальной финансовой отчётности
          </span>
          <span className="text-[11px] font-extrabold text-success neu-inset px-2.5 py-0.5 rounded-full bg-[#E3E8EF] flex items-center gap-1 border border-success/20">
            <CheckCircle2 className="w-3.5 h-3.5 text-success" />
            База Firestore синхронизирована
          </span>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
          <button
            onClick={handleExportPDF}
            disabled={isExportingPDF}
            className="flex-1 py-3 px-4 neu-button-accent rounded-2xl font-black text-xs text-white flex items-center justify-center gap-2 hover:opacity-95 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
          >
            {isExportingPDF ? (
              <>
                <Loader2 className="w-4 h-4 text-white animate-spin shrink-0" />
                <span>Генерация PDF документа...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4 text-white shrink-0" />
                <span>Скачать финансовый отчёт (PDF)</span>
              </>
            )}
          </button>

          <button
            onClick={() => setIsConfirmDeleteModalOpen(true)}
            className="py-3 px-4 neu-button-danger rounded-2xl font-black text-xs active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2 shrink-0"
            title="Удалить все статистические данные и заказы из базы данных Firestore"
          >
            <Trash2 className="w-4 h-4" />
            <span className="hidden sm:inline">Очистить статистику базы</span>
            <span className="sm:hidden">Очистить</span>
          </button>

          <button
            onClick={handleRefreshData}
            disabled={isRefreshing}
            className="w-12 h-12 shrink-0 neu-button rounded-2xl text-[#4E5C70] hover:text-[#4B59BB] flex items-center justify-center transition-all hover:scale-105 active:scale-95 cursor-pointer disabled:opacity-50"
            title="Обновить аналитику из Firestore"
            aria-label="Обновить аналитику из Firestore"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#4B59BB]' : ''}`} />
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* CONFIRMATION MODAL: DELETE ALL STATISTICS FROM FIRESTORE     */}
      {/* ============================================================ */}
      {isConfirmDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs animate-in fade-in duration-200">
          <div
            className="relative w-full max-w-md neu-modal rounded-3xl p-5 sm:p-6 space-y-4 bg-[#E3E8EF] border border-white/80 animate-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#BAC5D5]/50 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl neu-inset flex items-center justify-center text-danger bg-[#E3E8EF]">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-[#2D3A4E]">
                    Очистка статистики базы
                  </h3>
                  <p className="text-[11px] text-[#4E5C70]">
                    Полное удаление данных из Firestore
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => !isDeletingStats && setIsConfirmDeleteModalOpen(false)}
                disabled={isDeletingStats}
                className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Warning Message Content */}
            <div className="neu-inset rounded-2xl p-3.5 bg-[#E3E8EF] space-y-2 border border-danger/40">
              <div className="flex items-start gap-2 text-danger">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <p className="text-xs font-bold leading-relaxed">
                  Вы собираетесь полностью удалить все заказы и статистику продаж ({realOrdersCount} записей) из базы данных Firestore.
                </p>
              </div>
              <p className="text-[11px] text-[#4E5C70] leading-normal pl-6">
                После подтверждения графики, выручка и показатели среднего чека будут сброшены до реальных нулевых значений. Новые заказы от клиентов сразу же сформируют новую чистую статистику.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setIsConfirmDeleteModalOpen(false)}
                disabled={isDeletingStats}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-extrabold neu-button text-[#4E5C70] hover:text-[#2D3A4E] active:scale-95 transition-all cursor-pointer disabled:opacity-50"
              >
                Отмена
              </button>

              <button
                type="button"
                onClick={handleDeleteAllStats}
                disabled={isDeletingStats}
                className="neu-button-danger flex-1 py-2.5 px-4 rounded-xl text-xs font-black active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {isDeletingStats ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Удаление...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Удалить всё</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
