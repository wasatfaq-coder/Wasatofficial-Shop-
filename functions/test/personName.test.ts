// ФИО и части адреса (задание владельца 02.10): общий код браузера и placeOrder
import { describe, expect, test } from 'bun:test';
import { cleanAddressParts, fullName, namePartsOf, requiresFullName, splitLegacyName } from '../../src/shared/personName';

describe('fullName', () => {
  test('«Фамилия Имя Отчество» without empty parts and extra spaces', () => {
    expect(fullName({ lastName: ' Петров ', firstName: 'Иван', middleName: 'Сергеевич' })).toBe('Петров Иван Сергеевич');
    expect(fullName({ lastName: 'Smith', firstName: 'John', middleName: '' })).toBe('Smith John');
    expect(fullName({})).toBe('');
  });
});

describe('splitLegacyName / namePartsOf', () => {
  test('the old field was «Имя и фамилия»: two words are first name and last name', () => {
    expect(splitLegacyName('Пётр Покупатель')).toEqual({ firstName: 'Пётр', lastName: 'Покупатель' });
  });
  test('three words follow «Фамилия Имя Отчество», one word is the first name', () => {
    expect(splitLegacyName('Петров Иван Сергеевич')).toEqual({ lastName: 'Петров', firstName: 'Иван', middleName: 'Сергеевич' });
    expect(splitLegacyName('Иван')).toEqual({ firstName: 'Иван' });
    expect(splitLegacyName('  ')).toEqual({});
  });
  test('saved parts win over the old name', () => {
    expect(namePartsOf({ name: 'Старое Имя', lastName: 'Петров', firstName: 'Иван' })).toEqual({
      lastName: 'Петров', firstName: 'Иван', middleName: '',
    });
  });
});

describe('requiresFullName', () => {
  test('Почта России and transport companies need the full name', () => {
    expect(requiresFullName({ type: 'post', title: 'Посылка' })).toBe(true);
    expect(requiresFullName({ title: 'Почта России' })).toBe(true);
    expect(requiresFullName({ type: 'custom', title: 'СДЭК до пункта' })).toBe(true);
    expect(requiresFullName({ title: 'Boxberry' })).toBe(true);
  });
  test('the store courier and pickup do not', () => {
    expect(requiresFullName({ type: 'courier', title: 'Курьером до двери' })).toBe(false);
    expect(requiresFullName({ type: 'pickup', title: 'Самовывоз' })).toBe(false);
  });
});

describe('cleanAddressParts', () => {
  test('keeps only filled known parts, trimmed and cut', () => {
    const parts = cleanAddressParts({ city: ' Москва ', street: '', comment: 'x'.repeat(500), extra: 'y' } as never);
    expect(parts).toEqual({ city: 'Москва', comment: 'x'.repeat(300) });
    expect(cleanAddressParts({ city: ' ' })).toBeUndefined();
  });
});
