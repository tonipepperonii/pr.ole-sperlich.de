// Service Worker für PR Tracker PWA
const CACHE_NAME = 'pr-tracker-v1';
const STATIC_CACHE = 'pr-tracker-static-v1';

// Dateien die gecacht werden sollen
const STATIC_FILES = [
  '/',
  '/index.html',
  '/main.css',
  '/main.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// External Resources (CDNs)
const EXTERNAL_RESOURCES = [
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

// Service Worker Installation
self.addEventListener('install', event => {
  console.log('Service Worker: Installing...');
  
  event.waitUntil(
    Promise.all([
      // Cache static files
      caches.open(STATIC_CACHE).then(cache => {
        console.log('Service Worker: Caching static files');
        return cache.addAll(STATIC_FILES);
      }),
      // Cache external resources
      caches.open(CACHE_NAME).then(cache => {
        console.log('Service Worker: Caching external resources');
        return cache.addAll(EXTERNAL_RESOURCES);
      })
    ]).then(() => {
      console.log('Service Worker: Installation complete');
      self.skipWaiting();
    })
  );
});

// Service Worker Activation
self.addEventListener('activate', event => {
  console.log('Service Worker: Activating...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Delete old caches
          if (cacheName !== CACHE_NAME && cacheName !== STATIC_CACHE) {
            console.log('Service Worker: Deleting old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker: Activation complete');
      return self.clients.claim();
    })
  );
});

// Fetch Event - Cache Strategy
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Handle different types of requests
  if (url.origin === location.origin) {
    // Same origin - use cache first, then network
    event.respondWith(cacheFirst(request));
  } else if (EXTERNAL_RESOURCES.some(resource => request.url.includes(resource))) {
    // External resources - use cache first
    event.respondWith(cacheFirst(request));
  } else {
    // Other external requests - network first
    event.respondWith(networkFirst(request));
  }
});

// Cache First Strategy
async function cacheFirst(request) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      console.log('Service Worker: Serving from cache', request.url);
      return cachedResponse;
    }
    
    const networkResponse = await fetch(request);
    
    // Cache successful responses
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
      console.log('Service Worker: Cached new resource', request.url);
    }
    
    return networkResponse;
  } catch (error) {
    console.log('Service Worker: Cache first failed', error);
    
    // Return offline fallback for HTML pages
    if (request.headers.get('accept').includes('text/html')) {
      const cachedResponse = await caches.match('/index.html');
      return cachedResponse || new Response('Offline - Bitte Internetverbindung prüfen');
    }
    
    throw error;
  }
}

// Network First Strategy
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    
    // Cache successful responses
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('Service Worker: Network first failed, trying cache', error);
    
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    throw error;
  }
}

// Background Sync (für offline Daten-Synchronisation)
self.addEventListener('sync', event => {
  console.log('Service Worker: Background sync triggered', event.tag);
  
  if (event.tag === 'background-sync') {
    event.waitUntil(
      // Hier könntest du offline gespeicherte Daten mit Firebase synchronisieren
      syncOfflineData()
    );
  }
});

async function syncOfflineData() {
  try {
    // Placeholder für Firebase Sync
    console.log('Service Worker: Syncing offline data...');
    
    // Hier würdest du offline gespeicherte Daten aus IndexedDB holen
    // und mit Firebase synchronisieren
    
    console.log('Service Worker: Offline data sync complete');
  } catch (error) {
    console.log('Service Worker: Offline data sync failed', error);
  }
}

// Push Notifications (optional für Erinnerungen)
self.addEventListener('push', event => {
  console.log('Service Worker: Push received');
  
  const options = {
    body: 'Zeit für dein nächstes Workout! 💪',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    data: {
      url: '/'
    },
    actions: [
      {
        action: 'open',
        title: 'App öffnen'
      },
      {
        action: 'close',
        title: 'Schließen'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification('PR Tracker', options)
  );
});

// Notification Click Handler
self.addEventListener('notificationclick', event => {
  console.log('Service Worker: Notification clicked');
  
  event.notification.close();
  
  if (event.action === 'open' || !event.action) {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});
