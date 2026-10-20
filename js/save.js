'use strict';
// ---------------------------------------------------------------------------
// The save, kept in localStorage: what's banked at the Lodestar (ore,
// parts, exotics and threads in stash; bases, modules and cores in items),
// what's worn, the recipes known (still called blueprints) and what the
// forge has studied, the star's points, the attunements, the
// world, the pack a fall left (cache), the supplies carried, the deeds
// found, the outpost's buildings and Wick's upgrades. A sortie under way
// is saved too (game.js, saveRun).
//
// Gear from before modules (save version 5) is turned into crafted bases
// with modules in their sockets as it loads (modules.js, migrateGearSave);
// casters from before the rig (version 6) into rig frames, their circuits
// into the rig's two spells (migrateRigSave, below).
//
// The world replaced the dive chain, and a save from before it (SAVE_OLD:
// the circuits' save, or older) isn't converted: the game starts fresh,
// says so once, and leaves the old save where it was. The world itself
// (Save.data.world: its seed and what's been done to each territory) is
// rolled the first time it's needed (frontier.js).
// ---------------------------------------------------------------------------

const SAVE_KEY = 'lodestar.save.v4';
const SAVE_OLD = ['lodestar.save.v3', 'lodestar.save.v2'];

// A core for a spell's part ('form', 'el', 'm…'), or null if it's not one.
function cleanSpellCore(c, key) { return c && c.kind === 'stone' && stoneKind(c.stone) === spellPartKind(key) ? c : null; }
// A frame's two spells, as they should be: each a Form, an Element and its
// Mod slots.
function cleanSpells(it) {
  const n = clamp(Array.isArray(it.spells) && it.spells[0] && Array.isArray(it.spells[0].mods) ? it.spells[0].mods.length : rigModSlots(it.tier || 1, it.q || 0, it.shard), 1, 2);
  it.spells = [0, 1].map((i) => {
    const sp = (Array.isArray(it.spells) && it.spells[i]) || {}, out = emptySpell(n);
    out.form = cleanSpellCore(sp.form, 'form'); out.el = cleanSpellCore(sp.el, 'el');
    for (let k = 0; k < n; k++) out.mods[k] = cleanSpellCore((sp.mods || [])[k], 'm' + k);
    return out;
  });
}

// Drops what this version of the game doesn't know (recipes, affixes,
// cores, powers), so a save can't crash a screen.
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
  if (it.kind === 'caster') { delete it.slots; delete it.links; cleanSpells(it); }
  return it;
}

// A caster from before the rig, as a rig frame of its tier, its modules
// kept: its circuit's first Form, first Element and first Mods (as many as
// it has Mod slots) become spell A, and the rest of its stones go to
// `spill`. A Trigger (gone) becomes threads, in `stash`.
function rigFromCaster(it, spill, stash) {
  if (!it || it.kind !== 'caster' || it.spells) return it;
  const stones = (Array.isArray(it.slots) ? it.slots : []).filter((c) => c && c.kind === 'stone');
  it.bp = 'rig';
  delete it.slots; delete it.links;
  const n = rigModSlots(it.tier || 1, it.q || 0);
  it.spells = [emptySpell(n), emptySpell(n)];
  if (/^Scrap Gauntlet$/.test(it.name || '')) it.name = 'Scrap Rig';
  else if (/^Cracked Wand$/.test(it.name || '')) it.name = 'Cracked Rig';
  else if (!it.name || /(Wand|Gauntlet|Staff)$/.test(it.name)) it.name = baseName(it);
  rigTakeCircuit(it.spells[0], stones, spill, stash);
  return it;
}
// Fills a spell from a circuit's stones: the first of each kind it takes;
// the rest to `spill`, a Trigger to threads in `stash`.
function rigTakeCircuit(sp, stones, spill, stash) {
  for (const c of stones) {
    const k = stoneKind(c.stone);
    if (c.stone === 'trigger' || !k) { stash.thread = (stash.thread || 0) + T.retiredThreads; continue; }
    if (k === 'form' && !sp.form) sp.form = c;
    else if (k === 'element' && !sp.el) sp.el = c;
    else if (k === 'glyph' && sp.mods.indexOf(null) >= 0) sp.mods[sp.mods.indexOf(null)] = c;
    else spill.push(c);
  }
}
// Turns a save from before the rig (version 6) into one with it: every
// caster a rig frame; the worn main hand the rig (else the off hand), its
// circuit spell A and the off hand's spell B, the other frame to the stash;
// loose Triggers and Bloodresin unravelled into threads; the forge's
// remembered powers forgotten (imprinting is gone). True if anything
// changed.
function migrateRigSave(s) {
  if ((s.v || 0) >= 7) return false;
  const stash = s.stash = s.stash && typeof s.stash === 'object' ? s.stash : {}, items = s.items = s.items || [], eq = s.equip = s.equip || {};
  const casterOf = (x) => (x && x.kind === 'caster' && !x.spells ? x : null);
  const main = casterOf(eq.main), off = casterOf(eq.off);
  const stonesOf = (x) => (x && Array.isArray(x.slots) ? x.slots.filter((c) => c && c.kind === 'stone') : []);
  const mainStones = stonesOf(main), offStones = stonesOf(off);
  for (const it of [main, off]) if (it) { it.slots = []; rigFromCaster(it, items, stash); }
  const rig = main || off;
  if (rig) rigTakeCircuit(rig.spells[0], main ? mainStones : offStones, items, stash);
  if (main && off) {
    // the off hand's circuit is spell B; its frame goes to the stash
    rigTakeCircuit(rig.spells[1], offStones, items, stash);
    items.push(off);
  }
  eq.main = rig || (eq.main && eq.main.kind === 'caster' ? eq.main : null);
  delete eq.off;
  // everything else: stashed, carried, pocketed
  const spillInto = (list) => { const spill = []; const out = list.map((x) => rigFromCaster(x, spill, stash)); return out.concat(spill); };
  s.items = spillInto(items);
  if (s.run) {
    s.run.items = spillInto(s.run.items || []);
    for (const e of s.run.pocket || []) if (e.item) { const spill = []; e.item = rigFromCaster(e.item, spill, stash); s.items.push(...spill); }
    if (s.run.cargo && s.run.cargo.bloodresin) { s.run.cargo.thread = (s.run.cargo.thread || 0) + s.run.cargo.bloodresin * T.retiredThreads; delete s.run.cargo.bloodresin; }
  }
  // loose Trigger stones and Bloodresin: threads
  const keep = [];
  for (const x of s.items) { if (x && x.kind === 'stone' && x.stone === 'trigger') stash.thread = (stash.thread || 0) + T.retiredThreads; else keep.push(x); }
  s.items = keep;
  if (s.run) s.run.items = s.run.items.filter((x) => !(x && x.kind === 'stone' && x.stone === 'trigger'));
  if (stash.bloodresin) { stash.thread = (stash.thread || 0) + stash.bloodresin * T.retiredThreads; delete stash.bloodresin; }
  delete s.codex;
  // Starfall's parts changed after its third: what was shown past it isn't
  if (s.resCodex && Array.isArray(s.resCodex.starfall)) s.resCodex.starfall = s.resCodex.starfall.filter((i) => i < 3);
  // the rig is known from the first day
  s.blueprints = (s.blueprints || []).concat(BP_IDS.filter((id) => BLUEPRINTS[id].start && !(s.blueprints || []).includes(id)));
  s.v = 7;
  return true;
}

function cleanSave(s) {
  // gear from before modules: bases, and modules in their sockets; then
  // casters from before the rig: frames, and their circuits its spells
  migrateGearSave(s);
  migrateRigSave(s);
  s.blueprints = (s.blueprints || []).filter((id) => BLUEPRINTS[id]);
  s.studied = (s.studied || []).filter((id) => RESEARCH.some((r) => r.id === id));
  // (a slot this version doesn't wear: what's in it goes to the stash)
  s.items = s.items || [];
  for (const k of Object.keys(s.equip)) if (!SLOTS.includes(k)) { if (s.equip[k]) s.items.push(s.equip[k]); delete s.equip[k]; }
  s.items = s.items.map(cleanSaveItem).filter(Boolean);
  for (const k of Object.keys(s.equip)) s.equip[k] = cleanSaveItem(s.equip[k]);
  if (!s.stash || typeof s.stash !== 'object') s.stash = {};
  s.tools = (s.tools || []).filter((id) => TOOLS[id]);
  if (!s.tools.includes('compass')) s.tools.unshift('compass');
  if (!s.tools.includes(s.tool)) s.tool = 'compass';
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
  for (const id of Object.keys(s.resCodex)) { const r = RESONANCES.find((x) => x.id === id); if (!r || !Array.isArray(s.resCodex[id])) delete s.resCodex[id]; else s.resCodex[id] = s.resCodex[id].filter((i) => Number.isInteger(i) && i >= 0 && i < r.parts.length); }
}

const Save = {
  data: null,
  fresh() {
    return {
      v: 7, uid: 100, crafts: 0, dives: 0, star: 0, magSeen: 1,
      stash: {}, items: [], equip: startingGear(),
      attune: {}, tips: {}, settings: { haptics: true }, world: null, lastSpire: 0,
      // the recipes known (by their old name), what the forge has studied,
      // and how many modules have ever been caught
      blueprints: BP_IDS.filter((id) => BLUEPRINTS[id].start), studied: [], modsFound: 0,
      tools: ['compass'], tool: 'compass', natures: {}, resCodex: { kindling: [0, 1, 2] },
      // the star's points are light (deeds.js; an older save's are rescaled),
      // what's been found, the pack a fall left, and the supplies carried
      starScale: T.star.scale, found: {}, cache: null, supplies: {}, supplySel: null,
      // the outpost's buildings (structures.js; landing: the one still to
      // come down to its plot) and Wick's upgrades (wick.js; id: on)
      built: [], landing: null, wickUps: {},
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
  // A generator for the next craft or salvage.
  rng() { return new Rng(hashInts(this.data.uid, ++this.data.crafts, 0xf0e)); },
};
