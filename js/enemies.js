'use strict';
// ---------------------------------------------------------------------------
// Enemies. Each floor's are placed from its own seed when it's entered: a
// few in every room but the entry, more with depth, some of them elites,
// and now and then the warden in a side room. They wake when they see the
// prospector (or are hit) and find their way through the corridors along a
// flow field: steps on foot to the prospector from every tile, rebuilt
// whenever the prospector crosses into a new tile.
//   crawler: runs in, winds up, bites, hops back.
//   wisp: keeps its distance and fires slow orbs.
//   construct: winds up, then charges in a straight line.
//   warden: a great construct that charges and bursts orbs in a ring.
// All of them run on world time (dt × Game.timeScale).
// ---------------------------------------------------------------------------

const ELITE_AFFIXES = ['fast', 'tough', 'volatile'];
const ELITE_NAMES = { fast: 'Fast', tough: 'Tough', volatile: 'Volatile' };

function floorLevel(d) { return d.biome * T.levelPerBiome + d.depth; }

function makeEnemy(type, x, y, level, elite) {
  const E = T.enemies, def = E[type];
  const hpMul = Math.pow(E.hpGrowth, level - 1) * (elite ? E.eliteHp * (elite === 'tough' ? E.tough : 1) : 1);
  const hp = Math.round(def.hp * hpMul);
  return {
    type, x, y, hp, maxHp: hp, r: def.radius, level, elite, boss: type === 'warden',
    dmg: def.dmg * Math.pow(E.dmgGrowth, level - 1) * (elite ? E.eliteDmg : 1),
    speed: def.speed * (elite === 'fast' ? E.fast : 1),
    state: 'idle', t: 0, cd: 0, aggro: false, flash: 0, slowT: 0, stunT: 0, kx: 0, ky: 0, hitDone: false, bob: 0,
    burst: false, dead: false,
  };
}

function spawnEnemies(d) {
  const f = d.floor, E = T.enemies, level = floorLevel(d);
  const rng = new Rng(hashInts(d.seed, d.depth, d.biome, 0xe1e));
  d.enemies = [];
  const inRoom = (r) => ({ x: (rng.i(r.x, r.x + r.w - 1) + 0.5) * TILE, y: (rng.i(r.y, r.y + r.h - 1) + 0.5) * TILE });
  const types = ['crawler', 'wisp', 'construct'].filter((t) => !E[t].minDepth || d.depth >= E[t].minDepth);
  const eliteChance = Math.min(E.eliteMax, E.eliteBase + E.eliteDepth * d.depth);
  // the warden takes a side room: not the entry, the shaft's or the lodeline's
  let bossRoom = null;
  if (d.depth >= E.bossDepth && rng.chance(E.bossChance)) {
    const side = f.rooms.slice(1).filter((r) => !roomHas(r, f.shaft) && !(f.pad && roomHas(r, f.pad)) && r.w >= 5 && r.h >= 5);
    if (side.length) bossRoom = rng.pick(side);
  }
  for (const r of f.rooms.slice(1)) {
    if (r === bossRoom) {
      const b = makeEnemy('warden', (r.cx + 0.5) * TILE, (r.cy + 0.5) * TILE, level + 1, null);
      d.enemies.push(b);
      continue;
    }
    const n = clamp(Math.round(E.perRoom + E.perDepth * d.depth) + rng.i(-1, 1), 0, E.maxPerRoom);
    for (let k = 0; k < n; k++) {
      const type = rng.weighted(types.map((t) => [E[t].weight, t]));
      const at = inRoom(r);
      const elite = rng.chance(eliteChance) ? rng.pick(ELITE_AFFIXES) : null;
      d.enemies.push(makeEnemy(type, at.x, at.y, level, elite));
    }
  }
}

const roomHas = (r, t) => t.x >= r.x && t.x < r.x + r.w && t.y >= r.y && t.y < r.y + r.h;

// ---------------------------------------------------------------------------
// Getting about
// ---------------------------------------------------------------------------

// Steps on foot from the prospector's tile to every tile, rebuilt when that
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

// The way towards the prospector from e: straight there when close and in
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
function updateEnemies(dt) {
  const d = Game.dive, f = d.floor, p = d.p, E = T.enemies;
  updateFlow(d);
  for (const e of d.enemies) {
    if (e.dead) continue;
    e.flash = Math.max(0, e.flash - dt);
    e.slowT = Math.max(0, e.slowT - dt);
    e.cd = Math.max(0, e.cd - dt);
    e.bob += dt;
    const pd = dist(e.x, e.y, p.x, p.y);
    if (!e.aggro && !d.dying && pd < E.aggro && clearLine(f, e.x, e.y, p.x, p.y - 6)) wake(d, e);
    // dragged by a Lodestone Pull, or stunned
    if (e.stunT > 0) {
      e.stunT -= dt;
      moveBody(f, e, e.kx * dt, e.ky * dt, e.r);
      e.kx *= 0.85; e.ky *= 0.85;
      continue;
    }
    if (!e.aggro || d.dying) continue;
    const slow = e.slowT > 0 ? 1 - T.onHit.chillSlow : 1;
    const sp = e.speed * slow * dt;
    if (e.type === 'crawler') updateCrawler(d, e, pd, sp, dt);
    else if (e.type === 'wisp') updateWisp(d, e, pd, sp, dt);
    else updateCharger(d, e, pd, sp, dt);
  }
  // keep them from stacking up on each other
  const L = d.enemies;
  for (let i = 0; i < L.length; i++)
    for (let j = i + 1; j < L.length; j++) {
      const a = L[i], b = L[j];
      if (a.dead || b.dead) continue;
      const dx = b.x - a.x, dy = b.y - a.y, m = Math.hypot(dx, dy), min = a.r + b.r;
      if (m > 0.01 && m < min) {
        const push = (min - m) / 2;
        moveBody(f, a, (-dx / m) * push, (-dy / m) * push, a.r);
        moveBody(f, b, (dx / m) * push, (dy / m) * push, b.r);
      }
    }
  updateEnemyShots(dt);
}

// Waking one wakes the others nearby.
function wake(d, e) {
  if (e.aggro) return;
  e.aggro = true;
  e.cd = Math.max(e.cd, 0.3);
  for (const o of d.enemies) if (!o.aggro && !o.dead && dist(o.x, o.y, e.x, e.y) < 3 * TILE) { o.aggro = true; o.cd = Math.max(o.cd, 0.5); }
}

function updateCrawler(d, e, pd, sp, dt) {
  const def = T.enemies.crawler, p = d.p;
  e.t -= dt;
  if (e.state === 'windup') {
    if (e.t <= 0) {
      if (pd < def.contact + T.player.radius + 4) hurtPlayer(e.dmg, e);
      e.state = 'hop'; e.t = 0.25; e.cd = def.cooldown;
    }
    return;
  }
  if (e.state === 'hop') {
    const away = norm(e.x - p.x, e.y - p.y);
    moveBody(d.floor, e, away.x * sp * 1.6, away.y * sp * 1.6, e.r);
    if (e.t <= 0) e.state = 'chase';
    return;
  }
  e.state = 'chase';
  if (pd < def.contact + T.player.radius && e.cd <= 0) { e.state = 'windup'; e.t = def.windup; return; }
  if (pd > def.contact) { const w = wayToPlayer(d, e); moveBody(d.floor, e, w.x * sp, w.y * sp, e.r); }
}

function updateWisp(d, e, pd, sp, dt) {
  const def = T.enemies.wisp, p = d.p, f = d.floor;
  const sees = clearLine(f, e.x, e.y, p.x, p.y - 6);
  e.t -= dt;
  if (e.state === 'windup') {
    if (e.t <= 0) {
      const a = norm(p.x - e.x, p.y - 6 - (e.y - 8));
      fireEnemyShot(d, e.x, e.y - 8, a.x * def.shotSpeed, a.y * def.shotSpeed, e.dmg);
      e.state = 'drift'; e.cd = def.cooldown;
    }
    return;
  }
  e.state = 'drift';
  if (pd < def.keep - 8 && sees) { const a = norm(e.x - p.x, e.y - p.y); moveBody(f, e, a.x * sp, a.y * sp, e.r); }
  else if (pd > def.keep + 16 || !sees) { const w = wayToPlayer(d, e); moveBody(f, e, w.x * sp, w.y * sp, e.r); }
  if (sees && pd < def.range && e.cd <= 0) { e.state = 'windup'; e.t = def.windup; }
}

// Constructs and the warden: wind up, then charge where the prospector was.
function updateCharger(d, e, pd, sp, dt) {
  const def = T.enemies[e.type], p = d.p, f = d.floor;
  e.t -= dt;
  if (e.state === 'windup') {
    if (e.t <= 0) {
      if (e.boss && e.burst) {
        // the warden's other attack: a ring of orbs
        for (let k = 0; k < def.shots; k++) {
          const a = (k / def.shots) * Math.PI * 2 + e.bob;
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
    if (e.t <= 0 || blocked) { e.state = 'chase'; e.cd = def.cooldown; }
    return;
  }
  e.state = 'chase';
  if (pd < def.range && e.cd <= 0 && clearLine(f, e.x, e.y, p.x, p.y)) {
    e.state = 'windup'; e.t = def.windup; e.aimX = p.x; e.aimY = p.y;
    return;
  }
  if (pd > e.r + 6) { const w = wayToPlayer(d, e); moveBody(f, e, w.x * sp, w.y * sp, e.r); }
}

// ---------------------------------------------------------------------------
// Their shots
// ---------------------------------------------------------------------------
function fireEnemyShot(d, x, y, vx, vy, dmg) {
  d.shots.push({ x, y, vx, vy, dmg, t: 4 });
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
