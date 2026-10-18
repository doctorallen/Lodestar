'use strict';
// ---------------------------------------------------------------------------
// Floor generation. generateFloor(seed, depth, biome) always builds the same
// floor for the same arguments: caverns with ragged, rounded edges, joined
// by tunnels that wander like rivers, ore veins running into the walls, the
// entry, the shaft down and (on most floors) a lodeline out. It draws only
// from its own Rng, never Math.random.
//
// The floor is a grid of tiles, but its walls are drawn and felt along a
// smooth line: rockAt(f, x, y) blends the four nearest tiles' solidity and
// adds a little noise, so corners round off and edges wander by a few
// pixels. Bodies collide with that line, not with the tiles' squares.
// ---------------------------------------------------------------------------

const TILE_FLOOR = 0, TILE_ROCK = 1, TILE_ORE = 2, TILE_EDGE = 3, TILE_PAD = 4, TILE_SHAFT = 5, TILE_PIT = 6;
// Indexed by tile type: does it stop a body? (The pit is the sinkhole under
// the Lodestar: it can't be walked into.)
const TILE_SOLID = [false, true, true, true, false, false, true];

// Where each ore sits in T.ores, by id. A floor's ore array holds index + 1.
const ORE_INDEX = Object.fromEntries(T.ores.map((o, i) => [o.id, i]));
const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// The tile at tx, ty; outside the floor counts as the unbreakable edge.
function floorTile(f, tx, ty) {
  return tx < 0 || ty < 0 || tx >= f.w || ty >= f.h ? TILE_EDGE : f.tiles[ty * f.w + tx];
}

// A site of an expedition. depth: which site (1–4); reach: how far along
// the Lodestar's lines are sure to reach; zone: 'cave' (lumpy caverns and
// wandering tunnels), 'surface' (the open badlands in sunlight: wider
// caverns, broad passes), 'ruin' (rectangular halls and straight
// corridors), 'lair' (a Keeper's great arena) or 'deep' (a cave rich in the
// deeper ore). ways: how many shafts lead on (each a TILE_SHAFT, listed in
// f.ways, furthest first).
function generateFloor(seed, depth, biome, reach = T.floor.padSure, zone = 'cave', ways = 1) {
  if (zone === 'ruin') return generateRuin(seed, depth, biome, reach, ways);
  const F = Object.assign({}, T.floor, T.zones[zone] && T.zones[zone].gen), B = T.biomes[biome];
  const rng = new Rng(hashInts(seed, depth, biome, ZONE_SALT[zone] || 0x10de));
  const w = F.w, h = F.h;
  const tiles = new Uint8Array(w * h).fill(TILE_ROCK), ore = new Uint8Array(w * h);
  const inside = (x, y) => x >= 2 && y >= 2 && x < w - 2 && y < h - 2;
  const dig = (x, y) => { if (inside(x, y)) tiles[y * w + x] = TILE_FLOOR; };
  // every tile whose centre is within r of (x, y)
  const disc = (x, y, r) => {
    for (let ty = Math.floor(y - r); ty <= Math.ceil(y + r); ty++)
      for (let tx = Math.floor(x - r); tx <= Math.ceil(x + r); tx++) if ((tx - x) * (tx - x) + (ty - y) * (ty - y) <= r * r) dig(tx, ty);
  };

  // caverns: lumpy blobs, their radius rippling round the centre (a lair
  // starts with its arena, far from where you come in)
  const rooms = [];
  if (zone === 'lair') {
    rooms.push({ cx: 8, cy: h - 9, rx: 3, ry: 3, p1: 0, p2: 1, a1: 0.1, a2: 0.05 });
    rooms.push({ cx: w - 15, cy: 15, rx: 7.5, ry: 6.5, p1: 1, p2: 2, a1: 0.12, a2: 0.06, arena: true });
  }
  const want = rng.i(F.rooms[0], F.rooms[1]);
  for (let tries = 0; tries < 500 && rooms.length < want; tries++) {
    const rx = rng.f(F.roomR[0], F.roomR[1]), ry = rng.f(F.roomR[0], F.roomR[1]);
    const cx = rng.i(Math.ceil(rx) + 3, w - Math.ceil(rx) - 4), cy = rng.i(Math.ceil(ry) + 3, h - Math.ceil(ry) - 4);
    if (rooms.some((r) => Math.hypot(r.cx - cx, r.cy - cy) < r.rx + rx + F.roomGap && Math.hypot(r.cx - cx, r.cy - cy) < r.ry + ry + F.roomGap)) continue;
    rooms.push({ cx, cy, rx, ry, p1: rng.f(Math.PI * 2), p2: rng.f(Math.PI * 2), a1: rng.f(0.1, 0.25), a2: rng.f(0.05, 0.15) });
  }
  for (const r of rooms) {
    for (let ty = Math.floor(r.cy - r.ry * 1.4); ty <= Math.ceil(r.cy + r.ry * 1.4); ty++)
      for (let tx = Math.floor(r.cx - r.rx * 1.4); tx <= Math.ceil(r.cx + r.rx * 1.4); tx++) {
        const dx = (tx - r.cx) / r.rx, dy = (ty - r.cy) / r.ry, a = Math.atan2(dy, dx);
        const edge = 1 + r.a1 * Math.sin(3 * a + r.p1) + r.a2 * Math.sin(5 * a + r.p2);
        if (dx * dx + dy * dy <= edge * edge) dig(tx, ty);
      }
    disc(r.cx, r.cy, 1.2);
  }

  // tunnels wander from one cavern to the next like a river: always heading
  // roughly for the far end, the heading drifting from side to side
  const tunnel = (a, b) => {
    let x = a.cx, y = a.cy, drift = 0;
    const wide = rng.f(F.tunnelR[0], F.tunnelR[1]);
    for (let n = 0; n < 600 && Math.hypot(b.cx - x, b.cy - y) > 1; n++) {
      drift = clamp(drift * 0.92 + rng.f(-F.meander, F.meander), -1.3, 1.3);
      const head = Math.atan2(b.cy - y, b.cx - x) + drift;
      x = clamp(x + Math.cos(head) * 0.5, 2.5, w - 3.5);
      y = clamp(y + Math.sin(head) * 0.5, 2.5, h - 3.5);
      disc(x, y, wide + 0.3 * Math.sin(n * 0.21));
    }
    disc(b.cx, b.cy, wide);
  };
  for (let i = 1; i < rooms.length; i++) {
    let best = 0, bd = Infinity;
    for (let j = 0; j < i; j++) {
      const dd = dist2(rooms[i].cx, rooms[i].cy, rooms[j].cx, rooms[j].cy);
      if (dd < bd) { bd = dd; best = j; }
    }
    tunnel(rooms[i], rooms[best]);
  }
  const loops = rng.i(F.loops[0], F.loops[1]);
  for (let n = 0; n < loops && rooms.length > 2; n++) {
    const a = rng.i(0, rooms.length - 1), b = rng.i(0, rooms.length - 1);
    if (a !== b) tunnel(rooms[a], rooms[b]);
  }
  // a pillar or two of rock left standing in the bigger caverns
  for (const r of rooms.slice(1)) {
    if (r.rx < 3.5 || r.ry < 3.5 || !rng.chance(F.pillar)) continue;
    const a = rng.f(Math.PI * 2), k = rng.f(0.35, 0.55);
    const px = Math.round(r.cx + Math.cos(a) * r.rx * k), py = Math.round(r.cy + Math.sin(a) * r.ry * k);
    tiles[py * w + px] = TILE_ROCK;
    if (rng.chance(0.5)) tiles[py * w + px + 1] = TILE_ROCK;
  }
  // rock with open ground on most sides crumbles away, smoothing the edges
  for (let y = 2; y < h - 2; y++)
    for (let x = 2; x < w - 2; x++) {
      if (tiles[y * w + x] !== TILE_ROCK) continue;
      let open = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && tiles[(y + dy) * w + x + dx] === TILE_FLOOR) open++;
      if (open >= 6) tiles[y * w + x] = TILE_FLOOR;
    }
  for (let x = 0; x < w; x++) { tiles[x] = TILE_EDGE; tiles[(h - 1) * w + x] = TILE_EDGE; }
  for (let y = 0; y < h; y++) { tiles[y * w] = TILE_EDGE; tiles[y * w + w - 1] = TILE_EDGE; }

  // whatever open ground can't be walked to from the entry fills back in
  const steps = floorDistances(tiles, w, h, rooms[0].cx, rooms[0].cy);
  for (let i = 0; i < w * h; i++) if (tiles[i] === TILE_FLOOR && steps[i] < 0) tiles[i] = TILE_ROCK;
  // each cavern's own ground, for placing things in it
  for (const r of rooms) {
    r.cells = [];
    for (let ty = Math.floor(r.cy - r.ry * 1.3); ty <= Math.ceil(r.cy + r.ry * 1.3); ty++)
      for (let tx = Math.floor(r.cx - r.rx * 1.3); tx <= Math.ceil(r.cx + r.rx * 1.3); tx++)
        if (tx > 0 && ty > 0 && tx < w - 1 && ty < h - 1 && tiles[ty * w + tx] === TILE_FLOOR) r.cells.push(ty * w + tx);
    r.x = Math.floor(r.cx - r.rx); r.y = Math.floor(r.cy - r.ry); r.w = Math.ceil(2 * r.rx) + 1; r.h = Math.ceil(2 * r.ry) + 1;
  }

  const { shafts, pad } = placeExits(tiles, w, rooms, steps, rng, depth, reach, F, ways, zone);

  // ore veins: each starts in the wall of a cavern and wanders into the rock
  const deep = zone === 'deep' ? T.oreDeep.max : Math.min(T.oreDeep.max, T.oreDeep.base + T.oreDeep.perFloor * (depth - 1));
  for (const r of rooms.slice(1)) {
    if (r.arena) continue;
    const walls = [];
    for (const i of r.cells) for (const [dx, dy] of DIRS4) if (tiles[i + dy * w + dx] === TILE_ROCK) walls.push(i + dy * w + dx);
    const veins = rng.i(F.veins[0], F.veins[1]);
    for (let n = 0; n < veins && walls.length; n++) {
      let i = rng.pick(walls);
      const kind = ORE_INDEX[B.ores[rng.chance(deep) ? 1 : 0]] + 1;
      const len = rng.i(F.veinLen[0], F.veinLen[1]);
      for (let k = 0; k < len; k++) {
        tiles[i] = TILE_ORE; ore[i] = kind;
        const next = DIRS4.map(([dx, dy]) => i + dy * w + dx).filter((j) => tiles[j] === TILE_ROCK);
        if (!next.length) break;
        i = rng.pick(next);
      }
    }
  }

  return { seed, depth, biome, zone, w, h, tiles, ore, rooms, entry: { x: rooms[0].cx, y: rooms[0].cy }, ways: shafts, shaft: shafts[0] || null, pad, arena: rooms.find((r) => r.arena) || null };
}

const ZONE_SALT = { cave: 0x10de, surface: 0x5a11, ruin: 0x7111, lair: 0x1a17, deep: 0xdee9 };

// The ways on (shafts) in the caverns furthest from the entry on foot, and
// the lodeline (when the star reaches this far) in another. A lair's
// lodeline is in its arena (it lights when the Keeper falls).
function placeExits(tiles, w, rooms, steps, rng, depth, reach, F, ways, zone) {
  const far = rooms.slice(1).map((r) => [steps[r.cy * w + r.cx], r]).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0]).map(([, r]) => r);
  const shafts = [];
  for (let k = 0; k < ways && k < far.length; k++) { const r = far[k]; tiles[r.cy * w + r.cx] = TILE_SHAFT; shafts.push({ x: r.cx, y: r.cy }); }
  let pad = null;
  const arena = rooms.find((r) => r.arena);
  if (arena) { pad = { x: arena.cx, y: arena.cy + 3 }; tiles[pad.y * w + pad.x] = TILE_PAD; return { shafts, pad }; }
  const padChance = depth <= reach ? 1 : F.padBeyond;
  const rest = far.slice(shafts.length);
  if (rest.length && rng.chance(padChance)) {
    const r = rest[rng.i(0, Math.min(rest.length - 1, 1))];
    pad = { x: r.cx, y: r.cy };
    tiles[r.cy * w + r.cx] = TILE_PAD;
  }
  return { shafts, pad };
}

// A ruin: rectangular halls kept apart, joined by straight corridors two
// wide, with fewer veins.
function generateRuin(seed, depth, biome, reach, ways) {
  const F = Object.assign({}, T.floor, T.zones.ruin.gen), B = T.biomes[biome];
  const rng = new Rng(hashInts(seed, depth, biome, ZONE_SALT.ruin));
  const w = F.w, h = F.h;
  const tiles = new Uint8Array(w * h).fill(TILE_ROCK), ore = new Uint8Array(w * h);
  const dig = (x, y) => { if (x >= 2 && y >= 2 && x < w - 2 && y < h - 2) tiles[y * w + x] = TILE_FLOOR; };
  const rooms = [];
  const want = rng.i(F.rooms[0], F.rooms[1]);
  for (let tries = 0; tries < 400 && rooms.length < want; tries++) {
    const rw = rng.i(F.roomW[0], F.roomW[1]), rh = rng.i(F.roomH[0], F.roomH[1]);
    const x = rng.i(3, w - rw - 4), y = rng.i(3, h - rh - 4);
    if (rooms.some((r) => x < r.x + r.w + 3 && x + rw + 3 > r.x && y < r.y + r.h + 3 && y + rh + 3 > r.y)) continue;
    rooms.push({ x, y, w: rw, h: rh, cx: x + (rw >> 1), cy: y + (rh >> 1), rx: rw / 2, ry: rh / 2 });
  }
  for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) dig(x, y);
  const hall = (x0, y0, x1, y1) => {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) { dig(x, y); dig(x + 1, y); dig(x, y + 1); }
  };
  const join = (a, b) => { const [mx, my] = rng.chance(0.5) ? [b.cx, a.cy] : [a.cx, b.cy]; hall(a.cx, a.cy, mx, my); hall(mx, my, b.cx, b.cy); };
  for (let i = 1; i < rooms.length; i++) {
    let best = 0, bd = Infinity;
    for (let j = 0; j < i; j++) { const dd = dist2(rooms[i].cx, rooms[i].cy, rooms[j].cx, rooms[j].cy); if (dd < bd) { bd = dd; best = j; } }
    join(rooms[i], rooms[best]);
  }
  for (let n = rng.i(1, 2); n > 0 && rooms.length > 2; n--) { const a = rng.i(0, rooms.length - 1), b = rng.i(0, rooms.length - 1); if (a !== b) join(rooms[a], rooms[b]); }
  // pillars standing in the larger halls
  for (const r of rooms.slice(1)) if (r.w >= 7 && r.h >= 6 && rng.chance(0.6)) { tiles[(r.y + 2) * w + r.x + 2] = TILE_ROCK; tiles[(r.y + 2) * w + r.x + r.w - 3] = TILE_ROCK; }
  for (let x = 0; x < w; x++) { tiles[x] = TILE_EDGE; tiles[(h - 1) * w + x] = TILE_EDGE; }
  for (let y = 0; y < h; y++) { tiles[y * w] = TILE_EDGE; tiles[y * w + w - 1] = TILE_EDGE; }
  const steps = floorDistances(tiles, w, h, rooms[0].cx, rooms[0].cy);
  for (let i = 0; i < w * h; i++) if (tiles[i] === TILE_FLOOR && steps[i] < 0) tiles[i] = TILE_ROCK;
  for (const r of rooms) {
    r.cells = [];
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (tiles[y * w + x] === TILE_FLOOR) r.cells.push(y * w + x);
  }
  const { shafts, pad } = placeExits(tiles, w, rooms, steps, rng, depth, reach, F, ways, 'ruin');
  const deep = Math.min(T.oreDeep.max, T.oreDeep.base + T.oreDeep.perFloor * (depth - 1));
  for (const r of rooms.slice(1)) {
    if (!rng.chance(F.veinChance)) continue;
    const walls = [];
    for (const i of r.cells) for (const [dx, dy] of DIRS4) if (tiles[i + dy * w + dx] === TILE_ROCK) walls.push(i + dy * w + dx);
    if (!walls.length) continue;
    let i = rng.pick(walls);
    const kind = ORE_INDEX[B.ores[rng.chance(deep) ? 1 : 0]] + 1;
    for (let k = rng.i(F.veinLen[0], F.veinLen[1]); k > 0; k--) {
      tiles[i] = TILE_ORE; ore[i] = kind;
      const next = DIRS4.map(([dx, dy]) => i + dy * w + dx).filter((j) => tiles[j] === TILE_ROCK);
      if (!next.length) break;
      i = rng.pick(next);
    }
  }
  return { seed, depth, biome, zone: 'ruin', wallNoise: 0.03, w, h, tiles, ore, rooms, entry: { x: rooms[0].cx, y: rooms[0].cy }, ways: shafts, shaft: shafts[0] || null, pad, arena: null };
}

// Steps on foot from x, y to every open tile (-1 where it can't be reached).
function floorDistances(tiles, w, h, x, y) {
  const d = new Int16Array(w * h).fill(-1), q = [y * w + x];
  d[q[0]] = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi], cx = i % w, cy = (i - cx) / w;
    for (const [dx, dy] of DIRS4) {
      const j = (cy + dy) * w + cx + dx;
      if (d[j] < 0 && !TILE_SOLID[tiles[j]]) { d[j] = d[i] + 1; q.push(j); }
    }
  }
  return d;
}

// ---------------------------------------------------------------------------
// The smooth wall line
// ---------------------------------------------------------------------------

// Smooth value noise in -1..1, about `scale` px across a bump.
function wallNoise(x, y, scale) {
  const gx = x / scale, gy = y / scale, x0 = Math.floor(gx), y0 = Math.floor(gy);
  const u = gx - x0, v = gy - y0, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
  const n = (i, j) => (hashInts(i, j, 0x5a17) & 0xffff) / 32767.5 - 1;
  return lerp(lerp(n(x0, y0), n(x0 + 1, y0), su), lerp(n(x0, y0 + 1), n(x0 + 1, y0 + 1), su), sv);
}

// Is the world pixel x, y rock? The four nearest tiles' solidity blended,
// with a little noise, cut at a half.
function rockAt(f, x, y) {
  const gx = x / TILE - 0.5, gy = y / TILE - 0.5, tx = Math.floor(gx), ty = Math.floor(gy), u = gx - tx, v = gy - ty;
  const s = (i, j) => (TILE_SOLID[floorTile(f, i, j)] ? 1 : 0);
  const a = s(tx, ty), b = s(tx + 1, ty), c = s(tx, ty + 1), d = s(tx + 1, ty + 1);
  if (a === b && b === c && c === d) return a === 1;
  let blend = lerp(lerp(a, b, u), lerp(c, d, u), v);
  // two open tiles that meet only at a corner (a vein mined on the
  // diagonal) would pinch shut there: open the corner wide enough to walk
  if (a === d && b === c) blend *= 0.55;
  return blend + (f.wallNoise !== undefined ? f.wallNoise : T.floor.wallNoise) * wallNoise(x, y, 7) > 0.5;
}

// One number for a floor's layout, for the golden tests.
function floorHash(f) {
  let h = hashInts(f.w, f.h, f.entry.x, f.entry.y);
  for (let i = 0; i < f.tiles.length; i++) h = hashInts(h, f.tiles[i] * 16 + f.ore[i]);
  return h;
}

// ---------------------------------------------------------------------------
// The outpost: a plateau on the sinkhole's rim, the pit itself above it
// (the Lodestar hangs over the middle), and the stations round it. Always the
// same. Each station is { id, x, y } in tiles.
// ---------------------------------------------------------------------------
const HUB_W = 22, HUB_H = 24;
const HUB_STATIONS = [
  { id: 'descend', x: 11, y: 11 },
  { id: 'altar', x: 6, y: 10 }, { id: 'locker', x: 16, y: 10 },
  { id: 'forge', x: 6, y: 15 }, { id: 'runes', x: 16, y: 15 },
  { id: 'wreck', x: 11, y: 19 },
  { id: 'dummy', x: 16, y: 19 },
];
function makeHubFloor() {
  const w = HUB_W, h = HUB_H, tiles = new Uint8Array(w * h).fill(TILE_ROCK);
  const inEllipse = (x, y, cx, cy, rx, ry, wob) => {
    const dx = (x - cx) / rx, dy = (y - cy) / ry, a = Math.atan2(dy, dx);
    const e = 1 + wob * Math.sin(3 * a + 1.3) + wob * 0.6 * Math.sin(5 * a + 0.4);
    return dx * dx + dy * dy <= e * e;
  };
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      if (inEllipse(x, y, 11, 12.5, 9.6, 10.6, 0.06)) tiles[y * w + x] = TILE_FLOOR;
      if (inEllipse(x, y, 11, 6.4, 5.4, 4.2, 0.08)) tiles[y * w + x] = TILE_PIT;
    }
  for (let x = 0; x < w; x++) { tiles[x] = TILE_EDGE; tiles[(h - 1) * w + x] = TILE_EDGE; }
  for (let y = 0; y < h; y++) { tiles[y * w] = TILE_EDGE; tiles[y * w + w - 1] = TILE_EDGE; }
  for (const s of HUB_STATIONS) tiles[s.y * w + s.x] = TILE_FLOOR;
  const start = { x: 11, y: 14 };
  return { seed: 0x10de57a, depth: 0, biome: 0, hub: true, w, h, tiles, ore: new Uint8Array(w * h), rooms: [], entry: start, shaft: { x: -9, y: -9 }, pad: null };
}
