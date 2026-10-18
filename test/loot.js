'use strict';
// The loot tables, without a browser: thousands of drops, crafts, relics
// and rune-bench changes at every tier, checked for the right number of
// affixes for their rarity, no affix twice, affixes only from families the
// kind can roll (or an exotic's), legendary powers that fit their kind, set
// pieces in set slots, sockets on foci, positive numbers and a name on
// everything; rolls within their range and comparisons that read; outfits
// that add up within the caps; and the star's magnitudes and the biomes they
// open.
const { sandbox } = require('./sandbox');
const { finish } = require('./lib-node');

const G = sandbox(['js/util.js', 'js/tuning.js', 'js/floor.js', 'js/items.js']);
const failures = [];
const fail = (m) => { if (failures.length < 100) failures.push(m); };

function checkItem(it, at, family) {
  if (!it.name) fail(`${at}: no name`);
  if (it.kind === 'core' || it.kind === 'relic') return;
  const want = G.T.items.affixes[it.rarity];
  if (it.affixes.length !== want) fail(`${at}: ${it.rarity} ${it.kind} has ${it.affixes.length} affixes, not ${want}`);
  const ids = it.affixes.map((a) => a.id);
  if (new Set(ids).size !== ids.length) fail(`${at}: an affix twice: ${ids}`);
  for (const a of it.affixes) {
    const fam = G.AFFIXES[a.id].family;
    if (!G.KIND_FAMILIES[it.kind].includes(fam) && fam !== family) fail(`${at}: a ${it.kind} rolled ${a.id}`);
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
  const tier = 1 + (seed % 6), level = 1 + (seed % 12);
  const it = G.rollDrop(rng, tier, level, seed % 7 === 0 ? 'magic' : undefined);
  rarities[it.rarity] = (rarities[it.rarity] || 0) + 1;
  checkItem(it, `drop ${seed}`);
  if (seed % 7 === 0 && it.rarity === 'common') fail(`drop ${seed}: an elite's drop came out common`);
  const relic = G.unsealRelic(rng, G.makeRelic(tier));
  checkItem(relic, `relic ${seed}`);
  if (!['rare', 'legendary', 'set'].includes(relic.rarity)) fail(`relic ${seed}: unsealed ${relic.rarity}`);
  // the forge, with and without an exotic
  const kind = ['blade', 'focus', 'armor', 'charm', 'pick'][seed % 5], ex = G.T.exotics[seed % 5];
  const ore = G.T.ores[tier - 1].id;
  const made = G.forgeItem(rng, kind, ore, ex && ex.id);
  checkItem(made, `forged ${kind} ${seed}`, ex && ex.family);
  if (ex && ex.family && !made.affixes.some((a) => G.AFFIXES[a.id].family === ex.family)) fail(`forged ${seed}: ${ex.id} gave no ${ex.family} affix`);
  if (kind === 'pick' && made.base.power !== tier + 1) fail(`forged ${seed}: a ${ore} pick breaks tier ${made.base.power}`);
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
  for (const a of made.affixes) { const r = G.affixRoll(a, made.tier); if (!(r >= -0.05 && r <= 1.6)) fail(`roll ${seed}: ${a.id} ${a.v} at tier ${made.tier} rolled ${r}`); }
  for (const l of G.compareLines(made, it)) if (/NaN|undefined/.test(l.text)) fail(`compare ${seed}: "${l.text}"`);
  if (G.compareLines(made, made).length) fail(`compare ${seed}: an item differs from itself`);
  const y = G.salvageYield(rng, made);
  if (!(y.n > 0) || !G.T.ores.some((o) => o.id === y.ore)) fail(`salvage ${seed}: ${JSON.stringify(y)}`);
}
for (const r of G.RARITIES) if (!rarities[r]) fail(`no ${r} drops in 3000`);

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
