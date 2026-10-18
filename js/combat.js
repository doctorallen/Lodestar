'use strict';
// ---------------------------------------------------------------------------
// Fighting. Each hand has its own button. A blade (or an empty main hand)
// swings: taps chain a three-hit combo whose last hit is heavy, and holding
// past a swing charges a spin that hits all round. A focus casts every core
// socketed in it (an empty one casts a spark), for charge; holding charges
// a stronger cast. A blade fires its cores every few hits, free. A press
// during a cooldown is held over until it ends. The dash is a burst of speed
// that nothing can touch. Hits stop the world for a moment, shake the view
// and knock enemies back; heavy ones stagger them. Kills drop loot,
// exotics, sealed relics and healing motes onto the floor.
// ---------------------------------------------------------------------------

// The nearest living enemy within range that the diver can see.
function nearestEnemy(d, range, from = d.p, except = null) {
  let best = null, bd = range;
  for (const e of d.enemies) {
    if (e.dead || e === except) continue;
    const m = dist(from.x, from.y, e.x, e.y);
    if (m < bd && clearLine(d.floor, from.x, from.y - 6, e.x, e.y - 4)) { bd = m; best = e; }
  }
  return best;
}

const handKind = (item) => (item && item.kind === 'focus' ? 'focus' : 'blade');

// Each step: presses, holds and releases of both hands' buttons.
function updateHands(dt) {
  const d = Game.dive, p = d.p, M = T.melee;
  for (const slot of ['main', 'off']) {
    const item = Save.data.equip[slot], h = p.hands[slot], btn = Input.hand(slot);
    h.cd = Math.max(0, h.cd - dt);
    h.comboT = Math.max(0, h.comboT - dt);
    h.buffer = Math.max(0, h.buffer - dt);
    if (!item && slot === 'off') { h.holdT = 0; continue; }
    if (btn.pressed) { h.buffer = 0.25; h.holdT = 0; h.holding = true; }
    if (h.buffer > 0 && h.cd <= 0 && !d.dying) { h.buffer = 0; attackTap(slot, item, h); }
    if (h.holding && btn.down) h.holdT += dt;
    if (btn.released || (!btn.down && h.holding)) {
      if (h.holding && chargeLevel(h) >= 1 && !d.dying) chargedAttack(slot, item, h);
      h.holding = false; h.holdT = 0;
    }
  }
}

// How charged a hand is, 0–1.
function chargeLevel(h) {
  const M = T.melee;
  return clamp((h.holdT - M.chargeStart) / (M.chargeFull - M.chargeStart), 0, 1);
}

function attackTap(slot, item, h) {
  if (handKind(item) === 'focus') castFocus(item, h, false);
  else swing(slot, item, h);
}

// Where a swing aims: the nearest enemy in reach, else straight ahead.
function aimDir(range) {
  const d = Game.dive, p = d.p, target = nearestEnemy(d, range);
  if (target) { const a = norm(target.x - p.x, target.y - p.y); p.fx = a.x; p.fy = a.y; return a; }
  return norm(p.fx, p.fy);
}

// How a hand's weapon fights.
function meleeStyle(item) { const bp = item && bpOf(item); return T.melee.styles[(bp && T.melee.styles[bp.style]) ? bp.style : 'blade']; }

function swing(slot, item, h) {
  const d = Game.dive, p = d.p, st = d.stats, M = T.melee, S = meleeStyle(item);
  h.step = h.comboT > 0 ? (h.step + 1) % S.combo.length : 0;
  const [mult, cd, arc, knock, lunge, time] = S.combo[h.step], heavy = !!S.heavy || h.step === S.combo.length - 1;
  const dir = aimDir(M.autoAim);
  h.cd = cd / (1 + st.atkSpeed / 100);
  h.comboT = M.comboWindow + h.cd;
  // the arc is measured from where the swing began, so the lunge can't
  // carry the diver past something standing on top of it
  const x0 = p.x, y0 = p.y;
  moveBody(d.floor, p, dir.x * lunge, dir.y * lunge, T.player.radius);
  p.swing = { slot, a: Math.atan2(dir.y, dir.x), side: h.step % 2 ? -1 : 1, t: time, max: time, heavy, spin: false, style: (bpOf(item || {}) || {}).style || 'blade' };
  const base = item ? item.base.dmg : M.fist;
  let hit = 0;
  for (const e of d.enemies) {
    if (e.dead) continue;
    const dx = e.x - x0, dy = e.y - y0, m = Math.hypot(dx, dy);
    const close = m <= e.r + T.player.radius + 3 || dist(e.x, e.y, p.x, p.y) <= e.r + T.player.radius + 3;
    if (!close && (m > S.range + e.r || (m > 2 && (dx * dir.x + dy * dir.y) / m < arc))) continue;
    meleeHit(e, base * mult, dir, knock, heavy, item && item.element);
    hit++;
  }
  afterMelee(item, h, hit, heavy);
}

// The charged move, by style: a blade spins, a spear lunges through, a
// hammer slams the ground, a whip drags everything near in.
function chargedAttack(slot, item, h) {
  const d = Game.dive, p = d.p;
  if (handKind(item) === 'focus') { castFocus(item, h, true); return; }
  const S = meleeStyle(item), C = S.charged, base = item ? item.base.dmg : T.melee.fist, el = item && item.element;
  const style = (bpOf(item || {}) || {}).style || 'blade';
  h.cd = S.combo[0][1];
  h.comboT = 0;
  let hit = 0;
  if (C.move === 'lunge') {
    // through everything on the way
    const dir = aimDir(T.melee.autoAim * 1.5), x0 = p.x, y0 = p.y;
    const steps = 8;
    for (let k = 1; k <= steps; k++) moveBody(d.floor, p, (dir.x * C.reach) / steps, (dir.y * C.reach) / steps, T.player.radius);
    p.invuln = Math.max(p.invuln, C.time);
    for (const e of d.enemies) {
      if (e.dead) continue;
      // distance from the line just travelled
      const vx = p.x - x0, vy = p.y - y0, L2 = vx * vx + vy * vy || 1, t = clamp(((e.x - x0) * vx + (e.y - y0) * vy) / L2, 0, 1);
      if (dist(e.x, e.y, x0 + vx * t, y0 + vy * t) > e.r + 8) continue;
      meleeHit(e, base * C.mult, dir, C.knock, true, el);
      hit++;
    }
    for (let k = 0; k < 5; k++) d.fx.push({ kind: 'ghost', x: lerp(x0, p.x, k / 5), y: lerp(y0, p.y, k / 5), fx: dir.x, fy: dir.y, t: 0.2, max: 0.2 });
    p.swing = { slot, a: Math.atan2(dir.y, dir.x), side: 1, t: C.time, max: C.time, heavy: true, spin: false, style };
  } else if (C.move === 'drag') {
    for (const e of d.enemies) {
      if (e.dead || e.boss || e.type === 'hollow' || dist(e.x, e.y, p.x, p.y) > C.radius + e.r) continue;
      const m = dist(e.x, e.y, p.x, p.y) || 1, k = Math.min(160, (m - 10) * 5);
      e.kx = ((p.x - e.x) / m) * k; e.ky = ((p.y - e.y) / m) * k; e.stunT = 0.5;
      meleeHit(e, base * C.mult, norm(p.x - e.x, p.y - e.y), 0, true, el);
      hit++;
    }
    d.fx.push({ kind: 'pull', x: p.x, y: p.y - 6, r: C.radius, t: C.time, max: C.time });
    p.swing = { slot, a: Math.atan2(p.fy, p.fx), side: 1, t: C.time, max: C.time, heavy: true, spin: true, style };
  } else {
    // a spin, or a slam: everything round about
    for (const e of d.enemies) {
      if (e.dead || dist(e.x, e.y, p.x, p.y) > C.radius + e.r) continue;
      meleeHit(e, base * C.mult, norm(e.x - p.x, e.y - p.y), C.knock, true, el);
      hit++;
    }
    d.fx.push({ kind: C.move === 'slam' ? 'blast' : 'spin', x: p.x, y: p.y - (C.move === 'slam' ? 0 : 6), r: C.radius, t: C.time, max: C.time });
    p.swing = { slot, a: Math.atan2(p.fy, p.fx), side: 1, t: C.time, max: C.time, heavy: true, spin: C.move === 'spin', style };
  }
  afterMelee(item, h, hit, true);
}

function meleeHit(e, dmg, dir, knock, heavy, element) {
  const d = Game.dive, st = d.stats;
  const crit = d.rng.f(100) < st.crit;
  hurtEnemy(e, dmg * (1 + st.meleeDmg / 100) * (crit ? 2 : 1), { crit, knock: { x: dir.x * knock, y: dir.y * knock }, heavy, element });
  if (crit && st.powers.bloodedge) healPlayer(st.maxHp * 0.04);
}

// A hit lands: the world holds still a moment. Only a heavy hit can freeze
// it again straight after another, so a flurry doesn't stutter.
function freezeFrame(t, heavy) {
  if (!heavy && Game.realT - (Game.frozeAt || -1) < T.impact.stopGap) return;
  Game.hitstop = Math.max(Game.hitstop, t);
  Game.frozeAt = Game.realT;
}

function afterMelee(item, h, hit, heavy) {
  const d = Game.dive, p = d.p, st = d.stats, I = T.impact;
  if (!hit) return;
  p.charge = Math.min(st.maxCharge, p.charge + T.player.chargeOnHit * hit);
  freezeFrame(heavy ? I.heavyStop : I.hitstop, heavy);
  shakeView(heavy ? I.heavyShake : I.shake);
  buzz(heavy ? 25 : 10);
  // a blade's cores fire every few hits, free
  if (item && item.sockets && item.sockets.some(Boolean)) {
    h.hits = (h.hits || 0) + 1;
    if (h.hits % T.spells.procEvery === 0) castCores(item, item.base.dmg * 1.2 * T.spells.procMult);
  }
}

function castFocus(item, h, charged) {
  const d = Game.dive, p = d.p, S = T.spells, style = (bpOf(item) || {}).style || 'wand';
  const cores = (item.sockets || []).filter((c) => c && !CORES[c.core].mod), mods = socketMods(item);
  let cost = cores.length ? cores.reduce((a, c) => a + S[c.core].cost, 0) : S.spark.cost;
  if (style === 'gauntlet') cost *= S.gauntletCost;
  if (mods.quicken) cost *= T.mods.quickenCost;
  if (charged) cost *= style === 'staff' ? S.staffChargedCost : S.chargedCost;
  if (p.charge < cost) { p.lowCharge = 0.4; return; }
  p.charge -= cost;
  h.cd = S.castCooldown * (mods.quicken ? T.mods.quickenCd : 1);
  d.castElement = item.element || null;
  d.castRange = style === 'gauntlet' ? S.gauntletRange : style === 'staff' ? S.staffRange : S.aimRange;
  // the pose and the burst round it (cosmetic: castfx.js)
  castFxStart(d, item, h === p.hands.off ? 'off' : 'main', style, charged, cores.length ? cores.map((c) => c.core) : ['spark']);
  const power = item.base.power * (charged && style !== 'staff' ? S.chargedMult : 1);
  // a staff's charged cast fires everything three times, fanned out
  const times = charged && style === 'staff' ? 3 : 1;
  for (let k = 0; k < times; k++) {
    const spread = times > 1 ? (k - 1) * 0.3 : 0;
    if (!cores.length) castSpell('spark', power * S.spark.mult, spread, charged && times === 1, mods);
    else castCores(item, power, charged && times === 1, spread);
  }
  d.castElement = null;
}

// The modifiers socketed in a piece, as { split: true, ... }.
function socketMods(item) {
  const m = {};
  for (const c of (item && item.sockets) || []) if (c && CORES[c.core].mod) m[c.core] = true;
  return m;
}

// Fires every spell core in an item (twice with the Twice-Told), changed by
// the modifiers beside them; with Echo, all again a moment later. spread: an
// angle to fan bolts out by.
function castCores(item, power, charged = false, spread = 0) {
  const d = Game.dive, st = d.stats, mods = socketMods(item);
  const times = st.powers.echo && item.power === 'echo' ? 2 : 1;
  for (const c of item.sockets || []) {
    if (!c || CORES[c.core].mod || !T.spells[c.core]) continue;
    const p = power * (1 + T.items.core.growth * (c.tier - 1)) * T.spells[c.core].mult;
    for (let k = 0; k < times; k++) castSpell(c.core, p, spread + k * 0.25, charged, mods);
    if (mods.echo) d.later.push({ t: T.mods.echoDelay, fn: () => { castFxEcho(d); castSpell(c.core, p * T.mods.echoMult, spread, false, Object.assign({}, mods, { echo: false })); }, el: d.castElement });
  }
}

// The dash: when asked for and ready, a burst along the stick (or the way
// the diver faces).
function updateDash(dt) {
  const d = Game.dive, p = d.p, D = T.dash;
  p.dashCd = Math.max(0, p.dashCd - dt);
  const req = Input.consumeDash();
  if (req && p.dashCd <= 0 && !d.dying) {
    const mv = typeof req === 'object' ? req : Input.move;
    const dir = Math.hypot(mv.x, mv.y) > 0.2 ? norm(mv.x, mv.y) : norm(p.fx, p.fy);
    p.dashT = D.time; p.dashX = dir.x; p.dashY = dir.y;
    p.fx = dir.x; p.fy = dir.y;
    p.invuln = Math.max(p.invuln, D.invuln);
    p.dashCd = D.cooldown * (1 + d.stats.dashCd / 100);
    buzz(8);
  }
  if (p.dashT > 0) {
    p.dashT -= dt;
    moveBody(d.floor, p, p.dashX * D.speed * dt, p.dashY * D.speed * dt, T.player.radius);
    if (Math.floor(p.dashT * 60) % 2 === 0) d.fx.push({ kind: 'ghost', x: p.x, y: p.y, fx: p.fx, fy: p.fy, t: 0.18, max: 0.18 });
    return true;
  }
  return false;
}

function shakeView(n) { View.shake = Math.max(View.shake || 0, n); }

// spread: an angle to fan a second bolt out by; charged: bolts are bigger
// and go through what they hit; mods: the modifiers socketed beside it.
function castSpell(kind, power, spread = 0, charged = false, mods = {}) {
  const d = Game.dive, p = d.p, st = d.stats, S = T.spells, M = T.mods;
  const area = mods.amplify ? M.amplifyArea : 1;
  const dmg = power * (1 + st.spellDmg / 100) * (mods.amplify ? M.amplifyDmg : 1);
  const el = d.castElement || null;
  const aimAt = (range) => {
    const target = nearestEnemy(d, range || d.castRange || S.aimRange);
    return { target, a: target ? Math.atan2(target.y - 4 - (p.y - 8), target.x - p.x) : Math.atan2(p.fy, p.fx) };
  };
  // bolts, lances and embers: three at once with Split
  const fan = (fn) => {
    if (!mods.split) { fn(0, 1); return; }
    for (const k of [-1, 0, 1]) fn(k * M.splitSpread, M.splitMult);
  };
  const chainMore = mods.chainmod ? M.chainJumps : 0;
  if (kind === 'spark' || kind === 'bolt' || kind === 'frost') {
    const { a } = aimAt();
    fan((off, mult) => {
      const sp = S[kind].speed, ang = a + spread + off;
      d.bolts.push({
        x: p.x, y: p.y - 8, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, dmg: dmg * mult, kind, t: kind === 'frost' ? 0.9 : 1.2,
        chain: (kind === 'bolt' && st.powers.stormcaller ? 2 : 0) + chainMore, hitIds: [], big: charged,
        pierce: kind === 'frost' ? S.frost.pierce + (charged ? 3 : 0) : charged ? 3 : 0,
        element: kind === 'frost' ? 'frost' : el,
      });
    });
    return;
  }
  if (kind === 'ember') {
    const { target, a } = aimAt();
    fan((off, mult) => {
      const reach = target ? Math.min(dist(p.x, p.y, target.x, target.y), 150) : 70, ang = a + spread + off;
      const x1 = p.x + Math.cos(ang) * reach, y1 = p.y + Math.sin(ang) * reach;
      d.globs.push({ x: p.x, y: p.y - 10, x0: p.x, y0: p.y - 10, x1, y1, t: 0, max: reach / S.ember.speed, dmg: dmg * mult * (charged ? 1.5 : 1), mine: true, r: S.ember.radius * area });
    });
    return;
  }
  if (kind === 'chain') {
    let from = { x: p.x, y: p.y - 8 }, cur = nearestEnemy(d, S.chain.range * area), hit = [], k = dmg;
    for (let j = 0; cur && j <= S.chain.jumps + chainMore + (charged ? 2 : 0); j++) {
      d.fx.push({ kind: 'arc', x: from.x, y: from.y, x2: cur.x, y2: cur.y - 5, t: 0.2, max: 0.2 });
      hurtEnemy(cur, k, { spell: true, element: 'shock', noProc: true });
      castFxSpot(cur.x, cur.y - 5, 'shock', 0.8);
      hit.push(cur); from = { x: cur.x, y: cur.y - 5 }; k *= S.chain.falloff;
      cur = d.enemies.filter((e) => !e.dead && !hit.includes(e) && dist(e.x, e.y, from.x, from.y) < S.chain.jumpRange * area).sort((a2, b) => dist(a2.x, a2.y, from.x, from.y) - dist(b.x, b.y, from.x, from.y))[0];
    }
    return;
  }
  if (kind === 'nova') {
    const r = S.nova.radius * area;
    d.fx.push({ kind: 'nova', x: p.x, y: p.y - 6, r, t: 0.3, max: 0.3 });
    castFxFor(T.castFx.shapeOf.nova, el, p, 0, { r, col: ART.cores.nova });
    for (const e of d.enemies) if (!e.dead && dist(e.x, e.y, p.x, p.y) < r + e.r) hurtEnemy(e, dmg, { spell: true, element: el });
    return;
  }
  if (kind === 'pull') {
    const r = S.pull.radius * area;
    d.fx.push({ kind: 'pull', x: p.x, y: p.y - 6, r, t: 0.35, max: 0.35 });
    castFxFor(T.castFx.shapeOf.pull, el, p, 0, { r, inward: true, col: ART.cores.pull });
    for (const e of d.enemies) {
      if (e.dead || e.boss || e.type === 'hollow') continue;
      const m = dist(e.x, e.y, p.x, p.y);
      if (m > r || m < 1) continue;
      const k = Math.min(S.pull.speed, (m - 10) * 4);
      e.kx = ((p.x - e.x) / m) * k; e.ky = ((p.y - e.y) / m) * k;
      e.stunT = S.pull.stun; e.state = 'chase';
      hurtEnemy(e, dmg, { spell: true, element: el });
    }
    return;
  }
  if (kind === 'ward') {
    p.ward = Math.max(p.ward, dmg * (mods.amplify ? M.amplifyArea : 1));
    p.wardT = S.ward.time;
    d.fx.push({ kind: 'ward', x: p.x, y: p.y - 6, t: 0.3, max: 0.3 });
    castFxFor(T.castFx.shapeOf.ward, el, p, 0, { r: 14, col: ART.cores.ward });
    return;
  }
  if (kind === 'thorns') {
    // a ring that goes with you, cutting what comes close
    castFxFor(T.castFx.shapeOf.thorns, 'blight', p, 0, { r: S.thorns.radius * area });
    d.auras.push({ kind: 'thorns', r: S.thorns.radius * area, t: S.thorns.time * (charged ? 1.6 : 1), max: S.thorns.time * (charged ? 1.6 : 1), tick: 0, dmg, follow: true });
    return;
  }
  if (kind === 'well') {
    const { target, a } = aimAt();
    const x = target ? target.x : p.x + Math.cos(a) * 50, y = target ? target.y : p.y + Math.sin(a) * 50;
    d.auras.push({ kind: 'well', x, y, r: S.well.radius * area, t: S.well.time, max: S.well.time, tick: 0, dmg, el });
    castFxFor(T.castFx.shapeOf.well, el, { x, y }, a, { r: S.well.radius * area, col: ART.cores.well });
    return;
  }
  if (kind === 'blink' || kind === 'phase') {
    // along the stick if it's held, else the way the diver faces
    const mv = Input.move, dir = Math.hypot(mv.x, mv.y) > 0.2 ? norm(mv.x, mv.y) : norm(p.fx, p.fy), reach = S[kind].reach * area;
    const x0 = p.x, y0 = p.y, steps = 12;
    for (let k = 0; k < steps; k++) moveBody(d.floor, p, (dir.x * reach) / steps, (dir.y * reach) / steps, T.player.radius);
    p.invuln = Math.max(p.invuln, S[kind].invuln);
    castFxFor(T.castFx.shapeOf[kind], el, { x: x0, y: y0 }, Math.atan2(dir.y, dir.x), { to: { x: p.x, y: p.y }, col: ART.cores[kind], cut: kind === 'phase' });
    if (kind === 'phase') {
      const vx = p.x - x0, vy = p.y - y0, L2 = vx * vx + vy * vy || 1;
      for (const e of d.enemies) {
        if (e.dead) continue;
        const t2 = clamp(((e.x - x0) * vx + (e.y - y0) * vy) / L2, 0, 1);
        if (dist(e.x, e.y, x0 + vx * t2, y0 + vy * t2) < e.r + 8) hurtEnemy(e, dmg, { spell: true, element: el, knock: { x: dir.x * 80, y: dir.y * 80 } });
      }
    }
  }
}

// Auras: a thorn ring round the diver, gravity wells where they fell; and
// whatever an Echo has waiting to cast again.
function updateAuras(dt) {
  const d = Game.dive, p = d.p, S = T.spells;
  for (const au of d.auras) {
    au.t -= dt;
    if (au.follow) { au.x = p.x; au.y = p.y; }
    if (au.kind === 'well')
      for (const e of d.enemies) {
        if (e.dead || e.boss || e.type === 'hollow' || T.enemies[e.type].rooted) continue;
        const m = dist(e.x, e.y, au.x, au.y);
        if (m < au.r && m > 3) moveBody(d.floor, e, ((au.x - e.x) / m) * S.well.pull * dt, ((au.y - e.y) / m) * S.well.pull * dt, e.r);
      }
    if ((au.tick -= dt) <= 0) {
      au.tick = S[au.kind].every;
      for (const e of d.enemies) if (!e.dead && dist(e.x, e.y, au.x, au.y) < au.r + e.r) hurtEnemy(e, au.dmg, { spell: true, noProc: true, element: au.kind === 'thorns' ? 'blight' : au.el });
    }
  }
  d.auras = d.auras.filter((au) => au.t > 0);
  for (const l of d.later) if ((l.t -= dt) <= 0 && !l.done) { l.done = true; const was = d.castElement; d.castElement = l.el; l.fn(); d.castElement = was; }
  d.later = d.later.filter((l) => !l.done);
}

function updateBolts(dt) {
  const d = Game.dive, f = d.floor;
  for (const b of d.bolts) {
    b.t -= dt; b.x += b.vx * dt; b.y += b.vy * dt;
    if (TILE_SOLID[floorTile(f, Math.floor(b.x / TILE), Math.floor((b.y + 6) / TILE))]) { b.t = 0; castFxImpact(b, 'wall'); continue; }
    for (const e of d.enemies) {
      if (e.dead || b.hitIds.includes(e) || dist(b.x, b.y, e.x, e.y - 5) > e.r + (b.big ? 7 : 4)) continue;
      const sp0 = Math.hypot(b.vx, b.vy) || 1;
      hurtEnemy(e, b.dmg, { spell: true, knock: { x: (b.vx / sp0) * (b.big ? 120 : 50), y: (b.vy / sp0) * (b.big ? 120 : 50) }, heavy: b.big, element: b.element });
      if (b.big) freezeFrame(T.impact.hitstop * 0.6, false);
      castFxImpact(b, 'hit');
      b.hitIds.push(e);
      if (b.pierce > 0) { b.pierce--; continue; }
      // Stormcaller: on to the next nearest
      const next = b.chain > 0 && d.enemies.filter((o) => !o.dead && !b.hitIds.includes(o) && dist(o.x, o.y, e.x, e.y) < T.onHit.shockRange * 1.5).sort((o1, o2) => dist(o1.x, o1.y, e.x, e.y) - dist(o2.x, o2.y, e.x, e.y))[0];
      if (next && !b.hitIds.includes(next)) {
        b.chain--;
        const a = norm(next.x - b.x, next.y - 4 - b.y), sp = Math.hypot(b.vx, b.vy);
        b.vx = a.x * sp; b.vy = a.y * sp; b.t = 0.6;
      } else b.t = 0;
      break;
    }
  }
  for (const b of d.bolts) if (b.t <= 0) castFxBoltEnd(b);
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
  shakeView(T.impact.hurtShake);
  d.nums.push({ x: p.x, y: p.y - 22, v: Math.max(1, Math.round(dmg)), t: 0.8, hurt: true });
  p.invuln = T.player.hurtInvuln;
  p.hurtT = 0.25;
  p.restT = 0;
  if (d.channel) breakChannel('Hit: the pull let go');
  buzz(30);
  if (p.hp <= 0) { p.hp = 0; startDying(); }
}

function healPlayer(n) {
  const p = Game.dive.p;
  p.hp = Math.min(Game.dive.stats.maxHp, p.hp + n);
}

// opts: { crit, spell, noProc (an arc of lightning doesn't arc again),
// knock: { x, y } px/s, heavy (staggers), element }
function hurtEnemy(e, dmg, opts = {}) {
  const d = Game.dive, st = d.stats, O = T.onHit, El = T.elements;
  if (e.dead) return;
  if (e.state === 'dazed') dmg *= 1.5;
  // a heavy blow to the frozen shatters them
  if (opts.heavy && e.slowT > 0 && opts.element === 'frost') { dmg *= El.shatter; d.fx.push({ kind: 'shatter', x: e.x, y: e.y - 6, t: 0.3, max: 0.3 }); }
  if (opts.element && !opts.noProc) {
    if (opts.element === 'shock' && d.rng.chance(El.shockChance)) {
      const o = nearestEnemy(d, O.shockRange, e, e);
      if (o) { d.fx.push({ kind: 'arc', x: e.x, y: e.y - 5, x2: o.x, y2: o.y - 5, t: 0.15, max: 0.15 }); hurtEnemy(o, dmg * O.shockMult, { noProc: true }); }
    }
    if (opts.element === 'frost') e.slowT = O.chillTime;
    if (opts.element === 'ember') e.burn = { t: El.burnTime, dps: dmg * El.burn };
    if (opts.element === 'blight') e.blight = { t: El.blightTime, dps: dmg * El.blight };
  }
  e.hp -= dmg;
  e.flash = T.enemies.hurtFlash;
  d.nums.push({ x: e.x + d.rng.f(-3, 3), y: e.y - 16, v: Math.max(1, Math.round(dmg)), t: 0.7, crit: opts.crit });
  if (opts.knock) { const k = e.boss || e.type === 'hollow' ? 0.2 : e.type === 'construct' ? 0.5 : 1; e.kvx += opts.knock.x * k; e.kvy += opts.knock.y * k; }
  if (opts.heavy && !e.boss && e.type !== 'hollow' && e.state !== 'dazed') { e.state = 'stagger'; e.t = T.enemies.staggerTime; }
  if (e.type === 'dummy') { if (e.hp <= 0) e.hp = e.maxHp; e.kvx = e.kvy = 0; return; }
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
  tallyKill(d, e);
  if (e.blight) for (const o of d.enemies) if (!o.dead && o !== e && dist(o.x, o.y, e.x, e.y) < T.elements.blightSpread) o.blight = { t: T.elements.blightTime, dps: e.blight.dps };
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
  // what it was made of: its own part, graded by the biome; elites and the
  // warden leave more, and now and then a blueprint, an exotic or a relic
  const grade = d.biome + 1, part = Object.keys(PARTS).find((k) => PARTS[k].from === e.type);
  const parts = (n) => { if (part) for (let k = 0; k < n; k++) drop({ stuff: partId(part, grade), n: 1 }); };
  // a boss's hoard: ordinary parts of any creature (its own heart is apart)
  const hoard = (n) => { for (let k = 0; k < n; k++) drop({ stuff: partId(rng.pick(['chitin', 'ether', 'cog', 'fiber', 'spore']), grade), n: 1 }); };
  const tier = dropTier(d);
  if (e.type === 'keeper') {
    // its lodeline lights, and the dark starts to come back: a short pull
    if (d.zone === 'lair') { d.padDark = false; d.pull = 1; d.pullTime = T.enemies.keeper.afterPull; UI.toast('The lodeline lights. Go, before the dark comes back', 'legendary'); }
    // its heart-shard, and what it had gathered
    drop({ shard: d.biome });
    drop({ echo: true });
    dropBlueprint(d, drop, true);
    hoard(L.bossParts);
    for (let k = 0; k < 2; k++) drop({ exotic: randomExotic(rng) });
    if (rng.chance(L.bossRelic)) drop({ item: makeRelic(tier + 1) });
    return;
  }
  if (e.boss) {
    hoard(L.bossParts);
    drop({ stuff: partId('heart', grade), n: 1 });
    dropBlueprint(d, drop, true);
    if (rng.chance(L.bossRelic)) drop({ item: makeRelic(tier + 1) });
    drop({ exotic: randomExotic(rng) });
    return;
  }
  if (e.elite) {
    parts(rng.i(L.eliteParts[0], L.eliteParts[1]));
    if (rng.chance(L.eliteExotic)) drop({ exotic: randomExotic(rng) });
    if (rng.chance(L.eliteBlueprint)) dropBlueprint(d, drop);
    if (rng.chance(L.eliteRelic)) drop({ item: makeRelic(tier) });
    if (rng.chance(T.story.echoElite)) drop({ echo: true });
  } else {
    if (rng.chance(L.part)) parts(rng.chance(L.partTwo) ? 2 : 1);
    if (rng.chance(L.exotic)) drop({ exotic: randomExotic(rng) });
    if (rng.chance(L.relic)) drop({ item: makeRelic(tier) });
  }
  if (rng.chance(L.mote)) drop({ mote: L.moteHeal });
}

// A blueprint not yet known (nor already carried), likelier one of this
// biome's own; when every one is known, an exotic instead.
// Any exotic but the rifts' own.
function randomExotic(rng) { return rng.pick(T.exotics.filter((x) => !x.riftOnly)).id; }

function dropBlueprint(d, drop, sure) {
  const known = new Set(Save.data.blueprints.concat(d.blueprints.map((b) => b.id), d.drops.filter((x) => x.blueprint).map((x) => x.blueprint), (d.pocket || []).filter((x) => x.blueprint).map((x) => x.blueprint)));
  const local = BLUEPRINT_BIOME[T.biomes[d.biome].id].filter((id) => !known.has(id));
  const any = BP_IDS.filter((id) => !known.has(id));
  const pool = local.length && (sure || d.rng.chance(0.7)) ? local : any;
  if (pool.length) drop({ blueprint: d.rng.pick(pool) });
  else drop({ exotic: randomExotic(d.rng) });
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
    // something put down stays down until the diver has walked away from it
    if (dist(dr.x, dr.y, p.x, p.y) > reach) { dr.warned = false; dr.left = false; continue; }
    if (dr.left) continue;
    if (dr.mote) { healPlayer(dr.mote); dr.gone = true; continue; }
    const room = d.stats.cargo - cargoUsed(d);
    // a pile of ore: take what fits
    if (dr.stuff) {
      const k = Math.min(room, dr.n);
      if (k > 0) {
        d.cargo[dr.stuff] = (d.cargo[dr.stuff] || 0) + k; dr.n -= k;
        // a small +n in the stuff's colour, not a toast: pickups are many
        const pk = parsePart(dr.stuff);
        d.nums.push({ x: p.x + 8, y: p.y - 30 - 7 * d.nums.filter((n) => n.plus && n.t > 0.6).length, v: k, t: 0.9, plus: true, col: ART.ores[dr.stuff] ? ART.ores[dr.stuff][3] : pk ? ART.parts[pk.kind] : '#ffffff' });
        if (parsePart(dr.stuff)) UI.tip('parts', 'Creature parts bind what you forge: each kind brings its own affixes'); }
      if (dr.n > 0) { if (!dr.warned) { dr.warned = true; UI.toast('Cargo full'); } } else dr.gone = true;
      continue;
    }
    // a heart-shard binds to the diver: safe whatever happens now
    if (dr.shard !== undefined) { Story.takeShard(dr.shard); d.gotShard = true; UI.toast('A shard of the star\'s heart', 'legendary'); dr.gone = true; continue; }
    if (dr.echo) { const ec = Story.findEcho(); if (ec) { d.echoes = (d.echoes || 0) + 1; UI.toast('Echo: ' + ec.title, 'magic'); } dr.gone = true; continue; }
    if (dr.blueprint) {
      if (room < 1) { if (!dr.warned) { dr.warned = true; UI.toast('Cargo full'); } continue; }
      d.blueprints.push({ id: dr.blueprint });
      UI.toast(`Blueprint: ${BLUEPRINTS[dr.blueprint].name}. Bring it home to learn it`, 'legendary');
      UI.tip('blueprint', 'Blueprints are learned when you get them home. Pocket one to be sure of it');
      dr.gone = true;
      continue;
    }
    const w = dr.item ? T.cargo.itemWeight : 1;
    if (room < w) {
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
  for (const e of d.pocket || []) n += e.item ? T.cargo.itemWeight : e.blueprint ? 1 : e.n;
  return n + d.items.length * T.cargo.itemWeight + (d.blueprints || []).length;
}
function pocketSlots() { return T.cargo.pocket[Math.min(T.cargo.pocket.length, magnitudeOf(Save.data.star)) - 1] + (Game.dive && Game.dive.tool === 'satchel' ? 1 : 0); }
