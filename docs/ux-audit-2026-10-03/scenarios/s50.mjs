// Аудит UX 03.10, сценарий А: найти рубашку по размеру и цене и оформить с курьером (гость)
import { start } from './lib.mjs';
const W = Number(process.argv[2] || 390);
const t = await start('s50', W);
const { p, note, shot, step, scan, fresh, toasts, axe, go } = t;
const check = async (name) => { await shot(name); await scan(name); await axe(name); };
const focused = () => p.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName.toLowerCase()}#${a.id} «${(a.getAttribute('aria-label') || a.textContent || '').trim().slice(0, 30)}» invalid=${a.getAttribute('aria-invalid')}` : 'none'; });

await step('home', async () => {
  await fresh('');
  await check('home');
  await shot('home-full', true);
});

await step('catalog-filter', async () => {
  await go('#/catalog');
  await p.waitForTimeout(1200);
  await p.getByRole('button', { name: 'Рубашка', exact: true }).first().click().catch(() => note('  no «Рубашка» chip'));
  await p.waitForTimeout(600);
  note('  after category chip: ' + (await p.locator('main a[href^="#/product/"]').allTextContents()).join(', '));
  const filterBtn = p.getByRole('button', { name: 'Фильтры' });
  const sheet = (await filterBtn.count()) && (await filterBtn.isVisible());
  if (sheet) {
    await filterBtn.click();
    await p.waitForTimeout(800);
  }
  const scope = sheet ? p.locator('[role=dialog]').last() : p.locator('aside').first();
  await scope.getByRole('button', { name: /^M \d/ }).first().click();
  await scope.getByRole('button', { name: /^До 3 000/ }).first().click();
  await p.waitForTimeout(500);
  note('  chosen chips state: ' + (await scope.evaluate((el) => [...el.querySelectorAll('button')].filter((b) => /^(M|До 3)/.test(b.textContent.trim())).map((b) => `${b.textContent.trim().replace(/\s+/g, ' ')} pressed=${b.getAttribute('aria-pressed')} checked=${b.getAttribute('aria-checked')} role=${b.getAttribute('role')}`).join(' | '))));
  await check('filter');
  if (sheet) {
    const show = scope.getByRole('button', { name: /^Показать/ });
    note('  apply button: ' + (await show.textContent()));
    await show.click();
    await p.waitForTimeout(800);
  }
  note('  results: ' + (await p.locator('main a[href^="#/product/"]').allTextContents()).join(', '));
  await check('catalog-results');
});

await step('product', async () => {
  await p.locator('main a[href="#/product/linen-shirt-01"]').first().click();
  await p.waitForTimeout(1500);
  note('  preselected size radios: ' + (await p.locator('main [role=radio][aria-checked=true]').allTextContents()).join(', '));
  await check('product');
  await p.getByRole('button', { name: /В корзину|Выберите размер/ }).last().click();
  await p.waitForTimeout(600);
  note('  without size → focus ' + (await focused()) + '; toasts: ' + (await toasts()));
  await p.getByRole('radio', { name: /^M\b/ }).first().click();
  await p.getByRole('button', { name: /В корзину/ }).last().click();
  await p.waitForTimeout(800);
  note('  added → toasts: ' + (await toasts()));
  await shot('product-added');
});

await step('cart', async () => {
  await go('#/cart');
  await p.waitForTimeout(1200);
  await check('cart');
});

await step('checkout-empty-submit', async () => {
  await p.getByRole('button', { name: /Оформить заказ/ }).first().click();
  await p.waitForTimeout(1500);
  await check('checkout');
  await shot('checkout-full', true);
  await p.locator('#checkout-confirm').click();
  await p.waitForTimeout(800);
  note('  empty submit → focus ' + (await focused()) + '; invalid: ' + (await p.evaluate(() => [...document.querySelectorAll('[aria-invalid="true"]')].map((e) => e.id).join(','))));
  await shot('checkout-errors');
});

await step('checkout-fill', async () => {
  await p.fill('#checkout-last-name', 'Покупателев');
  await p.fill('#checkout-first-name', 'Пётр');
  await p.fill('#checkout-middle-name', 'Ильич');
  await p.fill('#checkout-phone', '+79991234567');
  await p.fill('#checkout-email', 'petr@example.ru');
  await p.getByRole('radio', { name: /^Курьером до двери/ }).click();
  await p.waitForTimeout(400);
  await p.getByRole('button', { name: /Редактировать адрес|Указать адрес|Добавить адрес/ }).first().click();
  await p.waitForTimeout(800);
  await check('address-modal');
  for (const [id, v] of [['address-city', 'Москва'], ['address-street', 'Тверская'], ['address-house', '7'], ['address-entrance', '2'], ['address-intercom', '12'], ['address-apartment', '12']]) {
    if (await p.locator('#' + id).count()) await p.fill('#' + id, v);
    else note('  no field #' + id);
  }
  await p.locator('[role=dialog]').last().getByRole('button', { name: /Сохранить|Готово|Применить/ }).last().click();
  await p.waitForTimeout(800);
  await p.getByRole('radio', { name: /^Перевод по номеру/ }).click();
  await p.waitForTimeout(300);
  await shot('checkout-filled');
  await shot('checkout-filled-full', true);
  note('  steps: ' + (await p.evaluate(() => [...document.querySelectorAll('main button')].map((b) => b.getAttribute('aria-label') || '').filter((l) => /шаг|заполнено/.test(l)).join(' | '))));
});

await step('submit', async () => {
  await p.locator('#checkout-confirm').click();
  await p.waitForTimeout(4500);
  note('  url ' + p.url().split('#')[1] + '; toasts: ' + (await toasts()));
  await check('success');
  await shot('success-full', true);
  note('  success text: ' + (await p.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 700));
});

await t.finish();
