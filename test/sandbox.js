'use strict';
// Loads some of the game's classic scripts into a Node VM context with just
// enough of a browser stubbed in (window, localStorage, a few no-ops) to run
// the pure parts, such as floor generation. Much faster than Chrome, so the
// tests that sweep hundreds of seeds use it.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');

function sandbox(files) {
  const store = new Map();
  const ctx = {
    console, Math, JSON, Date, Map, Set, Uint8Array, Int8Array, Int16Array, Int32Array, Float64Array, Array, Object, Number, String, Boolean, Error,
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), clear: () => store.clear() },
    navigator: { userAgent: 'node' },
    addEventListener() {},
    document: { readyState: 'complete', getElementById: () => null, createElement: () => ({ getContext: () => null }), addEventListener() {} },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  // classic scripts share one global scope: concatenate them so top-level
  // const/let declarations are visible to each other, then expose what the
  // tests need
  // (the gear's files, in load order, with what they lean on; a few of the
  // game's objects stubbed: nothing here draws or speaks)
  if (files.some((f) => f.endsWith('items.js')) && !files.includes('js/facets.js')) files = files.filter((f) => !f.endsWith('items.js')).concat(['js/world.js', 'js/circuits.js', 'js/blueprints.js', 'js/items.js', 'js/modules.js', 'js/patterns.js', 'js/spectrum.js', 'js/facets.js', 'js/deeds.js', 'js/supplies.js', 'js/save.js']);
  Object.assign(ctx, { Game: { dive: null, realT: 0 }, UI: { acts: {}, toast() {}, speak() {}, tip() {}, redraw() {} }, Story: { say() {}, starTaste() {} }, ART: { ores: {}, exotics: {}, rarity: {}, forms: {}, pal: { star: [] } }, Intro: { on: false, hub: null }, snd() {}, Onboard: undefined });
  delete ctx.Onboard;
  const src = files.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n');
  const expose = '\n;globalThis.__game = { T, Rng, hashInts, generateFloor, floorHash, floorDistances, floorTile, ORE_INDEX, TILE_FLOOR, TILE_ROCK, TILE_ORE, TILE_EDGE, TILE_PAD, TILE_PORTAL, TILE_SOLID, TILE,'
    + (files.some((f) => f.endsWith('items.js')) ? ' AFFIXES, LEGENDARIES, makeBase, makeStone, PATTERNS, PATTERN_KINDS, AFFIX_CORE, eliteCoreFor, patternKnown, patternBonus, scanKill, BLUEPRINTS, baseStats, spellGroup, spellCost, spellLine, spellName, spellCores, spellParts, spellResonance, groupCost, stoneKind, RESONANCES, CIRCUIT_FORMS, CIRCUIT_ELEMENTS, CIRCUIT_GLYPHS, computeStats, magnitudeOf, attunePointsLeft, fmtAffix, rigCores, SLOTS, Save, cleanSave,'
      + ' BANDS, bandOf, bandGiven, bandDepth, bandDepthOf, bandMark, bandAtMark, bandGateOre, giveOre, spectrumComplete, SHAPE_ORDER, SHAPE_START, BAND_ELEMENT, facetsState, facetValid, facetTier, facetExtraSlots, bandsCastable, shapesKnown, modsKnown, legendsKnown, extraFacets, facetFacedBy, learnShape, learnMod, learnLegend, learnFromElite, shownBands, specBands, umbraSeen, umbraFacetsOpen, facetText, NIGHTGLASS, UMBRA_FACETS, nextShapeToLearn, nextLegendToLearn, faceSet, facetRig, facetPick, facetArmor, facetsApply, cutPower, senseOpen, wickLent, wickOff, wickToggle, migrateFacetSave, LIGHT_KINDS, LIGHT_IDS,' : '')
    + (files.some((f) => f.endsWith('world.js')) ? ' worldLayout, generateTerritory, territoryHash, territorySeed, deepSeed,' : '')
    + (files.some((f) => f.endsWith('lattice.js')) ? ' latticeLayout, generateGallery, galleryHash, latticeSeed,' : '')
    + ' };';
  vm.runInContext(src + expose, ctx, { filename: 'lodestar-sandbox.js' });
  return ctx.__game;
}

module.exports = { sandbox, ROOT };
