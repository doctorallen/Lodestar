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
// it again straight after another, so a flurry doesn't stutter.
function freezeFrame(t, heavy) {
  if (!heavy && Game.realT - (Game.frozeAt || -1) < T.impact.stopGap) return;
  Game.hitstop = Math.max(Game.hitstop, t);
  Game.frozeAt = Game.realT;
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

function shakeView(n) { View.shake = Math.max(View.shake || 0, n); }

// ---------------------------------------------------------------------------
// Damage
// ---------------------------------------------------------------------------
function hurtPlayer(dmg, from) {
  const d = Game.dive, p = d.p, st = d.stats;
  if (p.invuln > 0 || d.dying) return;
  const armor = st.armor + (st.litArmor && restingLight(d) ? st.litArmor : 0);
  dmg *= T.items.armorK / (T.items.armorK + armor);
  if (p.ward > 0) {
    // what strikes a ward is struck back, with its element
    if (from && from.hp !== undefined && !from.dead && p.wardS) circuitHit(p.wardS, from, p.wardHit, { noChain: true });
    const soak = Math.min(p.ward, dmg); p.ward -= soak; dmg -= soak;
    if (p.ward <= 0) wardGone(p);
  }
  // Wick's shield, once a fight, when it would leave you low (wick.js)
  if (dmg > 0 && wickShieldBlocks(d, dmg)) { p.invuln = T.player.hurtInvuln; return; }
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

function healPlayer(n) {
  const p = Game.dive.p;
  p.hp = Math.min(Game.dive.stats.maxHp, p.hp + n);
}

// opts: { crit, spell, noProc (an arc of lightning doesn't arc again, and
// sets off no reaction), knock: { x, y } px/s, heavy (staggers), els (its
// elements, one or two: each brings its status, on its share of the
// damage), or element (one); att: the elements its caster's ore is attuned
// to (their statuses last longer) }
function hurtEnemy(e, dmg, opts = {}) {
  const d = Game.dive, st = d.stats, O = T.onHit, I = T.impact;
  // (a foe under the sand, the water or on the roof can't be struck)
  if (e.dead || e.hid) return;
  const els = opts.els || (opts.element ? [opts.element] : null);
  if (e.state === 'dazed' || FOE_EXPOSED.has(e.state)) dmg *= T.enemies.exposed;
  // its nature: weak, resistant, or neither (natures.js)
  let verdict = null, m = 1;
  if (els) {
    m = elementMult(e, els);
    verdict = m > 1.01 ? 'W' : m < 0.99 ? 'R' : null;
    if (opts.spell) learnNature(e, els, verdict);
    // (the hit's sound and its ring say it too: circuits.js circuitHit,
    // render.js 'verdict')
    if (opts.spell && verdict && Game.realT - (e.verdictFxAt || -9) > 0.12) { e.verdictFxAt = Game.realT; d.fx.push({ kind: 'verdict', v: verdict, el: els[0], x: e.x, y: e.y - 5, t: 0.28, max: 0.28 }); }
  }
  e.lastVerdict = verdict;
  // a Slag Crab's shell (foes.js): while it's shut it stands in for what
  // the crab resists, rather than adding to it; what it fears still tells
  if (e.type === 'crab') { const sh = crabShell(e, opts); if (sh < 1) m = sh * Math.max(1, m); }
  dmg *= m;
  if (e.brittleT > 0) dmg *= T.circuits.react.brittle.mult;
  // its affixes: a shell that turns bolts, a chain that shares the hit,
  // thorns that cut back (affixes.js)
  if (e.affixes && e.affixes.length) { dmg = affixOnHit(e, dmg, opts); if (dmg <= 0) { e.flash = T.enemies.hurtFlash; e.flashCol = null; return; } }
  if (els && els.includes('ember')) affixMelt(d, e);
  // a Keeper's phase: a gear check (enemies.js)
  if (e.type === 'keeper') dmg = keeperPhaseHit(e, dmg, els, opts);
  // what it sets off with the statuses it carries (reactions.js), then its own
  if (els && !opts.noProc) {
    const o = { dmg, heavy: !!opts.heavy, knock: opts.knock, att: opts.att, statusK: opts.statusK || 1, extra: 0 };
    dmg = dmg * circuitReact(e, els, o) + o.extra;
    if (e.dead) return;
    circuitStatuses(e, els, dmg, o);
  }
  // Force cracks a warded shell
  if (els && els.includes('force') && e.ward > 0) crackWard(e, opts.heavy);
  e.hp -= dmg;
  e.flash = T.enemies.hurtFlash;
  // the struck enemy's rim takes the hit's element (Force's is white)
  e.flashCol = els && els[0] !== 'force' ? ELEMENT_COLS[els[0]] : null;
  // WEAK or RESIST under a number at most once every verdictEvery s over a
  // foe, and not when a reaction's name shows for the hit: the number's
  // colour still says it
  const quiet = !verdict || e.reactWordAt === Game.realT || Game.realT - (e.verdictAt || -9) < T.circuits.react.verdictEvery;
  if (!quiet) e.verdictAt = Game.realT;
  d.nums.push({ x: e.x + d.rng.f(-3, 3), y: e.y - 16, v: Math.max(1, Math.round(dmg)), t: 0.7, crit: opts.crit, verdict, foe: e, quiet });
  const steady = affixSteady(e);
  if (opts.knock) { const kd = T.enemies[e.type].knock, k = (e.boss || e.type === 'hollow' ? 0.2 : e.type === 'construct' ? 0.5 : kd !== undefined ? kd : 1) * affixKnock(e); e.kvx += opts.knock.x * k; e.kvy += opts.knock.y * k; }
  if (opts.heavy && !e.boss && e.type !== 'hollow' && !steady && e.state !== 'dazed') { e.state = 'stagger'; e.t = T.enemies.staggerTime * (opts.staggerK || 1); }
  else if (e.state === 'windup' && !e.boss && e.type !== 'hollow' && !steady && dmg >= e.maxHp * I.flinch && Game.t - (e.flinchAt || -9) > I.flinchGap) {
    // a solid hit breaks off its wind-up
    e.state = 'stagger'; e.t = I.flinchTime; e.flinchAt = Game.t;
  }
  // it holds still a moment as the hit lands (the knock still takes it)
  if (!e.boss && e.type !== 'hollow') e.hitT = Math.max(e.hitT || 0, opts.heavy ? I.heavyTargetStop : I.targetStop);
  if (e.type === 'dummy') { if (e.hp <= 0) e.hp = e.maxHp; e.kvx = e.kvy = 0; return; }
  e.wakeT = 0;
  wake(d, e);
  if (st.leech) healPlayer((dmg * st.leech) / 100);
  if (!opts.noProc) {
    if (st.chill && d.rng.f(100) < st.chill) e.slowT = O.chillTime;
    if (st.shock && d.rng.f(100) < st.shock) {
      const o = nearestEnemy(d, O.shockRange, e, e);
      if (o) { d.fx.push({ kind: 'arc', x: e.x, y: e.y - 5, x2: o.x, y2: o.y - 5, t: 0.15, max: 0.15, col: ELEMENT_COLS.shock }); hurtEnemy(o, dmg * O.shockMult, { els: ['shock'], noProc: true }); }
    }
  }
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
  const d = Game.dive, st = d.stats, L = T.loot, rng = d.rng;
  e.dead = true;
  d.kills++;
  tallyKill(d, e);
  // the suit reads its pattern (patterns.js)
  scanKill(d, e);
  if (e.blight) for (const o of d.enemies) if (!o.dead && o !== e && dist(o.x, o.y, e.x, e.y) < T.elements.blightSpread) o.blight = { t: T.elements.blightTime, dps: e.blight.dps };
  castFxDeath(e.x, e.y - 5, ENEMY_PAL[T.biomes[d.biome].id].crystal[0], !!e.boss);
  snd('kill', { x: e.x, y: e.y, big: !!e.boss });
  if (hasAffix(e, 'volatile')) d.fx.push({ kind: 'volatile', x: e.x, y: e.y, t: T.enemies.volatileFuse, max: T.enemies.volatileFuse, dmg: e.dmg * T.enemies.volatileDmg });
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
  // what it leaves: ore (the dark is of the world, and carries the
  // world's body in it), a Keeper its shard and an echo; and what it
  // teaches the star (facets.js): an elite the Shape or Turn its nature
  // names, a warden or a Keeper a shard of old light
  const tier = dropTier(d), oreOf = (deep) => { const b = T.biomes[clamp(d.biome, 0, T.biomes.length - 1)]; return b.ores[deep ? 1 : 0]; };
  const ore = (n, deep) => { if (n > 0) drop({ stuff: oreOf(deep), n }); };
  if (e.type === 'keeper') {
    // its lodeline lights, and the dark starts to come back: a short pull
    if (d.zone === 'lair') { d.padDark = false; d.pull = 1; d.pullTime = T.enemies.keeper.afterPull; UI.toast("The star's light reaches down. Go, before the dark comes back", 'legendary'); }
    // its heart-shard, and what it had gathered
    drop({ shard: d.biome });
    drop({ echo: true });
    ore(L.bossOre, true); ore(L.bossOre, false);
    const lg = nextLegendToLearn(rng); if (lg) drop({ legend: lg });
    return;
  }
  if (e.boss) {
    ore(L.bossOre, true); ore(L.bossOre, false);
    const lg = nextLegendToLearn(rng); if (lg) drop({ legend: lg });
    return;
  }
  if (e.elite) {
    ore(rng.i(L.eliteOre[0], L.eliteOre[1]), rng.chance(0.5));
    const taught = eliteCoreFor(e);
    if (taught && !(CIRCUIT_FORMS[taught] ? facetsState().shapes : facetsState().mods).includes(taught)) drop({ teach: taught, from: e.type });
    if (rng.chance(T.story.echoElite)) drop({ echo: true });
    if (rng.chance(T.circuits.resonance.elite) && !codexAllWhole()) drop({ resStone: true });
  } else {
    // (a foe Wick calls up on the first landing always leaves one: onboard.js)
    if (e.guide || rng.chance(L.part)) ore(1, false);
  }
  if (rng.chance(L.mote)) drop({ mote: Math.max(L.moteHeal, Math.round(st.maxHp * L.moteShare)) });
  affixOnDeath(e);
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
    if (dr.mote) { healPlayer(dr.mote); dr.gone = true; snd('heal'); continue; }
    // a pile of ore: all of it (there's no limit to what's carried)
    if (dr.stuff) {
      const k = dr.n;
      d.cargo[dr.stuff] = (d.cargo[dr.stuff] || 0) + k;
      snd('pickup');
      // a small +n in the stuff's colour, not a toast: pickups are many
      d.nums.push({ x: p.x + 8, y: p.y - 30 - 7 * d.nums.filter((n) => n.plus && n.t > 0.6).length, v: k, t: 0.9, plus: true, col: ART.ores[dr.stuff] ? ART.ores[dr.stuff][3] : '#ffffff' });
      dr.gone = true;
      continue;
    }
    // a heart-shard binds to the diver: safe whatever happens now
    if (dr.shard !== undefined) { Story.takeShard(dr.shard); d.gotShard = true; UI.toast('A shard, still warm', 'legendary'); dr.gone = true; snd('shard'); continue; }
    if (dr.resStone) { resonanceStoneFound(d.rng); dr.gone = true; snd('resStone'); buzz(12); continue; }
    if (dr.echo) { const ec = Story.findEcho(); if (ec) { d.echoes = (d.echoes || 0) + 1; UI.toast('Echo: ' + ec.title, 'magic'); snd('echo'); deedEcho(d); } dr.gone = true; continue; }
    // what the star learns from a fall: a Shape or a Turn, or a shard of
    // old light (facets.js)
    if (dr.teach) {
      if (CIRCUIT_FORMS[dr.teach]) learnShape(dr.teach, `read from the ${foeWord(dr.from)}`); else learnMod(dr.teach, `read from the ${foeWord(dr.from)}`);
      coreTetherFx(d, dr.x, dr.y, stoneCol(dr.teach));
      dr.gone = true; buzz(12);
      continue;
    }
    if (dr.legend) { learnLegend(dr.legend, 'the old light, kept'); coreTetherFx(d, dr.x, dr.y, ART.rarity.legendary); dr.gone = true; buzz(12); continue; }
    dr.gone = true;
    buzz(12);
  }
  d.drops = d.drops.filter((dr) => !dr.gone);
}

// How many things are carried: ore, parts and exotics by the piece, gear
// and blueprints one each (light isn't counted: deeds.js). There's no limit:
// it's what a fall would leave in the pack.
function cargoCount(d) {
  let n = 0;
  for (const k in d.cargo) if (!isLight(k)) n += d.cargo[k];
  return n + ((d.items && d.items.length) || 0) + ((d.blueprints && d.blueprints.length) || 0);
}
