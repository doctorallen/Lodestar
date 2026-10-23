'use strict';
// ---------------------------------------------------------------------------
// The Lattice: the world under the world. Beneath the surface the Deeps join
// into one web of tunnels, laid out once a save from its seed (T.lattice)
// on the same map as the land above:
//   - a shaft gallery under every territory that has a Deep: a cleft in the
//     Deep's last site leads down into it, and the gallery's own cleft leads
//     back up;
//   - junction galleries between them, reached only through the tunnels;
//   - tunnels joining them: the Gabriel graph of the galleries, so the web
//     is planar and one piece, and every gallery can be walked to from any
//     other.
// A gallery is built as the surface's territories are (generateGallery): a
// floor with an opening at its edge towards each gallery it joins, richer
// in the region's deeper ore than the land above, at one depth past it. No
// sky: your light always drains down here. In some galleries (every
// junction, a few shafts) stands a cold spire, planted by a Kindler before
// us and long dark. Stand by it and hold while the dark comes (T.lattice
// .relight) and it burns again: a spire of your own in the dark, to bank
// at and travel to and from, its light bringing yours back while you stand
// in it, and deeplight for the star the first time.
//
// So the Lattice is a second route to every ring, slow and dark and rich,
// under the star's gates: you can come up in ring 3 through a Deep long
// before a spire could hold there.
//
// Playing it is a sortie as any other (frontier.js): d.lat is the gallery,
// and d.deep stands (with site 0) so everything that treats a Deep as dark
// ground under the world treats a gallery so too. What persists, in
// Save.data.world.lattice[id]: lit (the cold spire burning), visits, mined.
// The world map shows it as a second layer (worldmap.js) once a gallery has
// been walked. Nothing here knows how the surface is laid out beyond
// worldLayout; the dark's growing level (darkLevelFloor) is frontier.js's.
// ---------------------------------------------------------------------------

const LATTICE_NAMES = ['The Long Gallery', 'Blackvault', 'Drip Hall', 'The Narrows', 'Rootcellar', 'Stillwater Reach', 'The Ossuary', 'Candle Run', 'Hush Gallery', 'The Undercroft', 'Lantern Gap', 'Greywater Sump', 'The Choke', 'Saltvault', 'Cinder Throat', 'The Old Works', 'Kindlers\' Rest', 'The Cistern', 'Low Chapel', 'Ninefold Stair', 'The Gullet', 'Quiet Cut', 'Pale Gallery', 'The Hanging Hall', 'Ashvault', 'Deepwater Gate', 'The Bellows', 'Starless Hall', 'Mercy Reach', 'The Cold Forge', 'Wormgate', 'Last Lantern'];

const _lattices = new Map();
function latticeLayout(seed) {
  if (_lattices.has(seed)) return _lattices.get(seed);
  const L = worldLayout(seed), K = T.lattice, M = L.M, C = M / 2, rng = new Rng(hashInts(seed, 0x1a77));
  const terrAt = (x, y) => { const i = Math.round(y) * M + Math.round(x), id = i >= 0 && i < M * M ? L.idMap[i] : -1; return id >= 0 ? L.terrs[id] : null; };
  const nodes = [];
  // a shaft gallery under every territory with a Deep, a little off its middle
  for (const t of L.terrs) if (t.deep) nodes.push({ id: nodes.length, x: t.cx + rng.f(-K.jitter, K.jitter), y: t.cy + rng.f(-K.jitter, K.jitter), under: t.id, nb: [] });
  // junction galleries in the gaps between, each well apart from the rest
  for (let tries = 0, n = 0; n < K.extra && tries < 600; tries++) {
    const a = rng.f(Math.PI * 2), r = K.inner + Math.sqrt(rng.f(1)) * (T.world.disc - 8 - K.inner), x = C + Math.cos(a) * r, y = C + Math.sin(a) * r;
    if (nodes.some((o) => Math.hypot(o.x - x, o.y - y) < K.apart)) continue;
    const t = terrAt(x, y);
    if (!t || t.home) continue;
    nodes.push({ id: nodes.length, x, y, under: -1, nb: [] });
    n++;
  }
  // the tunnels: two galleries are joined when no third stands within the
  // circle on the line between them (the Gabriel graph: planar, one piece)
  for (let a = 0; a < nodes.length; a++)
    for (let b = a + 1; b < nodes.length; b++) {
      const A = nodes[a], B = nodes[b], mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, r2 = ((A.x - B.x) ** 2 + (A.y - B.y) ** 2) / 4;
      if (nodes.some((o) => o !== A && o !== B && (o.x - mx) ** 2 + (o.y - my) ** 2 < r2)) continue;
      A.nb.push(b); B.nb.push(a);
    }
  // each gallery: the land over it (its region and the ring it's reached
  // in), its depth, clime, name and whether a cold spire stands in it
  const names = rng.shuffle(LATTICE_NAMES.slice());
  const caves = Object.keys(T.climes).filter((id) => T.climes[id].zones.includes('cave'));
  for (const n of nodes) {
    const t = (n.under >= 0 ? L.terrs[n.under] : terrAt(n.x, n.y)) || L.terrs.find((x) => x.ring === 1);
    n.terr = t.id; n.ring = t.ring; n.biome = t.biome; n.region = t.region; n.edge = !!t.edge;
    n.depth = t.depth + K.depthUp;
    n.cx = n.x; n.cy = n.y;
    const region = T.biomes[t.biome].id;
    n.clime = rng.weighted(caves.map((id) => { const c = T.climes[id]; return [c.weight * ((c.lean && c.lean[region]) || 1), id]; }));
    n.name = names.pop() || 'The Unnamed Gallery';
    n.spire = n.under < 0 || rng.chance(K.spire.shaft);
  }
  const G = { seed, nodes, byTerr: Object.fromEntries(nodes.filter((n) => n.under >= 0).map((n) => [n.under, n.id])) };
  _lattices.set(seed, G);
  return G;
}

// The floor seed of a gallery.
function latticeSeed(worldSeed, id) { return hashInts(worldSeed, id, 0x1a7e); }

// A gallery's map: a floor of the Lattice's own zone, an opening towards
// each gallery it joins, veins of the region's deeper ore, the cleft up
// (where the floor begins, under a shaft) and the cold spire's place.
function generateGallery(worldSeed, id) {
  const G = latticeLayout(worldSeed), n = G.nodes[id];
  if (!n) return null;
  const seed = latticeSeed(worldSeed, id), K = T.lattice;
  const f = generateFloor(seed, n.depth, n.biome, 0, 'lattice', 0, n.clime);
  const { w, h, tiles, ore } = f, rng = new Rng(hashInts(seed, 0xe418));
  const steps = floorDistances(tiles, w, h, f.entry.x, f.entry.y), c = (w - 1) / 2;
  f.exits = [];
  for (const o of worldExitSpots({ terrs: G.nodes }, n, w, h)) { carveExit(f, steps, o.x, o.y, o.nx, o.ny, rng); f.exits.push(o); }
  // richer than the land above: more veins, more of them the deeper ore
  const B = T.biomes[n.biome];
  for (const r of f.rooms.slice(1)) {
    const walls = [];
    for (const i of r.cells) for (const [dx, dy] of DIRS4) if (tiles[i + dy * w + dx] === TILE_ROCK) walls.push(i + dy * w + dx);
    for (let k = rng.i(K.veins[0], K.veins[1]); k > 0 && walls.length; k--) {
      let i = rng.pick(walls);
      const kind = ORE_INDEX[B.ores[rng.chance(K.oreDeep) ? 1 : 0]] + 1;
      for (let m = rng.i(T.floor.veinLen[0], T.floor.veinLen[1]); m > 0; m--) {
        tiles[i] = TILE_ORE; ore[i] = kind;
        const next = DIRS4.map(([dx, dy]) => i + dy * w + dx).filter((j) => tiles[j] === TILE_ROCK);
        if (!next.length) break;
        i = rng.pick(next);
      }
    }
  }
  // the cleft up, where the floor begins
  f.ways = [];
  if (n.under >= 0) { f.ways.push({ x: f.entry.x, y: f.entry.y }); tiles[f.entry.y * w + f.entry.x] = TILE_PORTAL; }
  // the cold spire's place: open ground nearest the middle, clear of the
  // ways in
  const near = [f.entry].concat(f.exits, f.ways);
  const byMiddle = f.rooms.slice(1).concat(f.rooms.slice(0, 1)).filter((r) => r.cells && r.cells.length).sort((a, b) => Math.hypot(a.cx - c, a.cy - c) - Math.hypot(b.cx - c, b.cy - c));
  f.heart = null;
  for (const r of byMiddle) {
    let best = null, bd = Infinity;
    for (const i of r.cells) {
      const x = i % w, y = Math.floor(i / w);
      if (steps[i] < 0 || !territorySpotOk(f, x, y) || near.some((p) => Math.abs(p.x - x) + Math.abs(p.y - y) < 4)) continue;
      const m2 = (x - r.cx) * (x - r.cx) + (y - r.cy) * (y - r.cy);
      if (m2 < bd) { bd = m2; best = { x, y }; }
    }
    if (best) { f.heart = best; break; }
  }
  f.stones = [];
  f.gallery = id;
  return f;
}

// One number for a gallery, for the golden tests.
function galleryHash(f) {
  let hsh = floorHash(f);
  for (const e of f.exits) hsh = hashInts(hsh, e.x, e.y, e.to);
  if (f.heart) hsh = hashInts(hsh, f.heart.x, f.heart.y);
  return hsh;
}

// --- the Lattice in the save ----------------------------------------------
function latticeMap() { return latticeLayout(worldState().seed); }
function latticeNode(id) { return latticeMap().nodes[id]; }
function latPeek(id) { const W = worldState(); return (W.lattice && W.lattice[id]) || null; }
function latState(id) { const W = worldState(), L = W.lattice || (W.lattice = {}); return L[id] || (L[id] = { visits: 0 }); }
// A cold spire burning again: a spire of your own.
function latLit(id) { const s = latPeek(id); return !!(s && s.lit); }
function latticeSpireIds() { return latticeMap().nodes.filter((n) => latLit(n.id)).map((n) => 'L' + n.id); }
// The gallery under a territory, if its Deep has a cleft (-1 if not).
function galleryUnder(terrId) { const g = latticeMap().byTerr[terrId]; return g === undefined ? -1 : g; }
// The Lattice is on the map once any gallery has been walked.
function latticeKnown() { const L = worldState().lattice; return !!L && Object.values(L).some((s) => s.visits); }
// A gallery is known once walked, or next to one walked, or under a Deep
// whose end has been reached (its cleft seen).
function latticeNodeKnown(n) {
  if ((latPeek(n.id) || {}).visits) return true;
  if (n.under >= 0 && deepReached(n.under)) return true;
  return n.nb.some((k) => (latPeek(k) || {}).visits);
}

// A spire, wherever it stands: a territory's (its id) or a relit cold
// spire's ('L' and the gallery's id).
function isLatSpire(at) { return typeof at === 'string' && at[0] === 'L'; }
function spireStands(at) { return isLatSpire(at) ? latLit(Number(at.slice(1))) : hasSpire(at); }
function spireNameOf(at) { return isLatSpire(at) ? latticeNode(Number(at.slice(1))).name : at ? terrOf(at).name : 'The Outpost'; }
function latticeLevel(n) { return n.biome * T.levelPerBiome + n.depth; }

// --- playing it -------------------------------------------------------------
// how: { from } walked in from the gallery `from`; { cleft } came down the
// cleft from the Deep above; { spire } arrived at its relit spire.
function enterGallery(id, how = {}) {
  const d = Game.dive, W = worldState(), n = latticeNode(id), ls = latState(id), p = d.p, K = T.lattice, X = T.world;
  d.terr = n.terr; d.lat = id; d.deep = { site: 0, of: 0, lat: id }; d.how = { lat: id, from: how.from, spire: how.spire, cleft: how.cleft };
  d.zone = 'lattice'; d.clime = n.clime; d.biome = n.biome; d.depth = n.depth; d.kindled = false; d.sun = undefined;
  d.seed = latticeSeed(W.seed, id);
  const f = (d.floor = generateGallery(W.seed, id));
  resetFloorState(d);
  d.relight = null;
  if (ls.lit && f.heart) { f.tiles[f.heart.y * f.w + f.heart.x] = TILE_PAD; f.pad = { x: f.heart.x, y: f.heart.y }; }
  // the cleft leads up into the Deep's last site
  const over = n.under >= 0 ? terrOf(n.under) : null;
  d.ways = f.ways.length ? ['deep'] : [];
  d.wayClimes = d.ways.map(() => (over ? deepClime(over, over.deep, 'deep') : null));
  wayHoleSolids(d);
  placeRift(d);
  // veins mined stay mined, growing back after a few sorties
  ls.mined = (ls.mined || []).filter(([, s]) => W.sorties - s < X.regrow);
  for (const [i] of ls.mined) if (f.tiles[i] === TILE_ORE) { f.tiles[i] = TILE_FLOOR; f.ore[i] = 0; }
  // where the diver comes in
  let at = { x: f.entry.x, y: f.entry.y + 1.3 };
  const ex = how.from !== undefined && f.exits.find((e) => e.to === how.from);
  if (ex) { at = { x: ex.ax, y: ex.ay }; p.fx = ex.nx; p.fy = ex.ny; }
  else if (how.spire && f.pad) { at = { x: f.pad.x, y: f.pad.y + 1.2 }; Save.data.lastSpire = 'L' + id; }
  p.x = (at.x + 0.5) * TILE; p.y = (at.y + 0.5) * TILE;
  if (bodyHits(f, p.x, p.y, T.player.radius)) { p.x = (Math.floor(at.x) + 0.5) * TILE; p.y = (Math.floor(at.y) + 0.5) * TILE; }
  // the dark's creatures come back each visit
  const keep = d.seed;
  d.seed = hashInts(keep, ls.visits || 0, W.sorties);
  spawnEnemies(d);
  d.seed = keep;
  d.enemies = d.enemies.filter((e) => dist(e.x, e.y, p.x, p.y) > X.clear * TILE);
  placeFieldForge(d);
  placeLife(d);
  placeCacheHere(d);
  ls.visits = (ls.visits || 0) + 1;
  d.far = Math.max(d.far || 0, n.depth);
  d.maxRing = Math.max(d.maxRing || 0, n.ring);
  // no sky: the light always drains, and faster
  d.pullTime = X.light * K.light;
  if (d.pull <= 0) { d.pull = 0; theDarkComes(d); }
  d.arrive = { t: 0, zone: 'lattice' };
  const tl = d.tally || (d.tally = {});
  tl.lattice = (tl.lattice || 0) + 1;
  UI.toast(`${n.name} · the Lattice · ${climeName(n.clime)}`);
  Story.say('firstLattice');
  if (n.spire && f.heart && !ls.lit) Story.say('firstColdSpire');
  if (f.pad) UI.tip('coldSpireLit', 'Your spire: BANK here, or TRAVEL, and stand in its light');
  noticeRift(d);
  saveRun(d);
}

// Walking off the edge into the gallery it faces.
function crossGallery(d, to) {
  d.p.mine = null; d.channel = null;
  d.warp = { t: 0, at: null, zone: 'lattice', go: () => enterGallery(to, { from: d.lat }) };
  snd('portal');
  buzz(20);
}

// Up the cleft: the last site of the Deep above, arriving at its cleft.
function leaveLattice() {
  const d = Game.dive, n = latticeNode(d.lat), over = terrOf(n.under);
  d.lat = null; d.relight = null;
  d.pullTime = T.world.light;
  d.terr = over.id;
  enterDeepSite(over.deep, { cleft: true });
}

// Every step in a gallery: crossing an edge, a relit spire's light, the
// hold that relights a cold one.
function updateLattice(d, dt) {
  const p = d.p, f = d.floor, K = T.lattice, X = T.world;
  if (d.warp || d.dying) return;
  if (!d.channel) for (const e of f.exits) if (dist(p.x, p.y, (e.x + 0.5) * TILE, (e.y + 0.5) * TILE) < X.exits.reach) { crossGallery(d, e.to); return; }
  if (f.pad) {
    const m = dist(p.x, p.y, (f.pad.x + 0.5) * TILE, (f.pad.y + 0.5) * TILE);
    if (m < TILE) Save.data.lastSpire = 'L' + d.lat;
    if (d.pull < 1 && m < T.tools.beacon.refill) d.pull = Math.min(1, d.pull + K.refill * dt);
  }
  const r = d.relight;
  if (r && f.heart) {
    const R = K.relight;
    if (dist(p.x, p.y, (f.heart.x + 0.5) * TILE, (f.heart.y + 0.5) * TILE) < R.holdR) r.t += dt;
    if ((r.waveT -= dt) <= 0) { r.waveT = R.waveEvery; stirTheDark(d, R.wave); }
    if (r.t >= R.hold) relitSpire(d);
  }
}

// A cold spire within reach, not yet burning: the button relights it.
function coldSpireHere(d) {
  if (!d.lat || d.relight || !d.floor.heart || d.floor.pad) return false;
  const n = latticeNode(d.lat), h = d.floor.heart;
  return n.spire && dist(d.p.x, d.p.y, (h.x + 0.5) * TILE, (h.y + 0.5) * TILE) < T.world.waystone.touch;
}
function startRelight(d) {
  if (!coldSpireHere(d)) return;
  const R = T.lattice.relight, h = d.floor.heart;
  d.relight = { t: 0, waveT: R.waveEvery };
  spawnSparks((h.x + 0.5) * TILE, (h.y + 0.5) * TILE - 24, [ART.pal.star[2], '#b4a4ff'], 14);
  UI.toast('The spire takes the light. Stay in it', 'legendary');
  snd('waystone');
  buzz(30);
  // the light draws attention
  for (const e of d.enemies) if (!e.dead && dist(e.x, e.y, d.p.x, d.p.y) < T.leave.noise) wake(d, e, true);
}
// The cold spire burns again: a spire of your own in the dark.
function relitSpire(d) {
  const id = d.lat, ls = latState(id), f = d.floor, h = f.heart, n = latticeNode(id);
  ls.lit = true; d.relight = null;
  f.tiles[h.y * f.w + h.x] = TILE_PAD; f.pad = { x: h.x, y: h.y };
  repaintAround(f, h.x, h.y);
  d.pull = 1; d.padDark = false;
  for (const e of d.enemies) if (!e.dead && !e.boss) { e.dead = true; spawnSparks(e.x, e.y - 5, [ART.pal.star[3], '#ffffff'], 8); }
  spawnSparks((h.x + 0.5) * TILE, (h.y + 0.5) * TILE - 30, [ART.pal.star[3], ART.pal.star[2], '#ffffff'], 40);
  Save.data.lastSpire = 'L' + id;
  Save.saveField('world'); Save.saveField('lastSpire');
  UI.toast(`${n.name.toUpperCase()}: THE SPIRE BURNS AGAIN`, 'legendary');
  snd('kindle');
  buzz(60);
  Story.say('firstRelit');
  deedColdSpire(d, id, n);
}
// Deeplight for a cold spire relit, the first time.
function deedColdSpire(d, id, n) {
  const f = foundState(), S = f.spires || (f.spires = {});
  if (S[id]) return;
  S[id] = true;
  Save.saveField('found');
  const h = d.floor.heart;
  grantLight(d, 'deeplight', T.deeds.coldSpire, `${n.name}'s spire relit`, { x: (h.x + 0.5) * TILE, y: (h.y + 0.5) * TILE - 30 });
}

// The Lattice's lines over the view (#hud-goal): the hold, or the cold
// spire to relight.
function latticeGoalLines(d) {
  if (!d.lat || !d.floor.heart) return null;
  const n = latticeNode(d.lat);
  if (d.relight) return [`◈ Stay in its light: ${Math.max(0, Math.ceil(T.lattice.relight.hold - d.relight.t))} s`];
  if (n.spire && !d.floor.pad) return ['◇ Relight the cold spire', 'a spire of your own, down here'];
  return null;
}

// The compass in the Lattice: the relit spire here, else the opening
// towards the nearest gallery with one (or with a cleft up), else the cleft.
function compassTargetLattice(d, steps) {
  const f = d.floor;
  if (f.pad && !d.padDark) return { x: f.pad.x, y: f.pad.y, col: ART.pal.star[3], home: true };
  const G = latticeMap(), hops = new Map();
  const q = G.nodes.filter((n) => latLit(n.id) || n.under >= 0).map((n) => n.id);
  for (const id of q) hops.set(id, 0);
  for (let i = 0; i < q.length; i++) for (const k of G.nodes[q[i]].nb) if (!hops.has(k)) { hops.set(k, hops.get(q[i]) + 1); q.push(k); }
  if (f.ways[0]) return { x: f.ways[0].x, y: f.ways[0].y, col: ZONE_SIGNS.deep };
  const far = (e) => { const s = steps[e.y * f.w + e.x]; return (s < 0 ? 999 : s) + 1000 * (hops.has(e.to) ? hops.get(e.to) : 99); };
  const e = f.exits.slice().sort((a, b) => far(a) - far(b))[0];
  return e ? { x: e.x, y: e.y, col: latLit(e.to) ? ART.pal.star[3] : ZONE_SIGNS.lattice } : null;
}

// --- drawn ------------------------------------------------------------------
// The cold spire (or the relit one), sorted with the actors.
function latticeProps(d) {
  if (!d.lat || !d.floor.heart) return [];
  const n = latticeNode(d.lat), f = d.floor;
  if (!n.spire) return [];
  return [{ wprop: f.pad ? 'spire' : 'cold', at: f.heart, y: (f.heart.y + 0.5) * TILE + 1 }];
}
// A cold spire: the spire's own shape, its runes dark and its crystal
// dead, cracked across; while it's taking the light a rune wakes at a time.
function drawColdSpire(d, a, ox, oy, lights) {
  const fx = Math.round((a.at.x + 0.5) * ATILE) + ox, fy = Math.round(((a.at.y + 0.5) * TILE + 1) * AP) + oy, spr = spireSprite(true);
  drawShadow(fx, fy, 8);
  drawArtSprite(spr, fx - spr.ax, fy - spr.ay);
  const r = d.relight, G = ART.pal.star;
  if (r) {
    const k = r.t / T.lattice.relight.hold, lit = Math.floor(k * 4);
    for (let i = 0; i < 4; i++) if (i < lit || (i === lit && Math.floor(Game.realT * 6) % 2)) for (let j = 0; j < 3; j++) dot(fx, fy - spr.ay + ap(17 + i * 10 + j), j === 0 ? G[3] : G[2], true, 0.9);
    lights.push({ x: fx, y: fy - ap(30), r: TILE * (1.5 + k * 1.5), i: 0.5 + k * 0.6, c: rgb01(G[2]) });
  } else {
    // a faint cold glow at one rune, breathing, so it can be found in the dark
    const k = 0.6 + 0.4 * Math.sin(Game.realT * 1.1);
    dot(fx, fy - spr.ay + ap(37), '#8a7cd8', true, 0.5 * k);
    lights.push({ x: fx, y: fy - ap(30), r: TILE * 1.4, i: 0.35 * k, c: rgb01('#8a7cd8') });
  }
}
// On the ground: the hold's rings while the spire takes the light.
function drawLatticeUnder(d, ox, oy, lights) {
  if (!d.lat || !d.relight || !d.floor.heart) return;
  const h = d.floor.heart, x = Math.round((h.x + 0.5) * ATILE) + ox, y = Math.round((h.y + 0.5) * ATILE) + oy, R = T.lattice.relight.holdR * AP, G = ART.pal.star;
  const ring = (rx, n, col, alpha, spin) => {
    for (let i = 0; i < n; i++) {
      if ((i + Math.floor(Game.realT * 6)) % 3 === 0) continue;
      const a = (i / n) * Math.PI * 2 + spin;
      dot(Math.round(x + Math.cos(a) * rx), Math.round(y + Math.sin(a) * rx * 0.6), col, true, alpha);
    }
  };
  ring(R, Math.round(R * 1.6), G[2], 0.8, Game.realT * 0.3);
  ring(R * (d.relight.t / T.lattice.relight.hold), Math.round(R), G[3], 0.6, -Game.realT * 0.5);
}

// --- the map's second layer (worldmap.js draws the screen) -------------------
// The galleries shown: known ones, each with where it's drawn.
function latticeMapNodes() { return latticeMap().nodes.filter(latticeNodeKnown); }
// The Lattice over the darkened map: tunnels between known galleries, each
// gallery's mark (a shaft's cleft, a cold spire dark or burning), the diver
// and the chosen one.
function drawLatticeMap(x, M, px, fr, on) {
  const G = latticeMap(), known = new Set(latticeMapNodes().map((n) => n.id)), d = Game.dive;
  x.fillStyle = 'rgba(6, 4, 14, 0.74)';
  x.fillRect(0, 0, M, M);
  const at = (n) => [Math.round(n.x), Math.round(n.y)];
  // the tunnels, dotted, a pixel marching along each
  for (const n of G.nodes) {
    if (!known.has(n.id)) continue;
    for (const k of n.nb) {
      if (k < n.id || !known.has(k)) continue;
      const o = G.nodes[k], steps = Math.max(1, Math.round(Math.hypot(o.x - n.x, o.y - n.y)));
      for (let s = 0; s <= steps; s++) {
        if ((s + fr) % 7 === 0) px(n.x + ((o.x - n.x) * s) / steps, n.y + ((o.y - n.y) * s) / steps, '#c4b8ff');
        else if (s % 2 === 0) px(n.x + ((o.x - n.x) * s) / steps, n.y + ((o.y - n.y) * s) / steps, '#5a4aa6');
      }
    }
  }
  for (const n of G.nodes) {
    if (!known.has(n.id)) continue;
    const [cx, cy] = at(n), seen = !!(latPeek(n.id) || {}).visits;
    if (n.spire && latLit(n.id)) {
      // a relit spire: the surface's mark, in the Lattice's light
      for (let j = 0; j < 5; j++) { px(cx - 1, cy - j, '#2a2638'); px(cx, cy - j, '#3d3852'); }
      px(cx, cy - 2, '#f3c35b'); px(cx - 1, cy - 5, '#f3c35b'); px(cx, cy - 5, '#fff3c4'); px(cx, cy - 6, '#f3c35b');
    } else if (n.spire && seen) {
      // a cold spire: dark stone, no tip
      for (let j = 0; j < 5; j++) { px(cx - 1, cy - j, '#2a2638'); px(cx, cy - j, '#3d3852'); }
      px(cx, cy - 5, on ? '#8a7cd8' : '#5a4aa6');
    } else {
      // a gallery: a small ring; a shaft's has its cleft, a bar up from it
      for (const [i, j] of [[-1, -1], [0, -2], [1, -1], [-1, 1], [0, 2], [1, 1], [-2, 0], [2, 0]]) px(cx + i, cy + j, seen ? '#b4a4ff' : '#5a4aa6');
      if (n.under >= 0) { px(cx, cy - 3, '#7ce0a0'); px(cx, cy - 4, '#7ce0a0'); }
    }
  }
  // the pack, if it lies down here
  const c = Save.data.cache;
  if (c && c.lat && known.has(c.lat)) { const [cx, cy] = at(G.nodes[c.lat]), col = on ? '#ffc860' : '#c87a20'; for (const [i, j] of [[-4, 2], [-3, 2], [-2, 2], [-4, 3], [-3, 3], [-2, 3], [-3, 1]]) px(cx + i, cy + j, j === 1 ? '#fff2c8' : col); }
  if (d && d.sortie && d.lat !== null && d.lat !== undefined && on) { const [cx, cy] = at(G.nodes[d.lat]); for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1]]) px(cx + 3 + i, cy + 1 + j, '#ffffff'); }
  const sel = G.nodes[UI.mapSelLat];
  if (sel && known.has(sel.id)) for (let a = 0; a < 18; a++) if ((a + fr) % 2) { const an = (a / 18) * Math.PI * 2 + fr * 0.06; px(sel.x + Math.cos(an) * 9, sel.y + Math.sin(an) * 7, '#ffffff'); }
}
// The nearest known gallery to a map px, if one is near enough.
function latticeNodeAt(mx, my) {
  let best = -1, bd = 64;
  for (const n of latticeMapNodes()) { const m = (n.x - mx) ** 2 + (n.y - my) ** 2; if (m < bd) { bd = m; best = n.id; } }
  return best;
}
// The chosen gallery's card.
function drawLatticeCard() {
  const G = latticeMap(), n = G.nodes[UI.mapSelLat], d = Game.dive, mode = UI.mapMode;
  if (!n) { $('map-card').innerHTML = `<div class="tcard"><div class="nm">THE LATTICE</div><div class="goal">Tunnels under the world, joined gallery to gallery. Tap one.</div></div>`; return; }
  const s = latPeek(n.id) || {}, seen = !!s.visits, over = terrOf(n.terr), under = n.under >= 0 ? terrOf(n.under) : null;
  const row = (a, b) => `<div class="trow"><span>${a}</span><span>${b}</span></div>`;
  const pill = n.spire ? `<span class="pill ${s.lit ? 'kindled' : 'dark'}">${s.lit ? 'YOUR SPIRE' : seen ? 'COLD SPIRE' : 'UNKNOWN'}</span>` : `<span class="pill dark">${seen ? 'GALLERY' : 'UNKNOWN'}</span>`;
  let h = `<div class="nm">${esc(n.name.toUpperCase())}</div><div class="sub">The Lattice · under ${esc(over.name)}${seen ? ` · ${esc(climeName(n.clime))}` : ''}${pill}</div>`;
  const lvl = Math.max(latticeLevel(n), darkLevelFloor());
  h += row('ENEMIES', `level ${lvl}${seen ? '' : '+'}`);
  if (seen) {
    const ores = T.biomes[n.biome].ores.map((id) => T.ores[ORE_INDEX[id]].name).join(', ');
    h += row('ORE', ores + ' (rich)');
    if (under) h += row('WAY UP', `a cleft into the Deep under ${esc(under.name)}`);
    const nbs = n.nb.filter((k) => latticeNodeKnown(G.nodes[k])).map((k) => G.nodes[k].name);
    if (nbs.length) h += row('TUNNELS TO', esc(nbs.join(', ')));
    if (n.spire && !s.lit) h += `<div class="goal"><b>A cold spire stands here.</b> Hold by it as the dark comes and it burns again: bank, travel, and your light back in its light.</div>` + row('RELIGHTING IT', `+${T.deeds.coldSpire} deeplight, the first time`);
    else if (n.spire) h += `<div class="goal"><b>Your spire.</b> It banks and travels, and brings your light back.</div>`;
  } else h += `<div class="goal">Unknown until walked.${under ? ` A cleft in the Deep under ${esc(under.name)} leads down to it.` : ''}</div>`;
  const pack = Save.data.cache;
  if (pack && pack.lat === n.id) h += `<div class="goal"><b class="r-legendary">YOUR PACK</b> is here.</div>`;
  const btns = [], here = d && d.sortie && d.lat === n.id;
  if (mode === 'travel') {
    if (here) btns.push('<p class="note">You are here.</p>');
    else if (s.lit) btns.push(`<button class="btn primary" data-act="travelTo" data-arg="L${n.id}">TRAVEL TO ITS SPIRE</button>`);
  } else if (s.lit) btns.push(`<button class="btn primary" data-act="setOutLat" data-arg="${n.id}">SET OUT TO ITS SPIRE</button>`);
  if (!btns.length) btns.push(`<p class="note">${mode === 'travel' ? 'No spire of yours here.' : 'Reach it through the Deeps.'}</p>`);
  $('map-card').innerHTML = `<div class="tcard">${h}<div class="menu">${btns.join('')}</div></div>`;
}
