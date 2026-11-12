/* FuhsiMarket service worker.
 *
 * Three jobs:
 *  1. Keep the installed PWA working when the network drops: the public shell
 *     and static assets are cached, and navigations fall back to /offline.
 *  2. Never cache authenticated pages or API responses. Orders, wallets and
 *     chat are always fetched fresh; a stale escrow/order screen would be
 *     actively dangerous.
 *  3. Receive Web Push messages and show them as phone notifications.
 */

const VERSION = 'fuhsimarket-v2';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const OFFLINE_URL = '/offline';

const PRECACHE_URLS = [
  OFFLINE_URL,
  '/',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
  '/icons/apple-touch-icon.png',
];

// Navigations we may store. Everything else (buyer/seller/admin dashboards,
// auth callbacks) is network-only so no private page is ever served from cache.
const PUBLIC_NAVIGATION_PATHS = new Set(['/', OFFLINE_URL, '/privacy', '/terms', '/login', '/signup']);

function isPublicNavigation(pathname) {
  return PUBLIC_NAVIGATION_PATHS.has(pathname);
}

function isStaticAsset(pathname) {
  return (
    pathname.startsWith('/_next/static/') ||
    pathname.startsWith('/icons/') ||
    /\.(?:css|js|png|jpg|jpeg|webp|gif|svg|ico|woff2?|ttf)$/i.test(pathname)
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => {
        /* a missing icon must never block installation */
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('fuhsimarket-') && !key.startsWith(VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Only same-origin GETs. Supabase, Paystack and every POST go straight to the
  // network untouched (the browser handles offline failure for them).
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok && isPublicNavigation(url.pathname)) {
            const cache = await caches.open(SHELL_CACHE);
            cache.put(request, response.clone());
          }
          return response;
        } catch {
          const cachedPage = await caches.match(request);
          if (cachedPage) return cachedPage;
          const offline = await caches.match(OFFLINE_URL);
          if (offline) return offline;
          return new Response(
            '<!doctype html><title>Offline</title><body style="font-family:system-ui;padding:40px;text-align:center"><h1>You are offline</h1><p>Reconnect and try again.</p></body>',
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
          );
        }
      })(),
    );
    return;
  }

  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) {
          // Refresh in the background so a redeploy eventually replaces it.
          fetch(request)
            .then((response) => {
              if (response.ok) return caches.open(ASSET_CACHE).then((cache) => cache.put(request, response));
              return undefined;
            })
            .catch(() => undefined);
          return cached;
        }

        try {
          const response = await fetch(request);
          if (response.ok) {
            const cache = await caches.open(ASSET_CACHE);
            cache.put(request, response.clone());
          }
          return response;
        } catch {
          return cached || Response.error();
        }
      })(),
    );
    return;
  }

  // Any other public GET: try the network, fall back to a cached copy.
  event.respondWith(
    (async () => {
      try {
        return await fetch(request);
      } catch {
        const cached = await caches.match(request);
        return cached || Response.error();
      }
    })(),
  );
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'FuhsiMarket';
  const options = {
    body: payload.body || 'You have a new update.',
    icon: payload.icon || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: payload.tag || 'fuhsimarket-order',
    renotify: true,
    data: { url: payload.url || '/seller/orders' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client && client.url.indexOf(target) !== -1) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(target);
        return undefined;
      }),
  );
});
