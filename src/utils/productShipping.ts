import type { Order, Product, ProductPackageCm } from '../types';
import { pluralRu } from './pluralize';

/**
 * Weight and package of a product (stage 15 of docs/admin-wholesale-plan.md): `weightGrams` — one item in its package,
 * `packageCm` — the package of one item. The form, CSV, invoice and order card read and check them only here.
 */

/** Weight of one item, grams: 1 g … 100 kg */
export const WEIGHT_GRAMS_MAX = 100_000;
/** One side of the package, cm */
export const PACKAGE_CM_MAX = 500;

/** The product's weight of one item, or undefined when not set or not a sane number */
export function productWeightGrams(product: Pick<Product, 'weightGrams'> | null | undefined): number | undefined {
  const grams = Number(product?.weightGrams);
  return Number.isInteger(grams) && grams > 0 && grams <= WEIGHT_GRAMS_MAX ? grams : undefined;
}

/** The product's package, or undefined unless all three sides are sane numbers */
export function productPackageCm(product: Pick<Product, 'packageCm'> | null | undefined): ProductPackageCm | undefined {
  const box = product?.packageCm;
  if (!box) return undefined;
  // to a millimetre; a side that rounds to 0 is not a package (0.04 cm would be saved as 0 and vanish on reading)
  const sides = [box.l, box.w, box.h].map((n) => Math.round(Number(n) * 10) / 10);
  if (!sides.every((n) => Number.isFinite(n) && n > 0 && n <= PACKAGE_CM_MAX)) return undefined;
  const [l, w, h] = sides;
  return { l, w, h };
}

/** «350 г», «1,2 кг», «12 кг» */
export function formatWeight(grams: number): string {
  if (grams < 1000) return `${Math.round(grams)} г`;
  const kg = grams / 1000;
  return `${kg.toLocaleString('ru-RU', { maximumFractionDigits: kg < 10 ? 2 : 1 })} кг`;
}

/** «30 × 20 × 5 см» */
export function formatPackage(box: ProductPackageCm): string {
  return `${[box.l, box.w, box.h].map((n) => n.toLocaleString('ru-RU')).join(' × ')} см`;
}

/** Problem of the form's weight field ('' — empty, allowed), or null */
export function weightProblem(text: string): string | null {
  const value = text.trim();
  if (!value) return null;
  const grams = Number(value.replace(',', '.'));
  if (!Number.isInteger(grams) || grams <= 0) return 'Вес — целое число граммов больше нуля';
  if (grams > WEIGHT_GRAMS_MAX) return `Вес — не больше ${WEIGHT_GRAMS_MAX.toLocaleString('ru-RU')} г`;
  return null;
}

/** Problem of the form's three package fields (all empty is allowed), or null */
export function packageProblem(sides: [string, string, string]): string | null {
  const filled = sides.map((s) => s.trim());
  if (filled.every((s) => !s)) return null;
  if (filled.some((s) => !s)) return 'Габариты — укажите длину, ширину и высоту или оставьте все три пустыми';
  const numbers = filled.map((s) => Number(s.replace(',', '.')));
  if (!numbers.every((n) => Number.isFinite(n) && n >= 0.1)) return 'Габариты — числа от 0,1, в сантиметрах';
  if (numbers.some((n) => n > PACKAGE_CM_MAX)) return `Габариты — каждая сторона не больше ${PACKAGE_CM_MAX} см`;
  return null;
}

/** The package from the form's three fields (call after packageProblem returned null); undefined — empty */
export function packageFromFields(sides: [string, string, string]): ProductPackageCm | undefined {
  if (sides.every((s) => !s.trim())) return undefined;
  const [l, w, h] = sides.map((s) => Number(s.trim().replace(',', '.')));
  return productPackageCm({ packageCm: { l, w, h } });
}

/**
 * A CSV cell of the package: «30×20×5», «30 x 20 x 5», «30*20*5» (cm). '' — the cell does not change the product;
 * '-' (or «—», «нет») — remove; null — not a package (the import reports the row)
 */
export function packageFromCell(cell: string): ProductPackageCm | 'remove' | '' | null {
  const value = cell.trim();
  if (!value) return '';
  if (/^(-|—|нет)$/i.test(value)) return 'remove';
  const parts = value.replace(/\s*см\.?$/i, '').split(/\s*[×xх*]\s*/i);
  if (parts.length !== 3) return null;
  const box = productPackageCm({ packageCm: { l: Number(parts[0].replace(',', '.')), w: Number(parts[1].replace(',', '.')), h: Number(parts[2].replace(',', '.')) } });
  return box ?? null;
}

/** The CSV cell of a package: «30×20×5» or '' */
export function packageCell(product: Pick<Product, 'packageCm'>): string {
  const box = productPackageCm(product);
  return box ? `${box.l}×${box.w}×${box.h}` : '';
}

export interface OrderWeight {
  /** Sum of the lines whose weight is known, grams */
  grams: number;
  /** Lines without a known weight: the sum is then a lower bound */
  linesWithoutWeight: number;
  /** Some weights were taken from today's catalog (an order placed before weights were kept in its lines) */
  fromCatalog: boolean;
}

/**
 * Weight of an order's goods: each line's weight as ordered (the line's copy of the product), else today's catalog
 * weight of that product. Packaging of the parcel itself is not added — the shop knows it only at packing
 */
export function orderWeight(
  items: Order['items'],
  catalog: Pick<Product, 'id' | 'weightGrams'>[] = []
): OrderWeight {
  const catalogWeight = new Map(catalog.map((p) => [p.id, productWeightGrams(p)]));
  let grams = 0;
  let linesWithoutWeight = 0;
  let fromCatalog = false;
  for (const item of items ?? []) {
    const quantity = Math.max(0, Number(item.quantity) || 0);
    if (quantity === 0) continue;
    const own = productWeightGrams(item.product);
    const today = own === undefined ? catalogWeight.get(item.product?.id) : undefined;
    const weight = own ?? today;
    if (weight === undefined) {
      linesWithoutWeight++;
      continue;
    }
    if (own === undefined) fromCatalog = true;
    grams += weight * quantity;
  }
  return { grams, linesWithoutWeight, fromCatalog };
}

/**
 * «Вес товаров» of the invoice and the order card: «1,2 кг», «не меньше 1,2 кг — у 2 позиций вес не указан»,
 * «≈ 1,2 кг (вес из каталога)». null — no line has a weight (the shop does not keep weights): nothing to show
 */
export function orderWeightText(weight: OrderWeight): string | null {
  if (weight.grams <= 0) return null;
  const sum = formatWeight(weight.grams);
  if (weight.linesWithoutWeight > 0) {
    const n = weight.linesWithoutWeight;
    return `не меньше ${sum} — у ${n} ${pluralRu(n, ['позиции', 'позиций', 'позиций'])} вес не указан`;
  }
  return weight.fromCatalog ? `≈ ${sum} (вес из каталога)` : sum;
}
