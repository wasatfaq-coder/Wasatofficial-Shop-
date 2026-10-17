import React from 'react';
import { groupOrderLines, packGroupCompositionText } from '../../shared/packLines';
import { X, Printer, FileText, CreditCard, Truck } from 'lucide-react';
import { Order, Product, StorefrontSettings } from '../../types';
import { currentStoreName, getLegalDetails, getStoreContacts } from '../../utils/storeContacts';
import { copyToClipboard } from '../../utils/clipboard';
import { isCarrierOrder } from '../../utils/orderFlow';
import { m, AnimatePresence } from 'motion/react';
import { useDialogA11y } from '../../utils/useDialogA11y';
import { ModalPortal } from '../ModalPortal';
import { linePrice } from '../../shared/orderLine';
import { orderWeight, orderWeightText } from '../../utils/productShipping';
import { storedOrderTotals } from '../../utils/orderAdjustment';
import { isQuickOrderDelivery } from '../../shared/orderPricing';

interface AdminOrderInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
  storefrontSettings?: StorefrontSettings;
  /** The catalog: weight of lines ordered before the order kept it (src/utils/productShipping.ts) */
  products?: Product[];
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

export const AdminOrderInvoiceModal: React.FC<AdminOrderInvoiceModalProps> = ({
  isOpen,
  onClose,
  order,
  storefrontSettings,
  products = [],
  onShowToast,
}) => {
  const dialog = useDialogA11y(isOpen && Boolean(order), onClose);
  // Seller details come from Admin → «Витрина»; demo template requisites are never printed
  const legal = getLegalDetails(storefrontSettings);
  const contacts = getStoreContacts(storefrontSettings);
  const sellerLine = [
    legal.companyName,
    legal.ogrn && `ОГРН ${legal.ogrn}`,
    legal.inn && `ИНН ${legal.inn}`,
    legal.legalAddress,
    contacts.phone,
  ]
    .filter(Boolean)
    .join(' • ');

  /**
   * The sheet alone goes to the printer: the window is portaled into <body>, and `body.printing-invoice` hides every
   * other child of <body> (index.css, @media print). Inside the admin panel (`transform`, `contain: paint`) the window
   * was clipped by the panel, and the browser printed the panel with an empty or cut sheet.
   */
  const handlePrint = () => {
    const done = () => {
      document.body.classList.remove('printing-invoice');
      window.removeEventListener('afterprint', done);
    };
    document.body.classList.add('printing-invoice');
    window.addEventListener('afterprint', done);
    try {
      window.print();
    } catch (err) {
      done();
      console.warn('Printing was not started:', err);
      onShowToast('Браузер не открыл печать. Попробуйте «Печать» в меню браузера', 'error');
    }
  };

  const handleCopyInvoiceNumber = () => {
    if (order) {
      copyToClipboard(`WS-INV-${order.id}`);
      onShowToast(`Номер накладной WS-INV-${order.id} скопирован`, 'info');
    }
  };

  const totalQuantity = (order?.items || []).reduce((sum, it) => sum + (it.quantity || 1), 0);
  // Weight of the goods for the Post and carriers (stage 15); not shown when the products have no weights
  const weightText = order ? orderWeightText(orderWeight(order.items, products)) : null;
  // Only the order's own money (items, discount, delivery, total): `originalTotalPrice` is the sum before
  // «Корректировка заказа», not before the discount
  const totals = order ? storedOrderTotals(order) : null;
  const rub = (value: number) => `${value.toLocaleString('ru-RU')} ₽`;
  // a 1-click order is placed without delivery: the manager agrees it with the customer
  const deliveryText = !totals
    ? ''
    : order?.deliveryMethod && totals.deliveryFee === 0 && isQuickOrderDelivery(order.deliveryMethod)
      ? 'Согласует менеджер'
      : totals.deliveryFee > 0
        ? rub(totals.deliveryFee)
        : 'Бесплатно';

  return (
    <ModalPortal>
    <AnimatePresence>
      {isOpen && order && (
        <m.div
          key="admin-order-invoice-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          data-print-root
          className="admin-no-glow fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
        >
          {/* Backdrop */}
          <div
            onClick={onClose}
            className="fixed inset-0 bg-text-primary/60 backdrop-blur-xs cursor-pointer"
          />

          <m.div
            ref={dialog.ref}
            {...dialog.props}
            key="invoice-modal"
            initial={{ scale: 0.93, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.93, opacity: 0, y: 12 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="neu-modal text-text-primary rounded-3xl max-w-2xl w-full p-4 sm:p-8 space-y-6 border border-[#E3E8EF] max-h-[92vh] overflow-y-auto my-auto print:m-0 print:p-0 print:border-none print:shadow-none relative z-10"
          >
            {/* Modal Controls Bar (Hidden during print) */}
        <div className="flex items-center justify-between pb-4 neu-divider-b print:hidden">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl neu-inset flex items-center justify-center text-accent shrink-0">
              <FileText className="w-4 h-4 shrink-0" />
            </div>
            <div className="min-w-0">
              <h3 id={dialog.titleId} className="text-sm font-extrabold text-text-primary truncate">Товарная накладная и чек</h3>
              <p className="text-xs text-text-secondary truncate">Печатная форма для комплектации и передачи клиенту</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handlePrint}
              className="min-h-8 py-2 px-3.5 neu-button-accent text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <Printer className="w-3.5 h-3.5 shrink-0" />
              Печать
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl neu-button text-text-secondary hover:text-text-primary flex items-center justify-center cursor-pointer shrink-0"
              aria-label="Закрыть"
            >
              <X className="w-4 h-4 shrink-0" />
            </button>
          </div>
        </div>

        {/* Printable Document Sheet */}
        <div className="space-y-6 p-2 print:p-4">
          {/* Header */}
          <div className="flex justify-between items-start gap-3 neu-divider-b pb-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xl font-extrabold tracking-tight text-text-primary">{currentStoreName()}</span>
                <span className="text-[11px] font-extrabold neu-tone-info text-accent px-2 py-0.5 rounded-full uppercase">
                  Накладная
                </span>
              </div>
              {storefrontSettings?.storeSlogan?.trim() && (
                <p className="text-xs text-text-secondary mt-1 font-medium">
                  {storefrontSettings.storeSlogan.trim()}
                </p>
              )}
              {sellerLine && <p className="text-xs text-text-secondary mt-0.5">{sellerLine}</p>}
            </div>
            <div className="text-right shrink-0">
              <button
                type="button"
                onClick={handleCopyInvoiceNumber}
                className="block ml-auto text-right cursor-pointer hover:opacity-80 transition-opacity"
                title="Нажмите, чтобы скопировать номер"
              >
                <span className="text-xs font-bold text-text-secondary block uppercase">Накладная №</span>
                <span className="text-sm sm:text-base font-extrabold text-accent tracking-wide font-mono">
                  WS-INV-{order.id}
                </span>
              </button>
              <p className="text-xs text-text-secondary font-semibold mt-0.5">
                от {order.date || new Date().toLocaleDateString('ru-RU')}
              </p>
            </div>
          </div>

          {/* Logistics & Order Metadata */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3.5 neu-inset rounded-2xl text-xs">
            <div className="min-w-0">
              <span className="text-[11px] uppercase font-bold text-text-secondary block">Заказчик</span>
              <span className="font-bold text-text-primary">
                {order.customerName || 'Покупатель'}
              </span>
              <span className="text-[11px] text-text-secondary block">
                {order.customerPhone || '—'}
              </span>
              {order.customerEmail && (
                <span className="text-[11px] text-text-secondary block truncate">
                  {order.customerEmail}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <span className="text-[11px] uppercase font-bold text-text-secondary block">Доставка</span>
              <span className="font-bold text-text-primary flex items-center gap-1">
                <Truck className="w-3.5 h-3.5 text-accent shrink-0" />
                <span className="truncate">{order.deliveryMethod || 'Способ не указан'}</span>
              </span>
              <span className="text-[11px] text-text-secondary block truncate" title={order.deliveryAddress}>
                {order.deliveryAddress || 'Адрес не указан'}
              </span>
            </div>
            <div className="min-w-0">
              <span className="text-[11px] uppercase font-bold text-text-secondary block">Оплата</span>
              <span className="font-bold text-text-primary flex items-center gap-1">
                <CreditCard className="w-3.5 h-3.5 text-success shrink-0" />
                <span className="truncate">{order.paymentMethod || 'Согласует менеджер'}</span>
              </span>
              {isCarrierOrder(order) && (
                <span className="text-[11px] text-text-secondary font-mono block">
                  Трек (ТК): {order.trackingNumber || 'Формируется'}
                </span>
              )}
            </div>
          </div>

          {/* Items Table */}
          <div>
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-text-secondary mb-2">
              Состав отправления ({totalQuantity} шт.)
            </h4>
            {weightText && (
              <p className="text-xs text-text-secondary mb-2">
                <strong className="text-text-primary">Вес товаров:</strong> {weightText}
              </p>
            )}
            <div className="neu-inset rounded-xl overflow-x-auto p-1">
              <table className="w-full min-w-[460px] text-left text-xs">
                <thead className="text-text-secondary font-bold text-[11px]">
                  <tr className="neu-divider-b">
                    <th className="py-2 px-3">№</th>
                    <th className="py-2 px-3">Наименование</th>
                    <th className="py-2 px-3">Цвет / Размер</th>
                    <th className="py-2 px-3 text-center">Кол-во</th>
                    <th className="py-2 px-3 text-right">Цена</th>
                    <th className="py-2 px-3 text-right">Сумма</th>
                  </tr>
                </thead>
                <tbody className="font-medium text-text-primary">
                  {groupOrderLines(order.items || []).map((group, idx) => {
                    if (group.kind === 'pack') {
                      const it = group.item;
                      return (
                        <tr key={`pack-${group.packGroup}`} className="neu-divider-b last:neu-divider-b-0">
                          <td className="py-2.5 px-3 text-text-secondary font-mono text-[11px]">{idx + 1}</td>
                          <td className="py-2.5 px-3 font-bold text-text-primary">
                            {`${it.product?.title || 'Товар каталога'} — ${group.title}, ${it.selectedColor}`}
                            <span className="block text-[11px] text-text-secondary font-normal">
                              {packGroupCompositionText(group.sizes)}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="inline-block neu-flat-sm px-2 py-0.5 rounded-lg text-[11px] font-semibold text-text-primary mr-1">
                              {it.selectedColor}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center font-bold">
                            {group.packCount} уп. ({group.pieces} шт.)
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums">{group.packPrice.toLocaleString('ru-RU')} ₽</td>
                          <td className="py-2.5 px-3 text-right font-extrabold text-text-primary tabular-nums">
                            {group.total.toLocaleString('ru-RU')} ₽
                          </td>
                        </tr>
                      );
                    }
                    const it = group.item;
                    const price = linePrice(it);
                    const sum = price * (it.quantity || 1);
                    return (
                      <tr key={it.id || idx} className="neu-divider-b last:neu-divider-b-0">
                        <td className="py-2.5 px-3 text-text-secondary font-mono text-[11px]">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-bold text-text-primary">
                          {it.product?.title || 'Товар каталога'}
                          {it.product?.material && (
                            <span className="block text-[11px] text-text-secondary font-normal">
                              {it.product.material}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="inline-block neu-flat-sm px-2 py-0.5 rounded-lg text-[11px] font-semibold text-text-primary mr-1">
                            {it.selectedColor}
                          </span>
                          <span className="inline-block neu-tone-info px-2 py-0.5 rounded-lg text-[11px] font-bold text-accent">
                            {it.selectedSize}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold">{it.quantity || 1} шт.</td>
                        <td className="py-2.5 px-3 text-right tabular-nums">{price.toLocaleString('ru-RU')} ₽</td>
                        <td className="py-2.5 px-3 text-right font-extrabold text-text-primary tabular-nums">
                          {sum.toLocaleString('ru-RU')} ₽
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals Breakdown */}
          {totals && !totals.matches && (
            <p role="alert" className="text-xs font-semibold neu-tone-danger rounded-xl p-3 print:hidden">
              Сумма строк ({rub(totals.subtotal)}) − скидка + доставка не равна итогу заказа ({rub(totals.total)}).
              Проверьте заказ в «Заказах», прежде чем печатать.
            </p>
          )}
          {totals && (
            <div className="flex justify-end pt-2">
              <dl className="w-64 space-y-1.5 text-xs text-text-secondary neu-inset p-3.5 rounded-2xl">
                <div className="flex justify-between gap-2">
                  <dt>Товары:</dt>
                  <dd className="font-semibold text-text-primary whitespace-nowrap tabular-nums">{rub(totals.subtotal)}</dd>
                </div>
                {totals.recorded && totals.discount > 0 && (
                  <div className="flex justify-between gap-2 text-success font-semibold">
                    <dt>Скидка{order.promoCode ? ` по промокоду ${order.promoCode}` : ''}:</dt>
                    <dd className="whitespace-nowrap tabular-nums">−{rub(totals.discount)}</dd>
                  </div>
                )}
                {totals.recorded ? (
                <div className="flex justify-between gap-2">
                  <dt>Доставка:</dt>
                  <dd className={`font-semibold whitespace-nowrap ${deliveryText === 'Бесплатно' ? 'text-success' : 'text-text-primary'}`}>
                    {deliveryText}
                  </dd>
                </div>
                ) : (
                  <div className="text-[11px] text-text-secondary">
                    <dt className="inline">Скидка и доставка: </dt>
                    <dd className="inline">в заказе не записаны отдельно, итог — из заказа</dd>
                  </div>
                )}
                <div className="neu-divider-t pt-2 flex justify-between items-baseline font-extrabold text-text-primary text-sm">
                  <dt>ИТОГО К ОПЛАТЕ:</dt>
                  <dd className="text-base text-accent font-extrabold whitespace-nowrap tabular-nums">{rub(totals.total)}</dd>
                </div>
              </dl>
            </div>
          )}

          {/* Footer with return policy (only if configured) & signature line */}
          <div className="neu-divider-t pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-[11px] text-text-secondary">
            <div>
              {typeof storefrontSettings?.returnPeriodDays === 'number' && storefrontSettings.returnPeriodDays > 0 && (
                <>
                  <p className="font-bold text-text-primary">Правила возврата:</p>
                  <p className="leading-tight mt-0.5">
                    Возврат товара надлежащего качества возможен в течение {storefrontSettings.returnPeriodDays} дн. с момента получения при
                    сохранении товарного вида, ярлыков и чека.
                  </p>
                </>
              )}
            </div>
            <div className="text-right flex flex-col items-end justify-end">
              <div className="w-36 border-b border-slate-400 border-dashed pb-0.5 text-center text-text-secondary font-mono text-[11px]">
                Отпустил со склада (подпись)
              </div>
            </div>
          </div>
        </div>
      </m.div>
    </m.div>
  )}
</AnimatePresence>
    </ModalPortal>
);
};
