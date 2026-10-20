'use strict';
// ---------------------------------------------------------------------------
// What lies below the floor, seen from the rising rock's camera (paint.js,
// docs/PAINTED.md "Holes"). The camera looks steeply down from the south,
// so a point d px below the floor is drawn d px further down the screen
// than the floor point over it: in a hole, each column shows its far
// (north) inner wall from the rim down, then whatever is at the bottom; its
// near (south) wall is hidden under the near rim; its east and west walls,
// where the rim curves, show as narrow faces turned towards or away from
// the light. So:
//   a pool, lava or ice: its surface lies T.paint.hole[kind] px down, under
//     a bank face on its far side (hazards.js, paintHazardPixels);
//   a vent: its throat's far wall, fire at the bottom (paintVent).
// The near rim catches the light; the far rim is a face's lit lip. All is
// laid in strokes on the clime's rock ramp, seeded by place, so a region
// painted again matches. Only the picture changes: the footprint of each
// (collision, hazardAt) is as it was.
// ---------------------------------------------------------------------------

// How far down a hazard's surface lies (art px; 0 for none).
const phlDepth = (kind) => (T.paint.hole.depth[kind] || 0);

// A hole's walls' ramp: the rock's (pntLook), but not held under the
// floor's tones as a rock's top is (pntRockUnder): a wall below the floor
// is in its own shade already. Lifted for a dark place as the rock is.
const _phlRamps = new WeakMap();
function phlRamp(b, lift = View.pntLift || 0) {
  let M = _phlRamps.get(b);
  if (!M) _phlRamps.set(b, (M = new Map()));
  const key = Math.round(lift * 20);
  let r = M.get(key);
  if (r) return r;
  const R = T.paint.rampEven, rk = rampRgb(b.rock), fr = rampRgb(b.front);
  const rock = rk.slice(0, 3).concat(fr.slice(0, 3)).sort((p, q) => pntLum(p) - pntLum(q));
  r = Uint32Array.from(pntLiftRamp(pntRampEven(rock, 10, R.rock, rk[3]), key / 20, R.liftRock).map(pntU32));
  M.set(key, r);
  return r;
}

// The row of the rim over x, y in a hole whose footprint is in(x, y): the
// first footprint row going up the column (as far as lim). Off the
// footprint, the wall there turns south: a row or two below.
function phlRimRow(inside, x, y, lim) {
  if (!inside(x, y)) return y + 2;
  for (let j = 1; j <= lim; j++) if (!inside(x, y - j)) return y - j + 1;
  return y - lim;
}
// Which way a far wall faces at column x (its rim from x - 2 to x + 2):
// 1 turned west (towards the light from the upper left), -1 east.
function phlFacing(inside, x, y, lim) {
  const s = (phlRimRow(inside, x + 2, y, lim) - phlRimRow(inside, x - 2, y, lim)) / 4;
  return s < -1 ? -1 : s > 1 ? 1 : s;
}

// The strokes along row y, x0..x0+n (pntStrokeRow), kept for the row.
const _phlMid = new Int16Array(96), _phlJit = new Float32Array(96);
let _phlRow = NaN;
function phlStrokes(x0, y, seed) {
  const key = y * 7919 + x0 * 3 + seed;
  if (key !== _phlRow) { _phlRow = key; pntStrokeRow(_phlMid, _phlJit, x0, ATILE + 16, y, seed); }
}

// A far wall's tone (on the rock ramp) at q rows down a face n rows tall
// (0 its lip), facing s, at x on row y (the strokes worked out from x0),
// on a ramp by B ([its tone at the lip, at the foot, how much lighter
// turned to the light]):
// lighter at the lip, darker down it, lighter turned to the light, laid in
// strokes; strata (long strokes a shade or two off, as on the rock's
// faces) and now and then a crack down it, lit on its left.
function phlWallTone(q, n, s, x, x0, y, seed, B) {
  const H = T.paint.hole, u = n > 1 ? Math.min(1, q / (n - 1)) : 0;
  let t = B[0] + (B[1] - B[0]) * Math.pow(u, H.wallPow) + s * B[2] + _phlJit[x - x0] * H.jitter;
  const off = (artHash(y, 3, seed + 301) * 16) | 0, sc = (x + off) >> 4;
  if (artHash(sc, y, seed + 303) < H.strata) {
    const sx = sc * 16 - off + ((artHash(sc, y, seed + 305) * 8) | 0), sl = 4 + ((artHash(sc, y, seed + 306) * 12) | 0);
    if (x >= sx && x < sx + sl) t += artHash(sc, y, seed + 304) < 0.6 ? -H.strataAmt : H.strataAmt * 0.6;
  }
  // the wall breaks into upright planes (H.plane: px across, how much
  // their tones differ), their borders wobbling down it, a crack along a
  // border now and then (in lengths down from the lip), lit on its left
  const P = H.plane, wx = x + (pntNoise(x, y, 7, 11, seed + 309) - 0.5) * P[0] * 0.8, id = Math.floor(wx / P[0]);
  t += (artHash(id, 0, seed + 310) - 0.5) * 2 * P[1];
  if (q > 1) {
    const L = H.crack[1], band = ((q + artHash(id, 9, seed + 307) * L) / L) | 0, e = wx - id * P[0];
    if (artHash(id, band, seed + 308) < H.crack[0]) { if (e < 1) t = Math.min(t, 0.4); else if (e < 2) t += 1; }
  }
  return t;
}
const phlClampT = (t, n) => { t = Math.round(t); return t < 0 ? 0 : t > n - 1 ? n - 1 : t; };
// One pixel of the floor buffer, as a whole pixel (glow: also on the glow
// layer).
function phlPut(P, x, y, c, glow) {
  const k = y * P.w + x, C = P.col32 || (P.col32 = new Uint32Array(P.col.buffer)), E = P.em32 || (P.em32 = new Uint32Array(P.em.buffer));
  C[k] = c; E[k] = glow ? c : 0;
}
// The near rim, where the ground turns down into a hole whose inner wall
// faces the light: its ground a few tones lighter, in its strokes.
function phlNearLip(P, x, y, b, step) {
  const GR = pntLook(b).ground, t = View.groundTone[y * P.w + x] + step;
  phlPut(P, x, y, GR[t > 6 ? 6 : t]);
}

// ---- in the water --------------------------------------------------------------
// A walker in a pool or lava stands down on its surface, its feet under it;
// on ice, down on the ice. Drawn D px lower (eased in as it steps off the
// bank), cut cleanly at the surface (and by the near rim, which hides what
// is down in the hole south of it), a ring of the surface's light round it
// at the waterline, its back half behind it. Only the picture: its body
// and feet are where they were. phlWadeStart before drawing an actor (true
// if it set the clip), phlWadeEnd after.
function phlWadeOf(d, a) {
  const f = d.floor;
  if (!f.haz || d.hub || a.piece || a.strip || a.crit || a.hubDraw || a.settler || a.tear || a.portal || a.wprop) return 0;
  if (a !== d.p && (a.type === undefined || !hazardWalker(a))) return 0;
  const k = hazardAt(f, a.x, a.y), want = k ? phlDepth(f.hazKind) : 0;
  a._wade = a._wade === undefined ? want : a._wade + (want - a._wade) * T.paint.hole.wadeEase;
  if (Math.abs(a._wade - want) < 0.3) a._wade = want;
  return a._wade;
}
let _phlWading = null;
function phlWadeStart(d, a, ox, oy) {
  const s = phlWadeOf(d, a);
  if (!(s >= 0.5)) return false;
  const f = d.floor, H = T.paint.hole, D = phlDepth(f.hazKind), dy = Math.round(s), fx = Math.round(a.x * AP), fy0 = Math.round(a.y * AP);
  const ice = f.hazKind === 'slick', cut = ice ? 0 : Math.round(H.wade * s / D);
  // the near rim south of the feet (art px of the floor), as far as it hides
  let rim = fy0 + D + 1;
  for (let y = fy0; y <= fy0 + D; y++) if (!hazardAt(f, (fx + 0.5) / AP, (y + 0.5) / AP)) { rim = y; break; }
  const wl = fy0 + dy - cut, clipY = Math.min(wl, rim) + oy;
  const w = { x: fx + ox, y: wl + oy, r: Math.max(5, (a.r || T.player.radius) * AP * 1.15), kind: f.hazKind, b: artBiome(f), show: !ice && wl < rim, moving: Math.abs(a.vx || 0) + Math.abs(a.vy || 0) > 5 || (a === d.p && (d.p.walkT || 0) > 0) };
  if (w.show) phlWadeRing(w, -1);
  for (const c of [View.ctx, View.emCtx]) {
    c.save();
    if (cut || rim < fy0 + dy) { c.beginPath(); c.rect(-1e4, -1e4, 2e4, clipY + 1e4); c.clip(); }
    c.translate(0, dy);
  }
  _phlWading = w;
  return true;
}
// The ring at the waterline round a wader: its back half (side -1) or its
// front (1), pulsing out a little while it moves.
function phlWadeRing(w, side) {
  const r = w.b.haz || HAZ_RAMPS[w.kind], lava = w.kind === 'burn', t = Game.realT;
  const grow = w.moving ? ((t * 2.2) % 1) : 0, rx = w.r * (1 + grow * 0.6), ry = Math.max(2, rx * 0.34), n = Math.round(rx * 3.2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, sy = Math.sin(a);
    if ((sy > 0 ? 1 : -1) !== side) continue;
    const x = Math.round(w.x + Math.cos(a) * rx), y = Math.round(w.y + sy * ry);
    // (broken here and there, as strokes)
    if (artHash(i >> 1, 3, 77) < 0.18) continue;
    const k = (side > 0 ? 0.85 : 0.5) * (1 - grow * 0.7);
    dot(x, y, side > 0 ? r[3] : r[2], lava, k);
  }
}
function phlWadeEnd() {
  View.ctx.restore(); View.emCtx.restore();
  const w = _phlWading;
  _phlWading = null;
  if (w && w.show) phlWadeRing(w, 1);
}
