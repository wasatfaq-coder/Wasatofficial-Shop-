---
name: writing-e2e-scenarios
description: Пишет и чинит сценарии Playwright в браузере для Wasat Shop (tests/e2e) на эмуляторах Firebase, на 390 и 1280 px. Используй, когда меняется путь покупателя или экран админки и сценарий нужно добавить или поправить, когда в CI красный «Browser scenarios (390 & 1280 px)», когда сценарий падает через раз, или просят «добавь e2e», «тест в браузере», «сценарий».
---

# Сценарии в браузере

## Как устроено

`bun run test:e2e` собирает сайт с `VITE_USE_EMULATORS` в `dist-e2e/`, поднимает эмуляторы auth и firestore и
запускает проекты `playwright.config.ts` по порядку: `seed` (пишет магазин) → `phone` (390 px) и `desktop` (1280 px)
**параллельно на одной базе** → `clear` → `empty-phone`/`empty-desktop` (пустой магазин).

- Данные магазина — `tests/e2e/store.ts`: `PRODUCTS`, `COURIER`, `PICKUP`, `ADMIN`; индекс каталога и миниатюры
  строит из `PRODUCTS` функция `catalogIndexDocs`. Новый товар — новая запись в `PRODUCTS`, остальное соберётся само.
- База из теста — `tests/e2e/emulator.ts`: `readDoc`, `queryDocs`, `writeDocs`.
- `tests/e2e/fixtures.ts`: импортируй `test` и `expect` оттуда, а не из `@playwright/test`. Фикстура рвёт запросы
  не на 127.0.0.1 (картинки заменяет заглушкой) и роняет тест на любой ошибке JavaScript на странице; ещё в ней
  `signIn(ADMIN)`, флаг `phone` и `rub(n)` — цена так, как её печатает сайт.

## Как писать

- Селекторы — по ролям и подписям (`getByRole`, `getByLabel`), не по классам и id: вёрстка меняется, а сценарий
  остаётся, и заодно проверяется, что у кнопок и полей есть понятные экранному чтецу имена.
- Сценарий, который меняет данные, берёт свой товар или своё имя и почту с `info.project.name`: телефон и
  компьютер идут одновременно на одной базе и иначе меняют данные друг друга.
- То, что сайт пишет после смены экрана (журнал склада, счётчики), жди через `expect.poll`, а не
  `waitForTimeout`: заказ показывает «Заказ оформлен» раньше, чем списан склад, и фиксированная пауза давала падения
  через раз.

Образец — `tests/e2e/shop/one-click.spec.ts`:

```ts
test('заказ в 1 клик со страницы товара', async ({ page }, info) => {
  const name = `Быстрый ${info.project.name}`;
  await page.goto(`/product/${PRODUCTS.polo.id}`);
  await page.getByRole('radio', { name: /^L\b/ }).click();
  await page.getByRole('button', { name: 'Заказать в 1 клик' }).first().click();
  const form = page.getByRole('dialog', { name: 'Заказ в 1 клик' });
  await form.getByRole('textbox', { name: /^Ваше имя/ }).fill(name);
  // …
  const [order] = await queryDocs('orders', 'customerName', name);
  expect(order).toMatchObject({ totalPrice: PRODUCTS.polo.price });
});
```

## Как запускать один файл

Полный прогон — около 4 минут. Пока чинишь один сценарий, собери сайт один раз и гоняй только его (≈ 20 с):

```bash
VITE_USE_EMULATORS=true bunx vite build --outDir dist-e2e --emptyOutDir
bunx firebase emulators:exec --only auth,firestore --project ai-studio-applet-webapp-e9574 \
  'bunx playwright test tests/e2e/shop/one-click.spec.ts --project=phone --project=desktop'
```

`seed` запустится сам — от него зависят оба проекта. Идентификатор проекта настоящий, но `emulators:exec` пишет
только в эмуляторы, а фикстура не выпускает страницу в интернет. Поменял код сайта — пересобери `dist-e2e`.
В облачной сессии Chromium уже стоит (`/opt/pw-browsers`), `playwright install` не нужен.

## Красный CI

1. Какой тест и с какой ошибкой упал — лог задания «Browser scenarios (390 & 1280 px)» (`github:get_job_logs`).
   Скриншоты и трейсы — в артефакте `e2e-failures` запуска.
2. Повтори локально тот же файл на том же проекте; падает через раз — добавь `--repeat-each=10`.
3. Найди причину. Ретраи, `test.skip`, больший таймаут и `waitForTimeout` не исправляют, а прячут: прошлые
   «плавающие» падения были гонкой с записью склада и зависшей анимацией, которую увидел бы и покупатель.
4. Исправь сайт или сценарий, прогони файл с `--repeat-each=10`, затем весь `bun run test:e2e` — скилл `shipping-prs`
   делает это скриптом.

Поменялся путь покупателя — сценарий правится в том же PR, что и экран.
