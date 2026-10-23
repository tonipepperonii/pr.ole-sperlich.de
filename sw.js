// Service Worker für PR Tracker PWA
const CACHE_NAME = 'pr-tracker-v4';

// App-Dateien (network first → Updates kommen sofort an, offline aus dem Cache)
const STATIC_FILES = [
  '/',
  '/index.html',
  '/main.css',
  '/main.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Versionierte CDN-Dateien ändern sich nie → cache first
const EXTERNAL_RESOURCES = [
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // reload: Browser-Cache umgehen, damit keine veralteten Dateien vorgehalten werden
      .then(cache => cache.addAll([...STATIC_FILES, ...EXTERNAL_RESOURCES].map(url => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => Promise.all(
        cacheNames
          .filter(cacheName => cacheName !== CACHE_NAME)
          .map(cacheName => caches.delete(cacheName))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  if (url.origin === location.origin) {
    event.respondWith(networkFirst(request));
  } else if (EXTERNAL_RESOURCES.includes(request.url)) {
    event.respondWith(cacheFirst(request));
  }
  // Alles andere (z. B. Firestore) geht unverändert ans Netzwerk –
  // Firestore hat einen eigenen Offline-Cache.
});

async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) return cachedResponse;

  const networkResponse = await fetch(request);
  if (networkResponse.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, networkResponse.clone());
  }
  return networkResponse;
}

async function networkFirst(request) {
  try {
    // no-cache: immer beim Server nachfragen, damit HTML/JS/CSS nie aus
    // unterschiedlichen Versionen stammen (GitHub Pages cacht 10 Minuten)
    const networkResponse = await fetch(request.mode === 'navigate' ? request.url : request, { cache: 'no-cache' });
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request, { ignoreSearch: true });
    if (cachedResponse) return cachedResponse;

    if (request.mode === 'navigate') {
      const fallback = await caches.match('/index.html');
      if (fallback) return fallback;
    }
    throw error;
  }
}
