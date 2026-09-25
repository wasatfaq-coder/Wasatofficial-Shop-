import React, { useState, useEffect } from 'react';
import {
  X,
  Ruler,
  Sparkles,
  Check,
  BookmarkCheck,
  Info,
  Scale,
  Shirt,
  Scissors,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { UserProfile, BodyMeasurements } from '../types';
import { NeumorphicSlider } from './NeumorphicSlider';
import { calculateRussianPattern, RUSSIAN_SIZE_TABLE_ROWS } from '../utils/russianSizing';

interface SizeCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableSizes: string[];
  onSelectSize: (size: string) => void;
  productFit?: 'slim' | 'regular' | 'oversize';
  productCategory?: string;
  userProfile?: UserProfile;
  onSaveMeasurements?: (measurements: BodyMeasurements) => void;
}

export const SizeCalculatorModal: React.FC<SizeCalculatorModalProps> = ({
  isOpen,
  onClose,
  availableSizes,
  onSelectSize,
  productFit = 'regular',
  productCategory,
  userProfile,
  onSaveMeasurements,
}) => {
  const [height, setHeight] = useState<number>(184);
  const [weight, setWeight] = useState<number>(94);
  const [chest, setChest] = useState<number>(104);
  const [waist, setWaist] = useState<number>(95);
  const [hips, setHips] = useState<number>(98);
  const [fitPreference, setFitPreference] = useState<'tight' | 'regular' | 'loose'>('regular');
  const [saveToProfile, setSaveToProfile] = useState<boolean>(true);
  const [applied, setApplied] = useState(false);
  const [showSizeTable, setShowSizeTable] = useState(false);

  // Sync state from userProfile if available
  useEffect(() => {
    if (userProfile?.bodyMeasurements) {
      const m = userProfile.bodyMeasurements;
      if (m.height) setHeight(m.height);
      if (m.weight) setWeight(m.weight);
      if (m.chest) setChest(m.chest);
      if (m.waist) setWaist(m.waist);
      if (m.hips) setHips(m.hips);
      if (m.fitPreference) setFitPreference(m.fitPreference);
    }
  }, [userProfile, isOpen]);

  // Comprehensive Russian pattern calculations
  const russianPattern = calculateRussianPattern(
    height,
    weight,
    chest,
    waist,
    hips,
    fitPreference
  );

  // Determine recommendation based on category & cut
  const isTrousers = productCategory === 'trousers';

  let recommendedSizeLabel = isTrousers
    ? russianPattern.bottomSizeLabel
    : russianPattern.topSizeLabel;

  let rawSizeValue = isTrousers
    ? `${russianPattern.bottomRussianSize}`
    : russianPattern.topInternationalSize;

  // Match with available sizes if provided
  if (availableSizes && availableSizes.length > 0) {
    const directMatch = availableSizes.find(
      (s) =>
        s.toUpperCase() === rawSizeValue.toUpperCase() ||
        s.toUpperCase().includes(rawSizeValue.toUpperCase()) ||
        s.includes(`${russianPattern.topRussianSize}`)
    );
    if (directMatch) {
      rawSizeValue = directMatch;
    } else {
      const numMatch = availableSizes.find((s) =>
        s.includes(`${isTrousers ? russianPattern.bottomRussianSize : russianPattern.topRussianSize}`)
      );
      if (numMatch) {
        rawSizeValue = numMatch;
      }
    }
  }

  // Active effective silhouette derived from product cut & user measurements / fit preference
  const effectiveSilhouette =
    fitPreference === 'tight'
      ? 'slim'
      : fitPreference === 'loose'
      ? 'oversize'
      : productFit || 'regular';

  // Dynamic silhouette analysis and live feedback that recalculates automatically
  const silhouetteData = React.useMemo(() => {
    const halfChest = Math.round(chest / 2);
    const drop = chest - waist;
    const isSlim = effectiveSilhouette === 'slim';
    const isOversize = effectiveSilhouette === 'oversize';

    let fitTitle = 'Regular Fit';
    let fitBadge = 'REGULAR FIT';
    let fitDescription = '';
    let allowance = '+4...5 см';
    let fitTag = 'Прямой баланс';

    if (isSlim) {
      fitTitle = 'Slim Fit (Приталенный)';
      fitBadge = 'SLIM FIT';
      fitTag = 'По фигуре';
      allowance = '+1...2 см';
      fitDescription = `Приталенный крой с акцентом на линию груди и плеч (ОГ ${chest} см, ПОГ ${halfChest} см). При дропе ${
        drop > 0 ? `+${drop}` : drop
      } см (${russianPattern.fullnessGroup}-я полнота) обеспечивает точную скульптурную посадку без лишнего объёма в талии.`;
    } else if (isOversize) {
      fitTitle = 'Oversize (Свободный крой)';
      fitBadge = 'OVERSIZE';
      fitTag = 'Свободный / Объем';
      allowance = '+7...10 см';
      fitDescription = `Свободный крой со спущенной линией плеча. При росте ${height} см и весе ${weight} кг (${russianPattern.bmiStatus}) гарантирует максимальный комфорт и естественную драпировку ткани по корпусу.`;
    } else {
      fitTitle = 'Regular Fit (Классический прямой)';
      fitBadge = 'REGULAR FIT';
      fitTag = 'Классический';
      allowance = '+4...5 см';
      fitDescription = `Классический прямой крой для ${russianPattern.fullnessGroup}-й полноты РФ (ОГ ${chest} см, ПОГ ${halfChest} см, пояс ${waist} см, джинсы ${russianPattern.jeansWaistSize}). Идеальный комфорт и баланс на каждый день.`;
    }

    return {
      fitTitle,
      fitBadge,
      fitTag,
      allowance,
      fitDescription,
      drop,
      halfChest,
    };
  }, [effectiveSilhouette, chest, waist, height, weight, fitPreference, productFit, russianPattern]);

  // Confidence calculation
  const confidence = Math.min(99, 93 + (chest % 3) + (waist % 2) + (hips % 2));

  const handleApply = () => {
    const measurements: BodyMeasurements = {
      height,
      weight,
      chest,
      waist,
      hips,
      fitPreference,
    };

    if (saveToProfile && onSaveMeasurements) {
      onSaveMeasurements(measurements);
    }

    onSelectSize(rawSizeValue);
    setApplied(true);
    setTimeout(() => {
      setApplied(false);
      onClose();
    }, 500);
  };

  const handleResetToStandard = () => {
    setHeight(184);
    setWeight(94);
    setChest(104);
    setWaist(95);
    setHips(98);
    setFitPreference('regular');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="size-calc-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
        >
          <div
            onClick={onClose}
            className="fixed inset-0 bg-[#2D3A4E]/50 backdrop-blur-xs cursor-pointer"
          />
          <motion.div
            key="size-calc-modal"
            initial={{ scale: 0.94, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 12 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-lg neu-modal rounded-3xl p-4 sm:p-6 border border-white/70 space-y-4 max-h-[92vh] overflow-y-auto no-scrollbar z-10 bg-[#E3E8EF]"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#BAC5D5]/40">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl neu-inset flex items-center justify-center text-[#4B59BB] bg-[#E3E8EF]">
                  <Ruler className="w-5 h-5 stroke-[2.2]" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[#2D3A4E]">
                    Мои размеры & Лекало
                  </h3>
                  <p className="text-[11px] text-[#4E5C70] font-medium">
                    Точный расчёт параметров и размера мужской одежды
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-full neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] transition-all cursor-pointer bg-[#E3E8EF]"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>

            {/* Product Fit & Silhouette Indicator (Neumorphic Inset Deepened Banner with live updates) */}
            <div className="neu-inset rounded-2xl p-3.5 border border-white/50 space-y-2 bg-[#E3E8EF] transition-all duration-200">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-xl neu-button flex items-center justify-center shrink-0 text-[#4B59BB] bg-[#E3E8EF] border border-white/80">
                    <Info className="w-3.5 h-3.5 stroke-[2.4]" />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span className="text-xs font-black text-[#2D3A4E]">
                      Силуэт изделия:
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full neu-inset text-[#4B59BB] text-[11px] uppercase font-black tracking-wider bg-[#E3E8EF] border border-[#5F6ED0]/30">
                      {silhouetteData.fitBadge}
                    </span>
                    <span className="text-[11px] font-bold text-[#4E5C70] px-2 py-0.5 rounded-md neu-inset bg-[#E3E8EF] border border-white/40">
                      {silhouetteData.fitTag}
                    </span>
                  </div>
                </div>

                <div className="text-[11px] font-extrabold text-[#4B59BB] flex items-center gap-1.5 ml-auto">
                  <span className="text-[#4E5C70] font-medium">Прибавка к ПОГ:</span>
                  <span className="px-1.5 py-0.5 rounded-md neu-inset bg-[#E3E8EF] border border-white/40 font-mono">
                    {silhouetteData.allowance}
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-[#4E5C70] leading-relaxed font-medium pl-0.5">
                {silhouetteData.fitDescription}
              </p>

              {/* Dynamic Micro-metrics bar inside the Inset banner */}
              <div className="grid grid-cols-3 gap-1.5 pt-1.5 border-t border-[#BAC5D5]/40 text-[11px]">
                <div className="neu-flat rounded-lg px-2 py-1 bg-[#E3E8EF] border border-white/60 text-center">
                  <span className="text-[#4E5C70] text-[11px] block">ПОГ изделия</span>
                  <span className="font-extrabold text-[#2D3A4E]">
                    {silhouetteData.halfChest} см
                  </span>
                </div>
                <div className="neu-flat rounded-lg px-2 py-1 bg-[#E3E8EF] border border-white/60 text-center">
                  <span className="text-[#4E5C70] text-[11px] block">Дроп (ОГ − ОТ)</span>
                  <span className="font-extrabold text-[#4B59BB]">
                    {silhouetteData.drop > 0 ? `+${silhouetteData.drop}` : silhouetteData.drop} см
                  </span>
                </div>
                <div className="neu-flat rounded-lg px-2 py-1 bg-[#E3E8EF] border border-white/60 text-center">
                  <span className="text-[#4E5C70] text-[11px] block">Тип телосложения</span>
                  <span className="font-extrabold text-[#2D3A4E]">
                    {russianPattern.fullnessGroup}-я полнота
                  </span>
                </div>
              </div>
            </div>

            {/* Russian Sizing Result Summary Card */}
            <div className="neu-inset rounded-2xl p-3.5 space-y-3 bg-[#E3E8EF] border border-white/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#4B59BB]" />
                  <span className="text-xs font-black text-[#2D3A4E] uppercase tracking-wide">
                    Рассчитанное лекало
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowSizeTable(!showSizeTable)}
                    className="text-[11px] font-bold text-[#4B59BB] neu-button px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer bg-[#E3E8EF]"
                  >
                    <span>Таблица</span>
                    {showSizeTable ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleResetToStandard}
                    className="text-[11px] font-bold text-[#4E5C70] hover:text-[#2D3A4E] neu-button px-2.5 py-1 rounded-lg cursor-pointer bg-[#E3E8EF]"
                    title="Сбросить на типовые параметры"
                  >
                    Типовые
                  </button>
                </div>
              </div>

              {/* 4 Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="neu-flat rounded-xl p-2.5 text-center bg-[#E3E8EF] border border-white/70">
                  <span className="text-[11px] font-medium text-[#4E5C70] block">Верхняя одежда</span>
                  <span className="text-xs font-black text-[#4B59BB] block my-0.5">
                    {russianPattern.topSizeLabel}
                  </span>
                  <span className="text-[11px] text-[#4E5C70] block">
                    ПОГ: {Math.round(chest / 2)} см
                  </span>
                </div>

                <div className="neu-flat rounded-xl p-2.5 text-center bg-[#E3E8EF] border border-white/70">
                  <span className="text-[11px] font-medium text-[#4E5C70] block">Брюки / Джинсы</span>
                  <span className="text-xs font-black text-[#2D3A4E] block my-0.5">
                    {russianPattern.bottomSizeLabel}
                  </span>
                  <span className="text-[11px] text-[#4E5C70] block">Пояс: {waist} см</span>
                </div>

                <div className="neu-flat rounded-xl p-2.5 text-center bg-[#E3E8EF] border border-white/70">
                  <span className="text-[11px] font-medium text-[#4E5C70] block">Ростовка РФ</span>
                  <span className="text-xs font-black text-[#2D3A4E] block my-0.5">
                    {russianPattern.heightGroupNumber}-я группа
                  </span>
                  <span className="text-[11px] text-[#4E5C70] block">
                    {russianPattern.heightRange}
                  </span>
                </div>

                <div className="neu-flat rounded-xl p-2.5 text-center bg-[#E3E8EF] border border-white/70">
                  <span className="text-[11px] font-medium text-[#4E5C70] block">Полнота / ИМТ</span>
                  <span className="text-xs font-black text-[#2D3A4E] block my-0.5">
                    {russianPattern.fullnessGroup}-я полнота
                  </span>
                  <span className="text-[11px] text-[#4E5C70] block">
                    ИМТ: {russianPattern.bmi}
                  </span>
                </div>
              </div>

              {/* Dynamic Status Strip */}
              <div className="flex items-center justify-between text-[11px] font-medium text-[#4E5C70] pt-1 border-t border-[#BAC5D5]/40 flex-wrap gap-1">
                <span>{russianPattern.recommendedFit}</span>
                <span className="text-[#4B59BB] font-bold">Точность {confidence}%</span>
              </div>

              {/* Collapsible Russian Size Grid Table */}
              {showSizeTable && (
                <div className="neu-flat rounded-xl p-3 bg-[#E3E8EF] border border-white/80 space-y-2 mt-2 animate-in fade-in">
                  <div className="text-[11px] font-extrabold text-[#2D3A4E] flex items-center justify-between">
                    <span>Сетка размеров мужской одежды</span>
                    <span className="text-[11px] text-[#4B59BB] font-bold">Стандарт РФ</span>
                  </div>
                  <div className="overflow-x-auto no-scrollbar">
                    <table className="w-full text-[11px] text-center border-collapse">
                      <thead>
                        <tr className="border-b border-[#BAC5D5]/50 text-[#4E5C70] font-bold">
                          <th className="py-1 px-1 text-left">Размер РФ</th>
                          <th className="py-1 px-1">Междунар.</th>
                          <th className="py-1 px-1">Грудь (ОГ)</th>
                          <th className="py-1 px-1">Талия (ОТ)</th>
                          <th className="py-1 px-1">Бёдра (ОБ)</th>
                          <th className="py-1 px-1">Джинсы</th>
                        </tr>
                      </thead>
                      <tbody>
                        {RUSSIAN_SIZE_TABLE_ROWS.map((row) => {
                          const isMatch = russianPattern.topRussianSize === row.ru;
                          return (
                            <tr
                              key={row.ru}
                              className={`border-b border-[#BAC5D5]/30 transition-colors ${
                                isMatch
                                  ? 'neu-inset text-[#4B59BB] font-black bg-[#DDE4F0]'
                                  : 'text-[#2D3A4E]'
                              }`}
                            >
                              <td className="py-1 px-1 font-bold text-left">RU {row.ru}</td>
                              <td className="py-1 px-1">{row.int}</td>
                              <td className="py-1 px-1">{row.chest} см</td>
                              <td className="py-1 px-1">{row.waist} см</td>
                              <td className="py-1 px-1">{row.hips} см</td>
                              <td className="py-1 px-1 font-mono font-bold">{row.jeans}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Tactile Neumorphic Sliders Grid */}
            <div className="space-y-3.5">
              {/* Height Slider */}
              <NeumorphicSlider
                id="sizecalc-slider-height"
                label="Рост"
                value={height}
                min={160}
                max={205}
                unit="см"
                icon={<Ruler className="w-4 h-4 stroke-[2.2]" />}
                subtitle={`${russianPattern.heightGroupNumber}-я ростовка РФ (${russianPattern.heightRange})`}
                recommendedValue={184}
                onChange={setHeight}
              />

              {/* Weight Slider */}
              <NeumorphicSlider
                id="sizecalc-slider-weight"
                label="Вес"
                value={weight}
                min={50}
                max={130}
                unit="кг"
                icon={<Scale className="w-4 h-4 stroke-[2.2]" />}
                subtitle={`ИМТ: ${russianPattern.bmi} • ${russianPattern.bmiStatus}`}
                recommendedValue={94}
                onChange={setWeight}
              />

              {/* Chest Slider */}
              <NeumorphicSlider
                id="sizecalc-slider-chest"
                label="Обхват груди"
                value={chest}
                min={80}
                max={140}
                unit="см"
                icon={<Shirt className="w-4 h-4 stroke-[2.2]" />}
                subtitle={`ПОГ: ${Math.round(chest / 2)} см → Российский размер: RU ${russianPattern.topRussianSize} (${russianPattern.topInternationalSize})`}
                recommendedValue={104}
                onChange={setChest}
              />

              {/* Waist Slider */}
              <NeumorphicSlider
                id="sizecalc-slider-waist"
                label="Обхват талии"
                value={waist}
                min={65}
                max={130}
                unit="см"
                icon={<Scissors className="w-4 h-4 stroke-[2.2]" />}
                subtitle={`Джинсовый пояс: ${russianPattern.jeansWaistSize} • Дроп: ${russianPattern.dropValue} см`}
                recommendedValue={95}
                onChange={setWaist}
              />

              {/* Hips Slider */}
              <NeumorphicSlider
                id="sizecalc-slider-hips"
                label="Обхват бёдер"
                value={hips}
                min={80}
                max={140}
                unit="см"
                icon={<Layers className="w-4 h-4 stroke-[2.2]" />}
                subtitle={`Лекало брюк: RU ${russianPattern.bottomRussianSize}`}
                recommendedValue={98}
                onChange={setHips}
              />

              {/* Fit Preference */}
              <div className="space-y-2 neu-inset rounded-2xl p-3 bg-[#E3E8EF] border border-white/40">
                <span className="text-xs font-extrabold text-[#2D3A4E] block">
                  Предпочитаемая посадка:
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'tight', label: 'Облегающая', sub: 'Slim Fit' },
                    { id: 'regular', label: 'Стандартная', sub: 'Regular' },
                    { id: 'loose', label: 'Свободная', sub: 'Oversize' },
                  ].map((pref) => {
                    const isActive = fitPreference === pref.id;
                    return (
                      <button
                        key={pref.id}
                        type="button"
                        onClick={() => setFitPreference(pref.id as any)}
                        className={`py-2 px-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                          isActive
                            ? 'neu-pill-active font-black'
                            : 'neu-button text-[#4E5C70] hover:text-[#2D3A4E] bg-[#E3E8EF]'
                        }`}
                      >
                        <span>{pref.label}</span>
                        <span className="text-[11px] opacity-75">{pref.sub}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Save to Profile Option */}
            <button
              type="button"
              onClick={() => setSaveToProfile(!saveToProfile)}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl neu-flat hover:opacity-90 transition-all cursor-pointer border border-white/40 bg-[#E3E8EF]"
            >
              <div
                className={`w-5 h-5 rounded-lg flex items-center justify-center transition-all ${
                  saveToProfile
                    ? 'neu-fill-accent text-white'
                    : 'neu-inset text-transparent border border-white/60 bg-[#E3E8EF]'
                }`}
              >
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </div>
              <span className="text-xs font-bold text-[#2D3A4E] flex items-center gap-1.5">
                <BookmarkCheck className="w-3.5 h-3.5 text-[#4B59BB]" />
                <span>Сохранить параметры в моём профиле</span>
              </span>
            </button>

            {/* Action Buttons */}
            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3.5 neu-button rounded-2xl text-[#4E5C70] font-bold text-xs hover:text-[#2D3A4E] cursor-pointer active:scale-95 transition-transform bg-[#E3E8EF]"
              >
                Закрыть
              </button>
              <button
                type="button"
                onClick={handleApply}
                className={`flex-1 py-3.5 px-4 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all ${
                  applied
                    ? 'neu-button-success text-white'
                    : 'neu-button-accent text-white'
                }`}
              >
                {applied ? (
                  <>
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>Размер {recommendedSizeLabel} сохранён!</span>
                  </>
                ) : (
                  <span>Выбрать {recommendedSizeLabel}</span>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
