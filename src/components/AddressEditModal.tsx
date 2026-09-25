import React, { useState, useEffect } from 'react';
import { X, Check, MapPin, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SavedAddress } from '../types';
import { formatAddress } from '../utils/addressFormat';

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
    isDefault?: boolean;
  }) => void;
}

export const AddressEditModal: React.FC<AddressEditModalProps> = ({
  isOpen,
  onClose,
  editingAddress,
  onSave,
}) => {
  const [title, setTitle] = useState('Дом');
  const [city, setCity] = useState('Москва');
  const [postalCode, setPostalCode] = useState('');
  const [street, setStreet] = useState('');
  const [house, setHouse] = useState('');
  const [entrance, setEntrance] = useState('');
  const [floor, setFloor] = useState('');
  const [apartment, setApartment] = useState('');
  const [intercom, setIntercom] = useState('');
  const [isDefault, setIsDefault] = useState(true);
  const [errors, setErrors] = useState<{
    house?: string;
    entrance?: string;
    intercom?: string;
  }>({});

  useEffect(() => {
    if (editingAddress) {
      setTitle(editingAddress.title || 'Дом');
      setCity(editingAddress.city || 'Москва');
      setPostalCode(editingAddress.postalCode || '');
      setStreet(editingAddress.street || '');
      setHouse(editingAddress.house || '');
      setEntrance(editingAddress.entrance || '');
      setFloor(editingAddress.floor || '');
      setApartment(editingAddress.apartment || '');
      setIntercom(editingAddress.intercom || '');
      setIsDefault(editingAddress.isDefault ?? false);
    } else {
      setTitle('Дом');
      setCity('Москва');
      setPostalCode('');
      setStreet('');
      setHouse('');
      setEntrance('');
      setFloor('');
      setApartment('');
      setIntercom('');
      setIsDefault(true);
    }
    setErrors({});
  }, [editingAddress, isOpen]);

  // Real-time formatted address preview for courier dispatch
  const previewString = formatAddress({
    city,
    postalCode,
    street,
    house,
    entrance,
    floor,
    apartment,
    intercom,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: { house?: string; entrance?: string; intercom?: string } = {};
    if (!house.trim()) {
      newErrors.house = 'Укажите номер дома';
    }
    if (!entrance.trim()) {
      newErrors.entrance = 'Укажите подъезд';
    }
    if (!intercom.trim()) {
      newErrors.intercom = 'Укажите код домофона';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    onSave({
      id: editingAddress?.id,
      title: title.trim() || 'Адрес',
      city: city.trim() || 'Москва',
      postalCode: postalCode.trim(),
      street: street.trim(),
      house: house.trim(),
      entrance: entrance.trim(),
      floor: floor.trim(),
      apartment: apartment.trim(),
      intercom: intercom.trim(),
      isDefault,
    });
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="address-edit-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
        >
          <div
            onClick={onClose}
            className="fixed inset-0 bg-[#2D3A4E]/45 backdrop-blur-xs cursor-pointer"
          />
          <motion.div
            key="address-modal"
            initial={{ scale: 0.93, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.93, opacity: 0, y: 12 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-lg neu-modal rounded-3xl p-5 sm:p-6 space-y-4 sm:space-y-5 border border-white/80 text-[#2D3A4E] z-10 max-h-[90vh] overflow-y-auto scrollbar-thin"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-[#BAC5D5]/60">
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-[#4B59BB]" />
                <h3 className="text-base font-extrabold text-[#2D3A4E]">
                  {editingAddress ? 'Редактировать адрес' : 'Новый адрес доставки'}
                </h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] transition-colors cursor-pointer"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Validation alert banner if required courier fields missing */}
            {Object.keys(errors).length > 0 && (
              <div className="p-3 rounded-2xl bg-danger-soft border border-danger/35 text-danger text-xs flex items-center gap-2 animate-in fade-in duration-200">
                <AlertCircle className="w-4 h-4 text-danger shrink-0" />
                <span className="font-semibold">
                  Пожалуйста, заполните обязательные данные для курьера: номер дома, подъезд и код домофона.
                </span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
              {/* Title / Label */}
              <div>
                <label className="block text-xs font-bold text-[#2D3A4E] mb-1">
                  Название адреса
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Дом, Работа, Студия"
                  className="w-full neu-inset rounded-2xl py-2.5 px-3.5 text-xs font-semibold text-[#2D3A4E] placeholder:text-[#56647A] bg-[#E3E8EF]"
                />
              </div>

              {/* City & Postal Code (2 Columns) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-[#2D3A4E] mb-1">
                    Город
                  </label>
                  <input
                    type="text"
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Москва"
                    className="w-full neu-inset rounded-2xl py-2.5 px-3.5 text-xs font-semibold text-[#2D3A4E] placeholder:text-[#56647A] bg-[#E3E8EF]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#2D3A4E] mb-1">
                    Индекс
                  </label>
                  <input
                    type="text"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    placeholder="101000"
                    className="w-full neu-inset rounded-2xl py-2.5 px-3.5 text-xs font-semibold text-[#2D3A4E] placeholder:text-[#56647A] bg-[#E3E8EF]"
                  />
                </div>
              </div>

              {/* Street */}
              <div>
                <label className="block text-xs font-bold text-[#2D3A4E] mb-1">
                  Улица
                </label>
                <input
                  type="text"
                  required
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  placeholder="ул. Тверская, Ленинский проспект"
                  className="w-full neu-inset rounded-2xl py-2.5 px-3.5 text-xs font-semibold text-[#2D3A4E] placeholder:text-[#56647A] bg-[#E3E8EF]"
                />
              </div>

              {/* Precise building & delivery coordinates: Дом, Подъезд, Этаж */}
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-[#2D3A4E] mb-1">
                    Номер дома <span className="text-danger font-bold">*</span>
                  </label>
                  <input
                    type="text"
                    value={house}
                    onChange={(e) => {
                      setHouse(e.target.value);
                      if (errors.house && e.target.value.trim()) {
                        setErrors(prev => ({ ...prev, house: undefined }));
                      }
                    }}
                    placeholder="д. 10 / 12к1"
                    className={`w-full neu-inset rounded-2xl py-2.5 px-3 text-xs font-semibold text-[#2D3A4E] placeholder:text-[#56647A] bg-[#E3E8EF] transition-all ${
                      errors.house ? 'ring-2 ring-danger/70 bg-danger-soft' : ''
                    }`}
                  />
                  {errors.house && (
                    <p className="text-[11px] text-danger font-medium mt-1 leading-tight">
                      {errors.house}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#2D3A4E] mb-1">
                    Подъезд <span className="text-danger font-bold">*</span>
                  </label>
                  <input
                    type="text"
                    value={entrance}
                    onChange={(e) => {
                      setEntrance(e.target.value);
                      if (errors.entrance && e.target.value.trim()) {
                        setErrors(prev => ({ ...prev, entrance: undefined }));
                      }
                    }}
                    placeholder="2"
                    className={`w-full neu-inset rounded-2xl py-2.5 px-3 text-xs font-semibold text-[#2D3A4E] placeholder:text-[#56647A] bg-[#E3E8EF] transition-all ${
                      errors.entrance ? 'ring-2 ring-danger/70 bg-danger-soft' : ''
                    }`}
                  />
                  {errors.entrance && (
                    <p className="text-[11px] text-danger font-medium mt-1 leading-tight">
                      {errors.entrance}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#2D3A4E] mb-1">
                    Этаж
                  </label>
                  <input
                    type="text"
                    value={floor}
                    onChange={(e) => setFloor(e.target.value)}
                    placeholder="4"
                    className="w-full neu-inset rounded-2xl py-2.5 px-3 text-xs font-semibold text-[#2D3A4E] placeholder:text-[#56647A] bg-[#E3E8EF]"
                  />
                </div>
              </div>

              {/* Apartment & Intercom (Код домофона) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-[#2D3A4E] mb-1">
                    Квартира / Офис
                  </label>
                  <input
                    type="text"
                    value={apartment}
                    onChange={(e) => setApartment(e.target.value)}
                    placeholder="кв. 25 / офис 14"
                    className="w-full neu-inset rounded-2xl py-2.5 px-3 text-xs font-semibold text-[#2D3A4E] placeholder:text-[#56647A] bg-[#E3E8EF]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#2D3A4E] mb-1">
                    Код домофона <span className="text-danger font-bold">*</span>
                  </label>
                  <input
                    type="text"
                    value={intercom}
                    onChange={(e) => {
                      setIntercom(e.target.value);
                      if (errors.intercom && e.target.value.trim()) {
                        setErrors(prev => ({ ...prev, intercom: undefined }));
                      }
                    }}
                    placeholder="25K / #1234"
                    className={`w-full neu-inset rounded-2xl py-2.5 px-3 text-xs font-semibold text-[#2D3A4E] placeholder:text-[#56647A] bg-[#E3E8EF] transition-all ${
                      errors.intercom ? 'ring-2 ring-danger/70 bg-danger-soft' : ''
                    }`}
                  />
                  {errors.intercom && (
                    <p className="text-[11px] text-danger font-medium mt-1 leading-tight">
                      {errors.intercom}
                    </p>
                  )}
                </div>
              </div>

              {/* Live Preview Box for Delivery */}
              <div className="neu-inset rounded-2xl p-3 bg-[#E3E8EF] space-y-1">
                <span className="text-[11px] font-bold text-[#4E5C70] uppercase tracking-wider block">
                  Адрес в накладной для курьера:
                </span>
                <p className="text-xs font-bold text-[#2D3A4E] leading-relaxed break-words">
                  {previewString || 'Укажите улицу и номер дома'}
                </p>
              </div>

              {/* Checkbox: Make Default */}
              <div
                onClick={() => setIsDefault(!isDefault)}
                className="flex items-center gap-3 pt-1 cursor-pointer select-none group"
              >
                <div
                  className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${
                    isDefault
                      ? 'neu-fill-accent text-white'
                      : 'neu-inset text-transparent bg-[#E3E8EF]'
                  }`}
                >
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </div>
                <span className="font-bold text-xs text-[#2D3A4E] group-hover:text-[#4B59BB] transition-colors">
                  Сделать основным адресом
                </span>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
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
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
