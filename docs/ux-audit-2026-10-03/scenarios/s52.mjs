// Аудит UX 03.10, сценарий В: администратор добавляет товар с фото и печатает этикетки
import fs from 'node:fs';
import { start } from './lib.mjs';
const W = Number(process.argv[2] || 390);
const t = await start('s52', W);
const { p, note, shot, step, scan, fresh, toasts, axe } = t;
const check = async (name) => { await shot(name); await scan(name); await axe(name); };
const panel = () => p.locator('[role=dialog]').first();
const top = () => p.locator('[role=dialog]').last();
const tab = async (group, name) => {
  await panel().getByRole('tab', { name: new RegExp('^' + group) }).first().click();
  await p.waitForTimeout(500);
  await panel().getByRole('tab', { name }).first().click();
  await p.waitForTimeout(2500);
};

await step('panel', async () => {
  await fresh('#/profile');
  await t.signIn();
  await p.getByRole('button', { name: /Панель администратора/ }).first().click();
  await p.waitForTimeout(2500);
  await check('panel');
  await tab('Каталог', /^Товары/);
  await check('products');
});

await step('form-empty-submit', async () => {
  await p.getByRole('button', { name: /Добавить товар/ }).first().click();
  await p.waitForTimeout(1500);
  await check('form');
  await shot('form-full', true);
  note('  category preselected: ' + (await top().locator('[aria-label*="Категория"], #product-form-category').first().textContent().catch(() => '?')));
  await top().getByRole('button', { name: /Создать товар/ }).click();
  await p.waitForTimeout(800);
  note('  errors: ' + (await p.evaluate(() => [...document.querySelectorAll('form [role=alert]')].map((a) => a.innerText.replace(/\s+/g, ' ')).join(' | '))));
  note('  focus: ' + (await p.evaluate(() => `${document.activeElement?.tagName}#${document.activeElement?.id}`)));
  await shot('form-errors');
});

await step('form-fill-create', async () => {
  const b64 = await p.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 1200; c.height = 1600; const x = c.getContext('2d');
    for (let i = 0; i < 3000; i++) { x.fillStyle = `hsl(${i % 360},40%,${30 + (i % 50)}%)`; x.fillRect(Math.random() * 1200, Math.random() * 1600, 40, 40); }
    return c.toDataURL('image/jpeg', 0.9).split(',')[1];
  });
  fs.writeFileSync(t.OUT + '/photo.jpg', Buffer.from(b64, 'base64'));
  await p.fill('#product-form-title', 'Рубашка оксфорд');
  await top().locator('input[placeholder="напр. 2 990"]').fill('3490');
  await top().getByLabel('Название нового цвета').fill('Голубой');
  await top().getByLabel('Название нового цвета').press('Enter');
  await top().getByRole('button', { name: 'M', exact: true }).click();
  await top().getByRole('button', { name: 'L', exact: true }).click();
  await top().locator('input[type=file]').first().setInputFiles(t.OUT + '/photo.jpg');
  await p.waitForTimeout(3000);
  note('  toasts while filling: ' + (await toasts()));
  await shot('form-filled');
  await shot('form-filled-full', true);
  await top().getByRole('button', { name: /Создать товар/ }).click();
  await p.waitForTimeout(3500);
  note('  created: ' + (await toasts()) + '; dialogs: ' + (await p.locator('[role=dialog]').count()));
});

await step('labels', async () => {
  await tab('Каталог', /Склад/);
  await p.getByPlaceholder('Название, артикул, штрихкод или цвет').fill('оксфорд');
  await p.waitForTimeout(1200);
  await check('inventory');
  const boxes = p.getByRole('checkbox', { name: /Выбрать|Рубашка оксфорд/ });
  note('  checkboxes: ' + (await boxes.count()));
  await boxes.first().click();
  await p.waitForTimeout(400);
  await p.getByRole('button', { name: /^Этикетки/ }).first().click();
  await p.waitForTimeout(1500);
  await check('labels');
  await shot('labels-full', true);
  const preset = top().getByRole('button', { name: /58\s*×\s*40|58×40|58 × 40/ }).first();
  if (await preset.count()) {
    await preset.click();
    await p.waitForTimeout(1500);
  } else note('  presets: ' + (await top().getByRole('button').allTextContents()).map((s) => s.trim()).filter(Boolean).slice(0, 20).join(' | '));
  await shot('labels-format');
  const download = p.waitForEvent('download', { timeout: 20000 }).catch(() => null);
  await top().getByRole('button', { name: /Скачать PDF/ }).click();
  const file = await download;
  note('  pdf: ' + (file ? file.suggestedFilename() : 'no download') + '; toasts: ' + (await toasts()));
  await shot('labels-done');
});

await t.finish();
