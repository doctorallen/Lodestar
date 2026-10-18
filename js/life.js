'use strict';
// ---------------------------------------------------------------------------
// Ambient life and weather: cosmetic only, never touching play.
//   Critters: a few small harmless creatures a site, placed from its seed.
//     On the surface, lizards that sun themselves and dart, and small flocks
//     of birds that peck about and take off together; underground, moths
//     glowing faintly in the flora's colour, drawn to the diver's lamp; in
//     ruins (and now and then a cave), something that scurries along the
//     foot of the walls and slips into a crack. All of them bolt from the
//     diver, from fights and from anything loud, then settle again.
//   Weather: on the surface, soft cloud shadows drifting on the wind and
//     now and then a gust of dust; underground, drips off the walls and dust
//     motes that show in the lamp.
// Placement is seeded (the site's seed and depth); their wandering uses
// Math.random, as it changes nothing. They run on world time.
// ---------------------------------------------------------------------------

// Each kind's colours by biome, a letter a colour: muted, so they read as
// part of the place rather than as enemies or loot. Outlined as every
// creature is (T.art.outline.creature).
const LIFE_PAL = {
  // each region's lizards and birds stand out from its own ground
  lizard: {
    rim: { B: '#4e7a68', D: '#2e4a44', H: '#6e9e84', E: '#0e1210', l: '#2e4a44', T: '#3e6658', t: '#2e4a44' },
    choir: { B: '#9a8248', D: '#5e4e2a', H: '#b89c5a', E: '#14100a', l: '#5e4e2a', T: '#7e6a3a', t: '#5e4e2a' },
    underforge: { B: '#5a7480', D: '#34464e', H: '#7a94a0', E: '#0c1014', l: '#34464e', T: '#4a6068', t: '#34464e' },
  },
  bird: {
    rim: { B: '#5e6278', D: '#363a4c', H: '#e0d8c4', k: '#c89a48', l: '#1a1410' },
    choir: { B: '#9a6440', D: '#5e3a24', H: '#ecdcc0', k: '#d0a050', l: '#1a1210' },
    underforge: { B: '#8a8a92', D: '#4e4e56', H: '#ecece4', k: '#c89a48', l: '#141210' },
  },
  // underground they're seen by the lamp, so paler
  scurrier: {
    rim: { B: '#b09a80', D: '#6e5e4c', H: '#d4c0a4', E: '#0a0808', l: '#4a3e32', T: '#c09a90' },
    choir: { B: '#b0a092', D: '#6e6256', H: '#d4c6b8', E: '#0a080c', l: '#4a4038', T: '#c0a09a' },
    underforge: { B: '#a8a29c', D: '#64605a', H: '#ccc6c0', E: '#0a0606', l: '#3e3a36', T: '#b89a90' },
  },
};
// a scurrier's eyes catch the lamp
const LIFE_EYESHINE = '#d8e8b0';
// moths take the colour of their biome's flora, paled
const LIFE_MOTH = { rim: '#d8e890', choir: '#f0b0d4', underforge: '#f4c49a' };

// Letter rows, facing east: [still or pecking, a step]. Lizards also run
// north and south (rotated); everything is mirrored for west.
const LIFE_ROWS = {
  lizard: [
    ['...l..l..', 'tTTBBBBEH', '...DDDBH.', '..l....l.'],
    ['..l....l.', 'tTTBBBBEH', '...DDDBH.', '...l..l..'],
  ],
  bird: [
    ['...HH.', 'BBBBHk', '.DDBB.', '..l...'],
    ['......', 'BBBB..', '.DDBH.', '..l.Hk'],
  ],
  scurrier: [
    ['....HHH..', 'TTTBBBBEH', '...DDDDD.', '...l...l.'],
    ['....HHH..', 'TTTBBBBEH', '...DDDDD.', '....l.l..'],
  ],
};

// A site's ambient life by zone: how many of each.
const LIFE_MIX = {
  surface: { lizard: [2, 4], flock: [1, 2] },
  cave: { moth: [4, 7], scurrier: [0, 1] },
  deep: { moth: [4, 6], scurrier: [0, 1] },
  lair: { moth: [3, 5] },
  ruin: { scurrier: [3, 5], moth: [1, 3] },
};

// A critter's colours: its clime's (climes.js CLIME_LIFE), else its region's.
function lifePal(kind, L) { return (CLIME_LIFE[L.key] && CLIME_LIFE[L.key][kind]) || LIFE_PAL[kind][L.biome]; }

const _critSprites = {};
function critSprite(kind, L, frame, dir) {
  const key = kind + '/' + L.key + '/' + frame + '/' + dir;
  if (_critSprites[key]) return _critSprites[key];
  let rows = LIFE_ROWS[kind][frame];
  // north and south: the east rows turned a quarter
  if (dir === 'n' || dir === 's') {
    const w = rows[0].length, h = rows.length, out = [];
    for (let x = 0; x < w; x++) { let r = ''; for (let y = 0; y < h; y++) r += dir === 'n' ? rows[h - 1 - y][w - 1 - x] : rows[y][x]; out.push(r); }
    rows = out;
  }
  // at the art's size (AP), and a creature: outlined like the rest
  // (T.art.outline.creature), a pixel all round
  rows = artScaleRows(rows, AP);
  const mode = T.art.outline.creature, pad = (src) => { const [p, x] = makeCanvas(src.width + 2, src.height + 2); x.drawImage(src, 1, 1); return p; };
  let c = spriteFrom(rows, lifePal(kind, L));
  c = mode === 'none' ? pad(c) : outlined(c, mode === 'black' ? ART.outline : mix(lifePal(kind, L).D || '#000000', '#000000', 0.6));
  if (dir === 'w') c = flipped(c);
  let ec = kind === 'scurrier' ? pad(spriteFrom(rows.map((r) => r.replace(/[^E]/g, '.')), { E: LIFE_EYESHINE })) : makeCanvas(c.width, c.height)[0];
  if (dir === 'w') ec = flipped(ec);
  const s = { c, ec, w: c.width, h: c.height };
  return (_critSprites[key] = s);
}

// ---------------------------------------------------------------------------
// Placing them when a site is entered
// ---------------------------------------------------------------------------
function placeLife(d) {
  const f = d.floor;
  d.life = null;
  if (d.hub || !f.rooms || !f.rooms.length) return;
  const cl = CLIME_LIFE[d.clime], rng = new Rng(hashInts(d.seed, d.depth, 0x11fe)), mix = (cl && cl.mix) || LIFE_MIX[d.zone] || LIFE_MIX.cave;
  const biome = T.biomes[d.biome].id, L = { crits: [], flocks: [], biome, key: cl ? d.clime : biome, wallSpots: lifeWallSpots(f), drips: [], motes: [], flakes: [], gust: null, gustT: 4 + rng.f(8) };
  // a clime's weather, the colour of its gusts, its moths (fireflies blink)
  if (cl) Object.assign(L, { weather: cl.weather, gustCol: cl.gust, moth: cl.moth, firefly: !!cl.firefly });
  d.life = L;
  const clear = (x, y) => !bodyHits(f, x, y, 2.5);
  // a clear spot in some room, away from the entry
  const spot = () => {
    for (let k = 0; k < 20; k++) {
      const r = rng.pick(f.rooms);
      if (!r.cells || !r.cells.length) continue;
      const i = rng.pick(r.cells), x = (i % f.w + 0.2 + rng.f(0.6)) * TILE, y = (Math.floor(i / f.w) + 0.2 + rng.f(0.6)) * TILE;
      if (f.tiles[i] === TILE_FLOOR && clear(x, y) && dist(x, y, (f.entry.x + 0.5) * TILE, (f.entry.y + 0.5) * TILE) > 3 * TILE) return { x, y };
    }
    return null;
  };
  for (let n = rng.i(...(mix.lizard || [0, 0])); n > 0; n--) {
    const at = spot();
    if (at) L.crits.push({ crit: 'lizard', x: at.x, y: at.y, hx: at.x, hy: at.y, dir: rng.pick(['e', 'w', 'n', 's']), state: 'idle', t: rng.f(3), vx: 0, vy: 0 });
  }
  for (let n = rng.i(...(mix.scurrier || [0, 0])); n > 0 && L.wallSpots.length; n--) {
    const w = rng.pick(L.wallSpots);
    L.crits.push({ crit: 'scurrier', x: w.x, y: w.y, dir: rng.chance(0.5) ? 'e' : 'w', state: 'idle', t: rng.f(2), vx: 0, vy: 0, hide: 0 });
  }
  for (let n = rng.i(...(mix.flock || [0, 0])); n > 0; n--) {
    const at = spot();
    if (!at) continue;
    const fl = { state: 'ground', t: 0, birds: [] };
    for (let k = rng.i(3, 5); k > 0; k--) {
      const x = at.x + rng.f(-12, 12), y = at.y + rng.f(-8, 8);
      if (!clear(x, y)) continue;
      const b = { crit: 'bird', flock: fl, x, y, z: 0, vx: 0, vy: 0, dir: rng.chance(0.5) ? 'e' : 'w', t: rng.f(2), peck: 0, wing: rng.f(1), delay: 0 };
      fl.birds.push(b); L.crits.push(b);
    }
    if (fl.birds.length) L.flocks.push(fl);
  }
  L.moths = [];
  // moths keep together, in twos and threes
  for (let n = rng.i(...(mix.moth || [0, 0])), at = null; n > 0; n--) {
    if (!at || rng.chance(0.4)) at = spot();
    if (at) L.moths.push({ x: at.x + rng.f(-8, 8), y: at.y - 8 + rng.f(-6, 6), hx: at.x, hy: at.y - 8, vx: 0, vy: 0, scared: 0, wing: rng.f(1), orbit: rng.f(Math.PI * 2) });
  }
  if (d.zone === 'surface') placeClouds(d, rng);
}

// Spots at the foot of a wall (rock above, open floor here), for scurriers.
function lifeWallSpots(f) {
  const out = [];
  for (let ty = 1; ty < f.h - 1; ty++)
    for (let tx = 1; tx < f.w - 1; tx++) {
      if (f.tiles[ty * f.w + tx] !== TILE_FLOOR || f.tiles[(ty - 1) * f.w + tx] !== TILE_ROCK) continue;
      const x = (tx + 0.5) * TILE;
      for (let y = ty * TILE + 2; y < ty * TILE + 10; y++) if (!bodyHits(f, x, y, 2.5)) { out.push({ x, y }); break; }
    }
  return out;
}

// ---------------------------------------------------------------------------
// What frightens them: the diver (more when dashing, fighting or mining),
// enemies (more when hunting), and every blast, bolt and shot.
// ---------------------------------------------------------------------------
function lifeThreats(d) {
  const p = d.p, out = [];
  const loud = p.dashT > 0 || p.swing || p.cast || p.mine || d.channel;
  out.push({ x: p.x, y: p.y, r: loud ? 60 : p.walkT > 0 ? 30 : 16 });
  for (const e of d.enemies) if (!e.dead) out.push({ x: e.x, y: e.y, r: e.aggro ? 44 : 22 });
  for (const fx of d.fx) out.push({ x: fx.x, y: fx.y, r: 64 });
  for (const b of d.bolts) out.push({ x: b.x, y: b.y, r: 26 });
  for (const s of d.shots) out.push({ x: s.x, y: s.y, r: 26 });
  return out;
}
// The nearest threat that's too close, scaled by how skittish, or null.
function lifeFear(threats, x, y, k, from = 0) {
  let best = null, bm = 0;
  for (let n = from; n < threats.length; n++) {
    const th = threats[n];
    const m = th.r * k - Math.hypot(th.x - x, th.y - y);
    if (m > bm) { bm = m; best = th; }
  }
  return best;
}

// A step that keeps clear of rock; false where it would go in.
function lifeStep(f, c, dx, dy) {
  if (bodyHits(f, c.x + dx, c.y + dy, 2.5)) return false;
  c.x += dx; c.y += dy;
  return true;
}
// Away from a threat, turning a little either way round a wall.
function lifeFlee(f, c, th, speed, dt) {
  const a0 = Math.atan2(c.y - th.y, c.x - th.x);
  for (const turn of [0, 0.5, -0.5, 1, -1, 1.6, -1.6]) {
    const a = a0 + turn, dx = Math.cos(a) * speed * dt, dy = Math.sin(a) * speed * dt;
    if (lifeStep(f, c, dx, dy)) { c.vx = dx / dt; c.vy = dy / dt; return true; }
  }
  return false;
}
const lifeDir = (vx, vy, four) => (four && Math.abs(vy) > Math.abs(vx) ? (vy < 0 ? 'n' : 's') : vx < 0 ? 'w' : 'e');

function updateLife(d, dt) {
  const L = d.life;
  if (!L || dt <= 0) return;
  const f = d.floor, th = lifeThreats(d);
  for (const c of L.crits) {
    if (c.crit === 'lizard') updateLizard(f, c, th, dt);
    else if (c.crit === 'scurrier') updateScurrier(d, c, th, dt);
  }
  for (const fl of L.flocks) updateFlock(d, fl, th, dt);
  for (const m of L.moths) updateMoth(d, m, th, dt);
  updateWeather(d, dt);
}

// Lizards bask, look about, dart a short way, and bolt from trouble.
function updateLizard(f, c, th, dt) {
  const fear = lifeFear(th, c.x, c.y, 1);
  if (fear) { c.state = 'flee'; c.t = 0.35 + Math.random() * 0.3; c.from = fear; }
  c.t -= dt;
  if (c.state === 'flee') {
    if (!lifeFlee(f, c, c.from, 95, dt)) c.t = 0;
    c.dir = lifeDir(c.vx, c.vy, true);
    if (c.t <= 0) { c.state = 'idle'; c.t = 1 + Math.random() * 2; c.hx = c.x; c.hy = c.y; }
  } else if (c.state === 'dart') {
    if (!lifeStep(f, c, c.vx * dt, c.vy * dt)) c.t = 0;
    if (c.t <= 0) { c.state = 'idle'; c.t = 0.8 + Math.random() * 3; }
  } else if (c.t <= 0) {
    if (Math.random() < 0.3) { c.dir = ['e', 'w', 'n', 's'][Math.floor(Math.random() * 4)]; c.t = 0.6 + Math.random() * 1.5; return; }
    // home is never far
    const a = Math.hypot(c.hx - c.x, c.hy - c.y) > 36 ? Math.atan2(c.hy - c.y, c.hx - c.x) + (Math.random() - 0.5) : Math.random() * Math.PI * 2;
    const sp = 40 + Math.random() * 25;
    c.vx = Math.cos(a) * sp; c.vy = Math.sin(a) * sp; c.dir = lifeDir(c.vx, c.vy, true);
    c.state = 'dart'; c.t = 0.12 + Math.random() * 0.25;
  }
}

// Scurriers keep to the foot of the walls, run along them, and when
// pressed slip into a crack, to come out later somewhere else.
function updateScurrier(d, c, th, dt) {
  const f = d.floor, L = d.life;
  if (c.state === 'gone') {
    if ((c.t -= dt) > 0) return;
    const p = d.p, far = L.wallSpots.filter((w) => Math.hypot(w.x - p.x, w.y - p.y) > 120);
    const w = far.length ? far[Math.floor(Math.random() * far.length)] : null;
    if (w) { c.x = w.x; c.y = w.y; c.state = 'idle'; c.t = 1; c.hide = 0; } else c.t = 2;
    return;
  }
  if (c.state === 'hiding') { if ((c.hide += dt * 4) >= 1) { c.state = 'gone'; c.t = 4 + Math.random() * 6; } return; }
  const fear = lifeFear(th, c.x, c.y, 1.1);
  if (fear && c.state !== 'flee') { c.state = 'flee'; c.t = 0.5 + Math.random() * 0.4; c.vx = c.x < fear.x ? -1 : 1; }
  c.t -= dt;
  const along = (sp) => {
    const dx = c.vx * sp * dt;
    // only along a wall: rock just above, open ground here
    if (!rockAt(f, c.x + dx * 4, c.y - 10) || !lifeStep(f, c, dx, 0)) return false;
    c.dir = c.vx < 0 ? 'w' : 'e';
    return true;
  };
  if (c.state === 'flee') {
    if (!along(85)) { c.vx = -c.vx; if (!along(85)) { c.state = 'hiding'; return; } }
    if (c.t <= 0) {
      if (fear) c.state = 'hiding';
      else { c.state = 'idle'; c.t = 0.6 + Math.random() * 1.5; }
    }
  } else if (c.state === 'run') {
    if (!along(45)) c.vx = -c.vx;
    if (c.t <= 0) { c.state = 'idle'; c.t = 0.5 + Math.random() * 2.5; }
  } else if (c.t <= 0) { c.state = 'run'; c.vx = Math.random() < 0.5 ? -1 : 1; c.t = 0.25 + Math.random() * 0.6; }
}

// A flock pecks about together, takes off together, flies off out of
// sight, and lands somewhere else a while later.
function updateFlock(d, fl, th, dt) {
  const f = d.floor, p = d.p;
  if (fl.state === 'ground') {
    let fear = null;
    for (const b of fl.birds) fear = fear || lifeFear(th, b.x, b.y, 1.3);
    if (fear) {
      fl.state = 'fly'; fl.t = 5 + Math.random() * 2;
      const a0 = Math.atan2(fl.birds[0].y - fear.y, fl.birds[0].x - fear.x);
      for (const b of fl.birds) {
        const a = a0 + (Math.random() - 0.5) * 0.7, sp = 55 + Math.random() * 20;
        b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp; b.delay = Math.random() * 0.25; b.dir = b.vx < 0 ? 'w' : 'e';
      }
      return;
    }
    for (const b of fl.birds) {
      if ((b.t -= dt) > 0) continue;
      const r = Math.random();
      if (r < 0.45) { b.peck = 0.25; b.t = 0.3 + Math.random() * 0.8; }
      else if (r < 0.7) { b.dir = b.dir === 'e' ? 'w' : 'e'; b.t = 0.5 + Math.random(); }
      else {
        // a hop
        const dx = (b.dir === 'e' ? 1 : -1) * (2 + Math.random() * 3), dy = (Math.random() - 0.5) * 3;
        lifeStep(f, b, dx, dy); b.z = 2; b.t = 0.5 + Math.random();
      }
    }
    for (const b of fl.birds) { b.peck = Math.max(0, b.peck - dt); b.z = Math.max(0, b.z - dt * 20); }
  } else if (fl.state === 'fly' || fl.state === 'land') {
    let down = 0;
    for (const b of fl.birds) {
      if (b.delay > 0) { b.delay -= dt; continue; }
      b.wing += dt * 9;
      if (fl.state === 'fly') {
        b.z = Math.min(40, b.z + dt * (b.z < 10 ? 34 : 14));
        b.x += b.vx * dt; b.y += b.vy * dt;
      } else {
        // gliding down to the landing spot
        const dx = b.tx - b.x, dy = b.ty - b.y, m = Math.hypot(dx, dy);
        if (m < 2) { b.x = b.tx; b.y = b.ty; b.z = Math.max(0, b.z - dt * 30); }
        else { const sp = Math.min(55, m * 1.2 + 12); b.x += (dx / m) * sp * dt; b.y += (dy / m) * sp * dt; b.z = Math.min(b.z, m * 0.35); b.dir = dx < 0 ? 'w' : 'e'; }
        if (b.z <= 0 && m < 2) down++;
      }
    }
    if (fl.state === 'fly' && (fl.t -= dt) <= 0) { fl.state = 'away'; fl.t = 6 + Math.random() * 8; }
    if (fl.state === 'land' && down === fl.birds.length) { fl.state = 'ground'; for (const b of fl.birds) { b.z = 0; b.t = Math.random(); } }
  } else if (fl.state === 'away' && (fl.t -= dt) <= 0) {
    // somewhere open, well away from the diver
    const rooms = f.rooms.filter((r) => r.cells && r.cells.length && Math.hypot((r.cx + 0.5) * TILE - p.x, (r.cy + 0.5) * TILE - p.y) > 160);
    const r = rooms.length ? rooms[Math.floor(Math.random() * rooms.length)] : null;
    if (!r) { fl.t = 3; return; }
    const i = r.cells[Math.floor(Math.random() * r.cells.length)], cx = (i % f.w + 0.5) * TILE, cy = (Math.floor(i / f.w) + 0.5) * TILE;
    const a = Math.random() * Math.PI * 2;
    for (const b of fl.birds) {
      let tx = cx + (Math.random() - 0.5) * 22, ty = cy + (Math.random() - 0.5) * 14;
      if (bodyHits(f, tx, ty, 2.5)) { tx = cx; ty = cy; }
      b.tx = tx; b.ty = ty; b.x = tx + Math.cos(a) * 140; b.y = ty + Math.sin(a) * 140; b.z = 40; b.delay = Math.random() * 0.3;
    }
    fl.state = 'land';
  }
}

// Moths wander about where they live, come to the lamp when the diver is
// near and quiet, and scatter at anything sudden.
function updateMoth(d, m, th, dt) {
  const f = d.floor, p = d.p;
  m.wing += dt * 12;
  const fear = lifeFear(th, m.x, m.y + 8, 1, 1) || (th[0].r > 30 && lifeFear([th[0]], m.x, m.y + 8, 1.2));
  if (fear) {
    m.scared = 1.2 + Math.random() * 0.6;
    const a = Math.atan2(m.y - fear.y, m.x - fear.x) + (Math.random() - 0.5);
    m.vx = Math.cos(a) * 70; m.vy = Math.sin(a) * 70;
  }
  let ax = 0, ay = 0;
  if (m.scared > 0) {
    m.scared -= dt;
    if (m.scared <= 0) { m.hx = m.x; m.hy = m.y; }
  } else {
    const lamp = Math.hypot(p.x - m.x, p.y - 17 - m.y);
    let tx = m.hx, ty = m.hy;
    if (lamp < 110) {
      // round the lamp, never quite at it
      m.orbit += dt * 1.6;
      tx = p.x + Math.cos(m.orbit) * 16; ty = p.y - 18 + Math.sin(m.orbit) * 9;
    }
    const k = Math.hypot(tx - m.x, ty - m.y) > 14 ? 70 : 10;
    ax = (tx - m.x) / Math.max(1, Math.hypot(tx - m.x, ty - m.y)) * k + (Math.random() - 0.5) * 160;
    ay = (ty - m.y) / Math.max(1, Math.hypot(tx - m.x, ty - m.y)) * k + (Math.random() - 0.5) * 160;
  }
  m.vx += ax * dt; m.vy += ay * dt;
  const sp = Math.hypot(m.vx, m.vy), max = m.scared > 0 ? 70 : 22;
  if (sp > max) { m.vx *= max / sp; m.vy *= max / sp; }
  // they fly, but not into rock
  if (rockAt(f, m.x + m.vx * dt, m.y + 8)) m.vx = -m.vx * 0.5;
  if (rockAt(f, m.x, m.y + 8 + m.vy * dt)) m.vy = -m.vy * 0.5;
  m.x += m.vx * dt; m.y += m.vy * dt;
}

// ---------------------------------------------------------------------------
// Weather
// ---------------------------------------------------------------------------
const _lifeClouds = [];
// A soft cloud shadow: a few overlapping blobs, dithered out at the edges
// (drawn a little wider than cloudSize, as the soft rim barely shows), w × h
// art px.
function lifeCloudCanvas(seed, w, h) {
  const rng = new Rng(seed), blobs = [];
  for (let k = rng.i(4, 6); k > 0; k--) blobs.push({ x: w * rng.f(0.3, 0.7), y: h * rng.f(0.35, 0.65), r: Math.min(w, h * 1.6) * rng.f(0.22, 0.36) });
  const [c, x] = makeCanvas(w, h), img = x.createImageData(w, h), D = img.data;
  for (let y = 0; y < h; y++)
    for (let i = 0; i < w; i++) {
      let v = 0;
      for (const b of blobs) { const dx = (i - b.x) / b.r, dy = ((y - b.y) * 1.5) / b.r; v = Math.max(v, 1 - Math.hypot(dx, dy)); }
      // ragged with noise, soft at the rim
      v = clamp(v * 1.5 + wallNoise(i / AP + seed % 97, y / AP, 11) * 0.3, 0, 1);
      if (v > bayerAt(i, y)) D[(y * w + i) * 4 + 3] = 255;
    }
  x.putImageData(img, 0, 0);
  return c;
}

function placeClouds(d, rng) {
  const L = d.life, S = SURFACE_LIGHT, f = d.floor;
  if (!_lifeClouds.length) for (let k = 0; k < 3; k++) { const w = Math.round(1.4 * ATILE * (S.cloudSize[0] + (k * (S.cloudSize[1] - S.cloudSize[0])) / 2)); _lifeClouds.push(lifeCloudCanvas(0xc10d + k, w, Math.round(w * 0.6))); }
  const a = rng.f(-0.5, 0.5) + (rng.chance(0.5) ? 0 : Math.PI);
  L.wind = { x: Math.cos(a), y: Math.sin(a) * 0.5 };
  L.clouds = [];
  for (let k = 0; k < 6; k++) L.clouds.push({ img: _lifeClouds[k % 3], x: rng.f(f.w * TILE), y: rng.f(f.h * TILE) });
}

function updateWeather(d, dt) {
  const L = d.life, f = d.floor, p = d.p, vw = View.ww || 192, vh = View.wh || 300;
  if (L.clouds) {
    const W = f.w * TILE + 300, H = f.h * TILE + 300, S = SURFACE_LIGHT.cloudSpeed;
    for (const c of L.clouds) {
      c.x = ((c.x + L.wind.x * S * dt + 150) % W + W) % W - 150;
      c.y = ((c.y + L.wind.y * S * dt + 150) % H + H) % H - 150;
    }
    lifeFlakes(d, dt, vw, vh);
    // now and then a gust of dust along the wind
    if (L.gust) {
      L.gust.t += dt;
      for (const g of L.gust.bits) g.x += g.v * dt * L.gust.dir;
      if (L.gust.t > L.gust.max) L.gust = null;
    } else if ((L.gustT -= dt) <= 0) {
      L.gustT = 10 + Math.random() * 14;
      const dir = L.wind.x < 0 ? -1 : 1, y0 = p.y - vh * 0.35 + Math.random() * vh * 0.5, bits = [];
      for (let k = 0; k < 60; k++) bits.push({ x: p.x - dir * (vw / 2 + 10 + Math.random() * 220), y: y0 + (Math.random() - 0.5) * 34 + Math.random() * 10, v: 110 + Math.random() * 70, len: 1 + Math.floor(Math.random() * 3), a: 0.35 + Math.random() * 0.4, ph: Math.random() * 6 });
      L.gust = { t: 0, max: (vw + 260) / 110, dir, bits };
    }
  } else {
    // drips off the walls near the diver, and dust in the lamp (where
    // there's lava, sparks rise instead)
    lifeFlakes(d, dt, vw, vh);
    for (const k of L.drips) k.t += dt;
    L.drips = L.drips.filter((k) => k.t < k.fall + 0.3);
    const wet = L.weather === 'drips' ? 3 : L.weather === 'heat' ? 0 : 1;
    if (Math.random() < dt * 0.7 * wet && L.drips.length < 3 * wet) {
      const near = L.wallSpots.filter((w) => Math.abs(w.x - p.x) < vw / 2 && Math.abs(w.y - p.y) < vh / 2);
      const w = near[Math.floor(Math.random() * near.length)];
      if (w) L.drips.push({ x: w.x + Math.round((Math.random() - 0.5) * 10), y0: w.y - 9, y1: w.y + 1 + Math.random() * 3, t: 0, fall: 0.35 });
    }
    if (L.motes.length < 8) L.motes.push({ x: p.x + (Math.random() - 0.5) * 120, y: p.y - 10 + (Math.random() - 0.5) * 90, ph: Math.random() * 6 });
    for (const m of L.motes) {
      m.x += Math.sin(Game.realT * 0.5 + m.ph) * 3 * dt; m.y += (2 + Math.cos(Game.realT * 0.4 + m.ph)) * dt;
      // the dust keeps round the diver
      if (Math.abs(m.x - p.x) > 70) m.x = p.x - Math.sign(m.x - p.x) * 69;
      if (Math.abs(m.y - p.y + 10) > 50) m.y = p.y - 10 - Math.sign(m.y - p.y + 10) * 49;
    }
  }
}

// A clime's weather in the air round the diver: snow, falling embers,
// pollen, or sparks rising off lava. Kept in a box about the view.
const LIFE_FLAKES = { snow: 46, embers: 18, pollen: 22, heat: 14 };
function lifeFlakes(d, dt, vw, vh) {
  const L = d.life, n = LIFE_FLAKES[L.weather];
  if (!n) return;
  const p = d.p, w = L.wind || { x: 0.3, y: 0 }, bx = vw / 2 + 12, by = vh / 2 + 12, cy = p.y - 20;
  while (L.flakes.length < n) L.flakes.push({ x: p.x + (Math.random() * 2 - 1) * bx, y: cy + (Math.random() * 2 - 1) * by, ph: Math.random() * 6, s: 0.6 + Math.random() * 0.8, t: Math.random() * 3 });
  for (const k of L.flakes) {
    k.t += dt;
    if (L.weather === 'snow') { k.x += (w.x * 10 + Math.sin(k.t * 1.5 + k.ph) * 6) * dt * k.s; k.y += 16 * k.s * dt; }
    else if (L.weather === 'embers') { k.x += (w.x * 6 + Math.sin(k.t + k.ph) * 4) * dt; k.y += 6 * k.s * dt; }
    else if (L.weather === 'pollen') { k.x += (w.x * 8 + Math.sin(k.t * 0.7 + k.ph) * 5) * dt; k.y += Math.cos(k.t * 0.9 + k.ph) * 4 * dt; }
    else { k.x += Math.sin(k.t * 2 + k.ph) * 4 * dt; k.y -= 14 * k.s * dt; if (k.t > 2.5) { k.t = 0; k.x = p.x + (Math.random() * 2 - 1) * 70; k.y = p.y + Math.random() * 30; } }
    // round the box
    if (k.x < p.x - bx) k.x += 2 * bx; else if (k.x > p.x + bx) k.x -= 2 * bx;
    if (k.y < cy - by) k.y += 2 * by; else if (k.y > cy + by) k.y -= 2 * by;
  }
}

// ---------------------------------------------------------------------------
// Drawing: the critters on the ground among the actors (render.js sorts them
// by their feet), what flies on top before the light, and the cloud shadows
// over the lit scene.
// ---------------------------------------------------------------------------
function lifeActors(d) {
  const L = d.life;
  return L ? L.crits.filter((c) => c.state !== 'gone' && !(c.flock && c.flock.state === 'away')) : [];
}

function drawCritter(d, c, ox, oy) {
  const fx = Math.round(c.x * AP) + ox, fy = Math.round(c.y * AP) + oy;
  if (fx < -30 || fy < -90 || fx > View.w + 30 || fy > View.h + 90) return;
  const x = View.ctx;
  if (c.crit === 'bird') {
    // in the air it's drawn with what flies; here only its shadow
    x.fillStyle = 'rgba(0,0,0,0.3)';
    if (c.z > 3) { x.fillRect(fx - 2 + Math.round(c.z * 0.15 * AP), fy, ap(3), 1); return; }
    x.fillRect(fx - ap(2), fy, ap(4), 1);
    const s = critSprite('bird', d.life, c.peck > 0 ? 1 : 0, c.dir);
    drawArtSprite(s, fx - Math.round(s.w / 2), fy - s.h + Math.round(footOff(2)) - Math.round(c.z * AP));
    return;
  }
  const moving = c.state === 'flee' || c.state === 'dart' || c.state === 'run';
  const s = critSprite(c.crit, d.life, moving ? Math.floor(Game.realT * 14) % 2 : 0, c.dir);
  const sx = fx - Math.round(s.w / 2), sy = fy - s.h + Math.round(footOff(3));
  if (c.state === 'hiding') {
    // into a crack: sinking into the wall's foot, cut off at the ground
    const k = 1 - c.hide, hk = Math.max(1, Math.round(s.h * k)), y0 = Math.round(ap(4) * c.hide);
    x.drawImage(s.c, 0, 0, s.w, hk, sx, sy + s.h - hk - y0, s.w, hk);
    return;
  }
  if (d.zone === 'surface') { x.fillStyle = 'rgba(0,0,0,0.28)'; x.fillRect(fx - Math.floor(s.w / 2) + 1, fy + 1, s.w - 2, 1); }
  drawArtSprite(s, sx, sy);
}

// Before the light: flying birds, moths, dust, drips.
const LIFE_WINGS = [[[-3, -1], [-2, -1], [-1, 0], [0, 0], [1, 0], [2, -1], [3, -1], [0, 1]], [[-3, 0], [-2, 1], [-1, 1], [0, 0], [1, 1], [2, 1], [3, 0], [0, 1]]];
function drawLifeAir(d, ox, oy, lights) {
  const L = d.life;
  if (!L) return;
  for (const fl of L.flocks) {
    if (fl.state !== 'fly' && fl.state !== 'land') continue;
    const col = lifePal('bird', L).D;
    for (const b of fl.birds) {
      if (b.z <= 3) continue;
      const bx = Math.round(b.x * AP) + ox, by = Math.round((b.y - b.z) * AP) + oy;
      if (bx < -6 || by < -6 || bx > View.w + 6 || by > View.h + 6) continue;
      for (const [i, j] of LIFE_WINGS[Math.floor(b.wing) % 2]) dot(bx + i, by + j, col);
    }
  }
  if (L.moths.length) {
    const col = L.moth || LIFE_MOTH[L.biome], dim = mix(col, '#000000', 0.45);
    for (const m of L.moths) {
      const mx = Math.round(m.x * AP) + ox, my = Math.round(m.y * AP) + oy;
      if (mx < -4 || my < -4 || mx > View.w + 4 || my > View.h + 4) continue;
      // a firefly: only its light, blinking slowly
      if (L.firefly) {
        const k = clamp(Math.sin(Game.realT * 1.7 + m.orbit * 3) * 1.6 + 0.4, 0, 1);
        if (k <= 0) continue;
        dot(mx, my, col, true, k); dot(mx, my + 1, dim, true, k * 0.6);
        if (k > 0.6) for (const [i, j] of [[-1, 0], [1, 0], [0, -1]]) dot(mx + i, my + j, dim, true, k * 0.5);
        lights.push({ x: mx, y: my, r: 16, i: 0.45 * k, c: rgb01(col) });
        continue;
      }
      const open = Math.floor(m.wing) % 2 === 0;
      dot(mx, my, col, true); dot(mx, my + 1, dim, true);
      if (open) for (const [i, j] of [[-1, -1], [1, -1], [-2, -1], [2, -1], [-1, 0], [1, 0]]) dot(mx + i, my + j, j < 0 && (i === -1 || i === 1) ? col : dim, true);
      else for (const [i, j] of [[-1, 0], [1, 0], [-1, 1], [1, 1]]) dot(mx + i, my + j, dim, true);
      lights.push({ x: mx, y: my, r: 12, i: 0.3, c: rgb01(col) });
    }
  }
  if (L.flakes.length) {
    const W = L.weather;
    for (const k of L.flakes) {
      const fx = Math.round(k.x * AP) + ox, fy = Math.round(k.y * AP) + oy;
      if (fx < 0 || fy < 0 || fx >= View.w || fy >= View.h) continue;
      if (W === 'snow') { dot(fx, fy, '#f4f8ff', false, 0.85); if (k.s > 1.15) dot(fx + 1, fy, '#dce6f4', false, 0.6); }
      else if (W === 'pollen') dot(fx, fy, '#f0f0a8', true, 0.35 + 0.25 * Math.sin(k.t * 3 + k.ph));
      else { const a = W === 'heat' ? 1 - k.t / 2.5 : 0.5 + 0.5 * Math.sin(k.t * 6 + k.ph); dot(fx, fy, k.ph > 3 ? '#ffb040' : '#ff6a20', true, clamp(a, 0, 1)); }
    }
  }
  const x = View.ctx;
  if (L.gust) {
    const g = L.gust, k = Math.min(1, g.t * 2, (g.max - g.t) * 2);
    x.fillStyle = L.gustCol || '#e8cc98';
    for (const b of g.bits) {
      const bx = Math.round(b.x * AP) + ox, by = Math.round((b.y + Math.sin(g.t * 5 + b.ph) * 2) * AP) + oy, len = ap(b.len);
      if (bx < -6 || bx > View.w + 6 || by < 0 || by > View.h) continue;
      x.globalAlpha = b.a * k;
      x.fillRect(bx - (g.dir > 0 ? len : 0), by, len, 1);
    }
    x.globalAlpha = 1;
  }
  for (const k of L.drips) {
    const dx = Math.round(k.x * AP) + ox;
    if (k.t < k.fall) { const u = k.t / k.fall; x.fillStyle = 'rgba(190,210,235,0.8)'; x.fillRect(dx, Math.round(lerp(k.y0, k.y1, u * u) * AP) + oy, 1, ap(2)); }
    else { const u = (k.t - k.fall) / 0.3, sy = Math.round(k.y1 * AP) + oy + 1, r = 1 + Math.round(u * 3); x.fillStyle = `rgba(190,210,235,${0.6 * (1 - u)})`; x.fillRect(dx - r, sy, 1, 1); x.fillRect(dx + r, sy, 1, 1); x.fillRect(dx, sy - 1, 1, 1); }
  }
  if (L.motes.length) {
    x.fillStyle = '#c8c4b8';
    for (const m of L.motes) { x.globalAlpha = 0.25 + 0.2 * Math.sin(Game.realT * 2 + m.ph); x.fillRect(Math.round(m.x * AP) + ox, Math.round(m.y * AP) + oy, 1, 1); }
    x.globalAlpha = 1;
  }
}

// After the light: cloud shadows, fading as the sun goes down.
function drawLifeShade(d, ox, oy) {
  const L = d.life;
  if (!L || !L.clouds) return;
  const a = (1 - SURFACE_LIGHT.cloudDark) * clamp((d.pull - 0.2) * 2.5, 0, 1);
  if (a <= 0.01) return;
  const x = View.ctx;
  x.globalAlpha = a;
  for (const c of L.clouds) {
    const cx = Math.round(c.x * AP) + ox, cy = Math.round(c.y * AP) + oy;
    if (cx > View.w || cy > View.h || cx + c.img.width < 0 || cy + c.img.height < 0) continue;
    x.drawImage(c.img, cx, cy);
  }
  x.globalAlpha = 1;
}
