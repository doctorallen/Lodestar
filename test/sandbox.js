'use strict';
// Loads some of the game's classic scripts into a Node VM context with just
// enough of a browser stubbed in (window, localStorage, a few no-ops) to run
// the pure parts, such as floor generation (and, for test/traces.js, the
// walking in game.js; `extra` names more of their globals to hand back).
// Much faster than Chrome, so the tests that sweep hundreds of seeds use it.
// gameSandbox loads the whole game the same way, for test/fights.js.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');

function sandbox(files, extra = []) {
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
  Object.assign(ctx, { Game: { dive: null, realT: 0 }, UI: { acts: {}, toast() {}, speak() {}, tip() {}, redraw() {} }, Story: { say() {}, starTaste() {} }, ART: { ores: {}, exotics: {}, rarity: {}, forms: {}, pal: { star: [] } }, Intro: { on: false, hub: null }, snd() {} });
  // (Tycho, the engine, first, as index.html loads it)
  const src = ['vendor/tycho/dist/tycho.js'].concat(files).map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n');
  const expose = '\n;globalThis.__game = { T, Rng, hashInts, generateFloor, floorHash, floorDistances, floorTile, ORE_INDEX, TILE_FLOOR, TILE_ROCK, TILE_ORE, TILE_EDGE, TILE_PAD, TILE_PORTAL, TILE_SOLID, TILE,'
    + extra.map((n) => ' ' + n + ',').join('') + ' };';
  vm.runInContext(src + expose, ctx, { filename: 'lodestar-sandbox.js' });
  return ctx.__game;
}

// The whole game, every script index.html names in its order, in a Node VM
// with a stand-in for the page: a document whose every element is a thing
// that takes any call and any field and answers nothing, and canvases
// whose 2D contexts are the same but for their pixels (image data of the
// right size, all clear, so what paints into a buffer can); nothing is drawn and the page never boots (its readyState is
// 'loading'), so the test builds what it plays itself. Math.random is the
// test's (`random`, a function the test may swap), and Date.now and
// performance.now hold still, so a run of the game here goes the same way
// every time. Returns the context: the game's globals, for runInContext.
function gameSandbox({ random = () => 0.5, now = 1767225600000 } = {}) {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const files = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
  // a thing that is anything: callable, constructible, every field another
  // such thing, iterating as nothing, a number as 0
  const thing = () => {
    const f = function () { return thing(); };
    return new Proxy(f, {
      get(t, k) {
        if (k === Symbol.toPrimitive) return () => 0;
        if (k === Symbol.iterator) return function* () {};
        if (k === 'then') return undefined;
        if (k === 'length') return 0;
        if (Object.prototype.hasOwnProperty.call(t, k) && k !== 'name' && k !== 'prototype') return t[k];
        return (t[k] = thing());
      },
      set(t, k, v) { t[k] = v; return true; },
      construct() { return thing(); },
    });
  };
  const store = new Map();
  const R = { random };
  const M = Object.create(Math);
  M.random = () => R.random();
  class FixedDate extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } }
  const ImageData = class { constructor(d, w, h) { if (typeof d === 'number') { h = w; w = d; d = new Uint8ClampedArray(Math.max(0, w * h * 4)); } this.data = d; this.width = w; this.height = h; } };
  const canvas = () => {
    const c = thing();
    c.width = 1; c.height = 1;
    const x = thing();
    x.canvas = c;
    x.createImageData = (w, h) => (typeof w === 'object' ? new ImageData(w.width, w.height) : new ImageData(w, h));
    x.getImageData = (_x, _y, w, h) => new ImageData(w, h);
    x.measureText = () => ({ width: 0 });
    c.getContext = () => x;
    return c;
  };
  const document = thing();
  document.readyState = 'loading';
  document.createElement = (tag) => (String(tag).toLowerCase() === 'canvas' ? canvas() : thing());
  const ctx = {
    console, Math: M, JSON, Date: FixedDate, Map, Set, WeakMap, WeakSet, Promise, Symbol, Proxy, Reflect,
    Uint8Array, Uint8ClampedArray, Int8Array, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array, ArrayBuffer, DataView,
    Array, Object, Number, String, Boolean, Error, TypeError, RangeError, RegExp, parseInt, parseFloat, isFinite, isNaN,
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    performance: { now: () => 0 },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), clear: () => store.clear(), key: () => null, get length() { return store.size; } },
    btoa, atob, navigator: { userAgent: 'node' }, location: { search: '', hash: '', href: 'file:///lodestar/index.html', reload() {} },
    addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    innerWidth: 390, innerHeight: 844, devicePixelRatio: 1,
    document, ImageData, Image: class {},
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  const src = files.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n');
  vm.runInContext(src, ctx, { filename: 'lodestar-game.js' });
  ctx.__rand = R;
  return ctx;
}

module.exports = { sandbox, gameSandbox, ROOT };
