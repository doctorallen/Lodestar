'use strict';
// ---------------------------------------------------------------------------
// Shapes (DESIGN.md, Spells: shaped at the star). A spell is a shape the
// star has read into a cast. Shapes are raw, and come from the creatures
// (kill T.shapes.kills of a kind, an elite counting two, and its shape is
// in you, once a kind: the suit has read how it moves) and from the star
// itself (at the magnitudes in T.shapes.starAt). A raw shape waits at the
// star's screen, where it's read two ways; you pick one, and the other
// is gone. Two spells are carried out (A and B), swapped there from
// everything shaped; none is ever lost.
//
// Under the hood a reading is a Form with an Element and a Mod of the old
// cast code (circuits.js), so the fight runs as it did until it's
// rethought (DESIGN.md, Build order, step four).
//
// The save: Save.data.spells (the spells shaped, { id, name, line, form,
// el, mod, from }), Save.data.carry (the ids carried, A then B), and
// Save.data.shapes = { pending: [kinds waiting], read: { kind: 'a' | 'b' } }.
// ---------------------------------------------------------------------------

// Each kind's two readings. (names of the creature's movement turned to light)
const SHAPES = {
  crawler: { name: 'the crawler', a: { id: 'lunge', name: 'Lunge', line: 'close the gap and bite: a quick sweep', form: 'arc', mod: 'quicken' }, b: { id: 'circle', name: 'Circle', line: 'two lights orbit you, biting what comes close', form: 'glaive' } },
  wisp: { name: 'the wisp', a: { id: 'orbs', name: 'Orbs', line: 'three slow orbs drift at the nearest', form: 'orb', mod: 'split' }, b: { id: 'glare', name: 'Glare', line: 'a burst of light all round you', form: 'nova' } },
  construct: { name: 'the stalker', a: { id: 'reach', name: 'Reach', line: 'a long thrust through a line of them', form: 'lance' }, b: { id: 'stalk', name: 'Stalk', line: 'one hard bolt, wide and heavy', form: 'bolt', mod: 'amplify' } },
  snapjaw: { name: 'the snapjaw', a: { id: 'snap', name: 'Snap', line: 'a ring round you that throws everything back', form: 'nova', mod: 'amplify' }, b: { id: 'wait', name: 'Wait', line: 'a shell of light that bites what strikes it', form: 'ward' } },
  spitter: { name: 'the spitter', a: { id: 'glob', name: 'Glob', line: 'a lobbed burst of blight', form: 'orb', el: 'blight' }, b: { id: 'mark', name: 'Mark', line: 'a slow orb that leaves a field where it bursts', form: 'orb', mod: 'linger' } },
  tusker: { name: 'the tusker', a: { id: 'charge', name: 'Charge', line: 'a straight run through everything in the way', form: 'lance', mod: 'pierce' }, b: { id: 'brace', name: 'Brace', line: 'a wide shell that throws back what hits it', form: 'ward', mod: 'amplify' } },
  skink: { name: 'the skink', a: { id: 'burst', name: 'Burst', line: 'up from under: a burst all round', form: 'nova', mod: 'quicken' }, b: { id: 'sink', name: 'Sink', line: 'a well that drags them down to you', form: 'well' } },
  wraith: { name: 'the wraith', a: { id: 'ember', name: 'Ember', line: 'a bolt that burns, and the burn spreads', form: 'bolt', el: 'ember' }, b: { id: 'smoulder', name: 'Smoulder', line: 'a sweep of fire that lingers on the ground', form: 'arc', el: 'ember', mod: 'linger' } },
  lurker: { name: 'the lurker', a: { id: 'tongue', name: 'Tongue', line: 'a lance that drags the first one in', form: 'lance', mod: 'chain' }, b: { id: 'mire', name: 'Mire', line: 'a well of blight that holds them', form: 'well', el: 'blight' } },
  // the star's own, at each magnitude in T.shapes.starAt
  star2: { name: 'the star', a: { id: 'shell', name: 'Shell', line: "a shield of the star's light", form: 'ward' }, b: { id: 'draw', name: 'Draw', line: 'a well that pulls them in and holds them', form: 'well' } },
  star4: { name: 'the star', a: { id: 'twice', name: 'Twice', line: 'a bolt cast again as it lands', form: 'bolt', mod: 'echo' }, b: { id: 'leap', name: 'Leap', line: 'a bolt whose hit leaps to the next', form: 'bolt', mod: 'chain' } },
  star6: { name: 'the star', a: { id: 'flare', name: 'Flare', line: 'a wide burst that burns', form: 'nova', el: 'ember', mod: 'amplify' }, b: { id: 'needle', name: 'Needle', line: 'a frost lance through all of them', form: 'lance', el: 'frost', mod: 'pierce' } },
};
// The two the Kindler lands with.
const SHAPES_START = [
  { id: 'arc', name: 'Arc', line: 'a sweep in front; the third hit staggers', form: 'arc', from: 'the first day' },
  { id: 'bolt', name: 'Bolt', line: 'a fast bolt at the nearest', form: 'bolt', from: 'the first day' },
];

function shapesState() {
  const s = Save.data;
  if (!Array.isArray(s.spells) || !s.spells.length) s.spells = SHAPES_START.map((x) => Object.assign({}, x));
  if (!Array.isArray(s.carry) || s.carry.length < 2) s.carry = ['arc', 'bolt'];
  if (!s.shapes || typeof s.shapes !== 'object') s.shapes = { pending: [], read: {} };
  if (!Array.isArray(s.shapes.pending)) s.shapes.pending = [];
  if (!s.shapes.read || typeof s.shapes.read !== 'object') s.shapes.read = {};
  return s;
}
const spellOf = (id) => shapesState().spells.find((x) => x.id === id) || null;
// How many are carried out: two, a third from magnitude 3 (DESIGN.md;
// the deck has two buttons yet, so two for now).
function carrySlots() { return 2; }

// A kill: the suit reads the kind, and at enough of them the star has a
// shape to read (combat.js killEnemy).
function shapesKill(d, e) {
  const s = shapesState(), kind = e.type;
  if (!SHAPES[kind] || s.shapes.read[kind] || s.shapes.pending.includes(kind)) return;
  if ((s.killsOf[kind] || 0) < T.shapes.kills) return;
  s.shapes.pending.push(kind);
  Save.saveField('shapes');
  UI.toast(`The star has read ${SHAPES[kind].name}: a shape to shape`, 'legendary');
  Story.say('firstShape');
}
// The star grew (veins.js): at some magnitudes it offers a shape of its own.
function shapesStarOffer(mag) {
  const s = shapesState(), A = T.shapes.starAt;
  for (let k = 0; k < A.length; k++) {
    const key = 'star' + A[k];
    if (mag >= A[k] && SHAPES[key] && !s.shapes.read[key] && !s.shapes.pending.includes(key)) { s.shapes.pending.push(key); UI.toast('The star offers a shape of its own', 'legendary'); }
  }
}
// The pick, at the star's screen: one reading kept, the other gone.
function shapePick(kind, which) {
  const s = shapesState(), S = SHAPES[kind], r = S && S[which];
  if (!r || s.shapes.read[kind]) return false;
  s.shapes.read[kind] = which;
  s.shapes.pending = s.shapes.pending.filter((k) => k !== kind);
  s.spells.push({ id: r.id, name: r.name, line: r.line, form: r.form, el: r.el || null, mod: r.mod || null, from: S.name });
  Save.save();
  UI.toast(`${r.name}: read from ${S.name}`, 'legendary');
  Story.say('firstRead');
  return true;
}
// A spell into a slot (A or B); the one there goes where it came from.
function carrySet(slot, id) {
  const s = shapesState(), i = slot === 'b' ? 1 : 0;
  if (!spellOf(id)) return;
  const j = s.carry.indexOf(id);
  if (j >= 0) s.carry[j] = s.carry[i];
  s.carry[i] = id;
  Save.saveField('carry');
  spellsApply();
}
// What's carried, as the cast code reads a rig's spells (game.js
// KINDLER_RIG, circuits.js).
function spellsApply() {
  const s = shapesState(), rig = KINDLER_RIG, st = (stone) => ({ kind: 'stone', stone, tier: 1 });
  rig.spells = s.carry.slice(0, carrySlots()).map((id) => { const sp = spellOf(id) || SHAPES_START[0]; return { form: st(sp.form), el: sp.el ? st(sp.el) : null, mods: sp.mod ? [st(sp.mod)] : [] }; });
  rig.uid = (rig.uid || 1) + 1;
}

// The SHAPES part of the star's screen (map.js drawStar).
function shapesHtml() {
  const s = shapesState(), rows = [];
  for (const kind of s.shapes.pending) {
    const S = SHAPES[kind];
    if (!S) continue;
    rows.push(`<h3>A SHAPE FROM ${esc(S.name.toUpperCase())}</h3><p class="note">Read two ways. The one you don't take is gone.</p>`);
    for (const w of ['a', 'b']) { const r = S[w]; rows.push(`<div class="row static"><img class="icon" src="${stoneIconUrl(r.form)}" alt=""><span class="row-text"><span class="row-name">${esc(r.name)}</span><span class="row-sub">${esc(r.line)}</span></span><button class="mini" data-act="shapePick" data-arg="${kind}:${w}">PICK</button></div>`); }
  }
  rows.push('<h3>CARRIED</h3>');
  for (const sp of s.spells) {
    const i = s.carry.indexOf(sp.id), tag = i === 0 ? 'A' : i === 1 ? 'B' : '';
    rows.push(`<div class="row static${tag ? ' on' : ''}"><img class="icon" src="${stoneIconUrl(sp.form)}" alt=""><span class="row-text"><span class="row-name">${esc(sp.name)}${tag ? ` <span class="r-legendary">· ${tag}</span>` : ''}</span><span class="row-sub">${esc(sp.line)} · ${esc(sp.from)}</span></span>${i === 0 ? '' : `<button class="mini" data-act="carrySet" data-arg="a:${sp.id}">A</button>`}${i === 1 ? '' : `<button class="mini" data-act="carrySet" data-arg="b:${sp.id}">B</button>`}</div>`);
  }
  const need = Object.keys(SHAPES).filter((k) => !k.startsWith('star') && !s.shapes.read[k] && !s.shapes.pending.includes(k)).map((k) => `${SHAPES[k].name} ${s.killsOf[k] || 0}/${T.shapes.kills}`);
  if (need.length) rows.push(`<p class="note">Being read: ${esc(need.join(', '))}.</p>`);
  return rows.join('');
}
