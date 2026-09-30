/** Firestore keeps a document up to 1 MiB; photos inside the product (data: URIs) take most of it */
export const FIRESTORE_DOC_LIMIT_BYTES = 1_048_576;

/**
 * Leave a margin: Firestore counts field names and index overhead a little differently from JSON,
 * so a product close to the limit is refused although its JSON still fits.
 */
export const PRODUCT_SIZE_BUDGET_BYTES = 1_000_000;

/** Approximate stored size of a document: its JSON in UTF-8 */
export function docSizeBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

/** «0,4 МБ» for the form's photo space counter */
export function formatMegabytes(bytes: number): string {
  return `${(bytes / 1_048_576).toLocaleString('ru-RU', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} МБ`;
}
