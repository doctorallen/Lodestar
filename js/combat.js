'use strict';
// ---------------------------------------------------------------------------
// Fighting. Each hand has its own button: a blade (or an empty main hand)
// swings, a focus casts. A swing hits everything in an arc in front, aimed
// at the nearest enemy in reach. A focus casts every core socketed in it
// (an empty one casts a spark), for charge. A blade fires its cores every
// few hits, free. Hits can arc lightning, chill and heal (affixes). Kills
// drop loot, exotics, sealed relics and healing motes onto the floor.
// ---------------------------------------------------------------------------

// The nearest living enemy within range that the prospector can see.
function nearestEnemy(d, range, from = d.p, except = null) {
  let best = null, bd = range;
  for (const e of d.enemies) {
    if (e.dead || e === except) continue;
    const m = dist(from.x, from.y, e.x, e.y);
    if (m < bd && clearLine(d.floor, from.x, from.y - 6, e.x, e.y - 4)) { bd = m; best = e; }
  }
  return best;
}

function useHand(slot) {
  const d = Game.dive, p = d.p, item = Save.data.equip[slot], h = p.hands[slot];
  if (h.cd > 0 || d.dying) return;
  if (!item && slot === 'off') return;
  if (item && item.kind === 'focus') castFocus(item, h);
  else swing(item, h);
}

function swing(item, h) {
  const d = Game.dive, p = d.p, st = d.stats, M = T.melee;
  const target = nearestEnemy(d, M.autoAim);
  const dir = target ? norm(target.x - p.x, target.y - p.y) : norm(p.fx, p.fy);
  if (target) { p.fx = dir.x; p.fy = dir.y; }
  h.cd = M.cooldown / (1 + st.atkSpeed / 100);
  d.fx.push({ kind: 'swing', x: p.x, y: p.y - 6, dx: dir.x, dy: dir.y, t: M.swingTime, max: M.swingTime });
  const base = item ? item.base.dmg : M.fist;
  let hit = 0;
  for (const e of d.enemies) {
    if (e.dead) continue;
    const dx = e.x - p.x, dy = e.y - p.y, m = Math.hypot(dx, dy);
    if (m > M.range + e.r || (m > 2 && (dx * dir.x + dy * dir.y) / m < M.arcCos)) continue;
    const crit = d.rng.f(100) < st.crit;
    hurtEnemy(e, base * (1 + st.meleeDmg / 100) * (crit ? 2 : 1), { crit });
    if (crit && st.powers.bloodedge) healPlayer(st.maxHp * 0.04);
    hit++;
  }
  if (!hit) return;
  p.charge = Math.min(st.maxCharge, p.charge + T.player.chargeOnHit);
  buzz(10);
  // a blade's cores fire every few hits, free
  if (item && item.sockets && item.sockets.some(Boolean)) {
    h.hits = (h.hits || 0) + 1;
    if (h.hits % T.spells.procEvery === 0) castCores(item, item.base.dmg * 1.2 * T.spells.procMult);
  }
}

function castFocus(item, h) {
  const d = Game.dive, p = d.p, S = T.spells;
  const cores = (item.sockets || []).filter(Boolean);
  const cost = cores.length ? cores.reduce((a, c) => a + S[c.core].cost, 0) : S.spark.cost;
  if (p.charge < cost) { p.lowCharge = 0.4; return; }
  p.charge -= cost;
  h.cd = S.castCooldown;
  const power = item.base.power;
  if (!cores.length) castSpell('spark', power * S.spark.mult);
  else castCores(item, power);
}

// Fires every core in an item (twice with the Twice-Told).
function castCores(item, power) {
  const st = Game.dive.stats;
  const times = st.powers.echo && item.power === 'echo' ? 2 : 1;
  for (const c of item.sockets || []) {
    if (!c) continue;
    const p = power * (1 + T.items.core.growth * (c.tier - 1)) * T.spells[c.core].mult;
    for (let k = 0; k < times; k++) castSpell(c.core, p, k * 0.25);
  }
}

// spread: an angle to fan a second bolt out by
function castSpell(kind, power, spread = 0) {
  const d = Game.dive, p = d.p, st = d.stats, S = T.spells;
  const dmg = power * (1 + st.spellDmg / 100);
  if (kind === 'spark' || kind === 'bolt') {
    const target = nearestEnemy(d, S.aimRange);
    let a = target ? Math.atan2(target.y - 4 - (p.y - 8), target.x - p.x) : Math.atan2(p.fy, p.fx);
    a += spread;
    const sp = S[kind].speed;
    d.bolts.push({ x: p.x, y: p.y - 8, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dmg, kind, t: 1.2, chain: kind === 'bolt' && st.powers.stormcaller ? 2 : 0, hitIds: [] });
    return;
  }
  if (kind === 'nova') {
    d.fx.push({ kind: 'nova', x: p.x, y: p.y - 6, r: S.nova.radius, t: 0.3, max: 0.3 });
    for (const e of d.enemies) if (!e.dead && dist(e.x, e.y, p.x, p.y) < S.nova.radius + e.r) hurtEnemy(e, dmg, { spell: true });
    return;
  }
  if (kind === 'pull') {
    d.fx.push({ kind: 'pull', x: p.x, y: p.y - 6, r: S.pull.radius, t: 0.35, max: 0.35 });
    for (const e of d.enemies) {
      if (e.dead || e.boss) continue;
      const m = dist(e.x, e.y, p.x, p.y);
      if (m > S.pull.radius || m < 1) continue;
      const k = Math.min(S.pull.speed, (m - 10) * 4);
      e.kx = ((p.x - e.x) / m) * k; e.ky = ((p.y - e.y) / m) * k;
      e.stunT = S.pull.stun; e.state = 'chase';
      hurtEnemy(e, dmg, { spell: true });
    }
    return;
  }
  if (kind === 'ward') {
    p.ward = Math.max(p.ward, dmg);
    p.wardT = S.ward.time;
    d.fx.push({ kind: 'ward', x: p.x, y: p.y - 6, t: 0.3, max: 0.3 });
  }
}

function updateBolts(dt) {
  const d = Game.dive, f = d.floor;
  for (const b of d.bolts) {
    b.t -= dt; b.x += b.vx * dt; b.y += b.vy * dt;
    if (TILE_SOLID[floorTile(f, Math.floor(b.x / TILE), Math.floor((b.y + 6) / TILE))]) { b.t = 0; continue; }
    for (const e of d.enemies) {
      if (e.dead || b.hitIds.includes(e) || dist(b.x, b.y, e.x, e.y - 5) > e.r + 4) continue;
      hurtEnemy(e, b.dmg, { spell: true });
      b.hitIds.push(e);
      // Stormcaller: on to the next nearest
      const next = b.chain > 0 && nearestEnemy(d, T.onHit.shockRange * 1.5, e, null);
      if (next && !b.hitIds.includes(next)) {
        b.chain--;
        const a = norm(next.x - b.x, next.y - 4 - b.y), sp = Math.hypot(b.vx, b.vy);
        b.vx = a.x * sp; b.vy = a.y * sp; b.t = 0.6;
      } else b.t = 0;
      break;
    }
  }
  d.bolts = d.bolts.filter((b) => b.t > 0);
}

// ---------------------------------------------------------------------------
// Damage
// ---------------------------------------------------------------------------
function hurtPlayer(dmg, from) {
  const d = Game.dive, p = d.p, st = d.stats;
  if (p.invuln > 0 || d.dying) return;
  dmg *= T.items.armorK / (T.items.armorK + st.armor);
  if (p.ward > 0) { const soak = Math.min(p.ward, dmg); p.ward -= soak; dmg -= soak; }
  p.hp -= dmg;
  p.invuln = T.player.hurtInvuln;
  p.hurtT = 0.25;
  p.restT = 0;
  buzz(30);
  if (p.hp <= 0) { p.hp = 0; startDying(); }
}

function healPlayer(n) {
  const p = Game.dive.p;
  p.hp = Math.min(Game.dive.stats.maxHp, p.hp + n);
}

// opts: { crit, spell, noProc (an arc of lightning doesn't arc again) }
function hurtEnemy(e, dmg, opts = {}) {
  const d = Game.dive, st = d.stats, O = T.onHit;
  if (e.dead) return;
  e.hp -= dmg;
  e.flash = T.enemies.hurtFlash;
  wake(d, e);
  if (st.leech) healPlayer((dmg * st.leech) / 100);
  if (!opts.noProc) {
    if (st.chill && d.rng.f(100) < st.chill) e.slowT = O.chillTime;
    if (st.shock && d.rng.f(100) < st.shock) {
      const o = nearestEnemy(d, O.shockRange, e, e);
      if (o) { d.fx.push({ kind: 'arc', x: e.x, y: e.y - 5, x2: o.x, y2: o.y - 5, t: 0.15, max: 0.15 }); hurtEnemy(o, dmg * O.shockMult, { noProc: true }); }
    }
  }
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
  const d = Game.dive, st = d.stats, L = T.loot, rng = d.rng;
  e.dead = true;
  d.kills++;
  spawnSparks(e.x, e.y - 5, [ENEMY_PAL[T.biomes[d.biome].id].crystal[0], '#ffffff'], e.boss ? 30 : 10);
  if (e.elite === 'volatile') d.fx.push({ kind: 'volatile', x: e.x, y: e.y, t: T.enemies.volatileFuse, max: T.enemies.volatileFuse, dmg: e.dmg * T.enemies.volatileDmg });
  if (st.powers.lodeheart) {
    healPlayer(3);
    for (const dr of d.drops) if (dist(dr.x, dr.y, d.p.x, d.p.y) < 6 * TILE) dr.home = true;
  }
  // scattered a little round where it fell, but never into the rock
  const level = floorLevel(d), drop = (thing) => {
    let x = e.x + rng.f(-6, 6), y = e.y + rng.f(-4, 4);
    if (TILE_SOLID[floorTile(d.floor, Math.floor(x / TILE), Math.floor(y / TILE))]) { x = e.x; y = e.y; }
    d.drops.push(Object.assign({ x, y, t: 0 }, thing));
  };
  const tier = dropTier(d);
  if (e.boss) {
    for (let k = 0; k < L.bossDrops; k++) drop({ item: rollDrop(rng, tier + 1, level + 2, 'rare') });
    if (rng.chance(L.bossRelic)) drop({ item: makeRelic(tier + 1) });
    drop({ exotic: rng.pick(T.exotics).id });
    return;
  }
  if (e.elite) {
    for (let k = 0; k < L.eliteDrops; k++) drop({ item: rollDrop(rng, tier, level + 1, 'magic') });
    if (rng.chance(L.eliteExotic)) drop({ exotic: rng.pick(T.exotics).id });
    if (rng.chance(L.eliteRelic)) drop({ item: makeRelic(tier) });
  } else {
    if (rng.chance(L.drop)) drop({ item: rollDrop(rng, tier, level) });
    if (rng.chance(L.exotic)) drop({ exotic: rng.pick(T.exotics).id });
    if (rng.chance(L.relic)) drop({ item: makeRelic(tier) });
  }
  if (rng.chance(L.mote)) drop({ mote: L.moteHeal });
}

// The tier of loot on this floor: the biome's lower ore, or its deeper one
// more often further down.
function dropTier(d) {
  const ores = T.biomes[d.biome].ores, deep = Math.min(T.oreDeep.max, T.oreDeep.base + T.oreDeep.perFloor * (d.depth - 1));
  return T.ores[ORE_INDEX[ores[d.rng.chance(deep) ? 1 : 0]]].tier;
}

// ---------------------------------------------------------------------------
// Effects that do something after a moment (a volatile elite's blast), and
// picking things up
// ---------------------------------------------------------------------------
function updateCombatFx(dt) {
  const d = Game.dive, p = d.p;
  for (const fx of d.fx) {
    fx.t -= dt;
    if (fx.kind === 'volatile' && fx.t <= 0 && !fx.done) {
      fx.done = true;
      if (dist(fx.x, fx.y, p.x, p.y) < T.enemies.volatileRadius) hurtPlayer(fx.dmg, fx);
      d.fx.push({ kind: 'blast', x: fx.x, y: fx.y - 4, r: T.enemies.volatileRadius, t: 0.3, max: 0.3 });
    }
  }
  d.fx = d.fx.filter((fx) => fx.t > 0);
}

function updatePickups(dt) {
  const d = Game.dive, p = d.p, reach = d.stats.magnet;
  for (const dr of d.drops) {
    dr.t += dt;
    if (dr.home) { const a = norm(p.x - dr.x, p.y - dr.y); dr.x += a.x * 90 * dt; dr.y += a.y * 90 * dt; }
    if (dist(dr.x, dr.y, p.x, p.y) > reach) { dr.warned = false; continue; }
    if (dr.mote) { healPlayer(dr.mote); dr.gone = true; continue; }
    const w = dr.item ? T.cargo.itemWeight : 1;
    if (cargoUsed(d) + w > d.stats.cargo) {
      if (!dr.warned) { dr.warned = true; UI.toast('Cargo full'); }
      continue;
    }
    if (dr.item) { UI.tip('gear', 'Tap CARGO to look at what you found'); d.items.push(dr.item); UI.toast(dr.item.kind === 'relic' ? 'A sealed relic' : dr.item.name, dr.item.rarity); }
    else { d.cargo[dr.exotic] = (d.cargo[dr.exotic] || 0) + 1; UI.toast(T.exotics.find((x) => x.id === dr.exotic).name, 'exotic'); }
    dr.gone = true;
    buzz(12);
  }
  d.drops = d.drops.filter((dr) => !dr.gone);
}

function cargoUsed(d) {
  let n = 0;
  for (const k in d.cargo) n += d.cargo[k];
  return n + d.items.length * T.cargo.itemWeight;
}
