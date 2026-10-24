'use strict';
// ---------------------------------------------------------------------------
// The save, in localStorage. One object: the star (its light, magnitude
// and attunements), the Spectrum (ore given), the facets faced, the stash
// of ore and light, the world and what's been done to each territory, the
// sortie under way, what's been found, the pack a fall left, the supplies,
// the story's said lines and the onboarding. An older save (with a rig, a
// stash of gear and cores, buildings, tools made) is turned into facets
// (facets.js migrateFacetSave) and its parts and exotics into ore.
// ---------------------------------------------------------------------------
const SAVE_KEY = 'lodestar.save.v4';
const SAVE_OLD = ['lodestar.save.v3', 'lodestar.save.v2'];

function cleanSave(s) {
  if (!s.stash || typeof s.stash !== 'object') s.stash = {};
  // the rig, the stash of gear and the cores into facets; parts and
  // exotics into ore
  migrateFacetSave(s);
  for (const k of Object.keys(s.stash)) { const n = Math.floor(Number(s.stash[k]) || 0); if (!(ORE_INDEX.hasOwnProperty(k) || LIGHT_KINDS[k] || k === NIGHTGLASS) || n <= 0) delete s.stash[k]; else s.stash[k] = n; }
  s.scans = surveyScans(s.scans && typeof s.scans === 'object' ? s.scans : {});
  // the lean rules (below)
  cleanLeanSave(s);
  // what Wick knows of each kind's nature, and the resonances' Codex
  if (!s.natures || typeof s.natures !== 'object') s.natures = {};
  if (!s.resCodex || typeof s.resCodex !== 'object') s.resCodex = { kindling: [0, 1, 2] };
  for (const id of Object.keys(s.resCodex)) { const r = RESONANCES.find((x) => x.id === id); if (!r || !Array.isArray(s.resCodex[id])) delete s.resCodex[id]; else s.resCodex[id] = s.resCodex[id].filter((i) => Number.isInteger(i) && i >= 0 && i < r.parts.length); }
  // the Spectrum: ore given, by kind (none in an older save: the star knows
  // Iron, and the band of any land already kindled, so nothing kindled is
  // dark to it); the colony never comes down early any more
  const bands = s.bands && typeof s.bands === 'object' ? s.bands : {};
  s.bands = {};
  for (const o of T.ores) if (Number.isFinite(bands[o.id]) && bands[o.id] > 0) s.bands[o.id] = Math.floor(bands[o.id]);
  s.bands.ferrite = Math.max(s.bands.ferrite || 0, T.spectrum.startIron);
  if (s.world && s.world.territories) {
    const terrs = worldLayout(s.world.seed).terrs;
    for (const id of Object.keys(s.world.territories)) {
      const ts = s.world.territories[id], t = terrs[id], ore = t && ts && ts.state === 'kindled' && !ts.starter ? bandGateOre(t) : null;
      if (ore) s.bands[ore] = Math.max(s.bands[ore] || 0, T.spectrum.depths[1]);
    }
  }
  delete s.landersCalled;
  // the facets, checked, and what's worn built from them
  facetsState();
  facetsApply();
}

function cleanLeanSave(s) {
  if (s.run && Array.isArray(s.run.pocket)) {
    for (const e of s.run.pocket) {
      if (e && e.stuff && e.n > 0 && ORE_INDEX.hasOwnProperty(e.stuff)) s.stash[e.stuff] = (s.stash[e.stuff] || 0) + e.n;
    }
    delete s.run.pocket;
  }
  if (s.run) { delete s.run.items; delete s.run.blueprints; if (s.run.banked) { delete s.run.banked.items; delete s.run.banked.learned; } }
  delete s.contracts; delete s.contractN; delete s.swapped;
  if (!s.attune || typeof s.attune !== 'object') s.attune = {};
  for (const id of Object.keys(s.attune)) if (!T.attune[id]) delete s.attune[id];
  migrateOldSupplies(s);
}

const Save = {
  data: null,
  fresh() {
    return {
      v: 10, uid: 100, dives: 0, star: 0, magSeen: 1,
      stash: {}, equip: {},
      attune: {}, tips: {}, settings: { haptics: true }, world: null, lastSpire: 0,
      // the facets the star knows and faces (facets.js; built on load)
      facets: null,
      scans: surveyScans(), natures: {}, resCodex: { kindling: [0, 1, 2] },
      // the star's points are light (deeds.js; an older save's are rescaled),
      // what's been found, the pack a fall left, and the supplies carried
      starScale: T.star.scale, found: {}, cache: null, supplies: {},
      // the Spectrum (spectrum.js): ore given to the star by kind; the
      // star lands knowing Iron
      bands: { ferrite: T.spectrum.startIron }, oreGiven: 0,
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
      this.data = raw ? Object.assign(this.fresh(), JSON.parse(raw)) : this.fresh();
      // a save from before circuits: a fresh start, said once
      if (!raw && SAVE_OLD.some((k) => localStorage.getItem(k))) this.data.freshStart = true;
      const s = this.data;
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
  // A generator for the next seeded roll at home.
  rng() { this.data.crafts = (this.data.crafts || 0) + 1; return new Rng(hashInts(this.data.uid, this.data.crafts, 0xf0e)); },
};
