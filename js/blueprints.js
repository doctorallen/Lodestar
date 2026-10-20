'use strict';
// ---------------------------------------------------------------------------
// What can be made, and from what: the recipes, and the research that
// reveals them. A recipe is known (it shows at the forge with exactly what
// it makes and costs) or not yet; recipes are revealed by research, when
// something new comes home (an ore, a creature's part, an exotic, a module
// caught from a kind of creature) and the forge studies it. A few are known
// from the first day. (Before research, recipes were blueprints found in
// the field; an old save's blueprints are known recipes, and the save keeps
// them under that name.)
//
// Gear is a crafted base: a caster, plate or a charm, or a pick. Its recipe
// and the ore it's made in set exactly what it is (its stats, its circuit
// slots, its module sockets); the anvil only adds. What gives a piece its
// identity is the modules socketed into it (modules.js). The forge also
// makes the stones a caster's circuit is built from (circuits.js), and the
// carried tools (tools.js).
//
// Parts come from what you kill: each kind of creature leaves its own, in
// three grades (one a biome). The plain recipes known from the start take
// any creature's parts; the rest name the kind they take, so each sends
// you hunting its creature (any grade, the lowest first).
// ---------------------------------------------------------------------------

// cat: the forge's tab. A later pass may add recipes of cat 'structure'
// (the outpost's buildings) and 'wick' (Wick's upgrades): the forge shows a
// tab for any cat that has a recipe (RECIPE_CATS).
// kind: which slot it goes in (a stone or a tool is neither). ore: how much
// of the chosen ore makes it (a tool names its own, in T.tools). need: the
// parts it takes, by kind ('any': any creature's). mult: the base stat
// against a plain piece of its kind at the same tier. implicit: what it
// always does. A stone's recipe names its stone; an Element's is made from
// its exotic.
const BLUEPRINTS = {
  // casters: the main or off hand. Their slots hold the circuit
  wand: { name: 'Wand', kind: 'caster', cat: 'caster', style: 'wand', ore: 8, need: { any: 2 }, mult: 1, start: true, text: 'Quick to cast.' },
  gauntlet: { name: 'Gauntlet', kind: 'caster', cat: 'caster', style: 'gauntlet', ore: 9, need: { any: 2 }, mult: 1, start: true, text: 'Close Forms cost 1 charge less.' },
  staff: { name: 'Staff', kind: 'caster', cat: 'caster', style: 'staff', ore: 10, need: { ether: 3 }, mult: 1, text: 'More slots. Slower to cast, and every reach is wider.' },
  // armor
  plate: { name: 'Plate', kind: 'armor', cat: 'armor', style: 'plate', ore: 10, need: { any: 2 }, mult: 1, start: true, text: 'Armor and health.' },
  weave: { name: 'Weave', kind: 'armor', cat: 'armor', style: 'weave', ore: 7, need: { fiber: 3 }, mult: 0.55, implicit: { dashCd: -30, moveSpeed: 5 }, text: 'Light. Dash 30% more often, and move a little faster.' },
  shell: { name: 'Shell', kind: 'armor', cat: 'armor', style: 'shell', ore: 12, need: { chitin: 3 }, mult: 1.6, implicit: { moveSpeed: -8 }, text: 'Heavy. Much more armor, a little slower.' },
  // charms
  charm: { name: 'Charm', kind: 'charm', cat: 'charm', style: 'charm', ore: 6, need: { any: 2 }, start: true, text: 'Takes modules of any family.' },
  lantern: { name: 'Lantern', kind: 'charm', cat: 'charm', style: 'lantern', ore: 6, need: { spore: 2 }, implicit: { lamp: 30, pullSlow: 20 }, text: 'A brighter lamp, and your light fades 20% slower.' },
  // picks, with the tools
  pick: { name: 'Pick', kind: 'pick', cat: 'tool', style: 'pick', ore: 12, need: { any: 1 }, mult: 1, start: true, text: 'Breaks the ore above its own.' },
  drill: { name: 'Drill', kind: 'pick', cat: 'tool', style: 'drill', ore: 12, need: { cog: 2 }, mult: 1.6, implicit: { noisy: 1 }, text: 'Mines 60% faster, but the noise wakes what is near.' },
};
// The carried tools (tools.js), made once: their cost is T.tools[id].cost,
// and the star must have reached T.tools[id].mag.
for (const id of ['oresense', 'radar', 'beacon', 'map', 'satchel', 'lens']) BLUEPRINTS['tool_' + id] = { name: id, kind: 'tool', cat: 'tool', tool: id, start: id !== 'lens' };
// Stones (circuits.js): a Form's needs ether; an Element's, its exotic
// (Force, only ore); a Glyph's, its creature's parts.
const STONE_FORMS = ['arc', 'glaive', 'bolt', 'lance', 'orb', 'nova', 'well', 'ward'];
const STONE_ELEMENTS = { force: null, shock: 'voltaic', frost: 'frostglass', ember: 'emberglass', blight: 'blightcap' };
const STONE_GLYPHS = { split: 'chitin', amplify: 'any', quicken: 'cog', chain: 'spore', echo: 'ether', pierce: 'chitin', linger: 'fiber', trigger: 'fiber' };
for (const f of STONE_FORMS) BLUEPRINTS['form_' + f] = { name: CIRCUIT_FORMS[f].name, kind: 'stone', cat: 'stone', stone: f, stoneKind: 'form', start: f === 'arc' || f === 'bolt' };
for (const e in STONE_ELEMENTS) BLUEPRINTS['el_' + e] = { name: CIRCUIT_ELEMENTS[e].name, kind: 'stone', cat: 'stone', stone: e, stoneKind: 'element', exotic: STONE_ELEMENTS[e], start: e === 'force' };
for (const g in STONE_GLYPHS) BLUEPRINTS['glyph_' + g] = { name: CIRCUIT_GLYPHS[g].name, kind: 'stone', cat: 'stone', stone: g, stoneKind: 'glyph', start: g === 'amplify' };
for (const id in BLUEPRINTS) {
  const bp = BLUEPRINTS[id];
  if (bp.kind !== 'stone') continue;
  const S = T.circuits.stones[bp.stoneKind];
  bp.ore = S.ore;
  if (bp.stoneKind === 'form') bp.need = { ether: S.parts };
  else if (bp.stoneKind === 'glyph') bp.need = { [STONE_GLYPHS[bp.stone]]: S.parts };
  else bp.need = {};
}
const BP_IDS = Object.keys(BLUEPRINTS);
// The forge's tabs, in order; those after 'stone' wait for a later pass.
const RECIPE_CATS = [['CASTERS', 'caster'], ['ARMOR', 'armor'], ['CHARMS', 'charm'], ['TOOLS', 'tool'], ['STONES', 'stone'], ['BUILDINGS', 'structure'], ['WICK', 'wick']];
// what a piece made before blueprints is
const KIND_BLUEPRINT = { caster: 'wand', armor: 'plate', charm: 'charm', pick: 'pick' };
const bpOf = (item) => (item && item.kind !== 'module' && item.kind !== 'relic' && item.kind !== 'stone' ? BLUEPRINTS[item.bp || KIND_BLUEPRINT[item.kind]] || null : null);
// the recipe a stone is forged from
const bpOfStone = (stone) => BLUEPRINTS[BP_IDS.find((id) => BLUEPRINTS[id].stone === stone)] || null;
const recipeName = (id) => { const bp = BLUEPRINTS[id]; return bp.tool ? TOOLS[bp.tool].name : bp.kind === 'stone' ? bp.name + ' stone' : bp.name; };

// Research: what the forge studies, and the recipes it reveals. of: an
// ore, a part's kind, an exotic, or a module caught from a kind of
// creature ('any': the first module of all). The first time one is at home
// when the forge is opened, the forge studies it (modules.js).
const RESEARCH = [
  { id: 'ore:lumenite', of: 'lumenite', opens: ['lantern', 'form_nova'] },
  { id: 'ore:resonite', of: 'resonite', opens: ['staff', 'drill'] },
  { id: 'ore:aetherglass', of: 'aetherglass', opens: ['form_lance', 'form_well'] },
  { id: 'ore:sigilite', of: 'sigilite', opens: ['shell'] },
  { id: 'part:chitin', of: 'chitin', opens: ['glyph_pierce', 'glyph_split'] },
  { id: 'part:ether', of: 'ether', opens: ['glyph_echo'] },
  { id: 'part:cog', of: 'cog', opens: ['glyph_quicken'] },
  { id: 'part:fiber', of: 'fiber', opens: ['glyph_linger', 'glyph_trigger'] },
  { id: 'part:spore', of: 'spore', opens: ['glyph_chain'] },
  { id: 'part:heart', of: 'heart', opens: ['form_ward'] },
  { id: 'ex:voltaic', of: 'voltaic', opens: ['el_shock'] },
  { id: 'ex:frostglass', of: 'frostglass', opens: ['el_frost'] },
  { id: 'ex:emberglass', of: 'emberglass', opens: ['el_ember'] },
  { id: 'ex:blightcap', of: 'blightcap', opens: ['el_blight'] },
  { id: 'mod:any', of: 'any', opens: ['tool_lens'] },
  { id: 'mod:snapjaw', of: 'snapjaw', opens: ['weave'] },
  { id: 'mod:wisp', of: 'wisp', opens: ['form_orb'] },
  { id: 'mod:construct', of: 'construct', opens: ['form_glaive'] },
];

// Creature parts. family: the affixes a creature's own modules lean to
// (modules.js). heart: the warden's.
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
// The parts a recipe can take for 'any': every creature's but the heart.
const ANY_PARTS = ['chitin', 'ether', 'cog', 'fiber', 'spore'];

// How many of a part's kind (any grade) `src` holds; 'any', of any kind
// but a heart.
function partsHave(src, kind) {
  const kinds = kind === 'any' ? ANY_PARTS : [kind];
  let n = 0;
  for (const k of kinds) for (const g of [1, 2, 3]) n += src[partId(k, g)] || 0;
  return n;
}
// Takes n parts of a kind from `src`, the lowest grade first ('any': the
// kind there's most of first). False, and nothing taken, if there aren't
// enough.
function partsTake(src, kind, n) {
  if (partsHave(src, kind) < n) return false;
  const kinds = kind === 'any' ? ANY_PARTS.slice().sort((a, b) => partsHave(src, b) - partsHave(src, a)) : [kind];
  for (const k of kinds) for (const g of [1, 2, 3]) {
    const id = partId(k, g), m = Math.min(n, src[id] || 0);
    if (!m) continue;
    src[id] -= m; n -= m;
    if (!src[id]) delete src[id];
  }
  return true;
}
// "2 cogs", "1 creature part (any kind)"
function partWords(kind, n) {
  if (kind === 'any') return `${n} creature part${n === 1 ? '' : 's'} (any kind)`;
  const w = PARTS[kind].name;
  return `${n} ${w}${n === 1 || /fibre|chitin|ether/.test(w) ? '' : 's'}`;
}

// What a recipe costs, made in an ore (oreId; a tool names its own) and,
// for a caster, at a size (its circuit slots): { ore: { id, n } | null,
// parts: [{ kind, n }], exotic: id | null, stuff: [{ id, n }] (a tool's
// costs besides parts) }.
function recipeCost(bpId, oreId, size) {
  const bp = BLUEPRINTS[bpId], out = { ore: null, parts: [], exotic: null, stuff: [] };
  if (bp.kind === 'tool') {
    const c = T.tools[bp.tool].cost;
    for (const k in c) if (PARTS[k]) out.parts.push({ kind: k, n: c[k] }); else out.stuff.push({ id: k, n: c[k] });
    return out;
  }
  const extra = bp.kind === 'caster' ? Math.max(0, (size || casterSizes(bpId)[0]) - casterSizes(bpId)[0]) : 0;
  out.ore = { id: oreId, n: bp.ore + extra * T.gear.sizeOre };
  for (const k in bp.need) out.parts.push({ kind: k, n: bp.need[k] + (out.parts.length ? 0 : extra * T.gear.sizeParts) });
  if (bp.exotic) out.exotic = bp.exotic;
  return out;
}
// What's short of a cost in `src`: a list of { id (a stuff id) or part (a
// part's kind), n (how many more) }; empty when it can be paid.
function recipeShort(cost, src) {
  const out = [];
  if (cost.ore && (src[cost.ore.id] || 0) < cost.ore.n) out.push({ id: cost.ore.id, n: cost.ore.n - (src[cost.ore.id] || 0) });
  for (const p of cost.parts) { const h = partsHave(src, p.kind); if (h < p.n) out.push({ part: p.kind, n: p.n - h }); }
  for (const s of cost.stuff) if ((src[s.id] || 0) < s.n) out.push({ id: s.id, n: s.n - (src[s.id] || 0) });
  if (cost.exotic && !(src[cost.exotic] > 0)) out.push({ id: cost.exotic, n: 1 });
  return out;
}
// Pays a cost from `src`; false (and nothing taken) if it's short.
function recipePay(cost, src) {
  if (recipeShort(cost, src).length) return false;
  if (cost.ore) { src[cost.ore.id] -= cost.ore.n; if (!src[cost.ore.id]) delete src[cost.ore.id]; }
  for (const p of cost.parts) partsTake(src, p.kind, p.n);
  for (const s of cost.stuff) { src[s.id] -= s.n; if (!src[s.id]) delete src[s.id]; }
  if (cost.exotic) { src[cost.exotic] -= 1; if (!src[cost.exotic]) delete src[cost.exotic]; }
  return true;
}
// The sizes a caster's recipe can be made at (its circuit slots), smallest
// first.
function casterSizes(bpId) { return T.gear.size[(BLUEPRINTS[bpId] || {}).style] || T.gear.size.wand; }
