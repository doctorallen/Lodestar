'use strict';
// ---------------------------------------------------------------------------
// Home, drawn: the inside of the star. The Lodestar's light opened where the
// seed came down into a great hollow sphere on the ground (floor.js lays
// it out: HOLLOW; its glass floor and its skin are painted in
// hubground.js), and the heart of the star, a crystal many times the size
// of the seed, hangs over the middle of it. There are no stations: the
// star is the only thing at home, and standing before it opens its four
// faces (starui.js). Its lodelines run out across the glass towards the
// openings, one more for every magnitude, brighter towards land already
// kindled. The practice target stands to one side. These are drawn every
// frame over the painted floor.
// ---------------------------------------------------------------------------

// Where the heart hangs (tiles): over the hollow's middle, its anchor
// (hartStar's, at about half its height) above the ground point.
const STAR_AT = { x: HOLLOW.x + 0.5, y: HOLLOW.y + 0.5 - 2.4 };
// How many times the seed's size the heart is drawn (T.hollow.heart, by
// magnitude).
function hubHeartScale(mag = hubStarMag()) { const H = T.hollow.heart; return mag >= H.bigFrom ? H.big : H.small; }
// The heart: the star's sprite enlarged by whole pixels (and its halo).
const _hubHeart = new Map();
function hubHeartSprite(kind, k, frame = 0) {
  const key = `${kind}/${k}/${frame}`;
  if (_hubHeart.has(key)) return _hubHeart.get(key);
  const spr = kind === 'halo' ? hartHalo(3, frame) : hartStar(3);
  const up = (c) => { const n = document.createElement('canvas'); n.width = c.width * k; n.height = c.height * k; const g = n.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(c, 0, 0, n.width, n.height); return n; };
  const out = Object.assign({}, spr, { c: up(spr.c), ec: spr.ec ? up(spr.ec) : null, ax: spr.ax * k, ay: spr.ay * k, w: spr.w * k, h: spr.h * k });
  _hubHeart.set(key, out);
  return out;
}

// Under everything that walks: the lodelines across the glass, and the
// light: the heart's pool on the floor, and the skin's glow all round.
function drawHubUnder(d, ox, oy, tick, lights) {
  drawHubLodelines(d, ox, oy, lights);
  const H = HOLLOW, L = T.hollow.light, mag = hubStarMag(d), ih = Intro.hub, lit = ih ? ih.lit : 1;
  const cx = Math.round((H.x + 0.5) * ATILE) + ox, cy = Math.round((H.y + 0.5) * ATILE) + oy;
  const k = 0.92 + 0.08 * Math.sin(Game.realT * 1.7);
  lights.push({ x: cx, y: cy, r: TILE * (L.pool[0] + L.pool[1] * mag), i: L.poolI * k * lit, c: rgb01(HART.star[5]) });
  for (let i = 0; i < L.skinN; i++) {
    const a = (i / L.skinN) * Math.PI * 2, x = cx + Math.cos(a) * (H.r - 0.6) * ATILE, y = cy + Math.sin(a) * (H.r - 0.6) * ATILE * H.sq;
    lights.push({ x: Math.round(x), y: Math.round(y), r: TILE * L.skinR, i: L.skinI * lit, c: rgb01(HART.star[6]) });
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
// What can't be walked through at home: nothing stands on the glass (the
// heart hangs over it, the target is a creature).
function outpostSolids() { return []; }

// Where the Kindler stands before the star (the station 'altar': floor.js
// HUB_STATIONS), on the view.
function stationAt(s, ox, oy) { return { x: Math.round((s.x + 0.5) * ATILE) + ox, y: Math.round((s.y + 0.5) * ATILE) + oy + ap(6) }; }
// What stands at home among the walkers: nothing now but what walks.
function hubProps() { return []; }

// Over everything: the heart of the star, colossal, in its halo.
function drawHubOver(d, ox, oy, lights) {
  const mag = hubStarMag(d), k = hubHeartScale(mag);
  // (in the opening's last shot it comes down and lights: intro.js)
  const ih = Intro.hub, lit = ih ? ih.lit : 1;
  const sx = Math.round(STAR_AT.x * ATILE) + ox, sy = Math.round(STAR_AT.y * ATILE + Math.sin(Game.realT * 0.8) * 3 * AP) + oy + (ih ? Math.round(ih.starDY) : 0);
  const pulse = d.feedT > 0 ? d.feedT : 0, hum = d.feedHum || 0, halo = hubHeartSprite('halo', k, Math.floor(Game.realT * 3) % 2), st = hubHeartSprite('star', k);
  // the light rising into it, behind it as it arrives
  drawStarFeed(d, ox, oy, lights);
  View.ctx.globalAlpha = 0.7 * lit;
  View.ctx.drawImage(halo.c, sx - halo.ax, sy - halo.ay - 4 * k);
  View.ctx.globalAlpha = View.emCtx.globalAlpha = 0.35 + 0.65 * lit;
  drawArtSprite(st, sx - st.ax, sy - st.ay);
  View.ctx.globalAlpha = View.emCtx.globalAlpha = 1;
  // its light, from the heart itself: brighter while it's fed
  const P = T.outpost.pool;
  lights.push({ x: sx, y: sy, r: TILE * (P.r[0] + P.r[1] * mag + pulse * 3 + hum * 2) * (0.35 + 0.65 * lit), i: (P.i[0] + P.i[1] * mag + pulse + hum * 0.6) * (0.3 + 0.7 * lit), c: rgb01(ART.pal.star[2]) });
  if (hum > 0.05) cfxStrokeRing(sx, sy - 4, (14 + hum * 6) * AP * k, (14 + hum * 6) * AP * k * 0.75, cfxRamp(ART.pal.star[2]), hum * 0.5, 7177, false, 0.45);
  if (pulse > 0) ringDots(sx, sy, (20 + (1 - pulse) * 30) * AP * k, ART.pal.star[3], pulse, true);
}

// Setting a shard before the star: motes stream up into it, and it pulses.
function feedStarFx(d, n, grew) {
  const alt = HUB_STATIONS.find((s) => s.id === 'altar');
  for (let i = 0; i < Math.min(40, 6 + n); i++) d.fx.push({ kind: 'mote', x: (alt.x + 0.5) * TILE, y: (alt.y + 0.5) * TILE - 6, t: 1 + i * 0.03, max: 1 + i * 0.03, seed: i });
  d.feedT = 1;
  if (grew) UI.toast(`The Lodestar grows: magnitude ${grew}`, 'legendary');
}

// ---------------------------------------------------------------------------
// Feeding the star: hold FEED before the star, and mote after mote of the
// light the Kindler's deeds earned (deeds.js) rises from their hands, bows
// up and drops into the heart, faster the longer it's held; let go and it
// stops. Deeplight goes first and heartlight last,
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

// The act button pressed before the star (with no shard to set).
function startStarFeed(d) {
  if (!starFeedNextLight()) {
    UI.toast('No light to give yet: kindle land, find the deep places');
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
  const cx = (alt.x + 0.5) * TILE, cy = (alt.y + 0.5) * TILE - T.star.feed.arc, sx = STAR_AT.x * TILE, sy = STAR_AT.y * TILE + 30;
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

const LABEL_FONT = {
  'A': '010/101/111/101/101', 'B': '110/101/110/101/110', 'C': '011/100/100/100/011', 'D': '110/101/101/101/110', 'E': '111/100/110/100/111',
  'F': '111/100/110/100/100', 'G': '0111/1000/1011/1001/0111', 'H': '101/101/111/101/101', 'I': '111/010/010/010/111', 'J': '001/001/001/101/010',
  'K': '101/101/110/101/101', 'L': '100/100/100/100/111', 'M': '10001/11011/10101/10001/10001', 'N': '1001/1101/1011/1001/1001', 'O': '0110/1001/1001/1001/0110',
  'P': '110/101/110/100/100', 'Q': '0110/1001/1001/1010/0101', 'R': '110/101/110/101/101', 'S': '011/100/010/001/110', 'T': '111/010/010/010/010',
  'U': '101/101/101/101/111', 'V': '101/101/101/101/010', 'W': '10001/10001/10101/11011/10001', 'X': '101/101/010/101/101', 'Y': '101/101/010/010/010',
  'Z': '111/001/010/100/111', ' ': '00/00/00/00/00', '?': '111/001/010/000/010', '·': '0/0/1/0/0',
  '0': '111/101/101/101/111', '1': '010/110/010/010/111', '2': '111/001/111/100/111', '3': '111/001/111/001/111', '4': '101/101/111/001/001',
  '5': '111/100/111/001/111', '6': '111/100/111/101/111', '7': '111/001/010/010/010', '8': '111/101/111/101/111', '9': '111/101/111/001/111',
  '.': '0/0/0/0/1', '-': '000/000/111/000/000',
};
// (on View.ctx, or the canvas c; its pixels AF wide, at fine grain)
function drawLabel(text, cx, y, col, alpha, c = View.ctx) {
  const glyphs = [...text].map((ch) => (LABEL_FONT[ch] || LABEL_FONT[' ']).split('/'));
  const w = glyphs.reduce((n, g) => n + g[0].length + 1, -1) * AF;
  const x0 = clamp(Math.round(cx - w / 2), 1, View.w - w - 2);
  c.globalAlpha = alpha;
  for (const [ink, o] of [['#000000', 1], [col, 0]]) {
    c.fillStyle = ink;
    let x = x0;
    for (const g of glyphs) {
      for (let j = 0; j < 5; j++) for (let i = 0; i < g[j].length; i++) if (g[j][i] === '1') c.fillRect(x + (i + o) * AF, y + (j + o) * AF, AF, AF);
      x += (g[0].length + 1) * AF;
    }
  }
  c.globalAlpha = 1;
}
// The star's name over where the Kindler stands before it, and the
// target's: always there, a little brighter as the Kindler comes near.
const STATION_LABELS = { altar: 'THE STAR', dummy: 'TARGET' };
// (world px above the station's middle)
const STATION_LABEL_Y = { altar: -34, dummy: -22 };
function drawStationLabels(d, ox, oy) {
  for (const s of HUB_STATIONS) {
    const x = (s.x + 0.5) * TILE, y = (s.y + 0.5) * TILE, m = dist(x, y, d.p.x, d.p.y) / TILE, vx = Math.round(x * AP) + ox;
    if (vx < 0 || vx > View.w) continue;
    const a = clamp(1.1 - (m - 2) / 4, 0.45, 1), lx = Math.round(x * AP) + ox, ly = Math.round((y + STATION_LABEL_Y[s.id]) * AP) + oy;
    drawLabel(STATION_LABELS[s.id], lx, ly, m < 2 ? '#fff2c8' : '#c8bca0', a);
  }
}
