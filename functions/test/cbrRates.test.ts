// «Подставить курс ЦБ» (этап 13 плана docs/admin-wholesale-plan.md): разбор дневного файла курсов ЦБ
import { describe, expect, test } from 'bun:test';
import { CBR_DAILY_URL, cbrDateLabel, fetchCbrRates, parseCbrDaily } from '../../src/utils/cbrRates';

// shape of cbr-xml-daily.ru/daily_json.js, other currencies cut
const sample = {
  Date: '2026-10-09T11:30:00+03:00',
  PreviousDate: '2026-10-08T11:30:00+03:00',
  Timestamp: '2026-10-08T19:00:00+03:00',
  Valute: {
    USD: { ID: 'R01235', NumCode: '840', CharCode: 'USD', Nominal: 1, Name: 'Доллар США', Value: 81.2345, Previous: 81.1 },
    CNY: { ID: 'R01375', NumCode: '156', CharCode: 'CNY', Nominal: 1, Name: 'Юань', Value: 11.3712, Previous: 11.36 },
  },
};

describe('parseCbrDaily', () => {
  test('курс доллара и юаня и день ЦБ', () => {
    expect(parseCbrDaily(sample)).toEqual({ usd: 81.2345, cny: 11.3712, date: '2026-10-09' });
  });

  test('курс за 10 единиц делится на номинал', () => {
    const tenYuan = { ...sample, Valute: { ...sample.Valute, CNY: { ...sample.Valute.CNY, Nominal: 10, Value: 113.712 } } };
    expect(parseCbrDaily(tenYuan)?.cny).toBe(11.3712);
  });

  test('чужой или испорченный ответ не подставляется', () => {
    expect(parseCbrDaily(null)).toBeNull();
    expect(parseCbrDaily('USD 81')).toBeNull();
    expect(parseCbrDaily({ ...sample, Date: 'вчера' })).toBeNull();
    expect(parseCbrDaily({ ...sample, Valute: { USD: sample.Valute.USD } })).toBeNull();
    expect(parseCbrDaily({ ...sample, Valute: { ...sample.Valute, USD: { ...sample.Valute.USD, Value: '81' } } })).toBeNull();
    expect(parseCbrDaily({ ...sample, Valute: { ...sample.Valute, USD: { ...sample.Valute.USD, Value: 0 } } })).toBeNull();
    expect(parseCbrDaily({ ...sample, Valute: { ...sample.Valute, USD: { ...sample.Valute.USD, Nominal: 0 } } })).toBeNull();
  });
});

test('день ЦБ подписью, без сдвига по часовому поясу', () => {
  expect(cbrDateLabel('2026-10-09')).toBe('9 октября 2026 г.');
});

describe('fetchCbrRates', () => {
  test('берёт файл ЦБ и разбирает его', async () => {
    let asked = '';
    const fake = (async (url: string) => {
      asked = url;
      return new Response(JSON.stringify(sample));
    }) as unknown as typeof fetch;
    expect(await fetchCbrRates(fake)).toEqual({ usd: 81.2345, cny: 11.3712, date: '2026-10-09' });
    expect(asked).toBe(CBR_DAILY_URL);
  });

  test('ошибка сервера или чужой ответ — ошибка, а не нули в полях', async () => {
    const down = (async () => new Response('', { status: 503 })) as unknown as typeof fetch;
    await expect(fetchCbrRates(down)).rejects.toThrow('HTTP 503');
    const other = (async () => new Response('{"rates":{}}')) as unknown as typeof fetch;
    await expect(fetchCbrRates(other)).rejects.toThrow('unexpected answer');
  });
});
