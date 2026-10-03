import React, { useEffect, useState } from 'react';
import { isPreorderVariant } from '../utils/inventory';
import { pluralRu } from '../utils/pluralize';
import { LegalConsentNote } from '../components/LegalConsentNote';
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
  Tag,
  Pencil,
  Truck,
  Package,
  ShoppingBag,
  AlertCircle,
  Clock,
  Sparkles,
  Check,
  Zap,
  Copy,
} from 'lucide-react';
import { CartItem, DeliveryMethod, PickupPoint, UserProfile, ActiveTab, AppliedPromoInfo, StorefrontSettings, SavedAddress } from '../types';
import { AddressEditModal } from '../components/AddressEditModal';
import { formatAddress } from '../utils/addressFormat';
import {
  calcOrderTotals,
  calcPromoDiscount,
  toPricingLine,
  calcSubtotal,
  getAvailableDeliveryMethods,
} from '../shared/orderPricing';
import { NotConfigured } from '../components/NotConfigured';
import { productImage } from '../utils/productImage';
import { promoDiscountText } from '../utils/promoLabel';
import { cleanAddressParts, fullName, namePartsOf, requiresFullName, type AddressParts, type PersonName } from '../shared/personName';
import { deliveryKindOfMethod } from '../shared/orderFlow';

interface CheckoutScreenProps {
  cartItems: CartItem[];
  userProfile: UserProfile;
  onCompleteOrder: (orderData: {
    items: CartItem[];
    contact: { name: string; phone: string; email: string } & PersonName;
    address: string;
    addressParts?: AddressParts;
    deliveryMethod: string;
    deliveryMethodId?: string;
    totalPrice: number;
    /** Same breakdown as placeOrder writes: the order keeps the delivery fee and the promo discount */
    deliveryFee?: number;
    discountAmount?: number;
    paymentMethod?: string;
    usedBonusPoints?: number;
  }) => void | Promise<boolean>;
  setActiveTab: (tab: ActiveTab) => void;
  appliedPromo: AppliedPromoInfo | null;
  hasActivePromos?: boolean;
  onOpenPromoModal: () => void;
  storefrontSettings?: StorefrontSettings;
  onShowToast?: (text: string, type?: 'success' | 'info' | 'error') => void;
  deliveryMethods?: DeliveryMethod[];
  pickupPoints?: PickupPoint[];
}

// Contacts typed on checkout survive «Назад» within the tab session (sessionStorage, per account)
const CHECKOUT_CONTACTS_KEY = 'manstyle_checkout_contacts';
type ContactsDraft = {
  owner: string;
  lastName: string;
  firstName: string;
  middleName: string;
  noMiddleName?: boolean;
  phone: string;
  email: string;
};

function readContactsDraft(owner: string): ContactsDraft | null {
  try {
    const raw = sessionStorage.getItem(CHECKOUT_CONTACTS_KEY);
    const draft = raw ? (JSON.parse(raw) as ContactsDraft) : null;
    return draft && draft.owner === owner ? draft : null;
  } catch {
    return null;
  }
}

function clearContactsDraft() {
  try {
    sessionStorage.removeItem(CHECKOUT_CONTACTS_KEY);
  } catch {
    // storage unavailable: nothing to clear
  }
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
  hasActivePromos = false,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  // The form's own «Подтвердить» is on screen: the phone's fixed bar hides
  const confirmRef = React.useRef<HTMLButtonElement>(null);
  const [confirmInView, setConfirmInView] = useState(false);
  useEffect(() => {
    const el = confirmRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setConfirmInView(entry.isIntersecting), { threshold: 0.6 });
    io.observe(el);
    return () => io.disconnect();
  }, [cartItems.length]);
  // Errors next to the contact fields (one check in handleSubmit; the browser's own bubbles are off: noValidate)
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<'lastName' | 'firstName' | 'middleName' | 'phone' | 'email', string>>
  >({});
  // Never prefill made-up contact or address data: a guest could submit it unnoticed
  const draftOwner = userProfile?.email || 'guest';
  const [contactsDraft] = useState(() => readContactsDraft(draftOwner));
  // Фамилия, имя, отчество — from the profile of a signed-in buyer (an old single name is split into parts)
  const [profileName] = useState(() => namePartsOf(userProfile ?? { name: '' }));
  const [lastName, setLastName] = useState(contactsDraft?.lastName ?? (profileName.lastName || ''));
  const [firstName, setFirstName] = useState(contactsDraft?.firstName ?? (profileName.firstName || ''));
  const [middleName, setMiddleName] = useState(contactsDraft?.middleName ?? (profileName.middleName || ''));
  const [noMiddleName, setNoMiddleName] = useState(contactsDraft?.noMiddleName ?? false);
  const [phone, setPhone] = useState(contactsDraft?.phone ?? (userProfile?.phone || ''));
  const [email, setEmail] = useState(contactsDraft?.email ?? (userProfile?.email || ''));

  useEffect(() => {
    try {
      const draft: ContactsDraft = { owner: draftOwner, lastName, firstName, middleName, noMiddleName, phone, email };
      sessionStorage.setItem(CHECKOUT_CONTACTS_KEY, JSON.stringify(draft));
    } catch {
      // storage unavailable (private mode): the form still works, only the draft is lost
    }
  }, [draftOwner, lastName, firstName, middleName, noMiddleName, phone, email]);
  const defaultSaved = userProfile?.savedAddresses?.find((a) => a.isDefault) || userProfile?.savedAddresses?.[0];

  const [addrTitle, setAddrTitle] = useState(defaultSaved?.title || 'Дом');
  const [addrCity, setAddrCity] = useState(defaultSaved?.city || userProfile?.address?.city || '');
  const [addrPostal, setAddrPostal] = useState(defaultSaved?.postalCode || userProfile?.address?.postalCode || '');
  const [addrStreet, setAddrStreet] = useState(defaultSaved?.street || userProfile?.address?.street || '');
  const [addrHouse, setAddrHouse] = useState(defaultSaved?.house || userProfile?.address?.house || '');
  const [addrEntrance, setAddrEntrance] = useState(defaultSaved?.entrance || userProfile?.address?.entrance || '');
  const [addrFloor, setAddrFloor] = useState(defaultSaved?.floor || userProfile?.address?.floor || '');
  const [addrApartment, setAddrApartment] = useState(defaultSaved?.apartment || userProfile?.address?.apartment || '');
  const [addrIntercom, setAddrIntercom] = useState(defaultSaved?.intercom || userProfile?.address?.intercom || '');
  const [addrRegion, setAddrRegion] = useState(defaultSaved?.region || '');
  const [addrComment, setAddrComment] = useState(defaultSaved?.comment || '');

  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [selectedSavedId, setSelectedSavedId] = useState<string>(defaultSaved?.id || 'custom');

  const formattedAddress = formatAddress({
    region: addrRegion,
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
    setAddrCity(saved.city || '');
    setAddrPostal(saved.postalCode || '');
    setAddrStreet(saved.street || '');
    setAddrHouse(saved.house || '');
    setAddrEntrance(saved.entrance || '');
    setAddrFloor(saved.floor || '');
    setAddrApartment(saved.apartment || '');
    setAddrIntercom(saved.intercom || '');
    setAddrRegion(saved.region || '');
    setAddrComment(saved.comment || '');
    if (saved.house?.trim() && saved.entrance?.trim() && saved.intercom?.trim()) {
      setValidationError(null);
    }
  };

  // Pickup Points Setup
  const activePickupPoints = (pickupPoints ?? []).filter(
    (p) => p.isActive !== false
  );
  const defaultPickupPoint = activePickupPoints.find((p) => p.isDefault) || activePickupPoints[0];
  const [selectedPickupPointId, setSelectedPickupPointId] = useState<string>(() => defaultPickupPoint?.id || '');

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
  // Payment methods from Admin → «Оплата» only (no built-in card / SBP options)
  const activePaymentMethods = (storefrontSettings?.paymentMethods ?? []).filter(
    (m) => m.isActive !== false && m.title.trim()
  );
  const [paymentMethod, setPaymentMethod] = useState<string>(() => activePaymentMethods[0]?.id ?? '');
  const selectedPayment = activePaymentMethods.find((m) => m.id === paymentMethod) ?? activePaymentMethods[0];
  const noPaymentMethods = activePaymentMethods.length === 0;

  // Calculations (shared with the server-side order validation)
  const pricingLines = cartItems.map(toPricingLine);
  const rawSubtotal = calcSubtotal(pricingLines);
  const discountAmount = calcPromoDiscount(pricingLines, appliedPromo);

  const freeThreshold = storefrontSettings?.freeDeliveryThreshold ?? 0;

  const baseDeliveryMethods = deliveryMethods ?? [];
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
      // No methods configured yet: nothing to charge, the order cannot be placed
      id: '',
      title: 'не выбрана',
      price: 0,
      duration: '',
    };
  const deliveryFee = currentDeliveryObj.price || 0;
  
  const { total: totalPrice } = calcOrderTotals(pricingLines, appliedPromo, deliveryFee);

  const isPickupSelected = selectedDelivery === 'pickup' || currentDeliveryObj.type === 'pickup';
  // Почта и транспортные компании (тип «Транспортная компания» или СДЭК в названии) — адрес с индексом, без подъезда
  // и домофона: их спрашивает только курьер магазина (src/shared/orderFlow.ts)
  const isPostSelected =
    !isPickupSelected && (selectedDelivery === 'post' || deliveryKindOfMethod(currentDeliveryObj) === 'carrier');
  const isCourierSelected = !isPickupSelected && !isPostSelected;
  // Почта России и транспортные компании выдают посылку по паспорту: полное ФИО с отчеством (или «Нет отчества»)
  const fullNameRequired = !isPickupSelected && requiresFullName(currentDeliveryObj);
  const middleNameMissing = fullNameRequired && !noMiddleName && !middleName.trim();
  // The carrier is whatever the store named the method («Почта России», «СДЭК»…), not a fixed name
  const deliveryTitle = currentDeliveryObj.title?.trim() || 'Доставка';

  // Progress over the single-page form: a step is done when its section is filled in
  const contactsDone =
    lastName.trim().length > 0 &&
    firstName.trim().length > 0 &&
    !middleNameMissing &&
    phone.replace(/\D/g, '').length >= 10 &&
    /\S+@\S+\.\S+/.test(email.trim());
  // Nothing to choose from until the owner adds delivery methods / pickup points in the admin
  const noDeliveryMethods = availableDeliveryMethods.length === 0;
  const noPickupPoints = isPickupSelected && activePickupPoints.length === 0;
  const deliveryUnavailable = noDeliveryMethods || noPickupPoints;
  // Ordering needs a delivery method (and point) and a payment method from the admin panel
  const orderBlocked = deliveryUnavailable || noPaymentMethods;
  const deliveryDone = deliveryUnavailable
    ? false
    : isPickupSelected
    ? Boolean(selectedPickupPoint)
    : isPostSelected
    ? Boolean(addrCity.trim() && addrStreet.trim() && addrHouse?.trim())
    : Boolean(addrCity.trim() && addrStreet.trim() && addrHouse?.trim() && addrEntrance?.trim() && addrIntercom?.trim());
  const paymentDone = Boolean(selectedPayment);
  // A step counts as done only when every step before it is done too (payment is preselected, so «Оплата» alone
  // must not look finished while the contacts are empty)
  const steps = [
    { num: 1, label: 'Данные', done: contactsDone, target: 'checkout-contacts' },
    { num: 2, label: 'Доставка', done: deliveryDone, target: 'checkout-delivery' },
    { num: 3, label: 'Оплата', done: paymentDone, target: 'checkout-payment' },
    { num: 4, label: 'Подтверждение', done: false, target: 'checkout-confirm' },
  ].map((st, i, all) => ({ ...st, done: all.slice(0, i + 1).every((x) => x.done) }));
  const currentStep = steps.find((st) => !st.done)?.num ?? 4;
  const scrollToSection = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cartItems.length === 0 || isSubmitting) return;

    if (orderBlocked) {
      const text = noDeliveryMethods
        ? 'Способы доставки пока не настроены. Свяжитесь с магазином через чат поддержки.'
        : noPaymentMethods
        ? 'Способы оплаты пока не настроены. Свяжитесь с магазином через чат поддержки.'
        : 'Пункты выдачи пока не добавлены. Выберите другой способ доставки.';
      setValidationError(text);
      onShowToast?.(text, 'error');
      return;
    }

    // One check for the whole form: errors next to the fields, the page scrolls to the first one
    const contactErrors: typeof fieldErrors = {};
    if (!lastName.trim()) contactErrors.lastName = 'Укажите фамилию';
    if (!firstName.trim()) contactErrors.firstName = 'Укажите имя';
    if (middleNameMissing) {
      contactErrors.middleName = `Для доставки «${deliveryTitle}» нужно отчество — или отметьте «Нет отчества»`;
    }
    if (phone.replace(/\D/g, '').length < 10) contactErrors.phone = 'Укажите телефон: не меньше 10 цифр';
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) contactErrors.email = 'Укажите email в формате name@example.ru';
    setFieldErrors(contactErrors);
    const addressError = isPickupSelected ? null : missingAddressText();
    setValidationError(addressError);
    const firstInvalid = contactErrors.lastName
      ? 'checkout-last-name'
      : contactErrors.firstName
      ? 'checkout-first-name'
      : contactErrors.middleName
      ? 'checkout-middle-name'
      : contactErrors.phone
      ? 'checkout-phone'
      : contactErrors.email
      ? 'checkout-email'
      : addressError
      ? 'checkout-address'
      : null;
    if (firstInvalid) {
      // No toast: error toasts stay until closed and would pile up with every attempt; the message is at the field,
      // the field gets the focus (announced with its error) and the page scrolls to it
      const target = document.getElementById(firstInvalid);
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (target instanceof HTMLInputElement) target.focus({ preventScroll: true });
      return;
    }

    setValidationError(null);
    setIsSubmitting(true);
    // The order keeps the method's name; «при получении» in it sets the «оплата при получении» status
    const paymentTitle = selectedPayment?.title.trim() ?? '';
    const paymentLabel =
      selectedPayment?.onDelivery && !paymentTitle.toLowerCase().includes('получении')
        ? `${paymentTitle} (при получении)`
        : paymentTitle;

    const finalOrderAddress =
      isPickupSelected && selectedPickupPoint
        ? `Самовывоз: ${selectedPickupPoint.name}, ${selectedPickupPoint.city ? `г. ${selectedPickupPoint.city}, ` : ''}${
            selectedPickupPoint.address
          }${selectedPickupPoint.metro ? ` (м. ${selectedPickupPoint.metro})` : ''}`
        : formattedAddress;

    const personName: PersonName = {
      lastName: lastName.trim(),
      firstName: firstName.trim(),
      middleName: noMiddleName ? '' : middleName.trim(),
    };
    // Parts of the address for the admin card with copy buttons (none for pickup: the point is in the address)
    const addressParts: AddressParts | undefined = isPickupSelected
      ? undefined
      : cleanAddressParts({
          region: addrRegion,
          city: addrCity,
          street: addrStreet,
          house: addrHouse,
          entrance: addrEntrance,
          floor: addrFloor,
          intercom: addrIntercom,
          apartment: addrApartment,
          postalCode: addrPostal,
          comment: addrComment,
        });

    const placed = await onCompleteOrder({
      items: cartItems,
      contact: { name: fullName(personName), phone, email, ...personName },
      address: finalOrderAddress,
      addressParts,
      deliveryMethod: currentDeliveryObj.title || 'Курьер',
      deliveryMethodId: currentDeliveryObj.id,
      totalPrice,
      deliveryFee,
      discountAmount,
      paymentMethod: paymentLabel,
    });
    // The server may reject the order (e.g. out of stock) — let the user retry
    if (placed === false) {
      setIsSubmitting(false);
    } else {
      clearContactsDraft();
    }
  };

  /** What the chosen delivery still needs from the address; null — complete */
  function missingAddressText(): string | null {
    if (isCourierSelected) {
      const missing: string[] = [];

      if (!addrCity.trim()) missing.push('город');
      if (!addrStreet.trim()) missing.push('улица');
      if (!addrHouse?.trim()) missing.push('номер дома');
      if (!addrEntrance?.trim()) missing.push('подъезд');
      if (!addrIntercom?.trim()) missing.push('код домофона');
      return missing.length > 0 ? `Для курьера не заполнено: ${missing.join(', ')}.` : null;
    }
    if (isPostSelected && (!addrCity.trim() || !addrStreet.trim() || !addrHouse?.trim())) {
      return `Для доставки «${deliveryTitle}» укажите город, улицу и номер дома получателя.`;
    }
    return null;
  }

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
    <div className="space-y-5 pb-28 lg:pb-10 animate-in fade-in duration-300">
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
                      ? 'neu-inset-deep neu-inset-deep-animated text-accent ring-2 ring-accent/50 scale-105'
                      : isCompleted
                      ? 'neu-button text-success font-bold'
                      : 'neu-inset text-[#4E5C70]'
                  }`}
                >
                  {isCompleted ? <CheckCircle className="w-4 h-4" /> : st.num}
                </div>
                <span
                  className={`text-[11px] font-semibold ${
                    isCurrent ? 'text-accent font-bold' : 'text-[#4E5C70]'
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
                  src={productImage(item.product)}
                  alt={item.product?.title || ''}
                  className="w-full h-full object-cover rounded-xl"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-[#2D3A4E] truncate">{item.product.title}</p>
                <p className="text-xs text-[#4E5C70]">
                  Размер: {item.selectedSize} / Цвет: {item.selectedColor}
                  {isPreorderVariant(item.product, item.selectedColor, item.selectedSize, storefrontSettings?.isPreorderMode === true) && (
                    <span className="font-bold text-accent"> • Предзаказ</span>
                  )}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-bold text-[#2D3A4E]">
                  {(item.product.price * item.quantity).toLocaleString('ru-RU')} ₽
                </p>
                <p className="text-xs text-[#4E5C70]">x{item.quantity}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Promo code shortcut matching Image 5 */}
        <button
          type="button"
          onClick={onOpenPromoModal}
          className="w-full neu-button rounded-2xl p-3 flex items-center justify-between text-xs font-medium text-[#2D3A4E] hover:text-accent transition-all cursor-pointer group mt-2"
        >
          <div className="flex items-center gap-2.5">
            <div
              className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                appliedPromo
                  ? 'neu-inset text-success font-bold'
                  : 'neu-button text-accent-strong'
              }`}
            >
              <Tag className="w-3.5 h-3.5 stroke-[2.2]" />
            </div>
            <div className="text-left">
              <span className="font-bold text-[#2D3A4E] block">
                {appliedPromo ? `Промокод: ${appliedPromo.code}` : 'Промокод'}
              </span>
              <span className="text-[11px] text-[#4E5C70] font-medium block">
                {appliedPromo
                  ? `Скидка ${promoDiscountText(appliedPromo)} применена`
                  : hasActivePromos
                    ? 'Есть доступные промокоды'
                    : 'Введите код, если он у вас есть'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 text-accent font-extrabold text-xs">
            <span>{appliedPromo ? 'Изменить' : 'Выбрать'}</span>
            <ChevronRight className="w-4 h-4 text-[#4E5C70] group-hover:translate-x-0.5 transition-transform" />
          </div>
        </button>
      </div>

      {/* Computer (lg): the form on the left; the total and «Подтвердить» on the right, always in view */}
      <form id="checkout-form" noValidate onSubmit={handleSubmit} className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-12 lg:gap-6 lg:items-start">
        <div className="space-y-4 lg:col-span-7">
        {/* Contact Info matching Image 5 */}
        <div id="checkout-contacts" className="neu-flat rounded-3xl p-4 space-y-3 border border-white/60">
          <h3 className="text-xs font-bold text-[#2D3A4E] tracking-wider uppercase">
            Контактные данные
          </h3>

          <div className="space-y-2.5">
            {/* Фамилия, имя, отчество (owner's request 02.10): Почта и ТК выдают посылку по паспорту */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label htmlFor="checkout-last-name" className="block text-[11px] font-bold text-[#4E5C70] mb-1 ml-1">
                  Фамилия
                </label>
                <input
                  id="checkout-last-name"
                  type="text"
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(e) => {
                    setLastName(e.target.value);
                    if (fieldErrors.lastName) setFieldErrors((prev) => ({ ...prev, lastName: undefined }));
                  }}
                  aria-invalid={Boolean(fieldErrors.lastName)}
                  aria-describedby={fieldErrors.lastName ? 'checkout-last-name-error' : undefined}
                  className={`w-full neu-inset rounded-2xl py-3 px-3.5 text-xs font-medium text-[#2D3A4E] ${
                    fieldErrors.lastName ? 'outline-2 outline-danger' : ''
                  }`}
                />
                {fieldErrors.lastName && (
                  <p id="checkout-last-name-error" className="text-xs font-bold text-danger mt-1 ml-1">
                    {fieldErrors.lastName}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="checkout-first-name" className="block text-[11px] font-bold text-[#4E5C70] mb-1 ml-1">
                  Имя
                </label>
                <input
                  id="checkout-first-name"
                  type="text"
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => {
                    setFirstName(e.target.value);
                    if (fieldErrors.firstName) setFieldErrors((prev) => ({ ...prev, firstName: undefined }));
                  }}
                  aria-invalid={Boolean(fieldErrors.firstName)}
                  aria-describedby={fieldErrors.firstName ? 'checkout-first-name-error' : undefined}
                  className={`w-full neu-inset rounded-2xl py-3 px-3.5 text-xs font-medium text-[#2D3A4E] ${
                    fieldErrors.firstName ? 'outline-2 outline-danger' : ''
                  }`}
                />
                {fieldErrors.firstName && (
                  <p id="checkout-first-name-error" className="text-xs font-bold text-danger mt-1 ml-1">
                    {fieldErrors.firstName}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="checkout-middle-name" className="block text-[11px] font-bold text-[#4E5C70] mb-1 ml-1">
                  Отчество{fullNameRequired && !noMiddleName ? '' : ' (если есть)'}
                </label>
                <input
                  id="checkout-middle-name"
                  type="text"
                  autoComplete="additional-name"
                  value={noMiddleName ? '' : middleName}
                  disabled={noMiddleName}
                  onChange={(e) => {
                    setMiddleName(e.target.value);
                    if (fieldErrors.middleName) setFieldErrors((prev) => ({ ...prev, middleName: undefined }));
                  }}
                  aria-invalid={Boolean(fieldErrors.middleName)}
                  aria-describedby={fieldErrors.middleName ? 'checkout-middle-name-error' : undefined}
                  className={`w-full neu-inset rounded-2xl py-3 px-3.5 text-xs font-medium text-[#2D3A4E] ${
                    fieldErrors.middleName ? 'outline-2 outline-danger' : ''
                  }`}
                />
                {fieldErrors.middleName && (
                  <p id="checkout-middle-name-error" className="text-xs font-bold text-danger mt-1 ml-1">
                    {fieldErrors.middleName}
                  </p>
                )}
              </div>
            </div>
            {fullNameRequired && (
              <button
                type="button"
                role="checkbox"
                aria-checked={noMiddleName}
                onClick={() => {
                  setNoMiddleName((v) => !v);
                  setFieldErrors((prev) => ({ ...prev, middleName: undefined }));
                }}
                className="flex items-center gap-2.5 min-h-8 ml-1 cursor-pointer select-none text-left"
              >
                <span
                  className={`w-5 h-5 rounded-md flex items-center justify-center ${
                    noMiddleName ? 'neu-fill-accent text-white' : 'neu-inset text-transparent'
                  }`}
                  aria-hidden="true"
                >
                  <Check className="w-3 h-3 stroke-[3]" />
                </span>
                <span className="text-xs font-bold text-[#2D3A4E]">Нет отчества</span>
              </button>
            )}

            <div>
              <label htmlFor="checkout-phone" className="block text-[11px] font-bold text-[#4E5C70] mb-1 ml-1">
                Телефон
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-[#56647A] absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  id="checkout-phone"
                  type="tel"
                  required
                  autoComplete="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (fieldErrors.phone) setFieldErrors((prev) => ({ ...prev, phone: undefined }));
                  }}
                  aria-invalid={Boolean(fieldErrors.phone)}
                  aria-describedby={fieldErrors.phone ? 'checkout-phone-error' : undefined}
                  placeholder="+7 (999) 000-00-00"
                  className={`w-full neu-inset rounded-2xl py-3 pl-10 pr-3 text-xs font-medium text-[#2D3A4E] ${
                    fieldErrors.phone ? 'outline-2 outline-danger' : ''
                  }`}
                />
              </div>
              {fieldErrors.phone && (
                <p id="checkout-phone-error" className="text-xs font-bold text-danger mt-1 ml-1">
                  {fieldErrors.phone}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="checkout-email" className="block text-[11px] font-bold text-[#4E5C70] mb-1 ml-1">
                E-mail
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#56647A] absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  id="checkout-email"
                  type="email"
                  required
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
                  }}
                  aria-invalid={Boolean(fieldErrors.email)}
                  aria-describedby={fieldErrors.email ? 'checkout-email-error' : undefined}
                  placeholder="name@example.ru"
                  className={`w-full neu-inset rounded-2xl py-3 pl-10 pr-3 text-xs font-medium text-[#2D3A4E] ${
                    fieldErrors.email ? 'outline-2 outline-danger' : ''
                  }`}
                />
              </div>
              {fieldErrors.email && (
                <p id="checkout-email-error" className="text-xs font-bold text-danger mt-1 ml-1">
                  {fieldErrors.email}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Shipping Methods */}
        <div id="checkout-delivery" className="neu-flat rounded-3xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-[#2D3A4E] tracking-wider uppercase">
              Способ доставки
            </h3>
            {freeThreshold > 0 && rawSubtotal >= freeThreshold && !noDeliveryMethods && (
              <span className="neu-inset text-success text-[11px] font-extrabold px-2 py-0.5 rounded-full">
                Бесплатная доставка активна
              </span>
            )}
          </div>

          <div className="space-y-3" role="radiogroup" aria-label="Способ доставки">
            {noDeliveryMethods && (
              <p className="neu-inset rounded-2xl p-3 text-xs font-bold text-warning">
                Способы доставки пока не настроены. Оформить заказ можно будет, когда магазин их добавит —
                напишите нам в чат поддержки.
              </p>
            )}
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
                  <button
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setSelectedDelivery(method.id)}
                    className="w-full text-left flex items-center justify-between gap-3 cursor-pointer rounded-xl"
                  >
                    <span className="flex items-center gap-3 flex-1 min-w-0">
                      <span
                        className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all ${
                          isSelected
                            ? 'neu-pill-active'
                            : 'neu-button text-[#4E5C70]'
                        }`}
                      >
                        {isSelected && (
                          <span className="block w-2.5 h-2.5 rounded-full bg-accent animate-in zoom-in-50 duration-200" />
                        )}
                      </span>

                      <span
                        className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 transition-all ${
                          isSelected
                            ? 'neu-pill-active'
                            : 'neu-button text-[#2D3A4E]'
                        }`}
                      >
                        <DeliveryIcon className="w-4 h-4" />
                      </span>

                      <span className="block min-w-0 flex-1 pr-1">
                        <span className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`block text-xs leading-snug transition-colors line-clamp-2 ${
                              isSelected ? 'font-extrabold text-accent' : 'font-bold text-[#2D3A4E]'
                            }`}
                          >
                            {method.title}
                          </span>
                          {method.highlightBadge && (
                            <span className="neu-fill-accent text-white text-[11px] font-extrabold px-1.5 py-0.2 rounded-full uppercase">
                              {method.highlightBadge}
                            </span>
                          )}
                        </span>

                        <span className="block text-[11px] text-[#4E5C70] mt-0.5">
                          {isPickupMethod && selectedPickupPoint
                            ? `${selectedPickupPoint.name} (${selectedPickupPoint.city})`
                            : method.duration}
                        </span>
                      </span>
                    </span>

                    <span
                      className={`text-xs font-bold shrink-0 whitespace-nowrap pl-1 ${
                        method.price === 0
                          ? 'text-success font-extrabold'
                          : isSelected
                          ? 'text-accent'
                          : 'text-[#2D3A4E]'
                      }`}
                    >
                      {method.price === 0 ? 'Бесплатно' : `${method.price} ₽`}
                    </span>
                  </button>

                  {/* Expanded Pickup Point Selection (when Pickup method is selected) */}
                  {isSelected && isPickupMethod && (
                    <div className="mt-3 pt-3 border-t border-[#BAC5D5]/50 space-y-2.5 animate-in fade-in duration-200">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-extrabold text-[#2D3A4E] uppercase tracking-wider flex items-center gap-1.5">
                          <Store className="w-3.5 h-3.5 text-accent" />
                          <span>Выберите пункт выдачи</span>
                        </span>
                        <span className="text-[11px] font-bold text-accent neu-inset px-2 py-0.5 rounded-lg">
                          {activePickupPoints.length} {pluralRu(activePickupPoints.length, ['адрес', 'адреса', 'адресов'])}
                        </span>
                      </div>

                      <div className="space-y-2" role="radiogroup" aria-label="Пункт выдачи">
                        {activePickupPoints.length === 0 && (
                          <p className="text-xs font-bold text-warning">
                            Пункты выдачи пока не добавлены. Выберите другой способ доставки.
                          </p>
                        )}
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
                                  : 'neu-button'
                              }`}
                            >
                              {/* Point Header */}
                              <button
                                type="button"
                                role="radio"
                                aria-checked={isPointSelected}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedPickupPointId(point.id);
                                }}
                                className="w-full text-left flex items-start justify-between gap-2 cursor-pointer rounded-xl"
                              >
                                <span className="flex items-center gap-2 min-w-0">
                                  <span
                                    className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all ${
                                      isPointSelected
                                        ? 'neu-pill-active'
                                        : 'neu-button text-[#4E5C70]'
                                    }`}
                                  >
                                    {isPointSelected && (
                                      <span className="block w-2.5 h-2.5 rounded-full bg-accent animate-in zoom-in-50 duration-200" />
                                    )}
                                  </span>
                                  <span className="block min-w-0">
                                    <span className="text-xs font-extrabold text-[#2D3A4E] block leading-snug line-clamp-2">
                                      {point.name}
                                    </span>
                                    <span className="text-[11px] font-bold text-accent">
                                      г. {point.city}
                                    </span>
                                  </span>
                                </span>

                                {point.isDefault && (
                                  <span className="text-[11px] font-extrabold text-accent neu-inset px-1.5 py-0.5 rounded-md uppercase shrink-0">
                                    Основной
                                  </span>
                                )}
                              </button>

                              {/* Full Unclipped Address with Neumorphic Copy Button */}
                              <div className="neu-flat-sm rounded-xl p-3 space-y-2 border border-white/60">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="space-y-1 min-w-0 flex-1">
                                    <div className="flex items-start gap-1.5">
                                      <MapPin className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
                                      <p className="text-xs font-bold text-[#2D3A4E] leading-relaxed break-words select-all">
                                        {point.address}
                                      </p>
                                    </div>
                                    {point.metro && (
                                      <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-accent neu-inset px-2 py-0.5 rounded-md mt-0.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-accent" />
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
                                        ? 'neu-inset text-success ring-1.5 ring-success/50 scale-95'
                                        : 'neu-button text-accent hover:text-accent-strong'
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
                                        <Copy className="w-3 h-3 text-accent" />
                                        <span>Скопировать</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                              </div>

                              {/* Schedule & Phone */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-[#4E5C70]">
                                <div className="flex items-center gap-1.5">
                                  <Clock className="w-3 h-3 text-accent shrink-0" />
                                  <span className="truncate">{point.schedule}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <Phone className="w-3 h-3 text-accent shrink-0" />
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

        {/* Shipping Address / Pickup Point Section: after the method, it depends on it */}
        <div id="checkout-address" className="neu-flat rounded-3xl p-4 space-y-3 scroll-mt-24">
          {isPickupSelected ? (
            /* Neumorphic Pickup Point Address Card */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl neu-inset flex items-center justify-center text-accent shrink-0">
                    <Store className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-extrabold text-[#2D3A4E] tracking-wider uppercase">
                      Пункт выдачи заказа
                    </h3>
                    <p className="text-xs text-[#4E5C70] font-medium">
                      {deliveryTitle}
                    </p>
                  </div>
                </div>
                <span
                  className={`text-[11px] font-extrabold neu-inset px-2.5 py-1 rounded-full uppercase tracking-wider shrink-0 ${
                    deliveryFee === 0 ? 'text-success' : 'text-[#2D3A4E]'
                  }`}
                >
                  {deliveryFee === 0 ? 'Бесплатно' : `${deliveryFee.toLocaleString('ru-RU')} ₽`}
                </span>
              </div>

              {/* Main Neumorphic Address Box with Integrated Copy Action */}
              <div className="neu-flat rounded-2xl p-3.5 space-y-3 border border-white/70">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-extrabold text-[#2D3A4E]">
                        {selectedPickupPoint?.name || 'Пункт выдачи'}
                      </span>
                      {selectedPickupPoint?.city && (
                        <span className="text-[11px] font-bold text-accent neu-inset px-2 py-0.5 rounded-md">
                          г. {selectedPickupPoint.city}
                        </span>
                      )}
                    </div>

                    <div className="pt-1 text-xs font-bold text-[#2D3A4E] flex items-start gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
                      <span className="leading-relaxed select-all">
                        {selectedPickupPoint?.address}
                      </span>
                    </div>

                    {selectedPickupPoint?.metro && (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg neu-inset text-[11px] font-bold text-accent mt-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                        <span>м. {selectedPickupPoint.metro}</span>
                      </div>
                    )}
                  </div>

                  {/* Neumorphic Copy Button */}
                  <button
                    type="button"
                    onClick={() =>
                      handleCopyAddress(
                        `${selectedPickupPoint?.city ? `г. ${selectedPickupPoint.city}, ` : ''}${selectedPickupPoint?.address || ''}${
                          selectedPickupPoint?.metro ? ` (м. ${selectedPickupPoint.metro})` : ''
                        }`,
                        'top-pickup'
                      )
                    }
                    className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      copiedAddressId === 'top-pickup'
                        ? 'neu-inset text-success ring-1.5 ring-success/50 scale-95'
                        : 'neu-button text-accent hover:text-accent-strong'
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
                        <Copy className="w-3.5 h-3.5 text-accent" />
                        <span className="text-[11px]">Скопировать</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Schedule & Phone in Neumorphic Sub-bar */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2.5 border-t border-[#BAC5D5]/40 text-[11px] text-[#4E5C70]">
                  {selectedPickupPoint?.schedule && (
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-accent shrink-0" />
                      <span className="truncate">{selectedPickupPoint.schedule}</span>
                    </div>
                  )}
                  {selectedPickupPoint?.phone && (
                    <div className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-accent shrink-0" />
                      <span className="font-bold text-[#2D3A4E]">{selectedPickupPoint.phone}</span>
                    </div>
                  )}
                </div>

                {selectedPickupPoint?.note && (
                  <div className="flex items-start gap-1.5 text-[11px] text-[#4E5C70] neu-inset p-2 rounded-xl">
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
                  {isPostSelected ? `Адрес доставки (${deliveryTitle})` : 'Адрес курьерской доставки'}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsAddressModalOpen(true)}
                  className="text-xs font-bold text-accent hover:underline flex items-center gap-1 cursor-pointer"
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
                            : 'neu-button text-[#2D3A4E] hover:text-accent'
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
                className={`neu-inset rounded-2xl p-3.5 space-y-2 transition-all ${
                  validationError ? 'outline-2 outline-danger' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#2D3A4E] flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-accent" />
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
                  <div role="alert" className="p-2.5 rounded-xl bg-danger-soft border border-danger/35 text-danger space-y-1.5 animate-in fade-in duration-200">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
                      <div className="text-xs">
                        <p className="font-bold text-danger">
                          {isPostSelected
                            ? 'Адрес доставки не заполнен'
                            : 'Данные для курьера не заполнены'}
                        </p>
                        <p className="text-xs text-danger leading-snug">{validationError}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsAddressModalOpen(true)}
                      className="w-full py-2 px-3 rounded-lg neu-button text-danger font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
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
                      <span className="neu-flat-sm px-2 py-0.5 rounded-lg text-[11px] font-bold text-[#2D3A4E] border border-white/60">
                        д. {addrHouse}
                      </span>
                    ) : (
                      <span className="neu-flat-sm px-2 py-0.5 rounded-lg text-[11px] font-bold text-danger border border-danger/35">
                        нет дома *
                      </span>
                    )}
                    {addrApartment && (
                      <span className="neu-flat-sm px-2 py-0.5 rounded-lg text-[11px] font-bold text-[#2D3A4E] border border-white/60">
                        {addrApartment.toLowerCase().includes('кв') ||
                        addrApartment.toLowerCase().includes('оф')
                          ? addrApartment
                          : `кв. ${addrApartment}`}
                      </span>
                    )}
                    <span className="neu-flat-sm px-2 py-0.5 rounded-lg text-[11px] font-bold text-accent border border-accent/20">
                      {deliveryTitle}
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {addrHouse ? (
                      <span className="neu-flat-sm px-2 py-0.5 rounded-lg text-[11px] font-bold text-[#2D3A4E] border border-white/60">
                        д. {addrHouse}
                      </span>
                    ) : (
                      <span className="neu-flat-sm px-2 py-0.5 rounded-lg text-[11px] font-bold text-danger border border-danger/35">
                        нет дома *
                      </span>
                    )}
                    {addrEntrance ? (
                      <span className="neu-flat-sm px-2 py-0.5 rounded-lg text-[11px] font-bold text-[#2D3A4E] border border-white/60">
                        подъезд {addrEntrance}
                      </span>
                    ) : (
                      <span className="neu-flat-sm px-2 py-0.5 rounded-lg text-[11px] font-bold text-danger border border-danger/35">
                        нет подъезда *
                      </span>
                    )}
                    {addrFloor && (
                      <span className="neu-flat-sm px-2 py-0.5 rounded-lg text-[11px] font-bold text-[#2D3A4E] border border-white/60">
                        эт. {addrFloor}
                      </span>
                    )}
                    {addrApartment && (
                      <span className="neu-flat-sm px-2 py-0.5 rounded-lg text-[11px] font-bold text-[#2D3A4E] border border-white/60">
                        {addrApartment.toLowerCase().includes('кв') ||
                        addrApartment.toLowerCase().includes('оф')
                          ? addrApartment
                          : `кв. ${addrApartment}`}
                      </span>
                    )}
                    {addrIntercom ? (
                      <span className="neu-flat-sm px-2 py-0.5 rounded-lg text-[11px] font-bold text-accent border border-accent/20">
                        домофон: {addrIntercom}
                      </span>
                    ) : (
                      <span className="neu-flat-sm px-2 py-0.5 rounded-lg text-[11px] font-bold text-danger border border-danger/35">
                        нет домофона *
                      </span>
                    )}
                  </div>
                )}

                <div className="pt-1 border-t border-[#BAC5D5]/40 text-[11px] text-[#4E5C70]">
                  <span className="font-bold text-[#2D3A4E]">
                    {isPostSelected ? `${deliveryTitle}: ` : 'Курьеру: '}
                  </span>
                  <span className="text-[#2D3A4E]">{formattedAddress}</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Payment Methods */}
        <div id="checkout-payment" className="neu-flat rounded-3xl p-4 space-y-3">
          <h3 className="text-xs font-bold text-[#2D3A4E] tracking-wider uppercase">
            Способ оплаты
          </h3>
          {noPaymentMethods ? (
            <NotConfigured
              title="Способы оплаты"
              hint="Оформить заказ можно будет, когда магазин их добавит. Напишите нам в чат поддержки."
            />
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-1.5 neu-flat-sm rounded-2xl" role="radiogroup" aria-label="Способ оплаты">
                {activePaymentMethods.map((item) => {
                  const isSelected = selectedPayment?.id === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setPaymentMethod(item.id)}
                      role="radio"
                      aria-checked={isSelected}
                      className={`py-3 px-3 rounded-xl text-left flex items-center gap-2 text-xs transition-all duration-200 cursor-pointer ${
                        isSelected ? 'neu-pill-active font-bold' : 'text-[#4E5C70] hover:text-[#2D3A4E] font-medium'
                      }`}
                    >
                      {item.onDelivery ? <User className="w-4 h-4 shrink-0" /> : <CreditCard className="w-4 h-4 shrink-0" />}
                      <span className="leading-tight">{item.title}</span>
                    </button>
                  );
                })}
              </div>
              {selectedPayment?.description?.trim() && (
                <p className="neu-inset rounded-2xl p-3 text-xs text-[#2D3A4E] leading-relaxed whitespace-pre-line">
                  {selectedPayment.description}
                </p>
              )}
            </>
          )}
        </div>

        </div>

        <div className="space-y-4 lg:col-span-5 lg:sticky lg:top-24">
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
            <span className={deliveryFee === 0 ? 'font-extrabold text-success' : 'font-bold'}>
              {deliveryFee === 0 ? 'Бесплатно' : `${deliveryFee} ₽`}
            </span>
          </div>

          <div className="pt-2 border-t border-[#BAC5D5]/50 flex items-center justify-between text-sm">
            <span className="font-extrabold text-[#2D3A4E]">Итого к оплате:</span>
            <span className="text-base font-extrabold text-accent">
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
              className="px-3 py-1.5 rounded-xl neu-button text-danger font-bold text-xs shrink-0 cursor-pointer"
            >
              Заполнить
            </button>
          </div>
        )}

        {/* Final Blue Action Button - Confirm Order with neu-inset-deep animation */}
        <button
          id="checkout-confirm"
          ref={confirmRef}
          type="submit"
          disabled={isSubmitting || orderBlocked}
          className={`w-full py-4 rounded-2xl btn-confirm-order font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition-all ${
            isSubmitting
              ? 'neu-inset-deep neu-inset-deep-animated text-accent ring-2 ring-accent/40'
              : orderBlocked
              ? 'neu-button-disabled'
              : 'neu-button-accent text-white active:scale-[0.98]'
          }`}
        >
          {isSubmitting ? (
            <>
              <span className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              <span>Оформление заказа...</span>
            </>
          ) : (
            <>
              <span>Подтвердить заказ • {totalPrice.toLocaleString('ru-RU')} ₽</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
        <LegalConsentNote settings={storefrontSettings} action="Подтвердить заказ" className="text-center px-2" />
        </div>

        {/* Phone: the total and «Подтвердить» stay at the bottom of the screen (the bottom menu is hidden here) until
            the form's own button scrolls into view */}
        {!confirmInView && !orderBlocked && (
          <div className="lg:hidden fixed inset-x-0 bottom-0 z-30 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pointer-events-none">
            <div className="max-w-md md:max-w-lg mx-auto neu-flat rounded-2xl p-2.5 flex items-center gap-3 pointer-events-auto">
              <div className="min-w-0 pl-1.5">
                <p className="text-xs text-[#4E5C70] leading-none">Итого</p>
                <p className="text-base font-extrabold text-[#2D3A4E] leading-tight">{totalPrice.toLocaleString('ru-RU')} ₽</p>
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 py-3 rounded-xl neu-button-accent text-white font-bold text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {isSubmitting ? 'Оформление…' : 'Подтвердить'}
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </form>

      {/* Address Edit Modal matching attached image */}
      <AddressEditModal
        isOpen={isAddressModalOpen}
        onClose={() => setIsAddressModalOpen(false)}
        requireCourierDetails={isCourierSelected}
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
          region: addrRegion,
          comment: addrComment,
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
          setAddrRegion(updated.region || '');
          setAddrComment(updated.comment || '');
          setValidationError(null);
        }}
      />
    </div>
  );
};
