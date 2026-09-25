import React from 'react';
import {
  X,
  Printer,
  FileText,
  Download,
  CheckCircle2,
  Package,
  Calendar,
  MapPin,
  CreditCard,
  Truck,
  Barcode,
} from 'lucide-react';
import { Order, StorefrontSettings } from '../../types';
import { getLegalDetails, getStoreContacts } from '../../utils/storeContacts';
import { copyToClipboard } from '../../utils/clipboard';
import { isTransportCompanyDelivery } from '../../utils/deliveryStages';
import { motion, AnimatePresence } from 'motion/react';

interface AdminOrderInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
  storefrontSettings?: StorefrontSettings;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

export const AdminOrderInvoiceModal: React.FC<AdminOrderInvoiceModalProps> = ({
  isOpen,
  onClose,
  order,
  storefrontSettings,
  onShowToast,
}) => {
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

  const handlePrint = () => {
    window.print();
  };

  const handleCopyInvoiceNumber = () => {
    if (order) {
      copyToClipboard(`MS-INV-${order.id}`);
      onShowToast(`Номер накладной MS-INV-${order.id} скопирован`, 'info');
    }
  };

  const totalQuantity = (order?.items || []).reduce((sum, it) => sum + (it.quantity || 1), 0);
  const discountAmount = order?.originalTotalPrice
    ? Math.max(0, order.originalTotalPrice - order.totalPrice)
    : 0;

  return (
    <AnimatePresence>
      {isOpen && order && (
        <motion.div
          key="admin-order-invoice-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="admin-no-glow fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
        >
          {/* Backdrop */}
          <div
            onClick={onClose}
            className="fixed inset-0 bg-[#2D3A4E]/60 backdrop-blur-xs cursor-pointer"
          />

          <motion.div
            key="invoice-modal"
            initial={{ scale: 0.93, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.93, opacity: 0, y: 12 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="neu-modal text-[#2D3A4E] rounded-3xl max-w-2xl w-full p-4 sm:p-8 space-y-6 border border-slate-200 max-h-[92vh] overflow-y-auto my-auto print:m-0 print:p-0 print:border-none print:shadow-none bg-white relative z-10"
          >
            {/* Modal Controls Bar (Hidden during print) */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 print:hidden">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-[#5F6ED0]">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-[#2D3A4E]">Товарная накладная и чек</h3>
              <p className="text-[11px] text-slate-500">Печатная форма для комплектации и передачи клиенту</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="py-2 px-3.5 bg-[#5F6ED0] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 hover:bg-[#4E5DC0] transition-colors cursor-pointer active:scale-95"
            >
              <Printer className="w-3.5 h-3.5" />
              Печать
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Document Sheet */}
        <div className="space-y-6 p-2 print:p-4">
          {/* Header */}
          <div className="flex justify-between items-start border-b border-slate-200 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-black tracking-tight text-[#2D3A4E]">MANSTYLE</span>
                <span className="text-[10px] font-extrabold bg-[#5F6ED0]/10 text-[#5F6ED0] px-2 py-0.5 rounded-full uppercase">
                  Официальный документ
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1 font-medium">
                Интернет-магазин премиальной мужской одежды
              </p>
              {sellerLine && <p className="text-[10px] text-slate-400">{sellerLine}</p>}
            </div>
            <div className="text-right">
              <div
                onClick={handleCopyInvoiceNumber}
                className="cursor-pointer hover:opacity-80 transition-opacity"
                title="Нажмите, чтобы скопировать номер"
              >
                <span className="text-xs font-bold text-slate-400 block uppercase">Накладная №</span>
                <span className="text-base font-black text-[#5F6ED0] tracking-wide">
                  MS-INV-{order.id.slice(-6).toUpperCase()}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                от {order.date || new Date().toLocaleDateString('ru-RU')}
              </p>
            </div>
          </div>

          {/* Logistics & Order Metadata */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3.5 bg-slate-50 rounded-2xl border border-slate-100 text-xs">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Заказчик</span>
              <span className="font-bold text-slate-800">
                {order.customerName || 'Покупатель MANSTYLE'}
              </span>
              <span className="text-[11px] text-slate-500 block">
                {order.customerPhone || '—'}
              </span>
              {order.customerEmail && (
                <span className="text-[10px] text-slate-400 block truncate">
                  {order.customerEmail}
                </span>
              )}
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Доставка</span>
              <span className="font-bold text-slate-800 flex items-center gap-1">
                <Truck className="w-3 h-3 text-[#5F6ED0]" />
                {order.deliveryMethod || 'Курьерская доставка'}
              </span>
              <span className="text-[11px] text-slate-500 block truncate" title={order.deliveryAddress}>
                {order.deliveryAddress || 'Москва, Пресненская наб. 12'}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Оплата & Доставка</span>
              <span className="font-bold text-slate-800 flex items-center gap-1">
                <CreditCard className="w-3 h-3 text-emerald-600" />
                {order.paymentMethod || 'Банковская карта онлайн'}
              </span>
              <span className="text-[11px] text-slate-500 font-mono block">
                {isTransportCompanyDelivery(order.deliveryMethod, order.trackingCompany)
                  ? `Трек (ТК): ${order.trackingNumber || 'Формируется'}`
                  : 'Трек: Не требуется (прямая доставка)'}
              </span>
            </div>
          </div>

          {/* Items Table */}
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 mb-2">
              Состав отправления ({totalQuantity} шт.)
            </h4>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200 text-[11px]">
                  <tr>
                    <th className="py-2 px-3">№</th>
                    <th className="py-2 px-3">Наименование</th>
                    <th className="py-2 px-3">Цвет / Размер</th>
                    <th className="py-2 px-3 text-center">Кол-во</th>
                    <th className="py-2 px-3 text-right">Цена</th>
                    <th className="py-2 px-3 text-right">Сумма</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {(order.items || []).map((it, idx) => {
                    const price = it.product?.price || 0;
                    const sum = price * (it.quantity || 1);
                    return (
                      <tr key={it.id || idx} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-bold text-slate-800">
                          {it.product?.title || 'Товар каталога'}
                          {it.product?.material && (
                            <span className="block text-[10px] text-slate-400 font-normal">
                              {it.product.material}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="inline-block bg-slate-100 px-1.5 py-0.5 rounded text-[11px] font-semibold text-slate-700 mr-1">
                            {it.selectedColor}
                          </span>
                          <span className="inline-block bg-indigo-50 px-1.5 py-0.5 rounded text-[11px] font-bold text-[#5F6ED0]">
                            {it.selectedSize}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold">{it.quantity || 1} шт.</td>
                        <td className="py-2.5 px-3 text-right">{price.toLocaleString()} ₽</td>
                        <td className="py-2.5 px-3 text-right font-black text-slate-900">
                          {sum.toLocaleString()} ₽
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals Breakdown */}
          <div className="flex justify-end pt-2">
            <div className="w-64 space-y-1.5 text-xs text-slate-600 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
              <div className="flex justify-between">
                <span>Сумма без скидки:</span>
                <span className="font-semibold">
                  {(order.originalTotalPrice || order.totalPrice + discountAmount).toLocaleString()} ₽
                </span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-emerald-600 font-semibold">
                  <span>Скидка по акции:</span>
                  <span>-{discountAmount.toLocaleString()} ₽</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Доставка:</span>
                <span className="font-semibold text-emerald-600">Бесплатно</span>
              </div>
              <div className="border-t border-slate-200 pt-2 flex justify-between items-baseline font-black text-slate-900 text-sm">
                <span>ИТОГО К ОПЛАТЕ:</span>
                <span className="text-base text-[#5F6ED0] font-black">
                  {order.totalPrice.toLocaleString()} ₽
                </span>
              </div>
            </div>
          </div>

          {/* Footer with return policy & stamp placeholder */}
          <div className="border-t border-slate-200 pt-4 grid grid-cols-2 gap-4 text-[10px] text-slate-500">
            <div>
              <p className="font-bold text-slate-700">Правила возврата и примерки:</p>
              <p className="leading-tight mt-0.5">
                Возврат товара надлежащего качества возможен в течение 14 дней с момента получения при
                сохранении товарного вида, ярлыков и чека.
              </p>
            </div>
            <div className="text-right flex flex-col items-end justify-end">
              <div className="w-36 border-b border-slate-400 border-dashed pb-0.5 text-center text-slate-400 font-mono text-[9px]">
                Отпустил со склада (подпись)
              </div>
              <p className="text-[9px] text-slate-400 mt-1">Штамп отдела контроля качества MANSTYLE</p>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )}
</AnimatePresence>
);
};
