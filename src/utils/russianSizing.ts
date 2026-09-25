/**
 * Russian Garment Sizing Standards (ГОСТ 31399-2009, ГОСТ Р 52771-2007)
 * Реальное размерное лекало для типовых мужских фигур РФ
 */

export interface RussianSizingResult {
  // Верхняя одежда (куртки, пиджаки, худи, рубашки, пальто)
  topRussianSize: number;
  topInternationalSize: string;
  topSizeLabel: string;

  // Нижняя одежда (брюки, джинсы, чиносы)
  bottomRussianSize: number;
  jeansWaistSize: string;
  bottomSizeLabel: string;

  // Ростовочная группа по ГОСТ РФ
  heightGroupNumber: number;
  heightRange: string;
  heightGroupLabel: string;

  // Полнотная группа по ГОСТ РФ (разница ОГ - ОТ)
  fullnessGroup: number;
  fullnessLabel: string;
  dropValue: number;

  // Индекс массы тела
  bmi: number;
  bmiStatus: string;

  // Рекомендованный крой лекала с учетом предпочтений
  recommendedFit: string;
  patternSummary: string;
}

interface RussianSizeTableRow {
  ru: number;
  int: string;
  chest: string;
  waist: string;
  hips: string;
  jeans: string;
}

export const RUSSIAN_SIZE_TABLE_ROWS: RussianSizeTableRow[] = [
  { ru: 44, int: 'XS', chest: '86–89', waist: '74–77', hips: '92–95', jeans: 'W29–W30' },
  { ru: 46, int: 'S', chest: '90–93', waist: '78–81', hips: '96–99', jeans: 'W30–W31' },
  { ru: 48, int: 'M', chest: '94–97', waist: '82–85', hips: '100–103', jeans: 'W32' },
  { ru: 50, int: 'L', chest: '98–101', waist: '86–89', hips: '104–107', jeans: 'W33–W34' },
  { ru: 52, int: 'XL', chest: '102–105', waist: '90–95', hips: '108–111', jeans: 'W35–W36' },
  { ru: 54, int: '2XL', chest: '106–109', waist: '96–101', hips: '112–115', jeans: 'W38' },
  { ru: 56, int: '3XL', chest: '110–113', waist: '102–107', hips: '116–119', jeans: 'W40' },
  { ru: 58, int: '4XL', chest: '114–117', waist: '108–113', hips: '120–123', jeans: 'W42' },
  { ru: 60, int: '5XL', chest: '118–122', waist: '114–119', hips: '124–127', jeans: 'W44' },
];

const RUSSIAN_TO_INT_SIZE_MAP: Record<number, string> = {
  42: 'XXS',
  44: 'XS',
  46: 'S',
  48: 'M',
  50: 'L',
  52: 'XL',
  54: '2XL',
  56: '3XL',
  58: '4XL',
  60: '5XL',
  62: '6XL',
  64: '7XL',
};

/**
 * Рассчитывает официальный российский размер и параметры лекала РФ
 */
export function calculateRussianPattern(
  height: number,
  weight: number,
  chest: number,
  waist: number,
  hips: number,
  fitPreference: 'tight' | 'regular' | 'loose' = 'regular'
): RussianSizingResult {
  // 1. Верхняя одежда (ПОГ = полуобхват груди по ГОСТ РФ)
  let topSize = Math.round(chest / 2);
  // Приведение к четным стандартным размерам РФ (44..64)
  if (topSize % 2 !== 0) {
    if (fitPreference === 'tight') topSize -= 1;
    else if (fitPreference === 'loose') topSize += 1;
    else topSize = Math.round(chest / 2);
  }
  // Clamp within realistic Russian male sizing bounds
  topSize = Math.max(42, Math.min(64, topSize));

  const topInt = RUSSIAN_TO_INT_SIZE_MAP[topSize] || (topSize > 64 ? '7XL+' : 'M');

  // 2. Брюки и джинсы (ГОСТ РФ + джинсовый пояс в дюймах)
  let bottomSize = 48;
  let jeansWaist = 'W32';

  if (waist < 76) {
    bottomSize = 44;
    jeansWaist = 'W29–W30';
  } else if (waist < 80) {
    bottomSize = 46;
    jeansWaist = 'W30–W31';
  } else if (waist < 84) {
    bottomSize = 48;
    jeansWaist = 'W32';
  } else if (waist < 88) {
    bottomSize = 50;
    jeansWaist = 'W33–W34';
  } else if (waist <= 95) {
    bottomSize = 52;
    jeansWaist = 'W35–W36';
  } else if (waist <= 101) {
    bottomSize = 54;
    jeansWaist = 'W38';
  } else if (waist <= 107) {
    bottomSize = 56;
    jeansWaist = 'W40';
  } else if (waist <= 113) {
    bottomSize = 58;
    jeansWaist = 'W42';
  } else {
    bottomSize = 60;
    jeansWaist = 'W44+';
  }

  // 3. Ростовочная шкала по ГОСТ РФ
  let heightGroupNumber = 4;
  let heightRange = '176–182 см';

  if (height < 164) {
    heightGroupNumber = 1;
    heightRange = '158–164 см';
  } else if (height < 170) {
    heightGroupNumber = 2;
    heightRange = '164–170 см';
  } else if (height < 176) {
    heightGroupNumber = 3;
    heightRange = '170–176 см';
  } else if (height < 182) {
    heightGroupNumber = 4;
    heightRange = '176–182 см';
  } else if (height < 188) {
    heightGroupNumber = 5;
    heightRange = '182–188 см';
  } else if (height < 194) {
    heightGroupNumber = 6;
    heightRange = '188–194 см';
  } else {
    heightGroupNumber = 7;
    heightRange = '194–205 см';
  }

  // 4. Полнотная группа (ОГ минус ОТ)
  const drop = chest - waist;
  let fullnessGroup = 2;
  let fullnessLabel = '2-я (Стандартное телосложение)';

  if (drop >= 14) {
    fullnessGroup = 1;
    fullnessLabel = '1-я (Атлетическое / Приталенное)';
  } else if (drop >= 10) {
    fullnessGroup = 2;
    fullnessLabel = '2-я (Стандартное классическое)';
  } else if (drop >= 6) {
    fullnessGroup = 3;
    fullnessLabel = '3-я (Плотное телосложение)';
  } else {
    fullnessGroup = 4;
    fullnessLabel = '4-я (Крепкое / Свободный крой)';
  }

  // 5. ИМТ (Индекс Кетле)
  const heightM = height / 100;
  const bmi = Number((weight / (heightM * heightM)).toFixed(1));
  let bmiStatus = 'Нормальный вес';
  if (bmi < 18.5) bmiStatus = 'Дефицит массы';
  else if (bmi < 25) bmiStatus = 'Нормальное сложение';
  else if (bmi < 30) bmiStatus = 'Плотное сложение';
  else bmiStatus = 'Повышенная масса';

  // 6. Рекомендованный крой
  let recommendedFit = 'Классический прямой силуэт (Regular Fit)';
  if (fitPreference === 'tight') {
    recommendedFit = 'Приталенный силуэт по фигуре (Slim Fit)';
  } else if (fitPreference === 'loose') {
    recommendedFit = 'Свободный комфортный силуэт (Relaxed / Oversize)';
  }

  const patternSummary = `RU ${topSize} (${topInt}) • ${heightRange} • ${fullnessLabel}`;

  return {
    topRussianSize: topSize,
    topInternationalSize: topInt,
    topSizeLabel: `RU ${topSize} (${topInt})`,
    bottomRussianSize: bottomSize,
    jeansWaistSize: jeansWaist,
    bottomSizeLabel: `RU ${bottomSize} (${jeansWaist})`,
    heightGroupNumber,
    heightRange,
    heightGroupLabel: `${heightGroupNumber}-я ростовка (${heightRange})`,
    fullnessGroup,
    fullnessLabel,
    dropValue: drop,
    bmi,
    bmiStatus,
    recommendedFit,
    patternSummary,
  };
}
