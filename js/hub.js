'use strict';
// ---------------------------------------------------------------------------
// The outpost on the sinkhole's rim, drawn. The Lodestar hangs over the pit,
// bobbing, its lodelines running down into the dark: one more for every
// magnitude. Round the plaza stand the stations (the star's altar, the
// locker, the portal every expedition sets out through, the forge, the rune
// bench), the practice target and the Meridian uplink, and lanterns, one
// lit for every magnitude. As territories are kindled the colony comes down,
// and tents and lanterns go up round the plaza (settlers: story.js). The
// floor, walls and pit are painted like any floor (render.js); these are
// drawn every frame on top.
// ---------------------------------------------------------------------------

// Each station, painted (hubart.js), its feet at ax, ay.
function stationSprite(id) {
  return { forge: hartForge, runes: hartRunes, locker: hartLocker, altar: hartAltar }[id]();
}

const LANTERNS = [[3, 12], [19, 12], [3, 17], [19, 17], [7, 21], [15, 21], [8, 13], [14, 13]];
const STAR_AT = { x: 11.5, y: 5.6 }; // tiles: over the middle of the pit

// Under everything that walks: the lodelines in the pit, the forge's light
// on the ground, the stations' lights. (The stations, lanterns, tents and
// what lies about the plaza stand among the walkers: hubProps.)
function drawHubUnder(d, ox, oy, tick, lights) {
  const mag = magnitudeOf(Save.data.star), star = ART.pal.star, k = mag >= 5 ? 3 : 2;
  // (in the opening's last shot the star rises into place and lights: intro.js)
  const ih = Intro.hub, sx = Math.round(STAR_AT.x * ATILE) + ox, sy = Math.round(STAR_AT.y * ATILE) + oy + (ih ? Math.round(ih.starDY) : 0), st = hartStar(k);
  // the lodelines, falling from the star's foot into the dark
  if (mag > 0 && (!ih || ih.lit > 0.9)) { const L = hartLodelines(Math.min(mag, 8), Math.floor(Game.realT * 6) % 4); drawArtSprite(L, sx - L.ax, sy + (st.h - 15 - st.ay) - 4); }
  // the plaza's flat dressing: cables, scuffs
  drawHubGround(d, ox, oy);
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
// Where a station's feet are on the view (its tile's middle, a little
// south, as the old sprites stood).
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
    // heat and smoke off the stack, a spark now and then
    for (let i = 0; i < 5; i++) {
      const ph = (Game.realT * 0.6 + i / 5) % 1, cx = x + 33 + Math.round(Math.sin(i * 2.7 + ph * 4) * 2 + ph * 4), cy = y + 9 - Math.round(ph * 22);
      dot(cx, cy, i % 2 ? '#3a3a40' : ph < 0.4 ? '#ffb347' : '#902a0a', i % 2 === 0, 1 - ph);
    }
  } else if (s.id === 'altar') {
    // the shard over the bowl, bobbing, its light
    const sh = hartShard(), by = y + spr.bowl.y - 4 + Math.round(Math.sin(Game.realT * 1.6) * 1.5);
    drawArtSprite(sh, Math.round(x + spr.bowl.x - sh.ax), by - sh.ay);
  } else if (s.id === 'runes' && Math.floor(Game.realT * 5) % 7 === 0) dot(x + spr.candle.x, y + spr.candle.y - 1, '#ffe8a0', true, 0.7);
  paintOcclude(x, y - 12, spr.w, spr.h + 12, at.y, ox, oy);
}

// Over everything: the Lodestar itself, bigger as it grows, in its halo.
function drawHubOver(d, ox, oy, lights) {
  const mag = magnitudeOf(Save.data.star), k = mag >= 5 ? 3 : 2;
  // (in the opening's last shot it rises into place and lights: intro.js)
  const ih = Intro.hub, lit = ih ? ih.lit : 1;
  const sx = Math.round(STAR_AT.x * ATILE) + ox, sy = Math.round(STAR_AT.y * ATILE + Math.sin(Game.realT * 1.2) * 2 * AP) + oy + (ih ? Math.round(ih.starDY) : 0);
  const pulse = d.feedT > 0 ? d.feedT : 0, halo = hartHalo(k, Math.floor(Game.realT * 3) % 2), st = hartStar(k);
  View.ctx.globalAlpha = 0.8 * lit;
  View.ctx.drawImage(halo.c, sx - halo.ax, sy - halo.ay - 4);
  View.ctx.globalAlpha = View.emCtx.globalAlpha = 0.35 + 0.65 * lit;
  drawArtSprite(st, sx - st.ax, sy - st.ay);
  View.ctx.globalAlpha = View.emCtx.globalAlpha = 1;
  lights.push({ x: sx, y: sy, r: TILE * (4 + mag * 0.4 + pulse * 3) * (0.35 + 0.65 * lit), i: (1.1 + pulse) * (0.3 + 0.7 * lit), c: rgb01(ART.pal.star[2]) });
  if (pulse > 0) ringDots(sx, sy, (20 + (1 - pulse) * 30) * AP, ART.pal.star[3], pulse, true);
}

// Feeding the star from the altar: motes stream up into it, and it pulses.
function feedStarFx(d, n, grew) {
  const alt = HUB_STATIONS.find((s) => s.id === 'altar');
  for (let i = 0; i < Math.min(40, 6 + n); i++) d.fx.push({ kind: 'mote', x: (alt.x + 0.5) * TILE, y: (alt.y + 0.5) * TILE - 6, t: 1 + i * 0.03, max: 1 + i * 0.03, seed: i });
  d.feedT = 1;
  if (grew) UI.toast(`The Lodestar grows: magnitude ${grew}`, 'legendary');
}

// The Meridian uplink: a relay mast the diver walks in front of and behind,
// talking to the colony ship in orbit. Its tip blinks cold until the colony's
// called, then burns warm. (Its station keeps the id 'wreck'.)
function drawUplink(d, a, ox, oy, lights) {
  const s = HUB_STATIONS.find((x) => x.id === 'wreck'), spr = hartUplink();
  const fx = Math.round((s.x + 0.5) * ATILE) + ox, fy = Math.round((s.y + 0.5) * ATILE) + oy, x = fx - spr.ax, y = fy - spr.ay;
  drawShadow(fx, fy, 8);
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
}

// The settlement: a tent, and a lantern beside it, for each lander down
// (all of them once the colony's called).
const TENT_SPOTS = [[8, 20], [14, 20], [4, 13], [18, 13], [5, 18], [17, 17]];
const SETTLE_LANTERNS = [[10, 20], [13, 20], [6, 13], [17, 13], [7, 18], [16, 17]];
function settlementSize() {
  return Story.landersCalled() ? TENT_SPOTS.length : Math.min(TENT_SPOTS.length, storyLanders());
}
// What stands at home among the walkers, in order of their feet: the
// stations, the uplink, the lanterns, the tents and what lies about the
// plaza, the smith and the settlers (story.js). Each draws itself (hubDraw)
// and says how much rock in front might hide it (occ).
function hubProps(d) {
  const out = [], n = settlementSize(), mag = magnitudeOf(Save.data.star);
  for (const s of HUB_STATIONS) {
    if (s.id === 'dummy' || s.id === 'setout') continue;
    if (s.id === 'wreck') { out.push({ wreck: true, hubDraw: drawUplink, y: (s.y + 0.5) * TILE }); continue; }
    out.push({ station: s, hubDraw: drawHubStation, hidden: true, y: (s.y + 0.5) * TILE + 6 });
  }
  LANTERNS.forEach(([lx, ly], k) => out.push({ lamp: true, lit: k < mag, at: [lx, ly], hubDraw: drawHubLantern, hidden: true, y: (ly + 0.5) * TILE }));
  for (let k = 0; k < n; k++) {
    out.push({ tent: k, hubDraw: drawTent, y: (TENT_SPOTS[k][1] + 0.5) * TILE });
    const [lx, ly] = SETTLE_LANTERNS[k];
    out.push({ lamp: true, lit: true, at: [lx, ly], hubDraw: drawHubLantern, hidden: true, y: (ly + 0.5) * TILE });
  }
  for (const it of HUB_DRESSING) if (n >= it.from) out.push({ dress: it, hubDraw: drawHubDressing, hidden: true, y: it.y * TILE });
  if (n >= 1) { const f = HUB_STATIONS.find((s) => s.id === 'forge'); out.push({ smith: true, hubDraw: drawHubSmith, hidden: true, y: (f.y + 0.5) * TILE + 8 }); }
  if (n >= 2) out.push({ sitter: true, hubDraw: drawHubSitter, hidden: true, y: HUB_SITTER[1] * TILE });
  return out.concat(d.settlers || []);
}
function drawTent(d, a, ox, oy) {
  const [tx, ty] = TENT_SPOTS[a.tent], spr = hartTent(a.tent % 2), fx = Math.round((tx + 0.5) * ATILE) + ox, fy = Math.round((ty + 0.5) * ATILE) + oy + ap(2);
  drawArtSprite(spr, fx - spr.ax, fy - spr.ay);
}
// A lantern, lit (one for each magnitude, and the settlement's) or dark.
function drawHubLantern(d, a, ox, oy, lights) {
  const [lx, ly] = a.at, x = Math.round((lx + 0.5) * ATILE) + ox, y = Math.round((ly + 0.5) * ATILE) + oy, spr = hartLantern(a.lit);
  drawShadow(x, y, 2);
  drawArtSprite(spr, x - spr.ax, y - spr.ay);
  paintOcclude(x - spr.ax, y - spr.ay, spr.w, spr.h, y, ox, oy);
  if (a.lit) lights.push({ x: x - spr.ax + spr.lamp.x, y: y - spr.ay + spr.lamp.y, r: TILE * 2.2, i: 0.7 + 0.05 * Math.sin(Game.realT * 5 + lx), c: rgb01(ART.pal.star[2]) });
}

// What lies about the plaza (tiles; from: how many landers down before it's
// there). Hand placed, clear of the stations, the paths between them and
// their names.
const HUB_DRESSING = [
  // the Kindler's own: supplies by the locker and the uplink, a rack of
  // tools by the forge
  { kind: 'crate', x: 18.4, y: 11.6, from: 0 }, { kind: 'crate2', x: 19.3, y: 11.9, from: 0 },
  { kind: 'crate2', x: 9.1, y: 20.1, from: 0 }, { kind: 'rack', x: 3.5, y: 14.2, from: 0 },
  { kind: 'crate2', x: 9.4, y: 11.9, from: 0 },
  // the colony's: barrels, sacks, a banner, a fire ring with a log
  { kind: 'barrel', x: 8.2, y: 16.0, from: 1 }, { kind: 'sacks', x: 13.0, y: 21.9, from: 1 },
  { kind: 'banner', x: 8.6, y: 15.6, from: 1 }, { kind: 'barrel', x: 18.3, y: 15.9, from: 2 },
  { kind: 'firering', x: 11.4, y: 22.0, from: 2 }, { kind: 'log', x: 11.5, y: 22.9, from: 2 },
  { kind: 'crate', x: 2.9, y: 19.2, from: 3 }, { kind: 'sacks', x: 19.2, y: 19.6, from: 3 },
  { kind: 'crate2', x: 15.5, y: 21.6, from: 4 }, { kind: 'barrel', x: 6.4, y: 20.5, from: 4 },
  { kind: 'cart', x: 13.7, y: 17.2, from: 1 }, { kind: 'sacks', x: 4.6, y: 19.4, from: 2 },
];
const HUB_SITTER = [10.2, 22.0]; // a settler sitting by the fire ring (tiles)
function drawHubDressing(d, a, ox, oy, lights) {
  const it = a.dress, spr = hartProp(it.kind), x = Math.round(it.x * ATILE) + ox, y = Math.round(it.y * ATILE) + oy;
  drawArtSprite(spr, x - spr.ax, y - spr.ay);
  if (it.kind === 'firering') {
    const fl = hartFlames(Math.floor(Game.realT * 8) % 3);
    drawArtSprite(fl, x - fl.ax, y - spr.ay + 6 - fl.ay);
    lights.push({ x, y: y - 6, r: TILE * 1.8, i: 0.75 + 0.1 * Math.sin(Game.realT * 13), c: rgb01(ART.pal.glass[0]) });
    for (let i = 0; i < 3; i++) { const ph = (Game.realT * 0.8 + i / 3) % 1; dot(x + Math.round(Math.sin(i * 3 + ph * 5) * 2), y - 10 - Math.round(ph * 14), ph < 0.5 ? '#ffb347' : '#902a0a', true, 1 - ph); }
  }
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
// A settler on a crate by the fire, a cup in hand.
function drawHubSitter(d, a, ox, oy) {
  const x = Math.round(HUB_SITTER[0] * ATILE) + ox, y = Math.round(HUB_SITTER[1] * ATILE) + oy, spr = hartPerson(2, 'sit', Math.floor(Game.realT * 1.5) % 2);
  drawShadow(x, y, 4);
  drawArtSprite(spr, x - spr.ax, y - spr.ay);
}
// Flat on the flagstones: a cable from the uplink's console to the locker's
// supplies, the forge's coolant pipes and a power line from its foot to
// the uplink's slab, scuffed paths worn between the stations.
const HUB_CABLES = [
  // [points (tiles), pixels across, colours: dark, lit, how often a lit one]
  [[[13.6, 19.9], [14.8, 18.9], [17.6, 17.6], [18.3, 15.4], [18.6, 12.3]], 1, ['#07080c', '#252b38'], 9, 1.5],
  [[[7.55, 15.79], [7.9, 16.5], [8.9, 17.6], [10.0, 18.6], [10.95, 19.35]], 2, ['#080b0f', '#1e2e38'], 0, 0.3],
  [[[7.55, 15.87], [7.7, 16.75], [8.6, 17.95], [9.8, 19.0], [10.95, 19.5]], 1, ['#07080c', '#252b38'], 7, 0.8],
];
function drawHubGround(d, ox, oy) {
  const c = View.ctx, inl = hartInlay();
  drawArtSprite(inl, Math.round(11.5 * ATILE) + ox - inl.ax, Math.round(15.3 * ATILE) + oy - inl.ay);
  for (const [pts, w, [dark, lit], every, wob] of HUB_CABLES) {
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i], n = Math.ceil(Math.hypot(bx - ax, by - ay) * ATILE);
      for (let k = 0; k < n; k++) {
        const x = Math.round((ax + (bx - ax) * k / n) * ATILE + Math.sin(k * 0.21 + i) * wob) + ox, y = Math.round((ay + (by - ay) * k / n) * ATILE) + oy;
        // (a cable a pixel across, lit now and then; a pipe two, its top lit)
        if (w === 1) { c.fillStyle = k % every === 0 ? lit : dark; c.fillRect(x, y, 1, 1); }
        else { c.fillStyle = lit; c.fillRect(x, y, 1, 1); c.fillStyle = dark; c.fillRect(x, y + 1, 1, 1); }
      }
    }
  }
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
const STATION_LABEL_Y = { setout: 8, altar: -34, locker: -34, forge: -40, runes: -22, wreck: -50, dummy: -22 };
function drawStationLabels(d, ox, oy) {
  for (const s of HUB_STATIONS) {
    const x = (s.x + 0.5) * TILE, y = (s.y + 0.5) * TILE, m = dist(x, y, d.p.x, d.p.y) / TILE;
    const a = clamp(1.1 - (m - 2) / 4, 0.45, 1);
    drawLabel(STATION_LABELS[s.id], Math.round(x * AP) + ox, Math.round((y + STATION_LABEL_Y[s.id]) * AP) + oy, m < 2 ? '#fff2c8' : '#c8bca0', a);
  }
}
