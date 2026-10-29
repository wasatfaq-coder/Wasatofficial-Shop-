---
paths:
  - "src/app/useOrderNotifications.ts"
  - "src/utils/pushNotifications.ts"
  - "public/notification-sw.js"
  - "src/views/ProfileScreen.tsx"
---

## Уведомления о заказе

- Сервера push нет: о смене статуса сайт сообщает, пока открыт (`src/app/useOrderNotifications.ts`) — звук, тост и системное
  уведомление. Системное — только с разрешения браузера и через service worker `public/notification-sw.js` (Android Chrome
  не показывает `new Notification()`); worker ничего не кэширует. Показ — `showSystemNotification` в
  `src/utils/pushNotifications.ts`. Переключатель в профиле включён, только если уведомления включены в профиле и разрешены
  браузером; при запрете под ним — как разрешить.
- «Смотреть статус» в тосте открывает профиль и в нём заказ: id заказа — состояние `App` (`orderToOpen`) и проп
  `openOrderId` у `ProfileScreen`, не событие окна — профиль грузится по требованию и появляется после анимации экрана,
  событие с таймером до него не доходило (аудит 07.10, находка 23).
