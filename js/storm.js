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
  updateHazards(d, dt);
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
    snd('thunder', { x: s.x, y: s.y, g: 1 });
    buzz(20);
    if (dist(s.x, s.y, d.p.x, d.p.y) < S.radius) hurtPlayer(S.dmg * Math.pow(T.enemies.dmgGrowth, floorLevel(d) - 1), { storm: true });
    for (const e of d.enemies) if (!e.dead && dist(e.x, e.y, s.x, s.y) < S.radius + e.r) hurtEnemy(e, S.dmg * 2, { spell: true, element: 'shock', noProc: true });
    // a vein struck is charged into the better ore
    if (s.vein && floorTile(f, s.vein.x, s.vein.y) === TILE_ORE) {
      // into the best of the biome's ores the pick can break, if that's better
      const i = s.vein.y * f.w + s.vein.x, pick = Save.data.equip.pick ? Save.data.equip.pick.base.power : 1;
      const best = T.biomes[d.biome].ores.map((id) => T.ores[ORE_INDEX[id]]).filter((o) => o.tier <= pick).pop();
      if (best && best.tier > T.ores[f.ore[i] - 1].tier) {
        f.ore[i] = ORE_INDEX[best.id] + 1;
        repaintAround(f, s.vein.x, s.vein.y);
        UI.toast(`The strike charged a vein into ${best.name}`, 'legendary');
      }
    }
  }
}

// The mark before a strike, and the strike itself, drawn among the lit scene.
function drawStorm(d, ox, oy, lights) {
  const s = d.strike;
  if (s) lights.push({ x: Math.round(s.x * AP) + ox, y: Math.round(s.y * AP) + oy, r: TILE * 1.5, i: 0.3 + (1 - s.t / T.storm.warn) * 0.6, c: [1, 0.95, 0.7] });
  for (const fx of d.fx) {
    if (fx.kind !== 'strike') continue;
    const k = fx.t / fx.max, x = Math.round(fx.x * AP) + ox, y = Math.round(fx.y * AP) + oy;
    // a bolt from the top of the view, painted as a chain's arc is
    // (castfx.js), wide and forking
    const y0 = Math.max(0, y - ap(140)), sd = hashInts(fx.x | 0, fx.y | 0, Math.floor(Game.realT * 15)), R = cfxRamp('#cfe8ff'), pts = cfxBoltPath(x + ap(6), y0, x, y, sd, 0.1);
    cfxPaintBolt(pts, R, cfxBand(k), 2.2, sd);
    const p = pts[Math.floor(pts.length * 0.45)];
    if (p) cfxPaintBolt(cfxBoltPath(p[0], p[1], p[0] + ap(14) * (sd & 1 ? 1 : -1), p[1] + ap(22), sd + 1, 0.2), R, cfxBand(k) * 0.8, 0.9, sd + 2);
    lights.push({ x, y, r: TILE * 5, i: 2 * k, c: [0.8, 0.9, 1] });
  }
}

// The mark before a strike, over the lit scene so it reads on sunlit sand:
// a ring that tightens and flickers faster, dark outside and bright inside.
function drawStormMark(d, ox, oy) {
  const s = d.strike;
  if (!s) return;
  const c = View.ctx, k = 1 - s.t / T.storm.warn, x = Math.round(s.x * AP) + ox, y = Math.round(s.y * AP) + oy, r = T.storm.radius * (1.15 - k * 0.35) * AP;
  const on = Math.floor(Game.realT * (6 + k * 18)) % 2 === 0, n = Math.round(32 * AP);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, cx = Math.cos(a), cy = Math.sin(a) * 0.6;
    c.fillStyle = '#2a1208'; c.fillRect(Math.round(x + cx * (r + 1)), Math.round(y + cy * (r + 1)), 1, 1); c.fillRect(Math.round(x + cx * (r - 2)), Math.round(y + cy * (r - 2)), 1, 1);
    if (on || i % 2) { c.fillStyle = k > 0.6 ? '#ffffff' : '#ffe060'; c.fillRect(Math.round(x + cx * r), Math.round(y + cy * r), 1, 1); c.fillRect(Math.round(x + cx * (r - 1)), Math.round(y + cy * (r - 1)), 1, 1); }
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
  const e = makeEnemy(type, (r.x + 0.5) * TILE, (r.y + 1.2) * TILE, floorLevel(d) + 1, rollEliteAffix(d.rng));
  e.riftTouched = true;
  if (bodyHits(d.floor, e.x, e.y, e.r)) e.y = (r.y + 0.5) * TILE;
  d.enemies.push(e);
  spawnSparks(e.x, e.y - 6, [RIFT_PAL.riftedge[0], RIFT_PAL.riftcyan[0]], 12);
  Story.say('riftSpawn');
}
// Sealing pays one more riftglass for each rift-touched thing still alive.
function riftTouchedAlive(d) { return d.enemies.filter((e) => e.riftTouched && !e.dead).length; }
