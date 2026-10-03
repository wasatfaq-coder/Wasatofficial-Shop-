/**
 * Colour of a product variation from any source: a HEX code copied from a supplier's site or a design tool
 * («#1E2B37», «1e2b37», «#1E2B37FF», «#FFF»), «rgb(30, 43, 55)», a code inside the name («Хаки #556B2F») or,
 * without a code, a shade picked by the name («Тёмно-синий»). The result is always «#RRGGBB».
 */

/** Swatch of a colour whose name says nothing about the shade; the admin picks the real one in the form */
export const UNKNOWN_COLOR_HEX = '#94A3B8';

const RGB_CODE = /rgba?\(\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})[^)]*\)/i;
/** «#» and 3, 4, 6 or 8 hex digits; minDigits 6 skips a code still being typed («#55») */
const hashCode = (minDigits: number) =>
  new RegExp(`#(${minDigits <= 3 ? '[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4}' : '[0-9a-f]{8}|[0-9a-f]{6}'})(?![0-9a-z])`, 'i');
/** A code without «#» as its own word in the code field («HEX 1E2B37»): 6 or 8 hex digits with at least one figure */
const BARE_WORD_CODE = /(?:^|[^0-9a-zа-яё])((?=[0-9a-f]*\d)(?:[0-9a-f]{8}|[0-9a-f]{6}))(?![0-9a-zа-яё])/i;
/**
 * The same inside a name («Хаки 556B2F» from a supplier's table) — only with figures and letters A–F together:
 * a number («Хаки 100200») is the supplier's article of the colour, not its shade
 */
const NAME_WORD_CODE = /(?:^|[^0-9a-zа-яё])((?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])(?:[0-9a-f]{8}|[0-9a-f]{6}))(?![0-9a-zа-яё])/i;

function toHex(digits: string): string {
  let d = digits.toUpperCase();
  if (d.length === 3 || d.length === 4) d = d.slice(0, 3).replace(/(.)/g, '$1$1');
  return '#' + d.slice(0, 6);
}

function rgbToHex(match: RegExpMatchArray): string {
  return '#' + [match[1], match[2], match[3]].map((v) => Math.min(255, Number(v)).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/**
 * The colour code in a text, or null. `bare` — the text is the HEX field itself: digits without «#» count too
 * («1E2B37», «FFF», «HEX 1E2B37»).
 */
export function readColorCode(text: string, { bare = false } = {}): string | null {
  const value = String(text ?? '').trim();
  if (!value) return null;
  const rgb = value.match(RGB_CODE);
  if (rgb) return rgbToHex(rgb);
  const hash = value.match(hashCode(3));
  if (hash) return toHex(hash[1]);
  if (!bare) return null;
  const whole = value.match(/^(?:0x)?([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})$/i);
  if (whole) return toHex(whole[1]);
  const word = value.match(BARE_WORD_CODE);
  return word ? toHex(word[1]) : null;
}

/**
 * «Хаки #556B2F», «Хаки (556B2F)», «Navy: rgb(31, 42, 68)» → name and code; without a code — the name and null.
 * minDigits 6 — while the name is being typed, a short «#55» is not taken for a code yet.
 */
export function splitColorEntry(text: string, minDigits: 3 | 6 = 3): { name: string; hex: string | null } {
  const value = String(text ?? '');
  const rgb = value.match(RGB_CODE);
  const hash = rgb ? null : value.match(hashCode(minDigits));
  const word = rgb || hash ? null : value.match(NAME_WORD_CODE);
  const found = rgb ?? hash ?? word;
  if (!found || found.index === undefined) return { name: value.trim(), hex: null };
  const hex = rgb ? rgbToHex(rgb) : toHex((hash ?? word)![1]);
  const codeText = word ? word[1] : found[0];
  const start = word ? found.index + found[0].indexOf(word[1]) : found.index;
  const name = (value.slice(0, start) + value.slice(start + codeText.length))
    .replace(/\(\s*\)|\[\s*\]/g, '')
    .replace(/^[\s:;,.–—-]+|[\s:;,.–—-]+$/g, '')
    .replace(/\s{2,}/g, ' ');
  return { name, hex };
}

/** «Тёмно-синий» and «темно синий» are one colour */
export function normalizeColorName(name: string): string {
  return String(name ?? '').trim().toLowerCase().replace(/ё/g, 'е').replace(/[\s-]+/g, ' ');
}

/** Shades of the common clothing colours: compound names first («темно синий» before «синий») */
const SHADES: [roots: string[], hex: string][] = [
  [['темно син', 'темносин', 'navy', 'нэви', 'неви'], '#1F2A44'],
  [['светло голуб', 'светлоголуб'], '#BFD7EA'],
  [['светло сер', 'светлосер'], '#C9CED6'],
  [['темно сер', 'темносер'], '#4A4F57'],
  [['темно зел', 'темнозел'], '#1F4D2E'],
  [['антрацит'], '#383E42'],
  [['графит'], '#3B3F45'],
  [['серебр', 'silver'], '#C0C0C0'],
  [['черн', 'black'], '#1A1A1A'],
  [['молочн', 'айвори', 'ivory', 'экрю'], '#F3EEE3'],
  [['кремов', 'cream'], '#F1E4C9'],
  [['бел', 'white'], '#FFFFFF'],
  [['беж', 'beige'], '#D9C4A3'],
  [['песоч', 'sand'], '#D2B48C'],
  [['кэмел', 'камел', 'camel'], '#C19A6B'],
  [['капучино'], '#A78B71'],
  [['шоколад'], '#4E342E'],
  [['коричн', 'brown'], '#6B4A2F'],
  [['хаки', 'khaki'], '#6B6B47'],
  [['оливк', 'олив', 'olive'], '#708238'],
  [['мятн', 'мята', 'mint'], '#98D7C2'],
  [['бирюз', 'turquoise'], '#30B5B2'],
  [['зелен', 'green'], '#2E7D4F'],
  [['джинс', 'деним', 'denim'], '#3B5B8C'],
  [['индиго', 'indigo'], '#3F4A8A'],
  [['голуб', 'sky'], '#8DB3D9'],
  [['син', 'blue'], '#2F5DA8'],
  [['бордо', 'марсал', 'burgundy'], '#6D1F2C'],
  [['винн', 'wine'], '#722F37'],
  [['терракот'], '#C0603D'],
  [['красн', 'red'], '#C62828'],
  [['оранж', 'orange'], '#EF7D22'],
  [['горчич', 'mustard'], '#C9A227'],
  [['золот', 'gold'], '#C9A227'],
  [['желт', 'yellow'], '#F2C94C'],
  [['пудр'], '#E6C3C0'],
  [['розов', 'pink'], '#E8A0B4'],
  [['лаванд', 'сирен', 'lavender', 'lilac'], '#B4A7D6'],
  [['фиолет', 'purple', 'violet'], '#6A4C93'],
  [['сер', 'grey', 'gray'], '#8B939C'],
];

/** A shade for a colour name, or null when the name says nothing about it («Принт», «Основной») */
export function colorHexForName(name: string): string | null {
  const normalized = normalizeColorName(name);
  if (!normalized) return null;
  const words = normalized.split(/[^a-zа-я]+/).filter(Boolean);
  for (const [roots, hex] of SHADES) {
    for (const root of roots) {
      // a Latin root is a whole word («red», not «redwood»); a Russian one is the start of a word or of the name
      if (/^[a-z]+$/.test(root) ? words.includes(root) : words.some((w) => w.startsWith(root)) || normalized.startsWith(root)) {
        return hex;
      }
    }
  }
  return null;
}

/** Colours of a product as the form keeps them: an old string colour («Черный») gets a shade by its name */
export function normalizeProductColors(colors: unknown): { name: string; hex: string }[] {
  if (!Array.isArray(colors)) return [];
  return colors
    .map((c) => {
      if (typeof c === 'string') return { name: c.trim(), hex: colorHexForName(c) ?? UNKNOWN_COLOR_HEX };
      const raw = (c ?? {}) as { name?: unknown; hex?: unknown };
      const name = String(raw.name ?? '').trim();
      return { name, hex: readColorCode(String(raw.hex ?? ''), { bare: true }) ?? colorHexForName(name) ?? UNKNOWN_COLOR_HEX };
    })
    .filter((c) => c.name);
}
