'use strict';
// ---------------------------------------------------------------------------
// Rifts: tears in the world, where the star's fall cracked more than the
// ground. A site may hold one, likelier further along an expedition, above
// ground or below, and each changes the site round it:
//   graft      another place has bled through: a patch of another biome's
//              ground (a cave's under the sky, sunlit ground in a cave),
//              in one of its climes, with that biome's ore in it;
//   bloom      the rock round the tear has woken into ore, richer than the
//              site's own;
//   gate       two tears, one place: step into one and out of the other;
//   inversion  (underground) noon pours out of the tear and lights the dark.
// Standing at a tear (not a gate), SEAL closes it: a few seconds of
// standing still in a light everything nearby comes to see, for riftglass,
// which forges a piece a tier higher. What the rift changed stays changed.
// Placed from the dive's seed after the floor is made, so floor.js and its
// golden hashes don't know about them.
// ---------------------------------------------------------------------------

const RIFT_KINDS = {
  graft: { name: 'Graft' },
  bloom: { name: 'Ore wake' },
  gate: { name: 'Gate' },
  inversion: { name: 'Inversion' },
};

// A room for a tear: not the entry, a way on's, the lodeline's or an arena.
function riftRooms(f) {
  return f.rooms.slice(1).filter((r) => !r.arena && !(f.ways || []).some((w) => roomHas(r, w)) && !(f.pad && roomHas(r, f.pad)) && r.cells.length > 10);
}
// The open tile nearest a room's middle.
function riftSpot(f, r) {
  let best = null, bd = 1e9;
  for (const i of r.cells) {
    const x = i % f.w, y = Math.floor(i / f.w);
    if (f.tiles[i] !== TILE_FLOOR || hazardNear(f, x, y, 1)) continue;
    const m = (x - r.cx) * (x - r.cx) + (y - r.cy) * (y - r.cy);
    if (m < bd) { bd = m; best = { x, y }; }
  }
  return best;
}

function placeRift(d) {
  const f = d.floor, R = T.rifts;
  d.rift = null; f.graft = null; f.graftMask = null; f.riftShift = null;
  if (d.zone === 'lair' || d.hub) return;
  const rng = new Rng(hashInts(d.seed, d.depth, d.biome, 0x41f7));
  if (!rng.chance(R.chance[Math.min(R.chance.length, d.depth) - 1])) return;
  const rooms = riftRooms(f);
  if (!rooms.length) return;
  const kinds = Object.keys(R.kinds).filter((k) => !(k === 'inversion' && d.zone === 'surface') && !(k === 'gate' && rooms.length < 2));
  const kind = rng.weighted(kinds.map((k) => [R.kinds[k], k]));
  const room = rng.pick(rooms), at = riftSpot(f, room);
  if (!at) return;
  const rift = { kind, x: at.x, y: at.y, open: true, phase: rng.f(10) };
  if (kind === 'gate') {
    const other = rng.pick(rooms.filter((r) => r !== room)), to = riftSpot(f, other);
    if (!to) return;
    rift.pair = { x: to.x, y: to.y };
  }
  // what's near a tear is tinted by it
  f.riftShift = [{ x: at.x, y: at.y }].concat(rift.pair ? [rift.pair] : []);
  if (kind === 'graft') graftRift(d, rift, rng);
  if (kind === 'bloom') bloomRift(d, rift, rng);
  d.rift = rift;
}

// Rock beside open ground within r tiles of x, y, nearest first.
function riftWalls(f, x, y, r) {
  const out = [];
  for (let ty = Math.max(1, y - r); ty <= Math.min(f.h - 2, y + r); ty++)
    for (let tx = Math.max(1, x - r); tx <= Math.min(f.w - 2, x + r); tx++) {
      const i = ty * f.w + tx;
      if (f.tiles[i] !== TILE_ROCK || (tx - x) * (tx - x) + (ty - y) * (ty - y) > r * r) continue;
      if (DIRS4.some(([dx, dy]) => f.tiles[i + dy * f.w + dx] === TILE_FLOOR)) out.push(i);
    }
  return out.sort((a, b) => Math.hypot((a % f.w) - x, Math.floor(a / f.w) - y) - Math.hypot((b % f.w) - x, Math.floor(b / f.w) - y));
}

function graftRift(d, rift, rng) {
  const f = d.floor, R = T.rifts, other = rng.pick(T.biomes.map((b, i) => i).filter((i) => i !== d.biome));
  rift.biome = other;
  f.graft = { x: rift.x, y: rift.y, r: R.graftR, biome: other, sky: d.zone !== 'surface' };
  // a blob with a wandering edge, not a circle; tiles whose middle is in it
  // count as in it, for the ore
  f.graft.p1 = rng.f(7); f.graft.p2 = rng.f(7);
  const mask = (f.graftMask = new Uint8Array(f.w * f.h));
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (graftAt(f, (x + 0.5) * TILE, (y + 0.5) * TILE)) mask[y * f.w + x] = 1;
  const ores = T.biomes[other].ores.map((id) => ORE_INDEX[id] + 1);
  for (let i = 0; i < f.tiles.length; i++) if (f.tiles[i] === TILE_ORE && inGraft(f, i % f.w, Math.floor(i / f.w))) f.ore[i] = rng.pick(ores);
  for (const i of riftWalls(f, rift.x, rift.y, R.graftR - 1).slice(0, R.graftOre)) { f.tiles[i] = TILE_ORE; f.ore[i] = rng.pick(ores); }
  // and the country it came from: one of that side's climes (climes.js)
  f.graft.clime = rng.pick(climesOf(f.graft.sky ? 'surface' : 'cave'));
}

function bloomRift(d, rift, rng) {
  const f = d.floor, R = T.rifts, ores = T.biomes[d.biome].ores.map((id) => ORE_INDEX[id] + 1);
  const better = ores[ores.length - 1];
  for (const i of riftWalls(f, rift.x, rift.y, R.bloomR).slice(0, R.bloomOre)) { f.tiles[i] = TILE_ORE; f.ore[i] = rng.chance(R.bloomRich) ? better : ores[0]; }
}

function inGraft(f, x, y) { return !!(f.graftMask && x >= 0 && y >= 0 && x < f.w && y < f.h && f.graftMask[y * f.w + x]); }
// Is pixel x, y inside the graft's outline?
function graftAt(f, x, y) {
  const g = f.graft, cx = (g.x + 0.5) * TILE, cy = (g.y + 0.5) * TILE, a = Math.atan2(y - cy, x - cx);
  return Math.hypot(x - cx, y - cy) / TILE <= g.r - 0.5 + 1.1 * Math.sin(3 * a + g.p1) + 0.6 * Math.sin(5 * a + g.p2);
}

// How a tile looks: the floor's own, or while the graft is being painted,
// the graft's.
function tileArt(f, tx, ty) {
  if (f.graft && f.paintingGraft) {
    const id = T.biomes[f.graft.biome].id;
    return CLIME_ART[f.graft.clime] || (f.graft.sky ? ART.surface[id] : ART.biomes[id]);
  }
  return artBiome(f);
}

// Paints the graft over tiles tx0..tx1, ty0..ty1: those tiles painted again
// in the graft's look on a second buffer, then laid in pixel by pixel
// inside its outline, so the edge wanders through rock and ground alike.
function paintGraft(f, tx0, ty0, tx1, ty1) {
  const g = f.graft, P = View.floorBuf;
  if (!g || !P) return;
  const R = g.r + 2;
  tx0 = Math.max(0, tx0, g.x - R); ty0 = Math.max(0, ty0, g.y - R); tx1 = Math.min(f.w - 1, tx1, g.x + R); ty1 = Math.min(f.h - 1, ty1, g.y + R);
  if (tx0 > tx1 || ty0 > ty1) return;
  const Q = (View.graftBuf && View.graftBuf.w === P.w && View.graftBuf.h === P.h) ? View.graftBuf : (View.graftBuf = pixBuf(P.w, P.h));
  View.floorBuf = Q; f.paintingGraft = true;
  try { for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) paintTileArt(f, x, y); }
  finally { View.floorBuf = P; f.paintingGraft = false; }
  for (let y = ty0 * TILE; y < (ty1 + 1) * TILE; y++)
    for (let x = tx0 * TILE; x < (tx1 + 1) * TILE; x++) {
      if (!graftAt(f, x, y)) continue;
      const k = (y * P.w + x) * 4;
      for (let i = 0; i < 4; i++) { P.col[k + i] = Q.col[k + i]; P.em[k + i] = Q.em[k + i]; }
    }
}

// After painting (px x0..x1, y0..y1): the ground round an open tear washes
// violet in steps, with small clumps of the rift's colours here and there, and a graft's
// edge glows where the two places are stitched together.
function tintRift(f, x0, y0, x1, y1) {
  const P = View.floorBuf, S = RIFT_SHIFT;
  if (!P || (!f.riftShift && !f.graft)) return;
  const to = rgbOf(S.floorToward), edge = rgbOf(S.fringe[1]), fr = S.fringe.map(rgbOf), reach = T.rifts.tintR * TILE, dz = T.art.groundDither, fs = 2 * T.art.px;
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(P.w, x1); y1 = Math.min(P.h, y1);
  const gf = f.graft;
  // the graft's outline stays within its radius and a tile and a half of
  // wobble, so it's worked out once a pixel in a box round it; the tint
  // reaches only so far from a tear
  const gx = gf ? (gf.x + 0.5) * TILE : 0, gy = gf ? (gf.y + 0.5) * TILE : 0, gr = gf ? (gf.r + 2) * TILE : 0;
  const mx0 = Math.max(x0, Math.floor(gx - gr)), my0 = Math.max(y0, Math.floor(gy - gr));
  const mw = Math.max(0, Math.min(x1, Math.ceil(gx + gr)) + 2 - mx0), mh = Math.max(0, Math.min(y1, Math.ceil(gy + gr)) + 2 - my0);
  const inG = gf ? new Uint8Array(mw * mh) : null;
  if (gf) for (let j = 0; j < mh; j++) for (let i = 0; i < mw; i++) inG[j * mw + i] = graftAt(f, mx0 + i, my0 + j) ? 1 : 0;
  const gm = (x, y) => inG[(y - my0) * mw + x - mx0] === 1;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const k = (y * P.w + x) * 4, c = P.col, e = P.em;
      let t = 0;
      if (f.riftShift) for (const s of f.riftShift) { const dx = x - (s.x + 0.5) * TILE, dy = y - (s.y + 0.5) * TILE; if (dx < reach && dx > -reach && dy < reach && dy > -reach) t = Math.max(t, 1 - Math.hypot(dx, dy) / reach); }
      if (t > 0) {
        // the wash, in three hard steps, dithered only at their edges
        const a = Math.min(3, Math.floor(Math.min(1, t * 1.4) * 3 + 0.5 + (dz ? (bayerAt(x, y) - 0.5) * 0.5 : 0))) / 3 * S.amount;
        c[k] += (to[0] - c[k]) * a; c[k + 1] += (to[1] - c[k + 1]) * a; c[k + 2] += (to[2] - c[k + 2]) * a;
        // the fringe: small clumps of the rift's two colours, never lone pixels
        if (t > 0.2 && artNoise(x, y, fs, 0x41f8) > S.fringeCut) { const q = fr[artNoise(x, y, fs * 4, 0x41f9) > 0 ? 0 : 1]; c[k] = q[0]; c[k + 1] = q[1]; c[k + 2] = q[2]; e[k] = q[0]; e[k + 1] = q[1]; e[k + 2] = q[2]; e[k + 3] = 200; }
      }
      // the seam, on open ground only: in the rock it would draw the grid
      if (gf && Math.abs(x - gx) < gr && Math.abs(y - gy) < gr && !View.rockPx[y * P.w + x]) {
        const g = gm(x, y);
        if (gm(x + 1, y) !== g || gm(x, y + 1) !== g) {
          const lit = artNoise(x, y, fs, 0x5ea) > -0.35;
          c[k] += (edge[0] - c[k]) * 0.55; c[k + 1] += (edge[1] - c[k + 1]) * 0.55; c[k + 2] += (edge[2] - c[k + 2]) * 0.55;
          if (lit) { e[k] = edge[0]; e[k + 1] = edge[1]; e[k + 2] = edge[2]; e[k + 3] = 110; }
        }
      }
    }
}

// ---------------------------------------------------------------------------
// At a tear
// ---------------------------------------------------------------------------
function riftHere(d) {
  const r = d.rift;
  if (!r || !r.open) return null;
  const near = (t) => dist(d.p.x, d.p.y, (t.x + 0.5) * TILE, (t.y + 0.5) * TILE) < T.rifts.touch;
  if (near(r)) return r.pair ? { gate: r.pair } : { seal: true };
  if (r.pair && near(r.pair)) return { gate: r };
  return null;
}

function useRift(d) {
  const h = riftHere(d);
  if (!h) return;
  if (h.gate) {
    // through: out of the other tear, a step below it
    const p = d.p;
    spawnSparks(p.x, p.y - 6, [RIFT_PAL.riftedge[0], RIFT_PAL.riftcyan[0]], 14);
    p.x = (h.gate.x + 0.5) * TILE; p.y = (h.gate.y + 1.5) * TILE;
    if (bodyHits(d.floor, p.x, p.y, T.player.radius)) p.y = (h.gate.y + 0.5) * TILE;
    p.invuln = Math.max(p.invuln, 0.5);
    spawnSparks(p.x, p.y - 6, [RIFT_PAL.riftedge[0], RIFT_PAL.riftcyan[0]], 14);
    buzz(20);
    Story.say('riftGate');
  } else startChannel('seal');
}

function sealRift() {
  const d = Game.dive, r = d.rift;
  if (!r || !r.open) return;
  r.open = false;
  d.floor.riftShift = null;
  tallySeal(d);
  if (View.floorFor === d.floor) { const x0 = (r.x - 6) * TILE, y0 = (r.y - 6) * TILE; for (let y = r.y - 6; y <= r.y + 6; y++) for (let x = r.x - 6; x <= r.x + 6; x++) if (x >= 0 && y >= 0 && x < d.floor.w && y < d.floor.h) paintTileArt(d.floor, x, y); paintGraft(d.floor, r.x - 6, r.y - 6, r.x + 6, r.y + 6); tintRift(d.floor, x0, y0, x0 + 13 * TILE, y0 + 13 * TILE); View.floorCol.getContext('2d').putImageData(View.floorImgs[0], 0, 0); View.floorEm.getContext('2d').putImageData(View.floorImgs[1], 0, 0); }
  const cx = (r.x + 0.5) * TILE, cy = (r.y + 0.5) * TILE, n = d.rng.i(T.rifts.glass[0], T.rifts.glass[1]) + riftTouchedAlive(d);
  for (let k = 0; k < n; k++) d.drops.push({ x: cx + d.rng.f(-6, 6), y: cy + d.rng.f(-4, 4), t: 0, exotic: 'riftglass', home: true });
  for (const e of d.enemies) if (!e.dead && dist(e.x, e.y, cx, cy) < T.leave.noise) wake(d, e);
  spawnSparks(cx, cy - 10, [RIFT_PAL.riftedge[0], RIFT_PAL.riftcyan[0], '#ffffff'], 30);
  UI.toast('The tear closes', 'legendary');
  Story.say('riftSealed');
  buzz(40);
}

// On arriving at a site with a tear: Wick, the first time each kind is met.
function noticeRift(d) {
  if (!d.rift) return;
  Story.say('rift');
  Story.say('rift_' + d.rift.kind);
}

// ---------------------------------------------------------------------------
// Drawn among the actors
// ---------------------------------------------------------------------------
const _riftSprites = [];
function riftSprite(k) {
  if (!_riftSprites[k]) _riftSprites[k] = buildArtSprite(RIFT_ROWS[k], RIFT_PAL, RIFT_LETTERS, RIFT_GLOWS);
  return _riftSprites[k];
}

// The tears on the floor, as props sorted with the actors.
function riftProps(d) {
  const r = d.rift;
  if (!r || !r.open) return [];
  return [{ tear: r, at: r, y: (r.y + 0.5) * TILE + 2 }].concat(r.pair ? [{ tear: r, at: r.pair, y: (r.pair.y + 0.5) * TILE + 2 }] : []);
}

function drawRift(d, a, ox, oy, lights) {
  const r = a.tear, t = a.at, k = Math.floor(Game.realT * 6 + r.phase) % RIFT_ROWS.length, spr = riftSprite(k);
  const x = Math.round((t.x + 0.5) * TILE + ox - spr.w / 2), y = Math.round((t.y + 0.5) * TILE + oy - spr.h + 4 + Math.sin(Game.realT * 2 + r.phase) * 1.5);
  drawArtSprite(spr, x, y);
  const cx = x + spr.w / 2, cy = y + spr.h / 2, pulse = 0.8 + 0.2 * Math.sin(Game.realT * 3 + r.phase);
  // motes drifting out of it
  for (let i = 0; i < 6; i++) {
    const ph = (Game.realT * 0.7 + i / 6 + r.phase) % 1, ang = i * 2.1 + r.phase;
    dot(Math.round(cx + Math.cos(ang) * ph * 16), Math.round(cy + Math.sin(ang) * ph * 10 - ph * 6), i % 2 ? RIFT_PAL.riftcyan[0] : RIFT_PAL.riftedge[0], true, 1 - ph);
  }
  const surf = d.zone === 'surface';
  lights.push({ x: cx, y: cy, r: TILE * 3, i: (surf ? 0.6 : 1.3) * pulse, c: rgb01(RIFT_SHIFT.light) });
  if (r.kind === 'inversion' && t === r) lights.push({ x: cx, y: cy, r: TILE * T.rifts.inversionR, i: 1.4, c: [1.0, 0.95, 0.85] });
}

// A graft from under the sky lets its daylight down with it.
function graftLight(d, ox, oy, lights) {
  const g = d.floor.graft;
  if (g && g.sky) lights.push({ x: (g.x + 0.5) * TILE + ox, y: (g.y + 0.5) * TILE + oy, r: TILE * (g.r + 1), i: 1.3, c: [1.0, 0.92, 0.8] });
}
