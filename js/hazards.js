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
      const deep = at(x - 3, y) && at(x + 3, y) && at(x, y - 3) && at(x, y + 3);
      const t = bayerAt(x, y), h = (hashInts(x, y, 0x4a2) & 255) / 255, dark = shaded(x, y);
      let c, glow = false;
      if (lava) {
        // a dark crust at the edge, then molten; cooler skin drifts on it
        const skin = wallNoise(x + 17, y * 1.6, 5);
        if (edge) c = '#2a0a06';
        else if (skin > 0.35) c = r[0];
        else { c = r[deep ? (skin < -0.3 ? 3 : 2) : 1]; glow = true; }
        if (!edge && skin <= 0.35 && h < 0.04) c = r[3];
        glow = glow || (!edge && skin > 0.35 && t < 0.5);
      } else if (ice) {
        // glassy, with streaks of light running across it
        c = edge ? r[0] : dark ? r[0] : r[(t + h * 0.6 > 0.9) ? 2 : 1];
        if (!edge && !dark && ((x * 2 + y) % 11 === 0) && h < 0.7) c = r[3];
      } else {
        // still water: a wet rim, darker where it's deep, ripples of light
        if (edge) c = t < 0.6 ? r[3] : r[2];
        else if (dark) c = r[0];
        else c = deep ? r[t < 0.75 ? 0 : 1] : r[t < 0.5 ? 1 : 2];
        if (!edge && !dark && (y % 5 === 0) && ((x + (y * 3)) % 9) < 3 && h < 0.5) c = r[2];
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

// A clime's marks on its open ground, here and there.
function paintDecor(P, f, tx, ty, ox, oy, b, shaded) {
  const R = View.rockPx, W = P.w, rnd = (k) => (hashInts(f.seed, tx, ty, k) & 1023) / 1023;
  const put = (x, y, c, glow) => { if (x >= ox && y >= oy && x < ox + TILE && y < oy + TILE && !R[y * W + x] && !shaded(x, y)) putPx(P, x, y, c, glow); };
  const walk = (k, len, c, glow, thick) => {
    let x = ox + 2 + Math.floor(rnd(k) * 12), y = oy + 2 + Math.floor(rnd(k + 1) * 12);
    for (let n = 0; n < len; n++) {
      put(x, y, c, glow); if (thick) put(x, y + 1, thick);
      const r = rnd(k + 2 + n);
      if (r < 0.45) x++; else if (r < 0.9) x--;
      if (rnd(k + 40 + n) < 0.5) y += rnd(k + 80 + n) < 0.5 ? 1 : -1;
    }
  };
  const d = b.decor;
  if (d === 'drifts') {
    // wind-carved ripples in the snow, and a dark pebble now and then
    for (let k = 0; k < 3; k++) if (rnd(k) < 0.45) { const x = ox + Math.floor(rnd(k + 5) * 12), y = oy + Math.floor(rnd(k + 9) * 15), n = 3 + Math.floor(rnd(k + 13) * 4); for (let i = 0; i < n; i++) put(x + i, y, '#e4ecf6'); for (let i = 1; i < n - 1; i++) put(x + i, y + 1, b.floor[0]); }
    if (rnd(30) < 0.1) { const x = ox + 4 + Math.floor(rnd(31) * 8), y = oy + 4 + Math.floor(rnd(32) * 8); put(x, y, '#3a4458'); put(x + 1, y, '#2a3244'); }
  } else if (d === 'fissures') {
    // cracks in the ash with fire under them (dim: never ore-bright)
    if (rnd(0) < 0.16) walk(10, 6 + Math.floor(rnd(1) * 5), '#a8381a', true);
    if (rnd(2) < 0.3) put(ox + Math.floor(rnd(3) * 16), oy + Math.floor(rnd(4) * 16), '#5a2a1a');
  } else if (d === 'moss') {
    for (let k = 0; k < 2; k++) if (rnd(k) < 0.45) { const x = ox + 2 + Math.floor(rnd(k + 5) * 11), y = oy + 2 + Math.floor(rnd(k + 9) * 11); for (const [i, j] of [[0, 0], [1, 0], [-1, 0], [0, -1], [1, 1], [2, 0]]) put(x + i, y + j, rnd(k + 20 + i) < 0.5 ? '#5e7e3a' : '#3a5226'); }
    if (rnd(30) < 0.12) put(ox + Math.floor(rnd(31) * 16), oy + Math.floor(rnd(32) * 16), rnd(33) < 0.5 ? '#f0ecc8' : '#e8b8f0');
    if (rnd(34) < 0.06) { const x = ox + 4 + Math.floor(rnd(35) * 6), y = oy + 5 + Math.floor(rnd(36) * 6); for (let j = 0; j < 2; j++) for (let i = 0; i < 5 - j * 2; i++) put(x + i + j, y + j, '#222a16'); }
  } else if (d === 'algae') {
    if (rnd(0) < 0.18) for (let k = 0; k < 3; k++) put(ox + 3 + Math.floor(rnd(k + 1) * 10), oy + 3 + Math.floor(rnd(k + 7) * 10), '#2a3c8a', true);
    if (rnd(20) < 0.25) { const x = ox + Math.floor(rnd(21) * 12), y = oy + Math.floor(rnd(22) * 15); for (let i = 0; i < 3; i++) put(x + i, y, '#355e70'); }
  } else if (d === 'cracks') {
    if (rnd(0) < 0.12) walk(10, 5 + Math.floor(rnd(1) * 5), '#5a1406', true);
    if (rnd(2) < 0.25) { const x = ox + Math.floor(rnd(3) * 14), y = oy + Math.floor(rnd(4) * 14); put(x, y, '#3a322e'); put(x + 1, y, '#3a322e'); }
  } else if (d === 'roots') {
    if (rnd(0) < 0.22) walk(10, 8 + Math.floor(rnd(1) * 6), '#54402a', false, '#2a1e12');
    if (rnd(2) < 0.2) put(ox + Math.floor(rnd(3) * 16), oy + Math.floor(rnd(4) * 16), '#3e4a24');
  } else if (d === 'overgrowth') {
    // moss in the flagstones' seams, and leaf litter
    for (let y = oy; y < oy + TILE; y++) for (let x = ox; x < ox + TILE; x++) if ((y % 9 === 0 || (x + ((y / 9) | 0) * 5) % 11 === 0) && (hashInts(x, y, 0x3055) & 7) < 3) put(x, y, (hashInts(x, y, 0x3056) & 1) ? '#2e4a26' : '#3e5e30');
    if (rnd(10) < 0.2) for (let k = 0; k < 4; k++) put(ox + 3 + Math.floor(rnd(k + 11) * 10), oy + 3 + Math.floor(rnd(k + 17) * 10), k % 2 ? '#4a5a28' : '#6a6a30');
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
  if (f.hazKind === 'burn' && f.haz) for (let i = 0; i < f.haz.length; i++) if (f.haz[i]) out.push({ x: (i % f.w + 0.5) * TILE, y: (Math.floor(i / f.w) + 0.5) * TILE, r: TILE * 1.5, i: 0.42, c: [1, 0.45, 0.15] });
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
      const col = SPORE_COLS[f.clime] || SPORE_COLS.bloomfen, sw = s > 0.75 ? (s - 0.75) / 0.25 : 0, rr = 2.5 + sw * 1.5, x = Math.round(cx), y = Math.round(cy - 5);
      for (let j = 1; j <= 3; j++) dot(x, y + 2 + j, b.front[2]);
      for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) {
        const e = (i * i + j * j * 1.2) / (rr * rr);
        if (e > 1) continue;
        dot(x + i, y + j, e > 0.6 ? col[1] : i + j < -1 ? '#ffffff' : col[0], e <= 0.6 && sw > 0, e > 0.6 ? 1 : 0.85);
      }
      if (sw > 0) lights.push({ x, y, r: TILE * (0.8 + sw), i: 0.35 * sw, c: rgb01(col[0]) });
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
