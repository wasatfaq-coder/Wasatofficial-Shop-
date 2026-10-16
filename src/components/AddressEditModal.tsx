import React, { useState, useEffect } from 'react';
import { X, Check, MapPin, AlertCircle, Sparkles } from 'lucide-react';
import { m, AnimatePresence } from 'motion/react';
import { SavedAddress } from '../types';
import {
  formatAddress,
  parseSmartAddress,
  toggleCourierCommentChip,
  POPULAR_RU_CITIES,
  ADDRESS_TITLE_PRESETS,
  COURIER_COMMENT_SUGGESTIONS,
} from '../utils/addressFormat';
import { useDialogA11y } from '../utils/useDialogA11y';

interface AddressEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingAddress?: SavedAddress | null;
  onSave: (address: {
    id?: string;
    title: string;
    city: string;
    street: string;
    house?: string;
    entrance?: string;
    floor?: string;
    apartment?: string;
    intercom?: string;
    postalCode?: string;
    region?: string;
    comment?: string;
    isDefault?: boolean;
  }) => void;
  /** Курьеру нужны подъезд и код домофона; для Почты и адресов профиля они необязательны */
  requireCourierDetails?: boolean;
}

export const AddressEditModal: React.FC<AddressEditModalProps> = ({
  isOpen,
  onClose,
  editingAddress,
  onSave,
  requireCourierDetails = false,
}) => {
  const dialog = useDialogA11y(isOpen, onClose);
  const [title, setTitle] = useState('Дом');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [street, setStreet] = useState('');
  const [house, setHouse] = useState('');
  const [entrance, setEntrance] = useState('');
  const [floor, setFloor] = useState('');
  const [apartment, setApartment] = useState('');
  const [intercom, setIntercom] = useState('');
  const [region, setRegion] = useState('');
  const [comment, setComment] = useState('');
  const [isDefault, setIsDefault] = useState(true);
  const [errors, setErrors] = useState<{
    city?: string;
    street?: string;
    house?: string;
    entrance?: string;
    intercom?: string;
  }>({});

  useEffect(() => {
    if (editingAddress) {
      setTitle(editingAddress.title || 'Дом');
      setCity(editingAddress.city || '');
      setPostalCode(editingAddress.postalCode || '');
      setStreet(editingAddress.street || '');
      setHouse(editingAddress.house || '');
      setEntrance(editingAddress.entrance || '');
      setFloor(editingAddress.floor || '');
      setApartment(editingAddress.apartment || '');
      setIntercom(editingAddress.intercom || '');
      setRegion(editingAddress.region || '');
      setComment(editingAddress.comment || '');
      setIsDefault(editingAddress.isDefault ?? false);
    } else {
      setTitle('Дом');
      setCity('');
      setPostalCode('');
      setStreet('');
      setHouse('');
      setEntrance('');
      setFloor('');
      setApartment('');
      setIntercom('');
      setRegion('');
      setComment('');
      setIsDefault(true);
    }
    setErrors({});
    // Сбрасываем форму только при открытии: editingAddress — новый объект на каждом рендере родителя
  }, [isOpen, editingAddress?.id]);

  // Real-time formatted address preview for courier dispatch
  const previewString = formatAddress({
    region,
    city,
    postalCode,
    street,
    house,
    entrance,
    floor,
    apartment,
    intercom,
  });

  const isPrivateHouseOrNoIntercom =
    entrance.trim() === '1' && intercom.trim().toLowerCase() === 'нет';

  const handleTogglePrivateHouse = () => {
    if (isPrivateHouseOrNoIntercom) {
      setEntrance('');
      setIntercom('');
    } else {
      if (!entrance.trim()) setEntrance('1');
      setIntercom('нет');
      setErrors((prev) => ({ ...prev, entrance: undefined, intercom: undefined }));
    }
  };

  const applySmartParsed = (rawText: string) => {
    const parsed = parseSmartAddress(rawText);
    if (parsed.region && !region.trim()) setRegion(parsed.region);
    if (parsed.city && !city.trim()) {
      setCity(parsed.city);
      setErrors((prev) => ({ ...prev, city: undefined }));
    }
    if (parsed.postalCode && !postalCode.trim()) setPostalCode(parsed.postalCode);
    if (parsed.street) {
      setStreet(parsed.street);
      setErrors((prev) => ({ ...prev, street: undefined }));
    }
    if (parsed.house) {
      setHouse(parsed.house);
      setErrors((prev) => ({ ...prev, house: undefined }));
    }
    if (parsed.entrance && !entrance.trim()) {
      setEntrance(parsed.entrance);
      setErrors((prev) => ({ ...prev, entrance: undefined }));
    }
    if (parsed.floor && !floor.trim()) setFloor(parsed.floor);
    if (parsed.apartment && !apartment.trim()) setApartment(parsed.apartment);
    if (parsed.intercom && !intercom.trim()) {
      setIntercom(parsed.intercom);
      setErrors((prev) => ({ ...prev, intercom: undefined }));
    }
  };

  // Detect if street input looks like a combined address line (e.g. "Тверская 7, кв 12" or "Москва, ул. Ленина, д. 10")
  const canParseStreetLine = Boolean(
    street.trim() &&
      !house.trim() &&
      (/[,;]/.test(street) || /\s+(?:д\.?|дом|\d+)\s*$/i.test(street.trim()))
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Auto-extract house from street if the buyer typed "Тверская 7" into street and left house blank
    let finalCity = city.trim();
    let finalPostal = postalCode.trim();
    let finalStreet = street.trim();
    let finalHouse = house.trim();
    let finalEntrance = entrance.trim();
    let finalFloor = floor.trim();
    let finalApartment = apartment.trim();
    let finalIntercom = intercom.trim();
    let finalRegion = region.trim();

    if (finalStreet && !finalHouse) {
      const parsed = parseSmartAddress(finalStreet);
      if (parsed.house) {
        finalStreet = parsed.street || finalStreet;
        finalHouse = parsed.house;
        if (parsed.city && !finalCity) finalCity = parsed.city;
        if (parsed.postalCode && !finalPostal) finalPostal = parsed.postalCode;
        if (parsed.entrance && !finalEntrance) finalEntrance = parsed.entrance;
        if (parsed.floor && !finalFloor) finalFloor = parsed.floor;
        if (parsed.apartment && !finalApartment) finalApartment = parsed.apartment;
        if (parsed.intercom && !finalIntercom) finalIntercom = parsed.intercom;
        if (parsed.region && !finalRegion) finalRegion = parsed.region;
      }
    }

    const newErrors: {
      city?: string;
      street?: string;
      house?: string;
      entrance?: string;
      intercom?: string;
    } = {};
    if (!finalCity) {
      newErrors.city = 'Укажите город';
    }
    if (!finalStreet) {
      newErrors.street = 'Укажите улицу';
    }
    if (!finalHouse) {
      newErrors.house = 'Укажите номер дома';
    }
    if (requireCourierDetails && !finalEntrance) {
      newErrors.entrance = 'Укажите подъезд';
    }
    if (requireCourierDetails && !finalIntercom) {
      newErrors.intercom = 'Укажите код домофона';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    onSave({
      id: editingAddress?.id,
      title: title.trim() || 'Адрес',
      city: finalCity,
      postalCode: finalPostal,
      street: finalStreet,
      house: finalHouse,
      entrance: finalEntrance,
      floor: finalFloor,
      apartment: finalApartment,
      intercom: finalIntercom,
      region: finalRegion,
      comment: comment.trim(),
      isDefault,
    });
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <m.div
          key="address-edit-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
        >
          <div
            onClick={onClose}
            className="fixed inset-0 bg-text-primary/45 backdrop-blur-xs cursor-pointer"
          />
          <m.div
            ref={dialog.ref}
            {...dialog.props}
            key="address-modal"
            initial={{ scale: 0.93, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.93, opacity: 0, y: 12 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-lg neu-modal rounded-3xl p-5 sm:p-6 space-y-4 sm:space-y-5 text-text-primary z-10 max-h-[90vh] overflow-y-auto scrollbar-thin"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-2 neu-divider-b">
              <div className="flex items-center gap-2 min-w-0">
                <MapPin className="w-5 h-5 text-accent shrink-0" />
                <h3 id={dialog.titleId} className="text-base font-extrabold text-text-primary truncate">
                  {editingAddress ? 'Редактировать адрес' : 'Новый адрес доставки'}
                </h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full neu-button flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors cursor-pointer shrink-0"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4 shrink-0" />
              </button>
            </div>

            {/* Validation alert banner if required courier fields missing */}
            {Object.keys(errors).length > 0 && (
              <div className="p-3 rounded-2xl neu-tone-danger text-xs flex items-center gap-2 animate-in fade-in duration-200">
                <AlertCircle className="w-4 h-4 text-danger shrink-0" />
                <span className="font-semibold">
                  {requireCourierDetails
                    ? 'Заполните данные для курьера: город, улица, номер дома, подъезд и код домофона.'
                    : 'Укажите город, улицу и номер дома.'}
                </span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
              {/* Title / Label + Quick Presets */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <label htmlFor="address-title" className="block text-xs font-bold text-text-primary">
                    Название адреса
                  </label>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {ADDRESS_TITLE_PRESETS.map((preset) => {
                      const active = title.trim().toLowerCase() === preset.toLowerCase();
                      return (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setTitle(preset)}
                          className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                            active
                              ? 'neu-pill-active text-accent'
                              : 'neu-button text-text-secondary hover:text-text-primary'
                          }`}
                        >
                          {preset}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <input
                  id="address-title"
                  type="text"
                  required
                  enterKeyHint="next"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Дом, Работа, Студия"
                  className="w-full neu-inset rounded-2xl py-2.5 px-3.5 text-xs font-semibold text-text-primary placeholder:text-text-muted"
                />
              </div>

              {/* Country / region: Почта России and transport companies need it for other regions */}
              <div>
                <label htmlFor="address-region" className="block text-xs font-bold text-text-primary mb-1">
                  Страна / регион <span className="font-medium text-text-secondary">(для межгорода и ТК)</span>
                </label>
                <input
                  id="address-region"
                  type="text"
                  autoComplete="address-level1"
                  enterKeyHint="next"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  placeholder="Россия, Московская область"
                  className="w-full neu-inset rounded-2xl py-2.5 px-3.5 text-xs font-semibold text-text-primary placeholder:text-text-muted"
                />
              </div>

              {/* City & Postal Code (2 Columns) + Quick Popular Cities */}
              <div className="space-y-1.5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label htmlFor="address-city" className="block text-xs font-bold text-text-primary mb-1">
                      Город <span className="text-danger font-bold" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="address-city"
                      type="text"
                      autoComplete="address-level2"
                      enterKeyHint="next"
                      required
                      value={city}
                      onChange={(e) => {
                        setCity(e.target.value);
                        if (errors.city && e.target.value.trim()) {
                          setErrors((prev) => ({ ...prev, city: undefined }));
                        }
                      }}
                      placeholder="Москва"
                      className={`w-full rounded-2xl py-2.5 px-3.5 text-xs font-semibold text-text-primary placeholder:text-text-muted ${
                        errors.city ? 'neu-tone-danger' : 'neu-inset'
                      }`}
                    />
                  </div>
                  <div>
                    <label htmlFor="address-postal" className="block text-xs font-bold text-text-primary mb-1">
                      Индекс
                    </label>
                    <input
                      id="address-postal"
                      type="text"
                      autoComplete="postal-code"
                      inputMode="numeric"
                      enterKeyHint="next"
                      maxLength={6}
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="101000"
                      className="w-full neu-inset rounded-2xl py-2.5 px-3.5 text-xs font-semibold text-text-primary placeholder:text-text-muted tabular-nums"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                  {POPULAR_RU_CITIES.map((popularCity) => {
                    const isSelectedCity = city.trim().toLowerCase() === popularCity.toLowerCase();
                    return (
                      <button
                        key={popularCity}
                        type="button"
                        onClick={() => {
                          setCity(popularCity);
                          setErrors((prev) => ({ ...prev, city: undefined }));
                        }}
                        className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                          isSelectedCity
                            ? 'neu-pill-active text-accent'
                            : 'neu-button text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        {popularCity}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Street + Smart Single-Line Recognition */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="address-street" className="block text-xs font-bold text-text-primary">
                    Улица <span className="text-danger font-bold" aria-hidden="true">*</span>
                  </label>
                  {canParseStreetLine && (
                    <button
                      type="button"
                      onClick={() => applySmartParsed(street)}
                      className="px-2.5 py-1 rounded-xl neu-button text-[11px] font-bold text-accent inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Sparkles className="w-3 h-3 shrink-0" />
                      <span>Разнести по полям</span>
                    </button>
                  )}
                </div>
                <input
                  id="address-street"
                  type="text"
                  autoComplete="address-line1"
                  enterKeyHint="next"
                  required
                  value={street}
                  onChange={(e) => {
                    setStreet(e.target.value);
                    if (errors.street && e.target.value.trim()) {
                      setErrors((prev) => ({ ...prev, street: undefined }));
                    }
                  }}
                  onPaste={(e) => {
                    const pasted = e.clipboardData?.getData('text') || '';
                    if (pasted.includes(',') && !house.trim()) {
                      const parsed = parseSmartAddress(pasted);
                      if (parsed.street && (parsed.house || parsed.city)) {
                        e.preventDefault();
                        applySmartParsed(pasted);
                      }
                    }
                  }}
                  placeholder="ул. Тверская (или вставьте полный адрес строкой)"
                  className={`w-full rounded-2xl py-2.5 px-3.5 text-xs font-semibold text-text-primary placeholder:text-text-muted ${
                    errors.street ? 'neu-tone-danger' : 'neu-inset'
                  }`}
                />
              </div>

              {/* Precise building & delivery coordinates: Дом, Подъезд, Этаж */}
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label htmlFor="address-house" className="block text-[11px] font-bold text-text-primary mb-1">
                    Номер дома <span className="text-danger font-bold" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="address-house"
                    type="text"
                    enterKeyHint="next"
                    aria-required="true"
                    aria-invalid={Boolean(errors.house)}
                    value={house}
                    onChange={(e) => {
                      setHouse(e.target.value);
                      if (errors.house && e.target.value.trim()) {
                        setErrors((prev) => ({ ...prev, house: undefined }));
                      }
                    }}
                    placeholder="д. 10 / 12к1"
                    className={`w-full rounded-2xl py-2.5 px-3 text-xs font-semibold text-text-primary placeholder:text-text-muted transition-all ${
                      errors.house ? 'neu-tone-danger' : 'neu-inset'
                    }`}
                  />
                  {errors.house && (
                    <p className="text-xs text-danger font-medium mt-1 leading-tight">
                      {errors.house}
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="address-entrance" className="block text-[11px] font-bold text-text-primary mb-1">
                    Подъезд{' '}
                    {requireCourierDetails ? (
                      <span className="text-danger font-bold" aria-hidden="true">*</span>
                    ) : (
                      <span className="font-medium text-text-secondary">(необяз.)</span>
                    )}
                  </label>
                  <input
                    id="address-entrance"
                    type="text"
                    enterKeyHint="next"
                    aria-required={requireCourierDetails}
                    aria-invalid={Boolean(errors.entrance)}
                    value={entrance}
                    onChange={(e) => {
                      setEntrance(e.target.value);
                      if (errors.entrance && e.target.value.trim()) {
                        setErrors((prev) => ({ ...prev, entrance: undefined }));
                      }
                    }}
                    placeholder="2"
                    className={`w-full rounded-2xl py-2.5 px-3 text-xs font-semibold text-text-primary placeholder:text-text-muted transition-all ${
                      errors.entrance ? 'neu-tone-danger' : 'neu-inset'
                    }`}
                  />
                  {errors.entrance && (
                    <p className="text-xs text-danger font-medium mt-1 leading-tight">
                      {errors.entrance}
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="address-floor" className="block text-[11px] font-bold text-text-primary mb-1">
                    Этаж
                  </label>
                  <input
                    id="address-floor"
                    type="text"
                    inputMode="numeric"
                    enterKeyHint="next"
                    value={floor}
                    onChange={(e) => setFloor(e.target.value)}
                    placeholder="4"
                    className="w-full neu-inset rounded-2xl py-2.5 px-3 text-xs font-semibold text-text-primary placeholder:text-text-muted tabular-nums"
                  />
                </div>
              </div>

              {/* Apartment & Intercom (Код домофона) */}
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="address-apartment" className="block text-[11px] font-bold text-text-primary mb-1">
                      Квартира / Офис
                    </label>
                    <input
                      id="address-apartment"
                      type="text"
                      autoComplete="address-line2"
                      enterKeyHint="next"
                      value={apartment}
                      onChange={(e) => setApartment(e.target.value)}
                      placeholder="кв. 25 / офис 14"
                      className="w-full neu-inset rounded-2xl py-2.5 px-3 text-xs font-semibold text-text-primary placeholder:text-text-muted"
                    />
                  </div>
                  <div>
                    <label htmlFor="address-intercom" className="block text-[11px] font-bold text-text-primary mb-1">
                      Код домофона{' '}
                      {requireCourierDetails ? (
                        <span className="text-danger font-bold" aria-hidden="true">*</span>
                      ) : (
                        <span className="font-medium text-text-secondary">(необяз.)</span>
                      )}
                    </label>
                    <input
                      id="address-intercom"
                      type="text"
                      enterKeyHint="done"
                      aria-required={requireCourierDetails}
                      aria-invalid={Boolean(errors.intercom)}
                      value={intercom}
                      onChange={(e) => {
                        setIntercom(e.target.value);
                        if (errors.intercom && e.target.value.trim()) {
                          setErrors((prev) => ({ ...prev, intercom: undefined }));
                        }
                      }}
                      placeholder="25K / #1234"
                      className={`w-full rounded-2xl py-2.5 px-3 text-xs font-semibold text-text-primary placeholder:text-text-muted transition-all ${
                        errors.intercom ? 'neu-tone-danger' : 'neu-inset'
                      }`}
                    />
                    {errors.intercom && (
                      <p className="text-xs text-danger font-medium mt-1 leading-tight">
                        {errors.intercom}
                      </p>
                    )}
                  </div>
                </div>

                {/* Quick toggle for private house / no intercom */}
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={isPrivateHouseOrNoIntercom}
                  onClick={handleTogglePrivateHouse}
                  className="min-h-8 flex items-center gap-2.5 cursor-pointer select-none text-left"
                >
                  <span
                    className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-all ${
                      isPrivateHouseOrNoIntercom
                        ? 'neu-fill-accent text-white'
                        : 'neu-inset text-transparent'
                    }`}
                    aria-hidden="true"
                  >
                    <Check className="w-3 h-3 stroke-[3]" />
                  </span>
                  <span className="text-xs font-bold text-text-secondary hover:text-text-primary transition-colors">
                    Частный дом / без домофона (подъезд 1, домофон: нет)
                  </span>
                </button>
              </div>

              {/* Comment for the courier: kept apart from the address line + Quick Chips */}
              <div className="space-y-1.5">
                <label htmlFor="address-comment" className="block text-xs font-bold text-text-primary">
                  Комментарий курьеру
                </label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {COURIER_COMMENT_SUGGESTIONS.map((chip) => {
                    const active = comment.toLowerCase().includes(chip.toLowerCase());
                    return (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => setComment((prev) => toggleCourierCommentChip(prev, chip))}
                        className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                          active
                            ? 'neu-pill-active text-accent'
                            : 'neu-button text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        + {chip}
                      </button>
                    );
                  })}
                </div>
                <textarea
                  id="address-comment"
                  rows={2}
                  maxLength={300}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Например: позвонить за час, шлагбаум со двора"
                  className="w-full neu-inset rounded-2xl py-2.5 px-3.5 text-xs font-semibold text-text-primary placeholder:text-text-muted resize-y"
                />
              </div>

              {/* Live Preview Box for Delivery */}
              <div className="neu-inset rounded-2xl p-3 space-y-1">
                <span className="text-[11px] font-bold text-text-secondary uppercase tracking-wider block">
                  {requireCourierDetails ? 'Адрес в накладной для курьера:' : 'Адрес в накладной:'}
                </span>
                <p className="text-xs font-bold text-text-primary leading-relaxed break-words">
                  {previewString || 'Укажите улицу и номер дома'}
                </p>
              </div>

              {/* Checkbox: Make Default */}
              <button
                type="button"
                role="checkbox"
                aria-checked={isDefault}
                onClick={() => setIsDefault(!isDefault)}
                className="min-h-8 flex items-center gap-3 pt-1 cursor-pointer select-none group text-left"
              >
                <span
                  className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-all ${
                    isDefault
                      ? 'neu-fill-accent text-white'
                      : 'neu-inset text-transparent'
                  }`}
                  aria-hidden="true"
                >
                  <Check className="w-3.5 h-3.5 stroke-[3] shrink-0" />
                </span>
                <span className="font-bold text-xs text-text-primary group-hover:text-accent transition-colors">
                  Сделать основным адресом
                </span>
              </button>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-3.5 neu-button rounded-2xl text-xs font-bold text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3.5 neu-button-accent rounded-2xl text-xs font-extrabold text-white transition-all cursor-pointer"
                >
                  Сохранить
                </button>
              </div>
            </form>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
};

