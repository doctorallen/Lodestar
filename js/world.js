'use strict';
// ---------------------------------------------------------------------------
// The world: rolled once a save from its seed, in rings round the outpost
// (T.world). Ring 0 is the outpost; ring 1 the Rim, ring 2 the Choir, ring 3
// the Underforge, and ring 4 the Edge. worldLayout(seed) lays it out on the
// world map: each territory is the cell of map px nearer its middle than any
// other's (the borders wandering a little), and two whose cells share a
// border are neighbours. Each has a region (its ore and enemies), a depth
// (its danger within the region, more the further out it stands in its
// ring), a clime, a name and a heart goal, and some have a Deep below.
//
// generateTerritory(worldSeed, id) builds a territory's map: a surface site
// from the floor generator, with an opening at its edge towards each
// neighbour, a heart (where its spire is planted) and three waystones. It
// draws only from seeded generators, so it's the same map every visit.
// Nothing here knows how it's drawn or played (frontier.js).
// ---------------------------------------------------------------------------

const WORLD_NAMES = {
  badlands: ['Redmesa Flats', 'Gallow Buttes', 'Saltpan Reach', 'Dustwell', 'Ochre Steps', 'Scour Flats', 'Rustbank', 'Kiln Mesa', 'Dry Lantern', 'Sandglass Rise', 'Copperline', 'Brokenhorn', 'Sunstone Shelf', 'Hollowell'],
  bloomfen: ['Cattail Mire', 'Sporeveil Fen', 'Pollen Hollows', 'Mosslight Bog', 'Reedmother', 'Damp Lantern', 'Puffcap Mere', 'Velvet Sink', 'Greenwater', 'Fernhollow', 'Mirelamp', 'Softmoss Run', 'Toadstool Flats', 'Brackenmere'],
  frost: ['Tusk Steppe', 'Hoarfrost Run', 'Pale Sun Fields', 'Rimeglass Downs', 'Whitewind', 'Bell Moor', 'Chime Barrens', 'Hymn Shallows', 'Frostpipe Heath', 'Lowsnow', 'Glasswater', 'Coldlantern', 'Weeping Stone', 'Icereed Flats'],
  cinder: ['Emberfall Waste', 'Charline', 'Ashen Steps', 'Slag Marches', 'Cogfield', 'Kiln Gate', 'Brasslight', 'Clinker Run', 'Rustwind', 'Smoulder Flats', 'Blackglass', 'Cinderwell', 'Soot Crossing', 'Furnace Rise'],
  edge: ['Last Light', 'The Black Shore', 'Farside', 'The Quiet', 'Nightfold', 'Starless Reach', 'The Long Dark', 'Endmoor', 'Hush', 'Blind Water', 'The Verge', 'Lightsend'],
};
const WORLD_GOALS = ['waystones', 'rift'];

// Smooth value noise in 0..1, a bump about 1 unit across.
function worldNoise(x, y, s) {
  const x0 = Math.floor(x), y0 = Math.floor(y), u = x - x0, v = y - y0, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
  const n = (i, j) => { let h = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(s, 1442695041); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) & 0xffff) / 65535; };
  return lerp(lerp(n(x0, y0), n(x0 + 1, y0), su), lerp(n(x0, y0 + 1), n(x0 + 1, y0 + 1), su), sv);
}

const _worldLayouts = new Map();
function worldLayout(seed) {
  if (_worldLayouts.has(seed)) return _worldLayouts.get(seed);
  const W = T.world, M = W.map, C = M / 2, rng = new Rng(hashInts(seed, 0x30e1d));
  const terrs = [];
  W.rings.forEach((R, ring) => {
    const off = rng.f(Math.PI * 2);
    for (let k = 0; k < R.n; k++) {
      const a = off + ((k + rng.f(-0.28, 0.28)) / R.n) * Math.PI * 2, r = R.r + (R.band ? rng.f(-R.band, R.band) : 0);
      terrs.push({ id: terrs.length, ring, sx: C + Math.cos(a) * r, sy: C + Math.sin(a) * r, out: R.band ? (r - R.r + R.band) / (2 * R.band) : 0, edge: !!R.edge, nb: [] });
    }
  });
  // the cells: every map px in the disc belongs to the nearest middle, read
  // from a point wandered off it by noise, so the borders aren't straight
  const idMap = new Int8Array(M * M).fill(-1), ns = hashInts(seed, 0xb0de);
  const area = terrs.map(() => 0), sx = terrs.map(() => 0), sy = terrs.map(() => 0);
  const NT = terrs.length, TX = Float64Array.from(terrs, (t) => t.sx), TY = Float64Array.from(terrs, (t) => t.sy);
  for (let y = 0; y < M; y++)
    for (let x = 0; x < M; x++) {
      if (Math.hypot(x + 0.5 - C, y + 0.5 - C) > W.disc) continue;
      const wx = x + (worldNoise(x / 9, y / 9, ns) - 0.5) * 2 * W.warp, wy = y + (worldNoise(x / 9, y / 9, ns + 1) - 0.5) * 2 * W.warp;
      let best = 0, bd = Infinity;
      for (let k = 0; k < NT; k++) { const ex = wx - TX[k], ey = wy - TY[k], dd = ex * ex + ey * ey; if (dd < bd) { bd = dd; best = k; } }
      idMap[y * M + x] = best;
    }
  // each cell keeps only its largest piece: islands the wandering borders
  // cut off join the cell round them
  const comp = new Int32Array(M * M).fill(-1), pieces = [];
  for (let i = 0; i < M * M; i++) {
    if (idMap[i] < 0 || comp[i] >= 0) continue;
    const id = idMap[i], px = [i];
    comp[i] = pieces.length;
    for (let k = 0; k < px.length; k++) {
      const j = px[k], x = j % M;
      for (const n of [x > 0 ? j - 1 : -1, x < M - 1 ? j + 1 : -1, j - M, j + M]) if (n >= 0 && n < M * M && comp[n] < 0 && idMap[n] === id) { comp[n] = pieces.length; px.push(n); }
    }
    pieces.push({ id, px });
  }
  const biggest = {};
  for (const pc of pieces) if (!biggest[pc.id] || pc.px.length > biggest[pc.id].px.length) biggest[pc.id] = pc;
  for (const pc of pieces) {
    if (biggest[pc.id] === pc) continue;
    const votes = {};
    for (const j of pc.px) { const x = j % M; for (const n of [x > 0 ? j - 1 : -1, x < M - 1 ? j + 1 : -1, j - M, j + M]) if (n >= 0 && n < M * M && idMap[n] >= 0 && idMap[n] !== pc.id) votes[idMap[n]] = (votes[idMap[n]] || 0) + 1; }
    const to = Object.keys(votes).sort((a, b) => votes[b] - votes[a] || a - b)[0];
    if (to !== undefined) for (const j of pc.px) idMap[j] = Number(to);
  }
  for (let i = 0; i < M * M; i++) { const b = idMap[i]; if (b < 0) continue; area[b]++; sx[b] += (i % M) + 0.5; sy[b] += Math.floor(i / M) + 0.5; }
  // neighbours: cells that share enough border
  const shared = new Map();
  for (let y = 0; y < M; y++)
    for (let x = 0; x < M; x++) {
      const a = idMap[y * M + x];
      if (a < 0) continue;
      for (const b of [x + 1 < M ? idMap[y * M + x + 1] : -1, y + 1 < M ? idMap[(y + 1) * M + x] : -1]) {
        if (b < 0 || b === a) continue;
        const k = Math.min(a, b) * 64 + Math.max(a, b);
        shared.set(k, (shared.get(k) || 0) + 1);
      }
    }
  for (const [k, n] of [...shared.entries()].sort((p, q) => p[0] - q[0])) {
    if (n < W.border) continue;
    const a = Math.floor(k / 64), b = k % 64;
    terrs[a].nb.push(b); terrs[b].nb.push(a);
  }
  // each territory: where it's drawn, its region and depth, clime, name,
  // goal, and whether it has a Deep
  const names = {};
  for (const k in WORLD_NAMES) names[k] = rng.shuffle(WORLD_NAMES[k].slice());
  const spare = () => { for (const k in names) if (k !== 'edge' && names[k].length) return names[k].pop(); return 'Unnamed Land'; };
  const surf = Object.keys(T.climes).filter((id) => T.climes[id].zones.includes('surface'));
  for (const t of terrs) {
    t.cx = area[t.id] ? sx[t.id] / area[t.id] : t.sx; t.cy = area[t.id] ? sy[t.id] / area[t.id] : t.sy;
    const R = W.rings[t.ring];
    if (t.ring === 0) { Object.assign(t, { home: true, region: null, biome: 0, depth: 0, name: 'The Outpost', clime: null, goal: null, deep: 0 }); continue; }
    t.region = R.region; t.biome = R.region;
    // its depth by its rank out from the star among its ring, so every
    // ring runs evenly from gentle to hard
    const ring = terrs.filter((x) => x.ring === t.ring).sort((a, b) => a.out - b.out || a.id - b.id);
    t.depth = 1 + Math.floor((ring.indexOf(t) * 4) / ring.length) + (t.edge ? W.edgeDepth : 0);
    const region = T.biomes[t.biome].id;
    t.clime = rng.weighted(surf.map((id) => { const c = T.climes[id]; return [c.weight * ((c.lean && c.lean[t.edge ? 'underforge' : region]) || 1), id]; }));
    t.name = (t.edge ? names.edge.pop() : names[t.clime].pop()) || spare();
    t.goal = rng.weighted(WORLD_GOALS.map((g) => [W.goals[g].weight + W.goals[g].perRing * t.ring, g]));
    t.deep = rng.chance(W.deep.chance) ? rng.i(W.deep.sites[0], W.deep.sites[1]) : 0;
  }
  // the gentlest of ring 1 starts kindled; the furthest out of each of the
  // first three rings has a Deep that ends, while its shard is missing, in
  // its region's Keeper's Lair
  const ring1 = terrs.filter((t) => t.ring === 1).sort((a, b) => a.out - b.out);
  ring1[0].starter = true;
  for (let r = 1; r <= 3; r++) {
    const g = terrs.filter((t) => t.ring === r).sort((a, b) => b.out - a.out)[0];
    g.gate = true;
    g.deep = Math.max(2, g.deep);
  }
  const L = { seed, M, idMap, terrs };
  _worldLayouts.set(seed, L);
  return L;
}

// The floor seed of a territory, and of each site of its Deep.
function territorySeed(worldSeed, id) { return hashInts(worldSeed, id, 0x7e77); }
function deepSeed(worldSeed, id, site) { return hashInts(worldSeed, id, 0xdee9, site); }

// ---------------------------------------------------------------------------
// A territory's map
// ---------------------------------------------------------------------------
function generateTerritory(worldSeed, id) {
  const L = worldLayout(worldSeed), t = L.terrs[id];
  if (!t || t.home) return null;
  const seed = territorySeed(worldSeed, id), X = T.world.exits;
  const f = generateFloor(seed, t.depth, t.biome, 0, 'surface', t.deep ? 1 : 0, t.clime, T.world.gen);
  const { w, h, tiles, ore } = f, rng = new Rng(hashInts(seed, 0xe417));
  const steps = floorDistances(tiles, w, h, f.entry.x, f.entry.y);
  // the openings: each on the side of the map facing its neighbour, kept
  // apart round the edge and away from the corners
  const ang = t.nb.map((n) => ({ to: n, a: Math.atan2(L.terrs[n].cy - t.cy, L.terrs[n].cx - t.cx) })).sort((p, q) => p.a - q.a);
  const gap = (X.apart / (4 * (w - 4))) * Math.PI * 2;
  for (let it = 0; it < 30 && ang.length > 1; it++)
    for (let k = 0; k < ang.length; k++) {
      const p = ang[k], q = ang[(k + 1) % ang.length];
      let dd = q.a - p.a;
      if (k === ang.length - 1) dd += Math.PI * 2;
      if (dd < gap) { const push = (gap - dd) / 2 + 1e-4; p.a -= push; q.a += push; }
    }
  const c = (w - 1) / 2, lo = 8, hi = w - 9;
  f.exits = [];
  for (const o of ang) {
    const dx = Math.cos(o.a), dy = Math.sin(o.a), m = Math.max(Math.abs(dx), Math.abs(dy));
    let ex = c + (dx / m) * (c - 1), ey = c + (dy / m) * (c - 1);
    // which side, and the point along it
    let nx = 0, ny = 0;
    if (Math.abs(dx) >= Math.abs(dy)) { ex = dx > 0 ? w - 2 : 1; ey = clamp(Math.round(ey), lo, hi); nx = dx > 0 ? -1 : 1; }
    else { ey = dy > 0 ? h - 2 : 1; ex = clamp(Math.round(ex), lo, hi); ny = dy > 0 ? -1 : 1; }
    const ax = ex + nx * X.inward, ay = ey + ny * X.inward;
    carveExit(f, steps, ex, ey, nx, ny, rng);
    f.exits.push({ x: ex, y: ey, to: o.to, nx, ny, ax, ay });
  }
  // more veins than a site's: dark land is worth mining
  const deepOre = Math.min(T.oreDeep.max, T.oreDeep.base + T.oreDeep.perFloor * (t.depth - 1)), B = T.biomes[t.biome];
  for (const r of f.rooms.slice(1)) {
    const walls = [];
    for (const i of r.cells) for (const [dx, dy] of DIRS4) if (tiles[i + dy * w + dx] === TILE_ROCK) walls.push(i + dy * w + dx);
    for (let n = rng.i(T.world.veins[0], T.world.veins[1]); n > 0 && walls.length; n--) {
      let i = rng.pick(walls);
      const kind = ORE_INDEX[B.ores[rng.chance(deepOre) ? 1 : 0]] + 1;
      for (let k = rng.i(T.floor.veinLen[0], T.floor.veinLen[1]); k > 0; k--) {
        tiles[i] = TILE_ORE; ore[i] = kind;
        const next = DIRS4.map(([dx, dy]) => i + dy * w + dx).filter((j) => tiles[j] === TILE_ROCK);
        if (!next.length) break;
        i = rng.pick(next);
      }
    }
  }
  // the heart, where the spire is planted, in the cavern nearest the middle;
  // the waystones in caverns spread far from it and from each other
  const near = [f.entry].concat(f.exits, f.ways);
  const roomOf = (r, p) => p && r.cells.includes(p.y * w + p.x);
  const portalRoom = f.ways.length ? f.rooms.find((r) => roomOf(r, f.ways[0])) : null;
  const rooms = f.rooms.filter((r) => r !== portalRoom && r.cells && r.cells.length);
  const spotIn = (r, avoid) => {
    let best = null, bd = Infinity;
    const keep = near.concat(avoid);
    for (const i of r.cells) {
      const x = i % w, y = Math.floor(i / w);
      if (!territorySpotOk(f, x, y) || keep.some((p) => Math.abs(p.x - x) + Math.abs(p.y - y) < 4)) continue;
      const m2 = (x - r.cx) * (x - r.cx) + (y - r.cy) * (y - r.cy);
      if (m2 < bd) { bd = m2; best = { x, y }; }
    }
    return best;
  };
  const byMiddle = rooms.slice(1).concat(rooms.slice(0, 1)).sort((a, b) => Math.hypot(a.cx - c, a.cy - c) - Math.hypot(b.cx - c, b.cy - c));
  let heartRoom = null;
  for (const r of byMiddle) { const s = spotIn(r, []); if (s) { f.heart = s; heartRoom = r; break; } }
  if (!f.heart) f.heart = { x: f.entry.x, y: f.entry.y };
  f.stones = [];
  const used = [heartRoom];
  for (let k = 0; k < 3; k++) {
    const placed = [f.heart].concat(f.stones);
    const far = (r) => Math.min(...placed.map((p) => Math.hypot(r.cx - p.x, r.cy - p.y)));
    const order = rooms.filter((r) => !used.includes(r)).sort((a, b) => far(b) - far(a)).concat(rooms.filter((r) => used.includes(r)));
    let s = null;
    for (const r of order) { s = spotIn(r, placed); if (s && Math.min(...placed.map((p) => Math.hypot(s.x - p.x, s.y - p.y))) >= 6) { used.push(r); break; } s = null; }
    if (!s) {
      // a small territory: anywhere open, as far as it can be from the rest
      let bd = -1;
      for (let i = 0; i < w * h; i++) {
        const x = i % w, y = Math.floor(i / w);
        if (steps[i] < 0 || !territorySpotOk(f, x, y) || near.some((p) => Math.abs(p.x - x) + Math.abs(p.y - y) < 4)) continue;
        const m = Math.min(...placed.map((p) => Math.hypot(x - p.x, y - p.y)));
        if (m > bd) { bd = m; s = { x, y }; }
      }
    }
    f.stones.push(s || { x: f.entry.x, y: f.entry.y });
  }
  f.territory = id;
  return f;
}

// Open ground with open ground all round it and no hazard near: room for a
// spire or a waystone.
function territorySpotOk(f, x, y) {
  if (x < 3 || y < 3 || x > f.w - 4 || y > f.h - 4) return false;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (f.tiles[(y + dy) * f.w + x + dx] !== TILE_FLOOR) return false;
  if (f.haz) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (f.haz[(y + dy) * f.w + x + dx]) return false;
  for (const p of f.hazPts || []) if (Math.abs(p.x - x) <= 2 && Math.abs(p.y - y) <= 2) return false;
  return true;
}

// A passage from an opening at the map's edge (ex, ey) inwards: straight in
// for a few tiles, then wandering to the nearest ground reached from the
// entry. Only rock and ore are dug; the frame of edge round the map stays.
function carveExit(f, steps, ex, ey, nx, ny, rng) {
  const { w, h, tiles, ore } = f, R = T.world.exits.tunnelR;
  const dig = (x, y, r) => {
    for (let ty = Math.floor(y - r); ty <= Math.ceil(y + r); ty++)
      for (let tx = Math.floor(x - r); tx <= Math.ceil(x + r); tx++) {
        if (tx < 1 || ty < 1 || tx > w - 2 || ty > h - 2 || (tx - x) * (tx - x) + (ty - y) * (ty - y) > r * r) continue;
        const i = ty * w + tx;
        if (tiles[i] === TILE_ROCK || tiles[i] === TILE_ORE) { tiles[i] = TILE_FLOOR; ore[i] = 0; }
      }
  };
  let x = ex, y = ey;
  for (let k = 0; k <= 4; k++) { dig(x, y, R); x += nx; y += ny; }
  // the nearest ground walked to from the entry
  let best = null, bd = Infinity;
  for (let i = 0; i < w * h; i++) {
    if (steps[i] < 0) continue;
    const m = (i % w - x) ** 2 + (Math.floor(i / w) - y) ** 2;
    if (m < bd) { bd = m; best = { x: i % w, y: Math.floor(i / w) }; }
  }
  if (!best) return;
  let drift = 0;
  for (let n = 0; n < 400 && Math.hypot(best.x - x, best.y - y) > 0.8; n++) {
    drift = clamp(drift * 0.9 + rng.f(-0.25, 0.25), -0.9, 0.9);
    const head = Math.atan2(best.y - y, best.x - x) + drift;
    x = clamp(x + Math.cos(head) * 0.5, 2, w - 3); y = clamp(y + Math.sin(head) * 0.5, 2, h - 3);
    dig(x, y, R + 0.2 * Math.sin(n * 0.3));
  }
  dig(best.x, best.y, R);
}

// One number for a territory, for the golden tests.
function territoryHash(f) {
  let hsh = floorHash(f);
  for (const e of f.exits) hsh = hashInts(hsh, e.x, e.y, e.to);
  for (const s of [f.heart].concat(f.stones)) hsh = hashInts(hsh, s.x, s.y);
  return hsh;
}
