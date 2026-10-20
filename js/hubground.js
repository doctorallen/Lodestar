'use strict';
// ---------------------------------------------------------------------------
// The outpost's ground, painted into the floor with its tiles (floor.js
// outpostFloor lays it out): the cleared site, and towards each opening
// the land beyond it coming in. Each side is painted a second time in its
// neighbour's look (its ground, its clime's marks, its plants' beds; its
// rock in pntPaintRock), and laid over the cleared ground pixel by pixel
// where the meld reaches, the border wandering and torn in streaks, so the
// site grades into the land round it. On the cleared earth: the starstone
// spreading out from the cradle as the star grows, faint trodden tracks
// out to the openings, and the landing pads. Every helper here is named hgr…; numbers are
// in T.outpost and T.paint.site.
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

// ---- the plaza's ground ------------------------------------------------------
// Starstone: the star's own growth spreading into the ground round its
// cradle, dark lodestone veined with gold, reaching further at every
// magnitude (T.outpost.ground: from reach[0] tiles at magnitude 1, reach[1]
// more each). Its edge isn't a circle: it wanders by a noise, and tendrils
// (the ridges of another noise) creep ahead of it into the earth. At tile
// point (gx, gy), for the star at magnitude mag: 0 the earth, 1 starstone,
// 2 a tendril; and how far in from its edge it is (tiles), and how far from
// the cradle, in _hgrStone.
const _hgrStone = { inset: 0, d: 0 };
function hgrStoneReach(mag) { const G = T.outpost.ground; return G.reach[0] + G.reach[1] * Math.max(0, mag - 1); }
function hgrStoneAt(f, gx, gy, R) {
  const G = T.outpost.ground, rg = f.site.ring, dx = gx - rg.x, dy = (gy - rg.y) / G.squash, d = Math.hypot(dx, dy);
  _hgrStone.d = d;
  if (d > R + G.wander + G.tendril[0]) return 0;
  const x = gx * ATILE, y = gy * ATILE, seed = f.seed + 40;
  const v = R - d + (pntNoise(x, y, G.wobble[0], G.wobble[0], seed) - 0.5) * 2 * G.wander + (pntNoise(x, y, G.wobble[1], G.wobble[1], seed + 1) - 0.5) * G.wander;
  _hgrStone.inset = v;
  if (v >= 0) return 1;
  // a tendril: a ridge of a noise, running out ahead, thinner further out
  const r = 1 - Math.abs(2 * pntNoise(x, y, G.tendril[2], G.tendril[2], seed + 2) - 1);
  return r > G.tendril[1] && -v < G.tendril[0] * (r - G.tendril[1]) / (1 - G.tendril[1]) ? 2 : 0;
}
// What's underfoot at world px x, y at home: 'metal' on a landing pad,
// the land beyond's clime where the meld has taken over ('frost',
// 'bloomfen'…), 'starstone', or 'earth'; null away from home. (For the
// footsteps' sound.)
function outpostGroundAt(x, y) {
  const d = Game.dive, f = d && d.hub ? d.floor : null;
  if (!f || !f.site) return null;
  const gx = x / TILE, gy = y / TILE, Ps = T.paint.site;
  if (f.site.pads.some((p) => Math.hypot(gx - p.x, (gy - p.y) / Ps.squash) < Ps.padR)) return 'metal';
  const k = hgrMeldAt(f, x * AP, y * AP);
  if (k >= 0) return hgrMeldTerr(f, k).clime || 'earth';
  return hgrStoneAt(f, gx, gy, hgrStoneReach(magnitudeOf(Save.data.star))) ? 'starstone' : 'earth';
}
// The footsteps' material at home (audio.js sndGroundAt): starstone rings
// like stone, the cleared earth is dirt, the land beyond its own clime's.
if (typeof Snd !== 'undefined') Snd.hubGround = (x, y) => {
  const g = outpostGroundAt(x, y);
  return !g ? null : g === 'starstone' ? 'stone' : g === 'earth' ? 'dirt' : g === 'metal' ? 'metal' : SND_CLIME_GROUND[g] || 'dirt';
};
// The cleared earth's own marks, the starstone, the trodden tracks out to
// the openings and the landing pads, over one tile's ground (paintTileArt,
// after the ground and before what grows on it, so the shadows of what
// stands there still fall on them). Each takes its tone from the ground's
// (View.groundTone), so the strokes and the light's patches carry on
// across them. In the meld's pass (the land beyond, painted again) only
// the pads: the land beyond covers the rest.
function hgrPaintGround(P, f, tx, ty, ox, oy) {
  const S = f.site, Ps = T.paint.site, G = T.outpost.ground, R = View.rockPx, tone = View.groundTone, W = P.w, C32 = P.col32 || (P.col32 = new Uint32Array(P.col.buffer)), E = P.em;
  if (!S) return;
  const gx0 = tx + 0.5, gy0 = ty + 0.5, sq = Ps.squash, px1 = 1 / ATILE, base = !(f.meldPainting >= 0);
  const reach = hgrStoneReach(magnitudeOf(Save.data.star)), rg = S.ring;
  const stoneNear = base && Math.hypot(gx0 - rg.x, (gy0 - rg.y) / G.squash) < reach + G.wander + G.tendril[0] + 1;
  const pads = S.pads.filter((p) => Math.abs(p.x - gx0) < Ps.padR + 1.5 && Math.abs(p.y - gy0) < Ps.padR * sq + 1.5);
  const paths = base ? S.paths.filter((p) => outpostSegDist(gx0, gy0, p.ax, p.ay, p.bx, p.by)[0] < Ps.pathW + 1.5) : [];
  if (!stoneNear && !pads.length && !paths.length) return;
  const DK = hgrRamp('deck'), LS = hgrRamp('lodestone'), V = Ps.vein.map((h) => pntU32(rgbOf(h))), VR = Ps.vein.map(rgbOf), mark = Ps.mark.map(pntU32), star = Ps.star.map(pntU32), lamp = rgbOf(Ps.lamp), seed = f.seed + 50;
  const put = (x, y, c, glow, a = 255) => { const k = y * W + x; C32[k] = c; if (glow) { E[k * 4] = glow[0]; E[k * 4 + 1] = glow[1]; E[k * 4 + 2] = glow[2]; E[k * 4 + 3] = a; } };
  for (let y = oy; y < oy + ATILE; y++)
    for (let x = ox; x < ox + ATILE; x++) {
      const q = y * W + x;
      if (R[q]) continue;
      const gx = (x + 0.5) / ATILE, gy = (y + 0.5) / ATILE, t = tone[q];
      // the trodden tracks: the earth worn a shade darker, in broken
      // streaks, along the way from the cradle to each opening
      for (const p of paths) {
        const [dd] = outpostSegDist(gx, gy, p.ax, p.ay, p.bx, p.by);
        if (dd > Ps.pathW || pntNoise(x, y, 14, 4, seed + 1) < 0.15 + dd / Ps.pathW * 0.45) continue;
        C32[q] = ugDarken(C32[q], Ps.trod);
      }
      // the starstone: dark lodestone in the ground's strokes, gold veins
      // through it, brighter and glowing nearer the cradle; a lit front of
      // gold where it meets the earth; tendrils of it out ahead
      const st = stoneNear ? hgrStoneAt(f, gx, gy, reach) : 0;
      if (st) {
        const near = clamp(1 - _hgrStone.d / Math.max(4, reach), 0, 1), inset = _hgrStone.inset;
        const c = LS[clamp(Math.round(t * 0.85 + (artHash(x >> 2, y, seed + 2) < 0.15 ? 1 : 0)), 0, 6)];
        let vk = -1;
        const v1 = 1 - Math.abs(2 * pntNoise(x, y, G.vein[0], G.vein[1], seed + 3) - 1), v2 = 1 - Math.abs(2 * pntNoise(x, y, G.vein[2], G.vein[3], seed + 4) - 1);
        // (a tendril's core gold, its sides lodestone; the front a broken
        // line of gold; then the veins, the bright and the fine)
        if (st === 2) vk = artHash(x >> 1, y, seed + 7) < 0.55 ? 2 : -1;
        else if (inset < G.front) vk = artHash(x >> 2, y, seed + 5) < 0.45 ? 1 : -1;
        else if (v1 > G.veinCut[0]) vk = v1 > (1 + G.veinCut[0]) / 2 ? 3 : 2;
        else if (v2 > G.veinCut[1]) vk = 1;
        if (vk >= 0) {
          // (the bright veins near the cradle glow faintly, in loose
          // strokes: the stroke a pixel is in is lit or not)
          vk = clamp(vk + (near > 0.55 && vk >= 2 ? 1 : 0) - (t < 2 ? 1 : 0), 0, 4);
          const glow = vk >= 3 && artHash(Math.floor((x + (y & 3) * 2) / 5), y, seed + 6) < G.glint[0] + near * (1 - G.glint[0]) && near > 0.1;
          put(x, y, V[vk], glow ? VR[vk] : null, Math.round(255 * G.glint[1] * (0.3 + near * 0.7)));
        } else put(x, y, c);
      }
      // the landing pads: a disc of plates, a ring of amber, the seed-star
      // in the middle, and four landing lights
      for (const p of pads) {
        const dx = gx - p.x, dy = (gy - p.y) / sq, r = Math.hypot(dx, dy);
        if (r > Ps.padR) continue;
        let c = DK[clamp(Math.round(2.1 + t * 0.75), 0, 6)];
        if (r > Ps.padR - 1.5 * px1) c = DK[0];
        else if (r > Ps.padR - 2.5 * px1) c = DK[6];
        else if (Math.abs(r - Ps.padR * 0.78) * ATILE < 1.3) c = mark[1];
        else if (Math.abs(r - Ps.padR * 0.78) * ATILE < 2.3) c = mark[0];
        // (the seed-star: eight points, the long four upright and across)
        const a = Math.atan2(dy, dx), arm = Math.abs(Math.cos(a * 4)), len = (Math.abs(Math.cos(a * 2)) > 0.7 ? 0.95 : 0.6) * Ps.padR * 0.5;
        if (r < len && arm > 0.72 + r / len * 0.25) c = star[r < len * 0.4 ? 1 : 0];
        put(x, y, c);
        for (let n = 0; n < 4; n++) { const b = n * Math.PI / 2 + Math.PI / 4, lx = p.x + Math.cos(b) * Ps.padR * 0.9, ly = p.y + Math.sin(b) * Ps.padR * 0.9 * sq; if (Math.abs(gx - lx) * ATILE < 1.1 && Math.abs(gy - ly) * ATILE < 1.1) put(x, y, pntU32(lamp), lamp); }
      }
    }
}
// The ground's materials, seven tones each (T.paint.site), as whole pixels.
const _hgrRamps = {};
function hgrRamp(id) { return _hgrRamps[id] || (_hgrRamps[id] = Uint32Array.from(T.paint.site[id].map((h) => pntU32(rgbOf(h))))); }

// ---- what grows ------------------------------------------------------------
// The plants: each side's own, growing in thicker towards its opening, and
// none on the pads or the starstone; each side with its own beds and
// cover (View.ugMeld[k]), painted in with its land (hgrPaintMeld). The
// cleared ground's own (View.ug) grows nothing but moss on the rock.
function hgrFlora(f) {
  const S = f.site, M = f.meld, N = f.w * f.h, Ps = T.paint.site, sq = Ps.squash, clear = new Uint8Array(N);
  const reach = hgrStoneReach(magnitudeOf(Save.data.star));
  for (let ty = 0; ty < f.h; ty++) for (let tx = 0; tx < f.w; tx++) {
    const gx = tx + 0.5, gy = ty + 0.5;
    if (S.pads.some((p) => Math.hypot(gx - p.x, (gy - p.y) / sq) < Ps.padR + 1) || hgrStoneAt(f, gx, gy, reach + 0.5) === 1) clear[ty * f.w + tx] = 1;
  }
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
