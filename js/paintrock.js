'use strict';
// ---------------------------------------------------------------------------
// The painted rock's company (docs/PAINTED.md): what grows on its faces,
// what tints it, what it hides of the ground, and where hanging plants hang
// from. paint.js paints the rock; this lays the rest over it or against it.
// ---------------------------------------------------------------------------

// ---- growth on the rock ------------------------------------------------------
// The wall growth the undergrowth painted on the old low lip (moss climbing a
// face over a bed at its foot; roots, vines or icicles hanging from a lip;
// under the sky a fringe of dry grass over a mesa's lip), and Rootdeep's
// rock woven of roots, painted onto the rock layer over x0..x1, y0..y1, so
// it shows on the faces and lips that now stand over the ground. A face is
// found from the footprint and the heights, not the drawn layer, so a region
// painted again matches its neighbours: for each column, every south edge of
// the footprint (ye, the ground under it at ye + 1) stands a face from ye up
// to its lip, the highest any surface point within the edge's zone is drawn;
// a pixel of the layer belongs to it if it shows one of those points.
const _pnrFace = { a: new Uint8Array(0) };
function pnrRockGrowth(f, x0, y0, x1, y1) {
  const U = View.ug, b = artBiome(f), roots = b.rockDecor === 'roots';
  if (!U || U.f !== f) return;
  const F = T.flora, Q = U.Q, S = F.sets[U.set] || F.sets.rim, strands = Q.strand && S.strands > 0 && !U.sky, lipG = U.sky && Q.lip;
  if (!Q.moss && !strands && !lipG && !roots) return;
  const W = f.w * ATILE, Hp = f.h * ATILE, R = View.rockPx, H = View.rockH, LF = View.rockLift, C32 = View.rockBuf.col32, E = View.rockBuf.em;
  const seedH = (f.seed ^ f.depth) | 0, zone = T.paint.wall.ramp, maxH = pntMaxLift(), rw = x1 - x0, rh = y1 - y0;
  // (the growth's own colours lifted with the rock's mid tones, so they keep
  // their place against it in a dark place)
  const lift = View.pntLift || 0, L = T.paint.rampEven.liftRock, mul = 1 + lift * L[0] * Math.pow(0.5, L[1]);
  const lit = (c) => (mul === 1 ? c : pnrScale(c, mul));
  // which pixels of the area are a face's, for the roots
  if (roots && _pnrFace.a.length < rw * rh) _pnrFace.a = new Uint8Array(rw * rh);
  const FM = _pnrFace.a;
  if (roots) FM.fill(0, 0, rw * rh);
  const put = (x, y, c) => { const k = y * W + x; C32[k] = c; E[k * 4 + 3] = 0; };
  for (let x = x0; x < x1; x++) {
    for (let ye = Math.min(Hp - 2, y1 + maxH + zone); ye >= Math.max(0, y0 - 1); ye--) {
      const ke = ye * W + x;
      if (!R[ke] || R[ke + W] || (View.pitPx && View.pitPx[ke])) continue;
      // the face: its lip, the highest its zone's points are drawn
      let lip = ye - H[ke], top = ye;
      for (let y = ye - 1; y >= Math.max(0, ye - zone) && R[y * W + x]; y--) { top = y; if (y - H[y * W + x] < lip) lip = y - H[y * W + x]; }
      const foot = ye, yf = ye + 1, len = foot - lip + 1;
      if (lip >= y1 || foot < y0) { ye = top; continue; }
      // what grows on it (as the undergrowth worked it out for the old lip,
      // stretched to this face's height)
      // (in ragged clumps two px wide, here and there, not a line)
      const lipN = lipG && artNoise(x / AP, yf / AP, 5, seedH + 79) > 0 ? Math.floor(artHash(x >> 1, yf, seedH + 77) * (F.lip + 2)) : 0;
      const bv = Q.moss ? ugBedAt(U, x, yf) : 0;
      const hm = bv > 0.05 ? Math.round(len * F.faceMoss * Math.min(1, bv * 2.5) * (0.6 + 0.4 * artNoise(x / AP, yf / AP, 3, seedH + 81))) : 0;
      const Ls = strands ? (ugStrandLen(x, yf, seedH, S.strands) * len) / FACE_H : 0;
      for (let y = Math.max(lip, y0); y <= Math.min(foot, y1 - 1); y++) {
        const k = y * W + x, l = LF[k];
        if (!l) continue;
        const sy = y + l - 1;
        if (sy > ye || sy < top) continue;
        if (roots) FM[(y - y0) * rw + x - x0] = 1;
        const fromLip = y - lip, below = foot - y + 1, fl = Math.floor((fromLip * FACE_H) / len);
        let c = 0;
        if (fromLip < lipN) c = Q.lip[Math.min(2, fromLip + 1 + (artHash(x, yf, seedH + 78) < 0.4 ? 1 : 0))];
        else if (below <= hm) c = lit(Q.moss[below < hm && artHash(x >> 1, y >> 1, seedH + 83) < 0.6 ? 0 : 1]);
        if (Ls && fromLip < Ls) {
          const Lr = Math.round(Ls);
          if (Q.icicle) { if (fromLip < Lr - 2 || (fromLip === Lr - 2 && !(x & 1))) c = Q.strand[fromLip === 0 || (x + fl) % 3 ? 0 : 1]; }
          else c = lit(Q.strand[(fl + (x & 1)) % 3 === 2 ? 1 : 0]);
        }
        if (c) put(x, y, c);
      }
      ye = top;
    }
  }
  if (!roots) return;
  // Rootdeep: strands wandering over the rock's top (following its
  // surface) and down its faces, lighter than the rock's darks and darker
  // than its lit edges, so walls still read as walls
  const rt = [lit(pntU32(rgbOf('#2a2016'))), lit(pntU32(rgbOf('#1c140e'))), lit(pntU32(rgbOf('#1a120c'))), lit(pntU32(rgbOf('#5a4430')))];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const k = y * W + x, l = LF[k];
    if (!l || !R[(y + l - 1) * W + x]) continue;
    if (FM[(y - y0) * rw + x - x0]) { if (Math.abs(wallNoise((x / AP) * 1.8, (y / AP) * 0.3, 6)) < 0.09) put(x, y, rt[3]); continue; }
    const wx = x / AP, wy = (y + l - 1) / AP, a = Math.abs(wallNoise(wx * 0.7, wy * 1.4, 9));
    if (a < 0.07) put(x, y, rt[a < 0.035 ? 0 : 1]);
    else if (Math.abs(wallNoise(wx * 1.4 + 70, wy * 0.6, 8)) < 0.05) put(x, y, rt[2]);
  }
}
// A 32-bit pixel's colour times k (at most white, its hue kept).
function pnrScale(c, k) {
  const r = c & 255, g = (c >>> 8) & 255, b = (c >>> 16) & 255, m = Math.min(k, 255 / Math.max(r, g, b, 1));
  return (0xff000000 | (Math.round(b * m) << 16) | (Math.round(g * m) << 8) | Math.round(r * m)) >>> 0;
}

// ---- a tear's tint on the rock ---------------------------------------------
// The wash round an open tear (rifts.js, tintRift), on the rock layer too,
// by where each rock pixel stands on the floor: three hard steps of the
// rift's colour, as on the ground.
function pnrTintRock(f, x0, y0, x1, y1) {
  if (!f.riftShift || !f.riftShift.length) return;
  const S = RIFT_SHIFT, W = f.w * ATILE, Hp = f.h * ATILE, LF = View.rockLift, Q = View.rockBuf, c = Q.col, to = rgbOf(S.floorToward), reach = T.rifts.tintR * ATILE;
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W, x1); y1 = Math.min(Hp, y1);
  for (const s of f.riftShift) {
    const sx = (s.x + 0.5) * ATILE, sy = (s.y + 0.5) * ATILE;
    if (sx + reach < x0 || sx - reach > x1 || sy + reach < y0 - pntMaxLift() || sy - reach > y1 + pntMaxLift()) continue;
    for (let y = y0; y < y1; y++) for (let x = Math.max(x0, Math.floor(sx - reach)); x < Math.min(x1, Math.ceil(sx + reach)); x++) {
      const l = LF[y * W + x];
      if (!l) continue;
      const t = 1 - Math.hypot(x - sx, y + l - 1 - sy) / reach;
      if (t <= 0) continue;
      const a = (Math.min(3, Math.floor(Math.min(1, t * 1.4) * 3 + 0.5)) / 3) * S.amount, k = (y * W + x) * 4;
      c[k] += (to[0] - c[k]) * a; c[k + 1] += (to[1] - c[k + 1]) * a; c[k + 2] += (to[2] - c[k + 2]) * a;
    }
  }
}

// ---- the ground's effects behind the rock ----------------------------------
// What's drawn flat on the ground each frame (a hazard's bubbles and
// glints, ripples, foes' marks, a waystone's rings, cast marks and glyphs)
// is drawn before the actors with no feet of its own to sort by, so the rock
// standing in front of it is drawn back over all of it at once: every rock
// pixel in view, in both layers (the floor's own glow on the rock put back
// under what's left). Things that stand up off the ground (a vent's fire, a
// spore pod, an afterimage) are drawn after this, each hidden by its feet
// (paintOcclude).
function pnrOccludeGround(ox, oy) {
  const c = View.rockCol;
  if (!c || !View.rockLift || T.paint.occlude === false) return;
  const sx = Math.max(0, -ox), sy = Math.max(0, -oy), w = Math.min(View.w, c.width - sx), h = Math.min(View.h, c.height - sy);
  if (w <= 0 || h <= 0) return;
  const dx = sx + ox, dy = sy + oy;
  View.ctx.drawImage(c, sx, sy, w, h, dx, dy, w, h);
  const ex = View.emCtx;
  ex.globalCompositeOperation = 'destination-out';
  ex.drawImage(c, sx, sy, w, h, dx, dy, w, h);
  ex.globalCompositeOperation = 'destination-over';
  ex.drawImage(View.floorEm, sx, sy, w, h, dx, dy, w, h);
  ex.globalCompositeOperation = 'source-over';
}

// ---- hanging plants ----------------------------------------------------------
// How far above floor row y (art px) the lip of the face over column x is
// drawn: a hanging plant whose anchor is the wall line hangs from there,
// not from the face's foot. 0 where there's no rock just north.
function pnrLipAbove(x, y) {
  const P = View.floorBuf, R = View.rockPx, H = View.rockH;
  x = Math.round(x); y = Math.round(y);
  if (!P || !R || !H || x < 0 || x >= P.w) return 0;
  const W = P.w, zone = T.paint.wall.ramp;
  // the footprint's south edge, at or just above the anchor
  let ye = -1;
  for (let k = 0; k <= ap(4); k++) { const yy = y - k; if (yy >= 0 && yy < P.h && R[yy * W + x]) { ye = yy; break; } }
  if (ye < 0) return 0;
  pntLiftAt(x, ye);
  let lip = ye - H[ye * W + x];
  for (let yy = ye - 1; yy >= Math.max(0, ye - zone) && R[yy * W + x]; yy--) lip = Math.min(lip, yy - H[yy * W + x]);
  return Math.max(0, y - lip - 1);
}

// After the ground over x0..x1, y0..y1 has been painted again (a tear
// sealed): the rock standing there painted again over it, and laid in.
function pnrRepaintArea(f, x0, y0, x1, y1) {
  if (View.floorFor !== f) return;
  const m = pntMaxLift();
  paintRockArea(f, x0, y0 - m, x1, y1);
  pntComposite(f, x0, y0 - m, x1, y1);
  View.occCache = new Map();
}
