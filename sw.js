/* ================================================================
   CROAK – service worker de la demo
   ================================================================
   - Guarda la app para que se pueda instalar y abrir sin internet
     (útil en ferias o presentaciones con mala señal).
   - Con internet siempre intenta traer la versión más nueva primero,
     así un deploy se ve sin tener que borrar nada.
   - Abre la bitácora cuando tocas una notificación.
   Si agregas archivos a la app, súmalos a APP_SHELL y cambia CACHE.
*/
const CACHE = 'croak-demo-v3';
const APP_SHELL = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/logo.png',
  './icons/badge-72.png',
  './icons/favicon-32.png',
];
const NETWORK_TIMEOUT_MS = 3000;
const FONT_ORIGINS = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function fromNetwork(request) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS);
    fetch(request).then(response => {
      clearTimeout(timer);
      if (response.ok || response.type === 'opaque') {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy));
      }
      resolve(response);
    }, error => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function fromCache(request) {
  const hit = await caches.match(request, { ignoreSearch: true });
  if (hit) return hit;
  if (request.mode === 'navigate') return caches.match('./index.html');
  return Response.error();
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Las fuentes no cambian: primero la copia guardada.
  if (FONT_ORIGINS.includes(url.origin)) {
    event.respondWith(caches.match(request).then(hit => hit || fromNetwork(request).catch(() => Response.error())));
    return;
  }
  if (url.origin !== self.location.origin) return;

  // La app: primero la red (con límite de tiempo) y, si no hay, la copia guardada.
  event.respondWith(fromNetwork(request).catch(() => fromCache(request)));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const client = clients.find(c => c.url.startsWith(self.registration.scope));
      if (client) {
        client.postMessage({ type: 'open-log' });
        return client.focus();
      }
      return self.clients.openWindow('./#bitacora');
    }),
  );
});
