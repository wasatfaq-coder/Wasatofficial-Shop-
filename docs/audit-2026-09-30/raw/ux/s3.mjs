// Scenario 3: admin — add product with photos, print labels, reply in chat, change order status
import { start, BASE, UX } from './lib.mjs';
import fs from 'node:fs';
const W = Number(process.argv[2] || 390);
const NPHOTO = Number(process.env.NPHOTO || 3);
const ONLY = process.env.ONLY || 'product,labels,chat,orders';
const t = await start(process.env.TAG || 's3', W);
const { p, note, shot, step, toasts, visibleButtons } = t;
await t.fresh('#/profile');
await t.signIn();
const panel = () => p.getByRole('dialog', { name: /Панель администратора/ });
const openPanel = async () => {
  await p.goto(BASE + '#/profile'); await p.waitForTimeout(2000);
  await p.locator('#admin-panel-trigger-btn').click(); await p.waitForTimeout(2000);
};
const group = async (g, section) => {
  await panel().getByRole('tablist', { name: 'Разделы панели' }).getByRole('tab').filter({ hasText: g }).click();
  await p.waitForTimeout(1200);
  if (section) { await panel().getByRole('tab').filter({ hasText: section }).first().click(); await p.waitForTimeout(1800); }
};
const dumpFields = async (scope) => scope.evaluate((root) => [...root.querySelectorAll('input,textarea,select,[role=combobox],[role=switch]')].filter((e) => e.type !== 'hidden' && e.type !== 'file').map((e) => {
  const lab = e.id && root.querySelector(`label[for="${e.id}"]`);
  return String((lab ? lab.textContent.trim() : null) || e.getAttribute('aria-label') || ('ph:' + (e.placeholder || '')) || e.getAttribute('role')).slice(0, 40) + (lab ? '' : ' [no label]') + (e.required ? '*' : '');
}));

await openPanel();
await step('panel open', async () => { await shot('panel'); });

if (ONLY.includes('product')) {
  await step('new product form', async () => {
    await group('Каталог', 'Товары');
    await shot('products-tab');
    await panel().getByRole('button', { name: /Добавить товар/ }).first().click();
    await p.waitForTimeout(1500);
    const form = p.getByRole('dialog').last();
    note('  form title: ' + (await form.locator('h2,h3').first().textContent()));
    note('  fields: ' + JSON.stringify(await dumpFields(form)));
    await shot('form-top');
  });
  await step('try create empty', async () => {
    const form = p.getByRole('dialog').last();
    const btn = form.getByRole('button', { name: /^Создать/ }).last();
    note('  create enabled: ' + (await btn.isEnabled()));
    if (await btn.isEnabled()) { await btn.click(); await p.waitForTimeout(900); }
    note('  toasts: ' + (await toasts()));
    const inv = await p.evaluate(() => [...document.querySelectorAll('[aria-invalid="true"]')].map((e) => e.id || e.getAttribute('aria-label')));
    note('  invalid: ' + JSON.stringify(inv));
    await shot('create-empty');
  });
  await step('fill product', async () => {
    const form = p.getByRole('dialog').last();
    const byLabel = async (re, v) => { const l = form.getByLabel(re).first(); if (await l.count()) { await l.fill(v); note(`  filled ${re}`); } else note(`  !! no field ${re}`); };
    await byLabel(/^Название/, 'Рубашка оксфорд тест');
    await form.getByPlaceholder('напр. 2 990').fill('3490'); note('  filled price');
    await form.getByPlaceholder(/Краткое описание/).fill('Тестовая рубашка из хлопка оксфорд.');
    // category
    const cat = form.getByRole('combobox').first();
    if (await cat.count()) { await cat.click(); await p.waitForTimeout(500); const opt = p.getByRole('option').first(); note('  category options: ' + JSON.stringify(await p.getByRole('option').allTextContents())); await opt.click(); await p.waitForTimeout(300); }
    await shot('filled-basics');
    // photos
    const files = Array.from({ length: NPHOTO }, (_, i) => `${UX}/photo${(i % 5) + 1}.jpg`);
    await form.locator('input[type="file"][accept="image/*"]').setInputFiles(files);
    await p.waitForTimeout(6000);
    note('  toasts after photos: ' + (await toasts()));
    const imgs = await form.evaluate((f) => [...f.querySelectorAll('img')].filter((i) => i.src.startsWith('data:')).map((i) => i.src.length));
    note('  data-url images in form: ' + JSON.stringify(imgs) + ' total chars=' + imgs.reduce((a, b) => a + b, 0));
    await shot('photos');
    note('  fields now: ' + JSON.stringify(await dumpFields(form)));
  });
  await step('sizes and stock', async () => {
    const form = p.getByRole('dialog').last();
    const txt = (await form.innerText()).replace(/\s+/g, ' ');
    const i = txt.indexOf('Размер'); note('  around sizes: ' + txt.slice(Math.max(0, i - 100), i + 500));
    const sizeBtns = form.getByRole('button', { name: /^(S|M|L|XL)$/ });
    note('  size buttons: ' + (await sizeBtns.count()));
    const color = form.getByPlaceholder(/Новый цвет/).first();
    await color.fill('Белый'); await color.press('Enter'); await p.waitForTimeout(400);
    note('  after color enter: ' + (await form.innerText()).replace(/\s+/g, ' ').match(/ЦВЕТ[^]*?РАЗМЕРЫ/)?.[0]?.slice(0, 200));
    const addColor = form.getByRole('button', { name: /^\+?\s*Цвет$/ });
    if (!/Белый/.test(await form.innerText())) { await color.fill('Белый'); await addColor.first().click(); await p.waitForTimeout(400); }
    for (const sz of ['M', 'L']) { const b = form.getByRole('button', { name: sz, exact: true }).first(); if (await b.count()) await b.click(); }
    await p.waitForTimeout(500);
    const plus5 = form.getByRole('button', { name: '+5' }).first(); if (await plus5.count()) await plus5.click();
    await p.waitForTimeout(500);
    const t2 = (await form.innerText()).replace(/\s+/g, ' '); const j = t2.indexOf('ОСТАТКИ'); note('  stock block: ' + t2.slice(j, j + 400));
    await shot('sizes');
  });
  await step('create', async () => {
    const form = p.getByRole('dialog').last();
    await form.getByRole('button', { name: /^Создать/ }).last().click();
    await p.waitForTimeout(3500);
    note('  toasts: ' + (await toasts()));
    const inv = await p.evaluate(() => [...document.querySelectorAll('[aria-invalid="true"]')].map((e) => e.id || e.getAttribute('aria-label')));
    note('  invalid: ' + JSON.stringify(inv));
    await shot('after-create');
    note('  dialogs open: ' + JSON.stringify(await p.getByRole('dialog').evaluateAll((ds) => ds.map((d) => d.getAttribute('aria-label') || d.querySelector('h2,h3')?.textContent))));
  });
}

if (ONLY.includes('labels')) {
  await step('labels', async () => {
    await group('Каталог', 'Склад');
    await shot('inventory');
    const pn = panel();
    note('  inventory text: ' + (await pn.innerText()).replace(/\s+/g, ' ').slice(0, 600));
    note('  buttons: ' + JSON.stringify((await visibleButtons()).slice(0, 60)));
  });
  await step('refill-all has confirm?', async () => {
    const b = panel().getByRole('button', { name: /Пополнить все/ });
    note('  refill title: ' + (await b.getAttribute('title')));
  });
  await step('select new product for labels', async () => {
    const pn = panel();
    const search = pn.getByPlaceholder(/Поиск|артикул|штрихкод/i).first();
    await search.fill('оксфорд'); await p.waitForTimeout(900);
    await shot('inv-search');
    const boxes = pn.getByRole('checkbox');
    note('  checkboxes: ' + JSON.stringify(await boxes.evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label')).slice(0, 12))));
    await boxes.filter({ hasNot: p.locator('xx') }).nth(1).click().catch(async () => { await boxes.first().click(); });
    await p.waitForTimeout(700);
    await shot('inv-selected');
    note('  buttons: ' + JSON.stringify((await visibleButtons()).filter((x) => /тикет|Печат|PDF/i.test(x))));
    const lb = p.getByRole('button', { name: /тикетк/i }).locator('visible=true');
    note('  label buttons: ' + JSON.stringify(await lb.allTextContents()));
    await lb.last().click(); await p.waitForTimeout(2000);
    await shot('label-generator');
    const d = p.getByRole('dialog').last();
    note('  generator: ' + (await d.innerText()).replace(/\s+/g, ' ').slice(0, 900));
    const dl = p.waitForEvent('download', { timeout: 20000 }).catch(() => null);
    const pdf = d.getByRole('button', { name: /PDF|Скачать|Печать|Распечатать/i });
    note('  pdf buttons: ' + JSON.stringify(await pdf.allTextContents()));
    await pdf.first().click();
    const f = await dl; await p.waitForTimeout(3000);
    note('  download: ' + (f ? f.suggestedFilename() : 'none') + ' toasts: ' + (await toasts()));
    if (f) await f.saveAs(`${t.OUT}/${f.suggestedFilename()}`);
    await shot('after-pdf');
  });
}
if (ONLY.includes('chat')) {
  await step('support inbox', async () => {
    await group('Продажи');
    const tabs = await panel().getByRole('tab').allTextContents();
    note('  sales tabs: ' + JSON.stringify(tabs));
    await panel().getByRole('tab').filter({ hasText: /Поддержк|Чат/ }).first().click(); await p.waitForTimeout(2000);
    await shot('inbox');
    note('  inbox: ' + (await panel().innerText()).replace(/\s+/g, ' ').slice(0, 1200));
  });
  await step('open guest thread', async () => {
    const pn = panel();
    const th = pn.getByRole('button', { name: /Можно поменять размер/ }).first();
    note('  thread rows matching: ' + (await th.count()));
    await th.click(); await p.waitForTimeout(2000);
    await shot('thread');
    note('  thread view: ' + (await pn.innerText()).replace(/\s+/g, ' ').slice(0, 1200));
  });
  await step('reply', async () => {
    const pn = panel();
    const input = pn.locator('textarea').last();
    await input.fill('Здравствуйте! Да, поменяем на L — напишите номер заказа.');
    await pn.getByRole('button', { name: /Отправить/ }).last().click(); await p.waitForTimeout(2500);
    await shot('replied');
    note('  toasts: ' + (await toasts()));
  });
}
if (ONLY.includes('orders')) {
  await step('orders list', async () => {
    await group('Продажи');
    await panel().getByRole('tab').filter({ hasText: /Заказы/ }).first().click(); await p.waitForTimeout(2000);
    await shot('orders');
    note('  orders: ' + (await panel().innerText()).replace(/\s+/g, ' ').slice(0, 900));
  });
  await step('change status', async () => {
    const pn = panel();
    const card = pn.locator('text=WS-').first();
    note('  status controls: ' + JSON.stringify((await visibleButtons()).filter((x) => /статус|Принят|Сборка|В пути|Готов|Вручен|Детали|Далее|Следующ/i.test(x)).slice(0, 20)));
    const combo = pn.getByRole('combobox').filter({ hasText: /Принят|Сборка|В пути|Готов|Вручен|Доставлен/ }).first();
    note('  status combos: ' + (await pn.getByRole('combobox').count()));
    if (await combo.count()) {
      const before = await combo.textContent();
      await combo.click(); await p.waitForTimeout(500);
      const opts = await p.getByRole('option').allTextContents(); note('  options: ' + JSON.stringify(opts));
      await shot('status-menu');
      await p.getByRole('option', { name: /Сборка|Собирается/ }).first().click(); await p.waitForTimeout(1500);
      note('  before=' + before + ' after=' + (await combo.textContent()) + ' toasts: ' + (await toasts()));
      await shot('status-changed');
    }
  });
}
await t.finish();
