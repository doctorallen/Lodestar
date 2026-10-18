'use strict';
// ---------------------------------------------------------------------------
// What can be forged, and from what. A blueprint is an item type: its kind
// (which slot it goes in), its style (how it fights), how much ore makes its
// head and how many creature parts bind it, and what it does differently.
// Blueprints marked start are known from the first day; the rest are found
// in the depths (dropped by elites and keepers, left by ancient forges) and
// must be carried home to be learned.
//
// Parts come from what you kill: each kind of creature leaves its own, in
// three grades (one a biome). The part that binds a piece guarantees affixes
// from its family, as many as its grade, a little stronger the higher the
// grade. Exotics give a weapon or focus an element, steer an affix, or raise
// the rarity.
// ---------------------------------------------------------------------------

// mult: the base stat against a plain piece of its kind at the same tier.
// sockets: [plain, rare or better]. implicit: what it always does.
const BLUEPRINTS = {
  // fighting: the main or off hand
  blade: { name: 'Blade', kind: 'blade', style: 'blade', ore: 8, parts: 2, mult: 1, start: true, text: 'Three-hit combos. Hold to spin.' },
  spear: { name: 'Spear', kind: 'blade', style: 'spear', ore: 9, parts: 2, mult: 1.05, text: 'Long, narrow thrusts. Hold to lunge through what is ahead.' },
  hammer: { name: 'Hammer', kind: 'blade', style: 'hammer', ore: 12, parts: 3, mult: 1.7, text: 'Slow, wide blows that always stagger. Hold to slam the ground.' },
  whip: { name: 'Chain-whip', kind: 'blade', style: 'whip', ore: 9, parts: 3, mult: 0.8, text: 'Quick, wide sweeps at reach. Hold to drag enemies in.' },
  // casting
  wand: { name: 'Focus', kind: 'focus', style: 'wand', ore: 8, parts: 2, mult: 1, sockets: [1, 2], start: true, text: 'Casts the cores socketed in it.' },
  staff: { name: 'Staff', kind: 'focus', style: 'staff', ore: 10, parts: 3, mult: 1, sockets: [2, 3], text: 'More sockets. A charged cast fires three times.' },
  gauntlet: { name: 'Gauntlet', kind: 'focus', style: 'gauntlet', ore: 9, parts: 2, mult: 1.35, sockets: [1, 1], text: 'One socket, cast hard and cheap, but only at close range.' },
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
  // spell cores: bound with ether (or a heart)
  core_bolt: { name: 'Arc Bolt', kind: 'core', core: 'bolt', ore: 6, parts: 2, partKinds: ['ether', 'heart'], start: true },
  core_nova: { name: 'Nova', kind: 'core', core: 'nova', ore: 6, parts: 2, partKinds: ['ether', 'heart'] },
  core_pull: { name: 'Lodestone Pull', kind: 'core', core: 'pull', ore: 6, parts: 2, partKinds: ['ether', 'heart'] },
  core_ward: { name: 'Ward Pulse', kind: 'core', core: 'ward', ore: 6, parts: 2, partKinds: ['ether', 'heart'] },
  core_frost: { name: 'Frost Lance', kind: 'core', core: 'frost', ore: 7, parts: 2, partKinds: ['ether', 'heart'] },
  core_ember: { name: 'Ember Burst', kind: 'core', core: 'ember', ore: 7, parts: 2, partKinds: ['ether', 'heart'] },
  core_chain: { name: 'Chain Lightning', kind: 'core', core: 'chain', ore: 7, parts: 2, partKinds: ['ether', 'heart'] },
  core_thorns: { name: 'Thorn Ring', kind: 'core', core: 'thorns', ore: 7, parts: 2, partKinds: ['ether', 'fiber', 'heart'] },
  core_blink: { name: 'Blink', kind: 'core', core: 'blink', ore: 6, parts: 2, partKinds: ['ether', 'heart'] },
  core_well: { name: 'Gravity Well', kind: 'core', core: 'well', ore: 8, parts: 2, partKinds: ['ether', 'cog', 'heart'] },
  core_phase: { name: 'Phase Step', kind: 'core', core: 'phase', ore: 6, parts: 2, partKinds: ['ether', 'heart'] },
  // modifiers: socketed beside a spell, they change every spell in the piece
  mod_split: { name: 'Split', kind: 'core', core: 'split', ore: 5, parts: 3, partKinds: ['ether', 'spore', 'heart'] },
  mod_amplify: { name: 'Amplify', kind: 'core', core: 'amplify', ore: 5, parts: 3, partKinds: ['ether', 'chitin', 'heart'] },
  mod_quicken: { name: 'Quicken', kind: 'core', core: 'quicken', ore: 5, parts: 3, partKinds: ['ether', 'cog', 'heart'] },
  mod_chain: { name: 'Chain', kind: 'core', core: 'chainmod', ore: 5, parts: 3, partKinds: ['ether', 'heart'] },
  mod_echo: { name: 'Echo', kind: 'core', core: 'echo', ore: 5, parts: 3, partKinds: ['ether', 'heart'] },
};
const BP_IDS = Object.keys(BLUEPRINTS);
// what a piece made before blueprints is
const KIND_BLUEPRINT = { blade: 'blade', focus: 'wand', armor: 'plate', charm: 'charm', pick: 'pick' };
const bpOf = (item) => BLUEPRINTS[item.bp || KIND_BLUEPRINT[item.kind]] || null;
// the blueprint a spell or modifier core is forged from
const bpOfCore = (core) => BLUEPRINTS[BP_IDS.find((id) => BLUEPRINTS[id].core === core)] || null;

// Where each blueprint tends to turn up.
const BLUEPRINT_BIOME = {
  rim: ['spear', 'whip', 'weave', 'lantern', 'core_nova', 'core_ward', 'core_thorns', 'core_blink', 'mod_split'],
  choir: ['staff', 'gauntlet', 'hammer', 'core_pull', 'core_frost', 'core_chain', 'core_well', 'mod_chain', 'mod_amplify'],
  underforge: ['shell', 'drill', 'hammer', 'gauntlet', 'core_ember', 'core_phase', 'mod_echo', 'mod_quicken'],
};

// Creature parts. family: the affixes a part binds in. heart: the warden's;
// it binds any family and makes a legendary likelier.
const PARTS = {
  chitin: { name: 'chitin', from: 'crawler', family: 'defense' },
  ether: { name: 'ether', from: 'wisp', family: 'spell' },
  cog: { name: 'cog', from: 'construct', family: 'melee' },
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

// Elements a weapon or focus can carry (from an exotic in its forging).
const ELEMENTS = {
  shock: { name: 'Shock', prefix: 'Voltaic', text: 'Hits can arc lightning to the next enemy' },
  frost: { name: 'Frost', prefix: 'Rimed', text: 'Hits chill; a heavy hit on a chilled enemy shatters for more' },
  ember: { name: 'Ember', prefix: 'Ember', text: 'Hits set enemies burning' },
  blight: { name: 'Blight', prefix: 'Blighted', text: 'Hits poison; the poisoned spread it when they fall' },
};
