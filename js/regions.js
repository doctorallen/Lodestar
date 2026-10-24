'use strict';
// ---------------------------------------------------------------------------
// Regions (DESIGN.md, The world): the climes laid as countries over one
// layer of the world, each about four old sites across, melding into one
// another along their borders. The surface has the four climes under the
// sky (the Badlands round the star, the gentle one), the Deep the four
// cave climes (the Caverns under the star).
//
// layRegions(f, seed, climes, home, hx, hy) seeds a Voronoi field over the
// floor's tiles (sites on a jittered grid, the borders warped by noise),
// gives the region holding (hx, hy) the home clime, rolls the rest, and
// marks each tile with its region (f.climeIdx), the next nearest region
// (f.climeIdx2) and how much of that second one shows there (f.climeMix,
// 0..127 for 0..0.5): the meld. Everything that used to read a floor's one
// clime reads it by place instead:
//   climeAt(f, tx, ty)        the clime that holds the tile
//   climeLookAt(f, tx, ty)    its look (CLIME_ART's shape), blended across
//                             a border from the two climes' ramps
//   climeLightAt(f, tx, ty)   its light, blended the same way
//   climeHere(d)              the clime the Kindler stands in
// Hazards are laid a region at a time (placeRegionHazards: the shared
// placer in floor.js, over the region's own caverns), the flora a set a
// clime (placeRegionFlora, undergrowth.js), the creatures by the room
// (enemies.js), the critters by the region (life.js). Numbers are in
// T.regions.
// ---------------------------------------------------------------------------

function layRegions(f, seed, climes, home, hx, hy) {
  const R = T.regions, w = f.w, h = f.h, n = Math.max(2, Math.round(Math.sqrt((w * h) / R.area)));
  const rng = new Rng(hashInts(seed, 0x4e61, f.layer | 0));
  const sites = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) sites.push({ x: ((i + 0.25 + rng.f() * 0.5) * w) / n, y: ((j + 0.25 + rng.f() * 0.5) * h) / n });
  // the region that holds the home point takes the home clime; the rest
  // take the climes in a shuffled round, so each turns up about as often
  let homeK = 0, hd = Infinity;
  for (let k = 0; k < sites.length; k++) { const m = Math.hypot(sites[k].x - hx, sites[k].y - hy); if (m < hd) { hd = m; homeK = k; } }
  const deck = [];
  while (deck.length < sites.length) { const round = climes.slice(); for (let i = round.length - 1; i > 0; i--) { const j = rng.i(0, i); [round[i], round[j]] = [round[j], round[i]]; } deck.push(...round); }
  // (the home clime's turn in the deck goes to the home region)
  const hi = deck.indexOf(home);
  if (hi >= 0) deck.splice(hi, 1);
  deck.splice(homeK, 0, home);
  f.regions = sites.map((s, k) => ({ clime: deck[k], x: Math.round(s.x), y: Math.round(s.y), name: climeName(deck[k]), seen: false }));
  // the field: each tile's nearest two sites, its place warped by noise so
  // the borders wander; the meld where the two are nearly as near
  const idx = (f.climeIdx = new Uint8Array(w * h)), idx2 = (f.climeIdx2 = new Uint8Array(w * h)), mix = (f.climeMix = new Uint8Array(w * h));
  const W1 = R.warp[0], A1 = R.warp[1], W2 = R.warp[0] * 0.37, A2 = R.warp[1] * 0.4, meld = R.meld, salt = (seed ^ 0x2e6) | 0;
  for (let ty = 0; ty < h; ty++)
    for (let tx = 0; tx < w; tx++) {
      const px = tx + wallNoise(tx + salt, ty, W1) * A1 + wallNoise(tx + 300, ty + salt, W2) * A2;
      const py = ty + wallNoise(tx, ty + 500 + salt, W1) * A1 + wallNoise(tx + salt, ty + 800, W2) * A2;
      let a = 0, da = Infinity, b = 0, db = Infinity;
      for (let k = 0; k < sites.length; k++) {
        const m = Math.hypot(sites[k].x - px, sites[k].y - py);
        if (m < da) { b = a; db = da; a = k; da = m; } else if (m < db) { b = k; db = m; }
      }
      const i = ty * w + tx;
      idx[i] = a; idx2[i] = b;
      // (the same clime either side: no meld to paint)
      mix[i] = deck[a] === deck[b] ? 0 : Math.round(clamp(0.5 - (0.5 * (db - da)) / meld, 0, 0.5) * 255);
    }
  return f;
}

// The region (its index in f.regions) that holds tile tx, ty; -1 where
// the floor has none.
function regionAt(f, tx, ty) {
  if (!f.regions) return -1;
  return f.climeIdx[clamp(ty, 0, f.h - 1) * f.w + clamp(tx, 0, f.w - 1)];
}
// The clime that holds tile tx, ty: its region's, else the floor's own.
function climeAt(f, tx, ty) {
  const k = regionAt(f, tx, ty);
  return k >= 0 ? f.regions[k].clime : f.clime || null;
}
const climeAtPx = (f, x, y) => climeAt(f, Math.floor(x / TILE), Math.floor(y / TILE));
// The region the Kindler stands in, and its clime.
function regionHere(d) { return regionAt(d.floor, Math.floor(d.p.x / TILE), Math.floor(d.p.y / TILE)); }
function climeHere(d) { return climeAtPx(d.floor, d.p.x, d.p.y); }

// A clime's own look: its CLIME_ART, or the layer's base look (the sunlit
// badlands; the Rim's caves) for the one that has none.
const _regionBase = {};
function climeBaseLook(f, clime) {
  if (clime && CLIME_ART[clime]) return CLIME_ART[clime];
  const key = f.zone + '/' + f.biome;
  return _regionBase[key] || (_regionBase[key] = artBiome({ zone: f.zone, biome: f.biome, clime: null, hub: false }));
}
// Two looks blended t of the way (0..0.5) from a to b: each ramp's tones
// mixed, the rest a's. Kept, so the painter's own caches (pntLook) hold.
const _regionLooks = new Map();
function regionMixLook(f, a, b, t) {
  const step = Math.round(t * 8);
  if (step === 0 || a === b) return climeBaseLook(f, a);
  const key = `${f.layer | 0}/${a}/${b}/${step}`;
  let L = _regionLooks.get(key);
  if (L) return L;
  const A = climeBaseLook(f, a), B = climeBaseLook(f, b), u = step / 8;
  const ramp = (P, Q) => P.map((c, i) => mix(c, Q[Math.min(i, Q.length - 1)], u));
  L = Object.assign({}, A, { floor: ramp(A.floor, B.floor), rock: ramp(A.rock, B.rock), front: ramp(A.front, B.front) });
  _regionLooks.set(key, L);
  return L;
}
// The look at tile tx, ty: its region's, melding into the next along a
// border; the floor's own where it has no regions.
function climeLookAt(f, tx, ty) {
  if (!f.regions) return artBiome(f);
  const i = clamp(ty, 0, f.h - 1) * f.w + clamp(tx, 0, f.w - 1), R = f.regions;
  return regionMixLook(f, R[f.climeIdx[i]].clime, R[f.climeIdx2[i]].clime, f.climeMix[i] / 255);
}
const climeLookAtPx = (f, x, y) => climeLookAt(f, Math.floor(x / TILE), Math.floor(y / TILE));
// The look at art px (x, y) of the floor.
const climeLookAtArt = (f, x, y) => climeLookAt(f, Math.floor(x / ATILE), Math.floor(y / ATILE));

// The light at tile tx, ty (T.climes[].light: under the sky day, dusk and
// tint; below, ambient and tint), blended across a border. Where a clime
// sets none, the layer's own (the zone's light, or T.light).
function climeLightAt(f, tx, ty) {
  if (!f.regions) return climeLight(f);
  const i = clamp(ty, 0, f.h - 1) * f.w + clamp(tx, 0, f.w - 1), R = f.regions, t = f.climeMix[i] / 255;
  const base = f.layer ? { ambient: T.light.ambient, tint: T.light.tint } : T.zones.surface.light;
  const of = (clime) => Object.assign({}, base, (T.climes[clime] && T.climes[clime].light) || {});
  const A = of(R[f.climeIdx[i]].clime);
  if (t <= 0.02) return A;
  const B = of(R[f.climeIdx2[i]].clime), out = {};
  for (const k of Object.keys(A)) out[k] = Array.isArray(A[k]) ? A[k].map((v, j) => lerp(v, B[k][j], t)) : typeof A[k] === 'number' ? lerp(A[k], B[k], t) : A[k];
  return out;
}

// Each hazard code's kind (floor.js HAZ_CODES).
const HAZ_KINDS = ['', 'pool', 'slick', 'burn'];
// The hazard kind at world px (x, y): the ground's, else none.
function hazKindAtPx(f, x, y) { return HAZ_KINDS[hazardAt(f, x, y)] || null; }

// The hazards of a floor with regions: each region's clime lays its own
// over the region's caverns (floor.js layHazard), as many as its size
// asks, none in the star's clearing.
function placeRegionHazards(f, seed) {
  f.haz = null; f.hazPts = null; f.hazKind = null; f.hazCode = 0; f.hazKinds = [];
  if (!f.regions) return f;
  const banned = hazardBans(f);
  if (f.star) { const S = T.star, R = S.clear + 4; for (let y = f.star.y - R; y <= f.star.y + R; y++) for (let x = f.star.x - R; x <= f.star.x + R; x++) if (x >= 0 && y >= 0 && x < f.w && y < f.h) banned[y * f.w + x] = 1; }
  for (const sh of f.shafts || []) for (let y = sh.y - 2; y <= sh.y + 2; y++) for (let x = sh.x - 2; x <= sh.x + 2; x++) if (x >= 0 && y >= 0 && x < f.w && y < f.h) banned[y * f.w + x] = 1;
  const perSite = T.regions.siteRooms;
  for (let k = 0; k < f.regions.length; k++) {
    const C = T.climes[f.regions[k].clime];
    if (!C || !C.hazard) continue;
    const rooms = f.rooms.filter((r) => r.cells && r.cells.length > 6 && regionAt(f, r.cx, r.cy) === k && !(f.star && Math.hypot(r.cx - f.star.x, r.cy - f.star.y) < T.star.clear + 6));
    if (!rooms.length) continue;
    const kind = C.hazard, H = Object.assign({}, T.hazards[kind], C.haz), rng = new Rng(hashInts(seed, k, 0x4a2, f.layer | 0));
    layHazard(f, kind, H, rng, rooms, banned, Math.max(1, rooms.length / perSite));
    if (!f.hazKinds.includes(kind)) f.hazKinds.push(kind);
  }
  if (f.hazKinds.length) f.hazKind = f.hazKinds[0];
  return f;
}

// What grows on a floor with regions: each clime's own set, over the
// tiles its clime holds (and a border's second clime, as much as it
// shows), each in its own beds. The first set's undergrowth is View.ug,
// the rest View.ugMeld (undergrowth.js, pshadow.js read them all).
function regionFloraSet(f, clime) { return CLIME_FLORA[clime] ? clime : f.layer ? 'rim' : 'surface'; }
function placeRegionFlora(f) {
  const N = f.w * f.h, masks = new Map(), look = new Map();
  for (let i = 0; i < N; i++) {
    const a = f.regions[f.climeIdx[i]].clime, b = f.regions[f.climeIdx2[i]].clime, t = f.climeMix[i] / 255;
    const sa = regionFloraSet(f, a);
    let m = masks.get(sa);
    if (!m) { masks.set(sa, (m = new Float32Array(N))); look.set(sa, climeBaseLook(f, a)); }
    m[i] += 1 - t;
    if (t > 0) {
      const sb = regionFloraSet(f, b);
      let mb = masks.get(sb);
      if (!mb) { masks.set(sb, (mb = new Float32Array(N))); look.set(sb, climeBaseLook(f, b)); }
      mb[i] += t;
    }
  }
  let all = [], first = null;
  const melds = [], dens = f.kindled && !f.hub ? T.terraform.flora : 1;
  for (const [set, mask] of masks) {
    const items = placeUndergrowth(f, set, { mask, salt: hashString(set), look: look.get(set), dens });
    const U = View.ug;
    for (const it of items) it.ug = U;
    if (!first) first = U; else melds.push(U);
    all = all.concat(items);
  }
  View.ug = first; View.ugMeld = melds;
  all.sort((a, c) => a.y - c.y);
  return all;
}
// Every set of undergrowth on floor f.
function ugAll(f) {
  const out = [];
  if (View.ug && View.ug.f === f) out.push(View.ug);
  for (const U of View.ugMeld || []) if (U && U.f === f) out.push(U);
  return out;
}

// Each step: the clime where the Kindler stands (d.clime, for the sound,
// the music and the creatures' natures), and a region's name the first
// time he walks into it.
function regionsStep(d) {
  const f = d.floor;
  mapSeeShafts(d);
  if (!f.regions) return;
  const k = regionHere(d);
  d.clime = f.regions[k].clime;
  if (d.regionAt === k) return;
  d.regionAt = k;
  const r = f.regions[k], s = Save.data, key = `${f.layer | 0}:${k}`;
  s.regionsSeen = s.regionsSeen || {};
  if (!s.regionsSeen[key]) { s.regionsSeen[key] = true; Save.saveField('regionsSeen'); }
  if (d.time > 1) UI.toast(r.name.toUpperCase(), 'legendary');
}
