'use strict';
// ---------------------------------------------------------------------------
// Each clime's own creature, its signature (T.enemies.signature): a share of
// what a room holds in its clime, and nowhere else but where a rift's graft
// of that clime brings a few. Each has its own attack, shown before it lands
// (a red line, ring or mark, the creature glowing brighter as it winds up),
// and a dash crosses every one of them. They take turns with the others
// (only a few wind up at once), wake as the others do, and find their way
// along the same flow field.
//   skink     Badlands: swims under the sand; a ring shows where it will
//             burst up under you; then it's up for a moment.
//   tusker    Frost Steppe: a heavy charge; on ice it slides on past you,
//             can't turn, and slams into the rock, dazed.
//   wraith    Cinder Waste: rises from a fissure, drifts in, glows and
//             bursts into embers that leave the ground burning; then it's a
//             spent cinder for a moment.
//   lurker    Bloomfen: sunk to its eyes in its mire; its tongue lashes
//             along a marked line and drags you a tile in.
//   dropper   Caverns: on the roof; its shadow grows on the floor, then it
//             drops, and fights like a squat crawler.
//   eel       Flooded Grotto: swims in the pools, rears and lunges along a
//             shown line; on dry ground without a bite, it's stranded.
//   crab      Magma Tubes: a shell that turns most of a blow until it's
//             chilled or a heavy hit cracks it; sidesteps and pinches; lava
//             doesn't burn it.
//   weaver    Rootdeep: keeps off and spits, and strings root snares
//             between the walls across your way.
//   sentinel  Archive: floats, and sweeps a beam through an arc; rock stops
//             the beam, so a pillar is cover.
//   idol      Overgrown Temple: moves only out of the light; in the lamp's
//             heart (or a shaft of daylight) it's stone.
//   hound     Clockwork Vault: winds its key, then runs, glancing off the
//             walls twice, the way it showed; then it's spent.
// While under the sand or the water or on the roof (e.hid) nothing can
// strike it or aim at it. Numbers in T.enemies; looks in foesart.js.
// ---------------------------------------------------------------------------

// [name, plural] for the screens
const FOE_NAMES = {
  skink: ['Dune Skink', 'dune skinks'], tusker: ['Tusker', 'tuskers'], wraith: ['Ash Wraith', 'ash wraiths'], lurker: ['Bog Lurker', 'bog lurkers'],
  dropper: ['Ceiling Dropper', 'ceiling droppers'], eel: ['Pool Eel', 'pool eels'], crab: ['Slag Crab', 'slag crabs'], weaver: ['Rootweaver', 'rootweavers'],
  sentinel: ['Sentinel Eye', 'sentinel eyes'], idol: ['Moss Idol', 'moss idols'], hound: ['Gear Hound', 'gear hounds'],
};
// The states in which one is open to a counter (T.enemies.exposed).
const FOE_EXPOSED = new Set(['stranded', 'spent', 'landed']);
// The tells' red (the crawler's), and what a weaver spits.
const FOE_TELL = '#ff3d3d', FOE_SPIT = '#c8e85a';

function foeOfClime(clime) { return (clime && T.enemies.signature[clime]) || null; }
function climeOfFoe(type) { return Object.keys(T.enemies.signature).find((c) => T.enemies.signature[c] === type) || null; }

// How each begins: some out of sight.
function foeInit(e) {
  const start = { skink: 'buried', dropper: 'roof', eel: 'swim', wraith: 'dormant', lurker: 'lurk', idol: 'still', sentinel: 'hover', weaver: 'drift', tusker: 'chase', crab: 'chase', hound: 'chase' };
  e.state = start[e.type] || 'idle';
  e.hid = e.type === 'skink' || e.type === 'dropper' || e.type === 'eel' || e.type === 'wraith';
}

// Where one stands in room r: an eel in the room's water (none there, and
// it's null: the room has a common one instead), the rest on clear ground.
function foeSpot(d, type, r, rng) {
  const f = d.floor, R = T.enemies[type].radius, at = (i) => ({ x: ((i % f.w) + 0.5) * TILE, y: (Math.floor(i / f.w) + 0.5) * TILE });
  if (T.enemies[type].swims) {
    const wet = f.haz ? r.cells.filter((i) => f.haz[i] === HAZ_CODES.pool) : [];
    for (let tries = 0; tries < 8 && wet.length; tries++) { const p = at(rng.pick(wet)); if (hazardAt(f, p.x, p.y) === HAZ_CODES.pool && !bodyHits(f, p.x, p.y, R)) return p; }
    return null;
  }
  let p = null;
  for (let tries = 0; tries < 8; tries++) { p = at(rng.pick(r.cells)); if (!bodyHits(f, p.x, p.y, R) && !hazardNear(f, Math.floor(p.x / TILE), Math.floor(p.y / TILE), 0)) break; }
  return p;
}

// A rift's graft brings a few of its clime's own creature (not one that
// needs that clime's water or a roof), on its ground, away from the entry.
function graftFoes(d, rng, level, eliteChance) {
  const f = d.floor, g = f.graft, E = T.enemies;
  const type = g && f.graftMask ? foeOfClime(g.clime) : null;
  if (!type || E[type].noGraft) return;
  const cells = [];
  for (let i = 0; i < f.graftMask.length; i++)
    if (f.graftMask[i] && f.tiles[i] === TILE_FLOOR && Math.hypot((i % f.w) - f.entry.x, Math.floor(i / f.w) - f.entry.y) > 6) cells.push(i);
  for (let k = rng.i(E.graftFoes[0], E.graftFoes[1]); k > 0 && cells.length; k--) {
    const i = rng.pick(cells), x = ((i % f.w) + 0.5) * TILE, y = (Math.floor(i / f.w) + 0.5) * TILE;
    if (bodyHits(f, x, y, E[type].radius)) continue;
    d.enemies.push(makeEnemy(type, x, y, level, rng.chance(eliteChance) ? rollEliteAffix(rng) : null));
  }
}

// ---------------------------------------------------------------------------
// Little helpers
// ---------------------------------------------------------------------------

// How far (px, at most max) from x, y along ux, uy before the rock.
function foeRay(f, x, y, ux, uy, max) {
  for (let s = 2; s <= max; s += 2) if (rockAt(f, x + ux * s, y + uy * s)) return s - 2;
  return max;
}
// The distance from px, py to the segment x0, y0 – x1, y1.
function foeSegDist(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, L = dx * dx + dy * dy || 1, k = clamp(((px - x0) * dx + (py - y0) * dy) / L, 0, 1);
  return Math.hypot(px - x0 - dx * k, py - y0 - dy * k);
}
const foeAngleNear = (a, ref) => a + Math.round((ref - a) / (2 * Math.PI)) * 2 * Math.PI;

// Each step, before the enemies: snares fade, and a lurker's catch is
// dragged in.
function updateFoeWorld(d, dt) {
  if (d.snares && d.snares.length) { for (const s of d.snares) s.t -= dt; d.snares = d.snares.filter((s) => s.t > 0); }
  const g = d.drag;
  if (g) {
    const k = Math.min(dt, g.t);
    if (!d.dying) moveBody(d.floor, d.p, g.vx * k, g.vy * k, T.player.radius);
    if ((g.t -= dt) <= 0) d.drag = null;
  }
}

// A Rootweaver's snare holds the step (hazards.js stepDiver): the share of
// its pace the diver keeps where it stands.
function snareSlow(d, p) {
  if (!d.snares || !d.snares.length) return 1;
  const W = T.enemies.weaver;
  for (const s of d.snares) if (foeSegDist(p.x, p.y, s.x0, s.y0, s.x1, s.y1) < W.snareWidth + T.player.radius) return W.snareSlow;
  return 1;
}

// ---------------------------------------------------------------------------
// Each step
// ---------------------------------------------------------------------------
function updateFoe(d, e, pd, sp, dt, free) {
  // the first time one shows itself, Wick's word on it
  if (!e.hid && e.aggro && !e.met && pd < 120) { e.met = true; Story.say('foe_' + e.type); }
  FOE_UPDATE[e.type](d, e, pd, sp, dt, free);
}

// The Dune Skink: under the sand it makes for the diver; close enough, a
// ring shows where it will come up, and it bursts up there and bites.
function updateSkink(d, e, pd, sp, dt, free) {
  const def = T.enemies.skink, p = d.p, f = d.floor;
  e.t -= dt;
  if (e.state === 'windup') {
    // under the sand, making for the ring
    const m = dist(e.x, e.y, e.aimX, e.aimY);
    if (m > 1) { const a = norm(e.aimX - e.x, e.aimY - e.y), s = Math.min(m, sp * 1.5); moveBody(f, e, a.x * s, a.y * s, e.r); }
    if (e.t <= 0) {
      if (!bodyHits(f, e.aimX, e.aimY, e.r)) { e.x = e.aimX; e.y = e.aimY; }
      e.hid = false;
      if (dist(e.aimX, e.aimY, p.x, p.y) < def.burst + T.player.radius) hurtPlayer(e.dmg, e);
      d.fx.push({ kind: 'foeBurst', x: e.aimX, y: e.aimY, r: def.burst, t: 0.35, max: 0.35, col: FOE_PAL.skink.sand[3] });
      e.state = 'up'; e.t = def.up;
    }
    return;
  }
  if (e.state === 'up') {
    // out of the sand it scuttles off a little
    if (e.t < def.up - 0.35) { const a = norm(e.x - p.x, e.y - p.y); moveBody(f, e, a.x * sp * 0.5, a.y * sp * 0.5, e.r); }
    if (e.t <= 0) { e.state = 'dig'; e.t = def.dig; }
    return;
  }
  if (e.state === 'dig') { if (e.t <= 0) { e.hid = true; e.state = 'buried'; e.cd = def.cooldown; } return; }
  // knocked about up top: back under
  if (!e.hid) { e.state = 'dig'; e.t = def.dig; return; }
  e.state = 'buried';
  if (!e.aggro) return;
  if (pd > def.strike) { const w = wayToPlayer(d, e); moveBody(f, e, w.x * sp, w.y * sp, e.r); }
  else if (free && e.cd <= 0) { e.state = 'windup'; e.t = def.windup; e.aimX = p.x; e.aimY = p.y; }
  else orbitMove(d, e, def.strike, sp * 0.5);
}

// The Tusker: shows its whole run, charges along it, and slides on; it
// can't turn, and the rock stops it dazed (longer after a slide on ice).
function updateTusker(d, e, pd, sp, dt, free) {
  const def = T.enemies.tusker, p = d.p, f = d.floor;
  if (e.state === 'charge' || e.state === 'slide') {
    const r = tuskerStep(f, e, dt);
    if (!e.hitDone && dist(e.x, e.y, p.x, p.y) < e.r + T.player.radius + 3) { e.hitDone = true; hurtPlayer(e.dmg, e); }
    if (r === 'wall') { e.state = 'dazed'; e.t = e.slid ? def.slam : def.dazed; e.cd = def.cooldown; d.fx.push({ kind: 'foeBurst', x: e.x, y: e.y, r: 14, t: 0.3, max: 0.3, col: '#e8f0ff' }); }
    else if (r === 'stop') { e.state = 'chase'; e.cd = def.cooldown; }
    return;
  }
  e.t -= dt;
  if (e.state === 'windup') {
    if (e.t <= 0) { const a = norm(e.aimX - e.x, e.aimY - e.y); e.vx = a.x * def.chargeSpeed; e.vy = a.y * def.chargeSpeed; e.state = 'charge'; e.t = def.chargeTime; e.hitDone = false; e.slid = false; }
    return;
  }
  e.state = 'chase';
  if (pd < def.range && e.cd <= 0 && free && clearLine(f, e.x, e.y, p.x, p.y)) {
    e.state = 'windup'; e.t = def.windup; e.aimX = p.x; e.aimY = p.y;
    e.path = tuskerPath(f, e);
    return;
  }
  if (pd > e.r + 6) { const w = wayToPlayer(d, e); moveBody(f, e, w.x * sp, w.y * sp, e.r); }
}

// One step of a tusker's charge or the slide after it, for the tusker
// itself or for the run it shows: b { x, y, r, vx, vy, t, state }. 'wall'
// into the rock, 'stop' when it has run out of speed.
function tuskerStep(f, b, dt) {
  const def = T.enemies.tusker, ox = b.x, oy = b.y, sp = Math.hypot(b.vx, b.vy);
  b.t -= dt;
  if (b.state === 'charge' && b.t <= 0) b.state = 'slide';
  if (b.state === 'slide') {
    const ice = hazardAt(f, b.x, b.y) === HAZ_CODES.slick;
    if (ice) b.slid = true;
    const k = Math.exp(-(ice ? def.iceGrip : def.grip) * dt);
    b.vx *= k; b.vy *= k;
    if (sp < def.stopAt) return 'stop';
  }
  moveBody(f, b, b.vx * dt, b.vy * dt, b.r);
  if (Math.abs(b.x - ox) + Math.abs(b.y - oy) < sp * dt * 0.3) return 'wall';
  return null;
}
// The run a tusker will make from where it stands: its points, and
// whether it ends in the rock.
function tuskerPath(f, e) {
  const def = T.enemies.tusker, a = norm(e.aimX - e.x, e.aimY - e.y);
  const b = { x: e.x, y: e.y, r: e.r, vx: a.x * def.chargeSpeed, vy: a.y * def.chargeSpeed, t: def.chargeTime, state: 'charge' }, pts = [b.x, b.y];
  let end = null;
  for (let n = 1; n <= 300 && !end; n++) { end = tuskerStep(f, b, 1 / 60); if (n % 3 === 0) pts.push(b.x, b.y); }
  pts.push(b.x, b.y);
  return { pts, wall: end === 'wall' };
}

// The Ash Wraith: rises from its fissure when the diver comes near, drifts
// in, glows and bursts, leaving the ground burning; then it's spent.
function updateWraith(d, e, pd, sp, dt, free) {
  const def = T.enemies.wraith, p = d.p, f = d.floor;
  e.t -= dt;
  if (e.state === 'dormant') {
    if (e.aggro && pd < def.notice && clearLine(f, e.x, e.y, p.x, p.y)) { e.hid = false; e.state = 'rise'; e.t = def.rise; }
    return;
  }
  if (e.state === 'rise') { if (e.t <= 0) { e.state = 'drift'; e.cd = Math.max(e.cd, 0.4); } return; }
  if (e.state === 'windup') {
    if (e.t <= 0) {
      if (dist(e.x, e.y, p.x, p.y) < def.burst + T.player.radius) hurtPlayer(e.dmg, e);
      d.puddles.push({ x: e.x, y: e.y, r: def.ashR, t: def.ashTime, max: def.ashTime, dps: e.dmg * def.ash, col: FOE_PAL.wraith.core[0] });
      d.fx.push({ kind: 'foeBurst', x: e.x, y: e.y, r: def.burst, t: 0.4, max: 0.4, col: FOE_PAL.wraith.flame[0], glow: true });
      e.state = 'spent'; e.t = def.spent;
    }
    return;
  }
  if (e.state === 'spent') { if (e.t <= 0) { e.state = 'drift'; e.cd = def.cooldown; } return; }
  e.state = 'drift';
  if (pd > def.burstAt * 0.6) { const w = wayToPlayer(d, e); moveBody(f, e, w.x * sp, w.y * sp, e.r); }
  if (pd < def.burstAt && free && e.cd <= 0) { e.state = 'windup'; e.t = def.windup; }
}

// The Bog Lurker: marks a line, then its tongue lashes along it and drags
// what it catches a tile in. It never leaves its mire.
function updateLurker(d, e, pd, sp, dt, free) {
  const def = T.enemies.lurker, p = d.p, f = d.floor;
  e.t -= dt;
  if (e.state === 'windup') {
    if (e.t > 0) return;
    const a = norm(e.aimX - e.x, e.aimY - e.y), x1 = e.x + a.x * e.reach, y1 = e.y + a.y * e.reach;
    d.fx.push({ kind: 'foeTongue', x: e.x, y: e.y, x2: x1, y2: y1, t: 0.25, max: 0.25 });
    if (p.invuln <= 0 && !d.dying && foeSegDist(p.x, p.y, e.x, e.y, x1, y1) < def.width + T.player.radius) {
      hurtPlayer(e.dmg, e);
      const m = dist(p.x, p.y, e.x, e.y), pull = clamp(m - e.r - T.player.radius - 4, 0, def.drag), b = norm(e.x - p.x, e.y - p.y);
      d.drag = { vx: (b.x * pull) / def.dragTime, vy: (b.y * pull) / def.dragTime, t: def.dragTime };
    }
    e.state = 'lurk'; e.cd = def.cooldown; e.lashT = 0.3;
    return;
  }
  e.state = 'lurk';
  e.lashT = Math.max(0, (e.lashT || 0) - dt);
  if (e.aggro && e.cd <= 0 && free && pd < def.range && clearLine(f, e.x, e.y, p.x, p.y)) {
    const a = norm(p.x - e.x, p.y - e.y);
    e.state = 'windup'; e.t = def.windup; e.aimX = p.x; e.aimY = p.y;
    e.reach = foeRay(f, e.x, e.y, a.x, a.y, def.range);
  }
}

// The Ceiling Dropper: on the roof until the diver passes under; its
// shadow follows the diver a moment, then holds, and it drops there. After
// that, a squat crawler.
function updateDropper(d, e, pd, sp, dt, free) {
  const def = T.enemies.dropper, p = d.p, f = d.floor;
  if (e.hid) {
    e.t -= dt;
    if (e.state === 'windup') {
      if (e.t > def.fall - def.track) { e.aimX = p.x; e.aimY = p.y; }
      if (e.t <= 0) {
        if (!bodyHits(f, e.aimX, e.aimY, e.r)) { e.x = e.aimX; e.y = e.aimY; }
        e.hid = false;
        if (dist(e.aimX, e.aimY, p.x, p.y) < def.drop + T.player.radius) hurtPlayer(e.dmg, e);
        d.fx.push({ kind: 'foeBurst', x: e.x, y: e.y, r: def.drop, t: 0.3, max: 0.3, col: FOE_PAL.dropper.belly[3] });
        e.state = 'landed'; e.t = def.landed;
      }
      return;
    }
    e.state = 'roof';
    if (e.aggro && free && pd < def.notice && clearLine(f, e.x, e.y, p.x, p.y)) { e.state = 'windup'; e.t = def.fall; e.aimX = p.x; e.aimY = p.y; }
    return;
  }
  if (e.state === 'landed') { if ((e.t -= dt) <= 0) { e.state = 'chase'; e.cd = Math.max(e.cd, 0.3); } return; }
  updateCrawler(d, e, pd, sp, dt, free, def);
}

// The Pool Eel: swims about its pool towards the diver; rears, showing its
// line, and lunges. Ending on dry ground without a bite, it lies stranded,
// then crawls back to the water.
function updateEel(d, e, pd, sp, dt, free) {
  const def = T.enemies.eel, p = d.p, f = d.floor, wet = (x, y) => hazardAt(f, x, y) === HAZ_CODES.pool;
  e.t -= dt;
  if (e.state === 'windup') {
    if (e.t <= 0) { const a = norm(e.aimX - e.x, e.aimY - e.y); e.vx = a.x * def.lungeSpeed; e.vy = a.y * def.lungeSpeed; e.state = 'lunge'; e.t = def.lungeTime; e.hitDone = false; }
    return;
  }
  if (e.state === 'lunge') {
    const ox = e.x, oy = e.y;
    moveBody(f, e, e.vx * dt, e.vy * dt, e.r);
    if (!e.hitDone && dist(e.x, e.y, p.x, p.y) < e.r + T.player.radius + 3) { e.hitDone = true; hurtPlayer(e.dmg, e); }
    const blocked = Math.abs(e.x - ox) + Math.abs(e.y - oy) < def.lungeSpeed * dt * 0.3;
    if (e.t <= 0 || blocked) {
      if (wet(e.x, e.y)) { e.state = 'surface'; e.t = def.surface; }
      else if (e.hitDone) e.state = 'crawl';
      else { e.state = 'stranded'; e.t = def.stranded; }
    }
    return;
  }
  if (e.state === 'stranded') { if (e.t <= 0) e.state = 'crawl'; return; }
  // back in the water, it takes a moment to dive
  if (e.state === 'surface') { if (e.t <= 0) { e.state = 'swim'; e.hid = true; e.cd = def.cooldown; } return; }
  if (!wet(e.x, e.y)) {
    // on dry ground: back to the water it came from
    e.hid = false; e.state = 'crawl';
    const a = norm(e.homeX - e.x, e.homeY - e.y), s = def.crawlSpeed * dt;
    moveBody(f, e, a.x * s, a.y * s, e.r);
    return;
  }
  if (!e.hid) { e.state = 'surface'; e.t = def.surface; return; }
  e.state = 'swim';
  e.homeX = e.x; e.homeY = e.y;
  if (!e.aggro) return;
  if (pd < def.range && free && e.cd <= 0 && clearLine(f, e.x, e.y, p.x, p.y)) { e.hid = false; e.state = 'windup'; e.t = def.windup; e.aimX = p.x; e.aimY = p.y; return; }
  // round its pool towards the diver, never out of it
  const a = norm(p.x - e.x, p.y - e.y), dx = a.x * sp, dy = a.y * sp;
  for (const [mx, my] of [[dx, dy], [dx, 0], [0, dy]]) if ((mx || my) && wet(e.x + mx, e.y + my)) { moveBody(f, e, mx, my, e.r); break; }
}

// The Slag Crab: a crawler's way of fighting, sidestepping faster. Its
// shell is crabShell's.
function updateCrab(d, e, pd, sp, dt, free) {
  e.cracked = Math.max(0, (e.cracked || 0) - dt);
  updateCrawler(d, e, pd, sp, dt, free, T.enemies.crab);
}
// The crab's shell, a rule of its own beside its natures (T.enemies.resist,
// which the resistance system reads): the share of a blow that gets
// through. Chilled, or cracked, it's open; a heavy blow cracks it, and gets
// through whole.
function crabShell(e, opts) {
  const def = T.enemies.crab;
  if (e.slowT > 0 || e.cracked > 0) return 1;
  if (opts.heavy) { e.cracked = def.crackTime; return 1; }
  return def.shell;
}

// The Rootweaver: keeps off like a wisp and spits; now and then it shows a
// snare across the diver's way, from wall to wall, and strings it.
function updateWeaver(d, e, pd, sp, dt, free) {
  const def = T.enemies.weaver, p = d.p, f = d.floor;
  e.t -= dt;
  e.snareT = (e.snareT === undefined ? def.snareEvery * 0.5 : e.snareT) - dt;
  if (e.state === 'windup') {
    if (e.t <= 0) {
      const a = norm(e.aimX - e.x, e.aimY - (e.y - 5));
      fireEnemyShot(d, e.x, e.y - 5, a.x * def.shotSpeed, a.y * def.shotSpeed, e.dmg, FOE_SPIT);
      e.state = 'drift'; e.cd = def.cooldown;
    }
    return;
  }
  if (e.state === 'weave') {
    if (e.t <= 0) {
      d.snares = d.snares || [];
      d.snares.push(Object.assign({ t: def.snareTime, max: def.snareTime }, e.snare));
      while (d.snares.length > def.snareMax) d.snares.shift();
      e.state = 'drift'; e.snareT = def.snareEvery; e.cd = Math.max(e.cd, 0.6);
    }
    return;
  }
  e.state = 'drift';
  const sees = clearLine(f, e.x, e.y, p.x, p.y - 6);
  if (!sees || pd > def.keep + 30) { const w = wayToPlayer(d, e); moveBody(f, e, w.x * sp, w.y * sp, e.r); }
  else orbitMove(d, e, def.keep, sp);
  if (!e.aggro || !sees || pd > def.range || !free || e.cd > 0) return;
  const sn = e.snareT <= 0 && foeSnareLine(f, p, e);
  if (sn) { e.state = 'weave'; e.t = def.weave; e.snare = sn; }
  else { e.state = 'windup'; e.t = def.windup; e.aimX = p.x; e.aimY = p.y - 6; }
}
// A line through the diver from wall to wall, across the way from the
// weaver (or near it), each end within snareReach; null if there's none.
function foeSnareLine(f, p, e) {
  const R = T.enemies.weaver.snareReach, base = Math.atan2(p.y - e.y, p.x - e.x) + Math.PI / 2;
  for (const off of [0, 0.4, -0.4, 0.8, -0.8, Math.PI / 2]) {
    const ux = Math.cos(base + off), uy = Math.sin(base + off);
    const l0 = foeRay(f, p.x, p.y, ux, uy, R + 2), l1 = foeRay(f, p.x, p.y, -ux, -uy, R + 2);
    if (l0 > R || l1 > R || l0 + l1 < 10) continue;
    return { x0: p.x + ux * l0, y0: p.y + uy * l0, x1: p.x - ux * l1, y1: p.y - uy * l1 };
  }
  return null;
}

// The Sentinel Eye: holds off, shows the arc it will sweep, and sweeps its
// beam through it. Rock stops the beam; it strikes once a sweep.
function updateSentinel(d, e, pd, sp, dt, free) {
  const def = T.enemies.sentinel, p = d.p, f = d.floor;
  e.t -= dt;
  if (e.state === 'windup') { if (e.t <= 0) { e.state = 'sweep'; e.t = def.sweep; e.beamA = e.a0; e.hitDone = false; } return; }
  if (e.state === 'sweep') {
    const was = e.beamA;
    e.beamA = lerp(e.a0, e.a1, 1 - Math.max(0, e.t) / def.sweep);
    e.beamL = foeRay(f, e.x, e.y, Math.cos(e.beamA), Math.sin(e.beamA), def.range);
    if (!e.hitDone && p.invuln <= 0 && !d.dying) {
      // has the beam passed over the diver since the last step?
      const m = Math.max(1, dist(e.x, e.y, p.x, p.y)), tol = Math.atan2(T.player.radius + 2, m);
      const lo = Math.min(was, e.beamA) - tol, hi = Math.max(was, e.beamA) + tol, a = foeAngleNear(Math.atan2(p.y - e.y, p.x - e.x), (lo + hi) / 2);
      if (a >= lo && a <= hi && m < def.range && foeRay(f, e.x, e.y, (p.x - e.x) / m, (p.y - e.y) / m, m) >= m - 2) { e.hitDone = true; hurtPlayer(e.dmg, e); }
    }
    if (e.t <= 0) { e.state = 'hover'; e.cd = def.cooldown; }
    return;
  }
  e.state = 'hover';
  const sees = clearLine(f, e.x, e.y, p.x, p.y - 6);
  if (!sees || pd > def.keep + 30) { const w = wayToPlayer(d, e); moveBody(f, e, w.x * sp, w.y * sp, e.r); }
  else orbitMove(d, e, def.keep, sp);
  if (e.aggro && sees && pd < def.range && free && e.cd <= 0) {
    const a = Math.atan2(p.y - e.y, p.x - e.x);
    e.a0 = a - e.orbit * def.arc; e.a1 = a + e.orbit * def.arc;
    e.state = 'windup'; e.t = def.windup;
  }
}

// The Moss Idol: stone while it's lit (foeLit); out of the light it comes
// on, and close enough, pounces. A pounce begun is never stopped.
function updateIdol(d, e, pd, sp, dt, free) {
  const def = T.enemies.idol, p = d.p, f = d.floor;
  e.t -= dt;
  e.lit = foeLit(d, e);
  if (e.state === 'windup') { if (e.t <= 0) { const a = norm(e.aimX - e.x, e.aimY - e.y); e.vx = a.x * def.lungeSpeed; e.vy = a.y * def.lungeSpeed; e.state = 'lunge'; e.t = def.lungeTime; e.hitDone = false; } return; }
  if (e.state === 'lunge') {
    moveBody(f, e, e.vx * dt, e.vy * dt, e.r);
    if (!e.hitDone && dist(e.x, e.y, p.x, p.y) < e.r + T.player.radius + 3) { e.hitDone = true; hurtPlayer(e.dmg, e); }
    if (e.t <= 0) { e.state = 'recover'; e.t = def.recover; }
    return;
  }
  if (e.state === 'recover') { if (e.t <= 0) { e.state = 'still'; e.cd = def.cooldown; } return; }
  if (e.lit || !e.aggro) { e.state = 'still'; return; }
  e.state = 'creep';
  if (pd < def.pounce && free && e.cd <= 0 && clearLine(f, e.x, e.y, p.x, p.y)) { e.state = 'windup'; e.t = def.windup; e.aimX = p.x; e.aimY = p.y; return; }
  const w = wayToPlayer(d, e);
  moveBody(f, e, w.x * sp, w.y * sp, e.r);
}
// Is an idol lit? In a shaft of daylight, or near enough the diver's lamp
// (the heart of its reach, litReach of it) and in its sight: the lamp's
// own sight from shadow.js where the view is on this floor, so what looks
// lit is lit, else a line through the tiles.
function foeLit(d, e) {
  const def = T.enemies.idol, f = d.floor, p = d.p;
  for (const s of f.foeShafts || (f.foeShafts = climeLights(f))) if (dist(e.x, e.y, s.x, s.y) < s.r * def.shaftReach) return true;
  const lv = lampLevels(d);
  if (lv.lamp <= 0 || dist(e.x, e.y, p.x, p.y) > (lv.r / AP) * def.litReach) return false;
  if (View.floorFor === f && View.rockPx && T.light.shadow.walls) {
    const S = lampSight(d, lv.r);
    if (S) { const i = Math.floor((e.x * AP) / LC) - S.x0, j = Math.floor(((e.y - 2) * AP) / LC) - S.y0; return i >= 0 && j >= 0 && i < S.w && j < S.w && S.vis[j * S.w + i] >= 1; }
  }
  return clearLine(f, p.x, p.y - 6, e.x, e.y - 6);
}

// The Gear Hound: winds its key (its whole run shows, bounces and all),
// runs, glances off the walls, and runs down, spent.
function updateHound(d, e, pd, sp, dt, free) {
  const def = T.enemies.hound, p = d.p, f = d.floor;
  if (e.state === 'charge') {
    const r = houndStep(f, e, dt);
    if (r === 'bounce') d.fx.push({ kind: 'foeBurst', x: e.x, y: e.y, r: 6, t: 0.2, max: 0.2, col: FOE_PAL.hound.horn[3], glow: true });
    if (!e.hitDone && dist(e.x, e.y, p.x, p.y) < e.r + T.player.radius + 3) { e.hitDone = true; hurtPlayer(e.dmg, e); }
    if (r === 'done') { e.state = 'spent'; e.t = def.spent; }
    return;
  }
  e.t -= dt;
  if (e.state === 'windup') {
    if (e.t <= 0) { const a = norm(e.aimX - e.x, e.aimY - e.y); e.vx = a.x * def.dashSpeed; e.vy = a.y * def.dashSpeed; e.bounces = 0; e.state = 'charge'; e.t = def.dashTime; e.hitDone = false; }
    return;
  }
  if (e.state === 'spent') { if (e.t <= 0) { e.state = 'chase'; e.cd = def.cooldown; } return; }
  e.state = 'chase';
  if (pd < def.range && e.cd <= 0 && free && clearLine(f, e.x, e.y, p.x, p.y)) {
    e.state = 'windup'; e.t = def.windup; e.aimX = p.x; e.aimY = p.y;
    e.path = houndPath(f, e);
    return;
  }
  if (pd > e.r + 10) { const w = wayToPlayer(d, e); moveBody(f, e, w.x * sp, w.y * sp, e.r); }
}
// One step of a hound's run, for the hound or for the run it shows: b { x,
// y, r, vx, vy, t, bounces }. Into the rock it glances off (the wall's
// normal felt round its body) until it has `bounces` times: then 'done', as
// when its time is up; 'bounce' when it glances.
function houndStep(f, b, dt) {
  const def = T.enemies.hound;
  if ((b.t -= dt) <= 0) return 'done';
  const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
  if (!bodyHits(f, nx, ny, b.r)) { b.x = nx; b.y = ny; return null; }
  if (b.bounces >= def.bounces) return 'done';
  let wx = 0, wy = 0;
  for (const [c, s] of BODY_RING) if (rockAt(f, nx + c * b.r, ny + s * b.r)) { wx -= c; wy -= s; }
  const m = Math.hypot(wx, wy), dot = m > 0.01 ? (b.vx * wx + b.vy * wy) / m : 0;
  if (dot < 0) { b.vx -= (2 * dot * wx) / m; b.vy -= (2 * dot * wy) / m; } else { b.vx = -b.vx; b.vy = -b.vy; }
  b.bounces++;
  return 'bounce';
}
// The run a hound will make: its corners (start, each bounce, the end).
function houndPath(f, e) {
  const def = T.enemies.hound, a = norm(e.aimX - e.x, e.aimY - e.y);
  const b = { x: e.x, y: e.y, r: e.r, vx: a.x * def.dashSpeed, vy: a.y * def.dashSpeed, t: def.dashTime, bounces: 0 }, pts = [b.x, b.y], hits = [];
  for (let n = 0; n < 200; n++) { const r = houndStep(f, b, 1 / 60); if (r === 'bounce') { pts.push(b.x, b.y); hits.push(b.x, b.y); } if (r === 'done') break; }
  pts.push(b.x, b.y);
  return { pts, hits };
}

const FOE_UPDATE = { skink: updateSkink, tusker: updateTusker, wraith: updateWraith, lurker: updateLurker, dropper: updateDropper, eel: updateEel, crab: updateCrab, weaver: updateWeaver, sentinel: updateSentinel, idol: updateIdol, hound: updateHound };

// ---------------------------------------------------------------------------
// How they look (render.js drawEnemy asks foeLook, then draws the tells)
// ---------------------------------------------------------------------------

// The sprite for one's state, how high it floats, whether it's out of
// sight (drawn as its sign instead), and the light of its eyes.
function foeLook(d, e) {
  const t = e.type, s = e.state, walk = Math.floor(e.bob * 6) % 2, still = s === 'windup' || s === 'sweep';
  let frame = 'idle', variant = null, lift = 0, hidden = e.hid;
  if (t === 'skink') frame = s === 'up' ? (e.t > T.enemies.skink.up - 0.35 ? 'attack' : ['idle', 'move', 'idle', 'move2'][Math.floor(e.bob * 10) % 4]) : s === 'dig' ? 'dig' : 'idle';
  else if (t === 'tusker') frame = s === 'windup' ? 'windup' : s === 'charge' || s === 'slide' ? 'charge' : s === 'chase' && walk ? 'move' : 'idle';
  else if (t === 'wraith') { frame = s === 'rise' ? 'rise' : s === 'windup' ? 'windup' : s === 'spent' ? 'spent' : walk ? 'move' : 'idle'; lift = s === 'spent' || s === 'rise' ? 0 : 4 + Math.round(Math.sin(e.bob * 3) * 1.5); }
  else if (t === 'lurker') frame = s === 'windup' ? 'windup' : e.lashT > 0 ? 'attack' : (e.bob % 3.2) < 0.15 ? 'blink' : 'idle';
  else if (t === 'dropper') frame = s === 'landed' ? 'drop' : s === 'windup' || s === 'lunge' ? 'windup' : (s === 'chase' || s === 'circle') && walk ? 'move' : 'idle';
  else if (t === 'eel') frame = s === 'windup' || s === 'surface' ? 'rear' : s === 'lunge' ? 'lunge' : Math.floor(e.bob * (s === 'stranded' ? 8 : 3)) % 2 ? 'stranded2' : 'stranded';
  else if (t === 'crab') { frame = s === 'windup' || s === 'lunge' ? 'windup' : (s === 'chase' || s === 'circle') && walk ? 'move' : 'idle'; variant = e.cracked > 0 ? 'cracked' : e.slowT > 0 ? 'frozen' : null; }
  else if (t === 'weaver') frame = s === 'windup' || s === 'weave' ? 'windup' : walk ? 'move' : 'idle';
  else if (t === 'sentinel') { frame = s === 'windup' ? 'windup' : s === 'sweep' ? 'sweep' : (e.bob % 2.6) < 0.6 ? 'look' : 'idle'; lift = 7 + Math.round(Math.sin(e.bob * 2.4) * 1.5); }
  else if (t === 'idol') frame = s === 'windup' ? 'windup' : s === 'lunge' ? 'lunge' : s === 'creep' ? (walk ? 'creep2' : 'creep') : 'still';
  else if (t === 'hound') frame = s === 'windup' ? (Math.floor(e.t * 10) % 2 ? 'wind' : 'wind2') : s === 'charge' ? 'dash' : s === 'spent' ? 'spent' : walk ? 'move' : 'idle';
  // the tusker, the hound and the idol are drawn side on: they face their
  // way (an idol in the light is stone, and keeps the way it faced)
  if (t === 'tusker' || t === 'hound' || t === 'idol') {
    const dx = s === 'charge' || s === 'slide' || s === 'lunge' ? e.vx : s === 'windup' ? e.aimX - e.x : d.p.x - e.x;
    if (Math.abs(dx) > 3 && !(t === 'idol' && (s === 'still' || s === 'recover'))) e.face = dx < 0 ? -1 : 1;
    if (e.face < 0) variant = 'flip';
  }
  // the idol in the light, and anything spent, is dark-eyed
  const dim = (t === 'idol' && (s === 'still' || s === 'recover')) || s === 'spent';
  return {
    spr: hidden ? null : foeSprite(t, frame, variant), lift, hidden, still,
    glow: FOE_GLOW[t], light: dim ? 0 : t === 'tusker' ? 1.2 : 0.9, walk: (s === 'chase' || s === 'creep') && !T.enemies[t].flies,
    noShadow: T.enemies[t].anchored || t === 'eel',
  };
}

// A dashed line of a tell from x0, y0 to x1, y1 (art px on the view): red
// dashes two pixels long, each with a dark pixel under it, so it reads on
// snow and sand as well as in the dark.
function foeTellLine(x0, y0, x1, y1, alpha, from = 0) {
  const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / ap(3))), ux = (x1 - x0) / n, uy = (y1 - y0) / n, m = Math.hypot(ux, uy) || 1;
  for (let k = from; k <= n; k++) {
    const x = Math.round(x0 + ux * k), y = Math.round(y0 + uy * k), x2 = Math.round(x0 + ux * k + ux / m), y2 = Math.round(y0 + uy * k + uy / m), a = alpha * (1 - (k / n) * 0.4);
    dot(x, y + 1, '#3a0408', false, a); dot(x2, y2 + 1, '#3a0408', false, a);
    dot(x, y, FOE_TELL, true, a); dot(x2, y2, FOE_TELL, true, a);
  }
}

// What shows of one out of sight: a skink's mound, an eel's fin and its
// ripples, a wraith's smouldering fissure. (A dropper on the roof shows
// nothing until its shadow.)
function drawFoeHidden(d, e, ox, oy, tick, lights) {
  const fx = Math.round(e.x * AP) + ox, fy = Math.round(e.y * AP) + oy;
  if (fx < -40 || fy < -40 || fx > View.w + 40 || fy > View.h + 40) return;
  if (e.type === 'skink') {
    const moving = e.state === 'windup' || (e.aggro && dist(e.x, e.y, Game.dive.p.x, Game.dive.p.y) > T.enemies.skink.strike);
    const spr = foeSprite('skink', moving && Math.floor(e.bob * 8) % 2 ? 'mound2' : 'mound');
    drawArtSprite(spr, Math.round(fx - spr.ax), Math.round(fy - spr.ay));
    if (moving && tick % 2) dot(fx + ap(FX_R.i(-6, 6)), fy - ap(FX_R.i(0, 3)), FOE_PAL.skink.sand[3], false, 0.8);
    lights.push({ x: fx, y: fy - ap(3), r: 0.6 * TILE, i: 0.4, c: rgb01(FOE_GLOW.skink) });
  } else if (e.type === 'eel') {
    const spr = foeSprite('eel', 'fin');
    drawArtSprite(spr, Math.round(fx - spr.ax), Math.round(fy - spr.ay));
    const col = (artBiome(d.floor).haz || HAZ_RAMPS.pool)[3];
    for (let k = 0; k < 2; k++) {
      const ph = (Game.realT * 0.9 + k * 0.5) % 1, rr = (4 + ph * 8) * AP, n = Math.round(rr * 2);
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; dot(Math.round(fx + Math.cos(a) * rr), Math.round(fy + Math.sin(a) * rr * 0.45), col, false, 0.6 * (1 - ph)); }
    }
    for (const [i, j] of [[-ap(4), -1], [ap(4), -2]]) dot(fx + i, fy + j, FOE_PAL.eel.core[0], true, 0.6 + 0.4 * Math.sin(Game.realT * 4 + i));
  }
}

// Under everything that stands: a lurker's mire, the roots a weaver has
// strung, a dropper's shadow growing on the floor, the rings where a skink
// will come up, a wraith's fissure.
function drawFoesUnder(d, ox, oy, tick, lights) {
  const vx = (wx) => Math.round(wx * AP) + ox, vy = (wy) => Math.round(wy * AP) + oy, x = View.ctx, blink = tick % 2 ? 0.8 : 0.45;
  for (const s of d.snares || []) {
    // two strands of root, twisted, with knots, faintly lit
    const x0 = vx(s.x0), y0 = vy(s.y0), x1 = vx(s.x1), y1 = vy(s.y1), n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0))), k = Math.min(1, s.t / 0.8, (s.max - s.t) / 0.3 + 0.2);
    for (let i = 0; i <= n; i++) {
      const u = i / n, px = x0 + (x1 - x0) * u, py = y0 + (y1 - y0) * u, w = Math.sin(u * Math.PI * 6) * 1.2;
      dot(Math.round(px), Math.round(py + w), FOE_PAL.weaver.hide[1], false, k);
      dot(Math.round(px), Math.round(py - w - 1), FOE_PAL.weaver.hide[2], false, k);
      if (i % 9 === 4) dot(Math.round(px), Math.round(py - 1), FOE_PAL.weaver.core[0], true, k * (0.5 + 0.3 * Math.sin(Game.realT * 3 + i)));
    }
    for (const [ex, ey] of [[x0, y0], [x1, y1]]) for (const [i, j] of [[0, 0], [1, 0], [0, -1], [-1, 0], [0, 1]]) dot(ex + i, ey + j, FOE_PAL.weaver.hide[0], false, k);
  }
  for (const e of d.enemies) {
    if (e.dead || !FOE_NAMES[e.type]) continue;
    const fx = vx(e.x), fy = vy(e.y);
    if (fx < -60 || fy < -40 || fx > View.w + 60 || fy > View.h + 40) continue;
    if (e.type === 'lurker') {
      // its mire: still dark water round it, a pale rim, a ripple now and then
      const rx = ap(13), ry = ap(5);
      x.fillStyle = '#1a1220';
      for (let j = -ry; j <= ry; j++) { const w = Math.round(rx * Math.sqrt(1 - (j / (ry + 0.5)) ** 2)); x.fillRect(fx - w, fy + j - ap(2), w * 2 + 1, 1); }
      x.fillStyle = '#2e2434';
      for (let j = -ry + 2; j <= ry - 2; j++) { const w = Math.round((rx - 3) * Math.sqrt(1 - (j / (ry - 1.5)) ** 2)); if (w > 0) x.fillRect(fx - w, fy + j - ap(2), w * 2 + 1, 1); }
      const ph = (Game.realT * 0.5 + e.x * 0.01) % 1;
      if (ph < 0.6) for (let i = -ap(8); i <= ap(8); i += 2) dot(fx + i, fy - ap(2) + Math.round(ry * 0.6 * ph), '#6a5a70', false, 0.6 * (1 - ph / 0.6));
    } else if (e.type === 'dropper' && e.hid && e.state === 'windup') {
      // its shadow, growing as it lets go, and the red ring of where it lands
      const def = T.enemies.dropper, k = 1 - Math.max(0, e.t) / def.fall, ax = vx(e.aimX), ay = vy(e.aimY), r = def.drop * AP * (0.35 + 0.65 * k), ry = r * 0.6;
      x.fillStyle = `rgba(0,0,0,${(0.25 + 0.35 * k).toFixed(2)})`;
      for (let j = -Math.floor(ry); j <= Math.floor(ry); j++) { const w = Math.round(r * Math.sqrt(Math.max(0, 1 - (j / (ry + 0.5)) ** 2))); if (w > 0) x.fillRect(ax - w, ay + j, w * 2 + 1, 1); }
      ringDots(ax, ay, def.drop * AP, FOE_TELL, blink * (0.5 + 0.5 * k), true);
    } else if (e.type === 'skink' && e.state === 'windup') {
      // rings in the sand closing on the spot, and its reach in red
      const def = T.enemies.skink, ax = vx(e.aimX), ay = vy(e.aimY);
      for (let n = 0; n < 2; n++) { const ph = (Game.realT * 1.6 + n * 0.5) % 1; ringDots(ax, ay, (def.burst * (1.6 - ph)) * AP, FOE_PAL.skink.sand[3], 0.7 * ph, false); }
      ringDots(ax, ay, def.burst * AP, FOE_TELL, blink, true);
    } else if (e.type === 'wraith' && e.state === 'dormant') {
      // a crack in the ash, smouldering
      for (let i = -ap(6); i <= ap(6); i++) dot(fx + i, fy + Math.round(Math.sin(i * 0.9) * 1.2), i % 3 ? FOE_PAL.wraith.core[0] : FOE_PAL.wraith.flame[0], true, 0.55 + 0.25 * Math.sin(Game.realT * 2 + i));
      const ph = (Game.realT * 0.7 + e.x * 0.03) % 1;
      dot(fx + Math.round(Math.sin(ph * 6) * 3), fy - Math.round(ph * ap(14)), FOE_PAL.wraith.flame[0], true, 1 - ph);
      lights.push({ x: fx, y: fy, r: TILE * 0.9, i: 0.35, c: rgb01(FOE_PAL.wraith.core[0]) });
    }
  }
}

// Over one that's in sight: its tell, and what its mechanic shows.
function drawFoeTells(d, e, fx, fy, sy, tick, lights, ox, oy) {
  const def = T.enemies[e.type], s = e.state, blink = tick % 2 ? 0.8 : 0.45;
  const vx = (wx) => Math.round(wx * AP) + ox, vy = (wy) => Math.round(wy * AP) + oy;
  if (s === 'windup' && e.path && (e.type === 'tusker' || e.type === 'hound')) {
    // the whole run: a tusker's to where it stops (a ring where it slams),
    // a hound's with a ring at every wall it will glance off
    const P = e.path.pts;
    for (let i = 2; i < P.length; i += 2) foeTellLine(vx(P[i - 2]), vy(P[i - 1]), vx(P[i]), vy(P[i + 1]), blink, i === 2 ? 2 : 1);
    if (e.type === 'tusker' && e.path.wall) ringDots(vx(P[P.length - 2]), vy(P[P.length - 1]), 6 * AP, FOE_TELL, blink, true);
    if (e.path.hits) for (let i = 0; i < e.path.hits.length; i += 2) ringDots(vx(e.path.hits[i]), vy(e.path.hits[i + 1]), 4 * AP, FOE_TELL, blink, true);
  } else if (s === 'windup' && (e.type === 'eel' || e.type === 'idol' || e.type === 'dropper' || e.type === 'crab')) {
    const reach = def.lungeSpeed * def.lungeTime, a = norm(e.aimX - e.x, e.aimY - e.y);
    foeTellLine(fx, fy, Math.round(fx + a.x * reach * AP), Math.round(fy + a.y * reach * AP), blink, 2);
  } else if (s === 'windup' && e.type === 'lurker') {
    const a = norm(e.aimX - e.x, e.aimY - e.y);
    foeTellLine(fx, fy - ap(3), Math.round(fx + a.x * e.reach * AP), Math.round(fy - ap(3) + a.y * e.reach * AP), blink, 1);
  } else if (s === 'windup' && e.type === 'weaver') {
    const a = norm(e.aimX - e.x, e.aimY - (e.y - 5));
    foeTellLine(fx, fy - ap(5), Math.round(fx + a.x * 22 * AP), Math.round(fy - ap(5) + a.y * 22 * AP), blink, 2);
  } else if (s === 'weave' && e.snare) {
    foeTellLine(vx(e.snare.x0), vy(e.snare.y0), vx(e.snare.x1), vy(e.snare.y1), blink);
  } else if (s === 'windup' && e.type === 'wraith') {
    ringDots(fx, fy, def.burst * AP, FOE_TELL, blink, true);
  } else if (e.type === 'sentinel' && (s === 'windup' || s === 'sweep')) {
    const ex = fx, ey = sy + ap(9);
    if (s === 'windup') {
      // the arc it will sweep: its edge, and the line it starts from
      const R = def.range * 0.55 * AP;
      for (let k = 0, n = 18; k <= n; k++) { const a = lerp(e.a0, e.a1, k / n); dot(Math.round(fx + Math.cos(a) * R), Math.round(fy + Math.sin(a) * R), FOE_TELL, true, blink * 0.8); }
      const L = foeRay(d.floor, e.x, e.y, Math.cos(e.a0), Math.sin(e.a0), def.range);
      foeTellLine(fx, fy, vx(e.x + Math.cos(e.a0) * L), vy(e.y + Math.sin(e.a0) * L), blink, 1);
    } else {
      // the beam: from the eye down to the floor and along it to the rock
      const L = e.beamL || 0, bx = vx(e.x + Math.cos(e.beamA) * L), by = vy(e.y + Math.sin(e.beamA) * L);
      pixelLineGlow(ex, ey, fx, fy, FOE_PAL.sentinel.core[0]);
      pixelLineGlow(fx, fy, bx, by, FOE_PAL.sentinel.eye[0]);
      for (const [i, j] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) dot(bx + i, by + j, i || j ? FOE_PAL.sentinel.eye[0] : '#ffffff', true);
      lights.push({ x: bx, y: by, r: TILE * 0.9, i: 0.8, c: rgb01(FOE_PAL.sentinel.eye[0]) });
    }
  }
  // a crab's cracked shell smokes a little
  if (e.type === 'crab' && e.cracked > 0 && tick % 3 === 0) dot(fx + ap(FX_R.i(-5, 5)), sy + ap(FX_R.i(0, 4)), FOE_PAL.crab.core[0], true, 0.8);
}
// A line of light a pixel wide (a sentinel's beam).
function pixelLineGlow(x0, y0, x1, y1, col) {
  const n = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let k = 0; k <= n; k++) dot(Math.round(x0 + ((x1 - x0) * k) / n), Math.round(y0 + ((y1 - y0) * k) / n), col, true, 0.9);
}

// Their effects: a burst of sand, embers or rubble; a lurker's tongue.
function drawFoeFx(fx, ox, oy, tick, lights) {
  const k = fx.t / fx.max, cx = Math.round(fx.x * AP) + ox, cy = Math.round(fx.y * AP) + oy;
  if (fx.kind === 'foeBurst') {
    ringDots(cx, cy, fx.r * (1.1 - k * 0.6) * AP, fx.col, k, !!fx.glow);
    for (let n = 0; n < 10; n++) { const a = n * 0.63 + fx.x, r = (1 - k) * fx.r * AP * (0.6 + (n % 3) * 0.2); dot(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * 0.7 - (1 - k) * ap(4)), fx.col, !!fx.glow, k); }
    if (fx.glow) lights.push({ x: cx, y: cy, r: fx.r * 1.4, i: 0.9 * k, c: rgb01(fx.col) });
  } else if (fx.kind === 'foeTongue') {
    // out and back
    const u = k > 0.5 ? (1 - k) * 2 : k * 2, x0 = cx, y0 = cy - ap(3), x1 = Math.round(fx.x2 * AP) + ox, y1 = Math.round(fx.y2 * AP) + oy - ap(3);
    const ex = Math.round(x0 + (x1 - x0) * u), ey = Math.round(y0 + (y1 - y0) * u), n = Math.max(1, Math.round(Math.hypot(ex - x0, ey - y0)));
    for (let i = 0; i <= n; i++) { const px = Math.round(x0 + ((ex - x0) * i) / n), py = Math.round(y0 + ((ey - y0) * i) / n); dot(px, py, '#c04a6a', false); dot(px, py + 1, '#7a2a44', false); }
    for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0]]) dot(ex + i, ey + j, FOE_PAL.lurker.core[0], true);
  }
}
