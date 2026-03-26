// Self-destructing service worker - clears all caches and unregisters
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', async (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then(clients => {
        for (const client of clients) {
          client.postMessage({ type: 'sw-cleared' })
        }
        return self.registration.unregister()
      })
  )
})
