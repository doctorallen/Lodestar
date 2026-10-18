'use strict';
// ---------------------------------------------------------------------------
// The outpost on the sinkhole's rim, drawn. The Lodestar hangs over the pit,
// bobbing, its lodelines running down into the dark: one more for every
// magnitude. Round the plaza stand the stations (the star's altar, the
// locker, the portal every expedition sets out through, the forge, the rune
// bench) and the practice target, and lanterns, one lit for every magnitude. The floor,
// walls and pit are painted like any floor (render.js); these are drawn
// every frame on top.
// ---------------------------------------------------------------------------

const STATION_ROWS = {
  // a squat furnace with a glowing mouth, a chimney, and the anvil beside it
  forge: [
    '......MMMM....................',
    '......MwwM....................',
    '......MwwM....................',
    '..GGGGGGGGGGGGGG..............',
    '.GGGGGGGGGGGGGGGG.............',
    '.GGwwwwwwwwwwwwGG.............',
    '.GGwGGGGGGGGGGwGG.............',
    '.GGwGwwwwwwwwGwGG.............',
    '.GGwGwOOOOOOwGwGG.............',
    '.GGwGwOOOOOOwGwGG.............',
    '.GGwGwOOOOOOwGwGG.............',
    '.GGwGwOOOOOOwGwGG...WWWWWWWW..',
    '.GGwGwwwwwwwwGwGG.WWWWWWWWWWWW',
    '.GGwGGGGGGGGGGwGG.wWWWWWWWWWWw',
    '.GGGGGGGGGGGGGGGG....wwwwww...',
    '.GGGGGGGGGGGGGGGG.....wwww....',
    '.MMMMMMMMMMMMMMMM.....wwww....',
    '.MMMMMMMMMMMMMMMM...wwwwwwww..',
  ],
  // a stone slab carved with runes, on two legs
  runes: [
    '..MMMMMMMMMMMMMMMMMMMM..',
    '.MGGGGGGGGGGGGGGGGGGGGM.',
    'MGGRGGGGAGGGGGRGGGGAGGGM',
    'MGRRRGGAAAGGGRRRGGAAAGGM',
    'MGGRGGGGAGGGGGRGGGGAGGGM',
    'MGGGGGGGGGGGGGGGGGGGGGGM',
    '.MMMMMMMMMMMMMMMMMMMMMM.',
    '..MGM..............MGM..',
    '..MGM..............MGM..',
    '..MGM..............MGM..',
    '..MGM..............MGM..',
    '.MMMMM............MMMMM.',
  ],
  // a tall locker, a strip of the diver's teal light down each door
  locker: [
    '..GGGGGGGGGGGGGG..',
    '.GGGGGGGGGGGGGGGG.',
    'GGwwwwwwwGwwwwwwwG',
    'GGwGGGGGwGwGGGGGwG',
    'GGwGRGGGwGwGGGRGwG',
    'GGwGRGGGwGwGGGRGwG',
    'GGwGRGGGwGwGGGRGwG',
    'GGwGRGGMwGwMGGRGwG',
    'GGwGRGGMwGwMGGRGwG',
    'GGwGRGGGwGwGGGRGwG',
    'GGwGRGGGwGwGGGRGwG',
    'GGwGRGGGwGwGGGRGwG',
    'GGwGGGGGwGwGGGGGwG',
    'GGwwwwwwwGwwwwwwwG',
    'GGGGGGGGGGGGGGGGGG',
    '.MMM..........MMM.',
  ],
  // a pedestal holding a shard of the star
  altar: [
    '.....AA.....',
    '....AQQA....',
    '...AQQQQA...',
    '...AQQQQA...',
    '....AQQA....',
    '.....AA.....',
    '............',
    '..MMMMMMMM..',
    '...GGGGGG...',
    '...GRRRRG...',
    '...GGGGGG...',
    '...GRRRRG...',
    '...GGGGGG...',
    '..GGGGGGGG..',
    '.MMMMMMMMMM.',
  ],
};
const _stationSprites = {};
function stationSprite(id) {
  if (!_stationSprites[id]) {
    const pal = id === 'altar' ? { arcane: [ART.pal.star[2]], coreglow: [ART.pal.star[3]] } : id === 'locker' ? { rune: [DIVER_PAL.tip[0]] } : {};
    const s = buildArtSprite(STATION_ROWS[id], pal);
    s.ax = s.w / 2; s.ay = s.h - footOff(1);
    _stationSprites[id] = s;
  }
  return _stationSprites[id];
}

const LANTERNS = [[3, 12], [19, 12], [3, 17], [19, 17], [7, 21], [15, 21], [8, 13], [14, 13]];
// A lantern on its post, its lamp lit (L) or dark (E): a hood, a frame
// round the glass, a post a pixel wide on a foot. Drawn by hand at the
// art's size (artNative).
const LANTERN_ROWS = artNative(['.MMM.', 'MMMMM', 'MLLLM', 'MLLLM', 'MLLLM', 'MMMMM', '..M..', '..M..', '..M..', '..M..', '..M..', '..M..', '..M..', '..M..', '..M..', '..M..', '..M..', '.MMM.']);
const _lanterns = {};
function lanternSprite(lit) {
  if (!_lanterns[lit]) {
    const s = buildArtSprite(lit ? LANTERN_ROWS : artNative(LANTERN_ROWS.map((r) => r.replace(/L/g, 'E'))), { lamp: [ART.pal.star[3]], eye: ['#202028'] });
    s.ax = s.w / 2; s.ay = s.h - 1;
    _lanterns[lit] = s;
  }
  return _lanterns[lit];
}
const STAR_AT = { x: 11.5, y: 5.6 }; // tiles: over the middle of the pit

// Under everything that walks: the lodelines in the pit, the stations, the
// lanterns.
function drawHubUnder(d, ox, oy, tick, lights) {
  const mag = magnitudeOf(Save.data.star), star = ART.pal.star;
  const sx = STAR_AT.x * ATILE + ox, sy = STAR_AT.y * ATILE + oy;
  // the lodelines, falling from the star into the dark
  for (let k = 0; k < mag; k++) {
    const bx = Math.round(sx + (k - (mag - 1) / 2) * 7 * AP), len = ap(70 + ((k * 37) % 30));
    for (let y = ap(8); y < len; y++) {
      if (bayerAt(bx, y + tick) > 0.6) continue;
      dot(bx, Math.round(sy + y), y % 7 ? star[2] : star[3], true, 0.7 * (1 - y / len));
    }
  }
  for (const s of HUB_STATIONS) {
    // (the portal stands among the actors: portals.js)
    if (s.id === 'dummy' || s.id === 'wreck' || s.id === 'setout') continue;
    const spr = stationSprite(s.id), x = Math.round((s.x + 0.5) * ATILE + ox - spr.ax), y = Math.round((s.y + 0.5) * ATILE + oy - spr.ay + ap(6));
    drawArtSprite(spr, x, y);
    const glow = { forge: [ART.pal.glass[0], 1.8, 0.9], runes: [ART.pal.arcane[0], 1.2, 0.5], locker: [DIVER_PAL.tip[0], 1, 0.4], altar: [star[3], 1.6, 0.8] }[s.id];
    if (glow) lights.push({ x: x + spr.w / 2, y: y + spr.h / 2, r: TILE * glow[1], i: glow[2] * (0.85 + 0.15 * Math.sin(Game.realT * 3)), c: rgb01(glow[0]) });
  }
  // lanterns, lit one per magnitude
  LANTERNS.forEach(([lx, ly], k) => {
    const x = Math.round((lx + 0.5) * ATILE) + ox, y = Math.round((ly + 0.5) * ATILE) + oy, lit = k < mag, spr = lanternSprite(lit);
    drawShadow(x, y, 2);
    drawArtSprite(spr, Math.round(x - spr.ax), Math.round(y - spr.ay));
    if (lit) lights.push({ x, y: y - ap(11), r: TILE * 2.2, i: 0.7, c: rgb01(star[2]) });
  });
}

// Over everything: the Lodestar itself, bigger as it grows.
function drawHubOver(d, ox, oy, lights) {
  const mag = magnitudeOf(Save.data.star), k = mag >= 5 ? 3 : 2;
  const sx = STAR_AT.x * ATILE + ox, sy = STAR_AT.y * ATILE + oy + Math.sin(Game.realT * 1.2) * 2 * AP;
  // k times the size, enlarged as a letter grid, never as a picture
  const key = 'star' + k;
  if (!_stationSprites[key]) _stationSprites[key] = spriteFrom(artScaleRows(LODESTAR_ROWS, k * AP), LODESTAR_PAL);
  const st = _stationSprites[key], w = st.width, h = st.height, x = Math.round(sx - w / 2), y = Math.round(sy - h / 2);
  const pulse = d.feedT > 0 ? d.feedT : 0;
  View.ctx.drawImage(st, x, y);
  View.emCtx.drawImage(st, x, y);
  lights.push({ x: sx, y: sy, r: TILE * (4 + mag * 0.4 + pulse * 3), i: 1.1 + pulse, c: rgb01(ART.pal.star[2]) });
  if (pulse > 0) ringDots(sx, sy, (20 + (1 - pulse) * 30) * AP, ART.pal.star[3], pulse, true);
}

// Feeding the star from the altar: motes stream up into it, and it pulses.
function feedStarFx(d, n, grew) {
  const alt = HUB_STATIONS.find((s) => s.id === 'altar');
  for (let i = 0; i < Math.min(40, 6 + n); i++) d.fx.push({ kind: 'mote', x: (alt.x + 0.5) * TILE, y: (alt.y + 0.5) * TILE - 6, t: 1 + i * 0.03, max: 1 + i * 0.03, seed: i });
  d.feedT = 1;
  if (grew) UI.toast(`The Lodestar grows: magnitude ${grew}`, 'legendary');
}

// The Meridian: a prop the diver walks in front of and behind, its beacon
// dark until the star is whole and the beacon lit.
const _wreck = {};
function wreckSprite() {
  const lit = !!Save.data.beaconLit;
  if (!_wreck[lit]) { const s = art2Sprite(WRECK_ROWS[lit ? 'lit' : 'dark']); s.ax = s.w / 2; s.ay = s.h - footOff(3); _wreck[lit] = s; }
  return _wreck[lit];
}
function drawWreck(d, ox, oy, lights) {
  const s = HUB_STATIONS.find((x) => x.id === 'wreck'), spr = wreckSprite();
  const x = Math.round((s.x + 0.5) * ATILE + ox - spr.ax), y = Math.round((s.y + 0.5) * ATILE + oy - spr.ay);
  drawArtSprite(spr, x, y);
  // the beacon: a cold spark until it's lit, then a great warm light
  const bx = x + spritePt(spr, 24), by = y + spritePt(spr, 0);
  if (Save.data.beaconLit) lights.push({ x: bx, y: by, r: TILE * 6, i: 1.4, c: rgb01(ART.pal.star[3]) });
  else lights.push({ x: bx, y: by, r: TILE, i: 0.25 + 0.15 * Math.sin(Game.realT * 2), c: [0.5, 0.6, 0.8] });
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
  'Z': '111/001/010/100/111', ' ': '00/00/00/00/00',
};
function drawLabel(text, cx, y, col, alpha) {
  const c = View.ctx, glyphs = [...text].map((ch) => (LABEL_FONT[ch] || LABEL_FONT[' ']).split('/'));
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
const STATION_LABELS = { setout: 'THE PORTAL', altar: 'THE STAR', locker: 'LOCKER', forge: 'FORGE', runes: 'RUNE BENCH', wreck: 'THE MERIDIAN', dummy: 'TARGET' };
// (world px above or below the station's middle)
const STATION_LABEL_Y = { setout: 8, altar: -26, locker: -24, forge: -26, runes: -20, wreck: -34, dummy: -22 };
function drawStationLabels(d, ox, oy) {
  for (const s of HUB_STATIONS) {
    const x = (s.x + 0.5) * TILE, y = (s.y + 0.5) * TILE, m = dist(x, y, d.p.x, d.p.y) / TILE;
    const a = clamp(1.1 - (m - 2) / 4, 0.45, 1);
    drawLabel(STATION_LABELS[s.id], Math.round(x * AP) + ox, Math.round((y + STATION_LABEL_Y[s.id]) * AP) + oy, m < 2 ? '#fff2c8' : '#c8bca0', a);
  }
}
