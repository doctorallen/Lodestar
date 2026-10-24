'use strict';
// ---------------------------------------------------------------------------
// Wick's upgrades, fitted at the Drone Bay once it stands (structures.js;
// their recipes in blueprints.js, their numbers in T.wickUp), each once.
// Each can be turned off and on there, free
// (facets.js: lent from a magnitude, off if turned off at TURN). Out in the
// land, each shows what it does:
//   scan    a ping now and then: a ring out from Wick, veins near glinting
//           for a moment, marks on the pack and on cores on the ground
//   lamp    a second, dimmer beam from behind you (render.js)
//   shield  a hex shield of hard light stops the hit that would leave you
//           low, once a fight (combat.js hurtPlayer)
//   spark   a small shock now and then at the nearest awake foe
// The first time each does its thing, Wick says so (story.js, WICK).
// ---------------------------------------------------------------------------

const WICK_UPS = {
  scan: { text: () => `Every few seconds out in the land, Wick pings: veins within ${T.wickUp.scan.reach} tiles glint, and marks point to your pack and to modules lying on the ground.` },
  lamp: { text: () => "Wick shines a second, dimmer beam behind you, so what comes from behind doesn't come out of the dark. (With the lamp as a beam, the pause screen's LAMP.)" },
  shield: { text: () => `Once a fight, when a hit would leave you under ${Math.round(T.wickUp.shield.below * 100)}% of your health, Wick throws a hex shield that stops it. Ready again once nothing has hurt you for ${T.wickUp.shield.rest} s.` },
  spark: { text: () => `Every few seconds Wick zaps the nearest awake foe within ${Math.round(T.wickUp.spark.reach / TILE)} tiles with a small shock (shock: it chills nothing, but it stings).` },
};
const WICK_COL = { scan: '#7dffd8', lamp: '#ffe2b0', shield: '#8fc4ff', spark: '#c9a2ff' };

// Wick's upgrades are facets the star lends him (facets.js): each from a
// magnitude, on unless turned off at TURN.
function wickFitted(id) { return wickLent(id); }
function wickOn(id) { return wickLent(id) && !wickOff(id); }
function wickOpen(id) { return wickLent(id); }

// Wick's icon for an upgrade: the drone, and the upgrade's mark beside it.
const _wickIcons = {};
function wickIconUrl(id) {
  if (_wickIcons[id]) return _wickIcons[id];
  const c = document.createElement('canvas'), W = 24;
  c.width = c.height = W;
  const x = c.getContext('2d'), S = wickSprite(), col = WICK_COL[id];
  x.drawImage(S.c, 2, 6); x.globalCompositeOperation = 'lighter'; x.drawImage(S.ec, 2, 6); x.globalCompositeOperation = 'source-over';
  const px = (i, j, k) => { x.fillStyle = k || col; x.fillRect(i, j, 1, 1); };
  if (id === 'scan') for (let a = -1.1; a <= 1.1; a += 0.12) { px(Math.round(12 + Math.cos(a) * 9), Math.round(13 + Math.sin(a) * 9)); px(Math.round(12 + Math.cos(a) * 6), Math.round(13 + Math.sin(a) * 6), '#3a9a88'); }
  if (id === 'lamp') for (let i = 0; i < 7; i++) for (let j = -i >> 1; j <= i >> 1; j++) px(9 - i, 15 + j, i < 2 ? '#fff6dc' : i < 5 ? col : '#b88a50');
  if (id === 'shield') { const pts = hlHex(17, 6.5, 4.5, 4.5, Math.PI / 6); for (let i = 0; i < 6; i++) { const [a, b] = pts[i], [c2, e2] = pts[(i + 1) % 6], n = 8; for (let k = 0; k <= n; k++) px(Math.round(a + (c2 - a) * k / n), Math.round(b + (e2 - b) * k / n)); } px(17, 6, '#d8e8ff'); }
  if (id === 'spark') for (const [a, b] of [[18, 2], [17, 3], [16, 4], [17, 5], [18, 5], [17, 6], [16, 7], [15, 8]]) px(a, b, b < 5 ? '#ffffff' : col);
  return (_wickIcons[id] = c.toDataURL());
}

// ---------------------------------------------------------------------------
// Out in the land
// ---------------------------------------------------------------------------
// Wick's state on a sortie (made the first time it's wanted).
function wickState(d) {
  return d.wk || (d.wk = { scanT: 2.5, scan: null, sparkT: 1.5, ready: true, rest: 0, fx: [] });
}
// Where Wick is (world px): beside the Kindler's shoulder (render.js).
function wickAt(d) { return d.drone ? { x: d.drone.x, y: d.drone.y } : { x: d.p.x - 6, y: d.p.y - T.wick.up }; }

// Each step out in the land.
function updateWick(d, dt) {
  if (d.hub || d.dying) return;
  const W = wickState(d), U = T.wickUp;
  for (const f of W.fx) f.t -= dt;
  W.fx = W.fx.filter((f) => f.t > 0);
  if (W.scan && (W.scan.t -= dt) <= 0) W.scan = null;
  if (wickOn('scan') && (W.scanT -= dt) <= 0) { W.scanT = U.scan.every; wickPing(d); }
  if (wickOn('shield') && !W.ready && (W.rest += dt) >= U.shield.rest) { W.ready = true; W.fx.push({ kind: 'ready', t: 0.6, max: 0.6 }); }
  if (wickOn('spark') && (W.sparkT -= dt) <= 0) W.sparkT = wickSpark(d) ? U.spark.every : 0.3;
  if (wickOn('lamp') && !d.kindled && lampIsBeam()) Story.say('wick_lamp');
}

// The scanner's ping: what it finds near, for a moment.
function wickPing(d) {
  const W = wickState(d), U = T.wickUp.scan, f = d.floor, p = d.p, R = U.reach, tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE), veins = [];
  for (let y = Math.max(0, ty - R); y <= Math.min(f.h - 1, ty + R); y++)
    for (let x = Math.max(0, tx - R); x <= Math.min(f.w - 1, tx + R); x++) {
      const i = y * f.w + x;
      if (f.tiles[i] === TILE_ORE && (x - tx) * (x - tx) + (y - ty) * (y - ty) <= R * R) { const o = T.ores[f.ore[i] - 1]; veins.push({ x, y, ore: o ? o.id : 'ferrite', far: Math.hypot(x - tx, y - ty) }); }
    }
  const mods = d.drops.filter((x) => x.item && x.item.kind === 'stone' && !x.gone).map((x) => ({ x: x.x, y: x.y }));
  const pack = d.cacheAt && d.cacheAt.floor === f ? { x: d.cacheAt.x, y: d.cacheAt.y } : null;
  const at = wickAt(d);
  W.scan = { t: U.show, max: U.show, veins, mods, pack, x: at.x, y: at.y };
  if (veins.length || mods.length || pack) Story.say('wick_scan');
  snd('introPing', {});
}

// The spark: the nearest awake foe in reach, a small shock.
function wickSpark(d) {
  const U = T.wickUp.spark, p = d.p;
  let best = null, bd = U.reach;
  for (const e of d.enemies) {
    if (e.dead || e.hid || !e.aggro || e.type === 'dummy') continue;
    const m = dist(e.x, e.y, p.x, p.y);
    if (m < bd) { bd = m; best = e; }
  }
  if (!best) return false;
  const at = wickAt(d), dmg = Math.max(1, Math.round(best.maxHp * (best.boss ? U.boss : U.frac)));
  hurtEnemy(best, dmg, { element: 'shock', noProc: true });
  wickState(d).fx.push({ kind: 'spark', t: 0.22, max: 0.22, x0: at.x, y0: at.y + 4, x1: best.x, y1: best.y - 6, seed: (Game.realT * 1000) | 0 });
  snd('hit', { el: 'shock' });
  Story.say('wick_spark');
  return true;
}

// A hit coming in (combat.js hurtPlayer, after armour and a ward): the
// shield stops it if it would leave the Kindler low, once a fight. Any hit
// starts the wait for the next fight over.
function wickShieldBlocks(d, dmg) {
  if (!wickOn('shield') || d.hub) return false;
  const W = wickState(d), p = d.p, U = T.wickUp.shield;
  W.rest = 0;
  if (!W.ready || p.hp - dmg >= d.stats.maxHp * U.below) return false;
  W.ready = false;
  W.fx.push({ kind: 'shield', t: 0.9, max: 0.9 });
  d.nums.push({ x: p.x, y: p.y - 30, word: 'BLOCKED', col: WICK_COL.shield, t: 1 });
  snd('seal', {});
  buzz(25);
  Story.say('wick_shield');
  return true;
}

// Wick's effects in the world, lit with the rest (render.js): the ping's
// ring going out from Wick, a spark's bolt, the shield round the Kindler,
// and, while the shield is ready, its small hex beside Wick.
function drawWickAir(d, ox, oy, lights) {
  if (d.hub || !d.wk) return;
  const W = d.wk, p = d.p, fx = Math.round(p.x * AP) + ox, fy = Math.round(p.y * AP) + oy;
  if (W.scan) {
    const k = 1 - W.scan.t / W.scan.max, go = Math.min(1, k / 0.35), cx = Math.round(W.scan.x * AP) + ox, cy = Math.round(W.scan.y * AP) + oy + ap(T.wick.up);
    if (go < 1) hlRing(cx, cy, Math.max(2, Math.round(go * T.wickUp.scan.reach * ATILE)), WICK_COL.scan, 0.6, (1 - go) * 0.9, go > 0.6 ? 2 : 1);
  }
  for (const f of W.fx) {
    const k = f.t / f.max;
    if (f.kind === 'spark') {
      const x0 = Math.round(f.x0 * AP) + ox, y0 = Math.round(f.y0 * AP) + oy, x1 = Math.round(f.x1 * AP) + ox, y1 = Math.round(f.y1 * AP) + oy, sd = f.seed + Math.floor(Game.realT * 20) * 31;
      cfxPaintBolt(cfxBoltPath(x0, y0, x1, y1, sd, 0.14), cfxRamp(WICK_COL.spark), Math.min(1, k * 2), 0.9, sd);
      lights.push({ x: x1, y: y1, r: TILE * 1.1, i: 0.7 * k, c: rgb01(WICK_COL.spark) });
    } else if (f.kind === 'shield') {
      const rx = ap(15), ry = ap(17);
      cfxBlitHard(hlLatticePic(rx, ry, WICK_COL.shield), fx, fy - ap(13), k, 0.95);
      lights.push({ x: fx, y: fy - ap(12), r: TILE * 2, i: 0.9 * k, c: rgb01(WICK_COL.shield) });
    }
  }
  if (wickOn('shield') && W.ready && d.drone) {
    const x = Math.round((d.drone.x - p.x) * AP) + fx + ap(7), y = Math.round((d.drone.y - p.y) * AP) + fy + Math.round(Math.sin(Game.realT * 2) * 1.5);
    const fresh = W.fx.find((f) => f.kind === 'ready'), a = fresh ? 1 : 0.55;
    hlPoly(hlHex(x, y, 3, 3, Math.PI / 6), WICK_COL.shield, a);
  }
}

// Over the lit scene, so they read in any dark (render.js, with the tools'
// marks): the veins the ping found glinting, and marks on the pack and on
// cores on the ground (an arrow at the view's edge if they're beyond it).
function drawWickHud(d, ox, oy) {
  if (d.hub || !d.wk || !d.wk.scan) return;
  const S = d.wk.scan, k = S.t / S.max, c = View.ctx, p = d.p, px = Math.round(p.x * AP) + ox, py = Math.round(p.y * AP) + oy - ap(8);
  // (each vein lights as the ring reaches it)
  const reached = (1 - k) / 0.35 * T.wickUp.scan.reach;
  for (const v of S.veins) {
    if (v.far > reached) continue;
    // (round the rock's top, where it stands, as the cutter's target is)
    const ramp = ART.ores[v.ore], x = v.x * ATILE + ox, y = v.y * ATILE + oy - pntLiftAt((v.x + 0.5) * ATILE, (v.y + 0.5) * ATILE), a = Math.min(1, k * 1.6), h = (v.x * 7 + v.y * 13) % 5;
    c.globalAlpha = a;
    c.fillStyle = ramp[3];
    for (const [i, j] of [[0, 0], [1, 0], [2, 0], [0, 1], [0, 2]]) { c.fillRect(x + 1 + i, y + 1 + j, 1, 1); c.fillRect(x + ATILE - 2 - i, y + 1 + j, 1, 1); c.fillRect(x + 1 + i, y + ATILE - 2 - j, 1, 1); c.fillRect(x + ATILE - 2 - i, y + ATILE - 2 - j, 1, 1); }
    c.fillStyle = WICK_COL.scan;
    for (const [i, j] of [[0, 0], [ATILE - 1, 0], [0, ATILE - 1], [ATILE - 1, ATILE - 1]]) c.fillRect(x + (i ? i - 1 : 1), y + (j ? j - 1 : 1), 1, 1);
    if (((Game.realT * 3 + h) | 0) % 2) { c.fillStyle = '#ffffff'; c.fillRect(x + ap(4 + h), y + ap(5), 1, 1); }
    c.globalAlpha = 1;
  }
  const mark = (wx, wy, col) => {
    if (edgePip(px, py, wx, wy, ox, oy, col, 3)) return;
    const x = Math.round(wx * AP) + ox, y = Math.round(wy * AP) + oy - ap(16) + Math.round(Math.sin(Game.realT * 4) * 1.5);
    toolArrow(x, y - 4, Math.PI / 2, col, 3);
  };
  c.globalAlpha = Math.min(1, k * 2);
  for (const m of S.mods) mark(m.x, m.y, WICK_COL.scan);
  if (S.pack) mark(S.pack.x, S.pack.y, ART.pal.star[3]);
  c.globalAlpha = 1;
}

// The lamp: a second beam from behind the Kindler, dimmer and shorter,
// stopped by the rock with its own sight (shadow.js), in a cooler white.
const WickBeamSight = { x0: 0, y0: 0, w: 0, vis: null, key: '', rock: null, lights: null, ok: false };
function addWickLamp(d, L, Bm) {
  if (!wickOn('lamp') || !Bm || d.hub) return;
  const U = T.wickUp.lamp, B = T.light.beam, rad = Math.PI / 180, e = U.edge * rad;
  const W = Object.assign({}, Bm, {
    ang: Bm.ang + Math.PI, dx: -Bm.dx, dy: -Bm.dy, r: Bm.r * U.reach, i: Bm.i * U.i,
    ax: Bm.x + Bm.dx * B.back, ay: Bm.y + Bm.dy * B.back,
    core: e * (B.core / B.edge), main: e, edge: e * B.halo[0], cOut: Math.cos(e * B.halo[0]),
  });
  const S = T.light.shadow.walls ? lampBeamSight(d, W, WickBeamSight) : null;
  addConeLight(L, W, rgb01('#e8eeff'), S);
}
