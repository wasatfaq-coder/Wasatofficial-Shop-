// Что делать, когда кусок сайта (раздел админки, экран) не загрузился: повторить, обновить страницу один раз или показать ошибку
import { describe, expect, test } from 'bun:test';
import { CHUNK_RELOAD_WINDOW_MS, decideChunkFailure, importWithRetry } from '../../src/utils/lazyWithRetry';

const stale = 'TypeError: Failed to fetch dynamically imported module: https://x/src/components/admin/AdminStorefrontTab.tsx';
const now = 1_000_000;

describe('decideChunkFailure', () => {
  test('первая ошибка загрузки куска — повторить', () => {
    expect(decideChunkFailure({ message: stale, attempt: 0, lastReloadAt: null, now })).toBe('retry');
  });
  test('после повтора и без недавней перезагрузки — обновить страницу', () => {
    expect(decideChunkFailure({ message: stale, attempt: 1, lastReloadAt: null, now })).toBe('reload');
    expect(decideChunkFailure({ message: stale, attempt: 1, lastReloadAt: now - CHUNK_RELOAD_WINDOW_MS, now })).toBe('reload');
  });
  test('перезагрузка была меньше 30 с назад — показать ошибку, а не крутить цикл', () => {
    expect(decideChunkFailure({ message: stale, attempt: 1, lastReloadAt: now - 5_000, now })).toBe('rethrow');
  });
  test('чужая ошибка (не загрузка куска) не повторяется и страницу не перезагружает', () => {
    const other = "TypeError: Cannot read properties of null (reading 'useRef')";
    expect(decideChunkFailure({ message: other, attempt: 0, lastReloadAt: null, now })).toBe('rethrow');
    expect(decideChunkFailure({ message: other, attempt: 1, lastReloadAt: null, now })).toBe('rethrow');
  });
  test('другие тексты браузеров о том же', () => {
    for (const message of ['error loading dynamically imported module', 'Importing a module script failed.', 'Unable to preload CSS for /assets/a.css']) {
      expect(decideChunkFailure({ message, attempt: 0, lastReloadAt: null, now })).toBe('retry');
    }
  });
});

describe('importWithRetry', () => {
  test('успех с первого раза', async () => {
    expect(await importWithRetry(async () => 7)).toBe(7);
  });
  test('чужая ошибка уходит сразу, без повтора', async () => {
    let calls = 0;
    await expect(
      importWithRetry(async () => {
        calls++;
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
    expect(calls).toBe(1);
  });
  test('сбой загрузки куска один раз, потом успех', async () => {
    let calls = 0;
    const value = await importWithRetry(async () => {
      calls++;
      if (calls === 1) throw new TypeError(stale);
      return 'ok';
    });
    expect(value).toBe('ok');
    expect(calls).toBe(2);
  });
});
