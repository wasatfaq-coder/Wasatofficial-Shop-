import { describe, expect, test } from 'bun:test';
import {
  barcodeFormatProblem,
  code128Values,
  collectBarcodes,
  ean13CheckDigit,
  encodeBarcode,
  encodeCode128,
  encodeEan13,
  findBarcodeProblems,
  generateInternalEan13,
  isValidEan13,
  articleCode,
  articleGroupKey,
  unifyArticleBarcodes,
} from '../../src/shared/barcode';

const bits = (modules: boolean[]) => modules.map((m) => (m ? '1' : '0')).join('');

describe('EAN-13', () => {
  test('check digit', () => {
    expect(ean13CheckDigit('400638133393')).toBe(1);
    expect(ean13CheckDigit('590123412345')).toBe(7);
    expect(isValidEan13('4006381333931')).toBe(true);
    expect(isValidEan13('4006381333932')).toBe(false);
  });

  test('95 modules with guards', () => {
    const modules = bits(encodeEan13('4006381333931'));
    expect(modules).toHaveLength(95);
    expect(modules.startsWith('101')).toBe(true);
    expect(modules.slice(45, 50)).toBe('01010');
    expect(modules.endsWith('101')).toBe(true);
    // first digit 4 → parity LGLLGG; digit 0 in set L
    expect(modules.slice(3, 10)).toBe('0001101');
  });

  test('UPC-A is printed as EAN-13 with a leading zero', () => {
    expect(encodeBarcode('036000291452')).toMatchObject({ kind: 'ean13', text: '0036000291452' });
  });
});

describe('Code128', () => {
  test('check value and stop', () => {
    // start B 104 + P 48·1 + J 42·2 + J 42·3 + 1 17·4 + 2 18·5 + 3 19·6 + C 35·7 = 879; 879 mod 103 = 55
    const values = code128Values('PJJ123C');
    expect(values[0]).toBe(104);
    expect(values.at(-2)).toBe(55);
    expect(values.at(-1)).toBe(106);
  });

  test('every symbol is 11 modules, stop is 13', () => {
    expect(encodeCode128('WS-SH01-L')).toHaveLength((1 + 9 + 1) * 11 + 13);
  });
});

describe('problems and uniqueness', () => {
  test('format problems', () => {
    expect(barcodeFormatProblem(undefined)).toBe('missing');
    expect(barcodeFormatProblem('460730003001')).toBe('invalid');
    expect(barcodeFormatProblem('4607300030017')).toBe('invalid');
    expect(barcodeFormatProblem('Штрихкод')).toBe('invalid');
    expect(barcodeFormatProblem('WS-SH01-L')).toBeNull();
    expect(barcodeFormatProblem('4006381333931')).toBeNull();
  });

  test('the first SKU keeps a repeated code, later ones are duplicates', () => {
    const problems = findBarcodeProblems([
      { id: 'a', skus: [{ id: '1', barcode: '4006381333931' }, { id: '2' }] },
      { id: 'b', skus: [{ id: '1', barcode: '4006381333931' }] },
    ]);
    expect([...problems]).toEqual([
      ['a::2', 'missing'],
      ['b::1', 'duplicate'],
    ]);
  });

  test('internal codes start with 2, are valid and never repeat', () => {
    const taken = collectBarcodes([{ id: 'a', skus: [{ id: '1', barcode: '2000000000008' }] }]);
    let n = 0;
    // a generator that first returns only zeros must skip the taken code
    const random = () => (n++ < 11 ? 0 : Math.random());
    const first = generateInternalEan13(taken, random);
    expect(first).not.toBe('2000000000008');
    const codes = Array.from({ length: 500 }, () => generateInternalEan13(taken));
    for (const code of [first, ...codes]) {
      expect(code.startsWith('2')).toBe(true);
      expect(isValidEan13(code)).toBe(true);
    }
    expect(new Set([first, ...codes]).size).toBe(501);
  });
});

describe('articles: one barcode for all sizes of a colour', () => {
  const jacket = {
    id: 'jk',
    skus: [
      { id: 'b-m', color: 'Синий', size: 'M', skuCode: 'MS-JK03-BLU-M', barcode: '4006381333931' },
      { id: 'b-l', color: 'Синий', size: 'L', skuCode: 'MS-JK03-BLU-L', barcode: '4006381333931' },
      { id: 'k-m', color: 'Черный', size: '48 (M)', skuCode: 'MS-JK03-BLK-48' },
    ],
  };

  test('article code without the size', () => {
    expect(articleCode(jacket, 'Синий')).toBe('MS-JK03-BLU');
    expect(articleCode(jacket, 'синий ')).toBe('MS-JK03-BLU');
    expect(articleCode(jacket, 'Черный')).toBe('MS-JK03-BLK');
    expect(articleCode({ id: 'x', skus: [{ id: '1', color: 'A', size: 'XL', skuCode: 'CUSTOM' }] }, 'A')).toBe('CUSTOM');
  });

  test('sizes sharing a code are fine; different codes in one colour are a mismatch', () => {
    expect(findBarcodeProblems([jacket]).get('jk::b-m')).toBeUndefined();
    const mixed = { ...jacket, skus: [jacket.skus[0], { ...jacket.skus[1], barcode: '5901234123457' }] };
    expect(findBarcodeProblems([mixed]).get('jk::b-l')).toBe('mismatch');
    const other = { id: 'tee', skus: [{ id: '1', color: 'Белый', size: 'M', barcode: '4006381333931' }] };
    expect(findBarcodeProblems([jacket, other]).get('tee::1')).toBe('duplicate');
  });

  test('unify: one code per colour, different colours and products differ', () => {
    const mixed = {
      id: 'jk',
      skus: [
        { id: '1', color: 'Синий', size: 'M', barcode: '460730003001' },
        { id: '2', color: 'Синий', size: 'L', barcode: '5901234123457' },
        { id: '3', color: 'Черный', size: 'M' },
        { id: '4', color: 'Черный', size: 'L', barcode: '4006381333931' },
      ],
    };
    const other = { id: 'tee', skus: [{ id: '1', color: 'Белый', size: 'M', barcode: '4006381333931' }] };
    // only the jacket's colours are fixed (as the label generator does for the selected variations)
    const groups = new Set([articleGroupKey('jk', 'Синий'), articleGroupKey('jk', 'Черный')]);
    const [fixed, untouched] = unifyArticleBarcodes([mixed, other], groups);
    const codes = fixed.skus!.map((s) => s.barcode);
    expect(codes[0]).toBe('5901234123457'); // the colour's valid code is kept
    expect(codes[1]).toBe('5901234123457');
    expect(codes[2]).toBe(codes[3]);
    expect(codes[2]).not.toBe('4006381333931'); // another product already has it
    expect(untouched.skus![0].barcode).toBe('4006381333931');
    expect(findBarcodeProblems([fixed, untouched]).size).toBe(0);
  });
});

test('unify without a selection: the first article in the catalog keeps a shared code', () => {
  const a = { id: 'a', skus: [{ id: '1', color: 'X', barcode: '4006381333931' }] };
  const b = { id: 'b', skus: [{ id: '1', color: 'Y', barcode: '4006381333931' }] };
  const [fa, fb] = unifyArticleBarcodes([a, b]);
  expect(fa.skus![0].barcode).toBe('4006381333931');
  expect(fb.skus![0].barcode).not.toBe('4006381333931');
  expect(findBarcodeProblems([fa, fb]).size).toBe(0);
});
