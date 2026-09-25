import React, { useState, useRef } from 'react';
import {
  Image as ImageIcon,
  ImagePlus,
  Upload,
  Loader2,
  Maximize2,
  Plus,
  Trash2,
  Check,
  X,
  ExternalLink,
  Pencil,
  Sparkles,
  Layers,
  ArrowUpRight,
  Eye,
  Calendar,
  Clock,
  Smartphone,
  Monitor,
  CheckCircle2,
  AlertTriangle,
  Play,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  GripVertical,
} from 'lucide-react';
import { BannerSlide, Product, PromoCode } from '../../types';
import { CATEGORIES } from '../../data/products';
import { NeumorphicSelect } from '../NeumorphicSelect';
import { processImageFiles } from '../../utils/imageUpload';

interface AdminBannersTabProps {
  banners: BannerSlide[];
  products?: Product[];
  promos?: PromoCode[];
  onUpdateBanners: (banners: BannerSlide[]) => void;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

export const AdminBannersTab: React.FC<AdminBannersTabProps> = ({
  banners,
  products = [],
  promos = [],
  onUpdateBanners,
  onShowToast,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewDevice, setPreviewDevice] = useState<'mobile' | 'desktop'>('mobile');

  // Move banner position in list (reordering/sorting)
  const handleMoveBanner = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === banners.length - 1) return;

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    const reordered = [...banners];
    const item = reordered.splice(index, 1)[0];
    reordered.splice(newIndex, 0, item);

    onUpdateBanners(reordered);
    onShowToast(`Баннер перенесен на позицию ${newIndex + 1}`, 'success');
  };

  // Form Fields
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [btnText, setBtnText] = useState('Смотреть');
  const [image, setImage] = useState('');
  const [mobileImage, setMobileImage] = useState('');
  const [desktopImage, setDesktopImage] = useState('');
  const mobileFileInputRef = useRef<HTMLInputElement | null>(null);
  const desktopFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploadingMobile, setIsUploadingMobile] = useState(false);
  const [isUploadingDesktop, setIsUploadingDesktop] = useState(false);
  const [previewZoomImage, setPreviewZoomImage] = useState<string | null>(null);
  const [actionType, setActionType] = useState<'category' | 'product' | 'promo' | 'catalog'>('category');
  const [targetCategory, setTargetCategory] = useState<string>('all');
  const [targetProductId, setTargetProductId] = useState<string>('');
  const [targetPromoCode, setTargetPromoCode] = useState<string>('');
  const [badge, setBadge] = useState('АКЦИЯ');

  // Scheduling Fields
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const presetImages = [
    {
      label: 'Мужской костюм / Премиум',
      mobile: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&q=80&w=600',
      desktop: 'https://images.unsplash.com/photo-1490578474895-699cd4e2cf59?auto=format&fit=crop&q=80&w=1400',
    },
    {
      label: 'Льняная рубашка',
      mobile: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&q=80&w=600',
      desktop: 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&q=80&w=1400',
    },
    {
      label: 'Осенняя куртка / Верхняя одежда',
      mobile: 'https://images.unsplash.com/photo-1548883354-7622d03aca27?auto=format&fit=crop&q=80&w=600',
      desktop: 'https://images.unsplash.com/photo-1544441893-675973e31985?auto=format&fit=crop&q=80&w=1400',
    },
    {
      label: 'Поло и футболки',
      mobile: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&q=80&w=600',
      desktop: 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=1400',
    },
    {
      label: 'Брюки чинос / Casual',
      mobile: 'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?auto=format&fit=crop&q=80&w=600',
      desktop: 'https://images.unsplash.com/photo-1479064555552-3ef4979f8908?auto=format&fit=crop&q=80&w=1400',
    },
  ];

  const resetForm = () => {
    setTitle('');
    setSubtitle('');
    setBtnText('Смотреть');
    setImage('');
    setMobileImage('');
    setDesktopImage('');
    setActionType('category');
    setTargetCategory('all');
    setTargetProductId('');
    setTargetPromoCode('');
    setBadge('');
    setScheduleEnabled(false);
    setStartDate('');
    setEndDate('');
    setIsCreating(false);
    setEditingId(null);
  };

  const handleOpenEdit = (slide: BannerSlide) => {
    setEditingId(slide.id);
    setTitle(slide.title);
    setSubtitle(slide.subtitle);
    setBtnText(slide.btnText);
    setImage(slide.image);
    setMobileImage(slide.mobileImage || slide.image);
    setDesktopImage(slide.desktopImage || slide.image);
    setActionType(slide.actionType || (slide.targetProductId ? 'product' : slide.targetPromoCode ? 'promo' : 'category'));
    setTargetCategory(slide.targetCategory || 'all');
    setTargetProductId(slide.targetProductId || '');
    setTargetPromoCode(slide.targetPromoCode || '');
    setBadge(slide.badge || '');
    setScheduleEnabled(Boolean(slide.scheduleEnabled));
    setStartDate(slide.startDate || '');
    setEndDate(slide.endDate || '');
    setIsCreating(true);
  };

  const handleMobileFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setIsUploadingMobile(true);
      try {
        const processed = await processImageFiles(e.target.files);
        if (processed.length > 0) {
          setMobileImage(processed[0]);
          setImage((prev) => prev || processed[0]);
          onShowToast('Мобильное фото загружено и сжато', 'success');
        }
      } catch (err) {
        console.error(err);
        onShowToast('Ошибка загрузки фото', 'error');
      } finally {
        setIsUploadingMobile(false);
        if (mobileFileInputRef.current) mobileFileInputRef.current.value = '';
      }
    }
  };

  const handleDesktopFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setIsUploadingDesktop(true);
      try {
        const processed = await processImageFiles(e.target.files);
        if (processed.length > 0) {
          setDesktopImage(processed[0]);
          setImage((prev) => prev || processed[0]);
          onShowToast('Десктопное фото (16:9) загружено', 'success');
        }
      } catch (err) {
        console.error(err);
        onShowToast('Ошибка загрузки фото', 'error');
      } finally {
        setIsUploadingDesktop(false);
        if (desktopFileInputRef.current) desktopFileInputRef.current.value = '';
      }
    }
  };

  const handleClearMobileImage = () => {
    setMobileImage('');
    if (image === mobileImage) {
      setImage(desktopImage || '');
    }
    onShowToast('Мобильное фото баннера удалено', 'info');
  };

  const handleClearDesktopImage = () => {
    setDesktopImage('');
    if (image === desktopImage) {
      setImage(mobileImage || '');
    }
    onShowToast('Десктопное фото баннера удалено', 'info');
  };

  const applySchedulePreset = (preset: '24h' | 'weekend' | 'black_friday' | 'week') => {
    setScheduleEnabled(true);
    const now = new Date();
    const formatDT = (d: Date) => d.toISOString().slice(0, 16);

    const startStr = formatDT(now);
    let end = new Date(now);

    if (preset === '24h') {
      end.setDate(end.getDate() + 1);
    } else if (preset === 'weekend') {
      end.setDate(end.getDate() + 3);
    } else if (preset === 'black_friday') {
      end.setHours(23, 59, 0, 0);
    } else if (preset === 'week') {
      end.setDate(end.getDate() + 7);
    }

    setStartDate(startStr);
    setEndDate(formatDT(end));
    onShowToast('Пресет расписания применен', 'info');
  };

  const handleSaveBanner = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      onShowToast('Введите заголовок баннера', 'error');
      return;
    }

    const finalImage =
      mobileImage.trim() ||
      image.trim() ||
      'https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&q=80&w=800';

    const finalDesktop =
      desktopImage.trim() ||
      finalImage;

    if (editingId) {
      const updated = banners.map((b) =>
        b.id === editingId
          ? {
              ...b,
              title: title.trim(),
              subtitle: subtitle.trim(),
              btnText: btnText.trim() || 'В каталог',
              image: finalImage,
              mobileImage: finalImage,
              desktopImage: finalDesktop,
              actionType,
              targetCategory: actionType === 'category' ? targetCategory : undefined,
              targetProductId: actionType === 'product' ? targetProductId : undefined,
              targetPromoCode: actionType === 'promo' ? targetPromoCode : undefined,
              badge: badge.trim() || undefined,
              scheduleEnabled,
              startDate: scheduleEnabled && startDate ? startDate : undefined,
              endDate: scheduleEnabled && endDate ? endDate : undefined,
            }
          : b
      );
      onUpdateBanners(updated);
      onShowToast('Баннер успешно обновлен', 'success');
    } else {
      const newBanner: BannerSlide = {
        id: `banner-${Date.now()}`,
        title: title.trim(),
        subtitle: subtitle.trim(),
        btnText: btnText.trim() || 'Смотреть',
        image: finalImage,
        mobileImage: finalImage,
        desktopImage: finalDesktop,
        actionType,
        targetCategory: actionType === 'category' ? targetCategory : undefined,
        targetProductId: actionType === 'product' ? targetProductId : undefined,
        targetPromoCode: actionType === 'promo' ? targetPromoCode : undefined,
        badge: badge.trim() || undefined,
        active: true,
        scheduleEnabled,
        startDate: scheduleEnabled && startDate ? startDate : undefined,
        endDate: scheduleEnabled && endDate ? endDate : undefined,
      };
      onUpdateBanners([...banners, newBanner]);
      onShowToast('Новый промо-баннер добавлен в слайдер', 'success');
    }

    resetForm();
  };

  const handleToggleActive = (id: string) => {
    const updated = banners.map((b) =>
      b.id === id ? { ...b, active: !b.active } : b
    );
    onUpdateBanners(updated);
    const target = updated.find((b) => b.id === id);
    onShowToast(
      `Баннер «${target?.title}» ${target?.active ? 'показывается' : 'скрыт'}`,
      'info'
    );
  };

  const handleDelete = (id: string) => {
    const target = banners.find((b) => b.id === id);
    const updated = banners.filter((b) => b.id !== id);
    onUpdateBanners(updated);
    onShowToast(`Баннер «${target?.title || ''}» удален`, 'info');
  };

  const getBannerScheduleStatus = (b: BannerSlide) => {
    if (!b.scheduleEnabled || (!b.startDate && !b.endDate)) {
      return { status: 'always', label: 'Бессрочно', color: 'text-[#5C6B80]' };
    }
    const now = Date.now();
    const start = b.startDate ? new Date(b.startDate).getTime() : 0;
    const end = b.endDate ? new Date(b.endDate).getTime() : Infinity;

    if (now < start) {
      return { status: 'scheduled', label: 'Запланирован', color: 'text-amber-600' };
    }
    if (now > end) {
      return { status: 'expired', label: 'Завершен', color: 'text-[#7E525E]' };
    }
    return { status: 'live', label: 'В эфире (по расписанию)', color: 'text-emerald-600' };
  };

  return (
    <div className="space-y-4 text-[#2D3A4E] w-full min-w-0 max-w-full">
      {/* Header & Create Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="min-w-0">
          <h3 className="text-xs font-black uppercase tracking-wider text-[#2D3A4E] flex items-center gap-1.5">
            <ImageIcon className="w-4 h-4 text-[#5F6ED0] shrink-0" />
            <span>Управление промо-баннерами</span>
          </h3>
          <p className="text-[11px] text-[#5C6B80] truncate">
            Планировщик публикаций и адаптивные форматы для мобильных и десктоп экранов
          </p>
        </div>

        <button
          onClick={() => {
            if (isCreating) {
              resetForm();
            } else {
              resetForm();
              setIsCreating(true);
            }
          }}
          className={`py-2 px-3.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0 neu-inset active:scale-95 ${
            isCreating
              ? 'text-[#5C6B80]'
              : 'text-[#5F6ED0] hover:text-[#4F5DC0] bg-[#E3E8EF]'
          }`}
        >
          {isCreating ? (
            <>
              <X className="w-3.5 h-3.5" />
              <span>Отмена</span>
            </>
          ) : (
            <>
              <Plus className="w-3.5 h-3.5 text-[#5F6ED0]" />
              <span>Новый баннер</span>
            </>
          )}
        </button>
      </div>

      {/* Editor & Creation Form */}
      {isCreating && (
        <form
          onSubmit={handleSaveBanner}
          className="neu-inset rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 space-y-4 bg-[#E3E8EF] border border-[#5F6ED0]/30 animate-in fade-in slide-in-from-top-2 duration-200"
        >
          <div className="flex items-center justify-between border-b border-[#BAC5D5]/50 pb-2.5">
            <span className="text-xs font-black text-[#5F6ED0] uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{editingId ? 'Редактирование баннера' : 'Создание нового слайда'}</span>
            </span>

            {/* Live Device Preview Switcher in Form */}
            <div className="flex items-center gap-1 neu-inset p-0.5 rounded-xl bg-[#E3E8EF]">
              <button
                type="button"
                onClick={() => setPreviewDevice('mobile')}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all ${
                  previewDevice === 'mobile' ? 'neu-flat text-[#5F6ED0] bg-[#E3E8EF]' : 'text-[#5C6B80]'
                }`}
              >
                <Smartphone className="w-3 h-3" />
                <span>Мобайл</span>
              </button>
              <button
                type="button"
                onClick={() => setPreviewDevice('desktop')}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all ${
                  previewDevice === 'desktop' ? 'neu-flat text-[#5F6ED0] bg-[#E3E8EF]' : 'text-[#5C6B80]'
                }`}
              >
                <Monitor className="w-3 h-3" />
                <span>Десктоп</span>
              </button>
            </div>
          </div>

          {/* Row 1: Title, Subtitle, Button Text & Badge */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-[#5C6B80] block mb-1">
                Главный заголовок *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Премиум льняные рубашки"
                className="w-full px-3 py-2.5 neu-inset rounded-xl text-xs text-[#2D3A4E] font-extrabold focus:outline-none bg-[#E3E8EF]"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-[#5C6B80] block mb-1">
                Подзаголовок / Описание
              </label>
              <input
                type="text"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                placeholder="Натуральный 100% лён и дышащие ткани"
                className="w-full px-3 py-2.5 neu-inset rounded-xl text-xs text-[#2D3A4E] focus:outline-none bg-[#E3E8EF]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-[#5C6B80] block mb-1">
                Текст кнопки действия
              </label>
              <input
                type="text"
                value={btnText}
                onChange={(e) => setBtnText(e.target.value)}
                placeholder="Смотреть"
                className="w-full px-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E] font-bold focus:outline-none bg-[#E3E8EF]"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-[#5C6B80] block mb-1">
                Бейдж / Стикер
              </label>
              <input
                type="text"
                value={badge}
                onChange={(e) => setBadge(e.target.value)}
                placeholder="NEW, ХИТ, 100% ЛЁН"
                className="w-full px-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E] focus:outline-none bg-[#E3E8EF]"
              />
            </div>
          </div>

          {/* Section: Deeplink Action Type */}
          <div className="p-3.5 neu-inset rounded-2xl space-y-3 bg-[#E3E8EF]">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black text-[#2D3A4E] uppercase tracking-wider flex items-center gap-1.5">
                <ArrowUpRight className="w-3.5 h-3.5 text-[#5F6ED0]" />
                <span>Целевое действие при клике (Диплинк):</span>
              </span>
              <span className="text-[10px] text-[#5C6B80] font-semibold">
                Куда перейдет покупатель
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {[
                { id: 'category', label: 'Категория' },
                { id: 'product', label: 'Товар' },
                { id: 'promo', label: 'Промокод' },
                { id: 'catalog', label: 'Весь каталог' },
              ].map((act) => (
                <button
                  key={act.id}
                  type="button"
                  onClick={() => setActionType(act.id as any)}
                  className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-center ${
                    actionType === act.id
                      ? 'neu-button text-[#5F6ED0] font-black'
                      : 'text-[#5C6B80] hover:text-[#2D3A4E]'
                  }`}
                >
                  {act.label}
                </button>
              ))}
            </div>

            {/* Sub-inputs depending on action type */}
            {actionType === 'category' && (
              <div className="space-y-1 pt-1">
                <label className="text-[10px] font-bold text-[#5C6B80] block">
                  Выберите категорию каталога:
                </label>
                <NeumorphicSelect
                  value={targetCategory}
                  onChange={(val) => setTargetCategory(val)}
                  options={[
                    { value: 'all', label: 'Все категории' },
                    ...CATEGORIES.map((c) => ({
                      value: c.id,
                      label: c.name,
                    })),
                  ]}
                />
              </div>
            )}

            {actionType === 'product' && (
              <div className="space-y-1 pt-1">
                <label className="text-[10px] font-bold text-[#5C6B80] block">
                  Выберите конкретный товар для перехода в карточку:
                </label>
                <NeumorphicSelect
                  value={targetProductId}
                  onChange={(val) => setTargetProductId(val)}
                  options={[
                    { value: '', label: '— Выберите товар из списка —' },
                    ...products.map((p) => ({
                      value: p.id,
                      label: `${p.title} (${p.price.toLocaleString('ru-RU')} ₽)`,
                    })),
                  ]}
                />
              </div>
            )}

            {actionType === 'promo' && (
              <div className="space-y-1 pt-1">
                <label className="text-[10px] font-bold text-[#5C6B80] block">
                  Выберите промокод, который автоматически активируется при клике:
                </label>
                <NeumorphicSelect
                  value={targetPromoCode}
                  onChange={(val) => setTargetPromoCode(val)}
                  options={[
                    { value: '', label: '— Выберите промокод —' },
                    ...promos.map((p) => ({
                      value: p.code,
                      label: `${p.code} (${p.discountType === 'fixed' ? `-${p.discountValue} ₽` : `-${p.discountPercent || p.discountValue}%`}) - ${p.title}`,
                    })),
                  ]}
                />
              </div>
            )}

            {actionType === 'catalog' && (
              <p className="text-[11px] text-[#5C6B80] font-medium pt-0.5">
                Клик по баннеру откроет главную витрину каталога со всеми новинками.
              </p>
            )}
          </div>

          {/* Section: Adaptive Images (Mobile vs Desktop) with Neumorphic Inset Gallery Upload & Delete */}
          <div className="p-3.5 neu-inset rounded-2xl space-y-3.5 bg-[#E3E8EF] border border-white/60">
            {/* Hidden File Inputs for Device/Gallery Upload */}
            <input
              type="file"
              ref={mobileFileInputRef}
              onChange={handleMobileFileChange}
              accept="image/*"
              className="hidden"
            />
            <input
              type="file"
              ref={desktopFileInputRef}
              onChange={handleDesktopFileChange}
              accept="image/*"
              className="hidden"
            />

            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black text-[#2D3A4E] uppercase tracking-wider flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-[#5F6ED0]" />
                <span>Адаптивные форматы изображений:</span>
              </span>
              <span className="text-[10px] text-[#5C6B80] font-semibold">
                Раздельная загрузка для мобайла и десктопа
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Mobile Image Card */}
              <div className="neu-flat rounded-2xl p-3 bg-[#E3E8EF] border border-white/60 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-[#2D3A4E] flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5 text-[#5F6ED0]" />
                    <span>Версия для смартфонов</span>
                  </label>
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                      mobileImage || image
                        ? 'bg-emerald-100 text-emerald-700 font-extrabold'
                        : 'bg-slate-200 text-[#5C6B80]'
                    }`}
                  >
                    {mobileImage || image ? 'Загружено' : 'Не задано'}
                  </span>
                </div>

                {/* Recessed Inset Preview or Upload Zone */}
                {mobileImage || image ? (
                  <div className="neu-inset rounded-xl p-2 bg-[#E3E8EF] relative group">
                    <div className="relative w-full h-36 rounded-lg overflow-hidden flex items-center justify-center bg-black/5">
                      <img
                        src={mobileImage || image}
                        alt="Мобильный баннер"
                        className="w-full h-full object-cover object-center"
                        referrerPolicy="no-referrer"
                      />

                      {/* Overlay Controls */}
                      <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setPreviewZoomImage(mobileImage || image)}
                          className="w-6 h-6 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center shadow-md active:scale-90 transition-transform cursor-pointer"
                          title="Увеличить"
                        >
                          <Maximize2 className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={handleClearMobileImage}
                          className="w-6 h-6 rounded-full bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center shadow-md active:scale-90 transition-transform cursor-pointer"
                          title="Удалить фото"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="absolute bottom-1.5 left-1.5 bg-black/60 backdrop-blur-xs text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md">
                        Мобайл (4:5 / 9:16)
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => mobileFileInputRef.current?.click()}
                    className="neu-inset rounded-xl p-4 sm:p-5 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-white/40 active:scale-[0.99] transition-all border border-dashed border-[#5F6ED0]/40 group"
                  >
                    {isUploadingMobile ? (
                      <div className="flex flex-col items-center py-2">
                        <Loader2 className="w-6 h-6 text-[#5F6ED0] animate-spin mb-1.5" />
                        <span className="text-[11px] font-bold text-[#5C6B80]">Сжатие и обработка...</span>
                      </div>
                    ) : (
                      <>
                        <div className="w-9 h-9 rounded-xl neu-flat bg-[#E3E8EF] flex items-center justify-center text-[#5F6ED0] mb-1.5 group-hover:scale-105 transition-transform">
                          <ImagePlus className="w-5 h-5" />
                        </div>
                        <span className="text-xs font-black text-[#5F6ED0]">
                          Загрузить из галереи / устройства
                        </span>
                        <span className="text-[10px] text-[#5C6B80] mt-0.5">
                          Нажмите для выбора (JPG, PNG, WebP)
                        </span>
                      </>
                    )}
                  </div>
                )}

                {/* Upload & Action Buttons */}
                <div className="flex items-center gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => mobileFileInputRef.current?.click()}
                    disabled={isUploadingMobile}
                    className="flex-1 h-7 px-2.5 rounded-lg neu-button text-[10px] font-bold text-[#5F6ED0] hover:text-[#4A58B8] active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1 shrink-0"
                  >
                    <Upload className="w-3 h-3" />
                    <span>{mobileImage || image ? 'Заменить' : 'Выбрать файл'}</span>
                  </button>

                  {(mobileImage || image) && (
                    <button
                      type="button"
                      onClick={handleClearMobileImage}
                      className="h-7 px-2.5 rounded-lg neu-button text-[10px] font-bold text-rose-600 hover:text-rose-700 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1 shrink-0"
                      title="Удалить фото"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Удалить</span>
                    </button>
                  )}
                </div>

                {/* Manual URL Input */}
                <div className="space-y-0.5 pt-0.5">
                  <span className="text-[9px] font-bold text-[#5C6B80]">Или прямая ссылка:</span>
                  <input
                    type="url"
                    value={mobileImage || image}
                    onChange={(e) => {
                      setMobileImage(e.target.value);
                      setImage(e.target.value);
                    }}
                    placeholder="https://images.unsplash.com/..."
                    className="w-full h-7 px-2.5 neu-inset rounded-lg text-[10px] text-[#2D3A4E] focus:outline-none bg-[#E3E8EF] placeholder:text-[#5C6B80]/50"
                  />
                </div>
              </div>

              {/* Desktop Image Card */}
              <div className="neu-flat rounded-2xl p-3 bg-[#E3E8EF] border border-white/60 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-[#2D3A4E] flex items-center gap-1.5">
                    <Monitor className="w-3.5 h-3.5 text-[#5F6ED0]" />
                    <span>Широкоформатная десктоп-версия (16:9)</span>
                  </label>
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                      desktopImage
                        ? 'bg-emerald-100 text-emerald-700 font-extrabold'
                        : 'bg-slate-200 text-[#5C6B80]'
                    }`}
                  >
                    {desktopImage ? 'Загружено' : 'Не задано'}
                  </span>
                </div>

                {/* Recessed Inset Preview or Upload Zone */}
                {desktopImage ? (
                  <div className="neu-inset rounded-xl p-2 bg-[#E3E8EF] relative group">
                    <div className="relative w-full h-36 rounded-lg overflow-hidden flex items-center justify-center bg-black/5">
                      <img
                        src={desktopImage}
                        alt="Десктопный баннер"
                        className="w-full h-full object-cover object-center"
                        referrerPolicy="no-referrer"
                      />

                      {/* Overlay Controls */}
                      <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setPreviewZoomImage(desktopImage)}
                          className="w-6 h-6 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center shadow-md active:scale-90 transition-transform cursor-pointer"
                          title="Увеличить"
                        >
                          <Maximize2 className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={handleClearDesktopImage}
                          className="w-6 h-6 rounded-full bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center shadow-md active:scale-90 transition-transform cursor-pointer"
                          title="Удалить фото"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="absolute bottom-1.5 left-1.5 bg-black/60 backdrop-blur-xs text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md">
                        Десктоп (16:9)
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => desktopFileInputRef.current?.click()}
                    className="neu-inset rounded-xl p-4 sm:p-5 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-white/40 active:scale-[0.99] transition-all border border-dashed border-[#5F6ED0]/40 group"
                  >
                    {isUploadingDesktop ? (
                      <div className="flex flex-col items-center py-2">
                        <Loader2 className="w-6 h-6 text-[#5F6ED0] animate-spin mb-1.5" />
                        <span className="text-[11px] font-bold text-[#5C6B80]">Сжатие и обработка...</span>
                      </div>
                    ) : (
                      <>
                        <div className="w-9 h-9 rounded-xl neu-flat bg-[#E3E8EF] flex items-center justify-center text-[#5F6ED0] mb-1.5 group-hover:scale-105 transition-transform">
                          <ImagePlus className="w-5 h-5" />
                        </div>
                        <span className="text-xs font-black text-[#5F6ED0]">
                          Загрузить из галереи / устройства
                        </span>
                        <span className="text-[10px] text-[#5C6B80] mt-0.5">
                          Нажмите для выбора (JPG, PNG, WebP)
                        </span>
                      </>
                    )}
                  </div>
                )}

                {/* Upload & Action Buttons */}
                <div className="flex items-center gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => desktopFileInputRef.current?.click()}
                    disabled={isUploadingDesktop}
                    className="flex-1 h-7 px-2.5 rounded-lg neu-button text-[10px] font-bold text-[#5F6ED0] hover:text-[#4A58B8] active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1 shrink-0"
                  >
                    <Upload className="w-3 h-3" />
                    <span>{desktopImage ? 'Заменить' : 'Выбрать файл'}</span>
                  </button>

                  {desktopImage && (
                    <button
                      type="button"
                      onClick={handleClearDesktopImage}
                      className="h-7 px-2.5 rounded-lg neu-button text-[10px] font-bold text-rose-600 hover:text-rose-700 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1 shrink-0"
                      title="Удалить фото"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Удалить</span>
                    </button>
                  )}
                </div>

                {/* Manual URL Input */}
                <div className="space-y-0.5 pt-0.5">
                  <span className="text-[9px] font-bold text-[#5C6B80]">Или прямая ссылка:</span>
                  <input
                    type="url"
                    value={desktopImage}
                    onChange={(e) => setDesktopImage(e.target.value)}
                    placeholder="https://images.unsplash.com/..."
                    className="w-full h-7 px-2.5 neu-inset rounded-lg text-[10px] text-[#2D3A4E] focus:outline-none bg-[#E3E8EF] placeholder:text-[#5C6B80]/50"
                  />
                </div>
              </div>
            </div>

            {/* Presets Row */}
            <div className="space-y-1.5 pt-1 border-t border-[#BAC5D5]/40">
              <span className="text-[10px] font-bold text-[#5C6B80]">Готовые стильные фотографии:</span>
              <div className="flex flex-wrap gap-1.5">
                {presetImages.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setMobileImage(p.mobile);
                      setImage(p.mobile);
                      setDesktopImage(p.desktop);
                    }}
                    className="neu-button px-2.5 py-1 rounded-xl text-[10px] font-bold text-[#5C6B80] hover:text-[#5F6ED0] cursor-pointer active:scale-95 transition-all"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Section: Publication Scheduler */}
          <div className="p-3.5 neu-inset rounded-2xl space-y-3 bg-[#E3E8EF]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#5F6ED0]" />
                <div>
                  <span className="text-[11px] font-black text-[#2D3A4E] block">
                    Планировщик автоматических публикаций
                  </span>
                  <span className="text-[10px] text-[#5C6B80]">
                    Точный запуск и снятие баннера с витрины в указанные часы (ночные акции, Черная пятница)
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setScheduleEnabled(!scheduleEnabled)}
                className="w-11 h-6 rounded-full neu-inset p-0.5 transition-colors cursor-pointer bg-[#E3E8EF] shrink-0"
              >
                <div
                  className={`w-5 h-5 rounded-full transition-transform neu-flat ${
                    scheduleEnabled ? 'translate-x-5 bg-[#5F6ED0]' : 'translate-x-0 bg-[#BAC5D5]'
                  }`}
                />
              </button>
            </div>

            {scheduleEnabled && (
              <div className="space-y-3 pt-2 border-t border-[#BAC5D5]/50 animate-in fade-in duration-200">
                {/* Fast Presets */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-bold text-[#5C6B80]">Пресеты запуска:</span>
                  <button
                    type="button"
                    onClick={() => applySchedulePreset('24h')}
                    className="neu-button px-2 py-0.5 rounded-lg text-[10px] font-bold text-[#5C6B80] hover:text-[#5F6ED0]"
                  >
                    Flash Sale (24 часа)
                  </button>
                  <button
                    type="button"
                    onClick={() => applySchedulePreset('weekend')}
                    className="neu-button px-2 py-0.5 rounded-lg text-[10px] font-bold text-[#5C6B80] hover:text-[#5F6ED0]"
                  >
                    Выходные (3 дня)
                  </button>
                  <button
                    type="button"
                    onClick={() => applySchedulePreset('black_friday')}
                    className="neu-button px-2 py-0.5 rounded-lg text-[10px] font-bold text-[#5C6B80] hover:text-[#5F6ED0]"
                  >
                    Черная пятница (до полуночи)
                  </button>
                  <button
                    type="button"
                    onClick={() => applySchedulePreset('week')}
                    className="neu-button px-2 py-0.5 rounded-lg text-[10px] font-bold text-[#5C6B80] hover:text-[#5F6ED0]"
                  >
                    Недельная акция (7 дней)
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-[#5C6B80] block mb-1">
                      Дата и время старта публикации
                    </label>
                    <input
                      type="datetime-local"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 neu-flat rounded-xl text-xs text-[#2D3A4E] font-bold focus:outline-none bg-[#E3E8EF]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-[#5C6B80] block mb-1">
                      Дата и время автоматического снятия
                    </label>
                    <input
                      type="datetime-local"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 neu-flat rounded-xl text-xs text-[#2D3A4E] font-bold focus:outline-none bg-[#E3E8EF]"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={resetForm}
              className="h-9 px-4 neu-button rounded-xl text-xs font-bold text-[#5C6B80] hover:text-[#2D3A4E] cursor-pointer transition-all active:scale-95"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="h-9 px-4 neu-button-accent rounded-xl text-xs font-black text-white flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
            >
              <Check className="w-3.5 h-3.5 text-white" />
              <span>{editingId ? 'Сохранить изменения' : 'Опубликовать баннер'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Banners List with Schedule Indicators and Format Badges */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-0.5">
          <p className="text-xs font-bold text-[#5C6B80]">
            Всего баннеров: <strong className="text-[#2D3A4E]">{banners.length}</strong> (активных:{' '}
            {banners.filter((b) => b.active).length})
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {banners.map((slide, index) => {
            const scheduleInfo = getBannerScheduleStatus(slide);

            return (
              <div
                key={slide.id}
                className={`neu-inset rounded-2xl p-3.5 sm:p-4 space-y-3 transition-all bg-[#E3E8EF] border ${
                  slide.active ? 'border-transparent' : 'border-slate-300/80 opacity-75'
                }`}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Order & Reordering Controls */}
                    <div className="flex items-center gap-1 neu-button px-1.5 py-0.5 rounded-xl bg-[#E3E8EF]">
                      <span className="text-[10px] font-black text-[#5F6ED0] px-1 font-mono">
                        #{index + 1}
                      </span>
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => handleMoveBanner(index, 'up')}
                          className={`w-5 h-5 rounded-lg flex items-center justify-center transition-all ${
                            index === 0
                              ? 'text-[#5C6B80]/30 cursor-not-allowed'
                              : 'neu-button text-[#2D3A4E] hover:text-[#5F6ED0] active:scale-90 cursor-pointer'
                          }`}
                          title="Переместить выше"
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={index === banners.length - 1}
                          onClick={() => handleMoveBanner(index, 'down')}
                          className={`w-5 h-5 rounded-lg flex items-center justify-center transition-all ${
                            index === banners.length - 1
                              ? 'text-[#5C6B80]/30 cursor-not-allowed'
                              : 'neu-button text-[#2D3A4E] hover:text-[#5F6ED0] active:scale-90 cursor-pointer'
                          }`}
                          title="Переместить ниже"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <span className="text-xs font-black text-[#2D3A4E] neu-button px-2.5 py-1 rounded-xl bg-[#E3E8EF]">
                      {slide.title}
                    </span>

                    {slide.badge && (
                      <span className="text-[10px] font-bold neu-button-accent text-white px-2 py-0.5 rounded-full">
                        {slide.badge}
                      </span>
                    )}

                    {/* Schedule status badge */}
                    <span
                      className={`text-[10px] font-bold neu-button px-2 py-0.5 rounded-full flex items-center gap-1 bg-[#E3E8EF] ${scheduleInfo.color}`}
                    >
                      <Clock className="w-3 h-3" />
                      {scheduleInfo.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(slide.id)}
                      className={`px-2.5 py-1 rounded-xl text-[10px] font-black transition-all cursor-pointer ${
                        slide.active
                          ? 'neu-button text-emerald-700 bg-[#E3E8EF]'
                          : 'neu-inset text-[#5C6B80] bg-[#E3E8EF]'
                      }`}
                    >
                      {slide.active ? 'Активен' : 'Скрыт'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(slide)}
                      className="w-7 h-7 rounded-xl neu-button flex items-center justify-center text-[#5F6ED0] hover:scale-105 active:scale-95 cursor-pointer"
                      title="Редактировать"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(slide.id)}
                      className="w-7 h-7 rounded-xl neu-button flex items-center justify-center text-[#5C6B80] hover:text-[#7E525E] active:scale-95 cursor-pointer"
                      title="Удалить"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Banner Visual Preview Card */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-center neu-button p-2.5 rounded-xl bg-[#E3E8EF]">
                  <div className="relative w-full h-24 rounded-lg overflow-hidden shrink-0">
                    <img
                      src={slide.desktopImage || slide.image}
                      alt={slide.title}
                      className="w-full h-full object-cover object-center"
                    />
                    <div className="absolute bottom-1 right-1 bg-black/60 backdrop-blur-xs text-white text-[9px] px-1.5 py-0.5 rounded font-mono">
                      {slide.desktopImage ? 'HD + Mobile' : 'Standard'}
                    </div>
                  </div>

                  <div className="sm:col-span-3 space-y-1">
                    <p className="text-xs text-[#5C6B80]">{slide.subtitle}</p>
                    <div className="flex items-center gap-3 text-[10px] text-[#5C6B80] pt-1">
                      <span>Кнопка: <strong className="text-[#2D3A4E]">{slide.btnText}</strong></span>
                      <span>Категория: <strong className="text-[#5F6ED0]">{slide.targetCategory || 'all'}</strong></span>
                      {slide.startDate && (
                        <span>Старт: <strong className="text-[#2D3A4E]">{slide.startDate.replace('T', ' ')}</strong></span>
                      )}
                      {slide.endDate && (
                        <span>Снятие: <strong className="text-[#2D3A4E]">{slide.endDate.replace('T', ' ')}</strong></span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Fullscreen Image Zoom Preview Modal */}
      {previewZoomImage && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setPreviewZoomImage(null)}
        >
          <div
            className="neu-flat rounded-2xl bg-[#E3E8EF] max-w-4xl w-full p-4 relative space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#BAC5D5]/50 pb-2.5">
              <span className="text-xs font-black text-[#2D3A4E] uppercase tracking-wider flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-[#5F6ED0]" />
                <span>Просмотр изображения баннера</span>
              </span>
              <button
                type="button"
                onClick={() => setPreviewZoomImage(null)}
                className="w-7 h-7 rounded-xl neu-button flex items-center justify-center text-[#5C6B80] hover:text-[#2D3A4E] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="neu-inset rounded-xl p-2 bg-[#E3E8EF] flex items-center justify-center max-h-[70vh] overflow-hidden">
              <img
                src={previewZoomImage}
                alt="Banner Preview Full"
                className="max-h-[66vh] max-w-full rounded-lg object-contain"
                referrerPolicy="no-referrer"
              />
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setPreviewZoomImage(null)}
                className="px-4 py-2 rounded-xl neu-button text-xs font-bold text-[#2D3A4E] cursor-pointer"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
