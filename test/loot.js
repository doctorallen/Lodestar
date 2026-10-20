'use strict';
// The gear tables, without a browser. Crafted bases: every recipe in every
// ore at every quality comes out exactly as its recipe says, with the anvil
// only ever adding (stats, a masterwork's socket and a frame's second Mod
// slot), no affixes and empty sockets; costs that name real things. A rig
// frame's two spells have one Mod slot, two from Resonite up, a
// masterwork or a Lodestone shard. Modules: thousands rolled at every
// level, tier and floor of rarity, checked for their rarity's traits, no
// trait twice, traits only from families their kind can take, powers that
// fit, set pieces only where the set has one, positive values within
// their range, and a name; upgrading by the rules; salvage giving threads.
// Research reveals every recipe not known from the start. Old saves (from
// before modules, and from before the rig) turn into bases, modules and
// rig frames with nothing they did lost: every core kept, the circuits
// the rig's two spells. Outfits add up within the caps. Then thousands of
// random spells cost what their parts add up to, read in a short line with
// nothing missing, and wake the resonances whose parts they hold; and the
// star's magnitudes.
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
for (const id of gearIds) {
  const bp = G.BLUEPRINTS[id];
  for (const ore of G.T.ores) {
    const plain = G.forgeItem(id, ore.id, null, 0), at = `${id} in ${ore.id}`;
    if (plain.kind !== bp.kind || plain.bp !== id || plain.tier !== ore.tier) fail(`${at}: came out ${plain.kind} ${plain.bp} tier ${plain.tier}`);
    if (plain.affixes.length) fail(`${at}: a crafted base rolled affixes`);
    if (plain.sockets.length !== G.socketCount(bp.kind, ore.tier, 0) || plain.sockets.some(Boolean)) fail(`${at}: sockets ${plain.sockets.length}`);
    if (!plain.name || bad(plain.name) || bad(G.itemBaseLine(plain)) || bad(G.itemKindLine(plain))) fail(`${at}: "${plain.name}" / "${G.itemBaseLine(plain)}"`);
    const mods = (it) => it.spells.map((sp) => sp.mods.length).join();
    if (bp.kind === 'caster' && (plain.spells.length !== 2 || mods(plain) !== (ore.tier >= G.T.circuits.rig.mod2Tier ? '2,2' : '1,1'))) fail(`${at}: spells with ${mods(plain)} Mod slots`);
    if (bp.kind === 'caster' && (plain.slots || plain.links || plain.spells.some((sp) => G.spellCores(sp).length))) fail(`${at}: a frame came with cores, slots or links`);
    const nums = (it) => Object.values(it.base);
    for (let q = 1; q <= 3; q++) {
      const it = G.forgeItem(id, ore.id, null, q);
      if (nums(it).some((v, i) => v < nums(plain)[i])) fail(`${at}: quality ${q} took something away (${JSON.stringify(it.base)} against ${JSON.stringify(plain.base)})`);
      if (it.sockets.length !== plain.sockets.length + (q >= 3 ? G.T.gear.masterSocket : 0)) fail(`${at}: quality ${q} has ${it.sockets.length} sockets`);
      if (bp.kind === 'caster' && mods(it) !== (q >= 3 || ore.tier >= G.T.circuits.rig.mod2Tier ? '2,2' : '1,1')) fail(`${at}: quality ${q} has ${mods(it)} Mod slots`);
      if (it.affixes.length) fail(`${at}: quality ${q} rolled affixes`);
    }
    if (bp.kind === 'pick' && plain.base.power !== ore.tier + 1) fail(`${at}: a pick that breaks tier ${plain.base.power}`);
    const cost = G.recipeCost(id, ore.id);
    if (!(cost.ore.n > 0) || cost.ore.id !== ore.id || !cost.parts.length || cost.parts.some((p) => !(p.n > 0) || !(G.PARTS[p.kind] || p.kind === 'any'))) fail(`${at}: costs ${JSON.stringify(cost)}`);
  }
  // riftglass forges a tier higher; an elemental exotic in a frame brings
  // its core; a Lodestone shard, a second Mod slot
  const rg = G.forgeItem(id, 'ferrite', 'riftglass', 0);
  if (rg.tier !== 2) fail(`${id}: riftglass forged tier ${rg.tier}`);
  if (bp.kind === 'caster' && !(G.forgeItem(id, 'ferrite', 'voltaic', 0).withStone || {}).stone) fail(`${id}: Voltaic crystal brought no Shock core`);
  if (bp.kind === 'caster' && G.rigMods(G.forgeItem(id, 'ferrite', 'lodeshard', 0)) !== 2) fail(`${id}: a Lodestone shard gave no second Mod slot`);
  if (bp.kind !== 'caster' && G.forgeItem(id, 'ferrite', 'lodeshard', 0).spells) fail(`${id}: a shard gave a non-frame spells`);
}
// cores: their ore's tier, one more from a fine forge
for (const id of G.BP_IDS.filter((x) => G.BLUEPRINTS[x].kind === 'stone')) for (let q = 0; q < 4; q++) {
  const st = G.forgeItem(id, 'lumenite', null, q);
  if (st.kind !== 'stone' || st.stone !== G.BLUEPRINTS[id].stone || st.tier !== 2 + (q >= 2 ? 1 : 0) || !/ core$/.test(st.name)) fail(`${id} at quality ${q}: ${JSON.stringify(st)}`);
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

// --- modules ---------------------------------------------------------------
const rarities = {}, fitsN = {};
for (let seed = 1; seed <= 4000; seed++) {
  const rng = new G.Rng(seed), level = seed % 14, tier = 1 + (seed % 6), min = ['common', 'magic', 'rare'][seed % 3];
  const foe = Object.keys(G.FOE_PATTERN)[seed % Object.keys(G.FOE_PATTERN).length];
  const m = G.rollModule(rng, level, tier, min, seed % 7 ? 1 : 3, { foe, clime: 'bloomfen' }), at = `module ${seed}`;
  rarities[m.rarity] = (rarities[m.rarity] || 0) + 1; fitsN[m.fits] = (fitsN[m.fits] || 0) + 1;
  checkModule(m, at);
  if (G.RARITIES.indexOf(m.rarity) < G.RARITIES.indexOf(min)) fail(`${at}: ${m.rarity} under its floor ${min}`);
  const fam = G.FOE_PATTERN[foe];
  if (m.affixes.length && G.KIND_FAMILIES[m.fits].includes(fam) && !m.set && G.AFFIXES[m.affixes[0].id].family !== fam) fail(`${at}: a ${foe}'s module doesn't lean to ${fam}`);
  // a tier up: every trait at least as strong, those that grow stronger
  const up = JSON.parse(JSON.stringify(m)), cost = G.upgradeCost(up);
  if (m.tier < 6) {
    if (!cost || cost.ore.id !== G.T.ores[m.tier].id || !(cost.threads > 0)) fail(`${at}: upgrade costs ${JSON.stringify(cost)}`);
    G.moduleUpgrade(up);
    if (up.tier !== m.tier + 1) fail(`${at}: upgraded to tier ${up.tier}`);
    up.affixes.forEach((a, i) => { if (a.id !== m.affixes[i].id || a.v < m.affixes[i].v || (!G.AFFIXES[a.id].flat && !(a.v > m.affixes[i].v))) fail(`${at}: upgrading ${m.affixes[i].id} ${m.affixes[i].v} gave ${a.v}`); });
  } else if (cost || G.moduleUpgrade(up)) fail(`${at}: a tier 6 module upgraded`);
  if (!(G.salvageThreads(m) > 0)) fail(`${at}: salvage gives no threads`);
  if (G.compareLines(m, m).length) fail(`${at}: differs from itself`);
  for (const l of G.compareLines(m, null)) if (bad(l.text)) fail(`${at}: "${l.text}"`);
}
for (const r of G.RARITIES) if (!rarities[r]) fail(`no ${r} module in 4000`);
for (const f of ['caster', 'armor', 'charm', 'pick']) if (!fitsN[f]) fail(`no module for a ${f} in 4000`);
function checkModule(m, at) {
  if (!m.name || bad(m.name)) fail(`${at}: named "${m.name}"`);
  if (!m.woven && m.affixes.length !== Math.min(G.T_MODULES.affixes[m.rarity], G.AFFIXES && 99)) fail(`${at}: a ${m.rarity} module with ${m.affixes.length} traits`);
  const ids = m.affixes.map((a) => a.id);
  if (new Set(ids).size !== ids.length) fail(`${at}: a trait twice: ${ids}`);
  for (const a of m.affixes) {
    if (!m.woven && !G.KIND_FAMILIES[m.fits].includes(G.AFFIXES[a.id].family)) fail(`${at}: a ${m.fits} module rolled ${a.id}`);
    if (!(a.v > 0) || bad(G.fmtAffix(a))) fail(`${at}: ${a.id} ${a.v}`);
    const r = G.affixRoll(a, m.tier, G.T_MODULES.value);
    if (!m.woven && !(r >= -0.08 && r <= 2.6)) fail(`${at}: ${a.id} ${a.v} at tier ${m.tier} rolled ${r}`);
  }
  if (m.power && !G.LEGENDARIES[m.power].kinds.includes(m.fits)) fail(`${at}: ${m.power} on a ${m.fits} module`);
  if ((m.rarity === 'legendary') !== !!m.power) fail(`${at}: ${m.rarity} with power ${m.power}`);
  if (m.set && !G.SETS[m.set].pieces[m.fits]) fail(`${at}: a set piece for a ${m.fits}`);
  if (bad(G.itemKindLine(m)) || G.moduleTraits(m).some((t) => bad(t.text))) fail(`${at}: words`);
}
// sockets: a module only into a base of its kind; moved across whole
{
  const base = G.makeBase('plate', 3, 3), list = [], m1 = G.makeModule(new G.Rng(4), 'armor', 1, { rarity: 'magic' }), m2 = G.makeModule(new G.Rng(5), 'caster', 1, {});
  if (!G.socketModule(base, 0, m1, list) || G.socketModule(base, 1, m2, list)) fail('a module went into the wrong kind of base');
  const other = G.makeBase('shell', 1, 0);
  G.moveModules(base, other, list);
  if (other.sockets[0] !== m1 || base.sockets.some(Boolean)) fail('modules did not move across');
  const eq = { main: G.makeBase('rig', 1), armor: other, charm: null, pick: null };
  const t = G.moduleTarget(eq, G.makeModule(new G.Rng(6), 'armor', 1, {}));
  if (!t || t.slot !== 'armor') fail('a module finds no worn base of its kind');
}

// --- research --------------------------------------------------------------
for (const id of G.BP_IDS) if (!G.BLUEPRINTS[id].start && !G.RESEARCH.some((r) => r.opens.includes(id))) fail(`${id} can never be found`);
for (const r of G.RESEARCH) for (const id of r.opens) if (!G.BLUEPRINTS[id]) fail(`${r.id} opens ${id}, which isn't a recipe`);
for (const id of Object.keys(G.CIRCUIT_FORMS).concat(Object.keys(G.CIRCUIT_ELEMENTS), Object.keys(G.CIRCUIT_GLYPHS))) if (!G.BP_IDS.some((b) => G.BLUEPRINTS[b].stone === id)) fail(`no recipe makes a ${id} stone`);
{
  const s = { stash: { lumenite: 1, chitin2: 1 }, items: [G.makeModule(new G.Rng(1), 'caster', 1, { src: { foe: 'wisp' } })], equip: {}, blueprints: G.BP_IDS.filter((id) => G.BLUEPRINTS[id].start), studied: [] };
  const finds = G.researchStudy(s), opened = finds.flatMap((f) => f.opened);
  for (const id of ['lantern', 'form_nova', 'glyph_pierce', 'glyph_split', 'form_orb', 'tool_lens']) if (!opened.includes(id) || !s.blueprints.includes(id)) fail(`research did not reveal ${id}`);
  if (G.researchStudy(s).length || G.researchDue(s).length) fail('research studied the same thing twice');
}

// --- an old save -----------------------------------------------------------
const coreIds = (list) => list.flatMap((x) => (x && x.kind === 'stone' ? [x] : x && x.kind === 'caster' ? (x.slots || []).filter(Boolean).concat((x.spells || []).flatMap(G.spellCores)) : [])).filter((c) => c.stone !== 'trigger').map((c) => c.stone + c.tier).sort().join();
for (const f of ['save-v5-home.json', 'save-v5-run.json', 'save-main-home.json', 'save-main-run.json', 'save-v6-home.json']) {
  const s = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8'));
  const old = JSON.parse(JSON.stringify(s));
  // what the old gear's affixes added up to, worn and stashed
  const sum = (list) => { const o = {}; for (const it of list) for (const a of it.affixes || []) o[a.id] = Math.round(((o[a.id] || 0) + a.v) * 10) / 10; return Object.keys(o).sort().map((k) => k + ' ' + o[k]).join(', '); };
  const v5 = (old.v || 5) < 6;
  if (v5 && (!G.migrateGearSave(s) || s.v !== 6 || G.migrateGearSave(s))) fail(`${f}: migrated wrong to modules`);
  const mid = JSON.parse(JSON.stringify(s)), all = (x) => Object.values(x.equip).filter(Boolean).concat(x.items, x.run ? x.run.items : [], x.run ? x.run.pocket.filter((e) => e.item).map((e) => e.item) : []);
  const modsOf = (list) => list.filter((x) => x.kind === 'module').concat(list.flatMap((x) => (x.sockets || []).filter(Boolean)));
  const oldMods = modsOf(all(mid)), oldCores = coreIds(all(mid)), oldThreads = (mid.stash.thread || 0) + ((mid.stash.bloodresin || 0) + all(mid).flatMap((x) => (x.kind === 'stone' ? [x] : x.slots || [])).filter((c) => c && c.stone === 'trigger').length) * G.T.retiredThreads;
  if (!G.migrateRigSave(s) || s.v !== 7 || G.migrateRigSave(s)) fail(`${f}: migrated wrong to the rig`);
  s.items = s.items.map(G.cleanSaveItem).filter(Boolean);
  for (const k of Object.keys(s.equip)) s.equip[k] = G.cleanSaveItem(s.equip[k]);
  const pieces = all(s), mods = modsOf(pieces);
  for (const it of pieces) {
    if (G.KIND_SLOT[it.kind] && (!Array.isArray(it.sockets) || it.affixes.length || it.power || it.set)) fail(`${f}: ${it.name} is not a base`);
    if (it.kind === 'caster' && (it.bp !== 'rig' || it.slots || it.links || !it.spells || it.spells.length !== 2 || /Wand|Staff|Gauntlet/.test(it.name))) fail(`${f}: ${it.name} is not a rig frame`);
    if (it.kind === 'stone' && !G.stoneKind(it.stone)) fail(`${f}: a ${it.stone} core is left`);
  }
  if ('off' in s.equip || s.codex || s.stash.bloodresin) fail(`${f}: the off hand, the Codex of powers or Bloodresin is left`);
  for (const m of mods) checkModuleLoose(m, `${f} ${m.name}`);
  if (sum(mods) !== sum(oldMods)) fail(`${f}: affixes ${sum(mods)} were ${sum(oldMods)}`);
  if (mods.length !== oldMods.length) fail(`${f}: ${mods.length} modules, were ${oldMods.length}`);
  if (coreIds(pieces) !== oldCores) fail(`${f}: cores ${coreIds(pieces)} were ${oldCores}`);
  if ((s.stash.thread || 0) !== oldThreads) fail(`${f}: ${s.stash.thread} threads, not ${oldThreads}`);
  // the worn main hand's circuit is spell A, the off hand's spell B
  const A = mid.equip.main && mid.equip.main.slots, B = mid.equip.off && mid.equip.off.slots, first = (sl, k) => (sl || []).find((c) => c && G.stoneKind(c.stone) === k);
  const r = s.equip.main;
  for (const [sp, sl, w] of [[r.spells[0], A, 'A'], [r.spells[1], B, 'B']]) {
    const id = (c) => (c && c.stone) || null;
    if (id(sp.form) !== id(first(sl, 'form')) || id(sp.el) !== id(first(sl, 'element')) || id(sp.mods[0]) !== id(first(sl, 'glyph'))) fail(`${f}: spell ${w} is ${G.spellName(sp)}, from ${(sl || []).map((c) => c && c.stone)}`);
  }
  if (/Scrap Gauntlet/.test(mid.equip.main.name) && r.name !== 'Scrap Rig') fail(`${f}: the Scrap Gauntlet became ${r.name}`);
  if (mid.equip.off && !s.items.some((x) => x.kind === 'caster' && x.uid === mid.equip.off.uid)) fail(`${f}: the off hand's frame is not in the stash`);
  if (!pieces.some((it) => it.fav)) fail(`${f}: a kept piece lost its mark`);
  if (old.blueprints.some((id) => G.BLUEPRINTS[id] && !s.blueprints.includes(id)) || !s.blueprints.includes('rig')) fail(`${f}: a known recipe was forgotten, or the rig isn't known`);
  if (!s.items.some((it) => it.kind === 'relic')) fail(`${f}: a relic was lost`);
}
function checkModuleLoose(m, at) {
  if (m.kind !== 'module' || !m.name || !G.KIND_SLOT[m.fits] || !m.affixes.every((a) => G.AFFIXES[a.id] && a.v > 0)) fail(`${at}: ${JSON.stringify(m)}`);
}

// --- outfits stay within the caps ------------------------------------------
for (let seed = 1; seed <= 400; seed++) {
  const rng = new G.Rng(seed * 7), eq = { main: G.makeBase('rig', 6, 3), pick: G.makeBase('pick', 6, 3), armor: G.makeBase('plate', 6, 3), charm: G.makeBase('charm', 6, 3) };
  for (const k in eq) eq[k].sockets = eq[k].sockets.map(() => G.makeModule(rng, eq[k].kind, 6, { rarity: rng.pick(['rare', 'legendary', 'set']) }));
  const st = G.computeStats(eq, { vitality: 5, proximity: 5, capacity: 5, clarity: 5, stride: 5 });
  for (const k in G.T.caps) if (st[k] > G.T.caps[k]) fail(`outfit ${seed}: ${k} ${st[k]} over its cap`);
  if (!(st.maxHp > G.T.player.hp)) fail(`outfit ${seed}: plate added no health`);
  if (bad(JSON.stringify(st))) fail(`outfit ${seed}: ${JSON.stringify(st)}`);
}
{
  const eq = { main: null, pick: G.makeBase('pick', 2), armor: G.makeBase('plate', 2), charm: G.makeBase('charm', 2) };
  for (const k of ['pick', 'armor', 'charm']) eq[k].sockets[0] = G.makeModule(new G.Rng(1), k, 2, { rarity: 'set' });
  const st = G.computeStats(eq, {});
  if (st.sets.regalia !== 3 || !st.regalia3) fail('three set modules don\'t make the set');
}
const start = G.startingGear();
if (start.pick.base.power !== 1 || start.pick.sockets.length || start.main.base.power !== 5 || start.main.bp !== 'rig' || start.main.name !== 'Scrap Rig' || G.spellName(start.main.spells[0]) !== 'ARC' || G.spellName(start.main.spells[1]) !== 'BOLT' || G.rigMods(start.main) !== 1 || start.main.sockets.length !== 1 || 'off' in start) fail('the starting gear changed');

// spells: random cores, read by the rules
const kindIds = (k) => Object.keys(k === 'form' ? G.CIRCUIT_FORMS : k === 'element' ? G.CIRCUIT_ELEMENTS : G.CIRCUIT_GLYPHS);
const C = G.T.circuits;
for (let seed = 1; seed <= 4000; seed++) {
  const rng = new G.Rng(seed * 13), n = rng.i(1, 2), sp = G.emptySpell(n), core = (k) => (rng.chance(0.15) ? null : G.makeStone(rng.pick(kindIds(k)), rng.i(1, 6)));
  sp.form = core('form'); sp.el = core('element'); sp.mods = sp.mods.map(() => core('glyph'));
  const it = { kind: 'caster', bp: 'rig', tier: rng.i(1, 6), base: { power: 6 }, affixes: [], spells: [sp, G.emptySpell(n)] }, at = `spell ${seed} [${G.spellName(sp)}]`;
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
  const mk = (...ids) => { const sp = G.emptySpell(2); sp.form = G.makeStone(ids[0], 1); sp.el = ids[1] ? G.makeStone(ids[1], 1) : null; sp.mods = [ids[2], ids[3]].map((x) => (x ? G.makeStone(x, 1) : null)); return sp; };
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
