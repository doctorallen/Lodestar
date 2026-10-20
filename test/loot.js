'use strict';
// The gear tables, without a browser. Crafted bases: every recipe in every
// ore at every quality (and every size, for a caster) comes out exactly as
// its recipe says, with the anvil only ever adding (stats, a masterwork's
// socket and linked pair), no affixes and empty sockets; costs that name
// real things and grow with a caster's size. Modules: thousands rolled at
// every level, tier and floor of rarity, checked for their rarity's
// traits, no trait twice, traits only from families their kind can take,
// powers that fit, set pieces only where the set has one, positive values
// within their range, and a name; upgrading, rerolling, fusing, enriching
// and imprinting by the rules; salvage giving threads. Research reveals
// every recipe not known from the start. Old saves (made on the code from
// before modules) turn into bases and modules with nothing they did lost.
// Outfits add up within the caps. Then thousands of random circuits parse
// by the rules, cost what their parts add up to, and read in words with
// nothing missing; and the star's magnitudes.
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
    const sizes = bp.kind === 'caster' ? G.casterSizes(id) : [null];
    for (const size of sizes) {
      const plain = G.forgeItem(id, ore.id, null, 0, size), at = `${id} in ${ore.id}${size ? ' at ' + size : ''}`;
      if (plain.kind !== bp.kind || plain.bp !== id || plain.tier !== ore.tier) fail(`${at}: came out ${plain.kind} ${plain.bp} tier ${plain.tier}`);
      if (plain.affixes.length) fail(`${at}: a crafted base rolled affixes`);
      if (plain.sockets.length !== G.socketCount(bp.kind, ore.tier, 0) || plain.sockets.some(Boolean)) fail(`${at}: sockets ${plain.sockets.length}`);
      if (!plain.name || bad(plain.name) || bad(G.itemBaseLine(plain)) || bad(G.itemKindLine(plain))) fail(`${at}: "${plain.name}" / "${G.itemBaseLine(plain)}"`);
      if (bp.kind === 'caster' && plain.slots.length !== size + (ore.id === 'starmetal' ? 1 : 0)) fail(`${at}: ${plain.slots.length} circuit slots`);
      if (bp.kind === 'caster' && (plain.links || plain.slots.some(Boolean))) fail(`${at}: a rough forge linked slots or came with stones`);
      const nums = (it) => Object.values(it.base);
      for (let q = 1; q <= 3; q++) {
        const it = G.forgeItem(id, ore.id, null, q, size);
        if (nums(it).some((v, i) => v < nums(plain)[i])) fail(`${at}: quality ${q} took something away (${JSON.stringify(it.base)} against ${JSON.stringify(plain.base)})`);
        if (it.sockets.length !== plain.sockets.length + (q >= 3 ? G.T.gear.masterSocket : 0)) fail(`${at}: quality ${q} has ${it.sockets.length} sockets`);
        if (bp.kind === 'caster' && it.slots.length !== plain.slots.length) fail(`${at}: quality ${q} changed the circuit slots`);
        if (bp.kind === 'caster' && !!it.links !== (q >= 3)) fail(`${at}: quality ${q} links ${it.links}`);
        if (it.affixes.length) fail(`${at}: quality ${q} rolled affixes`);
      }
      if (bp.kind === 'pick' && plain.base.power !== ore.tier + 1) fail(`${at}: a pick that breaks tier ${plain.base.power}`);
      const cost = G.recipeCost(id, ore.id, size);
      if (!(cost.ore.n > 0) || cost.ore.id !== ore.id || !cost.parts.length || cost.parts.some((p) => !(p.n > 0) || !(G.PARTS[p.kind] || p.kind === 'any'))) fail(`${at}: costs ${JSON.stringify(cost)}`);
      if (size && size > G.casterSizes(id)[0] && G.recipeCost(id, ore.id, size).ore.n <= G.recipeCost(id, ore.id).ore.n) fail(`${at}: a bigger caster costs no more`);
    }
  }
  // riftglass forges a tier higher; an elemental exotic in a caster brings its stone
  const rg = G.forgeItem(id, 'ferrite', 'riftglass', 0);
  if (rg.tier !== 2) fail(`${id}: riftglass forged tier ${rg.tier}`);
  if (bp.kind === 'caster' && !(G.forgeItem(id, 'ferrite', 'voltaic', 0).withStone || {}).stone) fail(`${id}: Voltaic crystal brought no Shock stone`);
}
// stones: their ore's tier, one more from a fine forge
for (const id of G.BP_IDS.filter((x) => G.BLUEPRINTS[x].kind === 'stone')) for (let q = 0; q < 4; q++) {
  const st = G.forgeItem(id, 'lumenite', null, q);
  if (st.kind !== 'stone' || st.stone !== G.BLUEPRINTS[id].stone || st.tier !== 2 + (q >= 2 ? 1 : 0)) fail(`${id} at quality ${q}: ${JSON.stringify(st)}`);
}
// paying a cost takes exactly it, and an unpaid one takes nothing
{
  const src = { ferrite: 40, cog1: 1, cog2: 2 }, cost = G.recipeCost('gauntlet', 'ferrite', 4);
  if (!G.recipePay(cost, src) || src.ferrite !== 40 - cost.ore.n || G.partsHave(src, 'cog') !== 3 - cost.parts[0].n || src.cog1) fail(`paying a gauntlet: ${JSON.stringify(src)}`);
  const before = JSON.stringify(src);
  if (G.recipePay(G.recipeCost('staff', 'ferrite'), src) || JSON.stringify(src) !== before) fail('an unpaid cost took something');
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
  // a reroll: the one trait changes, the rest stay
  if (m.affixes.length) {
    const rr = JSON.parse(JSON.stringify(m)), i = seed % m.affixes.length;
    G.moduleReroll(rng, rr, i);
    checkModule(rr, `${at} rerolled`);
    rr.affixes.forEach((a, j) => { if (j !== i && JSON.stringify(a) !== JSON.stringify(m.affixes[j])) fail(`${at}: a reroll changed a locked trait`); });
    if (G.KIND_FAMILIES[m.fits].includes('leech') && !m.affixes.some((a) => a.id === 'leech')) { const lr = JSON.parse(JSON.stringify(m)); G.moduleReroll(rng, lr, i, 'leech'); if (lr.affixes[i].id !== 'leech') fail(`${at}: a Bloodresin reroll came out ${lr.affixes[i].id}`); }
  }
  // enriching: a trait more, a rarity up
  if (G.canEnrich(m)) { const en = JSON.parse(JSON.stringify(m)); G.moduleEnrich(rng, en); if (en.affixes.length !== m.affixes.length + 1 || en.rarity !== (m.rarity === 'common' ? 'magic' : 'rare')) fail(`${at}: enriched to ${en.rarity} with ${en.affixes.length}`); checkModule(en, `${at} enriched`); }
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
// fusing: a trait of each, at the higher tier, stronger; the rules hold
for (let seed = 1; seed <= 1500; seed++) {
  const rng = new G.Rng(seed * 31), fits = ['caster', 'armor', 'charm', 'pick'][seed % 4];
  const a = G.makeModule(rng, fits, 1 + (seed % 5), { rarity: ['magic', 'rare', 'legendary', 'set'][seed % 4] }), b = G.makeModule(rng, fits, 1 + (seed % 3), { rarity: ['rare', 'legendary', 'magic'][seed % 3] });
  const ta = G.moduleTraits(a)[seed % G.moduleTraits(a).length].key, tb = G.moduleTraits(b)[(seed >> 2) % G.moduleTraits(b).length].key;
  const problem = G.fuseProblem(a, ta, b, tb), m = G.moduleFuse(rng, a, ta, b, tb), at = `fuse ${seed} ${ta}+${tb}`;
  if (problem) { if (m) fail(`${at}: fused despite "${problem}"`); continue; }
  if (!m) { fail(`${at}: nothing came out`); continue; }
  checkModule(m, at);
  if (m.tier !== Math.max(a.tier, b.tier) || m.fits !== a.fits || G.moduleTraits(m).length !== 2) fail(`${at}: tier ${m.tier}, ${G.moduleTraits(m).length} traits`);
  for (const [from, key] of [[a, ta], [b, tb]]) if (key[0] === 'a') { const o = from.affixes[Number(key.slice(1))], n = m.affixes.find((x) => x.id === o.id); if (!n || n.v < o.v) fail(`${at}: ${o.id} ${o.v} came out ${n && n.v}`); }
}
if (!G.fuseProblem(G.makeModule(new G.Rng(1), 'caster', 1, { rarity: 'legendary', power: 'echo' }), 'power', G.makeModule(new G.Rng(2), 'caster', 1, { rarity: 'legendary', power: 'bloodedge' }), 'power')) fail('two powers fused into one module');
// imprinting a remembered power
{ const m = G.makeModule(new G.Rng(3), 'armor', 2, { rarity: 'rare' }); if (!G.moduleImprint(m, 'lodeheart') || m.rarity !== 'legendary' || m.power !== 'lodeheart' || G.moduleImprint(m, 'echo')) fail('imprinting is wrong'); }
// sockets: a module only into a base of its kind; moved across whole
{
  const base = G.makeBase('plate', 3, 3), list = [], m1 = G.makeModule(new G.Rng(4), 'armor', 1, { rarity: 'magic' }), m2 = G.makeModule(new G.Rng(5), 'caster', 1, {});
  if (!G.socketModule(base, 0, m1, list) || G.socketModule(base, 1, m2, list)) fail('a module went into the wrong kind of base');
  const other = G.makeBase('shell', 1, 0);
  G.moveModules(base, other, list);
  if (other.sockets[0] !== m1 || base.sockets.some(Boolean)) fail('modules did not move across');
  const eq = { main: G.makeBase('wand', 1), off: null, armor: other, charm: null, pick: null };
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
for (const f of ['save-v5-home.json', 'save-v5-run.json', 'save-main-home.json', 'save-main-run.json']) {
  const s = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8'));
  const old = JSON.parse(JSON.stringify(s));
  // what the old gear's affixes added up to, worn and stashed (the cargo
  // trait is gone with the cargo limit)
  const sum = (list) => { const o = {}; for (const it of list) for (const a of it.affixes || []) if (G.AFFIXES[a.id]) o[a.id] = Math.round(((o[a.id] || 0) + a.v) * 10) / 10; return Object.keys(o).sort().map((k) => k + ' ' + o[k]).join(', '); };
  const oldAll = Object.values(old.equip).filter(Boolean).concat(old.items, old.run ? old.run.items : [], old.run ? old.run.pocket.filter((e) => e.item).map((e) => e.item) : []);
  const oldPowers = oldAll.filter((it) => it.power).map((it) => it.power).sort().join(), oldSets = oldAll.filter((it) => it.set).length;
  if (!G.migrateGearSave(s) || s.v !== 6 || G.migrateGearSave(s)) fail(`${f}: migrated wrong`);
  const pieces = Object.values(s.equip).filter(Boolean).concat(s.items, s.run ? s.run.items : [], s.run ? s.run.pocket.filter((e) => e.item).map((e) => e.item) : []);
  const mods = pieces.filter((x) => x.kind === 'module').concat(pieces.flatMap((x) => (x.sockets || []).filter(Boolean)));
  for (const it of pieces) {
    if (G.KIND_SLOT[it.kind] && (!Array.isArray(it.sockets) || it.affixes.length || it.power || it.set)) fail(`${f}: ${it.name} is not a base`);
    if (it.kind === 'caster' && !it.slots) fail(`${f}: ${it.name} lost its circuit`);
  }
  for (const m of mods) checkModuleLoose(m, `${f} ${m.name}`);
  if (sum(mods) !== sum(oldAll)) fail(`${f}: affixes ${sum(mods)} were ${sum(oldAll)}`);
  if (mods.filter((m) => m.power).map((m) => m.power).sort().join() !== oldPowers || mods.filter((m) => m.set).length !== oldSets) fail(`${f}: powers or set pieces lost`);
  if (s.equip.main.name !== 'Scrap Gauntlet' || s.equip.main.slots[0].stone !== 'arc') fail(`${f}: the starting gauntlet changed`);
  if (!s.items.some((it) => it.fav)) fail(`${f}: a kept piece lost its mark`);
  if (old.blueprints.some((id) => !s.blueprints.includes(id))) fail(`${f}: a known blueprint was forgotten`);
  if (!s.items.some((it) => it.kind === 'relic')) fail(`${f}: a relic was lost`);
}
function checkModuleLoose(m, at) {
  if (m.kind !== 'module' || !m.name || !G.KIND_SLOT[m.fits] || !m.affixes.every((a) => G.AFFIXES[a.id] && a.v > 0)) fail(`${at}: ${JSON.stringify(m)}`);
}

// --- outfits stay within the caps ------------------------------------------
for (let seed = 1; seed <= 400; seed++) {
  const rng = new G.Rng(seed * 7), eq = { main: G.makeBase('gauntlet', 6, 3), off: G.makeBase('staff', 6, 3), pick: G.makeBase('pick', 6, 3), armor: G.makeBase('plate', 6, 3), charm: G.makeBase('charm', 6, 3) };
  for (const k in eq) eq[k].sockets = eq[k].sockets.map(() => G.makeModule(rng, eq[k].kind, 6, { rarity: rng.pick(['rare', 'legendary', 'set']) }));
  const st = G.computeStats(eq, { vitality: 5, proximity: 5, clarity: 5, stride: 5 });
  for (const k in G.T.caps) if (st[k] > G.T.caps[k]) fail(`outfit ${seed}: ${k} ${st[k]} over its cap`);
  if (!(st.maxHp > G.T.player.hp)) fail(`outfit ${seed}: plate added no health`);
  if (bad(JSON.stringify(st))) fail(`outfit ${seed}: ${JSON.stringify(st)}`);
}
{
  const eq = { main: null, off: null, pick: G.makeBase('pick', 2), armor: G.makeBase('plate', 2), charm: G.makeBase('charm', 2) };
  for (const k of ['pick', 'armor', 'charm']) eq[k].sockets[0] = G.makeModule(new G.Rng(1), k, 2, { rarity: 'set' });
  const st = G.computeStats(eq, {});
  if (st.sets.regalia !== 3 || !st.regalia3) fail('three set modules don\'t make the set');
}
const start = G.startingGear();
if (start.pick.base.power !== 1 || start.pick.sockets.length || start.main.base.power !== 5 || start.main.bp !== 'gauntlet' || start.main.slots.length !== 3 || start.main.slots[0].stone !== 'arc' || start.off.bp !== 'wand' || start.off.slots[0].stone !== 'bolt' || start.main.sockets.length !== 1) fail('the starting gear changed');

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
// a Glyph in a linked slot counts twice, in what it does and what it costs
const PL = G.parseCircuit(SS('bolt', 'split', 'echo'), [1]);
if (PL.groups[0].glyphs.split !== 2 || PL.groups[0].glyphs.echo !== 2) fail('a Glyph in a linked slot does not count twice');
if (G.parseCircuit(SS('bolt', 'split', 'echo'), [0]).groups[0].glyphs.echo !== 1) fail('a slot outside the linked pair counts twice');
if (G.circuitCost({ bp: 'wand', slots: SS('bolt', 'split', null), links: [1] }) !== Math.round(C.forms.bolt.cost * C.glyphs.split.cost * C.glyphs.split.cost * 10) / 10) fail('a linked Glyph does not cost twice');
// ore affinity: Ferrite's Glaive costs less; the attuned hit harder
if (G.circuitCost({ bp: 'wand', tier: 1, slots: SS('glaive') }) !== C.forms.glaive.cost - C.ores.ferrite.glaive) fail('a Ferrite Glaive does not cost less');
if (G.circuitCost({ bp: 'wand', tier: 2, slots: SS('glaive') }) !== C.forms.glaive.cost) fail('a Lumenite Glaive costs less');
if (G.affinityMult({ tier: 2 }, ['shock']) !== 1 + C.attuned.dmg || G.affinityMult({ tier: 2 }, ['frost']) !== 1 || G.affinityMult({ tier: 2 }, ['shock', 'frost']) !== 1 + C.attuned.dmg / 2) fail('Lumenite is not attuned to Shock by its share');
// resonances fill the caster exactly
for (const r of G.RESONANCES) {
  if (!r.seq.every((id) => ids.includes(id))) fail(`${r.name} needs a part outside the core set`);
  if (!G.circuitResonance(SS(...r.seq)) || G.circuitResonance(SS(...r.seq, null))) fail(`${r.name}: a resonance must fill its caster exactly`);
}

// the star
const S = G.T.star;
if (G.magnitudeOf(0) !== 1) fail('a fresh star is not magnitude 1');
S.levels.forEach((need, i) => { if (G.magnitudeOf(need) !== i + 1) fail(`${need} points is not magnitude ${i + 1}`); });
if (G.attunePointsLeft({ star: S.levels[3], attune: { vitality: 1 } }) !== 2) fail('attunement points are miscounted');

finish('loot', failures);
