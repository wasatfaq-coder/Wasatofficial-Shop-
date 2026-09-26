import jsPDF from 'jspdf';
import type { LabelFormat } from '../types';
import { encodeBarcode, type EncodedBarcode } from '../shared/barcode';

/**
 * Product labels: one layout (in millimetres) is drawn both in the preview canvas and in the PDF,
 * so the file matches what the admin sees. Bars go into the PDF as vector rectangles.
 */

export type LabelTemplate = 'classic' | 'minimal' | 'price';

export const LABEL_TEMPLATES: { id: LabelTemplate; name: string; hint: string }[] = [
  { id: 'classic', name: 'Классический', hint: 'Магазин, товар, артикул, штрихкод и цена' },
  { id: 'minimal', name: 'Минимал', hint: 'Крупный размер и штрихкод на всю ширину' },
  { id: 'price', name: 'Ценник', hint: 'Крупная цена, старая цена зачеркнута' },
];

/** Offered when the store has no formats yet; saved only when the admin adds one */
export const LABEL_FORMAT_PRESETS: Omit<LabelFormat, 'id'>[] = [
  { name: 'Термоэтикетка', widthMm: 58, heightMm: 40 },
  { name: 'Ценник', widthMm: 70, heightMm: 50 },
  { name: 'Малая этикетка', widthMm: 43, heightMm: 25 },
];

export const LABEL_SIZE_LIMITS = { min: 20, max: 120 };

export interface LabelData {
  storeName: string;
  title: string;
  color: string;
  size: string;
  skuCode?: string;
  barcode: string;
  price: number;
  oldPrice?: number;
}

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

type LabelItem = TextItem | LineItem | BarsItem;

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

export const formatLabelPrice = (value: number) => `${Math.round(value).toLocaleString('ru-RU')} ₽`;

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
 * bigger text.
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
  const items: LabelItem[] = [];
  const text = (t: Omit<TextItem, 'kind'>) => items.push({ kind: 'text', ...t });
  const line = (y: number) => items.push({ kind: 'line', x1: m, y1: y, x2: right, y2: y, width: 0.25 });

  const small = 2.3 * k;
  const titleSize = 3.1 * k;
  const digits = 2.2 * k;
  const code = options.showBarcode ? encodeBarcode(data.barcode) : null;
  const variant = [data.color && `Цвет: ${data.color}`, data.size && `Размер: ${data.size}`].filter(Boolean).join(' · ');
  const hasOldPrice = data.oldPrice !== undefined && data.oldPrice > data.price;
  // Short labels (43×25): one title line, no article line, so the barcode keeps a readable height
  const compact = h < 32;

  if (template === 'classic') {
    let y = m + small;
    text({ text: fit(data.storeName.toUpperCase(), cw, small, 800, measure), x: m, y, size: small, weight: 800, align: 'left' });
    y += small * 0.7;
    line(y);
    y += titleSize * 1.15;
    for (const l of wrap(data.title, cw, titleSize, 700, measure, compact ? 1 : 2)) {
      text({ text: l, x: m, y, size: titleSize, weight: 700, align: 'left' });
      y += titleSize * 1.15;
    }
    y += small * 0.1;
    if (variant) {
      text({ text: fit(variant, cw, small, 600, measure), x: m, y, size: small, weight: 600, align: 'left' });
      y += small * 1.35;
    }
    if (data.skuCode && !compact) {
      text({ text: fit(`Арт. ${data.skuCode}`, cw, small, 500, measure, true), x: m, y, size: small, weight: 500, align: 'left', mono: true, muted: true });
      y += small * 0.9;
    }
    const priceSize = 4.4 * k;
    const bottom = options.showPrice ? h - m - priceSize * 1.45 : h - m;
    if (code) items.push(...barsBlock(code, m, y + 0.8 * k, cw, bottom - y - 1.6 * k, digits));
    if (options.showPrice) {
      line(bottom + priceSize * 0.2);
      const py = h - m - 0.3;
      text({ text: 'Цена', x: m, y: py, size: small, weight: 600, align: 'left', muted: true });
      text({ text: formatLabelPrice(data.price), x: right, y: py, size: priceSize, weight: 800, align: 'right' });
    }
  }

  if (template === 'minimal') {
    const sizeBig = 5.2 * k;
    const sizeWidth = data.size ? measure(data.size, sizeBig, 800) : 0;
    let y = m + titleSize;
    const titleWidth = cw - (sizeWidth ? sizeWidth + 2 * k : 0);
    text({ text: fit(data.title, titleWidth, titleSize, 700, measure), x: m, y, size: titleSize, weight: 700, align: 'left' });
    if (data.size) text({ text: data.size, x: right, y: m + sizeBig * 0.8, size: sizeBig, weight: 800, align: 'right' });
    y += small * 1.4;
    if (data.color) text({ text: fit(data.color, titleWidth, small, 600, measure), x: m, y, size: small, weight: 600, align: 'left', muted: true });
    y += small * 0.8;
    const footer = small * 1.6;
    if (code) items.push(...barsBlock(code, m, y + 1 * k, cw, h - m - footer - y - 1.6 * k, digits));
    const fy = h - m - 0.2;
    if (data.skuCode) {
      const skuWidth = options.showPrice ? cw * 0.55 : cw;
      text({ text: fit(data.skuCode, skuWidth, small, 500, measure, true), x: m, y: fy, size: small, weight: 500, align: 'left', mono: true, muted: true });
    }
    if (options.showPrice) text({ text: formatLabelPrice(data.price), x: right, y: fy, size: small * 1.35, weight: 800, align: 'right' });
  }

  if (template === 'price') {
    let y = m + small;
    text({ text: fit(data.storeName.toUpperCase(), cw, small, 800, measure), x: m, y, size: small, weight: 800, align: 'left', muted: true });
    y += titleSize * 1.3;
    for (const l of wrap(data.title, cw, titleSize, 700, measure, compact ? 1 : 2)) {
      text({ text: l, x: m, y, size: titleSize, weight: 700, align: 'left' });
      y += titleSize * 1.15;
    }
    if (variant) {
      text({ text: fit(variant, cw, small, 600, measure), x: m, y: y - titleSize * 0.15, size: small, weight: 600, align: 'left', muted: true });
      y += small * 1.2;
    }
    const barsHeight = code ? Math.min(h * 0.3, 12 * k) : 0;
    const barsTop = h - m - barsHeight;
    if (options.showPrice) {
      // the price stays above the line over the barcode
      const priceSize = Math.min(9 * k, (barsTop - 1.2 * k - y) * 0.85);
      const py = y + priceSize * 0.78;
      text({ text: formatLabelPrice(data.price), x: m, y: py, size: priceSize, weight: 800, align: 'left' });
      if (hasOldPrice) {
        text({ text: formatLabelPrice(data.oldPrice!), x: right, y: py, size: small * 1.3, weight: 600, align: 'right', strike: true, muted: true });
      }
    }
    if (code) {
      line(barsTop - 1.2 * k);
      items.push(...barsBlock(code, m, barsTop, cw, barsHeight, digits));
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
    } else if (item.kind === 'text') {
      ctx.font = fontCss(item.size * pxPerMm, item.weight, item.mono);
      ctx.fillStyle = item.muted ? '#3A3A3A' : '#000000';
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
