// Промокод с лимитом — только со входом Google (решение владельца 08.10, аудит 07.10, находка 9): анонимный вход
// бесплатный, и поддельные заказы с него сжигали лимит. Коды без лимита гость применяет, как раньше
import { describe, expect, test } from 'bun:test';
import { isLimitedPromo, PROMO_NEEDS_GOOGLE_TEXT, promoSignInProblem } from '../../src/shared/orderPricing';

describe('a code with a usage limit', () => {
  test('is a code with usageLimit above 0, as the rules count it', () => {
    expect(isLimitedPromo({ usageLimit: 1 })).toBe(true);
    expect(isLimitedPromo({ usageLimit: 100 })).toBe(true);
    expect(isLimitedPromo({})).toBe(false);
    expect(isLimitedPromo({ usageLimit: 0 })).toBe(false);
    expect(isLimitedPromo({ usageLimit: undefined })).toBe(false);
  });

  test('a guest is asked to sign in with Google; a Google buyer applies it', () => {
    expect(promoSignInProblem({ usageLimit: 1 }, false)).toBe(PROMO_NEEDS_GOOGLE_TEXT);
    expect(PROMO_NEEDS_GOOGLE_TEXT).toContain('входа через Google');
    expect(promoSignInProblem({ usageLimit: 1 }, true)).toBeNull();
  });

  test('a code without a limit works for a guest as before', () => {
    expect(promoSignInProblem({}, false)).toBeNull();
    expect(promoSignInProblem({ usageLimit: 0 }, false)).toBeNull();
  });
});
