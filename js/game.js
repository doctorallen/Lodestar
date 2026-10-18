'use strict';
// ---------------------------------------------------------------------------
// The game's state and a sortie's play: walking, fighting, mining, picking
// things up, your light, channels (banking, sealing, lighting a waystone,
// planting a spire, recalling), and how a sortie ends: home, recalled, or
// fallen. Where it goes (territories, spires, Deeps) is frontier.js.
// Everything here runs inside Game.step, one fixed 1/60 s step at a time.
// The diver runs on real time; the world runs on dt × Game.timeScale.
//
// What the diver wears is safe whatever happens; what's in the cargo
// (ore, exotics, gear, relics) is banked only at a spire or at home. The
// cargo is saved only when it's banked, so closing the page mid-sortie
// can't smuggle it home.
// ---------------------------------------------------------------------------

const Game = {
  ready: false,
  scene: 'base', // 'base' | 'dive'
  modal: null, // the id of the screen that's open; the simulation stops while one is
  t: 0, realT: 0, timeScale: 1, hitstop: 0,
  dive: null,
  step: null, render: null,
};

// The chance a Deep's site has a lodeline: less further down, a little more
// as the star grows.
function lodelineOdds(depth) {
  const F = T.floor, i = Math.min(F.padOdds.length, depth) - 1;
  return Math.min(F.padCap[i], F.padOdds[i] + F.padPerMag * (magnitudeOf(Save.data.star) - 1));
}

// A world to walk in: a sortie, or the outpost (hub: true). Both run the
// same walking, fighting and drawing; the outpost has no enemies but a
// practice target, and nothing in it can hurt.
function newWorld(fields) {
  const stats = computeStats(Save.data.equip, Save.data.attune);
  return Object.assign({
    seed: 0, biome: 0, depth: 0, floor: null, target: null, time: 0, kills: 0, dying: 0,
    rng: new Rng(1), stats,
    cargo: {}, items: [], blueprints: [], pocket: [], enemies: [], shots: [], bolts: [], drops: [], fx: [], nums: [], globs: [], puddles: [], auras: [], later: [], flow: null, flowAt: -1,
    pull: 1, pullTime: T.world.light, waveT: 0, channel: null, padDark: false,
    p: {
      x: 0, y: 0, fx: 0, fy: 1, walkT: 0, mine: null,
      hp: stats.maxHp, charge: stats.maxCharge, ward: 0, wardT: 0, invuln: 0, hurtT: 0, restT: 0, lowCharge: 0,
      dashT: 0, dashCd: 0, dashX: 0, dashY: 0, strikeT: 0, cast: null,
      hands: { main: newHand(), off: newHand() },
    },
  }, fields);
}

// Home: the outpost on the sinkhole's rim. report: how the dive ended.
function enterHub(report) {
  if (report) Save.data.swapped = false;
  const f = makeHubFloor();
  const d = (Game.dive = newWorld({ hub: true, floor: f }));
  d.p.x = (f.entry.x + 0.5) * TILE; d.p.y = (f.entry.y + 0.5) * TILE; d.p.fy = -1;
  d.drone = null;
  const dm = HUB_STATIONS.find((s) => s.id === 'dummy');
  const dummy = makeEnemy('dummy', (dm.x + 0.5) * TILE, (dm.y + 0.5) * TILE, 1, null);
  d.enemies = [dummy];
  placeSettlers(d);
  Game.scene = 'hub';
  UI.close();
  if (report) UI.openReport(report);
  else if (!Save.data.run && !Story.intro()) UI.tip('hub', 'Walk to the portal under the star to set out');
}

function newHand() { return { cd: 0, comboT: 0, buffer: 0, holdT: 0, holding: false, step: 0 }; }

// ---------------------------------------------------------------------------
// A sortie under way is saved on arriving anywhere and whenever the page is
// hidden, so a phone that drops the tab doesn't lose it. It comes back where
// it arrived (the territory's opening, its spire, or a Deep site's start),
// with what was carried, the health it had and your light as it was.
// ---------------------------------------------------------------------------
function saveRun(d) {
  if (!d || d.hub || d.dying || !d.sortie) return;
  const b = d.beacon;
  Save.data.run = {
    seed: d.sortieSeed, terr: d.terr, how: d.how, deep: d.deep ? d.deep.site : 0, tool: d.tool,
    cargo: d.cargo, items: d.items, blueprints: d.blueprints, pocket: d.pocket, banked: d.banked, far: d.far, maxRing: d.maxRing,
    hp: Math.max(1, Math.round(d.p.hp)), pull: d.pull, pullTime: d.pullTime, kills: d.kills, time: d.time, mined: d.mined || [],
    gotShard: !!d.gotShard, echoes: d.echoes || 0, beaconUsed: !!d.beaconUsed, beacon: b ? { x: b.x, y: b.y, t: b.t, landed: b.landed } : null,
    sealed: !!(d.deep && d.rift && !d.rift.open), storm: !!d.storm, tally: d.tally || {}, keeperDown: !!(d.zone === 'lair' && d.keeper && d.keeper.dead), lairT: d.lairT || 0,
    drops: d.deep ? d.drops.filter((x) => !x.mote && !x.gone).map((x) => Object.assign({}, x, { t: 0 })) : [],
  };
  // only what a sortie changes: the run, the world, what's worn, the craft counter
  Save.saveField('run'); Save.saveField('world'); Save.saveField('equip'); Save.saveField('crafts');
}

function resumeRun() {
  const r = Save.data.run;
  if (!r) return;
  Game.dive = newWorld({ sortie: true, sortieSeed: r.seed, rng: new Rng(hashInts(r.seed, 0x5eed, r.terr, r.kills)), tool: r.tool || 'compass', storm: !!r.storm,
    far: r.far || 0, maxRing: r.maxRing || 0, banked: r.banked || { stuff: {}, items: [], learned: [], fed: 0 }, tally: r.tally || {}, pull: r.pull === undefined ? 1 : r.pull, pullTime: r.pullTime || T.world.light });
  Game.scene = 'dive';
  const d = Game.dive;
  if (r.deep) { d.terr = r.terr; enterDeepSite(r.deep); } else enterTerritory(r.terr, r.how || {});
  const f = d.floor;
  if (r.deep) { for (const i of r.mined || []) if (f.tiles[i] === TILE_ORE) { f.tiles[i] = TILE_FLOOR; f.ore[i] = 0; } d.mined = (r.mined || []).slice(); }
  Object.assign(d, { cargo: r.cargo || {}, items: r.items || [], blueprints: r.blueprints || [], pocket: r.pocket || [], kills: r.kills || 0, time: r.time || 0, gotShard: r.gotShard, echoes: r.echoes, beaconUsed: r.beaconUsed });
  d.p.hp = Math.min(d.stats.maxHp, r.hp || d.stats.maxHp);
  if (!d.kindled) d.pull = r.pull === undefined ? 1 : r.pull;
  // a lair whose Keeper had fallen: still fallen, its shard still there
  if (r.keeperDown && d.keeper) { d.keeper.dead = true; d.padDark = false; }
  if (r.lairT) { d.lairT = r.lairT; if (d.keeper && r.lairT >= T.enemies.keeper.enrageAt) d.keeper.enraged = true; }
  // what was left lying on a Deep's site is still there
  if (r.drops && r.drops.length) d.drops = r.drops.slice();
  else if (r.keeperDown && !r.gotShard && d.keeper) d.drops.push({ x: d.keeper.x, y: d.keeper.y, t: 0, shard: d.biome });
  if (r.beacon && r.beacon.landed) { d.beacon = { x: r.beacon.x, y: r.beacon.y, t: 0 }; landBeacon(d, true); }
  else if (r.beacon) d.beacon = { x: r.beacon.x, y: r.beacon.y, t: r.beacon.t || 0, landed: false };
  if (d.pull <= 0 && !d.enemies.some((e) => e.type === 'hollow')) { d.pull = 0; theDarkComes(d); }
  if (r.sealed && d.rift) { d.rift.open = false; f.riftShift = null; }
  saveRun(d);
}

function placeFieldForge(d) {
  const f = d.floor, rng = new Rng(hashInts(d.seed, d.depth, 0xf0e6));
  d.fieldForge = null;
  if (!rng.chance(T.zones[d.zone].forge || 0)) return;
  // not in a room with a way on, the lodeline, a rift's tear, or a
  // territory's heart or waystones
  const keep = (d.rift ? [d.rift, d.rift.pair].filter(Boolean) : []).concat(f.heart ? [f.heart] : [], f.stones || []);
  const rooms = f.rooms.slice(1).filter((r) => !r.arena && !(f.ways || []).some((w) => roomHas(r, w)) && !(f.pad && roomHas(r, f.pad)) && !keep.some((t) => roomHas(r, t)) && r.cells.length > 8);
  if (!rooms.length) return;
  const r = rng.pick(rooms), i = rng.pick(r.cells);
  d.fieldForge = { x: i % f.w, y: Math.floor(i / f.w) };
  // never standing in a clime's pool or lava, nor on a vent
  if (hazardNear(f, d.fieldForge.x, d.fieldForge.y, 1)) { const dry = r.cells.filter((c) => !hazardNear(f, c % f.w, Math.floor(c / f.w), 1)); if (dry.length) { const j = dry[(i >>> 0) % dry.length]; d.fieldForge = { x: j % f.w, y: Math.floor(j / f.w) }; } }
  // whoever worked it left a schematic behind, now and then
  const leave = (thing) => d.drops.push(Object.assign({ x: (d.fieldForge.x + 1.5) * TILE, y: (d.fieldForge.y + 0.5) * TILE, t: 0 }, thing));
  if (rng.chance(T.fieldForge.blueprint)) dropBlueprint(d, leave);
  if (rng.chance(T.story.echoForge)) leave({ echo: true });
  // and a resonance stone, now and then, by the old forges
  if (rng.chance(T.circuits.resonance.forge) && !codexAllWhole()) leave({ resStone: true });
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
  if (d.arrive && d.arrive.t < T.portal.arrive) d.arrive.t += dtReal;
  // stepping through a portal: everything holds still until it's done
  if (updateWarp(d, dtReal) || Game.dive !== d) return;
  if (!d.hub) updateTools(dtReal);
  if (d.sortie) updateFrontier(d, dtReal);
  if (d.warp) return;
  p.invuln = Math.max(0, p.invuln - dtReal);
  p.hurtT = Math.max(0, p.hurtT - dtReal);
  p.lowCharge = Math.max(0, p.lowCharge - dtReal);
  if (p.wardT > 0 && (p.wardT -= dtReal) <= 0) { p.ward = 0; wardGone(p); }
  p.restT += dtReal;
  const rest = p.restT > T.player.restAfter ? T.player.restRegen : 0;
  p.hp = Math.min(st.maxHp, p.hp + (st.regen + rest) * dtReal);
  p.charge = Math.min(st.maxCharge, p.charge + T.player.chargeRegen * (1 + st.chargeRegen / 100) * dtReal);
  if (p.cast && (p.cast.t -= dtReal) <= 0) p.cast = null;
  for (const n of d.nums) { n.t -= dtReal; n.y -= 14 * dtReal; }
  d.nums = d.nums.filter((n) => n.t > 0);

  if (!updateDash(dtReal)) {
    const mv = Input.move, m = Math.hypot(mv.x, mv.y);
    let vx = 0, vy = 0;
    if (m > 0.05) {
      // slower mid-strike, so an Arc commits
      const sp = T.player.speed * (1 + st.moveSpeed / 100) * Math.min(1, m) * (p.strikeT > 0 ? 0.45 : 1);
      vx = (mv.x / m) * sp; vy = (mv.y / m) * sp;
      if (!(p.strikeT > 0)) { p.fx = mv.x / m; p.fy = mv.y / m; }
      p.walkT += dtReal;
    } else p.walkT = 0;
    // pools slow the step and ice carries it on (hazards.js)
    stepDiver(d, p, vx, vy, dtReal);
  }
  updateHands(dtReal);
  updateMining(dtReal);
  if (!d.hub) { updatePull(dt); updateChannel(dtReal); }
  if (Game.dive !== d) return;
  updateEnemies(dt);
  updateBolts(dt);
  updateAuras(dt);
  updateCombatFx(dt);
  if (!d.hub) { updateLife(d, dt); updateWorld(d, dt); }
  else updateSettlers(d, dt);
  updatePickups(dtReal);
  if (Input.consumeAct()) {
    const a = actionHere();
    if (d.hub) { if (a) UI.useStation(a); }
    else if (a === 'way') stepThrough(d, wayHere(d));
    else if (a === 'extract') startChannel('extract');
    else if (a === 'stone') startChannel('stone');
    else if (a === 'plant') startChannel('plant');
    else if (a === 'rift') useRift(d);
    else if (a === 'forge') UI.useStation('fieldForge');
  }
}

function startDying() {
  const d = Game.dive;
  d.dying = 1.4;
  // a fall is final, even if the page closes before it's over
  Save.data.run = null; Save.saveField('run');
  d.p.mine = null;
  d.fx.push({ kind: 'death', x: d.p.x, y: d.p.y - 6, t: 1.4, max: 1.4 });
}

// What the contextual button does where the diver stands: a station in
// the outpost; out in the world, a spire or a Deep's lodeline ('extract'), a
// waystone, the heart to plant a spire in, an ancient forge, a portal or a
// tear.
function actionHere() {
  const d = Game.dive;
  if (!d || d.dying || d.warp) return null;
  const near = (tx, ty, r) => dist(d.p.x, d.p.y, (tx + 0.5) * TILE, (ty + 0.5) * TILE) < r;
  if (d.hub) { const s = HUB_STATIONS.find((s) => s.id !== 'dummy' && near(s.x, s.y, s.id === 'wreck' ? 30 : 20)); return s ? s.id : null; }
  const t = floorTile(d.floor, Math.floor(d.p.x / TILE), Math.floor(d.p.y / TILE));
  if (t === TILE_PAD && !d.padDark && !d.channel) return 'extract';
  if (d.sortie && !d.channel && stoneHere(d) >= 0) return 'stone';
  if (d.sortie && !d.channel && heartReady(d)) return 'plant';
  if (d.fieldForge && near(d.fieldForge.x, d.fieldForge.y, 20)) return 'forge';
  if (wayHere(d) >= 0) return 'way';
  if (!d.channel && riftHere(d)) return 'rift';
  return null;
}

// ---------------------------------------------------------------------------
// Your light: full in kindled land, draining in the dark
// ---------------------------------------------------------------------------
function updatePull(dt) {
  const d = Game.dive, P = T.pull;
  if (d.kindled && !d.deep) { d.pull = 1; return; }
  if (d.pull <= 0) return;
  // in a lair the Keeper holds the dark off while it lives, but its rage grows
  if (d.zone === 'lair' && d.keeper && !d.keeper.dead) {
    if (!d.keeper.enraged && (d.lairT = (d.lairT || 0) + dt) >= T.enemies.keeper.enrageAt) { d.keeper.enraged = true; UI.toast('The Keeper rages', 'legendary'); }
    return;
  }
  const was = d.pull;
  d.pull = Math.max(0, d.pull - (dt / (d.pullTime || T.world.light)) * (1 - d.stats.pullSlow / 100));
  if (was > P.dimAt && d.pull <= P.dimAt) { UI.toast('Your light is fading', 'legendary'); Story.say('pullFading'); }
  if (d.pull <= P.dimAt && (d.waveT -= dt) <= 0) { d.waveT = P.waveEvery; stirTheDark(d, P.wave); }
  if (d.pull <= 0) theDarkComes(d);
}

// Your light is out: a Deep's lodeline goes dark, and the Hollow comes.
function theDarkComes(d) {
  if (d.deep) {
    d.padDark = true;
    if (d.channel && d.channel.kind === 'extract') breakChannel('The lodeline went dark');
  }
  UI.toast(d.deep ? 'The lodeline has gone dark. Something is coming.' : 'Your light is out. Something is coming.', 'legendary');
  const at = darkSpot(d);
  if (at) { const h = makeEnemy('hollow', at.x, at.y, floorLevel(d), null); h.aggro = true; d.enemies.push(h); }
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
// Some things take a moment: banking at a spire, travelling from it, a
// Deep's lodeline, lighting a waystone, planting a spire, sealing a tear, or
// an emergency recall from anywhere. Moving or being hit breaks it.
// ---------------------------------------------------------------------------
function startChannel(kind) {
  const d = Game.dive, L = T.leave;
  if (!d || d.hub || d.dying || d.channel) return;
  const max = { recall: L.recall, seal: T.rifts.seal, stone: T.world.waystone.channel, plant: T.world.plant }[kind] || L.extract;
  d.channel = { kind, t: 0, max, x: d.p.x, y: d.p.y, stone: kind === 'stone' ? stoneHere(d) : -1 };
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
  if (dist(d.p.x, d.p.y, c.x, c.y) > 3) { breakChannel('You moved: it let go'); return; }
  if ((c.t += dt) >= c.max) {
    d.channel = null;
    if (c.kind === 'extract') extractDive();
    else if (c.kind === 'seal') sealRift();
    else if (c.kind === 'stone') stoneLit(d, c.stone);
    else if (c.kind === 'plant') kindleTerritory(d);
    else if (c.kind === 'travel') travelDone(d, c.to);
    else recallDive();
  }
}

// The share of the cargo an emergency recall costs here.
function recallCost(d) { const L = T.leave; return clamp(L.recallLoss + L.recallPerDepth * d.depth - L.recallPerMag * (magnitudeOf(Save.data.star) - 1), L.recallMin, L.recallMax); }

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
  noteMined(d, tgt.i);
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
// Everything in the pocket goes home, whatever happens.
function bankPocket(d) {
  Save.data.run = null;
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

// Standing in a gold beam: at a spire the cargo is banked; a Deep's
// lodeline lifts the diver back to its territory's surface.
function extractDive() {
  const d = Game.dive;
  if (d.deep) leaveDeep();
  else bankAtSpire(d);
}

// Dying, or giving up: the cargo is lost, what's worn and what's in the
// pocket are kept. A fall wakes the diver at the last spire touched (the
// outpost if none); giving up goes home.
function loseDive(died) {
  const d = Game.dive, kept = bankPocket(d), b = d.banked || { stuff: {}, items: [] };
  ageContracts();
  const at = died ? Save.data.lastSpire || 0 : 0;
  const report = { lost: d.cargo, items: d.items, died, kept, lostBlueprints: d.blueprints.length, shard: d.gotShard, echoes: d.echoes, where: sortieWhere(d), earlier: b, wake: at ? terrOf(at).name : '' };
  Save.save();
  if (at && hasSpire(at)) { startSortie({ terr: at, spire: true }); UI.openReport(report); }
  else enterHub(report);
}

// An emergency recall: home, but the dark keeps a share of the cargo (the
// pocket is safe, and so is what was banked).
function recallDive() {
  const d = Game.dive, cost = recallCost(d), lost = {};
  let lostItems = 0;
  for (const k in d.cargo) {
    // a share of each stack, rounded up or down by chance, so a single
    // exotic is a gamble rather than a certainty either way
    const share = d.cargo[k] * cost, gone = Math.floor(share) + (d.rng.chance(share % 1) ? 1 : 0);
    if (gone) lost[k] = gone;
    d.cargo[k] -= gone;
    if (d.cargo[k] <= 0) delete d.cargo[k];
  }
  d.items = d.items.filter(() => { if (d.rng.chance(cost)) { lostItems++; return false; } return true; });
  // the ride home feeds the star nothing
  d.far = 0;
  bankHaul(d);
  Save.data.run = null;
  const b = d.banked, contracts = settleContracts(d, b.stuff);
  Save.save();
  enterHub({ banked: b.stuff, items: b.items, learned: b.learned, fed: b.fed, shard: d.gotShard, echoes: d.echoes, contracts, where: sortieWhere(d), recalled: { lost, lostItems, cost } });
}

function abandonDive() { loseDive(false); }
