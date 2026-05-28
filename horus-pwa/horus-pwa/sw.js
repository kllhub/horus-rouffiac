/* ═══════════════════════════════════════════════
   HORUS PWA – Service Worker
   Rouffiac-Tolosan · v1.0
═══════════════════════════════════════════════ */

const CACHE_NAME    = 'horus-v1';
const OFFLINE_URL   = '/offline.html';

const PRECACHE = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Outfit:wght@300;400;500;600&display=swap',
];

/* ── Install : précache ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE.filter(u => !u.startsWith('http'))))
      .then(() => self.skipWaiting())
  );
});

/* ── Activate : purge old caches ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* ── Fetch : network-first pour les tuiles, cache-first pour le reste ── */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Tuiles cartographiques → network only (pas de cache pour économiser l'espace)
  if (url.hostname.includes('tile.openstreetmap.org') ||
      url.hostname.includes('basemaps.cartocdn.com')) {
    event.respondWith(
      fetch(event.request).catch(() => new Response('', { status: 503 }))
    );
    return;
  }

  // API Anthropic → network only
  if (url.hostname.includes('anthropic.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Tout le reste : cache-first avec fallback network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match(OFFLINE_URL);
        }
      });
    })
  );
});

/* ── Push notifications ── */
self.addEventListener('push', event => {
  let data = { title: 'HORUS', body: 'Nouvelle alerte dans votre quartier.', tag: 'horus-alert' };
  try { data = { ...data, ...event.data.json() }; } catch(e) {}

  const options = {
    body:    data.body,
    tag:     data.tag || 'horus-alert',
    icon:    '/icons/icon-192.png',
    badge:   '/icons/badge-72.png',
    vibrate: [200, 100, 200],
    data:    { url: data.url || '/', urgency: data.urgency || 'moyenne' },
    actions: [
      { action: 'view',    title: 'Voir l\'alerte' },
      { action: 'dismiss', title: 'Ignorer' },
    ],
    requireInteraction: data.urgency === 'haute',
  };

  event.waitUntil(
    self.registration.showNotification('HORUS · ' + data.title, options)
  );
});

/* ── Notification click ── */
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(self.location.origin));
      if (existing) { existing.focus(); existing.navigate(url); }
      else clients.openWindow(url);
    })
  );
});

/* ── Background sync (pour les signalements hors-ligne) ── */
self.addEventListener('sync', event => {
  if (event.tag === 'sync-signalements') {
    event.waitUntil(syncSignalements());
  }
});

async function syncSignalements() {
  // Récupère les signalements en attente stockés en IndexedDB
  // et les envoie au serveur quand la connexion revient
  const cache = await caches.open(CACHE_NAME);
  // Placeholder — à connecter au backend réel
  console.log('[HORUS SW] Syncing pending signalements...');
}
