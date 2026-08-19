/*
 * 離線支援：靜態資源 cache-first（背景更新），/api 一律走網路。
 * 書架「資料」的離線快取在前端 localStorage（app.js），這裡只管殼。
 */

const CACHE = 'bookshelf-v6';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/js/sages.js',
  '/js/demo-data.js',
  '/js/api.js',
  '/js/auth.js',
  '/js/config.js',
  '/js/isbn.js',
  '/js/scan.js',
  '/js/vendor/zxing.min.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(STATIC_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;         // 外站（GIS、書目 API）不插手
  if (url.pathname.startsWith('/api/')) return;        // API 永遠走網路，斷網由前端 localStorage 兜底
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetched = fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetched;
    }),
  );
});
