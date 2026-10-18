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
// open.
const { sandbox } = require('./sandbox');
const { finish } = require('./lib-node');

const G = sandbox(['js/util.js', 'js/tuning.js', 'js/floor.js', 'js/items.js']);
const failures = [];
const fail = (m) => { if (failures.length < 100) failures.push(m); };

function checkItem(it, at, family, binding) {
  if (!it.name) fail(`${at}: no name`);
  if (it.kind === 'core' || it.kind === 'relic') return;
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
  if (it.kind === 'focus' && !(it.sockets && it.sockets.length)) fail(`${at}: a focus without a socket`);
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
  if (!stacks.length) { fail(`${bpId}: nothing binds it`); continue; }
  const part = stacks[seed % stacks.length], pk = G.parsePart(part);
  const ex = seed % 3 ? null : G.T.exotics[seed % G.T.exotics.length];
  const q = seed % 4, ore = G.T.ores[tier - 1].id;
  const made = G.forgeItem(rng, bpId, ore, part, ex && ex.id, q);
  if (!made) { fail(`forged ${bpId} ${seed}: nothing`); continue; }
  rarities[made.rarity] = (rarities[made.rarity] || 0) + 1;
  if (bp.kind === 'core') { if (made.kind !== 'core' || made.core !== bp.core) fail(`forged ${bpId} ${seed}: not its core`); continue; }
  checkItem(made, `forged ${bpId} ${seed}`, ex && ex.family);
  if (made.bp !== bpId) fail(`forged ${bpId} ${seed}: came out a ${made.bp}`);
  const fam = G.PARTS[pk.kind].family;
  const famCount = made.affixes.filter((a) => G.AFFIXES[a.id].family === fam).length;
  if (fam && famCount < Math.min(pk.grade, G.T.items.affixes[made.rarity])) fail(`forged ${bpId} ${seed}: bound with ${part} but only ${famCount} ${fam} affixes`);
  if (pk.kind === 'heart' && q >= 2 && made.rarity !== 'legendary') fail(`forged ${bpId} ${seed}: a heart at quality ${q} came out ${made.rarity}`);
  if (ex && ex.element && (bp.kind === 'blade' || bp.kind === 'focus') && made.element !== ex.element) fail(`forged ${bpId} ${seed}: ${ex.id} gave no ${ex.element}`);
  if (ex && ex.family && !made.affixes.some((a) => G.AFFIXES[a.id].family === ex.family)) fail(`forged ${seed}: ${ex.id} gave no ${ex.family} affix`);
  if (bp.kind === 'pick' && made.base.power !== tier + 1) fail(`forged ${seed}: a ${ore} pick breaks tier ${made.base.power}`);
  if (bp.sockets && (!made.sockets || made.sockets.length < bp.sockets[0])) fail(`forged ${bpId} ${seed}: ${made.sockets ? made.sockets.length : 0} sockets`);
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
for (const id of G.BP_IDS) if (!G.BLUEPRINTS[id].start && !Object.values(G.BLUEPRINT_BIOME || {}).flat().includes(id) && G.BLUEPRINTS[id].kind !== 'core') fail(`${id} can never be found`);

// outfits stay within the caps
for (let seed = 1; seed <= 500; seed++) {
  const rng = new G.Rng(seed * 7);
  const eq = { main: G.makeItem(rng, 'blade', 6, { rarity: 'legendary' }), off: G.makeItem(rng, 'focus', 6, { rarity: 'rare' }), pick: G.makeItem(rng, 'pick', 6, { rarity: 'set' }), armor: G.makeItem(rng, 'armor', 6, { rarity: 'set' }), charm: G.makeItem(rng, 'charm', 6, { rarity: 'set' }) };
  const st = G.computeStats(eq, { vitality: 5, might: 5, capacity: 5, clarity: 5, stride: 5 });
  for (const k in G.T.caps) if (st[k] > G.T.caps[k]) fail(`outfit ${seed}: ${k} ${st[k]} over its cap`);
  if (st.sets.regalia !== 3 || !st.regalia3) fail(`outfit ${seed}: three set pieces don't make the set`);
  if (!(st.maxHp > G.T.player.hp)) fail(`outfit ${seed}: plate added no health`);
}
const start = G.startingGear(new G.Rng(1));
if (start.pick.base.power !== 1 || start.main.base.dmg !== 5) fail('the starting gear changed');

// the star
const S = G.T.star;
if (G.magnitudeOf(0) !== 1) fail('a fresh star is not magnitude 1');
S.levels.forEach((need, i) => { if (G.magnitudeOf(need) !== i + 1) fail(`${need} points is not magnitude ${i + 1}`); });
if (G.biomeOpen({ star: 0 }, 1) || !G.biomeOpen({ star: S.levels[S.biomeAt[1] - 1] }, 1)) fail('the Choir opens at the wrong magnitude');
if (G.attunePointsLeft({ star: S.levels[3], attune: { vitality: 1 } }) !== 2) fail('attunement points are miscounted');

finish('loot', failures);
