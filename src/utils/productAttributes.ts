import type { Product, FabricCompositionItem, CareInstructionItem, ProductFeature, ProductSpec } from '../types';

/**
 * Product card sections come only from the product itself (Admin → product → «Структура карточки»).
 * Nothing is made up: a section without data is not shown to customers.
 */

export const FIT_LABELS: Record<NonNullable<Product['fit']>, string> = {
  slim: 'Приталенный (Slim Fit)',
  regular: 'Классический (Regular Fit)',
  oversize: 'Свободный (Oversize)',
};

export const CARE_ICON_LABELS: Record<CareInstructionItem['icon'], string> = {
  wash: 'Стирка',
  bleach: 'Отбеливание',
  dry: 'Сушка',
  iron: 'Глажка',
  clean: 'Химчистка',
};

const filled = (value?: string | null) => Boolean(value && value.trim());

export const DENSITY_UNIT = 'г/м²';

/** Number part of a stored density ("185 г/м²" → "185"); the admin types only the number */
export function fabricDensityNumber(value?: string | null): string {
  const match = (value ?? '').replace(',', '.').match(/\d+(?:\.\d+)?/);
  return match ? match[0] : '';
}

/** Density as shown and stored: the number with «г/м²» */
export function formatFabricDensity(value?: string | null): string {
  const number = fabricDensityNumber(value);
  return number ? `${number} ${DENSITY_UNIT}` : '';
}

/**
 * Text form of the fiber composition ("75% хлопок, 25% шерсть"). Saved as product.material,
 * which the catalog's material filter, search and invoices read.
 */
export function compositionToMaterial(items: FabricCompositionItem[]): string {
  return items
    .filter((item) => filled(item.fiber) && item.percentage > 0)
    .map((item) => `${item.percentage}% ${item.fiber.trim().toLowerCase()}`)
    .join(', ');
}

export function getProductFabricComposition(product: Product): FabricCompositionItem[] {
  return (product.fabricComposition ?? []).filter((item) => filled(item.fiber) && item.percentage > 0);
}

export function getProductCareInstructions(product: Product): CareInstructionItem[] {
  return (product.careInstructions ?? []).filter((item) => filled(item.label));
}

export function getProductFeatures(product: Product): ProductFeature[] {
  return (product.features ?? []).filter((item) => filled(item.title));
}

export function getProductCertifications(product: Product): string[] {
  return (product.certifications ?? []).map((c) => c.trim()).filter(Boolean);
}

/** Characteristic rows of «Состав и ткань» that have a value (SKU codes are added by the screen) */
export function getProductSpecRows(product: Product): ProductSpec[] {
  const rows: ProductSpec[] = [];
  const density = formatFabricDensity(product.fabricDensity);
  if (density) rows.push({ label: 'Плотность ткани', value: density });
  if (filled(product.weave)) rows.push({ label: 'Тип переплетения', value: product.weave!.trim() });
  if (product.fit && FIT_LABELS[product.fit]) rows.push({ label: 'Покрой / посадка', value: FIT_LABELS[product.fit] });
  if (filled(product.countryOfOrigin)) rows.push({ label: 'Страна производства', value: product.countryOfOrigin!.trim() });
  for (const spec of product.specs ?? []) {
    if (filled(spec.label) && filled(spec.value)) rows.push({ label: spec.label.trim(), value: spec.value.trim() });
  }
  return rows;
}
