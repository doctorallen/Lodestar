'use strict';
// ---------------------------------------------------------------------------
// The art: style E, "Glow + Detail". A grim, desaturated palette with
// four-step ramps and ordered dithering, in darkness where only magitech
// gives off light (the helmet lamp, ore glints, runes, fungus, the lodeline).
// Every picture has two layers: its colours, and its emissive pixels, which
// keep their own colour under any light and feed the bloom (render.js).
// Rock tops are darker than the floor, with lit rims and front faces, so
// walls always read as walls.
// ---------------------------------------------------------------------------

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
// The ordered-dither threshold at x, y, in (0, 1). Anchored to the world, so
// dithering stays put as the camera moves.
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
  // what each rarity's drops and names glow with
  rarity: { common: '#b8b0a0', magic: '#6fa8ff', rare: '#ffd34d', legendary: '#ff8a3d', set: '#5fe08a', relic: '#c9a2ff' },
  exotics: { voltaic: '#7fe8ff', bloodresin: '#ff4a5c', frostglass: '#c8f0ff', lodeshard: '#ffd890' },
  cores: { bolt: '#62f0ff', nova: '#ffb347', pull: '#ffd890', ward: '#8fb4ff' },
  ores: {
    ferrite: ['#3b170d', '#743828', '#c46444', '#ffb08a'],
    lumenite: ['#0a302c', '#2a6e64', '#4ec9b1', '#c2fff2'],
    resonite: ['#1e113b', '#4a3577', '#8868d1', '#dccbff'],
    aetherglass: ['#1b3b4e', '#598ba1', '#afe2f9', '#f4fdff'],
    sigilite: ['#453007', '#8c6f25', '#e9c045', '#fff2a8'],
    starmetal: ['#4f452f', '#a69c7e', '#f0e8cd', '#ffffff'],
  },
  // each biome: the same materials with its own floor, rock and light.
  // deco: what grows on the floor and glows (fungus, crystals, magma cracks)
  biomes: {
    rim: { deco: 'fungus', floor: ['#22303a', '#2c3e4a', '#3a4e5c'], rock: ['#05070a', '#0a0d12', '#10141b', '#7c90b0'], front: ['#2c3448', '#3a445c', '#4c5872'], glow: '#5ce8c8', stem: '#3c5058' },
    choir: { deco: 'crystal', floor: ['#282242', '#342c56', '#42386a'], rock: ['#06050e', '#0b0918', '#110e22', '#9a84d0'], front: ['#30285a', '#3e3470', '#504488'], glow: '#c08cff', stem: '#3a3460' },
    underforge: { deco: 'magma', floor: ['#33252a', '#402e34', '#503a40'], rock: ['#080506', '#0f090b', '#160d10', '#b07060'], front: ['#46282a', '#5a3436', '#704244'], glow: '#ff7a2a', stem: '#5a2a18' },
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
// Sprites: rows of letters, each letter a material. Upper case is shaded
// (light from the top left, dithered); lower case is that material's darkest
// step. Glowing materials keep their brightest colour and give off light.
// A sprite is { c, ec, w, h }: its colour and emissive canvases.
// ---------------------------------------------------------------------------
const SPRITE_CHARS = {
  H: ['helmet'], h: ['helmet', 0], L: ['lamp'], S: ['skin'], s: ['skin', 0], E: ['eye'],
  C: ['coat'], c: ['coat', 0], B: ['leather'], P: ['pants'], K: ['boots'], G: ['plate'],
  R: ['rune'], A: ['arcane'], M: ['metal'], W: ['steel'], T: ['tool'], D: ['wood'], O: ['glass'],
  w: ['steel', 0], t: ['tool', 0],
  X: ['shell'], x: ['shell', 0], Y: ['eyeglow'], V: ['crystal'], Q: ['coreglow'], l: ['legs'],
};
const SPRITE_GLOWS = new Set(['lamp', 'rune', 'arcane', 'glass', 'eyeglow', 'crystal', 'coreglow']);

// pal: materials to use instead of ART.pal's (an enemy's biome colours, an
// item's ore). letters, glows: a sprite with letters of its own (the diver).
function buildArtSprite(rows, pal, letters = SPRITE_CHARS, glows = SPRITE_GLOWS) {
  pal = pal ? Object.assign({}, ART.pal, pal) : ART.pal;
  const SPRITE_CHARS_ = letters, SPRITE_GLOWS_ = glows instanceof Set ? glows : new Set(glows);
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const at = (x, y) => (y < 0 || y >= h || x < 0 || x >= w ? '.' : rows[y][x] || '.');
  const op = (x, y) => at(x, y) !== '.';
  const mat = (x, y) => (op(x, y) ? SPRITE_CHARS_[at(x, y)][0] : null);
  let x0 = w, x1 = 0, y0 = h, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (op(x, y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const P = pixBuf(w + 2, h + 2);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!op(x, y)) continue;
      const [m, forced] = SPRITE_CHARS_[at(x, y)], ramp = pal[m], glow = SPRITE_GLOWS_.has(m), n = ramp.length;
      let i;
      if (glow) i = n - 1;
      else if (forced !== undefined) i = forced;
      else {
        const top = !op(x, y - 1) || !op(x - 1, y), bot = !op(x, y + 1) || !op(x + 1, y);
        const v = (y - y0) / Math.max(1, y1 - y0), u = (x - x0) / Math.max(1, x1 - x0);
        let l = 0.86 - 0.4 * v - 0.22 * u + (top ? 0.24 : 0) - (bot ? 0.3 : 0);
        const above = mat(x, y - 1);
        if (above && above !== m && !SPRITE_GLOWS_.has(above)) l -= 0.22;
        i = Math.floor(l * n + (bayerAt(x, y) - 0.5));
      }
      putPx(P, x + 1, y + 1, ramp[clamp(i, 0, n - 1)], glow);
    }
  for (let y = -1; y <= h; y++)
    for (let x = -1; x <= w; x++)
      if (!op(x, y) && (op(x - 1, y) || op(x + 1, y) || op(x, y - 1) || op(x, y + 1))) putPx(P, x + 1, y + 1, ART.outline);
  return spriteFromBuf(P);
}

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
// Tiles, painted into a floor's pixel buffer at (ox, oy). rnd() is the
// tile's own seeded generator.
// ---------------------------------------------------------------------------
// What glows on a biome's floor, chosen by `kind` (0–2): on the Rim, fungus
// caps, a stalk with a hanging bulb, or a cluster of pods; in the Choir,
// singing crystals, a tall chime spire, or a ring of shards; in the
// Underforge, a magma crack, an ember vent, or cinder pods.
function paintDeco(P, ox, oy, b, rnd, kind = 0) {
  const c = b.glow, dark = mix(c, '#000000', 0.45), pale = mix(c, '#ffffff', 0.6), stem = b.stem;
  if (b.deco === 'crystal') {
    const r = [mix(c, '#000000', 0.6), mix(c, '#000000', 0.3), c, pale];
    if (kind === 1) { paintShard(P, ox + 7, oy + 13, 10, 2, r, true, true); paintShard(P, ox + 10, oy + 13, 5, 2, r, true, true); }
    else if (kind === 2) for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; paintShard(P, ox + 7 + Math.round(Math.cos(a) * 4), oy + 9 + Math.round(Math.sin(a) * 3), 3, 1, r, true, true); }
    else { paintShard(P, ox + 5, oy + 11, 6, 2, r, true, true); paintShard(P, ox + 10, oy + 9, 4, 2, r, true, true); }
    return;
  }
  if (b.deco === 'magma' && kind === 0) {
    const hot = mix(c, '#ffe080', 0.6), edge = b.floor[0];
    let y = oy + Math.round(5 + rnd() * 5);
    for (let x = ox + 2; x < ox + TILE - 2; x++) {
      putPx(P, x, y - 1, edge);
      putPx(P, x, y, rnd() < 0.25 ? hot : c, true);
      putPx(P, x, y + 1, edge);
      if (rnd() < 0.35) { y = clamp(y + (rnd() < 0.5 ? -1 : 1), oy + 2, oy + TILE - 3); putPx(P, x, y, c, true); }
    }
    return;
  }
  if (kind === 1) {
    // a curling stalk with a glowing bulb hanging from its tip
    const x0 = ox + 6 + Math.floor(rnd() * 4);
    let x = x0;
    for (let y = oy + 14; y > oy + 4; y--) { putPx(P, x, y, stem); if (rnd() < 0.3) x += x < x0 + 2 ? 1 : -1; }
    putPx(P, x + 1, oy + 4, stem); putPx(P, x + 2, oy + 5, stem);
    for (const [i, j] of [[2, 6], [1, 7], [2, 7], [3, 7], [2, 8]]) putPx(P, x + i, oy + j, j === 6 ? pale : c, true);
    return;
  }
  if (kind === 2) {
    // a cluster of round pods, each with a glowing heart
    for (const [px, py, rr] of [[5, 10, 2], [10, 11, 2], [8, 7, 1]]) {
      for (let j = -rr; j <= rr; j++) for (let i = -rr; i <= rr; i++) if (i * i + j * j <= rr * rr + 1) putPx(P, ox + px + i, oy + py + j, i * i + j * j <= (rr - 1) * (rr - 1) ? c : dark, i * i + j * j <= (rr - 1) * (rr - 1));
      putPx(P, ox + px, oy + py - rr, pale, true);
    }
    return;
  }
  for (const [sx, sy, big] of [[5, 9, 1], [10, 6, 0], [9, 12, 0]]) {
    const x = ox + sx, y = oy + sy, w = big ? 2 : 1;
    for (let i = 0; i <= 2; i++) putPx(P, x, y + i, stem);
    for (let i = -w; i <= w; i++) putPx(P, x + i, y - 1, i === -w || i === w ? dark : c, true);
    for (let i = -w + 1; i <= w - 1; i++) putPx(P, x + i, y - 2, c, true);
    if (big) putPx(P, x, y - 2, pale, true);
  }
}

// An oval dish with a lip: the lodeline's anchor (glowing star metal), or the
// shaft down (a black drop).
function paintDish(P, ox, oy, b, kind) {
  const cx = ox + TILE / 2 - 0.5, cy = oy + TILE / 2, rx = TILE * 0.42, ry = TILE * 0.3;
  const m = fourStep(kind === 'pad' ? ART.pal.metal : b.front), star = ART.pal.star;
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const dx = (ox + x - cx) / rx, dy = (oy + y - cy) / ry, e = dx * dx + dy * dy;
      if (e > 1) continue;
      if (e > 0.62) putPx(P, ox + x, oy + y, dy < 0 ? m[3] : m[1]);
      else if (e > 0.4) putPx(P, ox + x, oy + y, m[0]);
      else if (kind === 'pad') putPx(P, ox + x, oy + y, e < 0.12 ? star[3] : star[2], true);
      else putPx(P, ox + x, oy + y, '#000000');
    }
}

// One crystal growing up from (x, y)
function paintShard(P, x, y, h, w, r, glow, glintGlow) {
  for (let i = 0; i < h; i++) {
    const yy = y - i, tip = i === h - 1;
    for (let j = 0; j < w; j++) {
      if (tip && w === 2 && j === 1) continue;
      const c = tip ? r[3] : i === 0 ? r[0] : j === 0 ? r[2] : r[1];
      putPx(P, x + j, yy, c, glow || (tip && glintGlow));
    }
  }
}

// One tile of cave, pixel by pixel along the smooth wall line. rock(x, y):
// is that floor pixel rock (from the floor's field). Ground is dithered and
// darkened just under a wall; rock is a dark top, a lit rim where it meets
// the ground above or beside it, and a lit face where the ground is below
// it. Here and there the rock carries a faint glowing vein, and the ground a
// glowing speck: this world's light lives in its stone.
const FACE_H = 6;
function paintCaveTile(P, rock, ox, oy, b, rnd, seedH) {
  const f = b.floor, r = b.rock, fr = b.front, vein = mix(b.glow, '#000000', 0.55);
  for (let y = oy; y < oy + TILE; y++)
    for (let x = ox; x < ox + TILE; x++) {
      const t = bayerAt(x, y), q = rnd();
      if (!rock(x, y)) {
        let shade = clamp(Math.floor((0.5 + (q - 0.5) * 0.7) * 3 + t - 0.5), 0, 2);
        if (rock(x, y - 1) || rock(x, y - 2) || (rock(x, y - 3) && t < 0.5)) shade = 0;
        putPx(P, x, y, f[shade]);
        if ((hashInts(x, y, seedH) & 1023) < 3) putPx(P, x, y, vein, true);
        continue;
      }
      let below = 0;
      for (let k = 1; k <= FACE_H; k++) if (!rock(x, y + k)) { below = k; break; }
      if (below === FACE_H) putPx(P, x, y, r[3]);
      else if (below) putPx(P, x, y, fr[clamp(Math.floor((below / FACE_H) * 2.2 + t - 0.5), 0, 2)]);
      else if (!rock(x - 1, y) || !rock(x, y - 1)) putPx(P, x, y, r[3]);
      else if (!rock(x + 1, y)) putPx(P, x, y, mix(r[3], r[2], 0.45));
      else putPx(P, x, y, r[clamp(Math.floor((0.5 + (q - 0.5) * 0.6) * 3 + t - 0.5), 0, 2)]);
    }
}

// A thin glowing crack wandering across a rock top
function paintRockVein(P, rock, ox, oy, b, rnd) {
  const col = mix(b.glow, '#000000', 0.4);
  let x = ox + 3 + Math.floor(rnd() * 10), y = oy + 2 + Math.floor(rnd() * 8);
  for (let k = 0; k < 9; k++) {
    if (!rock(x, y) || !rock(x, y + FACE_H)) break;
    putPx(P, x, y, col, true);
    x += rnd() < 0.5 ? 1 : -1; if (rnd() < 0.6) y += rnd() < 0.5 ? 1 : -1;
    x = clamp(x, ox, ox + TILE - 1); y = clamp(y, oy, oy + TILE - 1);
  }
}

// A cluster of crystals breaking out of the rock; only their tips glow
function paintOre(P, ox, oy, b, rnd, r, topH, frontH) {
  const shards = [];
  for (let k = 0; k < 3; k++) {
    const h = 3 + Math.floor(rnd() * 3);
    const x = ox + Math.round(((k + 0.5) / 3) * (TILE - 4)) + Math.floor(rnd() * 2);
    const y = oy + Math.min(topH - 1, Math.round(topH * (0.55 + rnd() * 0.4)));
    shards.push([x, y, h]);
  }
  shards.sort((a, b2) => a[1] - b2[1]);
  for (const [x, y, h] of shards) {
    // a dark socket where the crystal breaks the rock
    for (let j = -1; j <= 2; j++) putPx(P, x + j, y + 1, b.rock[0]);
    paintShard(P, x, y, h, 2, r, false, true);
  }
  if (frontH > 2) paintShard(P, ox + 2 + Math.floor(rnd() * (TILE - 6)), oy + topH + frontH - 2, 3, 2, r, false, true);
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
const ENEMY_ROWS = {
  crawler: [
    '........VV........',
    '....V...VV...V....',
    '....VV.VVVV.VV....',
    '...XXXXXXXXXXXX...',
    '..XXXXXXXXXXXXXX..',
    '.XXXXXXXXXXXXXXXX.',
    '.XXYYXXXXXXXXYYXX.',
    '.XXYYXXXXXXXXYYXX.',
    '.xXXXXXXXXXXXXXXx.',
    'l.xxXXXXXXXXXXxx.l',
    '.l..xxMM..MMxx..l.',
    'l.l...M....M...l.l',
  ],
  wisp: [
    '....XX....',
    '..XXVVXX..',
    '.XVVVVVVX.',
    '.XVVQQVVX.',
    'XVVQQQQVVX',
    'XVVQQQQVVX',
    '.XVVQQVVX.',
    '.XVVVVVVX.',
    '..XXVVXX..',
    '....XX....',
    '....x.....',
    '.....x....',
  ],
  construct: [
    '....MMMMMM....',
    '...MGGGGGGM...',
    '...MGYYGYYM...',
    '...MGGGGGGM...',
    '..MMMMMMMMMM..',
    '.GGGGGRRGGGGG.',
    'GGGGGRRRRGGGGG',
    'GGMGGGRRGGGMGG',
    'GGMGGGGGGGGMGG',
    '.M.GGGGGGGG.M.',
    '.M.GGMMMMGG.M.',
    '...GG....GG...',
    '...GG....GG...',
    '..MMM....MMM..',
  ],
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
  for (const type of Object.keys(ENEMY_ROWS)) out[type] = buildArtSprite(ENEMY_ROWS[type], pal);
  out.warden = buildArtSprite(scale2xRows(ENEMY_ROWS.construct), Object.assign({}, pal, { plate: ['#0c0a0e', '#1e1a22', '#34303c', '#565064'] }));
  for (const type in out) { const s = out[type]; s.flash = tinted(s.c, '#ffffff'); s.ax = s.w / 2; s.ay = s.h - 1.5; }
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
function itemIconUrl(item) {
  const key = item.kind + '/' + item.tier + '/' + (item.core || '') + '/' + item.rarity;
  let url = _iconCache.get(key);
  if (url) return url;
  const pal = {};
  if (item.tier >= 1 && item.kind !== 'core' && item.kind !== 'relic') {
    const r = ART.ores[oreOfTier(item.tier).id];
    pal.steel = r; pal.plate = r; pal.tool = r;
  }
  if (item.kind === 'core') { pal.arcane = [ART.cores[item.core]]; pal.rune = [mix(ART.cores[item.core], '#000000', 0.3)]; }
  if (item.kind === 'relic') pal.arcane = [ART.rarity.relic];
  const s = buildArtSprite(ICON_ROWS[item.kind], pal);
  url = s.c.toDataURL();
  _iconCache.set(key, url);
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
  const r = ART.ores[id], col = r ? r[2] : ART.exotics[id];
  url = buildArtSprite(STUFF_ROWS, { crystal: [col], coreglow: [r ? r[3] : mix(col, '#ffffff', 0.6)] }).c.toDataURL();
  _iconCache.set(key, url);
  return url;
}
