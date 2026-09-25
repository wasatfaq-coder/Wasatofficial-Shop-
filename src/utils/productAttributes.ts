import { Product, FabricCompositionItem, CareInstructionItem } from '../types';

/**
 * Standard Fabric Composition Presets by Product Type & Material
 */
const DEFAULT_FABRIC_COMPOSITIONS: Record<string, FabricCompositionItem[]> = {
  linen: [
    { fiber: 'Натуральный органический лен', percentage: 100 },
  ],
  linen_blend: [
    { fiber: 'Европейский лен', percentage: 80 },
    { fiber: 'Мягкий хлопок', percentage: 20 },
  ],
  cotton_pique: [
    { fiber: 'Органический хлопок пике', percentage: 95 },
    { fiber: 'Эластан', percentage: 5 },
  ],
  cotton_twill: [
    { fiber: 'Премиум хлопок Twill', percentage: 98 },
    { fiber: 'Эластан', percentage: 2 },
  ],
  jacket_poly_wool: [
    { fiber: 'Водоотталкивающий микрополиэстер', percentage: 70 },
    { fiber: 'Шерсть тонкорунная', percentage: 30 },
  ],
  fleece_cotton: [
    { fiber: 'Хлопок пенье (футер 3-х нитка)', percentage: 85 },
    { fiber: 'Полиэстер высокой прочности', percentage: 15 },
  ],
};

/**
 * Standard Care Instructions by Category & Fabric Type
 */
const DEFAULT_CARE_INSTRUCTIONS: Record<string, CareInstructionItem[]> = {
  linen: [
    { icon: 'wash', label: 'Стирка до 30°C', desc: 'Деликатный или ручной режим без интенсивного механического воздействия' },
    { icon: 'bleach', label: 'Без хлора', desc: 'Использовать только мягкие жидкие гели без отбеливателей' },
    { icon: 'dry', label: 'Сушка в расправленном виде', desc: 'Сушить естественным путем на плечиках вдали от прямых солнечных лучей' },
    { icon: 'iron', label: 'Глажка во влажном виде', desc: 'Гладить с изнаночной стороны с отпариванием при температуре до 180°C' },
    { icon: 'clean', label: 'Химчистка щадящая', desc: 'Разрешена сухая чистка в щадящем режиме' },
  ],
  cotton: [
    { icon: 'wash', label: 'Стирка до 40°C', desc: 'Стандартная машинная стирка с вещами схожих оттенков' },
    { icon: 'bleach', label: 'Не отбеливать', desc: 'Хлорные и агрессивные оптические отбеливатели запрещены' },
    { icon: 'dry', label: 'Деликатный отжим', desc: 'Отжим на оборотах до 800 об/мин, сушка в тени' },
    { icon: 'iron', label: 'Глажка до 150°C', desc: 'Гладить с умеренным паром' },
    { icon: 'clean', label: 'Химчистка P', desc: 'Обычная сухая чистка перхлорэтиленом' },
  ],
  outerwear: [
    { icon: 'wash', label: 'Ручная стирка 30°C', desc: 'Стирать специальными средствами для верхней одежды' },
    { icon: 'bleach', label: 'Запрещено отбеливание', desc: 'Не подвергать воздействию хлора и растворителей' },
    { icon: 'dry', label: 'Не сушить в барабане', desc: 'Сушить в вертикальном положении на широких плечиках' },
    { icon: 'iron', label: 'Глажка до 110°C', desc: 'Гладить через защитную влажную ткань или отпаривателем' },
    { icon: 'clean', label: 'Профессиональная химчистка', desc: 'Рекомендуется сухая чистка для сохранения формы и водоотталкивающей пропитки' },
  ],
};

/**
 * Returns Fabric Composition for a product
 */
export function getProductFabricComposition(product: Product): FabricCompositionItem[] {
  if (product.fabricComposition && product.fabricComposition.length > 0) {
    return product.fabricComposition;
  }
  const mat = (product.material || '').toLowerCase();
  if (mat.includes('лен') || mat.includes('лён')) {
    return DEFAULT_FABRIC_COMPOSITIONS.linen;
  }
  if (mat.includes('пике') || mat.includes('поло')) {
    return DEFAULT_FABRIC_COMPOSITIONS.cotton_pique;
  }
  if (mat.includes('twill') || mat.includes('брюк') || product.category === 'trousers') {
    return DEFAULT_FABRIC_COMPOSITIONS.cotton_twill;
  }
  if (mat.includes('куртк') || mat.includes('бомбер') || product.category === 'jackets') {
    return DEFAULT_FABRIC_COMPOSITIONS.jacket_poly_wool;
  }
  if (mat.includes('футер') || mat.includes('свитшот') || product.category === 'sweatshirts') {
    return DEFAULT_FABRIC_COMPOSITIONS.fleece_cotton;
  }
  return [
    { fiber: 'Органический хлопок высшего качества', percentage: 95 },
    { fiber: 'Эластан', percentage: 5 },
  ];
}

/**
 * Returns Care Instructions list for a product
 */
export function getProductCareInstructions(product: Product): CareInstructionItem[] {
  if (product.careInstructions && product.careInstructions.length > 0) {
    return product.careInstructions;
  }
  const mat = (product.material || '').toLowerCase();
  if (mat.includes('лен') || mat.includes('лён') || product.category === 'linen') {
    return DEFAULT_CARE_INSTRUCTIONS.linen;
  }
  if (product.category === 'jackets') {
    return DEFAULT_CARE_INSTRUCTIONS.outerwear;
  }
  return DEFAULT_CARE_INSTRUCTIONS.cotton;
}
