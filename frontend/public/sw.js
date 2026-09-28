/*
 * Lorma Beauty POS — service worker (§22, §40)
 *
 * Responsibilities are deliberately narrow: cache the application shell and
 * static assets so the POS loads with no network.
 *
 * It does NOT cache or replay API writes. Offline sales live in IndexedDB
 * and are replayed by the sync engine, which owns idempotency keys and
 * conflict handling. A service worker replaying a queued POST has no way to
 * report a conflict back to the user, and would risk duplicate sales.
 */

// Bumped to purge caches poisoned by the cache-first bug below: a dev build
// serves /_next/static/chunks/page.js?v=<buildId>, whose URL is fixed for the
// life of the dev server while its contents change on every edit. Cached
// first, it was then served forever, leaving a till running code from hours
// earlier — which is how a fixed payment rule appeared not to be fixed.
const VERSION = 'v2';
const SHELL_CACHE = `lorma-shell-${VERSION}`;
const ASSET_CACHE = `lorma-assets-${VERSION}`;

// Routes the cashier must be able to open cold, with no connection.
const SHELL_ROUTES = ['/', '/till', '/till/sync', '/login', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Individually, so one 404 cannot fail the whole install.
      await Promise.allSettled(SHELL_ROUTES.map((route) => cache.add(route)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('lorma-') && !key.endsWith(VERSION))
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') void self.skipWaiting();
});

function isApiRequest(url) {
  return url.pathname.startsWith('/api/') || url.pathname.startsWith('/health');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // API traffic is the application's business, not the cache's. Letting it
  // through untouched keeps the offline/online decision in one place.
  if (isApiRequest(url)) return;

  // Cross-origin requests (fonts, CDN) pass through.
  if (url.origin !== self.location.origin) return;

  // Navigations: network first so a deployed update is picked up, falling
  // back to the cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const cache = await caches.open(SHELL_CACHE);
          cache.put(request, response.clone());
          return response;
        } catch {
          const cached = (await caches.match(request)) ?? (await caches.match('/till')) ?? (await caches.match('/'));
          return (
            cached ??
            new Response(
              '<!doctype html><meta charset="utf-8"><title>Lorma Beauty POS</title>' +
                '<body style="font-family:system-ui;padding:2rem;text-align:center">' +
                '<h1>Offline</h1><p>Reopen the app once you are connected to finish setting up.</p>',
              { headers: { 'Content-Type': 'text/html' }, status: 503 },
            )
          );
        }
      })(),
    );
    return;
  }

  /*
   * Static assets.
   *
   * Cache-first is only ever safe for a URL that cannot change meaning. A
   * production build gives one: the content hash is in the filename. A dev
   * build does not — the hash rides in ?v=<buildId>, which is fixed for the
   * life of the dev server while the file behind it changes on every edit.
   *
   * So the strategy is chosen per URL rather than assumed. Anything carrying
   * a query is treated as mutable and fetched from the network first. The
   * rest is served from cache and revalidated in the background, so a stale
   * copy can never outlive one more load.
   */
  const mutable = url.search !== '';

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);

      const fromNetwork = fetch(request)
        .then(async (response) => {
          if (response.ok && response.status === 200) {
            const cache = await caches.open(ASSET_CACHE);
            await cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => null);

      if (mutable) {
        // Offline is the only reason to accept a cached copy of one of these.
        const fresh = await fromNetwork;
        return fresh ?? cached ?? Response.error();
      }

      if (cached) {
        // Revalidate without blocking: this load is served from cache, the
        // next one gets whatever the network just returned.
        event.waitUntil(fromNetwork);
        return cached;
      }

      return (await fromNetwork) ?? Response.error();
    })(),
  );
});
