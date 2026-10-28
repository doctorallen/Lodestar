'use strict';
// ---------------------------------------------------------------------------
// Elite affixes (DESIGN.md, Enemies). An elite carries one to three, by
// region (T.enemies.eliteAffixes), as Diablo's do: each is shown (its pip,
// its names over its health, and a tell of its own), each changes the
// fight, and each has an answer in the gear or the hands:
//   fast       moves half again as fast
//   tough      extra health
//   volatile   bursts a moment after it dies (step back)
//   insulated  all but shrugs off Shock
//   fireproof  all but shrugs off Ember
//   warded     resists everything until three Force hits crack its shell
//   shifting   its weakness moves to the next element every few seconds
//   frosted    leaves chilling ground where it steps, which slows you: a
//              dash crosses it, Ember melts it
//   mortar     lobs a burst at where you stand, the spot marked first
//   chained    linked to the nearest other foe: they share what they take
//              (hit the weaker, or a Chain or Split hits both)
//   bulwark    every few seconds raises a shell that stops bolts, lances
//              and orbs for a while; close spells pass
//   brood      calls two of its kind every few seconds, four at most (an
//              area spell clears them)
//   hulking    slow, and nothing staggers, stuns or knocks it: its openings
//              are the only way in
//   splitter   splits into two of its kind, half as tough, when it falls
//   leech      its hits heal it; Blight on it stops that
//   blink      blinks to you every few seconds, a flash before it lands
//              (dash on the flash)
//   thorns     close spells cut you back a little: fight it at range
// The numbers are in T.enemies.affix. enemies.js makeEnemy rolls them
// (rollEliteAffix) and calls affixStart; updateEnemies calls affixTick;
// combat.js hurtEnemy, hurtPlayer and killEnemy call affixOnHit,
// affixOnPlayerHit and affixOnDeath; render.js draws them (drawAffixes).
// ---------------------------------------------------------------------------

const ELITE_AFFIX = {
  fast: { name: 'Fast', col: '#7fe8ff', text: 'moves half again as fast' },
  tough: { name: 'Tough', col: '#ffd34d', text: 'extra health' },
  volatile: { name: 'Volatile', col: '#ff5a3a', text: 'bursts a moment after it dies' },
  insulated: { name: 'Insulated', col: '#8f9ac4', text: 'all but shrugs off Shock' },
  fireproof: { name: 'Fireproof', col: '#c8402a', text: 'all but shrugs off Ember' },
  warded: { name: 'Warded', col: '#e4dcf4', text: 'resists everything until Force cracks its shell' },
  shifting: { name: 'Shifting', col: '#ff7ad8', text: 'what it fears moves on every few seconds' },
  frosted: { name: 'Frosted', col: '#4fb4ff', text: 'leaves chilling ground: a dash crosses it, Ember melts it' },
  mortar: { name: 'Mortar', col: '#d8a860', text: 'lobs a burst at where you stand' },
  chained: { name: 'Chained', col: '#ff9a40', text: 'shares what it takes with the foe it\'s linked to' },
  bulwark: { name: 'Bulwark', col: '#9ad8ff', text: 'raises a shell that stops bolts, lances and orbs; close spells pass' },
  brood: { name: 'Broodmother', col: '#9ad04a', text: 'calls its kind to it' },
  hulking: { name: 'Hulking', col: '#c89060', text: 'slow; nothing staggers or knocks it' },
  splitter: { name: 'Splitter', col: '#d8a0ff', text: 'splits in two when it falls' },
  leech: { name: 'Leech', col: '#ff4a6a', text: 'its hits heal it; Blight stops that' },
  blink: { name: 'Blinker', col: '#fff0a0', text: 'blinks to you: dash on the flash' },
  thorns: { name: 'Thorned', col: '#a8c070', text: 'close spells cut you back; fight it at range' },
};
const ELITE_AFFIXES = Object.keys(ELITE_AFFIX);
// Pairs that don't go together, and what a rooted kind (the fighting
// flora) can't carry.
const AFFIX_APART = [['warded', 'bulwark'], ['fast', 'hulking'], ['blink', 'hulking'], ['brood', 'splitter'], ['insulated', 'fireproof']];
const AFFIX_NOT_ROOTED = new Set(['fast', 'blink', 'frosted', 'hulking']);
const hasAffix = (e, id) => !!(e && e.affixes && e.affixes.includes(id));

// An elite's affixes: one, and one more at each level in
// T.enemies.eliteAffixAt (a boss none), weighted by T.enemies.elites, none
// clashing.
function rollEliteAffix(rng, type) {
  const E = T.enemies, level = Game.dive && !Game.dive.hub ? floorLevel(Game.dive) : 1, n = 1 + (E.eliteAffixAt || []).filter((L) => level >= L).length;
  const rooted = type && E[type] && E[type].rooted, out = [];
  for (let k = 0; k < n; k++) {
    const pool = ELITE_AFFIXES.filter((id) => E.elites[id] && !out.includes(id) && !(rooted && AFFIX_NOT_ROOTED.has(id)) && !AFFIX_APART.some(([a, b]) => (a === id && out.includes(b)) || (b === id && out.includes(a))));
    if (!pool.length) break;
    out.push(rng.weighted(pool.map((id) => [E.elites[id], id])));
  }
  return out;
}

// What an affix changes about the foe as it's made (makeEnemy: its health
// and damage are already an elite's).
function affixStart(e) {
  const A = T.enemies.affix;
  if (hasAffix(e, 'fast')) e.speed *= T.enemies.fast;
  if (hasAffix(e, 'hulking')) e.speed *= A.hulking.speed;
  if (hasAffix(e, 'bulwark')) e.shellT = A.bulwark.every * 0.5;
  if (hasAffix(e, 'brood')) e.broodT = A.brood.every * 0.6;
  if (hasAffix(e, 'mortar')) e.mortarT = A.mortar.every * 0.5;
  if (hasAffix(e, 'blink')) e.blinkT = A.blink.every * 0.7;
}

// A blinker's landing: shown for its wind (e.blinkAt.t, set as it's
// marked), then it lands, striking within its reach.
const BLINK = new Tycho.harm.Trigger({ tell: () => T.enemies.affix.blink.wind, zone: { get r() { return T.enemies.affix.blink.reach; } }, once: true });

// Each step (world time), for an awake elite.
function affixTick(d, e, dt) {
  if (!e.affixes || !e.affixes.length || e.dead) return;
  const A = T.enemies.affix, p = d.p, pd = dist(e.x, e.y, p.x, p.y), f = d.floor;
  if (hasAffix(e, 'hulking')) e.stunT = 0;
  // a shell up for `up` s of every `every`
  if (hasAffix(e, 'bulwark')) {
    e.shellT -= dt;
    if (e.shell > 0) { e.shell -= dt; if (e.shell <= 0) { e.shell = 0; e.shellT = A.bulwark.every - A.bulwark.up; } }
    else if (e.shellT <= 0 && e.aggro) { e.shell = A.bulwark.up; snd('react', { x: e.x, y: e.y }); }
  }
  if (!e.aggro || e.hid || d.dying) return;
  // chilling ground where it steps
  if (hasAffix(e, 'frosted') && (e.frostT = (e.frostT || 0) - dt) <= 0) {
    e.frostT = A.frosted.every;
    d.puddles.push({ x: e.x, y: e.y + 2, r: A.frosted.r, t: A.frosted.time, max: A.frosted.time, dps: 0, slow: A.frosted.slow, col: NATURE_COLS.frost, frost: e });
  }
  // a mortar: the spot marked, then a burst
  if (hasAffix(e, 'mortar') && pd < A.mortar.range && (e.mortarT -= dt) <= 0) {
    e.mortarT = A.mortar.every;
    const g = { x: e.x, y: e.y - 10, x0: e.x, y0: e.y - 10, x1: p.x, y1: p.y, t: 0, max: A.mortar.wind, dmg: e.dmg * A.mortar.dmg, burst: A.mortar.r, col: ELITE_AFFIX.mortar.col };
    d.globs.push(g);
    d.fx.push({ kind: 'mark', x: p.x, y: p.y, r: A.mortar.r, t: A.mortar.wind, max: A.mortar.wind, col: ELITE_AFFIX.mortar.col });
  }
  // the brood: two of its kind, four at most
  if (hasAffix(e, 'brood') && (e.broodT -= dt) <= 0) {
    e.broodT = A.brood.every;
    const kin = d.enemies.filter((c) => !c.dead && c.broodOf === e).length, type = T.enemies[e.type].rooted || e.boss || FOE_NAMES[e.type] ? 'crawler' : e.type;
    for (let k = 0; k < Math.min(A.brood.n, A.brood.most - kin); k++) {
      const c = makeEnemy(type, e.x + d.rng.f(-14, 14), e.y + d.rng.f(-8, 8), Math.max(1, e.level - 1), null);
      if (bodyHits(f, c.x, c.y, c.r)) { c.x = e.x; c.y = e.y; }
      c.hp = c.maxHp = Math.round(c.maxHp * A.brood.hp); c.aggro = true; c.broodOf = e; c.wakeT = 0.4;
      d.enemies.push(c);
    }
    d.fx.push({ kind: 'mark', x: e.x, y: e.y, r: 14, t: 0.4, max: 0.4, col: ELITE_AFFIX.brood.col });
  }
  // a blink: a flash where it will land (a mark, Tycho's trigger), then
  // it's there, and strikes what's within reach
  if (hasAffix(e, 'blink')) {
    if (e.blinkAt) {
      if (BLINK.down(e.blinkAt, dt)) {
        const to = e.blinkAt;
        if (!bodyHits(f, to.x, to.y, e.r)) { e.x = to.x; e.y = to.y; }
        if (Tycho.harm.inZone(BLINK.def.zone, e.x, e.y, p.x, p.y, 0) && !d.dying) hurtPlayer(e.dmg * A.blink.dmg, e);
        d.fx.push({ kind: 'mark', x: e.x, y: e.y, r: A.blink.reach, t: 0.25, max: 0.25, col: ELITE_AFFIX.blink.col, burst: true });
        snd('dash', { x: e.x, y: e.y });
        e.blinkAt = null; e.cd = Math.max(e.cd, 0.5);
      }
    } else if ((e.blinkT -= dt) <= 0 && pd > A.blink.from && !ATTACKING.has(e.state)) {
      e.blinkT = A.blink.every;
      const a = Math.atan2(p.y - e.y, p.x - e.x), r = T.player.radius + e.r + 4;
      let at = { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r };
      if (bodyHits(f, at.x, at.y, e.r)) at = { x: p.x - Math.cos(a) * r, y: p.y - Math.sin(a) * r };
      if (bodyHits(f, at.x, at.y, e.r)) at = { x: p.x, y: p.y };
      e.blinkAt = { x: at.x, y: at.y, t: A.blink.wind };
      d.fx.push({ kind: 'mark', x: at.x, y: at.y, r: A.blink.reach, t: A.blink.wind, max: A.blink.wind, col: ELITE_AFFIX.blink.col });
    }
  }
  // chained: to the nearest other foe that's awake, while it lives
  if (hasAffix(e, 'chained')) {
    if (e.chain && (e.chain.dead || e.chain.hid)) e.chain = null;
    if (!e.chain) {
      let best = null, bd = A.chained.reach;
      for (const o of d.enemies) { if (o === e || o.dead || o.hid || o.boss || o.type === 'dummy' || o.broodOf) continue; const m = dist(o.x, o.y, e.x, e.y); if (m < bd) { bd = m; best = o; } }
      e.chain = best;
    }
  }
}

// A hit on the foe (a stage of hurtEnemy's, before the damage lands):
// what its affixes make of it. h.blow.proj: a bolt, lance, orb or shard;
// h.blow.close: a close Form. Thorns cut the Kindler back, and a chain
// shares the hit with its partner: blows of their own, sent on from the hit
// (Tycho's h.send). Returns the damage to take (0: turned).
function affixOnHit(e, dmg, h) {
  if (!e.affixes || !e.affixes.length) return dmg;
  const A = T.enemies.affix, d = Game.dive, opts = h.blow;
  if (e.shell > 0 && opts.proj) {
    e.shellHit = 0.2;
    if (Game.realT - (e.blockedAt || -9) > 0.6) { e.blockedAt = Game.realT; reactWord(e, 'BLOCKED', ELITE_AFFIX.bulwark.col); }
    return 0;
  }
  if (opts.close && hasAffix(e, 'thorns') && opts.spell && !d.dying) {
    const p = d.p;
    if (p.invuln <= 0) { h.send(p, { amount: e.dmg * A.thorns.back, by: e }, KINDLER_HIT); d.fx.push({ kind: 'mark', x: p.x, y: p.y, r: 8, t: 0.2, max: 0.2, col: ELITE_AFFIX.thorns.col, burst: true }); }
  }
  if (hasAffix(e, 'chained') && e.chain && !e.chain.dead && !e.chain.hid) {
    const share = dmg * A.chained.share;
    h.send(e.chain, { amount: share }, CHAIN_SHARE);
    return dmg - share;
  }
  return dmg;
}
// What a chained foe's partner takes of its hit: straight to its health,
// through nothing.
const CHAIN_SHARE = new Tycho.harm.Pipeline([(h) => {
  const o = h.to, share = h.amount;
  o.hp -= share; Tycho.harm.flash(o, T.enemies.hurtFlash);
  Game.dive.nums.push({ x: o.x, y: o.y - 16, v: Math.max(1, Math.round(share)), t: 0.6, foe: o, col: ELITE_AFFIX.chained.col });
  if (o.hp <= 0 && o.type !== 'dummy') killEnemy(o);
}]);
// Whether a hit can stagger, flinch or knock it (hurtEnemy).
const affixSteady = (e) => hasAffix(e, 'hulking');
const affixKnock = (e) => (hasAffix(e, 'hulking') ? T.enemies.affix.hulking.knock : 1);

// The foe's hit landed on the diver (hurtPlayer): a leech heals.
function affixOnPlayerHit(e, dmg) {
  if (!e || !hasAffix(e, 'leech') || e.dead || e.blight) return;
  const heal = dmg * T.enemies.affix.leech.heal;
  e.hp = Math.min(e.maxHp, e.hp + heal);
  if (heal >= 1) { Game.dive.nums.push({ x: e.x, y: e.y - 16, v: Math.round(heal), t: 0.6, foe: e, col: ELITE_AFFIX.leech.col, plus: true }); reactWord(e, 'LEECH', ELITE_AFFIX.leech.col); }
}

// It fell (killEnemy, after its drops): a splitter's halves.
function affixOnDeath(e) {
  if (!hasAffix(e, 'splitter')) return;
  const d = Game.dive, A = T.enemies.affix.splitter, type = T.enemies[e.type].rooted || FOE_NAMES[e.type] ? 'crawler' : e.type;
  for (let k = 0; k < A.n; k++) {
    const a = (k / A.n) * Math.PI * 2, c = makeEnemy(type, e.x + Math.cos(a) * 8, e.y + Math.sin(a) * 6, e.level, null);
    if (bodyHits(d.floor, c.x, c.y, c.r)) { c.x = e.x; c.y = e.y; }
    c.hp = c.maxHp = Math.round(c.maxHp * A.hp); c.aggro = true; c.broodOf = e; c.wakeT = 0.3; c.kvx = Math.cos(a) * 60; c.kvy = Math.sin(a) * 60;
    d.enemies.push(c);
  }
  d.fx.push({ kind: 'mark', x: e.x, y: e.y, r: 12, t: 0.3, max: 0.3, col: ELITE_AFFIX.splitter.col, burst: true });
}

// Ember on a frosted foe, or burning ground, melts its chilling ground.
function affixMelt(d, e) {
  if (e && hasAffix(e, 'frosted')) for (const pu of d.puddles) if (pu.frost === e) pu.t = Math.min(pu.t, 0.2);
}

// ---------------------------------------------------------------------------
// Drawing (render.js drawEnemy, after the foe; the names over its health
// are drawn with the badges, drawAffixNames)
// ---------------------------------------------------------------------------
function drawAffixes(d, e, spr, sx, sy, fx, fy, tick, lights) {
  if (!e.affixes || !e.affixes.length) return;
  // a bulwark's shell: a ring of pale light round it while it's up
  if (e.shell > 0) {
    const rx = Math.round(spr.w / 2 + 3), ry = Math.round(spr.h / 2 + 2), cy = sy + Math.round(spr.h / 2), col = e.shellHit > 0 ? '#ffffff' : ELITE_AFFIX.bulwark.col;
    for (const [x, y, a] of cfxEllipse(rx, ry)) if ((Math.round(a * 8 + Game.realT * 3) & 1) === 0) dot(fx + x, cy + y, col, true, e.shell < 0.5 ? 0.4 : 0.8);
    cfxLight(lights, fx, cy, TILE * 1.2, 0.35, rgb01(ELITE_AFFIX.bulwark.col));
  }
  if (e.shellHit > 0) e.shellHit -= 1 / 60;
  // a chain to its partner: dots along the line, swaying
  if (e.chain && !e.chain.dead && !e.chain.hid) {
    const o = e.chain, ax = fx, ay = sy + Math.round(spr.h / 2), bx = Math.round(o.x * AP) + (fx - Math.round(e.x * AP)), by = Math.round(o.y * AP) + (sy - Math.round(e.y * AP)) + Math.round(spr.h / 2);
    const n = Math.max(4, Math.round(Math.hypot(bx - ax, by - ay) / (3 * AF)));
    for (let k = 1; k < n; k++) { const t = k / n, sag = Math.sin(t * Math.PI) * 3 * AF * Math.sin(Game.realT * 2 + t * 4); dot(Math.round(lerp(ax, bx, t)), Math.round(lerp(ay, by, t) + sag), k % 2 ? ELITE_AFFIX.chained.col : '#5a3010', true, 0.8); }
  }
  // a blinker about to land: its flash is a 'mark' fx (render.js)
}
// The names of its affixes, in the pixel hand over its badges.
function affixNames(e) { return e.affixes && e.affixes.length ? e.affixes.map((id) => ELITE_AFFIX[id].name.toUpperCase()).join(' ') : ''; }
