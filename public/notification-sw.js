// Только системные уведомления о статусе заказа: Android Chrome показывает их лишь через service worker
// (src/utils/pushNotifications.ts). Ничего не кэширует и не перехватывает запросы сайта.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) =>
      windows.length > 0 ? windows[0].focus() : self.clients.openWindow('/profile')
    )
  );
});
