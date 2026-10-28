'use strict';
// ---------------------------------------------------------------------------
// The creatures cast what they teach (DESIGN.md, Spells: learned from the
// dark). Besides its own attack, a kind casts a spell of its nature's tree
// now and then: the wisp its shock orbs split in three, the crawler a
// glaive about itself, the tusker a frost lance that pierces, the wraith a
// burst of ember cast twice, the spitter a blight orb that lingers... so
// what the star learns from a kind's motes is what the kind was seen to
// do. The cast runs through the same cast code as the Kindler's
// (circuits.js), with the creature as its caster (cx.foe) and the Kindler
// as what it hits; its elements touch him in kind (chilled, burning,
// blighted, jolted, shoved: foeCastHit, foeStatusTick). Each kind's cast is
// in T.foecast.casts; the numbers in T.foecast.
// ---------------------------------------------------------------------------

function foeCastSpec(e) { return T.foecast.casts[e.type] || null; }

// Each step, before the kind's own update (enemies.js updateEnemies): the
// cast winding up (the creature holds still, its tell growing), then let
// go. True while the cast has the creature.
function foeCastUpdate(d, e, pd, dt, free) {
  const c = foeCastSpec(e);
  if (!c) return false;
  const F = T.foecast;
  if (e.castCd === undefined) e.castCd = c.every * F.firstAt;
  e.castCd = Math.max(0, e.castCd - dt);
  if (e.state === 'casting') {
    e.castT -= dt;
    if (e.castT > 0) return true;
    e.state = 'chase'; e.castCd = c.every;
    foeCast(d, e, c);
    return true;
  }
  if (e.castCd > 0 || !free || pd > c.range || (c.near && pd < c.near)) return false;
  if (!clearLine(d.floor, e.x, e.y, d.p.x, d.p.y - 6)) return false;
  e.state = 'casting'; e.castT = c.windup || F.windup; e.castMax = e.castT;
  return true;
}
// The cast itself: the kind's form, element and mods as a group, fired
// from where the creature stands at the Kindler.
function foeCast(d, e, c) {
  const F = T.foecast, g = { form: c.form, form2: null, tier: 1, els: c.el ? [c.el] : [], glyphs: {}, stones: [{ tier: 1 }] };
  for (const m of c.mods || []) g.glyphs[m] = (g.glyphs[m] || 0) + 1;
  const power = e.dmg * T.enemies.shotScale * F.power * (c.power || 1);
  const item = { kind: 'caster', bp: 'foe', base: { power }, affixes: [], spells: [], uid: 0 };
  const a = Math.atan2(d.p.y - 6 - (e.y - 6), d.p.x - e.x);
  const cx = { item, power, charged: false, step: 0, from: { x: e.x, y: e.y }, aim: a, mult: 1, spread: 0, echo: false, res: null, foe: e };
  snd('cast', { form: c.form, els: g.els, charged: false, step: 0, res: false });
  fireGroup(g, cx);
  Story.say('firstFoeCast');
}
// What a creature's cast hits: the Kindler, as the cast code reads a foe
// (one object, kept, so a bolt's list of what it struck holds).
function foeCastTargets(d) {
  const p = d.p, t = d.pt || (d.pt = { isPlayer: true, hid: false, r: T.player.radius });
  t.x = p.x; t.y = p.y; t.dead = !!d.dying; t.r = T.player.radius;
  return [t];
}
// A cast of a creature's lands on the Kindler (circuits.js circuitHit):
// the blow, its shove, and its element's touch.
function foeCastHit(s, dmg, opts) {
  const d = Game.dive, p = d.p, F = T.foecast;
  if (d.dying || p.invuln > 0) return;
  hurtPlayer(dmg, s.cx.foe);
  if (opts.knock) { const n = norm(opts.knock.x, opts.knock.y), k = F.shove * (s.els.includes('force') ? F.forceShove : 1); moveBody(d.floor, p, n.x * k, n.y * k, T.player.radius); }
  for (const el of s.els) foeElementOnPlayer(d, el, dmg);
}
// What a creature's elements leave on the Kindler (Tycho's statuses, where
// he keeps them): a chill (p.chillT) that slows him, a jolt (p.shockT) that
// holds him, a burn and a blight (p.burn, p.blight) that eat at his light.
const KINDLER_STATUS = new Tycho.harm.Statuses([
  { id: 'chill', at: 'chillT', wear: 'down' },
  { id: 'shock', at: 'shockT', wear: 'down' },
  { id: 'burn', dose: 'dps', every: 0.5 },
  { id: 'poison', at: 'blight', dose: 'dps', every: 0.5 },
]);
function foeElementOnPlayer(d, el, dmg) {
  const p = d.p, F = T.foecast, S = KINDLER_STATUS;
  if (el === 'frost') S.give(p, 'chill', { time: F.chill });
  else if (el === 'ember') S.put(p, 'burn', { t: F.burn[0], dps: Math.max(1, dmg * F.burn[1]), tick: 0 });
  else if (el === 'blight') S.put(p, 'poison', { t: F.blight[0], dps: Math.max(1, dmg * F.blight[1]), tick: 0 });
  else if (el === 'shock') S.give(p, 'shock', { time: F.shock });
}
// Each step (game.js): what a creature's elements left on the Kindler,
// wearing off: a chill slows him, a jolt holds him, a burn and a blight
// eat at his light (past the armour, as a spore puddle does), a number every
// half second, while he isn't falling.
const KINDLER_DOTS = {
  bites: () => !Game.dive.dying,
  bite: (p, id, n) => { p.hp -= Tycho.harm.armored(n, T.items.armorK, Game.dive.stats.armor); p.restT = 0; },
  show: (p, id, s) => { Game.dive.nums.push({ x: p.x, y: p.y - 22, v: Math.max(1, Math.round(s.dps * 0.5)), t: 0.5, hurt: true, elem: KINDLER_STATUS.def(id).at || id }); },
  after: (p) => { if (!Game.dive.dying && p.hp <= 0) { p.hp = 0; startDying(); } },
};
function foeStatusTick(d, dt) {
  const p = d.p, F = T.foecast;
  if (KINDLER_STATUS.has(p, 'chill')) p.frostSlow = Math.min(p.frostSlow || 1, F.chillSlow);
  KINDLER_STATUS.wear(p, dt);
  KINDLER_STATUS.tick(p, dt, KINDLER_DOTS);
}
// The tell while a creature casts (render.js drawEnemy): a ring of the
// cast's colour closing on it, and its light rising.
function drawFoeCastTell(d, e, fx, fy, tick, lights) {
  const c = foeCastSpec(e);
  if (!c) return;
  const col = c.el ? stoneCol(c.el) : ART.forms[c.form] || ART.forms.bolt, k = clamp(1 - e.castT / (e.castMax || 1), 0, 1);
  ringDots(fx, fy - ap(3), (14 - 8 * k) * AP, col, tick % 2 ? 0.85 : 0.5, true);
  lights.push({ x: fx, y: fy - ap(6), r: TILE * (0.8 + 0.8 * k), i: 0.5 + 0.7 * k, c: rgb01(col) });
}
