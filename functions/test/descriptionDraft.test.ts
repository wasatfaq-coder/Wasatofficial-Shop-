// Быстрое заведение товара, этап 3: черновик описания из характеристик
import { describe, expect, test } from 'bun:test';
import { descriptionDraft, withDescriptionDraft } from '../../src/utils/descriptionDraft';

const empty = { composition: [], density: '', weave: '', fit: '' as const, country: '' };

describe('descriptionDraft', () => {
  test('a sentence for every characteristic the product has', () => {
    expect(
      descriptionDraft({
        composition: [{ fiber: 'Хлопок', percentage: 95 }, { fiber: 'Эластан', percentage: 5 }],
        density: '185',
        weave: 'Саржевое',
        fit: 'regular',
        country: 'Турция',
      })
    ).toBe(
      'Состав: 95% хлопок, 5% эластан. Плотность ткани — 185 г/м². Переплетение — саржевое. ' +
        'Покрой — классический (Regular Fit). Страна производства — Турция.'
    );
  });

  test('nothing made up: no characteristics — no draft, blank fibers are skipped', () => {
    expect(descriptionDraft(empty)).toBe('');
    expect(descriptionDraft({ ...empty, composition: [{ fiber: ' ', percentage: 100 }], country: 'Китай' })).toBe(
      'Страна производства — Китай.'
    );
  });

  test("the draft goes after the owner's text, once", () => {
    const draft = 'Страна производства — Китай.';
    expect(withDescriptionDraft('', draft)).toBe(draft);
    const withOwn = withDescriptionDraft('Лёгкая рубашка на лето.  ', draft);
    expect(withOwn).toBe(`Лёгкая рубашка на лето.\n\n${draft}`);
    expect(withDescriptionDraft(withOwn, draft)).toBe(withOwn);
    expect(withDescriptionDraft('Текст', '')).toBe('Текст');
  });
});
