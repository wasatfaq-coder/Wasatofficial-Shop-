// Заказ в 1 клик со страницы товара: нужны только имя и телефон, адрес и оплату менеджер уточнит по телефону
import { test, expect, chooseSize } from '../fixtures';
import { queryDocs } from '../emulator';
import { PRODUCTS } from '../store';

test('заказ в 1 клик со страницы товара', async ({ page }, info) => {
  const name = `Быстрый ${info.project.name}`;
  const polo = PRODUCTS.polo;

  await page.goto(`/product/${polo.id}`);
  await chooseSize(page, /^L\b/);
  await page.getByRole('button', { name: 'Заказать в 1 клик' }).first().click();

  const form = page.getByRole('dialog', { name: 'Заказ в 1 клик' });
  await expect(form.getByText(polo.title)).toBeVisible();
  const confirm = form.getByRole('button', { name: 'Подтвердить быстрый заказ' });
  await expect(confirm).toBeDisabled();

  await form.getByRole('textbox', { name: /^Ваше имя/ }).fill(name);
  await form.getByRole('textbox', { name: /^Номер телефона/ }).fill('+79990001122');
  await confirm.click();

  await expect(page).toHaveURL(/\/order-success$/);
  await expect(page.getByRole('heading', { name: /^Заказ № WS-\d+$/ })).toBeVisible();

  const [order] = await queryDocs('orders', 'customerName', name);
  expect(order).toMatchObject({ totalPrice: polo.price });
  expect(order.items).toEqual([expect.objectContaining({ selectedSize: 'L', quantity: 1 })]);
});
