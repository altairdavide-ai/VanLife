/* Service worker: l'app deve accendersi anche in mezzo al nulla, senza campo.
   - guscio dell'app: precaricato
   - tasselli delle mappe: tenuti in cache (i posti dove sei già stato restano visibili)
   - meteo: rete prima, cache come rete di sicurezza
   - radar: solo rete (un'immagine vecchia sarebbe peggio che nessuna) */

const VERSION = 'v3';
const SHELL = `vanlife-shell-${VERSION}`;
const TILES = `vanlife-tiles-${VERSION}`;
const DATA = `vanlife-data-${VERSION}`;

const SHELL_FILES = [
  './', './index.html', './manifest.webmanifest',
  './css/app.css',
  './js/app.js', './js/util.js', './js/store.js', './js/geo.js', './js/weather.js',
  './js/alerts.js', './js/ui.js', './js/tilt.js', './js/launcher.js',
  './js/views/plancia.js', './js/views/radar.js', './js/views/meteo.js', './js/views/livella.js',
  './js/views/bordo.js', './js/views/energia.js', './js/views/posti.js', './js/views/checklist.js',
  './js/views/app.js', './js/views/impostazioni.js',
  './vendor/leaflet/leaflet.js', './vendor/leaflet/leaflet.css', './vendor/suncalc.js',
  './vendor/leaflet/images/marker-icon.png', './vendor/leaflet/images/marker-shadow.png',
  './icons/icon-192.png', './icons/icon-512.png', './icons/favicon-64.png',
];

const TILE_HOSTS = ['tile.openstreetmap.org', 'basemaps.cartocdn.com', 'server.arcgisonline.com', 'tile.opentopomap.org'];
const DATA_HOSTS = ['api.open-meteo.com', 'api.bigdatacloud.net'];
const MAX_TILES = 400;   // le risposte opache costano quota: non esagerare

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    await Promise.allSettled(SHELL_FILES.map((f) => c.add(new Request(f, { cache: 'reload' }))));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('vanlife-') && !k.endsWith(VERSION)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function trimCache(name, max) {
  const c = await caches.open(name);
  const keys = await c.keys();
  if (keys.length <= max) return;
  for (const k of keys.slice(0, keys.length - max)) await c.delete(k);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // navigazione: rete prima, altrimenti il guscio in cache
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try { return await fetch(req); }
      catch { return (await caches.match('./index.html')) || Response.error(); }
    })());
    return;
  }

  // tasselli delle mappe: cache prima, poi rete (e si tiene la copia)
  if (TILE_HOSTS.some((hst) => url.hostname.endsWith(hst))) {
    e.respondWith((async () => {
      const c = await caches.open(TILES);
      const hit = await c.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') {
          try { await c.put(req, res.clone()); await trimCache(TILES, MAX_TILES); }
          catch { /* quota piena: pazienza, il tassello si vede lo stesso */ }
        }
        return res;
      } catch { return hit || Response.error(); }
    })());
    return;
  }

  // dati meteo: rete prima, cache di scorta
  if (DATA_HOSTS.some((hst) => url.hostname.endsWith(hst))) {
    e.respondWith((async () => {
      const c = await caches.open(DATA);
      try {
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      } catch {
        const hit = await c.match(req);
        return hit || Response.error();
      }
    })());
    return;
  }

  // immagini radar: sempre fresche
  if (url.hostname.includes('rainviewer.com')) return;

  // resto del guscio: cache prima
  if (url.origin === location.origin) {
    e.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok) (await caches.open(SHELL)).put(req, res.clone());
        return res;
      } catch { return Response.error(); }
    })());
  }
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) if ('focus' in c) return c.focus();
    return self.clients.openWindow('./');
  })());
});
