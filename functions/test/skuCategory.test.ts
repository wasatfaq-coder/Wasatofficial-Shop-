// UX audit 03.10, finding 16: a new product starts without a category, so its variant codes follow the one picked later
import { describe, expect, test } from 'bun:test';
import { generateSkuCode, recategorizeSkuCode } from '../../src/utils/inventory';

describe('a new product without a category yet', () => {
  test('a variant added before the category gets the category code once it is picked', () => {
    const code = generateSkuCode({ id: 'prod-1759500000000', category: '' }, 'Белый', 'M', 'WS');
    expect(code).toBe('WS-PR17-БЕЛ-M');
    expect(recategorizeSkuCode(code, '', 'shirts')).toBe(
      generateSkuCode({ id: 'prod-1759500000000', category: 'shirts' }, 'Белый', 'M', 'WS')
    );
  });

  test('switching from one category to another moves the codes along', () => {
    const code = generateSkuCode({ id: 'prod-17', category: 'shirts' }, 'Хаки', 'L', 'WS');
    expect(recategorizeSkuCode(code, 'shirts', 'trousers')).toBe('WS-TR17-ХАК-L');
  });

  test('a code typed by hand or from another source stays as it is', () => {
    expect(recategorizeSkuCode('ART-500', '', 'shirts')).toBe('ART-500');
    expect(recategorizeSkuCode('MS-PR01-BEL-M', '', 'shirts')).toBe('MS-PR01-BEL-M');
    expect(recategorizeSkuCode(undefined, '', 'shirts')).toBeUndefined();
  });
});
