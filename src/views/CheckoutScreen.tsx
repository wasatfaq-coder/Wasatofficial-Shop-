import React, { useState } from 'react';
import {
  User,
  Phone,
  Mail,
  MapPin,
  Bike,
  Store,
  CheckCircle,
  ArrowRight,
  ChevronRight,
  CreditCard,
  ShieldCheck,
  Tag,
  Pencil,
  Truck,
  Package,
  ShoppingBag,
  AlertCircle,
  Clock,
  Info,
  Sparkles,
  Check,
  Zap,
  Copy,
} from 'lucide-react';
import { CartItem, DeliveryMethod, PickupPoint, UserProfile, ActiveTab, AppliedPromoInfo, StorefrontSettings, SavedAddress } from '../types';
import { INITIAL_DELIVERY_METHODS, INITIAL_PICKUP_POINTS } from '../data/deliveryData';
import { AddressEditModal } from '../components/AddressEditModal';
import { formatAddress } from '../utils/addressFormat';
import {
  DEFAULT_FREE_DELIVERY_THRESHOLD,
  calcOrderTotals,
  calcPromoDiscount,
  calcSubtotal,
  getAvailableDeliveryMethods,
} from '../shared/orderPricing';
import { currentStoreName } from '../utils/storeContacts';

interface CheckoutScreenProps {
  cartItems: CartItem[];
  userProfile: UserProfile;
  onCompleteOrder: (orderData: {
    items: CartItem[];
    contact: { name: string; phone: string; email: string };
    address: string;
    deliveryMethod: string;
    deliveryMethodId?: string;
    totalPrice: number;
    paymentMethod?: string;
    usedBonusPoints?: number;
  }) => void | Promise<boolean>;
  setActiveTab: (tab: ActiveTab) => void;
  appliedPromo: AppliedPromoInfo | null;
  onOpenPromoModal: () => void;
  storefrontSettings?: StorefrontSettings;
  onShowToast?: (text: string, type?: 'success' | 'info' | 'error') => void;
  deliveryMethods?: DeliveryMethod[];
  pickupPoints?: PickupPoint[];
}

export const CheckoutScreen: React.FC<CheckoutScreenProps> = ({
  cartItems,
  userProfile,
  onCompleteOrder,
  setActiveTab,
  appliedPromo,
  onOpenPromoModal,
  storefrontSettings,
  onShowToast,
  deliveryMethods,
  pickupPoints,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    house?: boolean;
    entrance?: boolean;
    intercom?: boolean;
  }>({});
  // Never prefill made-up contact or address data: a guest could submit it unnoticed
  const [name, setName] = useState(userProfile?.name || '');
  const [phone, setPhone] = useState(userProfile?.phone || '');
  const [email, setEmail] = useState(userProfile?.email || '');
  const defaultSaved = userProfile?.savedAddresses?.find((a) => a.isDefault) || userProfile?.savedAddresses?.[0];

  const [addrTitle, setAddrTitle] = useState(defaultSaved?.title || 'Дом');
  const [addrCity, setAddrCity] = useState(defaultSaved?.city || userProfile?.address?.city || 'Москва');
  const [addrPostal, setAddrPostal] = useState(defaultSaved?.postalCode || userProfile?.address?.postalCode || '');
  const [addrStreet, setAddrStreet] = useState(defaultSaved?.street || userProfile?.address?.street || '');
  const [addrHouse, setAddrHouse] = useState(defaultSaved?.house || userProfile?.address?.house || '');
  const [addrEntrance, setAddrEntrance] = useState(defaultSaved?.entrance || userProfile?.address?.entrance || '');
  const [addrFloor, setAddrFloor] = useState(defaultSaved?.floor || userProfile?.address?.floor || '');
  const [addrApartment, setAddrApartment] = useState(defaultSaved?.apartment || userProfile?.address?.apartment || '');
  const [addrIntercom, setAddrIntercom] = useState(defaultSaved?.intercom || userProfile?.address?.intercom || '');

  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [selectedSavedId, setSelectedSavedId] = useState<string>(defaultSaved?.id || 'custom');

  const formattedAddress = formatAddress({
    city: addrCity,
    postalCode: addrPostal,
    street: addrStreet,
    house: addrHouse,
    entrance: addrEntrance,
    floor: addrFloor,
    apartment: addrApartment,
    intercom: addrIntercom,
  });

  const handleSelectSavedAddress = (saved: SavedAddress) => {
    setSelectedSavedId(saved.id);
    setAddrTitle(saved.title || 'Адрес');
    setAddrCity(saved.city || 'Москва');
    setAddrPostal(saved.postalCode || '');
    setAddrStreet(saved.street || '');
    setAddrHouse(saved.house || '');
    setAddrEntrance(saved.entrance || '');
    setAddrFloor(saved.floor || '');
    setAddrApartment(saved.apartment || '');
    setAddrIntercom(saved.intercom || '');
    if (saved.house?.trim() && saved.entrance?.trim() && saved.intercom?.trim()) {
      setValidationError(null);
      setFieldErrors({});
    }
  };

  // Pickup Points Setup
  const activePickupPoints = (pickupPoints && pickupPoints.length > 0 ? pickupPoints : INITIAL_PICKUP_POINTS).filter(
    (p) => p.isActive !== false
  );
  const defaultPickupPoint = activePickupPoints.find((p) => p.isDefault) || activePickupPoints[0];
  const [selectedPickupPointId, setSelectedPickupPointId] = useState<string>(() => defaultPickupPoint?.id || 'pickup-presnya');

  const selectedPickupPoint =
    activePickupPoints.find((p) => p.id === selectedPickupPointId) || activePickupPoints[0];

  // Copy address to clipboard with tactile feedback
  const [copiedAddressId, setCopiedAddressId] = useState<string | null>(null);

  const handleCopyAddress = (textToCopy: string, identifier: string = 'main') => {
    if (!textToCopy) return;
    const cleanText = textToCopy.trim();

    const onCopySuccess = () => {
      setCopiedAddressId(identifier);
      if (onShowToast) {
        onShowToast('Адрес пункта выдачи скопирован в буфер обмена', 'success');
      }
      setTimeout(() => {
        setCopiedAddressId((curr) => (curr === identifier ? null : curr));
      }, 2200);
    };

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard
        .writeText(cleanText)
        .then(onCopySuccess)
        .catch(() => {
          fallbackCopyText(cleanText, onCopySuccess);
        });
    } else {
      fallbackCopyText(cleanText, onCopySuccess);
    }
  };

  const fallbackCopyText = (text: string, onSuccess: () => void) => {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      if (successful) {
        onSuccess();
      } else if (onShowToast) {
        onShowToast('Не удалось скопировать адрес', 'error');
      }
    } catch {
      if (onShowToast) {
        onShowToast('Не удалось скопировать адрес', 'error');
      }
    }
  };

  // Delivery Methods Setup
  const [selectedDelivery, setSelectedDelivery] = useState<string>('courier');
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'sbp' | 'cash'>('card');

  // Calculations (shared with the server-side order validation)
  const pricingLines = cartItems.map((item) => ({
    productId: item.product.id,
    category: item.product.category,
    price: item.product.price,
    quantity: item.quantity,
  }));
  const rawSubtotal = calcSubtotal(pricingLines);
  const discountAmount = calcPromoDiscount(pricingLines, appliedPromo);

  const freeThreshold = storefrontSettings?.freeDeliveryThreshold ?? DEFAULT_FREE_DELIVERY_THRESHOLD;

  const baseDeliveryMethods = deliveryMethods && deliveryMethods.length > 0 ? deliveryMethods : INITIAL_DELIVERY_METHODS;
  const availableDeliveryMethods = getAvailableDeliveryMethods(baseDeliveryMethods, storefrontSettings, rawSubtotal);

  // Keep selected delivery valid
  React.useEffect(() => {
    if (availableDeliveryMethods.length > 0 && !availableDeliveryMethods.some((d) => d.id === selectedDelivery)) {
      setSelectedDelivery(availableDeliveryMethods[0].id);
    }
  }, [availableDeliveryMethods, selectedDelivery]);

  // Keep pickup point in sync
  React.useEffect(() => {
    if (activePickupPoints.length > 0 && !activePickupPoints.some((p) => p.id === selectedPickupPointId)) {
      setSelectedPickupPointId(activePickupPoints[0].id);
    }
  }, [activePickupPoints, selectedPickupPointId]);

  const currentDeliveryObj: Pick<DeliveryMethod, 'id' | 'title' | 'price' | 'duration' | 'type'> =
    availableDeliveryMethods.find((d) => d.id === selectedDelivery) || availableDeliveryMethods[0] || {
      id: 'courier',
      title: 'Курьерская доставка',
      price: 350,
      duration: '1-2 дня',
    };
  const deliveryFee = currentDeliveryObj.price || 0;
  
  const { total: totalPrice } = calcOrderTotals(pricingLines, appliedPromo, deliveryFee);

  const isPickupSelected = selectedDelivery === 'pickup' || currentDeliveryObj.type === 'pickup';
  const isPostSelected = selectedDelivery === 'post' || currentDeliveryObj.type === 'post' || (currentDeliveryObj.title || '').toLowerCase().includes('почт');
  const isCourierSelected = !isPickupSelected && !isPostSelected;

  // Progress over the single-page form: a step is done when its section is filled in
  const contactsDone =
    name.trim().length >= 2 && phone.replace(/\D/g, '').length >= 10 && /\S+@\S+\.\S+/.test(email.trim());
  const deliveryDone = isPickupSelected
    ? Boolean(selectedPickupPoint)
    : isPostSelected
    ? Boolean(addrStreet.trim() && addrHouse?.trim())
    : Boolean(addrStreet.trim() && addrHouse?.trim() && addrEntrance?.trim() && addrIntercom?.trim());
  const paymentDone = Boolean(paymentMethod);
  const steps = [
    { num: 1, label: 'Данные', done: contactsDone, target: 'checkout-contacts' },
    { num: 2, label: 'Доставка', done: deliveryDone, target: 'checkout-delivery' },
    { num: 3, label: 'Оплата', done: paymentDone, target: 'checkout-payment' },
    { num: 4, label: 'Подтверждение', done: false, target: 'checkout-confirm' },
  ];
  const currentStep = steps.find((st) => !st.done)?.num ?? 4;
  const scrollToSection = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (cartItems.length === 0 || isSubmitting) return;

    // Validate courier delivery required fields (street, house, entrance, intercom)
    if (isCourierSelected) {
      const missing: string[] = [];
      const errorsObj: { house?: boolean; entrance?: boolean; intercom?: boolean } = {};

      if (!addrStreet.trim()) {
        missing.push('улица');
      }
      if (!addrHouse || !addrHouse.trim()) {
        missing.push('номер дома');
        errorsObj.house = true;
      }
      if (!addrEntrance || !addrEntrance.trim()) {
        missing.push('подъезд');
        errorsObj.entrance = true;
      }
      if (!addrIntercom || !addrIntercom.trim()) {
        missing.push('код домофона');
        errorsObj.intercom = true;
      }

      if (missing.length > 0) {
        const errorText = `Для курьерской доставки не заполнены обязательные поля: ${missing.join(', ')}. Пожалуйста, укажите их для курьера.`;
        setValidationError(errorText);
        setFieldErrors(errorsObj);
        if (onShowToast) {
          onShowToast(`Заполните данные для курьера: ${missing.join(', ')}`, 'error');
        }
        return;
      }
    } else if (isPostSelected) {
      if (!addrStreet.trim() || !addrHouse || !addrHouse.trim()) {
        const errorText = 'Для отправки Почтой России укажите улицу и номер дома получателя.';
        setValidationError(errorText);
        setFieldErrors({ house: true });
        if (onShowToast) {
          onShowToast('Укажите улицу и номер дома для Почты России', 'error');
        }
        return;
      }
    }

    setValidationError(null);
    setFieldErrors({});
    setIsSubmitting(true);
    const paymentLabel =
      paymentMethod === 'sbp'
        ? 'СБП (Система быстрых платежей)'
        : paymentMethod === 'cash'
        ? 'При получении (наличные / картой)'
        : 'Банковская карта (онлайн)';

    const finalOrderAddress =
      isPickupSelected && selectedPickupPoint
        ? `Самовывоз: ${selectedPickupPoint.name}, г. ${selectedPickupPoint.city}, ${selectedPickupPoint.address}${
            selectedPickupPoint.metro ? ` (м. ${selectedPickupPoint.metro})` : ''
          }`
        : formattedAddress;

    setTimeout(async () => {
      const placed = await onCompleteOrder({
        items: cartItems,
        contact: { name, phone, email },
        address: finalOrderAddress,
        deliveryMethod: currentDeliveryObj.title || 'Курьер',
        deliveryMethodId: currentDeliveryObj.id,
        totalPrice,
        paymentMethod: paymentLabel,
      });
      // The server may reject the order (e.g. out of stock) — let the user retry
      if (placed === false) {
        setIsSubmitting(false);
      }
    }, 450);
  };

  if (cartItems.length === 0) {
    return (
      <div className="py-12 space-y-5 text-center animate-in fade-in duration-300">
        <div className="w-24 h-24 rounded-full neu-flat flex items-center justify-center mx-auto text-[#4E5C70]">
          <ShoppingBag className="w-10 h-10 stroke-[1.5]" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-[#2D3A4E]">Корзина пуста</h2>
          <p className="text-xs text-[#4E5C70] max-w-xs mx-auto">
            Для перехода к оформлению заказа добавьте товары в корзину
          </p>
        </div>
        <button
          onClick={() => setActiveTab('catalog')}
          className="neu-button-accent rounded-full px-6 py-3 font-bold text-xs inline-flex items-center gap-2 cursor-pointer"
        >
          <span>Перейти в каталог</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-28 animate-in fade-in duration-300">
      {/* 4-Step Progress Indicator */}
      <div className="neu-flat rounded-3xl p-4">
        <div className="flex items-center justify-between relative px-2">
          {/* Connector Line */}
          <div className="absolute top-4 left-6 right-6 h-0.5 bg-[#BAC5D5] -z-0" />

          {steps.map((st) => {
            const isCompleted = st.done;
            const isCurrent = st.num === currentStep;

            return (
              <button
                type="button"
                key={st.num}
                onClick={() => scrollToSection(st.target)}
                aria-label={`${st.label}: ${isCompleted ? 'заполнено' : isCurrent ? 'текущий шаг' : 'не заполнено'}`}
                className="flex flex-col items-center gap-1.5 z-10 cursor-pointer rounded-xl"
              >
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs transition-all ${
                    isCurrent
                      ? 'neu-inset-deep neu-inset-deep-animated text-[#4B59BB] bg-[#E3E8EF] ring-2 ring-[#5F6ED0]/50 scale-105'
                      : isCompleted
                      ? 'neu-button text-success font-bold'
                      : 'neu-inset text-[#4E5C70]'
                  }`}
                >
                  {isCompleted ? <CheckCircle className="w-4 h-4" /> : st.num}
                </div>
                <span
                  className={`text-[11px] font-semibold ${
                    isCurrent ? 'text-[#4B59BB] font-bold' : 'text-[#4E5C70]'
                  }`}
                >
                  {st.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Order Summary Items Accordion */}
      <div className="neu-flat rounded-3xl p-4 space-y-3">
        <h3 className="text-xs font-bold text-[#2D3A4E] tracking-wider uppercase">Ваш заказ</h3>
        <div className="space-y-2.5">
          {cartItems.map((item) => (
            <div key={item.id} className="flex items-center gap-3">
              <div className="w-12 h-12 aspect-square rounded-2xl overflow-hidden neu-inset p-1 shrink-0 flex items-center justify-center">
                <img
                  src={item.product?.images?.[0] || 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600&auto=format&fit=crop&q=80'}
                  alt={item.product?.title || ''}
                  className="w-full h-full object-cover rounded-xl"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-[#2D3A4E] truncate">{item.product.title}</p>
                <p className="text-[11px] text-[#4E5C70]">
                  Размер: {item.selectedSize} / Цвет: {item.selectedColor}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-bold text-[#2D3A4E]">
                  {(item.product.price * item.quantity).toLocaleString('ru-RU')} ₽
                </p>
                <p className="text-[11px] text-[#4E5C70]">x{item.quantity}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Promo code shortcut matching Image 5 */}
        <button
          type="button"
          onClick={onOpenPromoModal}
          className="w-full neu-inset rounded-2xl p-3 flex items-center justify-between text-xs font-medium text-slate-700 hover:text-slate-900 transition-all cursor-pointer group mt-2"
        >
          <div className="flex items-center gap-2.5">
            <div
              className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                appliedPromo
                  ? 'neu-inset bg-[#dbe4f0] text-success font-bold'
                  : 'neu-button text-blue-900'
              }`}
            >
              <Tag className="w-3.5 h-3.5 stroke-[2.2]" />
            </div>
            <div className="text-left">
              <span className="font-bold text-slate-900 block">
                {appliedPromo ? `Промокод: ${appliedPromo.code}` : 'Добавить промокод / купон'}
              </span>
              <span className="text-[11px] text-slate-500 font-medium block">
                {appliedPromo
                  ? appliedPromo.discountType === 'fixed'
                    ? `Скидка ${(appliedPromo.discountValue || 0).toLocaleString('ru-RU')} ₽ применена`
                    : `Скидка ${appliedPromo.discountValue || appliedPromo.discountPercent}% применена`
                  : 'Доступны активные купоны'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 text-[#4B59BB] font-extrabold text-xs">
            <span>{appliedPromo ? 'Изменить' : 'Выбрать'}</span>
            <ChevronRight className="w-4 h-4 text-[#4E5C70] group-hover:translate-x-0.5 transition-transform" />
          </div>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Contact Info matching Image 5 */}
        <div id="checkout-contacts" className="neu-flat rounded-3xl p-4 space-y-3 border border-white/60">
          <h3 className="text-xs font-bold text-slate-800 tracking-wider uppercase">
            Контактные данные
          </h3>

          <div className="space-y-2.5">
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ФИО"
                className="w-full neu-inset rounded-2xl py-3 pl-10 pr-3 text-xs font-medium text-slate-800"
              />
            </div>

            <div className="relative">
              <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+7 (999) 000-00-00"
                className="w-full neu-inset rounded-2xl py-3 pl-10 pr-3 text-xs font-medium text-slate-800"
              />
            </div>

            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="E-mail"
                className="w-full neu-inset rounded-2xl py-3 pl-10 pr-3 text-xs font-medium text-slate-800"
              />
            </div>
          </div>
        </div>

        {/* Shipping Address / Pickup Point Section */}
        <div className="neu-flat rounded-3xl p-4 space-y-3">
          {isPickupSelected ? (
            /* Neumorphic Pickup Point Address Card */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl neu-inset flex items-center justify-center text-[#4B59BB] shrink-0">
                    <Store className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-[#2D3A4E] tracking-wider uppercase">
                      Пункт выдачи заказа
                    </h3>
                    <p className="text-[11px] text-[#4E5C70] font-medium">
                      Самовывоз из фирменного бутика {currentStoreName()}
                    </p>
                  </div>
                </div>
                <span className="text-[11px] font-black text-success neu-inset px-2.5 py-1 rounded-full bg-[#E3E8EF] uppercase tracking-wider shrink-0">
                  Бесплатно
                </span>
              </div>

              {/* Main Neumorphic Address Box with Integrated Copy Action */}
              <div className="neu-flat rounded-2xl p-3.5 bg-[#E3E8EF] space-y-3 border border-white/70">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-black text-[#2D3A4E]">
                        {selectedPickupPoint?.name || `Бутик ${currentStoreName()}`}
                      </span>
                      <span className="text-[11px] font-bold text-[#4B59BB] neu-inset px-2 py-0.5 rounded-md bg-[#E3E8EF]">
                        г. {selectedPickupPoint?.city || 'Москва'}
                      </span>
                    </div>

                    <div className="pt-1 text-xs font-bold text-[#2D3A4E] flex items-start gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-[#4B59BB] shrink-0 mt-0.5" />
                      <span className="leading-relaxed select-all">
                        {selectedPickupPoint?.address}
                      </span>
                    </div>

                    {selectedPickupPoint?.metro && (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg neu-inset text-[11px] font-bold text-[#4B59BB] bg-[#E3E8EF] mt-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#5F6ED0] animate-pulse" />
                        <span>м. {selectedPickupPoint.metro}</span>
                      </div>
                    )}
                  </div>

                  {/* Neumorphic Copy Button */}
                  <button
                    type="button"
                    onClick={() =>
                      handleCopyAddress(
                        `г. ${selectedPickupPoint?.city || 'Москва'}, ${selectedPickupPoint?.address || ''}${
                          selectedPickupPoint?.metro ? ` (м. ${selectedPickupPoint.metro})` : ''
                        }`,
                        'top-pickup'
                      )
                    }
                    className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      copiedAddressId === 'top-pickup'
                        ? 'neu-inset text-success bg-[#E3E8EF] ring-1.5 ring-success/50 scale-95'
                        : 'neu-button text-[#4B59BB] hover:text-[#3F4BA6] active:scale-95'
                    }`}
                    title="Скопировать адрес пункта выдачи в буфер обмена"
                  >
                    {copiedAddressId === 'top-pickup' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-success animate-in zoom-in-50 duration-200" />
                        <span className="text-[11px] text-success font-extrabold">Скопировано!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-[#4B59BB]" />
                        <span className="text-[11px]">Скопировать</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Schedule & Phone in Neumorphic Sub-bar */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2.5 border-t border-[#BAC5D5]/40 text-[11px] text-[#4E5C70]">
                  {selectedPickupPoint?.schedule && (
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[#4B59BB] shrink-0" />
                      <span className="truncate">{selectedPickupPoint.schedule}</span>
                    </div>
                  )}
                  {selectedPickupPoint?.phone && (
                    <div className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-[#4B59BB] shrink-0" />
                      <span className="font-bold text-[#2D3A4E]">{selectedPickupPoint.phone}</span>
                    </div>
                  )}
                </div>

                {selectedPickupPoint?.note && (
                  <div className="flex items-start gap-1.5 text-[11px] text-[#4E5C70] neu-inset p-2 rounded-xl bg-[#E3E8EF]">
                    <Sparkles className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
                    <span className="leading-snug">{selectedPickupPoint.note}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Courier & Russian Post Address Card */
            <>
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-[#2D3A4E] tracking-wider uppercase">
                  {isPostSelected ? 'Адрес доставки (Почта России)' : 'Адрес курьерской доставки'}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsAddressModalOpen(true)}
                  className="text-xs font-bold text-[#4B59BB] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Редактировать адрес</span>
                </button>
              </div>

              {/* Quick Selector for Saved Addresses */}
              {userProfile.savedAddresses && userProfile.savedAddresses.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                  {userProfile.savedAddresses.map((sa) => {
                    const isSel = selectedSavedId === sa.id;
                    return (
                      <button
                        key={sa.id}
                        type="button"
                        onClick={() => handleSelectSavedAddress(sa)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer ${
                          isSel
                            ? 'neu-pill-active'
                            : 'neu-button text-[#2D3A4E] hover:text-[#4B59BB]'
                        }`}
                      >
                        {sa.title}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Structured Address Summary Display */}
              <div
                className={`neu-inset rounded-2xl p-3.5 space-y-2 bg-[#E3E8EF] transition-all ${
                  validationError ? 'ring-2 ring-danger/80 bg-danger-soft' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#2D3A4E] flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-[#4B59BB]" />
                    {addrTitle}
                  </span>
                  {addrPostal && (
                    <span className="text-[11px] font-bold text-[#4E5C70] neu-inset px-2 py-0.5 rounded-md">
                      Индекс: {addrPostal}
                    </span>
                  )}
                </div>

                {/* Validation Alert inside address card if data incomplete */}
                {validationError && (
                  <div className="p-2.5 rounded-xl bg-danger-soft border border-danger/35 text-danger space-y-1.5 animate-in fade-in duration-200">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
                      <div className="text-xs">
                        <p className="font-bold text-danger">
                          {isPostSelected
                            ? 'Данные адреса для Почты России не заполнены'
                            : 'Данные для курьера не заполнены'}
                        </p>
                        <p className="text-[11px] text-danger leading-snug">{validationError}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsAddressModalOpen(true)}
                      className="w-full py-1.5 px-3 rounded-lg bg-danger hover:bg-danger/90 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                    >
                      <Pencil className="w-3 h-3" />
                      <span>
                        {isPostSelected
                          ? 'Указать номер дома и квартиры'
                          : 'Указать номер дома, подъезд и домофон'}
                      </span>
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[11px] text-[#4E5C70] font-medium block">Город</span>
                    <span className="font-bold text-[#2D3A4E]">{addrCity}</span>
                  </div>
                  <div>
                    <span className="text-[11px] text-[#4E5C70] font-medium block">Индекс</span>
                    <span className="font-bold text-[#2D3A4E]">{addrPostal}</span>
                  </div>
                </div>

                <div className="text-xs">
                  <span className="text-[11px] text-[#4E5C70] font-medium block">Улица</span>
                  <span className="font-bold text-[#2D3A4E]">{addrStreet}</span>
                </div>

                {/* Structured details: Дом, Подъезд, Этаж, Квартира, Домофон */}
                {isPostSelected ? (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {addrHouse ? (
                      <span className="neu-flat-sm px-2 py-0.5 rounded-lg text-[11px] font-bold text-[#2D3A4E] bg-[#E3E8EF]/90 border border-white/60">
                        д. {addrHouse}
                      </span>
                    ) : (
                      <span className="neu-flat-sm px-2 py-0.5 rounded-lg text-[11px] font-bold text-danger bg-danger-soft border border-danger/35">
                        нет дома *
                      </span>
                    )}
                    {addrApartment && (
                      <span className="neu-flat-sm px-2 py-0.5 rounded-lg text-[11px] font-bold text-[#2D3A4E] bg-[#E3E8EF]/90 border border-white/60">
                        {addrApartment.toLowerCase().includes('кв') ||
                        addrApartment.toLowerCase().includes('оф')
                          ? addrApartment
                          : `кв. ${addrApartment}`}
                      </span>
                    )}
                    <span className="neu-flat-sm px-2 py-0.5 rounded-lg text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200">
                      Почта России (1-й класс)
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {addrHouse ? (
                      <span className="neu-flat-sm px-2 py-0.5 rounded-lg text-[11px] font-bold text-[#2D3A4E] bg-[#E3E8EF]/90 border border-white/60">
                        д. {addrHouse}
                      </span>
                    ) : (
                      <span className="neu-flat-sm px-2 py-0.5 rounded-lg text-[11px] font-bold text-danger bg-danger-soft border border-danger/35">
                        нет дома *
                      </span>
                    )}
                    {addrEntrance ? (
                      <span className="neu-flat-sm px-2 py-0.5 rounded-lg text-[11px] font-bold text-[#2D3A4E] bg-[#E3E8EF]/90 border border-white/60">
                        подъезд {addrEntrance}
                      </span>
                    ) : (
                      <span className="neu-flat-sm px-2 py-0.5 rounded-lg text-[11px] font-bold text-danger bg-danger-soft border border-danger/35">
                        нет подъезда *
                      </span>
                    )}
                    {addrFloor && (
                      <span className="neu-flat-sm px-2 py-0.5 rounded-lg text-[11px] font-bold text-[#2D3A4E] bg-[#E3E8EF]/90 border border-white/60">
                        эт. {addrFloor}
                      </span>
                    )}
                    {addrApartment && (
                      <span className="neu-flat-sm px-2 py-0.5 rounded-lg text-[11px] font-bold text-[#2D3A4E] bg-[#E3E8EF]/90 border border-white/60">
                        {addrApartment.toLowerCase().includes('кв') ||
                        addrApartment.toLowerCase().includes('оф')
                          ? addrApartment
                          : `кв. ${addrApartment}`}
                      </span>
                    )}
                    {addrIntercom ? (
                      <span className="neu-flat-sm px-2 py-0.5 rounded-lg text-[11px] font-bold text-[#4B59BB] bg-[#5F6ED0]/10 border border-[#5F6ED0]/20">
                        домофон: {addrIntercom}
                      </span>
                    ) : (
                      <span className="neu-flat-sm px-2 py-0.5 rounded-lg text-[11px] font-bold text-danger bg-danger-soft border border-danger/35">
                        нет домофона *
                      </span>
                    )}
                  </div>
                )}

                <div className="pt-1 border-t border-[#BAC5D5]/40 text-[11px] text-[#4E5C70]">
                  <span className="font-bold text-[#2D3A4E]">
                    {isPostSelected ? 'Почта России: ' : 'Курьеру: '}
                  </span>
                  <span className="text-[#2D3A4E]">{formattedAddress}</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Shipping Methods */}
        <div id="checkout-delivery" className="neu-flat rounded-3xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-[#2D3A4E] tracking-wider uppercase">
              Способ доставки
            </h3>
            {rawSubtotal >= freeThreshold && (
              <span className="neu-inset text-success text-[11px] font-black px-2 py-0.5 rounded-full bg-[#E3E8EF]">
                Бесплатная доставка активна
              </span>
            )}
          </div>

          <div className="space-y-3">
            {availableDeliveryMethods.map((method) => {
              const isSelected = selectedDelivery === method.id;
              const isPickupMethod = method.id === 'pickup' || method.type === 'pickup';

              const DeliveryIcon =
                isPickupMethod || method.icon === 'Store'
                  ? Store
                  : method.id === 'post' || method.icon === 'Mail'
                  ? Package
                  : method.id === 'express' || method.icon === 'Zap'
                  ? Zap
                  : method.icon === 'Truck'
                  ? Truck
                  : Bike;

              return (
                <div
                  key={method.id}
                  className={`rounded-2xl transition-all ${
                    isSelected ? 'neu-pill-active p-3.5' : 'neu-button p-3.5'
                  }`}
                >
                  {/* Method Header Row */}
                  <div
                    onClick={() => setSelectedDelivery(method.id)}
                    className="flex items-center justify-between gap-3 cursor-pointer"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all ${
                          isSelected
                            ? 'neu-pill-active'
                            : 'neu-button text-[#4E5C70]'
                        }`}
                      >
                        {isSelected && (
                          <div className="w-2.5 h-2.5 rounded-full bg-[#5F6ED0] animate-in zoom-in-50 duration-200" />
                        )}
                      </div>

                      <div
                        className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 transition-all ${
                          isSelected
                            ? 'neu-pill-active'
                            : 'neu-button text-[#2D3A4E]'
                        }`}
                      >
                        <DeliveryIcon className="w-4 h-4" />
                      </div>

                      <div className="min-w-0 flex-1 pr-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p
                            className={`text-xs leading-snug transition-colors line-clamp-2 ${
                              isSelected ? 'font-black text-[#4B59BB]' : 'font-bold text-[#2D3A4E]'
                            }`}
                          >
                            {method.title}
                          </p>
                          {method.highlightBadge && (
                            <span className="neu-fill-accent text-white text-[11px] font-black px-1.5 py-0.2 rounded-full uppercase">
                              {method.highlightBadge}
                            </span>
                          )}
                        </div>

                        <p className="text-[11px] text-[#4E5C70] mt-0.5">
                          {isPickupMethod && selectedPickupPoint
                            ? `${selectedPickupPoint.name} (${selectedPickupPoint.city})`
                            : method.duration}
                        </p>
                      </div>
                    </div>

                    <span
                      className={`text-xs font-bold shrink-0 whitespace-nowrap pl-1 ${
                        method.price === 0
                          ? 'text-success font-extrabold'
                          : isSelected
                          ? 'text-[#4B59BB]'
                          : 'text-[#2D3A4E]'
                      }`}
                    >
                      {method.price === 0 ? 'Бесплатно' : `${method.price} ₽`}
                    </span>
                  </div>

                  {/* Expanded Pickup Point Selection (when Pickup method is selected) */}
                  {isSelected && isPickupMethod && (
                    <div className="mt-3 pt-3 border-t border-[#BAC5D5]/50 space-y-2.5 animate-in fade-in duration-200">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-extrabold text-[#2D3A4E] uppercase tracking-wider flex items-center gap-1.5">
                          <Store className="w-3.5 h-3.5 text-[#4B59BB]" />
                          <span>Выберите пункт выдачи</span>
                        </span>
                        <span className="text-[11px] font-bold text-[#4B59BB] neu-inset px-2 py-0.5 rounded-lg bg-[#E3E8EF]">
                          {activePickupPoints.length} {activePickupPoints.length === 1 ? 'бутик' : 'адреса'}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {activePickupPoints.map((point) => {
                          const isPointSelected = selectedPickupPointId === point.id;
                          return (
                            <div
                              key={point.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedPickupPointId(point.id);
                              }}
                              className={`p-3 rounded-2xl cursor-pointer transition-all space-y-2 ${
                                isPointSelected
                                  ? 'neu-pill-active'
                                  : 'neu-button hover:bg-[#E3E8EF]/80'
                              }`}
                            >
                              {/* Point Header */}
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div
                                    className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                                      isPointSelected
                                        ? 'neu-button text-[#4B59BB]'
                                        : 'neu-inset'
                                    }`}
                                  >
                                    {isPointSelected && (
                                      <div className="w-2 h-2 rounded-full bg-[#5F6ED0]" />
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <span className="text-xs font-black text-[#2D3A4E] block leading-snug line-clamp-2">
                                      {point.name}
                                    </span>
                                    <span className="text-[11px] font-bold text-[#4B59BB]">
                                      г. {point.city}
                                    </span>
                                  </div>
                                </div>

                                {point.isDefault && (
                                  <span className="text-[11px] font-black text-[#4B59BB] neu-inset px-1.5 py-0.5 rounded-md uppercase shrink-0">
                                    Основной
                                  </span>
                                )}
                              </div>

                              {/* Full Unclipped Address with Neumorphic Copy Button */}
                              <div className="neu-flat-sm rounded-xl p-3 bg-[#E3E8EF]/90 space-y-2 border border-white/60">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="space-y-1 min-w-0 flex-1">
                                    <div className="flex items-start gap-1.5">
                                      <MapPin className="w-3.5 h-3.5 text-[#4B59BB] shrink-0 mt-0.5" />
                                      <p className="text-xs font-bold text-[#2D3A4E] leading-relaxed break-words select-all">
                                        {point.address}
                                      </p>
                                    </div>
                                    {point.metro && (
                                      <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#4B59BB] neu-inset px-2 py-0.5 rounded-md bg-[#E3E8EF] mt-0.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-[#5F6ED0]" />
                                        <span>м. {point.metro}</span>
                                      </div>
                                    )}
                                  </div>

                                  {/* Neumorphic Item Copy Button */}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleCopyAddress(
                                        `г. ${point.city}, ${point.address}${
                                          point.metro ? ` (м. ${point.metro})` : ''
                                        }`,
                                        point.id
                                      );
                                    }}
                                    className={`shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                                      copiedAddressId === point.id
                                        ? 'neu-inset text-success bg-[#E3E8EF] ring-1.5 ring-success/50 scale-95'
                                        : 'neu-button text-[#4B59BB] hover:text-[#3F4BA6] active:scale-95'
                                    }`}
                                    title="Скопировать адрес в буфер обмена"
                                  >
                                    {copiedAddressId === point.id ? (
                                      <>
                                        <Check className="w-3 h-3 text-success animate-in zoom-in-50 duration-200" />
                                        <span className="text-success font-extrabold">Скопировано</span>
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="w-3 h-3 text-[#4B59BB]" />
                                        <span>Скопировать</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                              </div>

                              {/* Schedule & Phone */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-[#4E5C70]">
                                <div className="flex items-center gap-1.5">
                                  <Clock className="w-3 h-3 text-[#4B59BB] shrink-0" />
                                  <span className="truncate">{point.schedule}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <Phone className="w-3 h-3 text-[#4B59BB] shrink-0" />
                                  <span className="truncate font-semibold text-[#2D3A4E]">{point.phone}</span>
                                </div>
                              </div>

                              {/* Note / Amenities */}
                              {point.note && (
                                <div className="flex items-start gap-1.5 text-[11px] text-[#4E5C70] bg-[#BAC5D5]/20 p-2 rounded-xl">
                                  <Sparkles className="w-3 h-3 text-warning shrink-0 mt-0.5" />
                                  <span className="leading-snug">{point.note}</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Payment Methods */}
        <div id="checkout-payment" className="neu-flat rounded-3xl p-4 space-y-3">
          <h3 className="text-xs font-bold text-[#2D3A4E] tracking-wider uppercase">
            Способ оплаты
          </h3>
          <div className="grid grid-cols-3 gap-2 p-1.5 neu-flat-sm rounded-2xl">
            {[
              { id: 'card', label: 'Карта', icon: CreditCard },
              { id: 'sbp', label: 'СБП', icon: ShieldCheck },
              { id: 'cash', label: 'При получении', icon: User },
            ].map((item) => {
              const Icon = item.icon;
              const isSelected = paymentMethod === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPaymentMethod(item.id as any)}
                  className={`py-3 px-1.5 rounded-xl text-center flex flex-col items-center justify-center gap-1.5 text-xs transition-all duration-200 cursor-pointer ${
                    isSelected
                      ? 'neu-pill-active font-bold'
                      : 'text-[#4E5C70] hover:text-[#2D3A4E] font-medium'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="leading-tight text-[11px]">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Receipt / Order Breakdown Card */}
        <div className="neu-flat rounded-3xl p-4 space-y-2.5 text-xs text-[#2D3A4E]">
          <h3 className="font-bold uppercase tracking-wider text-[11px] text-[#4E5C70] border-b border-[#BAC5D5]/40 pb-2">
            Детализация оплаты
          </h3>

          <div className="flex items-center justify-between">
            <span className="text-[#4E5C70]">Товары ({cartItems.reduce((acc, i) => acc + i.quantity, 0)} шт.):</span>
            <span className="font-bold">{rawSubtotal.toLocaleString('ru-RU')} ₽</span>
          </div>

          {discountAmount > 0 && (
            <div className="flex items-center justify-between text-success">
              <span className="font-medium">Скидка по промокоду:</span>
              <span className="font-bold">-{discountAmount.toLocaleString('ru-RU')} ₽</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-[#4E5C70]">Доставка ({currentDeliveryObj.title}):</span>
            <span className={deliveryFee === 0 ? 'font-black text-success' : 'font-bold'}>
              {deliveryFee === 0 ? 'Бесплатно' : `${deliveryFee} ₽`}
            </span>
          </div>

          <div className="pt-2 border-t border-[#BAC5D5]/50 flex items-center justify-between text-sm">
            <span className="font-black text-[#2D3A4E]">Итого к оплате:</span>
            <span className="text-base font-black text-[#4B59BB]">
              {totalPrice.toLocaleString('ru-RU')} ₽
            </span>
          </div>
        </div>

        {/* Error notification banner right above submit if validation failed */}
        {validationError && (
          <div className="p-3.5 rounded-2xl bg-danger-soft border border-danger/35 text-danger text-xs font-semibold flex items-center justify-between gap-3 animate-in fade-in duration-200">
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle className="w-4 h-4 text-danger shrink-0" />
              <span className="line-clamp-2">{validationError}</span>
            </div>
            <button
              type="button"
              onClick={() => setIsAddressModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-danger hover:bg-danger/90 text-white font-bold text-xs shrink-0 cursor-pointer shadow-xs transition-colors"
            >
              Заполнить
            </button>
          </div>
        )}

        {/* Final Blue Action Button - Confirm Order with neu-inset-deep animation */}
        <button
          id="checkout-confirm"
          type="submit"
          disabled={isSubmitting}
          className={`w-full py-4 rounded-2xl btn-confirm-order font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition-all ${
            isSubmitting
              ? 'neu-inset-deep neu-inset-deep-animated text-[#4B59BB] bg-[#E3E8EF] ring-2 ring-[#5F6ED0]/40'
              : 'neu-button-accent text-white active:scale-[0.98]'
          }`}
        >
          {isSubmitting ? (
            <>
              <span className="w-4 h-4 border-2 border-[#5F6ED0] border-t-transparent rounded-full animate-spin" />
              <span>Оформление заказа...</span>
            </>
          ) : (
            <>
              <span>Подтвердить заказ • {totalPrice.toLocaleString('ru-RU')} ₽</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      {/* Address Edit Modal matching attached image */}
      <AddressEditModal
        isOpen={isAddressModalOpen}
        onClose={() => setIsAddressModalOpen(false)}
        editingAddress={{
          id: selectedSavedId,
          title: addrTitle,
          city: addrCity,
          postalCode: addrPostal,
          street: addrStreet,
          house: addrHouse,
          entrance: addrEntrance,
          floor: addrFloor,
          apartment: addrApartment,
          intercom: addrIntercom,
          isDefault: true,
        }}
        onSave={(updated) => {
          setAddrTitle(updated.title);
          setAddrCity(updated.city);
          setAddrPostal(updated.postalCode || '');
          setAddrStreet(updated.street);
          setAddrHouse(updated.house || '');
          setAddrEntrance(updated.entrance || '');
          setAddrFloor(updated.floor || '');
          setAddrApartment(updated.apartment || '');
          setAddrIntercom(updated.intercom || '');
          setValidationError(null);
          setFieldErrors({});
        }}
      />
    </div>
  );
};
