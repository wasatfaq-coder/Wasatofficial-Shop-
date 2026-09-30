// Admin: guest thread context, order status change, refill-all
import { start, BASE } from './lib.mjs';
const W = Number(process.argv[2] || 390);
const t = await start(process.env.TAG || 's3b', W);
const { p, note, shot, step, toasts } = t;
await t.fresh('#/profile');
await t.signIn();
const panel = () => p.getByRole('dialog', { name: /Панель администратора/ });
await p.goto(BASE + '#/profile'); await p.waitForTimeout(2000);
await p.locator('#admin-panel-trigger-btn').click(); await p.waitForTimeout(2000);
const group = async (g, sec) => {
  await panel().getByRole('tablist', { name: 'Разделы панели' }).getByRole('tab').filter({ hasText: g }).click(); await p.waitForTimeout(1000);
  if (sec) { await panel().getByRole('tab').filter({ hasText: sec }).first().click(); await p.waitForTimeout(1800); }
};
await step('guest thread', async () => {
  await group('Продажи', 'Чат поддержки');
  const row = panel().getByRole('button').filter({ hasText: /^Гость/ }).first();
  note('  guest rows: ' + (await row.count()));
  await row.click(); await p.waitForTimeout(1800);
  await shot('guest-thread');
  const txt = (await panel().innerText()).replace(/\s+/g, ' ');
  const i = txt.indexOf('Решенные'); note('  guest thread view: ' + txt.slice(i, i + 700));
});
await step('order status', async () => {
  await group('Продажи', 'Заказы');
  const cands = await panel().evaluate((d) => [...d.querySelectorAll('*')].filter((e) => e.textContent.trim() === 'Принят' && e.children.length <= 3).slice(0, 6).map((e) => `${e.tagName} role=${e.getAttribute('role')} aria=${e.getAttribute('aria-label')} haspopup=${e.getAttribute('aria-haspopup')}`));
  note('  cands: ' + JSON.stringify(cands));
  const target = panel().locator('button', { hasText: /^\s*Принят\s*$/ }).first();
  await target.click(); await p.waitForTimeout(700);
  note('  options: ' + JSON.stringify(await p.getByRole('option').allTextContents()));
  await shot('status-menu');
  const opt = p.getByRole('option', { name: /Сборк|Собира/ }); if (await opt.count()) await opt.first().click(); else { note('  menu: ' + JSON.stringify((await t.visibleButtons()).slice(-15))); await p.getByRole('button', { name: 'Собирается', exact: true }).locator('visible=true').first().click(); } await p.waitForTimeout(2000);
  note('  toasts: ' + (await toasts()));
  await shot('status-changed');
  note('  first card: ' + (await panel().innerText()).replace(/\s+/g, ' ').match(/№ WS-\S+ от[^]*?Сумма к оплате[^₽]*₽/)?.[0]);
});
if (process.env.REFILL) await step('refill all', async () => {
  await group('Каталог', 'Склад');
  const b = panel().getByRole('button', { name: /Пополнить все/ });
  const before = (await panel().innerText()).match(/НЕТ В НАЛИЧИИ\s*\d+/)?.[0];
  await b.click(); await p.waitForTimeout(1500);
  const dlg = await p.getByRole('dialog').count();
  const after = (await panel().innerText()).match(/НЕТ В НАЛИЧИИ\s*\d+/)?.[0];
  note(`  dialogs after click: ${dlg} (panel only = 1); before: ${before}; after: ${after}; toasts: ${await toasts()}`);
  await shot('refill-after');
});
await t.finish();
