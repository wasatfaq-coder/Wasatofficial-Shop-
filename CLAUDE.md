# CLAUDE.md

ManStyle — SPA интернет-магазина мужской одежды (React 19 + Vite 6 + Tailwind 4),
данные в Firebase (Auth через Google, Firestore с именованной базой, Hosting).
Интерфейс и тексты — на русском.

## Команды

- `bun install` — зависимости (менеджер — Bun, lock-файл `bun.lock`)
- `bun run dev` — dev-сервер на :3000
- `bun run lint` — `tsc --noEmit` (линтера ESLint нет)
- `bun run build` — сборка в `dist/`
- `bun run test:rules` — тесты `firestore.rules` в эмуляторе (нужна Java)

Перед коммитом: `bun run lint && bun run build`; при изменении правил — `bun run test:rules`.

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

## Деплой

GitHub Actions `deploy.yml`: push в `main` публикует Hosting и правила, PR получает preview-канал.
Нужен секрет `FIREBASE_SERVICE_ACCOUNT`.
