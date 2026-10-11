// Экран из адреса (аудит 07.10, находка 48): parseRoute (src/utils/navigation.ts) читает и новые пути (/catalog,
// /product/{id}), и старые ссылки «#/…», которые уже лежат у покупателей в закладках и мессенджерах.
import { describe, expect, test } from 'bun:test';
import { currentRoutePath, parseRoute, productHref, routePath } from '../../src/utils/navigation';

const at = (pathname: string, hash = '') => ({ pathname, hash });

describe('parseRoute — путь', () => {
  test('экраны магазина по пути; корень и неизвестный путь — null (главная)', () => {
    expect(parseRoute(at('/catalog'))).toEqual({ tab: 'catalog' });
    expect(parseRoute(at('/cart/'))).toEqual({ tab: 'cart' });
    expect(parseRoute(at('//favorites'))).toEqual({ tab: 'favorites' });
    expect(parseRoute(at('/order-success'))).toEqual({ tab: 'order-success' });
    expect(parseRoute(at('/offer'))).toEqual({ tab: 'offer' });
    expect(parseRoute(at('/privacy'))).toEqual({ tab: 'privacy' });
    expect(parseRoute(at('/'))).toBeNull();
    expect(parseRoute(at(''))).toBeNull();
    expect(parseRoute(at('/home'))).toBeNull();
    expect(parseRoute(at('/admin'))).toBeNull();
    expect(parseRoute(at('/catalog/shirts'))).toBeNull();
  });

  test('товар — /product/{id}, id раскодируется; без id или с лишней частью — null', () => {
    expect(parseRoute(at('/product/linen-shirt-01'))).toEqual({ tab: 'product-detail', productId: 'linen-shirt-01' });
    expect(parseRoute(at('/product/%D1%80%D1%83%D0%B1%D0%B0%D1%88%D0%BA%D0%B0'))).toEqual({ tab: 'product-detail', productId: 'рубашка' });
    expect(parseRoute(at('/product'))).toBeNull();
    expect(parseRoute(at('/product/'))).toBeNull();
    expect(parseRoute(at('/product/a/b'))).toBeNull();
    // a broken escape is not a product id
    expect(parseRoute(at('/product/%E0%A4%A'))).toBeNull();
  });
});

describe('parseRoute — старые ссылки «#/…»', () => {
  test('«#/catalog» и «#/product/{id}» открывают свой экран, путь при этом — корень', () => {
    expect(parseRoute(at('/', '#/catalog'))).toEqual({ tab: 'catalog' });
    expect(parseRoute(at('/', '#/product/polo-01'))).toEqual({ tab: 'product-detail', productId: 'polo-01' });
    expect(parseRoute(at('/', '#/product/a%20b'))).toEqual({ tab: 'product-detail', productId: 'a b' });
  });

  test('ссылка «#/…» важнее пути; пустой «#/» и якорь без «/» — не экран', () => {
    expect(parseRoute(at('/cart', '#/catalog'))).toEqual({ tab: 'catalog' });
    expect(parseRoute(at('/cart', '#/'))).toEqual({ tab: 'cart' });
    expect(parseRoute(at('/cart', '#reviews'))).toEqual({ tab: 'cart' });
    expect(parseRoute(at('/', '#/unknown'))).toBeNull();
  });

  test('адрес «как пишет магазин» сохраняет старую ссылку целиком, чтобы её заменить путём', () => {
    expect(currentRoutePath(at('/', '#/catalog'))).toBe('/#/catalog');
    expect(currentRoutePath(at('/catalog', '#reviews'))).toBe('/catalog');
  });
});

describe('путь экрана и обратно', () => {
  test('routePath → parseRoute возвращает тот же экран', () => {
    for (const tab of ['catalog', 'cart', 'favorites', 'profile', 'checkout', 'order-success', 'offer', 'privacy'] as const) {
      expect(parseRoute(at(routePath({ tab })))).toEqual({ tab });
    }
    const product = { tab: 'product-detail' as const, productId: 'рубашка/01 ?' };
    expect(routePath(product)).toBe(productHref('рубашка/01 ?'));
    expect(parseRoute(at(routePath(product)))).toEqual(product);
    expect(routePath({ tab: 'home' })).toBe('/');
    expect(routePath({ tab: 'product-detail' })).toBe('/catalog');
  });
});
