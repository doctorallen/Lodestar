'use strict';
// ---------------------------------------------------------------------------
// Installing, and staying current. The service worker (sw.js) fetches from
// the network first, so a fresh launch is always the latest deploy. A game
// left open (or installed and resumed) looks for a new deploy whenever it
// comes back to the foreground and every fifteen minutes. When one has
// taken over, the page loads onto it, unless it's already that build (a
// page loaded fresh from the network is, and the new worker taking over
// just after it needs no reload; version.json, written by the deploy, says
// which build is up, and BUILD_INFO which this page is).
//
// A trip isn't kept between opens (game.js saveRun): the motes carried,
// the thread and a hold are gone on a reload, though everything in the save
// is kept (and a lit node is a tap away on the map). So the new build loads
// at once if nothing would be lost; if something would, the game asks:
// LOAD IT NOW and lose it, or LATER, and it loads by itself the next time
// there's nothing to lose. It never cuts in on the opening, a story's
// panels, a menu other than pause, a fall, or someone speaking.
//
// The pause screen offers INSTALL where the browser allows it, and says how
// on iPhone; the browser's own pop-up is asked for once on a tap outside
// play (again after a few days if it was turned down).
// ---------------------------------------------------------------------------
const PWA_ASKED = 'lodestar.installAsked', PWA_UPDATED = 'lodestar.updated';

const Pwa = {
  reg: null, prompt: null, newer: null, reloading: false, asked: false, askedFrom: null,

  init() {
    if (!/^https?:$/.test(location.protocol)) return;
    addEventListener('beforeinstallprompt', (e) => { this.prompt = e; if (UI.screen === 'screen-pause') this.drawPause(); });
    const ask = () => {
      if (!this.prompt || this.installed() || Intro.on || (Game.ready && !Game.modal)) return;
      let last = 0;
      try { last = +localStorage.getItem(PWA_ASKED) || 0; } catch (e) { /* storage unavailable */ }
      if (Date.now() - last < 3 * 864e5) return;
      try { localStorage.setItem(PWA_ASKED, String(Date.now())); } catch (e) { /* storage unavailable */ }
      this.install();
    };
    addEventListener('pointerup', ask);
    addEventListener('keyup', ask);
    addEventListener('appinstalled', () => { this.prompt = null; UI.toast('Installed. Lodestar is on your home screen'); });
    if (!('serviceWorker' in navigator)) return;
    // (on a first visit the first worker taking over is this build)
    let claimed = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!claimed) { claimed = true; return; }
      // a new version took over
      if (this.reloading || this.newer) return;
      fetch('version.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((v) => {
        if (v && v.build === BUILD_INFO) return; // already running it
        this.newer = (v && v.build) || 'a new version';
        if (this.tryLoad()) return;
        setInterval(() => this.tryLoad(), 1000);
        if (UI.screen === 'screen-pause') this.drawPause();
      });
    });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
      this.reg = reg;
      document.addEventListener('visibilitychange', () => { if (!document.hidden) this.check(); });
      setInterval(() => this.check(), 15 * 60 * 1000);
    }).catch(() => {});
  },
  check() { if (this.reg) this.reg.update().catch(() => {}); },

  // Once in the world (main.js bootEnter): say what was loaded, if it was
  // an update.
  entered() {
    let was = null;
    try { was = sessionStorage.getItem(PWA_UPDATED); sessionStorage.removeItem(PWA_UPDATED); } catch (e) { /* storage unavailable */ }
    if (was) UI.toast('Updated to ' + BUILD_INFO);
  },

  // What a reload now would lose, in words, or null if nothing.
  loss() {
    if (!Game.ready) return null; // still loading: nothing played yet
    const d = Game.dive;
    if (!d) return null;
    const lost = [];
    if (Object.values(motesCarried(d)).some((n) => n > 0)) lost.push('the motes you carry');
    if (d.thread || d.hold) lost.push('the thread');
    return lost.length ? lost.join(' and ') : null;
  },
  // Not now: the opening, a story's panels, a screen (pause is fine), a
  // fall, a vein lighting, someone speaking.
  busy() {
    if (!Game.ready) return false;
    const d = Game.dive;
    return Intro.on || (!!Game.modal && Game.modal !== 'screen-pause') || !!(d && (d.dying > 0 || d.ramp)) || !!(UI.lines && UI.lines.length);
  },
  // Looked at once a second while a new build waits: it loads if nothing
  // would be lost, and the first time something would, the game asks.
  tryLoad() {
    if (!this.newer || this.reloading || this.busy()) return false;
    const loss = this.loss();
    if (!loss) { this.reload(); return true; }
    if (!this.asked) this.ask();
    return false;
  },
  // The screen that asks: now, losing what's named, or later.
  ask() {
    const loss = this.loss();
    if (!loss) { this.reload(); return; }
    this.asked = true;
    this.askedFrom = UI.screen;
    $('update-text').textContent = `${this.named()}is ready. Loading it now loses ${loss}. Later, it loads by itself the next time there's nothing to lose.`;
    UI.show('screen-update');
  },
  later() {
    if (this.askedFrom === 'screen-pause') UI.openPause(); else UI.close();
  },
  // 'A new version, v298.8, ' (the build's number, as the loading shows it)
  named() { return this.newer.startsWith('v') ? `A new version, ${this.newer.split(' ')[0]}, ` : 'A new version '; },
  reload() {
    this.reloading = true;
    try { sessionStorage.setItem(PWA_UPDATED, this.newer || '1'); } catch (e) { /* storage unavailable */ }
    location.reload();
  },

  installed() { return matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone === true; },
  ios() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); },
  install() {
    if (!this.prompt) return;
    const p = this.prompt;
    p.prompt();
    p.userChoice.finally(() => { this.prompt = null; if (UI.screen === 'screen-pause') this.drawPause(); });
  },

  // The pause screen's lines: a new version waiting, installing.
  drawPause() {
    const el = $('pause-app');
    if (!el) return;
    let h = '';
    if (this.newer) {
      h += `<p class="note center">${esc(this.named())}is ready.</p>`;
      h += '<div class="menu"><button class="btn quiet" data-act="pwaAsk">LOAD IT NOW</button></div>';
    }
    if (this.installed()) h += '<p class="note center">Installed. It keeps itself up to date.</p>';
    else if (this.prompt) h += '<div class="menu"><button class="btn quiet" data-act="pwaInstall">INSTALL LODESTAR</button></div>';
    else if (this.ios()) h += '<p class="note center">To install: Share, then Add to Home Screen.</p>';
    if (el.innerHTML !== h) el.innerHTML = h;
  },
};
