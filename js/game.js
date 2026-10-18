'use strict';
// ---------------------------------------------------------------------------
// The game's state and the dive: starting one, walking, mining, going down
// the shaft, and leaving by a lodeline or giving up. Everything here runs
// inside Game.step, one fixed 1/60 s step at a time. The prospector runs on
// real time; the world (once it has enemies) runs on dt * Game.timeScale.
// ---------------------------------------------------------------------------

const Game = {
  ready: false,
  scene: 'base', // 'base' | 'dive'
  modal: null, // the id of the screen that's open; the simulation stops while one is
  t: 0, realT: 0, timeScale: 1,
  dive: null,
  step: null, render: null,
};

function startDive() {
  Save.data.dives++;
  Save.save();
  // the dive's seed may come from anywhere; everything built from it is seeded
  const seed = (Math.random() * 4294967296) >>> 0;
  Game.dive = { seed, biome: 0, depth: 0, floor: null, p: null, target: null, cargo: {}, cargoUsed: 0, time: 0, rng: new Rng(hashInts(seed, 0x5eed)) };
  Game.scene = 'dive';
  enterFloor(1);
}

function enterFloor(depth) {
  const d = Game.dive;
  d.depth = depth;
  d.floor = generateFloor(d.seed, depth, d.biome);
  const e = d.floor.entry;
  d.p = { x: (e.x + 0.5) * TILE, y: (e.y + 0.5) * TILE, fx: 0, fy: 1, walkT: 0, mine: null };
  d.target = null;
  if (depth > Save.data.deepest) { Save.data.deepest = depth; Save.save(); }
}

function updateDive(dtReal) {
  const d = Game.dive, p = d.p;
  d.time += dtReal;
  const mv = Input.move, m = Math.hypot(mv.x, mv.y);
  if (m > 0.05) {
    const sp = T.player.speed * Math.min(1, m) * dtReal;
    moveBody(d.floor, p, (mv.x / m) * sp, (mv.y / m) * sp, T.player.radius);
    p.fx = mv.x / m; p.fy = mv.y / m;
    p.walkT += dtReal;
  } else p.walkT = 0;
  updateMining(dtReal);
  if (Input.consumeAct()) {
    const a = actionHere();
    if (a === 'descend') enterFloor(d.depth + 1);
    else if (a === 'extract') extractDive();
  }
}

// What the contextual button does where the prospector stands.
function actionHere() {
  const d = Game.dive;
  if (!d) return null;
  const t = floorTile(d.floor, Math.floor(d.p.x / TILE), Math.floor(d.p.y / TILE));
  return t === TILE_SHAFT ? 'descend' : t === TILE_PAD ? 'extract' : null;
}

// ---------------------------------------------------------------------------
// Walking: a circle against the tile grid, one axis at a time.
// ---------------------------------------------------------------------------
function bodyHits(f, x, y, r) {
  const x0 = Math.floor((x - r) / TILE), x1 = Math.floor((x + r) / TILE);
  const y0 = Math.floor((y - r) / TILE), y1 = Math.floor((y + r) / TILE);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (TILE_SOLID[floorTile(f, tx, ty)]) return true;
  return false;
}

function moveBody(f, b, dx, dy, r) {
  if (dx) {
    if (!bodyHits(f, b.x + dx, b.y, r)) b.x += dx;
    else {
      b.x = dx > 0 ? Math.max(b.x, Math.floor((b.x + dx + r) / TILE) * TILE - r - 0.01) : Math.min(b.x, (Math.floor((b.x + dx - r) / TILE) + 1) * TILE + r + 0.01);
      // blocked, but the gap is just above or below: slide towards it, so a
      // thumb a few pixels off still finds the corridor
      const cy = (Math.floor(b.y / TILE) + 0.5) * TILE;
      if (Math.abs(dy) < Math.abs(dx) && !bodyHits(f, b.x + dx, cy, r)) b.y = approach(b.y, cy, Math.abs(dx));
    }
  }
  if (dy) {
    if (!bodyHits(f, b.x, b.y + dy, r)) b.y += dy;
    else {
      b.y = dy > 0 ? Math.max(b.y, Math.floor((b.y + dy + r) / TILE) * TILE - r - 0.01) : Math.min(b.y, (Math.floor((b.y + dy - r) / TILE) + 1) * TILE + r + 0.01);
      const cx = (Math.floor(b.x / TILE) + 0.5) * TILE;
      if (Math.abs(dx) < Math.abs(dy) && !bodyHits(f, cx, b.y + dy, r)) b.x = approach(b.x, cx, Math.abs(dy));
    }
  }
}

// ---------------------------------------------------------------------------
// Mining
// ---------------------------------------------------------------------------

// The ore tile in reach nearest a point just ahead of the prospector.
function mineTarget(f, p) {
  const ax = p.x + p.fx * T.mine.ahead, ay = p.y + p.fy * T.mine.ahead;
  const tx0 = Math.floor(p.x / TILE), ty0 = Math.floor(p.y / TILE);
  let best = null, bd = Infinity;
  for (let ty = ty0 - 1; ty <= ty0 + 1; ty++)
    for (let tx = tx0 - 1; tx <= tx0 + 1; tx++) {
      if (floorTile(f, tx, ty) !== TILE_ORE) continue;
      const nx = clamp(p.x, tx * TILE, tx * TILE + TILE), ny = clamp(p.y, ty * TILE, ty * TILE + TILE);
      if (dist(p.x, p.y, nx, ny) > T.mine.reach) continue;
      const dd = dist2(ax, ay, (tx + 0.5) * TILE, (ty + 0.5) * TILE);
      if (dd < bd) { bd = dd; best = { tx, ty, i: ty * f.w + tx }; }
    }
  return best;
}

function updateMining(dt) {
  const d = Game.dive, p = d.p, f = d.floor;
  const tgt = (d.target = mineTarget(f, p));
  if (!tgt || !Input.mining()) { p.mine = null; return; }
  const o = T.ores[f.ore[tgt.i] - 1];
  // a refusal is said once per swing at a tile, not every step
  const refuse = (why, msg) => { if (!p.mine || p.mine.i !== tgt.i || p.mine.refused !== why) { p.mine = { i: tgt.i, prog: 0, hitT: 0, refused: why }; UI.toast(msg); } };
  if (o.tier > Save.data.pickTier) return refuse('weak', `Your pick can't break ${o.name}`);
  if (d.cargoUsed >= T.cargo.capacity) return refuse('full', 'Cargo full');
  if (!p.mine || p.mine.i !== tgt.i || p.mine.refused) p.mine = { i: tgt.i, prog: 0, hitT: 0 };
  p.mine.prog += (dt * T.mine.speed) / o.hardness;
  p.mine.hitT -= dt;
  if (p.mine.hitT <= 0) {
    p.mine.hitT = T.mine.hitEvery;
    spawnSparks((tgt.tx + 0.5) * TILE, (tgt.ty + 0.5) * TILE, o.glint, 4);
    buzz(6);
  }
  if (p.mine.prog >= 1) breakOre(tgt, o);
}

function breakOre(tgt, o) {
  const d = Game.dive, f = d.floor;
  f.tiles[tgt.i] = TILE_FLOOR;
  f.ore[tgt.i] = 0;
  const n = Math.min(T.cargo.capacity - d.cargoUsed, d.rng.i(T.mine.yield[0], T.mine.yield[1]));
  d.cargo[o.id] = (d.cargo[o.id] || 0) + n;
  d.cargoUsed += n;
  d.p.mine = null;
  // the tile above may now show a front face, and the one below loses its shadow
  for (let ty = tgt.ty - 1; ty <= tgt.ty + 1; ty++) repaintTile(f, tgt.tx, ty);
  spawnSparks((tgt.tx + 0.5) * TILE, (tgt.ty + 0.5) * TILE, o.color, 12);
  UI.toast(`+${n} ${o.name}`);
  buzz(20);
}

// ---------------------------------------------------------------------------
// Leaving
// ---------------------------------------------------------------------------
function extractDive() {
  const d = Game.dive, s = Save.data.stash;
  for (const k in d.cargo) s[k] = (s[k] || 0) + d.cargo[k];
  Save.save();
  Game.dive = null;
  Game.scene = 'base';
  UI.openBase({ banked: d.cargo, depth: d.depth });
}

function abandonDive() {
  const d = Game.dive;
  Game.dive = null;
  Game.scene = 'base';
  UI.openBase({ lost: d.cargo, depth: d.depth });
}
