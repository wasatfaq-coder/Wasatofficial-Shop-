// Покупатель пишет в чат поддержки — владелец видит диалог «Ждёт ответа» и отвечает — покупатель видит ответ, пока чат
// открыт (аудит 07.10, находка 45: счётчик «ждут ответа» и ответ сотрудника не были проверены в браузере)
import { test, expect, signInOn } from '../fixtures';
import { queryDocs } from '../emulator';
import { ADMIN } from '../store';

test('покупатель пишет в чат, владелец отвечает, покупатель видит ответ', async ({ page, secondPage, signIn }, info) => {
  // phone and desktop run at the same time: each its own buyer and dialog
  const buyer = { sub: `chat-${info.project.name}`, email: `nina-${info.project.name}@example.ru`, name: `Нина Вопрос ${info.project.name}` };
  const question = `Есть ли рубашка в размере XL? (${info.project.name})`;
  const answer = `Да, XL будет в четверг (${info.project.name})`;

  await page.goto('/profile');
  await signIn(buyer);
  await expect(page.getByRole('heading', { name: buyer.name })).toBeVisible();
  // «Служба поддержки» in the profile opens the chat itself
  await page.getByRole('button', { name: /^Служба поддержки/ }).click();
  const chat = page.getByRole('dialog', { name: 'Служба заботы' });
  await page.getByRole('textbox', { name: 'Сообщение в службу заботы' }).fill(question);
  await page.getByRole('button', { name: 'Отправить сообщение' }).click();
  await expect(chat.getByText(question)).toBeVisible();
  await expect.poll(async () => (await queryDocs('chat_messages', 'text', question)).length).toBe(1);

  // the owner, in their own browser, at the same time
  const owner = secondPage;
  await owner.goto('/profile');
  await signInOn(owner, ADMIN);
  await owner.getByRole('button', { name: /^Панель администратора/ }).click();
  const panel = owner.getByRole('dialog', { name: 'Панель администратора' });
  await panel.getByRole('tab', { name: 'Продажи', exact: true }).click();
  await panel.getByRole('tab', { name: /^Чат поддержки/ }).click();
  await panel.getByRole('textbox', { name: 'Поиск диалога' }).fill(buyer.name);
  const thread = panel.getByRole('button', { name: new RegExp(buyer.name) });
  await expect(thread).toContainText('Ждет ответа');
  await thread.click();
  // the question in the dialog itself (the list shows it too, as the last message)
  await expect(panel.getByRole('paragraph').filter({ hasText: question })).toBeVisible();
  await panel.getByRole('textbox', { name: 'Текст ответа' }).fill(answer);
  await panel.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect.poll(async () => (await queryDocs('chat_messages', 'text', answer)).map((m) => [m.sender, m.isInternalNote])).toEqual([['admin', false]]);
  // answered: the dialog no longer waits for a reply
  await expect(thread).not.toContainText('Ждет ответа');

  // the buyer's open chat shows the answer without reloading
  await expect(chat.getByText(answer)).toBeVisible();
});
