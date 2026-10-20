'use strict';
// ---------------------------------------------------------------------------
// The gear screens: the forge (recipes by category, each with exactly what
// it makes and costs, what's close and what's missing; research's reveal
// when something new comes home), the locker (bases worn and stashed, their
// module sockets and circuits, modules, stones, salvage), the rune bench
// (a module's tier, one trait rerolled, two fused, a trait added, a power
// imprinted), and the cards: a base's (its circuit and its sockets, with
// the drawer of modules to socket, free) and a module's (its traits, where
// it was caught, against what it would replace). ui.js holds the screens'
// plumbing; these redraw through UI.redraw like the rest.
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
// Cost tags for a bench cost from `src`.
function benchCostTags(cost, src) {
  const out = [];
  if (cost.threads) out.push(costTag('thread', cost.threads, src.thread || 0));
  if (cost.ore) out.push(costTag(cost.ore.id, cost.ore.n, src[cost.ore.id] || 0));
  for (const s of cost.stuff || []) out.push(costTag(s.id, s.n, src[s.id] || 0));
  return out.join(' ');
}
// "need 3 more Lumenite and 2 threads"
function shortWords(short) {
  return short.map((x) => (x.part ? partWords(x.part, x.n) : `${x.n} ${stuffName(x.id)}${x.id === 'thread' && x.n !== 1 ? 's' : ''}`)).join(', ');
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
// The tabs that have a recipe (BUILDINGS and WICK wait for a later pass).
const forgeCats = () => RECIPE_CATS.filter(([, c]) => BP_IDS.some((id) => BLUEPRINTS[id].cat === c));
// A stand-in for what a recipe makes (no uid): its icon and its numbers.
function recipePreview(bpId, tier, q = 0, size) {
  const bp = BLUEPRINTS[bpId];
  if (bp.kind === 'stone') return { kind: 'stone', stone: bp.stone, tier, rarity: 'magic', affixes: [] };
  if (recipeOnce(bp)) return null;
  const it = { kind: bp.kind, bp: bpId, tier, q, rarity: 'common', base: baseStats(bp.kind, tier, bp, q), affixes: [], sockets: new Array(socketCount(bp.kind, tier, q)).fill(null) };
  if (bp.kind === 'caster') it.slots = new Array(casterSlotCount(bpId, size, tier)).fill(null);
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
    if (wickFitted(bp.wick)) return 'Fitted: turn it off or on at the locker';
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
function forgeBestOre(id, src, size) {
  const ores = forgeOres(src), ok = ores.filter((o) => !recipeShort(recipeCost(id, o.id, size), src).length);
  return (ok[ok.length - 1] || ores[ores.length - 1] || T.ores[0]).id;
}
// What's nearly in reach: known recipes that would be better than what's
// worn (or held), short by a little. [{ id, ore, short }], the closest
// first.
function forgeCloseTo(src) {
  const s = Save.data, out = [];
  const worn = (kind) => Math.max(0, ...SLOTS.filter((k) => s.equip[k] && s.equip[k].kind === kind).map((k) => s.equip[k].tier));
  const stoneTop = (stone) => Math.max(0, ...s.items.filter((x) => x.kind === 'stone' && x.stone === stone).map((x) => x.tier), ...['main', 'off'].flatMap((k) => (s.equip[k] && s.equip[k].slots ? s.equip[k].slots.filter((x) => x && x.stone === stone).map((x) => x.tier) : [])));
  for (const id of s.blueprints) {
    const bp = BLUEPRINTS[id];
    if (!bp || recipeLock(id)) continue;
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
  const src = forgeSource(), F = UI.forge, s = Save.data, known = s.blueprints.filter((id) => BLUEPRINTS[id] && !(F.field && recipeOnce(BLUEPRINTS[id])));
  $('forge-title').textContent = F.field ? 'AN ANCIENT FORGE' : 'THE FORGE';
  if (F.codex && !F.field) { drawCodex(); return; }
  if (!F.bp || !known.includes(F.bp)) F.bp = known.find((id) => BLUEPRINTS[id].kind === 'caster') || known[0];
  const bp = BLUEPRINTS[F.bp], cat = bp.cat, tool = recipeOnce(bp);
  const sizes = bp.kind === 'caster' ? casterSizes(F.bp) : [null];
  if (!sizes.includes(F.size)) F.size = sizes[0];
  if (!tool && (!F.ore || !forgeOres(src).some((o) => o.id === F.ore))) F.ore = forgeBestOre(F.bp, src, F.size);
  const exotics = bp.kind === 'caster' || bp.kind === 'armor' || bp.kind === 'charm' || bp.kind === 'pick' ? T.exotics.filter((x) => (src[x.id] || 0) > 0 && exoticForgeWord(F.bp, x)) : [];
  if (F.exotic && !exotics.some((x) => x.id === F.exotic)) F.exotic = null;
  const ore = tool ? null : T.ores[ORE_INDEX[F.ore]], cost = recipeCost(F.bp, F.ore, F.size), short = recipeShort(cost, src), lock = recipeLock(F.bp);
  const ready = !short.length && !lock;

  // what's close, then the tabs and the recipes in this one
  const close = F.field ? [] : forgeCloseTo(src);
  const closeRows = close.map((c) => `<button class="row close-row" data-act="forgeGo" data-arg="${c.id}${c.ore ? ':' + c.ore : ''}"><img class="icon" src="${recipeIconUrl(c.id, c.ore ? T.ores[ORE_INDEX[c.ore]].tier : 1)}" alt=""><span class="row-text"><span class="row-name">${esc(c.ore && BLUEPRINTS[c.id].kind !== 'stone' ? `${stuffName(c.ore)} ${recipeName(c.id)}` : recipeName(c.id))}${c.ore && BLUEPRINTS[c.id].kind === 'stone' ? ` · tier ${T.ores[ORE_INDEX[c.ore]].tier}` : ''}</span><span class="row-sub short">Needs ${esc(shortWords(c.short))} more</span></span></button>`).join('');
  const cats = forgeCats().filter(([, c]) => !(F.field && (c === 'tool' || c === 'structure' || c === 'wick')));
  const tabs = `<div class="chips forge-tabs">${cats.map(([label, c]) => `<button class="chip ${!F.codex && cat === c ? 'on' : ''}" data-act="forgeTab" data-arg="${c}">${label}</button>`).join('')}${F.field ? '' : `<button class="chip" data-act="forgeTab" data-arg="codex">CODEX</button>`}</div>`;
  const inTab = known.filter((id) => BLUEPRINTS[id].cat === cat);
  const all = BP_IDS.filter((id) => BLUEPRINTS[id].cat === cat).length;
  const canMake = (id) => !recipeLock(id) && (recipeOnce(BLUEPRINTS[id]) ? !recipeShort(recipeCost(id), src).length : forgeOres(src).some((o) => !recipeShort(recipeCost(id, o.id), src).length));
  const tiles = inTab.map((id) => `<button class="bp ${id === F.bp ? 'on' : ''}${recipeLock(id) ? ' locked' : ''}" data-act="forgeBp" data-arg="${id}"><img class="icon" src="${recipeIconUrl(id, ore ? ore.tier : 1)}" alt=""><span>${esc(BLUEPRINTS[id].tool ? TOOLS[BLUEPRINTS[id].tool].name.split(' ').pop() : BLUEPRINTS[id].structure ? STRUCTURES[BLUEPRINTS[id].structure].short : BLUEPRINTS[id].name)}</span>${BLUEPRINTS[id].structure && structureBuilt(BLUEPRINTS[id].structure) || BLUEPRINTS[id].wick && wickFitted(BLUEPRINTS[id].wick) ? '<i class="made" aria-label="Made">✓</i>' : ''}${canMake(id) ? '<i class="can" aria-label="Can be made"></i>' : ''}</button>`).join('');
  const head = cat === 'structure' ? `BUILDINGS <span class="dim">· ${STRUCTURE_IDS.filter((x) => structureBuilt(x)).length} OF ${STRUCTURE_IDS.length} BUILT</span>` : cat === 'wick' ? `WICK <span class="dim">· ${WICK_UP_IDS.filter((x) => wickFitted(x)).length} OF ${WICK_UP_IDS.length} FITTED</span>` : `RECIPES <span class="dim">· ${inTab.length} OF ${all} KNOWN</span>`;
  const list = `<h3>${head}</h3>${tabs}<div class="bp-grid">${tiles}</div>${inTab.length < all ? `<p class="note">The rest are found by research: bring home something new (an ore, a creature's part, an exotic, a module) and the forge studies it.</p>` : ''}`;

  // the recipe: what to make it in, and exactly what comes out
  const chip = (act, id, label, on, ok = true) => `<button class="chip ${on ? 'on' : ''}" data-act="${act}" data-arg="${id}" ${ok ? '' : 'disabled'}>${label}</button>`;
  const stuffIcon = (id) => `<img class="chip-icon" src="${stuffIconUrl(id)}" alt="">`;
  let h = '';
  if (!tool) {
    const ores = forgeOres(src);
    const oreChips = ores.map((o) => chip('forgeOre', o.id, `${stuffIcon(o.id)}${esc(o.name)}<small>tier ${o.tier} · have ${src[o.id]}</small>`, o.id === F.ore)).join('')
      || `<span class="note">${F.field ? 'No ore in your cargo.' : 'No ore banked. Mine some and bring it home.'}</span>`;
    h += `<h3>MADE IN <span class="dim">· THE ORE SETS THE TIER</span></h3><div class="chips">${oreChips}</div>`;
    if (sizes.length > 1) h += `<h3>SIZE <span class="dim">· CIRCUIT SLOTS</span></h3><div class="chips">${sizes.map((n, i) => chip('forgeSize', n, `${n} slots<small>${i ? `+${i * T.gear.sizeOre} ore, +${i * T.gear.sizeParts} part${i * T.gear.sizeParts > 1 ? 's' : ''}` : 'as it comes'}</small>`, n === F.size)).join('')}</div>`;
    if (exotics.length) h += `<h3>EXOTIC <span class="dim">· IF YOU LIKE</span></h3><div class="chips">${exotics.map((x) => chip('forgeExotic', x.id, `${stuffIcon(x.id)}${esc(x.name)}<small>have ${src[x.id]} · ${esc(exoticForgeWord(F.bp, x))}</small>`, x.id === F.exotic)).join('')}</div>`;
  }
  // exactly what comes out
  const ex = F.exotic && T.exotics.find((x) => x.id === F.exotic), lines = [];
  let title = recipeName(F.bp);
  if (bp.kind === 'structure') {
    lines.push(esc(STRUCTURES[bp.structure].text()));
    lines.push(`Built once. The Meridian drops it on its plot in the outpost, ${esc(structurePlotWhere(bp.structure))}.`);
  } else if (bp.kind === 'wick') {
    lines.push(esc(WICK_UPS[bp.wick].text()));
    lines.push('Fitted once, in the Drone Bay. Turn it off or on at the locker whenever you like, free.');
  } else if (tool) {
    const t = TOOLS[bp.tool];
    lines.push(esc(t.text));
    lines.push('Made once, and carried by choice: choose one tool at the portal before setting out.');
  } else if (bp.kind === 'stone') {
    lines.push(`<b>A tier ${ore.tier} ${esc(bp.name)} stone</b>, ${bp.stoneKind === 'element' ? 'an' : 'a'} ${STONE_KIND_NAMES[bp.stoneKind].toLowerCase()}. ${esc(stoneLine(bp.stone))}`);
    lines.push('Socket it into a caster\'s circuit at the locker: changing it costs nothing.');
  } else {
    const tier = Math.min(T.ores.length, ore.tier + (ex && ex.tierUp ? 1 : 0)), it = recipePreview(F.bp, tier, 0, F.size);
    title = `${oreOfTier(tier).name} ${bp.name}`;
    const b = it.base, nums = bp.kind === 'caster' ? [`${b.power} spell power`, `${it.slots.length} circuit slots`] : bp.kind === 'armor' ? [`${b.armor} armor`, `+${b.hp} max health`] : bp.kind === 'pick' ? [itemBaseLine(it)] : [];
    nums.push(`${it.sockets.length} module socket${it.sockets.length === 1 ? '' : 's'}`);
    lines.push(`<b>Tier ${tier}:</b> ${nums.map(esc).join(' · ')}.`);
    const el = bp.kind === 'caster' && (T.circuits.ores[oreOfTier(tier).id] || {}).el;
    if (el) lines.push(`Its ${esc(oreOfTier(tier).name)} is attuned to ${esc(CIRCUIT_ELEMENTS[el].name)}.`);
    if (bp.text) lines.push(esc(bp.text));
    if (ex && ex.element && bp.kind === 'caster') lines.push(`With ${esc(ex.name)}: a ${esc(CIRCUIT_ELEMENTS[ex.element].name)} stone comes out with it.`);
    else if (ex && ex.tierUp) lines.push(`With ${esc(ex.name)}: a tier above its ore.`);
    lines.push(`<span class="dim">The anvil only adds: fair +5%, fine +10%, a masterwork +15% and a module socket more${bp.kind === 'caster' ? ' (and 2 slots linked)' : ''}.</span>`);
  }
  // (made already: what it cost is past, and the button says so)
  const made = (bp.structure && structureBuilt(bp.structure)) || (bp.wick && wickFitted(bp.wick)) || (bp.tool && toolOwned(bp.tool));
  if (lock && !made) lines.push(`<span class="short">${esc(lock)}.</span>`);
  // what it costs, every resource by name
  const tags = [];
  if (cost.ore) tags.push(costTag(cost.ore.id, cost.ore.n, src[cost.ore.id] || 0));
  for (const p of cost.parts) { const have = partsHave(src, p.kind); tags.push(costTag(p.kind === 'any' ? partId('chitin', 1) : partId(p.kind, 1), p.n, have, p.kind === 'any' ? 'creature parts, any kind' : `${PARTS[p.kind].name} (any grade)`)); }
  for (const x of cost.stuff) tags.push(costTag(x.id, x.n, src[x.id] || 0));
  if (cost.exotic) tags.push(costTag(cost.exotic, 1, src[cost.exotic] || 0));
  if (ex) tags.push(costTag(ex.id, 1, src[ex.id] || 0));
  const missing = short.length && !made ? `<p class="note short">Missing ${esc(shortWords(short))}.</p>` : '';
  const goWord = lock ? lock.toUpperCase() : short.length ? 'NOT ENOUGH YET' : bp.kind === 'structure' ? 'DROP IT ON ITS PLOT' : bp.kind === 'wick' ? 'FIT IT TO WICK' : tool ? 'MAKE IT' : 'TO THE ANVIL';
  const goLabel = bp.kind === 'structure' ? 'BUILD' : bp.kind === 'wick' ? 'FIT' : tool ? 'MAKE' : 'FORGE';
  $('forge-body').innerHTML = `
    ${closeRows ? `<h3>CLOSE TO MAKING</h3>${closeRows}` : ''}
    ${list}
    <div class="recipe-panel">
      <div class="card-head"><img class="icon big" src="${recipeIconUrl(F.bp, ore ? ore.tier : 1)}" alt=""><div class="grow"><div class="card-name">${esc(title)}</div><div class="row-sub">${esc(bp.kind === 'structure' ? 'A building for the outpost' : bp.kind === 'wick' ? "An upgrade for Wick" : tool ? 'A tool' : bp.kind === 'stone' ? `${STONE_KIND_NAMES[bp.stoneKind]} stone` : KIND_NAMES[bp.kind])}</div></div></div>
      ${h}
      <div class="preview">${lines.map((l) => `<p>${l}</p>`).join('')}</div>
      ${made ? '' : `<h3>COSTS</h3><div class="cost-list">${tags.join('')}</div>${missing}`}
      ${F.field ? '<p class="note">What you forge here goes in your cargo.</p>' : ''}
      <div class="menu forge-go"><button class="btn primary" data-act="craft" ${ready ? '' : 'disabled'}>${goLabel}<small>${esc(goWord)}</small></button></div>
    </div>`;
  const on = document.querySelector('#forge-body .bp.on');
  if (on && on.scrollIntoView && UI.forge.scroll) { UI.forge.scroll = false; on.scrollIntoView({ block: 'nearest' }); }
}

// The Codex: every resonance as a silhouette, its slot count and the parts
// resonance stones have shown; the whole of one, what it does. And the
// powers the forge remembers, and what a module is.
function drawCodex() {
  const tabs = `<div class="chips forge-tabs">${forgeCats().map(([label, c]) => `<button class="chip" data-act="forgeTab" data-arg="${c}">${label}</button>`).join('')}<button class="chip on" data-act="forgeTab" data-arg="codex">CODEX</button></div>`;
  const whole = RESONANCES.filter(codexWhole).length;
  const cards = RESONANCES.map((r) => {
    const shown = codexShown(r), all = codexWhole(r);
    const seq = r.seq.map((id, i) => (shown.includes(i) ? stoneTile({ stone: id, tier: 1 }, { mini: true }) : '<span class="tile mini t-unknown" aria-label="Not yet known"><b>?</b></span>')).join('');
    return `<div class="rcard${all ? ' whole' : ''}"><div class="rc-head"><b>${esc(r.name.toUpperCase())}</b><span>${r.seq.length} SLOTS</span></div><div class="mini-circuit">${seq}</div>
      <p class="note">${all ? esc(capFirst(r.text)) + '.' : `${shown.length} of ${r.seq.length} parts known. Resonance stones show the rest.`}</p></div>`;
  }).join('');
  const powers = (Save.data.codex || []).filter((k) => LEGENDARIES[k]);
  $('forge-body').innerHTML = `${tabs}
    <h3>MODULES</h3><p class="note">What the dark's creatures are made of comes apart when they die. The suit's capture field catches the strongest thread of the pattern and sets it in a lattice crystal: a module. How much was caught is its rarity. Socket them into what you forge; the rune bench grows, reweaves and fuses them, and unravels them into threads.</p>
    <h3>POWERS REMEMBERED · ${powers.length}</h3>${powers.length ? powers.map((k) => `<div class="row static"><span class="row-text"><span class="row-name r-legendary">${esc(LEGENDARIES[k].name)}</span><span class="row-sub">${esc(LEGENDARIES[k].text)} · for ${LEGENDARIES[k].kinds.map((x) => KIND_PHRASE[x]).join(' or ')}</span></span></div>`).join('') + '<p class="note">Imprint one into a module at the rune bench, for a heart or Riftglass.</p>' : '<p class="note">Salvage a legendary module at home and the forge remembers its power.</p>'}
    <h3>RESONANCES <span class="dim">· ${whole} OF ${RESONANCES.length} WHOLE</span></h3>
    <p class="note">A resonance is an exact circuit that wakes into one spell. It must fill its caster exactly: a ${RESONANCES[0].seq.length}-part one needs a ${RESONANCES[0].seq.length}-slot caster. Resonance stones show their parts: elites drop them now and then, they lie by ancient forges, and contracts pay them.</p>
    <div class="codex">${cards}</div>`;
}

// ---------------------------------------------------------------------------
// Research: the forge studies what's new, and shows what it can make now
// ---------------------------------------------------------------------------
// Opening the forge at home: anything new is studied first, and if it
// revealed a recipe, the reveal shows before the forge.
function openForge(field) {
  UI.forge.field = !!field;
  const finds = field ? [] : researchStudy();
  if (finds.length) { Save.save(); UI.research = finds; UI.show('screen-research'); snd('blueprint'); Story.say('research'); return; }
  UI.forge.scroll = true;
  UI.show('screen-forge');
  snd('forgeOpen');
}
function drawResearch() {
  const finds = UI.research || [];
  $('research-body').innerHTML = `<p class="note center">The forge studies what you brought home.</p>` + finds.map((f, i) => `
    <div class="find" style="--d:${i * 0.35}s"><div class="find-what"><img class="icon" src="${researchIconUrl(f.r)}" alt=""><span>${esc(researchWhat(f.r))}</span></div>
    <div class="find-arrow">→</div>
    <div class="find-opens">${f.opened.map((id, j) => `<span class="find-recipe" style="--d:${i * 0.35 + 0.25 + j * 0.15}s"><img class="icon" src="${recipeIconUrl(id)}" alt=""><b>${esc(recipeName(id))}</b></span>`).join('')}</div></div>`).join('')
    + `<p class="note center">${finds.reduce((n, f) => n + f.opened.length, 0)} new recipe${finds.reduce((n, f) => n + f.opened.length, 0) === 1 ? '' : 's'} at the forge.</p><div class="menu"><button class="btn primary" data-act="researchDone">SEE THE RECIPES</button></div>`;
}

// ---------------------------------------------------------------------------
// The locker
// ---------------------------------------------------------------------------
function drawGear() {
  const s = Save.data, st = computeStats(s.equip, s.attune);
  const slots = SLOTS.map((k) => {
    const it = s.equip[k];
    return it ? itemRow(it, 'cardEquip', k, `<span class="slot">${SLOT_NAMES[k]}</span>`)
      : `<div class="row empty"><span class="row-text"><span class="row-name">Empty</span><span class="row-sub">${SLOT_NAMES[k]} · forge one at the forge</span></span></div>`;
  }).join('');
  const mods = s.items.filter((it) => it.kind === 'module');
  const modList = MOD_FITS.map((f) => {
    const list = mods.filter((m) => m.fits === f).sort((a, b) => moduleWorth(b) - moduleWorth(a));
    return list.length ? `<div class="gl">FOR ${f === 'armor' ? 'ARMOR' : KIND_WORDS[f].toUpperCase() + 'S'}</div>${list.map((m) => moduleRow(m, 'cardStash', m.uid, moduleTag(m, s.equip))).join('')}` : '';
  }).join('');
  const kinds = ['relic', 'caster', 'armor', 'charm', 'pick'];
  const bases = s.items.filter((it) => kinds.includes(it.kind)).sort((a, b) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind) || b.tier - a.tier)
    .map((it) => itemRow(it, 'cardStash', it.uid, compareTag(it, s.equip))).join('');
  const stones = groupStones(s.items), down = downgrades();
  $('gear-title').textContent = 'THE LOCKER';
  $('gear-body').innerHTML = `
    <div class="stats">${statLine(st)}</div>
    <h3>WORN</h3>${slots}
    <p class="note">Tap a piece for its module sockets (and a caster's circuit). Socketing is free: change it as often as you like.</p>
    ${wickLockerHtml()}
    <h3>MODULES · ${mods.length}</h3>${modList || '<p class="note">None spare. Creatures leave them when they fall: their pattern, caught in a lattice.</p>'}
    <h3>BASES · ${s.items.filter((it) => kinds.includes(it.kind)).length}</h3>${bases || '<p class="note">None spare. Bases are forged at the forge.</p>'}
    <h3>STONES · ${stones.reduce((n, x) => n + x.n, 0)}</h3>${stones.length ? `<div class="drawer-row">${stones.map((x) => stoneTile(x, { act: 'cardStone', arg: x.stone + ':' + x.tier, count: x.n })).join('')}</div>` : '<p class="note">None spare. Forge Form, Element and Glyph stones at the forge.</p>'}
    ${down.length ? `<div class="menu"><button class="btn danger" data-act="salvageAll">${UI.salvageAllArmed ? `TAP AGAIN: SALVAGE ${down.length}` : `SALVAGE ALL ▼ (${down.length})`}</button></div><p class="note">Breaks down every base and module marked ▼ that isn't kept (★): bases into ore, modules into threads. What's in a base comes out first.</p>` : ''}
    <h3>MATERIALS</h3><p class="note">${esc(stuffLines(s.stash)) || 'None.'}</p>`;
}
function statLine(st) {
  const bits = [`${st.maxHp} health`, `${st.armor} armor`, `${st.cargo} cargo`];
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
// The rune bench
// ---------------------------------------------------------------------------
function drawBench() {
  const s = Save.data, rows = [];
  for (const slot of SLOTS) {
    const b = s.equip[slot];
    if (!b || !b.sockets) continue;
    for (const m of b.sockets) if (m) rows.push(moduleRow(m, 'benchMod', m.uid, '', `In your ${b.name} · ${SLOT_NAMES[slot].toLowerCase()} · tier ${m.tier}`));
  }
  const stash = s.items.filter((x) => x.kind === 'module').sort((a, b) => MOD_FITS.indexOf(a.fits) - MOD_FITS.indexOf(b.fits) || moduleWorth(b) - moduleWorth(a));
  $('bench-body').innerHTML = `
    <p class="note">A module is a lattice holding a creature's pattern. Here its lattice can be grown in denser ore (a tier up, every trait stronger), one trait rerolled with the rest kept, two fused into one, or a power imprinted. Threads pay for it: salvage a module to unravel it into threads.</p>
    <p class="have-line"><img class="cost-icon" src="${threadIconUrl()}" alt="">Threads: <b>${s.stash.thread || 0}</b> · ${esc(stuffLines(Object.fromEntries(T.ores.filter((o) => s.stash[o.id]).map((o) => [o.id, s.stash[o.id]]))) || 'no ore')}</p>
    <h3>SOCKETED · ${rows.length}</h3>${rows.join('') || '<p class="note">Nothing socketed. Socket modules at the locker.</p>'}
    <h3>IN THE STASH · ${stash.length}</h3>${stash.map((m) => moduleRow(m, 'benchMod', m.uid, moduleTag(m, s.equip))).join('') || '<p class="note">No modules in the stash.</p>'}`;
}

// ---------------------------------------------------------------------------
// The cards
// ---------------------------------------------------------------------------
// where: 'stash' | 'equip' (at home) | 'cargo' | 'worn' (mid-dive) |
// 'socket' (a module in a base's socket: c.host, c.hostI); key: the uid or
// slot. c.bench: opened at the rune bench.
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

// A base (or a stone, or a relic): its numbers, its circuit and sockets,
// against what's worn, and what can be done with it.
function drawBaseCard(c) {
  const it = c.item, home = c.where === 'stash' || c.where === 'equip', s = Save.data;
  if (!c.focus) c.focus = isCaster(it) ? 'circuit' : 'modules';
  let extra = '';
  if (it.power) extra += `<p class="power">★ ${esc(LEGENDARIES[it.power].text)}</p>`;
  const acts = [];
  const handBtns = (act) => [`<button class="btn primary" data-act="${act}" data-arg="main">EQUIP · MAIN</button>`, `<button class="btn primary" data-act="${act}" data-arg="off">EQUIP · OFF</button>`];
  const sy = it.kind !== 'relic' && salvageYield(new Rng(1), it);
  const salvageBtn = sy ? `<button class="btn danger" data-act="salvage" data-confirm="SURE? +${sy.n} ${esc(stuffName(sy.ore).toUpperCase())}">SALVAGE</button>` : '';
  const slotOf = KIND_SLOT[it.kind];
  if (c.where === 'stash') {
    if (it.kind === 'relic') acts.push('<button class="btn primary wide" data-act="unseal">UNSEAL</button>');
    else if (slotOf === 'hand') acts.push(...handBtns('equip'));
    else if (slotOf) acts.push(`<button class="btn primary" data-act="equip" data-arg="${slotOf}">EQUIP</button>`);
    if (it.kind !== 'relic' && !it.fav) acts.push(salvageBtn);
  } else if (c.where === 'equip') acts.push('<button class="btn" data-act="unequip">UNEQUIP</button>');
  else if (c.where === 'cargo') {
    if (slotOf === 'hand') acts.push(...handBtns('equip'));
    else if (slotOf) acts.push(`<button class="btn primary" data-act="equip" data-arg="${slotOf}">EQUIP</button>`);
    if (Game.dive.pocket.length < pocketSlots()) acts.push('<button class="btn wide" data-act="pocket">POCKET (SAFE IF YOU FALL)</button>');
    if (it.kind !== 'relic') acts.push(salvageBtn);
    acts.push('<button class="btn danger" data-act="drop" data-confirm="SURE? DROP IT">DROP</button>');
  }
  const cmp = (c.where === 'stash' || c.where === 'cargo') ? compareTag(it, s.equip) : '';
  const slot = (c.where === 'stash' || c.where === 'cargo') && compareSlot(s.equip, it);
  if (slot) {
    const cur = s.equip[slot], lines = compareLines(it, cur);
    extra += `<div class="compare"><div class="row-sub">${cur ? `AGAINST ${esc(cur.name.toUpperCase())} (${SLOT_NAMES[slot].toUpperCase()})` : `${SLOT_NAMES[slot].toUpperCase()} IS EMPTY`}</div>${lines.map((l) => `<div class="${l.up ? 'up' : 'down'}">${l.up ? '▲' : '▼'} ${esc(l.text)}</div>`).join('') || '<div class="dim">No change</div>'}${cur && baseModules(cur).length ? '<div class="dim">Its modules move across when you equip this.</div>' : ''}</div>`;
  }
  const canFav = it.kind !== 'relic' && it.kind !== 'stone' && home;
  const favBtn = canFav ? `<button class="mini fav ${it.fav ? 'on' : ''}" data-act="fav" title="Keep: never salvaged">${it.fav ? '★ KEPT' : '☆ KEEP'}</button>` : '';
  const sockets = it.sockets ? socketPanel(it, home, c) : '';
  $('card-body').innerHTML = cardBar(cardWhere(c), favBtn) + `<div class="card-scroll">
    <div class="card-head">${iconImg(it, 'icon big')}<div class="grow"><div class="card-name ${it.q ? 'q-' + it.q : ''}">${esc(it.name)} ${cmp}</div><div class="row-sub">${esc(itemKindLine(it))}</div></div></div>
    <p class="base">${esc(itemBaseLine(it))}</p>
    ${isCaster(it) ? circuitPanel(it, home, c, home && c.focus === 'circuit') : ''}
    ${sockets}
    ${itemNotes(it).map((n) => `<p class="note">${esc(n)}</p>`).join('')}
    ${extra}
    ${acts.length ? `<div class="menu card-menu">${acts.join('')}</div>` : ''}</div>`;
}

// A base's module sockets on its card: the row of them and, at home, the
// drawer of modules that fit, each against what's in the chosen socket.
function socketPanel(it, home, c) {
  const n = it.sockets.length;
  if (!n) return `<h3>MODULES · NO SOCKETS</h3><p class="note">${it.kind === 'pick' && it.tier === 0 ? 'Too crude to hold a module. Forge a pick.' : 'No sockets.'}</p>`;
  if (typeof c.sock !== 'number' || c.sock >= n) c.sock = Math.max(0, it.sockets.indexOf(null));
  const edit = home && c.focus === 'modules';
  const tiles = it.sockets.map((m, i) => modTile(m, home ? { act: 'sockPick', arg: i, sel: edit && c.sock === i } : m ? { act: 'cardSock', arg: i } : {})).join('');
  let h = `<h3>MODULES · ${baseModules(it).length}/${n} SOCKETS</h3><div class="sockets-row">${tiles}</div>`;
  const traits = baseModules(it).flatMap((m) => moduleTraits(m).map((t) => `<p class="${t.key === 'power' ? 'power' : t.key === 'set' ? 'set' : ''}">${esc(t.text)}</p>`));
  if (traits.length) h += `<div class="readout mods">${traits.join('')}</div>`;
  if (!home) return h + (c.where === 'cargo' || c.where === 'worn' ? '<p class="note">Its modules can be changed at home, at the locker.</p>' : '');
  if (!edit) return h + '<p class="note">Tap a socket to change its module.</p>';
  const sel = it.sockets[c.sock], have = Save.data.items.filter((x) => x.kind === 'module' && x.fits === it.kind).sort((a, b) => moduleWorth(b) - moduleWorth(a));
  const rows = have.map((m) => {
    const lines = compareLines(m, sel), a = moduleWorth(m), b = moduleWorth(sel);
    const tag = !sel || a > b * 1.05 ? '<span class="tag up">▲</span>' : a < b * 0.95 ? '<span class="tag down">▼</span>' : '';
    return `<button class="row mod-row" data-act="sockPut" data-arg="${m.uid}"><img class="icon" src="${moduleIconUrl(m)}" alt=""><span class="row-text"><span class="row-name r-${m.rarity}">${esc(m.name)} <small class="dim">T${m.tier}</small></span><span class="row-traits">${lines.map((l) => `<i class="${l.up ? 'up' : 'down'}">${l.up ? '▲' : '▼'} ${esc(l.text)}</i>`).join(' ') || 'No change'}</span></span>${tag}</button>`;
  }).join('');
  h += `<div class="drawer"><div class="drawer-head"><span>SOCKET ${c.sock + 1} · ${sel ? esc(sel.name.toUpperCase()) : 'EMPTY'}</span>${sel ? `<span><button class="mini" data-act="cardSock" data-arg="${c.sock}">LOOK</button><button class="mini" data-act="sockOut">TAKE OUT</button></span>` : ''}</div>
    <p class="note">Tap a module to set it in socket ${c.sock + 1}${sel ? `; ${esc(sel.name)} goes back to the stash` : ''}. Each line is what it would change.</p>
    ${rows || `<p class="note">No spare modules for ${KIND_PHRASE[it.kind]}. Creatures leave them when they fall.</p>`}</div>`;
  return h;
}

// A module: its traits, where it was caught, against what it would
// replace; at home, socket it or salvage it; at the bench, work on it.
function drawModuleCard(c) {
  const m = c.item, s = Save.data, home = c.where === 'stash' || (c.where === 'socket' && (!c.back || c.back.where === 'equip' || c.back.where === 'stash'));
  if (c.fuse) { drawFuseCard(c); return; }
  const bench = c.bench && home, src = s.stash;
  // Bloodresin: a trait rerolled with it comes out leech
  const resin = bench && (src.bloodresin || 0) > 0 && KIND_FAMILIES[m.fits].includes('leech') && !m.affixes.some((a) => a.id === 'leech');
  if (!resin) c.resin = false;
  const rollBar = (a) => { const r = affixRoll(a, m.tier, T.modules.value); return `<span class="roll" title="How well it rolled"><span style="width:${Math.round(clamp(r, 0.04, 1) * 100)}%" class="${r > 1 ? 'over' : r > 0.8 ? 'high' : ''}"></span></span>`; };
  const benchBtn = (cls, act, arg, label, cost, block) => {
    const short = cost ? benchShort(cost, src) : [];
    return `<button class="${cls} rune-btn${short.length && !block ? ' short' : ''}" data-act="${act}"${arg === null ? '' : ` data-arg="${arg}"`} ${short.length || block ? 'disabled' : ''}><span>${label}</span><small>${block ? esc(block) : short.length ? `need ${esc(shortWords(short))}` : benchCostWords(cost)}</small></button>`;
  };
  const rr = rerollCost(m);
  if (c.resin) rr.stuff = [{ id: 'bloodresin', n: 1 }];
  const traits = m.affixes.map((a, i) => `<li${bench ? ' class="runed"' : ''}><span class="aff">${esc(fmtAffix(a))}${rollBar(a)}</span>${bench ? `<span class="rune">${benchBtn('mini', 'modReroll', i, 'REROLL', rr)}</span>` : ''}</li>`).join('');
  let extra = '';
  if (m.power) extra += `<p class="power">★ ${esc(LEGENDARIES[m.power].text)}${m.imprinted ? ' <span class="dim">(imprinted)</span>' : ''}</p>`;
  if (m.set) {
    const n = computeStats(s.equip, s.attune).sets[m.set] || 0, S = SETS[m.set];
    extra += `<p class="set">${esc(S.name)} (${n}/3 socketed)<br>2: ${esc(S.bonus2.text)}<br>3: ${esc(S.bonus3.text)}</p>`;
  }
  // against what it would replace
  if (c.where !== 'socket') {
    const t = moduleTarget(s.equip, m);
    if (!t) extra += `<div class="compare"><div class="row-sub">NOTHING WORN TAKES IT</div><div class="dim">Forge ${KIND_PHRASE[m.fits]}${m.fits === 'pick' ? ' with sockets' : ''} to socket it into.</div></div>`;
    else {
      const base = s.equip[t.slot], lines = compareLines(m, t.cur);
      extra += `<div class="compare"><div class="row-sub">${t.cur ? `AGAINST ${esc(t.cur.name.toUpperCase())}, IN YOUR ${esc(base.name.toUpperCase())}` : `YOUR ${esc(base.name.toUpperCase())} HAS AN EMPTY SOCKET`}</div>${lines.map((l) => `<div class="${l.up ? 'up' : 'down'}">${l.up ? '▲' : '▼'} ${esc(l.text)}</div>`).join('') || '<div class="dim">No change</div>'}</div>`;
    }
  }
  const acts = [], st = salvageThreads(m);
  const salvageBtn = `<button class="btn danger" data-act="salvage" data-confirm="SURE? +${st} THREADS">SALVAGE · +${st} THREADS</button>`;
  if (bench) {
    const up = upgradeCost(m), en = enrichCost(), imp = imprintPowers(m), fc = s.items.concat(SLOTS.flatMap((k) => baseModules(s.equip[k]))).filter((x) => x.kind === 'module' && x.fits === m.fits && x !== m).length;
    acts.push(benchBtn('btn wide', 'modUpgrade', null, up ? `UPGRADE · TIER ${m.tier + 1}` : 'UPGRADE', up, up ? '' : 'its lattice is as dense as it grows'));
    if (canEnrich(m)) acts.push(benchBtn('btn wide', 'modEnrich', null, `ADD A TRAIT · ${m.rarity === 'common' ? 'MAGIC' : 'RARE'}`, en));
    for (const k of imp) { const ic = imprintCost(src); acts.push(benchBtn('btn wide', 'modImprint', k, `IMPRINT ${LEGENDARIES[k].name.toUpperCase()}`, ic)); }
    acts.push(`<button class="btn wide" data-act="modFuse" ${fc ? '' : 'disabled'}>FUSE WITH ANOTHER<small>${fc ? 'keep a trait of each; both are used up' : `no other module for ${KIND_PHRASE[m.fits]}`}</small></button>`);
  }
  if (c.where === 'stash' && home) {
    const t = moduleTarget(s.equip, m);
    if (t && !bench) acts.push(`<button class="btn primary wide" data-act="modSocket">SOCKET INTO ${esc(s.equip[t.slot].name.toUpperCase())}</button>`);
    if (!m.fav) acts.push(salvageBtn);
  } else if (c.where === 'socket' && home) acts.push('<button class="btn" data-act="modOut">TAKE OUT</button>');
  else if (c.where === 'cargo') {
    if (Game.dive.pocket.length < pocketSlots()) acts.push('<button class="btn wide" data-act="pocket">POCKET (SAFE IF YOU FALL)</button>');
    acts.push(salvageBtn);
    acts.push('<button class="btn danger" data-act="drop" data-confirm="SURE? DROP IT">DROP</button>');
  }
  const benchNote = bench ? `<p class="rune-head"><img class="cost-icon" src="${threadIconUrl()}" alt=""><span>Bench work is paid in <b>threads</b> and ore. <span class="${(src.thread || 0) < rr.threads ? 'short' : ''}">You have ${src.thread || 0} threads.</span> A reroll keeps the other traits.</span></p>${resin ? `<div class="chips"><button class="chip ${c.resin ? 'on' : ''}" data-act="modResin"><img class="chip-icon" src="${stuffIconUrl('bloodresin')}" alt="">With Bloodresin<small>have ${src.bloodresin} · the reroll comes out leech</small></button></div>` : ''}`
    : home && c.where !== 'cargo' ? '<p class="note">Upgrade it, reroll a trait or fuse it at the rune bench.</p>' : '';
  const favBtn = home ? `<button class="mini fav ${m.fav ? 'on' : ''}" data-act="fav" title="Keep: never salvaged">${m.fav ? '★ KEPT' : '☆ KEEP'}</button>` : '';
  const ud = c.where === 'stash' || c.where === 'cargo' ? moduleTag(m, s.equip) : '';
  $('card-body').innerHTML = cardBar(cardWhere(c), favBtn) + `<div class="card-scroll">
    <div class="card-head"><img class="icon big" src="${moduleIconUrl(m)}" alt=""><div class="grow"><div class="card-name r-${m.rarity}">${esc(m.name)} ${ud}</div><div class="row-sub">${esc(itemKindLine(m))}</div></div></div>
    ${moduleSource(m) ? `<p class="src">${esc(moduleSource(m))}</p>` : ''}
    ${benchNote}${traits ? `<ul class="affixes">${traits}</ul>` : ''}
    ${extra}
    ${acts.length ? `<div class="menu card-menu">${acts.join('')}</div>` : ''}</div>`;
}
function benchCostWords(cost) {
  const bits = [];
  if (cost.threads) bits.push(`${cost.threads} threads`);
  if (cost.ore) bits.push(`${cost.ore.n} ${stuffName(cost.ore.id)}`);
  for (const x of cost.stuff || []) bits.push(`${x.n} ${stuffName(x.id)}`);
  return `<img class="cost-icon" src="${threadIconUrl()}" alt="">${esc(bits.join(' + '))}`;
}

// Fusing: a trait of this module kept, another module chosen, a trait of
// it kept; both are used up, and one comes out.
function drawFuseCard(c) {
  const a = c.item, s = Save.data, F = c.fuse, src = s.stash;
  const others = s.items.filter((x) => x.kind === 'module' && x.fits === a.fits && x !== a).concat(SLOTS.flatMap((k) => baseModules(s.equip[k])).filter((x) => x.fits === a.fits && x !== a));
  const b = F.b && others.find((x) => String(x.uid) === String(F.b));
  if (!b) F.b = null;
  const chips = (m, which, on) => moduleTraits(m).map((t) => `<button class="chip ${on === t.key ? 'on' : ''}" data-act="fuseTrait" data-arg="${which}:${t.key}">${esc(t.text)}</button>`).join('');
  let h = `<h3>1 · KEEP FROM ${esc(a.name.toUpperCase())}</h3><div class="chips trait-chips">${chips(a, 'a', F.ta)}</div>`;
  h += `<h3>2 · FUSE WITH</h3>${others.map((m) => `<button class="row mod-row ${b === m ? 'on' : ''}" data-act="fusePick" data-arg="${m.uid}"><img class="icon" src="${moduleIconUrl(m)}" alt=""><span class="row-text"><span class="row-name r-${m.rarity}">${esc(m.name)} <small class="dim">T${m.tier}</small></span><span class="row-traits">${esc(moduleTraits(m).map((t) => t.text).join(' · '))}</span></span></button>`).join('')}`;
  if (b) h += `<h3>3 · KEEP FROM ${esc(b.name.toUpperCase())}</h3><div class="chips trait-chips">${chips(b, 'b', F.tb)}</div>`;
  const problem = fuseProblem(a, F.ta, b, F.tb), cost = b ? fuseCost(a, b) : null;
  if (b && F.ta && F.tb && !problem) {
    const tier = Math.max(a.tier, b.tier), k = 1 + T.modules.fuse.boost;
    const pick = (m, key) => (key === 'power' ? LEGENDARIES[m.power].text : key === 'set' ? `A piece of ${SETS[m.set].name}` : fmtAffix(rescaleAffix(m.affixes[Number(key.slice(1))], m.tier, tier, k)));
    h += `<div class="preview"><p><b>Comes out:</b> a woven module for ${KIND_PHRASE[a.fits]}, tier ${tier}.</p><p>${esc(pick(a, F.ta))}</p><p>${esc(pick(b, F.tb))}</p><p class="dim">Only these two traits, each ${Math.round(T.modules.fuse.boost * 100)}% stronger. Everything else on both is lost.</p></div>`;
  } else if (b && F.ta && F.tb) h += `<p class="note short">${esc(problem)}.</p>`;
  const short = cost ? benchShort(cost, src) : [];
  if (cost) h += `<h3>COSTS</h3><div class="cost-list">${benchCostTags(cost, src)}</div>${short.length ? `<p class="note short">Missing ${esc(shortWords(short))}.</p>` : ''}`;
  const ok = b && F.ta && F.tb && !problem && !short.length;
  h += `<p class="warn-line">Both modules are used up.</p><div class="menu card-menu"><button class="btn" data-act="fuseBack">BACK</button><button class="btn danger" data-act="fuseGo" ${ok ? '' : 'disabled'} data-confirm="SURE? BOTH ARE USED UP">FUSE</button></div>`;
  $('card-body').innerHTML = cardBar('THE RUNE BENCH · FUSING') + `<div class="card-scroll">
    <div class="card-head"><img class="icon big" src="${moduleIconUrl(a)}" alt=""><div class="grow"><div class="card-name r-${a.rarity}">${esc(a.name)}</div><div class="row-sub">${esc(itemKindLine(a))}</div></div></div>${h}</div>`;
}

// ---------------------------------------------------------------------------
// What the buttons do
// ---------------------------------------------------------------------------
Object.assign(UI.acts, {
  forgeOre: (id) => { UI.forge.ore = id; UI.redraw(); },
  forgeSize: (n) => { UI.forge.size = Number(n); UI.redraw(); },
  forgeExotic: (id) => { UI.forge.exotic = UI.forge.exotic === id ? null : id; UI.redraw(); },
  forgeBp: (id) => { UI.forge.bp = id; UI.forge.codex = false; UI.forge.size = null; UI.redraw(); },
  // a close-to-making row: that recipe, in that ore
  forgeGo: (arg) => { const [id, ore] = arg.split(':'); Object.assign(UI.forge, { bp: id, ore: ore || UI.forge.ore, codex: false, size: null }); UI.redraw(); },
  forgeTab: (tab) => {
    if (tab === 'codex') { UI.forge.codex = true; UI.redraw(); return; }
    const id = Save.data.blueprints.find((b) => BLUEPRINTS[b] && BLUEPRINTS[b].cat === tab);
    UI.forge.codex = false;
    if (id) { UI.forge.bp = id; UI.forge.size = null; }
    UI.redraw();
  },
  researchDone: () => { UI.research = null; UI.forge.scroll = true; UI.show('screen-forge'); },
  craft: () => {
    const F = UI.forge, src = forgeSource(), bp = BLUEPRINTS[F.bp];
    if (recipeLock(F.bp)) return;
    if (bp.kind === 'structure') {
      if (!buildStructure(bp.structure)) return;
      snd('reveal', { rarity: 'legendary' });
      UI.toast(`Built: the ${STRUCTURE_NAMES[bp.structure]}. It's coming down to its plot, ${structurePlotWhere(bp.structure)}`, 'legendary');
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
      UI.toast(`Made: ${TOOLS[bp.tool].name}. It's what you'll carry next`, 'legendary');
      UI.redraw();
      return;
    }
    const cost = recipeCost(F.bp, F.ore, F.size);
    if (!recipePay(cost, src)) return;
    let exotic = bp.exotic || null;
    if (!exotic && F.exotic && (src[F.exotic] || 0) > 0) { exotic = F.exotic; src[exotic] -= 1; if (!src[exotic]) delete src[exotic]; }
    F.exotic = null;
    if (!F.field) Save.save();
    snd('forgeFire');
    Anvil.start({ bp: F.bp, ore: F.ore, size: bp.kind === 'caster' ? F.size : null, exotic, field: !!F.field });
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

  // the rune bench
  benchMod: (uid) => { const f = findModule(uid); if (!f) return; UI.openCard(f.m, f.base ? 'socket' : 'stash', f.m.uid); UI.card.bench = true; if (f.base) { UI.card.host = f.base; UI.card.hostI = f.i; } drawCard(); },
  modReroll: (i) => {
    const c = UI.card, m = c.item, cost = rerollCost(m);
    if (c.resin) cost.stuff = [{ id: 'bloodresin', n: 1 }];
    if (!benchPay(cost, Save.data.stash)) return;
    moduleReroll(Save.rng(), m, Number(i), c.resin ? 'leech' : null);
    c.resin = false;
    snd('anvil', { grade: 'good' });
    afterChange();
  },
  modResin: () => { UI.card.resin = !UI.card.resin; UI.redraw(); },
  modUpgrade: () => {
    const m = UI.card.item, cost = upgradeCost(m);
    if (!cost || !benchPay(cost, Save.data.stash)) return;
    moduleUpgrade(m);
    snd('reveal', { rarity: m.rarity });
    UI.toast(`${m.name}: tier ${m.tier}`, m.rarity);
    Story.say('moduleUp');
    afterChange();
  },
  modEnrich: () => { const m = UI.card.item; if (canEnrich(m) && benchPay(enrichCost(), Save.data.stash)) { moduleEnrich(Save.rng(), m); snd('reveal', { rarity: m.rarity }); afterChange(); } },
  modImprint: (k) => {
    const m = UI.card.item, cost = imprintCost(Save.data.stash);
    if (!imprintPowers(m).includes(k) || !benchPay(cost, Save.data.stash)) return;
    moduleImprint(m, k);
    snd('reveal', { rarity: 'legendary' });
    UI.toast(`Imprinted: ${LEGENDARIES[k].name}`, 'legendary');
    afterChange();
  },
  modFuse: () => { UI.card.fuse = { b: null, ta: null, tb: null }; UI.redraw(); },
  fuseBack: () => { UI.card.fuse = null; UI.redraw(); },
  fusePick: (uid) => { const F = UI.card.fuse; F.b = uid; F.tb = null; UI.redraw(); },
  fuseTrait: (arg) => { const [w, key] = arg.split(':'), F = UI.card.fuse; if (w === 'a') F.ta = key; else F.tb = key; UI.redraw(); },
  fuseGo: () => {
    const c = UI.card, F = c.fuse, a = c.item, fb = F && findModule(F.b), b = fb && fb.m;
    if (!b || fuseProblem(a, F.ta, b, F.tb) || !benchPay(fuseCost(a, b), Save.data.stash)) return;
    const m = moduleFuse(Save.rng(), a, F.ta, b, F.tb);
    // the woven one takes the first one's place
    const fa = findModule(a.uid);
    removeModule(b.uid);
    if (fa && fa.base) fa.base.sockets[fa.i] = m; else { removeFrom(Save.data.items, a); Save.data.items.push(m); }
    Story.say('fuse');
    Save.save();
    UI.closeCard();
    Reveal.show(m, fa && fa.base ? 'socket' : 'stash', 'screen-bench');
    if (fa && fa.base) Reveal.host = fa.base;
  },
  benchBack: () => UI.close(),

  equip: (slot) => {
    const c = UI.card, it = c.item, eq = Save.data.equip;
    const list = c.where === 'cargo' ? Game.dive.items : Save.data.items;
    removeFrom(list, it);
    const old = eq[slot];
    if (old) list.push(old);
    eq[slot] = it;
    // a caster with nothing in it takes the circuit of the one it replaces;
    // a base with empty sockets takes its modules
    if (isCaster(it) && isCaster(old) && !it.slots.some(Boolean) && old.slots.some(Boolean)) { moveCircuit(old, it, list); UI.toast('The circuit moves across'); }
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
    if (field) {
      const d = Game.dive, over = cargoUsed(d) - d.stats.cargo;
      for (const k of Object.keys(got)) {
        const left = Math.min(over, s[k] || 0);
        if (left > 0) { s[k] -= left; if (!s[k]) delete s[k]; d.drops.push({ x: d.p.x, y: d.p.y, t: 0, stuff: k, n: left, left: true }); break; }
      }
    }
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
  // the circuit, at home: a slot chosen (tapped again, it's emptied), a
  // stone set in it from the stash, or taken out
  slotPick: (i) => {
    const c = UI.card, it = c.item;
    i = Number(i);
    if (c.focus === 'circuit' && c.slot === i && it.slots[i]) { Save.data.items.push(it.slots[i]); it.slots[i] = null; afterChange(); return; }
    c.focus = 'circuit'; c.slot = i; UI.redraw();
  },
  slotPut: (arg) => {
    const c = UI.card, it = c.item, [stone, tier] = arg.split(':');
    const st = Save.data.items.find((x) => x.kind === 'stone' && x.stone === stone && String(x.tier) === tier);
    if (!st || !isCaster(it)) return;
    removeFrom(Save.data.items, st);
    if (it.slots[c.slot]) Save.data.items.push(it.slots[c.slot]);
    it.slots[c.slot] = st;
    const next = it.slots.indexOf(null);
    if (next >= 0) c.slot = next;
    // a resonance built: its page in the Codex fills in
    const res = circuitResonance(it.slots);
    if (res && codexFill(res.id)) UI.toast(`Resonance: ${res.name}. The Codex fills in`, 'legendary');
    if (res) Story.say('resonance');
    afterChange();
  },
  slotEmpty: () => { const c = UI.card, it = c.item, st = it.slots[c.slot]; if (!st) return; it.slots[c.slot] = null; Save.data.items.push(st); afterChange(); },
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

// Breaks a piece down into `stash`: a module into threads (a legendary at
// home: the forge remembers its power), a base into ore (and an exotic now
// and then), its stones and modules out whole into `list`. Returns what it
// gave.
function salvageInto(it, list, stash, field) {
  const got = {}, add = (k, n) => { if (!n) return; stash[k] = (stash[k] || 0) + n; got[k] = (got[k] || 0) + n; };
  if (it.kind === 'module') {
    add('thread', salvageThreads(it));
    const codex = Save.data.codex || (Save.data.codex = []);
    if (it.power && !field && !codex.includes(it.power)) { codex.push(it.power); UI.toast(`The forge remembers ${LEGENDARIES[it.power].name}: imprint it at the rune bench`, 'legendary'); }
    Story.say('unravel');
    return got;
  }
  const y = salvageYield(Save.rng(), it);
  for (const st of it.slots || []) if (st) list.push(st);
  for (const m of it.sockets || []) if (m) list.push(m);
  add(y.ore, y.n);
  if (y.exotic) add(y.exotic, 1);
  return got;
}
