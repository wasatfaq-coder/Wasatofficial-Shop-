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
  ArrowRight,
  Sparkles,
  Info,
  ShieldCheck,
  UserCheck,
  Truck,
  Copy,
} from 'lucide-react';
import { Order, CartItem, Product, OrderAdjustmentLog } from '../../types';
import { motion, AnimatePresence } from 'motion/react';
import { NeumorphicSelect } from '../NeumorphicSelect';
import { deductStockWithLogs, returnStockWithLogs, extractColorName, extractSizeName } from '../../utils/inventory';
import { isTransportCompanyDelivery } from '../../utils/deliveryStages';

interface AdminOrderAdjustmentModalProps {
  order: Order | null;
  products: Product[];
  isOpen: boolean;
  onClose: () => void;
  onSaveAdjustment: (updatedOrder: Order, adjustmentLog: OrderAdjustmentLog) => void;
  onUpdateProducts?: (updated: Product[]) => void;
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
  onUpdateProducts,
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
  const [trackingNumber, setTrackingNumber] = useState(order?.trackingNumber || '');
  const [isAddingItem, setIsAddingItem] = useState(false);

  // New item selector state
  const [selectedProductId, setSelectedProductId] = useState<string>(products?.[0]?.id || '');
  const selectedProductToAdd = products?.find((p) => p.id === selectedProductId) || products?.[0];
  const [selectedColor, setSelectedColor] = useState<string>(selectedProductToAdd?.colors?.[0]?.name || '');
  const [selectedSize, setSelectedSize] = useState<string>(selectedProductToAdd?.sizes?.[0] || 'M');
  const [addQuantity, setAddQuantity] = useState<number>(1);

  // Sync items and tracking number when order prop changes
  useEffect(() => {
    if (order) {
      if (order.items) {
        setItems(
          order.items.map((it) => ({
            ...it,
            product: { ...it.product },
          }))
        );
      }
      setTrackingNumber(order.trackingNumber || '');
    }
  }, [order]);

  // Update color/size options when chosen product changes
  useEffect(() => {
    if (selectedProductToAdd) {
      setSelectedColor(selectedProductToAdd.colors?.[0]?.name || 'Черный');
      setSelectedSize(selectedProductToAdd.sizes?.[0] || 'M');
    }
  }, [selectedProductId, selectedProductToAdd]);

  // Initial order total vs updated items total
  const initialTotal = order ? order.totalPrice : 0;
  const newItemsTotal = items.reduce((sum, it) => sum + (it.product.price || 0) * it.quantity, 0);
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
    const existingIndex = items.findIndex(
      (it) =>
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
        product: selectedProductToAdd,
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

  const handleConfirmAdjustment = () => {
    if (items.length === 0) {
      onShowToast('Заказ не может быть пустым. Если заказ отменен полностью, измените статус на отменен.', 'error');
      return;
    }

    const now = new Date();
    const formattedDate = `${now.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })} в ${now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;

    const removedOrChangedCount = order.items.length - items.length;
    const summaryText = isRefund
      ? `Частичный возврат: ${delta.toLocaleString('ru-RU')} ₽ (состав изменен: ${items.length} позиций)`
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

    // Calculate stock changes between original order items and new adjusted items
    const returnedItems: CartItem[] = [];
    const addedItems: CartItem[] = [];

    // Check items from previous order that were removed or reduced
    (order.items || []).forEach((origItem) => {
      const origColor = extractColorName(origItem.selectedColor).toLowerCase();
      const origSize = extractSizeName(origItem.selectedSize).toLowerCase();
      const matched = items.find(
        (it) =>
          it.product.id === origItem.product.id &&
          extractColorName(it.selectedColor).toLowerCase() === origColor &&
          extractSizeName(it.selectedSize).toLowerCase() === origSize
      );

      if (!matched) {
        // Completely removed from order -> return full quantity to warehouse
        returnedItems.push(origItem);
      } else if (matched.quantity < origItem.quantity) {
        // Reduced quantity -> return delta to warehouse
        returnedItems.push({
          ...origItem,
          quantity: origItem.quantity - matched.quantity,
        });
      }
    });

    // Check items that were newly added or increased in quantity
    items.forEach((newItem) => {
      const newColor = extractColorName(newItem.selectedColor).toLowerCase();
      const newSize = extractSizeName(newItem.selectedSize).toLowerCase();
      const matched = (order.items || []).find(
        (it) =>
          it.product.id === newItem.product.id &&
          extractColorName(it.selectedColor).toLowerCase() === newColor &&
          extractSizeName(it.selectedSize).toLowerCase() === newSize
      );

      if (!matched) {
        // Brand new item added -> deduct from warehouse
        addedItems.push(newItem);
      } else if (newItem.quantity > matched.quantity) {
        // Increased quantity -> deduct delta from warehouse
        addedItems.push({
          ...newItem,
          quantity: newItem.quantity - matched.quantity,
        });
      }
    });

    let currentProducts = [...products];

    // Apply returns if any
    if (returnedItems.length > 0) {
      const resReturn = returnStockWithLogs(
        currentProducts,
        returnedItems,
        order.id,
        `Корректировка состава заказа: ${reason}`,
        'Менеджер склада'
      );
      currentProducts = resReturn.updatedProducts;
    }

    // Apply deductions if any
    if (addedItems.length > 0) {
      const resDeduct = deductStockWithLogs(
        currentProducts,
        addedItems,
        order.id,
        'Менеджер склада (добавление в заказ)'
      );
      currentProducts = resDeduct.updatedProducts;
    }

    if (onUpdateProducts && (returnedItems.length > 0 || addedItems.length > 0)) {
      onUpdateProducts(currentProducts);
    }

    const isTK = isTransportCompanyDelivery(order?.deliveryMethod, order?.trackingCompany);
    const effectiveTrackingNumber = isTK ? (trackingNumber.trim() || undefined) : undefined;

    const updatedOrder: Order = {
      ...order,
      items,
      trackingNumber: effectiveTrackingNumber,
      totalPrice: newItemsTotal,
      originalTotalPrice: order.originalTotalPrice || initialTotal,
      isAdjusted: true,
      refundAmount: (order.refundAmount || 0) + (isRefund ? delta : 0),
      adjustmentReason: reason,
      adjustmentLogs: updatedLogs,
      historySteps: updatedHistorySteps,
    };

    onSaveAdjustment(updatedOrder, log);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && order && (
        <motion.div
          key="order-adj-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="admin-no-glow fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
        >
          {/* Backdrop */}
          <div
            onClick={onClose}
            className="fixed inset-0 bg-[#2D3A4E]/50 backdrop-blur-xs cursor-pointer"
          />

          <motion.div
            key="order-adj-modal"
            initial={{ scale: 0.93, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.93, opacity: 0, y: 12 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="neu-modal rounded-3xl p-4 sm:p-6 max-w-2xl w-full text-[#2D3A4E] space-y-4 my-auto relative border border-white/80 max-h-[90vh] overflow-y-auto no-scrollbar z-10"
          >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[#BAC5D5]/50 pb-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl neu-button flex items-center justify-center text-accent shrink-0 mt-0.5">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-black text-[#2D3A4E] leading-tight">
                  Корректировка состава заказа
                </h3>
                <span className="text-xs font-mono font-black neu-inset px-2.5 py-0.5 rounded-lg text-accent bg-[#E3E8EF] shrink-0">
                  № {order.id}
                </span>
              </div>
              <p className="text-xs text-[#4E5C70] font-medium leading-relaxed mt-1">
                Частичный возврат позиций и изменение комплектации до отправки клиенту
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer shrink-0"
            aria-label="Закрыть"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Customer & Status Bar */}
        <div className="neu-inset rounded-2xl p-3 bg-[#E3E8EF] grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-[#4E5C70] font-bold shrink-0">Статус заказа:</span>
            <span className="neu-flat px-2.5 py-1 rounded-lg font-black text-accent">
              {order.status === 'accepted' && 'Принят в обработку'}
              {order.status === 'assembling' && 'На сборке'}
              {order.status === 'in_transit' && 'В пути'}
              {order.status === 'ready' && 'Готов к выдаче'}
              {order.status === 'delivered' && 'Доставлен'}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[#4E5C70] min-w-0">
            <span className="font-bold shrink-0">Адрес:</span>
            <span className="font-semibold text-[#2D3A4E] truncate" title={order.deliveryAddress}>
              {order.deliveryAddress || 'Самовывоз / Не указан'}
            </span>
          </div>
        </div>

        {/* Items In Order Table / List */}
        <div className="neu-flat rounded-2xl p-4 sm:p-5 space-y-3 bg-[#E3E8EF] border border-white/60">
          <div className="flex items-center justify-between">
            <label className="text-xs font-black uppercase text-[#2D3A4E] tracking-wider flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-accent" />
              Состав позиций в заказе ({items.length})
            </label>
            <button
              type="button"
              onClick={() => setIsAddingItem(!isAddingItem)}
              className="py-1.5 px-3 neu-button rounded-xl text-xs font-extrabold text-accent flex items-center gap-1.5 hover:scale-105 transition-transform cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Добавить товар</span>
            </button>
          </div>

          {/* Add New Item Panel */}
          {isAddingItem && (
            <div className="neu-flat rounded-2xl p-3.5 bg-[#E3E8EF] border border-accent/30 space-y-3 animate-in fade-in duration-150">
              <div className="flex items-center justify-between border-b border-[#BAC5D5]/40 pb-2">
                <span className="text-xs font-extrabold text-accent flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  Выбор товара для добавления
                </span>
                <button
                  type="button"
                  onClick={() => setIsAddingItem(false)}
                  className="text-xs text-[#4E5C70] hover:text-[#2D3A4E] font-bold"
                >
                  Закрыть
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 text-xs">
                {/* Select Product */}
                <div className="sm:col-span-6">
                  <label className="text-[11px] font-bold text-[#4E5C70] block mb-1">Товар</label>
                  <NeumorphicSelect
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
                  <label className="text-[11px] font-bold text-[#4E5C70] block mb-1">Цвет</label>
                  <NeumorphicSelect
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
                  <label className="text-[11px] font-bold text-[#4E5C70] block mb-1">Размер</label>
                  <NeumorphicSelect
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
                  <span className="text-xs font-bold text-[#4E5C70]">Количество:</span>
                  <div className="flex items-center gap-1 neu-inset rounded-xl p-1 bg-[#E3E8EF]">
                    <button
                      type="button"
                      onClick={() => setAddQuantity(Math.max(1, addQuantity - 1))}
                      className="w-6 h-6 neu-button rounded-lg flex items-center justify-center text-xs font-bold text-[#4E5C70]"
                    >
                      -
                    </button>
                    <span className="w-6 text-center font-black text-xs text-[#2D3A4E]">{addQuantity}</span>
                    <button
                      type="button"
                      onClick={() => setAddQuantity(addQuantity + 1)}
                      className="w-6 h-6 neu-button rounded-lg flex items-center justify-center text-xs font-bold text-[#4E5C70]"
                    >
                      +
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAddItemToOrder}
                  className="py-2 px-4 neu-button rounded-xl text-xs font-black text-accent flex items-center gap-1.5 cursor-pointer hover:scale-105 transition-transform"
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
              <div className="neu-inset rounded-2xl p-4 text-center text-xs text-[#4E5C70] bg-[#E3E8EF]">
                В заказе не осталось позиций. Заказ будет аннулирован или оформлен полный возврат.
              </div>
            ) : (
              items.map((item, idx) => {
                const itemTotal = (item.product.price || 0) * item.quantity;
                return (
                  <div
                    key={item.id || idx}
                    className="neu-flat rounded-2xl p-3 sm:p-3.5 bg-[#E3E8EF] space-y-2.5 border border-white/70"
                  >
                    {/* Top Row: Thumbnail + Title & Tags + Remove Button */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <img
                          src={item.product.images?.[0] || 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=200'}
                          alt={item.product.title}
                          className="w-12 h-12 rounded-xl object-cover shrink-0 neu-inset"
                        />
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="text-xs sm:text-sm font-black text-[#2D3A4E] leading-snug">
                            {item.product.title}
                          </p>
                          <div className="flex items-center gap-2 flex-wrap text-xs">
                            <span className="neu-inset px-2 py-0.5 rounded-lg text-[11px] font-bold text-[#2D3A4E] bg-[#E3E8EF]">
                              {item.selectedColor}
                            </span>
                            <span className="neu-flat px-2 py-0.5 rounded-lg text-[11px] font-black text-accent">
                              {item.selectedSize}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Remove Button */}
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        className="w-8 h-8 rounded-xl neu-button-danger flex items-center justify-center hover:scale-105 transition-transform cursor-pointer shrink-0"
                        title="Удалить позицию из заказа (частичный возврат)"
                        aria-label="Удалить позицию из заказа (частичный возврат)"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Bottom Row: Price per piece & Total + Quantity Stepper */}
                    <div className="flex items-center justify-between border-t border-[#BAC5D5]/40 pt-2 flex-wrap gap-2">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-black text-[#2D3A4E]">
                          {itemTotal.toLocaleString('ru-RU')} ₽
                        </span>
                        <span className="text-[11px] text-[#4E5C70] font-medium">
                          ({(item.product.price || 0).toLocaleString('ru-RU')} ₽/шт.)
                        </span>
                      </div>

                      {/* Quantity Stepper */}
                      <div className="flex items-center gap-1 neu-inset rounded-xl p-1 bg-[#E3E8EF]">
                        <button
                          type="button"
                          onClick={() => handleUpdateQuantity(idx, item.quantity - 1)}
                          className="w-7 h-7 rounded-lg neu-button flex items-center justify-center text-xs font-black text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer"
                          title="Уменьшить"
                          aria-label="Уменьшить"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-8 text-center text-xs font-black text-[#2D3A4E]">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleUpdateQuantity(idx, item.quantity + 1)}
                          className="w-7 h-7 rounded-lg neu-button flex items-center justify-center text-xs font-black text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer"
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
        <div className="neu-flat rounded-2xl p-4 sm:p-5 space-y-3 bg-[#E3E8EF] border border-white/60">
          <label className="text-xs font-black uppercase text-[#2D3A4E] tracking-wider flex items-center gap-1.5">
            <UserCheck className="w-3.5 h-3.5 text-accent" />
            Причина корректировки / возврата *
          </label>
          <NeumorphicSelect
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
            className="w-full px-3 py-2.5 neu-inset rounded-xl text-xs text-[#2D3A4E] placeholder:text-[#56647A] bg-[#E3E8EF]"
          />
        </div>

        {/* Tracking Number Management Section - Only for Transport Companies */}
        {(() => {
          const isTK = isTransportCompanyDelivery(order?.deliveryMethod, order?.trackingCompany);
          if (!isTK) {
            const dm = (order?.deliveryMethod || '').toLowerCase();
            const methodTypeLabel = dm.includes('самовывоз') || dm.includes('пункт выдачи')
              ? 'самовывоз'
              : dm.includes('экспресс')
              ? 'экспресс-доставка'
              : 'курьерская служба';

            return (
              <div className="neu-flat rounded-2xl p-4 sm:p-5 space-y-2 bg-[#E3E8EF] border border-white/60">
                <label className="text-xs font-black uppercase text-[#2D3A4E] tracking-wider flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-accent" />
                  Трек-номер отправления
                </label>
                <div className="neu-inset rounded-xl p-3 bg-[#E3E8EF] text-[11px] text-[#4E5C70] leading-relaxed">
                  Для способа доставки <strong>«{order?.deliveryMethod || 'Курьерская служба / Самовывоз'}»</strong> ({methodTypeLabel}) трек-номер не предусмотрен и не присваивается. Генерация трекинга доступна исключительно для отправлений через транспортные компании (СДЭК, Почта России, Boxberry).
                </div>
              </div>
            );
          }

          return (
            <div className="neu-flat rounded-2xl p-4 sm:p-5 space-y-3 bg-[#E3E8EF] border border-white/60">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black uppercase text-[#2D3A4E] tracking-wider flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-accent" />
                  Трек-номер отправления (ТК)
                </label>
                {trackingNumber.trim() ? (
                  <span className="text-[11px] font-bold text-success neu-flat px-2 py-0.5 rounded-lg bg-success-soft">
                    Будет виден клиенту
                  </span>
                ) : (
                  <span className="text-[11px] font-bold text-warning neu-flat px-2 py-0.5 rounded-lg bg-warning-soft">
                    Уведомление об отсутствии
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="Например: CDEK-84920194..."
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    className="w-full pl-3 pr-8 py-2.5 neu-inset rounded-xl text-xs font-mono font-bold text-[#2D3A4E] placeholder:text-[#56647A] placeholder:font-sans bg-[#E3E8EF]"
                  />
                  {trackingNumber && (
                    <button
                      type="button"
                      onClick={() => setTrackingNumber('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer"
                      title="Очистить трек-номер"
                      aria-label="Очистить трек-номер"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const randCode = Math.floor(10000000 + Math.random() * 90000000);
                    const generated = `CDEK-${randCode}`;
                    setTrackingNumber(generated);
                    onShowToast(`Сгенерирован трек-номер: ${generated}`, 'success');
                  }}
                  className="py-2.5 px-3 neu-button rounded-xl text-xs font-bold text-accent hover:scale-105 active:scale-95 transition-transform cursor-pointer shrink-0"
                  title="Сгенерировать CDEK трек-код"
                >
                  + CDEK
                </button>
              </div>

              {/* Dynamic Preview Notice for Admin */}
              {trackingNumber.trim() ? (
                <div className="neu-inset rounded-xl p-2.5 bg-[#E3E8EF] text-[11px] text-[#2D3A4E] flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-success shrink-0" />
                  <span>
                    Клиент увидит трек-номер <strong className="font-mono text-accent">{trackingNumber.trim()}</strong> для отслеживания в транспортной компании.
                  </span>
                </div>
              ) : (
                <div className="neu-inset rounded-xl p-2.5 bg-warning-soft border border-warning/70 text-[11px] text-warning flex items-center gap-2">
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
        <div className="neu-flat rounded-2xl p-4 space-y-2.5 bg-[#E3E8EF] border border-white/80">
          <div className="flex items-center justify-between text-xs font-bold text-[#4E5C70]">
            <span>Исходная сумма заказа:</span>
            <span className="line-through font-bold text-[#2D3A4E]">
              {initialTotal.toLocaleString('ru-RU')} ₽
            </span>
          </div>

          <div className="flex items-center justify-between text-sm font-extrabold text-[#2D3A4E]">
            <span>Новая итоговая сумма:</span>
            <span className="text-accent font-black text-base">
              {newItemsTotal.toLocaleString('ru-RU')} ₽
            </span>
          </div>

          {/* Refund Notice */}
          {isRefund && (
            <div className="neu-inset rounded-2xl p-3 bg-success-soft border border-success/70 text-xs text-success flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <CreditCard className="w-4 h-4 text-success shrink-0" />
                <div>
                  <p className="font-extrabold text-success">
                    Сумма к возврату клиенту: {delta.toLocaleString('ru-RU')} ₽
                  </p>
                  <p className="text-[11px] text-success leading-tight">
                    Автоматический возврат на банковскую карту клиента в течение 1–3 дней
                  </p>
                </div>
              </div>
              <span className="font-black text-success text-sm whitespace-nowrap shrink-0">
                - {delta.toLocaleString('ru-RU')} ₽
              </span>
            </div>
          )}

          {isExtraCharge && (
            <div className="neu-inset rounded-2xl p-3 bg-warning-soft border border-warning/70 text-xs text-warning flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 text-warning shrink-0" />
                <div>
                  <p className="font-extrabold text-warning">
                    Требуется доплата: {Math.abs(delta).toLocaleString('ru-RU')} ₽
                  </p>
                  <p className="text-[11px] text-warning leading-tight">
                    Клиенту будет выставлена ссылка на доплату добавленных позиций
                  </p>
                </div>
              </div>
              <span className="font-black text-warning text-sm whitespace-nowrap shrink-0">
                + {Math.abs(delta).toLocaleString('ru-RU')} ₽
              </span>
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="pt-2 border-t border-[#BAC5D5]/50 flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto h-10 sm:h-11 px-4 sm:px-5 neu-button rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer text-center transition-all active:scale-95"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleConfirmAdjustment}
            className="w-full sm:w-auto h-10 sm:h-11 px-4 sm:px-5 neu-button-accent rounded-xl text-xs font-black text-white cursor-pointer active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4 stroke-[3]" />
            <span>
              {isRefund
                ? `Подтвердить и оформить возврат (${delta.toLocaleString('ru-RU')} ₽)`
                : 'Сохранить изменения состава'}
            </span>
          </button>
        </div>
      </motion.div>
    </motion.div>
  )}
</AnimatePresence>
);
};
