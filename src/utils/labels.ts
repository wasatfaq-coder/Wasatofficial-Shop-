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
  | 'sale';

export type LabelTemplateGroup = 'basic' | 'extended' | 'accent' | 'sale';

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
  { id: 'showcase', name: 'Витрина', hint: 'Крупное название, цвет, размер, состав, цена на темной полосе', group: 'accent', showsSize: true },
  { id: 'price-info', name: 'Цена и детали', hint: 'Цена во всю ширину, название и таблица: цвет, размер, состав, артикул', group: 'accent', showsSize: true },
  { id: 'premium', name: 'Премиум', hint: 'В рамке по центру: название, детали, крупная цена', group: 'accent', showsSize: true },
  { id: 'sale', name: 'Скидка', hint: 'Крупные новая цена и процент скидки, зачеркнутая старая цена', group: 'sale', showsSize: false, needsOldPrice: true },
];

export const LABEL_TEMPLATE_GROUPS: { id: LabelTemplateGroup; title: string }[] = [
  { id: 'basic', title: 'Без размера' },
  { id: 'extended', title: 'С размером и составом' },
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
];

export const LABEL_SIZE_LIMITS = { min: 20, max: 120 };

/** Everything on a label comes from the catalog (product and its variation) */
export interface LabelData {
  title: string;
  color: string;
  size: string;
  /** Article without the size (MS-JK03-BLU) */
  article: string;
  /** Fabric composition text («75% хлопок, 25% шерсть») */
  composition: string;
  barcode: string;
  price: number;
  oldPrice?: number;
}

export const hasSaleOldPrice = (data: Pick<LabelData, 'price' | 'oldPrice'>) =>
  data.oldPrice !== undefined && data.oldPrice > data.price;

export interface LabelOptions {
  showPrice: boolean;
  showBarcode: boolean;
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
function barcodeBlock(c: Ctx, code: EncodedBarcode): Block {
  const quiet = code.kind === 'ean13' ? 11 + 7 : 20;
  const moduleWidth = Math.min(0.5, c.cw / (code.modules.length + quiet));
  const barsWidth = moduleWidth * code.modules.length;
  const digits = (s: number) => Math.max(1.8, Math.min(2.2 * s, 3.2));
  const minBars = Math.max(4, Math.min(c.h * 0.2, 9));
  const maxBars = Math.max(minBars, Math.min(c.h * 0.4, 22, barsWidth * 0.55));
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
  const bars = code ? barcodeBlock(c, code) : null;
  const price = formatLabelPrice(data.price);
  const showPrice = options.showPrice;
  const tall = h / w > 1.1;
  const titleLines = tall ? 4 : 2;
  const colorArticle = [data.color, data.article].filter(Boolean).join(' · ');
  const opt = (name: string, rank: number): Partial<Block> => ({ optional: rank, name });

  let blocks: (Block | null)[] = [];

  if (template === 'classic') {
    blocks = [
      textBlock(c, data.title, { size: 3.6, weight: 800, maxLines: titleLines }),
      textBlock(c, data.color ? `Цвет: ${data.color}` : '', { size: 2.5, weight: 700 }, { gap: 0.7, ...opt('цвет', 2) }),
      textBlock(c, data.article ? `Арт. ${data.article}` : '', { size: 2.3, weight: 700, mono: true }, { gap: 0.4, ...opt('артикул', 1) }),
      bars ?? spacer(),
      ...(showPrice
        ? [ruleBlock(c, bars ? 1.2 : 0), pairBlock(c, 'Цена', price, { size: 2.6, weight: 700 }, { size: 6.2 }, { gap: 0.9 })]
        : []),
    ];
  }

  if (template === 'minimal') {
    blocks = [
      textBlock(c, data.title, { size: 3.3, weight: 800, maxLines: bars ? 1 : titleLines }),
      textBlock(c, data.color, { size: 2.4, weight: 700 }, { gap: 0.5, ...opt('цвет', 1) }),
      bars ?? spacer(),
      pairBlock(c, data.article, showPrice ? price : '', { size: 2.2, weight: 700, mono: true }, { size: 4.6 }, { gap: 1 }),
    ];
  }

  if (template === 'price') {
    blocks = [
      textBlock(c, data.title, { size: 3.4, weight: 800, maxLines: titleLines }),
      textBlock(c, colorArticle, { size: 2.4, weight: 700 }, { gap: 0.6, ...opt('цвет и артикул', 1) }),
      bars ? null : spacer(),
      showPrice ? shrinkBlock(c, price, { size: 10 }, { gap: 1.2 }) : null,
      ...(bars ? [spacer(), ruleBlock(c, 0), bars] : []),
    ];
  }

  if (template === 'size-price') {
    const sizeText = data.size || '—';
    blocks = [
      sizePriceRow(c, sizeText, showPrice ? price : ''),
      textBlock(c, data.title, { size: 3.4, weight: 800, maxLines: titleLines }, { gap: 1.4 }),
      textBlock(c, data.composition ? `Состав: ${data.composition}` : '', { size: 2.4, weight: 700 }, { gap: 0.6, ...opt('состав', 2) }),
      textBlock(c, data.article ? `Арт. ${data.article}` : '', { size: 2.3, weight: 700, mono: true }, { gap: 0.4, ...opt('артикул', 1) }),
      bars ?? spacer(),
    ];
  }

  if (template === 'card') {
    blocks = [
      bandBlock(c, data.size ? [`Размер ${data.size}`, data.size] : [], showPrice ? price : '', 'top'),
      textBlock(c, data.title, { size: 3.5, weight: 800, maxLines: titleLines }, { gap: 1.4 }),
      textBlock(c, data.composition ? `Состав: ${data.composition}` : '', { size: 2.4, weight: 700 }, { gap: 0.6, ...opt('состав', 2) }),
      textBlock(c, data.article ? `Арт. ${data.article}` : '', { size: 2.3, weight: 700, mono: true }, { gap: 0.4, ...opt('артикул', 1) }),
      bars ?? spacer(),
    ];
  }

  if (template === 'tag') {
    const center = { align: 'center' as const };
    blocks = [
      bars ? null : spacer(),
      data.size ? shrinkBlock(c, data.size, { size: 7, align: 'center' }) : null,
      showPrice ? shrinkBlock(c, price, { size: 6, align: 'center' }, { gap: 0.6 }) : null,
      textBlock(c, data.title, { size: 3.3, weight: 800, maxLines: titleLines, ...center }, { gap: 1.2 }),
      textBlock(c, data.composition ? `Состав: ${data.composition}` : '', { size: 2.4, weight: 700, ...center }, { gap: 0.6, ...opt('состав', 2) }),
      textBlock(c, data.article ? `Арт. ${data.article}` : '', { size: 2.3, weight: 700, mono: true, ...center }, { gap: 0.4, ...opt('артикул', 1) }),
      bars ?? spacer(),
    ];
  }

  if (template === 'showcase') {
    // Big name on top, details, the price on a filled band at the bottom edge
    blocks = [
      textBlock(c, data.title, { size: 4.4, weight: 800, maxLines: titleLines + 1 }),
      textBlock(c, [data.color, data.size ? `размер ${data.size}` : ''].filter(Boolean).join(' · '), { size: 2.7, weight: 700 }, { gap: 0.8, ...opt('цвет и размер', 2) }),
      textBlock(c, data.composition, { size: 2.4, weight: 600 }, { gap: 0.4, ...opt('состав', 1) }),
      bars ? null : spacer(),
      bars,
      showPrice ? bandBlock(c, ['Цена', ''], price, 'bottom') : textBlock(c, data.article ? `Арт. ${data.article}` : '', { size: 2.3, weight: 700, mono: true }),
    ];
  }

  if (template === 'price-info') {
    // The price as wide as the label, the name, then a table of details
    blocks = [
      showPrice ? shrinkBlock(c, price, { size: 11 }) : null,
      textBlock(c, data.title, { size: 3.6, weight: 800, maxLines: titleLines }, { gap: 0.8 }),
      showPrice ? ruleBlock(c, 1) : null,
      tableBlock(
        c,
        [
          ['Цвет', data.color],
          ['Размер', data.size],
          ['Состав', data.composition],
          ['Артикул', data.article],
        ],
        2.4,
        { gap: 1, ...opt('таблица', 1) }
      ),
      bars ?? spacer(),
    ];
  }

  if (template === 'premium') {
    // A frame, everything centred: name, details, a rule and the price
    const center = { align: 'center' as const };
    const inner = 1.2 * k;
    c.items.push({ kind: 'rect', x: m / 2, y: m / 2, w: w - m, h: h - m, radius: 1.2 * k, lineWidth: 0.35 });
    c.m = m + inner;
    c.cw = w - c.m * 2;
    c.right = w - c.m;
    blocks = [
      textBlock(c, data.title, { size: 3.8, weight: 800, maxLines: titleLines, ...center }),
      textBlock(c, [data.color, data.size].filter(Boolean).join(' · '), { size: 2.5, weight: 700, ...center }, { gap: 0.7, ...opt('цвет и размер', 2) }),
      textBlock(c, data.composition, { size: 2.3, weight: 600, ...center }, { gap: 0.4, ...opt('состав', 1) }),
      spacer(),
      showPrice ? shrinkBlock(c, price, { size: 8.5, align: 'center' }) : null,
      bars ? spacer(0.4) : null,
      bars,
    ];
  }

  if (template === 'sale') {
    const oldPrice = hasSaleOldPrice(data) ? data.oldPrice! : undefined;
    blocks = [
      textBlock(c, data.title, { size: 3.4, weight: 800, maxLines: titleLines }),
      textBlock(c, colorArticle, { size: 2.4, weight: 700 }, { gap: 0.6, ...opt('цвет и артикул', 1) }),
      bars ? null : spacer(),
      saleRow(c, price, oldPrice, data.price),
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
 * One PDF page per label, page size = label size; each label `copies` times in a row (one per piece on the shelf,
 * admin audit 09.10, finding 29). Returns the file name.
 */
export async function downloadLabelsPdf(
  format: LabelFormat,
  template: LabelTemplate,
  labels: LabelData[],
  options: LabelOptions,
  copies = 1
): Promise<string> {
  const times = Math.min(LABEL_COPIES_MAX, Math.max(1, Math.floor(copies) || 1));
  // jspdf is loaded on demand (as for the analytics report), not with the main bundle
  const [{ default: jsPDF }] = await Promise.all([import('jspdf'), loadLabelFonts()]);
  const measure = canvasMeasure();
  const orientation = format.widthMm >= format.heightMm ? 'landscape' : 'portrait';
  const pdf = new jsPDF({ unit: 'mm', format: [format.widthMm, format.heightMm], orientation, compress: true });
  const canvas = document.createElement('canvas');
  labels.forEach((data, index) => {
    const layout = layoutLabel(template, format, data, options, measure);
    drawLabel(canvas, layout, PDF_PX_PER_MM, { bars: false });
    // drawn once, placed on every copy's page (jspdf keeps one image for the same alias)
    const image = canvas.toDataURL('image/png');
    for (let copy = 0; copy < times; copy++) {
      if (index > 0 || copy > 0) pdf.addPage([format.widthMm, format.heightMm], orientation);
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
