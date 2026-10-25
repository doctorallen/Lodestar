'use strict';
// ---------------------------------------------------------------------------
// Enemies. Each floor's are placed from its own seed when it's entered: a
// few in every room but the entry, more with depth, some of them elites,
// and now and then the warden in a side room. They wake when they see the
// diver (or are hit) and find their way through the corridors along a
// flow field: steps on foot to the diver from every tile, rebuilt
// whenever the diver crosses into a new tile.
//   crawler: closes in, circles, crouches (eyes flaring), lunges and bites,
//     then recovers, open to a counter.
//   wisp: keeps its distance, strafing, and fires slow orbs (three, deeper).
//   construct: shows the line it will charge along, then charges; one that
//     hits a wall is dazed.
//   warden: a great construct that charges and bursts orbs in a ring.
//   snapjaw: a rooted plant that glows red and snaps at what comes close.
//   spitter: a rooted plant that lobs globs, leaving spores on the ground.
//   hollow: what comes when the star's pull on a floor is gone; it hunts.
// And each clime's own creature, a share of what's met there (foes.js).
// Only a couple wind up at once; the rest circle, waiting their turn. Hits
// knock them back, and heavy ones stagger them out of an attack. All of
// them run on world time (dt × Game.timeScale).
// ---------------------------------------------------------------------------

// Elites' affixes (T.enemies.elites: how often each). Insulated and
// Fireproof shrug off Shock and Ember, a Warded one resists everything until
// Force cracks its shell, a Shifting one's weakness moves on (natures.js).
// (the affixes themselves: affixes.js, ELITE_AFFIX and rollEliteAffix)
const ELITE_NAMES = Object.fromEntries(Object.keys(ELITE_AFFIX).map((id) => [id, ELITE_AFFIX[id].name]));

// (in dark land, and under it, the dark has grown with the star: frontier.js)
function floorLevel(d) {
  return d.biome * T.levelPerBiome + d.depth + (d.zone === 'lair' ? 1 : 0);
}

// The first levels' share of an enemy's health (T.enemies.hpEarly): the
// Rim is for learning.
function enemyEarlyHp(type, level) {
  const E = T.enemies;
  if (type === 'hollow' || type === 'dummy') return 1;
  return Math.min(1, E.hpEarly + ((1 - E.hpEarly) * Math.max(0, level - 1)) / (E.hpFullAt - 1));
}

// elite: its affixes (affixes.js), a list, or one, or none; e.elite is the
// first (its pip's colour), e.affixes all of them.
function makeEnemy(type, x, y, level, elite) {
  const E = T.enemies, def = E[type], boss = type === 'warden' || type === 'keeper', plain = type !== 'dummy' && type !== 'hollow';
  const affixes = Array.isArray(elite) ? elite.slice() : elite ? [elite] : [];
  elite = affixes[0] || null;
  // (fewer and tougher: a regular kind's health and every kind's damage
  // are scaled up, T.enemies.hpScale and dmgScale; bosses keep their own
  // health, the practice dummy its own everything)
  const early = enemyEarlyHp(type, level);
  const hpMul = Math.pow(E.hpGrowth, level - 1) * early * (elite ? E.eliteHp * (affixes.includes('tough') ? E.tough : 1) : 1) * (plain && !boss ? E.hpScale : 1);
  const hp = Math.round(def.hp * hpMul);
  const e = {
    type, x, y, hp, maxHp: hp, r: def.radius, level, elite, affixes, boss,
    // (the Rim's handicap, `early`, eases a regular foe's damage too)
    dmg: def.dmg * Math.pow(E.dmgGrowth, level - 1) * (elite ? E.eliteDmg : 1) * (type !== 'dummy' ? E.dmgScale : 1) * (plain && !boss ? early : 1),
    speed: def.speed,
    state: 'idle', t: 0, cd: 0, aggro: false, flash: 0, slowT: 0, stunT: 0, kx: 0, ky: 0, kvx: 0, kvy: 0, hitDone: false, bob: 0,
    burst: false, dead: false, orbit: (Math.floor(x + y) & 1) * 2 - 1,
  };
  natureAffixStart(e);
  affixStart(e);
  if (FOE_NAMES[type]) foeInit(e);
  return e;
}

function spawnEnemies(d) {
  const f = d.floor, E = T.enemies, level = floorLevel(d);
  const rng = new Rng(hashInts(d.seed, d.depth, d.biome, 0xe1e));
  d.enemies = [];
  const inRoom = (r) => { const i = rng.pick(r.cells); return { x: ((i % f.w) + 0.5) * TILE, y: (Math.floor(i / f.w) + 0.5) * TILE }; };
  const types = ['crawler', 'wisp', 'construct', 'snapjaw', 'spitter'].filter((t) => !E[t].minDepth || d.depth >= E[t].minDepth);
  const zoneWeight = (T.zones[d.zone] && T.zones[d.zone].enemies) || {};
  const eliteChance = Math.min(E.eliteMax, E.eliteBase + E.eliteDepth * d.depth);
  // the warden takes a side room: not the entry, a portal's or the lodeline's
  let bossRoom = null;
  const zoneDef = T.zones[d.zone] || {};
  const wardenChance = zoneDef.warden !== undefined ? zoneDef.warden : d.depth >= E.bossDepth && d.zone !== 'lair' ? E.bossChance : 0;
  if (rng.chance(wardenChance)) {
    const side = f.rooms.slice(1).filter((r) => !r.arena && !(f.ways || []).some((w) => roomHas(r, w)) && !(f.pad && roomHas(r, f.pad)) && r.w >= 5 && r.h >= 5);
    if (side.length) bossRoom = rng.pick(side);
  }
  // the biome's Keeper, at its depth, until its shard is taken: it guards
  // its arena
  const id = T.biomes[d.biome].id;
  if (d.zone === 'lair' && f.arena && !(Save.data.shards || []).includes(d.biome)) {
    const k = makeEnemy('keeper', (f.arena.cx + 0.5) * TILE, (f.arena.cy - 1.5) * TILE, level + 1, null);
    k.home = id;
    if (bodyHits(f, k.x, k.y, k.r)) k.y = (f.arena.cy + 0.5) * TILE;
    d.enemies.push(k);
    d.keeper = k;
  }
  // a room's foes are composed, not rolled one by one: the first closes in
  // (a crawler or stalker, or the clime's own creature), the second keeps
  // off (a wisp or spitter), any more as they come, so a pair covers each
  // other. One room in eliteEvery is an elite's for sure (its module too)
  const melee = types.filter((t) => t === 'crawler' || t === 'construct'), ranged = types.filter((t) => t === 'wisp' || t === 'spitter');
  const pick = (list) => rng.weighted(list.map((t) => [E[t].weight * (zoneWeight[t] || 1), t]));
  const rooms = f.rooms.slice(1).filter((r) => !r.arena && r !== bossRoom), eliteRoom = rooms.length ? rooms[rng.i(0, rooms.length - 1)] : null, eliteStep = Math.max(1, E.eliteEvery || 3);
  let ri = 0;
  for (const r of f.rooms.slice(1)) {
    if (r.arena) continue;
    if (r === bossRoom) {
      const b = makeEnemy('warden', (r.cx + 0.5) * TILE, (r.cy + 0.5) * TILE, level + 1, null);
      d.enemies.push(b);
      continue;
    }
    const sure = level >= (E.eliteSureFrom || 1) && (r === eliteRoom || (ri++ % eliteStep === eliteStep - 1));
    // the room's clime (regions.js), whose own creature takes a share of it
    const clime = f.regions ? climeAt(f, r.cx, r.cy) : d.clime, sig = foeOfClime(clime);
    const n = Math.max(sure ? 1 : 0, clamp(Math.round(E.perRoom + E.perDepth * d.depth + E.perBiome * d.biome) + rng.i(-1, 1), 0, E.maxPerRoom));
    for (let k = 0; k < n; k++) {
      // (a signature that needs what the room hasn't got, its water, is
      // one of the common kind instead)
      const at = sig && rng.chance(E.signatureShare) ? foeSpot(d, sig, r, rng) : null;
      const type = at ? sig : k === 0 && melee.length ? pick(melee) : k === 1 && ranged.length ? pick(ranged) : pick(types);
      const elite = (k === 0 && sure) || rng.chance(eliteChance) ? rollEliteAffix(rng, type) : null;
      const e = makeEnemy(type, 0, 0, level, elite);
      e.clime = clime;
      if (k === 0 && sure) e.sure = true;
      if (at) { e.x = at.x; e.y = at.y; }
      // on clear ground, not half in a wall
      else for (let tries = 0; tries < 8; tries++) { const at = inRoom(r); e.x = at.x; e.y = at.y; if (!bodyHits(f, e.x, e.y, e.r) && !hazardNear(f, Math.floor(at.x / TILE), Math.floor(at.y / TILE), 0)) break; }
      d.enemies.push(e);
    }
  }
}

const roomHas = (r, t) => t.x >= r.x && t.x < r.x + r.w && t.y >= r.y && t.y < r.y + r.h;

// ---------------------------------------------------------------------------
// Getting about
// ---------------------------------------------------------------------------

// Steps on foot from the diver's tile to every tile, rebuilt when that
// tile changes.
function updateFlow(d) {
  const f = d.floor, i = Math.floor(d.p.y / TILE) * f.w + Math.floor(d.p.x / TILE);
  if (d.flowAt === i && d.flowFloor === f) return;
  d.flowAt = i; d.flowFloor = f;
  d.flow = floorDistances(f.tiles, f.w, f.h, i % f.w, Math.floor(i / f.w));
}

// Can x0,y0 see x1,y1? Walks the line in small steps through the tiles.
function clearLine(f, x0, y0, x1, y1) {
  const n = Math.ceil(dist(x0, y0, x1, y1) / 4);
  for (let k = 1; k < n; k++) {
    const x = x0 + ((x1 - x0) * k) / n, y = y0 + ((y1 - y0) * k) / n;
    if (TILE_SOLID[floorTile(f, Math.floor(x / TILE), Math.floor(y / TILE))]) return false;
  }
  return true;
}

// The way towards the diver from e: straight there when close and in
// sight, else towards the neighbouring tile nearest on foot.
function wayToPlayer(d, e) {
  const f = d.floor, p = d.p;
  if (dist(e.x, e.y, p.x, p.y) < 2 * TILE && clearLine(f, e.x, e.y, p.x, p.y)) return norm(p.x - e.x, p.y - e.y);
  const tx = Math.floor(e.x / TILE), ty = Math.floor(e.y / TILE), here = d.flow[ty * f.w + tx];
  let best = null, bd = here < 0 ? 1e9 : here;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    if (dx && dy && (TILE_SOLID[floorTile(f, tx + dx, ty)] || TILE_SOLID[floorTile(f, tx, ty + dy)])) continue;
    const v = d.flow[(ty + dy) * f.w + tx + dx];
    if (v >= 0 && v < bd) { bd = v; best = [dx, dy]; }
  }
  if (!best) return norm(p.x - e.x, p.y - e.y);
  return norm((tx + best[0] + 0.5) * TILE - e.x, (ty + best[1] + 0.5) * TILE - e.y);
}

function norm(x, y) { const m = Math.hypot(x, y) || 1; return { x: x / m, y: y / m }; }

// ---------------------------------------------------------------------------
// Each step
// ---------------------------------------------------------------------------
const ATTACKING = new Set(['windup', 'lunge', 'charge', 'slide', 'sweep', 'casting']);
// the kinds that close in to fight, and so take turns pressing the attack
const PRESSING_KINDS = new Set(['crawler', 'dropper', 'crab', 'construct']);

// Which of those may come in now: the nearest few awake (those already in
// first, so they don't trade places), the rest held off (e.press = false).
function choosePressers(d) {
  const E = T.enemies, p = d.p, most = E.press + Math.floor(E.pressPerBiome * d.biome), L = [];
  for (const e of d.enemies) {
    if (e.dead || !PRESSING_KINDS.has(e.type)) continue;
    if (!e.aggro || e.hid || e.wakeT > 0) { e.press = true; continue; }
    L.push(e);
  }
  if (L.length <= most) { for (const e of L) e.press = true; return; }
  const key = (e) => dist(e.x, e.y, p.x, p.y) - (e.press ? 24 : 0) - (ATTACKING.has(e.state) ? 1000 : 0);
  L.sort((a, b) => key(a) - key(b));
  L.forEach((e, i) => { e.press = i < most; });
}

function updateEnemies(dt) {
  const d = Game.dive, f = d.floor, p = d.p, E = T.enemies;
  updateFlow(d);
  if ((d.pruneT = (d.pruneT || 1) - dt) <= 0) { d.pruneT = 1; d.enemies = d.enemies.filter((e) => !e.dead); }
  let attackers = d.enemies.filter((e) => !e.dead && ATTACKING.has(e.state)).length;
  const most = E.attackers + Math.floor(E.attackersPerDepth * d.depth + E.attackersPerBiome * d.biome);
  choosePressers(d);
  updateFoeWorld(d, dt);
  const knockFade = Math.exp(-T.impact.knockDecay * dt), cull2 = (E.cull * TILE) * (E.cull * TILE);
  for (const e of d.enemies) {
    if (e.dead) continue;
    // (one far off and unaware rests: a large world holds many)
    if (!e.aggro && (e.x - p.x) * (e.x - p.x) + (e.y - p.y) * (e.y - p.y) > cull2) continue;
    e.flash = Math.max(0, e.flash - dt);
    e.slowT = Math.max(0, e.slowT - dt);
    // statuses wearing off (reactions.js), a shifting weakness (natures.js)
    reactTick(e, dt);
    natureAffixTick(e, dt);
    affixTick(d, e, dt);
    // burning and blight eat at them, a number now and then
    for (const k of ['burn', 'blight']) {
      const dot = e[k];
      if (!dot) continue;
      dot.t -= dt; e.hp -= dot.dps * dt; dot.tick = (dot.tick || 0) - dt;
      if (dot.tick <= 0) { dot.tick = 0.5; d.nums.push({ x: e.x, y: e.y - 16, v: Math.max(1, Math.round(dot.dps * 0.5)), t: 0.5, elem: k }); }
      if (dot.t <= 0) e[k] = null;
      if (e.hp <= 0 && e.type !== 'dummy') { killEnemy(e); break; }
      if (e.type === 'dummy' && e.hp <= 0) e.hp = e.maxHp;
    }
    if (e.dead) continue;
    e.cd = Math.max(0, e.cd - dt);
    e.bob += dt;
    // a ward it cast (foecast.js), fading
    if (e.wardS && e.ward > 0 && (e.wardT -= dt) <= 0) { e.ward = 0; wardGone(e); }
    // knocked back
    if (T.enemies[e.type].rooted || T.enemies[e.type].anchored || e.hid) e.kvx = e.kvy = 0;
    if (Math.abs(e.kvx) + Math.abs(e.kvy) > 1) { moveBody(f, e, e.kvx * dt, e.kvy * dt, e.r); e.kvx *= knockFade; e.kvy *= knockFade; }
    const pd = dist(e.x, e.y, p.x, p.y);
    const sees = pd < E.aggro && clearLine(f, e.x, e.y, p.x, p.y - 6);
    if (!e.aggro && !d.dying && sees) wake(d, e);
    // woken by another: it looks about a moment before it comes (sooner if
    // it sees the diver close)
    if (e.wakeT > 0) { e.wakeT -= sees && pd < E.aggro * 0.6 ? dt * 3 : dt; if (e.wakeT > 0) continue; }
    // struck: it holds still a moment as the hit lands
    if (e.hitT > 0) { e.hitT -= dt; continue; }
    // dragged by a Lodestone Pull, or stunned
    if (e.stunT > 0) {
      e.stunT -= dt;
      moveBody(f, e, e.kx * dt, e.ky * dt, e.r);
      e.kx *= 0.85; e.ky *= 0.85;
      continue;
    }
    if (!e.aggro || d.dying || e.type === 'dummy') continue;
    // lost in steam, or blinded: it wanders, and doesn't attack
    if (e.lostT > 0) {
      e.lostT -= dt;
      if (!T.enemies[e.type].rooted) moveBody(f, e, Math.cos(e.bob * 1.7 + e.orbit) * e.speed * 0.35 * dt, Math.sin(e.bob * 1.3) * e.speed * 0.35 * dt, e.r);
      continue;
    }
    if (e.state === 'stagger' || e.state === 'dazed') { if ((e.t -= dt) <= 0) { e.state = 'chase'; e.cd = Math.max(e.cd, 0.3); } continue; }
    const slow = (e.slowT > 0 ? 1 - T.onHit.chillSlow : 1) * hazardSlow(f, e);
    const sp = e.speed * slow * dt, free = attackers < most || ATTACKING.has(e.state);
    const was = ATTACKING.has(e.state);
    // a cast of its nature's, now and then (foecast.js)
    if (foeCastUpdate(d, e, pd, dt, free)) { if (!was) attackers++; continue; }
    if (e.type === 'crawler') updateCrawler(d, e, pd, sp, dt, free);
    else if (e.type === 'wisp') updateWisp(d, e, pd, sp, dt, free);
    else if (e.type === 'snapjaw' || e.type === 'spitter') updatePlant(d, e, pd, dt);
    else if (e.type === 'hollow') updateHollow(d, e, pd, sp);
    else if (e.type === 'keeper') updateKeeper(d, e, pd, sp, dt, free);
    else if (FOE_NAMES[e.type]) updateFoe(d, e, pd, sp, dt, free);
    else updateCharger(d, e, pd, sp, dt, free);
    if (!was && ATTACKING.has(e.state)) attackers++;
  }
  // keep them from stacking up on each other (those near enough to matter)
  const L = d.enemies.filter((e) => !e.dead && !e.hid && (e.x - p.x) * (e.x - p.x) + (e.y - p.y) * (e.y - p.y) <= cull2);
  for (let i = 0; i < L.length; i++)
    for (let j = i + 1; j < L.length; j++) {
      const a = L[i], b = L[j];
      const dx = b.x - a.x, dy = b.y - a.y, m = Math.hypot(dx, dy), min = a.r + b.r;
      if (m > 0.01 && m < min) {
        const push = (min - m) / 2;
        moveBody(f, a, (-dx / m) * push, (-dy / m) * push, a.r);
        moveBody(f, b, (dx / m) * push, (dy / m) * push, b.r);
      }
    }
  updateEnemyShots(dt);
  updateGlobs(dt);
}

// Waking one wakes the others nearby, each after a moment of its own
// (T.enemies.wakeStagger), so a pack comes in ones and twos. `heard`: woken
// by a noise, not by seeing the diver, so it waits too.
function wake(d, e, heard) {
  if (e.aggro) return;
  e.aggro = true;
  // (Wick's word on each affix, the first time: story.js)
  for (const id of e.affixes || []) Story.say('affix_' + id);
  e.cd = Math.max(e.cd, 0.3);
  const W = T.enemies.wakeStagger, late = () => d.rng.f(W[0], W[1]);
  if (heard) e.wakeT = late();
  for (const o of d.enemies) if (!o.aggro && !o.dead && dist(o.x, o.y, e.x, e.y) < 3 * TILE) { o.aggro = true; o.cd = Math.max(o.cd, 0.5); o.wakeT = late(); }
}

// Round the diver at radius r, drifting in or out to hold it.
function orbitMove(d, e, r, sp) {
  const p = d.p, dx = e.x - p.x, dy = e.y - p.y, m = Math.hypot(dx, dy) || 1;
  const tx = (-dy / m) * e.orbit, ty = (dx / m) * e.orbit, k = clamp((r - m) / r, -1, 1);
  const v = norm(tx + (dx / m) * k * 1.5, ty + (dy / m) * k * 1.5);
  const ox = e.x, oy = e.y;
  moveBody(d.floor, e, v.x * sp, v.y * sp, e.r);
  // a wall in the way: go round the other way
  if (Math.hypot(e.x - ox, e.y - oy) < sp * 0.3) e.orbit = -e.orbit;
}

// (a Ceiling Dropper and a Slag Crab fight this way too, with their own
// numbers: def; side, how fast they circle)
function updateCrawler(d, e, pd, sp, dt, free, def = T.enemies.crawler) {
  const p = d.p, f = d.floor;
  e.t -= dt;
  if (e.state === 'windup') {
    if (e.t <= 0) {
      const a = norm(e.aimX - e.x, e.aimY - e.y);
      e.vx = a.x * def.lungeSpeed; e.vy = a.y * def.lungeSpeed;
      e.state = 'lunge'; e.t = def.lungeTime; e.hitDone = false;
    }
    return;
  }
  if (e.state === 'lunge') {
    moveBody(f, e, e.vx * dt, e.vy * dt, e.r);
    if (!e.hitDone && dist(e.x, e.y, p.x, p.y) < e.r + T.player.radius + 3) { e.hitDone = true; hurtPlayer(e.dmg, e); }
    if (e.t <= 0) { e.state = 'recover'; e.t = def.recover; }
    return;
  }
  if (e.state === 'recover') {
    const away = norm(e.x - p.x, e.y - p.y);
    moveBody(f, e, away.x * sp * 0.6, away.y * sp * 0.6, e.r);
    if (e.t <= 0) { e.state = 'circle'; e.t = 0.3 + (e.bob % 0.6); }
    return;
  }
  // (held off while others press the attack: it circles further out)
  const sees = clearLine(f, e.x, e.y, p.x, p.y), held = e.press === false, ring = held ? T.enemies.holdBack : def.circle;
  if (pd > ring + 14 || !sees) { e.state = 'chase'; const w = wayToPlayer(d, e); moveBody(f, e, w.x * sp, w.y * sp, e.r); return; }
  if (e.state !== 'circle') { e.state = 'circle'; e.t = 0.4 + (e.bob % 0.8); }
  orbitMove(d, e, ring, sp * (def.side || 0.8));
  if (e.t <= 0 && free && !held && e.cd <= 0) { e.state = 'windup'; e.t = def.windup; e.aimX = p.x; e.aimY = p.y; }
}

function updateWisp(d, e, pd, sp, dt, free) {
  const def = T.enemies.wisp, p = d.p, f = d.floor;
  const sees = clearLine(f, e.x, e.y, p.x, p.y - 6);
  e.t -= dt;
  if (e.state === 'windup') {
    if (e.t <= 0) {
      const a = Math.atan2(p.y - 6 - (e.y - 8), p.x - e.x);
      const shots = d.depth >= def.fanDepth ? [-0.28, 0, 0.28] : [0];
      for (const off of shots) fireEnemyShot(d, e.x, e.y - 8, Math.cos(a + off) * def.shotSpeed, Math.sin(a + off) * def.shotSpeed, e.dmg);
      e.state = 'drift'; e.cd = def.cooldown;
    }
    return;
  }
  e.state = 'drift';
  if (!sees || pd > def.keep + 30) { const w = wayToPlayer(d, e); moveBody(f, e, w.x * sp, w.y * sp, e.r); }
  else orbitMove(d, e, def.keep, sp);
  if (sees && pd < def.range && e.cd <= 0 && free) { e.state = 'windup'; e.t = def.windup; }
}

// Constructs and the warden: wind up showing their line, then charge where
// the diver was. Into a wall, they're dazed.
function updateCharger(d, e, pd, sp, dt, free) {
  const def = T.enemies[e.type], p = d.p, f = d.floor;
  e.t -= dt;
  if (e.state === 'windup') {
    if (e.t <= 0) {
      if (e.boss && e.burst) {
        // the warden's other attack: a ring of orbs
        const ring = def.shots * (e.enraged ? 2 : 1);
        for (let k = 0; k < ring; k++) {
          const a = (k / ring) * Math.PI * 2 + e.bob;
          fireEnemyShot(d, e.x, e.y - 10, Math.cos(a) * def.shotSpeed, Math.sin(a) * def.shotSpeed, e.dmg * 0.7);
        }
        e.state = 'chase'; e.cd = def.cooldown;
      } else {
        const a = norm(e.aimX - e.x, e.aimY - e.y);
        e.vx = a.x * def.chargeSpeed; e.vy = a.y * def.chargeSpeed;
        e.state = 'charge'; e.t = def.chargeTime; e.hitDone = false;
      }
      e.burst = !e.burst;
    }
    return;
  }
  if (e.state === 'charge') {
    const ox = e.x, oy = e.y;
    moveBody(f, e, e.vx * dt, e.vy * dt, e.r);
    const blocked = Math.abs(e.x - ox) + Math.abs(e.y - oy) < Math.hypot(e.vx, e.vy) * dt * 0.3;
    if (!e.hitDone && dist(e.x, e.y, p.x, p.y) < e.r + T.player.radius + 3) { e.hitDone = true; hurtPlayer(e.dmg, e); }
    if (blocked) { e.state = 'dazed'; e.t = def.dazed; e.cd = def.cooldown; shakeView(T.impact.heavyShake); }
    else if (e.t <= 0) { e.state = 'chase'; e.cd = def.cooldown; }
    return;
  }
  e.state = 'chase';
  // (held off while others press the attack: it circles, out of reach)
  if (e.press === false && !e.boss) {
    const R = T.enemies.holdBack + 10;
    if (pd > R + 14 || !clearLine(f, e.x, e.y, p.x, p.y)) { const w = wayToPlayer(d, e); moveBody(f, e, w.x * sp, w.y * sp, e.r); }
    else orbitMove(d, e, R, sp);
    return;
  }
  if (pd < def.range && e.cd <= 0 && free && clearLine(f, e.x, e.y, p.x, p.y)) {
    e.state = 'windup'; e.t = def.windup; e.aimX = p.x; e.aimY = p.y;
    return;
  }
  if (pd > e.r + 6) { const w = wayToPlayer(d, e); moveBody(f, e, w.x * sp, w.y * sp, e.r); }
}

// A hit on a Keeper (combat.js hurtEnemy): its phase. The Choir's crystal
// turns all but a share unless it's chilled, when Force shatters it; the
// Underforge's fire turns all but a share until Frost quenches it, when
// it's open. (The Rim's ward is the Warded shell: natures.js.)
function keeperPhaseHit(e, dmg, els, opts) {
  const P = T.enemies.phase, d = Game.dive;
  if (e.home === 'choir') {
    const chilled = e.slowT > 0 || e.frozenT > 0;
    if (!chilled) { if (Game.realT - (e.phaseWordAt || -9) > 1.2) { e.phaseWordAt = Game.realT; reactWord(e, 'CRYSTAL', ELEMENT_COLS.frost); } return dmg * P.choir.shell; }
    if (els && els.includes('force')) { reactWord(e, 'SHATTER', ELEMENT_COLS.force); return dmg * P.choir.shatter; }
    return dmg;
  }
  if (e.home === 'underforge') {
    if (els && els.includes('frost') && !(e.quenchT > 0)) { e.quenchT = P.underforge.quench; reactWord(e, 'QUENCHED', ELEMENT_COLS.frost); d.fx.push({ kind: 'steam', x: e.x, y: e.y - 8, r: 20, t: 0.8, max: 0.8 }); return dmg; }
    if (e.quenchT > 0) return dmg * T.enemies.exposed;
    if (Game.realT - (e.phaseWordAt || -9) > 1.2) { e.phaseWordAt = Game.realT; reactWord(e, 'WREATHED', ELEMENT_COLS.ember); }
    return dmg * P.underforge.wreath;
  }
  return dmg;
}

// A Keeper: charges and rings of orbs like the warden; the Rim's calls its
// brood, the Underforge's leaves magma where it charges.
function updateKeeper(d, e, pd, sp, dt, free) {
  const def = T.enemies.keeper;
  if (!e.met) { e.met = true; Story.say('keeper'); }
  if (e.home === 'rim' && (e.summonT = (e.summonT || def.summonEvery) - dt) <= 0) {
    e.summonT = def.summonEvery;
    const brood = d.enemies.filter((c) => c.brood && !c.dead).length;
    for (let k = 0; k < Math.min(def.summon, def.broodMax - brood); k++) {
      const c = makeEnemy('crawler', e.x + d.rng.f(-16, 16), e.y + d.rng.f(-10, 10), e.level - 2, null);
      if (bodyHits(d.floor, c.x, c.y, c.r)) { c.x = e.x; c.y = e.y; }
      c.aggro = true; c.brood = true; d.enemies.push(c);
    }
  }
  // its phase (T.enemies.phase): the Rim's wards itself now and then; the
  // Underforge's fire goes out for a while when Frost quenches it
  const P = T.enemies.phase;
  if (e.home === 'rim' && !(e.ward > 0) && (e.wardT = (e.wardT === undefined ? P.rim.every * 0.4 : e.wardT) - dt) <= 0) {
    e.wardT = P.rim.every; e.ward = P.rim.ward; e.wardMax = e.ward;
    d.fx.push({ kind: 'mark', x: e.x, y: e.y, r: 20, t: 0.4, max: 0.4, col: ELEMENT_COLS.force, burst: true });
    Story.say('keeperWard');
  }
  if (e.home === 'choir' && !e.saidPhase && e.aggro) { e.saidPhase = true; Story.say('keeperCrystal'); }
  if (e.home === 'underforge' && !e.saidPhase && e.aggro) { e.saidPhase = true; Story.say('keeperFire'); }
  if (e.quenchT > 0) e.quenchT -= dt;
  const was = e.state;
  updateCharger(d, e, pd, sp * (e.enraged ? def.enrageSpeed : 1), dt, true);
  if (e.home === 'underforge' && was === 'charge' && e.state !== 'charge' && !(e.quenchT > 0))
    d.puddles.push({ x: e.x, y: e.y, r: def.magmaR, t: def.magmaTime, max: def.magmaTime, dps: e.dmg * def.magma });
}

// The Hollow comes straight on, through anything that stands in the way,
// and touches.
function updateHollow(d, e, pd, sp) {
  const def = T.enemies.hollow;
  e.state = 'chase';
  const w = wayToPlayer(d, e);
  moveBody(d.floor, e, w.x * sp, w.y * sp, e.r);
  if (pd < def.contact + T.player.radius && e.cd <= 0) { hurtPlayer(e.dmg, e); e.cd = def.cooldown; }
}

// Rooted flora: it doesn't move or take turns; it waits to be close enough.
function updatePlant(d, e, pd, dt) {
  const def = T.enemies[e.type], p = d.p;
  e.t -= dt;
  if (e.state === 'windup') {
    if (e.t > 0) return;
    if (e.type === 'snapjaw') {
      if (pd < def.reach + T.player.radius) hurtPlayer(e.dmg, e);
      d.fx.push({ kind: 'snap', x: e.x, y: e.y - 6, dx: e.aimX - e.x, dy: e.aimY - e.y, t: 0.18, max: 0.18 });
    } else {
      // a glob, lobbed to where the diver stood
      d.globs.push({ x: e.x, y: e.y - 10, x0: e.x, y0: e.y - 10, x1: e.aimX, y1: e.aimY, t: 0, max: dist(e.x, e.y, e.aimX, e.aimY) / def.shotSpeed, dmg: e.dmg * T.enemies.shotScale });
    }
    e.state = 'rest'; e.cd = def.cooldown;
    return;
  }
  e.state = 'rest';
  const reach = e.type === 'snapjaw' ? def.reach + 6 : def.range;
  if (e.cd <= 0 && pd < reach && clearLine(d.floor, e.x, e.y, p.x, p.y)) { e.state = 'windup'; e.t = def.windup; e.aimX = p.x; e.aimY = p.y; }
}

// Spitters' globs fly in an arc and burst into a patch of spores that
// hurts while it lasts.
function updateGlobs(dt) {
  const d = Game.dive, p = d.p, def = T.enemies.spitter;
  for (const g of d.globs) {
    g.t += dt;
    const k = Math.min(1, g.t / g.max);
    g.x = lerp(g.x0, g.x1, k); g.y = lerp(g.y0, g.y1, k) - Math.sin(k * Math.PI) * 18;
    if (k >= 1) {
      g.done = true;
      // a mortar's burst (affixes.js): a blow where it lands, no spores
      if (g.burst) { d.fx.push({ kind: 'mark', x: g.x1, y: g.y1, r: g.burst, t: 0.3, max: 0.3, col: g.col, burst: true }); if (!d.dying && dist(g.x1, g.y1, p.x, p.y) < g.burst + T.player.radius) hurtPlayer(g.dmg, g); shakeView(T.impact.heavyShake); }
      else d.puddles.push({ x: g.x1, y: g.y1, r: def.puddle / 2, t: def.puddleTime, max: def.puddleTime, dps: def.puddleDps * (g.dmg / def.dmg) });
    }
  }
  d.globs = d.globs.filter((g) => !g.done);
  p.frostSlow = 1;
  for (const pu of d.puddles) {
    pu.t -= dt;
    // chilling ground (a frosted elite's): it slows the step, nothing more;
    // a dash crosses it
    if (pu.slow) { if (!d.dying && p.dashT <= 0 && dist(pu.x, pu.y, p.x, p.y) < pu.r + T.player.radius) p.frostSlow = Math.min(p.frostSlow, pu.slow); continue; }
    if (pu.mine) {
      // a Linger's field the diver left: its element eats at enemies, not
      // the diver
      pu.tick = (pu.tick || 0) - dt;
      if (pu.tick <= 0) { pu.tick = pu.every; for (const e of d.enemies) if (!e.dead && dist(e.x, e.y, pu.x, pu.y) < pu.r + e.r) hurtEnemy(e, pu.dps * pu.every, { spell: true, els: pu.els }); }
      continue;
    }
    if (!d.dying && dist(pu.x, pu.y, p.x, p.y) < pu.r + T.player.radius && p.invuln <= 0 && p.dashT <= 0) {
      // spores eat at you without the flinch of a blow
      p.hp -= pu.dps * dt * T.items.armorK / (T.items.armorK + d.stats.armor);
      p.restT = 0;
      if (p.hp <= 0) { p.hp = 0; startDying(); }
    }
  }
  d.puddles = d.puddles.filter((pu) => pu.t > 0);
}

// ---------------------------------------------------------------------------
// Their shots
// ---------------------------------------------------------------------------
// (a shot does shotScale of a bite: it's harder to step out of)
function fireEnemyShot(d, x, y, vx, vy, dmg, col) {
  d.shots.push({ x, y, vx, vy, dmg: dmg * T.enemies.shotScale, t: 4, col });
}

function updateEnemyShots(dt) {
  const d = Game.dive, f = d.floor, p = d.p;
  for (const s of d.shots) {
    s.t -= dt; s.x += s.vx * dt; s.y += s.vy * dt;
    if (TILE_SOLID[floorTile(f, Math.floor(s.x / TILE), Math.floor(s.y / TILE))]) s.t = 0;
    else if (!d.dying && dist(s.x, s.y, p.x, p.y - 6) < 6) { hurtPlayer(s.dmg, s); s.t = 0; }
  }
  d.shots = d.shots.filter((s) => s.t > 0);
}
