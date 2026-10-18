'use strict';
// ---------------------------------------------------------------------------
// Climes: the country a site is. The region (T.biomes) still sets the ore
// and how strong the enemies are; the clime sets how the place looks and
// feels: its ground, rock and light, its plants and critters, the weather,
// and one mild hazard (hazards.js). Each zone's first clime is the look it
// always had, so these only add.
//   CLIME_ART: a palette in the shape of ART.biomes (sun: under the sky;
//     paving: ruin flagstones), plus haz (the hazard's own ramp: deep, mid,
//     light, edge), decor (what's painted over the ground here and there),
//     vent ('fire' or 'steam') and sign (the colour of the motes round a portal that leads to it).
//   CLIME_FLORA: each clime's plants in the FLORA format, built with
//     buildArtSprite(rows, pal, CLIME_LETTERS, CLIME_GLOWS). sky: they
//     don't glow under the sun. looks: which pieces the fighting flora wear.
//   CLIME_LIFE: its critters' colours (LIFE_PAL's shape), how many of each
//     (LIFE_MIX's), and its weather.
// The numbers (how often each turns up, its light, its hazard) are in
// T.climes.
// ---------------------------------------------------------------------------

const CLIME_ART = {
  frost: {
    sun: true, floor: ['#a3b1c4', '#b4c1d3', '#c4d0e0'], rock: ['#38465f', '#404f69', '#485873', '#d4e8fc'], front: ['#1c2436', '#28334c', '#364462'], glow: '#bfe4ff',
    haz: ['#6f90ba', '#86a7cf', '#a2c0e2', '#eef8ff'], decor: 'drifts', sign: '#bfe4ff',
  },
  cinder: {
    sun: true, floor: ['#363030', '#403938', '#4a4240'], rock: ['#120e0e', '#181312', '#1e1816', '#7c5646'], front: ['#2c1a16', '#3c241e', '#4c2e28'], glow: '#ff6a2a',
    decor: 'fissures', vent: 'fire', sign: '#ff7a3a',
  },
  bloomfen: {
    sun: true, floor: ['#3e4e2a', '#485a30', '#536838'], rock: ['#161e0e', '#1c2612', '#222e16', '#7a9a50'], front: ['#28331a', '#34421f', '#405026'], glow: '#e0a8ec',
    decor: 'moss', sign: '#d8a0ff',
  },
  grotto: {
    floor: ['#182a33', '#1f3641', '#26434f'], rock: ['#03070a', '#060c11', '#091218', '#5a90a8'], front: ['#162e3c', '#1e3e4d', '#284e60'], glow: '#5a7cff',
    haz: ['#0a2232', '#103248', '#18465f', '#6aa6c8'], decor: 'algae', sign: '#7a96ff',
  },
  magma: {
    floor: ['#1f1a19', '#272120', '#302927'], rock: ['#050303', '#0a0606', '#0f0909', '#9a4a34'], front: ['#301a16', '#40221c', '#522c24'], glow: '#ff5a1a',
    haz: ['#801808', '#d4420c', '#ff8c20', '#ffd860'], decor: 'cracks', sign: '#ff6a2a',
  },
  rootdeep: {
    floor: ['#211c14', '#29231a', '#322a1f'], rock: ['#050403', '#090806', '#0e0c08', '#8a7a52'], front: ['#2c2418', '#382e20', '#463a28'], glow: '#c8e85a',
    decor: 'roots', sign: '#c8e85a',
  },
  temple: {
    paving: true, floor: ['#273027', '#313b31', '#3b473b'], rock: ['#040605', '#080c09', '#0c110d', '#78987c'], front: ['#26342a', '#324436', '#3e5442'], glow: '#9ccf4a',
    haz: ['#0c2018', '#133024', '#1c4232', '#5a8a6a'], decor: 'overgrowth', sign: '#8ad06a',
  },
  vault: {
    floor: ['#29231f', '#332b25', '#3d342c'], rock: ['#060504', '#0b0907', '#100d0a', '#a08050'], front: ['#382a1a', '#483620', '#5a4428'], glow: '#ff9a50',
    decor: 'plates', vent: 'steam', sign: '#e0b070',
  },
};
// what a fire vent's and a steam vent's breath look like: [core, body, edge]
const VENT_COLS = { fire: ['#fff0a0', '#ffa030', '#c83a10'], steam: ['#ffffff', '#d8e4ec', '#8a9aa8'] };
// a spore cloud's colours by clime: [bright, dim]
const SPORE_COLS = { bloomfen: ['#f0c0f4', '#a070b0'], rootdeep: ['#f0e4a0', '#a89a58'] };

// Flora: FLORA's letters, and a few more.
const CLIME_LETTERS = Object.assign({}, FLORA_LETTERS, {
  N: ['snow'], n: ['snow', 0], G: ['leaf'], g: ['leaf', 0], P: ['petal'], p: ['petal', 0], K: ['bark'], k: ['bark', 0],
  V: ['vine'], v: ['vine', 0], H: ['shell'], h: ['shell', 0], Q: ['spark'],
});
const CLIME_GLOWS = ['glow', 'glow2', 'ember', 'spark'];
// every clime palette starts from this, so a piece borrowed from FLORA has
// all it needs
const CLIME_PAL_BASE = Object.assign({}, FLORA_PAL.rim, {
  snow: ['#5a6a84', '#9aaac4', '#c8d4e6', '#eef4ff'], leaf: ['#10200e', '#203a1a', '#305628', '#467238'], petal: ['#3a1a30', '#6a3058', '#a04c84', '#d478b0'],
  bark: ['#140e0a', '#2a1e14', '#3e2c1e', '#56402a'], vine: ['#0e1a0e', '#1c321a', '#2c4a26', '#3e6232'], shell: ['#2a2420', '#5a5044', '#8a7e6a', '#c4b89c'], spark: ['#fff4c0'],
});
const climePal = (o) => Object.assign({}, CLIME_PAL_BASE, o);

// A piece borrowed from a region's flora, as it stands.
const borrowFlora = (set, name, over) => Object.assign({}, FLORA[set].find((p) => p.name === name), over);

const CLIME_FLORA = {
  frost: {
    sky: true, looks: { snapjaw: 'Frost bulb', spitter: 'Snow shrub' },
    pal: climePal({
      snow: ['#5a6a84', '#9aaac4', '#c8d4e6', '#f2f8ff'], leaf: ['#0a1618', '#14282a', '#1e3a38', '#2c5048'], bark: ['#140e0c', '#2a1e18', '#3e2c22', '#56402e'],
      root: ['#141012', '#2a2026', '#40323a', '#584650'], stem: ['#4a3e2a', '#7a6a48', '#a8946a', '#d0bc90'], bone: ['#5a5448', '#9a9078', '#c8bea4', '#ece4cc'],
      flesh: ['#2a3450', '#4a5a84', '#7a8cb8', '#b4c4e8'], glow: ['#cfe8ff'], glow2: ['#ffffff'],
    }),
    pieces: [
      { name: 'Snow shrub', anchor: 'floor', weight: 4, frames: [[
        '....NNN......',
        '..NNNNNNN.N..',
        '.NNNNNNNNNNN.',
        'NNNkNNNNNkNNN',
        '.kTLNNNkTTLN.',
        '..TkT.kTkTk..',
        '...kTkTTk....',
        '....kTTk.....',
        '....tTTt.....',
      ]] },
      { name: 'Bristle pine', anchor: 'floor', weight: 2, frames: [[
        '.......N.......',
        '......NNN......',
        '.....NGGGN.....',
        '....gGGGGgg....',
        '......NNN......',
        '....NNGGGNN....',
        '...NGGGGGGGN...',
        '..gGGGGgGGGgg..',
        '....ggKgggg....',
        '.....NNNNN.....',
        '...NNGGGGGNN...',
        '..NGGGGGGGGGN..',
        '.NGGGGGgGGGGGN.',
        'gGGGGgGGGGgGGGg',
        '..gggggKgggg...',
        '.......K.......',
        '......KK.......',
        '.......K.......',
        '.......Kk......',
        '......kK.......',
        '....N.KK..N....',
        '...NNNKkNNNN...',
        '..NNNNNNNNNNN..',
      ]] },
      { name: 'Frost reeds', anchor: 'wall', weight: 3, frames: [[
        '..N....N.',
        '..S...NS.',
        '.NS...S..',
        '.S..N.S..',
        '.S..S.S.N',
        '.S.NS.S.S',
        'S..S..S.S',
        'S..S.S..S',
        'S.S..S.S.',
        'S.S..S.S.',
        '.SS.S..S.',
        '.S.S.S.S.',
        '..SS.SS..',
        '..sssss..',
      ], [
        '...N...N.',
        '...S..NS.',
        '..NS..S..',
        '.S..N.S..',
        '.S..S.S..',
        '.S.NS.S.N',
        'S..S..S.S',
        'S..S.S..S',
        'S.S..S.S.',
        'S.S..S.S.',
        '.SS.S..S.',
        '.S.S.S.S.',
        '..SS.SS..',
        '..sssss..',
      ]] },
      { name: 'Tusk arch', anchor: 'floor', weight: 1, frames: [[
        '......BBB.....BBB......',
        '....BBb.........bBB....',
        '...Bb.............bB...',
        '..Bb...............bB..',
        '..B.................B..',
        '.Bb.................bB.',
        '.B...................B.',
        '.B...................B.',
        '.B.......BBBBB.......B.',
        'NBN....NBBbBbBBN....NBN',
        'NNNN..NNBBBBBBBNN..NNNN',
        '.NNNNNNNNNNNNNNNNNNNNN.',
      ]] },
      { name: 'Snow tufts', anchor: 'floor', weight: 5, frames: [[
        '..g...g..',
        '.gG.g.Gg.',
        '.GG.G.GG.',
        'NNNNNNNNN',
        '.nNNNNNn.',
      ], [
        '...g..g..',
        '..gG.gGg.',
        '.GG.G.GG.',
        'NNNNNNNNN',
        '.nNNNNNn.',
      ]] },
      { name: 'Frost bulb', anchor: 'floor', weight: 2, frames: [[
        '....FFF....',
        '...FFLFF...',
        '..FFFFFFF..',
        '..FFfFFFF..',
        '...fFFFf...',
        '....fSf....',
        '.N...S...N.',
        'NNN..S..NNN',
        '.NNNNNNNNN.',
      ]] },
    ],
  },
  cinder: {
    sky: true, looks: { snapjaw: 'Fire lily', spitter: 'Smouldering stump' },
    pal: climePal({
      ash: ['#0a0808', '#161212', '#241e1c', '#3a3230'], root: ['#1a1818', '#3a3636', '#5a5454', '#7e7676'], stem: ['#100c0a', '#221a16', '#36281e', '#4a382a'],
      petal: ['#4a0c08', '#8a1e10', '#d0401a', '#ff7a30'], leaf: ['#140c0a', '#2a1812', '#40261a', '#563424'], bone: ['#3a3430', '#6a625a', '#968c80', '#c0b6a8'],
      ember: ['#ff6a24'], glow: ['#ff8a3a'], glow2: ['#ffc070'],
    }),
    pieces: [
      { name: 'Charred snag', anchor: 'floor', weight: 2, frames: [[
        '..A.......A....',
        '..aA.....Aa..A.',
        '...aA...Aa..Aa.',
        'A...aA.Aa..Aa..',
        'aA...aAEa.Aa...',
        '.aA...AAAAa....',
        '..aAA.AEA......',
        '....aAAAa......',
        '......AEA......',
        '......AAa......',
        '.....aAEA......',
        '......AAA......',
        '......AAa......',
        '......AEA......',
        '.....aAAA......',
        '......AAa......',
        '......AAA......',
        '.....aAEAa.....',
        '....aAAAAAa....',
        '...aa.aAa.aa...',
      ]] },
      { name: 'Fire lily', anchor: 'floor', weight: 3, frames: [[
        '....P.P....',
        '...PPLPP...',
        '..P.PLP.P..',
        '..PPPLPPP..',
        '...PPPPP...',
        '....pSp....',
        '.....S.....',
        '..GG.S.....',
        '...GGS.GG..',
        '.....SGG...',
        '.....S.....',
        '....sSs....',
      ], [
        '.....P.P...',
        '...PPPLP...',
        '..P.PLP.P..',
        '..PPPLPPP..',
        '...PPPPP...',
        '....pSp....',
        '.....S.....',
        '..GG.S.....',
        '...GGS.GG..',
        '.....SGG...',
        '.....S.....',
        '....sSs....',
      ]] },
      { name: 'Ash brush', anchor: 'floor', weight: 4, frames: [[
        '..t...t..t...',
        '.tT.t.T.tT...',
        '..tTtTtTt..t.',
        '.t.tTTTt.tT..',
        '..tTtTTTtT...',
        '...tTTTTt....',
        '....tTTt.....',
        '...AAAAAA....',
      ]] },
      { name: 'Smouldering stump', anchor: 'floor', weight: 2, frames: [[
        '...E.....',
        '..AEAA...',
        '.AAAAAA..',
        '.AAEAAA..',
        '.AAAAEA..',
        '.AAAAAA..',
        'aAAAAAAa.',
        'aaAAaAAaa',
      ], [
        '....E....',
        '..AAEA...',
        '.AAAAAA..',
        '.AAEAAA..',
        '.AAAAAA..',
        '.AAAAEA..',
        'aAAAAAAa.',
        'aaAAaAAaa',
      ]] },
      { name: 'Scorched ribs', anchor: 'floor', weight: 1, frames: [[
        '..B....B....B..',
        '.Bb...Bb...Bb..',
        '.B...Bb...Bb...',
        'Bb...B....B....',
        'B...Bb...Bb....',
        'B...B....B.....',
        'AAAAAAAAAAAAAAA',
      ]] },
      { name: 'Cinder fern', anchor: 'wall', weight: 3, frames: [[
        '....G.....',
        '...GG..G..',
        '.G.G..GG..',
        '.GG.G.G...',
        '..GG.GG.G.',
        'G..GGG.GG.',
        '.GG.GGGG..',
        '...GGGG...',
        '....GG....',
        '...gggg...',
      ]] },
    ],
  },
  bloomfen: {
    sky: true, looks: { snapjaw: 'Bladder pods', spitter: 'Toadstools' },
    pal: climePal({
      cap: ['#3a2440', '#6a4878', '#9a74ac', '#c8a4d8'], flesh: ['#3a2030', '#6a3c58', '#9a6284', '#c890b0'], stem: ['#4a4636', '#7a7458', '#a8a07c', '#d4ccaa'],
      bone: ['#4a3c48', '#8a7488', '#c4aac0', '#ecd8ec'], leaf: ['#142412', '#22401c', '#345c28', '#4a7a36'], bark: ['#1c120a', '#3a2412', '#5a381c', '#7a4e28'],
      moss: ['#1a2a12', '#2a4220', '#3c5c2c', '#527a3a'], glow: ['#e8b0f0'], glow2: ['#f8d8ff'],
    }),
    pieces: [
      { name: 'Mushroom tree', anchor: 'floor', weight: 1, frames: [[
        '.......CCCCCCCCC.......',
        '....CCCCCCCCCCCCCCC....',
        '..CCCCCBCCCCCCCBCCCCC..',
        '.CCCCCBBCCCCCCCCCCCCCC.',
        'CCCCCCCCCCCCCBBCCCCCCCC',
        'CCCBCCCCCCCCCBBCCCCBCCC',
        'CCCCCCCCCCCCCCCCCCCCCCC',
        'ccccccccccccccccccccccc',
        '.fffFfFfFfFfFfFfFfFfff.',
        '...fflfffffffffffflf...',
        '........SSSSSS.........',
        '........SSSsSS.........',
        '........SSSSsS.........',
        '.........SSSSs.........',
        '.........SSSSS.........',
        '.........SsSSS.........',
        '.........SSSSS.........',
        '........SSSSSs.........',
        '........SSSSSS.........',
        '.......SSSsSSSS........',
        '......SSSSSSSSSS.......',
        '....OOSSsSSSSsSSOO.....',
        '...OOOOOOOOOOOOOOOO....',
      ]] },
      { name: 'Cattails', anchor: 'wall', weight: 3, frames: [[
        '..K.....K..',
        '..K...K.K..',
        '.KK...K.KK.',
        '.KK..KK.KK.',
        '.KK..KK.KK.',
        '..G..KK..G.',
        '..G...G..G.',
        '.G.G..G.G..',
        '.G.G..G.G..',
        'G..G.G..G.G',
        'G..G.G.G..G',
        'G..GG..G..G',
        '.G.G..GG.G.',
        '.G.G..G..G.',
        '..GG..G.G..',
        '..GG.GG.G..',
        '..gGGGGGg..',
        '...ggggg...',
      ], [
        '...K....K..',
        '...K..K.K..',
        '..KK..K.KK.',
        '..KK.KK.KK.',
        '..KK.KK.KK.',
        '..G..KK..G.',
        '..G...G..G.',
        '.G.G..G.G..',
        '.G.G..G.G..',
        'G..G.G..G.G',
        'G..G.G.G..G',
        'G..GG..G..G',
        '.G.G..GG.G.',
        '.G.G..G..G.',
        '..GG..G.G..',
        '..GG.GG.G..',
        '..gGGGGGg..',
        '...ggggg...',
      ]] },
      { name: 'Bladder pods', anchor: 'floor', weight: 2, frames: [[
        '.....FFF....',
        '..FF.FfFF...',
        '.FFFFFFFF.F.',
        '.FfFFLFFFFFF',
        '.FFFFFFfFFFF',
        '..FFFFFFFfF.',
        '...fFFfFFF..',
        '..OOGOOGOO..',
        '.OOOOOOOOOO.',
      ], [
        '.....FFF....',
        '..FF.FfFF...',
        '.FFFFFFFF.F.',
        '.FfFFFFFFFFF',
        '.FFFFFLfFFFF',
        '..FFFFFFFfF.',
        '...fFFfFFF..',
        '..OOGOOGOO..',
        '.OOOOOOOOOO.',
      ]] },
      { name: 'Toadstools', anchor: 'floor', weight: 4, frames: [[
        '..CCC......',
        '.CLCCC..CC.',
        '.ccccc.CLCC',
        '...S...cccc',
        '...S.CC..S.',
        '...SccCC.S.',
        '..OOO.S.OO.',
        '.OOOOOOOOOO',
      ]] },
      { name: 'Fen grass', anchor: 'floor', weight: 5, frames: [[
        '..g....g...',
        '..G.g..Gg..',
        '.gG.G.gG.g.',
        '.GG.GG.G.G.',
        'GGG.GG.GGG.',
        'OOOOOOOOOOO',
      ], [
        '...g...g...',
        '..G..g.Gg..',
        '.gG.G.gG..g',
        '.GG.GG.G.G.',
        'GGG.GG.GGG.',
        'OOOOOOOOOOO',
      ]] },
    ],
  },
  grotto: {
    looks: { snapjaw: 'Anemones', spitter: 'Barnacle mound' },
    pal: climePal({
      moss: ['#081814', '#12302a', '#1c463c', '#2a5e50'], leaf: ['#08161c', '#102a32', '#1a3e48', '#26525e'], flesh: ['#2a1a3a', '#4a3068', '#6c4c94', '#9a78c0'],
      shell: ['#1e2428', '#3e4a50', '#66747a', '#9aa8ac'], drip: ['#1c3040', '#3a5a72', '#5e86a2', '#a8d0e8'], rock: ['#14242c', '#26404c', '#365664', '#4a6e7c'],
      glow: ['#5a7cff'], glow2: ['#b4c4ff'],
    }),
    pieces: [
      { name: 'Algae curtain', anchor: 'ceiling', weight: 3, frames: [[
        'OOOOOOOOO',
        '.O.OO.O.O',
        '.O.O..O.O',
        '.O.L..O.O',
        '.O....O.L',
        '.L....O..',
        '......O..',
        '......L..',
      ], [
        'OOOOOOOOO',
        '.O.OO.O.O',
        'O..O..O.O',
        'O..L...OO',
        'O......OL',
        'L.....O..',
        '......O..',
        '.....L...',
      ]] },
      { name: 'Kelp fronds', anchor: 'floor', weight: 2, frames: [[
        '...G......',
        '...GG..L..',
        '....G..G..',
        '...GG.GG..',
        '..GG..G...',
        '..G..GG.G.',
        '..GL.G..G.',
        '..GG.GG.G.',
        '...G..G.G.',
        '..GG.GG.L.',
        '..G..G..G.',
        '..G.GG.GG.',
        '..GGG..G..',
        '...GG.GG..',
        '..RRRRRR..',
      ], [
        '....G.....',
        '...GG...L.',
        '...G...G..',
        '...GG..GG.',
        '....GG..G.',
        '..G..G.GG.',
        '..GL.GG.G.',
        '..GG..G.G.',
        '...G.GG.G.',
        '..GG.G..L.',
        '..G..GG.G.',
        '..G.GG.GG.',
        '..GGG..G..',
        '...GG.GG..',
        '..RRRRRR..',
      ]] },
      { name: 'Anemones', anchor: 'floor', weight: 3, frames: [[
        '.l.l..l.l.l',
        '.F.F.lF.F.F',
        '..FFF.FFFF.',
        '..FFF..FF..',
        '.RRFR.RFR..',
        'RRRRRRRRRR.',
      ], [
        'l.l..l.l.l.',
        '.F.F.F.F.F.',
        '..FFF.FFFF.',
        '..FFF..FF..',
        '.RRFR.RFR..',
        'RRRRRRRRRR.',
      ]] },
      { name: 'Barnacle mound', anchor: 'floor', weight: 2, frames: [[
        '....HH.....',
        '..HhHHhH...',
        '.HHHHLHHH..',
        '.HhHHhHHHH.',
        'HHHHHHHhHHH',
        'RRRRRRRRRRR',
      ]] },
      { name: 'Barnacle shelf', anchor: 'wall', weight: 3, frames: [[
        '..HHH......',
        '.HhHhH.....',
        '..HHHHH.HH.',
        '.....HhHhHH',
        '.......HHH.',
        '..HH.......',
        '.HhHH......',
        'HHHHH......',
      ]] },
      borrowFlora('rim', 'Dripstone', { weight: 2 }),
    ],
  },
  magma: {
    looks: { snapjaw: 'Lava bloom', spitter: 'Ember moss' },
    pal: climePal({
      rock: ['#0c0a0a', '#1e1a1a', '#302a2a', '#463e3c'], cap: ['#140c0a', '#2a1610', '#401e14', '#58281a'], moss: ['#180806', '#34100a', '#501a10', '#6c2414'],
      drip: ['#3a2222', '#71413c', '#a16053', '#d08570'], root: ['#140c0a', '#352119', '#533427', '#784b37'], metal: ['#1a1210', '#402b21', '#65442f', '#8f603e'],
      ember: ['#ff6a24'], glow: ['#ff7a30'], glow2: ['#ffc060'],
    }),
    pieces: [
      { name: 'Basalt columns', anchor: 'floor', weight: 2, frames: [[
        '....RRR......',
        '...RrrrR.....',
        '...RRRRR.RRR.',
        '...RRrRRRrrrR',
        'RRRRRrRRRRRRR',
        'rrrRRrRRRRrRR',
        'RRRRRrRRRRrRR',
        'RRrRRrRRRRrRR',
        'RRrRRrRRRRrRR',
        'RRrRRRRRRRrRR',
        'RRrRRRRRRRrRR',
        'RRrRRRRERRRRR',
        'RRRRRRRRRRRRR',
      ]] },
      { name: 'Ember moss', anchor: 'floor', weight: 4, frames: [[
        '...O..E..O.',
        '.OEOO.OOOO.',
        'OOOOOEOOOEO',
        'OOOOOOOOOOO',
      ], [
        '...O.....O.',
        '.OOOO.OEOO.',
        'OOEOOOOOOOO',
        'OOOOOOOEOOO',
      ]] },
      { name: 'Fire fungus', anchor: 'wall', weight: 3, frames: [[
        '..CCCC.....',
        '.CCCCCC....',
        '.EEEEEE....',
        '.....CCCCC.',
        '....CCCCCCC',
        '....EEEEEEE',
        '..CCC......',
        '.CCCCC.....',
        '.EEEEE.....',
      ]] },
      { name: 'Lava bloom', anchor: 'floor', weight: 2, frames: [[
        '....EE.....',
        '...ElLE....',
        '..EllLlE...',
        '...ElLE....',
        '....SS.....',
        '..C.SS.C...',
        '..CCSSCC...',
        '...CSSC....',
        '..RRRRRR...',
      ], [
        '...EEE.....',
        '...EllE....',
        '..ElLlLE...',
        '...ELlE....',
        '....SS.....',
        '..C.SS.C...',
        '..CCSSCC...',
        '...CSSC....',
        '..RRRRRR...',
      ]] },
      borrowFlora('underforge', 'Slag drip', { weight: 2 }),
      borrowFlora('underforge', 'Charred roots', { weight: 1 }),
    ],
  },
  rootdeep: {
    looks: { snapjaw: 'Glowcaps', spitter: 'Fern' },
    pal: climePal({
      root: ['#120d08', '#2a2014', '#44341f', '#5e4a2c'], vine: ['#0a140a', '#162a14', '#24401e', '#34582a'], leaf: ['#0c1a0a', '#183014', '#24481e', '#346228'],
      cap: ['#2a2410', '#4a4020', '#6e6030', '#988a48'], stem: ['#2a261c', '#4e4836', '#746a50', '#9a906c'], glow: ['#c8e85a'], glow2: ['#eef8a0'],
    }),
    pieces: [
      { name: 'Root arch', anchor: 'floor', weight: 1, frames: [[
        '........TTTTTTTTT.........',
        '.....TTTTtTTTTTtTTTTT.....',
        '...TTTtTT.......TTtTTTT...',
        '..TTtTT............TTtTT..',
        '.TTtT................TtTT.',
        '.TtT..................TtT.',
        'TTt....................tTT',
        'TT......................TT',
        'TT......................TT',
        'TtT....................TtT',
        'TTT....................TTT',
        'TtTT..................TTtT',
        'tTTTt................tTTTt',
        'ttTTTt..............tTTTtt',
      ]] },
      { name: 'Hanging vines', anchor: 'ceiling', weight: 3, frames: [[
        'VVVVVVVVV',
        '.V..V.VV.',
        '.VG.V..V.',
        '.V..VG.V.',
        'GV..V..V.',
        '.V..V..VG',
        '.VG.V..V.',
        '.V..L..V.',
        '.V.....V.',
        '.L....GV.',
        '.......V.',
        '.......L.',
      ], [
        'VVVVVVVVV',
        '.V..V.VV.',
        '.VG..V.V.',
        '..V..VGV.',
        '.GV..V.V.',
        '..V..V..V',
        '..VG.V..V',
        '..V..L..V',
        '..V.....V',
        '..L....GV',
        '........V',
        '........L',
      ]] },
      { name: 'Glowcaps', anchor: 'floor', weight: 4, frames: [[
        '.CLC.......',
        'CCCCC..CLC.',
        '.lcl..CCCCC',
        '..S....lcl.',
        '..S.CC..S..',
        '..SCLCC.S..',
        '..S.lc..S..',
        '.TTTTTTTTT.',
      ]] },
      { name: 'Root knot', anchor: 'wall', weight: 3, frames: [[
        '.TT....TT...',
        'TtTT..TtT...',
        '.TTtTTTT..T.',
        '...TtTTtTTt.',
        '..TTtTTTt...',
        '.TtT..TtTT..',
        'TT....TT.tT.',
        'T....TT...TT',
        '....TT.....T',
        '...tt.......',
      ]] },
      { name: 'Fern', anchor: 'floor', weight: 3, frames: [[
        '.....L.......',
        '..G..GG...L..',
        '...GG.G..GG..',
        'GG..GGG.GG...',
        '.GGG.GGGG.GG.',
        '...GGGGGGGG..',
        '.GG..GGG.....',
        '....GgGg.....',
        '.....gg......',
      ], [
        '......L......',
        '..G..GG..L...',
        '...GG.G.GG...',
        '.GG.GGG.GG...',
        '..GGGGGGG.GG.',
        '...GGGGGGGG..',
        '.GG..GGG.....',
        '....GgGg.....',
        '.....gg......',
      ]] },
      borrowFlora('rim', 'Hanging roots', { weight: 2 }),
    ],
  },
  temple: {
    looks: { snapjaw: 'Flower bush', spitter: 'Lilies' },
    pal: climePal({
      rock: ['#1c241e', '#3a463c', '#58665a', '#7a8a7c'], vine: ['#0a160c', '#14281a', '#203c28', '#2e5236'], leaf: ['#0e1c0e', '#1a3218', '#284a24', '#386630'],
      petal: ['#4a2a40', '#8a5478', '#c488b0', '#f0c8e0'], moss: ['#121c10', '#22341c', '#344c2a', '#486638'], glow: ['#b8e070'], glow2: ['#f0f8c0'],
    }),
    pieces: [
      { name: 'Broken column', anchor: 'floor', weight: 2, frames: [[
        '..RR.RRR.',
        '.RRRRRRRR',
        '.RrRRrRRR',
        '.RrRVrRRV',
        '.RrVVrRV.',
        '.VVRRrVV.',
        'VRrRRVRR.',
        '.RrRVVRR.',
        '.RVVRrRRV',
        '.VrRRrVV.',
        '.RrRRVRR.',
        '.RrRVrRR.',
        '.RrVRrRR.',
        '.RVRRrRV.',
        '.VrRRrVR.',
        'RRRRRRRRR',
        'RRRRRRRRR',
      ]] },
      { name: 'Vine curtain', anchor: 'ceiling', weight: 3, frames: [[
        'VVVVVVVVVVV',
        '.V.VGV.V.V.',
        '.V..V..VGV.',
        '.VG.V..V.V.',
        '.V..P..V.P.',
        '.V.....VG..',
        '.P.....V...',
        '.......P...',
      ], [
        'VVVVVVVVVVV',
        '.V.VGV.V.V.',
        'V...V..VGV.',
        'VG..V...V.V',
        'V...P...V.P',
        'V.......VG.',
        'P.......V..',
        '........P..',
      ]] },
      { name: 'Flower bush', anchor: 'floor', weight: 3, frames: [[
        '...P..G.P....',
        '..PlPGGPlP...',
        '.G.PGGGGP.G..',
        'GGGGPpGGGGPG.',
        '.GGGGPGGGPpP.',
        '..GGGGGGGGPG.',
        '...gGGGGGGg..',
        '....ggggg....',
      ]] },
      { name: 'Fallen head', anchor: 'floor', weight: 1, frames: [[
        '....RRRRR.....',
        '..RRRRRRRRR...',
        '.RRrrRRRrrRR..',
        '.RRRRRRRRRRRR.',
        'RRRRRRrRRRRRRO',
        'RRRRRRrRRRRROO',
        'RRRRrrrrRRROOO',
        '.RRRRRRRRROOO.',
        '..OOOOOOOOOO..',
      ]] },
      { name: 'Ivy', anchor: 'wall', weight: 3, frames: [[
        '.G..GG.....',
        'GGG.GGG.G..',
        '.GVGG.GVGG.',
        '..V....V.G.',
        '.GVG..GVG..',
        'GG.V...V...',
        '...VG.GVG..',
        '..GV...V.GG',
        '...V..GV...',
        '..gg...gg..',
      ]] },
      { name: 'Lilies', anchor: 'floor', weight: 2, frames: [[
        '..P.....P..',
        '.PlP...PlP.',
        '..P..P..P..',
        '..G.PlP.G..',
        '..G..P..G..',
        '..GG.G.GG..',
        '...GGGGG...',
        '...ggggg...',
      ]] },
    ],
  },
  vault: {
    looks: { snapjaw: 'Cog plate', spitter: 'Gear stack' },
    pal: climePal({
      metal: ['#1e140a', '#4a3418', '#7a5a2a', '#b88a48'], rock: ['#141210', '#2c2824', '#46403a', '#625a52'], bone: ['#2a2420', '#584b3f', '#85725e', '#b39f7f'],
      glow: ['#ffa860'], glow2: ['#ffe0b0'],
    }),
    pieces: [
      { name: 'Gear stack', anchor: 'floor', weight: 2, frames: [[
        '...M.M.M.....',
        '..MMMMMMM....',
        '.MMMmmmMMM...',
        'MMMmm.mmMMM.M',
        '.MMm.l.mMM.MM',
        'MMMmm.mmMMMMm',
        '.MMMmmmMMMMm.',
        '..MMMMMMMMMMM',
        '...M.M.MMmmMM',
        '........MMMM.',
      ]] },
      { name: 'Pipe valve', anchor: 'wall', weight: 3, frames: [[
        '.....MMM....',
        '....M.M.M...',
        '....MMlMM...',
        '....M.M.M...',
        '.....MMM....',
        '......M.....',
        'MMMMMMMMMMMM',
        'mmmmmmMmmmmm',
        '......M.....',
        '......M.....',
      ]] },
      { name: 'Pendulum clock', anchor: 'floor', weight: 1, frames: [[
        '...MMM...',
        '..MMMMM..',
        '.MMLLLMM.',
        '.MLlLlLM.',
        '.MLLlLLM.',
        '.MMLLLMM.',
        '..MMMMM..',
        '..M...M..',
        '..M.M.M..',
        '..M.M.M..',
        '..M.M.M..',
        '..M.M.M..',
        '..M.L.M..',
        '..M...M..',
        '..MMMMM..',
        '.MMMMMMM.',
      ], [
        '...MMM...',
        '..MMMMM..',
        '.MMLLLMM.',
        '.MLlLlLM.',
        '.MLLlLLM.',
        '.MMLLLMM.',
        '..MMMMM..',
        '..M...M..',
        '..MM..M..',
        '..M.M.M..',
        '..M.M.M..',
        '..M..MM..',
        '..M..LM..',
        '..M...M..',
        '..MMMMM..',
        '.MMMMMMM.',
      ]] },
      { name: 'Hanging chain', anchor: 'ceiling', weight: 2, frames: [[
        '.M.',
        'M.M',
        '.M.',
        '.M.',
        'M.M',
        '.M.',
        '.M.',
        'M.M',
        '.M.',
        'MMM',
        '.M.',
      ]] },
      { name: 'Cog plate', anchor: 'floor', weight: 3, frames: [[
        '..M.M.M..',
        '.MMMMMMM.',
        'MMmmmmmMM',
        '.Mm.l.mM.',
        'MMmmmmmMM',
        '.MMMMMMM.',
        '..M.M.M..',
      ]] },
      borrowFlora('underforge', 'Buried gear', { weight: 1 }),
    ],
  },
};
// each piece's size, from its rows
for (const set of Object.values(CLIME_FLORA)) for (const p of set.pieces) { p.h = p.frames[0].length; p.w = Math.max(...p.frames[0].map((r) => r.length)); }

const CLIME_LIFE = {
  frost: {
    mix: { lizard: [1, 2], flock: [2, 3] }, weather: 'snow', gust: '#ffffff',
    lizard: { B: '#d8e0ec', D: '#9aa6b8', H: '#f4f8ff', E: '#10141c', l: '#9aa6b8', T: '#c0cad8', t: '#9aa6b8' },
    bird: { B: '#1e1e26', D: '#0e0e14', H: '#3a3a46', k: '#c89a48', l: '#0e0e10' },
  },
  cinder: {
    mix: { lizard: [3, 5], flock: [0, 1] }, weather: 'embers', gust: '#2a2424',
    lizard: { B: '#2a1a16', D: '#140c0a', H: '#e05a24', E: '#ffd060', l: '#140c0a', T: '#3a2018', t: '#140c0a' },
    bird: { B: '#5a5450', D: '#3a3432', H: '#8a8078', k: '#c87a38', l: '#141010' },
  },
  bloomfen: {
    mix: { lizard: [3, 5], flock: [1, 2], moth: [3, 5] }, weather: 'pollen', gust: '#d8e8a0', firefly: true, moth: '#f0c8ff',
    lizard: { B: '#5a9a3a', D: '#2e5a1e', H: '#c8e060', E: '#101408', l: '#2e5a1e', T: '#4a8030', t: '#2e5a1e' },
    bird: { B: '#e8e4dc', D: '#a8a49c', H: '#ffffff', k: '#e0b040', l: '#2a2420' },
  },
  grotto: {
    mix: { moth: [4, 6], scurrier: [2, 4] }, weather: 'drips', moth: '#a8bcff',
    scurrier: { B: '#c87a5a', D: '#7a4030', H: '#e8a080', E: '#0a0808', l: '#5a2a20', T: '#c87a5a' },
  },
  magma: {
    mix: { moth: [3, 5], scurrier: [1, 2] }, weather: 'heat', moth: '#ffb070',
    scurrier: { B: '#2a2224', D: '#141012', H: '#4a3a3a', E: '#ff4a20', l: '#0a0808', T: '#3a2a2a' },
  },
  rootdeep: {
    mix: { moth: [8, 11], scurrier: [1, 2] }, weather: 'motes', moth: '#e0f070', firefly: true,
    scurrier: { B: '#7a5a3a', D: '#4a3420', H: '#a07a50', E: '#0a0806', l: '#2a1c10', T: '#b08a70' },
  },
  temple: {
    mix: { scurrier: [2, 4], moth: [2, 4] }, weather: 'motes', moth: '#f8f4e0',
    scurrier: { B: '#6a8a5a', D: '#3e5634', H: '#9ab87a', E: '#0a0c08', l: '#2a3a20', T: '#7a9a6a' },
  },
  vault: {
    mix: { scurrier: [3, 5], moth: [1, 2] }, weather: 'motes', moth: '#ffc890',
    scurrier: { B: '#9a7a40', D: '#5a4420', H: '#d0a860', E: '#ff9a40', l: '#3a2a14', T: '#7a6030' },
  },
};

// ---------------------------------------------------------------------------
// Which climes a zone has, rolling one, and naming them
// ---------------------------------------------------------------------------
// The climes a zone can have, its own look first.
function climesOf(zone) { return Object.keys(T.climes).filter((id) => T.climes[id].zones.includes(zone)); }

// The clime at the end of a way: from the expedition's seed, the site it
// leads to and which way it is, so it's the same when a site is rebuilt.
function rollClime(seed, biome, zone, depth, way) {
  const list = climesOf(zone);
  if (!list.length) return null;
  const region = T.biomes[biome].id, rng = new Rng(hashInts(seed, depth, way, 0xc11e));
  return rng.weighted(list.map((id) => { const c = T.climes[id]; return [c.weight * ((c.lean && c.lean[region]) || 1), id]; }));
}

function climeName(id) { return (id && T.climes[id] && T.climes[id].name) || ''; }

// A site's name: its clime's, or a lair's or a deep vein's own (with its
// clime's after).
function placeName(zone, clime) {
  if (zone === 'lair' || !clime) return T.zones[zone].name;
  return zone === 'deep' ? `${T.zones.deep.name} · ${climeName(clime)}` : climeName(clime);
}

// Where a way on leads, by name (on its button).
function wayPlaceName(d, i) { return placeName(d.ways[i], d.wayClimes && d.wayClimes[i]); }

// A floor's clime look, if it isn't its zone's own.
function climeArt(f) { return (!f.hub && f.clime && CLIME_ART[f.clime]) || null; }

// The light a clime sets (T.climes), if any.
function climeLight(f) { return (!f.hub && f.clime && T.climes[f.clime] && T.climes[f.clime].light) || null; }

// The flora a set id names: a region's caves, the sunlit surface, or a
// clime's. { pieces, pal, letters, glows, sky }
function floraKit(set) {
  if (set === 'surface') return { pieces: SURFACE_FLORA, pal: SURFACE_PAL, letters: SURFACE_LETTERS, glows: SURFACE_GLOWS, sky: true };
  const c = CLIME_FLORA[set];
  if (c) return { pieces: c.pieces, pal: c.pal, letters: CLIME_LETTERS, glows: CLIME_GLOWS, sky: !!c.sky, looks: c.looks };
  return { pieces: FLORA[set], pal: FLORA_PAL[set], letters: FLORA_LETTERS, glows: FLORA_GLOWS, sky: false, looks: PLANT_LOOKS[set] };
}

// Warm shafts of daylight through a fallen roof (the Overgrown Temple):
// lights in a few halls, from the floor's seed.
function climeLights(f) {
  if (f.clime !== 'temple') return [];
  const out = [], rooms = f.rooms.slice(1).filter((r) => r.cells && r.cells.length > 12);
  for (const r of rooms) {
    if ((hashInts(f.seed, r.cx, r.cy, 0x5b3a) & 3) !== 0) continue;
    out.push({ x: (r.cx + 0.5) * TILE, y: (r.cy + 0.5) * TILE, r: TILE * 2.6, i: 0.75, c: [1.0, 0.92, 0.7] });
  }
  return out;
}
