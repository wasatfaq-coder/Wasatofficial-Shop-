import React, { useState } from 'react';
import { X, Phone, User, MapPin, MessageCircle, ShoppingBag, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CartItem, Product } from '../types';
import { STORE_PAUSED_TEXT } from '../shared/orderApi';
import { productImage } from '../utils/productImage';
import { useProductThumbs } from '../utils/productThumbs';
import { LegalConsentNote } from './LegalConsentNote';
import { useDialogA11y } from '../utils/useDialogA11y';
import { digitsAfterCountryCode, isQuickOrderPhoneComplete, PHONE_DIGITS_AFTER_CODE } from '../utils/phoneNumber';
import { pluralRu } from '../utils/pluralize';

interface QuickOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems?: CartItem[];
  singleProduct?: {
    product: Product;
    color: string;
    size: string;
    quantity: number;
  } | null;
  totalPrice: number;
  /** A promo is applied in the cart: it does not work for a 1-click order */
  promoNotApplied?: boolean;
  /** «Технические работы» in «Витрина»: the site takes no orders — said here, the button is off */
  ordersPaused?: boolean;
  /** Places the order; `false` — not placed (the screen said why): the window stays open with what was typed */
  onSuccess: (details: { name: string; phone: string; address: string }) => boolean | void | Promise<boolean | void>;
}

export const QuickOrderModal: React.FC<QuickOrderModalProps> = ({
  isOpen,
  onClose,
  cartItems = [],
  singleProduct,
  totalPrice,
  promoNotApplied = false,
  ordersPaused = false,
  onSuccess,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  // While the order is being written the window stays: Escape and «Назад» do not close it
  const dialog = useDialogA11y(isOpen, onClose, { closeOnEscape: !isSubmitting });
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+7 ');
  const [address, setAddress] = useState('');
  const [house, setHouse] = useState('');
  const [entrance, setEntrance] = useState('');
  const [apartment, setApartment] = useState('');
  const [intercom, setIntercom] = useState('');

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    if (!val.startsWith('+7')) {
      val = '+7 ' + val.replace(/^\+?7?/, '');
    }
    setPhone(val);
  };

  // The manager reaches the buyer only by this number: 10 digits after «+7», not the length of the text with its spaces
  // (audit 07.10, finding 17)
  const phoneComplete = isQuickOrderPhoneComplete(phone);
  const phoneDigits = digitsAfterCountryCode(phone);
  const missingDigits = PHONE_DIGITS_AFTER_CODE - phoneDigits;
  const phoneHint = phoneComplete
    ? 'Менеджер перезвонит по этому номеру'
    : phoneDigits === 0
      ? `${PHONE_DIGITS_AFTER_CODE} цифр после +7: менеджер перезвонит по этому номеру`
      : `Ещё ${missingDigits} ${pluralRu(missingDigits, ['цифра', 'цифры', 'цифр'])} после +7`;

  // Only the name and the phone are needed (the offer, 3.2): the manager calls and agrees the delivery, so the address
  // is optional — before, the window demanded a house, an entrance and an intercom code (UX audit 03.10, finding 22)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || ordersPaused || !name.trim() || !phoneComplete) return;

    const extra: string[] = [];
    if (house.trim()) extra.push(`д. ${house.trim()}`);
    if (entrance.trim()) extra.push(`подъезд ${entrance.trim()}`);
    if (apartment.trim()) extra.push(`кв. ${apartment.trim()}`);
    if (intercom.trim()) extra.push(`домофон: ${intercom.trim()}`);
    const finalAddr = [address.trim(), ...extra].filter(Boolean).join(', ');

    // The window closes once the order is written; not placed — it stays with what was typed
    setIsSubmitting(true);
    let placed: boolean | void = false;
    try {
      placed = await onSuccess({ name: name.trim(), phone: phone.trim(), address: finalAddr || 'Уточнит менеджер' });
    } finally {
      setIsSubmitting(false);
    }
    if (placed !== false) onClose();
  };

  // products keep no previews inside (docs/catalog-scale-plan.md, stage 6): the lines show their miniatures
  const photoOf = useProductThumbs(singleProduct ? [singleProduct.product] : cartItems.map((item) => item.product));
  const displayItems = singleProduct
    ? [
        {
          title: singleProduct.product?.title || '',
          image: photoOf(singleProduct.product) || productImage(singleProduct.product),
          variant: `${singleProduct.color} • ${singleProduct.size}`,
          qty: singleProduct.quantity,
          price: (singleProduct.product?.price || 0) * singleProduct.quantity,
        },
      ]
    : cartItems.map((item) => ({
        title: item.product?.title || '',
        image: photoOf(item.product) || productImage(item.product),
        variant: `${item.selectedColor} • ${item.selectedSize}`,
        qty: item.quantity,
        price: (item.product?.price || 0) * item.quantity,
      }));

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="quick-order-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
        >
          <div
            onClick={onClose}
            className="fixed inset-0 bg-[#2D3A4E]/50 backdrop-blur-xs cursor-pointer"
          />
          <motion.div
            ref={dialog.ref}
            {...dialog.props}
            key="quick-order-modal"
            initial={{ scale: 0.93, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.93, opacity: 0, y: 12 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-md neu-modal rounded-3xl p-5 space-y-4 max-h-[92vh] overflow-y-auto no-scrollbar z-10"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-[#BAC5D5]/50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl neu-inset flex items-center justify-center text-accent">
                  <ShoppingBag className="w-4 h-4 text-accent" />
                </div>
                <div>
                  <h3 id={dialog.titleId} className="text-sm font-extrabold text-[#2D3A4E]">Заказ в 1 клик</h3>
                  <p className="text-xs text-[#4E5C70]">Менеджер перезвонит для подтверждения</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>

            {/* Items Summary Preview */}
            <div className="neu-inset rounded-2xl p-2.5 space-y-2 max-h-36 overflow-y-auto no-scrollbar">
              {displayItems.map((item, idx) => (
                <div key={`quick-order-item-${item.title}-${item.variant}-${idx}`} className="flex items-center gap-2.5 text-xs">
                  <img
                    src={item.image}
                    alt={item.title}
                    loading="lazy"
                    decoding="async"
                    className="w-10 h-10 rounded-xl object-cover neu-flat shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-[#2D3A4E] truncate">{item.title}</p>
                    <p className="text-xs text-[#4E5C70]">{item.variant}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-extrabold text-accent">{item.price.toLocaleString('ru-RU')} ₽</p>
                    <p className="text-xs text-[#4E5C70]">{item.qty} шт.</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Price Preview */}
            <div className="neu-flat rounded-2xl p-3 flex items-center justify-between">
              <span className="text-xs font-bold text-[#4E5C70]">Итого к оплате:</span>
              <span className="text-base font-extrabold text-[#2D3A4E]">
                {totalPrice.toLocaleString('ru-RU')} ₽
              </span>
            </div>
            {promoNotApplied && (
              <p className="text-xs font-semibold text-[#4E5C70] px-1">
                Промокод действует только при полном оформлении заказа
              </p>
            )}

            {/* Fast Form */}
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1">
                <label htmlFor="quick-order-name" className="text-[11px] font-bold text-[#2D3A4E] flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
                  <span>Ваше имя *</span>
                </label>
                <input
                  id="quick-order-name"
                  type="text"
                  autoComplete="name"
                  required
                  placeholder="Иван"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full py-2 px-3 neu-inset rounded-xl text-xs text-[#2D3A4E] placeholder:text-[#56647A]"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="quick-order-phone" className="text-[11px] font-bold text-[#2D3A4E] flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
                  <span>Номер телефона *</span>
                </label>
                <input
                  id="quick-order-phone"
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  required
                  placeholder="+7 (999) 000-00-00"
                  aria-describedby="quick-order-phone-hint"
                  value={phone}
                  onChange={handlePhoneChange}
                  className="w-full py-2 px-3 neu-inset rounded-xl text-xs text-[#2D3A4E] placeholder:text-[#56647A]"
                />
                <p id="quick-order-phone-hint" className="text-xs text-[#4E5C70]">
                  {phoneHint}
                </p>
              </div>

              <div className="space-y-1">
                <label htmlFor="quick-order-address" className="text-[11px] font-bold text-[#2D3A4E] flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
                  <span>Адрес доставки — по желанию</span>
                </label>
                <input
                  id="quick-order-address"
                  type="text"
                  autoComplete="street-address"
                  placeholder="Город, улица"
                  aria-describedby="quick-order-address-hint"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full py-2 px-3 neu-inset rounded-xl text-xs text-[#2D3A4E] placeholder:text-[#56647A]"
                />
                <p id="quick-order-address-hint" className="text-xs text-[#4E5C70]">
                  Можно не заполнять: менеджер уточнит адрес, когда позвонит.
                </p>
              </div>

              {/* Дополнительные поля: Номер дома, Подъезд, Квартира/Офис, Домофон */}
              <div className="grid grid-cols-4 gap-2 text-[11px]">
                <div>
                  <label htmlFor="quick-order-house" className="text-[11px] font-bold text-[#2D3A4E] block mb-0.5 truncate">
                    Дом
                  </label>
                  <input
                    id="quick-order-house"
                    type="text"
                    placeholder="10"
                    value={house}
                    onChange={(e) => setHouse(e.target.value)}
                    className="w-full py-1.5 px-2 neu-inset rounded-lg text-xs text-[#2D3A4E] placeholder:text-[#56647A]"
                  />
                </div>
                <div>
                  <label htmlFor="quick-order-entrance" className="text-[11px] font-bold text-[#2D3A4E] block mb-0.5 truncate">
                    Подъезд
                  </label>
                  <input
                    id="quick-order-entrance"
                    type="text"
                    placeholder="2"
                    value={entrance}
                    onChange={(e) => setEntrance(e.target.value)}
                    className="w-full py-1.5 px-2 neu-inset rounded-lg text-xs text-[#2D3A4E] placeholder:text-[#56647A]"
                  />
                </div>
                <div>
                  <label htmlFor="quick-order-apartment" className="text-[11px] font-bold text-[#2D3A4E] block mb-0.5 truncate">
                    Кв./Офис
                  </label>
                  <input
                    id="quick-order-apartment"
                    type="text"
                    placeholder="25"
                    value={apartment}
                    onChange={(e) => setApartment(e.target.value)}
                    className="w-full py-1.5 px-2 neu-inset rounded-lg text-xs text-[#2D3A4E] placeholder:text-[#56647A]"
                  />
                </div>
                <div>
                  <label htmlFor="quick-order-intercom" className="text-[11px] font-bold text-[#2D3A4E] block mb-0.5 truncate">
                    Домофон
                  </label>
                  <input
                    id="quick-order-intercom"
                    type="text"
                    placeholder="25K"
                    value={intercom}
                    onChange={(e) => setIntercom(e.target.value)}
                    className="w-full py-1.5 px-2 neu-inset rounded-lg text-xs text-[#2D3A4E] placeholder:text-[#56647A]"
                  />
                </div>
              </div>

              {/* The order goes out with «Уточнит менеджер» for delivery and payment: no made-up fitting or free returns
                  (audit 02.10, finding 44) */}
              {ordersPaused ? (
                <div role="status" className="p-2.5 rounded-xl bg-warning-soft border border-warning/40 flex items-start gap-2 text-xs text-[#2D3A4E] font-semibold">
                  <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-px" aria-hidden="true" />
                  <span>{STORE_PAUSED_TEXT}. Напишите в чат поддержки — менеджер оформит заказ сам.</span>
                </div>
              ) : (
                <div className="p-2 rounded-xl neu-flat flex items-center gap-2 text-xs text-[#4E5C70] font-semibold">
                  <MessageCircle className="w-4 h-4 text-accent shrink-0" aria-hidden="true" />
                  <span>Доставку и оплату менеджер согласует с вами после заказа.</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="py-2.5 px-4 neu-button rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={ordersPaused || isSubmitting || !name.trim() || !phoneComplete}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-extrabold cursor-pointer transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 btn-confirm-order ${
                    isSubmitting
                      ? 'neu-inset-deep neu-inset-deep-animated text-accent ring-2 ring-accent/40'
                      : 'neu-button-accent text-white hover:scale-102 active:neu-inset-deep'
                  }`}
                >
                  {isSubmitting ? (
                    <span>Оформление...</span>
                  ) : (
                    <>
                      <ShoppingBag className="w-3.5 h-3.5" />
                      <span>Подтвердить быстрый заказ</span>
                    </>
                  )}
                </button>
              </div>
              <LegalConsentNote action="Подтвердить быстрый заказ" className="text-center" />
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
