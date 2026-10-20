'use strict';
// ---------------------------------------------------------------------------
// Cast shadows of what stands on the ground (cosmetic), in one light with
// the walls' (shadow.js). Each thing's shadow is its own silhouette (its
// sprite's alpha) laid flat on the ground away from the light and stretched
// by it, never a blob.
//  - Baked into the ground's tones once a floor (pshShadeFor, read by
//    paint.js pntGroundTones), so they're laid in the ground's own strokes
//    like the mesas' shadows: every plant's, stand's and tuft's contact
//    shadow; by day under the sky, the sun's shadow to the lower right (as
//    the rock's); a plant's shadow from the strongest fixed light that sees
//    it (lava, a vent, a glowing plant); at home, what stands round the
//    plaza from its lanterns, the forge and the fire.
//  - Each frame, on a mask of greys multiplied over the ground before
//    anything stands on it (pshFrame): what stands round the lamp, away
//    from it, taking back the lamp's share of the light at each pixel, so
//    the shadow falls to what the walls' shadows fall to; by day, the sun's
//    shadow of what moves (the Kindler, creatures, the portals and spire);
//    at home, the Kindler and the settlers from the strongest lantern.
// A shadow darkens only ground and the rock behind its caster (a face it
// climbs), never rock standing in front of the caster's feet. Numbers in
// T.light.shadow.cast and T.paint.shade.
// ---------------------------------------------------------------------------

// A sprite's (or a stamp's) silhouette: each pixel 0 (clear) or how far it
// is in from its edge (1 at the edge, up to 8), worked out once; foot, its
// lowest row, and l, r its foot's span (the lowest few rows).
// (kept beside the sprites, not on them, so their shape never changes)
const _pshSils = new WeakMap(), _pshItems = new WeakMap();
function pshSil(spr) {
  const got = _pshSils.get(spr);
  if (got) return got;
  const w = spr.w, h = spr.h, a = new Uint8Array(w * h);
  if (spr.px) { for (let i = 0; i < w * h; i++) a[i] = spr.px[i] ? 8 : 0; }
  else { const d = spr.c.getContext('2d').getImageData(0, 0, w, h).data; for (let i = 0; i < w * h; i++) a[i] = d[i * 4 + 3] > 127 ? 8 : 0; }
  // (its distance in, four ways, past its frame counting as clear)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const k = y * w + x; if (a[k]) a[k] = Math.min(a[k], x ? a[k - 1] + 1 : 1, y ? a[k - w] + 1 : 1); }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) { const k = y * w + x; if (a[k]) a[k] = Math.min(a[k], x < w - 1 ? a[k + 1] + 1 : 1, y < h - 1 ? a[k + w] + 1 : 1); }
  let foot = -1, l = w, r = -1, top = -1, x0 = w, x1 = -1;
  for (let k = 0; k < w * h; k++) if (a[k]) { foot = Math.floor(k / w); if (top < 0) top = foot; const x = k % w; if (x < x0) x0 = x; if (x > x1) x1 = x; }
  for (let y = Math.max(0, foot - 3); y <= foot; y++) for (let x = 0; x < w; x++) if (a[y * w + x]) { if (x < l) l = x; if (x > r) r = x; }
  const S = { a, w, h, foot, top: Math.max(0, top), x0: x1 < 0 ? 0 : x0, x1: x1 < 0 ? w - 1 : x1, l: r < 0 ? 0 : l, r: r < 0 ? w - 1 : r };
  _pshSils.set(spr, S);
  return S;
}

// The geometry of one shadow: the caster's silhouette S with its foot at
// column ax, row ay of it, standing at fx, fy (px, its foot's middle); a
// point u px across and z px up it falls at F + u·(aux, auy) + z·(azx, azy),
// and spread widens it further up (a point light's). Into G: the box it
// covers (clipped to x0..x1, y0..y1) and the inverse. False if none.
const _pshG = { x0: 0, y0: 0, x1: 0, y1: 0, iux: 0, iuy: 0, izx: 0, izy: 0, zmax: 0 };
function pshGeom(S, ax, ay, fx, fy, aux, auy, azx, azy, sp, cx0, cy0, cx1, cy1) {
  const G = _pshG, det = aux * azy - auy * azx;
  if (Math.abs(det) < 1e-6) return false;
  const zmax = ay - S.top, wid = 1 + sp * zmax, ul = (S.x0 - ax) * wid - 1, ur = (S.x1 + 1 - ax) * wid + 1;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [u, z] of [[ul, -1], [ur, -1], [ul, zmax + 1], [ur, zmax + 1]]) {
    const x = fx + u * aux + z * azx, y = fy + u * auy + z * azy;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  G.x0 = Math.max(cx0, Math.floor(x0)); G.y0 = Math.max(cy0, Math.floor(y0)); G.x1 = Math.min(cx1, Math.ceil(x1)); G.y1 = Math.min(cy1, Math.ceil(y1));
  if (G.x1 <= G.x0 || G.y1 <= G.y0) return false;
  // u = (rx·azy − ry·azx) / det, z = (aux·ry − auy·rx) / det
  G.iux = azy / det; G.iuy = -azx / det; G.izx = -auy / det; G.izy = aux / det; G.zmax = zmax;
  return true;
}

// ---------------------------------------------------------------------------
// Baked: the ground's shade, as how far each floor px's light value is
// lowered (0-255 for 0-1), read where the ground's tones are worked out
// ---------------------------------------------------------------------------
const PshBake = { tone: null, a: null, sig: '' };
// The shade for floor f (null if none), built the first time its ground is
// painted after paintFloor.
function pshShadeFor(f) {
  const B = PshBake;
  if (!T.paint.shade || !View.groundTone) return null;
  if (B.tone === View.groundTone) return B.a;
  B.tone = View.groundTone;
  B.a = pshBake(f);
  return B.a;
}

// One silhouette into the shade A (floor px, W across): drop (0-1) inside,
// less within its penumbra (T.paint.shade.edge); fade(x, y), if given,
// scales it (a light's share).
function pshBakeCast(A, f, S, ax, ay, fx, fy, aux, auy, azx, azy, sp, drop, fade) {
  const W = f.w * ATILE, Hp = f.h * ATILE, R = View.rockPx;
  if (!pshGeom(S, ax, ay, fx, fy, aux, auy, azx, azy, sp, 0, 0, W, Hp)) return;
  const G = _pshG, a = S.a, sw = S.w, sh = S.h, zm = G.zmax + 0.5, edge = T.paint.shade.edge[0], pen = T.paint.shade.edge[1];
  for (let y = G.y0; y < G.y1; y++) {
    const ry = y + 0.5 - fy;
    for (let x = G.x0; x < G.x1; x++) {
      const k = y * W + x;
      if (R[k]) continue;
      const rx = x + 0.5 - fx, z = rx * G.izx + ry * G.izy;
      if (z < -0.5 || z > zm) continue;
      const c = Math.floor(ax + (rx * G.iux + ry * G.iuy) / (1 + sp * z)), r = ay - Math.round(z);
      if (c < 0 || c >= sw || r < 0 || r >= sh) continue;
      const cl = a[r * sw + c];
      if (!cl) continue;
      // (softer further from the foot: its penumbra widens)
      const pw = edge + z * pen;
      let v = cl >= pw ? drop : drop * cl / pw;
      if (fade) v *= fade(x + 0.5, y + 0.5);
      const q = Math.round(v * 255);
      if (q > A[k]) A[k] = q;
    }
  }
}
// A soft contact shadow into the shade: an ellipse rx × ry about cx, cy,
// drop in its middle, falling off to its edge (the ground's strokes break
// it up).
function pshBakeContact(A, f, cx, cy, rx, ry, drop) {
  const W = f.w * ATILE, Hp = f.h * ATILE, R = View.rockPx, pw = T.paint.shade.contactFall;
  for (let y = Math.max(0, Math.floor(cy - ry)); y < Math.min(Hp, Math.ceil(cy + ry)); y++) {
    const dy = (y + 0.5 - cy) / ry, dy2 = dy * dy;
    if (dy2 >= 1) continue;
    for (let x = Math.max(0, Math.floor(cx - rx)); x < Math.min(W, Math.ceil(cx + rx)); x++) {
      const k = y * W + x, dx = (x + 0.5 - cx) / rx, q = dx * dx + dy2;
      if (q >= 1 || R[k]) continue;
      const v = Math.round(drop * Math.pow(1 - q, pw) * 255);
      if (v > A[k]) A[k] = v;
    }
  }
}

// The shade laid over a tile once it's painted (beds, tufts and all): each
// pixel darkened by its stroke's middle's shade (the ground's own strokes,
// paint.js), as far as T.paint.shade.mul.
const _pshMid = new Int16Array(ATILE + 2 * PNT_CELL), _pshJit = new Float32Array(ATILE + 2 * PNT_CELL);
function pshShadeTile(P, f, ox, oy) {
  const A = PshBake.tone === View.groundTone ? PshBake.a : null;
  if (!A) return;
  const W = P.w, C32 = P.col32 || (P.col32 = new Uint32Array(P.col.buffer)), R = View.rockPx, k = T.paint.shade.mul / 255, seedH = (f.seed ^ f.depth) | 0, mid = _pshMid;
  for (let y = oy; y < oy + ATILE; y++) {
    const row = y * W;
    let any = false;
    for (let x = Math.max(0, ox - PNT_CELL); x < Math.min(W, ox + ATILE + PNT_CELL); x++) if (A[row + x]) { any = true; break; }
    if (!any) continue;
    pntStrokeRow(mid, _pshJit, ox, ATILE, y, seedH + 31);
    for (let i = 0; i < ATILE; i++) {
      const x = ox + i, q = row + x;
      if (R[q]) continue;
      const xm = clamp(ox + mid[i], 0, W - 1), s = A[row + xm];
      if (!s) continue;
      C32[q] = ugDarken(C32[q], 1 - s * k);
    }
  }
}

// Is there rock on the straight line between two floor points (px)?
function pshBlocked(f, x0, y0, x1, y1) {
  const W = f.w * ATILE, R = View.rockPx, n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4);
  for (let i = 1; i < n; i++) {
    const x = (x0 + ((x1 - x0) * i) / n) | 0, y = (y0 + ((y1 - y0) * i) / n) | 0;
    if (R[y * W + x]) return true;
  }
  return false;
}

// What stands at home and doesn't move, each { spr, x, y } (its feet, floor
// px), and the plaza's lights (its light masts and the forge), each { x, y
// (its foot), h (how high it stands), lx, ly (where its light is), r, i }
// (px).
function pshHubStill(d) {
  const out = [];
  for (const a of hubProps(d)) {
    if (a.station) { const s = a.station, at = stationAt(s, 0, 0); out.push({ spr: stationSprite(s.id), x: at.x, y: at.y }); }
    else if (a.wreck) { const s = HUB_STATIONS.find((x) => x.id === 'wreck'); out.push({ spr: hartUplink(), x: Math.round((s.x + 0.5) * ATILE), y: Math.round((s.y + 0.5) * ATILE) }); }
    else if (a.lamp) out.push({ spr: hartLantern(a.lit), x: Math.round((a.at[0] + 0.5) * ATILE), y: Math.round((a.at[1] + 0.5) * ATILE), lamp: a });
    else if (a.gate) { const s = HUB_STATIONS.find((x) => x.id === 'setout'); out.push({ spr: hartGate(), x: Math.round((s.x + 0.5) * ATILE), y: Math.round((s.y + 0.5) * ATILE) + 1 }); }
    else if (a.cradle) out.push({ spr: hartCradle(), x: Math.round(OUTPOST_CRADLE.x * ATILE), y: Math.round(OUTPOST_CRADLE.y * ATILE) });
    else if (a.pod) out.push({ spr: hartPod(a.look % 2), x: Math.round(a.pod.x * ATILE), y: Math.round(a.pod.y * ATILE) });
    else if (a.lander) out.push({ spr: hartLander(), x: Math.round(a.lander.x * ATILE), y: Math.round(a.lander.y * ATILE + ap(4)) });
    else if (a.dress) out.push({ spr: hartProp(a.dress.kind), x: Math.round(a.dress.x * ATILE), y: Math.round(a.dress.y * ATILE) });
  }
  return out;
}
function pshHubLights(d, still) {
  const L = [], C = T.light.shadow.cast.home;
  for (const s of still) {
    const spr = s.spr;
    if (s.lamp && s.lamp.lit) L.push({ x: s.x, y: s.y, h: spr.ay - spr.lamp.y, lx: s.x - spr.ax + spr.lamp.x, ly: s.y - spr.ay + spr.lamp.y, r: TILE * 2.2 * AP, i: 0.7, own: s });
  }
  const fg = HUB_STATIONS.find((s) => s.id === 'forge'), at = stationAt(fg, 0, 0), fs = hartForge();
  L.push({ x: at.x - fs.ax + HART_MOUTH.x, y: at.y + 2, h: fs.ay - HART_MOUTH.y, lx: at.x - fs.ax + HART_MOUTH.x, ly: at.y - fs.ay + HART_MOUTH.y, r: TILE * 2.2 * AP, i: 1.0, forge: true });
  return L;
}
// How much of the light is the light L's at px x, y (0-1), against amb.
function pshShare(L, x, y, amb) {
  const g = L.i * lightFade(Math.min(1, Math.hypot(x - L.lx, y - L.ly) / L.r));
  return g / (g + amb);
}
// The shadow's axes from a light at ground point lx, ly, h px high, for a
// caster at fx, fy: [aux, auy, azx, azy, spread] (shared: use it at once),
// or null if it's too near.
const _pshAx = new Float64Array(5);
function pshAxes(lx, ly, h, fx, fy, k) {
  const dx = fx - lx, dy = fy - ly, m = Math.hypot(dx, dy);
  if (m < 2) return null;
  const ux = dx / m, uy = dy / m, K = clamp(m / h, k[0], k[1]);
  // (across it: the caster's own left to right when the shadow falls away
  // from the view, turning with it)
  const o = _pshAx;
  o[0] = -uy; o[1] = ux; o[2] = ux * K; o[3] = uy * K; o[4] = T.light.shadow.cast.spread * K / Math.max(8, m);
  return o;
}

function pshBake(f) {
  const d = Game.dive, P = T.paint.shade, C = T.light.shadow.cast, W = f.w * ATILE, Hp = f.h * ATILE;
  if (!d || d.floor !== f) return null;
  const A = new Uint8Array(W * Hp), U = View.ug, sky = !!artBiome(f).sun;
  // the sun's strength (daylight in kindled land, a dusk in the dark)
  const sun = sky ? clamp(sunOf(d), 0, 1) : 0, G = T.paint.ground, szx = G.sunDir[0] / G.sunSlope, szy = G.sunDir[1] / G.sunSlope;
  const lv = lampLevels(d), amb = lv.amb * (lv.tint[0] + lv.tint[1] + lv.tint[2]) / 3;
  // the fixed lights that cast (lava, vents, glowing plants), in floor px
  const lights = [];
  if (!d.hub) for (const s of (View.lights || []).concat(View.floraLights || [])) if (!s.inRock && s.i > 0) lights.push({ x: s.x * AP, y: s.y * AP, h: C.fixedH, lx: s.x * AP, ly: s.y * AP, r: s.r * AP, i: s.i });
  const cast = (S, ax, ay, fx, fy, h) => {
    if (sun > 0) pshBakeCast(A, f, S, ax, ay, fx, fy, 1, 0, szx, szy, 0, P.sun * sun, null);
    // the strongest fixed light that sees its foot
    let best = null, bs = C.fixedMin;
    for (const L of lights) {
      if (Math.abs(L.x - fx) > L.r || Math.abs(L.y - fy) > L.r) continue;
      if (Math.abs(L.x - fx) < 4 && L.y > fy - h - 4 && L.y < fy + 4) continue;
      const s = pshShare(L, fx, fy, amb);
      if (s > bs && !pshBlocked(f, L.x, L.y, fx, fy - 1)) { bs = s; best = L; }
    }
    if (best) {
      const ax2 = pshAxes(best.x, best.y, best.h, fx, fy, C.fixedK);
      if (ax2) pshBakeCast(A, f, S, ax, ay, fx, fy, ax2[0], ax2[1], ax2[2], ax2[3], ax2[4], P.light, (x, y) => pshShare(best, x, y, amb));
    }
  };
  // the plants, the stands and the ground cover
  for (const it of View.flora || []) {
    if (it.top) continue;
    if (it.strip) {
      // (a stand's row: its picture in the stands' atlas)
      const UA = it.ug || U;
      if (!UA || !UA.atlas) continue;
      let st = _pshItems.get(it);
      if (!st) { const dd = UA.atlas.getContext('2d').getImageData(it.sx, it.sy, it.w, it.h); st = { w: it.w, h: it.h, px: new Uint32Array(dd.data.buffer) }; _pshItems.set(it, st); }
      const S = pshSil(st);
      if (S.foot < 0) continue;
      const fy = it.by0 + S.foot;
      pshBakeContact(A, f, it.bx0 + (S.l + S.r + 1) / 2, fy + 0.5, (S.r - S.l + 1) / 2 + P.coverPad, P.coverRy + 0.5, P.cover);
      if (sun > 0) pshBakeCast(A, f, S, 0, S.foot, it.bx0, fy + 0.5, 1, 0, szx, szy, 0, P.sun * sun * P.stand, null);
      continue;
    }
    const spr = floraSprite(it.set, it.piece, 0), S = pshSil(spr), fx = Math.round(it.x * AP), fy = Math.round(it.y * AP), sx = Math.round(fx - spr.w / 2);
    const cls = ugClass(it.piece), hw = (S.r - S.l + 1) / 2, cx = sx + (S.l + S.r + 1) / 2;
    pshBakeContact(A, f, cx + P.contactAt[0], fy + 0.5 + P.contactAt[1], hw + P.contactPad[cls], Math.min(P.contactRy[1], P.contactRy[0] + hw * 0.15), P.contact[cls]);
    cast(S, fx - sx, spr.h - 1, fx, fy + 0.5, spr.h);
  }
  // (at the outpost, each side's too: hubground.js)
  for (const UU of [U].concat(View.ugMeld || [])) if (UU && UU.stamps) {
    const seen = new Set();
    for (const list of UU.stamps) if (list) for (const s of list) {
      if (seen.has(s)) continue;
      seen.add(s);
      const S = pshSil(s.st);
      if (S.foot < 0) continue;
      pshBakeContact(A, f, s.x + (S.l + S.r + 1) / 2 + 0.5, s.y + S.foot + 1, (S.r - S.l + 1) / 2 + P.coverPad, P.coverRy, P.cover);
    }
  }
  // at home: what stands round the plaza, from the sun, and from its light
  // masts and the forge (whichever is strongest at its feet)
  if (d.hub) {
    const still = pshHubStill(d), HL = pshHubLights(d, still), amb0 = amb;
    PshBake.sig = pshHubSig();
    for (const s of still) {
      const spr = s.spr, S = pshSil(spr), hw = (S.r - S.l + 1) / 2, cx = s.x - spr.ax + (S.l + S.r + 1) / 2;
      pshBakeContact(A, f, cx + P.contactAt[0], s.y + 0.5 + P.contactAt[1], hw + P.contactPad[2], Math.min(P.contactRy[1], P.contactRy[0] + hw * 0.15), P.contact[2]);
      if (sun > 0 && !s.flat) pshBakeCast(A, f, S, spr.ax, spr.ay, s.x, s.y + 0.5, 1, 0, szx, szy, 0, P.sun * sun, null);
      let best = null, bs = C.home.min;
      for (const L of HL) { if (L.own === s) continue; const sh = pshShare(L, s.x, s.y, amb0); if (sh > bs) { bs = sh; best = L; } }
      if (!best) continue;
      const ax2 = pshAxes(best.x, best.y, best.h, s.x, s.y + 0.5, C.home.k);
      if (ax2) pshBakeCast(A, f, S, spr.ax, spr.ay, s.x, s.y + 0.5, ax2[0], ax2[1], ax2[2], ax2[3], ax2[4], P.home, (x, y) => Math.min(1, pshShare(best, x, y, amb0) / C.home.full));
    }
  }
  return A;
}
// What the plaza's baked shadows were made for: its settlement and its lit
// lanterns (if either changes, the outpost is painted again).
function pshHubSig() { return settlementSize() + '/' + hubStarMag(); }

// ---------------------------------------------------------------------------
// Each frame: a mask of greys over the view, multiplied over the ground
// ---------------------------------------------------------------------------
const PshMask = { c: null, x: null, img: null, d32: null, w: 0, h: 0, bx0: 0, by0: 0, bx1: 0, by1: 0 };
function pshMaskStart() {
  const M = PshMask, w = View.w, h = View.h;
  if (M.w !== w || M.h !== h) {
    // (kept in memory, as the view is, so handing it over is a copy)
    M.c = document.createElement('canvas'); M.c.width = w; M.c.height = h; M.x = M.c.getContext('2d', { willReadFrequently: true });
    M.img = new ImageData(w, h); M.d32 = new Uint32Array(M.img.data.buffer);
    M.w = w; M.h = h;
  }
  M.bx0 = w; M.by0 = h; M.bx1 = 0; M.by1 = 0;
  return M;
}
// (each pixel black, as opaque as the shadow is dark: drawn over the
// ground, that's the ground multiplied by what it leaves)
function pshMaskEnd() {
  const M = PshMask;
  if (M.bx1 <= M.bx0 || M.by1 <= M.by0) return;
  const bw = M.bx1 - M.bx0, bh = M.by1 - M.by0;
  M.x.putImageData(M.img, 0, 0, M.bx0, M.by0, bw, bh);
  View.ctx.drawImage(M.c, M.bx0, M.by0, bw, bh, M.bx0, M.by0, bw, bh);
  for (let y = M.by0; y < M.by1; y++) M.d32.fill(0, y * M.w + M.bx0, y * M.w + M.bx1);
}
// (a box written to, for pshMaskEnd)
function pshMaskBox(x0, y0, x1, y1) {
  const M = PshMask;
  if (x0 < M.bx0) M.bx0 = x0; if (y0 < M.by0) M.by0 = y0; if (x1 > M.bx1) M.bx1 = x1; if (y1 > M.by1) M.by1 = y1;
}

// How dark a light's shadow is at each distance from it: a table over the
// distance squared (PSH_TAB steps out to the light's reach) of the share of
// the light it takes back, so a pixel needs no root. Lt: the light (lx, ly
// where it's centred, r, i); base: the light that's there anyway; full: the
// share that casts the full shadow (or 0: the share, raised to pow). Kept
// by the light's reach and strength and the base (not where it is).
const PSH_TAB = 128, _pshTabs = new Map();
function pshTab(Lt, base, dark, full, pow) {
  const bq = Math.round(base * 12), key = ((((Math.round(Lt.r) * 64 + Math.round(Lt.i * 50)) * 64 + bq) * 128 + Math.round(dark * 100)) * 128 + Math.round(full * 100)) * 128 + Math.round(pow * 100);
  let t = _pshTabs.get(key);
  if (t) return t;
  t = new Float32Array(PSH_TAB + 1);
  const b = bq / 12;
  for (let n = 0; n <= PSH_TAB; n++) {
    const g = Lt.i * lightFade(Math.min(1, Math.sqrt(n / PSH_TAB))), sh = g / (g + b);
    t[n] = g <= 0 ? 0 : dark * (full ? Math.min(1, sh / full) : Math.pow(sh, pow));
  }
  if (_pshTabs.size > 400) _pshTabs.clear();
  _pshTabs.set(key, t);
  return t;
}

// A row's run [_pshRun[0], _pshRun[1]) narrowed to where
// k·(x + 0.5 − vfx) + c0 is within [lo, hi].
const _pshRun = new Float64Array(2);
function pshClipRun(k, c0, lo, hi, vfx) {
  if (Math.abs(k) < 1e-9) { if (c0 < lo || c0 > hi) _pshRun[1] = _pshRun[0]; return; }
  let p = (lo - c0) / k + vfx - 0.5, q = (hi - c0) / k + vfx - 0.5;
  if (p > q) { const t = p; p = q; q = t; }
  if (Math.floor(p) > _pshRun[0]) _pshRun[0] = Math.floor(p);
  if (Math.ceil(q) + 1 < _pshRun[1]) _pshRun[1] = Math.ceil(q) + 1;
}

// One shadow on the mask: silhouette S (foot at ax, ay of it) standing at
// fx, fy (floor px), its axes as pshGeom's; footRow, the floor row it stands
// on (rock whose foot is south of it stands in front, and hides it). Its
// darkness: dark, all over (the sun's); or, if tab is given, by the
// distance from the light Lt (pshTab) times dark, only within its reach and
// where its sight S2 (if any) lets it.
function pshMaskCast(S, ax, ay, fx, fy, aux, auy, azx, azy, sp, footRow, dark, tab, Lt, S2, ox, oy) {
  const M = PshMask, f = Game.dive.floor, W = f.w * ATILE, Hp = f.h * ATILE, LF = View.rockLift || View.rockPx, R = View.rockPx;
  let cx0 = 0, cy0 = 0, cx1 = M.w, cy1 = M.h;
  if (tab) { cx0 = Math.max(0, Math.floor(Lt.lx - Lt.r + ox)); cx1 = Math.min(M.w, Math.ceil(Lt.lx + Lt.r + ox)); cy0 = Math.max(0, Math.floor(Lt.ly - Lt.r + oy)); cy1 = Math.min(M.h, Math.ceil(Lt.ly + Lt.r + oy)); }
  const vfx = fx + ox, vfy = fy + oy;
  if (!pshGeom(S, ax, ay, vfx, vfy, aux, auy, azx, azy, sp, cx0, cy0, cx1, cy1)) return;
  const G = _pshG, a = S.a, sw = S.w, sh = S.h, zm = G.zmax + 0.5, m = M.d32, mw = M.w, C = T.light.shadow.cast, edge = C.edge[0], pen = C.edge[1] * Math.hypot(azx, azy);
  const izx = G.izx, izy = G.izy, iux = G.iux, iuy = G.iuy, wid = 1 + sp * zm, u0 = (S.x0 - ax) * wid - 1, u1 = (S.x1 + 1 - ax) * wid + 1;
  const tk = tab ? PSH_TAB / (Lt.r * Lt.r) : 0, lvx = tab ? Lt.lx + ox : 0, lvy = tab ? Lt.ly + oy : 0, iLC = 1 / LC;
  // (the foot's row of the sprite: the painted creatures' anchors fall
  // between pixels)
  const ayr = Math.round(ay);
  const svis = S2 ? S2.vis : null, sx0 = S2 ? S2.x0 : 0, sy0 = S2 ? S2.y0 : 0, sww = S2 ? S2.w : 0;
  if (!tab) tab = null;
  let any = false;
  for (let y = G.y0; y < G.y1; y++) {
    const wy = y - oy;
    if (wy < 0 || wy >= Hp) continue;
    const ry = y + 0.5 - vfy;
    // (the row's run inside the shadow's parallelogram: where z and u are
    // in range, both linear along it; and inside the light's reach)
    let xa = G.x0, xb = G.x1;
    _pshRun[0] = xa; _pshRun[1] = xb;
    pshClipRun(izx, ry * izy, -0.5, zm, vfx);
    pshClipRun(iux, ry * iuy, u0, u1, vfx);
    xa = _pshRun[0]; xb = _pshRun[1];
    let dy2 = 0;
    if (tab) {
      dy2 = (y + 0.5 - lvy) * (y + 0.5 - lvy);
      const rr = Lt.r * Lt.r - dy2;
      if (rr <= 0) continue;
      const hw = Math.sqrt(rr);
      if (Math.floor(lvx - hw) > xa) xa = Math.floor(lvx - hw);
      if (Math.ceil(lvx + hw) < xb) xb = Math.ceil(lvx + hw);
    }
    if (xa < 0) xa = 0;
    if (xb > mw) xb = mw;
    const row = wy * W, cj = S2 ? Math.floor(wy * iLC) - sy0 : 0, vrow = cj * sww;
    if (S2 && (cj < 0 || cj >= sww)) continue;
    const ry0 = ry * izy, ru0 = ry * iuy, qrow = y * mw;
    for (let x = xa; x < xb; x++) {
      const rx = x + 0.5 - vfx, z = rx * izx + ry0;
      if (z < -0.5 || z > zm) continue;
      const uu = ax + (rx * iux + ru0) / (1 + sp * z);
      if (uu < 0 || uu >= sw) continue;
      const r = ayr - ((z + 0.5) | 0);
      if (r < 0 || r >= sh) continue;
      const cl = a[r * sw + (uu | 0)];
      if (!cl) continue;
      const wx = x - ox;
      if (wx < 0 || wx >= W) continue;
      const k = row + wx, lf = LF[k];
      if (lf !== 0 ? wy + lf - 1 >= footRow : R[k] !== 0) continue;
      let s = dark;
      if (tab !== null) {
        const dx = x + 0.5 - lvx, n = ((dx * dx + dy2) * tk) | 0;
        if (n >= PSH_TAB) continue;
        s = tab[n] * dark;
        if (svis !== null) { const ci = ((wx * iLC) | 0) - sx0; if (ci < 0 || ci >= sww || svis[vrow + ci] < 1) continue; }
      }
      // (softer further from the foot: its penumbra widens)
      const pw = edge + z * pen;
      if (cl < pw) s *= cl / pw;
      const v = (s * 255) | 0, q = qrow + x;
      if (v > m[q] >>> 24) m[q] = (v << 24) >>> 0;
      any = true;
    }
  }
  if (any) pshMaskBox(G.x0, G.y0, G.x1, G.y1);
}

// A soft blob on the mask (Wick's by day): an ellipse rx × ry about cx, cy
// (view px), dark in its middle, in short strokes fixed to it.
function pshMaskBlob(cx, cy, rx, ry, dark) {
  const M = PshMask, m = M.d32;
  const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(M.w, Math.ceil(cx + rx)), y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(M.h, Math.ceil(cy + ry));
  if (x1 <= x0 || y1 <= y0) return;
  for (let y = y0; y < y1; y++) {
    const dy = (y + 0.5 - cy) / ry;
    for (let x = x0; x < x1; x++) {
      // (each stroke 3 px, its value from its middle)
      const xm = cx + Math.floor((x - cx) / 3) * 3 + 1.5, dx = (xm - cx) / rx, q = dx * dx + dy * dy;
      if (q >= 1) continue;
      const v = (dark * (q < 0.35 ? 1 : 0.55) * 255) | 0, k = y * M.w + x;
      if (v > m[k] >>> 24) m[k] = (v << 24) >>> 0;
    }
  }
  pshMaskBox(x0, y0, x1, y1);
}

// The Kindler's sprite this frame: the pose kindlerPick last chose (shadows
// are drawn before him, so it's a frame behind), else his standing frame.
function pshKindlerSpr(d) {
  if (d.kAnim && d.kAnim.p === d.p && d.kAnim.spr) return d.kAnim.spr;
  return Sprites.diver[facingIndex(d.p.fx, d.p.fy)][0];
}
// What moves or may change, each { spr, x, y } (feet, floor px, rounded as
// it's drawn).
function pshMovers(d) {
  const out = [], p = d.p;
  // (none while he's still in his pod, in the opening: intro.js)
  if (!(d.hub && Intro.hub && Intro.hub.hidden)) out.push({ spr: pshKindlerSpr(d), x: Math.round(p.x * AP), y: Math.round(p.y * AP), me: true });
  if (d.hub) {
    for (const s of d.settlers || []) out.push({ spr: settlerSprite(s.look, s.walkT > 0 ? 1 + (Math.floor(s.walkT * 7) % 4) : 0, s.west), x: Math.round(s.x * AP), y: Math.round(s.y * AP) });
    const n = settlementSize();
    if (n >= 1) { const fg = HUB_STATIONS.find((s) => s.id === 'forge'), at = stationAt(fg, 0, 0), fs = hartForge(); out.push({ spr: hartPerson(1, 'smith', 0), x: at.x - fs.ax + HART_ANVIL.x - 14, y: at.y + 2 }); }
    if (n >= 2) { const [sx, sy] = hubSitterAt(d.floor.site); out.push({ spr: hartPerson(2, 'sit', 0), x: Math.round(sx * ATILE), y: Math.round(sy * ATILE) }); }
    return out;
  }
  for (const e of d.enemies) {
    if (e.dead || e.hid) continue;
    if (FOE_NAMES[e.type]) { const look = foeLook(d, e); if (!look || look.hidden || look.noShadow) continue; out.push({ spr: look.spr, x: Math.round(e.x * AP), y: Math.round(e.y * AP), lift: look.lift || 0 }); continue; }
    out.push({ spr: enemySprite(d, e.type), x: Math.round(e.x * AP), y: Math.round(e.y * AP), lift: e.type === 'wisp' || e.type === 'hollow' ? 5 : 0 });
  }
  for (const a of portalProps(d)) out.push({ spr: portalSprite(a.portal), x: Math.round((a.at.x + 0.5) * ATILE), y: Math.round(((a.at.y + 0.5) * TILE + 1) * AP) });
  for (const a of worldProps(d)) {
    if (a.wprop === 'spire') out.push({ spr: spireSprite(), x: Math.round((a.at.x + 0.5) * ATILE), y: Math.round(((a.at.y + 0.5) * TILE + 1) * AP) });
    else { const ts = terrPeek(d.terr) || {}, lit = (ts.lit || []).includes(a.k) || ts.done; out.push({ spr: waystoneSprite(lit), x: Math.round((a.at.x + 0.5) * ATILE), y: Math.round(((a.at.y + 0.5) * TILE + 1) * AP) }); }
  }
  if (d.fieldForge) out.push({ spr: fieldForgeSprite(d), x: Math.round((d.fieldForge.x + 0.5) * ATILE), y: Math.round((d.fieldForge.y + 0.5) * ATILE + ap(6)) });
  return out;
}

// The floor's standing plants by the tile their feet are on (no stands,
// nothing hanging), worked out once a floor's flora.
const PSH_NONE = [], _pshFG = { list: null, cells: null };
function pshFloraGrid(f) {
  const G = _pshFG;
  if (G.list === View.flora && G.cells && G.cells.length === f.w * f.h) return G;
  G.list = View.flora; G.cells = new Array(f.w * f.h);
  for (const it of View.flora || []) {
    if (it.top || it.strip || !it.piece) continue;
    const k = clamp(Math.floor(it.y / TILE), 0, f.h - 1) * f.w + clamp(Math.floor(it.x / TILE), 0, f.w - 1);
    (G.cells[k] || (G.cells[k] = [])).push(it);
  }
  return G;
}

// The frame's cast shadows, on the ground (render.js, after the floor,
// before anything stands on it).
function pshFrame(d, ox, oy) {
  const C = T.light.shadow.cast;
  if (!C) return;
  const f = d.floor;
  // (the outpost painted again if what stands round it has changed)
  if (d.hub && View.groundTone && PshBake.tone === View.groundTone && PshBake.sig !== pshHubSig()) { View.floorFor = null; }
  pshMaskStart();
  const lv = lampLevels(d), amb = lv.amb * (lv.tint[0] + lv.tint[1] + lv.tint[2]) / 3;
  const vx0 = -ox - 60, vx1 = -ox + View.w + 60, vy0 = -oy - 40, vy1 = -oy + View.h + 120;
  const p = d.p, lampAt = diverLampAt(d), lamp = { lx: lampAt.x, ly: lampAt.y, x: lampAt.x, y: p.y * AP, r: lv.r, i: lv.i };
  const movers = pshMovers(d);
  // at home: the Kindler and the settlers from the strongest lantern (the
  // rest is baked), and the lamp casts nothing
  if (d.hub) {
    const still = pshHubStill(d), HL = pshHubLights(d, still), base = amb;
    // (only round the Kindler, where the eye is)
    const near = lv.r * C.home.near;
    for (const o of movers) {
      if (Math.abs(o.x - lamp.x) > near || Math.abs(o.y - lamp.y) > near) continue;
      let best = null, bs = C.home.min;
      for (const L of HL) { const s = pshShare(L, o.x, o.y, base); if (s > bs) { bs = s; best = L; } }
      if (!best) continue;
      const ax = pshAxes(best.x, best.y, best.h, o.x, o.y + 0.5, C.home.k), spr = o.spr;
      // (against the place's light and the lamp's at its feet)
      const gl = lamp.i * lightFade(Math.min(1, Math.hypot(o.x - lamp.lx, o.y - lamp.ly) / lamp.r));
      if (ax) pshMaskCast(pshSil(spr), spr.ax, spr.ay, o.x, o.y + 0.5, ax[0], ax[1], ax[2], ax[3], ax[4], o.y, 1, pshTab(best, base + gl, C.home.dark, C.home.full, 1), best, null, ox, oy);
    }
  }
  // by day under the sky: the sun's, for what moves
  const sky = !!artBiome(f).sun, sun = sky ? clamp(sunOf(d), 0, 1) : 0;
  if (sun > 0.05) {
    const G = T.paint.ground, szx = G.sunDir[0] / G.sunSlope, szy = G.sunDir[1] / G.sunSlope, dk = C.sun * sun;
    for (const o of movers) {
      if (o.x < vx0 || o.x > vx1 || o.y < vy0 || o.y > vy1) continue;
      const spr = o.spr, lift = (o.lift || 0) * AP;
      pshMaskCast(pshSil(spr), spr.ax, spr.ay + lift, o.x, o.y + 0.5, 1, 0, szx, szy, 0, o.y, dk, null, null, null, ox, oy);
    }
    // Wick's, a soft blob as far off as it hovers
    if (d.drone) { const up = T.wick.up * AP; pshMaskBlob(d.drone.x * AP + ox + up * szx, (d.drone.y + T.wick.up) * AP + oy + up * szy, 4, 2.2, dk * 0.8); }
  }
  // the lamp's: what stands within its reach, away from it (not at home,
  // where the lanterns cast them)
  // (the lamp as a beam, T.light.beam: what stands in the beam casts from
  // it, as dark as the beam is there across it; what stands only in the
  // dim spill round him, from that)
  const Bm = !d.hub ? lampBeamOf(d, lv) : null;
  if (Bm) { lamp.x = Bm.lx; lamp.lx = Bm.x; lamp.ly = Bm.y; lamp.r = Bm.r; lamp.i = Bm.i; }
  const spill = Bm ? { lx: Bm.lx, ly: Bm.sy, x: Bm.lx, y: lamp.y, r: Bm.sr, i: Bm.si } : null;
  if (lv.lamp > 0 && lv.i > 0 && !d.hub) {
    const S2 = T.light.shadow.walls && !d.hub ? (Bm ? lampBeamSight(d, Bm) : lampSight(d, lv.r)) : null, E = ap(T.light.shadow.eye), r = lamp.r;
    // (the fixed lights already there at the lamp's foot share the light)
    const bk = View.bake, bake = (x, y) => { if (!bk) return 0; const i = Math.floor(x / LC), j = Math.floor(y / LC); if (i < 0 || j < 0 || i >= bk.w || j >= bk.h) return 0; const o = (j * bk.w + i) * 3; return (bk.a[o] + bk.a[o + 1] + bk.a[o + 2]) / 3 / T.art.lightSteps; };
    const one = (spr, ax, ay, fx, fy, footRow) => {
      const dx = fx - lamp.x, dy = fy - lamp.y;
      if (dx * dx + dy * dy > r * r) return;
      if (S2) { const ci = Math.floor(fx / LC) - S2.x0, cj = Math.floor((fy - 1) / LC) - S2.y0; if (ci < 0 || cj < 0 || ci >= S2.w || cj >= S2.w || S2.vis[cj * S2.w + ci] < 1) return; }
      let Lt = lamp, dk = 1;
      if (Bm) {
        dk = Math.min(1, beamAcross(Bm, fx, fy));
        if (dk < 0.2) { Lt = spill; dk = 1; if ((fx - spill.lx) ** 2 + (fy - spill.ly) ** 2 >= spill.r * spill.r) return; }
      }
      // (none where the lamp's shadow would be faint at its foot)
      const tab = pshTab(Lt, amb + bake(fx, fy), C.lamp, 0, C.pow), hx = fx - Lt.lx, hy = fy - Lt.ly, n = ((hx * hx + hy * hy) * PSH_TAB / (Lt.r * Lt.r)) | 0;
      if (n >= PSH_TAB || tab[n] * dk < C.least) return;
      const a = pshAxes(lamp.x, lamp.y, E, fx, fy, C.lampK);
      if (a) pshMaskCast(pshSil(spr), ax, ay, fx, fy, a[0], a[1], a[2], a[3], a[4], footRow, dk, tab, Lt, S2, ox, oy);
    };
    const FG = pshFloraGrid(f), ti0 = Math.max(0, Math.floor((lamp.x - r) / ATILE)), ti1 = Math.min(f.w - 1, Math.floor((lamp.x + r) / ATILE));
    for (let tj = Math.max(0, Math.floor((lamp.y - r) / ATILE)); tj <= Math.min(f.h - 1, Math.floor((lamp.y + r) / ATILE)); tj++) for (let ti = ti0; ti <= ti1; ti++) for (const it of FG.cells[tj * f.w + ti] || PSH_NONE) {
      if (Math.abs(it.x * AP - lamp.x) > r || Math.abs(it.y * AP - lamp.y) > r) continue;
      if (it.anchorT >= 0 && !TILE_SOLID[f.tiles[it.anchorT]]) continue;
      let spr = _pshItems.get(it);
      if (!spr) { spr = floraSprite(it.set, it.piece, 0); _pshItems.set(it, spr); }
      const fx = Math.round(it.x * AP), fy = Math.round(it.y * AP);
      one(spr, fx - Math.round(fx - spr.w / 2), spr.h - 1, fx, fy + 0.5, fy);
    }
    for (const o of movers) if (!o.me) one(o.spr, o.spr.ax, o.spr.ay + (o.lift || 0) * AP, o.x, o.y + 0.5, o.y);
  }
  pshMaskEnd();
}

// ---------------------------------------------------------------------------
// The contact shadow under a creature's, a person's or a prop's feet
// (render.js drawShadow): an ellipse in short horizontal strokes, darker in
// its middle, its ends ragged, no hard edge. A picture for each size.
// ---------------------------------------------------------------------------
const _pshContacts = new Map();
function pshContactPic(r, ry) {
  const key = r * 64 + ry;
  let pic = _pshContacts.get(key);
  if (pic) return pic;
  const S = T.paint.foes.read.shadow, w = 2 * Math.ceil(r) + 3, h = 2 * Math.ceil(ry) + 1, cx = w >> 1, cy = h >> 1;
  const [c, x] = makeCanvas(w, h), img = x.createImageData(w, h), d = img.data;
  for (let j = -Math.ceil(ry); j <= Math.ceil(ry); j++) {
    const yy = j / (ry + 0.5), half = r * Math.sqrt(Math.max(0, 1 - yy * yy));
    if (half < 0.5) continue;
    // the row's ends a pixel in or out, then strokes 2-5 px along it
    const l = Math.round(-half + (artHash(j, 1, key) - 0.5) * 2.2), rr = Math.round(half + (artHash(j, 2, key) - 0.5) * 2.2);
    let x0 = l;
    for (let n = 0; x0 <= rr; n++) {
      const len = 2 + Math.floor(artHash(n, j, key + 7) * 4), mid = x0 + len / 2, q = (mid / (r + 0.5)) ** 2 + yy * yy;
      const a = q < 0.3 ? S[1] : q < 0.75 ? (S[0] + S[1]) / 2 : S[0] * (artHash(n, j, key + 9) < 0.7 ? 1 : 0.5);
      for (let i = x0; i < Math.min(rr + 1, x0 + len); i++) {
        const o = ((cy + j) * w + cx + i) * 4;
        if (cx + i < 0 || cx + i >= w) continue;
        d[o + 3] = Math.round(a * 255);
      }
      x0 += len;
    }
  }
  x.putImageData(img, 0, 0);
  pic = { c, cx, cy };
  _pshContacts.set(key, pic);
  return pic;
}
// up: how high it hovers (world px): smaller and fainter the higher, as
// its own cast shadow falls off from it (T.light.shadow.cast.hover).
function pshContact(fx, fy, rx, up) {
  const H = T.light.shadow.cast.hover, k = up > 0 ? Math.max(H.least, 1 - up * H.shrink) : 1;
  const r = Math.round(rx * k * AP), ry = Math.round((1.5 * AP + Math.min(1.5, r * 0.08)) * k), pic = pshContactPic(r, ry), x = View.ctx;
  if (up > 0) x.globalAlpha = Math.max(H.faint, 1 - up * H.fade);
  x.drawImage(pic.c, fx - pic.cx, fy - pic.cy);
  x.globalAlpha = 1;
}
