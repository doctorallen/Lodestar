'use strict';
// Fighting, held to fights recorded from the code as it was before it moved
// onto Tycho's harm part (Tycho.harm). The whole game runs in Node (the
// sandbox's gameSandbox: every script, nothing drawn), on one world, and
// each scene is a fight set up and played through Game.step with the
// controls driven by a seeded fighter: the Kindler's spells (every Form,
// every Element and two together, the Mods, the resonances, charged casts,
// the Arc's combo), his dashes and his ward, against the common kinds, each
// clime's own creature, elites with every affix, the Keepers, the warden,
// the Hollow and the dummy, with his traits and passives, the creatures'
// casts, and the hazards biting him and them (vents, spore clouds, lava,
// water and ice, the storm). Every frame, everything combat touches is
// hashed: the Kindler (his light, ward, dash, hands, statuses, where he
// is), every creature (its health, statuses and stacks, reactions' waits,
// knock, state and timers, affixes' own), what's in flight and on the
// ground (shots, bolts, globs, auras, puddles, clouds, snares), the numbers
// and words risen, the effects, the drops, the kills and motes, the rolls
// drawn from the dive's rng, the world's hold still and its clock. Each
// kind of thing is hashed by the fields the recording saw on it, so a
// field added later doesn't count, and every one it had does.
//   node test/fights.js            replay test/fights.json and compare
//   node test/fights.js --record   record it again (only ever from code
//                                  that fights as it should)
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { gameSandbox } = require('./sandbox');
const { finish } = require('./lib-node');

const FILE = path.join(__dirname, 'fights.json');
const record = process.argv.includes('--record');
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
const SEED = 5; // a world with every hazard: vents, spores and ice above, water and lava below
const DT = 1 / 60;

// ---------------------------------------------------------------------------
// The scenes. spot: a room of a clime, or a hazard; foes [type, dx, dy,
// fields]; spells A and B ({ form, el, el2, mods }); stats and powers on
// the Kindler; learned: passives; fighter: how he fights (range: how near
// he keeps, a/b: frames between presses of each, charge: the share held,
// dodge: the chance he dashes from a wind-up near him; still: he mostly
// stands, frozen: he never moves); each(d, i): what the scene does before
// each step (the storm brought on sooner, and now and then on him).
// ---------------------------------------------------------------------------
const S = (form, el, mods, el2) => ({ form, el: el || null, el2: el2 || null, mods: mods || [] });
const SCENES = [
  { name: 'the Arc and the Bolt against crawlers and a wisp', spot: { clime: 'badlands' }, foes: [['crawler', 34, 0], ['crawler', -30, 16], ['wisp', 54, -34]], fighter: { range: 16, a: 14, b: 50, charge: 0.2, dodge: 0.5 } },
  { name: 'bolts at range against constructs', spot: { clime: 'frost' }, foes: [['construct', 60, 10], ['construct', -50, -20], ['wisp', 40, 50]], fighter: { range: 72, a: 90, b: 12, charge: 0.15, dodge: 0.8 } },
  { name: 'frost and shock: chill, freeze, conduct, overload', spells: [S('glaive', 'frost'), S('bolt', 'shock', ['chain'])], foes: [['crawler', 30, 0], ['crawler', -28, 10], ['crawler', 10, 34], ['construct', 60, -20]], fighter: { range: 22, a: 40, b: 11, charge: 0.1, dodge: 0.5 } },
  { name: 'ember and blight: burns, poison, pyre, inferno, plague', spot: { clime: 'bloomfen' }, spells: [S('nova', 'ember'), S('orb', 'blight', ['linger'])], foes: [['crawler', 30, 0], ['crawler', -30, 6], ['snapjaw', 20, 30], ['spitter', -40, -40], ['crawler', 44, -30]], fighter: { range: 20, a: 24, b: 30, charge: 0.2, dodge: 0.4 } },
  { name: 'force and frost: shatter, a frozen burst, a stun', spells: [S('arc'), S('lance', 'frost', ['pierce'])], foes: [['tusker', 70, 0], ['crawler', 30, 20], ['crawler', -30, -10]], fighter: { range: 18, a: 12, b: 26, charge: 0.3, dodge: 0.6 } },
  { name: 'two elements a spell: steam and flare', spot: { clime: 'cinder' }, spells: [S('arc', 'ember', [], 'frost'), S('bolt', 'ember', [], 'shock')], foes: [['crawler', 30, 0], ['crawler', -26, 18], ['wisp', 50, -30], ['construct', -60, 20]], fighter: { range: 18, a: 15, b: 22, charge: 0.15, dodge: 0.5 } },
  { name: 'two elements a spell: scatter, brittle, jolt', spells: [S('arc', 'ember', [], 'force'), S('lance', 'frost', [], 'blight')], foes: [['crawler', 30, 0], ['construct', -40, 18], ['crawler', 20, -34], ['wisp', -50, -30]], fighter: { range: 20, a: 13, b: 24, charge: 0.2, dodge: 0.5 } },
  { name: 'the shock and force jolt, overload on overload', spells: [S('bolt', 'shock', [], 'force'), S('arc', 'shock', ['quicken'])], foes: [['construct', 40, 0], ['crawler', -30, 18], ['crawler', 20, -30]], fighter: { range: 24, a: 12, b: 16, charge: 0.25, dodge: 0.5 } },
  { name: 'a well and a ward', spot: { clime: 'frost' }, spells: [S('well', 'blight'), S('ward', 'frost')], foes: [['crawler', 30, 0], ['crawler', -30, 10], ['crawler', 0, 36], ['hound', 70, -20]], fighter: { range: 30, a: 30, b: 70, charge: 0.2, dodge: 0.3 } },
  { name: 'Shatterglass and the Kindling Arc', spells: [S('arc', 'ember', ['quicken']), S('lance', 'frost', ['echo'])], foes: [['crawler', 30, 0], ['crawler', -30, 16], ['construct', 60, 20], ['wisp', -40, -40]], fighter: { range: 18, a: 10, b: 28, charge: 0.1, dodge: 0.5 } },
  { name: 'Thunderhead and Stormglaive', spot: { clime: 'bloomfen' }, spells: [S('orb', 'shock', ['linger']), S('glaive', 'shock', ['chain', 'amplify'])], foes: [['crawler', 30, 0], ['crawler', -30, 12], ['wisp', 40, -40], ['construct', -50, -20]], fighter: { range: 24, a: 36, b: 50, charge: 0.1, dodge: 0.5 } },
  { name: 'Wildfire and Starfall', spot: { clime: 'cinder' }, spells: [S('orb', 'ember', ['split', 'linger']), S('bolt', 'force', ['split', 'amplify'])], foes: [['crawler', 30, 0], ['crawler', -30, 12], ['construct', 50, -30], ['wisp', -40, 40]], fighter: { range: 40, a: 34, b: 26, charge: 0.15, dodge: 0.5 } },
  { name: 'his traits and passives: crits, chill, shock, leech, armor, the powers', spells: [S('arc', 'frost'), S('bolt', 'ember', ['chain'])], stats: { crit: 40, chill: 50, shock: 50, leech: 10, castSpeed: 30, spellDmg: 20, closeDmg: 20, chilledDmg: 30, burnDmg: 30, openDmg: 40, armor: 15, dashCd: -20, arcCharge: 2 }, powers: { echo: true, lodeheart: true, bloodedge: true, stormcaller: true }, learned: ['heavy', 'wrist', 'thickskin', 'coldblood'], foes: [['crawler', 30, 0], ['crawler', -30, 14], ['construct', 40, 40], ['wisp', -50, -30]], fighter: { range: 18, a: 13, b: 30, charge: 0.2, dodge: 0.4 } },
  { name: 'elites: warded, shifting and chained', spells: [S('arc'), S('bolt', 'shock')], foes: [['crawler', 34, 0, { elite: ['warded'], level: 6 }], ['construct', -40, 16, { elite: ['shifting', 'chained'], level: 6 }], ['wisp', 40, -40]], fighter: { range: 18, a: 12, b: 20, charge: 0.25, dodge: 0.6 } },
  { name: 'elites: bulwark, thorns and leech', spot: { clime: 'frost' }, spells: [S('arc'), S('bolt', 'blight')], foes: [['construct', 40, 0, { elite: ['bulwark'], level: 6 }], ['crawler', -30, 10, { elite: ['thorns'], level: 6 }], ['crawler', 20, 30, { elite: ['leech'], level: 6 }]], fighter: { range: 18, a: 12, b: 18, charge: 0.2, dodge: 0.1 } },
  { name: 'elites: volatile, splitter and brood', spot: { clime: 'cinder' }, spells: [S('nova', 'frost'), S('bolt', 'ember')], foes: [['crawler', 30, 0, { elite: ['volatile'], level: 3 }], ['crawler', -30, 10, { elite: ['splitter'], level: 3 }], ['construct', 50, 30, { elite: ['brood'], level: 3 }]], fighter: { range: 16, a: 20, b: 14, charge: 0.2, dodge: 0.6 } },
  { name: 'elites: frosted, mortar and blink', spot: { clime: 'bloomfen' }, spells: [S('arc', 'ember'), S('bolt', 'shock')], foes: [['crawler', 30, 0, { elite: ['frosted'], level: 6 }], ['wisp', -60, 10, { elite: ['mortar'], level: 6 }], ['crawler', 40, 50, { elite: ['blink'], level: 6 }]], fighter: { range: 22, a: 13, b: 20, charge: 0.15, dodge: 0.2, still: true } },
  { name: 'elites: hulking, fast, tough, insulated, fireproof', spells: [S('bolt', 'shock'), S('nova', 'ember')], foes: [['construct', 40, 0, { elite: ['hulking', 'tough', 'insulated'], level: 11 }], ['crawler', -30, 10, { elite: ['fast', 'fireproof'], level: 6 }], ['crawler', 20, -30]], fighter: { range: 34, a: 14, b: 24, charge: 0.25, dodge: 0.6 } },
  { name: 'each clime\'s own: the skink, the wraith, the dropper, the crab', spot: { clime: 'badlands' }, spells: [S('arc', 'frost'), S('bolt')], foes: [['skink', 40, 0], ['wraith', -40, 20], ['dropper', 30, 30], ['crab', -30, -30]], fighter: { range: 20, a: 13, b: 24, charge: 0.25, dodge: 0.6 } },
  { name: 'each clime\'s own: the tusker on ice, the hound, the sentinel', spot: { haz: 'slick' }, spells: [S('arc'), S('lance', 'frost')], foes: [['tusker', 60, 0], ['hound', -60, 20], ['sentinel', 40, -50]], fighter: { range: 30, a: 14, b: 22, charge: 0.2, dodge: 0.7 } },
  { name: 'each clime\'s own: the lurker, the weaver, the idol', spot: { clime: 'bloomfen' }, spells: [S('arc', 'ember'), S('bolt', 'blight')], foes: [['lurker', 50, 0], ['weaver', -50, 20], ['idol', 30, -40]], fighter: { range: 26, a: 14, b: 20, charge: 0.2, dodge: 0.6 } },
  { name: 'eels in the water, the Kindler wading', spot: { haz: 'pool' }, spells: [S('bolt', 'shock'), S('arc')], foes: [['eel', 0, 0, { swim: true }], ['eel', 0, 0, { swim: true }], ['crawler', -30, 20]], fighter: { range: 30, a: 16, b: 14, charge: 0.2, dodge: 0.6 } },
  { name: 'the Rim\'s Keeper: its brood and its ward', spells: [S('arc'), S('bolt', 'ember')], foes: [['keeper', 60, 0, { home: 'rim', level: 4 }]], frames: 900, fighter: { range: 26, a: 12, b: 18, charge: 0.3, dodge: 0.7 } },
  { name: 'the Choir\'s Keeper and the warden', spot: { clime: 'frost' }, spells: [S('arc'), S('lance', 'frost')], foes: [['keeper', 60, 0, { home: 'choir', level: 4 }], ['warden', -70, 10, { level: 4 }]], frames: 900, fighter: { range: 30, a: 12, b: 16, charge: 0.3, dodge: 0.7 } },
  { name: 'the Underforge\'s Keeper: wreathed, quenched, its magma', spot: { clime: 'cinder' }, spells: [S('nova', 'ember'), S('bolt', 'frost')], foes: [['keeper', 60, 0, { home: 'underforge', level: 4 }]], frames: 900, fighter: { range: 24, a: 12, b: 30, charge: 0.2, dodge: 0.7 } },
  { name: 'the Hollow and the dummy', spells: [S('arc', 'shock'), S('bolt', 'blight')], foes: [['hollow', 70, 0], ['dummy', -24, 0]], fighter: { range: 20, a: 12, b: 18, charge: 0.25, dodge: 0.8 } },
  { name: 'a vent bursting on him and on them', spot: { haz: 'vent' }, foes: [['crawler', 20, 6], ['crawler', -16, 14], ['construct', 30, -20]], fighter: { range: 12, a: 16, b: 60, charge: 0.1, dodge: 0.1, frozen: true } },
  { name: 'spore clouds drifting and stinging', spot: { haz: 'spores' }, foes: [['crawler', 20, 6], ['wisp', -36, 14]], frames: 1000, fighter: { range: 12, a: 20, b: 50, charge: 0.1, dodge: 0.1, frozen: true } },
  { name: 'lava under him and under them', spot: { haz: 'burn' }, spells: [S('arc'), S('bolt', 'frost')], foes: [['crawler', 20, 0], ['crab', -20, 10], ['crawler', 0, 24]], fighter: { range: 10, a: 16, b: 30, charge: 0.1, dodge: 0.2, still: true } },
  { name: 'the creatures\' casts on him: chilled, burnt, blighted, jolted', spells: [S('bolt'), S('arc')], foes: [['wisp', 60, 0, { cast: true }], ['crawler', -40, 10, { cast: true }], ['tusker', 50, 40, { cast: true }], ['spitter', -50, -40, { cast: true }], ['lurker', 40, -50, { cast: true }], ['wraith', -30, 40, { cast: true }]], frames: 900, fighter: { range: 40, a: 30, b: 30, charge: 0, dodge: 0.2 } },
  { name: 'the Kindler falls, a channel broken by a blow', channel: true, falls: true, spells: [S('bolt'), S('arc')], foes: [['crawler', 30, 0, { elite: ['fast'], level: 8 }], ['crawler', -30, 10, { level: 8 }], ['construct', 40, 40, { level: 8 }], ['wisp', -40, -40, { level: 8 }]], hp: 45, frames: 900, fighter: { range: 20, a: 40, b: 40, charge: 0, dodge: 0, frozen: true } },
  // (last: a strike may charge a vein of ore, which stays on the floor)
  { name: 'the Lodestorm striking about him', storm: true, each: (d, i) => { if (!d.strike && d.stormT > 2.5) d.stormT = 2.5; if (d.strike && !d.strike.moved && i % 3) { d.strike.moved = true; d.strike.x = d.p.x + 6; d.strike.y = d.p.y; } }, foes: [['crawler', 40, 0], ['construct', -40, 20], ['wisp', 30, -40]], frames: 1200, fighter: { range: 30, a: 18, b: 24, charge: 0.1, dodge: 0.3 } },
];

// ---------------------------------------------------------------------------
// The game, and the world the scenes are played on
// ---------------------------------------------------------------------------
const G = gameSandbox();
const g = vm.runInContext(`({ Game, Save, T, Input, View, KINDLER_RIG, Rng, hashInts, mulberry32, TILE, TILE_SOLID, HAZ_CODES,
  makeEnemy, enterWorld, kindlerGear, layerSwitch, bodyHits, floorTile, climeAt, hazardAt, startChannel, step, wake })`, G);
const g0 = vm.runInContext('Save', G);
G.localStorage.setItem(vm.runInContext('SAVE_KEY', G), JSON.stringify({ v: 11, uid: 100, seed: SEED, introSeen: true }));
g0.load();
g.kindlerGear();
g.Game.step = g.step;
const tuning = new WeakSet();
(function mark(o) { if (!o || typeof o !== 'object' || tuning.has(o)) return; tuning.add(o); for (const k in o) mark(o[k]); })(g.T);

// A place for a scene: the room of its clime farthest from the star, or a
// hazard in the dark (a vent, a pod, a tile of ice, water or lava).
function spotFor(d, spot) {
  const f = d.floor, star = d.world.surface.star, at = (tx, ty) => ({ x: (tx + 0.5) * g.TILE, y: (ty + 0.5) * g.TILE });
  if (spot.haz === 'vent' || spot.haz === 'spores') {
    const pts = f.hazPts.filter((v) => (v.kind || f.hazKind) === spot.haz).sort((a, b) => Math.hypot(b.x - star.x, b.y - star.y) - Math.hypot(a.x - star.x, a.y - star.y) || a.x - b.x || a.y - b.y);
    const v = pts[Math.floor(pts.length / 3)], p = at(v.x, v.y);
    return { x: p.x + 6, y: p.y + 2, vent: v };
  }
  if (spot.haz) {
    const code = g.HAZ_CODES[spot.haz], tiles = [];
    for (let i = 0; i < f.haz.length; i++) if (f.haz[i] === code) tiles.push(i);
    // a tile well inside the hazard, far from the star
    const inside = tiles.filter((i) => f.haz[i - 1] === code && f.haz[i + 1] === code && f.haz[i - f.w] === code && f.haz[i + f.w] === code);
    inside.sort((a, b) => Math.hypot(b % f.w - star.x, Math.floor(b / f.w) - star.y) - Math.hypot(a % f.w - star.x, Math.floor(a / f.w) - star.y) || a - b);
    const i = (inside.length ? inside : tiles)[0];
    return at(i % f.w, Math.floor(i / f.w));
  }
  const rooms = f.rooms.slice(1).filter((r) => r.cells && r.cells.length > 40 && (!spot.clime || g.climeAt(f, r.cx, r.cy) === spot.clime));
  rooms.sort((a, b) => Math.hypot(b.cx - star.x, b.cy - star.y) - Math.hypot(a.cx - star.x, a.cy - star.y) || a.cx - b.cx || a.cy - b.cy);
  const r = rooms[spot.pick || 0];
  return at(r.cx, r.cy);
}
// The nearest clear ground to x, y for a body of radius r (rings outward).
function clearNear(f, x, y, r) {
  if (!g.bodyHits(f, x, y, r)) return { x, y };
  for (let m = 2; m <= 48; m += 2) for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2, qx = x + Math.cos(a) * m, qy = y + Math.sin(a) * m; if (!g.bodyHits(f, qx, qy, r)) return { x: qx, y: qy }; }
  return { x, y };
}

function setUp(sc, k) {
  const { Game, Save, T } = g, s = Save.data;
  Object.assign(Game, { t: 0, realT: 0, hitstop: 0, timeScale: 1, modal: null });
  delete Game.frozeAt;
  g.View.shake = 0; g.View.floorFor = null;
  s.kills = 0; s.killsOf = {}; s.natures = {}; s.said = { firstMotes: true }; s.tips = {}; s.learned = []; s.core = T.star.core; s.falls = 0;
  for (const f of [g.Game.dive && g.Game.dive.world.surface, g.Game.dive && g.Game.dive.world.deep]) if (f) for (const v of f.hazPts || []) { delete v.fired; delete v.last; }
  g.enterWorld({ quiet: true });
  const d = Game.dive;
  if (sc.spot && sc.spot.haz && (sc.spot.haz === 'pool' || sc.spot.haz === 'burn')) {
    const deep = d.world.deep;
    g.layerSwitch(d, 1, (deep.rooms[0].cx + 0.5) * g.TILE, (deep.rooms[0].cy + 0.5) * g.TILE);
  }
  const at = spotFor(d, sc.spot || {}), f = d.floor, p = d.p;
  p.x = at.x; p.y = at.y; p.fx = 1; p.fy = 0;
  // (the rolls drawn from the dive's rng are counted, and hashed)
  d.rng = new g.Rng(g.hashInts(SEED, k, 0xf16));
  const next = d.rng.next;
  d.rngN = 0; d.rng.next = () => { d.rngN++; return next(); };
  g.KINDLER_RIG.spells = (sc.spells || [S('arc'), S('bolt')]).map((c) => ({ form: { kind: 'stone', stone: c.form, tier: 1 }, el: c.el ? { kind: 'stone', stone: c.el, tier: 1 } : null, el2: c.el2 ? { kind: 'stone', stone: c.el2, tier: 1 } : undefined, mods: c.mods.map((m) => ({ kind: 'stone', stone: m, tier: 1 })) }));
  for (const sp of g.KINDLER_RIG.spells) if (!sp.el2) delete sp.el2;
  Object.assign(d.stats, sc.stats || {});
  if (sc.powers) d.stats.powers = Object.assign({}, sc.powers);
  s.learned = (sc.learned || []).slice();
  if (sc.hp) p.hp = sc.hp;
  if (sc.storm) d.storm = true;
  d.enemies = [];
  for (const [type, dx, dy, o = {}] of sc.foes) {
    let x = p.x + dx, y = p.y + dy;
    if (o.swim) {
      // in the water, near him
      const code = g.HAZ_CODES.pool;
      let best = null, bd = 1e9;
      for (let ty = Math.floor(p.y / g.TILE) - 6; ty <= Math.floor(p.y / g.TILE) + 6; ty++) for (let tx = Math.floor(p.x / g.TILE) - 6; tx <= Math.floor(p.x / g.TILE) + 6; tx++) {
        const qx = (tx + 0.5) * g.TILE, qy = (ty + 0.5) * g.TILE, m = Math.hypot(qx - p.x, qy - p.y);
        if (g.hazardAt(f, qx, qy) === code && m > 40 + d.enemies.length * 14 && m < bd && !g.bodyHits(f, qx, qy, 5)) { bd = m; best = { x: qx, y: qy }; }
      }
      if (best) { x = best.x; y = best.y; }
    }
    const e = g.makeEnemy(type, 0, 0, o.level || 1, o.elite || null);
    const c = o.swim ? { x, y } : clearNear(f, x, y, e.r);
    e.x = c.x; e.y = c.y;
    if (o.home) e.home = o.home;
    if (o.cast) e.castCd = 0.5 + d.enemies.length * 0.7;
    d.enemies.push(e);
  }
  if (sc.channel) g.startChannel('test', 30, () => {});
  return d;
}

// The fighter: keeps its range from the nearest foe in sight, strafing;
// presses each spell now and then (a share of them held to charge);
// dashes away from a wind-up close by. Its choices draw from its own rng.
const WINDING = new Set(['windup', 'casting', 'charge', 'lunge']);
function fighter(d, P, rng, i, mem) {
  const p = d.p, b = { x: 0, y: 0 };
  let tgt = null, td = 1e9;
  for (const e of d.enemies) { if (e.dead || e.hid || e.type === 'dummy') continue; const m = Math.hypot(e.x - p.x, e.y - p.y); if (m < td) { td = m; tgt = e; } }
  if (!tgt) for (const e of d.enemies) if (!e.dead && e.type === 'dummy') { tgt = e; td = Math.hypot(e.x - p.x, e.y - p.y); }
  if ((i % 90) === 0) { mem.side = rng.chance(0.5) ? 1 : -1; mem.wander = rng.f(Math.PI * 2); }
  if (P.frozen) { /* he stands his ground */ } else if (!P.still) {
    if (tgt) {
      const dx = (tgt.x - p.x) / (td || 1), dy = (tgt.y - p.y) / (td || 1);
      if (td > P.range + 8) { b.x = dx; b.y = dy; } else if (td < P.range - 8) { b.x = -dx; b.y = -dy; } else { b.x = -dy * mem.side * 0.8; b.y = dx * mem.side * 0.8; }
    } else { b.x = Math.cos(mem.wander) * 0.7; b.y = Math.sin(mem.wander) * 0.7; }
  } else if (i % 120 < 30) { b.x = Math.cos(mem.wander) * 0.5; b.y = Math.sin(mem.wander) * 0.5; }
  // a dash away from what's winding up near
  const near = d.enemies.find((e) => !e.dead && WINDING.has(e.state) && Math.hypot(e.x - p.x, e.y - p.y) < 50);
  if (near && !mem.dodged && !P.frozen && rng.chance(P.dodge)) { const m = Math.hypot(p.x - near.x, p.y - near.y) || 1; b.x = (p.x - near.x) / m; b.y = (p.y - near.y) / m; b.dash = true; mem.dodged = 40; }
  if (mem.dodged) mem.dodged--;
  for (const [slot, every, hold] of [['main', P.a, 'holdA'], ['off', P.b, 'holdB']]) {
    if (mem[hold] > 0) { b[slot] = true; mem[hold]--; continue; }
    if (i % every === every - 1) mem[hold] = rng.chance(P.charge) ? 50 : 2;
  }
  return b;
}

// ---------------------------------------------------------------------------
// The state, hashed: every field the recording saw on each kind of thing
// (numbers to the bit), references to the creatures, the Kindler and the
// tuning by name
// ---------------------------------------------------------------------------
const fnv = (h, n) => { h = Math.imul(h ^ (n & 0xffff), 16777619); return Math.imul(h ^ (n >>> 16), 16777619) >>> 0; };
const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);
function hasher() {
  let h = 2166136261;
  const ids = new Map();
  const H = {
    num(x) { f64[0] = x; h = fnv(fnv(fnv(h, 1), u32[0]), u32[1]); },
    str(s) { h = fnv(h, 2); for (let i = 0; i < s.length; i++) h = fnv(h, s.charCodeAt(i)); h = fnv(h, s.length); },
    tag(n) { h = fnv(h, n); },
    id(o) { if (!ids.has(o)) ids.set(o, ids.size); return ids.get(o); },
    get h() { return h; },
  };
  return H;
}
const KINDS = ['game', 'dive', 'kindler', 'hand', 'foe', 'shot', 'bolt', 'aura', 'puddle', 'glob', 'num', 'fx', 'drop', 'cloud', 'snare', 'later', 'stats'];
// what of the dive the fight touches (its lists are hashed on their own)
const DIVE_KEEP = ['kills', 'dying', 'drag', 'wading', 'hazT', 'hazHurt', 'hazNumT', 'casts', 'castRange', 'motes', 'channel', 'strike', 'storm', 'stormT', 'pull', 'waveT', 'resSeen', 'keeper', 'flowAt', 'pruneT', 'time', 'layer', 'zone', 'clime'];
function stateHash(d, keys, seen) {
  const H = hasher(), { Game } = g;
  const val = (v, depth) => {
    if (v === undefined) { H.tag(9); return; }
    if (v === null) { H.tag(3); return; }
    const t = typeof v;
    if (t === 'number') return H.num(v);
    if (t === 'string') return H.str(v);
    if (t === 'boolean') return H.tag(v ? 5 : 6);
    if (t === 'function') return H.tag(7);
    if (v === d.p) return H.tag(11);
    if (v === d.pt) return H.tag(12);
    if (v === g.KINDLER_RIG) return H.tag(13);
    if (v === d.floor || v === d.world || v === d) return H.tag(14);
    if (tuning.has(v)) return H.tag(15);
    if (d.enemies.includes(v) || (v && v.type && v.maxHp !== undefined)) { H.tag(16); H.num(H.id(v)); return; }
    if (depth > 3) return H.tag(17);
    if (v instanceof G.Map || v instanceof Map) { H.tag(18); for (const [a, b] of v) { val(a, depth + 1); val(b, depth + 1); } return; }
    if (Array.isArray(v) || ArrayBuffer.isView(v)) { H.tag(19); H.num(v.length); for (let i = 0; i < v.length; i++) val(v[i], depth + 1); return; }
    H.tag(20);
    for (const k of Object.keys(v).sort()) { if (v[k] === undefined || typeof v[k] === 'function') continue; H.str(k); val(v[k], depth + 1); }
  };
  // one thing of a kind: the fields it has that the recording saw on its
  // kind (recording, all of them), in order
  const one = (kind, o) => {
    H.tag(30);
    for (const k of Object.keys(o).sort()) {
      if (o[k] === undefined || typeof o[k] === 'function' || k === '_w') continue;
      if (seen) seen[kind].add(k); else if (!keys[kind].has(k)) continue;
      H.str(k); val(o[k], 1);
    }
  };
  const list = (kind, arr) => { H.tag(40); H.num(arr ? arr.length : -1); for (const o of arr || []) one(kind, o); };
  one('game', Game);
  H.num(g.View.shake || 0);
  one('dive', Object.fromEntries(DIVE_KEEP.filter((k) => k in d).map((k) => [k, d[k]])));
  one('stats', d.stats);
  one('kindler', d.p);
  one('hand', d.p.hands.main); one('hand', d.p.hands.off);
  list('foe', d.enemies);
  for (const k of ['shots', 'bolts', 'auras', 'puddles', 'globs', 'nums', 'fx', 'drops', 'clouds', 'snares', 'later']) list({ shots: 'shot', bolts: 'bolt', auras: 'aura', puddles: 'puddle', globs: 'glob', nums: 'num', fx: 'fx', drops: 'drop', clouds: 'cloud', snares: 'snare', later: 'later' }[k], d[k]);
  H.num(d.rngN);
  const s = g.Save.data;
  H.num(s.kills); val(s.killsOf, 1); val(s.natures, 1); H.num(s.core);
  return H.h;
}

// ---------------------------------------------------------------------------
// Playing a scene
// ---------------------------------------------------------------------------
function play(sc, k, keys, seen, words) {
  const d0 = setUp(sc, k), frames = sc.frames || 720, P = sc.fighter, rng = new g.Rng(g.hashInts(SEED, k, 0xb07)), mem = { side: 1, wander: 0 };
  const hashes = [];
  g.Input.bot = { x: 0, y: 0 }; g.Input.update(); g.Input.hand('main'); g.Input.hand('off'); g.Input.consumeDash(); g.Input.consumeAct();
  let dyingAt = -1;
  for (let i = 0; i < frames; i++) {
    const d = g.Game.dive;
    if (d !== d0) break;
    G.__rand.random = g.mulberry32(g.hashInts(SEED, k, i, 0x7a));
    g.Input.bot = fighter(d, P, rng, i, mem);
    if (sc.each) sc.each(d, i);
    g.Game.step(DT);
    // (the test's mercy: he isn't let fall, but in the scene that's about it)
    if (!sc.falls && !d.dying && d.p.hp < 45) d.p.hp = 90;
    if (words) for (const n of d.nums) if (n.word && !n._w) { n._w = 1; words[n.word] = (words[n.word] || 0) + 1; }
    hashes.push(stateHash(d, keys, seen));
    if (d.dying && dyingAt < 0) dyingAt = i;
    if (dyingAt >= 0 && i - dyingAt > 40) break;
  }
  g.Input.bot = null;
  const d = g.Game.dive;
  const end = { kills: d.kills, hp: Math.round(d.p.hp * 100) / 100, dying: !!d.dying, foes: d.enemies.filter((e) => !e.dead).map((e) => `${e.type} ${Math.round(e.hp)}/${e.maxHp}`).join(', ') };
  return { hashes, end };
}

// What landed, by what (recording, and with --coverage): the blows on him by
// where they came from, the blows on them by element, the kills by kind.
const cover = { him: {}, them: {}, kills: {} };
if (record || process.argv.includes('--coverage')) {
  const count = (o, k) => { o[k] = (o[k] || 0) + 1; };
  const from = (x) => (!x ? 'none' : x.type ? x.type : x.storm ? 'storm' : x.ph !== undefined ? 'vent' : x.burst !== undefined && x.x1 !== undefined ? 'glob' : x.vx !== undefined ? 'shot' : x.kind || 'other');
  const wrap = (name, fn) => { const f = G[name]; G[name] = function (...a) { fn(...a); return f.apply(this, a); }; };
  wrap('hurtPlayer', (dmg, x) => count(cover.him, from(x)));
  wrap('hurtEnemy', (e, dmg, o = {}) => count(cover.them, (o.els || (o.element ? [o.element] : ['none'])).join('+')));
  wrap('killEnemy', (e) => count(cover.kills, e.type));
  wrap('hazardDrain', () => count(cover.him, 'drain'));
}
const failures = [];
if (record) {
  const seen = Object.fromEntries(KINDS.map((k) => [k, new Set()]));
  const words = {}, pass = [];
  for (let k = 0; k < SCENES.length; k++) {
    const r = play(SCENES[k], k, null, seen, words);
    pass.push({ name: SCENES[k].name, frames: r.hashes.length, end: r.end, hashes: r.hashes });
    console.log(`  ${SCENES[k].name}: ${r.hashes.length} frames, ${JSON.stringify(r.end)}`);
  }
  console.log('  words risen: ' + Object.entries(words).map(([w, n]) => `${w} ${n}`).join(', '));
  for (const k in cover) console.log(`  ${k}: ` + Object.entries(cover[k]).map(([w, n]) => `${w} ${n}`).join(', '));
  const keys = Object.fromEntries(KINDS.map((n) => [n, [...seen[n]].sort()]));
  const lines = pass.map((s) => '    ' + JSON.stringify(s));
  fs.writeFileSync(FILE, '{\n  "about": "Fights played through Game.step, every frame\'s combat state hashed; recorded from the original code by node test/fights.js --record.",\n  "seed": ' + SEED + ',\n  "keys": ' + JSON.stringify(keys) + ',\n  "scenes": [\n' + lines.join(',\n') + '\n  ]\n}\n');
  console.log(`fights: recorded ${pass.length} scenes, ${pass.reduce((n, s) => n + s.frames, 0)} frames`);
} else {
  const want = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const keys = Object.fromEntries(KINDS.map((n) => [n, new Set(want.keys[n])]));
  let frames = 0;
  for (let k = 0; k < want.scenes.length; k++) {
    const w = want.scenes[k];
    if (only && !w.name.includes(only)) continue;
    const r = play(SCENES[k], k, keys, null, null);
    frames += r.hashes.length;
    const at = r.hashes.findIndex((h, i) => h !== w.hashes[i]);
    if (at >= 0 || r.hashes.length !== w.frames) failures.push(`${w.name}: frame ${at >= 0 ? at : r.hashes.length} differs (${r.hashes.length} frames, was ${w.frames}; ends ${JSON.stringify(r.end)}, was ${JSON.stringify(w.end)})`);
  }
  console.log(`fights: ${want.scenes.length} scenes, ${frames} frames replayed`);
  if (process.argv.includes('--coverage')) for (const k in cover) console.log(`  ${k}: ` + Object.entries(cover[k]).map(([w, n]) => `${w} ${n}`).join(', '));
}
finish('fights', failures);
