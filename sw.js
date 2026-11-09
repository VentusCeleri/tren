// Offline-first cache: the app opens instantly from cache and refreshes itself in the background.
const CACHE = 'tren-v3';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-180.png', './icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== self.location.origin && !fonts) return; // GitHub API and anything else always go to the network
  if (e.request.mode === 'navigate') {
    // Page: network first so updates show up at once; cached copy if offline or slower than 3 s.
    e.respondWith(
      caches.open(CACHE).then((cache) => {
        const net = fetch(e.request, { cache: 'no-store' }).then((res) => {
          if (res.ok) cache.put('./index.html', res.clone());
          return res;
        });
        const slow = new Promise((resolve) => setTimeout(resolve, 3000)).then(() => cache.match('./index.html'));
        return Promise.race([net.catch(() => cache.match('./index.html')), slow.then((hit) => hit || net)])
          .then((res) => res || net);
      })
    );
    return;
  }
  // Static files and fonts: cache first, refresh in the background.
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(e.request);
      const fresh = fetch(e.request)
        .then((res) => {
          if (res.ok || res.type === 'opaque') cache.put(e.request, res.clone());
          return res;
        })
        .catch(() => hit);
      if (hit) {
        e.waitUntil(fresh);
        return hit;
      }
      return fresh;
    })
  );
});
