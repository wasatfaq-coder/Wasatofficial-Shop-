# ManStyle — магазин мужской одежды

[![CI](https://github.com/wasatfaq-coder/Wasatofficial-Shop-/actions/workflows/ci.yml/badge.svg)](https://github.com/wasatfaq-coder/Wasatofficial-Shop-/actions/workflows/ci.yml)
[![Deploy](https://github.com/wasatfaq-coder/Wasatofficial-Shop-/actions/workflows/deploy.yml/badge.svg)](https://github.com/wasatfaq-coder/Wasatofficial-Shop-/actions/workflows/deploy.yml)

Мобильное веб-приложение интернет-магазина мужской одежды в стиле Neumorphism:
каталог с фильтрами, корзина, оформление заказа, личный кабинет, чат поддержки
и панель администратора (товары, склад, заказы, промокоды, витрина, аналитика).

**Продакшен:** https://ai-studio-applet-webapp-e9574.web.app

## Стек

- React 19 + TypeScript, Vite 6, Tailwind CSS 4, Motion, Recharts
- Firebase: Authentication (вход через Google), Cloud Firestore (данные), Hosting (сайт)
- Менеджер пакетов — [Bun](https://bun.sh) (`bun.lock`)

## Быстрый старт

Нужны Bun ≥ 1.1 и Node.js ≥ 20.

```bash
bun install
bun run dev        # http://localhost:3000
```

Конфигурация Firebase берётся из `firebase-applet-config.json`. Ключ `apiKey` в нём —
публичный идентификатор веб-приложения Firebase, он не является секретом; доступ к
данным защищают правила `firestore.rules`.

`.env.example` описывает переменные, которые подставляет Google AI Studio при запуске
там (`GEMINI_API_KEY`, `APP_URL`). Для локальной разработки и Firebase Hosting они не нужны.

## Команды

| Команда | Что делает |
|---|---|
| `bun run dev` | Dev-сервер Vite на порту 3000 |
| `bun run build` | Продакшен-сборка в `dist/` |
| `bun run preview` | Локальный просмотр собранного `dist/` |
| `bun run lint` | Проверка типов TypeScript (`tsc --noEmit`) |
| `bun run test:rules` | Тесты правил Firestore в эмуляторе (нужна Java 11+) |
| `bun run deploy` | Сборка и ручной деплой Hosting + правил Firestore |

## Структура

```
src/
  views/          экраны: главная, каталог, товар, корзина, оформление, профиль
  components/     UI-компоненты; admin/ — вкладки панели администратора
  context/        AuthContext — вход через Google и проверка прав администратора
  utils/          синхронизация с Firestore, склад, доставка, аналитика, экспорт
  data/           начальные (демо) данные для пустой базы
  firebase.ts     инициализация Firebase
firestore.rules   правила доступа к Firestore
tests/            тесты правил Firestore
firebase.json     настройки Hosting и Firestore для Firebase CLI
```

## Администрирование

Панель администратора открывается в «Профиле». Для входа нужно:

1. Войти через Google под аккаунтом администратора — это владелец
   (`ADMIN_EMAIL` в `src/context/AuthContext.tsx` и в `firestore.rules`)
   или пользователь, для которого в Firestore создан документ `admins/{uid}`.
2. Ввести пароль панели (второй шаг, хранится локально в браузере).
   **Смените пароль по умолчанию** в панели → «Учетные данные».

Реальную защиту данных обеспечивают правила Firestore. Без Google-аккаунта
администратора изменить каталог, заказы или настройки нельзя.

**Добавить администратора:** Firebase Console → Firestore → база
`ai-studio-manstyle-…` → коллекция `admins` → документ с ID = UID пользователя
(UID есть в Authentication → Users). Поля документа могут быть любыми,
например `{ "role": "admin" }`.

## Деплой (Firebase Hosting)

Деплой автоматический через GitHub Actions (`.github/workflows/deploy.yml`):

- **push в `main`** — сборка, публикация сайта в Firebase Hosting и правил Firestore;
- **pull request** — временный preview-канал (7 дней), ссылка появится в комментарии к PR.

### Однократная настройка

1. В [Firebase Console](https://console.firebase.google.com/project/ai-studio-applet-webapp-e9574)
   откройте **Hosting** и нажмите «Get started» (достаточно один раз).
2. В **Authentication → Settings → Authorized domains** должны быть
   `ai-studio-applet-webapp-e9574.web.app` и `ai-studio-applet-webapp-e9574.firebaseapp.com`
   (и ваш собственный домен, если подключите). Иначе не будет работать вход через Google.
3. Создайте сервисный аккаунт для деплоя. Проще всего выполнить локально
   `bunx firebase init hosting:github`: команда сама создаст аккаунт и секрет
   `FIREBASE_SERVICE_ACCOUNT_…`. Если он называется иначе, переименуйте его
   в `FIREBASE_SERVICE_ACCOUNT` или добавьте вручную:
   - Google Cloud Console → IAM → Service Accounts → создать аккаунт с ролями
     **Firebase Hosting Admin**, **Firebase Rules Admin**, **Cloud Datastore Index Admin**,
     **Service Account User** и **API Keys Viewer**; скачать ключ в формате JSON;
   - GitHub → Settings → Secrets and variables → Actions → **New repository secret**,
     имя `FIREBASE_SERVICE_ACCOUNT`, значение — содержимое JSON-ключа.

Пока секрет не задан, шаги деплоя пропускаются с предупреждением, а сборка всё равно проверяется.

### Ручной деплой

```bash
bunx firebase login
bun run deploy
```

> Проект Firebase создан через Google AI Studio. Для деплоя у вашего Google-аккаунта
> должны быть права Owner/Editor в проекте `ai-studio-applet-webapp-e9574`.
> Если их нет, создайте свой проект Firebase и замените ID в `.firebaserc`,
> `firebase-applet-config.json` и `deploy.yml`.

## Документы

- [CONTRIBUTING.md](CONTRIBUTING.md) — как вносить изменения
- [SECURITY.md](SECURITY.md) — модель безопасности и как сообщить об уязвимости
- [LICENSE](LICENSE) — все права защищены
