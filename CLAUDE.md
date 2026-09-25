# CLAUDE.md

Wasat Shop — SPA интернет-магазина мужской одежды (React 19 + Vite 6 + Tailwind 4),
данные в Firebase (Auth через Google, Firestore с именованной базой, Hosting).
Интерфейс и тексты — на русском.

## Команды

- `bun install` — зависимости (менеджер — Bun, lock-файл `bun.lock`)
- `bun run dev` — dev-сервер на :3000
- `bun run lint` — `tsc --noEmit` (линтера ESLint нет)
- `bun run build` — сборка в `dist/`
- `bun run test:rules` — тесты `firestore.rules` в эмуляторе (нужна Java)
- `bun run test:functions` — тесты Cloud Functions и расчёта цены (сначала `npm ci --prefix functions`)
- `functions/`: отдельный npm-пакет; `npm run typecheck|build --prefix functions`

Перед коммитом: `bun run lint && bun run build`; при изменении правил — `bun run test:rules`;
при изменении `functions/` или `src/shared/` — `bun run test:functions`.

## Архитектура

- Всё состояние — в `src/App.tsx`, экраны в `src/views/`, панель администратора
  в `src/components/admin/` (открывается из `ProfileScreen`).
- Работа с Firestore — только через `src/utils/firebaseSync.ts`
  (подписки `subscribeTo*`, запись `save*/sync*`).
- Клиент пишет в Firestore напрямую, поэтому безопасность = `firestore.rules`.
  Меняя поля документов или клиентские записи, обновляйте правила и
  `tests/firestore.rules.test.mjs`.
- Администратор: `ADMIN_EMAIL` в `src/context/AuthContext.tsx` (дублируется в `firestore.rules`)
  или документ `admins/{uid}`. Заказы и профили видны только владельцу и администратору.
  Гостевые заказы хранятся в `localStorage`.
- ID базы Firestore — в `firebase-applet-config.json` (`firestoreDatabaseId`) и `firebase.json`.
- `src/shared/` — код, общий с Cloud Functions (расчёт цены `orderPricing.ts`, контракт
  `orderApi.ts`). Без браузерных API. Меняя расчёт цены, меняете его и на сервере.
- Заказы: при `settings/server.serverOrdersEnabled == true` заказ оформляет функция `placeOrder`
  (`functions/src/placeOrder.ts`), иначе — клиент (`completeOrderLocally` в `App.tsx`).
- Чат: сообщения с `threadId` (uid покупателя; у гостя — анонимный uid из отдельного
  Firebase-приложения `guest-chat`). У каждого сообщения должно быть поле `isInternalNote`.
- Название магазина не прописывать в текстах: `getStoreName(settings)` / `currentStoreName()` из
  `src/utils/storeContacts.ts` (там же контакты без демо-значений). Номера заказов и новые артикулы — `WS-`.
  Ключи `manstyle_*` в `localStorage` и ID базы — внутренние, не переименовывать.
- `users.bonusPoints/managerNotes/tags` меняет только администратор; заметки менеджера хранятся в `customer_notes`.
- Стили — неоморфные классы из `src/index.css`, тени только через их переменные (`--neu-*`), без `shadow-*`
  Tailwind рядом с `neu-*` (неоморфный класс их перекрывает). Одна `neu-button-accent` на экран,
  выбранное — `neu-pill-active`, удаление — `neu-button-danger` + `ConfirmDialog`. Цвета статусов — только
  токены `success/warning/danger` (и `*-soft` для подложек), не emerald/rose/amber. Подробно — `docs/ui-audit-plan.md`.
- Цвета бренда — токены `@theme` в `index.css`: `accent` (тёмно-синий #2C4A6B: ссылки, выбранное, иконки;
  `text-accent`, `bg-accent/10`), `accent-strong` для наведения; главная кнопка и заливки — графит
  (`neu-button-accent`, `neu-fill-accent`); золото `gold` — только бейджи «Хит/Premium» (`photoBadgeClass`
  в `src/utils/productBadge.ts`). Хексы акцента в классах не писать. Графики, карта и PDF — свои цвета.
  Заголовки h1–h3 и `font-display` — Manrope (`@fontsource/manrope`), текст — системный шрифт.
- Доступность: текст не мельче `text-[11px]`, вторичный текст #4E5C70, акцентный текст — `text-accent`;
  не отключать `outline` (фокус — через `:focus-visible` в `index.css`); кнопке из одной иконки — `aria-label`.

## Деплой

GitHub Actions `deploy.yml`: push в `main` публикует Hosting и правила, PR получает preview-канал.
Нужен секрет `FIREBASE_SERVICE_ACCOUNT`.
