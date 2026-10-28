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
// Tycho's worker (vendor/tycho/dist/tycho-sw.js) does the work: what the
// game needs offline is the page, and every script, stylesheet and icon it
// names (read from index.html, so a new file needs no line here), and the
// manifest and its icons.
self.TYCHO_SW = { name: 'lodestar', build: '__BUILD__' };
importScripts('vendor/tycho/dist/tycho-sw.js');
