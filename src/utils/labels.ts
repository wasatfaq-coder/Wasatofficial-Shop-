import jsPDF from 'jspdf';
import type { LabelFormat } from '../types';
import { encodeBarcode, type EncodedBarcode } from '../shared/barcode';

/**
 * Product labels: one layout (in millimetres) is drawn both in the preview canvas and in the PDF,
 * so the file matches what the admin sees. Bars go into the PDF as vector rectangles.
 */

export type LabelTemplate = 'classic' | 'minimal' | 'price' | 'size-price' | 'card' | 'tag' | 'sale';

export type LabelTemplateGroup = 'basic' | 'extended' | 'sale';

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
  { id: 'sale', name: 'Скидка', hint: 'Новая и зачеркнутая старая цена, процент скидки', group: 'sale', showsSize: false, needsOldPrice: true },
];

export const LABEL_TEMPLATE_GROUPS: { id: LabelTemplateGroup; title: string }[] = [
  { id: 'basic', title: 'Без размера' },
  { id: 'extended', title: 'С размером и составом' },
  { id: 'sale', title: 'Скидка' },
];

export const templateInfo = (id: LabelTemplate) => LABEL_TEMPLATES.find((t) => t.id === id) ?? LABEL_TEMPLATES[0];

/** Offered when the store has no formats yet; saved only when the admin adds one */
export const LABEL_FORMAT_PRESETS: Omit<LabelFormat, 'id'>[] = [
  { name: 'Термоэтикетка', widthMm: 58, heightMm: 40 },
  { name: 'Ценник', widthMm: 70, heightMm: 50 },
  { name: 'Малая этикетка', widthMm: 43, heightMm: 25 },
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
  muted?: boolean;
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

/** Bars centred in the box with quiet zones; returns the height used including the digits */
function barsBlock(
  code: EncodedBarcode,
  x: number,
  y: number,
  width: number,
  height: number,
  digitsSize: number
): LabelItem[] {
  const quiet = code.kind === 'ean13' ? 11 + 7 : 20;
  const moduleWidth = Math.min(0.5, width / (code.modules.length + quiet));
  const barsWidth = moduleWidth * code.modules.length;
  const barsHeight = Math.max(4, height - digitsSize * 1.35);
  return [
    { kind: 'bars', x: x + (width - barsWidth) / 2, y, moduleWidth, height: barsHeight, modules: code.modules },
    {
      kind: 'text',
      text: code.text,
      x: x + width / 2,
      y: y + barsHeight + digitsSize * 1.1,
      size: digitsSize,
      weight: 600,
      align: 'center',
      mono: true,
    },
  ];
}

/**
 * Items of a label in mm. Sizes follow the label: a 58×40 label is the reference, bigger labels get
 * bigger text. Short labels (h < 32 mm) drop secondary lines so the barcode stays readable.
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
  const k = Math.max(0.6, Math.min(w / 58, h / 40, 1.8));
  const m = Math.max(1.8, 2.4 * k);
  const cw = w - m * 2;
  const right = w - m;
  const cx = w / 2;
  const items: LabelItem[] = [];
  const text = (t: Omit<TextItem, 'kind'>) => items.push({ kind: 'text', ...t });
  const line = (y: number) => items.push({ kind: 'line', x1: m, y1: y, x2: right, y2: y, width: 0.25 });
  const rect = (r: Omit<RectItem, 'kind'>) => items.push({ kind: 'rect', ...r });

  const small = 2.3 * k;
  const titleSize = 3.1 * k;
  const digits = 2.2 * k;
  const compact = h < 32;
  const code = options.showBarcode ? encodeBarcode(data.barcode) : null;
  const price = formatLabelPrice(data.price);
  const article = data.article ? `Арт. ${data.article}` : '';
  const composition = data.composition ? `Состав: ${data.composition}` : '';

  /** Title lines from `y` (baseline of the first line); returns the next baseline */
  const title = (y: number, lines: number, align: TextItem['align'] = 'left', size = titleSize) => {
    const x = align === 'center' ? cx : m;
    for (const l of wrap(data.title, cw, size, 700, measure, lines)) {
      text({ text: l, x, y, size, weight: 700, align });
      y += size * 1.15;
    }
    return y;
  };
  /** A small line of text; returns the next baseline */
  const note = (y: number, value: string, opts: Partial<TextItem> = {}) => {
    if (!value) return y;
    const align = opts.align ?? 'left';
    text({
      text: fit(value, cw, small, opts.weight ?? 600, measure, opts.mono),
      x: align === 'center' ? cx : align === 'right' ? right : m,
      y,
      size: small,
      weight: opts.weight ?? 600,
      align,
      ...opts,
    });
    return y + small * 1.35;
  };
  /** Barcode from `top` to `bottom` */
  const bars = (top: number, bottom: number) => {
    if (code && bottom - top > 3) items.push(...barsBlock(code, m, top, cw, bottom - top, digits));
  };

  if (template === 'classic') {
    let y = title(m + titleSize, compact ? 1 : 2);
    const details = compact ? [data.color, data.article].filter(Boolean).join(' · ') : data.color ? `Цвет: ${data.color}` : '';
    y = note(y - titleSize * 0.1, details);
    if (!compact) y = note(y - small * 0.15, article, { mono: true, weight: 500, muted: true });
    const priceSize = 4.4 * k;
    const bottom = options.showPrice ? h - m - priceSize * 1.45 : h - m;
    bars(y - small * 0.5, bottom - 1.2 * k);
    if (options.showPrice) {
      line(bottom + priceSize * 0.2);
      const py = h - m - 0.3;
      text({ text: 'Цена', x: m, y: py, size: small, weight: 600, align: 'left', muted: true });
      text({ text: price, x: right, y: py, size: priceSize, weight: 800, align: 'right' });
    }
  }

  if (template === 'minimal') {
    let y = title(m + titleSize, 1);
    y = note(y - titleSize * 0.1, data.color, { muted: true });
    const footer = small * 1.7;
    bars(y - small * 0.4, h - m - footer - 0.6 * k);
    const fy = h - m - 0.2;
    const articleWidth = options.showPrice ? cw * 0.58 : cw;
    if (data.article) {
      text({ text: fit(data.article, articleWidth, small, 500, measure, true), x: m, y: fy, size: small, weight: 500, align: 'left', mono: true });
    }
    if (options.showPrice) text({ text: price, x: right, y: fy, size: small * 1.35, weight: 800, align: 'right' });
  }

  if (template === 'price') {
    let y = title(m + titleSize, 1);
    y = note(y - titleSize * 0.1, [data.color, data.article].filter(Boolean).join(' · '), { muted: true });
    const barsHeight = code ? Math.min(h * 0.3, 12 * k) : 0;
    const barsTop = h - m - barsHeight;
    if (options.showPrice) {
      const priceSize = Math.min(9 * k, (barsTop - 1.2 * k - y + small) * 0.8);
      text({ text: price, x: m, y: y - small + priceSize * 0.9, size: priceSize, weight: 800, align: 'left' });
    }
    if (code) {
      line(barsTop - 1.2 * k);
      bars(barsTop, h - m);
    }
  }

  if (template === 'size-price') {
    // Size in a box on the left, the price big on the right
    const rowH = (compact ? 8.5 : 11) * k;
    const sizeText = data.size || '—';
    const sizeFont = rowH * 0.55;
    const boxW = Math.max(rowH, measure(sizeText, sizeFont, 800) + 3 * k);
    rect({ x: m, y: m, w: boxW, h: rowH, radius: 1.2 * k, lineWidth: 0.45 });
    text({ text: sizeText, x: m + boxW / 2, y: m + rowH * 0.72, size: sizeFont, weight: 800, align: 'center' });
    if (options.showPrice) {
      const priceSize = Math.min(rowH * 0.62, ((cw - boxW - 2 * k) / Math.max(1, measure(price, 1, 800))) * 0.95);
      text({ text: price, x: right, y: m + rowH * 0.72, size: priceSize, weight: 800, align: 'right' });
    }
    let y = m + rowH + titleSize * 1.05;
    y = title(y, 1);
    if (!compact) y = note(y - titleSize * 0.1, composition);
    y = note(y - (compact ? titleSize * 0.1 : small * 0.15), article, { mono: true, weight: 500, muted: true });
    bars(y - small * 0.5, h - m);
  }

  if (template === 'card') {
    // Filled band: size on the left, price on the right
    const bandH = (compact ? 7 : 9) * k;
    rect({ x: 0, y: 0, w, h: bandH + m * 0.4, radius: 0, fill: true });
    const by = (bandH + m * 0.4) * 0.7;
    text({ text: data.size ? `Размер ${data.size}` : '', x: m, y: by, size: bandH * 0.42, weight: 800, align: 'left', inverse: true });
    if (options.showPrice) text({ text: price, x: right, y: by, size: bandH * 0.56, weight: 800, align: 'right', inverse: true });
    let y = bandH + m * 0.4 + titleSize * 1.25;
    y = title(y, compact ? 1 : 2);
    if (!compact) y = note(y - titleSize * 0.1, composition);
    y = note(y - (compact ? titleSize * 0.1 : small * 0.15), article, { mono: true, weight: 500, muted: true });
    bars(y - small * 0.5, h - m);
  }

  if (template === 'tag') {
    // Centred column: size, price, name, composition, article, barcode
    const barsHeight = code ? Math.min(h * (compact ? 0.36 : 0.3), 12 * k) : 0;
    const sizeFont = (compact ? 5 : 7) * k;
    let y = m + sizeFont * 0.8;
    const sizePart = data.size || '';
    if (options.showPrice && compact) {
      // one row on a short label: «48 (M) · 7 990 ₽»
      text({ text: fit([sizePart, price].filter(Boolean).join('  ·  '), cw, sizeFont, 800, measure), x: cx, y, size: sizeFont, weight: 800, align: 'center' });
    } else {
      if (sizePart) text({ text: fit(sizePart, cw, sizeFont, 800, measure), x: cx, y, size: sizeFont, weight: 800, align: 'center' });
      if (options.showPrice) {
        y += sizeFont * 0.95;
        text({ text: price, x: cx, y, size: sizeFont * 0.8, weight: 800, align: 'center' });
      }
    }
    y += titleSize * 1.4;
    y = title(y, 1, 'center');
    if (!compact) y = note(y - titleSize * 0.1, composition, { align: 'center' });
    note(y - (compact ? titleSize * 0.1 : small * 0.15), article, { mono: true, weight: 500, muted: true, align: 'center' });
    bars(h - m - barsHeight, h - m);
  }

  if (template === 'sale') {
    let y = title(m + titleSize, 1);
    y = note(y - titleSize * 0.1, [data.color, data.article].filter(Boolean).join(' · '), { muted: true });
    const barsHeight = code ? Math.min(h * 0.3, 12 * k) : 0;
    const barsTop = h - m - barsHeight;
    const oldPrice = hasSaleOldPrice(data) ? data.oldPrice! : undefined;
    const avail = barsTop - 1.2 * k - (y - small);
    const priceSize = Math.min(8 * k, avail * 0.62);
    const py = y - small + priceSize * 0.9;
    text({ text: price, x: m, y: py, size: priceSize, weight: 800, align: 'left' });
    if (oldPrice) {
      const pct = `−${Math.round((1 - data.price / oldPrice) * 100)}%`;
      const badgeSize = small * 1.25;
      const badgeW = measure(pct, badgeSize, 800) + 2 * k;
      const badgeH = badgeSize * 1.45;
      // the badge sits above the struck-out old price, both right-aligned with the new price's baseline
      const oldSize = small * 1.3;
      const badgeTop = py - oldSize * 1.05 - badgeH - 0.6 * k;
      rect({ x: right - badgeW, y: badgeTop, w: badgeW, h: badgeH, radius: 0.8 * k, fill: true });
      text({ text: pct, x: right - badgeW / 2, y: badgeTop + badgeH * 0.74, size: badgeSize, weight: 800, align: 'center', inverse: true });
      text({ text: formatLabelPrice(oldPrice), x: right, y: py, size: oldSize, weight: 600, align: 'right', strike: true, muted: true });
    }
    if (code) {
      line(barsTop - 1.2 * k);
      bars(barsTop, h - m);
    }
  }

  return { widthMm: w, heightMm: h, items };
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
      ctx.fillStyle = item.inverse ? '#FFFFFF' : item.muted ? '#3A3A3A' : '#000000';
      ctx.textAlign = item.align;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(item.text, item.x * pxPerMm, item.y * pxPerMm);
      if (item.strike) {
        const width = ctx.measureText(item.text).width;
        const x0 = item.align === 'right' ? item.x * pxPerMm - width : item.align === 'center' ? item.x * pxPerMm - width / 2 : item.x * pxPerMm;
        const sy = (item.y - item.size * 0.32) * pxPerMm;
        ctx.fillRect(x0, sy, width, Math.max(1, 0.25 * pxPerMm));
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

/** One PDF page per label, page size = label size. Returns the file name. */
export async function downloadLabelsPdf(
  format: LabelFormat,
  template: LabelTemplate,
  labels: LabelData[],
  options: LabelOptions
): Promise<string> {
  await loadLabelFonts();
  const measure = canvasMeasure();
  const orientation = format.widthMm >= format.heightMm ? 'landscape' : 'portrait';
  const pdf = new jsPDF({ unit: 'mm', format: [format.widthMm, format.heightMm], orientation, compress: true });
  const canvas = document.createElement('canvas');
  labels.forEach((data, index) => {
    if (index > 0) pdf.addPage([format.widthMm, format.heightMm], orientation);
    const layout = layoutLabel(template, format, data, options, measure);
    drawLabel(canvas, layout, PDF_PX_PER_MM, { bars: false });
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, format.widthMm, format.heightMm, undefined, 'FAST');
    pdf.setFillColor(0, 0, 0);
    for (const item of layout.items) {
      if (item.kind === 'bars') forEachBar(item, (x, width) => pdf.rect(x, item.y, width, item.height, 'F'));
    }
  });
  const date = new Date().toISOString().slice(0, 10);
  const fileName = `labels-${format.widthMm}x${format.heightMm}-${date}.pdf`;
  pdf.setProperties({ title: `Этикетки ${format.widthMm}×${format.heightMm} мм` });
  pdf.save(fileName);
  return fileName;
}
