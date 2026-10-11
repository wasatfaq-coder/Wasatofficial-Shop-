// Покупатель пишет в чат поддержки — владелец видит диалог «Ждёт ответа» и отвечает — покупатель видит ответ, пока чат
// открыт (аудит 07.10, находка 45: счётчик «ждут ответа» и ответ сотрудника не были проверены в браузере)
import { test, expect, signInOn, openAdminSection } from '../fixtures';
import { queryDocs, readDoc } from '../emulator';
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
  await openAdminSection(panel, /^Чат/);
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

  // status, priority and «Очистить» wait under one «Диалог» button (admin audit 09.10, stage 7)
  await expect(panel.getByRole('radiogroup', { name: 'Приоритет' })).toBeHidden();
  const dialogButton = panel.getByRole('button', { name: /^Диалог/ });
  await dialogButton.click();
  await panel.getByRole('radiogroup', { name: 'Приоритет' }).getByRole('radio', { name: 'Срочно' }).click();
  await expect(dialogButton).toContainText('Срочно');
  await expect(panel.getByRole('button', { name: 'Очистить переписку' })).toBeVisible();

  // reply templates live in the database, one list for the phone and the computer; the list is one document,
  // so only the desktop writes it (phone and desktop run at the same time on one database)
  if (info.project.name === 'desktop') {
    await panel.getByRole('button', { name: /^Шаблоны/ }).click();
    const templates = owner.getByRole('dialog', { name: 'Шаблоны ответов' });
    await templates.getByRole('textbox', { name: 'Название шаблона' }).fill('Срок пошива');
    await templates.getByRole('textbox', { name: 'Текст шаблона' }).fill('Пошив занимает 5 дней.');
    await templates.getByRole('button', { name: 'Добавить' }).click();
    await expect(templates.getByRole('button', { name: 'Изменить шаблон «Срок пошива»' })).toBeVisible();
    await expect
      .poll(async () => ((await readDoc('settings/chat_templates'))?.items as { title: string }[] | undefined)?.map((t) => t.title))
      .toEqual(['Срок пошива']);
  }
});
