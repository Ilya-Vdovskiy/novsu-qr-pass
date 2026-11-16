const buildId = /* BUILD_ID */ null
const assets = /* PRECACHE_ASSETS */ []
const scope = new URL(self.registration.scope)
const index = new URL('index.html', scope)
const cachePrefix = `novgu-pass:${scope.href}:`
const cacheName = `${cachePrefix}${buildId}`
const urls = new Set(assets.map((asset) => new URL(asset, scope).href))

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName)
    await cache.addAll([...urls].map((url) => new Request(url, { cache: 'reload' })))
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys()
    const oldCaches = names.filter((name) => name.startsWith(cachePrefix) && name !== cacheName)
    await Promise.all(oldCaches.map((name) => caches.delete(name)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== scope.origin) return

  const isAppNavigation = request.mode === 'navigate' &&
    (url.pathname === scope.pathname || url.pathname === index.pathname)

  if (isAppNavigation) {
    event.respondWith(fetch(request).catch(async () => {
      return await caches.match(index.href, { cacheName, ignoreVary: true }) || Response.error()
    }))
  } else if (urls.has(url.href)) {
    event.respondWith(caches.match(url.href, { cacheName, ignoreVary: true }).then((cached) => cached || fetch(request)))
  }
})
