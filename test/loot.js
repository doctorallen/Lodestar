'use strict';
// The loot tables, without a browser: thousands of forgings (every
// blueprint, every part that binds it, exotics, every quality), relics and
// rune-bench changes at every tier, checked for the right number of affixes
// for their rarity, the binding's family guaranteed as many times as its
// grade, a heart's legendary, an exotic's element, no affix twice, affixes
// only from families the kind can roll (or an exotic's or binding's),
// legendary powers that fit their kind, set pieces in set slots, sockets as
// the blueprint says, salvage giving back the binding, positive numbers and
// a name on
// everything; rolls within their range and comparisons that read; outfits
// that add up within the caps; and the star's magnitudes and the biomes they
// open. Casters get their slots from the anvil; stones come out as their
// blueprint says, a tier up from a fine forge; and thousands of random
// circuits parse by the rules, cost what their parts add up to, and read in
// words with nothing missing.
const { sandbox } = require('./sandbox');
const { finish } = require('./lib-node');

const G = sandbox(['js/util.js', 'js/tuning.js', 'js/floor.js', 'js/items.js']);
const failures = [];
const fail = (m) => { if (failures.length < 100) failures.push(m); };

function checkItem(it, at, family, binding) {
  if (!it.name) fail(`${at}: no name`);
  if (it.kind === 'stone' || it.kind === 'relic') return;
  const want = G.T.items.affixes[it.rarity];
  if (it.affixes.length !== want) fail(`${at}: ${it.rarity} ${it.kind} has ${it.affixes.length} affixes, not ${want}`);
  const ids = it.affixes.map((a) => a.id);
  if (new Set(ids).size !== ids.length) fail(`${at}: an affix twice: ${ids}`);
  for (const a of it.affixes) {
    const fam = G.AFFIXES[a.id].family;
    const bound = it.binding && G.PARTS[it.binding.kind].family;
    if (!G.KIND_FAMILIES[it.kind].includes(fam) && fam !== family && fam !== bound) fail(`${at}: a ${it.kind} rolled ${a.id}`);
    if (!(a.v > 0)) fail(`${at}: ${a.id} is ${a.v}`);
    if (/NaN|undefined/.test(G.fmtAffix(a))) fail(`${at}: "${G.fmtAffix(a)}"`);
  }
  if (it.power && !G.LEGENDARIES[it.power].kinds.includes(it.kind)) fail(`${at}: ${it.power} on a ${it.kind}`);
  if (it.rarity === 'legendary' && !it.power) fail(`${at}: a legendary without a power`);
  if (it.set && !G.SETS[it.set].pieces[it.kind]) fail(`${at}: a set ${it.kind}`);
  if (it.kind === 'caster' && !(it.slots && it.slots.length >= 3 && it.slots.length <= 6)) fail(`${at}: a caster with ${it.slots && it.slots.length} slots`);
  if (/NaN|undefined/.test(G.itemBaseLine(it))) fail(`${at}: "${G.itemBaseLine(it)}"`);
}

const rarities = {};
for (let seed = 1; seed <= 3000; seed++) {
  const rng = new G.Rng(seed);
  const tier = 1 + (seed % 6);
  const relic = G.unsealRelic(rng, G.makeRelic(tier));
  checkItem(relic, `relic ${seed}`);
  if (!['rare', 'legendary', 'set'].includes(relic.rarity)) fail(`relic ${seed}: unsealed ${relic.rarity}`);
  // the forge: any blueprint, any part that binds it, sometimes an exotic, at any quality
  const bpId = G.BP_IDS[seed % G.BP_IDS.length], bp = G.BLUEPRINTS[bpId];
  const stacks = G.PART_STACK_IDS.filter((id) => G.bindsWith(bpId, id));
  if (!stacks.length && bp.parts) { fail(`${bpId}: nothing binds it`); continue; }
  if (bp.kind === 'stone' && !bp.parts && !(bp.exotic === null || G.T.exotics.some((x) => x.id === bp.exotic && x.element === bp.stone))) fail(`${bpId}: made from the wrong exotic`);
  const part = stacks.length ? stacks[seed % stacks.length] : null, pk = part && G.parsePart(part);
  const ex = bp.kind === 'stone' ? (bp.exotic ? G.T.exotics.find((x) => x.id === bp.exotic) : null) : seed % 3 ? null : G.T.exotics[seed % G.T.exotics.length];
  const q = seed % 4, ore = G.T.ores[tier - 1].id;
  const made = G.forgeItem(rng, bpId, ore, part, ex && ex.id, q);
  if (!made) { fail(`forged ${bpId} ${seed}: nothing`); continue; }
  if (bp.kind === 'stone') {
    if (made.kind !== 'stone' || made.stone !== bp.stone) fail(`forged ${bpId} ${seed}: not its stone`);
    if (made.tier !== Math.min(6, tier + (q >= 2 ? 1 : 0))) fail(`forged ${bpId} ${seed}: a tier ${made.tier} stone from tier ${tier} ore at quality ${q}`);
    if (/NaN|undefined/.test(G.itemBaseLine(made))) fail(`${bpId}: "${G.itemBaseLine(made)}"`);
    continue;
  }
  rarities[made.rarity] = (rarities[made.rarity] || 0) + 1;
  checkItem(made, `forged ${bpId} ${seed}`, ex && ex.family);
  if (bp.kind === 'caster' && made.slots.length !== G.casterSlotCount(bpId, q)) fail(`forged ${bpId} ${seed}: ${made.slots.length} slots at quality ${q}`);
  if (bp.kind === 'caster' && made.slots.some(Boolean)) fail(`forged ${bpId} ${seed}: came out with stones in it`);
  if (made.bp !== bpId) fail(`forged ${bpId} ${seed}: came out a ${made.bp}`);
  const fam = pk && G.PARTS[pk.kind].family;
  const famCount = made.affixes.filter((a) => G.AFFIXES[a.id].family === fam).length;
  const famSize = Object.keys(G.AFFIXES).filter((id) => G.AFFIXES[id].family === fam).length;
  if (fam && famCount < Math.min(pk.grade, G.T.items.affixes[made.rarity] - (ex && ex.family && ex.family !== fam ? 1 : 0), famSize)) fail(`forged ${bpId} ${seed}: bound with ${part} but only ${famCount} ${fam} affixes`);
  if (pk && pk.kind === 'heart' && q >= 2 && made.rarity !== 'legendary') fail(`forged ${bpId} ${seed}: a heart at quality ${q} came out ${made.rarity}`);
  if (ex && ex.element && bp.kind === 'caster' && !(made.withStone && made.withStone.stone === ex.element)) fail(`forged ${bpId} ${seed}: ${ex.id} brought no ${ex.element} stone`);
  if (ex && ex.family && !made.affixes.some((a) => G.AFFIXES[a.id].family === ex.family)) fail(`forged ${seed}: ${ex.id} gave no ${ex.family} affix`);
  if (bp.kind === 'pick' && made.base.power !== Math.min(G.T.ores.length, tier + (ex && ex.tierUp ? 1 : 0)) + 1) fail(`forged ${seed}: a ${ore} pick breaks tier ${made.base.power}`);
  // the rune bench
  if (made.affixes.length) {
    G.rerollAffix(rng, made, 0); checkItem(made, `rerolled ${seed}`, ex && ex.family);
    const before = made.affixes[0].v;
    G.upgradeAffix(made, 0);
    if (!(made.affixes[0].v > before)) fail(`upgraded ${seed}: ${before} → ${made.affixes[0].v}`);
  }
  if (made.rarity === 'common' || made.rarity === 'magic') {
    const was = made.affixes.length;
    G.addAffix(rng, made);
    if (made.affixes.length !== was + 1) fail(`added ${seed}: ${was} → ${made.affixes.length}`);
  }
  for (const a of made.affixes) { const r = G.affixRoll(a, made.tier); if (!(r >= -0.05 && r <= 2)) fail(`roll ${seed}: ${a.id} ${a.v} at tier ${made.tier} rolled ${r}`); }
  for (const l of G.compareLines(made, relic)) if (/NaN|undefined/.test(l.text)) fail(`compare ${seed}: "${l.text}"`);
  if (G.compareLines(made, made).length) fail(`compare ${seed}: an item differs from itself`);
  const y = G.salvageYield(rng, made);
  if (!(y.n > 0) || !G.T.ores.some((o) => o.id === y.ore)) fail(`salvage ${seed}: ${JSON.stringify(y)}`);
  if (y.part !== part) fail(`salvage ${seed}: gave back ${y.part}, not ${part}`);
}
for (const r of ['common', 'magic', 'rare', 'legendary']) if (!rarities[r]) fail(`no ${r} forges in 3000`);
// every blueprint is somewhere to be found or known from the start
for (const id of G.BP_IDS) if (!G.BLUEPRINTS[id].start && !Object.values(G.BLUEPRINT_BIOME || {}).flat().includes(id)) fail(`${id} can never be found`);
// every Form, Element and Glyph of the core set can be forged
for (const id of Object.keys(G.CIRCUIT_FORMS).concat(Object.keys(G.CIRCUIT_ELEMENTS), Object.keys(G.CIRCUIT_GLYPHS))) if (!G.BP_IDS.some((b) => G.BLUEPRINTS[b].stone === id)) fail(`no blueprint makes a ${id} stone`);

// outfits stay within the caps
for (let seed = 1; seed <= 500; seed++) {
  const rng = new G.Rng(seed * 7);
  const eq = { main: G.makeItem(rng, 'caster', 6, { rarity: 'legendary', bp: 'gauntlet' }), off: G.makeItem(rng, 'caster', 6, { rarity: 'rare', bp: 'staff' }), pick: G.makeItem(rng, 'pick', 6, { rarity: 'set' }), armor: G.makeItem(rng, 'armor', 6, { rarity: 'set' }), charm: G.makeItem(rng, 'charm', 6, { rarity: 'set' }) };
  const st = G.computeStats(eq, { vitality: 5, proximity: 5, capacity: 5, clarity: 5, stride: 5 });
  for (const k in G.T.caps) if (st[k] > G.T.caps[k]) fail(`outfit ${seed}: ${k} ${st[k]} over its cap`);
  if (st.sets.regalia !== 3 || !st.regalia3) fail(`outfit ${seed}: three set pieces don't make the set`);
  if (!(st.maxHp > G.T.player.hp)) fail(`outfit ${seed}: plate added no health`);
}
const start = G.startingGear(new G.Rng(1));
if (start.pick.base.power !== 1 || start.main.base.power !== 5 || start.main.bp !== 'gauntlet' || start.main.slots.length !== 3 || start.main.slots[0].stone !== 'arc' || start.off.bp !== 'wand' || start.off.slots[0].stone !== 'bolt') fail('the starting gear changed');

// circuits: random rows of stones, read by the rules
const ids = Object.keys(G.CIRCUIT_FORMS).concat(Object.keys(G.CIRCUIT_ELEMENTS), Object.keys(G.CIRCUIT_GLYPHS));
const kindOf = (id) => G.stoneKind(id);
const C = G.T.circuits;
for (let seed = 1; seed <= 4000; seed++) {
  const rng = new G.Rng(seed * 13), n = rng.i(3, 6), bp = rng.pick(['wand', 'gauntlet', 'staff']);
  const slots = Array.from({ length: n }, () => (rng.chance(0.15) ? null : G.makeStone(rng.pick(ids), rng.i(1, 6))));
  const P = G.parseCircuit(slots), at = `circuit ${seed} [${slots.map((s) => (s ? s.stone : '-')).join(' ')}]`;
  // every stone is in a group or loose, once
  const placed = P.groups.reduce((k, g) => k + g.stones.length, 0) + P.loose.length;
  if (placed !== slots.filter(Boolean).length) fail(`${at}: ${placed} stones placed of ${slots.filter(Boolean).length}`);
  // what comes before the first Form is loose
  const firstForm = slots.findIndex((s) => s && kindOf(s.stone) === 'form');
  for (let i = 0; i < (firstForm < 0 ? n : firstForm); i++) if (slots[i] && !P.loose.includes(slots[i])) fail(`${at}: a stone before the first Form did something`);
  for (const g of P.groups) {
    if (g.els.length > 2 || new Set(g.els).size !== g.els.length) fail(`${at}: a Form with elements ${g.els}`);
    if (kindOf(g.form) !== 'form') fail(`${at}: a group of ${g.form}`);
  }
  // a Trigger links its Form to the next, and only then
  P.groups.forEach((g, i) => { const nx = P.groups[i + 1]; if (!!(g.glyphs.trigger && nx) !== !!(nx && nx.triggered && g.next === nx)) fail(`${at}: a Trigger's link is wrong`); });
  if (P.dangling !== !!(P.groups.length && P.groups[P.groups.length - 1].glyphs.trigger)) fail(`${at}: a Trigger at the end isn't marked`);
  // the cost is the sum of the groups', each its Form's times its glyphs'
  const it = { kind: 'caster', bp, slots, base: { power: 6 }, affixes: [] };
  let want = 0;
  for (const g of P.groups) { const F = C.forms[g.form]; let c = F.cost - (F.close && bp === 'gauntlet' ? 1 : 0); for (const id in g.glyphs) c *= Math.pow(C.glyphs[id].cost, g.glyphs[id]); want += Math.max(1, c); }
  if (!P.groups.length) want = C.spark.cost;
  const cost = G.circuitCost(it);
  if (Math.abs(cost - want) > 0.06) fail(`${at}: costs ${cost}, not ${want}`);
  const R = G.circuitReadout(it);
  for (const l of R.lines) if (/NaN|undefined|\[object/.test(l.text)) fail(`${at}: "${l.text}"`);
  if (!R.lines.length) fail(`${at}: says nothing`);
}
// the parse, by the rules
const SS = (...a) => a.map((id) => (id ? G.makeStone(id, 1) : null));
const P1 = G.parseCircuit(SS('lance', 'frost', 'pierce', 'trigger', 'nova', 'shock'));
if (P1.groups.length !== 2 || !P1.groups[1].triggered || P1.groups[0].next !== P1.groups[1] || P1.groups[1].els[0] !== 'shock' || P1.groups[0].els[0] !== 'frost') fail('LANCE FROST PIERCE TRIGGER NOVA SHOCK does not parse as a lance that sets off a shock nova');
const P2 = G.parseCircuit(SS('bolt', 'nova'));
if (P2.groups.length !== 2 || P2.groups[1].triggered) fail('two Forms in a row do not fire together');
const P3 = G.parseCircuit(SS('shock', 'arc', 'ember', 'frost', 'blight'));
if (P3.loose.length !== 2 || P3.groups[0].els.join() !== 'ember,frost') fail('a stone before the Form, or a third Element, did something');
const P4 = G.parseCircuit(SS('bolt', 'split', 'trigger'));
if (!P4.dangling) fail('a Trigger at the end is not marked as setting off nothing');
if (G.circuitCost({ bp: 'wand', slots:SS('arc', 'quicken') }) !== Math.round(3 * C.glyphs.quicken.cost * 10) / 10) fail('ARC QUICKEN does not cost a third less');
if (G.circuitCost({ bp: 'gauntlet', slots:SS('arc', null, null) }) !== C.forms.arc.cost - 1) fail('a gauntlet does not take 1 off a close Form');
// resonances fill the caster exactly
for (const r of G.RESONANCES) {
  if (!r.seq.every((id) => ids.includes(id))) fail(`${r.name} needs a part outside the core set`);
  if (!G.circuitResonance(SS(...r.seq)) || G.circuitResonance(SS(...r.seq, null))) fail(`${r.name}: a resonance must fill its caster exactly`);
}

// the star
const S = G.T.star;
if (G.magnitudeOf(0) !== 1) fail('a fresh star is not magnitude 1');
S.levels.forEach((need, i) => { if (G.magnitudeOf(need) !== i + 1) fail(`${need} points is not magnitude ${i + 1}`); });
if (G.biomeOpen({ star: 0 }, 1) || !G.biomeOpen({ star: S.levels[S.biomeAt[1] - 1] }, 1)) fail('the Choir opens at the wrong magnitude');
if (G.attunePointsLeft({ star: S.levels[3], attune: { vitality: 1 } }) !== 2) fail('attunement points are miscounted');

finish('loot', failures);
