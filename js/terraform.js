'use strict';
// ---------------------------------------------------------------------------
// Kindled land terraforming by the light. Once a territory is kindled its
// spire is the star's own ground, as the cradle is at home: starstone
// spreads out from it into the land (dark lodestone in the ground's
// strokes, gold veins through it, a lit front where it meets the earth,
// tendrils creeping ahead), further as the star's magnitude grows; past
// the stone the ground greens in loose strokes, thickest at the stone's
// edge and fading out, with motes of the star's gold lying in it; what
// grows there grows thicker (render.js placeFlora); and sparks of light
// rise off the stone (frontier.js). Painted into the floor with its tiles
// (render.js paintTileArt, after the ground and before what grows on it),
// so the shadows of what stands there still fall on it. Numbers are in
// T.terraform; the stone's ramps are the outpost's (T.paint.site).
// ---------------------------------------------------------------------------

// How far the starstone has spread from the spire (tiles), 0 where the
// land isn't kindled. (f.kindled: frontier.js enterTerritory, kindleTerritory.)
function terraReach(f) {
  if (!f || !f.star) return 0;
  const R = T.terraform.reach;
  return R[0] + R[1] * Math.max(0, magnitudeOf() - 1);
}
// Is tile point (gx, gy) on the stone: 0 no, 1 yes, 2 a tendril; and how
// far in from its edge it is (tiles), and how far from the spire, in
// _terraStone.
const _terraStone = { inset: 0, d: 0 };
function terraStoneAt(f, gx, gy, R) {
  const G = T.terraform, dx = gx - f.star.x - 0.5, dy = (gy - f.star.y - 0.5) / G.squash, d = Math.hypot(dx, dy);
  _terraStone.d = d;
  if (d > R + G.wander + G.tendril[0]) return 0;
  const x = gx * ATILE, y = gy * ATILE, seed = f.seed + 70;
  const v = R - d + (pntNoise(x, y, G.wobble[0], G.wobble[0], seed) - 0.5) * 2 * G.wander + (pntNoise(x, y, G.wobble[1], G.wobble[1], seed + 1) - 0.5) * G.wander;
  _terraStone.inset = v;
  if (v >= 0) return 1;
  const r = 1 - Math.abs(2 * pntNoise(x, y, G.tendril[2], G.tendril[2], seed + 2) - 1);
  return r > G.tendril[1] && -v < G.tendril[0] * (r - G.tendril[1]) / (1 - G.tendril[1]) ? 2 : 0;
}

// The stone and the green over one tile's ground.
function terraPaintGround(P, f, tx, ty, ox, oy) {
  const reach = terraReach(f);
  if (!reach) return;
  const G = T.terraform, Ps = T.paint.site, R = View.rockPx, tone = View.groundTone, W = P.w, C32 = P.col32 || (P.col32 = new Uint32Array(P.col.buffer)), E = P.em;
  const gx0 = tx + 0.5, gy0 = ty + 0.5, far = reach * G.bloom, d0 = Math.hypot(gx0 - f.star.x - 0.5, (gy0 - f.star.y - 0.5) / G.squash);
  if (d0 > far + 1) return;
  const stoneNear = d0 < reach + G.wander + G.tendril[0] + 1;
  const LS = Ps.lodestone.map(rgbOf), V = Ps.vein.map((h) => pntU32(rgbOf(h))), VR = Ps.vein.map(rgbOf), green = rgbOf(G.green), gold = rgbOf(G.gold), goldU = pntU32(gold), seed = f.seed + 80;
  const put = (x, y, c, glow, a = 255) => { const k = y * W + x; C32[k] = c; if (glow) { E[k * 4] = glow[0]; E[k * 4 + 1] = glow[1]; E[k * 4 + 2] = glow[2]; E[k * 4 + 3] = a; } };
  for (let y = oy; y < oy + ATILE; y++)
    for (let x = ox; x < ox + ATILE; x++) {
      const q = y * W + x;
      if (R[q]) continue;
      const gx = (x + 0.5) / ATILE, gy = (y + 0.5) / ATILE, t = tone[q];
      const st = stoneNear ? terraStoneAt(f, gx, gy, reach) : 0;
      if (st) {
        const near = clamp(1 - _terraStone.d / Math.max(3, reach), 0, 1), inset = _terraStone.inset;
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
      // past the stone: the star's gold veins running on out through the
      // land's own ground, fewer further out, lit near the stone
      const d = Math.hypot(gx - f.star.x - 0.5, (gy - f.star.y - 0.5) / G.squash);
      if (d > far) continue;
      const k = Math.pow(1 - Math.max(0, d - reach) / Math.max(0.5, far - reach), G.bloomPow);
      const v1 = 1 - Math.abs(2 * pntNoise(x, y, G.vein[0], G.vein[1], seed + 3) - 1);
      if (v1 > G.veinCut[0] && artHash(x >> 2, y >> 1, seed + 13) < k * G.veinOut) {
        const vk = clamp((v1 > (1 + G.veinCut[0]) / 2 ? 3 : 2) - (t < 2 ? 1 : 0), 0, 4), glow = vk >= 3 && k > 0.5;
        put(x, y, V[vk], glow ? VR[vk] : null, Math.round(255 * G.glint[1] * k));
        continue;
      }
      // the green, in loose strokes (the stroke a pixel is in takes it or
      // not), strongest at the stone's edge and thinning out to the
      // bloom's reach; a gold mote now and then, lit
      const stroke = artHash(Math.floor((x + (y & 3) * 2) / 5), y, seed + 11);
      if (stroke < k * G.bloomK) {
        // (lighter ground greens more: the light is on it)
        C32[q] = ugMix(C32[q], green, G.greenMix * (0.6 + 0.4 * clamp(t / 4, 0, 1)));
        if (artHash(x, y, seed + 12) < G.mote * k) put(x, y, goldU, gold, Math.round(140 + 100 * k));
      }
    }
}
