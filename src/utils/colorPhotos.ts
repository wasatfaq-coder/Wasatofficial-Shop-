// Optional binding of a product colour to a photo (owner request): `colors[i].imageIndex` is a 0-based
// position in `product.images`. Nothing is bound by default; an index outside the gallery is ignored.

interface ColorWithPhoto {
  name: string;
  imageIndex?: number;
}

/** A usable photo position: a whole number inside the gallery */
export function validImageIndex(index: unknown, imageCount: number): index is number {
  return typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < imageCount;
}

/** Photo position bound to the colour, or null when there is no binding or it points outside the gallery */
export function colorImageIndex(
  product: { images?: readonly string[]; colors?: readonly ColorWithPhoto[] },
  colorName: string,
): number | null {
  const color = product.colors?.find((c) => c.name === colorName);
  const index = color?.imageIndex;
  return validImageIndex(index, product.images?.length ?? 0) ? index : null;
}

/** Binds the colour to a photo position (null — unbinds); other colours stay as they are */
export function setColorImage<T extends ColorWithPhoto>(colors: readonly T[], colorName: string, index: number | null): T[] {
  return colors.map((c) => {
    if (c.name !== colorName) return c;
    const { imageIndex: _old, ...rest } = c;
    return index === null ? (rest as T) : { ...rest, imageIndex: index } as T;
  });
}

/**
 * Follows the photos when the gallery changes: `oldToNew[old]` is the new position of the photo
 * (null — the photo is gone, so the binding is cleared).
 */
export function remapColorImages<T extends ColorWithPhoto>(colors: readonly T[], oldToNew: readonly (number | null)[]): T[] {
  return colors.map((c) => {
    if (c.imageIndex === undefined) return c;
    const next = oldToNew[c.imageIndex];
    const { imageIndex: _old, ...rest } = c;
    return typeof next === 'number' ? ({ ...rest, imageIndex: next } as T) : (rest as T);
  });
}

/** Mapping for `remapColorImages` when the photo at `removed` is deleted */
export function removalMap(length: number, removed: number): (number | null)[] {
  return Array.from({ length }, (_, i) => (i === removed ? null : i > removed ? i - 1 : i));
}

/** Mapping for `remapColorImages` when the photo at `from` is moved to position `to` (cover = to 0) */
export function moveMap(length: number, from: number, to: number): number[] {
  const order = Array.from({ length }, (_, i) => i);
  const [item] = order.splice(from, 1);
  order.splice(to, 0, item);
  // order[newIndex] = oldIndex → invert
  const map = new Array<number>(length);
  order.forEach((oldIndex, newIndex) => {
    map[oldIndex] = newIndex;
  });
  return map;
}
