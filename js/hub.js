'use strict';
// ---------------------------------------------------------------------------
// The outpost on the sinkhole's rim, drawn. The Lodestar hangs over the pit,
// bobbing, its lodelines running down into the dark: one more for every
// magnitude. Round the plaza stand the stations (the star's altar, the
// locker, the ledge you jump from, the forge, the rune bench) and the
// practice target, and lanterns, one lit for every magnitude. The floor,
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
  descend: [
    'MMMMMMMMMMMMMMMMMMMM',
    'MwwMwwMwwMwwMwwMwwwM',
    'MwwMwwMwwMwwMwwMwwwM',
    'MMMMMMMMMMMMMMMMMMMM',
    '.MM..............MM.',
  ],
};
const _stationSprites = {};
function stationSprite(id) {
  if (!_stationSprites[id]) {
    const pal = id === 'altar' ? { arcane: [ART.pal.star[2]], coreglow: [ART.pal.star[3]] } : id === 'locker' ? { rune: [DIVER_PAL.tip[0]] } : {};
    const s = buildArtSprite(STATION_ROWS[id], pal);
    s.ax = s.w / 2; s.ay = s.h - 1;
    _stationSprites[id] = s;
  }
  return _stationSprites[id];
}

const LANTERNS = [[3, 15], [23, 15], [3, 20], [23, 20], [6, 26], [20, 26], [10, 28], [16, 28]];
const STAR_AT = { x: 13.5, y: 8.5 }; // tiles: over the middle of the pit

// Under everything that walks: the lodelines in the pit, the stations, the
// lanterns.
function drawHubUnder(d, ox, oy, tick, lights) {
  const mag = magnitudeOf(Save.data.star), star = ART.pal.star;
  const sx = STAR_AT.x * TILE + ox, sy = STAR_AT.y * TILE + oy;
  // the lodelines, falling from the star into the dark
  for (let k = 0; k < mag; k++) {
    const bx = Math.round(sx + (k - (mag - 1) / 2) * 7), len = 70 + ((k * 37) % 30);
    for (let y = 8; y < len; y++) {
      if (bayerAt(bx, y + tick) > 0.6) continue;
      dot(bx, Math.round(sy + y), y % 5 ? star[2] : star[3], true, 0.7 * (1 - y / len));
    }
  }
  for (const s of HUB_STATIONS) {
    if (s.id === 'dummy') continue;
    const spr = stationSprite(s.id), x = Math.round((s.x + 0.5) * TILE + ox - spr.ax), y = Math.round((s.y + 0.5) * TILE + oy - spr.ay + (s.id === 'descend' ? 4 : 6));
    drawArtSprite(spr, x, y);
    const glow = { forge: [ART.pal.glass[0], 1.8, 0.9], runes: [ART.pal.arcane[0], 1.2, 0.5], locker: [DIVER_PAL.tip[0], 1, 0.4], altar: [star[3], 1.6, 0.8] }[s.id];
    if (glow) lights.push({ x: x + spr.w / 2, y: y + spr.h / 2, r: TILE * glow[1], i: glow[2] * (0.85 + 0.15 * Math.sin(Game.realT * 3)), c: rgb01(glow[0]) });
  }
  // the ledge you jump from: an arrow pulsing down into the pit
  const dz = HUB_STATIONS.find((s) => s.id === 'descend'), ax = (dz.x + 0.5) * TILE + ox, ay = (dz.y + 0.5) * TILE + oy - 10 + Math.round(Math.sin(Game.realT * 4) * 1.5);
  for (const [i, j] of [[0, 0], [-1, -1], [1, -1], [-2, -2], [2, -2], [0, -1], [0, -2], [0, -3]]) dot(Math.round(ax + i), Math.round(ay + j), star[3], true, 0.8);
  // lanterns, lit one per magnitude
  LANTERNS.forEach(([lx, ly], k) => {
    const x = Math.round((lx + 0.5) * TILE + ox), y = Math.round((ly + 0.5) * TILE + oy), lit = k < mag;
    drawShadow(x, y, 2);
    for (let j = 0; j < 9; j++) dot(x, y - j, ART.pal.metal[j < 2 ? 1 : 2]);
    for (const [i, j] of [[-1, -10], [0, -10], [1, -10], [-1, -11], [1, -11], [-1, -12], [0, -12], [1, -12]]) dot(x + i, y + j, ART.pal.metal[3]);
    dot(x, y - 11, lit ? star[3] : '#202028', lit);
    if (lit) lights.push({ x, y: y - 11, r: TILE * 2.2, i: 0.7, c: rgb01(star[2]) });
  });
}

// Over everything: the Lodestar itself, bigger as it grows.
function drawHubOver(d, ox, oy, lights) {
  const mag = magnitudeOf(Save.data.star), k = mag >= 5 ? 3 : 2;
  const sx = STAR_AT.x * TILE + ox, sy = STAR_AT.y * TILE + oy + Math.sin(Game.realT * 1.2) * 2;
  if (!_stationSprites.star) _stationSprites.star = spriteFrom(LODESTAR_ROWS, LODESTAR_PAL);
  const st = _stationSprites.star, w = st.width * k, h = st.height * k, x = Math.round(sx - w / 2), y = Math.round(sy - h / 2);
  const pulse = d.feedT > 0 ? d.feedT : 0;
  View.ctx.drawImage(st, x, y, w, h);
  View.emCtx.drawImage(st, x, y, w, h);
  lights.push({ x: sx, y: sy, r: TILE * (4 + mag * 0.4 + pulse * 3), i: 1.1 + pulse, c: rgb01(ART.pal.star[2]) });
  if (pulse > 0) ringDots(sx, sy, 20 + (1 - pulse) * 30, ART.pal.star[3], pulse, true);
}

// Feeding the star from the altar: motes stream up into it, and it pulses.
function feedStarFx(d, n, grew) {
  const alt = HUB_STATIONS.find((s) => s.id === 'altar');
  for (let i = 0; i < Math.min(40, 6 + n); i++) d.fx.push({ kind: 'mote', x: (alt.x + 0.5) * TILE, y: (alt.y + 0.5) * TILE - 6, t: 1 + i * 0.03, max: 1 + i * 0.03, seed: i });
  d.feedT = 1;
  if (grew) UI.toast(`The Lodestar grows: magnitude ${grew}`, 'legendary');
}
