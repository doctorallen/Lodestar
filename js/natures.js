'use strict';
// ---------------------------------------------------------------------------
// Natures: what each kind of enemy shrugs off and what it fears. A hit of an
// element is multiplied by its verdict on the foe: weak (W), resistant (R)
// or very resistant (I), or neither; nothing is ever immune. The verdict
// comes from, in turn:
//   - the kind's own (T.enemies.resist; the warden's and the Keepers' by
//     region, T.enemies.regionResist);
//   - the clime it was born in, a step more resistant to one element and a
//     step weaker to another (T.climes[id].resist);
//   - an elite's affix: Insulated and Fireproof shrug off Shock and Ember,
//     a Warded one resists everything until Force cracks its shell, a
//     Shifting one is weak to an element that moves on every few seconds;
//   - the Hollow, which resists everything, loses it all in a lodeline's
//     light.
// elementMultFor(enemy, element) applies all of it, and everything calls it.
//
// Wick knows every kind's nature (the Charter's survey of the fauna), and
// it's shown everywhere it matters: on the world map, a territory's card
// lists what lives there with what each fears and shrugs off; out in the
// land, badges over every foe in sight, ▲ in the element's colour for
// weak, ▼ for resistant, a bar for very resistant; on the two spell
// buttons, which light green with ▲ when the nearest foe fears that
// spell's element and go grey with ▼ when it resists it; and on the hit
// itself, a weak hit's number big and green with WEAK and a crack of a
// sound, a resisted one small and grey with RESIST, a dull ring and a
// thud. (Wick still notes the first weak and resisted hit, for his lines.)
// ---------------------------------------------------------------------------

// The verdicts in order, from weak to very resistant (null: neither).
const NATURE_STEPS = ['W', null, 'R', 'I'];
const natureStep = (v) => Math.max(0, NATURE_STEPS.indexOf(v || null));
const CORE_ELEMENTS = Object.keys(CIRCUIT_ELEMENTS);

// A kind's own verdicts, wherever its table is: T.enemies.types[type].resist,
// T.enemies[type].resist, or T.enemies.resist[type].
function natureTable(type) {
  const E = T.enemies;
  return (E.types && E.types[type] && E.types[type].resist) || (E[type] && E[type].resist) || (E.resist && E.resist[type]) || null;
}
// The region a boss belongs to: a Keeper's own, else the dive's.
function natureRegion(e) { return e.home || (Game.dive && !Game.dive.hub ? T.biomes[Game.dive.biome].id : 'rim'); }
// What Wick files a foe's nature under: its kind, and a boss's region.
function natureKey(e) { return e.boss ? e.type + '.' + natureRegion(e) : e.type; }

// The Hollow, in a lit lodeline's light.
function hollowInLight(e) {
  const d = Game.dive, pad = d && d.floor && d.floor.pad;
  return !!(pad && !d.padDark && dist(e.x, e.y, (pad.x + 0.5) * TILE, (pad.y + 0.5) * TILE) < T.enemies.hollowLight);
}

// The verdict of a foe's kind and clime on an element (no affix): 'W', 'R',
// 'I' or null.
function natureBase(e, el) {
  if (e.type === 'dummy') return null;
  if (e.type === 'hollow' && hollowInLight(e)) return null;
  const d = Game.dive, cl = e.clime !== undefined ? e.clime : d && !d.hub ? d.clime : null;
  return kindNature(e.type, el, cl, e.boss ? natureRegion(e) : null);
}
// A kind's verdict on an element in a clime (a boss's by its region):
// what a territory's card can say before anyone sets out.
function kindNature(type, el, clime, region) {
  const E = T.enemies, own = (region && E.regionResist && E.regionResist[region]) || natureTable(type);
  let i = natureStep(own && own[el]);
  const C = clime && T.climes[clime] && T.climes[clime].resist;
  if (C) { if (C.more === el) i = Math.min(3, i + 1); if (C.less === el) i = Math.max(0, i - 1); }
  return NATURE_STEPS[i];
}
// Every verdict a kind has in a clime, weak first: [{ el, v }].
function kindNatures(type, clime, region) {
  const out = [];
  for (const el of CORE_ELEMENTS) { const v = kindNature(type, el, clime, region); if (v) out.push({ el, v }); }
  out.sort((x, y) => NATURE_ORDER[x.v] - NATURE_ORDER[y.v]);
  return out;
}
// What its affix makes of it, if anything: 'W', 'R', 'I', or undefined.
function natureAffix(e, el) {
  if (!e.elite) return undefined;
  if (hasAffix(e, 'shifting') && e.shiftEl === el) return 'W';
  if (e.ward > 0) return el === 'force' || natureStep(natureBase(e, el)) < 2 ? 'R' : natureBase(e, el);
  const ER = T.enemies.eliteResist || {};
  for (const id of e.affixes) if (ER[id] && ER[id][el]) return ER[id][el];
  return undefined;
}
function natureVerdict(e, el) {
  const a = natureAffix(e, el);
  return a !== undefined ? a : natureBase(e, el);
}

// How much a foe takes from a hit of one element: the one function
// everything calls.
function elementMultFor(e, el) {
  const v = natureVerdict(e, el);
  return v ? T.circuits.resist[v] : 1;
}
// A hit of one or two elements, its damage split between them.
function elementMult(e, els) {
  if (!els || !els.length) return 1;
  let m = 0;
  for (const el of els) m += elementMultFor(e, el);
  return m / els.length;
}

// ---------------------------------------------------------------------------
// What Wick knows: everything (the survey). What he's seen hit is still
// kept, for his first-time lines.
// ---------------------------------------------------------------------------
function natureKnown(e, el) { return e.type !== 'dummy'; }
// A spell's hit on a foe: Wick notes the elements it's been hit with, and
// says so the first time a hit is weak or resisted.
function learnNature(e, els, verdict) {
  if (e.type === 'dummy') return;
  const K = Save.data.natures || (Save.data.natures = {}), key = natureKey(e), w = K[key] || (K[key] = {});
  let fresh = false;
  for (const el of els) if (!w[el]) { w[el] = 1; fresh = true; }
  if (fresh) Save.saveField('natures');
  if (verdict === 'W') Story.say('weakHit');
  else if (verdict === 'R' || verdict === 'I') Story.say('resistHit');
}

const NATURE_ORDER = { W: 0, I: 1, R: 2 }, NATURE_MOST = 3;
// The badges over a foe: [{ el, v }], weak first, then what it resists
// most, three at most so an elite's row stays short (its affix's verdicts
// are in it: the elite's pip gives it away).
function natureMarks(e) {
  const marks = [];
  for (const el of CORE_ELEMENTS) {
    const a = natureAffix(e, el), v = a !== undefined ? a : natureBase(e, el);
    if (v) marks.push({ el, v });
  }
  marks.sort((x, y) => NATURE_ORDER[x.v] - NATURE_ORDER[y.v]);
  return { marks: marks.slice(0, NATURE_MOST), unknown: false };
}

// ---------------------------------------------------------------------------
// Elite affixes that act: the warded shell, the shifting weakness
// ---------------------------------------------------------------------------
// A new elite's affix state (makeEnemy).
function natureAffixStart(e) {
  if (hasAffix(e, 'warded')) { e.ward = T.enemies.wardHits; e.wardMax = e.ward; }
  if (hasAffix(e, 'shifting')) { e.shiftI = Math.floor(Math.abs(e.x + e.y)) % CORE_ELEMENTS.length; e.shiftEl = CORE_ELEMENTS[e.shiftI]; e.shiftT = T.enemies.shiftEvery; }
}
// Each step (world time).
function natureAffixTick(e, dt) {
  if (!hasAffix(e, 'shifting')) return;
  if ((e.shiftT -= dt) <= 0) {
    e.shiftT += T.enemies.shiftEvery;
    e.shiftI = (e.shiftI + 1) % CORE_ELEMENTS.length;
    e.shiftEl = CORE_ELEMENTS[e.shiftI];
  }
}
// A Force hit on a warded foe cracks its shell (a heavy one twice); the
// last crack breaks it.
function crackWard(e, heavy) {
  if (!(e.ward > 0)) return;
  e.ward = Math.max(0, e.ward - (heavy ? 2 : 1));
  e.wardHit = 0.2;
  const d = Game.dive;
  if (e.ward > 0) return;
  d.fx.push({ kind: 'wardBreak', x: e.x, y: e.y - 6, t: 0.4, max: 0.4 });
  reactWord(e, 'BROKEN', ELEMENT_COLS.force);
  Story.say('wardBroken');
}

// ---------------------------------------------------------------------------
// Drawing (render.js calls these on the unlit layer over the view)
// ---------------------------------------------------------------------------
// The badges: each a 5 × 5 glyph in its element's colour on a dark tile,
// at the view's grain (AF), so they read from across the room on a phone:
// ▲ weak, ▼ resistant, a bar very resistant. A row is painted once and
// kept.
const NATURE_MARK = {
  W: ['...#...', '..###..', '.#####.', '#######', '#######', '.......'],
  R: ['.......', '#######', '#######', '.#####.', '..###..', '...#...'],
  I: ['.......', '#######', '#######', '#######', '#######', '.......'],
};
// Under each glyph, the element's two letters in the same colour, since a
// colour alone doesn't say which element it is. The badges' colours are
// their own, five hues apart (the spells' colours, ELEMENT_COLS, have
// Force and Frost both pale and Shock near Ember): white, sky blue,
// yellow, red-orange, green.
const NATURE_TAG = { force: 'FO', shock: 'SH', frost: 'FR', ember: 'EM', blight: 'BL' };
const NATURE_COLS = { force: '#ffffff', shock: '#ffe040', frost: '#4fb4ff', ember: '#ff5a1e', blight: '#6ee83c' };
const _naturePips = new Map();
function naturePipsPic(marks) {
  const key = marks.map((m) => m.el + m.v).join();
  let pic = _naturePips.get(key);
  if (pic) return pic;
  const F = AF, tile = 9, step = 10, tall = 14, w = (marks.length * step - 1) * F, h = tall * F, [c, o] = makeCanvas(w, h);
  let x = 0;
  for (const m of marks) {
    const rows = NATURE_MARK[m.v], col = NATURE_COLS[m.el];
    o.fillStyle = '#0b0a12'; o.fillRect(x * F, 0, tile * F, tall * F);
    o.fillStyle = col;
    rows.forEach((r, j) => { for (let i = 0; i < 7; i++) if (r[i] === '#') o.fillRect((x + 1 + i) * F, (1 + j) * F, F, F); });
    const tag = pixelTextPic(NATURE_TAG[m.el] || '', col);
    o.drawImage(tag, Math.round((x + tile / 2) * F - tag.textW / 2), 7 * F);
    x += step;
  }
  pic = { c, w, h };
  _naturePips.set(key, pic);
  return pic;
}
function drawNaturePips(o, e, cx, y) {
  const { marks } = natureMarks(e);
  if (!marks.length) return;
  const pic = naturePipsPic(marks);
  o.drawImage(pic.c, Math.round(cx - pic.w / 2), y - pic.h);
}

// A foe's number: bigger and green with WEAK under it when weak, small and
// grey with RESIST when resisted. Returns true if it drew it.
const NATURE_WEAK = '#7ef06a', NATURE_RESIST = '#9a93ad';
// A bold 5 × 7 hand for the weak hits' numbers.
const BIG_DIGITS = [
  ['.###.', '##.##', '##.##', '##.##', '##.##', '##.##', '.###.'], ['..##.', '.###.', '..##.', '..##.', '..##.', '..##.', '.####'],
  ['.###.', '##.##', '...##', '..##.', '.##..', '##...', '#####'], ['####.', '...##', '...##', '.###.', '...##', '...##', '####.'],
  ['##.##', '##.##', '##.##', '#####', '...##', '...##', '...##'], ['#####', '##...', '####.', '...##', '...##', '##.##', '.###.'],
  ['.###.', '##...', '####.', '##.##', '##.##', '##.##', '.###.'], ['#####', '...##', '..##.', '..##.', '.##..', '.##..', '.##..'],
  ['.###.', '##.##', '##.##', '.###.', '##.##', '##.##', '.###.'], ['.###.', '##.##', '##.##', '.####', '...##', '...##', '.###.'],
];
// (each digit painted once, with its shadow, in each colour)
const _bigDigits = new Map();
function bigDigitPic(k, col) {
  const key = k + col;
  let c = _bigDigits.get(key);
  if (c) return c;
  const g = BIG_DIGITS[k], [cv, o] = makeCanvas(6, 8);
  for (const [ink, off] of [['#000000', 1], [col, 0]]) { o.fillStyle = ink; for (let j = 0; j < 7; j++) for (let i = 0; i < 5; i++) if (g[j][i] === '#') o.fillRect(i + off, j + off, 1, 1); }
  _bigDigits.set(key, cv);
  return cv;
}
function drawBigNumber(o, v, cx, cy, col, alpha) {
  const s = String(v), w = s.length * 6 - 1, x0 = cx - Math.floor(w / 2);
  o.globalAlpha = alpha;
  for (let k = 0; k < s.length; k++) { const d = s.charCodeAt(k) - 48; if (d >= 0 && d <= 9) o.drawImage(bigDigitPic(d, col), x0 + k * 6, cy); }
  o.globalAlpha = 1;
}
function drawVerdictNumber(o, n, nx, ny) {
  const a = Math.min(1, n.t * 3);
  if (n.verdict === 'W') {
    drawBigNumber(o, n.v, nx, ny - 2, n.crit ? '#ffd34d' : NATURE_WEAK, a);
    if (!n.quiet) drawPixelText(o, 'WEAK', nx, ny + 7 * AF, NATURE_WEAK, a);
    return true;
  }
  if (n.verdict === 'R' || n.verdict === 'I') {
    drawNumber(n.v, nx, ny, NATURE_RESIST, a);
    if (!n.quiet) drawPixelText(o, 'RESIST', nx, ny + 6 * AF, NATURE_RESIST, a);
    return true;
  }
  return false;
}

// Words in the stations' pixel hand (hub.js), centred on cx (kept inside
// the view), on a canvas; each word painted once in each colour, and kept.
const _pixelWords = new Map();
function pixelTextPic(text, col) {
  const key = text + col;
  let c = _pixelWords.get(key);
  if (c) return c;
  if (_pixelWords.size > 400) _pixelWords.clear();
  const glyphs = [...text].map((ch) => (LABEL_FONT[ch] || LABEL_FONT[' ']).split('/')), w = glyphs.reduce((n, g) => n + g[0].length + 1, -1);
  const [cv, o] = makeCanvas((w + 1) * AF, 6 * AF);
  for (const [ink, off] of [['#000000', 1], [col, 0]]) {
    o.fillStyle = ink;
    let x = 0;
    for (const g of glyphs) { for (let j = 0; j < 5; j++) for (let i = 0; i < g[j].length; i++) if (g[j][i] === '1') o.fillRect((x + i + off) * AF, (j + off) * AF, AF, AF); x += g[0].length + 1; }
  }
  cv.textW = w * AF;
  _pixelWords.set(key, cv);
  return cv;
}
function drawPixelText(o, text, cx, y, col, alpha) {
  const pic = pixelTextPic(text, col), w = pic.textW;
  o.globalAlpha = alpha;
  o.drawImage(pic, clamp(Math.round(cx - w / 2), 1, View.w - w - 2), y);
  o.globalAlpha = 1;
}

// The small label font (natures.js draws creatures' names and verdicts in it).
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
