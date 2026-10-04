// Быстрое заведение товара, этап 2: значки ухода как на бирке
import { describe, expect, test } from 'bun:test';
import { CARE_SYMBOLS, careSymbolOf, toggleCareSymbol } from '../../src/utils/careSymbols';
import { CARE_ICON_LABELS } from '../../src/utils/productAttributes';

const symbol = (id: string) => CARE_SYMBOLS.find((s) => s.id === id)!;

describe('careSymbols', () => {
  test('every symbol has its own id and text, a kind the customer card knows and a caption', () => {
    expect(new Set(CARE_SYMBOLS.map((s) => s.id)).size).toBe(CARE_SYMBOLS.length);
    expect(new Set(CARE_SYMBOLS.map((s) => s.label.toLowerCase())).size).toBe(CARE_SYMBOLS.length);
    for (const s of CARE_SYMBOLS) {
      expect(CARE_ICON_LABELS[s.icon]).toBeTruthy();
      expect(s.short.length).toBeGreaterThan(0);
    }
  });

  test('a tapped symbol adds its rule; tapped again, it is taken away', () => {
    const added = toggleCareSymbol([], symbol('wash-30'));
    expect(added).toEqual([{ icon: 'wash', label: 'Стирка при 30 °C', desc: '' }]);
    expect(toggleCareSymbol(added, symbol('wash-30'))).toEqual([]);
  });

  test('one symbol per group, as on a label: 40 °C replaces 30 °C in its place, keeping the explanation', () => {
    const care = [
      { icon: 'wash' as const, label: 'Стирка при 30 °C', desc: 'наизнанку' },
      { icon: 'iron' as const, label: 'Не гладить', desc: '' },
    ];
    expect(toggleCareSymbol(care, symbol('wash-40'))).toEqual([
      { icon: 'wash', label: 'Стирка при 40 °C', desc: 'наизнанку' },
      { icon: 'iron', label: 'Не гладить', desc: '' },
    ]);
    // tumble drying and drying flat are different groups
    const dried = toggleCareSymbol(toggleCareSymbol([], symbol('tumble-no')), symbol('dry-flat'));
    expect(dried.map((c) => c.label)).toEqual(['Не сушить в барабане', 'Сушить в расправленном виде']);
  });

  test('rules typed by hand stay; a symbol is found by its text in any case', () => {
    const typed = [{ icon: 'wash' as const, label: 'Стирать наизнанку', desc: '' }];
    expect(toggleCareSymbol(typed, symbol('wash-30'))).toHaveLength(2);
    expect(careSymbolOf({ label: ' стирка при 30 °c ' })?.id).toBe('wash-30');
    expect(careSymbolOf({ label: 'Стирать наизнанку' })).toBeUndefined();
  });
});
