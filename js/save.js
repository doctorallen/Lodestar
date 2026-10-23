'use strict';
// ---------------------------------------------------------------------------
// The save, kept in localStorage: what's banked at the Lodestar (ore,
// parts, exotics and threads in stash; bases, modules and cores in items),
// what's worn, the recipes known (still called blueprints) and what the
// forge has studied, the star's points, the attunements, the
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
// A frame's two spells, as they should be: each a Form, an Element, a Mod
// and the extra part its ore gives.
function cleanSpells(it) {
  const extra = it.extra !== undefined ? it.extra : frameExtra(it.tier || 1, it.q || 0, !!it.shard, oreOfTier(it.tier || 1).id);
  it.extra = extra;
  it.spells = [0, 1].map((i) => {
    const sp = (Array.isArray(it.spells) && it.spells[i]) || {}, out = emptySpell(extra);
    out.form = cleanSpellCore(sp.form, 'form'); out.el = cleanSpellCore(sp.el, 'el');
    if ('form2' in out) out.form2 = cleanSpellCore(sp.form2, 'form2');
    if ('el2' in out) out.el2 = cleanSpellCore(sp.el2, 'el2');
    for (let k = 0; k < out.mods.length; k++) out.mods[k] = cleanSpellCore((sp.mods || [])[k], 'm' + k);
    return out;
  });
}

// A pick's name from before the cutter, as the cutter's ("Rusty Pick",
// "Ferrite Pick").
function cutterName(name) { return name.replace(/\bRusty Pick\b/, 'Worn Cutter').replace(/\bPick\b/g, 'Cutter'); }

// Drops what this version of the game doesn't know (recipes, affixes,
// cores, powers), so a save can't crash a screen.
function cleanSaveItem(it) {
  if (!it || typeof it !== 'object') return null;
  if (it.kind === 'stone') {
    if (!stoneKind(it.stone)) return null;
    if (it.power && !LEGENDARIES[it.power]) delete it.power;
    // (its bonus is its pattern's, at its tier: the number isn't kept)
    refreshPattern(it);
    it.rarity = it.power ? 'legendary' : 'common';
    delete it.temperChoice;
    return it;
  }
  // (modules are gone: migrateCoreSave turned them into threads and cores)
  if (it.kind === 'module') return null;
  if (!KIND_SLOT[it.kind] && it.kind !== 'relic') return null;
  if (it.kind === 'pick' && typeof it.name === 'string') it.name = cutterName(it.name);
  if (it.bp && !BLUEPRINTS[it.bp]) delete it.bp;
  if (Array.isArray(it.affixes)) it.affixes = it.affixes.filter((a) => a && AFFIXES[a.id]);
  delete it.sockets;
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
  // (its spells sized for the rig of version 7: a Mod slot, two from
  // Resonite up; the extra part comes with version 8)
  const n = (it.tier || 1) >= T.circuits.rig.extraTier || (it.q || 0) >= 3 ? 'glyph' : null;
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
  // then modules into threads and legendary cores, frames with their extra part
  migrateCoreSave(s);
  // then cores as their names: no rolled bonus, no threads, every tool made (patterns.js)
  migratePatternSave(s);
  s.blueprints = (s.blueprints || []).filter((id) => BLUEPRINTS[id]);
  s.studied = (s.studied || []).filter((id) => RESEARCH.some((r) => r.id === id));
  // (a slot this version doesn't wear: what's in it goes to the stash)
  s.items = s.items || [];
  for (const k of Object.keys(s.equip)) if (!SLOTS.includes(k)) { if (s.equip[k]) s.items.push(s.equip[k]); delete s.equip[k]; }
  s.items = s.items.map(cleanSaveItem).filter(Boolean);
  if (s.run && Array.isArray(s.run.items)) for (const x of s.run.items) if (x && x.kind === 'pick' && typeof x.name === 'string') x.name = cutterName(x.name);
  for (const k of Object.keys(s.equip)) s.equip[k] = cleanSaveItem(s.equip[k]);
  if (!s.stash || typeof s.stash !== 'object') s.stash = {};
  // (a Deep Satchel, gone, comes back as what it cost)
  if ((s.tools || []).includes('satchel')) { s.stash.lumenite = (s.stash.lumenite || 0) + 8; s.stash[partId('chitin', 1)] = (s.stash[partId('chitin', 1)] || 0) + 4; }
  s.tools = (s.tools || []).filter((id) => TOOLS[id]);
  if (!s.tools.includes('compass')) s.tools.unshift('compass');
  delete s.tool;
  if (!s.scans || typeof s.scans !== 'object') s.scans = {};
  // the lean rules (above)
  cleanLeanSave(s);
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
      v: 8, uid: 100, crafts: 0, dives: 0, star: 0, magSeen: 1,
      stash: {}, items: [], equip: startingGear(),
      attune: {}, tips: {}, settings: { haptics: true }, world: null, lastSpire: 0,
      // the recipes known (by their old name), what the forge has studied,
      // and how many cores have ever been caught
      blueprints: BP_IDS.filter((id) => BLUEPRINTS[id].start), studied: [], coresFound: 0,
      tools: ['compass'], scans: {}, natures: {}, resCodex: { kindling: [0, 1, 2] },
      // the star's points are light (deeds.js; an older save's are rescaled),
      // what's been found, the pack a fall left, and the supplies carried
      starScale: T.star.scale, found: {}, cache: null, supplies: {},
      // the outpost's buildings (structures.js; landing: the one still to
      // come down to its plot; refineryLv: the Refinery's level once it
      // stands) and Wick's upgrades (wick.js; id: on)
      built: [], landing: null, refineryLv: 1, wickUps: {},
      // what's awake yet, the walkthrough's step and the tutorials seen
      // (onboard.js, tutor.js)
      onboard: { mode: null, guide: null, open: {}, seen: {} },
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
      // what's awake: everything, for a save from before onboarding;
      // otherwise whatever its progress has earned (onboard.js)
      if (typeof Onboard !== 'undefined') Onboard.load(s, raw ? JSON.parse(raw) : null);
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
  // A generator for the next craft or salvage.
  rng() { return new Rng(hashInts(this.data.uid, ++this.data.crafts, 0xf0e)); },
};
