'use strict';
// ---------------------------------------------------------------------------
// How each clime's own creature looks (foes.js has what they do). Drawn by
// hand at the art's size (artNative: 24 art px a tile), a letter a
// material, shaded by buildArtSprite with a black outline, each material at
// most four hue-shifted tones, no dither; eyes, cores and flames glow. Each
// is in its own clime's colours and its own shape, so it reads apart from
// the crawler, the wisp and the construct, from the fighting flora and from
// ore. Every one has its frames: idle, moving, its tell, its attack, and
// the states of its own mechanic (under the sand, in the water, a frozen
// idol, a turning key).
// ---------------------------------------------------------------------------

// The letters: H the hide (h its darkest, j a mid tone a pixel wide, for
// legs and stalks, so the outline frames them), B a second material (a
// belly, a stripe, a muzzle, a sclera), T a third (tusks, claws, fins,
// brass; t darkest), M a fourth (moss, spots), S sand or mire, D a mouth or
// socket (one dark tone), Z a crab's seams (dark, or alight when cracked).
// E eyes, C a core, F flame, W white heat: these glow.
const FOE_LETTERS = {
  H: ['hide'], h: ['hide', 0], j: ['hide', 2], B: ['belly'], b: ['belly', 0], T: ['horn'], t: ['horn', 0],
  M: ['moss'], m: ['moss', 0], S: ['sand'], s: ['sand', 0], D: ['maw'], Z: ['seam'],
  E: ['eye'], C: ['core'], F: ['flame'], W: ['white'],
};
const FOE_GLOWS = ['eye', 'core', 'flame', 'white'];

// Each one's colours, from its clime: ramps dark to light (glows one colour).
const FOE_PAL = {
  // rust-red with a cream stripe, over the badlands' ochre dust
  skink: { hide: ['#200c0c', '#521c18', '#8a3222', '#c05a32'], belly: ['#5a4a30', '#a08a5a', '#d0bc84', '#f4e6b0'], horn: ['#6a5a40', '#c8b890', '#e8dcb8', '#fff8e0'], sand: ['#3a2216', '#6e4630', '#8e6040', '#b08458'], maw: ['#140806'], eye: ['#ffb02a'] },
  // shaggy dusk-violet fur, a frosted muzzle, ivory tusks, ice-blue eyes
  tusker: { hide: ['#120e1c', '#2a2238', '#463a56', '#6a5a7a'], belly: ['#5a6080', '#9aa4c4', '#c8d0e6', '#eef2ff'], horn: ['#4a4030', '#9a8a68', '#d0c4a0', '#fff6dc'], eye: ['#8fe4ff'], white: ['#e8fcff'] },
};
// what each one's eyes or core light the floor with
const FOE_GLOW = { skink: '#ffb02a', tusker: '#8fe4ff' };

// A frame that's another with some of its rows redrawn: { row: 'pixels' }.
function foeRowsFrom(base, rows) { return base.map((r, i) => (rows[i] !== undefined ? rows[i] : r)); }


// Each creature's frames, by name. foes.js picks one by its state.
const FOE_ROWS = {
  // the Dune Skink: from above, a slim lizard with a pale stripe down its
  // back, its feet stepping; a mound of sand with its eyes peeping when
  // it's under; bursting up, jaws open; half sunk as it digs back down
  skink: {
    idle: [
      '........HHH........',
      '.......HHHHH.......',
      '......EHHHHHE......',
      '......HHHHHHH......',
      '.j.j...HHhHH...j.j.',
      '..j....HHHHH....j..',
      '..j...HHHBHHH...j..',
      '...jjjHHHBHHHjjj...',
      '......HHBBBHH......',
      '......hHBBBHh......',
      '......HHBBBHH......',
      '......hHBBBHh......',
      '......HHBBBHH......',
      '...jjjHHHBHHHjjj...',
      '..j...HHHBHHH...j..',
      '..j....HHHHH....j..',
      '.j.j....HHH....j.j.',
      '........HHH........',
      '.........HH........',
      '.........HH........',
      '..........H........',
      '..........HH.......',
      '...........H.......',
      '...........H.......',
    ],
    move: [
      '........HHH........',
      '.......HHHHH.......',
      '......EHHHHHE......',
      '......HHHHHHH......',
      '.j.j...HHhHH.......',
      '..j....HHHHH.......',
      '..j...HHHBHHH......',
      '...jjjHHHBHHHjjj...',
      '......HHBBBHH...j..',
      '......hHBBBHh..j.j.',
      '......HHBBBHH......',
      '......hHBBBHh..j.j.',
      '......HHBBBHH...j..',
      '...jjjHHHBHHHjjj...',
      '..j...HHHBHHH......',
      '..j....HHHHH.......',
      '.j.j....HHH........',
      '........HHH........',
      '........HH.........',
      '.......HH..........',
      '.......H...........',
      '......HH...........',
      '......H............',
      '.....H.............',
    ],
    move2: [
      '........HHH........',
      '.......HHHHH.......',
      '......EHHHHHE......',
      '......HHHHHHH......',
      '.......HHhHH...j.j.',
      '.......HHHHH....j..',
      '......HHHBHHH...j..',
      '...jjjHHHBHHHjjj...',
      '..j...HHBBBHH......',
      '.j.j..hHBBBHh......',
      '......HHBBBHH......',
      '.j.j..hHBBBHh......',
      '..j...HHBBBHH......',
      '...jjjHHHBHHHjjj...',
      '......HHHBHHH...j..',
      '.......HHHHH....j..',
      '........HHH....j.j.',
      '........HHH........',
      '.........HH........',
      '..........HH.......',
      '...........H.......',
      '............H......',
      '............H......',
      '.............H.....',
    ],
    attack: [
      '....HHH.....HHH....',
      '...HHEHH...HHEHH...',
      '...HHHHTt.tTHHHH...',
      '....HHHTDDDTHHH....',
      '....HHHDDDDDHHH....',
      '.....HHTDDDTHH.....',
      '......HHTDTHH......',
      '.......HHHHH.......',
      '......HHHBHHH......',
      '.....HHHBBBHHH.....',
      '..S..HHHBBBHHH..S..',
      '.SS.SHHHBBBHHHS.SS.',
      'SSSSSSSSSSSSSSSSSSS',
      '.sSSSSSSSSSSSSSSSs.',
    ],
    dig: [
      '........HHH........',
      '.......HHHHH.......',
      '......EHHHHHE......',
      '......HHHHHHH......',
      '.......HHhHH.......',
      '..j.j..HHHHH..j.j..',
      '...SSSHHHBHHHSSS...',
      '.SSSSSSSSSSSSSSSSS.',
      'SSSSSSSSSSSSSSSSSSS',
      '.sSSSSSSSSSSSSSSSs.',
    ],
    mound: [
      '......SSSSSSS......',
      '....SSSESSSESSS....',
      '..SSSSSSSSSSSSSSS..',
      '.SSSSSSSSSSSSSSSSS.',
      'SSSSSSSSSSSSSSSSSSS',
      '.ssSSSSSSSSSSSSSss.',
    ],
    mound2: [
      '.......SSSSSSS.....',
      '.....SSESSSESSSS...',
      '...SSSSSSSSSSSSSSS.',
      '.SSSSSSSSSSSSSSSSS.',
      'SSSSSSSSSSSSSSSSSSS',
      '.ssSSSSSSSSSSSSSss.',
    ],
  },
  // the Tusker: side on (mirrored to face left), a shaggy hump dusted with
  // snow, a frosted trunk and a tusk hooked forward and up; its head down
  // and eyes flaring to charge, its legs at full stretch
  tusker: {
    idle: [
      '...........BBBBB..................',
      '........BBBHHHHHBB................',
      '......BBHHHHHHHHHHBB..............',
      '.....HHHHHHHHHHHHHHHHB............',
      '....HHHHHHHHHHHHHHHHHHHB..........',
      '...HHHHHHHHHHHHHHHHHHHHHhhh.......',
      '...HHHHHHHHHHHHHHHHHHHHhHHHhh.....',
      '..HHHHHHHHHHHHHHHHHHHHhHHHHHHh....',
      '..HHHHHHHHHHHHHHHHHHHhHHHHHEEHH...',
      '..HHHHHHHHHHHHHHHHHHHhHHHHHHHHHB..',
      '..HHHHHHHHHHHHHHHHHHHhHHHHHHHHBBB.',
      '..HHHHHHHHHHHHHHHHHHHHhHHHHHHHBBB.',
      '..HHHHHHHHHHHHHHHHHHHHhHHHHHHHHBB.',
      '...HHHHHHHHHHHHHHHHHHHHHHHHTTHB..T',
      '...HHHHHHHHHHHHHHHHHHHHHHHHHTTB.TT',
      '....hHhHHhHHhHHhHHhHHhHHh...TTTTT.',
      '....h.HHH.HHH.h.HHH.HHH.h....TTT..',
      '......HHH.HHH....HHH.HHH..........',
      '......HHH.HHH....HHH.HHH..........',
      '......HHH.HHH....HHH.HHH..........',
      '......hhh.hhh....hhh.hhh..........',
    ],
    move: [
      '...........BBBBB..................',
      '........BBBHHHHHBB................',
      '......BBHHHHHHHHHHBB..............',
      '.....HHHHHHHHHHHHHHHHB............',
      '....HHHHHHHHHHHHHHHHHHHB..........',
      '...HHHHHHHHHHHHHHHHHHHHHhhh.......',
      '...HHHHHHHHHHHHHHHHHHHHhHHHhh.....',
      '..HHHHHHHHHHHHHHHHHHHHhHHHHHHh....',
      '..HHHHHHHHHHHHHHHHHHHhHHHHHEEHH...',
      '..HHHHHHHHHHHHHHHHHHHhHHHHHHHHHB..',
      '..HHHHHHHHHHHHHHHHHHHhHHHHHHHHBBB.',
      '..HHHHHHHHHHHHHHHHHHHHhHHHHHHHBBB.',
      '..HHHHHHHHHHHHHHHHHHHHhHHHHHHHHBB.',
      '...HHHHHHHHHHHHHHHHHHHHHHHHTTHB..T',
      '...HHHHHHHHHHHHHHHHHHHHHHHHHTTB.TT',
      '....hHhHHhHHhHHhHHhHHhHHh...TTTTT.',
      '....h.HHH.HHH.h.HHH.HHH.h....TTT..',
      '......HHH.HHH....HHH.HHH..........',
      '......HHH.HHH....HHH.HHH..........',
      '......HHH.hhh....hhh.HHH..........',
      '......hhh............hhh..........',
    ],
    windup: [
      '...........BBBBB..................',
      '........BBBHHHHHBB................',
      '......BBHHHHHHHHHHBB..............',
      '.....HHHHHHHHHHHHHHHHB............',
      '....HHHHHHHHHHHHHHHHHHHB..........',
      '...HHHHHHHHHHHHHHHHHHHHH..........',
      '...HHHHHHHHHHHHHHHHHHHHhhhh.......',
      '..HHHHHHHHHHHHHHHHHHHHhHHHHhh.....',
      '..HHHHHHHHHHHHHHHHHHHhHHHHHHHh....',
      '..HHHHHHHHHHHHHHHHHHHhHHHHHWWHH...',
      '..HHHHHHHHHHHHHHHHHHHhHHHHHHHHHB..',
      '..HHHHHHHHHHHHHHHHHHHHhHHHHHHHBBB.',
      '..HHHHHHHHHHHHHHHHHHHHhHHHHHHHBBB.',
      '...HHHHHHHHHHHHHHHHHHHHHHHHHHHHBB.',
      '...HHHHHHHHHHHHHHHHHHHHHHHHTTHB..T',
      '....hHhHHhHHhHHhHHhHHhHHHHHHTTB.TT',
      '....h.HHH.HHH.h.HHH.HHH.h...TTTTT.',
      '......HHH.HHH....HHH.HHHh....TTT..',
      '......HHH.HHH....HHH.HHH..........',
      '......HHH.HHH....HHH.HHH..........',
      '......hhh.hhh....hhh.hhh..........',
    ],
    charge: [
      '...........BBBBB..................',
      '........BBBHHHHHBB................',
      '......BBHHHHHHHHHHBB..............',
      '.....HHHHHHHHHHHHHHHHB............',
      '....HHHHHHHHHHHHHHHHHHHB..........',
      '...HHHHHHHHHHHHHHHHHHHHH..........',
      '...HHHHHHHHHHHHHHHHHHHHhhhh.......',
      '..HHHHHHHHHHHHHHHHHHHHhHHHHhh.....',
      '..HHHHHHHHHHHHHHHHHHHhHHHHHHHh....',
      '..HHHHHHHHHHHHHHHHHHHhHHHHHWWHH...',
      '..HHHHHHHHHHHHHHHHHHHhHHHHHHHHHB..',
      '..HHHHHHHHHHHHHHHHHHHHhHHHHHHHBBB.',
      '..HHHHHHHHHHHHHHHHHHHHhHHHHHHHBBB.',
      '...HHHHHHHHHHHHHHHHHHHHHHHHHHHHBB.',
      '...HHHHHHHHHHHHHHHHHHHHHHHHTTHB..T',
      '....hHhHHhHHhHHhHHhHHhHHHHHHTTB.TT',
      '....h.HHH.HHH.h.HHH.HHH.h...TTTTT.',
      '.....HHH...HHH....HHH..HHH...TTT..',
      '....HHH.....HHH....HHH..HHH.......',
      '....hhh......hhh....hhh..hhh......',
      '..................................',
    ],
  },
};
for (const k in FOE_ROWS) for (const f in FOE_ROWS[k]) artNative(FOE_ROWS[k][f]);

// A frame as a sprite, built once. variant: 'cracked' (a crab's seams
// alight), 'frozen' (its shell frosted), 'flip' (mirrored).
const _foeSprites = new Map();
function foeSprite(type, frame, variant) {
  const key = type + '/' + frame + '/' + (variant || '');
  let s = _foeSprites.get(key);
  if (s) return s;
  if (variant === 'flip') { s = flippedSprite(foeSprite(type, frame)); s.flash = tinted(s.c, '#ffffff'); }
  else {
    const rows = FOE_ROWS[type][frame] || FOE_ROWS[type].idle || Object.values(FOE_ROWS[type])[0];
    let pal = FOE_PAL[type], letters = FOE_LETTERS;
    if (variant === 'cracked') letters = Object.assign({}, FOE_LETTERS, { Z: ['core'] });
    if (variant === 'frozen') pal = Object.assign({}, pal, { hide: ['#1a2a40', '#3a5a80', '#7aa4cc', '#c8e8ff'], seam: ['#0e1a2a', '#1a2e48', '#2a4466'] });
    s = buildArtSprite(rows, pal, letters, FOE_GLOWS, ART_CREATURE);
    s.flash = tinted(s.c, '#ffffff'); s.ax = s.w / 2; s.ay = s.h - footOff(1.5);
  }
  _foeSprites.set(key, s);
  return s;
}
