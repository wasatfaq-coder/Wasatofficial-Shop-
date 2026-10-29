import type { Product } from '../types';
import { changedFields } from './fieldChanges';

/**
 * The product the form saves: what the owner changed in the form, put onto the product as the database has it now
 * (audit 29.10, finding 9). The form is filled from the product at its opening; a field the owner left as it was keeps
 * what changed meanwhile — a price from «Курсы → Применить», `priceHistory`, a second admin's edit — instead of writing
 * the opened copy back. A field the form cleared is removed. No live product (a new one, or deleted meanwhile) —
 * the form's product as it is.
 */
export function mergeFormIntoLive(opened: Product, edited: Product, live: Product | undefined): Product {
  if (!live) return edited;
  const changes = changedFields(
    opened as unknown as Record<string, unknown>,
    edited as unknown as Record<string, unknown>
  );
  const merged: Record<string, unknown> = { ...live, ...changes.set };
  for (const key of changes.removed) delete merged[key];
  return merged as unknown as Product;
}
