'use strict';
// The installed game's updates (sw.js, js/pwa.js), served over http as the
// deploy is: the worker takes over and caches the game; a new deploy loads
// at once when nothing would be lost; with motes carried it asks, and
// LATER waits till they're gone while LOAD IT NOW loads; a deploy of the
// build the page already runs doesn't reload it; and with the network gone
// the game still opens.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { ROOT, launch, finish, until, viewport, tk } = require('./lib');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
// what the server deploys: the worker's stamp, the build version.json names
// (null: the page's own), and whether the network is there at all
const deploy = { sw: 'a1', build: 'v900.1 · test', offline: false };
const PAGE_BUILD = fs.readFileSync(path.join(ROOT, 'js/version.js'), 'utf8').match(/BUILD_INFO = '([^']*)'/)[1];

function serve() {
  return new Promise((ok) => {
    const s = http.createServer((req, res) => {
      if (deploy.offline) { req.socket.destroy(); return; }
      const url = decodeURIComponent(req.url.split('?')[0]);
      if (url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
      if (url === '/blank') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html>'); return; }
      if (url === '/version.json') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ build: deploy.build || PAGE_BUILD })); return; }
      const p = path.join(ROOT, url.replace(/\/$/, '/index.html'));
      if (!p.startsWith(ROOT) || !fs.existsSync(p)) { res.writeHead(404); res.end(); return; }
      let body = fs.readFileSync(p);
      if (url === '/sw.js') body = String(body).replace("'__BUILD__'", `'${deploy.sw}'`);
      res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
      res.end(body);
    });
    s.listen(0, '127.0.0.1', () => ok(s));
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const server = await serve(), base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await launch(), failures = [];
  const page = await browser.page(viewport({ width: 390, height: 844, mobile: true, scale: 1 }));
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // (the world isn't drawn: drawn in software, as here with no GPU, it
  // holds the browser's look for a new worker back by up to a minute)
  const noDraw = () => addEventListener('DOMContentLoaded', () => { window.renderFrame = () => {}; });
  await (page.addInitScript ? page.addInitScript(noDraw) : page.evaluateOnNewDocument(noDraw));
  const ready = () => tk.waitFor(page, () => typeof Game !== 'undefined' && Game.ready, { timeout: 120000 });
  // reloads are seen as the mark left on the window going
  const mark = () => page.evaluate(() => { window.__same = 1; });
  const same = () => page.evaluate(() => window.__same === 1).catch(() => false);
  const reloaded = async (ms) => {
    for (const t = Date.now(); Date.now() - t < ms; await wait(250)) if (!(await same())) { await ready(); return true; }
    return false;
  };
  // a deploy, and the game looking for it as it does on coming back to the
  // foreground (after a moment: a look while the browser is still making
  // its own after a load is folded into that one)
  const bump = async (sw, build) => { deploy.sw = sw; deploy.build = build; await wait(1500); await page.evaluate(() => Pwa.check()); };
  try {
    // (the save written from a page of the same place that isn't the game:
    // a worker still taking over a page left holds up its next update)
    await page.goto(base + 'blank');
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('lodestar.save.v5', JSON.stringify({ introSeen: true })); });
    await page.goto(base + '?noload');
    await ready();
    await tk.waitFor(page, () => !!navigator.serviceWorker.controller, { timeout: 30000 });
    const cached = await page.evaluate(async () => { const c = await caches.open((await caches.keys())[0]); return (await c.keys()).map((r) => new URL(r.url).pathname); });
    for (const f of ['/js/main.js', '/js/pwa.js', '/css/style.css', '/manifest.webmanifest', '/icons/icon-512.png']) if (!cached.includes(f)) failures.push('the worker did not cache ' + f);

    // a new deploy with nothing to lose: loads at once
    await mark();
    await bump('a2', 'v900.2 · test');
    if (!(await reloaded(15000))) failures.push('a new deploy did not load with nothing to lose');
    else if (!(await until(page, () => [...document.querySelectorAll('.toast')].some((t) => /^Updated to/.test(t.textContent)), 5000))) failures.push('no "Updated to" toast after an update');

    // motes carried: it asks; LATER, and it waits till they're gone
    const asked = async (what) => {
      if (!(await until(page, () => UI.screen === 'screen-update', 15000))) { failures.push(`${what}: no screen asked`); return false; }
      const text = await page.evaluate(() => $('update-text').textContent);
      if (!/v900\.\d/.test(text) || !/motes you carry/.test(text)) failures.push(`${what}: the screen said: ${text}`);
      if (!(await same())) { failures.push(`${what}: it reloaded while asking`); return false; }
      await wait(450);
      return true;
    };
    await page.evaluate(() => { motesCarried(Game.dive).rime = 3; });
    await mark();
    await bump('a3', 'v900.3 · test');
    if (await asked('motes carried')) {
      await page.evaluate(() => UI.acts.pwaLater());
      if (await reloaded(3000)) failures.push('LATER, and it reloaded with motes still carried');
      else {
        await page.evaluate(() => UI.openPause()); await wait(450);
        if (!(await page.evaluate(() => !!document.querySelector('#pause-app [data-act="pwaAsk"]')))) failures.push('the pause screen did not offer the waiting version');
        await page.evaluate(() => { UI.close(); Game.dive.motes = {}; });
        if (!(await reloaded(5000))) failures.push('the waiting build did not load once nothing was carried');
      }
    }

    // motes carried, and LOAD IT NOW: it loads
    await page.evaluate(() => { motesCarried(Game.dive).cinder = 2; });
    await mark();
    await bump('a4', 'v900.4 · test');
    if (await asked('load it now')) {
      await page.evaluate(() => UI.acts.pwaLoad());
      if (!(await reloaded(5000))) failures.push('LOAD IT NOW did not load the new version');
    }

    // a deploy of the build the page already runs: no reload
    await mark();
    await bump('a5', null);
    if (await reloaded(5000)) failures.push('a deploy of the same build reloaded the page');

    // with the network gone, it still opens (last: the connections dropped
    // here hold up the browser's next look for a new worker)
    deploy.offline = true;
    await page.reload(); await ready();
    if (await page.evaluate(() => !navigator.serviceWorker.controller)) failures.push('offline, the worker did not serve the game');
  } catch (e) {
    failures.push(String(e && e.stack || e));
  } finally {
    await browser.close();
    server.close();
  }
  for (const e of errors) failures.push('page error: ' + e);
  finish('pwa', failures);
})();
