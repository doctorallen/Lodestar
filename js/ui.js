'use strict';
// ---------------------------------------------------------------------------
// The screens: the Lodestar (home) and its rooms (descend, the forge, gear,
// the star), the cargo and pause screens mid-dive, and the item card that
// opens over any of them. Also the top bar, the deck's button labels and
// toasts. Opening a screen sets Game.modal, which stops the simulation, and
// calls Input.block(); a screen's buttons ignore taps for its first 400 ms.
// Buttons say what they do with data-act (and data-arg); one handler per
// screen runs them, and the screen redraws.
// ---------------------------------------------------------------------------

function setTextIfChanged(id, s) { const el = $(id); if (el.textContent !== s) el.textContent = s; }
const esc = escapeHtml;

// "12 Ferrite, 2 Voltaic crystal"
function stuffLines(stash) {
  const names = T.ores.map((o) => [o.id, o.name]).concat(T.exotics.map((x) => [x.id, x.name]));
  return names.filter(([id]) => stash[id]).map(([id, name]) => `${stash[id]} ${name}`).join(', ');
}
const exoticName = (id) => T.exotics.find((x) => x.id === id).name;

function iconImg(item, cls = 'icon') { return `<img class="${cls}" src="${itemIconUrl(item)}" alt="">`; }
function itemRow(item, act, arg, tag = '') {
  return `<button class="row" data-act="${act}" data-arg="${arg}">${iconImg(item)}<span class="row-text"><span class="row-name r-${item.rarity}">${esc(item.name)}</span><span class="row-sub">${esc(itemKindLine(item))}</span></span>${tag}</button>`;
}
// ▲ or ▼ against what's worn in the slot it would go in
function compareTag(item, equip) {
  const slot = compareSlot(equip, item);
  if (!slot) return '';
  const cur = equip[slot], a = itemWorth(item), b = itemWorth(cur);
  if (!cur || a > b * 1.05) return '<span class="tag up">▲</span>';
  if (a < b * 0.95) return '<span class="tag down">▼</span>';
  return '';
}

const UI = {
  openedAt: 0,
  screen: null,
  card: null, // { item, where, key, picking }
  forge: { ore: null, exotic: null },

  init() {
    for (const s of document.querySelectorAll('.screen')) s.addEventListener('click', (e) => UI.onTap(e));
    $('card').addEventListener('click', (e) => UI.onTap(e));
    $('btn-pause').addEventListener('click', () => { if (Game.scene === 'dive' && !Game.modal) UI.openPause(); });
    $('btn-cargo').addEventListener('click', () => { if (Game.scene === 'dive' && !Game.modal) UI.openCargo(); });
    $('build').textContent = BUILD_INFO;
    drawLodestar();
  },

  onTap(e) {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled || Game.realT - UI.openedAt < T.ui.tapGuard) return;
    const fn = UI.acts[el.dataset.act];
    if (fn) fn(el.dataset.arg);
  },

  show(id) {
    for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
    UI.screen = id;
    Game.modal = id;
    UI.openedAt = Game.realT;
    Input.block();
    UI.redraw();
  },

  close() {
    for (const s of document.querySelectorAll('.screen')) s.hidden = true;
    UI.closeCard();
    UI.screen = null;
    Game.modal = null;
    Input.block();
  },

  redraw() {
    const r = { 'screen-base': drawHub, 'screen-descend': drawDescend, 'screen-forge': drawForge, 'screen-gear': drawGear, 'screen-star': drawStar, 'screen-cargo': drawCargo }[UI.screen];
    if (r) r();
    if (UI.card) drawCard();
  },

  // report: how the last dive ended
  openBase(report) {
    UI.report = report || null;
    UI.show('screen-base');
  },
  openPause() { UI.show('screen-pause'); },
  openCargo() { UI.show('screen-cargo'); },

  openCard(item, where, key) {
    UI.card = { item, where, key, picking: null };
    $('card').hidden = false;
    UI.openedAt = Game.realT;
    drawCard();
  },
  closeCard() { UI.card = null; $('card').hidden = true; },

  // a hint shown once ever
  tip(id, msg) {
    const tips = Save.data.tips || (Save.data.tips = {});
    if (tips[id]) return;
    tips[id] = true;
    UI.toast(msg, 'tip');
  },

  toast(msg, kind) {
    const box = $('toasts'), el = document.createElement('div');
    el.className = 'toast' + (kind ? ' r-' + kind : '');
    el.textContent = msg;
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => el.remove(), 1800);
  },

  // the top bar and the deck, every step
  frame() {
    const d = Game.dive;
    document.body.classList.toggle('diving', !!d);
    if (!d) return;
    const p = d.p, st = d.stats;
    const hp = Math.max(0, p.hp / st.maxHp), ch = p.charge / st.maxCharge;
    const hpW = Math.round(hp * 100) + '%', chW = Math.round(ch * 100) + '%';
    if ($('hp-fill').style.width !== hpW) $('hp-fill').style.width = hpW;
    if ($('ch-fill').style.width !== chW) $('ch-fill').style.width = chW;
    setTextIfChanged('hp-text', String(Math.ceil(p.hp)));
    $('hud-hp').classList.toggle('warded', p.ward > 0);
    $('hud-hp').classList.toggle('hurt', p.hurtT > 0);
    $('hud-ch').classList.toggle('low', p.lowCharge > 0);
    setTextIfChanged('hud-depth', `${T.biomes[d.biome].name.replace('The ', '').toUpperCase()} ${d.depth}`);
    setTextIfChanged('btn-cargo', `CARGO ${cargoUsed(d)}/${st.cargo}`);
    const eq = Save.data.equip;
    setTextIfChanged('btn-main', eq.main ? (eq.main.kind === 'focus' ? 'CAST' : 'SWING') : 'PUNCH');
    setTextIfChanged('btn-off', eq.off ? (eq.off.kind === 'focus' ? 'CAST' : 'SWING') : '');
    if ($('btn-off').hidden !== !eq.off) $('btn-off').hidden = !eq.off;
    const a = !Game.modal ? actionHere() : null, btn = $('btn-act');
    setTextIfChanged('btn-act', a === 'descend' ? 'DESCEND' : a === 'extract' ? 'EXTRACT' : '');
    if (btn.hidden !== !a) btn.hidden = !a;
  },
};

// ---------------------------------------------------------------------------
// The Lodestar
// ---------------------------------------------------------------------------
function drawHub() {
  const s = Save.data, mag = magnitudeOf(s.star), next = T.star.levels[mag];
  const r = UI.report;
  let report = '';
  if (r) {
    const where = `${T.biomes[r.biome].name}, depth ${r.depth}`;
    const got = [stuffLines(r.banked || r.lost || {}), r.items && r.items.length ? `${r.items.length} piece${r.items.length > 1 ? 's' : ''} of gear` : ''].filter(Boolean).join(' and ');
    if (r.banked) report = got ? `Pulled home from ${where}. Banked ${got}.` : `Pulled home from ${where}, empty-handed.`;
    else if (r.died) report = got ? `You fell in ${where}. Lost ${got}.` : `You fell in ${where}.`;
    else report = got ? `You gave up in ${where}. Lost ${got}.` : `You gave up in ${where}.`;
  }
  const pts = attunePointsLeft(s);
  $('hub-body').innerHTML = `
    <div class="mag">MAGNITUDE ${mag}${next !== undefined ? `<div class="bar"><div style="width:${Math.round(((s.star - T.star.levels[mag - 1]) / (next - T.star.levels[mag - 1])) * 100)}%"></div></div>` : ''}</div>
    <p class="report">${esc(report)}</p>
    ${s.dives === 0 ? `<p class="note intro">A fallen star hangs over the sinkhole. Descend into the Rim, mine the glowing ore, and fight what finds you. To bring the haul home, stand in a lodeline's gold beam and tap EXTRACT. Fall, and everything in your cargo is lost.</p>` : ''}
    <div class="menu">
      <button class="btn primary" data-act="go" data-arg="screen-descend">DESCEND</button>
      <button class="btn" data-act="go" data-arg="screen-forge">FORGE</button>
      <button class="btn" data-act="go" data-arg="screen-gear">GEAR${s.items.some((i) => i.kind === 'relic') ? ' <span class="dot-new"></span>' : ''}</button>
      <button class="btn" data-act="go" data-arg="screen-star">THE STAR${pts > 0 ? ' <span class="dot-new"></span>' : ''}</button>
    </div>`;
}

function drawDescend() {
  const s = Save.data;
  $('descend-body').innerHTML = T.biomes.map((b, i) => {
    const open = biomeOpen(s, i), deep = s.deepest[b.id] || 0;
    const ores = b.ores.map((id) => T.ores[ORE_INDEX[id]].name).join(' and ');
    return `<button class="row biome" data-act="dive" data-arg="${i}" ${open ? '' : 'disabled'}>
      <span class="row-text"><span class="row-name">${esc(b.name)}</span><span class="row-sub">${open ? `${ores}${deep ? ` · deepest ${deep}` : ''}` : `The star's lines reach here at magnitude ${T.star.biomeAt[i]}`}</span></span></button>`;
  }).join('') + `<p class="note">Lodelines are sure on every floor down to depth ${lodelineReach()}. Below that, not every floor has one.</p>`;
}

function drawForge() {
  const s = Save.data, F = UI.forge;
  if (!F.ore || !s.stash[F.ore]) F.ore = (T.ores.find((o) => s.stash[o.id]) || T.ores[0]).id;
  if (F.exotic && !s.stash[F.exotic]) F.exotic = null;
  const ore = T.ores[ORE_INDEX[F.ore]], have = s.stash[F.ore] || 0;
  const chips = T.ores.filter((o) => s.stash[o.id]).map((o) => `<button class="chip ${o.id === F.ore ? 'on' : ''}" data-act="forgeOre" data-arg="${o.id}">${esc(o.name)} ${s.stash[o.id]}</button>`).join('') || '<span class="note">No ore banked yet. Mine some and bring it home.</span>';
  const ex = T.exotics.filter((x) => s.stash[x.id]).map((x) => `<button class="chip ${x.id === F.exotic ? 'on' : ''}" data-act="forgeExotic" data-arg="${x.id}">${esc(x.name)} ${s.stash[x.id]}</button>`).join('');
  const recipe = (kind, label, cost, sub) => `<button class="row recipe" data-act="craft" data-arg="${kind}" ${have >= cost ? '' : 'disabled'}><span class="row-text"><span class="row-name">${label}</span><span class="row-sub">${sub}</span></span><span class="cost">${cost}</span></button>`;
  const breaks = T.ores.find((o) => o.tier === ore.tier + 1);
  $('forge-body').innerHTML = `
    <div class="chips">${chips}</div>
    ${ex ? `<h3>ADD AN EXOTIC</h3><div class="chips">${ex}</div><p class="note">${F.exotic ? exoticHint(F.exotic) : 'Tap one to work it into the next piece.'}</p>` : ''}
    <h3>GEAR, IN ${esc(ore.name.toUpperCase())}</h3>
    ${recipe('blade', 'Blade', craftCost('blade'), 'Melee. Swings at what is in front of you.')}
    ${recipe('focus', 'Focus', craftCost('focus'), 'Magic. Casts the cores socketed in it.')}
    ${recipe('armor', 'Plate', craftCost('armor'), 'Armor and health.')}
    ${recipe('charm', 'Charm', craftCost('charm'), 'Affixes of any kind.')}
    ${recipe('pick', `${esc(ore.name)} Pick`, craftCost('pick'), breaks ? `Breaks up to ${esc(breaks.name)}.` : 'The finest pick there is.')}
    <h3>SPELL CORES</h3>
    ${CORE_IDS.map((c) => recipe('core:' + c, CORES[c].name, craftCost('core'), esc(CORES[c].text) + '.')).join('')}
    <p class="note">Every piece rolls its own affixes. The cost is in the ore chosen above.</p>`;
}
function exoticHint(id) {
  const x = T.exotics.find((e) => e.id === id);
  return x.family ? `${esc(x.name)}: the piece is sure to roll a ${x.family} affix.` : `${esc(x.name)}: the piece comes out a rarity higher.`;
}

function drawGear() {
  const s = Save.data, st = computeStats(s.equip, s.attune);
  const slots = SLOTS.map((k) => {
    const it = s.equip[k];
    return it ? itemRow(it, 'cardEquip', k, `<span class="slot">${SLOT_NAMES[k]}</span>`)
      : `<div class="row empty"><span class="row-text"><span class="row-name">Empty</span><span class="row-sub">${SLOT_NAMES[k]}</span></span></div>`;
  }).join('');
  const kinds = ['relic', 'blade', 'focus', 'armor', 'charm', 'pick', 'core'];
  const stash = s.items.slice().sort((a, b) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind) || b.tier - a.tier)
    .map((it) => itemRow(it, 'cardStash', it.uid, compareTag(it, s.equip))).join('');
  $('gear-body').innerHTML = `
    <div class="stats">${statLine(st)}</div>
    <h3>WORN</h3>${slots}
    <h3>STASH</h3>${stash || '<p class="note">Nothing banked. Gear you bring home lands here.</p>'}
    <h3>MATERIALS</h3><p class="note">${esc(stuffLines(s.stash)) || 'None.'}</p>`;
}
function statLine(st) {
  const bits = [`${st.maxHp} health`, `${st.armor} armor`, `${st.cargo} cargo`];
  if (st.meleeDmg) bits.push(`+${Math.round(st.meleeDmg)}% melee`);
  if (st.spellDmg) bits.push(`+${Math.round(st.spellDmg)}% spells`);
  if (st.crit) bits.push(`${Math.round(st.crit)}% crit`);
  if (st.moveSpeed) bits.push(`+${Math.round(st.moveSpeed)}% speed`);
  if (st.mineSpeed) bits.push(`+${Math.round(st.mineSpeed)}% mining`);
  return bits.join(' · ');
}

function drawStar() {
  const s = Save.data, mag = magnitudeOf(s.star), next = T.star.levels[mag], pts = attunePointsLeft(s);
  const feed = T.ores.filter((o) => s.stash[o.id]).map((o) => `<div class="row static"><span class="row-text"><span class="row-name">${esc(o.name)} × ${s.stash[o.id]}</span><span class="row-sub">${orePoints(o.id)} point${orePoints(o.id) > 1 ? 's' : ''} each</span></span>
      <button class="mini" data-act="feed" data-arg="${o.id}:10">FEED 10</button><button class="mini" data-act="feed" data-arg="${o.id}:all">ALL</button></div>`).join('');
  const nextBiome = T.biomes.find((b, i) => T.star.biomeAt[i] > mag);
  const att = Object.entries(T.attune).map(([id, A]) => {
    const r = s.attune[id] || 0;
    return `<div class="row static"><span class="row-text"><span class="row-name">${A.name} ${r}/${A.max}</span><span class="row-sub">${A.text} a rank</span></span><button class="mini" data-act="attune" data-arg="${id}" ${pts > 0 && r < A.max ? '' : 'disabled'}>+</button></div>`;
  }).join('');
  $('star-body').innerHTML = `
    <div class="mag">MAGNITUDE ${mag}${next !== undefined ? ` · ${s.star}/${next}` : ''}</div>
    <p class="note">Ore fed to the star makes it grow. Each magnitude reaches its lines a floor deeper and gives an attunement point.${nextBiome ? ` At magnitude ${T.star.biomeAt[T.biomes.indexOf(nextBiome)]} its lines reach ${esc(nextBiome.name)}.` : ''}</p>
    <h3>FEED THE STAR</h3>${feed || '<p class="note">No ore banked.</p>'}
    <h3>ATTUNEMENTS · ${pts} POINT${pts === 1 ? '' : 'S'}</h3>${att}`;
}

function drawCargo() {
  const d = Game.dive;
  if (!d) return;
  const items = d.items.map((it) => itemRow(it, 'cardCargo', it.uid, compareTag(it, Save.data.equip))).join('');
  const worn = SLOTS.filter((k) => Save.data.equip[k]).map((k) => itemRow(Save.data.equip[k], 'cardWorn', k, `<span class="slot">${SLOT_NAMES[k]}</span>`)).join('');
  $('cargo-body').innerHTML = `
    <div class="mag">CARGO ${cargoUsed(d)}/${d.stats.cargo}</div>
    <p class="note">${esc(stuffLines(d.cargo)) || 'No ore yet.'}</p>
    <h3>FOUND</h3>${items || '<p class="note">No gear yet.</p>'}
    <h3>WORN</h3>${worn}
    <p class="note">What you wear is safe. Everything in the cargo is lost if you fall.</p>`;
}

// ---------------------------------------------------------------------------
// The item card
// ---------------------------------------------------------------------------

// where: 'stash' | 'equip' (at home) | 'cargo' | 'worn' (mid-dive) ; key:
// the uid or slot
function drawCard() {
  const c = UI.card, it = c.item, home = c.where === 'stash' || c.where === 'equip';
  const s = Save.data, oreId = runeOre(it), oreHave = s.stash[oreId] || 0, R = T.runes;
  const runes = home && it.kind !== 'core' && it.kind !== 'relic' && !(it.kind === 'pick' && it.tier === 0);
  const affixes = it.affixes.map((a, i) => `<li><span>${esc(fmtAffix(a))}</span>${runes ? `<span class="rune">
      <button class="mini" data-act="reroll" data-arg="${i}" ${oreHave >= R.reroll ? '' : 'disabled'}>↻ ${R.reroll}</button>
      <button class="mini" data-act="upgrade" data-arg="${i}" ${oreHave >= R.upgrade && a.up < 2 ? '' : 'disabled'}>▲ ${R.upgrade}</button></span>` : ''}</li>`).join('');
  let extra = '';
  if (it.power) extra += `<p class="power">★ ${esc(LEGENDARIES[it.power].text)}</p>`;
  if (it.set) {
    const n = computeStats(s.equip, s.attune).sets[it.set] || 0, S = SETS[it.set];
    extra += `<p class="set">${esc(S.name)} (${n}/3 worn)<br>2: ${esc(S.bonus2.text)}<br>3: ${esc(S.bonus3.text)}</p>`;
  }
  if (it.sockets) {
    extra += '<div class="sockets">' + it.sockets.map((core, i) => core
      ? `<div class="sock">◆ ${esc(core.name)} (tier ${core.tier}) ${home ? `<button class="mini" data-act="unsocket" data-arg="${i}">REMOVE</button>` : ''}</div>`
      : `<div class="sock">◇ Empty socket ${home ? `<button class="mini" data-act="pickCore" data-arg="${i}" ${s.items.some((x) => x.kind === 'core') ? '' : 'disabled'}>SOCKET</button>` : ''}</div>`).join('') + '</div>';
    if (c.picking !== null) {
      const cores = s.items.filter((x) => x.kind === 'core');
      extra += '<div class="picker">' + cores.map((x) => `<button class="mini wide" data-act="socket" data-arg="${x.uid}">${esc(x.name)} · tier ${x.tier}</button>`).join('') + '</div>';
    }
  }
  const acts = [];
  const handBtns = (act) => [`<button class="btn" data-act="${act}" data-arg="main">MAIN HAND</button>`, `<button class="btn" data-act="${act}" data-arg="off">OFF HAND</button>`];
  const slotOf = KIND_SLOT[it.kind];
  if (c.where === 'stash') {
    if (it.kind === 'relic') acts.push('<button class="btn primary" data-act="unseal">UNSEAL</button>');
    else if (slotOf === 'hand') acts.push(...handBtns('equip'));
    else if (slotOf) acts.push(`<button class="btn primary" data-act="equip" data-arg="${slotOf}">EQUIP</button>`);
    if (it.kind !== 'relic') acts.push('<button class="btn danger" data-act="salvage">SALVAGE</button>');
  } else if (c.where === 'equip') acts.push('<button class="btn" data-act="unequip">UNEQUIP</button>');
  else if (c.where === 'cargo') {
    if (slotOf === 'hand') acts.push(...handBtns('equip'));
    else if (slotOf) acts.push(`<button class="btn primary" data-act="equip" data-arg="${slotOf}">EQUIP</button>`);
    acts.push('<button class="btn danger" data-act="drop">DROP</button>');
  }
  if (runes && canAddAffix(it)) acts.push(`<button class="btn" data-act="addAffix" ${oreHave >= R.add ? '' : 'disabled'}>ADD AFFIX · ${R.add}</button>`);
  const runeNote = runes ? `<p class="note">Rune work costs ${esc(oreOfTier(it.tier).name)} (you have ${oreHave}).</p>` : '';
  const cmp = (c.where === 'stash' || c.where === 'cargo') ? compareTag(it, s.equip) : '';
  $('card-body').innerHTML = `
    <div class="card-head">${iconImg(it, 'icon big')}<div><div class="card-name r-${it.rarity}">${esc(it.name)} ${cmp}</div><div class="row-sub">${esc(itemKindLine(it))}</div></div></div>
    <p class="base">${esc(itemBaseLine(it))}</p>
    ${affixes ? `<ul class="affixes">${affixes}</ul>` : ''}
    ${extra}${runeNote}
    <div class="menu">${acts.join('')}<button class="btn" data-act="closeCard">BACK</button></div>`;
}

// ---------------------------------------------------------------------------
// What the buttons do
// ---------------------------------------------------------------------------
function findStash(uid) { return Save.data.items.find((i) => String(i.uid) === String(uid)); }
function removeFrom(list, item) { const i = list.indexOf(item); if (i >= 0) list.splice(i, 1); }
function spendOre(id, n) { const s = Save.data.stash; if ((s[id] || 0) < n) return false; s[id] -= n; if (!s[id]) delete s[id]; return true; }
function afterChange() { if (!Game.dive) Save.save(); else refreshDiveStats(); UI.redraw(); }

UI.acts = {
  go: (id) => UI.show(id),
  back: () => UI.show('screen-base'),
  resume: () => UI.close(),
  abandon: () => abandonDive(),
  dive: (i) => { UI.close(); startDive(Number(i)); },
  closeCard: () => { UI.closeCard(); UI.redraw(); },
  cardEquip: (slot) => UI.openCard(Save.data.equip[slot], 'equip', slot),
  cardStash: (uid) => UI.openCard(findStash(uid), 'stash', uid),
  cardCargo: (uid) => UI.openCard(Game.dive.items.find((i) => String(i.uid) === uid), 'cargo', uid),
  cardWorn: (slot) => UI.openCard(Save.data.equip[slot], 'worn', slot),

  forgeOre: (id) => { UI.forge.ore = id; UI.redraw(); },
  forgeExotic: (id) => { UI.forge.exotic = UI.forge.exotic === id ? null : id; UI.redraw(); },
  craft: (what) => {
    const F = UI.forge, rng = Save.rng();
    const [kind, core] = what.split(':');
    if (!spendOre(F.ore, craftCost(kind))) return;
    const tier = T.ores[ORE_INDEX[F.ore]].tier;
    let item;
    if (kind === 'core') item = makeCore(rng, core, tier);
    else {
      const ex = F.exotic && spendOre(F.exotic, 1) ? F.exotic : null;
      item = forgeItem(rng, kind, F.ore, ex);
      F.exotic = null;
    }
    Save.data.items.push(item);
    Save.save();
    UI.openCard(item, 'stash', item.uid);
    UI.redraw();
  },

  equip: (slot) => {
    const c = UI.card, it = c.item, eq = Save.data.equip;
    const list = c.where === 'cargo' ? Game.dive.items : Save.data.items;
    removeFrom(list, it);
    if (eq[slot]) list.push(eq[slot]);
    eq[slot] = it;
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
    d.drops.push({ x: d.p.x, y: d.p.y, t: 0, item: it, warned: true });
    UI.closeCard();
    UI.redraw();
  },
  salvage: () => {
    const it = UI.card.item, y = salvageYield(Save.rng(), it), s = Save.data.stash;
    for (const core of it.sockets || []) if (core) Save.data.items.push(core);
    removeFrom(Save.data.items, it);
    s[y.ore] = (s[y.ore] || 0) + y.n;
    if (y.exotic) s[y.exotic] = (s[y.exotic] || 0) + 1;
    UI.toast(`+${y.n} ${T.ores[ORE_INDEX[y.ore]].name}${y.exotic ? `, +1 ${exoticName(y.exotic)}` : ''}`);
    UI.closeCard();
    afterChange();
  },
  unseal: () => {
    const relic = UI.card.item, item = unsealRelic(Save.rng(), relic);
    removeFrom(Save.data.items, relic);
    Save.data.items.push(item);
    Save.save();
    UI.openCard(item, 'stash', item.uid);
    UI.redraw();
  },
  reroll: (i) => { const it = UI.card.item; if (spendOre(runeOre(it), T.runes.reroll)) { rerollAffix(Save.rng(), it, Number(i)); afterChange(); } },
  upgrade: (i) => { const it = UI.card.item; if (it.affixes[i].up < 2 && spendOre(runeOre(it), T.runes.upgrade)) { upgradeAffix(it, Number(i)); afterChange(); } },
  addAffix: () => { const it = UI.card.item; if (canAddAffix(it) && spendOre(runeOre(it), T.runes.add)) { addAffix(Save.rng(), it); afterChange(); } },
  pickCore: (i) => { UI.card.picking = Number(i); UI.redraw(); },
  socket: (uid) => {
    const c = UI.card, core = findStash(uid);
    if (!core || c.picking === null) return;
    removeFrom(Save.data.items, core);
    c.item.sockets[c.picking] = core;
    c.picking = null;
    afterChange();
  },
  unsocket: (i) => {
    const it = UI.card.item, core = it.sockets[i];
    if (!core) return;
    it.sockets[i] = null;
    Save.data.items.push(core);
    afterChange();
  },

  feed: (arg) => {
    const [id, n] = arg.split(':'), s = Save.data, before = magnitudeOf(s.star);
    const k = n === 'all' ? s.stash[id] || 0 : Math.min(10, s.stash[id] || 0);
    if (!k || !spendOre(id, k)) return;
    s.star += k * orePoints(id);
    const after = magnitudeOf(s.star);
    if (after > before) UI.toast(`The Lodestar grows: magnitude ${after}`, 'legendary');
    afterChange();
  },
  attune: (id) => {
    const s = Save.data;
    if (attunePointsLeft(s) <= 0 || (s.attune[id] || 0) >= T.attune[id].max) return;
    s.attune[id] = (s.attune[id] || 0) + 1;
    afterChange();
  },
};

// The Lodestar on the home screen.
function drawLodestar() {
  const star = spriteFrom(LODESTAR_ROWS, LODESTAR_PAL);
  const c = $('star'), x = c.getContext('2d');
  c.width = star.width; c.height = star.height;
  x.drawImage(star, 0, 0);
}
