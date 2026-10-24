'use strict';
// ---------------------------------------------------------------------------
// The game's state and the world's play (docs/VEINS.md): walking, fighting,
// your light, channels (a hold that moving or being hit breaks), and a
// fall. One world, one bar. Everything here runs inside Game.step, one
// fixed 1/60 s step at a time. The Kindler runs on real time; the world
// runs on dt × Game.timeScale.
//
// Your light is your health: in the dark it drains (full to empty in
// T.world.light seconds), a hit knocks a piece out of it, and in the star's
// light it fills. At nothing you fall, and the star dims a piece.
// ---------------------------------------------------------------------------

const Game = {
  ready: false,
  scene: 'world',
  modal: null, // the id of the screen that's open; the simulation stops while one is
  t: 0, realT: 0, timeScale: 1, hitstop: 0,
  dive: null,
  step: null, render: null,
};

// ---------------------------------------------------------------------------
// The Kindler: one fixed set of numbers (T.player), and the two placeholder
// spells, an Arc and a Bolt, as the cast code reads them (circuits.js).
// The shapes come in the third step.
// ---------------------------------------------------------------------------
function kindlerStats() {
  const P = T.player;
  return {
    maxHp: P.hp, maxCharge: P.charge, armor: 0, regen: 0, chargeRegen: 0, moveSpeed: 0, castSpeed: 0,
    spellDmg: 0, closeDmg: 0, crit: 0, dashCd: 0, lamp: 0, pullSlow: 0, leech: 0, chill: 0, shock: 0,
    litArmor: 0, darkArmor: 0, arcCharge: 0, chilledDmg: 0, burnDmg: 0, openDmg: 0, magnet: P.magnet, powers: {},
  };
}
const KINDLER_RIG = {
  uid: 1, kind: 'caster', bp: 'rig', facet: true, tier: 1, base: { power: 6 }, affixes: [], extra: null,
  spells: [
    { form: { kind: 'stone', stone: 'arc', tier: 1 }, el: null, mods: [] },
    { form: { kind: 'stone', stone: 'bolt', tier: 1 }, el: null, mods: [] },
  ],
};
// What the cast and draw code reads as worn (never saved).
function kindlerGear() {
  if (!Save.data.equip) Object.defineProperty(Save.data, 'equip', { value: { main: KINDLER_RIG, pick: null, armor: null, charm: null }, enumerable: false, configurable: true, writable: true });
  spellsApply();
  return Save.data.equip;
}

// ---------------------------------------------------------------------------
// The world: one map, generated once a save from its seed, the star at the
// middle of it. (The large map and its painting in chunks come next: for
// now one site-sized floor, so everything else can be built on it.)
// ---------------------------------------------------------------------------
function generateWorld(seed) {
  const W = T.worldgen;
  const f = generateFloor(hashInts(seed, 0x5742) >>> 0, W.depth, 0, 0, 'surface', 0, W.clime, W.over);
  f.ways = []; f.portal = null; f.pad = null;
  // the star stands in the cavern nearest the middle of the world
  const mid = f.rooms.slice().sort((a, b) => Math.hypot(a.cx - f.w / 2, a.cy - f.h / 2) - Math.hypot(b.cx - f.w / 2, b.cy - f.h / 2))[0];
  f.entry = { x: mid.cx, y: mid.cy };
  f.layer = 0;
  placeStar(f, f.entry.x, f.entry.y);
  // the climes as regions round the star, the badlands nearest (the
  // hazards once the shafts are placed: deep.js worldFor)
  layRegions(f, seed, T.regions.surface, T.regions.surface[0], f.star.x, f.star.y);
  return f;
}

function newWorld(fields) {
  kindlerGear();
  const stats = kindlerStats();
  return Object.assign({
    seed: 0, biome: 0, depth: 1, zone: 'surface', clime: null, floor: null, world: null, layer: 0, layers: [], target: null, time: 0, kills: 0, dying: 0,
    rng: new Rng(1), stats,
    cargo: {}, enemies: [], shots: [], bolts: [], drops: [], fx: [], nums: [], globs: [], puddles: [], auras: [], later: [], flow: null, flowAt: -1,
    pull: 1, waveT: 0, channel: null, padDark: false,
    p: {
      x: 0, y: 0, fx: 0, fy: 1, walkT: 0, mine: null,
      hp: stats.maxHp, charge: stats.maxCharge, ward: 0, wardT: 0, invuln: 0, hurtT: 0, restT: 0, lowCharge: 0,
      dashT: 0, dashCd: 0, dashX: 0, dashY: 0, strikeT: 0, cast: null,
      hands: { main: newHand(), off: newHand() },
    },
  }, fields);
}
function newHand() { return { cd: 0, comboT: 0, buffer: 0, holdT: 0, holding: false, step: 0 }; }

// Into the world, at the star (both its floors built, or kept from the
// last time: deep.js worldFor). quiet: built while the game loads, with
// nothing said yet (worldWelcome says it).
function enterWorld(at = {}) {
  const s = Save.data, w = worldFor(s.seed), f = w.surface;
  const d = (Game.dive = newWorld({ floor: f, world: w, layer: 0, layers: [], clime: f.clime, seed: f.seed, depth: f.depth, rng: new Rng(hashInts(s.seed, 0x5eed, s.falls)) }));
  d.p.x = (f.star.x + 0.5) * TILE; d.p.y = (f.star.y + 0.5) * TILE + T.star.standOff * TILE; d.p.fy = 1;
  d.drone = null;
  // the veins as they stand (veins.js), and where he wakes: at the living
  // node nearest where he fell
  veinsLoad(d);
  spawnEnemies(d);
  // nothing hunts in the light
  d.enemies = d.enemies.filter((e) => starLight(d, e.x, e.y) <= 0);
  // while you were away, the dark cut (not on waking from a fall)
  if (!at.fell) veinsCutOnReturn(d);
  s.lastSeen = Date.now();
  d.clime = climeHere(d);
  if (typeof placeLife === 'function') placeLife(d);
  // (after the surface is peopled: a node in the Deep takes him down to it)
  if (at.near) { const n = veinsNearestLiving(d, at.near.x, at.near.y, at.near.l | 0); if (n.i > 0) veinsTravel(d, n.i); }
  Game.scene = 'world';
  if (!at.quiet) worldWelcome(at);
}
// Arriving: the opening the first time, or what a fall cost.
function worldWelcome(at) {
  UI.close();
  if (at.fell) UI.toast(`You fell. The star dims: ${Save.data.core} of ${T.star.core}`, 'legendary');
  else if (!Story.intro()) UI.tip('out', 'Walk out of the light. Your light drains in the dark; it fills back here');
}
// (nothing of a trip is kept between opens: the world is the save)
function saveRun() {}

function updateDive(dtReal, dt) {
  const d = Game.dive, p = d.p, st = d.stats;
  d.time += dtReal;
  if (d.dying > 0) {
    d.dying -= dtReal;
    updateCombatFx(dt);
    if (d.dying <= 0) loseDive();
    return;
  }
  p.invuln = Math.max(0, p.invuln - dtReal);
  p.hurtT = Math.max(0, p.hurtT - dtReal);
  if (p.wardT > 0 && (p.wardT -= dtReal) <= 0) { p.ward = 0; wardGone(p); }
  p.restT += dtReal;
  // (no charge: a cast costs nothing but its cooldown)
  p.charge = st.maxCharge; p.lowCharge = 0;
  if (p.cast && (p.cast.t -= dtReal) <= 0) p.cast = null;
  for (const n of d.nums) { n.t -= dtReal; n.y -= 14 * dtReal; }
  d.nums = d.nums.filter((n) => n.t > 0);

  if (!updateDash(dtReal)) {
    const mv = Input.move, m = Math.hypot(mv.x, mv.y);
    let vx = 0, vy = 0;
    if (m > 0.05) {
      // slower mid-strike, so an Arc commits
      const sp = T.player.speed * (1 + st.moveSpeed / 100) * Math.min(1, m) * (p.strikeT > 0 ? 0.45 : 1) * (p.frostSlow || 1) * (d.thread ? T.veins.threadSpeed : 1);
      vx = (mv.x / m) * sp; vy = (mv.y / m) * sp;
      if (!(p.strikeT > 0)) { p.fx = mv.x / m; p.fy = mv.y / m; }
      p.walkT += dtReal;
      // each step out on the ground kicks up a little dust behind the heel
      if (Math.floor(p.walkT / T.player.dustEvery) !== Math.floor((p.walkT - dtReal) / T.player.dustEvery)) d.fx.push({ kind: 'dust', x: p.x - p.fx * 3, y: p.y + 1, dx: -p.fx, t: 0.5, max: 0.5, seed: d.fx.length + p.walkT });
    } else p.walkT = 0;
    // pools slow the step and ice carries it on (hazards.js)
    stepDiver(d, p, vx, vy, dtReal);
  }
  updateHands(dtReal);
  updateBar(dt);
  updateChannel(dtReal);
  threadUpdate(d, dtReal);
  holdUpdate(d, dt);
  if (Game.dive !== d) return;
  updateEnemies(dt);
  updateBolts(dt);
  updateAuras(dt);
  updateCombatFx(dt);
  updateLife(d, dt);
  updateWorld(d, dt);
  regionsStep(d);
  updateWick(d, dt);
  updatePickups(dtReal);
  if (Input.consumeAct()) {
    const a = actionHere();
    if (a) actHere(a);
  }
}

function startDying() {
  const d = Game.dive;
  d.dying = 1.4;
  d.p.mine = null;
  d.fx.push({ kind: 'death', x: d.p.x, y: d.p.y - 6, t: 1.4, max: 1.4 });
  snd('death');
}

// What the contextual button does where the Kindler stands: the thread
// taken up, planted, joined or mended (veins.js).
function actionHere() {
  const d = Game.dive;
  if (!d || d.dying || !d.litG) return null;
  return veinsAction(d);
}
function actHere(a) { veinsAct(Game.dive, a); }

// ---------------------------------------------------------------------------
// One bar: your light is your health. It drains in the dark, fills in light.
// ---------------------------------------------------------------------------
// Where the Kindler stands is lit (star.js).
function restingLight(d) { return litAt(d, d.p.x, d.p.y); }
// The Splinter's lattice over the Kindler is only as whole as his light
// (T.splinter.floor with the bar empty, all of it full): render.js.
function latticeK(d) { return lerp(T.splinter.floor, 1, clamp(d.pull, 0, 1)); }

function updateBar(dt) {
  const d = Game.dive, p = d.p, st = d.stats, P = T.pull, B = T.bar;
  const lit = starLight(d, p.x, p.y);
  if (lit > 0) p.hp = Math.min(st.maxHp, p.hp + (st.maxHp / B.fill) * lit * dt);
  if (lit < 1) {
    const was = p.hp / st.maxHp;
    p.hp = Math.max(0, p.hp - (st.maxHp / T.world.light) * (1 - lit) * dt);
    const now = p.hp / st.maxHp;
    if (was > P.dimAt && now <= P.dimAt) { UI.toast('Your light is fading', 'legendary'); Story.say('pullFading'); snd('lightLow'); }
    if (now <= P.dimAt && (d.waveT -= dt) <= 0) { d.waveT = P.waveEvery[0]; stirTheDark(d, P.wave[0]); }
    if (p.hp <= 0 && !d.dying) { UI.toast('Your light is out', 'legendary'); snd('lightOut'); startDying(); }
  }
  // (the renderers read the light meter as it was: the bar)
  d.pull = p.hp / st.maxHp;
}

// Somewhere out of sight but on foot from the Kindler, in the dark.
function darkSpot(d) {
  const f = d.floor, steps = floorDistances(f.tiles, f.w, f.h, Math.floor(d.p.x / TILE), Math.floor(d.p.y / TILE));
  const far = [];
  for (let i = 0; i < f.w * f.h; i++) if (steps[i] > 9 && steps[i] < 26 && starLight(d, ((i % f.w) + 0.5) * TILE, (Math.floor(i / f.w) + 0.5) * TILE) <= 0) far.push(i);
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
// Some things take a moment: a hold where the Kindler stands. Moving or
// being hit breaks it. kind names it; done runs when it's held out.
// ---------------------------------------------------------------------------
function startChannel(kind, max, done) {
  const d = Game.dive;
  if (!d || d.dying || d.channel) return;
  d.channel = { kind, t: 0, max, x: d.p.x, y: d.p.y, done };
  // the light draws attention
  for (const e of d.enemies) if (!e.dead && dist(e.x, e.y, d.p.x, d.p.y) < T.leave.noise) wake(d, e, true);
}
function breakChannel(why) {
  const d = Game.dive;
  if (!d.channel) return;
  d.channel = null;
  UI.toast(why);
  snd('channelBreak');
}
function updateChannel(dt) {
  const d = Game.dive, c = d.channel;
  if (!c) return;
  if (dist(d.p.x, d.p.y, c.x, c.y) > 3) { breakChannel('You moved: it let go'); return; }
  if ((c.t += dt) >= c.max) { d.channel = null; if (c.done) c.done(d); }
}

// ---------------------------------------------------------------------------
// Walking: a circle against the floor's smooth wall line (rockAt), felt at
// its centre and eight points round its edge. Enemies use it too.
// ---------------------------------------------------------------------------
const BODY_RING = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => [Math.cos((k * Math.PI) / 4), Math.sin((k * Math.PI) / 4)]);
function bodyHits(f, x, y, r) {
  if (rockAt(f, x, y)) return true;
  for (const [c, s] of BODY_RING) if (rockAt(f, x + c * r, y + s * r)) return true;
  if (f.solids) for (const o of f.solids) { const u = (x - o.x) / (o.rx + r), v = (y - o.y) / (o.ry + r); if (u * u + v * v < 1) return true; }
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
// A fall: you wake at the star, and it dims a piece of its core. At no
// pieces the star goes out, and the world with it.
// ---------------------------------------------------------------------------
function loseDive() {
  const s = Save.data, d = Game.dive, near = d ? { x: d.p.x, y: d.p.y, l: d.layer } : null;
  s.falls++;
  s.core = Math.max(0, s.core - 1);
  Save.save();
  if (s.core <= 0) { starGoesOut(); return; }
  enterWorld({ fell: true, near });
}
function starGoesOut() {
  UI.openStory(STAR_OUT_LINES, () => { Save.startOver(); location.reload(); });
}
