import React, { useState } from 'react';
import { X, Phone, User, MapPin, ShieldCheck, ShoppingBag, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CartItem, Product } from '../types';

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
  onSuccess: (details: { name: string; phone: string; address: string }) => void;
}

export const QuickOrderModal: React.FC<QuickOrderModalProps> = ({
  isOpen,
  onClose,
  cartItems = [],
  singleProduct,
  totalPrice,
  onSuccess,
}) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+7 ');
  const [address, setAddress] = useState('');
  const [house, setHouse] = useState('');
  const [entrance, setEntrance] = useState('');
  const [apartment, setApartment] = useState('');
  const [intercom, setIntercom] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{
    house?: string;
    entrance?: string;
    intercom?: string;
    general?: string;
  }>({});

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    if (!val.startsWith('+7')) {
      val = '+7 ' + val.replace(/^\+?7?/, '');
    }
    setPhone(val);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || phone.length < 11) return;

    const newErrors: { house?: string; entrance?: string; intercom?: string; general?: string } = {};
    if (!house.trim()) {
      newErrors.house = 'Номер дома';
    }
    if (!entrance.trim()) {
      newErrors.entrance = 'Подъезд';
    }
    if (!intercom.trim()) {
      newErrors.intercom = 'Код домофона';
    }

    if (Object.keys(newErrors).length > 0) {
      newErrors.general = 'Для доставки курьером заполните номер дома, подъезд и код домофона.';
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);

      let finalAddr = address.trim();
      const extra: string[] = [];
      if (house.trim()) extra.push(`д. ${house.trim()}`);
      if (entrance.trim()) extra.push(`подъезд ${entrance.trim()}`);
      if (apartment.trim()) extra.push(`кв. ${apartment.trim()}`);
      if (intercom.trim()) extra.push(`домофон: ${intercom.trim()}`);

      if (extra.length > 0) {
        finalAddr = finalAddr ? `${finalAddr}, ${extra.join(', ')}` : extra.join(', ');
      }

      onSuccess({
        name: name.trim(),
        phone: phone.trim(),
        address: finalAddr || 'Уточняется оператором',
      });
      onClose();
    }, 600);
  };

  const displayItems = singleProduct
    ? [
        {
          title: singleProduct.product?.title || '',
          image: singleProduct.product?.images?.[0] || 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600&auto=format&fit=crop&q=80',
          variant: `${singleProduct.color} • ${singleProduct.size}`,
          qty: singleProduct.quantity,
          price: (singleProduct.product?.price || 0) * singleProduct.quantity,
        },
      ]
    : cartItems.map((item) => ({
        title: item.product?.title || '',
        image: item.product?.images?.[0] || 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600&auto=format&fit=crop&q=80',
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
                  <h3 className="text-sm font-extrabold text-[#2D3A4E]">Быстрый заказ в 1 клик</h3>
                  <p className="text-[11px] text-[#4E5C70]">Менеджер перезвонит для подтверждения</p>
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
            <div className="neu-inset rounded-2xl p-2.5 bg-[#E3E8EF] space-y-2 max-h-36 overflow-y-auto no-scrollbar">
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
                    <p className="text-[11px] text-[#4E5C70]">{item.variant}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-extrabold text-accent">{item.price.toLocaleString('ru-RU')} ₽</p>
                    <p className="text-[11px] text-[#4E5C70]">{item.qty} шт.</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Price Preview */}
            <div className="neu-flat rounded-2xl p-3 bg-[#E3E8EF] flex items-center justify-between">
              <span className="text-xs font-bold text-[#4E5C70]">Итого к оплате:</span>
              <span className="text-base font-extrabold text-[#2D3A4E]">
                {totalPrice.toLocaleString('ru-RU')} ₽
              </span>
            </div>

            {/* Error Banner */}
            {errors.general && (
              <div className="p-3 rounded-2xl bg-danger-soft border border-danger/35 text-danger text-xs flex items-center gap-2 animate-in fade-in duration-200">
                <AlertCircle className="w-4 h-4 text-danger shrink-0" />
                <span className="font-medium">{errors.general}</span>
              </div>
            )}

            {/* Fast Form */}
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-[#2D3A4E] flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-accent" />
                  <span>Ваше имя *</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Иван"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full py-2 px-3 neu-inset rounded-xl text-xs text-[#2D3A4E] placeholder:text-[#56647A] bg-[#E3E8EF]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-[#2D3A4E] flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-accent" />
                  <span>Номер телефона *</span>
                </label>
                <input
                  type="tel"
                  required
                  placeholder="+7 (999) 000-00-00"
                  value={phone}
                  onChange={handlePhoneChange}
                  className="w-full py-2 px-3 neu-inset rounded-xl text-xs text-[#2D3A4E] placeholder:text-[#56647A] bg-[#E3E8EF]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-[#2D3A4E] flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-accent" />
                  <span>Город и улица доставки</span>
                </label>
                <input
                  type="text"
                  placeholder="Москва, ул. Тверская"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full py-2 px-3 neu-inset rounded-xl text-xs text-[#2D3A4E] placeholder:text-[#56647A] bg-[#E3E8EF]"
                />
              </div>

              {/* Дополнительные поля: Номер дома, Подъезд, Квартира/Офис, Домофон */}
              <div className="grid grid-cols-4 gap-2 text-[11px]">
                <div>
                  <label className="text-[11px] font-bold text-[#2D3A4E] block mb-0.5 truncate">
                    Дом <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="10"
                    value={house}
                    onChange={(e) => {
                      setHouse(e.target.value);
                      if (errors.house && e.target.value.trim()) {
                        setErrors(prev => ({ ...prev, house: undefined, general: undefined }));
                      }
                    }}
                    className={`w-full py-1.5 px-2 neu-inset rounded-lg text-xs text-[#2D3A4E] placeholder:text-[#56647A] bg-[#E3E8EF] transition-all ${
                      errors.house ? 'ring-2 ring-danger/50 bg-danger-soft' : ''
                    }`}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-[#2D3A4E] block mb-0.5 truncate">
                    Подъезд <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="2"
                    value={entrance}
                    onChange={(e) => {
                      setEntrance(e.target.value);
                      if (errors.entrance && e.target.value.trim()) {
                        setErrors(prev => ({ ...prev, entrance: undefined, general: undefined }));
                      }
                    }}
                    className={`w-full py-1.5 px-2 neu-inset rounded-lg text-xs text-[#2D3A4E] placeholder:text-[#56647A] bg-[#E3E8EF] transition-all ${
                      errors.entrance ? 'ring-2 ring-danger/50 bg-danger-soft' : ''
                    }`}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-[#2D3A4E] block mb-0.5 truncate">
                    Кв./Офис
                  </label>
                  <input
                    type="text"
                    placeholder="25"
                    value={apartment}
                    onChange={(e) => setApartment(e.target.value)}
                    className="w-full py-1.5 px-2 neu-inset rounded-lg text-xs text-[#2D3A4E] placeholder:text-[#56647A] bg-[#E3E8EF]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-[#2D3A4E] block mb-0.5 truncate">
                    Домофон <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="25K"
                    value={intercom}
                    onChange={(e) => {
                      setIntercom(e.target.value);
                      if (errors.intercom && e.target.value.trim()) {
                        setErrors(prev => ({ ...prev, intercom: undefined, general: undefined }));
                      }
                    }}
                    className={`w-full py-1.5 px-2 neu-inset rounded-lg text-xs text-[#2D3A4E] placeholder:text-[#56647A] bg-[#E3E8EF] transition-all ${
                      errors.intercom ? 'ring-2 ring-danger/50 bg-danger-soft' : ''
                    }`}
                  />
                </div>
              </div>

              {/* Guarantee Badge */}
              <div className="p-2 rounded-xl neu-flat bg-[#E3E8EF] flex items-center gap-2 text-[11px] text-success font-semibold">
                <ShieldCheck className="w-4 h-4 text-success shrink-0" />
                <span>Оплата при получении после примерки. Бесплатный возврат.</span>
              </div>

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
                  disabled={isSubmitting || !name.trim() || phone.length < 11}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-black cursor-pointer transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 btn-confirm-order ${
                    isSubmitting
                      ? 'neu-inset-deep neu-inset-deep-animated text-accent bg-[#E3E8EF] ring-2 ring-accent/40'
                      : 'neu-button-accent text-white hover:scale-102 active:neu-inset-deep active:scale-98'
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
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
