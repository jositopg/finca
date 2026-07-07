const CACHE = 'finca-v1'
const PRECACHE = [
  '/',
  '/manifest.json',
  '/icon.svg',
]

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()),
  )
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

  // Never intercept Google API calls
  if (url.hostname.includes('googleapis.com') || url.hostname.includes('accounts.google.com')) {
    return
  }

  // For navigation requests: always go to network first so index.html
  // (and the hashed asset paths it references) stays current after a
  // deploy. Only fall back to the cached shell when offline.
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone()
          caches.open(CACHE).then((c) => c.put('/', clone))
          return res
        })
        .catch(() => caches.match('/')),
    )
    return
  }

  // For assets: cache-first
  e.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then((res) => {
        if (res.ok && url.origin === self.location.origin) {
          const clone = res.clone()
          caches.open(CACHE).then((c) => c.put(request, clone))
        }
        return res
      })
    }),
  )
})
