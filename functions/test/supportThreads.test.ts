// Диалоги чата поддержки в админке и счётчик «ждут ответа» (аудит 07.10, находка 45): summarizeSupportThreads
// (src/utils/supportThreads.ts) считает и список диалогов «Чата поддержки», и счётчики AdminNav.
import { describe, expect, mock, test } from 'bun:test';
import type { ChatMessage, Order } from '../../src/types';

// supportThreads.ts берёт порядок сообщений из firebaseSync.ts, а тот — базу из src/firebase.ts. Настоящий firebase.ts
// запустил бы приложение Firebase с настройками боевого проекта: в тесте вместо него — заглушка без базы
mock.module('../../src/firebase', () => ({
  db: null,
  auth: null,
  OperationType: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete', LIST: 'list', GET: 'get', WRITE: 'write' },
  handleFirestoreError: (error: unknown) => {
    throw error;
  },
}));
const { LEGACY_THREAD_KEY, summarizeSupportThreads } = await import('../../src/utils/supportThreads');

const msg = (id: string, sentAt: number, over: Partial<ChatMessage> = {}): ChatMessage =>
  ({ id, sender: 'user', text: `Текст ${id}`, timestamp: '12:00', threadId: 'alice', isInternalNote: false, sentAt, ...over }) as ChatMessage;

const orderOf = (customerUid: string, customerName: string) => ({ id: `WS-${customerUid}`, customerUid, customerName }) as Order;

describe('summarizeSupportThreads', () => {
  test('сообщения группируются по покупателю; свежий диалог — первым', () => {
    const threads = summarizeSupportThreads(
      [msg('a1', 100), msg('b1', 300, { threadId: 'bob' }), msg('a2', 200, { sender: 'admin' })],
      []
    );
    expect(threads.map((t) => [t.key, t.count, t.lastOrder])).toEqual([
      ['bob', 1, 300],
      ['alice', 2, 200],
    ]);
  });

  test('«ждёт ответа» — пока последнее видимое покупателю сообщение его; ответ сотрудника снимает', () => {
    const waiting = summarizeSupportThreads([msg('a1', 100), msg('a2', 200, { sender: 'admin' }), msg('a3', 300)], []);
    expect(waiting[0]).toMatchObject({ awaitingReply: true, lastText: 'Текст a3' });
    const answered = summarizeSupportThreads([msg('a1', 100), msg('a2', 200, { sender: 'admin' })], []);
    expect(answered[0].awaitingReply).toBe(false);
  });

  test('внутренняя заметка — не ответ: покупатель всё ещё ждёт, а последним текстом видна «Заметка: …»', () => {
    const [thread] = summarizeSupportThreads(
      [msg('a1', 100), msg('n1', 200, { sender: 'admin', isInternalNote: true, text: 'перезвонить' })],
      []
    );
    expect(thread).toMatchObject({ awaitingReply: true, lastText: 'Заметка: перезвонить', count: 2 });
  });

  test('сообщение, удалённое сотрудником у себя, не становится последним', () => {
    const [thread] = summarizeSupportThreads(
      [msg('a1', 100), msg('a2', 200, { sender: 'admin', text: 'Ответ' }), msg('a3', 300, { hiddenForStaff: true })],
      []
    );
    expect(thread).toMatchObject({ lastText: 'Ответ', lastOrder: 200, awaitingReply: false, count: 3 });
  });

  test('фото без текста — «Фото», вложение — «Вложение»', () => {
    expect(summarizeSupportThreads([msg('a1', 100, { text: '', imageId: 'a1' })], [])[0].lastText).toBe('Фото');
    expect(summarizeSupportThreads([msg('a1', 100, { text: '', imageUrl: 'data:image/png;base64,AA' })], [])[0].lastText).toBe('Фото');
    expect(summarizeSupportThreads([msg('a1', 100, { text: '' })], [])[0].lastText).toBe('Вложение');
  });

  test('имя диалога — из сообщения, иначе из заказа покупателя, иначе «Покупатель»', () => {
    const orders = [orderOf('alice', 'Алиса Петрова')];
    expect(summarizeSupportThreads([msg('a1', 100)], orders)[0].name).toBe('Алиса Петрова');
    expect(summarizeSupportThreads([msg('a1', 100, { threadName: 'Алиса' })], orders)[0].name).toBe('Алиса');
    expect(summarizeSupportThreads([msg('c1', 100, { threadId: 'carol' })], orders)[0].name).toBe('Покупатель');
  });

  test('сообщения без threadId — общий чат до разделения', () => {
    const [thread] = summarizeSupportThreads([msg('old', 100, { threadId: undefined })], []);
    expect(thread).toMatchObject({ key: LEGACY_THREAD_KEY, threadId: null, name: 'Общий чат (до разделения)' });
  });

  test('ещё не сохранённое сообщение (без sentAt) упорядочено по времени в id', () => {
    const [thread] = summarizeSupportThreads(
      [msg('a1', 1_791_000_000_000, { sender: 'admin' }), msg('msg-1791000000500-x1', undefined as unknown as number)],
      []
    );
    expect(thread).toMatchObject({ lastOrder: 1_791_000_000_500, awaitingReply: true });
  });

  test('нет сообщений — нет диалогов', () => {
    expect(summarizeSupportThreads([], [orderOf('alice', 'Алиса')])).toEqual([]);
  });
});
