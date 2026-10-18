'use strict';
// ---------------------------------------------------------------------------
// The game's state and the dive: starting one in a biome, each floor,
// walking, fighting, mining, picking things up, going down the shaft, and
// leaving by a lodeline, by dying, or by giving up. Everything here runs
// inside Game.step, one fixed 1/60 s step at a time. The prospector runs on
// real time; the world runs on dt × Game.timeScale.
//
// What the prospector wears is safe whatever happens; what's in the cargo
// (ore, exotics, gear, relics) is banked only by a lodeline. Nothing about a
// dive is saved until it ends, so closing the page mid-dive loses the haul.
// ---------------------------------------------------------------------------

const Game = {
  ready: false,
  scene: 'base', // 'base' | 'dive'
  modal: null, // the id of the screen that's open; the simulation stops while one is
  t: 0, realT: 0, timeScale: 1,
  dive: null,
  step: null, render: null,
};

// How deep the Lodestar's lines are sure to reach: deeper as it grows.
function lodelineReach() { return T.floor.padSure + magnitudeOf(Save.data.star) - 1; }

function startDive(biome = 0) {
  Save.data.dives++;
  // the dive's seed may come from anywhere; everything built from it is seeded
  const seed = (Math.random() * 4294967296) >>> 0;
  const stats = computeStats(Save.data.equip, Save.data.attune);
  Game.dive = {
    seed, biome, depth: 0, floor: null, target: null, time: 0, kills: 0, dying: 0,
    rng: new Rng(hashInts(seed, 0x5eed)), stats, reach: lodelineReach(),
    cargo: {}, items: [], enemies: [], shots: [], bolts: [], drops: [], fx: [], flow: null, flowAt: -1,
    p: {
      x: 0, y: 0, fx: 0, fy: 1, walkT: 0, mine: null,
      hp: stats.maxHp, charge: stats.maxCharge, ward: 0, wardT: 0, invuln: 0, hurtT: 0, restT: 0, lowCharge: 0,
      hands: { main: { cd: 0, hits: 0 }, off: { cd: 0, hits: 0 } },
    },
  };
  Game.scene = 'dive';
  enterFloor(1);
}

function enterFloor(depth) {
  const d = Game.dive, p = d.p;
  d.depth = depth;
  d.floor = generateFloor(d.seed, depth, d.biome, d.reach);
  const e = d.floor.entry;
  p.x = (e.x + 0.5) * TILE; p.y = (e.y + 0.5) * TILE; p.mine = null;
  d.target = null; d.shots = []; d.bolts = []; d.drops = []; d.fx = []; d.flowAt = -1;
  spawnEnemies(d);
  if (d.floor.pad) UI.tip('lodeline', "The gold beam is a lodeline: it takes you home");
  UI.toast(`${T.biomes[d.biome].name}, depth ${depth}${d.floor.pad ? '' : ': no lodeline reaches this deep'}`);
}

// The outfit changed mid-dive.
function refreshDiveStats() {
  const d = Game.dive;
  d.stats = computeStats(Save.data.equip, Save.data.attune);
  d.p.hp = Math.min(d.p.hp, d.stats.maxHp);
  d.p.charge = Math.min(d.p.charge, d.stats.maxCharge);
}

function updateDive(dtReal, dt) {
  const d = Game.dive, p = d.p, st = d.stats;
  d.time += dtReal;
  if (d.dying > 0) {
    d.dying -= dtReal;
    updateCombatFx(dt);
    if (d.dying <= 0) loseDive(true);
    return;
  }
  p.invuln = Math.max(0, p.invuln - dtReal);
  p.hurtT = Math.max(0, p.hurtT - dtReal);
  p.lowCharge = Math.max(0, p.lowCharge - dtReal);
  if (p.wardT > 0 && (p.wardT -= dtReal) <= 0) p.ward = 0;
  p.restT += dtReal;
  const rest = p.restT > T.player.restAfter ? T.player.restRegen : 0;
  p.hp = Math.min(st.maxHp, p.hp + (st.regen + rest) * dtReal);
  p.charge = Math.min(st.maxCharge, p.charge + T.player.chargeRegen * (1 + st.chargeRegen / 100) * dtReal);
  for (const k in p.hands) p.hands[k].cd = Math.max(0, p.hands[k].cd - dtReal);

  const mv = Input.move, m = Math.hypot(mv.x, mv.y);
  if (m > 0.05) {
    const sp = T.player.speed * (1 + st.moveSpeed / 100) * Math.min(1, m) * dtReal;
    moveBody(d.floor, p, (mv.x / m) * sp, (mv.y / m) * sp, T.player.radius);
    p.fx = mv.x / m; p.fy = mv.y / m;
    p.walkT += dtReal;
  } else p.walkT = 0;
  // holding a hand's button keeps swinging or casting
  if (Input.handHeld('main')) useHand('main');
  if (Input.handHeld('off')) useHand('off');
  updateMining(dtReal);
  updateEnemies(dt);
  updateBolts(dt);
  updateCombatFx(dt);
  updatePickups(dtReal);
  if (Input.consumeAct()) {
    const a = actionHere();
    if (a === 'descend') enterFloor(d.depth + 1);
    else if (a === 'extract') extractDive();
  }
}

function startDying() {
  const d = Game.dive;
  d.dying = 1.4;
  d.p.mine = null;
  d.fx.push({ kind: 'death', x: d.p.x, y: d.p.y - 6, t: 1.4, max: 1.4 });
}

// What the contextual button does where the prospector stands.
function actionHere() {
  const d = Game.dive;
  if (!d || d.dying) return null;
  const t = floorTile(d.floor, Math.floor(d.p.x / TILE), Math.floor(d.p.y / TILE));
  return t === TILE_SHAFT ? 'descend' : t === TILE_PAD ? 'extract' : null;
}

// ---------------------------------------------------------------------------
// Walking: a circle against the tile grid, one axis at a time. Enemies use
// it too.
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
  const d = Game.dive, p = d.p, f = d.floor, pick = Save.data.equip.pick;
  const tgt = (d.target = mineTarget(f, p));
  if (tgt && !Input.mining()) UI.tip('mine', 'Hold MINE to break the ore');
  if (!tgt || !Input.mining()) { p.mine = null; return; }
  const o = T.ores[f.ore[tgt.i] - 1];
  // a refusal is said once per swing at a tile, not every step
  const refuse = (why, msg) => { if (!p.mine || p.mine.i !== tgt.i || p.mine.refused !== why) { p.mine = { i: tgt.i, prog: 0, hitT: 0, refused: why }; UI.toast(msg); } };
  if (!pick) return refuse('nopick', 'You need a pick');
  if (o.tier > pick.base.power) return refuse('weak', `Your pick can't break ${o.name}`);
  if (cargoUsed(d) >= d.stats.cargo) { UI.tip('full', 'Full: find a lodeline to bank it'); return refuse('full', 'Cargo full'); }
  if (!p.mine || p.mine.i !== tgt.i || p.mine.refused) p.mine = { i: tgt.i, prog: 0, hitT: 0 };
  p.mine.prog += (dt * T.mine.speed * pick.base.speed * (1 + d.stats.mineSpeed / 100)) / o.hardness;
  p.mine.hitT -= dt;
  if (p.mine.hitT <= 0) {
    p.mine.hitT = T.mine.hitEvery;
    spawnSparks((tgt.tx + 0.5) * TILE, (tgt.ty + 0.5) * TILE, [ART.ores[o.id][3], '#ffffff'], 4);
    buzz(6);
  }
  if (p.mine.prog >= 1) breakOre(tgt, o);
}

function breakOre(tgt, o) {
  const d = Game.dive, f = d.floor, st = d.stats;
  f.tiles[tgt.i] = TILE_FLOOR;
  f.ore[tgt.i] = 0;
  let n = d.rng.i(T.mine.yield[0], T.mine.yield[1]);
  if (d.rng.f(100) < st.oreLuck) n *= 2;
  n = Math.min(st.cargo - cargoUsed(d), n);
  d.cargo[o.id] = (d.cargo[o.id] || 0) + n;
  d.p.mine = null;
  repaintAround(f, tgt.tx, tgt.ty);
  const cx = (tgt.tx + 0.5) * TILE, cy = (tgt.ty + 0.5) * TILE;
  spawnSparks(cx, cy, ART.ores[o.id].slice(2), 12);
  if (st.regalia3) healPlayer(3);
  if (st.powers.seismic) {
    d.fx.push({ kind: 'nova', x: cx, y: cy, r: 40, t: 0.3, max: 0.3 });
    for (const e of d.enemies) if (!e.dead && dist(e.x, e.y, cx, cy) < 40) hurtEnemy(e, 20 * tierScale(Save.data.equip.pick.tier), { noProc: true });
  }
  UI.toast(`+${n} ${o.name}`);
  buzz(20);
}

// ---------------------------------------------------------------------------
// Leaving
// ---------------------------------------------------------------------------
function noteDeepest(d) {
  const id = T.biomes[d.biome].id, deep = Save.data.deepest;
  deep[id] = Math.max(deep[id] || 0, d.depth);
}

function extractDive() {
  const d = Game.dive, s = Save.data.stash;
  for (const k in d.cargo) s[k] = (s[k] || 0) + d.cargo[k];
  Save.data.items.push(...d.items);
  noteDeepest(d);
  Save.save();
  Game.dive = null;
  Game.scene = 'base';
  UI.openBase({ banked: d.cargo, items: d.items, depth: d.depth, biome: d.biome });
}

// Dying, or giving up: the cargo is lost, what's worn is kept.
function loseDive(died) {
  const d = Game.dive;
  noteDeepest(d);
  Save.save();
  Game.dive = null;
  Game.scene = 'base';
  UI.openBase({ lost: d.cargo, items: d.items, depth: d.depth, biome: d.biome, died });
}

function abandonDive() { loseDive(false); }
