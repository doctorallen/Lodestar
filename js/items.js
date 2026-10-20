'use strict';
// ---------------------------------------------------------------------------
// Gear: the affix table, rarities, legendary powers and the set (which
// modules carry, modules.js); crafted bases (casters, plate, charms,
// picks) and the stones circuits are built from; sealed relics; forging a
// base from its recipe; salvaging one; and the stats an outfit adds up to,
// the modules in its sockets with it. What can be made is in blueprints.js;
// how a circuit casts, in circuits.js.
//
// A base is exact. Its recipe and its ore's tier set its stats, its
// circuit slots (a caster's, by the size chosen) and its module sockets;
// the anvil's quality only adds (T.gear). It never rolls an affix: what
// gives it an identity is what's socketed into it.
// ---------------------------------------------------------------------------

// Affixes, the traits a module carries. lo–hi at tier 1, grown by
// T.items.affixGrowth a tier (a module's are T.modules.value of that). dp:
// decimal places. flat: doesn't grow with the tier.
const AFFIXES = {
  closeDmg: { family: 'close', text: '+{v}% close spell damage', lo: 8, hi: 15 },
  castSpeed: { family: 'close', text: '+{v}% cast speed', lo: 5, hi: 10 },
  crit: { family: 'close', text: '+{v}% critical chance', lo: 3, hi: 6 },
  spellDmg: { family: 'spell', text: '+{v}% spell damage', lo: 8, hi: 15 },
  chargeRegen: { family: 'spell', text: '+{v}% charge regeneration', lo: 10, hi: 20 },
  maxCharge: { family: 'spell', text: '+{v} max charge', lo: 4, hi: 8 },
  maxHp: { family: 'defense', text: '+{v} max health', lo: 8, hi: 15 },
  armor: { family: 'defense', text: '+{v} armor', lo: 3, hi: 6 },
  regen: { family: 'defense', text: '+{v} health a second', lo: 0.3, hi: 0.6, dp: 1 },
  moveSpeed: { family: 'utility', text: '+{v}% move speed', lo: 4, hi: 8, flat: true },
  magnet: { family: 'utility', text: '+{v} pickup reach', lo: 6, hi: 12, flat: true },
  mineSpeed: { family: 'mining', text: '+{v}% mining speed', lo: 10, hi: 20 },
  oreLuck: { family: 'mining', text: '+{v}% chance of double ore', lo: 6, hi: 12 },
  shock: { family: 'shock', text: '{v}% chance to arc lightning on hit', lo: 5, hi: 10 },
  leech: { family: 'leech', text: '{v}% of damage dealt heals you', lo: 2, hi: 4, dp: 1 },
  chill: { family: 'chill', text: '{v}% chance to chill on hit', lo: 8, hi: 15 },
};
const AFFIX_IDS = Object.keys(AFFIXES);

// Which affix families a module for each kind of base can roll.
const KIND_FAMILIES = {
  caster: ['spell', 'close', 'shock', 'leech', 'chill', 'utility'],
  armor: ['defense', 'utility'],
  charm: ['close', 'spell', 'defense', 'utility', 'mining', 'shock', 'leech', 'chill'],
  pick: ['mining', 'utility'],
};
const KIND_NAMES = { caster: 'Caster', armor: 'Plate', charm: 'Charm', pick: 'Pick', stone: 'Stone', relic: 'Sealed relic', module: 'Module' };
// what a base of a kind is called in a sentence ("a module for armor")
const KIND_WORDS = { caster: 'caster', armor: 'armor', charm: 'charm', pick: 'pick' };
const KIND_PHRASE = { caster: 'a caster', armor: 'armor', charm: 'a charm', pick: 'a pick' };
const KIND_SLOT = { caster: 'hand', armor: 'armor', charm: 'charm', pick: 'pick' };
const SLOTS = ['main', 'off', 'pick', 'armor', 'charm'];
const SLOT_NAMES = { main: 'Main hand', off: 'Off hand', pick: 'Pick', armor: 'Armor', charm: 'Charm' };
const QUALITY_NAMES = ['Rough', 'Fair', 'Fine', 'Masterwork'];

const RARITIES = ['common', 'magic', 'rare', 'legendary', 'set'];
const RARITY_NAMES = { common: 'Common', magic: 'Magic', rare: 'Rare', legendary: 'Legendary', set: 'Set' };

// Legendary powers: each changes how you play, and fits certain kinds. A
// module carries one; a caster's own power acts on its own circuit.
const LEGENDARIES = {
  seismic: { name: 'Faultline', kinds: ['pick'], text: 'Breaking a vein sends out a shockwave' },
  echo: { name: 'Twice-Told', kinds: ['caster'], text: 'Every Form in its circuit fires twice' },
  bloodedge: { name: 'Redwake', kinds: ['caster'], text: 'Critical hits heal 4% of max health' },
  lodeheart: { name: 'Lodeheart', kinds: ['armor', 'charm'], text: 'Kills heal 3 and pull nearby loot to you' },
  stormcaller: { name: 'Stormcaller', kinds: ['caster'], text: 'Bolts chain to two more enemies' },
};

// The set: three modules, for a pick, armor and a charm, socketed anywhere
// worn.
const SETS = {
  regalia: {
    name: "Prospector's Regalia",
    pieces: { pick: "Prospector's Edge", armor: "Prospector's Seam", charm: "Prospector's Token" },
    bonus2: { text: '+20% mining speed, +6 pickup reach', mineSpeed: 20, magnet: 6 },
    bonus3: { text: 'Breaking a vein heals 3; +20% chance of double ore', oreLuck: 20 },
  },
};

// The ore of a tier (tier 0, the rusty pick, counts as Ferrite).
const oreOfTier = (tier) => T.ores[clamp(tier, 1, T.ores.length) - 1];
const tierScale = (tier) => Math.pow(T.items.tierGrowth, Math.max(1, tier) - 1);

let _uidFallback = 1;
function newItemUid() {
  if (typeof Save !== 'undefined' && Save.data) return Save.data.uid++;
  return _uidFallback++;
}

// ---------------------------------------------------------------------------
// Rolling
// ---------------------------------------------------------------------------
// An affix's value at a tier, `roll` (0–1) of the way through its range,
// times `k`.
function affixValue(id, tier, roll, k = 1) {
  const a = AFFIXES[id];
  const grow = a.flat ? 1 : 1 + T.items.affixGrowth * (Math.max(1, tier) - 1);
  const v = (a.lo + (a.hi - a.lo) * roll) * grow * k;
  const p = Math.pow(10, a.dp || 0);
  return Math.max(a.dp ? 0.1 : 1, Math.round(v * p) / p);
}

// A rarity by enemy level, at least `min`; `boost` multiplies the
// legendary and set weights.
function rollRarity(rng, level, min = 'common', boost = 1) {
  const floor = RARITIES.indexOf(min);
  const list = RARITIES.filter((r, i) => i >= floor).map((r) => {
    const [base, per] = T.loot.rarity[r];
    return [Math.max(0.1, base + per * level) * (r === 'legendary' || r === 'set' ? boost : 1), r];
  });
  return rng.weighted(list);
}

// ---------------------------------------------------------------------------
// Bases
// ---------------------------------------------------------------------------
// A base's numbers: by its kind, tier and recipe, and q (the anvil's
// quality, 0–3), which only adds.
function baseStats(kind, tier, bp = BLUEPRINTS[KIND_BLUEPRINT[kind]], q = 0) {
  const I = T.items, s = tierScale(tier), m = (bp && bp.mult) || 1, up = 1 + T.gear.stat[clamp(q, 0, 3)];
  if (kind === 'caster') return { power: Math.round(I.caster.power * s * m * up * 10) / 10 };
  if (kind === 'armor') return { armor: Math.round(I.armor.armor * (1 + I.armor.armorGrowth * (Math.max(1, tier) - 1)) * m * up), hp: Math.round(I.armor.hp * Math.pow(I.armor.hpGrowth, Math.max(1, tier) - 1) * Math.sqrt(m) * up) };
  if (kind === 'pick') { const power = tier + 1; return { power, speed: Math.round((1 + I.pick.speedGrowth * (power - 1)) * m * up * 100) / 100 }; }
  return {};
}

// How many module sockets a base has: by its tier, and one more from a
// masterwork. The rusty pick has none.
function socketCount(kind, tier, q = 0) {
  if (kind === 'pick' && tier < 1) return 0;
  const S = kind === 'pick' ? T.gear.pickSockets : T.gear.sockets;
  return S[clamp(tier, 1, S.length) - 1] + (q >= 3 ? T.gear.masterSocket : 0);
}

// How many circuit slots a caster of a recipe has, made at a size, in an
// ore of a tier (Starmetal adds one).
function casterSlotCount(bpId, size, tier = 1) {
  const way = T.circuits.ores[oreOfTier(tier).id] || {};
  return (size || casterSizes(bpId)[0]) + (way.slots || 0);
}

// A base, exactly as its recipe says: in an ore of `tier`, forged at
// quality q (0–3), a caster at `size` slots. A masterwork caster links its
// second and third slots: a Glyph in either counts twice.
function makeBase(bpId, tier, q = 0, size) {
  const bp = BLUEPRINTS[bpId], kind = bp.kind;
  const item = { uid: newItemUid(), kind, bp: bpId, tier, q: clamp(q, 0, 3), rarity: 'common', base: baseStats(kind, tier, bp, q), affixes: [], sockets: new Array(socketCount(kind, tier, q)).fill(null) };
  if (kind === 'caster') {
    item.slots = new Array(casterSlotCount(bpId, size, tier)).fill(null);
    if (q >= 3 && item.slots.length >= 3) item.links = [1];
  }
  item.name = baseName(item);
  return item;
}

// "Lumenite Wand"; the rusty pick.
function baseName(item) {
  if (item.kind === 'pick' && item.tier === 0) return 'Rusty Pick';
  const bp = bpOf(item);
  return `${oreOfTier(item.tier).name} ${bp ? bp.name : KIND_NAMES[item.kind]}`;
}

// A stone for a circuit: a Form, an Element or a Glyph, of a tier.
function makeStone(stone, tier) {
  return { uid: newItemUid(), kind: 'stone', stone, tier: clamp(tier, 1, T.ores.length), rarity: 'magic', affixes: [], name: `${stoneWords(stone).name} stone` };
}

function makeRelic(tier) {
  return { uid: newItemUid(), kind: 'relic', tier: Math.max(1, tier), rarity: 'relic', affixes: [], name: 'Sealed relic' };
}

// A Scrap Gauntlet with an Arc in it and a Cracked Wand with a Bolt: the
// first fight has close and far, and both have room to grow. Each has a
// module socket; the rusty pick has none.
function startingGear() {
  const gauntlet = makeBase('gauntlet', 1, 0);
  gauntlet.base.power = 5; gauntlet.name = 'Scrap Gauntlet'; gauntlet.slots[0] = makeStone('arc', 1);
  const wand = makeBase('wand', 1, 0);
  wand.base.power = 5; wand.name = 'Cracked Wand'; wand.slots[0] = makeStone('bolt', 1);
  const pick = makeBase('pick', 0, 0);
  return { main: gauntlet, off: wand, pick, armor: null, charm: null };
}

// Makes what a recipe makes, in an ore, at the anvil's quality q (0–3),
// a caster at `size` slots, maybe with an exotic: riftglass forges it a
// tier above its ore; an elemental exotic worked into a caster brings its
// Element's stone out with it (item.withStone). A stone comes out a tier
// higher from a fine forge. The caller has checked and paid the cost.
function forgeItem(bpId, oreId, exoticId, q = 0, size) {
  const bp = BLUEPRINTS[bpId], ex = exoticId && T.exotics.find((e) => e.id === exoticId);
  const tier = Math.min(T.ores.length, T.ores[ORE_INDEX[oreId]].tier + (ex && ex.tierUp ? 1 : 0));
  if (bp.kind === 'stone') return makeStone(bp.stone, tier + (q >= 2 ? 1 : 0));
  const item = makeBase(bpId, tier, q, size);
  if (bp.kind === 'caster' && ex && ex.element) item.withStone = makeStone(ex.element, tier);
  return item;
}
// What an optional exotic does for a recipe, in words (null: nothing).
function exoticForgeWord(bpId, ex) {
  const bp = BLUEPRINTS[bpId];
  if (!ex || bp.kind === 'stone' || bp.kind === 'tool') return null;
  if (ex.tierUp) return 'a tier above its ore';
  if (ex.element && bp.kind === 'caster') return `with a ${CIRCUIT_ELEMENTS[ex.element].name} stone`;
  return null;
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------
function fmtAffix(a) { return AFFIXES[a.id].text.replace('{v}', a.v); }

function itemBaseLine(item) {
  const b = item.base || {};
  if (item.kind === 'module') return moduleLine(item);
  if (item.kind === 'caster') { const el = (T.circuits.ores[oreOfTier(item.tier).id] || {}).el; return `${b.power} spell power · ${(item.slots || []).length} slots${item.links && item.links.length ? ' (2 linked)' : ''}${el ? ` · attuned to ${CIRCUIT_ELEMENTS[el].name}` : ''}`; }
  if (item.kind === 'armor') return `${b.armor} armor, +${b.hp} max health`;
  if (item.kind === 'pick') { const top = T.ores.filter((o) => o.tier <= b.power).pop(); return `Breaks up to ${top ? top.name : 'nothing'}, ${b.speed}× speed`; }
  if (item.kind === 'stone') return stoneLine(item.stone);
  if (item.kind === 'relic') return `Tier ${item.tier}. The Lodestar's light will open it: a rare module, or better.`;
  return '';
}

function itemKindLine(item) {
  if (item.kind === 'relic') return 'Sealed relic';
  if (item.kind === 'stone') return `${STONE_KIND_NAMES[stoneKind(item.stone)]} stone · tier ${item.tier}`;
  if (item.kind === 'module') return `${item.woven ? 'Woven' : RARITY_NAMES[item.rarity]} module for ${KIND_PHRASE[item.fits]} · tier ${item.tier}`;
  const bp = bpOf(item), n = (item.sockets || []).length;
  return `${item.q ? QUALITY_NAMES[item.q] + ' ' : ''}${(bp ? bp.name : KIND_NAMES[item.kind]).toLowerCase()} · tier ${item.tier} · ${n ? `${n} socket${n > 1 ? 's' : ''}` : 'no sockets'}`;
}

// What else a piece says about itself: its recipe's way.
function itemNotes(item) {
  const out = [], bp = bpOf(item);
  if (bp && bp.text) out.push(bp.text);
  return out;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------
function freshStats() {
  return {
    maxHp: T.player.hp, armor: 0, regen: 0, closeDmg: 0, castSpeed: 0, crit: 0,
    spellDmg: 0, chargeRegen: 0, maxCharge: T.player.charge, moveSpeed: 0,
    magnet: T.player.magnet, mineSpeed: 0, oreLuck: 0,
    shock: 0, leech: 0, chill: 0, powers: {}, sets: {}, regalia3: false,
    // from recipes' implicits
    dashCd: 0, lamp: 0, pullSlow: 0, noisy: 0,
  };
}

// The modules socketed in a base.
const baseModules = (it) => ((it && it.sockets) || []).filter(Boolean);
// Whether a caster carries a power (in a module in its sockets).
const casterHasPower = (it, power) => baseModules(it).some((m) => m.power === power);

// What an outfit (its bases and the modules in them) and the attunements
// add up to.
function computeStats(equip, attune) {
  const s = freshStats();
  const take = (m) => {
    for (const a of m.affixes || []) s[a.id] += a.v;
    if (m.power) s.powers[m.power] = (s.powers[m.power] || 0) + 1;
    if (m.set) s.sets[m.set] = (s.sets[m.set] || 0) + 1;
  };
  for (const slot of SLOTS) {
    const it = equip[slot];
    if (!it) continue;
    if (it.kind === 'armor') { s.armor += it.base.armor; s.maxHp += it.base.hp; }
    // (a piece from before modules may still carry its own)
    take(it);
    for (const m of baseModules(it)) take(m);
    const imp = (bpOf(it) || {}).implicit;
    if (imp) for (const k in imp) s[k] += imp[k];
  }
  const reg = s.sets.regalia || 0, R = SETS.regalia;
  if (reg >= 2) { s.mineSpeed += R.bonus2.mineSpeed; s.magnet += R.bonus2.magnet; }
  if (reg >= 3) { s.oreLuck += R.bonus3.oreLuck; s.regalia3 = true; }
  for (const id in T.attune) {
    const rank = (attune && attune[id]) || 0, A = T.attune[id];
    for (const k of ['maxHp', 'closeDmg', 'spellDmg', 'moveSpeed']) if (A[k]) s[k] += A[k] * rank;
  }
  for (const k in T.caps) s[k] = Math.min(s[k], T.caps[k]);
  s.maxHp = Math.round(s.maxHp);
  return s;
}

// A rough worth, for UPGRADE / DOWNGRADE at a glance. A base's is its own
// (its stats, its slots and sockets), as its modules move with it.
const AFFIX_WORTH = { closeDmg: 0.4, castSpeed: 0.5, crit: 0.6, spellDmg: 0.4, chargeRegen: 0.2, maxCharge: 0.6, maxHp: 0.3, armor: 0.8, regen: 6, moveSpeed: 0.6, magnet: 0.2, mineSpeed: 0.2, oreLuck: 0.3, shock: 0.5, leech: 1.5, chill: 0.3 };
function itemWorth(it) {
  if (!it) return 0;
  if (it.kind === 'module') return moduleWorth(it);
  const b = it.base || {};
  let w = (b.power || 0) * (it.kind === 'pick' ? 8 : 2) + (b.armor || 0) + (b.hp || 0) * 0.3 + (b.speed || 0) * 4;
  if (it.slots) w += it.slots.length * 3;
  w += (it.sockets || []).length * 6;
  return w;
}

// What an item adds, stat by stat, for comparing two pieces (a base's own
// numbers; a module's traits).
const STAT_WORDS = { power: ['spell power', ''], slots: ['circuit slots', ''], sockets: ['module sockets', ''], armor: ['armor', ''], hp: ['max health', ''], speed: ['mining speed', '×'] };
function itemStatMap(it) {
  const m = {};
  if (!it) return m;
  const b = it.base || {};
  for (const k of ['armor', 'hp']) if (b[k]) m[k] = b[k];
  if (it.kind === 'caster') { m.power = b.power; m.slots = it.slots.length; }
  if (it.kind === 'pick') m.speed = b.speed;
  if (it.kind !== 'module' && it.kind !== 'stone' && it.kind !== 'relic') m.sockets = (it.sockets || []).length;
  for (const a of it.affixes || []) m['a:' + a.id] = (m['a:' + a.id] || 0) + a.v;
  return m;
}
// Lines like "+3 armor" / "−5% close spell damage": what having `it`
// instead of `cur` would change.
function compareLines(it, cur) {
  const a = itemStatMap(it), b = itemStatMap(cur), out = [];
  for (const k of new Set(Object.keys(a).concat(Object.keys(b)))) {
    const d = Math.round(((a[k] || 0) - (b[k] || 0)) * 10) / 10;
    if (!d) continue;
    let text;
    if (k.startsWith('a:')) text = AFFIXES[k.slice(2)].text.replace('+{v}', '{v}').replace('{v}', (d > 0 ? '+' : '−') + Math.abs(d));
    else text = `${d > 0 ? '+' : '−'}${Math.abs(d)}${STAT_WORDS[k][1]} ${STAT_WORDS[k][0]}`;
    out.push({ text, up: d > 0 });
  }
  if (it.power && (!cur || cur.power !== it.power)) out.push({ text: LEGENDARIES[it.power].text, up: true });
  if (cur && cur.power && cur.power !== it.power) out.push({ text: 'Loses: ' + LEGENDARIES[cur.power].text, up: false });
  if (it.set && (!cur || cur.set !== it.set)) out.push({ text: `A piece of ${SETS[it.set].name}`, up: true });
  if (cur && cur.set && cur.set !== it.set) out.push({ text: `Loses a piece of ${SETS[cur.set].name}`, up: false });
  return out;
}
// Where an affix rolled in its range at its tier, 0–1 (above 1 once
// raised); a module's against a module's range.
function affixRoll(a, tier, k = 1) {
  const lo = affixValue(a.id, tier, 0, k), hi = affixValue(a.id, tier, 1, k);
  return hi > lo ? (a.v - lo) / (hi - lo) : 1;
}

// The slot a base would replace. A caster compares with the hand holding
// the same recipe, else an empty hand, else the weaker one.
function compareSlot(equip, it) {
  const s = KIND_SLOT[it.kind];
  if (!s) return null;
  if (s !== 'hand') return s;
  for (const h of ['main', 'off']) if (equip[h] && equip[h].bp === it.bp) return h;
  if (!equip.main) return 'main';
  if (!equip.off) return 'off';
  return itemWorth(equip.off) < itemWorth(equip.main) ? 'off' : 'main';
}

// What breaking a base or a stone down gives back: { ore: id, n, exotic:
// id | null }: some of its ore, and now and then an exotic. (Its modules
// and stones come out whole.)
function salvageYield(rng, item) {
  const bp = item.kind === 'stone' ? bpOfStone(item.stone) : bpOf(item);
  const n = Math.max(1, Math.floor((bp ? bp.ore : 0) * T.salvage.back));
  const exotic = item.kind !== 'stone' && rng.chance((item.q || 0) >= 2 ? T.salvage.exoticRare : T.salvage.exotic) ? rng.pick(T.exotics.filter((x) => !x.riftOnly)).id : null;
  return { ore: oreOfTier(item.tier).id, n, exotic };
}

// ---------------------------------------------------------------------------
// The Lodestar
// ---------------------------------------------------------------------------
function magnitudeOf(points) { let m = 0; for (const need of T.star.levels) if (points >= need) m++; return m; }
function attunePointsLeft(save) {
  let spent = 0;
  for (const id in save.attune) spent += save.attune[id];
  return magnitudeOf(save.star) - 1 - spent;
}
