'use strict';
// ---------------------------------------------------------------------------
// What can be made, and from what: the recipes, and the research that
// reveals them. A recipe is known (it shows at the forge with exactly what
// it makes and costs) or not yet; recipes are revealed by research, when
// something new comes home (an ore, a creature's part, an exotic) or the
// suit has read a kind of creature's pattern (patterns.js) and the forge
// studies it. A few are known
// from the first day. (Before research, recipes were blueprints found in
// the field; an old save's blueprints are known recipes, and the save keeps
// them under that name.)
//
// Gear is a crafted base: a rig frame, plate or a charm, or a cutter. Its
// recipe and the ore it's made in set exactly what it is (its stats, a
// frame's slots); the anvil only adds. What gives a piece its identity is
// the cores set into it. The forge also makes the cores the rig's spells
// are built from (circuits.js), with a pattern printed on if the suit has
// read one (patterns.js), and the tools (tools.js), each once.
//
// Parts come from what you kill: each kind of creature leaves its own, in
// three grades (one a biome). The plain recipes known from the start take
// any creature's parts; the rest name the kind they take, so each sends
// you hunting its creature (any grade, the lowest first).
// ---------------------------------------------------------------------------

// cat: the forge's tab ('structure': the outpost's buildings; 'wick':
// Wick's upgrades): the forge shows a tab for any cat that has a recipe
// (RECIPE_CATS).
// kind: which slot it goes in (a core or a tool is neither). ore: how much
// of the chosen ore makes it (a tool names its own, in T.tools). need: the
// parts it takes, by kind ('any': any creature's). mult: the base stat
// against a plain piece of its kind at the same tier. implicit: what it
// always does. A core's recipe names its core (the save's old word: stone);
// an Element's is made from its exotic.
const BLUEPRINTS = {
  // the rig: one frame, worn on both wrists, driving both spells
  rig: { name: 'Rig', kind: 'caster', cat: 'caster', style: 'rig', ore: 14, need: { any: 2 }, mult: 1, start: true },
  // armor
  plate: { name: 'Plate', kind: 'armor', cat: 'armor', style: 'plate', ore: 21, need: { any: 2 }, mult: 1, start: true, text: 'Armor and health.' },
  weave: { name: 'Weave', kind: 'armor', cat: 'armor', style: 'weave', ore: 16, need: { fiber: 3 }, mult: 0.55, implicit: { dashCd: -30, moveSpeed: 5 }, text: 'Light. Dash 30% more often, and move a little faster.' },
  shell: { name: 'Shell', kind: 'armor', cat: 'armor', style: 'shell', ore: 26, need: { chitin: 3 }, mult: 1.6, implicit: { moveSpeed: -8 }, text: 'Heavy. Much more armor, a little slower.' },
  // charms
  charm: { name: 'Charm', kind: 'charm', cat: 'charm', style: 'charm', ore: 13, need: { any: 2 }, start: true, text: 'A plain charm.' },
  lantern: { name: 'Lantern', kind: 'charm', cat: 'charm', style: 'lantern', ore: 13, need: { spore: 2 }, implicit: { lamp: 30, pullSlow: 20 }, text: 'A brighter lamp, and your light fades 20% slower.' },
  // cutters (kind 'pick'), with the tools
  pick: { name: 'Cutter', kind: 'pick', cat: 'pick', style: 'pick', ore: 15, need: { any: 1 }, mult: 1, start: true, text: 'Breaks the ore above its own.' },
  drill: { name: 'Drill', kind: 'pick', cat: 'pick', style: 'drill', ore: 23, need: { cog: 2 }, mult: 1.6, implicit: { noisy: 1 }, text: 'Mines 60% faster, but the noise wakes what is near.' },
};
// The carried tools (tools.js), made once: their cost is T.tools[id].cost,
// and the star must have reached T.tools[id].mag.
for (const id of ['oresense', 'radar', 'beacon', 'map', 'lens']) BLUEPRINTS['tool_' + id] = { name: id, kind: 'tool', cat: 'tool', tool: id, start: id !== 'lens' };
// The outpost's buildings (structures.js) and Wick's upgrades (wick.js),
// each made once at home: known from the first day, their cost is
// T.structures[id].cost or T.wickUp[id].cost, and the star must have
// reached their mag (Wick's need the Drone Bay besides).
const STRUCTURE_IDS = ['bay', 'refinery', 'relay', 'quarters'];
const STRUCTURE_NAMES = { bay: 'Drone Bay', refinery: 'Refinery', relay: 'Forward Relay', quarters: "Settlers' Quarters" };
const WICK_UP_IDS = ['scan', 'lamp', 'shield', 'spark'];
const WICK_UP_NAMES = { scan: 'Scanner', lamp: 'Lamp', shield: 'Hex Shield', spark: 'Spark' };
for (const id of STRUCTURE_IDS) BLUEPRINTS['bld_' + id] = { name: STRUCTURE_NAMES[id], kind: 'structure', cat: 'structure', structure: id, start: true };
for (const id of WICK_UP_IDS) BLUEPRINTS['wick_' + id] = { name: WICK_UP_NAMES[id], kind: 'wick', cat: 'wick', wick: id, start: true };
// Recipes made once, for a fixed cost (no ore to choose, no anvil).
const recipeOnce = (bp) => !!bp && (bp.kind === 'tool' || bp.kind === 'structure' || bp.kind === 'wick');
// Cores (circuits.js): a Form's needs ether (a Ward's, a warden's heart);
// an Element's, its exotic (Force, only ore); a Mod's, its creature's parts.
const STONE_FORMS = ['arc', 'glaive', 'bolt', 'lance', 'orb', 'nova', 'well', 'ward'];
const STONE_ELEMENTS = { force: null, shock: 'voltaic', frost: 'frostglass', ember: 'emberglass', blight: 'blightcap' };
const STONE_GLYPHS = { split: 'chitin', amplify: 'any', quicken: 'cog', chain: 'spore', echo: 'ether', pierce: 'chitin', linger: 'fiber' };
for (const f of STONE_FORMS) BLUEPRINTS['form_' + f] = { name: CIRCUIT_FORMS[f].name, kind: 'stone', cat: 'stone', stone: f, stoneKind: 'form', start: f === 'arc' || f === 'bolt' };
for (const e in STONE_ELEMENTS) BLUEPRINTS['el_' + e] = { name: CIRCUIT_ELEMENTS[e].name, kind: 'stone', cat: 'stone', stone: e, stoneKind: 'element', exotic: STONE_ELEMENTS[e], start: e === 'force' };
for (const g in STONE_GLYPHS) BLUEPRINTS['glyph_' + g] = { name: CIRCUIT_GLYPHS[g].name, kind: 'stone', cat: 'stone', stone: g, stoneKind: 'glyph', start: g === 'amplify' };
for (const id in BLUEPRINTS) {
  const bp = BLUEPRINTS[id];
  if (bp.kind !== 'stone') continue;
  const S = T.circuits.stones[bp.stoneKind];
  bp.ore = S.ore;
  if (bp.stoneKind === 'form') bp.need = bp.stone === 'ward' ? { heart: 1 } : { ether: S.parts };
  else if (bp.stoneKind === 'glyph') bp.need = { [STONE_GLYPHS[bp.stone]]: S.parts };
  else bp.need = {};
}
const BP_IDS = Object.keys(BLUEPRINTS);
// The forge's tabs, in order.
const RECIPE_CATS = [['FRAMES', 'caster'], ['CUTTERS', 'pick'], ['CORES', 'stone'], ['ARMOR', 'armor'], ['CHARMS', 'charm'], ['TOOLS', 'tool'], ['BUILDINGS', 'structure'], ['WICK', 'wick']];
// what a piece made before blueprints is
const KIND_BLUEPRINT = { caster: 'rig', armor: 'plate', charm: 'charm', pick: 'pick' };
const bpOf = (item) => (item && item.kind !== 'module' && item.kind !== 'relic' && item.kind !== 'stone' ? BLUEPRINTS[item.bp || KIND_BLUEPRINT[item.kind]] || null : null);
// the recipe a core is forged from
const bpOfStone = (stone) => BLUEPRINTS[BP_IDS.find((id) => BLUEPRINTS[id].stone === stone)] || null;
const recipeName = (id) => { const bp = BLUEPRINTS[id]; return bp.tool ? TOOLS[bp.tool].name : bp.kind === 'stone' ? bp.name + ' core' : bp.kind === 'wick' ? "Wick's " + bp.name : bp.name; };

// Research: what the forge studies, and the recipes it reveals. of: an
// ore, a part's kind, an exotic, or a kind of creature whose pattern the
// suit has read ('any': the first pattern of all). The first time one is
// at home when the forge is opened, the forge studies it (modules.js).
const RESEARCH = [
  { id: 'ore:lumenite', of: 'lumenite', opens: ['lantern', 'form_nova'] },
  { id: 'ore:resonite', of: 'resonite', opens: ['drill'] },
  { id: 'ore:aetherglass', of: 'aetherglass', opens: ['form_lance', 'form_well'] },
  { id: 'ore:sigilite', of: 'sigilite', opens: ['shell'] },
  { id: 'part:chitin', of: 'chitin', opens: ['glyph_pierce', 'glyph_split'] },
  { id: 'part:ether', of: 'ether', opens: ['glyph_echo'] },
  { id: 'part:cog', of: 'cog', opens: ['glyph_quicken'] },
  { id: 'part:fiber', of: 'fiber', opens: ['glyph_linger'] },
  { id: 'part:spore', of: 'spore', opens: ['glyph_chain'] },
  { id: 'part:heart', of: 'heart', opens: ['form_ward'] },
  { id: 'ex:voltaic', of: 'voltaic', opens: ['el_shock'] },
  { id: 'ex:frostglass', of: 'frostglass', opens: ['el_frost'] },
  { id: 'ex:emberglass', of: 'emberglass', opens: ['el_ember'] },
  { id: 'ex:blightcap', of: 'blightcap', opens: ['el_blight'] },
  { id: 'scan:any', of: 'any', opens: ['tool_lens'] },
  { id: 'scan:snapjaw', of: 'snapjaw', opens: ['weave'] },
  { id: 'scan:wisp', of: 'wisp', opens: ['form_orb'] },
  { id: 'scan:construct', of: 'construct', opens: ['form_glaive'] },
];

// Creature parts (each kind of creature leaves its own: T.enemies[kind]
// .part, or `from` here). heart: the warden's.
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

// What a recipe costs, made in an ore (oreId; a tool names its own):
// { ore: { id, n } | null, parts: [{ kind, n }], exotic: id | null,
// stuff: [{ id, n }] (a tool's costs besides parts) }.
function recipeCost(bpId, oreId) {
  const bp = BLUEPRINTS[bpId], out = { ore: null, parts: [], exotic: null, stuff: [] };
  if (recipeOnce(bp)) {
    const c = bp.kind === 'tool' ? T.tools[bp.tool].cost : bp.kind === 'structure' ? T.structures[bp.structure].cost : T.wickUp[bp.wick].cost;
    for (const k in c) if (PARTS[k]) out.parts.push({ kind: k, n: c[k] }); else out.stuff.push({ id: k, n: c[k] });
    return out;
  }
  out.ore = { id: oreId, n: bp.ore };
  for (const k in bp.need) out.parts.push({ kind: k, n: bp.need[k] });
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
