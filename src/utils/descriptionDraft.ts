import type { FabricCompositionItem, Product } from '../types';
import { FIT_LABELS, compositionToMaterial, formatFabricDensity } from './productAttributes';

/**
 * «Черновик из характеристик» (fast product entry, stage 3, `docs/fast-product-entry-spec.md`): the description repeats
 * what the characteristics say, so the form writes those sentences and the owner adds their own 2–3. Only what the
 * product has: an empty characteristic gives no sentence, no characteristics — no draft. Values stand after a dash,
 * so a fiber or a country typed in any form reads correctly without declining it.
 */
export interface DraftSource {
  composition: FabricCompositionItem[];
  /** Density number or «185 г/м²» */
  density: string;
  weave: string;
  fit: Product['fit'] | '';
  country: string;
}

export function descriptionDraft({ composition, density, weave, fit, country }: DraftSource): string {
  const sentences: string[] = [];
  const material = compositionToMaterial(composition);
  if (material) sentences.push(`Состав: ${material}.`);
  const fabric = formatFabricDensity(density);
  if (fabric) sentences.push(`Плотность ткани — ${fabric}.`);
  if (weave.trim()) sentences.push(`Переплетение — ${weave.trim().toLowerCase()}.`);
  if (fit && FIT_LABELS[fit]) {
    const label = FIT_LABELS[fit];
    sentences.push(`Покрой — ${label.charAt(0).toLowerCase()}${label.slice(1)}.`);
  }
  if (country.trim()) sentences.push(`Страна производства — ${country.trim()}.`);
  return sentences.join(' ');
}

/**
 * The description with the draft added: after the owner's text on a new paragraph, or alone in an empty field. Pressed
 * twice, the draft is not added twice.
 */
export function withDescriptionDraft(description: string, draft: string): string {
  if (!draft || description.includes(draft)) return description;
  const text = description.trimEnd();
  return text ? `${text}\n\n${draft}` : draft;
}
