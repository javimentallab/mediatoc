// MediaOCD service worker — generated at build time
const VERSION = "main_8e20e568_8b7821c91655.js-d3f4f3f2d9a2";
const STATIC_CACHE = 'mt-static-' + VERSION;
const RUNTIME_CACHE = 'mt-runtime-' + VERSION;
const IMAGE_CACHE = 'mt-images-' + VERSION;
const API_CACHE = 'mt-api-' + VERSION;

const PRECACHE = [
  '/',
  '/' + "main_8e20e568_8b7821c91655.js",
  '/manifest.json',
  '/favicon.ico'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => null)));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((k) => {
        if (![STATIC_CACHE, RUNTIME_CACHE, IMAGE_CACHE, API_CACHE].includes(k)) {
          return caches.delete(k);
        }
      }));
    }).then(() => self.clients.claim())
  );
});

function isStaticAsset(url) {
  return /\.(js|css|woff2?|ttf|otf|eot)$/i.test(url.pathname);
}
function isImage(url) {
  return /\.(png|jpe?g|gif|svg|webp|ico|avif)$/i.test(url.pathname);
}
function isApi(url) {
  return url.pathname.startsWith('/api/');
}
function isNavigation(req) {
  return req.mode === 'navigate' || (req.method === 'GET' && req.headers.get('accept') && req.headers.get('accept').includes('text/html'));
}

// Cache-first: try cache, fallback to network, store on miss
async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const resp = await fetch(req);
    if (resp && resp.ok) cache.put(req, resp.clone());
    return resp;
  } catch (e) {
    if (cached) return cached;
    throw e;
  }
}

// Stale-while-revalidate: return cache immediately, update in background
async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req).then((resp) => {
    if (resp && resp.ok) cache.put(req, resp.clone());
    return resp;
  }).catch(() => cached);
  return cached || fetchPromise;
}

// Network-first: try network, fallback to cache (used for API + navigation)
async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const resp = await fetch(req);
    if (resp && resp.ok && req.method === 'GET') cache.put(req, resp.clone());
    return resp;
  } catch (e) {
    const cached = await cache.match(req);
    if (cached) return cached;
    throw e;
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
  } else if (isImage(url)) {
    event.respondWith(staleWhileRevalidate(req, IMAGE_CACHE));
  } else if (isApi(url)) {
    event.respondWith(networkFirst(req, API_CACHE));
  } else if (isNavigation(req)) {
    event.respondWith(
      networkFirst(req, RUNTIME_CACHE).catch(() => caches.match('/'))
    );
  }
});
