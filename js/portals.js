'use strict';
// ---------------------------------------------------------------------------
// Portals: the way down into a territory's Deep and on through its sites,
// and the one at the outpost every sortie sets out through. Each is a standing ring of lodestone on
// a plinth, its face a slow swirl in the colour of where it leads (warm
// daylight for the surface, cool blue for a cave, amber for a ruin, red for
// a Keeper's Lair, green for a Deep Vein), and the keystone carries that
// place's glyph. They're nothing like a rift's violet tears.
//
// The same moment carries the diver across a territory's edge (no portal:
// the view closes on the diver, in daylight's colour into lit land, in the
// dusk's into dark land) and from spire to spire.
//
// Stepping through: the world holds still while the view closes on the
// portal's face in its colour (T.portal.enter), the next site is entered,
// and the view opens again from the diver (T.portal.arrive). No shake.
//
// A portal stands on its floor's TILE_PORTAL, so generation knows nothing
// of how it looks.
// ---------------------------------------------------------------------------

// Each destination's face, deep to light, and its keystone glyph (pixels
// round the glyph's middle).
const PORTAL_LOOKS = {
  surface: { face: ['#4a3618', '#a07838', '#e8c880', '#fff6dc'], glyph: [[0, -1], [-1, 0], [0, 0], [1, 0], [0, 1]] },
  cave: { face: ['#0c1830', '#1e3a6c', '#4472b4', '#aecbf2'], glyph: [[-1, 1], [0, 0], [1, 1], [0, -1]] },
  ruin: { face: ['#341604', '#7c3a08', '#cc7616', '#ffc45e'], glyph: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]] },
  lair: { face: ['#2a0606', '#6a1010', '#c22a1c', '#ff7a5a'], glyph: [[-1, 0], [1, 0], [0, 1]] },
  deep: { face: ['#061e18', '#0e4832', '#1e8858', '#7ce0a0'], glyph: [[0, -1], [-1, 0], [1, 0], [0, 1]] },
  // (no portal has it: crossing into dark land)
  dusk: { face: ['#0c0e18', '#1c2236', '#3a4462', '#8a96b8'], glyph: [] },
};
// The colour that stands for each destination elsewhere (the compass, the map).
const ZONE_SIGNS = Object.fromEntries(Object.entries(PORTAL_LOOKS).map(([z, l]) => [z, l.face[3]]));

// The lodestone: dark iron, with veins of the star's metal.
const LODESTONE = ['#111316', '#22262c', '#3a4048', '#5e6670'];
// The sprite's size, and its ring: centre, outer and inner (face) radii,
// in world px (it's painted at AP art px to each).
const PORTAL_W = 25, PORTAL_H = 32, PORTAL_C = { x: 12, y: 15 }, PORTAL_OUT = [11.6, 13.4], PORTAL_IN = [7.4, 9.2];
const PORTAL_FRAMES = 24, PORTAL_SPIN = 3; // face frames, seconds a turn
// The ring's middle in the sprite, in art px.
const PORTAL_AC = { x: Math.round((PORTAL_C.x + 0.5) * AP - 0.5), y: Math.round((PORTAL_C.y + 0.5) * AP - 0.5) };

const _portalSprites = {};
// The ring, plinth and keystone for one destination (its runes and glyph
// glow in its colour), painted art pixel by art pixel: each asks where it
// is in world px (u, v) and takes the shape's tone there. Feet (ax, ay) at
// the plinth's front.
function portalSprite(zone) {
  if (_portalSprites[zone]) return _portalSprites[zone];
  const L = PORTAL_LOOKS[zone] || PORTAL_LOOKS.cave, W = Math.ceil(PORTAL_W * AP), H = Math.ceil(PORTAL_H * AP), P = pixBuf(W, H), S = LODESTONE, C = PORTAL_C;
  const solid = new Uint8Array(W * H);
  const put = (x, y, col, glow) => { if (x < 0 || y < 0 || x >= W || y >= H) return; putPx(P, x, y, col, glow); solid[y * W + x] = 1; };
  // the art px of one world px (x, y), filled
  const blk = (x, y, col, glow) => { for (let j = Math.round(y * AP); j < Math.round((y + 1) * AP); j++) for (let i = Math.round(x * AP); i < Math.round((x + 1) * AP); i++) put(i, j, col, glow); };
  const at = (n) => (n + 0.5) / AP - 0.5;
  // a tone by form, cut hard (no dither on a prop)
  const step = (v) => S[clamp(Math.floor(v * 4), 0, 3)];
  // the plinth: a slab, lit along its top
  const py0 = Math.round(26.5 * AP + 0.5);
  for (let y = py0; y < Math.round(31.5 * AP + 0.5); y++)
    for (let x = 0; x < W; x++) {
      const u = at(x), v = at(y);
      if (u < 0.5 || u >= 23.5 || (y === py0 && (u < 2.5 || u >= 21.5))) continue;
      put(x, y, y === py0 ? S[3] : y === py0 + 1 ? step(0.62) : step(0.3 - (v - 29) * 0.06));
    }
  // the ring: lit from the top left on its outer side, from the bottom
  // right inside, flat across its face
  for (let y = 0; y < Math.round(29.5 * AP + 0.5); y++)
    for (let x = 0; x < W; x++) {
      const dx = at(x) - C.x, dy = at(y) - C.y, eo = (dx / PORTAL_OUT[0]) ** 2 + (dy / PORTAL_OUT[1]) ** 2, ei = (dx / PORTAL_IN[0]) ** 2 + (dy / PORTAL_IN[1]) ** 2;
      if (eo > 1 || ei <= 1) continue;
      const m = Math.hypot(dx, dy) || 1, nx = dx / m, ny = dy / m;
      let v;
      if (eo > 0.82) v = 0.55 - 0.42 * (nx * 0.6 + ny * 0.8);
      else if (ei < 1.25) v = 0.4 + 0.4 * (nx * 0.6 + ny * 0.8);
      else v = 0.62 - 0.12 * ny;
      let col = step(v);
      // veins of star metal in the stone, in short runs
      if (artNoise(x, y * 2, 2.5 * T.art.px, 0x10de) > 0.66) col = ART.pal.star[1];
      put(x, y, col);
    }
  // runes round the ring, in the destination's colour
  for (const a of [-2.5, -0.64, 0.5, 2.64]) {
    const r = (PORTAL_OUT[0] + PORTAL_IN[0]) / 2, x = Math.round(C.x + Math.cos(a) * r), y = Math.round(C.y + Math.sin(a) * ((PORTAL_OUT[1] + PORTAL_IN[1]) / 2));
    blk(x, y, L.face[3], true);
    blk(x, y + 1, L.face[2], true);
  }
  // the keystone, lit on its top and left, with the destination's glyph
  // in a dark hollow
  const kx = PORTAL_AC.x, kw = Math.round(3.5 * AP), kh = Math.round(7 * AP), hw = Math.round(1.5 * AP);
  for (let y = 0; y < kh; y++) for (let x = kx - kw; x <= kx + kw; x++) put(x, y, y === 0 || x === kx - kw ? S[3] : x === kx + kw || y === kh - 1 ? S[1] : S[2]);
  const hy = Math.round(kh / 2);
  for (let y = hy - hw; y <= hy + hw; y++) for (let x = kx - hw; x <= kx + hw; x++) put(x, y, S[0]);
  const glyph = [0, 1, 2].map(() => ['.', '.', '.']);
  for (const [i, j] of L.glyph) glyph[j + 1][i + 1] = 'G';
  const g = artScaleRows(glyph.map((r) => r.join('')), AP), gw = g[0].length, gh = g.length;
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) if (g[j][i] === 'G') put(kx - (gw >> 1) + i, hy - (gh >> 1) + j, L.face[3], true);
  // laid in strokes, no outline, the shadowed rim kept but on the open
  // face (pflora.js)
  pflRepaintProp(P, solid, S, 0x9071, (x, y) => ((at(x) - C.x) / PORTAL_IN[0]) ** 2 + ((at(y) - C.y) / PORTAL_IN[1]) ** 2 <= 1);
  const s = spriteFromBuf(P);
  s.ax = (C.x + 0.5) * AP; s.ay = (PORTAL_H - 2) * AP; s.k = AP;
  return (_portalSprites[zone] = s);
}

// The face, one frame of its swirl: two arms turning about a bright eye,
// darker towards the ring, in hard bands. All of it glows.
const _portalFaces = {};
function portalFace(zone, k) {
  const key = zone + k;
  if (_portalFaces[key]) return _portalFaces[key];
  const L = PORTAL_LOOKS[zone] || PORTAL_LOOKS.cave, rx = PORTAL_IN[0] * AP, ry = PORTAL_IN[1] * AP;
  const cx = Math.ceil(rx), cy = Math.ceil(ry), w = cx * 2 + 1, h = cy * 2 + 1, P = pixBuf(w, h), ph = (k / PORTAL_FRAMES) * Math.PI * 2;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const u = (x - cx) / rx, v = (y - cy) / ry, r = Math.hypot(u, v);
      if (r > 1) continue;
      const arm = Math.sin(2 * Math.atan2(v, u) + 6 * r - ph);
      const val = 0.32 + 0.28 * arm * (0.4 + r) + 0.7 * (1 - r) ** 3 - 0.3 * r ** 4;
      putPx(P, x, y, L.face[clamp(Math.floor(val * 4), 0, 3)], true);
    }
  return (_portalFaces[key] = spriteFromBuf(P));
}

// The middle of a portal's face, in world px, for one standing at tile t.
function portalFaceAt(t) {
  return { x: (t.x + 0.5) * TILE, y: (t.y + 0.5) * TILE + 1 - (PORTAL_H - 2 - PORTAL_C.y) };
}

// The portals on the floor, as props sorted with the actors (a diver
// standing at one is drawn in front of it).
function portalProps(d) {
  if (d.hub) { const s = HUB_STATIONS.find((x) => x.id === 'setout'); return [{ portal: 'surface', at: s, y: (s.y + 0.5) * TILE - 1 }]; }
  return (d.floor.ways || []).map((w, i) => ({ portal: d.ways[i], clime: d.wayClimes && d.wayClimes[i], at: w, y: (w.y + 0.5) * TILE - 1 }));
}

function drawPortal(d, a, ox, oy, lights) {
  const spr = portalSprite(a.portal), L = PORTAL_LOOKS[a.portal] || PORTAL_LOOKS.cave;
  const fx = Math.round((a.at.x + 0.5) * ATILE) + ox, fy = Math.round(((a.at.y + 0.5) * TILE + 1) * AP) + oy;
  const x = Math.round(fx - spr.ax), y = Math.round(fy - spr.ay);
  drawShadow(fx, fy, 11);
  drawArtSprite(spr, x, y);
  const k = Math.floor(((Game.realT + a.at.x * 0.37) / PORTAL_SPIN) * PORTAL_FRAMES) % PORTAL_FRAMES, face = portalFace(a.portal, k);
  const cx = x + PORTAL_AC.x, cy = y + PORTAL_AC.y;
  drawArtSprite(face, cx - (face.w >> 1), cy - (face.h >> 1));
  // motes drawn in from round it, slowly, some in the colour of the clime
  // beyond (climes.js)
  const sign = (a.clime && CLIME_ART[a.clime] && CLIME_ART[a.clime].sign) || L.face[3];
  const warp = d.warp && d.warp.at === a.at ? Math.min(1, d.warp.t / T.portal.enter) : 0;
  for (let i = 0; i < 7; i++) {
    const ph = (Game.realT * (0.35 + warp * 1.5) + i / 7 + a.at.y * 0.13) % 1, ang = i * 1.9 + ph * 2.4, r = (1 - ph) * 15 * AP;
    dot(Math.round(cx + Math.cos(ang) * r), Math.round(cy + Math.sin(ang) * r * 1.15), i % 2 ? sign : L.face[2], true, Math.min(1, ph * 3) * 0.9);
  }
  const P = T.portal, pulse = 0.85 + 0.15 * Math.sin(Game.realT * 2 + a.at.x), sun = d.hub || d.zone === 'surface' ? P.sunLight : 1;
  lights.push({ x: cx, y: cy, r: TILE * P.light[0], i: P.light[1] * sun * pulse * (1 + warp), c: rgb01(L.face[2]) });
}

// Which portal the diver stands at, if any: within reach of its threshold.
function wayHere(d) {
  const p = d.p;
  return (d.floor.ways || []).findIndex((w) => dist(p.x, p.y, (w.x + 0.5) * TILE, (w.y + 0.5) * TILE) < T.portal.reach);
}

// Stepping into the portal at i: the world holds still while the view
// closes on its face; then the next site.
function stepThrough(d, i) {
  if (d.warp || i < 0) return;
  const w = d.floor.ways[i];
  d.warp = { t: 0, at: w, zone: d.ways[i], clime: d.wayClimes && d.wayClimes[i] };
  d.p.mine = null; d.channel = null;
  buzz(20);
}

// One step of a warp under way (real time). True while it lasts.
function updateWarp(d, dt) {
  const w = d.warp;
  if (!w) return false;
  if ((w.t += dt) < T.portal.enter) return true;
  d.warp = null;
  warpArrive(d, w);
  return false;
}

// The view closing on a portal, or opening on arrival: outside a ring
// that shrinks to the portal (or grows from the diver) the view is the
// destination's swirl, dark but for bands of its colour, and a bright
// edge. Drawn unlit, over everything.
const PortalIris = { img: null, canvas: null };
function drawPortalIris(d, ox, oy) {
  let k, zone, cx, cy;
  if (d.warp) {
    const f = d.warp.at ? portalFaceAt(d.warp.at) : { x: d.p.x, y: d.p.y - 10 };
    k = 1 - easeInQuad(Math.min(1, d.warp.t / T.portal.enter)); zone = d.warp.zone; cx = f.x * AP + ox; cy = f.y * AP + oy;
  } else if (d.arrive && d.arrive.t < T.portal.arrive) {
    k = easeOutQuad(d.arrive.t / T.portal.arrive); zone = d.arrive.zone; cx = d.p.x * AP + ox; cy = (d.p.y - 10) * AP + oy;
  } else return;
  const w = View.w, h = View.h, L = PORTAL_LOOKS[zone] || PORTAL_LOOKS.cave;
  if (!PortalIris.img || PortalIris.img.width !== w || PortalIris.img.height !== h) { PortalIris.img = new ImageData(w, h); [PortalIris.canvas] = makeCanvas(w, h); }
  // (worked out in world px, so its bands are as wide as they were)
  const px = PortalIris.img.data, ramp = L.face.map(rgbOf), R = (k * Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy)) * 1.05) / AP, ph = Game.realT * 5;
  // the swirl's angles are worked out a 2 × 2 block at a time (they turn
  // slowly), its distance a pixel at a time; well inside the ring there's
  // nothing to work out
  for (let by = 0; by < h; by += 2)
    for (let bx = 0; bx < w; bx += 2) {
      const ddx = (bx + 0.5 - cx) / AP, ddy = ((by + 0.5 - cy) * 1.15) / AP, rb = Math.hypot(ddx, ddy);
      let wave = 0, band = 0;
      const deep = rb < R - 4.5;
      if (!deep) {
        const a = Math.atan2(ddy, ddx);
        wave = 3 * Math.sin(3 * a - rb * 0.08 + ph);
        band = Math.sin(3 * a + 4 * Math.log(rb + 1) - ph) > 0.4 ? 1 : 0;
      }
      for (let y = by; y < by + 2 && y < h; y++)
        for (let x = bx; x < bx + 2 && x < w; x++) {
          const n = (y * w + x) * 4;
          if (deep) { px[n + 3] = 0; continue; }
          const dx = (x - cx) / AP, dy = ((y - cy) * 1.15) / AP, e = Math.hypot(dx, dy) - R + wave;
          if (e < 0) { px[n + 3] = 0; continue; }
          // three arms winding in
          const i = e < 2 ? 3 : e < 5 ? 2 : clamp(Math.floor(band + (e < 9 ? 1 : 0) + bayerAt(x, y) - 0.3), 0, 1);
          const c = ramp[i];
          px[n] = c[0]; px[n + 1] = c[1]; px[n + 2] = c[2]; px[n + 3] = 255;
        }
    }
  PortalIris.canvas.getContext('2d').putImageData(PortalIris.img, 0, 0);
  View.overCtx.drawImage(PortalIris.canvas, 0, 0);
}
const easeInQuad = (t) => t * t;
const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);
