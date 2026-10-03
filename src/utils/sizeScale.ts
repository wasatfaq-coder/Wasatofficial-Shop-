import { RUSSIAN_SIZE_TABLE_ROWS } from './russianSizeTable';

/**
 * One size scale for the catalog filter (UX audit 03.10, stage 3, finding 3): «M», «48 (M)» and «48/50 (M)» are one
 * chip «M» with the Russian size written under it. A size without exactly one letter size («48», «M-L», «One size»)
 * keeps its own chip. The filter keeps the chip's label in `selectedSizes`; `sizeMatches` compares keys on both sides,
 * so «XXL» finds «2XL» and a size chosen before this change («48 (M)») still finds what it found.
 */

// Cyrillic letters the owner may type instead of the Latin ones: «М», «ХL»
const LATIN_LOOKALIKES: Record<string, string> = { М: 'M', Х: 'X' };

const tokensOf = (size: string): string[] =>
  size
    .trim()
    .toUpperCase()
    .replace(/[МХ]/g, (ch) => LATIN_LOOKALIKES[ch])
    .split(/[^0-9A-ZА-ЯЁ]+/)
    .filter(Boolean);

/** «XXL» and «2XL» are one size: the key counts the X's («2XL»), «M» stays «M» */
function letterKey(token: string): string | null {
  if (token === 'M') return 'M';
  const m = /^(?:(X*)|([2-9])X)([SL])$/.exec(token);
  if (!m) return null;
  const xs = m[2] ? Number(m[2]) : m[1].length;
  if (xs === 0) return m[3];
  return xs === 1 ? `X${m[3]}` : `${xs}X${m[3]}`;
}

const isRussianNumber = (token: string) => /^\d{2}$/.test(token) && Number(token) >= 38 && Number(token) <= 76;

/** The one letter size in a size string («48 (M)» → «M»); null for «48», «M-L» or «One size» */
function letterOf(size: string): string | null {
  const letters = [...new Set(tokensOf(size).map(letterKey).filter((k): k is string => k !== null))];
  return letters.length === 1 ? letters[0] : null;
}

/** The letter key of a size («48 (M)» → «M»), or the size itself when it has no single letter size */
export function sizeFilterKey(size: string): string {
  return letterOf(size) ?? size.trim();
}

/** Does a product size fall under the chosen filter size: «M» finds «M» and «48 (M)», «48» finds only «48» */
export function sizeMatches(productSize: string, selected: string): boolean {
  return sizeFilterKey(productSize) === sizeFilterKey(selected);
}

const MULTI_X = [2, 3, 4, 5, 6, 7, 8, 9];
const LETTER_ORDER = [...MULTI_X.map((n) => `${n}XS`).reverse(), 'XS', 'S', 'M', 'L', 'XL', ...MULTI_X.map((n) => `${n}XL`)];

export interface SizeChip {
  /** One key per chip: «2XL» for «XXL» and «2XL» */
  key: string;
  /** The size as the store writes it, kept in `selectedSizes`: «M», «XXL», «48» */
  label: string;
  /** Russian size under a letter size: from the products' own pairs («48 (M)»), else the size table; '' if none */
  russian: string;
  /** Products available in this size (not units) */
  count: number;
}

/**
 * Filter chips for the sizes of these products: letter sizes in their order, then numbers, then the rest.
 * `isAvailable(product, size)` decides whether the product counts for a raw size (stock, hidden from sale).
 */
export function buildSizeChips<P extends { sizes: string[] }>(
  products: P[],
  isAvailable: (product: P, size: string) => boolean
): SizeChip[] {
  const groups = new Map<string, { labels: Map<string, number>; russian: Set<number>; products: Set<P> }>();
  for (const p of products) {
    for (const size of p.sizes ?? []) {
      if (!size.trim()) continue;
      const key = sizeFilterKey(size);
      const group = groups.get(key) ?? { labels: new Map(), russian: new Set(), products: new Set() };
      groups.set(key, group);
      const tokens = tokensOf(size);
      const isLetter = letterOf(size) !== null;
      const label = isLetter ? tokens.find((t) => letterKey(t) === key) ?? key : size.trim();
      group.labels.set(label, (group.labels.get(label) ?? 0) + 1);
      if (isLetter) tokens.filter(isRussianNumber).forEach((t) => group.russian.add(Number(t)));
      if (isAvailable(p, size)) group.products.add(p);
    }
  }

  const chips: SizeChip[] = [...groups].map(([key, g]) => {
    // the spelling most products use («XXL» or «2XL»)
    const label = [...g.labels].sort((a, b) => b[1] - a[1])[0][0];
    let russian = '';
    if (LETTER_ORDER.includes(key)) {
      const own = [...g.russian].sort((a, b) => a - b);
      const table = RUSSIAN_SIZE_TABLE_ROWS.find((row) => letterKey(row.int) === key)?.ru;
      const nums = own.length > 0 ? own : table ? [table] : [];
      russian = nums.length === 0 ? '' : nums.length === 1 ? String(nums[0]) : `${nums[0]}–${nums[nums.length - 1]}`;
    }
    return { key, label, russian, count: g.products.size };
  });

  const rank = (c: SizeChip) => {
    const letter = LETTER_ORDER.indexOf(c.key);
    if (letter !== -1) return [0, letter] as const;
    const num = Number.parseFloat(c.key);
    return Number.isFinite(num) && /^\d/.test(c.key) ? ([1, num] as const) : ([2, 0] as const);
  };
  return chips.sort((a, b) => {
    const [ga, va] = rank(a);
    const [gb, vb] = rank(b);
    return ga - gb || va - vb || a.key.localeCompare(b.key, 'ru');
  });
}
