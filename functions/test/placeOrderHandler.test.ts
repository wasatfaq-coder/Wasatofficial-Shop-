// Обработчик onCall функции placeOrder (functions/src/index.ts; аудит 07.10, находка 43) — без эмулятора функций:
// только отказы до чтения базы. Ошибка заказа приходит сайту как HttpsError со своим кодом и русским текстом, а не
// «internal». На этом же держится включение серверных заказов в «Витрине»: пустой запрос должен вернуть
// «invalid-argument» (isPlaceOrderAvailable в src/firebase.ts), иначе сайт решит, что функции нет.
// Заказ целиком (цены, склад, промокод) проверяет placeOrder.test.ts на эмуляторе Firestore.
import { describe, expect, test } from 'bun:test';
import { HttpsError } from 'firebase-functions/v2/https';
import { placeOrder } from '../src/index';
import { QUICK_ORDER_DELIVERY_ID } from '../../src/shared/orderPricing';

const item = { productId: 'shirt', color: 'Белый', size: 'M', quantity: 1 };
const valid = {
  items: [item],
  deliveryMethodId: 'courier',
  deliveryAddress: 'Москва, ул. Тверская, 1',
  paymentMethod: 'Перевод по номеру телефона',
  contact: { name: 'Иван', phone: '+79990000000' },
};

async function refusal(data: unknown): Promise<HttpsError> {
  try {
    await placeOrder.run({ data, rawRequest: {} as never, acceptsStreaming: false } as Parameters<typeof placeOrder.run>[0]);
  } catch (err) {
    expect(err).toBeInstanceOf(HttpsError);
    return err as HttpsError;
  }
  throw new Error('Expected the call to be refused');
}

describe('placeOrder (onCall)', () => {
  test('пустой запрос — «invalid-argument»: так «Витрина» узнаёт, что функция развёрнута', async () => {
    const err = await refusal({});
    expect(err.code).toBe('invalid-argument');
    expect(err.message).toBe('Корзина пуста');
    expect((await refusal(null)).message).toBe('Пустой запрос');
  });

  test('ошибка запроса доходит до покупателя своим текстом, а не «internal»', async () => {
    const cases: [unknown, string][] = [
      [{ ...valid, items: [] }, 'Корзина пуста'],
      [{ ...valid, items: Array(51).fill(item) }, 'Слишком много позиций в заказе (максимум 50)'],
      [{ ...valid, items: [{ ...item, quantity: 0 }] }, 'Некорректное количество товара'],
      [{ ...valid, items: [{ ...item, quantity: 1.5 }] }, 'Некорректное количество товара'],
      [{ ...valid, paymentMethod: '' }, 'Не заполнено поле: способ оплаты'],
      [{ ...valid, paymentMethod: 'x'.repeat(129) }, 'Некорректное поле: способ оплаты'],
      [{ ...valid, contact: { name: 'Иван' } }, 'Не заполнено поле: телефон'],
      [{ ...valid, deliveryAddress: 42 }, 'Некорректное поле: адрес доставки'],
    ];
    for (const [data, message] of cases) {
      const err = await refusal(data);
      expect(err.code).toBe('invalid-argument');
      expect(err.message).toBe(message);
    }
  });

  test('заказ в 1 клик с промокодом отклоняется до чтения базы', async () => {
    const err = await refusal({ ...valid, deliveryMethodId: QUICK_ORDER_DELIVERY_ID, promoCode: 'sale' });
    expect(err.code).toBe('invalid-argument');
    expect(err.message).toBe('Промокод нельзя применить к заказу в 1 клик');
  });
});
