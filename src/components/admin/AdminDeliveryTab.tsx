import React, { useState } from 'react';
import {
  Truck,
  Store,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Bike,
  Mail,
  Zap,
  Package,
  MapPin,
  Clock,
  Phone,
  Info,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Search,
  Sparkles,
  Layers,
  ArrowRight,
  RotateCcw,
} from 'lucide-react';
import { DeliveryMethod, PickupPoint, StorefrontSettings } from '../../types';
import { INITIAL_DELIVERY_METHODS, INITIAL_PICKUP_POINTS } from '../../data/deliveryData';

interface AdminDeliveryTabProps {
  deliveryMethods: DeliveryMethod[];
  onUpdateDeliveryMethods: (methods: DeliveryMethod[]) => void;
  pickupPoints: PickupPoint[];
  onUpdatePickupPoints: (points: PickupPoint[]) => void;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
  storefrontSettings?: StorefrontSettings;
  onUpdateStorefrontSettings?: (settings: StorefrontSettings) => void;
}

export const AdminDeliveryTab: React.FC<AdminDeliveryTabProps> = ({
  deliveryMethods,
  onUpdateDeliveryMethods,
  pickupPoints,
  onUpdatePickupPoints,
  onShowToast,
  storefrontSettings,
  onUpdateStorefrontSettings,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'methods' | 'pickup_points'>('methods');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'courier' | 'pickup' | 'express' | 'post' | 'custom'>('all');

  // Modals state
  const [editingMethod, setEditingMethod] = useState<DeliveryMethod | null>(null);
  const [isMethodModalOpen, setIsMethodModalOpen] = useState(false);
  const [deletingMethodId, setDeletingMethodId] = useState<string | null>(null);

  const [editingPoint, setEditingPoint] = useState<PickupPoint | null>(null);
  const [isPointModalOpen, setIsPointModalOpen] = useState(false);
  const [deletingPointId, setDeletingPointId] = useState<string | null>(null);

  // Method Form State
  const [formMethodTitle, setFormMethodTitle] = useState('');
  const [formMethodDuration, setFormMethodDuration] = useState('');
  const [formMethodPrice, setFormMethodPrice] = useState<number>(0);
  const [formMethodIcon, setFormMethodIcon] = useState('Bike');
  const [formMethodType, setFormMethodType] = useState<DeliveryMethod['type']>('courier');
  const [formMethodDesc, setFormMethodDesc] = useState('');
  const [formMethodFreeThreshold, setFormMethodFreeThreshold] = useState<number | undefined>(5000);
  const [formMethodIsActive, setFormMethodIsActive] = useState(true);
  const [formMethodBadge, setFormMethodBadge] = useState('');

  // Pickup Point Form State
  const [formPointName, setFormPointName] = useState('');
  const [formPointCity, setFormPointCity] = useState('');
  const [formPointAddress, setFormPointAddress] = useState('');
  const [formPointMetro, setFormPointMetro] = useState('');
  const [formPointSchedule, setFormPointSchedule] = useState('');
  const [formPointPhone, setFormPointPhone] = useState('');
  const [formPointNote, setFormPointNote] = useState('');
  const [formPointIsActive, setFormPointIsActive] = useState(true);
  const [formPointIsDefault, setFormPointIsDefault] = useState(false);

  // Filtered Methods
  const filteredMethods = deliveryMethods.filter((m) => {
    if (typeFilter !== 'all' && m.type !== typeFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = m.title.toLowerCase().includes(q);
      const matchDesc = m.description?.toLowerCase().includes(q);
      return matchTitle || matchDesc;
    }
    return true;
  });

  // Filtered Pickup Points
  const filteredPoints = pickupPoints.filter((p) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.city.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q) ||
        p.metro?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Open Method Modal
  const handleOpenAddMethod = () => {
    setEditingMethod(null);
    setFormMethodTitle('');
    setFormMethodDuration('1–2 дня');
    setFormMethodPrice(350);
    setFormMethodIcon('Truck');
    setFormMethodType('courier');
    setFormMethodDesc('');
    setFormMethodFreeThreshold(5000);
    setFormMethodIsActive(true);
    setFormMethodBadge('');
    setIsMethodModalOpen(true);
  };

  const handleOpenEditMethod = (m: DeliveryMethod) => {
    setEditingMethod(m);
    setFormMethodTitle(m.title);
    setFormMethodDuration(m.duration);
    setFormMethodPrice(m.price);
    setFormMethodIcon(m.icon || 'Truck');
    setFormMethodType(m.type || 'custom');
    setFormMethodDesc(m.description || '');
    setFormMethodFreeThreshold(m.freeThreshold);
    setFormMethodIsActive(m.isActive !== false);
    setFormMethodBadge(m.highlightBadge || '');
    setIsMethodModalOpen(true);
  };

  const handleSaveMethod = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formMethodTitle.trim()) {
      onShowToast('Введите название способа доставки', 'error');
      return;
    }

    if (editingMethod) {
      const updated = deliveryMethods.map((m) =>
        m.id === editingMethod.id
          ? {
              ...m,
              title: formMethodTitle.trim(),
              duration: formMethodDuration.trim(),
              price: Number(formMethodPrice) || 0,
              icon: formMethodIcon,
              type: formMethodType,
              description: formMethodDesc.trim(),
              freeThreshold: formMethodFreeThreshold !== undefined ? Number(formMethodFreeThreshold) : undefined,
              isActive: formMethodIsActive,
              highlightBadge: formMethodBadge.trim() || undefined,
            }
          : m
      );
      onUpdateDeliveryMethods(updated);
      onShowToast(`Способ «${formMethodTitle}» успешно обновлен`, 'success');
    } else {
      const newMethod: DeliveryMethod = {
        id: `deliv-${Date.now()}`,
        title: formMethodTitle.trim(),
        duration: formMethodDuration.trim() || '1-3 дня',
        price: Number(formMethodPrice) || 0,
        icon: formMethodIcon,
        type: formMethodType,
        description: formMethodDesc.trim(),
        freeThreshold: formMethodFreeThreshold !== undefined ? Number(formMethodFreeThreshold) : undefined,
        isActive: formMethodIsActive,
        highlightBadge: formMethodBadge.trim() || undefined,
        sortOrder: deliveryMethods.length + 1,
      };
      onUpdateDeliveryMethods([...deliveryMethods, newMethod]);
      onShowToast(`Способ «${formMethodTitle}» успешно добавлен`, 'success');
    }
    setIsMethodModalOpen(false);
  };

  const handleToggleMethodActive = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = deliveryMethods.map((m) =>
      m.id === id ? { ...m, isActive: m.isActive === false ? true : false } : m
    );
    onUpdateDeliveryMethods(updated);
    const target = updated.find((m) => m.id === id);
    onShowToast(
      target?.isActive ? `Способ «${target.title}» активирован` : `Способ «${target?.title}» отключен`,
      'info'
    );
  };

  const handleDeleteMethod = (id: string) => {
    const toDelete = deliveryMethods.find((m) => m.id === id);
    const updated = deliveryMethods.filter((m) => m.id !== id);
    onUpdateDeliveryMethods(updated);
    setDeletingMethodId(null);
    onShowToast(`Способ «${toDelete?.title || ''}» удален`, 'info');
  };

  // Open Pickup Point Modal
  const handleOpenAddPoint = () => {
    setEditingPoint(null);
    setFormPointName('');
    setFormPointCity('Москва');
    setFormPointAddress('');
    setFormPointMetro('');
    setFormPointSchedule('Ежедневно: 10:00 – 22:00');
    setFormPointPhone('');
    setFormPointNote('');
    setFormPointIsActive(true);
    setFormPointIsDefault(pickupPoints.length === 0);
    setIsPointModalOpen(true);
  };

  const handleOpenEditPoint = (p: PickupPoint) => {
    setEditingPoint(p);
    setFormPointName(p.name);
    setFormPointCity(p.city);
    setFormPointAddress(p.address);
    setFormPointMetro(p.metro || '');
    setFormPointSchedule(p.schedule);
    setFormPointPhone(p.phone);
    setFormPointNote(p.note || '');
    setFormPointIsActive(p.isActive !== false);
    setFormPointIsDefault(!!p.isDefault);
    setIsPointModalOpen(true);
  };

  const handleSavePoint = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formPointName.trim() || !formPointAddress.trim()) {
      onShowToast('Укажите название и адрес пункта выдачи', 'error');
      return;
    }

    if (editingPoint) {
      const updated = pickupPoints.map((p) => {
        if (p.id === editingPoint.id) {
          return {
            ...p,
            name: formPointName.trim(),
            city: formPointCity.trim(),
            address: formPointAddress.trim(),
            metro: formPointMetro.trim() || undefined,
            schedule: formPointSchedule.trim(),
            phone: formPointPhone.trim(),
            note: formPointNote.trim() || undefined,
            isActive: formPointIsActive,
            isDefault: formPointIsDefault,
          };
        }
        // If this becomes default, remove default from others
        if (formPointIsDefault) {
          return { ...p, isDefault: false };
        }
        return p;
      });
      onUpdatePickupPoints(updated);

      // If updating the default point, also update storefrontSettings.pickupAddress for consistency
      if (formPointIsDefault && onUpdateStorefrontSettings && storefrontSettings) {
        onUpdateStorefrontSettings({
          ...storefrontSettings,
          pickupAddress: `${formPointCity.trim()}, ${formPointAddress.trim()}`,
        });
      }

      onShowToast(`Пункт «${formPointName}» сохранен`, 'success');
    } else {
      const newPoint: PickupPoint = {
        id: `point-${Date.now()}`,
        name: formPointName.trim(),
        city: formPointCity.trim(),
        address: formPointAddress.trim(),
        metro: formPointMetro.trim() || undefined,
        schedule: formPointSchedule.trim(),
        phone: formPointPhone.trim(),
        note: formPointNote.trim() || undefined,
        isActive: formPointIsActive,
        isDefault: formPointIsDefault || pickupPoints.length === 0,
      };

      const updated = formPointIsDefault
        ? pickupPoints.map((p) => ({ ...p, isDefault: false })).concat(newPoint)
        : [...pickupPoints, newPoint];

      onUpdatePickupPoints(updated);

      if (formPointIsDefault && onUpdateStorefrontSettings && storefrontSettings) {
        onUpdateStorefrontSettings({
          ...storefrontSettings,
          pickupAddress: `${formPointCity.trim()}, ${formPointAddress.trim()}`,
        });
      }

      onShowToast(`Пункт «${formPointName}» добавлен`, 'success');
    }
    setIsPointModalOpen(false);
  };

  const handleSetDefaultPoint = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = pickupPoints.map((p) => ({
      ...p,
      isDefault: p.id === id,
    }));
    onUpdatePickupPoints(updated);

    const target = updated.find((p) => p.id === id);
    if (target && onUpdateStorefrontSettings && storefrontSettings) {
      onUpdateStorefrontSettings({
        ...storefrontSettings,
        pickupAddress: `${target.city}, ${target.address}`,
      });
    }

    onShowToast(`Пункт «${target?.name}» назначен основным адресом самовывоза`, 'success');
  };

  const handleDeletePoint = (id: string) => {
    const toDelete = pickupPoints.find((p) => p.id === id);
    const updated = pickupPoints.filter((p) => p.id !== id);
    // If deleted point was default, set next as default
    if (toDelete?.isDefault && updated.length > 0) {
      updated[0].isDefault = true;
    }
    onUpdatePickupPoints(updated);
    setDeletingPointId(null);
    onShowToast(`Пункт «${toDelete?.name || ''}» удален`, 'info');
  };

  const handleRestoreDefaults = () => {
    onUpdateDeliveryMethods(INITIAL_DELIVERY_METHODS);
    onUpdatePickupPoints(INITIAL_PICKUP_POINTS);
    onShowToast('Восстановлены стандартные способы доставки и пункты выдачи', 'success');
  };

  // Icon mapping
  const renderMethodIcon = (iconName: string, className = 'w-5 h-5') => {
    switch (iconName) {
      case 'Bike':
        return <Bike className={className} />;
      case 'Store':
        return <Store className={className} />;
      case 'Zap':
        return <Zap className={className} />;
      case 'Mail':
        return <Mail className={className} />;
      case 'Truck':
        return <Truck className={className} />;
      default:
        return <Package className={className} />;
    }
  };

  const activeMethodsCount = deliveryMethods.filter((m) => m.isActive !== false).length;
  const activePointsCount = pickupPoints.filter((p) => p.isActive !== false).length;

  return (
    <div className="space-y-4">
      {/* Top Bento Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="neu-inset rounded-2xl p-3 bg-[#E3E8EF] flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-[#4E5C70] block uppercase tracking-wider">
              Всего способов
            </span>
            <span className="text-xl font-black text-[#2D3A4E] block mt-0.5">
              {deliveryMethods.length}
            </span>
          </div>
          <div className="w-9 h-9 rounded-xl neu-button flex items-center justify-center text-accent">
            <Truck className="w-4 h-4" />
          </div>
        </div>

        <div className="neu-inset rounded-2xl p-3 bg-[#E3E8EF] flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-[#4E5C70] block uppercase tracking-wider">
              Активных модулей
            </span>
            <span className="text-xl font-black text-success block mt-0.5">
              {activeMethodsCount}
            </span>
          </div>
          <div className="w-9 h-9 rounded-xl neu-button flex items-center justify-center text-success">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>

        <div className="neu-inset rounded-2xl p-3 bg-[#E3E8EF] flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-[#4E5C70] block uppercase tracking-wider">
              Пунктов выдачи
            </span>
            <span className="text-xl font-black text-accent block mt-0.5">
              {pickupPoints.length}
            </span>
          </div>
          <div className="w-9 h-9 rounded-xl neu-button flex items-center justify-center text-accent">
            <Store className="w-4 h-4" />
          </div>
        </div>

        <div className="neu-inset rounded-2xl p-3 bg-[#E3E8EF] flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-[#4E5C70] block uppercase tracking-wider">
              Бесплатно от
            </span>
            <span className="text-lg font-black text-[#2D3A4E] block mt-0.5">
              {storefrontSettings?.freeDeliveryThreshold ? `${storefrontSettings.freeDeliveryThreshold.toLocaleString()} ₽` : '5 000 ₽'}
            </span>
          </div>
          <div className="w-9 h-9 rounded-xl neu-button flex items-center justify-center text-warning">
            <Sparkles className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Subtabs Switcher & Actions */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        {/* Subtabs */}
        <div className="p-1 neu-flat-sm rounded-2xl flex items-center gap-1 bg-[#E3E8EF]">
          <button
            type="button"
            onClick={() => setActiveSubTab('methods')}
            className={`flex-1 sm:flex-none px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeSubTab === 'methods'
                ? 'neu-pill-active'
                : 'text-[#4E5C70] hover:text-[#2D3A4E]'
            }`}
          >
            <Truck className="w-3.5 h-3.5 shrink-0" />
            <span>Способы доставки</span>
            <span className="px-1.5 py-0.2 rounded-full neu-inset text-[11px] font-black">
              {deliveryMethods.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('pickup_points')}
            className={`flex-1 sm:flex-none px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeSubTab === 'pickup_points'
                ? 'neu-pill-active'
                : 'text-[#4E5C70] hover:text-[#2D3A4E]'
            }`}
          >
            <Store className="w-3.5 h-3.5 shrink-0" />
            <span>Пункты выдачи (Самовывоз)</span>
            <span className="px-1.5 py-0.2 rounded-full neu-inset text-[11px] font-black">
              {pickupPoints.length}
            </span>
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {activeSubTab === 'methods' ? (
            <button
              type="button"
              onClick={handleOpenAddMethod}
              className="flex-1 sm:flex-none py-2 px-3.5 neu-button-accent rounded-xl text-xs font-black text-white flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-transform"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Добавить способ</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleOpenAddPoint}
              className="flex-1 sm:flex-none py-2 px-3.5 neu-button-accent rounded-xl text-xs font-black text-white flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-transform"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Добавить пункт выдачи</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleRestoreDefaults}
            className="p-2 neu-button rounded-xl text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer"
            title="Восстановить стандартные настройки доставки"
            aria-label="Восстановить стандартные настройки доставки"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#4E5C70] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              activeSubTab === 'methods'
                ? 'Поиск по названию или описанию способа...'
                : 'Поиск по названию, адресу, метро, городу...'
            }
            className="w-full neu-inset rounded-xl py-2 pl-9 pr-3 text-xs font-medium text-[#2D3A4E] placeholder:text-[#56647A]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4E5C70] hover:text-[#2D3A4E]"
              aria-label="Закрыть"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {activeSubTab === 'methods' && (
          <div className="flex gap-1 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
            {[
              { id: 'all', label: 'Все' },
              { id: 'courier', label: 'Курьер' },
              { id: 'pickup', label: 'Самовывоз' },
              { id: 'express', label: 'Экспресс' },
              { id: 'post', label: 'Почта' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setTypeFilter(f.id as any)}
                className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all shrink-0 cursor-pointer ${
                  typeFilter === f.id
                    ? 'neu-pill-active'
                    : 'text-[#4E5C70] hover:text-[#2D3A4E]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* CONTENT: SUBTAB 1 - DELIVERY METHODS */}
      {activeSubTab === 'methods' && (
        <div className="space-y-3">
          {filteredMethods.length === 0 ? (
            <div className="neu-inset rounded-2xl p-8 text-center bg-[#E3E8EF] space-y-2">
              <Truck className="w-8 h-8 text-[#4E5C70] mx-auto opacity-50" />
              <p className="text-xs font-bold text-[#2D3A4E]">Способы доставки не найдены</p>
              <p className="text-[11px] text-[#4E5C70]">Попробуйте изменить поисковый запрос или добавьте новый способ</p>
              <button
                type="button"
                onClick={handleOpenAddMethod}
                className="mt-2 px-3 py-1.5 neu-button rounded-xl text-xs font-bold text-accent"
              >
                + Добавить способ доставки
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredMethods.map((method) => {
                const isActive = method.isActive !== false;
                return (
                  <div
                    key={method.id}
                    className={`neu-flat rounded-2xl p-4 transition-all space-y-3 relative ${
                      !isActive ? 'opacity-60 grayscale-[30%]' : ''
                    }`}
                  >
                    {/* Header Row: Icon, Title, Status & Actions */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                            isActive
                              ? 'neu-pill-active'
                              : 'neu-button text-[#4E5C70]'
                          }`}
                        >
                          {renderMethodIcon(method.icon, 'w-5 h-5')}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h4 className="text-xs sm:text-sm font-black text-[#2D3A4E] truncate">
                              {method.title}
                            </h4>
                            {method.highlightBadge && (
                              <span className="neu-fill-accent text-white text-[11px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                                {method.highlightBadge}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] font-bold text-[#4E5C70] mt-0.5">
                            Срок: <span className="text-[#2D3A4E]">{method.duration}</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {/* Active toggle */}
                        <button
                          type="button"
                          onClick={(e) => handleToggleMethodActive(method.id, e)}
                          className={`p-1.5 rounded-xl transition-all cursor-pointer ${
                            isActive
                              ? 'neu-button text-success hover:text-success'
                              : 'neu-inset text-[#4E5C70]'
                          }`}
                          title={isActive ? 'Отключить способ' : 'Включить способ'}
                        >
                          <span className={`w-2 h-2 rounded-full block ${isActive ? 'bg-success' : 'bg-[#BAC5D5]'}`} />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenEditMethod(method)}
                          className="p-1.5 neu-button rounded-xl text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer"
                          title="Редактировать способ доставки"
                          aria-label="Редактировать способ доставки"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => setDeletingMethodId(method.id)}
                          className="p-1.5 neu-button-danger rounded-xl cursor-pointer"
                          title="Удалить способ доставки"
                          aria-label="Удалить способ доставки"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Method Description & Details */}
                    {method.description && (
                      <p className="text-[11px] text-[#4E5C70] leading-snug line-clamp-2">
                        {method.description}
                      </p>
                    )}

                    {/* Footer Row: Pricing & Badges */}
                    <div className="pt-2 border-t border-[#BAC5D5]/40 flex items-center justify-between text-xs flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-[#4E5C70]">Стоимость:</span>
                        <span
                          className={`font-black ${
                            method.price === 0 ? 'text-success font-extrabold' : 'text-[#2D3A4E]'
                          }`}
                        >
                          {method.price === 0 ? 'Бесплатно' : `${method.price.toLocaleString()} ₽`}
                        </span>
                      </div>

                      {method.freeThreshold !== undefined && method.freeThreshold > 0 && (
                        <span className="text-[11px] font-bold text-success neu-inset px-2 py-0.5 rounded-lg bg-[#E3E8EF]">
                          Бесплатно от {method.freeThreshold.toLocaleString()} ₽
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* CONTENT: SUBTAB 2 - PICKUP POINTS (САМОВЫВОЗ) */}
      {activeSubTab === 'pickup_points' && (
        <div className="space-y-3">
          {filteredPoints.length === 0 ? (
            <div className="neu-inset rounded-2xl p-8 text-center bg-[#E3E8EF] space-y-2">
              <Store className="w-8 h-8 text-[#4E5C70] mx-auto opacity-50" />
              <p className="text-xs font-bold text-[#2D3A4E]">Пункты выдачи не найдены</p>
              <p className="text-[11px] text-[#4E5C70]">
                Добавьте физические адреса бутиков и шоурумов для выбора самовывоза клиентами
              </p>
              <button
                type="button"
                onClick={handleOpenAddPoint}
                className="mt-2 px-3 py-1.5 neu-button rounded-xl text-xs font-bold text-accent"
              >
                + Добавить пункт выдачи
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredPoints.map((point) => {
                const isActive = point.isActive !== false;
                const isDefault = !!point.isDefault;

                return (
                  <div
                    key={point.id}
                    className={`neu-flat rounded-2xl p-4 transition-all space-y-3 relative ${
                      !isActive ? 'opacity-60 grayscale-[30%]' : ''
                    } ${isDefault ? 'ring-1.5 ring-accent/50' : ''}`}
                  >
                    {/* Header: Name, City & Actions */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                            isDefault
                              ? 'neu-button text-accent bg-[#E3E8EF]'
                              : 'neu-inset text-[#4E5C70]'
                          }`}
                        >
                          <Store className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h4 className="text-xs sm:text-sm font-black text-[#2D3A4E] truncate">
                              {point.name}
                            </h4>
                            {isDefault && (
                              <span className="neu-inset text-accent text-[11px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider bg-[#E3E8EF]">
                                Основной адрес
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] font-bold text-accent flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3" />
                            <span>{point.city}</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {!isDefault && (
                          <button
                            type="button"
                            onClick={(e) => handleSetDefaultPoint(point.id, e)}
                            className="p-1.5 neu-button rounded-xl text-[#4E5C70] hover:text-accent cursor-pointer"
                            title="Сделать основным пунктом самовывоза"
                            aria-label="Сделать основным пунктом самовывоза"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleOpenEditPoint(point)}
                          className="p-1.5 neu-button rounded-xl text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer"
                          title="Редактировать пункт выдачи"
                          aria-label="Редактировать пункт выдачи"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => setDeletingPointId(point.id)}
                          className="p-1.5 neu-button-danger rounded-xl cursor-pointer"
                          title="Удалить пункт выдачи"
                          aria-label="Удалить пункт выдачи"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Address Block - Detailed & Readable */}
                    <div className="neu-inset rounded-xl p-3 bg-[#E3E8EF] space-y-1.5">
                      <div className="text-xs font-extrabold text-[#2D3A4E] leading-relaxed">
                        {point.address}
                      </div>

                      {point.metro && (
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-accent">
                          <span className="w-2 h-2 rounded-full bg-accent shrink-0" />
                          <span>м. {point.metro}</span>
                        </div>
                      )}
                    </div>

                    {/* Schedule & Phone */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-[#4E5C70]">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-accent shrink-0" />
                        <span className="truncate">{point.schedule}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-accent shrink-0" />
                        <span className="truncate font-semibold text-[#2D3A4E]">{point.phone}</span>
                      </div>
                    </div>

                    {/* Note / Amenities */}
                    {point.note && (
                      <div className="pt-2 border-t border-[#BAC5D5]/40 text-[11px] text-[#4E5C70] flex items-start gap-1.5">
                        <Info className="w-3 h-3 text-accent shrink-0 mt-0.5" />
                        <span className="leading-snug">{point.note}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================= MODAL: ADD / EDIT DELIVERY METHOD ================= */}
      {isMethodModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#2D3A4E]/40 backdrop-blur-xs animate-in fade-in">
          <div className="neu-modal rounded-3xl p-5 max-w-lg w-full space-y-4 border border-white/80 text-[#2D3A4E] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#BAC5D5]/50 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-accent">
                  <Truck className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-black text-[#2D3A4E]">
                  {editingMethod ? 'Редактировать способ доставки' : 'Новый модуль доставки'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsMethodModalOpen(false)}
                className="w-7 h-7 rounded-full neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer"
                aria-label="Закрыть"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <form onSubmit={handleSaveMethod} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-[#2D3A4E] mb-1">
                  Название способа доставки *
                </label>
                <input
                  type="text"
                  value={formMethodTitle}
                  onChange={(e) => setFormMethodTitle(e.target.value)}
                  placeholder="Курьером до двери, СДЭК, Яндекс Go..."
                  className="w-full neu-inset rounded-xl py-2 px-3 text-[#2D3A4E]"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-[#2D3A4E] mb-1">
                    Срок доставки
                  </label>
                  <input
                    type="text"
                    value={formMethodDuration}
                    onChange={(e) => setFormMethodDuration(e.target.value)}
                    placeholder="1–2 дня, 2–4 часа..."
                    className="w-full neu-inset rounded-xl py-2 px-3 text-[#2D3A4E]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#2D3A4E] mb-1">
                    Базовая стоимость (₽)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="50"
                    value={formMethodPrice}
                    onChange={(e) => setFormMethodPrice(Number(e.target.value))}
                    className="w-full neu-inset rounded-xl py-2 px-3 text-[#2D3A4E] font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-[#2D3A4E] mb-1">
                    Тип модуля
                  </label>
                  <select
                    value={formMethodType}
                    onChange={(e) => setFormMethodType(e.target.value as any)}
                    className="w-full neu-inset rounded-xl py-2 px-3 text-[#2D3A4E] bg-[#E3E8EF]"
                  >
                    <option value="courier">Курьерская доставка</option>
                    <option value="pickup">Самовывоз (ПВЗ / Бутик)</option>
                    <option value="express">Экспресс-доставка</option>
                    <option value="post">Почта России</option>
                    <option value="custom">Транспортная компания (СДЭК и др.)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#2D3A4E] mb-1">
                    Иконка модуля
                  </label>
                  <div className="grid grid-cols-5 gap-1.5 p-1 neu-flat-sm rounded-xl bg-[#E3E8EF]">
                    {[
                      { id: 'Bike', icon: Bike },
                      { id: 'Store', icon: Store },
                      { id: 'Truck', icon: Truck },
                      { id: 'Zap', icon: Zap },
                      { id: 'Mail', icon: Mail },
                    ].map((ic) => {
                      const IconComp = ic.icon;
                      const isSel = formMethodIcon === ic.id;
                      return (
                        <button
                          key={ic.id}
                          type="button"
                          onClick={() => setFormMethodIcon(ic.id)}
                          className={`py-1.5 flex items-center justify-center rounded-lg transition-all cursor-pointer ${
                            isSel ? 'neu-pill-active' : 'text-[#4E5C70] hover:text-[#2D3A4E]'
                          }`}
                        >
                          <IconComp className="w-4 h-4" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-[#2D3A4E] mb-1">
                    Бесплатно при заказе от (₽)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="500"
                    value={formMethodFreeThreshold ?? ''}
                    onChange={(e) =>
                      setFormMethodFreeThreshold(e.target.value ? Number(e.target.value) : undefined)
                    }
                    placeholder="Например: 5000"
                    className="w-full neu-inset rounded-xl py-2 px-3 text-[#2D3A4E]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#2D3A4E] mb-1">
                    Бейдж-метка (опционально)
                  </label>
                  <input
                    type="text"
                    value={formMethodBadge}
                    onChange={(e) => setFormMethodBadge(e.target.value)}
                    placeholder="Удобно, Быстро, Хит..."
                    className="w-full neu-inset rounded-xl py-2 px-3 text-[#2D3A4E]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#2D3A4E] mb-1">
                  Подробное описание и условия для покупателя
                </label>
                <textarea
                  rows={2}
                  value={formMethodDesc}
                  onChange={(e) => setFormMethodDesc(e.target.value)}
                  placeholder="Примерка до 15 минут, оплата картой курьеру..."
                  className="w-full neu-inset rounded-xl py-2 px-3 text-[#2D3A4E] resize-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="formMethodIsActive"
                  checked={formMethodIsActive}
                  onChange={(e) => setFormMethodIsActive(e.target.checked)}
                  className="rounded text-accent focus:ring-0 w-4 h-4 cursor-pointer"
                />
                <label htmlFor="formMethodIsActive" className="text-xs font-bold text-[#2D3A4E] cursor-pointer">
                  Модуль активен и отображается при оформлении заказа
                </label>
              </div>

              <div className="flex gap-2 pt-2 border-t border-[#BAC5D5]/50">
                <button
                  type="button"
                  onClick={() => setIsMethodModalOpen(false)}
                  className="flex-1 py-2.5 neu-button rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 neu-button-accent rounded-xl text-xs font-black text-white cursor-pointer active:scale-95 transition-transform"
                >
                  {editingMethod ? 'Сохранить изменения' : 'Создать модуль'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: ADD / EDIT PICKUP POINT ================= */}
      {isPointModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#2D3A4E]/40 backdrop-blur-xs animate-in fade-in">
          <div className="neu-modal rounded-3xl p-5 max-w-lg w-full space-y-4 border border-white/80 text-[#2D3A4E] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#BAC5D5]/50 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-accent">
                  <Store className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-black text-[#2D3A4E]">
                  {editingPoint ? 'Редактировать пункт самовывоза' : 'Новый пункт выдачи заказов'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsPointModalOpen(false)}
                className="w-7 h-7 rounded-full neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer"
                aria-label="Закрыть"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <form onSubmit={handleSavePoint} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-[#2D3A4E] mb-1">
                  Название бутика / пункта *
                </label>
                <input
                  type="text"
                  value={formPointName}
                  onChange={(e) => setFormPointName(e.target.value)}
                  placeholder="Флагманский бутик (Москва-Сити)"
                  className="w-full neu-inset rounded-xl py-2 px-3 text-[#2D3A4E]"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-[#2D3A4E] mb-1">
                    Город *
                  </label>
                  <input
                    type="text"
                    value={formPointCity}
                    onChange={(e) => setFormPointCity(e.target.value)}
                    placeholder="Москва, Санкт-Петербург..."
                    className="w-full neu-inset rounded-xl py-2 px-3 text-[#2D3A4E]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#2D3A4E] mb-1">
                    Станция метро (опционально)
                  </label>
                  <input
                    type="text"
                    value={formPointMetro}
                    onChange={(e) => setFormPointMetro(e.target.value)}
                    placeholder="Деловой центр, Выставочная..."
                    className="w-full neu-inset rounded-xl py-2 px-3 text-[#2D3A4E]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#2D3A4E] mb-1">
                  Точный полный адрес для клиента *
                </label>
                <textarea
                  rows={2}
                  value={formPointAddress}
                  onChange={(e) => setFormPointAddress(e.target.value)}
                  placeholder="Пресненская наб., 12, Башня Федерация Восток, 45 этаж, бутик 4502"
                  className="w-full neu-inset rounded-xl py-2 px-3 text-[#2D3A4E] resize-none font-medium"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-[#2D3A4E] mb-1">
                    График работы
                  </label>
                  <input
                    type="text"
                    value={formPointSchedule}
                    onChange={(e) => setFormPointSchedule(e.target.value)}
                    placeholder="Ежедневно 10:00 – 22:00"
                    className="w-full neu-inset rounded-xl py-2 px-3 text-[#2D3A4E]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#2D3A4E] mb-1">
                    Контактный телефон
                  </label>
                  <input
                    type="text"
                    value={formPointPhone}
                    onChange={(e) => setFormPointPhone(e.target.value)}
                    placeholder="+7 (495) 123-45-67"
                    className="w-full neu-inset rounded-xl py-2 px-3 text-[#2D3A4E]"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#2D3A4E] mb-1">
                  Ориентир, вход и условия примерки
                </label>
                <textarea
                  rows={2}
                  value={formPointNote}
                  onChange={(e) => setFormPointNote(e.target.value)}
                  placeholder="Вход через центральный ресепшн. Примерка до 5 вещей, кофе, подгонка по фигуре..."
                  className="w-full neu-inset rounded-xl py-2 px-3 text-[#2D3A4E] resize-none"
                />
              </div>

              <div className="space-y-1.5 pt-1">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="formPointIsDefault"
                    checked={formPointIsDefault}
                    onChange={(e) => setFormPointIsDefault(e.target.checked)}
                    className="rounded text-accent focus:ring-0 w-4 h-4 cursor-pointer"
                  />
                  <label htmlFor="formPointIsDefault" className="text-xs font-bold text-[#2D3A4E] cursor-pointer">
                    Основной пункт самовывоза (по умолчанию)
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="formPointIsActive"
                    checked={formPointIsActive}
                    onChange={(e) => setFormPointIsActive(e.target.checked)}
                    className="rounded text-accent focus:ring-0 w-4 h-4 cursor-pointer"
                  />
                  <label htmlFor="formPointIsActive" className="text-xs font-bold text-[#2D3A4E] cursor-pointer">
                    Пункт активен и доступен для выбора покупателями
                  </label>
                </div>
              </div>

              <div className="flex gap-2 pt-2 border-t border-[#BAC5D5]/50">
                <button
                  type="button"
                  onClick={() => setIsPointModalOpen(false)}
                  className="flex-1 py-2.5 neu-button rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 neu-button-accent rounded-xl text-xs font-black text-white cursor-pointer active:scale-95 transition-transform"
                >
                  {editingPoint ? 'Сохранить изменения' : 'Добавить пункт'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= CONFIRM DELETE MODALS ================= */}
      {deletingMethodId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2D3A4E]/40 backdrop-blur-xs animate-in fade-in">
          <div className="neu-modal rounded-3xl p-5 max-w-sm w-full space-y-4 border border-white/80 text-[#2D3A4E]">
            <div className="flex items-center gap-2.5 text-danger">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <h4 className="text-sm font-black">Удалить способ доставки?</h4>
            </div>
            <p className="text-xs text-[#4E5C70]">
              Этот способ доставки перестанет отображаться при оформлении заказов на сайте.
            </p>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingMethodId(null)}
                className="flex-1 py-2 neu-button rounded-xl text-xs font-bold text-[#4E5C70]"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => handleDeleteMethod(deletingMethodId)}
                className="neu-button-danger flex-1 py-2 rounded-xl text-xs font-black cursor-pointer"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}

      {deletingPointId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2D3A4E]/40 backdrop-blur-xs animate-in fade-in">
          <div className="neu-modal rounded-3xl p-5 max-w-sm w-full space-y-4 border border-white/80 text-[#2D3A4E]">
            <div className="flex items-center gap-2.5 text-danger">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <h4 className="text-sm font-black">Удалить пункт самовывоза?</h4>
            </div>
            <p className="text-xs text-[#4E5C70]">
              Пункт выдачи будет удален из списка доступных адресов для самовывоза клиентами.
            </p>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingPointId(null)}
                className="flex-1 py-2 neu-button rounded-xl text-xs font-bold text-[#4E5C70]"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => handleDeletePoint(deletingPointId)}
                className="neu-button-danger flex-1 py-2 rounded-xl text-xs font-black cursor-pointer"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
