'use strict';
// ---------------------------------------------------------------------------
// The Deep (DESIGN.md, The world): a second floor of the world under the
// surface, the same size, caverns in the four cave climes (regions.js),
// with no sun and no star. Shafts join the two: where open ground lies
// over open ground, a hole in the surface (TILE_SHAFT on both floors, at
// the same tiles) that the Kindler goes down, and climbs back up, with the
// thread in his hand if he has it, so a vein can run down into the Deep
// and light it, and its nodes can be stood at from the map.
//   worldFor(seed)            both floors, built once a seed and kept
//   placeShafts(sf, df, seed) the shafts, on both floors
//   shaftNear(d)              the shaft the Kindler stands at, or null
//   layerSwitch(d, to, x, y)  the Kindler to the other floor at (x, y):
//                             what lives on each floor is kept aside
//   paintShaft(...)           a shaft's hole (above) or its daylight (below)
//   shaftLights(f)            the daylight falling down each shaft
// Numbers are in T.deep.
// ---------------------------------------------------------------------------

const WORLD_CACHE = { seed: null, world: null };
function worldFor(seed) {
  if (WORLD_CACHE.world && WORLD_CACHE.seed === seed) return WORLD_CACHE.world;
  const surface = generateWorld(seed), deep = generateDeep(seed, surface);
  surface.below = deep; deep.above = surface;
  placeShafts(surface, deep, seed);
  // (the shafts first, so no hazard lies at one)
  placeRegionHazards(surface, seed);
  placeRegionHazards(deep, hashInts(seed, 0xdeeb) >>> 0);
  WORLD_CACHE.seed = seed; WORLD_CACHE.world = { surface, deep };
  return WORLD_CACHE.world;
}
// The floor under the surface: caverns the size of the world, in the cave
// climes, the Caverns under the star.
function generateDeep(seed, surface) {
  const W = T.worldgen, D = T.deep;
  const f = generateFloor(hashInts(seed, 0xdeeb) >>> 0, D.depth, 0, 0, 'cave', 0, null, Object.assign({}, W.over, D.over));
  f.ways = []; f.portal = null; f.pad = null; f.layer = 1;
  f.entry = { x: surface.star.x, y: surface.star.y };
  layRegions(f, seed, T.regions.deep, T.regions.deep[0], surface.star.x, surface.star.y);
  return f;
}

const TILE_SHAFT = 6;
// The shafts: tiles open on both floors, with open ground all round on
// both, away from the star and from one another; marked on each floor.
function placeShafts(sf, df, seed) {
  const D = T.deep, w = sf.w, rng = new Rng(hashInts(seed, 0x5a4f));
  const openAround = (f, i) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (f.tiles[i + dy * w + dx] !== TILE_FLOOR) return false; return true; };
  const reach = floorDistances(df.tiles, df.w, df.h, df.rooms[0].cx, df.rooms[0].cy);
  const cand = [];
  for (let i = w + 1; i < w * sf.h - w - 1; i++) {
    const tx = i % w, ty = (i - tx) / w;
    if (Math.hypot(tx - sf.star.x, ty - sf.star.y) < D.fromStar || reach[i] < 0) continue;
    if (openAround(sf, i) && openAround(df, i)) cand.push(i);
  }
  const shafts = [];
  for (let tries = 0; tries < 4000 && shafts.length < D.n && cand.length; tries++) {
    const i = cand[rng.i(0, cand.length - 1)], tx = i % w, ty = (i - tx) / w;
    if (shafts.some((s) => Math.hypot(s.x - tx, s.y - ty) < D.apart)) continue;
    shafts.push({ x: tx, y: ty });
  }
  sf.shafts = shafts; df.shafts = shafts.map((s) => ({ x: s.x, y: s.y }));
  for (const s of shafts) { sf.tiles[s.y * w + s.x] = TILE_SHAFT; df.tiles[s.y * w + s.x] = TILE_SHAFT; }
}
// The shaft the Kindler stands at (within T.deep.reach tiles), or null.
function shaftNear(d) {
  const f = d.floor;
  if (!f.shafts) return null;
  for (const s of f.shafts) if (dist(d.p.x, d.p.y, (s.x + 0.5) * TILE, (s.y + 0.5) * TILE) < T.deep.reach * TILE) return s;
  return null;
}
// The Kindler to the other floor, standing by the shaft (or the point
// given). What lives on the floor he leaves is kept in d.layers; the
// floor he comes to gets its own back, or its creatures and critters
// placed the first time. The veins' grid is the layer's (veins.js).
const LAYER_FIELDS = ['enemies', 'life', 'fx', 'shots', 'bolts', 'drops', 'globs', 'puddles', 'auras', 'later', 'clouds', 'snares', 'hazT', 'keeper'];
function layerSwitch(d, to, x, y) {
  if (to === d.layer || !d.world) return false;
  d.layers = d.layers || [];
  const keep = {};
  for (const k of LAYER_FIELDS) keep[k] = d[k];
  d.layers[d.layer] = keep;
  d.layer = to;
  d.floor = to ? d.world.deep : d.world.surface;
  d.zone = to ? 'cave' : 'surface'; d.depth = to ? T.deep.depth : 1; d.deep = !!to;
  d.litG = d.litGs ? d.litGs[to] : null;
  d.flowAt = -1; d.flow = null; d.regionAt = -1; d.wading = 0;
  d.p.x = x; d.p.y = y; d.p.vx = d.p.vy = 0; d.drone = null;
  const had = d.layers[to];
  if (had) for (const k of LAYER_FIELDS) d[k] = had[k];
  else {
    for (const k of LAYER_FIELDS) d[k] = Array.isArray(keep[k]) ? [] : k === 'hazT' ? 0 : null;
    spawnEnemies(d);
    d.enemies = d.enemies.filter((e) => starLight(d, e.x, e.y) <= 0);
    if (typeof placeLife === 'function') placeLife(d);
  }
  d.clime = climeHere(d);
  return true;
}
// Down a shaft, or up it: the other floor's same tile, a step south of it.
function shaftTake(d) {
  const s = shaftNear(d);
  if (!s || d.hold) return;
  const to = d.layer ? 0 : 1, x = (s.x + 0.5) * TILE, y = (s.y + 0.5) * TILE + TILE * 0.9;
  if (!layerSwitch(d, to, x, y)) return;
  if (d.thread) d.thread.pts.push([x, y, to]);
  spawnSparks(x, y - 6, [ART.pal.star[2], '#ffffff'], 12);
  UI.toast(to ? 'Down into the Deep' : 'Up into the air', 'legendary');
  Story.say(to ? 'firstDown' : 'firstUp');
  snd('beaconLand');
  buzz(20);
}

// ---------------------------------------------------------------------------
// Drawn
// ---------------------------------------------------------------------------
// A shaft's tile: above, a hole into the dark, its far rim lit and its
// near rim in shadow, rubble round it; below, the daylight falling on the
// ground round the opening overhead.
function paintShaft(P, f, tx, ty, ox, oy, b) {
  const R = View.rockPx, W = P.w, OFF = -P.oy * W - P.ox, C32 = P.col32 || (P.col32 = new Uint32Array(P.col.buffer)), E = P.em;
  const cx = ox + ATILE / 2, cy = oy + ATILE / 2, rx = 9 * AP, ry = 6 * AP, seed = hashInts(f.seed, tx, ty, 0x5a4f);
  const put = (x, y, c, glow, a = 200) => { const k = y * W + x + OFF; if (x < P.ox || y < P.oy || x >= P.ox + W || y >= P.oy + P.h || R[k]) return; C32[k] = c; if (glow) { E[k * 4] = glow[0]; E[k * 4 + 1] = glow[1]; E[k * 4 + 2] = glow[2]; E[k * 4 + 3] = a; } };
  if (!f.layer) {
    const hole = [pntU32(rgbOf('#060408')), pntU32(rgbOf('#0c0a10')), pntU32(rgbOf('#14101a'))], rimLit = pntU32(rgbOf(b.floor[2])), rimDark = pntU32(rgbOf(b.front[0])), rubble = [pntU32(rgbOf(b.rock[2])), pntU32(rgbOf(b.rock[3]))];
    for (let j = -Math.ceil(ry) - 3; j <= Math.ceil(ry) + 3; j++)
      for (let i = -Math.ceil(rx) - 3; i <= Math.ceil(rx) + 3; i++) {
        const e = (i * i) / (rx * rx) + (j * j) / (ry * ry), x = Math.round(cx + i), y = Math.round(cy + j);
        if (e <= 1) put(x, y, hole[e > 0.8 ? 2 : e > 0.45 ? 1 : 0]);
        else if (e <= 1.35) put(x, y, j < -1 ? rimLit : j > 1 ? rimDark : hole[2]);
        else if (e <= 2.2 && artHash(x, y, seed) < 0.22) put(x, y, rubble[artHash(x, y, seed + 1) < 0.3 ? 1 : 0]);
      }
    return;
  }
  // below: a pool of pale daylight on the ground, specks of dust lit in it
  const day = rgbOf('#fff2d0');
  for (let j = -Math.ceil(ry * 2); j <= Math.ceil(ry * 2); j++)
    for (let i = -Math.ceil(rx * 1.6); i <= Math.ceil(rx * 1.6); i++) {
      const e = (i * i) / (rx * rx * 2.6) + (j * j) / (ry * ry * 4), x = Math.round(cx + i), y = Math.round(cy + j);
      if (e > 1 || x < P.ox || y < P.oy || x >= P.ox + W || y >= P.oy + P.h) continue;
      const k = y * W + x + OFF;
      if (R[k]) continue;
      const a = (1 - e) * (0.5 + 0.5 * artHash(x >> 1, y, seed));
      C32[k] = ugMix(C32[k], day, a * 0.35);
      if (artHash(x, y, seed + 2) < a * 0.08) put(x, y, pntU32(day), day, Math.round(120 * a));
    }
}
// The daylight down each shaft (the Deep's fixed lights).
function shaftLights(f) {
  if (!f.shafts) return [];
  const D = T.deep.light;
  return f.shafts.map((s) => ({ x: (s.x + 0.5) * TILE, y: (s.y + 0.5) * TILE, r: TILE * D[f.layer ? 0 : 2], i: f.layer ? D[1] : D[3], c: f.layer ? [1, 0.95, 0.82] : [0.6, 0.7, 1.0], plain: true }));
}
