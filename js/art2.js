'use strict';
// ---------------------------------------------------------------------------
// Lodestar: crafting and story art, in style E. Letter rows in the game's
// sprite format (js/art.js buildArtSprite). Build any of these with:
//   buildArtSprite(rows, Object.assign({}, ART2_PAL, override),
//                  Object.assign({}, SPRITE_CHARS, ART2_LETTERS),
//                  [...SPRITE_GLOWS, ...ART2_GLOWS])
// (buildArtSprite merges pal over ART.pal itself.) ART2_LETTERS adds letters
// only; it redefines none of SPRITE_CHARS'.
//   ICON_ROWS2: item icons. W/w steel, G plate and T/t tool take the ore's
//     colours the way ICON_ROWS do (itemIconUrl overrides steel, plate and
//     tool with the ore's ramp); g is the Charter's blue, a and v its amber
//     light (the rig frame's).
//   Cores (stoneIconUrl): a round lens for a Form, a sealed cell for an
//     Element, a square chip for a Mod, each its mark lit in its light.
//   PART_ROWS: creature parts; PART_PAL[part][tier - 1] recolours one for the
//     biome it came from (1 Rim, 2 Choir, 3 Underforge).
//   UPLINK_ROWS: the Meridian uplink, its light dark and lit, for the
//     outpost; TENT_ROWS: a settler's tent.
//   KEEPER_ROWS, KEEPER_PAL: the three Shard Keepers, each holding a heart-
//     shard (Z/z, glowing warm gold-white).
// Drawn for the crafting and the story; loaded by art.js (art2Sprite).
// ---------------------------------------------------------------------------

const ART2_LETTERS = {"g":["charter"],"a":["rigglow"],"v":["riglight"],"F":["fiber"],"f":["fiber",0],"N":["chitin"],"n":["chitin",0],"U":["star"],"Z":["shardglow"],"z":["shardwarm"],"I":["ether"],"J":["print"],"k":["spore"],"e":["sporeglow"],"b":["hull"],"d":["hull",0],"o":["beacon"],"q":["lens"],"m":["moss"],"u":["flesh"],"i":["fleshglow"],"r":["slag"],"y":["magma"],"p":["bone"]};
const ART2_GLOWS = ["rigglow","riglight","shardglow","shardwarm","ether","sporeglow","beacon","fleshglow","magma"];
const ART2_PAL = {"charter":["#0a0b16","#141932","#1c2f80","#2f5cd8","#86b0ff"],"rigglow":["#ffb030"],"riglight":["#ffe48a"],"fiber":["#151a10","#2e3a22","#4a5c34","#6c8048"],"chitin":["#140e14","#2c2030","#4a3850","#6e5878"],"shardglow":["#fff6dc"],"shardwarm":["#ffc860"],"ether":["#9fe8ff"],"print":["#0c1424","#18284a","#284470","#4a70a8"],"spore":["#1e1218","#492b3c","#75465b","#a46b7f"],"sporeglow":["#d8e890"],"hull":["#0e1014","#1c2028","#2e3440","#4a5262"],"beacon":["#fff0c0"],"lens":["#0a0c10","#1a1e26","#2a303c"],"moss":["#121a10","#2b3c23","#445e37","#638249"],"flesh":["#1e1218","#492b3c","#75465b","#a46b7f"],"fleshglow":["#a6c84a"],"slag":["#1a1210","#3a2823","#5b3e37","#7f584b"],"magma":["#ff7a2a"],"bone":["#2a2620","#5d5544","#8f8568","#c3b692"]};

const ICON_ROWS2 = {
  // the rig frame: a bracer of the Charter's blue seen from the side, its
  // open elbow end on the left and banded in its ore, its projector's lens
  // amber on its back, and the light leaving the wrist end
  rig: [
    "..................",
    "..................",
    "..................",
    "..WWWggggggggWW...",
    ".WdddWgggaavgWWg..",
    ".WdddWggggaggWWgg.",
    "WddddWgggggggWWggv",
    "WddddWgggggggWWgva",
    "WddddWgggggggWWggv",
    ".WdddWgggggggWWgg.",
    ".WdddWgggggggWWg..",
    "..WWWggggggggWW...",
    "..................",
    "..................",
  ],
  weave: [
    ".....FFFF.....",
    "....FffffF....",
    "...FFf..fFf...",
    "...fFf..fFF...",
    "...FFFfFFFF...",
    "..FFfFMMFfFF..",
    "..fFFFFfFFFF..",
    "..FFFfFFFFfF..",
    "..FfFFFFfFFF..",
    "..FFFFfFFFFf..",
    ".FFFfFFFFfFFF.",
    ".FfFFFFfFFFFf.",
    ".FFFFfFFFFfFF.",
    ".FFfFFFFfFFFF.",
    ".fFFFFfFFFFfF.",
    "FFFFfFFFFfFFFF",
    "FFRFRFRFRFRFRF",
  ],
  shell: [
    ".......nnnn.......",
    "...N...nnnn..N....",
    "nNNN...NNNNN.NNN.n",
    "NNNNNNNNnnNNNNNNN.",
    ".NNNNNNNnnNNNNNN..",
    "..NNnnnnnnnnnNNn..",
    "..NNNNNNnnNNNNNNN.",
    "..NNNNNNnnNNNNNNN.",
    "..nnnnnnnnnnnnnnN.",
    "..NNNNNNnnNNNNNNN.",
    "..NNNNNNnnNNNNNNN.",
    "...nnnnnnnnnnnnn..",
    "....NNNNnnNNNNN...",
    ".....NNNnnNNNN....",
    ".......NNNNN......",
  ],
  lantern: [
    "....MM....",
    "...M..M...",
    "....MM....",
    "...MMMM...",
    "..MMMMMM..",
    "..M.OO.M..",
    "..MOOOOM..",
    "..MOOOOM..",
    "..MOOOOM..",
    "..M.OO.M..",
    "..MMMMMM..",
    "...MMMM...",
    "....MM....",
  ],
  drill: [
    "...GGMGGGMG........",
    "...GGMGGGMGMMWw....",
    "BBBGGMGRGMGMMwWwW..",
    "BBBGGMGRGMGMMWwWwWw",
    "...GGMGGGMGMMwWwW..",
    "...GGMGGGMG..Ww....",
    "....BBB............",
    "....BBB............",
    "....BBB............",
  ],
  // drawn by hand at the art's size (artNative): a roller with brass caps,
  // the sheet unrolled from it, a schematic in lines of glow
  blueprint: artNative([
    "MMMMM......................",
    "JJwJJ......................",
    "JJwJJdJJJJJJJJJJJJJJJJJJJJJ",
    "JJwJJdJJJJJJJJJJJJJJJJJJJJJ",
    "JJwJJdJRRRRRRRRRRRRRRRRRRJJ",
    "JJwJJdJRJJJJJJJJJJJJJJJJRJJ",
    "JJwJJdJRJJJJJJJRJJJJJJJJRJJ",
    "JJwJJdJRJJJJJJRJRJJJJJJJRJJ",
    "JJwJJdJRJJJJRRJJJRRJJJJJRJJ",
    "JJwJJdJRJJJRJJJJJJJRJJJJRJJ",
    "JJwJJdJRJJRJRRRRRRRJRJJJRJJ",
    "JJwJJdJRJJJRJJJJJJJRJJJJRJJ",
    "JJwJJdJRJJJJRRJJJRRJJJJJRJJ",
    "JJwJJdJRJJJJJJRJRJJJJJJJRJJ",
    "JJwJJdJRJJJJJJJRJJJJRRRJRJJ",
    "JJwJJdJRJJJJJJJJJJJJJJJJRJJ",
    "JJwJJdJRRRRRRRRRRRRRRRRRRJJ",
    "JJwJJdJJJJJJJJJJJJJJJJJJJJJ",
    "JJwJJdJJJJJJJJJJJJJJJJJJJJJ",
    "JJwJJ......................",
    "MMMMM......................",
  ]),
  shard: [
    ".....UU......",
    "...UUzzU.....",
    "..UzzzzzU....",
    "..UzzzzzzU...",
    "...UUzzzzzUU.",
    "...UzUZZzzzzU",
    "..UzzUZZZzzU.",
    ".UzzzZUZZzU..",
    "UzzzZZUZZU...",
    "UzzzZZZUZU...",
    ".UzzzZZUZzU..",
    ".UzzzZZZZUU..",
    "..UzzzZZzUU..",
    "...UzzzzUzzU.",
    "....UzzzUzU..",
    ".....UzzUU...",
    "......UU.....",
  ],
};

const PART_ROWS = {
  chitin: [
    "....NNnNN....",
    "...nNNnNNn...",
    "..NnNNnNNnN..",
    ".NNnNNnNNnNN.",
    ".NNnN...NnNN.",
    "NNN.......NNN",
    "NNN.......NNN",
    "NN.........NN",
    ".N.........N.",
  ],
  ether: [
    "...DDD...",
    "...DDD...",
    "...qqq...",
    "..q...q..",
    ".q.I...q.",
    ".q..I..q.",
    ".q.II..q.",
    ".q..III.q",
    ".qI..I.q.",
    ".q.IIII.q",
    "..qIIIq..",
    "...qqq...",
  ],
  cog: [
    "......M......",
    ".M.........M.",
    "..M.MMMMM.M..",
    "...MMMMMMM...",
    "..MMMMMMM.M..",
    "..MMM...MM...",
    "M.MMM...MMM.M",
    "..MMM...MMM..",
    "..MMMMMMMMM..",
    "...MMMMMMM...",
    "..M.MMMMM.M..",
    ".M.........M.",
  ],
  fiber: [
    "....fFfFf.Ff",
    "....fFfFfFf.",
    "...fFf.FfFf.",
    "...fFfFfFf..",
    "...fFfFfFf..",
    "..BBBBBBBf..",
    "..BBBBBBB...",
    ".fF.fFfFf...",
    ".fFfFfFf....",
    ".fFfFfFf....",
    "fFfFfFf.....",
    "fFfFfFf.....",
  ],
  spore: [
    "....k...",
    "...k....",
    "..kkkk..",
    ".kkkkkk.",
    ".kkkkkk.",
    "kkekkkkk",
    "kkkkkkkk",
    "kkkkkekk",
    "kkkkkkkk",
    "kkkekkkk",
    ".kkkkkk.",
    ".kkkkkk.",
    "..kkkk..",
  ],
  heart: [
    "...GGGGGG...",
    "..GMGGGGMG..",
    ".GGGRRRRGGG.",
    "GGGRQQQQRGGG",
    "GMGRQQQQRGMG",
    "GGGRQQQQRGGG",
    "GGGRQQQQRGGG",
    ".GGGRRRRGGG.",
    "..GMGGGGMG..",
    "...GGGGGG...",
    "....M..M....",
    "....M..M....",
  ],
};
const PART_PAL = {"chitin":[{"chitin":["#0e0a10","#1c1520","#302434","#4a3a4e"]},{"chitin":["#0a0a18","#16162c","#262848","#3c4068"]},{"chitin":["#140a08","#261410","#3e2219","#5a3426"]}],"ether":[{"ether":["#5ce8c8"],"lens":["#0a0c10","#1a1e26","#2a303c"]},{"ether":["#b08cff"],"lens":["#0a0c10","#1a1e26","#2a303c"]},{"ether":["#ff7a2a"],"lens":["#0a0c10","#1a1e26","#2a303c"]}],"cog":[{"metal":["#16181c","#2a2e34","#454b54","#6c7480"]},{"metal":["#14162a","#262a48","#3e4470","#646ca0"]},{"metal":["#1c1210","#34221c","#523830","#7a5648"]}],"fiber":[{"fiber":["#151a14","#323c2d","#515e46","#788a63"]},{"fiber":["#18141e","#352b41","#534465","#75638a"]},{"fiber":["#1a1210","#3a2823","#5b3e37","#7f584b"]}],"spore":[{"spore":["#1e1218","#492b3c","#75465b","#a46b7f"],"sporeglow":["#a6c84a"]},{"spore":["#22141c","#502d49","#7d4970","#ae689f"],"sporeglow":["#d0609e"]},{"spore":["#200e0c","#4b231e","#75392f","#a15341"],"sporeglow":["#e0583a"]}],"heart":[{"plate":["#16181c","#2a2e34","#454b54","#6c7480"],"coreglow":["#d8fff4"],"rune":["#5ce8c8"]},{"plate":["#14162a","#262a48","#3e4470","#646ca0"],"coreglow":["#efe4ff"],"rune":["#b08cff"]},{"plate":["#1c1210","#34221c","#523830","#7a5648"],"coreglow":["#fff0c8"],"rune":["#ff7a2a"]}]};

// The Meridian uplink: a lattice mast on a slab, a dish turned to the sky
// with its feed glowing, a light at the tip (a dark lens until the colony's
// called, then lit) and a console at its foot. Drawn by hand at the art's
// size (artNative).
const UPLINK_ROWS = {
  dark: artNative([
    "......................T...............",
    ".....................qqq..............",
    ".....................qqq..............",
    ".....................qqq..............",
    ".....................TTT..............",
    ".....................TTT..............",
    ".....................T.T..............",
    ".....................T.T..............",
    "...RR................T.T..............",
    "...RR...............TTTTT.............",
    ".....t..............Tt.tT.............",
    ".....tt......GGGGG..Tt.tT.............",
    "......t....WWWWWGG..T.t.T.............",
    ".......t.GWWWWWWGG..T.t.T.............",
    "........tWWWWWWGGG..Tt.tT.............",
    "......GWtWWWWWWGGG..T...T.............",
    ".....GWWWWWWWWGGG.TTt...tTT...........",
    "....GWWWWWWWWGGGG.TTTTTTTTT...........",
    "....WWWWWWWGGGGG..TTt...tTT...........",
    "...GWWWWWWGGGGG...TT.t.t.TT...........",
    "...GWWWWGGGGGtttttTTt.t..TT...........",
    "...GGGGGGGGG.TTTTTTTT.t..TT...........",
    "...GGGGGGG........TT.t.t.TT...........",
    "...GGGGG.........TT.t...t.TT..........",
    ".................TTt.....tTT..........",
    ".................TTTTTTTTTTT..........",
    ".................TTt.....tTT..........",
    ".................TT.t...t.TT..........",
    ".................TT..t.t..TT..........",
    ".................TT...t...TT..........",
    "................TT..t...t..TT.........",
    "................TT.t.....t.TT.........",
    "................TTt.......tTT.........",
    "................TTTTTTTTTTTTT.........",
    "................TTt.......tTT.........",
    "................TT..t...t..TT.........",
    "................TT...t.t...TT.........",
    "...............TT.....t.....TT........",
    "...............TT...t...t...TT........",
    "...............TT..t.....t..TT........",
    "...............TTt.........tTT.TTTTTTT",
    "...............TTTTTTTTTTTTTTT.GGGGGGG",
    "...............TT...........TT.GRRRRRG",
    "...............TT...........TT.GRRRRRG",
    "..............TT.............TTGRRRRRG",
    "..............TT.............TTGGGGGGG",
    "..............TT.............TTGGGGGGG",
    "..............TT.............TTGGGGGGG",
    "...........bGGGGGGGGGGGGGGGGGGGGGGGGGG",
    "..........bbbbbbbbbbbbbbbbbbbbbGGGGGGG",
    ".........bbbbbbbbbbbbbbbbbbbbbbbbbbb..",
    "........bbbbbbbbbbbbbbbbbbbbbbbbbbbbb.",
    ".......bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  ]),
  lit: artNative([
    "......................T...............",
    ".....................ooo..............",
    ".....................ooo..............",
    ".....................ooo..............",
    ".....................TTT..............",
    ".....................TTT..............",
    ".....................T.T..............",
    ".....................T.T..............",
    "...RR................T.T..............",
    "...RR...............TTTTT.............",
    ".....t..............Tt.tT.............",
    ".....tt......GGGGG..Tt.tT.............",
    "......t....WWWWWGG..T.t.T.............",
    ".......t.GWWWWWWGG..T.t.T.............",
    "........tWWWWWWGGG..Tt.tT.............",
    "......GWtWWWWWWGGG..T...T.............",
    ".....GWWWWWWWWGGG.TTt...tTT...........",
    "....GWWWWWWWWGGGG.TTTTTTTTT...........",
    "....WWWWWWWGGGGG..TTt...tTT...........",
    "...GWWWWWWGGGGG...TT.t.t.TT...........",
    "...GWWWWGGGGGtttttTTt.t..TT...........",
    "...GGGGGGGGG.TTTTTTTT.t..TT...........",
    "...GGGGGGG........TT.t.t.TT...........",
    "...GGGGG.........TT.t...t.TT..........",
    ".................TTt.....tTT..........",
    ".................TTTTTTTTTTT..........",
    ".................TTt.....tTT..........",
    ".................TT.t...t.TT..........",
    ".................TT..t.t..TT..........",
    ".................TT...t...TT..........",
    "................TT..t...t..TT.........",
    "................TT.t.....t.TT.........",
    "................TTt.......tTT.........",
    "................TTTTTTTTTTTTT.........",
    "................TTt.......tTT.........",
    "................TT..t...t..TT.........",
    "................TT...t.t...TT.........",
    "...............TT.....t.....TT........",
    "...............TT...t...t...TT........",
    "...............TT..t.....t..TT........",
    "...............TTt.........tTT.TTTTTTT",
    "...............TTTTTTTTTTTTTTT.GGGGGGG",
    "...............TT...........TT.GRRRRRG",
    "...............TT...........TT.GRRRRRG",
    "..............TT.............TTGRRRRRG",
    "..............TT.............TTGGGGGGG",
    "..............TT.............TTGGGGGGG",
    "..............TT.............TTGGGGGGG",
    "...........bGGGGGGGGGGGGGGGGGGGGGGGGGG",
    "..........bbbbbbbbbbbbbbbbbbbbbGGGGGGG",
    ".........bbbbbbbbbbbbbbbbbbbbbbbbbbb..",
    "........bbbbbbbbbbbbbbbbbbbbbbbbbbbbb.",
    ".......bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  ]),
};

// A settler's tent, seen from the front corner: the gable (C) with its door
// flap (c), the roof's long side (B), poles and pegs (M). Drawn by hand at
// the art's size (artNative).
const TENT_ROWS = artNative([
  '........M...........M.........',
  '........CBBBBBBBBBBBB.........',
  '.......CCCBBBBBBBBBBBB........',
  '.......CCCBBBBBBBBBBBB........',
  '......CCCCCBBBBBBBBBBBB.......',
  '......CCCCCBBBBBBBBBBBB.......',
  '.....CCCCCCCBBBBBBBBBBBB......',
  '.....CCCcCCCBBBBBBBBBBBB......',
  '....CCCCcCCCCBBBBBBBBBBBB.....',
  '...CCCCcccCCCCBBBBBBBBBBBB....',
  '...CCCCcccCCCCBBBBBBBBBBBB....',
  '..CCCCcccccCCCCBBBBBBBBBBBB...',
  '..CCCCcccccCCCCBBBBBBBBBBBB...',
  '.CCCCCcccccCCCCCBBBBBBBBBBBB..',
  '.CCCCcccccccCCCCBBBBBBBBBBBB..',
  'CCCCCcccccccCCCCCBBBBBBBBBBBB.',
  'M...............M...........M.',
]);

const KEEPER_ROWS = {
  // drawn by hand at the art's size (artNative): its heart-shard a faceted
  // crystal, its legs thick and jointed, its shell in plates
  rim: artNative([
    "...............................................................",
    "...............................................................",
    "...............................................................",
    "...............................................................",
    ".................................z.............................",
    "................................Zz.............................",
    "................................Zzz............................",
    "...............................ZZzz............................",
    "...............................ZZzzz...........................",
    "..............................ZZZzzz.........................uu",
    "..............................ZZZzzzz.......................uuu",
    ".............................ZZZZzzzz......................uuuu",
    "............................uZZZZzzzzz...................uuuuui",
    "...........................uuZZZZzzzzzuu.................uuuuui",
    "..........................uuuZZZZzzzzuuu...................uuuu",
    "..........................uuuuZZZzzzzuuuu...................uuu",
    "..........................uuuuZZZzzzuuuu.....................uu",
    "...........................uuuuZZzzzuuu........................",
    "...............................ZZzz............................",
    "...........................XXXXXZzzX...........................",
    "..........................XXXUUUZzUUU..........................",
    "..................uuuuuuuu....UUUUUU...........................",
    "................uuuuuuuuuuuu....mmm............................",
    "...............uuuuuuuuuuuuuu...mmm............................",
    "..............uuuuuuuuuuuuuuuxxxxxxxx..........................",
    ".............uuuuuuuuuuxxxxxxuuummm..xxxxxx....................",
    "............uuuuuuixxxxuuuuuuuuummmXXXXXXXXxxxx.......XXXXXXXXX",
    ".............uuxxxxuuuuiiiuuuuuummmXXXXXXXXXXXXxxx...XXXXXXXXXX",
    ".............xxuuuuuuuuiiiuuuuuummmXXXXXXXXXXXX...xx.XXXXXXXXXX",
    "...........xx..uuuuuuuuiiiuxxXXXmmmXXxxXXXXXXXXX....xxXXXXXXXXX",
    ".........xx....uuuuuuuuuuuuuXXXXmmmXXXXXXXXX..........xxXXXXXXX",
    "....jj..........uuxxuuuuuuXXXXXXXmXXXXXXXXXX..xx........XXXXXXX",
    "....jjjj........XXXXXXXXXXXXXXXXXXXXXXXXXXXXX.........XXXXXXXXX",
    "....jj.jj.......XXXXXXXXxxxxxxxxxxxxxxxxxXXXXXXXXXXXXXXXXXXXXXX",
    "...jj.........XXXXXxxxxxXXXXXXXXXXXXXXXXXxxxxxXXXXXXXXXXXXXXXXX",
    "...jj........XXXXxxXXmmXXXXXXXXXXXXXXXXXXXXXXXxxXXXXXXXXXXXXXXX",
    "...jj.......XXxxxXXXXmmXXXXXXXXXXXXXXXXXXXXXXXXXxxXXXXXXXXXXXXX",
    "...jj.......xxXXXXXXXmmXXXXXXXXXXXXXXXXXXXXXXXXXXXxxXXXXXXXXXXX",
    "...jj....jjjXXXXXXXXXmmxxXXXXXXXXXXXXXXXXxxXXXXXXXXXXXXXXXXXXXX",
    "...jj....jjXXXXXXXXXXmmXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    "...jj....jXXXXXXXXXXXmmXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    "...jj...jjXXXXXXXXXXXmXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    "..jj....jXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    "..jj....jXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    "..jj....XXXXXXXXXXXXXmmXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    "..jj....jXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    "..jj....jXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    "..jj...jjjXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  ]),
  choir: [
    "...................zz...............",
    ".................Uzzzz..............",
    ".................zzzzz..............",
    "...............izzzZZz.i............",
    "...............uzzZZZZzu............",
    "................zzzZZzuU............",
    "................uzzzz.u.............",
    ".................uzz.u..............",
    "................xxxxxxx.............",
    "................ppppppp.............",
    "........i...i...ppppppp.............",
    ".........u..u..uxxxxxxx.............",
    ".........u..u..upppppppi..i..i......",
    "..........u.u.u.pppppppu..u..u......",
    "..........u.u.u.pppppppu..u..u......",
    ".........xxxxxxxppppppp.u.u.u.......",
    ".........pppppppxxxxxxx.u.u.u.......",
    ".........pppppppppppppp.xxxxx.......",
    ".........xxxxxxxppppppp.ppppp.......",
    "...i..i..pppppppppppppp.ppppp.......",
    "...u..u..pppppppppppppp.xxxxx.......",
    "....u.u.upppppppxxxxxxx.ppppi..i..i.",
    "....u.u.upppppppppppppp.pppppu.u.u..",
    "....u.u.uxxxxxxxppppppp.pppppu.u.u..",
    "....xxxxxpppppppppppppp.pppppu.u.u..",
    "....ppppppppppppppppppp.xxxxx.uuu...",
    "....ppppppppppppxxxxxxx.pppppxxxxx..",
    "....xxxxxpppppppppppppp.pppppppppp..",
    "....pppppxxxxxxxppppppp.pppppppppp..",
    "....ppppppppppppppppppp.pppppxxxxx..",
    "....ppppppppppppppppppp.xxxxxppppp..",
    "....ppppppppppppxxxxxxx.pppppppppp..",
    "....xxxxxpppppppppppppp.pppppppppp..",
    "....pppppxxxxxxxppppppp.pppppppppp..",
    "....ppppppppppppppppppp.pppppxxxxx..",
    "....ppppppppppppppppppp.xxxxxppppp..",
    "....ppppppppppppxxxxxxx.pppppppppp..",
    "....xxxxxppppppppppppppXpppppppppp..",
    "....pppppxxxxxxxpppppppXpppppppppp..",
    "....pppppppppppppppppppXpppppxxxxx..",
    "...XpppppppppppppppppppXxxxxxppppp..",
    "..XXpppppppppppppppppppXppppppppppX.",
    "...XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX..",
    "....XXXXXXXXXXXXXXXXXXXXXXXXXXXXX...",
    "......XXXXXXXXXXXXXXXXXXXXXXXXX.....",
    ".........XXXXXXXXXXXXXXXXXXX........",
  ],
  underforge: [
    "......................................",
    "......................................",
    "...................G..................",
    ".................GGGGG................",
    "................GGGGGGG...............",
    "...............GGGGGGGGG..............",
    "...............GGGYYGGGG..............",
    "...............GGGGGGGGG..............",
    "................GGGGGGG...............",
    "......G..........GGGGG..........G.....",
    "...GGGGGGG....rrrrrGrrrrr....GGGGGGG..",
    "..GGGGGGGGG.rrrrrrrrrrrrrrr.GGGGGGGGG.",
    "..GGGGGGGGGrrrrrrrrrrrrrrrrrGGGGGGGGG.",
    ".GGGGGGGGGGGrrrrrrrrrrrrrrrGGGGGGGGGGG",
    "..GGGGGGGGGrrrMMMMMMMMMMMryrGGGGGGGGG.",
    "..rrrrrrGGGrrrM.MzzMz.M.MrryGGGrrrrrr.",
    "..rrrrrrGGrrrrM.MzzMzzM.MrryrGGrrrrrr.",
    "..rrrrrrrrrrrrM.MzzMzzM.Mrrryrrrrrrrr.",
    "..rrrrrryrrrrrM.MzzMZzM.Mrrryrrrrrrrr.",
    "..rrrrrrryrrrrM.MzZMZZM.Mrrrryrrrrrrr.",
    "..ryrrrrryrrrrM.MzzMZzM.Mrrrryrrrrrrr.",
    "..ryrrrrrryrrrM.MzzMz.M.Mrrrrryrrrrrr.",
    "..rryrrrrryrrrM.M..M..M.Mrrrrryrryrrr.",
    "..rryrrrrrryrrM.M..M..M.Mrrrrrrrryrrr.",
    "..rryrrrrrryrrMMMMMMMMMMMrrrrrrrrryrr.",
    "..rrryrrrrrryrrrrrrrrrrrrrrrrrrrrryrr.",
    "..rrryrr.rrryrrrrrrrrrrrrrrrrr.rrrryr.",
    "..rrrrrr.rrrrrrryrrrrrrrrrrrrr.rrrryr.",
    "..rrrrrr..rrrrrrryrrrrrrrrrr...rrrrrr.",
    ".GGGGGGGG.rrrrrrrryyrrrrrrrr..GGGGGGGG",
    ".GGGGGGGG.rrrrrrrrrryrrrrrrr..GGGGGGGG",
    ".GGGGGGGG.rrrrrr...r..rrrrrr..GGGGGGGG",
    ".GGGGGGGG.rrrrrr......rrrrrr..GGGGGGGG",
    ".GGGGGGGG.rrrrrr......rrrrrr..GGGGGGGG",
    "..........rrrrrr......rrrrrr..........",
    "..........rrrrrr......rrrrrr..........",
    "..........rrrrrr......rrrrrr..........",
    ".........GGGGGGGG....GGGGGGGG.........",
    ".........GGGGGGGG....GGGGGGGG.........",
    ".........GGGGGGGG....GGGGGGGG.........",
  ],
};
const KEEPER_PAL = {"rim":{"shell":["#0c0a0c","#1a161a","#2c242c","#443844"],"legs":["#060407"],"flesh":["#1e1218","#492b3c","#75465b","#a46b7f"],"fleshglow":["#a6c84a"],"moss":["#121a10","#2b3c23","#445e37","#638249"]},"choir":{"shell":["#0a0a18","#16162c","#262848","#3c4068"],"bone":["#2a2420","#5f5346","#94826b","#d0b997"],"flesh":["#22141c","#502d49","#7d4970","#ae689f"],"fleshglow":["#d0609e"]},"underforge":{"slag":["#140c0a","#2e1c18","#4a2e28","#6a443a"],"plate":["#1c1210","#34221c","#523830","#7a5648"],"metal":["#1a1210","#402b21","#65442f","#8f603e"],"magma":["#ff7a2a"]}};

// ---------------------------------------------------------------------------
// The cores a spell is built from: Charter hardware, each drawn at the art's
// size, 18 px square (20 with its sel-out, shown at 2× on the screens). Its
// shape says its kind: a Form's is a round lens in a blue housing, an
// Element's a sealed cell of its element with metal caps, a Mod's a square
// chip with pins. Its mark (7 px square) says which it is, lit in its light
// (ART.stones: amber for a Form, teal for a Mod, an Element's own), never
// its ore's, so none looks like ore or loot. The tier is said beside it,
// not in its colour. (Kept under their old name, stones.)
// ---------------------------------------------------------------------------
const STONE_MARKS = {
  arc: ['.......', '..###..', '.#...#.', '#.....#', '#.....#', '.......', '.......'],
  glaive: ['#.....#', '.#...#.', '..#.#..', '...#...', '..#.#..', '.#...#.', '#.....#'],
  bolt: ['.......', '....#..', '.....#.', '#######', '.....#.', '....#..', '.......'],
  lance: ['....###', '.....##', '....#.#', '...#...', '..#....', '.#.....', '#......'],
  orb: ['..###..', '.#...#.', '#.....#', '#..#..#', '#.....#', '.#...#.', '..###..'],
  nova: ['#..#..#', '.......', '...#...', '#.###.#', '...#...', '.......', '#..#..#'],
  well: ['.#####.', '#.....#', '#.###.#', '#.#.#.#', '#.#...#', '#.####.', '#......'],
  ward: ['#######', '#.....#', '#.....#', '#.....#', '.#...#.', '..#.#..', '...#...'],
  force: ['.......', '.#####.', '.#...#.', '.#.#.#.', '.#...#.', '.#####.', '.......'],
  shock: ['....##.', '...##..', '..##...', '.#####.', '...##..', '..##...', '.##....'],
  frost: ['...#...', '.#.#.#.', '..###..', '###.###', '..###..', '.#.#.#.', '...#...'],
  ember: ['...#...', '..##...', '..###..', '.####..', '.#####.', '.##.##.', '..###..'],
  blight: ['...#...', '..###..', '.#####.', '.##.##.', '.#####.', '..###..', '.......'],
  split: ['#..#..#', '#..#..#', '.#.#.#.', '..###..', '...#...', '...#...', '...#...'],
  amplify: ['...#...', '..#.#..', '.#...#.', '...#...', '..#.#..', '.#...#.', '.......'],
  quicken: ['.......', '#..#...', '.#..#..', '..#..#.', '.#..#..', '#..#...', '.......'],
  chain: ['.##....', '#..#...', '#..#...', '.####..', '...#..#', '...#..#', '....##.'],
  echo: ['.#..#..', '..#..#.', '..#..#.', '..#..#.', '..#..#.', '.#..#..', '.......'],
  pierce: ['...#...', '...#...', '#.###.#', '...#...', '...#...', '..###..', '...#...'],
  linger: ['.......', '.#...#.', '#.#.#.#', '...#...', '.#...#.', '#.#.#.#', '...#...'],
};
// The rows of a core: its body by its kind's shape (W), its housing, caps or
// pins (M), its mark lit in it (R), a dark ring round the mark (w) so it
// reads.
const _stoneRows = new Map();
function stoneRows(stone) {
  let rows = _stoneRows.get(stone);
  if (rows) return rows;
  const N = 18, c = (N - 1) / 2, kind = stoneKind(stone), g = [];
  for (let y = 0; y < N; y++) {
    g.push([]);
    for (let x = 0; x < N; x++) {
      const dx = Math.abs(x - c), dy = Math.abs(y - c), r = Math.hypot(dx, dy);
      let ch = '.';
      if (kind === 'form') ch = r <= 8.6 ? (r > 6.6 ? 'M' : 'W') : '.';
      else if (kind === 'element') ch = dx <= 6 && dy <= 8.5 && !(dx > 4.5 && dy > 7) ? (dy > 6.5 ? 'M' : 'W') : '.';
      else ch = dx <= 6.5 && dy <= 6.5 ? 'W' : (dx <= 8.5 && dy <= 5.5 && Math.round(y) % 2 === 0 && dx > 6.5) || (dy <= 8.5 && dx <= 5.5 && Math.round(x) % 2 === 0 && dy > 6.5) ? 'M' : '.';
      g[y].push(ch);
    }
  }
  const R = STONE_MARKS[stone] || STONE_MARKS.force, o = Math.round(c - 3);
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) if (R[y][x] === '#') g[o + y][o + x] = 'R';
  // a dark ring round the mark's strokes, so the light reads on the body
  for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) if (g[y][x] === 'W' && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([i, j]) => g[y + j][x + i] === 'R')) g[y][x] = 'w';
  rows = artNative(g.map((r) => r.join('')), 1);
  _stoneRows.set(stone, rows);
  return rows;
}
function stoneIconUrl(stone) {
  const key = 'stone/' + stone;
  let url = _iconCache.get(key);
  if (!url) {
    const k = stoneKind(stone), S = ART.stones[k === 'element' ? stone : k] || ART.stones.form;
    url = buildArtSprite(stoneRows(stone), { steel: S.body, rune: [S.rune], metal: ART.stones.housing }, undefined, undefined, { scale: 1 }).c.toDataURL();
    _iconCache.set(key, url);
  }
  return url;
}
