// Проверка «сайт открывается» (docs/ops-plan.md, этап 1): что видит покупатель, без входа и без записи в базу.
// Запускается после публикации (deploy.yml) и раз в 3 часа (site-check.yml); если проверка не прошла, workflow
// alerts.yml заводит владельцу задачу «Сбой сайта» в GitHub — письмом и уведомлением в приложении GitHub.
//
//   bun scripts/site-check.ts                       — главная отвечает, код приложения скачивается
//   bun scripts/site-check.ts --expect dist/index.html — и на сайте именно эта сборка (после публикации)
//   bun scripts/site-check.ts --browser             — и в Chrome страница рисуется без ошибок JS (390 px)
//
// SITE_URL — адрес магазина (пусто — адрес проекта на web.app).
import { readFileSync } from 'node:fs';

const PROJECT = 'ai-studio-applet-webapp-e9574';
const ATTEMPTS = 6;
const PAUSE_MS = 10_000;

const args = process.argv.slice(2);
const expectFile = args.includes('--expect') ? args[args.indexOf('--expect') + 1] : '';
const withBrowser = args.includes('--browser');
const site = (process.env.SITE_URL || `https://${PROJECT}.web.app`).replace(/\/+$/, '');

/** The app's entry script in index.html: the build gives it a new name every time the code changes */
export function entryScript(html: string): string {
  return html.match(/<script[^>]*type="module"[^>]*src="([^"]+)"/)?.[1] ?? '';
}

async function fetchText(url: string): Promise<{ status: number; type: string; text: string }> {
  // A fresh answer, not a copy cached on the way: right after a deploy the old page may still be cached
  const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}site-check=${Date.now()}`, {
    headers: { 'cache-control': 'no-cache' },
    signal: AbortSignal.timeout(20_000),
  });
  return { status: response.status, type: response.headers.get('content-type') ?? '', text: await response.text() };
}

/** One pass: the reason the site is not right, or '' when it is */
async function checkOnce(expectedScript: string): Promise<string> {
  let page;
  try {
    page = await fetchText(`${site}/`);
  } catch (err) {
    return `главная не ответила: ${(err as Error).message}`;
  }
  if (page.status !== 200) return `главная отвечает кодом ${page.status}`;
  if (!page.text.includes('id="root"')) return 'главная отвечает, но это не страница магазина (нет id="root")';
  const script = entryScript(page.text);
  if (!script) return 'на главной нет скрипта приложения';
  if (expectedScript && script !== expectedScript) {
    return `на сайте другая сборка: ${script}, а опубликована ${expectedScript}`;
  }
  try {
    const code = await fetchText(new URL(script, `${site}/`).href);
    if (code.status !== 200) return `код приложения ${script} отвечает кодом ${code.status}`;
    if (!/javascript/.test(code.type) || code.text.length < 1000) return `вместо кода приложения ${script} пришло ${code.type}`;
  } catch (err) {
    return `код приложения ${script} не скачался: ${(err as Error).message}`;
  }
  return '';
}

/** Opens the shop in Chrome as a phone: an uncaught JS error or an empty page means customers see a broken site */
async function checkInBrowser(): Promise<string> {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch(process.env.CI ? { channel: 'chrome' } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.log(`  консоль: ${msg.text().slice(0, 300)}`);
    });
    await page.goto(`${site}/`, { waitUntil: 'load', timeout: 30_000 });
    // The catalog comes from the database after the page: give the app time to draw the screen
    await page.waitForTimeout(8_000);
    const drawn = await page.locator('#root > *').count();
    if (errors.length) return `ошибка JS при открытии: ${errors.join(' | ').slice(0, 500)}`;
    if (!drawn) return 'страница пустая: приложение ничего не нарисовало';
    return '';
  } finally {
    await browser.close();
  }
}

async function main() {
  const expectedScript = expectFile ? entryScript(readFileSync(expectFile, 'utf8')) : '';
  if (expectFile && !expectedScript) throw new Error(`В ${expectFile} нет скрипта приложения`);
  console.log(`Проверяю ${site}${expectedScript ? ` (ожидаю сборку ${expectedScript})` : ''}`);

  // A few tries: a deploy reaches the CDN in seconds, and one lost request is not an outage
  let problem = '';
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    problem = await checkOnce(expectedScript);
    if (!problem) break;
    console.log(`  попытка ${attempt} из ${ATTEMPTS}: ${problem}`);
    if (attempt < ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
  }
  if (!problem && withBrowser) problem = await checkInBrowser();

  if (problem) {
    console.log(`::error title=Сайт не прошёл проверку::${problem}`);
    process.exit(1);
  }
  console.log('Сайт открывается: главная и код приложения на месте');
}

if (import.meta.main) await main();
