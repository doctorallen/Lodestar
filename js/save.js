'use strict';
// ---------------------------------------------------------------------------
// The save, in localStorage. One object: the world's seed, the star (its
// magnitude and the core's pieces), the story's said lines, the settings
// and the tips shown. Saves from before the Veins (docs/VEINS.md) are left
// where they are under their old key and not read: this is a new game.
// ---------------------------------------------------------------------------
const SAVE_KEY = 'lodestar.save.v5';

function cleanSave(s) {
  if (!Number.isFinite(s.seed)) s.seed = (Math.random() * 0x7fffffff) | 0;
  if (!s.settings || typeof s.settings !== 'object') s.settings = { haptics: true };
  if (!s.said || typeof s.said !== 'object') s.said = {};
  if (!s.tips || typeof s.tips !== 'object') s.tips = {};
  if (!Number.isFinite(s.magnitude) || s.magnitude < 1) s.magnitude = 1;
  if (!Number.isFinite(s.core)) s.core = T.star.core;
  if (!Number.isFinite(s.kills)) s.kills = 0;
  if (!Number.isFinite(s.falls)) s.falls = 0;
}

const Save = {
  data: null,
  fresh() {
    return {
      v: 11, uid: 100, seed: null,
      magnitude: 1, core: T.star.core, kills: 0, falls: 0,
      said: {}, tips: {}, settings: { haptics: true },
      introSeen: false,
    };
  },
  load() {
    let raw = null;
    try {
      raw = localStorage.getItem(SAVE_KEY);
      this.data = raw ? Object.assign(this.fresh(), JSON.parse(raw)) : this.fresh();
      cleanSave(this.data);
    } catch (e) {
      // keep what couldn't be read aside, so a fresh game never writes over it
      try { if (raw && !localStorage.getItem(SAVE_KEY + '.unread')) localStorage.setItem(SAVE_KEY + '.unread', raw); } catch (e2) { /* nowhere to keep it */ }
      this.unread = !!raw;
      this.data = this.fresh();
      cleanSave(this.data);
    }
  },
  save() {
    if (this.wiped) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch (e) {
      // private mode or full: play on, but say so once
      if (!this.warned && typeof UI !== 'undefined') { this.warned = true; UI.toast("Progress can't be saved in this browser"); }
    }
  },
  // Writes one field into the stored save straight away, leaving the rest
  // as last saved.
  saveField(key) {
    if (this.wiped) return;
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) { this.save(); return; }
      const stored = JSON.parse(raw);
      stored[key] = this.data[key];
      localStorage.setItem(SAVE_KEY, JSON.stringify(stored));
    } catch (e) { /* saved later instead */ }
  },
  // START OVER (the pause screen): every save this game has kept is wiped
  // but the settings (sound, lamp), and the page starts again from the
  // top, at the opening. Nothing is written after (wiped stops save()).
  startOver() {
    const keep = Object.assign({}, (this.data && this.data.settings) || {});
    this.wiped = true;
    try {
      const gone = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('lodestar.')) gone.push(k); }
      for (const k of gone) localStorage.removeItem(k);
      localStorage.setItem(SAVE_KEY, JSON.stringify(Object.assign(this.fresh(), { settings: keep })));
    } catch (e) { /* nothing more to do */ }
  },
  // A generator for the next seeded roll at the star.
  rng() { this.data.rolls = (this.data.rolls || 0) + 1; return new Rng(hashInts(this.data.uid, this.data.rolls, 0xf0e)); },
};
