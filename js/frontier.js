'use strict';
// ---------------------------------------------------------------------------
// The frontier: playing the world (world.js lays it out).
//
// A sortie starts at the outpost (walking out into a ring-1 territory) or
// at a spire, and goes on across neighbouring territories until the diver
// comes home (walking in, TRAVEL from a spire, or an emergency recall, which
// loses nothing but takes a while standing still), or falls.
// Walking into an opening at a territory's edge crosses into the neighbour
// it faces, arriving at the matching opening.
//
// Your light (d.pull) drains in dark land and refills in kindled land. When
// it's gone the Hollow comes, in every dark territory entered until it's
// back. A spire (TILE_PAD at a kindled territory's heart) banks the cargo
// (BANK) and opens the world map (TRAVEL). There's no limit to what's
// carried, and a fall leaves all of it where it fell, the Kindler's pack,
// to go back for once (deeds.js), and wakes the diver at the last spire
// touched.
//
// The star grows from deeds (deeds.js): kindling a territory gives
// heartlight, a Deep's end, an ancient forge and an echo deeplight. A spire
// holds only where the star's light reaches (T.star.ringMag).
//
// Each territory has a heart goal (light the waystones, or seal the tear at
// its heart). Done, the spire is planted there and the territory is kindled
// for good: its spire, full light, daylight, and quiet.
//
// Some territories have a portal down into a Deep: a short chain of sites
// built as the old expeditions were, left by its lodeline or its last
// portal, back to the territory's surface.
//
// What persists, in Save.data.world.territories[id]: state ('dark',
// 'contested', 'kindled'), the waystones lit, whether the goal is done, the
// tear sealed, veins mined ([tile, sortie]), and visits.
// ---------------------------------------------------------------------------

// --- the world in the save ---------------------------------------------------
function worldState() {
  const s = Save.data;
  // the world's seed may come from anywhere; everything built from it is seeded
  if (!s.world || !s.world.territories) s.world = freshWorld((Math.random() * 4294967296) >>> 0);
  return s.world;
}
// A world not yet walked: only the starter is kindled.
function freshWorld(seed) {
  const territories = {};
  for (const t of worldLayout(seed).terrs) if (t.starter) territories[t.id] = { state: 'kindled', done: true, starter: true, visits: 0 };
  return { seed, territories, sorties: 0 };
}
function worldMap() { return worldLayout(worldState().seed); }
function terrOf(id) { return worldMap().terrs[id]; }
function terrPeek(id) { return worldState().territories[id] || null; }
function terrState(id) { const W = worldState(); return W.territories[id] || (W.territories[id] = { state: 'dark', visits: 0 }); }
function isKindled(id) { const s = terrPeek(id); return id === 0 || !!(s && s.state === 'kindled'); }
// The outpost's spire, and every kindled territory's but the first, which
// the outpost's own light reaches.
function hasSpire(id) { const s = terrPeek(id); return id === 0 || !!(s && s.state === 'kindled' && !s.starter); }
function spireIds() { return worldMap().terrs.filter((t) => hasSpire(t.id)).map((t) => t.id); }
function kindledCount() { return worldMap().terrs.filter((t) => !t.home && isKindled(t.id) && !terrPeek(t.id).starter).length; }
function terrLevel(t) { return t.biome * T.levelPerBiome + t.depth; }
function terrStateWord(id) { const s = terrPeek(id); return id === 0 ? 'home' : !s ? 'dark' : s.state; }
// A region has been reached once any of its territories has been walked.
function regionReached(i) { return i === 0 || worldMap().terrs.some((t) => t.region === i && (terrPeek(t.id) || {}).visits); }

// --- a sortie --------------------------------------------------------------
// at: { terr, from } walks in from a neighbour (0, the outpost); { terr,
// spire: true } arrives at its spire.
function startSortie(at) {
  const W = worldState();
  W.sorties = (W.sorties || 0) + 1;
  Save.data.dives++;
  const seed = (Math.random() * 4294967296) >>> 0;
  Game.dive = newWorld({
    sortie: true, sortieSeed: seed, rng: new Rng(hashInts(seed, 0x5eed)), tool: Save.data.tool || 'compass', storm: new Rng(hashInts(seed, 0x5707)).chance(T.storm.chance),
    far: 0, maxRing: 0, pullTime: T.world.light, banked: { stuff: {}, items: [], learned: [], fed: 0 }, tally: {},
  });
  Game.scene = 'dive';
  enterTerritory(at.terr, at);
  Story.say('firstDive');
}

// What's cleared whenever the diver arrives somewhere new.
function resetFloorState(d) {
  Object.assign(d, { target: null, shots: [], bolts: [], drops: [], fx: [], nums: [], globs: [], puddles: [], auras: [], later: [], snares: [], drag: null, flowAt: -1, keeper: null, rift: null, hold: null,
    seen: null, beacon: null, compass: null, oreNear: null, toolT: 0, strike: null, stormT: undefined, channel: null, padDark: false, warp: null, fieldForge: null });
  d.p.mine = null;
}

function enterTerritory(id, how = {}) {
  const d = Game.dive, W = worldState(), t = terrOf(id), ts = terrState(id), p = d.p, X = T.world;
  d.terr = id; d.deep = null; d.how = { from: how.from, spire: how.spire, up: how.up };
  d.zone = 'surface'; d.clime = t.clime; d.biome = t.biome; d.depth = t.depth;
  d.seed = territorySeed(W.seed, id);
  const f = (d.floor = generateTerritory(W.seed, id));
  d.kindled = ts.state === 'kindled';
  d.sun = d.kindled ? X.sun.kindled : t.edge ? X.sun.edge : X.sun.dark;
  resetFloorState(d);
  if (hasSpire(id)) { f.tiles[f.heart.y * f.w + f.heart.x] = TILE_PAD; f.pad = { x: f.heart.x, y: f.heart.y }; }
  // the Deep's portal leads down to its first site
  d.ways = f.ways.length ? [deepZone(t, 1)] : [];
  d.wayClimes = d.ways.map((z) => deepClime(t, 1, z));
  wayHoleSolids(d);
  placeTerritoryRift(d, t, ts);
  // veins mined stay mined; in dark land they grow back after a few sorties
  ts.mined = (ts.mined || []).filter(([, n]) => d.kindled || W.sorties - n < X.regrow);
  for (const [i] of ts.mined) if (f.tiles[i] === TILE_ORE) { f.tiles[i] = TILE_FLOOR; f.ore[i] = 0; }
  // where the diver comes in
  let at = { x: f.entry.x, y: f.entry.y + 0.5 };
  const ex = how.from !== undefined && f.exits.find((e) => e.to === how.from);
  if (ex) { at = { x: ex.ax, y: ex.ay }; p.fx = ex.nx; p.fy = ex.ny; }
  else if (how.spire && f.pad) { at = { x: f.pad.x, y: f.pad.y + 1.2 }; Save.data.lastSpire = id; }
  else if (how.up && f.ways[0]) at = { x: f.ways[0].x, y: f.ways[0].y + 1.3 };
  p.x = (at.x + 0.5) * TILE; p.y = (at.y + 0.5) * TILE;
  if (bodyHits(f, p.x, p.y, T.player.radius)) { p.x = (Math.floor(at.x) + 0.5) * TILE; p.y = (Math.floor(at.y) + 0.5) * TILE; }
  // the dark's creatures come back each visit; kindled land is quiet
  const keep = d.seed;
  d.seed = hashInts(keep, ts.visits || 0, W.sorties);
  spawnEnemies(d);
  d.seed = keep;
  const rng = new Rng(hashInts(keep, ts.visits || 0, W.sorties, 0x57a6));
  d.enemies = d.enemies.filter((e) => dist(e.x, e.y, p.x, p.y) > X.clear * TILE);
  if (d.kindled) { const s = d.enemies.find((e) => !e.elite && !e.boss); d.enemies = s && rng.chance(X.straggler) ? [s] : []; }
  placeFieldForge(d);
  placeLife(d);
  placeCacheHere(d);
  ts.visits = (ts.visits || 0) + 1;
  d.maxRing = Math.max(d.maxRing || 0, t.ring);
  if (d.kindled) { d.pull = 1; d.pullTime = X.light; }
  else {
    d.far = Math.max(d.far || 0, t.depth);
    if (d.pull <= 0) { d.pull = 0; theDarkComes(d); }
  }
  d.arrive = { t: 0, zone: d.kindled ? 'surface' : 'dusk' };
  if (stormHere(d)) { UI.toast('A lodestorm is passing over', 'legendary'); Story.say('storm'); }
  UI.toast(`${t.name} · ring ${t.ring} · ${terrStateWord(id)}`);
  // the story's first times (story.js; a key it doesn't know says nothing)
  Story.say([null, null, 'ring2', 'ring3', 'theEdge'][t.ring]);
  if (!d.kindled) UI.tip('darkLand', 'Dark land: your light runs down here');
  if (!d.kindled && !starHoldsSpire(id)) UI.toast(`The star's light can't hold a spire here yet: magnitude ${spireMagFor(id)}`);
  else if (f.pad) { UI.tip('spire', 'A spire: BANK here, or TRAVEL'); Story.say('firstSpire'); }
  noticeRift(d);
  saveRun(d);
}

// A tear: the heart's own while sealing it is the goal, else one by chance
// in dark land, as on any site. A sealed one stays sealed.
function placeTerritoryRift(d, t, ts) {
  const f = d.floor;
  f.graft = null; f.graftMask = null; f.riftShift = null;
  if (d.kindled || ts.sealed) return;
  if (t.goal !== 'rift') { placeRift(d); return; }
  const rng = new Rng(hashInts(d.seed, 0x41f7));
  const rift = { kind: rng.chance(0.5) ? 'graft' : 'bloom', x: f.heart.x, y: f.heart.y, open: true, phase: rng.f(10), heart: true };
  f.riftShift = [{ x: rift.x, y: rift.y }];
  if (rift.kind === 'graft') graftRift(d, rift, rng); else bloomRift(d, rift, rng);
  d.rift = rift;
}

// A vein broken: remembered with the sortie it was broken in (in a Deep,
// with its site).
function noteMined(d, i) {
  if (!d.sortie) return;
  if (d.deep) terrState(d.terr).deepMined.push([d.deep.site, i, worldState().sorties]);
  else terrState(d.terr).mined.push([i, worldState().sorties]);
}

// Every step of a sortie: crossing an edge, holding a waystone, a landed
// beacon's light, touching a spire.
function updateFrontier(d, dt) {
  const p = d.p, f = d.floor, X = T.world;
  if (d.deep || d.warp || d.dying) return;
  if (!d.channel) for (const e of f.exits) if (dist(p.x, p.y, (e.x + 0.5) * TILE, (e.y + 0.5) * TILE) < X.exits.reach) { crossTo(d, e.to); return; }
  if (f.pad && hasSpire(d.terr) && Math.floor(p.x / TILE) === f.pad.x && Math.floor(p.y / TILE) === f.pad.y) { Save.data.lastSpire = d.terr; Story.say('firstSpire'); }
  const h = d.hold;
  if (h) {
    const s = f.stones[h.k], W = X.waystone;
    if (dist(p.x, p.y, (s.x + 0.5) * TILE, (s.y + 0.5) * TILE) < W.holdR) h.t += dt;
    if ((h.waveT -= dt) <= 0) { h.waveT = W.waveEvery; stirTheDark(d, W.wave); }
    if (h.t >= W.hold) {
      const ts = terrState(d.terr);
      d.hold = null;
      if (!ts.lit.includes(h.k)) ts.lit.push(h.k);
      ts.done = true;
      UI.toast('The waystones burn', 'legendary');
      snd('waystonesBurn');
      buzz(40);
    }
  }
  // a landed beacon is a spire's light for a while
  const b = d.beacon;
  if (b && b.landed && d.pull < 1 && dist(p.x, p.y, (b.x + 0.5) * TILE, (b.y + 0.5) * TILE) < T.tools.beacon.refill) d.pull = Math.min(1, d.pull + T.tools.beacon.refillRate * dt);
}

// Walking off the edge into the neighbour it faces (0: home).
function crossTo(d, to) {
  d.p.mine = null; d.channel = null;
  d.warp = { t: 0, at: null, zone: isKindled(to) ? 'surface' : 'dusk', go: () => (to === 0 ? goHome('walk', d.terr) : enterTerritory(to, { from: d.terr })) };
  snd('portal');
  buzz(20);
}

// What a step through a portal leads to: a Deep's next site, or back up.
function warpArrive(d, w) {
  if (w.go) { w.go(); return; }
  if (!d.deep) enterDeepSite(1);
  else if (d.deep.site < d.deep.of) enterDeepSite(d.deep.site + 1);
  else leaveDeep();
  if (w.look && d.arrive) d.arrive.zone = w.look;
}

// --- banking, travel, home -----------------------------------------------------
// The cargo into the stash (the deeplight carried with it, for the altar).
function bankHaul(d) {
  const s = Save.data.stash, b = d.banked, got = {};
  const add = (k, n) => { s[k] = (s[k] || 0) + n; b.stuff[k] = (b.stuff[k] || 0) + n; got[k] = (got[k] || 0) + n; };
  for (const k in d.cargo) if (d.cargo[k] > 0) add(k, d.cargo[k]);
  Save.data.items.push(...d.items); b.items.push(...d.items);
  b.learned.push(...bankBlueprints(d));
  const n = d.items.length;
  d.cargo = {}; d.items = [];
  return { got, n };
}

function bankAtSpire(d, quiet) {
  const r = bankHaul(d);
  if (hasSpire(d.terr) && d.floor.pad && !(d.beacon && d.beacon.landed)) Save.data.lastSpire = d.terr;
  Save.save();
  saveRun(d);
  if (quiet) return;
  snd('bank');
  const what = [stuffLines(r.got), r.n ? `${r.n} piece${r.n > 1 ? 's' : ''} of gear` : ''].filter(Boolean).join(', ');
  UI.toast(what ? `Banked: ${what}` : 'Nothing to bank', what ? 'legendary' : undefined);
}

// TRAVEL: the world map, from a spire. Choosing a spire (or home) is a
// moment's channel, which banks the cargo first.
function travelFrom(d, to) {
  if (!d || d.hub || d.channel || to === d.terr) return;
  startChannel('travel');
  if (d.channel) d.channel.to = to;
}
function travelDone(d, to) {
  bankAtSpire(d, true);
  snd('travel');
  d.warp = { t: 0, at: null, zone: 'surface', go: () => (to === 0 ? goHome('spire') : enterTerritory(to, { spire: true })) };
}

// Home: everything carried is banked, the settlers' threads (the Settlers'
// Quarters), and the report. how: 'walk', 'spire' or 'recall'. from: the
// territory walked home from, if walked.
function goHome(how, from) {
  const d = Game.dive;
  bankHaul(d);
  Save.data.run = null;
  Save.data.lastSpire = 0;
  const b = d.banked, settlers = quartersPay();
  Save.save();
  enterHub({ banked: b.stuff, items: b.items, light: (d.tally && d.tally.light) || {}, learned: b.learned, settlers, shard: d.gotShard, echoes: d.echoes, where: sortieWhere(d), how, recalled: how === 'recall', kindled: (d.tally && d.tally.kindled) || 0 }, { from });
}

// Where a sortie got to, for the report.
function sortieWhere(d) {
  const t = d.terr ? terrOf(d.terr) : null;
  return t ? `${t.name} · ring ${t.ring}${d.deep ? ` · the Deep, site ${d.deep.site} of ${d.deep.of}` : ''}` : 'The Outpost';
}

// --- the heart goal and kindling -------------------------------------------
function stoneHere(d) {
  const t = terrOf(d.terr), ts = terrState(d.terr), f = d.floor;
  if (d.deep || d.kindled || t.goal !== 'waystones' || ts.done || d.hold) return -1;
  const lit = ts.lit || [];
  return f.stones.findIndex((s, k) => !lit.includes(k) && dist(d.p.x, d.p.y, (s.x + 0.5) * TILE, (s.y + 0.5) * TILE) < T.world.waystone.touch);
}
function heartReady(d) {
  if (d.deep || d.kindled || !terrState(d.terr).done || (d.rift && d.rift.open && d.rift.heart)) return false;
  const h = d.floor.heart;
  return dist(d.p.x, d.p.y, (h.x + 0.5) * TILE, (h.y + 0.5) * TILE) < T.world.waystone.touch;
}

function stoneLit(d, k) {
  const ts = terrState(d.terr), W = T.world.waystone, s = d.floor.stones[k];
  ts.lit = ts.lit || [];
  ts.state = 'contested';
  spawnSparks((s.x + 0.5) * TILE, (s.y + 0.5) * TILE - 18, [ART.pal.star[3], '#ffffff'], 18);
  if (ts.lit.length >= 2) {
    d.hold = { k, t: 0, waveT: W.waveEvery };
  } else ts.lit.push(k);
  // (what's left to do is the goal's, over the view: goalLines)
  snd('waystone');
  buzz(30);
}

// The tear at a territory's heart sealed: its goal is done.
function riftSealedHere(d) {
  if (!d.sortie || d.deep) return;
  const ts = terrState(d.terr);
  ts.sealed = true;
  // (the tear's own toast says it closed; the goal says what's next)
  if (d.rift && d.rift.heart) { ts.done = true; ts.state = 'contested'; }
}

function kindleTerritory(d) {
  const id = d.terr, t = terrOf(id), ts = terrState(id), f = d.floor, h = f.heart;
  Object.assign(ts, { state: 'kindled', done: true, spire: true });
  d.kindled = true; d.sun = T.world.sun.kindled; d.pull = 1; d.pullTime = T.world.light; d.padDark = false; d.hold = null;
  f.tiles[h.y * f.w + h.x] = TILE_PAD; f.pad = { x: h.x, y: h.y };
  repaintAround(f, h.x, h.y);
  // what the dark sent burns away in the light
  for (const e of d.enemies) if (!e.dead) { e.dead = true; spawnSparks(e.x, e.y - 5, [ART.pal.star[3], '#ffffff'], 8); }
  spawnSparks((h.x + 0.5) * TILE, (h.y + 0.5) * TILE - 30, [ART.pal.star[3], ART.pal.star[2], '#ffffff'], 40);
  Save.data.lastSpire = id;
  const tl = d.tally || (d.tally = {});
  tl.kindled = (tl.kindled || 0) + 1;
  // kindled ground is never lost: saved the moment it's taken
  Save.saveField('world'); Save.saveField('lastSpire');
  UI.toast(`${t.name.toUpperCase()} IS KINDLED`, 'legendary');
  // the story's log line for it (story.js), when there is one
  const line = typeof kindleLogLine === 'function' ? kindleLogLine(t.clime, t.name) : '';
  if (line) UI.toast(line, 'log');
  Story.say('firstKindled');
  snd('kindle');
  buzz(60);
  // its heart's light, bound to the Kindler (deeds.js)
  deedKindled(d, t);
}

// --- the Deeps ------------------------------------------------------------
// What each site of a territory's Deep is: caves and ruins, ending in a
// deep vein (or the region's Keeper's Lair, under its ring's furthest
// territory, while the shard is missing).
function deepZone(t, k) {
  if (k >= t.deep) return t.gate && !(Save.data.shards || []).includes(t.biome) ? 'lair' : 'deep';
  return new Rng(deepSeed(worldState().seed, t.id, k)).chance(0.5) ? 'cave' : 'ruin';
}
function deepClime(t, k, zone) {
  if (zone === 'lair') return null;
  if (zone === 'surface') return t.clime;
  return rollClime(deepSeed(worldState().seed, t.id, k), t.biome, zone, k, 0);
}

function enterDeepSite(k) {
  const d = Game.dive, t = terrOf(d.terr), n = t.deep, zone = deepZone(t, k), clime = deepClime(t, k, zone), p = d.p;
  d.deep = { site: k, of: n };
  d.zone = zone; d.clime = clime; d.depth = t.depth; d.biome = t.biome; d.kindled = false; d.sun = undefined;
  d.seed = deepSeed(worldState().seed, t.id, k);
  const ways = zone === 'lair' ? 0 : 1;
  d.ways = ways ? [k >= n ? 'surface' : deepZone(t, k + 1)] : [];
  d.wayClimes = d.ways.map((z) => deepClime(t, k + 1, z));
  const f = (d.floor = generateFloor(d.seed, d.depth, d.biome, lodelineOdds(k), zone, ways, clime));
  resetFloorState(d);
  wayHoleSolids(d);
  // veins mined stay mined, growing back after a few sorties, as in dark land
  const ts = terrState(t.id), W = worldState();
  ts.deepMined = (ts.deepMined || []).filter(([, , n]) => W.sorties - n < T.world.regrow);
  for (const [s, i] of ts.deepMined) if (s === k && f.tiles[i] === TILE_ORE) { f.tiles[i] = TILE_FLOOR; f.ore[i] = 0; }
  p.x = (d.floor.entry.x + 0.5) * TILE; p.y = (d.floor.entry.y + 0.5) * TILE;
  placeRift(d);
  spawnEnemies(d);
  placeFieldForge(d);
  placeLife(d);
  placeCacheHere(d);
  d.far = Math.max(d.far || 0, t.depth);
  // a lair's lodeline is dark until its Keeper falls; the Keeper holds the
  // dark off while it lives
  d.padDark = zone === 'lair' && !!d.keeper;
  if (d.pull <= 0 && zone !== 'lair') { d.pull = 0; theDarkComes(d); }
  d.arrive = { t: 0, zone };
  if (k === 1) { const tl = d.tally || (d.tally = {}); tl.deeps = (tl.deeps || 0) + 1; }
  // the Deep's end, reached: its light, the first time (deeds.js)
  if (k >= n) deedDeepEnd(d, t);
  UI.toast(`The Deep · ${placeName(zone, clime)} · site ${k} of ${n}${d.floor.pad || zone === 'lair' ? '' : ': no light reaches down here'}`);
  Story.say('firstDeep');
  Story.say(T.biomes[t.biome].id);
  if (d.floor.pad && !d.padDark) UI.tip('lodeline', "The star's light reaches down here. Stand in it to rise");
  noticeRift(d);
  saveRun(d);
}

// Up the Deep's lodeline or through its last portal: back to the
// territory's surface, at the Deep's portal.
function leaveDeep() {
  const d = Game.dive;
  d.pullTime = T.world.light;
  enterTerritory(d.terr, { up: true });
}

// How high the sun stands over a surface: a territory's (d.sun), or else
// your light, as a Deep's surface would have it.
function sunOf(d) { return d.sun !== undefined ? d.sun : d.pull; }

// --- the compass in the world -------------------------------------------------
// The spire here, else the nearest opening into lit land (kindled, or
// home), else the one towards the nearest lit land across the map.
function compassTargetWorld(d, steps) {
  const f = d.floor;
  if (f.pad && !d.padDark) return { x: f.pad.x, y: f.pad.y, col: ART.pal.star[3], home: true };
  const L = worldMap(), hops = new Map();
  const q = L.terrs.filter((t) => isKindled(t.id)).map((t) => t.id);
  for (const id of q) hops.set(id, 0);
  for (let i = 0; i < q.length; i++) for (const n of L.terrs[q[i]].nb) if (!hops.has(n)) { hops.set(n, hops.get(q[i]) + 1); q.push(n); }
  const far = (e) => { const s = steps[e.y * f.w + e.x]; return (s < 0 ? 999 : s) + 1000 * (hops.has(e.to) ? hops.get(e.to) : 99); };
  const e = f.exits.slice().sort((a, b) => far(a) - far(b))[0];
  return e ? { x: e.x, y: e.y, col: isKindled(e.to) ? ART.pal.star[3] : '#b8b0d0', home: isKindled(e.to) } : null;
}

// --- drawn ----------------------------------------------------------------
// The spire: a standing obelisk of lodestone on a plinth, gold runes up its
// face and a gold crystal at its tip (the lodeline's beam rises from it).
// Drawn art pixel by art pixel in the lodestone's four tones, lit from
// the top left, then laid in strokes (pflRepaintProp), with no outline.
// Feet at the plinth's front.
const _worldSprites = {};
function spireSprite() {
  if (_worldSprites.spire) return _worldSprites.spire;
  const W = 19, H = 66, P = pixBuf(W, H), S = LODESTONE, G = ART.pal.star, solid = new Uint8Array(W * H), cx = 9;
  const put = (x, y, col, glow) => { if (x < 0 || y < 0 || x >= W || y >= H) return; putPx(P, x, y, col, glow); solid[y * W + x] = 1; };
  // the plinth, two steps
  for (let y = 56; y < H; y++) {
    const half = y < 60 ? 7 : 9;
    for (let x = cx - half; x <= cx + half; x++) put(x, y, y === 56 || y === 60 ? S[3] : x <= cx - half + 1 ? S[2] : x >= cx + half - 1 ? S[0] : S[1]);
  }
  // the shaft, narrowing upwards: its lit left face and shaded right
  for (let y = 12; y < 56; y++) {
    const half = Math.round(2.5 + ((y - 12) / 44) * 2.5);
    for (let x = cx - half; x <= cx + half; x++) put(x, y, x === cx - half ? S[3] : x < cx ? S[2] : x === cx + half ? S[0] : S[1]);
  }
  // the cap, a little pyramid
  for (let y = 5; y < 12; y++) {
    const half = Math.round(((y - 5) / 7) * 3);
    for (let x = cx - half; x <= cx + half; x++) put(x, y, x <= cx ? S[3] : S[1]);
  }
  // the crystal at its tip
  for (const [x, y, c] of [[cx, 0, 3], [cx - 1, 1, 3], [cx, 1, 3], [cx + 1, 1, 2], [cx - 1, 2, 2], [cx, 2, 3], [cx + 1, 2, 1], [cx, 3, 2], [cx, 4, 1]]) put(x, y, G[c], true);
  // runes down the face: small cut marks, glowing
  const runes = [['.G.', 'GGG', '.G.'], ['G.G', '.G.', 'G.G'], ['GG.', '.G.', '.GG'], ['.G.', 'G.G', '.G.']];
  runes.forEach((r, k) => { const y0 = 16 + k * 10; for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) if (r[j][i] === 'G') put(cx - 1 + i, y0 + j, j === 0 ? G[3] : G[2], true); });
  pflRepaintProp(P, solid, S, 0x5b1e);
  const s = spriteFromBuf(P);
  s.ax = cx; s.ay = H - 2;
  return (_worldSprites.spire = artFine(s));
}

// A waystone: a squat stele of lodestone, its band of runes glowing dimly
// until lit, so it can be found in the dark.
function waystoneSprite(lit) {
  const key = 'stone' + (lit ? 1 : 0);
  if (_worldSprites[key]) return _worldSprites[key];
  const W = 15, H = 34, P = pixBuf(W, H), S = LODESTONE, G = ART.pal.star, solid = new Uint8Array(W * H), cx = 7;
  const put = (x, y, col, glow) => { if (x < 0 || y < 0 || x >= W || y >= H) return; putPx(P, x, y, col, glow); solid[y * W + x] = 1; };
  for (let y = 29; y < H; y++) for (let x = 0; x < W; x++) put(x, y, y === 29 ? S[3] : x < 2 ? S[2] : x > W - 3 ? S[0] : S[1]);
  for (let y = 2; y < 29; y++) {
    const half = y < 5 ? [3, 4, 5][y - 2] : 5;
    for (let x = cx - half; x <= cx + half; x++) put(x, y, x === cx - half || y === 2 ? S[3] : x < cx ? S[2] : x === cx + half ? S[0] : S[1]);
  }
  const rune = ['G.G.G', '.GGG.', 'G.G.G', '..G..', '.G.G.'];
  for (let j = 0; j < rune.length; j++) for (let i = 0; i < 5; i++) if (rune[j][i] === 'G') put(cx - 2 + i, 10 + j * 2, lit ? (j % 2 ? G[2] : G[3]) : j % 2 ? '#5a4220' : '#7a5a2c', true);
  pflRepaintProp(P, solid, S, 0x5b1f);
  const s = spriteFromBuf(P);
  s.ax = cx; s.ay = H - 2;
  return (_worldSprites[key] = artFine(s));
}

// The spire and the waystones, sorted with the actors.
function worldProps(d) {
  if (!d.sortie || d.deep || !d.floor.stones) return [];
  const f = d.floor, out = [], t = terrOf(d.terr);
  if (f.pad && hasSpire(d.terr) && !(d.beacon && d.beacon.landed)) out.push({ wprop: 'spire', at: f.pad, y: (f.pad.y + 0.5) * TILE + 1 });
  // (once the land is kindled its spire stands for them)
  if (t.goal === 'waystones' && !d.kindled) f.stones.forEach((s, k) => out.push({ wprop: 'stone', k, at: s, y: (s.y + 0.5) * TILE + 1 }));
  return out;
}

function drawWorldProp(d, a, ox, oy, lights) {
  const fx = Math.round((a.at.x + 0.5) * ATILE) + ox, fy = Math.round(((a.at.y + 0.5) * TILE + 1) * AP) + oy, G = ART.pal.star;
  if (a.wprop === 'spire') {
    const spr = spireSprite();
    drawShadow(fx, fy, 8);
    drawArtSprite(spr, fx - spr.ax, fy - spr.ay);
    const pulse = 0.85 + 0.15 * Math.sin(Game.realT * 2.4);
    lights.push({ x: fx, y: fy - spr.ay + 2, r: TILE * 2, i: 1.0 * pulse, c: rgb01(G[3]) });
    for (let i = 0; i < 5; i++) {
      const ph = (Game.realT * 0.5 + i / 5) % 1, ang = i * 2.3 + ph;
      dot(Math.round(fx + Math.cos(ang) * (4 + ph * 8) * AP), Math.round(fy - ap(6) - ph * 30 * AP), i % 2 ? G[3] : G[2], true, 1 - ph);
    }
    return;
  }
  const ts = terrPeek(d.terr) || {}, held = d.hold && d.hold.k === a.k, lit = (ts.lit || []).includes(a.k) || held || ts.done;
  const spr = waystoneSprite(lit);
  drawShadow(fx, fy, 6);
  drawArtSprite(spr, fx - spr.ax, fy - spr.ay);
  if (lit) {
    const k = held ? 0.8 + 0.2 * Math.sin(Game.realT * 6) : 0.85 + 0.15 * Math.sin(Game.realT * 2 + a.k);
    lights.push({ x: fx, y: fy - ap(14), r: TILE * (held ? 2.6 : 1.8), i: k, c: rgb01(G[2]) });
  } else {
    // unlit, a faint glow breathing slowly, and a mote now and then
    const W = T.world.waystone, k = 0.75 + 0.25 * Math.sin(Game.realT * 1.2 + a.k * 2);
    lights.push({ x: fx, y: fy - ap(14), r: TILE * W.dim[0], i: W.dim[1] * k, c: rgb01(G[2]) });
    const ph = (Game.realT * 0.3 + a.k * 0.37) % 1;
    dot(fx + Math.round(Math.sin(ph * 6 + a.k) * 3), fy - ap(16) - Math.round(ph * ap(14)), G[2], true, Math.sin(ph * Math.PI) * 0.8);
  }
}

// An ancient forge, where one stands (game.js, placeFieldForge): it stands
// among the actors by its feet, dust of this floor's ground round its foot
// (hubart.js), its cracked port glowing cold and breathing slowly, one
// status light still blinking.
function fieldForgeSprite(d) { return hartOldForge(pntLook(artBiome(d.floor))); }
function fieldForgeProps(d) {
  return d.fieldForge ? [{ fieldForge: true, hubDraw: drawFieldForge, hidden: true, y: (d.fieldForge.y + 0.5) * TILE + 6 }] : [];
}
function drawFieldForge(d, a, ox, oy, lights) {
  const spr = fieldForgeSprite(d), P = HART_OLD.port, O = T.paint.hub.old, fy = Math.round((d.fieldForge.y + 0.5) * ATILE + ap(6)) + oy;
  const x = Math.round((d.fieldForge.x + 0.5) * ATILE) + ox - spr.ax, y = fy - spr.ay;
  drawArtSprite(spr, x, y);
  const glow = hartOldForgeGlow(Math.floor(Game.realT * 2.5) % 3);
  drawArtSprite(glow, x + P.x - glow.ax, y + P.y - glow.ay);
  if (Math.floor(Game.realT * 0.8) % 3 === 0) dot(x + HART_OLD.led.x, y + HART_OLD.led.y, HART.cold[3], true);
  const br = 1 - O.breathAmt + O.breathAmt * Math.sin(Game.realT * O.breath);
  lights.push({ x: x + P.x, y: y + P.y, r: TILE * O.light[0], i: O.light[1] * br, c: rgb01(HART.cold[4]) });
  paintOcclude(x, y - 4, spr.w, spr.h + 4, fy, ox, oy);
}

// On the ground, under everyone: the light of a held waystone, and the mark
// at the heart once the goal is done.
function drawWorldUnder(d, ox, oy, lights) {
  if (!d.sortie || d.deep || !d.floor.heart) return;
  const f = d.floor, G = ART.pal.star;
  const ring = (x, y, rx, n, col, alpha, spin) => {
    for (let i = 0; i < n; i++) {
      if ((i + Math.floor(Game.realT * 6)) % 3 === 0) continue;
      const a = (i / n) * Math.PI * 2 + spin;
      dot(Math.round(x + Math.cos(a) * rx), Math.round(y + Math.sin(a) * rx * 0.6), col, true, alpha);
    }
  };
  if (d.hold) {
    const s = f.stones[d.hold.k], x = Math.round((s.x + 0.5) * ATILE) + ox, y = Math.round((s.y + 0.5) * ATILE) + oy, R = T.world.waystone.holdR * AP;
    ring(x, y, R, Math.round(R * 1.6), G[2], 0.8, Game.realT * 0.3);
    ring(x, y, R * (d.hold.t / T.world.waystone.hold), Math.round(R), G[3], 0.6, -Game.realT * 0.5);
  }
  const ts = terrPeek(d.terr);
  if (ts && ts.done && !d.kindled && !(d.rift && d.rift.open && d.rift.heart)) {
    const h = f.heart, x = Math.round((h.x + 0.5) * ATILE) + ox, y = Math.round((h.y + 0.5) * ATILE) + oy, k = 0.6 + 0.4 * Math.sin(Game.realT * 3);
    ring(x, y, ap(13), 30, G[3], k, Game.realT * 0.4);
    ring(x, y, ap(7), 18, G[2], k, -Game.realT * 0.6);
    lights.push({ x, y, r: TILE * 1.6, i: 0.7 * k, c: rgb01(G[2]) });
  }
}

// Over the lit scene: where each opening leads, and its way out.
function drawExitMarks(d, ox, oy) {
  if (!(d.sortie || d.hub) || d.deep || !d.floor.exits) return;
  const p = d.p, blink = Math.floor(Game.realT * 3) % 2;
  for (const e of d.floor.exits) {
    const wx = (e.x + 0.5 + e.nx * 0.5) * TILE, wy = (e.y + 0.5 + e.ny * 0.5) * TILE, m = dist(wx, wy, p.x, p.y) / TILE;
    if (m > 10) continue;
    const lit = isKindled(e.to), col = lit ? '#ffe7a0' : '#c8c0dc', x = Math.round(wx * AP) + ox, y = Math.round(wy * AP) + oy;
    const name = e.to === 0 ? 'HOME' : terrOf(e.to).name.toUpperCase();
    // the name beside the opening, on the side away from where it's walked
    // from (drawn once into a picture, as the hub's labels are drawn)
    const lab = exitLabel(name, col), lx = clamp(Math.round(x + (e.nx ? e.nx * ap(6) : 0) - lab.width / 2), 1, View.w - lab.width - 1);
    View.ctx.globalAlpha = clamp(1.2 - (m - 3) / 6, 0.4, 1);
    View.ctx.drawImage(lab, lx, y + (e.ny > 0 ? ap(10) : e.ny < 0 ? -ap(16) : -ap(40)));
    View.ctx.globalAlpha = 1;
    // chevrons pointing out
    const c = View.ctx, ux = -e.nx, uy = -e.ny;
    c.fillStyle = col;
    for (let k = 0; k < 3; k++) {
      if ((k + blink) % 3 === 2) continue;
      const bx = x + ux * ap(4 + k * 4), by = y + uy * ap(4 + k * 4);
      for (let s = -2; s <= 2; s++) c.fillRect(Math.round(bx + uy * s - ux * Math.abs(s)), Math.round(by - ux * s - uy * Math.abs(s)), 1, 1);
    }
  }
}

// A label in the outpost's pixel hand, with its shadow, as a picture.
const _exitLabels = new Map();
function exitLabel(text, col) {
  const key = text + col;
  if (_exitLabels.has(key)) return _exitLabels.get(key);
  const glyphs = [...text].map((ch) => (LABEL_FONT[ch] || LABEL_FONT[' ']).split('/')), w = glyphs.reduce((n, g) => n + g[0].length + 1, -1);
  const [c, x] = makeCanvas((w + 1) * AF, 6 * AF);
  for (const [ink, o] of [['#000000', 1], [col, 0]]) {
    x.fillStyle = ink;
    let gx = 0;
    for (const g of glyphs) { for (let j = 0; j < 5; j++) for (let i = 0; i < g[j].length; i++) if (g[j][i] === '1') x.fillRect((gx + i + o) * AF, (j + o) * AF, AF, AF); gx += g[0].length + 1; }
  }
  _exitLabels.set(key, c);
  return c;
}

// The goal, in a few words, at the top of the view (#hud-goal).
function goalLines(d) {
  if (!d || !d.sortie || d.deep || d.kindled || !d.terr) return null;
  const t = terrOf(d.terr), ts = terrPeek(d.terr) || {}, out = [];
  // (the star's reach: a spire holds only where its light does)
  const reach = starHoldsSpire(d.terr) ? null : `◇ The star must reach magnitude ${spireMagFor(d.terr)} to hold a spire here`;
  if (ts.done) return reach ? [reach, 'Bring it light from your deeds'] : ['◇ Plant the spire at the heart'];
  if (t.goal === 'rift') return ['◇ Seal the tear at the heart', reach ? `then the spire, at magnitude ${spireMagFor(d.terr)}` : 'then plant the spire'];
  const lit = ts.lit || [];
  for (let k = 0; k < 3; k++) {
    if (d.hold && d.hold.k === k) out.push(`◈ Stay in its light: ${Math.max(0, Math.ceil(T.world.waystone.hold - d.hold.t))} s`);
    else if (lit.includes(k)) out.push(`◆ Waystone ${k + 1} lit`);
    else out.push(lit.length === 2 ? '◇ Light the last, and hold it' : `◇ Light waystone ${k + 1}`);
  }
  out.push(reach ? `then the spire, at magnitude ${spireMagFor(d.terr)}` : 'then plant the spire');
  return out;
}
