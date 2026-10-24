'use strict';
// ---------------------------------------------------------------------------
// Painted flora (docs/PAINTED.md; the numbers in T.paint.flora). The flora's
// letter grids (flora.js, climes.js, art3.js) keep their shapes, sizes and
// anchors, but are painted rather than shaded and outlined:
//  - enlarged to the art's size smoothly (the grid's corners rounded off,
//    its gaps on a diagonal filled), so a shape doesn't come out as steps;
//  - no outline and no sel-out; a mass is shaded by its form, lit from the
//    upper left, and laid in short horizontal strokes of its own ramp's
//    close tones (pntRamp of the material's four);
//  - foliage (leaves, moss, vines, petals, snow) is broken into loose
//    clumps, each lit on its top, with its edge frayed and a few strays
//    round it;
//  - anything a pixel or two across is a strand: dark at its foot,
//    lighter up it, its tip lightest;
//  - darker towards the foot, where ugMelted draws it into the ground.
// The ground cover (tufts, sprigs, moss pads, roots, pebbles, the stands'
// stems) is painted here by hand, in the sample's way: rootlet tufts as
// fans of one-pixel strands with lighter tips.
// Everything is seeded by the grid itself, never Math.random.
// ---------------------------------------------------------------------------

// Materials drawn as loose clumps (petals and flowers stay whole, so a
// flower keeps its colour).
const PFL_LEAFY = new Set(['leaf', 'moss', 'vine', 'canopy', 'grass', 'snow']);

// Materials never drawn as strands (a thin rib of bone or a wire is a form).
const PFL_HARD = new Set(['bone', 'rock', 'metal', 'shell', 'drip', 'ash']);

// A string's hash, for a sprite's seed.
function pflHashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h | 0;
}

// A material's stroke ramp (8 tones as [r, g, b]: two deeper, its four,
// two lighter), worked out once.
const _pflRamps = new Map();
function pflRamp(hexes) {
  const key = hexes.join();
  let r = _pflRamps.get(key);
  if (!r) {
    const a = hexes.map(rgbOf);
    // (a material of fewer tones is spread to four)
    while (a.length < 4) a.push(pntMixRgb(a[a.length - 1], PNT_WARM, 0.25));
    r = pntRamp(a, PNT_WARM, T.paint.flora.ramp).map((c) => c.map((v) => Math.round(Math.max(0, Math.min(255, v)))));
    _pflRamps.set(key, r);
  }
  return r;
}

// A flora letter grid painted: buildArtSprite's arguments, and its size
// (the grid enlarged as buildArtSprite would, a pixel clear all round), so
// anchors and feet stay where they were.
function pflSprite(rows, pal, letters = SPRITE_CHARS, glows = SPRITE_GLOWS, opts = {}) {
  const PF = T.paint.flora;
  pal = pal ? Object.assign({}, ART.pal, pal) : ART.pal;
  const G = glows instanceof Set ? glows : new Set(glows || []);
  const k = (opts.scale !== undefined ? opts.scale : AP_ART) / (ART_NATIVE.get(rows) || 1);
  // (enlarged by the grid's own rules, scale3x's rounded corners, glows as
  // exact blocks)
  const glowCh = new Set(Object.keys(letters).filter((ch) => letters[ch] && G.has(letters[ch][0])));
  if (Math.abs(k - 1) > 1e-6) rows = artScaleRows(rows, k, glowCh);
  const h = rows.length, w = Math.max(...rows.map((r) => r.length)), W = w + 2, H = h + 2, N = W * H;
  const seed = pflHashStr(rows.join('/') + Object.keys(pal).length);
  const M = new Array(N).fill(null), FT = new Int8Array(N).fill(-1), GL = new Uint8Array(N);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x], e = ch && ch !== '.' ? letters[ch] : null;
      if (!e) continue;
      const i = (y + 1) * W + x + 1;
      M[i] = e[0]; FT[i] = e[1] !== undefined ? e[1] : -1; GL[i] = G.has(e[0]) ? 1 : 0;
    }
  let y0 = H, y1 = 0;
  for (let i = 0; i < N; i++) if (M[i]) { const y = (i / W) | 0; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  // ---- form: how far in from the silhouette and from the material's edge
  const BIG = 1e6, dS = new Float32Array(N), dM = new Float32Array(N);
  for (let i = 0; i < N; i++) dS[i] = dM[i] = M[i] ? BIG : 0;
  const pass = (from, to, by, nb) => {
    for (let i = from; i !== to; i += by) {
      if (!M[i]) continue;
      for (const [o, c] of nb) {
        const j = i + o;
        if (dS[j] + c < dS[i]) dS[i] = dS[j] + c;
        const m = M[j] === M[i] ? dM[j] : 0;
        if (m + c < dM[i]) dM[i] = m + c;
      }
    }
  };
  pass(W + 1, N - W - 1, 1, [[-1, 1], [-W, 1], [-W - 1, 1.4], [-W + 1, 1.4]]);
  pass(N - W - 2, W, -1, [[1, 1], [W, 1], [W + 1, 1.4], [W - 1, 1.4]]);
  const rE = 1.5 * k, rB = Math.max(rE + 1, 0.3 * Math.min(w, h)), rP = 2 * k, hgt = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    if (!M[i]) continue;
    let v = 0.45 * Math.min(1, (dS[i] - 0.5) / rE) + 0.35 * Math.min(1, (dS[i] - 0.5) / rB) + 0.2 * Math.min(1, (dM[i] - 0.5) / rP);
    // foliage: loose clumps, each a little dome (the nearest of jittered
    // points a few px apart)
    if (PFL_LEAFY.has(M[i])) {
      const x = i % W, y = (i / W) | 0, cs = PF.clump, gx = Math.floor(x / cs), gy = Math.floor(y / cs);
      let d = 9;
      for (let jy = gy - 1; jy <= gy + 1; jy++) for (let jx = gx - 1; jx <= gx + 1; jx++) {
        const px = (jx + artHash(jx, jy, seed + 3)) * cs, py = (jy + artHash(jx, jy, seed + 4)) * cs, dd = Math.hypot(x - px, (y - py) * 1.2) / cs;
        if (dd < d) d = dd;
      }
      v += PF.clumpH * Math.max(0, 1 - d);
    }
    hgt[i] = v;
  }
  // ---- each pixel's light value, 0..1
  const val = new Float32Array(N), LX = -0.46, LY = -0.62, LZ = 0.64, D = T.art.form.depth;
  const thin = new Uint8Array(N), tip = new Uint8Array(N), up = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    if (!M[i] || GL[i]) continue;
    const x = i % W, y = (i - x) / W;
    const nx = -(hgt[i + 1] - hgt[i - 1]) * D, ny = -(hgt[i + W] - hgt[i - W]) * D;
    const lam = Math.max(0, (LX * nx + LY * ny + LZ) / Math.hypot(nx, ny, 1)) / LZ;
    let s = PF.base + (lam - 1) * (lam > 1 ? PF.light : PF.shade) - PF.fall * ((y - y0) / Math.max(1, y1 - y0));
    // (a crease under another material)
    if (M[i - W] && M[i - W] !== M[i] && !GL[i - W]) s -= PF.crease;
    // (the lit edge and the shadowed one)
    val[i] = s;
    // a strand: no more than two px across, and upright (three px or more
    // tall here); a thin arc lying down is shaded as a form
    let l = 0, r = 0, u = 0, d = 0;
    while (l < 3 && M[i - l - 1]) l++;
    while (r < 3 && M[i + r + 1]) r++;
    while (u < 2 && M[i - (u + 1) * W]) u++;
    while (d < 2 && M[i + (d + 1) * W]) d++;
    if (l + r + 1 <= 2 && u + d >= 2 && !PFL_HARD.has(M[i])) thin[i] = 1;
  }
  // smoothed (over the material's own pixels), so a narrow form doesn't
  // band row by row; then its lit edge (top and left) and its shadowed
  // one (bottom and right, deeper: what an outline did, in its own tones)
  const sm = new Float32Array(N);
  for (let i = W; i < N - W; i++) {
    if (!M[i] || GL[i]) continue;
    let a = 0, n = 0;
    for (const o of [0, -1, 1, -W, W, -W - 1, -W + 1, W - 1, W + 1]) if (M[i + o] === M[i] && !GL[i + o]) { a += val[i + o]; n++; }
    sm[i] = a / n;
  }
  for (let i = W; i < N - W; i++) {
    if (!M[i] || GL[i]) continue;
    let s = sm[i];
    if (!M[i - W] || !M[i - 1]) s += PF.rim;
    if (!M[i + W]) s -= PF.under;
    else if (!M[i + 1]) s -= PF.rim;
    val[i] = s;
  }
  // strands: how far up each one a pixel is (0 at its foot, 1 at its tip)
  for (let x = 1; x < W - 1; x++) {
    let y = H - 2;
    while (y >= 1) {
      const i = y * W + x;
      if (!thin[i]) { y--; continue; }
      let top = y;
      // (a strand leans: it goes on up through either diagonal)
      let cx = x;
      while (top - 1 >= 1 && thin[(top - 1) * W + cx]) top--;
      const n = y - top + 1;
      for (let yy = top; yy <= y; yy++) up[yy * W + x] = n <= 1 ? 1 : (y - yy) / (n - 1);
      if (!M[(top - 1) * W + x] && !M[(top - 1) * W + x - 1] && !M[(top - 1) * W + x + 1]) tip[top * W + x] = 1;
      y = top - 1;
    }
  }
  // ---- strokes: along each row, runs of one material cut into strokes of
  // 2 to 5 px, each one tone, read at its middle, plus a jitter
  const P = pixBuf(W, H), lo = PF.tones[0], hi = PF.tones[1];
  const put = (i, c, glow) => { const q = i * 4; P.col[q] = c[0]; P.col[q + 1] = c[1]; P.col[q + 2] = c[2]; P.col[q + 3] = 255; if (glow) { P.em[q] = c[0]; P.em[q + 1] = c[1]; P.em[q + 2] = c[2]; P.em[q + 3] = 255; } };
  const tone = (ramp, t) => ramp[Math.max(0, Math.min(ramp.length - 1, Math.round(t)))];
  for (let y = 1; y < H - 1; y++) {
    let x = 1;
    while (x < W - 1) {
      const i = y * W + x, m = M[i];
      if (!m) { x++; continue; }
      if (GL[i]) { const g = pal[m]; put(i, rgbOf(g[g.length - 1]), true); x++; continue; }
      const ramp = pflRamp(pal[m]);
      if (thin[i]) {
        // a strand: by its height, dark at the foot, the tip lightest
        const f = FT[i] >= 0 ? Math.max(PF.strandLo, 2 + FT[i]) : null, t = up[i];
        let ti = f !== null ? f + Math.round(t * PF.strandForced) : lo + (hi - lo) * (PF.strand[0] + (PF.strand[1] - PF.strand[0]) * t) + (val[i] - PF.base) * 0.8;
        if (tip[i]) ti = Math.max(ti + 1, f !== null ? f + 2 : hi);
        put(i, tone(ramp, ti));
        x++; continue;
      }
      // a stroke
      const len = 2 + Math.floor(artHash(x, y, seed + 11) * (PF.stroke - 1));
      let e = x;
      while (e < x + len && e < W - 1 && M[y * W + e] === m && !GL[y * W + e] && !thin[y * W + e] && FT[y * W + e] === FT[i]) e++;
      // (a narrow upright part is shaded across, not streaked: its
      // strokes' jitter falls with the run's width)
      let rw = 0, rx = x;
      while (rx > 1 && M[y * W + rx - 1] === m) rx--;
      while (M[y * W + rx + rw] === m) rw++;
      const mid = y * W + ((x + e - 1) >> 1), jit = (artHash(x, y, seed + 12) + artHash(x, y, seed + 13) - 1) * PF.jit * Math.min(1, (rw - 1) / PF.wide);
      for (let xx = x; xx < e; xx++) {
        const j = y * W + xx;
        let t;
        if (FT[j] >= 0) t = 2 + FT[j] + (val[mid] - PF.base) * 2 + jit * 0.5;
        else t = lo + (hi - lo) * Math.max(0, Math.min(1, val[mid])) + jit;
        put(j, tone(ramp, t));
      }
      x = e;
    }
  }
  // ---- the shadowed side's skirt: where the old outline was, below and to
  // the right of a mass, its deepest tones, so it keeps its weight without
  // a line round it (not on the lit side, and only now and then on a strand)
  const C32 = new Uint32Array(P.col.buffer), skirt = [];
  for (let i = W; i < N - W; i++) {
    if (M[i]) continue;
    const x = i % W, y = (i / W) | 0;
    if (x < 1 || x >= W - 1) continue;
    const o = M[i - W] && !GL[i - W] ? i - W : M[i - 1] && !GL[i - 1] ? i - 1 : -1;
    if (o < 0 || !M[i - W - 1] && !M[i - W] && !M[i - 1]) continue;
    const p = thin[o] ? PF.skirtThin : PFL_LEAFY.has(M[o]) ? PF.skirtLeafy : PF.skirt;
    if (artHash(x, y, seed + 31) < p) skirt.push(i, o);
  }
  for (let q = 0; q < skirt.length; q += 2) {
    const i = skirt[q], o = skirt[q + 1], ramp = pflRamp(pal[M[o]]), c = ramp[artHash(i, 3, seed + 32) < 0.5 ? 1 : 2];
    C32[i] = (0xff000000 | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0;
  }
  // ---- foliage: a frayed edge (bitten away two px at a time, never a lone
  // pixel left) and a few strays over its top, short dashes of its tones;
  // only where it's a mass of one shade (a frond or a sprig, or leaves
  // drawn as light and dark ones by hand, keep their edges)
  const leafy = (j) => M[j] && PFL_LEAFY.has(M[j]) && FT[j] < 0 && !thin[j];
  const mass = new Uint8Array(N);
  for (let i = W; i < N - W; i++) {
    if (!leafy(i)) continue;
    let n = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const j = i + dy * W + dx; if (j >= 0 && j < N && leafy(j)) n++; }
    mass[i] = n >= PF.mass ? 1 : 0;
  }
  for (let i = W; i < N - W; i++) {
    if (!mass[i]) continue;
    const x = i % W, y = (i / W) | 0, edge = !M[i - 1] || !M[i + 1] || !M[i - W] || !M[i + W];
    if (!edge || y >= y1 - 2 || artHash(x >> 1, y, seed + 21) >= PF.loose) continue;
    const j = x & 1 ? i - 1 : i + 1;
    C32[i] = 0; P.em[i * 4 + 3] = 0;
    if (mass[j] && (!M[j - W] || !M[j + W])) { C32[j] = 0; P.em[j * 4 + 3] = 0; }
  }
  for (let i = W; i < N - W; i++) {
    if (M[i] || M[i + 1]) continue;
    const x = i % W, y = (i / W) | 0;
    if (x < 1 || x >= W - 2 || y >= y1 - 2 || !mass[i + W] || !C32[i + W] || artHash(x >> 1, y, seed + 22) >= PF.stray) continue;
    const ramp = pflRamp(pal[M[i + W]]), c = ramp[Math.min(7, hi - (artHash(x, y, seed + 23) < 0.5 ? 1 : 2))];
    C32[i] = C32[i + 1] = (0xff000000 | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0;
  }
  const out = spriteFromBuf(P);
  out.k = opts.scale !== undefined ? opts.scale : AP_ART;
  return artFine(out);
}

// A piece of a flora set, painted (render.js floraSprite caches it): by
// hand, if it has a painter of its own, else from its grid.
function pflFloraSprite(set, piece, frame, kit) {
  const hand = PFL_HAND[piece.name];
  const s = hand ? hand(piece, frame, kit, set) : pflSprite(piece.frames[frame], kit.pal, kit.letters, kit.glows);
  return s;
}

// A clump of grass, by hand, at the size its grid was (so it stands where
// it did): a field of one-pixel blades, uneven, leaning out and bending,
// dark at the foot and lit at the tips, out of a low mound of its base
// (moss, snow) if it has one. A second frame leans a little further.
function pflGrass(blade, base, o = {}) {
  return (piece, frame, kit, set) => {
    const g = piece.frames[frame], w = Math.ceil(Math.max(...g.map((r) => r.length)) * T.art.px) + 2, h = Math.ceil(g.length * T.art.px) + 2;
    const C = new PflCan(w, h, pflHashStr(set + piece.name)), fy = h - 2, br = pflRamp(kit.pal[blade]);
    let top = fy;
    if (base) {
      const bR = pflRamp(kit.pal[base]), bh = o.baseH || 2;
      pflMossPad(C, w >> 1, fy, (w >> 1) - 2, bh, bR);
      top = fy - bh + 1;
    }
    const n = Math.round(w * (o.dense || 0.8)), lean = frame ? 0.18 : 0;
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n * 2 - 1, x = Math.round((w >> 1) + u * ((w >> 1) - 2) + (C.r() - 0.5) * 2), back = C.r() < 0.35;
      const len = Math.max(2, Math.round(top * (0.55 + 0.45 * C.r() ** 0.6) * (1 - 0.25 * Math.abs(u)) * (back ? 0.85 : 1)));
      pflStrand(C, x, top - (back ? 1 : 0), len, u * 0.3 + lean + (C.r() - 0.5) * 0.25, br, back ? 1 : 2, back ? 4 : 5);
    }
    if (base) pflMossPad(C, w >> 1, fy, (w >> 1) - 3, 1, pflRamp(kit.pal[base]));
    const P = pixBuf(w, h);
    new Uint32Array(P.col.buffer).set(C.px);
    const out = spriteFromBuf(P);
    out.k = T.art.px;
    return out;
  };
}

// The pieces painted by hand rather than from their grids.
const PFL_HAND = {
  'Fen grass': pflGrass('leaf', 'moss'),
  'Snow tufts': pflGrass('leaf', 'snow', { baseH: 3, dense: 0.6 }),
};

// ---------------------------------------------------------------------------
// The ground cover, painted by hand (undergrowth.js ugKit): stamps of
// 32-bit pixels, a clear row under the foot as the old ones had.
// ---------------------------------------------------------------------------
// A small picture to paint a stamp into: w × h, the foot on row h - 2.
class PflCan {
  constructor(w, h, seed) { this.w = w; this.h = h; this.px = new Uint32Array(w * h); this.seed = seed; this.n = 0; }
  r() { return artHash(this.n++, 29, this.seed); }
  set(x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h - 1 && c) this.px[y * this.w + x] = (0xff000000 | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0; }
  has(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h && this.px[y * this.w + x] !== 0; }
  stamp() { return { w: this.w, h: this.h, px: this.px }; }
}
const pflPick = (ramp, t) => ramp[Math.max(0, Math.min(ramp.length - 1, Math.round(t)))];

// A strand from (x, y) up: n px, leaning lean px a px up at its top (it
// bends: the lean grows up it), dark at the foot, lighter up it, its tip
// lightest. lo, hi: its foot's and top's tones on the ramp.
function pflStrand(C, x, y, n, lean, ramp, lo, hi) {
  for (let k = 0; k < n; k++) {
    const t = n > 1 ? k / (n - 1) : 1, tip = k === n - 1;
    C.set(x + lean * k * (0.4 + 0.6 * t), y - k, pflPick(ramp, tip ? hi + 1 : lo + (hi - lo) * t));
  }
}

// A tuft of rootlets: a fan of one-pixel strands from a foot a few px
// across, of uneven heights, leaning out and bending. The ones behind are
// darker and drawn first. o: n strands, spread (px either way), h (the
// tallest), fan (lean at the edges), lo, hi (tones), heads (the share
// with a seed head, of head's ramp).
function pflTuft(C, cx, fy, ramp, o) {
  const n = o.n, spread = o.spread, list = [];
  for (let i = 0; i < n; i++) {
    const u = n > 1 ? (i / (n - 1)) * 2 - 1 + (C.r() - 0.5) * 0.4 : 0, back = C.r() < 0.4;
    list.push({ u, back, x: cx + Math.round(u * spread), len: Math.max(2, Math.round(o.h * (1 - 0.35 * Math.abs(u)) * (0.35 + 0.65 * C.r() ** (o.skew || 1)) * (back ? 0.85 : 1))), lean: u * o.fan + (C.r() - 0.5) * (o.wob || 0.3) });
  }
  list.sort((a, b) => (b.back ? 1 : 0) - (a.back ? 1 : 0));
  for (const s of list) {
    // (the feet don't line up: one behind springs up a px or two further
    // back, so the clump has no straight edge where it meets the ground)
    const d = s.back ? 1 : 0, sy = fy - (s.back ? 1 + Math.floor(C.r() * 2) : C.r() < 0.4 ? 1 : 0);
    pflStrand(C, s.x, sy, s.len, s.lean, ramp, o.lo - d - 1, o.hi - d);
    if (o.heads && C.r() < o.heads) { const hx = s.x + s.lean * (s.len - 1), hy = sy - s.len; C.set(hx, hy, o.head[5]); C.set(hx, hy + 1, o.head[3]); }
  }
  // the foot: a dark knot where they meet the ground
  if (o.knot) for (let i = -Math.ceil(spread / 2); i <= Math.ceil(spread / 2); i++) if (C.r() < o.knot) C.set(cx + i, fy, ramp[1]);
}

// A pad of moss: a low loose clump lit on its top, ragged at its ends.
function pflMossPad(C, cx, fy, rx, ry, ramp) {
  for (let y = -ry; y <= 0; y++) {
    const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - ((y + ry * 0.4) / (ry + 0.6)) ** 2)));
    for (let x = -half; x <= half; x++) {
      if (Math.abs(x) === half && C.r() < 0.5) continue;
      const lit = -y / ry - x / (rx * 3), t = 2 + lit * 2.6 + (C.r() - 0.5) * 0.9;
      C.set(cx + x, fy + y, pflPick(ramp, y === 0 ? 1.4 : t));
    }
  }
}

// A pebble: a little stone w px across and h tall, its feet at fy, its top
// rounded off, lit on its top left, dark on its right, a shadow under.
function pflPebble(C, cx, fy, w, h, ramp) {
  const x0 = cx - (w >> 1);
  for (let j = 0; j < h; j++) {
    const y = fy - h + j, inset = j === 0 ? 1 : 0;
    for (let i = inset; i < w - inset; i++) {
      const t = j === 0 ? (i <= w / 2 ? 6 : 5) : i === 0 ? 5 : i >= w - 1 ? 2 : j === h - 1 ? 3 : 4;
      C.set(x0 + i, y, pflPick(ramp, t + (C.r() < 0.25 ? -1 : 0)));
    }
  }
  for (let i = 1; i <= w; i++) if (!C.has(x0 + i, fy)) C.set(x0 + i, fy, ramp[0]);
}

// The set's cover, painted: ugKit's shape ({ tuft, sprig, pebbles, moss,
// roots, tall, front }, each a list of stamps). look: UG_LOOKS's; pal: the
// set's flora palette, with scree (the rock's face).
function pflCoverKit(set, look, pal) {
  const has = (m) => (pal[m] ? m : 'stem'), R = (m) => pflRamp(pal[has(m)]);
  const blade = R(look.blade), tall = R(look.tall), head = R(look.head), pad = R(look.pad), root = R(look.root), scree = pflRamp(pal.scree);
  const base = pflHashStr(set + '/cover'), K = {};
  const make = (w, h, k, fn) => { const C = new PflCan(w, h, base + k * 7919); fn(C); return C.stamp(); };
  // rootlet tufts: the most of the ground's dressing
  K.tuft = [0, 1, 2, 3, 4].map((k) => make(17, 13, k, (C) => pflTuft(C, 8, 11, blade, { n: 6 + k, spread: 2 + (k & 1) + (k >> 2), h: 8 + (k % 3), fan: 0.5, wob: 0.4, skew: 0.6, lo: 2, hi: 5, knot: 0.6 })));
  // sprigs: a tuft with seed heads, or leaf tips
  K.sprig = [0, 1, 2].map((k) => make(15, 13, 10 + k, (C) => pflTuft(C, 7, 11, blade, { n: 4 + k, spread: 2, h: 8 + k, fan: 0.4, skew: 0.6, lo: 2, hi: 5, heads: 0.8, head, knot: 0.6 })));
  // moss: a clump of little domes, lit on top, a few strays over it
  K.moss = [0, 1, 2].map((k) => make(15, 8, 20 + k, (C) => {
    pflMossPad(C, 7, 6, 4 + k, 3, pad);
    pflMossPad(C, 7 + (k === 1 ? -4 : 4), 6, 2 + (k & 1), 2, pad);
    for (let i = 0; i < 3; i++) { const x = 3 + Math.floor(C.r() * 9), y = 2 + Math.floor(C.r() * 2); if (!C.has(x, y) && C.has(x, y + 1)) { C.set(x, y, pad[5]); C.set(x + 1, y, pad[4]); } }
  }));
  K.pebbles = [0, 1, 2, 3].map((k) => make(13, 7, 30 + k, (C) => {
    const n = 1 + (k % 3);
    for (let i = 0; i < n; i++) pflPebble(C, 3 + i * 4 + Math.round(C.r()), 5 - (i === 1 ? 1 : 0), i === 0 && k !== 2 ? 5 : 3 + (k & 1), i === 0 ? 3 : 2, scree);
  }));
  // roots: humps of root, half sunk, lit along their backs
  K.roots = [0, 1, 2].map((k) => make(16, 6, 40 + k, (C) => {
    let x = 1, y = 4;
    for (let i = 0; i < 12 + k; i++) {
      const hump = Math.sin((i / (6 + k)) * Math.PI * 2 + k) > 0.2;
      if (hump) { C.set(x, y - 1, root[5]); C.set(x, y, root[2]); } else if (C.r() < 0.6) C.set(x, y, root[3]);
      x++; if (C.r() < 0.2) y = clamp(y + (C.r() < 0.5 ? -1 : 1), 3, 4);
    }
  }));
  // the stands' stems: taller, a few heads above
  K.tall = [0, 1, 2, 3, 4, 5].map((k) => make(17, 19, 50 + k, (C) => pflTuft(C, 8, 17, tall, { n: 8 + (k % 4), spread: 3 + (k & 1), h: 12 + (k % 4), fan: 0.5, wob: 0.6, lo: 2, hi: 5, skew: 0.7, heads: k % 3 === 1 ? 0.35 : 0, head })));
  // the blades in front of a plant's foot: short, dark where they meet it
  K.front = [0, 1, 2, 3, 4].map((k) => make(11, 10, 60 + k, (C) => pflTuft(C, 5, 8, tall, { n: 4 + (k % 3), spread: 1 + (k & 1), h: 5 + (k % 3), fan: 0.45, skew: 0.6, lo: 1, hi: 4 })));
  if (look.front === 'pebbles') K.front = K.pebbles;
  return K;
}

// ---------------------------------------------------------------------------
// Ore, on the rock layer (paint.js pntRockDecor calls this for an ore tile).
// A cluster of faceted crystals breaking out of the rock's top, lit on their
// left facets, shadowed on their right, in a dark socket, with a white glint
// and a glowing tip; flecks of the ore in the rock round them; and one
// crystal on the face where the ground is in front. Ore stays the clearest
// thing on the ground: its own bright colours, its glints and its light.
// on(x, y): whether the rock layer's pixel there is this tile's and in the
// area being painted (x0..x1, y0..y1). A crystal may stand up past its
// tile, over whatever is behind it. Seeded by the tile.
// ---------------------------------------------------------------------------
function pflOreTile(f, tx, ty, on, x0, y0, x1, y1) {
  const W = PWIN.w, OFF = -PWIN.y * W - PWIN.x, H = View.rockH, LF = View.rockLift, Q = View.rockBuf, b = artBiome(f), O = T.paint.ore;
  const ore = ART.ores[T.ores[f.ore[ty * f.w + tx] - 1].id], r = ore.map(rgbOf), seed = hashInts(f.seed, f.depth, tx, ty, 0x0e5) | 0;
  const rnd = (k) => artHash(k, 41, seed), soot = rgbOf(b.rock[0]), white = [255, 255, 255];
  const put = (x, y, c, glow, fy) => { if (on(x, y)) pntPut(Q, LF, W, x, y, c, glow, fy); };
  // (a crystal's pixel: in the area, over rock or ground that's behind it)
  const putUp = (x, y, c, glow, fy) => { if (x >= x0 && y >= y0 && x < x1 && y < y1 && (!LF[y * W + x + OFF] || y + LF[y * W + x + OFF] - 1 <= fy)) pntPut(Q, LF, W, x, y, c, glow, fy); };
  // where a floor point is drawn (its surface lifted)
  const lift = (x, y) => y - H[y * W + x + OFF];
  // flecks: short strokes of the ore in the rock's top
  for (let k = 0; k < O.flecks; k++) {
    const fx = tx * ATILE + 2 + Math.floor(rnd(100 + k) * (ATILE - 6)), fy = ty * ATILE + 2 + Math.floor(rnd(120 + k) * (ATILE - 4)), n = 1 + Math.floor(rnd(140 + k) * 2.5);
    for (let i = 0; i < n; i++) put(fx + i, lift(fx + i, fy), r[i === 0 && n > 1 ? 1 : 2], false, fy);
  }
  // the cluster: crystals fanning out of a socket, back ones first
  const cx = tx * ATILE + Math.round(ATILE * (0.35 + rnd(1) * 0.3)), cy = ty * ATILE + Math.round(ATILE * (0.5 + rnd(2) * 0.25));
  const n = O.crystals[0] + Math.floor(rnd(3) * (O.crystals[1] - O.crystals[0] + 1)), list = [];
  for (let k = 0; k < n; k++) {
    const u = n > 1 ? (k / (n - 1)) * 2 - 1 : 0, dx = Math.round(u * O.spread + (rnd(10 + k) - 0.5) * 2), dy = Math.round((rnd(20 + k) - 0.5) * 3) - (Math.abs(u) < 0.5 ? 1 : 0);
    const big = Math.abs(u) < 0.5;
    list.push({ x: cx + dx, fy: cy + dy, h: Math.round((big ? O.h[1] : O.h[0]) * (0.75 + rnd(30 + k) * 0.35)), w: big ? 4 : 3, lean: u * O.lean + (rnd(40 + k) - 0.5) * 0.2 });
  }
  list.sort((p, q) => p.fy - q.fy || q.h - p.h);
  // (the socket under them: soot, a little wider than the cluster)
  for (const c of list) for (let j = -2; j <= c.w + 1; j++) { const x = c.x + j; put(x, lift(x, c.fy) + 1, soot, false, c.fy); }
  for (const c of list) pflCrystal(putUp, c.x, lift(c.x, c.fy), c.h, c.w, c.lean, r, c.fy, white);
  // on its face, where the ground is in front of it
  if (!TILE_SOLID[floorTile(f, tx, ty + 1)]) {
    const fx = tx * ATILE + 3 + Math.floor(rnd(50) * (ATILE - 9)), fy = (ty + 1) * ATILE - 1, sy = fy - 3 - Math.floor(rnd(51) * 4);
    pflCrystal(putUp, fx, sy, O.h[0] - 1, 3, (rnd(52) - 0.5) * 0.6, r, fy, white);
  }
}

// One crystal up from (x, y) (its base's left), h px tall, w across,
// leaning lean px a px (stepping whole px): a prism, its left facet lit and
// its edge lightest, its right in shadow, pointed over its last two rows,
// with a glint high on the lit facet and a glowing tip.
function pflCrystal(put, x, y, h, w, lean, r, fy, white) {
  for (let i = 0; i < h; i++) {
    const fromTip = h - 1 - i, wi = fromTip === 0 ? 1 : fromTip === 1 ? Math.max(1, w - 2) : w, ox = Math.round(x + lean * i) + ((w - wi + (fromTip === 0 && w % 2 === 0 ? 0 : 0)) >> 1), yy = y - i;
    for (let j = 0; j < wi; j++) {
      const c = wi === 1 ? r[3] : i === 0 ? (j === 0 ? r[1] : r[0]) : j === 0 ? r[3] : j < wi / 2 ? r[2] : j === wi - 1 ? r[0] : r[1];
      put(ox + j, yy, c, fromTip === 0, fy);
    }
  }
  // the glint: one white pixel on the lit facet, two thirds up
  const gi = Math.min(h - 3, Math.round(h * 0.6));
  if (gi > 0) put(Math.round(x + lean * gi) + 1, y - gi, white, true, fy);
}

// ---------------------------------------------------------------------------
// Drops on the ground (render.js drawDrop): a little heap of crystals for
// ore and stuff, a cut gem for gear, painted (lit facets on the upper
// left, the shadowed ones dark, a white glint, no outline). Their lit
// facets glow, so loot is seen in the dark. A ramp of the drop's colour:
// an ore's own, else drawn from its colour.
// ---------------------------------------------------------------------------
const _pflDrops = new Map();
function pflDropSprite(kind, col, ore) {
  const key = kind + col;
  let s = _pflDrops.get(key);
  if (s) return s;
  const r = ore || [mix(col, '#000000', 0.65), mix(col, '#000000', 0.35), col, mix(col, '#ffffff', 0.45)], W = '#ffffff';
  const S = new PntSpr(11, 10, pflHashStr(key));
  if (kind === 'heap') {
    // three prisms out of a dark scatter: the middle one tallest
    const prism = (x, y, h, w) => {
      for (let i = 0; i < h; i++) {
        const fromTip = h - 1 - i, wi = fromTip === 0 ? 1 : w;
        for (let j = 0; j < wi; j++) {
          const ox = x + (fromTip === 0 ? w >> 1 : j);
          S.px(ox, y - i, wi === 1 ? r[3] : j === 0 ? r[3] : j === wi - 1 ? r[0] : r[1], wi === 1 || j === 0);
        }
      }
    };
    for (let x = 1; x <= 9; x++) S.px(x, 9, r[0]);
    prism(1, 8, 3, 2); prism(7, 8, 4, 2); prism(3, 8, 7, 3);
    S.px(4, 4, W, true);
  } else {
    // a cut gem: a diamond of facets
    for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) {
      const d = Math.abs(i) + Math.abs(j);
      if (d > 4) continue;
      const c = d <= 1 && i <= 0 && j <= 0 ? W : i <= 0 && j <= 0 ? r[3] : i > 0 && j > 0 ? r[0] : j <= 0 ? r[2] : r[1];
      S.px(5 + i, 5 + j, c, c !== r[0]);
    }
  }
  s = artFine(S.done());
  _pflDrops.set(key, s);
  return s;
}

// ---------------------------------------------------------------------------
// Props in the field (the spire, the waystones, the portals): drawn as
// before, tone by tone in their stone's four, then repainted here: the
// stone's tones turned to a light value, softened, and laid again in short
// strokes on the stone's eight-tone ramp; a lit rim on the top and left;
// no outline, but the shadowed side's rim (below and to the right) in the
// stone's deepest tones, so it keeps its weight. What isn't the stone
// (runes, veins, crystals, glyphs) stays as it was.
// P: the picture (pixBuf); solid: its drawn pixels; stone: its four tones.
// ---------------------------------------------------------------------------
function pflRepaintProp(P, solid, stone, seed, skip) {
  const W = P.w, H = P.h, N = W * H, PF = T.paint.flora, ramp = pflRamp(stone), C32 = new Uint32Array(P.col.buffer);
  const u32 = (c) => (0xff000000 | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0, keys = stone.map((h) => u32(rgbOf(h)));
  const k4 = new Int8Array(N).fill(-1);
  for (let i = 0; i < N; i++) if (solid[i] && !P.em[i * 4 + 3]) k4[i] = keys.indexOf(C32[i]);
  const val = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    if (k4[i] < 0) continue;
    let a = 0, n = 0;
    for (const o of [0, 0, 0, -1, 1, -W, W]) { const j = i + o; if (j >= 0 && j < N && k4[j] >= 0) { a += k4[j] / 3; n++; } }
    const x = i % W, y = (i / W) | 0;
    let v = a / n;
    if (y > 0 && !solid[i - W]) v += 0.15;
    else if (x > 0 && !solid[i - 1]) v += 0.08;
    val[i] = v;
  }
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      const i = y * W + x;
      if (k4[i] < 0) { x++; continue; }
      const len = 2 + Math.floor(artHash(x, y, seed + 1) * (PF.stroke - 1));
      let e = x;
      while (e < x + len && e < W && k4[y * W + e] >= 0) e++;
      const mid = y * W + ((x + e - 1) >> 1), jit = (artHash(x, y, seed + 2) + artHash(x, y, seed + 3) - 1) * PF.propJit;
      for (let xx = x; xx < e; xx++) C32[y * W + xx] = u32(ramp[clamp(Math.round(1.8 + val[mid] * 4.2 + jit), 0, 7)]);
      x = e;
    }
  }
  // the shadowed side's rim
  for (let i = W; i < N; i++) {
    if (solid[i]) continue;
    const x = i % W;
    if (skip && skip(x, (i / W) | 0)) continue;
    if (solid[i - W] || (x > 0 && solid[i - 1])) { C32[i] = u32(ramp[artHash(i, 6, seed + 4) < 0.5 ? 0 : 1]); P.em[i * 4 + 3] = 0; }
  }
}
