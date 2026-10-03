// «Назад» closes the top window and keeps the screen (stage 2, finding 2): node back-button.mjs 390|1280
import { start } from './lib.mjs';
const t = await start('back-button', Number(process.argv[2] || 390));
const { p, note, fresh, shot, step, phone } = t;
const state = () => p.evaluate(() => ({ hash: location.hash || '#/', dialogs: document.querySelectorAll('[role=dialog], [role=alertdialog]').length, y: Math.round(scrollY) }));
const show = async (what) => { const s = await state(); note(`  ${what}: ${s.hash}, dialogs ${s.dialogs}, scroll ${s.y}`); return s; };
const back = async () => { await p.goBack().catch(() => {}); await p.waitForTimeout(1000); };
const check = (ok, text) => note(`  ${ok ? 'OK' : '!! FAIL'} ${text}`);
const visible = (loc) => loc.filter({ visible: true }).first();
// A tap where the button is: Playwright's click would first scroll it into view and change the scroll under test
const tap = async (loc) => { await loc.evaluate((el) => el.click()); await p.waitForTimeout(900); };
const openMenuItem = async (name) => {
  await tap(visible(p.getByRole('button', { name: 'Открыть меню' })));
  await tap(p.getByRole('dialog').getByRole('button', { name }).first());
};

await fresh('');
let homeY = 0;
await step('home: menu → chat (one window replaces another)', async () => {
  await p.evaluate(() => window.scrollTo(0, 600));
  await p.waitForTimeout(400);
  await openMenuItem('Поддержка');
  const open = await show('chat open');
  await shot('chat-open');
  await back();
  const s = await show('after Back');
  check(s.hash === '#/' && s.dialogs === 0 && Math.abs(s.y - open.y) < 40, 'Back closed the chat, home and its scroll stay');
  homeY = s.y;
});

await step('home → catalog', async () => {
  await tap(visible(p.getByRole('button', { name: /^Каталог/ })));
  await show('catalog');
});

await step('filter sheet', async () => {
  await p.evaluate(() => window.scrollTo(0, 150));
  // On a computer the catalog has its filter on the left; the sheet opens from the menu
  if (phone) await tap(p.getByRole('button', { name: 'Фильтры', exact: true }));
  else await openMenuItem('Фильтры товаров');
  const open = await show('filter open');
  await back();
  const s = await show('after Back');
  check(open.dialogs === 1 && s.hash === '#/catalog' && s.dialogs === 0 && Math.abs(s.y - open.y) < 40, 'Back closed the filter sheet, catalog and its scroll stay');
  await shot('filter-after-back');
});

await step('quick view', async () => {
  await p.evaluate(() => window.scrollBy(0, 300));
  await p.waitForTimeout(400);
  await tap(visible(p.getByRole('button', { name: 'Быстрый просмотр' })));
  const open = await show('quick view open');
  await back();
  const s = await show('after Back');
  check(s.hash === '#/catalog' && s.dialogs === 0 && Math.abs(s.y - open.y) < 40, 'Back closed quick view, catalog and its scroll stay');
});

await step('closed with × and Escape leave no extra entry', async () => {
  await tap(visible(p.getByRole('button', { name: 'Быстрый просмотр' })));
  await tap(p.getByRole('dialog').getByRole('button', { name: 'Закрыть' }).first());
  await tap(visible(p.getByRole('button', { name: 'Быстрый просмотр' })));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(1000);
  await show('closed');
  await back();
  const s = await show('after Back');
  check(s.hash === '#/' && s.dialogs === 0 && Math.abs(s.y - homeY) < 40, 'Back returned to the home screen with its scroll');
  await p.goForward().catch(() => {});
  await p.waitForTimeout(1000);
  const f = await show('after Forward');
  check(f.hash === '#/catalog' && f.dialogs === 0, 'Forward returned to the catalog');
});

await step('window closes as the screen changes', async () => {
  await tap(visible(p.getByRole('button', { name: 'Быстрый просмотр' })));
  await tap(p.getByRole('dialog').getByRole('button', { name: 'Перейти к подробному описанию' }));
  await show('product page');
  await back();
  const s = await show('after Back');
  check(s.hash === '#/catalog' && s.dialogs === 0, 'one Back from the product returns to the catalog');
  await back();
  const h = await show('after second Back');
  check(h.hash === '#/' && Math.abs(h.y - homeY) < 40, 'next Back returns home with its scroll');
});

await step('variant picker from «+» on a card', async () => {
  await back();
  await tap(visible(p.getByRole('button', { name: 'Каталог', exact: false }).filter({ hasNotText: 'Фильтры' })));
  await tap(visible(p.getByRole('button', { name: /^Выбрать размер:/ })));
  await show('picker open');
  await back();
  const s = await show('after Back');
  check(s.hash === '#/catalog' && s.dialogs === 0, 'Back closed the variant picker');
});

await step('window over a window: quick view → size calculator', async () => {
  await tap(visible(p.getByRole('button', { name: 'Быстрый просмотр' })));
  await tap(p.getByRole('dialog').getByRole('button', { name: /Подобрать размер/ }));
  await show('two windows');
  await back();
  const s1 = await show('after Back');
  check(s1.dialogs === 1, 'Back closed only the top window');
  await back();
  const s2 = await show('after second Back');
  check(s2.hash === '#/catalog' && s2.dialogs === 0, 'second Back closed quick view, catalog stays');
});

await step('admin: product form with edits asks before closing', async () => {
  await t.signIn();
  await tap(visible(p.getByRole('button', { name: /^Профиль/ })));
  await tap(p.getByRole('button', { name: /Панель администратора/ }).first());
  await p.waitForTimeout(2500);
  await tap(p.getByRole('dialog').getByRole('tab', { name: /^Каталог/ }).filter({ visible: true }).first());
  await tap(p.getByRole('dialog').getByRole('tab', { name: /^Товары/ }).filter({ visible: true }).first());
  await p.waitForTimeout(1500);
  await tap(p.getByRole('button', { name: 'Добавить товар' }).filter({ visible: true }).first());
  await p.locator('#product-form-title').fill('Черновик');
  await show('form with edits');
  await back();
  const s = await show('after Back');
  await shot('admin-form-after-back');
  const asks = await p.getByRole('alertdialog', { name: 'Закрыть без сохранения?' }).count();
  check(asks === 1 && s.dialogs === 3 && s.hash === '#/profile', 'Back asked «Закрыть без сохранения?», profile stays');
  await back();
  const k = await show('after Back on the question');
  check(k.dialogs === 2 && (await p.locator('#product-form-title').inputValue()) === 'Черновик', 'Back on the question returns to the form with the edits');
  await back();
  await tap(p.getByRole('button', { name: 'Не сохранять' }));
  const c = await show('after «Не сохранять»');
  check(c.dialogs === 1, 'the form closed, the panel stays');
  await back();
  const d = await show('after Back');
  check(d.dialogs === 0 && d.hash === '#/profile', 'Back closed the admin panel');
  await back();
  const e = await show('after Back');
  check(e.hash !== '#/profile', 'next Back leaves the profile: no extra entries');
});

await t.finish();
