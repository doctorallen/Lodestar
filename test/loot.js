'use strict';
// The gear tables, without a browser. Crafted bases: every recipe in every
// ore at every quality comes out exactly as its recipe says, with the anvil
// only ever adding (stats, and a frame's extra slot at a masterwork), no
// affixes and no sockets; costs that name real things. A rig frame's two
// spells have a Form, an Element and a Mod part, and the extra part its ore
// gives from Resonite up, at a masterwork or with a Lodestone shard. Cores:
// a forged one plain from a rough forge, tempered by a better one (a bonus
// of its kind, a tier up, a masterwork's choice of three); thousands found
// at every level, tier and floor of rarity, each with one bonus of its
// kind's within its range, a legendary with a power, and a name; a tier up
// by the rules; salvage giving threads. Research reveals every recipe not
// known from the start. Old saves (from before modules, before the rig,
// and with modules) turn into bases, cores and rig frames: modules into
// threads and legendary cores, every power kept, no socket left. Outfits
// add up within the caps. Then thousands of random spells cost what their
// parts add up to, read in a short line with nothing missing, and wake the
// resonances whose parts they hold; and the star's magnitudes.
const fs = require('fs');
const path = require('path');
const { sandbox } = require('./sandbox');
const { finish } = require('./lib-node');

const G = sandbox(['js/util.js', 'js/tuning.js', 'js/floor.js', 'js/items.js']);
const failures = [];
const fail = (m) => { if (failures.length < 100) failures.push(m); };
const bad = (s) => /NaN|undefined|\[object/.test(s);

// --- bases -----------------------------------------------------------------
const gearIds = G.BP_IDS.filter((id) => ['caster', 'armor', 'charm', 'pick'].includes(G.BLUEPRINTS[id].kind));
const extraOf = (tier, q, shard) => G.frameExtra(tier, q, shard, G.T.ores[tier - 1].id);
for (const id of gearIds) {
  const bp = G.BLUEPRINTS[id];
  for (const ore of G.T.ores) {
    const plain = G.forgeItem(id, ore.id, null, 0), at = `${id} in ${ore.id}`;
    if (plain.kind !== bp.kind || plain.bp !== id || plain.tier !== ore.tier) fail(`${at}: came out ${plain.kind} ${plain.bp} tier ${plain.tier}`);
    if (plain.affixes.length || plain.sockets) fail(`${at}: a crafted base rolled affixes or has sockets`);
    if (!plain.name || bad(plain.name) || bad(G.itemBaseLine(plain)) || bad(G.itemKindLine(plain))) fail(`${at}: "${plain.name}" / "${G.itemBaseLine(plain)}"`);
    const shape = (it) => it.spells.map((sp) => G.spellParts(sp).map(([k]) => k).join('+')).join();
    if (bp.kind === 'caster') {
      const x = extraOf(ore.tier, 0, false), want = x === 'glyph' ? 'form+el+m0+m1' : x === 'element' ? 'form+el+el2+m0' : x === 'form' ? 'form+form2+el+m0' : 'form+el+m0';
      if (plain.spells.length !== 2 || plain.extra !== x || shape(plain) !== `${want},${want}`) fail(`${at}: extra ${plain.extra}, spells ${shape(plain)}`);
      if (ore.tier >= G.T.circuits.rig.extraTier && !x) fail(`${at}: no extra part from tier ${ore.tier}`);
      if (ore.tier < G.T.circuits.rig.extraTier && x) fail(`${at}: an extra part below tier ${G.T.circuits.rig.extraTier}`);
      if (plain.slots || plain.links || plain.spells.some((sp) => G.spellCores(sp).length)) fail(`${at}: a frame came with cores, slots or links`);
    }
    const nums = (it) => Object.values(it.base);
    for (let q = 1; q <= 3; q++) {
      const it = G.forgeItem(id, ore.id, null, q);
      if (nums(it).some((v, i) => v < nums(plain)[i])) fail(`${at}: quality ${q} took something away (${JSON.stringify(it.base)} against ${JSON.stringify(plain.base)})`);
      if (bp.kind === 'caster' && q >= 3 && !it.extra) fail(`${at}: a masterwork frame has no extra part`);
      if (bp.kind === 'caster' && q < 3 && it.extra !== extraOf(ore.tier, q, false)) fail(`${at}: quality ${q} changed the extra part`);
      if (it.affixes.length || it.sockets) fail(`${at}: quality ${q} rolled affixes or sockets`);
    }
    if (bp.kind === 'pick' && plain.base.power !== ore.tier + 1) fail(`${at}: a pick that breaks tier ${plain.base.power}`);
    const cost = G.recipeCost(id, ore.id);
    if (!(cost.ore.n > 0) || cost.ore.id !== ore.id || !cost.parts.length || cost.parts.some((p) => !(p.n > 0) || !(G.PARTS[p.kind] || p.kind === 'any'))) fail(`${at}: costs ${JSON.stringify(cost)}`);
  }
  // riftglass forges a tier higher; an elemental exotic in a frame brings
  // its core; a Lodestone shard, the extra part
  const rg = G.forgeItem(id, 'ferrite', 'riftglass', 0);
  if (rg.tier !== 2) fail(`${id}: riftglass forged tier ${rg.tier}`);
  if (bp.kind === 'caster' && !(G.forgeItem(id, 'ferrite', 'voltaic', 0).withStone || {}).stone) fail(`${id}: Voltaic crystal brought no Shock core`);
  if (bp.kind === 'caster' && G.forgeItem(id, 'ferrite', 'lodeshard', 0).extra !== 'glyph') fail(`${id}: a Lodestone shard gave a Ferrite frame no second Mod`);
  if (bp.kind !== 'caster' && G.forgeItem(id, 'ferrite', 'lodeshard', 0).spells) fail(`${id}: a shard gave a non-frame spells`);
}
// each ore's extra part is of its kind
for (const ore of G.T.ores) { const x = extraOf(ore.tier, 3, false), want = G.T.circuits.ores[ore.id].extra || 'glyph'; if (x !== want) fail(`${ore.id}: extra ${x}, not ${want}`); }
// cores forged: their ore's tier, one more from a fine forge; plain from a
// rough one, tempered by a better: a bonus of their kind, a masterwork's
// choice of three, all different
for (const id of G.BP_IDS.filter((x) => G.BLUEPRINTS[x].kind === 'stone')) for (let q = 0; q < 4; q++) {
  const st = G.forgeItem(id, 'lumenite', null, q), at = `${id} at quality ${q}`;
  if (st.kind !== 'stone' || st.stone !== G.BLUEPRINTS[id].stone || st.tier !== 2 + (q >= 2 ? 1 : 0) || !/ core$/.test(st.name)) fail(`${at}: ${JSON.stringify(st)}`);
  if (q === 0 && (st.bonus || st.rarity !== 'common')) fail(`${at}: a rough core came tempered`);
  if (q > 0 && (!st.bonus || !G.CORE_BONUSES[G.stoneKind(st.stone)].includes(st.bonus.id) || st.rarity !== (q === 1 ? 'magic' : 'rare'))) fail(`${at}: ${JSON.stringify(st.bonus)} ${st.rarity}`);
  if (q === 3 && (!st.temperChoice || st.temperChoice.length !== G.T_CORES.choices || new Set(st.temperChoice.map((b) => b.id)).size !== st.temperChoice.length || !st.temperChoice.includes(st.bonus))) fail(`${at}: choices ${JSON.stringify(st.temperChoice)}`);
  if (q < 3 && st.temperChoice) fail(`${at}: a choice without a masterwork`);
  if (bad(G.itemKindLine(st)) || (st.bonus && bad(G.fmtAffix(st.bonus)))) fail(`${at}: words`);
}
// no wand, gauntlet, staff or Trigger left to make
for (const id of ['wand', 'gauntlet', 'staff', 'glyph_trigger']) if (G.BLUEPRINTS[id]) fail(`${id} can still be made`);
// paying a cost takes exactly it, and an unpaid one takes nothing
{
  const src = { ferrite: 40, cog1: 1, cog2: 2 }, cost = G.recipeCost('rig', 'ferrite');
  if (!G.recipePay(cost, src) || src.ferrite !== 40 - cost.ore.n || G.partsHave(src, 'cog') !== 3 - cost.parts[0].n || src.cog1) fail(`paying a rig: ${JSON.stringify(src)}`);
  const before = JSON.stringify(src);
  if (G.recipePay(G.recipeCost('shell', 'ferrite'), src) || JSON.stringify(src) !== before) fail('an unpaid cost took something');
}

// --- cores found -----------------------------------------------------------
const rarities = {}, kindsN = {};
const foes = ['crawler', 'wisp', 'construct', 'snapjaw', 'spitter', 'tusker', 'crab'];
for (let seed = 1; seed <= 4000; seed++) {
  const rng = new G.Rng(seed), level = seed % 14, tier = 1 + (seed % 6), min = ['common', 'magic', 'rare'][seed % 3];
  const c = G.rollCore(rng, level, tier, min, seed % 7 ? 1 : 3, { foe: foes[seed % foes.length], clime: 'bloomfen' }), at = `core ${seed}`;
  rarities[c.rarity] = (rarities[c.rarity] || 0) + 1; kindsN[G.stoneKind(c.stone)] = (kindsN[G.stoneKind(c.stone)] || 0) + 1;
  checkCore(c, at);
  if (G.RARITIES.indexOf(c.rarity) < G.RARITIES.indexOf(min)) fail(`${at}: ${c.rarity} under its floor ${min}`);
  if (c.tier !== tier) fail(`${at}: tier ${c.tier}, not ${tier}`);
  // a tier up: its bonus at least as strong, stronger if it grows
  const up = JSON.parse(JSON.stringify(c)), cost = G.coreUpgradeCost(up);
  if (c.tier < 6) {
    if (!cost || cost.ore.id !== G.T.ores[c.tier].id || !(cost.threads > 0)) fail(`${at}: upgrade costs ${JSON.stringify(cost)}`);
    G.coreUpgrade(up);
    if (up.tier !== c.tier + 1) fail(`${at}: upgraded to tier ${up.tier}`);
    if (up.bonus.id !== c.bonus.id || up.bonus.v < c.bonus.v || (!G.AFFIXES[up.bonus.id].flat && !(up.bonus.v > c.bonus.v))) fail(`${at}: upgrading ${c.bonus.id} ${c.bonus.v} gave ${up.bonus.v}`);
  } else if (cost || G.coreUpgrade(up)) fail(`${at}: a tier 6 core upgraded`);
  if (!(G.coreSalvageThreads(c) > 0)) fail(`${at}: salvage gives no threads`);
  if (G.compareLines(c, c).length) fail(`${at}: differs from itself`);
  for (const l of G.compareLines(c, null)) if (bad(l.text)) fail(`${at}: "${l.text}"`);
}
for (const r of G.RARITIES) if (!rarities[r]) fail(`no ${r} core in 4000`);
for (const k of ['form', 'element', 'glyph']) if (!kindsN[k]) fail(`no ${k} core in 4000`);
function checkCore(c, at) {
  if (c.kind !== 'stone' || !G.stoneKind(c.stone) || !c.name || bad(c.name)) fail(`${at}: ${JSON.stringify(c)}`);
  if (!c.bonus || !G.AFFIXES[c.bonus.id] || !(c.bonus.v > 0) || bad(G.fmtAffix(c.bonus))) fail(`${at}: bonus ${JSON.stringify(c.bonus)}`);
  if (c.bonus && !G.CORE_BONUSES[G.stoneKind(c.stone)].includes(c.bonus.id)) fail(`${at}: a ${G.stoneKind(c.stone)} core rolled ${c.bonus.id}`);
  if (c.bonus) { const r = G.affixRoll(c.bonus, c.tier, G.T_CORES.bonus[c.rarity]); if (!(r >= -0.08 && r <= 2.6)) fail(`${at}: ${c.bonus.id} ${c.bonus.v} at tier ${c.tier} rolled ${r}`); }
  if ((c.rarity === 'legendary') !== !!c.power) fail(`${at}: ${c.rarity} with power ${c.power}`);
  if (c.power && !G.LEGENDARIES[c.power]) fail(`${at}: power ${c.power}`);
  if (bad(G.itemKindLine(c)) || G.coreTraits(c).some((t) => bad(t.text)) || !(G.coreWorth(c) > 0)) fail(`${at}: words or worth`);
}
// a relic opens into a rare core or better
for (let seed = 1; seed <= 200; seed++) { const c = G.unsealRelic(new G.Rng(seed), G.makeRelic(1 + (seed % 6))); checkCore(c, `relic ${seed}`); if (c.rarity === 'common' || c.rarity === 'magic') fail(`relic ${seed} opened into a ${c.rarity} core`); }

// --- research --------------------------------------------------------------
for (const id of G.BP_IDS) if (!G.BLUEPRINTS[id].start && !G.RESEARCH.some((r) => r.opens.includes(id))) fail(`${id} can never be found`);
for (const r of G.RESEARCH) for (const id of r.opens) if (!G.BLUEPRINTS[id]) fail(`${r.id} opens ${id}, which isn't a recipe`);
for (const id of Object.keys(G.CIRCUIT_FORMS).concat(Object.keys(G.CIRCUIT_ELEMENTS), Object.keys(G.CIRCUIT_GLYPHS))) if (!G.BP_IDS.some((b) => G.BLUEPRINTS[b].stone === id)) fail(`no recipe makes a ${id} stone`);
{
  const s = { stash: { lumenite: 1, chitin2: 1 }, items: [G.rollCore(new G.Rng(1), 3, 1, 'common', 1, { foe: 'wisp' })], equip: {}, blueprints: G.BP_IDS.filter((id) => G.BLUEPRINTS[id].start), studied: [] };
  const finds = G.researchStudy(s), opened = finds.flatMap((f) => f.opened);
  for (const id of ['lantern', 'form_nova', 'glyph_pierce', 'glyph_split', 'form_orb', 'tool_lens']) if (!opened.includes(id) || !s.blueprints.includes(id)) fail(`research did not reveal ${id}`);
  if (G.researchStudy(s).length || G.researchDue(s).length) fail('research studied the same thing twice');
}

// --- an old save -----------------------------------------------------------
// From before modules (v5), from just before the rig (main, v6) and with
// modules (v7 is what main wrote until tonight): everything becomes bases,
// cores and rig frames; every module is threads, or a legendary core with
// its power; no socket is left; every frame's spells are shaped by its
// extra part; every core the save held is still there.
const coreIds = (list) => list.flatMap((x) => (x && x.kind === 'stone' ? [x] : x && x.kind === 'caster' ? (x.slots || []).filter(Boolean).concat((x.spells || []).flatMap(G.spellCores)) : [])).filter((c) => c.stone !== 'trigger').map((c) => c.stone + c.tier).sort().join();
for (const f of ['save-v5-home.json', 'save-v5-run.json', 'save-main-home.json', 'save-main-run.json', 'save-v6-home.json']) {
  const s = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8'));
  const old = JSON.parse(JSON.stringify(s));
  const v5 = (old.v || 5) < 6;
  if (v5 && (!G.migrateGearSave(s) || s.v !== 6 || G.migrateGearSave(s))) fail(`${f}: migrated wrong to modules`);
  if (!G.migrateRigSave(s) || s.v !== 7 || G.migrateRigSave(s)) fail(`${f}: migrated wrong to the rig`);
  const mid = JSON.parse(JSON.stringify(s)), all = (x) => Object.values(x.equip).filter(Boolean).concat(x.items, x.run ? x.run.items : []);
  const modsOf = (list) => list.filter((x) => x.kind === 'module').concat(list.flatMap((x) => (x.sockets || []).filter(Boolean)));
  const oldMods = modsOf(all(mid)), oldPowers = oldMods.filter((m) => m.power).map((m) => m.power).sort().join(), oldCores = coreIds(all(mid)), oldThreads = mid.stash.thread || 0;
  if (!G.migrateCoreSave(s) || s.v !== 8 || G.migrateCoreSave(s)) fail(`${f}: migrated wrong to cores`);
  s.items = s.items.map(G.cleanSaveItem).filter(Boolean);
  for (const k of Object.keys(s.equip)) s.equip[k] = G.cleanSaveItem(s.equip[k]);
  const pieces = all(s);
  for (const it of pieces) {
    if (it.kind === 'module' || it.sockets) fail(`${f}: a module or a socket is left (${it.name})`);
    if (G.KIND_SLOT[it.kind] && (it.affixes.length || it.power || it.set)) fail(`${f}: ${it.name} is not a base`);
    if (it.kind === 'caster' && (it.bp !== 'rig' || it.slots || it.links || !it.spells || it.spells.length !== 2 || /Wand|Staff|Gauntlet/.test(it.name) || it.extra === undefined)) fail(`${f}: ${it.name} is not a rig frame`);
    if (it.kind === 'caster') for (const sp of it.spells) { const want = it.extra === 'glyph' ? 2 : 1; if (sp.mods.length !== want || ('el2' in sp) !== (it.extra === 'element') || ('form2' in sp) !== (it.extra === 'form')) fail(`${f}: ${it.name}'s spell is shaped ${Object.keys(sp)} for extra ${it.extra}`); }
    if (it.kind === 'stone' && (!G.stoneKind(it.stone) || !('bonus' in it) || !G.RARITIES.includes(it.rarity))) fail(`${f}: a ${it.stone} core is odd (${JSON.stringify(it)})`);
  }
  const cores = pieces.filter((x) => x.kind === 'stone').concat(pieces.flatMap((x) => (x.kind === 'caster' ? x.spells.flatMap(G.spellCores) : [])));
  const powers = cores.filter((c) => c.power).map((c) => c.power).sort().join();
  if (powers !== oldPowers) fail(`${f}: powers ${powers}, were ${oldPowers}`);
  if (!coreIds(pieces).startsWith(oldCores.split(',')[0] || '') || coreIds(pieces).split(',').filter(Boolean).length < oldCores.split(',').filter(Boolean).length) fail(`${f}: cores ${coreIds(pieces)} were ${oldCores}`);
  if ((s.stash.thread || 0) < oldThreads + oldMods.filter((m) => !m.power).length) fail(`${f}: ${s.stash.thread} threads, from ${oldThreads} and ${oldMods.length} modules`);
  if ('off' in s.equip || s.codex || s.stash.bloodresin || s.modsFound !== undefined) fail(`${f}: the off hand, the Codex of powers, Bloodresin or modsFound is left`);
  if (!s.equip.main || s.equip.main.kind !== 'caster') fail(`${f}: no rig worn`);
  if (/Scrap Gauntlet/.test(mid.equip.main.name) && s.equip.main.name !== 'Scrap Rig') fail(`${f}: the Scrap Gauntlet became ${s.equip.main.name}`);
  if (old.blueprints.some((id) => G.BLUEPRINTS[id] && !s.blueprints.includes(id)) || !s.blueprints.includes('rig')) fail(`${f}: a known recipe was forgotten, or the rig isn't known`);
  if (!s.items.some((it) => it.kind === 'relic')) fail(`${f}: a relic was lost`);
}

// --- outfits stay within the caps ------------------------------------------
for (let seed = 1; seed <= 400; seed++) {
  const rng = new G.Rng(seed * 7), eq = { main: G.makeBase('rig', 6, 3), pick: G.makeBase('pick', 6, 3), armor: G.makeBase('plate', 6, 3), charm: G.makeBase('charm', 6, 3) };
  for (const sp of eq.main.spells) for (const [key] of G.spellParts(sp)) { const kind = key.startsWith('form') ? 'form' : key.startsWith('el') ? 'element' : 'glyph'; const c = G.rollCore(rng, 12, 6, rng.pick(['rare', 'legendary']), 1, {}); const ids = Object.keys(kind === 'form' ? G.CIRCUIT_FORMS : kind === 'element' ? G.CIRCUIT_ELEMENTS : G.CIRCUIT_GLYPHS); c.stone = rng.pick(ids); c.bonus = G.coreBonusRoll(rng, c.stone, 6, c.rarity); sp[key.startsWith('m') ? 'mods' : key] = key.startsWith('m') ? sp.mods : c; if (key.startsWith('m')) sp.mods[Number(key.slice(1))] = c; }
  const st = G.computeStats(eq, { vitality: 5, proximity: 5, clarity: 5, stride: 5 });
  for (const k in G.T.caps) if (st[k] > G.T.caps[k]) fail(`outfit ${seed}: ${k} ${st[k]} over its cap`);
  if (!(st.maxHp > G.T.player.hp)) fail(`outfit ${seed}: plate added no health`);
  if (bad(JSON.stringify(st))) fail(`outfit ${seed}: ${JSON.stringify(st)}`);
  // a core's bonus counts set, not loose
  const loose = G.rollCore(rng, 12, 6, 'rare', 1, {}), eq2 = { main: G.makeBase('rig', 1), pick: null, armor: null, charm: null }, base = G.computeStats(eq2, {})[loose.bonus.id];
  eq2.main.spells[0].form = Object.assign(loose, { stone: 'bolt' });
  if (!(G.computeStats(eq2, {})[loose.bonus.id] >= base + Math.min(loose.bonus.v, 1))) fail(`outfit ${seed}: a set core's bonus is not in the stats`);
}
const start = G.startingGear();
if (start.pick.base.power !== 1 || start.pick.sockets || start.main.base.power !== 5 || start.main.bp !== 'rig' || start.main.name !== 'Scrap Rig' || G.spellName(start.main.spells[0]) !== 'ARC' || G.spellName(start.main.spells[1]) !== 'BOLT' || G.rigMods(start.main) !== 1 || start.main.extra || start.main.sockets || 'off' in start) fail('the starting gear changed');

// spells: random cores, read by the rules
const kindIds = (k) => Object.keys(k === 'form' ? G.CIRCUIT_FORMS : k === 'element' ? G.CIRCUIT_ELEMENTS : G.CIRCUIT_GLYPHS);
const C = G.T.circuits;
for (let seed = 1; seed <= 4000; seed++) {
  const rng = new G.Rng(seed * 13), x = rng.chance(0.5) ? 'glyph' : null, sp = G.emptySpell(x), core = (k) => (rng.chance(0.15) ? null : G.makeStone(rng.pick(kindIds(k)), rng.i(1, 6)));
  sp.form = core('form'); sp.el = core('element'); sp.mods = sp.mods.map(() => core('glyph'));
  const it = { kind: 'caster', bp: 'rig', tier: rng.i(1, 6), base: { power: 6 }, affixes: [], spells: [sp, G.emptySpell(x)] }, at = `spell ${seed} [${G.spellName(sp)}]`;
  const g = G.spellGroup(sp);
  if (!!g !== !!sp.form) fail(`${at}: a spell ${g ? 'with' : 'without'} a group`);
  if (g && (g.els.length > 1 || g.stones.length !== G.spellCores(sp).length)) fail(`${at}: its group ${JSON.stringify(g.els)}`);
  // the cost is its Form's times its Mods'
  let want = C.spark.cost;
  if (g) { want = C.forms[g.form].cost; for (const m of sp.mods) if (m) want *= C.glyphs[m.stone].cost; want = Math.max(1, want); }
  if (Math.abs(G.spellCost(sp) - want) > 0.06) fail(`${at}: costs ${G.spellCost(sp)}, not ${want}`);
  const L = G.spellLine(it, sp);
  if (!L.text || bad(L.text) || L.text.length > 60) fail(`${at}: "${L.text}"`);
  // a resonance wakes when the spell holds all its parts
  const res = G.spellResonance(sp), ids = G.spellCores(sp).map((c) => c.stone);
  for (const r of G.RESONANCES) {
    const left = ids.slice(), holds = r.parts.every((id) => { const i = left.indexOf(id); if (i < 0) return false; left.splice(i, 1); return true; });
    if (holds && (!res || res.parts.length < r.parts.length)) fail(`${at}: holds ${r.name} but wakes ${res && res.name}`);
  }
  if (res && !res.parts.every((id) => ids.includes(id))) fail(`${at}: wakes ${res.name} without its parts`);
}
// Quicken a third cheaper; Mods in either order the same
{
  const mk = (...ids) => { const sp = G.emptySpell('glyph'); sp.form = G.makeStone(ids[0], 1); sp.el = ids[1] ? G.makeStone(ids[1], 1) : null; sp.mods = [ids[2], ids[3]].map((x) => (x ? G.makeStone(x, 1) : null)); return sp; };
  if (G.spellCost(mk('arc', null, 'quicken')) !== Math.round(C.forms.arc.cost * C.glyphs.quicken.cost * 10) / 10) fail('ARC QUICKEN does not cost a third less');
  if (G.spellCost(mk('bolt', null, 'split', 'echo')) !== G.spellCost(mk('bolt', null, 'echo', 'split'))) fail('the Mods\' order changes the cost');
  if ((G.spellResonance(mk('orb', 'ember', 'linger', 'split')) || {}).id !== 'wildfire' || (G.spellResonance(mk('orb', 'shock', 'echo', 'linger')) || {}).id !== 'thunderhead') fail('resonances do not wake in any order, or with a Mod over');
  if (G.spellResonance(mk('orb', 'ember', 'linger')) || G.spellResonance(mk('bolt', 'force', 'split'))) fail('a resonance woke without all its parts');
}
// ore affinity: the attuned hit harder
if (G.affinityMult({ tier: 2 }, ['shock']) !== 1 + C.attuned.dmg || G.affinityMult({ tier: 2 }, ['frost']) !== 1) fail('Lumenite is not attuned to Shock');
// every resonance is made of parts there are, a Form, an Element and Mods
for (const r of G.RESONANCES) {
  if (G.stoneKind(r.parts[0]) !== 'form' || G.stoneKind(r.parts[1]) !== 'element' || r.parts.slice(2).some((id) => G.stoneKind(id) !== 'glyph') || r.parts.length < 3 || r.parts.length > 4) fail(`${r.name} isn't a Form, an Element and one or two Mods`);
}

// the star
const S = G.T.star;
if (G.magnitudeOf(0) !== 1) fail('a fresh star is not magnitude 1');
S.levels.forEach((need, i) => { if (G.magnitudeOf(need) !== i + 1) fail(`${need} points is not magnitude ${i + 1}`); });
if (G.attunePointsLeft({ star: S.levels[3], attune: { vitality: 1 } }) !== 2) fail('attunement points are miscounted');

finish('loot', failures);
