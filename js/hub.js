'use strict';
// ---------------------------------------------------------------------------
// The outpost, drawn: the Charter's base round the star, on the cleared site
// in the middle of the world (floor.js lays it out; its ground is painted
// in hubground.js). The Lodestar hangs over its planting cradle, bobbing,
// its lodelines running out across the ground towards the openings, one
// more for every magnitude, reaching further as it grows, and all the way
// and brighter towards land already kindled. Round the cradle stand the
// modules that came down with the seed (the star's altar, the locker, the
// portal's gate, the fabricator, the rune bench), the practice target and
// the Meridian uplink, and light masts, one lit for every magnitude.
// Starstone grows up the modules' feet as the star does. As territories are
// kindled the colony comes down: a lander on a pad for each, a habitat pod
// and a lamp beside it, and settlers about the plaza (story.js). These are
// drawn every frame over the painted floor.
// ---------------------------------------------------------------------------

// Each station, painted (hubart.js), its feet at ax, ay.
function stationSprite(id) {
  return { forge: hartForge, runes: hartRunes, locker: hartLocker, altar: hartAltar }[id]();
}

const STAR_AT = { x: OUTPOST_CRADLE.x, y: OUTPOST_CRADLE.y - 3.1 }; // tiles: over the cradle
// The light masts round the cradle's ring (tiles), lit one for every
// magnitude in this order: those in front first.
const LANTERNS = [67.5, 112.5, 22.5, 157.5, 337.5, 202.5, 292.5, 247.5].map((a) => {
  const r = a * Math.PI / 180;
  return [OUTPOST_CRADLE.x - 0.5 + Math.cos(r) * 4.5, OUTPOST_CRADLE.y + 0.3 + Math.sin(r) * 3.5];
});

// Under everything that walks: the lodelines across the ground, the forge's
// light on the ground, the stations' lights. (The stations, masts, landers
// and pods stand among the walkers: hubProps.)
function drawHubUnder(d, ox, oy, tick, lights) {
  const star = ART.pal.star;
  drawHubLodelines(d, ox, oy, lights);
  // the forge's fire on the ground before it, flickering
  const fg = HUB_STATIONS.find((s) => s.id === 'forge'), fp = stationAt(fg, ox, oy), sp = hartForgeSpill(Math.floor(Game.realT * 7) % 2), fs = hartForge();
  drawArtSprite(sp, fp.x - fs.ax + HART_MOUTH.x - sp.ax, fp.y + 1);
  for (const s of HUB_STATIONS) {
    if (s.id === 'dummy' || s.id === 'wreck' || s.id === 'setout') continue;
    const at = stationAt(s, ox, oy), spr = stationSprite(s.id);
    const glow = { forge: [ART.pal.glass[0], 2.2, 1.0], runes: [ART.pal.arcane[0], 1.2, 0.5], locker: [DIVER_PAL.circuit[0], 1, 0.4], altar: [star[3], 1.6, 0.8] }[s.id];
    const gx = s.id === 'forge' ? at.x - spr.ax + HART_MOUTH.x : at.x, gy = s.id === 'forge' ? at.y - spr.ay + HART_MOUTH.y : at.y - (spr.ay >> 1);
    const fl = s.id === 'forge' ? 0.8 + 0.12 * Math.sin(Game.realT * 11) + 0.08 * Math.sin(Game.realT * 23) : 0.85 + 0.15 * Math.sin(Game.realT * 3);
    lights.push({ x: gx, y: gy, r: TILE * glow[1], i: glow[2] * fl * introWake(s.id), c: rgb01(glow[0]) });
  }
}
// The lodelines: one along each path out to an opening for every
// magnitude (the nearest openings first), each reaching further as the
// star grows (T.outpost.lode), in broken strokes of gold running outward;
// towards kindled land brighter and all the way, towards the dark faint.
function drawHubLodelines(d, ox, oy, lights) {
  const f = d.floor, S = f.site, L = T.outpost.lode, mag = hubStarMag(d), G = HART.star;
  if (!S || mag <= 0) return;
  const len = (p) => Math.hypot(p.bx - p.ax, p.by - p.ay), order = S.paths.map((p, k) => k).sort((a, b) => len(S.paths[a]) - len(S.paths[b]));
  // (in the opening's last shot they run out once the star has lit: intro.js)
  const run = Intro.hub ? Intro.hub.lode : 1, reach = (L.reach[0] + L.reach[1] * (mag - 1)) * run, t = Game.realT;
  if (run <= 0) return;
  for (const k of order.slice(0, mag)) {
    const p = S.paths[k], lit = isKindled(p.to), n = len(p), far = Math.min(n, lit ? n * run : reach), ux = (p.bx - p.ax) / n, uy = (p.by - p.ay) / n;
    // (in art px along it from the ring's edge, wandering a little either
    // side of the path's middle)
    const N = Math.floor(far * ATILE), x0 = p.ax * ATILE + ox, y0 = p.ay * ATILE + oy;
    for (let i = 0; i < N; i++) {
      const k2 = i / ATILE / far, gap = artHash(Math.floor((i - t * L.speed * (lit ? 1 : 0.5)) / 4), k, 0x10de);
      if (gap < 0.18 + k2 * k2 * (lit ? 0.35 : 0.7)) continue;
      const side = Math.sin(i * 0.07 + k) * 1.5, x = Math.round(x0 + ux * i - uy * side), y = Math.round(y0 + uy * i + ux * side);
      dot(x, y, k2 < 0.3 ? G[5] : k2 < 0.7 ? G[4] : G[3], true, (lit ? 1 : L.dark) * (1 - k2 * 0.6));
    }
    if (lit) lights.push({ x: Math.round(x0 + ux * N * 0.5), y: Math.round(y0 + uy * N * 0.5), r: TILE * 2, i: 0.25, c: rgb01(G[4]) });
  }
}
// Where a station's feet are on the view (its tile's middle, a little
// south).
function stationAt(s, ox, oy) { return { x: Math.round((s.x + 0.5) * ATILE) + ox, y: Math.round((s.y + 0.5) * ATILE) + oy + ap(6) }; }
function drawHubStation(d, a, ox, oy, lights) {
  const s = a.station, at = stationAt(s, ox, oy), spr = stationSprite(s.id), x = at.x - spr.ax, y = at.y - spr.ay;
  drawArtSprite(spr, x, y);
  if (s.id === 'forge') {
    const fire = hartForgeFire(Math.floor(Game.realT * 9) % 3);
    drawArtSprite(fire, x + HART_MOUTH.x - fire.ax, y + HART_MOUTH.y - fire.ay);
    // the press's ram, keeping the smith's beat once there's a smith, and
    // the work glowing on the bed under it
    const beat = settlementSize() >= 1 ? hubPressBeat(Game.realT) : null, ram = hartPressRam(beat ? Math.round(beat.ext * HART_RAM.travel) : 0);
    drawArtSprite(ram, x + HART_RAM.x, y + HART_RAM.y);
    if (beat) for (let i = -2; i <= 2; i++) dot(x + HART_ANVIL.x + i, y + HART_ANVIL.y, beat.hit >= 0 && beat.hit < 0.4 ? '#fff6dc' : Math.abs(i) < 2 ? '#ffd27a' : '#d85c18', true);
    // the status lights, the first blinking
    if (Math.floor(Game.realT * 1.7) % 3 === 0) dot(x + HART_LEDS[0][0], y + HART_LEDS[0][1], '#0c2014');
    // heat off the vent stack, a spark now and then
    for (let i = 0; i < 4; i++) {
      const ph = (Game.realT * 0.6 + i / 4) % 1, cx = x + HART_STACK.x + Math.round(Math.sin(i * 2.7 + ph * 4) * 2 + ph * 3), cy = y + HART_STACK.y - Math.round(ph * 18);
      dot(cx, cy, i % 2 ? '#5a5a62' : ph < 0.4 ? '#ffb347' : '#902a0a', i % 2 === 0, (1 - ph) * (i % 2 ? 0.5 : 1));
    }
  } else if (s.id === 'altar') {
    // the shard over the bowl, bobbing, its light
    const sh = hartShard(), by = y + spr.bowl.y - 4 + Math.round(Math.sin(Game.realT * 1.6) * 1.5);
    drawArtSprite(sh, Math.round(x + spr.bowl.x - sh.ax), by - sh.ay);
  } else if (s.id === 'runes' && Math.floor(Game.realT * 5) % 7 === 0) dot(x + spr.lamp.x, y + spr.lamp.y, '#d8f4ff', true, 0.7);
  drawStarstone(spr, x, y, s.id, lights);
  paintOcclude(x, y - 12, spr.w, spr.h + 12, at.y, ox, oy);
}

// Starstone: gold and lodestone crystal, the star's own, growing up the
// feet and edges of what the Charter set down round it, more at every
// magnitude (none at the first). Each sprite names the spots it grows from
// (spr.stone: [x, y, side] in it; hubart.js); a spot takes a cluster once
// the star has grown enough (T.outpost.stone), and the clusters grow with it.
function drawStarstone(spr, x, y, key, lights) {
  const n = hubStarMag() - 1, spots = spr.stone || [], G = T.outpost.stone;
  if (n <= 0) return;
  spots.forEach(([sx, sy, side], i) => {
    const size = n - Math.floor(i * G.spread);
    if (size <= 0) return;
    const c = hartStarstone(Math.min(G.most, Math.ceil(size / G.grow)), (hashInts(i, key.length, sx) >>> 0) % 4, side);
    drawArtSprite(c, x + sx - c.ax, y + sy - c.ay);
    if (size >= G.glowFrom) lights.push({ x: x + sx, y: y + sy - 3, r: TILE * 0.7, i: 0.3, c: rgb01(HART.star[4]) });
  });
}

// Over everything: the Lodestar itself, bigger as it grows, in its halo.
function drawHubOver(d, ox, oy, lights) {
  const mag = hubStarMag(d), k = mag >= 5 ? 3 : 2;
  // (in the opening's last shot it rises out of its cradle and lights:
  // intro.js)
  const ih = Intro.hub, lit = ih ? ih.lit : 1;
  const sx = Math.round(STAR_AT.x * ATILE) + ox, sy = Math.round(STAR_AT.y * ATILE + Math.sin(Game.realT * 1.2) * 2 * AP) + oy + (ih ? Math.round(ih.starDY) : 0);
  const pulse = d.feedT > 0 ? d.feedT : 0, hum = d.feedHum || 0, halo = hartHalo(k, Math.floor(Game.realT * 3) % 2), st = hartStar(k);
  // the ores rising into it, behind it as they arrive
  drawStarFeed(d, ox, oy, lights);
  View.ctx.globalAlpha = 0.8 * lit;
  View.ctx.drawImage(halo.c, sx - halo.ax, sy - halo.ay - 4);
  View.ctx.globalAlpha = View.emCtx.globalAlpha = 0.35 + 0.65 * lit;
  drawArtSprite(st, sx - st.ax, sy - st.ay);
  View.ctx.globalAlpha = View.emCtx.globalAlpha = 1;
  // its light: a pool on the ground round the cradle, wider and brighter
  // as it grows (T.outpost.pool), from a little under the star; brighter
  // while it's fed, swelling as each ore lands
  const P = T.outpost.pool, cy = Math.round((STAR_AT.y + OUTPOST_CRADLE.y) / 2 * ATILE) + oy;
  lights.push({ x: sx, y: cy, r: TILE * (P.r[0] + P.r[1] * mag + pulse * 3 + hum * 2) * (0.35 + 0.65 * lit), i: (P.i[0] + P.i[1] * mag + pulse + hum * 0.6) * (0.3 + 0.7 * lit), c: rgb01(ART.pal.star[2]) });
  if (hum > 0.05) cfxStrokeRing(sx, sy - 4, (14 + hum * 6) * AP, (14 + hum * 6) * AP * 0.75, cfxRamp(ART.pal.star[2]), hum * 0.5, 7177, false, 0.45);
  if (pulse > 0) ringDots(sx, sy, (20 + (1 - pulse) * 30) * AP, ART.pal.star[3], pulse, true);
}

// Setting a shard at the altar: motes stream up into the star, and it pulses.
function feedStarFx(d, n, grew) {
  const alt = HUB_STATIONS.find((s) => s.id === 'altar');
  for (let i = 0; i < Math.min(40, 6 + n); i++) d.fx.push({ kind: 'mote', x: (alt.x + 0.5) * TILE, y: (alt.y + 0.5) * TILE - 6, t: 1 + i * 0.03, max: 1 + i * 0.03, seed: i });
  d.feedT = 1;
  if (grew) UI.toast(`The Lodestar grows: magnitude ${grew}`, 'legendary');
}

// ---------------------------------------------------------------------------
// Feeding the star: hold FEED THE STAR at the altar, and mote after mote of
// the light the Kindler's deeds earned (deeds.js) rises from their hands,
// bows up over the altar's bowl and drops into the star, faster the longer
// it's held; let go and it stops. Deeplight goes first and heartlight last,
// and the flow rests a beat before each new kind. Each mote leaves the stash
// and its point joins the star's at once, so the save is never between the
// two; the star is drawn as it was until each mote lands in it (hubStarMag),
// and a magnitude is reached, with its weight, when the mote that makes it
// lands.
// ---------------------------------------------------------------------------

// The next light the star would take, or null.
function starFeedNextLight() {
  const s = Save.data;
  return LIGHT_IDS.find((id) => (s.stash[id] || 0) > 0) || null;
}
// The star's magnitude as drawn: what it was before the light still rising.
function hubStarMag(d = Game.dive) { return magnitudeOf(Save.data.star - ((d && d.feedFlying) || 0)); }

// The act button pressed at the altar (with no shard to set).
function startStarFeed(d) {
  if (!starFeedNextLight()) {
    UI.toast('No light to give. Kindle land and find the deep places, then bring the light home');
    return;
  }
  Story.say('firstFeed');
  d.feed = { t: 0, acc: 1, beat: 0, ore: null };
  if (typeof snd === 'function') snd('starFeedStart', {});
}
function endStarFeed(d) {
  if (!d.feed) return;
  d.feed = null;
  Save.save();
  if (typeof snd === 'function') snd('starFeedEnd', {});
}

// Each step at home: the hold's flow, and the light in the air.
function updateStarFeed(d, dt) {
  const F = T.star.feed, s = Save.data;
  d.feedHum = Math.max(0, (d.feedHum || 0) - F.humFade * dt);
  // the motes in the air: each lands in the star in turn
  if (d.feedMotes && d.feedMotes.length) {
    for (const m of d.feedMotes) {
      if ((m.t += dt / F.fly) < 1) continue;
      const before = hubStarMag(d);
      d.feedFlying -= m.pts;
      d.feedHum = Math.min(1, d.feedHum + F.hum * m.tier);
      if (typeof snd === 'function') snd('starFeed', { n: m.n, tier: m.tier, rate: m.rate });
      Story.starTaste(m.ore);
      spawnSparks(STAR_AT.x * TILE, STAR_AT.y * TILE + 4, [LIGHT_KINDS[m.ore].ramp[3], LIGHT_KINDS[m.ore].ramp[2]], 1);
      const after = hubStarMag(d);
      if (after > before) {
        d.feedT = 1;
        spawnSparks(STAR_AT.x * TILE, STAR_AT.y * TILE, [ART.pal.star[3], ART.pal.star[2], '#ffffff'], 30);
        if (typeof snd === 'function') snd('starGrow', { mag: after });
        Story.starGrew(after);
      }
    }
    d.feedMotes = d.feedMotes.filter((m) => m.t < 1);
  }
  const f = d.feed;
  if (!f) return;
  if (!Input.isHeld('act') || Game.modal || actionHere() !== 'altar') { endStarFeed(d); return; }
  if (f.beat > 0) { f.beat -= dt; return; }
  f.t += dt;
  const k = Math.min(1, f.t / F.ramp), rate = F.rate0 + (F.rateMax - F.rate0) * k * k;
  f.acc += rate * dt;
  while (f.acc >= 1) {
    const id = starFeedNextLight();
    if (!id) { endStarFeed(d); return; }
    // a new kind of light: a beat's rest first
    if (f.ore && id !== f.ore) { f.ore = id; f.beat = F.beat; f.t = Math.min(f.t, F.ramp * F.beatRamp); f.acc = 0; return; }
    f.ore = id; f.acc -= 1;
    spendOre(id, 1);
    const pts = 1, p = d.p;
    s.star += pts;
    d.feedFlying = (d.feedFlying || 0) + pts;
    d.feedN = (d.feedN || 0) + 1;
    (d.feedMotes = d.feedMotes || []).push({ ore: id, tier: id === 'heartlight' ? 5 : 3, pts, n: d.feedN, rate, t: 0, x: p.x + FX_R.f(-3, 3), y: p.y - 14, seed: FX_R.f(1000) });
  }
}

// Where a rising mote is at t (0..1), in world px: from the Kindler's
// hands, bowing up over the altar's bowl, quicker as it nears the star.
function starFeedPath(m, t) {
  const alt = HUB_STATIONS.find((s) => s.id === 'altar'), u = t * (0.35 + 0.65 * t);
  const cx = (alt.x + 0.5) * TILE, cy = (alt.y + 0.5) * TILE - T.star.feed.arc, sx = STAR_AT.x * TILE, sy = STAR_AT.y * TILE;
  const a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
  return { x: a * m.x + b * cx + c * sx, y: a * m.y + b * cy + c * sy };
}
// The light in the air, each kind its own mote: heartlight a warm gold
// spark with a cross of light, a tail of embers behind; deeplight a cold
// blue-white spark wound round by a fainter twin, its tail violet.
function drawStarFeed(d, ox, oy, lights) {
  const ms = d.feedMotes;
  if (!ms || !ms.length) return;
  const F = T.star.feed, every = Math.max(1, Math.ceil(ms.length / F.lights));
  ms.forEach((m, i) => {
    const R = LIGHT_KINDS[m.ore].ramp, heart = m.ore === 'heartlight';
    for (let j = 9; j >= 0; j--) {
      const t = m.t - j * 0.025;
      if (t < 0) continue;
      const q = starFeedPath(m, t), wob = Math.sin(m.seed + t * 9) * 3 * (1 - t), x = Math.round((q.x + wob) * AP) + ox, y = Math.round(q.y * AP) + oy;
      if (j === 0) {
        // the head: a bright core in a diamond of its colour
        for (const [a, b, c, k] of [[0, 0, 3, 1], [1, 0, 3, 1], [0, 1, 3, 1], [1, 1, 3, 1], [-1, 0, 2, 0.9], [2, 0, 2, 0.9], [-1, 1, 2, 0.9], [2, 1, 2, 0.9], [0, -1, 2, 0.9], [1, -1, 2, 0.9], [0, 2, 2, 0.9], [1, 2, 2, 0.9]]) dot(x + a, y + b, R[c], true, k);
        if (heart) { for (const [a, b] of [[-3, 0], [4, 0], [-3, 1], [4, 1], [0, -3], [1, -3], [0, 4], [1, 4]]) dot(x + a, y + b, R[1], true, 0.6); }
        else { const sx = Math.round(Math.cos(m.seed + t * 18) * 4), sy = Math.round(Math.sin(m.seed + t * 18) * 3); dot(x + sx, y + sy, R[3], true, 0.9); dot(x + sx + 1, y + sy, R[2], true, 0.7); dot(x - sx, y - sy, R[1], true, 0.6); }
        if (i % every === 0) lights.push({ x, y, r: TILE * (heart ? 1.1 : 0.9), i: 0.7, c: rgb01(R[2]) });
      } else { dot(x, y, R[j < 4 ? 2 : 1], true, 1 - j * 0.09); if (j < 4) dot(x + 1, y, R[1], true, 0.6 - j * 0.12); }
    }
  });
}

// The planting cradle under the star: its ring of Charter segments and the
// arms that hold the seed, their conduits glowing the star's gold.
function drawCradle(d, a, ox, oy, lights) {
  const spr = hartCradle(), fx = Math.round(OUTPOST_CRADLE.x * ATILE) + ox, fy = Math.round(OUTPOST_CRADLE.y * ATILE) + oy, x = fx - spr.ax, y = fy - spr.ay;
  drawArtSprite(spr, x, y);
  const mag = hubStarMag(d), k = 0.6 + 0.4 * Math.sin(Game.realT * 2.2);
  // (its lamps come on one by one in the opening's last shot: intro.js)
  spr.lamps.forEach(([cx, cy], i) => { const w = introWake('cradle', i); if (w > 0) dot(x + cx, y + cy, HART.star[mag >= 4 ? 6 : 5], true, (0.7 + 0.3 * k) * w); });
  lights.push({ x: fx, y: fy - ap(8), r: TILE * (1.6 + mag * 0.15), i: (0.5 + 0.1 * k) * introWake('cradle'), c: rgb01(HART.star[4]) });
  drawStarstone(spr, x, y, 'cradle', lights);
  paintOcclude(x, y - 4, spr.w, spr.h + 4, fy, ox, oy);
}

// The Meridian uplink: a relay mast the diver walks in front of and behind,
// talking to the colony ship in orbit. Its tip blinks cold until the colony's
// called, then burns warm. (Its station keeps the id 'wreck'.)
function drawUplink(d, a, ox, oy, lights) {
  const s = HUB_STATIONS.find((x) => x.id === 'wreck'), spr = hartUplink();
  const fx = Math.round((s.x + 0.5) * ATILE) + ox, fy = Math.round((s.y + 0.5) * ATILE) + oy, x = fx - spr.ax, y = fy - spr.ay;
  drawArtSprite(spr, x, y);
  // the tip: a slow cold blink, then a great warm light once called
  const bx = x + spr.tip.x, by = y + spr.tip.y, lit = Story.landersCalled(), wk = introWake('wreck');
  if (lit) { lights.push({ x: bx, y: by, r: TILE * 6, i: 1.4, c: rgb01(ART.pal.star[3]) }); dot(bx, by, ART.pal.star[3], true); dot(bx, by + 1, ART.pal.star[2], true); }
  else {
    const b = Math.max(0, Math.sin(Game.realT * 2));
    lights.push({ x: bx, y: by, r: TILE, i: (0.25 + 0.2 * b) * wk, c: [0.5, 0.6, 0.8] });
    dot(bx, by, b > 0.5 && wk > 0.5 ? '#9cb4e0' : '#2a3448', b > 0.5 && wk > 0.5);
  }
  // the dish's feed and the console's screen, faintly
  lights.push({ x: x + spr.feed.x, y: y + spr.feed.y, r: TILE * 0.8, i: 0.35, c: rgb01(ART.pal.rune[0]) });
  lights.push({ x: x + spr.screen.x, y: y + spr.screen.y, r: TILE * 0.7, i: 0.3, c: rgb01(ART.pal.rune[0]) });
  drawStarstone(spr, x, y, 'uplink', lights);
  paintOcclude(x, y - 4, spr.w, spr.h + 4, fy, ox, oy);
}
// The portal's gate: Charter pylons either side of the portal (portals.js
// draws the portal itself, in front) and a lintel over it with the
// seed-star.
function drawGate(d, a, ox, oy, lights) {
  const s = HUB_STATIONS.find((x) => x.id === 'setout'), spr = hartGate(), fx = Math.round((s.x + 0.5) * ATILE) + ox, fy = Math.round((s.y + 0.5) * ATILE) + oy + 1, x = fx - spr.ax, y = fy - spr.ay;
  drawArtSprite(spr, x, y);
  spr.lamps.forEach(([cx, cy], i) => dot(x + cx, y + cy, '#ffc860', true, (0.65 + 0.35 * Math.sin(Game.realT * 3 + cy)) * introWake('setout', i)));
  lights.push({ x: fx, y: y + 10, r: TILE * 1.2, i: 0.35 * introWake('setout'), c: rgb01('#ffc860') });
  drawStarstone(spr, x, y, 'gate', lights);
  paintOcclude(x, y - 4, spr.w, spr.h + 4, fy, ox, oy);
}

// The settlement: for each lander down (all of them once the colony's
// called), a lander on its pad, a habitat pod beside it and a lamp.
function settlementSize() {
  return Story.landersCalled() ? T.outpost.pads.n : Math.min(T.outpost.pads.n, storyLanders());
}
// What stands at home among the walkers, in order of their feet: the
// stations, the cradle, the uplink, the gate, the light masts, the pods,
// the landers and what's stacked by the modules, the buildings built
// (structures.js), the smith and the settlers (story.js). Each draws
// itself (hubDraw).
function hubProps(d) {
  const out = [], n = settlementSize(), mag = hubStarMag(d), S = d.floor.site;
  for (const s of HUB_STATIONS) {
    if (s.id === 'dummy') continue;
    if (s.id === 'setout') { out.push({ gate: true, hubDraw: drawGate, y: (s.y + 0.5) * TILE - 2 }); continue; }
    if (s.id === 'wreck') { out.push({ wreck: true, hubDraw: drawUplink, y: (s.y + 0.5) * TILE }); continue; }
    out.push({ station: s, hubDraw: drawHubStation, hidden: true, y: (s.y + 0.5) * TILE + 6 });
  }
  out.push({ cradle: true, hubDraw: drawCradle, y: OUTPOST_CRADLE.y * TILE });
  LANTERNS.forEach(([lx, ly], k) => out.push({ lamp: true, mast: k, lit: k < mag, at: [lx, ly], hubDraw: drawHubLantern, hidden: true, y: (ly + 0.5) * TILE }));
  if (S) {
    out.push({ pod: S.home, look: 0, hubDraw: drawPod, y: S.home.y * TILE });
    for (let k = 0; k < n && k < S.pads.length; k++) {
      const p = S.pads[k];
      out.push({ lander: p, k, hubDraw: drawLander, y: p.y * TILE + 4 });
      out.push({ pod: p.pod, look: 1 + k, hubDraw: drawPod, y: p.pod.y * TILE });
      out.push({ lamp: true, lit: true, at: [p.pod.x + 1.6, p.pod.y - 0.2], hubDraw: drawHubLantern, hidden: true, y: (p.pod.y + 0.3) * TILE });
    }
  }
  for (const it of HUB_DRESSING) if (n >= it.from) out.push({ dress: it, hubDraw: drawHubDressing, hidden: true, y: it.y * TILE });
  // the buildings on their plots (structures.js)
  for (const b of structureProps(d)) out.push(b);
  if (n >= 1) { const f = HUB_STATIONS.find((s) => s.id === 'forge'); out.push({ smith: true, hubDraw: drawHubSmith, hidden: true, y: (f.y + 0.5) * TILE + 8 }); }
  if (n >= 2 && S) out.push({ sitter: true, hubDraw: drawHubSitter, hidden: true, y: hubSitterAt(S)[1] * TILE });
  return out.concat(d.settlers || []);
}
// A habitat pod: the Kindler's own, and one beside each lander's pad.
function drawPod(d, a, ox, oy, lights) {
  const spr = hartPod(a.look % 2), fx = Math.round(a.pod.x * ATILE) + ox, fy = Math.round(a.pod.y * ATILE) + oy, x = fx - spr.ax, y = fy - spr.ay;
  drawArtSprite(spr, x, y);
  for (const [cx, cy] of spr.lamps) lights.push({ x: x + cx, y: y + cy, r: TILE * 1.1, i: 0.45 * (a.look ? 1 : introWake('pod0')), c: rgb01('#ffc070') });
  // (its door opening for the Kindler in the opening: intro.js)
  if (!a.look) introPodDoor(spr, x, y, lights);
  drawStarstone(spr, x, y, 'pod' + a.look, lights);
  paintOcclude(x, y - 4, spr.w, spr.h + 4, fy, ox, oy);
}
// A lander on its pad, its landing lights blinking slowly in turn.
function drawLander(d, a, ox, oy, lights) {
  const spr = hartLander(), fx = Math.round(a.lander.x * ATILE) + ox, fy = Math.round(a.lander.y * ATILE + ap(4)) + oy, x = fx - spr.ax, y = fy - spr.ay;
  drawArtSprite(spr, x, y);
  spr.lamps.forEach(([cx, cy], i) => { if (Math.floor(Game.realT * 1.2 + a.k * 0.7) % spr.lamps.length === i) { dot(x + cx, y + cy, '#ff6a40', true); lights.push({ x: x + cx, y: y + cy, r: TILE * 0.8, i: 0.4, c: rgb01('#ff6a40') }); } });
  paintOcclude(x, y - 4, spr.w, spr.h + 4, fy, ox, oy);
}
// A light mast, lit (one for each magnitude, and the settlement's) or dark.
function drawHubLantern(d, a, ox, oy, lights) {
  // (a mast comes on in its turn in the opening's last shot: intro.js)
  const wk = a.mast === undefined ? 1 : introWake('mast' + a.mast), lit = a.lit && wk > 0.5;
  const [lx, ly] = a.at, x = Math.round((lx + 0.5) * ATILE) + ox, y = Math.round((ly + 0.5) * ATILE) + oy, spr = hartLantern(lit);
  drawArtSprite(spr, x - spr.ax, y - spr.ay);
  paintOcclude(x - spr.ax, y - spr.ay, spr.w, spr.h, y, ox, oy);
  if (lit) lights.push({ x: x - spr.ax + spr.lamp.x, y: y - spr.ay + spr.lamp.y, r: TILE * 2.4, i: (0.75 + 0.05 * Math.sin(Game.realT * 5 + lx)) * wk, c: rgb01(ART.pal.star[2]) });
}

// What's set down by the modules (tiles; from: how many landers down
// before it's there): supply containers stacked by the locker and the
// fabricator, the Charter's pennants by the ring, and more as the colony
// comes.
const HUB_DRESSING = [
  { kind: 'stack3', x: 28.9, y: 19.4, from: 0 }, { kind: 'stack1', x: 28.6, y: 17.6, from: 0 },
  { kind: 'stack2', x: 11.2, y: 24.9, from: 0 }, { kind: 'pennant', x: 24.6, y: 21.2, from: 0 },
  { kind: 'stack1', x: 11.4, y: 23.3, from: 1 }, { kind: 'stack2', x: 23.4, y: 28.6, from: 2 },
  { kind: 'stack3', x: 16.4, y: 28.8, from: 3 }, { kind: 'pennant', x: 16.4, y: 21.2, from: 1 },
];
// Where a settler sits on a container by the Kindler's pod, a cup in hand
// (tiles).
function hubSitterAt(S) { return [S.home.x - 1.9, S.home.y + 1.1]; }
function drawHubDressing(d, a, ox, oy, lights) {
  const it = a.dress, spr = hartProp(it.kind), x = Math.round(it.x * ATILE) + ox, y = Math.round(it.y * ATILE) + oy;
  drawArtSprite(spr, x - spr.ax, y - spr.ay);
  if (spr.lamps) for (const [cx, cy] of spr.lamps) dot(x - spr.ax + cx, y - spr.ay + cy, '#ffc860', true, 0.6 + 0.4 * Math.sin(Game.realT * 2 + it.x));
  paintOcclude(x - spr.ax, y - spr.ay, spr.w, spr.h, y, ox, oy);
}
// The press's beat, shared by the ram and the smith (T.paint.hub.press):
// the ram rests on the work after it strikes, rises, waits while the smith
// pushes the lever over, then comes down hard. ext: how far down the ram
// is (0-1); lever: the smith's frame (0 back, 1 halfway, 2 over); hit: how
// far through the sparks after a strike (0-1), or -1; n: which strike.
function hubPressBeat(t) {
  const P = T.paint.hub.press, n = Math.floor(t / P.beat), ph = t / P.beat - n, r1 = P.rest + P.rise, r2 = r1 + P.wait;
  if (ph < P.rest) return { ext: 1, lever: 2, hit: ph / P.rest, n };
  if (ph < r1) { const k = (ph - P.rest) / P.rise; return { ext: 1 - k * k * (3 - 2 * k), lever: k < 0.25 ? 1 : 0, hit: -1, n }; }
  if (ph < r2) return { ext: 0, lever: (ph - r1) / P.wait < 0.55 ? 0 : 1, hit: -1, n };
  const k = (ph - r2) / (1 - r2);
  return { ext: k * k, lever: 2, hit: -1, n };
}
let _hubPressHeard = -1;
// The smith at the press, tongs on the work, pushing the lever over; the
// ram comes down with a burst of sparks out from between it and the bed.
function drawHubSmith(d, a, ox, oy, lights) {
  const f = HUB_STATIONS.find((s) => s.id === 'forge'), at = stationAt(f, ox, oy), fs = hartForge();
  const beat = hubPressBeat(Game.realT), spr = hartPerson(1, 'smith', beat.lever);
  const fx = at.x - fs.ax + HART_ANVIL.x - 14, fy = at.y + 2;
  drawShadow(fx, fy, 4);
  drawArtSprite(spr, fx - spr.ax, fy - spr.ay);
  // (the slam, heard once a beat: audio.js, from the forge's place)
  if (beat.hit >= 0 && _hubPressHeard !== beat.n && typeof snd === 'function') { _hubPressHeard = beat.n; snd('forgePress', {}); }
  if (beat.hit >= 0) {
    // sparks squeezed out flat either side, arcing down; a flash of light
    const k = beat.hit, ax = at.x - fs.ax + HART_ANVIL.x, ay = at.y - fs.ay + HART_ANVIL.y;
    if (k < 0.3) for (const [i, j] of [[-7, 0], [7, 0], [-8, -1], [8, -1], [-6, 1], [6, 1]]) dot(ax + i, ay + j, '#fff6dc', true, 1 - k * 3);
    for (let i = 0; i < 18; i++) {
      const side = i % 2 ? 1 : -1, sp = 0.4 + artHash(i, beat.n, 3), up = artHash(i, beat.n, 4), kk = Math.min(1, k * (0.8 + sp * 0.5));
      const sx = ax + side * (6 + kk * 18 * sp), sy = ay - 1 - up * 7 * kk + kk * kk * 12 * (0.5 + up);
      dot(Math.round(sx), Math.round(sy), i % 3 ? '#ffb347' : '#fff0c0', true, 1 - kk * 0.6);
      if (kk < 0.6) dot(Math.round(sx - side), Math.round(sy - (up > 0.5 ? 1 : 0)), i % 3 ? '#d85c18' : '#ffd27a', true, 0.9 - kk);
    }
    lights.push({ x: ax, y: ay - 2, r: TILE * 1.4, i: 0.9 * (1 - k), c: rgb01('#ffb347') });
  }
  paintOcclude(fx - spr.ax, fy - spr.ay, spr.w, spr.h, fy, ox, oy);
}
function drawHubSitter(d, a, ox, oy) {
  const [sx, sy] = hubSitterAt(d.floor.site), x = Math.round(sx * ATILE) + ox, y = Math.round(sy * ATILE) + oy, spr = hartPerson(2, 'sit', Math.floor(Game.realT * 1.5) % 2);
  drawShadow(x, y, 4);
  drawArtSprite(spr, x - spr.ax, y - spr.ay);
}

// Each station's name, in a small pixel hand, over it: always there, a
// little brighter as the diver comes near. Drawn over the lit scene, a
// letter's pixel an art px.
const LABEL_FONT = {
  'A': '010/101/111/101/101', 'B': '110/101/110/101/110', 'C': '011/100/100/100/011', 'D': '110/101/101/101/110', 'E': '111/100/110/100/111',
  'F': '111/100/110/100/100', 'G': '0111/1000/1011/1001/0111', 'H': '101/101/111/101/101', 'I': '111/010/010/010/111', 'J': '001/001/001/101/010',
  'K': '101/101/110/101/101', 'L': '100/100/100/100/111', 'M': '10001/11011/10101/10001/10001', 'N': '1001/1101/1011/1001/1001', 'O': '0110/1001/1001/1001/0110',
  'P': '110/101/110/100/100', 'Q': '0110/1001/1001/1010/0101', 'R': '110/101/110/101/101', 'S': '011/100/010/001/110', 'T': '111/010/010/010/010',
  'U': '101/101/101/101/111', 'V': '101/101/101/101/010', 'W': '10001/10001/10101/11011/10001', 'X': '101/101/010/101/101', 'Y': '101/101/010/010/010',
  'Z': '111/001/010/100/111', ' ': '00/00/00/00/00', '?': '111/001/010/000/010', '·': '0/0/1/0/0',
};
// (on View.ctx, or the canvas c)
function drawLabel(text, cx, y, col, alpha, c = View.ctx) {
  const glyphs = [...text].map((ch) => (LABEL_FONT[ch] || LABEL_FONT[' ']).split('/'));
  const w = glyphs.reduce((n, g) => n + g[0].length + 1, -1);
  const x0 = clamp(Math.round(cx - w / 2), 1, View.w - w - 2);
  c.globalAlpha = alpha;
  for (const [ink, o] of [['#000000', 1], [col, 0]]) {
    c.fillStyle = ink;
    let x = x0;
    for (const g of glyphs) {
      for (let j = 0; j < 5; j++) for (let i = 0; i < g[j].length; i++) if (g[j][i] === '1') c.fillRect(x + i + o, y + j + o, 1, 1);
      x += g[0].length + 1;
    }
  }
  c.globalAlpha = 1;
}
const STATION_LABELS = { setout: 'THE PORTAL', altar: 'THE STAR', locker: 'LOCKER', forge: 'FORGE', runes: 'RUNE BENCH', wreck: 'THE UPLINK', dummy: 'TARGET' };
// (world px above or below the station's middle)
const STATION_LABEL_Y = { setout: -46, altar: -34, locker: -38, forge: -46, runes: -32, wreck: -52, dummy: -22 };
function drawStationLabels(d, ox, oy) {
  for (const s of HUB_STATIONS) {
    const x = (s.x + 0.5) * TILE, y = (s.y + 0.5) * TILE, m = dist(x, y, d.p.x, d.p.y) / TILE, vx = Math.round(x * AP) + ox;
    // (only those in view: the site is wider than the view)
    if (vx < 0 || vx > View.w) continue;
    const a = clamp(1.1 - (m - 2) / 4, 0.45, 1);
    drawLabel(STATION_LABELS[s.id], Math.round(x * AP) + ox, Math.round((y + STATION_LABEL_Y[s.id]) * AP) + oy, m < 2 ? '#fff2c8' : '#c8bca0', a);
  }
  drawStructureLabels(d, ox, oy);
}
