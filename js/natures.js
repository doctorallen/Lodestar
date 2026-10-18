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
// Wick learns a kind's verdict on an element the first time it's hit with
// it (kept in the save), and from then on it shows as a mark over the foe:
// ▲ in the element's colour for weak, ▼ for resistant, a bar for very
// resistant; "?" while some are still unknown. A weak hit's number pops
// bigger and green with WEAK under it, a resisted one small and grey with
// RESIST.
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
  const E = T.enemies, own = (e.boss && E.regionResist && E.regionResist[natureRegion(e)]) || natureTable(e.type);
  let i = natureStep(own && own[el]);
  const d = Game.dive, cl = e.clime !== undefined ? e.clime : d && !d.hub ? d.clime : null;
  const C = cl && T.climes[cl] && T.climes[cl].resist;
  if (C) { if (C.more === el) i = Math.min(3, i + 1); if (C.less === el) i = Math.max(0, i - 1); }
  return NATURE_STEPS[i];
}
// What its affix makes of it, if anything: 'W', 'R', 'I', or undefined.
function natureAffix(e, el) {
  if (!e.elite) return undefined;
  const A = T.enemies.eliteResist && T.enemies.eliteResist[e.elite];
  if (e.elite === 'shifting' && e.shiftEl === el) return 'W';
  if (e.ward > 0) return el === 'force' || natureStep(natureBase(e, el)) < 2 ? 'R' : natureBase(e, el);
  return A && A[el] ? A[el] : undefined;
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
// What Wick has learned
// ---------------------------------------------------------------------------
function natureKnown(e, el) {
  const k = Save.data.natures, w = k && k[natureKey(e)];
  return !!(w && w[el]);
}
// A spell's hit on a foe: Wick learns its verdict on each of the hit's
// elements, says so the first time a hit is weak or resisted, and keeps it.
function learnNature(e, els, verdict) {
  if (e.type === 'dummy') return;
  const K = Save.data.natures || (Save.data.natures = {}), key = natureKey(e), w = K[key] || (K[key] = {});
  let fresh = false;
  for (const el of els) if (!w[el]) { w[el] = 1; fresh = true; }
  if (fresh) Save.saveField('natures');
  if (verdict === 'W') Story.say('weakHit');
  else if (verdict === 'R' || verdict === 'I') Story.say('resistHit');
}

// The marks over a foe: [{ el, v }], weak first, and whether any of its
// kind's are still unknown. An affix's marks always show: the elite's pip
// gives it away.
function natureMarks(e) {
  const marks = [];
  let unknown = false;
  for (const el of CORE_ELEMENTS) {
    const a = natureAffix(e, el), v = a !== undefined ? a : natureBase(e, el);
    if (!v) continue;
    if (a !== undefined || natureKnown(e, el)) marks.push({ el, v });
    else unknown = true;
  }
  marks.sort((x, y) => natureStep(x.v) - natureStep(y.v));
  return { marks, unknown };
}

// ---------------------------------------------------------------------------
// Elite affixes that act: the warded shell, the shifting weakness
// ---------------------------------------------------------------------------
// A new elite's affix state (makeEnemy).
function natureAffixStart(e) {
  if (e.elite === 'warded') { e.ward = T.enemies.wardHits; e.wardMax = e.ward; }
  if (e.elite === 'shifting') { e.shiftI = Math.floor(Math.abs(e.x + e.y)) % CORE_ELEMENTS.length; e.shiftEl = CORE_ELEMENTS[e.shiftI]; e.shiftT = T.enemies.shiftEvery; }
}
// Each step (world time).
function natureAffixTick(e, dt) {
  if (e.elite !== 'shifting') return;
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
// The marks: 3 art px wide, a dark rim round each so it reads on any ground.
// A row of marks is painted once into a small picture and kept.
const NATURE_MARK = { W: ['.#.', '###'], R: ['###', '.#.'], I: ['###', '###'] };
const _naturePips = new Map();
function naturePipsPic(marks, unknown) {
  const key = marks.map((m) => m.el + m.v).join() + (unknown ? '?' : '');
  let pic = _naturePips.get(key);
  if (pic) return pic;
  const n = marks.length + (unknown ? 1 : 0), w = n * 5 + 1, h = 7, [c, o] = makeCanvas(w, h);
  let x = 1;
  for (const m of marks) {
    const rows = NATURE_MARK[m.v];
    o.fillStyle = '#0b0a12'; o.fillRect(x - 1, 2, 5, rows.length + 2);
    o.fillStyle = ELEMENT_COLS[m.el];
    rows.forEach((r, j) => { for (let i = 0; i < 3; i++) if (r[i] === '#') o.fillRect(x + i, 3 + j, 1, 1); });
    x += 5;
  }
  if (unknown) o.drawImage(pixelTextPic('?', '#c8bca0'), x, 0);
  pic = { c, w };
  _naturePips.set(key, pic);
  return pic;
}
function drawNaturePips(o, e, cx, y) {
  const { marks, unknown } = natureMarks(e);
  if (!marks.length && !unknown) return;
  const pic = naturePipsPic(marks, unknown);
  o.drawImage(pic.c, Math.round(cx - pic.w / 2), y - 3);
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
    if (!n.quiet) drawPixelText(o, 'WEAK', nx, ny + 7, NATURE_WEAK, a);
    return true;
  }
  if (n.verdict === 'R' || n.verdict === 'I') {
    drawNumber(n.v, nx, ny, NATURE_RESIST, a);
    if (!n.quiet) drawPixelText(o, 'RESIST', nx, ny + 6, NATURE_RESIST, a);
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
  const [cv, o] = makeCanvas(w + 1, 6);
  for (const [ink, off] of [['#000000', 1], [col, 0]]) {
    o.fillStyle = ink;
    let x = 0;
    for (const g of glyphs) { for (let j = 0; j < 5; j++) for (let i = 0; i < g[j].length; i++) if (g[j][i] === '1') o.fillRect(x + i + off, j + off, 1, 1); x += g[0].length + 1; }
  }
  cv.textW = w;
  _pixelWords.set(key, cv);
  return cv;
}
function drawPixelText(o, text, cx, y, col, alpha) {
  const pic = pixelTextPic(text, col), w = pic.textW;
  o.globalAlpha = alpha;
  o.drawImage(pic, clamp(Math.round(cx - w / 2), 1, View.w - w - 2), y);
  o.globalAlpha = 1;
}
