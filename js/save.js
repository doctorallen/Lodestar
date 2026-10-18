'use strict';
// ---------------------------------------------------------------------------
// The save, kept in localStorage: what's banked at the Lodestar (ore,
// parts and exotics in stash, gear in items), what's worn, the blueprints
// known, the star's points, the attunements, and the deepest floor reached
// in each biome. A dive in
// progress isn't saved; leaving mid-dive loses it.
// ---------------------------------------------------------------------------

const SAVE_KEY = 'lodestar.save.v2';

// Drops what this version of the game doesn't know (blueprints, affixes,
// cores), so an old save can't crash a screen.
function cleanSaveItem(it) {
  if (!it || typeof it !== 'object') return null;
  if (it.bp && !BLUEPRINTS[it.bp]) delete it.bp;
  if (it.kind === 'core' && !CORES[it.core]) return null;
  if (Array.isArray(it.affixes)) it.affixes = it.affixes.filter((a) => a && AFFIXES[a.id]);
  if (Array.isArray(it.sockets)) it.sockets = it.sockets.map((c) => (c && CORES[c.core] ? c : null));
  return it;
}
function cleanSave(s) {
  s.blueprints = (s.blueprints || []).filter((id) => BLUEPRINTS[id]);
  s.items = (s.items || []).map(cleanSaveItem).filter(Boolean);
  for (const k of Object.keys(s.equip)) s.equip[k] = cleanSaveItem(s.equip[k]);
  if (!s.stash || typeof s.stash !== 'object') s.stash = {};
}

const Save = {
  data: null,
  fresh() {
    const rng = new Rng((Math.random() * 4294967296) >>> 0);
    return {
      v: 3, uid: 100, crafts: 0, dives: 0, star: 0, magSeen: 1,
      stash: {}, items: [], equip: startingGear(rng),
      attune: {}, deepest: {}, tips: {}, settings: { haptics: true },
      blueprints: BP_IDS.filter((id) => BLUEPRINTS[id].start),
    };
  },
  load() {
    let raw = null;
    try {
      raw = localStorage.getItem(SAVE_KEY);
      this.data = raw ? Object.assign(this.fresh(), JSON.parse(raw)) : this.fresh();
      const s = this.data;
      s.equip = s.equip || {};
      // saves from before the Cracked Focus get one in the off hand
      if (s.v < 3) {
        if (!s.equip.off) s.equip.off = startingGear(new Rng(s.uid)).off;
        s.v = 3;
      }
      cleanSave(s);
    } catch (e) {
      // keep what couldn't be read aside, so a fresh game never writes over it
      try { if (raw && !localStorage.getItem(SAVE_KEY + '.unread')) localStorage.setItem(SAVE_KEY + '.unread', raw); } catch (e2) { /* nowhere to keep it */ }
      this.unread = !!raw;
      this.data = this.fresh();
    }
  },
  save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch (e) {
      // private mode or full: play on, but say so once
      if (!this.warned && typeof UI !== 'undefined') { this.warned = true; UI.toast("Progress can't be saved in this browser"); }
    }
  },
  // Writes one field into the stored save straight away (a heart-shard or
  // echo, safe the moment it's taken), leaving the rest as last saved.
  saveField(key) {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const stored = JSON.parse(raw);
      stored[key] = this.data[key];
      localStorage.setItem(SAVE_KEY, JSON.stringify(stored));
    } catch (e) { /* saved at the end of the dive instead */ }
  },
  // A generator for the next craft, reroll or salvage.
  rng() { return new Rng(hashInts(this.data.uid, ++this.data.crafts, 0xf0e)); },
};
