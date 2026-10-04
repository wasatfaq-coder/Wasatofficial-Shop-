import React, { useState } from 'react';
import {
  ChevronDown,
  FileText,
  Layers,
  ListChecks,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  LayoutList,
} from 'lucide-react';
import type {
  CareInstructionItem,
  FabricCompositionItem,
  Product,
  ProductFeature,
  ProductSpec,
} from '../../types';
import {
  CARE_ICON_LABELS,
  DENSITY_UNIT,
  FIT_LABELS,
  compositionToMaterial,
  fabricDensityNumber,
  formatFabricDensity,
} from '../../utils/productAttributes';
import {
  countrySuggestions,
  fiberSuggestions,
  weaveSuggestions,
  withAutoRemainder,
} from '../../utils/cardSuggestions';
import { CARE_SYMBOLS, careSymbolOf, toggleCareSymbol, type CareSymbol } from '../../utils/careSymbols';
import { CareSymbolIcon } from './CareSymbolIcon';
import { ConfirmDialog } from '../ConfirmDialog';
import { NeumorphicSelect } from '../NeumorphicSelect';

/** Product card sections edited in the product form; empty ones are hidden from customers */
export interface ProductCardStructure {
  features: ProductFeature[];
  composition: FabricCompositionItem[];
  /** Density number; «г/м²» is added on save */
  density: string;
  certifications: string[];
  weave: string;
  fit: Product['fit'] | '';
  country: string;
  specs: ProductSpec[];
  care: CareInstructionItem[];
}

export const EMPTY_CARD_STRUCTURE: ProductCardStructure = {
  features: [],
  composition: [],
  density: '',
  certifications: [],
  weave: '',
  fit: '',
  country: '',
  specs: [],
  care: [],
};

export function cardStructureFromProduct(product: Product): ProductCardStructure {
  return {
    features: (product.features ?? []).map((f) => ({ ...f })),
    composition: (product.fabricComposition ?? []).map((c) => ({ ...c })),
    density: fabricDensityNumber(product.fabricDensity),
    certifications: [...(product.certifications ?? [])],
    weave: product.weave ?? '',
    fit: product.fit ?? '',
    country: product.countryOfOrigin ?? '',
    specs: (product.specs ?? []).map((s) => ({ ...s })),
    care: (product.careInstructions ?? []).map((c) => ({ ...c })),
  };
}

/** Product fields for saving: blank rows dropped, empty sections removed (the card then hides them) */
export function cardStructureToProduct(card: ProductCardStructure): Partial<Product> & Pick<Product, 'material'> {
  const text = (value: string) => value.trim() || undefined;
  const list = <T,>(items: T[]) => (items.length > 0 ? items : undefined);
  const fabricComposition = card.composition
    .map((c) => ({ fiber: c.fiber.trim(), percentage: Math.max(0, Math.min(100, Number(c.percentage) || 0)) }))
    .filter((c) => c.fiber && c.percentage > 0);
  return {
    features: list(
      card.features
        .map((f) => ({ title: f.title.trim(), ...(f.text?.trim() ? { text: f.text.trim() } : {}) }))
        .filter((f) => f.title)
    ),
    fabricComposition: list(fabricComposition),
    // The catalog's material filter, search and invoices read the composition as text
    material: compositionToMaterial(fabricComposition),
    fabricDensity: formatFabricDensity(card.density) || undefined,
    certifications: list(card.certifications.map((c) => c.trim()).filter(Boolean)),
    weave: text(card.weave),
    fit: card.fit || undefined,
    countryOfOrigin: text(card.country),
    specs: list(
      card.specs
        .map((s) => ({ label: s.label.trim(), value: s.value.trim() }))
        .filter((s) => s.label && s.value)
    ),
    careInstructions: list(
      card.care
        .map((c) => ({ icon: c.icon, label: c.label.trim(), desc: c.desc.trim() }))
        .filter((c) => c.label)
    ),
  };
}

type SectionId = 'description' | 'composition' | 'specs' | 'care';

interface PendingDelete {
  title: string;
  preview: React.ReactNode;
  run: () => void;
}

interface AdminProductCardStructureProps {
  value: ProductCardStructure;
  onChange: (next: ProductCardStructure) => void;
  /** The description text is edited in its own field below; used to tell whether «Описание» is shown */
  hasDescription: boolean;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
  /** The shop's products: their fibers, countries and weaves become chips (fast product entry, stage 1) */
  suggestFrom?: Pick<Product, 'fabricComposition' | 'countryOfOrigin' | 'weave'>[];
  /** A new product opens the structure with «Состав ткани» expanded: it is filled first, from the label */
  isNewProduct?: boolean;
}

const inputClass =
  'w-full min-w-0 h-9 px-3 neu-inset rounded-xl text-xs text-[#2D3A4E] placeholder:text-[#56647A]';

/**
 * «Структура карточки»: every section of the customer's product card with its elements.
 * Elements are added, edited in place and removed with a confirmation (as in the cart).
 */
export const AdminProductCardStructure: React.FC<AdminProductCardStructureProps> = ({
  value,
  onChange,
  hasDescription,
  onShowToast,
  suggestFrom = [],
  isNewProduct = false,
}) => {
  const [isOpen, setIsOpen] = useState(isNewProduct);
  const [openSection, setOpenSection] = useState<SectionId | null>(isNewProduct ? 'composition' : null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  /** The fiber row whose share is the rest to 100 % (the last tapped chip); null once its share is typed */
  const [autoFiber, setAutoFiber] = useState<number | null>(null);

  const set = <K extends keyof ProductCardStructure>(key: K, next: ProductCardStructure[K]) =>
    onChange({ ...value, [key]: next });

  const updateAt = <K extends 'features' | 'composition' | 'certifications' | 'specs' | 'care'>(
    key: K,
    index: number,
    patch: Partial<ProductCardStructure[K][number]> | string
  ) => {
    const items = [...(value[key] as unknown[])];
    items[index] = typeof patch === 'string' ? patch : { ...(items[index] as object), ...patch };
    set(key, items as ProductCardStructure[K]);
  };

  const askDelete = <K extends 'features' | 'composition' | 'certifications' | 'specs' | 'care'>(
    key: K,
    index: number,
    title: string,
    name: string,
    detail?: string
  ) => {
    const remove = () => {
      const rest = (value[key] as unknown[]).filter((_, i) => i !== index) as ProductCardStructure[K];
      if (key !== 'composition') {
        set(key, rest);
        return;
      }
      const auto = autoFiber === null || autoFiber === index ? null : autoFiber > index ? autoFiber - 1 : autoFiber;
      setAutoFiber(auto);
      set('composition', withAutoRemainder(rest as FabricCompositionItem[], auto));
    };
    // A blank row holds nothing to lose: removed at once, without a question
    if (!name.trim() && !(detail ?? '').replace(/^0%$/, '').trim()) {
      remove();
      return;
    }
    setPendingDelete({
      title,
      preview: (
        <div className="min-w-0">
          <p className="font-extrabold text-xs text-[#2D3A4E] break-words">{name || 'Пустой элемент'}</p>
          {detail && <p className="text-xs text-[#4E5C70] break-words">{detail}</p>}
        </div>
      ),
      run: () => {
        remove();
        onShowToast('Элемент удален из карточки', 'info');
      },
    });
  };

  const compositionTotal = value.composition.reduce((sum, c) => sum + (Number(c.percentage) || 0), 0);
  const featureCount = value.features.filter((f) => f.title.trim()).length;
  const compositionCount =
    value.composition.filter((c) => c.fiber.trim() && Number(c.percentage) > 0).length +
    value.certifications.filter((c) => c.trim()).length +
    (value.density.trim() ? 1 : 0);
  const specCount =
    (value.weave.trim() ? 1 : 0) +
    (value.fit ? 1 : 0) +
    (value.country.trim() ? 1 : 0) +
    value.specs.filter((s) => s.label.trim() && s.value.trim()).length;
  const careCount = value.care.filter((c) => c.label.trim()).length;

  const sections: { id: SectionId; title: string; hint: string; icon: typeof FileText; count: number; shown: boolean }[] = [
    {
      id: 'description',
      title: 'Описание',
      hint: 'Карточки преимуществ под текстом описания',
      icon: FileText,
      count: featureCount,
      shown: hasDescription || featureCount > 0,
    },
    {
      id: 'composition',
      title: 'Состав ткани',
      hint: 'Волокна в процентах, плотность, сертификаты',
      icon: Layers,
      count: compositionCount,
      shown: compositionCount > 0,
    },
    {
      id: 'specs',
      title: 'Характеристики',
      hint: 'Переплетение, посадка, страна, свои строки',
      icon: ListChecks,
      count: specCount,
      shown: specCount > 0,
    },
    {
      id: 'care',
      title: 'Уход и стирка',
      hint: 'Правила ухода за изделием',
      icon: Sparkles,
      count: careCount,
      shown: careCount > 0,
    },
  ];
  const shownCount = sections.filter((s) => s.shown).length;

  const deleteButton = (onClick: () => void, label: string) => (
    <button
      type="button"
      onClick={onClick}
      className="w-9 h-9 rounded-xl neu-button-danger flex items-center justify-center shrink-0 cursor-pointer transition-all"
      aria-label={label}
      title={label}
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  );

  const addButton = (onClick: () => void, label: string) => (
    <button
      type="button"
      onClick={onClick}
      className="h-8 px-3 rounded-xl neu-button text-[11px] font-bold text-accent flex items-center gap-1.5 cursor-pointer transition-all"
    >
      <Plus className="w-3.5 h-3.5" />
      <span>{label}</span>
    </button>
  );

  const emptyNote = (text: string) => (
    <p className="text-xs font-semibold text-[#4E5C70] leading-snug">{text}</p>
  );

  /** A row of chips under a field: a tap puts the value in, no typing */
  const chips = (label: string, values: string[], onPick: (value: string) => void, withPlus = false) =>
    values.length > 0 && (
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
        {values.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => onPick(chip)}
            className="min-h-8 px-2.5 py-1 rounded-xl neu-button text-[11px] font-bold text-[#2D3A4E] hover:text-accent flex items-center gap-1 cursor-pointer transition-all"
          >
            {withPlus && <Plus className="w-3 h-3 text-accent" aria-hidden="true" />}
            {chip}
          </button>
        ))}
      </div>
    );

  /** A tapped fiber fills a blank row or a new one, and its share becomes the rest to 100 % */
  const addFiber = (fiber: string) => {
    const blank = value.composition.findIndex((c) => !c.fiber.trim());
    const index = blank >= 0 ? blank : value.composition.length;
    const next = [...value.composition];
    next[index] = { fiber, percentage: 0 };
    setAutoFiber(index);
    set('composition', withAutoRemainder(next, index));
  };

  /** A care symbol tapped as seen on the label; a rule with an explanation typed into it is taken away after a question */
  const tapCareSymbol = (symbol: CareSymbol) => {
    const index = value.care.findIndex((c) => careSymbolOf(c)?.id === symbol.id);
    if (index >= 0 && value.care[index].desc.trim()) {
      askDelete('care', index, 'Удалить правило ухода?', value.care[index].label, value.care[index].desc);
      return;
    }
    set('care', toggleCareSymbol(value.care, symbol));
  };

  const setFiberShare = (index: number, percentage: number) => {
    const next = value.composition.map((c, i) => (i === index ? { ...c, percentage } : c));
    if (index === autoFiber) {
      setAutoFiber(null);
      set('composition', next);
    } else {
      set('composition', withAutoRemainder(next, autoFiber));
    }
  };

  return (
    <div className="neu-flat-sm rounded-2xl border border-white/60">
      {/* Summary row */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="w-full p-3 flex items-center justify-between gap-3 text-left cursor-pointer"
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <span className="w-9 h-9 rounded-xl neu-inset flex items-center justify-center text-accent shrink-0">
            <LayoutList className="w-4 h-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-extrabold text-[#2D3A4E]">Структура карточки</span>
            <span className="block text-[11px] font-semibold text-[#4E5C70] leading-snug">
              Покупатель видит разделов: {shownCount} из {sections.length}. Пустые разделы скрыты.
            </span>
          </span>
        </span>
        <ChevronDown
          className={`w-4 h-4 text-accent shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="px-3 pb-3 space-y-2">
          {sections.map((section) => {
            const SectionIcon = section.icon;
            const expanded = openSection === section.id;
            return (
              <div key={section.id} className="neu-inset rounded-2xl">
                <button
                  type="button"
                  onClick={() => setOpenSection(expanded ? null : section.id)}
                  aria-expanded={expanded}
                  className="w-full p-3 flex items-center justify-between gap-2 text-left cursor-pointer"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <SectionIcon className="w-4 h-4 text-accent shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-xs font-extrabold text-[#2D3A4E]">{section.title}</span>
                      <span className="block text-[11px] text-[#4E5C70] leading-snug">{section.hint}</span>
                    </span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-[11px] font-extrabold px-2 py-0.5 rounded-lg whitespace-nowrap ${
                        section.shown ? 'bg-success-soft text-success' : 'bg-[#BAC5D5]/30 text-[#4E5C70]'
                      }`}
                    >
                      {section.shown ? (section.count > 0 ? `Показан · ${section.count}` : 'Показан') : 'Скрыт'}
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 text-[#4E5C70] transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                    />
                  </span>
                </button>

                {expanded && (
                  <div className="px-3 pb-3 space-y-3 border-t border-[#BAC5D5]/40 pt-3">
                    {section.id === 'description' && (
                      <>
                        {!hasDescription && emptyNote('Текст описания заполняется в поле «Описание товара» ниже.')}
                        {value.features.length === 0 && emptyNote('Карточек преимуществ нет — блок не показывается.')}
                        {value.features.map((feature, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <input
                                value={feature.title}
                                onChange={(e) => updateAt('features', idx, { title: e.target.value })}
                                placeholder="Заголовок, напр. Эко-материал"
                                aria-label="Заголовок преимущества"
                                className={inputClass}
                              />
                              <input
                                value={feature.text ?? ''}
                                onChange={(e) => updateAt('features', idx, { text: e.target.value })}
                                placeholder="Пояснение (необязательно)"
                                aria-label="Пояснение преимущества"
                                className={inputClass}
                              />
                            </div>
                            {deleteButton(
                              () => askDelete('features', idx, 'Удалить преимущество?', feature.title, feature.text),
                              'Удалить преимущество'
                            )}
                          </div>
                        ))}
                        {addButton(() => set('features', [...value.features, { title: '', text: '' }]), 'Преимущество')}
                      </>
                    )}

                    {section.id === 'composition' && (
                      <>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-extrabold text-[#2D3A4E]">Волокна</span>
                            {value.composition.length > 0 && (
                              <span
                                className={`text-[11px] font-extrabold px-2 py-0.5 rounded-lg ${
                                  compositionTotal === 100 ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'
                                }`}
                              >
                                Сумма: {compositionTotal}%
                              </span>
                            )}
                          </div>
                          {value.composition.length === 0 && emptyNote('Состав не указан — шкалы волокон не показываются.')}
                          {value.composition.map((item, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <input
                                value={item.fiber}
                                onChange={(e) => updateAt('composition', idx, { fiber: e.target.value })}
                                placeholder="Волокно, напр. Хлопок"
                                aria-label="Волокно"
                                className={`${inputClass} flex-1`}
                              />
                              <div className="relative w-20 shrink-0">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={item.percentage || ''}
                                  inputMode="numeric"
                                  onChange={(e) => setFiberShare(idx, Number(e.target.value))}
                                  placeholder="0"
                                  aria-label="Доля, %"
                                  className={`${inputClass} pr-6 text-right font-bold`}
                                />
                                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-[#4E5C70]">
                                  %
                                </span>
                              </div>
                              {deleteButton(
                                () =>
                                  askDelete(
                                    'composition',
                                    idx,
                                    'Удалить волокно?',
                                    item.fiber,
                                    item.percentage ? `${item.percentage}%` : undefined
                                  ),
                                'Удалить волокно'
                              )}
                            </div>
                          ))}
                          {chips('Добавить волокно', fiberSuggestions(suggestFrom, value.composition), addFiber, true)}
                          {addButton(() => set('composition', [...value.composition, { fiber: '', percentage: 0 }]), 'Волокно')}
                        </div>

                        <label className="block space-y-1">
                          <span className="text-[11px] font-extrabold text-[#2D3A4E]">Плотность ткани</span>
                          <span className="relative block">
                            <input
                              value={value.density}
                              onChange={(e) => set('density', e.target.value.replace(/[^\d.,]/g, ''))}
                              inputMode="decimal"
                              placeholder="Например: 185"
                              aria-label={`Плотность ткани, ${DENSITY_UNIT}`}
                              className={`${inputClass} pr-12`}
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#4E5C70] pointer-events-none">
                              {DENSITY_UNIT}
                            </span>
                          </span>
                        </label>

                        <div className="space-y-2">
                          <span className="text-[11px] font-extrabold text-[#2D3A4E] flex items-center gap-1.5">
                            <ShieldCheck className="w-3.5 h-3.5 text-success" />
                            Сертификаты
                          </span>
                          {value.certifications.length === 0 && emptyNote('Без сертификатов строка не показывается.')}
                          {value.certifications.map((cert, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <input
                                value={cert}
                                onChange={(e) => updateAt('certifications', idx, e.target.value)}
                                placeholder="Например: OEKO-TEX Standard 100"
                                aria-label="Сертификат"
                                className={`${inputClass} flex-1`}
                              />
                              {deleteButton(
                                () => askDelete('certifications', idx, 'Удалить сертификат?', cert),
                                'Удалить сертификат'
                              )}
                            </div>
                          ))}
                          {addButton(() => set('certifications', [...value.certifications, '']), 'Сертификат')}
                        </div>
                      </>
                    )}

                    {section.id === 'specs' && (
                      <>
                        <p className="text-xs text-[#4E5C70] leading-snug">
                          Артикул и штрихкод берутся из вариаций SKU.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className="space-y-1.5">
                            <label className="block space-y-1">
                              <span className="text-[11px] font-extrabold text-[#2D3A4E]">Тип переплетения</span>
                              <input
                                value={value.weave}
                                onChange={(e) => set('weave', e.target.value)}
                                placeholder="Например: саржевое"
                                className={inputClass}
                              />
                            </label>
                            {chips('Переплетение из ваших товаров', weaveSuggestions(suggestFrom, value.weave), (v) => set('weave', v))}
                          </div>
                          <div className="space-y-1.5">
                            <label className="block space-y-1">
                              <span className="text-[11px] font-extrabold text-[#2D3A4E]">Страна производства</span>
                              <input
                                value={value.country}
                                onChange={(e) => set('country', e.target.value)}
                                placeholder="Например: Россия"
                                className={inputClass}
                              />
                            </label>
                            {chips('Выбрать страну', countrySuggestions(suggestFrom, value.country), (v) => set('country', v))}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[11px] font-extrabold text-[#2D3A4E]">Покрой / посадка</span>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5" role="group" aria-label="Покрой">
                            {([['', 'Не указан'], ...Object.entries(FIT_LABELS)] as [string, string][]).map(([fit, label]) => (
                              <button
                                key={fit || 'none'}
                                type="button"
                                onClick={() => set('fit', fit as ProductCardStructure['fit'])}
                                aria-pressed={value.fit === fit}
                                className={`min-h-8 px-2 py-1 rounded-xl text-[11px] font-bold leading-tight cursor-pointer transition-all ${
                                  value.fit === fit ? 'neu-pill-active' : 'neu-button text-[#4E5C70] hover:text-[#2D3A4E]'
                                }`}
                              >
                                {label.replace(/ \(.+\)$/, '')}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <span className="text-[11px] font-extrabold text-[#2D3A4E]">Свои характеристики</span>
                          {value.specs.length === 0 && emptyNote('Например: «Застежка — молния YKK».')}
                          {value.specs.map((spec, idx) => (
                            <div key={idx} className="flex items-start gap-2">
                              <div className="flex-1 min-w-0 grid grid-cols-2 gap-2">
                                <input
                                  value={spec.label}
                                  onChange={(e) => updateAt('specs', idx, { label: e.target.value })}
                                  placeholder="Название"
                                  aria-label="Название характеристики"
                                  className={inputClass}
                                />
                                <input
                                  value={spec.value}
                                  onChange={(e) => updateAt('specs', idx, { value: e.target.value })}
                                  placeholder="Значение"
                                  aria-label="Значение характеристики"
                                  className={inputClass}
                                />
                              </div>
                              {deleteButton(
                                () => askDelete('specs', idx, 'Удалить характеристику?', spec.label, spec.value),
                                'Удалить характеристику'
                              )}
                            </div>
                          ))}
                          {addButton(() => set('specs', [...value.specs, { label: '', value: '' }]), 'Характеристика')}
                        </div>
                      </>
                    )}

                    {section.id === 'care' && (
                      <>
                        <div className="space-y-1.5">
                          <span className="text-[11px] font-extrabold text-[#2D3A4E]">Значки с бирки</span>
                          <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5" role="group" aria-label="Значки ухода">
                            {CARE_SYMBOLS.map((symbol) => {
                              const picked = value.care.some((c) => careSymbolOf(c)?.id === symbol.id);
                              return (
                                <button
                                  key={symbol.id}
                                  type="button"
                                  onClick={() => tapCareSymbol(symbol)}
                                  aria-pressed={picked}
                                  aria-label={symbol.label}
                                  title={symbol.label}
                                  className={`min-h-16 px-1 py-1.5 rounded-xl flex flex-col items-center justify-center gap-1 cursor-pointer transition-all ${
                                    picked ? 'neu-pill-active text-accent' : 'neu-button text-[#2D3A4E] hover:text-accent'
                                  }`}
                                >
                                  <CareSymbolIcon symbol={symbol} />
                                  <span className="text-[11px] font-bold leading-tight text-center">{symbol.short}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        {value.care.length === 0 && emptyNote('Правил ухода нет — вкладка «Уход и стирка» скрыта.')}
                        {value.care.map((care, idx) => (
                          <div key={idx} className="neu-flat-sm rounded-2xl p-2.5 space-y-2">
                            <div className="flex items-center gap-2">
                              <NeumorphicSelect
                                className="flex-1 min-w-0"
                                value={care.icon}
                                onChange={(icon) => updateAt('care', idx, { icon: icon as CareInstructionItem['icon'] })}
                                options={Object.entries(CARE_ICON_LABELS).map(([icon, label]) => ({ value: icon, label }))}
                                triggerClassName="h-9 px-3 rounded-xl"
                                prefix="Тип:"
                              />
                              {deleteButton(
                                () => askDelete('care', idx, 'Удалить правило ухода?', care.label, care.desc),
                                'Удалить правило ухода'
                              )}
                            </div>
                            <input
                              value={care.label}
                              onChange={(e) => updateAt('care', idx, { label: e.target.value })}
                              placeholder="Правило, напр. Стирка до 30°C"
                              aria-label="Правило ухода"
                              className={inputClass}
                            />
                            <input
                              value={care.desc}
                              onChange={(e) => updateAt('care', idx, { desc: e.target.value })}
                              placeholder="Пояснение (необязательно)"
                              aria-label="Пояснение правила"
                              className={inputClass}
                            />
                          </div>
                        ))}
                        {addButton(() => set('care', [...value.care, { icon: 'wash', label: '', desc: '' }]), 'Правило ухода')}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        isOpen={Boolean(pendingDelete)}
        title={pendingDelete?.title ?? ''}
        preview={pendingDelete?.preview}
        message="Элемент исчезнет из карточки товара после сохранения. Если раздел станет пустым, покупатель его не увидит."
        cancelLabel="Оставить"
        onConfirm={() => pendingDelete?.run()}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
};
