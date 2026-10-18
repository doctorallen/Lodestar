'use strict';
// ---------------------------------------------------------------------------
// Gear: the affix table, rarities, legendary powers, the set, spell cores
// and sealed relics; rolling items, crafting at the forge, the rune bench,
// salvage; and the stats an outfit adds up to. Every roll takes an Rng.
// ---------------------------------------------------------------------------

// Affixes. lo–hi at tier 1, grown by T.items.affixGrowth a tier. dp: decimal
// places. pct: shown with a %.
const AFFIXES = {
  meleeDmg: { family: 'melee', text: '+{v}% melee damage', lo: 8, hi: 15 },
  atkSpeed: { family: 'melee', text: '+{v}% attack speed', lo: 5, hi: 10 },
  crit: { family: 'melee', text: '+{v}% critical chance', lo: 3, hi: 6 },
  spellDmg: { family: 'spell', text: '+{v}% spell damage', lo: 8, hi: 15 },
  chargeRegen: { family: 'spell', text: '+{v}% charge regeneration', lo: 10, hi: 20 },
  maxCharge: { family: 'spell', text: '+{v} max charge', lo: 8, hi: 15 },
  maxHp: { family: 'defense', text: '+{v} max health', lo: 8, hi: 15 },
  armor: { family: 'defense', text: '+{v} armor', lo: 3, hi: 6 },
  regen: { family: 'defense', text: '+{v} health a second', lo: 0.3, hi: 0.6, dp: 1 },
  moveSpeed: { family: 'utility', text: '+{v}% move speed', lo: 4, hi: 8, flat: true },
  cargo: { family: 'utility', text: '+{v} cargo', lo: 2, hi: 4 },
  magnet: { family: 'utility', text: '+{v} pickup reach', lo: 6, hi: 12, flat: true },
  mineSpeed: { family: 'mining', text: '+{v}% mining speed', lo: 10, hi: 20 },
  oreLuck: { family: 'mining', text: '+{v}% chance of double ore', lo: 6, hi: 12 },
  shock: { family: 'shock', text: '{v}% chance to arc lightning on hit', lo: 5, hi: 10 },
  leech: { family: 'leech', text: '{v}% of damage dealt heals you', lo: 2, hi: 4, dp: 1 },
  chill: { family: 'chill', text: '{v}% chance to chill on hit', lo: 8, hi: 15 },
};
const AFFIX_IDS = Object.keys(AFFIXES);

// Which affix families each kind of gear can roll.
const KIND_FAMILIES = {
  blade: ['melee', 'shock', 'leech', 'chill', 'utility'],
  focus: ['spell', 'shock', 'leech', 'chill', 'utility'],
  armor: ['defense', 'utility'],
  charm: ['melee', 'spell', 'defense', 'utility', 'mining', 'shock', 'leech', 'chill'],
  pick: ['mining', 'utility'],
};
const KIND_NAMES = { blade: 'Blade', focus: 'Focus', armor: 'Plate', charm: 'Charm', pick: 'Pick', core: 'Core', relic: 'Sealed relic' };
const KIND_SLOT = { blade: 'hand', focus: 'hand', armor: 'armor', charm: 'charm', pick: 'pick' };
const SLOTS = ['main', 'off', 'pick', 'armor', 'charm'];
const SLOT_NAMES = { main: 'Main hand', off: 'Off hand', pick: 'Pick', armor: 'Armor', charm: 'Charm' };

const RARITIES = ['common', 'magic', 'rare', 'legendary', 'set'];
const RARITY_NAMES = { common: 'Common', magic: 'Magic', rare: 'Rare', legendary: 'Legendary', set: 'Set' };

// Legendary powers: each changes how you play, and fits certain kinds.
const LEGENDARIES = {
  seismic: { name: 'Faultline', kinds: ['pick'], text: 'Breaking a vein sends out a shockwave' },
  echo: { name: 'Twice-Told', kinds: ['blade', 'focus'], text: 'Socketed cores fire twice' },
  bloodedge: { name: 'Redwake', kinds: ['blade'], text: 'Critical hits heal 4% of max health' },
  lodeheart: { name: 'Lodeheart', kinds: ['armor', 'charm'], text: 'Kills heal 3 and pull nearby loot to you' },
  stormcaller: { name: 'Stormcaller', kinds: ['focus'], text: 'Arc Bolts chain to two more enemies' },
};

const SETS = {
  regalia: {
    name: "Prospector's Regalia",
    pieces: { pick: "Prospector's Pick", armor: "Prospector's Coat", charm: "Prospector's Token" },
    bonus2: { text: '+20% mining speed, +6 cargo', mineSpeed: 20, cargo: 6 },
    bonus3: { text: 'Breaking a vein heals 3; +20% chance of double ore', oreLuck: 20 },
  },
};

const CORES = {
  bolt: { name: 'Arc Bolt', text: 'A fast bolt at the nearest enemy' },
  nova: { name: 'Nova', text: 'A burst of force all around you' },
  pull: { name: 'Lodestone Pull', text: 'Drags nearby enemies in and stuns them' },
  ward: { name: 'Ward Pulse', text: 'A shield that soaks up damage for a few seconds' },
};
const CORE_IDS = Object.keys(CORES);

const MAGIC_PREFIX = { melee: 'Keen', spell: 'Humming', defense: 'Sturdy', utility: 'Light', mining: "Delver's", shock: 'Voltaic', leech: 'Thirsting', chill: 'Rimed' };
const RARE_FIRST = ['Grim', 'Hollow', 'Ember', 'Ashen', 'Star', 'Dusk', 'Iron', 'Pale', 'Rune', 'Vein', 'Night', 'Storm'];
const RARE_SECOND = {
  blade: ['Edge', 'Fang', 'Sliver', 'Bite', 'Brand'], focus: ['Eye', 'Whisper', 'Lantern', 'Choir', 'Spark'],
  armor: ['Shell', 'Mantle', 'Ward', 'Hide', 'Bulwark'], charm: ['Token', 'Sigil', 'Knot', 'Mark', 'Seal'],
  pick: ['Delve', 'Breaker', 'Tooth', 'Auger', 'Crag'],
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
function affixValue(id, tier, roll) {
  const a = AFFIXES[id];
  const grow = a.flat ? 1 : 1 + T.items.affixGrowth * (Math.max(1, tier) - 1);
  const v = (a.lo + (a.hi - a.lo) * roll) * grow;
  const k = Math.pow(10, a.dp || 0);
  return Math.max(a.dp ? 0.1 : 1, Math.round(v * k) / k);
}

// A random affix this item hasn't got, from one of `families`.
function rollAffix(rng, item, families) {
  const have = new Set(item.affixes.map((a) => a.id));
  const pool = AFFIX_IDS.filter((id) => families.includes(AFFIXES[id].family) && !have.has(id));
  if (!pool.length) return null;
  const id = rng.pick(pool);
  return { id, v: affixValue(id, item.tier, rng.f()), up: 0 };
}

function rollRarity(rng, level, min = 'common') {
  const floor = RARITIES.indexOf(min);
  const list = RARITIES.filter((r, i) => i >= floor).map((r) => {
    const [base, per] = T.loot.rarity[r];
    return [Math.max(0.1, base + per * level), r];
  });
  return rng.weighted(list);
}

function baseStats(kind, tier) {
  const I = T.items, s = tierScale(tier);
  if (kind === 'blade') return { dmg: Math.round(I.blade.dmg * s * 10) / 10 };
  if (kind === 'focus') return { power: Math.round(I.focus.power * s * 10) / 10 };
  if (kind === 'armor') return { armor: Math.round(I.armor.armor * (1 + I.armor.armorGrowth * (Math.max(1, tier) - 1))), hp: Math.round(I.armor.hp * Math.pow(I.armor.hpGrowth, Math.max(1, tier) - 1)) };
  if (kind === 'pick') { const power = tier + 1; return { power, speed: Math.round((1 + I.pick.speedGrowth * (power - 1)) * 100) / 100 }; }
  return {};
}

// opts: { rarity, family (an exotic's guaranteed family), power, set }
function makeItem(rng, kind, tier, opts = {}) {
  const rarity = opts.rarity || 'common';
  const item = { uid: newItemUid(), kind, tier, rarity, base: baseStats(kind, tier), affixes: [] };
  if (rarity === 'legendary') item.power = opts.power || rng.pick(Object.keys(LEGENDARIES).filter((k) => LEGENDARIES[k].kinds.includes(kind)));
  if (rarity === 'set') item.set = opts.set || 'regalia';
  const families = KIND_FAMILIES[kind];
  if (opts.family) { const a = rollAffix(rng, item, [opts.family]); if (a) item.affixes.push(a); }
  const n = opts.affixes !== undefined ? opts.affixes : T.items.affixes[rarity];
  while (item.affixes.length < n) { const a = rollAffix(rng, item, families); if (!a) break; item.affixes.push(a); }
  const S = T.items.socket, good = rarity !== 'common' && rarity !== 'magic';
  if (kind === 'blade' && (good || rng.chance(S.blade))) item.sockets = [null];
  if (kind === 'focus') item.sockets = good && rng.chance(S.secondFocus) ? [null, null] : [null];
  item.name = itemName(rng, item);
  return item;
}

function makeCore(rng, core, tier) {
  const item = { uid: newItemUid(), kind: 'core', core, tier: Math.max(1, tier), rarity: 'magic', affixes: [] };
  item.name = CORES[core].name;
  return item;
}

function makeRelic(tier) {
  return { uid: newItemUid(), kind: 'relic', tier: Math.max(1, tier), rarity: 'relic', affixes: [], name: 'Sealed relic' };
}

function itemName(rng, item) {
  if (item.kind === 'pick' && item.tier === 0) return 'Rusty Pick';
  if (item.set) return SETS[item.set].pieces[item.kind];
  if (item.power) return LEGENDARIES[item.power].name;
  const base = `${oreOfTier(item.tier).name} ${KIND_NAMES[item.kind]}`;
  if (item.rarity === 'rare') return `${rng.pick(RARE_FIRST)} ${rng.pick(RARE_SECOND[item.kind])}`;
  if (item.rarity === 'magic' && item.affixes[0]) return `${MAGIC_PREFIX[AFFIXES[item.affixes[0].id].family]} ${base}`;
  return base;
}

// A drop from an enemy at this tier and level.
const DROP_KINDS = [[3, 'blade'], [3, 'focus'], [3, 'armor'], [2, 'charm'], [1, 'pick'], [2, 'core']];
function rollDrop(rng, tier, level, min) {
  let kind = rng.weighted(DROP_KINDS);
  if (kind === 'core' && !min) return makeCore(rng, rng.pick(CORE_IDS), tier);
  if (kind === 'core') kind = 'blade';
  const rarity = rollRarity(rng, level, min);
  if (rarity === 'set') kind = rng.pick(Object.keys(SETS.regalia.pieces));
  return makeItem(rng, kind, tier, { rarity });
}

// A sealed relic opens at the Lodestar into something rare or better.
function unsealRelic(rng, relic) {
  const rarity = rng.weighted([[60, 'rare'], [25, 'legendary'], [15, 'set']]);
  const kind = rarity === 'set' ? rng.pick(Object.keys(SETS.regalia.pieces)) : rng.pick(['blade', 'focus', 'armor', 'charm', 'pick']);
  return makeItem(rng, kind, relic.tier, { rarity });
}

function startingGear(rng) {
  const blade = makeItem(rng, 'blade', 1, { affixes: 0 });
  blade.base.dmg = 5; blade.name = 'Scrap Blade';
  const focus = makeItem(rng, 'focus', 1, { affixes: 0 });
  focus.base.power = 5; focus.name = 'Cracked Focus';
  const pick = makeItem(rng, 'pick', 0, { affixes: 0 });
  return { main: blade, off: focus, pick, armor: null, charm: null };
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------
function fmtAffix(a) { return AFFIXES[a.id].text.replace('{v}', a.v); }

function itemBaseLine(item) {
  const b = item.base || {};
  if (item.kind === 'blade') return `${b.dmg} damage`;
  if (item.kind === 'focus') return `${b.power} spell power`;
  if (item.kind === 'armor') return `${b.armor} armor, +${b.hp} max health`;
  if (item.kind === 'pick') { const top = T.ores.filter((o) => o.tier <= b.power).pop(); return `Breaks up to ${top ? top.name : 'nothing'}, ${b.speed}× speed`; }
  if (item.kind === 'core') return `${CORES[item.core].text}. Tier ${item.tier}.`;
  if (item.kind === 'relic') return `Tier ${item.tier}. The Lodestar's light will open it.`;
  return '';
}

function itemKindLine(item) {
  if (item.kind === 'relic') return 'Sealed relic';
  if (item.kind === 'core') return 'Spell core';
  return `${RARITY_NAMES[item.rarity]} ${KIND_NAMES[item.kind].toLowerCase()} · tier ${item.tier}`;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------
function freshStats() {
  return {
    maxHp: T.player.hp, armor: 0, regen: 0, meleeDmg: 0, atkSpeed: 0, crit: 0,
    spellDmg: 0, chargeRegen: 0, maxCharge: T.player.charge, moveSpeed: 0,
    cargo: T.cargo.capacity, magnet: T.player.magnet, mineSpeed: 0, oreLuck: 0,
    shock: 0, leech: 0, chill: 0, powers: {}, sets: {}, regalia3: false,
  };
}

// What an outfit and the attunements add up to.
function computeStats(equip, attune) {
  const s = freshStats();
  for (const slot of SLOTS) {
    const it = equip[slot];
    if (!it) continue;
    if (it.kind === 'armor') { s.armor += it.base.armor; s.maxHp += it.base.hp; }
    for (const a of it.affixes) s[a.id] += a.v;
    if (it.power) s.powers[it.power] = (s.powers[it.power] || 0) + 1;
    if (it.set) s.sets[it.set] = (s.sets[it.set] || 0) + 1;
  }
  const reg = s.sets.regalia || 0, R = SETS.regalia;
  if (reg >= 2) { s.mineSpeed += R.bonus2.mineSpeed; s.cargo += R.bonus2.cargo; }
  if (reg >= 3) { s.oreLuck += R.bonus3.oreLuck; s.regalia3 = true; }
  for (const id in T.attune) {
    const rank = (attune && attune[id]) || 0, A = T.attune[id];
    for (const k of ['maxHp', 'cargo', 'meleeDmg', 'spellDmg', 'moveSpeed']) if (A[k]) s[k] += A[k] * rank;
  }
  for (const k in T.caps) s[k] = Math.min(s[k], T.caps[k]);
  s.maxHp = Math.round(s.maxHp);
  return s;
}

// A rough worth, for UPGRADE / DOWNGRADE at a glance against what's worn.
const AFFIX_WORTH = { meleeDmg: 0.4, atkSpeed: 0.5, crit: 0.6, spellDmg: 0.4, chargeRegen: 0.2, maxCharge: 0.3, maxHp: 0.3, armor: 0.8, regen: 6, moveSpeed: 0.6, cargo: 0.8, magnet: 0.2, mineSpeed: 0.2, oreLuck: 0.3, shock: 0.5, leech: 1.5, chill: 0.3 };
function itemWorth(it) {
  if (!it) return 0;
  const b = it.base || {};
  let w = (b.dmg || 0) * 2 + (b.power || 0) * (it.kind === 'pick' ? 8 : 2) + (b.armor || 0) + (b.hp || 0) * 0.3 + (b.speed || 0) * 4;
  for (const a of it.affixes) w += a.v * (AFFIX_WORTH[a.id] || 0.3);
  if (it.power) w += 8;
  if (it.sockets) w += it.sockets.length * 3;
  return w;
}

// The slot an item would replace: hands compare with a hand of the same kind.
function compareSlot(equip, it) {
  const s = KIND_SLOT[it.kind];
  if (!s) return null;
  if (s !== 'hand') return s;
  if (equip.main && equip.main.kind === it.kind) return 'main';
  if (equip.off && equip.off.kind === it.kind) return 'off';
  return equip.main ? 'off' : 'main';
}

// ---------------------------------------------------------------------------
// The forge, the rune bench, the salvager
// ---------------------------------------------------------------------------
function craftCost(kind) { return T.items[kind].cost; }
const craftRarity = (rng) => rng.weighted([[55, 'common'], [35, 'magic'], [10, 'rare']]);
const RARITY_STEP = { common: 'magic', magic: 'rare', rare: 'legendary' };

// Makes an item from `cost` of an ore (and an optional exotic). The caller
// has checked and spent the materials.
function forgeItem(rng, kind, oreId, exoticId) {
  const tier = T.ores[ORE_INDEX[oreId]].tier;
  if (kind === 'core') return null;
  let rarity = craftRarity(rng);
  const ex = exoticId && T.exotics.find((e) => e.id === exoticId);
  if (ex && !ex.family) rarity = RARITY_STEP[rarity];
  return makeItem(rng, kind, tier, { rarity, family: ex && ex.family });
}

function runeOre(item) { return oreOfTier(item.tier).id; }

function rerollAffix(rng, item, i) {
  const old = item.affixes[i];
  const fam = KIND_FAMILIES[item.kind] || [];
  const rest = { affixes: item.affixes.filter((_, j) => j !== i), tier: item.tier };
  const fresh = rollAffix(rng, rest, fam.includes(AFFIXES[old.id].family) ? fam : fam.concat([AFFIXES[old.id].family]));
  if (fresh) item.affixes[i] = fresh;
  return item;
}

function upgradeAffix(item, i) {
  const a = item.affixes[i], A = AFFIXES[a.id], k = Math.pow(10, A.dp || 0);
  if (a.up >= 2) return false;
  const v = Math.round(a.v * (1 + T.runes.upgradeBy) * k) / k;
  a.v = A.dp ? v : Math.max(a.v + 1, v);
  a.up++;
  return true;
}

function canAddAffix(item) { return item.rarity === 'common' || item.rarity === 'magic'; }
function addAffix(rng, item) {
  if (!canAddAffix(item)) return false;
  item.rarity = RARITY_STEP[item.rarity];
  const a = rollAffix(rng, item, KIND_FAMILIES[item.kind]);
  if (a) item.affixes.push(a);
  if (item.rarity === 'rare' && item.kind !== 'core') item.name = itemName(rng, item);
  return true;
}

// What breaking an item down gives back: { ore: id, n, exotic: id | null }
function salvageYield(rng, item) {
  const kind = item.kind === 'relic' ? null : item.kind;
  const cost = kind ? craftCost(kind) : 0;
  const n = Math.max(1, Math.floor(cost * T.salvage.back));
  const good = item.rarity === 'rare' || item.rarity === 'legendary' || item.rarity === 'set';
  const exotic = rng.chance(good ? T.salvage.exoticRare : T.salvage.exotic) ? rng.pick(T.exotics).id : null;
  return { ore: oreOfTier(item.tier).id, n, exotic };
}

// ---------------------------------------------------------------------------
// The Lodestar
// ---------------------------------------------------------------------------
function orePoints(id) { const o = T.ores[ORE_INDEX[id]]; return o ? o.tier * o.tier : 0; }
function magnitudeOf(points) { let m = 0; for (const need of T.star.levels) if (points >= need) m++; return m; }
function attunePointsLeft(save) {
  let spent = 0;
  for (const id in save.attune) spent += save.attune[id];
  return magnitudeOf(save.star) - 1 - spent;
}
function biomeOpen(save, i) { return magnitudeOf(save.star) >= T.star.biomeAt[i]; }
