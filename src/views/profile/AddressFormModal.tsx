import { Check, X } from 'lucide-react';
import { formatAddress } from '../../utils/addressFormat';

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
  } = book;
  return (
    <>
      {isAddingAddress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#2D3A4E]/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            ref={addressFormDialog.ref}
            {...addressFormDialog.props}
            className="neu-modal rounded-[28px] p-6 max-w-md w-full max-h-[90dvh] flex flex-col gap-4 relative text-[#2D3A4E] border border-white/80">
            <div className="flex items-center justify-between pb-1 border-b border-[#BAC5D5]/50 shrink-0">
              <h3 id={addressFormDialog.titleId} className="text-base font-extrabold text-[#2D3A4E]">
                {editingAddress ? 'Редактировать адрес' : 'Добавить адрес'}
              </h3>
              <button
                type="button"
                onClick={() => setIsAddingAddress(false)}
                className="w-8 h-8 rounded-full neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] transition-colors cursor-pointer"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* The form scrolls inside the window: with region and comment it is taller than a phone screen */}
            <form onSubmit={handleSaveAddress} className="space-y-4 text-xs flex-1 min-h-0 overflow-y-auto overscroll-contain -mx-2 px-2 pb-1">
              <div>
                <label htmlFor="profile-addr-title" className="block text-xs font-bold text-[#2D3A4E] mb-1.5">
                  Название (например: Дом, Работа)
                </label>
                <input
                  id="profile-addr-title"
                  type="text"
                  value={addrTitle}
                  onChange={(e) => setAddrTitle(e.target.value)}
                  className="w-full neu-inset rounded-2xl py-3 px-3.5 text-xs font-semibold text-[#2D3A4E] placeholder:text-[#56647A]"
                  placeholder="Дом"
                  required
                />
              </div>

              <div>
                <label htmlFor="profile-addr-region" className="block text-xs font-bold text-[#2D3A4E] mb-1.5">
                  Страна / регион
                </label>
                <input
                  id="profile-addr-region"
                  type="text"
                  autoComplete="address-level1"
                  value={addrRegion}
                  onChange={(e) => setAddrRegion(e.target.value)}
                  className="w-full neu-inset rounded-2xl py-3 px-3.5 text-xs font-semibold text-[#2D3A4E] placeholder:text-[#56647A]"
                  placeholder="Россия, Московская область"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="profile-addr-city" className="block text-xs font-bold text-[#2D3A4E] mb-1.5">Город</label>
                  <input
                    id="profile-addr-city"
                    type="text"
                    autoComplete="address-level2"
                    value={addrCity}
                    onChange={(e) => setAddrCity(e.target.value)}
                    className="w-full neu-inset rounded-2xl py-3 px-3.5 text-xs font-semibold text-[#2D3A4E] placeholder:text-[#56647A]"
                    placeholder="Город"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="profile-addr-postal" className="block text-xs font-bold text-[#2D3A4E] mb-1.5">Индекс</label>
                  <input
                    id="profile-addr-postal"
                    type="text"
                    value={addrPostal}
                    onChange={(e) => setAddrPostal(e.target.value)}
                    className="w-full neu-inset rounded-2xl py-3 px-3.5 text-xs font-semibold text-[#2D3A4E] placeholder:text-[#56647A]"
                    placeholder="101000"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="profile-addr-street" className="block text-xs font-bold text-[#2D3A4E] mb-1.5">
                  Улица
                </label>
                <input
                  id="profile-addr-street"
                  type="text"
                  value={addrStreet}
                  onChange={(e) => setAddrStreet(e.target.value)}
                  className="w-full neu-inset rounded-2xl py-3 px-3.5 text-xs font-semibold text-[#2D3A4E] placeholder:text-[#56647A]"
                  placeholder="ул. Тверская, Ленинский проспект"
                  required
                />
              </div>

              {/* Номер дома, Подъезд, Этаж */}
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label htmlFor="profile-addr-house" className="block text-[11px] font-bold text-[#2D3A4E] mb-1">
                    Номер дома
                  </label>
                  <input
                    id="profile-addr-house"
                    type="text"
                    value={addrHouse}
                    onChange={(e) => setAddrHouse(e.target.value)}
                    className="w-full neu-inset rounded-2xl py-2.5 px-3 text-xs font-semibold text-[#2D3A4E] placeholder:text-[#56647A]"
                    placeholder="д. 10 / 12к1"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="profile-addr-entrance" className="block text-[11px] font-bold text-[#2D3A4E] mb-1">
                    Подъезд
                  </label>
                  <input
                    id="profile-addr-entrance"
                    type="text"
                    value={addrEntrance}
                    onChange={(e) => setAddrEntrance(e.target.value)}
                    className="w-full neu-inset rounded-2xl py-2.5 px-3 text-xs font-semibold text-[#2D3A4E] placeholder:text-[#56647A]"
                    placeholder="2"
                  />
                </div>
                <div>
                  <label htmlFor="profile-addr-floor" className="block text-[11px] font-bold text-[#2D3A4E] mb-1">
                    Этаж
                  </label>
                  <input
                    id="profile-addr-floor"
                    type="text"
                    value={addrFloor}
                    onChange={(e) => setAddrFloor(e.target.value)}
                    className="w-full neu-inset rounded-2xl py-2.5 px-3 text-xs font-semibold text-[#2D3A4E] placeholder:text-[#56647A]"
                    placeholder="4"
                  />
                </div>
              </div>

              {/* Квартира / Офис & Код домофона */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="profile-addr-apartment" className="block text-[11px] font-bold text-[#2D3A4E] mb-1">
                    Квартира / Офис
                  </label>
                  <input
                    id="profile-addr-apartment"
                    type="text"
                    value={addrApartment}
                    onChange={(e) => setAddrApartment(e.target.value)}
                    className="w-full neu-inset rounded-2xl py-2.5 px-3 text-xs font-semibold text-[#2D3A4E] placeholder:text-[#56647A]"
                    placeholder="кв. 25"
                  />
                </div>
                <div>
                  <label htmlFor="profile-addr-intercom" className="block text-[11px] font-bold text-[#2D3A4E] mb-1">
                    Код домофона
                  </label>
                  <input
                    id="profile-addr-intercom"
                    type="text"
                    value={addrIntercom}
                    onChange={(e) => setAddrIntercom(e.target.value)}
                    className="w-full neu-inset rounded-2xl py-2.5 px-3 text-xs font-semibold text-[#2D3A4E] placeholder:text-[#56647A]"
                    placeholder="25K / #1234"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="profile-addr-comment" className="block text-xs font-bold text-[#2D3A4E] mb-1.5">
                  Комментарий курьеру
                </label>
                <textarea
                  id="profile-addr-comment"
                  rows={2}
                  maxLength={300}
                  value={addrComment}
                  onChange={(e) => setAddrComment(e.target.value)}
                  className="w-full neu-inset rounded-2xl py-2.5 px-3.5 text-xs font-semibold text-[#2D3A4E] placeholder:text-[#56647A] resize-y"
                  placeholder="Например: позвонить за час, шлагбаум со двора"
                />
              </div>

              {/* Delivery Preview */}
              <div className="neu-inset rounded-2xl p-3 space-y-1">
                <span className="text-[11px] font-bold text-[#4E5C70] uppercase tracking-wider block">
                  Адрес для курьера:
                </span>
                <p className="text-xs font-bold text-[#2D3A4E] leading-relaxed break-words">
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

              <div
                onClick={() => setAddrIsDefault(!addrIsDefault)}
                className="flex items-center gap-3 pt-1 cursor-pointer select-none group"
              >
                <div
                  className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${
                    addrIsDefault
                      ? 'neu-fill-accent text-white'
                      : 'neu-inset text-transparent'
                  }`}
                >
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </div>
                <span className="font-bold text-xs text-[#2D3A4E] group-hover:text-accent">
                  Сделать основным адресом
                </span>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddingAddress(false)}
                  className="flex-1 py-3.5 neu-button rounded-2xl text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] transition-colors cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3.5 neu-button-accent rounded-2xl text-xs font-extrabold text-white transition-all active:scale-[0.98] cursor-pointer"
                >
                  Сохранить
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
