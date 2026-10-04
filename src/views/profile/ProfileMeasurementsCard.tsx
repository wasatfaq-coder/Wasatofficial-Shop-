import { Pencil, Ruler } from 'lucide-react';
import { calculateRussianPattern } from '../../utils/russianSizing';
import { UserProfile } from '../../types';

import type { MeasurementsForm } from './useMeasurementsForm';

/** «Параметры фигуры»: the saved measurements and the Russian pattern from them; «Изменить» opens the form */
export function ProfileMeasurementsCard({ profile, form }: { profile: UserProfile; form: MeasurementsForm }) {
  const {
    setIsEditingMeasurements,
    setMeasHeight,
    setMeasWeight,
    setMeasChest,
    setMeasWaist,
    setMeasHips,
    setMeasFit,
  } = form;

  // Saved profile Russian pattern for the summary card
  const profileRussianPattern = calculateRussianPattern(
    profile.bodyMeasurements?.height ?? 184,
    profile.bodyMeasurements?.weight ?? 94,
    profile.bodyMeasurements?.chest ?? 104,
    profile.bodyMeasurements?.waist ?? 95,
    profile.bodyMeasurements?.hips ?? 98,
    profile.bodyMeasurements?.fitPreference ?? 'regular'
  );

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-bold text-[#2D3A4E] tracking-wider uppercase">
            Мерки профиля и лекало РФ
          </h3>
          <button
            onClick={() => {
              if (profile.bodyMeasurements) {
                setMeasHeight(profile.bodyMeasurements.height ?? 184);
                setMeasWeight(profile.bodyMeasurements.weight ?? 94);
                setMeasChest(profile.bodyMeasurements.chest ?? 104);
                setMeasWaist(profile.bodyMeasurements.waist ?? 95);
                setMeasHips(profile.bodyMeasurements.hips ?? 98);
                setMeasFit(profile.bodyMeasurements.fitPreference ?? 'regular');
              }
              setIsEditingMeasurements(true);
            }}
            className="neu-button px-2.5 py-1 rounded-xl text-xs font-bold text-accent flex items-center gap-1.5 cursor-pointer hover:text-[#2D3A4E] transition-all"
          >
            <Pencil className="w-3.5 h-3.5" />
            <span>Изменить</span>
          </button>
        </div>

        {profile.bodyMeasurements ? (
        <div className="neu-inset rounded-3xl p-4 space-y-3.5 border border-white/60">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-10 h-10 rounded-2xl neu-flat-sm flex items-center justify-center text-accent shrink-0">
                <Ruler className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-extrabold text-[#2D3A4E] truncate">
                  Российское размерное лекало
                </p>
                <p className="text-xs text-[#4E5C70] font-medium truncate">
                  {profileRussianPattern.recommendedFit}
                </p>
              </div>
            </div>

            <div className="text-right shrink-0">
              <span className="text-[11px] font-bold text-[#4E5C70] block">Стандартный размер</span>
              <span className="text-sm font-extrabold text-accent neu-inset px-2 py-0.5 rounded-lg inline-block">
                {profileRussianPattern.topSizeLabel}
              </span>
            </div>
          </div>

          {/* Key Russian Pattern Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="neu-flat rounded-2xl p-2.5 text-center border border-white/70">
              <span className="text-[11px] text-[#4E5C70] font-medium block">Верхняя одежда</span>
              <span className="text-xs font-extrabold text-[#2D3A4E]">
                {profileRussianPattern.topSizeLabel}
              </span>
              <span className="text-[11px] text-[#4E5C70] block mt-0.5">
                ПОГ: {Math.round((profile.bodyMeasurements?.chest ?? 104) / 2)} см
              </span>
            </div>

            <div className="neu-flat rounded-2xl p-2.5 text-center border border-white/70">
              <span className="text-[11px] text-[#4E5C70] font-medium block">Брюки / Джинсы</span>
              <span className="text-xs font-extrabold text-[#2D3A4E]">
                {profileRussianPattern.bottomSizeLabel}
              </span>
              <span className="text-[11px] text-[#4E5C70] block mt-0.5">
                Пояс: {profile.bodyMeasurements?.waist ?? 95} см
              </span>
            </div>

            <div className="neu-flat rounded-2xl p-2.5 text-center border border-white/70">
              <span className="text-[11px] text-[#4E5C70] font-medium block">Ростовка РФ</span>
              <span className="text-xs font-extrabold text-[#2D3A4E]">
                {profileRussianPattern.heightGroupNumber}-я группа
              </span>
              <span className="text-[11px] text-[#4E5C70] block mt-0.5">
                {profileRussianPattern.heightRange}
              </span>
            </div>

            <div className="neu-flat rounded-2xl p-2.5 text-center border border-white/70">
              <span className="text-[11px] text-[#4E5C70] font-medium block">Полнота / ИМТ</span>
              <span className="text-xs font-extrabold text-[#2D3A4E]">
                {profileRussianPattern.fullnessGroup}-я полнота
              </span>
              <span className="text-[11px] text-[#4E5C70] block mt-0.5">
                ИМТ: {profileRussianPattern.bmi}
              </span>
            </div>
          </div>

          {/* Measurements summary strip */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#BAC5D5]/40 text-[11px] font-bold text-[#4E5C70]">
            <div>
              Мерки тела:{' '}
              <span className="text-[#2D3A4E] font-extrabold">
                {profile.bodyMeasurements?.height ?? 184} см • {profile.bodyMeasurements?.weight ?? 94} кг
              </span>
            </div>
            <div>
              ОГ / ОТ / ОБ:{' '}
              <span className="text-[#2D3A4E] font-extrabold">
                {profile.bodyMeasurements?.chest ?? 104} • {profile.bodyMeasurements?.waist ?? 95} • {profile.bodyMeasurements?.hips ?? 98} см
              </span>
            </div>
          </div>
        </div>
        ) : (
          <div className="neu-inset rounded-3xl p-4 border border-white/60 text-center space-y-1">
            <p className="text-xs font-bold text-[#2D3A4E]">Мерки еще не указаны</p>
            <p className="text-xs text-[#4E5C70]">
              Нажмите «Изменить» и укажите рост, вес и обхваты — подберем размер по российским лекалам.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
