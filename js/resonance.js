'use strict';
// ---------------------------------------------------------------------------
// Resonances: exact circuits that wake into named spells (RESONANCES, in
// circuits.js). One must fill its caster exactly, so the base and its slot
// count matter. A resonant circuit hits T.circuits.resonance.mult as hard
// (more from Resonite), and does something its parts alone don't:
//   Thunderhead   ORB SHOCK LINGER: the orb stops overhead and becomes a
//                 stormcloud, striking the nearest foe below until it fades.
//   Shatterglass  LANCE FROST ECHO: the echo lance shatters the chilled
//                 along its line for double, flinging shards either side.
//   Kindling Arc  ARC EMBER QUICKEN: every third arc sets the ground in
//                 front alight in a crescent.
//   Wildfire      ORB EMBER SPLIT LINGER: three orbs leave burning trails;
//                 plants catch, and the fire runs through them (that part is
//                 only for show).
//   Stormglaive   GLAIVE SHOCK CHAIN AMPLIFY: the blades arc lightning to
//                 every foe within reach.
//   Starfall      BOLT FORCE SPLIT TRIGGER NOVA: three bolts rise and meet
//                 as a falling star: a crater, a stun, a ring of light.
// circuits.js calls in: resonanceFire (a group fired its own way),
// kindleCrescent, wildfireTrail, shatterglassShards, stormglaiveArcs,
// thunderheadTick.
//
// The Codex, at the forge, shows each as a silhouette with its slot count;
// resonance stones (from elites, by ancient forges, from contracts) show
// its parts one by one. Kindling Arc is known from the start, and building
// one fills it in. Looks are drawn here too, in whole art px, with no shake.
// ---------------------------------------------------------------------------

const RES_FX = { dive: null, floor: null, stars: [], burning: [], spreadT: 0 };
const RES_NO_INST = { hit() {}, end() {} };
const RES_GOLD = '#ffd34d';

function resFxFor(d) {
  if (RES_FX.dive !== d) { RES_FX.dive = d; RES_FX.stars.length = 0; RES_FX.spreadT = 0; }
  if (RES_FX.floor !== d.floor) { RES_FX.floor = d.floor; RES_FX.burning = []; }
}

// How much harder a caster's resonance hits (more in Resonite).
function resonanceMult(it) { return T.circuits.resonance.mult * (1 + (casterOreWay(it).resonance || 0)); }
const resonanceById = (id) => RESONANCES.find((r) => r.id === id) || null;

// A resonant circuit is cast: the Codex fills in, Wick says what it is the
// first time, and its name rises over the diver the first time a dive.
function resonanceCast(res, d) {
  codexFill(res.id);
  Story.say('resonance');
  d.resSeen = d.resSeen || {};
  if (!d.resSeen[res.id]) { d.resSeen[res.id] = true; d.nums.push({ x: d.p.x, y: d.p.y - 30, word: res.name.toUpperCase(), col: RES_GOLD, t: 1.4 }); }
  // a gold sigil under the feet, over the cast's own, the Charter's
  // seed-star in it
  if (CFX.dive === d) CFX.rings.push({ kind: 'glyph', x: 0, y: 0, r0: 10, r1: 15, col: RES_GOLD, t: 0.45, max: 0.45, f: true, rot: 0, seed: true });
}

// A group of a resonant circuit fires: true if the resonance fired it its
// own way (Thunderhead's orb, Starfall's bolts); the rest change how their
// Form's cast goes (circuits.js).
function resonanceFire(s) {
  const id = s.cx.res;
  if (s.cx.from) return false;
  if (id === 'thunderhead' && s.form === 'orb') { castThunderhead(s); return true; }
  if (id === 'starfall' && s.form === 'bolt') { castStarfall(s); return true; }
  return false;
}

// Where a placed resonance lands: the foe in aim, else `ahead` px out, but
// short of the rock.
function resonancePoint(s, ahead) {
  const d = Game.dive, p = d.p, aim = circuitAim(null, casterBase(s.cx.item).aim, null, null);
  if (aim.target) return { x: aim.target.x, y: aim.target.y, a: aim.a };
  let x = p.x, y = p.y;
  for (let k = 4; k <= ahead; k += 4) {
    const nx = p.x + Math.cos(aim.a) * k, ny = p.y + Math.sin(aim.a) * k;
    if (TILE_SOLID[floorTile(d.floor, Math.floor(nx / TILE), Math.floor(ny / TILE))]) break;
    x = nx; y = ny;
  }
  return { x, y, a: aim.a };
}

// ---------------------------------------------------------------------------
// Thunderhead
// ---------------------------------------------------------------------------
function castThunderhead(s) {
  const d = Game.dive, p = d.p, R = T.circuits.resonance.thunderhead, at = resonancePoint(s, R.ahead);
  d.auras.push({ kind: 'cloud', x: at.x, y: at.y, x0: p.x, y0: p.y - 8, fly: R.fly, t: R.time + R.fly, max: R.time + R.fly, tick: R.fly, r: R.r * s.area, dmg: s.dmg * R.mult, s, inst: circuitInstance(s, 1), col: s.col, a: at.a, flashT: 0 });
}
function thunderheadTick(au, dt) {
  const d = Game.dive, R = T.circuits.resonance.thunderhead;
  au.flashT = Math.max(0, au.flashT - dt);
  if (au.fly > 0) { au.fly -= dt; return; }
  let best = null, bd = au.r;
  for (const e of d.enemies) { if (e.dead) continue; const m = dist(e.x, e.y, au.x, au.y); if (m < bd + e.r) { bd = m; best = e; } }
  // it drifts to stand over the nearest foe below
  if (best && bd > 4) { const k = Math.min(1, (R.drift * dt) / bd); au.x += (best.x - au.x) * k; au.y += (best.y - au.y) * k; }
  if ((au.tick -= dt) > 0 || !best) return;
  au.tick = R.every;
  d.fx.push({ kind: 'arc', x: au.x + FX_R.f(-6, 6), y: au.y - R.height + 3, x2: best.x, y2: best.y - 5, t: 0.16, max: 0.16, col: ELEMENT_COLS.shock });
  au.flashT = 0.12;
  circuitHit(au.s, best, au.dmg, { noChain: true });
}

// ---------------------------------------------------------------------------
// Starfall
// ---------------------------------------------------------------------------
function castStarfall(s) {
  const d = Game.dive, p = d.p, R = T.circuits.resonance.starfall, at = resonancePoint(s, R.ahead);
  resFxFor(d);
  const o = CFX.origin || { x: 0, y: -10 };
  RES_FX.stars.push({ x0: p.x + o.x, y0: p.y + o.y, x1: at.x, y1: at.y, t: 0, rise: R.rise, fall: R.fall });
  const nova = s.g.next ? circuitGroupState(s.g.next, Object.assign({}, s.cx, { from: { x: at.x, y: at.y } })) : null;
  d.later.push({ t: R.rise + R.fall, fn: () => starfallStrike(s, nova, at.x, at.y) });
}
function starfallStrike(s, nova, x, y) {
  const d = Game.dive;
  if (!d) return;
  const R = T.circuits.resonance.starfall, Gl = T.circuits.glyphs, r = R.r * (nova ? nova.area : s.area);
  // the three bolts and the nova, all at once
  const dmg = s.dmg * Gl.split.mult * s.gk * 3 + (nova ? nova.dmg : 0), hs = nova || s;
  for (const e of d.enemies) {
    if (e.dead || dist(e.x, e.y, x, y) > r + e.r) continue;
    const k = norm(e.x - x, e.y - y);
    circuitHit(hs, e, dmg, { heavy: true, knock: { x: k.x * 140, y: k.y * 140 }, noChain: true });
    if (!e.dead) reactStun(e, R.stun);
  }
  // a crater, a ring of light, the light it gives; no shake
  starfallCrater(x, y);
  cfxSweep(x, y, 4, r * 1.3, '#fff2c8', 0.5, false, 18);
  CFX.rings.push({ kind: 'burst', x, y: y - 4, r0: 3, r1: 16, col: '#ffffff', t: 0.2, max: 0.2, f: false });
  CFX.rings.push({ kind: 'seed', x, y: y - 6, col: RES_GOLD, t: 0.5, max: 0.5, f: false, big: true });
  cfxFlare(x, y - 8, r * 1.4, 1.5, '#fff2c8', 0.45);
  for (let k = 0; k < 16; k++) { const a = FX_R.f(Math.PI * 2), sp = FX_R.f(40, 110), q = cfxPart(CFX_SPARK, x, y - 4, Math.cos(a) * sp, Math.sin(a) * sp * 0.6 - 30, FX_R.f(0.2, 0.45), k % 3 ? '#fff2c8' : '#ffffff'); if (q) q.g = 120; }
  freezeFrame(T.impact.heavyStop, true);
}
// A crater: a dark bowl with a lit rim and glowing cracks, kept a while.
function starfallCrater(x, y) {
  const col = cfxPic('crater', 40, 18, (set) => {
    for (let j = -6; j <= 6; j++) for (let i = -16; i <= 16; i++) {
      const e = (i * i) / 256 + (j * j) / 36;
      if (e > 1) continue;
      set(i, j, e > 0.7 ? (j < 0 ? '#4a4258' : '#2c2636') : e > 0.35 ? '#1e1a28' : '#141018', 0.92);
    }
  });
  const em = cfxPic('crater-em', 40, 18, (set) => {
    for (const [i, j] of [[-9, -1], [-8, 0], [-7, 1], [6, -2], [7, -1], [8, -1], [-2, 3], [-1, 4], [3, 2], [12, 1], [-12, 0]]) set(i, j, j < 0 ? '#ffd890' : '#ff9a4a');
  });
  const D = CFX.decals;
  if (D.length >= T.castFx.decal[1]) D.shift();
  D.push({ x, y, pic: { col, em }, t: 3, max: 3 });
}

// ---------------------------------------------------------------------------
// Kindling Arc, Wildfire: fire on the ground
// ---------------------------------------------------------------------------
// The heavy third of a Kindling Arc: patches of fire in a crescent in front.
function kindleCrescent(s, x0, y0, a, range, cos) {
  const d = Game.dive, K = T.circuits.resonance.kindling, half = Math.min(K.half, Math.acos(clamp(cos, -0.6, 0.9)));
  for (let i = 0; i < K.flames; i++) {
    const b = a - half + (2 * half * i) / Math.max(1, K.flames - 1), x = x0 + Math.cos(b) * range * K.r, y = y0 + Math.sin(b) * range * K.r;
    if (TILE_SOLID[floorTile(d.floor, Math.floor(x / TILE), Math.floor(y / TILE))]) continue;
    d.puddles.push({ x, y, r: K.size, t: K.time, max: K.time, dps: s.dmg * K.dps, mine: true, els: ['ember'], att: s.att, col: ELEMENT_COLS.ember, every: 0.5, fire: true, born: Game.realT + i * 0.04 });
  }
}
// A Wildfire orb leaves fire behind it as it goes.
function wildfireTrail(b, dt) {
  const d = Game.dive, W = T.circuits.resonance.wildfire;
  b.trailD += Math.hypot(b.vx, b.vy) * dt;
  if (b.trailD < W.every) return;
  b.trailD = 0;
  const x = b.x, y = b.y + 6;
  if (TILE_SOLID[floorTile(d.floor, Math.floor(x / TILE), Math.floor(y / TILE))]) return;
  let n = 0;
  for (const pu of d.puddles) if (pu.wild) n++;
  if (n >= W.most) { const i = d.puddles.findIndex((pu) => pu.wild); if (i >= 0) d.puddles.splice(i, 1); }
  d.puddles.push({ x, y, r: W.r, t: W.time, max: W.time, dps: b.dmg * W.dps, mine: true, els: ['ember'], att: b.s.att, col: ELEMENT_COLS.ember, every: 0.5, fire: true, wild: true, born: Game.realT });
}

// Flora by a Wildfire trail catches, and passes it on through its drift
// (cosmetic: Math.random, real time). Called each step from updateCastFx.
function updateResonanceFx(dt) {
  const d = Game.dive;
  if (!d) return;
  resFxFor(d);
  for (const st of RES_FX.stars) st.t += dt;
  RES_FX.stars = RES_FX.stars.filter((st) => st.t < st.rise + st.fall);
  const W = T.circuits.resonance.wildfire, list = View.flora;
  if (!list || d.hub) return;
  let burning = 0;
  for (const fl of RES_FX.burning) if ((fl.fireT -= dt) > 0) burning++;
  if ((RES_FX.spreadT -= dt) > 0) return;
  RES_FX.spreadT = W.spreadEvery;
  const near = [], p = d.p, fires = d.puddles.filter((pu) => pu.wild);
  if (!fires.length && !burning) { RES_FX.burning = []; return; }
  for (const fl of list) if (fl.piece && !fl.top && Math.abs(fl.x - p.x) < 220 && Math.abs(fl.y - p.y) < 220) near.push(fl);
  const lit = RES_FX.burning.filter((fl) => fl.fireT > 0);
  const light = (fl) => { if (lit.length >= W.flora || fl.fireT > 0) return; fl.fireT = W.burn * (0.7 + Math.random() * 0.6); lit.push(fl); };
  for (const pu of fires) for (const fl of near) if (Math.abs(fl.x - pu.x) < W.ignite && Math.abs(fl.y - pu.y) < W.ignite) light(fl);
  // each burning plant may set one beside it alight
  for (const fl of lit.slice()) {
    if (Math.random() > 0.5) continue;
    const o = near.find((q) => !(q.fireT > 0) && Math.abs(q.x - fl.x) < W.spread && Math.abs(q.y - fl.y) < W.spread && Math.random() < 0.6);
    if (o) light(o);
  }
  RES_FX.burning = lit;
}

// ---------------------------------------------------------------------------
// Shatterglass, Stormglaive
// ---------------------------------------------------------------------------
// The echo lance shatters a chilled foe: shards out to either side.
function shatterglassShards(b, e) {
  const d = Game.dive, S = T.circuits.resonance.shatterglass, sp = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / sp, uy = b.vy / sp;
  d.fx.push({ kind: 'iceBurst', x: e.x, y: e.y - 6, r: 14, t: 0.3, max: 0.3 });
  reactWord(e, 'SHATTER', '#e8f8ff');
  for (const side of [-1, 1]) for (let k = 0; k < S.shards; k++) {
    const a = Math.atan2(ux * side, -uy * side) + (k - (S.shards - 1) / 2) * 0.5;
    d.bolts.push({ x: e.x, y: e.y - 5, vx: Math.cos(a) * S.shardSpeed, vy: Math.sin(a) * S.shardSpeed, dmg: b.dmg * S.shardMult, kind: 'shard', t: S.shardLife, chain: 0, pierce: 0, hitIds: [e], big: false, element: 'frost', col: b.col, s: b.s, inst: RES_NO_INST, orb: null, wild: false, shatter: false });
  }
}
// Stormglaive's blades arc to every foe within reach.
function stormglaiveArcs(au, dt) {
  const d = Game.dive, R = T.circuits.resonance.stormglaive;
  if ((au.stormT -= dt) > 0) return;
  au.stormT = R.every;
  const reach = R.reach * Math.sqrt(au.s.area);
  for (const e of d.enemies) {
    if (e.dead || dist(e.x, e.y, au.x, au.y) > reach + e.r) continue;
    // from the blade nearest it
    let bx = au.x, by = au.y, bd = 1e9;
    for (let k = 0; k < au.n; k++) { const b = au.a + (k / au.n) * Math.PI * 2, x = au.x + Math.cos(b) * au.r, y = au.y + Math.sin(b) * au.r, m = dist(x, y, e.x, e.y); if (m < bd) { bd = m; bx = x; by = y; } }
    d.fx.push({ kind: 'arc', x: bx, y: by - 6, x2: e.x, y2: e.y - 5, t: 0.14, max: 0.14, col: ELEMENT_COLS.shock });
    circuitHit(au.s, e, au.dmg * R.mult, { noChain: true });
  }
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------
// A stormcloud: puffs in four slate tones, lit from the top left; when it
// strikes, its underside flashes.
function thunderheadPic() {
  return cfxPic('thunderhead', 56, 26, (set) => {
    const puffs = [[-15, 2, 8], [-5, -3, 10], [6, -2, 10], [16, 3, 7], [0, 4, 9], [-11, 5, 6], [11, 5, 6]];
    for (let j = -13; j <= 12; j++) for (let i = -27; i <= 27; i++) {
      let inside = false, top = 1;
      for (const [cx, cy, r] of puffs) { const m = Math.hypot(i - cx, (j - cy) * 1.3); if (m <= r) { inside = true; top = Math.min(top, (j - cy) / r); } }
      if (!inside) continue;
      const edge = puffs.every(([cx, cy, r]) => Math.hypot(i - cx, (j - cy) * 1.3) > r - 1);
      set(i, j, edge ? '#1c1a2a' : top < -0.5 && i < 8 ? '#8a88a8' : top < 0.05 ? '#5c5a76' : '#383650');
    }
  });
}
function drawThunderhead(au, ox, oy, tick, lights) {
  const R = T.circuits.resonance.thunderhead, c = View.ctx;
  if (au.fly > 0) {
    // the orb rising to its place
    const k = 1 - au.fly / R.fly, x = Math.round(lerp(au.x0, au.x, k) * AP) + ox, y = Math.round(lerp(au.y0, au.y - R.height, k) * AP) + oy;
    cfxDrawOrb({ orb: null }, x, y, tick, au.col, lights);
    return;
  }
  const pic = thunderheadPic(), x = Math.round(au.x * AP) + ox, y = Math.round((au.y - R.height) * AP) + oy, fade = Math.min(1, au.t / 0.4);
  if (x < -40 || y < -30 || x > View.w + 40 || y > View.h + 30) return;
  c.globalAlpha = cfxBand(fade);
  c.drawImage(pic.c, x - pic.cx, y - pic.cy);
  c.globalAlpha = 1;
  // held in a ring of six gold emitters under it, arcs crawling between
  // them, all of them flashing as it strikes
  const ft = Math.floor(Game.realT * 30), SR = cfxRamp(ELEMENT_COLS.shock), ey = y + ap(7), nodes = [];
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + Game.realT * 0.8; nodes.push([Math.round(x + Math.cos(a) * ap(15)), Math.round(ey + Math.sin(a) * ap(3))]); }
  for (const [nx, ny] of nodes) { dot(nx, ny, au.flashT > 0 ? '#ffffff' : HL_GOLD[4], true, fade); dot(nx + 1, ny, HL_GOLD[2], true, fade * 0.8); }
  for (let k = 0; k < (au.flashT > 0 ? 3 : 1); k++) {
    const q = (ft >> 2) + k * 2, a = nodes[q % 6], b = nodes[(q + 1) % 6];
    cfxPaintBolt(cfxBoltPath(a[0], a[1], b[0], b[1], ft + k * 17, 0.25), SR, fade * 0.9, 0.6, ft + k);
  }
  // a lock-on on the foe it will strike next, closing as the strike nears
  if (au.fly <= 0 && au.tick < 0.3) {
    let best = null, bd = au.r;
    for (const e of Game.dive.enemies) { if (e.dead) continue; const m = dist(e.x, e.y, au.x, au.y); if (m < bd + e.r) { bd = m; best = e; } }
    if (best) { const g = 1 + au.tick * 3, w = ap(best.r * 2 + 7) * g; hlBrackets(Math.round(best.x * AP) + ox, Math.round((best.y - best.r - 5) * AP) + oy, w, w * 1.15, 3, HL_GOLD[4], fade); }
  }
  // a shadow on the ground under it
  for (let i = -ap(11); i <= ap(11); i += 2) dot(x + i, Math.round(au.y * AP) + oy + (i & 2 ? 1 : 0), '#0a0812', false, 0.35 * fade);
  cfxLight(lights, x, y, TILE * 2, 0.7 * fade, [0.75, 0.75, 0.95]);
  cfxLight(lights, x, y + ap(8), TILE * (au.flashT > 0 ? 2.6 : 1.4), (au.flashT > 0 ? 1.2 : 0.5) * fade, rgb01(ELEMENT_COLS.shock));
}

// Fire on the ground: tongues of flame that flicker, embers at their foot.
function drawFirePatch(pu, cx, cy, tick, lights) {
  const k = Math.min(1, pu.t / 0.6), r = pu.r * AP, n = Math.max(3, Math.round(pu.r * 0.8)), seed = (pu.max * 1000 + pu.x * 7 + pu.y * 13) | 0;
  const grow = pu.born ? clamp((Game.realT - pu.born) / 0.15, 0, 1) : 1;
  if (grow <= 0) return;
  for (let i = 0; i < n; i++) {
    const h = hashInts(seed, i, 0xf1e), fx = Math.round(cx + (((h & 255) / 255) * 2 - 1) * r * 0.8), fy = Math.round(cy + ((((h >> 8) & 255) / 255) * 2 - 1) * r * 0.35);
    const tall = Math.round((4 + ((h >> 16) % 4) + ((tick + i) % 3 === 0 ? 1 : 0)) * k * grow);
    fireTongue(fx, fy, tall, tick + i, k);
  }
  if (FX_R.f() < 0.08 * k) { const q = cfxPart(CFX_CINDER, pu.x + FX_R.f(-pu.r, pu.r) * 0.7, pu.y - 3, FX_R.f(-6, 6), FX_R.f(-26, -12), FX_R.f(0.3, 0.5), '#ffd070', ELEMENT_COLS.ember); if (q) q.g = -8; }
  cfxLight(lights, cx, cy - ap(2), pu.r * 1.6, 0.6 * k, rgb01(ELEMENT_COLS.ember));
}

// A tongue of flame `tall` art px, two wide at its foot, licking side to
// side by the tick: dark red at the foot, ember, gold, a pale tip.
function fireTongue(x, y, tall, t, a) {
  if (tall <= 0) return;
  dot(x, y, '#7a2a10', false, a); dot(x + 1, y, '#7a2a10', false, a);
  for (let j = 0; j < tall; j++) {
    const u = j / tall, lean = j > tall * 0.5 ? (t % 4 < 2 ? 1 : 0) : 0, col = u > 0.8 ? '#fff2c8' : u > 0.5 ? '#ffd070' : ELEMENT_COLS.ember;
    dot(x + lean, y - 1 - j, col, true, a);
    if (u < 0.45) dot(x + 1, y - 1 - j, u < 0.2 ? '#c84a1a' : col, true, a);
  }
}

// Over everyone: Starfall's rising bolts and falling star, and plants that
// Wildfire set alight.
function drawResonanceAir(d, ox, oy, tick, lights) {
  if (RES_FX.dive !== d) return;
  const vx = (wx) => Math.round(wx * AP) + ox, vy = (wy) => Math.round(wy * AP) + oy, H = 70;
  for (const st of RES_FX.stars) {
    const apex = { x: st.x1, y: st.y1 - H }, gx = vx(st.x1), gy = vy(st.y1), all = st.t / (st.rise + st.fall), ft = Math.floor(Game.realT * 30);
    // where it will fall: a gold ring closing on the spot, brackets round
    // it, the seed-star at its heart, blinking faster as it nears
    const rx = hlQuant(Math.max(8, ap(T.circuits.resonance.starfall.r) * (1.25 - all * 0.35)));
    hlRing(gx, gy, rx, RES_GOLD, 0.6, ft % (all > 0.7 ? 4 : 8) < 2 ? 0.5 : 0.9, all < 0.6 ? 2 : 1);
    hlBrackets(gx, gy, rx * 2 + 6, Math.round(rx * 1.2) + 6, 4, HL_GOLD[4], 0.85);
    cfxBlit(hlSeedPic(5), gx, gy, 0.8);
    if (st.t < st.rise) {
      // three slugs rise on arcs that fan out and close again, each with a
      // contrail
      const u = st.t / st.rise;
      for (const side of [-1, 0, 1]) {
        const pt = (w) => { const mx = lerp(st.x0, apex.x, 0.5) + side * 34, my = Math.min(st.y0, apex.y) - 18; return { x: (1 - w) * (1 - w) * st.x0 + 2 * (1 - w) * w * mx + w * w * apex.x, y: (1 - w) * (1 - w) * st.y0 + 2 * (1 - w) * w * my + w * w * apex.y }; };
        for (let k = 8; k >= 1; k--) { const q = pt(Math.max(0, u - k * 0.025)); dot(vx(q.x), vy(q.y), k < 3 ? '#fff6dc' : k < 6 ? HL_GOLD[3] : HL_GOLD[1], true, cfxBand(1 - k / 9)); }
        const h = pt(u), hx = vx(h.x), hy = vy(h.y);
        hlDiamond(hx, hy, 1, '#ffffff', 1); dot(hx, hy, '#ffffff', true);
        cfxLight(lights, hx, hy, TILE * 0.9, 0.7, rgb01('#fff2c8'));
      }
    } else {
      // they meet: the seed-star flashes where; then the star falls, a
      // white slug down a column of gold light
      const u = (st.t - st.rise) / st.fall, x = vx(apex.x), y = vy(lerp(apex.y, st.y1 - 4, u)), top = vy(apex.y);
      if (u < 0.35) cfxBlitHard(hlSeedPic(u < 0.15 ? 12 : 8), x, top, 1 - u / 0.35);
      for (let j = top; j < y - 2; j++) { const f = (y - j) / Math.max(1, y - top); dot(x, j, f < 0.3 ? '#fff6dc' : HL_GOLD[3], true, cfxBand(1 - f * 0.8)); if ((j + ft) % 3 === 0) { dot(x - 1, j, HL_GOLD[2], true, 0.6); dot(x + 1, j, HL_GOLD[2], true, 0.6); } }
      for (const [i, j] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0, -2], [0, 2]]) dot(x + i, y + j, '#ffffff', true);
      hlDiamond(x, y, 3, HL_GOLD[3], 0.9);
      cfxLight(lights, x, y, TILE * 2, 1.2, rgb01('#fff2c8'));
    }
  }
  for (const fl of RES_FX.burning) {
    if (!(fl.fireT > 0) || !fl.piece) continue;
    const spr = floraSprite(fl.set, fl.piece, 0), x = vx(fl.x), y = vy(fl.y), w = spr.w, h = spr.h, k = Math.min(1, fl.fireT / 0.8);
    if (x < -w || x > View.w + w || y < 0 || y - h > View.h) continue;
    const n = Math.max(2, Math.round(w / 5)), seed = (fl.x * 13 + fl.y * 7) | 0;
    for (let i = 0; i < n; i++) {
      const hh = hashInts(seed, i, 0xb12), fx = x - (w >> 1) + 2 + ((hh & 255) % Math.max(1, w - 4)), fy = y - Math.round(h * (0.35 + ((hh >> 8) & 255) / 255 * 0.5));
      const tall = Math.round((5 + ((hh >> 16) % 4) + ((tick + i) % 3 ? 0 : 1)) * k);
      fireTongue(fx, fy, tall, tick + i, k);
    }
    if (FX_R.f() < 0.12) { const q = cfxPart(CFX_SMOKE, fl.x + FX_R.f(-4, 4), fl.y - h / AP * 0.8, FX_R.f(-4, 4), FX_R.f(-16, -8), FX_R.f(0.5, 0.8), '#2c2622', '#3e3630'); if (q) q.drag = 1; }
    cfxLight(lights, x, y - Math.round(h * 0.5), TILE * 1.2, 0.6 * k, rgb01(ELEMENT_COLS.ember));
  }
}

// ---------------------------------------------------------------------------
// The Codex
// ---------------------------------------------------------------------------
// The parts of each resonance shown so far: { id: [slot indices] }.
function resCodex() {
  const s = Save.data;
  if (!s.resCodex || typeof s.resCodex !== 'object') s.resCodex = { kindling: [0, 1, 2] };
  return s.resCodex;
}
const codexShown = (r) => resCodex()[r.id] || [];
const codexWhole = (r) => codexShown(r).length >= r.seq.length;
const codexAllWhole = () => RESONANCES.every(codexWhole);
// Building or casting a resonance fills in its page.
function codexFill(id) {
  const r = resonanceById(id), C = resCodex();
  if (!r || codexWhole(r)) return false;
  C[id] = r.seq.map((x, i) => i);
  Save.saveField('resCodex');
  return true;
}
// A resonance stone: one part of a resonance not yet whole. Returns
// { res, i } or null if the Codex is whole.
function revealResonancePart(rng) {
  const open = RESONANCES.filter((r) => !codexWhole(r));
  if (!open.length) return null;
  const r = rng.pick(open), shown = codexShown(r), hidden = r.seq.map((x, i) => i).filter((i) => !shown.includes(i)), i = rng.pick(hidden);
  resCodex()[r.id] = shown.concat([i]).sort((a, b) => a - b);
  Save.saveField('resCodex');
  return { res: r, i };
}
// A resonance stone picked up (or paid by a contract): the toast it shows.
function resonanceStoneFound(rng) {
  const got = revealResonancePart(rng);
  if (!got) { UI.toast('A resonance stone. The Codex is already whole'); return; }
  UI.toast(`Resonance stone: ${got.res.name} · ${stoneWords(got.res.seq[got.i]).name}${codexWhole(got.res) ? '. Its page is whole' : ''}`, 'legendary');
  Story.say('resStone');
}

// What a caster's circuit is to the resonances: { live } when it is one,
// { stir } when it's a stone away from one that fills it, else null.
function resonanceNear(it) {
  if (!it || !it.slots) return null;
  const live = circuitResonance(it.slots);
  if (live) return { live };
  for (const r of RESONANCES) {
    if (r.seq.length !== it.slots.length) continue;
    let diff = 0;
    r.seq.forEach((id, i) => { if (!it.slots[i] || it.slots[i].stone !== id) diff++; });
    if (diff === 1) return { stir: r };
  }
  return null;
}
