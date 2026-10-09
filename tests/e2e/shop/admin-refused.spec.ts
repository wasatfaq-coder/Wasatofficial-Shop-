// «Сохранено» только после ответа базы (docs/admin-wholesale-plan.md, этап 1, находка 3): база отказала в записи —
// админка говорит «Не сохранено» и не делает вид, что всё прошло
import { test, expect } from '../fixtures';
import { deleteDoc, readDoc, writeDocs } from '../emulator';
import { COURIER, PRODUCTS } from '../store';

test('база отказала — админка не пишет «Сохранено», выбор товаров остаётся', async ({ page, phone }) => {
  // an admin by an admins/{uid} document, who loses the rights while the panel is open: the rules refuse every write.
  // Phone and desktop run at the same time, so each has its own account
  const helper = { sub: `e2e-helper-${phone ? 'phone' : 'desktop'}`, email: `helper-${phone ? 'phone' : 'desktop'}@example.com`, name: 'Помощник' };

  await page.goto('/profile');
  await page.waitForFunction(() => 'e2eSignIn' in window);
  const uid = await page.evaluate(
    (u) =>
      (window as unknown as { e2eSignIn: (x: typeof u) => Promise<{ user: { uid: string } }> })
        .e2eSignIn(u)
        .then((c) => c.user.uid),
    helper
  );
  await writeDocs({ [`admins/${uid}`]: { email: helper.email } });
  await page.reload();
  await page.getByRole('button', { name: /^Панель администратора/ }).click();
  const panel = page.getByRole('dialog', { name: 'Панель администратора' });
  await expect(panel).toBeVisible();
  await deleteDoc(`admins/${uid}`);

  // a delivery method switched off: no «отключен», the error instead
  await panel.getByRole('tab', { name: 'Магазин', exact: true }).click();
  await panel.getByRole('tab', { name: 'Доставка и ПВЗ' }).click();
  const courierSwitch = panel.getByRole('switch', { name: `Способ «${COURIER.title}» показан покупателям` });
  await courierSwitch.click();
  await expect(page.getByText(/Не сохранено: способы доставки/)).toBeVisible();
  // the screen goes back to what the database holds
  await expect(courierSwitch).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText(`Способ «${COURIER.title}» отключен`)).toHaveCount(0);
  expect((await readDoc(`delivery_methods/${COURIER.id}`))?.isActive).toBe(true);

  // a product taken off sale in bulk: no «сняты с продажи», and the selection stays for another try
  const item = PRODUCTS.belt;
  await panel.getByRole('tab', { name: 'Каталог', exact: true }).click();
  await panel.getByRole('tab', { name: 'Товары', exact: true }).click();
  await panel.getByRole('textbox', { name: 'Поиск товаров' }).fill(item.title);
  await panel.getByRole('checkbox', { name: `Выбрать товар «${item.title}»` }).click();
  await panel.getByRole('button', { name: 'Снять с продажи', exact: true }).click();
  await expect(page.getByText(/Не сохранено: товары/)).toBeVisible();
  await expect(page.getByText(/сняты с продажи/)).toHaveCount(0);
  await expect(panel.getByRole('checkbox', { name: `Выбрать товар «${item.title}»` })).toBeChecked();
  expect((await readDoc(`products/${item.id}`))?.hiddenFromSale).not.toBe(true);
});
