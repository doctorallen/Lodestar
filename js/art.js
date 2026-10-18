'use strict';
// ---------------------------------------------------------------------------
// The art: "Glow + Detail", drawn to the A+ rules (DECISIONS.md; every knob
// in T.art). Darkness where only magitech gives off light (the helmet lamp,
// ore glints, runes, fungus, the lodeline). A material has at most a few
// tones on any one thing, chosen by its form lit from the top left, from a
// ramp whose shadows lean violet and lights warm gold. Texture comes in
// clusters, never speckle; there's no dither on sprites. Creatures are
// outlined black, props and flora with sel-outs. Every picture has two
// layers: its colours, and its emissive pixels, which keep their own colour
// under any light and feed the bloom (render.js). Rock tops are darker than
// the floor, with lit rims and front faces, so walls always read as walls.
// The world is in world px (TILE = 16 a tile); the art is drawn at AP art px
// to a world px (T.art.px: 1.5, so 24 art px a tile). Sprites' letter grids
// are enlarged to the art's size before they're shaded (artScaleRows), so
// the shading and outlines are real art pixels, and floors are painted at
// ATILE art px a tile.
// ---------------------------------------------------------------------------

// World px to art px: AP art px to each, ATILE to a tile. ap(v): a world
// distance as whole art px.
const AP = T.art.px, ATILE = Math.round(TILE * AP);
const ap = (v) => Math.round(v * AP);
// A sprite's anchor, given as px up from its bottom edge in its 1× letter
// grid (a pixel of outline, then letters), at its art size: the outline
// stays a pixel and the letters' share is enlarged by k.
const footOff = (old, k = AP) => 1 + (old - 1) * k;
// Letter grids redrawn by hand at the art's size (A+ step 3), marked with
// the scale they're drawn at: buildArtSprite enlarges them only by what's
// left (nothing, for a sprite drawn at AP), never by scale15Rows. Drawn to
// the size the old grid was enlarged to (a w-wide grid: ceil(1.5w)), with its
// feet in the same place, so anchors and hand points don't move.
const ART_NATIVE = new WeakMap();
function artNative(rows, k = AP) { ART_NATIVE.set(rows, k); return rows; }

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
// The ordered-dither threshold at x, y, in (0, 1). Anchored to the world, so
// dithering stays put as the camera moves. A+ keeps it for the edges of
// large gradients and the light's steps only.
const bayerAt = (x, y) => (BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

function desaturate(hex, t) {
  const [r, g, b] = hexToRgb(hex), l = r * 0.3 + g * 0.59 + b * 0.11;
  return rgbToHex(r + (l - r) * t, g + (l - g) * t, b + (l - b) * t);
}

const ART = {
  outline: '#050407',
  // materials: deep, shadow, base, light (glowing ones have a single colour)
  pal: {
    helmet: ['#1e1816', '#3a2c24', '#5e4a36', '#8a7050'], lamp: ['#e6dcff'], skin: ['#2a1b1a', '#4e322c', '#7a5444', '#a47862'], eye: ['#060407'],
    coat: ['#121219', '#20202c', '#323246', '#4c4c66'], leather: ['#1e130e', '#352218', '#523522', '#6e4a30'], pants: ['#100e12', '#1c181e', '#2a242c'], boots: ['#0b0909', '#18120e', '#281e16'],
    plate: ['#191c22', '#2e333c', '#4a515c', '#78808c'], rune: ['#62f0ff'], arcane: ['#c9a2ff'], metal: ['#241c12', '#4a3a20', '#7a6234', '#b89a58'],
    steel: ['#22262c', '#444a54', '#767f8c', '#c8d2dc'], tool: ['#1c2028', '#383f4a', '#5e6876', '#98a4b4'], wood: ['#1a110a', '#301d12', '#4c301c', '#64422a'], glass: ['#ffb347'],
    star: ['#3a2a14', '#8a6430', '#d8ae5c', '#fff2c8'],
    shell: ['#0e0a10', '#1c1520', '#302434', '#4a3a4e'], eyeglow: ['#ff3d3d'], crystal: ['#a070ff'], coreglow: ['#fff4e0'], legs: ['#060407'],
  },
  // the surface round the sinkhole, under the sun: each region's badlands.
  // Mesa tops stay darker than the dust, and cast shadow to the south-east.
  surface: {
    rim: { sun: true, floor: ['#5a4632', '#6a543c', '#7a6248'], rock: ['#2a2018', '#33271d', '#3c2e22', '#a08060'], front: ['#4a3626', '#5a4430', '#6a523a'], glow: '#ffd25a' },
    choir: { sun: true, floor: ['#4a4a62', '#585a74', '#666a86'], rock: ['#1e1e30', '#262638', '#2e2e42', '#9a9ac8'], front: ['#3a3a58', '#46466a', '#54547c'], glow: '#d8c8ff' },
    underforge: { sun: true, floor: ['#5a3a30', '#6a463a', '#7a5244'], rock: ['#24140f', '#2c1913', '#341e17', '#a86a52'], front: ['#4a2a22', '#5a342a', '#6a3e32'], glow: '#ffb070' },
  },
  // what each rarity's drops and names glow with
  rarity: { common: '#b8b0a0', magic: '#6fa8ff', rare: '#ffd34d', legendary: '#ff8a3d', set: '#5fe08a', relic: '#c9a2ff' },
  exotics: { voltaic: '#7fe8ff', bloodresin: '#ff4a5c', frostglass: '#c8f0ff', lodeshard: '#ffd890', riftglass: '#c060ff', emberglass: '#ff8a3a', blightcap: '#9ad04a' },
  // creature parts, until they have their own art: a colour a kind
  parts: { chitin: '#8a6a7a', ether: '#9fd8ff', cog: '#b89a58', fiber: '#8ab86a', spore: '#c87ab0', heart: '#ff6a4a' },
  cores: {
    bolt: '#62f0ff', nova: '#ffb347', pull: '#ffd890', ward: '#8fb4ff', frost: '#c8f0ff', ember: '#ff8a3a', chain: '#7fe8ff',
    thorns: '#9ad04a', blink: '#c9a2ff', well: '#8a5ad0', phase: '#e8e0ff',
    split: '#ffd34d', amplify: '#ff8a3d', quicken: '#7fe8ff', chainmod: '#62f0ff', echo: '#c9a2ff',
  },
  ores: {
    ferrite: ['#3b170d', '#743828', '#c46444', '#ffb08a'],
    lumenite: ['#0a302c', '#2a6e64', '#4ec9b1', '#c2fff2'],
    resonite: ['#1e113b', '#4a3577', '#8868d1', '#dccbff'],
    aetherglass: ['#1b3b4e', '#598ba1', '#afe2f9', '#f4fdff'],
    sigilite: ['#453007', '#8c6f25', '#e9c045', '#fff2a8'],
    starmetal: ['#4f452f', '#a69c7e', '#f0e8cd', '#ffffff'],
  },
  // each biome: the same materials with its own floor, rock and light.
  // glow: the colour of the biome's faint light (veins in the rock, wisps' shots)
  biomes: {
    rim: { floor: ['#22303a', '#2c3e4a', '#3a4e5c'], rock: ['#05070a', '#0a0d12', '#10141b', '#7c90b0'], front: ['#2c3448', '#3a445c', '#4c5872'], glow: '#9ccf4a' },
    choir: { floor: ['#282242', '#342c56', '#42386a'], rock: ['#06050e', '#0b0918', '#110e22', '#9a84d0'], front: ['#30285a', '#3e3470', '#504488'], glow: '#e070b0' },
    // the outpost: worn flagstones on the rim, the same dark rock round it
    outpost: { paving: true, floor: ['#2a2b33', '#34363f', '#40434d'], rock: ['#05070a', '#0a0d12', '#10141b', '#7c90b0'], front: ['#2c3448', '#3a445c', '#4c5872'], glow: '#9ccf4a' },
    underforge: { floor: ['#33252a', '#402e34', '#503a40'], rock: ['#080506', '#0f090b', '#160d10', '#b07060'], front: ['#46282a', '#5a3436', '#704244'], glow: '#ff7a2a' },
  },
};

// ---------------------------------------------------------------------------
// Pixel buffers: a picture as two RGBA arrays, colour and emissive. Floors
// are painted into these (far faster than a fillRect a pixel) and handed to
// canvases with putImageData.
// ---------------------------------------------------------------------------
const _rgbCache = new Map();
function rgbOf(hex) {
  let v = _rgbCache.get(hex);
  if (!v) { v = hexToRgb(hex); _rgbCache.set(hex, v); }
  return v;
}

function pixBuf(w, h) {
  return { w, h, col: new Uint8ClampedArray(w * h * 4), em: new Uint8ClampedArray(w * h * 4) };
}

// Sets one pixel. glow: it's emissive too. alpha: blend over what's there
// (and leave the emissive layer alone unless it glows).
function putPx(P, x, y, hex, glow, alpha) {
  if (x < 0 || y < 0 || x >= P.w || y >= P.h) return;
  const k = (y * P.w + x) * 4, [r, g, b] = rgbOf(hex), c = P.col, e = P.em;
  if (alpha === undefined) {
    c[k] = r; c[k + 1] = g; c[k + 2] = b; c[k + 3] = 255;
    if (glow) { e[k] = r; e[k + 1] = g; e[k + 2] = b; e[k + 3] = 255; } else e[k + 3] = 0;
    return;
  }
  c[k] += (r - c[k]) * alpha; c[k + 1] += (g - c[k + 1]) * alpha; c[k + 2] += (b - c[k + 2]) * alpha; c[k + 3] = 255;
  if (glow) { e[k] = r; e[k + 1] = g; e[k + 2] = b; e[k + 3] = Math.max(e[k + 3], alpha * 255); }
}

// Any ramp as four steps: deep, shadow, base, light.
const fourStep = (r) => (r.length >= 4 ? r : r.length === 3 ? [r[0], r[0], r[1], r[2]] : r.length === 2 ? [r[0], r[0], r[1], r[1]] : [r[0], r[0], r[0], r[0]]);

// ---------------------------------------------------------------------------
// The A+ rules (T.art): a few tones a material, chosen by form; ramps whose
// shadows lean to violet and lights to warm gold; texture in clusters, never
// pixel noise; no dither on sprites; black outlines on creatures and
// sel-outs (a much darker shade of the colour inside) on everything else.
// ---------------------------------------------------------------------------
// Ramps whose hues are what they mean: the ores (they must look like ore,
// and nothing else may).
const ART_TRUE_HUES = new WeakSet(Object.values(ART.ores));

function artHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}
function artRgbOfHsl(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
const artLerpHue = (a, b, t) => { const d = ((b - a + 540) % 360) - 180; return (a + d * t + 360) % 360; };

// A ramp (dark to light) hue-shifted: its shadows lean to violet, its lights
// to warm gold, by amt [shadows, lights, richer], each fading to nothing at
// the middle tone, which gains a little saturation (richer). A cool hue's lights stay
// cool (the way to gold from cyan or blue is through green). Lightness
// never changes, so a rock top stays as dark against the ground as it was.
// Worked out once.
const _hueRamps = new Map();
function hueRamp(ramp, amt = T.art.hueShift) {
  if (!ramp || ramp.length < 2 || !amt || !(amt[0] || amt[1]) || ART_TRUE_HUES.has(ramp)) return ramp;
  const key = ramp.join() + '|' + amt.join();
  let q = _hueRamps.get(key);
  if (q) return q;
  const A = T.art, n = ramp.length;
  q = ramp.map((hex, k) => {
    const f = k / (n - 1), [r, g, b] = hexToRgb(hex), [h, s, l] = artHsl(r, g, b);
    const warm = Math.max(0, Math.cos((((A.gold - h + 540) % 360) - 180) * Math.PI / 180));
    const h2 = f < 0.5 ? artLerpHue(h, A.violet, amt[0] * (1 - f * 2)) : artLerpHue(h, A.gold, amt[1] * warm * (f * 2 - 1));
    const rich = amt[2] || 0, s2 = Math.min(1, s * (1 + rich) + rich * (1 - Math.abs(f * 2 - 1)));
    return rgbToHex(...artRgbOfHsl(h2, s2, l));
  });
  _hueRamps.set(key, q);
  return q;
}

// Which of a ramp's n steps a sprite may use when it may use only `tones`:
// spread from the darkest to the lightest. For each step, the nearest
// allowed one.
function toneMap(n, tones) {
  const out = Array.from({ length: n }, (_, i) => i);
  if (!tones || tones >= n) return out;
  const ok = Array.from({ length: tones }, (_, k) => Math.round((k * (n - 1)) / Math.max(1, tones - 1)));
  return out.map((i) => ok.reduce((a, b) => (Math.abs(b - i) < Math.abs(a - i) ? b : a)));
}

// A sel-out: the outline pixel is a much darker, slightly violet shade of
// the colour inside it.
function seloutRgb(c) {
  const k = T.art.selout;
  return [c[0] * k + 4, c[1] * (k - 0.04) + 3, c[2] * (k + 0.03) + 9];
}

// Outlines everything solid in a pixel buffer (solid: 1 per pixel) in one
// mode: 'black' (ART.outline), 'selout', or 'none'. skip(x, y): a pixel
// that stays clear (a portal's open face).
function outlineBuf(P, solid, mode, skip) {
  if (mode === 'none') return;
  const w = P.w, h = P.h, ink = rgbOf(ART.outline), add = [];
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && solid[y * w + x];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (solid[y * w + x] || (skip && skip(x, y))) continue;
      // the pixel inside it: below first, then beside, then above
      const from = on(x, y + 1) ? [x, y + 1] : on(x - 1, y) ? [x - 1, y] : on(x + 1, y) ? [x + 1, y] : on(x, y - 1) ? [x, y - 1] : null;
      if (from) add.push(x, y, from[0], from[1]);
    }
  for (let n = 0; n < add.length; n += 4) {
    const k = (add[n + 1] * w + add[n]) * 4, j = (add[n + 3] * w + add[n + 2]) * 4;
    const c = mode === 'selout' ? seloutRgb([P.col[j], P.col[j + 1], P.col[j + 2]]) : ink;
    P.col[k] = c[0]; P.col[k + 1] = c[1]; P.col[k + 2] = c[2]; P.col[k + 3] = 255; P.em[k + 3] = 0;
  }
}

// Smooth value noise in -1..1, about s px across a bump, fixed to the
// world (or the sprite). Cheap enough to call for every pixel of a floor.
function artHash(x, y, seed) {
  let n = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
function artNoise(x, y, s, seed) {
  const gx = x / s, gy = y / s, x0 = Math.floor(gx), y0 = Math.floor(gy), u = gx - x0, v = gy - y0;
  const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
  const a = artHash(x0, y0, seed), b = artHash(x0 + 1, y0, seed), c = artHash(x0, y0 + 1, seed), d = artHash(x0 + 1, y0 + 1, seed);
  return (a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv) * 2 - 1;
}
// The ground's texture at a pixel: -1 a dark clump, 1 a light one, 0 the
// base tone between. Patches and grain together, cut hard, so it reads in
// clusters of a few pixels and more, never as speckle.
function artClump(x, y, seed, cut) {
  const C = T.art.cluster, px = T.art.px;
  const n = artNoiseAt(_clumpP, x, y, C.patch * px, seed) * 0.62 + artNoiseAt(_clumpG, x, y, C.grain * px, seed + 7) * 0.38;
  return n > cut ? 1 : n < -cut ? -1 : 0;
}
// artClump's noise (before the cut) along a row: n pixels from x0 at y,
// into out. The same numbers, far cheaper than a pixel at a time: the
// lattice's corners are hashed once a floor (artLattice), its rows blended
// once a cell.
function artClumpRow(out, x0, n, y, seed) {
  const C = T.art.cluster, px = T.art.px;
  artNoiseRow(out, x0, n, y, C.patch * px, seed, 0.62, false);
  artNoiseRow(out, x0, n, y, C.grain * px, seed + 7, 0.38, true);
}
function artNoiseRow(out, x0, n, y, s, seed, k, add) {
  const L = artLattice(seed, s), gy = y / s, yi = Math.floor(gy), v = gy - yi, sv = v * v * (3 - 2 * v), inv = 1 / s;
  const A = L.a, W = L.w, row = (yi - L.y0) * W - L.x0, inY = yi >= L.y0 && yi + 1 < L.y0 + L.h;
  let xi = Math.floor(x0 * inv), u = x0 * inv - xi, va = 0, vb = 0;
  const corners = () => {
    let a, b, c, d;
    if (inY && xi >= L.x0 && xi + 1 < L.x0 + W) { const o = row + xi; a = A[o]; b = A[o + 1]; c = A[o + W]; d = A[o + W + 1]; }
    else { a = artHash(xi, yi, seed); b = artHash(xi + 1, yi, seed); c = artHash(xi, yi + 1, seed); d = artHash(xi + 1, yi + 1, seed); }
    va = (a + (c - a) * sv) * 2 - 1; vb = (b + (d - b) * sv) * 2 - 1;
  };
  corners();
  for (let i = 0; i < n; i++) {
    const su = u * u * (3 - 2 * u), val = (va + (vb - va) * su) * k;
    out[i] = add ? out[i] + val : val;
    if ((u += inv) >= 1) { u -= 1; xi++; corners(); }
  }
}
// The hashed corners of a noise's lattice (seed, s px a cell) over the
// floor being painted (ART_LATTICE.w × h art px), worked out once.
const ART_LATTICE = { w: 0, h: 0, sets: new Map(), recent: [] };
function artLattice(seed, s) {
  // (the few in use are found without building a key)
  const R = ART_LATTICE.recent;
  for (let i = 0; i < R.length; i++) if (R[i].seed === seed && R[i].s === s) return R[i];
  const key = seed + '/' + s;
  let L = ART_LATTICE.sets.get(key);
  if (L) { R.unshift(L); R.length = Math.min(R.length, 6); return L; }
  const x0 = -1, y0 = -1, w = Math.ceil(ART_LATTICE.w / s) + 3, h = Math.ceil(ART_LATTICE.h / s) + 3, a = new Float32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) a[j * w + i] = artHash(x0 + i, y0 + j, seed);
  if (ART_LATTICE.sets.size > 16) { ART_LATTICE.sets.clear(); R.length = 0; }
  ART_LATTICE.sets.set(key, (L = { a, w, h, x0, y0, seed, s }));
  R.unshift(L); R.length = Math.min(R.length, 6);
  return L;
}
// A new floor's size (art px): the lattices start again.
function artLatticeFor(w, h) {
  if (w !== ART_LATTICE.w || h !== ART_LATTICE.h) { ART_LATTICE.sets.clear(); ART_LATTICE.recent.length = 0; }
  ART_LATTICE.w = w; ART_LATTICE.h = h;
}

// artNoise, remembering the corners of the last lattice cell it was asked
// in (m: its own memory, [x0, y0, seed, s, a, b, c, d]): a floor is painted
// pixel by pixel along rows, so most pixels share their neighbour's cell.
const _clumpP = new Float64Array([NaN, 0, 0, 0, 0, 0, 0, 0]), _clumpG = new Float64Array([NaN, 0, 0, 0, 0, 0, 0, 0]);
function artNoiseAt(m, x, y, s, seed) {
  const gx = x / s, gy = y / s, x0 = Math.floor(gx), y0 = Math.floor(gy), u = gx - x0, v = gy - y0;
  if (m[0] !== x0 || m[1] !== y0 || m[2] !== seed || m[3] !== s) {
    m[0] = x0; m[1] = y0; m[2] = seed; m[3] = s;
    m[4] = artHash(x0, y0, seed); m[5] = artHash(x0 + 1, y0, seed); m[6] = artHash(x0, y0 + 1, seed); m[7] = artHash(x0 + 1, y0 + 1, seed);
  }
  const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v), a = m[4], b = m[5], c = m[6], d = m[7];
  return (a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv) * 2 - 1;
}

// ---------------------------------------------------------------------------
// Sprites: rows of letters, each letter a material. Upper case is shaded by
// its form, lit from the top left; lower case is that material's darkest
// step. Glowing materials keep their brightest colour and give off light.
// A sprite is { c, ec, w, h }: its colour and emissive canvases.
// ---------------------------------------------------------------------------
const SPRITE_CHARS = {
  H: ['helmet'], h: ['helmet', 0], L: ['lamp'], S: ['skin'], s: ['skin', 0], E: ['eye'],
  C: ['coat'], c: ['coat', 0], B: ['leather'], P: ['pants'], K: ['boots'], G: ['plate'],
  R: ['rune'], A: ['arcane'], M: ['metal'], W: ['steel'], T: ['tool'], D: ['wood'], O: ['glass'],
  w: ['steel', 0], t: ['tool', 0],
  X: ['shell'], x: ['shell', 0], j: ['shell', 2], Y: ['eyeglow'], V: ['crystal'], Q: ['coreglow'], l: ['legs'],
};
const SPRITE_GLOWS = new Set(['lamp', 'rune', 'arcane', 'glass', 'eyeglow', 'crystal', 'coreglow']);
// What a creature is built with: black outlines (everything else gets
// T.art.outline.prop).
const ART_CREATURE = { kind: 'creature' };

// pal: materials to use instead of ART.pal's (an enemy's biome colours, an
// item's ore). letters, glows: a sprite with letters of its own (the diver).
// opts: { kind: 'creature' or 'prop' (the default), outline: 'black',
// 'selout' or 'none' (else the kind's, T.art.outline), hueShift: [shadows,
// lights] or false, tones, dither, scale: how much the letter grid is
// enlarged before it's shaded (AP, the art's size, unless said), openFoot:
// no outline on its lowest n px, so a plant's foot meets the ground }. The
// sprite keeps its scale as k: its outline is a pixel, its letters k px.
//
// Shading by form: each pixel's height is how far it lies inside the
// silhouette (rounded at the edge, and over the whole body) and inside its
// own material's patch; the slope of that height is the pixel's facing,
// lit from the top left. That, a little darker towards the feet and in the
// crease under another material, picks one of the ramp's steps, cut hard.
// A lone pixel of a tone among its material's others takes theirs.
function buildArtSprite(rows, pal, letters = SPRITE_CHARS, glows = SPRITE_GLOWS, opts = {}) {
  const A = T.art, F = A.form, kind = opts.kind || 'prop';
  const outline = opts.outline || A.outline[kind] || 'black';
  const shift = opts.hueShift === false ? null : opts.hueShift || A.hueShift;
  const tones = opts.tones || A.tones, dither = opts.dither !== undefined ? opts.dither : A.dither;
  pal = pal ? Object.assign({}, ART.pal, pal) : ART.pal;
  const G = glows instanceof Set ? glows : new Set(glows), scale = opts.scale !== undefined ? opts.scale : A.px;
  // (what glows is enlarged as exact blocks: artScaleRows; a grid drawn by
  // hand at the art's size isn't enlarged at all: artNative)
  const drawn = ART_NATIVE.get(rows) || 1;
  if (scale !== drawn) rows = artScaleRows(rows, scale / drawn, new Set(Object.keys(letters).filter((ch) => letters[ch] && G.has(letters[ch][0]))));
  const h = rows.length, w = Math.max(...rows.map((r) => r.length)), W = w + 2, H = h + 2, N = W * H;
  // the grid, a pixel of clear all round: each cell's letter entry, or null
  const L = new Array(N).fill(null);
  let y0 = H, y1 = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (!ch || ch === '.') continue;
      L[(y + 1) * W + x + 1] = letters[ch];
      y0 = Math.min(y0, y + 1); y1 = Math.max(y1, y + 1);
    }
  // how far each pixel lies inside the silhouette (dS) and inside its own
  // material's patch (dM): two chamfer passes
  const BIG = 1e6, dS = new Float32Array(N), dM = new Float32Array(N);
  for (let i = 0; i < N; i++) dS[i] = dM[i] = L[i] ? BIG : 0;
  const pass = (from, to, by, nbrs) => {
    for (let i = from; i !== to; i += by) {
      if (!L[i]) continue;
      for (const [o, c] of nbrs) {
        const j = i + o;
        if (dS[j] + c < dS[i]) dS[i] = dS[j] + c;
        const m = L[j] && L[j][0] === L[i][0] ? dM[j] : 0;
        if (m + c < dM[i]) dM[i] = m + c;
      }
    }
  };
  pass(W + 1, N - W - 1, 1, [[-1, 1], [-W, 1], [-W - 1, 1.4], [-W + 1, 1.4]]);
  pass(N - W - 2, W, -1, [[1, 1], [W, 1], [W + 1, 1.4], [W - 1, 1.4]]);
  const px = scale, rE = F.edge * px, rB = Math.max(rE + 1, F.body * Math.min(w, h)), rP = F.part * px;
  const hgt = new Float32Array(N);
  for (let i = 0; i < N; i++) if (L[i]) hgt[i] = 0.45 * Math.min(1, (dS[i] - 0.5) / rE) + 0.35 * Math.min(1, (dS[i] - 0.5) / rB) + 0.2 * Math.min(1, (dM[i] - 0.5) / rP);
  // each pixel's step on its ramp; -1 for glows and forced steps, which
  // stay as they are
  const idx = new Int8Array(N).fill(-1), ramps = new Array(N), LX = -0.46, LY = -0.62, LZ = 0.64;
  for (let i = 0; i < N; i++) {
    const e = L[i];
    if (!e) continue;
    const [m, forced] = e, glow = G.has(m);
    const ramp = glow ? pal[m] : hueRamp(pal[m], shift);
    ramps[i] = ramp;
    if (glow || forced !== undefined) continue;
    const x = i % W, y = (i - x) / W, n = ramp.length;
    const nx = -(hgt[i + 1] - hgt[i - 1]) * F.depth, ny = -(hgt[i + W] - hgt[i - W]) * F.depth;
    const lam = Math.max(0, (LX * nx + LY * ny + LZ) / Math.hypot(nx, ny, 1)) / LZ;
    let s = 0.6 + (lam - 1) * (lam > 1 ? F.light : F.shade) - F.fall * ((y - y0) / Math.max(1, y1 - y0));
    const above = L[i - W];
    if (above && above[0] !== m && !G.has(above[0])) s -= F.crease;
    idx[i] = Math.max(0, Math.min(n - 1, Math.floor(s * n + (dither ? bayerAt(x, y) - 0.5 : 0))));
  }
  // no orphans: a pixel whose tone none of its material's neighbours share
  // (with at least two of them about it) takes the tone most of them have
  const fixed = idx.slice();
  for (let i = 0; i < N; i++) {
    if (idx[i] < 0) continue;
    const m = L[i][0], seen = [];
    let alone = true;
    for (const o of [-1, 1, -W, W, -W - 1, -W + 1, W - 1, W + 1]) {
      const j = i + o;
      if (!L[j] || L[j][0] !== m || idx[j] < 0) continue;
      if (idx[j] === idx[i]) { alone = false; break; }
      if (o === -1 || o === 1 || o === -W || o === W) seen.push(idx[j]);
    }
    if (!alone || seen.length < 2) continue;
    seen.sort((a, b) => seen.filter((v) => v === b).length - seen.filter((v) => v === a).length);
    fixed[i] = seen[0];
  }
  // a lone darkest-step pixel drawn into the rows (a lower-case letter)
  // grows into a cluster: the pixel under it darkens too
  for (let i = 0; i < N; i++) {
    const e = L[i];
    if (!e || e[1] !== 0 || G.has(e[0])) continue;
    let alone = true;
    for (const o of [-1, 1, -W, W, -W - 1, -W + 1, W - 1, W + 1]) { const j = i + o; if (L[j] && L[j][0] === e[0] && (L[j][1] === 0 || fixed[j] === 0)) { alone = false; break; } }
    if (alone && L[i + W] && L[i + W][0] === e[0] && fixed[i + W] > 0) fixed[i + W] = 0;
  }
  const P = pixBuf(W, H), solid = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const e = L[i];
    if (!e) continue;
    const ramp = ramps[i], n = ramp.length, glow = G.has(e[0]);
    const k = glow ? n - 1 : e[1] !== undefined ? e[1] : toneMap(n, tones)[fixed[i]];
    putPx(P, i % W, (i / W) | 0, ramp[Math.max(0, Math.min(n - 1, k))], glow);
    solid[i] = 1;
  }
  outlineBuf(P, solid, outline, opts.openFoot ? (x, y) => y > y1 - opts.openFoot : null);
  const out = spriteFromBuf(P);
  out.k = scale;
  return out;
}

// Where a pixel of a sprite's letter grid (x, y at 1×) lands in the sprite
// as drawn: past its outline, the middle of the pixel's enlarged block.
const spritePt = (s, v) => 1 + Math.floor((v + 0.5) * (s.k || 1));

function spriteFromBuf(P) {
  const [c, x] = makeCanvas(P.w, P.h), [ec, ex] = makeCanvas(P.w, P.h);
  x.putImageData(new ImageData(P.col, P.w, P.h), 0, 0);
  ex.putImageData(new ImageData(P.em, P.w, P.h), 0, 0);
  return { c, ec, w: P.w, h: P.h };
}

function flippedSprite(s) {
  return Object.assign({}, s, { c: flipped(s.c), ec: flipped(s.ec), ax: s.w - s.ax });
}

// ---------------------------------------------------------------------------
// Tiles, painted into a floor's pixel buffer at (ox, oy), in art px (ATILE a
// tile). rnd() is the tile's own seeded generator.
// ---------------------------------------------------------------------------
// An oval dish with a lip: the lodeline's anchor (glowing star metal).
function paintDish(P, ox, oy) {
  const cx = ox + ATILE / 2 - 0.5, cy = oy + ATILE / 2, rx = ATILE * 0.42, ry = ATILE * 0.3;
  const m = fourStep(ART.pal.metal), star = ART.pal.star;
  for (let y = 0; y < ATILE; y++)
    for (let x = 0; x < ATILE; x++) {
      const dx = (ox + x - cx) / rx, dy = (oy + y - cy) / ry, e = dx * dx + dy * dy;
      if (e > 1) continue;
      if (e > 0.66) putPx(P, ox + x, oy + y, dy < 0 ? m[3] : m[1]);
      else if (e > 0.44) putPx(P, ox + x, oy + y, m[0]);
      else putPx(P, ox + x, oy + y, e < 0.12 ? star[3] : star[2], true);
    }
}

// One crystal growing up from (x, y), w (2 or 3) wide: lit down its left,
// dark at its foot, its tip a point of light.
function paintShard(P, x, y, h, w, r, glow, glintGlow) {
  for (let i = 0; i < h; i++) {
    const yy = y - i, tip = i === h - 1;
    for (let j = 0; j < w; j++) {
      // the tip narrows to a point
      if (tip && (w === 2 ? j === 1 : j !== 1)) continue;
      const c = tip ? r[3] : i === 0 ? r[0] : j === 0 ? r[2] : j === w - 1 && w > 2 ? r[0] : r[1];
      putPx(P, x + j, yy, c, glow || (tip && glintGlow));
    }
  }
}

// One tile of cave, pixel by pixel along the smooth wall line. rock(x, y):
// is that floor pixel rock (from the floor's field). Ground is clumps of
// its three tones, darkened just under a wall; rock is a dark top in
// clumps, a lit rim where it meets the ground above or beside it, and a
// face where the ground is below it, in three bands broken by streaks.
// Under the sky, a rock casts its shadow down and to the right.
const FACE_H = ap(6);
// how far a wall's shadow falls under it (solid, then a dithered row), and
// a mesa's in the sun: steps along its slope, the last one dithered
const CAVE_SHADE = ap(2), CAVE_SUN = [[3, 4], [4, 5.5], [5, 7], [7, 10]].map(([x, y]) => [ap(x), ap(y)]);
// The flagstones of a paved floor: rows FLAG_H tall, stones FLAG_W long,
// each row set FLAG_SET along from the last.
const FLAG_H = ap(9), FLAG_W = ap(11), FLAG_SET = ap(5);
// A ramp hue-shifted for the ground, as [r, g, b] colours, and a rock
// ramp's shaded rim, worked out once.
const _rampRgbs = new WeakMap(), _rimRgbs = new WeakMap(), _calmRgbs = new WeakMap();
function rampRgb(ramp) {
  let v = _rampRgbs.get(ramp);
  if (!v) { v = hueRamp(ramp, T.art.groundHue).map(rgbOf); _rampRgbs.set(ramp, v); }
  return v;
}
function rimRgb(rock) {
  let v = _rimRgbs.get(rock);
  if (!v) { const g = hueRamp(rock, T.art.groundHue); v = rgbOf(mix(g[3], g[2], 0.45)); _rimRgbs.set(rock, v); }
  return v;
}
// The ground under the sky, calmer: its dark and light tones drawn towards
// the middle one (T.art.sunGround.soften), so the walls, plants and
// creatures stand out from it.
function calmRgb(ramp) {
  let v = _calmRgbs.get(ramp);
  if (!v) { const g = rampRgb(ramp), k = T.art.sunGround.soften; v = g.map((c, i) => (i === 1 ? c : c.map((x, n) => x + (g[1][n] - x) * k))); _calmRgbs.set(ramp, v); }
  return v;
}
// The rock round a tile being painted, read once: CAVE_MW × CAVE_MH pixels
// from (ox - CAVE_L, oy - CAVE_U), as far as a tile's pixels look. field:
// the floor's rock pixels (P.w × P.h, 1 for rock), if at hand, read
// straight instead of through rock(). seedH: the floor's, for its texture.
const CAVE_L = CAVE_SUN[CAVE_SUN.length - 1][0], CAVE_U = CAVE_SUN[CAVE_SUN.length - 1][1];
const CAVE_MW = ATILE + CAVE_L + 1, CAVE_MH = ATILE + CAVE_U + FACE_H, _caveMask = new Uint8Array(CAVE_MW * CAVE_MH);
function paintCaveTile(P, rock, ox, oy, b, rnd, seedH, field) {
  const sun = !!b.sun, Q = cavePal(b), f = Q.f, dark = Q.dark, r = Q.r, fr = Q.fr, rim = Q.rim, C32 = P.col32 || (P.col32 = new Uint32Array(P.col.buffer)), E = P.em;
  const A = T.art, paving = !!b.paving, cut = sun ? A.sunGround.cut : A.cluster.cut, dz = A.groundDither, gs = A.cluster.grain * A.px;
  // where the tile and all it looks at lie inside the floor, the field is
  // read in place; else the rock round it is read once into a mask
  const inside = field && ox - CAVE_L >= 0 && oy - CAVE_U >= 0 && ox + ATILE + 1 <= P.w && oy + ATILE + FACE_H <= P.h;
  const M = inside ? field : _caveMask, W = inside ? P.w : CAVE_MW, base = inside ? 0 : CAVE_U * W + CAVE_L - oy * W - ox;
  const SH = CAVE_SHADE, sunAt = CAVE_SUN.map(([x, y]) => -y * W - x), sunN = sunAt.length - 1;
  if (!inside)
    for (let j = 0; j < CAVE_MH; j++) {
      const y = oy - CAVE_U + j, x0 = ox - CAVE_L;
      if (field && y >= 0 && y < P.h && x0 >= 0 && x0 + W <= P.w) for (let i = 0, k = y * P.w + x0; i < W; i++) M[j * W + i] = field[k + i];
      else for (let i = 0; i < W; i++) M[j * W + i] = rock(x0 + i, y) ? 1 : 0;
    }
  const gRow = _caveRows[0], rRow = _caveRows[1], rCut = A.rockCut, BL = _caveBelow;
  // for each rock pixel, how far down the ground is (up to FACE_H; 0 for
  // further): a column at a time, from the bottom up
  for (let i = 0; i < ATILE; i++) {
    let g = 1e9;
    for (let j = ATILE + FACE_H - 1; j >= 0; j--) {
      if (!M[base + (oy + j) * W + ox + i]) g = j;
      else if (j < ATILE) { const k = g - j; BL[j * ATILE + i] = k <= FACE_H ? k : 0; }
    }
  }
  for (let y = oy; y < oy + ATILE; y++) {
    // the texture of the ground and of the rock top, where there's any
    let rocks = 0;
    for (let i = base + y * W + ox, e = i + ATILE; i < e; i++) rocks += M[i];
    if (rocks < ATILE) { artClumpRow(gRow, ox, ATILE, y, seedH); _caveNoise.set(gRow, (y - oy) * ATILE); }
    if (rocks) artClumpRow(rRow, ox, ATILE, y, seedH + 11);
    for (let x = ox; x < ox + ATILE; x++) {
      const t = (BAYER4[((y & 3) << 2) | (x & 3)] + 0.5) / 16, m = base + y * W + x, gn = gRow[x - ox];
      let c, n;
      if (!M[m]) {
        let shade = gn > cut ? 2 : gn < -cut ? 0 : 1;
        if (paving) {
          // flagstones: dark seams, each row of stones set off from the
          // last, each stone a little lighter or darker than its neighbours,
          // bevelled light along its top and left
          const row = (y / FLAG_H) | 0, sx = x + row * FLAG_SET, gy = y % FLAG_H, gx = sx % FLAG_W;
          if (gy === 0 || gx === 0) shade = 0;
          else if (gy === 1 || gx === 1) shade = 2;
          else if (shade === 1 && artHash((sx / FLAG_W) | 0, row, seedH) < 0.35) shade = 2;
        }
        // in a wall's shadow (or under the sky, a mesa's): the darkest tone
        let under = false;
        for (let k = 1; k <= SH && !under; k++) if (M[m - k * W]) under = true;
        if (!under && dz && M[m - (SH + 1) * W] && t < 0.5) under = true;
        if (!under && sun) {
          for (let k = 0; k < sunN && !under; k++) if (M[m + sunAt[k]]) under = true;
          if (!under && dz && M[m + sunAt[sunN]] && t < 0.5) under = true;
        }
        c = under ? dark : shade === 0 ? f[0] : shade === 1 ? f[1] : f[2];
      } else {
        const below = BL[(y - oy) * ATILE + x - ox];
        if (below === FACE_H) c = r[3];
        else if (below) { n = Math.floor((below / FACE_H) * 3 + artNoise(x, y * 0.3, gs, seedH + 3) * 0.6); c = fr[n < 0 ? 0 : n > 2 ? 2 : n]; }
        else if (!M[m - 1] || !M[m - W]) c = r[3];
        else if (!M[m + 1]) c = rim;
        else { const rn = rRow[x - ox]; c = r[rn > rCut ? 2 : rn < -rCut ? 0 : 1]; }
      }
      const k = y * P.w + x;
      C32[k] = c; E[k * 4 + 3] = 0;
    }
  }
}
// A look's colours for the cave painter, as whole pixels (r, g, b, opaque
// in one 32-bit word), worked out once.
const _cavePals = new WeakMap();
function cavePal(b) {
  let Q = _cavePals.get(b);
  if (Q) return Q;
  const u = (c) => (0xff000000 | (Math.round(c[2]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[0])) >>> 0, all = (a) => Uint32Array.from(a.map(u));
  Q = { f: all(b.sun ? calmRgb(b.floor) : rampRgb(b.floor)), dark: u(rampRgb(b.floor)[0]), r: all(rampRgb(b.rock)), fr: all(rampRgb(b.front)), rim: u(rimRgb(b.rock)) };
  _cavePals.set(b, Q);
  return Q;
}
// (the last tile's: the ground's texture, and how far down from each rock
// pixel the ground is, kept for undergrowth.js to paint over it)
const _caveRows = [new Float32Array(ATILE), new Float32Array(ATILE)], _caveBelow = new Int16Array(ATILE * ATILE), _caveNoise = new Float32Array(ATILE * ATILE);

// The sinkhole, pixel by pixel. Where the ground's edge is above it, a
// cliff face falls away into the dark in bands; elsewhere a lit lip, then
// nothing.
const PIT_FACE = ap(14);
function paintPitTile(P, rock, ox, oy, b, rnd, seedH) {
  const fr = rampRgb(b.front), fl = rampRgb(b.floor), abyss = ['#000000', '#030306', '#06070c'], dz = T.art.groundDither ? 0.5 : 0;
  for (let y = oy; y < oy + ATILE; y++)
    for (let x = ox; x < ox + ATILE; x++) {
      const t = 0.5 + (bayerAt(x, y) - 0.5) * dz;
      if (!rock(x, y)) { putPx(P, x, y, rgbToHex(...fl[1 + artClump(x, y, seedH, T.art.cluster.cut)])); continue; }
      let above = 0;
      for (let k = 1; k <= PIT_FACE; k++) if (!rock(x, y - k)) { above = k; break; }
      if (above === 1) putPx(P, x, y, rgbToHex(...rampRgb(b.rock)[3]));
      else if (above) putPx(P, x, y, rgbToHex(...fr[clamp(Math.floor((1 - above / PIT_FACE) * 2.6 + t - 0.5), 0, 2)]));
      else if (!rock(x, y + 1) || !rock(x - 1, y) || !rock(x + 1, y)) putPx(P, x, y, mix(b.rock[3], '#000000', 0.4));
      else putPx(P, x, y, abyss[1 + artClump(x, y, seedH + 5, 0.4)]);
    }
}

// A thin, faintly glowing crack wandering across a rock top (dim, so it
// never passes for ore)
function paintRockVein(P, rock, ox, oy, b, rnd) {
  const col = mix(b.glow, '#000000', 0.7);
  let x = ox + ap(3) + Math.floor(rnd() * ap(10)), y = oy + ap(2) + Math.floor(rnd() * ap(8));
  for (let k = 0, n = ap(9); k < n; k++) {
    if (!rock(x, y) || !rock(x, y + FACE_H)) break;
    putPx(P, x, y, col, true);
    x += rnd() < 0.5 ? 1 : -1; if (rnd() < 0.6) y += rnd() < 0.5 ? 1 : -1;
    x = clamp(x, ox, ox + ATILE - 1); y = clamp(y, oy, oy + ATILE - 1);
  }
}

// A cluster of crystals breaking out of the rock; only their tips glow
function paintOre(P, ox, oy, b, rnd, r, topH, frontH) {
  const shards = [], w = Math.max(2, ap(2));
  for (let k = 0; k < 3; k++) {
    const h = ap(3 + Math.floor(rnd() * 3));
    const x = ox + Math.round(((k + 0.5) / 3) * (ATILE - w - 2)) + Math.floor(rnd() * ap(2));
    const y = oy + Math.min(topH - 1, Math.round(topH * (0.55 + rnd() * 0.4)));
    shards.push([x, y, h]);
  }
  shards.sort((a, b2) => a[1] - b2[1]);
  for (const [x, y, h] of shards) {
    // a dark socket where the crystal breaks the rock
    for (let j = -1; j <= w; j++) putPx(P, x + j, y + 1, b.rock[0]);
    paintShard(P, x, y, h, w, r, false, true);
  }
  if (frontH > 2) paintShard(P, ox + ap(2) + Math.floor(rnd() * (ATILE - ap(6))), oy + topH + frontH - ap(2), ap(3), w, r, false, true);
}

// The Lodestar on the home screen
const LODESTAR_ROWS = [
  '.....W.....',
  '....WwW....',
  '....WwG....',
  '...WwwwG...',
  '...WwwwG...',
  '..WwwwwGG..',
  '..WwwwwGG..',
  '.WwwwwwGGG.',
  'WwwwwwwGGGG',
  '.dddddddDD.',
  '..ddddddD..',
  '..dddddDD..',
  '...ddddD...',
  '....dddD...',
  '.....dD....',
  '.....D.....',
];
const LODESTAR_PAL = { W: ART.pal.star[3], w: ART.pal.star[2], G: ART.pal.star[1], d: ART.pal.star[1], D: ART.pal.star[0] };

// Scale3x (AdvMAME3x) on a letter grid: three times the size, diagonals
// kept as clean steps rather than blocks. fixed: letters (glows: eyes,
// runes, cores) enlarged as exact blocks, neither rounded off by their
// neighbours nor spilling into them, so a small light keeps its shape.
function scale3xRows(rows, fixed) {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const at = (x, y) => (y < 0 || y >= h || x < 0 || x >= w ? '.' : rows[y][x] || '.');
  const out = Array.from({ length: h * 3 }, () => new Array(w * 3).fill('.'));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const A = at(x - 1, y - 1), B = at(x, y - 1), C = at(x + 1, y - 1), D = at(x - 1, y), E = at(x, y), F = at(x + 1, y), G = at(x - 1, y + 1), H = at(x, y + 1), I = at(x + 1, y + 1);
      const o = fixed && fixed.has(E) ? (i, j) => { out[3 * y + j][3 * x + i] = E; } : fixed ? (i, j, v) => { out[3 * y + j][3 * x + i] = fixed.has(v) ? E : v; } : (i, j, v) => { out[3 * y + j][3 * x + i] = v; };
      if (B !== H && D !== F) {
        o(0, 0, D === B ? D : E);
        o(1, 0, (D === B && E !== C) || (B === F && E !== A) ? B : E);
        o(2, 0, B === F ? F : E);
        o(0, 1, (D === B && E !== G) || (D === H && E !== A) ? D : E);
        o(1, 1, E);
        o(2, 1, (B === F && E !== I) || (H === F && E !== C) ? F : E);
        o(0, 2, D === H ? D : E);
        o(1, 2, (D === H && E !== I) || (H === F && E !== G) ? H : E);
        o(2, 2, H === F ? F : E);
      } else for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) o(i, j, E);
    }
  return out.map((r) => r.join(''));
}

// 1.5×: Scale3x, then every other row and column. Each even pixel keeps its
// two corners and each odd one its middle, so a diagonal stays a clean
// step, a curve stays round, and nothing is blurred or invented.
function scale15Rows(rows, fixed) {
  return scale3xRows(rows, fixed).filter((_, y) => y % 2 === 0).map((r) => [...r].filter((_, x) => x % 2 === 0).join(''));
}

// A letter grid enlarged k times (1, 1.5, 2, 3 or products of them), by the
// rules above; any other k by nearest neighbour. fixed: as scale3xRows.
function artScaleRows(rows, k, fixed) {
  const whole = (v) => Math.abs(v - Math.round(v)) < 1e-6;
  if (Math.abs(k - 1) < 1e-6) return rows;
  if (whole(k / 3)) return artScaleRows(scale3xRows(rows, fixed), k / 3, fixed);
  if (whole(k / 2)) return artScaleRows(scale2xRows(rows), k / 2, fixed);
  if (Math.abs(k - 1.5) < 1e-6) return scale15Rows(rows, fixed);
  // (4.5: three times, then half as much again)
  if (whole(k / 1.5)) return scale15Rows(artScaleRows(rows, k / 1.5, fixed), fixed);
  const h = rows.length, w = Math.max(...rows.map((r) => r.length)), W = Math.round(w * k), H = Math.round(h * k);
  return Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => rows[Math.floor(y / k)][Math.floor(x / k)] || '.').join(''));
}

// Scale2x (EPX) on a letter grid: twice the size, corners rounded.
function scale2xRows(rows) {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const at = (x, y) => (y < 0 || y >= h || x < 0 || x >= w ? '.' : rows[y][x] || '.');
  const out = Array.from({ length: h * 2 }, () => new Array(w * 2).fill('.'));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const P = at(x, y), A = at(x, y - 1), B = at(x + 1, y), C = at(x - 1, y), D = at(x, y + 1);
      out[2 * y][2 * x] = C === A && C !== D && A !== B ? A : P;
      out[2 * y][2 * x + 1] = A === B && A !== C && B !== D ? B : P;
      out[2 * y + 1][2 * x] = D === C && D !== B && C !== A ? C : P;
      out[2 * y + 1][2 * x + 1] = B === D && B !== A && D !== C ? D : P;
    }
  return out.map((r) => r.join(''));
}

// ---------------------------------------------------------------------------
// Enemies. Each biome recolours their shells and what glows on them.
// ---------------------------------------------------------------------------
// Drawn by hand at the art's size (artNative), each the size its old
// grid was enlarged to, centred, its feet on the bottom row.
const ENEMY_ROWS = {
  // a crystal-backed beetle, three legs a side (j: a pixel wide, in a
  // mid shell tone so its black outline frames them), mandibles
  crawler: artNative([
    '.............V.............',
    '.........V..QVV..V.........',
    '........QV..QVV..QV........',
    '........QVVQVVVVQVV........',
    '........XXXXXXXXXXX........',
    '......XXXXXXXxXXXXXXX......',
    '..j..XXXXXXXXxXXXXXXXX..j..',
    '.j.jXXXXXXXXXxXXXXXXXXXj.j.',
    '.j..XXXXXXXXXxXXXXXXXXX..j.',
    'j...XXXYYYXXXXXXXYYYXXX...j',
    'j...XXXYYYXXXXXXXYYYXXX...j',
    '...j.XXXXXXXXXXXXXXXXX.j...',
    '..j...XXXXXXXXXXXXXXX...j..',
    '.j....j.XXMMXXXMMXX.j....j.',
    '.j...j...M.......M...j...j.',
    'j....j...M.......M...j....j',
    '....j.....M.....M.....j....',
    '....j.................j....',
  ]),
  // a ball of light in a dark shell, cracked, trailing a wisp
  wisp: artNative([
    '.....XXVXX.....',
    '...XXXXXXXXX...',
    '..XXXXVVVXXXX..',
    '.XXXVVVVVVVXXX.',
    '.XXVVVVVVVVVXX.',
    'XXXVVVQQQVVVXXX',
    'XXVVVQQQQQVVVXX',
    'VXVVVQQQQQVVVXV',
    'XXVVVQQQQQVVVXX',
    'XXXVVVQQQVVVXXX',
    '.XXVVVVVVVVVXX.',
    '.XXXVVVVVVVXXX.',
    '..XXXXVVVXXXX..',
    '...XXXXXXXXX...',
    '.....XXXXX.....',
    '.......X.......',
    '......X........',
    '......X........',
  ]),
  // a golem of plates on metal rods, its rune lit
  construct: artNative([
    '.......MMMMMMM.......',
    '......MGGGGGGGM......',
    '......MGYYGYYGM......',
    '......MGYYGYYGM......',
    '......MGGGGGGGM......',
    '......MMMMMMMMM......',
    '.GGGGGGGGGGGGGGGGGGG.',
    '.GGGGGGGGGGGGGGGGGGG.',
    '..MM.GGGGGRGGGGG.MM..',
    '..MM.GGGGRRRGGGG.MM..',
    '..MM.GGGGRRRGGGG.MM..',
    '..MM.GGGGGRGGGGG.MM..',
    '..MM.GGGGGGGGGGG.MM..',
    '..MM.MMMMMMMMMMM.MM..',
    '.GGG..GGG...GGG..GGG.',
    '.GGG..GGG...GGG..GGG.',
    '......GGG...GGG......',
    '......GGG...GGG......',
    '......GGG...GGG......',
    '.....MMMM...MMMM.....',
    '.....MMMM...MMMM.....',
  ]),
};
// each biome's enemy colours: shell ramp, what glows, the constructs' plates
const ENEMY_PAL = {
  rim: { shell: ['#0e0a10', '#1c1520', '#302434', '#4a3a4e'], crystal: ['#5ce8c8'], coreglow: ['#d8fff4'], plate: ['#16181c', '#2a2e34', '#454b54', '#6c7480'], rune: ['#5ce8c8'] },
  choir: { shell: ['#0a0a18', '#16162c', '#262848', '#3c4068'], crystal: ['#b08cff'], coreglow: ['#efe4ff'], plate: ['#14162a', '#262a48', '#3e4470', '#646ca0'], rune: ['#b08cff'] },
  underforge: { shell: ['#140a08', '#261410', '#3e2219', '#5a3426'], crystal: ['#ff7a2a'], coreglow: ['#fff0c8'], plate: ['#1c1210', '#34221c', '#523830', '#7a5648'], rune: ['#ff7a2a'] },
};

// Builds every enemy sprite for a biome, each with a white silhouette for
// hit flashes. They move by bobbing, not by frames.
function buildEnemySprites(biomeId) {
  const pal = ENEMY_PAL[biomeId], out = {};
  const mk = (rows, p, big) => buildArtSprite(rows, p, undefined, undefined, big ? { kind: 'creature', scale: 2 * AP } : ART_CREATURE);
  for (const type of Object.keys(ENEMY_ROWS)) out[type] = mk(ENEMY_ROWS[type], pal);
  out.dummy = mk(ENEMY_ROWS.construct, Object.assign({}, pal, { plate: ['#1c1810', '#3a3020', '#5e4c30', '#8a7048'], rune: [ART.pal.star[2]] }));
  // the Hollow and the warden: twice the size
  out.hollow = mk(ENEMY_ROWS.wisp, { shell: ['#000000', '#030205', '#07050c', '#0e0a16'], crystal: ['#2a0838'], coreglow: ['#ff2a6a'] }, true);
  out.warden = mk(ENEMY_ROWS.construct, Object.assign({}, pal, { plate: ['#0c0a0e', '#1e1a22', '#34303c', '#565064'] }), true);
  for (const type in out) { const s = out[type]; s.flash = tinted(s.c, '#ffffff'); s.ax = s.w / 2; s.ay = s.h - footOff(1.5); }
  return out;
}

// ---------------------------------------------------------------------------
// Item icons, drawn in the item's ore: steel and plate take its colours.
// ---------------------------------------------------------------------------
function bladeIconRows() {
  const g = Array.from({ length: 20 }, () => new Array(20).fill('.'));
  const set = (x, y, ch) => { if (x >= 0 && y >= 0 && x < 20 && y < 20) g[y][x] = ch; };
  set(19, 0, 'W');
  for (let i = 0; i < 12; i++) { const x = 18 - i, y = 1 + i; set(x - 1, y, 'W'); set(x, y, i < 10 ? 'A' : 'W'); set(x + 1, y, 'w'); }
  for (let k = -3; k <= 3; k++) set(6 + k, 13 + k, k === 0 ? 'O' : 'M');
  for (let k = 0; k < 4; k++) { set(5 - k, 14 + k, 'B'); set(4 - k, 14 + k, k % 2 ? 'M' : 'B'); }
  set(1, 18, 'M'); set(0, 18, 'M'); set(0, 19, 'O'); set(1, 19, 'M');
  return g.map((r) => r.join(''));
}
const ICON_ROWS = {
  blade: bladeIconRows(),
  focus: [
    '......M..M..M.......',
    '.....GM.GM.GM.......',
    '.....GM.GM.GM.......',
    '.....GM.GM.GM..MM...',
    '.....GM.GM.GM.GMM...',
    '....MGMMGMMGMMGM....',
    '....GGGGGGGGGGGGM...',
    '....GGGGRRRRGGGGM...',
    '....GGGRRAARRGGM....',
    '....GGGRAAAARGGM....',
    '....GGGRAAAARGGM....',
    '....GGGRRAARRGGM....',
    '....GGGGRRRRGGGM....',
    '.....GGGGGGGGGM.....',
    '.....MMMMMMMMMM.....',
    '.....BBBBRBBBBB.....',
    '.....BBBBBBBBBB.....',
    '.....MMMMMMMMMM.....',
  ],
  pick: [
    '........AA..........',
    '.....TTTMMTTT.......',
    '...TTTTMMMMTTTT.....',
    '..TTt..MDDM..tTT....',
    '.TTt...MDDM...tTT...',
    '.Tt.....DD.....tT...',
    'Tt......DD......tT..',
    'T.......DD.......T..',
    '........DD..........',
    '........DD..........',
    '........DD..........',
    '........DD..........',
    '........MM..........',
    '........BB..........',
    '........BB..........',
    '........BB..........',
    '........MM..........',
    '........OO..........',
  ],
  armor: [
    '..GGG......GGG..',
    '.GGGGG....GGGGG.',
    'GGGGGGGMMGGGGGGG',
    'GGGGGGGRRGGGGGGG',
    '.GGGGGGRRGGGGGG.',
    '.GGGGGGGGGGGGGG.',
    '.GGGGGMMMMGGGGG.',
    '.GGGGGGGGGGGGGG.',
    '..GGGGGGGGGGGG..',
    '..GGGGGGGGGGGG..',
    '...GGGGGGGGGG...',
    '....GGGGGGGG....',
  ],
  charm: [
    '...MMMMMM...',
    '..M......M..',
    '.M........M.',
    '.M........M.',
    '..M......M..',
    '...M....M...',
    '....MOOM....',
    '...MOAAOM...',
    '..MOAAAAOM..',
    '..MOAAAAOM..',
    '...MOAAOM...',
    '....MOOM....',
    '.....MM.....',
  ],
  core: [
    '....MMMM....',
    '..MMRRRRMM..',
    '.MRRAAAARRM.',
    '.MRAAQQAARM.',
    'MRAAQQQQAARM',
    'MRAAQQQQAARM',
    '.MRAAQQAARM.',
    '.MRRAAAARRM.',
    '..MMRRRRMM..',
    '....MMMM....',
  ],
  relic: [
    '.MMMMMMMMMMMM.',
    'MDDDDDDDDDDDDM',
    'MDDDDDAADDDDDM',
    'MMMMMMAAMMMMMM',
    'MDDDDDAADDDDDM',
    'MDDDDDAADDDDDM',
    'MDDDDDDDDDDDDM',
    'MDDDDDDDDDDDDM',
    '.MMMMMMMMMMMMM',
  ],
};

const _iconCache = new Map();
// The icon for an item as a data URL (for the screens), cached by look.
// A sprite from art2.js, with its own letters and glows. pal: overrides;
// opts: buildArtSprite's.
function art2Sprite(rows, pal, opts) {
  return buildArtSprite(rows, Object.assign({}, ART2_PAL, pal), Object.assign({}, SPRITE_CHARS, ART2_LETTERS), [...SPRITE_GLOWS, ...ART2_GLOWS], opts);
}

function itemIconUrl(item) {
  const isMod = item.kind === 'core' && CORES[item.core] && CORES[item.core].mod;
  const style = isMod ? 'modifier' : item.kind === 'core' || item.kind === 'relic' ? item.kind : ((typeof bpOf === 'function' && bpOf(item)) || {}).style;
  const own = ICON_ROWS2[style] && !ICON_ROWS[style];
  const rows = own ? ICON_ROWS2[style] : ICON_ROWS[item.kind];
  const key = item.kind + '/' + style + '/' + item.tier + '/' + (item.core || '') + '/' + item.rarity;
  let url = _iconCache.get(key);
  if (url) return url;
  const pal = {};
  if (item.tier >= 1 && item.kind !== 'core' && item.kind !== 'relic') {
    const r = ART.ores[oreOfTier(item.tier).id];
    pal.steel = r; pal.plate = r; pal.tool = r;
  }
  if (item.kind === 'core') { pal.arcane = [ART.cores[item.core]]; pal.rune = [isMod ? ART.cores[item.core] : mix(ART.cores[item.core], '#000000', 0.3)]; }
  if (item.kind === 'relic') pal.arcane = [ART.rarity.relic];
  const s = own ? art2Sprite(rows, pal) : buildArtSprite(rows, pal);
  url = s.c.toDataURL();
  _iconCache.set(key, url);
  return url;
}

// A blueprint, a heart-shard or a spell modifier, as an icon.
function art2IconUrl(name, pal) {
  const key = 'art2/' + name + '/' + JSON.stringify(pal || {});
  let url = _iconCache.get(key);
  if (!url) { url = art2Sprite(ICON_ROWS2[name], pal).c.toDataURL(); _iconCache.set(key, url); }
  return url;
}

// Ore and exotics as icons: a cluster of crystals in their colour.
const STUFF_ROWS = [
  '....VV.....',
  '...VQV..V..',
  '..VVVV.VQ..',
  '..VVVVVVV..',
  '.MMVVVVVMM.',
  'MMMMMMMMMMM',
];
function stuffIconUrl(id) {
  const key = 'stuff/' + id;
  let url = _iconCache.get(key);
  if (url) return url;
  const part = parsePart(id);
  if (part) {
    url = art2Sprite(PART_ROWS[part.kind], PART_PAL[part.kind][part.grade - 1]).c.toDataURL();
    _iconCache.set(key, url);
    return url;
  }
  const r = ART.ores[id], col = r ? r[2] : ART.exotics[id];
  url = buildArtSprite(STUFF_ROWS, { crystal: [col], coreglow: [r ? r[3] : mix(col, '#ffffff', 0.6)] }).c.toDataURL();
  _iconCache.set(key, url);
  return url;
}
