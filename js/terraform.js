'use strict';
// ---------------------------------------------------------------------------
// The land terraforming by the light (DESIGN.md). Along every living vein
// and round every living node and the star, the ground turns: starstone
// along the line (dark lodestone in the ground's strokes, gold veins
// through it, a lit front where it meets the earth, tendrils creeping
// ahead), the ground greening in loose strokes out past the light's edge,
// thickest at the stone and fading out, with motes of the star's gold
// lying in it. Painted into the floor with its tiles (render.js
// paintTileArt, after the ground and before what grows on it), so the
// shadows of what stands there still fall on it. Where the light is comes
// from the veins' grid (veins.js veinDistTile: how far a point lies past
// the nearest light's edge, tiles, negative inside). Numbers are in
// T.terraform; the stone's ramps are the old outpost's (T.paint.site).
// ---------------------------------------------------------------------------

// Whether anything on this floor is lit at all (the grid stands).
function terraReach(f) { const d = Game.dive; return d && d.floor === f && d.litG ? 1 : 0; }
// Is tile point (gx, gy) on the stone: 0 no, 1 yes, 2 a tendril; and how
// far in from its edge it is (tiles), in _terraStone. The stone runs
// T.terraform.stoneW tiles either side of the light's line, so a point
// stoneW short of the light's edge is on it.
const _terraStone = { inset: 0, d: 0 };
function terraStoneAt(d, gx, gy) {
  const G = T.terraform, u = -veinDistTile(d, gx, gy), band = veinBand(), v0 = u - (band - G.stoneW);
  _terraStone.d = band - u;
  if (v0 < -(G.wander + G.tendril[0])) return 0;
  const x = gx * ATILE, y = gy * ATILE, seed = d.floor.seed + 70;
  const v = v0 + (pntNoise(x, y, G.wobble[0], G.wobble[0], seed) - 0.5) * 2 * G.wander + (pntNoise(x, y, G.wobble[1], G.wobble[1], seed + 1) - 0.5) * G.wander;
  _terraStone.inset = v;
  if (v >= 0) return 1;
  const r = 1 - Math.abs(2 * pntNoise(x, y, G.tendril[2], G.tendril[2], seed + 2) - 1);
  return r > G.tendril[1] && -v < G.tendril[0] * (r - G.tendril[1]) / (1 - G.tendril[1]) ? 2 : 0;
}

// The stone and the green over one tile's ground.
function terraPaintGround(P, f, tx, ty, ox, oy) {
  const d = Game.dive;
  if (!terraReach(f)) return;
  const G = T.terraform, Ps = T.paint.site, R = View.rockPx, tone = View.groundTone, W = P.w, OFF = -P.oy * W - P.ox, C32 = P.col32 || (P.col32 = new Uint32Array(P.col.buffer)), E = P.em;
  // how far in the light this tile's middle lies (tiles; negative out past it)
  const band = veinBand(), u0 = -veinDistTile(d, tx + 0.5, ty + 0.5);
  if (u0 < -(G.bloomOut + 1.5)) return;
  const stoneNear = u0 > band - G.stoneW - G.wander - G.tendril[0] - 1.5;
  const LS = Ps.lodestone.map(rgbOf), V = Ps.vein.map((h) => pntU32(rgbOf(h))), VR = Ps.vein.map(rgbOf), green = rgbOf(G.green), gold = rgbOf(G.gold), goldU = pntU32(gold), seed = f.seed + 80;
  const put = (x, y, c, glow, a = 255) => { const k = y * W + x + OFF; C32[k] = c; if (glow) { E[k * 4] = glow[0]; E[k * 4 + 1] = glow[1]; E[k * 4 + 2] = glow[2]; E[k * 4 + 3] = a; } };
  for (let y = oy; y < oy + ATILE; y++)
    for (let x = ox; x < ox + ATILE; x++) {
      const q = y * W + x + OFF;
      if (R[q]) continue;
      const gx = (x + 0.5) / ATILE, gy = (y + 0.5) / ATILE, t = tone[q];
      const st = stoneNear ? terraStoneAt(d, gx, gy) : 0;
      if (st) {
        // (near: how deep in the light it lies, for the glints)
        const near = clamp(1 - _terraStone.d / Math.max(3, band), 0, 1), inset = _terraStone.inset;
        // (the land's own ground turning to lodestone: its colour half
        // way to the stone's, so the clime still shows through)
        const c = ugMix(C32[q], LS[clamp(Math.round(t * 0.85 + (artHash(x >> 2, y, seed + 2) < 0.15 ? 1 : 0)), 0, 6)], G.stoneMix);
        let vk = -1;
        const v1 = 1 - Math.abs(2 * pntNoise(x, y, G.vein[0], G.vein[1], seed + 3) - 1), v2 = 1 - Math.abs(2 * pntNoise(x, y, G.vein[2], G.vein[3], seed + 4) - 1);
        if (st === 2) vk = artHash(x >> 1, y, seed + 7) < 0.55 ? 2 : -1;
        else if (inset < G.front) vk = artHash(x >> 2, y, seed + 5) < 0.45 ? 1 : -1;
        else if (v1 > G.veinCut[0]) vk = v1 > (1 + G.veinCut[0]) / 2 ? 3 : 2;
        else if (v2 > G.veinCut[1]) vk = 1;
        if (vk >= 0) {
          vk = clamp(vk + (near > 0.55 && vk >= 2 ? 1 : 0) - (t < 2 ? 1 : 0), 0, 4);
          const glow = vk >= 3 && artHash(Math.floor((x + (y & 3) * 2) / 5), y, seed + 6) < G.glint[0] + near * (1 - G.glint[0]);
          put(x, y, V[vk], glow ? VR[vk] : null, Math.round(255 * G.glint[1] * (0.4 + near * 0.6)));
        } else put(x, y, c);
        continue;
      }
      // past the stone: the green, in loose strokes (the stroke a pixel is
      // in takes it or not), strongest at the stone and thinning out past
      // the light's edge; gold veins running on through the land, fewer
      // further out; a gold mote now and then, lit
      const u = -veinDistTile(d, gx, gy);
      if (u < -G.bloomOut) continue;
      const k = Math.pow(clamp((u + G.bloomOut) / (G.bloomOut + band * 0.5), 0, 1), G.bloomPow);
      const v1 = 1 - Math.abs(2 * pntNoise(x, y, G.vein[0], G.vein[1], seed + 3) - 1);
      if (v1 > G.veinCut[0] && artHash(x >> 2, y >> 1, seed + 13) < k * G.veinOut) {
        const vk = clamp((v1 > (1 + G.veinCut[0]) / 2 ? 3 : 2) - (t < 2 ? 1 : 0), 0, 4), glow = vk >= 3 && k > 0.5;
        put(x, y, V[vk], glow ? VR[vk] : null, Math.round(255 * G.glint[1] * k));
        continue;
      }
      const stroke = artHash(Math.floor((x + (y & 3) * 2) / 5), y, seed + 11);
      if (stroke < k * G.bloomK) {
        // (lighter ground greens more: the light is on it)
        C32[q] = ugMix(C32[q], green, G.greenMix * (0.6 + 0.4 * clamp(t / 4, 0, 1)));
        if (artHash(x, y, seed + 12) < G.mote * k) put(x, y, goldU, gold, Math.round(140 + 100 * k));
      }
    }
}
