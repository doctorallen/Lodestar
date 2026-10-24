'use strict';
// ---------------------------------------------------------------------------
// Home's ground, painted into the floor with its tiles (floor.js
// outpostFloor lays it out): the inside of the star. The hollow's floor is
// faceted glass over the star's light, amber, brighter under the heart,
// its facets' seams the star's veins; at its edge the skin, a band of
// brightness two tiles thick, white at the wall, open where the ways out
// pass through it; past the skin the rim's rock and, towards each opening,
// the land beyond coming in. Each side is painted a second time in its
// neighbour's look (its ground, its clime's marks, its plants' beds; its
// rock in pntPaintRock), and laid over the ground pixel by pixel where the
// meld reaches, the border wandering and torn in streaks. Every helper
// here is named hgr…; numbers are in T.hollow, T.outpost and T.paint.site.
// ---------------------------------------------------------------------------

// The land beyond the outpost's k-th opening: its look and its plants.
function hgrMeldTerr(f, k) { return terrOf(f.meld.to[k]); }
function hgrMeldLook(f, k) { const t = hgrMeldTerr(f, k); return CLIME_ART[t.clime] || ART.surface[T.biomes[t.biome].id]; }
function hgrMeldSet(f, k) { const t = hgrMeldTerr(f, k); return CLIME_FLORA[t.clime] ? t.clime : 'surface'; }

// How far into the land beyond (0-1) floor px x, y is: the tiles' weights,
// blended between their middles.
function hgrMeldWeight(f, x, y) {
  const M = f.meld, W = f.w, gx = clamp(x / ATILE - 0.5, 0, W - 1.001), gy = clamp(y / ATILE - 0.5, 0, f.h - 1.001), tx = Math.floor(gx), ty = Math.floor(gy), u = gx - tx, v = gy - ty, i = ty * W + tx;
  const a = M.wt[i], b = M.wt[i + 1], c = M.wt[i + W], d = M.wt[i + W + 1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// Which side's land floor px x, y shows (k), or -1 for the cleared ground:
// its side read from a point wandered off it, so the border between two
// sides isn't straight, and its weight against a noise stretched across,
// so the land comes in in torn streaks, as the strokes run.
function hgrMeldAt(f, x, y) {
  const M = f.meld;
  if (!M || !M.to.length) return -1;
  const w = hgrMeldWeight(f, x, y);
  if (w <= 0) return -1;
  const S = T.paint.site, n = pntNoise(x, y, S.tear[0], S.tear[1], f.seed + 5) * 0.6 + pntNoise(x, y, S.tear[2], S.tear[3], f.seed + 6) * 0.4;
  if (w + (n - 0.5) * S.tearAmt <= 0.5) return -1;
  const wob = T.outpost.meld.wobble * ATILE, wx = x + (pntNoise(x, y, 60, 60, f.seed + 3) - 0.5) * 2 * wob, wy = y + (pntNoise(x, y, 60, 60, f.seed + 4) - 0.5) * 2 * wob;
  return M.sec[clamp(Math.floor(wy / ATILE), 0, f.h - 1) * f.w + clamp(Math.floor(wx / ATILE), 0, f.w - 1)];
}

let _hgrSide = new Int8Array(0);
// The meld over tiles tx0..tx1, ty0..ty1 (pntPaintChunk, after the tiles):
// for each side that reaches them, its tiles painted again in its look on a
// second buffer, then laid in where that side's land shows.
function hgrPaintMeld(f, tx0, ty0, tx1, ty1) {
  const M = f.meld, P = View.floorBuf;
  if (!M || !P || !View.ugMeld) return;
  tx0 = Math.max(0, tx0); ty0 = Math.max(0, ty0); tx1 = Math.min(f.w - 1, tx1); ty1 = Math.min(f.h - 1, ty1);
  const reach = Math.ceil(T.outpost.meld.wobble) + 1, ks = new Set();
  for (let y = Math.max(0, ty0 - reach); y <= Math.min(f.h - 1, ty1 + reach); y++)
    for (let x = Math.max(0, tx0 - reach); x <= Math.min(f.w - 1, tx1 + reach); x++) if (M.wt[y * f.w + x] > 0) ks.add(M.sec[y * f.w + x]);
  if (!ks.size) return;
  // (a tile is painted again only if the meld reaches it, give or take)
  const near = (x, y) => { for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const a = x + i, b = y + j; if (a >= 0 && b >= 0 && a < f.w && b < f.h && M.wt[b * f.w + a] > 0) return true; } return false; };
  const Q = View.meldBuf && View.meldBuf.w === P.w && View.meldBuf.h === P.h ? View.meldBuf : (View.meldBuf = pixBuf(P.w, P.h));
  const U0 = View.ug, PC = P.col32 || (P.col32 = new Uint32Array(P.col.buffer)), PE = P.em32 || (P.em32 = new Uint32Array(P.em.buffer));
  const QC = Q.col32 || (Q.col32 = new Uint32Array(Q.col.buffer)), QE = Q.em32 || (Q.em32 = new Uint32Array(Q.em.buffer));
  // (which side each pixel shows, worked out once for all the sides)
  const bx0 = tx0 * ATILE, by0 = ty0 * ATILE, bw = (tx1 - tx0 + 1) * ATILE, bh = (ty1 - ty0 + 1) * ATILE;
  if (_hgrSide.length < bw * bh) _hgrSide = new Int8Array(bw * bh);
  const side = _hgrSide, todo = [];
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    if (!near(tx, ty)) continue;
    todo.push(tx, ty);
    for (let y = ty * ATILE; y < (ty + 1) * ATILE; y++) for (let x = tx * ATILE; x < (tx + 1) * ATILE; x++) side[(y - by0) * bw + x - bx0] = hgrMeldAt(f, x, y);
  }
  for (const k of ks) {
    View.floorBuf = Q; View.ug = View.ugMeld[k]; f.meldPainting = k;
    try { for (let i = 0; i < todo.length; i += 2) paintTileArt(f, todo[i], todo[i + 1]); }
    finally { View.floorBuf = P; View.ug = U0; f.meldPainting = -1; }
    for (let i = 0; i < todo.length; i += 2) {
      const tx = todo[i], ty = todo[i + 1];
      for (let y = ty * ATILE; y < (ty + 1) * ATILE; y++) for (let x = tx * ATILE, q = y * P.w + x, r = (y - by0) * bw + x - bx0; x < (tx + 1) * ATILE; x++, q++, r++) if (side[r] === k) { PC[q] = QC[q]; PE[q] = QE[q]; }
    }
  }
}

// ---- the glass and the skin --------------------------------------------------
// How far floor px x, y is from the hollow's middle, in tiles (flattened
// as the camera sees it), and its angle round it.
function hgrPolar(x, y) { const H = HOLLOW, gx = x / ATILE - 0.5 - H.x, gy = (y / ATILE - 0.5 - H.y) / H.sq; return { r: Math.hypot(gx, gy), a: Math.atan2(gy, gx) }; }
// Is tile point (gx, gy) in one of the ways out through the skin?
function hgrInPassage(f, gx, gy) {
  const S = f.site, W = T.hollow.passage;
  return !!S && S.paths.some((p) => outpostSegDist(gx, gy, p.ax, p.ay, p.bx, p.by)[0] < W);
}
// What's underfoot at world px x, y at home: 'glass' inside the skin, the
// land beyond's clime where the meld has taken over ('frost',
// 'bloomfen'…), or 'earth'; null away from home. (For the footsteps'
// sound.)
function outpostGroundAt(x, y) {
  const d = Game.dive, f = d && d.hub ? d.floor : null;
  if (!f || !f.site) return null;
  if (hgrPolar(x * AP, y * AP).r < HOLLOW.r) return 'glass';
  const k = hgrMeldAt(f, x * AP, y * AP);
  if (k >= 0) return hgrMeldTerr(f, k).clime || 'earth';
  return 'earth';
}
// The footsteps' material at home (audio.js sndGroundAt): glass rings like
// stone, the rim's earth is dirt, the land beyond its own clime's.
if (typeof Snd !== 'undefined') Snd.hubGround = (x, y) => {
  const g = outpostGroundAt(x, y);
  return !g ? null : g === 'glass' ? 'stone' : g === 'earth' ? 'dirt' : SND_CLIME_GROUND[g] || 'dirt';
};
// The ground's materials, as whole pixels (T.hollow's glass and skin).
const _hgrRamps = {};
function hgrRamp(id) { return _hgrRamps[id] || (_hgrRamps[id] = Uint32Array.from(T.hollow[id].map((h) => pntU32(rgbOf(h))))); }
const HART_STAR_RGB = HART.star.map(rgbOf);

// The glass and the skin over one tile's ground (paintTileArt, after the
// ground and before what grows on it). In the meld's pass (the land
// beyond, painted again) nothing: the land beyond covers the rest.
function hgrPaintGround(P, f, tx, ty, ox, oy) {
  if (!f.site || f.meldPainting >= 0) return;
  const H = HOLLOW, G = T.hollow, W = P.w, C32 = P.col32 || (P.col32 = new Uint32Array(P.col.buffer)), E = P.em, tone = View.groundTone;
  const far = Math.hypot(tx + 0.5 - H.x, (ty + 0.5 - H.y) / H.sq);
  if (far > H.r + 1.5) return;
  const glass = hgrRamp('glass'), skin = hgrRamp('skin'), vein = T.paint.site.vein.map(rgbOf), veinU = vein.map((c) => pntU32(c)), hot = rgbOf(G.hot), seed = f.seed + 90;
  const N = G.sectors, bands = G.bands, put = (x, y, c, glow, a = 255) => { const k = y * W + x; C32[k] = c; if (glow) { E[k * 4] = glow[0]; E[k * 4 + 1] = glow[1]; E[k * 4 + 2] = glow[2]; E[k * 4 + 3] = a; } };
  const pass = hgrInPassage(f, tx + 0.5, ty + 0.5);
  for (let y = oy; y < oy + ATILE; y++)
    for (let x = ox; x < ox + ATILE; x++) {
      const q = y * W + x, pr = hgrPolar(x + 0.5, y + 0.5), r = pr.r;
      if (r >= H.r) continue;
      const t = tone[q];
      // the skin: a band of brightness at the edge, white at the wall, in
      // strokes; open where a way out passes through
      if (r >= H.r - H.skin && !pass) {
        const u = (r - (H.r - H.skin)) / H.skin, run = artHash(x >> 2, y, seed + 1) - 0.5;
        const i = clamp(Math.floor(u * skin.length + run * 1.6), 0, skin.length - 1);
        put(x, y, skin[i], i >= skin.length - 2 ? HART_STAR_RGB[6 - (skin.length - 1 - i)] : null, Math.round(120 + 100 * u));
        continue;
      }
      // the glass: facets by sector and band, each its own tone, brighter
      // towards the middle, in strokes; the seams between them the star's
      // veins, lit; the floor under the heart hot
      const sector = Math.floor(((pr.a + Math.PI) / (Math.PI * 2)) * N) % N, band = bands.findIndex((b) => r < b), bi = band < 0 ? bands.length : band;
      const base = Math.floor(artHash(sector, bi, seed + 2) * 3) + Math.max(0, bands.length - 1 - bi) - 1;
      const stroke = artHash(x >> 2, y, seed + 3) < 0.5 ? (artHash(x >> 1, y, seed + 4) < 0.5 ? -1 : 1) : 0;
      let c = glass[clamp(base + stroke + Math.round((t - 3) * 0.5), 0, glass.length - 1)];
      const sa = ((pr.a + Math.PI) / (Math.PI * 2)) * N, seamA = Math.abs(sa - Math.round(sa)) * (2 * Math.PI * r * ATILE / N) < 0.8 && r > 3;
      const seamR = bands.some((b) => Math.abs(r - b) * ATILE < 0.8);
      if (seamA || seamR) { put(x, y, veinU[artHash(x, y, seed + 5) < 0.3 ? 3 : 2], vein[2], 150); continue; }
      const hk = clamp(1 - r / G.hotR, 0, 1);
      if (hk > 0) { c = ugMix(c, hot, Math.pow(hk, 1.4) * G.hotMix); put(x, y, c, hk > 0.5 ? hot : null, Math.round(40 + 90 * hk)); continue; }
      put(x, y, c);
    }
}

// ---- what grows ------------------------------------------------------------
// The plants: each side's own, growing in thicker towards its opening, and
// none on the glass; each side with its own beds and cover
// (View.ugMeld[k]), painted in with its land (hgrPaintMeld). The glass
// itself grows nothing but moss on the rim's rock.
function hgrFlora(f) {
  const M = f.meld, N = f.w * f.h, clear = new Uint8Array(N);
  for (let ty = 0; ty < f.h; ty++) for (let tx = 0; tx < f.w; tx++) if (Math.hypot(tx + 0.5 - HOLLOW.x, (ty + 0.5 - HOLLOW.y) / HOLLOW.sq) < HOLLOW.r + 0.5) clear[ty * f.w + tx] = 1;
  placeUndergrowth(f, 'surface', { mask: new Float32Array(N) });
  const U0 = View.ug, all = [];
  View.ugMeld = M.to.map((_, k) => {
    const mask = new Float32Array(N);
    for (let i = 0; i < N; i++) if (M.sec[i] === k && !clear[i]) mask[i] = Math.pow(M.wt[i], T.outpost.meld.floraPow);
    for (const it of placeUndergrowth(f, hgrMeldSet(f, k), { mask, salt: k + 1, dens: T.outpost.meld.flora, look: hgrMeldLook(f, k) })) all.push(it);
    return View.ug;
  });
  View.ug = U0;
  return all.sort((a, b) => a.y - b.y);
}
