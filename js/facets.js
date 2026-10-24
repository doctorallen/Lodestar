'use strict';
// ---------------------------------------------------------------------------
// Facets: the rig is the star. There's no forge, no rig frame, no cores and
// no stash of gear. The star is a crystal with facets, each something it
// has learned from the world, and the Kindler's build is which facets are
// turned to face them (TURN, starui.js). Three kinds:
//   Shapes   how the light is cast: the Forms (circuits.js). The star lands
//            knowing the Arc and the Bolt; it learns the next Shape at each
//            Deep's end (SHAPE_ORDER), and an elite's fall teaches it the
//            Shape its affix names (patterns.js AFFIX_CORE).
//   Bands    what the light does: the Elements, one for each ore the star
//            has tasted (spectrum.js), stronger with the band's depth.
//            Lumen is the light itself and casts nothing.
//   Turns    the Mods: Quicken, Chain, Split… learned from elites.
//   Readings what the suit has read of a creature (patterns.js): its
//            pattern, as a bonus; and the shards of old light a warden or
//            a Keeper leaves, each a power (items.js LEGENDARIES).
// Two casts, each a Shape, a Band and up to two more facets (a Turn or a
// Reading), the extra slots opening with the star's magnitude. Everything
// faced is as strong as the star: a Shape, a Turn or a Reading at the
// star's magnitude, a Band at its depth.
//
// The combat code still reads a rig with spells of cores and an outfit
// (items.js computeStats, circuits.js), so the faced facets are built into
// exactly that each time they change (facetsApply): a synthetic rig, the
// Splinter, with a core for each facet, a cutter whose power is the star's
// magnitude, and (for now) plate at the star's magnitude.
//
// Persisted: Save.data.facets = { shapes, mods, legends, casts, wick }.
// ---------------------------------------------------------------------------

const SHAPE_ORDER = ['lance', 'orb', 'glaive', 'nova', 'well', 'ward'];
const SHAPE_START = ['arc', 'bolt'];
// The Element each band casts in (spectrum.js BANDS; Lumen casts nothing).
const BAND_ELEMENT = { ferrite: 'force', resonite: 'shock', aetherglass: 'frost', sigilite: 'blight', starmetal: 'ember' };
// The seventh band's facets (spectrum.js NIGHTGLASS), of the dark's own
// kind, each opened at a depth of Umbra: Draw (leech), Snare (chill) and
// Veil (the lattice holds in the dark instead of thinning). Faced as
// Readings are. Their bonuses grow with the depth.
const UMBRA_FACETS = {
  draw: { depth: 1, name: 'Draw', text: 'the hits you land heal you', bonus: (d) => ({ id: 'leech', v: 3 + 2 * d }) },
  snare: { depth: 2, name: 'Snare', text: 'your hits chill, as frost does', bonus: (d) => ({ id: 'chill', v: 10 + 5 * d }) },
  veil: { depth: 3, name: 'Veil', text: 'the lattice holds in the dark instead of thinning', bonus: (d) => ({ id: 'darkArmor', v: 15 + 10 * d }) },
};
function umbraFacetsOpen() { const d = bandDepth(NIGHTGLASS); return Object.keys(UMBRA_FACETS).filter((id) => UMBRA_FACETS[id].depth <= d); }
const ELEMENT_BAND = Object.fromEntries(Object.entries(BAND_ELEMENT).map(([o, e]) => [e, o]));

function facetsState() {
  const s = Save.data, F = s.facets && typeof s.facets === 'object' ? s.facets : (s.facets = {});
  if (!Array.isArray(F.shapes)) F.shapes = SHAPE_START.slice();
  for (const id of SHAPE_START) if (!F.shapes.includes(id)) F.shapes.push(id);
  F.shapes = F.shapes.filter((id, i, a) => CIRCUIT_FORMS[id] && a.indexOf(id) === i);
  if (!Array.isArray(F.mods)) F.mods = [];
  F.mods = F.mods.filter((id, i, a) => CIRCUIT_GLYPHS[id] && a.indexOf(id) === i);
  if (!Array.isArray(F.legends)) F.legends = [];
  F.legends = F.legends.filter((id, i, a) => LEGENDARIES[id] && a.indexOf(id) === i);
  if (!Array.isArray(F.casts) || F.casts.length !== 2) F.casts = [{ shape: 'arc', band: 'ferrite', extra: [null, null] }, { shape: 'bolt', band: 'ferrite', extra: [null, null] }];
  if (!F.wick || typeof F.wick !== 'object') F.wick = {};
  for (const c of F.casts) {
    if (!F.shapes.includes(c.shape)) c.shape = F.shapes[0];
    if (!bandsCastable().includes(c.band)) c.band = 'ferrite';
    if (!Array.isArray(c.extra)) c.extra = [null, null];
    while (c.extra.length < 2) c.extra.push(null);
    c.extra = c.extra.slice(0, 2).map((x) => (facetValid(x) ? x : null));
  }
  return F;
}
// An extra facet: { kind: 'mod' | 'reading' | 'legend', id }.
function facetValid(x) {
  if (!x || typeof x !== 'object') return false;
  const F = Save.data.facets || {};
  if (x.kind === 'mod') return (F.mods || []).includes(x.id);
  if (x.kind === 'reading') return patternKnown(x.id);
  if (x.kind === 'legend') return (F.legends || []).includes(x.id);
  if (x.kind === 'umbra') return umbraFacetsOpen().includes(x.id);
  return false;
}
const facetSame = (a, b) => !!a && !!b && a.kind === b.kind && a.id === b.id;

// How strong the star casts: its magnitude, as a tier.
function facetTier() { return clamp(magnitudeOf(Save.data.star), 1, T.ores.length); }
// How many extra facets a cast can face now (T.facets.extraAt: the
// magnitude each slot opens at).
function facetExtraSlots(mag = magnitudeOf(Save.data.star)) { return T.facets.extraAt.filter((m) => mag >= m).length; }
// The bands the star can cast in: tasted to depth 1, and not Lumen.
function bandsCastable() { return T.ores.map((o) => o.id).filter((id) => BAND_ELEMENT[id] && bandDepth(id) >= 1); }
function shapesKnown() { return facetsState().shapes.slice(); }
function modsKnown() { return facetsState().mods.slice(); }
function legendsKnown() { return facetsState().legends.slice(); }
// Every extra facet the star has, as entries.
function extraFacets() {
  return modsKnown().map((id) => ({ kind: 'mod', id })).concat(knownPatterns().map((id) => ({ kind: 'reading', id })), legendsKnown().map((id) => ({ kind: 'legend', id })), umbraFacetsOpen().map((id) => ({ kind: 'umbra', id })));
}
// Is an extra facet faced in some cast already (facets are one of each)?
function facetFacedBy(x) { return facetsState().casts.findIndex((c) => c.extra.some((e) => facetSame(e, x))); }

// Words for a facet, for the screen: its name and what it does.
function facetName(x) {
  if (!x) return 'nothing';
  if (x.kind === 'mod') return CIRCUIT_GLYPHS[x.id].name;
  if (x.kind === 'reading') return PATTERNS[x.id].name;
  if (x.kind === 'legend') return LEGENDARIES[x.id].name;
  if (x.kind === 'umbra') return UMBRA_FACETS[x.id].name;
  return x.id;
}
function facetText(x, tier = facetTier()) {
  if (!x) return 'an empty facet';
  if (x.kind === 'mod') return CIRCUIT_GLYPHS[x.id].text();
  if (x.kind === 'reading') return `${fmtAffix(patternBonus(x.id, tier))} · read from the ${foeWord(x.id)}`;
  if (x.kind === 'legend') return LEGENDARIES[x.id].text + ' · a shard of old light';
  if (x.kind === 'umbra') return `${fmtAffix(UMBRA_FACETS[x.id].bonus(bandDepth(NIGHTGLASS)))} · ${UMBRA_FACETS[x.id].text} · of the seventh band`;
  return '';
}
const shapeName = (id) => CIRCUIT_FORMS[id].name;
const bandName = (ore) => (bandOf(ore) ? bandOf(ore).name : ore);
function bandText(ore) { const el = BAND_ELEMENT[ore]; return el ? `${CIRCUIT_ELEMENTS[el].name}: ${CIRCUIT_ELEMENTS[el].status} · depth ${bandDepth(ore)}` : 'the light itself'; }

// --- learning ----------------------------------------------------------------
// The star learns a Shape: from a Deep's end (the next in order) or an
// elite. True if it was new.
function learnShape(id, why) {
  const F = facetsState();
  if (!CIRCUIT_FORMS[id] || F.shapes.includes(id)) return false;
  F.shapes.push(id);
  Save.saveField('facets');
  UI.toast(`THE STAR LEARNED THE ${shapeName(id).toUpperCase()}${why ? ' · ' + why : ''}`, 'legendary');
  Story.say('firstShape');
  if (typeof snd === 'function') snd('loot', { rarity: 'rare' });
  return true;
}
function nextShapeToLearn() { return SHAPE_ORDER.find((id) => !facetsState().shapes.includes(id)) || null; }
function learnMod(id, why) {
  const F = facetsState();
  if (!CIRCUIT_GLYPHS[id] || F.mods.includes(id)) return false;
  F.mods.push(id);
  Save.saveField('facets');
  UI.toast(`THE STAR LEARNED ${CIRCUIT_GLYPHS[id].name.toUpperCase()}${why ? ' · ' + why : ''}`, 'legendary');
  Story.say('firstMod');
  if (typeof snd === 'function') snd('loot', { rarity: 'rare' });
  return true;
}
// A shard of old light: a legendary power, from a warden or a Keeper.
function learnLegend(id, why) {
  const F = facetsState();
  if (!LEGENDARIES[id] || F.legends.includes(id)) return false;
  F.legends.push(id);
  Save.saveField('facets');
  UI.toast(`A SHARD OF OLD LIGHT: ${LEGENDARIES[id].name.toUpperCase()}${why ? ' · ' + why : ''}`, 'legendary');
  Story.say('firstLegend');
  if (typeof snd === 'function') snd('loot', { rarity: 'legendary' });
  return true;
}
function nextLegendToLearn(rng) { const left = Object.keys(LEGENDARIES).filter((id) => !facetsState().legends.includes(id)); return left.length ? (rng ? rng.pick(left) : left[0]) : null; }
// What an elite's fall teaches: the Shape or the Turn its affix names
// (patterns.js), if the star doesn't have it. Returns what was learned,
// or null.
function learnFromElite(e) {
  const stone = eliteCoreFor(e);
  if (!stone) return null;
  if (CIRCUIT_FORMS[stone]) return learnShape(stone, `read from the ${foeWord(e.type)}`) ? { shape: stone } : null;
  if (CIRCUIT_GLYPHS[stone]) return learnMod(stone, `read from the ${foeWord(e.type)}`) ? { mod: stone } : null;
  return null;
}

// --- facing ------------------------------------------------------------------
// Turns a cast's facet: slot 'shape' (a Form id), 'band' (an ore), or 0/1
// (an extra facet, or null to face none). A facet faced elsewhere moves.
function faceSet(cast, slot, value) {
  const F = facetsState(), c = F.casts[cast];
  if (!c) return false;
  if (slot === 'shape') { if (!F.shapes.includes(value)) return false; c.shape = value; }
  else if (slot === 'band') { if (!bandsCastable().includes(value)) return false; c.band = value; }
  else {
    const i = Number(slot);
    if (!(i >= 0 && i < facetExtraSlots())) return false;
    if (value && !facetValid(value)) return false;
    if (value) for (const o of F.casts) o.extra = o.extra.map((x) => (facetSame(x, value) ? null : x));
    c.extra[i] = value || null;
  }
  facetsApply();
  // a cast whose facets are all one resonance's wakes it: its page in the
  // Codex fills (resonance.js)
  for (const sp of Save.data.equip.main.spells) { const r = spellResonance(sp); if (r) codexFill(r.id); }
  Story.say('firstTurn');
  Save.save();
  if (typeof snd === 'function') snd('tap', {});
  return true;
}

// --- the gear the facets make -------------------------------------------------
// The Splinter: a rig whose two spells hold the faced facets as cores.
function facetRig() {
  const F = facetsState(), tier = facetTier(), slots = facetExtraSlots();
  const rig = makeBase('rig', tier, 0);
  rig.facet = true; rig.name = 'The Splinter'; rig.extra = 'glyph';
  rig.readings = [];
  rig.spells = F.casts.map((c) => {
    const sp = { form: makeStone(c.shape, tier), el: null, mods: [] };
    const el = BAND_ELEMENT[c.band];
    if (el) sp.el = makeStone(el, Math.max(1, bandDepth(c.band)));
    for (let i = 0; i < slots; i++) {
      const x = c.extra[i];
      if (!x) continue;
      if (x.kind === 'mod') sp.mods.push(makeStone(x.id, tier));
      else if (x.kind === 'reading') rig.readings.push({ kind: 'stone', stone: 'reading', tier, bonus: patternBonus(x.id, tier), pattern: x.id, name: PATTERNS[x.id].name });
      else if (x.kind === 'legend') rig.readings.push({ kind: 'stone', stone: 'legend', tier, bonus: null, power: x.id, name: LEGENDARIES[x.id].name });
      else if (x.kind === 'umbra') rig.readings.push({ kind: 'stone', stone: 'umbra', tier, bonus: UMBRA_FACETS[x.id].bonus(bandDepth(NIGHTGLASS)), name: UMBRA_FACETS[x.id].name });
    }
    while (sp.mods.length < 2) sp.mods.push(null);
    return sp;
  });
  return rig;
}
// The cutter: the splinter cuts ore of the star's magnitude as a tier
// (Ferrite at 1, Lumenite at 2, Resonite at 3 as ring 2 opens, Sigilite at
// 5 as ring 3 does, Starmetal at 6).
function facetPick() { const p = makeBase('pick', facetTier() - 1, 0); p.facet = true; p.name = 'The Splinter'; return p; }
// The plate: the lattice, as strong as the star for now (the Splinter's
// light is next: armour from the light meter).
function facetArmor() { const a = makeBase('plate', facetTier(), 0); a.facet = true; a.name = 'The lattice'; return a; }
// What's worn, from the facets: built again whenever they change, the star
// grows or a band deepens.
function facetsApply() {
  const s = Save.data;
  if (!s) return;
  s.equip = { main: facetRig(), pick: facetPick(), armor: facetArmor(), charm: null };
  if (Game.dive && Game.dive.stats) refreshDiveStats();
}
// The cutter's power now (what tier of ore it breaks).
function cutPower() { return facetTier(); }
// The Splinter: how much of the lattice is there (0-1), by your light. At
// home and in kindled land all of it; in the dark it thins with the light
// meter, to T.splinter.floor with the light gone. Armour is light.
function latticeK(d) {
  if (!d || d.hub) return 1;
  // (the Veil, of the seventh band: the floor rises; a pocket of planted
  // light counts as light: field.js)
  const floor = Math.min(1, T.splinter.floor + ((d.stats && d.stats.darkArmor) || 0) / 100);
  if (typeof inPocket === 'function' && inPocket(d)) return 1;
  return lerp(floor, 1, clamp(d.pull, 0, 1));
}

// --- the senses and Wick -------------------------------------------------------
// The tools are the star's senses, each opened by a band's depth
// (T.tools[id].band: [ore, depth]); the Compass is the splinter itself.
function senseOpen(id) {
  const t = T.tools[id];
  if (!t || !t.band) return true;
  return bandDepth(t.band[0]) >= t.band[1];
}
// Wick's upgrades are facets the star lends him, each from a magnitude
// (T.wickUp[id].mag), on unless turned off at TURN.
function wickLent(id) { return magnitudeOf(Save.data.star) >= T.wickUp[id].mag; }
function wickOff(id) { return facetsState().wick[id] === false; }
function wickToggle(id) { const F = facetsState(); if (!wickLent(id)) return false; F.wick[id] = wickOff(id) ? true : false; Save.save(); return true; }

// --- an older save ---------------------------------------------------------------
// A save with a rig, a stash of gear and cores: every Form and Mod it ever
// held becomes a facet the star knows, the rig's faced spells stay as
// faced, each legendary power kept, the Wick upgrades fitted kept on; the
// items go, and the parts and exotics in the stash become ore of their
// grade. The star's Iron is known regardless (spectrum.js).
function migrateFacetSave(s) {
  if (s.facets && typeof s.facets === 'object' && Array.isArray(s.facets.casts)) return;
  const shapes = SHAPE_START.slice(), mods = [], legends = [];
  const take = (c) => { if (!c || c.kind !== 'stone') return; if (CIRCUIT_FORMS[c.stone] && !shapes.includes(c.stone)) shapes.push(c.stone); if (CIRCUIT_GLYPHS[c.stone] && !mods.includes(c.stone)) mods.push(c.stone); if (c.power && LEGENDARIES[c.power] && !legends.includes(c.power)) legends.push(c.power); };
  const spells = (it) => (it && Array.isArray(it.spells) ? it.spells : []);
  const rig = s.equip && s.equip.main;
  for (const sp of spells(rig)) for (const c of [sp.form, sp.form2, sp.el, sp.el2].concat(sp.mods || [])) take(c);
  for (const it of s.items || []) { take(it); for (const sp of spells(it)) for (const c of [sp.form, sp.form2, sp.el, sp.el2].concat(sp.mods || [])) take(c); }
  const casts = [0, 1].map((i) => {
    const sp = spells(rig)[i], shape = sp && sp.form && CIRCUIT_FORMS[sp.form.stone] ? sp.form.stone : SHAPE_START[i];
    const el = sp && sp.el && sp.el.stone, band = el && ELEMENT_BAND[el] ? ELEMENT_BAND[el] : 'ferrite';
    const extra = (sp && sp.mods ? sp.mods : []).filter((m) => m && CIRCUIT_GLYPHS[m.stone]).slice(0, 2).map((m) => ({ kind: 'mod', id: m.stone }));
    while (extra.length < 2) extra.push(null);
    return { shape, band, extra };
  });
  const wick = {};
  for (const id of Object.keys(s.wickUps || {})) if (s.wickUps[id] === false) wick[id] = false;
  s.facets = { shapes, mods, legends, casts, wick };
  // a band the rig cast in is tasted, so the cast still works
  s.bands = s.bands || {};
  for (const c of casts) if (c.band !== 'ferrite') s.bands[c.band] = Math.max(s.bands[c.band] || 0, T.spectrum.depths[1]);
  // parts and exotics become ore: a part its grade's first ore, an exotic
  // two of the third
  const st = s.stash || (s.stash = {});
  for (const k of Object.keys(st)) {
    if (k === NIGHTGLASS) continue;
    const m = /^([a-z]+)([123])$/.exec(k);
    if (m && !ORE_INDEX.hasOwnProperty(k) && !LIGHT_KINDS[k]) { const ore = T.biomes[Number(m[2]) - 1].ores[0]; st[ore] = (st[ore] || 0) + st[k]; delete st[k]; continue; }
    if (!ORE_INDEX.hasOwnProperty(k) && !LIGHT_KINDS[k]) { st.resonite = (st.resonite || 0) + 2 * st[k]; delete st[k]; }
  }
  for (const k of ['items', 'blueprints', 'studied', 'crafts', 'coresFound', 'built', 'landing', 'refineryLv', 'wickUps', 'tools', 'tool']) delete s[k];
}
