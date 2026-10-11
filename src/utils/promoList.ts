/**
 * «Промокоды» in the admin (stage 8 of docs/admin-wholesale-plan.md, part 2): the list with search and status chips,
 * batches of single-use codes as one row, and the checks of the batch generator. No JSX: the tests import it.
 */
import type { PromoCode } from '../types';
import { isLimitedPromo, isPromoExpired } from '../shared/orderPricing';

export type PromoListFilter = 'all' | 'active' | 'paused' | 'expired' | 'partners' | 'batches';

export const PROMO_LIST_FILTERS: { id: PromoListFilter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'active', label: 'Действуют' },
  { id: 'paused', label: 'На паузе' },
  { id: 'expired', label: 'Срок истёк' },
  { id: 'partners', label: 'Партнёры' },
  { id: 'batches', label: 'Пачки' },
];

/** A code as the checkout compares it: case and outer spaces do not matter */
export const normalizedCode = (code: string | undefined): string => (code ?? '').trim().toUpperCase();

/** Every use of a limited code is taken: the buyer gets «лимит исчерпан» */
export function isPromoUsedUp(promo: Pick<PromoCode, 'usageLimit' | 'usedCount'>): boolean {
  return isLimitedPromo(promo) && (promo.usedCount ?? 0) >= (promo.usageLimit as number);
}

/** A buyer can apply it now: switched on, not expired, uses left */
export function isPromoWorking(promo: PromoCode): boolean {
  return promo.active && !isPromoExpired(promo) && !isPromoUsedUp(promo);
}

/** Codes of one batch can carry neighbouring times: the generator before 11.10 read the clock for every code */
const BATCH_RUN_GAP_MS = 1000;

/**
 * Which batch each single-use code belongs to (id → key). Codes with the same name whose ids «batch-{time}-{n}» are at
 * most a second apart are one generation: the old generator read the clock per code, so a batch of 100 could carry two
 * times. A batch without such ids is grouped by its name alone
 */
export function batchKeys(promos: PromoCode[]): Map<string, string> {
  const keys = new Map<string, string>();
  const runs = new Map<string, { id: string; time: number }[]>();
  for (const promo of promos) {
    if (!promo.isBatch) continue;
    const name = promo.batchName ?? '';
    const run = /^batch-(\d+)-\d+$/.exec(promo.id);
    if (!run) {
      keys.set(promo.id, `name:${name}`);
      continue;
    }
    const list = runs.get(name) ?? [];
    list.push({ id: promo.id, time: Number(run[1]) });
    runs.set(name, list);
  }
  for (const [name, list] of runs) {
    list.sort((a, b) => a.time - b.time);
    let start = list[0].time;
    let previous = start;
    for (const code of list) {
      if (code.time - previous > BATCH_RUN_GAP_MS) start = code.time;
      previous = code.time;
      keys.set(code.id, `batch-${start}|${name}`);
    }
  }
  return keys;
}

export interface PromoBatch {
  key: string;
  /** «SMS-»: the common start of the codes */
  prefix: string;
  codes: PromoCode[];
  used: number;
  /** Codes a buyer can still apply: these are worth sending */
  unused: PromoCode[];
  active: number;
}

function commonPrefix(codes: string[]): string {
  if (codes.length === 0) return '';
  let prefix = codes[0];
  for (const code of codes) {
    while (!code.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  return prefix;
}

/** The prefix the owner typed, from the batch's name «Пачка SMS- (20 шт.)»; random parts may share more letters */
function namedPrefix(batchName: string | undefined): string | null {
  const named = /^Пачка (\S+) \(\d+ шт\.\)$/.exec(batchName ?? '');
  return named ? named[1] : null;
}

function batchOf(key: string, codes: PromoCode[]): PromoBatch {
  // a batch of one code: the whole code is not a prefix
  const name = codes[0]?.batchName ?? '';
  const prefix =
    namedPrefix(name) ??
    // a batch without a prefix: the random codes may share a letter by chance
    (name.startsWith('Пачка без префикса') || codes.length < 2 ? '' : commonPrefix(codes.map((p) => p.code)));
  return {
    key,
    prefix,
    codes,
    used: codes.filter((p) => (p.usedCount ?? 0) > 0).length,
    unused: codes.filter((p) => isPromoWorking(p) && (p.usedCount ?? 0) === 0),
    active: codes.filter((p) => p.active).length,
  };
}

export type PromoListRow = { kind: 'promo'; promo: PromoCode } | { kind: 'batch'; batch: PromoBatch };

export function matchesPromoQuery(promo: PromoCode, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [promo.code, promo.title, promo.partnerName, promo.batchName].some((text) =>
    (text ?? '').toLowerCase().includes(q)
  );
}

function matchesFilter(promo: PromoCode, filter: PromoListFilter): boolean {
  switch (filter) {
    case 'active':
      return isPromoWorking(promo);
    case 'paused':
      return !promo.active;
    case 'expired':
      return isPromoExpired(promo);
    case 'partners':
      return Boolean(promo.isReferral);
    case 'batches':
      return Boolean(promo.isBatch);
    default:
      return true;
  }
}

/**
 * The rows of the list: a batch is one row in its first code's place (100 codes of a mailing no longer fill the
 * list), shown when any of its codes fits the chip, and always counted and acted on as a whole — «Удалить пачку» under
 * «На паузе» removes every code of it, not only the paused ones. A search finds a single code of a batch and shows it
 * as its own row
 */
export function promoListRows(promos: PromoCode[], filter: PromoListFilter, query: string): PromoListRow[] {
  const searching = query.trim() !== '';
  const keys = searching ? new Map<string, string>() : batchKeys(promos);
  const groups = new Map<string, PromoCode[]>();
  for (const promo of promos) {
    const key = keys.get(promo.id);
    if (key) groups.set(key, [...(groups.get(key) ?? []), promo]);
  }
  const rows: PromoListRow[] = [];
  const shown = new Set<string>();
  for (const promo of promos) {
    const key = keys.get(promo.id);
    if (!key) {
      if (matchesFilter(promo, filter) && matchesPromoQuery(promo, query)) rows.push({ kind: 'promo', promo });
      continue;
    }
    if (shown.has(key)) continue;
    const codes = groups.get(key) ?? [];
    if (!codes.some((p) => matchesFilter(p, filter))) continue;
    shown.add(key);
    rows.push({ kind: 'batch', batch: batchOf(key, codes) });
  }
  return rows;
}

/** How many codes each chip would show (a batch counts as its codes) */
export function promoFilterCounts(promos: PromoCode[]): Record<PromoListFilter, number> {
  const counts = Object.fromEntries(PROMO_LIST_FILTERS.map((f) => [f.id, 0])) as Record<PromoListFilter, number>;
  for (const promo of promos) {
    for (const { id } of PROMO_LIST_FILTERS) if (matchesFilter(promo, id)) counts[id] += 1;
  }
  return counts;
}

export const BATCH_MAX_COUNT = 100;

export interface BatchInput {
  prefix: string;
  count: number;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  minOrder: number;
}

/** The generator's checks, as the promo form's: listed above the button instead of silently clamping the values */
export function batchInputErrors(input: BatchInput): string[] {
  const { count, discountType, discountValue, minOrder } = input;
  const maxValue = discountType === 'percent' ? 90 : 50000;
  return [
    !/^[A-Z0-9-]{0,12}$/.test(normalizedCode(input.prefix)) &&
      'Префикс — до 12 латинских букв, цифр или дефисов',
    !(Number.isInteger(count) && count >= 1 && count <= BATCH_MAX_COUNT) && `Количество кодов — от 1 до ${BATCH_MAX_COUNT}`,
    !(Number.isFinite(discountValue) && discountValue >= 1 && discountValue <= maxValue) &&
      (discountType === 'percent'
        ? 'Размер скидки — от 1 до 90 %'
        : `Размер скидки — от 1 до ${maxValue.toLocaleString('ru-RU')} ₽`),
    !(Number.isFinite(minOrder) && minOrder >= 0) && 'Мин. сумма чека — 0 или больше',
  ].filter((m): m is string => Boolean(m));
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomPart(length: number, random: () => number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return out;
}

/**
 * A new code that no other promo has (case does not matter): «Сгенерировать код» in the form and every code of a batch.
 * Without the letters and digits that read alike (O/0, I/1)
 */
export function uniquePromoCode(
  prefix: string,
  taken: Iterable<string>,
  random: () => number = Math.random,
  length = 5
): string {
  const used = new Set([...taken].map(normalizedCode));
  const start = normalizedCode(prefix);
  for (let size = length; ; size++) {
    for (let attempt = 0; attempt < 50; attempt++) {
      const code = `${start}${randomPart(size, random)}`;
      if (!used.has(code)) return code;
    }
  }
}

/** The categories of a code by their names from «Категории», not by ids; a removed category keeps its id */
export function categoryNamesText(ids: string[], categories: { id: string; name: string }[]): string {
  const names = new Map(categories.map((c) => [c.id, c.name]));
  return ids.map((id) => names.get(id) ?? id).join(', ');
}
