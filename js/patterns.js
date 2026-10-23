'use strict';
// ---------------------------------------------------------------------------
// Patterns: a core is its name, and the pattern is what you learned.
//
// A core is a kind (a Form, an Element or a Mod) and a tier, and nothing
// rolls: two Bolt cores of a tier are the same Bolt, and stack. The dark's
// creatures leave parts, as they always did, and the suit reads each one's
// pattern as it falls (the capture field was always the Charter's survey
// instrument): read enough of a kind (T.patterns.scans; an elite counts
// for more, a Keeper for all; the Capture Lens reads faster) and the
// replicator knows what that kind is for. Each kind has one pattern, fixed
// (PATTERNS: a Form's bonus, an Element's or a Mod's), and printing it
// onto a core as it's forged costs that creature's parts. Printed once; a
// masterwork forge prints it stronger.
//
// What drops: an elite leaves the core its first affix names (AFFIX_CORE),
// so the drop is known before the fight; a warden, a Keeper, a sealed relic
// and an ancient forge leave a legendary core, which carries a power and is
// never made. Nothing else leaves a core. Three plain cores of a kind and
// tier fold into one a tier denser at the tuning bench (mergeCores); a
// spare one salvages into ore.
//
// Persisted: Save.data.scans[kind], how much of each kind the suit has
// read. An older save's cores lose the bonuses they rolled and keep their
// kind, tier and power; its threads become ore (migratePatternSave, v9).
// Never say outright that the dark is alive.
// ---------------------------------------------------------------------------

// Each kind's pattern: the bonus it prints (AFFIXES) and its name, as the
// Kindlers before us wrote them.
const PATTERNS = {
  crawler: { bonus: 'openDmg', name: 'Open wound' },
  wisp: { bonus: 'chargeRegen', name: 'Drift' },
  construct: { bonus: 'crit', name: 'Edge' },
  snapjaw: { bonus: 'litArmor', name: 'Set' },
  spitter: { bonus: 'mineSpeed', name: 'Grind' },
  skink: { bonus: 'closeDmg', name: 'Ambush' },
  tusker: { bonus: 'chilledDmg', name: 'Rime' },
  wraith: { bonus: 'burnDmg', name: 'Cinder' },
  lurker: { bonus: 'leech', name: 'Draw' },
  dropper: { bonus: 'arcCharge', name: 'Weight' },
  eel: { bonus: 'shock', name: 'Ground' },
  crab: { bonus: 'armor', name: 'Shell' },
  weaver: { bonus: 'chill', name: 'Snare' },
  sentinel: { bonus: 'castSpeed', name: 'Focus' },
  idol: { bonus: 'regen', name: 'Still' },
  hound: { bonus: 'moveSpeed', name: 'Wind' },
};
const PATTERN_KINDS = Object.keys(PATTERNS);

// The core an elite's affix names: known before the fight.
const AFFIX_CORE = {
  fast: 'quicken', tough: 'amplify', volatile: 'nova', insulated: 'shock', fireproof: 'ember', warded: 'ward', shifting: 'glaive', frosted: 'frost',
  mortar: 'orb', chained: 'chain', bulwark: 'pierce', brood: 'split', hulking: 'arc', splitter: 'split', leech: 'blight', blink: 'bolt', thorns: 'lance',
};
function eliteCoreFor(e) { return (e && e.elite && AFFIX_CORE[e.elite]) || null; }

// --- what the suit has read -------------------------------------------------
function scansOf(s = Save.data) { return s.scans || (s.scans = {}); }
function scanCount(kind) { return scansOf()[kind] || 0; }
function patternKnown(kind) { return !!PATTERNS[kind] && scanCount(kind) >= T.patterns.scans; }
function knownPatterns() { return PATTERN_KINDS.filter(patternKnown); }
// The kinds met so far (any read), the known first, then by how far along.
function scannedKinds() { return PATTERN_KINDS.filter((k) => scanCount(k) > 0).sort((a, b) => Number(patternKnown(b)) - Number(patternKnown(a)) || scanCount(b) - scanCount(a)); }
// Which core kinds a pattern fits: its bonus is one of that kind's concerns.
function patternFits(kind, stoneK) { const p = PATTERNS[kind]; return !!p && (CORE_BONUSES[stoneK] || []).includes(p.bonus); }
function patternsFor(stoneK) { return knownPatterns().filter((k) => patternFits(k, stoneK)); }
function stoneKindOfBonus(id) { return ['form', 'element', 'glyph'].find((k) => CORE_BONUSES[k].includes(id)) || 'glyph'; }
// The part a creature leaves, which printing its pattern takes.
function patternPart(kind) { const e = T.enemies[kind]; return (e && e.part) || Object.keys(PARTS).find((k) => PARTS[k].from === kind) || 'any'; }
function patternCost(kind) { return { kind: patternPart(kind), n: T.patterns.parts }; }
// What a pattern says, printed at a tier.
function patternBonus(kind, tier, q = 0) { const P = T.patterns, p = PATTERNS[kind]; return { id: p.bonus, v: affixValue(p.bonus, tier, P.roll, q >= 3 ? P.master : 1) }; }
function patternWords(kind, tier = 1) { return `${PATTERNS[kind].name}: ${fmtAffix(patternBonus(kind, tier))}`; }

// A kill, read: how much the suit learned (an elite more, a Keeper all; the
// Capture Lens, once made, reads faster). The first time a kind is known,
// it's said. Returns the kind just learned, or null.
function scanKill(d, e) {
  if (!PATTERNS[e.type] || e.type === 'dummy') return null;
  const P = T.patterns, S = scansOf(), was = S[e.type] || 0;
  if (was >= P.scans) return null;
  const lens = typeof toolOwned === 'function' && toolOwned('lens') ? P.lens : 1;
  const n = Math.min(P.scans, was + (e.boss ? P.scans : e.elite ? P.elite : 1) * lens);
  S[e.type] = Math.round(n * 100) / 100;
  if (n >= P.scans) {
    Save.saveField('scans');
    UI.toast(`The suit has read the ${foeWord(e.type)}: ${patternWords(e.type)}. Print it at the forge`, 'rare');
    snd('blueprint');
    Story.say('pattern');
    return e.type;
  }
  return null;
}

// Prints a pattern onto a core as it's forged (q: the anvil's quality; a
// masterwork prints it at T.patterns.master). Once.
function printPattern(c, kind, q = 0) {
  if (!PATTERNS[kind] || c.pattern || !patternFits(kind, stoneKind(c.stone))) return false;
  c.pattern = kind; c.printQ = q >= 3 ? 3 : 0;
  c.bonus = patternBonus(kind, c.tier, c.printQ);
  return true;
}
// A core's bonus, as its pattern says at its tier (the save keeps the
// pattern, not the number, so a retune reaches old cores).
function refreshPattern(c) {
  if (c.pattern && PATTERNS[c.pattern]) c.bonus = patternBonus(c.pattern, c.tier, c.printQ || 0);
  else { c.bonus = null; delete c.pattern; }
}

// A legendary core: any kind, with a power. Found, never made.
function legendaryCore(rng, tier, src) {
  const K = T.cores.kinds, kind = rng.weighted([[K.form, 'form'], [K.element, 'element'], [K.glyph, 'glyph']]);
  const stone = rng.pick(kind === 'form' ? STONE_FORMS : kind === 'element' ? Object.keys(STONE_ELEMENTS) : Object.keys(STONE_GLYPHS));
  const c = makeStone(stone, tier, { rarity: 'legendary', src });
  c.power = rng.pick(Object.keys(LEGENDARIES));
  return c;
}

// --- stacks ------------------------------------------------------------------
// Cores of a kind, tier, pattern and power are the same core: grouped, with
// a count, the first of each standing for the rest. [{ key, c, n, uids }].
const coreKey = (c) => `${c.stone}:${c.tier}:${c.pattern || ''}:${c.power || ''}`;
function coreGroups(list) {
  const out = [], by = new Map();
  for (const c of list) {
    if (!c || c.kind !== 'stone') continue;
    const k = coreKey(c);
    let g = by.get(k);
    if (!g) { g = { key: k, c, n: 0, uids: [] }; by.set(k, g); out.push(g); }
    g.n++; g.uids.push(c.uid);
  }
  return out;
}
// Three plain cores of a kind and tier (no pattern, no power, not the
// densest) fold into one a tier denser.
function coreMergeable(g) { return g.n >= T.cores.merge && !g.c.pattern && !g.c.power && g.c.tier < T.ores.length; }
function mergeCores(list, g) {
  if (!coreMergeable(g) || list.filter((c) => c && c.kind === 'stone' && coreKey(c) === g.key).length < T.cores.merge) return null;
  let left = T.cores.merge;
  for (let i = list.length - 1; i >= 0 && left > 0; i--) if (list[i] && list[i].kind === 'stone' && coreKey(list[i]) === g.key) { list.splice(i, 1); left--; }
  const c = makeStone(g.c.stone, g.c.tier + 1, { src: { merged: true } });
  list.push(c);
  return c;
}
// A spare core salvages into ore of its tier.
function coreSalvageOre(c) { return { id: oreOfTier(c.tier).id, n: T.cores.salvage.ore }; }

// --- an older save: cores as names (version 9) -----------------------------
// Every core loses the bonus it rolled and keeps its kind, tier and power
// (a legendary stays legendary; the rest are plain); threads become ore;
// the tool carried is every tool made. True if anything changed.
function migratePatternSave(s) {
  if ((s.v || 0) >= 9) return false;
  const fix = (c) => {
    if (!c || typeof c !== 'object') return;
    if (c.kind === 'stone') { delete c.temperChoice; c.bonus = null; delete c.pattern; c.rarity = c.power && LEGENDARIES[c.power] ? 'legendary' : 'common'; }
    if (c.kind === 'caster' && Array.isArray(c.spells)) for (const sp of c.spells) { if (!sp) continue; fix(sp.form); fix(sp.el); fix(sp.form2); fix(sp.el2); for (const m of sp.mods || []) fix(m); }
  };
  for (const k of Object.keys(s.equip || {})) fix(s.equip[k]);
  for (const it of s.items || []) fix(it);
  if (s.run) for (const it of s.run.items || []) fix(it);
  const stash = s.stash || (s.stash = {}), th = (stash.thread || 0) + (s.run && s.run.cargo ? s.run.cargo.thread || 0 : 0);
  if (th) stash.lumenite = (stash.lumenite || 0) + Math.max(1, Math.round(th / T.patterns.threadOre));
  delete stash.thread;
  if (s.run && s.run.cargo) delete s.run.cargo.thread;
  delete s.tool;
  s.scans = s.scans && typeof s.scans === 'object' ? s.scans : {};
  s.v = 9;
  return true;
}

// A core's colour on the ground and in its beam: plain, printed, or a
// legendary's.
const CORE_PRINT_COL = '#5fd3d6';
function coreColour(c) { return c.power ? ART.rarity.legendary : c.pattern ? CORE_PRINT_COL : ART.rarity.common; }
