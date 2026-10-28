'use strict';
// ---------------------------------------------------------------------------
// Small helpers shared by every file: the DOM shortcut, error capture, seeded
// random numbers, maths, colours and offscreen canvases. Every file is a
// classic script sharing one global scope; this one loads first.
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);

// Errors that escape (a script that fails as it loads, a promise nobody
// caught), counted from the first script on so the tests can see them.
const ScriptErrors = [];
window.addEventListener('error', (ev) => { ScriptErrors.push({ msg: String(ev.message || ev.error || ev), at: Date.now() }); });
window.addEventListener('unhandledrejection', (ev) => { ScriptErrors.push({ msg: 'unhandled: ' + String(ev.reason && ev.reason.message || ev.reason), at: Date.now() }); });

const TILE = 16;

// ---------------------------------------------------------------------------
// Seeded randomness, math and colors: Tycho's core (vendor/tycho/dist/
// tycho.js, loaded first), the same functions this file used to hold, bit for
// bit. Anything generated from a run's seed (floors, ore, loot, combat rolls)
// draws from an Rng, never Math.random, so a seed always rebuilds the same
// floor and the tests can pin it. FX_R is for cosmetic randomness that never
// touches game state (rain, sparks).
// ---------------------------------------------------------------------------
const { mulberry32, hashInts, hashString, Rng } = Tycho.seed;
const FX_R = Tycho.seed.fxRand;
const { clamp, lerp, dist, dist2, angleTo, approach } = Tycho.math;
const fmtTime = (s) => { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const pct = (x) => Math.round(x * 100) + '%';
const sign = (x) => (x > 0 ? '+' : x < 0 ? '−' : '');

// ---------------------------------------------------------------------------
// Colors (Tycho's): hex to [r, g, b] and back, darker or lighter, mixed
// ---------------------------------------------------------------------------
const { hexToRgb, rgbToHex, shade, mix } = Tycho.color;

// ---------------------------------------------------------------------------
// Canvases and sprites (Tycho's sprite part, the same functions this file
// used to hold, bit for bit): every canvas is kept in memory (a picture is
// built once, then copied to the GPU's atlas or drawn, and a canvas the GPU
// rasterises costs a wait each time it's read) and at least a pixel square.
// ---------------------------------------------------------------------------
const LS_CANVAS = { read: true, min: 1 };
function makeCanvas(w, h) { return Tycho.sprite.canvas(w, h, LS_CANVAS); }
// Renders a list of strings into a canvas using a palette map. '.' and ' '
// are transparent.
function spriteFrom(rows, pal) { return Tycho.sprite.spriteFrom(rows, pal, LS_CANVAS); }
// A 1px outline round every opaque pixel, in one ink colour. The canvas grows
// by a pixel each side so the outline is never clipped.
function outlined(src, ink = '#000000') { return Tycho.sprite.outline(src, { ink }); }
// A copy of a sprite with every opaque pixel one colour (hit flashes,
// silhouettes, elite rims).
function tinted(src, col) { return Tycho.sprite.tinted(src, col, LS_CANVAS); }
function flipped(src) { return Tycho.sprite.flipped(src, LS_CANVAS); }

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Haptics where the browser has them (not iOS Safari); quiet everywhere else.
function buzz(ms) {
  try { if (typeof Save !== 'undefined' && Save.data.settings.haptics && navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* not supported */ }
}

// Today's date as YYYY-MM-DD in the player's own calendar.
function todayKey(d = new Date()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
