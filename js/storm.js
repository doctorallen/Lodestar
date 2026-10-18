'use strict';
// ---------------------------------------------------------------------------
// What the world does on its own. Some expeditions set out under a
// Lodestorm: on the surface, every so often the sky strikes a spot near the
// diver, marked a moment before, hurting whatever stands there; a strike
// that finds an ore vein charges it into the biome's better ore. And an
// open rift doesn't wait: every so often something rift-touched comes
// through it, an elite, and sealing the tear while they live leaves more
// riftglass.
// ---------------------------------------------------------------------------

function updateWorld(d, dt) {
  updateStorm(d, dt);
  updateRiftSpawns(d, dt);
}

// --- the Lodestorm -------------------------------------------------------
function stormHere(d) { return d.storm && d.zone === 'surface' && !d.hub; }

function updateStorm(d, dt) {
  if (!stormHere(d)) return;
  const S = T.storm, f = d.floor;
  if (!d.strike && (d.stormT = (d.stormT === undefined ? S.first : d.stormT) - dt) <= 0) {
    d.stormT = S.every;
    // a spot near the diver: now and then on a vein, else on open ground
    const tx = Math.floor(d.p.x / TILE), ty = Math.floor(d.p.y / TILE), R = S.near;
    let at = null;
    if (d.rng.chance(S.onOre)) {
      const veins = [];
      for (let y = ty - R; y <= ty + R; y++) for (let x = tx - R; x <= tx + R; x++) if (floorTile(f, x, y) === TILE_ORE) veins.push({ x, y });
      if (veins.length) { const v = d.rng.pick(veins); at = { x: (v.x + 0.5) * TILE, y: (v.y + 0.5) * TILE, vein: v }; }
    }
    for (let k = 0; !at && k < 12; k++) {
      const x = tx + d.rng.i(-R, R), y = ty + d.rng.i(-R, R);
      if (floorTile(f, x, y) === TILE_FLOOR) at = { x: (x + 0.5) * TILE, y: (y + 0.5) * TILE };
    }
    if (at) d.strike = Object.assign(at, { t: S.warn });
  }
  const s = d.strike;
  if (s && (s.t -= dt) <= 0) {
    d.strike = null;
    d.fx.push({ kind: 'strike', x: s.x, y: s.y, t: 0.35, max: 0.35 });
    spawnSparks(s.x, s.y - 4, ['#ffffff', '#fff2a0', '#9fd8ff'], 24);
    buzz(20);
    if (dist(s.x, s.y, d.p.x, d.p.y) < S.radius) hurtPlayer(S.dmg * Math.pow(T.enemies.dmgGrowth, floorLevel(d) - 1), { storm: true });
    for (const e of d.enemies) if (!e.dead && dist(e.x, e.y, s.x, s.y) < S.radius + e.r) hurtEnemy(e, S.dmg * 2, { spell: true, element: 'shock', noProc: true });
    // a vein struck is charged into the better ore
    if (s.vein && floorTile(f, s.vein.x, s.vein.y) === TILE_ORE) {
      const ores = T.biomes[d.biome].ores;
      f.ore[s.vein.y * f.w + s.vein.x] = ORE_INDEX[ores[ores.length - 1]] + 1;
      repaintAround(f, s.vein.x, s.vein.y);
      UI.toast('The strike charged a vein', 'legendary');
    }
  }
}

// The mark before a strike, and the strike itself, drawn among the lit scene.
function drawStorm(d, ox, oy, lights) {
  const s = d.strike;
  if (s) lights.push({ x: Math.round(s.x + ox), y: Math.round(s.y + oy), r: TILE * 1.5, i: 0.3 + (1 - s.t / T.storm.warn) * 0.6, c: [1, 0.95, 0.7] });
  for (const fx of d.fx) {
    if (fx.kind !== 'strike') continue;
    const k = fx.t / fx.max, x = Math.round(fx.x + ox), y = Math.round(fx.y + oy);
    // a jagged bolt from the top of the view
    let bx = x;
    for (let yy = Math.max(0, y - 140); yy < y; yy++) {
      if (yy % 3 === 0) bx += Math.round((hashInts(yy, x) % 3) - 1);
      dot(bx - 1, yy, '#1a0c06', false, k); dot(bx + 2, yy, '#1a0c06', false, k);
      dot(bx, yy, '#ffffff', true, k); dot(bx + 1, yy, '#cfe8ff', true, k);
    }
    lights.push({ x, y, r: TILE * 5, i: 2 * k, c: [0.8, 0.9, 1] });
  }
}

// The mark before a strike, over the lit scene so it reads on sunlit sand:
// a ring that tightens and flickers faster, dark outside and bright inside.
function drawStormMark(d, ox, oy) {
  const s = d.strike;
  if (!s) return;
  const c = View.ctx, k = 1 - s.t / T.storm.warn, x = Math.round(s.x + ox), y = Math.round(s.y + oy), r = T.storm.radius * (1.15 - k * 0.35);
  const on = Math.floor(Game.realT * (6 + k * 18)) % 2 === 0;
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2, cx = Math.cos(a), cy = Math.sin(a) * 0.6;
    c.fillStyle = '#2a1208'; c.fillRect(Math.round(x + cx * (r + 1)), Math.round(y + cy * (r + 1)), 1, 1);
    if (on || i % 2) { c.fillStyle = k > 0.6 ? '#ffffff' : '#fff2a0'; c.fillRect(Math.round(x + cx * r), Math.round(y + cy * r), 1, 1); }
  }
  c.fillStyle = on ? '#ffffff' : '#2a1208'; c.fillRect(x, y, 1, 1);
}

// --- rifts that don't wait ------------------------------------------------
function updateRiftSpawns(d, dt) {
  const r = d.rift, R = T.rifts;
  if (!r || !r.open || r.kind === 'gate') return;
  if ((r.spawnT = (r.spawnT === undefined ? R.spawnEvery : r.spawnT) - dt) > 0) return;
  r.spawnT = R.spawnEvery;
  if (d.enemies.filter((e) => e.riftTouched && !e.dead).length >= R.spawnMax) return;
  const type = d.rng.pick(['crawler', 'wisp', 'construct']);
  const e = makeEnemy(type, (r.x + 0.5) * TILE, (r.y + 1.2) * TILE, floorLevel(d) + 1, d.rng.pick(ELITE_AFFIXES));
  e.riftTouched = true;
  if (bodyHits(d.floor, e.x, e.y, e.r)) e.y = (r.y + 0.5) * TILE;
  d.enemies.push(e);
  spawnSparks(e.x, e.y - 6, [RIFT_PAL.riftedge[0], RIFT_PAL.riftcyan[0]], 12);
  Story.say('riftSpawn');
}
// Sealing pays one more riftglass for each rift-touched thing still alive.
function riftTouchedAlive(d) { return d.enemies.filter((e) => e.riftTouched && !e.dead).length; }
