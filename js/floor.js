'use strict';
// ---------------------------------------------------------------------------
// Floor generation. generateFloor(seed, depth, biome) always builds the same
// floor for the same arguments: rooms joined by corridors, ore veins running
// into the walls, the entry, the shaft down and (on most floors) a lodeline
// out. It draws only from its own Rng, never Math.random.
// ---------------------------------------------------------------------------

const TILE_FLOOR = 0, TILE_ROCK = 1, TILE_ORE = 2, TILE_EDGE = 3, TILE_PAD = 4, TILE_SHAFT = 5;
// Indexed by tile type: does it stop a body?
const TILE_SOLID = [false, true, true, true, false, false];

// Where each ore sits in T.ores, by id. A floor's ore array holds index + 1.
const ORE_INDEX = Object.fromEntries(T.ores.map((o, i) => [o.id, i]));

// The tile at tx, ty; outside the floor counts as the unbreakable edge.
function floorTile(f, tx, ty) {
  return tx < 0 || ty < 0 || tx >= f.w || ty >= f.h ? TILE_EDGE : f.tiles[ty * f.w + tx];
}

function generateFloor(seed, depth, biome) {
  const F = T.floor, B = T.biomes[biome];
  const rng = new Rng(hashInts(seed, depth, biome, 0x10de));
  const w = F.w, h = F.h;
  const tiles = new Uint8Array(w * h).fill(TILE_ROCK), ore = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) { tiles[x] = TILE_EDGE; tiles[(h - 1) * w + x] = TILE_EDGE; }
  for (let y = 0; y < h; y++) { tiles[y * w] = TILE_EDGE; tiles[y * w + w - 1] = TILE_EDGE; }
  const dig = (x, y) => { if (tiles[y * w + x] === TILE_ROCK) tiles[y * w + x] = TILE_FLOOR; };

  // rooms, kept two tiles apart so every room has its own walls
  const rooms = [];
  const want = rng.i(F.rooms[0], F.rooms[1]);
  for (let tries = 0; tries < 400 && rooms.length < want; tries++) {
    const rw = rng.i(F.roomW[0], F.roomW[1]), rh = rng.i(F.roomH[0], F.roomH[1]);
    const x = rng.i(2, w - rw - 3), y = rng.i(2, h - rh - 3);
    if (rooms.some((r) => x < r.x + r.w + 2 && x + rw + 2 > r.x && y < r.y + r.h + 2 && y + rh + 2 > r.y)) continue;
    rooms.push({ x, y, w: rw, h: rh, cx: x + (rw >> 1), cy: y + (rh >> 1) });
  }
  for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) dig(x, y);

  // corridors: each room to the nearest one before it, then a few loops
  const line = (x0, y0, x1, y1) => {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) dig(x, y);
  };
  // an L: along one axis to the corner, then along the other
  const corridor = (a, b) => {
    const [mx, my] = rng.chance(0.5) ? [b.cx, a.cy] : [a.cx, b.cy];
    line(a.cx, a.cy, mx, my);
    line(mx, my, b.cx, b.cy);
  };
  for (let i = 1; i < rooms.length; i++) {
    let best = 0, bd = Infinity;
    for (let j = 0; j < i; j++) {
      const dd = dist2(rooms[i].cx, rooms[i].cy, rooms[j].cx, rooms[j].cy);
      if (dd < bd) { bd = dd; best = j; }
    }
    corridor(rooms[i], rooms[best]);
  }
  const loops = rng.i(F.loops[0], F.loops[1]);
  for (let n = 0; n < loops && rooms.length > 2; n++) {
    const a = rng.i(0, rooms.length - 1), b = rng.i(0, rooms.length - 1);
    if (a !== b) corridor(rooms[a], rooms[b]);
  }

  // the entry is the first room; the shaft is in the room furthest from it
  // on foot, and the lodeline (when the star reaches this deep) in another
  const steps = floorDistances(tiles, w, h, rooms[0].cx, rooms[0].cy);
  const far = rooms.slice(1).map((r) => [steps[r.cy * w + r.cx], r]).sort((a, b) => b[0] - a[0]);
  const shaftRoom = far[0][1];
  tiles[shaftRoom.cy * w + shaftRoom.cx] = TILE_SHAFT;
  let pad = null;
  const reach = depth <= F.padSure ? 1 : Math.max(F.padMin, 1 - (depth - F.padSure) * F.padFade);
  if (far.length > 1 && rng.chance(reach)) {
    const r = far[rng.i(1, Math.min(far.length - 1, 2))][1];
    pad = { x: r.cx, y: r.cy };
    tiles[r.cy * w + r.cx] = TILE_PAD;
  }

  // ore veins: each starts in a wall beside a room and wanders into the rock
  const deep = Math.min(T.oreDeep.max, T.oreDeep.base + T.oreDeep.perFloor * (depth - 1));
  for (const r of rooms.slice(1)) {
    const veins = rng.i(F.veins[0], F.veins[1]);
    for (let n = 0; n < veins; n++) {
      const side = rng.i(0, 3);
      let x = side === 0 ? r.x - 1 : side === 1 ? r.x + r.w : rng.i(r.x, r.x + r.w - 1);
      let y = side === 2 ? r.y - 1 : side === 3 ? r.y + r.h : rng.i(r.y, r.y + r.h - 1);
      if (tiles[y * w + x] !== TILE_ROCK) continue;
      const kind = ORE_INDEX[B.ores[rng.chance(deep) ? 1 : 0]] + 1;
      const len = rng.i(F.veinLen[0], F.veinLen[1]);
      for (let k = 0; k < len; k++) {
        tiles[y * w + x] = TILE_ORE; ore[y * w + x] = kind;
        const next = DIRS4.map(([dx, dy]) => [x + dx, y + dy]).filter(([nx, ny]) => tiles[ny * w + nx] === TILE_ROCK);
        if (!next.length) break;
        [x, y] = rng.pick(next);
      }
    }
  }

  return { seed, depth, biome, w, h, tiles, ore, rooms, entry: { x: rooms[0].cx, y: rooms[0].cy }, shaft: { x: shaftRoom.cx, y: shaftRoom.cy }, pad };
}

const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

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

// One number for a floor's layout, for the golden tests.
function floorHash(f) {
  let h = hashInts(f.w, f.h, f.entry.x, f.entry.y);
  for (let i = 0; i < f.tiles.length; i++) h = hashInts(h, f.tiles[i] * 16 + f.ore[i]);
  return h;
}
