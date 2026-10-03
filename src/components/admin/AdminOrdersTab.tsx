import { orderTimestamp } from '../../shared/orderDate';
import { useProgressiveList } from '../../utils/useProgressiveList';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Package,
  Search,
  RefreshCw,
  Printer,
  SlidersHorizontal,
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
  DollarSign,
  MessageSquare,
  Layers,
  Trash2,
  KeyRound,
  Archive,
  ArchiveRestore,
  PackageCheck,
} from 'lucide-react';
import { Order, Product, OrderAdjustmentLog, PromoCode, StorefrontSettings } from '../../types';
import { exportOrdersToCSV } from '../../utils/csvHelpers';
import { copyToClipboard } from '../../utils/clipboard';
import { extractColorName, extractSizeName, stockShortages, type StockShortage } from '../../utils/inventory';
import {
  applyAdminStockChanges,
  deductOrderLineStock,
  deleteOrderFromFirestore,
  findUntakenOrderLines,
  ORDER_JOURNAL_SINCE,
  returnCancelledOrderStock,
  type AdminStockChange,
} from '../../utils/firebaseSync';
import { AdminActionMenu } from './AdminActionMenu';
import {
  getDefaultDeliveryStages,
  syncStagesWithOrderStatus,
  getEstimatedDeliveryForStatus,
  isTransportCompanyDelivery,
} from '../../utils/deliveryStages';
import { AdminOrderInvoiceModal } from './AdminOrderInvoiceModal';
import { AdminOrderAdjustmentModal } from './AdminOrderAdjustmentModal';
import { AdminHandoverDialog } from './AdminHandoverDialog';
import { OrderTimeline } from '../OrderTimeline';
import { useAuth } from '../../context/AuthContext';
import {
  adminStatusLabel,
  canHandOver,
  flowStatuses,
  generatePickupCode,
  orderTimeline,
  statusChangeBlocker,
  statusLogEntry,
  usesPickupCode,
} from '../../utils/orderFlow';
import { NeumorphicSelect } from '../NeumorphicSelect';
import { pluralRu } from '../../utils/pluralize';
import { SelectCheckbox } from './SelectCheckbox';
import { ConfirmDialog } from '../ConfirmDialog';
import { useDialogA11y } from '../../utils/useDialogA11y';
import { useChangedSince, useUnsavedChanges } from '../../utils/unsavedChanges';
import { initialPaymentStatus } from '../../shared/orderApi';
import { AdminOrderCopyCards } from './AdminOrderCopyCards';
import { CancelOrderDialog } from '../CancelOrderDialog';
import { AdminOrderPaymentBlock } from './AdminOrderPaymentBlock';
import { AdminReceiptReview, type ReviewReceipt } from './AdminReceiptReview';
import { usePaymentTemplates } from './usePaymentTemplates';
import { isReceiptOnReview } from '../../utils/paymentDetails';
import { AdminOrderPriceWarning } from './AdminOrderPriceWarning';
import { AdminChoiceMenu } from './AdminChoiceMenu';
import { orderPriceIssues } from '../../utils/orderPriceCheck';
import type { OrderPaymentDetails } from '../../types';
import { cancelledByLabel, cancelReasonText, formatCancelledAt, isArchivedOrder, overdueUnpaidOrders, UNPAID_CANCEL_REASON } from '../../utils/orderCancel';

interface AdminOrdersTabProps {
  orders: Order[];
  storefrontSettings?: StorefrontSettings;
  products: Product[];
  /** Resolves to false when the database refused the write (the error toast is already shown) */
  onUpdateOrders: (updated: Order[]) => Promise<boolean> | void;
  /** For «Корректировка заказа»: a percent promo of the order is recalculated */
  promos?: PromoCode[];
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
  onOpenSupportChat?: (orderId: string, customerName?: string) => void;
  /** «Подтвердить оплату» / «Отклонить чек» («Доработки 5»): the order and a message to the buyer's chat */
  onReviewReceipt?: ReviewReceipt;
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
    bg: 'bg-accent/10 border-accent/30',
    text: 'text-accent',
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
    bg: 'bg-[#D8DFE8] border-[#BAC5D5]',
    text: 'text-[#2D3A4E]',
    icon: CheckCircle2,
  },
};

/** Bulk status for orders of different delivery kinds: the step in words that fit every chain (`FLOW_STATUSES`) */
const BULK_STATUS_LABELS: Record<Order['status'], string> = {
  accepted: 'Новый',
  assembling: 'Скомплектован',
  in_transit: 'Передан в доставку',
  ready: 'Готов к выдаче / ждёт получения',
  delivered: 'Получен (закрыть вручную)',
};
const BULK_STATUS_HINTS: Record<Order['status'], string> = {
  accepted: '',
  assembling: 'Сборка завершена',
  in_transit: 'В ТК — только с трек-номером, курьеру — с кодом выдачи',
  ready: 'Самовывоз — готов к выдаче; Почта и ТК — ждёт подтверждения',
  delivered: 'Только Почта и ТК; курьер и самовывоз выдаются по коду',
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
  receipt_review: {
    label: 'Чек на проверке',
    bg: 'bg-warning-soft border-warning/40',
    text: 'text-warning',
    dot: 'bg-warning animate-pulse',
  },
  paid: {
    label: 'Оплачен',
    bg: 'bg-success-soft border-success/25',
    text: 'text-success',
    dot: 'bg-success',
  },
  paid_on_delivery: {
    label: 'Оплата при получении',
    bg: 'bg-accent/10 border-accent/30',
    text: 'text-accent',
    dot: 'bg-accent',
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
    badgeBg: 'text-[#2D3A4E] bg-[#D8DFE8] border-[#BAC5D5]',
    urlPrefix: (_track) => '',
  },
];

/** Payment method as chosen by the buyer, without the «(при получении)» mark added to the order */
function paymentMethodName(value?: string): string {
  return (value || '').replace(/\s*\(при получении\)\s*$/i, '').trim();
}

export const AdminOrdersTab: React.FC<AdminOrdersTabProps> = ({
  orders,
  storefrontSettings,
  products = [],
  onUpdateOrders,
  promos = [],
  onShowToast,
  onOpenSupportChat,
  onReviewReceipt,
}) => {
  const paymentTemplates = usePaymentTemplates();
  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'cancelled' | 'archive' | Order['status']>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday' | '7days' | 'month'>('all');
  // Delivery and payment filters: the method names found in the orders themselves ('all' — any)
  const [deliveryFilter, setDeliveryFilter] = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<'all' | NonNullable<Order['paymentStatus']>>('all');

  // Date filter options for Neumorphic dropdown
  const dateFilterOptions = useMemo(() => [
    { value: 'all', label: 'Все время', icon: <Calendar className="w-3.5 h-3.5 text-accent" /> },
    { value: 'today', label: 'Сегодня' },
    { value: 'yesterday', label: 'Вчера' },
    { value: '7days', label: 'Последние 7 дней' },
    { value: 'month', label: 'Этот месяц' },
  ], []);

  // Status chips (radio): counts exclude cancelled orders, which have their own chip, and «Архив» (cancelled
  // 3 days ago and what the admin moved there), which leaves the working list
  const statusChips = useMemo(() => {
    const now = Date.now();
    const archived = orders.filter((o) => isArchivedOrder(o, now));
    const listed = orders.filter((o) => !isArchivedOrder(o, now));
    const active = listed.filter((o) => !o.isCancelled);
    const count = (st: Order['status']) => active.filter((o) => o.status === st).length;
    return [
      { value: 'all' as const, label: 'Все', count: listed.length },
      // the same chips for every delivery kind: «Переданы» — in a carrier or with the courier, «Ждут получения» —
      // at the pickup point or waiting for the buyer's «Я получил заказ»
      { value: 'accepted' as const, label: 'Новые', count: count('accepted') },
      { value: 'assembling' as const, label: 'Скомплектованы', count: count('assembling') },
      { value: 'in_transit' as const, label: 'Переданы', count: count('in_transit') },
      { value: 'ready' as const, label: 'Ждут получения', count: count('ready') },
      { value: 'delivered' as const, label: 'Получены', count: count('delivered') },
      { value: 'cancelled' as const, label: 'Отменены', count: listed.length - active.length },
      { value: 'archive' as const, label: 'Архив', count: archived.length },
    ];
  }, [orders]);

  const moreFiltersCount = [dateFilter, paymentStatusFilter, deliveryFilter, paymentFilter].filter((v) => v !== 'all').length;

  // Methods that occur in the orders (the store names its methods itself; old orders keep old names)
  const deliveryMethodNames = useMemo(
    () => [...new Set<string>(orders.map((o) => (o.deliveryMethod || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru')),
    [orders]
  );
  const paymentMethodNames = useMemo(
    () => [...new Set<string>(orders.map((o) => paymentMethodName(o.paymentMethod)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru')),
    [orders]
  );


  // Bulk Selection State
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);

  // Modals & Active Order
  const [selectedOrderForInvoice, setSelectedOrderForInvoice] = useState<Order | null>(null);
  const [selectedOrderForAdjustment, setSelectedOrderForAdjustment] = useState<Order | null>(null);
  /** «Забрать заказ» — the window with the code; a carrier's order closed by hand — the confirmation */
  const [handoverOrder, setHandoverOrder] = useState<Order | null>(null);
  const [orderToCloseManually, setOrderToCloseManually] = useState<Order | null>(null);
  const { currentUser } = useAuth();
  const adminUid = currentUser?.uid;
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);
  /** «Отменить и вернуть на склад»: the window with the reason (audit 02.10, finding 14) */
  const [orderToCancel, setOrderToCancel] = useState<Order | null>(null);
  const [returningStockOrderId, setReturningStockOrderId] = useState<string | null>(null);
  const deleteOrderDialog = useDialogA11y(Boolean(orderToDelete), () => setOrderToDelete(null));
  const [isDeletingOrder, setIsDeletingOrder] = useState(false);
  const [expandedOrderAuditLogId, setExpandedOrderAuditLogId] = useState<string | null>(null);

  // Quick Inline Tracking Editor
  const [editingTrackOrderId, setEditingTrackOrderId] = useState<string | null>(null);
  const [tempTrackValue, setTempTrackValue] = useState<string>('');
  const [tempCarrierValue, setTempCarrierValue] = useState<NonNullable<Order['trackingCompany']>>('cdek');

  // Quick Inline Manager Note Editor
  const [editingNoteOrderId, setEditingNoteOrderId] = useState<string | null>(null);
  const [tempNoteValue, setTempNoteValue] = useState<string>('');
  // An open track number or note with edits: the admin panel asks before closing or switching the section
  useUnsavedChanges(useChangedSince(editingTrackOrderId, [tempTrackValue, tempCarrierValue]), 'Трек-номер заказа');
  useUnsavedChanges(useChangedSince(editingNoteOrderId, [tempNoteValue]), 'Заметка к заказу');

  // Filtered Orders Calculation (the cards are heavy: the first 3 — about a screen — render with the section, the rest
  // after paint)
  const filteredOrders = useMemo(() => {
    // «Сегодня» / «Вчера» by the order's real date (createdAt, or the text date of old orders)
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const DAY = 24 * 60 * 60 * 1000;

    return orders.filter((ord) => {
      // 1. Status Filter (a cancelled order counts only under «Отменены», like the chip counters; «Архив» — only there)
      const archived = isArchivedOrder(ord, now.getTime());
      if (statusFilter === 'archive') {
        if (!archived) return false;
      } else if (archived) {
        return false;
      }
      if (statusFilter === 'cancelled' && !ord.isCancelled) return false;
      if (statusFilter !== 'all' && statusFilter !== 'cancelled' && statusFilter !== 'archive' && (ord.isCancelled || ord.status !== statusFilter)) return false;

      // 2. Date Filter
      if (dateFilter !== 'all') {
        const t = orderTimestamp(ord, now);
        if (t === null) return false;
        if (dateFilter === 'today' && !(t >= dayStart && t < dayStart + DAY)) return false;
        if (dateFilter === 'yesterday' && !(t >= dayStart - DAY && t < dayStart)) return false;
        if (dateFilter === '7days' && !(t >= dayStart - 6 * DAY)) return false;
        if (dateFilter === 'month' && !(t >= new Date(now.getFullYear(), now.getMonth(), 1).getTime())) return false;
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

      // 4–5. Delivery and payment method: as named in the order
      if (deliveryFilter !== 'all' && (ord.deliveryMethod || '').trim() !== deliveryFilter) return false;
      if (paymentFilter !== 'all' && paymentMethodName(ord.paymentMethod) !== paymentFilter) return false;

      // 6. Payment Status Filter
      if (paymentStatusFilter !== 'all') {
        const pStat = ord.paymentStatus || 'pending';
        if (pStat !== paymentStatusFilter) return false;
      }

      return true;
    });
  }, [orders, searchQuery, statusFilter, dateFilter, deliveryFilter, paymentFilter, paymentStatusFilter]);
  const visibleOrders = useProgressiveList<Order>(filteredOrders, 3);

  // Lines whose stock the buyer's browser did not take (finding 8): checked for active orders older than 2 minutes
  // (a fresh order may still be writing off), again when that list changes
  const [untakenLines, setUntakenLines] = useState<Record<string, number[]>>({});
  const [takingStockOrderId, setTakingStockOrderId] = useState<string | null>(null);
  const [untakenCheck, setUntakenCheck] = useState(0);
  const untakenCandidates = useMemo(() => {
    const ready = Date.now() - 2 * 60 * 1000;
    return orders.filter(
      (o) => !o.isCancelled && o.status !== 'delivered' && o.createdAt && o.createdAt >= ORDER_JOURNAL_SINCE && Date.parse(o.createdAt) < ready
    );
  }, [orders]);
  const untakenKey = untakenCandidates.map((o) => o.id).sort().join(',');
  useEffect(() => {
    if (!untakenKey) {
      setUntakenLines({});
      return;
    }
    let alive = true;
    findUntakenOrderLines(untakenCandidates)
      .then((missing) => alive && setUntakenLines(missing))
      .catch((err) => console.warn('Untaken order lines were not checked:', err));
    return () => {
      alive = false;
    };
    // the candidates are read when their ids change or after «Списать со склада»
  }, [untakenKey, untakenCheck]); // eslint-disable-line react-hooks/exhaustive-deps

  /** «Списать со склада»: the same per-line write-off as the buyer's, with the same journal entry */
  const handleTakeOrderStock = async (order: Order) => {
    setTakingStockOrderId(order.id);
    const at = new Date();
    try {
      for (const i of untakenLines[order.id] ?? []) await deductOrderLineStock(order.id, order.items[i], i, at);
      onShowToast(`Товары заказа № ${order.id} списаны со склада`, 'success');
    } catch (err) {
      console.error('Stock was not taken:', err);
      onShowToast(`Не сохранено: списание товаров заказа № ${order.id}. Проверьте соединение.`, 'error');
    } finally {
      setTakingStockOrderId(null);
      setUntakenCheck((n) => n + 1);
    }
  };

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

  /**
   * The whole order back to stock (+1) or taken again (−1) — restoring a cancelled order and cancelling a restored one.
   * Each line in its own transaction against the stock in the database now, with its journal entry; preorder lines
   * were never taken. A refused line is named in a toast.
   */
  const changeOrderStock = (order: Order, sign: 1 | -1, reason: string) => {
    const changes: AdminStockChange[] = (order.items ?? [])
      .filter((it) => !it.isPreorder)
      .map((it) => ({
        productId: it.product.id,
        productTitle: it.product.title,
        color: extractColorName(it.selectedColor),
        size: extractSizeName(it.selectedSize),
        delta: sign * it.quantity,
      }));
    if (changes.length === 0) return;
    void applyAdminStockChanges(changes, { orderId: order.id, reason: `${reason} #${order.id}`, operator: 'Администратор' }).then(
      ({ failed }) => {
        if (failed.length > 0) {
          onShowToast(
            `Заказ № ${order.id}: не изменён остаток — ${failed.map((c) => `${c.productTitle ?? c.productId} (${c.color}, ${c.size})`).join('; ')}`,
            'error'
          );
        }
      }
    );
  };

  /**
   * New status of the given orders (one or a bulk selection), with an entry in the order's history: time to the
   * second, the admin, a note («Доработки 4»). A cancelled order that gets a status again is active: the goods
   * returned on cancellation are taken from stock again. Handing over by courier or at pickup needs a code: it is
   * made when the order leaves with the courier or is ready for pickup.
   */
  const changeOrdersStatus = (orderIds: string[], newStatus: Order['status'], note?: string) => {
    const ids = new Set(orderIds);

    const reactivated = orders.filter((ord) => ids.has(ord.id) && ord.isCancelled && ord.items?.length);
    for (const ord of reactivated) changeOrderStock(ord, -1, 'Заказ восстановлен после отмены');

    const updated = orders.map((ord) => {
      if (!ids.has(ord.id)) return ord;
      const updatedStages = syncStagesWithOrderStatus(ord.deliveryStages, ord, newStatus);
      const updatedEst = getEstimatedDeliveryForStatus(newStatus, ord.estimatedDelivery, false);
      const updatedPaymentStatus = newStatus === 'delivered' && ord.paymentStatus === 'paid_on_delivery'
        ? 'paid'
        : ord.paymentStatus;
      const needsCode = usesPickupCode(ord) && (newStatus === 'in_transit' || newStatus === 'ready') && !ord.pickupCode;
      const entryNote = [ord.isCancelled ? 'Восстановлен после отмены' : '', note ?? ''].filter(Boolean).join('. ');

      return {
        ...ord,
        status: newStatus,
        isCancelled: false,
        // a restored order is back in the working list, not in «Архив»
        archived: ord.isCancelled ? undefined : ord.archived,
        paymentStatus: updatedPaymentStatus,
        statusLog: [...(ord.statusLog ?? []), statusLogEntry(newStatus, 'admin', { byUid: adminUid, note: entryNote || undefined })],
        ...(needsCode ? { pickupCode: generatePickupCode() } : {}),
        deliveryStages: updatedStages,
        estimatedDelivery: updatedEst,
      };
    });

    onUpdateOrders(updated);
    return reactivated.length;
  };

  /**
   * Restoring a cancelled order takes its goods from stock again. When some are gone meanwhile, the admin
   * sees what is missing and decides; otherwise the stock would silently drop to zero.
   */
  const [pendingRestore, setPendingRestore] = useState<{ shortages: StockShortage[]; run: () => void } | null>(null);
  const withRestoreCheck = (orderIds: string[], run: () => void) => {
    const items = orders.filter((o) => orderIds.includes(o.id) && o.isCancelled).flatMap((o) => o.items ?? []);
    const shortages = items.length > 0 ? stockShortages(products, items) : [];
    if (shortages.length > 0) setPendingRestore({ shortages, run });
    else run();
  };

  /**
   * Bulk status by each order's chain («Доработки 4», check 03.10): an order whose chain has no such step, a carrier's
   * order without its track number and a courier or pickup order «Выдан» (handed over only by the code) are skipped and
   * named; «Получен» of carrier orders — after «Закрыть заказы вручную?».
   */
  const [pendingBulkClose, setPendingBulkClose] = useState<string[] | null>(null);
  const handleBulkStatusChange = (newStatus: Order['status']) => {
    if (selectedOrderIds.length === 0) return;
    const selected = orders.filter((o) => selectedOrderIds.includes(o.id));
    const skipped: string[] = [];
    const allowed: string[] = [];
    for (const o of selected) {
      if (!flowStatuses(o).includes(newStatus)) skipped.push(`№ ${o.id} — нет такого шага у способа доставки`);
      else if (statusChangeBlocker(o, newStatus)) skipped.push(`№ ${o.id} — без трек-номера`);
      else if (newStatus === 'delivered' && usesPickupCode(o)) skipped.push(`№ ${o.id} — выдаётся по коду («Забрать заказ»)`);
      else allowed.push(o.id);
    }
    if (skipped.length > 0) onShowToast(`Не изменены: ${skipped.join('; ')}`, 'error');
    if (allowed.length === 0) return;
    if (newStatus === 'delivered') {
      setPendingBulkClose(allowed);
      return;
    }
    withRestoreCheck(allowed, () => applyBulkStatusChange(allowed, newStatus));
  };

  const applyBulkStatusChange = (ids: string[], newStatus: Order['status']) => {
    const restored = changeOrdersStatus(ids, newStatus, newStatus === 'delivered' ? 'Закрыт администратором (массово)' : undefined);
    const sample = orders.find((o) => o.id === ids[0]);
    const label = ids.length === 1 && sample ? `«${adminStatusLabel(sample, newStatus)}»` : `«${BULK_STATUS_LABELS[newStatus]}»`;
    onShowToast(
      `Статус ${ids.length} ${pluralRu(ids.length, ['заказа', 'заказов', 'заказов'])}: ${label}` +
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

  // Order Status Change Handler: the order's own chain (src/shared/orderFlow.ts)
  const handleUpdateOrderStatus = (orderId: string, newStatus: Order['status']) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order || (order.status === newStatus && !order.isCancelled)) return;
    const blocker = statusChangeBlocker(order, newStatus);
    if (blocker) {
      // the track number first: its editor opens right in the card
      onShowToast(blocker, 'error');
      setEditingTrackOrderId(order.id);
      setTempTrackValue(order.trackingNumber || '');
      setTempCarrierValue(order.trackingCompany || 'cdek');
      return;
    }
    if (newStatus === 'delivered' && !order.isCancelled) {
      // courier and pickup — handed over by the code; a carrier's order — closed by hand when the buyer did not confirm
      if (usesPickupCode(order)) openHandover(order);
      else setOrderToCloseManually(order);
      return;
    }
    withRestoreCheck([orderId], () => applyOrderStatus(orderId, newStatus));
  };

  const applyOrderStatus = (orderId: string, newStatus: Order['status'], note?: string) => {
    const order = orders.find((o) => o.id === orderId);
    const label = order ? adminStatusLabel(order, newStatus) : STATUS_CONFIG[newStatus].label;
    const restored = changeOrdersStatus([orderId], newStatus, note);
    onShowToast(
      restored > 0
        ? `Заказ ${orderId} восстановлен со статусом "${label}", товары снова списаны со склада`
        : `Статус заказа ${orderId} изменен на "${label}"`,
      'success'
    );
  };

  /** «Забрать заказ»: only a paid order (or «Оплата при получении»); the code is made now if the order has none */
  const openHandover = (order: Order) => {
    if (!canHandOver(order)) {
      onShowToast(`Выдача невозможна: заказ № ${order.id} не оплачен`, 'error');
      return;
    }
    if (order.pickupCode) {
      setHandoverOrder(order);
      return;
    }
    const withCode = { ...order, pickupCode: generatePickupCode() };
    onUpdateOrders(orders.map((o) => (o.id === order.id ? withCode : o)));
    setHandoverOrder(withCode);
  };

  const confirmHandover = async (order: Order): Promise<boolean> => {
    changeOrdersStatus([order.id], 'delivered', `Выдан по коду ${order.pickupCode}`);
    onShowToast(`Заказ № ${order.id} выдан`, 'success');
    return true;
  };

  // Payment Status Change Handler
  // «Оплачен» for an order whose prices differ from the catalog — after «Отметить оплаченным?» (stage 5 without Blaze)
  const [paidDespitePrices, setPaidDespitePrices] = useState<Order | null>(null);
  const handleUpdatePaymentStatus = (orderId: string, newStatus: NonNullable<Order['paymentStatus']>, checked = false) => {
    const target = orders.find((o) => o.id === orderId);
    if (!checked && newStatus === 'paid' && target && orderPriceIssues(target, products).length > 0) {
      setPaidDespitePrices(target);
      return;
    }
    const updated = orders.map((ord) => (ord.id === orderId ? { ...ord, paymentStatus: newStatus } : ord));
    onUpdateOrders(updated);
    onShowToast(`Статус оплаты заказа ${orderId}: "${PAYMENT_STATUS_CONFIG[newStatus].label}"`, 'success');
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

  /**
   * The store's cancellation (one order or a bulk selection), always with a reason (CancelOrderDialog). The goods go
   * back like the buyer's: per line, exactly what the order's journal entry took (`returnCancelledOrderStock`, check
   * 03.10); a line without an entry (an order older than the journal) — the ordered quantity. An order cancelled once and
   * restored took its goods again by the ordered quantity, so it returns them the same way. A return that did not go
   * through leaves «Вернуть на склад» in the card.
   */
  const cancelOrdersAsAdmin = async (targets: Order[], reason: string, comment: string, label?: string): Promise<boolean> => {
    const active = targets.filter((o) => !o.isCancelled);
    if (active.length === 0) {
      onShowToast('Выбранные заказы уже отменены', 'info');
      return true;
    }
    const reasonText = cancelReasonText({ cancelReason: reason, cancelComment: comment });
    const at = new Date().toISOString();
    const restoredBefore = new Set(active.filter((o) => Boolean(o.cancelledAt)).map((o) => o.id));

    // restored once: the ordered quantity back, as it was taken on restore
    for (const ord of active) {
      if (restoredBefore.has(ord.id) && ord.items?.length) changeOrderStock(ord, 1, 'Отмена заказа администратором');
    }

    const ids = new Set(active.map((o) => o.id));
    const updated = orders.map((o) =>
      ids.has(o.id)
        ? {
            ...o,
            isCancelled: true,
            cancelledBy: 'admin' as const,
            cancelReason: reason,
            ...(comment ? { cancelComment: comment } : {}),
            cancelledAt: at,
            // the journal return marks true itself when every line is back
            stockReturned: restoredBefore.has(o.id) || !o.items?.length,
            estimatedDelivery: 'Заказ отменен',
            // «Возврат средств» only for what was paid; an unpaid order keeps its payment status
            paymentStatus: o.paymentStatus === 'paid' ? ('refunded' as const) : o.paymentStatus,
            statusLog: [...(o.statusLog ?? []), statusLogEntry('cancelled', 'admin', { byUid: adminUid, note: reasonText })],
          }
        : o
    );
    const saved = await onUpdateOrders(updated);
    if (saved === false) return false;

    const notReturned: string[] = [];
    for (const ord of active) {
      if (restoredBefore.has(ord.id) || !ord.items?.length) continue;
      try {
        await returnCancelledOrderStock(ord, { operator: 'Администратор', fallbackToOrdered: true });
      } catch (err) {
        console.error(`Stock of the cancelled order ${ord.id} was not returned:`, err);
        notReturned.push(ord.id);
      }
    }
    const what = label ?? (active.length === 1 ? `Заказ № ${active[0].id} отменен` : `Отменено ${active.length} ${pluralRu(active.length, ['заказ', 'заказа', 'заказов'])}`);
    if (notReturned.length > 0) {
      onShowToast(`${what}. Не вернулись на склад товары заказов ${notReturned.map((id) => `№ ${id}`).join(', ')} — нажмите «Вернуть на склад» в карточке.`, 'error');
    } else {
      onShowToast(`${what}. Товары возвращены на склад.`, 'success');
    }
    return true;
  };

  // Unpaid orders past «Витрина» → «Отменять неоплаченные заказы через» are cancelled with their stock returned (stage 5
  // without Blaze: a made-up order does not hold the goods). Once per order while «Заказы» are open
  const unpaidCancelDays = storefrontSettings?.unpaidOrderCancelDays;
  const autoCancelTried = useRef(new Set<string>());
  const overdueKey = overdueUnpaidOrders(orders, unpaidCancelDays)
    .map((o) => o.id)
    .filter((id) => !autoCancelTried.current.has(id))
    .sort()
    .join(',');
  useEffect(() => {
    if (!overdueKey) return;
    const targets = overdueUnpaidOrders(orders, unpaidCancelDays).filter((o) => !autoCancelTried.current.has(o.id));
    targets.forEach((o) => autoCancelTried.current.add(o.id));
    const days = unpaidCancelDays ?? 0;
    void cancelOrdersAsAdmin(
      targets,
      UNPAID_CANCEL_REASON,
      `Отменён автоматически: не оплачен ${days} ${pluralRu(days, ['день', 'дня', 'дней'])}`,
      `Автоотмена: ${targets.length === 1 ? `заказ № ${targets[0].id} не оплачен` : `${targets.length} ${pluralRu(targets.length, ['заказ не оплачен', 'заказа не оплачены', 'заказов не оплачены'])}`} за ${days} ${pluralRu(days, ['день', 'дня', 'дней'])} и отменен${targets.length === 1 ? '' : 'ы'}`
    );
  }, [overdueKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /** «Удалить заказ» of an active order: first the cancellation with the stock return, then «Удалить навсегда» or «В архив» */
  const [cancelThenDelete, setCancelThenDelete] = useState(false);
  const [bulkCancelOrders, setBulkCancelOrders] = useState<Order[] | null>(null);

  /**
   * «Вернуть на склад» for a buyer's cancellation whose goods did not all get back (network, or an order older than
   * the stock journal): the same per-line return as the buyer's, lines already returned are skipped; a line without
   * a write-off entry gets back the ordered quantity.
   */
  const handleReturnCancelledStock = async (order: Order) => {
    setReturningStockOrderId(order.id);
    try {
      await returnCancelledOrderStock(order, { operator: 'Администратор', fallbackToOrdered: true });
      onShowToast(`Товары заказа № ${order.id} возвращены на склад`, 'success');
    } catch (err) {
      console.error('Stock return failed:', err);
      onShowToast(`Не сохранено: возврат товаров заказа № ${order.id} на склад. Проверьте соединение.`, 'error');
    } finally {
      setReturningStockOrderId(null);
    }
  };

  /** «Сохранить для заказа»: the requisites the buyer sees in this order (undefined — none) */
  const saveOrderPaymentDetails = async (order: Order, details: OrderPaymentDetails | undefined): Promise<boolean> => {
    const { paymentDetails: _old, ...rest } = order;
    const next: Order = details ? { ...rest, paymentDetails: details } : rest;
    const saved = await onUpdateOrders(orders.map((o) => (o.id === order.id ? next : o)));
    return saved !== false;
  };

  // «В архив» / «Из архива»: a cancelled order leaves the working list (or comes back to it)
  const handleArchiveOrder = (order: Order, archived: boolean) => {
    onUpdateOrders(orders.map((o) => (o.id === order.id ? { ...o, archived } : o)));
    onShowToast(archived ? `Заказ № ${order.id} в архиве` : `Заказ № ${order.id} снова в списке`, 'success');
  };

  // Delete Single Order Handler
  const handleDeleteSingleOrder = async () => {
    if (!orderToDelete) return;
    setIsDeletingOrder(true);
    try {
      await deleteOrderFromFirestore(orderToDelete.id);
      const updated = orders.filter((o) => o.id !== orderToDelete.id);
      onUpdateOrders(updated);
      onShowToast(`Заказ № ${orderToDelete.id} удален`, 'success');
      setOrderToDelete(null);
    } catch (err) {
      console.error('Delete order error:', err);
      onShowToast('Ошибка при удалении заказа', 'error');
    } finally {
      setIsDeletingOrder(false);
    }
  };

  // Order Adjustment Save Handler
  const handleSaveOrderAdjustment = async (updatedOrder: Order, log: OrderAdjustmentLog | null) => {
    const updated = orders.map((ord) => (ord.id === updatedOrder.id ? updatedOrder : ord));
    setSelectedOrderForAdjustment(null);
    // «Сохранено» only after the database accepted the write; a refusal already shows «Не сохранено: …»
    if ((await onUpdateOrders(updated)) === false) return;
    onShowToast(log ? 'Состав и сумма заказа сохранены' : 'Заказ сохранен', 'success');
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
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#2D3A4E] flex items-center gap-1.5">
            <Package className="w-4 h-4 text-accent" />
            Заказы
          </h3>
          <p className="text-xs text-[#4E5C70]">Статусы, оплата, доставка и остатки на складе</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => exportOrdersToCSV(filteredOrders)}
            disabled={filteredOrders.length === 0}
            className="py-1.5 px-3 neu-button rounded-xl text-xs font-bold text-[#2D3A4E] hover:text-accent flex items-center gap-1.5 cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
            placeholder="№ заказа, клиент, телефон или трек"
            aria-label="Поиск заказов"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-2.5 neu-inset rounded-xl text-xs text-[#2D3A4E] placeholder:text-[#56647A]"
          />
        </div>

        {/* Status chips: the common filter in one tap (Hick: 7 controls → chips + «Фильтры») */}
        {/* In rows, not a sideways strip: on a phone the hidden chips («К выдаче», «Отменены») were cut off */}
        <div role="radiogroup" aria-label="Статус заказа" className="flex flex-wrap gap-1.5">
          {statusChips.map((chip) => {
            const active = statusFilter === chip.value;
            return (
              <button
                key={chip.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setStatusFilter(chip.value)}
                className={`h-8 px-3 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1.5 cursor-pointer shrink-0 ${
                  active ? 'neu-pill-active' : 'neu-button text-[#2D3A4E] hover:text-accent'
                }`}
              >
                {chip.label}
                <span className={`text-[11px] ${active ? 'text-accent' : 'text-[#4E5C70]'}`}>{chip.count}</span>
              </button>
            );
          })}
        </div>

        {/* More filters & Bulk Selection Header Controls */}
        <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
          <button
            type="button"
            onClick={() => setShowMoreFilters((v) => !v)}
            aria-expanded={showMoreFilters}
            aria-controls="orders-more-filters"
            className={`h-[42px] px-3.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
              showMoreFilters ? 'neu-pill-active' : 'neu-button text-[#2D3A4E] hover:text-accent'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
            Фильтры{moreFiltersCount > 0 ? ` (${moreFiltersCount})` : ''}
          </button>

          {/* Bulk Selection Header Checkbox */}
          {filteredOrders.length > 0 && (
            <button
              onClick={handleToggleSelectAll}
              role="checkbox"
              aria-checked={
                selectedOrderIds.length === 0
                  ? false
                  : selectedOrderIds.length === filteredOrders.length
                  ? true
                  : 'mixed'
              }
              className={`h-[42px] text-[11px] font-bold px-3.5 rounded-xl cursor-pointer flex items-center gap-2 transition-all ml-auto whitespace-nowrap neu-button ${
                selectedOrderIds.length > 0 ? 'text-accent font-extrabold' : 'text-[#4E5C70] hover:text-[#2D3A4E]'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-md flex items-center justify-center transition-all ${
                  selectedOrderIds.length > 0 && selectedOrderIds.length === filteredOrders.length
                    ? 'neu-fill-accent text-white'
                    : selectedOrderIds.length > 0
                    ? 'neu-button text-accent'
                    : 'neu-button text-transparent border border-white/60'
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
        <div className="p-3.5 sm:p-4 neu-flat rounded-2xl sm:rounded-3xl border border-white/80 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Top Info & Actions Bar */}
          <div className="flex items-center justify-between gap-2.5 flex-wrap">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl neu-inset flex items-center justify-center text-accent shrink-0 font-extrabold">
                <Layers className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-extrabold text-[#2D3A4E] uppercase tracking-wider">
                    Пакетные действия
                  </span>
                  <span className="neu-inset px-2.5 py-0.5 rounded-lg text-[11px] font-extrabold text-accent">
                    Выбрано: {selectedOrderIds.length}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={handleBulkExportCSV}
                className="h-8 px-3 rounded-xl neu-button text-xs font-bold text-[#2D3A4E] hover:text-accent flex items-center gap-1.5 cursor-pointer transition-all shrink-0"
                title="Экспорт выбранных заказов в CSV файл"
              >
                <Download className="w-3.5 h-3.5 text-accent" />
                <span className="hidden xs:inline">Экспорт CSV</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedOrderIds([])}
                className="h-8 px-2.5 sm:px-3 rounded-xl neu-button text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] flex items-center gap-1 cursor-pointer transition-all shrink-0"
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
                options={(['assembling', 'in_transit', 'ready', 'delivered'] as const).map((st) => ({
                  value: st,
                  label: BULK_STATUS_LABELS[st],
                  sublabel: BULK_STATUS_HINTS[st],
                  icon: st === 'delivered'
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                    : st === 'ready'
                    ? <Clock className="w-3.5 h-3.5 text-warning" />
                    : st === 'in_transit'
                    ? <Truck className="w-3.5 h-3.5 text-accent" />
                    : <Package className="w-3.5 h-3.5 text-accent" />,
                }))}
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
                    const targets = orders.filter((o) => selectedOrderIds.includes(o.id) && !o.isCancelled);
                    if (targets.length === 0) onShowToast('Выбранные заказы уже отменены', 'info');
                    else setBulkCancelOrders(targets);
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

      {/* Period, payment status, delivery and payment method: behind «Фильтры» */}
      <div className="space-y-2">
        {showMoreFilters && (
          <div id="orders-more-filters" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs animate-in fade-in duration-150">
            <NeumorphicSelect
              value={dateFilter}
              onChange={(val) => setDateFilter(val as typeof dateFilter)}
              variant="inset"
              prefix="Период:"
              options={dateFilterOptions}
            />
            <NeumorphicSelect
              value={paymentStatusFilter}
              onChange={(val) => setPaymentStatusFilter(val as typeof paymentStatusFilter)}
              variant="inset"
              prefix="Статус оплаты:"
              options={[
                { value: 'all', label: 'Любой статус', icon: <DollarSign className="w-3.5 h-3.5 text-success" /> },
                { value: 'paid', label: 'Оплачен' },
                { value: 'pending', label: 'Ожидает оплаты' },
                { value: 'receipt_review', label: 'Чек на проверке' },
                { value: 'paid_on_delivery', label: 'При получении' },
                { value: 'refunded', label: 'Оформлен возврат' },
              ]}
            />
            <NeumorphicSelect
              value={deliveryFilter}
              onChange={setDeliveryFilter}
              variant="inset"
              prefix="Доставка:"
              options={[
                { value: 'all', label: 'Любой способ', icon: <Truck className="w-3.5 h-3.5 text-accent" /> },
                ...deliveryMethodNames.map((name) => ({ value: name, label: name })),
              ]}
            />
            <NeumorphicSelect
              value={paymentFilter}
              onChange={setPaymentFilter}
              variant="inset"
              prefix="Способ оплаты:"
              options={[
                { value: 'all', label: 'Любой способ', icon: <CreditCard className="w-3.5 h-3.5 text-accent" /> },
                ...paymentMethodNames.map((name) => ({ value: name, label: name })),
              ]}
            />
          </div>
        )}

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
          <div className="neu-inset rounded-2xl p-8 text-center space-y-2 text-[#4E5C70]">
            <Package className="w-8 h-8 mx-auto text-[#4E5C70]/60" />
            <p className="text-xs font-bold text-[#2D3A4E]">Заказы не найдены</p>
            <p className="text-xs">
              {orders.length === 0
                ? 'В магазине пока нет оформленных заказов'
                : 'Попробуйте изменить поисковый запрос или фильтры'}
            </p>
          </div>
        ) : (
          visibleOrders.map((ord, ordIdx) => {
            const statusInfo = STATUS_CONFIG[ord.status] || STATUS_CONFIG.accepted;
            const StatusIcon = statusInfo.icon;
            const payStatus = ord.paymentStatus || initialPaymentStatus(ord.paymentMethod ?? '');
            const payConfig = PAYMENT_STATUS_CONFIG[payStatus] || PAYMENT_STATUS_CONFIG.paid;
            const isAuditExpanded = expandedOrderAuditLogId === ord.id;
            const isEditingTrack = editingTrackOrderId === ord.id;
            const isEditingNote = editingNoteOrderId === ord.id;
            const carrierObj = TRACKING_CARRIERS.find((c) => c.id === (ord.trackingCompany || 'cdek')) || TRACKING_CARRIERS[0];
            const trackingUrl = ord.trackingNumber ? carrierObj.urlPrefix(ord.trackingNumber) : '';

            const isOrderSelected = selectedOrderIds.includes(ord.id);

            return (
              <div
                key={`admin-ord-${ord.id}-${ordIdx}`}
                className={`neu-inset rounded-2xl p-3.5 sm:p-4 space-y-3 border transition-all ${
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
                    <SelectCheckbox
                      checked={isOrderSelected}
                      onToggle={() => handleToggleSelectOrder(ord.id)}
                      label={`Выбрать заказ № ${ord.id}`}
                    />

                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-extrabold text-[#2D3A4E] font-mono">№ {ord.id}</span>
                      <button
                        onClick={() => handleCopyOrderId(ord.id)}
                        className="p-1.5 neu-button rounded-lg text-[#4E5C70] hover:text-accent cursor-pointer transition-all"
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
                      <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-warning-soft text-warning border border-warning/35">
                        Скорректирован
                      </span>
                    )}

                    {ord.isCancelled && (
                      <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-danger-soft text-danger border border-danger/35 flex items-center gap-1">
                        <XCircle className="w-2.5 h-2.5" aria-hidden="true" />
                        {cancelledByLabel(ord)}
                      </span>
                    )}
                    {isArchivedOrder(ord) && (
                      <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-[#D8DFE8] text-[#2D3A4E] border border-[#BAC5D5]">
                        В архиве
                      </span>
                    )}
                  </div>

                  {/* Top Right Badges & Dropdowns: Status & Payment Status */}
                  <div className="flex items-center justify-end w-full sm:w-auto sm:ml-auto gap-2 flex-wrap">
                    {/* Payment status and order status: Base UI menus — Escape closes only the menu (finding 38) */}
                    <AdminChoiceMenu
                      label="Статус оплаты"
                      value={payStatus}
                      choices={(['paid', 'pending', 'paid_on_delivery', 'refunded'] as NonNullable<Order['paymentStatus']>[])
                        .concat(payStatus === 'receipt_review' ? ['receipt_review'] : [])
                        .map((pst) => ({
                          value: pst,
                          label: PAYMENT_STATUS_CONFIG[pst].label,
                          icon: <span className={`w-2 h-2 rounded-full ${PAYMENT_STATUS_CONFIG[pst].dot}`} />,
                        }))}
                      onChoose={(pst) => handleUpdatePaymentStatus(ord.id, pst)}
                      triggerClassName={`h-8 py-1 px-2.5 rounded-xl text-[11px] font-extrabold flex items-center gap-1.5 border cursor-pointer ${payConfig.bg} ${payConfig.text} transition-all`}
                    >
                      <span className={`w-2 h-2 rounded-full ${payConfig.dot}`} aria-hidden="true" />
                      <span>{payConfig.label}</span>
                      <ChevronDown className="w-3 h-3 opacity-60" aria-hidden="true" />
                    </AdminChoiceMenu>

                    <AdminChoiceMenu
                      label="Статус заказа"
                      value={ord.status}
                      choices={flowStatuses(ord).map((st) => {
                        const OptIcon = STATUS_CONFIG[st].icon;
                        return { value: st, label: adminStatusLabel(ord, st), icon: <OptIcon className="w-3.5 h-3.5" /> };
                      })}
                      onChoose={(st) => handleUpdateOrderStatus(ord.id, st)}
                      triggerClassName={`h-8 py-1 px-3 rounded-xl text-xs font-extrabold flex items-center gap-1.5 border cursor-pointer ${statusInfo.bg} ${statusInfo.text} transition-all`}
                    >
                      <StatusIcon className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{adminStatusLabel(ord)}</span>
                      <ChevronDown className="w-3 h-3 ml-0.5 opacity-70" aria-hidden="true" />
                    </AdminChoiceMenu>
                  </div>
                </div>

                {/* Cancellation: who, when (to the second), why; a buyer's cancellation that did not return the goods */}
                {ord.isCancelled && (ord.cancelledBy || ord.cancelReason || ord.cancelledAt) && (
                  <div className="rounded-xl bg-danger-soft border border-danger/25 p-2.5 text-xs text-[#2D3A4E] space-y-1.5">
                    <p>
                      <strong className="text-danger">{cancelledByLabel(ord)}</strong>
                      {formatCancelledAt(ord) && <span> · {formatCancelledAt(ord)}</span>}
                    </p>
                    {cancelReasonText(ord) && (
                      <p>
                        <strong>Причина:</strong> {cancelReasonText(ord)}
                      </p>
                    )}
                    {ord.cancelledBy === 'customer' && ord.paymentStatus === 'paid' && (
                      <p className="font-bold text-danger">Заказ был оплачен — верните деньги покупателю.</p>
                    )}
                    {/* after the cancellation — two ways (owner's decision 03.10): to «Архив» or deleted for good */}
                    <div className="flex items-center gap-2 flex-wrap pt-0.5">
                      {!isArchivedOrder(ord) && (
                        <button
                          type="button"
                          onClick={() => handleArchiveOrder(ord, true)}
                          className="h-8 px-3 neu-button rounded-xl text-xs font-bold text-accent flex items-center gap-1.5 cursor-pointer"
                        >
                          <Archive className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>В архив</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setOrderToDelete(ord)}
                        className="h-8 px-3 neu-button rounded-xl text-xs font-bold text-danger flex items-center gap-1.5 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Удалить навсегда</span>
                      </button>
                    </div>
                    {ord.stockReturned === false && (
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="font-bold text-danger">Товары этого заказа ещё не вернулись на склад.</p>
                        <button
                          type="button"
                          onClick={() => handleReturnCancelledStock(ord)}
                          disabled={returningStockOrderId === ord.id}
                          className={`h-8 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                            returningStockOrderId === ord.id ? 'neu-button-disabled text-[#4E5C70]' : 'neu-button text-accent'
                          }`}
                        >
                          {returningStockOrderId === ord.id ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                          ) : (
                            <PackageCheck className="w-3.5 h-3.5" aria-hidden="true" />
                          )}
                          <span>Вернуть на склад</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* The buyer's browser did not take the stock of some lines (finding 8) */}
                {!ord.isCancelled && (untakenLines[ord.id]?.length ?? 0) > 0 && (
                  <div className="rounded-xl bg-warning-soft border border-warning/30 p-2.5 text-xs text-[#2D3A4E] flex items-center justify-between gap-2 flex-wrap">
                    <p>
                      <strong className="text-warning">Товар не списан со склада:</strong>{' '}
                      {untakenLines[ord.id].map((i) => ord.items[i]?.product?.title ?? `строка ${i + 1}`).join(', ')}. Связь у покупателя
                      оборвалась при оформлении.
                    </p>
                    <button
                      type="button"
                      onClick={() => handleTakeOrderStock(ord)}
                      disabled={takingStockOrderId === ord.id}
                      className={`h-8 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                        takingStockOrderId === ord.id ? 'neu-button-disabled text-[#4E5C70]' : 'neu-button text-accent'
                      }`}
                    >
                      {takingStockOrderId === ord.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <PackageCheck className="w-3.5 h-3.5" aria-hidden="true" />}
                      <span>Списать со склада</span>
                    </button>
                  </div>
                )}

                {/* Prices of an order from the browser are not checked by the database (stage 5 without Blaze) */}
                <AdminOrderPriceWarning order={ord} products={products} />

                {/* The buyer's receipt: confirm the payment or reject the receipt («Доработки 5») */}
                {isReceiptOnReview(ord) && onReviewReceipt && (
                  <AdminReceiptReview
                    order={ord}
                    onReview={onReviewReceipt}
                    onOpenChat={onOpenSupportChat ? () => onOpenSupportChat(ord.id, ord.customerName) : undefined}
                  />
                )}
                {!ord.isCancelled && (ord.paymentStatus ?? 'pending') === 'pending' && ord.paymentRejectReason && (
                  <p className="rounded-xl bg-danger-soft border border-danger/25 px-2.5 py-2 text-xs text-[#2D3A4E]">
                    <strong className="text-danger">Чек отклонён:</strong> {ord.paymentRejectReason}. Ждём новый чек от покупателя.
                  </p>
                )}

                {/* Items & Logistics Details */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 text-xs">
                  {/* Left: Items breakdown */}
                  <div className="md:col-span-7 space-y-2 min-w-0">
                    <div className="neu-inset-deep rounded-2xl p-3 space-y-2 overflow-hidden border border-white/40">
                      {(ord.items || []).map((it, idx) => (
                        <div
                          key={`admin-ord-it-${ord.id}-${it.id || idx}-${idx}`}
                          className="flex items-start gap-2 text-xs font-medium text-[#2D3A4E]"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0 mt-1.5" />
                          {/* the title gets the whole line; variant and quantity go below it */}
                          <div className="min-w-0 flex-1">
                            <p className="font-bold leading-snug">{it.product?.title || 'Товар каталога'}</p>
                            <p className="text-xs text-[#4E5C70] flex flex-wrap gap-x-2">
                              <span>{[it.selectedColor, it.selectedSize].filter(Boolean).join(', ')}</span>
                              <span className="font-bold text-accent whitespace-nowrap">
                                {it.quantity} шт. × {(it.product?.price || 0).toLocaleString('ru-RU')} ₽
                              </span>
                              {it.isPreorder && <span className="font-extrabold text-accent">Предзаказ</span>}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Internal Manager Note View & Inline Editor */}
                    <div className="neu-inset-deep rounded-2xl p-3 space-y-1.5 border border-white/40">
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
                            className="min-h-6 px-1 text-[11px] text-accent font-bold hover:underline flex items-center gap-1 cursor-pointer"
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
                            className="flex-1 px-2.5 py-1.5 rounded-lg neu-flat text-xs text-[#2D3A4E]"
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
                        <p className="text-xs text-[#2D3A4E] italic">
                          {ord.managerNote || 'Заметок по заказу нет'}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right: Logistics, Tracking Carrier & Total */}
                  <div className="md:col-span-5 space-y-2 text-[11px] text-[#4E5C70] min-w-0">
                    <div className="neu-inset-deep rounded-2xl p-3 space-y-2.5 overflow-hidden border border-white/40">
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
                        <strong>Адрес:</strong> {ord.deliveryAddress || 'не указан'}
                      </p>

                      <AdminOrderCopyCards order={ord} />

                      {!ord.isCancelled && ord.paymentStatus !== 'paid_on_delivery' && ord.paymentStatus !== 'refunded' && (
                        <AdminOrderPaymentBlock
                          order={ord}
                          templates={paymentTemplates}
                          onSave={(details) => saveOrderPaymentDetails(ord, details)}
                          onShowToast={onShowToast}
                        />
                      )}

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
                              <span className="text-[11px] text-[#4E5C70] font-medium neu-inset px-2 py-0.5 rounded-lg">
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
                                <strong className="text-accent font-extrabold">{carrierObj.name}</strong>
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
                                  className="text-[11px] text-accent font-bold hover:underline flex items-center gap-1 cursor-pointer neu-button px-2 py-0.5 rounded-lg transition-all"
                                >
                                  <Edit3 className="w-2.5 h-2.5" />
                                  <span>{ord.trackingNumber ? 'Изменить' : 'Добавить трек'}</span>
                                </button>
                              )}
                            </div>

                            {isEditingTrack ? (
                              <div className="neu-flat rounded-2xl p-3 border border-white/80 space-y-3 pt-2.5 animate-in fade-in duration-150">
                                {/* Neumorphic Carrier Selector (Clean inline grid with no overlapping popover) */}
                                <div className="space-y-1.5">
                                  <label className="text-[11px] font-extrabold text-[#4E5C70] uppercase tracking-wider block">
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
                                              ? 'neu-pill-active font-extrabold'
                                              : 'neu-button text-[#2D3A4E] hover:text-accent border border-white/70'
                                          }`}
                                        >
                                          <div className="flex items-center gap-2 min-w-0 flex-1">
                                            <div
                                              className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                                                isSelected
                                                  ? 'neu-pill-active'
                                                  : 'neu-button text-[#4E5C70]'
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
                                              <p className="text-xs text-[#4E5C70] truncate leading-tight mt-0.5 font-normal">
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
                                  <label className="text-[11px] font-extrabold text-[#4E5C70] uppercase tracking-wider block">
                                    Трек-номер отправления
                                  </label>
                                  <div className="relative">
                                    <input
                                      type="text"
                                      value={tempTrackValue}
                                      onChange={(e) => setTempTrackValue(e.target.value)}
                                      placeholder="Например: 1459203810"
                                      className="w-full px-3 py-2 pr-8 rounded-xl neu-inset text-xs font-mono font-bold text-[#2D3A4E] border border-white/60 focus:ring-2 focus:ring-accent/40 transition-all"
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
                                    className="px-3.5 py-1.5 neu-button rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer transition-all"
                                  >
                                    Отмена
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleSaveTracking(ord.id);
                                    }}
                                    className="px-4 py-1.5 neu-button-accent rounded-xl text-xs font-extrabold text-white hover:scale-102 active:neu-inset-deep transition-all cursor-pointer flex items-center gap-1.5"
                                  >
                                    <Save className="w-3.5 h-3.5" />
                                    <span>Сохранить</span>
                                  </button>
                                </div>
                              </div>
                            ) : ord.trackingNumber ? (
                              <div className="flex items-center justify-between gap-1 neu-inset rounded-lg p-1.5">
                                <span className="font-mono text-xs font-extrabold text-accent truncate">
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
                        <span className="text-sm font-extrabold text-accent">
                          {ord.totalPrice.toLocaleString('ru-RU')} ₽
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom Order Actions Bar (Neumorphic Inset Control Strip with Inset Buttons) */}
                <div className="neu-inset-deep rounded-2xl p-2 border border-white/40 flex items-center flex-wrap gap-1.5">
                  {/* Chat with Client Button */}
                  <button
                    onClick={() => {
                      if (onOpenSupportChat) {
                        onOpenSupportChat(ord.id, ord.customerName);
                      } else {
                        onShowToast(`Переход в чат с клиентом ${ord.customerName || ord.id}`, 'info');
                      }
                    }}
                    className="h-8 px-3 neu-button rounded-xl text-xs font-bold text-accent hover:text-[#2D3A4E] flex items-center gap-1.5 cursor-pointer transition-all border border-white/60"
                    title="Написать клиенту в чат поддержки"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-accent" />
                    <span>Чат с клиентом</span>
                  </button>

                  {/* Print Invoice / Receipt Button */}
                  <button
                    onClick={() => setSelectedOrderForInvoice(ord)}
                    className="h-8 px-3 neu-button rounded-xl text-xs font-bold text-[#2D3A4E] hover:text-accent flex items-center gap-1.5 cursor-pointer transition-all border border-white/60"
                    title="Сформировать и распечатать товарный чек или накладную"
                  >
                    <Printer className="w-3.5 h-3.5 text-accent" />
                    <span>Печать чека</span>
                  </button>

                  {/* Rarely used actions: «Ещё» menu; delete is the last item, after a line */}
                  <AdminActionMenu
                    actions={[
                      // a cancelled order already returned its goods: a second return here doubled the stock (finding 6)
                      ...(!ord.isCancelled
                        ? [
                            {
                              id: 'adjust',
                              label: 'Правка состава и склад',
                              icon: <SlidersHorizontal className="w-3.5 h-3.5 text-warning" />,
                              onSelect: () => setSelectedOrderForAdjustment(ord),
                            },
                          ]
                        : []),
                      // Удаление — только отменённого: сначала отмена с возвратом на склад (задание владельца 02.10)
                      ...(!ord.isCancelled
                        ? [
                            {
                              id: 'cancel',
                              label: 'Отменить и вернуть на склад',
                              icon: <RotateCcw className="w-3.5 h-3.5 text-danger" />,
                              onSelect: () => {
                                setCancelThenDelete(false);
                                setOrderToCancel(ord);
                              },
                              danger: true,
                              separatorBefore: true,
                            },
                            {
                              id: 'delete-active',
                              label: 'Удалить заказ',
                              icon: <Trash2 className="w-3.5 h-3.5" />,
                              onSelect: () => {
                                setCancelThenDelete(true);
                                setOrderToCancel(ord);
                              },
                              danger: true,
                            },
                          ]
                        : [
                            isArchivedOrder(ord)
                              ? {
                                  id: 'unarchive',
                                  label: 'Вернуть из архива',
                                  icon: <ArchiveRestore className="w-3.5 h-3.5 text-accent" />,
                                  onSelect: () => handleArchiveOrder(ord, false),
                                  separatorBefore: true,
                                }
                              : {
                                  id: 'archive',
                                  label: 'В архив',
                                  icon: <Archive className="w-3.5 h-3.5 text-accent" />,
                                  onSelect: () => handleArchiveOrder(ord, true),
                                  separatorBefore: true,
                                },
                            {
                              id: 'delete',
                              label: 'Удалить навсегда',
                              icon: <Trash2 className="w-3.5 h-3.5" />,
                              onSelect: () => setOrderToDelete(ord),
                              danger: true,
                              separatorBefore: true,
                            },
                          ]),
                    ]}
                  />

                  {/* «Забрать заказ»: courier and pickup orders on their way to the buyer, handed over by the code */}
                  {usesPickupCode(ord) && !ord.isCancelled && (ord.status === 'in_transit' || ord.status === 'ready') && (
                    <button
                      type="button"
                      onClick={() => openHandover(ord)}
                      aria-disabled={!canHandOver(ord)}
                      className={`h-8 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                        canHandOver(ord) ? 'neu-button text-success' : 'neu-button-disabled text-[#4E5C70]'
                      }`}
                      title={canHandOver(ord) ? 'Сверить код и выдать заказ' : 'Выдача невозможна: заказ не оплачен'}
                    >
                      <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Забрать заказ</span>
                    </button>
                  )}

                  {/* История заказа: every status with its time to the second and who changed it */}
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedOrderAuditLogId(isAuditExpanded ? null : ord.id)
                    }
                    aria-expanded={isAuditExpanded}
                    className={`h-8 px-3 rounded-xl text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition-all sm:ml-auto ${
                      isAuditExpanded ? 'neu-pill-active' : 'neu-button text-[#4E5C70] hover:text-accent'
                    }`}
                  >
                    <History className="w-3.5 h-3.5 text-accent" />
                    <span>История ({orderTimeline(ord, 'admin').length})</span>
                  </button>
                </div>

                {isAuditExpanded && (
                  <div className="neu-inset rounded-2xl p-3 animate-in fade-in">
                    <OrderTimeline order={ord} audience="admin" />
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

      <ConfirmDialog
        isOpen={pendingRestore !== null}
        title="Не хватает товара на складе"
        tone="neutral"
        confirmLabel="Восстановить всё равно"
        cancelLabel="Не восстанавливать"
        confirmIcon={<RotateCcw className="w-4 h-4" />}
        message={
          <>
            <span className="block">
              Пока заказ был отменён, эти товары продали. Если восстановить заказ, их остаток станет 0, а
              недостающее придётся докупить или согласовать с клиентом:
            </span>
            {/* the dialog message is a <p>: a list inside it would be invalid markup */}
            {pendingRestore?.shortages.map((s) => (
              <span key={`${s.productTitle}-${s.color}-${s.size}`} className="block mt-1 text-left font-semibold">
                {s.productTitle} · {s.color} · {s.size}: нужно {s.needed}, на складе {s.inStock}
              </span>
            ))}
          </>
        }
        onConfirm={() => {
          pendingRestore?.run();
          setPendingRestore(null);
        }}
        onClose={() => setPendingRestore(null)}
      />

      {/* ================= MODAL: ORDER ADJUSTMENT ================= */}
      <AdminOrderAdjustmentModal
        isOpen={!!selectedOrderForAdjustment}
        onClose={() => setSelectedOrderForAdjustment(null)}
        order={selectedOrderForAdjustment}
        products={products}
        onSaveAdjustment={handleSaveOrderAdjustment}
        promos={promos}
        onShowToast={onShowToast}
      />

      {/* ================= «ЗАБРАТЬ ЗАКАЗ» и ручное закрытие заказа у перевозчика ================= */}
      <AdminHandoverDialog
        order={handoverOrder}
        onConfirm={confirmHandover}
        onClose={() => setHandoverOrder(null)}
        onNewCode={async (order) => {
          const withCode = { ...order, pickupCode: generatePickupCode() };
          const saved = await onUpdateOrders(orders.map((o) => (o.id === order.id ? withCode : o)));
          if (saved === false) return;
          setHandoverOrder(withCode);
          onShowToast(`Новый код выдачи ${withCode.pickupCode}: старый больше не действует, покупатель видит новый в заказе`, 'success');
        }}
      />
      <ConfirmDialog
        isOpen={paidDespitePrices !== null}
        title="Отметить оплаченным?"
        tone="neutral"
        confirmLabel="Отметить оплаченным"
        cancelLabel="Не отмечать"
        confirmIcon={<CheckCircle2 className="w-4 h-4" />}
        message={
          <>
            Цены заказа № {paidDespitePrices?.id} не совпадают с каталогом:{' '}
            {paidDespitePrices ? orderPriceIssues(paidDespitePrices, products).join('; ') : ''}. Отмечайте, если поступила
            верная сумма.
          </>
        }
        onConfirm={() => {
          if (paidDespitePrices) handleUpdatePaymentStatus(paidDespitePrices.id, 'paid', true);
          setPaidDespitePrices(null);
        }}
        onClose={() => setPaidDespitePrices(null)}
      />
      <ConfirmDialog
        isOpen={orderToCloseManually !== null}
        title="Закрыть заказ вручную?"
        tone="neutral"
        confirmLabel="Закрыть заказ"
        cancelLabel="Не закрывать"
        confirmIcon={<CheckCircle2 className="w-4 h-4" />}
        message={
          <>
            Покупатель ещё не нажал «Я получил заказ». Закрывайте, если знаете, что заказ получен (у гостя этой кнопки
            нет). В истории заказа будет «Закрыт администратором».
          </>
        }
        onConfirm={() => {
          const order = orderToCloseManually;
          if (order) withRestoreCheck([order.id], () => applyOrderStatus(order.id, 'delivered', 'Закрыт администратором: покупатель не подтвердил получение'));
          setOrderToCloseManually(null);
        }}
        onClose={() => setOrderToCloseManually(null)}
      />

      <CancelOrderDialog
        order={orderToCancel}
        audience="admin"
        intent={cancelThenDelete ? 'delete' : 'cancel'}
        onConfirm={async (reason, comment) => {
          const target = orderToCancel;
          if (!target) return false;
          const done = await cancelOrdersAsAdmin([target], reason, comment);
          // «Удалить заказ»: cancelled and returned — now «Удалить навсегда» or «В архив»
          if (done && cancelThenDelete) setOrderToDelete({ ...target, isCancelled: true });
          return done;
        }}
        onClose={() => {
          setOrderToCancel(null);
          setCancelThenDelete(false);
        }}
      />

      <CancelOrderDialog
        order={bulkCancelOrders}
        audience="admin"
        onConfirm={async (reason, comment) => {
          const done = bulkCancelOrders ? await cancelOrdersAsAdmin(bulkCancelOrders, reason, comment) : false;
          if (done) setSelectedOrderIds([]);
          return done;
        }}
        onClose={() => setBulkCancelOrders(null)}
      />

      <ConfirmDialog
        isOpen={Boolean(pendingBulkClose)}
        title="Закрыть заказы вручную?"
        message={
          (pendingBulkClose?.length ?? 0) === 1
            ? 'Заказ Почты или ТК станет «Получен» без подтверждения покупателя. В истории будет «Закрыт администратором».'
            : `${pendingBulkClose?.length ?? 0} ${pluralRu(pendingBulkClose?.length ?? 0, ['заказ', 'заказа', 'заказов'])} Почты или ТК станут «Получен» без подтверждения покупателя. В истории будет «Закрыт администратором».`
        }
        confirmLabel="Закрыть заказы"
        confirmIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
        tone="neutral"
        onConfirm={() => {
          const ids = pendingBulkClose;
          if (ids) withRestoreCheck(ids, () => applyBulkStatusChange(ids, 'delivered'));
          setPendingBulkClose(null);
        }}
        onClose={() => setPendingBulkClose(null)}
      />

      {/* ================= MODAL: SINGLE ORDER DELETE CONFIRMATION ================= */}
      {orderToDelete && (
        <div className="admin-no-glow fixed inset-0 z-[100] bg-[#2D3A4E]/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in">
          <div ref={deleteOrderDialog.ref} {...deleteOrderDialog.props} className="neu-modal rounded-3xl max-w-md w-full p-5 space-y-4 my-auto border border-white/80">
            <div className="flex items-center gap-3 border-b border-[#BAC5D5]/40 pb-3">
              <div className="w-9 h-9 rounded-xl neu-flat-sm flex items-center justify-center text-danger shrink-0">
                <Trash2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 id={deleteOrderDialog.titleId} className="text-sm font-extrabold text-[#2D3A4E]">Заказ № {orderToDelete.id} отменён: удалить или в архив?</h3>
                <p className="text-xs text-[#4E5C70] truncate">{orderToDelete.customerName || 'Клиент'}</p>
              </div>
            </div>

            <p className="text-xs text-[#4E5C70]">
              Заказ № <strong className="text-[#2D3A4E]">{orderToDelete.id}</strong> на сумму <strong className="text-[#2D3A4E]">{orderToDelete.totalPrice.toLocaleString('ru-RU')} ₽</strong> отменён, товары вернулись на склад. «Удалить навсегда» — заказ пропадёт из «Клиентов» и из доли отмен, восстановить его нельзя. «В архив» — уйдёт из рабочего списка, но останется в истории.
            </p>

            {/* phone: one under another, the deletion first and the safe «Закрыть» last */}
            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setOrderToDelete(null)}
                disabled={isDeletingOrder}
                className="neu-button px-4 py-2 rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] transition-all cursor-pointer whitespace-nowrap"
              >
                Закрыть
              </button>
              {!isArchivedOrder(orderToDelete) && (
                <button
                  type="button"
                  onClick={() => {
                    handleArchiveOrder(orderToDelete, true);
                    setOrderToDelete(null);
                  }}
                  disabled={isDeletingOrder}
                  className="neu-button px-4 py-2 rounded-xl text-xs font-bold text-accent transition-all flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Archive className="w-3.5 h-3.5" />
                  <span>В архив</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleDeleteSingleOrder}
                disabled={isDeletingOrder}
                className="neu-button-danger px-4 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                {isDeletingOrder ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Удаление...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Удалить навсегда</span>
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
