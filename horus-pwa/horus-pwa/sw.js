/* ═══════════════════════════════════════════════
   HORUS PWA – Service Worker
   Rouffiac-Tolosan
   Stratégies :
   - API HORUS (/api) : jamais interceptée → aucune donnée
     personnelle n'est stockée dans le cache de l'appareil ;
   - pages HTML et config.js : réseau d'abord, cache si hors ligne ;
   - bibliothèques et polices (CDN) : cache d'abord, rafraîchies en arrière-plan ;
   - tuiles de carte et géocodage : réseau uniquement.
═══════════════════════════════════════════════ */

const CACHE_NAME  = 'horus-v7';
const OFFLINE_URL = '/offline.html';

const PRECACHE_LOCAL = [
  '/', '/index.html', '/fdo.html', '/admin.html', '/offline.html', '/config.js', '/manifest.json',
  '/horus-auth.js', '/demo.js', '/vendor/keycloak.js',
  '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png',
  '/icons/icon-maskable-192.png', '/icons/apple-touch-icon.png', '/icons/badge-72.png',
];
const PRECACHE_CDN = [
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.4/chart.umd.min.js',
];
const CDN_HOSTS = ['cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

/* ── Install : précache (les ressources CDN ne bloquent pas l'installation) ── */
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(PRECACHE_LOCAL);
    await Promise.all(PRECACHE_CDN.map(url =>
      fetch(url, { mode: 'no-cors' }).then(r => cache.put(url, r)).catch(() => {})
    ));
    await self.skipWaiting();
  })());
});

/* ── Activate : purge des anciens caches + rechargement des pages si mise à jour ── */
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const anciens = (await caches.keys()).filter(k => k !== CACHE_NAME);
    await Promise.all(anciens.map(k => caches.delete(k)));
    await self.clients.claim();
    // Recharger seulement s'il s'agit d'une MISE À JOUR : à la toute première visite,
    // il n'y a rien de périmé à remplacer (et un rechargement relancerait la connexion).
    if (anciens.length) {
      (await self.clients.matchAll({ type: 'window' })).forEach(c => c.postMessage({ type: 'SW_UPDATED' }));
    }
  })());
});

// Mis en cache SANS la query string : une URL de retour de Keycloak (?code=…&state=…)
// porte un code de connexion à usage unique, qui n'a rien à faire dans le cache.
const networkFirst = (request, fallbackUrl) =>
  fetch(request).then(response => {
    if (response.ok) {
      const clone = response.clone();
      const u = new URL(request.url);
      caches.open(CACHE_NAME).then(cache => cache.put(u.origin + u.pathname, clone));
    }
    return response;
  }).catch(() =>
    caches.match(request, { ignoreSearch: true })
      .then(cached => cached || (fallbackUrl ? caches.match(fallbackUrl) : Response.error()))
  );

const staleWhileRevalidate = request =>
  caches.open(CACHE_NAME).then(cache =>
    cache.match(request).then(cached => {
      const refresh = fetch(request).then(response => {
        if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
        return response;
      }).catch(() => cached);
      return cached || refresh;
    })
  );

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const local = url.origin === self.location.origin;

  // API HORUS : données personnelles, jamais en cache.
  if (local && url.pathname.startsWith('/api/')) return;

  // Carte, géocodage, API externes : réseau uniquement.
  if (url.hostname.endsWith('tile.openstreetmap.org') ||
      url.hostname === 'nominatim.openstreetmap.org' ||
      url.hostname.endsWith('anthropic.com')) return;

  // Pages : réseau d'abord, puis cache, puis page hors ligne.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, OFFLINE_URL));
    return;
  }

  // Configuration : réseau d'abord (sinon la version hors ligne basculerait en mode démo).
  if (local && url.pathname === '/config.js') {
    event.respondWith(networkFirst(request));
    return;
  }

  // Bibliothèques, polices, icônes : cache d'abord, rafraîchi en arrière-plan.
  if (local || CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

/* ── Notifications push ── */
self.addEventListener('push', event => {
  let data = { title: 'HORUS', body: 'Nouvelle alerte dans votre quartier.', tag: 'horus-alert' };
  try { data = { ...data, ...event.data.json() }; } catch (e) {}

  event.waitUntil(
    self.registration.showNotification('HORUS · ' + data.title, {
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
    })
  );
});

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
