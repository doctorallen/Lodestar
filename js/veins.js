'use strict';
// ---------------------------------------------------------------------------
// The Veins (DESIGN.md): the star's light laid across the world in lines.
// At the star or any living node the Kindler takes up a thread of its light
// and walks it out (slower, no dash, the dark drawn to it); where he plants
// it a node is set in the ground, and the hold begins: the node has a light
// of its own that the dark bites at, and if it stands when the hold ends it
// sets, the vein lights along the whole thread, and the land along it turns
// (terraform.js). A thread walked to another node joins it: a dark one with
// a shorter hold, a living one at once. A node lives if uncut veins join it
// to the star; the star's magnitude is the living vein length. A fall loses
// the thread.
//
// The save holds the graph: Save.data.veins = { nodes: [{ x, y }], veins:
// [{ a, b, pts: [[x, y]…], len, cut }] } in world px, node 0 the star. From
// it, on entering the world and whenever it changes, veinsRebuild works out
// which nodes live, the magnitude, and the light grid d.litG: for each tile
// how far it lies past the edge of the nearest living light (tiles,
// negative inside), which lightAt reads (star.js), the ground is painted
// by, and the enemies are kept out of.
// Numbers are in T.veins and T.magnitude.
// ---------------------------------------------------------------------------

function veinsState() { const s = Save.data; if (!s.veins || !Array.isArray(s.veins.nodes)) s.veins = { nodes: [], veins: [] }; return s.veins; }

// On entering the world: node 0 is the star, and the grid is built.
function veinsLoad(d) {
  const f = d.floor, V = veinsState(), sx = (f.star.x + 0.5) * TILE, sy = (f.star.y + 0.5) * TILE;
  if (!V.nodes.length) V.nodes.push({ x: sx, y: sy }); else { V.nodes[0].x = sx; V.nodes[0].y = sy; }
  d.thread = null; d.hold = null;
  veinsRebuild(d);
}

// Which nodes live: joined to the star by uncut veins.
function veinsLiving(V) {
  const live = new Uint8Array(V.nodes.length), q = [0];
  live[0] = 1;
  for (let i = 0; i < q.length; i++) for (const v of V.veins) {
    if (v.cut) continue;
    const o = v.a === q[i] ? v.b : v.b === q[i] ? v.a : -1;
    if (o >= 0 && !live[o]) { live[o] = 1; q.push(o); }
  }
  return live;
}
const veinLiving = (live, v) => !v.cut && !!live[v.a] && !!live[v.b];
// What the world's living light is worth: vein length in tiles, and a
// node's worth each (T.magnitude.nodeWorth).
function veinsWorth(V, live) {
  let w = 0;
  for (const v of V.veins) if (veinLiving(live, v)) w += v.len / TILE;
  for (let i = 1; i < live.length; i++) if (live[i]) w += T.magnitude.nodeWorth;
  return w;
}
function veinsMagnitude(worth) { const A = T.magnitude.at; let m = 1; while (m < A.length && worth >= A[m]) m++; return m; }
// Points every `step` px along a vein's line.
function veinWalk(v, step, fn) {
  const P = v.pts;
  for (let i = 1; i < P.length; i++) {
    const [ax, ay] = P[i - 1], [bx, by] = P[i], L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(L / step));
    for (let k = i === 1 ? 0 : 1; k <= n; k++) fn(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n);
  }
}
// The band a vein lights either side of it (tiles), by magnitude.
function veinBand(mag = magnitudeOf()) { const B = T.veins.band; return B[Math.min(B.length - 1, mag - 1)]; }
// How far the star's own light reaches (tiles).
function starRadius(mag = magnitudeOf()) { return T.star.lightR + T.star.lightPerMag * (mag - 1); }

// The graph read again: who lives, the magnitude, the light grid; and the
// floor's lights and painted ground follow where it's painted.
function veinsRebuild(d, box) {
  const f = d.floor, V = veinsState(), live = (d.vLive = veinsLiving(V)), G = (d.litG = new Float32Array(f.w * f.h).fill(1e9));
  const worth = veinsWorth(V, live), mag = veinsMagnitude(worth);
  Save.data.magnitude = mag; d.vWorth = worth;
  if (typeof shapesStarOffer === 'function' && Save.data.spells) shapesStarOffer(mag);
  const band = veinBand(mag), fade = T.star.lightFade;
  const stamp = (x, y, r) => {
    const cx = x / TILE - 0.5, cy = y / TILE - 0.5, R = r + fade + 1;
    for (let ty = Math.max(0, Math.floor(cy - R)); ty <= Math.min(f.h - 1, Math.ceil(cy + R)); ty++)
      for (let tx = Math.max(0, Math.floor(cx - R)); tx <= Math.min(f.w - 1, Math.ceil(cx + R)); tx++) { const dd = Math.hypot(tx - cx, ty - cy) - r, i = ty * f.w + tx; if (dd < G[i]) G[i] = dd; }
  };
  stamp(V.nodes[0].x, V.nodes[0].y, starRadius(mag));
  for (let i = 1; i < V.nodes.length; i++) if (live[i]) stamp(V.nodes[i].x, V.nodes[i].y, band);
  for (const v of V.veins) if (veinLiving(live, v)) veinWalk(v, TILE * 0.5, (x, y) => stamp(x, y, band));
  d.vSig = (d.vSig || 0) + 1;
  if (View.floorFor === f) {
    View.lights = floorLights(f).concat(veinLights(d));
    View.bakedFrom = null;
    if (box) pntInvalidate(f, box.x0 * ATILE, box.y0 * ATILE, box.x1 * ATILE, box.y1 * ATILE);
  }
}
// The box of tiles a vein's light and the ground's turning reach.
function veinBox(pts, extra) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const m = (veinBand() + T.star.lightFade + T.terraform.bloomOut + 2);
  return { x0: Math.floor(x0 / TILE) - m, y0: Math.floor(y0 / TILE) - m, x1: Math.ceil(x1 / TILE) + m + 1, y1: Math.ceil(y1 / TILE) + m + 1 };
}
// How far world px (x, y) lies past the edge of the nearest living light
// (tiles; negative inside, so -1 is a tile in).
function veinDistAt(d, x, y) {
  const f = d.floor, G = d.litG;
  if (!G) return 1e9;
  const tx = clamp(Math.round(x / TILE - 0.5), 0, f.w - 1), ty = clamp(Math.round(y / TILE - 0.5), 0, f.h - 1);
  return G[ty * f.w + tx];
}
// The same, smoothly, for tile point (gx, gy) (tiles, with fractions).
function veinDistTile(d, gx, gy) {
  const f = d.floor, G = d.litG;
  if (!G) return 1e9;
  const x = clamp(gx - 0.5, 0, f.w - 1.001), y = clamp(gy - 0.5, 0, f.h - 1.001), i = x | 0, j = y | 0, u = x - i, v = y - j, k = j * f.w + i;
  const a = G[k], b = G[k + 1 < f.w * f.h ? k + 1 : k], c = G[k + f.w < f.w * f.h ? k + f.w : k], e = G[k + f.w + 1 < f.w * f.h ? k + f.w + 1 : k];
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + e * u) * v;
}
// The living veins' light, for the floor's baked lights (render.js): a
// light at each living node, and one every couple of tiles along each
// living vein. (plain: unstopped by the rock, as there are many.)
function veinLights(d) {
  const V = veinsState(), live = d.vLive || veinsLiving(V), band = veinBand(), L = [], gold = rgb01(ART.pal.star[2]), Vn = T.veins;
  for (let i = 1; i < V.nodes.length; i++) if (live[i]) L.push({ x: V.nodes[i].x, y: V.nodes[i].y, r: TILE * band * 1.3, i: Vn.light.node, c: gold, plain: true });
  for (const v of V.veins) if (veinLiving(live, v)) veinWalk(v, TILE * Vn.light.every, (x, y) => L.push({ x, y, r: TILE * band, i: Vn.light.vein, c: gold, plain: true }));
  return L;
}
// The living node nearest a point, and its distance (px).
function veinsNearestLiving(d, x, y) {
  const V = veinsState(), live = d.vLive || veinsLiving(V);
  let best = 0, bd = Infinity;
  for (let i = 0; i < V.nodes.length; i++) { if (!live[i]) continue; const m = dist(x, y, V.nodes[i].x, V.nodes[i].y); if (m < bd) { bd = m; best = i; } }
  return { i: best, d: bd };
}
// The node (any) within r px of a point, or -1.
function veinsNodeNear(x, y, r) {
  const V = veinsState();
  let best = -1, bd = r;
  for (let i = 0; i < V.nodes.length; i++) { const m = dist(x, y, V.nodes[i].x, V.nodes[i].y); if (m < bd) { bd = m; best = i; } }
  return best;
}
function veinsJoined(V, a, b) { return V.veins.some((v) => (v.a === a && v.b === b) || (v.a === b && v.b === a)); }

// ---------------------------------------------------------------------------
// The thread
// ---------------------------------------------------------------------------
// What the act button does where the Kindler stands (game.js actionHere).
function veinsAction(d) {
  const V = veinsState(), p = d.p, Vn = T.veins;
  if (d.hold) return null;
  if (!d.thread) {
    const n = veinsNodeNear(p.x, p.y, Vn.reach * TILE);
    return n >= 0 && d.vLive[n] ? 'take up' : null;
  }
  const n = veinsNodeNear(p.x, p.y, Vn.joinReach * TILE);
  if (n >= 0) {
    if (n === d.thread.from) return null;
    const had = V.veins.find((v) => (v.a === d.thread.from && v.b === n) || (v.a === n && v.b === d.thread.from));
    if (had && !had.cut) return null;
    return d.vLive[n] ? 'join' : 'mend';
  }
  if (veinsNodeNear(p.x, p.y, Vn.nodeGap * TILE) >= 0) return null;
  return bodyHits(d.floor, p.x, p.y, T.player.radius + 2) ? null : 'plant';
}
function veinsAct(d, a) {
  if (a === 'take up') threadTake(d, veinsNodeNear(d.p.x, d.p.y, T.veins.reach * TILE));
  else if (a === 'plant') plantHere(d);
  else if (a === 'join' || a === 'mend') joinNode(d, veinsNodeNear(d.p.x, d.p.y, T.veins.joinReach * TILE));
}
// Taking up the thread at living node `from`.
function threadTake(d, from) {
  const V = veinsState(), n = V.nodes[from];
  d.thread = { from, pts: [[n.x, n.y]], len: 0, max: T.veins.thread[Math.min(T.veins.thread.length - 1, magnitudeOf() - 1)] * TILE, waveT: T.veins.wave };
  d.p.mine = null;
  spawnSparks(n.x, n.y - 8, [ART.pal.star[3], ART.pal.star[2], '#ffffff'], 16);
  UI.toast(from === 0 ? "The star's thread, in your hand" : 'The thread, from the node', 'legendary');
  Story.say('firstThread');
  snd('starFeedStart', {});
  buzz(20);
}
// Each step while the thread is in hand: it pays out behind him, and the
// dark wakes along it now and then.
function threadUpdate(d, dt) {
  const th = d.thread, p = d.p, Vn = T.veins;
  if (!th) return;
  const [lx, ly] = th.pts[th.pts.length - 1], m = dist(p.x, p.y, lx, ly);
  if (m >= Vn.step) {
    th.len += m;
    th.pts.push([p.x, p.y]);
    if (th.len > th.max) threadSnap(d, 'The thread ran out: it let go');
  }
  if ((th.waveT -= dt) <= 0) { th.waveT = Vn.wave; stirTheDark(d, Vn.waveN); }
}
// The thread lost: a fall, its length run out, a hold that failed.
function threadSnap(d, why) {
  if (!d.thread) return;
  const [x, y] = d.thread.pts[d.thread.pts.length - 1];
  d.thread = null;
  spawnSparks(x, y - 6, [ART.pal.star[2], '#ffffff'], 10);
  if (why) UI.toast(why);
  snd('channelBreak');
}
// How long the hold is where he stands: longer further from the star.
function holdTime(d, x, y) {
  const V = veinsState(), H = T.veins.hold, far = dist(x, y, V.nodes[0].x, V.nodes[0].y) / ((d.floor.w / 2) * TILE);
  return lerp(H[0], H[1], clamp(far, 0, 1)) * (magnitudeOf() >= 5 ? 0.8 : 1);
}
// PLANT: the node set in the ground, dim; the hold begins.
function plantHere(d) {
  const p = d.p, th = d.thread;
  if (!th || d.hold) return;
  th.pts.push([p.x, p.y]);
  d.hold = { x: p.x, y: p.y, t: 0, max: holdTime(d, p.x, p.y), light: T.veins.nodeLight, waveT: T.veins.holdWave, to: -1 };
  // the light draws attention
  for (const e of d.enemies) if (!e.dead && dist(e.x, e.y, p.x, p.y) < T.leave.noise) wake(d, e, true);
  UI.toast('The node is set. Hold', 'legendary');
  Story.say('firstPlant');
  snd('beaconLand');
  buzz(25);
}
// JOIN / MEND: the thread to a node that stands: a living one at once, a
// dark one after a shorter hold.
function joinNode(d, to) {
  const V = veinsState(), th = d.thread;
  if (!th || to < 0 || d.hold) return;
  const n = V.nodes[to];
  th.pts.push([n.x, n.y]);
  if (d.vLive[to]) { holdSet(d, to); return; }
  d.hold = { x: n.x, y: n.y, t: 0, max: T.veins.join, light: T.veins.nodeLight, waveT: T.veins.holdWave, to };
  for (const e of d.enemies) if (!e.dead && dist(e.x, e.y, n.x, n.y) < T.leave.noise) wake(d, e, true);
  UI.toast('Mending: hold', 'legendary');
  snd('beaconLand');
}
// Each step of a hold: the dark comes for the node, and bites it.
function holdUpdate(d, dt) {
  const h = d.hold, Vn = T.veins;
  if (!h) return;
  h.t += dt;
  if ((h.waveT -= dt) <= 0) { h.waveT = Vn.holdWave; stirTheDark(d, Vn.waveN); }
  for (const e of d.enemies) {
    if (e.dead || e.hid || !e.aggro || e.type === 'dummy') continue;
    if (dist(e.x, e.y, h.x, h.y) < e.r + Vn.biteReach) h.light -= e.dmg * Vn.bite * dt;
  }
  if (h.light <= 0) { holdLost(d); return; }
  if (h.t >= h.max) holdSet(d, h.to);
}
// The hold failed: the shard shatters, the thread snaps back.
function holdLost(d) {
  const h = d.hold;
  d.hold = null;
  spawnSparks(h.x, h.y - 6, ['#6a5a40', ART.pal.star[1], '#ffffff'], 30);
  threadSnap(d, null);
  UI.toast('The node shattered. The thread is lost', 'legendary');
  Story.say('holdLost');
  snd('lightOut');
  buzz(40);
}
// The node sets (or the join holds): the vein lights along the thread, the
// land turns, the core mends a piece.
function holdSet(d, to) {
  const V = veinsState(), th = d.thread, h = d.hold, s = Save.data;
  d.hold = null;
  if (!th) return;
  let idx = to;
  if (idx < 0) { V.nodes.push({ x: h.x, y: h.y }); idx = V.nodes.length - 1; }
  // the thread's line, thinned to a point every few px
  const pts = [th.pts[0]];
  for (const q of th.pts.slice(1)) { const l = pts[pts.length - 1]; if (dist(q[0], q[1], l[0], l[1]) >= T.veins.step) pts.push(q); }
  const last = th.pts[th.pts.length - 1];
  if (pts[pts.length - 1] !== last) pts.push(last);
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i][0], pts[i][1], pts[i - 1][0], pts[i - 1][1]);
  const joined = to >= 0 && d.vLive[to];
  // (a cut vein between the two, mended: its line laid again)
  const had = V.veins.find((v) => (v.a === th.from && v.b === idx) || (v.a === idx && v.b === th.from));
  if (had) { had.cut = false; had.pts = pts; had.len = len; } else V.veins.push({ a: th.from, b: idx, pts, len, cut: false });
  d.thread = null;
  const magWas = magnitudeOf();
  veinsRebuild(d, veinBox(pts));
  s.core = Math.min(T.star.core, (s.core || 0) + 1);
  Save.save();
  const [x, y] = last;
  spawnSparks(x, y - 8, [ART.pal.star[3], ART.pal.star[2], '#ffffff'], 40);
  for (let i = 0; i < 12; i++) d.fx.push({ kind: 'mote', x: x + (i % 3 - 1) * 6, y: y - 4, t: 1 + i * 0.05, max: 1 + i * 0.05, seed: i, to: { x, y: y - 14 } });
  UI.toast(joined ? 'Joined: two ways to it now' : to >= 0 ? 'Mended: the light runs again' : 'The node set. The vein lights', 'legendary');
  Story.say(joined ? 'firstJoin' : 'firstSet');
  snd('starFeed', { tier: 4, rate: 6, n: 12, stream: true });
  buzz(40);
  if (magnitudeOf() > magWas) { Story.starGrew(); shapesStarOffer(magnitudeOf()); }
  // the world lives: the last magnitude reached, the ending told once
  if (magnitudeOf() >= T.magnitude.at.length && !Save.data.worldLives) playWorldLives(() => UI.toast('The world lives. The light holds', 'legendary'));
  // a mend sends the Hollow at the cut off
  if (to >= 0 && !joined) d.enemies = d.enemies.filter((e) => !(e.type === 'hollow' && dist(e.x, e.y, x, y) < 14 * TILE));
}

// ---------------------------------------------------------------------------
// The dark cuts
// ---------------------------------------------------------------------------
// On coming back to the world: for every T.cuts.every hours away a living
// vein is cut, the far ones first, and the Hollow stands at each cut's dark
// end. The map shows it; Wick says it.
function veinsCutOnReturn(d) {
  const s = Save.data, V = veinsState(), C = T.cuts, away = s.lastSeen ? (Date.now() - s.lastSeen) / 3600e3 : 0;
  const n = Math.min(C.most, Math.floor(away / C.every));
  if (n <= 0 || !V.veins.length) return;
  const star = V.nodes[0], far = (v) => Math.max(dist(V.nodes[v.a].x, V.nodes[v.a].y, star.x, star.y), dist(V.nodes[v.b].x, V.nodes[v.b].y, star.x, star.y));
  const live = d.vLive, cands = V.veins.filter((v) => veinLiving(live, v)).sort((a, b) => far(b) - far(a));
  const cut = cands.slice(0, n);
  if (!cut.length) return;
  for (const v of cut) v.cut = true;
  veinsRebuild(d);
  // the Hollow at each cut's dark end (the end no longer living)
  for (const v of cut) {
    const end = d.vLive[v.a] ? V.nodes[v.b] : V.nodes[v.a];
    const h = makeEnemy('hollow', end.x, end.y - TILE, floorLevel(d), null);
    d.enemies.push(h);
  }
  Save.save();
  UI.toast(`The dark cut ${cut.length === 1 ? 'a vein' : cut.length + ' veins'} while you were away`, 'legendary');
  Story.say('firstCut');
}
// What to do next, in a line under the bar (ui.js): the state says it.
function veinsNext(d) {
  const s = Save.data, V = veinsState(), p = d.p;
  if (d.hold) return `HOLD ${Math.ceil(d.hold.max - d.hold.t)} s · NODE ${Math.max(0, Math.round((d.hold.light / T.veins.nodeLight) * 100))}%`;
  if (d.thread) { const left = Math.round(Math.max(0, d.thread.max - d.thread.len) / TILE); return veinsAction(d) === 'plant' ? `PLANT IT · ${left} LEFT` : litAt(d, p.x, p.y) ? 'WALK IT OUT' : `OUT IN THE DARK · ${left} LEFT`; }
  if (s.shapes && s.shapes.pending.length) return 'A SHAPE WAITS AT THE STAR';
  if (V.veins.some((v) => v.cut)) return 'A VEIN IS CUT · MEND IT';
  if (!restingLight(d)) return 'THE DARK';
  return V.veins.length ? 'LAY THE LIGHT FURTHER' : 'TAKE UP THE THREAD';
}
// Standing at a living node (the map): there.
function veinsTravel(d, idx) {
  const V = veinsState(), n = V.nodes[idx];
  if (!n || !d.vLive[idx] || d.hold || d.thread) return false;
  const f = d.floor;
  let x = n.x, y = n.y + TILE * 1.5;
  for (let k = 0; k < 12 && bodyHits(f, x, y, T.player.radius); k++) { x = n.x + Math.cos(k * 2.1) * TILE * 1.5; y = n.y + Math.sin(k * 2.1) * TILE * 1.5; }
  d.p.x = x; d.p.y = y; d.drone = null;
  return true;
}

// ---------------------------------------------------------------------------
// Drawn
// ---------------------------------------------------------------------------
// A node: a cluster of the star's crystals (hubart.js), enlarged by whole
// pixels; dim when dark.
const _nodeSpr = new Map();
function nodeSprite(lit) {
  const key = lit ? 'lit' : 'dark';
  if (_nodeSpr.has(key)) return _nodeSpr.get(key);
  const spr = hartStarstone(5, lit ? 0 : 1, 0), k = 2;
  const up = (c) => { const n = document.createElement('canvas'); n.width = c.width * k; n.height = c.height * k; const g = n.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(c, 0, 0, n.width, n.height); return n; };
  // (a dark node's glow layer is kept but empty: drawArtSprite always draws one)
  const blank = () => { const n = document.createElement('canvas'); n.width = spr.c.width * k; n.height = spr.c.height * k; return n; };
  const out = Object.assign({}, spr, { c: up(spr.c), ec: lit && spr.ec ? up(spr.ec) : blank(), ax: spr.ax * k, ay: spr.ay * k, w: spr.w * k, h: spr.h * k });
  _nodeSpr.set(key, out);
  return out;
}
// The nodes among the walkers, by their ground point.
function veinProps(d) {
  const V = veinsState(), live = d.vLive, out = [];
  for (let i = 1; i < V.nodes.length; i++) { const n = V.nodes[i]; out.push({ x: n.x, y: n.y, node: i, lit: !!live[i], draw: drawNode }); }
  if (d.hold && d.hold.to < 0) out.push({ x: d.hold.x, y: d.hold.y, node: -1, hold: true, draw: drawNode });
  return out;
}
function drawNode(d, a, ox, oy, lights) {
  const fx = Math.round(a.x * AP) + ox, fy = Math.round(a.y * AP) + oy;
  if (fx < -60 * AF || fx > View.w + 60 * AF || fy < -80 * AF || fy > View.h + 40 * AF) return;
  const h = a.hold ? d.hold : null, k = h ? clamp(h.t / h.max, 0, 1) : 1;
  const spr = nodeSprite(a.lit || !!h);
  drawShadow(fx, fy, 6);
  View.ctx.globalAlpha = View.emCtx.globalAlpha = a.lit ? 1 : h ? 0.5 + 0.5 * k : 0.55;
  drawArtSprite(spr, fx - spr.ax, fy - spr.ay);
  View.ctx.globalAlpha = View.emCtx.globalAlpha = 1;
  if (a.lit) lights.push({ x: fx, y: fy - ap(8), r: TILE * 2.5, i: 0.5 + 0.1 * Math.sin(Game.realT * 2 + a.node), c: rgb01(ART.pal.star[2]) });
  if (h) {
    // the hold: its ring filling, and the node's own light left in it
    const col = ART.pal.star[3], n = Math.round(28 * AP), lk = clamp(h.light / T.veins.nodeLight, 0, 1);
    for (let i = 0; i < n * k; i++) { const ang = -Math.PI / 2 + (i / n) * Math.PI * 2; dot(Math.round(fx + Math.cos(ang) * 14 * AP), Math.round(fy + Math.sin(ang) * 9 * AP), col, true); }
    lights.push({ x: fx, y: fy - ap(6), r: TILE * (1.5 + k * 2) * (0.4 + 0.6 * lk), i: (0.5 + k) * lk, c: rgb01(col) });
  }
}
// Under everyone: the set veins' lines on the ground, and the thread in hand.
function drawVeinsUnder(d, ox, oy, lights) {
  const V = veinsState(), live = d.vLive, G = ART.pal.star, t = Game.realT;
  const vx0 = -ox - 40, vx1 = -ox + View.w + 40, vy0 = -oy - 40, vy1 = -oy + View.h + 40;
  const line = (pts, lit, alpha, moving) => {
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i], x0 = ax * AP + ox, y0 = ay * AP + oy, x1 = bx * AP + ox, y1 = by * AP + oy;
      if (Math.max(x0, x1) < vx0 || Math.min(x0, x1) > vx1 || Math.max(y0, y1) < vy0 || Math.min(y0, y1) > vy1) continue;
      const L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.round(L / AF)), nx = -(y1 - y0) / L, ny = (x1 - x0) / L;
      for (let k = 0; k < n; k++) {
        const u = k / n, gap = artHash(Math.floor((i * 97 + k - (moving ? t * 14 : 0)) / 4), i, 0x10de);
        if (gap < (lit ? 0.18 : 0.5)) continue;
        const side = Math.sin((i * 7 + k) * 0.25) * 1.5 * AF, px = x0 + (x1 - x0) * u + nx * side, py = y0 + (y1 - y0) * u + ny * side;
        const col = lit ? (gap > 0.82 ? G[5] : gap > 0.5 ? G[4] : G[3]) : G[1];
        dot(Math.round(px), Math.round(py), col, lit, alpha);
        // (two px wide, so it reads from the camera's height)
        if (lit) dot(Math.round(px + nx), Math.round(py + ny), gap > 0.5 ? G[3] : G[2], true, alpha * 0.8);
      }
    }
  };
  for (const v of V.veins) line(v.pts, veinLiving(live, v), v.cut ? 0.35 : 0.85, false);
  const th = d.thread;
  if (th) {
    const pts = th.pts.concat([[d.p.x, d.p.y]]);
    line(pts, true, 0.95, true);
    const [lx, ly] = pts[pts.length - 2];
    lights.push({ x: Math.round(d.p.x * AP) + ox, y: Math.round(d.p.y * AP) + oy, r: TILE * 1.4, i: 0.5, c: rgb01(G[2]) });
    lights.push({ x: Math.round(lx * AP) + ox, y: Math.round(ly * AP) + oy, r: TILE, i: 0.3, c: rgb01(G[2]) });
  }
}
