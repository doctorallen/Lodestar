'use strict';
// ---------------------------------------------------------------------------
// Drawing. The world is drawn into the #view canvas in art px (AP to a
// world px, ATILE to a tile: art.js), one to a canvas pixel, and CSS scales
// the canvas up by a whole number of device pixels so the pixels (and the
// dithering) stay square. The shorter side of the view shows about
// VIEW_MIN world px. Everything is placed at its world position × AP less
// the camera's, in whole art px: ox, oy below are the camera's offset in art
// px, so a world point x lands at Math.round(x * AP) + ox.
//
// A frame is drawn in two layers, colour (the view) and emissive (what
// glows), then lit: the world dims to an ambient light, each light source
// (the helmet lamp, ore, fungus, the lodeline) adds its colour back, the
// light is cut into a few hard bands. The emissive layer is a canvas
// stacked over the view, so it shows at its own colour; its bloom is
// another over that, which the browser adds on, and what's drawn unlit
// (health bars, numbers) is in a third on top. A floor is painted
// once into pixel buffers when it's entered, and the tiles around a mined
// one are repainted. Sprites carry anchors ax/ay at the feet.
// ---------------------------------------------------------------------------

// The view's shorter side in world px: at least VIEW_MIN, or a step closer
// to it when the next whole scale up still shows VIEW_FIT of it (so a
// phone with 2 device px to a CSS px isn't shown a quarter more).
const VIEW_MIN = 176, VIEW_FIT = 0.9;

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
  const side = Math.min(r.width, r.height) * dpr, min = VIEW_MIN * AP;
  let k = Math.max(1, Math.floor(side / min));
  if (side / (k + 1) >= min * VIEW_FIT) k++;
  const w = Math.ceil((r.width * dpr) / k), h = Math.ceil((r.height * dpr) / k);
  if (w === View.w && h === View.h && k === View.scale) return;
  // w, h: the view in art px; ww, wh: in world px
  View.w = w; View.h = h; View.scale = k; View.ww = w / AP; View.wh = h / AP;
  View.canvas.width = w; View.canvas.height = h;
  View.canvas.style.width = (w * k) / dpr + 'px';
  View.canvas.style.height = (h * k) / dpr + 'px';
  View.ctx.imageSmoothingEnabled = false;
  for (const c of [View.em, View.bloom, View.over]) { c.width = w; c.height = h; c.style.width = View.canvas.style.width; c.style.height = View.canvas.style.height; }
  // the bloom's passes are drawn from the emissive layer in software
  const layer = (cw, ch) => { const c = document.createElement('canvas'); c.width = cw; c.height = ch; return [c, c.getContext('2d', { willReadFrequently: true })]; };
  // the light: a cell for each LC × LC pixels, with a spare row and column
  // for the grid's offset
  const lw = Math.floor(w / LC) + 2, lh = Math.floor(h / LC) + 2;
  View.light = { a: new Float32Array(lw * lh * 3), w: lw, h: lh, x0: 0, y0: 0 };
  View.lightCol = new Int32Array(w + 1);
  // (the bloom's passes are shrunk in world px, so a glow spreads as far)
  const size = (div) => [Math.max(1, Math.round(w / (div * AP))), Math.max(1, Math.round(h / (div * AP)))];
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
    let s = buildArtSprite(rows, DIVER_PAL, DIVER_LETTERS, DIVER_GLOWS, ART_CREATURE);
    s.ax = s.w / 2; s.ay = s.h - footOff(2.5);
    const [hx, hy] = DIVER_HAND[name], hand = { x: spritePt(s, hx), y: spritePt(s, hy) };
    s.hand = hand;
    if (MIRRORED[i]) { s = flippedSprite(s); s.hand = { x: s.w - 1 - hand.x, y: hand.y }; }
    s.flash = tinted(s.c, '#ffffff');
    return s;
  }));
  Sprites.drone = buildArtSprite(DRONE_ROWS, DIVER_PAL, DIVER_LETTERS, DIVER_GLOWS, ART_CREATURE);
}
// The drone's body, drawn by hand at the art's size (artNative): a disc of
// plate with its antenna. Its eye is drawn over it, the way the diver looks.
const DRONE_ROWS = artNative(['....M..', '...M...', '..GGG..', '.GGGGG.', 'GGGGGGG', 'GGGGGGG', 'GGGGGGG', '.GGGGG.', '..GGG..']);

// Which of the eight facings a direction is.
function facingIndex(fx, fy) { return (Math.round(Math.atan2(fy, fx) / (Math.PI / 4)) + 8) % 8; }

// ---------------------------------------------------------------------------
// The floor
// ---------------------------------------------------------------------------
// A floor's look: the outpost's; its clime's (climes.js), if it isn't its
// zone's own; a surface site's (the region's sunlit badlands); a ruin's (its
// region's, paved); else its region's caves.
const _pavedArt = {};
const artBiome = (f) => {
  if (f.hub) return ART.biomes.outpost;
  const cl = climeArt(f);
  if (cl) return cl;
  const id = T.biomes[f.biome].id;
  if (f.zone === 'surface') return ART.surface[id];
  if (f.zone === 'ruin') return _pavedArt[id] || (_pavedArt[id] = Object.assign({}, ART.biomes[id], { paving: true }));
  return ART.biomes[id];
};
const rgb01 = (hex) => rgbOf(hex).map((v) => v / 255);

// ---------------------------------------------------------------------------
// Flora (flora.js, climes.js, art3.js): what grows in each biome, placed by
// habitat and in drifts from the floor's seed (undergrowth.js), so a floor
// always looks the same. Drawn every frame among the actors, sorted by their
// feet, so the diver passes behind the tall ones and through the stands.
// Under the sky they lean in the wind; underground two-frame pieces sway or
// pulse, and anything stirs as something brushes past.
// ---------------------------------------------------------------------------
const _floraSprites = {};
function floraSprite(set, piece, frame) {
  const key = set + '/' + piece.name + '/' + frame;
  if (!_floraSprites[key]) { const k = floraKit(set); _floraSprites[key] = buildArtSprite(piece.frames[frame], k.pal, k.letters, k.glows, { openFoot: piece.anchor === 'ceiling' ? 0 : T.flora.melt.open }); }
  return _floraSprites[key];
}
// Which plants grow on a floor: its clime's own, if it has them; else the
// surface's under the sky, or its biome's.
function floraSetOf(f) { return f.hub ? 'rim' : f.clime && CLIME_FLORA[f.clime] ? f.clime : f.zone === 'surface' ? 'surface' : T.biomes[f.biome].id; }

function placeFlora(f, set) { return placeUndergrowth(f, set); }

// One piece, drawn with its feet (or for a hanging one, its top) at x, y;
// or a row of a stand. A piece on a wall that's been mined away is gone.
function drawFlora(d, fl, ox, oy, lights) {
  if (fl.strip) { drawStandRow(fl, ox, oy); return; }
  if (fl.anchorT >= 0 && !TILE_SOLID[d.floor.tiles[fl.anchorT]]) return;
  const p = fl.piece, sky = View.ug && View.ug.sky;
  const frame = p.frames.length > 1 && !sky ? Math.floor(Game.realT * 2 + fl.phase * 2) % 2 : 0;
  const spr = fl.top ? floraSprite(fl.set, p, frame) : ugMelted(floraSprite(fl.set, p, frame));
  const fx = Math.round(fl.x * AP) + ox, fy = Math.round(fl.y * AP) + oy;
  const sx = Math.round(fx - spr.w / 2), sy = fl.top ? fy : fy - spr.h + 1;
  if (sx > View.w || sy > View.h || sx + spr.w < 0 || sy + spr.h < 0) return;
  drawLeaning(spr.c, ugGlows(spr) ? spr.ec : null, 0, 0, spr.w, spr.h, sx, sy, fl.amp || 0, fl.top, fl.over !== false);
  if (fl.front) drawFootFront(fl, ox, oy);
}

// The plants' glow, baked with the floor's lights (in world px). Under the
// sky the plants don't glow; only pollen catches the light.
function floraLights(list) {
  return list.filter((fl) => fl.piece && !floraKit(fl.set).sky).map((fl) => {
    const h = floraSprite(fl.set, fl.piece, 0).h / AP;
    return { x: fl.x, y: fl.top ? fl.y + h * 0.8 : fl.y - h * 0.65, r: TILE * 1.1, i: T.light.flora, c: rgb01(floraKit(fl.set).pal.glow[0]) };
  });
}

// The floor's rock, art pixel by art pixel (x0..x1, y0..y1 in art px),
// from the smooth wall line, each pixel asking at its middle. Between four
// tile centres that are all rock or all open there's no line to find, so
// only the blocks it crosses ask rockAt pixel by pixel.
function fillRockField(f, x0, y0, x1, y1) {
  const W = f.w * ATILE, R = View.rockPx, H = ATILE / 2, at = (v) => (v + 0.5) / AP - 0.5;
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W, x1); y1 = Math.min(f.h * ATILE, y1);
  const solid = (i, j) => (TILE_SOLID[floorTile(f, i, j)] ? 1 : 0);
  for (let ty = Math.floor((y0 - H) / ATILE); ty * ATILE + H < y1; ty++)
    for (let tx = Math.floor((x0 - H) / ATILE); tx * ATILE + H < x1; tx++) {
      const bx0 = Math.max(x0, tx * ATILE + H), bx1 = Math.min(x1, tx * ATILE + H + ATILE), by0 = Math.max(y0, ty * ATILE + H), by1 = Math.min(y1, ty * ATILE + H + ATILE);
      const a = solid(tx, ty);
      if (a === solid(tx + 1, ty) && a === solid(tx, ty + 1) && a === solid(tx + 1, ty + 1)) { for (let y = by0; y < by1; y++) R.fill(a, y * W + bx0, y * W + bx1); continue; }
      for (let y = by0; y < by1; y++) { const wy = at(y); for (let x = bx0; x < bx1; x++) R[y * W + x] = rockAt(f, at(x), wy) ? 1 : 0; }
    }
}

function paintFloor(f) {
  const P = pixBuf(f.w * ATILE, f.h * ATILE);
  artLatticeFor(P.w, P.h);
  View.floorFor = f; View.floorBuf = P;
  View.rockPx = new Uint8Array(P.w * P.h);
  fillRockField(f, 0, 0, P.w, P.h);
  // what grows here first: its beds are painted with the tiles
  View.flora = placeFlora(f, floraSetOf(f));
  for (let ty = 0; ty < f.h; ty++) for (let tx = 0; tx < f.w; tx++) paintTileArt(f, tx, ty);
  paintGraft(f, 0, 0, f.w - 1, f.h - 1);
  tintRift(f, 0, 0, P.w, P.h);
  View.floorImgs = [new ImageData(P.col, P.w, P.h), new ImageData(P.em, P.w, P.h)];
  let x;
  [View.floorCol, x] = makeCanvas(P.w, P.h); x.putImageData(View.floorImgs[0], 0, 0);
  [View.floorEm, x] = makeCanvas(P.w, P.h); x.putImageData(View.floorImgs[1], 0, 0);
  View.lights = floorLights(f);
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
  const P = View.floorBuf, R = View.rockPx, W = P.w, H = P.h, b = tileArt(f, tx, ty), t = floorTile(f, tx, ty), ox = tx * ATILE, oy = ty * ATILE;
  _tileSeed = hashInts(f.seed, f.depth, tx, ty) | 0;
  const rnd = tileRnd;
  const rock = (x, y) => x < 0 || y < 0 || x >= W || y >= H || R[y * W + x] === 1;
  if (t === TILE_PIT) { paintPitTile(P, rock, ox, oy, b, rnd, f.seed ^ f.depth); return; }
  paintCaveTile(P, rock, ox, oy, b, rnd, f.seed ^ f.depth, R);
  if (f.clime) paintClimeTile(P, f, tx, ty, ox, oy, b);
  paintUndergrowth(P, f, tx, ty, ox, oy, b);
  if (t === TILE_PAD) paintDish(P, ox, oy);
  else if (t === TILE_ORE) {
    const front = !TILE_SOLID[floorTile(f, tx, ty + 1)];
    paintOre(P, ox, oy, b, rnd, ART.ores[T.ores[f.ore[ty * f.w + tx] - 1].id], front ? ATILE - FACE_H : ATILE, front ? FACE_H : 0);
  } else if (t === TILE_ROCK && (hashInts(f.seed, tx, ty, 0x7e1) & 255) < 18) paintRockVein(P, rock, ox, oy, b, rnd);
}

// After mining: the wall line moves round tx, ty, and with it the rims,
// faces and shadows of the tiles about it.
function repaintAround(f, tx, ty) {
  if (View.floorFor !== f) return;
  const T2 = ATILE;
  fillRockField(f, (tx - 1) * T2, (ty - 1) * T2, (tx + 2) * T2, (ty + 2) * T2);
  for (let y = ty - 2; y <= ty + 2; y++) for (let x = tx - 1; x <= tx + 1; x++) if (x >= 0 && y >= 0 && x < f.w && y < f.h) paintTileArt(f, x, y);
  paintGraft(f, tx - 1, ty - 2, tx + 1, ty + 2);
  tintRift(f, (tx - 1) * T2, (ty - 2) * T2, (tx + 2) * T2, (ty + 3) * T2);
  const dx = Math.max(0, tx - 1) * T2, dy = Math.max(0, ty - 2) * T2;
  View.floorCol.getContext('2d').putImageData(View.floorImgs[0], 0, 0, dx, dy, 3 * T2, 5 * T2);
  View.floorEm.getContext('2d').putImageData(View.floorImgs[1], 0, 0, dx, dy, 3 * T2, 5 * T2);
  View.lights = floorLights(f);
}

// The floor's fixed lights, in world px: every ore vein tile.
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
  for (let n = 0; n < 128; n++) {
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

// Light is kept as numbers, not drawn: a cell for each LC × LC art pixels
// (2 × 2 world px) on a grid fixed to the world, so it doesn't crawl as the
// camera moves. A light
// map L is { a, w, h, x0, y0 }: its cells' r, g, b in light × bands, and the
// world cell its first one is. The view has one (View.light); the floor's
// fixed lights, ore and glowing plants, are baked into another (View.bake).
// Positions and radii here are in art px, the world's × AP.
const LC = Math.round(2 * AP);

// How a light fades with distance d (0–1 of its radius): as (1 - d)², in
// straight steps between quarters, as the gradients that used to draw it did.
const LIGHT_FADE = [1, 0.5625, 0.25, 0.0625, 0, 0];
function lightFade(d) { const s = d * 4, n = s | 0; return LIGHT_FADE[n] + (LIGHT_FADE[n + 1] - LIGHT_FADE[n]) * (s - n); }

// Adds a light of colour c (0–1 a channel) and strength i at x, y (art px
// in the world), fading out to r.
function addLight(L, x, y, r, i, c) {
  if (!(r > 0) || !(i > 0)) return;
  const s = i * T.art.lightSteps, cr = c[0] * s, cg = c[1] * s, cb = c[2] * s, k = 1 / r, a = L.a;
  const i0 = Math.max(0, Math.floor((x - r) / LC) - L.x0), i1 = Math.min(L.w - 1, Math.ceil((x + r) / LC) - L.x0);
  const j0 = Math.max(0, Math.floor((y - r) / LC) - L.y0), j1 = Math.min(L.h - 1, Math.ceil((y + r) / LC) - L.y0);
  for (let j = j0; j <= j1; j++) {
    const dy = (LC * (j + L.y0) + LC / 2 - y) * k, dy2 = dy * dy;
    if (dy2 >= 1) continue;
    let o = (j * L.w + i0) * 3, dx = (LC * (i0 + L.x0) + LC / 2 - x) * k;
    for (let n = i0; n <= i1; n++, o += 3, dx += LC * k) {
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
  const s = i * T.art.lightSteps, a = L.a;
  const i0 = Math.max(0, Math.floor((x - r) / LC) - L.x0), i1 = Math.min(L.w - 1, Math.ceil((x + r) / LC) - L.x0);
  const j0 = Math.max(0, Math.floor(y0 / LC) - L.y0), j1 = Math.min(L.h - 1, Math.ceil(y1 / LC) - 1 - L.y0);
  for (let n = i0; n <= i1; n++) {
    const d = Math.abs(LC * (n + L.x0) + LC / 2 - x) / r;
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
  const w = Math.ceil((f.w * ATILE) / LC), h = Math.ceil((f.h * ATILE) / LC);
  if (!View.bake || View.bake.w !== w || View.bake.h !== h) View.bake = { a: new Float32Array(w * h * 3), w, h, x0: 0, y0: 0 };
  else View.bake.a.fill(0);
  for (const s of View.lights) addLight(View.bake, s.x * AP, s.y * AP, s.r * AP, s.i, s.c);
  for (const s of View.floraLights) addLight(View.bake, s.x * AP, s.y * AP, s.r * AP, s.i, s.c);
}

// Starts the view's light for a frame: ambient (r, g, b), plus what's
// baked, on the grid under a camera at cx, cy (art px in the world).
function startLight(cx, cy, r, g, b) {
  const L = View.light, B = View.bake, a = L.a, s = T.art.lightSteps;
  L.x0 = Math.floor(cx / LC); L.y0 = Math.floor(cy / LC);
  // ambient snapped to a whole band (its colour kept), so flat light is
  // one flat step and never sits on a step's dithered edge
  r *= s; g *= s; b *= s;
  const I = Math.max(r, g, b), k = I > 0 ? Math.max(1, Math.round(I)) / I : 0;
  r *= k; g *= k; b *= k;
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

// Multiplies the view by the light, its brightness in hard bands
// (T.art.lightSteps for each 1.0 of light) dithered only just at each
// step's edge (T.art.lightDither), its colour kept as it is: the band is
// of the brightest channel, and the others scaled with it, so a tinted
// light never changes hue at a step. The emissive layer over it shows at
// its own colour. cx, cy: the camera in the world, which the dither is
// fixed to.
function lightScene(cx, cy) {
  const w = View.w, h = View.h, Lt = T.light, A = T.art, L = View.light, a = L.a, lw = L.w * 3, dz = A.lightDither;
  const img = View.ctx.getImageData(0, 0, w, h), d = img.data;
  LateDots.on = false;
  lateDotsColour(d, w, h);
  const top = Math.ceil(Lt.max * A.lightSteps), mx = Lt.max, inv = 1 / A.lightSteps;
  const px = cx - LC * L.x0, py = cy - LC * L.y0, bt = new Int32Array(4), lo = 0.5 + (0.5 / 16 - 0.5) * dz;
  // A cell's light lands on one of two steps, by the threshold at each
  // pixel: so each cell's two (and the threshold between) are worked out
  // once for the pixels that share it. CF: per cell, the threshold, then
  // the r, g, b factors of the lower step and of the higher.
  // (factors in 256ths, so a pixel is lit in whole numbers, all three of
  // its channels in one 32-bit read and write)
  if (!View.lightCF || View.lightCF.length < L.w * 7) View.lightCF = new Int32Array(L.w * 7);
  const CF = View.lightCF, m256 = Math.round(mx * 256), d32 = new Uint32Array(d.buffer);
  // each column's cell
  const col = View.lightCol;
  for (let x = 0; x < w; x++) col[x] = Math.floor((x + px) / LC) * 7;
  let lastBase = -1;
  for (let y = 0; y < h; y++) {
    const row = ((y + cy) & 3) * 4, base = Math.floor((y + py) / LC) * lw;
    // the threshold: a half (a hard step), give or take a little dither
    for (let n = 0; n < 4; n++) bt[(n + cx) & 3] = Math.floor((0.5 + ((BAYER4[row + ((n + cx) & 3)] + 0.5) / 16 - 0.5) * dz) * 65536);
    if (base !== lastBase) {
      lastBase = base;
      for (let n = 0, o = base, j = 0; n < L.w; n++, o += 3, j += 7) {
        const r = a[o], g = a[o + 1], b = a[o + 2], I = r > g ? (r > b ? r : b) : g > b ? g : b;
        if (I <= 0) { CF[j] = 1 << 20; CF[j + 1] = CF[j + 2] = CF[j + 3] = 0; continue; }
        let q0 = (I + lo) | 0, q1 = q0 + 1;
        CF[j] = Math.ceil((q1 - I) * 65536);
        if (q0 > top) q0 = top;
        if (q1 > top) q1 = top;
        const k0 = (q0 * inv * 256) / I, k1 = (q1 * inv * 256) / I;
        let v = r * k0; CF[j + 1] = v > m256 ? m256 : v + 0.5; v = g * k0; CF[j + 2] = v > m256 ? m256 : v + 0.5; v = b * k0; CF[j + 3] = v > m256 ? m256 : v + 0.5;
        v = r * k1; CF[j + 4] = v > m256 ? m256 : v + 0.5; v = g * k1; CF[j + 5] = v > m256 ? m256 : v + 0.5; v = b * k1; CF[j + 6] = v > m256 ? m256 : v + 0.5;
      }
    }
    for (let x = 0, k = y * w; x < w; x++, k++) {
      // the pixel, lit by its cell's factors, on the higher step if its
      // threshold reaches it: its r, g, b in one 32-bit word
      const j = col[x], sel = bt[(x + cx) & 3] >= CF[j] ? j + 4 : j + 1, p = d32[k];
      let r = ((p & 255) * CF[sel] + 128) >> 8, g = (((p >> 8) & 255) * CF[sel + 1] + 128) >> 8, b = (((p >> 16) & 255) * CF[sel + 2] + 128) >> 8;
      if (r > 255) r = 255;
      if (g > 255) g = 255;
      if (b > 255) b = 255;
      d32[k] = 0xff000000 | (b << 16) | (g << 8) | r;
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
  // the camera, in art px
  const fw = f.w * ATILE, fh = f.h * ATILE, pxA = p.x * AP, pyA = p.y * AP;
  const camX = (View.camX = Math.round(fw <= View.w ? (fw - View.w) / 2 : clamp(pxA - View.w / 2, 0, fw - View.w)));
  // at home the camera looks further up, to keep the star in sight
  const lookUp = ap(d.hub ? 56 : 8);
  const camY = (View.camY = Math.round(fh <= View.h ? (fh - View.h) / 2 : clamp(pyA - lookUp - View.h / 2, 0, fh - View.h)));
  const sh = View.shake > 0.3 ? View.shake * AP : 0;
  // a world point x, y is drawn at Math.round(x * AP) + ox, Math.round(y * AP) + oy
  const ox = -camX + Math.round(FX_R.f(-sh, sh)), oy = -camY + Math.round(FX_R.f(-sh, sh)), ex = View.emCtx;
  const tick = Math.floor(Game.realT * 8);
  ex.clearRect(0, 0, View.w, View.h);
  x.drawImage(View.floorCol, ox, oy);
  ex.drawImage(View.floorEm, ox, oy);
  // lights: x, y on the view (art px), r in world px
  const lights = [];

  // ore twinkles, so it's the one thing in the rock that catches the eye
  const tx0 = Math.max(0, Math.floor(camX / ATILE)), ty0 = Math.max(0, Math.floor(camY / ATILE));
  for (let ty = ty0; ty <= Math.min(f.h - 1, ty0 + Math.ceil(View.h / ATILE) + 1); ty++)
    for (let tx = tx0; tx <= Math.min(f.w - 1, tx0 + Math.ceil(View.w / ATILE) + 1); tx++) {
      if (f.tiles[ty * f.w + tx] !== TILE_ORE) continue;
      const h = hashInts(tx, ty, 0x7a1), ph = (Game.realT * 1.6 + (h & 255) / 255) % 1;
      if (ph > 0.22) continue;
      const k = ph < 0.11 ? ph / 0.11 : (0.22 - ph) / 0.11, cx = tx * ATILE + ox + ap(3) + (h >> 8) % ap(10), cy = ty * ATILE + oy + ap(3) + (h >> 12) % ap(6);
      dot(cx, cy, '#ffffff', true, k);
      if (k > 0.5) for (const [i, j] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) dot(cx + i, cy + j, ART.ores[T.ores[f.ore[ty * f.w + tx] - 1].id][3], true, k * 0.7);
    }

  // the lodeline: a shimmering beam from the anchor straight up
  if (f.pad && !d.padDark) {
    const bx = Math.round((f.pad.x + 0.5) * ATILE) + ox, bot = Math.round((f.pad.y + 0.5) * ATILE) + oy, half = ap(d.hub ? 3 : Math.max(1, Math.round(3 * Math.min(1, d.pull * 2))));
    if (bot > 0 && bx > -ATILE && bx < View.w + ATILE) {
      const strip = beamStrip(bx, tick, half), rows = Math.min(bot, View.h);
      if (rows > 0) for (const c of [x, ex]) c.drawImage(strip, 0, 0, 2 * half, rows, bx - half, 0, 2 * half, rows);
      for (let i = 0; i < 6; i++) {
        const y = Math.round(bot - ((Game.realT * 16 * AP + (i * bot) / 6) % bot));
        dot(Math.round(bx - 0.5 + ((i * 7) % (2 * half)) - half), y, star[3], true);
      }
      lights.push({ beam: true, x: bx, y0: 0, y1: bot, r: 1.6 * TILE, i: 0.9, c: rgb01(star[2]) });
      lights.push({ x: bx, y: bot, r: 1.6 * TILE, i: 0.8, c: rgb01(star[3]) });
    }
  }

  if (d.hub) drawHubUnder(d, ox, oy, tick, lights);
  if (!d.hub) drawHazardsUnder(d, ox, oy, tick, lights);
  if (d.fieldForge) {
    const spr = stationSprite('forge'), x = Math.round((d.fieldForge.x + 0.5) * ATILE + ox - spr.ax), y = Math.round((d.fieldForge.y + 0.5) * ATILE + oy - spr.ay + ap(6));
    drawArtSprite(spr, x, y);
    lights.push({ x: x + spr.w / 2, y: y + spr.h / 2, r: TILE * 1.8, i: 0.9, c: rgb01(ART.pal.glass[0]) });
  }

  // loot on the floor, then everyone in order of their feet, then what flies
  for (const dr of d.drops) drawDrop(dr, ox, oy, lights);
  const props = (d.hub ? [{ wreck: true, y: (HUB_STATIONS.find((x) => x.id === 'wreck').y + 0.5) * TILE }] : riftProps(d).concat(lifeActors(d))).concat(portalProps(d));
  if (!d.hub) graftLight(d, ox, oy, lights);
  const actors = d.enemies.filter((e) => !e.dead).concat([p], floraInView(d, ox, oy), props).sort((a, b) => a.y - b.y);
  for (const a of actors) {
    if (a === p) drawProspector(d, ox, oy, tick, lights);
    else if (a.wreck) drawWreck(d, ox, oy, lights);
    else if (a.tear) drawRift(d, a, ox, oy, lights);
    else if (a.portal) drawPortal(d, a, ox, oy, lights);
    else if (a.piece || a.strip) drawFlora(d, a, ox, oy, lights);
    else if (a.crit) drawCritter(d, a, ox, oy);
    else drawEnemy(d, a, ox, oy, tick, lights);
  }
  // from here on (but at home, where the star goes over them) dots are queued
  LateDots.on = !d.hub;
  // where a world point is on the view
  const vx = (wx) => Math.round(wx * AP) + ox, vy = (wy) => Math.round(wy * AP) + oy;
  for (const b of d.bolts) {
    const col = b.element ? ELEMENT_COLS[b.element] : b.kind === 'bolt' ? ART.cores.bolt : '#e8f4ff';
    // a frost lance: a long shard of ice
    if (b.kind === 'frost') {
      const sp = Math.hypot(b.vx, b.vy) || 1;
      for (let k = 0, n = ap(6); k < n; k++) dot(Math.round(b.x * AP + ox - (b.vx / sp) * k), Math.round(b.y * AP + oy - (b.vy / sp) * k), k < ap(2) ? '#ffffff' : ELEMENT_COLS.frost, true, 1 - (k / AP) * 0.12);
      lights.push({ x: vx(b.x), y: vy(b.y), r: TILE, i: 0.6, c: rgb01(ELEMENT_COLS.frost) });
      continue;
    }
    dot(vx(b.x - b.vx * 0.012), vy(b.y - b.vy * 0.012), col, true, 0.5);
    const pts = b.big ? [[0, -1], [-1, 0], [0, 0], [1, 0], [0, 1], [-1, -1], [1, 1], [1, -1], [-1, 1], [2, 0], [-2, 0], [0, 2], [0, -2]] : [[0, 0], [1, 0], [0, 1], [1, 1]];
    for (const [i, j] of pts) dot(vx(b.x) + i - (b.big ? 0 : 1), vy(b.y) + j - (b.big ? 0 : 1), i === 0 && j === 0 && b.big ? '#ffffff' : col, true);
    lights.push({ x: vx(b.x), y: vy(b.y), r: TILE, i: 0.7, c: rgb01(col) });
  }
  const shotCol = artBiome(f).glow;
  for (const sh of d.shots) {
    const sx = vx(sh.x), sy = vy(sh.y);
    for (const [i, j] of [[0, -1], [-1, 0], [0, 0], [1, 0], [0, 1]]) dot(sx + i, sy + j, i || j ? shotCol : '#ffffff', true);
    lights.push({ x: sx, y: sy, r: TILE, i: 0.6, c: rgb01(shotCol) });
  }
  for (const pu of d.puddles) {
    const k = Math.min(1, pu.t / 0.6), cx = vx(pu.x), cy = vy(pu.y), col = pu.mine ? ELEMENT_COLS.ember : PLANT_GLOW;
    for (let n = 0; n < 20; n++) {
      const a = n * 2.4 + pu.max, r = (n % 5) / 5 * pu.r * AP;
      dot(Math.round(cx + Math.cos(a + Game.realT * 0.6) * r), Math.round(cy + Math.sin(a) * r * 0.7 - (pu.mine ? (Game.realT * 8 + n) % ap(4) : 0)), n % 3 ? mix(col, '#000000', 0.4) : col, true, 0.55 * k);
    }
    lights.push({ x: cx, y: cy, r: TILE * 1.1, i: 0.4 * k, c: rgb01(col) });
  }
  for (const g of d.globs) {
    const gx = vx(g.x), gy = vy(g.y), col = g.mine ? ELEMENT_COLS.ember : PLANT_GLOW;
    for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1]]) dot(gx + i, gy + j, j < 0 || i < 0 ? '#ffd0a0' : col, true);
    lights.push({ x: gx, y: gy, r: TILE, i: 0.6, c: rgb01(col) });
  }
  for (const au of d.auras) {
    const cx = vx(au.x), cy = vy(au.y - (au.follow ? 6 : 0)), k = Math.min(1, au.t / 0.4), R = au.r * AP;
    if (au.kind === 'thorns') {
      // thorns turning round the diver
      for (let n = 0, N = Math.round(28 * AP); n < N; n++) {
        const a = (n / N) * Math.PI * 2 + Game.realT * 2, spike = n % 2 === 0, x = Math.round(cx + Math.cos(a) * R), y = Math.round(cy + Math.sin(a) * R * 0.75);
        dot(x, y, spike ? ELEMENT_COLS.blight : '#4a5a30', spike, k);
        if (spike) dot(Math.round(x + Math.cos(a) * ap(2)), Math.round(y + Math.sin(a) * ap(1.5)), '#d8f0a0', true, k);
      }
      lights.push({ x: cx, y: cy, r: au.r * 1.2, i: 0.35 * k, c: rgb01(ELEMENT_COLS.blight) });
    } else {
      // a gravity well: a dark spiral drawing in
      for (let n = 0, N = Math.round(24 * AP); n < N; n++) {
        const a = n * 0.7 - Game.realT * 5, r = ((n * 3 + Game.realT * 30 * AP) % R);
        dot(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * 0.75), n % 3 ? '#2a1848' : ART.cores.well, true, k * (1 - r / R));
      }
      lights.push({ x: cx, y: cy, r: au.r, i: 0.5 * k, c: rgb01(ART.cores.well) });
    }
  }
  for (const fx of d.fx) drawCombatFx(fx, ox, oy, tick, lights);
  if (d.hub) drawHubOver(d, ox, oy, lights);
  for (const s of Sparks) dot(vx(s.x), vy(s.y), s.col, true);
  if (!d.hub) drawHazardsAir(d, ox, oy, lights);
  drawLifeAir(d, ox, oy, lights);
  if (!d.hub) drawStorm(d, ox, oy, lights);
  const fx = vx(p.x), fy = vy(p.y);

  // light it: ambient, the floor's lights in view, the lodeline, the lamp
  // a clime may set its own sun, or its own dark (T.climes)
  const cl = climeLight(f), zl0 = !d.hub && T.zones[d.zone] && T.zones[d.zone].light, zl = zl0 && cl ? Object.assign({}, zl0, cl) : zl0;
  const ambLevel = d.hub ? Lt.hubAmbient : zl ? lerp(zl.dusk, zl.day, clamp(d.pull, 0, 1)) : cl && cl.ambient !== undefined ? cl.ambient : Lt.ambient;
  const tint = zl ? zl.tint.map((c, i) => lerp(Lt.tint[i], c, clamp(d.pull * 1.5, 0, 1))) : (cl && cl.tint) || Lt.tint;
  const L = View.light;
  if (View.bakedFrom !== View.lights) bakeFloorLights(f);
  startLight(-ox, -oy, ambLevel * tint[0], ambLevel * tint[1], ambLevel * tint[2]);
  // the lamp gutters out as the diver dies, and dims as the star's pull fades
  let lamp = d.dying > 0 ? Math.max(0.15, d.dying / 1.4) : 1;
  if (!d.hub && d.pull < T.pull.dimAt) lamp *= lerp(T.pull.lampMin, 1, d.pull / T.pull.dimAt);
  // in daylight the lamp isn't needed; it comes on at dusk
  if (zl && d.pull > zl.lampAt) lamp *= 0.15;
  // a channel home: a ring filling round the diver, the light swelling
  if (d.channel) {
    const k = d.channel.t / d.channel.max, col = d.channel.kind === 'recall' ? '#c9a2ff' : d.channel.kind === 'seal' ? RIFT_PAL.riftedge[0] : ART.pal.star[3];
    const n = Math.round(28 * AP);
    for (let i = 0; i < n * k; i++) { const a = -Math.PI / 2 + (i / n) * Math.PI * 2; dot(Math.round(fx + Math.cos(a) * 12 * AP), Math.round(fy - ap(8) + Math.sin(a) * 9 * AP), col, true); }
    lights.push({ x: fx, y: fy - ap(8), r: TILE * (1.5 + k * 2), i: 0.6 + k, c: rgb01(col) });
  }
  for (const s of lights) {
    if (s.beam) addBeamLight(L, s.x - ox, s.y0 - oy, s.y1 - oy, s.r * AP, s.i, s.c);
    else addLight(L, s.x - ox, s.y - oy, s.r * AP, s.i, s.c);
  }
  addLight(L, fx - ox, fy - ap(17) - oy, Lt.lamp[0] * ATILE * lamp * (1 + (d.stats.lamp || 0) / 100), Lt.lamp[1] * lamp, rgb01(ART.pal.lamp[0]));
  lightScene(-ox, -oy);
  bloomScene();
  drawLifeShade(d, ox, oy);

  // on top, unlit: enemies' health, the ore being aimed at, and how far
  // through it the pick is
  const o = View.overCtx;
  for (const e of d.enemies) {
    if (e.dead || e.boss || (e.hp >= e.maxHp && !e.elite)) continue;
    const w = ap(e.r * 2 + 4), bx = Math.round(vx(e.x) - w / 2), by = vy(e.y) - ap(e.type === 'wisp' ? 22 : e.type === 'construct' ? 20 : 16);
    o.fillStyle = '#000'; o.fillRect(bx - 1, by - 1, w + 2, 4);
    o.fillStyle = e.elite ? ELITE_COLS[e.elite] : '#d04848'; o.fillRect(bx, by, Math.max(1, Math.round((w * e.hp) / e.maxHp)), 2);
  }
  const boss = d.enemies.find((e) => e.boss && !e.dead && e.aggro);
  if (boss) {
    const w = Math.min(View.w - 36, ap(140)), bx = Math.round((View.w - w) / 2);
    o.fillStyle = '#000'; o.fillRect(bx - 1, 7, w + 2, 5);
    o.fillStyle = '#c04040'; o.fillRect(bx, 8, Math.round((w * boss.hp) / boss.maxHp), 3);
  }
  for (const n of d.nums) {
    const col = n.col || (n.hurt ? '#ff6a5a' : n.elem ? ELEMENT_COLS[n.elem] : n.crit ? '#ffd34d' : '#f4ecd8'), nx = vx(n.x), ny = vy(n.y);
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
    const tx = d.target.tx * ATILE + ox, ty = d.target.ty * ATILE + oy, c = ap(3);
    o.fillStyle = Input.mining() ? '#fff2c8' : 'rgba(255,242,200,0.5)';
    for (const [cx, cy] of [[0, 0], [ATILE - c, 0], [0, ATILE - c], [ATILE - c, ATILE - c]]) { o.fillRect(tx + cx, ty + cy + (cy ? c - 1 : 0), c, 1); o.fillRect(tx + cx + (cx ? c - 1 : 0), ty + cy, 1, c); }
    if (p.mine && !p.mine.refused) {
      o.fillStyle = '#000'; o.fillRect(tx + 1, ty - 5, ATILE - 2, 4);
      o.fillStyle = star[2]; o.fillRect(tx + 2, ty - 4, Math.round((ATILE - 4) * Math.min(1, p.mine.prog)), 2);
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
      const spr = buildArtSprite(piece.frames[piece.frames.length - 1], pal, kit.letters, kit.glows, { openFoot: T.flora.melt.open });
      spr.flash = tinted(spr.c, '#ffffff'); spr.ax = spr.w / 2; spr.ay = spr.h - footOff(1.5);
      _enemySprites[key] = spr;
    }
    return _enemySprites[key];
  }
  if (type === 'keeper') {
    const key = 'keeper/' + id;
    if (!_enemySprites[key]) { const s = art2Sprite(KEEPER_ROWS[id], KEEPER_PAL[id], ART_CREATURE); s.flash = tinted(s.c, '#ffffff'); s.ax = s.w / 2; s.ay = s.h - footOff(2); _enemySprites[key] = s; }
    return _enemySprites[key];
  }
  if (!_enemySprites[id]) {
    const out = (_enemySprites[id] = buildEnemySprites(id));
    // the fighting flora: a harmless piece's shape, its glow gone red
    for (const kind of ['snapjaw', 'spitter']) {
      const piece = FLORA[id].find((p) => p.name === PLANT_LOOKS[id][kind]) || FLORA[id][0];
      const pal = Object.assign({}, FLORA_PAL[id], { glow: [PLANT_GLOW], glow2: [mix(PLANT_GLOW, '#ffd0a0', 0.4)] });
      const spr = buildArtSprite(piece.frames[piece.frames.length - 1], pal, FLORA_LETTERS, FLORA_GLOWS, { openFoot: T.flora.melt.open });
      spr.flash = tinted(spr.c, '#ffffff'); spr.ax = spr.w / 2; spr.ay = spr.h - footOff(1.5);
      out[kind] = spr;
    }
  }
  return _enemySprites[id][type];
}

// A soft shadow on the ground under feet at fx, fy (art px), rx world px
// across either way.
function drawShadow(fx, fy, rx) {
  const x = View.ctx, r = rx * AP, ry = 1.5 * AP;
  x.fillStyle = 'rgba(0,0,0,0.45)';
  for (let j = -Math.floor(ry); j <= Math.floor(ry); j++) {
    const w = Math.round(r * Math.sqrt(Math.max(0, 1 - (j / (ry + 0.5)) ** 2)));
    if (w > 0) x.fillRect(fx - w, fy + j, w * 2 + 1, 1);
  }
}

function drawProspector(d, ox, oy, tick, lights) {
  const p = d.p;
  const walking = p.walkT > 0;
  const frame = walking ? 1 + (Math.floor(p.walkT * 10) % 4) : 0;
  const spr = Sprites.diver[facingIndex(p.fx, p.fy)][frame];
  const fx = Math.round(p.x * AP) + ox, fy = Math.round(p.y * AP) + oy;
  const sx = Math.round(fx - spr.ax), sy = Math.round(fy - spr.ay);
  drawShadow(fx, fy, 5);
  // a hand on the far side, or both facing away, is drawn behind the body
  const side = Math.abs(p.fx) > Math.abs(p.fy) + 0.2, away = p.fy < -0.3 && !(p.swing && p.swing.spin);
  const behind = (slot) => away || (side && slot === 'off');
  drawHeld(d, spr, sx, sy, tick, lights, (slot) => behind(slot));
  // blink while hurt; fall still while dying
  if (!(p.invuln > 0 && p.dashT <= 0 && tick % 2) && !(d.dying > 0 && tick % 3 === 0)) drawArtSprite(spr, sx, sy);
  drawHeld(d, spr, sx, sy, tick, lights, (slot) => !behind(slot));
  if (p.ward > 0) ringDots(fx, fy - ap(10), 12 * AP, ART.cores.ward, 0.5 + 0.3 * Math.sin(Game.realT * 6), true);
  // a charging hand gathers light, and flashes when it's full
  for (const slot of ['main', 'off']) {
    const h = p.hands[slot], lv = h.holding ? chargeLevel(h) : 0;
    if (lv <= 0) continue;
    const col = handKind(Save.data.equip[slot]) === 'focus' ? ART.cores.bolt : '#fff2c8';
    ringDots(fx, fy - ap(10), (15 - lv * 5) * AP, col, lv >= 1 ? (tick % 2 ? 1 : 0.5) : 0.25 + lv * 0.5, true);
    lights.push({ x: fx, y: fy - ap(10), r: TILE * (0.8 + lv), i: 0.3 + lv * 0.6, c: rgb01(col) });
  }
  if (p.mine && !p.mine.refused && d.target) {
    const phase = tick % 4, striking = phase >= 2, hand = handOf(p, spr, sx, sy, 'main');
    const hx = hand.x, hy = hand.y - (striking ? 0 : ap(1));
    const tx = (d.target.tx + 0.5) * ATILE + ox - hx, ty = (d.target.ty + 0.5) * ATILE + oy - hy;
    const m = Math.hypot(tx, ty) || 1, L = 8 * AP;
    const head = striking ? { x: hx + (tx / m) * L, y: hy + (ty / m) * L } : { x: hx + (p.fx < 0 ? -1 : 1) * ap(4), y: hy - ap(7) };
    const wood = ART.pal.wood, tool = ART.pal.tool, w = ap(2);
    pixelLine(hx, hy, head.x, head.y, wood[2]);
    pixelLine(head.x - w, head.y - 1, head.x + w, head.y - 1, tool[3]);
    pixelLine(head.x - w, head.y, head.x + w, head.y, tool[1]);
    pixelLine(head.x - w + 1, head.y + 1, head.x + w - 1, head.y + 1, tool[0]);
    if (phase === 2) lights.push({ x: head.x, y: head.y, r: 1.1 * TILE, i: 0.8, c: [1, 0.8, 0.6] });
  }
  drawDrone(d, fx, fy, lights);
}

// The diver's drone: a little orb that drifts after it, over its back
// shoulder, bobbing, its eye turned the way the diver looks. Its body is a
// disc of plate, lit from the top left, outlined (Sprites.drone).
function drawDrone(d, fx, fy, lights) {
  const p = d.p, dt = clamp(Game.realT - (d.droneT || Game.realT), 0, 0.1);
  d.droneT = Game.realT;
  const tx = p.x - p.fx * 7 - p.fy * 6, ty = p.y - p.fy * 4 + p.fx * 3 - 20;
  if (!d.drone) d.drone = { x: tx, y: ty };
  const k = 1 - Math.exp(-5 * dt);
  d.drone.x += (tx - d.drone.x) * k; d.drone.y += (ty - d.drone.y) * k;
  const x = Math.round((d.drone.x - p.x) * AP) + fx, y = Math.round((d.drone.y - p.y + Math.sin(Game.realT * 3) * 1.5) * AP) + fy;
  const eye = DIVER_PAL.tip[0], under = DIVER_PAL.chest[0];
  // (the disc's middle is the grid's (3, 5), past its outline)
  drawArtSprite(Sprites.drone, x - 4, y - 6);
  const ex = x + Math.round(p.fx * 1.4 * AP), ey = y + Math.round(p.fy * AP);
  dot(ex, ey, eye, true); dot(ex + 1, ey, eye, true);
  dot(x, y + 4, under, true, 0.8);
  lights.push({ x, y, r: TILE * 1.1, i: 0.45, c: rgb01(eye) });
}

// Where a hand is on the screen: the main hand from the sprite; the off
// hand mirrored across it, or just behind it seen from the side.
function handOf(p, spr, sx, sy, slot) {
  const h = spr.hand;
  if (slot === 'main') return { x: sx + h.x, y: sy + h.y };
  if (Math.abs(p.fx) > Math.abs(p.fy) + 0.2) return { x: sx + h.x - Math.sign(p.fx) * ap(4), y: sy + h.y - ap(1) };
  return { x: sx + spr.w - 1 - h.x, y: sy + h.y };
}

// The weapons in hand: a blade (swinging through its arc, with a slash of
// light behind it), or a focus, a glowing orb over the hand. which(slot):
// whether to draw that hand now (behind the body, or in front). Lengths
// are in world px, stepped along in art px.
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
        for (const r of [len - 2, len - 1, len, len + 1, len + 2]) dot(Math.round(hand.x + Math.cos(b) * r * AP), Math.round(hand.y + Math.sin(b) * r * AP * 0.85), r === len ? ramp[3] : ramp[2], true, (1 - n / (steps + 1)) * (r === len - 1 || r === len + 1 ? 0.45 : 0.7));
      }
      lights.push({ x: hand.x + Math.cos(a) * 8 * AP, y: hand.y + Math.sin(a) * 7 * AP, r: TILE * 1.2, i: 0.6, c: rgb01(ramp[3]) });
    } else a = face + (slot === 'main' ? 1 : -1) * 1.1 + Math.sin(Game.realT * 2) * 0.05;
    const c = Math.cos(a), sn = Math.sin(a), style = (bpOf(it) || {}).style || 'blade';
    const glow = it.rarity === 'legendary' || it.rarity === 'set' || it.rarity === 'rare';
    const elem = it.element ? ELEMENT_COLS[it.element] : null;
    // a point r along the weapon and side across it (world px), on the view
    const at = (r, side = 0) => ({ x: Math.round(hand.x + (c * r - sn * side) * AP), y: Math.round(hand.y + (sn * r + c * side) * AP * 0.85) });
    // r from r0 to r1 in art px steps
    const along = (r0, r1, fn) => { for (let R = Math.round(r0 * AP); R <= Math.round(r1 * AP); R++) fn(R / AP); };
    if (style === 'spear') {
      // a long shaft, a narrow head
      along(-3, len + 4, (r) => { const q = at(r); dot(q.x, q.y, r > len ? ramp[3] : r > len - 4 ? ramp[2] : ART.pal.wood[2], (glow || elem) && r > len, 1); });
      along(len - 3, len + 1, (r) => { const q = at(r, 1 / AP); dot(q.x, q.y, ramp[1]); });
    } else if (style === 'hammer') {
      // a haft, and a heavy head across it
      along(-1, len - 3, (r) => { const q = at(r); dot(q.x, q.y, ART.pal.wood[2]); });
      along(len - 4, len, (r) => { for (let S = -ap(2); S <= ap(2); S++) { const q = at(r, S / AP); dot(q.x, q.y, S === -ap(2) || r >= len - 0.5 / AP ? ramp[3] : ramp[1 + (Math.round(r * AP) + S) % 2]); } });
      if (elem || glow) { const q = at(len - 2); dot(q.x, q.y, elem || ramp[3], true); dot(q.x + 1, q.y, elem || ramp[3], true); }
    } else if (style === 'whip') {
      // a grip, then a chain curling out to a blade tip
      along(-1, 0, (r) => { const q = at(r); dot(q.x, q.y, ART.pal.leather[2]); });
      const reach = sw ? 18 : 9;
      along(1, reach, (r) => {
        const curl = Math.sin(r * 0.5 + Game.realT * (sw ? 20 : 3)) * (sw ? 1 : 2.5) * (r / reach), q = at(r, curl);
        dot(q.x, q.y, Math.round(r * AP) % 3 ? ramp[2] : ramp[1]);
      });
      const tip = at(reach + 1); dot(tip.x, tip.y, elem || ramp[3], !!elem || glow); dot(tip.x + 1, tip.y, elem || ramp[3], !!elem || glow);
    } else {
      // the grip and guard, then the blade, its edge catching the light
      along(-1, 0, (r) => { const q = at(r); dot(q.x, q.y, ART.pal.leather[2]); });
      along(-2, 2, (g) => { const q = at(1.5, g * 0.8); dot(q.x, q.y, ART.pal.metal[3]); });
      along(2, len, (r) => {
        const q = at(r), lit = (glow || elem) && r > len - 3;
        dot(q.x, q.y, r > len - 0.5 / AP ? ramp[3] : elem && r > len - 3 ? elem : ramp[2], lit, lit ? 0.9 : 1);
        const e = at(r, 1 / AP); dot(e.x, e.y, ramp[1]);
      });
    }
    if (elem) lights.push({ x: hand.x + c * len * 0.7 * AP, y: hand.y + sn * len * 0.6 * AP, r: TILE * 0.8, i: 0.35, c: rgb01(elem) });
  }
}

function drawFocusHeld(d, it, hand, lights) {
  const p = d.p, core = it && it.sockets && it.sockets.find(Boolean);
  const col = core ? ART.cores[core.core] : '#9fe8ff';
  const bob = Math.round(Math.sin(Game.realT * 4 + (hand.x & 3)) * AP);
  const x = hand.x, y = hand.y - ap(3) + bob, flare = p.cast ? p.cast.t / p.cast.max : 0;
  // an orb: a white heart, its colour round it
  for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
    const e = Math.abs(i) + Math.abs(j);
    if (e > 2 || (e === 2 && i && j)) continue;
    dot(x + i, y + j, e === 0 || (e === 1 && i <= 0 && j <= 0) ? '#ffffff' : col, true);
  }
  if (flare > 0) ringDots(x, y, (3 + (1 - flare) * 5) * AP, col, flare, true);
  lights.push({ x, y, r: TILE * (0.9 + flare), i: 0.5 + flare, c: rgb01(col) });
}

function drawEnemy(d, e, ox, oy, tick, lights) {
  // (the fighting flora's feet melt into the ground as a plant's do)
  const rooted = T.enemies[e.type].rooted, spr = rooted ? ugMelted(enemySprite(d, e.type)) : enemySprite(d, e.type), x = View.ctx;
  let lift = 0;
  if (e.type === 'wisp' || e.type === 'hollow') lift = 5 + Math.round(Math.sin(e.bob * 3) * 1.5);
  else if (T.enemies[e.type].rooted) lift = e.state === 'windup' ? 1 : 0;
  else if ((e.state === 'chase' || e.state === 'circle') && Math.floor(e.bob * 8) % 2) lift = 1;
  else if (e.state === 'lunge') lift = 2;
  const shake = e.state === 'windup' ? (tick % 2 ? 1 : -1) : 0;
  const fx = Math.round(e.x * AP) + ox, fy = Math.round(e.y * AP) + oy;
  if (fx < -60 || fy < -15 || fx > View.w + 60 || fy > View.h + 75) return;
  if (!rooted) drawShadow(fx, fy, Math.max(3, e.r));
  const sx = Math.round(fx - spr.ax) + shake, sy = Math.round(fy - spr.ay - lift * AP);
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
  if (e.state === 'windup' && e.type === 'snapjaw') ringDots(fx, fy - ap(4), T.enemies.snapjaw.reach * AP, PLANT_GLOW, tick % 2 ? 0.7 : 0.35, true);
  else if (e.state === 'windup' && e.type === 'spitter') ringDots(Math.round(e.aimX * AP) + ox, Math.round(e.aimY * AP) + oy, (T.enemies.spitter.puddle / 2) * AP, PLANT_GLOW, tick % 2 ? 0.8 : 0.4, true);
  else if (e.state === 'windup' && e.aimX !== undefined) {
    const def = T.enemies[e.type], reach = e.type === 'crawler' ? def.lungeSpeed * def.lungeTime : def.chargeSpeed * def.chargeTime;
    const a = norm(e.aimX - e.x, e.aimY - e.y), col = e.type === 'crawler' ? ART.pal.eyeglow[0] : pal.rune[0];
    for (let r = 6; r < reach; r += 4) dot(Math.round(fx + a.x * r * AP), Math.round(fy + a.y * r * AP), col, true, (tick % 2 ? 0.8 : 0.45) * (1 - r / reach / 1.5));
  }
  if (e.state === 'dazed' || e.state === 'stagger')
    for (let k = 0; k < 3; k++) { const a = Game.realT * 6 + (k * Math.PI * 2) / 3; dot(Math.round(fx + Math.cos(a) * 6 * AP), Math.round(sy - ap(2) + Math.sin(a) * 2 * AP), '#fff2c8', true); }
  // an elite wears a pip of its affix's colour; a chilled one, a pale one
  if (e.elite) for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) dot(fx + i - 1, sy - ap(3) + j - 1, ELITE_COLS[e.elite], true);
  // through a tear: violet and cyan motes drift off it
  if (e.riftTouched) for (let k = 0; k < 3; k++) { const ph = (Game.realT * 0.8 + k / 3) % 1; dot(Math.round(fx + Math.sin(k * 2.1 + Game.realT * 2) * 6 * AP), Math.round(fy - (4 + ph * 14) * AP), k % 2 ? RIFT_PAL.riftcyan[0] : RIFT_PAL.riftedge[0], true, 1 - ph); }
  // a raging Keeper burns
  if (e.enraged) { for (let k = 0; k < 4; k++) dot(fx + ap(FX_R.i(-10, 10)), fy - ap(FX_R.i(4, 26)), k % 2 ? '#ff4a2a' : '#ffb04a', true, 0.8); lights.push({ x: fx, y: fy - ap(12), r: TILE * 2, i: 0.6, c: [1, 0.35, 0.2] }); }
  if (e.slowT > 0) dot(fx + ap(3), sy - ap(2), '#c8f0ff', true);
  if (e.burn && tick % 2) dot(fx + ap(FX_R.i(-4, 4)), fy - ap(FX_R.i(2, 12)), ELEMENT_COLS.ember, true);
  if (e.blight && tick % 3 === 0) dot(fx + ap(FX_R.i(-4, 4)), fy - ap(FX_R.i(0, 8)), ELEMENT_COLS.blight, true);
}

function drawDrop(dr, ox, oy, lights) {
  const fx = Math.round(dr.x * AP) + ox, fy = Math.round((dr.y - 3 - Math.sin(dr.t * 3 + dr.x) * 1.2) * AP) + oy;
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
    for (const [i, j] of [[-3, 1], [-2, 1], [-2, 0], [-1, 0], [-1, 1], [0, -2], [0, -1], [0, 0], [0, 1], [1, -1], [1, 0], [1, 1], [2, 0], [2, 1], [3, 1]]) dot(fx + i, fy + j + ap(3), j < -1 || (j < 0 && i <= 0) ? '#ffffff' : col, true);
  }
  else {
    // a gem: a white heart, its colour round it
    for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) if (Math.abs(i) + Math.abs(j) <= 3) dot(fx + i, fy + j, (Math.abs(i) + Math.abs(j) <= 1 && i <= 0 && j <= 0) ? '#ffffff' : col, true);
    // the best of it stands up in a beam, so it's seen from across a room
    const it = dr.item;
    if (dr.blueprint || dr.shard !== undefined || dr.echo || (it && (it.rarity === 'rare' || it.rarity === 'legendary' || it.rarity === 'set' || it.rarity === 'relic')))
      for (let k = ap(3), n = ap(18); k < n; k++) dot(fx, fy - k, col, true, 0.7 * (1 - k / n));
  }
  lights.push({ x: fx, y: fy, r: TILE, i: 0.5, c: rgb01(col) });
}

// A circle of dots, r art px across (a dot for every art px or so round it)
function ringDots(cx, cy, r, col, alpha, glow) {
  const n = Math.max(8, Math.round(r * 2.4));
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    dot(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * 0.75), col, glow, alpha);
  }
}

function drawCombatFx(fx, ox, oy, tick, lights) {
  const k = fx.t / fx.max, cx = Math.round(fx.x * AP) + ox, cy = Math.round(fx.y * AP) + oy;
  if (fx.kind === 'swing') {
    // a pale arc where the blade went
    const a0 = Math.atan2(fx.dy, fx.dx);
    for (let s = -8; s <= 8; s++) {
      const a = a0 + s * 0.13 * (1.2 - k * 0.4);
      for (const r of [11, 12.5, 14, 15.5, 17]) dot(Math.round(cx + Math.cos(a) * r * AP), Math.round(cy + Math.sin(a) * r * AP * 0.8), '#f4ecd8', true, k * (r === 14 ? 0.9 : r === 11 || r === 17 ? 0.3 : 0.5));
    }
  } else if (fx.kind === 'spin') {
    ringDots(cx, cy, fx.r * (1 - k * 0.5) * AP, '#fff2c8', k, true);
    lights.push({ x: cx, y: cy, r: fx.r * 1.4, i: 0.8 * k, c: [1, 0.95, 0.8] });
  } else if (fx.kind === 'ghost') {
    // a dash's afterimage
    const spr = Sprites.diver[facingIndex(fx.fx, fx.fy)][0], x = View.ctx;
    x.globalAlpha = 0.35 * k;
    x.drawImage(spr.flash, Math.round(cx - spr.ax), Math.round(cy - spr.ay));
    x.globalAlpha = 1;
  } else if (fx.kind === 'snap') {
    // jaws closing on where the diver stood
    const a0 = Math.atan2(fx.dy, fx.dx), r = T.enemies.snapjaw.reach * (1 - k * 0.3) * AP, n = Math.round(6 * AP);
    for (const side of [-1, 1]) for (let s2 = 0; s2 <= n; s2++) {
      const b = a0 + side * (0.6 - (s2 / n) * 0.6) * k;
      dot(Math.round(cx + Math.cos(b) * r * s2 / n), Math.round(cy + Math.sin(b) * r * s2 / n), PLANT_GLOW, true, k);
    }
  } else if (fx.kind === 'shatter') {
    for (let n = 0; n < 8; n++) { const a2 = n * 0.8, r = (1 - k) * 12 * AP; dot(Math.round(cx + Math.cos(a2) * r), Math.round(cy + Math.sin(a2) * r), '#e8f8ff', true, k); }
  } else if (fx.kind === 'mote') {
    // ore fed to the star, rising from the altar into it
    const t = 1 - k, sx = STAR_AT.x * ATILE + ox, sy = STAR_AT.y * ATILE + oy, wob = Math.sin(fx.seed * 2.3 + t * 6) * 8 * AP * (1 - t);
    dot(Math.round(lerp(cx, sx, t * t) + wob), Math.round(lerp(cy, sy, t)), ART.pal.star[t > 0.8 ? 3 : 2], true);
  } else if (fx.kind === 'nova') {
    ringDots(cx, cy, fx.r * (1 - k * 0.7) * AP, ART.cores.nova, k, true);
    lights.push({ x: cx, y: cy, r: fx.r * 1.3, i: k, c: rgb01(ART.cores.nova) });
  } else if (fx.kind === 'pull') {
    ringDots(cx, cy, fx.r * k * AP, ART.cores.pull, 0.8, true);
  } else if (fx.kind === 'ward') {
    ringDots(cx, cy, (11 + 6 * k) * AP, ART.cores.ward, k, true);
  } else if (fx.kind === 'arc') {
    const n = 6, x2 = Math.round(fx.x2 * AP) + ox, y2 = Math.round(fx.y2 * AP) + oy;
    let px = cx, py = cy;
    for (let s = 1; s <= n; s++) {
      const tx = cx + ((x2 - cx) * s) / n + (s < n ? FX_R.i(-3, 3) : 0), ty = cy + ((y2 - cy) * s) / n + (s < n ? FX_R.i(-3, 3) : 0);
      pixelLineGlow(px, py, tx, ty, ART.exotics.voltaic);
      px = tx; py = ty;
    }
  } else if (fx.kind === 'blast') {
    ringDots(cx, cy, fx.r * (1 - k * 0.6) * AP, '#ff7a3a', k, true);
    lights.push({ x: cx, y: cy, r: fx.r * 1.5, i: 1.2 * k, c: [1, 0.5, 0.25] });
  } else if (fx.kind === 'volatile') {
    if (tick % 2) for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) dot(cx + i - 1, cy - ap(4) + j - 1, '#ff5a3a', true);
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
