// Сценарий: гость, клиентский режим, корзина с товаром, которого уже нет (или снятым), открывает #/checkout и оформляет.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [, , outDir, scenario, width] = process.argv;
const carts = {
  soldout: [{ id: 'c1', product: { id: 'p1', title: 'Пальто последнее', price: 10000, category: 'coats', colors: [], sizes: ['M'], images: [] }, selectedColor: 'Черный', selectedSize: 'M', quantity: 3 }],
  hidden: [{ id: 'c2', product: { id: 'p2', title: 'Пальто снятое', price: 10000, category: 'coats', colors: [], sizes: ['M'], images: [] }, selectedColor: 'Черный', selectedSize: 'M', quantity: 1 }],
};
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  const page = await b.newPage({ viewport: { width: Number(width || 390), height: 844 } });
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) console.log('CONSOLE', m.type(), m.text().slice(0, 300)); });
  await page.goto('http://127.0.0.1:5280/');
  await page.evaluate((c) => localStorage.setItem('manstyle_cart', JSON.stringify(c)), carts[scenario]);
  if (process.argv[5] === 'cart') {
    await page.goto('http://127.0.0.1:5280/#/cart'); await page.reload(); await page.waitForTimeout(3500);
    await page.screenshot({ path: `${outDir}/${scenario}-cart-${width}.png`, fullPage: true });
    await b.close(); return;
  }
  await page.goto('http://127.0.0.1:5280/#/checkout'); await page.reload();
  await page.waitForTimeout(3500);
  await page.fill('#checkout-name', 'Иван Проверкин');
  await page.fill('#checkout-phone', '+79990001122'); await page.fill('#checkout-email', 'ivan@example.ru');
  await page.getByText('Редактировать адрес').click();
  await page.waitForTimeout(500);
  const fields = await page.$$eval('input', (els) => els.map((e) => `${e.id}|${e.labels?.[0]?.textContent?.trim()}|${e.placeholder}`));
  console.log(fields.join('\n'));
  const fill = async (re, v) => { const loc = page.getByLabel(re).first(); if (await loc.count()) await loc.fill(v); else console.log('нет поля', re); };
  await fill(/Город/, 'Москва'); await fill(/Улица/, 'Тверская'); await fill(/Номер дома/, '1'); await fill(/Подъезд/, '1'); await fill(/Код домофона/, '11');
  console.log('BUTTONS', (await page.locator('[role=dialog] button').allInnerTexts()).join(' | '));
  const save = page.locator('[role=dialog]').getByRole('button', { name: /Сохранить|Готово|Применить/ }).first();
  if (await save.count()) await save.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${outDir}/${scenario}-checkout-before-${width}.png`, fullPage: true });
  await page.locator('#checkout-confirm').click();
  await page.waitForTimeout(4000);
  console.log('URL после оформления:', page.url());
  console.log('Текст:', (await page.locator('main').innerText()).slice(0, 300).replace(/\n+/g, ' / '));
  await page.screenshot({ path: `${outDir}/${scenario}-after-${width}.png`, fullPage: false });
  await b.close();
})();
