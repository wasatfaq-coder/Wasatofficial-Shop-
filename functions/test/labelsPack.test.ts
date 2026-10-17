// Этикетка ростовки (этап 18 плана docs/admin-wholesale-plan.md): состав «48-50-52 / 1-2-1» печатается в каждом шаблоне
// на месте размера, ростовка без цены — этикетка без цены, обычные этикетки не меняются
import { describe, expect, test } from 'bun:test';
import { LABEL_TEMPLATES, layoutLabel, type LabelData, type LabelOptions } from '../../src/utils/labels';

// Ширина текста без шрифтов: пропорционально числу знаков
const measure = (text: string, size: number) => text.length * size * 0.55;

const variation: LabelData = {
  title: 'Футболка базовая',
  color: 'Синий',
  size: '48',
  article: 'WS-TS01-SIN',
  composition: '100% хлопок',
  barcode: '2000000000015',
  price: 1500,
};
const pack: LabelData = {
  ...variation,
  size: '',
  article: 'Ростовка 48–52',
  packLine: '48-50-52 / 1-2-1',
  price: 6000,
};
const options: LabelOptions = { showPrice: true, showBarcode: true };

const texts = (data: LabelData, template: (typeof LABEL_TEMPLATES)[number]['id'], opts = options, w = 70, h = 50) =>
  layoutLabel(template, { widthMm: w, heightMm: h }, data, opts, measure).items.flatMap((i) => (i.kind === 'text' ? [i.text] : []));

describe('этикетка ростовки', () => {
  test.each(LABEL_TEMPLATES.map((t) => t.id))('шаблон %s печатает состав ростовки, а обычная этикетка — нет', (id) => {
    expect(texts(pack, id).join(' ')).toContain('48-50-52 / 1-2-1');
    expect(texts(variation, id).join(' ')).not.toContain('/ 1-2-1');
  });

  test('состав ростовки не обрезается многоточием, даже длинный на малой этикетке', () => {
    const long = { ...pack, packLine: '44-46-48-50-52-54-56 / 1-1-1-1-1-1-1' };
    for (const t of LABEL_TEMPLATES) {
      const out = texts(long, t.id, options, 43, 25).join(' ');
      expect(out).not.toContain('…');
      expect(out).toContain('44-46-48-50-52-54-56');
    }
  });

  test('ростовка без цены — этикетка без цены (кроме «Скидки», которой цена нужна по смыслу)', () => {
    const noPrice = { ...pack, price: 0, noPrice: true };
    for (const t of LABEL_TEMPLATES.filter((x) => x.id !== 'sale')) {
      expect(texts(noPrice, t.id).join(' ')).not.toContain('₽');
      expect(texts(pack, t.id).join(' ')).toContain('₽');
    }
  });

  test('штрихкод и название остаются на этикетке ростовки без префикса «Арт.»', () => {
    const out = texts(pack, 'classic').join(' ');
    expect(out).toContain('Футболка базовая');
    expect(out).toContain('2000000000015');
    expect(out).toContain('Ростовка 48–52');
    expect(out).not.toContain('Арт. Ростовка');
    expect(texts(variation, 'classic').join(' ')).toContain('Арт. WS-TS01-SIN');
    expect(texts(pack, 'price-info').join(' ')).toContain('Упаковка');
    expect(texts(pack, 'price-info').join(' ')).not.toContain('Артикул');
  });

  test('текст ростовки укладывается в этикетку 58×40 и 70×50', () => {
    for (const [w, h] of [[58, 40], [70, 50]]) {
      for (const id of ['classic', 'price', 'size-price', 'tag', 'price-info'] as const) {
        const layout = layoutLabel(id, { widthMm: w, heightMm: h }, pack, options, measure);
        for (const item of layout.items) if (item.kind === 'text') expect(item.y).toBeLessThanOrEqual(h);
      }
    }
  });
});
