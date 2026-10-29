import React, { useState, useEffect } from 'react';
import { X, Phone, User, MapPin, MessageCircle, ShoppingBag, AlertCircle, Sparkles } from 'lucide-react';
import { m, AnimatePresence } from 'motion/react';
import { CartItem, Product, SavedAddress, UserProfile } from '../types';
import { STORE_PAUSED_TEXT } from '../shared/orderApi';
import { productImage } from '../utils/productImage';
import { useProductThumbs } from '../utils/productThumbs';
import { LegalConsentNote } from './LegalConsentNote';
import { useDialogA11y } from '../utils/useDialogA11y';
import { digitsAfterCountryCode, formatQuickOrderPhone, isQuickOrderPhoneComplete, PHONE_DIGITS_AFTER_CODE } from '../utils/phoneNumber';
import { pluralRu } from '../utils/pluralize';
import { linePrice } from '../shared/orderLine';
import { packLineInfo } from '../utils/cartPackLine';
import { cleanHouseNumber, cleanCityName, parseSmartAddress } from '../utils/addressFormat';

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
  /** Customer profile to pre-fill contact & saved addresses when available */
  userProfile?: UserProfile;
  /** A promo is applied in the cart: it does not work for a 1-click order */
  promoNotApplied?: boolean;
  /** «Технические работы» in «Витрина»: the site takes no orders — said here, the button is off */
  ordersPaused?: boolean;
  /** Places the order; `false` — not placed (the screen said why): the window stays open with what was typed */
  onSuccess: (details: { name: string; phone: string; address: string }) => boolean | void | Promise<boolean | void>;
}

const DEFAULT_GUEST_NAME = 'Гость';
const DEFAULT_GUEST_PHONE = '+7 (999) 000-00-00';

export const QuickOrderModal: React.FC<QuickOrderModalProps> = ({
  isOpen,
  onClose,
  cartItems = [],
  singleProduct,
  totalPrice,
  userProfile,
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
  const [selectedSavedId, setSelectedSavedId] = useState<string | null>(null);

  const applySavedAddress = (addr: SavedAddress) => {
    const cityPart = cleanCityName(addr.city);
    const streetPart = (addr.street || '').trim();
    setAddress([cityPart ? `г. ${cityPart}` : '', streetPart].filter(Boolean).join(', '));
    setHouse(cleanHouseNumber(addr.house));
    setEntrance(addr.entrance || '');
    setApartment(addr.apartment || '');
    setIntercom(addr.intercom || '');
    setSelectedSavedId(addr.id);
  };

  // Pre-fill from userProfile when opening if fields are still untouched
  useEffect(() => {
    if (!isOpen || !userProfile) return;
    const realName =
      userProfile.name && userProfile.name.trim() !== DEFAULT_GUEST_NAME ? userProfile.name.trim() : '';
    const realPhone =
      userProfile.phone && userProfile.phone.trim() !== DEFAULT_GUEST_PHONE ? userProfile.phone.trim() : '';
    if (!name.trim() && realName) {
      setName(realName);
    }
    if ((phone.trim() === '+7' || !phone.trim()) && realPhone) {
      setPhone(formatQuickOrderPhone(realPhone));
    }
    if (!address.trim() && !house.trim()) {
      const defAddr =
        userProfile.savedAddresses?.find((a) => a.isDefault) || userProfile.savedAddresses?.[0];
      if (defAddr && (defAddr.city || defAddr.street)) {
        applySavedAddress(defAddr);
      } else if (userProfile.address && (userProfile.address.city || userProfile.address.street)) {
        const cityPart = cleanCityName(userProfile.address.city);
        const streetPart = (userProfile.address.street || '').trim();
        setAddress([cityPart ? `г. ${cityPart}` : '', streetPart].filter(Boolean).join(', '));
        setHouse(cleanHouseNumber(userProfile.address.house));
        setEntrance(userProfile.address.entrance || '');
        setApartment(userProfile.address.apartment || '');
        setIntercom(userProfile.address.intercom || '');
      }
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSmartParseAddress = (rawText?: string) => {
    const source = rawText ?? address;
    const parsed = parseSmartAddress(source);
    if (parsed.city || parsed.street) {
      const cityClean = cleanCityName(parsed.city);
      setAddress([cityClean ? `г. ${cityClean}` : '', parsed.street || ''].filter(Boolean).join(', '));
    }
    if (parsed.house) setHouse(parsed.house);
    if (parsed.entrance) setEntrance(parsed.entrance);
    if (parsed.apartment) setApartment(parsed.apartment);
    if (parsed.intercom) setIntercom(parsed.intercom);
  };

  // the typed text stays as typed (a fix in the middle keeps the caret); the number is written as «+7 XXX XXX-XX-XX» when
  // the field is left and is sent that way (audit 29.10, finding 18)
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    if (!val.startsWith('+7')) {
      val = '+7 ' + val.replace(/^\+?7?/, '');
    }
    setPhone(val);
  };
  const formattedPhone = formatQuickOrderPhone(phone);

  // The manager reaches the buyer only by this number: 10 digits after «+7», not the length of the text with its spaces
  // (audit 07.10, finding 17); a leading 8 or 7 of 11 digits is the country code
  const phoneComplete = isQuickOrderPhoneComplete(formattedPhone);
  const phoneDigits = digitsAfterCountryCode(formattedPhone);
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
    const hClean = cleanHouseNumber(house);
    if (hClean) extra.push(`д. ${hClean}`);
    if (entrance.trim()) extra.push(entrance.trim().toLowerCase().includes('под') ? entrance.trim() : `подъезд ${entrance.trim()}`);
    if (apartment.trim()) extra.push(/^(?:квартира|кв\.?|офис|оф\.?)\s*/i.test(apartment.trim()) ? apartment.trim() : `кв. ${apartment.trim()}`);
    if (intercom.trim()) extra.push(intercom.trim().toLowerCase().includes('домофон') ? intercom.trim() : `домофон: ${intercom.trim()}`);
    const finalAddr = [address.trim(), ...extra].filter(Boolean).join(', ');

    // The window closes once the order is written; not placed — it stays with what was typed
    setIsSubmitting(true);
    let placed: boolean | void = false;
    try {
      placed = await onSuccess({ name: name.trim(), phone: formattedPhone.trim(), address: finalAddr || 'Уточнит менеджер' });
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
          composition: '',
          qtyText: `${singleProduct.quantity} шт.`,
          price: linePrice(singleProduct) * singleProduct.quantity,
        },
      ]
    : cartItems.map((item) => {
        // a size pack from the cart (stage 20): its name and composition, packs and items
        const pack = packLineInfo(item);
        return {
          title: item.product?.title || '',
          image: photoOf(item.product) || productImage(item.product),
          variant: pack ? `${item.selectedColor} • ${pack.title}` : `${item.selectedColor} • ${item.selectedSize}`,
          composition: pack?.composition ?? '',
          qtyText: pack ? `${pack.packs} уп. = ${pack.pieces} шт.` : `${item.quantity} шт.`,
          price: linePrice(item) * item.quantity,
        };
      });

  return (
    <AnimatePresence>
      {isOpen && (
        <m.div
          key="quick-order-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
        >
          <div
            onClick={onClose}
            className="fixed inset-0 bg-text-primary/50 backdrop-blur-xs cursor-pointer"
          />
          <m.div
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
            <div className="flex items-center justify-between gap-2 pb-2 neu-divider-b">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-xl neu-inset flex items-center justify-center text-accent shrink-0">
                  <ShoppingBag className="w-4 h-4 text-accent shrink-0" />
                </div>
                <div className="min-w-0">
                  <h3 id={dialog.titleId} className="text-sm font-extrabold text-text-primary">Заказ в 1 клик</h3>
                  <p className="text-xs text-text-secondary">Менеджер перезвонит для подтверждения</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full neu-button flex items-center justify-center text-text-secondary hover:text-text-primary cursor-pointer shrink-0"
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
                    <p className="font-bold text-text-primary truncate">{item.title}</p>
                    <p className="text-xs text-text-secondary">{item.variant}</p>
                    {item.composition && <p className="text-xs text-text-secondary">{item.composition}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-extrabold text-accent">{item.price.toLocaleString('ru-RU')} ₽</p>
                    <p className="text-xs text-text-secondary">{item.qtyText}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Price Preview */}
            <div className="neu-flat rounded-2xl p-3 flex items-center justify-between">
              <span className="text-xs font-bold text-text-secondary">Итого к оплате:</span>
              <span className="text-base font-extrabold text-text-primary">
                {totalPrice.toLocaleString('ru-RU')} ₽
              </span>
            </div>
            {promoNotApplied && (
              <p className="text-xs font-semibold text-text-secondary px-1">
                Промокод действует только при полном оформлении заказа
              </p>
            )}

            {/* Fast Form */}
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1">
                <label htmlFor="quick-order-name" className="text-[11px] font-bold text-text-primary flex items-center gap-1.5">
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
                  className="w-full py-2 px-3 neu-inset rounded-xl text-xs text-text-primary placeholder:text-text-muted"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="quick-order-phone" className="text-[11px] font-bold text-text-primary flex items-center gap-1.5">
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
                  onBlur={() => setPhone(formattedPhone)}
                  className="w-full py-2 px-3 neu-inset rounded-xl text-xs text-text-primary placeholder:text-text-muted"
                />
                <p id="quick-order-phone-hint" className="text-xs text-text-secondary">
                  {phoneHint}
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="quick-order-address" className="text-[11px] font-bold text-text-primary flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
                    <span>Адрес доставки — по желанию</span>
                  </label>
                  {address.includes(',') && !house.trim() && (
                    <button
                      type="button"
                      onClick={() => handleSmartParseAddress()}
                      className="text-[11px] font-bold text-accent hover:text-accent-strong inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>Разобрать по полям</span>
                    </button>
                  )}
                </div>

                {userProfile?.savedAddresses && userProfile.savedAddresses.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pb-0.5">
                    {userProfile.savedAddresses.map((sa) => {
                      const active = selectedSavedId === sa.id;
                      return (
                        <button
                          key={sa.id}
                          type="button"
                          onClick={() => applySavedAddress(sa)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                            active ? 'neu-pill-active text-accent font-extrabold' : 'neu-button text-text-secondary hover:text-text-primary'
                          }`}
                        >
                          {sa.title || sa.city || 'Адрес'}
                        </button>
                      );
                    })}
                  </div>
                )}

                <input
                  id="quick-order-address"
                  type="text"
                  autoComplete="street-address"
                  placeholder="Город, улица (или вставьте полный адрес)"
                  aria-describedby="quick-order-address-hint"
                  value={address}
                  onChange={(e) => {
                    setAddress(e.target.value);
                    setSelectedSavedId(null);
                  }}
                  onPaste={(e) => {
                    const pasted = e.clipboardData.getData('text');
                    if (pasted && pasted.includes(',') && /\d/.test(pasted)) {
                      e.preventDefault();
                      handleSmartParseAddress(pasted);
                    }
                  }}
                  className="w-full py-2 px-3 neu-inset rounded-xl text-xs text-text-primary placeholder:text-text-muted"
                />
                <p id="quick-order-address-hint" className="text-xs text-text-secondary">
                  Можно не заполнять: менеджер уточнит адрес, когда позвонит.
                </p>
              </div>

              {/* Дополнительные поля: Номер дома, Подъезд, Квартира/Офис, Домофон */}
              <div className="grid grid-cols-4 gap-2 text-[11px]">
                <div>
                  <label htmlFor="quick-order-house" className="text-[11px] font-bold text-text-primary block mb-0.5 truncate">
                    Дом
                  </label>
                  <input
                    id="quick-order-house"
                    type="text"
                    placeholder="10"
                    value={house}
                    onChange={(e) => setHouse(e.target.value)}
                    className="w-full py-1.5 px-2 neu-inset rounded-lg text-xs text-text-primary placeholder:text-text-muted"
                  />
                </div>
                <div>
                  <label htmlFor="quick-order-entrance" className="text-[11px] font-bold text-text-primary block mb-0.5 truncate">
                    Подъезд
                  </label>
                  <input
                    id="quick-order-entrance"
                    type="text"
                    placeholder="2"
                    value={entrance}
                    onChange={(e) => setEntrance(e.target.value)}
                    className="w-full py-1.5 px-2 neu-inset rounded-lg text-xs text-text-primary placeholder:text-text-muted"
                  />
                </div>
                <div>
                  <label htmlFor="quick-order-apartment" className="text-[11px] font-bold text-text-primary block mb-0.5 truncate">
                    Кв./Офис
                  </label>
                  <input
                    id="quick-order-apartment"
                    type="text"
                    placeholder="25"
                    value={apartment}
                    onChange={(e) => setApartment(e.target.value)}
                    className="w-full py-1.5 px-2 neu-inset rounded-lg text-xs text-text-primary placeholder:text-text-muted"
                  />
                </div>
                <div>
                  <label htmlFor="quick-order-intercom" className="text-[11px] font-bold text-text-primary block mb-0.5 truncate">
                    Домофон
                  </label>
                  <input
                    id="quick-order-intercom"
                    type="text"
                    placeholder="25K"
                    value={intercom}
                    onChange={(e) => setIntercom(e.target.value)}
                    className="w-full py-1.5 px-2 neu-inset rounded-lg text-xs text-text-primary placeholder:text-text-muted"
                  />
                </div>
              </div>

              {/* The order goes out with «Уточнит менеджер» for delivery and payment: no made-up fitting or free returns
                  (audit 02.10, finding 44) */}
              {ordersPaused ? (
                <div role="status" className="p-2.5 rounded-xl neu-tone-warning flex items-start gap-2 text-xs text-text-primary font-semibold">
                  <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-px" aria-hidden="true" />
                  <span>{STORE_PAUSED_TEXT}. Напишите в чат поддержки — менеджер оформит заказ сам.</span>
                </div>
              ) : (
                <div className="p-2 rounded-xl neu-flat flex items-center gap-2 text-xs text-text-secondary font-semibold">
                  <MessageCircle className="w-4 h-4 text-accent shrink-0" aria-hidden="true" />
                  <span>Доставку и оплату менеджер согласует с вами после заказа.</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="py-2.5 px-4 neu-button rounded-xl text-xs font-bold text-text-secondary hover:text-text-primary cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={ordersPaused || isSubmitting || !name.trim() || !phoneComplete}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-extrabold cursor-pointer transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 btn-confirm-order ${
                    isSubmitting
                      ? 'neu-pill-active neu-inset-deep-animated text-accent'
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
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
};
