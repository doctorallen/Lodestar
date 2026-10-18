'use strict';
// ---------------------------------------------------------------------------
// Gear: the affix table, rarities, legendary powers, the set, spell cores
// and sealed relics; making a piece from a blueprint, forging one from ore,
// a creature part and maybe an exotic, the rune bench, salvage; and the
// stats an outfit adds up to. Every roll takes an Rng. What can be made is
// in blueprints.js.
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

// Spell cores, and the modifiers socketed beside them (mod: true), which
// change every spell in the same piece.
const CORES = {
  bolt: { name: 'Arc Bolt', text: 'A fast bolt at the nearest enemy' },
  nova: { name: 'Nova', text: 'A burst of force all around you' },
  pull: { name: 'Lodestone Pull', text: 'Drags nearby enemies in and stuns them' },
  ward: { name: 'Ward Pulse', text: 'A shield that soaks up damage for a few seconds' },
  frost: { name: 'Frost Lance', text: 'A lance of ice that pierces a line of enemies and chills them' },
  ember: { name: 'Ember Burst', text: 'A lobbed ember that bursts and leaves the ground burning' },
  chain: { name: 'Chain Lightning', text: 'Lightning that leaps from enemy to enemy' },
  thorns: { name: 'Thorn Ring', text: 'A ring of blighted thorns round you, cutting what comes close' },
  blink: { name: 'Blink', text: 'Step through space a short way: nothing can touch you as you go' },
  well: { name: 'Gravity Well', text: 'A knot of gravity that drags enemies into it' },
  phase: { name: 'Phase Step', text: 'Dash through enemies, cutting each one you pass' },
  split: { name: 'Split', mod: true, text: 'Bolts, lances and embers fly three at once, each a little weaker' },
  amplify: { name: 'Amplify', mod: true, text: 'Spells reach wider and hit 20% harder' },
  quicken: { name: 'Quicken', mod: true, text: 'Spells cost a third less charge and come back faster' },
  chainmod: { name: 'Chain', mod: true, text: 'Bolts and lightning jump to two more enemies' },
  echo: { name: 'Echo', mod: true, text: 'Every spell casts again a moment later, weaker' },
};
const CORE_IDS = Object.keys(CORES);

const MAGIC_PREFIX = { melee: 'Keen', spell: 'Humming', defense: 'Sturdy', utility: 'Light', mining: "Delver's", shock: 'Voltaic', leech: 'Thirsting', chill: 'Rimed' };
const RARE_FIRST = ['Grim', 'Hollow', 'Ember', 'Ashen', 'Star', 'Dusk', 'Iron', 'Pale', 'Rune', 'Vein', 'Night', 'Storm'];
// The second word of a rare piece's name, by its style.
const RARE_SECOND = {
  blade: ['Edge', 'Fang', 'Sliver', 'Bite', 'Brand'], spear: ['Lance', 'Pike', 'Needle', 'Thorn', 'Reach'],
  hammer: ['Maul', 'Breaker', 'Knell', 'Fall', 'Anvil'], whip: ['Lash', 'Coil', 'Tether', 'Sting', 'Snare'],
  wand: ['Eye', 'Whisper', 'Lantern', 'Choir', 'Spark'], staff: ['Rod', 'Spire', 'Beacon', 'Stave', 'Choir'],
  gauntlet: ['Grip', 'Fist', 'Clasp', 'Hand', 'Knuckle'], plate: ['Shell', 'Mantle', 'Ward', 'Hide', 'Bulwark'],
  weave: ['Veil', 'Shroud', 'Wrap', 'Drift', 'Mantle'], shell: ['Carapace', 'Bastion', 'Husk', 'Shell', 'Bulwark'],
  charm: ['Token', 'Sigil', 'Knot', 'Mark', 'Seal'], lantern: ['Lamp', 'Wick', 'Glim', 'Beacon', 'Gleam'],
  pick: ['Delve', 'Breaker', 'Tooth', 'Auger', 'Crag'], drill: ['Auger', 'Bore', 'Spindle', 'Gimlet', 'Screw'],
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

function baseStats(kind, tier, bp = BLUEPRINTS[KIND_BLUEPRINT[kind]]) {
  const I = T.items, s = tierScale(tier), m = (bp && bp.mult) || 1;
  if (kind === 'blade') return { dmg: Math.round(I.blade.dmg * s * m * 10) / 10 };
  if (kind === 'focus') return { power: Math.round(I.focus.power * s * m * 10) / 10 };
  if (kind === 'armor') return { armor: Math.round(I.armor.armor * (1 + I.armor.armorGrowth * (Math.max(1, tier) - 1)) * m), hp: Math.round(I.armor.hp * Math.pow(I.armor.hpGrowth, Math.max(1, tier) - 1) * Math.sqrt(m)) };
  if (kind === 'pick') { const power = tier + 1; return { power, speed: Math.round((1 + I.pick.speedGrowth * (power - 1)) * m * 100) / 100 }; }
  return {};
}

// opts: { bp (the blueprint; else the plain one for the kind), rarity,
// family (an exotic's guaranteed family), binding ({ kind, grade }: a part
// whose family is guaranteed `grade` affixes, each stronger by the grade),
// element, power, set }
function makeItem(rng, kind, tier, opts = {}) {
  const rarity = opts.rarity || 'common', bpId = opts.bp || KIND_BLUEPRINT[kind], bp = BLUEPRINTS[bpId];
  const item = { uid: newItemUid(), kind, bp: bpId, tier, rarity, base: baseStats(kind, tier, bp), affixes: [] };
  if (rarity === 'legendary') item.power = opts.power || rng.pick(Object.keys(LEGENDARIES).filter((k) => LEGENDARIES[k].kinds.includes(kind)));
  if (rarity === 'set') item.set = opts.set || 'regalia';
  if (opts.element) item.element = opts.element;
  const families = KIND_FAMILIES[kind];
  const n = opts.affixes !== undefined ? opts.affixes : T.items.affixes[rarity];
  if (opts.family) { const a = rollAffix(rng, item, [opts.family]); if (a) item.affixes.push(a); }
  const bind = opts.binding;
  if (bind) {
    item.binding = bind;
    const fam = PARTS[bind.kind].family, boost = 1 + T.items.gradeBoost * (bind.grade - 1);
    for (let k = 0; k < bind.grade && item.affixes.length < n; k++) {
      const a = rollAffix(rng, item, fam ? [fam] : families);
      if (!a) break;
      const A = AFFIXES[a.id], dp = Math.pow(10, A.dp || 0);
      a.v = Math.round(a.v * boost * dp) / dp;
      item.affixes.push(a);
    }
  }
  while (item.affixes.length < n) { const a = rollAffix(rng, item, families); if (!a) break; item.affixes.push(a); }
  const good = rarity !== 'common' && rarity !== 'magic';
  if (bp && bp.sockets) item.sockets = new Array(bp.sockets[good ? 1 : 0]).fill(null);
  else if (kind === 'blade' && (good || rng.chance(T.items.socket.blade))) item.sockets = [null];
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
  const bp = bpOf(item), style = (bp && bp.style) || item.kind;
  const base = `${oreOfTier(item.tier).name} ${bp ? bp.name : KIND_NAMES[item.kind]}`;
  if (item.rarity === 'rare') return `${rng.pick(RARE_FIRST)} ${rng.pick(RARE_SECOND[style] || RARE_SECOND.blade)}`;
  if (item.element) return `${ELEMENTS[item.element].prefix} ${base}`;
  if (item.rarity === 'magic' && item.affixes[0]) return `${MAGIC_PREFIX[AFFIXES[item.affixes[0].id].family]} ${base}`;
  return base;
}

// A sealed relic opens at the Lodestar into something rare or better, of
// any blueprint at all (one not yet known is learned from it).
function unsealRelic(rng, relic) {
  const rarity = rng.weighted([[60, 'rare'], [25, 'legendary'], [15, 'set']]);
  if (rarity === 'set') return makeItem(rng, rng.pick(Object.keys(SETS.regalia.pieces)), relic.tier, { rarity });
  const bpId = rng.pick(BP_IDS.filter((id) => BLUEPRINTS[id].kind !== 'core'));
  return makeItem(rng, BLUEPRINTS[bpId].kind, relic.tier, { rarity, bp: bpId, element: rng.chance(0.4) ? rng.pick(Object.keys(ELEMENTS)) : null });
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
  if (item.kind === 'core') return `${CORES[item.core].text}.${CORES[item.core].mod ? ' A modifier: it changes the spells socketed with it.' : ` Tier ${item.tier}.`}`;
  if (item.kind === 'relic') return `Tier ${item.tier}. The Lodestar's light will open it.`;
  return '';
}

function itemKindLine(item) {
  if (item.kind === 'relic') return 'Sealed relic';
  if (item.kind === 'core') return CORES[item.core].mod ? 'Spell modifier' : 'Spell core';
  const bp = bpOf(item);
  return `${RARITY_NAMES[item.rarity]} ${(bp ? bp.name : KIND_NAMES[item.kind]).toLowerCase()} · tier ${item.tier}`;
}

// What else a piece says about itself: its style, element and binding.
function itemNotes(item) {
  const out = [], bp = bpOf(item);
  if (bp && bp.text && bp.kind !== 'core') out.push(bp.text);
  if (item.element) out.push(`${ELEMENTS[item.element].name}: ${ELEMENTS[item.element].text}.`);
  if (item.binding) out.push(`Bound with ${partName(partId(item.binding.kind, item.binding.grade)).toLowerCase()}.`);
  return out;
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
    // from blueprints' implicits
    dashCd: 0, lamp: 0, pullSlow: 0, noisy: 0,
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
    const imp = (bpOf(it) || {}).implicit;
    if (imp) for (const k in imp) s[k] += imp[k];
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

// What an item adds, stat by stat, for comparing two pieces.
const STAT_WORDS = { dmg: ['damage', ''], power: ['spell power', ''], armor: ['armor', ''], hp: ['max health', ''], speed: ['mining speed', '×'] };
function itemStatMap(it) {
  const m = {};
  if (!it) return m;
  const b = it.base || {};
  for (const k of ['dmg', 'armor', 'hp']) if (b[k]) m[k] = b[k];
  if (it.kind === 'focus') m.power = b.power;
  if (it.kind === 'pick') m.speed = b.speed;
  for (const a of it.affixes) m['a:' + a.id] = (m['a:' + a.id] || 0) + a.v;
  return m;
}
// Lines like "+3 armor" / "−5% melee damage": what wearing `it` instead of
// `cur` would change.
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
// Where an affix rolled in its range at its tier, 0–1 (above 1 once raised).
function affixRoll(a, tier) {
  const A = AFFIXES[a.id], lo = affixValue(a.id, tier, 0), hi = affixValue(a.id, tier, 1);
  return hi > lo ? (a.v - lo) / (hi - lo) : 1;
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

// What a blueprint takes: { ore, parts } (ore of the chosen tier, parts of
// the chosen kind and grade). A kind's name stands for its plain blueprint.
// Which parts can bind a blueprint.
function bindsWith(bpId, partStack) {
  const bp = BLUEPRINTS[bpId], p = parsePart(partStack);
  return !!p && (!bp.partKinds || bp.partKinds.includes(p.kind));
}
// The rarity a forge comes out at, by the anvil's quality (0–3).
const craftRarity = (rng, q = 1) => rng.weighted(T.anvil.odds[clamp(q, 0, 3)].map((w, i) => [w, ['common', 'magic', 'rare', 'legendary'][i]]));
const RARITY_STEP = { common: 'magic', magic: 'rare', rare: 'legendary', legendary: 'legendary' };

// Makes a piece from a blueprint: its head in an ore, bound with a part (a
// stack id, as chitin2), maybe with an exotic, forged at quality q. A heart
// binding forged fine or better comes out legendary. The caller has checked
// and spent the materials.
function forgeItem(rng, bpId, oreId, partStack, exoticId, q = 1) {
  const bp = BLUEPRINTS[bpId], tier = T.ores[ORE_INDEX[oreId]].tier, part = parsePart(partStack);
  if (bp.kind === 'core') {
    const core = makeCore(rng, bp.core, Math.min(T.ores.length, tier + (q >= 2 ? 1 : 0)));
    if (part) core.binding = part;
    return core;
  }
  let rarity = craftRarity(rng, q);
  const ex = exoticId && T.exotics.find((e) => e.id === exoticId);
  if (ex && ex.rarity) rarity = RARITY_STEP[rarity];
  if (part && part.kind === 'heart' && q >= 2) rarity = 'legendary';
  const elemental = bp.kind === 'blade' || bp.kind === 'focus';
  return makeItem(rng, bp.kind, tier, { bp: bpId, rarity, family: ex && ex.family, element: elemental && ex && ex.element, binding: part });
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

// What breaking an item down gives back: { ore: id, n, part: stack id |
// null, exotic: id | null }. Some of its ore, the part that bound it, and
// sometimes an exotic.
function salvageYield(rng, item) {
  const bp = item.kind === 'relic' ? null : item.kind === 'core' ? bpOfCore(item.core) : bpOf(item);
  const n = Math.max(1, Math.floor((bp ? bp.ore : 0) * T.salvage.back));
  const good = item.rarity === 'rare' || item.rarity === 'legendary' || item.rarity === 'set';
  const exotic = rng.chance(good ? T.salvage.exoticRare : T.salvage.exotic) ? rng.pick(T.exotics).id : null;
  const part = item.binding ? partId(item.binding.kind, item.binding.grade) : null;
  return { ore: oreOfTier(item.tier).id, n, part, exotic };
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
