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
const stuffIds = () => T.ores.map((o) => o.id).concat(T.exotics.map((x) => x.id));
const stuffName = (id) => (ORE_INDEX[id] !== undefined ? T.ores[ORE_INDEX[id]].name : exoticName(id));

function iconImg(item, cls = 'icon') { return `<img class="${cls}" src="${itemIconUrl(item)}" alt="">`; }
function itemRow(item, act, arg, tag = '') {
  return `<button class="row" data-act="${act}" data-arg="${arg}">${iconImg(item)}<span class="row-text"><span class="row-name r-${item.rarity}">${item.fav ? '★ ' : ''}${esc(item.name)}</span><span class="row-sub">${esc(itemKindLine(item))}</span></span>${tag}</button>`;
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
    $('btn-pause').addEventListener('click', () => { if (Game.dive && !Game.modal) UI.openPause(); });
    $('btn-cargo').addEventListener('click', () => { if (Game.dive && !Game.dive.hub && !Game.modal) UI.openCargo(); });
    $('build').textContent = BUILD_INFO;
    // the anvil takes a tap anywhere; the reveal, a tap once it has risen
    $('screen-anvil').addEventListener('pointerdown', (e) => { if (e.target.closest('[data-act]')) return; e.preventDefault(); if (Game.realT - UI.openedAt > 0.3) Anvil.strike(); });
    $('screen-reveal').addEventListener('pointerdown', (e) => { e.preventDefault(); if (Game.realT - Reveal.shownAt > 0.7) Reveal.done(); });
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
    const r = { 'screen-report': drawReport, 'screen-descend': drawDescend, 'screen-forge': drawForge, 'screen-gear': drawGear, 'screen-star': drawStar, 'screen-cargo': drawCargo }[UI.screen];
    if (r) r();
    if (UI.card) drawCard();
  },

  // report: how the last dive ended
  openReport(report) {
    UI.report = report;
    UI.show('screen-report');
  },

  // Walking up to a station in the outpost (or an ancient forge in a dive).
  useStation(id) {
    if (id === 'forge' || id === 'fieldForge') { UI.forge.field = id === 'fieldForge'; UI.show('screen-forge'); }
    else if (id === 'altar') UI.show('screen-star');
    else if (id === 'locker') { UI.gearRunes = false; UI.show('screen-gear'); }
    else if (id === 'runes') { UI.gearRunes = true; UI.show('screen-gear'); }
    else if (id === 'descend') UI.show('screen-descend');
  },
  openPause() {
    const home = !!(Game.dive && Game.dive.hub);
    $('pause-cargo').hidden = home; $('pause-abandon').hidden = home; $('pause-note').hidden = home; $('pause-recall').hidden = home;
    if (!home) $('pause-recall').textContent = `EMERGENCY RECALL · LOSE ${Math.round(recallCost(Game.dive) * 100)}%`;
    UI.show('screen-pause');
  },
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
    document.body.classList.toggle('home', !!(d && d.hub));
    if (Game.modal === 'screen-reveal' && Reveal.item && Game.realT - Reveal.shownAt > 2.2) Reveal.done();
    if (!d) return;
    if (d.hub) {
      setTextIfChanged('hud-depth', `THE LODESTAR · MAGNITUDE ${magnitudeOf(Save.data.star)}`);
    }
    const p = d.p, st = d.stats;
    const hp = Math.max(0, p.hp / st.maxHp), ch = p.charge / st.maxCharge;
    const hpW = Math.round(hp * 100) + '%', chW = Math.round(ch * 100) + '%';
    if ($('hp-fill').style.width !== hpW) $('hp-fill').style.width = hpW;
    if ($('ch-fill').style.width !== chW) $('ch-fill').style.width = chW;
    const pW = Math.round(d.pull * 100) + '%';
    if ($('pull-fill').style.width !== pW) $('pull-fill').style.width = pW;
    $('hud-pull').classList.toggle('fading', d.pull < T.pull.dimAt);
    $('hud-pull').classList.toggle('dark', !!d.padDark);
    setTextIfChanged('hp-text', String(Math.ceil(p.hp)));
    $('hud-hp').classList.toggle('warded', p.ward > 0);
    $('hud-hp').classList.toggle('hurt', p.hurtT > 0);
    $('hud-ch').classList.toggle('low', p.lowCharge > 0);
    if (!d.hub) setTextIfChanged('hud-depth', `${T.biomes[d.biome].name.replace('The ', '').toUpperCase()} ${d.depth}`);
    setTextIfChanged('btn-cargo', `CARGO ${cargoUsed(d)}/${st.cargo}`);
    const eq = Save.data.equip;
    for (const slot of ['main', 'off']) {
      const it = eq[slot], btn = $('btn-' + slot), key = it ? it.uid + ':' + it.kind : 'none';
      if (btn.dataset.key !== key) {
        btn.dataset.key = key;
        btn.innerHTML = it ? `<img class="btn-icon" src="${itemIconUrl(it)}" alt=""><span>${it.kind === 'focus' ? 'CAST' : 'SWING'}</span>` : '<span>PUNCH</span>';
      }
      const h = p.hands[slot], lv = h.holding ? chargeLevel(h) : 0;
      btn.classList.toggle('charging', lv > 0 && lv < 1);
      btn.classList.toggle('charged', lv >= 1);
    }
    if ($('btn-off').hidden !== !eq.off) $('btn-off').hidden = !eq.off;
    $('btn-dash').classList.toggle('cooling', p.dashCd > 0);
    const a = !Game.modal ? actionHere() : null, btn = $('btn-act');
    setTextIfChanged('btn-act', { descend: 'DESCEND', extract: 'EXTRACT', forge: 'FORGE', runes: 'RUNES', locker: 'GEAR', altar: 'THE STAR' }[a] || '');
    if (d.channel) setTextIfChanged('hud-depth', d.channel.kind === 'recall' ? 'RECALLING…' : 'RISING…');
    if (btn.hidden !== !a) btn.hidden = !a;
  },
};

// ---------------------------------------------------------------------------
// The Lodestar's rooms
// ---------------------------------------------------------------------------

// How the last dive ended, over the outpost.
function drawReport() {
  const r = UI.report;
  if (!r) return;
  const where = `${T.biomes[r.biome].name}, depth ${r.depth}`;
  const got = [stuffLines(r.banked || r.lost || {}), r.items && r.items.length ? `${r.items.length} piece${r.items.length > 1 ? 's' : ''} of gear` : ''].filter(Boolean).join(' and ');
  let title, text;
  if (r.banked) { title = 'PULLED HOME'; text = got ? `From ${where}. Banked ${got}.` : `From ${where}, empty-handed.`; }
  else if (r.died) { title = 'YOU FELL'; text = got ? `In ${where}. Lost ${got}.` : `In ${where}.`; }
  else { title = 'YOU GAVE UP'; text = got ? `In ${where}. Lost ${got}.` : `In ${where}.`; }
  if (r.recalled) {
    title = 'RECALLED';
    const lost = [stuffLines(r.recalled.lost), r.recalled.lostItems ? `${r.recalled.lostItems} piece${r.recalled.lostItems > 1 ? 's' : ''} of gear` : ''].filter(Boolean).join(' and ');
    text = `From ${where}. ${got ? `Banked ${got}.` : ''}${lost ? ` The dark kept ${lost}.` : ''}`;
  }
  if (r.kept && (r.kept.items.length || Object.keys(r.kept.stuff).length)) text += ` Your pocket kept ${[stuffLines(r.kept.stuff), r.kept.items.map((i) => i.name).join(', ')].filter(Boolean).join(' and ')}.`;
  if (r.fed) text += ` The lodeline fed the star ${r.fed}.`;
  if (r.grew) text += ` It grew to magnitude ${r.grew}.`;
  $('report-title').textContent = title;
  $('report-body').textContent = text;
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

// Where the forge draws its materials from: the stash at home, the cargo at
// an ancient forge.
function forgeSource() { return UI.forge.field && Game.dive ? Game.dive.cargo : Save.data.stash; }

function drawForge() {
  const stash = forgeSource(), F = UI.forge;
  $('forge-title').textContent = F.field ? 'AN ANCIENT FORGE' : 'THE FORGE';
  if (!F.ore || !stash[F.ore]) F.ore = (T.ores.find((o) => stash[o.id]) || T.ores[0]).id;
  if (F.exotic && !stash[F.exotic]) F.exotic = null;
  const ore = T.ores[ORE_INDEX[F.ore]], have = stash[F.ore] || 0;
  const chips = T.ores.filter((o) => stash[o.id]).map((o) => `<button class="chip ${o.id === F.ore ? 'on' : ''}" data-act="forgeOre" data-arg="${o.id}">${esc(o.name)} ${stash[o.id]}</button>`).join('') || `<span class="note">${F.field ? 'No ore in your cargo.' : 'No ore banked yet. Mine some and bring it home.'}</span>`;
  const ex = T.exotics.filter((x) => stash[x.id]).map((x) => `<button class="chip ${x.id === F.exotic ? 'on' : ''}" data-act="forgeExotic" data-arg="${x.id}">${esc(x.name)} ${stash[x.id]}</button>`).join('');
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
    <p class="note">Every piece rolls its own affixes. Strike the anvil well and the odds of a rare one rise.${F.field ? ' What you forge here goes in your cargo.' : ''}</p>`;
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
  $('gear-title').textContent = UI.gearRunes ? 'THE RUNE BENCH' : 'GEAR';
  $('gear-body').innerHTML = `
    ${UI.gearRunes ? '<p class="note">Tap a piece to rework its affixes: reroll one, raise one, or add one.</p>' : ''}
    <div class="stats">${statLine(st)}</div>
    <h3>WORN</h3>${slots}
    <h3>STASH</h3>${stash || '<p class="note">Nothing banked. Gear you bring home lands here.</p>'}
    ${downgrades().length ? `<div class="menu"><button class="btn danger" data-act="salvageAll">${UI.salvageAllArmed ? `TAP AGAIN: SALVAGE ${downgrades().length}` : `SALVAGE ALL ▼ (${downgrades().length})`}</button></div><p class="note">Breaks down every piece marked ▼ that isn't kept (★). Cores and relics are left alone.</p>` : ''}
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
  const stuff = stuffIds().filter((id) => d.cargo[id]).map((id) => `<button class="row" data-act="cardStuff" data-arg="${id}"><img class="icon" src="${stuffIconUrl(id)}" alt=""><span class="row-text"><span class="row-name">${esc(stuffName(id))} × ${d.cargo[id]}</span><span class="row-sub">${ORE_INDEX[id] !== undefined ? 'Ore' : 'Exotic material'} · weighs ${d.cargo[id]}</span></span></button>`).join('');
  const slots = pocketSlots(), pocket = d.pocket.map((e, i) => `<div class="row static">${e.item ? iconImg(e.item) : `<img class="icon" src="${stuffIconUrl(e.stuff)}" alt="">`}<span class="row-text"><span class="row-name ${e.item ? 'r-' + e.item.rarity : ''}">${esc(e.item ? e.item.name : `${stuffName(e.stuff)} × ${e.n}`)}</span><span class="row-sub">In the pocket</span></span><button class="mini" data-act="unpocket" data-arg="${i}">TAKE OUT</button></div>`).join('');
  $('cargo-body').innerHTML = `
    <div class="mag">CARGO ${cargoUsed(d)}/${d.stats.cargo}</div>
    <h3>POCKET · ${d.pocket.length}/${slots}</h3>
    ${pocket || '<p class="note">Empty. Whatever you pocket comes home even if you fall: tap something below to pocket it.</p>'}
    <h3>ORE AND MATERIALS</h3>${stuff || '<p class="note">No ore yet.</p>'}
    <h3>FOUND</h3>${items || '<p class="note">No gear yet.</p>'}
    <h3>WORN</h3>${worn}
    <p class="note">What you wear and what's in your pocket are safe. The rest of the cargo is lost if you fall.</p>
    <div class="menu"><button class="btn" data-act="recall">EMERGENCY RECALL · LOSE ${Math.round(recallCost(d) * 100)}%</button></div>`;
}

// ---------------------------------------------------------------------------
// The item card
// ---------------------------------------------------------------------------

// where: 'stash' | 'equip' (at home) | 'cargo' | 'worn' (mid-dive) ; key:
// the uid or slot
function drawCard() {
  const c = UI.card;
  if (c.stuff) { drawStuffCard(c.stuff); return; }
  const it = c.item, home = c.where === 'stash' || c.where === 'equip';
  const s = Save.data, oreId = runeOre(it), oreHave = s.stash[oreId] || 0, R = T.runes;
  const runes = home && it.kind !== 'core' && it.kind !== 'relic' && !(it.kind === 'pick' && it.tier === 0);
  const rollBar = (a) => { const r = affixRoll(a, it.tier); return `<span class="roll" title="How well it rolled"><span style="width:${Math.round(clamp(r, 0.04, 1) * 100)}%" class="${r > 1 ? 'over' : r > 0.8 ? 'high' : ''}"></span></span>`; };
  const affixes = it.affixes.map((a, i) => `<li><span class="aff">${esc(fmtAffix(a))}${rollBar(a)}</span>${runes ? `<span class="rune">
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
    if (it.kind !== 'relic' && !it.fav) acts.push('<button class="btn danger" data-act="salvage">SALVAGE</button>');
  } else if (c.where === 'equip') acts.push('<button class="btn" data-act="unequip">UNEQUIP</button>');
  else if (c.where === 'cargo') {
    if (slotOf === 'hand') acts.push(...handBtns('equip'));
    else if (slotOf) acts.push(`<button class="btn primary" data-act="equip" data-arg="${slotOf}">EQUIP</button>`);
    if (Game.dive.pocket.length < pocketSlots()) acts.push('<button class="btn" data-act="pocket">POCKET (SAFE IF YOU FALL)</button>');
    if (it.kind !== 'relic') acts.push('<button class="btn danger" data-act="salvage">SALVAGE</button>');
    acts.push('<button class="btn danger" data-act="drop">DROP</button>');
  }
  if (runes && canAddAffix(it)) acts.push(`<button class="btn" data-act="addAffix" ${oreHave >= R.add ? '' : 'disabled'}>ADD AFFIX · ${R.add}</button>`);
  const runeNote = runes ? `<p class="note">Rune work costs ${esc(oreOfTier(it.tier).name)} (you have ${oreHave}).</p>` : '';
  const cmp = (c.where === 'stash' || c.where === 'cargo') ? compareTag(it, s.equip) : '';
  // stat by stat against what's worn in its slot
  const slot = (c.where === 'stash' || c.where === 'cargo') && compareSlot(s.equip, it);
  if (slot) {
    const cur = s.equip[slot], lines = compareLines(it, cur);
    extra += `<div class="compare"><div class="row-sub">${cur ? `AGAINST ${esc(cur.name.toUpperCase())} (${SLOT_NAMES[slot].toUpperCase()})` : `${SLOT_NAMES[slot].toUpperCase()} IS EMPTY`}</div>${lines.map((l) => `<div class="${l.up ? 'up' : 'down'}">${l.up ? '▲' : '▼'} ${esc(l.text)}</div>`).join('') || '<div class="dim">No change</div>'}</div>`;
  }
  const canFav = it.kind !== 'relic' && (c.where === 'stash' || c.where === 'equip');
  const favBtn = canFav ? `<button class="mini fav ${it.fav ? 'on' : ''}" data-act="fav" title="Keep: never salvaged">${it.fav ? '★' : '☆'}</button>` : '';
  $('card-body').innerHTML = `
    <div class="card-head">${iconImg(it, 'icon big')}<div class="grow"><div class="card-name r-${it.rarity}">${esc(it.name)} ${cmp}</div><div class="row-sub">${esc(itemKindLine(it))}</div></div>${favBtn}</div>
    <p class="base">${esc(itemBaseLine(it))}</p>
    ${affixes ? `<ul class="affixes">${affixes}</ul>` : ''}
    ${extra}${runeNote}
    <div class="menu">${acts.join('')}<button class="btn" data-act="closeCard">BACK</button></div>`;
}

// Ore or an exotic in the cargo: how much, and dropping some.
function drawStuffCard(id) {
  const n = (Game.dive && Game.dive.cargo[id]) || 0, x = T.exotics.find((e) => e.id === id);
  const what = x ? (x.family ? `Worked into a piece at the forge, it's sure to roll a ${x.family} affix.` : 'Worked into a piece at the forge, it comes out a rarity higher.')
    : `Tier ${T.ores[ORE_INDEX[id]].tier} ore, worth ${orePoints(id)} to the star.`;
  $('card-body').innerHTML = `
    <div class="card-head"><img class="icon big" src="${stuffIconUrl(id)}" alt=""><div><div class="card-name">${esc(stuffName(id))} × ${n}</div><div class="row-sub">${x ? 'Exotic material' : 'Ore'} · in your cargo</div></div></div>
    <p class="base">${esc(what)}</p>
    <div class="menu">
      ${n && Game.dive.pocket.length < pocketSlots() ? `<button class="btn" data-act="pocket" data-arg="${T.cargo.pocketStack}">POCKET ${Math.min(n, T.cargo.pocketStack)} (SAFE IF YOU FALL)</button>` : ''}
      ${n ? `<button class="btn danger" data-act="dropStuff" data-arg="1">DROP 1</button>` : ''}
      ${n > 5 ? `<button class="btn danger" data-act="dropStuff" data-arg="5">DROP 5</button>` : ''}
      ${n > 1 ? `<button class="btn danger" data-act="dropStuff" data-arg="all">DROP ALL</button>` : ''}
      <button class="btn" data-act="closeCard">BACK</button>
    </div>`;
}

// Pieces in the stash worse than what's worn, not kept, not cores or relics.
function downgrades() {
  const s = Save.data;
  return s.items.filter((it) => !it.fav && it.kind !== 'core' && it.kind !== 'relic' && /down/.test(compareTag(it, s.equip)));
}

// ---------------------------------------------------------------------------
// What the buttons do
// ---------------------------------------------------------------------------
function findStash(uid) { return Save.data.items.find((i) => String(i.uid) === String(uid)); }
function removeFrom(list, item) { const i = list.indexOf(item); if (i >= 0) list.splice(i, 1); }
function spendOre(id, n) { const s = Save.data.stash; if ((s[id] || 0) < n) return false; s[id] -= n; if (!s[id]) delete s[id]; return true; }
function afterChange() { if (!Game.dive || Game.dive.hub) Save.save(); if (Game.dive) refreshDiveStats(); UI.redraw(); }

UI.acts = {
  go: (id) => UI.show(id),
  back: () => UI.close(),
  resume: () => UI.close(),
  abandon: () => abandonDive(),
  dive: (i) => { UI.close(); startDive(Number(i)); },
  closeReport: () => { UI.report = null; UI.close(); },
  recall: () => { UI.close(); startChannel('recall'); UI.toast('Hold still: recalling'); },
  // the pocket: what's in it comes home whatever happens
  pocket: (n) => {
    const d = Game.dive, c = UI.card;
    if (d.pocket.length >= pocketSlots()) return;
    if (c.stuff) {
      const k = Math.min(Number(n) || T.cargo.pocketStack, d.cargo[c.stuff] || 0);
      if (!k) return;
      d.cargo[c.stuff] -= k; if (!d.cargo[c.stuff]) delete d.cargo[c.stuff];
      d.pocket.push({ stuff: c.stuff, n: k });
    } else { removeFrom(d.items, c.item); d.pocket.push({ item: c.item }); }
    UI.closeCard(); UI.redraw();
  },
  unpocket: (i) => {
    const d = Game.dive, e = d.pocket[Number(i)];
    if (!e) return;
    d.pocket.splice(Number(i), 1);
    if (e.item) d.items.push(e.item); else d.cargo[e.stuff] = (d.cargo[e.stuff] || 0) + e.n;
    UI.redraw();
  },
  closeCard: () => { UI.closeCard(); UI.redraw(); },
  cardEquip: (slot) => UI.openCard(Save.data.equip[slot], 'equip', slot),
  cardStash: (uid) => UI.openCard(findStash(uid), 'stash', uid),
  cardCargo: (uid) => UI.openCard(Game.dive.items.find((i) => String(i.uid) === uid), 'cargo', uid),
  cardWorn: (slot) => UI.openCard(Save.data.equip[slot], 'worn', slot),
  cardStuff: (id) => { UI.card = { stuff: id, where: 'cargo' }; $('card').hidden = false; UI.openedAt = Game.realT; drawCard(); },
  dropStuff: (n) => {
    const d = Game.dive, id = UI.card.stuff, have = d.cargo[id] || 0, k = n === 'all' ? have : Math.min(have, Number(n));
    if (!k) return;
    d.cargo[id] -= k;
    if (!d.cargo[id]) delete d.cargo[id];
    d.drops.push({ x: d.p.x, y: d.p.y, t: 0, stuff: id, n: k, warned: true });
    if (!d.cargo[id]) UI.closeCard();
    UI.redraw();
  },

  forgeOre: (id) => { UI.forge.ore = id; UI.redraw(); },
  forgeExotic: (id) => { UI.forge.exotic = UI.forge.exotic === id ? null : id; UI.redraw(); },
  craft: (what) => {
    const F = UI.forge, src = forgeSource();
    const [kind, core] = what.split(':');
    if ((src[F.ore] || 0) < craftCost(kind)) return;
    src[F.ore] -= craftCost(kind);
    if (!src[F.ore]) delete src[F.ore];
    let exotic = null;
    if (kind !== 'core' && F.exotic && (src[F.exotic] || 0) > 0) { exotic = F.exotic; src[F.exotic]--; if (!src[F.exotic]) delete src[F.exotic]; }
    F.exotic = null;
    if (!F.field) Save.save();
    Anvil.start({ kind, core: kind === 'core' ? core : null, ore: F.ore, exotic, field: !!F.field });
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
  // at home into the stash; mid-dive into the cargo (what doesn't fit is
  // left on the floor)
  salvage: () => {
    const it = UI.card.item, y = salvageYield(Save.rng(), it), field = UI.card.where === 'cargo';
    const s = field ? Game.dive.cargo : Save.data.stash, list = field ? Game.dive.items : Save.data.items;
    for (const core of it.sockets || []) if (core) list.push(core);
    removeFrom(list, it);
    s[y.ore] = (s[y.ore] || 0) + y.n;
    if (y.exotic) s[y.exotic] = (s[y.exotic] || 0) + 1;
    if (field) {
      const d = Game.dive, over = cargoUsed(d) - d.stats.cargo;
      if (over > 0) { const k = Math.min(over, s[y.ore]); s[y.ore] -= k; if (!s[y.ore]) delete s[y.ore]; d.drops.push({ x: d.p.x, y: d.p.y, t: 0, stuff: y.ore, n: k, warned: true }); }
    }
    UI.toast(`+${y.n} ${T.ores[ORE_INDEX[y.ore]].name}${y.exotic ? `, +1 ${exoticName(y.exotic)}` : ''}`);
    UI.closeCard();
    afterChange();
  },
  unseal: () => {
    const relic = UI.card.item, item = unsealRelic(Save.rng(), relic);
    removeFrom(Save.data.items, relic);
    Save.data.items.push(item);
    Save.save();
    UI.closeCard();
    Reveal.show(item, 'stash', UI.screen);
  },
  reroll: (i) => { const it = UI.card.item; if (spendOre(runeOre(it), T.runes.reroll)) { rerollAffix(Save.rng(), it, Number(i)); afterChange(); } },
  upgrade: (i) => { const it = UI.card.item; if (it.affixes[i].up < 2 && spendOre(runeOre(it), T.runes.upgrade)) { upgradeAffix(it, Number(i)); afterChange(); } },
  addAffix: () => { const it = UI.card.item; if (canAddAffix(it) && spendOre(runeOre(it), T.runes.add)) { addAffix(Save.rng(), it); afterChange(); } },
  pickCore: (i) => { UI.card.picking = Number(i); UI.redraw(); },
  fav: () => { const it = UI.card.item; it.fav = !it.fav; afterChange(); },
  salvageAll: () => {
    if (!UI.salvageAllArmed) { UI.salvageAllArmed = true; UI.redraw(); setTimeout(() => { UI.salvageAllArmed = false; UI.redraw(); }, 3000); return; }
    UI.salvageAllArmed = false;
    const rng = Save.rng(), s = Save.data.stash, got = {};
    for (const it of downgrades()) {
      const y = salvageYield(rng, it);
      for (const core of it.sockets || []) if (core) Save.data.items.push(core);
      removeFrom(Save.data.items, it);
      s[y.ore] = (s[y.ore] || 0) + y.n; got[y.ore] = (got[y.ore] || 0) + y.n;
      if (y.exotic) { s[y.exotic] = (s[y.exotic] || 0) + 1; got[y.exotic] = (got[y.exotic] || 0) + 1; }
    }
    UI.toast('Salvaged for ' + stuffLines(got));
    afterChange();
  },
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
    Save.save();
    // out to the outpost, to watch the star drink it
    if (Game.dive && Game.dive.hub) { UI.close(); feedStarFx(Game.dive, k, after > before ? after : 0); }
    else UI.redraw();
  },
  attune: (id) => {
    const s = Save.data;
    if (attunePointsLeft(s) <= 0 || (s.attune[id] || 0) >= T.attune[id].max) return;
    s.attune[id] = (s.attune[id] || 0) + 1;
    afterChange();
  },
};

