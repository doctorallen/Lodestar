'use strict';
// ---------------------------------------------------------------------------
// The save, kept in localStorage: what's banked at the Lodestar (ore and
// exotics in stash, gear in items), what's worn, the star's points, the
// attunements, and the deepest floor reached in each biome. A dive in
// progress isn't saved; leaving mid-dive loses it.
// ---------------------------------------------------------------------------

const SAVE_KEY = 'lodestar.save.v2';

const Save = {
  data: null,
  fresh() {
    const rng = new Rng((Math.random() * 4294967296) >>> 0);
    return {
      v: 3, uid: 100, crafts: 0, dives: 0, star: 0,
      stash: {}, items: [], equip: startingGear(rng),
      attune: {}, deepest: {}, tips: {}, settings: { haptics: true },
    };
  },
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      this.data = raw ? Object.assign(this.fresh(), JSON.parse(raw)) : this.fresh();
      // saves from before the Cracked Focus get one in the off hand
      if (this.data.v < 3) {
        if (!this.data.equip.off) this.data.equip.off = startingGear(new Rng(this.data.uid)).off;
        this.data.v = 3;
      }
    } catch (e) {
      this.data = this.fresh();
    }
  },
  save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch (e) { /* private mode or full: play on */ }
  },
  // A generator for the next craft, reroll or salvage.
  rng() { return new Rng(hashInts(this.data.uid, ++this.data.crafts, 0xf0e)); },
};
