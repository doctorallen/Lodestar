'use strict';
// ---------------------------------------------------------------------------
// The painted style (docs/PAINTED.md; every number in T.paint). Everything
// is laid in short horizontal strokes of a few close tones, one tone a
// stroke, picked by the light at the stroke's middle with a little jitter,
// so the tones interlock along the light's gradients like oil paint. No
// outlines, no fine noise. Rock rises: each solid region of the floor is a
// heightfield (steep south faces, rounded tops, boulder bumps), drawn from
// a steep three-quarter camera, so its top stands up over the floor behind
// it and hides what stands there.
//
// A floor has two painted layers, cached like the old floor: the ground
// (View.floorCol/floorEm: every tile's ground, painted by paintCaveTile
// through pntGroundRow) and the rock (View.rockCol/rockEm, transparent
// where the ground shows). For each pixel of the rock layer, View.rockLift
// holds how far its surface point is lifted (its footprint row less the
// row it's drawn on, plus 1; 0 for ground), and so which floor row it
// stands on: a sprite whose feet are north of that row is behind it, and
// paintOcclude draws the rock back over it. The footprint (View.rockPx,
// the smooth wall line) is unchanged, as are collision and generation.
// Everything here is seeded by place (artHash of x, y and the floor's
// seed), never Math.random, so a floor always paints the same.
// ---------------------------------------------------------------------------

// ---- colours ---------------------------------------------------------------
// [r, g, b] to a whole pixel (r, g, b, opaque in one 32-bit word), and back
const pntU32 = (c) => (0xff000000 | (Math.round(c[2]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[0])) >>> 0;
const pntMixRgb = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const pntLum = (c) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
const PNT_DEEP = [7, 5, 12], PNT_WARM = [255, 238, 200];

// A ramp for stroke painting, from a few anchors (dark to light, [r, g, b]):
// two deeper shades (towards a violet black), the anchors, and two lighter
// ones (towards `light`, warm gold by default). So a clime's three colours
// become seven close tones of the same hues, its rock's six ten. As whole
// pixels.
function pntRamp(anchors, light = PNT_WARM, P = T.paint.ramp) {
  const out = [pntMixRgb(anchors[0], PNT_DEEP, P.dark[0]), pntMixRgb(anchors[0], PNT_DEEP, P.dark[1])];
  anchors.forEach((a) => out.push(a));
  const top = anchors[anchors.length - 1];
  out.push(pntMixRgb(top, light, P.light[0]), pntMixRgb(top, light, P.light[1]));
  return out;
}
// A look's ramps (b: a floor look, ART.biomes' shape), worked out once:
// ground (7 tones from its floor's three) and rock (10, from its rock's
// three dark tones and its face's three, sorted by lightness, lit towards
// its rim colour).
const _pntLooks = new WeakMap();
function pntLook(b) {
  let L = _pntLooks.get(b);
  if (L) return L;
  const g = (b.sun ? calmRgb(b.floor) : rampRgb(b.floor)).slice(0, 3);
  const rk = rampRgb(b.rock), fr = rampRgb(b.front);
  const rock = rk.slice(0, 3).concat(fr.slice(0, 3)).sort((p, q) => pntLum(p) - pntLum(q));
  const ground = pntRamp(g), rr = pntRamp(rock, rk[3], T.paint.ramp.rock);
  L = { ground: Uint32Array.from(ground.map(pntU32)), rock: Uint32Array.from(rr.map(pntU32)), groundRgb: ground, rockRgb: rr };
  _pntLooks.set(b, L);
  return L;
}

// ---- noise -----------------------------------------------------------------
// Value noise in 0..1 along a row, sx px across a bump and sy px down (so
// it can be stretched into streaks): n values from x0 at y, into out.
function pntNoiseRow(out, x0, n, y, sx, sy, seed) {
  const gy = y / sy, yi = Math.floor(gy), v0 = gy - yi, v = v0 * v0 * (3 - 2 * v0), isx = 1 / sx;
  let xi = Math.floor(x0 * isx), a = 0, b = 0, last = NaN;
  for (let i = 0; i < n; i++) {
    const gx = (x0 + i) * isx, ci = Math.floor(gx);
    if (ci !== last) {
      xi = ci; last = ci;
      const h00 = artHash(xi, yi, seed), h10 = artHash(xi + 1, yi, seed), h01 = artHash(xi, yi + 1, seed), h11 = artHash(xi + 1, yi + 1, seed);
      a = h00 + (h01 - h00) * v; b = h10 + (h11 - h10) * v;
    }
    const u0 = gx - xi, u = u0 * u0 * (3 - 2 * u0);
    out[i] = a + (b - a) * u;
  }
  return out;
}
function pntNoise(x, y, sx, sy, seed) {
  const gx = x / sx, gy = y / sy, x0 = Math.floor(gx), y0 = Math.floor(gy), u0 = gx - x0, v0 = gy - y0, u = u0 * u0 * (3 - 2 * u0), v = v0 * v0 * (3 - 2 * v0);
  const a = artHash(x0, y0, seed), b = artHash(x0 + 1, y0, seed), c = artHash(x0, y0 + 1, seed), d = artHash(x0 + 1, y0 + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const pntSmooth = (a, b, x) => { const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a); return t * t * (3 - 2 * t); };

// ---- strokes ---------------------------------------------------------------
// The strokes along row y: each row is cut into cells of 8 px (set off by
// a phase of its own), each cell into one, two or three strokes at hashed
// places, so a stroke is 2 to 8 px and mostly short, and the same pixel
// is always in the same stroke however the floor is painted. For each
// pixel from x0 for n: mid, the stroke's middle (its tone is read there),
// and jit, the stroke's jitter (about -1..1, near 0 most often).
const PNT_CELL = 8;
function pntStrokeRow(mid, jit, x0, n, y, seed) {
  const ph = (artHash(y, 7, seed) * PNT_CELL) | 0, S = T.paint.stroke;
  let c = Math.floor((x0 + ph) / PNT_CELL), cs = c * PNT_CELL - ph, i = 0;
  while (i < n) {
    const h = artHash(c, y, seed + 1), h2 = artHash(c, y, seed + 2), h3 = artHash(c, y, seed + 3);
    // the cuts: none (one stroke of 8), one, or two
    let a = PNT_CELL, b = PNT_CELL;
    if (h >= S.whole) {
      if (h < S.whole + S.one) a = 2 + ((h2 * 5) | 0);
      else { a = 2 + ((h2 * 3) | 0); b = Math.min(PNT_CELL - 2, a + 2 + ((h3 * 3) | 0)); }
    }
    // each stroke's jitter, once
    const ja = h2 + h3 - 1, jb = artHash(c, y, seed + 4) + h3 - 1, jc = artHash(c, y, seed + 5) + h - 1;
    const ma = cs + ((a - 1) >> 1) - x0, mb = cs + ((a + b - 1) >> 1) - x0, mc = cs + ((b + PNT_CELL - 1) >> 1) - x0;
    for (let k = 0; k < PNT_CELL; k++) {
      if (cs + k < x0) continue;
      if (i >= n) break;
      if (k < a) { mid[i] = ma; jit[i] = ja; } else if (k < b) { mid[i] = mb; jit[i] = jb; } else { mid[i] = mc; jit[i] = jc; }
      i++;
    }
    c++; cs += PNT_CELL;
  }
}

// ---- the ground ------------------------------------------------------------
// The ground's tones (indices into its 7-tone ramp) for floor pixels x0..x1,
// y0..y1, into View.groundTone, worked out a whole row at a time: its light
// value (0..1) is a broad swell, streaky lit patches (noise stretched
// across, cut soft), the floor's own clumps faintly, darker at the foot of a
// wall and beside one, and under the sky in a rock's shadow (cast to the
// lower right as high as the rock stands). Then strokes: each pixel takes
// its stroke's middle's value, jittered. paintCaveTile reads them.
function pntGroundTones(f, x0, y0, x1, y1) {
  const G = T.paint.ground, W = f.w * ATILE, Hp = f.h * ATILE, R = View.rockPx, H = View.rockH, out = View.groundTone, nt = 7;
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W, x1); y1 = Math.min(Hp, y1);
  if (x1 <= x0 || y1 <= y0) return;
  const sun = !!artBiome(f).sun, seedH = (f.seed ^ f.depth) | 0, pad = PNT_CELL, ax = x0 - pad, n = x1 - x0 + 2 * pad;
  const v = new Float32Array(n), n1 = new Float32Array(n), n2 = new Float32Array(n), n3 = new Float32Array(n), cl = new Float32Array(n), mid = new Int16Array(n), jit = new Float32Array(n);
  // for each column, how many rows since rock above it (up to G.foot + 1)
  const since = new Uint8Array(n), F = G.foot, pk = sun ? G.patchSky : G.patchCave, J = G.jitter * (nt - 1) * 0.48;
  const rk = (x, y) => x < 0 || y < 0 || x >= W || y >= Hp || R[y * W + x] === 1;
  for (let i = 0; i < n; i++) { let k = F + 1; for (let j = 1; j <= F; j++) if (rk(ax + i, y0 - j)) { k = j - 1; break; } since[i] = k; }
  for (let y = y0; y < y1; y++) {
    pntNoiseRow(n1, ax, n, y, G.swell, G.swell, seedH + 21);
    pntNoiseRow(n2, ax, n, y, G.patch[0], G.patch[1], seedH + 22);
    pntNoiseRow(n3, ax, n, y, G.patch[0] * 0.45, G.patch[1] * 0.6, seedH + 23);
    artClumpRow(cl, ax, n, y, seedH);
    const row = y * W;
    for (let i = 0; i < n; i++) {
      const x = ax + i, here = x < 0 || x >= W || R[row + x] === 1;
      let val = G.base + (n1[i] - 0.5) * G.swellAmt + cl[i] * G.clump;
      // streaky light: patches of it, their edges torn in streaks
      const p = n2[i] * 0.65 + n3[i] * 0.35;
      val += pk * (pntSmooth(G.patchCut[0], G.patchCut[1], p) - 0.35);
      // at a wall's foot: a hard dark line, then a falloff
      const k = since[i] + 1;
      if (k <= F) val -= k <= G.footHard ? 0.5 : G.footAmt * (1 - (k - 1) / F);
      since[i] = here ? 0 : Math.min(F + 1, since[i] + 1);
      if (!here && (rk(x - 1, y) || rk(x + 1, y))) val -= G.side;
      if (sun && !here) {
        for (let s = 1; s <= G.sunSteps; s++) {
          const sx = x - s * G.sunDir[0], sy = y - s * G.sunDir[1];
          if (sx < 0 || sy < 0) break;
          if (H[sy * W + sx] > s * G.sunSlope) { val -= G.sunDark; break; }
        }
      }
      v[i] = val;
    }
    pntStrokeRow(mid, jit, ax, n, y, seedH + 31);
    for (let x = x0; x < x1; x++) {
      const i = x - ax, t = Math.round(v[mid[i]] * (nt - 1) + jit[i] * J);
      out[row + x] = t < 0 ? 0 : t > nt - 1 ? nt - 1 : t;
    }
  }
}

// ---- the rock --------------------------------------------------------------
// How high each rock pixel of the footprint stands (art px), in View.rockH:
// from its distance in from the rock's edge, a steep rise (the face) that
// rounds over into a top, plus boulder bumps that grow in from the edge.
// The sinkhole is not rock here: it falls away (paintPitTile).
function pntMaxLift() { const W = T.paint.wall; return W.face + W.bump + 1; }
function pntIsRockPx(f, R, W, x, y) {
  if (!R[y * W + x]) return false;
  const P = View.pitPx;
  return !(P && P[y * W + x]);
}
// Distances (chamfer 5-7, so ~5 a px) from the nearest open pixel, over a
// window, capped; then heights for its inner part.
let _pntDist = new Uint16Array(0);
function pntHeights(f, x0, y0, x1, y1) {
  const Wl = T.paint.wall, R = View.rockPx, Pp = View.pitPx, W = f.w * ATILE, Hp = f.h * ATILE, H = View.rockH, HF = View.rockHf;
  const cap = Math.max(Wl.edge, Wl.ramp) + 2, m = cap + 1;
  const wx0 = Math.max(0, x0 - m), wy0 = Math.max(0, y0 - m), wx1 = Math.min(W, x1 + m), wy1 = Math.min(Hp, y1 + m), ww = wx1 - wx0, wh = wy1 - wy0;
  // (a border a pixel wide of rock round the window, so the passes need
  // no edge tests)
  const pw = ww + 2, ph = wh + 2;
  if (_pntDist.length < pw * ph) _pntDist = new Uint16Array(pw * ph);
  const D = _pntDist, BIG = 60000, C = cap * 5;
  D.fill(BIG, 0, pw); D.fill(BIG, (ph - 1) * pw, ph * pw);
  for (let y = 0; y < wh; y++) {
    const o = (y + 1) * pw, r = (wy0 + y) * W + wx0;
    D[o] = BIG; D[o + pw - 1] = BIG;
    if (Pp) for (let x = 0; x < ww; x++) D[o + 1 + x] = R[r + x] && !Pp[r + x] ? BIG : 0;
    else for (let x = 0; x < ww; x++) D[o + 1 + x] = R[r + x] ? BIG : 0;
  }
  for (let y = 1; y <= wh; y++) for (let k = y * pw + 1, e = k + ww; k < e; k++) {
    let d = D[k];
    if (!d) continue;
    const a = D[k - 1] + 5, b = D[k - pw] + 5, c = D[k - pw - 1] + 7, e2 = D[k - pw + 1] + 7;
    if (a < d) d = a;
    if (b < d) d = b;
    if (c < d) d = c;
    if (e2 < d) d = e2;
    D[k] = d;
  }
  for (let y = wh; y >= 1; y--) for (let k = y * pw + ww, e = y * pw; k > e; k--) {
    let d = D[k];
    if (!d) continue;
    const a = D[k + 1] + 5, b = D[k + pw] + 5, c = D[k + pw + 1] + 7, e2 = D[k + pw - 1] + 7;
    if (a < d) d = a;
    if (b < d) d = b;
    if (c < d) d = c;
    if (e2 < d) d = e2;
    D[k] = d;
  }
  const seed = (f.seed ^ f.depth) | 0, bs = Wl.bumpScale, row = new Float32Array(x1 - x0), row2 = new Float32Array(x1 - x0), edge = Wl.edge, face = Wl.face, bmp = Wl.bump, ramp = Wl.ramp;
  for (let y = Math.max(0, y0); y < Math.min(Hp, y1); y++) {
    pntNoiseRow(row, x0, x1 - x0, y, bs, bs * 0.8, seed + 41);
    pntNoiseRow(row2, x0, x1 - x0, y, bs * 0.45, bs * 0.4, seed + 42);
    for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) {
      const dd = D[(y - wy0 + 1) * pw + x - wx0 + 1], k = y * W + x;
      if (!dd) { H[k] = 0; HF[k] = 0; continue; }
      const d = (dd < C ? dd : C) * 0.2, u = d < edge ? d / edge : 1, rise = 1 - (1 - u) * (1 - u);
      const hf = face * rise + bmp * (row[x - x0] * 0.7 + row2[x - x0] * 0.3) * (d < ramp ? d / ramp : 1), q = hf < 1 ? 1 : hf;
      H[k] = (q + 0.5) | 0; HF[k] = (q * 16 + 0.5) | 0;
    }
  }
}

// The rock layer for the view's pixels x0..x1, y0..y1 (art px of the
// floor): each column marched from the front (south) back, every surface
// point drawn where it stands (its row less its height), the steep ones
// stretched down over the rows below them as a face; then painted.
let _pntCell = new Int32Array(0);
function paintRockArea(f, x0, y0, x1, y1) {
  if (!View.rockBuf || View.floorFor !== f) return;
  const W = f.w * ATILE, Hp = f.h * ATILE, maxH = pntMaxLift();
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W, x1); y1 = Math.min(Hp, y1);
  if (x1 <= x0 || y1 <= y0) return;
  const R = View.rockPx, H = View.rockH, LF = View.rockLift, Q = View.rockBuf, C32 = Q.col32 || (Q.col32 = new Uint32Array(Q.col.buffer)), E = Q.em;
  for (let y = y0; y < y1; y++) { C32.fill(0, y * W + x0, y * W + x1); for (let x = x0; x < x1; x++) E[(y * W + x) * 4 + 3] = 0; }
  // march: each pixel of rock notes how far its surface point is lifted
  // (a little past the area, as its edges look at their neighbours)
  const mx0 = Math.max(0, x0 - PNT_CELL), mx1 = Math.min(W, x1 + PNT_CELL), my0 = Math.max(0, y0 - 4), my1 = Math.min(Hp, y1 + 4);
  const yTop = Math.min(Hp - 1, my1 - 1 + maxH), pit = View.pitPx;
  for (let x = mx0; x < mx1; x++) {
    let ymin = yTop + 1;
    for (let y = my0; y < my1; y++) LF[y * W + x] = 0;
    for (let y = yTop; y >= my0; y--) {
      const k = y * W + x;
      if (R[k] && !(pit && pit[k])) {
        const sy = y - H[k];
        if (sy < ymin) {
          for (let r = Math.max(sy, my0), e = Math.min(ymin, my1); r < e; r++) LF[r * W + x] = Math.min(255, y - r + 1);
          ymin = sy;
        }
      } else if (y < ymin) ymin = y;
    }
  }
  pntPaintRock(f, x0, y0, x1, y1);
  pntRockDecor(f, x0, y0, x1, y1);
  pntRockBlocks(f, x0, y0, x1, y1);
}

// The rock's slabs: cells in the view's own px, wider than tall, each a
// tone of its own, with a lit lip along its top and a dark crack under it.
// The cell of a pixel: the nearest of the jittered points about it, their
// borders wobbled by noise. Fills cell (rw × ch, rows from y0 - sp) for
// the rock pixels only (-1 elsewhere).
function pntSlabs(cell, x0, y0, rw, ch, sp, seed) {
  const S = T.paint.slab, cw = S.w, chh = S.h, LF = View.rockLift, W = View.floorBuf.w, Hp = View.floorBuf.h;
  const gx0 = Math.floor(x0 / cw) - 1, gx1 = Math.floor((x0 + rw) / cw) + 1, gy0 = Math.floor((y0 - sp) / chh) - 1, gy1 = Math.floor((y0 - sp + ch) / chh) + 1;
  const gw = gx1 - gx0 + 1, gh = gy1 - gy0 + 1, PX = new Float32Array(gw * gh), PY = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) { const I = gx0 + i, J = gy0 + j; PX[j * gw + i] = (I + artHash(I, J, seed) + (J & 1) * 0.5) * cw; PY[j * gw + i] = (J + artHash(I, J, seed + 1)) * chh; }
  const wob = new Float32Array(rw), icw = 1 / cw, ich = 1 / chh, CX = new Float32Array(9), CY = new Float32Array(9), CI = new Int32Array(9);
  for (let r = 0; r < ch; r++) {
    const y = y0 - sp + r;
    if (y < 0 || y >= Hp) { cell.fill(-1, r * rw, r * rw + rw); continue; }
    pntNoiseRow(wob, x0, rw, y, 5, 3, seed + 7);
    const gy = Math.floor(y / chh), row = y * W, out = r * rw;
    let gxl = -1e9;
    for (let i = 0; i < rw; i++) {
      const x = x0 + i;
      if (!LF[row + x]) { cell[out + i] = -1; continue; }
      const gx = Math.floor(x * icw), wb = 1 + (wob[i] - 0.5) * S.wobble;
      if (gx !== gxl) {
        // the nine points about this column of cells, as distances in y
        gxl = gx;
        for (let c = 0, j = gy - 1; j <= gy + 1; j++) for (let k = gx - 1; k <= gx + 1; k++, c++) { const o = (j - gy0) * gw + k - gx0; CX[c] = PX[o]; CY[c] = (y - PY[o]) * ich; CI[c] = (j * 4099 + k) | 0; }
        for (let c = 0; c < 9; c++) CY[c] = CY[c] * CY[c];
      }
      let best = 1e9, id = 0;
      for (let c = 0; c < 9; c++) { const dx = (x - CX[c]) * icw, d = dx * dx + CY[c] * wb; if (d < best) { best = d; id = CI[c]; } }
      cell[out + i] = id;
    }
  }
}
function pntPaintRock(f, x0, y0, x1, y1) {
  const P = T.paint, Wl = P.wall, Rk = P.rock, HF = View.rockHf, LF = View.rockLift, Q = View.rockBuf, C32 = Q.col32, W = f.w * ATILE, Hp = f.h * ATILE;
  const b = artBiome(f), ramp = pntLook(b).rock, nt = ramp.length, seed = (f.seed ^ f.depth) | 0, rw = x1 - x0, rh = y1 - y0;
  const ll = Math.hypot(Rk.light[0], Rk.light[1], Rk.light[2]), lx = Rk.light[0] / ll, ly = Rk.light[1] / ll, lz = Rk.light[2] / ll;
  const hq = (x, y) => (x < 0 || y < 0 || x >= W || y >= Hp ? Wl.face : HF[y * W + x] / 16);
  const isRock = (x, y) => x >= 0 && y >= 0 && x < W && y < Hp && LF[y * W + x] > 0;
  // a rock pixel's tone before its stroke (its point's slope to the light
  // as a top, its height up the face as a face, blended by how steep it
  // is) into tb, and how steep (0 a top, 1 a face) into wb
  const s0 = Rk.steep[0], sk = 1 / (Rk.steep[1] - Rk.steep[0]), lamLo = Rk.lamLo, lamK = 1 / (1 - lamLo), topLo = Rk.topLo, topR = Rk.topHi - Rk.topLo, faceLo = Rk.faceLo, faceR = Rk.faceHi - Rk.faceLo;
  const fB = Rk.faceBase, fU = Rk.faceUp / Wl.face, fWst = Rk.faceWest, W2 = 2 * W, W3 = 3 * W;
  const look = (x, y, tb, wb, i) => {
    const sy = y + LF[y * W + x] - 1, k = sy * W + x;
    let h, hx, hy;
    if (x >= 2 && x < W - 2 && sy >= 2 && sy < Hp - 2) { h = HF[k] * 0.0625; hx = (HF[k + 2] - HF[k - 2]) * 0.015625; hy = (HF[k + W2] - HF[k - W2]) * 0.015625; }
    else { h = hq(x, sy); hx = (hq(x + 2, sy) - hq(x - 2, sy)) * 0.25; hy = (hq(x, sy + 2) - hq(x, sy - 2)) * 0.25; }
    let w = (-hy - s0) * sk;
    w = w <= 0 ? 0 : w >= 1 ? 1 : w * w * (3 - 2 * w);
    const lam = (-hx * lx - hy * ly + lz) / Math.sqrt(hx * hx + hy * hy + 1);
    let vt = (lam - lamLo) * lamK; vt = vt < 0 ? 0 : vt > 1 ? 1 : vt;
    let vf = fB + fU * (h < Wl.face ? h : Wl.face) + fWst * (hx < -1 ? -1 : hx > 1 ? 1 : hx); vf = vf < 0 ? 0 : vf > 1 ? 1 : vf;
    tb[i] = (topLo + vt * topR) * (1 - w) + (faceLo + vf * faceR) * w;
    wb[i] = w;
  };
  // the slab cells, for the rows and a few either side
  const sp = 4, ch = rh + 2 * sp;
  if (_pntCell.length < rw * ch) _pntCell = new Int32Array(rw * ch);
  const cell = _pntCell;
  pntSlabs(cell, x0, y0, rw, ch, sp, seed + 61);
  const gate = new Float32Array(rw);
  const n = rw + 16, mid = new Int16Array(n), jit = new Float32Array(n);
  let tb = new Float32Array(n), wb = new Float32Array(n), tbUp = new Float32Array(n), wbUp = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = x0 - 8 + i; if (isRock(x, y0 - 1)) look(x, y0 - 1, tbUp, wbUp, i); else wbUp[i] = 0; }
  for (let y = y0; y < y1; y++) {
    for (let i = 0; i < n; i++) { const x = x0 - 8 + i; if (isRock(x, y)) look(x, y, tb, wb, i); else wb[i] = -1; }
    pntStrokeRow(mid, jit, x0 - 8, n, y, seed + 71);
    pntNoiseRow(gate, x0, rw, y, 7, 4, seed + 85);
    const off = (artHash(y, 3, seed) * 16) | 0;
    let stS = -1e9, stX = 0, stL = 0, stA = 0, slId = -2, slT = 0;
    for (let x = x0; x < x1; x++) {
      const i = x - x0 + 8;
      if (wb[i] < 0) continue;
      const sy = y + LF[y * W + x] - 1, face = wb[i] > 0.5, m = mid[i];
      // the stroke's tone, from its middle if that's rock too
      let t = (wb[m] >= 0 ? tb[m] : tb[i]) + jit[i] * Rk.jitter;
      // strata on the faces: long strokes a shade or two off
      if (face) {
        const sc = (x + off) >> 4;
        if (sc !== stS) {
          stS = sc; stA = 0;
          if (artHash(sc, y, seed + 81) < Rk.strata) { stX = sc * 16 - off + ((artHash(sc, y, seed + 82) * 8) | 0); stL = 3 + ((artHash(sc, y, seed + 83) * 10) | 0); stA = artHash(sc, y, seed + 84) < 0.6 ? -2 : 1; }
        }
        if (stA && x >= stX && x < stX + stL) t += stA;
      }
      // slabs: a tone of their own; a lip on top, a crack below
      const cj = (y - y0 + sp) * rw + x - x0, id = cell[cj];
      let up = 9, dn = 9;
      for (let k = 1; k <= 3; k++) { if (up === 9 && cell[cj - k * rw] !== id) up = k; if (dn === 9 && cell[cj + k * rw] !== id) dn = k; }
      if (id !== slId) { slId = id; slT = (artHash(id, 1, seed + 86) - 0.5) * 2 * P.slab.tone; }
      t += slT;
      if (gate[x - x0] > P.slab.gate) {
        if (up === 1 && isRock(x, y - 1)) t += face ? P.slab.lip : P.slab.lip * 0.5;
        else if (up <= 3 && face) t += 0.7;
        if (dn === 1 && isRock(x, y + 1)) t = Math.min(t, P.slab.crack + (face ? 0 : 2));
        else if (dn <= 2 && isRock(x, y + 1)) t -= 1;
      }
      // a crease where the rock folds: hard soot
      const ks = sy * W + x, cav = x >= 3 && x < W - 3 && sy >= 3 && sy < Hp - 3 ? (HF[ks] - (HF[ks - 3] + HF[ks + 3] + HF[ks - W3] + HF[ks + W3]) * 0.25) * 0.0625 : 0;
      if (cav < -Rk.crease && !face) t = Math.min(t, 1);
      // the silhouette's top edge, lit; the lip where a top turns down
      // into a face, lit; the face's foot on the ground, soot
      if (!isRock(x, y - 1)) t = Math.max(t, Rk.rim);
      else if (face && wbUp[i] < 0.3) t = Math.max(t, Rk.lip);
      if (!isRock(x, y + 1)) t = Math.min(t, Rk.foot);
      else if (!isRock(x, y + 2)) t = Math.min(t, Rk.foot + 2);
      t = Math.round(t);
      C32[y * W + x] = ramp[t < 0 ? 0 : t > nt - 1 ? nt - 1 : t];
    }
    let q = tbUp; tbUp = tb; tb = q; q = wbUp; wbUp = wb; wb = q;
  }
}

// What the rock carries: ore breaking out of it (on its top and, where
// it faces the ground, its face), and now and then a faint glowing vein.
function pntRockDecor(f, x0, y0, x1, y1) {
  const W = f.w * ATILE, Hp = f.h * ATILE, H = View.rockH, LF = View.rockLift, Q = View.rockBuf, b = artBiome(f), maxH = pntMaxLift();
  const tx0 = Math.max(0, Math.floor(x0 / ATILE) - 1), tx1 = Math.min(f.w - 1, Math.floor(x1 / ATILE) + 1), ty0 = Math.max(0, Math.floor(y0 / ATILE)), ty1 = Math.min(f.h - 1, Math.floor((y1 + maxH) / ATILE) + 1);
  const on = (x, y, ty) => x >= x0 && y >= y0 && x < x1 && y < y1 && LF[y * W + x] && Math.floor((y + LF[y * W + x] - 1) / ATILE) === ty;
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const t = f.tiles[ty * f.w + tx];
    if (t !== TILE_ORE && !(t === TILE_ROCK && (hashInts(f.seed, tx, ty, 0x7e1) & 255) < 18)) continue;
    _tileSeed = hashInts(f.seed, f.depth, tx, ty, 0x0e5) | 0;
    const rnd = tileRnd;
    if (t === TILE_ORE) {
      const r = ART.ores[T.ores[f.ore[ty * f.w + tx] - 1].id], w = Math.max(2, ap(2)), shards = [];
      for (let k = 0; k < 3; k++) {
        const fx = tx * ATILE + Math.round(((k + 0.5) / 3) * (ATILE - w - 2)) + Math.floor(rnd() * ap(2)), fy = ty * ATILE + Math.round(ATILE * (0.35 + rnd() * 0.5));
        const sy = fy - H[fy * W + fx], h = ap(3 + Math.floor(rnd() * 3));
        shards.push([fx, sy, h, fy]);
      }
      shards.sort((p, q) => p[1] - q[1]);
      for (const [x, y, h, fy] of shards) {
        if (!on(x, y + 1, ty)) continue;
        for (let j = -1; j <= w; j++) if (on(x + j, y + 1, ty)) pntPut(Q, LF, W, x + j, y + 1, rgbOf(b.rock[0]), false, fy);
        pntShard(Q, LF, W, x, y, h, w, r, fy, x0, y0, x1, y1);
      }
      // on its face, where the ground is in front of it
      if (!TILE_SOLID[floorTile(f, tx, ty + 1)]) {
        const fx = tx * ATILE + ap(2) + Math.floor(rnd() * (ATILE - ap(6))), fy = (ty + 1) * ATILE - 1, sy = fy - ap(3) - Math.floor(rnd() * ap(4));
        if (on(fx, sy, ty)) pntShard(Q, LF, W, fx, sy, ap(3), w, r, fy, x0, y0, x1, y1);
      }
    } else {
      // a vein: a thin dim crack wandering over the top
      const col = rgbOf(mix(b.glow, '#000000', 0.7));
      let fx = tx * ATILE + ap(3) + Math.floor(rnd() * ap(10)), fy = ty * ATILE + ap(2) + Math.floor(rnd() * ap(8));
      for (let k = 0, n = ap(9); k < n; k++) {
        const sy = fy - H[fy * W + fx];
        if (!on(fx, sy, ty) || !R1(View.rockPx, W, fx, fy)) break;
        pntPut(Q, LF, W, fx, sy, col, true, fy);
        fx += rnd() < 0.5 ? 1 : -1; if (rnd() < 0.6) fy += rnd() < 0.5 ? 1 : -1;
        fx = clamp(fx, tx * ATILE, tx * ATILE + ATILE - 1); fy = clamp(fy, ty * ATILE, ty * ATILE + ATILE - 1);
      }
    }
  }
}
const R1 = (R, W, x, y) => R[y * W + x] === 1;
// One pixel of the rock layer, standing on floor row fy.
function pntPut(Q, LF, W, x, y, c, glow, fy) {
  const k = y * W + x;
  Q.col32[k] = (0xff000000 | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0;
  if (glow) { const e = k * 4; Q.em[e] = c[0]; Q.em[e + 1] = c[1]; Q.em[e + 2] = c[2]; Q.em[e + 3] = 255; } else Q.em[k * 4 + 3] = 0;
  LF[k] = Math.max(1, Math.min(255, fy - y + 1));
}
// A crystal up from (x, y) in the rock layer (paintShard's look).
function pntShard(Q, LF, W, x, y, h, w, r, fy, x0, y0, x1, y1) {
  for (let i = 0; i < h; i++) {
    const yy = y - i, tip = i === h - 1;
    for (let j = 0; j < w; j++) {
      if (tip && (w === 2 ? j === 1 : j !== 1)) continue;
      const xx = x + j;
      if (xx < x0 || yy < y0 || xx >= x1 || yy >= y1) continue;
      const c = tip ? r[3] : i === 0 ? r[0] : j === 0 ? r[2] : j === w - 1 && w > 2 ? r[0] : r[1];
      pntPut(Q, LF, W, xx, yy, rgbOf(c), tip, fy);
    }
  }
}

// For each 8 × 8 block of the rock layer, the furthest south floor row any
// of its pixels stands on (0: no rock), so a sprite with nothing in front
// of it is passed over at once.
const PNT_BLK = 8;
function pntRockBlocks(f, x0, y0, x1, y1) {
  const W = f.w * ATILE, LF = View.rockLift, B = View.rockBlk, bw = Math.ceil(W / PNT_BLK), Hp = f.h * ATILE;
  for (let by = Math.floor(y0 / PNT_BLK); by * PNT_BLK < y1; by++) for (let bx = Math.floor(x0 / PNT_BLK); bx * PNT_BLK < x1; bx++) {
    let m = 0;
    for (let y = by * PNT_BLK; y < Math.min(Hp, by * PNT_BLK + PNT_BLK); y++) for (let x = bx * PNT_BLK; x < Math.min(W, bx * PNT_BLK + PNT_BLK); x++) { const l = LF[y * W + x]; if (l && y + l > m) m = y + l; }
    B[by * bw + bx] = m;
  }
}

// How high the rock stands at floor pixel x, y (art px); 0 off the rock.
function pntLiftAt(x, y) {
  const H = View.rockH, P = View.floorBuf;
  x = Math.round(x); y = Math.round(y);
  if (!H || !P || x < 0 || y < 0 || x >= P.w || y >= P.h) return 0;
  const S = View.pnt;
  if (S && !S.hdone[Math.floor(y / PNT_HCH) * S.hnx + Math.floor(x / PNT_HCH)]) pntEnsureHeights(S.f, x, y, x + 1, y + 1);
  return H[y * P.w + x];
}

// ---- the floor's layers ----------------------------------------------------
// A floor is painted lazily, in chunks of PNT_CH art px, as the view
// nears them (pntEnsure): what's in view and a margin before the frame is
// drawn, and further out a few chunks a frame within a time budget
// (T.paint.lazy). Its heights are worked out in chunks of PNT_HCH as
// they're needed. pntFloorStart sets up a floor's buffers and canvases
// (paintFloor calls it after the footprint).
const PNT_CH = 48, PNT_HCH = 96;
function pntFloorStart(f) {
  const W = f.w * ATILE, Hp = f.h * ATILE;
  View.rockH = new Uint8Array(W * Hp);
  View.rockHf = new Uint16Array(W * Hp);
  View.groundTone = new Uint8Array(W * Hp);
  View.rockLift = new Uint8Array(W * Hp);
  View.rockBlk = new Int16Array(Math.ceil(W / PNT_BLK) * Math.ceil(Hp / PNT_BLK));
  View.rockBuf = pixBuf(W, Hp);
  View.rockBuf.col32 = new Uint32Array(View.rockBuf.col.buffer);
  // the sinkhole's pixels, which never rise
  let pit = null;
  for (let ty = 0; ty < f.h; ty++) for (let tx = 0; tx < f.w; tx++) if (f.tiles[ty * f.w + tx] === TILE_PIT) {
    pit = pit || new Uint8Array(W * Hp);
    for (let y = ty * ATILE - ATILE / 2; y < (ty + 1.5) * ATILE; y++) for (let x = tx * ATILE - ATILE / 2; x < (tx + 1.5) * ATILE; x++) {
      if (x < 0 || y < 0 || x >= W || y >= Hp) continue;
      // (a pixel belongs to the pit if it's in the pit's tile, or if the
      // tiles its wall line is blended from are the pit and open ground)
      const gx = Math.floor(x / ATILE - 0.5), gy = Math.floor(y / ATILE - 0.5);
      let p = 0, r = 0;
      for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const t = floorTile(f, gx + i, gy + j); if (t === TILE_PIT) p++; else if (TILE_SOLID[t]) r++; }
      if (floorTile(f, Math.floor(x / ATILE), Math.floor(y / ATILE)) === TILE_PIT || (p && !r)) pit[y * W + x] = 1;
    }
  }
  View.pitPx = pit;
  View.occCache = new Map();
  const nx = Math.ceil(W / PNT_CH), ny = Math.ceil(Hp / PNT_CH), hx = Math.ceil(W / PNT_HCH), hy = Math.ceil(Hp / PNT_HCH);
  View.pnt = { f, nx, ny, done: new Uint8Array(nx * ny), hnx: hx, hny: hy, hdone: new Uint8Array(hx * hy), left: nx * ny, stale: false };
  let x;
  const P = View.floorBuf;
  View.floorImgs = [new ImageData(P.col, W, Hp), new ImageData(P.em, W, Hp)];
  [View.floorCol] = makeCanvas(W, Hp); [View.floorEm] = makeCanvas(W, Hp);
}
// The rock laid over the ground in the floor's own buffers, and those
// handed to its canvases, over floor px x0..x1, y0..y1: the floor is drawn
// as one picture, and the rock buffer is kept for drawing it back over
// what stands behind it (paintOcclude).
function pntComposite(f, x0, y0, x1, y1) {
  const W = f.w * ATILE, Hp = f.h * ATILE, P = View.floorBuf, Q = View.rockBuf, LF = View.rockLift;
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W, x1); y1 = Math.min(Hp, y1);
  if (x1 <= x0 || y1 <= y0) return;
  const PC = P.col32 || (P.col32 = new Uint32Array(P.col.buffer)), QC = Q.col32, PE = P.em32 || (P.em32 = new Uint32Array(P.em.buffer)), QE = Q.em32 || (Q.em32 = new Uint32Array(Q.em.buffer));
  for (let y = y0; y < y1; y++) for (let k = y * W + x0, e = y * W + x1; k < e; k++) if (LF[k] && QC[k]) { PC[k] = QC[k]; PE[k] = QE[k]; }
  View.floorCol.getContext('2d').putImageData(View.floorImgs[0], 0, 0, x0, y0, x1 - x0, y1 - y0);
  View.floorEm.getContext('2d').putImageData(View.floorImgs[1], 0, 0, x0, y0, x1 - x0, y1 - y0);
}
// The heights over floor px x0..x1, y0..y1, worked out where they aren't.
function pntEnsureHeights(f, x0, y0, x1, y1) {
  const S = View.pnt;
  if (!S || S.f !== f) return;
  for (let j = Math.max(0, Math.floor(y0 / PNT_HCH)); j <= Math.min(S.hny - 1, Math.floor((y1 - 1) / PNT_HCH)); j++)
    for (let i = Math.max(0, Math.floor(x0 / PNT_HCH)); i <= Math.min(S.hnx - 1, Math.floor((x1 - 1) / PNT_HCH)); i++)
      if (!S.hdone[j * S.hnx + i]) { S.hdone[j * S.hnx + i] = 1; pntHeights(f, i * PNT_HCH, j * PNT_HCH, (i + 1) * PNT_HCH, (j + 1) * PNT_HCH); }
}
// One chunk, both layers: the heights it reads, the ground's tones, its
// tiles (paintTileArt: the ground, the clime's hazards, the beds), a
// graft and a tear's tint, then the rock standing over it.
function pntPaintChunk(f, i, j) {
  const S = View.pnt, W = f.w * ATILE, Hp = f.h * ATILE, maxH = pntMaxLift(), G = T.paint.ground;
  S.done[j * S.nx + i] = 1; S.left--;
  const x0 = i * PNT_CH, y0 = j * PNT_CH, x1 = Math.min(W, x0 + PNT_CH), y1 = Math.min(Hp, y0 + PNT_CH), back = G.sunSteps * Math.max(G.sunDir[0], G.sunDir[1]);
  pntEnsureHeights(f, x0 - back - 4, y0 - back - 4, x1 + PNT_CELL + 4, y1 + maxH + 8);
  pntGroundTones(f, x0, y0, x1, y1);
  const tx0 = Math.floor(x0 / ATILE), ty0 = Math.floor(y0 / ATILE), tx1 = Math.ceil(x1 / ATILE) - 1, ty1 = Math.ceil(y1 / ATILE) - 1;
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) paintTileArt(f, tx, ty);
  paintGraft(f, tx0, ty0, tx1, ty1);
  tintRift(f, x0, y0, x1, y1);
  paintRockArea(f, x0, y0, x1, y1);
  pntComposite(f, x0, y0, x1, y1);
  // a fixed light whose sight reaches here sees its faces now (shadow.js)
  for (const [key, e] of _bakedSights.map) {
    if ((e.x0 + e.w) * LC < x0 || e.x0 * LC > x1 || (e.y0 + e.w) * LC < y0 || e.y0 * LC > y1) continue;
    _bakedSights.map.delete(key); S.stale = true;
  }
}
// Paints the chunks over floor px x0..x1, y0..y1 not yet painted, nearest
// the middle first; with a budget (ms), stops once it's spent. Returns
// true once they're all painted.
function pntEnsure(f, x0, y0, x1, y1, budget) {
  const S = View.pnt;
  if (!S || S.f !== f || !S.left) return true;
  const i0 = Math.max(0, Math.floor(x0 / PNT_CH)), i1 = Math.min(S.nx - 1, Math.floor((x1 - 1) / PNT_CH)), j0 = Math.max(0, Math.floor(y0 / PNT_CH)), j1 = Math.min(S.ny - 1, Math.floor((y1 - 1) / PNT_CH));
  const ci = (i0 + i1) / 2, cj = (j0 + j1) / 2, todo = [];
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (!S.done[j * S.nx + i]) todo.push([(i - ci) ** 2 + (j - cj) ** 2, i, j]);
  if (!todo.length) return true;
  todo.sort((a, b) => a[0] - b[0]);
  const t0 = performance.now();
  for (const [, i, j] of todo) {
    if (budget !== undefined && performance.now() - t0 > budget) return false;
    pntPaintChunk(f, i, j);
  }
  return true;
}
// Before a frame (render.js): what's in view and near it now, what's
// further out as time allows; and once it's quiet, the floor's lights
// baked again if chunks were painted since (their faces now known).
function pntFrame(f, camX, camY) {
  const L = T.paint.lazy, m1 = L.near * ATILE, m2 = L.far * ATILE;
  pntEnsure(f, camX - m1, camY - m1, camX + View.w + m1, camY + View.h + m1);
  const all = pntEnsure(f, camX - m2, camY - m2, camX + View.w + m2, camY + View.h + m2, L.budget);
  const S = View.pnt;
  if (S && S.stale && all) { S.stale = false; View.bakedFrom = null; }
}
// After the rock changes at x0..x1, y0..y1 (mining), its heights have been
// worked out again (pntHeights, the same box and m about it) and the
// ground's tiles under all it lifts painted again: the rock layer over
// everything they lift.
function pntRepaintRock(f, x0, y0, x1, y1) {
  const maxH = pntMaxLift(), Wl = T.paint.wall, m = Math.max(Wl.edge, Wl.ramp) + 2;
  const rx0 = x0 - m, ry0 = y0 - m - maxH, rx1 = x1 + m, ry1 = y1 + m;
  paintRockArea(f, rx0, ry0, rx1, ry1);
  pntComposite(f, rx0, ry0, rx1, ry1);
  View.occCache = new Map();
  return { x0: rx0, y0: ry0, x1: rx1, y1: ry1 };
}

// ---- occlusion -------------------------------------------------------------
// Draws the rock back over whatever was just drawn in the view's box x, y,
// w, h (view px) whose feet are on view row fy: every rock pixel there that
// stands on a floor row south of the feet, in both layers (so a glow behind
// the rock is hidden too). ox, oy: the camera's offset. Kept for a box that
// hasn't moved.
function paintOcclude(x, y, w, h, fy, ox, oy) {
  const f = View.floorFor;
  if (!View.rockLift || !f || T.paint.occlude === false) return;
  const W = f.w * ATILE, Hp = f.h * ATILE, F = fy - oy;
  let fx0 = x - ox, fy0 = y - oy, fx1 = fx0 + w, fy1 = fy0 + h;
  fx0 = Math.max(0, fx0); fy0 = Math.max(0, fy0); fx1 = Math.min(W, fx1); fy1 = Math.min(Hp, fy1);
  if (fx1 <= fx0 || fy1 <= fy0 || x + w < 0 || y + h < 0 || x > View.w || y > View.h) return;
  // anything in front at all?
  const B = View.rockBlk, bw = Math.ceil(W / PNT_BLK);
  let any = false;
  for (let by = Math.floor(fy0 / PNT_BLK); by * PNT_BLK < fy1 && !any; by++) for (let bx = Math.floor(fx0 / PNT_BLK); bx * PNT_BLK < fx1; bx++) if (B[by * bw + bx] > F + 1) { any = true; break; }
  if (!any) return;
  const key = fx0 + ',' + fy0 + ',' + fx1 + ',' + fy1 + ',' + F, cache = View.occCache;
  let c = cache.get(key);
  if (c === undefined) {
    const cw = fx1 - fx0, chh = fy1 - fy0, LF = View.rockLift, src = View.rockBuf.col32;
    const img = new ImageData(cw, chh), d32 = new Uint32Array(img.data.buffer);
    let n = 0;
    for (let yy = 0; yy < chh; yy++) {
      const ry = fy0 + yy;
      for (let xx = 0, k = ry * W + fx0; xx < cw; xx++, k++) { const l = LF[k]; if (l && ry + l - 1 > F) { d32[yy * cw + xx] = src[k]; n++; } }
    }
    c = null;
    if (n) { const [cv, cx] = makeCanvas(cw, chh); cx.putImageData(img, 0, 0); c = cv; }
    if (cache.size > 96) cache.clear();
    cache.set(key, c);
  }
  if (!c) return;
  const dx = fx0 + ox, dy = fy0 + oy;
  View.ctx.drawImage(c, dx, dy);
  const ex = View.emCtx;
  ex.globalCompositeOperation = 'destination-out';
  ex.drawImage(c, dx, dy);
  ex.globalCompositeOperation = 'source-over';
}
// The rock over an actor of the frame (render.js's sorted list), by its
// kind's size; hanging plants belong to the rock and aren't covered.
function paintOccludeActor(a, ox, oy) {
  if (!View.rockLift || a.top || a.hidden) return;
  const fx = Math.round(a.x * AP) + ox, fy = Math.round(a.y * AP) + oy;
  let hw = 26, h = 66;
  if (a.piece) { const s = floraSprite(a.set, a.piece, 0); hw = (s.w >> 1) + 6; h = s.h + 4; }
  else if (a.strip) { hw = 30; h = 30; }
  else if (a.boss || a.type === 'keeper' || a.type === 'hollow') { hw = 60; h = 120; }
  else if (a.portal || a.wprop || a.wreck || a.tent !== undefined) { hw = 40; h = 96; }
  paintOcclude(fx - hw, fy - h, hw * 2, h + 4, fy, ox, oy);
}

// ---- sprites ---------------------------------------------------------------
// The painted sprite builder: shapes shaded in short strokes, then the
// features set by hand, with no outline. PntSpr(w, h) holds a colour and
// a glow flag a pixel. ell: a shaded dome (its value from a sphere's
// normal against the light from the upper left, laid on a ramp in short
// runs); limb: a tapered limb through points, its lit edge, middle and
// shadow edge each a colour; poly: a filled polygon; px: one pixel. Ramps
// are lists of hex colours, dark to light. done() makes the sprite: { c,
// ec, w, h } as drawArtSprite wants it.
class PntSpr {
  constructor(w, h, seed = 1) { this.w = w; this.h = h; this.c = new Array(w * h).fill(null); this.g = new Uint8Array(w * h); this.seed = seed; this.n = 0; }
  rnd() { return artHash(this.n++, 17, this.seed); }
  px(x, y, col, glow) {
    x = Math.round(x); y = Math.round(y);
    if (col == null || x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.c[y * this.w + x] = col; this.g[y * this.w + x] = glow ? 1 : 0;
  }
  get(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? null : this.c[y * this.w + x]; }
  ell(cx, cy, rx, ry, ramp, o = {}) {
    const lo = o.lo || 0, hi = o.hi === undefined ? ramp.length - 1 : o.hi, bias = o.bias || 0, jit = o.jit === undefined ? 0.25 : o.jit, lx = -0.55, ly = -0.8;
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
      let run = 0, rt = 0;
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
        const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry, d = u * u + v * v;
        if (d > 1 || (o.mask && !o.mask(x, y))) continue;
        const nz = Math.sqrt(Math.max(0, 1 - d)), s = (-(u * lx + v * ly) * 0.8 + nz * 0.5 - 0.15 + bias);
        if (run <= 0) { rt = (this.rnd() + this.rnd() - 1) * jit * 1.7; run = 2 + ((this.rnd() * 3) | 0); }
        run--;
        const t = lo + (hi - lo) * Math.max(0, Math.min(1, s));
        this.px(x, y, ramp[Math.max(lo, Math.min(hi, Math.round(t + rt)))], o.glow);
      }
    }
  }
  // a rounded box (a body part seen square on), shaded like ell
  box(x0, y0, x1, y1, ramp, o = {}) { this.ell((x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2 + 0.5, (y1 - y0) / 2 + 0.5, ramp, Object.assign({ mask: (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1 }, o)); this.fillBox(x0, y0, x1, y1, ramp, o); }
  fillBox(x0, y0, x1, y1, ramp, o) {
    // corners the ellipse missed: its nearest tone
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (this.get(x, y) == null || o.over) {
      if (this.get(x, y) != null) continue;
      const u = (x + 0.5 - (x0 + x1 + 1) / 2) / ((x1 - x0 + 1) / 2), v = (y + 0.5 - (y0 + y1 + 1) / 2) / ((y1 - y0 + 1) / 2);
      if ((u < -0.6 && v < -0.6) || (u > 0.6 && v < -0.6) || (u < -0.6 && v > 0.6) || (u > 0.6 && v > 0.6)) continue;
      this.px(x, y, ramp[o.lo || 0]);
    }
  }
  limb(pts, w0, w1, col) {
    let tot = 0;
    const seg = [];
    for (let i = 1; i < pts.length; i++) { const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(L); tot += L; }
    let acc = 0;
    for (let s = 0; s < seg.length; s++) {
      const a = pts[s], b = pts[s + 1], L = seg[s] || 1e-6, n = Math.max(2, Math.ceil(L * 3)), dx = (b[0] - a[0]) / L, dy = (b[1] - a[1]) / L, nx = -dy, ny = dx;
      for (let i = 0; i <= n; i++) {
        const t = (acc + (L * i) / n) / (tot || 1), w = w0 + (w1 - w0) * t, px = a[0] + (b[0] - a[0]) * (i / n), py = a[1] + (b[1] - a[1]) * (i / n);
        const m = Math.max(1, Math.round(w * 2) + 1);
        for (let k = 0; k < m; k++) {
          const sv = -w / 2 + (w * k) / Math.max(1, m - 1), lit = (nx * sv) * -0.55 + (ny * sv) * -0.8 > 0;
          const side = Math.abs(sv) < w / 4 ? 0 : lit ? -1 : 1;
          this.px(px + nx * sv, py + ny * sv, col(t, side));
        }
      }
      acc += L;
    }
  }
  poly(pts, col) {
    let y0 = Infinity, y1 = -Infinity;
    for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
      const yc = y + 0.5, xs = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] <= yc && yc < b[1]) || (b[1] <= yc && yc < a[1])) xs.push(a[0] + ((yc - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.ceil(xs[i] - 0.5); x <= Math.floor(xs[i + 1] - 0.5); x++) this.px(x, y, typeof col === 'function' ? col(x, y) : col);
    }
  }
  // flipped left to right
  flip() { const s = new PntSpr(this.w, this.h, this.seed); for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) { s.c[y * this.w + x] = this.c[y * this.w + this.w - 1 - x]; s.g[y * this.w + x] = this.g[y * this.w + this.w - 1 - x]; } return s; }
  done() {
    const P = pixBuf(this.w, this.h);
    for (let i = 0; i < this.c.length; i++) {
      const col = this.c[i];
      if (col == null) continue;
      const [r, g, b] = rgbOf(col), k = i * 4;
      P.col[k] = r; P.col[k + 1] = g; P.col[k + 2] = b; P.col[k + 3] = 255;
      if (this.g[i]) { P.em[k] = r; P.em[k + 1] = g; P.em[k + 2] = b; P.em[k + 3] = 255; }
    }
    return spriteFromBuf(P);
  }
}
