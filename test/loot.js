'use strict';
// The star's facets, without a browser (facets.js, spectrum.js). A fresh
// save lands with the Arc and the Bolt in the Iron band; the Splinter it
// builds is a rig with two spells the combat code can read at every
// magnitude, every band depth and every facet faced, costing and naming
// without a gap, within the caps; a cast's extra facets open with the
// magnitude; a facet faced in one cast moves when faced in the other; the
// star learns Shapes in order from the Deeps and from elites what their
// natures name, and never twice; the cutter's power is the magnitude; the bands' depths follow their thresholds and gate the lands; old
// saves (test/fixtures: before modules, before the rig, with modules) come
// in as facets with their Forms and Mods known, their rig's spells faced,
// their parts and exotics turned to ore and nothing of the gear left; and
// the star's magnitudes. The cutter's power is the magnitude.
const fs = require('fs');
const path = require('path');
const { sandbox } = require('./sandbox');
const { finish } = require('./lib-node');

const G = sandbox(['js/util.js', 'js/tuning.js', 'js/floor.js', 'js/items.js']);
const failures = [];
const fail = (m) => { if (failures.length < 100) failures.push(m); };
const bad = (s) => /NaN|undefined|\[object/.test(s);
const fresh = () => { G.Save.data = G.Save.fresh(); G.cleanSave(G.Save.data); return G.Save.data; };

// --- a fresh star ---------------------------------------------------------------
{
  const s = fresh(), F = s.facets;
  if (!F || F.shapes.join() !== 'arc,bolt' || F.mods.length || F.legends.length) fail(`a fresh star knows ${JSON.stringify(F)}`);
  if (!s.equip.main || !s.equip.main.facet || s.equip.main.spells.length !== 2) fail('a fresh save wears no Splinter');
  if (G.spellName(s.equip.main.spells[0]) !== 'ARC · FORCE' || G.spellName(s.equip.main.spells[1]) !== 'BOLT · FORCE') fail(`a fresh star casts ${s.equip.main.spells.map(G.spellName)}`);
  if (G.cutPower() !== 1 || s.equip.pick.base.power !== 1) fail(`a fresh cutter breaks tier ${G.cutPower()}`);
  if ((s.bands || {}).ferrite !== G.T.spectrum.startIron || G.bandDepth('ferrite') !== 1) fail('a fresh star does not know Iron to depth 1');
  if (G.bandsCastable().join() !== 'ferrite') fail(`a fresh star casts in ${G.bandsCastable()}`);
  if (G.facetExtraSlots(1) !== 0 || G.facetExtraSlots(2) !== 1 || G.facetExtraSlots(4) !== 2 || G.facetExtraSlots(9) !== 2) fail('the extra slots do not open at the magnitudes tuned');
  if (!G.senseOpen('compass') || G.senseOpen('oresense') || G.senseOpen('radar')) fail('a fresh star senses more than the compass');
}

// --- the Splinter at every magnitude, depth and facet -------------------------------
for (let mag = 1; mag <= 8; mag++) {
  const s = fresh();
  s.star = G.T.star.levels[Math.min(mag, G.T.star.levels.length) - 1];
  for (const o of G.T.ores) s.bands[o.id] = G.T.spectrum.depths[Math.min(mag, 5)];
  for (const id of G.SHAPE_ORDER) G.learnShape(id);
  for (const id of Object.keys(G.CIRCUIT_GLYPHS)) G.learnMod(id);
  for (const id of Object.keys(G.LEGENDARIES)) G.learnLegend(id);
  for (const k of G.PATTERN_KINDS) s.scans[k] = G.T.patterns.scans;
  const tier = G.facetTier(), slots = G.facetExtraSlots();
  if (tier !== Math.min(mag, G.T.ores.length)) fail(`magnitude ${mag}: tier ${tier}`);
  let n = 0;
  for (const shape of Object.keys(G.CIRCUIT_FORMS)) for (const band of G.bandsCastable()) {
    if (!G.faceSet(0, 'shape', shape) || !G.faceSet(0, 'band', band)) { fail(`magnitude ${mag}: could not face ${shape} in ${band}`); continue; }
    const xs = G.extraFacets(), a = xs[n % xs.length], b = xs[(n * 7 + 3) % xs.length];
    n++;
    G.faceSet(0, 0, a); G.faceSet(0, 1, b);
    const rig = s.equip.main, sp = rig.spells[0];
    if (!sp.form || sp.form.stone !== shape || sp.form.tier !== tier) fail(`magnitude ${mag}: ${shape} faced came out ${JSON.stringify(sp.form)}`);
    if (!sp.el || sp.el.stone !== G.BAND_ELEMENT[band] || sp.el.tier !== G.bandDepth(band)) fail(`magnitude ${mag}: ${band} faced came out ${JSON.stringify(sp.el)}`);
    const faced = [a, b].slice(0, slots).filter((x, i, arr) => x && arr.findIndex((y) => y.kind === x.kind && y.id === x.id) === i);
    const mods = faced.filter((x) => x.kind === 'mod').length, reads = faced.filter((x) => x.kind !== 'mod').length;
    if (sp.mods.filter(Boolean).length !== mods) fail(`magnitude ${mag}: ${mods} Turns faced, ${sp.mods.filter(Boolean).length} in the spell`);
    if ((rig.readings || []).length !== reads) fail(`magnitude ${mag}: ${reads} Readings faced, ${(rig.readings || []).length} on the rig`);
    const name = G.spellName(sp), line = G.spellLine(rig, sp).text, cost = G.spellCost(sp);
    if (bad(name) || bad(line) || !(cost > 0)) fail(`magnitude ${mag}: ${shape} of ${band}: "${name}" / "${line}" / ${cost}`);
    const st = G.computeStats(s.equip, s.attune);
    for (const k in G.T.caps) if (st[k] > G.T.caps[k]) fail(`magnitude ${mag}: ${k} ${st[k]} over its cap`);
    if (!(st.maxHp > 0) || !(st.maxCharge > 0) || Object.values(st).some((v) => typeof v === 'number' && Number.isNaN(v))) fail(`magnitude ${mag}: stats ${JSON.stringify(st)}`);
    for (const x of faced) if (x.kind === 'reading') { const bonus = G.patternBonus(x.id, tier); if (st[bonus.id] < bonus.v - 1e-6) fail(`magnitude ${mag}: ${x.id}'s Reading is not in the stats`); }
    for (const x of faced) if (x.kind === 'legend' && !st.powers[x.id]) fail(`magnitude ${mag}: ${x.id} faced has no power`);
  }
  if (G.cutPower() !== tier || s.equip.pick.base.power !== tier) fail(`magnitude ${mag}: the cutter breaks tier ${G.cutPower()}`);
  if (s.equip.armor.base.armor <= 0) fail(`magnitude ${mag}: no armour`);
}

// --- facing rules -------------------------------------------------------------------
{
  const s = fresh();
  if (G.faceSet(0, 'shape', 'lance')) fail('an unknown Shape could be faced');
  if (G.faceSet(0, 'band', 'resonite')) fail('an untasted band could be faced');
  if (G.faceSet(0, 'band', 'lumenite')) fail('Lumen could be faced as a cast');
  G.learnMod('quicken');
  if (G.faceSet(0, 0, { kind: 'mod', id: 'quicken' })) fail('an extra facet was faced before its slot opened');
  s.star = G.T.star.levels[1];
  if (!G.faceSet(0, 0, { kind: 'mod', id: 'quicken' })) fail('a Turn could not be faced once its slot opened');
  if (G.faceSet(0, 1, { kind: 'mod', id: 'quicken' })) fail('the second slot opened early');
  if (!G.faceSet(1, 0, { kind: 'mod', id: 'quicken' }) || s.facets.casts[0].extra[0] || !s.facets.casts[1].extra[0]) fail('a facet faced in cast B did not leave cast A');
  if (!G.faceSet(1, 0, null) || s.facets.casts[1].extra[0]) fail('a slot could not be emptied');
  if (G.faceSet(0, 0, { kind: 'reading', id: 'wisp' })) fail('an unread creature was faced');
  s.scans.wisp = G.T.patterns.scans;
  if (!G.faceSet(0, 0, { kind: 'reading', id: 'wisp' })) fail('a read creature could not be faced');
  if (G.faceSet(0, 0, { kind: 'legend', id: 'echo' })) fail('old light the star never had was faced');
}

// --- learning ------------------------------------------------------------------------
{
  const s = fresh();
  const order = [];
  for (let i = 0; i < 10; i++) { const id = G.nextShapeToLearn(); if (!id) break; G.learnShape(id); order.push(id); }
  if (order.join() !== G.SHAPE_ORDER.join()) fail(`the Shapes were learned ${order}`);
  if (G.learnShape('arc') || G.learnShape('lance')) fail('a Shape was learned twice');
  if (G.nextShapeToLearn() !== null) fail('a Shape is left to learn after all of them');
  const t = fresh(), taught = new Set(G.SHAPE_START);
  for (const [affix, stone] of Object.entries(G.AFFIX_CORE)) {
    const e = { type: 'crawler', elite: affix, affixes: [affix] }, got = G.learnFromElite(e), known = taught.has(stone);
    if (G.CIRCUIT_FORMS[stone]) { if (known ? got : !(got && got.shape === stone) || !t.facets.shapes.includes(stone)) fail(`${affix} did not teach the ${stone}`); }
    else if (G.CIRCUIT_GLYPHS[stone]) { if (known ? got : !(got && got.mod === stone) || !t.facets.mods.includes(stone)) fail(`${affix} did not teach ${stone}`); }
    else if (got) fail(`${affix} taught ${JSON.stringify(got)}: an Element is a band`);
    taught.add(stone);
    if (G.learnFromElite(e)) fail(`${affix} taught twice`);
  }
  const u = fresh(), rng = new G.Rng(7), seen = new Set();
  for (let i = 0; i < 10; i++) { const lg = G.nextLegendToLearn(rng); if (!lg) break; if (!G.LEGENDARIES[lg] || seen.has(lg)) fail(`old light ${lg} came twice or is nothing`); seen.add(lg); G.learnLegend(lg); }
  if (seen.size !== Object.keys(G.LEGENDARIES).length || G.nextLegendToLearn(rng)) fail('the old light was not all learned, once each');
}

// --- the Spectrum ---------------------------------------------------------------------
{
  const s = fresh(), D = G.T.spectrum.depths;
  for (let n = 0; n <= D[D.length - 1] + 10; n++) { const want = D.filter((d) => n >= d).length - 1; if (G.bandDepthOf(n) !== want) fail(`${n} ore is depth ${G.bandDepthOf(n)}, not ${want}`); }
  s.stash.resonite = D[1] + 2;
  const gave = G.giveOre('resonite', 999);
  if (gave !== D[1] + 2 || s.stash.resonite || G.bandDepth('resonite') !== 1 || !G.bandsCastable().includes('resonite')) fail(`giving Resonite: ${gave}, depth ${G.bandDepth('resonite')}`);
  if (G.giveOre('resonite', 1) !== 0) fail('ore was given from an empty stash');
  if (!G.senseOpen('radar') || G.senseOpen('lens')) fail('the Chord band at depth 1 did not open the radar alone');
  const L = G.worldLayout(5);
  for (const t of L.terrs) {
    const ore = G.bandGateOre(t), biome = G.T.biomes[t.biome].id;
    const want = t.home ? null : t.edge ? 'starmetal' : biome === 'choir' ? 'resonite' : biome === 'underforge' ? 'sigilite' : null;
    if (ore !== want) fail(`${t.name} (${biome}, ring ${t.ring}) is gated by ${ore}`);
  }
  if (G.spectrumComplete()) fail('a fresh star is whole');
  for (const o of G.T.ores) s.bands[o.id] = D[G.bandMark()];
  if (!G.spectrumComplete()) fail('every band at the mark is not whole');
  // the seventh band: hidden until night-glass is carried, never part of
  // the spec, its facets opening with its depth
  if (G.shownBands().length !== 6 || G.specBands().length !== 6 || G.BANDS.length !== 7) fail(`${G.shownBands().length} bands shown of ${G.BANDS.length}`);
  s.stash.nightglass = D[2];
  if (G.shownBands().length !== 7 || !G.umbraSeen()) fail('night-glass in the stash did not show the seventh band');
  if (G.giveOre('nightglass', 999) !== D[2] || G.bandDepth('nightglass') !== 2 || !G.spectrumComplete()) fail(`giving night-glass: depth ${G.bandDepth('nightglass')}, whole ${G.spectrumComplete()}`);
  if (G.umbraFacetsOpen().join() !== 'draw,snare') fail(`Umbra at depth 2 opens ${G.umbraFacetsOpen()}`);
  s.star = G.T.star.levels[1];
  if (!G.faceSet(0, 0, { kind: 'umbra', id: 'draw' }) || G.faceSet(0, 0, { kind: 'umbra', id: 'veil' })) fail('Umbra\'s facets did not face by their depth');
  const stU = G.computeStats(s.equip, s.attune);
  if (!(stU.leech > 0)) fail('Draw faced is not in the stats');
  if (bad(G.facetText({ kind: 'umbra', id: 'draw' }))) fail('Draw has no words');
}

// --- old saves --------------------------------------------------------------------------
for (const f of fs.readdirSync(path.join(__dirname, 'fixtures')).filter((x) => x.endsWith('.json'))) {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8'));
  const s = Object.assign(G.Save.fresh(), raw);
  G.Save.data = s;
  try { G.cleanSave(s); } catch (e) { fail(`${f}: cleanSave threw ${e.message}`); continue; }
  const F = s.facets;
  if (!F || !F.shapes.includes('arc') || !F.shapes.includes('bolt') || F.casts.length !== 2) fail(`${f}: no facets (${JSON.stringify(F)})`);
  for (const c of F.casts) if (!F.shapes.includes(c.shape) || !G.bandsCastable().includes(c.band)) fail(`${f}: a cast faces what the star hasn't (${JSON.stringify(c)})`);
  for (const k of ['items', 'blueprints', 'studied', 'built', 'landing', 'refineryLv', 'wickUps', 'tools', 'coresFound', 'crafts']) if (k in s && k !== 'crafts') fail(`${f}: ${k} is still in the save`);
  for (const k of Object.keys(s.stash)) if (!(G.ORE_INDEX.hasOwnProperty(k) || G.LIGHT_KINDS[k])) fail(`${f}: ${k} is still in the stash`);
  if (!s.equip.main || !s.equip.main.facet || !s.equip.pick || !s.equip.pick.facet) fail(`${f}: the gear worn is not the Splinter`);
  const st = G.computeStats(s.equip, s.attune);
  if (!(st.maxHp > 0) || Object.values(st).some((v) => typeof v === 'number' && Number.isNaN(v))) fail(`${f}: stats ${JSON.stringify(st)}`);
  if ((s.bands || {}).ferrite < G.T.spectrum.startIron) fail(`${f}: no Iron`);
  // what the old rig cast in is a band the star has tasted
  const old = (raw.equip && raw.equip.main && raw.equip.main.spells) || [];
  for (const sp of old) { const el = sp && sp.el && sp.el.stone; const band = el && Object.keys(G.BAND_ELEMENT).find((o) => G.BAND_ELEMENT[o] === el); if (band && G.bandDepth(band) < 1) fail(`${f}: the old rig's ${el} band is untasted`); }
  // every Form and Mod the old save held is known
  const held = [];
  const take = (c) => { if (c && c.kind === 'stone') held.push(c.stone); };
  for (const sp of old) for (const c of [sp.form, sp.form2, sp.el, sp.el2].concat(sp.mods || [])) take(c);
  for (const it of raw.items || []) { take(it); for (const sp of it.spells || []) for (const c of [sp.form, sp.form2, sp.el, sp.el2].concat(sp.mods || [])) take(c); }
  for (const id of held) if (G.CIRCUIT_FORMS[id] && !F.shapes.includes(id)) fail(`${f}: the ${id} held was not learned`); else if (G.CIRCUIT_GLYPHS[id] && !F.mods.includes(id)) fail(`${f}: ${id} held was not learned`);
}

// --- the star's magnitudes --------------------------------------------------------------
{
  const L = G.T.star.levels;
  L.forEach((need, i) => { if (G.magnitudeOf(need) !== i + 1 || (need > 0 && G.magnitudeOf(need - 1) !== i)) fail(`magnitude at ${need} light is ${G.magnitudeOf(need)}`); });
  const s = fresh();
  s.star = L[3]; s.attune = {};
  if (G.attunePointsLeft(s) !== 3) fail(`magnitude 4 leaves ${G.attunePointsLeft(s)} attunement points`);
}

finish('loot', failures);
