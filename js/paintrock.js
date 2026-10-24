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
  const WX = PWIN.x, WY = PWIN.y, W = PWIN.w, X1 = WX + W, Y1 = WY + PWIN.h, OFF = -WY * W - WX, R = View.rockPx, H = View.rockH, LF = View.rockLift, C32 = View.rockBuf.col32, E = View.rockBuf.em;
  const seedH = (f.seed ^ f.depth) | 0, zone = T.paint.wall.ramp, maxH = pntMaxLift(), rw = x1 - x0, rh = y1 - y0;
  // (the growth's own colours lifted with the rock's mid tones, so they keep
  // their place against it in a dark place)
  const lift = View.pntLift || 0, L = T.paint.rampEven.liftRock, mul = 1 + lift * L[0] * Math.pow(0.5, L[1]);
  const lit = (c) => (mul === 1 ? c : pnrScale(c, mul));
  // which pixels of the area are a face's, for the roots
  if (roots && _pnrFace.a.length < rw * rh) _pnrFace.a = new Uint8Array(rw * rh);
  const FM = _pnrFace.a;
  if (roots) FM.fill(0, 0, rw * rh);
  const put = (x, y, c) => { const k = y * W + x + OFF; C32[k] = c; E[k * 4 + 3] = 0; };
  for (let x = x0; x < x1; x++) {
    for (let ye = Math.min(Y1 - 2, y1 + maxH + zone); ye >= Math.max(WY, y0 - 1); ye--) {
      const ke = ye * W + x + OFF;
      if (!R[ke] || R[ke + W]) continue;
      // the face: its lip, the highest its zone's points are drawn
      let lip = ye - H[ke], top = ye;
      for (let y = ye - 1; y >= Math.max(WY, ye - zone) && R[y * W + x + OFF]; y--) { top = y; if (y - H[y * W + x + OFF] < lip) lip = y - H[y * W + x + OFF]; }
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
        const k = y * W + x + OFF, l = LF[k];
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
    const k = y * W + x + OFF, l = LF[k];
    if (!l || !R[(y + l - 1) * W + x + OFF]) continue;
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
// is drawn before the actors, with no feet to sort by. So after it, the rock
// standing over each tile where such a thing may have been drawn is laid
// back over it: all of that tile's rock pixels (they all stand in front of
// the ground they cover), in both layers, the rock's own glow put back.
// The tiles are found from the same state the effects are drawn from;
// a tile's rock is kept as a picture until the rock there is painted again.
// Things that stand up off the ground (a vent's fire, a spore pod, an
// afterimage) are drawn after this, each hidden by its feet (paintOcclude).
function pnrOccludeGround(ox, oy) {
  // (not at home, where nothing is drawn flat on the ground)
  const d = Game.dive, f = d && d.floor;
  if (Gpu.on || !f || d.hub || View.floorFor !== f || !View.rockLift || T.paint.occlude === false) return;
  const tw = f.w, th = f.h, vx0 = Math.floor(-ox / ATILE) - 1, vy0 = Math.floor(-oy / ATILE) - 1, vx1 = Math.floor((View.w - ox) / ATILE) + 1, vy1 = Math.floor((View.h - oy) / ATILE) + 1;
  const M = View.pnrMarks && View.pnrMarks.length === tw * th ? View.pnrMarks : (View.pnrMarks = new Uint8Array(tw * th)), list = [];
  // a box in world px: its tiles marked
  const mark = (x0, y0, x1, y1) => {
    const i0 = Math.max(vx0, 0, Math.floor(x0 / TILE)), i1 = Math.min(vx1, tw - 1, Math.floor(x1 / TILE)), j0 = Math.max(vy0, 0, Math.floor(y0 / TILE)), j1 = Math.min(vy1, th - 1, Math.floor(y1 / TILE));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = j * tw + i; if (!M[k]) { M[k] = 1; list.push(k); } }
  };
  const round = (x, y, r) => mark(x - r, y - r, x + r, y + r);
  // a hazard's bubbles and glints (and a spark lifting off), its ripples
  if (f.haz && f.hazKind) for (let j = Math.max(0, vy0); j <= Math.min(th - 1, vy1); j++) for (let i = Math.max(0, vx0); i <= Math.min(tw - 1, vx1); i++) if (f.haz[j * tw + i]) mark(i * TILE, j * TILE - 10, i * TILE + TILE - 1, j * TILE + TILE + 9);
  if (typeof HazRipples !== 'undefined') for (const q of HazRipples) round(q.x, q.y, 16);
  // foes' marks on the ground
  for (const s2 of d.snares || []) mark(Math.min(s2.x0, s2.x1) - 3, Math.min(s2.y0, s2.y1) - 3, Math.max(s2.x0, s2.x1) + 3, Math.max(s2.y0, s2.y1) + 3);
  for (const e of d.enemies) {
    if (e.dead) continue;
    if (e.type === 'lurker' || e.type === 'wraith') round(e.x, e.y, 16);
    else if (e.state === 'windup' && (e.type === 'dropper' || e.type === 'skink')) round(e.aimX, e.aimY, 1.7 * (T.enemies[e.type].drop || T.enemies[e.type].burst || 10));
  }
  // a waystone's rings, the heart's
  if (f.stones && d.hold) { const st = f.stones[d.hold.k]; if (st) round((st.x + 0.5) * TILE, (st.y + 0.5) * TILE, T.world.waystone.holdR + 2); }
  if (f.heart) round((f.heart.x + 0.5) * TILE, (f.heart.y + 0.5) * TILE, 14);
  // a way down's hole (portals.js)
  for (const s of f.solids || []) if (!d.hub) round(s.x, s.y, 16);
  // cast marks, glyphs and swept rings, a caster's charging circle
  if (typeof CFX !== 'undefined' && CFX.dive === d) {
    for (const m of CFX.decals) { const c = m.pic.col; mark(m.x - c.cx / AP - 1, m.y - c.cy / AP - 1, m.x + (c.c.width - c.cx) / AP + 1, m.y + (c.c.height - c.cy) / AP + 1); }
    for (const r of CFX.rings) if (r.kind === 'glyph' || (r.kind === 'sweep' && !r.air)) round(r.f ? d.p.x + r.x : r.x, r.f ? d.p.y + r.y : r.y, Math.max(r.r0, r.r1) + 2);
    round(d.p.x, d.p.y, T.castFx.charge.glyph[1] + 2);
    for (const au of d.auras) if (au.kind === 'well') round(au.x, au.y, 6);
    // a lance's scar, along its line
    for (const sc of CFX.scars) { const L = Math.hypot(sc.x1 - sc.x0, sc.y1 - sc.y0); for (let s = 0; s <= L; s += 8) { const u = L ? s / L : 0; round(lerp(sc.x0, sc.x1, u), lerp(sc.y0, sc.y1, u), 5); } }
  }
  // each marked tile's rock laid back
  const B = View.rockBlk, bw = Math.ceil(PWIN.w / PNT_BLK), bh = Math.ceil(PWIN.h / PNT_BLK), per = ATILE / PNT_BLK, bx0 = PWIN.x / PNT_BLK, by0 = PWIN.y / PNT_BLK, ex = View.emCtx;
  let C = View.pnrTiles;
  if (!C) C = View.pnrTiles = new Map();
  for (const k of list) {
    M[k] = 0;
    const i = k % tw, j = (k - i) / tw;
    let any = false;
    for (let by = j * per - by0; by < j * per + per - by0 && !any; by++) { if (by < 0 || by >= bh) continue; for (let bx = i * per - bx0; bx < i * per + per - bx0; bx++) if (bx >= 0 && bx < bw && B[by * bw + bx]) { any = true; break; } }
    if (!any) continue;
    let c = C.get(k);
    if (c === undefined) { c = pnrTilePics(f, i, j); C.set(k, c); }
    if (!c) continue;
    const dx = i * ATILE + ox, dy = j * ATILE + oy;
    View.ctx.drawImage(c[0], dx, dy);
    ex.globalCompositeOperation = 'destination-out';
    ex.drawImage(c[0], dx, dy);
    ex.globalCompositeOperation = 'source-over';
    if (c[1]) ex.drawImage(c[1], dx, dy);
  }
}
// A tile's rock (every pixel of the rock layer in it), as pictures: its
// colour, and its glow (null if none); null if the tile has no rock.
function pnrTilePics(f, i, j) {
  const W = PWIN.w, OFF = -PWIN.y * W - PWIN.x, LF = View.rockLift, Q = View.rockBuf, src = Q.col32, se = Q.em32 || (Q.em32 = new Uint32Array(Q.em.buffer));
  if (j * ATILE < PWIN.y || (j + 1) * ATILE > PWIN.y + PWIN.h || i * ATILE < PWIN.x || (i + 1) * ATILE > PWIN.x + W) return null;
  const img = new ImageData(ATILE, ATILE), d32 = new Uint32Array(img.data.buffer), eimg = new ImageData(ATILE, ATILE), e32 = new Uint32Array(eimg.data.buffer);
  let n = 0, ne = 0;
  for (let y = 0; y < ATILE; y++) for (let x = 0, k = (j * ATILE + y) * W + i * ATILE + OFF; x < ATILE; x++, k++) if (LF[k] && src[k]) { d32[y * ATILE + x] = src[k]; n++; if (se[k] >>> 24) { e32[y * ATILE + x] = se[k]; ne++; } }
  if (!n) return null;
  const [cv, cx] = makeCanvas(ATILE, ATILE);
  cx.putImageData(img, 0, 0);
  let ev = null;
  if (ne) { const [c2, x2] = makeCanvas(ATILE, ATILE); x2.putImageData(eimg, 0, 0); ev = c2; }
  return [cv, ev];
}

// ---- hanging plants ----------------------------------------------------------
// How far above floor row y (art px) the lip of the face over column x is
// drawn: a hanging plant whose anchor is the wall line hangs from there,
// not from the face's foot. 0 where there's no rock just north.
function pnrLipAbove(x, y) {
  const P = View.floorBuf, R = View.rockPx, H = View.rockH;
  x = Math.round(x); y = Math.round(y);
  if (!P || !R || !H || x < P.ox || x >= P.ox + P.w) return 0;
  const W = P.w, OFF = -P.oy * W - P.ox, zone = T.paint.wall.ramp;
  // the footprint's south edge, at or just above the anchor
  let ye = -1;
  for (let k = 0; k <= ap(4); k++) { const yy = y - k; if (yy >= P.oy && yy < P.oy + P.h && R[yy * W + x + OFF]) { ye = yy; break; } }
  if (ye < 0) return 0;
  pntLiftAt(x, ye);
  let lip = ye - H[ye * W + x + OFF];
  for (let yy = ye - 1; yy >= Math.max(P.oy, ye - zone) && R[yy * W + x + OFF]; yy--) lip = Math.min(lip, yy - H[yy * W + x + OFF]);
  return Math.max(0, y - lip - 1);
}

// After the ground over x0..x1, y0..y1 has been painted again (a tear
// sealed): the rock standing there painted again over it, and laid in.
function pnrRepaintArea(f, x0, y0, x1, y1) {
  if (View.floorFor !== f) return;
  const m = pntMaxLift();
  paintRockArea(f, x0, y0 - m, x1, y1);
  pntComposite(f, x0, y0 - m, x1, y1);
  View.occCache = new Map(); View.pnrTiles = null;
}
