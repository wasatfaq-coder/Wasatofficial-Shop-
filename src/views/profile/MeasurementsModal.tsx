import { Check, X, Sparkles, Ruler, Layers, Scale, Scissors, Shirt, Info } from 'lucide-react';
import { NeumorphicSlider } from '../../components/NeumorphicSlider';
import { RUSSIAN_SIZE_TABLE_ROWS } from '../../utils/russianSizing';

import type { MeasurementsForm } from './useMeasurementsForm';

/** «Мерки профиля и лекало РФ»: sliders, the live pattern and the ГОСТ table */
export function MeasurementsModal({ form }: { form: MeasurementsForm }) {
  const {
    isEditingMeasurements,
    setIsEditingMeasurements,
    measurementsDialog,
    showGostTable,
    setShowGostTable,
    measHeight,
    setMeasHeight,
    measWeight,
    setMeasWeight,
    measChest,
    setMeasChest,
    measWaist,
    setMeasWaist,
    measHips,
    setMeasHips,
    measFit,
    setMeasFit,
    currentRussianPattern,
    handleSaveMeasurements,
    isSavingMeasurements,
  } = form;
  return (
    <>
      {isEditingMeasurements && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-text-primary/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            ref={measurementsDialog.ref}
            {...measurementsDialog.props}
            className="neu-modal rounded-3xl max-w-lg w-full max-h-[92vh] flex flex-col text-text-primary overflow-hidden transform-gpu">
            {/* Sticky Fixed Header */}
            <div className="flex items-center justify-between gap-2 neu-divider-b p-4 sm:p-5 shrink-0 bg-[#E3E8EF]">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-2xl neu-inset flex items-center justify-center text-accent shrink-0">
                  <Ruler className="w-5 h-5 stroke-[2.2] shrink-0" />
                </div>
                <div className="min-w-0">
                  <h3 id={measurementsDialog.titleId} className="text-base font-extrabold text-text-primary">
                    Мерки профиля и лекало РФ
                  </h3>
                  <p className="text-xs text-text-secondary font-medium">
                    Стандарты ГОСТ 31399-2009 / ГОСТ Р 52771-2007
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditingMeasurements(false)}
                className="w-8 h-8 rounded-full neu-button flex items-center justify-center text-text-secondary hover:text-text-primary cursor-pointer transition-transform shrink-0"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4 shrink-0" />
              </button>
            </div>

            {/* Form wrapping body and sticky footer */}
            <form onSubmit={handleSaveMeasurements} className="flex-1 flex flex-col min-h-0">
              {/* Smooth Scrollable Body */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 no-scrollbar overscroll-contain transform-gpu">

            {/* Russian Sizing Pattern (Лекало РФ) Live Summary */}
            <div className="neu-inset rounded-2xl p-3.5 space-y-3 ">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-accent" />
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-text-primary">
                    Размерное лекало РФ
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGostTable(!showGostTable)}
                  className="min-h-8 neu-button px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-accent hover:text-text-primary cursor-pointer shrink-0"
                >
                  {showGostTable ? 'Скрыть таблицу' : 'Таблица ГОСТ'}
                </button>
              </div>

              {/* 4 Bento Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="neu-flat rounded-xl p-2 text-center ">
                  <span className="text-[11px] font-bold text-text-secondary block">Верх РФ</span>
                  <span className="text-xs font-extrabold text-accent block my-0.5">
                    {currentRussianPattern.topSizeLabel}
                  </span>
                  <span className="text-[11px] text-text-secondary block truncate">
                    ПОГ: {Math.round(measChest / 2)} см
                  </span>
                </div>

                <div className="neu-flat rounded-xl p-2 text-center ">
                  <span className="text-[11px] font-bold text-text-secondary block">Низ РФ</span>
                  <span className="text-xs font-extrabold text-accent block my-0.5">
                    {currentRussianPattern.bottomSizeLabel}
                  </span>
                  <span className="text-[11px] text-text-secondary block truncate">
                    Пояс: {measWaist} см
                  </span>
                </div>

                <div className="neu-flat rounded-xl p-2 text-center ">
                  <span className="text-[11px] font-bold text-text-secondary block">Ростовка</span>
                  <span className="text-xs font-extrabold text-text-primary block my-0.5">
                    {currentRussianPattern.heightGroupNumber}-я группа
                  </span>
                  <span className="text-[11px] text-text-secondary block truncate">
                    {currentRussianPattern.heightRange}
                  </span>
                </div>

                <div className="neu-flat rounded-xl p-2 text-center ">
                  <span className="text-[11px] font-bold text-text-secondary block">Полнота</span>
                  <span className="text-xs font-extrabold text-text-primary block my-0.5">
                    {currentRussianPattern.fullnessGroup}-я группа
                  </span>
                  <span className="text-[11px] text-text-secondary block truncate">
                    Дроп: {currentRussianPattern.dropValue} см
                  </span>
                </div>
              </div>

              {/* Dynamic Recommendation Banner */}
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-text-secondary pt-2 neu-divider-t">
                <Info className="w-3.5 h-3.5 text-accent shrink-0" />
                <span className="truncate">
                  {currentRussianPattern.recommendedFit} • ИМТ: {currentRussianPattern.bmi} ({currentRussianPattern.bmiStatus})
                </span>
              </div>

              {/* Collapsible Russian Size Grid Table */}
              {showGostTable && (
                <div className="neu-flat rounded-xl p-3 space-y-2 mt-2 animate-in fade-in">
                  <div className="text-[11px] font-extrabold text-text-primary flex items-center justify-between">
                    <span>Сетка размеров РФ (ГОСТ 31399-2009)</span>
                    <span className="text-[11px] text-accent font-bold">Мужская одежда</span>
                  </div>
                  <div className="overflow-x-auto no-scrollbar">
                    <table className="w-full text-[11px] text-center border-collapse">
                      <thead>
                        <tr className="neu-divider-b text-text-secondary font-bold">
                          <th className="py-1.5 px-1 text-left">Размер РФ</th>
                          <th className="py-1.5 px-1">Междунар.</th>
                          <th className="py-1.5 px-1">Обхват груди</th>
                          <th className="py-1.5 px-1">Талия</th>
                          <th className="py-1.5 px-1">Бедра</th>
                          <th className="py-1.5 px-1">Джинсы (W)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {RUSSIAN_SIZE_TABLE_ROWS.map((row) => {
                          const isMatch = currentRussianPattern.topRussianSize === row.ru;
                          return (
                            <tr
                              key={row.ru}
                              className={`neu-divider-b last:neu-divider-b-0 transition-colors ${
                                isMatch
                                  ? 'neu-inset text-accent font-extrabold'
                                  : 'text-text-primary'
                              }`}
                            >
                              <td className="py-1.5 px-1 font-bold text-left">RU {row.ru}</td>
                              <td className="py-1.5 px-1">{row.int}</td>
                              <td className="py-1.5 px-1">{row.chest} см</td>
                              <td className="py-1.5 px-1">{row.waist} см</td>
                              <td className="py-1.5 px-1">{row.hips} см</td>
                              <td className="py-1.5 px-1 font-mono font-bold">{row.jeans}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Sliders Container with Neumorphic Tactile Sliders */}
            <div className="space-y-3.5">
              {/* Height Slider */}
              <NeumorphicSlider
                id="meas-slider-height"
                label="Рост"
                value={measHeight}
                min={160}
                max={205}
                unit="см"
                icon={<Ruler className="w-4 h-4 stroke-[2.2]" />}
                subtitle={`${currentRussianPattern.heightGroupNumber}-я ростовка РФ (${currentRussianPattern.heightRange})`}
                recommendedValue={184}
                onChange={setMeasHeight}
              />

              {/* Weight Slider */}
              <NeumorphicSlider
                id="meas-slider-weight"
                label="Вес"
                value={measWeight}
                min={50}
                max={130}
                unit="кг"
                icon={<Scale className="w-4 h-4 stroke-[2.2]" />}
                subtitle={`ИМТ: ${currentRussianPattern.bmi} • ${currentRussianPattern.bmiStatus}`}
                recommendedValue={94}
                onChange={setMeasWeight}
              />

              {/* Chest Slider */}
              <NeumorphicSlider
                id="meas-slider-chest"
                label="Обхват груди"
                value={measChest}
                min={80}
                max={140}
                unit="см"
                icon={<Shirt className="w-4 h-4 stroke-[2.2]" />}
                subtitle={`ПОГ: ${Math.round(measChest / 2)} см → Российский размер: RU ${currentRussianPattern.topRussianSize} (${currentRussianPattern.topInternationalSize})`}
                recommendedValue={104}
                onChange={setMeasChest}
              />

              {/* Waist Slider */}
              <NeumorphicSlider
                id="meas-slider-waist"
                label="Обхват талии"
                value={measWaist}
                min={65}
                max={130}
                unit="см"
                icon={<Scissors className="w-4 h-4 stroke-[2.2]" />}
                subtitle={`Джинсовый пояс: ${currentRussianPattern.jeansWaistSize} • Дроп: ${currentRussianPattern.dropValue} см`}
                recommendedValue={95}
                onChange={setMeasWaist}
              />

              {/* Hips Slider */}
              <NeumorphicSlider
                id="meas-slider-hips"
                label="Обхват бедер"
                value={measHips}
                min={80}
                max={140}
                unit="см"
                icon={<Layers className="w-4 h-4 stroke-[2.2]" />}
                subtitle={`Соответствие лекалу брюк: RU ${currentRussianPattern.bottomRussianSize}`}
                recommendedValue={98}
                onChange={setMeasHips}
              />

              {/* Fit Preference */}
              <div className="space-y-2 neu-inset rounded-2xl p-3 ">
                <span className="text-xs font-extrabold text-text-primary block">
                  Предпочитаемая посадка:
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'tight', label: 'Облегающая', sub: 'Slim Fit' },
                    { id: 'regular', label: 'Стандартная', sub: 'Regular' },
                    { id: 'loose', label: 'Свободная', sub: 'Oversize' },
                  ].map((pref) => {
                    const isActive = measFit === pref.id;
                    return (
                      <button
                        key={pref.id}
                        type="button"
                        onClick={() => setMeasFit(pref.id as any)}
                        className={`py-2 px-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                          isActive
                            ? 'neu-pill-active font-extrabold'
                            : 'neu-button text-text-secondary hover:text-text-primary'
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
          </div>

              {/* Action Buttons - Sticky Footer */}
              <div className="p-3.5 sm:p-4 neu-divider-t flex gap-2.5 shrink-0 bg-[#E3E8EF]">
                <button
                  type="button"
                  onClick={() => setIsEditingMeasurements(false)}
                  className="flex-1 py-3 neu-button rounded-xl text-text-secondary font-bold text-xs hover:text-text-primary cursor-pointer transition-transform"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isSavingMeasurements}
                  className="flex-1 py-3 neu-button-accent rounded-xl font-extrabold text-xs text-white cursor-pointer transition-transform flex items-center justify-center gap-1.5 disabled:cursor-wait"
                >
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  <span>{isSavingMeasurements ? 'Сохранение…' : 'Сохранить лекало'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
