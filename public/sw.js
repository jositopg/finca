const CACHE = 'finca-v3'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const { request } = e
  const url = new URL(request.url)

  if (url.hostname.includes('googleapis.com') || url.hostname.includes('accounts.google.com')) {
    return
  }
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone()
          caches.open(CACHE).then((c) => c.put('/', clone))
          return res
        })
        .catch(() => caches.match('/').then((c) => c || Response.error())),
    )
    return
  }

  // Solo assets hasheados en cache-first; el resto a red.
  const esAsset = url.pathname.startsWith('/assets/')
  if (!esAsset) return

  e.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone()
            caches.open(CACHE).then((c) => c.put(request, clone))
          }
          return res
        })
        .catch(() => cached || Response.error())
    }),
  )
})
