// Покупатель и владелец видят, что не сохранилось (аудит 07.10, этап 3, находки 12, 14, 15, 17, 18, 20, 21)
import { describe, expect, test } from 'bun:test';
import { firestoreErrorCode, firestoreOperationError, needsOwnerAttention } from '../../src/utils/firestoreErrors';
import { isBrowserOffline, retryWithDelays, settleWithin } from '../../src/utils/network';
import { digitsAfterCountryCode, isQuickOrderPhoneComplete } from '../../src/utils/phoneNumber';
import { CHAT_PHOTO_MAX_LENGTH, isStorablePhoto } from '../../src/utils/imageUpload';
import { buildReport, errorText } from '../../src/utils/clientErrors';

/** What the database client throws: FirebaseError with a code */
const firebaseError = (code: string, message: string) => Object.assign(new Error(message), { name: 'FirebaseError', code });
const context = { page: '/profile', release: '', browser: '' };

describe('database errors (findings 15, 18, 21)', () => {
  test('a failed write keeps the code and the original, and says what and where', () => {
    const original = firebaseError('permission-denied', 'Missing or insufficient permissions.');
    const wrapped = firestoreOperationError(original, 'update', 'chat_messages/msg-1');
    expect(wrapped.message).toBe('Firestore update chat_messages/msg-1 [code=permission-denied]: Missing or insufficient permissions.');
    expect(wrapped.code).toBe('permission-denied');
    expect(wrapped.cause).toBe(original);
    expect(wrapped.stack).toContain('Caused by: FirebaseError');
    // the chat tells «15 minutes passed» only for the rules' refusal
    expect(firestoreErrorCode(wrapped)).toBe('permission-denied');
    expect(firestoreErrorCode({ cause: { cause: { code: 'firestore/unavailable' } } })).toBe('unavailable');
    expect(firestoreErrorCode(new Error('no code'))).toBeUndefined();
    expect(firestoreErrorCode('text')).toBeUndefined();
  });

  test('the owner hears of refusals, not of a missing network', () => {
    expect(needsOwnerAttention(firebaseError('permission-denied', 'x'))).toBe(true);
    expect(needsOwnerAttention(firebaseError('resource-exhausted', 'Quota exceeded.'))).toBe(true);
    expect(needsOwnerAttention(firebaseError('failed-precondition', 'The query requires an index.'))).toBe(true);
    expect(needsOwnerAttention(firebaseError('unavailable', 'offline'))).toBe(false);
    expect(needsOwnerAttention(new Error('plain'))).toBe(false);
  });

  test('the report of a refused write carries the code; a write without a network is not reported', () => {
    const refused = firestoreOperationError(firebaseError('permission-denied', 'Missing or insufficient permissions.'), 'write', 'users/u1');
    expect(buildReport('console', errorText(refused), context)?.message).toBe(
      'Firestore write users/u1 [code=permission-denied]: Missing or insufficient permissions.'
    );
    const offline = firestoreOperationError(firebaseError('unavailable', 'Failed to get document because the client is offline.'), 'write', 'users/u1');
    expect(buildReport('console', errorText(offline), context)).toBeNull();
  });
});

describe('waiting without a network (findings 12, 20)', () => {
  test('a write that does not answer in time is a timeout; an answer or a refusal passes through', async () => {
    expect(await settleWithin(new Promise<void>(() => {}), 5)).toEqual({ timedOut: true });
    expect(await settleWithin(Promise.resolve(7), 50)).toEqual({ timedOut: false, value: 7 });
    await expect(settleWithin(Promise.reject(new Error('refused')), 50)).rejects.toThrow('refused');
  });

  test('the browser is offline only when it says so', () => {
    const before = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    try {
      Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true });
      expect(isBrowserOffline()).toBe(true);
      Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
      expect(isBrowserOffline()).toBe(false);
    } finally {
      if (before) Object.defineProperty(globalThis, 'navigator', before);
    }
  });

  test('the admin check is tried again after each delay and stops when the sign-in is gone', async () => {
    const waited: number[] = [];
    const sleep = async (ms: number) => {
      waited.push(ms);
    };
    let calls = 0;
    const flaky = async () => {
      calls += 1;
      if (calls < 3) throw new Error(`fail ${calls}`);
      return true;
    };
    expect(await retryWithDelays(flaky, [3, 10, 30], { sleep })).toBe(true);
    expect(waited).toEqual([3, 10]);

    calls = 0;
    const always = async () => {
      calls += 1;
      throw new Error(`fail ${calls}`);
    };
    await expect(retryWithDelays(always, [1, 2], { sleep })).rejects.toThrow('fail 3');
    calls = 0;
    await expect(retryWithDelays(always, [1, 2], { sleep, shouldStop: () => true })).rejects.toThrow('fail 1');
    expect(calls).toBe(1);
  });
});

describe('the phone of «Заказ в 1 клик» (finding 17)', () => {
  test('10 digits after +7, spaces and brackets do not count', () => {
    expect(isQuickOrderPhoneComplete('+7 999 123-45-67')).toBe(true);
    expect(isQuickOrderPhoneComplete('+79990001122')).toBe(true);
    // 8 digits passed before: the text was 11 characters long
    expect(isQuickOrderPhoneComplete('+7 12345678')).toBe(false);
    expect(isQuickOrderPhoneComplete('+7 1 2 3 4')).toBe(false);
    expect(digitsAfterCountryCode('+7 ')).toBe(0);
    expect(digitsAfterCountryCode('+7 (999) 12')).toBe(5);
  });
});

describe('a chat photo the rules take (finding 14)', () => {
  test('a compressed JPEG passes; an uncompressed HEIC or an oversized picture does not', () => {
    expect(isStorablePhoto(`data:image/jpeg;base64,${'A'.repeat(1000)}`, CHAT_PHOTO_MAX_LENGTH)).toBe(true);
    expect(isStorablePhoto(`data:image/heic;base64,${'A'.repeat(1000)}`, CHAT_PHOTO_MAX_LENGTH)).toBe(false);
    expect(isStorablePhoto(`data:image/png;base64,${'A'.repeat(CHAT_PHOTO_MAX_LENGTH)}`, CHAT_PHOTO_MAX_LENGTH)).toBe(false);
    expect(isStorablePhoto('https://example.com/a.jpg', CHAT_PHOTO_MAX_LENGTH)).toBe(false);
  });
});
