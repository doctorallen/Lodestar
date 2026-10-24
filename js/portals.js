'use strict';
// ---------------------------------------------------------------------------
// Portals: the one at the outpost every sortie sets out through (in the
// field the ways down are holes, and the way up a rope: below). A portal
// is a standing ring of lodestone on a plinth, its face a slow swirl in the colour of where it leads (warm
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
  // the Lattice, the tunnels under the world (lattice.js): a cold indigo
  lattice: { face: ['#0e0a24', '#2a1e60', '#5a48b8', '#b4a4ff'], glyph: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]] },
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
  // a tone by form, laid in short strokes (the painted style): each run of
  // 2 to 5 px along a row shares a little jitter, on a ramp of six tones
  const SR = ['#08090c', S[0], S[1], S[2], S[3], '#848c98'];
  let _sx = -1, _sy = -1;
  const step = (v) => SR[clamp(Math.round(v * 5 - 0.9 + (artHash(Math.floor((_sx + artHash(_sy, 3, 0x9a) * 5) / 4), _sy, 0x9b) - 0.5) * 0.9), 0, 5)];
  // the plinth: a slab, lit along its top
  const py0 = Math.round(26.5 * AP + 0.5);
  for (let y = py0; y < Math.round(31.5 * AP + 0.5); y++)
    for (let x = 0; x < W; x++) {
      const u = at(x), v = at(y);
      if (u < 0.5 || u >= 23.5 || (y === py0 && (u < 2.5 || u >= 21.5))) continue;
      _sx = x; _sy = y;
      put(x, y, y === py0 ? S[3] : y === py0 + 1 ? step(0.62) : step(0.3 - (v - 29) * 0.06));
    }
  // the ring: lit from the top left on its outer side, from the bottom
  // right inside, flat across its face
  for (let y = 0; y < Math.round(29.5 * AP + 0.5); y++)
    for (let x = 0; x < W; x++) {
      const dx = at(x) - C.x, dy = at(y) - C.y, eo = (dx / PORTAL_OUT[0]) ** 2 + (dy / PORTAL_OUT[1]) ** 2, ei = (dx / PORTAL_IN[0]) ** 2 + (dy / PORTAL_IN[1]) ** 2;
      if (eo > 1 || ei <= 1) continue;
      _sx = x; _sy = y;
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
  // (at home there's no portal: the star's GO face is the way out, and the openings)
  if (d.hub) return [];
  return (d.floor.ways || []).map((w, i) => wayKind(d, i) === 'portal' && { portal: d.ways[i], clime: d.wayClimes && d.wayClimes[i], at: w, y: (w.y + 0.5) * TILE - 1 }).filter(Boolean);
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

// Which way on the diver stands at, if any: within reach of its threshold
// (a hole's rim).
function wayHere(d) {
  const p = d.p;
  return (d.floor.ways || []).findIndex((w, i) => dist(p.x, p.y, (w.x + 0.5) * TILE, (w.y + 0.5) * TILE) < (wayKind(d, i) === 'hole' ? T.portal.holeReach : T.portal.reach));
}

// Stepping into the portal at i: the world holds still while the view
// closes on its face; then the next site.
function stepThrough(d, i) {
  if (d.warp || i < 0) return;
  const w = d.floor.ways[i];
  // (climbing, the view closes and opens in the dusk's colour, not a swirl)
  const kind = wayKind(d, i);
  d.warp = { t: 0, at: w, zone: d.ways[i], clime: d.wayClimes && d.wayClimes[i], kind, look: kind === 'portal' ? null : 'dusk' };
  d.p.mine = null; d.channel = null;
  snd('portal');
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
    const at = d.warp.at, f = !at ? { x: d.p.x, y: d.p.y - 10 } : d.warp.kind === 'hole' ? { x: (at.x + 0.5) * TILE, y: (at.y + 0.5) * TILE } : d.warp.kind === 'rope' ? { x: (at.x + 0.5) * TILE, y: (at.y + 0.5) * TILE - 10 } : portalFaceAt(at);
    k = 1 - easeInQuad(Math.min(1, d.warp.t / T.portal.enter)); zone = d.warp.look || d.warp.zone; cx = f.x * AP + ox; cy = f.y * AP + oy;
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
      // (well outside the edge, every pixel of the block is past its
      // bright rings: only the bands and their dither, no distance each)
      const far = !deep && rb - R + wave > 12;
      for (let y = by; y < by + 2 && y < h; y++)
        for (let x = bx; x < bx + 2 && x < w; x++) {
          const n = (y * w + x) * 4;
          if (deep) { px[n + 3] = 0; continue; }
          if (far) { const c = ramp[band && bayerAt(x, y) >= 0.3 ? 1 : 0]; px[n] = c[0]; px[n + 1] = c[1]; px[n + 2] = c[2]; px[n + 3] = 255; continue; }
          const dx = (x - cx) / AP, dy = ((y - cy) * 1.15) / AP, e = Math.hypot(dx, dy) - R + wave;
          if (e < 0) { px[n + 3] = 0; continue; }
          // three arms winding in
          const i = e < 2 ? 3 : e < 5 ? 2 : clamp(Math.floor(band + (e < 9 ? 1 : 0) + bayerAt(x, y) - 0.3), 0, 1);
          const c = ramp[i];
          px[n] = c[0]; px[n + 1] = c[1]; px[n + 2] = c[2]; px[n + 3] = 255;
        }
    }
  if (Gpu.on) View.overCtx.drawPixels(PortalIris.img, 0, 0, w, h, 0, 0);
  else { PortalIris.canvas.getContext('2d').putImageData(PortalIris.img, 0, 0); View.overCtx.drawImage(PortalIris.canvas, 0, 0); }
}
// While the view opens on arrival, how much of the place shows: a circle
// round the diver in the floor's art px { x, y, r }, or null when it's all
// in view. (Outside it the iris is opaque, so the floor's painting there
// can wait: paint.js pntFrame.)
function portalRevealArt(d, camX, camY) {
  if (d.warp || !d.arrive || d.arrive.t >= T.portal.arrive) return null;
  const k = easeOutQuad(d.arrive.t / T.portal.arrive), x = d.p.x * AP, y = (d.p.y - 10) * AP, cx = x - camX, cy = y - camY;
  return { x, y, r: k * Math.hypot(Math.max(cx, View.w - cx), Math.max(cy, View.h - cy)) * 1.05 + ap(5) };
}
const easeInQuad = (t) => t * t;
const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);

// ---------------------------------------------------------------------------
// The ways in a territory and its Deep: a way down is a hole cut in the
// ground, a rope tied to a stake over its lip, a faint glow of where it
// leads rising out of the dark; the way up from a Deep's last site is a
// rope hanging into a pool of daylight. (The outpost's way out stays a
// portal.) A hole is solid, so the diver climbs down from its rim
// (T.portal.holeReach).
// ---------------------------------------------------------------------------
const HOLE_R = [9.5, 6]; // its half-width and half-depth, world px

// What way i on this floor is: 'portal' (at home), 'rope' (up: to the
// surface, or from a gallery of the Lattice up into the Deep) or 'hole'
// (down: into a Deep, or by a cleft into the Lattice).
function wayKind(d, i) { return d.hub ? 'portal' : d.ways[i] === 'surface' || d.lat ? 'rope' : 'hole'; }

// The holes, as solid ground for bodies (game.js bodyHits).
function wayHoleSolids(d) {
  const f = d.floor;
  f.solids = (f.ways || []).filter((w, i) => wayKind(d, i) === 'hole').map((w) => ({ x: (w.x + 0.5) * TILE, y: (w.y + 0.5) * TILE, rx: HOLE_R[0] - 1, ry: HOLE_R[1] - 1 }));
}

// The hole's picture, the same for every hole: what darkens the ground
// (multiplied, so it's cut into any ground in its own colour), what's
// laid over it (the lit near lip, rubble, the stake and rope), its
// footprint (the glow layer is cleared there) and its dark, below the far
// wall, drawn in the glow layer so no light lifts it. Its middle at (cx, cy).
let _holePic = null;
function holePicture() {
  if (_holePic) return _holePic;
  const rx = HOLE_R[0] * AP, ry = HOLE_R[1] * AP, cx = Math.ceil(rx) + 5, cy = Math.ceil(ry) + 9, W = cx * 2 + 1, H = cy + Math.ceil(ry) + 5;
  const [mc, mx] = makeCanvas(W, H), [oc, ox] = makeCanvas(W, H), [cc, cxx] = makeCanvas(W, H), [dc, dx] = makeCanvas(W, H);
  const M = mx.createImageData(W, H), O = ox.createImageData(W, H), C = cxx.createImageData(W, H), D = dx.createImageData(W, H);
  const mul = (x, y, g) => { const n = (y * W + x) * 4; M.data[n] = M.data[n + 1] = M.data[n + 2] = Math.round(g * 255); M.data[n + 3] = 255; };
  const over = (x, y, col, a = 1) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const n = (y * W + x) * 4, c = rgbOf(col); O.data[n] = c[0]; O.data[n + 1] = c[1]; O.data[n + 2] = c[2]; O.data[n + 3] = Math.round(a * 255); };
  // the far wall shows from the rim down by `wall` (of the half-depth),
  // in a few tones laid in short strokes along each row; below it, the dark
  const wall = 0.85, tones = [0.56, 0.42, 0.3, 0.2];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry, e = u * u + v * v;
      const jit = artHash(Math.floor((x + artHash(y, 5, 0x51a) * 5) / 4), y, 0x51b) - 0.5;
      if (e <= 1) {
        const top = -Math.sqrt(Math.max(0, 1 - u * u)), t = (v - top) / wall;
        const n = (y * W + x) * 4; C.data[n + 3] = 255;
        const ev = u * u + (v - wall) * (v - wall);
        if (ev > 1 && t < 1) mul(x, y, tones[clamp(Math.round(t * 3 + jit * 1.2), 0, 3)]);
        else { mul(x, y, 0.07); const c = rgbOf(ev > 0.7 + jit * 0.2 ? '#0e0c14' : '#07060a'); D.data[n] = c[0]; D.data[n + 1] = c[1]; D.data[n + 2] = c[2]; D.data[n + 3] = 255; }
      } else if (e < 1.5) {
        // the ground dipping to it, a little darker, broken in strokes
        if (e < 1.18 + jit * 0.3) mul(x, y, 0.8);
        // its near lip catching the light
        if (v > 0.25 && e < 1.0 + 3 / ry) over(x, y, '#ffffff', 0.13);
      }
    }
  // rubble round the rim
  for (let k = 0; k < 6; k++) {
    const a = 0.4 + k * 1.05 + artHash(k, 1, 0x51c) * 0.5, r = 1.2 + artHash(k, 2, 0x51c) * 0.2;
    const sx = Math.round(cx + Math.cos(a) * rx * r), sy = Math.round(cy + Math.sin(a) * ry * r), sw = 2 + (k % 2);
    for (let i = 0; i < sw; i++) { mul(sx + i, sy + 1, 0.5); over(sx + i, sy, '#ffffff', 0.2); }
  }
  // the stake, east of it, and its rope over the lip and down the wall
  const kx = Math.round(cx + rx * 1.12), ky = Math.round(cy - ry * 0.15);
  for (let y = ky - 7; y <= ky; y++) { over(kx, y, y === ky - 7 ? '#b08a54' : '#8e6a3e'); over(kx + 1, y, '#5e4126'); }
  mul(kx - 1, ky + 1, 0.55); mul(kx, ky + 1, 0.5); mul(kx + 1, ky + 1, 0.5); mul(kx + 2, ky + 1, 0.6);
  const lx = Math.round(cx + rx * Math.cos(-0.5)), ly = Math.round(cy + ry * Math.sin(-0.5));
  const line = (x0, y0, x1, y1, f) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); for (let s = 0; s <= n; s++) f(Math.round(x0 + ((x1 - x0) * s) / n), Math.round(y0 + ((y1 - y0) * s) / n), s / n); };
  line(kx - 1, ky - 5, lx, ly, (x, y, s) => over(x, y + (s > 0.3 && s < 0.8 ? 1 : 0), (x + y) % 2 ? '#c8a878' : '#9a7c50'));
  line(lx, ly + 1, lx - 1, ly + Math.round(ry * 1.1), (x, y, s) => over(x, y, (y % 2 ? '#a88a5c' : '#7a6040'), 1 - s * 0.85));
  mx.putImageData(M, 0, 0); ox.putImageData(O, 0, 0); cxx.putImageData(C, 0, 0); dx.putImageData(D, 0, 0);
  return (_holePic = { mul: mc, over: oc, cut: cc, dark: dc, cx, cy });
}

// The holes, drawn on the ground (before the rock in front is laid back
// over it), each glowing faintly from below in the colour of where it
// leads, with motes of it rising.
function drawHolesUnder(d, ox, oy, lights) {
  if (d.hub || !d.floor.ways) return;
  const P = holePicture(), c = View.ctx, e = View.emCtx, T0 = T.portal;
  d.floor.ways.forEach((w, i) => {
    if (wayKind(d, i) !== 'hole') return;
    const L = PORTAL_LOOKS[d.ways[i]] || PORTAL_LOOKS.cave, fx = Math.round((w.x + 0.5) * ATILE) + ox, fy = Math.round((w.y + 0.5) * ATILE) + oy;
    if (fx < -40 || fy < -40 || fx > View.w + 40 || fy > View.h + 40) return;
    const x = fx - P.cx, y = fy - P.cy;
    c.globalCompositeOperation = 'multiply'; c.drawImage(P.mul, x, y); c.globalCompositeOperation = 'source-over';
    e.globalCompositeOperation = 'destination-out'; e.drawImage(P.cut, x, y); e.globalCompositeOperation = 'source-over';
    e.drawImage(P.dark, x, y);
    c.drawImage(P.over, x, y);
    const warp = d.warp && d.warp.at === w ? Math.min(1, d.warp.t / T0.enter) : 0, pulse = 0.75 + 0.25 * Math.sin(Game.realT * 1.7 + w.x);
    // the glow far down, dithered
    const gy = fy + Math.round(HOLE_R[1] * AP * 0.45);
    for (let j = -1; j <= 1; j++) for (let k = -4 + Math.abs(j) * 2; k <= 4 - Math.abs(j) * 2; k++) if ((k + j) % 2 === 0 || Math.abs(k) < 2) dot(fx + k, gy + j, Math.abs(k) < 2 && !j ? L.face[2] : L.face[1], true, 0.55 * pulse + warp * 0.4);
    const sign = (d.wayClimes && d.wayClimes[i] && CLIME_ART[d.wayClimes[i]] && CLIME_ART[d.wayClimes[i]].sign) || L.face[3];
    for (let m = 0; m < 4; m++) {
      const ph = (Game.realT * (0.22 + warp) + m / 4 + w.y * 0.17) % 1;
      dot(fx + Math.round(Math.sin(m * 2.3 + ph * 3) * 5), gy - Math.round(ph * 16 * AP * 0.6), m % 2 ? sign : L.face[2], true, Math.sin(ph * Math.PI) * 0.7);
    }
    const sun = d.zone === 'surface' ? T0.sunLight : 1;
    lights.push({ x: fx, y: gy, r: TILE * T0.holeLight[0], i: T0.holeLight[1] * sun * pulse * (1 + warp), c: rgb01(L.face[2]) });
  });
}

// The rope up, standing among the actors: its foot coiled on the ground in
// a pool of daylight, the rope up out of view, swaying a little, dust
// drifting down through the light.
function ropeProps(d) {
  if (d.hub || !d.floor.ways) return [];
  return d.floor.ways.map((w, i) => wayKind(d, i) === 'rope' && { rope: true, at: w, zone: d.ways[i], y: (w.y + 0.5) * TILE }).filter(Boolean);
}
function drawRope(d, a, ox, oy, lights) {
  const w = a.at, fx = Math.round((w.x + 0.5) * ATILE) + ox, fy = Math.round((w.y + 0.5) * ATILE) + oy, T0 = T.portal;
  const warp = d.warp && d.warp.at === w ? Math.min(1, d.warp.t / T0.enter) : 0;
  // (up into a Deep from the Lattice, the pool is that place's light, not day)
  const day = a.zone === 'surface', pool = day ? '#fff4dc' : (PORTAL_LOOKS[a.zone] || PORTAL_LOOKS.cave).face[3];
  // the coil
  for (let k = 0; k < 28; k++) {
    const t = (k / 28) * Math.PI * 2, x = fx + Math.round(Math.cos(t) * 5), y = fy + Math.round(Math.sin(t) * 2.5);
    dot(x, y, Math.sin(t) > 0 ? '#6a5640' : '#3c3022');
  }
  dot(fx - 1, fy, '#5e4630'); dot(fx, fy, '#5e4630'); dot(fx + 1, fy, '#5e4630');
  // the rope, knotted, faded out up in the dark
  const h = Math.round(T0.ropeUp * ATILE);
  for (let s = 0; s < h; s++) {
    const t = s / h, x = fx + Math.round(Math.sin(Game.realT * 1.3 + t * 2) * t * 1.5), y = fy - 2 - s, a0 = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
    const knot = s % 10 === 5;
    // (three px across, twisted: its lit and dark strands swap every two rows)
    const tw = (s >> 1) % 2;
    dot(x - 1, y, knot ? '#6e5a44' : tw ? '#6a5640' : '#54442f', false, a0);
    dot(x, y, knot ? '#8a7458' : tw ? '#54442f' : '#6a5640', false, a0);
    dot(x + 1, y, knot ? '#54442f' : '#3c3022', false, a0);
    if (knot) { dot(x - 2, y, '#54442f', false, a0); dot(x + 2, y, '#3c3022', false, a0); }
  }
  // dust in the light
  for (let m = 0; m < 6; m++) {
    const ph = (Game.realT * 0.08 + m / 6) % 1;
    dot(fx + Math.round(Math.sin(m * 2.7 + Game.realT * 0.5) * 9), fy - h + Math.round(ph * h), pool, true, Math.sin(ph * Math.PI) * 0.45);
  }
  lights.push({ x: fx, y: fy - 2, r: TILE * T0.daylight[0], i: T0.daylight[1] * (day ? 1 : 0.6) * (1 + warp), c: day ? [0.92, 0.96, 1] : rgb01(pool) });
}
