'use strict';
// Floor generation, without a browser:
//  - 300 seeds × 3 biomes × 12 depths: enough rooms, the shaft and the
//    lodeline reachable on foot from the entry, every ore tile reachable by
//    mining in from open ground, ore from the floor's own biome, the edge
//    intact, a lodeline on every floor down to padSure, and generation that
//    repeats exactly for the same arguments;
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

for (let seed = 1; seed <= 300; seed++)
  for (let biome = 0; biome < G.T.biomes.length; biome++)
    for (let depth = 1; depth <= 12; depth++) {
      const at = `seed ${seed} biome ${biome} depth ${depth}`;
      const f = G.generateFloor(seed, depth, biome);
      const { w, h, tiles, ore } = f;
      if (f.rooms.length < 3) fail(`${at}: only ${f.rooms.length} rooms`);
      for (let x = 0; x < w; x++) if (tiles[x] !== G.TILE_EDGE || tiles[(h - 1) * w + x] !== G.TILE_EDGE) fail(`${at}: the edge is open at x ${x}`);
      for (let y = 0; y < h; y++) if (tiles[y * w] !== G.TILE_EDGE || tiles[y * w + w - 1] !== G.TILE_EDGE) fail(`${at}: the edge is open at y ${y}`);
      const steps = G.floorDistances(tiles, w, h, f.entry.x, f.entry.y);
      if (steps[f.shaft.y * w + f.shaft.x] < 0) fail(`${at}: the shaft can't be reached`);
      if (tiles[f.shaft.y * w + f.shaft.x] !== G.TILE_SHAFT) fail(`${at}: no shaft tile at the shaft`);
      if (f.pad && steps[f.pad.y * w + f.pad.x] < 0) fail(`${at}: the lodeline can't be reached`);
      if (depth <= G.T.floor.padSure && !f.pad) fail(`${at}: no lodeline above padSure`);
      // every ore tile can be mined into from open ground, one tile at a time
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
      if (seed <= 20 && G.floorHash(G.generateFloor(seed, depth, biome)) !== G.floorHash(f)) fail(`${at}: generation doesn't repeat`);
    }

const golden = {};
for (const seed of [1, 7, 1234])
  for (let biome = 0; biome < G.T.biomes.length; biome++)
    for (const depth of [1, 6]) golden[`${seed}/${biome}/${depth}`] = G.floorHash(G.generateFloor(seed, depth, biome));
if (update || !fs.existsSync(GOLDEN)) {
  fs.writeFileSync(GOLDEN, JSON.stringify(golden, null, 2) + '\n');
  console.log('gen: golden hashes recorded');
} else {
  const want = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
  for (const k of Object.keys(golden)) if (want[k] !== golden[k]) fail(`golden ${k}: ${golden[k]} (was ${want[k]}): generation changed; re-record with --update if that was meant`);
}

finish('gen', failures);
