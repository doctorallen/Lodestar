'use strict';
// ---------------------------------------------------------------------------
// Gear: the affix table (the bonuses patterns print, patterns.js), the
// legendary powers; crafted bases (rig frames, plate, charms, picks) and
// the cores spells are built from; sealed relics; forging a base or a core
// from its recipe; salvaging one; and the stats an outfit adds up to, the
// cores set in its rig with it. What can be made is in blueprints.js; how
// a spell casts, in circuits.js.
//
// A base is exact. Its recipe and its ore's tier set its stats and a
// frame's slots; the anvil's quality only adds (T.gear). It never rolls an
// affix: what gives it an identity is the cores set in it. A core is its
// kind and its tier, and the pattern printed on it, if one is. (Internally
// a rig frame is still kind 'caster' and a core kind 'stone', as the save
// has always called them.)
// ---------------------------------------------------------------------------

// Affixes: the bonuses a pattern prints onto a core. lo–hi at tier 1,
// grown by T.items.affixGrowth a tier. dp: decimal places. flat: doesn't
// grow with the tier.
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
  // traits that read the fight (2026-10-22): they form builds, where a
  // flat number is only ever good
  chilledDmg: { family: 'spell', text: '+{v}% damage to the chilled', lo: 20, hi: 35 },
  burnDmg: { family: 'spell', text: '+{v}% damage to the burning', lo: 20, hi: 35 },
  openDmg: { family: 'close', text: "+{v}% damage to a foe that's open", lo: 25, hi: 45 },
  arcCharge: { family: 'close', text: 'Arc hits give {v} more charge', lo: 1, hi: 2, flat: true },
  litArmor: { family: 'defense', text: '+{v} armor in light', lo: 6, hi: 12 },
};
const AFFIX_IDS = Object.keys(AFFIXES);

// Which bonuses a core of each kind can carry (its kind's own concerns: a
// Form the casting, an Element the hit's statuses, a Mod the suit): a
// pattern fits the kinds whose list holds its bonus (patterns.js).
const CORE_BONUSES = {
  form: ['closeDmg', 'castSpeed', 'crit', 'spellDmg', 'chargeRegen', 'maxCharge', 'openDmg', 'arcCharge'],
  element: ['shock', 'leech', 'chill', 'chilledDmg', 'burnDmg', 'spellDmg'],
  glyph: ['maxHp', 'armor', 'regen', 'moveSpeed', 'magnet', 'mineSpeed', 'oreLuck', 'litArmor'],
};
const KIND_NAMES = { caster: 'Rig frame', armor: 'Plate', charm: 'Charm', pick: 'Cutter', stone: 'Core', relic: 'Sealed relic' };
// what a base of a kind is called in a sentence ("a module for armor")
const KIND_WORDS = { caster: 'rig', armor: 'armor', charm: 'charm', pick: 'cutter' };
const KIND_PHRASE = { caster: 'the rig', armor: 'armor', charm: 'a charm', pick: 'a cutter' };
// The slots worn: the rig (still 'main' in the save), the pick, armor and a
// charm. (An older save's off hand is a frame in the stash now: save.js.)
const KIND_SLOT = { caster: 'main', armor: 'armor', charm: 'charm', pick: 'pick' };
const SLOTS = ['main', 'pick', 'armor', 'charm'];
const SLOT_NAMES = { main: 'Rig', pick: 'Cutter', armor: 'Armor', charm: 'Charm' };
const QUALITY_NAMES = ['Rough', 'Fair', 'Fine', 'Masterwork'];

// (a core is common or legendary now; the save knew magic and rare)
const RARITIES = ['common', 'magic', 'rare', 'legendary'];
const RARITY_NAMES = { common: 'Common', magic: 'Magic', rare: 'Rare', legendary: 'Legendary' };

// Legendary powers: each changes how you play. A legendary core carries
// one, and it works while the core is set in a spell.
const LEGENDARIES = {
  seismic: { name: 'Faultline', text: 'Breaking a vein sends out a shockwave' },
  echo: { name: 'Twice-Told', text: 'Every spell fires twice' },
  bloodedge: { name: 'Redwake', text: 'Critical hits heal 4% of max health' },
  lodeheart: { name: 'Lodeheart', text: 'Kills heal 3 and pull nearby loot to you' },
  stormcaller: { name: 'Stormcaller', text: 'Bolts chain to two more enemies' },
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

// A base, exactly as its recipe says: in an ore of `tier`, forged at
// quality q (0–3). A rig frame's two spells start empty, each with a Form,
// an Element and a Mod part, and the extra part its ore gives a frame of
// tier, a masterwork or one with a Lodestone shard worked in (frameExtra).
function makeBase(bpId, tier, q = 0, shard = false) {
  const bp = BLUEPRINTS[bpId], kind = bp.kind;
  const item = { uid: newItemUid(), kind, bp: bpId, tier, q: clamp(q, 0, 3), rarity: 'common', base: baseStats(kind, tier, bp, q), affixes: [] };
  if (kind === 'caster') { const x = frameExtra(tier, q, shard, oreOfTier(tier).id); item.extra = x; item.spells = [emptySpell(x), emptySpell(x)]; if (shard) item.shard = true; }
  item.name = baseName(item);
  return item;
}
// How many Mod slots a frame's spells have.
const rigMods = (it) => (it && it.spells && it.spells[0] ? it.spells[0].mods.length : 0);

// "Lumenite Rig"; the rusty pick.
function baseName(item) {
  if (item.kind === 'pick' && item.tier === 0) return 'Worn Cutter';
  const bp = bpOf(item);
  return `${oreOfTier(item.tier).name} ${bp ? bp.name : KIND_NAMES[item.kind]}`;
}

// A core for a spell: a Form, an Element or a Mod, of a tier. o: { rarity,
// src }: plain (common) unless it's a legendary, which carries a power
// (patterns.js legendaryCore); a pattern is printed on it as it's forged.
function makeStone(stone, tier, o = {}) {
  const c = { uid: newItemUid(), kind: 'stone', stone, tier: clamp(tier, 1, T.ores.length), rarity: o.rarity || 'common', bonus: null, affixes: [], name: `${stoneWords(stone).name} core` };
  if (o.power) c.power = o.power;
  if (o.src) c.src = o.src;
  return c;
}
// A core's pattern and power as traits: [{ key, text, aff }].
function coreTraits(c) {
  const out = [];
  if (c.bonus) out.push({ key: 'bonus', text: `${c.pattern && PATTERNS[c.pattern] ? PATTERNS[c.pattern].name + ': ' : ''}${fmtAffix(c.bonus)}`, aff: c.bonus });
  if (c.power) out.push({ key: 'power', text: LEGENDARIES[c.power].text });
  return out;
}
// A rough worth, for sorting and ▲/▼: its tier, its pattern, its power.
function coreWorth(c) {
  if (!c) return 0;
  return c.tier * 2 + (c.bonus ? c.bonus.v * (AFFIX_WORTH[c.bonus.id] || 0.3) : 0) + (c.power ? 8 : 0);
}

function makeRelic(tier) {
  return { uid: newItemUid(), kind: 'relic', tier: Math.max(1, tier), rarity: 'relic', affixes: [], name: 'Sealed relic' };
}

// The Scrap Rig: spell A an Arc, spell B a Bolt, so the first fight has
// close and far, and room to grow.
function startingGear() {
  const rig = makeBase('rig', 1, 0);
  rig.base.power = 5; rig.name = 'Scrap Rig';
  rig.spells[0].form = makeStone('arc', 1); rig.spells[1].form = makeStone('bolt', 1);
  const pick = makeBase('pick', 0, 0);
  return { main: rig, pick, armor: null, charm: null };
}

// Makes what a recipe makes, in an ore, at the anvil's quality q (0–3),
// maybe with an exotic: riftglass forges it a tier above its ore; an
// elemental exotic worked into a frame brings its Element's core out with
// it (item.withStone); a Lodestone shard gives a frame its extra slot. A
// core comes out a tier higher from a fine forge, and with `pattern` (a
// creature kind the suit has read) printed on it, stronger from a
// masterwork (patterns.js). The caller has checked and paid the cost.
function forgeItem(bpId, oreId, exoticId, q = 0, pattern = null) {
  const bp = BLUEPRINTS[bpId], ex = exoticId && T.exotics.find((e) => e.id === exoticId);
  const tier = Math.min(T.ores.length, T.ores[ORE_INDEX[oreId]].tier + (ex && ex.tierUp ? 1 : 0));
  if (bp.kind === 'stone') {
    const c = makeStone(bp.stone, tier + (q >= 2 ? 1 : 0), { src: { forged: true } });
    if (pattern) printPattern(c, pattern, q);
    return c;
  }
  const item = makeBase(bpId, tier, q, bp.kind === 'caster' && !!(ex && ex.modSlot));
  if (bp.kind === 'caster' && ex && ex.element) item.withStone = makeStone(ex.element, tier);
  return item;
}
// What an optional exotic does for a recipe, in words (null: nothing). A
// shard is offered for a frame that wouldn't have the second Mod slot.
function exoticForgeWord(bpId, ex, tier = 1) {
  const bp = BLUEPRINTS[bpId];
  if (!ex || ex.retired || bp.kind === 'stone' || bp.kind === 'tool') return null;
  if (ex.tierUp) return 'a tier up';
  if (ex.element && bp.kind === 'caster') return `+ ${CIRCUIT_ELEMENTS[ex.element].name} core`;
  if (ex.modSlot && bp.kind === 'caster' && !frameExtra(tier, 0, false, oreOfTier(tier).id)) return 'its extra slot';
  return null;
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------
function fmtAffix(a) { return AFFIXES[a.id].text.replace('{v}', a.v); }

function itemBaseLine(item) {
  const b = item.base || {};
  if (item.kind === 'module') return moduleLine(item);
  if (item.kind === 'caster') { const ore = rigOreLine(item), n = rigMods(item); return `${b.power} power · ${n} Mod slot${n === 1 ? '' : 's'}${ore ? ' · ' + ore : ''}`; }
  if (item.kind === 'armor') return `${b.armor} armor, +${b.hp} max health`;
  if (item.kind === 'pick') { const top = T.ores.filter((o) => o.tier <= b.power).pop(); return `Breaks up to ${top ? top.name : 'nothing'}, ${b.speed}× speed`; }
  if (item.kind === 'stone') return `${stoneLine(item.stone)} ${stoneTierLine(item.stone, item.tier)}`;
  if (item.kind === 'relic') return `Tier ${item.tier}. The Lodestar's light will open it: a legendary core.`;
  return '';
}

function itemKindLine(item) {
  if (item.kind === 'relic') return 'Sealed relic';
  if (item.kind === 'stone') return `${item.rarity === 'legendary' ? 'Legendary ' : ''}${STONE_KIND_NAMES[stoneKind(item.stone)]} core · tier ${item.tier}${item.pattern && PATTERNS[item.pattern] ? ' · ' + PATTERNS[item.pattern].name : ''}`;
  const what = item.kind === 'caster' ? 'rig frame' : (bpOf(item) || { name: KIND_NAMES[item.kind] }).name.toLowerCase();
  return `${item.q ? QUALITY_NAMES[item.q] + ' ' : ''}${what} · tier ${item.tier}${item.kind === 'caster' && item.extra ? ` · a second ${STONE_KIND_NAMES[item.extra]} slot` : ''}`;
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
    shock: 0, leech: 0, chill: 0, chilledDmg: 0, burnDmg: 0, openDmg: 0, arcCharge: 0, litArmor: 0, powers: {},
    // from recipes' implicits
    dashCd: 0, lamp: 0, pullSlow: 0, noisy: 0,
  };
}

// The cores set in a rig's spells, every part.
// (the Splinter's Readings count with its cores: facets.js)
const rigCores = (it) => (it && it.spells ? it.spells.flatMap(spellCores).concat(it.readings || []) : []);
// Whether a core set in the rig carries a power.
const rigHasPower = (it, power) => rigCores(it).some((c) => c.power === power);

// What an outfit (its bases, the cores set in its rig) and the attunements
// add up to. A core's printed pattern and power count while it's set in a
// spell.
function computeStats(equip, attune) {
  const s = freshStats();
  for (const slot of SLOTS) {
    const it = equip[slot];
    if (!it) continue;
    if (it.kind === 'armor') { s.armor += it.base.armor; s.maxHp += it.base.hp; }
    const imp = (bpOf(it) || {}).implicit;
    if (imp) for (const k in imp) s[k] += imp[k];
  }
  for (const c of rigCores(equip.main)) {
    if (c.bonus && s[c.bonus.id] !== undefined) s[c.bonus.id] += c.bonus.v;
    if (c.power) s.powers[c.power] = (s.powers[c.power] || 0) + 1;
  }
  for (const id in T.attune) {
    const rank = (attune && attune[id]) || 0, A = T.attune[id];
    for (const k of ['maxHp', 'closeDmg', 'spellDmg', 'moveSpeed']) if (A[k]) s[k] += A[k] * rank;
  }
  // the frame's ore: a quick frame's pool is smaller (T.circuits.ores)
  const rig = equip.main;
  if (rig && rig.kind === 'caster') { const way = casterOreWay(rig); if (way.charge) s.maxCharge = Math.round(s.maxCharge * (1 + way.charge)); }
  for (const k in T.caps) s[k] = Math.min(s[k], T.caps[k]);
  s.maxHp = Math.round(s.maxHp);
  return s;
}

// A rough worth, for UPGRADE / DOWNGRADE at a glance. A base's is its own
// (its stats, its Mod slots and sockets), as its modules and cores move
// with it.
const AFFIX_WORTH = { closeDmg: 0.4, castSpeed: 0.5, crit: 0.6, spellDmg: 0.4, chargeRegen: 0.2, maxCharge: 0.6, maxHp: 0.3, armor: 0.8, regen: 6, moveSpeed: 0.6, magnet: 0.2, mineSpeed: 0.2, oreLuck: 0.3, shock: 0.5, leech: 1.5, chill: 0.3, chilledDmg: 0.25, burnDmg: 0.25, openDmg: 0.2, arcCharge: 4, litArmor: 0.5 };
function itemWorth(it) {
  if (!it) return 0;
  if (it.kind === 'stone') return coreWorth(it);
  const b = it.base || {};
  let w = (b.power || 0) * (it.kind === 'pick' ? 8 : 2) + (b.armor || 0) + (b.hp || 0) * 0.3 + (b.speed || 0) * 4;
  if (it.spells) w += (it.extra ? 6 : 0);
  return w;
}

// What an item adds, stat by stat, for comparing two pieces (a base's own
// numbers; a core's bonus).
const STAT_WORDS = { power: ['power', ''], extra: ['extra slot a spell', ''], tier: ['tier', ''], armor: ['armor', ''], hp: ['max health', ''], speed: ['mining speed', '×'] };
function itemStatMap(it) {
  const m = {};
  if (!it) return m;
  const b = it.base || {};
  for (const k of ['armor', 'hp']) if (b[k]) m[k] = b[k];
  if (it.kind === 'caster') { m.power = b.power; if (it.extra) m.extra = 1; }
  if (it.kind === 'pick') m.speed = b.speed;
  if (it.kind === 'stone') { m.tier = it.tier; if (it.bonus) m['a:' + it.bonus.id] = it.bonus.v; }
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
  return out;
}
// The slot a base would replace.
function compareSlot(equip, it) { return KIND_SLOT[it.kind] || null; }

// What breaking a base down gives back: { ore: id, n, exotic: id | null }:
// some of its ore, and now and then an exotic. (Its cores come out whole;
// a spare core itself salvages into ore: patterns.js coreSalvageOre.)
function salvageYield(rng, item) {
  const bp = bpOf(item);
  const n = Math.max(1, Math.floor((bp ? bp.ore : 0) * T.salvage.back));
  const exotic = rng.chance((item.q || 0) >= 2 ? T.salvage.exoticRare : T.salvage.exotic) ? rng.pick(T.exotics.filter((x) => !x.riftOnly && !x.retired)).id : null;
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
