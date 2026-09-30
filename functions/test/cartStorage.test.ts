// Корзина в браузере — облегчённые строки (находка 26 обзора рисков, этап 2)
import { describe, expect, test } from 'bun:test';
import { loadStoredCart, toStoredCart } from '../../src/utils/cartStorage';
import type { CartItem, Product } from '../../src/types';

const photo = 'data:image/jpeg;base64,' + 'A'.repeat(170_000);
const product = {
  id: 'p1', title: 'Рубашка', price: 2990, category: 'shirts', inStock: true, description: 'x'.repeat(2000),
  images: [photo, photo, photo],
  skus: [{ id: 'p1-m', color: 'Белый', size: 'M', stock: 3 }],
} as unknown as Product;
const line = (id: string): CartItem => ({ id, product, quantity: 1, selectedColor: 'Белый', selectedSize: 'M' });

describe('cart storage', () => {
  test('nine lines of a product with photos fit: no photos, stock or texts in the stored cart', () => {
    const stored = JSON.stringify(toStoredCart(Array.from({ length: 9 }, (_, i) => line(`c${i}`))));
    expect(stored.length).toBeLessThan(10_000); // was ≈ 530 000 characters per line
    const [first] = JSON.parse(stored) as CartItem[];
    expect(first.product.id).toBe('p1');
    expect(first.product.price).toBe(2990);
    expect(first.product.skus).toBeUndefined();
    expect(first.quantity).toBe(1);
    expect(first.selectedSize).toBe('M');
  });

  test('reads light lines and carts saved with whole products; drops the old demo lines and junk', () => {
    const raw = JSON.stringify([line('old-full'), ...toStoredCart([line('light')]), { id: 'cart-init-1', product, quantity: 1 }, { id: 'x' }]);
    expect(loadStoredCart(raw).map((i) => i.id)).toEqual(['old-full', 'light']);
    expect(loadStoredCart('не json')).toEqual([]);
    expect(loadStoredCart(null)).toEqual([]);
  });
});
