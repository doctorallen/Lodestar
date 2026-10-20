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
    lights.push({ x: gx, y: gy, r: TILE * glow[1], i: glow[2] * fl, c: rgb01(glow[0]) });
  }
}
// The lodelines: one along each path out to an opening for every
// magnitude (the nearest openings first), each reaching further as the
// star grows (T.outpost.lode), in broken strokes of gold running outward;
// towards kindled land brighter and all the way, towards the dark faint.
function drawHubLodelines(d, ox, oy, lights) {
  const f = d.floor, S = f.site, L = T.outpost.lode, mag = magnitudeOf(Save.data.star), G = HART.star;
  if (!S || mag <= 0) return;
  const len = (p) => Math.hypot(p.bx - p.ax, p.by - p.ay), order = S.paths.map((p, k) => k).sort((a, b) => len(S.paths[a]) - len(S.paths[b]));
  const reach = L.reach[0] + L.reach[1] * (mag - 1), t = Game.realT;
  for (const k of order.slice(0, mag)) {
    const p = S.paths[k], lit = isKindled(p.to), n = len(p), far = Math.min(n, lit ? n : reach), ux = (p.bx - p.ax) / n, uy = (p.by - p.ay) / n;
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
  const n = magnitudeOf(Save.data.star) - 1, spots = spr.stone || [], G = T.outpost.stone;
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
  const mag = magnitudeOf(Save.data.star), k = mag >= 5 ? 3 : 2;
  const sx = Math.round(STAR_AT.x * ATILE) + ox, sy = Math.round(STAR_AT.y * ATILE + Math.sin(Game.realT * 1.2) * 2 * AP) + oy;
  const pulse = d.feedT > 0 ? d.feedT : 0, halo = hartHalo(k, Math.floor(Game.realT * 3) % 2), st = hartStar(k);
  View.ctx.globalAlpha = 0.8;
  View.ctx.drawImage(halo.c, sx - halo.ax, sy - halo.ay - 4);
  View.ctx.globalAlpha = 1;
  drawArtSprite(st, sx - st.ax, sy - st.ay);
  // its light: a pool on the ground round the cradle, wider and brighter
  // as it grows (T.outpost.pool), from a little under the star
  const P = T.outpost.pool, cy = Math.round((STAR_AT.y + OUTPOST_CRADLE.y) / 2 * ATILE) + oy;
  lights.push({ x: sx, y: cy, r: TILE * (P.r[0] + P.r[1] * mag + pulse * 3), i: P.i[0] + P.i[1] * mag + pulse, c: rgb01(ART.pal.star[2]) });
  if (pulse > 0) ringDots(sx, sy, (20 + (1 - pulse) * 30) * AP, ART.pal.star[3], pulse, true);
}

// Feeding the star from the altar: motes stream up into it, and it pulses.
function feedStarFx(d, n, grew) {
  const alt = HUB_STATIONS.find((s) => s.id === 'altar');
  for (let i = 0; i < Math.min(40, 6 + n); i++) d.fx.push({ kind: 'mote', x: (alt.x + 0.5) * TILE, y: (alt.y + 0.5) * TILE - 6, t: 1 + i * 0.03, max: 1 + i * 0.03, seed: i });
  d.feedT = 1;
  if (grew) UI.toast(`The Lodestar grows: magnitude ${grew}`, 'legendary');
}

// The planting cradle under the star: its ring of Charter segments and the
// arms that hold the seed, their conduits glowing the star's gold.
function drawCradle(d, a, ox, oy, lights) {
  const spr = hartCradle(), fx = Math.round(OUTPOST_CRADLE.x * ATILE) + ox, fy = Math.round(OUTPOST_CRADLE.y * ATILE) + oy, x = fx - spr.ax, y = fy - spr.ay;
  drawArtSprite(spr, x, y);
  const mag = magnitudeOf(Save.data.star), k = 0.6 + 0.4 * Math.sin(Game.realT * 2.2);
  for (const [cx, cy] of spr.lamps) dot(x + cx, y + cy, HART.star[mag >= 4 ? 6 : 5], true, 0.7 + 0.3 * k);
  lights.push({ x: fx, y: fy - ap(8), r: TILE * (1.6 + mag * 0.15), i: 0.5 + 0.1 * k, c: rgb01(HART.star[4]) });
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
  const bx = x + spr.tip.x, by = y + spr.tip.y, lit = Story.landersCalled();
  if (lit) { lights.push({ x: bx, y: by, r: TILE * 6, i: 1.4, c: rgb01(ART.pal.star[3]) }); dot(bx, by, ART.pal.star[3], true); dot(bx, by + 1, ART.pal.star[2], true); }
  else {
    const b = Math.max(0, Math.sin(Game.realT * 2));
    lights.push({ x: bx, y: by, r: TILE, i: 0.25 + 0.2 * b, c: [0.5, 0.6, 0.8] });
    dot(bx, by, b > 0.5 ? '#9cb4e0' : '#2a3448', b > 0.5);
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
  for (const [cx, cy] of spr.lamps) dot(x + cx, y + cy, '#ffc860', true, 0.65 + 0.35 * Math.sin(Game.realT * 3 + cy));
  lights.push({ x: fx, y: y + 10, r: TILE * 1.2, i: 0.35, c: rgb01('#ffc860') });
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
// the landers and what's stacked by the modules, the smith and the
// settlers (story.js). Each draws itself (hubDraw).
function hubProps(d) {
  const out = [], n = settlementSize(), mag = magnitudeOf(Save.data.star), S = d.floor.site;
  for (const s of HUB_STATIONS) {
    if (s.id === 'dummy') continue;
    if (s.id === 'setout') { out.push({ gate: true, hubDraw: drawGate, y: (s.y + 0.5) * TILE - 2 }); continue; }
    if (s.id === 'wreck') { out.push({ wreck: true, hubDraw: drawUplink, y: (s.y + 0.5) * TILE }); continue; }
    out.push({ station: s, hubDraw: drawHubStation, hidden: true, y: (s.y + 0.5) * TILE + 6 });
  }
  out.push({ cradle: true, hubDraw: drawCradle, y: OUTPOST_CRADLE.y * TILE });
  LANTERNS.forEach(([lx, ly], k) => out.push({ lamp: true, lit: k < mag, at: [lx, ly], hubDraw: drawHubLantern, hidden: true, y: (ly + 0.5) * TILE }));
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
  if (n >= 1) { const f = HUB_STATIONS.find((s) => s.id === 'forge'); out.push({ smith: true, hubDraw: drawHubSmith, hidden: true, y: (f.y + 0.5) * TILE + 8 }); }
  if (n >= 2 && S) out.push({ sitter: true, hubDraw: drawHubSitter, hidden: true, y: hubSitterAt(S)[1] * TILE });
  return out.concat(d.settlers || []);
}
// A habitat pod: the Kindler's own, and one beside each lander's pad.
function drawPod(d, a, ox, oy, lights) {
  const spr = hartPod(a.look % 2), fx = Math.round(a.pod.x * ATILE) + ox, fy = Math.round(a.pod.y * ATILE) + oy, x = fx - spr.ax, y = fy - spr.ay;
  drawArtSprite(spr, x, y);
  for (const [cx, cy] of spr.lamps) lights.push({ x: x + cx, y: y + cy, r: TILE * 1.1, i: 0.45, c: rgb01('#ffc070') });
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
  const [lx, ly] = a.at, x = Math.round((lx + 0.5) * ATILE) + ox, y = Math.round((ly + 0.5) * ATILE) + oy, spr = hartLantern(a.lit);
  drawArtSprite(spr, x - spr.ax, y - spr.ay);
  paintOcclude(x - spr.ax, y - spr.ay, spr.w, spr.h, y, ox, oy);
  if (a.lit) lights.push({ x: x - spr.ax + spr.lamp.x, y: y - spr.ay + spr.lamp.y, r: TILE * 2.4, i: 0.75 + 0.05 * Math.sin(Game.realT * 5 + lx), c: rgb01(ART.pal.star[2]) });
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
// The smith at the press, tongs on the work, pushing the lever over; the
// ram comes down with a burst of sparks out from between it and the bed.
function drawHubSmith(d, a, ox, oy, lights) {
  const f = HUB_STATIONS.find((s) => s.id === 'forge'), at = stationAt(f, ox, oy), fs = hartForge();
  const beat = hubPressBeat(Game.realT), spr = hartPerson(1, 'smith', beat.lever);
  const fx = at.x - fs.ax + HART_ANVIL.x - 14, fy = at.y + 2;
  drawShadow(fx, fy, 4);
  drawArtSprite(spr, fx - spr.ax, fy - spr.ay);
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
}
