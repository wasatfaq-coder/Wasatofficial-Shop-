import React, { useState, useEffect } from 'react';
import {
  X,
  Package,
  Plus,
  Minus,
  Trash2,
  AlertCircle,
  Check,
  RefreshCw,
  CreditCard,
  Sparkles,
  UserCheck,
  Truck,
} from 'lucide-react';
import { Order, CartItem, Product, OrderAdjustmentLog, PromoCode } from '../../types';
import { adjustedOrderTotals, refundedLinesText, variantStockDiff } from '../../utils/orderAdjustment';
import {
  groupOrderLines,
  isPackLine,
  packGroupCompositionText,
  removePackGroup,
  setPackGroupCount,
  unpackOrderGroup,
  unpackUnitPrice,
  type OrderLineGroup,
} from '../../shared/packLines';
import { NeumorphicSwitch } from '../NeumorphicSwitch';
import { m, AnimatePresence } from 'motion/react';
import { NeumorphicSelect } from '../NeumorphicSelect';
import {
  extractColorName,
  extractSizeName,
  stockShortages,
  type StockShortage,
} from '../../utils/inventory';
import { ConfirmDialog } from '../ConfirmDialog';
import { applyAdminStockChanges, type AdminStockChange } from '../../utils/firebaseSync';
import { adminStatusLabel, isCarrierOrder } from '../../utils/orderFlow';
import { OrderLineThumbImage } from '../ProductThumbImage';
import { toOrderLineProduct, linePrice, orderProductIds, isWholesaleLine } from '../../shared/orderLine';
import { WholesaleMark } from '../WholesaleMark';
import { useDialogA11y } from '../../utils/useDialogA11y';
import { sameValue, useUnsavedChanges } from '../../utils/unsavedChanges';
import { DiscardChangesDialog, useDiscardGuard } from '../DiscardChangesDialog';

interface AdminOrderAdjustmentModalProps {
  order: Order | null;
  products: Product[];
  isOpen: boolean;
  onClose: () => void;
  /** Resolves with false when the database refused the order: the window then stays open with the edits */
  onSaveAdjustment: (updatedOrder: Order, adjustmentLog: OrderAdjustmentLog | null) => Promise<boolean>;
  /** Promo codes: tells a percent code of the order (it keeps the order's own percent) from a fixed one */
  promos?: PromoCode[];
  /** Optional packGroup to immediately prompt for «Разобрать упаковку» when opened from the order card */
  initialUnpackGroup?: string | null;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

const ADJUSTMENT_REASONS = [
  'По согласованию с клиентом (изменение состава)',
  'Позиции нет в наличии на складе (частичный возврат)',
  'Клиент передумал и отказался от части позиций',
  'Замена размера / цвета до отправки со склада',
  'Удаление дублирующей позиции в заказе',
  'Индивидуальная скидка / пересчет стоимости',
];

export const AdminOrderAdjustmentModal: React.FC<AdminOrderAdjustmentModalProps> = ({
  order,
  products,
  isOpen,
  onClose,
  onSaveAdjustment,
  promos = [],
  initialUnpackGroup = null,
  onShowToast,
}) => {
  const [items, setItems] = useState<CartItem[]>(() =>
    order?.items
      ? order.items.map((it) => ({
          ...it,
          product: { ...it.product },
        }))
      : []
  );

  const [reason, setReason] = useState(ADJUSTMENT_REASONS[0]);
  const [customNote, setCustomNote] = useState('');
  const [refundDelivery, setRefundDelivery] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState(order?.trackingNumber || '');
  const [isAddingItem, setIsAddingItem] = useState(false);

  // New item selector state
  const [selectedProductId, setSelectedProductId] = useState<string>(products?.[0]?.id || '');
  const selectedProductToAdd = products?.find((p) => p.id === selectedProductId) || products?.[0];
  const [selectedColor, setSelectedColor] = useState<string>(selectedProductToAdd?.colors?.[0]?.name || '');
  const [selectedSize, setSelectedSize] = useState<string>(selectedProductToAdd?.sizes?.[0] || 'M');
  const [addQuantity, setAddQuantity] = useState<number>(1);

  // Changed items, a note or a track number: Escape, «×» and «Отмена» ask before the window closes
  const isAdjustmentDirty =
    isOpen &&
    Boolean(order) &&
    (!sameValue(items, order?.items ?? []) || refundDelivery || customNote.trim() !== '' || trackingNumber !== (order?.trackingNumber || ''));
  useUnsavedChanges(isAdjustmentDirty, 'Корректировка заказа');
  const guard = useDiscardGuard(isAdjustmentDirty, onClose);
  const dialog = useDialogA11y(isOpen && Boolean(order), guard.requestClose);

  // Sync items and tracking number when order prop changes
  useEffect(() => {
    if (order) {
      const cloned = order.items
        ? order.items.map((it) => ({
            ...it,
            product: { ...it.product },
          }))
        : [];
      setItems(cloned);
      setTrackingNumber(order.trackingNumber || '');
      setRefundDelivery(false);
      if (initialUnpackGroup) {
        const targetGroup = groupOrderLines(cloned).find(
          (g): g is Extract<OrderLineGroup, { kind: 'pack' }> =>
            g.kind === 'pack' && g.packGroup === initialUnpackGroup
        );
        setPendingUnpack(targetGroup ?? null);
      } else {
        setPendingUnpack(null);
      }
    }
  }, [order, initialUnpackGroup]);

  // Update color/size options when chosen product changes
  useEffect(() => {
    if (selectedProductToAdd) {
      setSelectedColor(selectedProductToAdd.colors?.[0]?.name || 'Черный');
      setSelectedSize(selectedProductToAdd.sizes?.[0] || 'M');
    }
  }, [selectedProductId, selectedProductToAdd]);

  // Order total before and after: items plus the order's delivery, minus its discount
  const initialTotal = order ? order.totalPrice : 0;
  // the delivery goes back only with money: a paid order (owner's decision 10.10, it is not taken off the goods twice)
  const paidDelivery = Number(order?.deliveryFee) || 0;
  // not for «Возврат средств»: without a sum it counts as refunded in full, and a sum here would bring it back as revenue
  const canRefundDelivery = paidDelivery > 0 && order?.paymentStatus === 'paid';
  const newTotals = order
    ? adjustedOrderTotals(order, items, promos, { refundDelivery: canRefundDelivery && refundDelivery })
    : null;
  const newItemsTotal = newTotals?.total ?? 0;
  const itemsChanged = Boolean(order) && !sameValue(items, order?.items ?? []);
  const deliveryRefund = newTotals ? Math.max(0, paidDelivery - newTotals.deliveryFee) : 0;
  const changed = itemsChanged || deliveryRefund > 0;
  const delta = initialTotal - newItemsTotal;
  const isRefund = delta > 0;
  const isExtraCharge = delta < 0;

  // Quantity controls
  const handleUpdateQuantity = (index: number, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveItem(index);
      return;
    }
    setItems((prev) =>
      prev.map((it, idx) => (idx === index ? { ...it, quantity: newQty } : it))
    );
  };

  const handleRemoveItem = (index: number) => {
    const itemToRemove = items[index];
    setItems((prev) => prev.filter((_, idx) => idx !== index));
    onShowToast(`Позиция "${itemToRemove.product.title}" удалена из заказа`, 'info');
  };

  const handleAddItemToOrder = () => {
    if (!selectedProductToAdd) return;
    // a line of a size pack is not a line to add items to: the pack changes only whole
    const existingIndex = items.findIndex(
      (it) =>
        !isPackLine(it) &&
        it.product.id === selectedProductToAdd.id &&
        it.selectedColor === selectedColor &&
        it.selectedSize === selectedSize
    );

    if (existingIndex > -1) {
      setItems((prev) =>
        prev.map((it, idx) =>
          idx === existingIndex ? { ...it, quantity: it.quantity + addQuantity } : it
        )
      );
    } else {
      const newItem: CartItem = {
        id: `adj-item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        product: toOrderLineProduct(selectedProductToAdd),
        selectedColor,
        selectedSize,
        quantity: addQuantity,
      };
      setItems((prev) => [...prev, newItem]);
    }

    setIsAddingItem(false);
    setAddQuantity(1);
    onShowToast(`Товар "${selectedProductToAdd.title}" добавлен в заказ`, 'success');
  };

  /** Stock changes between the order's items and the edited ones, by variant: what goes back, what is taken */
  const computeStockDiff = () => variantStockDiff(order?.items ?? [], items);

  const handlePackCount = (packGroup: string, count: number) => {
    if (count <= 0) {
      handleRemovePack(packGroup);
      return;
    }
    setItems((prev) => setPackGroupCount(prev, packGroup, count));
  };

  const handleRemovePack = (packGroup: string) => {
    const first = items.find((it) => it.packGroup === packGroup);
    setItems((prev) => removePackGroup(prev, packGroup));
    if (first) onShowToast(`Ростовка «${first.packTitle || first.product.title}» удалена из заказа`, 'info');
  };

  /** Pack group chosen for «Разобрать упаковку» (`broken-pack`, stage 19 follow-up) */
  const [pendingUnpack, setPendingUnpack] = useState<Extract<OrderLineGroup, { kind: 'pack' }> | null>(null);

  const handleConfirmUnpack = () => {
    if (!pendingUnpack) return;
    const catalogProduct = products.find((p) => p.id === pendingUnpack.item.product.id);
    const unitPrice = unpackUnitPrice(pendingUnpack, catalogProduct);
    setItems((prev) => unpackOrderGroup(prev, pendingUnpack.packGroup, catalogProduct));
    onShowToast(
      `Ростовка «${pendingUnpack.title}» разобрана по размерам (${unitPrice.toLocaleString('ru-RU')} ₽/шт.)`,
      'info'
    );
    setPendingUnpack(null);
  };

  /** Added goods that are not in stock: the admin sees the list and decides (audit 02.10, finding 6) */
  const [pendingShortages, setPendingShortages] = useState<StockShortage[] | null>(null);

  // the order is saved first and the stock changes only after the database accepted it (audit 29.10, finding 1):
  // a refused save (the buyer cancelled meanwhile, no network) used to leave the stock changed and the order not
  const [saving, setSaving] = useState(false);

  const handleConfirmAdjustment = async (acceptShortages = false) => {
    if (saving) return;
    if (items.length === 0) {
      onShowToast('Заказ не может быть пустым. Если заказ отменен полностью, измените статус на отменен.', 'error');
      return;
    }

    const isTK = !!order && isCarrierOrder(order);
    const effectiveTrackingNumber = isTK ? (trackingNumber.trim() || undefined) : undefined;

    // Only the track number changed: the items, the sum and the history stay as they were
    if (!changed) {
      setSaving(true);
      const saved = await onSaveAdjustment({ ...order, trackingNumber: effectiveTrackingNumber }, null);
      setSaving(false);
      if (saved) onClose();
      return;
    }

    if (!acceptShortages) {
      const shortages = stockShortages(products, computeStockDiff().addedItems);
      if (shortages.length > 0) {
        setPendingShortages(shortages);
        return;
      }
    }

    const now = new Date();
    const formattedDate = `${now.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })} в ${now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;

    const { returnedItems, addedItems } = computeStockDiff();

    // the refund names each model given back, so the order's history says what the money was for
    const summaryText = isRefund
      ? `Частичный возврат: ${delta.toLocaleString('ru-RU')} ₽ — ${refundedLinesText(returnedItems, deliveryRefund)}`
      : isExtraCharge
      ? `Добавлены позиции, доплата: ${Math.abs(delta).toLocaleString('ru-RU')} ₽`
      : `Состав скорректирован (${items.length} позиций, сумма осталась неизменной)`;

    const log: OrderAdjustmentLog = {
      id: `adj-log-${Date.now()}`,
      date: formattedDate,
      reason,
      previousTotal: initialTotal,
      newTotal: newItemsTotal,
      refundAmount: isRefund ? delta : undefined,
      additionalCharge: isExtraCharge ? Math.abs(delta) : undefined,
      note: customNote.trim() || undefined,
      changedItemsSummary: summaryText,
    };

    const existingLogs = order.adjustmentLogs || [];
    const updatedLogs = [log, ...existingLogs];

    // Add a step in order tracking history
    const adjustmentHistoryStep = {
      title: isRefund ? `Частичный возврат (${delta.toLocaleString('ru-RU')} ₽)` : 'Состав заказа скорректирован',
      date: formattedDate,
      completed: true,
      description: `${reason}. ${customNote ? `Примечание: ${customNote}` : ''}`,
    };

    const updatedHistorySteps = order.historySteps
      ? [...order.historySteps, adjustmentHistoryStep]
      : [
          { title: 'Заказ принят', date: order.date, completed: true },
          adjustmentHistoryStep,
        ];

    // Each change in its own transaction against the stock in the database now (not the browser's copy of the catalog)
    const toChange = (it: CartItem, sign: 1 | -1): AdminStockChange => ({
      productId: it.product.id,
      productTitle: it.product.title,
      color: extractColorName(it.selectedColor),
      size: extractSizeName(it.selectedSize),
      delta: sign * it.quantity,
    });
    const stockChanges = [
      ...returnedItems.filter((it) => !it.isPreorder).map((it) => toChange(it, 1)),
      ...addedItems.filter((it) => !it.isPreorder).map((it) => toChange(it, -1)),
    ];
    const applyStock = () => {
      if (stockChanges.length === 0) return;
      void applyAdminStockChanges(stockChanges, {
        orderId: order.id,
        reason: `Корректировка состава заказа: ${reason}`,
        operator: 'Администратор',
      })
        .then(({ failed }) => {
          if (failed.length > 0) {
            onShowToast(
              `Не изменён остаток: ${failed.map((c) => `${c.productTitle ?? c.productId} (${c.color}, ${c.size})`).join('; ')}. Проверьте «Склад и SKU».`,
              'error'
            );
          }
        })
        .catch((err) => {
          console.error(`Stock of the adjusted order ${order.id} was not changed:`, err);
          onShowToast('Заказ сохранён, но остатки не изменились. Проверьте «Склад и SKU»', 'error');
        });
    };

    const updatedOrder: Order = {
      ...order,
      items,
      // a product added or removed here: «Покупка подтверждена» of a review follows the lines
      productIds: orderProductIds(items),
      trackingNumber: effectiveTrackingNumber,
      totalPrice: newItemsTotal,
      deliveryFee: newTotals?.deliveryFee,
      discountAmount: newTotals?.discount || undefined,
      originalTotalPrice: order.originalTotalPrice || initialTotal,
      isAdjusted: true,
      refundAmount: (order.refundAmount || 0) + (isRefund ? delta : 0),
      adjustmentReason: reason,
      adjustmentLogs: updatedLogs,
      historySteps: updatedHistorySteps,
    };

    setSaving(true);
    const saved = await onSaveAdjustment(updatedOrder, log);
    setSaving(false);
    if (!saved) return;
    // the order is in the database: what it holds is the sum of its journal entries (orderHeldStock). An added line that
    // failed here is shown as not taken and taken later with «Списать со склада»; a removed one stays held by the order
    // until it is returned in «Склад и SKU» (the toast names it)
    applyStock();
    onClose();
  };

  return (
    <>
    <AnimatePresence>
      {isOpen && order && (
        <m.div
          key="order-adj-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="admin-no-glow fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
        >
          {/* Backdrop */}
          <div
            onClick={guard.requestClose}
            className="fixed inset-0 bg-text-primary/50 backdrop-blur-xs cursor-pointer"
          />

          <m.div
            ref={dialog.ref}
            {...dialog.props}
            key="order-adj-modal"
            initial={{ scale: 0.93, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.93, opacity: 0, y: 12 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="neu-modal rounded-3xl p-4 sm:p-6 max-w-2xl w-full text-text-primary space-y-4 my-auto relative max-h-[90vh] overflow-y-auto no-scrollbar z-10"
          >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 neu-divider-b pb-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl neu-flat-sm flex items-center justify-center text-accent shrink-0 mt-0.5">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 id={dialog.titleId} className="text-base font-extrabold text-text-primary leading-tight">
                  Корректировка состава заказа
                </h3>
                <span className="text-xs font-mono font-extrabold neu-inset px-2.5 py-0.5 rounded-lg text-accent shrink-0">
                  № {order.id}
                </span>
              </div>
              <p className="text-xs text-text-secondary font-medium leading-relaxed mt-1">
                Частичный возврат позиций и изменение комплектации до отправки клиенту
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={guard.requestClose}
            className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-text-secondary hover:text-text-primary cursor-pointer shrink-0"
            aria-label="Закрыть"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Customer & Status Bar */}
        <div className="neu-inset rounded-2xl p-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-text-secondary font-bold shrink-0">Статус заказа:</span>
            <span className="neu-flat px-2.5 py-1 rounded-lg font-extrabold text-accent">
              {adminStatusLabel(order)}
            </span>
          </div>
          <div className="flex items-center gap-2 text-text-secondary min-w-0">
            <span className="font-bold shrink-0">Адрес:</span>
            <span className="font-semibold text-text-primary truncate" title={order.deliveryAddress}>
              {order.deliveryAddress || 'Самовывоз / Не указан'}
            </span>
          </div>
        </div>

        {/* Items In Order Table / List */}
        <div className="neu-flat rounded-2xl p-4 sm:p-5 space-y-3 ">
          <div className="flex items-center justify-between">
            <label className="text-xs font-extrabold uppercase text-text-primary tracking-wider flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-accent" />
              Состав позиций в заказе ({items.length})
            </label>
            <button
              type="button"
              onClick={() => setIsAddingItem(!isAddingItem)}
              className="py-1.5 min-h-8 px-3 neu-button rounded-xl text-xs font-extrabold text-accent flex items-center gap-1.5 hover:scale-105 transition-transform cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Добавить товар</span>
            </button>
          </div>

          {/* Add New Item Panel */}
          {isAddingItem && (
            <div className="neu-flat rounded-2xl p-3.5 space-y-3 animate-in fade-in duration-150">
              <div className="flex items-center justify-between neu-divider-b pb-2">
                <span className="text-xs font-extrabold text-accent flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  Выбор товара для добавления
                </span>
                <button
                  type="button"
                  onClick={() => setIsAddingItem(false)}
                  className="min-h-8 inline-flex items-center px-2 text-xs text-text-secondary hover:text-text-primary font-bold cursor-pointer"
                >
                  Закрыть
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 text-xs">
                {/* Select Product */}
                <div className="sm:col-span-6">
                  <label className="text-[11px] font-bold text-text-secondary block mb-1">Товар</label>
                  <NeumorphicSelect
                    ariaLabel="Товар"
                    value={selectedProductId}
                    onChange={(val) => setSelectedProductId(val)}
                    options={products.map((p) => ({
                      value: p.id,
                      label: p.title,
                      sublabel: `${p.price.toLocaleString('ru-RU')} ₽`,
                    }))}
                  />
                </div>

                {/* Select Color */}
                <div className="sm:col-span-3">
                  <label className="text-[11px] font-bold text-text-secondary block mb-1">Цвет</label>
                  <NeumorphicSelect
                    ariaLabel="Цвет"
                    value={selectedColor}
                    onChange={(val) => setSelectedColor(val)}
                    options={(selectedProductToAdd?.colors || []).map((c) => ({
                      value: c.name,
                      label: c.name,
                    }))}
                  />
                </div>

                {/* Select Size */}
                <div className="sm:col-span-3">
                  <label className="text-[11px] font-bold text-text-secondary block mb-1">Размер</label>
                  <NeumorphicSelect
                    ariaLabel="Размер"
                    value={selectedSize}
                    onChange={(val) => setSelectedSize(val)}
                    options={(selectedProductToAdd?.sizes || []).map((sz) => ({
                      value: sz,
                      label: sz,
                    }))}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-text-secondary">Количество:</span>
                  <div className="flex items-center gap-1 neu-inset rounded-xl p-1">
                    <button
                      type="button"
                      onClick={() => setAddQuantity(Math.max(1, addQuantity - 1))}
                      className="w-8 h-8 neu-button rounded-lg flex items-center justify-center text-xs font-bold text-text-secondary"
                    >
                      -
                    </button>
                    <span className="w-6 text-center font-extrabold text-xs text-text-primary">{addQuantity}</span>
                    <button
                      type="button"
                      onClick={() => setAddQuantity(addQuantity + 1)}
                      className="w-8 h-8 neu-button rounded-lg flex items-center justify-center text-xs font-bold text-text-secondary"
                    >
                      +
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAddItemToOrder}
                  className="py-2 px-4 neu-button rounded-xl text-xs font-extrabold text-accent flex items-center gap-1.5 cursor-pointer hover:scale-105 transition-transform"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Добавить в заказ</span>
                </button>
              </div>
            </div>
          )}

          {/* List of current items in this order */}
          <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1 no-scrollbar">
            {items.length === 0 ? (
              <div className="neu-inset rounded-2xl p-4 text-center text-xs text-text-secondary">
                В заказе не осталось позиций. Заказ будет аннулирован или оформлен полный возврат.
              </div>
            ) : (
              groupOrderLines(items).map((group) => {
                if (group.kind === 'pack') {
                  const packName = `${group.item.product.title}, ${group.title} (${group.item.selectedColor})`;
                  return (
                    <div
                      key={group.packGroup}
                      className="neu-flat rounded-2xl p-3 sm:p-3.5 space-y-2.5 "
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <OrderLineThumbImage
                            line={group.item.product}
                            catalog={products}
                            alt={group.item.product.title}
                            className="w-12 h-12 rounded-xl object-cover shrink-0 neu-inset"
                          />
                          <div className="min-w-0 flex-1 space-y-1">
                            <p className="text-xs sm:text-sm font-extrabold text-text-primary leading-snug">
                              {group.item.product.title}
                            </p>
                            <div className="flex items-center gap-2 flex-wrap text-xs">
                              <span className="neu-inset px-2 py-0.5 rounded-lg text-[11px] font-bold text-text-primary">
                                {group.item.selectedColor}
                              </span>
                              <span className="neu-flat px-2 py-0.5 rounded-lg text-[11px] font-extrabold text-accent">
                                {group.title}
                              </span>
                            </div>
                            <p className="text-[11px] text-text-secondary font-medium">
                              {packGroupCompositionText(group.sizes)} · только целой упаковкой
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemovePack(group.packGroup)}
                          className="w-8 h-8 rounded-xl neu-button-danger flex items-center justify-center hover:scale-105 transition-transform cursor-pointer shrink-0"
                          title="Удалить ростовку из заказа (частичный возврат)"
                          aria-label={`Вернуть ростовку: ${packName}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex items-center justify-between neu-divider-t pt-2 flex-wrap gap-2">
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs font-extrabold text-text-primary">
                            {group.total.toLocaleString('ru-RU')} ₽
                          </span>
                          <span className="text-[11px] text-text-secondary font-medium">
                            ({group.packPrice.toLocaleString('ru-RU')} ₽/уп.)
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => setPendingUnpack(group)}
                            className="h-8 px-2.5 rounded-xl neu-button text-[11px] font-extrabold text-accent hover:text-text-primary cursor-pointer whitespace-nowrap"
                            title="Перевести ростовку в штучные строки по размерам"
                            aria-label={`Разобрать упаковку: ${packName}`}
                          >
                            Разобрать упаковку
                          </button>
                          <div className="flex items-center gap-1 neu-inset rounded-xl p-1">
                            <button
                              type="button"
                              onClick={() => handlePackCount(group.packGroup, group.packCount - 1)}
                              className="w-8 h-8 rounded-lg neu-button flex items-center justify-center text-xs font-extrabold text-text-secondary hover:text-text-primary cursor-pointer"
                              aria-label={`Уменьшить число упаковок: ${packName}`}
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="min-w-12 px-1 text-center text-xs font-extrabold text-text-primary">
                              {group.packCount} уп.
                            </span>
                            <button
                              type="button"
                              onClick={() => handlePackCount(group.packGroup, group.packCount + 1)}
                              className="w-8 h-8 rounded-lg neu-button flex items-center justify-center text-xs font-extrabold text-text-secondary hover:text-text-primary cursor-pointer"
                              aria-label={`Увеличить число упаковок: ${packName}`}
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }
                const { item, index: idx } = group;
                const itemTotal = linePrice(item) * item.quantity;
                return (
                  <div
                    key={item.id || idx}
                    className="neu-flat rounded-2xl p-3 sm:p-3.5 space-y-2.5 "
                  >
                    {/* Top Row: Thumbnail + Title & Tags + Remove Button */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <OrderLineThumbImage
                          line={item.product}
                          catalog={products}
                          alt={item.product.title}
                          className="w-12 h-12 rounded-xl object-cover shrink-0 neu-inset"
                        />
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="text-xs sm:text-sm font-extrabold text-text-primary leading-snug">
                            {item.product.title}
                          </p>
                          <div className="flex items-center gap-2 flex-wrap text-xs">
                            <span className="neu-inset px-2 py-0.5 rounded-lg text-[11px] font-bold text-text-primary">
                              {item.selectedColor}
                            </span>
                            <span className="neu-flat px-2 py-0.5 rounded-lg text-[11px] font-extrabold text-accent">
                              {item.selectedSize}
                            </span>
                            {isWholesaleLine(item) && <WholesaleMark />}
                          </div>
                        </div>
                      </div>

                      {/* Remove Button */}
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        className="w-8 h-8 rounded-xl neu-button-danger flex items-center justify-center hover:scale-105 transition-transform cursor-pointer shrink-0"
                        title="Удалить позицию из заказа (частичный возврат)"
                        aria-label={`Вернуть модель: ${item.product.title} (${item.selectedSize}, ${item.selectedColor})`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Bottom Row: Price per piece & Total + Quantity Stepper */}
                    <div className="flex items-center justify-between neu-divider-t pt-2 flex-wrap gap-2">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-extrabold text-text-primary">
                          {itemTotal.toLocaleString('ru-RU')} ₽
                        </span>
                        <span className="text-[11px] text-text-secondary font-medium">
                          ({linePrice(item).toLocaleString('ru-RU')} ₽/шт.)
                        </span>
                      </div>

                      {/* Quantity Stepper */}
                      <div className="flex items-center gap-1 neu-inset rounded-xl p-1">
                        <button
                          type="button"
                          onClick={() => handleUpdateQuantity(idx, item.quantity - 1)}
                          className="w-8 h-8 rounded-lg neu-button flex items-center justify-center text-xs font-extrabold text-text-secondary hover:text-text-primary cursor-pointer"
                          title="Уменьшить"
                          aria-label="Уменьшить"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-8 text-center text-xs font-extrabold text-text-primary">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleUpdateQuantity(idx, item.quantity + 1)}
                          className="w-8 h-8 rounded-lg neu-button flex items-center justify-center text-xs font-extrabold text-text-secondary hover:text-text-primary cursor-pointer"
                          title="Увеличить"
                          aria-label="Увеличить"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Reason for Modification */}
        <div className="neu-flat rounded-2xl p-4 sm:p-5 space-y-3 ">
          <label className="text-xs font-extrabold uppercase text-text-primary tracking-wider flex items-center gap-1.5">
            <UserCheck className="w-3.5 h-3.5 text-accent" />
            Причина корректировки / возврата *
          </label>
          <NeumorphicSelect
            ariaLabel="Причина корректировки"
            value={reason}
            onChange={(val) => setReason(val)}
            options={ADJUSTMENT_REASONS.map((r) => ({
              value: r,
              label: r,
            }))}
          />

          <input
            type="text"
            placeholder="Дополнительное примечание для менеджеров и клиента (необязательно)..."
            value={customNote}
            onChange={(e) => setCustomNote(e.target.value)}
            className="w-full px-3 py-2.5 neu-inset rounded-xl text-xs text-text-primary placeholder:text-text-muted"
          />
        </div>

        {/* Tracking Number Management Section - Only for Transport Companies */}
        {(() => {
          const isTK = !!order && isCarrierOrder(order);
          if (!isTK) {
            const dm = (order?.deliveryMethod || '').toLowerCase();
            const methodTypeLabel = dm.includes('самовывоз') || dm.includes('пункт выдачи')
              ? 'самовывоз'
              : dm.includes('экспресс')
              ? 'экспресс-доставка'
              : 'курьерская служба';

            return (
              <div className="neu-flat rounded-2xl p-4 sm:p-5 space-y-2 ">
                <label className="text-xs font-extrabold uppercase text-text-primary tracking-wider flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-accent" />
                  Трек-номер отправления
                </label>
                <div className="neu-inset rounded-xl p-3 text-[11px] text-text-secondary leading-relaxed">
                  Для способа доставки <strong>«{order?.deliveryMethod || 'Курьерская служба / Самовывоз'}»</strong> ({methodTypeLabel}) трек-номер не предусмотрен и не присваивается. Генерация трекинга доступна исключительно для отправлений через транспортные компании (СДЭК, Почта России, Boxberry).
                </div>
              </div>
            );
          }

          return (
            <div className="neu-flat rounded-2xl p-4 sm:p-5 space-y-3 ">
              <div className="flex items-center justify-between">
                <label className="text-xs font-extrabold uppercase text-text-primary tracking-wider flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-accent" />
                  Трек-номер отправления (ТК)
                </label>
                {trackingNumber.trim() ? (
                  <span className="text-[11px] font-bold text-success neu-flat px-2 py-0.5 rounded-lg">
                    Будет виден клиенту
                  </span>
                ) : (
                  <span className="text-[11px] font-bold text-warning neu-flat px-2 py-0.5 rounded-lg">
                    Уведомление об отсутствии
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="Трек-номер от службы доставки"
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    className="w-full pl-3 pr-8 py-2.5 neu-inset rounded-xl text-xs font-mono font-bold text-text-primary placeholder:text-text-muted placeholder:font-sans"
                  />
                  {trackingNumber && (
                    <button
                      type="button"
                      onClick={() => setTrackingNumber('')}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 inline-flex items-center justify-center rounded-lg text-text-secondary hover:text-text-primary cursor-pointer"
                      title="Очистить трек-номер"
                      aria-label="Очистить трек-номер"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

              </div>

              {/* Dynamic Preview Notice for Admin */}
              {trackingNumber.trim() ? (
                <div className="neu-inset rounded-xl p-2.5 text-[11px] text-text-primary flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-success shrink-0" />
                  <span>
                    Клиент увидит трек-номер <strong className="font-mono text-accent">{trackingNumber.trim()}</strong> для отслеживания в транспортной компании.
                  </span>
                </div>
              ) : (
                <div className="neu-tone-warning rounded-xl p-2.5 text-[11px] text-warning flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5 text-warning shrink-0" />
                  <span>
                    Пока трек-номер не указан, у клиента в личном кабинете будет отображаться сообщение: <em>«Трек-номер формируется транспортной компанией»</em>.
                  </span>
                </div>
              )}
            </div>
          );
        })()}

        {/* Financial Recalculation & Refund Banner */}
        <div className="neu-flat rounded-2xl p-4 space-y-2.5 ">
          <div className="flex items-center justify-between text-xs font-bold text-text-secondary">
            <span>{changed ? 'Было:' : 'Сумма заказа:'}</span>
            <span className={`font-bold text-text-primary ${changed ? 'line-through' : ''}`}>
              {initialTotal.toLocaleString('ru-RU')} ₽
            </span>
          </div>

          {newTotals && (
            <dl className="text-xs text-text-secondary space-y-1">
              <div className="flex items-center justify-between">
                <dt>Товары</dt>
                <dd className="font-bold text-text-primary">{newTotals.subtotal.toLocaleString('ru-RU')} ₽</dd>
              </div>
              {newTotals.discount > 0 && (
                <div className="flex items-center justify-between">
                  <dt>Скидка{order?.promoCode ? ` (${order.promoCode})` : ''}</dt>
                  <dd className="font-bold text-text-primary">−{newTotals.discount.toLocaleString('ru-RU')} ₽</dd>
                </div>
              )}
              <div className="flex items-center justify-between">
                <dt>Доставка</dt>
                <dd className="font-bold text-text-primary">
                  {deliveryRefund > 0
                    ? `возвращается ${deliveryRefund.toLocaleString('ru-RU')} ₽`
                    : newTotals.deliveryFee > 0
                    ? `${newTotals.deliveryFee.toLocaleString('ru-RU')} ₽`
                    : 'бесплатно'}
                </dd>
              </div>
            </dl>
          )}

          {canRefundDelivery && (
            <div className="flex items-center justify-between gap-3 text-xs">
              <span id="adjustment-refund-delivery" className="font-bold text-text-primary">
                Вернуть и доставку ({paidDelivery.toLocaleString('ru-RU')} ₽)
              </span>
              <NeumorphicSwitch
                checked={refundDelivery}
                onChange={setRefundDelivery}
                label={`Вернуть и доставку (${paidDelivery.toLocaleString('ru-RU')} ₽)`}
              />
            </div>
          )}

          <div className="flex items-center justify-between text-sm font-extrabold text-text-primary">
            <span>{changed ? 'Станет:' : 'Итого:'}</span>
            <span className="text-accent font-extrabold text-base">
              {newItemsTotal.toLocaleString('ru-RU')} ₽
            </span>
          </div>

          {/* Refund Notice */}
          {isRefund && (
            <div className="neu-tone-success rounded-2xl p-3 text-xs text-success flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <CreditCard className="w-4 h-4 text-success shrink-0" />
                <div>
                  <p className="font-extrabold text-success">
                    Сумма к возврату клиенту: {delta.toLocaleString('ru-RU')} ₽
                  </p>
                  <p className="text-xs text-success leading-tight">
                    Сайт денег не принимает: верните разницу клиенту тем же способом, каким он платил
                  </p>
                </div>
              </div>
              <span className="font-extrabold text-success text-sm whitespace-nowrap shrink-0">
                - {delta.toLocaleString('ru-RU')} ₽
              </span>
            </div>
          )}

          {isExtraCharge && (
            <div className="neu-tone-warning rounded-2xl p-3 text-xs text-warning flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 text-warning shrink-0" />
                <div>
                  <p className="font-extrabold text-warning">
                    Требуется доплата: {Math.abs(delta).toLocaleString('ru-RU')} ₽
                  </p>
                  <p className="text-xs text-warning leading-tight">
                    Согласуйте доплату с клиентом: сайт сам ее не запрашивает
                  </p>
                </div>
              </div>
              <span className="font-extrabold text-warning text-sm whitespace-nowrap shrink-0">
                + {Math.abs(delta).toLocaleString('ru-RU')} ₽
              </span>
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="pt-2 neu-divider-t flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={guard.requestClose}
            className="w-full sm:w-auto h-10 sm:h-11 px-4 sm:px-5 neu-button rounded-xl text-xs font-bold text-text-secondary hover:text-text-primary cursor-pointer text-center transition-all"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={() => void handleConfirmAdjustment()}
            disabled={saving}
            aria-busy={saving}
            className="w-full sm:w-auto h-10 sm:h-11 px-4 sm:px-5 neu-button-accent rounded-xl text-xs font-extrabold text-white cursor-pointer transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-wait"
          >
            <Check className="w-4 h-4 stroke-[3]" />
            <span>
              {saving
                ? 'Сохраняем…'
                : !changed
                ? 'Сохранить'
                : isRefund
                ? `Сохранить (к возврату ${delta.toLocaleString('ru-RU')} ₽)`
                : 'Сохранить изменения состава'}
            </span>
          </button>
        </div>
      </m.div>
    </m.div>
  )}
</AnimatePresence>
<DiscardChangesDialog {...guard.dialogProps} what="Изменения заказа" />
<ConfirmDialog
  isOpen={pendingShortages !== null}
  title="Не хватает на складе"
  tone="neutral"
  confirmLabel="Сохранить всё равно"
  cancelLabel="Вернуться к составу"
  confirmIcon={<Check className="w-4 h-4" />}
  message="Остаток этих вариантов уйдёт в ноль, недостающее придётся заказать у поставщика."
  preview={
    <ul className="text-xs text-text-primary space-y-0.5">
      {(pendingShortages ?? []).map((s) => (
        <li key={`${s.productTitle}-${s.color}-${s.size}`}>
          {s.productTitle} ({s.color}, {s.size}): нужно {s.needed}, на складе {s.inStock}
        </li>
      ))}
    </ul>
  }
  onConfirm={() => {
    setPendingShortages(null);
    void handleConfirmAdjustment(true);
  }}
  onClose={() => setPendingShortages(null)}
/>
<ConfirmDialog
  isOpen={pendingUnpack !== null}
  title="Разобрать упаковку по размерам?"
  tone="neutral"
  confirmLabel="Разобрать упаковку"
  cancelLabel="Оставить упаковкой"
  confirmIcon={<Check className="w-4 h-4" />}
  message={
    pendingUnpack
      ? `Ростовка станет отдельными строками по размерам по цене ${unpackUnitPrice(
          pendingUnpack,
          products.find((p) => p.id === pendingUnpack.item.product.id)
        ).toLocaleString('ru-RU')} ₽/шт. После этого можно изменить количество или убрать отдельный размер.`
      : ''
  }
  preview={
    pendingUnpack ? (
      <div className="text-xs text-text-primary space-y-0.5">
        <p className="font-bold">
          {pendingUnpack.item.product.title} — {pendingUnpack.title} ({pendingUnpack.item.selectedColor})
        </p>
        <p className="text-text-secondary">
          {packGroupCompositionText(pendingUnpack.sizes)} · {pendingUnpack.packCount} уп. ({pendingUnpack.pieces} шт.)
        </p>
      </div>
    ) : undefined
  }
  onConfirm={handleConfirmUnpack}
  onClose={() => setPendingUnpack(null)}
/>
</>
);
};
