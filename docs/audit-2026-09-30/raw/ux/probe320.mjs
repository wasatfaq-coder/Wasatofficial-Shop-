import { start, BASE } from './lib.mjs';
const t = await start('probe', 320);
const { p, note, shot } = t;
await t.fresh('#/profile'); await t.signIn();
await p.goto(BASE + '#/profile'); await p.waitForTimeout(2000);
await p.locator('#admin-panel-trigger-btn').click(); await p.waitForTimeout(2000);
const panel = () => p.getByRole('dialog', { name: /Панель администратора/ });
await panel().getByRole('tablist', { name: 'Разделы панели' }).getByRole('tab').filter({ hasText: 'Продажи' }).click(); await p.waitForTimeout(800);
await panel().getByRole('tab').filter({ hasText: 'Заказы' }).first().click(); await p.waitForTimeout(1800);
const trig = panel().locator('button', { hasText: /^\s*Принят\s*$/ }).first();
await trig.scrollIntoViewIfNeeded(); await trig.click(); await p.waitForTimeout(700);
const items = p.getByRole('button', { name: 'Собирается', exact: true });
note('count ' + await items.count());
for (let i = 0; i < await items.count(); i++) {
  const it = items.nth(i);
  const box = await it.boundingBox();
  const hit = box && await p.evaluate(({ x, y }) => { const e = document.elementFromPoint(x, y); return e ? e.tagName + ' ' + (e.textContent || '').trim().slice(0, 30) + ' cls=' + String(e.className).slice(0, 60) : 'none'; }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  note(`item ${i} visible=${await it.isVisible()} box=${JSON.stringify(box)} hit=${hit}`);
}
await shot('menu');
await t.finish();
