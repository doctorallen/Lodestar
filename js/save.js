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
  if (!s.killsOf || typeof s.killsOf !== 'object') s.killsOf = {};
  if (typeof motesMigrate === 'function') motesMigrate(s);
}

const Save = {
  data: null,
  // (Tycho's save store: a save that can't be read is kept aside, never
  // written over; private mode or a full disk is said once, and play goes on)
  store: null,
  fresh() {
    return {
      v: 11, uid: 100, seed: null,
      magnitude: 1, core: T.star.core, kills: 0, falls: 0,
      said: {}, tips: {}, settings: { haptics: true }, killsOf: {}, lastSeen: 0,
      introSeen: false,
    };
  },
  get wiped() { return !!(this.store && this.store.wiped); },
  get unread() { return !!(this.store && this.store.unread); },
  load() {
    this.store = new Tycho.save.Store({
      key: SAVE_KEY, fresh: () => this.fresh(), clean: cleanSave, keepUnread: true,
      onRefused: () => { if (typeof UI !== 'undefined') UI.toast("Progress can't be saved in this browser"); },
    });
    this.data = this.store.load();
  },
  save() { if (this.store) this.store.write(this.data); },
  // Writes one field into the stored save straight away, leaving the rest
  // as last saved.
  saveField(key) { if (this.store) this.store.writeField(key); },
  // START OVER (the pause screen): every save this game has kept is wiped
  // but the settings (sound, lamp), and the page starts again from the
  // top, at the opening. Nothing is written after (wiped stops save()).
  startOver() {
    const keep = Object.assign({}, (this.data && this.data.settings) || {});
    (this.store || new Tycho.save.Store({ key: SAVE_KEY, fresh: () => this.fresh() })).startOver('lodestar.', Object.assign(this.fresh(), { settings: keep }));
  },
  // A generator for the next seeded roll at the star.
  rng() { this.data.rolls = (this.data.rolls || 0) + 1; return new Rng(hashInts(this.data.uid, this.data.rolls, 0xf0e)); },
};
