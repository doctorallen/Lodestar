'use strict';
// ---------------------------------------------------------------------------
// The service worker: makes the game installable and playable offline, but
// never stale. Every request goes to the network first (revalidating past
// the browser's HTTP cache) and only falls back to the cached copy when
// there's no network. __BUILD__ is replaced with the commit at deploy, so
// each deploy is a new worker: it installs, takes over at once, and the
// page loads onto the new version when it's safe to (js/pwa.js). Don't make
// it cache-first.
// ---------------------------------------------------------------------------
const SW_BUILD = '__BUILD__';
const SW_CACHE = 'lodestar-' + SW_BUILD;
// What the game needs offline: the page, and every script, stylesheet and
// icon it names (read from index.html, so a new file needs no line here),
// and what only the manifest names.
const SW_ALSO = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

function swFresh(url) { return new Request(url, { cache: 'reload' }); }

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const page = await (await fetch(swFresh('index.html'))).text();
    const named = [...page.matchAll(/(?:src|href)="([^"#:?]+)"/g)].map((m) => m[1]);
    const files = [...new Set(SW_ALSO.concat(named))];
    const c = await caches.open(SW_CACHE);
    await c.addAll(files.map(swFresh));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('lodestar-') && k !== SW_CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.endsWith('/version.json')) return; // always straight to the network
  e.respondWith(
    fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(SW_CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then((r) => r || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))),
  );
});
