'use strict';
// ---------------------------------------------------------------------------
// Portals: the ways on at each site's exit, and the one at the outpost that
// every expedition sets out through. Each is a standing ring of lodestone on
// a plinth, its face a slow swirl in the colour of where it leads (warm
// daylight for the surface, cool blue for a cave, amber for a ruin, red for
// a Keeper's Lair, green for a Deep Vein), and the keystone carries that
// place's glyph. They're nothing like a rift's violet tears.
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
};
// The colour that stands for each destination elsewhere (the compass, the map).
const ZONE_SIGNS = Object.fromEntries(Object.entries(PORTAL_LOOKS).map(([z, l]) => [z, l.face[3]]));

// The lodestone: dark iron, with veins of the star's metal.
const LODESTONE = ['#111316', '#22262c', '#3a4048', '#5e6670'];
// The sprite's size, and its ring: centre, outer and inner (face) radii.
const PORTAL_W = 25, PORTAL_H = 32, PORTAL_C = { x: 12, y: 15 }, PORTAL_OUT = [11.6, 13.4], PORTAL_IN = [7.4, 9.2];
const PORTAL_FRAMES = 24, PORTAL_SPIN = 3; // face frames, seconds a turn

const _portalSprites = {};
// The ring, plinth and keystone for one destination (its runes and glyph
// glow in its colour). Feet (ax, ay) at the plinth's front.
function portalSprite(zone) {
  if (_portalSprites[zone]) return _portalSprites[zone];
  const L = PORTAL_LOOKS[zone] || PORTAL_LOOKS.cave, P = pixBuf(PORTAL_W, PORTAL_H), S = LODESTONE, C = PORTAL_C;
  const solid = new Uint8Array(PORTAL_W * PORTAL_H);
  const put = (x, y, col, glow) => { putPx(P, x, y, col, glow); solid[y * PORTAL_W + x] = 1; };
  const step = (v, x, y) => S[clamp(Math.floor(v * 4 + bayerAt(x, y) - 0.5), 0, 3)];
  // the plinth: a slab, lit along its top
  for (let y = 27; y < 32; y++)
    for (let x = 1; x < 24; x++) {
      if (y === 27 && (x < 3 || x > 21)) continue;
      put(x, y, y === 27 ? S[3] : y === 28 ? step(0.62, x, y) : step(0.3 - (y - 29) * 0.06, x, y));
    }
  // the ring: lit from the top left on its outer side, from the bottom
  // right inside, flat across its face
  for (let y = 0; y < 30; y++)
    for (let x = 0; x < PORTAL_W; x++) {
      const dx = x - C.x, dy = y - C.y, eo = (dx / PORTAL_OUT[0]) ** 2 + (dy / PORTAL_OUT[1]) ** 2, ei = (dx / PORTAL_IN[0]) ** 2 + (dy / PORTAL_IN[1]) ** 2;
      if (eo > 1 || ei <= 1) continue;
      const m = Math.hypot(dx, dy) || 1, nx = dx / m, ny = dy / m;
      let v;
      if (eo > 0.8) v = 0.55 - 0.42 * (nx * 0.6 + ny * 0.8);
      else if (ei < 1.3) v = 0.4 + 0.4 * (nx * 0.6 + ny * 0.8);
      else v = 0.62 - 0.12 * ny;
      let col = step(v, x, y);
      // veins of star metal in the stone
      if ((hashInts(x, y, 0x10de) & 31) === 0) col = ART.pal.star[1];
      put(x, y, col);
    }
  // runes round the ring, in the destination's colour
  for (const a of [-2.5, -0.64, 0.5, 2.64]) {
    const r = (PORTAL_OUT[0] + PORTAL_IN[0]) / 2, x = Math.round(C.x + Math.cos(a) * r), y = Math.round(C.y + Math.sin(a) * ((PORTAL_OUT[1] + PORTAL_IN[1]) / 2));
    put(x, y, L.face[3], true);
    put(x, y + 1, L.face[2], true);
  }
  // the keystone, with the destination's glyph
  for (let y = 0; y < 7; y++) for (let x = C.x - 3; x <= C.x + 3; x++) put(x, y, y === 0 || x === C.x - 3 ? S[3] : x === C.x + 3 || y === 6 ? S[1] : S[2]);
  for (let y = 2; y <= 4; y++) for (let x = C.x - 1; x <= C.x + 1; x++) put(x, y, S[0]);
  for (const [i, j] of L.glyph) put(C.x + i, 3 + j, L.face[3], true);
  // a dark outline round everything solid
  for (let y = 0; y < PORTAL_H; y++)
    for (let x = 0; x < PORTAL_W; x++) {
      if (solid[y * PORTAL_W + x]) continue;
      const dx = x - C.x, dy = y - C.y;
      if ((dx / PORTAL_IN[0]) ** 2 + (dy / PORTAL_IN[1]) ** 2 <= 1) continue;
      const near = (i, j) => x + i >= 0 && y + j >= 0 && x + i < PORTAL_W && y + j < PORTAL_H && solid[(y + j) * PORTAL_W + x + i];
      if (near(1, 0) || near(-1, 0) || near(0, 1) || near(0, -1)) putPx(P, x, y, ART.outline);
    }
  const s = spriteFromBuf(P);
  s.ax = C.x + 0.5; s.ay = PORTAL_H - 2;
  return (_portalSprites[zone] = s);
}

// The face, one frame of its swirl: two arms turning about a bright eye,
// darker towards the ring. All of it glows.
const _portalFaces = {};
function portalFace(zone, k) {
  const key = zone + k;
  if (_portalFaces[key]) return _portalFaces[key];
  const L = PORTAL_LOOKS[zone] || PORTAL_LOOKS.cave, rx = PORTAL_IN[0], ry = PORTAL_IN[1];
  const cx = Math.ceil(rx), cy = Math.ceil(ry), w = cx * 2 + 1, h = cy * 2 + 1, P = pixBuf(w, h), ph = (k / PORTAL_FRAMES) * Math.PI * 2;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const u = (x - cx) / rx, v = (y - cy) / ry, r = Math.hypot(u, v);
      if (r > 1) continue;
      const arm = Math.sin(2 * Math.atan2(v, u) + 6 * r - ph);
      const val = 0.32 + 0.28 * arm * (0.4 + r) + 0.7 * (1 - r) ** 3 - 0.3 * r ** 4;
      putPx(P, x, y, L.face[clamp(Math.floor(val * 4 + bayerAt(x, y) - 0.5), 0, 3)], true);
    }
  return (_portalFaces[key] = spriteFromBuf(P));
}

// The middle of a portal's face, in floor px, for one standing at tile t.
function portalFaceAt(t) {
  return { x: (t.x + 0.5) * TILE, y: (t.y + 0.5) * TILE + 1 - (PORTAL_H - 2 - PORTAL_C.y) };
}

// The portals on the floor, as props sorted with the actors (a diver
// standing at one is drawn in front of it).
function portalProps(d) {
  if (d.hub) { const s = HUB_STATIONS.find((x) => x.id === 'setout'); return [{ portal: 'surface', at: s, y: (s.y + 0.5) * TILE - 1 }]; }
  return (d.floor.ways || []).map((w, i) => ({ portal: d.ways[i], at: w, y: (w.y + 0.5) * TILE - 1 }));
}

function drawPortal(d, a, ox, oy, lights) {
  const spr = portalSprite(a.portal), L = PORTAL_LOOKS[a.portal] || PORTAL_LOOKS.cave;
  const fx = Math.round((a.at.x + 0.5) * TILE + ox), fy = Math.round((a.at.y + 0.5) * TILE + oy) + 1;
  const x = Math.round(fx - spr.ax), y = Math.round(fy - spr.ay);
  drawShadow(fx, fy, 11);
  drawArtSprite(spr, x, y);
  const k = Math.floor(((Game.realT + a.at.x * 0.37) / PORTAL_SPIN) * PORTAL_FRAMES) % PORTAL_FRAMES, face = portalFace(a.portal, k);
  const cx = x + PORTAL_C.x, cy = y + PORTAL_C.y;
  drawArtSprite(face, cx - (face.w >> 1), cy - (face.h >> 1));
  // motes drawn in from round it, slowly
  const warp = d.warp && d.warp.at === a.at ? Math.min(1, d.warp.t / T.portal.enter) : 0;
  for (let i = 0; i < 5; i++) {
    const ph = (Game.realT * (0.35 + warp * 1.5) + i / 5 + a.at.y * 0.13) % 1, ang = i * 1.9 + ph * 2.4, r = (1 - ph) * 15;
    dot(Math.round(cx + Math.cos(ang) * r), Math.round(cy + Math.sin(ang) * r * 1.15), i % 2 ? L.face[3] : L.face[2], true, Math.min(1, ph * 3) * 0.9);
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
  d.warp = { t: 0, at: w, zone: d.ways[i] };
  d.p.mine = null; d.channel = null;
  buzz(20);
}

// One step of a warp under way (real time). True while it lasts.
function updateWarp(d, dt) {
  const w = d.warp;
  if (!w) return false;
  if ((w.t += dt) < T.portal.enter) return true;
  d.warp = null;
  enterFloor(d.depth + 1, w.zone);
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
    const f = portalFaceAt(d.warp.at);
    k = 1 - easeInQuad(Math.min(1, d.warp.t / T.portal.enter)); zone = d.warp.zone; cx = f.x + ox; cy = f.y + oy;
  } else if (d.arrive && d.arrive.t < T.portal.arrive) {
    k = easeOutQuad(d.arrive.t / T.portal.arrive); zone = d.arrive.zone; cx = d.p.x + ox; cy = d.p.y - 10 + oy;
  } else return;
  const w = View.w, h = View.h, L = PORTAL_LOOKS[zone] || PORTAL_LOOKS.cave;
  if (!PortalIris.img || PortalIris.img.width !== w || PortalIris.img.height !== h) { PortalIris.img = new ImageData(w, h); [PortalIris.canvas] = makeCanvas(w, h); }
  const px = PortalIris.img.data, ramp = L.face.map(rgbOf), R = k * Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy)) * 1.05, ph = Game.realT * 5;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = x - cx, dy = (y - cy) * 1.15, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx), n = (y * w + x) * 4;
      const e = r - R + 3 * Math.sin(3 * a - r * 0.08 + ph);
      if (e < 0) { px[n + 3] = 0; continue; }
      // three arms winding in
      const band = Math.sin(3 * a + 4 * Math.log(r + 1) - ph) > 0.4 ? 1 : 0;
      const i = e < 2 ? 3 : e < 5 ? 2 : clamp(Math.floor(band + (e < 9 ? 1 : 0) + bayerAt(x, y) - 0.3), 0, 1);
      const c = ramp[i];
      px[n] = c[0]; px[n + 1] = c[1]; px[n + 2] = c[2]; px[n + 3] = 255;
    }
  PortalIris.canvas.getContext('2d').putImageData(PortalIris.img, 0, 0);
  View.overCtx.drawImage(PortalIris.canvas, 0, 0);
}
const easeInQuad = (t) => t * t;
const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);
