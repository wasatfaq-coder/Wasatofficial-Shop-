// «Витрина» разделами (этап 6 плана docs/admin-wholesale-plan.md): вкладки разделов, слоган применяется одной кнопкой
// «Применить», а приём заказов проверяется без записи — документ «Витрины» общий для телефона и компьютера, и выключенный
// приём уронил бы чужие сценарии заказа
import { test, expect, openAdminSection } from '../fixtures';
import { ADMIN } from '../store';
import { readDoc } from '../emulator';

test('«Витрина»: разделы, слоган применяется, приём заказов выключается и включается без записи', async ({ page, signIn }, info) => {
  await page.goto('/profile');
  await signIn(ADMIN);
  await page.getByRole('button', { name: /^Панель администратора/ }).click();
  const panel = page.getByRole('dialog', { name: 'Панель администратора' });
  await openAdminSection(panel, 'Витрина');

  // the sections; «Приём заказов» is open first
  const sections = panel.getByRole('tablist', { name: 'Разделы витрины' });
  for (const name of ['Приём заказов', 'Контакты и график', 'Реквизиты', 'Тексты о бренде', 'Резервная копия']) {
    await expect(sections.getByRole('tab', { name })).toBeVisible();
  }
  await expect(sections.getByRole('tab', { name: 'Приём заказов' })).toHaveAttribute('aria-selected', 'true');
  await expect(panel.getByText('Порог бесплатной доставки и экспресс — в разделе «Доставка и ПВЗ»')).toBeVisible();

  // accepting orders: the switch shows the stop, and switching back leaves nothing to apply (nothing is written)
  const accepting = panel.getByRole('switch', { name: 'Принимать заказы на сайте' });
  await expect(accepting).toBeChecked();
  await accepting.click();
  await expect(accepting).not.toBeChecked();
  await expect(panel.getByText(/Приём заказов остановлен: оформление/)).toBeVisible();
  await expect(panel.getByText('Есть несохранённые изменения')).toBeVisible();
  await accepting.click();
  await expect(accepting).toBeChecked();
  await expect(panel.getByText(/Приём заказов остановлен: оформление/)).toBeHidden();
  await expect(panel.getByText('Есть несохранённые изменения')).toBeHidden();

  // the slogan: one «Применить», «Сохранено» only after the database answered
  await sections.getByRole('tab', { name: 'Контакты и график' }).click();
  await expect(sections.getByRole('tab', { name: 'Контакты и график' })).toHaveAttribute('aria-selected', 'true');
  const slogan = `Проверка витрины ${info.project.name}`;
  await panel.getByLabel('Слоган', { exact: true }).fill(slogan);
  await expect(panel.getByText('Есть несохранённые изменения')).toBeVisible();
  await panel.getByRole('button', { name: 'Применить', exact: true }).click();
  await expect(panel.getByText('Сохранено', { exact: true })).toBeVisible();
  await expect(panel.getByLabel('Слоган', { exact: true })).toHaveValue(slogan);

  // the phone and the computer write the same document: any run's slogan is fine; what the form does not own stays
  await expect.poll(async () => String((await readDoc('settings/storefront'))?.storeSlogan ?? '')).toMatch(/^Проверка витрины /);
  const stored = await readDoc('settings/storefront');
  expect(stored?.isStoreOnline).toBe(true);
  expect(stored?.categories).toBeTruthy();
  expect(stored?.paymentMethods).toBeTruthy();
});
