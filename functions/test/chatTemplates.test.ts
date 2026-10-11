// Admin audit 09.10, stage 7, finding 4: chat reply templates move from the browser into the database
import { describe, expect, test } from 'bun:test';
import { MAX_CHAT_TEMPLATES, mergeChatTemplates, normalizeChatTemplates } from '../../src/utils/chatTemplates';

const tpl = (id: string, title = 'Срок', text = 'Отправим завтра.') => ({ id, category: 'delivery' as const, categoryLabel: 'Доставка', title, text });

describe('chat reply templates', () => {
  test('only items with an id, a title and a text are read; an unknown section becomes «general»', () => {
    const items = normalizeChatTemplates([
      tpl('a'),
      { id: 'b', title: '  ', text: 'x' },
      { id: 'c', title: 'Размер', text: 'Смотрите сетку.', category: 'colors' },
      'мусор',
      tpl('a', 'Повтор'),
    ]);
    expect(items.map((t) => t.id)).toEqual(['a', 'c']);
    expect(items[1].category).toBe('general');
    expect(normalizeChatTemplates({ items: [] })).toEqual([]);
  });

  test('the browser copy adds only what the database list lacks, the database list goes first', () => {
    const merged = mergeChatTemplates([tpl('a', 'Из базы')], [tpl('a', 'Из браузера'), tpl('b')]);
    expect(merged.map((t) => [t.id, t.title])).toEqual([['a', 'Из базы'], ['b', 'Срок']]);
  });

  test('nothing is cut: a long text or a long browser list is kept whole', () => {
    const long = 'Условия возврата. '.repeat(200);
    expect(normalizeChatTemplates([tpl('a', 'Возврат', long)])[0].text).toBe(long.trim());
    const many = Array.from({ length: MAX_CHAT_TEMPLATES + 5 }, (_, i) => tpl(`t${i}`));
    expect(mergeChatTemplates([], normalizeChatTemplates(many))).toHaveLength(MAX_CHAT_TEMPLATES + 5);
  });
});
