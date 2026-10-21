'use strict';
// ---------------------------------------------------------------------------
// Shadows (cosmetic): the rock stops the diver's lamp, and what stands on
// the ground casts its silhouette away from it (pshadow.js). The walls' live
// on the light grid (render.js, a cell for each LC × LC art px), where the
// lamp's light is simply not added behind a wall, so the shadow falls to the
// ambient level in the light's hard bands; the rest as a darkening of the
// ground under the lit pass that takes back the lamp's share of the light.
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
// goes dark however low the light strikes it.
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
// nothing). cone (the lamp as a beam: beamSightCone) keeps each ray that
// leaves the beam to its near reach, so the rays behind him cost little.
function seeFrom(f, cx, cy, r, S, ey = 0, cone = null) {
  const Sh = T.light.shadow, R = View.rockPx, W = f.w * ATILE, Hp = f.h * ATILE;
  const H = Math.ceil(r / LC) + 1, w = 2 * H + 1, B = Math.max(16, 8 * Math.ceil((2 * Math.PI * (H + ey) * Sh.rays * (cone ? T.light.beam.rays : 1)) / 8));
  const t = sightTables(H, B, ey), ox = (cx + 0.5) * LC, oy = (cy + 0.5) * LC, oxi = ox | 0, oyi = oy | 0;
  S.x0 = cx - H; S.y0 = cy - ey - H; S.w = w;
  if (!S.vis || S.vis.length < w * w) S.vis = new Float32Array(w * w);
  const vis = S.vis;
  if (oxi < 0 || oyi < 0 || oxi >= W || oyi >= Hp || R[oyi * W + oxi]) return false;
  // how far each ray goes before it strikes rock (the floor's edge is
  // rock), an art px at a time, but straight across a block
  // between four open tiles' middles, where there's no rock to find
  const depth = t.depth, lens = t.len, dxs = t.dx, dys = t.dy, ob = openBlocks(f), BW = f.w, h2 = ATILE / 2, st = Sh.step;
  for (let b = 0; b < B; b++) {
    const dx = dxs[b], dy = dys[b], ix = dx ? 1 / dx : 1e9, iy = dy ? 1 / dy : 1e9, rm = cone ? beamRayReach(cone, ox, oy, dx, dy, lens[b]) : lens[b];
    // (a beam's rays that go only to its near reach are many more than so
    // short a reach needs: only every third is marched)
    if (cone && b % 3 && rm <= cone.near) { depth[b] = -1; continue; }
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
      if (R[(y | 0) * W + (x | 0)]) break;
      s += st;
    }
    depth[b] = s;
  }
  if (cone) for (let b = 0; b < B; b++) if (depth[b] < 0) { const a = b - (b % 3), c = a + 3 < B ? a + 3 : 0; depth[b] = Math.min(depth[a], depth[c]); }
  // each cell, from the bottom row up: rock at its middle?, and lit? A
  // wall's face is lit where the ground under it is (and it faces the
  // light), so the rows under a cell are known when it's reached.
  // (a cell is rock as it's drawn: the rock layer's, standing up over the
  // ground behind it (paint.js), so its faces are as tall as they're drawn)
  const reach = Sh.reach * AP, top = Sh.top, dist = t.dist, bin = t.bin, rock = t.rock, K = Math.ceil(pntMaxLift() / LC) + 1, oj = H + ey, RS = View.rockLift || R;
  // (a beam's: only the cells in its box, and the faces' rows under it;
  // the rest see nothing)
  let ci0 = 0, ci1 = w - 1, cj0 = 0, cj1 = w - 1;
  if (cone && cone.box) {
    const b = cone.box, X0 = cx - H, Y0 = cy - ey - H;
    ci0 = clamp(Math.floor(b[0] / LC) - X0, 0, w - 1); ci1 = clamp(Math.ceil(b[2] / LC) - X0, 0, w - 1);
    cj0 = clamp(Math.floor(b[1] / LC) - Y0, 0, w - 1); cj1 = clamp(Math.ceil(b[3] / LC) - Y0 + K, 0, w - 1);
    vis.fill(0, 0, w * w);
  }
  for (let j = cj1; j >= cj0; j--) {
    const py = (cy - ey - H + j) * LC + (LC >> 1), rowIn = py >= 0 && py < Hp, faces = j < oj + 1;
    for (let i = ci0, k = j * w + ci0, px = (cx - H + ci0) * LC + (LC >> 1); i <= ci1; i++, k++, px += LC) {
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

// The light's ground point (a world cell) under a lamp at x (art px),
// level with the feet, or the nearest open cell if a foot's on the rock's
// very edge.
const _lampCell = [0, 0];
function lampGroundCell(d, x) {
  const f = d.floor, R = View.rockPx, W = f.w * ATILE, open = (i, j) => { const x = i * LC + (LC >> 1), y = j * LC + (LC >> 1); return x >= 0 && y >= 0 && x < W && y < f.h * ATILE && !R[y * W + x]; };
  let cx = Math.floor(x / LC), cy = Math.floor((d.p.y * AP) / LC);
  if (!open(cx, cy)) for (const [i, j] of [[0, -1], [-1, 0], [1, 0], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) if (open(cx + i, cy + j)) { cx += i; cy += j; break; }
  _lampCell[0] = cx; _lampCell[1] = cy;
  return _lampCell;
}

// The lamp's sight, kept while the diver stays in one cell and the rock is
// unchanged (a mined wall stops casting at once: View.lights is rebuilt
// with the rock).
const LampSight = { x0: 0, y0: 0, w: 0, vis: null, key: '', rock: null, lights: null, ok: false };
function lampSight(d, r) {
  const f = d.floor, Sh = T.light.shadow, R = View.rockPx, [cx, cy] = lampGroundCell(d, diverLampAt(d).x);
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

// ---------------------------------------------------------------------------
// The lamp as a beam (T.light.beam; render.js lampBeamOf), an example to
// compare with the round glow
// ---------------------------------------------------------------------------

// The beam's sight: as the lamp's, out to the beam's reach, but only within
// the beam (its direction to the nearest of T.light.beam.sightSteps, its
// edge widened by that much) and round him as far as the spill reaches, so
// it costs about what the glow's does. Kept while he stays in one cell,
// turned the same way, and the rock is unchanged.
const BeamSight = { x0: 0, y0: 0, w: 0, vis: null, key: '', rock: null, lights: null, ok: false };
// The box (art px in the world: x0, y0, x1, y1) round the beam's cone out to
// reach r, its halo's edge widened by wide.
const _beamBox = [0, 0, 0, 0];
function beamBox(Bm, wide, r) {
  const B = _beamBox, e = Bm.edge + wide;
  B[0] = B[2] = Bm.ax; B[1] = B[3] = Bm.ay;
  for (let k = -4; k <= 4; k++) {
    const a = Bm.ang + (e * k) / 4, x = Bm.x + Math.cos(a) * r, y = Bm.y + Math.sin(a) * r;
    if (x < B[0]) B[0] = x; if (x > B[2]) B[2] = x; if (y < B[1]) B[1] = y; if (y > B[3]) B[3] = y;
  }
  return B;
}
const _beamCone = { ax: 0, ay: 0, dx: 0, dy: 0, cos: 0, near: 0 };
function lampBeamSight(d, Bm, S = BeamSight) {
  const f = d.floor, Sh = T.light.shadow, R = View.rockPx, [cx, cy] = lampGroundCell(d, Bm.lx), n = T.light.beam.sightSteps;
  const rr = Math.ceil(Bm.r / (4 * LC)) * 4 * LC, ey = Math.round(ap(Sh.eye) / LC), q = ((Math.round((Bm.ang / (2 * Math.PI)) * n) % n) + n) % n;
  const near = Math.ceil((Bm.sr + Math.abs(Bm.feet - Bm.sy) + 2 * LC) / (4 * LC)) * 4 * LC, edge = Math.round(Bm.edge * 20);
  const key = cx + ',' + cy + ',' + rr + ',' + q + ',' + near + ',' + edge + ',' + (Bm.ax - Bm.lx) + ',' + (Bm.ay - Bm.feet);
  if (S.key !== key || S.rock !== R || S.lights !== View.lights) {
    S.key = key; S.rock = R; S.lights = View.lights;
    const a = (q / n) * 2 * Math.PI, C = _beamCone;
    C.dx = Math.cos(a); C.dy = Math.sin(a); C.ax = Bm.ax; C.ay = Bm.ay; C.near = near;
    C.cos = Math.cos(Math.min(Math.PI * 0.95, Bm.edge + (Math.PI * 1.2) / n));
    // its box: round the ground point as far as the near reach, and the
    // cone's (from beamBox, widened by the turn it's worked out for)
    const gx = (cx + 0.5) * LC, gy = (cy + 0.5) * LC, bb = beamBox(Bm, (Math.PI * 1.2) / n, rr);
    C.box = [Math.min(gx - near, bb[0]), Math.min(gy - near, bb[1]), Math.max(gx + near, bb[2]), Math.max(gy + near, bb[3])];
    S.ok = seeFrom(f, cx, cy, rr, S, ey, C);
  }
  return S.ok ? S : null;
}

// How far a ray from ox, oy along dx, dy need be marched, out to rm, for
// the beam cone C: to the furthest of a few points along it still inside
// the cone, a step further, and at least C.near.
function beamRayReach(C, ox, oy, dx, dy, rm) {
  const N = 10;
  for (let k = N; k >= 1; k--) {
    const s = (rm * k) / N, vx = ox + dx * s - C.ax, vy = oy + dy * s - C.ay, al = vx * C.dx + vy * C.dy;
    if (al > 0 && al * al >= C.cos * C.cos * (vx * vx + vy * vy)) return Math.max(C.near, Math.min(rm, (rm * (k + 1)) / N));
  }
  return Math.min(rm, C.near);
}

// The beam's falloff across it, over the cosine of the angle off its axis
// from cOut (0) to 1 (BEAM_N steps): nothing at its halo's edge, a faint
// halo rising to its edge, then rising smoothly to its full core, a little
// brighter still on its axis. And along it, over the square of the
// distance as a share of its reach.
const BEAM_N = 256, _beamTabs = { key: '', across: new Float32Array(BEAM_N + 1), pow: -1, along: new Float32Array(BEAM_N + 1) };
function beamTables(Bm) {
  const B = T.light.beam, Tb = _beamTabs, key = Bm.core + ',' + Bm.main + ',' + Bm.edge + ',' + B.soften;
  if (Tb.key !== key) {
    Tb.key = key;
    const sm = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u)), th0 = Bm.core, th1 = Bm.main, th2 = Bm.edge, raw = new Float32Array(BEAM_N + 1);
    for (let n = 0; n <= BEAM_N; n++) {
      const th = Math.acos(Math.min(1, Bm.cOut + ((1 - Bm.cOut) * n) / BEAM_N)), main = sm((th1 - th) / Math.max(1e-6, th1 - th0));
      const halo = B.halo[1] * sm((th2 - th) / Math.max(1e-6, th2 - th1 * 0.6));
      raw[n] = main * (1 + B.axis * clamp(1 - th / Math.max(1e-6, th0), 0, 1)) + halo * (1 - main);
    }
    // softened: each the mean of those round it, soften of the cosine's
    // range across, so its bright middle is a broad pool, not a stripe
    const h = Math.round((B.soften * BEAM_N) / 2);
    for (let n = 0; n <= BEAM_N; n++) {
      let t = 0;
      for (let m = n - h; m <= n + h; m++) t += raw[m < 0 ? 0 : m > BEAM_N ? BEAM_N : m];
      Tb.across[n] = t / (2 * h + 1);
    }
  }
  if (Tb.pow !== B.pow) { Tb.pow = B.pow; for (let n = 0; n <= BEAM_N; n++) Tb.along[n] = Math.pow(1 - Math.sqrt(n / BEAM_N), B.pow); }
  return Tb;
}

// How much of the beam reaches world point x, y (art px), 0 to about 1,
// leaving the walls out.
function beamShare(Bm, x, y) {
  const ux = x - Bm.ax, uy = y - Bm.ay, al = ux * Bm.dx + uy * Bm.dy;
  if (al <= 0) return 0;
  const c = al / Math.sqrt(ux * ux + uy * uy);
  if (c <= Bm.cOut) return 0;
  const vx = x - Bm.x, vy = y - Bm.y, q = (vx * vx + vy * vy) / (Bm.r * Bm.r);
  if (q >= 1) return 0;
  const Tb = beamTables(Bm);
  return Tb.across[((c - Bm.cOut) / (1 - Bm.cOut)) * BEAM_N | 0] * Tb.along[(q * BEAM_N) | 0];
}

// How much of the beam there is across it at world point x, y (art px), 0
// at its halo's edge to 1 in its core (and a little over on its axis),
// leaving its reach out.
function beamAcross(Bm, x, y) {
  const ux = x - Bm.ax, uy = y - Bm.ay, al = ux * Bm.dx + uy * Bm.dy;
  if (al <= 0) return 0;
  const c = al / Math.sqrt(ux * ux + uy * uy);
  return c <= Bm.cOut ? 0 : beamTables(Bm).across[((c - Bm.cOut) / (1 - Bm.cOut)) * BEAM_N | 0];
}

// Adds the beam's cone of light (colour c) into the light map L, as far as
// sight S lets it (all of it, with none). Only the cells in the cone's box
// are visited.
function addConeLight(L, Bm, c, S) {
  if (!(Bm.r > 0) || !(Bm.i > 0)) return;
  const s = Bm.i * T.art.lightSteps, cr = c[0] * s, cg = c[1] * s, cb = c[2] * s, a = L.a, Tb = beamTables(Bm), AC = Tb.across, AL = Tb.along;
  const r = Bm.r, ir2 = 1 / (r * r), co = Bm.cOut, kc = BEAM_N / (1 - co), co2 = co * co, rg = T.light.beam.ragged * Math.PI / 180 * kc;
  // the cone's box
  const [bx0, by0, bx1, by1] = beamBox(Bm, 0, r);
  let i0 = Math.max(0, Math.floor(bx0 / LC) - L.x0), i1 = Math.min(L.w - 1, Math.ceil(bx1 / LC) - L.x0);
  let j0 = Math.max(0, Math.floor(by0 / LC) - L.y0), j1 = Math.min(L.h - 1, Math.ceil(by1 / LC) - L.y0);
  const vis = S ? S.vis : null, sw = S ? S.w : 0;
  if (S) { i0 = Math.max(i0, S.x0 - L.x0); i1 = Math.min(i1, S.x0 + sw - 1 - L.x0); j0 = Math.max(j0, S.y0 - L.y0); j1 = Math.min(j1, S.y0 + sw - 1 - L.y0); }
  for (let j = j0; j <= j1; j++) {
    const py = LC * (j + L.y0) + LC / 2, uy = py - Bm.ay, vy = py - Bm.y, vy2 = vy * vy, rowPh = (artHash(j + L.y0, 7, 0x6ec2) * 3) | 0;
    let o = (j * L.w + i0) * 3, v = S ? (j + L.y0 - S.y0) * sw + i0 + L.x0 - S.x0 : 0;
    for (let n = i0; n <= i1; n++, o += 3, v++) {
      const px = LC * (n + L.x0) + LC / 2, ux = px - Bm.ax, al = ux * Bm.dx + uy * Bm.dy;
      if (al <= 0 || al * al <= co2 * (ux * ux + uy * uy)) continue;
      const vx = px - Bm.x, q = (vx * vx + vy2) * ir2;
      if (q >= 1) continue;
      const m = vis !== null ? vis[v] : 1;
      if (m <= 0) continue;
      // (its edges broken into short strokes across, fixed to the world, by
      // as much of a turn right across it: in the cosine, that's less near
      // its axis, where an even share scrambled its bright middle in bricks)
      const c = al / Math.sqrt(ux * ux + uy * uy), c0 = (c - co) * kc, st = n + L.x0 + rowPh, rag = (artHash((st / 3) | 0, j + L.y0, 0x6ec1) - 0.5) * rg * Math.sqrt(1 - c * c);
      const ci = (c0 + rag) | 0, g = AC[ci < 0 ? 0 : ci > BEAM_N ? BEAM_N : ci] * AL[(q * BEAM_N) | 0] * m;
      a[o] += cr * g; a[o + 1] += cg * g; a[o + 2] += cb * g;
    }
  }
}

// The lamp as a beam: the cone, the dim spill round him and the small hot
// spot at the lamp, stopped by the rock (but at home, where nothing is).
function addLampBeam(d, L, Bm, c) {
  const B = T.light.beam, S = T.light.shadow.walls && !d.hub ? lampBeamSight(d, Bm) : null;
  addConeLight(L, Bm, c, S);
  if (S) addLightSeen(L, Bm.lx, Bm.sy, Bm.sr, Bm.si, c, S);
  else addLight(L, Bm.lx, Bm.sy, Bm.sr, Bm.si, c);
  addLight(L, Bm.lx, Bm.ly, ap(B.hot[0]), B.hot[1] * Bm.i / B.i, c);
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

// The shadows what stands on the ground casts from the lamp (and the sun,
// and at home the lanterns), on the ground: pshadow.js.
function drawLampShadows(d, ox, oy) { pshFrame(d, ox, oy); }

// What shows of the beam in the air, in a dark place (cosmetic; drawn in
// the air over everyone, before the frame is lit, so the beam lights it
// too). Its haze: loose horizontal strokes of the lamp's colour in a shaft
// from the lamp, drifting out along it and coming down to the ground as
// the beam does, thicker and brighter nearer the lamp. And dust motes
// drifting slowly through the cone, fixed to the world, a warm px or two
// each, brighter where the beam is. None in the rock, or where the beam
// can't see.
function drawBeamAir(d, Bm, lv, ox, oy) {
  const A = T.light.beam.air, dark = clamp((0.95 - lv.amb) / 0.45, 0, 1) * Math.min(1, lv.lamp) * Bm.flick;
  if (dark <= 0.02 || !(Bm.r > 0)) return;
  const f = d.floor, S = T.light.shadow.walls && !d.hub ? lampBeamSight(d, Bm) : null, R = View.rockPx, LF = View.rockLift || R, W = f.w * ATILE, Hp = f.h * ATILE;
  const t = Game.realT, cols = [DIVER_PAL.lamp[0], '#ffe2b0', '#ffc878'];
  // the ground point gx, gy seen from the beam's sight, and the view's
  // pixel x, y over it not rock
  const clear = (gx, gy, x, y) => {
    const xi = x | 0, yi = y | 0, gi = gx | 0, gj = gy | 0;
    if (gi < 0 || gj < 0 || gi >= W || gj >= Hp || R[gj * W + gi] || xi < 0 || yi < 0 || xi >= W || yi >= Hp || LF[yi * W + xi]) return false;
    if (!S) return true;
    const i = Math.floor(gx / LC) - S.x0, j = Math.floor(gy / LC) - S.y0;
    return i >= 0 && j >= 0 && i < S.w && j < S.w && S.vis[j * S.w + i] >= 1;
  };
  // the haze: s out along the beam (0-1 of D), each stroke drifting out
  const [N, ha, far] = A.haze, D = Bm.r * far, H0 = Bm.feet - Bm.ly, tw = Math.tan(Bm.main * 0.55);
  for (let n = 0; n < N; n++) {
    const h1 = artHash(n, 1, 0x6eb1), h2 = artHash(n, 2, 0x6eb1), h3 = artHash(n, 3, 0x6eb1);
    const u = (h1 + t * (0.05 + 0.05 * h2)) % 1, gen = Math.floor(h1 + t * (0.05 + 0.05 * h2)), s = Math.pow(u, 1.35) * D;
    const w = (artHash(n, gen, 0x6eb2) * 2 - 1) * (2 + s * tw), gx = Bm.lx + Bm.dx * s - Bm.dy * w, gy = Bm.feet + Bm.dy * s + Bm.dx * w;
    // (as high as the lamp at the lamp, down to the ground D out)
    const x = Math.round(gx), y = Math.round(gy - H0 * (1 - s / D) * (1 - s / D));
    if (!clear(gx, gy, x, y)) continue;
    const al = ha * dark * Math.sin(Math.PI * u) * Math.pow(1 - u, 0.6), len = 2 + Math.floor(h3 * (u < 0.4 ? 5 : 3)), c = cols[(h3 * 2.99) | 0];
    for (let k = 0; k < len; k++) dot(x + ox + k - (len >> 1), y + oy, c, true, al * (k === 0 || k === len - 1 ? 0.6 : 1));
  }
  // the motes: one at most in each cell of a grid G art px across
  const G = 14, chance = (A.motes[0] * G * G) / 10000, r = Bm.r;
  const [bx0, by0, bx1, by1] = beamBox(Bm, 0, r);
  for (let gy = Math.floor(by0 / G); gy <= Math.floor(by1 / G); gy++)
    for (let gx = Math.floor(bx0 / G); gx <= Math.floor(bx1 / G); gx++) {
      if (artHash(gx, gy, 0x6ea1) >= chance) continue;
      const h1 = artHash(gx, gy, 0x6ea2), h2 = artHash(gx, gy, 0x6ea3), h3 = artHash(gx, gy, 0x6ea4);
      // (drifting slowly in a loop of its own, and twinkling)
      const x = (gx + h1) * G + Math.sin(t * (0.25 + 0.2 * h2) + h3 * 6.3) * 6, y = (gy + h2) * G + Math.cos(t * (0.2 + 0.15 * h1) + h1 * 6.3) * 5;
      const sh = beamShare(Bm, x, y), tw2 = 0.5 + 0.5 * Math.sin(t * (0.9 + h3) + h2 * 6.3);
      if (sh < 0.08 || tw2 < 0.3 || !clear(x, y, x, y)) continue;
      // (they show best out where the beam is dimmer than at its heart)
      const al = A.motes[1] * dark * Math.min(1, sh * 4) * (sh > 0.6 ? 0.5 : 1) * tw2, vx = Math.round(x) + ox, vy = Math.round(y) + oy, c = h3 < 0.5 ? '#fff6e0' : cols[1];
      dot(vx, vy, c, true, al);
      if (h1 < 0.35) dot(vx + 1, vy, c, true, al * 0.5);
    }
  // a flare at the lamp, unless he's turned away from us
  if (Bm.dy > -0.45) {
    const x = Math.round(Bm.lx) + ox, y = Math.round(Bm.ly) + oy, k = dark * (0.6 + 0.4 * Bm.dy);
    dot(x + Math.round(Bm.dx), y, '#ffffff', true, k);
    dot(x + Math.round(Bm.dx * 2), y + (Bm.dy > 0.5 ? 1 : 0), cols[1], true, 0.6 * k);
  }
}
