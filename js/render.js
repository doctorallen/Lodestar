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
  floorFor: null, stage: null, floorBuf: null, rockPx: null, floorCol: null, floorEm: null, floorImgs: null, lights: [], flora: [], floraLights: [], bake: null, bakedFrom: null,
};
const Sprites = {};
const Sparks = [];

function setupView() {
  View.canvas = $('view');
  // the GPU draws the frame where there's WebGL2 (gpu.js): the view is one
  // WebGL canvas and the contexts are its batcher's; else the 2D canvases
  if (gpuInit(View.canvas)) {
    View.ctx = new GpuCtx(GPU_F.COL); View.emCtx = new GpuCtx(GPU_F.EM); View.overCtx = new GpuCtx(GPU_F.COL, true);
    for (const id of ['view-glow', 'bloom', 'view-over']) $(id).hidden = true;
    return;
  }
  // (a canvas WebGL2 was tried on and failed can't be a 2D one: a fresh one)
  if (Gpu.gl) { const c = View.canvas.cloneNode(); View.canvas.replaceWith(c); View.canvas = c; }
  View.ctx = View.canvas.getContext('2d', { willReadFrequently: true });
  View.em = $('view-glow');
  View.emCtx = View.em.getContext('2d', { willReadFrequently: true });
  View.bloom = $('bloom');
  View.bloomCtx = View.bloom.getContext('2d');
  View.over = $('view-over');
  View.overCtx = View.over.getContext('2d');
  View.overCtx.imageSmoothingEnabled = false;
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
  if (Gpu.on) { gpuResize(w, h); View.lightCol = new Int32Array(w + 1); } else
  for (const c of [View.em, View.bloom, View.over]) { c.width = w; c.height = h; c.style.width = View.canvas.style.width; c.style.height = View.canvas.style.height; }
  // the bloom's passes are drawn from the emissive layer in software
  const layer = (cw, ch) => { const c = document.createElement('canvas'); c.width = cw; c.height = ch; return [c, c.getContext('2d', { willReadFrequently: true })]; };
  // the light: a cell for each LC × LC pixels, with a spare row and column
  // for the grid's offset
  const lw = Math.floor(w / LC) + 2, lh = Math.floor(h / LC) + 2;
  View.light = { a: new Float32Array(lw * lh * 3), w: lw, h: lh, x0: 0, y0: 0 };
  if (Gpu.on) return;
  View.lightCol = new Int32Array(w + 1);
  // (the bloom's passes are shrunk in world px, so a glow spreads as far)
  const size = (div) => [Math.max(1, Math.round(w / (div * AP))), Math.max(1, Math.round(h / (div * AP)))];
  View.blooms = T.light.bloom.map(([div, a]) => { const [c] = layer(...size(div)); return [c, a * T.light.glow]; });
  [View.bloomSum] = layer(...size(T.light.bloom[0][0]));
}

// The diver in eight facings, indexed clockwise from east (E, SE, S, SW, W,
// NW, N, NE): the five painted ones and mirrors of three (diver.js). Each
// facing's [0] is its first idle frame (the rest: kindlerPick), and each
// sprite knows its feet (ax, ay), its hands (hand, offHand) and its brow
// lamp's middle (lamp); the cast pose's strike in each facing, [main hand,
// off hand][0], knows its fist (castHand), the other hand (restHand) and
// whether that one is behind the body (restBehind).
const FACINGS = ['E', 'SE', 'S', 'SE', 'E', 'NE', 'N', 'NE'];
const MIRRORED = [false, false, false, true, true, true, false, false];
function buildSprites() {
  const K = buildKindlerSprites(FACINGS, MIRRORED);
  Sprites.diver = K.diver;
  Sprites.diverCast = K.cast;
  Sprites.drone = wickSprite();
}
const WICK_EYE = '#7dffd8', WICK_UNDER = '#c9a2ff';

// Where the diver's brow lamp is (art px in the world), the way it faces
// (to the aim, while casting): the idle frame's, so the light doesn't bob.
function diverLampAt(d) {
  const p = d.p, pose = p.castPose, fi = pose ? facingIndex(Math.cos(pose.a), Math.sin(pose.a)) : facingIndex(p.fx, p.fy);
  const s = Sprites.diver[fi][0];
  return { x: Math.round(p.x * AP) - s.ax + s.lamp.x, y: Math.round(p.y * AP) - s.ay + s.lamp.y };
}

// Is the suit lamp a beam (T.light.beam) rather than the round glow? The
// pause screen's LAMP, else the default.
function lampIsBeam() {
  const s = typeof Save !== 'undefined' && Save.data && Save.data.settings;
  return s && s.lamp ? s.lamp === 'beam' : !!T.light.beam.on;
}

// The suit lamp's beam this frame, or null when it's the round glow. From
// the brow lamp of the facing he's drawn turned to, the way he's turned
// (the rig's smoothed facing, diver.js kindlerPick; the aim, casting).
// lx, ly: the brow lamp; x, y: where the cone starts, between the feet and
// the lamp; ax, ay: its apex, set back behind that; dx, dy: the way it
// points; r, i: reach and strength; core, main, edge: the half-angles of
// its core, its edge and its faint halo's edge (cOut, that one's cosine);
// sy, sr, si: the spill round him (centred under the lamp). All in art px
// in the world. lv: lampLevels(d).
function lampBeamOf(d, lv) {
  if (!lampIsBeam()) return null;
  const B = T.light.beam, p = d.p, A = d.kAnim, pose = p.castPose;
  const ang = pose && pose.a !== undefined ? pose.a : A && A.p === p ? A.ang : Math.atan2(p.fy, p.fx);
  const dx = Math.cos(ang), dy = Math.sin(ang), s = Sprites.diver[facingIndex(dx, dy)][0];
  const feet = Math.round(p.y * AP), lx = Math.round(p.x * AP) - s.ax + s.lamp.x, ly = feet - s.ay + s.lamp.y;
  const x = lx, y = Math.round(lerp(feet, ly, B.rise));
  // your light draining: it narrows, and gutters now and then
  const low = d.hub ? 0 : clamp(1 - d.pull / T.pull.dimAt, 0, 1), t = Game.realT;
  const wob = Math.sin(t * 7.1) + Math.sin(t * 12.7 + 1.3) + Math.sin(t * 19.3 + 2.1);
  const flick = 1 - B.low.flicker * low * clamp((wob - 1.2) / 1.2, 0, 1), nar = lerp(1, B.low.narrow, low), rad = Math.PI / 180;
  return {
    ang, dx, dy, lx, ly, x, y, ax: x - dx * B.back, ay: y - dy * B.back, feet, r: lv.r * B.reach, i: B.i * lv.lamp * flick,
    core: B.core * nar * rad, main: B.edge * nar * rad, edge: B.edge * B.halo[0] * nar * rad, cOut: Math.cos(B.edge * B.halo[0] * nar * rad),
    sy: Math.round((feet + ly) / 2), sr: lv.r * B.spill[0], si: lv.i * B.spill[1] * flick, flick,
  };
}

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
  if (!_floraSprites[key]) { const k = floraKit(set); _floraSprites[key] = pflFloraSprite(set, piece, frame, k); }
  return _floraSprites[key];
}
// Which plants grow on a floor: its clime's own, if it has them; else the
// surface's under the sky, or its biome's.
function floraSetOf(f) { return f.hub ? 'surface' : f.clime && CLIME_FLORA[f.clime] ? f.clime : f.zone === 'surface' ? 'surface' : T.biomes[f.biome].id; }

// (kindled land grows thicker: terraform.js)
function placeFlora(f, set) { return placeUndergrowth(f, set, f.kindled && !f.hub ? { dens: T.terraform.flora } : {}); }

// One piece, drawn with its feet (or for a hanging one, its top) at x, y;
// or a row of a stand. A piece on a wall that's been mined away is gone.
function drawFlora(d, fl, ox, oy, lights) {
  if (fl.strip) { drawStandRow(fl, ox, oy); return; }
  if (fl.anchorT >= 0 && !TILE_SOLID[d.floor.tiles[fl.anchorT]]) return;
  const p = fl.piece, sky = View.ug && View.ug.sky;
  const frame = p.frames.length > 1 && !sky ? Math.floor(Game.realT * 2 + fl.phase * 2) % 2 : 0;
  const spr = fl.top ? floraSprite(fl.set, p, frame) : ugMelted(floraSprite(fl.set, p, frame), fl.ug);
  const fx = Math.round(fl.x * AP) + ox, fy = Math.round(fl.y * AP) + oy;
  // (a hanging one from the lip of the face it hangs on: paintrock.js)
  const sx = Math.round(fx - spr.w / 2), sy = fl.top ? fy - (fl.lip === undefined ? (fl.lip = pnrLipAbove(fl.x * AP, fl.y * AP)) : fl.lip) : fy - spr.h + 1;
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
  const WX = PWIN.x, WY = PWIN.y, W = PWIN.w, X1 = WX + W, Y1 = WY + PWIN.h, OFF = -WY * W - WX, R = View.rockPx, H = ATILE / 2, at = (v) => (v + 0.5) / AP - 0.5;
  x0 = Math.max(WX, x0); y0 = Math.max(WY, y0); x1 = Math.min(X1, x1); y1 = Math.min(Y1, y1);
  const solid = (i, j) => (TILE_SOLID[floorTile(f, i, j)] ? 1 : 0);
  for (let ty = Math.floor((y0 - H) / ATILE); ty * ATILE + H < y1; ty++)
    for (let tx = Math.floor((x0 - H) / ATILE); tx * ATILE + H < x1; tx++) {
      const bx0 = Math.max(x0, tx * ATILE + H), bx1 = Math.min(x1, tx * ATILE + H + ATILE), by0 = Math.max(y0, ty * ATILE + H), by1 = Math.min(y1, ty * ATILE + H + ATILE);
      const a = solid(tx, ty);
      if (a === solid(tx + 1, ty) && a === solid(tx, ty + 1) && a === solid(tx + 1, ty + 1)) { for (let y = by0; y < by1; y++) R.fill(a, y * W + bx0 + OFF, y * W + bx1 + OFF); continue; }
      for (let y = by0; y < by1; y++) { const wy = at(y); for (let x = bx0; x < bx1; x++) R[y * W + x + OFF] = rockAt(f, at(x), wy) ? 1 : 0; }
    }
}

function paintFloor(f) { for (const step of paintFloorSteps(f)) step(); }
// The same, as steps a frame apart (the buffers are set up at once): the
// rock field in strips, what grows, then the chunks' start and the lights.
// Arriving somewhere, they're taken while the portal's iris is still shut
// (render), so no one frame does it all.
function paintFloorSteps(f) {
  // the window of the floor that's painted (paint.js PWIN), round the
  // Kindler if he's on it
  const d = Game.dive, on = d && d.floor === f;
  pntWindowFor(f, on ? d.p.x * AP - View.w / 2 : undefined, on ? d.p.y * AP - View.h / 2 : undefined);
  const P = pixBuf(PWIN.w, PWIN.h), n = 3, strip = Math.ceil(P.h / n);
  P.ox = PWIN.x; P.oy = PWIN.y;
  artLatticeFor(P.w, P.h);
  View.floorFor = f; View.floorBuf = P;
  View.rockPx = new Uint8Array(P.w * P.h);
  const steps = [];
  for (let k = 0; k < n; k++) steps.push(() => fillRockField(f, PWIN.x, PWIN.y + k * strip, PWIN.x + P.w, PWIN.y + (k + 1) * strip));
  // what grows here first: its beds are painted with the tiles
  steps.push(() => { View.ugMeld = null; View.flora = f.regions ? placeRegionFlora(f) : placeFlora(f, floraSetOf(f)); });
  // the ground and the rock standing up over it are painted in chunks as
  // the view comes near them (paint.js, pntFrame)
  steps.push(() => {
    pntFloorStart(f);
    View.lights = floorLights(f).concat(Game.dive && Game.dive.floor === f ? veinLights(Game.dive) : []);
    View.floraLights = floraLights(View.flora);
    View.bakedFrom = null;
  });
  return steps;
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
  const P = View.floorBuf, R = View.rockPx, W = P.w, H = P.h, OFF = -P.oy * W - P.ox, b = climeLookAt(f, tx, ty), t = floorTile(f, tx, ty), ox = tx * ATILE, oy = ty * ATILE;
  _tileSeed = hashInts(f.seed, f.depth, tx, ty) | 0;
  const rnd = tileRnd;
  const rock = (x, y) => x < P.ox || y < P.oy || x >= P.ox + W || y >= P.oy + H || R[y * W + x + OFF] === 1;
  paintCaveTile(P, rock, ox, oy, b, rnd, f.seed ^ f.depth, R);
  if (f.clime || f.regions || f.meldPainting >= 0) paintClimeTile(P, f, tx, ty, ox, oy, b);
  // (the star's starstone and green round it: terraform.js)
  terraPaintGround(P, f, tx, ty, ox, oy);
  paintUndergrowth(P, f, tx, ty, ox, oy, b);
  // (the veins' lines, pressed into the ground: veins.js)
  veinsPaintTile(P, f, tx, ty, ox, oy);
  // (ore and veins are on the rock layer: paint.js)
  if (t === TILE_PAD) paintDish(P, ox, oy);
  // (a shaft to the Deep, or the daylight down it: deep.js)
  if (t === TILE_SHAFT) paintShaft(P, f, tx, ty, ox, oy, b);
}

// After mining: the wall line moves round tx, ty, and with it the rims,
// faces and shadows of the tiles about it.
// The rock stands up over the ground north of it (paint.js), so the rock
// layer is painted again over all it lifts.
function repaintAround(f, tx, ty) {
  if (View.floorFor !== f) return;
  const T2 = ATILE;
  // (painted first, if it isn't yet, from the rock as it was)
  pntEnsure(f, (tx - 2) * T2, (ty - 3) * T2, (tx + 3) * T2, (ty + 3) * T2);
  fillRockField(f, (tx - 1) * T2, (ty - 1) * T2, (tx + 2) * T2, (ty + 2) * T2);
  // the heights first (the ground's sun shadows read them), then the
  // ground, then the rock
  // (the wall line moves up to half a tile past the tile, and the heights
  // as far again as they read it)
  // (and what of them changed bounds how much rock is painted again)
  const Wl = T.paint.wall, m = Math.max(Wl.edge, Wl.ramp) + 2 + T2 / 2, hb = pntHfWatch(f, tx * T2 - m, ty * T2 - m, (tx + 1) * T2 + m, (ty + 1) * T2 + m);
  pntHeights(f, tx * T2 - m, ty * T2 - m, (tx + 1) * T2 + m, (ty + 1) * T2 + m);
  const changed = pntHfChanged(hb);
  // (the ground as far up as the rock stood over it, and down as far as
  // the wall's foot moved: a row further under the sky, where the rock's
  // shadow falls to the lower right)
  const below = artBiome(f).sun ? 2 : 1;
  pntGroundTones(f, (tx - 1) * T2, (ty - 3) * T2, (tx + 2) * T2, (ty + below + 1) * T2);
  for (let y = ty - 3; y <= ty + below; y++) for (let x = tx - 1; x <= tx + 1; x++) if (x >= 0 && y >= 0 && x < f.w && y < f.h) paintTileArt(f, x, y);
  pntRepaintRock(f, tx * T2, ty * T2, (tx + 1) * T2, (ty + 1) * T2, changed);
  // (the rock laid back over the ground's tiles too, where they're under it)
  pntComposite(f, (tx - 1) * T2, (ty - 3) * T2, (tx + 2) * T2, (ty + below + 1) * T2);
  View.lights = floorLights(f);
}

// The floor's fixed lights, in world px: every ore vein tile.
function floorLights(f) {
  const L = [], Lt = T.light;
  for (let ty = 0; ty < f.h; ty++)
    for (let tx = 0; tx < f.w; tx++)
      // (where the rock stands it up to, unshadowed: it glows from the rock)
      if (floorTile(f, tx, ty) === TILE_ORE) L.push({ x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE - pntLiftAt((tx + 0.5) * ATILE, (ty + 0.5) * ATILE) / AP, r: Lt.ore[0] * TILE, i: Lt.ore[1], c: rgb01(ART.ores[T.ores[f.ore[ty * f.w + tx] - 1].id][2]), inRock: true });
  return (f.clime || f.regions ? L.concat(hazardLights(f), climeLights(f)) : L).concat(shaftLights(f));
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

// LIVING PAINT (the paint lab, T.paint.live): a figure drawn through a few
// pictures of itself, a few a second (the first as drawn), in each a share
// of its pixels taking a neighbour's colour, so its strokes shift as if
// painted again. What glows stays as drawn. Each kept with its sprite.
const _livePics = new WeakMap();
function livePaint(spr) {
  if (!Lab.on('live') || !spr || !spr.c) return spr;
  const Lv = T.paint.live, fr = Math.floor(Game.realT * Lv.fps) % Lv.frames;
  if (!fr) return spr;
  let L = _livePics.get(spr);
  if (!L) _livePics.set(spr, (L = []));
  if (!L[fr]) {
    const w = spr.c.width, h = spr.c.height, [c, x] = makeCanvas(w, h);
    x.drawImage(spr.c, 0, 0);
    const img = x.getImageData(0, 0, w, h), D = img.data, S = D.slice(), E = spr.ec ? spr.ec.getContext('2d').getImageData(0, 0, w, h).data : null;
    const solid = (i, j) => i >= 0 && j >= 0 && i < w && j < h && S[(j * w + i) * 4 + 3] > 0 && !(E && E[(j * w + i) * 4 + 3] > 0);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      if (!solid(i, j) || artHash(i, j, fr * 977 + w) >= Lv.share) continue;
      // (a neighbour across, mostly, as the strokes run)
      const hh = artHash(i, j, fr * 977 + h + 1), di = hh < 0.4 ? -1 : hh < 0.8 ? 1 : 0, dj = di ? 0 : hh < 0.9 ? -1 : 1;
      if (!solid(i + di, j + dj)) continue;
      const k = (j * w + i) * 4, q = ((j + dj) * w + i + di) * 4;
      D[k] = S[q]; D[k + 1] = S[q + 1]; D[k + 2] = S[q + 2];
    }
    x.putImageData(img, 0, 0);
    L[fr] = Object.assign({}, spr, { c });
  }
  return L[fr];
}

// The lodeline's beam, painted: runs of the star's gold down a strip 2 ×
// half wide at x, a tone a run, its middle the hottest, its edges a broken
// deeper gold; the runs slide down a little each tick. One of each kind
// drawn once and kept.
const _beamStrips = new Map();
function beamStrip(x, tick, half) {
  const key = `${x & 3} ${tick & 3} ${half} ${View.h}`;
  let c = _beamStrips.get(key);
  if (c) return c;
  if (_beamStrips.size > 64) _beamStrips.clear();
  const star = ART.pal.star, w = 2 * half, h = View.h, img = new ImageData(w, h), d = img.data;
  const tones = [star[1], star[2], star[3]].map(rgbOf);
  for (let i = -half; i < half; i++) {
    const e = Math.abs(i + 0.5) / half, col = x + i;
    for (let y = -12, run = 0, ti = 0, gap = false; y < h; y++) {
      if (run <= 0) {
        const cell = Math.floor((y + tick * 3) / 4), hh = artHash(col, cell, 0xbea);
        run = 3 + Math.floor(artHash(col, cell, 0xbeb) * 7);
        gap = hh < (e > 0.7 ? 0.45 : 0.12);
        ti = e < 0.4 ? (hh > 0.45 ? 2 : 1) : e < 0.7 ? (hh > 0.7 ? 2 : 1) : (hh > 0.85 ? 1 : 0);
      }
      run--;
      if (y < 0 || gap) continue;
      const k = (y * w + i + half) * 4, t = tones[ti];
      d[k] = t[0]; d[k + 1] = t[1]; d[k + 2] = t[2]; d[k + 3] = (e > 0.7 ? 0.55 : 0.85) * 255;
    }
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

// The queued dots onto a canvas (the view, before the GPU lights it): the
// coloured ones composited into a picture of their box, drawn on in one go.
function lateDotsOnto(ctx, w, h) {
  const q = LateDots.q;
  if (!q.length) return;
  if (!LateDots.cimg || LateDots.cimg.width !== w || LateDots.cimg.height !== h) {
    LateDots.cimg = new ImageData(w, h);
    LateDots.ccanvas = document.createElement('canvas'); LateDots.ccanvas.width = w; LateDots.ccanvas.height = h;
  }
  const d = LateDots.cimg.data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let n = 0; n < q.length; n += 5) {
    const x = q[n], y = q[n + 1], a = q[n + 4];
    if (x < 0 || y < 0 || x >= w || y >= h || a <= 0) continue;
    const k = (y * w + x) * 4, c = q[n + 2], ea = d[k + 3] / 255, oa = a + ea * (1 - a), m = ea * (1 - a);
    d[k] = ((c >> 16) * a + d[k] * m) / oa; d[k + 1] = (((c >> 8) & 255) * a + d[k + 1] * m) / oa; d[k + 2] = ((c & 255) * a + d[k + 2] * m) / oa; d[k + 3] = oa * 255;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return;
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  LateDots.ccanvas.getContext('2d').putImageData(LateDots.cimg, 0, 0, x0, y0, bw, bh);
  ctx.drawImage(LateDots.ccanvas, x0, y0, bw, bh, x0, y0, bw, bh);
  for (let y = y0; y <= y1; y++) d.fill(0, (y * w + x0) * 4, (y * w + x1 + 1) * 4);
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
  // (over the painted window of the floor, paint.js PWIN: a light whose
  // reach is all outside it is left out)
  const w = Math.ceil(PWIN.w / LC), h = Math.ceil(PWIN.h / LC), x0 = Math.floor(PWIN.x / LC), y0 = Math.floor(PWIN.y / LC);
  if (!View.bake || View.bake.w !== w || View.bake.h !== h) View.bake = { a: new Float32Array(w * h * 3), w, h, x0, y0 };
  else { View.bake.a.fill(0); View.bake.x0 = x0; View.bake.y0 = y0; }
  const inWin = (s) => { const x = s.x * AP, y = s.y * AP, r = s.r * AP; return x + r >= PWIN.x && x - r <= PWIN.x + PWIN.w && y + r >= PWIN.y && y - r <= PWIN.y + PWIN.h; };
  // (each stopped by the rock: shadow.js)
  bakedSightsFor(f);
  for (const s of View.lights) if (inWin(s)) addBakedLight(f, View.bake, s);
  for (const s of View.floraLights) if (inWin(s)) addBakedLight(f, View.bake, s);
}

// Starts the view's light for a frame: ambient (r, g, b), plus what's
// baked, on the grid under a camera at cx, cy (art px in the world). day:
// the kindled land's ambient { rgb, d } where there is one: each cell then
// has the ambient of where it lies, the dark's to the day's by the veins'
// light grid, so the light is seen fading out before the Kindler walks
// into the dark (and a hold's light growing: veinDistAt).
function startLight(cx, cy, r, g, b, day) {
  const L = View.light, B = View.bake, a = L.a, s = T.art.lightSteps;
  L.x0 = Math.floor(cx / LC); L.y0 = Math.floor(cy / LC);
  // ambient snapped to a whole band (its colour kept), so flat light is
  // one flat step and never sits on a step's dithered edge
  const snap = (c) => { const I = Math.max(c[0], c[1], c[2]) * s, k = I > 0 ? Math.max(1, Math.round(I)) / I : 0; return [c[0] * s * k, c[1] * s * k, c[2] * s * k]; };
  [r, g, b] = snap([r, g, b]);
  const D = day && day.d.litG ? day : null, f = D && D.d.floor, G = D && D.d.litG, fade = T.star.lightFade, R = D && veinsRampOn(D.d) ? D.d.ramp.next : null, rg = R ? D.d.ramp.band * (1 - D.d.ramp.k) : 0;
  const [dr, dg, db] = D ? snap(D.rgb) : [r, g, b], wk = TILE * AP;
  let ty = 0, tx = 0;
  for (let j = 0; j < L.h; j++) {
    const by = j + L.y0 - (B ? B.y0 : 0), row = B && by >= 0 && by < B.h;
    if (D) ty = Math.min(f.h - 1, Math.max(0, Math.round(((j + L.y0) * LC + (LC >> 1)) / wk - 0.5))) * f.w;
    let o = j * L.w * 3, ar = r, ag = g, ab = b;
    for (let n = 0; n < L.w; n++, o += 3) {
      if (D) {
        tx = Math.min(f.w - 1, Math.max(0, Math.round(((n + L.x0) * LC + (LC >> 1)) / wk - 0.5)));
        let dd = G[ty + tx];
        if (R) dd = Math.min(dd, R[ty + tx] + rg);
        const t = dd <= 0 ? 1 : dd >= fade ? 0 : 1 - dd / fade;
        ar = r + (dr - r) * t; ag = g + (dg - g) * t; ab = b + (db - b) * t;
      }
      const bx = n + L.x0 - (B ? B.x0 : 0);
      if (row && bx >= 0 && bx < B.w) { const k = (by * B.w + bx) * 3; a[o] = ar + B.a[k]; a[o + 1] = ag + B.a[k + 1]; a[o + 2] = ab + B.a[k + 2]; }
      else { a[o] = ar; a[o + 1] = ag; a[o + 2] = ab; }
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
  // (on the GPU where there's WebGL2: gllight.js; else here)
  if (Gpu.on) { glLightScene(cx, cy); return; }
  const w = View.w, h = View.h, Lt = T.light, A = T.art, L = View.light, a = L.a, lw = L.w * 3, dz = A.lightDither;
  const img = View.ctx.getImageData(0, 0, w, h), d = img.data;
  LateDots.on = false;
  lateDotsColour(d, w, h);
  const top = Math.ceil(Lt.max * A.lightSteps), mx = Lt.max, inv = 1 / A.lightSteps;
  const px = cx - LC * L.x0, py = cy - LC * L.y0, bt = new Int32Array(4), lo = 0.5 + (0.5 / 16 - 0.5) * dz;
  // A cell's light lands on one of two steps, by the threshold at each
  // pixel: so each cell's two (and the threshold between) are worked out
  // once for the pixels that share it. CF: per cell (CS a cell), the
  // threshold, then the r, g, b factors of the lower step and of the
  // higher.
  // (factors in 256ths, so a pixel is lit in whole numbers, all three of
  // its channels in one 32-bit read and write) Then how much of each
  // step's colour goes (NOCTURNE, below; else 0), and how much of each
  // step's ground is taken back to its tones unlifted (below).
  const CS = 12;
  if (!View.lightCF || View.lightCF.length < L.w * CS) View.lightCF = new Int32Array(L.w * CS);
  const CF = View.lightCF, m256 = Math.round(mx * 256), d32 = new Uint32Array(d.buffer);
  // In a dark place the light's lowest bands tint towards violet
  // (T.light.violet): each by how little of it is the lamp's (0 at the
  // ambient, 1 at the top), and by how dark the place is (darkAt: the
  // ambient brightness it starts at and is full by). Per step q: TF, the
  // tint.
  const Vi = Lt.violet, ambI = View.lightAmbI || 0, TF = new Float32Array((top + 2) * 3);
  const dark = clamp((Vi.darkAt[0] - ambI) / (Vi.darkAt[0] - Vi.darkAt[1]), 0, 1), lpK = 1 / Math.max(0.05, mx - ambI);
  // NOCTURNE (the paint lab, T.light.nocturne): outside the light the
  // colour goes, towards its lightness tinted cool, by how little of the
  // step is the light's and how dark the place is. ND: per step, how much
  // goes (256ths); NT: the tint (256ths).
  const noct = Lab.on('nocturne'), Nc = Lt.nocturne, ND = new Int32Array(top + 2), NT = Nc.tint.map((v) => Math.round(v * 256));
  const nDark = noct ? clamp((Nc.darkAt[0] - ambI) / (Nc.darkAt[0] - Nc.darkAt[1]), 0, 1) : 0;
  // A dark place's ground is painted with its tones lifted apart, so its
  // strokes read in the dim light (paint.js pntLiftRamp); where a light
  // reaches daylight's (fCap, or the place's own if higher) they're the unlifted tones again, by UL (per
  // step, 256ths), so a lamp shows the ground no busier than the sun does.
  // Only the ground's own pixels, nothing drawn over it: each matched
  // against its tone in the painted ramp (GL), and given the unlifted (GU).
  // (measured from the dark the floor was painted for, so daylight itself
  // takes the lift back where it falls)
  const fCap = Math.max(1, ambI), ulB = View.pntLiftAmb !== undefined ? View.pntLiftAmb : ambI, gf = Game.dive && Game.dive.floor, gLook = View.groundLook, GT = View.groundTone, unl = !!(gf && gLook && GT && View.pntLift > 0 && GT.length === PWIN.w * PWIN.h);
  const GL = unl ? pntLook(gLook) : null, GU = unl ? pntLook(gLook, 0) : null, gHue = unl && GL.groundW ? View.groundHue : null, gW = unl ? PWIN.w : 0, gH = unl ? PWIN.h : 0, gX = PWIN.x, gY = PWIN.y, UL = new Int32Array(top + 2);
  for (let q = 0; q <= top + 1; q++) {
    const level = q * inv, lp = clamp((level - ambI) * lpK, 0, 1);
    UL[q] = unl ? Math.round(clamp((level - ulB) / Math.max(0.05, fCap - ulB), 0, 1) * 256) : 0;
    ND[q] = nDark > 0 ? Math.round(Nc.amount * nDark * (1 - lp) * 256) : 0;
    for (let c = 0; c < 3; c++) TF[q * 3 + c] = 1 + (Vi.dark[c] - 1) * (1 - lp) * dark;
  }
  // each column's cell
  const col = View.lightCol;
  for (let x = 0; x < w; x++) col[x] = Math.floor((x + px) / LC) * CS;
  let lastBase = -1;
  // With T.art.lampPerPixel the light is still worked out a cell at a
  // time, but each pixel's is read off a slope through its cell (from the
  // cells either side, across and down), so the bands' edges fall between
  // pixels, not cells, and move a pixel at a time as the lamp moves, never
  // a cell. LB: each cell's brightness (its brightest channel); GX: per
  // cell, its slope across (65536ths of a band a pixel), GY its slope down
  // (both at the cell's place in CF); GXO: for each column, its cell's
  // slope across times its place in the cell (-1, 0, 1).
  const fit = !!A.lampPerPixel, nc = L.w * L.h;
  if (fit && (!View.lightLB || View.lightLB.length < nc || View.lightGXO.length < w || View.lightGX.length < L.w * CS)) {
    View.lightLB = new Float32Array(nc); View.lightGX = new Int32Array(L.w * CS); View.lightGY = new Float32Array(L.w * CS); View.lightCFr = new Int32Array(L.w * CS); View.lightGXO = new Int32Array(w);
  }
  const LB = View.lightLB, GX = View.lightGX, GY = View.lightGY, CFr = View.lightCFr, GXO = View.lightGXO;
  if (fit) for (let n = 0, o = 0; n < nc; n++, o += 3) { const r = a[o], g = a[o + 1], b = a[o + 2]; LB[n] = r > g ? (r > b ? r : b) : g > b ? g : b; }
  // SOFT BEAM EDGE (the paint lab, T.light.soft): the threshold set by
  // strokes along each row (fixed to the world), not the dither, so a
  // band's edge breaks into strokes
  const soft = Lab.on('soft'), Sf = Lt.soft, sfLen = Sf.len * AF, sfK = (Sf.amt * 65536) / 255;
  for (let y = 0; y < h; y++) {
    const row = ((y + cy) & 3) * 4, base = Math.floor((y + py) / LC) * lw;
    // the threshold: a half (a hard step), give or take a little dither
    for (let n = 0; n < 4; n++) bt[(n + cx) & 3] = Math.floor((0.5 + ((BAYER4[row + ((n + cx) & 3)] + 0.5) / 16 - 0.5) * dz) * 65536);
    if (base !== lastBase) {
      lastBase = base;
      if (fit) {
        // the slopes, from the cells either side (the grid's own edge
        // keeps its cell's)
        const c0 = base / 3, up = c0 >= L.w ? c0 - L.w : c0, dn = c0 + L.w < nc ? c0 + L.w : c0, k = 65536 / (2 * LC);
        for (let n = 0, j = 0; n < L.w; n++, j += CS) {
          GX[j] = ((LB[c0 + (n < L.w - 1 ? n + 1 : n)] - LB[c0 + (n > 0 ? n - 1 : n)]) * k) | 0;
          GY[j] = (LB[dn + n] - LB[up + n]) * k;
        }
      }
      for (let n = 0, o = base, j = 0; n < L.w; n++, o += 3, j += CS) {
        const r = a[o], g = a[o + 1], b = a[o + 2], I = r > g ? (r > b ? r : b) : g > b ? g : b;
        if (I <= 0) { CF[j] = 1 << 20; for (let c = 1; c < CS; c++) CF[j + c] = 0; CF[j + 7] = ND[0]; CF[j + 9] = UL[0]; continue; }
        // (on a slope, the lower step is the one its lowest pixel can reach)
        let q0 = (I + lo - (fit ? (Math.abs(GX[j]) + Math.abs(GY[j])) / 65536 : 0)) | 0, q1 = q0 + 1;
        CF[j] = Math.ceil((q1 - I) * 65536);
        if (q0 > top) q0 = top;
        if (q1 > top) q1 = top;
        const k0 = (q0 * inv * 256) / I, k1 = (q1 * inv * 256) / I, t0 = q0 * 3, t1 = q1 * 3, iI = 1 / I;
        let v = r * k0 * TF[t0]; CF[j + 1] = v > m256 ? m256 : v + 0.5; v = g * k0 * TF[t0 + 1]; CF[j + 2] = v > m256 ? m256 : v + 0.5; v = b * k0 * TF[t0 + 2]; CF[j + 3] = v > m256 ? m256 : v + 0.5;
        v = r * k1 * TF[t1]; CF[j + 4] = v > m256 ? m256 : v + 0.5; v = g * k1 * TF[t1 + 1]; CF[j + 5] = v > m256 ? m256 : v + 0.5; v = b * k1 * TF[t1 + 2]; CF[j + 6] = v > m256 ? m256 : v + 0.5;
        CF[j + 7] = ND[q0]; CF[j + 8] = ND[q1];
        CF[j + 9] = UL[q0]; CF[j + 10] = UL[q1];
      }
    }
    if (fit) {
      // this row's place in its cells, and so each cell's threshold here
      const oy = ((y + py) % LC) - (LC >> 1);
      if ((y + py) % LC === 0 || y === 0) for (let x = 0; x < w; x++) GXO[x] = GX[col[x]] * (((x + px) % LC) - (LC >> 1));
      for (let j = 0; j < L.w * CS; j += CS) CFr[j] = CF[j] - ((GY[j] * oy) | 0);
      const wy = y + cy, sfPh = soft ? (Math.imul(wy, 0x9e3779b1) >>> 27) : 0;
      for (let x = 0, k = y * w; x < w; x++, k++) {
        const j = col[x], th = soft ? 32768 + (((Math.imul(Math.floor((x + cx + sfPh) / sfLen), 0x85ebca6b) ^ Math.imul(wy, 0xc2b2ae35)) >>> 24) - 127.5) * sfK : bt[(x + cx) & 3];
        const hi = th + GXO[x] >= CFr[j] ? 1 : 0, sel = hi ? j + 4 : j + 1, ul = CF[j + 9 + hi];
        let p = d32[k];
        if (ul) p = lightUnlift(p, ul, x + cx - gX, wy - gY, gW, gH, GT, gHue, GL, GU);
        let r = ((p & 255) * CF[sel] + 128) >> 8, g = (((p >> 8) & 255) * CF[sel + 1] + 128) >> 8, b = (((p >> 16) & 255) * CF[sel + 2] + 128) >> 8;
        // nocturne: the colour going, towards a cool grey of its lightness
        const nd = CF[j + 7 + hi];
        if (nd) { const l = (r * 77 + g * 151 + b * 28) >> 8; r += (((l * NT[0]) >> 8) - r) * nd >> 8; g += (((l * NT[1]) >> 8) - g) * nd >> 8; b += (((l * NT[2]) >> 8) - b) * nd >> 8; }
        if (r > 255) r = 255;
        if (g > 255) g = 255;
        if (b > 255) b = 255;
        d32[k] = 0xff000000 | (b << 16) | (g << 8) | r;
      }
      continue;
    }
    for (let x = 0, k = y * w; x < w; x++, k++) {
      // the pixel, lit by its cell's factors, on the higher step if its
      // threshold reaches it: its r, g, b in one 32-bit word
      const j = col[x], hi = bt[(x + cx) & 3] >= CF[j] ? 1 : 0, sel = hi ? j + 4 : j + 1, ul = CF[j + 9 + hi];
      let p = d32[k];
      if (ul) p = lightUnlift(p, ul, x + cx - gX, y + cy - gY, gW, gH, GT, gHue, GL, GU);
      let r = ((p & 255) * CF[sel] + 128) >> 8, g = (((p >> 8) & 255) * CF[sel + 1] + 128) >> 8, b = (((p >> 16) & 255) * CF[sel + 2] + 128) >> 8;
      const nd = CF[j + 7 + hi];
      if (nd) { const l = (r * 77 + g * 151 + b * 28) >> 8; r += (((l * NT[0]) >> 8) - r) * nd >> 8; g += (((l * NT[1]) >> 8) - g) * nd >> 8; b += (((l * NT[2]) >> 8) - b) * nd >> 8; }
      if (r > 255) r = 255;
      if (g > 255) g = 255;
      if (b > 255) b = 255;
      d32[k] = 0xff000000 | (b << 16) | (g << 8) | r;
    }
  }
  if (Lab.on('canvas')) labCanvasWeave(d32, w, h, cx, cy);
  View.ctx.putImageData(img, 0, 0);
  lateDotsGlow(w, h);
  LateDots.q.length = 0;
}

// A pixel p of the view at floor px (x, y), taken a share ul (256ths) of
// the way back to its ground tone unlifted, if it is the ground's own (its
// tone there in the painted ramp, L; U the unlifted); else p as it is.
function lightUnlift(p, ul, x, y, W, H, GT, HUE, L, U) {
  if (x < 0 || y < 0 || x >= W || y >= H) return p;
  const i = y * W + x, t = GT[i], hu = HUE ? HUE[i] : 0, a = hu === 1 ? L.groundW : hu === 2 ? L.groundC : L.ground;
  if ((p | 0) !== (a[t] | 0)) return p;
  const q = hu === 1 ? U.groundW[t] : hu === 2 ? U.groundC[t] : U.ground[t];
  if (ul >= 256) return q;
  const r = p & 255, g = (p >> 8) & 255, b = (p >> 16) & 255;
  return 0xff000000 | ((b + ((((q >> 16) & 255) - b) * ul >> 8)) << 16) | ((g + ((((q >> 8) & 255) - g) * ul >> 8)) << 8) | (r + (((q & 255) - r) * ul >> 8));
}

// CANVAS (the paint lab, T.light.canvas): a weave under the paint, pinned
// to the world: threads `thread` px wide, over and under in a check, each
// lit along one edge and dark along the other, and a grain by thread. Its
// factors (256ths) worked out once for a tile of four threads.
let _labWeave = null;
function labCanvasWeave(d32, w, h, cx, cy) {
  const Cv = T.light.canvas, tw = Cv.thread, n = tw * 4;
  if (!_labWeave || _labWeave.n !== n) {
    const F = new Int32Array(n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const over = ((Math.floor(x / tw) + Math.floor(y / tw)) & 1) === 0, u = over ? x % tw : y % tw;
      const edge = tw > 1 ? (u / (tw - 1)) * 2 - 1 : 0, grain = artHash(Math.floor(x / tw), Math.floor(y / tw), 0x5eed) * 2 - 1;
      F[y * n + x] = Math.round((1 - edge * Cv.amt + grain * Cv.grain) * 256);
    }
    _labWeave = { n, F };
  }
  const F = _labWeave.F;
  for (let y = 0; y < h; y++) {
    const fr = ((((y + cy) % n) + n) % n) * n;
    for (let x = 0, k = y * w; x < w; x++, k++) {
      const f = F[fr + ((((x + cx) % n) + n) % n)], p = d32[k];
      let r = ((p & 255) * f) >> 8, g = (((p >> 8) & 255) * f) >> 8, b = (((p >> 16) & 255) * f) >> 8;
      if (r > 255) r = 255;
      if (g > 255) g = 255;
      if (b > 255) b = 255;
      d32[k] = 0xff000000 | (b << 16) | (g << 8) | r;
    }
  }
}

// Bloom from the emissive layer, soft at low resolution so it still reads
// as pixels: each pass shrunk, summed at the finest pass's size, then
// drawn into the overlay, which the browser adds over the view. cx, cy:
// the camera in the world (art px), for T.light.bloomWorld.
function bloomScene(cx, cy) {
  // (on the GPU, from the emissive layer as the frame ends: gpu.js gpuFrameEnd)
  if (Gpu.on) return;
  if (T.light.bloomWorld) { bloomSceneWorld(cx, cy); return; }
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

// The bloom with its passes' pixels on grids fixed to the world. The
// browser shrinks a picture by sampling a few of its pixels for each of
// the smaller one's, so a small glow was caught or missed as the camera
// moved, and lights flared and vanished as the diver walked. Here the
// emissive layer is first halved, and halved again (each an exact average
// of 2 × 2 pixels, on the world's grid of 2, 4, 8 art px), and each pass
// (s art px a pixel: its downscale in world px × AP, also on the world's
// grid) is shrunk from the nearest of those, so a glow standing still
// blooms the same whatever the camera does, and one moving blooms evenly.
function bloomSceneWorld(cx, cy) {
  const w = View.w, h = View.h;
  let P = View.bloomW;
  if (!P || P.w !== w || P.h !== h) {
    // (in software, as the view's other layers are)
    const layer = (cw, ch) => { const c = document.createElement('canvas'); c.width = cw; c.height = ch; const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingEnabled = true; return { c, x }; };
    const passes = T.light.bloom.map(([div, a]) => { const s = div * AP; return Object.assign(layer(Math.ceil(w / s) + 2, Math.ceil(h / s) + 2), { s, a, from: Math.max(0, Math.floor(Math.log2(s))) }); });
    // halvings: level k is 2^k art px a pixel (level 0 the layer itself)
    const levels = [null];
    for (let k = 1, top = Math.max(...passes.map((ps) => ps.from)); k <= top; k++) levels.push(layer(Math.ceil(w / 2 ** k) + 1, Math.ceil(h / 2 ** k) + 1));
    P = View.bloomW = { w, h, passes, levels, sum: layer(passes[0].c.width, passes[0].c.height) };
  }
  // level k's first pixel starts at the world's multiple of 2^k at or
  // before the view's corner: o[k] (art px in the world)
  const L = P.levels, ox = [cx], oy = [cy];
  for (let k = 1; k < L.length; k++) {
    const n = 2 ** k, lx = Math.floor(cx / n) * n, ly = Math.floor(cy / n) * n, src = k === 1 ? View.em : L[k - 1].c, sn = n / 2;
    ox.push(lx); oy.push(ly);
    const x = L[k].x;
    x.globalCompositeOperation = 'copy';
    // (the source rectangle may start a pixel outside the source, which
    // the browser clips, keeping the scale)
    x.drawImage(src, (lx - ox[k - 1]) / sn, (ly - oy[k - 1]) / sn, L[k].c.width * 2, L[k].c.height * 2, 0, 0, L[k].c.width, L[k].c.height);
  }
  const P0 = P.passes[0], s0 = P0.s, g0x = Math.floor(cx / s0) * s0, g0y = Math.floor(cy / s0) * s0, sx = P.sum.x;
  sx.globalCompositeOperation = 'copy';
  for (const ps of P.passes) {
    const s = ps.s, gx = Math.floor(cx / s) * s, gy = Math.floor(cy / s) * s, k = ps.from, n = 2 ** k, src = k ? L[k].c : View.em;
    ps.x.globalCompositeOperation = 'copy';
    ps.x.drawImage(src, (gx - ox[k]) / n, (gy - oy[k]) / n, (ps.c.width * s) / n, (ps.c.height * s) / n, 0, 0, ps.c.width, ps.c.height);
    sx.globalAlpha = ps.a * T.light.glow;
    sx.drawImage(ps.c, (gx - g0x) / s0, (gy - g0y) / s0, (ps.c.width * s) / s0, (ps.c.height * s) / s0);
    sx.globalCompositeOperation = 'lighter';
  }
  sx.globalAlpha = 1;
  const x = View.bloomCtx;
  x.imageSmoothingEnabled = true;
  x.globalCompositeOperation = 'copy';
  x.drawImage(P.sum.c, g0x - cx, g0y - cy, P.sum.c.width * s0, P.sum.c.height * s0);
}

// The light of the place and of the diver's lamp this frame: the ambient
// level (amb) and its tint, a clime's own sun or dark if it has one
// (T.climes, by where he stands); and the lamp's strength (lamp, 0-1),
// reach (r, art px) and light (i). plain: the layer's own light, with no
// clime's (what the floor is painted for).
function lampLevels(d, sunAt, plain) {
  const f = d.floor, Lt = T.light;
  const cl = plain ? null : f.regions ? climeLightAt(f, Math.floor(d.p.x / TILE), Math.floor(d.p.y / TILE)) : climeLight(f), zl0 = T.zones[d.zone] && T.zones[d.zone].light, zl = zl0 && cl ? Object.assign({}, zl0, cl) : zl0;
  // under the sky, the sun (sunOf: daylight in kindled land, a dim dusk in
  // the dark, darker still at the Edge; at home, as the star has grown)
  const sun = sunAt !== undefined ? sunAt : sunOf(d);
  const amb = zl ? Math.max(0.2, lerp(zl.dusk, zl.day, Math.min(1, sun))) : cl && cl.ambient !== undefined ? cl.ambient : Lt.ambient;
  const tint = zl ? zl.tint.map((c, i) => lerp(Lt.tint[i], c, clamp(sun * 1.5, 0, 1))) : (cl && cl.tint) || Lt.tint;
  // the lamp gutters out as the diver dies, and dims as your light fades;
  // hurt badly, it flickers, a beat with his heart, the worse the faster
  let lamp = d.dying > 0 ? Math.max(0.15, d.dying / 1.4) : 1;
  if (!d.hub && d.pull < T.pull.dimAt) lamp *= lerp(T.pull.lampMin, 1, d.pull / T.pull.dimAt);
  const low = d.stats && d.p.hp / d.stats.maxHp;
  if (low < Lt.gutterAt && !(d.dying > 0)) { const k = 1 - low / Lt.gutterAt, beat = (Game.realT * (1.4 + k * 1.2)) % 1; lamp *= 1 - k * Lt.gutter * (beat < 0.12 ? beat / 0.12 : beat < 0.3 ? 1 - (beat - 0.12) / 0.18 : 0); }
  // in daylight the lamp isn't needed; it comes on at dusk
  if (zl && sun > zl.lampAt) lamp *= 0.15;
  // (in the opening's last shot, off while he's in his pod, coming on as he
  // looks out: intro.js; its reach kept, only its strength)
  const on = Intro.hub ? Intro.hub.lamp : 1;
  return { amb, tint, lamp: lamp * on, r: Lt.lamp[0] * ATILE * lamp * (1 + (d.stats.lamp || 0) / 100), i: Lt.lamp[1] * lamp * on };
}

// ---------------------------------------------------------------------------
// A frame
// ---------------------------------------------------------------------------
function renderFrame() {
  if (!View.ctx || !View.w) return;
  // (on the GPU the frame is composed and shown as it ends, whatever was drawn: gpu.js)
  const t0 = performance.now();
  gpuFrameBegin();
  try { renderFrameDraw(); perfDraw(); } finally { gpuFrameEnd(); }
  perfNote(Perf.ms, performance.now() - t0);
}
function renderFrameDraw() {
  const x = View.ctx;
  x.fillStyle = '#000';
  x.fillRect(0, 0, View.w, View.h);
  View.overCtx.clearRect(0, 0, View.w, View.h);
  View.rimN = 0;
  LateDots.on = false; LateDots.q.length = 0;
  const d = Game.dive;
  if (!d) { if (Gpu.on) { gpuBlank(); return; } View.emCtx.clearRect(0, 0, View.w, View.h); View.bloomCtx.clearRect(0, 0, View.w, View.h); return; }
  const f = d.floor, p = d.p, Lt = T.light, star = ART.pal.star;
  View.darkHere = pntDarkHere(d);
  // (and the creatures it holds are painted now, not mid-fight). Just
  // arrived through a portal, behind its shut iris: a step a frame, the
  // last frame (all iris) left on the screen meanwhile
  if (View.floorFor !== f) { paintFloor(f); fpWarm(d); }
  // the camera, in art px
  const fw = f.w * ATILE, fh = f.h * ATILE, pxA = p.x * AP, pyA = p.y * AP;
  // (T.art.steadyCam: from the diver's whole art px, so he stands on the
  // same pixel of the view as he walks, rather than a pixel either side of
  // it as his place and the camera's round differently on an odd-sized
  // view)
  const steady = T.art.steadyCam, cxA = steady ? Math.round(pxA) - (View.w >> 1) : pxA - View.w / 2, cyA = steady ? Math.round(pyA) - (View.h >> 1) : pyA - View.h / 2;
  const camX0 = Math.round(fw <= View.w ? (fw - View.w) / 2 : clamp(cxA, 0, fw - View.w));
  // (the opening's last shot starts over the star: intro.js)
  const camX = (View.camX = Intro.hub ? introCamX(camX0) : camX0);
  const lookUp = ap(8);
  const camY0 = Math.round(fh <= View.h ? (fh - View.h) / 2 : clamp(cyA - lookUp, 0, fh - View.h));
  // (the opening's last shot comes down from higher: intro.js)
  const camY = (View.camY = Intro.hub ? introCamY(camY0) : camY0);
  // the floor's painted chunks in view and near it (paint.js), out ahead
  // of the Kindler first
  const lead = { x: Input.move.x * ap(T.paint.lazy.lead), y: Input.move.y * ap(T.paint.lazy.lead) };
  const tp = performance.now();
  pntFrame(f, camX, camY, null, lead);
  perfNote(Perf.pnt, performance.now() - tp);
  const sh = View.shake > 0.3 ? View.shake * AP : 0;
  // a world point x, y is drawn at Math.round(x * AP) + ox, Math.round(y * AP) + oy
  const ox = -camX + Math.round(FX_R.f(-sh, sh)), oy = -camY + Math.round(FX_R.f(-sh, sh)), ex = View.emCtx;
  Gpu.ox = ox; Gpu.oy = oy;
  const tick = Math.floor(Game.realT * 8);
  ex.clearRect(0, 0, View.w, View.h);
  x.drawImage(View.floorCol, ox + PWIN.x, oy + PWIN.y);
  ex.drawImage(View.floorEm, ox + PWIN.x, oy + PWIN.y);
  // the shadows big things cast from the lamp, on the ground (shadow.js)
  drawLampShadows(d, ox, oy);
  // a haze over dark land (air.js; the paint lab's AIR)
  airHaze(d, ox, oy);
  // lights: x, y on the view (art px), r in world px
  const lights = [];
  // what's drawn flat on the ground, then the rock in front of it laid
  // back over it all (paintrock.js; on the GPU, in the shader as it's drawn)
  Gpu.feet = -1;
  drawHazardsUnder(d, ox, oy, tick, lights); drawFoesUnder(d, ox, oy, tick, lights);
  drawStarUnder(d, ox, oy, lights);
  drawVeinsUnder(d, ox, oy, lights);
  drawCastGround(d, ox, oy, tick, lights);
  pnrOccludeGround(ox, oy);
  Gpu.feet = -2;

  // ore twinkles, so it's the one thing in the rock that catches the eye:
  // what the cutter can break, bright and often; what it can't, a slow
  // cold glint in its own colour, so the eye learns which is which
  const tx0 = Math.max(0, Math.floor(camX / ATILE)), ty0 = Math.max(0, Math.floor(camY / ATILE)), pickPow = 0;
  for (let ty = ty0; ty <= Math.min(f.h - 1, ty0 + Math.ceil(View.h / ATILE) + 1); ty++)
    for (let tx = tx0; tx <= Math.min(f.w - 1, tx0 + Math.ceil(View.w / ATILE) + 1); tx++) {
      if (f.tiles[ty * f.w + tx] !== TILE_ORE) continue;
      const o = T.ores[f.ore[ty * f.w + tx] - 1], can = o.tier <= pickPow, h = hashInts(tx, ty, 0x7a1), ph = (Game.realT * (can ? 1.6 : 0.5) + (h & 255) / 255) % 1;
      if (ph > 0.22) continue;
      const k = ph < 0.11 ? ph / 0.11 : (0.22 - ph) / 0.11, cx = tx * ATILE + ox + ap(3) + (h >> 8) % ap(10), cy0 = ty * ATILE + ap(3) + (h >> 12) % ap(6), cy = cy0 + oy - pntLiftAt(cx - ox, cy0);
      if (!can) { dot(cx, cy, ART.ores[o.id][3], true, k * 0.55); continue; }
      dot(cx, cy, '#ffffff', true, k);
      if (k > 0.5) for (const [i, j] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) dot(cx + i, cy + j, ART.ores[o.id][3], true, k * 0.7);
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

  // what stands up off the ground, each behind the rock by its feet
  drawHazardsStanding(d, ox, oy, tick, lights);
  cfxDrawGroundGhosts(d, ox, oy);

  // what lies on the floor, then everyone in order of their feet, then what flies
  for (const dr of d.drops) { Gpu.feet = Math.round(dr.y * AP) + oy; drawDrop(dr, ox, oy, lights); paintOcclude(Math.round(dr.x * AP) + ox - 8 * AF, Math.round(dr.y * AP) + oy - 16 * AF, 16 * AF, 18 * AF, Math.round(dr.y * AP) + oy, ox, oy); }
  const props = lifeActors(d).concat(starProps(d), veinProps(d));
  // (creatures far off the view are left out of the frame)
  const ax0 = (-ox - 80 * AF) / AP, ax1 = (-ox + View.w + 80 * AF) / AP, ay0 = (-oy - 120 * AF) / AP, ay1 = (-oy + View.h + 60 * AF) / AP;
  const actors = d.enemies.filter((e) => !e.dead && e.x > ax0 && e.x < ax1 && e.y > ay0 && e.y < ay1).concat([p], floraInView(d, ox, oy), props).sort((a, b) => a.y - b.y);
  Gpu.feet = -2;
  for (const a of actors) {
    // (the rock in front of it goes back over it: here by its feet, or on the GPU as it's drawn)
    Gpu.feet = a.top || a.hidden || !View.rockLift ? -2 : Math.round(a.y * AP) + oy;
    // (a walker in a pool stands down in it: painthole.js)
    const wade = phlWadeStart(d, a, ox, oy);
    if (a === p) drawProspector(d, ox, oy, tick, lights);
    else if (a.draw) a.draw(d, a, ox, oy, lights);
    else if (a.piece || a.strip) drawFlora(d, a, ox, oy, lights);
    else if (a.crit) drawCritter(d, a, ox, oy);
    else drawEnemy(d, a, ox, oy, tick, lights);
    if (wade) phlWadeEnd();
    // the rock in front of it, drawn back over it (paint.js)
    paintOccludeActor(a, ox, oy);
  }
  Gpu.feet = -2;
  // from here on (but at home, where the star goes over them) dots are queued
  // (on the GPU a dot is a quad like any other)
  LateDots.on = !d.hub && !Gpu.on;
  // where a world point is on the view
  const vx = (wx) => Math.round(wx * AP) + ox, vy = (wy) => Math.round(wy * AP) + oy;
  // the diver's bolts: trails, flicker, a frost lance's glint (castfx.js)
  cfxDrawTrails(ox, oy);
  for (const b of d.bolts) drawCastBolt(b, ox, oy, tick, lights);
  // Wick's upgrades at work: a ping, a spark, a shield (wick.js)
  drawWickAir(d, ox, oy, lights);
  const shotCol = artBiome(f).glow;
  for (const sh of d.shots) {
    const sx = vx(sh.x), sy = vy(sh.y), col = sh.col || shotCol;
    for (const [i, j] of [[0, -1], [-1, 0], [0, 0], [1, 0], [0, 1]]) dot(sx + i, sy + j, i || j ? col : '#ffffff', true);
    lights.push({ x: sx, y: sy, r: TILE, i: 0.6, c: rgb01(col) });
  }
  for (const pu of d.puddles) {
    const k = Math.min(1, pu.t / 0.6), cx = vx(pu.x), cy = vy(pu.y), col = pu.col || (pu.mine ? ELEMENT_COLS.ember : PLANT_GLOW);
    // fire on the ground (Kindling Arc, Wildfire, Scatter): flames
    if (pu.fire) { drawFirePatch(pu, cx, cy, tick, lights); continue; }
    for (let n = 0; n < 20; n++) {
      const a = n * 2.4 + pu.max, r = (n % 5) / 5 * pu.r * AP;
      dot(Math.round(cx + Math.cos(a + Game.realT * 0.6) * r), Math.round(cy + Math.sin(a) * r * 0.7 - (pu.mine ? (Game.realT * 8 + n) % ap(4) : 0)), n % 3 ? mix(col, '#000000', 0.4) : col, true, 0.55 * k);
    }
    if (pu.mine) cfxLight(lights, cx, cy, TILE * 1.1, 0.4 * k, rgb01(col));
    else lights.push({ x: cx, y: cy, r: TILE * 1.1, i: 0.4 * k, c: rgb01(col) });
  }
  for (const g of d.globs) {
    const gx = vx(g.x), gy = vy(g.y), col = PLANT_GLOW;
    for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1]]) dot(gx + i, gy + j, j < 0 || i < 0 ? '#ffd0a0' : col, true);
    lights.push({ x: gx, y: gy, r: TILE, i: 0.6, c: rgb01(col) });
  }
  for (const au of d.auras) {
    if (au.kind === 'glaive') drawCastGlaive(au, ox, oy, tick, lights);
    else if (au.kind === 'cloud') drawThunderhead(au, ox, oy, tick, lights);
    // a gravity well (castfx.js)
    else drawCastWell(au, ox, oy, tick, lights);
  }
  for (const fx of d.fx) drawCombatFx(fx, ox, oy, tick, lights);
  drawCastAir(d, ox, oy, tick, lights);
  drawResonanceAir(d, ox, oy, tick, lights);
  drawStarOver(d, ox, oy, lights);
  // sparks: short streaks back along their way (castfx.js)
  for (const s of Sparks) cfxSpark(vx(s.x), vy(s.y), s.vx, s.vy, s.col, s.t);
  if (!d.hub) drawHazardsAir(d, ox, oy, lights);
  drawLifeAir(d, ox, oy, lights);
  if (!d.hub) drawStorm(d, ox, oy, lights);
  const fx = vx(p.x), fy = vy(p.y);

  // the clime's motes, lit where they drift (air.js; the paint lab's AIR)
  airMotes(d, ox, oy);
  // the lamp's beam, if it is one, and what shows of it in the air
  const lv = lampLevels(d), beam = lampBeamOf(d, lv);
  if (beam) drawBeamAir(d, beam, lv, ox, oy);

  // light it: ambient, the floor's lights in view, the lodeline, the lamp
  // (dimmed at first in the opening's last shot, intro.js; only here, so the
  // floor isn't painted again for it)
  const ambLevel = lv.amb * (Intro.hub ? Intro.hub.amb : 1), tint = lv.tint;
  const L = View.light;
  // (the ambient's brightness, for the violet in the dark: lightScene)
  View.lightAmbI = ambLevel * Math.max(tint[0], tint[1], tint[2]);
  if (View.bakedFrom !== View.lights) bakeFloorLights(f);
  // the ambient of the dark everywhere, and the kindled land's day where
  // the veins' light lies (startLight: a cell at a time)
  let day = null;
  if (d.litG && !d.hub) {
    const S = T.world.sun, lk = lampLevels(d, S.dark), ld = lampLevels(d, S.kindled), ak = lk.amb * (Intro.hub ? Intro.hub.amb : 1), ad = ld.amb * (Intro.hub ? Intro.hub.amb : 1);
    day = { d, rgb: [ad * ld.tint[0], ad * ld.tint[1], ad * ld.tint[2]] };
    startLight(-ox, -oy, ak * lk.tint[0], ak * lk.tint[1], ak * lk.tint[2], day);
  } else startLight(-ox, -oy, ambLevel * tint[0], ambLevel * tint[1], ambLevel * tint[2]);
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
  // the lamp, from the helm's brow, in its own warm white, stopped by the
  // rock (shadow.js): a round glow, or a beam the way he's turned
  if (beam) { addLampBeam(d, L, beam, rgb01(DIVER_PAL.lamp[0])); addWickLamp(d, L, beam); }
  else { const lamp = diverLampAt(d); addLampLight(d, L, lamp.x, lamp.y, lv.r, lv.i, rgb01(DIVER_PAL.lamp[0])); }
  lightScene(-ox, -oy);
  // the corners sinking to the violet black (air.js; the paint lab's AIR)
  airVignette(d);
  if (Intro.hub) introHubOver(d, ox, oy);
  bloomScene(-ox, -oy);
  drawLifeShade(d, ox, oy);

  // on top, unlit: enemies' health, the ore being aimed at, and how far
  // through it the pick is
  const o = View.overCtx;
  // the minimap, in the corner (map.js)
  miniDraw(d, o);
  // the thread in hand: what's left of it, over the Kindler's head, as a
  // bar and the strides (veins.js), red when it's nearly out
  if (d.thread && !d.hold && !Game.modal) {
    const left = Math.max(0, d.thread.max - d.thread.len), k = left / d.thread.max, w = 36 * AF, h = 4 * AF, bx = Math.round(fx - w / 2), by = vy(p.y) - ap(T.hud.threadY);
    const col = k < 0.2 ? '#ff6a4a' : ART.pal.star[2];
    o.globalAlpha = 0.85;
    o.fillStyle = '#0a0806'; o.fillRect(bx - AF, by - AF, w + 2 * AF, h + 2 * AF);
    o.fillStyle = '#3a3024'; o.fillRect(bx, by, w, h);
    o.fillStyle = col; o.fillRect(bx, by, Math.round(w * k), h);
    o.globalAlpha = 1;
    drawPixelText(o, `${Math.round(left / TILE)}`, fx, by - 9 * AF, col, 1);
  }
  // the hold: the seconds left to hold, counted down over the node forming
  if (d.hold && !Game.modal && (d.hold.l | 0) === (d.layer | 0)) {
    // (the digits twice the label hand's size, so they read from across the fight)
    const h = d.hold, hx = vx(h.x), hy = vy(h.y) - ap(T.hud.holdY), pic = pixelTextPic(`${Math.ceil(Math.max(0, h.max - h.t))}`, ART.pal.star[2]), s = 2, w = pic.width * s, th = pic.height * s;
    if (hx > -20 && hx < View.w + 20 && hy > -10 && hy < View.h + 10) {
      const bx = Math.round(hx - w / 2);
      o.globalAlpha = 0.7; o.fillStyle = '#0a0806'; o.fillRect(bx - 2 * AF, hy - th - AF, w + 4 * AF, th + 2 * AF);
      o.globalAlpha = 1; o.drawImage(pic, bx, hy - th, w, th);
    }
  }
  for (const e of d.enemies) {
    if (e.dead || e.hid) continue;
    // over each foe in sight: what it fears and shrugs off (natures.js),
    // over its health (none over one still hidden)
    const head = e.boss ? vy(e.y) - Math.round(enemySprite(d, e.type).ay) - 4 : vy(e.y) - ap(T.enemies[e.type].barY || (e.type === 'wisp' ? 22 : e.type === 'construct' ? 20 : 16));
    if (e.type !== 'dummy') {
      const ex = vx(e.x);
      if (ex > -20 && ex < View.w + 20 && head > -10 && head < View.h + 10) {
        // an elite's affixes, named over its badges in its colour
        const names = affixNames(e);
        if (names) drawPixelText(o, names, ex, head - 2 * AF - 14 * AF - 7 * AF, eliteCol(e), 1);
      }
    }
    if (e.boss || (e.hp >= e.maxHp && !e.elite)) continue;
    const w = ap(e.r * 2 + 4), bx = Math.round(vx(e.x) - w / 2), by = head;
    o.fillStyle = '#000'; o.fillRect(bx - AF, by - AF, w + 2 * AF, 4 * AF);
    o.fillStyle = e.elite ? eliteCol(e) : '#d04848'; o.fillRect(bx, by, Math.max(1, Math.round((w * e.hp) / e.maxHp)), 2 * AF);
  }
  const boss = d.enemies.find((e) => e.boss && !e.dead && e.aggro);
  if (boss) {
    const w = Math.min(View.w - 36 * AF, ap(140)), bx = Math.round((View.w - w) / 2);
    o.fillStyle = '#000'; o.fillRect(bx - AF, 7 * AF, w + 2 * AF, 5 * AF);
    o.fillStyle = '#c04040'; o.fillRect(bx, 8 * AF, Math.round((w * boss.hp) / boss.maxHp), 3 * AF);
    // a Keeper's phase, said under its bar: what answers it
    if (boss.type === 'keeper') {
      const chilled = boss.slowT > 0 || boss.frozenT > 0;
      const line = boss.home === 'rim' ? (boss.ward > 0 ? 'WARDED · FORCE CRACKS IT' : '') : boss.home === 'choir' ? (chilled ? 'CHILLED · FORCE SHATTERS IT' : 'CRYSTAL · CHILL IT FIRST') : boss.home === 'underforge' ? (boss.quenchT > 0 ? 'QUENCHED · STRIKE IT' : 'WREATHED IN FIRE · FROST QUENCHES IT') : '';
      if (line) drawPixelText(o, line, Math.round(View.w / 2), 14 * AF, boss.home === 'choir' ? (chilled ? NATURE_COLS.force : NATURE_COLS.frost) : boss.home === 'underforge' ? (boss.quenchT > 0 ? NATURE_COLS.frost : NATURE_COLS.ember) : NATURE_COLS.force, 1);
    }
  }
  // a foe's reaction names stand over it, the newest lowest, above where its
  // numbers rise to
  const words = new Map();
  for (let i = d.nums.length - 1; i >= 0; i--) { const n = d.nums[i]; if (n.word && n.foe) { const k = words.get(n.foe) || 0; n.stack = k; words.set(n.foe, k + 1); } }
  for (const n of d.nums) {
    const col = n.col || (n.hurt ? '#ff6a5a' : n.elem ? ELEMENT_COLS[n.elem] : n.crit ? '#ffd34d' : '#f4ecd8'), nx = vx(n.x), ny = vy(n.y);
    // a reaction's name, or a resonance's, in the pixel hand
    if (n.word && n.foe) { drawPixelText(o, n.word, vx(n.foe.x), vy(n.foe.y) - ap(T.circuits.react.wordAbove) - (6 + n.stack * 7) * AF, n.col, Math.min(1, n.t * 3)); continue; }
    if (n.word) { drawPixelText(o, n.word, nx, ny, n.col, Math.min(1, n.t * 3)); continue; }
    // a weak hit's number, or a resisted one's (natures.js)
    if (n.verdict && drawVerdictNumber(o, n, nx, ny)) continue;
    drawNumber(n.v, nx + (n.plus ? 2 * AF : 0), ny, col, Math.min(1, n.t * 3));
    // a pickup: a + before it
    if (n.plus) {
      const px = nx + (2 - Math.floor((String(n.v).length * 4 - 1) / 2) - 4) * AF;
      o.globalAlpha = Math.min(1, n.t * 3);
      for (const [c, k] of [['#000000', 1], [col, 0]]) { o.fillStyle = c; o.fillRect(px + k * AF, ny + (2 + k) * AF, 3 * AF, AF); o.fillRect(px + (1 + k) * AF, ny + (1 + k) * AF, AF, 3 * AF); }
      o.globalAlpha = 1;
    }
  }
  if (d.target) {
    // (round the rock's top, where it stands)
    const tx = d.target.tx * ATILE + ox, ty = d.target.ty * ATILE + oy - pntLiftAt((d.target.tx + 0.5) * ATILE, (d.target.ty + 0.5) * ATILE), c = ap(3);
    o.fillStyle = Input.mining() ? '#fff2c8' : 'rgba(255,242,200,0.5)';
    for (const [cx, cy] of [[0, 0], [ATILE - c, 0], [0, ATILE - c], [ATILE - c, ATILE - c]]) { o.fillRect(tx + cx, ty + cy + (cy ? c - AF : 0), c, AF); o.fillRect(tx + cx + (cx ? c - AF : 0), ty + cy, AF, c); }
    if (p.mine && !p.mine.refused) {
      o.fillStyle = '#000'; o.fillRect(tx + AF, ty - 5 * AF, ATILE - 2 * AF, 4 * AF);
      o.fillStyle = star[2]; o.fillRect(tx + 2 * AF, ty - 4 * AF, Math.round((ATILE - 4 * AF) * Math.min(1, p.mine.prog)), 2 * AF);
    }
  }
  // the storm's warning too
  View.ctx = o;
  try { drawStormMark(d, ox, oy); } finally { View.ctx = x; }
}

// ---------------------------------------------------------------------------
// The people in it
// ---------------------------------------------------------------------------
const ELITE_COLS = Object.fromEntries(Object.keys(ELITE_AFFIX).map((id) => [id, ELITE_AFFIX[id].col]));
// (Shock is the yellow of its stone, never cyan: cyan is the Glyphs' teal
// and the diver's circuits)
const ELEMENT_COLS = { force: '#e4dcf4', shock: '#ffe45c', frost: '#c8f0ff', ember: '#ff8a3a', blight: '#9ad04a' };
// An elite's colour: its affix's (a shifting one's, its weakness's).
const eliteCol = (e) => (e.elite === 'shifting' && e.shiftEl ? ELEMENT_COLS[e.shiftEl] : ELITE_COLS[e.elite]);
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
      _enemySprites[key] = fpPlantSprite(set, piece, Object.assign({}, kit, { pal }), type);
    }
    return _enemySprites[key];
  }
  // a clime's own creature: its first frame (foesart.js)
  if (FOE_ROWS[type]) return foeSprite(type, FOE_ROWS[type].idle ? 'idle' : FOE_ROWS[type].still ? 'still' : 'rear');
  if (type === 'keeper') {
    const key = 'keeper/' + id;
    if (!_enemySprites[key]) _enemySprites[key] = fpKeeperSprite(id);
    return _enemySprites[key];
  }
  if (!_enemySprites[id]) {
    const out = (_enemySprites[id] = buildEnemySprites(id));
    // the fighting flora: a harmless piece's shape, its glow gone red
    for (const kind of ['snapjaw', 'spitter']) {
      const piece = FLORA[id].find((p) => p.name === PLANT_LOOKS[id][kind]) || FLORA[id][0];
      const pal = Object.assign({}, FLORA_PAL[id], { glow: [PLANT_GLOW], glow2: [mix(PLANT_GLOW, '#ffd0a0', 0.4)] });
      out[kind] = fpPlantSprite(id, piece, { pal, letters: FLORA_LETTERS, glows: FLORA_GLOWS }, kind);
    }
  }
  return _enemySprites[id][type];
}

// A soft shadow on the ground under feet at fx, fy (art px), rx world px
// across either way, in short strokes (pshadow.js); up: how high what casts
// it hovers (world px), if it does.
function drawShadow(fx, fy, rx, up) { pshContact(fx, fy, rx, up || 0); }

function drawProspector(d, ox, oy, tick, lights) {
  // (still in his pod, in the opening: intro.js)
  if (Intro.hub && Intro.hub.hidden) return;
  const p = d.p;
  // casting: the pose, turned to the aim and leaning into it (castfx.js);
  // the legs keep walking. Charging a spell, the pose is held, wound back.
  const cutting = p.mine && !p.mine.refused && d.target;
  let cast = p.cast && p.cast.t > 0 && p.cast.a !== undefined && !(p.mine && !p.mine.refused) ? p.cast : null;
  // cutting: the arm held out at the rock, the cutter in the hand
  if (cutting) cast = { a: Math.atan2(cutterAim(d).y / AP - (p.y - 8), cutterAim(d).x / AP - p.x), slot: 'main', t: 1, max: 1, hold: 'f' };
  if (!cast && !(p.mine && !p.mine.refused))
    for (const slot of ['main', 'off']) {
      const h = p.hands[slot], it = Save.data.equip.main;
      if (h.holding && isCaster(it) && chargeLevel(h) > 0) { cast = { a: castFxAim(d), slot, t: 1, max: 1, charging: true }; break; }
    }
  p.castPose = cast;
  // the frame, and the way he's drawn facing (turning: diver.js)
  const { spr, face } = kindlerPick(d, cast);
  const fx = Math.round(p.x * AP) + ox, fy = Math.round(p.y * AP) + oy, lean = cast ? castFxLean(cast) : { x: 0, y: 0 };
  const sx = Math.round(fx - spr.ax) + lean.x, sy = Math.round(fy - spr.ay) + lean.y;
  // (no contact shadow: his cast shadow grounds him, pshadow.js)
  // a hand on the far side, or both facing away, is drawn behind the body;
  // casting, the other hand is where the pose puts it
  const side = Math.abs(face.x) > Math.abs(face.y) + 0.2, away = face.y < -0.3;
  const behind = (slot) => (cast ? slot !== cast.slot && spr.restBehind : away || (side && slot === 'off'));
  drawHeld(d, spr, sx, sy, tick, lights, (slot) => behind(slot), face);
  // blink while hurt; fall still while dying
  if (!(p.invuln > 0 && p.dashT <= 0 && tick % 2) && !(d.dying > 0 && tick % 3 === 0)) {
    drawArtSprite(livePaint(spr), sx, sy);
    // the Splinter's lattice over him, as faint as his light (diver.js)
    const lk = latticeK(d);
    if (lk > 0.02 && KD_LOOK.form === 'human' && KD_LOOK.seams === 'none') { View.ctx.globalAlpha = View.emCtx.globalAlpha = lk * T.splinter.alpha; drawArtSprite(kdLattice(spr), sx, sy); View.ctx.globalAlpha = View.emCtx.globalAlpha = 1; }
    // and the splinter itself, a light at the chest
    if (!d.hub) lights.push({ x: fx, y: fy - ap(22), r: TILE * (0.5 + 0.6 * lk), i: 0.35 * lk, c: rgb01(DIVER_PAL.star[0]) });
  }
  drawHeld(d, spr, sx, sy, tick, lights, (slot) => !behind(slot), face);
  if (p.ward > 0) cfxDrawWard(p, fx, fy, lights);
  // a charging wrist gathers light, and flashes when it's full (its circle
  // is on the ground, its motes drawn in: castfx.js; with no rig, a ring)
  for (const slot of ['main', 'off']) {
    const h = p.hands[slot], lv = h.holding ? chargeLevel(h) : 0, it = Save.data.equip.main;
    if (lv <= 0) continue;
    const col = castFxCol(it, slot);
    if (!isCaster(it)) ringDots(fx, fy - ap(10), (15 - lv * 5) * AP, col, lv >= 1 ? (tick % 2 ? 1 : 0.5) : 0.25 + lv * 0.5, true);
    cfxLight(lights, fx, fy - ap(10), TILE * (0.8 + lv), 0.3 + lv * 0.6, rgb01(col));
  }
  if (cutting) drawCutter(d, handOf(p, spr, sx, sy, 'main', face), ox, oy, tick, lights);
  drawDrone(d, fx, fy, lights);
}

// The cutter at work: a stubby gunmetal emitter in the fist, and from its
// nozzle a beam to the rock's face, a white-hot core in a flickering sheath
// of blue, throwing molten sparks back off where it bites.
function drawCutter(d, hand, ox, oy, tick, lights) {
  const at = cutterAim(d), tx = at.x + ox, ty = at.y + oy;
  const m = Math.hypot(tx - hand.x, ty - hand.y) || 1, ux = (tx - hand.x) / m, uy = (ty - hand.y) / m;
  const C = T.mine.cutter, body = ART.pal.tool, n = { x: hand.x + ux * ap(C.body), y: hand.y + uy * ap(C.body) };
  // the body, and its nozzle's lit ring
  pixelLine(hand.x - ux, hand.y - uy, n.x, n.y, body[0]);
  pixelLine(hand.x - ux - uy, hand.y - uy + ux, n.x - uy, n.y + ux, body[2]);
  dot(Math.round(n.x), Math.round(n.y), C.sheath, true);
  // the face it bites: short of the tile's middle, never behind the nozzle
  const reach = Math.max(ap(2), m - ATILE * C.short), bx = hand.x + ux * reach, by = hand.y + uy * reach;
  const fl = 0.55 + 0.45 * Math.random();
  // (a haze two px out, flickering; the sheath; the core)
  for (const w of [-2, 2]) cutterLine(n.x - uy * w, n.y + ux * w, bx - uy * w, by + ux * w, C.sheath, 0.3 * fl);
  for (const w of [-1, 1]) cutterLine(n.x - uy * w, n.y + ux * w, bx - uy * w, by + ux * w, C.sheath, 0.75 + 0.25 * fl);
  cutterLine(n.x, n.y, bx, by, '#ffffff', 1);
  // the bite: a white-hot spot ringed in molten orange, and sparks thrown
  // back off the face
  const hx = Math.round(bx), hy = Math.round(by);
  for (let ddy = -2; ddy <= 2; ddy++) for (let ddx = -2; ddx <= 2; ddx++) {
    const r = Math.abs(ddx) + Math.abs(ddy);
    if (r <= 3) dot(hx + ddx, hy + ddy, r <= 1 ? '#ffffff' : C.molten, true, r <= 1 ? 1 : r === 2 ? fl : 0.5 * fl);
  }
  for (let k = 0; k < C.sparks; k++) {
    const a = Math.atan2(-uy, -ux) + (Math.random() - 0.5) * 2.4, r = ap(1) + Math.random() * ap(C.spray);
    dot(Math.round(bx + Math.cos(a) * r), Math.round(by + Math.sin(a) * r + Math.random() * ap(2)), Math.random() < 0.4 ? '#ffe48a' : C.molten, true, 0.5 + Math.random() * 0.5);
  }
  lights.push({ x: hx, y: hy, r: 1.8 * TILE, i: 0.9 * fl, c: rgb01(C.sheath) });
  lights.push({ x: hx, y: hy, r: 0.7 * TILE, i: 0.5, c: rgb01(C.molten) });
}

// Where the cutter bites (art px, on the floor): the target's middle, up on
// the rock's top as its marker is.
function cutterAim(d) {
  const x = (d.target.tx + 0.5) * ATILE, y = (d.target.ty + 0.5) * ATILE;
  return { x, y: y - pntLiftAt(x, y) };
}

// A line of the cutter's light at alpha a.
function cutterLine(x0, y0, x1, y1, col, a) {
  const n = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let k = 0; k <= n; k++) dot(Math.round(x0 + ((x1 - x0) * k) / n), Math.round(y0 + ((y1 - y0) * k) / n), col, true, a);
}

// The diver's drone: a little orb that drifts after it, over its back
// shoulder, bobbing, its eye turned the way the diver looks. Its body is a
// disc of plate, lit from the top left, painted (Sprites.drone: diver.js).
function drawDrone(d, fx, fy, lights) {
  const p = d.p, dt = clamp(Game.realT - (d.droneT || Game.realT), 0, 0.1);
  d.droneT = Game.realT;
  const W = T.wick, tx = p.x - p.fx * W.back[0] - p.fy * W.aside[0], ty = p.y - p.fy * W.back[1] + p.fx * W.aside[1] - W.up;
  if (!d.drone) d.drone = { x: tx, y: ty };
  // (in the opening, folded on the pack until it lifts off: intro.js)
  if (Intro.hub && !Intro.hub.wick) { d.drone.x = p.x + 2; d.drone.y = p.y - 17; }
  const k = 1 - Math.exp(-W.ease * dt);
  d.drone.x += (tx - d.drone.x) * k; d.drone.y += (ty - d.drone.y) * k;
  const x = Math.round((d.drone.x - p.x) * AP) + fx, y = Math.round((d.drone.y - p.y + Math.sin(Game.realT * W.bob[0]) * W.bob[1]) * AP) + fy;
  const eye = WICK_EYE, under = WICK_UNDER;
  const S = Sprites.drone;
  drawArtSprite(S, x - S.cx, y - S.cy);
  // its eye on the glass band, the way the diver looks (none, looking away)
  if (p.fy > -0.7) {
    const ex = x + Math.round(p.fx * 2.6), ey = y + (p.fy > 0.5 ? 1 : 0);
    dot(ex, ey, eye, true); dot(ex + 1, ey, eye, true);
    dot(ex + (p.fx < 0 ? -1 : 2), ey, mix(eye, '#04060a', 0.55), true);
  }
  // the lift's glow, flickering, a few loose pixels under it
  const fl = Math.floor(Game.realT * 10) % 3;
  dot(x + fl - 1, y + 7, under, true, 0.6); dot(x + 2 - fl, y + 8, under, true, 0.35);
  lights.push({ x, y, r: TILE * 1.1, i: 0.45, c: rgb01(eye) });
}

// Where a hand is on the screen: the main hand from the sprite; the off
// hand mirrored across it, or just behind it seen from the side. In the
// cast pose, the casting hand is the fist held out, and the other the
// pose's other hand. face: the way the diver faces.
function handOf(p, spr, sx, sy, slot, face = { x: p.fx, y: p.fy }) {
  const pose = p.castPose;
  if (spr.castHand && pose) {
    if (slot === pose.slot) return { x: sx + spr.castHand.x, y: sy + spr.castHand.y };
    if (spr.restHand) return { x: sx + spr.restHand.x, y: sy + spr.restHand.y };
    slot = 'off';
  }
  const h = spr.hand;
  if (slot === 'main') return { x: sx + h.x, y: sy + h.y };
  if (spr.offHand) return { x: sx + spr.offHand.x, y: sy + spr.offHand.y };
  if (Math.abs(face.x) > Math.abs(face.y) + 0.2) return { x: sx + h.x - Math.sign(face.x) * ap(4), y: sy + h.y - ap(1) };
  return { x: sx + spr.w - 1 - h.x, y: sy + h.y };
}

// The rig's two wrist projectors (drawRigHeld): which(slot): whether to
// draw that wrist's light now (behind the body, or in front); face: the way
// the diver faces.
function drawHeld(d, spr, sx, sy, tick, lights, which, face = { x: d.p.fx, y: d.p.fy }) {
  const p = d.p, it = Save.data.equip.main;
  if ((p.mine && !p.mine.refused) || !isCaster(it)) return;
  for (const slot of ['main', 'off']) if (which(slot)) drawRigHeld(d, it, handOf(p, spr, sx, sy, slot, face), lights, slot, tick);
}

// A wrist's projector, its lens on the bracer (the sprite's: diver.js).
// Nothing is held: casting, the fist is thrust at the aim and the light
// leaves just past it, a flare of the spell's colour; charging, it gathers
// there, a ring closing round it, flashing when full. Where it is goes to
// castfx.js, for the motes a charge draws in.
function drawRigHeld(d, it, hand, lights, slot, tick) {
  const p = d.p, F = T.castFx, col = castFxCol(it, slot), h = p.hands[slot];
  const cast = p.castPose && p.castPose.slot === slot ? p.castPose : null;
  const lv = h && h.holding ? chargeLevel(h) : 0, full = lv >= 1;
  const k = cast ? 1 - cast.t / cast.max : 1, out = cast ? (k < F.thrust ? 1 : 1 - (k - F.thrust) / (1 - F.thrust)) : 0, flare = cast && !cast.charging ? 1 - k : 0;
  const ca = cast ? Math.cos(cast.a) : 0, sa = cast ? Math.sin(cast.a) : 0, reach = F.reach * out;
  const x = Math.round(hand.x + ca * reach), y = Math.round(hand.y + sa * reach) - (cast ? 0 : 1);
  CFX.focusAt[slot] = { x: (x + View.camX) / AP - p.x, y: (y + View.camY) / AP - p.y };
  if (!cast && lv <= 0) return;
  // the light leaving the projector: a small cross, its heart white
  const heart = full && tick % 2 ? col : '#ffffff', rim = full && tick % 2 ? '#ffffff' : col;
  for (const [i, j] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) dot(x + i, y + j, i || j ? rim : heart, true, cast && !lv ? Math.max(0.35, 1 - k) : 1);
  if (lv > 0.3) ringDots(x, y, (6 - lv * 3) * AP, col, full ? 1 : 0.5, true);
  cfxLight(lights, x, y, TILE * (0.9 + flare + lv * 1.2), 0.5 + flare + lv * 0.8, rgb01(col));
}

// A sprite's rim: the pixels just outside its silhouette (a pixel's four
// neighbours), in a colour, a pixel wider than it all round. Kept.
const _spriteRims = new WeakMap();
function spriteRim(spr, col) {
  let m = _spriteRims.get(spr.c);
  if (!m) _spriteRims.set(spr.c, (m = new Map()));
  let c = m.get(col);
  if (c) return c;
  const w = spr.c.width, h = spr.c.height, src = spr.c.getContext('2d').getImageData(0, 0, w, h).data;
  const W = w + 2, H = h + 2, [cv, cx] = makeCanvas(W, H), img = cx.createImageData(W, H), D = img.data, rgb = rgbOf(col);
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] > 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ix = x - 1, iy = y - 1;
    if (solid(ix, iy) || !(solid(ix - 1, iy) || solid(ix + 1, iy) || solid(ix, iy - 1) || solid(ix, iy + 1))) continue;
    const k = (y * W + x) * 4;
    D[k] = rgb[0]; D[k + 1] = rgb[1]; D[k + 2] = rgb[2]; D[k + 3] = 255;
  }
  cx.putImageData(img, 0, 0);
  m.set(col, cv);
  return cv;
}

// The sprite a creature is drawn as now (drawEnemy; null while it hides).
function enemySpriteNow(d, e) {
  const look = FOE_NAMES[e.type] ? foeLook(d, e) : null;
  if (look) return look.hidden ? null : look.spr;
  return T.enemies[e.type].rooted ? ugMelted(enemySprite(d, e.type)) : fpPose(enemySprite(d, e.type), e);
}
// A creature taken by the star (castfx.js castFxAbsorb): its pixels, each
// in its own colour, draw in to a knot over where it stood, going gold as
// they near; then the knot streams off towards the star in a string of
// motes that thin and fade, with a warm light over the spot going with it.
function drawAbsorbFx(fx, cx, cy, k, lights, ox, oy) {
  const A = T.castFx.absorb, star = ART.pal.star, t = 1 - k, u = clamp(t / A.gather, 0, 1), eu = u * u * (3 - 2 * u);
  const kx = cx, ky = cy - Math.round(fx.h * 0.5), sx = STAR_AT.x * ATILE + ox, sy = STAR_AT.y * ATILE + oy;
  let ddx = sx - kx, ddy = sy - ky;
  const L = Math.hypot(ddx, ddy) || 1, reach = Math.min(L, A.reach * AP);
  ddx /= L; ddy /= L;
  const v = clamp((t - A.gather) / (1 - A.gather), 0, 1);
  for (let i = 0; i < fx.pts.length; i++) {
    const q = fx.pts[i], h1 = artHash(i, 3, fx.seed), h2 = artHash(i, 4, fx.seed);
    if (t < A.gather) {
      // the star's light takes hold of it at once: its own colours gone
      // gold, drawing in
      const x = lerp(cx + q.dx, kx + (h1 - 0.5) * 4 * AF, eu), y = lerp(cy + q.dy, ky + (h2 - 0.5) * 4 * AF, eu);
      dot(Math.round(x), Math.round(y), eu > 0.7 ? star[3] : mix(q.col, star[2], 0.4 + 0.6 * eu), true, 1);
    } else {
      // each sets off a little behind the one before, so they string out;
      // a mote, with a short tail back along its way
      const lag = h1 * A.spread, s = clamp((v - lag) / (1 - lag), 0, 1);
      if (s >= 1) continue;
      const s2 = s * s, wob = Math.sin(h2 * 20 + s * 9) * 2 * AF * (1 - s), x = kx + ddx * reach * s2 - ddy * wob, y = ky + ddy * reach * s2 + ddx * wob, al = 1 - s2;
      dot(Math.round(x), Math.round(y), s > 0.6 ? star[3] : star[2], true, al);
      if (AF > 1 || h2 < 0.5) dot(Math.round(x) + 1, Math.round(y), star[2], true, al);
      for (let b = 1; b <= 2; b++) dot(Math.round(x - ddx * b * 2 * AF), Math.round(y - ddy * b * 2 * AF), star[1], true, al * (0.6 - b * 0.2));
    }
  }
  // the knot itself: a small bright heart, swelling as the pixels arrive
  // and going out as they leave
  const kr = t < A.gather ? 3 * AF * eu : 3 * AF * (1 - v) * (1 - v);
  for (let j = -Math.ceil(kr); j <= Math.ceil(kr); j++) for (let i = -Math.ceil(kr); i <= Math.ceil(kr); i++) if (i * i + j * j <= kr * kr) dot(kx + i, ky + j, i * i + j * j <= kr * kr * 0.3 ? '#ffffff' : star[3], true, 0.9);
  const li = t < A.gather ? 0.4 + 1 * eu : 1.4 * (1 - v);
  lights.push({ x: kx, y: ky, r: TILE * (fx.big ? 1.8 : 1.2), i: li, c: rgb01(star[2]) });
}
function drawEnemy(d, e, ox, oy, tick, lights) {
  // a clime's own creature has frames of its own, and out of sight (under
  // the sand or the water) only its sign shows (foes.js)
  const look = FOE_NAMES[e.type] ? foeLook(d, e) : null;
  if (look && look.hidden) { drawFoeHidden(d, e, ox, oy, tick, lights); return; }
  // (the fighting flora's feet melt into the ground as a plant's do)
  // (a painted one's pose: foespaint.js)
  const rooted = T.enemies[e.type].rooted, spr = look ? look.spr : rooted ? ugMelted(enemySprite(d, e.type)) : fpPose(enemySprite(d, e.type), e), x = View.ctx;
  let lift = 0;
  if (look) lift = look.lift;
  else if (e.type === 'wisp' || e.type === 'hollow') lift = 5 + Math.round(Math.sin(e.bob * 3) * 1.5);
  else if (T.enemies[e.type].rooted) lift = e.state === 'windup' ? 1 : 0;
  else if ((e.state === 'chase' || e.state === 'circle') && Math.floor(e.bob * 8) % 2) lift = 1;
  else if (e.state === 'lunge') lift = 2;
  const shake = e.state === 'windup' ? (tick % 2 ? 1 : -1) : 0;
  // struck: jolted an art px or two the way the hit pushes it while it holds
  const jx = e.hitT > 0 ? Math.sign(Math.round(e.kvx / 20)) * (e.hitT > T.impact.targetStop ? 2 : 1) : 0, jy = e.hitT > 0 ? Math.sign(Math.round(e.kvy / 20)) : 0;
  const fx = Math.round(e.x * AP) + ox + jx, fy = Math.round(e.y * AP) + oy + jy;
  if (fx < -60 * AF || fy < -15 * AF || fx > View.w + 60 * AF || fy > View.h + 75 * AF) return;
  // (no contact shadow: its cast shadow grounds it, pshadow.js)
  const sx = Math.round(fx - spr.ax) + shake, sy = Math.round(fy - spr.ay - lift * AP);
  drawArtSprite(livePaint(spr), sx, sy);
  // in a dark place its lit rim holds over the light (foespaint.js fpReadable)
  if (spr.rimEc && View.darkHere > 0.05) { const e = View.emCtx; e.globalAlpha = T.paint.foes.read.glow * View.darkHere; e.drawImage(spr.rimEc, sx, sy); e.globalAlpha = 1; }
  // struck: a rim a pixel wide round it, white or in the hit's element, on
  // the unlit layer over the view, so it's never a light and never blooms,
  // and the enemy stays in sight inside it; a few at most at once
  if (e.flash > 0 && (View.rimN = (View.rimN || 0) + 1) <= T.impact.flashMost) View.overCtx.drawImage(spriteRim(spr, e.flashCol || '#ffffff'), sx - 1, sy - 1);
  const pal = ENEMY_PAL[T.biomes[d.biome].id];
  // their eyes and cores light the floor round them, brighter as they wind up
  const glow = look ? look.glow : e.type === 'crawler' ? ART.pal.eyeglow[0] : e.type === 'wisp' ? pal.crystal[0] : e.type === 'hollow' ? '#ff2a6a' : e.type === 'keeper' ? ART.pal.star[3] : T.enemies[e.type].rooted ? PLANT_GLOW : pal.rune[0];
  const winding = e.state === 'windup' || e.state === 'weave';
  if (!look || look.light) lights.push({ x: fx, y: fy - spr.h / 2, r: (look ? look.light : e.type === 'keeper' ? 3.5 : e.boss ? 2.4 : e.type === 'wisp' ? 1.5 : 0.9) * TILE, i: winding ? 1.2 : 0.5, c: rgb01(glow) });
  // tells: a crawler's line before it lunges, a construct's charge line,
  // stars round anything dazed
  if (look) drawFoeTells(d, e, fx, fy, sy, tick, lights, ox, oy);
  else if (e.state === 'windup' && e.type === 'snapjaw') ringDots(fx, fy - ap(4), T.enemies.snapjaw.reach * AP, PLANT_GLOW, tick % 2 ? 0.7 : 0.35, true);
  else if (e.state === 'windup' && e.type === 'spitter') ringDots(Math.round(e.aimX * AP) + ox, Math.round(e.aimY * AP) + oy, (T.enemies.spitter.puddle / 2) * AP, PLANT_GLOW, tick % 2 ? 0.8 : 0.4, true);
  else if (e.state === 'windup' && e.aimX !== undefined) {
    const def = T.enemies[e.type], reach = e.type === 'crawler' ? def.lungeSpeed * def.lungeTime : def.chargeSpeed * def.chargeTime;
    const a = norm(e.aimX - e.x, e.aimY - e.y), col = e.type === 'crawler' ? ART.pal.eyeglow[0] : pal.rune[0];
    for (let r = 6; r < reach; r += 4) dot(Math.round(fx + a.x * r * AP), Math.round(fy + a.y * r * AP), col, true, (tick % 2 ? 0.8 : 0.45) * (1 - r / reach / 1.5));
  }
  if (e.state === 'dazed' || e.state === 'stagger' || FOE_EXPOSED.has(e.state) || (e.stunT > 0 && !(e.frozenT > 0)))
    for (let k = 0; k < 3; k++) { const a = Game.realT * 6 + (k * Math.PI * 2) / 3; dot(Math.round(fx + Math.cos(a) * 6 * AP), Math.round(sy - ap(2) + Math.sin(a) * 2 * AP), '#fff2c8', true); }
  // its statuses and its elite affix (natures.js, reactions.js)
  drawEnemyStatus(d, e, spr, sx, sy, fx, fy, tick, lights);
  // an elite wears a pip of its affix's colour, and its lit rim glows in
  // it (foespaint.js)
  if (e.elite) {
    // (a pip for each affix, in a row)
    const n = e.affixes.length, x0 = fx - Math.round(((n - 1) * 5 * AF) / 2);
    e.affixes.forEach((id, q) => { for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) dot(x0 + q * 5 * AF + i - 1, sy - ap(3) + j - 1, q === 0 ? eliteCol(e) : ELITE_COLS[id], true); });
    View.emCtx.drawImage(fpEliteRim(spr, eliteCol(e)), sx, sy);
    drawAffixes(d, e, spr, sx, sy, fx, fy, tick, lights);
  }
  // through a tear: violet and cyan motes drift off it
  if (e.riftTouched) for (let k = 0; k < 3; k++) { const ph = (Game.realT * 0.8 + k / 3) % 1; dot(Math.round(fx + Math.sin(k * 2.1 + Game.realT * 2) * 6 * AP), Math.round(fy - (4 + ph * 14) * AP), k % 2 ? RIFT_PAL.riftcyan[0] : RIFT_PAL.riftedge[0], true, 1 - ph); }
  // a raging Keeper burns
  if (e.enraged) { for (let k = 0; k < 4; k++) dot(fx + ap(FX_R.i(-10, 10)), fy - ap(FX_R.i(4, 26)), k % 2 ? '#ff4a2a' : '#ffb04a', true, 0.8); lights.push({ x: fx, y: fy - ap(12), r: TILE * 2, i: 0.6, c: [1, 0.35, 0.2] }); }
  // a Keeper's phase: the Choir's crystal rim until it's chilled; the
  // Underforge's fire until it's quenched
  if (e.type === 'keeper' && e.home === 'choir' && !(e.slowT > 0 || e.frozenT > 0) && tick % 2) View.ctx.drawImage(spriteRim(spr, '#dff4ff'), sx - 1, sy - 1);
  if (e.type === 'keeper' && e.home === 'underforge' && !(e.quenchT > 0)) { for (let k = 0; k < 5; k++) dot(fx + ap(FX_R.i(-14, 14)), fy - ap(FX_R.i(2, 30)), k % 2 ? '#ff6a2a' : '#ffd060', true, 0.9); lights.push({ x: fx, y: fy - ap(14), r: TILE * 2.5, i: 0.7, c: [1, 0.45, 0.15] }); }
  if (e.slowT > 0) dot(fx + ap(3), sy - ap(2), '#c8f0ff', true);
  if (e.burn && tick % 2) dot(fx + ap(FX_R.i(-4, 4)), fy - ap(FX_R.i(2, 12)), ELEMENT_COLS.ember, true);
  if (e.blight && tick % 3 === 0) dot(fx + ap(FX_R.i(-4, 4)), fy - ap(FX_R.i(0, 8)), ELEMENT_COLS.blight, true);
}

function drawDrop(dr, ox, oy, lights) {
  const fx = Math.round(dr.x * AP) + ox, fy = Math.round((dr.y - 3 - Math.sin(dr.t * 3 + dr.x) * 1.2) * AP) + oy;
  let col;
  if (dr.mote) col = '#c8ffd8';
  else if (dr.stuff) col = ART.ores[dr.stuff] ? ART.ores[dr.stuff][2] : ART.exotics[dr.stuff] || '#ffffff';
  else if (dr.shard !== undefined) col = ART.pal.star[3];
  else if (dr.echo) col = '#9fc4ff';
  else if (dr.resStone) col = '#ffd34d';
  // what the star learns from a fall (facets.js): a Shape or a Turn in its
  // own colour, old light in the legendary's
  else if (dr.teach) col = stoneCol(dr.teach);
  else if (dr.legend) col = ART.rarity.legendary;
  else col = dr.item ? (dr.item.kind === 'stone' ? coreColour(dr.item) : ART.rarity[dr.item.rarity] || '#ffffff') : '#ffffff';
  if (dr.mote) { for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1]]) dot(fx + i, fy + j, col, true); }
  else if (dr.item && dr.item.kind === 'stone') {
    // a core's crystal, settled out of its capture (modules.js)
    drawCoreDrop(dr, fx, fy, col);
    if (!coreSettled(dr)) return;
    if (dr.item.rarity !== 'common' && dr.item.rarity !== 'magic') for (let k = ap(5), n = ap(20); k < n; k++) dot(fx, fy - k, col, true, 0.6 * (1 - k / n));
  }
  else if (dr.stuff) {
    // a little heap of crystals (pflora.js), on its shadow
    const s = pflDropSprite('heap', col, ART.ores[dr.stuff]);
    drawShadow(fx, Math.round(dr.y * AP) + oy, 3);
    drawArtSprite(s, fx - 5, fy + ap(3) - 8);
  }
  else {
    // a cut gem (pflora.js), bobbing over its shadow
    const s = pflDropSprite('gem', col);
    drawShadow(fx, Math.round(dr.y * AP) + oy, 2.5);
    drawArtSprite(s, fx - 5, fy - 5);
    // the best of it stands up in a beam, so it's seen from across a room
    const it = dr.item;
    if (dr.shard !== undefined || dr.echo || dr.resStone || dr.teach || dr.legend || (it && (it.rarity === 'rare' || it.rarity === 'legendary' || it.rarity === 'set' || it.rarity === 'relic')))
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
    // a pale crescent where the blade went, breaking up as it fades
    const a0 = Math.atan2(fx.dy, fx.dx), h = 1.04 * (1.2 - k * 0.4);
    cfxPaintArc(cx, cy, Math.round(15 * AP), a0 - h, a0 + h, 4, cfxRamp('#f4ecd8'), cfxBand(k), cfxSeed(fx), 1 - cfxBand(k), false);
  } else if (fx.kind === 'spin') {
    const r = Math.round(fx.r * (1 - k * 0.5) * AP);
    cfxStrokeRing(cx, cy, r, Math.round(r * 0.75), cfxRamp('#fff2c8'), cfxBand(k), cfxSeed(fx), true, 0.2);
    lights.push({ x: cx, y: cy, r: fx.r * 1.4, i: 0.8 * k, c: [1, 0.95, 0.8] });
  } else if (fx.kind === 'ghost') {
    // a dash's afterimage
    const spr = kindlerGhost(facingIndex(fx.fx, fx.fy)) || Sprites.diver[facingIndex(fx.fx, fx.fy)][0], x = View.ctx;
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
    // facets of ice thrown out (castfx.js)
    const r = Math.round((1 - k) * 12 * AP) + 2;
    cfxShards(cx, cy, r, 4, cfxRamp(ELEMENT_COLS.frost), cfxBand(k), cfxSeed(fx), true);
  } else if (fx.kind === 'capture' || fx.kind === 'tether') {
    drawCoreFx(fx, cx, cy, k, lights, ox, oy);
  } else if (fx.kind === 'iceBurst' || fx.kind === 'steam' || fx.kind === 'flare' || fx.kind === 'overload' || fx.kind === 'wardBreak') {
    drawReactFx(fx, cx, cy, k, tick, lights);
  } else if (fx.kind === 'dust') {
    // a step's dust: three grains drifting back and up off the heel, gone
    // in half a second
    const t = 1 - k;
    for (let i = 0; i < 3; i++) {
      const h = artHash(i, Math.floor(fx.seed * 97), 0xd5), s = (h - 0.5) * 6;
      dot(Math.round(cx + fx.dx * t * (4 + i * 3) * AP + s * (1 - t)), Math.round(cy - t * (3 + i * 2 + h * 3) * AP), '#8a8298', false, 0.65 * k);
    }
  } else if (fx.kind === 'absorb') drawAbsorbFx(fx, cx, cy, k, lights, ox, oy);
  else if (fx.kind === 'mote') {
    // a shard set in the star, its light rising from the altar into it
    const t = 1 - k, to = fx.at ? { x: fx.at.x, y: fx.at.y - 14 } : fx.to, sx = to ? Math.round(to.x * AP) + ox : STAR_AT.x * ATILE + ox, sy = to ? Math.round(to.y * AP) + oy : STAR_AT.y * ATILE + oy, wob = Math.sin(fx.seed * 2.3 + t * 6) * 8 * AP * (1 - t);
    dot(Math.round(lerp(cx, sx, t * t) + wob), Math.round(lerp(cy, sy, t)), fx.col && t < 0.8 ? fx.col : ART.pal.star[t > 0.8 ? 3 : 2], true);
  } else if (fx.kind === 'nova') {
    // (its ring is swept over the ground: castFxBig)
    cfxLight(lights, cx, cy, fx.r * 1.3, k, rgb01(fx.col || ART.forms.nova));
  } else if (fx.kind === 'foeBurst' || fx.kind === 'foeTongue') drawFoeFx(fx, ox, oy, tick, lights);
  else if (fx.kind === 'arc') drawCastArc(fx, ox, oy, lights); else if (fx.kind === 'blast') {
    const r = Math.round(fx.r * (1 - k * 0.6) * AP), R = cfxRamp('#ff7a3a');
    cfxRays(cx, cy, r * 0.3, r, 10, R, cfxBand(k), cfxSeed(fx));
    cfxStrokeRing(cx, cy, r, Math.round(r * 0.75), R, cfxBand(k), cfxSeed(fx), true, 0.25);
    lights.push({ x: cx, y: cy, r: fx.r * 1.5, i: 1.2 * k, c: [1, 0.5, 0.25] });
  } else if (fx.kind === 'mark') {
    // an affix's mark on the ground (a mortar's spot, where a blinker will
    // land), ringed and blinking; burst: a flash thrown out
    if (fx.burst) hlRingHard(cx, cy, Math.round(ap(3) + (1 - k) * fx.r * AP), fx.col, 0.6, k);
    else { ringDots(cx, cy, fx.r * AP, fx.col, tick % 2 ? 0.85 : 0.45, true); if (k < 0.3) ringDots(cx, cy, fx.r * AP * k / 0.3, fx.col, 0.5, true); }
  } else if (fx.kind === 'verdict') {
    // the hit's verdict, on the foe: resisted, a dull grey ring closing on
    // it like a shell turning the blow; weak, a crisp ring of the element's
    // colour thrown out
    const u = 1 - k;
    if (fx.v === 'W') hlRingHard(cx, cy, Math.round(ap(4) + u * ap(10)), NATURE_COLS[fx.el] || '#7ef06a', 0.6, k);
    else hlRingHard(cx, cy, Math.round(ap(12) - u * ap(7)), '#9a93ad', 0.6, k * 0.8);
  } else if (fx.kind === 'volatile') {
    if (tick % 2) for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) dot(cx + i - 1, cy - ap(4) + j - 1, '#ff5a3a', true);
    lights.push({ x: cx, y: cy, r: TILE, i: 0.8, c: [1, 0.35, 0.2] });
  }
}

// A tiny pixel font for the numbers that pop off hits: 3×5 digits.
const DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001001010010', '111101111101111', '111101111001111'];
function drawNumber(v, cx, cy, col, alpha) {
  if (!Number.isFinite(v) || v >= 1e7) return;
  const s = String(v), x0 = cx - Math.floor((s.length * 4 - 1) / 2) * AF, x = View.overCtx;
  x.globalAlpha = alpha;
  for (const [ink, off] of [['#000000', 1], [col, 0]])
    for (let k = 0; k < s.length; k++) {
      const g = DIGITS[s.charCodeAt(k) - 48];
      x.fillStyle = ink;
      for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j * 3 + i] === '1') x.fillRect(x0 + (k * 4 + i + off) * AF, cy + (j + off) * AF, AF, AF);
    }
  x.globalAlpha = 1;
}
