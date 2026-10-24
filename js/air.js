'use strict';
// ---------------------------------------------------------------------------
// Air beyond the beam (the paint lab's AIR, T.air; cosmetic). The beam has
// air in it already (render.js drawBeamAir); this puts something between
// the viewer and the whole picture: the clime's motes drifting everywhere,
// a few dozen pixels in its glow colour, lit by the light like all else, so
// they're bright in the beam and nearly gone outside it; a haze, a slow
// broad noise in the ground's lightest tone over dark land, lifting the far
// ground a touch; and a vignette in the violet black at the view's corners.
// On the colour layer, never the glow layer. Nothing is seeded: FX_R-grade.
// ---------------------------------------------------------------------------

const Air = { haze: null, hazeKey: '', vig: null, vigKey: '' };

// The clime's mote colour: its glow; the star's gold at home.
function airColour(d) {
  if (d.hub) return ART.pal.star[2];
  const b = climeLookAtPx(d.floor, d.p.x, d.p.y);
  return (b && b.glow) || '#e0e0ff';
}

// The haze over the ground, before anything stands on it. Only in dark
// land (as dark as the floor was painted for), and never at home.
function airHaze(d, ox, oy) {
  if (!Lab.on('air') || d.hub) return;
  const A = T.air.haze, dark = View.darkHere || 0;
  if (dark < 0.05) return;
  const b = climeLookAtPx(d.floor, d.p.x, d.p.y), tone = pntLook(b).groundRgb, c = tone[tone.length - 1];
  const key = c.join(',');
  if (!Air.haze || Air.hazeKey !== key) {
    // a tile of broad noise in the tone, drawn smoothly at A.scale art px
    const n = 32, [t, tx] = makeCanvas(n, n), img = tx.createImageData(n, n), D = img.data;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      // (periodic across the tile, so it drifts without a seam)
      const u = x / n, v = y / n, k = (y * n + x) * 4;
      const nv = 0.5 + 0.25 * Math.sin(u * 2 * Math.PI) * Math.cos(v * 2 * Math.PI * 2 + 1.3) + 0.25 * Math.sin(v * 2 * Math.PI + u * 4 * Math.PI);
      D[k] = c[0]; D[k + 1] = c[1]; D[k + 2] = c[2]; D[k + 3] = Math.round(255 * Math.max(0, Math.min(1, nv)));
    }
    tx.putImageData(img, 0, 0);
    Air.haze = t; Air.hazeKey = key;
  }
  const x = View.ctx, s = A.scale, drift = Game.realT * A.speed;
  x.save();
  x.globalAlpha = A.alpha * dark;
  x.imageSmoothingEnabled = true;
  const w = View.w, h = View.h, x0 = -(((-ox + drift) % s) + s) % s - s, y0 = -(((-oy) % s) + s) % s - s;
  for (let yy = y0; yy < h; yy += s) for (let xx = x0; xx < w; xx += s) x.drawImage(Air.haze, xx, yy, s, s);
  x.restore();
}

// The motes, among the actors: fixed to the world, drifting, so they're lit
// where they are. per: motes a 100 × 100 art px of the floor, each a pixel
// (a few two px wide).
function airMotes(d, ox, oy) {
  if (!Lab.on('air')) return;
  // (the motes lie over the floor in squares `per` px across, the same in
  // each; only the squares under the view are drawn, so a large floor
  // costs no more than a small one)
  const A = T.air.motes, f = d.floor, per = Math.min(Math.max(f.w, f.h) * ATILE, 1024), t = Game.realT;
  const n = Math.round((per * per) / 10000 * A.per), col = airColour(d), x = View.ctx;
  x.fillStyle = col;
  x.globalAlpha = A.alpha;
  const w = View.w, h = View.h, kx0 = Math.floor(-ox / per), kx1 = Math.floor((-ox + w) / per), ky0 = Math.floor(-oy / per), ky1 = Math.floor((-oy + h) / per);
  for (let i = 0; i < n; i++) {
    const h1 = artHash(i, 1, 0x41), h2 = artHash(i, 2, 0x41), h3 = artHash(i, 3, 0x41), h4 = artHash(i, 4, 0x41);
    const sp = A.speed[0] + (A.speed[1] - A.speed[0]) * h3;
    let wx = (h1 * per + Math.sin(t * 0.8 + i) * A.sway + t * sp * 0.3) % per, wy = (h2 * per - t * sp) % per;
    if (wx < 0) wx += per;
    if (wy < 0) wy += per;
    for (let ky = ky0; ky <= ky1; ky++) for (let kx = kx0; kx <= kx1; kx++) {
      const sx = Math.round(wx + kx * per) + ox, sy = Math.round(wy + ky * per) + oy;
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      x.fillRect(sx, sy, h4 < A.wide ? 2 : 1, 1);
    }
  }
  x.globalAlpha = 1;
}

// The vignette, after the light: the corners sink to the violet black.
function airVignette(d) {
  if (!Lab.on('air')) return;
  const A = T.air.vignette, w = View.w, h = View.h, key = w + 'x' + h;
  if (!Air.vig || Air.vigKey !== key) {
    const [c, cx] = makeCanvas(w, h), g = cx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * A.from, w / 2, h / 2, Math.hypot(w, h) / 2);
    g.addColorStop(0, 'rgba(7,5,12,0)'); g.addColorStop(1, `rgba(7,5,12,${A.alpha})`);
    cx.fillStyle = g; cx.fillRect(0, 0, w, h);
    Air.vig = c; Air.vigKey = key;
  }
  View.ctx.drawImage(Air.vig, 0, 0);
}
