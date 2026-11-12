// 通知の受け取り（vite-plugin-pwa が作る sw.js から importScripts で読み込む）
self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'ひびつみ', {
      body: data.body || '',
      tag: data.tag,
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      data: { url: self.registration.scope },
    }),
  );
});

// 通知を押したら、開いているアプリを前に出す（なければ開く）
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) if ('focus' in c) return c.focus();
      return self.clients.openWindow((event.notification.data && event.notification.data.url) || './');
    }),
  );
});
