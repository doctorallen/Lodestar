'use strict';
// Walking, held to traces recorded from the code as it was before it moved
// onto Tycho's top-down mover (Tycho.move.topdown) and collision
// (Tycho.collide): round bodies (the Kindler's 4 px, a crawler's 6, a big
// one's 9) walked into the walls of real floors from their caverns in
// eight directions and back, round curves, at a dash, out of a wedge on a
// ragged edge, and on seeded random walks; each must come out at the same
// place every frame, bit for bit. With them, the smooth wall line (rockAt,
// both its tables), the body test (bodyHits, bodyInRock) over a lattice of
// points, and the steps-on-foot field enemies follow (floorDistances) from
// a few places, each pinned by a hash.
//   node test/traces.js            replay test/traces.json and compare
//   node test/traces.js --record   record it again (only ever from code
//                                  that moves as it should)
const fs = require('fs');
const path = require('path');
const { sandbox } = require('./sandbox');
const { finish } = require('./lib-node');

const G = sandbox(['js/util.js', 'js/tuning.js', 'js/floor.js', 'js/game.js'], ['moveBody', 'bodyHits', 'bodyInRock', 'rockAt', 'TILE_RISES']);
const FILE = path.join(__dirname, 'traces.json');
const record = process.argv.includes('--record');
const DT = 1 / 60, TILE = G.TILE, W = G.T.worldgen, D = G.T.deep;

// the floors: the world's surface and the Deep under it (as deep.js makes
// them, before the star's cavern and the shafts), and a ruin's square halls
const FLOORS = {
  surface: () => G.generateFloor(G.hashInts(1, 0x5742) >>> 0, W.depth, 0, 0, 'surface', 0, W.clime, W.over),
  deep: () => G.generateFloor(G.hashInts(1, 0xdeeb) >>> 0, D.depth, 0, 0, 'cave', 0, null, Object.assign({}, W.over, D.over)),
  ruin: () => G.generateFloor(3, 2, 0, 0.5, 'ruin', 2),
};
const built = {};
const floor = (k) => built[k] || (built[k] = FLOORS[k]());

const fnv = (h, n) => { h = Math.imul(h ^ (n & 0xffff), 16777619); return Math.imul(h ^ (n >>> 16), 16777619) >>> 0; };
const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);
const hashNum = (h, x) => { f64[0] = x; return fnv(fnv(h, u32[0]), u32[1]); };

// a trace's input played through moveBody: [frames, vx, vy] a segment
function play(t) {
  const f = floor(t.floor), b = { x: t.at[0], y: t.at[1] }, frames = [];
  let h = 2166136261;
  for (const [n, vx, vy] of t.input) for (let i = 0; i < n; i++) { G.moveBody(f, b, vx * DT, vy * DT, t.r); frames.push([b.x, b.y]); h = hashNum(hashNum(h, b.x), b.y); }
  return { frames, hash: h };
}

// the probes: the wall line, the body test and the flow field
function probes(k) {
  const f = floor(k), r0 = f.rooms[1], out = {};
  const cx = (r0.cx + 0.5) * TILE, cy = (r0.cy + 0.5) * TILE;
  let a = 2166136261, b = 2166136261, c = 2166136261;
  for (let y = cy - 320; y < cy + 320; y += 2.5) for (let x = cx - 320; x < cx + 320; x += 2.5) { a = fnv(a, (G.rockAt(f, x, y) ? 1 : 0) + (G.rockAt(f, x, y, G.TILE_RISES) ? 2 : 0)); }
  for (let y = cy - 200; y < cy + 200; y += 3.5) for (let x = cx - 200; x < cx + 200; x += 3.5) for (const r of [4, 9]) { b = fnv(b, (G.bodyHits(f, x, y, r) ? 16 : 0) + G.bodyInRock(f, x, y, r)); }
  for (const room of f.rooms.slice(0, 5)) { const d = G.floorDistances(f.tiles, f.w, f.h, room.cx, room.cy); for (let i = 0; i < d.length; i++) c = fnv(c, d[i] & 0xffff); }
  out.rock = a; out.body = b; out.flow = c;
  return out;
}

// recording: what each trace does
function scripts() {
  const out = [];
  for (const k of Object.keys(FLOORS)) {
    const f = floor(k), rng = new G.Rng(G.hashInts(k.length, 77));
    const at = (room) => [(room.cx + 0.5) * TILE, (room.cy + 0.5) * TILE];
    // (the smaller caverns first, where the walls are near)
    const rooms = f.rooms.slice(1).sort((a, c) => a.rx * a.ry - c.rx * c.ry || a.cx - c.cx || a.cy - c.cy);
    const dirs = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [Math.cos((i * Math.PI) / 4 + 0.2), Math.sin((i * Math.PI) / 4 + 0.2)]);
    // into the walls in eight directions (on till the wall holds the body
    // back, and a little more, sliding along it) and as far back
    const walls = [], start = at(rooms[0]), b = { x: start[0], y: start[1] };
    for (const [x, y] of dirs) {
      let n = 0, held = 0;
      for (; n < 120 && held < 20; n++) { const x0 = b.x, y0 = b.y; G.moveBody(f, b, x * 56 * DT, y * 56 * DT, 4); if (held || Math.hypot(b.x - x0, b.y - y0) < 0.9 * 56 * DT) held++; }
      for (let i = 0; i < n; i++) G.moveBody(f, b, -x * 56 * DT, -y * 56 * DT, 4);
      walls.push([n, x * 56, y * 56], [n, -x * 56, -y * 56]);
    }
    out.push({ name: `${k}: into the walls eight ways and back`, floor: k, r: 4, at: start, input: walls });
    // out from the middle, then round and round, the heading turning a
    // little each frame, sliding round the curves of the walls
    const round = [[30, 56, 0]];
    for (let i = 0; i < 400; i++) { const a = (i / 400) * Math.PI * 2; round.push([1, Math.cos(a) * 56, Math.sin(a) * 56]); }
    out.push({ name: `${k}: round in circles along the curves`, floor: k, r: 4, at: at(rooms[1]), input: round });
    // seeded wandering: a heading for a while, now and then a dash
    const walk = (n, speed, dash) => {
      const input = []; let left = n;
      while (left > 0) {
        const a = rng.f(Math.PI * 2), m = Math.min(left, rng.i(20, 100)), sp = dash && rng.chance(0.2) ? dash : speed;
        const k2 = sp === dash ? Math.min(m, 8) : m;
        input.push([k2, Math.cos(a) * sp, Math.sin(a) * sp]); left -= k2;
      }
      return input;
    };
    out.push({ name: `${k}: the Kindler wandering, dashing now and then`, floor: k, r: 4, at: at(rooms[2]), input: walk(500, 56, 230) });
    out.push({ name: `${k}: a crawler wandering`, floor: k, r: 6, at: at(rooms[3]), input: walk(300, 36, 145) });
    out.push({ name: `${k}: a big one wandering`, floor: k, r: 9, at: at(rooms[4]), input: walk(300, 30, 0) });
    // wedged on a ragged edge: pushed in, along it and out
    const [sx, sy] = at(f.rooms[1]);
    let w = null;
    for (const [x, y] of dirs) {
      for (let s = 0; s < 400 && !w; s += 0.25) { const px = sx + x * s, py = sy + y * s; if (G.bodyHits(f, px, py, 6)) { const qx = px + x * 2.5, qy = py + y * 2.5; if (!G.rockAt(f, qx, qy)) w = { at: [qx, qy], x, y }; break; } }
      if (w) break;
    }
    if (w) out.push({ name: `${k}: wedged on an edge, pushed in, along and out`, floor: k, r: 6, at: w.at, input: [[30, w.x * 36, w.y * 36], [40, -w.y * 36, w.x * 36], [40, w.y * 36, -w.x * 36], [40, -w.x * 36, -w.y * 36]] });
  }
  return out;
}

const failures = [];
if (record) {
  const traces = scripts().map((t) => Object.assign(t, play(t)));
  const probe = {};
  for (const k of Object.keys(FLOORS)) probe[k] = probes(k);
  const lines = traces.map((t) => '    ' + JSON.stringify(t));
  fs.writeFileSync(FILE, '{\n  "about": "Bodies walked through moveBody, their positions frame by frame, and hashes of the wall line, the body test and the flow field; recorded from the original code by node test/traces.js --record.",\n  "probes": ' + JSON.stringify(probe) + ',\n  "traces": [\n' + lines.join(',\n') + '\n  ]\n}\n');
  console.log(`traces: recorded ${traces.length} traces, ${traces.reduce((n, t) => n + t.frames.length, 0)} frames`);
} else {
  const want = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  let frames = 0;
  for (const t of want.traces) {
    const got = play(t);
    frames += got.frames.length;
    const k = got.frames.findIndex((p, i) => !t.frames[i] || p[0] !== t.frames[i][0] || p[1] !== t.frames[i][1]);
    if (k >= 0 || got.frames.length !== t.frames.length) failures.push(`${t.name}: frame ${k} is ${JSON.stringify(got.frames[k])}, was ${JSON.stringify(t.frames[k])}`);
    else if (got.hash !== t.hash) failures.push(`${t.name}: the hash differs`);
  }
  for (const k of Object.keys(FLOORS)) {
    const got = probes(k);
    for (const p of ['rock', 'body', 'flow']) if (got[p] !== want.probes[k][p]) failures.push(`${k}: the ${p} probe is ${got[p]}, was ${want.probes[k][p]}`);
  }
  console.log(`traces: ${want.traces.length} traces, ${frames} frames replayed`);
}
finish('traces', failures);
