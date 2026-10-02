// Пробы аудита 02.10: каждый тест записан «как должно быть»; падение = находка подтверждена.
import { describe, expect, test } from 'bun:test';
import {
  getOrderableStock, getVariantStock, generateDefaultSKUs, returnStockWithLogs, deductStockWithLogs,
  updateProductSkuStock, isHiddenFromSale, stockShortages,
} from '/home/user/Wasatofficial-Shop-/src/utils/inventory';
import { adjustedOrderTotals } from '/home/user/Wasatofficial-Shop-/src/utils/orderAdjustment';
import { calcOrderTotals, getAvailableDeliveryMethods, validatePromo } from '/home/user/Wasatofficial-Shop-/src/shared/orderPricing';
import type { CartItem, Product, PromoCode } from '/home/user/Wasatofficial-Shop-/src/types';

const prod = (over: Partial<Product> = {}): Product => ({
  id: 'p1', title: 'Пальто', price: 10000, category: 'coats', inStock: true, description: '', images: [],
  sizes: ['M'], colors: [{ name: 'Черный', hex: '#000' }],
  skus: [{ id: 'p1-m', color: 'Черный', size: 'M', stock: 3, skuCode: 'X' }], ...over,
}) as Product;
const line = (p: Product, q: number, extra: Partial<CartItem> = {}): CartItem =>
  ({ id: 'l1', product: p, selectedColor: 'Черный', selectedSize: 'M', quantity: q, ...extra }) as CartItem;

describe('N1 «Снят с витрины» не возвращается в продажу сам', () => {
  const hidden = prod({ inStock: false }); // снят администратором при остатке 3
  test('контроль: товар считается снятым', () => expect(isHiddenFromSale(hidden)).toBe(true));
  test('отмена заказа (returnStockWithLogs) не включает «В продаже»', () => {
    const { updatedProducts } = returnStockWithLogs([hidden], [line(hidden, 1)], 'WS-1');
    expect(updatedProducts[0].inStock).toBe(false);
  });
  test('правка остатка на складе (updateProductSkuStock) не включает «В продаже»', () => {
    expect(updateProductSkuStock(hidden, 'Черный', 'M', 5).inStock).toBe(false);
  });
});

describe('N2 предзаказ: распроданный товар нельзя снять с продажи', () => {
  test('товар с остатком 0 и «Снят с витрины» не заказывается при включённом предзаказе', () => {
    const soldOutHidden = prod({ inStock: false, skus: [{ id: 'p1-m', color: 'Черный', size: 'M', stock: 0, skuCode: 'X' }] });
    expect(getOrderableStock(soldOutHidden, 'Черный', 'M', true)).toBe(0);
  });
});

describe('N3 товар без вариантов: клиент и сервер видят разный остаток', () => {
  test('клиент (getVariantStock) не выдумывает 5 шт., как сервер (generateDefaultSKUs → 0)', () => {
    const noSkus = prod({ skus: undefined });
    const server = generateDefaultSKUs(noSkus).find((s) => s.size === 'M')!.stock;
    expect(getVariantStock(noSkus, 'Черный', 'M')).toBe(server);
  });
});

describe('N4 «Корректировка» отменённого заказа возвращает товар на склад второй раз', () => {
  test('заказ 2 шт., отмена, правка до 1 шт., восстановление: остаток должен быть 5 − 1 = 4', () => {
    let p = prod({ skus: [{ id: 'p1-m', color: 'Черный', size: 'M', stock: 5, skuCode: 'X' }] });
    // покупатель заказал 2 → 3
    p = deductStockWithLogs([p], [line(p, 2)], 'WS-1').updatedProducts[0];
    expect(p.skus![0].stock).toBe(3);
    // отмена (handleCancelAndReturnStock) → 5
    p = returnStockWithLogs([p], [line(p, 2)], 'WS-1').updatedProducts[0];
    // «Правка состава и склад» доступна у отменённого заказа: 2 → 1, модалка возвращает разницу (AdminOrderAdjustmentModal.tsx:285-295)
    p = returnStockWithLogs([p], [line(p, 1)], 'WS-1').updatedProducts[0];
    // восстановление (changeOrdersStatus) списывает текущий состав: 1
    p = deductStockWithLogs([p], [line(p, 1)], 'WS-1').updatedProducts[0];
    expect(p.skus![0].stock).toBe(4);
  });
  test('«Корректировка»: добавленный товар без остатка — нехватка видна (как у восстановления)', () => {
    const p = prod({ skus: [{ id: 'p1-m', color: 'Черный', size: 'M', stock: 0, skuCode: 'X' }] });
    // модалка не вызывает stockShortages, а deductStockWithLogs молча режет до 0
    const res = deductStockWithLogs([p], [line(p, 2)], 'WS-1');
    expect(stockShortages([p], [line(p, 2)]).length).toBe(1); // проверка есть в коде…
    expect(res.generatedLogs[0].changeQuantity).toBe(-2); // …а журнал пишет 0 вместо −2
  });
});

describe('N5 «Корректировка» пересчитывает скидку по сегодняшнему промокоду', () => {
  test('заказ со скидкой 10 %, после заказа код поменяли на 30 % — убрали 1 из 2 строк, скидка остаётся 10 %', () => {
    const p = prod({ price: 5000 });
    const order = { items: [line(p, 1), { ...line(p, 1), id: 'l2', selectedSize: 'L' }], totalPrice: 9000, deliveryFee: 0, discountAmount: 1000, promoCode: 'SALE' };
    const promoNow = { id: 'x', code: 'SALE', active: true, discountType: 'percent', discountValue: 30, discountPercent: 30 } as PromoCode;
    const t = adjustedOrderTotals(order, [line(p, 1)], [promoNow]);
    expect(t.discount).toBe(500);
  });
});

describe('N6 процентная скидка не съедает доставку', () => {
  test('промокод 100 % на товары 3000 + доставка 400 → к оплате 400', () => {
    const t = calcOrderTotals([{ productId: 'p1', price: 3000, quantity: 1 }], { discountType: 'percent', discountValue: 100, discountPercent: 100 }, 400);
    expect(t.total).toBe(400);
  });
});
