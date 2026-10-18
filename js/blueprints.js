'use strict';
// ---------------------------------------------------------------------------
// What can be forged, and from what. A blueprint is an item type: its kind
// (which slot it goes in), its style (how it fights), how much ore makes its
// head and how many creature parts bind it, and what it does differently.
// Blueprints marked start are known from the first day; the rest are found
// in the depths (dropped by elites and keepers, left by ancient forges) and
// must be carried home to be learned. The forge also makes the stones a
// caster's circuit is built from (circuits.js).
//
// Parts come from what you kill: each kind of creature leaves its own, in
// three grades (one a biome). The part that binds a piece guarantees affixes
// from its family, as many as its grade, a little stronger the higher the
// grade; some kinds of part also make Glyph stones. An elemental exotic makes
// its Element stone; the others steer an affix, raise the rarity or the tier.
// ---------------------------------------------------------------------------

// mult: the base stat against a plain piece of its kind at the same tier.
// implicit: what it always does. A stone's blueprint names its stone, and
// takes what T.circuits.stones says for its kind: partKinds, the creature
// parts that bind it (any, if none are named); exotic, the one it's made
// from.
const BLUEPRINTS = {
  // casters: the main or off hand. Their slots hold the circuit
  wand: { name: 'Wand', kind: 'caster', style: 'wand', ore: 8, parts: 2, mult: 1, start: true, text: 'Quick to cast.' },
  gauntlet: { name: 'Gauntlet', kind: 'caster', style: 'gauntlet', ore: 9, parts: 2, mult: 1, start: true, text: 'Close Forms cost 1 charge less.' },
  staff: { name: 'Staff', kind: 'caster', style: 'staff', ore: 10, parts: 3, mult: 1, text: 'More slots. Slower to cast, and every reach is wider.' },
  // armor
  plate: { name: 'Plate', kind: 'armor', style: 'plate', ore: 10, parts: 2, mult: 1, start: true, text: 'Armor and health.' },
  weave: { name: 'Weave', kind: 'armor', style: 'weave', ore: 7, parts: 3, mult: 0.55, implicit: { dashCd: -30, moveSpeed: 5 }, text: 'Light. Dash 30% more often, and move a little faster.' },
  shell: { name: 'Shell', kind: 'armor', style: 'shell', ore: 12, parts: 3, mult: 1.6, implicit: { moveSpeed: -8 }, text: 'Heavy. Much more armor, a little slower.' },
  // charms
  charm: { name: 'Charm', kind: 'charm', style: 'charm', ore: 6, parts: 2, start: true, text: 'Affixes of any kind.' },
  lantern: { name: 'Lantern', kind: 'charm', style: 'lantern', ore: 6, parts: 3, implicit: { lamp: 30, pullSlow: 20 }, text: "A brighter lamp, and the star's pull fades 20% slower." },
  // picks
  pick: { name: 'Pick', kind: 'pick', style: 'pick', ore: 12, parts: 1, mult: 1, start: true, text: 'Breaks the ore above its own.' },
  drill: { name: 'Drill', kind: 'pick', style: 'drill', ore: 12, parts: 2, mult: 1.6, implicit: { noisy: 1 }, text: 'Mines 60% faster, but the noise wakes what is near.' },
};
// Stones (circuits.js): a Form's is learned from its blueprint (Arc and Bolt
// from the start); Elements and Glyphs are known from the start, and made
// from an exotic or creature parts.
const STONE_FORMS = ['arc', 'glaive', 'bolt', 'lance', 'orb', 'nova', 'well', 'ward'];
const STONE_ELEMENTS = { force: null, shock: 'voltaic', frost: 'frostglass', ember: 'emberglass', blight: 'blightcap' };
const STONE_GLYPHS = { split: ['chitin'], amplify: null, quicken: ['cog'], chain: ['spore'], echo: ['ether'], pierce: ['chitin'], linger: ['fiber'], trigger: ['fiber'] };
for (const f of STONE_FORMS) BLUEPRINTS['form_' + f] = { name: CIRCUIT_FORMS[f].name, kind: 'stone', stone: f, stoneKind: 'form', partKinds: ['ether', 'heart'], start: f === 'arc' || f === 'bolt' };
for (const e in STONE_ELEMENTS) BLUEPRINTS['el_' + e] = { name: CIRCUIT_ELEMENTS[e].name, kind: 'stone', stone: e, stoneKind: 'element', exotic: STONE_ELEMENTS[e], start: true };
for (const g in STONE_GLYPHS) BLUEPRINTS['glyph_' + g] = { name: CIRCUIT_GLYPHS[g].name, kind: 'stone', stone: g, stoneKind: 'glyph', partKinds: STONE_GLYPHS[g], start: true };
for (const id in BLUEPRINTS) {
  const bp = BLUEPRINTS[id];
  if (bp.kind !== 'stone') continue;
  const S = T.circuits.stones[bp.stoneKind];
  bp.ore = S.ore; bp.parts = S.parts || 0;
}
const BP_IDS = Object.keys(BLUEPRINTS);
// what a piece made before blueprints is
const KIND_BLUEPRINT = { caster: 'wand', armor: 'plate', charm: 'charm', pick: 'pick' };
const bpOf = (item) => BLUEPRINTS[item.bp || KIND_BLUEPRINT[item.kind]] || null;
// the blueprint a stone is forged from
const bpOfStone = (stone) => BLUEPRINTS[BP_IDS.find((id) => BLUEPRINTS[id].stone === stone)] || null;

// Where each blueprint tends to turn up.
const BLUEPRINT_BIOME = {
  rim: ['weave', 'lantern', 'form_nova', 'form_ward', 'form_glaive'],
  choir: ['staff', 'form_lance', 'form_well', 'form_orb'],
  underforge: ['shell', 'drill', 'staff', 'form_glaive', 'form_orb'],
};

// Creature parts. family: the affixes a part binds in. heart: the warden's;
// it binds any family and makes a legendary likelier.
const PARTS = {
  chitin: { name: 'chitin', from: 'crawler', family: 'defense' },
  ether: { name: 'ether', from: 'wisp', family: 'spell' },
  cog: { name: 'cog', from: 'construct', family: 'close' },
  fiber: { name: 'fibre', from: 'snapjaw', family: 'utility' },
  spore: { name: 'spore', from: 'spitter', family: 'mining' },
  heart: { name: 'heart', from: 'warden', family: null },
};
const PART_IDS = Object.keys(PARTS);
const PART_GRADES = ['Rim', 'Choir', 'Forge'];
// A part in the stash or cargo: its kind and grade in one id, as chitin2.
const partId = (kind, grade) => kind + grade;
const parsePart = (id) => { const m = /^([a-z]+)([123])$/.exec(id); return m && PARTS[m[1]] ? { kind: m[1], grade: Number(m[2]) } : null; };
const partName = (id) => { const p = parsePart(id); return p ? `${PART_GRADES[p.grade - 1]} ${PARTS[p.kind].name}` : id; };
const PART_STACK_IDS = PART_IDS.flatMap((k) => [1, 2, 3].map((g) => partId(k, g)));
