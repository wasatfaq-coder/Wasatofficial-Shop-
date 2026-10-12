// Optional colour → photo binding (owner request «5»): reading, binding, following gallery changes
import { describe, expect, test } from 'bun:test';
import { colorImageIndex, moveMap, remapColorImages, removalMap, setColorImage } from '../../src/utils/colorPhotos';
import { normalizeProductColors } from '../../src/utils/colorCode';

const colors = [
  { name: 'Красный', hex: '#C62828', imageIndex: 2 },
  { name: 'Синий', hex: '#2F5DA8' },
];

describe('colorImageIndex', () => {
  test('returns the bound photo position', () => {
    expect(colorImageIndex({ images: ['a', 'b', 'c'], colors }, 'Красный')).toBe(2);
  });
  test('nothing bound, unknown colour and out-of-range index give null', () => {
    expect(colorImageIndex({ images: ['a', 'b', 'c'], colors }, 'Синий')).toBeNull();
    expect(colorImageIndex({ images: ['a', 'b', 'c'], colors }, 'Зелёный')).toBeNull();
    expect(colorImageIndex({ images: ['a', 'b'], colors }, 'Красный')).toBeNull();
    expect(colorImageIndex({ images: ['a', 'b', 'c'], colors: [{ name: 'X', imageIndex: -1 }] }, 'X')).toBeNull();
    expect(colorImageIndex({ images: ['a', 'b', 'c'], colors: [{ name: 'X', imageIndex: 1.5 }] }, 'X')).toBeNull();
  });
});

describe('setColorImage', () => {
  test('binds and unbinds only the named colour', () => {
    const bound = setColorImage(colors, 'Синий', 0);
    expect(bound[1].imageIndex).toBe(0);
    expect(bound[0].imageIndex).toBe(2);
    const cleared = setColorImage(bound, 'Красный', null);
    expect('imageIndex' in cleared[0]).toBe(false);
  });
});

describe('remapColorImages', () => {
  test('deleting a photo shifts later bindings and clears the deleted one', () => {
    expect(remapColorImages(colors, removalMap(3, 0))[0].imageIndex).toBe(1);
    expect('imageIndex' in remapColorImages(colors, removalMap(3, 2))[0]).toBe(false);
  });
  test('moving a photo to the cover follows the photo', () => {
    // photo 2 becomes the cover: red follows it to 0
    expect(remapColorImages(colors, moveMap(3, 2, 0))[0].imageIndex).toBe(0);
    // photo 0 moved to the end: red (2) shifts to 1
    expect(remapColorImages(colors, moveMap(3, 0, 2))[0].imageIndex).toBe(1);
  });
  test('colors without binding are returned as they are', () => {
    expect(remapColorImages(colors, removalMap(3, 0))[1]).toBe(colors[1]);
  });
});

describe('normalizeProductColors keeps the binding', () => {
  test('keeps a whole non-negative imageIndex and drops junk', () => {
    const out = normalizeProductColors([
      { name: 'Красный', hex: '#C62828', imageIndex: 2 },
      { name: 'Синий', hex: '#2F5DA8', imageIndex: -3 },
      { name: 'Серый', hex: '#8B939C', imageIndex: 'x' },
    ]);
    expect(out[0].imageIndex).toBe(2);
    expect('imageIndex' in out[1]).toBe(false);
    expect('imageIndex' in out[2]).toBe(false);
  });
});
