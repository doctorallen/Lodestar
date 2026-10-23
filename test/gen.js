'use strict';
// Floor generation, without a browser:
//  - 150 seeds × 3 biomes × 4 sites × every zone (and 30 seeds of every
//    clime in each of its zones): enough rooms, every way
//    on and the lodeline reachable on foot from the entry, the ways asked
//    for all there, a lair with its arena and lodeline, every ore tile
//    reachable by mining in from open ground, ore from the floor's own
//    biome, the edge intact, a lodeline wherever its chance is 1, and
//    generation that repeats exactly for the same arguments; a clime's
//    hazard kept off the entry's cavern, the ways and the lodeline, vents
//    and pods out in the open, and lava that cuts no ground off;
//  - the world: 10 seeds' layouts (rings the right size, neighbours on
//    both sides, every territory reachable from the outpost, one starter
//    and a gate in each of the first three rings) and every territory of 3
//    of them: an opening for each neighbour at the map's edge, and the
//    heart, the waystones and every opening reached on foot from each
//    other, ore only from its region, and the same map every time;
//  - golden hashes pin generation, so a change to it has to be meant
//    (re-record with --update).
const fs = require('fs');
const path = require('path');
const { sandbox } = require('./sandbox');
const { finish } = require('./lib-node');

const G = sandbox(['js/util.js', 'js/tuning.js', 'js/floor.js', 'js/world.js', 'js/lattice.js']);
const failures = [];
const fail = (msg) => { if (failures.length < 200) failures.push(msg); };
const GOLDEN = path.join(__dirname, 'golden.json');
const update = process.argv.includes('--update');

const ZONES = ['surface', 'cave', 'ruin', 'lair', 'deep'];
const CLIMES = Object.keys(G.T.climes).filter((id) => G.T.climes[id].hazard || G.T.climes[id].gen);
const cases = [];
for (let seed = 1; seed <= 150; seed++)
  for (let biome = 0; biome < G.T.biomes.length; biome++)
    for (let depth = 1; depth <= 4; depth++) {
      for (const zone of ZONES) cases.push([seed, biome, depth, zone, null]);
      if (seed <= 30) for (const clime of CLIMES) for (const zone of G.T.climes[clime].zones) cases.push([seed, biome, depth, zone, clime]);
    }
for (const [seed, biome, depth, zone, clime] of cases) {
        const ways = zone === 'lair' || zone === 'deep' || depth === 4 ? 0 : 2;
        const at = `seed ${seed} biome ${biome} site ${depth} ${zone}${clime ? ' ' + clime : ''}`;
        const odds = depth === 1 ? 1 : 0.5, f = G.generateFloor(seed, depth, biome, odds, zone, ways, clime);
        const { w, h, tiles, ore } = f;
        if (f.rooms.length < 3) fail(`${at}: only ${f.rooms.length} rooms`);
        for (let x = 0; x < w; x++) if (tiles[x] !== G.TILE_EDGE || tiles[(h - 1) * w + x] !== G.TILE_EDGE) fail(`${at}: the edge is open at x ${x}`);
        for (let y = 0; y < h; y++) if (tiles[y * w] !== G.TILE_EDGE || tiles[y * w + w - 1] !== G.TILE_EDGE) fail(`${at}: the edge is open at y ${y}`);
        const steps = G.floorDistances(tiles, w, h, f.entry.x, f.entry.y);
        if (f.ways.length !== ways) fail(`${at}: ${f.ways.length} ways on, not ${ways}`);
        for (const wy of f.ways) {
          if (steps[wy.y * w + wy.x] < 0) fail(`${at}: a way on can't be reached`);
          if (tiles[wy.y * w + wy.x] !== G.TILE_PORTAL) fail(`${at}: no portal's tile at a way on`);
        }
        if (f.pad && steps[f.pad.y * w + f.pad.x] < 0) fail(`${at}: the lodeline can't be reached`);
        if (zone === 'lair' && (!f.arena || !f.pad)) fail(`${at}: a lair without its arena or lodeline`);
        if (zone !== 'lair' && odds === 1 && !f.pad) fail(`${at}: no lodeline where one is sure`);
        const allowed = new Set(G.T.biomes[biome].ores.map((id) => G.ORE_INDEX[id] + 1));
        const reach = new Uint8Array(w * h), q = [];
        for (let i = 0; i < w * h; i++) if (steps[i] >= 0) { reach[i] = 1; q.push(i); }
        for (let qi = 0; qi < q.length; qi++) {
          const i = q[qi];
          for (const j of [i + 1, i - 1, i + w, i - w]) if (!reach[j] && tiles[j] === G.TILE_ORE) { reach[j] = 1; q.push(j); }
        }
        for (let i = 0; i < w * h; i++) {
          if (tiles[i] === G.TILE_ORE) {
            if (!reach[i]) fail(`${at}: sealed-in ore at ${i % w},${Math.floor(i / w)}`);
            if (!allowed.has(ore[i])) fail(`${at}: ore ${ore[i]} isn't from this biome`);
          } else if (ore[i]) fail(`${at}: ore on a non-ore tile`);
        }
        if (seed <= 10 && G.floorHash(G.generateFloor(seed, depth, biome, odds, zone, ways, clime)) !== G.floorHash(f)) fail(`${at}: generation doesn't repeat`);
        // the hazard: never by the entry, a way or the lodeline; vents and
        // pods in the open; lava leaving every bit of ground walkable
        if (clime && G.T.climes[clime].hazard && !f.haz && !f.hazPts) fail(`${at}: no hazard laid`);
        const keyTiles = [f.entry, ...f.ways, f.pad].filter(Boolean);
        const hazTiles = [];
        if (f.haz) for (let i = 0; i < w * h; i++) if (f.haz[i]) { hazTiles.push({ x: i % w, y: Math.floor(i / w) }); if (tiles[i] !== G.TILE_FLOOR) fail(`${at}: a hazard on a tile that isn't open ground`); }
        for (const p of f.hazPts || []) {
          hazTiles.push(p);
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (tiles[(p.y + dy) * w + p.x + dx] !== G.TILE_FLOOR) fail(`${at}: a vent or pod hemmed in at ${p.x},${p.y}`);
        }
        for (const t of hazTiles) for (const k of keyTiles) if (Math.max(Math.abs(t.x - k.x), Math.abs(t.y - k.y)) <= 2) fail(`${at}: a hazard beside the entry, a way or the lodeline at ${t.x},${t.y}`);
        if (f.hazKind === 'burn') {
          const safe = G.floorDistances(tiles, w, h, f.entry.x, f.entry.y, f.haz);
          for (let i = 0; i < w * h; i++) if (!G.TILE_SOLID[tiles[i]] && !f.haz[i] && safe[i] < 0) { fail(`${at}: lava cuts off ${i % w},${Math.floor(i / w)}`); break; }
        }
}

// the world
for (let seed = 1; seed <= 10; seed++) {
  const L = G.worldLayout(seed), at = `world ${seed}`;
  G.T.world.rings.forEach((R, r) => { const n = L.terrs.filter((t) => t.ring === r).length; if (n !== R.n) fail(`${at}: ring ${r} has ${n} territories, not ${R.n}`); });
  for (const t of L.terrs) {
    if (!t.home && !t.nb.length) fail(`${at}: ${t.name} has no neighbours`);
    for (const n of t.nb) if (!L.terrs[n].nb.includes(t.id)) fail(`${at}: ${t.name} and ${L.terrs[n].name} aren't neighbours both ways`);
    if (!t.home && (t.depth < 1 || t.depth > 4 + (t.edge ? G.T.world.edgeDepth : 0))) fail(`${at}: ${t.name} is depth ${t.depth}`);
  }
  const seen = new Set([0]), q = [0];
  for (let i = 0; i < q.length; i++) for (const n of L.terrs[q[i]].nb) if (!seen.has(n)) { seen.add(n); q.push(n); }
  if (seen.size !== L.terrs.length) fail(`${at}: only ${seen.size} of ${L.terrs.length} territories can be walked to`);
  if (L.terrs.filter((t) => t.starter).length !== 1 || !L.terrs.find((t) => t.starter).nb.includes(0)) fail(`${at}: not one starter next to the outpost`);
  for (let r = 1; r <= 3; r++) if (!L.terrs.some((t) => t.ring === r && t.gate && t.deep >= 2)) fail(`${at}: ring ${r} has no gate with a Deep`);
  if (seed > 3) continue;
  for (const t of L.terrs) {
    if (t.home) continue;
    const f = G.generateTerritory(seed, t.id), w = f.w, tat = `${at} ${t.name}`;
    if (f.exits.length !== t.nb.length) fail(`${tat}: ${f.exits.length} openings for ${t.nb.length} neighbours`);
    for (const e of f.exits) {
      const edge = e.x === 1 || e.y === 1 || e.x === w - 2 || e.y === f.h - 2;
      if (!edge || f.tiles[e.y * w + e.x] !== G.TILE_FLOOR) fail(`${tat}: the opening to ${e.to} isn't open ground at the edge`);
      if (f.tiles[e.ay * w + e.ax] !== G.TILE_FLOOR) fail(`${tat}: the arrival from ${e.to} isn't open ground`);
    }
    const steps = G.floorDistances(f.tiles, w, f.h, f.heart.x, f.heart.y);
    for (const p of f.stones.concat(f.exits, f.ways)) if (steps[p.y * w + p.x] < 0) fail(`${tat}: ${p.x},${p.y} can't be walked to from the heart`);
    const keys = [f.heart].concat(f.stones);
    for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) if (keys[i].x === keys[j].x && keys[i].y === keys[j].y) fail(`${tat}: the heart and waystones overlap`);
    if (!!t.deep !== (f.ways.length === 1)) fail(`${tat}: its Deep's portal is missing or unasked for`);
    const allowed = new Set(G.T.biomes[t.biome].ores.map((id) => G.ORE_INDEX[id] + 1));
    for (let i = 0; i < f.ore.length; i++) if (f.ore[i] && !allowed.has(f.ore[i])) { fail(`${tat}: ore from another region`); break; }
    if (G.territoryHash(G.generateTerritory(seed, t.id)) !== G.territoryHash(f)) fail(`${tat}: its map doesn't repeat`);
  }
}

// the Lattice under it: a shaft gallery under every territory with a Deep,
// the junctions, one connected web; every gallery's openings, cleft and
// spire spot walkable from each other, and the same map every time
for (let seed = 1; seed <= 10; seed++) {
  const L = G.worldLayout(seed), K = G.latticeLayout(seed), N = K.nodes, at = `lattice ${seed}`;
  const deeps = L.terrs.filter((t) => t.deep).length;
  if (N.filter((n) => n.under >= 0).length !== deeps) fail(`${at}: ${N.filter((n) => n.under >= 0).length} shafts for ${deeps} Deeps`);
  if (N.length - deeps !== G.T.lattice.extra) fail(`${at}: ${N.length - deeps} junctions, not ${G.T.lattice.extra}`);
  for (const n of N) {
    if (!n.nb.length) fail(`${at}: ${n.name} joins nothing`);
    for (const k of n.nb) if (!N[k].nb.includes(n.id)) fail(`${at}: ${n.name} and ${N[k].name} aren't joined both ways`);
    if (n.under < 0 && !n.spire) fail(`${at}: the junction ${n.name} has no cold spire`);
    if (n.under >= 0 && K.byTerr[n.under] !== n.id) fail(`${at}: ${n.name} isn't found under its land`);
  }
  const seen = new Set([0]), q = [0];
  for (let i = 0; i < q.length; i++) for (const k of N[q[i]].nb) if (!seen.has(k)) { seen.add(k); q.push(k); }
  if (seen.size !== N.length) fail(`${at}: only ${seen.size} of ${N.length} galleries can be walked to`);
  if (seed > 3) continue;
  for (const n of N) {
    const f = G.generateGallery(seed, n.id), w = f.w, gat = `${at} ${n.name}`;
    if (f.exits.length !== n.nb.length) fail(`${gat}: ${f.exits.length} openings for ${n.nb.length} tunnels`);
    const steps = G.floorDistances(f.tiles, w, f.h, f.entry.x, f.entry.y);
    for (const e of f.exits) if (steps[e.y * w + e.x] < 0 || f.tiles[e.ay * w + e.ax] !== G.TILE_FLOOR) fail(`${gat}: the opening to ${e.to} can't be reached`);
    if (!f.heart) fail(`${gat}: no place for a spire`);
    else if (steps[f.heart.y * w + f.heart.x] < 0) fail(`${gat}: the spire's place can't be reached`);
    if ((n.under >= 0) !== (f.ways.length === 1)) fail(`${gat}: its cleft is missing or unasked for`);
    if (f.ways[0] && f.tiles[f.ways[0].y * w + f.ways[0].x] !== G.TILE_PORTAL) fail(`${gat}: the cleft isn't on its tile`);
    const allowed = new Set(G.T.biomes[n.biome].ores.map((id) => G.ORE_INDEX[id] + 1));
    for (let i = 0; i < f.ore.length; i++) if (f.ore[i] && !allowed.has(f.ore[i])) { fail(`${gat}: ore from another region`); break; }
    if (G.galleryHash(G.generateGallery(seed, n.id)) !== G.galleryHash(f)) fail(`${gat}: its map doesn't repeat`);
  }
}

const golden = {};
for (const seed of [1, 7, 1234])
  for (let biome = 0; biome < G.T.biomes.length; biome++)
    for (const [depth, zone] of [[1, 'surface'], [2, 'cave'], [3, 'ruin'], [4, 'lair']]) golden[`${seed}/${biome}/${depth}/${zone}`] = G.floorHash(G.generateFloor(seed, depth, biome, depth === 1 ? 1 : 0.5, zone, depth < 4 ? 2 : 0));
// and each clime's, in its first zone
for (const seed of [1, 7])
  for (const clime of CLIMES) { const zone = G.T.climes[clime].zones[0]; golden[`${seed}/0/2/${zone}/${clime}`] = G.floorHash(G.generateFloor(seed, 2, 0, 0.5, zone, 2, clime)); }
// and the world's territories
for (const seed of [1, 7]) for (const id of [1, 9, 20, 33]) golden[`world ${seed}/${id}`] = G.territoryHash(G.generateTerritory(seed, id));
// and the Lattice's galleries
for (const seed of [1, 7]) for (const id of [0, 3, 8]) golden[`lattice ${seed}/${id}`] = G.galleryHash(G.generateGallery(seed, id));
if (update || !fs.existsSync(GOLDEN)) {
  fs.writeFileSync(GOLDEN, JSON.stringify(golden, null, 2) + '\n');
  console.log('gen: golden hashes recorded');
} else {
  const want = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
  for (const k of Object.keys(golden)) if (want[k] !== golden[k]) fail(`golden ${k}: ${golden[k]} (was ${want[k]}): generation changed; re-record with --update if that was meant`);
}

finish('gen', failures);
