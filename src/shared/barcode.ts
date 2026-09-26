/**
 * Barcodes on product labels: EAN-13 (the retail standard) and Code128 for other codes.
 * New codes are internal EAN-13 starting with «2» (GS1 prefixes 200–299 are reserved for a store's own
 * numbering, so they never clash with manufacturers' codes). No browser APIs: shared with tests.
 */

export type BarcodeKind = 'ean13' | 'code128';

export interface EncodedBarcode {
  kind: BarcodeKind;
  /** true = dark module; every module has the same width */
  modules: boolean[];
  /** Text printed under the bars */
  text: string;
}

export type BarcodeProblem = 'missing' | 'duplicate' | 'invalid';

const isDigits = (value: string) => /^\d+$/.test(value);

/** Check digit for the first 12 digits of an EAN-13 */
export function ean13CheckDigit(first12: string): number {
  if (!/^\d{12}$/.test(first12)) throw new Error('EAN-13: нужно 12 цифр');
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}

/** UPC-A (12 digits) is an EAN-13 with a leading zero */
function asEan13(code: string): string | null {
  if (isValidEan13(code)) return code;
  if (/^\d{12}$/.test(code) && isValidEan13(`0${code}`)) return `0${code}`;
  return null;
}

const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const EAN_G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const EAN_R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
const EAN_PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

/** 95 modules: guard, 6 left digits, center guard, 6 right digits, guard */
export function encodeEan13(code: string): boolean[] {
  if (!isValidEan13(code)) throw new Error(`Неверный EAN-13: ${code}`);
  const parity = EAN_PARITY[Number(code[0])];
  let bits = '101';
  for (let i = 1; i <= 6; i++) {
    const digit = Number(code[i]);
    bits += parity[i - 1] === 'L' ? EAN_L[digit] : EAN_G[digit];
  }
  bits += '01010';
  for (let i = 7; i <= 12; i++) bits += EAN_R[Number(code[i])];
  bits += '101';
  return [...bits].map((b) => b === '1');
}

/** Code128 bar/space widths for values 0–106 (106 = stop) */
const CODE128_WIDTHS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];
const CODE128_START_B = 104;
const CODE128_STOP = 106;

/** Code128 set B can print ASCII 32–126 */
export function canEncodeCode128(text: string): boolean {
  return text.length > 0 && [...text].every((ch) => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) <= 126);
}

/** Code128 set B values including start, check and stop */
export function code128Values(text: string): number[] {
  if (!canEncodeCode128(text)) throw new Error(`Code128: недопустимые символы в «${text}»`);
  const values = [CODE128_START_B, ...[...text].map((ch) => ch.charCodeAt(0) - 32)];
  const check = values.reduce((sum, value, i) => sum + value * (i === 0 ? 1 : i), 0) % 103;
  return [...values, check, CODE128_STOP];
}

export function encodeCode128(text: string): boolean[] {
  const modules: boolean[] = [];
  for (const value of code128Values(text)) {
    [...CODE128_WIDTHS[value]].forEach((width, i) => {
      for (let n = 0; n < Number(width); n++) modules.push(i % 2 === 0);
    });
  }
  return modules;
}

/**
 * Why a code can't go on a label: missing, a 12/13-digit number with a wrong check digit, or characters a
 * scanner can't read. Other codes are printed as Code128.
 */
export function barcodeFormatProblem(code: string | undefined | null): Exclude<BarcodeProblem, 'duplicate'> | null {
  const value = (code ?? '').trim();
  if (!value) return 'missing';
  if (isDigits(value) && (value.length === 12 || value.length === 13)) return asEan13(value) ? null : 'invalid';
  return canEncodeCode128(value) ? null : 'invalid';
}

/** Modules for a code that passed barcodeFormatProblem */
export function encodeBarcode(code: string): EncodedBarcode {
  const value = code.trim();
  const ean = asEan13(value);
  if (ean) return { kind: 'ean13', modules: encodeEan13(ean), text: ean };
  return { kind: 'code128', modules: encodeCode128(value), text: value };
}

/**
 * New internal EAN-13: «2», 11 random digits, check digit. Never one of `taken`; the result is added to it,
 * so a batch of calls with the same set gives different codes.
 */
export function generateInternalEan13(taken: Set<string>, random: () => number = Math.random): string {
  for (;;) {
    let first12 = '2';
    for (let i = 0; i < 11; i++) first12 += Math.floor(random() * 10) % 10;
    const code = `${first12}${ean13CheckDigit(first12)}`;
    if (!taken.has(code)) {
      taken.add(code);
      return code;
    }
  }
}

interface BarcodeOwner {
  id: string;
  skus?: { id: string; barcode?: string }[];
}

export const skuKey = (productId: string, skuId: string) => `${productId}::${skuId}`;

/** Every barcode in the catalog (to keep new ones unique) */
export function collectBarcodes(products: BarcodeOwner[]): Set<string> {
  const taken = new Set<string>();
  for (const p of products) for (const s of p.skus ?? []) if (s.barcode?.trim()) taken.add(s.barcode.trim());
  return taken;
}

/**
 * Problems per SKU (key: skuKey). For a repeated code the first SKU in catalog order keeps it and the
 * later ones are «duplicate».
 */
export function findBarcodeProblems(products: BarcodeOwner[]): Map<string, BarcodeProblem> {
  const problems = new Map<string, BarcodeProblem>();
  const seen = new Set<string>();
  for (const p of products) {
    for (const s of p.skus ?? []) {
      const key = skuKey(p.id, s.id);
      const formatProblem = barcodeFormatProblem(s.barcode);
      if (formatProblem) {
        problems.set(key, formatProblem);
        continue;
      }
      const code = s.barcode!.trim();
      if (seen.has(code)) problems.set(key, 'duplicate');
      else seen.add(code);
    }
  }
  return problems;
}
