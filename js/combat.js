'use strict';
// ---------------------------------------------------------------------------
// Fighting. The rig drives two spells, each its own button (spell A, the
// right wrist; spell B, the left): a press casts it (circuits.js) for
// charge, and holding charges a stronger cast. A press during a cooldown
// is held over until it ends. With no rig worn, spell A is a free Arc. The dash is a burst of
// speed that nothing can touch. Hits stop the world for a moment and knock
// enemies back (the view never shakes); heavy ones stagger them. Kills drop
// creature parts, exotics, modules (their pattern caught, modules.js),
// sealed relics and healing motes onto the floor.
//
// The damage is on Tycho's harm part (Tycho.harm, vendor/tycho/docs/
// harm.md): a blow on the Kindler (hurtPlayer) or on a foe (hurtEnemy)
// lands through a pipeline of stages, Tycho's own (a gate, a multiplier,
// the nature's resistance, armor, a ward's soak, the reactions, knockback
// by weight, stagger and flinch, the target held still) and this game's
// (its affixes, a Keeper's phase, the statuses an element leaves, the
// number, the wake and the procs); the world's hold still is Tycho's
// Hitstop, and the statuses and reactions are reactions.js's on Tycho's.
// ---------------------------------------------------------------------------

// The nearest living enemy within range that the diver can see.
function nearestEnemy(d, range, from = d.p, except = null) {
  let best = null, bd = range;
  for (const e of d.enemies) {
    if (e.dead || e.hid || e === except) continue;
    const m = dist(from.x, from.y, e.x, e.y);
    if (m < bd && clearLine(d.floor, from.x, from.y - 6, e.x, e.y - 4)) { bd = m; best = e; }
  }
  return best;
}

// Each step: presses, holds and releases of both spells' buttons.
function updateHands(dt) {
  const d = Game.dive, p = d.p, item = Save.data.equip.main;
  p.strikeT = Math.max(0, (p.strikeT || 0) - dt);
  for (const slot of ['main', 'off']) {
    const h = p.hands[slot], btn = Input.hand(slot);
    h.cd = Math.max(0, h.cd - dt);
    h.comboT = Math.max(0, h.comboT - dt);
    h.buffer = Math.max(0, h.buffer - dt);
    if (!item && slot === 'off') { h.holdT = 0; continue; }
    if (btn.pressed) { h.buffer = 0.25; h.holdT = 0; h.holding = true; }
    if (h.buffer > 0 && h.cd <= 0 && !d.dying) { h.buffer = 0; castHand(slot, item, h, false); }
    if (h.holding && btn.down) h.holdT += dt;
    if (btn.released || (!btn.down && h.holding)) {
      if (h.holding && chargeLevel(h) >= 1 && !d.dying) castHand(slot, item, h, true);
      h.holding = false; h.holdT = 0;
    }
  }
}

// How charged a hand is, 0–1.
function chargeLevel(h) {
  const H = T.hands;
  return clamp((h.holdT - H.chargeStart) / (H.chargeFull - H.chargeStart), 0, 1);
}

// A hit lands: the world holds still a moment. Only a heavy hit can freeze
// it again straight after another, so a flurry doesn't stutter. (Tycho's:
// Game.hitstop and Game.frozeAt, held in main.js step.)
const HITSTOP = new Tycho.harm.Hitstop({ state: Game, gap: () => T.impact.stopGap, clock: () => Game.realT });
function freezeFrame(t, heavy) { HITSTOP.freeze(t, heavy); }

// The dash: when asked for and ready, a burst along the stick (or the way
// the diver faces).
function updateDash(dt) {
  const d = Game.dive, p = d.p, D = T.dash;
  p.dashCd = Math.max(0, p.dashCd - dt);
  const req = Input.consumeDash();
  // (not while walking the thread out: veins.js; planted, he's free to fight)
  if (req && d.thread && !d.hold) { UI.toast('Not with the thread in hand'); return false; }
  if (req && p.dashCd <= 0 && !d.dying) {
    const mv = typeof req === 'object' ? req : Input.move;
    const dir = Math.hypot(mv.x, mv.y) > 0.2 ? norm(mv.x, mv.y) : norm(p.fx, p.fy);
    p.dashT = D.time; p.dashX = dir.x; p.dashY = dir.y;
    p.fx = dir.x; p.fy = dir.y;
    p.invuln = Math.max(p.invuln, D.invuln);
    p.dashCd = D.cooldown * (1 + d.stats.dashCd / 100);
    snd('dash');
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

// (the view's shake, Tycho's: VIEW_SHAKE, in main.js)
function shakeView(n) { VIEW_SHAKE.kick(n); }

// ---------------------------------------------------------------------------
// Damage
// ---------------------------------------------------------------------------
// A blow on the Kindler: not while he can't be touched or is falling; his
// thick skin; the lattice is the armour, and it's only as hard as the light
// in it (game.js latticeK); a ward takes it first, and what strikes a ward
// is struck back, with its element; then the light it knocks out of him.
const KINDLER_HIT = new Tycho.harm.Pipeline([
  Tycho.harm.gate((h) => !(h.to.invuln > 0 || Game.dive.dying)),
  Tycho.harm.scale(() => motesPassive('thickskin'), 'thick skin'),
  Tycho.harm.armor({ k: () => T.items.armorK, of: () => { const d = Game.dive, st = d.stats; return st.armor * latticeK(d) + (st.litArmor && restingLight(d) ? st.litArmor : 0); } }),
  Tycho.harm.soak('ward', { first: wardStrikesBack, gone: wardGone }),
  kindlerStruck,
]);
function wardStrikesBack(h) {
  const p = h.to, from = h.blow.by;
  if (from && from.hp !== undefined && !from.dead && p.wardS) circuitHit(p.wardS, from, p.wardHit, { noChain: true });
}
function kindlerStruck(h) {
  const d = Game.dive, p = h.to, dmg = h.amount, from = h.blow.by;
  p.hp -= dmg;
  shakeView(T.impact.hurtShake);
  d.nums.push({ x: p.x, y: p.y - 22, v: Math.max(1, Math.round(dmg)), t: 0.8, hurt: true });
  p.invuln = T.player.hurtInvuln;
  p.hurtT = 0.25;
  p.restT = 0;
  if (from && from.affixes) affixOnPlayerHit(from, dmg);
  if (d.channel) breakChannel('Hit: it broke off');
  snd('hurt');
  buzz(30);
  if (p.hp <= 0) { p.hp = 0; startDying(); }
}
function hurtPlayer(dmg, from) { KINDLER_HIT.land(Game.dive.p, { amount: dmg, by: from }, { rng: Game.dive.rng }); }

function healPlayer(n) {
  const p = Game.dive.p;
  p.hp = Math.min(Game.dive.stats.maxHp, p.hp + n);
}

// A blow on a foe, in order: a foe under the sand, the water or on the
// roof can't be struck; open to a counter (dazed, or exposed) it takes
// more; its nature (natures.js elementMult), and a Slag Crab's shell, which
// while it's shut stands in for what the crab resists rather than adding
// to it (what it fears still tells: foes.js crabShell); Wick notes it;
// brittle, more; its affixes (a shell that turns bolts, a chain that shares
// the hit, thorns that cut back: affixes.js); Ember melts a frosted elite's
// ground; a Keeper's phase (enemies.js); the reactions its elements set off
// with the statuses it carries, then the statuses they leave (reactions.js);
// Force cracks a warded shell; a ward it cast (foecast.js) soaks the blow;
// then it lands: its health, its rim flashing the hit's element, the number;
// the knock, by its weight; a heavy blow staggers it, a solid one breaks
// off its wind-up; it holds still a moment; it wakes; the Kindler's traits.
// opts (the blow's fields): { crit, spell, noProc (an arc of lightning
// doesn't arc again, and sets off no reaction), knock: { x, y } px/s,
// heavy (staggers), els (its elements, one or two: each brings its status,
// on its share of the damage), or element (one); att: the elements its
// caster's ore is attuned to (their statuses last longer) }
const FOE_HIT = new Tycho.harm.Pipeline([
  Tycho.harm.gate((h) => !(h.to.dead || h.to.hid)),
  Tycho.harm.scale((h) => (h.to.state === 'dazed' || FOE_EXPOSED.has(h.to.state) ? T.enemies.exposed : 1), 'exposed'),
  Tycho.harm.resist({ of: (e, els) => elementMult(e, els), shape: (h, m) => { if (h.to.type !== 'crab') return m; const sh = crabShell(h.to, h.blow); return sh < 1 ? sh * Math.max(1, m) : m; } }),
  foeNatureSeen,
  Tycho.harm.scale((h) => (h.to.brittleT > 0 ? T.circuits.react.brittle.mult : 1), 'brittle'),
  foeAffixesHit,
  foePhaseHit,
  // (reactions.js, loaded after this file)
  (h) => FOE_REACT.land(h),
  (h) => foeStatusesLeft(h),
  foeWardCracked,
  Tycho.harm.soak('ward', { when: (h) => !!h.to.wardS && h.to.ward > 0, gone: wardGone }),
  foeStruck,
  Tycho.harm.knock({ weight: (e) => { const kd = T.enemies[e.type].knock; return (e.boss || e.type === 'hollow' ? 0.2 : e.type === 'construct' ? 0.5 : kd !== undefined ? kd : 1) * affixKnock(e); } }),
  Tycho.harm.stagger({
    can: (e) => !e.boss && e.type !== 'hollow', steady: affixSteady, open: (e) => e.state !== 'dazed', heavy: () => T.enemies.staggerTime, scale: 'staggerK',
    flinch: { share: () => T.impact.flinch, time: () => T.impact.flinchTime, gap: () => T.impact.flinchGap, clock: () => Game.t },
  }),
  Tycho.harm.hold({ field: 'hitT', time: () => T.impact.targetStop, heavy: () => T.impact.heavyTargetStop, can: (e) => !e.boss && e.type !== 'hollow' }),
  foeAfterHit,
]);
function hurtEnemy(e, dmg, opts = {}) {
  return FOE_HIT.land(e, Object.assign({}, opts, { amount: dmg, kinds: opts.els || (opts.element ? [opts.element] : null) }), { rng: Game.dive.rng });
}
// (the hit's sound and its ring say the verdict too: circuits.js
// circuitHit, render.js 'verdict')
function foeNatureSeen(h) {
  const e = h.to, d = Game.dive, verdict = h.verdict;
  if (h.kinds && h.blow.spell) {
    learnNature(e, h.kinds, verdict);
    if (verdict && Game.realT - (e.verdictFxAt || -9) > 0.12) { e.verdictFxAt = Game.realT; d.fx.push({ kind: 'verdict', v: verdict, el: h.kinds[0], x: e.x, y: e.y - 5, t: 0.28, max: 0.28 }); }
  }
  e.lastVerdict = verdict;
}
function foeAffixesHit(h) {
  const e = h.to;
  if (!e.affixes || !e.affixes.length) return;
  h.amount = affixOnHit(e, h.amount, h);
  if (h.amount <= 0) { Tycho.harm.flash(e, T.enemies.hurtFlash, { col: null }); h.stop(); }
}
function foePhaseHit(h) {
  const e = h.to;
  if (h.kinds && h.kinds.includes('ember')) affixMelt(Game.dive, e);
  if (e.type === 'keeper') h.amount = keeperPhaseHit(e, h.amount, h.kinds, h.blow);
}
function foeWardCracked(h) { if (h.kinds && h.kinds.includes('force') && h.to.ward > 0) crackWard(h.to, h.blow.heavy); }
function foeStruck(h) {
  const e = h.to, d = Game.dive, dmg = h.amount, els = h.kinds, verdict = h.verdict;
  e.hp -= dmg;
  // the struck enemy's rim takes the hit's element (Force's is white)
  Tycho.harm.flash(e, T.enemies.hurtFlash, { col: els && els[0] !== 'force' ? ELEMENT_COLS[els[0]] : null });
  // WEAK or RESIST under a number at most once every verdictEvery s over a
  // foe, and not when a reaction's name shows for the hit: the number's
  // colour still says it
  const quiet = !verdict || e.reactWordAt === Game.realT || Game.realT - (e.verdictAt || -9) < T.circuits.react.verdictEvery;
  if (!quiet) e.verdictAt = Game.realT;
  d.nums.push({ x: e.x + h.rng.f(-3, 3), y: e.y - 16, v: Math.max(1, Math.round(dmg)), t: 0.7, crit: h.blow.crit, verdict, foe: e, quiet });
}
function foeAfterHit(h) {
  const e = h.to, d = Game.dive, st = d.stats, O = T.onHit, dmg = h.amount;
  if (e.type === 'dummy') { if (e.hp <= 0) e.hp = e.maxHp; e.kvx = e.kvy = 0; return; }
  e.wakeT = 0;
  wake(d, e);
  if (st.leech) healPlayer((dmg * st.leech) / 100);
  if (!h.blow.noProc) {
    if (st.chill && h.rng.f(100) < st.chill) FOE_STATUS.put(e, 'chill', O.chillTime);
    if (st.shock && h.rng.f(100) < st.shock) {
      const o = nearestEnemy(d, O.shockRange, e, e);
      if (o) { d.fx.push({ kind: 'arc', x: e.x, y: e.y - 5, x2: o.x, y2: o.y - 5, t: 0.15, max: 0.15, col: ELEMENT_COLS.shock }); h.send(o, { amount: dmg * O.shockMult, kinds: ['shock'], noProc: true }); }
    }
  }
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
  const d = Game.dive, st = d.stats, L = T.loot, rng = d.rng;
  e.dead = true;
  d.kills++;
  // (counted by kind, for the shapes the star reads from the dark: the
  // third step)
  if (e.type !== 'dummy') { Save.data.kills++; const k = Save.data.killsOf || (Save.data.killsOf = {}); k[e.type] = (k[e.type] || 0) + (e.elite ? 2 : 1); motesKill(d, e); }
  // its poison spreads to those about it as it falls
  if (FOE_STATUS.has(e, 'poison')) FOE_STATUS.spread(e, 'poison', d.enemies, { r: T.elements.blightSpread, reach: 'middle', who: (o) => !o.dead, as: (s) => ({ t: T.elements.blightTime, dps: s.dps }) });
  castFxAbsorb(d, e);
  snd('kill', { x: e.x, y: e.y, big: !!e.boss });
  if (hasAffix(e, 'volatile')) d.fx.push({ kind: 'volatile', x: e.x, y: e.y, t: T.enemies.volatileFuse, max: T.enemies.volatileFuse, dmg: e.dmg * T.enemies.volatileDmg });
  if (st.powers.lodeheart) healPlayer(3);
  // nothing drops: a creature killed enough leaves its shape in you (the
  // third step). A mote of light now and then, so the dark gives a little
  // back.
  if (!e.boss && e.type !== 'hollow' && rng.chance(L.mote)) {
    let x = e.x + rng.f(-6, 6), y = e.y + rng.f(-4, 4);
    if (TILE_SOLID[floorTile(d.floor, Math.floor(x / TILE), Math.floor(y / TILE))]) { x = e.x; y = e.y; }
    d.drops.push({ x, y, t: 0, mote: Math.max(L.moteHeal, Math.round(st.maxHp * L.moteShare)) });
  }
  affixOnDeath(e);
}

// ---------------------------------------------------------------------------
// Effects that do something after a moment (a volatile elite's blast), and
// picking things up
// ---------------------------------------------------------------------------
// A volatile elite's blast: a mark (Tycho's trigger) that goes off once
// its fuse has burnt down, round where it fell.
const VOLATILE = new Tycho.harm.Trigger({ zone: { get r() { return T.enemies.volatileRadius; } }, once: true });
function updateCombatFx(dt) {
  const d = Game.dive, p = d.p;
  for (const fx of d.fx) {
    fx.t -= dt;
    if (fx.kind === 'volatile' && VOLATILE.goes(fx)) {
      if (VOLATILE.inside(fx, p.x, p.y, 0)) hurtPlayer(fx.dmg, fx);
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
    if (dr.mote) { healPlayer(dr.mote); dr.gone = true; snd('heal'); continue; }
    dr.gone = true;
    buzz(12);
  }
  d.drops = d.drops.filter((dr) => !dr.gone);
}
