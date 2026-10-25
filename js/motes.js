'use strict';
// ---------------------------------------------------------------------------
// Motes (DESIGN.md, Spells: learned from the dark). When a creature dies
// in the Kindler's light it leaves a few motes of its nature, one of five,
// one for each element: rime (frost), cinder (ember), spore (blight), spark
// (shock) and grit (force). He carries them (d.motes: the HUD counts them;
// a fall loses them), and they're banked at the star when a node sets
// (veins.js holdSet: motesBank). At the star's screen, five trees, one a
// nature, each bought with its own motes: an element (the band a cast can
// be in), its mods, a form or two (opened by the star's magnitude), and a
// passive at the end. Nothing is ever lost or used up, so there's no
// inventory: a cast is a form, an element and the mods it has slots for,
// set from everything learned (castCycle), and the wrist casts it as the
// old cast code reads a rig's spells (circuits.js; game.js KINDLER_RIG).
//
// The save: Save.data.motes { nature: banked }, Save.data.learned [node
// ids], Save.data.casts [{ form, el, mods: [] }, …] (A then B). Every
// number is in T.motes.
// ---------------------------------------------------------------------------

// The five natures, their element and colour, and the creatures of each
// (a boss's and the Hollow's is its region's; else grit).
const NATURES = {
  rime: { name: 'Rime', el: 'frost', col: '#9fd8ff', line: 'what the cold things leave' },
  cinder: { name: 'Cinder', el: 'ember', col: '#ff8a4a', line: 'what the burning things leave' },
  spore: { name: 'Spore', el: 'blight', col: '#a8e06a', line: 'what the growing things leave' },
  spark: { name: 'Spark', el: 'shock', col: '#d8c8ff', line: 'what the bodiless things leave' },
  grit: { name: 'Grit', el: 'force', col: '#e8b44a', line: 'what the shelled things leave' },
};
const NATURE_OF = { tusker: 'rime', eel: 'rime', idol: 'rime', wraith: 'cinder', crab: 'cinder', skink: 'cinder', spitter: 'spore', snapjaw: 'spore', lurker: 'spore', weaver: 'spore', wisp: 'spark', sentinel: 'spark', dropper: 'spark', hound: 'spark', crawler: 'grit', construct: 'grit' };
const NATURE_OF_EL = { frost: 'rime', ember: 'cinder', blight: 'spore', shock: 'spark', force: 'grit' };

// The trees: each node in order (the one before it first), a thing for a
// cast: kind el (the element), form or mod (circuits.js), or passive
// (motesPassive). mag: the magnitude a form needs (T.magnitude). cost is
// by its place in the tree (T.motes.cost).
const MOTE_TREES = {
  grit: [
    { id: 'amplify', kind: 'mod', name: 'Amplify', line: 'a cast wider and harder' },
    { id: 'glaive', kind: 'form', name: 'Glaive', line: 'two blades circle you, biting what comes close', mag: 1 },
    { id: 'quicken', kind: 'mod', name: 'Quicken', line: 'a cast a third quicker' },
    { id: 'nova', kind: 'form', name: 'Nova', line: 'a burst all round you', mag: 3 },
    { id: 'heavy', kind: 'passive', name: 'Heavy hand', line: 'every cast hits harder' },
  ],
  spark: [
    { id: 'shock', kind: 'el', name: 'Shock', line: 'a cast that arcs to the next foe; five overload' },
    { id: 'split', kind: 'mod', name: 'Split', line: 'three casts at once, each lighter' },
    { id: 'orb', kind: 'form', name: 'Orb', line: 'a slow orb that pulses as it drifts', mag: 1 },
    { id: 'chain', kind: 'mod', name: 'Chain', line: 'hits leap to more' },
    { id: 'wrist', kind: 'passive', name: 'Quick wrist', line: 'every cast comes back sooner' },
  ],
  rime: [
    { id: 'frost', kind: 'el', name: 'Frost', line: 'a cast that chills; three freeze solid' },
    { id: 'pierce', kind: 'mod', name: 'Pierce', line: 'a bolt or lance passes through more' },
    { id: 'ward', kind: 'form', name: 'Ward', line: 'a shell of light that hurts what hits it', mag: 2 },
    { id: 'coldblood', kind: 'passive', name: 'Cold blood', line: 'your light drains slower in the dark' },
  ],
  cinder: [
    { id: 'ember', kind: 'el', name: 'Ember', line: 'a cast that burns, and burns spread' },
    { id: 'lance', kind: 'form', name: 'Lance', line: 'a spear through a line of them', mag: 1 },
    { id: 'echo', kind: 'mod', name: 'Echo', line: 'a cast cast again as it lands' },
    { id: 'kindled', kind: 'passive', name: 'Kindled', line: 'your light fills faster in the light' },
  ],
  spore: [
    { id: 'blight', kind: 'el', name: 'Blight', line: 'a cast that poisons, and poison spreads' },
    { id: 'linger', kind: 'mod', name: 'Linger', line: 'a cast leaves a field behind' },
    { id: 'well', kind: 'form', name: 'Well', line: 'drags them in and holds them', mag: 2 },
    { id: 'thickskin', kind: 'passive', name: 'Thick skin', line: 'what hits you hurts less' },
  ],
};
// What the Kindler lands with: two forms, and the casts that use them.
const MOTES_START_FORMS = ['arc', 'bolt'];
const MOTES_START_CASTS = () => [{ form: 'arc', el: null, mods: [] }, { form: 'bolt', el: null, mods: [] }];

function motesState() {
  const s = Save.data;
  if (!s.motes || typeof s.motes !== 'object') s.motes = {};
  for (const n in NATURES) if (!Number.isFinite(s.motes[n])) s.motes[n] = 0;
  if (!Array.isArray(s.learned)) s.learned = [];
  if (!Array.isArray(s.casts) || s.casts.length < 2) s.casts = MOTES_START_CASTS();
  for (const c of s.casts) { if (!c.form) c.form = 'arc'; if (!Array.isArray(c.mods)) c.mods = []; }
  return s;
}
// A save from the shapes (the spells read, carried): what they were made
// of is learned, and the casts are those carried.
function motesMigrate(s) {
  if (!Array.isArray(s.spells)) return;
  motesState();
  const nodes = {};
  for (const t in MOTE_TREES) for (const n of MOTE_TREES[t]) nodes[n.id] = 1;
  for (const sp of s.spells) for (const id of [sp.form, sp.el, sp.mod]) if (id && nodes[id] && !s.learned.includes(id)) s.learned.push(id);
  if (Array.isArray(s.carry)) s.casts = s.carry.slice(0, 2).map((id) => { const sp = s.spells.find((x) => x.id === id) || { form: 'arc' }; return { form: sp.form || 'arc', el: sp.el || null, mods: sp.mod ? [sp.mod] : [] }; });
  while (s.casts.length < 2) s.casts.push(MOTES_START_CASTS()[s.casts.length]);
  delete s.spells; delete s.carry; delete s.shapes;
}
const moteLearned = (id) => MOTES_START_FORMS.includes(id) || motesState().learned.includes(id);
const moteNode = (id) => { for (const t in MOTE_TREES) for (const n of MOTE_TREES[t]) if (n.id === id) return n; return null; };
const moteCost = (k) => { const C = T.motes.cost; return C[Math.min(C.length - 1, k)]; };
// The forms, elements and mods learned, in the trees' order.
function motesLearned(kind) {
  const out = kind === 'form' ? MOTES_START_FORMS.slice() : [];
  for (const t in MOTE_TREES) for (const n of MOTE_TREES[t]) if (n.kind === kind && moteLearned(n.id)) out.push(n.id);
  return out;
}
// A passive's share: 1 where it isn't learned (circuits.js, combat.js,
// game.js read these).
function motesPassive(id) { return moteLearned(id) ? T.motes.passive[id] : 1; }
// The mod slots a cast has, by the star's magnitude (T.motes.modSlotsAt).
function castModSlots() { const A = T.motes.modSlotsAt, mag = magnitudeOf(); let n = 0; for (const m of A) if (mag >= m) n++; return n; }
// How many casts are carried: two (the deck has two buttons).
function carrySlots() { return 2; }

// What the Kindler carries (lost in a fall).
function motesCarried(d) { return d.motes || (d.motes = {}); }
function motesCarriedN(d) { let n = 0; const M = motesCarried(d); for (const k in M) n += M[k]; return n; }
// A creature's nature: its own, or its region's for a boss or the Hollow.
function natureOfEnemy(d, e) {
  const n = NATURE_OF[e.type];
  if (n) return n;
  const f = d.floor, c = f.regions && typeof climeAtPx === 'function' ? T.climes[climeAtPx(f, e.x, e.y)] : null, el = c && c.resist && c.resist.more;
  return (el && NATURE_OF_EL[el]) || 'grit';
}
// A kill (combat.js killEnemy): its motes fly to the Kindler.
function motesKill(d, e) {
  if (e.type === 'dummy') return;
  const M = T.motes, n = e.boss ? M.boss : e.elite ? M.elite : M.kill, nat = natureOfEnemy(d, e), C = motesCarried(d);
  C[nat] = (C[nat] || 0) + n;
  for (let i = 0; i < Math.min(n, 6); i++) d.fx.push({ kind: 'mote', x: e.x + (i % 3 - 1) * 5, y: e.y - 4 - i * 2, t: 0.8 + i * 0.06, max: 0.8 + i * 0.06, seed: i + e.x, col: NATURES[nat].col, at: d.p });
  if (!Save.data.said.firstMotes) UI.toast(`${NATURES[nat].name}: carry it to a node`, 'legendary');
  Story.say('firstMotes');
}
// A node set (veins.js holdSet): what's carried is banked at the star.
function motesBank(d) {
  const C = motesCarried(d), s = motesState(), parts = [];
  for (const n in NATURES) if (C[n] > 0) { s.motes[n] += C[n]; parts.push(`${C[n]} ${n}`); C[n] = 0; }
  if (!parts.length) return;
  Save.saveField('motes');
  UI.toast(`Banked: ${parts.join(', ')}`, 'legendary');
  Story.say('firstBank');
}
// A fall (game.js loseDive): what's carried is lost.
function motesLost(d) {
  if (!d || motesCarriedN(d) <= 0) return;
  d.motes = {};
  UI.toast('The motes you carried are lost', 'legendary');
}
// Whether anything in the trees could be learned now (the button says so).
function motesAffordable() {
  const s = motesState(), mag = magnitudeOf();
  for (const t in MOTE_TREES) {
    const tree = MOTE_TREES[t];
    for (let k = 0; k < tree.length; k++) {
      const n = tree[k];
      if (moteLearned(n.id)) continue;
      if (s.motes[t] >= moteCost(k) && !(n.mag > mag)) return true;
      break;
    }
  }
  return false;
}
// LEARN, at the star's screen: the next node of a tree, for its motes.
function moteLearn(id) {
  const s = motesState(), mag = magnitudeOf();
  for (const t in MOTE_TREES) {
    const tree = MOTE_TREES[t], k = tree.findIndex((n) => n.id === id);
    if (k < 0) continue;
    const n = tree[k];
    if (moteLearned(n.id) || (k > 0 && !moteLearned(tree[k - 1].id)) || n.mag > mag || s.motes[t] < moteCost(k)) return false;
    s.motes[t] -= moteCost(k);
    s.learned.push(n.id);
    Save.save();
    UI.toast(`The star learned ${n.name}`, 'legendary');
    Story.say(n.kind === 'passive' ? 'firstPassive' : 'firstLearn');
    spellsApply();
    return true;
  }
  return false;
}
// A cast's part cycled to the next learned one: part form, el, or m0, m1…
// (an element or a mod can be none; a mod once in a cast).
function castCycle(i, part) {
  const s = motesState(), c = s.casts[i];
  if (!c) return;
  if (part === 'form') { const L = motesLearned('form'); c.form = L[(L.indexOf(c.form) + 1) % L.length]; }
  else if (part === 'el') { const L = [null].concat(motesLearned('el')); c.el = L[(L.indexOf(c.el) + 1) % L.length]; }
  else {
    const k = Number(part.slice(1)), L = [null].concat(motesLearned('mod').filter((m) => !c.mods.some((x, j) => x === m && j !== k)));
    c.mods[k] = L[(L.indexOf(c.mods[k] || null) + 1) % L.length];
  }
  Save.saveField('casts');
  spellsApply();
}
// A cast's name, for its button.
function castName(c) { return c ? `${c.el ? CIRCUIT_ELEMENTS[c.el].name + ' ' : ''}${CIRCUIT_FORMS[c.form] ? CIRCUIT_FORMS[c.form].name : 'Spark'}` : 'Spark'; }
// What's carried, as the cast code reads a rig's spells (game.js
// KINDLER_RIG, circuits.js).
function spellsApply() {
  const s = motesState(), rig = KINDLER_RIG, st = (stone) => ({ kind: 'stone', stone, tier: 1 }), slots = castModSlots();
  rig.spells = s.casts.slice(0, carrySlots()).map((c) => ({ form: st(moteLearned(c.form) ? c.form : 'arc'), el: c.el && moteLearned(c.el) ? st(c.el) : null, mods: c.mods.slice(0, slots).filter((m) => m && moteLearned(m)).map(st) }));
  rig.uid = (rig.uid || 1) + 1;
}

// The CASTS and the trees on the star's screen (map.js mapBody).
function motesHtml(d) {
  const s = motesState(), mag = magnitudeOf(), slots = castModSlots(), rows = [], C = motesCarried(d);
  rows.push('<h3>CASTS</h3><p class="note">A form, an element and the mods it has slots for, from everything the star has learned. Tap a part for the next.</p>');
  s.casts.slice(0, carrySlots()).forEach((c, i) => {
    const parts = [`<button class="mini part" data-act="castCycle" data-arg="${i}:form">${esc((CIRCUIT_FORMS[c.form] || { name: '?' }).name.toUpperCase())}</button>`, `<button class="mini part" data-act="castCycle" data-arg="${i}:el">${c.el ? esc(CIRCUIT_ELEMENTS[c.el].name.toUpperCase()) : 'NO ELEMENT'}</button>`];
    for (let k = 0; k < slots; k++) parts.push(`<button class="mini part" data-act="castCycle" data-arg="${i}:m${k}">${c.mods[k] ? esc(CIRCUIT_GLYPHS[c.mods[k]].name.toUpperCase()) : 'NO MOD'}</button>`);
    rows.push(`<div class="row static on cast"><img class="icon" src="${stoneIconUrl(c.form)}" alt=""><span class="row-text"><span class="row-name"><span class="r-legendary">${i ? 'B' : 'A'}</span> · ${esc(castName(c))}</span><span class="row-parts">${parts.join('')}</span></span></div>`);
  });
  const nextSlot = T.motes.modSlotsAt.find((m) => m > mag);
  if (nextSlot) rows.push(`<p class="note">Another mod slot at magnitude ${nextSlot}.</p>`);
  rows.push('<h3>THE TREES</h3><p class="note">What the dark leaves when it dies in your light, banked when a node sets. Each tree is bought with its own.</p>');
  for (const t in MOTE_TREES) {
    const N = NATURES[t], tree = MOTE_TREES[t];
    rows.push(`<h4 class="tree"><span class="pip" style="background:${N.col}"></span>${esc(N.name.toUpperCase())} · ${s.motes[t]} banked${C[t] ? ` · ${C[t]} carried` : ''}<span class="tree-line">${esc(N.line)}</span></h4>`);
    let open = true;
    for (let k = 0; k < tree.length; k++) {
      const n = tree[k], had = moteLearned(n.id), cost = moteCost(k), kind = n.kind === 'el' ? 'element' : n.kind;
      let act = '';
      if (had) act = '<span class="row-tag r-legendary">LEARNED</span>';
      else if (!open) act = '<span class="row-tag dim">· · ·</span>';
      else if (n.mag > mag) act = `<span class="row-tag dim">MAGNITUDE ${n.mag}</span>`;
      else act = `<button class="mini${s.motes[t] >= cost ? ' give' : ''}" data-act="moteLearn" data-arg="${n.id}"${s.motes[t] >= cost ? '' : ' disabled'}>LEARN · ${cost}</button>`;
      rows.push(`<div class="row static${had ? ' on' : ''}${!had && !open ? ' empty' : ''}">${n.kind === 'form' || n.kind === 'el' || n.kind === 'mod' ? `<img class="icon" src="${stoneIconUrl(n.id)}" alt="">` : '<span class="icon pass"></span>'}<span class="row-text"><span class="row-name">${esc(n.name)} <span class="dim">· ${kind}</span></span><span class="row-sub">${esc(n.line)}</span></span>${act}</div>`);
      if (!had) open = false;
    }
  }
  return rows.join('');
}
// The HUD's count of what's carried (ui.js): a pip and a number a nature.
function motesHudHtml(d) {
  const C = motesCarried(d), parts = [];
  for (const n in NATURES) if (C[n] > 0) parts.push(`<b style="color:${NATURES[n].col}">${C[n]}</b>`);
  return parts.join(' ');
}
