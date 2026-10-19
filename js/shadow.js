'use strict';
// ---------------------------------------------------------------------------
// Shadows (cosmetic): the rock stops the diver's lamp, and big things cast a
// short shadow away from it. Both live in the light's own terms: the walls'
// on the light grid (render.js, a cell for each LC × LC art px), where the
// lamp's light is simply not added behind a wall, so the shadow falls to the
// ambient level in the light's hard bands; the props' as a darkening of the
// ground under the lit pass, in two hard steps with a ragged, clustered edge.
// Nothing here touches play: enemies' sight, bodies and generation are as
// they were. Numbers in T.light.shadow.
// ---------------------------------------------------------------------------

// What a light at a cell's middle can see, on the light grid: for each cell
// of a window round it, how much of the light reaches it (1, or 0 behind
// rock; a rock top the light doesn't reach keeps T.light.shadow.top).
//
// Rays are marched out from the light, a step of a few art px at a time, through the
// floor's rock pixels (View.rockPx, the smooth wall line itself, so a
// shadow's edge follows the wall rather than the tiles), each noting how far
// it went before it struck rock. A cell is lit if it's no further than its
// ray went, plus `reach` past it, so the near skin of the rock the light
// strikes stays lit. A wall's front face is lit where the ground under it
// is lit and the light is south of it, so a face the diver looks at never
// goes dark however low the light strikes it. The sinkhole stops nothing.
//
// A sight S is { x0, y0 (the world cell of its first), w (cells across, and
// down), vis (Float32Array) }.

// Per window: each cell's distance (art px) from the light's ground point
// (ey cells under the window's middle, where the light itself is) and the
// ray (of B) that passes nearest it, or -1 outside the light's disc; and
// each ray's direction and how far it need go to leave the disc.
const _sightTables = new Map();
function sightTables(H, B, ey) {
  const key = (H * 4096 + B) * 64 + ey;
  let t = _sightTables.get(key);
  if (t) return t;
  const w = 2 * H + 1, dist = new Float32Array(w * w), bin = new Int16Array(w * w), dx = new Float32Array(B), dy = new Float32Array(B), len = new Float32Array(B);
  const r = H * LC, e = ey * LC;
  for (let j = -H; j <= H; j++)
    for (let i = -H; i <= H; i++) {
      const k = (j + H) * w + i + H, jj = j - ey;
      dist[k] = Math.hypot(i, jj) * LC;
      bin[k] = Math.hypot(i, j) * LC > r ? -1 : (Math.round((Math.atan2(jj, i) / (2 * Math.PI)) * B) + B) % B;
    }
  for (let b = 0; b < B; b++) {
    const a = (b / B) * 2 * Math.PI, u = -e * Math.sin(a);
    dx[b] = Math.cos(a); dy[b] = Math.sin(a);
    len[b] = u + Math.sqrt(Math.max(0, u * u - e * e + r * r)) + LC;
  }
  t = { dist, bin, dx, dy, len, depth: new Float32Array(B), rock: new Uint8Array(w * w) };
  _sightTables.set(key, t);
  return t;
}

// Fills S with what a light sees out to r art px: its ground point (where
// its rays start) at world cell (cx, cy), the light itself ey cells above
// that. Returns false if its ground point is in rock (it then shadows
// nothing).
function seeFrom(f, cx, cy, r, S, ey = 0) {
  const Sh = T.light.shadow, R = View.rockPx, W = f.w * ATILE, Hp = f.h * ATILE;
  const H = Math.ceil(r / LC) + 1, w = 2 * H + 1, B = Math.max(16, 8 * Math.ceil((2 * Math.PI * (H + ey) * Sh.rays) / 8));
  const t = sightTables(H, B, ey), ox = (cx + 0.5) * LC, oy = (cy + 0.5) * LC, oxi = ox | 0, oyi = oy | 0;
  S.x0 = cx - H; S.y0 = cy - ey - H; S.w = w;
  if (!S.vis || S.vis.length < w * w) S.vis = new Float32Array(w * w);
  const vis = S.vis;
  if (oxi < 0 || oyi < 0 || oxi >= W || oyi >= Hp || R[oyi * W + oxi]) return false;
  // how far each ray goes before it strikes rock (the floor's edge is rock;
  // the sinkhole isn't), an art px at a time, but straight across a block
  // between four open tiles' middles, where there's no rock to find
  const depth = t.depth, lens = t.len, dxs = t.dx, dys = t.dy, ob = openBlocks(f), BW = f.w, h2 = ATILE / 2, st = Sh.step;
  for (let b = 0; b < B; b++) {
    const dx = dxs[b], dy = dys[b], ix = dx ? 1 / dx : 1e9, iy = dy ? 1 / dy : 1e9, rm = lens[b];
    let s = 1;
    while (s <= rm) {
      const x = ox + dx * s, y = oy + dy * s;
      if (x < 0 || y < 0 || x >= W || y >= Hp) break;
      const bx = Math.floor((x - h2) / ATILE), by = Math.floor((y - h2) / ATILE);
      if (bx >= 0 && by >= 0 && ob[by * BW + bx]) {
        // to where the ray leaves the block
        const ex = ((dx > 0 ? bx + 1 : bx) * ATILE + h2 - x) * ix, ey = ((dy > 0 ? by + 1 : by) * ATILE + h2 - y) * iy;
        const e = (dx ? ex : 1e9) < (dy ? ey : 1e9) ? ex : ey;
        s += e >= st ? Math.floor(e) : st;
        continue;
      }
      if (R[(y | 0) * W + (x | 0)] && floorTile(f, Math.floor(x / ATILE), Math.floor(y / ATILE)) !== TILE_PIT) break;
      s += st;
    }
    depth[b] = s;
  }
  // each cell, from the bottom row up: rock at its middle?, and lit? A
  // wall's face is lit where the ground under it is (and it faces the
  // light), so the rows under a cell are known when it's reached.
  // (a cell is rock as it's drawn: the rock layer's, standing up over the
  // ground behind it (paint.js), so its faces are as tall as they're drawn)
  const reach = Sh.reach * AP, top = Sh.top, dist = t.dist, bin = t.bin, rock = t.rock, K = Math.ceil(pntMaxLift() / LC) + 1, oj = H + ey, RS = View.rockLift || R;
  for (let j = w - 1; j >= 0; j--) {
    const py = (cy - ey - H + j) * LC + (LC >> 1), rowIn = py >= 0 && py < Hp, faces = j < oj + 1;
    for (let i = 0, k = j * w, px = (cx - H) * LC + (LC >> 1); i < w; i++, k++, px += LC) {
      const r = (rock[k] = !rowIn || px < 0 || px >= W ? 1 : RS[py * W + px] ? 1 : 0), bk = bin[k];
      if (bk < 0) { vis[k] = 0; continue; }
      if (dist[k] <= depth[bk] + reach) { vis[k] = 1; continue; }
      let v = 0;
      if (r) {
        v = top;
        if (faces)
          for (let n = 1, q = k + w; n <= K && j + n < w; n++, q += w) {
            if (rock[q]) continue;
            if (vis[q] && j + n <= oj + 1) v = 1;
            break;
          }
      }
      vis[k] = v;
    }
  }
  return true;
}

// For each block between four tiles' middles (its first at the middle of
// tile 0, 0), whether all four are open, so there's no rock in it at all
// (rockAt); kept until the rock changes.
const _openBlocks = { rock: null, lights: null, a: null };
function openBlocks(f) {
  const O = _openBlocks;
  if (O.rock === View.rockPx && O.lights === View.lights && O.a) return O.a;
  const a = new Uint8Array(f.w * f.h);
  for (let ty = 0; ty < f.h - 1; ty++)
    for (let tx = 0; tx < f.w - 1; tx++) {
      const k = ty * f.w + tx;
      a[k] = !TILE_SOLID[f.tiles[k]] && !TILE_SOLID[f.tiles[k + 1]] && !TILE_SOLID[f.tiles[k + f.w]] && !TILE_SOLID[f.tiles[k + f.w + 1]] ? 1 : 0;
    }
  O.rock = View.rockPx; O.lights = View.lights; O.a = a;
  return a;
}

// Adds a light as addLight does, but only as far as sight S lets it.
function addLightSeen(L, x, y, r, i, c, S) {
  if (!(r > 0) || !(i > 0)) return;
  const s = i * T.art.lightSteps, cr = c[0] * s, cg = c[1] * s, cb = c[2] * s, k = 1 / r, a = L.a, vis = S.vis, sw = S.w;
  const i0 = Math.max(0, Math.floor((x - r) / LC) - L.x0, S.x0 - L.x0), i1 = Math.min(L.w - 1, Math.ceil((x + r) / LC) - L.x0, S.x0 + sw - 1 - L.x0);
  const j0 = Math.max(0, Math.floor((y - r) / LC) - L.y0, S.y0 - L.y0), j1 = Math.min(L.h - 1, Math.ceil((y + r) / LC) - L.y0, S.y0 + sw - 1 - L.y0);
  for (let j = j0; j <= j1; j++) {
    const dy = (LC * (j + L.y0) + LC / 2 - y) * k, dy2 = dy * dy;
    if (dy2 >= 1) continue;
    let o = (j * L.w + i0) * 3, dx = (LC * (i0 + L.x0) + LC / 2 - x) * k, v = (j + L.y0 - S.y0) * sw + i0 + L.x0 - S.x0;
    for (let n = i0; n <= i1; n++, o += 3, v++, dx += LC * k) {
      const q = dx * dx + dy2, m = vis[v];
      if (q >= 1 || m <= 0) continue;
      const g = lightFade(Math.sqrt(q)) * m;
      a[o] += cr * g; a[o + 1] += cg * g; a[o + 2] += cb * g;
    }
  }
}

// The lamp's sight, kept while the diver stays in one cell and the rock is
// unchanged (a mined wall stops casting at once: View.lights is rebuilt
// with the rock).
const LampSight = { x0: 0, y0: 0, w: 0, vis: null, key: '', rock: null, lights: null, ok: false };
function lampSight(d, r) {
  const f = d.floor, p = d.p, Sh = T.light.shadow;
  let cx = Math.floor(diverLampAt(d).x / LC), cy = Math.floor((p.y * AP) / LC);
  // the light's ground point: under the brow lamp, level with the feet, or
  // the nearest open cell if a foot's on the rock's very edge
  const R = View.rockPx, W = f.w * ATILE, open = (i, j) => { const x = i * LC + (LC >> 1), y = j * LC + (LC >> 1); return x >= 0 && y >= 0 && x < W && y < f.h * ATILE && !R[y * W + x]; };
  if (!open(cx, cy)) for (const [i, j] of [[0, -1], [-1, 0], [1, 0], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) if (open(cx + i, cy + j)) { cx += i; cy += j; break; }
  // (the reach rounded up to whole steps, so the window is rebuilt rarely;
  // the window is round the lamp, the light's middle)
  const rr = Math.ceil(r / (4 * LC)) * 4 * LC, ey = Math.round(ap(Sh.eye) / LC), key = cx + ',' + cy + ',' + rr;
  const S = LampSight;
  if (S.key !== key || S.rock !== R || S.lights !== View.lights) {
    S.key = key; S.rock = R; S.lights = View.lights;
    S.ok = seeFrom(f, cx, cy, rr, S, ey);
  }
  return S.ok ? S : null;
}

// The floor's fixed lights (lava, vents, glowing plants, a temple's shaft of
// light) are stopped by the rock too, when they're baked (render.js,
// bakeFloorLights): each one's sight is kept, and after mining only those
// that reach the mined tiles are worked out again. A light in the rock (ore)
// is baked as it was.
const _bakedSights = { f: null, tiles: null, map: new Map() };
function bakedSightsFor(f) {
  const B = _bakedSights;
  if (B.f !== f || !B.tiles || B.tiles.length !== f.tiles.length) { B.f = f; B.tiles = f.tiles.slice(); B.map.clear(); return; }
  const changed = [];
  for (let i = 0; i < f.tiles.length; i++) if (f.tiles[i] !== B.tiles[i]) changed.push(((i % f.w) + 0.5) * ATILE, (Math.floor(i / f.w) + 0.5) * ATILE);
  if (!changed.length) return;
  B.tiles = f.tiles.slice();
  for (const [key, e] of B.map) {
    const cx = (e.x0 + e.w / 2) * LC, cy = (e.y0 + e.w / 2) * LC, reach = (e.w / 2) * LC + ATILE * 1.5;
    for (let n = 0; n < changed.length; n += 2) if (Math.abs(changed[n] - cx) < reach && Math.abs(changed[n + 1] - cy) < reach) { B.map.delete(key); break; }
  }
}
// One of the floor's lights, s (world px), into the bake map L.
function addBakedLight(f, L, s) {
  const x = s.x * AP, y = s.y * AP, r = s.r * AP, cx = Math.floor(x / LC), cy = Math.floor(y / LC), R = View.rockPx, W = f.w * ATILE;
  const px = cx * LC + (LC >> 1), py = cy * LC + (LC >> 1);
  if (!T.light.shadow.baked || s.inRock || px < 0 || py < 0 || px >= W || py >= f.h * ATILE || R[py * W + px]) { addLight(L, x, y, r, s.i, s.c); return; }
  const key = cx + ',' + cy + ',' + Math.ceil(r), M = _bakedSights.map;
  let e = M.get(key);
  if (!e) {
    const S = { vis: null };
    if (!seeFrom(f, cx, cy, r, S)) { addLight(L, x, y, r, s.i, s.c); return; }
    e = { x0: S.x0, y0: S.y0, w: S.w, vis: S.vis.slice(0, S.w * S.w) };
    M.set(key, e);
  }
  addLightSeen(L, x, y, r, s.i, s.c, e);
}

// ---------------------------------------------------------------------------
// The lamp's light, and what the props cast from it
// ---------------------------------------------------------------------------

// The diver's lamp at x, y (art px in the world, the helm's brow), stopped
// by the rock; or as before where there's no rock to stop it.
function addLampLight(d, L, x, y, r, i, c) {
  const S = T.light.shadow.walls && !d.hub ? lampSight(d, r) : null;
  if (S) addLightSeen(L, x, y, r, i, c, S);
  else addLight(L, x, y, r, i, c);
}

// The props that cast a shadow from the lamp, for a floor: its big standing
// plants (trees, giant mushrooms, columns, tall stalks), worked out once.
const _shadowFlora = { list: null, out: [] };
function shadowFlora() {
  if (_shadowFlora.list === View.flora) return _shadowFlora.out;
  const out = [];
  for (const it of View.flora || []) {
    if (!it.piece || it.top || ugClass(it.piece) < 2) continue;
    const spr = floraSprite(it.set, it.piece, 0), ft = ugFootSpan(spr);
    out.push({ fl: it, x: it.x, y: it.y, hw: Math.max(2, (ft.r - ft.l) / 2, spr.w * T.light.shadow.props.crown), cx: (ft.r + ft.l) / 2, h: spr.h });
  }
  _shadowFlora.list = View.flora; _shadowFlora.out = out;
  return out;
}

// The shadows big things cast from the lamp, darkening the ground under
// them (drawn after the floor, before anything stands on it). Each points
// straight away from the lamp, from its foot, a little longer the further it
// stands, and comes in two hard steps (rim, core) with a ragged edge in
// clusters; a step goes as the lamp's share of the light there falls. None
// where the lamp doesn't reach, or the rock hides the foot from it.
const _propCasters = [];
function drawLampShadows(d, ox, oy) {
  const Sh = T.light.shadow, P = Sh.props;
  if (!P || d.hub) return;
  const lv = lampLevels(d);
  if (lv.lamp <= 0) return;
  const f = d.floor, p = d.p, S = Sh.walls ? lampSight(d, lv.r) : null;
  // the lamp's ground point and the lamp itself, in art px in the world
  const lamp = diverLampAt(d), lx = lamp.x, ly = p.y * AP, hx = lx, hy = ly - ap(Sh.eye), steps = T.art.lightSteps;
  const amb = Math.max(1, Math.round(lv.amb * Math.max(...lv.tint) * steps)) / steps;
  const C = _propCasters;
  C.length = 0;
  const x0 = -ox - 40, x1 = -ox + View.w + 40, y0 = -oy - 40, y1 = -oy + View.h + 60;
  const near = (wx, wy) => { const ax = wx * AP, ay = wy * AP; return ax > x0 && ax < x1 && ay > y0 && ay < y1; };
  for (const c of shadowFlora()) if (near(c.x, c.y) && !(c.fl.anchorT >= 0 && !TILE_SOLID[f.tiles[c.fl.anchorT]])) C.push(c.x * AP + c.cx, c.y * AP, c.hw, c.h);
  for (const e of d.enemies) {
    if (e.dead || e.hid || !near(e.x, e.y)) continue;
    const spr = enemySprite(d, e.type);
    C.push(e.x * AP, e.y * AP, Math.max(ap(3), e.r * AP), spr.h);
  }
  for (const a of portalProps(d)) {
    const wx = (a.at.x + 0.5) * TILE, wy = (a.at.y + 0.5) * TILE + 1;
    if (near(wx, wy)) C.push(wx * AP, wy * AP, ap(P.portal), portalSprite(a.portal).h);
  }
  for (let n = 0; n < C.length; n += 4) {
    const fx = C[n], fy = C[n + 1], hw = C[n + 2], h = C[n + 3];
    const dist = Math.hypot(fx - lx, fy - ly);
    if (dist < 1 || dist > lv.r) continue;
    // the lamp's share of the light at the foot sets how many steps show
    const g = lv.i * lightFade(Math.min(1, Math.hypot(fx - hx, fy - hy) / lv.r)), share = g / (g + amb);
    const nSteps = share >= P.steps[1] ? 2 : share >= P.steps[0] ? 1 : 0;
    if (!nSteps) continue;
    if (S) { const ci = Math.floor(fx / LC) - S.x0, cj = Math.floor((fy - 1) / LC) - S.y0; if (ci < 0 || cj < 0 || ci >= S.w || cj >= S.w || S.vis[cj * S.w + ci] < 1) continue; }
    const len = Math.min(ap(P.len[2]), ap(P.len[0] + P.len[1] * (dist / AP))) * clamp(h / ap(P.tall), P.size[0], P.size[1]);
    propShadow(f, fx + ox, fy + oy, (fx - lx) / dist, (fy - ly) / dist, hw, len, nSteps, ox, oy);
  }
}

// A quick hash of two ints (0 – 2^32), for the shadows' ragged edges.
function shadowHash(x, y) {
  let h = Math.imul(x ^ 0x5ad0, 0x01000193) ^ Math.imul(y, 0x2c1b3c6d);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return h >>> 0;
}

// One prop's shadow on the view: foot at fx, fy (view px), pointing ux, uy,
// half as wide as hw at the foot, len long (art px). steps: 1 (the rim
// only) or 2. Only the ground is darkened: rock is skipped.
const _shadowMask = { c: null, x: null, img: null, d32: null };
function propShadow(f, fx, fy, ux, uy, hw, len, steps, ox, oy) {
  const P = T.light.shadow.props, back = Math.max(1, hw * P.back);
  // its box: the ellipse's reach along and across its axis
  const ax = Math.abs(ux), ay = Math.abs(uy);
  const bx0 = Math.max(0, Math.floor(fx + Math.min(ux * len, -ux * back) - ay * hw - 1)), bx1 = Math.min(View.w, Math.ceil(fx + Math.max(ux * len, -ux * back) + ay * hw + 1));
  const by0 = Math.max(0, Math.floor(fy + Math.min(uy * len, -uy * back) - ax * hw - 1)), by1 = Math.min(View.h, Math.ceil(fy + Math.max(uy * len, -uy * back) + ax * hw + 1));
  if (bx1 <= bx0 || by1 <= by0) return;
  // drawn as a mask of greys multiplied over the view (white where it
  // leaves the ground as it is), so the view's pixels needn't be read
  const bw = bx1 - bx0, bh = by1 - by0, M = _shadowMask;
  if (!M.c || M.img.width < bw || M.img.height < bh) {
    const mw = Math.max(bw, M.img ? M.img.width : 0, 64), mh = Math.max(bh, M.img ? M.img.height : 0, 64);
    [M.c, M.x] = makeCanvas(mw, mh);
    M.img = new ImageData(mw, mh); M.d32 = new Uint32Array(M.img.data.buffer);
  }
  const mw = M.img.width, d32 = M.d32, R = View.rockPx, LFs = View.rockLift, W = f.w * ATILE, Hp = f.h * ATILE;
  const grey = (v) => (0xff000000 | (v << 16) | (v << 8) | v) >>> 0, WHITE = 0xffffffff;
  const mr = grey(Math.round(P.dark[0] * 255)), mc = grey(Math.round(P.dark[1] * 255)), fray = P.fray, cw = P.core[0], cl = P.core[1];
  const iw = 1 / hw, il = 1 / len, ib = 1 / back;
  for (let y = by0; y < by1; y++) {
    const ry = y + 0.5 - fy, wy = y - oy, row = (y - by0) * mw - bx0;
    for (let x = bx0; x < bx1; x++) {
      d32[row + x] = WHITE;
      if (wy < 0 || wy >= Hp) continue;
      const rx = x + 0.5 - fx, t = rx * ux + ry * uy, s = rx * -uy + ry * ux;
      const a2 = s * iw * (s * iw), tn = t >= 0 ? t * il : t * ib, q = a2 + tn * tn;
      if (q >= 1) continue;
      const wx = x - ox;
      if (wx < 0 || wx >= W || R[wy * W + wx] || (LFs && LFs[wy * W + wx])) continue;
      // ragged in clusters of 2 × 2 art px fixed to the world (only the
      // edges need the noise)
      let hsh = -1;
      if (q >= 1 - fray) { hsh = shadowHash(wx >> 1, wy >> 1); if (q >= 1 - fray * ((hsh & 255) / 256)) continue; }
      let m = mr;
      if (steps > 1) {
        const sc = s * iw / cw, tc = t >= 0 ? t * il / cl : t * ib / cw, qc = sc * sc + tc * tc;
        if (qc < 1 - fray) m = mc;
        else if (qc < 1) { if (hsh < 0) hsh = shadowHash(wx >> 1, wy >> 1); if (qc < 1 - fray * (((hsh >> 8) & 255) / 256)) m = mc; }
      }
      d32[row + x] = m;
    }
  }
  M.x.putImageData(M.img, 0, 0, 0, 0, bw, bh);
  const c = View.ctx;
  c.globalCompositeOperation = 'multiply';
  c.drawImage(M.c, 0, 0, bw, bh, bx0, by0, bw, bh);
  c.globalCompositeOperation = 'source-over';
}
