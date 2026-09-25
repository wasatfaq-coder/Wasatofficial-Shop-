# Wasat Shop — магазин мужской одежды

[![CI](https://github.com/wasatfaq-coder/Wasatofficial-Shop-/actions/workflows/ci.yml/badge.svg)](https://github.com/wasatfaq-coder/Wasatofficial-Shop-/actions/workflows/ci.yml)
[![Deploy](https://github.com/wasatfaq-coder/Wasatofficial-Shop-/actions/workflows/deploy.yml/badge.svg)](https://github.com/wasatfaq-coder/Wasatofficial-Shop-/actions/workflows/deploy.yml)

Мобильное веб-приложение интернет-магазина мужской одежды в стиле Neumorphism:
каталог с фильтрами, корзина, оформление заказа, личный кабинет, чат поддержки
и панель администратора (товары, склад, заказы, промокоды, витрина, аналитика).

**Продакшен:** https://ai-studio-applet-webapp-e9574.web.app (появится после первого деплоя из `main`)

## Стек

- React 19 + TypeScript, Vite 6, Tailwind CSS 4, Motion, Recharts
- Firebase: Authentication (Google и анонимный вход для гостевого чата), Cloud Firestore (данные),
  Cloud Functions (серверное оформление заказов), Hosting (сайт)
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

### Локально с эмуляторами Firebase

Чтобы не трогать боевую базу (и проверить оформление заказа через функцию), запустите
эмуляторы и dev-сервер в режиме эмуляторов (нужна Java):

```bash
npm ci --prefix functions && bun run build:functions
bunx firebase emulators:start --only auth,firestore,functions --project ai-studio-applet-webapp-e9574
VITE_USE_EMULATORS=true bun run dev   # во втором терминале
```

База в эмуляторе пустая: товары добавьте через панель администратора или скриптом с Admin SDK.

## Команды

| Команда | Что делает |
|---|---|
| `bun run dev` | Dev-сервер Vite на порту 3000 |
| `bun run build` | Продакшен-сборка в `dist/` |
| `bun run preview` | Локальный просмотр собранного `dist/` |
| `bun run lint` | Проверка типов TypeScript (`tsc --noEmit`) |
| `bun run test:rules` | Тесты правил Firestore в эмуляторе (нужна Java 11+) |
| `bun run test:functions` | Тесты Cloud Functions и расчёта цены в эмуляторе (нужны Java и `npm ci --prefix functions`) |
| `bun run build:functions` | Сборка Cloud Functions в `functions/lib/` |
| `bun run deploy` | Сборка и ручной деплой Hosting + правил Firestore |

## Структура

```
src/
  views/          экраны: главная, каталог, товар, корзина, оформление, профиль
  components/     UI-компоненты; admin/ — вкладки панели администратора
  context/        AuthContext — вход через Google и проверка прав администратора
  utils/          синхронизация с Firestore, склад, доставка, аналитика, экспорт
  data/           начальные (демо) данные для пустой базы
  shared/         код, общий с сервером: расчёт цены, контракт API заказа
  firebase.ts     инициализация Firebase, вызов placeOrder, личность для гостевого чата
functions/        Cloud Functions (placeOrder) и их тесты; свой package.json (npm)
firestore.rules   правила доступа к Firestore
tests/            тесты правил Firestore
firebase.json     настройки Hosting, Firestore и Functions для Firebase CLI
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

## Серверная часть

### Оформление заказов (Cloud Function `placeOrder`)

Функция `placeOrder` (регион `europe-west1`) берёт цены, остатки, промокоды, стоимость
доставки и настройки магазина из Firestore и в одной транзакции:
пересчитывает сумму, проверяет и списывает остатки, применяет промокод и создаёт заказ.
Всё, что присылает клиент, кроме состава корзины, адреса и контактов, игнорируется.

Режим включается флагом `settings/server.serverOrdersEnabled`:

| Флаг | Кто оформляет заказ | Что разрешено покупателям в правилах |
|---|---|---|
| нет / `false` | браузер (как раньше) | создавать заказ, списывать остатки, менять счётчики промокодов |
| `true` | Cloud Function | только отзывы о товарах; заказы, остатки и промокоды — только сервер |

**Как включить:**

1. Подключите тариф **Blaze** в Firebase Console (Cloud Functions без него не работают;
   для небольшого магазина обычно укладывается в бесплатные лимиты).
2. GitHub → Settings → Secrets and variables → Actions → **Variables** → создайте переменную
   `DEPLOY_FUNCTIONS` со значением `true`. Сервисному аккаунту деплоя дополнительно нужны
   роли **Cloud Functions Admin**, **Artifact Registry Administrator** и **Cloud Build Editor**
   (эта конфигурация ещё не проверена реальным деплоем — при ошибке 403 смотрите, какой API указан в логе).
3. Дождитесь деплоя из `main` (или запустите workflow «Deploy to Firebase» вручную) и
   убедитесь, что функция `placeOrder` появилась в Firebase Console → Functions.
4. Firestore → база `ai-studio-manstyle-…` → коллекция `settings` → документ `server` →
   поле `serverOrdersEnabled` (boolean) = `true`.

Выключить обратно — поставить `false`: магазин вернётся к оформлению в браузере.

### Чат поддержки

У каждого покупателя свой диалог (`chat_messages.threadId` = UID). Покупатель, вошедший через
Google, пишет от своего аккаунта. Гость при первом сообщении получает анонимную учётную запись
(отдельная копия Firebase-приложения, основной вход при этом не меняется). Для этого включите
**Authentication → Sign-in method → Anonymous**; без этого гостю предложат войти через Google.

Администратор видит все диалоги во вкладке «Поддержка» панели администратора.
Внутренние заметки сотрудников покупателю не видны. Сообщения, написанные до разделения
чата, собраны в диалог «Общий чат (до разделения)».

### Бонусы и заметки менеджера

Бонусные баллы (`users.bonusPoints`) меняет только администратор, покупатель изменить их
не может. Заметки и теги менеджера о покупателе хранятся в коллекции `customer_notes`,
доступной только администраторам.

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
   `FIREBASE_SERVICE_ACCOUNT_…`. На вопросы о создании workflow-файлов ответьте **No**
   (они уже есть в `.github/workflows/`), а затем добавьте секрет с тем же значением
   под именем `FIREBASE_SERVICE_ACCOUNT`. Или создайте всё вручную:
   - Google Cloud Console → IAM → Service Accounts → создать аккаунт и скачать ключ в формате JSON;
   - в **IAM проекта** `ai-studio-applet-webapp-e9574` выдать этому аккаунту (email из поля
     `client_email` в JSON) роли, с которыми деплой проверен:
     **Firebase Admin**, **Service Usage Consumer** и **Service Account User**;
   - GitHub → Settings → Secrets and variables → Actions → **New repository secret**,
     имя `FIREBASE_SERVICE_ACCOUNT`, значение — содержимое JSON-ключа.

   Если деплой падает с `HTTP Error: 403`, в логе видно, на каком шаге не хватило прав:
   `serviceusage.googleapis.com` — нет роли Service Usage Consumer;
   `firebaserules.googleapis.com` — нет прав на правила Firestore (роль Firebase Admin);
   `firebasehosting.googleapis.com` — нет прав на Hosting (роль Firebase Admin).
   Роли выдаются в IAM именно того проекта, куда идёт деплой, и применяются в течение нескольких минут.

Пока секрет не задан, шаги деплоя пропускаются с предупреждением (статус job при этом
зелёный), а сборка всё равно проверяется. Перед публикацией в продакшен также
запускаются тесты правил Firestore: правила, не прошедшие тесты, не деплоятся.

### Настройки репозитория GitHub

Рекомендуется включить в **Settings**:

- **Rules → Rulesets → New branch ruleset** для `main`: запрет удаления и force-push,
  обязательный Pull Request и обязательные проверки `Typecheck & build` и
  `Firestore rules tests`. Пока в проекте один разработчик, число обязательных одобрений
  оставьте 0: GitHub не даёт одобрить собственный PR. Владелец назначается ревьюером
  автоматически через `.github/CODEOWNERS`;
- **Advanced Security**: *Private vulnerability reporting*, *Dependabot alerts*,
  *Dependabot security updates* и *Secret scanning* с *Push protection*;
- **General → Pull Requests**: *Automatically delete head branches*.

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
