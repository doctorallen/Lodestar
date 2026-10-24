// ---------------------------------------------------------------------------
// Spells: how the rig's two are built, and how they're cast. The rig is a
// Charter suit's wrist projector; its frame (forged from ore that sets its
// tier) drives two spells, A from the right wrist and B from the left, each
// its own button. A spell is three cores, in no order:
//   - a Form: its shape (Arc, Glaive, Bolt, Lance, Orb, Nova, Well, Ward);
//   - an Element: its damage and status (Force, Shock, Frost, Ember,
//     Blight); with none, Force;
//   - a Mod: what changes it (Split, Amplify, Quicken, Chain, Echo, Pierce,
//     Linger). A better frame has a second Mod slot (T.circuits.rig).
// A cast costs its Form's charge times its Mods'. Close Forms (Arc, Glaive)
// give charge back for each foe they hit. Holding the button charges the
// cast: harder, for more charge; a held Arc bursts into a Nova instead.
// With no Form, a spell casts a weak spark.
//
// A frame's ore favours an element (affinity): a spell of it is attuned,
// harder and with a longer status (Resonite favours resonances instead). A
// spell holding all of a resonance's cores wakes it into a named spell
// (resonance.js). What each element's status does with another's is in
// reactions.js; what each foe makes of an element, in natures.js.
//
// The cores are kept as items of kind 'stone' (the save's old name); the
// Mods are CIRCUIT_GLYPHS. The words are here; every number is in
// T.circuits.
// ---------------------------------------------------------------------------

// The parts, in words: abbr for the buttons and tiles, text for the card's
// one short line.
const CIRCUIT_FORMS = {
  arc: { name: 'Arc', abbr: 'ARC', text: () => 'a sweep in front; the third hit staggers; held, a Nova' },
  glaive: { name: 'Glaive', abbr: 'GLV', text: () => `two blades circle you for ${T.circuits.forms.glaive.time} s` },
  bolt: { name: 'Bolt', abbr: 'BLT', text: () => 'a fast bolt at the nearest foe' },
  lance: { name: 'Lance', abbr: 'LNC', text: () => `pierces a line of ${T.circuits.forms.lance.pierce + 1}` },
  orb: { name: 'Orb', abbr: 'ORB', text: () => 'a slow orb that pulses as it drifts' },
  nova: { name: 'Nova', abbr: 'NOV', text: () => 'a burst all round you' },
  well: { name: 'Well', abbr: 'WEL', text: () => 'drags foes in and stuns them' },
  ward: { name: 'Ward', abbr: 'WRD', text: () => `a shield for ${T.circuits.forms.ward.time} s that hurts what hits it` },
};
const CIRCUIT_ELEMENTS = {
  force: { name: 'Force', abbr: 'FRC', status: 'knocks back; two heavy hits stun' },
  shock: { name: 'Shock', abbr: 'SHK', status: 'arcs to the next foe; five overload' },
  frost: { name: 'Frost', abbr: 'FRO', status: 'chills; three freeze solid' },
  ember: { name: 'Ember', abbr: 'EMB', status: 'burns, and burns spread' },
  blight: { name: 'Blight', abbr: 'BLG', status: 'poisons, and poison spreads' },
};
// The Mods. forms: the Forms it changes (all, if none are named).
const CIRCUIT_GLYPHS = {
  split: { name: 'Split', abbr: 'SPL', text: () => `three at once, each ${Math.round(T.circuits.glyphs.split.mult * 100)}%` },
  amplify: { name: 'Amplify', abbr: 'AMP', text: () => `${Math.round((T.circuits.glyphs.amplify.area - 1) * 100)}% wider, ${Math.round((T.circuits.glyphs.amplify.dmg - 1) * 100)}% harder` },
  quicken: { name: 'Quicken', abbr: 'QCK', text: () => 'a third cheaper and quicker' },
  chain: { name: 'Chain', abbr: 'CHN', text: () => `hits leap to ${T.circuits.glyphs.chain.jumps} more`, forms: ['arc', 'glaive', 'bolt', 'lance', 'orb', 'nova', 'well'] },
  echo: { name: 'Echo', abbr: 'ECH', text: () => `casts again at ${Math.round(T.circuits.glyphs.echo.mult * 100)}%` },
  pierce: { name: 'Pierce', abbr: 'PRC', text: () => `passes through ${T.circuits.glyphs.pierce.more} more`, forms: ['bolt', 'lance'] },
  linger: { name: 'Linger', abbr: 'LNG', text: () => `leaves a field for ${T.circuits.glyphs.linger.time} s` },
};
// What each kind of core is called.
const STONE_KIND_NAMES = { form: 'Form', element: 'Element', glyph: 'Mod' };
// Which two elements react, and as what (reactions.js does it).
const REACT_PAIRS = { 'force|frost': 'shatter', 'frost|shock': 'conduct', 'ember|frost': 'steam', 'blight|frost': 'brittle', 'blight|ember': 'pyre', 'ember|shock': 'flare', 'ember|force': 'scatter', 'force|shock': 'jolt' };
const reactPair = (a, b) => REACT_PAIRS[a < b ? a + '|' + b : b + '|' + a] || null;

// Resonances: named spells (resonance.js). A spell wakes one when its cores
// hold all of the resonance's parts (a Form, an Element and one or two
// Mods), in any order; a four-part one needs a frame with two Mod slots.
const RESONANCES = [
  { id: 'thunderhead', name: 'Thunderhead', parts: ['orb', 'shock', 'linger'], text: 'the orb stops overhead as a stormcloud, striking the foe below' },
  { id: 'shatterglass', name: 'Shatterglass', parts: ['lance', 'frost', 'echo'], text: 'the echo lance shatters the chilled for double' },
  { id: 'kindling', name: 'Kindling Arc', parts: ['arc', 'ember', 'quicken'], text: 'every third arc lights the ground in a crescent' },
  { id: 'wildfire', name: 'Wildfire', parts: ['orb', 'ember', 'split', 'linger'], text: 'three orbs leave burning trails' },
  { id: 'stormglaive', name: 'Stormglaive', parts: ['glaive', 'shock', 'chain', 'amplify'], text: 'the blades arc lightning to every foe near' },
  { id: 'starfall', name: 'Starfall', parts: ['bolt', 'force', 'split', 'amplify'], text: 'three bolts meet as a falling star that stuns' },
];

const stoneKind = (id) => (CIRCUIT_FORMS[id] ? 'form' : CIRCUIT_ELEMENTS[id] ? 'element' : CIRCUIT_GLYPHS[id] ? 'glyph' : null);
const stoneWords = (id) => CIRCUIT_FORMS[id] || CIRCUIT_ELEMENTS[id] || CIRCUIT_GLYPHS[id] || { name: id, abbr: '?' };
const isCaster = (it) => !!it && it.kind === 'caster';
const capFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// What a core does, in a short line (its card, the forge).
function stoneLine(id) {
  const k = stoneKind(id);
  if (k === 'form') return capFirst(CIRCUIT_FORMS[id].text()) + '.';
  if (k === 'element') return `${CIRCUIT_ELEMENTS[id].name}: ${CIRCUIT_ELEMENTS[id].status}.`;
  if (k === 'glyph') return capFirst(CIRCUIT_GLYPHS[id].text()) + '.';
  return '';
}
// What a core's tier does: its spell hits harder, a Form's tier by much,
// the others' by a little (stonePower).
function stoneTierLine(id, tier) {
  const C = T.circuits, pct = Math.round((stoneKind(id) === 'form' ? C.stoneGrowth : C.otherGrowth) * 100);
  return tier > 1 ? `Tier ${tier}: its spell hits ${pct * (tier - 1)}% harder (${pct}% a tier past the first).` : `Tier 1. Each tier higher makes its spell hit ${pct}% harder.`;
}

// A core's colour on the screens (its tile's rim): its own (ART.stones).
function stoneTint(id) {
  const k = stoneKind(id), S = ART.stones[k === 'element' ? id : k];
  return k === 'form' ? ART.stones.formRim : k === 'element' && S ? S.body[3] : ART.glyphTeal;
}
// A core's colour in play: an Element's own, a Form's, or a Mod's teal.
function stoneCol(id) {
  const k = stoneKind(id);
  if (k === 'element') return id === 'force' ? ELEMENT_COLS.force : ELEMENT_COLS[id];
  if (k === 'form') return ART.forms[id];
  return ART.glyphTeal;
}

// ---------------------------------------------------------------------------
// The rig's spells
// ---------------------------------------------------------------------------
// A spell: { form, el, mods: [core | null], and the frame's extra part if
// it has one: a second Mod (mods[1]), el2 (a second Element) or form2 (a
// second Form) }, each core an item { kind: 'stone', stone, tier, bonus }
// or null. extra: the frame's extra kind (frameExtra), or null.
function emptySpell(extra) {
  const sp = { form: null, el: null, mods: new Array(extra === 'glyph' ? 2 : 1).fill(null) };
  if (extra === 'element') sp.el2 = null;
  if (extra === 'form') sp.form2 = null;
  return sp;
}
// The extra part a frame's spells have: one on a frame of
// T.circuits.rig.extraTier or denser, a masterwork, or one with a Lodestone
// shard worked in; its kind is the ore's (T.circuits.ores[ore].extra: a
// second Mod, Element or Form). Null for a plain frame.
function frameExtra(tier, q, shard, oreId) {
  const R = T.circuits.rig;
  if (!(tier >= R.extraTier || q >= 3 || shard)) return null;
  return (T.circuits.ores[oreId] || {}).extra || 'glyph';
}
// A rig's spell i (0 or 1), or null.
const rigSpell = (it, i) => (it && it.spells && it.spells[i]) || null;
// A spell's cores, in a list (no empty ones).
const spellCores = (sp) => (sp ? [sp.form, sp.form2, sp.el, sp.el2].concat(sp.mods || []).filter(Boolean) : []);
// Where a core goes in a spell: 'form', 'el' or 'm0', 'm1' (or 'form2', 'el2').
const spellPartOf = (id) => (stoneKind(id) === 'form' ? 'form' : stoneKind(id) === 'element' ? 'el' : 'm');
function spellGet(sp, key) { return key[0] === 'm' ? sp.mods[Number(key.slice(1))] || null : sp[key] || null; }
function spellSet(sp, key, core) { if (key[0] === 'm') sp.mods[Number(key.slice(1))] = core; else sp[key] = core; }
// The kind of core a part of a spell takes.
const spellPartKind = (key) => (key === 'form' || key === 'form2' ? 'form' : key === 'el' || key === 'el2' ? 'element' : 'glyph');
// A spell's parts in order: [key, core | null], the extra part among them.
const spellParts = (sp) => [['form', sp.form]].concat('form2' in sp ? [['form2', sp.form2]] : [], [['el', sp.el]], 'el2' in sp ? [['el2', sp.el2]] : [], sp.mods.map((m, k) => ['m' + k, m]));

// What a spell fires as: { form, form2, tier, els, glyphs: { id: count },
// stones }, or null with no Form. Two Elements: each on half the hit (a
// hit of two elements, combat.js), and they react with each other.
function spellGroup(sp) {
  if (!sp || !sp.form) return null;
  const g = { form: sp.form.stone, form2: sp.form2 ? sp.form2.stone : null, tier: sp.form.tier, els: [sp.el, sp.el2].filter(Boolean).map((c) => c.stone), glyphs: {}, stones: [sp.form] };
  if (sp.form2) g.stones.push(sp.form2);
  if (sp.el) g.stones.push(sp.el);
  if (sp.el2) g.stones.push(sp.el2);
  for (const m of sp.mods || []) if (m) { g.glyphs[m.stone] = (g.glyphs[m.stone] || 0) + 1; g.stones.push(m); }
  return g;
}

// The resonance a spell wakes, if any: the largest whose parts its cores
// all hold.
function spellResonance(sp) {
  if (!sp || !sp.form) return null;
  const mods = (sp.mods || []).filter(Boolean).map((m) => m.stone);
  let best = null;
  for (const r of RESONANCES) {
    if (r.parts[0] !== sp.form.stone || r.parts[1] !== (sp.el ? sp.el.stone : null)) continue;
    const left = mods.slice();
    if (!r.parts.slice(2).every((id) => { const i = left.indexOf(id); if (i < 0) return false; left.splice(i, 1); return true; })) continue;
    if (!best || r.parts.length > best.parts.length) best = r;
  }
  return best;
}

// A spell in words: "BOLT · SHOCK · CHAIN" (empty parts left out; none at
// all: "EMPTY").
function spellName(sp) {
  const w = spellCores(sp).map((c) => stoneWords(c.stone).name.toUpperCase());
  return w.length ? w.join(' · ') : 'EMPTY';
}

// The worn frame's numbers: the rig's, with its ore's way (T.circuits.ores:
// a quicker wait, a further aim).
function rigBase() {
  const B = T.circuits.rig, it = Save.data && Save.data.equip && Save.data.equip.main, way = it && it.kind === 'caster' ? casterOreWay(it) : {};
  if (!way.cd && !way.reach) return B;
  return Object.assign({}, B, { cd: B.cd * (way.cd || 1), aim: B.aim * (way.reach || 1) });
}

// ---------------------------------------------------------------------------
// Ore affinity
// ---------------------------------------------------------------------------
// A frame's ore: the one it's named for (its tier's), or null (the fist).
// (the Splinter has no ore: facets.js)
function casterOre() { return null; }
// Its ore's way (T.circuits.ores), or {}.
const casterOreWay = (it) => (casterOre(it) && T.circuits.ores[casterOre(it)]) || {};
// The element its ore favours, or null.
const casterAffinity = (it) => casterOreWay(it).el || null;
// Which of a spell's elements its frame is attuned to.
function attunedEls(it, els) { const a = casterAffinity(it); return a && els.includes(a) ? [a] : []; }
// How much harder a spell of these elements hits from this frame.
function affinityMult(it, els) { return 1 + (T.circuits.attuned.dmg * attunedEls(it, els).length) / Math.max(1, els.length); }
// A frame's ore, in a short line ("Attuned: Shock"), or ''.
function rigOreLine(it) {
  const way = casterOreWay(it);
  const bits = [];
  if (way.el) bits.push(`Attuned: ${CIRCUIT_ELEMENTS[way.el].name}`);
  if (way.resonance) bits.push(`Resonances +${Math.round(way.resonance * 100)}%`);
  if (way.line) bits.push(way.line);
  return bits.join(' · ');
}

// A spell's charge: its Form's cost times each of its Mods', at least 1.
function groupCost(g) {
  let c = T.circuits.forms[g.form].cost;
  for (const id in g.glyphs) c *= Math.pow(T.circuits.glyphs[id].cost, g.glyphs[id]);
  return Math.max(1, c);
}
// What a press of a spell costs, in charge, to a tenth.
function spellCost(sp) {
  const g = spellGroup(sp);
  return g ? Math.round(groupCost(g) * 10) / 10 : T.circuits.spark.cost;
}
// How long a spell waits after a press (an Arc's by its place in the
// combo), by Quicken and the frame.
function spellWait(g, step) {
  const C = T.circuits, R = rigBase();
  if (!g) return C.spark.cd * R.cd;
  const F = C.forms[g.form], cd = g.form === 'arc' ? F.combo[step % F.combo.length][1] : F.cd;
  return cd * Math.pow(C.glyphs.quicken.cd, g.glyphs.quicken || 0) * R.cd;
}
// How much harder a spell hits for its cores' tiers.
function stonePower(g) {
  const C = T.circuits;
  let m = 1 + C.stoneGrowth * (g.tier - 1);
  for (const s of g.stones.slice(1)) m *= 1 + C.otherGrowth * (s.tier - 1);
  return m;
}
// A spell's colour: its Element's, else its Form's.
const groupCol = (g) => (g.els[0] ? stoneCol(g.els[0]) : ART.forms[g.form]);
function spellCol(sp) { const g = spellGroup(sp); return g ? groupCol(g) : ART.forms.bolt; }
// A spell's Form, for its button.
function spellForm(sp) { return sp && sp.form ? sp.form.stone : null; }

// A spell's one short line for its card: its cost, then what's worth
// knowing: a resonance, a Mod that does nothing, the attuned element.
// { text, warn, res }.
function spellLine(it, sp) {
  const g = spellGroup(sp), cost = spellCost(sp);
  if (!g) return { text: spellCores(sp).length ? 'No Form: a weak spark' : 'Empty: a weak spark', warn: true };
  const res = spellResonance(sp), bits = [`${cost} charge`];
  const idle = Object.keys(g.glyphs).filter((id) => CIRCUIT_GLYPHS[id].forms && !CIRCUIT_GLYPHS[id].forms.includes(g.form));
  if (res) bits.push(`✦ ${res.name}`);
  else if (idle.length) return { text: `${bits[0]} · ${idle.map((id) => CIRCUIT_GLYPHS[id].name).join(', ')} does nothing here`, warn: true };
  else if (attunedEls(it, g.els.length ? g.els : ['force']).length) bits.push('attuned');
  return { text: bits.join(' · '), res };
}

// ---------------------------------------------------------------------------
// Casting
// ---------------------------------------------------------------------------

// What casts with no rig worn: a free Arc at the fist's power (spell A).
function fistCaster() { const sp = emptySpell(null); sp.form = { kind: 'stone', stone: 'arc', tier: 1 }; return { kind: 'caster', bp: 'rig', base: { power: T.hands.fist }, spells: [sp, emptySpell(null)], affixes: [], fist: true }; }

// A press (or a release, charged) of a spell's button: slot 'main' casts
// spell A from the right wrist, 'off' spell B from the left.
function castHand(slot, item, h, charged) {
  const d = Game.dive, p = d.p, C = T.circuits, it = item || fistCaster(), R = rigBase();
  const sp = rigSpell(it, slot === 'off' ? 1 : 0), g = spellGroup(sp), res = spellResonance(sp);
  // (a cast costs nothing but its cooldown: one bar)
  const cn = d.casts || (d.casts = {});
  cn[slot] = (cn[slot] || 0) + 1;
  // an Arc's combo: a press soon after the last carries it on
  const arc = !!g && g.form === 'arc';
  h.step = arc && !charged && h.comboT > 0 ? (h.step + 1) % C.forms.arc.combo.length : 0;
  h.cd = spellWait(g, h.step) / (1 + d.stats.castSpeed / 100);
  h.comboT = arc && !charged ? T.hands.comboWindow + h.cd : 0;
  d.castRange = R.aim;
  const form = g ? (charged && g.form === 'arc' ? 'nova' : g.form) : 'spark';
  castFxStart(d, it, slot, charged, [form], g ? groupCol(g) : ART.forms.bolt);
  snd('cast', { form, els: g ? g.els : null, charged, step: h.step, res: !!res });
  const cx = { item: it, power: it.base.power * magnitudePower(), charged, step: h.step, from: null, aim: null, mult: res ? resonanceMult(it) : 1, spread: 0, echo: false, res: res ? res.id : null };
  if (res) resonanceCast(res, d);
  // the Twice-Told: everything again, fanned a little
  for (let k = 0; k < (d.stats.powers.echo ? 2 : 1); k++) {
    const c = k ? Object.assign({}, cx, { spread: 0.25 }) : cx;
    if (!g) fireSpark(c); else fireGroup(g, c);
    // a second Form (an Aetherglass frame's extra part): cast as well, a
    // little weaker
    if (g && g.form2) fireGroup(Object.assign({}, g, { form: g.form2, form2: null }), Object.assign({}, c, { mult: c.mult * C.rig.form2Mult }));
  }
  return true;
}

// Where a cast aims from `from` (null: the diver), within `range`: the
// angle to the nearest enemy in sight, else `aim`, else the way the diver
// faces. Returns { a, target }.
function circuitAim(from, range, exclude, aim) {
  const d = Game.dive, p = d.p;
  const o = from || p, target = nearestEnemy(d, range, o, exclude);
  if (target) return { target, a: Math.atan2(target.y - 4 - (o.y - (from ? 6 : 8)), target.x - o.x) };
  return { target: null, a: aim !== null && aim !== undefined ? aim : Math.atan2(p.fy, p.fx) };
}

// A spell's state as it fires: { g, cx, form, F, refund, refundLeft, close,
// els, att (its attuned elements), dmg, col, area, chain, linger }.
function circuitGroupState(g, cx) {
  const d = Game.dive, C = T.circuits, Gl = C.glyphs, n = (id) => g.glyphs[id] || 0, st = d.stats, R = rigBase();
  // a held Arc bursts into a Nova (from the diver)
  const form = cx.charged && g.form === 'arc' && !cx.from ? 'nova' : g.form;
  const F = C.forms[g.form], close = !!F.close;
  const els = g.els.length ? g.els.slice() : ['force'];
  let dmg = cx.power * F.mult * stonePower(g) * Math.pow(Gl.amplify.dmg, n('amplify')) * cx.mult * (1 + st.spellDmg / 100 + (close ? st.closeDmg / 100 : 0)) * affinityMult(cx.item, els);
  if (cx.charged) dmg *= g.form === 'arc' ? F.heldMult : C.chargedMult;
  return { g, cx, form, F: C.forms[form], refund: F.refund || 0, refundLeft: close ? F.refundMost : 0, close, els, att: attunedEls(cx.item, els), dmg, col: groupCol(g), area: R.area * Math.pow(Gl.amplify.area, n('amplify')), chain: n('chain'), linger: n('linger') };
}

// A spell fires: each Split of it, and an Echo later. cx: { item, power,
// charged, step (an Arc's), from (a point it fires from, or null for the
// diver), aim, mult, spread, echo (this is an echo's recast), exclude (a
// foe not to aim at first), res (the spell's resonance) }.
function fireGroup(g, cx) {
  const d = Game.dive;
  if (!d) return;
  const Gl = T.circuits.glyphs, n = (id) => g.glyphs[id] || 0;
  const s = circuitGroupState(g, cx), form = s.form;
  // a resonance may fire it its own way (resonance.js)
  if (cx.res && resonanceFire(s)) return;
  const split = n('split'), k = split ? 1 + 2 * split : 1, mult = split ? Gl.split.mult : 1;
  if (form === 'glaive') castGlaive(s, k, mult);
  else if (form === 'ward') castWard(s, k * mult);
  else for (let i = 0; i < k; i++) {
    const off = (i - (k - 1) / 2) * (form === 'arc' ? Gl.split.closeSpread : Gl.split.spread);
    const inst = circuitInstance(s, mult);
    if (form === 'arc') castArc(s, off, mult, inst, i === (k - 1) / 2);
    else if (form === 'nova') castNova(s, i, k, mult, inst);
    else if (form === 'well') castWell(s, off, mult, inst);
    else castShot(s, off, mult, inst);
  }
  if (n('echo') && !cx.echo) {
    for (let e = 1; e <= n('echo'); e++) d.later.push({ t: Gl.echo.delay * e, fn: () => { if (!cx.from) castFxEcho(d); fireGroup(g, Object.assign({}, cx, { mult: cx.mult * Gl.echo.mult, echo: true })); } });
  }
}

// One shot of a spell: where it ends, it leaves a Linger's field.
function circuitInstance(s, mult) {
  return {
    hit() {},
    end(x, y) { if (s.linger) lingerField(s, x, y, mult); },
  };
}

// A Linger's field: the group's element on the ground, hurting what's in it.
function lingerField(s, x, y, mult) {
  const Gl = T.circuits.glyphs.linger, t = Gl.time * s.linger;
  Game.dive.puddles.push({ x, y, r: s.F.field * s.area, t, max: t, dps: s.dmg * mult * Gl.dps, mine: true, els: s.els, att: s.att, col: s.col, every: Gl.every });
}

// A foe struck by a group: crits, its elements, knockback (more for Force),
// the charge a close Form gives back, and a Chain's leaps.
function circuitHit(s, e, dmg, opts = {}) {
  const d = Game.dive, st = d.stats, p = d.p;
  if (e.dead || e.hid) return;
  const way = casterOreWay(s.cx.item), heavy = !!opts.heavy || !!s.cx.charged;
  // the frame's ore: heavy hits harder, knocks and staggers harder
  if (heavy && way.heavy) dmg *= way.heavy;
  // the modules' traits that read the foe: the chilled, the burning, one
  // that's open to a counter
  let k = 1;
  if (st.chilledDmg && (e.slowT > 0 || e.frozenT > 0)) k += st.chilledDmg / 100;
  if (st.burnDmg && e.burn) k += st.burnDmg / 100;
  if (st.openDmg && (e.state === 'dazed' || e.state === 'stagger' || FOE_EXPOSED.has(e.state))) k += st.openDmg / 100;
  dmg *= k;
  if (s.form === 'arc' && st.arcCharge) p.charge = Math.min(st.maxCharge, p.charge + st.arcCharge);
  const crit = d.rng.f(100) < st.crit, kf = (s.els.includes('force') ? T.circuits.force.knock : 1) * (way.knock || 1);
  hurtEnemy(e, dmg * (crit ? 2 : 1), { spell: true, crit, els: s.els, att: s.att, heavy: !!opts.heavy, close: !!s.close, proj: !!opts.proj, staggerK: way.stagger || 1, statusK: way.status || 1, knock: opts.knock ? { x: opts.knock.x * kf, y: opts.knock.y * kf } : null });
  snd('hit', { el: s.els[0], crit, heavy: !!opts.heavy, verdict: e.lastVerdict, x: e.x, y: e.y });
  if (crit && st.powers.bloodedge) healPlayer(st.maxHp * 0.04);
  if (s.refundLeft > 0) { s.refundLeft--; p.charge = Math.min(st.maxCharge, p.charge + s.refund); }
  if (s.chain && !opts.noChain) circuitLeap(s, e, dmg);
}

// A Chain: from a foe struck, on to the nearest others not yet struck, each
// a little weaker, a crackle of the group's colour between them.
function circuitLeap(s, from, dmg) {
  const d = Game.dive, G = T.circuits.glyphs.chain, hit = [from];
  let cur = from, k = dmg;
  for (let j = 0; j < G.jumps * s.chain; j++) {
    let next = null, bd = G.range * s.area;
    for (const o of d.enemies) { if (o.dead || o.hid || hit.includes(o)) continue; const m = dist(o.x, o.y, cur.x, cur.y); if (m < bd) { bd = m; next = o; } }
    if (!next) break;
    k *= G.falloff;
    d.fx.push({ kind: 'arc', x: cur.x, y: cur.y - 5, x2: next.x, y2: next.y - 5, t: 0.18, max: 0.18, col: s.col });
    circuitHit(s, next, k, { noChain: true });
    hit.push(next); cur = next;
  }
}

// Arc: a sweep of light in front, everything in its reach and angle struck.
// From the diver it aims at the nearest foe within autoAim (the diver turns
// to it but stays put); the third of the combo is heavy and staggers.
function castArc(s, off, mult, inst, centre) {
  const d = Game.dive, p = d.p, F = s.F, cx = s.cx, A = F.combo[cx.step % F.combo.length], heavy = cx.step % F.combo.length === F.combo.length - 1;
  const from = cx.from, range = F.range * s.area;
  const aim = circuitAim(from, T.hands.autoAim, cx.exclude, cx.aim), a = aim.a + off + cx.spread;
  const dir = { x: Math.cos(a), y: Math.sin(a) };
  let x0 = from ? from.x : p.x, y0 = from ? from.y : p.y;
  if (!from && centre) {
    p.fx = Math.cos(aim.a); p.fy = Math.sin(aim.a);
    p.strikeT = Math.max(p.strikeT || 0, A[1] * F.slow);
  }
  let first = null, fd = 1e9, n = 0;
  for (const e of d.enemies) {
    if (e.dead) continue;
    const dx = e.x - x0, dy = e.y - y0, m = Math.hypot(dx, dy);
    const touching = m <= e.r + T.player.radius + 3 || (!from && dist(e.x, e.y, p.x, p.y) <= e.r + T.player.radius + 3);
    if (!touching && (m > range + e.r || (m > 2 && (dx * dir.x + dy * dir.y) / m < A[2]))) continue;
    circuitHit(s, e, s.dmg * A[0] * mult, { knock: { x: dir.x * A[3], y: dir.y * A[3] }, heavy });
    n++;
    if (m < fd) { fd = m; first = e; }
  }
  castFxFor('sweep', s.g.els[0] || null, { x: x0, y: y0 }, a, { r: range, heavy, side: cx.step % 2 ? -1 : 1, cos: A[2], col: s.col, from: !!from });
  // Kindling Arc: the heavy third sets the ground in front alight
  if (cx.res === 'kindling' && heavy && centre) kindleCrescent(s, x0, y0, a, range, A[2]);
  if (n && !from) { freezeFrame(heavy ? T.impact.heavyStop : T.impact.hitstop, heavy); buzz(heavy ? 25 : 10); }
  if (first) inst.hit(first.x, first.y, first, a);
  inst.end(x0 + dir.x * range * 0.7, y0 + dir.y * range * 0.7, a);
}

// Nova: a burst all round where it's cast. Split makes three (the i-th of
// k), set evenly round it from the aim.
function castNova(s, i, k, mult, inst) {
  const d = Game.dive, p = d.p, cx = s.cx, F = s.F, r = F.radius * s.area * (cx.charged && s.g.form !== 'arc' ? F.chargedR : 1);
  const o = cx.from || p, aim = circuitAim(cx.from, T.circuits.aimRange, cx.exclude, cx.aim).a, b = aim + (i / k) * Math.PI * 2, out = k > 1 ? r * F.splitOut : 0;
  const x = o.x + Math.cos(b) * out, y = o.y + Math.sin(b) * out;
  d.fx.push({ kind: 'nova', x, y: y - 6, r, t: 0.3, max: 0.3, col: s.col });
  castFxFor(T.castFx.shapeOf.nova, s.g.els[0] || null, { x, y }, 0, { r, col: s.col });
  let first = null, fd = 1e9;
  for (const e of d.enemies) {
    if (e.dead) continue;
    const m = dist(e.x, e.y, x, y);
    if (m >= r + e.r) continue;
    const k = norm(e.x - x, e.y - y);
    circuitHit(s, e, s.dmg * mult, { knock: { x: k.x * F.knock, y: k.y * F.knock }, heavy: cx.charged });
    if (m < fd) { fd = m; first = e; }
  }
  if (first && !cx.from) freezeFrame(T.impact.hitstop, false);
  if (first) inst.hit(first.x, first.y, first, aim);
  inst.end(x, y, aim);
}

// Well: a knot of gravity at the aim. It yanks what's near in and stuns it,
// then drags and grinds what's in it until it fades (circuitAuras).
function castWell(s, off, mult, inst) {
  const d = Game.dive, p = d.p, cx = s.cx, F = s.F, r = F.radius * s.area;
  const aim = circuitAim(cx.from, rigBase().aim, cx.exclude, cx.aim), a = aim.a + off;
  let x, y;
  if (cx.from) { x = cx.from.x + Math.cos(a) * (off ? r * F.splitOut : 0); y = cx.from.y + Math.sin(a) * (off ? r * F.splitOut : 0); }
  else if (aim.target && !off) { x = aim.target.x; y = aim.target.y; }
  else { x = p.x + Math.cos(a) * F.ahead; y = p.y + Math.sin(a) * F.ahead; }
  for (const e of d.enemies) {
    if (e.dead || e.hid || e.boss || e.type === 'hollow' || T.enemies[e.type].rooted || T.enemies[e.type].anchored) continue;
    const m = dist(e.x, e.y, x, y);
    if (m > r || m < 1) continue;
    const k = Math.min(F.yank, (m - 6) * 4);
    e.kx = ((x - e.x) / m) * k; e.ky = ((y - e.y) / m) * k;
    e.stunT = Math.max(e.stunT, F.stun); e.state = 'chase';
  }
  d.auras.push({ kind: 'well', x, y, r, t: F.time, max: F.time, tick: 0, dmg: s.dmg * mult, s, inst, a, col: s.col });
  castFxFor(T.castFx.shapeOf.well, s.g.els[0] || null, { x, y }, a, { r, col: s.col });
}

// Glaive: blades of light circling the diver (or the point it was set off
// at), cutting what they touch. Split triples the blades, each weaker.
function castGlaive(s, k, mult) {
  const d = Game.dive, p = d.p, cx = s.cx, F = s.F, o = cx.from || p;
  const mine = d.auras.filter((au) => au.kind === 'glaive');
  if (mine.length >= F.most) d.auras.splice(d.auras.indexOf(mine[0]), 1);
  const a = circuitAim(cx.from, T.hands.autoAim, cx.exclude, cx.aim).a;
  d.auras.push({ kind: 'glaive', follow: !cx.from, x: o.x, y: o.y, r: F.radius * s.area, t: F.time, max: F.time, age: 0, n: F.blades * k, a, spin: F.spin, reach: F.reach * Math.sqrt(s.area), dmg: s.dmg * mult, s, inst: circuitInstance(s, mult), seen: new Map(), col: s.col, storm: cx.res === 'stormglaive', stormT: 0 });
  castFxFor(T.castFx.shapeOf.glaive, s.g.els[0] || null, o, a, { r: F.radius * s.area, col: s.col });
}

// Ward: a shield that soaks damage for a while; what strikes it is struck
// back with its element. When it breaks or fades, it leaves its Linger's
// field.
function castWard(s, k) {
  const d = Game.dive, p = d.p, cx = s.cx, F = s.F;
  p.ward = Math.max(p.ward, cx.power * F.soak * s.area * k * cx.mult * (cx.charged ? T.circuits.chargedMult : 1));
  p.wardT = F.time;
  p.wardS = s; p.wardHit = cx.power * F.thorns * cx.mult * (1 + d.stats.spellDmg / 100); p.wardEnd = circuitInstance(s, 1);
  d.fx.push({ kind: 'ward', x: p.x, y: p.y - 6, t: 0.3, max: 0.3 });
  castFxFor(T.castFx.shapeOf.ward, s.g.els[0] || null, p, 0, { r: 14, col: s.col });
}
// The ward is gone, broken or faded.
function wardGone(p) {
  const w = p.wardEnd;
  p.wardEnd = null; p.wardS = null;
  if (w) w.end(p.x, p.y, Math.atan2(p.fy, p.fx));
}

// Bolt, Lance and Orb: projectiles. A bolt flies at the nearest foe; a lance
// pierces a line; an orb drifts and pulses. Charged, a bolt or a lance is
// bigger and passes through more.
function castShot(s, off, mult, inst) {
  const d = Game.dive, cx = s.cx, F = s.F, form = s.form, C = T.circuits;
  const aim = circuitAim(cx.from, rigBase().aim, cx.exclude, cx.aim), a = aim.a + off + cx.spread;
  const o = cx.from || d.p, big = cx.charged && form !== 'orb';
  const n = (id) => s.g.glyphs[id] || 0;
  d.bolts.push({
    x: o.x, y: o.y - (cx.from ? 6 : 8), vx: Math.cos(a) * F.speed, vy: Math.sin(a) * F.speed, dmg: s.dmg * mult, kind: form, t: F.life * (casterOreWay(cx.item).reach || 1),
    // resonances: Wildfire's burning trail, Shatterglass's echo lance
    wild: cx.res === 'wildfire' && form === 'orb', trailD: 0, shatter: cx.res === 'shatterglass' && form === 'lance' && cx.echo,
    chain: form === 'bolt' ? (d.stats.powers.stormcaller ? 2 : 0) + n('chain') * C.glyphs.chain.jumps : 0,
    pierce: (F.pierce || 0) + n('pierce') * C.glyphs.pierce.more + (big ? C.chargedPierce : 0),
    hitIds: cx.exclude ? [cx.exclude] : [], big, element: s.g.els[0] || null, col: s.col, s, inst,
    orb: form === 'orb' ? { r: F.radius * s.area, every: F.every, tick: F.every * 0.4, pulse: 0 } : null,
  });
}

// What a spell with no Form casts: a weak bolt.
function fireSpark(cx) {
  const d = Game.dive, S = T.circuits.spark;
  const s = { g: { form: 'spark', els: [], glyphs: {} }, cx, form: 'spark', F: S, refund: 0, refundLeft: 0, els: ['force'], att: attunedEls(cx.item, ['force']), dmg: cx.power * S.mult * (cx.charged ? T.circuits.chargedMult : 1) * (1 + d.stats.spellDmg / 100), col: ART.forms.bolt, area: 1, chain: 0, linger: 0 };
  castShot(s, 0, 1, circuitInstance(s, 1));
}

// ---------------------------------------------------------------------------
// Each step: what's in flight, and what lingers
// ---------------------------------------------------------------------------
function updateBolts(dt) {
  const d = Game.dive, f = d.floor;
  for (const b of d.bolts) {
    b.t -= dt; b.x += b.vx * dt; b.y += b.vy * dt;
    if (TILE_SOLID[floorTile(f, Math.floor(b.x / TILE), Math.floor((b.y + 6) / TILE))]) { b.t = 0; castFxImpact(b, 'wall'); continue; }
    if (b.wild) wildfireTrail(b, dt);
    if (b.orb) {
      // an orb drifts through, pulsing
      if ((b.orb.tick -= dt) <= 0) {
        b.orb.tick = b.orb.every; b.orb.pulse = Game.realT;
        for (const e of d.enemies) if (!e.dead && dist(e.x, e.y, b.x, b.y + 6) < b.orb.r + e.r) circuitHit(b.s, e, b.dmg, { knock: norm(e.x - b.x, e.y - b.y - 6), proj: true });
      }
      continue;
    }
    for (const e of d.enemies) {
      if (e.dead || e.hid || b.hitIds.includes(e) || dist(b.x, b.y, e.x, e.y - 5) > e.r + (b.big ? 7 : 4)) continue;
      const sp0 = Math.hypot(b.vx, b.vy) || 1, kb = T.impact.shotKnock[b.big ? 1 : 0];
      // Shatterglass: the echo's lance shatters the chilled
      const shatter = b.shatter && carries(e, 'frost');
      circuitHit(b.s, e, b.dmg * (shatter ? T.circuits.resonance.shatterglass.mult : 1), { knock: { x: (b.vx / sp0) * kb, y: (b.vy / sp0) * kb }, heavy: b.big, proj: true, noChain: b.kind === 'bolt' || b.kind === 'shard' });
      if (shatter) shatterglassShards(b, e);
      if (b.big) freezeFrame(T.impact.hitstop * 0.6, false);
      castFxImpact(b, 'hit');
      b.hitIds.push(e);
      b.inst.hit(e.x, e.y, e, Math.atan2(b.vy, b.vx));
      if (b.pierce > 0) { b.pierce--; continue; }
      // a bolt's Chain (and the Stormcaller's): on to the next nearest
      const next = b.chain > 0 && d.enemies.filter((o) => !o.dead && !o.hid && !b.hitIds.includes(o) && dist(o.x, o.y, e.x, e.y) < T.circuits.glyphs.chain.range * 1.5).sort((o1, o2) => dist(o1.x, o1.y, e.x, e.y) - dist(o2.x, o2.y, e.x, e.y))[0];
      if (next) {
        b.chain--;
        const a = norm(next.x - b.x, next.y - 4 - b.y), sp = Math.hypot(b.vx, b.vy);
        b.vx = a.x * sp; b.vy = a.y * sp; b.t = 0.6;
      } else b.t = 0;
      break;
    }
  }
  for (const b of d.bolts) if (b.t <= 0) { castFxBoltEnd(b); b.inst.end(b.x, b.y + 6, Math.atan2(b.vy, b.vx)); }
  d.bolts = d.bolts.filter((b) => b.t > 0);
}

// Glaives circling, wells grinding; and whatever an Echo has waiting.
function updateAuras(dt) {
  const d = Game.dive, p = d.p;
  for (const au of d.auras) {
    au.t -= dt;
    if (au.follow) { au.x = p.x; au.y = p.y; }
    if (au.kind === 'glaive') {
      au.age += dt; au.a += au.spin * dt;
      for (let k = 0; k < au.n; k++) {
        const b = au.a + (k / au.n) * Math.PI * 2, bx = au.x + Math.cos(b) * au.r, by = au.y + Math.sin(b) * au.r;
        for (const e of d.enemies) {
          if (e.dead || dist(e.x, e.y, bx, by) > au.reach + e.r || (au.seen.get(e) || 0) > au.age) continue;
          au.seen.set(e, au.age + T.circuits.forms.glaive.again);
          const kb = T.circuits.forms.glaive.knock;
          circuitHit(au.s, e, au.dmg, { knock: { x: -Math.sin(b) * kb, y: Math.cos(b) * kb } });
          au.inst.hit(e.x, e.y, e, b);
        }
      }
      if (au.storm) stormglaiveArcs(au, dt);
    } else if (au.kind === 'cloud') thunderheadTick(au, dt);
    else if (au.kind === 'well') {
      const W = T.circuits.forms.well;
      for (const e of d.enemies) {
        if (e.dead || e.hid || e.boss || e.type === 'hollow' || T.enemies[e.type].rooted || T.enemies[e.type].anchored) continue;
        const m = dist(e.x, e.y, au.x, au.y);
        if (m < au.r && m > 3) moveBody(d.floor, e, ((au.x - e.x) / m) * W.pull * dt, ((au.y - e.y) / m) * W.pull * dt, e.r);
      }
      if ((au.tick -= dt) <= 0) {
        au.tick = W.every;
        for (const e of d.enemies) if (!e.dead && dist(e.x, e.y, au.x, au.y) < au.r + e.r) circuitHit(au.s, e, au.dmg, {});
      }
    }
    if (au.t <= 0 && au.inst) au.inst.end(au.x, au.y, au.a || 0);
  }
  d.auras = d.auras.filter((au) => au.t > 0);
  for (const l of d.later) if ((l.t -= dt) <= 0 && !l.done) { l.done = true; l.fn(); }
  d.later = d.later.filter((l) => !l.done);
}
