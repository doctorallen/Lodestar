'use strict';
// ---------------------------------------------------------------------------
// The save, kept in localStorage: what's banked at the Lodestar (ore,
// parts and exotics in stash, gear in items), what's worn, the blueprints
// known, the star's points, the attunements, and the deepest floor reached
// in each biome. An expedition under way is saved too (game.js, saveRun).
//
// Circuits replaced blades and spell cores, and a save from before them
// (SAVE_OLD) isn't converted: the game starts fresh, says so once, and
// leaves the old save where it was.
// ---------------------------------------------------------------------------

const SAVE_KEY = 'lodestar.save.v3';
const SAVE_OLD = 'lodestar.save.v2';

// Drops what this version of the game doesn't know (blueprints, affixes,
// stones), so a save can't crash a screen.
function cleanSaveItem(it) {
  if (!it || typeof it !== 'object') return null;
  if (it.kind === 'stone') return stoneKind(it.stone) ? it : null;
  if (!KIND_SLOT[it.kind] && it.kind !== 'relic') return null;
  if (it.bp && !BLUEPRINTS[it.bp]) delete it.bp;
  if (Array.isArray(it.affixes)) it.affixes = it.affixes.filter((a) => a && AFFIXES[a.id]);
  if (it.kind === 'caster') {
    it.slots = (Array.isArray(it.slots) ? it.slots : [null, null, null]).map((c) => (c && c.kind === 'stone' && stoneKind(c.stone) ? c : null));
    if (it.links) it.links = Array.isArray(it.links) ? it.links.filter((a) => Number.isInteger(a) && a >= 0 && a < it.slots.length - 1) : [];
  }
  return it;
}
function cleanSave(s) {
  s.blueprints = (s.blueprints || []).filter((id) => BLUEPRINTS[id]);
  s.items = (s.items || []).map(cleanSaveItem).filter(Boolean);
  for (const k of Object.keys(s.equip)) s.equip[k] = cleanSaveItem(s.equip[k]);
  if (!s.stash || typeof s.stash !== 'object') s.stash = {};
  s.tools = (s.tools || []).filter((id) => TOOLS[id]);
  if (!s.tools.includes('compass')) s.tools.unshift('compass');
  if (!s.tools.includes(s.tool)) s.tool = 'compass';
  s.codex = (s.codex || []).filter((k) => LEGENDARIES[k]);
  // what Wick knows of each kind's nature, and the resonances' Codex
  if (!s.natures || typeof s.natures !== 'object') s.natures = {};
  if (!s.resCodex || typeof s.resCodex !== 'object') s.resCodex = { kindling: [0, 1, 2] };
  for (const id of Object.keys(s.resCodex)) { const r = RESONANCES.find((x) => x.id === id); if (!r || !Array.isArray(s.resCodex[id])) delete s.resCodex[id]; else s.resCodex[id] = s.resCodex[id].filter((i) => Number.isInteger(i) && i >= 0 && i < r.seq.length); }
}

const Save = {
  data: null,
  fresh() {
    const rng = new Rng((Math.random() * 4294967296) >>> 0);
    return {
      v: 4, uid: 100, crafts: 0, dives: 0, star: 0, magSeen: 1,
      stash: {}, items: [], equip: startingGear(rng),
      attune: {}, deepest: {}, tips: {}, settings: { haptics: true },
      blueprints: BP_IDS.filter((id) => BLUEPRINTS[id].start),
      tools: ['compass'], tool: 'compass', codex: [], natures: {}, resCodex: { kindling: [0, 1, 2] },
    };
  },
  load() {
    let raw = null;
    try {
      raw = localStorage.getItem(SAVE_KEY);
      this.data = raw ? Object.assign(this.fresh(), JSON.parse(raw)) : this.fresh();
      // a save from before circuits: a fresh start, said once
      if (!raw && localStorage.getItem(SAVE_OLD)) this.data.freshStart = true;
      const s = this.data;
      s.equip = s.equip || {};
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
      if (!raw) { this.save(); return; }
      const stored = JSON.parse(raw);
      stored[key] = this.data[key];
      localStorage.setItem(SAVE_KEY, JSON.stringify(stored));
    } catch (e) { /* saved at the end of the dive instead */ }
  },
  // A generator for the next craft, reroll or salvage.
  rng() { return new Rng(hashInts(this.data.uid, ++this.data.crafts, 0xf0e)); },
};
