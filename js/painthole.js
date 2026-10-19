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
//   the sinkhole: its far wall drops away into the dark (phlPaintPit);
//   a vent: its throat's far wall, fire at the bottom (paintVent).
// The near rim catches the light; the far rim is a face's lit lip. All is
// laid in strokes on the clime's rock ramp, seeded by place, so a region
// painted again matches. Only the picture changes: the footprint of each
// (collision, hazardAt, the pit's tiles) is as it was.
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
function phlWallTone(q, n, s, x, x0, y, seed, B = T.paint.hole.wall) {
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

// ---- the sinkhole ------------------------------------------------------------
// The outpost's pit (View.pitPx), over tile tx, ty: each column's far wall
// from its rim down, darker and darker into soot, then the dark (in faint
// strokes); the near rim lit. Under rock, the wall carries on the rock's
// face downwards, with no lip. Pixels of the tile not in the pit are left.
function phlPaintPit(P, f, tx, ty, ox, oy, b) {
  const pit = View.pitPx, W = P.w, Hp = P.h;
  if (!pit) return;
  let any = false;
  for (let y = Math.max(0, oy - 1); y < oy + ATILE && !any; y++) for (let x = ox; x < ox + ATILE; x++) if (pit[y * W + x]) { any = true; break; }
  if (!any) return;
  const H = T.paint.hole, D = H.pit, R = View.rockPx, RK = phlRamp(b), nt = RK.length, seed = (f.seed ^ f.depth) | 0, x0 = ox - 8;
  // (the pit's own pixels on the hole's side of the smooth wall line)
  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < Hp && pit[y * W + x] === 1 && R[y * W + x] === 1;
  const abyss = [pntU32([2, 2, 4]), pntU32([5, 5, 9]), pntU32([9, 8, 15])];
  // (at home, the star hanging over it: where, and its gold, dimmed)
  const lit = f.hub && typeof STAR_AT !== 'undefined' ? [STAR_AT.x * ATILE, STAR_AT.y * ATILE, [0.55, 0.85].map((k) => pntU32(pntMixRgb(rgbOf(ART.pal.star[1]), [0, 0, 0], 1 - k)))] : null;
  for (let y = oy; y < oy + ATILE; y++) {
    phlStrokes(x0, y, seed + 311);
    for (let x = ox; x < ox + ATILE; x++) {
      const k = y * W + x;
      if (!inside(x, y)) {
        // the near rim
        if (!R[k] && inside(x, y - 1)) phlNearLip(P, x, y, b, H.lip);
        continue;
      }
      const rim = phlRimRow(inside, x, y, D + 1), q = y - rim;
      if (q >= D) {
        // the dark: a few faint strokes
        const m = _phlMid[x - x0] + x0;
        phlPut(P, x, y, abyss[artHash(m, y, seed + 317) < 0.15 ? 2 : artHash(m, y >> 1, seed + 318) < 0.5 ? 1 : 0]);
        continue;
      }
      const under = rim > 0 && R[(rim - 1) * W + x] === 1 && !pit[(rim - 1) * W + x];
      let t = phlWallTone(q, D, phlFacing(inside, x, y, D + 1), x, x0, y, seed) - H.pitFade * Math.pow(q / D, 2);
      // the lip, lit where it's ground (a rock's face carries on unbroken)
      if (q === 0 && !under) t = Math.max(t, H.lipTone[0]);
      else if (q === 0) t -= 1;
      // soot, more of it lower down
      if (t < 0.6 || artHash(_phlMid[x - x0] + x0, y, seed + 319) < Math.pow(q / D, 1.5) * 0.8) { phlPut(P, x, y, abyss[q / D < 0.7 ? 2 : 1]); continue; }
      // the star's light on the far wall, as loose strokes of its gold,
      // thicker nearer it and fading down into the dark
      if (lit) {
        const m = _phlMid[x - x0] + x0, dd = Math.hypot(m - lit[0], (y - lit[1]) * 1.4) / H.starLick[0];
        if (dd < 1 && artHash(m, y, seed + 321) < (1 - dd) * (1 - dd) * H.starLick[1] * (1 - q / D)) { phlPut(P, x, y, lit[2][t > 4 ? 1 : 0]); continue; }
      }
      phlPut(P, x, y, RK[phlClampT(t, nt)]);
    }
  }
}

// ---- in the water --------------------------------------------------------------
// A walker in a pool or lava stands down on its surface, its feet under it;
// on ice, down on the ice. Drawn D px lower (eased in as it steps off the
// bank), clipped wade px above its feet, a broken line of the surface's
// light across its legs. Only the picture: its body and feet are where
// they were. phlWadeStart before drawing an actor (true if it set the
// clip), phlWadeEnd after.
function phlWadeOf(d, a) {
  const f = d.floor;
  if (!f.haz || d.hub || a.piece || a.strip || a.crit || a.hubDraw || a.settler || a.tear || a.portal || a.wprop) return 0;
  if (a !== d.p && (a.type === undefined || !hazardWalker(a))) return 0;
  const k = hazardAt(f, a.x, a.y), want = k ? phlDepth(f.hazKind) : 0;
  a._wade = a._wade === undefined ? want : a._wade + (want - a._wade) * T.paint.hole.wadeEase;
  if (Math.abs(a._wade - want) < 0.3) a._wade = want;
  return a._wade;
}
function phlWadeStart(d, a, ox, oy) {
  const s = phlWadeOf(d, a);
  if (!(s >= 0.5)) return false;
  const f = d.floor, H = T.paint.hole, dy = Math.round(s), fy = Math.round(a.y * AP) + oy + dy, cut = f.hazKind === 'slick' ? 0 : Math.round(H.wade * s / phlDepth(f.hazKind));
  for (const c of [View.ctx, View.emCtx]) {
    c.save();
    if (cut) { c.beginPath(); c.rect(-1e4, -1e4, 2e4, fy - cut + 1e4); c.clip(); }
    c.translate(0, dy);
  }
  _phlWading = cut ? { x: Math.round(a.x * AP) + ox, y: fy - cut, r: (a.r || T.player.radius) * AP, kind: f.hazKind, b: artBiome(f) } : null;
  return true;
}
let _phlWading = null;
function phlWadeEnd() {
  View.ctx.restore(); View.emCtx.restore();
  const w = _phlWading;
  if (!w) return;
  _phlWading = null;
  // the surface's line across the legs, broken, sliding a little
  const r = w.b.haz || HAZ_RAMPS[w.kind], lava = w.kind === 'burn', n = Math.round(w.r * 1.1), sh = Math.floor(Game.realT * 6);
  for (let i = -n; i <= n; i++) if ((i + sh) % 4 !== 0) dot(w.x + i, w.y, r[lava ? 2 : 3], lava, Math.abs(i) > n - 2 ? 0.45 : 0.8);
}
