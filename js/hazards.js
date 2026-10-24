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
const hazardWalker = (e) => { const def = T.enemies[e.type]; return e.type !== 'wisp' && e.type !== 'hollow' && !def.rooted && !def.flies && !def.anchored && !def.swims && !e.hid; };

// How fast an enemy goes for the ground it's on: slower wading.
function hazardSlow(f, e) {
  if (!f.haz || !hazardWalker(e)) return 1;
  return hazardAt(f, e.x, e.y) === HAZ_CODES.pool ? T.hazards.pool.slow : 1;
}
// The clime a hazard point is in (its own numbers: T.climes[].haz).
function hazClimeOf(f, v) { return T.climes[f.regions ? climeAt(f, v.x, v.y) : f.clime] || {}; }
// The kinds of hazard a floor has.
function hazKinds(f) { return f.hazKinds || (f.hazKind ? [f.hazKind] : []); }
// The hazard point on tile tx, ty, if any.
function hazPtAt(f, tx, ty) {
  if (!f.hazPts) return null;
  if (!f.hazPtMap) { f.hazPtMap = new Map(); for (const v of f.hazPts) f.hazPtMap.set(v.y * f.w + v.x, v); }
  return f.hazPtMap.get(ty * f.w + tx) || null;
}

// The diver's step at vx, vy px/s: a pool slows it, and on ice the footing
// follows the stick only slowly, so a step carries on (until a wall stops
// it).
function stepDiver(d, p, vx, vy, dt) {
  const f = d.floor, k = f.haz ? hazardAt(f, p.x, p.y) : 0;
  if (k === HAZ_CODES.pool) { vx *= T.hazards.pool.slow; vy *= T.hazards.pool.slow; }
  // a Rootweaver's snare holds the step like water (foes.js); a dash crosses it
  const sn = snareSlow(d, p);
  if (sn < 1) { vx *= sn; vy *= sn; }
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
  const f = d.floor, p = d.p, H = T.hazards, kinds = hazKinds(f);
  if (!kinds.length || d.hub) return;
  d.hazT = (d.hazT || 0) + dt;
  const open = !d.dying && p.invuln <= 0 && p.dashT <= 0;
  const here = f.haz ? HAZ_KINDS[hazardAt(f, p.x, p.y)] : null;
  if (here && HAZARD_TIPS[here]) UI.tip('haz_' + here, HAZARD_TIPS[here]);
  if (kinds.includes('burn')) {
    if (open && here === 'burn') { hazardDrain(d, H.burn.dps * dt); if (Math.random() < dt * 10) spawnSparks(p.x, p.y - 2, ['#ff8a20', '#ffd060'], 1); }
    for (const e of d.enemies) if (!e.dead && hazardWalker(e) && !T.enemies[e.type].lavaProof && hazardAt(f, e.x, e.y) === HAZ_CODES.burn && !(e.burn && e.burn.t > 0.3)) e.burn = { t: 0.6, dps: H.burn.dps };
  }
  if (kinds.includes('vent')) {
    const V = H.vent;
    for (const v of f.hazPts) {
      if ((v.kind || f.hazKind) !== 'vent') continue;
      const s = ventPhase(d, v), bursting = s >= V.every - V.burst;
      if (bursting && !v.fired) {
        v.fired = true;
        const x = (v.x + 0.5) * TILE, y = (v.y + 0.5) * TILE;
        snd('vent', { x, y });
        if (open && dist(x, y, p.x, p.y) < V.r + T.player.radius) hurtPlayer(V.dmg, v);
        for (const e of d.enemies) if (!e.dead && hazardWalker(e) && dist(x, y, e.x, e.y) < V.r + e.r) e.burn = { t: 1, dps: V.dmg };
      } else if (!bursting) v.fired = false;
    }
  }
  if (kinds.includes('spores')) {
    const clouds = (d.clouds = d.clouds || []), wind = (d.life && d.life.wind) || { x: 0.8, y: 0.3 };
    for (const v of f.hazPts) {
      if ((v.kind || f.hazKind) !== 'spores') continue;
      const S = Object.assign({}, H.spores, hazClimeOf(f, v).haz), s = (d.hazT / S.every + v.ph) % 1;
      if (v.last !== undefined && s < v.last && dist((v.x + 0.5) * TILE, (v.y + 0.5) * TILE, p.x, p.y) < 14 * TILE)
        clouds.push({ x: (v.x + 0.5) * TILE, y: (v.y + 0.5) * TILE - 5, t: 0, life: S.life, r: S.r, dps: S.dps, drift: S.drift, seed: Math.random() * 99 });
      v.last = s;
    }
    let inside = 0;
    for (const c of clouds) {
      c.t += dt;
      c.x += (wind.x * c.drift + Math.sin(c.t * 0.7 + c.seed) * 3) * dt; c.y += (wind.y * c.drift + Math.cos(c.t * 0.5 + c.seed) * 2) * dt;
      if (dist(c.x, c.y, p.x, p.y - 4) < sporeR(c)) inside = Math.max(inside, c.dps);
    }
    d.clouds = clouds.filter((c) => c.t < c.life);
    if (inside) { UI.tip('haz_spores', HAZARD_TIPS.spores); if (open) hazardDrain(d, inside * dt); }
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
  const R = View.rockPx, W = P.w, OFF = -P.oy * W - P.ox;
  if (!R) return;
  // in a wall's shadow (or under the sky, a mesa's): left dark
  const shaded = (x, y) => {
    for (let k = 1; k <= CAVE_SHADE + 1; k++) if (R[(y - k) * W + x + OFF]) return true;
    if (b.sun) for (let k = 0; k < CAVE_SUN.length - 1; k++) if (R[(y - CAVE_SUN[k][1]) * W + x - CAVE_SUN[k][0] + OFF]) return true;
    return false;
  };
  // (the hazard's kind: the code of the nearest hazard tile)
  let near = 0;
  if (f.haz) for (let y = ty - 1; y <= ty + 1; y++) for (let x = tx - 1; x <= tx + 1; x++) if (x >= 0 && y >= 0 && x < f.w && y < f.h && f.haz[y * f.w + x] > near) near = f.haz[y * f.w + x];
  if (near) paintHazardPixels(P, f, ox, oy, b, shaded, HAZ_KINDS[near]);
  const t = floorTile(f, tx, ty);
  if (t === TILE_ROCK && b.rockDecor === 'roots') paintRootRock(P, ox, oy);
  if (t !== TILE_FLOOR) return;
  const pt = hazPtAt(f, tx, ty), pk = pt && (pt.kind || f.hazKind);
  if (pk === 'vent') paintVent(P, ox + ATILE / 2, oy + ATILE / 2, b);
  else if (pk === 'spores') paintPodBed(P, ox + ATILE / 2, oy + ap(9), b);
  else if (b.decor && !(f.haz && f.haz[ty * f.w + tx])) paintDecor(P, f, tx, ty, ox, oy, b, shaded);
}

// A hazard's pixels (art px), its tone by how far in from its edge: a rim
// a pixel wide, a band of shallows, the deep. Noise is in world px, so a
// pattern is as big as it was; the art px give it finer edges. Its surface
// lies phlDepth px below the floor (painthole.js): each pixel shows the
// surface point that far north of it, and under the far rim, its bank;
// the near rim catches the light.
const HAZ_IN = ap(2), HAZ_DEEP = ap(4), HAZ_STREAK = ap(13), HAZ_RIPPLE = ap(6), HAZ_UP = HAZ_DEEP + ap(12), _hazMask = new Uint8Array((ATILE + 2 * HAZ_DEEP) * (ATILE + HAZ_DEEP + HAZ_UP));
function paintHazardPixels(P, f, ox, oy, b, shaded, kind = f.hazKind) {
  const R = View.rockPx, W = P.w, OFF = -P.oy * W - P.ox, r = b.haz || HAZ_RAMPS[kind], lava = kind === 'burn', ice = kind === 'slick';
  const D = Math.min(HAZ_UP - HAZ_DEEP, phlDepth(kind)), Ho = T.paint.hole, GR = pntLook(b).ground, seed = (f.seed ^ f.depth) | 0;
  // the hazard's outline round the tile, read once
  const G = HAZ_DEEP, MW = ATILE + 2 * G, MH = ATILE + G + HAZ_UP, Hm = _hazMask;
  for (let j = 0; j < MH; j++) for (let i = 0; i < MW; i++) Hm[j * MW + i] = hazardAt(f, (ox - G + i + 0.5) / AP, (oy - HAZ_UP + j + 0.5) / AP) !== 0 ? 1 : 0;
  const at = (x, y) => Hm[(y - oy + HAZ_UP) * MW + x - ox + G] === 1;
  const inside = (x, y) => x >= ox - G && x < ox + ATILE + G && y >= oy - HAZ_UP && y < oy + ATILE + G && at(x, y) && !R[y * W + x + OFF];
  const lavaC = [rgbOf(r[1]), rgbOf(r[2])].map(pntU32);
  for (let y = oy; y < oy + ATILE; y++) {
    phlStrokes(ox - 8, y, seed + 331);
    for (let x = ox; x < ox + ATILE; x++) {
      if (R[y * W + x + OFF]) continue;
      if (!at(x, y)) {
        // the near rim, lit
        if (D && at(x, y - 1) && !R[(y - 1) * W + x + OFF]) phlNearLip(P, x, y, b, Ho.lip);
        else if (D && at(x, y - 2) && !R[(y - 2) * W + x + OFF]) phlNearLip(P, x, y, b, Ho.lip - 2);
        continue;
      }
      // the bank, under the far rim
      let k = 0;
      for (let j = 1; j <= D; j++) if (!at(x, y - j)) { k = j; break; }
      if (k) {
        const q = k - 1, s = phlFacing(inside, x, y, D + 2);
        // (a bank is cut in the ground: on the ground's ramp; its lip lit,
        // a wet dark band where it meets the water or ice)
        let t = phlWallTone(q, D, s, x, ox - 8, y, seed, Ho.bank);
        if (q === 0) t = Math.max(t, Ho.lipTone[1]);
        else if (q === 1) t = Math.max(t, Ho.lipTone[1] - 1.5);
        if (lava) {
          // lit from below by the lava: its own colour in loose strokes,
          // thicker nearer the surface
          t += (q / D) * Ho.lavaLift;
          const m = _phlMid[x - ox + 8] + ox - 8;
          if (q && artHash(m, y, seed + 337) < (q / D) * Ho.lavaLick) { phlPut(P, x, y, lavaC[q === D - 1 ? 1 : 0], true); continue; }
        } else if (q >= D - Ho.wet) t = Math.min(t, q === D - 1 ? 0 : Ho.foot);
        phlPut(P, x, y, GR[phlClampT(t, 7)]);
        continue;
      }
      // the surface, as it was, at the point it shows
      const sy = y - D;
      const edge = !at(x - 1, sy) || !at(x + 1, sy) || !at(x, sy - 1) || !at(x, sy + 1);
      const inner = !edge && (!at(x - HAZ_IN, sy) || !at(x + HAZ_IN, sy) || !at(x, sy - HAZ_IN) || !at(x, sy + HAZ_IN));
      const deep = at(x - HAZ_DEEP, sy) && at(x + HAZ_DEEP, sy) && at(x, sy - HAZ_DEEP) && at(x, sy + HAZ_DEEP);
      // (the waterline under the far bank, and a row below it, in its shade)
      const under = D && !at(x, sy - 1) ? 1 : D && !at(x, sy - 2) ? 2 : 0;
      // (in the far and west banks' shade, the light being from the upper
      // left: lava makes its own)
      let shade = false;
      if (D && !lava) for (let j = 1, n = Math.round(D * Ho.shade); j <= n && !shade; j++) if (!at(x - j, sy - j) || !at(x, sy - j - 1)) shade = true;
      // tone comes in clusters (smooth noise), never pixel by pixel
      const n = wallNoise((x / AP) * 1.3 + 17, (sy / AP) * 2 + 5, 6), dark = shaded(x, y);
      let c, glow = false;
      if (lava) {
        // a dark crust at the edge, then molten: mostly orange, cooler skin
        // drifting on it, the hottest yellow only in the deepest middle
        if (edge && !under) c = '#2a0a10';
        else if (n > 0.3) c = r[0];
        else { c = r[deep && n < -0.25 ? 3 : deep || n < -0.1 ? 2 : 1]; glow = c !== r[1]; }
      } else if (ice) {
        // glassy, a little lighter in patches, streaked where light runs on it
        c = edge || dark || under || shade ? r[0] : r[n > 0.15 ? 2 : 1];
        if (!edge && !dark && !under && !shade && (x * 2 + y) % HAZ_STREAK < 3 && n > -0.3) c = r[3];
      } else {
        // still water: a wet rim, a band of shallows, darker where it's deep,
        // the odd line of ripple; under the far bank, its shade
        // (the waterline shows only against a bank; where the surface runs
        // to the cut, its edge is in the near rim's shadow)
        const cut = !at(x - 1, y) || !at(x + 1, y) || !at(x, y + 1);
        if (under === 1 && !cut) { c = b.rimGlow ? r[3] : r[0]; glow = !!b.rimGlow; }
        else if (under || (edge && cut)) c = r[0];
        else if (edge) { c = r[3]; glow = !!b.rimGlow; }
        else if (dark || shade) c = r[0];
        else c = inner ? r[2] : deep ? r[0] : r[1];
        if (!edge && !inner && !dark && !under && !shade && y % HAZ_RIPPLE === 0 && n > 0.25) c = r[2];
      }
      putPx(P, x, y, c, glow);
    }
  }
}

// A vent: a ring of dark stone round a throat, fire showing at its foot;
// or under the Vault, a round brass grate. cx, cy: its middle (art px). The
// throat's far wall shows from its lip down into the dark (painthole.js).
function paintVent(P, cx, cy, b) {
  const steam = b.vent === 'steam', rx = 6 * AP, ry = Math.sqrt(20) * AP, E = (i, j) => (i * i) / (rx * rx) + (j * j) / (ry * ry);
  const wall = [b.front[1], b.front[0], '#2a1610', '#1a0e0c', '#100808'], Dv = T.paint.hole.vent;
  for (let j = -Math.ceil(ry); j <= Math.ceil(ry); j++)
    for (let i = -Math.ceil(rx); i <= Math.ceil(rx); i++) {
      const e = E(i, j);
      if (e > 1) continue;
      let c;
      if (steam) c = e > 0.65 ? (j < 0 ? '#b88a48' : '#5a4020') : (Math.floor(i / AP) % 2 === 0 ? '#1a120a' : '#7a5a2a');
      else if (e > 0.62) c = i * 0.55 + j * 0.8 < 0 ? b.front[2] : e > 0.85 ? b.front[0] : b.front[1];
      else {
        // the throat: rows down from its far lip
        let q = 0;
        while (q < Dv && E(i, j - q - 1) <= 0.62) q++;
        c = q < Dv ? wall[Math.min(wall.length - 1, q + (i > 0 && q ? 0 : 1))] : '#0a0606';
      }
      putPx(P, cx + i, cy + j, c);
    }
  if (!steam) paintVentFlame(P, cx, cy + ap(3), cx * 31 + cy);
}
// The fire at a vent's foot, painted: a flame rising from the throat's
// floor over its far wall, its tip leaning and forked, a hot core low in
// it, deep red at its edges, glowing; embers by it. bx, by: its foot.
function paintVentFlame(P, bx, by, seed) {
  const h = 9, w = 3.2, lean = (artHash(seed, 1, 5) - 0.5) * 2.4, cols = ['#5a1206', '#a8300c', '#e4661a', '#ffb040', '#ffe8a0'];
  for (let j = 0; j < h; j++) {
    const u = j / (h - 1), half = w * Math.sqrt(1 - u) * (u < 0.15 ? 0.75 + u * 1.6 : 1), mx = bx + lean * u * u;
    for (let i = Math.floor(mx - half - 1); i <= Math.ceil(mx + half + 1); i++) {
      const d = Math.abs(i + 0.5 - mx) / Math.max(0.6, half);
      // (the tip forks: a notch down its middle near the top)
      if (d > 1 || (u > 0.65 && d < 0.3 && artHash(seed, 2, 5) < 0.6)) continue;
      const v = (1 - d) * (1 - u * 0.85) + (artHash(i, j, seed) - 0.5) * 0.25;
      putPx(P, i, by - j, cols[Math.max(0, Math.min(4, Math.floor(v * 5.2)))], true);
    }
  }
  for (const [i, j] of [[-4, -1], [3, -3], [5, 0]]) if (artHash(i, j, seed + 3) < 0.7) putPx(P, bx + i, by + j, '#e4661a', true);
}

// The bed a spore pod grows from: a hollow, its far (lower right) lip
// catching the light, its near one in shadow, dark in the middle.
function paintPodBed(P, cx, cy, b) {
  const rx = 6 * AP, ry = 3 * AP;
  for (let j = -Math.ceil(ry); j <= Math.ceil(ry); j++)
    for (let i = -Math.ceil(rx); i <= Math.ceil(rx); i++) {
      const e = (i * i) / (rx * rx) + (j * j) / (ry * ry);
      if (e <= 1) putPx(P, cx + i, cy + j, e < 0.5 ? b.rock[2] : i * 0.5 + j > 0 ? b.front[2] : b.front[0]);
    }
}

// Rock woven of old roots (Rootdeep): strands wandering over the rock's
// top and down its face, lighter than the rock and darker than the floor,
// so walls still read as walls.
function paintRootRock(P, ox, oy) {
  const R = View.rockPx, W = P.w, OFF = -P.oy * W - P.ox;
  for (let y = oy; y < oy + ATILE; y++)
    for (let x = ox; x < ox + ATILE; x++) {
      if (!R[y * W + x + OFF]) continue;
      const wx = x / AP, wy = y / AP;
      const top = R[(y + FACE_H) * W + x + OFF] && R[(y - 1) * W + x + OFF] && R[y * W + x - 1 + OFF] && R[y * W + x + 1 + OFF];
      const a = Math.abs(wallNoise(wx * 0.7, wy * 1.4, 9)), c = Math.abs(wallNoise(wx * 1.4 + 70, wy * 0.6, 8));
      if (top) { if (a < 0.07) putPx(P, x, y, a < 0.035 ? '#2a2016' : '#1c140e'); else if (c < 0.05) putPx(P, x, y, '#1a120c'); }
      else {
        let face = false;
        for (let k = 1; k < FACE_H && !face; k++) if (!R[(y + k) * W + x + OFF]) face = true;
        if (face && Math.abs(wallNoise(wx * 1.8, wy * 0.3, 6)) < 0.09) putPx(P, x, y, '#5a4430');
      }
    }
}

// A clime's marks on its open ground, here and there: always in small
// clusters, never lone pixels. Placed in world px within the tile (and
// drawn at whole art px), each mark's own shape in art px.
function paintDecor(P, f, tx, ty, ox, oy, b, shaded) {
  const R = View.rockPx, W = P.w, OFF = -P.oy * W - P.ox, rnd = (k) => (hashInts(f.seed, tx, ty, k) & 1023) / 1023;
  const put = (x, y, c, glow) => { if (x >= ox && y >= oy && x < ox + ATILE && y < oy + ATILE && !R[y * W + x + OFF] && !shaded(x, y)) putPx(P, x, y, c, glow); };
  // a little clump: pixels round x, y (offsets), each in one of the colours
  const clump = (x, y, pts, cols, glow) => pts.forEach(([i, j], n) => put(x + i, y + j, cols[n % cols.length], glow));
  // somewhere lo..lo + span world px into the tile, in art px
  const at = (k, lo, span) => ap(lo + Math.floor(rnd(k) * span));
  const walk = (k, len, c, glow, under) => {
    let x = ox + at(k, 2, 12), y = oy + at(k + 1, 2, 12);
    for (let n = 0, N = ap(len); n < N; n++) {
      put(x, y, c, glow); if (under) put(x, y + 1, under);
      x += rnd(k + 2 + n) < 0.5 ? 1 : -1;
      if (rnd(k + 40 + n) < 0.4) y += rnd(k + 80 + n) < 0.5 ? 1 : -1;
    }
  };
  const BLOB = [[0, 0], [1, 0], [-1, 0], [0, -1], [1, -1], [0, 1], [2, 0], [1, 1], [-1, 1]], TRI = [[0, 0], [1, 0], [0, 1], [2, 0], [1, 1]], FLOWER = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]];
  const d = b.decor;
  if (d === 'drifts') {
    // wind-carved ripples in the snow, each with its shadowed lee
    for (let k = 0; k < 2; k++) if (rnd(k) < 0.5) { const x = ox + at(k + 5, 0, 11), y = oy + at(k + 9, 1, 13), n = ap(4 + Math.floor(rnd(k + 13) * 4)); for (let i = 0; i < n; i++) put(x + i, y, '#e8e4e0'); for (let i = 1; i < n; i++) put(x + i, y + 1, b.floor[0]); }
    if (rnd(30) < 0.08) clump(ox + at(31, 4, 8), oy + at(32, 4, 8), [[0, 0], [1, 0], [0, 1], [1, 1], [2, 1], [2, 0], [3, 1]], ['#3a3c58', '#2a2a44', '#2a2a44', '#1e1e36', '#1e1e36']);
  } else if (d === 'fissures') {
    // cracks in the ash with fire under them (dim: never ore-bright)
    if (rnd(0) < 0.16) walk(10, 6 + Math.floor(rnd(1) * 5), '#9a3418', true, '#1a1014');
    if (rnd(2) < 0.2) clump(ox + at(3, 2, 12), oy + at(4, 2, 12), TRI, ['#58483e', '#241c22', '#241c22']);
  } else if (d === 'moss') {
    for (let k = 0; k < 2; k++) if (rnd(k) < 0.45) clump(ox + at(k + 5, 2, 11), oy + at(k + 9, 2, 11), BLOB, ['#64803c', '#4c6630', '#4c6630', '#64803c', '#34442a', '#34442a', '#4c6630', '#34442a', '#34442a']);
    if (rnd(30) < 0.12) clump(ox + at(31, 3, 10), oy + at(32, 3, 10), FLOWER, [rnd(33) < 0.5 ? '#f4e8a8' : '#ecb8f0', '#d8c0e8', '#d8c0e8', '#d8c0e8', '#3a4a28']);
    if (rnd(34) < 0.07) { const x = ox + at(35, 3, 7), y = oy + at(36, 4, 7), n = ap(5); for (let j = 0; j < ap(2); j++) for (let i = 0; i < n - j * 2; i++) put(x + i + j, y + j, '#26202c'); }
  } else if (d === 'algae') {
    if (rnd(0) < 0.2) clump(ox + at(1, 3, 10), oy + at(7, 3, 10), [[0, 0], [1, 0], [1, 1], [2, 1], [4, 1], [5, 1], [5, 2]], ['#3a52c8', '#2a3c98'], true);
    if (rnd(20) < 0.25) { const x = ox + at(21, 0, 12), y = oy + at(22, 0, 15); for (let i = 0, n = ap(4); i < n; i++) put(x + i, y, '#4a5070'); }
  } else if (d === 'cracks') {
    if (rnd(0) < 0.12) walk(10, 5 + Math.floor(rnd(1) * 5), '#5a1406', true, '#0e080c');
    if (rnd(2) < 0.18) clump(ox + at(3, 2, 12), oy + at(4, 2, 12), TRI, ['#3e3236', '#1a1218', '#1a1218']);
  } else if (d === 'roots') {
    if (rnd(0) < 0.3) walk(10, 9 + Math.floor(rnd(1) * 6), '#5e4a30', false, '#22180e');
    if (rnd(2) < 0.18) clump(ox + at(3, 2, 12), oy + at(4, 2, 12), BLOB, ['#4a5a28', '#34401e']);
  } else if (d === 'overgrowth') {
    // moss creeping along the flagstones' seams in runs, and leaf litter
    for (let y = oy; y < oy + ATILE; y++) for (let x = ox; x < ox + ATILE; x++) if ((y % FLAG_H < AP || (x + ((y / FLAG_H) | 0) * FLAG_SET) % FLAG_W < AP) && wallNoise(x / AP + 3, y / AP + 9, 5) > 0.15) put(x, y, wallNoise(x / AP, y / AP, 3) > 0.3 ? '#4a6a34' : '#2e4a26');
    if (rnd(10) < 0.2) clump(ox + at(11, 3, 10), oy + at(17, 3, 10), BLOB, ['#6a6a30', '#4a5a28', '#4a5a28', '#6a6a30', '#2e3a1e']);
  } else if (d === 'plates') {
    // floor plates: dark seams on the tile lines, a rivet in each corner,
    // and now and then a gear set into the floor
    for (let i = 0; i < ATILE; i++) { put(ox + i, oy, '#16110c'); put(ox, oy + i, '#16110c'); put(ox + i, oy + 1, b.floor[2]); }
    for (const [i, j] of [[2, 3], [13, 3], [2, 13], [13, 13]]) { const x = ox + ap(i), y = oy + ap(j); put(x, y, '#9a7840'); put(x + 1, y, '#9a7840'); put(x, y + 1, '#3a2a14'); put(x + 1, y + 1, '#3a2a14'); }
    if (rnd(0) < 0.1) for (let k = 0, n = Math.round(24 * AP); k < n; k++) { const a = (k / n) * Math.PI * 2, rr = (k % 3 === 0 ? 4.5 : 3.5) * AP; put(Math.round(ox + ATILE / 2 + Math.cos(a) * rr), Math.round(oy + ATILE / 2 + Math.sin(a) * rr * 0.8), '#7a5a2a'); }
  }
}

// The fixed lights of a clime's ground: lava's glow, and the vents' and
// pods' faint ones.
function hazardLights(f) {
  const out = [];
  if (f.haz) for (let i = 0; i < f.haz.length; i++) if (f.haz[i] === HAZ_CODES.burn) out.push({ x: (i % f.w + 0.5) * TILE, y: (Math.floor(i / f.w) + 0.5) * TILE, r: TILE * 1.4, i: 0.3, c: [1, 0.45, 0.15] });
  if (f.hazPts) for (const v of f.hazPts) {
    const b = climeLookAt(f, v.x, v.y), kind = v.kind || f.hazKind;
    const col = kind === 'vent' ? (b.vent === 'steam' ? [0.8, 0.85, 0.9] : [1, 0.4, 0.15]) : rgb01((SPORE_COLS[f.regions ? climeAt(f, v.x, v.y) : f.clime] || SPORE_COLS.bloomfen)[0]);
    out.push({ x: (v.x + 0.5) * TILE, y: (v.y + 0.5) * TILE, r: TILE * 0.9, i: 0.25, c: col });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Drawn each frame: what moves on the ground (under the actors), and the
// spore clouds in the air (over them).
// ---------------------------------------------------------------------------
const HazRipples = [];
function drawHazardsUnder(d, ox, oy, tick, lights) {
  const f = d.floor, p = d.p;
  if (!hazKinds(f).length) return;
  const tx0 = Math.max(0, Math.floor(-ox / ATILE) - 1), ty0 = Math.max(0, Math.floor(-oy / ATILE) - 1);
  const tx1 = Math.min(f.w - 1, tx0 + Math.ceil(View.w / ATILE) + 2), ty1 = Math.min(f.h - 1, ty0 + Math.ceil(View.h / ATILE) + 2);
  // (each tile's hazard its own kind, in its clime's colours: regions.js)
  let kind = null, r = null, dz = 0;
  if (f.haz) {
    for (let ty = ty0; ty <= ty1; ty++)
      for (let tx = tx0; tx <= tx1; tx++) {
        const code = f.haz[ty * f.w + tx];
        if (!code) continue;
        kind = HAZ_KINDS[code]; r = climeLookAt(f, tx, ty).haz || HAZ_RAMPS[kind]; dz = phlDepth(kind);
        const h = hashInts(tx, ty, 0x6a2), ph = (Game.realT * (kind === 'burn' ? 0.5 : 0.3) + (h & 255) / 255) % 1;
        const wx = tx * TILE + 3 + ((h >> 8) % 10), wy = ty * TILE + 3 + ((h >> 12) % 10);
        if (!hazardAt(f, wx, wy)) continue;
        // (on the surface, down in its bed: painthole.js)
        if (dz && !hazardAt(f, wx, wy + dz / AP)) continue;
        const x = Math.round(wx * AP) + ox, y = Math.round(wy * AP) + oy + dz;
        if (kind === 'burn') {
          // a bubble swells and pops, a spark lifting off it
          if (ph < 0.3) { const k = ph / 0.3; dot(x, y, r[3], true, k); if (k > 0.5) for (const [i, j] of [[-1, 0], [1, 0], [0, -1], [1, -1]]) dot(x + i, y + j, r[2], true, k); }
          else if (ph < 0.45) dot(x, Math.round(y - (ph - 0.3) * 60 * AP), '#ffd860', true, 1 - (ph - 0.3) / 0.15);
        } else if (ph < 0.12) {
          // a glint on water or ice
          const k = ph < 0.06 ? ph / 0.06 : (0.12 - ph) / 0.06;
          dot(x, y, r[3], kind === 'slick', k);
          if (kind === 'slick' && k > 0.6) for (const [i, j] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) dot(x + i, y + j, '#ffffff', true, k * 0.5);
          else if (kind === 'pool') for (let i = 1; i <= ap(1.5); i++) { dot(x - i, y, r[3], false, k * 0.6); dot(x + i, y, r[3], false, k * 0.6); }
        }
      }
    // wading leaves rings on the water
    if (d.wading === HAZ_CODES.pool && (Math.abs(p.vx || 0) + Math.abs(p.vy || 0)) > 5 && (d.rippleT = (d.rippleT || 0) - 1 / 60) <= 0) { d.rippleT = 0.28; HazRipples.push({ x: p.x, y: p.y, t: 0 }); }
  }
  for (let n = HazRipples.length - 1; n >= 0; n--) {
    const q = HazRipples[n];
    q.t += 1 / 60;
    if (q.t > 0.8 || HazRipples.length > 12) { HazRipples.splice(n, 1); continue; }
    const r = climeLookAtPx(f, q.x, q.y).haz || HAZ_RAMPS.pool, dz = phlDepth('pool');
    const rr = 3 + q.t * 12, k = 1 - q.t / 0.8, N = Math.round(14 * AP + rr);
    for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2, x = q.x + Math.cos(a) * rr, y = q.y + Math.sin(a) * rr * 0.45; if (hazardAt(f, x, y) && hazardAt(f, x, y + dz / AP)) dot(Math.round(x * AP) + ox, Math.round(y * AP) + oy + dz, r[3], false, 0.7 * k); }
  }
}
// What stands up off the ground: a vent's fire or steam and its tell, a
// spore pod on its stalk; each hidden by the rock in front of it (drawn
// after the rock has been laid back over the ground's marks: render.js).
function drawHazardsStanding(d, ox, oy, tick, lights) {
  const f = d.floor;
  if (!f.hazPts || !f.hazPts.length) return;
  const V = T.hazards.vent;
  for (const v of f.hazPts) {
    const cx = Math.round((v.x + 0.5) * ATILE) + ox, cy = Math.round((v.y + 0.5) * ATILE) + oy;
    if (cx < -45 || cy < -60 || cx > View.w + 45 || cy > View.h + 45) continue;
    const kind = v.kind || f.hazKind, b = climeLookAt(f, v.x, v.y), steam = b.vent === 'steam', vc = VENT_COLS[steam ? 'steam' : 'fire'];
    drawHazardPoint(d, v, cx, cy, kind, b, V, steam, vc, tick, lights);
    paintOcclude(cx - ap(13), cy - ap(36), ap(26), ap(40), cy + ap(2), ox, oy);
  }
}
function drawHazardPoint(d, v, cx, cy, kind, b, V, steam, vc, tick, lights) {
  const f = d.floor;
  if (kind === 'vent') {
    const s = ventPhase(d, v), tellAt = V.every - V.burst - V.tell;
    if (s >= V.every - V.burst) {
      // the burst: a column of fire or steam
      const k = (s - (V.every - V.burst)) / V.burst;
      for (let n = 0, N = Math.round(26 * AP); n < N; n++) {
        const u = ((n * 0.37 + Game.realT * 3) % 1), y = cy - u * 22 * AP * (1 - k * 0.3), x = cx + Math.sin(n * 1.7 + Game.realT * 9) * (2 + u * 4) * AP;
        dot(Math.round(x), Math.round(y), vc[u < 0.25 ? 0 : u < 0.65 ? 1 : 2], !steam || u < 0.3, 1 - u * 0.6);
      }
      ringDots(cx, cy, V.r * AP, vc[1], 0.5 * (1 - k), true);
      lights.push({ x: cx, y: cy - ap(8), r: TILE * 2.2, i: steam ? 0.7 : 1.1, c: steam ? [0.9, 0.95, 1] : [1, 0.5, 0.2] });
    } else if (s >= tellAt) {
      // the tell: the throat glows brighter, the reach shows, smoke rises
      const k = (s - tellAt) / V.tell;
      for (const [i, j] of [[0, 0], [-1, 0], [0, 1], [1, 0], [0, -1], [-1, 1], [1, 1], [-2, 0], [2, 0], [0, 2]]) dot(cx + i, cy + j, vc[k > 0.6 ? 0 : 1], true, 0.4 + 0.6 * k);
      ringDots(cx, cy, V.r * AP, vc[1], (tick % 2 ? 0.55 : 0.3) * k, true);
      for (let n = 0; n < 6; n++) { const u = (Game.realT * 0.8 + n / 6) % 1; dot(Math.round(cx + Math.sin(n * 2 + Game.realT * 2) * 3 * AP), Math.round(cy - (2 + u * 12) * AP), steam ? '#c8d4dc' : '#5a4a46', false, (1 - u) * k); }
      lights.push({ x: cx, y: cy, r: TILE * 1.2, i: 0.5 * k, c: steam ? [0.9, 0.95, 1] : [1, 0.45, 0.2] });
    } else if (!steam && tick % 4 === 0) dot(cx, cy, vc[2], true, 0.6);
  } else if (kind === 'spores') {
    // a pod on a stalk, swelling and glowing as it gets ready to let go
    const S = Object.assign({}, T.hazards.spores, hazClimeOf(f, v).haz), s = (d.hazT / S.every + v.ph) % 1;
    const col = SPORE_COLS[f.regions ? climeAt(f, v.x, v.y) : f.clime] || SPORE_COLS.bloomfen, sw = s > 0.7 ? (s - 0.7) / 0.3 : 0, rr = (3.6 + sw * 1.6) * AP, x = cx, y = cy - ap(7);
    for (let j = ap(2); j <= ap(6); j++) { dot(x, y + j, '#3a3020'); dot(x + 1, y + j, '#1e1810'); }
    const n = Math.ceil(rr) + 1, E = (i, j) => (i * i + j * j * 1.15) / (rr * rr);
    for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
      const e = E(i, j);
      if (e > 1 && !(E(i - 1, j) <= 1 || E(i + 1, j) <= 1 || E(i, j - 1) <= 1 || E(i, j + 1) <= 1)) continue;
      // an outline a pixel wide, a dim rim, the bright body, a highlight up and left
      const c = e > 1 ? '#140e18' : e > 0.62 ? col[1] : (i < 0 && j < 0 && e < 0.3) ? '#fff8f0' : col[0];
      dot(x + i, y + j, c, sw > 0.5 && e <= 0.62 && e > 0.3, 1);
    }
    if (sw > 0) lights.push({ x, y, r: TILE * (0.8 + sw), i: 0.3 * sw, c: rgb01(col[0]) });
  }
}

function drawHazardsAir(d, ox, oy, lights) {
  if (!d.clouds || !d.clouds.length) return;
  const col = SPORE_COLS[d.floor.clime] || SPORE_COLS.bloomfen;
  for (const c of d.clouds) {
    const cx = c.x * AP + ox, cy = c.y * AP + oy, R = sporeR(c) * AP;
    if (cx < -R || cy < -R || cx > View.w + R || cy > View.h + R) continue;
    const a = Math.min(1, c.t * 1.5, (c.life - c.t) * 0.8);
    // a soft ball of motes, turning slowly
    for (let n = 0, N = Math.round(34 * AP * AP); n < N; n++) {
      const ang = n * 2.399 + c.t * (n % 2 ? 0.6 : -0.4) + c.seed, rr = R * Math.sqrt(((n * 7) % N) / N);
      dot(Math.round(cx + Math.cos(ang) * rr), Math.round(cy + Math.sin(ang) * rr * 0.75), n % 3 ? col[1] : col[0], n % 3 === 0, a * (n % 3 ? 0.45 : 0.75));
    }
    lights.push({ x: cx, y: cy, r: sporeR(c) * 1.3, i: 0.2 * a, c: rgb01(col[0]) });
  }
}
