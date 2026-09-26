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
  или документ `admins/{uid}`; отдельного пароля панели нет. Заказы и профили видны только владельцу
  и администратору.
  Гостевые заказы хранятся в `localStorage`.
- ID базы Firestore — в `firebase-applet-config.json` (`firestoreDatabaseId`) и `firebase.json`.
- `src/shared/` — код, общий с Cloud Functions (расчёт цены `orderPricing.ts`, контракт
  `orderApi.ts`). Без браузерных API. Меняя расчёт цены, меняете его и на сервере.
- Заказы: при `settings/server.serverOrdersEnabled == true` заказ оформляет функция `placeOrder`
  (`functions/src/placeOrder.ts`), иначе — клиент (`completeOrderLocally` в `App.tsx`).
- Чат: сообщения с `threadId` (uid покупателя; у гостя — анонимный uid из отдельного
  Firebase-приложения `guest-chat`). У каждого сообщения должно быть поле `isInternalNote`.
  Бота и автоответов нет: покупатель пишет только `sender: 'user'` (правила), отвечают сотрудники; приветствия нет —
  пустой диалог показывает «Диалог пуст», статус отправки — настоящий (`pendingChatIds`/`failedChatMessages`).
  У сообщения серверное `sentAt` (правила: `== request.time`). Покупатель правит/удаляет свое сообщение 15 минут
  (`canCustomerChangeMessage`, в правилах — по `sentAt`), сотрудники — любое без срока. «Удалить у себя» —
  `hiddenForCustomer`/`hiddenForStaff`, «у всех» — удаление документа (`applyChatMessageChange`).
  Админка: один список диалогов `AdminSupportInbox` → `AdminSupportChatTab`; статус и приоритет диалога —
  `support_threads/{threadId}` (только администратор); статус для покупателя дублируется в
  `support_status/{threadId}` (читает сам покупатель, всплывающее уведомление при открытии чата). «Промокод» в чате:
  выбрать действующий из «Промокодов» (новый не создается) или создать новый. Поля ввода текста в админке — `resize-y`, как в FAQ.
- Демо-данных нет: пустая коллекция или поле = «не настроено» (компонент `NotConfigured`), ничего не засевается
  в Firestore и не подставляется покупателю; функциональная кнопка неактивна, пока нужные данные не заданы в админке.
  Списки админки сохраняются через `syncAll*` (только запись), удалённое убирает `deleteRemovedDocs`.
  Рейтинг товара — только по реальным отзывам (`getProductRating`).
- Разделы карточки товара (преимущества, состав, плотность, сертификаты, переплетение, посадка, страна, свои
  характеристики, уход) — поля товара из блока «Структура карточки» (`AdminProductCardStructure`); пустой раздел
  покупателю не показывается (`src/utils/productAttributes.ts`, без шаблонов по категории). Удаление элементов
  в форме товара — через `ConfirmDialog` с `preview` удаляемого, как в корзине.
  Отдельного поля «Материал» нет: `product.material` (фильтр материалов, поиск, накладные) заполняется из состава
  (`compositionToMaterial`). Плотность вводится числом, «г/м²» добавляет `formatFabricDensity`.
- `.neu-modal` имеет `transform` и `contain: paint`: полноэкранное окно (`fixed inset-0`) внутри него обрезается.
  Окна поверх панели администратора и формы товара выводить через `ModalPortal` (как `ConfirmDialog`).
  Вместо нативного `<select>` — `NeumorphicSelect`.
- Анимации появления: классы `animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-*` определены в `index.css`
  (пакета tw-animate-css нет); анимация без `fill-mode: forwards`, чтобы у окна не оставался `transform`.
- Отзывы — коллекция `reviews/{productId}_{uid}` (меняет только автор), «Полезно» — `review_votes/{reviewId}_{uid}`.
  В `App.tsx` они подмешиваются в `product.reviews` (`mergeProductReviews`) и вырезаются при записи товара
  (`withoutCollectionReviews`); писать отзывы внутрь товара нельзя.
- Режим серверных заказов включается в «Витрине» (`AdminServerOrdersCard`) только после ответа функции `placeOrder`.
- Способы оплаты, FAQ и категории хранятся в `settings/storefront` (`paymentMethods`, `faqItems`, `categories`;
  вкладки «Оплата», «FAQ», «Категории», общий редактор `AdminListEditor`). Без способа оплаты оформление заблокировано.
- `product.inStock` — и переключатель «В продаже / Снят с витрины», и флаг «распродан». `inStock == false` при
  ненулевом остатке = снят администратором (`isHiddenFromSale`): такой товар не заказывается ни в клиенте
  (`getOrderableStock`), ни в `placeOrder`. Фильтр каталога — один `matchesCatalogFilters`, без верхней границы цены
  по умолчанию (`DEFAULT_FILTER_STATE`).
- CSV — только через `downloadCSV`/`csvCell` из `src/utils/csvHelpers.ts` (защита от формул Excel); импорт товаров
  не выдумывает значения и обновляет товар с тем же ID. Данные из базы в HTML-строках (отчет PDF) — экранировать.
- Предзаказ (`isPreorderMode`): распроданный вариант можно заказать (`getOrderableStock`), позиция получает
  `isPreorder` и не списывается/не возвращается на склад. Логика — и в `App.tsx`, и в `placeOrder`.
- Название магазина не прописывать в текстах: `getStoreName(settings)` / `currentStoreName()` из
  `src/utils/storeContacts.ts` (там же контакты без демо-значений). Номера заказов и новые артикулы — `WS-`.
  Ключи `manstyle_*` в `localStorage` и ID базы — внутренние, не переименовывать.
- Этикетки: «Склад и SKU» → выбор вариантов → `AdminLabelGenerator` (форматы — `settings/storefront.labelFormats`,
  7 шаблонов и PDF — `src/utils/labels.ts`, превью и PDF по одной разметке, данные только из каталога, без названия
  магазина). Артикул = товар + цвет: код без размера — `articleCode`, у всех размеров цвета один штрихкод
  (`unifyArticleBarcodes`); шаблон без размера печатает одну этикетку на артикул, «Скидка» — только при старой цене.
  Штрихкоды — `src/shared/barcode.ts`: новые только `generateInternalEan13` (EAN-13 «2…», уникальный в каталоге).
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
