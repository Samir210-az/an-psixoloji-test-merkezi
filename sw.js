const CACHE = 'an-mchat-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/results.html',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,700;1,500&family=Inter:wght@300;400;500;600&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css'
];

// Install — önbellekləmə
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

// Activate — köhnə cacheləri sil
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch — cache-first, sonra network
self.addEventListener('fetch', e => {
  // Yalnız GET sorğularını önbelleklə
  if (e.request.method !== 'GET') return;
  // Chrome extension sorğularını keç
  if (!e.request.url.startsWith('http')) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        // Yalnız uğurlu cavabları önbelleklə
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return response;
      }).catch(() => {
        // Offline — index.html qaytar
        if (e.request.destination === 'document') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
