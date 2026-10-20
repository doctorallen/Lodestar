'use strict';
// ---------------------------------------------------------------------------
// Modules: the found half of gear. The dark's creatures are made of the
// world's own living energy, and when one dies its pattern unravels. The
// Charter suit's capture field catches the strongest thread of it and sets
// it in a blank lattice crystal: a module, a captured imprint of what the
// creature could do. How much of the pattern was caught is its rarity
// (elites and Keepers carry richer patterns); how dense a lattice holds it,
// its tier. Modules socket into crafted bases (items.js), free to swap at
// home, and carry the affixes, the legendary powers and the set.
//
// At the rune bench a module can be grown a tier (its lattice regrown in
// denser ore), one trait rewoven (the rest locked), two woven into one
// (a trait of each), enriched with a Lodestone shard, or imprinted with a
// power the forge remembers. Salvaged, it unravels into threads, which pay
// for all of that.
//
// Also here: what a kill leaves (moduleDrops), research (what the forge
// studies, and the recipes it reveals), an old save's gear turned into
// bases and modules (migrateGearSave), and how a module looks: its icon,
// the crystal on the ground, its capture and the tether as it's taken.
// Never say outright that the dark is alive.
// ---------------------------------------------------------------------------

// Each kind of creature's pattern leans to a family of affix: its modules
// roll one of that family first, where the base can take it.
const FOE_PATTERN = {
  crawler: 'defense', wisp: 'spell', construct: 'close', snapjaw: 'utility', spitter: 'mining',
  skink: 'utility', tusker: 'close', wraith: 'spell', lurker: 'leech', dropper: 'close', eel: 'shock',
  crab: 'defense', weaver: 'chill', sentinel: 'spell', idol: 'defense', hound: 'shock',
};
const FOE_WORDS = { crawler: 'Crawler', wisp: 'Wisp', construct: 'Construct', snapjaw: 'Snapjaw', spitter: 'Spitter', warden: 'Warden', keeper: 'Keeper', hollow: 'Hollow' };
const foeWord = (type) => FOE_WORDS[type] || (typeof FOE_NAMES !== 'undefined' && FOE_NAMES[type] ? FOE_NAMES[type][0] : 'creature');

// Names. A common module is named for the creature it was caught from; a
// magic one by its first trait's family; a rare one in two words; a
// legendary for its power, a set piece for its set.
const MOD_PREFIX = { close: 'Keen', spell: 'Humming', defense: 'Sturdy', utility: 'Light', mining: "Delver's", shock: 'Voltaic', leech: 'Thirsting', chill: 'Rimed' };
const MOD_FIRST = ['Grim', 'Hollow', 'Ember', 'Ashen', 'Star', 'Dusk', 'Iron', 'Pale', 'Rune', 'Vein', 'Night', 'Storm', 'Thorn', 'Deep'];
const MOD_SECOND = {
  caster: ['Eye', 'Whisper', 'Spark', 'Choir', 'Coil', 'Lens'], armor: ['Ward', 'Mantle', 'Hide', 'Bulwark', 'Husk', 'Scale'],
  charm: ['Sigil', 'Knot', 'Mark', 'Seal', 'Token', 'Glim'], pick: ['Tooth', 'Auger', 'Crag', 'Delve', 'Bite', 'Vein'],
};
const MOD_FITS = ['caster', 'armor', 'charm', 'pick'];

// A module's trait at a tier: T.modules.value of an old item's affix.
const modValue = (id, tier, roll) => affixValue(id, tier, roll, T.modules.value);
// A trait this module hasn't got, from one of `families`.
function rollModuleAffix(rng, m, families) {
  const have = new Set(m.affixes.map((a) => a.id));
  const pool = AFFIX_IDS.filter((id) => families.includes(AFFIXES[id].family) && !have.has(id));
  if (!pool.length) return null;
  const id = rng.pick(pool);
  return { id, v: modValue(id, m.tier, rng.f()) };
}
// The powers a module for a kind of base can carry.
const powersFor = (fits) => Object.keys(LEGENDARIES).filter((k) => LEGENDARIES[k].kinds.includes(fits));

// A module for a kind of base (fits), of a tier. opts: { rarity, power,
// set, lean (a family to roll first, if the base can take it), src (where
// it was caught: { foe, clime, elite, deep }), affixes (how many, else the
// rarity's) }.
function makeModule(rng, fits, tier, opts = {}) {
  let rarity = opts.rarity || 'common';
  if (rarity === 'set' && !SETS.regalia.pieces[fits]) rarity = 'rare';
  const m = { uid: newItemUid(), kind: 'module', fits, tier: clamp(tier, 1, T.ores.length), rarity, affixes: [] };
  if (rarity === 'legendary') m.power = opts.power || rng.pick(powersFor(fits));
  if (rarity === 'set') m.set = opts.set || 'regalia';
  const fams = KIND_FAMILIES[fits], n = opts.affixes !== undefined ? opts.affixes : T.modules.affixes[rarity];
  if (opts.lean && fams.includes(opts.lean) && n > 0) { const a = rollModuleAffix(rng, m, [opts.lean]); if (a) m.affixes.push(a); }
  while (m.affixes.length < n) { const a = rollModuleAffix(rng, m, fams); if (!a) break; m.affixes.push(a); }
  if (opts.src) m.src = opts.src;
  m.name = moduleName(rng, m);
  return m;
}

function moduleName(rng, m) {
  if (m.set) return SETS[m.set].pieces[m.fits];
  if (m.power) return LEGENDARIES[m.power].name;
  if (m.woven) return `Woven ${rng.pick(MOD_SECOND[m.fits])}`;
  if (m.rarity === 'rare') return `${rng.pick(MOD_FIRST)} ${rng.pick(MOD_SECOND[m.fits])}`;
  const who = m.src && m.src.foe ? foeWord(m.src.foe) : 'Lattice';
  if (m.rarity === 'magic' && m.affixes[0]) return `${MOD_PREFIX[AFFIXES[m.affixes[0].id].family]} ${who}${who === 'Lattice' ? '' : ' lattice'}`;
  return who === 'Lattice' ? 'Plain lattice' : `${who} lattice`;
}

// Where it was caught, in words: "Caught from an elite Crawler, Bloomfen".
function moduleSource(m) {
  const s = m.src;
  if (!s) return '';
  if (s.was) return `Reset from ${s.was}, made before modules`;
  if (s.relic) return 'Opened from a sealed relic';
  if (s.forge) return 'Found by an ancient forge';
  if (!s.foe) return '';
  const who = foeWord(s.foe), where = [s.clime ? climeName(s.clime) : '', s.deep ? 'a Deep' : ''].filter(Boolean).join(', ');
  const what = s.foe === 'keeper' ? 'the Keeper' : s.foe === 'warden' ? 'a Warden' : `${s.elite ? 'an elite' : /^[AEIOU]/.test(who) ? 'an' : 'a'} ${who}`;
  return `Caught from ${what}${where ? ', ' + where : ''}`;
}
// A module's base line on its card.
function moduleLine(m) {
  const n = moduleTraits(m).length;
  return `${n} trait${n === 1 ? '' : 's'} · socket it into ${KIND_PHRASE[m.fits]}`;
}

// A module's traits: its affixes, then its power or its set bonus.
// { key: 'a0' | 'power' | 'set', text, aff (the affix) }
function moduleTraits(m) {
  const out = m.affixes.map((a, i) => ({ key: 'a' + i, text: fmtAffix(a), aff: a }));
  if (m.power) out.push({ key: 'power', text: LEGENDARIES[m.power].text });
  if (m.set) out.push({ key: 'set', text: `${SETS[m.set].name}: 2 worn, ${SETS[m.set].bonus2.text.toLowerCase()}; 3, ${SETS[m.set].bonus3.text.toLowerCase()}` });
  return out;
}

// A rough worth, for UPGRADE / DOWNGRADE against what's socketed.
function moduleWorth(m) {
  if (!m) return 0;
  let w = 0;
  for (const a of m.affixes) w += a.v * (AFFIX_WORTH[a.id] || 0.3);
  if (m.power) w += 8;
  if (m.set) w += 6;
  return w;
}

// ---------------------------------------------------------------------------
// Drops
// ---------------------------------------------------------------------------
// The chances, times: richer in a Deep, generous at first, and with the
// Capture Lens carried.
function moduleDropMult(d) {
  const D = T.modules.drop, found = (Save.data && Save.data.modsFound) || 0;
  return (d.deep ? D.deep : 1) * (found < D.early.found ? D.early.mult : 1) * (d.tool === 'lens' ? D.lens : 1);
}
// Which kind of base a module is for: by the odds, but only where the
// creature's family can go (a set piece, never a caster).
function moduleFits(rng, lean, notCaster) {
  const F = T.modules.fits;
  const ok = MOD_FITS.filter((k) => (!lean || KIND_FAMILIES[k].includes(lean)) && !(notCaster && k === 'caster'));
  return rng.weighted((ok.length ? ok : MOD_FITS).map((k) => [F[k], k]));
}
// A module rolled for a kill or a find: rarity by the enemy level, at
// least `min`; boost: the legendary and set weights times.
function rollModule(rng, level, tier, min, boost, src) {
  const rarity = rollRarity(rng, level, min, boost), lean = src && src.foe ? FOE_PATTERN[src.foe] : null;
  const fits = moduleFits(rng, rarity === 'set' ? null : lean, rarity === 'set');
  return makeModule(rng, fits, tier, { rarity, lean, src });
}
// What a kill leaves in modules: a Keeper several, a warden two, an elite
// likely one, anything else now and then. Rolled with the dive's rng.
function moduleDrops(d, e) {
  const D = T.modules.drop, rng = d.rng, k = moduleDropMult(d), level = floorLevel(d);
  const src = { foe: e.type, clime: d.clime || null, elite: !!e.elite, deep: !!d.deep };
  let n = 0, min = 'common', boost = 1, tier = dropTier(d);
  if (e.type === 'keeper') { n = D.keeper; min = 'rare'; boost = T.modules.keeperLegend; tier++; }
  else if (e.boss) { n = D.boss; min = 'rare'; tier++; }
  else if (e.elite) { n = rng.chance(Math.min(1, D.elite * k)) ? 1 : 0; min = 'magic'; }
  else n = rng.chance(D.foe * k) ? 1 : 0;
  const out = [];
  for (let i = 0; i < n; i++) out.push(rollModule(rng, level, Math.min(T.ores.length, tier), min, boost, src));
  return out;
}

// A module lies by each ancient forge once ever (a forge's floor is
// rebuilt each time it's entered): true the first time for this floor.
function forgeFindOnce(d) {
  const s = Save.data, key = `${d.seed}:${d.depth}`;
  s.forgeFinds = s.forgeFinds || [];
  if (s.forgeFinds.includes(key)) return false;
  s.forgeFinds.push(key);
  return true;
}

// A sealed relic opens at the Lodestar into a rare module or better.
function unsealRelic(rng, relic) {
  const rarity = rng.weighted([[60, 'rare'], [25, 'legendary'], [15, 'set']]);
  return makeModule(rng, moduleFits(rng, null, rarity === 'set'), relic.tier, { rarity, src: { relic: true } });
}

// ---------------------------------------------------------------------------
// Sockets: free at home, as often as you like
// ---------------------------------------------------------------------------
// Where a module would go: the worn base of its kind with an empty socket
// (a caster: either hand), else the one whose weakest module is weakest.
// { slot, i (the socket), cur (what's there, or null) }, or null if no
// worn base of its kind has a socket.
function moduleTarget(equip, m) {
  const slots = m.fits === 'caster' ? ['main', 'off'] : [KIND_SLOT[m.fits]];
  let best = null;
  for (const slot of slots) {
    const b = equip[slot];
    if (!b || !b.sockets || !b.sockets.length) continue;
    const empty = b.sockets.indexOf(null);
    if (empty >= 0) return { slot, i: empty, cur: null };
    b.sockets.forEach((cur, i) => { if (!best || moduleWorth(cur) < moduleWorth(best.cur)) best = { slot, i, cur }; });
  }
  return best;
}
// ▲ or ▼ for a module against what it would replace.
function moduleUpDown(equip, m) {
  const t = moduleTarget(equip, m);
  if (!t) return '';
  if (!t.cur) return 'up';
  const a = moduleWorth(m), b = moduleWorth(t.cur);
  return a > b * 1.05 ? 'up' : a < b * 0.95 ? 'down' : '';
}
// Sets a module into a base's socket; what was there goes to `list`.
function socketModule(base, i, m, list) {
  if (!base.sockets || i < 0 || i >= base.sockets.length || m.fits !== base.kind) return false;
  if (base.sockets[i]) list.push(base.sockets[i]);
  base.sockets[i] = m;
  return true;
}
function unsocketModule(base, i, list) {
  const m = base.sockets && base.sockets[i];
  if (!m) return null;
  base.sockets[i] = null;
  list.push(m);
  return m;
}
// A base's modules moved into another, socket for socket; what doesn't fit
// goes to `list`.
function moveModules(from, to, list) {
  if (!from || !from.sockets) return;
  for (let i = 0; i < from.sockets.length; i++) {
    const m = from.sockets[i];
    if (!m) continue;
    from.sockets[i] = null;
    const j = to.sockets ? to.sockets.indexOf(null) : -1;
    if (j >= 0 && m.fits === to.kind) to.sockets[j] = m; else list.push(m);
  }
}

// ---------------------------------------------------------------------------
// The rune bench
// ---------------------------------------------------------------------------
// A cost: { threads, ore: { id, n } | null, stuff: [{ id, n }] }. What's
// short of it in `src`, and paying it.
function benchShort(cost, src) {
  const out = [];
  if ((src.thread || 0) < cost.threads) out.push({ id: 'thread', n: cost.threads - (src.thread || 0) });
  if (cost.ore && (src[cost.ore.id] || 0) < cost.ore.n) out.push({ id: cost.ore.id, n: cost.ore.n - (src[cost.ore.id] || 0) });
  for (const s of cost.stuff || []) if ((src[s.id] || 0) < s.n) out.push({ id: s.id, n: s.n - (src[s.id] || 0) });
  return out;
}
function benchPay(cost, src) {
  if (benchShort(cost, src).length) return false;
  const take = (id, n) => { if (!n) return; src[id] -= n; if (!src[id]) delete src[id]; };
  take('thread', cost.threads);
  if (cost.ore) take(cost.ore.id, cost.ore.n);
  for (const s of cost.stuff || []) take(s.id, s.n);
  return true;
}

// An affix carried to another tier: its value grows (or not, if flat) as
// the tier's range does, times k.
function rescaleAffix(a, from, to, k = 1) {
  const A = AFFIXES[a.id], g = (t) => (A.flat ? 1 : 1 + T.items.affixGrowth * (Math.max(1, t) - 1)), p = Math.pow(10, A.dp || 0);
  const v = Math.round(a.v * (g(to) / g(from)) * k * p) / p;
  return { id: a.id, v: to > from || k > 1 ? Math.max(v, a.v + (A.flat && k === 1 ? 0 : 1 / p)) : v };
}

// A tier up: its lattice regrown in the next ore, every trait stronger.
function upgradeCost(m) {
  if (m.tier >= T.ores.length) return null;
  const U = T.modules.upgrade;
  return { threads: U.threads[m.tier], ore: { id: T.ores[m.tier].id, n: U.ore } };
}
function moduleUpgrade(m) {
  if (m.tier >= T.ores.length) return false;
  m.affixes = m.affixes.map((a) => rescaleAffix(a, m.tier, m.tier + 1));
  m.tier++;
  return true;
}

// One trait rewoven, the rest locked: a new affix of the module's kind, at
// its tier. `lean`: a family to reweave it into (Bloodresin's: leech).
function rerollCost(m) {
  const R = T.modules.reroll;
  return { threads: R.threads + R.perTier * (m.tier - 1), ore: { id: oreOfTier(m.tier).id, n: R.ore } };
}
function moduleReroll(rng, m, i, lean) {
  if (!m.affixes[i]) return false;
  const rest = { affixes: m.affixes.filter((_, j) => j !== i), tier: m.tier };
  const fams = KIND_FAMILIES[m.fits], old = AFFIXES[m.affixes[i].id].family;
  // never the trait it had, if there's another to be had
  let fresh = lean ? rollModuleAffix(rng, rest, [lean]) : null;
  for (let k = 0; !fresh && k < 8; k++) { const a = rollModuleAffix(rng, rest, fams.includes(old) ? fams : fams.concat([old])); if (a && (a.id !== m.affixes[i].id || k === 7)) fresh = a; }
  if (!fresh) return false;
  m.affixes[i] = fresh;
  if (m.rarity === 'magic' && i === 0 && !m.woven) m.name = moduleName(rng, m);
  return true;
}

// Two woven into one: a trait of each kept, at the higher tier, a little
// stronger; both are used up. The first's kind of base.
function fuseCost(a, b) {
  const F = T.modules.fuse, tier = Math.max(a.tier, b.tier);
  return { threads: F.threads + F.perTier * (tier - 1), ore: { id: oreOfTier(tier).id, n: F.ore } };
}
// Why two traits can't be woven together, or null if they can.
function fuseProblem(a, ta, b, tb) {
  if (!a || !b || a === b) return 'Choose two modules';
  const A = moduleTraits(a).find((t) => t.key === ta), B = moduleTraits(b).find((t) => t.key === tb);
  if (!A || !B) return 'Choose a trait from each';
  if (A.aff && B.aff && A.aff.id === B.aff.id) return 'The same trait twice will not hold';
  const special = [ta, tb].filter((k) => k === 'power' || k === 'set').length;
  if (special > 1) return 'A lattice holds one power or set, not two';
  if (tb === 'power' && !LEGENDARIES[b.power].kinds.includes(a.fits)) return `${LEGENDARIES[b.power].name} can't sit in ${KIND_PHRASE[a.fits]} module`;
  if (tb === 'set' && !SETS[b.set].pieces[a.fits]) return `The set has no piece for ${KIND_PHRASE[a.fits]}`;
  return null;
}
function moduleFuse(rng, a, ta, b, tb) {
  if (fuseProblem(a, ta, b, tb)) return null;
  const tier = Math.max(a.tier, b.tier), k = 1 + T.modules.fuse.boost;
  const m = { uid: newItemUid(), kind: 'module', fits: a.fits, tier, rarity: 'rare', affixes: [], woven: true, src: a.src };
  for (const [from, key] of [[a, ta], [b, tb]]) {
    if (key === 'power') m.power = from.power;
    else if (key === 'set') m.set = from.set;
    else m.affixes.push(rescaleAffix(from.affixes[Number(key.slice(1))], from.tier, tier, k));
  }
  if (m.power) m.rarity = 'legendary';
  if (m.set) m.rarity = 'set';
  m.name = moduleName(rng, m);
  return m;
}

// A Lodestone shard and threads add a trait (common to magic, magic to
// rare).
function canEnrich(m) { return !m.woven && (m.rarity === 'common' || m.rarity === 'magic'); }
function enrichCost() { const E = T.modules.enrich; return { threads: E.threads, ore: null, stuff: [{ id: 'lodeshard', n: E.shards }] }; }
function moduleEnrich(rng, m) {
  if (!canEnrich(m)) return false;
  const a = rollModuleAffix(rng, m, KIND_FAMILIES[m.fits]);
  if (!a) return false;
  m.affixes.push(a);
  m.rarity = m.rarity === 'common' ? 'magic' : 'rare';
  m.name = moduleName(rng, m);
  return true;
}

// A power the forge remembers (the Codex: every legendary salvaged at
// home), set into a module that has no power or set: it turns legendary.
// Paid with a heart (the lowest grade there is) or riftglass, and threads.
function imprintPowers(m) { return m.power || m.set ? [] : (Save.data.codex || []).filter((k) => LEGENDARIES[k] && LEGENDARIES[k].kinds.includes(m.fits)); }
function imprintCost(src) {
  const I = T.modules.imprint;
  for (const g of [1, 2, 3]) if ((src[partId('heart', g)] || 0) > 0) return { threads: I.threads, ore: null, stuff: [{ id: partId('heart', g), n: 1 }] };
  return { threads: I.threads, ore: null, stuff: [{ id: 'riftglass', n: I.glass }] };
}
function moduleImprint(m, power) {
  if (m.power || m.set || !LEGENDARIES[power] || !LEGENDARIES[power].kinds.includes(m.fits)) return false;
  m.power = power; m.rarity = 'legendary'; m.imprinted = true;
  m.name = LEGENDARIES[power].name;
  return true;
}

// Unravelled into threads: more for a richer pattern and a denser lattice.
function salvageThreads(m) { const S = T.modules.salvage; return S[m.rarity] + S.perTier * (m.tier - 1); }

// ---------------------------------------------------------------------------
// Research
// ---------------------------------------------------------------------------
// Whether a research's thing is at home: an ore, a part (any grade) or an
// exotic in the stash, or a module caught from its kind of creature in the
// stash or socketed.
function researchHas(s, r) {
  const k = r.id.split(':')[0];
  if (k === 'ore' || k === 'ex') return (s.stash[r.of] || 0) > 0;
  if (k === 'part') return [1, 2, 3].some((g) => (s.stash[partId(r.of, g)] || 0) > 0);
  const mods = s.items.filter((x) => x.kind === 'module').concat(SLOTS.flatMap((k2) => baseModules(s.equip[k2])));
  return mods.some((m) => r.of === 'any' || (m.src && m.src.foe === r.of));
}
// What the forge has yet to study, of what's at home.
function researchDue(s = Save.data) {
  const done = new Set(s.studied || []);
  return RESEARCH.filter((r) => !done.has(r.id) && researchHas(s, r));
}
// The forge studies everything new at home: each one's recipes are known
// from now on. Returns [{ r, opened (the recipes it revealed that weren't
// known) }], the finds that revealed something.
function researchStudy(s = Save.data) {
  const out = [];
  s.studied = s.studied || [];
  for (const r of researchDue(s)) {
    s.studied.push(r.id);
    const opened = r.opens.filter((id) => BLUEPRINTS[id] && !s.blueprints.includes(id));
    for (const id of opened) s.blueprints.push(id);
    if (opened.length) out.push({ r, opened });
  }
  return out;
}
// What a research studied, in words, and its icon.
function researchWhat(r) {
  const k = r.id.split(':')[0];
  if (k === 'ore' || k === 'ex') return stuffName(r.of);
  if (k === 'part') return PARTS[r.of].name.charAt(0).toUpperCase() + PARTS[r.of].name.slice(1);
  return r.of === 'any' ? 'A module' : `A ${foeWord(r.of)}'s module`;
}
function researchIconUrl(r) {
  const k = r.id.split(':')[0];
  if (k === 'part') return stuffIconUrl(partId(r.of, 1));
  if (k === 'mod') return moduleIconUrl({ kind: 'module', fits: 'caster', rarity: 'magic' });
  return stuffIconUrl(r.of);
}

// ---------------------------------------------------------------------------
// An old save: gear from before modules
// ---------------------------------------------------------------------------
// A piece with rolled affixes becomes a base of its recipe and tier (its
// numbers kept), and what it rolled becomes a module of its rarity in its
// first socket (or with `spill`, if it has none or it's `loose`): its
// affixes, its power or its set piece, so nothing it did is lost.
function migrateOldPiece(it, spill, loose) {
  if (!it || !KIND_SLOT[it.kind] || Array.isArray(it.sockets)) return it;
  const bpId = it.bp && BLUEPRINTS[it.bp] && BLUEPRINTS[it.bp].kind === it.kind ? it.bp : KIND_BLUEPRINT[it.kind];
  const keepName = /^(Scrap Gauntlet|Cracked Wand|Rusty Pick)$/.test(it.name || '');
  const base = { uid: it.uid, kind: it.kind, bp: bpId, tier: it.tier, q: 0, rarity: 'common', base: it.base || baseStats(it.kind, it.tier, BLUEPRINTS[bpId]), affixes: [], sockets: new Array(socketCount(it.kind, it.tier, 0)).fill(null) };
  if (it.kind === 'caster') { base.slots = Array.isArray(it.slots) ? it.slots : [null, null, null]; if (it.links && it.links.length) base.links = it.links; }
  if (it.fav) base.fav = true;
  base.name = keepName ? it.name : baseName(base);
  const affixes = (it.affixes || []).filter((a) => a && AFFIXES[a.id]).map((a) => ({ id: a.id, v: a.v }));
  const power = it.power && LEGENDARIES[it.power] ? it.power : null, set = it.set && SETS[it.set] && SETS[it.set].pieces[it.kind] ? it.set : null;
  if (affixes.length || power || set) {
    const rarity = power ? 'legendary' : set ? 'set' : RARITIES.includes(it.rarity) ? it.rarity : 'magic';
    const m = { uid: newItemUid(), kind: 'module', fits: it.kind, tier: Math.max(1, it.tier || 1), rarity, affixes, src: { was: it.name || 'an old piece' } };
    if (power) m.power = power;
    if (set) m.set = set;
    m.name = rarity === 'rare' && it.name ? it.name : moduleName(new Rng(it.uid || 1), m);
    if (base.sockets.length && !loose) base.sockets[0] = m; else spill.push(m);
  }
  return base;
}
// Turns an old save's gear (worn, stashed, and in a sortie's cargo and
// pocket) into bases and modules. The save's blueprints are its known
// recipes already, and its relics open into modules now. True if anything
// changed.
function migrateGearSave(s) {
  if ((s.v || 0) >= 6) return false;
  const spill = [];
  for (const k of Object.keys(s.equip || {})) s.equip[k] = migrateOldPiece(s.equip[k], spill);
  // (a stashed or carried piece's module lies beside it, where it's seen)
  s.items = (s.items || []).map((it) => migrateOldPiece(it, spill, true));
  s.items.push(...spill.splice(0));
  if (s.run) {
    s.run.items = (s.run.items || []).map((it) => migrateOldPiece(it, spill, true));
    s.run.items.push(...spill.splice(0));
    for (const e of s.run.pocket || []) if (e.item) e.item = migrateOldPiece(e.item, spill);
    s.items.push(...spill.splice(0));
  }
  // every recipe an old forge made from the start is still known
  s.blueprints = (s.blueprints || []).concat(BP_IDS.filter((id) => BLUEPRINTS[id].start && !(s.blueprints || []).includes(id)));
  s.studied = s.studied || [];
  s.v = 6;
  return true;
}

// ---------------------------------------------------------------------------
// Looks: the icon, the crystal on the ground, the capture and the tether
// ---------------------------------------------------------------------------
// The crystal by the kind of base it's for: a tall point for a caster, a
// broad shield for armor, a round cut for a charm, a wedge for a pick. A
// light face (b), a mid face (c), a shaded face (d), its edge (a), a glint.
const MODULE_ICON_ROWS = {
  caster: ['.......aa.......', '......abba......', '.....abbcca.....', '....abbbccda....', '....abbbccda....', '...abbwbccdda...', '...abbbbccdda...', '...abbbbccdda...', '...abbbbccdda...', '...abbbbccdda...', '....abbbccda....', '....abbbccda....', '.....abbcca.....', '......abca......', '.......aa.......', '................'],
  armor: ['................', '....aaaaaaaa....', '...abbbbcccda...', '..abbwbbccccda..', '..abbbbbccccda..', '..abbbbbccccda..', '..abbbbbccccda..', '...abbbbcccda...', '...abbbbcccda...', '....abbbccda....', '....abbbccda....', '.....abbcda.....', '......abca......', '.......aa.......', '................', '................'],
  charm: ['................', '................', '......aaaa......', '....aabbccaa....', '...abbwbcccda...', '...abbbbcccda...', '..abbbbbccccda..', '..abbbbbccccda..', '..abbbbbccccda..', '...abbbbcccda...', '...abbbbcccda...', '....aabbccaa....', '......aaaa......', '................', '................', '................'],
  pick: ['................', '..aaa...........', '..abbaa.........', '..abwbbaa.......', '..abbbbbcaa.....', '...abbbbccca....', '...abbbbcccdaa..', '....abbbcccdda..', '....abbbccddda..', '.....abbccdda...', '.....abbcdda....', '......abcda.....', '......aaaa......', '................', '................', '................'],
};
const _modIcons = new Map();
// A module's icon (a data URL): its crystal in its rarity's colour (a
// woven one with a pale core).
function moduleIconUrl(m) {
  const col = (ART.rarity[m.rarity] || '#ffffff'), key = `${m.fits}/${col}/${m.woven ? 1 : 0}`;
  let url = _modIcons.get(key);
  if (url) return url;
  const rows = MODULE_ICON_ROWS[m.fits] || MODULE_ICON_ROWS.caster, c = document.createElement('canvas');
  c.width = 16; c.height = 16;
  const x = c.getContext('2d'), pal = { a: mix(col, '#000000', 0.7), b: mix(col, '#ffffff', 0.35), c: col, d: mix(col, '#000000', 0.38), w: '#ffffff' };
  rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const ch = r[i]; if (!pal[ch]) continue; x.fillStyle = m.woven && ch === 'c' && i % 2 === j % 2 ? '#f4f0ff' : pal[ch]; x.fillRect(i, j, 1, 1); } });
  url = c.toDataURL();
  _modIcons.set(key, url);
  return url;
}
// Threads in the stash: a loose coil of light.
const THREAD_ROWS = ['................', '.....aaaa.......', '...aa....aa.....', '..a..bbbb..a....', '..a.b....b.a....', '..a.b.cc.b.a....', '..a.b.c..b.a....', '...a.bb.b.a.....', '....a...a.......', '.....aaa..cc....', '..........c.c...', '...........c....', '................'];
let _threadIcon = null;
function threadIconUrl() {
  if (_threadIcon) return _threadIcon;
  const c = document.createElement('canvas');
  c.width = 16; c.height = 13;
  const x = c.getContext('2d'), pal = { a: '#a898d8', b: '#d8ccff', c: '#ffffff' };
  THREAD_ROWS.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (pal[r[i]]) { x.fillStyle = pal[r[i]]; x.fillRect(i, j, 1, 1); } });
  return (_threadIcon = c.toDataURL());
}

// The crystal on the ground (painted, as the other drops): a lattice point
// standing on a dark scatter, its faces in the rarity's tones.
const _modDrops = new Map();
function moduleDropSprite(col) {
  let s = _modDrops.get(col);
  if (s) return s;
  const r = [mix(col, '#000000', 0.62), mix(col, '#000000', 0.3), col, mix(col, '#ffffff', 0.5)], W = '#ffffff';
  const S = new PntSpr(9, 13, 0x1a77);
  for (let x = 1; x <= 7; x++) S.px(x, 12, r[0]);
  // a six-sided point: lit left faces, a bright edge, shaded right
  for (let y = 0; y < 12; y++) {
    const half = y < 3 ? y + 1 : y > 9 ? 12 - y : 3;
    for (let i = -half; i <= half; i++) {
      // the faces glow (the captured pattern's own light, so the crystal
      // is seen in the dark); only the shaded edge doesn't
      const c = i < -1 ? r[3] : i < 1 ? (i === -1 ? r[3] : r[2]) : i < 2 ? r[1] : r[0];
      S.px(4 + i, y, c, c !== r[0]);
    }
  }
  S.px(3, 3, W, true); S.px(3, 4, r[3], true);
  s = S.done();
  _modDrops.set(col, s);
  return s;
}
// Drawn for a drop that's a module (render.js drawDrop): it settles out of
// its capture, rings the ground in its colour a few times so it's seen
// after the fight, then glints now and then.
// (settled once its capture has collapsed: the capture runs on the world's
// time, which a kill's hit-stop slows)
const modSettled = (dr) => !dr.cap || dr.cap.t <= dr.cap.max * 0.22;
function drawModuleDrop(dr, fx, fy, col) {
  if (!modSettled(dr)) return;
  if (dr.settleT === undefined) dr.settleT = dr.t;
  const s = moduleDropSprite(col);
  drawShadow(fx, fy + ap(3), 2.5);
  const since = dr.t - dr.settleT;
  if (since < 2.4) {
    // a ring on the ground, out from its foot, every 0.8 s
    const ph = (since % 0.8) / 0.8, r = ap(4 + ph * 10);
    ringDots(fx, fy + ap(3), r, col, (1 - ph) * (1 - since / 2.4) * 0.9, true);
  }
  drawArtSprite(s, fx - 4, fy - 8);
  const ph = (Game.realT + (dr.x % 7) * 0.31) % 1.8;
  if (ph < 0.16) {
    const a = 1 - ph / 0.16, gx = fx - 1, gy = fy - 6;
    dot(gx, gy, '#ffffff', true, a);
    for (const [i, j] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) dot(gx + i, gy + j, '#ffffff', true, a * 0.6);
    for (const [i, j] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) dot(gx + i, gy + j, col, true, a * 0.35);
  }
}

// Where a creature fell, its energy draws in and collapses into the
// crystal; taken, the capture field's tether pulls a few motes to the
// Kindler.
function moduleCaptureFx(d, x, y, col) { const fx = { kind: 'capture', x, y, col, t: 0.7, max: 0.7, s: (x * 7 + y * 13) | 0 }; d.fx.push(fx); return fx; }
function moduleTetherFx(d, x, y, col) { d.fx.push({ kind: 'tether', x, y, col, t: 0.32, max: 0.32 }); }
// (render.js drawCombatFx) k runs 1 to 0 over the effect.
function drawModuleFx(fx, cx, cy, k, lights, ox, oy) {
  if (fx.kind === 'capture') {
    // the pattern's energy spirals in (bold motes, each with a short tail,
    // so it reads over a death's burst), then collapses with a white flash
    // and a ring thrown out in the rarity's colour as the crystal forms
    const t = 1 - k, draw = Math.min(1, t / 0.78), n = 12, oy = cy - ap(5);
    if (draw < 1) {
      const e = draw * draw;
      for (let i = 0; i < n; i++) {
        for (let tail = 0; tail < 3; tail++) {
          const q = Math.max(0, e - tail * 0.05), a = (i / n) * Math.PI * 2 + fx.s * 0.37 + q * 3.2, r = (1 - q) * (20 + (i % 3) * 5) * AP;
          const x = Math.round(cx + Math.cos(a) * r), y = Math.round(oy + Math.sin(a) * r * 0.7), c = tail ? fx.col : i % 3 ? fx.col : '#ffffff', al = (0.5 + 0.5 * draw) * (1 - tail * 0.3);
          // (a dark foot under each, so it reads on a lit floor)
          if (!tail) { dot(x, y + 2, '#000000', false, al * 0.45); dot(x + 1, y + 2, '#000000', false, al * 0.45); }
          dot(x, y, c, true, al);
          if (!tail) { dot(x + 1, y, c, true, al); dot(x, y + 1, c, true, al); dot(x + 1, y + 1, c, true, al); }
        }
      }
    } else {
      const f = (t - 0.78) / 0.22, r = ap(3 + f * 12);
      for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (Math.abs(i) + Math.abs(j) <= 2) dot(cx + i, oy + j, '#ffffff', true, 1 - f);
      ringDots(cx, oy, r, fx.col, 1 - f, true);
      ringDots(cx, oy, Math.max(1, r - ap(2)), '#ffffff', (1 - f) * 0.5, true);
    }
    lights.push({ x: cx, y: oy, r: TILE * (0.8 + draw * 1.2), i: draw < 1 ? 0.4 + 0.5 * draw : 1.2 * (1 - (t - 0.78) / 0.22), c: rgb01(fx.col) });
    return;
  }
  // the tether: a line of the field's light, motes running along it home
  const p = Game.dive.p, px = Math.round(p.x * AP) + ox, py = Math.round((p.y - 8) * AP) + oy;
  const n = Math.max(4, Math.round(Math.hypot(px - cx, py - cy) / 3));
  for (let i = 0; i <= n; i++) if (i % 2 === 0) dot(Math.round(cx + ((px - cx) * i) / n), Math.round(cy + ((py - cy) * i) / n), fx.col, true, 0.5 * k);
  for (let m = 0; m < 5; m++) {
    const t = Math.min(1, (1 - k) * 1.3 + m * 0.1), x = Math.round(cx + (px - cx) * t), y = Math.round(cy - ap(5) + (py - cy + ap(5)) * t), c = m % 2 ? '#ffffff' : fx.col;
    for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1]]) dot(x + i, y + j, c, true, 1 - t * 0.4);
  }
  lights.push({ x: px, y: py, r: TILE, i: 0.5 * k, c: rgb01(fx.col) });
}
