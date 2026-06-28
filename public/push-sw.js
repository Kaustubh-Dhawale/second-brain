/* ===========================================================================
   Push handlers, merged into the generated service worker via
   `workbox.importScripts` (see vite.config.js). Plain JS only — no imports.
   Receives Web Push messages and shows the notification; focuses/opens the app
   when a notification is tapped.
   =========================================================================== */
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (e) {
    data = { body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'Second Brain'
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || undefined, // collapse duplicates with the same tag
    renotify: Boolean(data.tag),
    data: { url: data.url || '/?view=today' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/?view=today'
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((list) => {
        for (const client of list) {
          if (client.url.indexOf(self.location.origin) === 0 && 'focus' in client) {
            client.navigate(target)
            return client.focus()
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(target)
      })
  )
})
