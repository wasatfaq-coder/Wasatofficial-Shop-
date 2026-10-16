import { Check, Sparkles, X } from 'lucide-react';
import {
  formatAddress,
  parseSmartAddress,
  toggleCourierCommentChip,
  POPULAR_RU_CITIES,
  ADDRESS_TITLE_PRESETS,
  COURIER_COMMENT_SUGGESTIONS,
} from '../../utils/addressFormat';

import type { AddressBook } from './useAddressBook';

/** The add / edit address form over the profile and the addresses window */
export function AddressFormModal({ book }: { book: AddressBook }) {
  const {
    editingAddress,
    isAddingAddress,
    setIsAddingAddress,
    addressFormDialog,
    addrTitle,
    setAddrTitle,
    addrCity,
    setAddrCity,
    addrStreet,
    setAddrStreet,
    addrHouse,
    setAddrHouse,
    addrEntrance,
    setAddrEntrance,
    addrFloor,
    setAddrFloor,
    addrApartment,
    setAddrApartment,
    addrIntercom,
    setAddrIntercom,
    addrPostal,
    setAddrPostal,
    addrRegion,
    setAddrRegion,
    addrComment,
    setAddrComment,
    addrIsDefault,
    setAddrIsDefault,
    handleSaveAddress,
    isSavingAddress,
  } = book;

  const applySmartParsed = (rawText: string) => {
    const parsed = parseSmartAddress(rawText);
    if (parsed.region && !addrRegion.trim()) setAddrRegion(parsed.region);
    if (parsed.city && !addrCity.trim()) setAddrCity(parsed.city);
    if (parsed.postalCode && !addrPostal.trim()) setAddrPostal(parsed.postalCode);
    if (parsed.street) setAddrStreet(parsed.street);
    if (parsed.house) setAddrHouse(parsed.house);
    if (parsed.entrance && !addrEntrance.trim()) setAddrEntrance(parsed.entrance);
    if (parsed.floor && !addrFloor.trim()) setAddrFloor(parsed.floor);
    if (parsed.apartment && !addrApartment.trim()) setAddrApartment(parsed.apartment);
    if (parsed.intercom && !addrIntercom.trim()) setAddrIntercom(parsed.intercom);
  };

  const canParseStreetLine = Boolean(
    addrStreet.trim() &&
      !addrHouse.trim() &&
      (/[,;]/.test(addrStreet) || /\s+(?:д\.?|дом|\d+)\s*$/i.test(addrStreet.trim()))
  );

  return (
    <>
      {isAddingAddress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-text-primary/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            ref={addressFormDialog.ref}
            {...addressFormDialog.props}
            className="neu-modal rounded-[28px] p-6 max-w-md w-full max-h-[90dvh] flex flex-col gap-4 relative text-text-primary ">
            <div className="flex items-center justify-between pb-2 neu-divider-b shrink-0">
              <h3 id={addressFormDialog.titleId} className="text-base font-extrabold text-text-primary">
                {editingAddress ? 'Редактировать адрес' : 'Добавить адрес'}
              </h3>
              <button
                type="button"
                onClick={() => setIsAddingAddress(false)}
                className="w-8 h-8 rounded-full neu-button flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors cursor-pointer shrink-0"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4 shrink-0" />
              </button>
            </div>

            {/* The form scrolls inside the window: with region and comment it is taller than a phone screen */}
            <form onSubmit={handleSaveAddress} className="space-y-4 text-xs flex-1 min-h-0 overflow-y-auto overscroll-contain -mx-2 px-2 pb-1">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <label htmlFor="profile-addr-title" className="block text-xs font-bold text-text-primary">
                    Название (например: Дом, Работа)
                  </label>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {ADDRESS_TITLE_PRESETS.map((preset) => {
                      const active = addrTitle.trim().toLowerCase() === preset.toLowerCase();
                      return (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setAddrTitle(preset)}
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
                  id="profile-addr-title"
                  type="text"
                  enterKeyHint="next"
                  value={addrTitle}
                  onChange={(e) => setAddrTitle(e.target.value)}
                  className="w-full neu-inset rounded-2xl py-3 px-3.5 text-xs font-semibold text-text-primary placeholder:text-text-muted"
                  placeholder="Дом"
                  required
                />
              </div>

              <div>
                <label htmlFor="profile-addr-region" className="block text-xs font-bold text-text-primary mb-1.5">
                  Страна / регион
                </label>
                <input
                  id="profile-addr-region"
                  type="text"
                  autoComplete="address-level1"
                  enterKeyHint="next"
                  value={addrRegion}
                  onChange={(e) => setAddrRegion(e.target.value)}
                  className="w-full neu-inset rounded-2xl py-3 px-3.5 text-xs font-semibold text-text-primary placeholder:text-text-muted"
                  placeholder="Россия, Московская область"
                />
              </div>

              <div className="space-y-1.5">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="profile-addr-city" className="block text-xs font-bold text-text-primary mb-1.5">Город</label>
                    <input
                      id="profile-addr-city"
                      type="text"
                      autoComplete="address-level2"
                      enterKeyHint="next"
                      value={addrCity}
                      onChange={(e) => setAddrCity(e.target.value)}
                      className="w-full neu-inset rounded-2xl py-3 px-3.5 text-xs font-semibold text-text-primary placeholder:text-text-muted"
                      placeholder="Город"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="profile-addr-postal" className="block text-xs font-bold text-text-primary mb-1.5">Индекс</label>
                    <input
                      id="profile-addr-postal"
                      type="text"
                      autoComplete="postal-code"
                      inputMode="numeric"
                      enterKeyHint="next"
                      maxLength={6}
                      value={addrPostal}
                      onChange={(e) => setAddrPostal(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="w-full neu-inset rounded-2xl py-3 px-3.5 text-xs font-semibold text-text-primary placeholder:text-text-muted tabular-nums"
                      placeholder="101000"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                  {POPULAR_RU_CITIES.map((popularCity) => {
                    const isSelectedCity = addrCity.trim().toLowerCase() === popularCity.toLowerCase();
                    return (
                      <button
                        key={popularCity}
                        type="button"
                        onClick={() => setAddrCity(popularCity)}
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

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="profile-addr-street" className="block text-xs font-bold text-text-primary">
                    Улица
                  </label>
                  {canParseStreetLine && (
                    <button
                      type="button"
                      onClick={() => applySmartParsed(addrStreet)}
                      className="px-2.5 py-1 rounded-xl neu-button text-[11px] font-bold text-accent inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Sparkles className="w-3 h-3 shrink-0" />
                      <span>Разнести по полям</span>
                    </button>
                  )}
                </div>
                <input
                  id="profile-addr-street"
                  type="text"
                  autoComplete="address-line1"
                  enterKeyHint="next"
                  value={addrStreet}
                  onChange={(e) => setAddrStreet(e.target.value)}
                  onPaste={(e) => {
                    const pasted = e.clipboardData?.getData('text') || '';
                    if (pasted.includes(',') && !addrHouse.trim()) {
                      const parsed = parseSmartAddress(pasted);
                      if (parsed.street && (parsed.house || parsed.city)) {
                        e.preventDefault();
                        applySmartParsed(pasted);
                      }
                    }
                  }}
                  className="w-full neu-inset rounded-2xl py-3 px-3.5 text-xs font-semibold text-text-primary placeholder:text-text-muted"
                  placeholder="ул. Тверская, Ленинский проспект"
                  required
                />
              </div>

              {/* Номер дома, Подъезд, Этаж */}
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label htmlFor="profile-addr-house" className="block text-[11px] font-bold text-text-primary mb-1">
                    Номер дома
                  </label>
                  <input
                    id="profile-addr-house"
                    type="text"
                    enterKeyHint="next"
                    value={addrHouse}
                    onChange={(e) => setAddrHouse(e.target.value)}
                    className="w-full neu-inset rounded-2xl py-2.5 px-3 text-xs font-semibold text-text-primary placeholder:text-text-muted"
                    placeholder="д. 10 / 12к1"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="profile-addr-entrance" className="block text-[11px] font-bold text-text-primary mb-1">
                    Подъезд
                  </label>
                  <input
                    id="profile-addr-entrance"
                    type="text"
                    enterKeyHint="next"
                    value={addrEntrance}
                    onChange={(e) => setAddrEntrance(e.target.value)}
                    className="w-full neu-inset rounded-2xl py-2.5 px-3 text-xs font-semibold text-text-primary placeholder:text-text-muted"
                    placeholder="2"
                  />
                </div>
                <div>
                  <label htmlFor="profile-addr-floor" className="block text-[11px] font-bold text-text-primary mb-1">
                    Этаж
                  </label>
                  <input
                    id="profile-addr-floor"
                    type="text"
                    inputMode="numeric"
                    enterKeyHint="next"
                    value={addrFloor}
                    onChange={(e) => setAddrFloor(e.target.value)}
                    className="w-full neu-inset rounded-2xl py-2.5 px-3 text-xs font-semibold text-text-primary placeholder:text-text-muted tabular-nums"
                    placeholder="4"
                  />
                </div>
              </div>

              {/* Квартира / Офис & Код домофона */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="profile-addr-apartment" className="block text-[11px] font-bold text-text-primary mb-1">
                    Квартира / Офис
                  </label>
                  <input
                    id="profile-addr-apartment"
                    type="text"
                    autoComplete="address-line2"
                    enterKeyHint="next"
                    value={addrApartment}
                    onChange={(e) => setAddrApartment(e.target.value)}
                    className="w-full neu-inset rounded-2xl py-2.5 px-3 text-xs font-semibold text-text-primary placeholder:text-text-muted"
                    placeholder="кв. 25"
                  />
                </div>
                <div>
                  <label htmlFor="profile-addr-intercom" className="block text-[11px] font-bold text-text-primary mb-1">
                    Код домофона
                  </label>
                  <input
                    id="profile-addr-intercom"
                    type="text"
                    enterKeyHint="done"
                    value={addrIntercom}
                    onChange={(e) => setAddrIntercom(e.target.value)}
                    className="w-full neu-inset rounded-2xl py-2.5 px-3 text-xs font-semibold text-text-primary placeholder:text-text-muted"
                    placeholder="25K / #1234"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="profile-addr-comment" className="block text-xs font-bold text-text-primary">
                  Комментарий курьеру
                </label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {COURIER_COMMENT_SUGGESTIONS.map((chip) => {
                    const active = addrComment.toLowerCase().includes(chip.toLowerCase());
                    return (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => setAddrComment(toggleCourierCommentChip(addrComment, chip))}
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
                  id="profile-addr-comment"
                  rows={2}
                  maxLength={300}
                  value={addrComment}
                  onChange={(e) => setAddrComment(e.target.value)}
                  className="w-full neu-inset rounded-2xl py-2.5 px-3.5 text-xs font-semibold text-text-primary placeholder:text-text-muted resize-y"
                  placeholder="Например: позвонить за час, шлагбаум со двора"
                />
              </div>

              {/* Delivery Preview */}
              <div className="neu-inset rounded-2xl p-3 space-y-1">
                <span className="text-[11px] font-bold text-text-secondary uppercase tracking-wider block">
                  Адрес для курьера:
                </span>
                <p className="text-xs font-bold text-text-primary leading-relaxed break-words">
                  {formatAddress({
                    region: addrRegion,
                    city: addrCity,
                    postalCode: addrPostal,
                    street: addrStreet,
                    house: addrHouse,
                    entrance: addrEntrance,
                    floor: addrFloor,
                    apartment: addrApartment,
                    intercom: addrIntercom,
                  }) || 'Укажите улицу и номер дома'}
                </p>
              </div>

              <button
                type="button"
                role="checkbox"
                aria-checked={addrIsDefault}
                onClick={() => setAddrIsDefault(!addrIsDefault)}
                className="min-h-8 flex items-center gap-3 pt-1 cursor-pointer select-none group text-left"
              >
                <span
                  className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all ${
                    addrIsDefault
                      ? 'neu-fill-accent text-white'
                      : 'neu-inset text-transparent'
                  }`}
                  aria-hidden="true"
                >
                  <Check className="w-4 h-4 stroke-[3] shrink-0" />
                </span>
                <span className="font-bold text-xs text-text-primary group-hover:text-accent">
                  Сделать основным адресом
                </span>
              </button>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddingAddress(false)}
                  className="flex-1 py-3.5 neu-button rounded-2xl text-xs font-bold text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isSavingAddress}
                  className="flex-1 py-3.5 neu-button-accent rounded-2xl text-xs font-extrabold text-white transition-all cursor-pointer disabled:cursor-wait"
                >
                  {isSavingAddress ? 'Сохранение…' : 'Сохранить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

