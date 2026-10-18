'use strict';
// ---------------------------------------------------------------------------
// The game's state and the dive: starting one in a biome, each floor,
// walking, fighting, mining, picking things up, going down the shaft, and
// leaving by a lodeline, by dying, or by giving up. Everything here runs
// inside Game.step, one fixed 1/60 s step at a time. The diver runs on
// real time; the world runs on dt × Game.timeScale.
//
// What the diver wears is safe whatever happens; what's in the cargo
// (ore, exotics, gear, relics) is banked only by a lodeline. Nothing about a
// dive is saved until it ends, so closing the page mid-dive loses the haul.
// ---------------------------------------------------------------------------

const Game = {
  ready: false,
  scene: 'base', // 'base' | 'dive'
  modal: null, // the id of the screen that's open; the simulation stops while one is
  t: 0, realT: 0, timeScale: 1, hitstop: 0,
  dive: null,
  step: null, render: null,
};

// How deep the Lodestar's lines are sure to reach: deeper as it grows.
function lodelineReach() { return T.floor.padSure + magnitudeOf(Save.data.star) - 1; }

// A world to walk in: a dive, or the outpost (hub: true). Both run the
// same walking, fighting and drawing; the outpost has no enemies but a
// practice target, and nothing in it can hurt.
function newWorld(fields) {
  const stats = computeStats(Save.data.equip, Save.data.attune);
  return Object.assign({
    seed: 0, biome: 0, depth: 0, floor: null, target: null, time: 0, kills: 0, dying: 0,
    rng: new Rng(1), stats, reach: lodelineReach(),
    cargo: {}, items: [], blueprints: [], pocket: [], enemies: [], shots: [], bolts: [], drops: [], fx: [], nums: [], globs: [], puddles: [], auras: [], later: [], flow: null, flowAt: -1,
    pull: 1, pullTime: 1, waveT: 0, channel: null, padDark: false,
    p: {
      x: 0, y: 0, fx: 0, fy: 1, walkT: 0, mine: null,
      hp: stats.maxHp, charge: stats.maxCharge, ward: 0, wardT: 0, invuln: 0, hurtT: 0, restT: 0, lowCharge: 0,
      dashT: 0, dashCd: 0, dashX: 0, dashY: 0, swing: null, cast: null,
      hands: { main: newHand(), off: newHand() },
    },
  }, fields);
}

function startDive(biome = 0) {
  Save.data.dives++;
  // the dive's seed may come from anywhere; everything built from it is seeded
  const seed = (Math.random() * 4294967296) >>> 0;
  Game.dive = newWorld({ seed, biome, rng: new Rng(hashInts(seed, 0x5eed)) });
  Game.scene = 'dive';
  enterFloor(1, 'surface');
  Story.say('firstDive');
  if (biome === 1) Story.say('choir');
  if (biome === 2) Story.say('underforge');
}

// Home: the outpost on the sinkhole's rim. report: how the dive ended.
function enterHub(report) {
  const f = makeHubFloor();
  const d = (Game.dive = newWorld({ hub: true, floor: f }));
  d.p.x = (f.entry.x + 0.5) * TILE; d.p.y = (f.entry.y + 0.5) * TILE; d.p.fy = -1;
  d.drone = null;
  const dm = HUB_STATIONS.find((s) => s.id === 'dummy');
  const dummy = makeEnemy('dummy', (dm.x + 0.5) * TILE, (dm.y + 0.5) * TILE, 1, null);
  d.enemies = [dummy];
  Game.scene = 'hub';
  UI.close();
  if (report) UI.openReport(report);
  else if (!Story.intro()) UI.tip('hub', 'Walk to the ledge under the star to descend');
}

function newHand() { return { cd: 0, comboT: 0, buffer: 0, holdT: 0, holding: false, step: 0, hits: 0 }; }

// An expedition's site: `depth` is which (1 to T.expedition.sites), zone
// what kind of place. Each exit's ways lead to zones other than this one; at
// the last exit, one leads to the Keeper's Lair while its shard is still
// there, else to a Deep Vein.
function enterFloor(depth, zone = 'cave') {
  const d = Game.dive, p = d.p, X = T.expedition;
  d.depth = depth; d.zone = zone;
  const rng = new Rng(hashInts(d.seed, depth, 0xa7a7));
  const last = depth >= X.sites || zone === 'lair' || zone === 'deep';
  d.ways = [];
  if (!last) {
    const others = ['surface', 'cave', 'ruin'].filter((z) => z !== zone);
    rng.shuffle(others);
    if (depth === X.sites - 1) d.ways = [(Save.data.shards || []).includes(d.biome) ? 'deep' : 'lair', others[0]];
    else d.ways = others.slice(0, X.ways);
  }
  d.floor = generateFloor(d.seed, depth, d.biome, d.reach, zone, d.ways.length);
  const e = d.floor.entry;
  p.x = (e.x + 0.5) * TILE; p.y = (e.y + 0.5) * TILE; p.mine = null;
  d.target = null; d.shots = []; d.bolts = []; d.drops = []; d.fx = []; d.nums = []; d.globs = []; d.puddles = []; d.auras = []; d.later = []; d.flowAt = -1; d.keeper = null;
  spawnEnemies(d);
  placeFieldForge(d);
  const P = T.pull;
  d.pull = 1; d.pullTime = Math.max(P.min, P.time + P.perDepth * (depth - 1)); d.waveT = P.waveEvery; d.channel = null;
  // a lair's lodeline is dark until its Keeper falls
  d.padDark = zone === 'lair' && !!d.keeper;
  if (d.floor.pad && !d.padDark) UI.tip('lodeline', "The gold beam is a lodeline: it takes you home");
  UI.toast(`${T.biomes[d.biome].name} · ${T.zones[zone].name} · site ${depth} of ${X.sites}${d.floor.pad || zone === 'lair' ? '' : ': no lodeline reaches here'}`);
  if (!d.floor.pad) Story.say('noPad');
}

// Which way on the diver stands at, if any.
function wayHere(d) {
  const tx = Math.floor(d.p.x / TILE), ty = Math.floor(d.p.y / TILE);
  return (d.floor.ways || []).findIndex((w) => w.x === tx && w.y === ty);
}

function placeFieldForge(d) {
  const f = d.floor, rng = new Rng(hashInts(d.seed, d.depth, 0xf0e6));
  d.fieldForge = null;
  if (!rng.chance(T.zones[d.zone].forge || 0)) return;
  const rooms = f.rooms.slice(1).filter((r) => !r.arena && !(f.ways || []).some((w) => roomHas(r, w)) && !(f.pad && roomHas(r, f.pad)) && r.cells.length > 8);
  if (!rooms.length) return;
  const r = rng.pick(rooms), i = rng.pick(r.cells);
  d.fieldForge = { x: i % f.w, y: Math.floor(i / f.w) };
  // whoever worked it left a schematic behind, now and then
  const leave = (thing) => d.drops.push(Object.assign({ x: (d.fieldForge.x + 1.5) * TILE, y: (d.fieldForge.y + 0.5) * TILE, t: 0 }, thing));
  if (rng.chance(T.fieldForge.blueprint)) dropBlueprint(d, leave);
  if (rng.chance(T.story.echoForge)) leave({ echo: true });
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
  if (p.swing && (p.swing.t -= dtReal) <= 0) p.swing = null;
  if (p.cast && (p.cast.t -= dtReal) <= 0) p.cast = null;
  for (const n of d.nums) { n.t -= dtReal; n.y -= 14 * dtReal; }
  d.nums = d.nums.filter((n) => n.t > 0);

  if (!updateDash(dtReal)) {
    const mv = Input.move, m = Math.hypot(mv.x, mv.y);
    if (m > 0.05) {
      // slower mid-swing, so a swing commits
      const sp = T.player.speed * (1 + st.moveSpeed / 100) * Math.min(1, m) * (p.swing ? 0.45 : 1) * dtReal;
      moveBody(d.floor, p, (mv.x / m) * sp, (mv.y / m) * sp, T.player.radius);
      if (!p.swing) { p.fx = mv.x / m; p.fy = mv.y / m; }
      p.walkT += dtReal;
    } else p.walkT = 0;
  }
  updateHands(dtReal);
  updateMining(dtReal);
  if (!d.hub) { updatePull(dt); updateChannel(dtReal); }
  updateEnemies(dt);
  updateBolts(dt);
  updateAuras(dt);
  updateCombatFx(dt);
  updatePickups(dtReal);
  if (Input.consumeAct()) {
    const a = actionHere();
    if (d.hub) { if (a) UI.useStation(a); }
    else if (a === 'way') { const i = wayHere(d); enterFloor(d.depth + 1, d.ways[i]); }
    else if (a === 'extract') startChannel('extract');
    else if (a === 'forge') UI.useStation('fieldForge');
  }
}

function startDying() {
  const d = Game.dive;
  d.dying = 1.4;
  d.p.mine = null;
  d.fx.push({ kind: 'death', x: d.p.x, y: d.p.y - 6, t: 1.4, max: 1.4 });
}

// What the contextual button does where the diver stands: a station in
// the outpost; in a dive, the shaft, a lodeline or an ancient forge.
function actionHere() {
  const d = Game.dive;
  if (!d || d.dying) return null;
  const near = (tx, ty, r) => dist(d.p.x, d.p.y, (tx + 0.5) * TILE, (ty + 0.5) * TILE) < r;
  if (d.hub) { const s = HUB_STATIONS.find((s) => s.id !== 'dummy' && near(s.x, s.y, s.id === 'wreck' ? 30 : 20)); return s ? s.id : null; }
  if (d.fieldForge && near(d.fieldForge.x, d.fieldForge.y, 20)) return 'forge';
  const t = floorTile(d.floor, Math.floor(d.p.x / TILE), Math.floor(d.p.y / TILE));
  if (t === TILE_SHAFT && wayHere(d) >= 0) return 'way';
  return t === TILE_PAD && !d.padDark && !d.channel ? 'extract' : null;
}

// ---------------------------------------------------------------------------
// The star's pull on a floor, fading
// ---------------------------------------------------------------------------
function updatePull(dt) {
  const d = Game.dive, P = T.pull;
  if (d.pull <= 0) return;
  const was = d.pull;
  d.pull = Math.max(0, d.pull - (dt / d.pullTime) * (1 - d.stats.pullSlow / 100));
  if (was > P.dimAt && d.pull <= P.dimAt) { UI.toast("The star's pull is fading", 'legendary'); Story.say('pullFading'); }
  if (d.pull <= P.dimAt && (d.waveT -= dt) <= 0) { d.waveT = P.waveEvery; stirTheDark(d, P.wave); }
  if (d.pull <= 0) {
    // the lodeline goes dark, and the Hollow comes
    d.padDark = true;
    if (d.channel && d.channel.kind === 'extract') breakChannel('The lodeline went dark');
    UI.toast('The lodeline has gone dark. Something is coming.', 'legendary');
    const at = darkSpot(d);
    if (at) { const h = makeEnemy('hollow', at.x, at.y, floorLevel(d), null); h.aggro = true; d.enemies.push(h); }
  }
}

// Somewhere out of sight but on foot from the diver.
function darkSpot(d) {
  const f = d.floor, steps = floorDistances(f.tiles, f.w, f.h, Math.floor(d.p.x / TILE), Math.floor(d.p.y / TILE));
  const far = [];
  for (let i = 0; i < f.w * f.h; i++) if (steps[i] > 9 && steps[i] < 26) far.push(i);
  if (!far.length) return null;
  const i = d.rng.pick(far);
  return { x: ((i % f.w) + 0.5) * TILE, y: (Math.floor(i / f.w) + 0.5) * TILE };
}

function stirTheDark(d, n) {
  const types = ['crawler', 'wisp', 'construct'];
  for (let k = 0; k < n; k++) {
    const at = darkSpot(d);
    if (!at) return;
    const e = makeEnemy(d.rng.pick(types), at.x, at.y, floorLevel(d), null);
    e.aggro = true;
    d.enemies.push(e);
  }
}

// ---------------------------------------------------------------------------
// Leaving takes a moment: extracting in a lodeline, or an emergency recall
// from anywhere. Moving or being hit breaks it.
// ---------------------------------------------------------------------------
function startChannel(kind) {
  const d = Game.dive, L = T.leave;
  if (!d || d.hub || d.dying || d.channel) return;
  d.channel = { kind, t: 0, max: kind === 'recall' ? L.recall : L.extract, x: d.p.x, y: d.p.y };
  // the light draws attention
  for (const e of d.enemies) if (!e.dead && dist(e.x, e.y, d.p.x, d.p.y) < L.noise) wake(d, e);
}

function breakChannel(why) {
  const d = Game.dive;
  if (!d.channel) return;
  d.channel = null;
  UI.toast(why);
}

function updateChannel(dt) {
  const d = Game.dive, c = d.channel;
  if (!c) return;
  if (dist(d.p.x, d.p.y, c.x, c.y) > 3) { breakChannel('You moved: the pull let go'); return; }
  if ((c.t += dt) >= c.max) {
    d.channel = null;
    if (c.kind === 'extract') extractDive();
    else recallDive();
  }
}

// The share of the cargo an emergency recall costs here.
function recallCost(d) { const L = T.leave; return Math.min(L.recallMax, L.recallLoss + L.recallPerDepth * d.depth); }

// ---------------------------------------------------------------------------
// Walking: a circle against the floor's smooth wall line (rockAt), felt at
// its centre and eight points round its edge. Enemies use it too.
// ---------------------------------------------------------------------------
const BODY_RING = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => [Math.cos((k * Math.PI) / 4), Math.sin((k * Math.PI) / 4)]);
function bodyHits(f, x, y, r) {
  if (rockAt(f, x, y)) return true;
  for (const [c, s] of BODY_RING) if (rockAt(f, x + c * r, y + s * r)) return true;
  return false;
}
// How far into rock a body is: its ring points in rock, its centre double.
function bodyInRock(f, x, y, r) {
  let n = rockAt(f, x, y) ? 2 : 0;
  for (const [c, s] of BODY_RING) if (rockAt(f, x + c * r, y + s * r)) n++;
  return n;
}

function moveBody(f, b, dx, dy, r) {
  if (!dx && !dy) return;
  if (!bodyHits(f, b.x + dx, b.y + dy, r)) { b.x += dx; b.y += dy; return; }
  // already wedged in rock (pushed onto a ragged edge): it may work its way
  // out, or along the edge, but never deeper in
  if (bodyHits(f, b.x, b.y, r)) {
    const was = bodyInRock(f, b.x, b.y, r), now = bodyInRock(f, b.x + dx, b.y + dy, r);
    if (now < was || (now === was && !rockAt(f, b.x + dx, b.y + dy))) { b.x += dx; b.y += dy; }
    return;
  }
  // blocked: slide along the wall, one axis at a time, as far as each goes
  const x0 = b.x, y0 = b.y;
  for (const [mx, my] of [[dx, 0], [0, dy]]) {
    if (!mx && !my) continue;
    let lo = 0, hi = 1;
    if (!bodyHits(f, b.x + mx, b.y + my, r)) lo = 1;
    else for (let k = 0; k < 4; k++) { const mid = (lo + hi) / 2; if (bodyHits(f, b.x + mx * mid, b.y + my * mid, r)) hi = mid; else lo = mid; }
    b.x += mx * lo; b.y += my * lo;
  }
  // head-on into a curve: try the way round it, half a turn either side
  const m = Math.hypot(dx, dy);
  if (Math.hypot(b.x - x0, b.y - y0) < m * 0.3) {
    for (const turn of [0.7, -0.7, 1.2, -1.2]) {
      const c = Math.cos(turn), s = Math.sin(turn), tx = (dx * c - dy * s) * 0.8, ty = (dx * s + dy * c) * 0.8;
      if (!bodyHits(f, x0 + tx, y0 + ty, r)) { b.x = x0 + tx; b.y = y0 + ty; return; }
    }
  }
}

// ---------------------------------------------------------------------------
// Mining
// ---------------------------------------------------------------------------

// The ore tile in reach nearest a point just ahead of the diver.
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
    // a drill is loud
    if (d.stats.noisy) for (const e of d.enemies) if (!e.dead && dist(e.x, e.y, p.x, p.y) < T.mine.drillNoise) wake(d, e);
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

// Riding a lodeline home banks the cargo, and the star drinks a little of
// the depth: extractStar × depth² points.
// Everything in the pocket goes home, whatever happens.
function bankPocket(d) {
  const s = Save.data.stash, kept = { stuff: {}, items: [], blueprints: [] };
  for (const e of d.pocket) {
    if (e.item) { Save.data.items.push(e.item); kept.items.push(e.item); }
    else if (e.blueprint) { learnBlueprint(e.blueprint); kept.blueprints.push(e.blueprint); }
    else { s[e.stuff] = (s[e.stuff] || 0) + e.n; kept.stuff[e.stuff] = (kept.stuff[e.stuff] || 0) + e.n; }
  }
  d.pocket = [];
  return kept;
}

function learnBlueprint(id) { if (!Save.data.blueprints.includes(id)) Save.data.blueprints.push(id); }

// Blueprints carried home are learned.
function bankBlueprints(d) {
  const learned = d.blueprints.map((b) => b.id).filter((id) => !Save.data.blueprints.includes(id));
  for (const id of learned) learnBlueprint(id);
  d.blueprints = [];
  return learned;
}

function extractDive() {
  const d = Game.dive, s = Save.data.stash;
  const kept = bankPocket(d);
  for (const k in d.cargo) s[k] = (s[k] || 0) + d.cargo[k];
  Save.data.items.push(...d.items);
  const learned = bankBlueprints(d);
  const fed = T.star.extractStar * d.depth * d.depth;
  Save.data.star += fed;
  noteDeepest(d);
  Save.save();
  enterHub({ banked: d.cargo, items: d.items, depth: d.depth, biome: d.biome, fed, learned, kept, shard: d.gotShard, echoes: d.echoes });
}

// Dying, or giving up: the cargo is lost, what's worn and what's in the
// pocket are kept.
function loseDive(died) {
  const d = Game.dive, kept = bankPocket(d);
  noteDeepest(d);
  Save.save();
  enterHub({ lost: d.cargo, items: d.items, depth: d.depth, biome: d.biome, died, kept, lostBlueprints: d.blueprints.length, shard: d.gotShard, echoes: d.echoes });
}

// An emergency recall: home, but the dark keeps a share of the cargo (the
// pocket is safe).
function recallDive() {
  const d = Game.dive, s = Save.data.stash, cost = recallCost(d), lost = {};
  let lostItems = 0;
  const kept = bankPocket(d);
  for (const k in d.cargo) {
    // a share of each stack, rounded up or down by chance, so a single
    // exotic is a gamble rather than a certainty either way
    const share = d.cargo[k] * cost, gone = Math.floor(share) + (d.rng.chance(share % 1) ? 1 : 0);
    if (gone) lost[k] = gone;
    const keep = d.cargo[k] - gone;
    if (keep > 0) s[k] = (s[k] || 0) + keep;
    d.cargo[k] = keep;
  }
  const safe = d.items.filter(() => { if (d.rng.chance(cost)) { lostItems++; return false; } return true; });
  Save.data.items.push(...safe);
  const learned = bankBlueprints(d);
  noteDeepest(d);
  Save.save();
  enterHub({ banked: d.cargo, items: safe, depth: d.depth, biome: d.biome, learned, shard: d.gotShard, echoes: d.echoes, kept, recalled: { lost, lostItems, cost } });
}

function abandonDive() { loseDive(false); }
