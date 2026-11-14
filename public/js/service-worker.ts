/// <reference lib="webworker" />

declare const OFFLINE_ASSETS: string[];
declare const OFFLINE_VERSION: string;

const worker = globalThis as unknown as ServiceWorkerGlobalScope;
const cachePrefix = 'vibemarket-static-';
const cacheName = `${cachePrefix}${OFFLINE_VERSION}`;
const assets = new Set(OFFLINE_ASSETS);
const routes = new Set(['/', '/login', '/signup', '/profile', '/cart', '/checkout', '/orders']);

worker.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(OFFLINE_ASSETS))
    .then(() => worker.skipWaiting()));
});

worker.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith(cachePrefix) && key !== cacheName)
      .map((key) => caches.delete(key)),
  )).then(() => worker.clients.claim()));
});

worker.addEventListener('fetch', (event: FetchEvent) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== worker.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate' && (routes.has(url.pathname) || /^\/products\/[1-9]\d*$/.test(url.pathname))) {
    event.respondWith(fetch(request).catch(async () => {
      const cached = await (await caches.open(cacheName)).match('/index.html');
      return cached ?? Response.error();
    }));
  } else if (!url.search && assets.has(url.pathname)) {
    event.respondWith(caches.open(cacheName).then(async (cache) => (await cache.match(request)) ?? fetch(request)));
  }
});
