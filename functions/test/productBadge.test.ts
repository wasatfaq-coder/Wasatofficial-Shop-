// Старая цена и значок скидки у покупателя — только правдивые (аудит админки 09.10, находки 2 и 3)
import { describe, expect, test } from 'bun:test';
import { shownBadge, shownOldPrice } from '../../src/utils/productBadge';

describe('the struck-out old price', () => {
  test('shows only above the price', () => {
    expect(shownOldPrice({ price: 900, originalPrice: 1000 })).toBe(1000);
    expect(shownOldPrice({ price: 4800, originalPrice: 4500 })).toBeNull();
    expect(shownOldPrice({ price: 900, originalPrice: 900 })).toBeNull();
    expect(shownOldPrice({ price: 900 })).toBeNull();
  });
});

describe('the badge', () => {
  test('a «-N%» badge states the discount the prices give now', () => {
    expect(shownBadge({ price: 720, originalPrice: 900, badge: '-15%' })).toBe('-20%');
    expect(shownBadge({ price: 850, originalPrice: 1000, badge: '−15 %' })).toBe('-15%');
  });

  test('a «-N%» badge without a discount is not shown', () => {
    expect(shownBadge({ price: 900, badge: '-15%' })).toBeNull();
    expect(shownBadge({ price: 4800, originalPrice: 4500, badge: '-10%' })).toBeNull();
  });

  test('other badges stay as the owner wrote them', () => {
    expect(shownBadge({ price: 900, badge: 'Хит' })).toBe('Хит');
    expect(shownBadge({ price: 900, badge: 'Sale' })).toBe('Sale');
    expect(shownBadge({ price: 900, badge: '  ' })).toBeNull();
    expect(shownBadge({ price: 900 })).toBeNull();
  });
});
