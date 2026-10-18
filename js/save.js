'use strict';
// ---------------------------------------------------------------------------
// The save: what's banked at the Lodestar, kept in localStorage. A dive in
// progress isn't saved yet; leaving mid-dive loses it.
// ---------------------------------------------------------------------------

const SAVE_KEY = 'lodestar.save.v1';

const Save = {
  data: null,
  fresh() {
    return { v: 1, stash: {}, pickTier: 1, deepest: 0, dives: 0, settings: { haptics: true } };
  },
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      this.data = raw ? Object.assign(this.fresh(), JSON.parse(raw)) : this.fresh();
    } catch (e) {
      this.data = this.fresh();
    }
  },
  save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch (e) { /* private mode or full: play on */ }
  },
};
