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
    console, Math, JSON, Date, Map, Set, Uint8Array, Int16Array, Array, Object, Number, String, Boolean, Error,
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
  if (files.some((f) => f.endsWith('items.js')) && !files.includes('js/blueprints.js')) files = files.slice(0, -1).concat(['js/blueprints.js', files[files.length - 1]]);
  const src = files.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n');
  const expose = '\n;globalThis.__game = { T, Rng, hashInts, generateFloor, floorHash, floorDistances, floorTile, ORE_INDEX, TILE_FLOOR, TILE_ROCK, TILE_ORE, TILE_EDGE, TILE_PAD, TILE_PORTAL, TILE_SOLID, TILE,'
    + (files.some((f) => f.endsWith('items.js')) ? ' AFFIXES, KIND_FAMILIES, LEGENDARIES, SETS, CORES, RARITIES, makeItem, makeCore, makeRelic, rollRarity, unsealRelic, BLUEPRINTS, BP_IDS, PARTS, PART_STACK_IDS, parsePart, partId, bindsWith, ELEMENTS, BLUEPRINT_BIOME, forgeItem, rerollAffix, upgradeAffix, addAffix, salvageYield, computeStats, startingGear, magnitudeOf, attunePointsLeft, biomeOpen, fmtAffix, itemBaseLine, itemWorth, compareLines, affixRoll,' : '')
    + ' };';
  vm.runInContext(src + expose, ctx, { filename: 'lodestar-sandbox.js' });
  return ctx.__game;
}

module.exports = { sandbox, ROOT };
