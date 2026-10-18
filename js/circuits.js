'use strict';
// ---------------------------------------------------------------------------
// Circuits: how a caster's spell is built, and how it's cast. A caster (a
// wand, a gauntlet or a staff) holds a row of slots, each empty or holding a
// stone, and a press of its hand's button casts the whole row, read left to
// right:
//   - a Form starts a group: the spell's shape (Arc, Glaive, Bolt, Lance,
//     Orb, Nova, Well, Ward);
//   - Elements after it set its damage type, two at most (the damage is
//     split between them and both statuses are applied); with none, Force;
//   - Glyphs change the Form to their left (Split, Amplify, Quicken, Chain,
//     Echo, Pierce, Linger, Trigger);
//   - two Forms in a row fire together, and both are paid for;
//   - Trigger makes the next Form fire from where this one hits or ends;
//   - stones before the first Form do nothing.
// A cast costs the sum of its groups' charge: each Form's cost times its
// glyphs' (a gauntlet takes 1 off a close Form). Close Forms (Arc, Glaive)
// give charge back for each foe they hit. Holding the button charges the
// cast: harder, for more charge; a held Arc bursts into a Nova instead.
//
// The words are here; every number is in T.circuits. Phase 2 and 3 hooks,
// which change nothing yet: reactions between statuses (circuitReact),
// resistances and weaknesses (elementMult), ore affinity (affinityMult),
// linked slots (a caster's `links`, unread), and resonances, which
// circuitResonance recognises but nothing acts on.
// ---------------------------------------------------------------------------

// The parts, in words. range: how far it works, for the readout.
const CIRCUIT_FORMS = {
  arc: { name: 'Arc', abbr: 'ARC', range: 'close', text: () => 'a sweep of light in front of you. Tap, tap, tap: the third is heavy and staggers. Held, it bursts into a Nova' },
  glaive: { name: 'Glaive', abbr: 'GLV', range: 'close', text: () => `two blades of light circle you for ${T.circuits.forms.glaive.time} s, cutting what they touch` },
  bolt: { name: 'Bolt', abbr: 'BLT', range: 'mid', text: () => 'a fast bolt at the nearest foe' },
  lance: { name: 'Lance', abbr: 'LNC', range: 'far', text: () => `a long lance that pierces a line, up to ${T.circuits.forms.lance.pierce + 1} foes` },
  orb: { name: 'Orb', abbr: 'ORB', range: 'mid', text: () => 'a slow orb that drifts at the aim, pulsing damage round itself' },
  nova: { name: 'Nova', abbr: 'NOV', range: 'area', text: () => 'a burst all round you' },
  well: { name: 'Well', abbr: 'WEL', range: 'area', text: () => 'a knot of gravity at the aim that drags foes in and stuns them' },
  ward: { name: 'Ward', abbr: 'WRD', range: 'guard', text: () => `a shield that soaks damage for ${T.circuits.forms.ward.time} s; its element hurts what strikes it` },
};
const CIRCUIT_ELEMENTS = {
  force: { name: 'Force', abbr: 'FRC', status: 'knocks foes back, and heavy hits stagger' },
  shock: { name: 'Shock', abbr: 'SHK', status: 'hits can arc to the next foe' },
  frost: { name: 'Frost', abbr: 'FRO', status: 'chills, and a heavy hit on the chilled shatters for more' },
  ember: { name: 'Ember', abbr: 'EMB', status: 'sets foes burning' },
  blight: { name: 'Blight', abbr: 'BLG', status: 'poisons, and the poison spreads when its host falls' },
};
// forms: the Forms it changes (all, if none are named).
const CIRCUIT_GLYPHS = {
  split: { name: 'Split', abbr: 'SPL', text: () => `three at once, each at ${Math.round(T.circuits.glyphs.split.mult * 100)}%` },
  amplify: { name: 'Amplify', abbr: 'AMP', text: () => `${Math.round((T.circuits.glyphs.amplify.area - 1) * 100)}% wider and ${Math.round((T.circuits.glyphs.amplify.dmg - 1) * 100)}% harder` },
  quicken: { name: 'Quicken', abbr: 'QCK', text: () => 'a third cheaper, and faster to cast' },
  chain: { name: 'Chain', abbr: 'CHN', text: () => `each hit leaps to ${T.circuits.glyphs.chain.jumps} more foes`, forms: ['arc', 'glaive', 'bolt', 'lance', 'orb', 'nova', 'well'] },
  echo: { name: 'Echo', abbr: 'ECH', text: () => `casts again ${T.circuits.glyphs.echo.delay} s later at ${Math.round(T.circuits.glyphs.echo.mult * 100)}%` },
  pierce: { name: 'Pierce', abbr: 'PRC', text: () => `passes through ${T.circuits.glyphs.pierce.more} more`, forms: ['bolt', 'lance'] },
  linger: { name: 'Linger', abbr: 'LNG', text: () => `leaves a field of its element where it ends, for ${T.circuits.glyphs.linger.time} s` },
  trigger: { name: 'Trigger', abbr: 'TRG', text: () => 'the next Form fires from where this one hits or ends' },
};
const STONE_KIND_NAMES = { form: 'Form', element: 'Element', glyph: 'Glyph' };

// Resonances (phase 3): exact circuits that will wake into named spells.
// One must fill its caster exactly. Listed now so the engine allows them.
const RESONANCES = [
  { id: 'thunderhead', name: 'Thunderhead', seq: ['orb', 'shock', 'linger'] },
  { id: 'shatterglass', name: 'Shatterglass', seq: ['lance', 'frost', 'echo'] },
  { id: 'kindling', name: 'Kindling Arc', seq: ['arc', 'ember', 'quicken'] },
  { id: 'wildfire', name: 'Wildfire', seq: ['orb', 'ember', 'split', 'linger'] },
  { id: 'stormglaive', name: 'Stormglaive', seq: ['glaive', 'shock', 'chain', 'amplify'] },
  { id: 'starfall', name: 'Starfall', seq: ['bolt', 'force', 'split', 'trigger', 'nova'] },
];

const stoneKind = (id) => (CIRCUIT_FORMS[id] ? 'form' : CIRCUIT_ELEMENTS[id] ? 'element' : CIRCUIT_GLYPHS[id] ? 'glyph' : null);
const stoneWords = (id) => CIRCUIT_FORMS[id] || CIRCUIT_ELEMENTS[id] || CIRCUIT_GLYPHS[id] || { name: id, abbr: '?' };
const isCaster = (it) => !!it && it.kind === 'caster';
const capFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// What a stone does, in a line (its card, the forge).
function stoneLine(id) {
  const k = stoneKind(id);
  if (k === 'form') return `${capFirst(CIRCUIT_FORMS[id].text())}. A Form starts a spell.`;
  if (k === 'element') return `${CIRCUIT_ELEMENTS[id].name} damage: ${CIRCUIT_ELEMENTS[id].status}. Put it after a Form.`;
  if (k === 'glyph') return `${capFirst(CIRCUIT_GLYPHS[id].text())}. It changes the Form to its left.`;
  return '';
}

// A stone's colour: an Element's own, a Form's, or a Glyph's teal.
function stoneCol(id) {
  const k = stoneKind(id);
  if (k === 'element') return id === 'force' ? ELEMENT_COLS.force : ELEMENT_COLS[id];
  if (k === 'form') return ART.forms[id];
  return ART.glyphTeal;
}

// ---------------------------------------------------------------------------
// Reading a circuit
// ---------------------------------------------------------------------------

// The groups a row of slots makes: { form, tier, els, glyphs: { id: count },
// stones, triggered (set off by the one before), next (the one it sets
// off) }, and what does nothing: loose (stones before the first Form, a
// third Element or the same one twice) and dangling (a Trigger with no Form
// after it).
function parseCircuit(slots) {
  const groups = [], loose = [];
  let g = null, link = false;
  for (const s of slots || []) {
    if (!s) continue;
    const id = s.stone, k = stoneKind(id);
    if (k === 'form') {
      const ng = { form: id, tier: s.tier, els: [], glyphs: {}, stones: [s], triggered: link, next: null };
      if (link && g) g.next = ng;
      groups.push(ng); g = ng; link = false;
    } else if (!g || !k) loose.push(s);
    else if (k === 'element') { if (g.els.length < 2 && !g.els.includes(id)) { g.els.push(id); g.stones.push(s); } else loose.push(s); }
    else {
      if (id === 'trigger' && !g.glyphs.trigger) link = true;
      g.glyphs[id] = (g.glyphs[id] || 0) + 1;
      g.stones.push(s);
    }
  }
  return { groups, loose, dangling: link };
}

// Phase 3: the resonance a full circuit makes, if any (nothing uses it yet).
function circuitResonance(slots) {
  if (!slots || slots.some((s) => !s)) return null;
  const ids = slots.map((s) => s.stone);
  return RESONANCES.find((r) => r.seq.length === ids.length && r.seq.every((x, i) => x === ids[i])) || null;
}

const casterBase = (it) => T.circuits.bases[((it && bpOf(it)) || {}).style] || T.circuits.bases.wand;

// A group's charge: its Form's cost (less a gauntlet's 1 for a close Form),
// times each of its glyphs', at least 1.
function groupCost(g, B) {
  const F = T.circuits.forms[g.form];
  let c = F.cost - (F.close && B.closeCost ? B.closeCost : 0);
  for (const id in g.glyphs) c *= Math.pow(T.circuits.glyphs[id].cost, g.glyphs[id]);
  return Math.max(1, c);
}
// What a press of the caster costs, in charge, to a tenth.
function circuitCost(it, P = parseCircuit(it.slots)) {
  if (!P.groups.length) return T.circuits.spark.cost;
  const B = casterBase(it);
  return Math.round(P.groups.reduce((n, g) => n + groupCost(g, B), 0) * 10) / 10;
}
// How long the hand waits after a press: its slowest group's wait (an
// Arc's by its place in the combo), by Quicken and the base.
function handWait(it, P, step) {
  const C = T.circuits, B = casterBase(it);
  if (!P.groups.length) return C.spark.cd * B.cd;
  let w = 0;
  for (const g of P.groups) {
    if (g.triggered) continue;
    const F = C.forms[g.form], cd = g.form === 'arc' ? F.combo[step % F.combo.length][1] : F.cd;
    w = Math.max(w, cd * Math.pow(C.glyphs.quicken.cd, g.glyphs.quicken || 0));
  }
  return w * B.cd;
}
// How much harder a group hits for its stones' tiers.
function stonePower(g) {
  const C = T.circuits;
  let m = 1 + C.stoneGrowth * (g.tier - 1);
  for (const s of g.stones.slice(1)) m *= 1 + C.otherGrowth * (s.tier - 1);
  return m;
}
// A group's colour: its first Element's, else its Form's.
const groupCol = (g) => (g.els[0] ? stoneCol(g.els[0]) : ART.forms[g.form]);
// A caster's colour as it casts: its first Form's group's.
function circuitCol(it) {
  const P = parseCircuit(it && it.slots);
  return P.groups.length ? groupCol(P.groups[0]) : ART.forms.bolt;
}
// The first Form in a caster's circuit, for its hand's button.
function firstForm(it) { const P = parseCircuit(it && it.slots); return P.groups.length ? P.groups[0].form : null; }

// What a circuit does, in plain words: { lines: [{ text, warn }], cost,
// held }. lines are sentences; cost and held are charge.
function circuitReadout(it) {
  const C = T.circuits, P = parseCircuit(it.slots), B = casterBase(it), lines = [];
  const els = (g) => (g.els.length ? g.els : ['force']);
  if (it.slots.some(Boolean) && (!it.slots[0] || stoneKind(it.slots[0].stone) !== 'form') && P.groups.length) lines.push({ text: 'A circuit starts with a Form: what comes before the first one does nothing.', warn: true });
  P.groups.forEach((g, i) => {
    const F = C.forms[g.form], W = CIRCUIT_FORMS[g.form], E = els(g);
    let t = (g.triggered ? 'Then, from where it hits or ends: ' : i ? 'Together with it: ' : '') + `${W.name}, ${W.text()}. `;
    t += `It deals ${E.map((e) => CIRCUIT_ELEMENTS[e].name).join(' and ')} damage${E.length > 1 ? ', split between them' : ''}: ${E.map((e) => CIRCUIT_ELEMENTS[e].status).join('; ')}.`;
    const fx = [], idle = [];
    for (const id in g.glyphs) {
      const G = CIRCUIT_GLYPHS[id], n = g.glyphs[id];
      if (id === 'trigger') continue;
      if (G.forms && !G.forms.includes(g.form)) { idle.push(G.name); continue; }
      fx.push(`${G.name}${n > 1 ? ` ×${n}` : ''}: ${G.text()}`);
    }
    if (fx.length) t += ' ' + fx.map((x) => x + '.').join(' ');
    if (idle.length) t += ` ${idle.join(' and ')} does nothing for a${/^[AEIOU]/.test(W.name) ? 'n' : ''} ${W.name}.`;
    if (F.close) t += ` Close: each foe it hits gives back ${F.refund} charge (${F.refundMost} at most a cast).`;
    lines.push({ text: t });
  });
  if (P.dangling) lines.push({ text: 'The Trigger at the end has nothing to set off: put a Form after it.', warn: true });
  if (P.loose.length && P.groups.length) lines.push({ text: `Doing nothing: ${P.loose.map((s) => stoneWords(s.stone).name).join(', ')}.`, warn: true });
  if (!P.groups.length) lines.push({ text: it.slots.some(Boolean) ? 'No Form, so nothing to shape it: it casts a weak spark.' : 'Empty: it casts a weak spark. Put a Form in the first slot.', warn: true });
  const cost = circuitCost(it, P);
  return { lines, cost, held: Math.round(cost * C.chargedCost * 10) / 10, close: P.groups.some((g) => C.forms[g.form].close) };
}

// ---------------------------------------------------------------------------
// Hooks for the next phases. They change nothing yet.
// ---------------------------------------------------------------------------
// How much an enemy takes from these elements (resistances and weaknesses).
function elementMult(e, els) { return 1; }
// Two statuses meeting on an enemy (reactions).
function circuitReact(e, els) { }
// How much a caster's ore favours these elements (affinity).
function affinityMult(it, els) { return 1; }

// ---------------------------------------------------------------------------
// Casting
// ---------------------------------------------------------------------------

// What an empty main hand casts: a free Arc at the fist's power.
function fistCaster() { return { kind: 'caster', bp: 'gauntlet', base: { power: T.hands.fist }, slots: [{ stone: 'arc', tier: 1 }], affixes: [], fist: true }; }

// A press (or a release, charged) of a hand's button: its whole circuit.
function castHand(slot, item, h, charged) {
  const d = Game.dive, p = d.p, C = T.circuits, it = item || fistCaster(), B = casterBase(it);
  const style = (bpOf(it) || {}).style || 'wand', P = parseCircuit(it.slots);
  let cost = it.fist ? 0 : circuitCost(it, P);
  if (charged) cost *= C.chargedCost;
  if (p.charge < cost) { p.lowCharge = 0.4; return false; }
  p.charge -= cost;
  // an Arc's combo: a press soon after the last carries it on
  const arc = P.groups.some((g) => !g.triggered && g.form === 'arc');
  h.step = arc && !charged && h.comboT > 0 ? (h.step + 1) % C.forms.arc.combo.length : 0;
  h.cd = handWait(it, P, h.step) / (1 + d.stats.castSpeed / 100);
  h.comboT = arc && !charged ? T.hands.comboWindow + h.cd : 0;
  d.castRange = B.aim;
  const first = P.groups.filter((g) => !g.triggered);
  castFxStart(d, it, slot, style, charged, first.length ? first.map((g) => (charged && g.form === 'arc' ? 'nova' : g.form)) : ['spark']);
  const cx = { item: it, power: it.base.power, style, charged, step: h.step, from: null, aim: null, mult: 1, spread: 0, echo: false };
  // the Twice-Told: everything again, fanned a little
  for (let k = 0; k < (it.power === 'echo' ? 2 : 1); k++) {
    const c = k ? Object.assign({}, cx, { spread: 0.25 }) : cx;
    if (!first.length) fireSpark(c);
    for (const g of first) fireGroup(g, c);
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

// A group fires: each Split of it, an Echo later, and what it triggers.
// cx: { item, power, style, charged, step (an Arc's), from (a point it
// fires from, or null for the diver), aim, mult, spread, echo (this is an
// echo's recast), exclude (a foe not to aim at first) }.
function fireGroup(g, cx) {
  const d = Game.dive;
  if (!d) return;
  const C = T.circuits, Gl = C.glyphs, n = (id) => g.glyphs[id] || 0, st = d.stats, B = C.bases[cx.style] || C.bases.wand;
  // a held Arc bursts into a Nova (from the diver)
  const form = cx.charged && g.form === 'arc' && !cx.from ? 'nova' : g.form;
  const F = C.forms[g.form], close = !!F.close;
  const els = g.els.length ? g.els.slice() : ['force'];
  let dmg = cx.power * F.mult * stonePower(g) * Math.pow(Gl.amplify.dmg, n('amplify')) * cx.mult * (1 + st.spellDmg / 100 + (close ? st.closeDmg / 100 : 0)) * affinityMult(cx.item, els);
  if (cx.charged) dmg *= g.form === 'arc' ? F.heldMult : C.chargedMult;
  const s = { g, cx, form, F: C.forms[form], refund: F.refund || 0, refundLeft: close ? F.refundMost : 0, close, els, dmg, col: groupCol(g), area: B.area * Math.pow(Gl.amplify.area, n('amplify')), chain: n('chain'), linger: n('linger') };
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

// One shot of a group: when it first hits something, or ends, it sets off
// the Form it triggers (once); where it ends, it leaves a Linger's field.
function circuitInstance(s, mult) {
  const inst = {
    fired: false,
    hit(x, y, foe, a) {
      if (inst.fired) return;
      inst.fired = true;
      const next = s.g.next;
      if (next) fireGroup(next, Object.assign({}, s.cx, { from: { x, y }, aim: a, exclude: foe, mult: s.cx.mult * mult, echo: false, spread: 0 }));
    },
    end(x, y, a) {
      inst.hit(x, y, null, a);
      if (s.linger) lingerField(s, x, y, mult);
    },
  };
  return inst;
}

// A Linger's field: the group's element on the ground, hurting what's in it.
function lingerField(s, x, y, mult) {
  const Gl = T.circuits.glyphs.linger, t = Gl.time * s.linger;
  Game.dive.puddles.push({ x, y, r: s.F.field * s.area, t, max: t, dps: s.dmg * mult * Gl.dps, mine: true, els: s.els, col: s.col, every: Gl.every });
}

// A foe struck by a group: crits, its elements, knockback (more for Force),
// the charge a close Form gives back, and a Chain's leaps.
function circuitHit(s, e, dmg, opts = {}) {
  const d = Game.dive, st = d.stats, p = d.p;
  if (e.dead) return;
  const crit = d.rng.f(100) < st.crit, kf = s.els.includes('force') ? T.circuits.force.knock : 1;
  hurtEnemy(e, dmg * (crit ? 2 : 1), { spell: true, crit, els: s.els, heavy: !!opts.heavy, knock: opts.knock ? { x: opts.knock.x * kf, y: opts.knock.y * kf } : null });
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
    for (const o of d.enemies) { if (o.dead || hit.includes(o)) continue; const m = dist(o.x, o.y, cur.x, cur.y); if (m < bd) { bd = m; next = o; } }
    if (!next) break;
    k *= G.falloff;
    d.fx.push({ kind: 'arc', x: cur.x, y: cur.y - 5, x2: next.x, y2: next.y - 5, t: 0.18, max: 0.18, col: s.col });
    circuitHit(s, next, k, { noChain: true });
    hit.push(next); cur = next;
  }
}

// Arc: a sweep of light in front, everything in its reach and angle struck.
// From the diver it aims at the nearest foe within autoAim and lunges a
// little; the third of the combo is heavy and staggers.
function castArc(s, off, mult, inst, centre) {
  const d = Game.dive, p = d.p, F = s.F, cx = s.cx, A = F.combo[cx.step % F.combo.length], heavy = cx.step % F.combo.length === F.combo.length - 1;
  const from = cx.from, range = F.range * s.area;
  const aim = circuitAim(from, T.hands.autoAim, cx.exclude, cx.aim), a = aim.a + off + cx.spread;
  const dir = { x: Math.cos(a), y: Math.sin(a) };
  let x0 = from ? from.x : p.x, y0 = from ? from.y : p.y;
  if (!from && centre) {
    p.fx = Math.cos(aim.a); p.fy = Math.sin(aim.a);
    // (the reach is measured from where it began, so the lunge can't carry
    // the diver past something standing on top of it)
    moveBody(d.floor, p, dir.x * A[4], dir.y * A[4], T.player.radius);
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
  const aim = circuitAim(cx.from, casterBase(cx.item).aim, cx.exclude, cx.aim), a = aim.a + off;
  let x, y;
  if (cx.from) { x = cx.from.x + Math.cos(a) * (off ? r * F.splitOut : 0); y = cx.from.y + Math.sin(a) * (off ? r * F.splitOut : 0); }
  else if (aim.target && !off) { x = aim.target.x; y = aim.target.y; }
  else { x = p.x + Math.cos(a) * F.ahead; y = p.y + Math.sin(a) * F.ahead; }
  for (const e of d.enemies) {
    if (e.dead || e.boss || e.type === 'hollow' || T.enemies[e.type].rooted) continue;
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
  d.auras.push({ kind: 'glaive', follow: !cx.from, x: o.x, y: o.y, r: F.radius * s.area, t: F.time, max: F.time, age: 0, n: F.blades * k, a, spin: F.spin, reach: F.reach * Math.sqrt(s.area), dmg: s.dmg * mult, s, inst: circuitInstance(s, mult), seen: new Map(), col: s.col });
  castFxFor(T.castFx.shapeOf.glaive, s.g.els[0] || null, o, a, { r: F.radius * s.area, col: s.col });
}

// Ward: a shield that soaks damage for a while; what strikes it is struck
// back with its element. When it breaks or fades, it sets off what it
// triggers and leaves its Linger's field.
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
  const aim = circuitAim(cx.from, casterBase(cx.item).aim, cx.exclude, cx.aim), a = aim.a + off + cx.spread;
  const o = cx.from || d.p, big = cx.charged && form !== 'orb';
  const n = (id) => s.g.glyphs[id] || 0;
  d.bolts.push({
    x: o.x, y: o.y - (cx.from ? 6 : 8), vx: Math.cos(a) * F.speed, vy: Math.sin(a) * F.speed, dmg: s.dmg * mult, kind: form, t: F.life,
    chain: form === 'bolt' ? (d.stats.powers.stormcaller ? 2 : 0) + n('chain') * C.glyphs.chain.jumps : 0,
    pierce: (F.pierce || 0) + n('pierce') * C.glyphs.pierce.more + (big ? C.chargedPierce : 0),
    hitIds: cx.exclude ? [cx.exclude] : [], big, element: s.g.els[0] || null, col: s.col, s, inst,
    orb: form === 'orb' ? { r: F.radius * s.area, every: F.every, tick: F.every * 0.4, pulse: 0 } : null,
  });
}

// What a caster with no Form casts: a weak bolt.
function fireSpark(cx) {
  const d = Game.dive, S = T.circuits.spark;
  const s = { g: { form: 'spark', els: [], glyphs: {}, next: null }, cx, form: 'spark', F: S, refund: 0, refundLeft: 0, els: ['force'], dmg: cx.power * S.mult * (cx.charged ? T.circuits.chargedMult : 1) * (1 + d.stats.spellDmg / 100), col: ART.forms.bolt, area: 1, chain: 0, linger: 0 };
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
    if (b.orb) {
      // an orb drifts through, pulsing
      if ((b.orb.tick -= dt) <= 0) {
        b.orb.tick = b.orb.every; b.orb.pulse = Game.realT;
        for (const e of d.enemies) if (!e.dead && dist(e.x, e.y, b.x, b.y + 6) < b.orb.r + e.r) circuitHit(b.s, e, b.dmg, { knock: norm(e.x - b.x, e.y - b.y - 6) });
      }
      continue;
    }
    for (const e of d.enemies) {
      if (e.dead || b.hitIds.includes(e) || dist(b.x, b.y, e.x, e.y - 5) > e.r + (b.big ? 7 : 4)) continue;
      const sp0 = Math.hypot(b.vx, b.vy) || 1, kb = b.big ? 120 : 50;
      circuitHit(b.s, e, b.dmg, { knock: { x: (b.vx / sp0) * kb, y: (b.vy / sp0) * kb }, heavy: b.big, noChain: b.kind === 'bolt' });
      if (b.big) freezeFrame(T.impact.hitstop * 0.6, false);
      castFxImpact(b, 'hit');
      b.hitIds.push(e);
      b.inst.hit(e.x, e.y, e, Math.atan2(b.vy, b.vx));
      if (b.pierce > 0) { b.pierce--; continue; }
      // a bolt's Chain (and the Stormcaller's): on to the next nearest
      const next = b.chain > 0 && d.enemies.filter((o) => !o.dead && !b.hitIds.includes(o) && dist(o.x, o.y, e.x, e.y) < T.circuits.glyphs.chain.range * 1.5).sort((o1, o2) => dist(o1.x, o1.y, e.x, e.y) - dist(o2.x, o2.y, e.x, e.y))[0];
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
    } else if (au.kind === 'well') {
      const W = T.circuits.forms.well;
      for (const e of d.enemies) {
        if (e.dead || e.boss || e.type === 'hollow' || T.enemies[e.type].rooted) continue;
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
