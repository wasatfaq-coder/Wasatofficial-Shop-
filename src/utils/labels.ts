import type { LabelFormat } from '../types';
import { encodeBarcode, type EncodedBarcode } from '../shared/barcode';

/**
 * Product labels: one layout (in millimetres) is drawn both in the preview canvas and in the PDF,
 * so the file matches what the admin sees. Bars go into the PDF as vector rectangles.
 */

export type LabelTemplate =
  | 'classic'
  | 'minimal'
  | 'price'
  | 'size-price'
  | 'card'
  | 'tag'
  | 'showcase'
  | 'price-info'
  | 'premium'
  | 'sale'
  | 'wholesale-pack'
  | 'wholesale-box'
  | 'dual-price'
  | 'wholesale-tiers';

export type LabelTemplateGroup = 'basic' | 'extended' | 'wholesale' | 'accent' | 'sale';

export type LabelPriceMode = 'auto' | 'retail' | 'wholesale' | 'both';

export interface LabelTemplateInfo {
  id: LabelTemplate;
  name: string;
  hint: string;
  group: LabelTemplateGroup;
  /** Shows the size: one label per variation; otherwise one per article (all sizes share it) */
  showsSize: boolean;
  /** Needs an old price above the current one in the product card */
  needsOldPrice?: boolean;
}

export const LABEL_TEMPLATES: LabelTemplateInfo[] = [
  { id: 'classic', name: 'Классический', hint: 'Товар, цвет, артикул, штрихкод и цена', group: 'basic', showsSize: false },
  { id: 'minimal', name: 'Минимал', hint: 'Штрихкод на всю ширину, артикул и цена внизу', group: 'basic', showsSize: false },
  { id: 'price', name: 'Ценник', hint: 'Крупная цена, товар, артикул и штрихкод', group: 'basic', showsSize: false },
  { id: 'size-price', name: 'Размер и цена', hint: 'Крупные размер и цена, состав, артикул', group: 'extended', showsSize: true },
  { id: 'card', name: 'Карточка', hint: 'Полоса с размером и ценой, название, состав', group: 'extended', showsSize: true },
  { id: 'tag', name: 'Бирка', hint: 'Все по центру: размер, цена, товар, состав', group: 'extended', showsSize: true },
  {
    id: 'wholesale-pack',
    name: 'Ростовка',
    hint: 'Упаковочный лист: сетка размеров, кол-во штук, артикул, сумма пачки и цена за 1 шт.',
    group: 'wholesale',
    showsSize: false,
  },
  {
    id: 'wholesale-box',
    name: 'Оптовый короб',
    hint: 'Складская этикетка для короба: крупный артикул на плашке, пачка, штрихкод и цена',
    group: 'wholesale',
    showsSize: false,
  },
  {
    id: 'dual-price',
    name: 'Опт и Розница',
    hint: 'Двойной ценник: розничная и оптовая цена, стоимость упаковки и условия выкупа',
    group: 'wholesale',
    showsSize: true,
  },
  {
    id: 'wholesale-tiers',
    name: 'Опт от объема',
    hint: 'Оптовая цена и таблица скидок от количества упаковок',
    group: 'wholesale',
    showsSize: false,
  },
  { id: 'showcase', name: 'Витрина', hint: 'Крупное название, цвет, размер, состав, цена на темной полосе', group: 'accent', showsSize: true },
  { id: 'price-info', name: 'Цена и детали', hint: 'Цена во всю ширину, название и таблица: цвет, размер, состав, артикул', group: 'accent', showsSize: true },
  { id: 'premium', name: 'Премиум', hint: 'В рамке по центру: название, детали, крупная цена', group: 'accent', showsSize: true },
  { id: 'sale', name: 'Скидка', hint: 'Крупные новая цена и процент скидки, зачеркнутая старая цена', group: 'sale', showsSize: false, needsOldPrice: true },
];

export const LABEL_TEMPLATE_GROUPS: { id: LabelTemplateGroup; title: string }[] = [
  { id: 'basic', title: 'Без размера' },
  { id: 'extended', title: 'С размером и составом' },
  { id: 'wholesale', title: 'Опт и упаковка' },
  { id: 'accent', title: 'Акцент на цене и названии' },
  { id: 'sale', title: 'Скидка' },
];

export const templateInfo = (id: LabelTemplate) => LABEL_TEMPLATES.find((t) => t.id === id) ?? LABEL_TEMPLATES[0];

/** Offered when adding a format; saved only when the admin adds one */
export const LABEL_FORMAT_PRESETS: Omit<LabelFormat, 'id'>[] = [
  { name: 'Термоэтикетка', widthMm: 58, heightMm: 40 },
  { name: 'Ценник', widthMm: 70, heightMm: 50 },
  { name: 'Малая этикетка', widthMm: 43, heightMm: 25 },
  { name: 'Бирка', widthMm: 40, heightMm: 60 },
  { name: 'Короб / Ростовка', widthMm: 100, heightMm: 70 },
];

export const LABEL_SIZE_LIMITS = { min: 20, max: 120 };

/** Everything on a label comes from the catalog (product and its variation or size pack) */
export interface LabelData {
  title: string;
  color: string;
  size: string;
  /** True article code without the size (MS-JK03-BLU) */
  article: string;
  /** Fabric composition text («75% хлопок, 25% шерсть») */
  composition: string;
  barcode: string;
  price: number;
  oldPrice?: number;
  /**
   * «Ростовка» (a size pack): its composition «48-50-52 / 1-2-1» instead of the size. It identifies the pack, so every
   * template prints it (the size has no place on a pack label: `size` is empty).
   */
  packLine?: string;
  /** Name of the size pack or wholesale pack («Ростовка 48–52» or «Упаковка 5 шт.») */
  packTitle?: string;
  /** Structured size breakdown of a size pack for grid rendering */
  packSizes?: { size: string; qty: number }[];
  /** Total pieces in one pack or size-run pack */
  packPieces?: number;
  /** Retail unit price when available */
  retailPrice?: number;
  /** Wholesale price per single unit when available */
  wholesaleUnitPrice?: number;
  /** Total wholesale price for the whole pack or size-run pack */
  packPrice?: number;
  /** Minimum order / pack terms («Упаковка — 5 шт. · от 2 уп.») */
  wholesaleTerms?: string;
  /** Volume discount tiers from storefront wholesale settings */
  wholesaleSteps?: { threshold: string; price: number; discount: string }[];
  /** The pack has no price: the label has no price block, like `showPrice: false` */
  noPrice?: boolean;
}

export const hasSaleOldPrice = (data: Pick<LabelData, 'price' | 'oldPrice'>) =>
  data.oldPrice !== undefined && data.oldPrice > data.price;

export interface LabelOptions {
  showPrice: boolean;
  showBarcode: boolean;
  priceMode?: LabelPriceMode;
}

type Weight = 500 | 600 | 700 | 800;

interface TextItem {
  kind: 'text';
  text: string;
  x: number;
  /** Baseline */
  y: number;
  size: number;
  weight: Weight;
  align: 'left' | 'right' | 'center';
  mono?: boolean;
  strike?: boolean;
  /** White text on a filled box */
  inverse?: boolean;
}

interface RectItem {
  kind: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  radius: number;
  /** Filled black box; otherwise an outline of `lineWidth` */
  fill?: boolean;
  lineWidth?: number;
}

interface LineItem {
  kind: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
}

interface BarsItem {
  kind: 'bars';
  x: number;
  y: number;
  moduleWidth: number;
  height: number;
  modules: boolean[];
}

type LabelItem = TextItem | LineItem | BarsItem | RectItem;

export interface LabelLayout {
  widthMm: number;
  heightMm: number;
  items: LabelItem[];
  /** Text scale the content was fitted at (1 = the 58×40 reference) */
  scale: number;
  /** Optional lines left out because the label is too small */
  dropped: string[];
}

/** Width of a text in mm at the given size (mm) */
export type MeasureText = (text: string, sizeMm: number, weight: Weight, mono?: boolean) => number;

const FONT = "'Manrope', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const MONO = "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace";
const fontCss = (sizePx: number, weight: Weight, mono?: boolean) => `${weight} ${sizePx}px ${mono ? MONO : FONT}`;

const formatLabelPrice = (value: number) => `${Math.round(value).toLocaleString('ru-RU')} ₽`;

interface ResolvedPrices {
  primaryPrice: number;
  primaryLabel: string;
  secondaryLine: string;
  hasPrice: boolean;
}

/** Resolves which price(s) to display based on LabelData and the chosen LabelPriceMode */
export function resolveLabelPrices(data: LabelData, mode: LabelPriceMode = 'auto'): ResolvedPrices {
  const isPack = Boolean(data.packLine);
  const pieces = data.packPieces && data.packPieces > 0 ? data.packPieces : 1;

  if (mode === 'retail') {
    const p = data.retailPrice ?? data.price;
    return {
      primaryPrice: p,
      primaryLabel: 'Розница',
      secondaryLine: isPack && pieces > 1 ? `В пачке ${pieces} шт.` : '',
      hasPrice: p > 0 && (!data.noPrice || Boolean(data.retailPrice)),
    };
  }

  if (mode === 'wholesale') {
    if (isPack) {
      const p = data.packPrice ?? data.price;
      const unit = data.wholesaleUnitPrice ?? (p > 0 && pieces > 0 ? Math.round(p / pieces) : 0);
      return {
        primaryPrice: p,
        primaryLabel: pieces > 1 ? `Пачка (${pieces} шт.)` : 'Опт',
        secondaryLine: unit > 0 && pieces > 1 ? `За 1 шт.: ${formatLabelPrice(unit)}` : '',
        hasPrice: p > 0 && !data.noPrice,
      };
    }
    const unit = data.wholesaleUnitPrice ?? data.price;
    const packTotal = data.packPrice ?? (pieces > 1 ? unit * pieces : 0);
    return {
      primaryPrice: unit,
      primaryLabel: 'Опт',
      secondaryLine:
        packTotal > 0 && pieces > 1
          ? `Уп. ${pieces} шт.: ${formatLabelPrice(packTotal)}`
          : data.wholesaleTerms ?? '',
      hasPrice: unit > 0,
    };
  }

  if (mode === 'both') {
    if (isPack) {
      const p = data.packPrice ?? data.price;
      const unit = data.wholesaleUnitPrice ?? (p > 0 && pieces > 0 ? Math.round(p / pieces) : 0);
      const parts = [
        unit > 0 ? `1 шт.: ${formatLabelPrice(unit)}` : '',
        data.retailPrice ? `Розн.: ${formatLabelPrice(data.retailPrice)}` : '',
      ].filter(Boolean);
      return {
        primaryPrice: p,
        primaryLabel: `Пачка ${pieces} шт.`,
        secondaryLine: parts.join(' · '),
        hasPrice: p > 0 && !data.noPrice,
      };
    }
    const retail = data.retailPrice ?? data.price;
    const wh = data.wholesaleUnitPrice;
    const parts = [
      wh && wh !== retail ? `Опт: ${formatLabelPrice(wh)}/шт.` : '',
      data.packPrice && pieces > 1 ? `Уп. ${pieces} шт.: ${formatLabelPrice(data.packPrice)}` : '',
    ].filter(Boolean);
    return {
      primaryPrice: retail,
      primaryLabel: wh ? 'Розница' : 'Цена',
      secondaryLine: parts.join(' · '),
      hasPrice: retail > 0,
    };
  }

  // 'auto'
  if (isPack) {
    const p = data.packPrice ?? data.price;
    const unit = data.wholesaleUnitPrice ?? (p > 0 && pieces > 0 ? Math.round(p / pieces) : 0);
    return {
      primaryPrice: p,
      primaryLabel: pieces > 1 ? `Пачка ${pieces} шт.` : 'Цена',
      secondaryLine: unit > 0 && pieces > 1 ? `${formatLabelPrice(unit)} / шт.` : '',
      hasPrice: p > 0 && !data.noPrice,
    };
  }
  return {
    primaryPrice: data.price,
    primaryLabel: data.wholesaleUnitPrice && data.price === data.wholesaleUnitPrice ? 'Опт' : 'Цена',
    secondaryLine:
      data.price === data.wholesaleUnitPrice && data.packPrice && pieces > 1
        ? `Уп. ${pieces} шт.: ${formatLabelPrice(data.packPrice)}`
        : '',
    hasPrice: data.price > 0 && !data.noPrice,
  };
}

/** Cuts a text with «…» to fit the width */
function fit(text: string, maxWidth: number, size: number, weight: Weight, measure: MeasureText, mono?: boolean) {
  if (measure(text, size, weight, mono) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && measure(`${cut}…`, size, weight, mono) > maxWidth) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

/** Word wrap to at most `maxLines`; the last line is cut with «…» */
function wrap(text: string, maxWidth: number, size: number, weight: Weight, measure: MeasureText, maxLines: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  let i = 0;
  for (; i < words.length; i++) {
    const next = current ? `${current} ${words[i]}` : words[i];
    if (!current || measure(next, size, weight) <= maxWidth) {
      current = next;
      continue;
    }
    if (lines.length === maxLines - 1) break; // the rest goes to the last line and is cut
    lines.push(current);
    current = words[i];
  }
  const last = i < words.length ? `${current} ${words.slice(i).join(' ')}` : current;
  if (last) lines.push(last);
  return lines.map((line) => fit(line, maxWidth, size, weight, measure));
}

/* ------------------------------------------------------------------------------------------------
 * Auto-fit. A template is a column of blocks. For a text scale `s` every block knows its height;
 * the largest `s` whose column fits the label wins (optional lines are dropped first when even the
 * smallest readable scale does not fit). What is left goes to the barcode (up to a readable
 * maximum), then to the template's spacers, else evenly between the blocks: no empty zones.
 * ---------------------------------------------------------------------------------------------- */

/** Heights of a text line from its box top: to the baseline and the full line */
const ASCENT = 0.8;
const LINE = 1.02;
const LEADING = 1.12;

interface Block {
  /** Height at scale s */
  height: (s: number) => number;
  /** Draws from `top`; `extra` is the height the block got above `height(s)` (bars only) */
  draw: (top: number, s: number, extra: number) => void;
  /** Gap before the block, mm at s = 1 */
  gap?: number;
  /** How much taller the block may grow (bars) */
  grow?: (s: number) => number;
  /** Takes a share of the leftover height */
  spacer?: number;
  /** Dropped when the label is too small; lower drops first */
  optional?: number;
  /** Name for the «не поместилось» hint */
  name?: string;
  /** Sticks to the label edge: no margin and no gap on that side */
  bleed?: 'top' | 'bottom';
}

interface Ctx {
  w: number;
  h: number;
  m: number;
  cw: number;
  cx: number;
  right: number;
  measure: MeasureText;
  items: LabelItem[];
}

type TextStyle = { size: number; weight?: Weight; mono?: boolean; align?: TextItem['align']; maxLines?: number };

/** A wrapped text; sizes are mm at s = 1 */
function textBlock(c: Ctx, value: string, style: TextStyle, extra: Partial<Block> = {}): Block | null {
  if (!value.trim()) return null;
  const weight = style.weight ?? 700;
  const align = style.align ?? 'left';
  // A word is never cut in the middle when the text wraps: the size shrinks until the longest word fits
  const longest = (style.maxLines ?? 1) > 1 ? Math.max(...value.split(/\s+/).map((wd) => c.measure(wd, 1, weight, style.mono))) : 0;
  const sizeAt = (s: number) => Math.min(style.size * s, longest ? (c.cw / longest) * 0.98 : Infinity);
  const lines = (s: number) => wrap(value, c.cw, sizeAt(s), weight, c.measure, style.maxLines ?? 1);
  return {
    height: (s) => {
      const size = sizeAt(s);
      return size * (LINE + LEADING * (lines(s).length - 1));
    },
    draw: (top, s) => {
      const size = sizeAt(s);
      const x = align === 'center' ? c.cx : align === 'right' ? c.right : c.m;
      lines(s).forEach((l, i) =>
        c.items.push({ kind: 'text', text: l, x, y: top + size * (ASCENT + LEADING * i), size, weight, align, mono: style.mono })
      );
    },
    ...extra,
  };
}

/** One line that shrinks to the width instead of being cut (prices) */
function shrinkBlock(c: Ctx, value: string, style: TextStyle & { max?: number }, extra: Partial<Block> = {}): Block {
  const weight = style.weight ?? 800;
  const align = style.align ?? 'left';
  const size = (s: number) =>
    Math.min(style.size * s, style.max ?? Infinity, (c.cw / Math.max(0.1, c.measure(value, 1, weight, style.mono))) * 0.98);
  return {
    height: (s) => size(s) * LINE,
    draw: (top, s) => {
      const f = size(s);
      const x = align === 'center' ? c.cx : align === 'right' ? c.right : c.m;
      c.items.push({ kind: 'text', text: value, x, y: top + f * ASCENT, size: f, weight, align, mono: style.mono });
    },
    ...extra,
  };
}

/** Barcode with its digits; grows from a readable minimum to a maximum, never taller than wide */
function barcodeBlock(c: Ctx, code: EncodedBarcode, tallBoost = 1): Block {
  const quiet = code.kind === 'ean13' ? 11 + 7 : 20;
  const moduleWidth = Math.min(0.5, c.cw / (code.modules.length + quiet));
  const barsWidth = moduleWidth * code.modules.length;
  const digits = (s: number) => Math.max(1.8, Math.min(2.2 * s, 3.2));
  const minBars = Math.max(4, Math.min(c.h * 0.2 * tallBoost, 9 * tallBoost));
  const maxBars = Math.max(minBars, Math.min(c.h * 0.44 * tallBoost, 24, barsWidth * 0.6));
  return {
    height: (s) => minBars + digits(s) * 1.3,
    grow: () => maxBars - minBars,
    draw: (top, s, extra) => {
      const barsHeight = minBars + extra;
      const d = digits(s);
      c.items.push({ kind: 'bars', x: c.m + (c.cw - barsWidth) / 2, y: top, moduleWidth, height: barsHeight, modules: code.modules });
      c.items.push({ kind: 'text', text: code.text, x: c.cx, y: top + barsHeight + d * 1.08, size: d, weight: 700, align: 'center', mono: true });
    },
    gap: 1.4,
    name: 'штрихкод',
  };
}

const ruleBlock = (c: Ctx, gap = 1): Block => ({
  height: () => 0.3,
  draw: (top) => c.items.push({ kind: 'line', x1: c.m, y1: top + 0.15, x2: c.right, y2: top + 0.15, width: 0.3 }),
  gap,
});

const spacer = (weight = 1): Block => ({ height: () => 0, draw: () => {}, spacer: weight, gap: 0 });

/** Two texts on one baseline: a label on the left, a value (price) shrinking into the rest on the right */
function pairBlock(c: Ctx, left: string, right: string, l: TextStyle, r: TextStyle, extra: Partial<Block> = {}): Block {
  const lw = l.weight ?? 700;
  const rw = r.weight ?? 800;
  const sizes = (s: number) => {
    const ls = l.size * s;
    const leftWidth = left ? c.measure(left, ls, lw, l.mono) + 1.5 * s : 0;
    const room = c.cw - Math.min(leftWidth, c.cw * 0.6);
    const rs = Math.min(r.size * s, (room / Math.max(0.1, c.measure(right, 1, rw, r.mono))) * 0.98);
    return { ls, rs, room };
  };
  return {
    height: (s) => Math.max(sizes(s).ls, sizes(s).rs) * LINE,
    draw: (top, s) => {
      const { ls, rs } = sizes(s);
      const base = top + Math.max(ls, rs) * ASCENT;
      if (left) {
        c.items.push({ kind: 'text', text: fit(left, c.cw * 0.6 - 1.5 * s, ls, lw, c.measure, l.mono), x: c.m, y: base, size: ls, weight: lw, align: 'left', mono: l.mono });
      }
      if (right) c.items.push({ kind: 'text', text: right, x: c.right, y: base, size: rs, weight: rw, align: 'right', mono: r.mono });
    },
    ...extra,
  };
}

/** Key–value rows («Цвет  Небесно-голубой»): keys in one column */
function tableBlock(c: Ctx, rows: [string, string][], size: number, extra: Partial<Block> = {}): Block | null {
  const filled = rows.filter(([, v]) => v.trim());
  if (filled.length === 0) return null;
  return {
    height: (s) => size * s * (LINE + LEADING * (filled.length - 1)) + (filled.length - 1) * 0.35 * s,
    draw: (top, s) => {
      const f = size * s;
      const keyWidth = Math.max(...filled.map(([k]) => c.measure(k, f, 600))) + 1.6 * s;
      filled.forEach(([k, v], i) => {
        const y = top + f * ASCENT + i * (f * LEADING + 0.35 * s);
        c.items.push({ kind: 'text', text: k, x: c.m, y, size: f, weight: 600, align: 'left' });
        c.items.push({ kind: 'text', text: fit(v, c.cw - keyWidth, f, 800, c.measure), x: c.m + keyWidth, y, size: f, weight: 800, align: 'left' });
      });
    },
    ...extra,
  };
}

/**
 * Graphic size-run grid for «Ростовка» (`wholesale-pack`):
 * Top row: size labels (48 | 50 | 52 | Σ), Bottom row: quantities (1 | 2 | 1 | 4 шт.)
 */
function sizeGridBlock(
  c: Ctx,
  sizes: { size: string; qty: number }[] | undefined,
  totalPieces: number | undefined,
  fallbackSize: string,
  extra: Partial<Block> = {}
): Block | null {
  const cols =
    sizes && sizes.length > 0
      ? [
          ...sizes.slice(0, 7).map((s) => ({ head: s.size.split('(')[0]?.trim() || s.size, val: `${s.qty}` })),
          { head: 'Итого', val: `${totalPieces ?? sizes.reduce((sum, s) => sum + s.qty, 0)} шт.` },
        ]
      : [
          { head: 'Размер', val: fallbackSize || 'Стандарт' },
          { head: 'В уп.', val: `${totalPieces ?? 1} шт.` },
        ];

  return {
    height: (s) => 7.2 * s,
    draw: (top, s) => {
      const h = 7.2 * s;
      const rowH = h / 2;
      const colW = c.cw / cols.length;
      c.items.push({ kind: 'rect', x: c.m, y: top, w: c.cw, h, radius: 0.9 * s, lineWidth: 0.35 });
      c.items.push({ kind: 'line', x1: c.m, y1: top + rowH, x2: c.right, y2: top + rowH, width: 0.3 });

      cols.forEach((col, i) => {
        const x0 = c.m + i * colW;
        const cx = x0 + colW / 2;
        const isLast = i === cols.length - 1;
        if (i > 0) {
          c.items.push({ kind: 'line', x1: x0, y1: top, x2: x0, y2: top + h, width: isLast ? 0.45 : 0.25 });
        }
        const fHead = Math.min(2.1 * s, ((colW - 1.0 * s) / Math.max(0.1, c.measure(col.head, 1, 700))) * 0.94);
        const fVal = Math.min(2.4 * s, ((colW - 1.0 * s) / Math.max(0.1, c.measure(col.val, 1, 800))) * 0.94);
        c.items.push({
          kind: 'text',
          text: col.head,
          x: cx,
          y: top + rowH / 2 + fHead * 0.36,
          size: fHead,
          weight: isLast ? 800 : 700,
          align: 'center',
        });
        c.items.push({
          kind: 'text',
          text: col.val,
          x: cx,
          y: top + rowH + rowH / 2 + fVal * 0.36,
          size: fVal,
          weight: 800,
          align: 'center',
          mono: !isLast,
        });
      });
    },
    ...extra,
  };
}

/**
 * Two-column price box for wholesale & dual-price templates:
 * Left side: unit/retail price, Right side: highlighted box with wholesale/pack price
 */
function dualPriceBlock(
  c: Ctx,
  leftCaption: string,
  leftPrice: string,
  rightCaption: string,
  rightPrice: string,
  extra: Partial<Block> = {}
): Block {
  return {
    height: (s) => 9.2 * s,
    draw: (top, s) => {
      const h = 9.2 * s;
      const gap = 1.4 * s;
      const halfW = (c.cw - gap) / 2;
      const capSize = 1.9 * s;

      // Left box (outlined)
      c.items.push({ kind: 'rect', x: c.m, y: top, w: halfW, h, radius: 1 * s, lineWidth: 0.35 });
      c.items.push({
        kind: 'text',
        text: fit(leftCaption, halfW - 1.6 * s, capSize, 700, c.measure),
        x: c.m + halfW / 2,
        y: top + 2.5 * s,
        size: capSize,
        weight: 700,
        align: 'center',
      });
      const lpSize = Math.min(3.4 * s, ((halfW - 1.8 * s) / Math.max(0.1, c.measure(leftPrice, 1, 800))) * 0.95);
      c.items.push({
        kind: 'text',
        text: leftPrice,
        x: c.m + halfW / 2,
        y: top + h - 1.5 * s,
        size: lpSize,
        weight: 800,
        align: 'center',
      });

      // Right box (filled black for high contrast wholesale emphasis)
      const rx = c.m + halfW + gap;
      c.items.push({ kind: 'rect', x: rx, y: top, w: halfW, h, radius: 1 * s, fill: true });
      c.items.push({
        kind: 'text',
        text: fit(rightCaption, halfW - 1.6 * s, capSize, 700, c.measure),
        x: rx + halfW / 2,
        y: top + 2.5 * s,
        size: capSize,
        weight: 700,
        align: 'center',
        inverse: true,
      });
      const rpSize = Math.min(3.4 * s, ((halfW - 1.8 * s) / Math.max(0.1, c.measure(rightPrice, 1, 800))) * 0.95);
      c.items.push({
        kind: 'text',
        text: rightPrice,
        x: rx + halfW / 2,
        y: top + h - 1.5 * s,
        size: rpSize,
        weight: 800,
        align: 'center',
        inverse: true,
      });
    },
    ...extra,
  };
}

/** Finds the scale and places the blocks between `top` and `bottom` */
function solve(c: Ctx, all: (Block | null)[], sMax: number): { scale: number; dropped: string[] } {
  let blocks = all.filter((b): b is Block => Boolean(b));
  const sFloor = Math.max(0.55, Math.min(0.8, sMax * 0.6));
  const dropped: string[] = [];
  const edgeTop = (list: Block[]) => (list[0]?.bleed === 'top' ? 0 : c.m);
  const edgeBottom = (list: Block[]) => (list[list.length - 1]?.bleed === 'bottom' ? 0 : c.m);
  const gapOf = (list: Block[], i: number, s: number) =>
    i === 0 || list[i].spacer || list[i - 1].spacer ? 0 : (list[i].gap ?? 1) * s;
  const total = (list: Block[], s: number) => list.reduce((sum, b, i) => sum + b.height(s) + gapOf(list, i, s), 0);
  const best = (list: Block[]) => {
    const avail = c.h - edgeTop(list) - edgeBottom(list);
    if (total(list, sFloor) > avail) return sFloor * 0.999;
    let lo = sFloor;
    let hi = sMax;
    if (total(list, hi) <= avail) return hi;
    for (let n = 0; n < 24; n++) {
      const mid = (lo + hi) / 2;
      if (total(list, mid) <= avail) lo = mid;
      else hi = mid;
    }
    return lo;
  };

  let s = best(blocks);
  while (s < sFloor) {
    const optional = blocks.filter((b) => b.optional !== undefined);
    if (optional.length === 0) break;
    const drop = optional.reduce((a, b) => (b.optional! < a.optional! ? b : a));
    if (drop.name) dropped.push(drop.name);
    blocks = blocks.filter((b) => b !== drop);
    s = best(blocks);
  }
  s = Math.max(s, Math.min(sFloor, sMax));

  const top = edgeTop(blocks);
  const avail = c.h - top - edgeBottom(blocks);
  let left = Math.max(0, avail - total(blocks, s));
  const extra = blocks.map((b) => {
    const g = Math.min(left, b.grow?.(s) ?? 0);
    left -= g;
    return g;
  });
  const spacerWeight = blocks.reduce((sum, b) => sum + (b.spacer ?? 0), 0);
  const gaps = blocks.map((_, i) => gapOf(blocks, i, s));
  // Without spacers the gaps grow a little (up to 2.5 mm × s each); the rest goes before the last block,
  // so the content stays grouped at the top and the barcode or price sits on the bottom edge
  const slots = blocks.map((b, i) => i > 0 && !b.spacer && !blocks[i - 1].spacer);
  const slotCount = slots.filter(Boolean).length;
  const perGap = spacerWeight || slotCount === 0 ? 0 : Math.min(left / slotCount, 2.5 * s);
  const beforeLast = spacerWeight ? 0 : left - perGap * slotCount;
  let y = top;
  blocks.forEach((b, i) => {
    y += gaps[i];
    if (slots[i]) y += perGap;
    if (i === blocks.length - 1 && i > 0) y += beforeLast;
    if (b.spacer) y += (left * b.spacer) / spacerWeight;
    // a band at the bottom edge always ends at the edge
    if (b.bleed === 'bottom') y = c.h - b.height(s) - extra[i];
    b.draw(y, s, extra[i]);
    y += b.height(s) + extra[i];
  });
  return { scale: s, dropped };
}

/**
 * Items of a label in mm. Sizes follow the label: 58×40 is the reference; the text scale is then fitted
 * so the content fills the label. Price and product name are the largest texts on every template.
 */
export function layoutLabel(
  template: LabelTemplate,
  format: Pick<LabelFormat, 'widthMm' | 'heightMm'>,
  data: LabelData,
  options: LabelOptions,
  measure: MeasureText
): LabelLayout {
  const w = format.widthMm;
  const h = format.heightMm;
  const k = Math.max(0.55, Math.min(w / 58, h / 40, 2));
  const m = Math.max(1.6, Math.min(2.4 * k, 4));
  const c: Ctx = { w, h, m, cw: w - m * 2, cx: w / 2, right: w - m, measure, items: [] };
  // Text grows until the column fills the label (more room without a barcode or on a tall label);
  // the width alone bounds it, the height is checked by the fitting, and never above 2.4× the reference
  const sMax = Math.min(Math.max(k, w / 58) * 2.2, 2.4);

  const code = options.showBarcode && data.barcode ? encodeBarcode(data.barcode) : null;
  const bars = code ? barcodeBlock(c, code, template === 'wholesale-box' ? 1.25 : 1) : null;
  const resolved = resolveLabelPrices(data, options.priceMode ?? 'auto');
  const price = formatLabelPrice(resolved.primaryPrice);
  const showPrice = options.showPrice && resolved.hasPrice;
  const pack = (data.packLine ?? '').trim();
  const packHeader = [data.packTitle, pack].filter(Boolean).join(': ') || pack;
  /** The pack composition (wraps between the sizes and the items, never cut): a pack label shows it in every template */
  const packBlock = (style: Partial<TextStyle> = {}, extra: Partial<Block> = {}) =>
    pack ? textBlock(c, packHeader, { size: 2.8, weight: 800, maxLines: 2, ...style }, { gap: 0.7, ...extra }) : null;
  const subPriceBlock = (align: TextItem['align'] = 'right', extra: Partial<Block> = {}) =>
    showPrice && resolved.secondaryLine
      ? textBlock(c, resolved.secondaryLine, { size: 2.2, weight: 700, align }, { gap: 0.4, ...opt('доп. цена', 2), ...extra })
      : null;

  const tall = h / w > 1.1;
  const titleLines = tall ? 4 : 2;
  const colorArticle = [data.color, data.article].filter(Boolean).join(' · ');
  // a pack's «article» is its name («Ростовка 48–52»), not an article: no «Арт.» before it (stage 18)
  const articleText = data.article ? (pack ? data.article : `Арт. ${data.article}`) : '';
  const opt = (name: string, rank: number): Partial<Block> => ({ optional: rank, name });

  let blocks: (Block | null)[] = [];

  if (template === 'classic') {
    blocks = [
      textBlock(c, data.title, { size: 3.6, weight: 800, maxLines: titleLines }),
      textBlock(c, data.color ? `Цвет: ${data.color}` : '', { size: 2.5, weight: 700 }, { gap: 0.7, ...opt('цвет', 2) }),
      packBlock({ size: 2.7 }, { gap: 0.6 }),
      textBlock(c, articleText, { size: 2.3, weight: 700, mono: true }, { gap: 0.4, ...opt('артикул', 1) }),
      bars ?? spacer(),
      ...(showPrice
        ? [
            ruleBlock(c, bars ? 1.2 : 0),
            pairBlock(c, resolved.primaryLabel, price, { size: 2.5, weight: 700 }, { size: 6.2 }, { gap: 0.9 }),
            subPriceBlock('right'),
          ]
        : []),
    ];
  }

  if (template === 'minimal') {
    blocks = [
      textBlock(c, data.title, { size: 3.3, weight: 800, maxLines: bars ? 1 : titleLines }),
      textBlock(c, data.color, { size: 2.4, weight: 700 }, { gap: 0.5, ...opt('цвет', 1) }),
      packBlock({ size: 2.6 }, { gap: 0.5 }),
      bars ?? spacer(),
      pairBlock(c, data.article, showPrice ? price : '', { size: 2.2, weight: 700, mono: true }, { size: 4.6 }, { gap: 1 }),
      subPriceBlock('right'),
    ];
  }

  if (template === 'price') {
    blocks = [
      textBlock(c, data.title, { size: 3.4, weight: 800, maxLines: titleLines }),
      textBlock(c, colorArticle, { size: 2.4, weight: 700 }, { gap: 0.6, ...opt('цвет и артикул', 1) }),
      packBlock({ size: 2.8 }, { gap: 0.6 }),
      bars ? null : spacer(),
      showPrice ? shrinkBlock(c, price, { size: 10 }, { gap: 1.2 }) : null,
      subPriceBlock('left'),
      ...(bars ? [spacer(), ruleBlock(c, 0), bars] : []),
    ];
  }

  if (template === 'size-price') {
    const sizeText = data.size || (data.packPieces ? `${data.packPieces} шт.` : '—');
    blocks = [
      ...(pack
        ? [showPrice ? shrinkBlock(c, price, { size: 8 }) : null, subPriceBlock('left'), packBlock({ size: 3.6 }, { gap: 0.8 })]
        : [sizePriceRow(c, sizeText, showPrice ? price : ''), subPriceBlock('right')]),
      textBlock(c, data.title, { size: 3.4, weight: 800, maxLines: titleLines }, { gap: 1.2 }),
      textBlock(c, data.composition ? `Состав: ${data.composition}` : '', { size: 2.4, weight: 700 }, { gap: 0.6, ...opt('состав', 2) }),
      textBlock(c, articleText, { size: 2.3, weight: 700, mono: true }, { gap: 0.4, ...opt('артикул', 1) }),
      bars ?? spacer(),
    ];
  }

  if (template === 'card') {
    const bandLeft = data.size
      ? [`Размер ${data.size}`, data.size]
      : data.packTitle
      ? [data.packTitle]
      : [resolved.primaryLabel];
    blocks = [
      pack && !showPrice && !data.packTitle ? null : bandBlock(c, bandLeft, showPrice ? price : '', 'top'),
      subPriceBlock('right'),
      packBlock({ size: 3.4 }, { gap: 1.1 }),
      textBlock(c, data.title, { size: 3.5, weight: 800, maxLines: titleLines }, { gap: 1.2 }),
      textBlock(c, data.composition ? `Состав: ${data.composition}` : '', { size: 2.4, weight: 700 }, { gap: 0.6, ...opt('состав', 2) }),
      textBlock(c, articleText, { size: 2.3, weight: 700, mono: true }, { gap: 0.4, ...opt('артикул', 1) }),
      bars ?? spacer(),
    ];
  }

  if (template === 'tag') {
    const center = { align: 'center' as const };
    blocks = [
      bars ? null : spacer(),
      data.size ? shrinkBlock(c, data.size, { size: 7, align: 'center' }) : null,
      packBlock({ size: 3.8, align: 'center' }),
      showPrice ? shrinkBlock(c, price, { size: 6, align: 'center' }, { gap: 0.6 }) : null,
      subPriceBlock('center'),
      textBlock(c, data.title, { size: 3.3, weight: 800, maxLines: titleLines, ...center }, { gap: 1.2 }),
      textBlock(c, data.composition ? `Состав: ${data.composition}` : '', { size: 2.4, weight: 700, ...center }, { gap: 0.6, ...opt('состав', 2) }),
      textBlock(c, articleText, { size: 2.3, weight: 700, mono: true, ...center }, { gap: 0.4, ...opt('артикул', 1) }),
      bars ?? spacer(),
    ];
  }

  if (template === 'wholesale-pack') {
    const unitPrice =
      data.wholesaleUnitPrice ??
      (resolved.primaryPrice > 0 && (data.packPieces ?? 1) > 1
        ? Math.round(resolved.primaryPrice / (data.packPieces ?? 1))
        : resolved.primaryPrice);
    const packTotal =
      data.packPrice ??
      (unitPrice > 0 && (data.packPieces ?? 1) > 1 ? unitPrice * (data.packPieces ?? 1) : resolved.primaryPrice);

    blocks = [
      textBlock(c, data.title, { size: 3.4, weight: 800, maxLines: 2 }),
      pairBlock(
        c,
        articleText || data.packTitle || 'Партия',
        data.color,
        { size: 2.4, weight: 800, mono: Boolean(data.article) },
        { size: 2.4, weight: 700 },
        { gap: 0.5 }
      ),
      // the size grid needs the pack's sizes; a pack known only by its composition line prints that line instead
      data.packSizes?.length || !pack
        ? sizeGridBlock(c, data.packSizes, data.packPieces, data.size || data.packTitle || '—', { gap: 0.8 })
        : packBlock({ size: 3 }, { gap: 0.8 }),
      textBlock(c, data.composition ? `Состав: ${data.composition}` : '', { size: 2.1, weight: 600 }, { gap: 0.5, ...opt('состав', 1) }),
      ...(showPrice
        ? (data.packPieces ?? 1) > 1 && unitPrice > 0 && packTotal > unitPrice
          ? [
              dualPriceBlock(
                c,
                'За 1 шт.',
                formatLabelPrice(unitPrice),
                `Пачка (${data.packPieces} шт.)`,
                formatLabelPrice(packTotal),
                { gap: 0.8 }
              ),
            ]
          : [pairBlock(c, resolved.primaryLabel, price, { size: 2.5, weight: 700 }, { size: 5.4 }, { gap: 0.8 })]
        : []),
      bars ?? spacer(),
    ];
  }

  if (template === 'wholesale-box') {
    // a pack's name («Ростовка 48–52») is too long for the band: the band says what it is, the name goes below in full
    const topLeft = pack ? ['РОСТОВКА'] : data.article ? [ `АРТ. ${data.article}`, data.article ] : [ data.packTitle || 'ОПТ КОРОБ' ];
    const topRight = data.packPieces ? `${data.packPieces} ШТ.` : data.size || data.color;
    const summaryLine = [
      pack ? data.article ?? '' : '',
      data.color ? `Цвет: ${data.color}` : '',
      data.packTitle || (data.size ? `Размер: ${data.size}` : ''),
      pack ? `Ряд: ${pack}` : '',
    ]
      .filter(Boolean)
      .join(' · ');

    blocks = [
      bandBlock(c, topLeft, topRight, 'top'),
      textBlock(c, data.title, { size: 3.5, weight: 800, maxLines: 2 }, { gap: 1 }),
      textBlock(c, summaryLine, { size: 2.5, weight: 700, maxLines: 2 }, { gap: 0.6 }),
      textBlock(c, data.wholesaleTerms ?? '', { size: 2.2, weight: 600 }, { gap: 0.4, ...opt('условия опта', 1) }),
      bars ?? spacer(),
      ...(showPrice
        ? [
            ruleBlock(c, 0.8),
            pairBlock(
              c,
              resolved.secondaryLine || resolved.primaryLabel,
              price,
              { size: 2.3, weight: 700 },
              { size: 5.0 },
              { gap: 0.7 }
            ),
          ]
        : []),
    ];
  }

  if (template === 'dual-price') {
    const retailVal = data.retailPrice ?? data.price;
    const whUnit = data.wholesaleUnitPrice ?? data.price;
    const isPack = Boolean(data.packLine);
    const leftCap = isPack && data.packPieces ? 'Опт / 1 шт.' : 'Розница';
    const leftVal = formatLabelPrice(isPack ? whUnit : retailVal);
    const rightCap = isPack
      ? `Пачка (${data.packPieces ?? 1} шт.)`
      : data.packPieces && data.packPieces > 1
      ? `Опт (уп. ${data.packPieces} шт.)`
      : 'Опт / 1 шт.';
    const rightVal = formatLabelPrice(isPack ? data.packPrice ?? data.price : whUnit);

    const subDetails = [
      data.color,
      data.size ? `р. ${data.size}` : data.packTitle,
      pack,
    ]
      .filter(Boolean)
      .join(' · ');

    const extraLine =
      !isPack && data.packPrice && (data.packPieces ?? 1) > 1
        ? `Сумма упаковки (${data.packPieces} шт.): ${formatLabelPrice(data.packPrice)}${data.wholesaleTerms ? ` · ${data.wholesaleTerms}` : ''}`
        : data.wholesaleTerms ?? '';

    blocks = [
      textBlock(c, data.title, { size: 3.4, weight: 800, maxLines: titleLines }),
      pairBlock(c, articleText, subDetails, { size: 2.2, weight: 700, mono: true }, { size: 2.3, weight: 700 }, { gap: 0.5 }),
      showPrice ? dualPriceBlock(c, leftCap, leftVal, rightCap, rightVal, { gap: 0.8 }) : null,
      textBlock(c, extraLine, { size: 2.1, weight: 700, align: 'center' }, { gap: 0.5, ...opt('условия выкупа', 1) }),
      textBlock(c, data.composition ? `Состав: ${data.composition}` : '', { size: 2.1, weight: 600 }, { gap: 0.4, ...opt('состав', 2) }),
      bars ?? spacer(),
    ];
  }

  if (template === 'wholesale-tiers') {
    const baseWh = data.wholesaleUnitPrice ?? resolved.primaryPrice;
    const tierRows: [string, string][] = (data.wholesaleSteps ?? []).slice(0, 4).map((step) => [
      step.threshold,
      `${formatLabelPrice(step.price)} (${step.discount})`,
    ]);
    if (tierRows.length === 0 && data.packPrice && (data.packPieces ?? 1) > 1) {
      tierRows.push([`Упаковка ${data.packPieces} шт.`, formatLabelPrice(data.packPrice)]);
    }
    if (tierRows.length === 0 && data.retailPrice && data.retailPrice !== baseWh) {
      tierRows.push(['Розница', formatLabelPrice(data.retailPrice)]);
    }
    if (tierRows.length === 0) {
      tierRows.push(['Фасовка', `${data.packPieces ?? 1} шт. в уп.`]);
      if (data.color || data.size) {
        tierRows.push(['Партия', [data.color, data.size ? `р. ${data.size}` : ''].filter(Boolean).join(', ')]);
      }
    }

    blocks = [
      textBlock(c, data.title, { size: 3.4, weight: 800, maxLines: titleLines }),
      textBlock(
        c,
        [articleText, data.color, data.size ? `р. ${data.size}` : ''].filter(Boolean).join(' · '),
        { size: 2.2, weight: 700 },
        { gap: 0.5, ...opt('реквизиты', 2) }
      ),
      packBlock({ size: 2.6 }, { gap: 0.5 }),
      ...(showPrice
        ? [
            ruleBlock(c, 0.6),
            pairBlock(
              c,
              data.packPieces && data.packPieces > 1 ? `Опт (уп. ${data.packPieces})` : 'Опт / 1 шт.',
              `${formatLabelPrice(baseWh)}`,
              { size: 2.3, weight: 700 },
              { size: 4.8 },
              { gap: 0.6 }
            ),
            tableBlock(c, tierRows, 2.2, { gap: 0.6, ...opt('ступени скидок', 1) }),
          ]
        : []),
      bars ?? spacer(),
    ];
  }

  if (template === 'showcase') {
    // Big name on top, details, article, the price on a filled band at the bottom edge
    blocks = [
      textBlock(c, data.title, { size: 4.4, weight: 800, maxLines: titleLines + 1 }),
      textBlock(c, [data.color, data.size ? `размер ${data.size}` : ''].filter(Boolean).join(' · '), { size: 2.7, weight: 700 }, { gap: 0.8, ...opt('цвет и размер', 2) }),
      packBlock({ size: 3.0 }, { gap: 0.6 }),
      textBlock(c, data.composition, { size: 2.4, weight: 600 }, { gap: 0.4, ...opt('состав', 2) }),
      textBlock(c, articleText, { size: 2.2, weight: 700, mono: true }, { gap: 0.4, ...opt('артикул', 1) }),
      subPriceBlock('left'),
      bars ? null : spacer(),
      bars,
      showPrice ? bandBlock(c, [resolved.primaryLabel, ''], price, 'bottom') : null,
    ];
  }

  if (template === 'price-info') {
    // The price as wide as the label, the name, then a table of details
    blocks = [
      showPrice ? shrinkBlock(c, price, { size: 11 }) : null,
      subPriceBlock('left'),
      textBlock(c, data.title, { size: 3.6, weight: 800, maxLines: titleLines }, { gap: 0.8 }),
      showPrice ? ruleBlock(c, 1) : null,
      packBlock({ size: 2.8 }, { gap: 0.8 }),
      tableBlock(
        c,
        [
          ['Цвет', data.color],
          ['Размер', data.size || (data.packTitle ?? '')],
          ['Состав', data.composition],
          [pack ? 'Упаковка' : 'Артикул', data.article],
        ],
        2.4,
        { gap: 1, ...opt('таблица', 1) }
      ),
      bars ?? spacer(),
    ];
  }

  if (template === 'premium') {
    // A frame, everything centred: name, details, article, a rule and the price
    const center = { align: 'center' as const };
    const inner = 1.2 * k;
    c.items.push({ kind: 'rect', x: m / 2, y: m / 2, w: w - m, h: h - m, radius: 1.2 * k, lineWidth: 0.35 });
    c.m = m + inner;
    c.cw = w - c.m * 2;
    c.right = w - c.m;
    blocks = [
      textBlock(c, data.title, { size: 3.8, weight: 800, maxLines: titleLines, ...center }),
      textBlock(c, [data.color, data.size].filter(Boolean).join(' · '), { size: 2.5, weight: 700, ...center }, { gap: 0.7, ...opt('цвет и размер', 2) }),
      packBlock({ size: 2.8, ...center }, { gap: 0.5 }),
      textBlock(c, data.composition, { size: 2.3, weight: 600, ...center }, { gap: 0.4, ...opt('состав', 2) }),
      textBlock(c, articleText, { size: 2.2, weight: 700, mono: true, ...center }, { gap: 0.4, ...opt('артикул', 1) }),
      spacer(),
      showPrice ? shrinkBlock(c, price, { size: 8.5, align: 'center' }) : null,
      subPriceBlock('center'),
      bars ? spacer(0.4) : null,
      bars,
    ];
  }

  if (template === 'sale') {
    const oldPrice = hasSaleOldPrice(data) ? data.oldPrice! : undefined;
    blocks = [
      textBlock(c, data.title, { size: 3.4, weight: 800, maxLines: titleLines }),
      textBlock(c, colorArticle, { size: 2.4, weight: 700 }, { gap: 0.6, ...opt('цвет и артикул', 1) }),
      packBlock({ size: 2.8 }, { gap: 0.6 }),
      bars ? null : spacer(),
      saleRow(c, price, oldPrice, data.price),
      subPriceBlock('left'),
      ...(bars ? [spacer(), ruleBlock(c, 0), bars] : []),
    ];
  }

  const { scale, dropped } = solve(c, blocks, sMax);
  return { widthMm: w, heightMm: h, items: c.items, scale, dropped };
}

/** Size in an outlined box on the left, the price on the right */
function sizePriceRow(c: Ctx, sizeText: string, price: string): Block {
  const geom = (s: number) => {
    const rowH = 10 * s;
    const sizeFont = rowH * 0.56;
    const boxW = Math.min(c.cw * 0.5, Math.max(rowH, c.measure(sizeText, sizeFont, 800) + 3 * s));
    const priceSize = price
      ? Math.min(rowH * 0.66, ((c.cw - boxW - 2 * s) / Math.max(0.1, c.measure(price, 1, 800))) * 0.98)
      : 0;
    return { rowH, sizeFont: Math.min(sizeFont, ((boxW - 2 * s) / Math.max(0.1, c.measure(sizeText, 1, 800))) * 0.98), boxW, priceSize };
  };
  return {
    height: (s) => geom(s).rowH,
    draw: (top, s) => {
      const { rowH, sizeFont, boxW, priceSize } = geom(s);
      c.items.push({ kind: 'rect', x: c.m, y: top, w: boxW, h: rowH, radius: 1.2 * s, lineWidth: 0.5 });
      c.items.push({ kind: 'text', text: sizeText, x: c.m + boxW / 2, y: top + rowH / 2 + sizeFont * 0.36, size: sizeFont, weight: 800, align: 'center' });
      if (price) c.items.push({ kind: 'text', text: price, x: c.right, y: top + rowH / 2 + priceSize * 0.36, size: priceSize, weight: 800, align: 'right' });
    },
  };
}

/** Filled band across the label at the top or bottom edge: a label on the left, the value on the right */
function bandBlock(c: Ctx, leftOptions: string[], right: string, edge: 'top' | 'bottom'): Block {
  const geom = (s: number) => {
    const bandH = 8.5 * s + c.m;
    const ls = 3.4 * s;
    // the longest wording that leaves the price at least 55% of the band («Размер 50 (L)» → «50 (L)»)
    const left =
      leftOptions.find((t) => c.measure(t, ls, 800) + 2 * s <= c.cw * 0.45) ?? leftOptions[leftOptions.length - 1] ?? '';
    const leftWidth = left ? Math.min(c.measure(left, ls, 800), c.cw * 0.45) + 2 * s : 0;
    const rs = right ? Math.min(5.2 * s, ((c.cw - leftWidth) / Math.max(0.1, c.measure(right, 1, 800))) * 0.98) : 0;
    return { bandH, ls, rs, left };
  };
  return {
    height: (s) => geom(s).bandH,
    draw: (top, s) => {
      const { bandH, ls, rs, left } = geom(s);
      c.items.push({ kind: 'rect', x: 0, y: top, w: c.w, h: bandH, radius: 0, fill: true });
      // the text sits in the band's part away from the label edge
      const inner = edge === 'top' ? top + c.m * 0.5 : top;
      const mid = inner + (bandH - c.m * 0.5) / 2;
      const f = Math.max(ls, rs);
      const y = mid + f * 0.36;
      if (left) c.items.push({ kind: 'text', text: fit(left, c.cw * 0.45, ls, 800, c.measure), x: c.m, y, size: ls, weight: 800, align: 'left', inverse: true });
      if (right) c.items.push({ kind: 'text', text: right, x: c.right, y, size: rs, weight: 800, align: 'right', inverse: true });
    },
    bleed: edge,
    gap: 1.4,
  };
}

/** New price big on the left; the discount in a filled badge and the struck-out old price on the right */
function saleRow(c: Ctx, price: string, oldPrice: number | undefined, current: number): Block {
  const pct = oldPrice ? `−${Math.round((1 - current / oldPrice) * 100)}%` : '';
  const old = oldPrice ? formatLabelPrice(oldPrice) : '';
  const geom = (s: number) => {
    const badgeSize = 4.2 * s;
    const oldSize = 3.2 * s;
    const badgeW = c.measure(pct, badgeSize, 800) + 2.4 * s;
    const badgeH = badgeSize * 1.4;
    const sideW = oldPrice ? Math.max(badgeW, c.measure(old, oldSize, 700)) : 0;
    const sideH = oldPrice ? badgeH + 0.8 * s + oldSize * LINE : 0;
    const fitPrice = (room: number) => Math.min(11 * s, (room / Math.max(0.1, c.measure(price, 1, 800))) * 0.98);
    const side = fitPrice(c.cw - (sideW ? sideW + 2 * s : 0));
    const full = fitPrice(c.cw);
    // A narrow label: the badge and the old price go on a line above the price, which then takes the full width
    const stacked = Boolean(oldPrice) && side < full * 0.72;
    const priceSize = stacked ? full : side;
    const height = stacked ? Math.max(badgeH, oldSize * LINE) + 0.9 * s + priceSize * LINE : Math.max(priceSize * LINE, sideH);
    return { badgeSize, oldSize, badgeW, badgeH, sideH, priceSize, stacked, height };
  };
  return {
    height: (s) => geom(s).height,
    draw: (top, s) => {
      const { badgeSize, oldSize, badgeW, badgeH, sideH, priceSize, stacked, height } = geom(s);
      c.items.push({ kind: 'text', text: price, x: c.m, y: top + height - priceSize * (LINE - ASCENT), size: priceSize, weight: 800, align: 'left' });
      if (!oldPrice) return;
      if (stacked) {
        const rowH = Math.max(badgeH, oldSize * LINE);
        c.items.push({ kind: 'rect', x: c.m, y: top, w: badgeW, h: badgeH, radius: 1 * s, fill: true });
        c.items.push({ kind: 'text', text: pct, x: c.m + badgeW / 2, y: top + badgeH / 2 + badgeSize * 0.36, size: badgeSize, weight: 800, align: 'center', inverse: true });
        c.items.push({ kind: 'text', text: old, x: c.right, y: top + rowH / 2 + oldSize * 0.36, size: oldSize, weight: 700, align: 'right', strike: true });
        return;
      }
      const bt = top + (height - sideH) / 2;
      c.items.push({ kind: 'rect', x: c.right - badgeW, y: bt, w: badgeW, h: badgeH, radius: 1 * s, fill: true });
      c.items.push({ kind: 'text', text: pct, x: c.right - badgeW / 2, y: bt + badgeH / 2 + badgeSize * 0.36, size: badgeSize, weight: 800, align: 'center', inverse: true });
      c.items.push({ kind: 'text', text: old, x: c.right, y: bt + badgeH + 0.8 * s + oldSize * ASCENT, size: oldSize, weight: 700, align: 'right', strike: true });
    },
    gap: 1.2,
  };
}

/** Canvas measure for layoutLabel */
export function canvasMeasure(): MeasureText {
  const ctx = document.createElement('canvas').getContext('2d')!;
  const scale = 20; // measure at 20 px per mm, then convert back
  return (text, sizeMm, weight, mono) => {
    ctx.font = fontCss(sizeMm * scale, weight, mono);
    return ctx.measureText(text).width / scale;
  };
}

/** Draws a layout on a canvas; `bars: false` leaves the bars out (the PDF draws them as vectors) */
export function drawLabel(
  canvas: HTMLCanvasElement,
  layout: LabelLayout,
  pxPerMm: number,
  { bars = true }: { bars?: boolean } = {}
) {
  canvas.width = Math.round(layout.widthMm * pxPerMm);
  canvas.height = Math.round(layout.heightMm * pxPerMm);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const item of layout.items) {
    if (item.kind === 'line') {
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = Math.max(1, item.width * pxPerMm);
      ctx.beginPath();
      ctx.moveTo(item.x1 * pxPerMm, item.y1 * pxPerMm);
      ctx.lineTo(item.x2 * pxPerMm, item.y2 * pxPerMm);
      ctx.stroke();
    } else if (item.kind === 'rect') {
      ctx.beginPath();
      ctx.roundRect(item.x * pxPerMm, item.y * pxPerMm, item.w * pxPerMm, item.h * pxPerMm, item.radius * pxPerMm);
      if (item.fill) {
        ctx.fillStyle = '#000000';
        ctx.fill();
      } else {
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = Math.max(1, (item.lineWidth ?? 0.3) * pxPerMm);
        ctx.stroke();
      }
    } else if (item.kind === 'text') {
      if (!item.text) continue;
      ctx.font = fontCss(item.size * pxPerMm, item.weight, item.mono);
      // Pure black: thermal printers dither grey into a pale, broken line
      ctx.fillStyle = item.inverse ? '#FFFFFF' : '#000000';
      ctx.textAlign = item.align;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(item.text, item.x * pxPerMm, item.y * pxPerMm);
      if (item.strike) {
        const width = ctx.measureText(item.text).width;
        const x0 = item.align === 'right' ? item.x * pxPerMm - width : item.align === 'center' ? item.x * pxPerMm - width / 2 : item.x * pxPerMm;
        const sy = (item.y - item.size * 0.32) * pxPerMm;
        ctx.fillRect(x0 - 0.3 * pxPerMm, sy, width + 0.6 * pxPerMm, Math.max(1, Math.max(0.3, item.size * 0.08) * pxPerMm));
      }
    } else if (bars) {
      ctx.fillStyle = '#000000';
      forEachBar(item, (x, width) => {
        // whole pixels keep the edges sharp
        const x0 = Math.round(x * pxPerMm);
        const x1 = Math.round((x + width) * pxPerMm);
        ctx.fillRect(x0, Math.round(item.y * pxPerMm), Math.max(1, x1 - x0), Math.round(item.height * pxPerMm));
      });
    }
  }
}

/** Runs of dark modules as (x, width) in mm */
function forEachBar(item: BarsItem, draw: (x: number, width: number) => void) {
  let i = 0;
  while (i < item.modules.length) {
    if (!item.modules[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < item.modules.length && item.modules[j]) j++;
    draw(item.x + i * item.moduleWidth, (j - i) * item.moduleWidth);
    i = j;
  }
}

/** Waits for the label fonts (Manrope is bundled via @fontsource) so the first render is not a fallback */
export async function loadLabelFonts() {
  if (!('fonts' in document)) return;
  await Promise.all(([600, 700, 800] as Weight[]).map((w) => document.fonts.load(fontCss(12, w)).catch(() => [])));
}

const PDF_PX_PER_MM = 16; // ≈406 dpi for the text; bars are vectors

/** Most copies of each label in one PDF */
export const LABEL_COPIES_MAX = 200;

/**
 * One PDF page per label, page size = label size; each label `copies` times in a row (either a fixed number
 * or an individual count per label when printing by physical stock). Returns the file name.
 */
export async function downloadLabelsPdf(
  format: LabelFormat,
  template: LabelTemplate,
  labels: LabelData[],
  options: LabelOptions,
  copies: number | number[] = 1
): Promise<string> {
  // jspdf is loaded on demand (as for the analytics report), not with the main bundle
  const [{ default: jsPDF }] = await Promise.all([import('jspdf'), loadLabelFonts()]);
  const measure = canvasMeasure();
  const orientation = format.widthMm >= format.heightMm ? 'landscape' : 'portrait';
  const pdf = new jsPDF({ unit: 'mm', format: [format.widthMm, format.heightMm], orientation, compress: true });
  const canvas = document.createElement('canvas');
  let hasFirstPage = false;

  labels.forEach((data, index) => {
    const rawCount = Array.isArray(copies) ? (copies[index] ?? 0) : copies;
    const times = Array.isArray(copies)
      ? Math.min(LABEL_COPIES_MAX, Math.max(0, Math.floor(rawCount) || 0))
      : Math.min(LABEL_COPIES_MAX, Math.max(1, Math.floor(rawCount) || 1));
    if (times <= 0) return;

    const layout = layoutLabel(template, format, data, options, measure);
    drawLabel(canvas, layout, PDF_PX_PER_MM, { bars: false });
    // drawn once, placed on every copy's page (jspdf keeps one image for the same alias)
    const image = canvas.toDataURL('image/png');
    for (let copy = 0; copy < times; copy++) {
      if (hasFirstPage) pdf.addPage([format.widthMm, format.heightMm], orientation);
      hasFirstPage = true;
      pdf.addImage(image, 'PNG', 0, 0, format.widthMm, format.heightMm, `label-${index}`, 'FAST');
      pdf.setFillColor(0, 0, 0);
      for (const item of layout.items) {
        if (item.kind === 'bars') forEachBar(item, (x, width) => pdf.rect(x, item.y, width, item.height, 'F'));
      }
    }
  });
  const date = new Date().toISOString().slice(0, 10);
  const fileName = `labels-${format.widthMm}x${format.heightMm}-${date}.pdf`;
  pdf.setProperties({ title: `Этикетки ${format.widthMm}×${format.heightMm} мм` });
  pdf.save(fileName);
  return fileName;
}
