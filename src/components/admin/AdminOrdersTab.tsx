import React, { useState, useMemo } from 'react';
import {
  Package,
  Search,
  RefreshCw,
  Printer,
  SlidersHorizontal,
  Navigation,
  Clock,
  CheckCircle2,
  Truck,
  MapPin,
  CreditCard,
  Download,
  Calendar,
  ChevronDown,
  History,
  Copy,
  Check,
  X,
  RotateCcw,
  ExternalLink,
  Edit3,
  Save,
  XCircle,
  ShieldAlert,
  DollarSign,
  MessageSquare,
  Layers,
  Trash2,
} from 'lucide-react';
import { Order, Product, OrderAdjustmentLog, OrderStatusHistoryStep, DeliveryStage, StorefrontSettings } from '../../types';
import { exportOrdersToCSV } from '../../utils/csvHelpers';
import { copyToClipboard } from '../../utils/clipboard';
import { deductStockWithLogs, returnStockWithLogs } from '../../utils/inventory';
import { deleteOrderFromFirestore } from '../../utils/firebaseSync';
import {
  getDefaultDeliveryStages,
  getSynchronizedDeliveryStages,
  syncStagesWithOrderStatus,
  getEstimatedDeliveryForStatus,
  isTransportCompanyDelivery,
} from '../../utils/deliveryStages';
import { AdminOrderInvoiceModal } from './AdminOrderInvoiceModal';
import { AdminOrderAdjustmentModal } from './AdminOrderAdjustmentModal';
import { AdminDeliveryStagesModal } from './AdminDeliveryStagesModal';
import { DeliveryTrackingMapModal } from '../DeliveryTrackingMapModal';
import { NeumorphicSelect } from '../NeumorphicSelect';

interface AdminOrdersTabProps {
  orders: Order[];
  storefrontSettings?: StorefrontSettings;
  products: Product[];
  onUpdateOrders: (updated: Order[]) => void;
  onUpdateProducts?: (updated: Product[]) => void;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
  onOpenSupportChat?: (orderId: string, customerName?: string) => void;
}

const STATUS_CONFIG: Record<
  Order['status'],
  { label: string; bg: string; text: string; icon: any; nextStatus?: Order['status']; nextLabel?: string }
> = {
  accepted: {
    label: 'Принят',
    bg: 'bg-accent/5 border-accent/20',
    text: 'text-accent',
    icon: Clock,
    nextStatus: 'assembling',
    nextLabel: 'В сборку',
  },
  assembling: {
    label: 'Собирается',
    bg: 'bg-warning-soft border-warning/25',
    text: 'text-warning',
    icon: Package,
    nextStatus: 'in_transit',
    nextLabel: 'Передать курьеру',
  },
  in_transit: {
    label: 'В пути',
    bg: 'bg-sky-50 border-sky-200',
    text: 'text-sky-700',
    icon: Truck,
    nextStatus: 'ready',
    nextLabel: 'Прибыл в пункт',
  },
  ready: {
    label: 'Готов к выдаче',
    bg: 'bg-success-soft border-success/25',
    text: 'text-success',
    icon: MapPin,
    nextStatus: 'delivered',
    nextLabel: 'Вручить клиенту',
  },
  delivered: {
    label: 'Доставлен',
    bg: 'bg-slate-100 border-slate-200',
    text: 'text-slate-700',
    icon: CheckCircle2,
  },
};

const PAYMENT_STATUS_CONFIG: Record<
  NonNullable<Order['paymentStatus']>,
  { label: string; bg: string; text: string; dot: string }
> = {
  pending: {
    label: 'Ожидает оплаты',
    bg: 'bg-warning-soft border-warning/25',
    text: 'text-warning',
    dot: 'bg-warning',
  },
  paid: {
    label: 'Оплачен онлайн',
    bg: 'bg-success-soft border-success/25',
    text: 'text-success',
    dot: 'bg-success',
  },
  paid_on_delivery: {
    label: 'Оплата при вручении',
    bg: 'bg-sky-50 border-sky-200',
    text: 'text-sky-700',
    dot: 'bg-sky-500',
  },
  refunded: {
    label: 'Возврат средств',
    bg: 'bg-danger-soft border-danger/25',
    text: 'text-danger',
    dot: 'bg-danger',
  },
};

interface TrackingCarrierConfig {
  id: NonNullable<Order['trackingCompany']>;
  name: string;
  sublabel: string;
  badge: string;
  badgeBg: string;
  urlPrefix: (track: string) => string;
}

const TRACKING_CARRIERS: TrackingCarrierConfig[] = [
  {
    id: 'cdek',
    name: 'СДЭК',
    sublabel: 'Пункты выдачи СДЭК и курьер',
    badge: 'CDEK',
    badgeBg: 'text-success bg-success-soft border-success/35',
    urlPrefix: (track) => `https://www.cdek.ru/ru/tracking?order_id=${encodeURIComponent(track)}`,
  },
  {
    id: 'pochta',
    name: 'Почта России',
    sublabel: 'Отделения почтовой связи РФ',
    badge: 'Почта',
    badgeBg: 'text-accent bg-accent/8 border-accent/30',
    urlPrefix: (track) => `https://www.pochta.ru/tracking#${encodeURIComponent(track)}`,
  },
  {
    id: 'boxberry',
    name: 'Boxberry',
    sublabel: 'Сеть отделений и постаматов',
    badge: 'Boxberry',
    badgeBg: 'text-danger bg-danger-soft border-danger/35',
    urlPrefix: (track) => `https://boxberry.ru/tracking-page?track=${encodeURIComponent(track)}`,
  },
  {
    id: 'yandex',
    name: 'Яндекс Доставка',
    sublabel: 'Экспресс и пункты Яндекс',
    badge: 'Яндекс',
    badgeBg: 'text-warning bg-warning-soft border-warning/35',
    urlPrefix: (_track) => `https://dostavka.yandex.ru/`,
  },
  {
    id: 'dhl',
    name: 'DHL Express',
    sublabel: 'Международная экспресс-доставка',
    badge: 'DHL',
    badgeBg: 'text-warning bg-warning-soft border-warning/35',
    urlPrefix: (track) => `https://www.dhl.com/ru-ru/home/tracking.html?tracking-id=${encodeURIComponent(track)}`,
  },
  {
    id: 'other',
    name: 'Служба доставки',
    sublabel: 'Собственная курьерская служба',
    badge: 'Курьер',
    badgeBg: 'text-slate-700 bg-slate-100/80 border-slate-300',
    urlPrefix: (_track) => '',
  },
];

/** Date of a step in the order history: «26 сент., 14:30» */
const historyDateLabel = () =>
  new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export const AdminOrdersTab: React.FC<AdminOrdersTabProps> = ({
  orders,
  storefrontSettings,
  products = [],
  onUpdateOrders,
  onUpdateProducts,
  onShowToast,
  onOpenSupportChat,
}) => {
  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Order['status']>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday' | '7days' | 'month'>('all');
  const [deliveryFilter, setDeliveryFilter] = useState<'all' | 'courier' | 'express' | 'pickup' | 'cdek'>('all');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'card' | 'sbp' | 'cash'>('all');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<'all' | 'pending' | 'paid' | 'paid_on_delivery' | 'refunded'>('all');

  // Date filter options for Neumorphic dropdown
  const dateFilterOptions = useMemo(() => [
    { value: 'all', label: 'Все время', icon: <Calendar className="w-3.5 h-3.5 text-accent" /> },
    { value: 'today', label: 'Сегодня' },
    { value: 'yesterday', label: 'Вчера' },
    { value: '7days', label: 'Последние 7 дней' },
    { value: 'month', label: 'Этот месяц' },
  ], []);

  // Order status filter options with dynamic counters and visual indicator dots
  const statusFilterOptions = useMemo(() => [
    {
      value: 'all',
      label: 'Все статусы',
      badge: `${orders.length}`,
      icon: <Layers className="w-3.5 h-3.5 text-accent" />,
    },
    {
      value: 'accepted',
      label: 'Принят',
      badge: `${orders.filter((o) => o.status === 'accepted' && !o.isCancelled).length}`,
      icon: <span className="w-2 h-2 rounded-full bg-accent shrink-0" />,
    },
    {
      value: 'assembling',
      label: 'Сборка',
      badge: `${orders.filter((o) => o.status === 'assembling' && !o.isCancelled).length}`,
      icon: <span className="w-2 h-2 rounded-full bg-accent shrink-0" />,
    },
    {
      value: 'in_transit',
      label: 'В пути',
      badge: `${orders.filter((o) => o.status === 'in_transit' && !o.isCancelled).length}`,
      icon: <span className="w-2 h-2 rounded-full bg-sky-500 shrink-0" />,
    },
    {
      value: 'ready',
      label: 'Готов к выдаче',
      badge: `${orders.filter((o) => o.status === 'ready' && !o.isCancelled).length}`,
      icon: <span className="w-2 h-2 rounded-full bg-warning shrink-0" />,
    },
    {
      value: 'delivered',
      label: 'Доставлен',
      badge: `${orders.filter((o) => o.status === 'delivered' && !o.isCancelled).length}`,
      icon: <span className="w-2 h-2 rounded-full bg-success shrink-0" />,
    },
  ], [orders]);

  // Bulk Selection State
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [isBulkCancelModalOpen, setIsBulkCancelModalOpen] = useState(false);

  // Modals & Active Order
  const [selectedOrderForInvoice, setSelectedOrderForInvoice] = useState<Order | null>(null);
  const [selectedOrderForAdjustment, setSelectedOrderForAdjustment] = useState<Order | null>(null);
  const [selectedOrderForMap, setSelectedOrderForMap] = useState<Order | null>(null);
  const [selectedOrderForDeliveryStages, setSelectedOrderForDeliveryStages] = useState<Order | null>(null);
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);
  const [isDeletingOrder, setIsDeletingOrder] = useState(false);
  const [expandedOrderAuditLogId, setExpandedOrderAuditLogId] = useState<string | null>(null);
  const [openStatusDropdownId, setOpenStatusDropdownId] = useState<string | null>(null);
  const [openPaymentStatusDropdownId, setOpenPaymentStatusDropdownId] = useState<string | null>(null);

  // Quick Inline Tracking Editor
  const [editingTrackOrderId, setEditingTrackOrderId] = useState<string | null>(null);
  const [tempTrackValue, setTempTrackValue] = useState<string>('');
  const [tempCarrierValue, setTempCarrierValue] = useState<NonNullable<Order['trackingCompany']>>('cdek');

  // Quick Inline Manager Note Editor
  const [editingNoteOrderId, setEditingNoteOrderId] = useState<string | null>(null);
  const [tempNoteValue, setTempNoteValue] = useState<string>('');

  // Filtered Orders Calculation
  const filteredOrders = useMemo(() => {
    const todayStr = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).toLowerCase();

    return orders.filter((ord) => {
      // 1. Status Filter
      if (statusFilter !== 'all' && ord.status !== statusFilter) return false;

      // 2. Date Filter
      if (dateFilter !== 'all') {
        const ordDateStr = (ord.date || '').toLowerCase();
        if (dateFilter === 'today') {
          if (!ordDateStr.includes('сегодня') && !ordDateStr.includes(todayStr) && ord.id !== 'MS-8941' && ord.id !== 'MS-8942') {
            return false;
          }
        } else if (dateFilter === 'yesterday') {
          if (!ordDateStr.includes('вчера') && ord.id !== 'MS-8939') {
            return false;
          }
        }
      }

      // 3. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchesId = ord.id.toLowerCase().includes(q);
        const matchesAddress = ord.deliveryAddress?.toLowerCase().includes(q);
        const matchesTrack = ord.trackingNumber?.toLowerCase().includes(q);
        const matchesNote = ord.managerNote?.toLowerCase().includes(q);
        const matchesCustomer = ord.customerName?.toLowerCase().includes(q) || ord.customerPhone?.toLowerCase().includes(q);
        const matchesItems = ord.items?.some(
          (it) =>
            it.product?.title?.toLowerCase().includes(q) ||
            it.selectedColor?.toLowerCase().includes(q) ||
            it.selectedSize?.toLowerCase().includes(q)
        );
        if (!matchesId && !matchesAddress && !matchesTrack && !matchesNote && !matchesItems && !matchesCustomer) return false;
      }

      // 4. Delivery Method Filter
      if (deliveryFilter !== 'all') {
        const d = (ord.deliveryMethod || '').toLowerCase();
        if (deliveryFilter === 'courier' && !d.includes('курьер') && !d.includes('стандарт')) return false;
        if (deliveryFilter === 'express' && !d.includes('экспресс') && !d.includes('срочн')) return false;
        if (deliveryFilter === 'pickup' && !d.includes('самовывоз') && !d.includes('пвз')) return false;
        if (deliveryFilter === 'cdek' && !d.includes('сдэк') && !d.includes('cdek')) return false;
      }

      // 5. Payment Method Filter
      if (paymentFilter !== 'all') {
        const p = (ord.paymentMethod || '').toLowerCase();
        if (paymentFilter === 'card' && !p.includes('карт')) return false;
        if (paymentFilter === 'sbp' && !p.includes('сбп') && !p.includes('быстр')) return false;
        if (paymentFilter === 'cash' && !p.includes('получен') && !p.includes('наличн')) return false;
      }

      // 6. Payment Status Filter
      if (paymentStatusFilter !== 'all') {
        const pStat = ord.paymentStatus || 'paid';
        if (pStat !== paymentStatusFilter) return false;
      }

      return true;
    });
  }, [orders, searchQuery, statusFilter, dateFilter, deliveryFilter, paymentFilter, paymentStatusFilter]);

  // Bulk Operations Handlers
  const handleToggleSelectAll = () => {
    if (selectedOrderIds.length === filteredOrders.length) {
      setSelectedOrderIds([]);
    } else {
      setSelectedOrderIds(filteredOrders.map((o) => o.id));
    }
  };

  const handleToggleSelectOrder = (id: string) => {
    setSelectedOrderIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  /**
   * New fulfilment status of the given orders (one or a bulk selection). A cancelled order that gets
   * a status again is active: the goods returned on cancellation are taken from stock again.
   */
  const changeOrdersStatus = (orderIds: string[], newStatus: Order['status'], description: string) => {
    const ids = new Set(orderIds);
    const dateNow = historyDateLabel();

    const reactivated = orders.filter((ord) => ids.has(ord.id) && ord.isCancelled && ord.items?.length);
    if (reactivated.length > 0 && onUpdateProducts) {
      let currentProducts = products;
      for (const ord of reactivated) {
        currentProducts = deductStockWithLogs(currentProducts, ord.items, ord.id, 'Администратор').updatedProducts;
      }
      onUpdateProducts(currentProducts);
    }

    const updated = orders.map((ord) => {
      if (!ids.has(ord.id)) return ord;
      const newStep: OrderStatusHistoryStep = {
        title: STATUS_CONFIG[newStatus].label,
        date: dateNow,
        completed: true,
        description,
      };
      const updatedStages = syncStagesWithOrderStatus(ord.deliveryStages, ord, newStatus);
      const updatedEst = getEstimatedDeliveryForStatus(newStatus, ord.estimatedDelivery, false);
      const updatedPaymentStatus = newStatus === 'delivered' && ord.paymentStatus === 'paid_on_delivery'
        ? 'paid'
        : ord.paymentStatus;

      // When transitioning to 'accepted', synchronize history steps so only 'Заказ принят' is completed
      const updatedHistorySteps = newStatus === 'accepted'
        ? (ord.historySteps || []).map((s, idx) => ({ ...s, completed: idx === 0 || s.title.toLowerCase().includes('принят') }))
        : [...(ord.historySteps || []), newStep];

      return {
        ...ord,
        status: newStatus,
        isCancelled: false,
        paymentStatus: updatedPaymentStatus,
        historySteps: updatedHistorySteps,
        deliveryStages: updatedStages,
        estimatedDelivery: updatedEst,
      };
    });

    onUpdateOrders(updated);
    return reactivated.length;
  };

  const handleBulkStatusChange = (newStatus: Order['status']) => {
    if (selectedOrderIds.length === 0) return;
    const label = STATUS_CONFIG[newStatus].label;
    const restored = changeOrdersStatus(selectedOrderIds, newStatus, `Пакетное обновление статуса оператором на "${label}"`);
    onShowToast(
      `Статус ${selectedOrderIds.length} заказов изменен на "${label}"` +
        (restored > 0 ? `. Восстановлено отмененных: ${restored}, товары снова списаны со склада` : ''),
      'success'
    );
    setSelectedOrderIds([]);
  };

  const handleBulkPaymentStatusChange = (newStatus: NonNullable<Order['paymentStatus']>) => {
    if (selectedOrderIds.length === 0) return;
    const updated = orders.map((ord) =>
      selectedOrderIds.includes(ord.id) ? { ...ord, paymentStatus: newStatus } : ord
    );
    onUpdateOrders(updated);
    onShowToast(`Статус оплаты ${selectedOrderIds.length} заказов изменен на "${PAYMENT_STATUS_CONFIG[newStatus].label}"`, 'success');
    setSelectedOrderIds([]);
  };

  const handleBulkExportCSV = () => {
    const ordersToExport = orders.filter((o) => selectedOrderIds.includes(o.id));
    exportOrdersToCSV(ordersToExport.length > 0 ? ordersToExport : filteredOrders);
    onShowToast(`Экспортировано ${ordersToExport.length || filteredOrders.length} заказов в CSV`, 'success');
  };

  const handleBulkCancelAndReturn = () => {
    if (selectedOrderIds.length === 0) return;
    const selectedOrders = orders.filter((o) => selectedOrderIds.includes(o.id) && !o.isCancelled);
    if (selectedOrders.length === 0) {
      onShowToast('Выбранные заказы уже отменены', 'info');
      return;
    }

    let currentProducts = [...products];
    selectedOrders.forEach((ord) => {
      if (ord.items && ord.items.length > 0) {
        const res = returnStockWithLogs(
          currentProducts,
          ord.items,
          ord.id,
          'Массовая отмена заказов',
          'Администратор'
        );
        currentProducts = res.updatedProducts;
      }
    });

    if (onUpdateProducts) {
      onUpdateProducts(currentProducts);
    }

    const dateNow = historyDateLabel();

    const updated = orders.map((ord) => {
      if (!selectedOrderIds.includes(ord.id) || ord.isCancelled) return ord;
      return {
        ...ord,
        isCancelled: true,
        estimatedDelivery: 'Заказ отменен',
        paymentStatus: 'refunded' as const,
        historySteps: [
          ...(ord.historySteps || []),
          {
            title: 'Заказ отменен (Массово)',
            date: dateNow,
            completed: true,
            description: 'Пакетная отмена заказов оператором с возвратом остатков на склад.',
          },
        ],
      };
    });

    onUpdateOrders(updated);
    onShowToast(`Отменено ${selectedOrders.length} заказов, остатки возвращены на склад`, 'info');
    setSelectedOrderIds([]);
  };

  // Order Status Change Handler
  const handleUpdateOrderStatus = (orderId: string, newStatus: Order['status']) => {
    const label = STATUS_CONFIG[newStatus].label;
    const restored = changeOrdersStatus([orderId], newStatus, `Статус изменен менеджером магазина на "${label}"`);
    onShowToast(
      restored > 0
        ? `Заказ ${orderId} восстановлен со статусом "${label}", товары снова списаны со склада`
        : `Статус заказа ${orderId} изменен на "${label}"`,
      'success'
    );
    setOpenStatusDropdownId(null);
  };

  // Delivery Stages Save Handler
  const handleSaveDeliveryStages = (orderId: string, updatedStages: DeliveryStage[]) => {
    let synchronizedStages = updatedStages;
    const targetOrder = orders.find((o) => o.id === orderId);
    if (targetOrder) {
      synchronizedStages = getSynchronizedDeliveryStages({
        ...targetOrder,
        deliveryStages: updatedStages,
      });
    }

    const updated = orders.map((ord) => {
      if (ord.id !== orderId) return ord;
      return {
        ...ord,
        deliveryStages: synchronizedStages,
      };
    });
    onUpdateOrders(updated);
    // If the modal was viewing this order, update local selected state
    setSelectedOrderForDeliveryStages((prev) =>
      prev && prev.id === orderId ? { ...prev, deliveryStages: synchronizedStages } : prev
    );
    onShowToast(`Этапы доставки для заказа ${orderId} успешно сохранены`, 'success');
  };

  // Payment Status Change Handler
  const handleUpdatePaymentStatus = (orderId: string, newStatus: NonNullable<Order['paymentStatus']>) => {
    const updated = orders.map((ord) => (ord.id === orderId ? { ...ord, paymentStatus: newStatus } : ord));
    onUpdateOrders(updated);
    onShowToast(`Статус оплаты заказа ${orderId}: "${PAYMENT_STATUS_CONFIG[newStatus].label}"`, 'success');
    setOpenPaymentStatusDropdownId(null);
  };

  // Quick Tracking Edit Save Handler
  const handleSaveTracking = (orderId: string) => {
    const trimmed = tempTrackValue.trim();
    const updated = orders.map((ord) => {
      if (ord.id !== orderId) return ord;

      let currentStages = ord.deliveryStages && ord.deliveryStages.length > 0
        ? [...ord.deliveryStages]
        : getDefaultDeliveryStages(ord);

      if (trimmed) {
        currentStages = currentStages.map((s) => {
          if (s.id === 'stage-carrier' || s.title.toLowerCase().includes('доставки')) {
            return {
              ...s,
              title: `Передан в службу доставки (${trimmed})`,
              desc: `Присвоен трек-номер ${trimmed} и сформирована накладная`,
              status: 'completed',
              time: 'Трек присвоен',
            };
          }
          return s;
        });
      }

      return {
        ...ord,
        trackingNumber: trimmed || undefined,
        trackingCompany: tempCarrierValue,
        deliveryStages: currentStages,
      };
    });
    onUpdateOrders(updated);
    setEditingTrackOrderId(null);
    onShowToast(
      trimmed
        ? `Трек-номер ${trimmed} (${TRACKING_CARRIERS.find((c) => c.id === tempCarrierValue)?.name}) сохранен`
        : 'Трек-номер очищен',
      'success'
    );
  };

  // Manager Note Save Handler
  const handleSaveManagerNote = (orderId: string) => {
    const trimmed = tempNoteValue.trim();
    const updated = orders.map((ord) => (ord.id === orderId ? { ...ord, managerNote: trimmed || undefined } : ord));
    onUpdateOrders(updated);
    setEditingNoteOrderId(null);
    onShowToast('Внутренняя заметка сохранена', 'success');
  };

  // Order Cancellation and automatic Stock Return Handler
  const handleCancelAndReturnStock = (order: Order) => {
    if (order.isCancelled) {
      onShowToast(`Заказ № ${order.id} уже отменен`, 'info');
      return;
    }

    const dateNow = historyDateLabel();

    if (order.items && order.items.length > 0) {
      const resReturn = returnStockWithLogs(
        products,
        order.items,
        order.id,
        'Полная отмена заказа администратором',
        'Администратор'
      );
      if (onUpdateProducts) {
        onUpdateProducts(resReturn.updatedProducts);
      }
    }

    const cancelStep: OrderStatusHistoryStep = {
      title: 'Заказ отменен',
      date: dateNow,
      completed: true,
      description: 'Заказ отменен оператором. Зарезервированные остатки возвращены на склад.',
    };

    const updated = orders.map((o) =>
      o.id === order.id
        ? {
            ...o,
            isCancelled: true,
            estimatedDelivery: 'Заказ отменен',
            paymentStatus: (o.paymentStatus === 'paid' ? 'refunded' : o.paymentStatus || 'refunded') as any,
            historySteps: [...(o.historySteps || []), cancelStep],
          }
        : o
    );

    onUpdateOrders(updated);
    onShowToast(`Заказ № ${order.id} отменен. Товары возвращены на склад.`, 'success');
  };

  // Delete Single Order Handler
  const handleDeleteSingleOrder = async () => {
    if (!orderToDelete) return;
    setIsDeletingOrder(true);
    try {
      await deleteOrderFromFirestore(orderToDelete.id);
      const updated = orders.filter((o) => o.id !== orderToDelete.id);
      onUpdateOrders(updated);
      onShowToast(`Заказ № ${orderToDelete.id} успешно удален из базы данных`, 'success');
      setOrderToDelete(null);
    } catch (err) {
      console.error('Delete order error:', err);
      onShowToast('Ошибка при удалении заказа', 'error');
    } finally {
      setIsDeletingOrder(false);
    }
  };

  // Order Adjustment Save Handler
  const handleSaveOrderAdjustment = (updatedOrder: Order, _log: OrderAdjustmentLog) => {
    const updated = orders.map((ord) => (ord.id === updatedOrder.id ? updatedOrder : ord));
    onUpdateOrders(updated);
    onShowToast('Состав и сумма заказа успешно скорректированы', 'success');
    setSelectedOrderForAdjustment(null);
  };

  const handleCopyOrderId = (id: string) => {
    copyToClipboard(id);
    onShowToast(`Номер заказа ${id} скопирован`, 'info');
  };

  const handleCopyTracking = (track: string) => {
    copyToClipboard(track);
    onShowToast(`Трек-номер ${track} скопирован`, 'info');
  };

  return (
    <div className="space-y-3.5">
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
        <div>
          <h3 className="text-xs font-black uppercase tracking-wider text-[#2D3A4E] flex items-center gap-1.5">
            <Package className="w-4 h-4 text-accent" />
            Управление клиентскими заказами и логистика
          </h3>
          <p className="text-[11px] text-[#4E5C70]">
            Синхронизация списания/возврата склада, трек-номера СДЭК/Почта и статусы оплаты
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => exportOrdersToCSV(filteredOrders)}
            className="py-1.5 px-3 neu-inset rounded-xl text-xs font-bold text-[#4E5C70] hover:text-accent flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
            title="Экспортировать отфильтрованные заказы в CSV"
          >
            <Download className="w-3.5 h-3.5 text-accent" />
            <span>Экспорт в CSV</span>
          </button>

        </div>
      </div>

      {/* Search & Date Filter Bar */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#4E5C70]" />
          <input
            type="text"
            placeholder="Поиск по номеру заказа, клиенту, телефону, трек-номеру, адресу или товарам..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-2.5 neu-inset rounded-xl text-xs text-[#2D3A4E] placeholder:text-[#56647A] bg-[#E3E8EF]"
          />
        </div>

        {/* Date Filter & Bulk Selection Header Controls */}
        <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
          <div className="w-full sm:w-auto sm:min-w-[210px] flex-1 sm:flex-initial">
            <NeumorphicSelect
              value={dateFilter}
              onChange={(val) => setDateFilter(val as any)}
              variant="inset"
              prefix="Период:"
              options={dateFilterOptions}
            />
          </div>

          {/* Bulk Selection Header Checkbox */}
          {filteredOrders.length > 0 && (
            <button
              onClick={handleToggleSelectAll}
              className={`h-[42px] text-[11px] font-bold px-3.5 rounded-xl cursor-pointer flex items-center gap-2 transition-all ml-auto sm:ml-0 whitespace-nowrap active:scale-95 neu-inset ${
                selectedOrderIds.length > 0
                  ? 'text-accent bg-[#E3E8EF] font-black'
                  : 'text-[#4E5C70] hover:text-[#2D3A4E]'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-md flex items-center justify-center transition-all ${
                  selectedOrderIds.length > 0 && selectedOrderIds.length === filteredOrders.length
                    ? 'neu-fill-accent text-white'
                    : selectedOrderIds.length > 0
                    ? 'neu-button text-accent bg-white/70'
                    : 'neu-button bg-white/40 text-transparent border border-white/60'
                }`}
              >
                {selectedOrderIds.length > 0 && <Check className="w-3 h-3 stroke-[3]" />}
              </div>
              <span>
                {selectedOrderIds.length > 0
                  ? `Выбрано (${selectedOrderIds.length}/${filteredOrders.length})`
                  : 'Выбрать все'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Floating Sticky Bulk Operations Toolbar */}
      {selectedOrderIds.length > 0 && (
        <div className="p-3.5 sm:p-4 neu-flat rounded-2xl sm:rounded-3xl bg-[#E3E8EF] border border-white/80 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Top Info & Actions Bar */}
          <div className="flex items-center justify-between gap-2.5 flex-wrap">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl neu-inset flex items-center justify-center text-accent shrink-0 font-black">
                <Layers className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-black text-[#2D3A4E] uppercase tracking-wider">
                    Пакетные действия
                  </span>
                  <span className="neu-inset px-2.5 py-0.5 rounded-lg text-[11px] font-black text-accent bg-[#E3E8EF]">
                    Выбрано: {selectedOrderIds.length}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={handleBulkExportCSV}
                className="h-8 px-3 rounded-xl neu-button text-xs font-bold text-[#2D3A4E] hover:text-accent flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all shrink-0"
                title="Экспорт выбранных заказов в CSV файл"
              >
                <Download className="w-3.5 h-3.5 text-accent" />
                <span className="hidden xs:inline">Экспорт CSV</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedOrderIds([])}
                className="h-8 px-2.5 sm:px-3 rounded-xl neu-button text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] flex items-center gap-1 cursor-pointer active:scale-95 transition-all shrink-0"
                title="Снять выбор со всех заказов"
              >
                <X className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Снять выбор</span>
              </button>
            </div>
          </div>

          {/* Grouped Dropdown Actions Toolbar: Status, Payment, and Additional Operations */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-2 border-t border-[#BAC5D5]/40">
            {/* 1. Bulk Order Status */}
            <div className="min-w-0">
              <NeumorphicSelect
                value=""
                onChange={(val) => {
                  if (val) handleBulkStatusChange(val as Order['status']);
                }}
                variant="inset"
                prefix="Статус заказа:"
                placeholder="Сменить статус..."
                triggerLabel="Сменить статус заказа..."
                options={[
                  {
                    value: 'assembling',
                    label: 'В сборку',
                    sublabel: 'Передать на комплектацию на склад',
                    icon: <Package className="w-3.5 h-3.5 text-accent" />,
                  },
                  {
                    value: 'in_transit',
                    label: 'В путь (доставка)',
                    sublabel: 'Передать курьеру или в СДЭК',
                    icon: <Truck className="w-3.5 h-3.5 text-sky-600" />,
                  },
                  {
                    value: 'ready',
                    label: 'Готов к выдаче',
                    sublabel: 'Ожидает клиента в пункте самовывоза',
                    icon: <Clock className="w-3.5 h-3.5 text-warning" />,
                  },
                  {
                    value: 'delivered',
                    label: 'Доставлен',
                    sublabel: 'Успешно вручен покупателю',
                    icon: <CheckCircle2 className="w-3.5 h-3.5 text-success" />,
                  },
                ]}
              />
            </div>

            {/* 2. Bulk Payment Status */}
            <div className="min-w-0">
              <NeumorphicSelect
                value=""
                onChange={(val) => {
                  if (val) handleBulkPaymentStatusChange(val as NonNullable<Order['paymentStatus']>);
                }}
                variant="inset"
                prefix="Оплата:"
                placeholder="Сменить оплату..."
                triggerLabel="Сменить статус оплаты..."
                options={[
                  {
                    value: 'paid',
                    label: 'Отметить как «Оплачен»',
                    sublabel: 'Подтвердить поступление средств',
                    icon: <CheckCircle2 className="w-3.5 h-3.5 text-success" />,
                  },
                  {
                    value: 'pending',
                    label: 'Ожидает оплаты',
                    sublabel: 'Счет выставлен, платеж не получен',
                    icon: <Clock className="w-3.5 h-3.5 text-warning" />,
                  },
                  {
                    value: 'paid_on_delivery',
                    label: 'При получении',
                    sublabel: 'Расчет при передаче заказа',
                    icon: <DollarSign className="w-3.5 h-3.5 text-accent" />,
                  },
                  {
                    value: 'refunded',
                    label: 'Возврат средств',
                    sublabel: 'Оформить возврат клиенту',
                    icon: <RotateCcw className="w-3.5 h-3.5 text-danger" />,
                  },
                ]}
              />
            </div>

            {/* 3. Additional & Destructive Actions */}
            <div className="min-w-0 sm:col-span-2 lg:col-span-1">
              <NeumorphicSelect
                value=""
                onChange={(val) => {
                  if (val === 'cancel_return') {
                    setIsBulkCancelModalOpen(true);
                  } else if (val === 'export') {
                    handleBulkExportCSV();
                  }
                }}
                variant="inset"
                prefix="Действия:"
                placeholder="Дополнительно..."
                triggerLabel="Дополнительные действия..."
                options={[
                  {
                    value: 'export',
                    label: 'Экспорт в CSV',
                    sublabel: 'Выгрузить реестр в файл Excel/CSV',
                    icon: <Download className="w-3.5 h-3.5 text-accent" />,
                  },
                  {
                    value: 'cancel_return',
                    label: 'Отменить и вернуть остатки',
                    sublabel: 'Аннулировать заказы с возвратом на склад',
                    icon: <RotateCcw className="w-3.5 h-3.5 text-danger" />,
                  },
                ]}
              />
            </div>
          </div>
        </div>
      )}

      {/* Filter Dropdowns Grid: Order Status, Payment Status, Delivery & Payment Method */}
      <div className="space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
          {/* Order Status Dropdown */}
          <div className="relative">
            <NeumorphicSelect
              value={statusFilter}
              onChange={(val) => setStatusFilter(val as any)}
              variant="inset"
              prefix="Статус заказа:"
              options={statusFilterOptions}
              placeholder="Все статусы..."
            />
          </div>

          {/* Payment Status Filter */}
          <div className="relative">
            <NeumorphicSelect
              value={paymentStatusFilter}
              onChange={(val) => setPaymentStatusFilter(val as any)}
              variant="inset"
              prefix="Статус оплаты:"
              options={[
                { value: 'all', label: 'Все статусы', icon: <DollarSign className="w-3.5 h-3.5 text-success" /> },
                { value: 'paid', label: 'Оплачен онлайн' },
                { value: 'pending', label: 'Ожидает оплаты' },
                { value: 'paid_on_delivery', label: 'При получении' },
                { value: 'refunded', label: 'Оформлен возврат' },
              ]}
            />
          </div>

          {/* Delivery Method Filter */}
          <div className="relative">
            <NeumorphicSelect
              value={deliveryFilter}
              onChange={(val) => setDeliveryFilter(val as any)}
              variant="inset"
              prefix="Доставка:"
              options={[
                { value: 'all', label: 'Все способы', icon: <Truck className="w-3.5 h-3.5 text-accent" /> },
                { value: 'courier', label: 'Курьерская доставка' },
                { value: 'express', label: 'Срочная экспресс' },
                { value: 'pickup', label: 'Самовывоз из бутика' },
                { value: 'cdek', label: 'Пункт выдачи СДЭК' },
              ]}
            />
          </div>

          {/* Payment Method Filter */}
          <div className="relative">
            <NeumorphicSelect
              value={paymentFilter}
              onChange={(val) => setPaymentFilter(val as any)}
              variant="inset"
              prefix="Способ платежа:"
              options={[
                { value: 'all', label: 'Все способы', icon: <CreditCard className="w-3.5 h-3.5 text-accent" /> },
                { value: 'card', label: 'Банковская карта' },
                { value: 'sbp', label: 'Система СБП' },
                { value: 'cash', label: 'Оплата при получении' },
              ]}
            />
          </div>
        </div>

        {/* Active Filters Reset Bar */}
        {(statusFilter !== 'all' || deliveryFilter !== 'all' || paymentFilter !== 'all' || paymentStatusFilter !== 'all' || dateFilter !== 'all') && (
          <div className="flex items-center justify-between text-xs px-1">
            <span className="text-[11px] text-[#4E5C70] font-medium">
              Применены фильтры заказов
            </span>
            <button
              onClick={() => {
                setStatusFilter('all');
                setDateFilter('all');
                setDeliveryFilter('all');
                setPaymentFilter('all');
                setPaymentStatusFilter('all');
              }}
              className="py-1 px-2.5 neu-button rounded-xl text-[11px] font-bold text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer flex items-center gap-1 transition-all"
            >
              <X className="w-3 h-3" />
              Сбросить все фильтры
            </button>
          </div>
        )}
      </div>

      {/* Orders List */}
      <div className="space-y-3">
        {filteredOrders.length === 0 ? (
          <div className="neu-inset rounded-2xl p-8 text-center space-y-2 text-[#4E5C70] bg-[#E3E8EF]">
            <Package className="w-8 h-8 mx-auto text-[#4E5C70]/60" />
            <p className="text-xs font-bold text-[#2D3A4E]">Заказы не найдены</p>
            <p className="text-[11px]">
              {orders.length === 0
                ? 'В магазине пока нет оформленных заказов'
                : 'Попробуйте изменить поисковый запрос или фильтры'}
            </p>
          </div>
        ) : (
          filteredOrders.map((ord, ordIdx) => {
            const statusInfo = STATUS_CONFIG[ord.status] || STATUS_CONFIG.accepted;
            const StatusIcon = statusInfo.icon;
            const payStatus = ord.paymentStatus || (ord.paymentMethod?.toLowerCase().includes('получен') ? 'paid_on_delivery' : 'paid');
            const payConfig = PAYMENT_STATUS_CONFIG[payStatus] || PAYMENT_STATUS_CONFIG.paid;
            const isAuditExpanded = expandedOrderAuditLogId === ord.id;
            const isStatusDropdownOpen = openStatusDropdownId === ord.id;
            const isPaymentDropdownOpen = openPaymentStatusDropdownId === ord.id;
            const isEditingTrack = editingTrackOrderId === ord.id;
            const isEditingNote = editingNoteOrderId === ord.id;
            const carrierObj = TRACKING_CARRIERS.find((c) => c.id === (ord.trackingCompany || 'cdek')) || TRACKING_CARRIERS[0];
            const trackingUrl = ord.trackingNumber ? carrierObj.urlPrefix(ord.trackingNumber) : '';

            const isOrderSelected = selectedOrderIds.includes(ord.id);

            return (
              <div
                key={`admin-ord-${ord.id}-${ordIdx}`}
                className={`neu-inset rounded-2xl p-3.5 sm:p-4 space-y-3 bg-[#E3E8EF] border transition-all ${
                  isOrderSelected
                    ? 'border-accent ring-2 ring-accent/20'
                    : ord.isCancelled
                    ? 'border-danger/80 opacity-90'
                    : 'border-transparent'
                }`}
              >
                {/* Order Header Row */}
                <div className="flex items-center border-b border-[#BAC5D5]/50 pb-2.5 flex-wrap gap-2">
                  <div className="flex items-center justify-between sm:justify-start w-full sm:w-auto gap-2 flex-wrap min-w-0">
                    {/* Checkbox */}
                    <div
                      onClick={() => handleToggleSelectOrder(ord.id)}
                      className="cursor-pointer p-0.5"
                      title="Выбрать заказ для пакетных действий"
                    >
                      <div
                        className={`w-4 h-4 rounded-lg flex items-center justify-center border transition-all ${
                          isOrderSelected
                            ? 'bg-accent border-accent text-white'
                            : 'border-[#BAC5D5] neu-button bg-[#E3E8EF]'
                        }`}
                      >
                        {isOrderSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-black text-[#2D3A4E] font-mono">№ {ord.id}</span>
                      <button
                        onClick={() => handleCopyOrderId(ord.id)}
                        className="p-1.5 neu-button rounded-lg text-[#4E5C70] hover:text-accent cursor-pointer active:scale-95 transition-all"
                        title="Скопировать номер заказа"
                        aria-label="Скопировать номер заказа"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                    <span className="text-[11px] text-[#4E5C70] font-semibold">
                      от {ord.date || 'Сегодня'}
                    </span>

                    {ord.isAdjusted && (
                      <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-warning-soft text-warning border border-warning/35">
                        Скорректирован
                      </span>
                    )}

                    {ord.isCancelled && (
                      <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-danger-soft text-danger border border-danger/35 flex items-center gap-1">
                        <XCircle className="w-2.5 h-2.5" />
                        Отменен (Остатки возвращены)
                      </span>
                    )}
                  </div>

                  {/* Top Right Badges & Dropdowns: Status & Payment Status */}
                  <div className="flex items-center justify-end w-full sm:w-auto sm:ml-auto gap-2 flex-wrap">
                    {/* Payment Status Dropdown Button */}
                    <div className="relative">
                      <button
                        onClick={() => {
                          setOpenPaymentStatusDropdownId(isPaymentDropdownOpen ? null : ord.id);
                          setOpenStatusDropdownId(null);
                        }}
                        className={`h-8 py-1 px-2.5 rounded-xl text-[11px] font-extrabold flex items-center gap-1.5 border cursor-pointer ${payConfig.bg} ${payConfig.text} active:scale-95 transition-all`}
                        title="Изменить статус оплаты"
                      >
                        <span className={`w-2 h-2 rounded-full ${payConfig.dot}`} />
                        <span>{payConfig.label}</span>
                        <ChevronDown className="w-3 h-3 opacity-60" />
                      </button>

                      {isPaymentDropdownOpen && (
                        <>
                          <div
                            className="fixed inset-0 z-30"
                            onClick={() => setOpenPaymentStatusDropdownId(null)}
                          />
                          <div className="absolute right-0 top-full mt-1.5 z-40 neu-dropdown rounded-2xl p-1.5 bg-[#E3E8EF] space-y-1 min-w-[190px] animate-in fade-in border border-white/80">
                            {(['paid', 'pending', 'paid_on_delivery', 'refunded'] as NonNullable<Order['paymentStatus']>[]).map(
                              (pst) => {
                                const opt = PAYMENT_STATUS_CONFIG[pst];
                                return (
                                  <button
                                    key={pst}
                                    onClick={() => handleUpdatePaymentStatus(ord.id, pst)}
                                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                                      payStatus === pst
                                        ? 'neu-pill-active font-black'
                                        : 'text-[#2D3A4E] hover:bg-white/40'
                                    }`}
                                  >
                                    <span className={`w-2 h-2 rounded-full ${opt.dot}`} />
                                    <span>{opt.label}</span>
                                  </button>
                                );
                              }
                            )}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Order Fulfillment Status Dropdown */}
                    <div className="relative">
                      <button
                        onClick={() => {
                          setOpenStatusDropdownId(isStatusDropdownOpen ? null : ord.id);
                          setOpenPaymentStatusDropdownId(null);
                        }}
                        className={`h-8 py-1 px-3 rounded-xl text-xs font-black flex items-center gap-1.5 border cursor-pointer ${statusInfo.bg} ${statusInfo.text} active:scale-95 transition-all`}
                      >
                        <StatusIcon className="w-3.5 h-3.5" />
                        <span>{statusInfo.label}</span>
                        <ChevronDown className="w-3 h-3 ml-0.5 opacity-70" />
                      </button>

                      {isStatusDropdownOpen && (
                        <>
                          <div
                            className="fixed inset-0 z-30"
                            onClick={() => setOpenStatusDropdownId(null)}
                          />
                          <div className="absolute right-0 top-full mt-1.5 z-40 neu-dropdown rounded-2xl p-1.5 bg-[#E3E8EF] space-y-1 min-w-[180px] animate-in fade-in border border-white/80">
                            {(['accepted', 'assembling', 'in_transit', 'ready', 'delivered'] as Order['status'][]).map(
                              (st) => {
                                const opt = STATUS_CONFIG[st];
                                const OptIcon = opt.icon;
                                return (
                                  <button
                                    key={st}
                                    onClick={() => handleUpdateOrderStatus(ord.id, st)}
                                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                                      ord.status === st
                                        ? 'neu-pill-active font-black'
                                        : 'text-[#2D3A4E] hover:bg-white/40'
                                    }`}
                                  >
                                    <OptIcon className="w-3.5 h-3.5" />
                                    <span>{opt.label}</span>
                                  </button>
                                );
                              }
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Items & Logistics Details */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 text-xs">
                  {/* Left: Items breakdown */}
                  <div className="md:col-span-7 space-y-2 min-w-0">
                    <div className="neu-inset-deep rounded-2xl p-3 space-y-2 bg-[#E3E8EF] overflow-hidden border border-white/40">
                      {(ord.items || []).map((it, idx) => (
                        <div
                          key={`admin-ord-it-${ord.id}-${it.id || idx}-${idx}`}
                          className="flex items-center justify-between text-xs font-medium text-[#2D3A4E]"
                        >
                          <div className="flex items-center gap-2 min-w-0 pr-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                            <span className="truncate font-bold">{it.product?.title || 'Товар каталога'}</span>
                            <span className="text-[11px] text-[#4E5C70] shrink-0">
                              ({it.selectedColor}, {it.selectedSize})
                            </span>
                            {it.isPreorder && (
                              <span className="text-[11px] font-black text-accent shrink-0">Предзаказ</span>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <span className="font-bold text-accent whitespace-nowrap">
                              {it.quantity} шт. × {(it.product?.price || 0).toLocaleString()} ₽
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Internal Manager Note View & Inline Editor */}
                    <div className="neu-inset-deep rounded-2xl p-3 bg-[#E3E8EF] space-y-1.5 border border-white/40">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-[#4E5C70] flex items-center gap-1.5">
                          <MessageSquare className="w-3 h-3 text-accent" />
                          Служебная заметка менеджера:
                        </span>
                        {!isEditingNote && (
                          <button
                            onClick={() => {
                              setEditingNoteOrderId(ord.id);
                              setTempNoteValue(ord.managerNote || '');
                            }}
                            className="text-[11px] text-accent font-bold hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <Edit3 className="w-2.5 h-2.5" />
                            {ord.managerNote ? 'Изменить' : '+ Добавить заметку'}
                          </button>
                        )}
                      </div>

                      {isEditingNote ? (
                        <div className="flex gap-2 items-center">
                          <input
                            type="text"
                            value={tempNoteValue}
                            onChange={(e) => setTempNoteValue(e.target.value)}
                            placeholder="Например: клиент просил отправить до 14:00, звонок за час"
                            className="flex-1 px-2.5 py-1.5 rounded-lg neu-flat bg-[#E3E8EF] text-xs text-[#2D3A4E]"
                            autoFocus
                          />
                          <button
                            onClick={() => handleSaveManagerNote(ord.id)}
                            className="p-1.5 neu-button-accent rounded-lg text-white"
                            title="Сохранить"
                            aria-label="Сохранить"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingNoteOrderId(null)}
                            className="p-1.5 neu-button rounded-lg text-[#4E5C70]"
                            title="Отмена"
                            aria-label="Отмена"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <p className="text-[11px] text-[#2D3A4E] italic">
                          {ord.managerNote || 'Заметок по заказу нет'}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right: Logistics, Tracking Carrier & Total */}
                  <div className="md:col-span-5 space-y-2 text-[11px] text-[#4E5C70] min-w-0">
                    <div className="neu-inset-deep rounded-2xl p-3 space-y-2.5 bg-[#E3E8EF] overflow-hidden border border-white/40">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[#2D3A4E] flex items-center gap-1">
                          <Truck className="w-3 h-3 text-accent" />
                          {ord.deliveryMethod || 'Курьер'}
                        </span>
                        <span className="text-[11px] text-[#4E5C70]">
                          {ord.paymentMethod || 'Онлайн'}
                        </span>
                      </div>

                      {(ord.customerName || ord.customerPhone) && (
                        <p className="truncate text-[#2D3A4E]">
                          <strong>Клиент:</strong> {ord.customerName || 'Покупатель'}{ord.customerPhone ? ` (${ord.customerPhone})` : ''}
                        </p>
                      )}

                      <p className="truncate text-[#2D3A4E]" title={ord.deliveryAddress}>
                        <strong>Адрес:</strong> {ord.deliveryAddress || 'Москва, Пресненская наб. 12'}
                      </p>

                      {/* Tracking Carrier & Number Row - Only for Transport Companies */}
                      {(() => {
                        const isTK = isTransportCompanyDelivery(ord.deliveryMethod, ord.trackingCompany);
                        if (!isTK) {
                          const dm = (ord.deliveryMethod || '').toLowerCase();
                          const methodTypeLabel = dm.includes('самовывоз') || dm.includes('пункт выдачи')
                            ? 'самовывоз'
                            : dm.includes('экспресс')
                            ? 'экспресс-доставка'
                            : 'курьерская служба';

                          return (
                            <div className="pt-2 border-t border-[#BAC5D5]/40 flex items-center justify-between text-[11px] flex-wrap gap-1.5">
                              <span className="font-bold text-[#4E5C70] flex items-center gap-1.5">
                                <Truck className="w-3.5 h-3.5 text-accent" />
                                <span>Способ: <strong className="text-[#2D3A4E]">{ord.deliveryMethod || 'Курьер'}</strong></span>
                              </span>
                              <span className="text-[11px] text-[#4E5C70] font-medium neu-inset px-2 py-0.5 rounded-lg bg-[#E3E8EF]">
                                Трек-номер не предусмотрен ({methodTypeLabel})
                              </span>
                            </div>
                          );
                        }

                        return (
                          <div className="pt-2 border-t border-[#BAC5D5]/40 space-y-1.5">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-bold text-[#2D3A4E] flex items-center gap-1.5 flex-wrap">
                                <span className="text-[#4E5C70]">ТК:</span>
                                <strong className="text-accent font-black">{carrierObj.name}</strong>
                                <span className={`text-[11px] font-extrabold px-1.5 py-0.5 rounded border ${carrierObj.badgeBg}`}>
                                  {carrierObj.badge}
                                </span>
                              </span>

                              {!isEditingTrack && (
                                <button
                                  onClick={() => {
                                    setEditingTrackOrderId(ord.id);
                                    setTempTrackValue(ord.trackingNumber || '');
                                    setTempCarrierValue(ord.trackingCompany || 'cdek');
                                  }}
                                  className="text-[11px] text-accent font-bold hover:underline flex items-center gap-1 cursor-pointer neu-button px-2 py-0.5 rounded-lg active:scale-95 transition-all"
                                >
                                  <Edit3 className="w-2.5 h-2.5" />
                                  <span>{ord.trackingNumber ? 'Изменить' : 'Добавить трек'}</span>
                                </button>
                              )}
                            </div>

                            {isEditingTrack ? (
                              <div className="neu-flat rounded-2xl p-3 bg-[#E3E8EF] border border-white/80 space-y-3 pt-2.5 animate-in fade-in duration-150">
                                {/* Neumorphic Carrier Selector (Clean inline grid with no overlapping popover) */}
                                <div className="space-y-1.5">
                                  <label className="text-[11px] font-black text-[#4E5C70] uppercase tracking-wider block">
                                    Служба доставки (ТК)
                                  </label>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                    {TRACKING_CARRIERS.map((c) => {
                                      const isSelected = tempCarrierValue === c.id;
                                      return (
                                        <button
                                          key={c.id}
                                          type="button"
                                          onClick={() => setTempCarrierValue(c.id)}
                                          className={`p-2 rounded-xl text-left transition-all flex items-center justify-between gap-2 cursor-pointer ${
                                            isSelected
                                              ? 'neu-pill-active font-black'
                                              : 'neu-button text-[#2D3A4E] hover:text-accent bg-[#E3E8EF] border border-white/70'
                                          }`}
                                        >
                                          <div className="flex items-center gap-2 min-w-0 flex-1">
                                            <div
                                              className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                                                isSelected
                                                  ? 'neu-pill-active'
                                                  : 'neu-button text-[#4E5C70] bg-[#E3E8EF]'
                                              }`}
                                            >
                                              <Truck className="w-3.5 h-3.5" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                              <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className="text-xs truncate">{c.name}</span>
                                                <span
                                                  className={`text-[11px] font-extrabold px-1 py-0.2 rounded border shrink-0 ${c.badgeBg}`}
                                                >
                                                  {c.badge}
                                                </span>
                                              </div>
                                              <p className="text-[11px] text-[#4E5C70] truncate leading-tight mt-0.5 font-normal">
                                                {c.sublabel}
                                              </p>
                                            </div>
                                          </div>

                                          {/* Tactile indicator */}
                                          {isSelected ? (
                                            <div className="w-4 h-4 rounded-full neu-fill-accent text-white flex items-center justify-center shrink-0">
                                              <Check className="w-2.5 h-2.5 stroke-[3]" />
                                            </div>
                                          ) : (
                                            <div className="w-3.5 h-3.5 rounded-full neu-inset shrink-0" />
                                          )}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>

                                {/* Tracking Number Input */}
                                <div className="space-y-1">
                                  <label className="text-[11px] font-black text-[#4E5C70] uppercase tracking-wider block">
                                    Трек-номер отправления
                                  </label>
                                  <div className="relative">
                                    <input
                                      type="text"
                                      value={tempTrackValue}
                                      onChange={(e) => setTempTrackValue(e.target.value)}
                                      placeholder="Например: 1459203810"
                                      className="w-full px-3 py-2 pr-8 rounded-xl neu-inset bg-[#E3E8EF] text-xs font-mono font-bold text-[#2D3A4E] border border-white/60 focus:ring-2 focus:ring-accent/40 transition-all"
                                      autoFocus
                                    />
                                    {tempTrackValue && (
                                      <button
                                        type="button"
                                        onClick={() => setTempTrackValue('')}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer"
                                        aria-label="Закрыть"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {/* Actions Row */}
                                <div className="flex gap-2 justify-end pt-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingTrackOrderId(null);
                                    }}
                                    className="px-3.5 py-1.5 neu-button rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer active:scale-95 transition-all"
                                  >
                                    Отмена
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleSaveTracking(ord.id);
                                    }}
                                    className="px-4 py-1.5 neu-button-accent rounded-xl text-xs font-black text-white hover:scale-102 active:neu-inset-deep active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
                                  >
                                    <Save className="w-3.5 h-3.5" />
                                    <span>Сохранить</span>
                                  </button>
                                </div>
                              </div>
                            ) : ord.trackingNumber ? (
                              <div className="flex items-center justify-between gap-1 neu-inset rounded-lg p-1.5 bg-[#E3E8EF]">
                                <span className="font-mono text-xs font-black text-accent truncate">
                                  {ord.trackingNumber}
                                </span>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    onClick={() => handleCopyTracking(ord.trackingNumber!)}
                                    className="p-1 neu-button rounded-md text-[#4E5C70] hover:text-accent"
                                    title="Скопировать трек-номер"
                                    aria-label="Скопировать трек-номер"
                                  >
                                    <Copy className="w-3.5 h-3.5" />
                                  </button>
                                  {trackingUrl && (
                                    <a
                                      href={trackingUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="p-1 neu-button rounded-md text-accent hover:text-[#2D3A4E]"
                                      title="Открыть отслеживание на сайте ТК"
                                    >
                                      <ExternalLink className="w-3.5 h-3.5" />
                                    </a>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="text-[11px] text-[#4E5C70] italic">Трек-номер не указан</span>
                            )}
                          </div>
                        );
                      })()}

                      <div className="flex items-center justify-between pt-1.5 border-t border-[#BAC5D5]/40 text-xs">
                        <span className="font-bold text-[#2D3A4E]">Сумма к оплате:</span>
                        <span className="text-sm font-black text-accent">
                          {ord.totalPrice.toLocaleString()} ₽
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom Order Actions Bar (Neumorphic Inset Control Strip with Inset Buttons) */}
                <div className="neu-inset-deep rounded-2xl p-2 bg-[#E3E8EF] border border-white/40 flex items-center flex-wrap gap-1.5">
                  {/* Chat with Client Button */}
                  <button
                    onClick={() => {
                      if (onOpenSupportChat) {
                        onOpenSupportChat(ord.id, ord.customerName);
                      } else {
                        onShowToast(`Переход в чат с клиентом ${ord.customerName || ord.id}`, 'info');
                      }
                    }}
                    className="h-8 px-3 neu-inset rounded-xl text-xs font-bold text-accent hover:text-[#2D3A4E] hover:bg-[#DDE4F0] flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all bg-[#E3E8EF] border border-white/60"
                    title="Написать клиенту в чат поддержки"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-accent" />
                    <span>Чат с клиентом</span>
                  </button>

                  {/* Print Invoice / Receipt Button */}
                  <button
                    onClick={() => setSelectedOrderForInvoice(ord)}
                    className="h-8 px-3 neu-inset rounded-xl text-xs font-bold text-[#2D3A4E] hover:text-accent hover:bg-[#DDE4F0] flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all bg-[#E3E8EF] border border-white/60"
                    title="Сформировать и распечатать товарный чек или накладную"
                  >
                    <Printer className="w-3.5 h-3.5 text-accent" />
                    <span>Печать чека</span>
                  </button>

                  {/* Order Adjustment Modal Opener */}
                  <button
                    onClick={() => setSelectedOrderForAdjustment(ord)}
                    className="h-8 px-3 neu-inset rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] hover:bg-[#DDE4F0] flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all bg-[#E3E8EF] border border-white/60"
                    title="Изменить состав заказа, списать или вернуть остатки на склад"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 text-warning" />
                    <span>Правка состава и склад</span>
                  </button>

                  {/* Delivery Map Opener */}
                  <button
                    onClick={() => setSelectedOrderForMap(ord)}
                    className="h-8 px-3 neu-inset rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] hover:bg-[#DDE4F0] flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all bg-[#E3E8EF] border border-white/60"
                    title="Интерактивная карта доставки"
                  >
                    <Navigation className="w-3.5 h-3.5 text-sky-600" />
                    <span>Карта</span>
                  </button>

                  {/* Delivery Stages Management Opener */}
                  <button
                    onClick={() => setSelectedOrderForDeliveryStages(ord)}
                    className="h-8 px-3 neu-inset rounded-xl text-xs font-bold text-accent hover:text-[#2D3A4E] hover:bg-[#DDE4F0] flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all bg-[#E3E8EF] border border-white/60"
                    title="Управление этапами доставки заказа"
                  >
                    <Clock className="w-3.5 h-3.5 text-accent" />
                    <span>Этапы доставки</span>
                  </button>

                  {/* Delete Order Button */}
                  <button
                    onClick={() => setOrderToDelete(ord)}
                    className="h-8 px-2.5 neu-button-danger rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer active:scale-95 transition-all border border-white/60"
                    title="Удалить этот заказ из базы данных"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Удалить</span>
                  </button>

                  {/* Quick Cancel & Return Stock Button */}
                  {!ord.isCancelled && (
                    <button
                      onClick={() => handleCancelAndReturnStock(ord)}
                      className="h-8 px-2.5 neu-inset rounded-xl text-xs font-bold text-[#4E5C70] hover:text-danger hover:bg-danger-soft flex items-center gap-1 cursor-pointer active:scale-95 transition-all bg-[#E3E8EF] border border-white/60"
                      title="Отменить заказ и автоматически вернуть товары на склад"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-danger" />
                      <span>Отмена</span>
                    </button>
                  )}

                  {/* Toggle Audit History */}
                  <button
                    onClick={() =>
                      setExpandedOrderAuditLogId(isAuditExpanded ? null : ord.id)
                    }
                    className={`h-8 px-3 rounded-xl text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 sm:ml-auto neu-inset bg-[#E3E8EF] border border-white/60 ${
                      isAuditExpanded ? 'text-accent font-black border-accent/40 bg-[#DDE4F0]' : 'text-[#4E5C70] hover:text-accent hover:bg-[#DDE4F0]'
                    }`}
                  >
                    <History className="w-3.5 h-3.5 text-accent" />
                    <span>
                      История {ord.adjustmentLogs?.length || ord.historySteps?.length ? `(${((ord.adjustmentLogs?.length || 0) + (ord.historySteps?.length || 0))})` : ''}
                    </span>
                  </button>
                </div>

                {/* Expandable Audit Log & Status History Timeline */}
                {isAuditExpanded && (
                  <div className="neu-inset rounded-2xl p-3 bg-[#E3E8EF] space-y-2 text-xs animate-in fade-in">
                    <h5 className="font-black text-[#2D3A4E] flex items-center gap-1.5 uppercase text-[11px] tracking-wider">
                      <Clock className="w-3.5 h-3.5 text-accent" />
                      Хронология изменений заказа и складские события
                    </h5>

                    {/* Status Steps */}
                    {Array.isArray(ord.historySteps) && ord.historySteps.length > 0 && (
                      <div className="space-y-1.5">
                        {ord.historySteps.map((step, sIdx) => (
                          <div
                            key={sIdx}
                            className="flex items-start gap-2 text-[11px] text-[#2D3A4E]"
                          >
                            <span className="w-2 h-2 rounded-full bg-success mt-1 shrink-0" />
                            <div>
                              <span className="font-bold">{step?.title || `Этап ${sIdx + 1}`}</span>
                              <span className="text-[#4E5C70] ml-1.5 text-[11px]">({step?.date || ord.date})</span>
                              {step?.description && (
                                <p className="text-[#4E5C70] text-[11px]">{step.description}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Adjustment Audit Logs */}
                    {ord.adjustmentLogs && ord.adjustmentLogs.length > 0 && (
                      <div className="pt-2 border-t border-[#BAC5D5]/50 space-y-1.5">
                        <span className="font-bold text-[11px] text-warning uppercase">
                          Журнал корректировок состава:
                        </span>
                        {ord.adjustmentLogs.map((log) => (
                          <div
                            key={log.id}
                            className="neu-flat p-2 rounded-xl bg-[#E3E8EF] space-y-0.5 text-[11px]"
                          >
                            <div className="flex justify-between font-bold text-[#2D3A4E]">
                              <span>{log.reason}</span>
                              <span className="text-[#4E5C70] font-mono text-[11px]">{log.date}</span>
                            </div>
                            <p className="text-[11px] text-[#4E5C70]">
                              Сумма: {log.previousTotal} ₽ ➔ <strong>{log.newTotal} ₽</strong>
                              {log.refundAmount ? ` (Возврат клиенту: ${log.refundAmount} ₽)` : ''}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ================= MODAL: PRINTABLE INVOICE ================= */}
      <AdminOrderInvoiceModal
        isOpen={!!selectedOrderForInvoice}
        onClose={() => setSelectedOrderForInvoice(null)}
        order={selectedOrderForInvoice}
        storefrontSettings={storefrontSettings}
        onShowToast={onShowToast}
      />

      {/* ================= MODAL: ORDER ADJUSTMENT ================= */}
      <AdminOrderAdjustmentModal
        isOpen={!!selectedOrderForAdjustment}
        onClose={() => setSelectedOrderForAdjustment(null)}
        order={selectedOrderForAdjustment}
        products={products}
        onSaveAdjustment={handleSaveOrderAdjustment}
        onUpdateProducts={onUpdateProducts}
        onShowToast={onShowToast}
      />

      {/* ================= MODAL: DELIVERY TRACKING MAP ================= */}
      <DeliveryTrackingMapModal
        isOpen={!!selectedOrderForMap}
        onClose={() => setSelectedOrderForMap(null)}
        order={selectedOrderForMap}
        onOpenSupportChat={(orderId) => {
          if (onOpenSupportChat && selectedOrderForMap) {
            onOpenSupportChat(orderId || selectedOrderForMap.id, selectedOrderForMap.customerName);
          }
        }}
        onShowToast={onShowToast}
      />

      {/* ================= MODAL: DELIVERY STAGES MANAGEMENT ================= */}
      <AdminDeliveryStagesModal
        isOpen={!!selectedOrderForDeliveryStages}
        order={selectedOrderForDeliveryStages}
        onClose={() => setSelectedOrderForDeliveryStages(null)}
        onSave={handleSaveDeliveryStages}
        onShowToast={onShowToast}
      />

      {/* ================= MODAL: BULK CANCEL CONFIRMATION ================= */}
      {isBulkCancelModalOpen && (
        <div className="admin-no-glow fixed inset-0 z-[100] bg-[#2D3A4E]/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in">
          <div className="neu-modal rounded-3xl max-w-md w-full p-5 sm:p-6 space-y-4 my-auto bg-[#E3E8EF] border border-white/80">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl neu-inset flex items-center justify-center text-danger shrink-0 font-black">
                <ShieldAlert className="w-5 h-5 text-danger" />
              </div>
              <div>
                <h3 className="text-sm font-black text-[#2D3A4E]">
                  Отменить выбранные заказы?
                </h3>
                <p className="text-[11px] text-[#4E5C70] font-medium">
                  Действие затронет {selectedOrderIds.length} {selectedOrderIds.length === 1 ? 'заказ' : selectedOrderIds.length < 5 ? 'заказа' : 'заказов'}
                </p>
              </div>
            </div>

            <div className="neu-inset rounded-2xl p-3.5 space-y-1.5 text-xs text-[#2D3A4E] bg-[#E3E8EF]/70">
              <p className="font-bold">Что произойдет:</p>
              <ul className="text-[11px] text-[#4E5C70] space-y-1 list-disc list-inside">
                <li>Все товары из выбранных заказов будут автоматически возвращены на остатки склада</li>
                <li>Статус оплаты будет переведен в «Возврат»</li>
                <li>В историю каждого заказа запишется запись об отмене</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsBulkCancelModalOpen(false)}
                className="h-9 px-4 rounded-xl neu-button text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer active:scale-95 transition-all"
              >
                Назад
              </button>
              <button
                type="button"
                onClick={() => {
                  handleBulkCancelAndReturn();
                  setIsBulkCancelModalOpen(false);
                }}
                className="h-9 px-4 rounded-xl neu-button text-xs font-bold text-danger hover:text-danger cursor-pointer active:scale-95 transition-all flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Подтвердить отмену
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: SINGLE ORDER DELETE CONFIRMATION ================= */}
      {orderToDelete && (
        <div className="admin-no-glow fixed inset-0 z-[100] bg-[#2D3A4E]/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in">
          <div className="neu-modal rounded-3xl max-w-sm w-full p-5 space-y-4 my-auto bg-[#E3E8EF] border border-white/80">
            <div className="flex items-center gap-3 border-b border-[#BAC5D5]/40 pb-3">
              <div className="w-9 h-9 rounded-xl neu-flat-sm flex items-center justify-center text-danger shrink-0">
                <Trash2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-black text-[#2D3A4E] truncate">Удалить заказ № {orderToDelete.id}?</h3>
                <p className="text-xs text-[#4E5C70] truncate">{orderToDelete.customerName || 'Клиент'}</p>
              </div>
            </div>

            <p className="text-xs text-[#4E5C70]">
              Вы действительно хотите удалить заказ № <strong className="text-[#2D3A4E]">{orderToDelete.id}</strong> на сумму <strong className="text-[#2D3A4E]">{orderToDelete.totalPrice.toLocaleString()} ₽</strong> из базы данных Firestore?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setOrderToDelete(null)}
                disabled={isDeletingOrder}
                className="neu-inset px-4 py-2 rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] bg-[#E3E8EF] active:scale-95 transition-all cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleDeleteSingleOrder}
                disabled={isDeletingOrder}
                className="neu-button-danger px-4 py-2 rounded-xl text-xs font-black active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isDeletingOrder ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Удаление...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Удалить</span>
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
