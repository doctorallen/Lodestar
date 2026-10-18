'use strict';
// ---------------------------------------------------------------------------
// Each clime's one hazard, at play (placed with the floor: floor.js
// placeHazards). A small set, shared between climes in their own colours:
//   pool    water, brine or mud: walkers wade through it slowly;
//   slick   ice: the diver's footing slides, so a step carries on;
//   burn    lava: it burns whatever walks in it;
//   vent    a vent glows, then bursts with fire or steam;
//   spores  a pod swells, then lets go a cloud that drifts and stings.
// All of them are mild and shown before they bite, and a dash crosses any
// of them unharmed. Also here: how a clime paints its ground (its hazard
// and its decor), and the hazards' lights and moving parts.
// ---------------------------------------------------------------------------

// Is there a hazard on tile tx, ty, or within r tiles of it?
function hazardNear(f, tx, ty, r) {
  if (f.haz) for (let y = ty - r; y <= ty + r; y++) for (let x = tx - r; x <= tx + r; x++) if (x >= 0 && y >= 0 && x < f.w && y < f.h && f.haz[y * f.w + x]) return true;
  if (f.hazPts) for (const p of f.hazPts) if (Math.abs(p.x - tx) <= r && Math.abs(p.y - ty) <= r) return true;
  return false;
}

// Does this enemy walk (rather than fly, or stand rooted)?
const hazardWalker = (e) => e.type !== 'wisp' && e.type !== 'hollow' && !T.enemies[e.type].rooted;

// How fast an enemy goes for the ground it's on: slower wading.
function hazardSlow(f, e) {
  if (f.hazCode !== HAZ_CODES.pool || !hazardWalker(e)) return 1;
  return hazardAt(f, e.x, e.y) ? T.hazards.pool.slow : 1;
}

// The diver's step at vx, vy px/s: a pool slows it, and on ice the footing
// follows the stick only slowly, so a step carries on (until a wall stops
// it).
function stepDiver(d, p, vx, vy, dt) {
  const f = d.floor, k = f.haz ? hazardAt(f, p.x, p.y) : 0;
  if (k === HAZ_CODES.pool) { vx *= T.hazards.pool.slow; vy *= T.hazards.pool.slow; }
  if (k === HAZ_CODES.slick) {
    const g = 1 - Math.exp(-T.hazards.slick.grip * dt);
    p.vx = (p.vx || 0) + (vx - (p.vx || 0)) * g; p.vy = (p.vy || 0) + (vy - (p.vy || 0)) * g;
    if (Math.hypot(p.vx, p.vy) < 2 && !vx && !vy) p.vx = p.vy = 0;
  } else { p.vx = vx; p.vy = vy; }
  d.wading = k;
  if (!p.vx && !p.vy) return;
  const x0 = p.x, y0 = p.y;
  moveBody(f, p, p.vx * dt, p.vy * dt, T.player.radius);
  if (k === HAZ_CODES.slick) { p.vx = (p.x - x0) / dt; p.vy = (p.y - y0) / dt; }
}

// The first time each is met, Wick's word on it.
const HAZARD_TIPS = {
  pool: 'Water slows you: wade, or dash through',
  slick: 'Ice: your footing slides',
  burn: 'Lava burns: walk round it, or dash across',
  vent: 'A vent glows before it bursts: step away',
  spores: 'Spore clouds sting: step out of them, or dash through',
};

// Hurt that eats at the diver without the flinch of a blow (as spores do),
// with a number now and then.
function hazardDrain(d, n) {
  const p = d.p;
  p.hp -= n * T.items.armorK / (T.items.armorK + d.stats.armor);
  p.restT = 0;
  d.hazHurt = (d.hazHurt || 0) + n;
  if ((d.hazNumT = (d.hazNumT || 0) - 1 / 60) <= 0 && d.hazHurt >= 1) { d.hazNumT = 0.5; d.nums.push({ x: p.x, y: p.y - 22, v: Math.round(d.hazHurt), t: 0.6, hurt: true }); d.hazHurt = 0; }
  if (p.hp <= 0) { p.hp = 0; startDying(); }
}

function updateHazards(d, dt) {
  const f = d.floor, kind = f.hazKind, p = d.p, H = T.hazards;
  if (!kind || d.hub) return;
  d.hazT = (d.hazT || 0) + dt;
  const open = !d.dying && p.invuln <= 0 && p.dashT <= 0;
  if (f.haz && hazardAt(f, p.x, p.y) && HAZARD_TIPS[kind]) UI.tip('haz_' + kind, HAZARD_TIPS[kind]);
  if (kind === 'burn') {
    if (open && hazardAt(f, p.x, p.y)) { hazardDrain(d, H.burn.dps * dt); if (Math.random() < dt * 10) spawnSparks(p.x, p.y - 2, ['#ff8a20', '#ffd060'], 1); }
    for (const e of d.enemies) if (!e.dead && hazardWalker(e) && hazardAt(f, e.x, e.y) && !(e.burn && e.burn.t > 0.3)) e.burn = { t: 0.6, dps: H.burn.dps };
  } else if (kind === 'vent') {
    const V = H.vent;
    for (const v of f.hazPts) {
      const s = ventPhase(d, v), bursting = s >= V.every - V.burst;
      if (bursting && !v.fired) {
        v.fired = true;
        const x = (v.x + 0.5) * TILE, y = (v.y + 0.5) * TILE;
        if (open && dist(x, y, p.x, p.y) < V.r + T.player.radius) hurtPlayer(V.dmg, v);
        for (const e of d.enemies) if (!e.dead && hazardWalker(e) && dist(x, y, e.x, e.y) < V.r + e.r) e.burn = { t: 1, dps: V.dmg };
      } else if (!bursting) v.fired = false;
    }
  } else if (kind === 'spores') {
    const S = Object.assign({}, H.spores, T.climes[f.clime].haz);
    const clouds = (d.clouds = d.clouds || []), wind = (d.life && d.life.wind) || { x: 0.8, y: 0.3 };
    for (const v of f.hazPts) {
      const s = (d.hazT / S.every + v.ph) % 1;
      if (v.last !== undefined && s < v.last && dist((v.x + 0.5) * TILE, (v.y + 0.5) * TILE, p.x, p.y) < 14 * TILE)
        clouds.push({ x: (v.x + 0.5) * TILE, y: (v.y + 0.5) * TILE - 5, t: 0, life: S.life, r: S.r, seed: Math.random() * 99 });
      v.last = s;
    }
    let inside = false;
    for (const c of clouds) {
      c.t += dt;
      c.x += (wind.x * S.drift + Math.sin(c.t * 0.7 + c.seed) * 3) * dt; c.y += (wind.y * S.drift + Math.cos(c.t * 0.5 + c.seed) * 2) * dt;
      if (dist(c.x, c.y, p.x, p.y - 4) < sporeR(c)) inside = true;
    }
    d.clouds = clouds.filter((c) => c.t < c.life);
    if (inside) { UI.tip('haz_spores', HAZARD_TIPS.spores); if (open) hazardDrain(d, S.dps * dt); }
  }
}

// Seconds into a vent's cycle.
function ventPhase(d, v) { const V = T.hazards.vent; return ((d.hazT || 0) / V.every + v.ph) % 1 * V.every; }
// A spore cloud's reach as it swells and thins.
function sporeR(c) { return c.r * Math.min(1, 0.4 + c.t * 0.8) * Math.min(1, (c.life - c.t) * 0.6 + 0.3); }

// ---------------------------------------------------------------------------
// Painting a clime's ground: its hazard's pools, ice or lava, the bases of
// its vents, and its decor, into the floor's pixels (render.js
// paintTileArt, after the tile itself).
// ---------------------------------------------------------------------------
const HAZ_RAMPS = { pool: ['#0a2232', '#103248', '#18465f', '#6aa6c8'], slick: ['#6f90ba', '#86a7cf', '#a2c0e2', '#eef8ff'], burn: ['#801808', '#d4420c', '#ff8c20', '#ffd860'] };

function paintClimeTile(P, f, tx, ty, ox, oy, b) {
  const R = View.rockPx, W = P.w;
  if (!R || floorTile(f, tx, ty) === TILE_PIT) return;
  // in a wall's shadow (or under the sky, a mesa's): left dark
  const shaded = (x, y) => R[(y - 1) * W + x] || R[(y - 2) * W + x] || R[(y - 3) * W + x] || (b.sun && (R[(y - 4) * W + x - 3] || R[(y - 7) * W + x - 5]));
  let near = false;
  if (f.haz) for (let y = ty - 1; y <= ty + 1 && !near; y++) for (let x = tx - 1; x <= tx + 1; x++) if (x >= 0 && y >= 0 && x < f.w && y < f.h && f.haz[y * f.w + x]) { near = true; break; }
  if (near) paintHazardPixels(P, f, ox, oy, b, shaded);
  const t = floorTile(f, tx, ty);
  if (t === TILE_ROCK && b.rockDecor === 'roots') paintRootRock(P, ox, oy);
  if (t !== TILE_FLOOR) return;
  const pt = f.hazPts && f.hazPts.find((v) => v.x === tx && v.y === ty);
  if (pt && f.hazKind === 'vent') paintVent(P, ox + 8, oy + 8, b);
  else if (pt && f.hazKind === 'spores') paintPodBed(P, ox + 8, oy + 9, b);
  else if (b.decor && !(f.haz && f.haz[ty * f.w + tx])) paintDecor(P, f, tx, ty, ox, oy, b, shaded);
}

function paintHazardPixels(P, f, ox, oy, b, shaded) {
  const R = View.rockPx, W = P.w, kind = f.hazKind, r = b.haz || HAZ_RAMPS[kind], lava = kind === 'burn', ice = kind === 'slick';
  const at = (x, y) => hazardAt(f, x + 0.5, y + 0.5) !== 0;
  for (let y = oy; y < oy + TILE; y++)
    for (let x = ox; x < ox + TILE; x++) {
      if (R[y * W + x] || !at(x, y)) continue;
      const edge = !at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1);
      const inner = !edge && (!at(x - 2, y) || !at(x + 2, y) || !at(x, y - 2) || !at(x, y + 2));
      const deep = at(x - 4, y) && at(x + 4, y) && at(x, y - 4) && at(x, y + 4);
      // tone comes in clusters (smooth noise), never pixel by pixel
      const n = wallNoise(x * 1.3 + 17, y * 2 + 5, 6), dark = shaded(x, y);
      let c, glow = false;
      if (lava) {
        // a dark crust at the edge, then molten: mostly orange, cooler skin
        // drifting on it, the hottest yellow only in the deepest middle
        if (edge) c = '#2a0a10';
        else if (n > 0.3) c = r[0];
        else { c = r[deep && n < -0.25 ? 3 : deep || n < -0.1 ? 2 : 1]; glow = c !== r[1]; }
      } else if (ice) {
        // glassy, a little lighter in patches, streaked where light runs on it
        c = edge || dark ? r[0] : r[n > 0.15 ? 2 : 1];
        if (!edge && !dark && (x * 2 + y) % 13 < 2 && n > -0.3) c = r[3];
      } else {
        // still water: a wet rim, a band of shallows, darker where it's deep,
        // the odd line of ripple
        if (edge) { c = r[3]; glow = !!b.rimGlow; }
        else if (dark) c = r[0];
        else c = inner ? r[2] : deep ? r[0] : r[1];
        if (!edge && !inner && !dark && y % 6 === 0 && n > 0.25) c = r[2];
      }
      putPx(P, x, y, c, glow);
    }
}

// A vent: a ring of dark stone round a black throat, fire showing in it;
// or under the Vault, a round brass grate.
function paintVent(P, cx, cy, b) {
  const steam = b.vent === 'steam';
  for (let j = -5; j <= 5; j++)
    for (let i = -6; i <= 6; i++) {
      const e = (i * i) / 36 + (j * j) / 20;
      if (e > 1) continue;
      let c;
      if (steam) c = e > 0.65 ? (j < 0 ? '#b88a48' : '#5a4020') : (i % 2 === 0 ? '#1a120a' : '#7a5a2a');
      else c = e > 0.7 ? (j < 0 ? b.front[2] : b.front[0]) : e > 0.4 ? '#140c0a' : '#0a0606';
      putPx(P, cx + i, cy + j, c);
    }
  if (!steam) for (const [i, j] of [[0, 0], [-1, 0], [0, 1], [1, 0]]) putPx(P, cx + i, cy + j, '#6a1a08', true);
}

// The bed a spore pod grows from.
function paintPodBed(P, cx, cy, b) {
  for (let j = -3; j <= 3; j++) for (let i = -6; i <= 6; i++) if ((i * i) / 36 + (j * j) / 9 <= 1) putPx(P, cx + i, cy + j, (i + j) % 3 ? b.front[0] : b.rock[2]);
}

// Rock woven of old roots (Rootdeep): strands wandering over the rock's
// top and down its face, lighter than the rock and darker than the floor,
// so walls still read as walls.
function paintRootRock(P, ox, oy) {
  const R = View.rockPx, W = P.w;
  for (let y = oy; y < oy + TILE; y++)
    for (let x = ox; x < ox + TILE; x++) {
      if (!R[y * W + x]) continue;
      const top = R[(y + FACE_H) * W + x] && R[(y - 1) * W + x] && R[y * W + x - 1] && R[y * W + x + 1];
      const a = Math.abs(wallNoise(x * 0.7, y * 1.4, 9)), c = Math.abs(wallNoise(x * 1.4 + 70, y * 0.6, 8));
      if (top) { if (a < 0.07) putPx(P, x, y, a < 0.035 ? '#2a2016' : '#1c140e'); else if (c < 0.05) putPx(P, x, y, '#1a120c'); }
      else if (!R[(y + 1) * W + x] || !R[(y + 2) * W + x] || !R[(y + 3) * W + x] || !R[(y + 4) * W + x] || !R[(y + 5) * W + x]) { if (Math.abs(wallNoise(x * 1.8, y * 0.3, 6)) < 0.09) putPx(P, x, y, '#5a4430'); }
    }
}

// A clime's marks on its open ground, here and there: always in small
// clusters, never lone pixels.
function paintDecor(P, f, tx, ty, ox, oy, b, shaded) {
  const R = View.rockPx, W = P.w, rnd = (k) => (hashInts(f.seed, tx, ty, k) & 1023) / 1023;
  const put = (x, y, c, glow) => { if (x >= ox && y >= oy && x < ox + TILE && y < oy + TILE && !R[y * W + x] && !shaded(x, y)) putPx(P, x, y, c, glow); };
  // a little clump: pixels round x, y (offsets), each in one of the colours
  const clump = (x, y, pts, cols, glow) => pts.forEach(([i, j], n) => put(x + i, y + j, cols[n % cols.length], glow));
  const at = (k, lo, span) => lo + Math.floor(rnd(k) * span);
  const walk = (k, len, c, glow, under) => {
    let x = ox + at(k, 2, 12), y = oy + at(k + 1, 2, 12);
    for (let n = 0; n < len; n++) {
      put(x, y, c, glow); if (under) put(x, y + 1, under);
      x += rnd(k + 2 + n) < 0.5 ? 1 : -1;
      if (rnd(k + 40 + n) < 0.4) y += rnd(k + 80 + n) < 0.5 ? 1 : -1;
    }
  };
  const BLOB = [[0, 0], [1, 0], [-1, 0], [0, -1], [1, -1], [0, 1], [2, 0]], TRI = [[0, 0], [1, 0], [0, 1]], FLOWER = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]];
  const d = b.decor;
  if (d === 'drifts') {
    // wind-carved ripples in the snow, each with its shadowed lee
    for (let k = 0; k < 2; k++) if (rnd(k) < 0.5) { const x = ox + at(k + 5, 0, 11), y = oy + at(k + 9, 1, 13), n = 4 + at(k + 13, 0, 4); for (let i = 0; i < n; i++) put(x + i, y, '#e8e4e0'); for (let i = 1; i < n; i++) put(x + i, y + 1, b.floor[0]); }
    if (rnd(30) < 0.08) clump(ox + at(31, 4, 8), oy + at(32, 4, 8), [[0, 0], [1, 0], [0, 1], [1, 1], [2, 1]], ['#3a3c58', '#2a2a44', '#2a2a44', '#1e1e36', '#1e1e36']);
  } else if (d === 'fissures') {
    // cracks in the ash with fire under them (dim: never ore-bright)
    if (rnd(0) < 0.16) walk(10, 6 + at(1, 0, 5), '#9a3418', true, '#1a1014');
    if (rnd(2) < 0.2) clump(ox + at(3, 2, 12), oy + at(4, 2, 12), TRI, ['#58483e', '#241c22', '#241c22']);
  } else if (d === 'moss') {
    for (let k = 0; k < 2; k++) if (rnd(k) < 0.45) clump(ox + at(k + 5, 2, 11), oy + at(k + 9, 2, 11), BLOB, ['#64803c', '#4c6630', '#4c6630', '#64803c', '#34442a', '#34442a', '#4c6630']);
    if (rnd(30) < 0.12) clump(ox + at(31, 3, 10), oy + at(32, 3, 10), FLOWER, [rnd(33) < 0.5 ? '#f4e8a8' : '#ecb8f0', '#d8c0e8', '#d8c0e8', '#d8c0e8', '#3a4a28']);
    if (rnd(34) < 0.07) { const x = ox + at(35, 3, 7), y = oy + at(36, 4, 7); for (let j = 0; j < 2; j++) for (let i = 0; i < 5 - j * 2; i++) put(x + i + j, y + j, '#26202c'); }
  } else if (d === 'algae') {
    if (rnd(0) < 0.2) clump(ox + at(1, 3, 10), oy + at(7, 3, 10), [[0, 0], [1, 0], [1, 1], [3, 1], [4, 1]], ['#3a52c8', '#2a3c98'], true);
    if (rnd(20) < 0.25) { const x = ox + at(21, 0, 12), y = oy + at(22, 0, 15); for (let i = 0; i < 4; i++) put(x + i, y, '#4a5070'); }
  } else if (d === 'cracks') {
    if (rnd(0) < 0.12) walk(10, 5 + at(1, 0, 5), '#5a1406', true, '#0e080c');
    if (rnd(2) < 0.18) clump(ox + at(3, 2, 12), oy + at(4, 2, 12), TRI, ['#3e3236', '#1a1218', '#1a1218']);
  } else if (d === 'roots') {
    if (rnd(0) < 0.3) walk(10, 9 + at(1, 0, 6), '#5e4a30', false, '#22180e');
    if (rnd(2) < 0.18) clump(ox + at(3, 2, 12), oy + at(4, 2, 12), BLOB, ['#4a5a28', '#34401e']);
  } else if (d === 'overgrowth') {
    // moss creeping along the flagstones' seams in runs, and leaf litter
    for (let y = oy; y < oy + TILE; y++) for (let x = ox; x < ox + TILE; x++) if ((y % 9 === 0 || (x + ((y / 9) | 0) * 5) % 11 === 0) && wallNoise(x + 3, y + 9, 5) > 0.15) put(x, y, wallNoise(x, y, 3) > 0.3 ? '#4a6a34' : '#2e4a26');
    if (rnd(10) < 0.2) clump(ox + at(11, 3, 10), oy + at(17, 3, 10), BLOB, ['#6a6a30', '#4a5a28', '#4a5a28', '#6a6a30', '#2e3a1e']);
  } else if (d === 'plates') {
    // floor plates: dark seams on the tile lines, a rivet in each corner,
    // and now and then a gear set into the floor
    for (let i = 0; i < TILE; i++) { put(ox + i, oy, '#16110c'); put(ox, oy + i, '#16110c'); put(ox + i, oy + 1, b.floor[2]); }
    for (const [i, j] of [[2, 3], [13, 3], [2, 13], [13, 13]]) { put(ox + i, oy + j, '#9a7840'); put(ox + i, oy + j + 1, '#3a2a14'); }
    if (rnd(0) < 0.1) for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2, rr = k % 3 === 0 ? 4.5 : 3.5; put(Math.round(ox + 8 + Math.cos(a) * rr), Math.round(oy + 8 + Math.sin(a) * rr * 0.8), '#7a5a2a'); }
  }
}

// The fixed lights of a clime's ground: lava's glow, and the vents' and
// pods' faint ones.
function hazardLights(f) {
  const out = [];
  if (f.hazKind === 'burn' && f.haz) for (let i = 0; i < f.haz.length; i++) if (f.haz[i]) out.push({ x: (i % f.w + 0.5) * TILE, y: (Math.floor(i / f.w) + 0.5) * TILE, r: TILE * 1.4, i: 0.3, c: [1, 0.45, 0.15] });
  if (f.hazPts) {
    const b = artBiome(f), col = f.hazKind === 'vent' ? (b.vent === 'steam' ? [0.8, 0.85, 0.9] : [1, 0.4, 0.15]) : rgb01((SPORE_COLS[f.clime] || SPORE_COLS.bloomfen)[0]);
    for (const v of f.hazPts) out.push({ x: (v.x + 0.5) * TILE, y: (v.y + 0.5) * TILE, r: TILE * 0.9, i: 0.25, c: col });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Drawn each frame: what moves on the ground (under the actors), and the
// spore clouds in the air (over them).
// ---------------------------------------------------------------------------
const HazRipples = [];
function drawHazardsUnder(d, ox, oy, tick, lights) {
  const f = d.floor, kind = f.hazKind, p = d.p;
  if (!kind) return;
  const tx0 = Math.max(0, Math.floor(-ox / TILE) - 1), ty0 = Math.max(0, Math.floor(-oy / TILE) - 1);
  const tx1 = Math.min(f.w - 1, tx0 + Math.ceil(View.w / TILE) + 2), ty1 = Math.min(f.h - 1, ty0 + Math.ceil(View.h / TILE) + 2);
  const b = artBiome(f), r = b.haz || HAZ_RAMPS[kind];
  if (f.haz) {
    for (let ty = ty0; ty <= ty1; ty++)
      for (let tx = tx0; tx <= tx1; tx++) {
        if (!f.haz[ty * f.w + tx]) continue;
        const h = hashInts(tx, ty, 0x6a2), ph = (Game.realT * (kind === 'burn' ? 0.5 : 0.3) + (h & 255) / 255) % 1;
        const x = tx * TILE + ox + 3 + ((h >> 8) % 10), y = ty * TILE + oy + 3 + ((h >> 12) % 10);
        if (!hazardAt(f, x - ox, y - oy)) continue;
        if (kind === 'burn') {
          // a bubble swells and pops, a spark lifting off it
          if (ph < 0.3) { const k = ph / 0.3; dot(x, y, r[3], true, k); if (k > 0.5) for (const [i, j] of [[-1, 0], [1, 0], [0, -1]]) dot(x + i, y + j, r[2], true, k); }
          else if (ph < 0.45) dot(x, Math.round(y - (ph - 0.3) * 60), '#ffd860', true, 1 - (ph - 0.3) / 0.15);
        } else if (ph < 0.12) {
          // a glint on water or ice
          const k = ph < 0.06 ? ph / 0.06 : (0.12 - ph) / 0.06;
          dot(x, y, r[3], kind === 'slick', k);
          if (kind === 'slick' && k > 0.6) for (const [i, j] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) dot(x + i, y + j, '#ffffff', true, k * 0.5);
          else if (kind === 'pool') { dot(x - 1, y, r[3], false, k * 0.6); dot(x + 1, y, r[3], false, k * 0.6); }
        }
      }
    // wading leaves rings on the water
    if (kind === 'pool' && d.wading && (Math.abs(p.vx || 0) + Math.abs(p.vy || 0)) > 5 && (d.rippleT = (d.rippleT || 0) - 1 / 60) <= 0) { d.rippleT = 0.28; HazRipples.push({ x: p.x, y: p.y, t: 0 }); }
  }
  for (let n = HazRipples.length - 1; n >= 0; n--) {
    const q = HazRipples[n];
    q.t += 1 / 60;
    if (q.t > 0.8 || HazRipples.length > 12) { HazRipples.splice(n, 1); continue; }
    const rr = 3 + q.t * 12, k = 1 - q.t / 0.8;
    for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2, x = q.x + Math.cos(a) * rr, y = q.y + Math.sin(a) * rr * 0.45; if (hazardAt(f, x, y)) dot(Math.round(x + ox), Math.round(y + oy), r[3], false, 0.7 * k); }
  }
  if (!f.hazPts) return;
  const V = T.hazards.vent, steam = b.vent === 'steam', vc = VENT_COLS[steam ? 'steam' : 'fire'];
  for (const v of f.hazPts) {
    const cx = (v.x + 0.5) * TILE + ox, cy = (v.y + 0.5) * TILE + oy;
    if (cx < -30 || cy < -40 || cx > View.w + 30 || cy > View.h + 30) continue;
    if (kind === 'vent') {
      const s = ventPhase(d, v), tellAt = V.every - V.burst - V.tell;
      if (s >= V.every - V.burst) {
        // the burst: a column of fire or steam
        const k = (s - (V.every - V.burst)) / V.burst;
        for (let n = 0; n < 26; n++) {
          const u = ((n * 0.37 + Game.realT * 3) % 1), y = cy - u * 22 * (1 - k * 0.3), x = cx + Math.sin(n * 1.7 + Game.realT * 9) * (2 + u * 4);
          dot(Math.round(x), Math.round(y), vc[u < 0.25 ? 0 : u < 0.65 ? 1 : 2], !steam || u < 0.3, 1 - u * 0.6);
        }
        ringDots(Math.round(cx), Math.round(cy), V.r, vc[1], 0.5 * (1 - k), true);
        lights.push({ x: cx, y: cy - 8, r: TILE * 2.2, i: steam ? 0.7 : 1.1, c: steam ? [0.9, 0.95, 1] : [1, 0.5, 0.2] });
      } else if (s >= tellAt) {
        // the tell: the throat glows brighter, the reach shows, smoke rises
        const k = (s - tellAt) / V.tell;
        for (const [i, j] of [[0, 0], [-1, 0], [0, 1], [1, 0], [0, -1], [-1, 1], [1, 1]]) dot(Math.round(cx + i), Math.round(cy + j), vc[k > 0.6 ? 0 : 1], true, 0.4 + 0.6 * k);
        ringDots(Math.round(cx), Math.round(cy), V.r, vc[1], (tick % 2 ? 0.55 : 0.3) * k, true);
        for (let n = 0; n < 4; n++) { const u = (Game.realT * 0.8 + n / 4) % 1; dot(Math.round(cx + Math.sin(n * 2 + Game.realT * 2) * 3), Math.round(cy - 2 - u * 12), steam ? '#c8d4dc' : '#5a4a46', false, (1 - u) * k); }
        lights.push({ x: cx, y: cy, r: TILE * 1.2, i: 0.5 * k, c: steam ? [0.9, 0.95, 1] : [1, 0.45, 0.2] });
      } else if (!steam && tick % 4 === 0) dot(Math.round(cx), Math.round(cy), vc[2], true, 0.6);
    } else if (kind === 'spores') {
      // a pod on a stalk, swelling and glowing as it gets ready to let go
      const S = Object.assign({}, T.hazards.spores, T.climes[f.clime].haz), s = (d.hazT / S.every + v.ph) % 1;
      const col = SPORE_COLS[f.clime] || SPORE_COLS.bloomfen, sw = s > 0.7 ? (s - 0.7) / 0.3 : 0, rr = 3.6 + sw * 1.6, x = Math.round(cx), y = Math.round(cy - 7);
      for (let j = 2; j <= 6; j++) { dot(x, y + j, '#3a3020'); dot(x + 1, y + j, '#1e1810'); }
      for (let j = -6; j <= 6; j++) for (let i = -6; i <= 6; i++) {
        const e = (i * i + j * j * 1.15) / (rr * rr);
        if (e > 1.35) continue;
        // an outline, a dim rim, the bright body, a highlight up and left
        const c = e > 1 ? '#140e18' : e > 0.62 ? col[1] : (i < 0 && j < 0 && e < 0.3) ? '#fff8f0' : col[0];
        dot(x + i, y + j, c, sw > 0.5 && e <= 0.62 && e > 0.3, 1);
      }
      if (sw > 0) lights.push({ x, y, r: TILE * (0.8 + sw), i: 0.3 * sw, c: rgb01(col[0]) });
    }
  }
}

function drawHazardsAir(d, ox, oy, lights) {
  if (!d.clouds || !d.clouds.length) return;
  const col = SPORE_COLS[d.floor.clime] || SPORE_COLS.bloomfen;
  for (const c of d.clouds) {
    const cx = c.x + ox, cy = c.y + oy, R = sporeR(c);
    if (cx < -R || cy < -R || cx > View.w + R || cy > View.h + R) continue;
    const a = Math.min(1, c.t * 1.5, (c.life - c.t) * 0.8);
    // a soft ball of motes, turning slowly
    for (let n = 0; n < 34; n++) {
      const ang = n * 2.399 + c.t * (n % 2 ? 0.6 : -0.4) + c.seed, rr = R * Math.sqrt(((n * 7) % 34) / 34);
      dot(Math.round(cx + Math.cos(ang) * rr), Math.round(cy + Math.sin(ang) * rr * 0.75), n % 3 ? col[1] : col[0], n % 3 === 0, a * (n % 3 ? 0.45 : 0.75));
    }
    lights.push({ x: cx, y: cy, r: R * 1.3, i: 0.2 * a, c: rgb01(col[0]) });
  }
}
