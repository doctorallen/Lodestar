'use strict';
// ---------------------------------------------------------------------------
// Undergrowth: how the flora grows into a place, the way merryfolk's
// nature.js plants its valley. All of it is cosmetic, placed on the render
// side from the floor's own seed, so a floor always grows the same and play,
// collision and generation never change. The numbers are in T.flora.
//  - Habitat: each tile's suitability, from how near a wall it is (thick
//    along a wall's foot and in its nooks), how wet (by pools, in a damp
//    clime), how lit (by lava or a shaft of daylight, underground) and how
//    open (the middles of open ground stay clear for a fight).
//  - Drifts: each kind grows where its own seeded noise is high, so a kind
//    comes in clumps and drifts that thin and fray at their edges, with the
//    odd one out on its own. Big pieces are spaced by their size; small
//    ones gather round them and along the walls.
//  - Beds: the ground under and round a plant is grown into (soil, moss,
//    roots, litter, ash or thaw, as the clime has it), with a contact shadow
//    on the side away from the light, and tufts, sprigs, moss and pebbles,
//    all painted into the floor's pixels, so a plant stands in the ground
//    rather than on it. Repainting after mining paints them again; ground
//    that was rock when they grew stays bare.
//  - Walls: moss climbing a face over a bed at its foot, roots, vines or
//    icicles hanging from a lip, scree at a wall's foot, and under the sky a
//    fringe of dry grass over a mesa's lip.
//  - Stands of tall grass and reeds, drawn in rows among the actors, so
//    whoever walks through one is hidden to the knees. Under the sky
//    everything leans in the wind; underground, a plant stirs as something
//    brushes past.
// ---------------------------------------------------------------------------

// Each flora set's undergrowth: bed, the colour the ground under its plants
// leans to; litter, what's strewn on a bed (light, dark); moss, what climbs
// a wall's face (light, dark); strand, what hangs from a lip (light, dark;
// icicle: they taper, and are ice); lip, a mesa's fringe under the sky
// (top to bottom). blade, tall, head, pad, root: the materials of its
// tufts, its tall grass, their seed heads, its moss pads and its roots,
// from the set's own flora palette. Pebbles are the rock's own face.
// Nothing here is in an ore's colour.
const UG_LOOKS = {
  rim: { bed: '#2c4424', litter: ['#5a6a34', '#3a4624'], moss: ['#3e5a2a', '#24381c'], strand: ['#4e3e2e', '#2b231c'], blade: 'moss', tall: 'stem', head: 'cap', pad: 'moss', root: 'root' },
  choir: { bed: '#3a2a52', litter: ['#6a5080', '#45345a'], moss: ['#4a3a66', '#2c2244'], strand: ['#6a5a7e', '#3a2e46'], blade: 'moss', tall: 'stem', head: 'flesh', pad: 'moss', root: 'root' },
  underforge: { bed: '#1c1210', litter: ['#5e5858', '#2e2a2a'], moss: ['#3e4430', '#24281c'], strand: ['#4a3024', '#26180f'], blade: 'ash', tall: 'stem', head: 'ash', pad: 'moss', root: 'root' },
  surface: { bed: '#3a2416', litter: ['#c8b888', '#8a7650'], lip: ['#d8c890', '#a89660', '#6a5a38'], blade: 'reed', tall: 'grass', head: 'stem', pad: 'cactus', root: 'bark' },
  frost: { bed: '#5a6078', litter: ['#f2f8ff', '#8a92ac'], lip: ['#f6faff', '#c8d4e6', '#8a96b4'], strand: ['#eef4ff', '#a8c4e6'], icicle: true, blade: 'stem', tall: 'stem', head: 'snow', pad: 'leaf', root: 'root' },
  cinder: { bed: '#6a6066', litter: ['#8a8086', '#140e10'], lip: ['#5a5054', '#2a2224', '#141012'], blade: 'stem', tall: 'stem', head: 'ash', pad: 'ash', root: 'root' },
  bloomfen: { bed: '#34501e', litter: ['#c890b0', '#2a4220'], lip: ['#6a9a46', '#3c5c2c', '#22381a'], moss: ['#527a3a', '#2a4220'], strand: ['#4a7a36', '#22401c'], blade: 'leaf', tall: 'leaf', head: 'bark', pad: 'moss', root: 'bark' },
  grotto: { bed: '#1c2a46', litter: ['#4a5878', '#141c34'], moss: ['#2a4e62', '#12283a'], strand: ['#2e5068', '#14283a'], blade: 'leaf', tall: 'leaf', head: 'shell', pad: 'moss', root: 'shell' },
  magma: { bed: '#140c10', litter: ['#4a3e40', '#0a0608'], moss: ['#302a2a', '#1a1616'], strand: ['#3a2418', '#1a100c'], blade: 'rock', tall: 'rock', head: 'rock', pad: 'rock', root: 'root' },
  rootdeep: { bed: '#3a2a16', litter: ['#6a5030', '#2a2010'], moss: ['#4a5a28', '#2a3418'], strand: ['#62502e', '#2a2014'], blade: 'leaf', tall: 'leaf', head: 'stem', pad: 'moss', root: 'root' },
  temple: { bed: '#2c4826', litter: ['#6a6a30', '#22341c'], moss: ['#486638', '#22341c'], strand: ['#3c6a32', '#1a3218'], blade: 'leaf', tall: 'leaf', head: 'petal', pad: 'moss', root: 'vine' },
  vault: { bed: '#2a1c10', litter: ['#5a4428', '#1a120a'], moss: ['#3a3020', '#221a10'], blade: 'leaf', tall: 'leaf', head: 'leaf', pad: 'rock', root: 'bark' },
};
// Kinds that grow by water, and kinds that grow towards the light
// underground (lava, daylight).
const UG_WET = new Set(['Cattails', 'Kelp fronds', 'Lilies', 'Frost reeds', 'Fen grass', 'Reed pipes', 'Barnacle mound', 'Barnacle shelf', 'Anemones', 'Water sacs', 'Chime reeds', 'Bladder pods', 'Tube worms']);
const UG_LIT = new Set(['Glowcaps', 'Fire fungus', 'Lava bloom', 'Ember moss', 'Flower bush', 'Fern', 'Fire lily', 'Basalt columns']);

// The ground cover, as letter rows (built with the set's flora palette by
// buildArtSprite, shaded and sel-outed like any flora): G a blade (g its
// darkest), H a seed head or leaf tip, P moss (p), R a pebble (r), T a root
// (t).
const UG_ROWS = {
  tuft: [
    ['..G..', 'G.G.G', '.GGG.', '.gGg.'],
    ['.G..G.', '..GG.G', 'G.GG..', '.gGGg.'],
    ['G..G', '.GG.', '.gG.'],
  ],
  sprig: [
    ['.H.H.', 'HGHGH', '.GGG.', '..g..'],
    ['H..H', '.GH.', 'GgG.', '.g..'],
  ],
  pebbles: [
    ['.RR..', 'RRRr.', 'rrr..'],
    ['....RR.', '.R.RRRr', 'RRr.rr.', 'rr.....'],
    ['RRR', 'rRr'],
    ['.RRR.R', 'RRRrRr', 'rrr.r.'],
  ],
  moss: [
    ['.PPPP..', 'PPPPPPP', '.pPPPp.'],
    ['..PPP.', '.PPPPP', 'PPpPP.', '.pp...'],
  ],
  roots: [
    ['T..TT...', '.TT..TT.', '...t...t'],
    ['.TT....', 'T..TTt.', '.....tT'],
  ],
  // the tall grass of a stand: stems a pixel wide, dark at the foot and
  // light at the tips (a, b, c, d: the material's four tones, set rather
  // than shaded, since a stem a pixel wide has no form to light), a few
  // heads (H) above; no sel-out, which on stems this fine would be all
  // outline
  tall: [
    ['..d....d', 'd.c..d.c', 'c.c..c.c', '.cb.c.b.', '.b.bb.b.', '.b.b.bb.', '..bbab..', '..aaa...'],
    ['.H...H.', '.c.d.c.', '.c.c.c.', '.b.c.b.', 'b..b.b.', '.b.bb..', '.abab..', '..aa...'],
    ['.d..d', '.c.c.', 'c.cb.', '.bb.b', '.bab.', '..a..'],
  ],
};

// A sprite as a stamp: its pixels as 32-bit words (0 where it's clear),
// to paint into a floor's pixels or a stand's rows.
function ugStampOf(spr) {
  const d = spr.c.getContext('2d').getImageData(0, 0, spr.w, spr.h).data, px = new Uint32Array(spr.w * spr.h);
  for (let i = 0, n = px.length; i < n; i++) if (d[i * 4 + 3] > 127) px[i] = (0xff000000 | (d[i * 4 + 2] << 16) | (d[i * 4 + 1] << 8) | d[i * 4]) >>> 0;
  return { w: spr.w, h: spr.h, px };
}

// A set's ground cover on a look's ground (the pebbles are its rock), built
// once.
const _ugKits = new Map();
function ugKit(set, b) {
  const key = set + '|' + b.front.join();
  let K = _ugKits.get(key);
  if (K) return K;
  const kit = floraKit(set), look = UG_LOOKS[set] || UG_LOOKS.rim, pal = Object.assign({}, kit.pal, { scree: fourStep(b.front) });
  const has = (m) => (pal[m] ? m : 'stem');
  const letters = {
    G: [has(look.blade)], g: [has(look.blade), 0], H: [has(look.head)], P: [has(look.pad)], p: [has(look.pad), 0],
    R: ['scree'], r: ['scree', 0], T: [has(look.root)], t: [has(look.root), 0],
  };
  const tallLetters = Object.assign({}, letters, { a: [has(look.tall), 0], b: [has(look.tall), 1], c: [has(look.tall), 2], d: [has(look.tall), 3] });
  const make = (rows, L, o) => ugStampOf(buildArtSprite(rows, pal, L || letters, [], o));
  K = {};
  for (const k of Object.keys(UG_ROWS)) K[k] = UG_ROWS[k].map((r) => (k === 'tall' ? make(r, tallLetters, { outline: 'none' }) : make(r)));
  _ugKits.set(key, K);
  return K;
}

// A look's bed tones as 32-bit words: [deep, mid, litter light, litter
// dark, moss light, moss dark, strand light, strand dark, lip x3].
const _ugTones = new Map();
function ugTones(set, b) {
  const key = set + '|' + b.floor.join() + (b.sun ? 's' : '');
  let Q = _ugTones.get(key);
  if (Q) return Q;
  const look = UG_LOOKS[set] || UG_LOOKS.rim, g = b.sun ? calmRgb(b.floor) : rampRgb(b.floor), tint = rgbOf(look.bed);
  const u = (c) => (0xff000000 | (Math.round(c[2]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[0])) >>> 0;
  const mixc = (a, c, t) => a.map((v, i) => v + (c[i] - v) * t);
  const hex = (h) => u(rgbOf(h));
  Q = {
    tint, deep: mixc(tint, [0, 0, 0], 0.22),
    litter: look.litter.map(hex), moss: look.moss ? look.moss.map(hex) : null,
    strand: look.strand ? look.strand.map(hex) : null, icicle: !!look.icicle, lip: look.lip ? look.lip.map(hex) : null,
  };
  _ugTones.set(key, Q);
  return Q;
}

// How big a floor piece is: 2 big (a tree, a tall stalk), 1 middling, 0
// small (a tuft, a clump of pods).
function ugClass(p) { return p.w * p.h >= 300 || p.h >= 22 ? 2 : p.h <= 9 && p.w <= 15 ? 0 : 1; }

// ---------------------------------------------------------------------------
// Habitat
// ---------------------------------------------------------------------------
// Each tile's suitability for growth (0 rock, about 1 at a wall's foot),
// and how wet and how near a wall it is.
function ugHabitat(f, S) {
  const F = T.flora, W = f.w, H = f.h, N = W * H;
  const wd = new Uint8Array(N).fill(99), wet = new Float32Array(N), lit = new Float32Array(N), nook = new Uint8Array(N), suit = new Float32Array(N);
  // distance to the nearest wall, in tiles (eight ways)
  const q = [];
  for (let i = 0; i < N; i++) if (TILE_SOLID[f.tiles[i]]) { wd[i] = 0; q.push(i); }
  const spread = (dist, from, max) => {
    for (let k = 0; k < from.length; k++) {
      const i = from[k], x = i % W, y = (i / W) | 0;
      if (dist[i] >= max) continue;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (dist[i] + 1 < dist[n]) { dist[n] = dist[i] + 1; from.push(n); }
      }
    }
  };
  spread(wd, q, 98);
  // standing water: how near it is
  const wdist = new Uint8Array(N).fill(99), wq = [];
  if (f.haz && f.hazCode === HAZ_CODES.pool) for (let i = 0; i < N; i++) if (f.haz[i]) { wdist[i] = 0; wq.push(i); }
  spread(wdist, wq, F.wetReach);
  // light underground: lava, and shafts of daylight
  const ldist = new Uint8Array(N).fill(99), lq = [];
  if (f.haz && f.hazCode === HAZ_CODES.burn) for (let i = 0; i < N; i++) if (f.haz[i]) { ldist[i] = 0; lq.push(i); }
  if (!f.hub) for (const s of climeLights(f)) { const i = Math.floor(s.y / TILE) * W + Math.floor(s.x / TILE); if (i >= 0 && i < N) { ldist[i] = 0; lq.push(i); } }
  spread(ldist, lq, F.lightReach);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (wd[i] === 0) continue;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && TILE_SOLID[floorTile(f, x + dx, y + dy)]) n++;
      nook[i] = n;
      wet[i] = Math.min(1, (wdist[i] <= F.wetReach ? 1 - wdist[i] / (F.wetReach + 1) : 0) + (S.wet || 0));
      lit[i] = ldist[i] <= F.lightReach ? 1 - ldist[i] / (F.lightReach + 1) : 0;
      const foot = F.foot * Math.exp(-(wd[i] - 1) / F.wallReach);
      let s = foot + (n >= 3 ? F.nook : 0) + wet[i] * F.wet + lit[i] * F.light + F.base;
      if (wd[i] >= F.openFrom) s *= F.openKeep;
      suit[i] = Math.min(1.4, s);
    }
  return { wd, wet, lit, nook, suit };
}

// ---------------------------------------------------------------------------
// Placing it
// ---------------------------------------------------------------------------
// What grows on a floor: the pieces and stands drawn among the actors, and
// what's painted into the floor (View.ug: beds, shadows and stamps by the
// tiles they touch). Needs the floor's rock pixels (View.rockPx).
function placeUndergrowth(f, set) {
  const F = T.flora, kit = floraKit(set), S = F.sets[set] || F.sets.rim, b = artBiome(f), K = ugKit(set, b);
  const W = f.w, H = f.h, N = W * H, R = View.rockPx, PW = W * ATILE, PH = H * ATILE, seed = hashInts(f.seed, f.depth, 0xf10a) | 0;
  const rng = new Rng(seed >>> 0), hab = ugHabitat(f, S), sky = kit.sky && !f.hub;
  const dens = S.density * (f.hub ? F.hub : 1);
  // where nothing grows: the entry, round each portal and its plinth, the
  // lodeline's dish, the outpost's stations, and on the hazards themselves
  const keep = new Uint8Array(N);
  const mark = (x, y) => { if (x >= 0 && y >= 0 && x < W && y < H) keep[y * W + x] = 1; };
  if (f.entry) mark(f.entry.x, f.entry.y);
  for (const w of f.ways || []) for (let dy = -2; dy <= 0; dy++) for (let dx = -1; dx <= 1; dx++) mark(w.x + dx, w.y + dy);
  if (f.pad) mark(f.pad.x, f.pad.y);
  if (f.hub) for (const s of HUB_STATIONS) for (let dy = -1; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) mark(s.x + dx, s.y + dy);
  for (let i = 0; i < N; i++) if (f.haz && f.haz[i]) keep[i] = 1;
  for (const p of f.hazPts || []) mark(p.x, p.y);
  const open = (tx, ty) => tx > 0 && ty > 0 && tx < W - 1 && ty < H - 1 && f.tiles[ty * W + tx] === TILE_FLOOR && !keep[ty * W + tx];
  const rockPx = (x, y) => { x = Math.round(x); y = Math.round(y); return x < 0 || y < 0 || x >= PW || y >= PH || R[y * PW + x] === 1; };
  const wallAbove = (tx, ty) => TILE_SOLID[floorTile(f, tx, ty - 1)] && floorTile(f, tx, ty - 1) !== TILE_PIT;

  const U = { f, set, b, K, Q: ugTones(set, b), sky, orig: new Uint8Array(N), beds: new Array(N), shadows: new Array(N), stamps: new Array(N), grid: new Float32Array(N), gridNear: new Uint8Array(N), atlas: null };
  for (let i = 0; i < N; i++) U.orig[i] = TILE_SOLID[f.tiles[i]] ? 1 : 0;
  // each thing painted goes in the lists of the tiles it touches (art px)
  const bucket = (list, it, x0, y0, x1, y1) => {
    for (let ty = Math.max(0, Math.floor(y0 / ATILE)); ty <= Math.min(H - 1, Math.floor(y1 / ATILE)); ty++)
      for (let tx = Math.max(0, Math.floor(x0 / ATILE)); tx <= Math.min(W - 1, Math.floor(x1 / ATILE)); tx++) (list[ty * W + tx] || (list[ty * W + tx] = [])).push(it);
  };
  // a bed (world px: its middle, half width and depth; k its strength)
  const bed = (x, y, rx, ry, k = 1) => { const s = { x: x * AP, y: y * AP, rx: rx * AP, ry: ry * AP, k }; bucket(U.beds, s, s.x - s.rx, s.y - s.ry, s.x + s.rx, s.y + s.ry); };
  const shadow = (x, y, rx) => { const s = { x: (x + rx * 0.3) * AP, y: (y + 0.5) * AP, rx: rx * AP, ry: Math.max(1.4, rx * 0.34) * AP }; bucket(U.shadows, s, s.x - s.rx, s.y - s.ry, s.x + s.rx, s.y + s.ry); };
  // a stamp, its middle at x and its letters' foot at y (world px)
  const stamp = (st, x, y) => {
    const s = { st, x: Math.round(x * AP - st.w / 2), y: Math.round(y * AP) - st.h + 2 };
    if (rockPx(x * AP, y * AP)) return;
    bucket(U.stamps, s, s.x, s.y, s.x + st.w - 1, s.y + st.h - 1);
  };
  const coverAt = (x, y, wantRock) => {
    const r = rng.f();
    const pick = (a) => a[Math.floor(rng.f() * a.length)];
    stamp(r < 0.5 ? pick(K.tuft) : r < 0.68 ? pick(K.sprig) : r < 0.84 ? pick(K.moss) : wantRock ? pick(K.pebbles) : pick(K.roots), x, y);
  };

  // pieces stand apart by their size (small ones of a kind may clump)
  const grid = new Map();
  const room = (x, y, r, name, small) => {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    for (let j = ty - 2; j <= ty + 2; j++) for (let i = tx - 2; i <= tx + 2; i++) {
      const l = grid.get(j * W + i);
      if (l) for (const o of l) {
        const k = small && o.small && o.name === name ? F.sameKind : F.space * (o.r + r > 20 ? 1.4 : 1);
        if (Math.hypot(o.x - x, (o.y - y) * 1.3) < (o.r + r) * k) return false;
      }
    }
    return true;
  };
  const claim = (x, y, r, name, small) => { const i = Math.floor(y / TILE) * W + Math.floor(x / TILE); (grid.get(i) || grid.set(i, []).get(i)).push({ x, y, r, name, small }); };
  const items = [];
  const footClear = (x, y, half) => !rockPx(x * AP, y * AP) && !rockPx((x - half) * AP, y * AP) && !rockPx((x + half) * AP, y * AP) && !rockPx(x * AP, (y + 2) * AP);
  const put = (piece, x, y, anchorT) => {
    const spr = floraSprite(set, piece, 0), top = piece.anchor === 'ceiling', sx = Math.round(x * AP - spr.w / 2), sy = top ? Math.round(y * AP) : Math.round(y * AP) - spr.h + 1;
    items.push({ piece, set, x, y, top, phase: rng.f(), anchorT, bx0: sx, by0: sy, bx1: sx + spr.w, by1: sy + spr.h, hgt: spr.h, amp: 0, stir: 0, stirDir: 1 });
    return spr;
  };
  // a plant on the ground, with its bed, shadow and cover round it
  const plant = (piece, x, y, cls) => {
    put(piece, x, y, -1);
    const r = piece.w / 2;
    claim(x, y, r, piece.name, cls === 0);
    const bx = r + F.bed.reach * (cls === 2 ? 1.3 : cls === 1 ? 1 : 0.7);
    bed(x, y - 1, bx, bx * F.bed.squash);
    shadow(x, y, Math.max(2.5, piece.w * F.shadow.w));
    const n = cls === 0 ? rng.i(0, 1) : rng.i(F.cover.round[0], F.cover.round[1]) + (cls === 2 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const a = rng.f(Math.PI * 2), d = bx * rng.f(0.45, 0.95);
      coverAt(x + Math.cos(a) * d, y - 1 + Math.sin(a) * d * F.bed.squash, k === n - 1 && cls === 2);
    }
  };

  // the noise each kind grows by: its drifts
  const kindNoise = (k, tx, ty) => artNoise(tx, ty, F.drift, seed + 101 * k);
  const floorKinds = [[], [], []];
  kit.pieces.forEach((p, k) => { if (p.anchor === 'floor') floorKinds[ugClass(p)].push({ p, k, wet: UG_WET.has(p.name), lit: UG_LIT.has(p.name), bias: 0.1 * Math.log(p.weight) }); });
  const wallKinds = kit.pieces.map((p, k) => ({ p, k, bias: 0.1 * Math.log(p.weight) })).filter((o) => o.p.anchor === 'wall');
  const ceilKinds = kit.pieces.map((p, k) => ({ p, k, bias: 0.1 * Math.log(p.weight) })).filter((o) => o.p.anchor === 'ceiling');
  // the kind whose drift is strongest here (each kind's own noise, so a
  // drift is mostly of one kind), and how strongly anything of the list
  // grows here (one noise for the list, so there's bare ground between)
  const kindAt = (list, tx, ty, salt) => {
    const i = ty * W + tx;
    let best = null, bv = -9;
    for (const o of list) {
      const v = kindNoise(o.k, tx, ty) + o.bias + (o.wet ? hab.wet[i] * 0.8 - 0.25 : 0) + (o.lit ? hab.lit[i] * 0.8 - 0.15 : 0);
      if (v > bv) { bv = v; best = o; }
    }
    const g = artNoise(tx, ty, F.drift, seed + 53 * salt) + hab.wet[i] * 0.4;
    return [best, clamp((g - (F.cut - F.fray)) / (2 * F.fray), 0, 1)];
  };
  const order = rng.shuffle(Array.from({ length: N }, (_, i) => i));

  // stands of tall grass and reeds, out from the walls a little, and by water
  const stand = new Uint8Array(N);
  if (S.tall > 0) {
    const C = F.stand, sa = (tx, ty) => {
      if (!open(tx, ty)) return 0;
      const i = ty * W + tx, n = artNoise(tx, ty, F.drift * 0.8, seed + 777) + hab.wet[i] * 0.45;
      return hab.suit[i] >= C.minSuit && n > C.cut + (1 - S.tall) * 0.5 ? n : 0;
    };
    for (let ty = 1; ty < H - 1; ty++) for (let tx = 1; tx < W - 1; tx++) if (sa(tx, ty)) stand[ty * W + tx] = 1;
    U.standAt = stand;
  }

  // at a wall's foot: pieces growing up it, hanging from it, and moss and
  // scree along it, in runs
  for (let ty = 1; ty < H - 1; ty++)
    for (let tx = 1; tx < W - 1; tx++) {
      if (!open(tx, ty) || !wallAbove(tx, ty)) continue;
      const i = ty * W + tx, s = hab.suit[i];
      // the ground's top here (art px), under the rock's face
      const cx = (tx + 0.5) * ATILE;
      let gy = ty * ATILE - ATILE / 2;
      while (gy < (ty + 1) * ATILE && rockPx(cx, gy)) gy++;
      const g = gy / AP;
      const [wk, wp] = kindAt(wallKinds, tx, ty, 1), [ck, cp] = kindAt(ceilKinds, tx, ty, 2);
      if (wk && rng.chance(F.wallP * dens * wp * s * 0.5 + F.outlier * 0.5)) {
        const x = (tx + 0.5) * TILE + rng.f(-4, 4);
        put(wk.p, x, ty * TILE + wk.p.h - 2, (ty - 1) * W + tx);
        bed(x, g + 3, wk.p.w / 2 + F.bed.reach, 5);
      } else if (ck && rng.chance(F.ceilP * dens * cp * s * 0.5 + F.outlier * 0.4)) {
        put(ck.p, (tx + 0.5) * TILE + rng.f(-4, 4), ty * TILE - 1, (ty - 1) * W + tx);
      }
      // a run of moss or growth along the foot, where the drift of the
      // foot's own noise is high
      const run = artNoise(tx, ty, F.drift * 0.7, seed + 313);
      if (run > F.cut - F.fray && rng.chance(F.cover.foot * Math.min(1, s))) {
        // (the rock above takes it too, so it runs right up to the face)
        U.grid[i] = Math.max(U.grid[i], 0.65 * clamp((run - F.cut + F.fray) * 2, 0.4, 1));
        U.grid[i - W] = Math.max(U.grid[i - W], U.grid[i]);
        for (let k = 0, n = rng.i(1, 2); k < n; k++) coverAt((tx + rng.f(0.1, 0.9)) * TILE, g + rng.f(2, 5), false);
      }
      // scree: pebbles fallen from the face
      const sc = rng.i(F.cover.scree[0], F.cover.scree[1]) * S.scree;
      for (let k = 0; k < sc; k++) if (rng.chance(0.7)) {
        const x = (tx + rng.f(0.05, 0.95)) * TILE;
        let py = Math.round(ty * ATILE - ATILE / 2);
        while (py < (ty + 1) * ATILE && rockPx(x * AP, py)) py++;
        stamp(K.pebbles[rng.i(0, K.pebbles.length - 1)], x, py / AP + rng.f(1, 3));
      }
    }

  // floor pieces, big ones first, each kind in its drifts
  for (const cls of [2, 1, 0]) {
    const list = floorKinds[cls];
    if (!list.length) continue;
    const share = cls === 2 ? 0.22 : cls === 1 ? 0.55 : 0.8;
    for (const i of order) {
      const tx = i % W, ty = (i / W) | 0;
      if (!open(tx, ty) || (stand[i] && cls > 0)) continue;
      const [o, pres] = kindAt(list, tx, ty, 3 + cls), s = hab.suit[i];
      if (!o || !rng.chance((F.floorP * dens * pres * share + F.outlier * 0.3) * s)) continue;
      const p = o.p, half = p.w / 2;
      for (let k = 0, n = cls === 0 && pres > 0.6 ? rng.i(1, 2) : 1; k < n; k++) {
        const x = (tx + 0.5) * TILE + rng.f(-5, 5), y = ty * TILE + (wallAbove(tx, ty) ? rng.f(9, 14) : rng.f(5, 14));
        if (!footClear(x, y, half * 0.6) || !room(x, y, half, p.name, cls === 0)) continue;
        plant(p, x, y, cls);
        // where a drift is thick, its beds run together
        if (pres > 0.5) U.grid[i] = Math.max(U.grid[i], F.bed.drift * pres);
        // small ones gather round a big one
        if (cls === 2 && floorKinds[0].length) {
          const [sk] = kindAt(floorKinds[0], tx, ty, 3);
          for (let m = 0, g = rng.i(F.gather[0], F.gather[1]); m < g; m++) {
            const a = rng.f(Math.PI * 2), d = half * rng.f(1, 1.6) + 4, gx = x + Math.cos(a) * d, gy = y + Math.sin(a) * d * 0.7;
            const gi = Math.floor(gy / TILE) * W + Math.floor(gx / TILE);
            if (!open(gx / TILE | 0, gy / TILE | 0) || stand[gi] || !footClear(gx, gy, sk.p.w * 0.3) || !room(gx, gy, sk.p.w / 2, sk.p.name, true)) continue;
            plant(sk.p, gx, gy, 0);
          }
        }
      }
    }
  }

  // the fighting flora wear a plant's shape: they get its bed and cover, and
  // a harmless one or two of their kind nearby, like any plant in a drift
  const d = Game.dive;
  if (d && d.floor === f && !f.hub) for (const e of d.enemies) {
    if (!T.enemies[e.type] || !T.enemies[e.type].rooted || e.dead) continue;
    const look = kit.looks && set !== 'surface' ? kit.pieces.find((p) => p.name === kit.looks[e.type]) : null, w = look ? look.w : 12;
    const bx = w / 2 + F.bed.reach;
    bed(e.x, e.y - 1, bx, bx * F.bed.squash);
    shadow(e.x, e.y, Math.max(2.5, w * F.shadow.w));
    claim(e.x, e.y, w / 2, look ? look.name : '', false);
    for (let k = 0, n = rng.i(F.cover.round[0], F.cover.round[1]); k < n; k++) { const a = rng.f(Math.PI * 2), r = bx * rng.f(0.45, 0.95); coverAt(e.x + Math.cos(a) * r, e.y - 1 + Math.sin(a) * r * F.bed.squash, false); }
    if (look) for (let k = 0, n = rng.i(1, 2), tries = 0; k < n && tries < 8; tries++) {
      const a = rng.f(Math.PI * 2), r = w + rng.f(4, 14), x = e.x + Math.cos(a) * r, y = e.y + Math.sin(a) * r * 0.7;
      if (!open(x / TILE | 0, y / TILE | 0) || !footClear(x, y, w * 0.3) || !room(x, y, w / 2, look.name, false)) continue;
      plant(look, x, y, ugClass(look)); k++;
    }
  }

  // the odd tuft out in the open
  for (let ty = 1; ty < H - 1; ty++)
    for (let tx = 1; tx < W - 1; tx++) {
      const i = ty * W + tx;
      if (open(tx, ty) && !stand[i] && rng.chance(F.cover.open * (0.5 + hab.suit[i]) * dens)) coverAt((tx + rng.f(0.15, 0.85)) * TILE, ty * TILE + rng.f(4, 14), true);
    }

  // the stands: their beds, and their stems in rows, a row a strip, each
  // strip at most two tiles long, packed into one picture
  const strips = [];
  if (S.tall > 0) {
    const C = F.stand, gapY = TILE / C.rows;
    for (let ty = 1; ty < H - 1; ty++) {
      for (let tx = 1; tx < W - 1; tx++) if (stand[ty * W + tx]) U.grid[ty * W + tx] = rng.f(0.75, 1);
      for (let r = 0; r < C.rows; r++) {
        let tx = 1;
        while (tx < W - 1) {
          if (!stand[ty * W + tx]) { tx++; continue; }
          const blades = [];
          let len = 0;
          for (; len < 2 && tx < W - 1 && stand[ty * W + tx]; len++, tx++) {
            let edge = 0;
            for (const [dx, dy] of DIRS4) if (!stand[(ty + dy) * W + tx + dx]) edge++;
            const by = ty * TILE + 2 + r * gapY + rng.f(0, 1.5);
            for (let x = tx * TILE + (r & 1 ? C.gap / 2 : 0) + 1; x < (tx + 1) * TILE; x += C.gap) {
              if (edge && rng.chance(0.2 * edge)) continue;
              const bx = x + rng.f(-1, 1);
              if (!footClear(bx, by, 1)) continue;
              const st = K.tall[rng.i(0, K.tall.length - 1)];
              blades.push({ st, x: Math.round(bx * AP - st.w / 2), y: Math.round(by * AP) - st.h + 2, by });
            }
          }
          if (!blades.length) continue;
          let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, sy = 0;
          for (const o of blades) { x0 = Math.min(x0, o.x); y0 = Math.min(y0, o.y); x1 = Math.max(x1, o.x + o.st.w); y1 = Math.max(y1, o.y + o.st.h); sy += o.by; }
          blades.sort((a, c) => a.by - c.by);
          strips.push({ blades, x0, y0, w: x1 - x0, h: y1 - y0, y: sy / blades.length });
        }
      }
    }
  }
  if (strips.length) {
    const AW = 1024;
    let cx = 0, cy = 0, rowH = 0;
    for (const s of strips) {
      if (cx + s.w > AW) { cx = 0; cy += rowH; rowH = 0; }
      s.sx = cx; s.sy = cy; cx += s.w; rowH = Math.max(rowH, s.h);
    }
    const AH = cy + rowH, px = new Uint32Array(AW * AH);
    for (const s of strips) {
      for (const o of s.blades) {
        const st = o.st, dx = s.sx + o.x - s.x0, dy = s.sy + o.y - s.y0;
        for (let j = 0; j < st.h; j++) for (let i = 0; i < st.w; i++) { const v = st.px[j * st.w + i]; if (v) px[(dy + j) * AW + dx + i] = v; }
      }
    }
    const [c, cx2] = makeCanvas(AW, AH);
    cx2.putImageData(new ImageData(new Uint8ClampedArray(px.buffer), AW, AH), 0, 0);
    U.atlas = c;
    for (const s of strips) items.push({ strip: true, sx: s.sx, sy: s.sy, w: s.w, h: s.h, bx0: s.x0, by0: s.y0, bx1: s.x0 + s.w, by1: s.y0 + s.h, x: (s.x0 + s.w / 2) / AP, y: s.y, hgt: s.h, phase: rng.f(), amp: 0, stir: 0, stirDir: 1 });
  }
  // the tiles a bed of a stand or a wall's foot can reach
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
    if (!U.grid[ty * W + tx]) continue;
    for (let j = ty - 1; j <= ty + 1; j++) for (let i = tx - 1; i <= tx + 1; i++) if (i >= 0 && j >= 0 && i < W && j < H) U.gridNear[j * W + i] = 1;
  }
  // what's drawn over ground that glows (ore, lava, a vent, a glowing rim,
  // a rift) must always hide that glow
  const rf = Game.dive && Game.dive.floor === f ? Game.dive.rift : null;
  for (const it of items) {
    it.glowUnder = false;
    for (let ty = Math.max(0, Math.floor(it.by0 / ATILE)); ty <= Math.min(H - 1, Math.floor(it.by1 / ATILE)) && !it.glowUnder; ty++)
      for (let tx = Math.max(0, Math.floor(it.bx0 / ATILE)); tx <= Math.min(W - 1, Math.floor(it.bx1 / ATILE)); tx++)
        if (f.tiles[ty * W + tx] === TILE_ORE || (f.haz && f.haz[ty * W + tx]) || hazardNear(f, tx, ty, 0) || (rf && Math.abs(rf.x - tx) < 4 && Math.abs(rf.y - ty) < 4)) { it.glowUnder = true; break; }
  }
  items.sort((a, c) => a.y - c.y);
  View.ug = U;
  return items;
}

// ---------------------------------------------------------------------------
// Painting it into the floor (render.js paintTileArt, after the tile and
// its clime's ground): beds, the wall's face, contact shadows, stamps.
// ---------------------------------------------------------------------------
const _ugHaz = new Uint8Array(ATILE * ATILE), _ugRowBeds = new Float64Array(4 * 256), _ugRowShadows = new Float64Array(3 * 256);
// The beds of stands and walls' feet, which are laid by the tile: how
// strongly they grow at art px x, y, blended between the tiles' middles
// (about -0.6 far from any, 1 in the middle of one).
function ugGridAt(U, x, y) {
  const W = U.f.w, G = U.grid, gx = x / ATILE - 0.5, gy = y / ATILE - 0.5, tx = Math.floor(gx), ty = Math.floor(gy), u = gx - tx, v = gy - ty;
  if (tx < 0 || ty < 0 || tx + 1 >= W || ty + 1 >= U.f.h) return -1;
  const i = ty * W + tx, a = G[i], b = G[i + 1], c = G[i + W], d = G[i + W + 1];
  if (!(a || b || c || d)) return -1;
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 1.6 - 0.6;
}
// How strongly a bed grows at art px x, y (0 for none).
function ugBedAt(U, x, y) {
  const f = U.f, tx = Math.floor(x / ATILE), ty = Math.floor(y / ATILE);
  if (tx < 0 || ty < 0 || tx >= f.w || ty >= f.h) return 0;
  const i = ty * f.w + tx, list = U.beds[i];
  if (U.orig[i]) return 0;
  let v = U.gridNear[i] ? ugGridAt(U, x, y) : 0;
  if (!list) return Math.max(0, v);
  for (const s of list) { const dx = (x - s.x) / s.rx, dy = (y - s.y) / s.ry, e = (1 - dx * dx - dy * dy) * s.k; if (e > v) v = e; }
  return v;
}
const ugMix = (c, t, a) => ((c & 0xff000000) | (((((c >>> 16) & 255) + (t[2] - ((c >>> 16) & 255)) * a) | 0) << 16) | (((((c >>> 8) & 255) + (t[1] - ((c >>> 8) & 255)) * a) | 0) << 8) | (((c & 255) + (t[0] - (c & 255)) * a) | 0)) >>> 0;
const ugDarken = (c, k) => ((c & 0xff000000) | ((((c >>> 16) & 255) * k) << 16) | ((((c >>> 8) & 255) * k) << 8) | ((c & 255) * k)) >>> 0;

// What hangs from a lip over column x whose face meets the ground at yf:
// 0, or how far down from the lip it reaches (amt: the set's strands).
function ugStrandLen(x, yf, seedH, amt) {
  const F = T.flora;
  if (artNoise(x / AP, yf / AP, 14, seedH + 91) < F.strands.cut + 0.35 - amt * 0.35) return 0;
  const h = artHash(x, yf, seedH + 93);
  if (h > 0.42) return 0;
  return Math.round(3 + (h / 0.42) * (FACE_H - 3 + F.strands.past));
}

function paintUndergrowth(P, f, tx, ty, ox, oy, b) {
  const U = View.ug;
  if (!U || U.f !== f) return;
  const F = T.flora, R = View.rockPx, W = P.w, C32 = P.col32 || (P.col32 = new Uint32Array(P.col.buffer)), E = P.em, Q = U.Q, i = ty * f.w + tx;
  const grid = U.gridNear[i] && !U.orig[i], beds = (U.beds[i] || grid) && !U.orig[i] ? U.beds[i] || UG_NONE : null, shadows = U.shadows[i] && !U.orig[i] ? U.shadows[i] : null, stamps = U.stamps[i];
  const seedH = (f.seed ^ f.depth) | 0, S = F.sets[U.set] || F.sets.rim;
  // which of the tile's pixels are a hazard's, where there's one near
  const hz = f.haz && (beds || shadows || stamps) && hazardNear(f, tx, ty, 1);
  if (hz) for (let y = 0; y < ATILE; y++) for (let x = 0; x < ATILE; x++) _ugHaz[y * ATILE + x] = hazardAt(f, (ox + x + 0.5) / AP, (oy + y + 0.5) / AP) ? 1 : 0;
  const strands = Q.strand && S.strands > 0 && !U.sky;
  // what's round the tile: the wall line runs between tile middles, so a
  // tile with no rock round it has none in it, and one with no open ground
  // round it or the tile under it has no face
  let solidN = 0, openN = 0;
  for (let j = ty - 1; j <= ty + 1; j++) for (let i = tx - 1; i <= tx + 1; i++) { if (TILE_SOLID[floorTile(f, i, j)]) solidN++; else openN++; }
  for (let i = tx - 1; i <= tx + 1; i++) if (!TILE_SOLID[floorTile(f, i, ty + 2)]) openN++;
  // the rock in the tile: a wall's face, its lip and what grows on it
  if (solidN && openN && (Q.moss || strands || (U.sky && Q.lip))) {
    // for each rock pixel, how far down the ground is (0 for further than
    // a face): the cave painter has just worked it out for this tile
    const BL = _caveBelow;
    // a column at a time: what grows on a face is the same all down it, so
    // it's worked out once a face (yf: where the face meets the ground)
    for (let x = ox; x < ox + ATILE; x++) {
      let yfC = -1, lipN = 0, hm = 0, L = 0;
      for (let y = oy; y < oy + ATILE; y++) {
        const k = y * W + x;
        if (!R[k]) continue;
        const below = BL[(y - oy) * ATILE + x - ox];
        if (!below) continue;
        const yf = y + below, fromLip = FACE_H - below;
        if (yf !== yfC) {
          yfC = yf;
          // a ragged fringe of dry grass over the lip
          lipN = U.sky && Q.lip ? 1 + Math.floor(artHash(x >> 1, yf, seedH + 77) * F.lip) : 0;
          // moss climbing the face over a bed at its foot
          const bv = Q.moss ? ugBedAt(U, x, yf) : 0;
          hm = bv > 0.05 ? Math.round(FACE_H * F.faceMoss * Math.min(1, bv * 2.5) * (0.6 + 0.4 * artNoise(x / AP, yf / AP, 3, seedH + 81))) : 0;
          L = strands ? ugStrandLen(x, yf, seedH, S.strands) : 0;
        }
        let c = 0;
        if (fromLip < lipN) c = Q.lip[Math.min(2, fromLip + (artHash(x, yf, seedH + 78) < 0.3 ? 1 : 0))];
        else if (below <= hm) c = Q.moss[below < hm && artHash(x >> 1, y >> 1, seedH + 83) < 0.6 ? 0 : 1];
        if (L && fromLip < L) {
          if (Q.icicle) { if (fromLip < L - 2 || (fromLip === L - 2 && !(x & 1))) c = Q.strand[fromLip === 0 || (x + fromLip) % 3 ? 0 : 1]; }
          else c = Q.strand[(fromLip + (x & 1)) % 3 === 2 ? 1 : 0];
        }
        if (c) { C32[k] = c; E[k * 4 + 3] = 0; }
      }
    }
  }
  // the ground: beds, the ends of what hangs, then shadows
  const B = F.bed, Sh = F.shadow;
  // roots and vines hang on past a face's foot only over open tiles with
  // rock above or beside them
  const hang = strands && !TILE_SOLID[floorTile(f, tx, ty)] && (TILE_SOLID[floorTile(f, tx - 1, ty - 1)] || TILE_SOLID[floorTile(f, tx, ty - 1)] || TILE_SOLID[floorTile(f, tx + 1, ty - 1)] || TILE_SOLID[floorTile(f, tx - 1, ty)] || TILE_SOLID[floorTile(f, tx + 1, ty)]);
  if (beds || shadows) {
    const dark = cavePal(b).dark;
    const rb = _ugRowBeds, rs = _ugRowShadows, G = U.grid, FW = f.w;
    for (let y = oy; y < oy + ATILE; y++) {
      // only the beds and shadows whose ragged edge can reach this row, with
      // their part that's the same all along it worked out once: for a bed
      // [x, 1 / rx, (1 - dy²) k, k], for a shadow [x, 1 / rx, dy²]
      let nb = 0, ns = 0;
      if (beds) for (const s of beds) { if (nb > 1016) break; const dy = (y - s.y) / s.ry; if (dy * dy < 1.7) { rb[nb++] = s.x; rb[nb++] = 1 / s.rx; rb[nb++] = (1 - dy * dy) * s.k; rb[nb++] = s.k; } }
      if (shadows) for (const s of shadows) { if (ns > 762) break; const dy = (y - s.y) / s.ry; if (dy * dy < 1.9) { rs[ns++] = s.x; rs[ns++] = 1 / s.rx; rs[ns++] = dy * dy; } }
      // the beds laid by the tile, blended down to this row at the middles
      // of the tiles to the left, here and to the right
      let g0 = 0, g1 = 0, g2 = 0, gOn = false;
      if (grid) {
        const gy = (y + 0.5) / ATILE - 0.5, j = Math.floor(gy), v = gy - j, at = (i) => (j < 0 || j + 1 >= f.h || i < 0 || i >= FW ? 0 : G[j * FW + i] + (G[(j + 1) * FW + i] - G[j * FW + i]) * v);
        g0 = at(tx - 1); g1 = at(tx); g2 = at(tx + 1); gOn = g0 > 0 || g1 > 0 || g2 > 0;
      }
      const bd = nb > 0 || gOn;
      if (!bd && !ns) continue;
      for (let x = ox; x < ox + ATILE; x++) {
        const k = y * W + x;
        if (R[k] || (hz && _ugHaz[(y - oy) * ATILE + x - ox])) continue;
        // (the edge follows the ground's own clumps: the cave painter's
        // texture for this tile, -1 to 1)
        const n = _caveNoise[(y - oy) * ATILE + x - ox];
        if (bd) {
          let v = -1;
          if (gOn) { const u = (x + 0.5) / ATILE - 0.5 - tx; v = (u < 0 ? g1 + (g1 - g0) * u : g1 + (g2 - g1) * u) * 1.6 - 0.6; }
          for (let q = 0; q < nb; q += 4) { const dx = (x - rb[q]) * rb[q + 1], e = rb[q + 2] - dx * dx * rb[q + 3]; if (e > v) v = e; }
          if (v > -B.fray) v += n * B.fray;
          if (v > 0) {
            // the ground's own clumps show through, drawn towards the bed's
            // colour (further in the middle), strewn with litter in clusters
            // (in a wall's shadow, only a little, so the shadow stays)
            // (the cave painter leaves its darkest tone exactly where a wall's
            // shadow falls)
            const sh = C32[k] === dark;
            let c = sh ? ugMix(C32[k], Q.deep, B.outer * 0.6) : v > B.deep ? ugMix(C32[k], Q.deep, B.inner) : ugMix(C32[k], Q.tint, B.outer);
            // (litter in little clusters: a leaf, a needle or a fleck of ash
            // two or three pixels long, lying on its side)
            const l = artHash(((x + (y & 1) * 2) / 3) | 0, y, seedH + 67);
            if (l < B.litter * (0.04 + 0.1 * Math.min(1, v))) c = sh ? ugDarken(Q.litter[1], 0.8) : Q.litter[l < B.litter * 0.035 ? 0 : 1];
            C32[k] = c; E[k * 4 + 3] = 0;
          }
        }
        if (ns) {
          let e = 9;
          for (let q = 0; q < ns; q += 3) { const dx = (x - rs[q]) * rs[q + 1], d2 = dx * dx + rs[q + 2]; if (d2 < e) e = d2; }
          if (e < 0.5 + n * 0.22) { C32[k] = ugDarken(C32[k], Sh.core); E[k * 4 + 3] = 0; }
          else if (e < 1 + n * 0.3) { C32[k] = ugDarken(C32[k], Sh.rim); E[k * 4 + 3] = 0; }
        }
      }
    }
  }
  // a root or vine hanging on past the face's foot, over the ground: down
  // each column, the ground just under rock
  if (hang && !Q.icicle)
    for (let x = ox; x < ox + ATILE; x++) {
      let since = 99;
      for (let y = Math.max(1, oy - 3); y < oy + ATILE; y++) {
        const k = y * W + x;
        if (R[k]) { since = 0; continue; }
        if (++since > F.strands.past || y < oy) continue;
        if (since === 1 && !ugStrandLen(x, y, seedH, S.strands)) { since = 99; continue; }
        if (ugStrandLen(x, y - since + 1, seedH, S.strands) > FACE_H + since - 1) { C32[k] = Q.strand[1]; E[k * 4 + 3] = 0; }
      }
    }
  // tufts, sprigs, moss, roots and pebbles
  if (stamps)
    for (const s of stamps) {
      const st = s.st, x0 = Math.max(ox, s.x), x1 = Math.min(ox + ATILE, s.x + st.w), y0 = Math.max(oy, s.y), y1 = Math.min(oy + ATILE, s.y + st.h);
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          const v = st.px[(y - s.y) * st.w + x - s.x];
          if (!v || (hz && _ugHaz[(y - oy) * ATILE + x - ox])) continue;
          const k = y * W + x;
          C32[k] = v; E[k * 4 + 3] = 0;
        }
    }
}

// ---------------------------------------------------------------------------
// Drawing it: what's in view, how it leans, and the stands' rows
// ---------------------------------------------------------------------------
const UG_NONE = [];
const UG_VIEW = { list: [], bodies: [], t: 0, last: new WeakMap() };
// How far things lean at a point under the sky (east is positive): a
// steady push, slow swells, and gusts that roll across from the west.
function floraWind(x, y) {
  const Wd = T.flora.wind, t = Game.realT;
  const swell = Wd.swell[0] + Wd.swell[1] * Math.sin(t * Wd.swell[2] + x * 0.008 + y * 0.004);
  const gust = Math.pow(Math.max(0, Math.sin(t * Wd.gust[1] - x * 0.012 - y * 0.003)), 4) * Wd.gust[0];
  return Wd.s * (swell + gust);
}

// The flora and stands in view (art px, ox, oy the floor's offset), each
// with how far it leans this frame.
function floraInView(d, ox, oy) {
  const out = UG_VIEW.list, list = View.flora, U = View.ug;
  out.length = 0;
  if (!list) return out;
  const x0 = -ox - 8, x1 = -ox + View.w + 8, y0 = -oy - 8, y1 = -oy + View.h + 8;
  for (const it of list) if (it.bx1 >= x0 && it.bx0 <= x1 && it.by1 >= y0 && it.by0 <= y1) out.push(it);
  const now = Game.realT, dt = clamp(now - UG_VIEW.t, 0, 0.1), Wd = T.flora.wind, [sAmp, sT, sR] = Wd.stir;
  UG_VIEW.t = now;
  // what's moving through: the diver, the enemies and critters that walk
  const movers = [], last = UG_VIEW.last;
  const mover = (o) => {
    const l = last.get(o);
    if (l && (Math.abs(l[0] - o.x) > 0.05 || Math.abs(l[1] - o.y) > 0.05)) movers.push(o);
    if (l) { l[0] = o.x; l[1] = o.y; } else last.set(o, [o.x, o.y]);
  };
  mover(d.p);
  for (const e of d.enemies) if (!e.dead && e.type !== 'wisp') mover(e);
  for (const c of lifeActors(d)) if (c.crit !== 'bird') mover(c);
  const sky = U && U.sky, bodies = UG_VIEW.bodies;
  // who stands where a plant may be drawn over them: only there need it
  // hide their glow (the diver's circuits, eyes) as well as their colour
  bodies.length = 0;
  bodies.push(d.p);
  for (const e of d.enemies) if (!e.dead) bodies.push(e);
  for (const it of out) {
    const hw = (it.bx1 - it.bx0) / AP / 2;
    it.over = it.glowUnder;
    for (const m of bodies) if (Math.abs(m.x - it.x) < hw + 12 && it.y > m.y - 2 && it.y - m.y < it.hgt / AP + 4) { it.over = true; break; }
    for (const m of movers) if (Math.abs(m.x - it.x) < hw + 2 && it.y - m.y > -3 && it.y - m.y < sR) { it.stir = 1; it.stirDir = m.x < it.x ? 1 : -1; }
    it.stir = Math.max(0, it.stir - dt / sT);
    let a = it.stir ? it.stirDir * sAmp * it.stir * (0.7 + 0.3 * Math.sin(now * 11 + it.phase * 6)) : 0;
    if (sky) a += (floraWind(it.x, it.y) + Math.sin(now * 3.1 + it.phase * 6) * 0.15 * Wd.s) * Wd.amp * clamp(it.hgt / 36, 0.35, 1.4);
    it.amp = a;
  }
  return out;
}

// A picture (src, its part sx, sy, w, h) at dx, dy leaning amp art px at
// its top (or for a hanging one, its foot), in rows that shift by whole art
// px: the top most, the foot not at all. ec: its emissive pixels, if any
// (the same size as src). over: it may be over something that glows, so
// it hides that glow too.
const _ugBands = new Int16Array(3 * 64);
function drawLeaning(src, ec, sx, sy, w, h, dx, dy, amp, hanging, over = true) {
  const x = View.ctx, ex = View.emCtx, B = _ugBands;
  let n = 0;
  if (Math.abs(amp) < 0.5) { B[0] = 0; B[1] = h; B[2] = 0; n = 3; }
  else {
    let r = 0;
    while (r < h && n < B.length) {
      const o = Math.round(amp * Math.pow(Math.max(0, hanging ? r / h : 1 - r / h), 1.8));
      let e = r + 1;
      while (e < h && Math.round(amp * Math.pow(Math.max(0, hanging ? e / h : 1 - e / h), 1.8)) === o) e++;
      B[n++] = r; B[n++] = e - r; B[n++] = o; r = e;
    }
  }
  for (let q = 0; q < n; q += 3) x.drawImage(src, sx, sy + B[q], w, B[q + 1], dx + B[q + 2], dy + B[q], w, B[q + 1]);
  if (over) {
    ex.globalCompositeOperation = 'destination-out';
    for (let q = 0; q < n; q += 3) ex.drawImage(src, sx, sy + B[q], w, B[q + 1], dx + B[q + 2], dy + B[q], w, B[q + 1]);
    ex.globalCompositeOperation = 'source-over';
  }
  if (ec) for (let q = 0; q < n; q += 3) ex.drawImage(ec, sx, sy + B[q], w, B[q + 1], dx + B[q + 2], dy + B[q], w, B[q + 1]);
}

// Does a sprite give off light anywhere (worked out once)?
function ugGlows(spr) {
  if (spr.glows === undefined) {
    const d = spr.ec.getContext('2d').getImageData(0, 0, spr.w, spr.h).data;
    spr.glows = false;
    for (let i = 3; i < d.length; i += 4) if (d[i]) { spr.glows = true; break; }
  }
  return spr.glows;
}

// A stand's row of stems.
function drawStandRow(it, ox, oy) {
  const U = View.ug;
  if (!U || !U.atlas) return;
  drawLeaning(U.atlas, null, it.sx, it.sy, it.w, it.h, it.bx0 + ox, it.by0 + oy, it.amp, false, it.over);
}
