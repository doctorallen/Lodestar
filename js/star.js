'use strict';
// ---------------------------------------------------------------------------
// The Lodestar in the world (docs/VEINS.md). The seed-star stands in the
// open at the middle of the one map: its heart, a crystal many times the
// seed's size, hangs over the ground point STAR_AT (set as the world is
// built, placeStar), and its light lies on the land round it. The star is
// the first living node: your light fills in its light, and the dark
// doesn't hunt there.
//   placeStar(f, tx, ty)         opens the ground round (tx, ty) and sets f.star
//   magnitudeOf()                how much of the world lives (the veins, later)
//   starLight(d, x, y)           how lit the ground at world px (x, y) is, 0..1
//   litAt(d, x, y)               whether it counts as lit ground
//   sunOf(d)                     the daylight where the Kindler stands
//   drawStarUnder / drawStarOver the pool of light, and the heart over everything
// Numbers are in T.star.
// ---------------------------------------------------------------------------

// Where the heart hangs (tiles): its anchor (hartStar's, about half its
// height) over the star's ground point (gx, gy), its tip T.star.hang
// tiles clear of the ground (starAnchorSync, as the heart is drawn at its
// magnitude's size).
const STAR_AT = { x: 0, y: 0, gx: 0, gy: 0 };

// Opens a disc of ground round the star's point and marks it on the floor.
function placeStar(f, tx, ty) {
  const S = T.star, R = S.clear;
  for (let y = Math.max(1, ty - R - 1); y <= Math.min(f.h - 2, ty + R + 1); y++)
    for (let x = Math.max(1, tx - R - 1); x <= Math.min(f.w - 2, tx + R + 1); x++) {
      if (Math.hypot(x - tx, (y - ty) / S.squash) > R) continue;
      const i = y * f.w + x;
      f.tiles[i] = TILE_FLOOR; f.ore[i] = 0;
      if (f.haz) f.haz[i] = 0;
    }
  if (f.hazPts) f.hazPts = f.hazPts.filter((p) => Math.hypot(p.x - tx, p.y - ty) > R + 1);
  f.star = { x: tx, y: ty };
  STAR_AT.gx = STAR_AT.x = tx + 0.5; STAR_AT.gy = ty + 0.5;
  // (a guess until the heart's sprite is made: starAnchorSync)
  STAR_AT.y = STAR_AT.gy - S.hang - 4;
}
// The anchor from the heart's size: the tip T.star.hang tiles over the ground.
function starAnchorSync() {
  if (typeof document === 'undefined') return;
  const spr = starHeartSprite('star', starHeartScale());
  STAR_AT.y = STAR_AT.gy - T.star.hang - spr.tip / ATILE;
}

// The star's magnitude: how much of the world lives. (The veins, in the
// next step; for now what the save says, from 1.)
function magnitudeOf() { return Math.max(1, Math.floor((Save.data && Save.data.magnitude) || 1)); }

// How lit the ground at world px (x, y) is: 1 within the star's light, fading
// to 0 past its edge (T.star.lightR, lightFade, tiles).
function starLight(d, x, y) {
  const f = d && d.floor, S = T.star;
  // (the veins' grid, once it stands: veins.js; the Deep has only that)
  if (f && d.litG) return clamp(1 - veinDistAt(d, x, y) / S.lightFade, 0, 1);
  if (!f || !f.star) return 0;
  const dx = x / TILE - f.star.x - 0.5, dy = (y / TILE - f.star.y - 0.5) / S.squash;
  const R = S.lightR + S.lightPerMag * (magnitudeOf() - 1);
  return clamp(1 - (Math.hypot(dx, dy) - R) / S.lightFade, 0, 1);
}
// What a cast hits at the star's magnitude (T.magnitude.power).
function magnitudePower() { const P = T.magnitude.power; return P[Math.min(P.length - 1, magnitudeOf() - 1)]; }
// Lit ground: where the light is all but full.
function litAt(d, x, y) { return starLight(d, x, y) >= 0.85; }
// The daylight where the Kindler stands: day in the star's light, the
// dark's dusk beyond it (T.world.sun).
function sunOf(d) {
  if (!d || !d.p) return 1;
  const k = starLight(d, d.p.x, d.p.y);
  return lerp(T.world.sun.dark, T.world.sun.kindled, k);
}

// How many times the seed's size the heart is drawn (T.star.heart, by magnitude).
function starHeartScale(mag = magnitudeOf()) { const H = T.star.heart; return mag >= H.bigFrom ? H.big : H.small; }
// The heart: the star's sprite enlarged by whole pixels (and its halo).
const _starHeart = new Map();
function starHeartSprite(kind, k, frame = 0) {
  const key = `${kind}/${k}/${frame}`;
  if (_starHeart.has(key)) return _starHeart.get(key);
  const spr = kind === 'halo' ? hartHalo(3, frame) : hartStar(3);
  const up = (c) => { const n = document.createElement('canvas'); n.width = c.width * k; n.height = c.height * k; const g = n.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(c, 0, 0, n.width, n.height); return n; };
  const out = Object.assign({}, spr, { c: up(spr.c), ec: spr.ec ? up(spr.ec) : null, ax: spr.ax * k, ay: spr.ay * k, w: spr.w * k, h: spr.h * k });
  // (how far its lowest pixel, the tip, lies under the anchor)
  if (kind === 'star') { const g = spr.c.getContext('2d'), D = g.getImageData(0, 0, spr.c.width, spr.c.height).data; let low = spr.ay; for (let i = D.length - 1; i >= 0; i -= 4) if (D[i]) { low = Math.floor(i / 4 / spr.c.width) + 1; break; } out.tip = (low - spr.ay) * k; }
  _starHeart.set(key, out);
  return out;
}

// Under everything that walks: the pool of the star's light on the ground.
function drawStarUnder(d, ox, oy, lights) {
  const f = d.floor;
  if (!f.star) return;
  starAnchorSync();
  const S = T.star, mag = magnitudeOf(), cx = Math.round((f.star.x + 0.5) * ATILE) + ox, cy = Math.round((f.star.y + 0.5) * ATILE) + oy;
  const k = 0.92 + 0.08 * Math.sin(Game.realT * 1.7), lit = Intro.hub ? Intro.hub.lit : 1;
  lights.push({ x: cx, y: cy, r: TILE * (S.pool.r[0] + S.pool.r[1] * mag), i: S.pool.i * k * lit, c: rgb01(HART.star[5]) });
}
// The heart of the star, colossal, in its halo, with its own light,
// hanging clear of the ground with its shadow under it. It stands among
// the walkers by a point T.star.under tiles south of its ground point, so
// the Kindler walks behind it to the north and under it close by, and
// before it further south.
function drawStarHeart(d, a, ox, oy, lights) {
  const S = T.star, mag = magnitudeOf(), k = starHeartScale(mag);
  starAnchorSync();
  // (in the opening's last shot it comes down and lights: intro.js Intro.hub)
  const ih = Intro.hub, lit = ih ? ih.lit : 1, drop = ih ? Math.round(ih.starDY) : 0;
  const sx = Math.round(STAR_AT.x * ATILE) + ox, sy = Math.round(STAR_AT.y * ATILE + Math.sin(Game.realT * 0.8) * 3 * AP) + oy + drop;
  if (sx < -200 * AF || sx > View.w + 200 * AF || sy < -200 * AF || sy > View.h + 200 * AF) return;
  const halo = starHeartSprite('halo', k, Math.floor(Game.realT * 3) % 2), st = starHeartSprite('star', k);
  // its shadow on the ground under it, a little smaller as it bobs up
  if (!ih) drawShadow(sx, Math.round(STAR_AT.gy * ATILE) + oy, 9 * k, 6 + Math.sin(Game.realT * 0.8) * 1.5);
  View.ctx.globalAlpha = 0.7 * lit;
  View.ctx.drawImage(halo.c, sx - halo.ax, sy - halo.ay - 4 * k);
  View.ctx.globalAlpha = View.emCtx.globalAlpha = 0.35 + 0.65 * lit;
  drawArtSprite(st, sx - st.ax, sy - st.ay);
  View.ctx.globalAlpha = View.emCtx.globalAlpha = 1;
  lights.push({ x: sx, y: sy, r: TILE * (S.heartLight.r[0] + S.heartLight.r[1] * mag) * (0.35 + 0.65 * lit), i: (S.heartLight.i[0] + S.heartLight.i[1] * mag) * (0.3 + 0.7 * lit), c: rgb01(ART.pal.star[2]) });
}
// What of the star stands among the walkers: the heart, by its ground
// point (world px), never hidden by the rock.
function starProps(d) {
  const f = d.floor;
  if (!f.star) return [];
  return [{ x: (f.star.x + 0.5) * TILE, y: (f.star.y + 0.5 + T.star.under) * TILE, top: true, draw: drawStarHeart }];
}
// Over everything: nothing of the star now (the heart stands among the walkers).
function drawStarOver() {}
