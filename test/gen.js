'use strict';
// Floor generation, without a browser:
//  - 150 seeds × 3 biomes × 4 sites × every zone: enough rooms, every way
//    on and the lodeline reachable on foot from the entry, the ways asked
//    for all there, a lair with its arena and lodeline, every ore tile
//    reachable by mining in from open ground, ore from the floor's own
//    biome, the edge intact, a lodeline wherever its chance is 1, and
//    generation that repeats exactly for the same arguments;
//  - golden hashes pin generation, so a change to it has to be meant
//    (re-record with --update).
const fs = require('fs');
const path = require('path');
const { sandbox } = require('./sandbox');
const { finish } = require('./lib-node');

const G = sandbox(['js/util.js', 'js/tuning.js', 'js/floor.js']);
const failures = [];
const fail = (msg) => { if (failures.length < 200) failures.push(msg); };
const GOLDEN = path.join(__dirname, 'golden.json');
const update = process.argv.includes('--update');

const ZONES = ['surface', 'cave', 'ruin', 'lair', 'deep'];
for (let seed = 1; seed <= 150; seed++)
  for (let biome = 0; biome < G.T.biomes.length; biome++)
    for (let depth = 1; depth <= 4; depth++)
      for (const zone of ZONES) {
        const ways = zone === 'lair' || zone === 'deep' || depth === 4 ? 0 : 2;
        const at = `seed ${seed} biome ${biome} site ${depth} ${zone}`;
        const odds = depth === 1 ? 1 : 0.5, f = G.generateFloor(seed, depth, biome, odds, zone, ways);
        const { w, h, tiles, ore } = f;
        if (f.rooms.length < 3) fail(`${at}: only ${f.rooms.length} rooms`);
        for (let x = 0; x < w; x++) if (tiles[x] !== G.TILE_EDGE || tiles[(h - 1) * w + x] !== G.TILE_EDGE) fail(`${at}: the edge is open at x ${x}`);
        for (let y = 0; y < h; y++) if (tiles[y * w] !== G.TILE_EDGE || tiles[y * w + w - 1] !== G.TILE_EDGE) fail(`${at}: the edge is open at y ${y}`);
        const steps = G.floorDistances(tiles, w, h, f.entry.x, f.entry.y);
        if (f.ways.length !== ways) fail(`${at}: ${f.ways.length} ways on, not ${ways}`);
        for (const wy of f.ways) {
          if (steps[wy.y * w + wy.x] < 0) fail(`${at}: a way on can't be reached`);
          if (tiles[wy.y * w + wy.x] !== G.TILE_SHAFT) fail(`${at}: no shaft at a way on`);
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
        if (seed <= 10 && G.floorHash(G.generateFloor(seed, depth, biome, odds, zone, ways)) !== G.floorHash(f)) fail(`${at}: generation doesn't repeat`);
      }

const golden = {};
for (const seed of [1, 7, 1234])
  for (let biome = 0; biome < G.T.biomes.length; biome++)
    for (const [depth, zone] of [[1, 'surface'], [2, 'cave'], [3, 'ruin'], [4, 'lair']]) golden[`${seed}/${biome}/${depth}/${zone}`] = G.floorHash(G.generateFloor(seed, depth, biome, depth === 1 ? 1 : 0.5, zone, depth < 4 ? 2 : 0));
if (update || !fs.existsSync(GOLDEN)) {
  fs.writeFileSync(GOLDEN, JSON.stringify(golden, null, 2) + '\n');
  console.log('gen: golden hashes recorded');
} else {
  const want = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
  for (const k of Object.keys(golden)) if (want[k] !== golden[k]) fail(`golden ${k}: ${golden[k]} (was ${want[k]}): generation changed; re-record with --update if that was meant`);
}

finish('gen', failures);
