'use strict';
// ---------------------------------------------------------------------------
// The gear screens: the forge (recipes by category, each with exactly what
// it makes and costs, what's close and what's missing; research's reveal
// when something new comes home), the locker (what's worn, the rig and its
// two spells, modules, frames and bases, cores, salvage), the tuning bench
// (every module, socketed or stashed, to upgrade or salvage), and the
// cards: a base's (a rig's spells and its sockets, with the drawer of cores
// or modules to set, free) and a module's (its traits, where it was caught,
// against what it would replace; at home, UPGRADE and SALVAGE). ui.js holds
// the screens' plumbing; these redraw through UI.redraw like the rest.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Bits
// ---------------------------------------------------------------------------
// A module as a tile in a socket, or an empty socket. opts: { act, arg,
// sel, mini }.
function modTile(m, opts = {}) {
  const tag = opts.act ? 'button' : 'span', attrs = opts.act ? ` data-act="${opts.act}" data-arg="${opts.arg}"` : '';
  const cls = `${opts.sel ? ' sel' : ''}${opts.mini ? ' mini' : ''}`;
  if (!m) return `<${tag} class="sock-tile s-empty${cls}"${attrs} aria-label="Empty socket">${opts.mini ? '' : '<b>◇</b><small>EMPTY</small>'}</${tag}>`;
  const col = ART.rarity[m.rarity] || '#ffffff';
  return `<${tag} class="sock-tile${cls}" style="--c:${col}"${attrs} aria-label="${esc(m.name)}">${opts.mini ? '' : `<img src="${moduleIconUrl(m)}" alt=""><small>T${m.tier}</small>`}</${tag}>`;
}
// A base's sockets as small gems, for a row.
function miniSockets(it) { return it.sockets && it.sockets.length ? `<span class="mini-sockets">${it.sockets.map((m) => modTile(m, { mini: true })).join('')}</span>` : ''; }
// ▲ or ▼ for a module against what it would replace.
function moduleTag(m, equip) {
  const ud = moduleUpDown(equip, m);
  return ud === 'up' ? '<span class="tag up">▲</span>' : ud === 'down' ? '<span class="tag down">▼</span>' : '';
}
// A module's row: its name in its rarity's colour, what it's for, and its
// traits in short.
function moduleRow(m, act, arg, tag = '', sub = '') {
  const traits = moduleTraits(m).map((t) => t.text).join(' · ');
  return `<button class="row mod-row" data-act="${act}" data-arg="${arg}"><img class="icon" src="${moduleIconUrl(m)}" alt=""><span class="row-text"><span class="row-name r-${m.rarity}">${m.fav ? '★ ' : ''}${esc(m.name)}</span><span class="row-sub">${esc(sub || itemKindLine(m))}</span><span class="row-traits">${esc(traits)}</span></span>${tag}</button>`;
}
// "need 3 more Lumenite and 2 threads"
function shortWords(short) {
  return short.map((x) => (x.part ? partWords(x.part, x.n) : `${x.n} ${x.id === 'thread' && x.n === 1 ? 'Thread' : stuffName(x.id)}`)).join(', ');
}
// Where a module is: in the stash, or in a worn base's socket (or one
// in the stash). { m, base, i, slot } or null.
function findModule(uid) {
  const s = Save.data, key = String(uid);
  const m = s.items.find((x) => x.kind === 'module' && String(x.uid) === key);
  if (m) return { m, base: null, i: -1, slot: null };
  for (const slot of SLOTS) { const b = s.equip[slot]; const i = b && b.sockets ? b.sockets.findIndex((x) => x && String(x.uid) === key) : -1; if (i >= 0) return { m: b.sockets[i], base: b, i, slot }; }
  for (const b of s.items) { const i = b.sockets ? b.sockets.findIndex((x) => x && String(x.uid) === key) : -1; if (i >= 0) return { m: b.sockets[i], base: b, i, slot: null }; }
  return null;
}
// Takes a module out of wherever it is (it's being used up).
function removeModule(uid) {
  const f = findModule(uid);
  if (!f) return null;
  if (f.base) f.base.sockets[f.i] = null; else removeFrom(Save.data.items, f.m);
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
  if (bp.kind === 'stone') return { kind: 'stone', stone: bp.stone, tier, rarity: 'magic', affixes: [] };
  if (recipeOnce(bp)) return null;
  const it = { kind: bp.kind, bp: bpId, tier, q, rarity: 'common', base: baseStats(bp.kind, tier, bp, q), affixes: [], sockets: new Array(socketCount(bp.kind, tier, q)).fill(null) };
  if (bp.kind === 'caster') { const n = rigModSlots(tier, q, shard); it.spells = [emptySpell(n), emptySpell(n)]; }
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
  if (toolOwned(bp.tool)) return 'Made: choose it at the portal';
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
  const ore = tool ? null : ore0, cost = recipeCost(F.bp, F.ore), short = recipeShort(cost, src), lock = recipeLock(F.bp);
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
    lines.push(`<b>T${ore.tier}</b> · ${esc(stoneLine(bp.stone))}`);
  } else {
    const tier = Math.min(T.ores.length, ore.tier + (ex && ex.tierUp ? 1 : 0)), it = recipePreview(F.bp, tier, 0, !!(ex && ex.modSlot));
    title = `${oreOfTier(tier).name} ${bp.name}`;
    const b = it.base, nums = bp.kind === 'caster' ? [`${b.power} power`, `${rigMods(it)} Mod slot${rigMods(it) === 1 ? '' : 's'}`] : bp.kind === 'armor' ? [`${b.armor} armor`, `+${b.hp} health`] : bp.kind === 'pick' ? [itemBaseLine(it)] : [];
    nums.push(`${it.sockets.length} socket${it.sockets.length === 1 ? '' : 's'}`);
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
    </div>`;
  const on = document.querySelector('#forge-body .bp.on');
  if (on && on.scrollIntoView && UI.forge.scroll) { UI.forge.scroll = false; on.scrollIntoView({ block: 'nearest' }); }
  // (a recipe chosen: its panel, costs and FORGE button brought into view)
  const panel = document.querySelector('#forge-body .recipe-panel');
  if (panel && panel.scrollIntoView && UI.forge.showPanel) { UI.forge.showPanel = false; panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
}

// The Codex: every resonance, its parts shown so far (resonance traces show
// them; building one shows it whole) and, whole, what it does.
function drawCodex() {
  const tabs = `<div class="chips forge-tabs">${forgeCats().map(([label, c]) => `<button class="chip" data-act="forgeTab" data-arg="${c}">${label}</button>`).join('')}<button class="chip on" data-act="forgeTab" data-arg="codex">CODEX</button></div>`;
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
  const mods = s.items.filter((it) => it.kind === 'module');
  const modList = MOD_FITS.map((f) => {
    const list = mods.filter((m) => m.fits === f).sort((a, b) => moduleWorth(b) - moduleWorth(a));
    return list.length ? `<div class="gl">FOR ${f === 'armor' ? 'ARMOR' : f === 'caster' ? 'THE RIG' : KIND_WORDS[f].toUpperCase() + 'S'}</div>${list.map((m) => moduleRow(m, 'cardStash', m.uid, moduleTag(m, s.equip))).join('')}` : '';
  }).join('');
  const kinds = ['caster', 'armor', 'charm', 'pick'], relics = s.items.filter((it) => it.kind === 'relic');
  const bases = s.items.filter((it) => kinds.includes(it.kind)).sort((a, b) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind) || b.tier - a.tier)
    .map((it) => itemRow(it, 'cardStash', it.uid, compareTag(it, s.equip))).join('');
  const stones = groupStones(s.items), down = downgrades();
  $('gear-title').textContent = 'THE LOCKER';
  $('gear-body').innerHTML = `
    <div class="stats">${statLine(st)}</div>
    <h3>WORN</h3>${slots}
    ${onboardHas('modules') || mods.length ? `<h3>MODULES · ${mods.length}</h3>${modList || '<p class="note">None spare.</p>'}` : ''}
    ${relics.length ? `<h3>SEALED RELICS · ${relics.length}</h3>${relics.map((it) => itemRow(it, 'cardStash', it.uid)).join('')}` : ''}
    <h3>FRAMES AND BASES · ${s.items.filter((it) => kinds.includes(it.kind)).length}</h3>${bases || '<p class="note">None spare.</p>'}
    ${onboardHas('spells') || stones.length ? `<h3>CORES · ${stones.reduce((n, x) => n + x.n, 0)}</h3>${stones.length ? `<div class="drawer-row">${stones.map((x) => stoneTile(x, { act: 'cardStone', arg: x.stone + ':' + x.tier, count: x.n })).join('')}</div>` : '<p class="note">None spare.</p>'}` : ''}
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

// Bases and modules in the stash worse than what they'd replace, not kept.
function downgrades() {
  const s = Save.data;
  return s.items.filter((it) => !it.fav && (KIND_SLOT[it.kind] || it.kind === 'module') && /down/.test(compareTag(it, s.equip)));
}

// ---------------------------------------------------------------------------
// The tuning bench: every module, socketed first, to upgrade or salvage
// ---------------------------------------------------------------------------
function drawBench() {
  const s = Save.data, rows = [];
  for (const slot of SLOTS) {
    const b = s.equip[slot];
    if (!b || !b.sockets) continue;
    for (const m of b.sockets) if (m) rows.push(moduleRow(m, 'benchMod', m.uid, '', `In your ${b.name} · tier ${m.tier}`));
  }
  const stash = s.items.filter((x) => x.kind === 'module').sort((a, b) => MOD_FITS.indexOf(a.fits) - MOD_FITS.indexOf(b.fits) || moduleWorth(b) - moduleWorth(a));
  $('bench-body').innerHTML = `
    <p class="have-line"><img class="cost-icon" src="${threadIconUrl()}" alt=""><b>${s.stash.thread || 0} Threads</b> · ${esc(stuffLines(Object.fromEntries(T.ores.filter((o) => s.stash[o.id]).map((o) => [o.id, s.stash[o.id]]))) || 'no ore')}</p>
    <h3>SOCKETED · ${rows.length}</h3>${rows.join('') || '<p class="note">Nothing socketed.</p>'}
    <h3>IN THE STASH · ${stash.length}</h3>${stash.map((m) => moduleRow(m, 'benchMod', m.uid, moduleTag(m, s.equip))).join('') || '<p class="note">None.</p>'}`;
}

// ---------------------------------------------------------------------------
// The cards
// ---------------------------------------------------------------------------
// where: 'stash' | 'equip' (at home) | 'cargo' | 'worn' (mid-dive) |
// 'socket' (a module in a base's socket: c.host, c.hostI); key: the uid or
// slot. c.bench: opened at the tuning bench.
function drawCard() {
  const c = UI.card;
  if (c.stuff) { drawStuffCard(c.stuff); return; }
  if (c.item.kind === 'module') drawModuleCard(c); else drawBaseCard(c);
}

function cardWhere(c) {
  if (c.where === 'stash') return 'IN THE STASH';
  if (c.where === 'cargo') return 'IN YOUR CARGO';
  if (c.where === 'socket') return c.host ? `IN ${c.host.name.toUpperCase()}` : 'SOCKETED';
  return `WORN · ${SLOT_NAMES[c.key].toUpperCase()}`;
}

// A base (or a core, or a relic): its numbers, a rig's spells and its
// sockets, against what's worn, and what can be done with it.
function drawBaseCard(c) {
  const it = c.item, home = c.where === 'stash' || c.where === 'equip', s = Save.data;
  if (!c.focus) c.focus = isCaster(it) ? 'spells' : 'modules';
  let extra = '';
  if (it.power) extra += `<p class="power">★ ${esc(LEGENDARIES[it.power].text)}</p>`;
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
    extra += `<div class="compare"><div class="row-sub">${cur ? `AGAINST ${esc(cur.name.toUpperCase())}` : `NO ${SLOT_NAMES[slot].toUpperCase()} WORN`}</div>${lines.map((l) => `<div class="${l.up ? 'up' : 'down'}">${l.up ? '▲' : '▼'} ${esc(l.text)}</div>`).join('') || '<div class="dim">No change</div>'}${cur && (baseModules(cur).length || (cur.spells && cur.spells.some((sp) => spellCores(sp).length))) ? `<div class="dim">Its ${isCaster(cur) ? 'cores and ' : ''}modules move across.</div>` : ''}</div>`;
  }
  const canFav = it.kind !== 'relic' && it.kind !== 'stone' && home;
  const favBtn = canFav ? `<button class="mini fav ${it.fav ? 'on' : ''}" data-act="fav" title="Keep: never salvaged">${it.fav ? '★ KEPT' : '☆ KEEP'}</button>` : '';
  // (sockets wake with the first module caught: onboard.js)
  const sockets = it.sockets && onboardHas('modules') ? socketPanel(it, home, c) : '';
  $('card-body').innerHTML = cardBar(cardWhere(c), favBtn) + `<div class="card-scroll">
    <div class="card-head">${iconImg(it, 'icon big')}<div class="grow"><div class="card-name ${it.q ? 'q-' + it.q : ''}">${esc(it.name)} ${cmp}</div><div class="row-sub">${esc(itemKindLine(it))}</div></div></div>
    <p class="base">${esc(itemBaseLine(it))}</p>
    ${isCaster(it) ? `<h3>SPELLS</h3>${spellPanel(it, home && c.focus === 'spells' && onboardHas('spells'), c)}` : ''}
    ${sockets}
    ${itemNotes(it).map((n) => `<p class="note">${esc(n)}</p>`).join('')}
    ${extra}
    ${acts.length ? `<div class="menu card-menu">${acts.join('')}</div>` : ''}</div>`;
}

// A base's module sockets on its card: the row of them and, at home, the
// drawer of modules that fit, each against what's in the chosen socket.
function socketPanel(it, home, c) {
  const n = it.sockets.length;
  if (!n) return '<h3>MODULES · NO SOCKETS</h3>';
  if (typeof c.sock !== 'number' || c.sock >= n) c.sock = Math.max(0, it.sockets.indexOf(null));
  const edit = home && c.focus === 'modules';
  const tiles = it.sockets.map((m, i) => modTile(m, home ? { act: 'sockPick', arg: i, sel: edit && c.sock === i } : m ? { act: 'cardSock', arg: i } : {})).join('');
  let h = `<h3>MODULES · ${baseModules(it).length}/${n} SOCKETS</h3><div class="sockets-row">${tiles}</div>`;
  const traits = baseModules(it).flatMap((m) => moduleTraits(m).map((t) => `<p class="${t.key === 'power' ? 'power' : t.key === 'set' ? 'set' : ''}">${esc(t.text)}</p>`));
  if (traits.length) h += `<div class="readout mods">${traits.join('')}</div>`;
  if (!home || !edit) return h;
  const sel = it.sockets[c.sock], have = Save.data.items.filter((x) => x.kind === 'module' && x.fits === it.kind).sort((a, b) => moduleWorth(b) - moduleWorth(a));
  const rows = have.map((m) => {
    const lines = compareLines(m, sel), a = moduleWorth(m), b = moduleWorth(sel);
    const tag = !sel || a > b * 1.05 ? '<span class="tag up">▲</span>' : a < b * 0.95 ? '<span class="tag down">▼</span>' : '';
    return `<button class="row mod-row" data-act="sockPut" data-arg="${m.uid}"><img class="icon" src="${moduleIconUrl(m)}" alt=""><span class="row-text"><span class="row-name r-${m.rarity}">${esc(m.name)} <small class="dim">T${m.tier}</small></span><span class="row-traits">${lines.map((l) => `<i class="${l.up ? 'up' : 'down'}">${l.up ? '▲' : '▼'} ${esc(l.text)}</i>`).join(' ') || 'No change'}</span></span>${tag}</button>`;
  }).join('');
  h += `<div class="drawer"><div class="drawer-head"><span>SOCKET ${c.sock + 1} · ${sel ? esc(sel.name.toUpperCase()) : 'EMPTY'}</span>${sel ? `<span><button class="mini" data-act="cardSock" data-arg="${c.sock}">LOOK</button><button class="mini" data-act="sockOut">TAKE OUT</button></span>` : ''}</div>
    ${rows || '<p class="note">None spare.</p>'}</div>`;
  return h;
}

// A module: its traits, where it was caught, against what it would
// replace; at home, UPGRADE (a tier up, for threads and the new tier's ore)
// and SALVAGE (threads), and socket it or take it out.
function drawModuleCard(c) {
  const m = c.item, s = Save.data, home = c.where === 'stash' || (c.where === 'socket' && (!c.back || c.back.where === 'equip' || c.back.where === 'stash')), src = s.stash;
  const rollBar = (a) => { const r = affixRoll(a, m.tier, T.modules.value); return `<span class="roll" title="How well it rolled"><span style="width:${Math.round(clamp(r, 0.04, 1) * 100)}%" class="${r > 1 ? 'over' : r > 0.8 ? 'high' : ''}"></span></span>`; };
  const traits = m.affixes.map((a) => `<li><span class="aff">${esc(fmtAffix(a))}${rollBar(a)}</span></li>`).join('');
  let extra = '';
  if (m.power) extra += `<p class="power">★ ${esc(LEGENDARIES[m.power].text)}</p>`;
  if (m.set) {
    const n = computeStats(s.equip, s.attune).sets[m.set] || 0, S = SETS[m.set];
    extra += `<p class="set">${esc(S.name)} (${n}/3 socketed)<br>2: ${esc(S.bonus2.text)}<br>3: ${esc(S.bonus3.text)}</p>`;
  }
  // against what it would replace
  if (c.where !== 'socket') {
    const t = moduleTarget(s.equip, m);
    if (!t) extra += `<div class="compare"><div class="row-sub">NOTHING WORN TAKES IT</div></div>`;
    else {
      const base = s.equip[t.slot], lines = compareLines(m, t.cur);
      extra += `<div class="compare"><div class="row-sub">${t.cur ? `AGAINST ${esc(t.cur.name.toUpperCase())}` : `AN EMPTY SOCKET IN YOUR ${esc(base.name.toUpperCase())}`}</div>${lines.map((l) => `<div class="${l.up ? 'up' : 'down'}">${l.up ? '▲' : '▼'} ${esc(l.text)}</div>`).join('') || '<div class="dim">No change</div>'}</div>`;
    }
  }
  const acts = [], st = salvageThreads(m);
  const salvageBtn = `<button class="btn danger wide" data-act="salvage" data-confirm="SURE? +${st} THREADS">SALVAGE · +${st} THREADS</button>`;
  if (home) {
    const up = upgradeCost(m), short = up ? benchShort(up, src) : [];
    acts.push(`<button class="btn wide tune-btn${short.length ? ' short' : ''}" data-act="modUpgrade" ${!up || short.length ? 'disabled' : ''}><span>${up ? `UPGRADE · TIER ${m.tier + 1}` : 'UPGRADE'}</span><small>${!up ? 'As dense as it grows' : short.length ? `need ${esc(shortWords(short))}` : benchCostWords(up)}</small></button>`);
  }
  if (c.where === 'stash' && home) {
    const t = moduleTarget(s.equip, m);
    if (t) acts.push(`<button class="btn primary wide" data-act="modSocket">SOCKET INTO ${esc(s.equip[t.slot].name.toUpperCase())}</button>`);
    if (!m.fav) acts.push(salvageBtn);
  } else if (c.where === 'socket' && home) acts.push('<button class="btn" data-act="modOut">TAKE OUT</button>');
  else if (c.where === 'cargo') {
    acts.push('<button class="btn danger" data-act="drop" data-confirm="SURE? DROP IT">DROP</button>');
  }
  const favBtn = home ? `<button class="mini fav ${m.fav ? 'on' : ''}" data-act="fav" title="Keep: never salvaged">${m.fav ? '★ KEPT' : '☆ KEEP'}</button>` : '';
  const ud = c.where === 'stash' || c.where === 'cargo' ? moduleTag(m, s.equip) : '';
  $('card-body').innerHTML = cardBar(c.bench ? 'THE TUNING BENCH' : cardWhere(c), favBtn) + `<div class="card-scroll">
    <div class="card-head"><img class="icon big" src="${moduleIconUrl(m)}" alt=""><div class="grow"><div class="card-name r-${m.rarity}">${esc(m.name)} ${ud}</div><div class="row-sub">${esc(itemKindLine(m))}</div></div></div>
    ${moduleSource(m) ? `<p class="src">${esc(moduleSource(m))}</p>` : ''}
    ${traits ? `<ul class="affixes">${traits}</ul>` : ''}
    ${extra}
    ${acts.length ? `<div class="menu card-menu">${acts.join('')}</div>` : ''}</div>`;
}
// "8 Threads + 10 Resonite", with the threads' icon.
function benchCostWords(cost) {
  const bits = [];
  if (cost.threads) bits.push(`${cost.threads} Threads`);
  if (cost.ore) bits.push(`${cost.ore.n} ${stuffName(cost.ore.id)}`);
  for (const x of cost.stuff || []) bits.push(`${x.n} ${stuffName(x.id)}`);
  return `<img class="cost-icon" src="${threadIconUrl()}" alt="">${esc(bits.join(' + '))}`;
}

// ---------------------------------------------------------------------------
// What the buttons do
// ---------------------------------------------------------------------------
Object.assign(UI.acts, {
  forgeOre: (id) => { UI.forge.ore = id; UI.redraw(); },
  forgeExotic: (id) => { UI.forge.exotic = UI.forge.exotic === id ? null : id; UI.redraw(); },
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
    const cost = recipeCost(F.bp, F.ore);
    if (!recipePay(cost, src)) return;
    let exotic = bp.exotic || null;
    if (!exotic && F.exotic && (src[F.exotic] || 0) > 0) { exotic = F.exotic; src[exotic] -= 1; if (!src[exotic]) delete src[exotic]; }
    F.exotic = null;
    if (!F.field) Save.save();
    snd('forgeFire');
    Anvil.start({ bp: F.bp, ore: F.ore, exotic, field: !!F.field });
  },

  cardSock: (i) => { const c = UI.card, m = c.item.sockets[Number(i)]; if (m) { const host = c.item; UI.openCard(m, 'socket', m.uid); Object.assign(UI.card, { host, hostI: Number(i), back: { item: host, where: c.where, key: c.key } }); } },
  sockPick: (i) => {
    const c = UI.card, it = c.item;
    i = Number(i);
    if (c.focus === 'modules' && c.sock === i && it.sockets[i]) { unsocketModule(it, i, Save.data.items); afterChange(); return; }
    c.focus = 'modules'; c.sock = i; UI.redraw();
  },
  sockPut: (uid) => {
    const c = UI.card, it = c.item, m = Save.data.items.find((x) => x.kind === 'module' && String(x.uid) === String(uid));
    if (!m || !it.sockets) return;
    removeFrom(Save.data.items, m);
    if (!socketModule(it, c.sock, m, Save.data.items)) { Save.data.items.push(m); return; }
    const next = it.sockets.indexOf(null);
    if (next >= 0) c.sock = next;
    afterChange();
  },
  sockOut: () => { const c = UI.card; unsocketModule(c.item, c.sock, Save.data.items); afterChange(); },
  // a module from the stash into where it would go
  modSocket: () => {
    const m = UI.card.item, t = moduleTarget(Save.data.equip, m);
    if (!t) return;
    removeFrom(Save.data.items, m);
    socketModule(Save.data.equip[t.slot], t.i, m, Save.data.items);
    UI.toast(`Socketed into your ${Save.data.equip[t.slot].name}`);
    UI.closeCard();
    afterChange();
  },
  modOut: () => {
    const c = UI.card, f = findModule(c.item.uid);
    if (!f || !f.base) return;
    unsocketModule(f.base, f.i, Save.data.items);
    if (c.back) { const b = c.back; UI.openCard(b.item, b.where, b.key); UI.card.focus = 'modules'; } else UI.closeCard();
    afterChange();
  },

  // the tuning bench: a module's card, to upgrade or salvage it
  benchMod: (uid) => { const f = findModule(uid); if (!f) return; UI.openCard(f.m, f.base ? 'socket' : 'stash', f.m.uid); UI.card.bench = true; if (f.base) { UI.card.host = f.base; UI.card.hostI = f.i; } drawCard(); },
  modUpgrade: () => {
    const m = UI.card.item, cost = upgradeCost(m);
    if (!cost || !benchPay(cost, Save.data.stash)) return;
    moduleUpgrade(m);
    snd('reveal', { rarity: m.rarity });
    UI.toast(`${m.name}: tier ${m.tier}`, m.rarity);
    Story.say('moduleUp');
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
    // an empty frame takes the cores of the one it replaces; a base with
    // empty sockets takes its modules
    if (isCaster(it) && isCaster(old) && !it.spells.some((sp) => spellCores(sp).length) && old.spells.some((sp) => spellCores(sp).length)) { moveSpells(old, it, list); UI.toast('The cores move across'); }
    if (old && it.sockets && !baseModules(it).length && baseModules(old).length && old.kind === it.kind) { moveModules(old, it, list); UI.toast('The modules move across'); }
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
  // at home into the stash; mid-dive into the cargo (what doesn't fit is
  // left on the floor). A base gives back ore and its stones and modules;
  // a module unravels into threads.
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
  partPut: (arg) => {
    const c = UI.card, it = c.item, [stone, tier] = arg.split(':');
    const st = Save.data.items.find((x) => x.kind === 'stone' && x.stone === stone && String(x.tier) === tier);
    if (!st || !isCaster(it) || !c.part) return;
    const [i, key] = c.part.split(':'), sp = it.spells[Number(i)];
    if (stoneKind(stone) !== spellPartKind(key)) return;
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
  cardStone: (arg) => { const [stone, tier] = arg.split(':'), st = Save.data.items.find((x) => x.kind === 'stone' && x.stone === stone && String(x.tier) === tier); if (st) UI.openCard(st, 'stash', st.uid); },
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

// Breaks a piece down into `stash`: a module into threads, a base into ore
// (and an exotic now and then), its cores and modules out whole into
// `list`. Returns what it gave.
function salvageInto(it, list, stash, field) {
  const got = {}, add = (k, n) => { if (!n) return; stash[k] = (stash[k] || 0) + n; got[k] = (got[k] || 0) + n; };
  if (it.kind === 'module') {
    add('thread', salvageThreads(it));
    Story.say('unravel');
    return got;
  }
  const y = salvageYield(Save.rng(), it);
  for (const sp of it.spells || []) list.push(...spellCores(sp));
  for (const m of it.sockets || []) if (m) list.push(m);
  add(y.ore, y.n);
  if (y.exotic) add(y.exotic, 1);
  return got;
}
