'use strict';
// ---------------------------------------------------------------------------
// Drawing. The world is drawn into the #view canvas at one game pixel per
// canvas pixel, and CSS scales the canvas up by a whole number of device
// pixels so the pixels (and the dithering) stay square. The shorter side of
// the view always shows at least VIEW_MIN game pixels.
//
// A frame is drawn in two layers, colour (the view) and emissive (what
// glows), then lit: the world dims to an ambient light, each light source
// (the helmet lamp, ore, fungus, the lodeline) adds its colour back, the
// light is cut into a few dithered bands. The emissive layer is a canvas
// stacked over the view, so it shows at its own colour; its bloom is
// another over that, which the browser adds on, and what's drawn unlit
// (health bars, numbers) is in a third on top. A floor is painted
// once into pixel buffers when it's entered, and the tiles around a mined
// one are repainted. Sprites carry anchors ax/ay at the feet.
// ---------------------------------------------------------------------------

const VIEW_MIN = 176;

const View = {
  canvas: null, ctx: null, w: 0, h: 0, scale: 1, camX: 0, camY: 0,
  em: null, emCtx: null, light: null, bloom: null, bloomCtx: null, over: null, overCtx: null, blooms: [], bloomSum: null,
  floorFor: null, floorBuf: null, rockPx: null, floorCol: null, floorEm: null, floorImgs: null, lights: [], flora: [], floraLights: [], bake: null, bakedFrom: null,
};
const Sprites = {};
const Sparks = [];

function setupView() {
  View.canvas = $('view');
  View.ctx = View.canvas.getContext('2d', { willReadFrequently: true });
  View.em = $('view-glow');
  View.emCtx = View.em.getContext('2d', { willReadFrequently: true });
  View.bloom = $('bloom');
  View.bloomCtx = View.bloom.getContext('2d');
  View.over = $('view-over');
  View.overCtx = View.over.getContext('2d');
}

function resizeView() {
  const r = $('stage').getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  if (r.width < 1 || r.height < 1) return;
  const k = Math.max(1, Math.floor((Math.min(r.width, r.height) * dpr) / VIEW_MIN));
  const w = Math.ceil((r.width * dpr) / k), h = Math.ceil((r.height * dpr) / k);
  if (w === View.w && h === View.h && k === View.scale) return;
  View.w = w; View.h = h; View.scale = k;
  View.canvas.width = w; View.canvas.height = h;
  View.canvas.style.width = (w * k) / dpr + 'px';
  View.canvas.style.height = (h * k) / dpr + 'px';
  View.ctx.imageSmoothingEnabled = false;
  for (const c of [View.em, View.bloom, View.over]) { c.width = w; c.height = h; c.style.width = View.canvas.style.width; c.style.height = View.canvas.style.height; }
  // the bloom's passes are drawn from the emissive layer in software
  const layer = (cw, ch) => { const c = document.createElement('canvas'); c.width = cw; c.height = ch; return [c, c.getContext('2d', { willReadFrequently: true })]; };
  // the light: a cell for each 2×2 pixels, with a spare row and column for
  // the grid's offset
  View.light = { a: new Float32Array(((w >> 1) + 2) * ((h >> 1) + 2) * 3), w: (w >> 1) + 2, h: (h >> 1) + 2, x0: 0, y0: 0 };
  const size = (div) => [Math.max(1, Math.round(w / div)), Math.max(1, Math.round(h / div))];
  View.blooms = T.light.bloom.map(([div, a]) => { const [c] = layer(...size(div)); return [c, a * T.light.glow]; });
  [View.bloomSum] = layer(...size(T.light.bloom[0][0]));
}

// The diver in eight facings, indexed clockwise from east (E, SE, S, SW, W,
// NW, N, NE): the five drawn ones and mirrors of three. Each facing is
// [idle, walk ×4], and each sprite knows its feet (ax, ay) and its main
// hand (hand).
const FACINGS = ['E', 'SE', 'S', 'SE', 'E', 'NE', 'N', 'NE'];
const MIRRORED = [false, false, false, true, true, true, false, false];
function buildSprites() {
  Sprites.diver = FACINGS.map((name, i) => DIVER_FRAMES[name].map((rows) => {
    let s = buildArtSprite(rows, DIVER_PAL, DIVER_LETTERS, DIVER_GLOWS);
    s.ax = s.w / 2; s.ay = s.h - 2.5;
    const [hx, hy] = DIVER_HAND[name];
    s.hand = { x: hx + 1, y: hy + 1 };
    if (MIRRORED[i]) { s = flippedSprite(s); s.hand = { x: s.w - 1 - (hx + 1), y: hy + 1 }; }
    s.flash = tinted(s.c, '#ffffff');
    return s;
  }));
}

// Which of the eight facings a direction is.
function facingIndex(fx, fy) { return (Math.round(Math.atan2(fy, fx) / (Math.PI / 4)) + 8) % 8; }

// ---------------------------------------------------------------------------
// The floor
// ---------------------------------------------------------------------------
// A floor's look: the outpost's; its clime's (climes.js), if it isn't its
// zone's own; a surface site's (the region's sunlit badlands); a ruin's (its
// region's, paved); else its region's caves.
const artBiome = (f) => {
  if (f.hub) return ART.biomes.outpost;
  const cl = climeArt(f);
  if (cl) return cl;
  const id = T.biomes[f.biome].id;
  if (f.zone === 'surface') return ART.surface[id];
  if (f.zone === 'ruin') return Object.assign({}, ART.biomes[id], { paving: true });
  return ART.biomes[id];
};
const rgb01 = (hex) => rgbOf(hex).map((v) => v / 255);

// ---------------------------------------------------------------------------
// Flora (flora.js): what grows in each biome, placed from the floor's seed
// so a floor always looks the same. Floor pieces grow mostly against the
// walls; wall pieces at the foot of a wall's face; ceiling pieces hang from
// the bottom of one. Drawn every frame among the actors, sorted by their
// feet, so the diver passes behind the tall ones; two-frame pieces sway.
// ---------------------------------------------------------------------------
const _floraSprites = {};
function floraSprite(set, piece, frame) {
  const key = set + '/' + piece.name + '/' + frame;
  if (!_floraSprites[key]) { const k = floraKit(set); _floraSprites[key] = buildArtSprite(piece.frames[frame], k.pal, k.letters, k.glows); }
  return _floraSprites[key];
}
// Which plants grow on a floor: its clime's own, if it has them; else the
// surface's under the sky, or its biome's.
function floraSetOf(f) { return f.hub ? 'rim' : f.clime && CLIME_FLORA[f.clime] ? f.clime : f.zone === 'surface' ? 'surface' : T.biomes[f.biome].id; }

function placeFlora(f, set) {
  const kit = floraKit(set), out = [], pieces = kit.pieces, L = T.light, keep = new Set();
  const mark = (x, y) => keep.add(y * f.w + x);
  if (f.entry) mark(f.entry.x, f.entry.y);
  // the ground round a portal and its plinth stays clear
  for (const w of f.ways || []) for (let dy = -2; dy <= 0; dy++) for (let dx = -1; dx <= 1; dx++) mark(w.x + dx, w.y + dy);
  if (f.pad) mark(f.pad.x, f.pad.y);
  if (f.hub) for (const s of HUB_STATIONS) for (let dy = -1; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) mark(s.x + dx, s.y + dy);
  const pick = (anchor, h) => {
    const list = pieces.filter((p) => p.anchor === anchor);
    let w = list.reduce((a, p) => a + p.weight, 0), r = (h % 1000) / 1000 * w;
    for (const p of list) if ((r -= p.weight) < 0) return p;
    return list[list.length - 1] || null;
  };
  for (let ty = 1; ty < f.h - 1; ty++)
    for (let tx = 1; tx < f.w - 1; tx++) {
      if (floorTile(f, tx, ty) !== TILE_FLOOR || keep.has(ty * f.w + tx) || hazardNear(f, tx, ty, 0)) continue;
      const h = hashInts(f.seed, f.depth, tx, ty, 0xf10a), roll = (h >>> 8) % 1000 / 1000;
      const wallAbove = TILE_SOLID[floorTile(f, tx, ty - 1)] && floorTile(f, tx, ty - 1) !== TILE_PIT;
      let walls = 0;
      for (const [dx, dy] of DIRS4) if (TILE_SOLID[floorTile(f, tx + dx, ty + dy)]) walls++;
      const scale = f.hub ? 0.4 : kit.sky ? 2 : 1;
      let piece = null, x = (tx + 0.5) * TILE + ((h >>> 20) % 7) - 3, y;
      if (wallAbove && roll < L.floraCeiling * scale) { piece = pick('ceiling', h); y = ty * TILE - 1; }
      else if (wallAbove && roll < (L.floraCeiling + L.floraWall) * scale) { piece = pick('wall', h); if (piece) y = ty * TILE + piece.h - 2; }
      else if (roll < (walls ? L.floraNearWall : L.floraOpen) * scale) { piece = pick('floor', h); y = (ty + 1) * TILE - 3; }
      if (piece) out.push({ piece, set, x, y, top: piece.anchor === 'ceiling', phase: (h & 255) / 255 });
    }
  return out;
}

// One piece, drawn with its feet (or for a hanging one, its top) at x, y.
function drawFlora(d, fl, ox, oy, lights) {
  const p = fl.piece;
  const frame = p.frames.length > 1 ? Math.floor(Game.realT * 2 + fl.phase * 2) % 2 : 0;
  const spr = floraSprite(fl.set, p, frame);
  const sx = Math.round(fl.x + ox - spr.w / 2), sy = Math.round(fl.top ? fl.y + oy : fl.y + oy - spr.h + 1);
  if (sx > View.w || sy > View.h || sx + spr.w < 0 || sy + spr.h < 0) return;
  drawArtSprite(spr, sx, sy);
}

// The plants' glow, baked with the floor's lights. Under the sky the plants
// don't glow; only pollen catches the light.
function floraLights(list) {
  return list.filter((fl) => !floraKit(fl.set).sky).map((fl) => {
    const spr = floraSprite(fl.set, fl.piece, 0), sx = Math.round(fl.x - spr.w / 2), sy = Math.round(fl.top ? fl.y : fl.y - spr.h + 1);
    return { x: sx + spr.w / 2, y: sy + spr.h * (fl.top ? 0.8 : 0.35), r: TILE * 1.1, i: T.light.flora, c: rgb01(floraKit(fl.set).pal.glow[0]) };
  });
}

// The floor's rock, pixel by pixel, from the smooth wall line. Between
// four tile centres that are all rock or all open there's no line to find,
// so only the blocks it crosses ask rockAt pixel by pixel.
function fillRockField(f, x0, y0, x1, y1) {
  const W = f.w * TILE, R = View.rockPx, H = TILE / 2;
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W, x1); y1 = Math.min(f.h * TILE, y1);
  const solid = (i, j) => (TILE_SOLID[floorTile(f, i, j)] ? 1 : 0);
  for (let ty = Math.floor((y0 - H) / TILE); ty * TILE + H < y1; ty++)
    for (let tx = Math.floor((x0 - H) / TILE); tx * TILE + H < x1; tx++) {
      const bx0 = Math.max(x0, tx * TILE + H), bx1 = Math.min(x1, tx * TILE + H + TILE), by0 = Math.max(y0, ty * TILE + H), by1 = Math.min(y1, ty * TILE + H + TILE);
      const a = solid(tx, ty);
      if (a === solid(tx + 1, ty) && a === solid(tx, ty + 1) && a === solid(tx + 1, ty + 1)) { for (let y = by0; y < by1; y++) R.fill(a, y * W + bx0, y * W + bx1); continue; }
      for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) R[y * W + x] = rockAt(f, x, y) ? 1 : 0;
    }
}

function paintFloor(f) {
  const P = pixBuf(f.w * TILE, f.h * TILE);
  View.floorFor = f; View.floorBuf = P;
  View.rockPx = new Uint8Array(P.w * P.h);
  fillRockField(f, 0, 0, P.w, P.h);
  for (let ty = 0; ty < f.h; ty++) for (let tx = 0; tx < f.w; tx++) paintTileArt(f, tx, ty);
  paintGraft(f, 0, 0, f.w - 1, f.h - 1);
  tintRift(f, 0, 0, P.w, P.h);
  View.floorImgs = [new ImageData(P.col, P.w, P.h), new ImageData(P.em, P.w, P.h)];
  let x;
  [View.floorCol, x] = makeCanvas(P.w, P.h); x.putImageData(View.floorImgs[0], 0, 0);
  [View.floorEm, x] = makeCanvas(P.w, P.h); x.putImageData(View.floorImgs[1], 0, 0);
  View.lights = floorLights(f);
  View.flora = placeFlora(f, floraSetOf(f));
  View.floraLights = floraLights(View.flora);
  View.bakedFrom = null;
}

// A tile's own generator: mulberry32, as an Rng would be, but one function
// for every tile, which is much faster to call a pixel at a time.
let _tileSeed = 0;
function tileRnd() {
  let a = (_tileSeed = (_tileSeed + 0x6D2B79F5) | 0);
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function paintTileArt(f, tx, ty) {
  const P = View.floorBuf, R = View.rockPx, W = P.w, H = P.h, b = tileArt(f, tx, ty), t = floorTile(f, tx, ty), ox = tx * TILE, oy = ty * TILE;
  _tileSeed = hashInts(f.seed, f.depth, tx, ty) | 0;
  const rnd = tileRnd;
  const rock = (x, y) => x < 0 || y < 0 || x >= W || y >= H || R[y * W + x] === 1;
  if (t === TILE_PIT) { paintPitTile(P, rock, ox, oy, b, rnd); return; }
  paintCaveTile(P, rock, ox, oy, b, rnd, f.seed ^ f.depth, R);
  if (f.clime) paintClimeTile(P, f, tx, ty, ox, oy, b);
  if (t === TILE_PAD) paintDish(P, ox, oy);
  else if (t === TILE_ORE) {
    const front = !TILE_SOLID[floorTile(f, tx, ty + 1)];
    paintOre(P, ox, oy, b, rnd, ART.ores[T.ores[f.ore[ty * f.w + tx] - 1].id], front ? TILE - FACE_H : TILE, front ? FACE_H : 0);
  } else if (t === TILE_ROCK && (hashInts(f.seed, tx, ty, 0x7e1) & 255) < 18) paintRockVein(P, rock, ox, oy, b, rnd);
}

// After mining: the wall line moves round tx, ty, and with it the rims,
// faces and shadows of the tiles about it.
function repaintAround(f, tx, ty) {
  if (View.floorFor !== f) return;
  fillRockField(f, (tx - 1) * TILE, (ty - 1) * TILE, (tx + 2) * TILE, (ty + 2) * TILE);
  for (let y = ty - 2; y <= ty + 2; y++) for (let x = tx - 1; x <= tx + 1; x++) if (x >= 0 && y >= 0 && x < f.w && y < f.h) paintTileArt(f, x, y);
  paintGraft(f, tx - 1, ty - 2, tx + 1, ty + 2);
  tintRift(f, (tx - 1) * TILE, (ty - 2) * TILE, (tx + 2) * TILE, (ty + 3) * TILE);
  const dx = Math.max(0, tx - 1) * TILE, dy = Math.max(0, ty - 2) * TILE;
  View.floorCol.getContext('2d').putImageData(View.floorImgs[0], 0, 0, dx, dy, 3 * TILE, 5 * TILE);
  View.floorEm.getContext('2d').putImageData(View.floorImgs[1], 0, 0, dx, dy, 3 * TILE, 5 * TILE);
  View.lights = floorLights(f);
}

// The floor's fixed lights: every ore vein tile.
function floorLights(f) {
  const L = [], Lt = T.light;
  for (let ty = 0; ty < f.h; ty++)
    for (let tx = 0; tx < f.w; tx++)
      if (floorTile(f, tx, ty) === TILE_ORE) L.push({ x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE, r: Lt.ore[0] * TILE, i: Lt.ore[1], c: rgb01(ART.ores[T.ores[f.ore[ty * f.w + tx] - 1].id][2]) });
  return f.clime ? L.concat(hazardLights(f), climeLights(f)) : L;
}

// ---------------------------------------------------------------------------
// Sparks (cosmetic)
// ---------------------------------------------------------------------------
function spawnSparks(x, y, cols, n) {
  for (let i = 0; i < n; i++) {
    const a = FX_R.f(Math.PI * 2), s = FX_R.f(20, 60);
    Sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, t: FX_R.f(0.25, 0.5), col: FX_R.pick(cols) });
  }
}

function updateSparks(dt) {
  for (let i = Sparks.length - 1; i >= 0; i--) {
    const s = Sparks[i];
    s.t -= dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 160 * dt;
    if (s.t <= 0) Sparks.splice(i, 1);
  }
}

// ---------------------------------------------------------------------------
// Drawing into both layers
// ---------------------------------------------------------------------------
function drawArtSprite(spr, x, y) {
  View.ctx.drawImage(spr.c, x, y);
  const ex = View.emCtx;
  ex.globalCompositeOperation = 'destination-out';
  ex.drawImage(spr.c, x, y);
  ex.globalCompositeOperation = 'source-over';
  ex.drawImage(spr.ec, x, y);
}

// The lodeline's beam, as dots dithered down a strip 2 × half wide at x;
// one of each kind drawn once and kept.
const _beamStrips = new Map();
function beamStrip(x, tick, half) {
  const key = `${x & 3} ${tick & 3} ${half} ${View.h}`;
  let c = _beamStrips.get(key);
  if (c) return c;
  if (_beamStrips.size > 64) _beamStrips.clear();
  const star = ART.pal.star, w = 2 * half, h = View.h, img = new ImageData(w, h), d = img.data, lit = rgbOf(star[2]), rim = rgbOf(star[1]);
  for (let y = 0; y < h; y++)
    for (let i = -half; i < half; i++) {
      const edge = i === -half || i === half - 1;
      if (bayerAt(x + i, y + tick) > (edge ? 0.45 : 0.75)) continue;
      const k = (y * w + i + half) * 4, col = edge ? rim : lit;
      d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = (edge ? 0.55 : 0.8) * 255;
    }
  [c] = makeCanvas(w, h);
  c.getContext('2d').putImageData(img, 0, 0);
  _beamStrips.set(key, c);
  return c;
}

// A pixel in colour, and in the emissive layer when it glows.
function dot(x, y, col, glow, alpha = 1) {
  if (LateDots.on && lateDot(x, y, col, glow, alpha)) return;
  const c = View.ctx;
  c.globalAlpha = alpha; c.fillStyle = col; c.fillRect(x, y, 1, 1); c.globalAlpha = 1;
  if (glow) { const e = View.emCtx; e.globalAlpha = alpha; e.fillStyle = col; e.fillRect(x, y, 1, 1); e.globalAlpha = 1; }
}

// Dots drawn after everyone (shots, spells, effects, sparks) are covered
// only by later dots, so on a dive they're queued, and written straight into
// the pixels when the frame is lit (lateDotsColour, lateDotsGlow) instead of
// costing two canvas calls each. q: x, y, colour, glow, alpha for each.
const LateDots = { on: false, q: [], rgb: new Map(), img: null, canvas: null, box: null };
function lateDot(x, y, col, glow, alpha) {
  let c = LateDots.rgb.get(col);
  if (c === undefined) { c = /^#[0-9a-f]{6}$/i.test(col) ? parseInt(col.slice(1), 16) : -1; LateDots.rgb.set(col, c); }
  if (c < 0 || (x | 0) !== x || (y | 0) !== y) return false;
  // as the canvas does, an alpha out of 0–1 is ignored
  LateDots.q.push(x, y, c, glow ? 1 : 0, alpha >= 0 && alpha <= 1 ? alpha : 1);
  return true;
}

// The queued dots into the colour pixels d (w × h), before they're lit.
function lateDotsColour(d, w, h) {
  const q = LateDots.q;
  for (let n = 0; n < q.length; n += 5) {
    const x = q[n], y = q[n + 1], a = q[n + 4];
    if (x < 0 || y < 0 || x >= w || y >= h || a <= 0) continue;
    const k = (y * w + x) * 4, c = q[n + 2];
    d[k] += ((c >> 16) - d[k]) * a; d[k + 1] += (((c >> 8) & 255) - d[k + 1]) * a; d[k + 2] += ((c & 255) - d[k + 2]) * a;
  }
}

// The glowing ones over the emissive layer.
function lateDotsGlow(w, h) {
  const q = LateDots.q;
  if (!LateDots.img || LateDots.img.width !== w || LateDots.img.height !== h) {
    LateDots.img = new ImageData(w, h);
    LateDots.canvas = document.createElement('canvas'); LateDots.canvas.width = w; LateDots.canvas.height = h;
  }
  const d = LateDots.img.data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let n = 0; n < q.length; n += 5) {
    const x = q[n], y = q[n + 1], a = q[n + 4];
    if (!q[n + 3] || x < 0 || y < 0 || x >= w || y >= h || a <= 0) continue;
    const k = (y * w + x) * 4, c = q[n + 2], ea = d[k + 3] / 255, oa = a + ea * (1 - a), m = ea * (1 - a);
    d[k] = ((c >> 16) * a + d[k] * m) / oa; d[k + 1] = (((c >> 8) & 255) * a + d[k + 1] * m) / oa; d[k + 2] = ((c & 255) * a + d[k + 2] * m) / oa; d[k + 3] = oa * 255;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return;
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  LateDots.canvas.getContext('2d').putImageData(LateDots.img, 0, 0, x0, y0, bw, bh);
  View.emCtx.drawImage(LateDots.canvas, x0, y0, bw, bh, x0, y0, bw, bh);
  for (let y = y0; y <= y1; y++) d.fill(0, (y * w + x0) * 4, (y * w + x1 + 1) * 4);
}

function pixelLine(x0, y0, x1, y1, col) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let n = 0; n < 64; n++) {
    dot(x0, y0, col);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

// ---------------------------------------------------------------------------
// Light
// ---------------------------------------------------------------------------

// Light is kept as numbers, not drawn: a cell for each 2×2 pixels on a
// grid fixed to the world, so it doesn't crawl as the camera moves. A light
// map L is { a, w, h, x0, y0 }: its cells' r, g, b in light × bands, and the
// world cell its first one is. The view has one (View.light); the floor's
// fixed lights, ore and glowing plants, are baked into another (View.bake).

// How a light fades with distance d (0–1 of its radius): as (1 - d)², in
// straight steps between quarters, as the gradients that used to draw it did.
const LIGHT_FADE = [1, 0.5625, 0.25, 0.0625, 0, 0];
function lightFade(d) { const s = d * 4, n = s | 0; return LIGHT_FADE[n] + (LIGHT_FADE[n + 1] - LIGHT_FADE[n]) * (s - n); }

// Adds a light of colour c (0–1 a channel) and strength i at world x, y,
// fading out to r.
function addLight(L, x, y, r, i, c) {
  if (!(r > 0) || !(i > 0)) return;
  const s = i * T.light.bands, cr = c[0] * s, cg = c[1] * s, cb = c[2] * s, k = 1 / r, a = L.a;
  const i0 = Math.max(0, Math.floor((x - r) / 2) - L.x0), i1 = Math.min(L.w - 1, Math.ceil((x + r) / 2) - L.x0);
  const j0 = Math.max(0, Math.floor((y - r) / 2) - L.y0), j1 = Math.min(L.h - 1, Math.ceil((y + r) / 2) - L.y0);
  for (let j = j0; j <= j1; j++) {
    const dy = (2 * (j + L.y0) + 1 - y) * k, dy2 = dy * dy;
    if (dy2 >= 1) continue;
    let o = (j * L.w + i0) * 3, dx = (2 * (i0 + L.x0) + 1 - x) * k;
    for (let n = i0; n <= i1; n++, o += 3, dx += 2 * k) {
      const q = dx * dx + dy2;
      if (q >= 1) continue;
      const g = lightFade(Math.sqrt(q));
      a[o] += cr * g; a[o + 1] += cg * g; a[o + 2] += cb * g;
    }
  }
}

// A light along a vertical line from y0 down to y1 (the lodeline's beam).
function addBeamLight(L, x, y0, y1, r, i, c) {
  if (!(r > 0) || !(i > 0)) return;
  const s = i * T.light.bands, a = L.a;
  const i0 = Math.max(0, Math.floor((x - r) / 2) - L.x0), i1 = Math.min(L.w - 1, Math.ceil((x + r) / 2) - L.x0);
  const j0 = Math.max(0, Math.floor(y0 / 2) - L.y0), j1 = Math.min(L.h - 1, Math.ceil(y1 / 2) - 1 - L.y0);
  for (let n = i0; n <= i1; n++) {
    const d = Math.abs(2 * (n + L.x0) + 1 - x) / r;
    if (d >= 1) continue;
    // the beam's gradient had its steps at halves
    const g = (d < 0.5 ? 1 - 1.5 * d : 0.5 - 0.5 * d) * s, cr = c[0] * g, cg = c[1] * g, cb = c[2] * g;
    for (let j = j0, o = (j0 * L.w + n) * 3; j <= j1; j++, o += L.w * 3) { a[o] += cr; a[o + 1] += cg; a[o + 2] += cb; }
  }
}

// The floor's fixed lights, baked into a map of the whole floor whenever
// they change.
function bakeFloorLights(f) {
  View.bakedFrom = View.lights;
  const w = (f.w * TILE + 1) >> 1, h = (f.h * TILE + 1) >> 1;
  if (!View.bake || View.bake.w !== w || View.bake.h !== h) View.bake = { a: new Float32Array(w * h * 3), w, h, x0: 0, y0: 0 };
  else View.bake.a.fill(0);
  for (const s of View.lights) addLight(View.bake, s.x, s.y, s.r, s.i, s.c);
  for (const s of View.floraLights) addLight(View.bake, s.x, s.y, s.r, s.i, s.c);
}

// Starts the view's light for a frame: ambient (r, g, b), plus what's
// baked, on the grid under a camera at world cx, cy.
function startLight(cx, cy, r, g, b) {
  const L = View.light, B = View.bake, a = L.a, s = T.light.bands;
  L.x0 = Math.floor(cx / 2); L.y0 = Math.floor(cy / 2);
  // ambient in steps of 1/127.5, as when light was drawn into a canvas, so
  // flat light dithers the same
  r = Math.floor(r * 127.5) / 127.5 * s; g = Math.floor(g * 127.5) / 127.5 * s; b = Math.floor(b * 127.5) / 127.5 * s;
  for (let j = 0; j < L.h; j++) {
    const by = j + L.y0, row = B && by >= 0 && by < B.h;
    let o = j * L.w * 3;
    for (let n = 0; n < L.w; n++, o += 3) {
      const bx = n + L.x0;
      if (row && bx >= 0 && bx < B.w) { const k = (by * B.w + bx) * 3; a[o] = r + B.a[k]; a[o + 1] = g + B.a[k + 1]; a[o + 2] = b + B.a[k + 2]; }
      else { a[o] = r; a[o + 1] = g; a[o + 2] = b; }
    }
  }
}

// Multiplies the view by the light, in dithered bands (the emissive layer
// over it shows at its own colour). cx, cy: the camera in the
// world, which the dither is fixed to. _bandMul[(band << 8) + v] is v lit
// by that band.
let _bandMul = null, _bandTop = 0;
function lightScene(cx, cy) {
  const w = View.w, h = View.h, Lt = T.light, L = View.light, a = L.a, lw = L.w * 3;
  const img = View.ctx.getImageData(0, 0, w, h), d = img.data;
  LateDots.on = false;
  lateDotsColour(d, w, h);
  if (!_bandMul) {
    _bandTop = Math.ceil(Lt.max * Lt.bands);
    _bandMul = new Uint8ClampedArray((_bandTop + 1) * 256);
    for (let n = 0; n <= _bandTop; n++) for (let v = 0; v < 256; v++) _bandMul[(n << 8) + v] = v * Math.min(Lt.max, n / Lt.bands);
  }
  const M = _bandMul, top = _bandTop, px = cx - 2 * L.x0, py = cy - 2 * L.y0, bt = [0, 0, 0, 0];
  for (let y = 0; y < h; y++) {
    const row = ((y + cy) & 3) * 4, base = ((y + py) >> 1) * lw;
    for (let n = 0; n < 4; n++) bt[(n + cx) & 3] = (BAYER4[row + ((n + cx) & 3)] + 0.5) / 16;
    for (let x = 0, k = y * w * 4; x < w; x++, k += 4) {
      const o = base + ((x + px) >> 1) * 3, t = bt[(x + cx) & 3];
      let q = (a[o] + t) | 0; d[k] = M[((q > top ? top : q) << 8) + d[k]];
      q = (a[o + 1] + t) | 0; d[k + 1] = M[((q > top ? top : q) << 8) + d[k + 1]];
      q = (a[o + 2] + t) | 0; d[k + 2] = M[((q > top ? top : q) << 8) + d[k + 2]];
    }
  }
  View.ctx.putImageData(img, 0, 0);
  lateDotsGlow(w, h);
  LateDots.q.length = 0;
}

// Bloom from the emissive layer, soft at low resolution so it still reads
// as pixels: each pass shrunk, summed at the finest pass's size, then
// drawn into the overlay, which the browser adds over the view.
function bloomScene() {
  const sum = View.bloomSum, sx = sum.getContext('2d');
  sx.globalCompositeOperation = 'copy';
  View.blooms.forEach(([c, a], n) => {
    const bx = c.getContext('2d');
    bx.imageSmoothingEnabled = true;
    bx.globalCompositeOperation = 'copy';
    bx.drawImage(View.em, 0, 0, c.width, c.height);
    sx.imageSmoothingEnabled = true;
    sx.globalAlpha = a;
    sx.drawImage(c, 0, 0, sum.width, sum.height);
    sx.globalCompositeOperation = 'lighter';
  });
  sx.globalAlpha = 1;
  const x = View.bloomCtx;
  x.imageSmoothingEnabled = true;
  x.globalCompositeOperation = 'copy';
  x.drawImage(sum, 0, 0, View.w, View.h);
}

// ---------------------------------------------------------------------------
// A frame
// ---------------------------------------------------------------------------
function renderFrame() {
  const x = View.ctx;
  if (!x || !View.w) return;
  x.fillStyle = '#000';
  x.fillRect(0, 0, View.w, View.h);
  View.overCtx.clearRect(0, 0, View.w, View.h);
  LateDots.on = false; LateDots.q.length = 0;
  const d = Game.dive;
  if (!d) { View.emCtx.clearRect(0, 0, View.w, View.h); View.bloomCtx.clearRect(0, 0, View.w, View.h); return; }
  const f = d.floor, p = d.p, Lt = T.light, star = ART.pal.star;
  if (View.floorFor !== f) paintFloor(f);
  const fw = f.w * TILE, fh = f.h * TILE;
  const camX = (View.camX = Math.round(fw <= View.w ? (fw - View.w) / 2 : clamp(p.x - View.w / 2, 0, fw - View.w)));
  // at home the camera looks further up, to keep the star in sight
  const lookUp = d.hub ? 56 : 8;
  const camY = (View.camY = Math.round(fh <= View.h ? (fh - View.h) / 2 : clamp(p.y - lookUp - View.h / 2, 0, fh - View.h)));
  const sh = View.shake > 0.3 ? View.shake : 0;
  const ox = -camX + Math.round(FX_R.f(-sh, sh)), oy = -camY + Math.round(FX_R.f(-sh, sh)), ex = View.emCtx;
  const tick = Math.floor(Game.realT * 8);
  ex.clearRect(0, 0, View.w, View.h);
  x.drawImage(View.floorCol, ox, oy);
  ex.drawImage(View.floorEm, ox, oy);
  const lights = [];

  // ore twinkles, so it's the one thing in the rock that catches the eye
  const tx0 = Math.max(0, Math.floor(camX / TILE)), ty0 = Math.max(0, Math.floor(camY / TILE));
  for (let ty = ty0; ty <= Math.min(f.h - 1, ty0 + Math.ceil(View.h / TILE) + 1); ty++)
    for (let tx = tx0; tx <= Math.min(f.w - 1, tx0 + Math.ceil(View.w / TILE) + 1); tx++) {
      if (f.tiles[ty * f.w + tx] !== TILE_ORE) continue;
      const h = hashInts(tx, ty, 0x7a1), ph = (Game.realT * 1.6 + (h & 255) / 255) % 1;
      if (ph > 0.22) continue;
      const k = ph < 0.11 ? ph / 0.11 : (0.22 - ph) / 0.11, cx = tx * TILE + ox + 3 + (h >> 8) % 10, cy = ty * TILE + oy + 3 + (h >> 12) % 6;
      dot(cx, cy, '#ffffff', true, k);
      if (k > 0.5) for (const [i, j] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) dot(cx + i, cy + j, ART.ores[T.ores[f.ore[ty * f.w + tx] - 1].id][3], true, k * 0.7);
    }

  // the lodeline: a shimmering beam from the anchor straight up
  if (f.pad && !d.padDark) {
    const bx = (f.pad.x + 0.5) * TILE + ox, bot = (f.pad.y + 0.5) * TILE + oy, half = d.hub ? 3 : Math.max(1, Math.round(3 * Math.min(1, d.pull * 2)));
    if (bot > 0 && bx > -TILE && bx < View.w + TILE) {
      const strip = beamStrip(bx, tick, half), rows = Math.min(bot, View.h);
      if (rows > 0) for (const c of [x, ex]) c.drawImage(strip, 0, 0, 2 * half, rows, bx - half, 0, 2 * half, rows);
      for (let i = 0; i < 6; i++) {
        const y = Math.round(bot - ((Game.realT * 16 + (i * bot) / 6) % bot));
        dot(Math.round(bx - 0.5 + ((i * 7) % (2 * half)) - half), y, star[3], true);
      }
      lights.push({ beam: true, x: bx, y0: 0, y1: bot, r: 1.6 * TILE, i: 0.9, c: rgb01(star[2]) });
      lights.push({ x: bx, y: bot, r: 1.6 * TILE, i: 0.8, c: rgb01(star[3]) });
    }
  }

  if (d.hub) drawHubUnder(d, ox, oy, tick, lights);
  if (!d.hub) drawHazardsUnder(d, ox, oy, tick, lights);
  if (d.fieldForge) {
    const spr = stationSprite('forge'), x = Math.round((d.fieldForge.x + 0.5) * TILE + ox - spr.ax), y = Math.round((d.fieldForge.y + 0.5) * TILE + oy - spr.ay + 6);
    drawArtSprite(spr, x, y);
    lights.push({ x: x + spr.w / 2, y: y + spr.h / 2, r: TILE * 1.8, i: 0.9, c: rgb01(ART.pal.glass[0]) });
  }

  // loot on the floor, then everyone in order of their feet, then what flies
  for (const dr of d.drops) drawDrop(dr, ox, oy, lights);
  const props = (d.hub ? [{ wreck: true, y: (HUB_STATIONS.find((x) => x.id === 'wreck').y + 0.5) * TILE }] : riftProps(d).concat(lifeActors(d))).concat(portalProps(d));
  if (!d.hub) graftLight(d, ox, oy, lights);
  const actors = d.enemies.filter((e) => !e.dead).concat([p], View.flora || [], props).sort((a, b) => a.y - b.y);
  for (const a of actors) {
    if (a === p) drawProspector(d, ox, oy, tick, lights);
    else if (a.wreck) drawWreck(d, ox, oy, lights);
    else if (a.tear) drawRift(d, a, ox, oy, lights);
    else if (a.portal) drawPortal(d, a, ox, oy, lights);
    else if (a.piece) drawFlora(d, a, ox, oy, lights);
    else if (a.crit) drawCritter(d, a, ox, oy);
    else drawEnemy(d, a, ox, oy, tick, lights);
  }
  // from here on (but at home, where the star goes over them) dots are queued
  LateDots.on = !d.hub;
  for (const b of d.bolts) {
    const col = b.element ? ELEMENT_COLS[b.element] : b.kind === 'bolt' ? ART.cores.bolt : '#e8f4ff';
    // a frost lance: a long shard of ice
    if (b.kind === 'frost') {
      const sp = Math.hypot(b.vx, b.vy) || 1;
      for (let k = 0; k < 6; k++) dot(Math.round(b.x + ox - (b.vx / sp) * k), Math.round(b.y + oy - (b.vy / sp) * k), k < 2 ? '#ffffff' : ELEMENT_COLS.frost, true, 1 - k * 0.12);
      lights.push({ x: b.x + ox, y: b.y + oy, r: TILE, i: 0.6, c: rgb01(ELEMENT_COLS.frost) });
      continue;
    }
    dot(Math.round(b.x + ox - b.vx * 0.012), Math.round(b.y + oy - b.vy * 0.012), col, true, 0.5);
    const pts = b.big ? [[0, -1], [-1, 0], [0, 0], [1, 0], [0, 1], [-1, -1], [1, 1], [1, -1], [-1, 1], [2, 0], [-2, 0], [0, 2], [0, -2]] : [[0, 0], [1, 0], [0, 1], [1, 1]];
    for (const [i, j] of pts) dot(Math.round(b.x + ox) + i - (b.big ? 0 : 1), Math.round(b.y + oy) + j - (b.big ? 0 : 1), i === 0 && j === 0 && b.big ? '#ffffff' : col, true);
    lights.push({ x: b.x + ox, y: b.y + oy, r: TILE, i: 0.7, c: rgb01(col) });
  }
  const shotCol = artBiome(f).glow;
  for (const sh of d.shots) {
    const sx = Math.round(sh.x + ox), sy = Math.round(sh.y + oy);
    for (const [i, j] of [[0, -1], [-1, 0], [0, 0], [1, 0], [0, 1]]) dot(sx + i, sy + j, i || j ? shotCol : '#ffffff', true);
    lights.push({ x: sx, y: sy, r: TILE, i: 0.6, c: rgb01(shotCol) });
  }
  for (const pu of d.puddles) {
    const k = Math.min(1, pu.t / 0.6), cx = Math.round(pu.x + ox), cy = Math.round(pu.y + oy), col = pu.mine ? ELEMENT_COLS.ember : PLANT_GLOW;
    for (let n = 0; n < 14; n++) {
      const a = n * 2.4 + pu.max, r = (n % 4) / 4 * pu.r;
      dot(Math.round(cx + Math.cos(a + Game.realT * 0.6) * r), Math.round(cy + Math.sin(a) * r * 0.7 - (pu.mine ? (Game.realT * 8 + n) % 4 : 0)), n % 3 ? mix(col, '#000000', 0.4) : col, true, 0.55 * k);
    }
    lights.push({ x: cx, y: cy, r: TILE * 1.1, i: 0.4 * k, c: rgb01(col) });
  }
  for (const g of d.globs) {
    const gx = Math.round(g.x + ox), gy = Math.round(g.y + oy), col = g.mine ? ELEMENT_COLS.ember : PLANT_GLOW;
    for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1]]) dot(gx + i, gy + j, j < 0 || i < 0 ? '#ffd0a0' : col, true);
    lights.push({ x: gx, y: gy, r: TILE, i: 0.6, c: rgb01(col) });
  }
  for (const au of d.auras) {
    const cx = Math.round(au.x + ox), cy = Math.round(au.y + oy - (au.follow ? 6 : 0)), k = Math.min(1, au.t / 0.4);
    if (au.kind === 'thorns') {
      // thorns turning round the diver
      for (let n = 0; n < 28; n++) {
        const a = (n / 28) * Math.PI * 2 + Game.realT * 2, spike = n % 2 === 0, x = Math.round(cx + Math.cos(a) * au.r), y = Math.round(cy + Math.sin(a) * au.r * 0.75);
        dot(x, y, spike ? ELEMENT_COLS.blight : '#4a5a30', spike, k);
        if (spike) dot(Math.round(x + Math.cos(a) * 2), Math.round(y + Math.sin(a) * 1.5), '#d8f0a0', true, k);
      }
      lights.push({ x: cx, y: cy, r: au.r * 1.2, i: 0.35 * k, c: rgb01(ELEMENT_COLS.blight) });
    } else {
      // a gravity well: a dark spiral drawing in
      for (let n = 0; n < 24; n++) {
        const a = n * 0.7 - Game.realT * 5, r = ((n * 3 + Game.realT * 30) % au.r);
        dot(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * 0.75), n % 3 ? '#2a1848' : ART.cores.well, true, k * (1 - r / au.r));
      }
      lights.push({ x: cx, y: cy, r: au.r, i: 0.5 * k, c: rgb01(ART.cores.well) });
    }
  }
  for (const fx of d.fx) drawCombatFx(fx, ox, oy, tick, lights);
  if (d.hub) drawHubOver(d, ox, oy, lights);
  for (const s of Sparks) dot(Math.round(s.x + ox), Math.round(s.y + oy), s.col, true);
  if (!d.hub) drawHazardsAir(d, ox, oy, lights);
  drawLifeAir(d, ox, oy, lights);
  if (!d.hub) drawStorm(d, ox, oy, lights);
  const fx = Math.round(p.x + ox), fy = Math.round(p.y + oy);

  // light it: ambient, the floor's lights in view, the lodeline, the lamp
  // a clime may set its own sun, or its own dark (T.climes)
  const cl = climeLight(f), zl0 = !d.hub && T.zones[d.zone] && T.zones[d.zone].light, zl = zl0 && cl ? Object.assign({}, zl0, cl) : zl0;
  const ambLevel = d.hub ? Lt.hubAmbient : zl ? lerp(zl.dusk, zl.day, clamp(d.pull, 0, 1)) : cl && cl.ambient !== undefined ? cl.ambient : Lt.ambient;
  const tint = zl ? zl.tint.map((c, i) => lerp(Lt.tint[i], c, clamp(d.pull * 1.5, 0, 1))) : (cl && cl.tint) || Lt.tint;
  const L = View.light;
  if (View.bakedFrom !== View.lights) bakeFloorLights(f);
  startLight(-ox, -oy, ambLevel * tint[0], ambLevel * tint[1], ambLevel * tint[2]);
  for (const s of lights) {
    if (s.beam) addBeamLight(L, s.x - ox, s.y0 - oy, s.y1 - oy, s.r, s.i, s.c);
    else addLight(L, s.x - ox, s.y - oy, s.r, s.i, s.c);
  }
  // the lamp gutters out as the diver dies, and dims as the star's pull fades
  let lamp = d.dying > 0 ? Math.max(0.15, d.dying / 1.4) : 1;
  if (!d.hub && d.pull < T.pull.dimAt) lamp *= lerp(T.pull.lampMin, 1, d.pull / T.pull.dimAt);
  // in daylight the lamp isn't needed; it comes on at dusk
  if (zl && d.pull > zl.lampAt) lamp *= 0.15;
  // a channel home: a ring filling round the diver, the light swelling
  if (d.channel) {
    const k = d.channel.t / d.channel.max, col = d.channel.kind === 'recall' ? '#c9a2ff' : d.channel.kind === 'seal' ? RIFT_PAL.riftedge[0] : ART.pal.star[3];
    const n = 28;
    for (let i = 0; i < n * k; i++) { const a = -Math.PI / 2 + (i / n) * Math.PI * 2; dot(Math.round(fx + Math.cos(a) * 12), Math.round(fy - 8 + Math.sin(a) * 9), col, true); }
    lights.push({ x: fx, y: fy - 8, r: TILE * (1.5 + k * 2), i: 0.6 + k, c: rgb01(col) });
  }
  addLight(L, fx - ox, fy - 17 - oy, Lt.lamp[0] * TILE * lamp * (1 + (d.stats.lamp || 0) / 100), Lt.lamp[1] * lamp, rgb01(ART.pal.lamp[0]));
  lightScene(-ox, -oy);
  bloomScene();
  drawLifeShade(d, ox, oy);

  // on top, unlit: enemies' health, the ore being aimed at, and how far
  // through it the pick is
  const o = View.overCtx;
  for (const e of d.enemies) {
    if (e.dead || e.boss || (e.hp >= e.maxHp && !e.elite)) continue;
    const w = e.r * 2 + 4, bx = Math.round(e.x + ox - w / 2), by = Math.round(e.y + oy) - (e.type === 'wisp' ? 22 : e.type === 'construct' ? 20 : 16);
    o.fillStyle = '#000'; o.fillRect(bx - 1, by - 1, w + 2, 3);
    o.fillStyle = e.elite ? ELITE_COLS[e.elite] : '#d04848'; o.fillRect(bx, by, Math.max(1, Math.round((w * e.hp) / e.maxHp)), 1);
  }
  const boss = d.enemies.find((e) => e.boss && !e.dead && e.aggro);
  if (boss) {
    const w = Math.min(View.w - 24, 140), bx = Math.round((View.w - w) / 2);
    o.fillStyle = '#000'; o.fillRect(bx - 1, 5, w + 2, 4);
    o.fillStyle = '#c04040'; o.fillRect(bx, 6, Math.round((w * boss.hp) / boss.maxHp), 2);
  }
  for (const n of d.nums) {
    const col = n.col || (n.hurt ? '#ff6a5a' : n.elem ? ELEMENT_COLS[n.elem] : n.crit ? '#ffd34d' : '#f4ecd8'), nx = Math.round(n.x + ox), ny = Math.round(n.y + oy);
    drawNumber(n.v, nx + (n.plus ? 2 : 0), ny, col, Math.min(1, n.t * 3));
    // a pickup: a + before it
    if (n.plus) {
      const px = nx + 2 - Math.floor((String(n.v).length * 4 - 1) / 2) - 4;
      o.globalAlpha = Math.min(1, n.t * 3);
      for (const [c, k] of [['#000000', 1], [col, 0]]) { o.fillStyle = c; o.fillRect(px + k, ny + 2 + k, 3, 1); o.fillRect(px + 1 + k, ny + 1 + k, 1, 3); }
      o.globalAlpha = 1;
    }
  }
  if (d.target) {
    const tx = d.target.tx * TILE + ox, ty = d.target.ty * TILE + oy;
    o.fillStyle = Input.mining() ? '#fff2c8' : 'rgba(255,242,200,0.5)';
    for (const [cx, cy] of [[0, 0], [TILE - 3, 0], [0, TILE - 3], [TILE - 3, TILE - 3]]) { o.fillRect(tx + cx, ty + cy + (cy ? 2 : 0), 3, 1); o.fillRect(tx + cx + (cx ? 2 : 0), ty + cy, 1, 3); }
    if (p.mine && !p.mine.refused) {
      o.fillStyle = '#000'; o.fillRect(tx + 1, ty - 4, TILE - 2, 3);
      o.fillStyle = star[2]; o.fillRect(tx + 2, ty - 3, Math.round((TILE - 4) * Math.min(1, p.mine.prog)), 1);
    }
  }
  // the tools' marks and the outpost's labels too
  View.ctx = o;
  try { drawToolHud(d, ox, oy); if (d.hub) drawStationLabels(d, ox, oy); else drawStormMark(d, ox, oy); } finally { View.ctx = x; }
  // stepping through a portal, or just through one: over everything
  drawPortalIris(d, ox, oy);
}

// ---------------------------------------------------------------------------
// The people in it
// ---------------------------------------------------------------------------
const ELITE_COLS = { fast: '#7fe8ff', tough: '#ffd34d', volatile: '#ff5a3a' };
const ELEMENT_COLS = { shock: '#7fe8ff', frost: '#c8f0ff', ember: '#ff8a3a', blight: '#9ad04a' };
// Which flora piece each biome's fighting plants look like.
const PLANT_LOOKS = {
  rim: { snapjaw: 'Pitcher', spitter: 'Puffballs' },
  choir: { snapjaw: 'Bell flower', spitter: 'Spore sac' },
  underforge: { snapjaw: 'Vent flower', spitter: 'Cinder pods' },
};
const PLANT_GLOW = '#ff4a3a';
const _enemySprites = {};
function enemySprite(d, type) {
  const id = d.hub ? 'rim' : T.biomes[d.biome].id;
  // the fighting flora dress as the plants of the clime they're in
  if ((type === 'snapjaw' || type === 'spitter') && !d.hub && d.floor.clime && CLIME_FLORA[d.floor.clime]) {
    const set = d.floor.clime, key = 'plant/' + set + '/' + type;
    if (!_enemySprites[key]) {
      const kit = floraKit(set), piece = kit.pieces.find((p) => p.name === kit.looks[type]) || kit.pieces[0], pal = Object.assign({}, kit.pal);
      for (const g of kit.glows) pal[g] = [g === 'glow2' ? mix(PLANT_GLOW, '#ffd0a0', 0.4) : PLANT_GLOW];
      const spr = buildArtSprite(piece.frames[piece.frames.length - 1], pal, kit.letters, kit.glows);
      spr.flash = tinted(spr.c, '#ffffff'); spr.ax = spr.w / 2; spr.ay = spr.h - 1.5;
      _enemySprites[key] = spr;
    }
    return _enemySprites[key];
  }
  if (type === 'keeper') {
    const key = 'keeper/' + id;
    if (!_enemySprites[key]) { const s = art2Sprite(KEEPER_ROWS[id], KEEPER_PAL[id]); s.flash = tinted(s.c, '#ffffff'); s.ax = s.w / 2; s.ay = s.h - 2; _enemySprites[key] = s; }
    return _enemySprites[key];
  }
  if (!_enemySprites[id]) {
    const out = (_enemySprites[id] = buildEnemySprites(id));
    // the fighting flora: a harmless piece's shape, its glow gone red
    for (const kind of ['snapjaw', 'spitter']) {
      const piece = FLORA[id].find((p) => p.name === PLANT_LOOKS[id][kind]) || FLORA[id][0];
      const pal = Object.assign({}, FLORA_PAL[id], { glow: [PLANT_GLOW], glow2: [mix(PLANT_GLOW, '#ffd0a0', 0.4)] });
      const spr = buildArtSprite(piece.frames[piece.frames.length - 1], pal, FLORA_LETTERS, FLORA_GLOWS);
      spr.flash = tinted(spr.c, '#ffffff'); spr.ax = spr.w / 2; spr.ay = spr.h - 1.5;
      out[kind] = spr;
    }
  }
  return _enemySprites[id][type];
}

function drawShadow(fx, fy, rx) {
  const x = View.ctx;
  x.fillStyle = 'rgba(0,0,0,0.45)';
  x.fillRect(fx - rx + 1, fy - 1, rx * 2 - 1, 3);
  x.fillRect(fx - rx, fy, rx * 2 + 1, 1);
}

function drawProspector(d, ox, oy, tick, lights) {
  const p = d.p;
  const walking = p.walkT > 0;
  const frame = walking ? 1 + (Math.floor(p.walkT * 10) % 4) : 0;
  const spr = Sprites.diver[facingIndex(p.fx, p.fy)][frame];
  const fx = Math.round(p.x + ox), fy = Math.round(p.y + oy);
  const sx = Math.round(fx - spr.ax), sy = Math.round(fy - spr.ay);
  drawShadow(fx, fy, 5);
  // a hand on the far side, or both facing away, is drawn behind the body
  const side = Math.abs(p.fx) > Math.abs(p.fy) + 0.2, away = p.fy < -0.3 && !(p.swing && p.swing.spin);
  const behind = (slot) => away || (side && slot === 'off');
  drawHeld(d, spr, sx, sy, tick, lights, (slot) => behind(slot));
  // blink while hurt; fall still while dying
  if (!(p.invuln > 0 && p.dashT <= 0 && tick % 2) && !(d.dying > 0 && tick % 3 === 0)) drawArtSprite(spr, sx, sy);
  drawHeld(d, spr, sx, sy, tick, lights, (slot) => !behind(slot));
  if (p.ward > 0) ringDots(fx, fy - 10, 12, ART.cores.ward, 0.5 + 0.3 * Math.sin(Game.realT * 6), true);
  // a charging hand gathers light, and flashes when it's full
  for (const slot of ['main', 'off']) {
    const h = p.hands[slot], lv = h.holding ? chargeLevel(h) : 0;
    if (lv <= 0) continue;
    const col = handKind(Save.data.equip[slot]) === 'focus' ? ART.cores.bolt : '#fff2c8';
    ringDots(fx, fy - 10, 15 - lv * 5, col, lv >= 1 ? (tick % 2 ? 1 : 0.5) : 0.25 + lv * 0.5, true);
    lights.push({ x: fx, y: fy - 10, r: TILE * (0.8 + lv), i: 0.3 + lv * 0.6, c: rgb01(col) });
  }
  if (p.mine && !p.mine.refused && d.target) {
    const phase = tick % 4, striking = phase >= 2, hand = handOf(p, spr, sx, sy, 'main');
    const hx = hand.x, hy = hand.y - (striking ? 0 : 1);
    const tx = (d.target.tx + 0.5) * TILE + ox - hx, ty = (d.target.ty + 0.5) * TILE + oy - hy;
    const m = Math.hypot(tx, ty) || 1;
    const head = striking ? { x: hx + (tx / m) * 8, y: hy + (ty / m) * 8 } : { x: hx + (p.fx < 0 ? -4 : 4), y: hy - 7 };
    const wood = ART.pal.wood, tool = ART.pal.tool;
    pixelLine(hx, hy, head.x, head.y, wood[2]);
    pixelLine(head.x - 2, head.y - 1, head.x + 2, head.y - 1, tool[3]);
    pixelLine(head.x - 2, head.y, head.x + 2, head.y, tool[1]);
    if (phase === 2) lights.push({ x: head.x, y: head.y, r: 1.1 * TILE, i: 0.8, c: [1, 0.8, 0.6] });
  }
  drawDrone(d, fx, fy, lights);
}

// The diver's drone: a little orb that drifts after it, over its back
// shoulder, bobbing, its eye turned the way the diver looks.
function drawDrone(d, fx, fy, lights) {
  const p = d.p, dt = clamp(Game.realT - (d.droneT || Game.realT), 0, 0.1);
  d.droneT = Game.realT;
  const tx = p.x - p.fx * 7 - p.fy * 6, ty = p.y - p.fy * 4 + p.fx * 3 - 20;
  if (!d.drone) d.drone = { x: tx, y: ty };
  const k = 1 - Math.exp(-5 * dt);
  d.drone.x += (tx - d.drone.x) * k; d.drone.y += (ty - d.drone.y) * k;
  const x = Math.round(d.drone.x + fx - p.x), y = Math.round(d.drone.y + fy - p.y + Math.sin(Game.realT * 3) * 1.5);
  const plate = DIVER_PAL.plate, eye = DIVER_PAL.tip[0], under = DIVER_PAL.chest[0];
  for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
    if (i * i * 0.8 + j * j > 4.6) continue;
    const c = j < -1 || (j < 0 && i < 0) ? plate[3] : j > 0 ? plate[1] : plate[2];
    dot(x + i, y + j, c);
  }
  for (const [i, j] of [[-3, 0], [3, 0], [0, -3], [-2, -2], [2, -2], [-2, 2], [2, 2], [0, 3]]) dot(x + i, y + j, '#050407');
  dot(x - 1, y - 3, DIVER_PAL.metal[3]); dot(x + 1, y - 4, DIVER_PAL.metal[2]);
  dot(x + Math.round(p.fx * 1.4), y + Math.round(p.fy), eye, true);
  dot(x, y + 3, under, true, 0.8);
  lights.push({ x, y, r: TILE * 1.1, i: 0.45, c: rgb01(eye) });
}

// Where a hand is on the screen: the main hand from the sprite; the off
// hand mirrored across it, or just behind it seen from the side.
function handOf(p, spr, sx, sy, slot) {
  const h = spr.hand;
  if (slot === 'main') return { x: sx + h.x, y: sy + h.y };
  if (Math.abs(p.fx) > Math.abs(p.fy) + 0.2) return { x: sx + h.x - Math.sign(p.fx) * 4, y: sy + h.y - 1 };
  return { x: sx + spr.w - 1 - h.x, y: sy + h.y };
}

// The weapons in hand: a blade (swinging through its arc, with a slash of
// light behind it), or a focus, a glowing orb over the hand. which(slot):
// whether to draw that hand now (behind the body, or in front).
function drawHeld(d, spr, sx, sy, tick, lights, which) {
  const p = d.p, eq = Save.data.equip;
  if (p.mine && !p.mine.refused) return;
  for (const slot of ['main', 'off']) {
    const it = eq[slot];
    if (!which(slot) || (!it && slot === 'off')) continue;
    const hand = handOf(p, spr, sx, sy, slot), sw = p.swing && p.swing.slot === slot ? p.swing : null;
    if (handKind(it) === 'focus') { drawFocusHeld(d, it, hand, lights); continue; }
    if (!it) continue;
    const ramp = it.tier >= 1 ? ART.ores[oreOfTier(it.tier).id] : ART.pal.steel;
    const face = Math.atan2(p.fy, p.fx);
    let a, len = 10;
    if (sw) {
      const k = 1 - sw.t / sw.max;
      if (sw.spin) a = sw.a + k * Math.PI * 2;
      else { const reach = sw.heavy ? 1.6 : 1.2; a = sw.a + sw.side * (-reach + 2 * reach * k); }
      len = sw.heavy ? 12 : 11;
      // the slash of light behind the edge
      const steps = 7;
      for (let n = 1; n <= steps; n++) {
        const b = sw.spin ? a - n * 0.35 : a - sw.side * n * 0.16 * (sw.heavy ? 1.4 : 1);
        for (const r of [len - 2, len, len + 2]) dot(Math.round(hand.x + Math.cos(b) * r), Math.round(hand.y + Math.sin(b) * r * 0.85), r === len ? ramp[3] : ramp[2], true, (1 - n / (steps + 1)) * 0.7);
      }
      lights.push({ x: hand.x + Math.cos(a) * 8, y: hand.y + Math.sin(a) * 7, r: TILE * 1.2, i: 0.6, c: rgb01(ramp[3]) });
    } else a = face + (slot === 'main' ? 1 : -1) * 1.1 + Math.sin(Game.realT * 2) * 0.05;
    const c = Math.cos(a), sn = Math.sin(a), style = (bpOf(it) || {}).style || 'blade';
    const glow = it.rarity === 'legendary' || it.rarity === 'set' || it.rarity === 'rare';
    const elem = it.element ? ELEMENT_COLS[it.element] : null;
    const at = (r, side = 0) => ({ x: Math.round(hand.x + c * r - sn * side), y: Math.round(hand.y + (sn * r + c * side) * 0.85) });
    if (style === 'spear') {
      // a long shaft, a narrow head
      for (let r = -3; r <= len + 4; r++) { const q = at(r); dot(q.x, q.y, r > len ? ramp[3] : r > len - 4 ? ramp[2] : ART.pal.wood[2], (glow || elem) && r > len, 1); }
      const tip = at(len + 1, 1); dot(tip.x, tip.y, ramp[1]);
    } else if (style === 'hammer') {
      // a haft, and a heavy head across it
      for (let r = -1; r <= len - 3; r++) { const q = at(r); dot(q.x, q.y, ART.pal.wood[2]); }
      for (let r = len - 4; r <= len; r++) for (const side of [-2, -1, 0, 1, 2]) { const q = at(r, side); dot(q.x, q.y, side === -2 || r === len ? ramp[3] : ramp[1 + (r + side) % 2]); }
      if (elem || glow) { const q = at(len - 2); dot(q.x, q.y, elem || ramp[3], true); }
    } else if (style === 'whip') {
      // a grip, then a chain curling out to a blade tip
      dot(Math.round(hand.x - c), Math.round(hand.y - sn), ART.pal.leather[2]);
      const reach = sw ? 18 : 9;
      for (let r = 1; r <= reach; r++) {
        const curl = Math.sin(r * 0.5 + Game.realT * (sw ? 20 : 3)) * (sw ? 1 : 2.5) * (r / reach), q = at(r, curl);
        dot(q.x, q.y, r % 2 ? ramp[2] : ramp[1]);
      }
      const tip = at(reach + 1); dot(tip.x, tip.y, elem || ramp[3], !!elem || glow);
    } else {
      // the grip and guard, then the blade, its edge catching the light
      dot(Math.round(hand.x - c), Math.round(hand.y - sn), ART.pal.leather[2]);
      for (const g of [-2, -1, 1, 2]) dot(Math.round(hand.x + c * 1.5 - sn * g * 0.8), Math.round(hand.y + sn * 1.5 + c * g * 0.8), ART.pal.metal[3]);
      for (let r = 2; r <= len; r++) {
        const x = Math.round(hand.x + c * r), y = Math.round(hand.y + sn * r * 0.85), lit = (glow || elem) && r > len - 3;
        dot(x, y, r === len ? ramp[3] : elem && r > len - 3 ? elem : ramp[2], lit, lit ? 0.9 : 1);
        dot(Math.round(x - sn), Math.round(y + c), ramp[1]);
      }
    }
    if (elem) lights.push({ x: hand.x + c * len * 0.7, y: hand.y + sn * len * 0.6, r: TILE * 0.8, i: 0.35, c: rgb01(elem) });
  }
}

function drawFocusHeld(d, it, hand, lights) {
  const p = d.p, core = it && it.sockets && it.sockets.find(Boolean);
  const col = core ? ART.cores[core.core] : '#9fe8ff';
  const bob = Math.round(Math.sin(Game.realT * 4 + (hand.x & 3)) * 1);
  const x = hand.x, y = hand.y - 3 + bob, flare = p.cast ? p.cast.t / p.cast.max : 0;
  for (const [i, j] of [[0, -1], [-1, 0], [0, 0], [1, 0], [0, 1]]) dot(x + i, y + j, i || j ? col : '#ffffff', true);
  if (flare > 0) ringDots(x, y, 3 + (1 - flare) * 5, col, flare, true);
  lights.push({ x, y, r: TILE * (0.9 + flare), i: 0.5 + flare, c: rgb01(col) });
}

function drawEnemy(d, e, ox, oy, tick, lights) {
  const spr = enemySprite(d, e.type), x = View.ctx;
  let lift = 0;
  if (e.type === 'wisp' || e.type === 'hollow') lift = 5 + Math.round(Math.sin(e.bob * 3) * 1.5);
  else if (T.enemies[e.type].rooted) lift = e.state === 'windup' ? 1 : 0;
  else if ((e.state === 'chase' || e.state === 'circle') && Math.floor(e.bob * 8) % 2) lift = 1;
  else if (e.state === 'lunge') lift = 2;
  const shake = e.state === 'windup' ? (tick % 2 ? 1 : -1) : 0;
  const fx = Math.round(e.x + ox), fy = Math.round(e.y + oy);
  if (fx < -40 || fy < -10 || fx > View.w + 40 || fy > View.h + 50) return;
  drawShadow(fx, fy, Math.max(3, e.r));
  const sx = Math.round(fx - spr.ax) + shake, sy = Math.round(fy - spr.ay - lift);
  if (e.flash > 0) {
    x.drawImage(spr.flash, sx, sy);
    const ex = View.emCtx;
    ex.globalCompositeOperation = 'destination-out'; ex.drawImage(spr.c, sx, sy);
    ex.globalCompositeOperation = 'source-over'; ex.drawImage(spr.flash, sx, sy);
  } else drawArtSprite(spr, sx, sy);
  const pal = ENEMY_PAL[T.biomes[d.biome].id];
  // their eyes and cores light the floor round them, brighter as they wind up
  const glow = e.type === 'crawler' ? ART.pal.eyeglow[0] : e.type === 'wisp' ? pal.crystal[0] : e.type === 'hollow' ? '#ff2a6a' : e.type === 'keeper' ? ART.pal.star[3] : T.enemies[e.type].rooted ? PLANT_GLOW : pal.rune[0];
  lights.push({ x: fx, y: fy - spr.h / 2, r: (e.type === 'keeper' ? 3.5 : e.boss ? 2.4 : e.type === 'wisp' ? 1.5 : 0.9) * TILE, i: e.state === 'windup' ? 1.2 : 0.5, c: rgb01(glow) });
  // tells: a crawler's line before it lunges, a construct's charge line,
  // stars round anything dazed
  if (e.state === 'windup' && e.type === 'snapjaw') ringDots(fx, fy - 4, T.enemies.snapjaw.reach, PLANT_GLOW, tick % 2 ? 0.7 : 0.35, true);
  else if (e.state === 'windup' && e.type === 'spitter') ringDots(Math.round(e.aimX + ox), Math.round(e.aimY + oy), T.enemies.spitter.puddle / 2, PLANT_GLOW, tick % 2 ? 0.8 : 0.4, true);
  else if (e.state === 'windup' && e.aimX !== undefined) {
    const def = T.enemies[e.type], reach = e.type === 'crawler' ? def.lungeSpeed * def.lungeTime : def.chargeSpeed * def.chargeTime;
    const a = norm(e.aimX - e.x, e.aimY - e.y), col = e.type === 'crawler' ? ART.pal.eyeglow[0] : pal.rune[0];
    for (let r = 6; r < reach; r += 4) dot(Math.round(fx + a.x * r), Math.round(fy + a.y * r), col, true, (tick % 2 ? 0.8 : 0.45) * (1 - r / reach / 1.5));
  }
  if (e.state === 'dazed' || e.state === 'stagger')
    for (let k = 0; k < 3; k++) { const a = Game.realT * 6 + (k * Math.PI * 2) / 3; dot(Math.round(fx + Math.cos(a) * 6), Math.round(sy - 2 + Math.sin(a) * 2), '#fff2c8', true); }
  // an elite wears a pip of its affix's colour; a chilled one, a pale one
  if (e.elite) for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1]]) dot(fx + i, sy - 3 + j, ELITE_COLS[e.elite], true);
  // through a tear: violet and cyan motes drift off it
  if (e.riftTouched) for (let k = 0; k < 3; k++) { const ph = (Game.realT * 0.8 + k / 3) % 1; dot(Math.round(fx + Math.sin(k * 2.1 + Game.realT * 2) * 6), Math.round(fy - 4 - ph * 14), k % 2 ? RIFT_PAL.riftcyan[0] : RIFT_PAL.riftedge[0], true, 1 - ph); }
  // a raging Keeper burns
  if (e.enraged) { for (let k = 0; k < 4; k++) dot(fx + FX_R.i(-10, 10), fy - FX_R.i(4, 26), k % 2 ? '#ff4a2a' : '#ffb04a', true, 0.8); lights.push({ x: fx, y: fy - 12, r: TILE * 2, i: 0.6, c: [1, 0.35, 0.2] }); }
  if (e.slowT > 0) dot(fx + 3, sy - 2, '#c8f0ff', true);
  if (e.burn && tick % 2) dot(fx + FX_R.i(-4, 4), fy - FX_R.i(2, 12), ELEMENT_COLS.ember, true);
  if (e.blight && tick % 3 === 0) dot(fx + FX_R.i(-4, 4), fy - FX_R.i(0, 8), ELEMENT_COLS.blight, true);
}

function drawDrop(dr, ox, oy, lights) {
  const fx = Math.round(dr.x + ox), fy = Math.round(dr.y + oy) - 3 - Math.round(Math.sin(dr.t * 3 + dr.x) * 1.2);
  let col;
  if (dr.mote) col = '#c8ffd8';
  else if (dr.stuff) { const pk = parsePart(dr.stuff); col = ART.ores[dr.stuff] ? ART.ores[dr.stuff][2] : pk ? ART.parts[pk.kind] : ART.exotics[dr.stuff]; }
  else if (dr.blueprint) col = ART.rarity.legendary;
  else if (dr.shard !== undefined) col = ART.pal.star[3];
  else if (dr.echo) col = '#9fc4ff';
  else if (dr.exotic) col = ART.exotics[dr.exotic];
  else col = ART.rarity[dr.item.rarity] || '#ffffff';
  if (dr.mote) { for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1]]) dot(fx + i, fy + j, col, true); }
  else if (dr.stuff) {
    // a little heap of crystals
    for (const [i, j] of [[-2, 1], [-1, 0], [-1, 1], [0, -1], [0, 0], [0, 1], [1, 0], [1, 1], [2, 1]]) dot(fx + i, fy + j + 3, j < 0 ? '#ffffff' : col, true);
  }
  else {
    for (const [i, j] of [[0, -2], [-1, -1], [0, -1], [1, -1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [0, 2]]) dot(fx + i, fy + j, (i || j) ? col : '#ffffff', true);
    // the best of it stands up in a beam, so it's seen from across a room
    const it = dr.item;
    if (dr.blueprint || dr.shard !== undefined || dr.echo || (it && (it.rarity === 'rare' || it.rarity === 'legendary' || it.rarity === 'set' || it.rarity === 'relic')))
      for (let k = 3; k < 18; k++) dot(fx, fy - k, col, true, 0.7 * (1 - k / 18));
  }
  lights.push({ x: fx, y: fy, r: TILE, i: 0.5, c: rgb01(col) });
}

// A circle of dots
function ringDots(cx, cy, r, col, alpha, glow) {
  const n = Math.max(8, Math.round(r * 2.4));
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    dot(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * 0.75), col, glow, alpha);
  }
}

function drawCombatFx(fx, ox, oy, tick, lights) {
  const k = fx.t / fx.max, cx = fx.x + ox, cy = fx.y + oy;
  if (fx.kind === 'swing') {
    // a pale arc where the blade went
    const a0 = Math.atan2(fx.dy, fx.dx);
    for (let s = -5; s <= 5; s++) {
      const a = a0 + s * 0.2 * (1.2 - k * 0.4);
      for (const r of [11, 14, 17]) dot(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * 0.8), '#f4ecd8', true, k * (r === 14 ? 0.9 : 0.45));
    }
  } else if (fx.kind === 'spin') {
    ringDots(cx, cy, fx.r * (1 - k * 0.5), '#fff2c8', k, true);
    lights.push({ x: cx, y: cy, r: fx.r * 1.4, i: 0.8 * k, c: [1, 0.95, 0.8] });
  } else if (fx.kind === 'ghost') {
    // a dash's afterimage
    const spr = Sprites.diver[facingIndex(fx.fx, fx.fy)][0], x = View.ctx;
    x.globalAlpha = 0.35 * k;
    x.drawImage(spr.flash, Math.round(cx - spr.ax), Math.round(cy - spr.ay));
    x.globalAlpha = 1;
  } else if (fx.kind === 'snap') {
    // jaws closing on where the diver stood
    const a0 = Math.atan2(fx.dy, fx.dx), r = T.enemies.snapjaw.reach * (1 - k * 0.3);
    for (const side of [-1, 1]) for (let s2 = 0; s2 <= 6; s2++) {
      const b = a0 + side * (0.6 - s2 * 0.1) * k;
      dot(Math.round(cx + Math.cos(b) * r * s2 / 6), Math.round(cy + Math.sin(b) * r * s2 / 6), PLANT_GLOW, true, k);
    }
  } else if (fx.kind === 'shatter') {
    for (let n = 0; n < 8; n++) { const a2 = n * 0.8, r = (1 - k) * 12; dot(Math.round(cx + Math.cos(a2) * r), Math.round(cy + Math.sin(a2) * r), '#e8f8ff', true, k); }
  } else if (fx.kind === 'mote') {
    // ore fed to the star, rising from the altar into it
    const t = 1 - k, sx = STAR_AT.x * TILE + ox, sy = STAR_AT.y * TILE + oy, wob = Math.sin(fx.seed * 2.3 + t * 6) * 8 * (1 - t);
    dot(Math.round(lerp(cx, sx, t * t) + wob), Math.round(lerp(cy, sy, t)), ART.pal.star[t > 0.8 ? 3 : 2], true);
  } else if (fx.kind === 'nova') {
    ringDots(cx, cy, fx.r * (1 - k * 0.7), ART.cores.nova, k, true);
    lights.push({ x: cx, y: cy, r: fx.r * 1.3, i: k, c: rgb01(ART.cores.nova) });
  } else if (fx.kind === 'pull') {
    ringDots(cx, cy, fx.r * k, ART.cores.pull, 0.8, true);
  } else if (fx.kind === 'ward') {
    ringDots(cx, cy, 11 + 6 * k, ART.cores.ward, k, true);
  } else if (fx.kind === 'arc') {
    const n = 6;
    let px = cx, py = cy;
    for (let s = 1; s <= n; s++) {
      const tx = cx + ((fx.x2 + ox - cx) * s) / n + (s < n ? FX_R.i(-2, 2) : 0), ty = cy + ((fx.y2 + oy - cy) * s) / n + (s < n ? FX_R.i(-2, 2) : 0);
      pixelLineGlow(px, py, tx, ty, ART.exotics.voltaic);
      px = tx; py = ty;
    }
  } else if (fx.kind === 'blast') {
    ringDots(cx, cy, fx.r * (1 - k * 0.6), '#ff7a3a', k, true);
    lights.push({ x: cx, y: cy, r: fx.r * 1.5, i: 1.2 * k, c: [1, 0.5, 0.25] });
  } else if (fx.kind === 'volatile') {
    if (tick % 2) for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1]]) dot(Math.round(cx) + i, Math.round(cy) - 4 + j, '#ff5a3a', true);
    lights.push({ x: cx, y: cy, r: TILE, i: 0.8, c: [1, 0.35, 0.2] });
  }
}

function pixelLineGlow(x0, y0, x1, y1, col) {
  const n = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let s = 0; s <= n; s++) dot(Math.round(x0 + ((x1 - x0) * s) / n), Math.round(y0 + ((y1 - y0) * s) / n), col, true);
}

// A tiny pixel font for the numbers that pop off hits: 3×5 digits.
const DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001001010010', '111101111101111', '111101111001111'];
function drawNumber(v, cx, cy, col, alpha) {
  if (!Number.isFinite(v) || v >= 1e7) return;
  const s = String(v), x0 = cx - Math.floor((s.length * 4 - 1) / 2), x = View.overCtx;
  x.globalAlpha = alpha;
  for (const [ink, off] of [['#000000', 1], [col, 0]])
    for (let k = 0; k < s.length; k++) {
      const g = DIGITS[s.charCodeAt(k) - 48];
      x.fillStyle = ink;
      for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j * 3 + i] === '1') x.fillRect(x0 + k * 4 + i + off, cy + j + off, 1, 1);
    }
  x.globalAlpha = 1;
}
