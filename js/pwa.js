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
  app: null, asked: false, askedFrom: null,
  get newer() { return this.app && this.app.newer; },
  get prompt() { return this.app && this.app.prompt; },

  // (Tycho's installable app does the looking, the worker and the install
  // pop-up; what a new build waits for, and the asking, are the game's)
  init() {
    if (!/^https?:$/.test(location.protocol)) return;
    this.app = Tycho.pwa.start({
      build: BUILD_INFO, askedKey: PWA_ASKED, updatedKey: PWA_UPDATED,
      canAsk: () => !(Intro.on || (Game.ready && !Game.modal)),
      onInstallable: () => { if (UI.screen === 'screen-pause') this.drawPause(); },
      onInstalled: () => UI.toast('Installed. Lodestar is on your home screen'),
      onNewer: () => {
        if (this.tryLoad()) return;
        setInterval(() => this.tryLoad(), 1000);
        if (UI.screen === 'screen-pause') this.drawPause();
      },
    });
  },
  check() { if (this.app) this.app.check(); },

  // Once in the world (main.js bootEnter): say what was loaded, if it was
  // an update.
  entered() {
    if (this.app && this.app.updated()) UI.toast('Updated to ' + BUILD_INFO);
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
    if (!this.newer || (this.app && this.app.reloading) || this.busy()) return false;
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
  reload() { if (this.app) this.app.reload(); },

  installed() { return this.app ? this.app.installed() : false; },
  ios() { return this.app ? this.app.ios() : /iphone|ipad|ipod/i.test(navigator.userAgent); },
  install() { if (this.app) this.app.install(); },

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
