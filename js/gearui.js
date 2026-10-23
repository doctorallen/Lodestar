'use strict';
// ---------------------------------------------------------------------------
// The gear screens: the forge (recipes by category, each with exactly what
// it makes and costs, what's close and what's missing; a core's recipe
// with the pattern to print on it and what the suit has read; research's
// reveal when something new comes home), the locker (what's worn, the rig
// and its two spells, frames and bases, the spare cores stacked, salvage),
// the tuning bench (every core, set in the rig or stashed, three of a kind
// to merge, spares to salvage), and the cards: a base's (a rig's spells
// with the drawer of cores to set, free) and a core's (what it does, its
// pattern and power, where it came from; at home, MERGE and SALVAGE).
// ui.js holds the screens' plumbing; these redraw through UI.redraw like
// the rest.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Bits
// ---------------------------------------------------------------------------
// "need 3 more Lumenite and 2 cogs"
function shortWords(short) {
  return short.map((x) => (x.part ? partWords(x.part, x.n) : `${x.n} ${stuffName(x.id)}`)).join(', ');
}
// A core's recipe's cost, with the pattern to print on it (its creature's
// parts) if one's chosen.
function forgeCost(bpId, oreId, pattern) {
  const cost = recipeCost(bpId, oreId);
  if (pattern && BLUEPRINTS[bpId].kind === 'stone' && patternKnown(pattern)) cost.parts.push(patternCost(pattern));
  return cost;
}
// Where a core is: in the stash, or set in a part of the worn rig (or of a
// frame in the stash). { c, base, part ('i:key'), slot } or null.
function findCore(uid) {
  const s = Save.data, key = String(uid);
  const c = s.items.find((x) => x.kind === 'stone' && String(x.uid) === key);
  if (c) return { c, base: null, part: null, slot: null };
  const inRig = (b, slot) => { for (let i = 0; i < (b.spells || []).length; i++) for (const [k, x] of spellParts(b.spells[i])) if (x && String(x.uid) === key) return { c: x, base: b, part: `${i}:${k}`, slot }; return null; };
  if (isCaster(s.equip.main)) { const f = inRig(s.equip.main, 'main'); if (f) return f; }
  for (const b of s.items) if (isCaster(b)) { const f = inRig(b, null); if (f) return f; }
  return null;
}
// Takes a core out of wherever it is (it's being used up).
function removeCore(uid) {
  const f = findCore(uid);
  if (!f) return null;
  if (f.base) { const [i, k] = f.part.split(':'); spellSet(f.base.spells[Number(i)], k, null); } else removeFrom(Save.data.items, f.c);
  return f;
}

// ---------------------------------------------------------------------------
// The forge
// ---------------------------------------------------------------------------
// Where the forge draws its materials from: the stash at home, the cargo at
// an ancient forge.
function forgeSource() { return UI.forge.field && Game.dive ? Game.dive.cargo : Save.data.stash; }
// The tabs: each that has a recipe and is awake yet (onboard.js: FRAMES and
// CUTTERS from the first day, the rest as their moment comes).
const FORGE_TAB_KEY = { stone: 'spells', armor: 'gear', charm: 'gear', tool: 'tools', structure: 'buildings', wick: 'wick', codex: 'spells' };
const forgeTabOpen = (c) => !FORGE_TAB_KEY[c] || onboardHas(FORGE_TAB_KEY[c]);
const forgeCats = () => RECIPE_CATS.filter(([, c]) => BP_IDS.some((id) => BLUEPRINTS[id].cat === c) && forgeTabOpen(c));
// A stand-in for what a recipe makes (no uid): its icon and its numbers.
function recipePreview(bpId, tier, q = 0, shard = false) {
  const bp = BLUEPRINTS[bpId];
  if (bp.kind === 'stone') return { kind: 'stone', stone: bp.stone, tier, rarity: 'common', bonus: null, affixes: [] };
  if (recipeOnce(bp)) return null;
  const it = { kind: bp.kind, bp: bpId, tier, q, rarity: 'common', base: baseStats(bp.kind, tier, bp, q), affixes: [] };
  if (bp.kind === 'caster') { const x = frameExtra(tier, q, shard, oreOfTier(tier).id); it.extra = x; it.spells = [emptySpell(x), emptySpell(x)]; }
  return it;
}
function recipeIconUrl(id, tier = 1) { const bp = BLUEPRINTS[id]; return bp.tool ? toolIconUrl(bp.tool) : bp.structure ? structureIconUrl(bp.structure) : bp.wick ? wickIconUrl(bp.wick) : itemIconUrl(recipePreview(id, tier)); }
// Whether a recipe can be made here at all (a tool, a building or Wick's
// upgrade: once, at home, when the star's grown enough; Wick's once the
// Drone Bay stands), and why not.
function recipeLock(id) {
  const bp = BLUEPRINTS[id];
  if (bp.kind === 'structure') {
    if (UI.forge.field) return 'Built at home';
    if (structureBuilt(bp.structure)) return Save.data.landing === bp.structure ? 'Built: it comes down to its plot' : 'Built: it stands at the outpost';
    if (!structureOpen(bp.structure)) return `The star must reach magnitude ${T.structures[bp.structure].mag}`;
    return null;
  }
  if (bp.kind === 'wick') {
    if (UI.forge.field) return 'Fitted at home';
    if (wickFitted(bp.wick)) return 'Fitted: turn it off or on above';
    if (!structureBuilt('bay')) return 'Build the Drone Bay first (BUILDINGS)';
    if (!structureStands('bay')) return 'The Drone Bay is still coming down';
    if (!wickOpen(bp.wick)) return `The star must reach magnitude ${T.wickUp[bp.wick].mag}`;
    return null;
  }
  if (bp.kind !== 'tool') return null;
  if (UI.forge.field) return 'Made at home';
  if (toolOwned(bp.tool)) return 'Made: always on';
  if (!toolOpen(bp.tool)) return `The star must reach magnitude ${T.tools[bp.tool].mag}`;
  return null;
}
// The ores a recipe could be made in from here: those there's any of.
const forgeOres = (src) => T.ores.filter((o) => (src[o.id] || 0) > 0);
// The best ore to make a recipe in: the highest there's enough of, else the
// highest there's any of.
function forgeBestOre(id, src) {
  const ores = forgeOres(src), ok = ores.filter((o) => !recipeShort(recipeCost(id, o.id), src).length);
  return (ok[ok.length - 1] || ores[ores.length - 1] || T.ores[0]).id;
}
// What's nearly in reach: known recipes that would be better than what's
// worn (or held), short by a little. [{ id, ore, short }], the closest
// first.
function forgeCloseTo(src) {
  const s = Save.data, out = [];
  const worn = (kind) => Math.max(0, ...SLOTS.filter((k) => s.equip[k] && s.equip[k].kind === kind).map((k) => s.equip[k].tier));
  const inRig = (s.equip.main && s.equip.main.spells ? s.equip.main.spells.flatMap(spellCores) : []);
  const stoneTop = (stone) => Math.max(0, ...s.items.concat(inRig).filter((x) => x.kind === 'stone' && x.stone === stone).map((x) => x.tier));
  for (const id of s.blueprints) {
    const bp = BLUEPRINTS[id];
    if (!bp || recipeLock(id) || !forgeTabOpen(bp.cat)) continue;
    const tries = recipeOnce(bp) ? [null] : T.ores.filter((o) => (bp.kind === 'stone' ? o.tier > stoneTop(bp.stone) : o.tier > worn(bp.kind)) && o.tier <= Math.max(1, ...forgeOres(src).map((x) => x.tier)));
    for (const o of tries) {
      const cost = recipeCost(id, o && o.id), short = recipeShort(cost, src);
      if (!short.length) continue;
      // (a building or Wick's upgrade isn't close while it wants an ore not yet found)
      if ((bp.kind === 'structure' || bp.kind === 'wick') && short.some((x) => x.id && ORE_INDEX[x.id] !== undefined && !(src[x.id] > 0))) continue;
      const total = (cost.ore ? cost.ore.n : 0) + cost.parts.reduce((a, p) => a + p.n, 0) + cost.stuff.reduce((a, x) => a + x.n, 0) + (cost.exotic ? 1 : 0);
      const miss = short.reduce((a, x) => a + x.n, 0);
      // (gear before tools)
      if (miss / total <= 0.45) out.push({ id, ore: o && o.id, short, k: miss / total - (o ? o.tier : 0) * 0.01 + (recipeOnce(bp) ? 0.3 : 0) });
    }
  }
  // one row a recipe: its best tier in reach
  const seen = new Set();
  return out.sort((a, b) => a.k - b.k).filter((c) => !seen.has(c.id) && seen.add(c.id)).slice(0, 2);
}

function drawForge() {
  // (at the Drone Bay, only Wick's upgrades; at the forge, all but those)
  const src = forgeSource(), F = UI.forge, s = Save.data, known = s.blueprints.filter((id) => BLUEPRINTS[id] && forgeTabOpen(BLUEPRINTS[id].cat) && !(F.field && recipeOnce(BLUEPRINTS[id])) && (BLUEPRINTS[id].cat === 'wick') === !!F.bay);
  $('forge-title').textContent = F.bay ? 'THE DRONE BAY' : F.field ? 'AN ANCIENT FORGE' : 'THE FORGE';
  if (F.codex && !F.field && !F.bay && forgeTabOpen('codex')) { drawCodex(); return; }
  if (!F.bp || !known.includes(F.bp)) F.bp = known.find((id) => BLUEPRINTS[id].kind === 'caster') || known[0];
  const bp = BLUEPRINTS[F.bp], cat = bp.cat, tool = recipeOnce(bp);
  if (!tool && (!F.ore || !forgeOres(src).some((o) => o.id === F.ore))) F.ore = forgeBestOre(F.bp, src);
  // (riftglass can't raise what's made in the densest ore)
  const ore0 = !tool && T.ores[ORE_INDEX[F.ore]], topOre = ore0 && ore0.tier >= T.ores.length;
  const exotics = bp.kind === 'caster' || bp.kind === 'armor' || bp.kind === 'charm' || bp.kind === 'pick' ? T.exotics.filter((x) => (src[x.id] || 0) > 0 && exoticForgeWord(F.bp, x, ore0 ? ore0.tier : 1) && !(x.tierUp && topOre)) : [];
  if (F.exotic && !exotics.some((x) => x.id === F.exotic)) F.exotic = null;
  // (a core's pattern: one the suit has read that fits its kind)
  if (bp.kind !== 'stone' || (F.pattern && !patternFits(F.pattern, bp.stoneKind))) F.pattern = null;
  const ore = tool ? null : ore0, cost = forgeCost(F.bp, F.ore, F.pattern), short = recipeShort(cost, src), lock = recipeLock(F.bp);
  const ready = !short.length && !lock;

  // what's close, then the tabs and the recipes in this one
  const close = F.field || F.bay ? [] : forgeCloseTo(src).filter((c) => BLUEPRINTS[c.id].cat !== 'wick');
  const closeRows = close.map((c) => `<button class="row close-row" data-act="forgeGo" data-arg="${c.id}${c.ore ? ':' + c.ore : ''}"><img class="icon" src="${recipeIconUrl(c.id, c.ore ? T.ores[ORE_INDEX[c.ore]].tier : 1)}" alt=""><span class="row-text"><span class="row-name">${esc(c.ore && BLUEPRINTS[c.id].kind !== 'stone' ? `${stuffName(c.ore)} ${recipeName(c.id)}` : recipeName(c.id))}${c.ore && BLUEPRINTS[c.id].kind === 'stone' ? ` · tier ${T.ores[ORE_INDEX[c.ore]].tier}` : ''}</span><span class="row-sub short">${esc(shortWords(c.short))} short</span></span></button>`).join('');
  const cats = forgeCats().filter(([, c]) => c !== 'wick' && !(F.field && (c === 'tool' || c === 'structure')));
  const tabs = F.bay ? wickBayHtml() + '<h3>UPGRADES</h3>' : `<div class="chips forge-tabs">${cats.map(([label, c]) => `<button class="chip ${!F.codex && cat === c ? 'on' : ''}" data-act="forgeTab" data-arg="${c}">${label}</button>`).join('')}${F.field || !forgeTabOpen('codex') ? '' : `<button class="chip" data-act="forgeTab" data-arg="codex">CODEX</button>`}</div>`;
  const inTab = known.filter((id) => BLUEPRINTS[id].cat === cat);
  const canMake = (id) => !recipeLock(id) && (recipeOnce(BLUEPRINTS[id]) ? !recipeShort(recipeCost(id), src).length : forgeOres(src).some((o) => !recipeShort(recipeCost(id, o.id), src).length));
  const tiles = inTab.map((id) => `<button class="bp ${id === F.bp ? 'on' : ''}${recipeLock(id) ? ' locked' : ''}" data-act="forgeBp" data-arg="${id}"><img class="icon" src="${recipeIconUrl(id, ore ? ore.tier : 1)}" alt=""><span>${esc(BLUEPRINTS[id].tool ? TOOLS[BLUEPRINTS[id].tool].name.split(' ').pop() : BLUEPRINTS[id].structure ? STRUCTURES[BLUEPRINTS[id].structure].short : BLUEPRINTS[id].kind === 'caster' && ore ? `${ore.name} Rig` : BLUEPRINTS[id].name)}</span>${BLUEPRINTS[id].structure && structureBuilt(BLUEPRINTS[id].structure) || BLUEPRINTS[id].wick && wickFitted(BLUEPRINTS[id].wick) ? '<i class="made" aria-label="Made">✓</i>' : ''}${canMake(id) ? '<i class="can" aria-label="Can be made"></i>' : ''}</button>`).join('');
  const list = `${tabs}<div class="bp-grid">${tiles}</div>`;

  // the recipe: what to make it in, and exactly what comes out
  const chip = (act, id, label, on, ok = true) => `<button class="chip ${on ? 'on' : ''}" data-act="${act}" data-arg="${id}" ${ok ? '' : 'disabled'}>${label}</button>`;
  const stuffIcon = (id) => `<img class="chip-icon" src="${stuffIconUrl(id)}" alt="">`;
  let h = '';
  if (!tool) {
    const ores = forgeOres(src);
    const oreChips = ores.map((o) => chip('forgeOre', o.id, `${stuffIcon(o.id)}${esc(o.name)}<small>T${o.tier} · ${src[o.id]}</small>`, o.id === F.ore)).join('')
      || `<span class="note">No ore${F.field ? ' carried' : ''}.</span>`;
    h += `<h3>ORE</h3><div class="chips ore-chips">${oreChips}</div>`;
    if (exotics.length) h += `<h3>EXOTIC</h3><div class="chips">${exotics.map((x) => chip('forgeExotic', x.id, `${stuffIcon(x.id)}${esc(x.name)}<small>${src[x.id]} · ${esc(exoticForgeWord(F.bp, x, ore.tier))}</small>`, x.id === F.exotic)).join('')}</div>`;
    // a core: the pattern to print on it, from what the suit has read of
    // the kinds whose pattern fits (patterns.js)
    if (bp.kind === 'stone') {
      const fits = patternsFor(bp.stoneKind);
      const pchips = [chip('forgePattern', '', 'NONE<small>plain</small>', !F.pattern)].concat(fits.map((k) => { const pc = patternCost(k), have = partsHave(src, pc.kind); return chip('forgePattern', k, `${stuffIcon(partId(pc.kind, 1))}${esc(PATTERNS[k].name)}<small>${esc(foeWord(k))} · ${pc.n} ${esc(PARTS[pc.kind].name)} · have ${have}</small>`, F.pattern === k); }));
      const reading = scannedKinds().filter((k) => !patternKnown(k) && patternFits(k, bp.stoneKind)).slice(0, 3).map((k) => `${foeWord(k)} ${Math.floor(scanCount(k))}/${T.patterns.scans}`);
      h += `<h3>PATTERN</h3><div class="chips">${pchips.join('')}</div>${fits.length ? '' : `<p class="note">The suit has read no pattern that fits a ${esc(STONE_KIND_NAMES[bp.stoneKind])} yet${reading.length ? `: ${esc(reading.join(', '))}` : ''}.</p>`}`;
    }
  }
  // exactly what comes out
  const ex = F.exotic && T.exotics.find((x) => x.id === F.exotic), lines = [];
  let title = recipeName(F.bp);
  if (bp.kind === 'structure') {
    lines.push(esc(STRUCTURES[bp.structure].text()));
  } else if (bp.kind === 'wick') {
    lines.push(esc(WICK_UPS[bp.wick].text()));
  } else if (tool) {
    lines.push(esc(TOOLS[bp.tool].text));
  } else if (bp.kind === 'stone') {
    title = `${bp.name} core`;
    lines.push(`<b>T${ore.tier}</b> · ${esc(stoneLine(bp.stone))}`, esc(stoneTierLine(bp.stone, ore.tier)));
    if (F.pattern) lines.push(`<b>${esc(PATTERNS[F.pattern].name)}</b> · ${esc(fmtAffix(patternBonus(F.pattern, ore.tier)))}, printed on it. A masterwork prints it ×${T.patterns.master}.`);
    else lines.push('Plain. A fine forge makes it a tier denser. Three of a kind fold into one a tier denser at the bench.');
  } else {
    const tier = Math.min(T.ores.length, ore.tier + (ex && ex.tierUp ? 1 : 0)), it = recipePreview(F.bp, tier, 0, !!(ex && ex.modSlot));
    title = `${oreOfTier(tier).name} ${bp.name}`;
    const b = it.base, nums = bp.kind === 'caster' ? [`${b.power} power`, it.extra ? `a second ${STONE_KIND_NAMES[it.extra]} slot a spell` : 'Form, Element and Mod a spell'] : bp.kind === 'armor' ? [`${b.armor} armor`, `+${b.hp} health`] : bp.kind === 'pick' ? [itemBaseLine(it)] : [];
    lines.push(`<b>T${tier}</b> · ${nums.map(esc).join(' · ')}`);
    if (bp.kind === 'caster' && rigOreLine(it)) lines.push(esc(rigOreLine(it)));
    if (bp.text) lines.push(esc(bp.text));
  }
  // (made already: what it cost is past, and the button says so)
  const made = (bp.structure && structureBuilt(bp.structure)) || (bp.wick && wickFitted(bp.wick)) || (bp.tool && toolOwned(bp.tool));
  if (lock && !made) lines.push(`<span class="short">${esc(lock)}.</span>`);
  // what it costs, every resource by name
  const tags = [];
  if (cost.ore) tags.push(costTag(cost.ore.id, cost.ore.n, src[cost.ore.id] || 0));
  for (const p of cost.parts) { const have = partsHave(src, p.kind); tags.push(costTag(p.kind === 'any' ? partId('chitin', 1) : partId(p.kind, 1), p.n, have, p.kind === 'any' ? `creature part${p.n === 1 ? '' : 's'}, any kind` : `${PARTS[p.kind].name} (any grade)`)); }
  for (const x of cost.stuff) tags.push(costTag(x.id, x.n, src[x.id] || 0));
  if (cost.exotic) tags.push(costTag(cost.exotic, 1, src[cost.exotic] || 0));
  if (ex) tags.push(costTag(ex.id, 1, src[ex.id] || 0));
  const goWord = lock ? lock.toUpperCase() : short.length ? 'NOT ENOUGH' : '';
  const goLabel = bp.kind === 'structure' ? 'BUILD' : bp.kind === 'wick' ? 'FIT' : tool ? 'MAKE' : 'FORGE';
  // what the suit has read so far, in the CORES tab
  const scanRows = bp.kind === 'stone' && !F.field ? scannedKinds().map((k) => { const n = Math.min(T.patterns.scans, scanCount(k)), known = patternKnown(k), pc = patternCost(k); return `<div class="row static scan-row"><img class="icon" src="${stuffIconUrl(partId(pc.kind, 1))}" alt=""><span class="row-text"><span class="row-name">${esc(foeWord(k))}${known ? ` · <b class="printed">${esc(PATTERNS[k].name)}</b>` : ''}</span><span class="row-sub">${known ? `${esc(fmtAffix(patternBonus(k, 1)))} at tier 1 · fits a ${esc(STONE_KIND_NAMES[stoneKindOfBonus(PATTERNS[k].bonus)])} · ${pc.n} ${esc(PARTS[pc.kind].name)}` : `read ${Math.floor(n)} of ${T.patterns.scans}`}</span></span>${known ? '' : `<span class="scan-ring"><span style="width:${Math.round((n / T.patterns.scans) * 100)}%"></span></span>`}</div>`; }).join('') : '';
  $('forge-body').innerHTML = `
    ${closeRows ? `<h3>CLOSE TO MAKING</h3>${closeRows}` : ''}
    ${list}
    <div class="recipe-panel">
      <div class="card-head"><img class="icon big" src="${recipeIconUrl(F.bp, ore ? ore.tier : 1)}" alt=""><div class="grow"><div class="card-name">${esc(title)}</div><div class="row-sub">${esc(bp.kind === 'structure' ? 'Building' : bp.kind === 'wick' ? 'Wick upgrade' : tool ? 'Tool' : bp.kind === 'stone' ? `${STONE_KIND_NAMES[bp.stoneKind]} core` : KIND_NAMES[bp.kind])}</div></div></div>
      ${h}
      <div class="preview">${lines.map((l) => `<p>${l}</p>`).join('')}</div>
      ${made ? '' : `<h3>COSTS</h3><div class="cost-list">${tags.join('')}</div>`}
      ${F.field ? '<p class="note">It goes in your cargo.</p>' : ''}
      <div class="menu forge-go"><button class="btn primary" data-act="craft" ${ready ? '' : 'disabled'}>${goLabel}${goWord ? `<small>${esc(goWord)}</small>` : ''}</button></div>
    </div>
    ${scanRows ? `<h3>WHAT THE SUIT HAS READ</h3>${scanRows}` : bp.kind === 'stone' && !F.field ? '<p class="note">The suit reads each kind of creature as it falls; six, and the forge can print its pattern.</p>' : ''}`;
  const on = document.querySelector('#forge-body .bp.on');
  if (on && on.scrollIntoView && UI.forge.scroll) { UI.forge.scroll = false; on.scrollIntoView({ block: 'nearest' }); }
  // (a recipe chosen: its panel, costs and FORGE button brought into view)
  const panel = document.querySelector('#forge-body .recipe-panel');
  if (panel && panel.scrollIntoView && UI.forge.showPanel) { UI.forge.showPanel = false; panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
}

// The Codex: every resonance, its parts shown so far (resonance traces show
// them; building one shows it whole) and, whole, what it does.
function drawCodex() {
  // (the same tabs as the recipes' view: Wick's belong to the Drone Bay)
  const tabs = `<div class="chips forge-tabs">${forgeCats().filter(([, c]) => c !== 'wick').map(([label, c]) => `<button class="chip" data-act="forgeTab" data-arg="${c}">${label}</button>`).join('')}<button class="chip on" data-act="forgeTab" data-arg="codex">CODEX</button></div>`;
  // (what resonances are, and how they wake, is behind the ?)
  const whole = RESONANCES.filter(codexWhole).length;
  const cards = RESONANCES.map((r) => {
    const shown = codexShown(r), all = codexWhole(r);
    const parts = r.parts.map((id, i) => (shown.includes(i) ? stoneTile({ stone: id, tier: 1 }, { mini: true }) : '<span class="tile mini t-unknown" aria-label="Not yet known"><b>?</b></span>')).join('');
    return `<div class="rcard${all ? ' whole' : ''}"><div class="rc-head"><b>${esc(r.name.toUpperCase())}</b><span>${r.parts.length} CORES</span></div><div class="mini-circuit">${parts}</div>
      <p class="note">${all ? esc(capFirst(r.text)) + '.' : `${shown.length}/${r.parts.length} known`}</p></div>`;
  }).join('');
  $('forge-body').innerHTML = `${tabs}
    <h3>RESONANCES <span class="dim">· ${whole}/${RESONANCES.length}</span></h3>
    <div class="codex">${cards}</div>`;
}

// ---------------------------------------------------------------------------
// Research: the forge studies what's new, and shows what it can make now
// ---------------------------------------------------------------------------
// Opening the forge at home: anything new is studied first, and if it
// revealed a recipe, the reveal shows before the forge.
function openForge(field, bay) {
  UI.forge.field = !!field; UI.forge.bay = !!bay;
  const finds = field || bay ? [] : researchStudy();
  if (finds.length) { Save.save(); UI.research = finds; UI.show('screen-research'); snd('blueprint'); Story.say('research'); return; }
  UI.forge.scroll = true;
  UI.show('screen-forge');
  snd('forgeOpen');
}
function drawResearch() {
  const finds = UI.research || [], step = Math.min(0.35, 2 / Math.max(1, finds.length));
  $('research-body').innerHTML = finds.map((f, i) => `
    <div class="find" style="--d:${i * step}s"><div class="find-what"><img class="icon" src="${researchIconUrl(f.r)}" alt=""><span>${esc(researchWhat(f.r))}</span></div>
    <div class="find-arrow">→</div>
    <div class="find-opens">${f.opened.map((id, j) => `<span class="find-recipe" style="--d:${i * step + 0.25 + j * 0.15}s"><img class="icon" src="${recipeIconUrl(id)}" alt=""><b>${esc(recipeName(id))}</b></span>`).join('')}</div></div>`).join('')
    + `<div class="menu"><button class="btn primary" data-act="researchDone">${finds.reduce((n, f) => n + f.opened.length, 0)} NEW · TO THE FORGE</button></div>`;
}

// ---------------------------------------------------------------------------
// The locker
// ---------------------------------------------------------------------------
function drawGear() {
  const s = Save.data, st = computeStats(s.equip, s.attune);
  const slots = SLOTS.map((k) => {
    const it = s.equip[k];
    return it ? itemRow(it, 'cardEquip', k, `<span class="slot">${SLOT_NAMES[k]}</span>`)
      : `<div class="row empty"><span class="row-text"><span class="row-name">${SLOT_NAMES[k]}</span><span class="row-sub">Empty</span></span></div>`;
  }).join('');
  const kinds = ['caster', 'armor', 'charm', 'pick'], relics = s.items.filter((it) => it.kind === 'relic');
  const bases = s.items.filter((it) => kinds.includes(it.kind)).sort((a, b) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind) || b.tier - a.tier)
    .map((it) => itemRow(it, 'cardStash', it.uid, compareTag(it, s.equip))).join('');
  // the spare cores, by kind, the best first, the same ones stacked
  const cores = s.items.filter((it) => it.kind === 'stone').sort((a, b) => ['form', 'element', 'glyph'].indexOf(stoneKind(a.stone)) - ['form', 'element', 'glyph'].indexOf(stoneKind(b.stone)) || STONE_ORDER.indexOf(a.stone) - STONE_ORDER.indexOf(b.stone) || coreWorth(b) - coreWorth(a));
  const coreList = ['form', 'element', 'glyph'].map((k) => { const list = coreGroups(cores.filter((c) => stoneKind(c.stone) === k)); return list.length ? `<div class="gl">${STONE_KIND_NAMES[k].toUpperCase()}S</div>${list.map((g) => coreRow(g.c, 'cardStash', g.c.uid, '', '', g.n)).join('')}` : ''; }).join('');
  const down = downgrades();
  $('gear-title').textContent = 'THE LOCKER';
  $('gear-body').innerHTML = `
    <div class="stats">${statLine(st)}</div>
    <h3>WORN</h3>${slots}
    ${relics.length ? `<h3>SEALED RELICS · ${relics.length}</h3>${relics.map((it) => itemRow(it, 'cardStash', it.uid)).join('')}` : ''}
    <h3>FRAMES AND BASES · ${s.items.filter((it) => kinds.includes(it.kind)).length}</h3>${bases || '<p class="note">None spare.</p>'}
    ${onboardHas('spells') || cores.length ? `<h3>SPARE CORES · ${cores.length}</h3>${coreList || '<p class="note">None spare. Set them in the rig: tap it above.</p>'}` : ''}
    ${down.length ? `<div class="menu"><button class="btn danger" data-act="salvageAll">${UI.salvageAllArmed ? `TAP AGAIN: SALVAGE ${down.length}` : `SALVAGE ALL ▼ (${down.length})`}</button></div>` : ''}
    <h3>MATERIALS</h3>${stuffChips(s.stash) || '<p class="note">None.</p>'}`;
}
// Materials as icons and counts, each named.
function stuffChips(stash) {
  const ids = stuffIds().filter((id) => stash[id]);
  return ids.length ? `<div class="mats">${ids.map((id) => `<span class="mat"><img class="cost-icon" src="${stuffIconUrl(id)}" alt="">${stash[id]} ${esc(stuffName(id))}</span>`).join('')}</div>` : '';
}
function statLine(st) {
  const bits = [`${st.maxHp} health`, `${st.armor} armor`];
  if (st.closeDmg) bits.push(`+${Math.round(st.closeDmg)}% close`);
  if (st.spellDmg) bits.push(`+${Math.round(st.spellDmg)}% spells`);
  if (st.crit) bits.push(`${Math.round(st.crit)}% crit`);
  if (st.castSpeed) bits.push(`+${Math.round(st.castSpeed)}% cast speed`);
  if (st.leech) bits.push(`${Math.round(st.leech * 10) / 10}% leech`);
  if (st.moveSpeed) bits.push(`${st.moveSpeed > 0 ? '+' : ''}${Math.round(st.moveSpeed)}% speed`);
  if (st.mineSpeed) bits.push(`+${Math.round(st.mineSpeed)}% mining`);
  for (const k in st.powers) bits.push(`★ ${LEGENDARIES[k].name}`);
  return bits.join(' · ');
}

// Bases in the stash worse than what they'd replace, and plain spare cores
// a better one of the same kind is set over, not kept.
function downgrades() {
  const s = Save.data, set = rigCores(s.equip.main);
  const bases = s.items.filter((it) => !it.fav && KIND_SLOT[it.kind] && /down/.test(compareTag(it, s.equip)));
  const cores = s.items.filter((it) => it.kind === 'stone' && !it.fav && !it.power && set.some((c) => c.stone === it.stone && coreWorth(c) >= coreWorth(it) * 1.05));
  return bases.concat(cores);
}

// ---------------------------------------------------------------------------
// The tuning bench: every core, set in the rig first; in the stash the same
// ones stacked, three of a kind to merge
// ---------------------------------------------------------------------------
function drawBench() {
  const s = Save.data, rows = [], rig = s.equip.main;
  if (isCaster(rig)) rig.spells.forEach((sp, i) => { for (const [k, c] of spellParts(sp)) if (c) rows.push(coreRow(c, 'benchCore', c.uid, '', `In spell ${i ? 'B' : 'A'} · ${itemKindLine(c)}`)); });
  const stash = s.items.filter((x) => x.kind === 'stone').sort((a, b) => ['form', 'element', 'glyph'].indexOf(stoneKind(a.stone)) - ['form', 'element', 'glyph'].indexOf(stoneKind(b.stone)) || coreWorth(b) - coreWorth(a));
  const groups = coreGroups(stash), merges = groups.filter(coreMergeable);
  $('bench-body').innerHTML = `
    <p class="have-line">${esc(stuffLines(Object.fromEntries(T.ores.filter((o) => s.stash[o.id]).map((o) => [o.id, s.stash[o.id]]))) || 'no ore')}</p>
    ${merges.length ? `<h3>THREE OF A KIND · ${merges.length}</h3>${merges.map((g) => `<div class="row static merge-row"><img class="icon" src="${stoneIconUrl(g.c.stone)}" alt=""><span class="row-text"><span class="row-name">${esc(g.c.name)} <small class="count">×${g.n}</small></span><span class="row-sub">${Math.floor(g.n / T.cores.merge)} × ${T.cores.merge} fold into one tier ${g.c.tier + 1}</span></span><button class="mini" data-act="coreMerge" data-arg="${esc(g.key)}">MERGE</button></div>`).join('')}` : ''}
    <h3>SET IN THE RIG · ${rows.length}</h3>${rows.join('') || '<p class="note">Nothing set.</p>'}
    <h3>IN THE STASH · ${stash.length}</h3>${groups.map((g) => coreRow(g.c, 'benchCore', g.c.uid, '', '', g.n)).join('') || '<p class="note">None.</p>'}`;
}

// ---------------------------------------------------------------------------
// The cards
// ---------------------------------------------------------------------------
// where: 'stash' | 'equip' (at home) | 'cargo' | 'worn' (mid-dive) |
// 'rig' (a core set in a rig's part: c.host, c.part); key: the uid or
// slot. c.bench: opened at the tuning bench.
function drawCard() {
  const c = UI.card;
  if (c.stuff) { drawStuffCard(c.stuff); return; }
  if (c.item.kind === 'stone') drawCoreCard(c); else drawBaseCard(c);
}

function cardWhere(c) {
  if (c.where === 'stash') return 'IN THE STASH';
  if (c.where === 'cargo') return 'IN YOUR CARGO';
  if (c.where === 'rig') return c.host ? `IN ${c.host.name.toUpperCase()}` : 'IN THE RIG';
  return `WORN · ${SLOT_NAMES[c.key].toUpperCase()}`;
}

// A base (or a relic): its numbers, a rig's spells, against what's worn,
// and what can be done with it.
function drawBaseCard(c) {
  const it = c.item, home = c.where === 'stash' || c.where === 'equip', s = Save.data;
  if (!c.focus) c.focus = 'spells';
  let extra = '';
  const acts = [];
  const sy = it.kind !== 'relic' && salvageYield(new Rng(1), it);
  const salvageBtn = sy ? `<button class="btn danger wide" data-act="salvage" data-confirm="SURE? +${sy.n} ${esc(stuffName(sy.ore).toUpperCase())}">SALVAGE · +${sy.n} ${esc(stuffName(sy.ore).toUpperCase())}</button>` : '';
  const slotOf = KIND_SLOT[it.kind];
  if (c.where === 'stash') {
    if (it.kind === 'relic') acts.push('<button class="btn primary wide" data-act="unseal">UNSEAL</button>');
    else if (slotOf) acts.push(`<button class="btn primary" data-act="equip" data-arg="${slotOf}">EQUIP</button>`);
    if (it.kind !== 'relic' && !it.fav) acts.push(salvageBtn);
  } else if (c.where === 'equip') acts.push('<button class="btn" data-act="unequip">UNEQUIP</button>');
  else if (c.where === 'cargo') {
    if (slotOf) acts.push(`<button class="btn primary" data-act="equip" data-arg="${slotOf}">EQUIP</button>`);
    acts.push('<button class="btn danger" data-act="drop" data-confirm="SURE? DROP IT">DROP</button>');
  }
  const cmp = (c.where === 'stash' || c.where === 'cargo') ? compareTag(it, s.equip) : '';
  const slot = (c.where === 'stash' || c.where === 'cargo') && compareSlot(s.equip, it);
  if (slot) {
    const cur = s.equip[slot], lines = compareLines(it, cur);
    extra += `<div class="compare"><div class="row-sub">${cur ? `AGAINST ${esc(cur.name.toUpperCase())}` : `NO ${SLOT_NAMES[slot].toUpperCase()} WORN`}</div>${lines.map((l) => `<div class="${l.up ? 'up' : 'down'}">${l.up ? '▲' : '▼'} ${esc(l.text)}</div>`).join('') || '<div class="dim">No change</div>'}${cur && isCaster(cur) && rigCores(cur).length ? '<div class="dim">Its cores move across.</div>' : ''}</div>`;
  }
  const canFav = it.kind !== 'relic' && home;
  const favBtn = canFav ? `<button class="mini fav ${it.fav ? 'on' : ''}" data-act="fav" title="Keep: never salvaged">${it.fav ? '★ KEPT' : '☆ KEEP'}</button>` : '';
  $('card-body').innerHTML = cardBar(cardWhere(c), favBtn) + `<div class="card-scroll">
    <div class="card-head">${iconImg(it, 'icon big')}<div class="grow"><div class="card-name ${it.q ? 'q-' + it.q : ''}">${esc(it.name)} ${cmp}</div><div class="row-sub">${esc(itemKindLine(it))}</div></div></div>
    <p class="base">${esc(itemBaseLine(it))}</p>
    ${isCaster(it) ? `<h3>SPELLS</h3>${spellPanel(it, home && c.focus === 'spells' && onboardHas('spells'), c)}` : ''}
    ${itemNotes(it).map((n) => `<p class="note">${esc(n)}</p>`).join('')}
    ${extra}
    ${acts.length ? `<div class="menu card-menu">${acts.join('')}</div>` : ''}</div>`;
}

// A core: what it does, its tier, its pattern and power, where it came
// from; at home, MERGE (three of a kind in the stash fold into one a tier
// denser) and SALVAGE (its ore), and, set in the rig, TAKE OUT.
function drawCoreCard(c) {
  const st = c.item, s = Save.data, home = c.where === 'stash' || (c.where === 'rig' && (!c.back || c.back.where === 'equip' || c.back.where === 'stash'));
  const traits = st.bonus ? `<li><span class="aff">${st.pattern && PATTERNS[st.pattern] ? `<b class="printed">${esc(PATTERNS[st.pattern].name)}</b> · ` : ''}${esc(fmtAffix(st.bonus))}</span></li>` : '';
  let extra = `<p class="base">${esc(stoneLine(st.stone))}</p><p class="note">${esc(stoneTierLine(st.stone, st.tier))}</p>`;
  if (st.power) extra += `<p class="power">★ ${esc(LEGENDARIES[st.power].text)}</p>`;
  if (st.pattern && PATTERNS[st.pattern]) extra += `<p class="note">The ${esc(foeWord(st.pattern))}'s pattern, printed${st.printQ >= 3 ? ' by a masterwork' : ''}. It stays.</p>`;
  else if (!st.power) extra += '<p class="note">Plain: no pattern. A pattern is printed as a core is forged, from what the suit has read.</p>';
  const group = c.where === 'stash' ? coreGroups(s.items.filter((x) => x.kind === 'stone')).find((g) => g.uids.includes(st.uid)) : null;
  if (group && group.n > 1) extra += `<p class="note">×${group.n} the same in the stash.</p>`;
  const acts = [], sv = coreSalvageOre(st);
  const salvageBtn = `<button class="btn danger wide" data-act="salvage" data-confirm="SURE? +${sv.n} ${esc(stuffName(sv.id).toUpperCase())}">SALVAGE · +${sv.n} ${esc(stuffName(sv.id).toUpperCase())}</button>`;
  if (group && home) acts.push(`<button class="btn wide tune-btn" data-act="coreMerge" data-arg="${esc(group.key)}" ${coreMergeable(group) ? '' : 'disabled'}><span>MERGE · TIER ${st.tier + 1}</span><small>${st.power || st.pattern ? 'Only plain cores fold' : st.tier >= T.ores.length ? 'As dense as it grows' : `${T.cores.merge} of a kind fold into one; have ${group.n}`}</small></button>`);
  if (c.where === 'stash' && home && !st.fav) acts.push(salvageBtn);
  else if (c.where === 'rig' && home) acts.push('<button class="btn" data-act="coreOut">TAKE OUT</button>');
  else if (c.where === 'cargo') acts.push('<button class="btn danger" data-act="drop" data-confirm="SURE? DROP IT">DROP</button>');
  const favBtn = home ? `<button class="mini fav ${st.fav ? 'on' : ''}" data-act="fav" title="Keep: never salvaged">${st.fav ? '★ KEPT' : '☆ KEEP'}</button>` : '';
  $('card-body').innerHTML = cardBar(c.bench ? 'THE TUNING BENCH' : cardWhere(c), favBtn) + `<div class="card-scroll">
    <div class="card-head"><img class="icon big" src="${stoneIconUrl(st.stone)}" alt=""><div class="grow"><div class="card-name ${st.power ? 'r-legendary' : st.pattern ? 'printed' : 'r-common'}">${esc(st.name)}</div><div class="row-sub">${esc(itemKindLine(st))}</div></div></div>
    ${coreSource(st) ? `<p class="src">${esc(coreSource(st))}</p>` : ''}
    ${traits ? `<ul class="affixes">${traits}</ul>` : ''}
    ${extra}
    ${acts.length ? `<div class="menu card-menu">${acts.join('')}</div>` : ''}</div>`;
}

// ---------------------------------------------------------------------------
// What the buttons do
// ---------------------------------------------------------------------------
Object.assign(UI.acts, {
  forgeOre: (id) => { UI.forge.ore = id; UI.redraw(); },
  forgeExotic: (id) => { UI.forge.exotic = UI.forge.exotic === id ? null : id; UI.redraw(); },
  forgePattern: (id) => { UI.forge.pattern = id && patternKnown(id) ? id : null; UI.redraw(); },
  forgeBp: (id) => { UI.forge.bp = id; UI.forge.codex = false; UI.forge.showPanel = true; UI.redraw(); },
  // a close-to-making row: that recipe, in that ore
  forgeGo: (arg) => { const [id, ore] = arg.split(':'); Object.assign(UI.forge, { bp: id, ore: ore || UI.forge.ore, codex: false }); UI.redraw(); },
  forgeTab: (tab) => {
    if (tab === 'codex') { UI.forge.codex = true; UI.redraw(); return; }
    const id = Save.data.blueprints.find((b) => BLUEPRINTS[b] && BLUEPRINTS[b].cat === tab);
    UI.forge.codex = false;
    if (id) UI.forge.bp = id;
    UI.redraw();
  },
  researchDone: () => { UI.research = null; UI.forge.scroll = true; UI.show('screen-forge'); },
  craft: () => {
    const F = UI.forge, src = forgeSource(), bp = BLUEPRINTS[F.bp];
    if (recipeLock(F.bp)) return;
    if (bp.kind === 'structure') {
      if (!buildStructure(bp.structure)) return;
      snd('reveal', { rarity: 'legendary' });
      UI.toast(`Built: the ${STRUCTURE_NAMES[bp.structure]}. It's coming down`, 'legendary');
      UI.redraw();
      return;
    }
    if (bp.kind === 'wick') {
      if (!fitWick(bp.wick)) return;
      snd('set', {});
      UI.toast(`Fitted: Wick's ${WICK_UP_NAMES[bp.wick]}. It's on`, 'legendary');
      UI.redraw();
      return;
    }
    if (bp.kind === 'tool') {
      if (!makeTool(bp.tool)) return;
      snd('reveal', { rarity: 'legendary' });
      UI.toast(`Made: ${TOOLS[bp.tool].name}`, 'legendary');
      UI.redraw();
      return;
    }
    const pattern = bp.kind === 'stone' && F.pattern && patternKnown(F.pattern) && patternFits(F.pattern, bp.stoneKind) ? F.pattern : null;
    const cost = forgeCost(F.bp, F.ore, pattern);
    if (!recipePay(cost, src)) return;
    let exotic = bp.exotic || null;
    if (!exotic && F.exotic && (src[F.exotic] || 0) > 0) { exotic = F.exotic; src[exotic] -= 1; if (!src[exotic]) delete src[exotic]; }
    F.exotic = null;
    if (!F.field) Save.save();
    snd('forgeFire');
    if (pattern) Story.say('print');
    Anvil.start({ bp: F.bp, ore: F.ore, exotic, field: !!F.field, pattern });
  },

  // the tuning bench: a core's card, to upgrade or salvage it
  benchCore: (uid) => { const f = findCore(uid); if (!f) return; UI.openCard(f.c, f.base ? 'rig' : 'stash', f.c.uid); UI.card.bench = true; if (f.base) { UI.card.host = f.base; UI.card.part = f.part; } drawCard(); },
  // three of a kind in the stash fold into one a tier denser (patterns.js)
  coreMerge: (key) => {
    const s = Save.data, g = coreGroups(s.items.filter((x) => x.kind === 'stone')).find((x) => x.key === key);
    if (!g || !coreMergeable(g)) return;
    const c = mergeCores(s.items, g);
    if (!c) return;
    snd('reveal', { rarity: 'rare' });
    UI.toast(`Three ${g.c.name}s folded: ${c.name}, tier ${c.tier}`, 'rare');
    Story.say('merge');
    if (UI.card && UI.card.item && UI.card.item.kind === 'stone' && !s.items.includes(UI.card.item)) { UI.closeCard(); UI.redraw(); return; }
    afterChange();
  },
  coreOut: () => {
    const c = UI.card, f = findCore(c.item.uid);
    if (!f || !f.base) return;
    const [i, k] = f.part.split(':');
    spellSet(f.base.spells[Number(i)], k, null); Save.data.items.push(f.c);
    if (c.back) { const b = c.back; UI.openCard(b.item, b.where, b.key); UI.card.focus = 'spells'; } else UI.closeCard();
    afterChange();
  },
  benchBack: () => UI.close(),

  equip: (slot) => {
    const c = UI.card, it = c.item, eq = Save.data.equip;
    const list = c.where === 'cargo' ? Game.dive.items : Save.data.items;
    removeFrom(list, it);
    const old = eq[slot];
    if (old) list.push(old);
    eq[slot] = it;
    // an empty frame takes the cores of the one it replaces
    if (isCaster(it) && isCaster(old) && !it.spells.some((sp) => spellCores(sp).length) && old.spells.some((sp) => spellCores(sp).length)) { moveSpells(old, it, list); UI.toast('The cores move across'); }
    UI.closeCard();
    afterChange();
  },
  unequip: () => {
    const c = UI.card;
    Save.data.items.push(Save.data.equip[c.key]);
    Save.data.equip[c.key] = null;
    UI.closeCard();
    afterChange();
  },
  drop: () => {
    const d = Game.dive, it = UI.card.item;
    removeFrom(d.items, it);
    d.drops.push({ x: d.p.x, y: d.p.y, t: 1, item: it, left: true });
    UI.closeCard();
    UI.redraw();
  },
  // at home into the stash; mid-dive into the cargo. A base gives back ore
  // and its cores; a spare core its ore.
  salvage: () => {
    const c = UI.card, it = c.item, field = c.where === 'cargo';
    const s = field ? Game.dive.cargo : Save.data.stash, list = field ? Game.dive.items : Save.data.items;
    const got = salvageInto(it, list, s, field);
    removeFrom(list, it);
    UI.toast('Salvaged: ' + stuffLines(got));
    UI.closeCard();
    afterChange();
  },
  unseal: () => {
    const relic = UI.card.item, item = unsealRelic(Save.rng(), relic);
    removeFrom(Save.data.items, relic);
    Save.data.items.push(item);
    Save.save();
    UI.closeCard();
    snd('unseal');
    Reveal.show(item, 'stash', UI.screen);
  },
  // the spells, at home: a part chosen (tapped again, it's emptied), a core
  // set in it from the stash, or taken out
  partPick: (arg) => {
    const c = UI.card, it = c.item, [i, key] = arg.split(':'), sp = it.spells[Number(i)];
    if (c.focus === 'spells' && c.part === arg && spellGet(sp, key)) { Save.data.items.push(spellGet(sp, key)); spellSet(sp, key, null); afterChange(); return; }
    c.focus = 'spells'; c.part = arg; UI.redraw();
  },
  partPut: (uid) => {
    const c = UI.card, it = c.item;
    const st = Save.data.items.find((x) => x.kind === 'stone' && String(x.uid) === String(uid));
    if (!st || !isCaster(it) || !c.part) return;
    const [i, key] = c.part.split(':'), sp = it.spells[Number(i)];
    if (stoneKind(st.stone) !== spellPartKind(key)) return;
    removeFrom(Save.data.items, st);
    if (spellGet(sp, key)) Save.data.items.push(spellGet(sp, key));
    spellSet(sp, key, st);
    // on to the next empty part of this spell
    const next = spellParts(sp).find(([, x]) => !x);
    c.part = next ? `${i}:${next[0]}` : null;
    // a resonance woken: its page in the Codex fills in
    const res = spellResonance(sp);
    if (res && codexFill(res.id)) UI.toast(`Resonance: ${res.name}`, 'legendary');
    if (res) Story.say('resonance');
    afterChange();
  },
  partOut: () => {
    const c = UI.card, it = c.item;
    if (!c.part) return;
    const [i, key] = c.part.split(':'), sp = it.spells[Number(i)], st = spellGet(sp, key);
    if (!st) return;
    spellSet(sp, key, null); Save.data.items.push(st); afterChange();
  },
  // a core's card, from the stash or from a rig's part (back to the rig's card after)
  cardStone: (uid) => { const f = findCore(uid); if (!f) return; const back = UI.card && UI.card.item && isCaster(UI.card.item) ? { item: UI.card.item, where: UI.card.where, key: UI.card.key } : null; UI.openCard(f.c, f.base ? 'rig' : 'stash', f.c.uid); if (f.base) { UI.card.host = f.base; UI.card.part = f.part; } if (back) UI.card.back = back; drawCard(); },
  fav: () => { const it = UI.card.item; it.fav = !it.fav; afterChange(); },
  salvageAll: () => {
    if (!UI.salvageAllArmed) { UI.salvageAllArmed = true; UI.redraw(); setTimeout(() => { UI.salvageAllArmed = false; UI.redraw(); }, 3000); return; }
    UI.salvageAllArmed = false;
    const got = {};
    for (const it of downgrades()) {
      const g = salvageInto(it, Save.data.items, Save.data.stash, false);
      removeFrom(Save.data.items, it);
      for (const k in g) got[k] = (got[k] || 0) + g[k];
    }
    UI.toast('Salvaged for ' + stuffLines(got));
    afterChange();
  },
});

// Breaks a piece down into `stash`: a core into ore of its tier, a base
// into ore (and an exotic now and then), its cores out whole into `list`.
// Returns what it gave.
function salvageInto(it, list, stash, field) {
  const got = {}, add = (k, n) => { if (!n) return; stash[k] = (stash[k] || 0) + n; got[k] = (got[k] || 0) + n; };
  if (it.kind === 'stone') {
    const sv = coreSalvageOre(it);
    add(sv.id, sv.n);
    return got;
  }
  const y = salvageYield(Save.rng(), it);
  for (const sp of it.spells || []) list.push(...spellCores(sp));
  add(y.ore, y.n);
  if (y.exotic) add(y.exotic, 1);
  return got;
}
