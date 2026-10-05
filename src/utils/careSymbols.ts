import type { CareInstructionItem } from '../types';

/**
 * Care symbols as on a garment label (ГОСТ ISO 3758; fast product entry, stage 2, `docs/fast-product-entry-spec.md`).
 * The symbols are the same on a label in any language: the owner taps the one they see, and the product gets a care
 * rule with its text. The customer's card is unchanged: it shows the rule's kind (`icon`) and its text.
 */

export type CareSymbolGroup = 'wash' | 'bleach' | 'tumble' | 'natural' | 'iron' | 'clean';

export interface CareSymbol {
  id: string;
  /** One symbol per group on a label: a new one in the group replaces the old */
  group: CareSymbolGroup;
  icon: CareInstructionItem['icon'];
  /** The caption under the symbol in the form */
  short: string;
  /** The rule's text on the customer's card */
  label: string;
}

export const CARE_SYMBOLS: CareSymbol[] = [
  { id: 'wash-30', short: '30 °C', group: 'wash', icon: 'wash', label: 'Стирка при 30 °C' },
  { id: 'wash-40', short: '40 °C', group: 'wash', icon: 'wash', label: 'Стирка при 40 °C' },
  { id: 'wash-60', short: '60 °C', group: 'wash', icon: 'wash', label: 'Стирка при 60 °C' },
  { id: 'wash-hand', short: 'Вручную', group: 'wash', icon: 'wash', label: 'Только ручная стирка' },
  { id: 'wash-no', short: 'Не стирать', group: 'wash', icon: 'wash', label: 'Не стирать' },
  { id: 'bleach-no', short: 'Не отбел.', group: 'bleach', icon: 'bleach', label: 'Не отбеливать' },
  { id: 'tumble-low', short: 'Барабан, низк.', group: 'tumble', icon: 'dry', label: 'Сушка в барабане при низкой температуре' },
  { id: 'tumble-no', short: 'Не в барабане', group: 'tumble', icon: 'dry', label: 'Не сушить в барабане' },
  { id: 'dry-flat', short: 'Расправить', group: 'natural', icon: 'dry', label: 'Сушить в расправленном виде' },
  { id: 'iron-1', short: 'До 110 °C', group: 'iron', icon: 'iron', label: 'Гладить при температуре до 110 °C' },
  { id: 'iron-2', short: 'До 150 °C', group: 'iron', icon: 'iron', label: 'Гладить при температуре до 150 °C' },
  { id: 'iron-3', short: 'До 200 °C', group: 'iron', icon: 'iron', label: 'Гладить при температуре до 200 °C' },
  { id: 'iron-no', short: 'Не гладить', group: 'iron', icon: 'iron', label: 'Не гладить' },
  { id: 'clean-p', short: 'Химч. P', group: 'clean', icon: 'clean', label: 'Профессиональная химчистка (P)' },
  { id: 'clean-f', short: 'Химч. F', group: 'clean', icon: 'clean', label: 'Деликатная химчистка (F)' },
  { id: 'clean-no', short: 'Без химч.', group: 'clean', icon: 'clean', label: 'Не подвергать химчистке' },
];

const keyOf = (label: string) => label.trim().toLowerCase();

/** The symbol whose rule the product has (by the rule's text) */
export function careSymbolOf(item: Pick<CareInstructionItem, 'label'>): CareSymbol | undefined {
  return CARE_SYMBOLS.find((s) => keyOf(s.label) === keyOf(item.label));
}

/**
 * The care list after a symbol is tapped: a symbol the product has is taken away, another one is added in place of the
 * symbol of its group (one per group, as on a label). Rules typed by hand stay as they are.
 */
export function toggleCareSymbol(care: CareInstructionItem[], symbol: CareSymbol): CareInstructionItem[] {
  if (care.some((c) => careSymbolOf(c)?.id === symbol.id)) {
    return care.filter((c) => careSymbolOf(c)?.id !== symbol.id);
  }
  const rule: CareInstructionItem = { icon: symbol.icon, label: symbol.label, desc: '' };
  const sameGroup = care.findIndex((c) => careSymbolOf(c)?.group === symbol.group);
  if (sameGroup < 0) return [...care, rule];
  return care.map((c, i) => (i === sameGroup ? { ...rule, desc: c.desc } : c)).filter(
    (c, i) => i === sameGroup || careSymbolOf(c)?.group !== symbol.group
  );
}
