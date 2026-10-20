'use strict';
// ---------------------------------------------------------------------------
// The save, kept in localStorage: what's banked at the Lodestar (ore,
// parts, exotics and threads in stash; bases, modules and stones in
// items), what's worn, the recipes known (still called blueprints) and
// what the forge has studied, the star's points, the attunements, the
// world, the pack a fall left (cache), the supplies carried, the deeds
// found, the outpost's buildings (and the Refinery's level) and Wick's
// upgrades. A sortie under way is saved too (game.js, saveRun).
//
// A save from before the lean rules (no cargo limit, no pocket, no
// contracts, two supplies) loads cleanly: what was in a sortie's pocket
// goes to the stash, the contracts are dropped, graded supplies merge and
// the ones that are gone come back as ore (supplies.js), a Capacity
// attunement's points come back to spend, and a Deep Satchel comes back as
// what it cost.
//
// Gear from before modules (save version 5) is turned into crafted bases
// with modules in their sockets as it loads (modules.js, migrateGearSave).
//
// The world replaced the dive chain, and a save from before it (SAVE_OLD:
// the circuits' save, or older) isn't converted: the game starts fresh,
// says so once, and leaves the old save where it was. The world itself
// (Save.data.world: its seed and what's been done to each territory) is
// rolled the first time it's needed (frontier.js).
// ---------------------------------------------------------------------------

const SAVE_KEY = 'lodestar.save.v4';
const SAVE_OLD = ['lodestar.save.v3', 'lodestar.save.v2'];

// Drops what this version of the game doesn't know (recipes, affixes,
// stones, powers), so a save can't crash a screen.
function cleanSaveItem(it) {
  if (!it || typeof it !== 'object') return null;
  if (it.kind === 'stone') return stoneKind(it.stone) ? it : null;
  if (it.kind === 'module') {
    if (!KIND_SLOT[it.fits]) return null;
    it.affixes = (Array.isArray(it.affixes) ? it.affixes : []).filter((a) => a && AFFIXES[a.id]);
    if (it.power && !LEGENDARIES[it.power]) delete it.power;
    if (it.set && !SETS[it.set]) delete it.set;
    return it;
  }
  if (!KIND_SLOT[it.kind] && it.kind !== 'relic') return null;
  if (it.bp && !BLUEPRINTS[it.bp]) delete it.bp;
  if (Array.isArray(it.affixes)) it.affixes = it.affixes.filter((a) => a && AFFIXES[a.id]);
  if (it.kind !== 'relic') it.sockets = (Array.isArray(it.sockets) ? it.sockets : []).map((m) => (m && m.kind === 'module' && m.fits === it.kind ? cleanSaveItem(m) : null));
  if (it.kind === 'caster') {
    it.slots = (Array.isArray(it.slots) ? it.slots : [null, null, null]).map((c) => (c && c.kind === 'stone' && stoneKind(c.stone) ? c : null));
    if (it.links) it.links = Array.isArray(it.links) ? it.links.filter((a) => Number.isInteger(a) && a >= 0 && a < it.slots.length - 1) : [];
  }
  return it;
}
function cleanSave(s) {
  // gear from before modules: bases, and modules in their sockets
  migrateGearSave(s);
  s.blueprints = (s.blueprints || []).filter((id) => BLUEPRINTS[id]);
  s.studied = (s.studied || []).filter((id) => RESEARCH.some((r) => r.id === id));
  s.items = (s.items || []).map(cleanSaveItem).filter(Boolean);
  for (const k of Object.keys(s.equip)) s.equip[k] = cleanSaveItem(s.equip[k]);
  if (!s.stash || typeof s.stash !== 'object') s.stash = {};
  // (a Deep Satchel, gone, comes back as what it cost)
  if ((s.tools || []).includes('satchel')) { s.stash.lumenite = (s.stash.lumenite || 0) + 8; s.stash[partId('chitin', 1)] = (s.stash[partId('chitin', 1)] || 0) + 4; }
  s.tools = (s.tools || []).filter((id) => TOOLS[id]);
  if (!s.tools.includes('compass')) s.tools.unshift('compass');
  if (!s.tools.includes(s.tool)) s.tool = 'compass';
  // the lean rules (above)
  cleanLeanSave(s);
  s.codex = (s.codex || []).filter((k) => LEGENDARIES[k]);
  // the outpost's buildings and Wick's upgrades (none in an older save):
  // their recipes are known from the first day
  for (const id of BP_IDS) if ((BLUEPRINTS[id].kind === 'structure' || BLUEPRINTS[id].kind === 'wick') && !s.blueprints.includes(id)) s.blueprints.push(id);
  s.built = (Array.isArray(s.built) ? s.built : []).filter((id, i, a) => STRUCTURE_IDS.includes(id) && a.indexOf(id) === i);
  if (!s.built.includes(s.landing)) s.landing = null;
  const wu = s.wickUps && typeof s.wickUps === 'object' ? s.wickUps : {};
  s.wickUps = {};
  for (const id of WICK_UP_IDS) if (Object.prototype.hasOwnProperty.call(wu, id)) s.wickUps[id] = wu[id] !== false;
  // what Wick knows of each kind's nature, and the resonances' Codex
  if (!s.natures || typeof s.natures !== 'object') s.natures = {};
  if (!s.resCodex || typeof s.resCodex !== 'object') s.resCodex = { kindling: [0, 1, 2] };
  for (const id of Object.keys(s.resCodex)) { const r = RESONANCES.find((x) => x.id === id); if (!r || !Array.isArray(s.resCodex[id])) delete s.resCodex[id]; else s.resCodex[id] = s.resCodex[id].filter((i) => Number.isInteger(i) && i >= 0 && i < r.seq.length); }
}

function cleanLeanSave(s) {
  if (s.run && Array.isArray(s.run.pocket)) {
    for (const e of s.run.pocket) {
      if (!e) continue;
      if (e.item) { const it = cleanSaveItem(e.item); if (it) s.items.push(it); }
      else if (e.blueprint) { if (BLUEPRINTS[e.blueprint] && !s.blueprints.includes(e.blueprint)) s.blueprints.push(e.blueprint); }
      else if (e.stuff && e.n > 0) s.stash[e.stuff] = (s.stash[e.stuff] || 0) + e.n;
    }
    delete s.run.pocket;
  }
  delete s.contracts; delete s.contractN; delete s.swapped;
  if (!s.attune || typeof s.attune !== 'object') s.attune = {};
  for (const id of Object.keys(s.attune)) if (!T.attune[id]) delete s.attune[id];
  migrateOldSupplies(s);
}

const Save = {
  data: null,
  fresh() {
    return {
      v: 6, uid: 100, crafts: 0, dives: 0, star: 0, magSeen: 1,
      stash: {}, items: [], equip: startingGear(),
      attune: {}, tips: {}, settings: { haptics: true }, world: null, lastSpire: 0,
      // the recipes known (by their old name), what the forge has studied,
      // and how many modules have ever been caught
      blueprints: BP_IDS.filter((id) => BLUEPRINTS[id].start), studied: [], modsFound: 0,
      tools: ['compass'], tool: 'compass', codex: [], natures: {}, resCodex: { kindling: [0, 1, 2] },
      // the star's points are light (deeds.js; an older save's are rescaled),
      // what's been found, the pack a fall left, and the supplies carried
      starScale: T.star.scale, found: {}, cache: null, supplies: {},
      // the outpost's buildings (structures.js; landing: the one still to
      // come down to its plot; refineryLv: the Refinery's level once it
      // stands) and Wick's upgrades (wick.js; id: on)
      built: [], landing: null, refineryLv: 1, wickUps: {},
    };
  },
  load() {
    let raw = null;
    try {
      raw = localStorage.getItem(SAVE_KEY);
      // (a stored save without a version is from before modules)
      this.data = raw ? Object.assign(this.fresh(), { v: 5 }, JSON.parse(raw)) : this.fresh();
      // a save from before circuits: a fresh start, said once
      if (!raw && SAVE_OLD.some((k) => localStorage.getItem(k))) this.data.freshStart = true;
      const s = this.data;
      s.equip = s.equip || {};
      cleanSave(s);
      // an older star, fed ore: rescaled to light, keeping its magnitude
      if (raw && JSON.parse(raw).starScale !== T.star.scale) { s.starScale = 0; rescaleStar(s); }
    } catch (e) {
      // keep what couldn't be read aside, so a fresh game never writes over it
      try { if (raw && !localStorage.getItem(SAVE_KEY + '.unread')) localStorage.setItem(SAVE_KEY + '.unread', raw); } catch (e2) { /* nowhere to keep it */ }
      this.unread = !!raw;
      this.data = this.fresh();
    }
  },
  save() {
    if (this.wiped) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch (e) {
      // private mode or full: play on, but say so once
      if (!this.warned && typeof UI !== 'undefined') { this.warned = true; UI.toast("Progress can't be saved in this browser"); }
    }
  },
  // Writes one field into the stored save straight away (a heart-shard or
  // echo, safe the moment it's taken), leaving the rest as last saved.
  saveField(key) {
    if (this.wiped) return;
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) { this.save(); return; }
      const stored = JSON.parse(raw);
      stored[key] = this.data[key];
      localStorage.setItem(SAVE_KEY, JSON.stringify(stored));
    } catch (e) { /* saved at the end of the dive instead */ }
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
  // A generator for the next craft, reroll or salvage.
  rng() { return new Rng(hashInts(this.data.uid, ++this.data.crafts, 0xf0e)); },
};
