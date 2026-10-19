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
// A floor is painted in two layers, cached like the old floor and painted
// lazily, a chunk at a time, as the view nears it: the ground (every
// tile's, through paintCaveTile and pntGroundTones) and over it the rock
// (View.rockBuf, transparent where the ground shows), laid together into
// the floor's own buffers (View.floorCol/floorEm), so a frame still draws
// the floor as one picture. For each pixel of rock, View.rockLift holds how
// far its surface point is lifted (its footprint row less the row it's
// drawn on, plus 1; 0 for ground), and so which floor row it stands on: a
// sprite whose feet are north of that row is behind it, and paintOcclude
// draws the rock back over it. The footprint (View.rockPx, the smooth wall
// line) is unchanged, as are collision and generation.
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
// A ramp of n tones evenly spaced in lightness along a path from soot (the
// first anchor drawn towards a violet black by P.deep) through the anchors
// (dark to light) to a light (the last drawn towards `light` by P.high), so
// neighbouring tones are always a visible step apart. P.gamma > 1 puts more
// of them in the darks.
function pntRampEven(anchors, n, P, light = PNT_WARM) {
  const path = [pntMixRgb(anchors[0], PNT_DEEP, P.deep)].concat(anchors, [pntMixRgb(anchors[anchors.length - 1], light, P.high)]), pts = [];
  for (let i = 0; i + 1 < path.length; i++) for (let s = 0; s < 16; s++) pts.push(pntMixRgb(path[i], path[i + 1], s / 16));
  pts.push(path[path.length - 1]);
  // (lightness along it, never falling)
  const L = [];
  let m = -1;
  for (const c of pts) { m = Math.max(m, pntLum(c)); L.push(m); }
  const L0 = L[0], L1 = L[L.length - 1], out = [];
  for (let k = 0, j = 0; k < n; k++) {
    const want = L0 + (L1 - L0) * Math.pow(k / (n - 1), P.gamma);
    while (j < L.length - 2 && L[j + 1] < want) j++;
    const u = L[j + 1] > L[j] ? Math.min(1, Math.max(0, (want - L[j]) / (L[j + 1] - L[j]))) : 0;
    out.push(pntMixRgb(pts[j], pts[j + 1], u));
  }
  return out;
}
// A ramp lifted for a dark place (lift 0..1): each tone raised by more the
// lighter it is (its share u of the way up the ramp, so the soot stays
// soot), so the strokes and lit edges still read once the place's dim
// light has been multiplied over them (L: [how much a full lift raises
// the lightest, the power of u]).
function pntLiftRamp(ramp, lift, L) {
  if (!(lift > 0)) return ramp;
  return ramp.map((c, k) => {
    const u = k / (ramp.length - 1), m = 1 + lift * L[0] * Math.pow(u, L[1]), top = Math.max(c[0], c[1], c[2], 1);
    return c.map((v) => v * Math.min(m, 255 / top));
  });
}
// A look's ramps (b: a floor look, ART.biomes' shape), worked out once for
// each lift: ground (7 tones from its floor's three) and rock (10, from its
// rock's three dark tones and its face's three, sorted by lightness, lit
// towards its rim colour), each evenly spaced in lightness (pntRampEven)
// and lifted as dark as the floor being painted is (View.pntLift).
const _pntLooks = new WeakMap();
function pntLook(b, lift = View.pntLift || 0) {
  let M = _pntLooks.get(b);
  if (!M) _pntLooks.set(b, (M = new Map()));
  const key = Math.round(lift * 20);
  let L = M.get(key);
  if (L) return L;
  lift = key / 20;
  const R = T.paint.rampEven, g = (b.sun ? calmRgb(b.floor) : rampRgb(b.floor)).slice(0, 3);
  const rk = rampRgb(b.rock), fr = rampRgb(b.front);
  const rock = rk.slice(0, 3).concat(fr.slice(0, 3)).sort((p, q) => pntLum(p) - pntLum(q));
  const ground = pntLiftRamp(pntRampEven(g, 7, R.ground), lift, R.liftGround);
  const rr = pntRockUnder(pntLiftRamp(pntRampEven(rock, 10, R.rock, rk[3]), lift, R.liftRock), ground);
  L = { ground: Uint32Array.from(ground.map(pntU32)), rock: Uint32Array.from(rr.map(pntU32)), groundRgb: ground, rockRgb: rr };
  M.set(key, L);
  return L;
}
// Walls read as walls: a rock's tops (its middle tone) are kept to at most
// T.paint.rampEven.under[0] of the ground's middle tone, its tones darkened
// to fit, less towards the top of the ramp, and its lips and rims (from
// tone under[1] up) not at all, so a wall stands dark with lit edges
// wherever a clime's rock and floor colours are close.
function pntRockUnder(rock, ground) {
  const U = T.paint.rampEven.under, k = pntLum(rock[4]) / Math.max(1, pntLum(ground[3]));
  if (k <= U[0]) return rock;
  const s = U[0] / k;
  return rock.map((c, i) => { const t = Math.min(1, Math.max(0, (i - 4) / (U[1] - 4))), m = i <= 4 ? s : s + (1 - s) * t * t; return c.map((v) => v * m); });
}
// How dark the floor being painted will be lit, 0 (daylight) to 1 (a deep
// cave): from the place's ambient light as the frame will work it out.
function pntDarkness(f) {
  const d = Game.dive, P = T.paint.rampEven.darkAt;
  if (!d || d.floor !== f) return 0;
  const lv = lampLevels(d), a = lv.amb * Math.max(lv.tint[0], lv.tint[1], lv.tint[2]);
  return Math.max(0, Math.min(1, (P[0] - a) / (P[0] - P[1])));
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
  // (the sinkhole is no wall: it falls away, painthole.js)
  // (what stands on it: its contact, sun and fixed lights' shadows, pshadow.js)
  const SHD = pshShadeFor(f);
  const pit = View.pitPx, rk = (x, y) => x < 0 || y < 0 || x >= W || y >= Hp || (R[y * W + x] === 1 && !(pit && pit[y * W + x]));
  for (let i = 0; i < n; i++) { let k = F + 1; for (let j = 1; j <= F; j++) if (rk(ax + i, y0 - j)) { k = j - 1; break; } since[i] = k; }
  for (let y = y0; y < y1; y++) {
    pntNoiseRow(n1, ax, n, y, G.swell, G.swell, seedH + 21);
    pntNoiseRow(n2, ax, n, y, G.patch[0], G.patch[1], seedH + 22);
    pntNoiseRow(n3, ax, n, y, G.patch[0] * 0.45, G.patch[1] * 0.6, seedH + 23);
    artClumpRow(cl, ax, n, y, seedH);
    const row = y * W;
    for (let i = 0; i < n; i++) {
      const x = ax + i, here = x < 0 || x >= W || (R[row + x] === 1 && !(pit && pit[row + x]));
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
      if (SHD && !here) val -= SHD[row + x] / 255;
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
// The sinkhole is not rock here: it falls away (painthole.js, phlPaintPit).
function pntMaxLift() { const W = T.paint.wall; return W.face + W.bump + 1; }
function pntIsRockPx(f, R, W, x, y) {
  if (!R[y * W + x]) return false;
  const P = View.pitPx;
  return !(P && P[y * W + x]);
}
// The boulders: one a cell of a grid Bo px across (T.paint.wall.boulder),
// each a dome, rounder or flatter-topped: its middle, 1 / its radii, its
// height (a share of bump) and how flat its top. pntBoulderAt: the heap's
// height at a floor point (0..1, the highest dome there).
function pntBoulder(I, J, seed, o) {
  const Wl = T.paint.wall, Bo = Wl.boulder, rx = Bo * (Wl.boulderR[0] + (Wl.boulderR[1] - Wl.boulderR[0]) * artHash(I, J, seed + 53));
  o[0] = (I + 0.2 + 0.6 * artHash(I, J, seed + 51)) * Bo; o[1] = (J + 0.2 + 0.6 * artHash(I, J, seed + 52)) * Bo;
  o[2] = 1 / rx; o[3] = 1 / (rx * (0.7 + 0.35 * artHash(I, J, seed + 54)));
  o[4] = 0.55 + 0.45 * artHash(I, J, seed + 55); o[5] = 1 + Wl.boulderFlat * artHash(I, J, seed + 56);
  return o;
}
const _pntBo = new Float32Array(6);
function pntBoulderAt(x, y, seed) {
  const Bo = T.paint.wall.boulder, gx = Math.floor(x / Bo), gy = Math.floor(y / Bo), o = _pntBo;
  let bv = 0;
  for (let j = gy - 1; j <= gy + 1; j++) for (let i = gx - 1; i <= gx + 1; i++) {
    pntBoulder(i, j, seed, o);
    const dx = (x - o[0]) * o[2], dy = (y - o[1]) * o[3], e = 1 - dx * dx - dy * dy;
    if (e > 0) { const v = o[4] * Math.sqrt(e * o[5] < 1 ? e * o[5] : 1); if (v > bv) bv = v; }
  }
  return bv;
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
  const seed = (f.seed ^ f.depth) | 0, bs = Wl.bumpScale, row2 = new Float32Array(x1 - x0), edge = Wl.edge, face = Wl.face, bmp = Wl.bump, ramp = Wl.ramp;
  // the boulders: one a cell of a grid Bo px across, each a dome (rounder
  // or flatter-topped), so a rock is a heap of distinct masses with creases
  // where they meet
  const Bo = Wl.boulder, gx0 = Math.floor(x0 / Bo) - 1, gx1 = Math.floor((x1 - 1) / Bo) + 1, gy0 = Math.floor(y0 / Bo) - 1, gy1 = Math.floor((y1 - 1) / Bo) + 1, gw = gx1 - gx0 + 1, gh = gy1 - gy0 + 1;
  const BX = new Float32Array(gw * gh), BY = new Float32Array(gw * gh), BRX = new Float32Array(gw * gh), BRY = new Float32Array(gw * gh), BH = new Float32Array(gw * gh), BK = new Float32Array(gw * gh), bo = _pntBo;
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const o = j * gw + i;
    pntBoulder(gx0 + i, gy0 + j, seed, bo);
    BX[o] = bo[0]; BY[o] = bo[1]; BRX[o] = bo[2]; BRY[o] = bo[3]; BH[o] = bo[4]; BK[o] = bo[5];
  }
  for (let y = Math.max(0, y0); y < Math.min(Hp, y1); y++) {
    pntNoiseRow(row2, x0, x1 - x0, y, bs * 0.45, bs * 0.4, seed + 42);
    const gy = Math.floor(y / Bo) - gy0;
    for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) {
      const dd = D[(y - wy0 + 1) * pw + x - wx0 + 1], k = y * W + x;
      if (!dd) { H[k] = 0; HF[k] = 0; continue; }
      const d = (dd < C ? dd : C) * 0.2, u = d < edge ? d / edge : 1, rise = 1 - (1 - u) * (1 - u);
      let bv = 0;
      for (let j = gy - 1; j <= gy + 1; j++) for (let i = Math.floor(x / Bo) - gx0 - 1, ie = i + 2; i <= ie; i++) {
        const o = j * gw + i, dx = (x - BX[o]) * BRX[o], dy = (y - BY[o]) * BRY[o], e = 1 - dx * dx - dy * dy;
        if (e > 0) { const v = BH[o] * Math.sqrt(e * BK[o] < 1 ? e * BK[o] : 1); if (v > bv) bv = v; }
      }
      const hf = face * rise + bmp * (bv * (1 - Wl.rough) + row2[x - x0] * Wl.rough) * (d < ramp ? d / ramp : 1), q = hf < 1 ? 1 : hf;
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
  // what grows on it, and a tear's tint (paintrock.js)
  pnrRockGrowth(f, x0, y0, x1, y1);
  pnrTintRock(f, x0, y0, x1, y1);
  // (the march reset the lifts round the area too, so what the rock carries
  // there is laid again, as it was)
  pntRockDecor(f, mx0, my0, mx1, my1);
  pntRockBlocks(f, mx0, my0, mx1, my1);
}

// The rock's slabs: cells in the view's own px, wider than tall, each a
// tone of its own, with a lit lip along its top and a dark crack under it.
// The cell of a pixel: the nearest of the jittered points about it, their
// borders wobbled by noise. Fills cell (rw × ch, rows from y0 - sp) for
// the rock pixels only (-1 elsewhere).
function pntSlabs(cell, x0, y0, rw, ch, sp, seed, mason) {
  if (mason) { pntBlocks(cell, x0, y0, rw, ch, sp, seed); return; }
  const S = T.paint.slab, cw = S.w, chh = S.h, LF = View.rockLift, W = View.floorBuf.w, Hp = View.floorBuf.h;
  const gx0 = Math.floor(x0 / cw) - 1, gx1 = Math.floor((x0 + rw) / cw) + 1, gy0 = Math.floor((y0 - sp) / chh) - 1, gy1 = Math.floor((y0 - sp + ch) / chh) + 1;
  const gw = gx1 - gx0 + 1, gh = gy1 - gy0 + 1, PX = new Float32Array(gw * gh), PY = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) { const I = gx0 + i, J = gy0 + j; PX[j * gw + i] = (I + artHash(I, J, seed) + (J & 1) * 0.5) * cw; PY[j * gw + i] = (J + artHash(I, J, seed + 1)) * chh; }
  const wob = new Float32Array(rw), icw = 1 / cw, ich = 1 / chh, CX = new Float32Array(9), CY = new Float32Array(9), CI = new Int32Array(9);
  // the big planes: where a broad noise is high, the cells are a coarser
  // grid's (S.big), so a mass has a few big planes among smaller facets
  const B = S.big, bw = cw * B.k[0], bh = chh * B.k[1], ibw = 1 / bw, ibh = 1 / bh, big = new Float32Array(rw);
  const bx0 = Math.floor(x0 * ibw) - 1, by0 = Math.floor((y0 - sp) * ibh) - 1, bgw = Math.floor((x0 + rw) * ibw) + 2 - bx0, bgh = Math.floor((y0 - sp + ch) * ibh) + 2 - by0, BXs = new Float32Array(bgw * bgh), BYs = new Float32Array(bgw * bgh);
  for (let j = 0; j < bgh; j++) for (let k = 0; k < bgw; k++) { const J = by0 + j, K = bx0 + k; BXs[j * bgw + k] = (K + artHash(K, J, seed + 5) + (J & 1) * 0.5) * bw; BYs[j * bgw + k] = (J + artHash(K, J, seed + 6)) * bh; }
  for (let r = 0; r < ch; r++) {
    const y = y0 - sp + r;
    if (y < 0 || y >= Hp) { cell.fill(-1, r * rw, r * rw + rw); continue; }
    pntNoiseRow(wob, x0, rw, y, 5, 3, seed + 7);
    pntNoiseRow(big, x0, rw, y, B.s[0], B.s[1], seed + 9);
    const gy = Math.floor(y / chh), row = y * W, out = r * rw;
    let gxl = -1e9;
    for (let i = 0; i < rw; i++) {
      const x = x0 + i;
      if (!LF[row + x]) { cell[out + i] = -1; continue; }
      if (big[i] > B.cut) {
        // (the coarse grid's nearest point, its own ids)
        const bgx = Math.floor(x * ibw), bgy = Math.floor(y * ibh);
        let best = 1e9, id = 0;
        for (let j = bgy - 1; j <= bgy + 1; j++) for (let k = bgx - 1; k <= bgx + 1; k++) {
          const o = (j - by0) * bgw + k - bx0, dx = (x - BXs[o]) * ibw, dy = (y - BYs[o]) * ibh, d = dx * dx + dy * dy * (1 + (wob[i] - 0.5) * S.wobble);
          if (d < best) { best = d; id = PNT_BIGID + j * 4099 + k + 1; }
        }
        cell[out + i] = id;
        continue;
      }
      const gx = Math.floor(x * icw), wb = 1 + (wob[i] - 0.5) * S.wobble;
      if (gx !== gxl) {
        // the nine points about this column of cells, as distances in y
        gxl = gx;
        for (let c = 0, j = gy - 1; j <= gy + 1; j++) for (let k = gx - 1; k <= gx + 1; k++, c++) { const o = (j - gy0) * gw + k - gx0; CX[c] = PX[o]; CY[c] = (y - PY[o]) * ich; CI[c] = (j * 4099 + k + 1) | 0; }
        for (let c = 0; c < 9; c++) CY[c] = CY[c] * CY[c];
      }
      let best = 1e9, id = 0;
      for (let c = 0; c < 9; c++) { const dx = (x - CX[c]) * icw, d = dx * dx + CY[c] * wb; if (d < best) { best = d; id = CI[c]; } }
      cell[out + i] = id;
    }
  }
}
// Masonry (a ruin's rock, T.paint.slab.mason): the cells are dressed
// blocks laid in courses, each course's joints shifted along by half a
// block and a little more, the blocks of a course a little uneven.
function pntBlocks(cell, x0, y0, rw, ch, sp, seed) {
  const M = T.paint.slab.mason, LF = View.rockLift, W = View.floorBuf.w, Hp = View.floorBuf.h;
  for (let r = 0; r < ch; r++) {
    const y = y0 - sp + r, out = r * rw;
    if (y < 0 || y >= Hp) { cell.fill(-1, out, out + rw); continue; }
    const J = Math.floor(y / M.h), off = (J & 1) * M.w * 0.5 + artHash(J, 5, seed) * M.jit, row = y * W;
    for (let i = 0; i < rw; i++) {
      const x = x0 + i;
      if (!LF[row + x]) { cell[out + i] = -1; continue; }
      const u = (x + off) / M.w;
      let I = Math.floor(u);
      // (an uneven joint: a block runs a little long or short)
      if (u - I < (artHash(I, J, seed + 3) - 0.5) * 0.3) I--;
      cell[out + i] = (J * 4099 + I + 1) | 0;
    }
  }
}
// A facet's site (pntSlabs' jittered point for cell id), in the view's px.
const PNT_BIGID = 1 << 26;
function pntSlabSite(id, seed, mason) {
  const S = T.paint.slab;
  if (!mason && id >= PNT_BIGID - (1 << 24)) {
    const q = id - PNT_BIGID, j = Math.floor(q / 4099), k = q - j * 4099 - 1, bw = S.w * S.big.k[0], bh = S.h * S.big.k[1];
    return [(k + artHash(k, j, seed + 5) + (j & 1) * 0.5) * bw, (j + artHash(k, j, seed + 6)) * bh];
  }
  const j = Math.floor(id / 4099), k = id - j * 4099 - 1;
  if (mason) { const M = S.mason; return [(k + 0.5) * M.w - (j & 1) * M.w * 0.5 - artHash(j, 5, seed) * M.jit, (j + 0.5) * M.h]; }
  return [(k + artHash(k, j, seed) + (j & 1) * 0.5) * S.w, (j + artHash(k, j, seed + 1)) * S.h];
}
// The look a graft brings (rifts.js), for its rock.
function pntGraftLook(f) {
  const g = f.graft;
  if (!g) return null;
  const id = T.biomes[g.biome].id;
  return CLIME_ART[g.clime] || (g.sky ? ART.surface[id] : ART.biomes[id]);
}
// The rock in strokes. Each pixel's tone comes from its surface point: as
// a top, its slope to the light from the upper left; as a face (steep),
// darker, rising a little up the face and lighter where it turns west; the
// two blended by how steep it is. The surface is cut into facets (slab
// cells in the view's px, T.paint.slab), each tilted its own way and
// flattened towards a broad slope (T.paint.facet), so a top reads as a few
// flat lit planes; each facet a tone of its own, bevelled light along its
// top, cracked dark along its foot (broken here and there). Then strata on
// the faces, soot in the creases where boulders meet, a lit rim along the
// silhouette and along a face's lip, soot at a face's foot.
function pntPaintRock(f, x0, y0, x1, y1) {
  const P = T.paint, Wl = P.wall, Rk = P.rock, Fc = P.facet, Sl = P.slab, HF = View.rockHf, LF = View.rockLift, Q = View.rockBuf, C32 = Q.col32, W = f.w * ATILE, Hp = f.h * ATILE;
  const b = artBiome(f), ramp = pntLook(b).rock, nt = ramp.length, seed = (f.seed ^ f.depth) | 0, rw = x1 - x0, rh = y1 - y0;
  const gl = pntGraftLook(f), gRamp = gl ? pntLook(gl).rock : null, g = f.graft, gcx = g ? (g.x + 0.5) * ATILE : 0, gcy = g ? (g.y + 0.5) * ATILE : 0, gR = g ? (g.r + 2) * ATILE : 0;
  const ll = Math.hypot(Rk.light[0], Rk.light[1], Rk.light[2]), lx = Rk.light[0] / ll, ly = Rk.light[1] / ll, lz = Rk.light[2] / ll;
  const hq = (x, y) => (x < 0 || y < 0 || x >= W || y >= Hp ? Wl.face : HF[y * W + x] / 16);
  const isRock = (x, y) => x >= 0 && y >= 0 && x < W && y < Hp && LF[y * W + x] > 0;
  // the facets, for the rows and a few either side, and the columns the
  // strokes read
  const sp = 4, ch = rh + 2 * sp, cx0 = x0 - 8, cw = rw + 16;
  if (_pntCell.length < cw * ch) _pntCell = new Int32Array(cw * ch);
  const cell = _pntCell;
  const mason = !!b.paving, Ms = Sl.mason;
  pntSlabs(cell, cx0, y0, cw, ch, sp, seed + 61, mason);
  // a rock pixel's tone before its stroke into tb, and how steep (0 a top,
  // 1 a face) into wb
  const s0 = Rk.steep[0], sk = 1 / (Rk.steep[1] - Rk.steep[0]), lamLo = Rk.lamLo, lamK = 1 / (1 - lamLo), topLo = Rk.topLo, topR = Rk.topHi - Rk.topLo, faceLo = Rk.faceLo, faceR = Rk.faceHi - Rk.faceLo;
  const fB = Rk.faceBase, fU = Rk.faceUp / Wl.face, fWst = Rk.faceWest, W2 = 2 * W, S = Fc.smooth, SW = S * W, iS = 1 / (32 * S), keep = Fc.keep, tilt = Fc.tilt * 2, rel = Fc.relief, flat = b.paving ? Sl.mason.flat : Fc.flat;
  // a surface point's (floor px x, sy) light as a top (0..1, its broad
  // slope tilted by tx, ty, to the light), how steep it is, and its tone
  const at = (x, sy, tx, ty, o) => {
    const k = sy * W + x;
    let h, hx, hy, hxs, hys;
    if (x >= S && x < W - S && sy >= S && sy < Hp - S) {
      h = HF[k] * 0.0625; hx = (HF[k + 2] - HF[k - 2]) * 0.015625; hy = (HF[k + W2] - HF[k - W2]) * 0.015625;
      hxs = (HF[k + S] - HF[k - S]) * iS; hys = (HF[k + SW] - HF[k - SW]) * iS;
    } else { h = hq(x, sy); hx = (hq(x + 2, sy) - hq(x - 2, sy)) * 0.25; hy = (hq(x, sy + 2) - hq(x, sy - 2)) * 0.25; hxs = hx; hys = hy; }
    let w = (-hy - s0) * sk;
    w = w <= 0 ? 0 : w >= 1 ? 1 : w * w * (3 - 2 * w);
    const gx = (hx * keep + hxs * (1 - keep) + tx) * rel, gy = (hy * keep + hys * (1 - keep) + ty) * rel;
    const lam = (-gx * lx - gy * ly + lz) / Math.sqrt(gx * gx + gy * gy + 1);
    let vt = (lam - lamLo) * lamK; vt = vt < 0 ? 0 : vt > 1 ? 1 : vt;
    let vf = fB + fU * (h < Wl.face ? h : Wl.face) + fWst * (hx < -1 ? -1 : hx > 1 ? 1 : hx); vf = vf < 0 ? 0 : vf > 1 ? 1 : vf;
    o[0] = (topLo + vt * topR) * (1 - w) + (faceLo + vf * faceR) * w; o[1] = w; o[2] = vt;
  };
  // each facet's own tone as a top: the boulders' slope under its site,
  // tilted its own way, so the facet reads as one flat plane. (From the
  // boulders alone, not the footprint, so mining leaves it be: the floor
  // point under the site is found as if a top stood there.)
  const facets = new Map(), tmp = [0, 0, 0], fseed = seed + 61, bk = Wl.bump * (1 - Wl.rough) * rel / (2 * S);
  const facetOf = (id) => {
    let v = facets.get(id);
    if (v !== undefined) return v;
    const [fx, fy] = pntSlabSite(id, fseed, mason);
    let y = fy + Wl.face + Wl.bump * 0.5;
    y = fy + Wl.face + Wl.bump * (1 - Wl.rough) * pntBoulderAt(fx, y, seed);
    const gx = (pntBoulderAt(fx + S, y, seed) - pntBoulderAt(fx - S, y, seed)) * bk + (artHash(id, 2, seed + 87) - 0.5) * tilt * rel;
    const gy = (pntBoulderAt(fx, y + S, seed) - pntBoulderAt(fx, y - S, seed)) * bk + (artHash(id, 3, seed + 87) - 0.5) * tilt * rel;
    const lam = (-gx * lx - gy * ly + lz) / Math.sqrt(gx * gx + gy * gy + 1);
    let vt = (lam - lamLo) * lamK; vt = vt < 0 ? 0 : vt > 1 ? 1 : vt;
    v = [topLo + vt * topR, vt];
    facets.set(id, v);
    return v;
  };
  let lastId = NaN, lastF = null;
  const look = (x, y, tb, wb, i, r) => {
    at(x, y + LF[y * W + x] - 1, 0, 0, tmp);
    let t = tmp[0], w = tmp[1], vt = tmp[2];
    // the facet's plane, where the pixel is the same kind (top or face)
    const id = cell[r * cw + i];
    if (id !== lastId) { lastId = id; lastF = facetOf(id); }
    const fv = lastF, k = flat * (1 - w);
    t = (fv[0] * (1 - w) + t * w) * k + t * (1 - k); vt = fv[1] * k + vt * (1 - k);
    tb[i] = t; wb[i] = w; lt[i] = vt;
  };
  const gate = new Float32Array(rw);
  const n = cw, mid = new Int16Array(n), jit = new Float32Array(n), lt = new Float32Array(n);
  let tb = new Float32Array(n), wb = new Float32Array(n), tbUp = new Float32Array(n), wbUp = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = cx0 + i; if (isRock(x, y0 - 1)) look(x, y0 - 1, tbUp, wbUp, i, sp - 1); else wbUp[i] = 0; }
  const cr = Rk.creaseR, crW = cr * W, crK = 0.0625 * 0.25;
  for (let y = y0; y < y1; y++) {
    const r = y - y0 + sp;
    for (let i = 0; i < n; i++) { const x = cx0 + i; if (isRock(x, y)) look(x, y, tb, wb, i, r); else wb[i] = -1; }
    pntStrokeRow(mid, jit, cx0, n, y, seed + 71);
    pntNoiseRow(gate, x0, rw, y, Sl.gateS[0], Sl.gateS[1], seed + 85);
    const off = (artHash(y, 3, seed) * 16) | 0;
    let stS = -1e9, stX = 0, stL = 0, stA = 0, slId = -2, slT = 0;
    for (let x = x0; x < x1; x++) {
      const i = x - cx0;
      if (wb[i] < 0) continue;
      const sy = y + LF[y * W + x] - 1, face = wb[i] > 0.5, m = mid[i];
      // the stroke's tone, from its middle if that's rock too
      let t = (wb[m] >= 0 ? tb[m] : tb[i]) + jit[i] * Rk.jitter;
      // strata on the faces: long strokes a shade or two off
      if (face) {
        const sc = (x + off) >> 4;
        if (sc !== stS) {
          stS = sc; stA = 0;
          if (artHash(sc, y, seed + 81) < Rk.strata) { stX = sc * 16 - off + ((artHash(sc, y, seed + 82) * 8) | 0); stL = 4 + ((artHash(sc, y, seed + 83) * 12) | 0); stA = artHash(sc, y, seed + 84) < 0.6 ? -Rk.strataAmt : Rk.strataAmt * 0.6; }
        }
        if (stA && x >= stX && x < stX + stL) t += stA;
      }
      // the facet: a tone of its own; bevelled light along its top, a crack
      // along its foot and now and then down its right side
      const cj = r * cw + i, id = cell[cj];
      if (id !== slId) { slId = id; slT = (artHash(id, 1, seed + 86) - 0.5) * 2 * (mason ? Ms.tone : Sl.tone); if (mason && artHash(id, 6, seed + 86) < Ms.gone) slT = -3; }
      t += slT;
      // (the cracks come in broken lengths: a gate of noise stretched
      // across, the same for the crack and the bevel under it)
      const gt = gate[x - x0], upD = cell[cj - cw] !== id && isRock(x, y - 1), dnD = cell[cj + cw] !== id && isRock(x, y + 1);
      if (gt > (mason ? Ms.gate : id >= PNT_BIGID - (1 << 24) ? Sl.big.gate : Sl.gate)) {
        if (dnD) t = Math.min(t, Sl.crack + (face ? 0 : 1));
        else if (upD) t += Sl.lip;
        else if (cell[cj + 1] !== id && cell[cj + 1] >= 0 && artHash(id, 4, seed + 89) < (mason ? Ms.side : Sl.side)) t = Math.min(t, Sl.crack + (mason ? 0 : 1));
      }
      // a crease where the rock folds (where two boulders meet): hard soot
      if (!face && x >= cr && x < W - cr && sy >= cr && sy < Hp - cr) {
        const ks = sy * W + x, cav = (HF[ks] * 4 - HF[ks - cr] - HF[ks + cr] - HF[ks - crW] - HF[ks + crW]) * crK;
        if (cav < -Rk.crease) t = Math.min(t, cav < -Rk.crease * 1.8 ? 0 : 1);
      }
      // the silhouette's top edge, lit; the lip where a top turns down
      // into a face, lit; the face's foot on the ground, soot
      if (!isRock(x, y - 1)) t = lt[i] > Rk.rimLit ? Math.max(t, Rk.rim) : t + 1;
      else if (face && wbUp[i] < 0.3) t = Math.max(t, Rk.lip);
      if (!isRock(x, y + 1)) t = Math.min(t, Rk.foot);
      else if (!isRock(x, y + 2)) t = Math.min(t, Rk.foot + 1);
      t = Math.round(t);
      const rp = gRamp && Math.abs(x - gcx) < gR && Math.abs(sy - gcy) < gR && graftAt(f, (x + 0.5) / AP - 0.5, (sy + 0.5) / AP - 0.5) ? gRamp : ramp;
      C32[y * W + x] = rp[t < 0 ? 0 : t > nt - 1 ? nt - 1 : t];
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
    // (ore is painted in pflora.js)
    if (t === TILE_ORE) { pflOreTile(f, tx, ty, (x, y) => on(x, y, ty), x0, y0, x1, y1); continue; }
    _tileSeed = hashInts(f.seed, f.depth, tx, ty, 0x0e5) | 0;
    const rnd = tileRnd;
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
const R1 = (R, W, x, y) => R[y * W + x] === 1;
// One pixel of the rock layer, standing on floor row fy.
function pntPut(Q, LF, W, x, y, c, glow, fy) {
  const k = y * W + x;
  Q.col32[k] = (0xff000000 | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0;
  if (glow) { const e = k * 4; Q.em[e] = c[0]; Q.em[e + 1] = c[1]; Q.em[e + 2] = c[2]; Q.em[e + 3] = 255; } else Q.em[k * 4 + 3] = 0;
  LF[k] = Math.max(1, Math.min(255, fy - y + 1));
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
  // (painted for the light it will be seen in: pntLook)
  View.pntLift = pntDarkness(f);
  View.rockH = new Uint8Array(W * Hp);
  View.rockHf = new Uint16Array(W * Hp);
  View.groundTone = new Uint8Array(W * Hp);
  View.rockLift = new Uint8Array(W * Hp);
  View.rockBlk = new Int16Array(Math.ceil(W / PNT_BLK) * Math.ceil(Hp / PNT_BLK));
  View.rockBuf = pixBuf(W, Hp);
  View.rockBuf.col32 = new Uint32Array(View.rockBuf.col.buffer);
  // the sinkhole's pixels, which never rise: 2 for the hole itself (an
  // organic, broken edge: the pit's share of the tiles round a pixel,
  // blended as the wall line is, plus noise, on the rock side of the wall
  // line), 1 for the ground of its rim where the wall line runs between it
  // and open ground (painted as ground: phlPaintPit)
  let pit = null;
  const PN = T.paint.hole.pitEdge, isPit = (i, j) => (floorTile(f, i, j) === TILE_PIT ? 1 : 0);
  for (let ty = 0; ty < f.h; ty++) for (let tx = 0; tx < f.w; tx++) if (f.tiles[ty * f.w + tx] === TILE_PIT) {
    pit = pit || new Uint8Array(W * Hp);
    for (let y = ty * ATILE - ATILE / 2; y < (ty + 1.5) * ATILE; y++) for (let x = tx * ATILE - ATILE / 2; x < (tx + 1.5) * ATILE; x++) {
      if (x < 0 || y < 0 || x >= W || y >= Hp || pit[y * W + x]) continue;
      const gx = Math.floor(x / ATILE - 0.5), gy = Math.floor(y / ATILE - 0.5), u = x / ATILE - 0.5 - gx, v = y / ATILE - 0.5 - gy;
      let p = 0, r = 0;
      for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const t = floorTile(f, gx + i, gy + j); if (t === TILE_PIT) p++; else if (TILE_SOLID[t]) r++; }
      const share = (isPit(gx, gy) * (1 - u) + isPit(gx + 1, gy) * u) * (1 - v) + (isPit(gx, gy + 1) * (1 - u) + isPit(gx + 1, gy + 1) * u) * v;
      const e = share + (pntNoise(x, y, PN[0], PN[1], f.seed + 91) - 0.5) * PN[2] + (pntNoise(x, y, PN[3], PN[4], f.seed + 92) - 0.5) * PN[5];
      if (e > 0.5 && View.rockPx[y * W + x] === 1) pit[y * W + x] = 2;
      else if (p && !r) pit[y * W + x] = 1;
    }
  }
  View.pitPx = pit;
  View.occCache = new Map(); View.pnrTiles = null;
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
// Which heights a repaint changes: pntHfWatch keeps a copy of the window's
// heights before; pntHfChanged then gives the box of those that changed
// (x1, y1 past its end), or null if none did.
let _pntHfOld = new Uint16Array(0);
function pntHfWatch(f, x0, y0, x1, y1) {
  const W = f.w * ATILE, Hp = f.h * ATILE, HF = View.rockHf;
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W, x1); y1 = Math.min(Hp, y1);
  const w = Math.max(0, x1 - x0), h = Math.max(0, y1 - y0);
  if (_pntHfOld.length < w * h) _pntHfOld = new Uint16Array(w * h);
  for (let y = 0; y < h; y++) _pntHfOld.set(HF.subarray((y0 + y) * W + x0, (y0 + y) * W + x1), y * w);
  return { x0, y0, x1, y1, w, h, W };
}
function pntHfChanged(o) {
  const HF = View.rockHf;
  let bx0 = Infinity, by0 = Infinity, bx1 = -1, by1 = -1;
  for (let y = 0; y < o.h; y++) for (let x = 0, r = (o.y0 + y) * o.W + o.x0, q = y * o.w; x < o.w; x++) if (HF[r + x] !== _pntHfOld[q + x]) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; by1 = y; }
  return bx1 < 0 ? null : { x0: o.x0 + bx0, y0: o.y0 + by0, x1: o.x0 + bx1 + 1, y1: o.y0 + by1 + 1 };
}
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
  const sm = T.paint.facet.smooth + 3;
  pntEnsureHeights(f, x0 - Math.max(back, PNT_CELL + sm) - 4, y0 - Math.max(back, sm) - 4, x1 + PNT_CELL + sm + 4, y1 + maxH + sm + 8);
  pntGroundTones(f, x0, y0, x1, y1);
  const tx0 = Math.floor(x0 / ATILE), ty0 = Math.floor(y0 / ATILE), tx1 = Math.ceil(x1 / ATILE) - 1, ty1 = Math.ceil(y1 / ATILE) - 1;
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) paintTileArt(f, tx, ty);
  paintGraft(f, tx0, ty0, tx1, ty1);
  tintRift(f, x0, y0, x1, y1);
  paintRockArea(f, x0, y0, x1, y1);
  pntComposite(f, x0, y0, x1, y1);
  View.pnrTiles = null;
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
  // the place's light has changed a lot (kindled): painted again for it
  if (Math.abs(pntDarkness(f) - (View.pntLift || 0)) > 0.15) paintFloor(f);
  pntEnsure(f, camX - m1, camY - m1, camX + View.w + m1, camY + View.h + m1);
  const all = pntEnsure(f, camX - m2, camY - m2, camX + View.w + m2, camY + View.h + m2, L.budget);
  const S = View.pnt;
  if (S && S.stale && all) { S.stale = false; View.bakedFrom = null; }
}
// After the rock changes at x0..x1, y0..y1 (mining), its heights have been
// worked out again (pntHeights, the same box and m about it) and the
// ground's tiles under all it lifts painted again: the rock layer over
// everything they lift.
function pntRepaintRock(f, x0, y0, x1, y1, hb) {
  const maxH = pntMaxLift(), Wl = T.paint.wall, m = Math.max(Wl.edge, Wl.ramp) + 2 + ATILE / 2, P = T.paint;
  // (as far as a pixel's tone reads the heights: its slope's broad reach,
  // and its stroke's middle; from the heights that changed, if known, else
  // from as far as they could have)
  const sx = P.facet.smooth + PNT_CELL + 3, sy = P.facet.smooth + 5;
  // (nothing changed in the heights, as when a vein is charged into the
  // rock: the whole reach)
  const B = hb || { x0: x0 - m, y0: y0 - m, x1: x1 + m, y1: y1 + m };
  const rx0 = B.x0 - sx, ry0 = B.y0 - sy - maxH, rx1 = B.x1 + sx, ry1 = B.y1 + sy;
  paintRockArea(f, rx0, ry0, rx1, ry1);
  pntComposite(f, rx0, ry0, rx1, ry1);
  View.occCache = new Map(); View.pnrTiles = null;
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
  else if (a.crit) { hw = 14; h = 24; }
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
        const nz = Math.sqrt(Math.max(0, 1 - d)), s = (u * lx + v * ly) * 0.8 + nz * 0.5 - 0.15 + bias;
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
