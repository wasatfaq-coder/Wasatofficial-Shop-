/**
 * «Подставить курс ЦБ» in «Курсы и наценка» (docs/wholesale-spec.md, owner's decision 09.10): the admin's browser takes
 * today's official rates of the dollar and the yuan and only fills the fields — prices change after «Применить», as before.
 * cbr.ru itself answers without CORS, so the rates come from the public mirror of its daily file (cbr-xml-daily.ru),
 * the same numbers in JSON. No Cloud Function: the shop is on the free Spark plan.
 */
import type { PurchaseCurrency } from './currencyPricing';

export const CBR_DAILY_URL = 'https://www.cbr-xml-daily.ru/daily_json.js';

const FETCH_TIMEOUT_MS = 10_000;

/** Official rates for one day: roubles for one dollar and one yuan */
export interface CbrRates {
  usd: number;
  cny: number;
  /** The day the central bank set the rates, YYYY-MM-DD */
  date: string;
}

const RATE_DIGITS = 4;
const MAX_RATE = 100_000;

/** Roubles for one unit: the bank quotes some currencies per 10 or 100 units (`Nominal`) */
function unitRate(valute: unknown, code: PurchaseCurrency): number | null {
  if (!valute || typeof valute !== 'object') return null;
  const entry = (valute as Record<string, unknown>)[code];
  if (!entry || typeof entry !== 'object') return null;
  const { Value, Nominal } = entry as Record<string, unknown>;
  if (typeof Value !== 'number' || typeof Nominal !== 'number' || !(Value > 0) || !(Nominal > 0)) return null;
  const rate = Math.round((Value / Nominal) * 10 ** RATE_DIGITS) / 10 ** RATE_DIGITS;
  return Number.isFinite(rate) && rate > 0 && rate <= MAX_RATE ? rate : null;
}

/** The mirror's answer, read without trusting it; null — not the expected file */
export function parseCbrDaily(value: unknown): CbrRates | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const date = typeof v.Date === 'string' ? /^\d{4}-\d{2}-\d{2}/.exec(v.Date)?.[0] : undefined;
  const usd = unitRate(v.Valute, 'USD');
  const cny = unitRate(v.Valute, 'CNY');
  if (!date || usd === null || cny === null) return null;
  return { usd, cny, date };
}

/** «9 октября 2026» from YYYY-MM-DD, without the time zone moving the day */
export function cbrDateLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Today's official rates; throws when there is no answer or it is not the expected file */
export async function fetchCbrRates(fetchImpl: typeof fetch = fetch): Promise<CbrRates> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(CBR_DAILY_URL, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`CBR rates: HTTP ${response.status}`);
    const rates = parseCbrDaily(await response.json());
    if (!rates) throw new Error('CBR rates: unexpected answer');
    return rates;
  } finally {
    clearTimeout(timer);
  }
}
