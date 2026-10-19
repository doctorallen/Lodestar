'use strict';
// ---------------------------------------------------------------------------
// Floor generation. generateFloor(seed, depth, biome) always builds the same
// floor for the same arguments: caverns with ragged, rounded edges, joined
// by tunnels that wander like rivers, ore veins running into the walls, the
// entry, the portals on and (on most floors) a lodeline out. It draws only
// from its own Rng, never Math.random.
//
// The floor is a grid of tiles, but its walls are drawn and felt along a
// smooth line: rockAt(f, x, y) blends the four nearest tiles' solidity and
// adds a little noise, so corners round off and edges wander by a few
// pixels. Bodies collide with that line, not with the tiles' squares.
// ---------------------------------------------------------------------------

const TILE_FLOOR = 0, TILE_ROCK = 1, TILE_ORE = 2, TILE_EDGE = 3, TILE_PAD = 4, TILE_PORTAL = 5;
// Indexed by tile type: does it stop a body?
const TILE_SOLID = [false, true, true, true, false, false];

// Where each ore sits in T.ores, by id. A floor's ore array holds index + 1.
const ORE_INDEX = Object.fromEntries(T.ores.map((o, i) => [o.id, i]));
const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// The tile at tx, ty; outside the floor counts as the unbreakable edge.
function floorTile(f, tx, ty) {
  return tx < 0 || ty < 0 || tx >= f.w || ty >= f.h ? TILE_EDGE : f.tiles[ty * f.w + tx];
}

// A site of an expedition. depth: which site (1–4); padChance: the chance
// it has a lodeline; zone: 'cave' (lumpy caverns and
// wandering tunnels), 'surface' (the open badlands in sunlight: wider
// caverns, broad passes), 'ruin' (rectangular halls and straight
// corridors), 'lair' (a Keeper's great arena) or 'deep' (a cave rich in the
// deeper ore). ways: how many portals lead on (each stands on a
// TILE_PORTAL, listed in f.ways, furthest first; portals.js draws them).
// clime: its country (T.climes), which may change the generator and lays
// its hazard over the ground (placeHazards). over: overrides of the
// generator's numbers on top of all that (a territory's, world.js).
function generateFloor(seed, depth, biome, padChance = 1, zone = 'cave', ways = 1, clime = null, over = null) {
  if (zone === 'ruin') return generateRuin(seed, depth, biome, padChance, ways, clime);
  const F = Object.assign({}, T.floor, T.zones[zone] && T.zones[zone].gen, climeGen(clime), over), B = T.biomes[biome];
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

  const { portals, pad } = placeExits(tiles, w, rooms, steps, rng, padChance, ways, zone);

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

  return placeHazards({ seed, depth, biome, zone, clime, w, h, tiles, ore, rooms, entry: { x: rooms[0].cx, y: rooms[0].cy }, ways: portals, portal: portals[0] || null, pad, arena: rooms.find((r) => r.arena) || null });
}

// A clime's overrides of the generator, if any.
function climeGen(clime) { return (clime && T.climes[clime] && T.climes[clime].gen) || null; }

const ZONE_SALT = { cave: 0x10de, surface: 0x5a11, ruin: 0x7111, lair: 0x1a17, deep: 0xdee9 };

// The ways on (portals) in the caverns furthest from the entry on foot, and
// the lodeline (if the chance comes up) in another. A lair's
// lodeline is in its arena (it lights when the Keeper falls).
function placeExits(tiles, w, rooms, steps, rng, padChance, ways, zone) {
  const far = rooms.slice(1).map((r) => [steps[r.cy * w + r.cx], r]).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0]).map(([, r]) => r);
  const portals = [];
  for (let k = 0; k < ways && k < far.length; k++) { const r = far[k]; tiles[r.cy * w + r.cx] = TILE_PORTAL; portals.push({ x: r.cx, y: r.cy }); }
  let pad = null;
  const arena = rooms.find((r) => r.arena);
  if (arena) { pad = { x: arena.cx, y: arena.cy + 3 }; tiles[pad.y * w + pad.x] = TILE_PAD; return { portals, pad }; }
  const rest = far.slice(portals.length);
  if (rest.length && rng.chance(padChance)) {
    const r = rest[rng.i(0, Math.min(rest.length - 1, 1))];
    pad = { x: r.cx, y: r.cy };
    tiles[r.cy * w + r.cx] = TILE_PAD;
  }
  return { portals, pad };
}

// A ruin: rectangular halls kept apart, joined by straight corridors two
// wide, with fewer veins.
function generateRuin(seed, depth, biome, padChance, ways, clime) {
  const F = Object.assign({}, T.floor, T.zones.ruin.gen, climeGen(clime)), B = T.biomes[biome];
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
  const { portals, pad } = placeExits(tiles, w, rooms, steps, rng, padChance, ways, 'ruin');
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
  return placeHazards({ seed, depth, biome, zone: 'ruin', clime, wallNoise: 0.03, w, h, tiles, ore, rooms, entry: { x: rooms[0].cx, y: rooms[0].cy }, ways: portals, portal: portals[0] || null, pad, arena: null });
}

// ---------------------------------------------------------------------------
// Hazards: a clime's one quirk, laid over the open ground after the layout
// is made, from a generator of its own, so the tiles don't change. Area
// hazards (pools, ice, lava) mark f.haz with their code; vents and spore
// pods are points in f.hazPts. Nothing goes in the entry's cavern, on a
// way or the lodeline or beside them, and lava never cuts ground off.
// ---------------------------------------------------------------------------
const HAZ_CODES = { pool: 1, slick: 2, burn: 3 };
function placeHazards(f) {
  const C = f.clime && T.climes[f.clime];
  f.haz = null; f.hazPts = null; f.hazKind = null; f.hazCode = 0;
  if (!C || !C.hazard) return f;
  const kind = C.hazard, H = Object.assign({}, T.hazards[kind], C.haz), w = f.w, tiles = f.tiles;
  const rng = new Rng(hashInts(f.seed, f.depth, f.biome, ZONE_SALT[f.zone] || 0, hashString(f.clime)));
  const banned = new Uint8Array(w * f.h);
  const ban = (x, y, r) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const i = (y + dy) * w + x + dx; if (i >= 0 && i < banned.length) banned[i] = 1; } };
  for (const i of f.rooms[0].cells || []) banned[i] = 1;
  ban(f.entry.x, f.entry.y, 4);
  for (const t of f.ways) ban(t.x, t.y, 2);
  if (f.pad) ban(f.pad.x, f.pad.y, 2);
  const open = (i) => tiles[i] === TILE_FLOOR && !banned[i];
  const rooms = f.rooms.slice(1).filter((r) => !r.arena && r.cells && r.cells.length > 6);
  if (!rooms.length) return f;
  f.hazKind = kind;
  if (HAZ_CODES[kind]) {
    const code = (f.hazCode = HAZ_CODES[kind]), haz = (f.haz = new Uint8Array(w * f.h));
    // a lumpy blob of it round a tile
    const blob = (cx, cy, rad, mark) => {
      const p1 = rng.f(7), out = [];
      for (let ty = Math.floor(cy - rad - 1); ty <= Math.ceil(cy + rad + 1); ty++)
        for (let tx = Math.floor(cx - rad - 1); tx <= Math.ceil(cx + rad + 1); tx++) {
          const i = ty * w + tx, a = Math.atan2(ty - cy, tx - cx);
          if (tx > 0 && ty > 0 && tx < w - 1 && ty < f.h - 1 && Math.hypot(tx - cx, ty - cy) <= rad * (1 + 0.25 * Math.sin(3 * a + p1)) && open(i) && !haz[i]) { haz[i] = mark; out.push(i); }
        }
      return out;
    };
    if (kind === 'burn') {
      // channels that wander across a cavern, and a pool or two; any that
      // would cut ground off from the entry are taken back
      const keepsAll = () => {
        const steps = floorDistances(tiles, w, f.h, f.entry.x, f.entry.y, haz);
        for (let i = 0; i < tiles.length; i++) if (!TILE_SOLID[tiles[i]] && !haz[i] && steps[i] < 0) return false;
        return true;
      };
      const undo = (cells) => { for (const i of cells) haz[i] = 0; };
      for (let n = rng.i(H.channels[0], H.channels[1]); n > 0; n--) {
        const r = rng.pick(rooms), start = rng.pick(r.cells), cells = [];
        let x = start % w, y = Math.floor(start / w), head = rng.f(Math.PI * 2);
        for (let k = rng.i(H.len[0], H.len[1]); k > 0; k--) {
          const i = y * w + x;
          if (open(i) && !haz[i]) { haz[i] = code; cells.push(i); }
          head += rng.f(-0.7, 0.7);
          const nx = x + Math.round(Math.cos(head)), ny = y + Math.round(Math.sin(head));
          if (TILE_SOLID[floorTile(f, nx, ny)]) { head += Math.PI / 2; continue; }
          x = nx; y = ny;
        }
        if (!keepsAll()) undo(cells);
      }
      for (let n = rng.i(H.pools[0], H.pools[1]); n > 0; n--) {
        const r = rng.pick(rooms), c = rng.pick(r.cells), cells = blob(c % w, Math.floor(c / w), rng.f(1, 1.7), code);
        if (!keepsAll()) undo(cells);
      }
    } else {
      for (let n = rng.i(H.blobs[0], H.blobs[1]); n > 0; n--) {
        const r = rng.pick(rooms), c = rng.pick(r.cells);
        blob(c % w, Math.floor(c / w), rng.f(H.r[0], H.r[1]), code);
      }
    }
    return f;
  }
  // vents and pods: out in the open (never in a passage), a few tiles apart
  const pts = (f.hazPts = []);
  const cand = [];
  for (const r of rooms) for (const i of r.cells) {
    if (!open(i)) continue;
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (tiles[i + dy * w + dx] === TILE_FLOOR) n++;
    if (n === 9) cand.push(i);
  }
  for (let n = rng.i(H.n[0], H.n[1]), tries = 0; pts.length < n && cand.length && tries < 200; tries++) {
    const i = rng.pick(cand), x = i % w, y = Math.floor(i / w);
    if (pts.some((p) => Math.abs(p.x - x) + Math.abs(p.y - y) < 5)) continue;
    pts.push({ x, y, ph: rng.f(1) });
  }
  return f;
}

// The hazard's code at world pixel x, y (0 for none), along a smooth edge
// like the walls'.
function hazardAt(f, x, y) {
  const H = f.haz;
  if (!H) return 0;
  const gx = x / TILE - 0.5, gy = y / TILE - 0.5, tx = Math.floor(gx), ty = Math.floor(gy), u = gx - tx, v = gy - ty;
  const s = (i, j) => (i < 0 || j < 0 || i >= f.w || j >= f.h || !H[j * f.w + i] ? 0 : 1);
  const a = s(tx, ty), b = s(tx + 1, ty), c = s(tx, ty + 1), d = s(tx + 1, ty + 1);
  if (a === b && b === c && c === d) return a ? f.hazCode : 0;
  return lerp(lerp(a, b, u), lerp(c, d, u), v) + 0.16 * wallNoise(x + 131, y + 57, 5) > 0.5 ? f.hazCode : 0;
}

// Steps on foot from x, y to every open tile (-1 where it can't be reached).
// avoid: tiles not to step on (non-zero), if any.
function floorDistances(tiles, w, h, x, y, avoid) {
  const d = new Int16Array(w * h).fill(-1), q = [y * w + x];
  d[q[0]] = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi], cx = i % w, cy = (i - cx) / w;
    for (const [dx, dy] of DIRS4) {
      const j = (cy + dy) * w + cx + dx;
      if (d[j] < 0 && !TILE_SOLID[tiles[j]] && !(avoid && avoid[j])) { d[j] = d[i] + 1; q.push(j); }
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
  if (f.haz) for (let i = 0; i < f.haz.length; i++) if (f.haz[i]) h = hashInts(h, i, f.haz[i]);
  for (const p of f.hazPts || []) h = hashInts(h, p.x, p.y);
  return h;
}

// ---------------------------------------------------------------------------
// The outpost: the middle of the world, a cleared site on open ground where
// the seed-star was planted, its Charter modules round the cradle in the
// middle (each station is { id, x, y } in tiles, the same on every world).
// Round its edge the land rises in rock, broken by an opening towards each
// neighbour (worldExitSpots, as a territory's), and the cleared ground
// grades into each neighbour's clime over the last stretch to it (f.meld:
// for each tile, whose side it's on and how far into that land; painted in
// hub.js). Built from the world's seed, so it's the same every visit.
// ---------------------------------------------------------------------------
const HUB_STATIONS = [
  { id: 'altar', x: 20, y: 21 },
  { id: 'setout', x: 14, y: 18 }, { id: 'locker', x: 26, y: 18 },
  { id: 'forge', x: 14, y: 24 }, { id: 'runes', x: 26, y: 24 },
  { id: 'wreck', x: 20, y: 27 },
  { id: 'dummy', x: 25, y: 28 },
];
// The cradle the star hangs over (tiles: its middle on the ground).
const OUTPOST_CRADLE = { x: 20.5, y: 17.4 };
function outpostFloor(worldSeed) {
  const S = T.outpost, w = S.size, h = S.size, N = w * h, L = worldLayout(worldSeed), home = L.terrs[0];
  const seed = hashInts(worldSeed, 0x0e7f05) >>> 0, rng = new Rng(seed);
  const tiles = new Uint8Array(N).fill(TILE_FLOOR), exits = worldExitSpots(L, home, w, h);
  const edgeOf = (x, y) => Math.min(x, y, w - 1 - x, h - 1 - y);
  // the rock round the edge, deeper here and shallower there
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const deep = S.rim[0] + (S.rim[1] - S.rim[0]) * worldNoise(x / 4.5, y / 4.5, seed);
      if (edgeOf(x, y) + 0.5 < deep) tiles[y * w + x] = TILE_ROCK;
    }
  // a few outcrops of the land beyond in the stretch that melds into it,
  // clear of the ways in from the openings and of the plaza
  const c = (w - 1) / 2, clearOf = (x, y, r) => exits.every((e) => {
    // (distance from the line from the opening to the middle)
    const vx = c - e.x, vy = c - e.y, t = clamp(((x - e.x) * vx + (y - e.y) * vy) / (vx * vx + vy * vy), 0, 1);
    return Math.hypot(x - e.x - vx * t, y - e.y - vy * t) > r + 2.6;
  });
  for (let n = rng.i(S.outcrops[0], S.outcrops[1]), tries = 0; n > 0 && tries < 200; tries++) {
    const x = rng.f(4, w - 5), y = rng.f(4, h - 5), r = rng.f(1.1, 2.3), e = edgeOf(x, y);
    if (e < S.rim[1] + 1.5 || e > S.meld.from - 4 || !clearOf(x, y, r)) continue;
    const p1 = rng.f(6.3), p2 = rng.f(6.3);
    for (let ty = Math.floor(y - r - 1); ty <= Math.ceil(y + r + 1); ty++)
      for (let tx = Math.floor(x - r - 1); tx <= Math.ceil(x + r + 1); tx++) {
        const a = Math.atan2(ty - y, tx - x), rr = r * (1 + 0.22 * Math.sin(3 * a + p1) + 0.12 * Math.sin(5 * a + p2));
        if (Math.hypot(tx - x, (ty - y) * 1.2) <= rr) tiles[ty * w + tx] = TILE_ROCK;
      }
    n--;
  }
  // each opening's way out through the rock
  for (const e of exits)
    for (let k = -1; k <= S.rim[1] + 3; k++) {
      const mx = e.x + e.nx * k, my = e.y + e.ny * k, R = S.passage + Math.max(0, k - S.rim[1]) * 0.4;
      for (let ty = Math.floor(my - R); ty <= Math.ceil(my + R); ty++)
        for (let tx = Math.floor(mx - R); tx <= Math.ceil(mx + R); tx++)
          if (tx > 0 && ty > 0 && tx < w - 1 && ty < h - 1 && Math.hypot(tx - mx, ty - my) <= R) tiles[ty * w + tx] = TILE_FLOOR;
    }
  for (let x = 0; x < w; x++) { tiles[x] = TILE_EDGE; tiles[(h - 1) * w + x] = TILE_EDGE; }
  for (let y = 0; y < h; y++) { tiles[y * w] = TILE_EDGE; tiles[y * w + w - 1] = TILE_EDGE; }
  // the meld: each tile's side (the opening nearest round the middle) and
  // how far into that land it is (0 cleared, 1 all of it)
  const sec = new Int8Array(N).fill(-1), wt = new Float32Array(N), M = S.meld;
  const angs = exits.map((e) => Math.atan2(e.y - c, e.x - c));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!exits.length) break;
      const a = Math.atan2(y - c, x - c);
      let best = 0, bd = 9;
      angs.forEach((b, k) => { const dd = Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))); if (dd < bd) { bd = dd; best = k; } });
      const e = edgeOf(x, y), t = clamp((M.from - e) / (M.from - M.to), 0, 1);
      sec[y * w + x] = best; wt[y * w + x] = t * t * (3 - 2 * t);
    }
  const entry = { x: 20, y: 23 };
  return {
    seed, depth: 0, biome: 0, hub: true, zone: 'surface', w, h, tiles, ore: new Uint8Array(N), rooms: [], entry, portal: null, pad: null, ways: [],
    exits, meld: { sec, wt, to: exits.map((e) => e.to) }, site: outpostSite(exits),
  };
}
// How far tile point (gx, gy) is from the segment a-b, and how far along
// it (tiles).
function outpostSegDist(gx, gy, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay, t = clamp(((gx - ax) * vx + (gy - ay) * vy) / (vx * vx + vy * vy || 1), 0, 1);
  return [Math.hypot(gx - ax - vx * t, gy - ay - vy * t), t * Math.hypot(vx, vy)];
}
// The plaza's plan (tiles): the plated ring round the cradle, a slab under
// each module, walkways of plates from the ring to each, the landing pads
// round the plaza where they're furthest from the ways out (in the order
// the landers come down: the nearest the front first), and a marked path
// from the ring out to each opening.
const OUTPOST_MIDDLE = { x: 20, y: 21.6 };
function outpostSite(exits) {
  const C = OUTPOST_MIDDLE, P = T.outpost.pads, ang = exits.map((e) => Math.atan2(e.y - C.y, e.x - C.x)), cr = OUTPOST_CRADLE;
  const off = (a) => Math.min(9, ...ang.map((b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))));
  const cand = [];
  for (let k = 0; k < 12; k++) { const a = (k + 0.5) / 12 * Math.PI * 2; cand.push({ a, s: off(a) }); }
  cand.sort((p, q) => q.s - p.s || Math.sin(q.a) - Math.sin(p.a));
  const pads = cand.slice(0, P.n).map(({ a }) => ({ x: C.x + Math.cos(a) * P.r, y: C.y + Math.sin(a) * P.r * 0.92 })).sort((p, q) => q.y - p.y || p.x - q.x);
  const ring = { x: cr.x, y: cr.y + 0.3, r: 3.4 };
  const slabs = HUB_STATIONS.map((s) => ({ id: s.id, x: s.x + 0.5, y: s.y + 0.75, rx: s.id === 'wreck' ? 2 : s.id === 'forge' ? 2.3 : 1.6, ry: s.id === 'wreck' ? 1.3 : 1.1 }));
  const walks = slabs.filter((b) => b.id !== 'dummy' && b.id !== 'altar').map((b) => ({ ax: ring.x, ay: ring.y, bx: b.x, by: b.y }));
  const paths = exits.map((e) => {
    const vx = e.x - ring.x, vy = e.y - ring.y, m = Math.hypot(vx, vy);
    return { ax: ring.x + (vx / m) * ring.r, ay: ring.y + (vy / m) * ring.r * 0.72, bx: e.x + e.nx * 0.5, by: e.y + e.ny * 0.5, to: e.to };
  });
  // the Kindler's own habitat pod by the plaza, and a pod beside each pad
  // (whichever side is further from the paths), clear of the rock
  const away = (x, y) => Math.min(9, ...paths.map((p) => outpostSegDist(x, y, p.ax, p.ay, p.bx, p.by)[0]));
  const home = [[27.4, 13.4], [13.6, 13.4], [28.2, 30.2], [12.8, 30.2]].map(([x, y]) => ({ x, y, s: away(x, y) })).sort((p, q) => q.s - p.s)[0];
  const S = T.outpost.size, inside = (x, y) => Math.min(x, y, S - 1 - x, S - 1 - y) > T.outpost.rim[1] + 1.5;
  for (const p of pads) {
    const a = Math.atan2(p.y - C.y, p.x - C.x), opts = [-1, 1].map((sd) => ({ x: p.x - Math.sin(a) * sd * 4.4, y: p.y + Math.cos(a) * sd * 3.4 + 0.6 })).filter((o) => inside(o.x, o.y));
    const room = (o) => Math.min(away(o.x, o.y), ...pads.filter((q) => q !== p).map((q) => Math.hypot(o.x - q.x, (o.y - q.y) / 0.72) - 3.6));
    p.pod = opts.sort((u, v) => room(v) - room(u))[0] || { x: p.x, y: p.y - 3 };
  }
  return { ring, slabs, walks, pads, paths, home: { x: home.x, y: home.y } };
}
