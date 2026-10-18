'use strict';
// ---------------------------------------------------------------------------
// The screens: the Lodestar (home) and its rooms (setting out, the forge, gear,
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
  return stuffIds().filter((id) => stash[id]).map((id) => `${stash[id]} ${stuffName(id)}`).join(', ');
}
const exoticName = (id) => T.exotics.find((x) => x.id === id).name;
const stuffIds = () => T.ores.map((o) => o.id).concat(PART_STACK_IDS, T.exotics.map((x) => x.id));
const stuffName = (id) => (ORE_INDEX[id] !== undefined ? T.ores[ORE_INDEX[id]].name : parsePart(id) ? partName(id) : exoticName(id));

// A cost that can't be missed: the material's icon, how many and what,
// and how many there are, in red when it's short.
function costTag(id, n, have, name = stuffName(id)) {
  return `<span class="cost-tag${have < n ? ' short' : ''}"><img class="cost-icon" src="${stuffIconUrl(id)}" alt="">${n} ${esc(name)} <span class="cost-have">· have ${have}</span></span>`;
}

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
  forge: { bp: null, ore: null, part: null, exotic: null, field: false },

  init() {
    for (const s of document.querySelectorAll('.screen')) s.addEventListener('click', (e) => UI.onTap(e));
    // a tap on the dark round the card closes it, as ✕ does
    $('card').addEventListener('click', (e) => { if (e.target === $('card')) { if (Game.realT - UI.openedAt >= T.ui.tapGuard) UI.acts.closeCard(); } else UI.onTap(e); });
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
    // a destructive button asks once: the first tap arms it
    if (el.dataset.confirm && !el.classList.contains('armed')) {
      for (const o of document.querySelectorAll('.armed')) { o.classList.remove('armed'); o.textContent = o.dataset.label; }
      el.dataset.label = el.textContent;
      el.classList.add('armed'); el.textContent = el.dataset.confirm;
      UI.openedAt = Game.realT - T.ui.tapGuard + 0.25;
      return;
    }
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
    const r = { 'screen-resume': drawResume, 'screen-report': drawReport, 'screen-story': drawStory, 'screen-wreck': drawWreck_, 'screen-setout': drawSetOut, 'screen-forge': drawForge, 'screen-gear': drawGear, 'screen-star': drawStar, 'screen-cargo': drawCargo }[UI.screen];
    if (r) r();
    if (UI.card) drawCard();
  },

  // report: how the last dive ended
  openReport(report) {
    UI.report = report;
    $('toasts').innerHTML = '';
    UI.show('screen-report');
  },

  // Walking up to a station in the outpost (or an ancient forge in a dive).
  useStation(id) {
    if (id === 'forge' || id === 'fieldForge') { UI.forge.field = id === 'fieldForge'; UI.show('screen-forge'); }
    else if (id === 'altar') {
      if (Story.setShards()) { feedStarFx(Game.dive, 40, 0); return; }
      UI.show('screen-star');
    }
    else if (id === 'locker') { UI.gearRunes = false; UI.show('screen-gear'); }
    else if (id === 'runes') { UI.gearRunes = true; UI.show('screen-gear'); }
    else if (id === 'setout') UI.show('screen-setout');
    else if (id === 'wreck') UI.show('screen-wreck');
  },
  openPause() {
    const home = !!(Game.dive && Game.dive.hub);
    $('pause-cargo').hidden = home; $('pause-abandon').hidden = home; $('pause-note').hidden = home; $('pause-recall').hidden = home;
    $('pause-beacon').hidden = home || Game.dive.tool !== 'beacon' || !!Game.dive.beaconUsed || !!Game.dive.beacon;
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

  // Someone speaking: Wick, or the star. Lines wait their turn.
  // A line spoken, queued behind any still being said. Lines wait while a
  // screen is open, so none is lost under a menu.
  speak(who, text, style = 'wick') {
    UI.lines = UI.lines || [];
    UI.lines.push({ who, text, style, t: 2.6 + text.length * 0.045 });
  },
  updateSpeech(dt) {
    const l = UI.lines && UI.lines[0], box = $('speech');
    if (!l || Game.modal) { if (!box.hidden) box.hidden = true; return; }
    if (box.hidden || box.dataset.line !== l.text) {
      box.hidden = false;
      box.className = 'speech ' + l.style;
      box.innerHTML = `<b>${esc(l.who)}</b> ${esc(l.text)}`;
      box.dataset.line = l.text;
    }
    if ((l.t -= dt) <= 0) UI.lines.shift();
  },

  // A story told in panels, a tap each; then `done`.
  openStory(lines, done) {
    UI.story = { lines, i: 0, done };
    UI.show('screen-story');
  },

  // a hint shown once ever
  tip(id, msg) {
    const tips = Save.data.tips || (Save.data.tips = {});
    if (tips[id]) return;
    tips[id] = true;
    UI.toast(msg, 'tip');
  },

  toast(msg, kind) {
    const box = $('toasts');
    // the same words twice at once read as a stutter: the newer one only
    for (const o of box.children) if (o.textContent === msg) o.remove();
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' r-' + kind : '');
    el.textContent = msg;
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => el.remove(), 1800);
  },

  // the top bar and the deck, every step
  frame(dt) {
    const d = Game.dive;
    UI.updateSpeech(dt || 0);
    document.body.classList.toggle('modal', !!Game.modal);
    document.body.classList.toggle('rapt', Game.modal === 'screen-anvil' || Game.modal === 'screen-reveal' || Game.modal === 'screen-story');
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
    $('hud-pull').classList.toggle('dark', d.pull <= 0);
    setTextIfChanged('hp-text', String(Math.ceil(p.hp)));
    $('hud-hp').classList.toggle('warded', p.ward > 0);
    $('hud-hp').classList.toggle('hurt', p.hurtT > 0);
    $('hud-ch').classList.toggle('low', p.lowCharge > 0);
    if (!d.hub) setTextIfChanged('hud-depth', `${T.zones[d.zone].name.toUpperCase()} ${d.depth}/${T.expedition.sites}`);
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
    const way = a === 'way' ? d.ways[wayHere(d)] : null;
    const rh = a === 'rift' && riftHere(d);
    setTextIfChanged('btn-act', rh ? (rh.gate ? 'ENTER THE TEAR' : 'SEAL THE TEAR') : way ? 'STEP THROUGH: ' + T.zones[way].name.toUpperCase() : { setout: 'SET OUT', extract: 'EXTRACT', forge: 'FORGE', runes: 'REWORK', locker: 'OPEN LOCKER', altar: Story.shardsHeld() > Story.shardsSet() ? 'SET THE SHARD' : 'FEED THE STAR', wreck: 'BOARD THE MERIDIAN' }[a] || '');
    if (d.channel) setTextIfChanged('hud-depth', d.channel.kind === 'recall' ? 'RECALLING…' : d.channel.kind === 'seal' ? 'SEALING…' : 'RISING…');
    if (btn.hidden !== !a) btn.hidden = !a;
  },
};

// ---------------------------------------------------------------------------
// The Lodestar's rooms
// ---------------------------------------------------------------------------

// The story, a panel at a time.
function drawResume() {
  const r = Save.data.run;
  if (!r) return;
  const n = Object.values(r.cargo || {}).reduce((a, b) => a + b, 0) + (r.items || []).length;
  $('resume-text').textContent = `An expedition into ${T.biomes[r.biome].name} was under way: ${T.zones[r.zone].name}, site ${r.depth} of ${T.expedition.sites}, carrying ${n ? n + ' things' : 'nothing yet'}. Carry on from that site's start, or give it up and lose the cargo (the pocket comes home).`;
}

function drawStory() {
  const st = UI.story;
  if (!st) return;
  $('story-text').textContent = st.lines[st.i];
  $('story-step').textContent = `${st.i + 1} / ${st.lines.length}`;
}

// The Meridian: what's needed to call home, and the echoes found.
function drawWreck_() {
  const s = Save.data, held = Story.shardsHeld(), set = Story.shardsSet();
  const shardRow = (b, i) => {
    const has = (s.shards || []).includes(i);
    return `<div class="row static"><img class="icon" src="${art2IconUrl('shard', has ? {} : { shardglow: ['#2a2a30'], shardwarm: ['#3a3a40'], star: ['#202024', '#2a2a30', '#34343c', '#40404a'] })}" alt=""><span class="row-text"><span class="row-name">${has ? 'Recovered' : 'Held by the Keeper'} · ${esc(b.name)}</span><span class="row-sub">${has ? ((s.shards || []).indexOf(i) < set ? 'Set in the star' : 'Take it to the altar') : `In the Keeper's Lair, the last site of an expedition${biomeOpen(s, i) ? '' : ', beyond the star\'s reach for now'}`}</span></span></div>`;
  };
  const echoes = (s.echoes || []).map((i) => `<div class="echo"><b>${esc(ECHOES[i].title)}</b><p>${esc(ECHOES[i].text)}</p></div>`).join('');
  $('wreck-body').innerHTML = `
    <p class="note">The Meridian's beacon will call for home, if it has the power. The star could give it, if its heart were whole.</p>
    <h3>THE STAR'S HEART · ${set}/3</h3>${T.biomes.map(shardRow).join('')}
    ${s.beaconLit ? '<p class="note">The beacon is lit. Home is coming. Until then, the deep is yours.</p>' : Story.canLight() ? '<div class="menu"><button class="btn primary" data-act="lightBeacon">LIGHT THE BEACON</button></div>' : ''}
    <h3>ECHOES · ${(s.echoes || []).length}/${ECHOES.length}</h3>${echoes || '<p class="note">None yet. The crews before you left logs in the deep.</p>'}`;
}

// How the last dive ended, over the outpost.
function drawReport() {
  const r = UI.report;
  if (!r) return;
  const where = `${T.biomes[r.biome].name} · site ${r.depth} of ${T.expedition.sites}`;
  const gear = (items) => (items && items.length ? `${items.length} piece${items.length > 1 ? 's' : ''} of gear` : '');
  const got = [stuffLines(r.banked || r.lost || {}), gear(r.items)].filter(Boolean).join(', ');
  const rows = [], row = (label, cls, text) => rows.push(`<div class="rep-row"><span class="rep-label ${cls}">${label}</span><span class="rep-text">${esc(text)}</span></div>`);
  let title;
  if (r.recalled) {
    title = 'RECALLED';
    if (got) row('BANKED', 'good', got);
    const lost = [stuffLines(r.recalled.lost), gear({ length: r.recalled.lostItems })].filter(Boolean).join(', ');
    if (lost) row('THE DARK KEPT', 'bad', lost);
  } else if (r.banked) { title = 'PULLED HOME'; row('BANKED', 'good', got || 'Nothing this time'); }
  else { title = r.died ? 'YOU FELL' : 'YOU GAVE UP'; if (got) row('LOST', 'bad', got); }
  if (r.kept && (r.kept.items.length || Object.keys(r.kept.stuff).length)) row('POCKET KEPT', 'gold', [stuffLines(r.kept.stuff), r.kept.items.map((i) => i.name).join(', ')].filter(Boolean).join(', '));
  const learned = (r.learned || []).concat((r.kept && r.kept.blueprints) || []);
  if (learned.length) row('LEARNED', 'gold', learned.map((id) => BLUEPRINTS[id].name).join(', '));
  if (r.lostBlueprints) row('BLUEPRINTS LOST', 'bad', `${r.lostBlueprints}, with the cargo`);
  if (r.shard) row('HEART-SHARD', 'gold', 'Carried home. Set it in the star at the altar.');
  for (const c of r.contracts || []) row('CONTRACT DONE', 'good', `${contractText(c)}: ${contractRewardText(c)}`);
  if (r.contracts && r.contracts.bonus) row('THE WHOLE BOARD', 'gold', `+${r.contracts.bonus} more to the star`);
  if (r.echoes) row('ECHOES', 'gold', `${r.echoes} found: read ${r.echoes > 1 ? 'them' : 'it'} at the wreck`);
  // the star: what this ride fed it, and how far to the next magnitude
  const s = Save.data, mag = magnitudeOf(s.star), lo = T.star.levels[mag - 1], hi = T.star.levels[mag];
  let star = '';
  const paid = (r.contracts || []).reduce((n, c) => n + c.star, 0) + ((r.contracts && r.contracts.bonus) || 0), gain = (r.fed || 0) + paid;
  if (gain) {
    const grew = s.magSeen !== undefined && mag > s.magSeen;
    const k = hi ? Math.min(1, (s.star - lo) / (hi - lo)) : 1;
    star = `<div class="rep-star"><div class="rep-row"><span class="rep-label gold">THE STAR</span><span class="rep-text">+${gain}${grew ? ` · grew to magnitude ${mag}` : hi ? ` · ${Math.max(0, hi - s.star)} to magnitude ${mag + 1}` : ''}</span></div><div class="bar rep-bar"><div class="fill" style="width:${Math.round(k * 100)}%"></div></div></div>`;
  }
  $('report-title').textContent = title;
  $('report-body').innerHTML = `<p class="rep-where">${esc(where)}</p>${rows.join('')}${star}`;
}

function drawSetOut() {
  const s = Save.data;
  const owned = TOOL_IDS.filter(toolOwned);
  const carry = `<h3>CARRYING</h3><div class="chips">${owned.map((id) => `<button class="chip ${s.tool === id ? 'on' : ''}" data-act="carryTool" data-arg="${id}"><img class="chip-icon" src="${toolIconUrl(id)}" alt="">${esc(TOOLS[id].name)}</button>`).join('')}</div><h3>WHERE</h3>`;
  $('setout-body').innerHTML = carry + T.biomes.map((b, i) => {
    const open = biomeOpen(s, i), deep = s.deepest[b.id] || 0;
    const ores = b.ores.map((id) => T.ores[ORE_INDEX[id]].name).join(' and ');
    return `<button class="row biome" data-act="dive" data-arg="${i}" ${open ? '' : 'disabled'}>
      <span class="row-text"><span class="row-name">${esc(b.name)}</span><span class="row-sub">${open ? `${ores}${deep ? ` · furthest: site ${deep}` : ''} · ${(s.shards || []).includes(i) ? 'shard recovered' : 'its Keeper waits at the last site'}` : `The star's lines reach here at magnitude ${T.star.biomeAt[i]}`}</span></span></button>`;
  }).join('') + `<p class="note">An expedition is ${T.expedition.sites} sites: it sets out through the portal onto the surface, and at every exit two portals lead on, each to somewhere else. Odds of a lodeline at each site: ${[1, 2, 3, 4].map((k) => Math.round(lodelineOdds(k) * 100) + '%').join(', ')}. Where none reaches, go on or recall.</p>` + `<h3>CONTRACTS · SETTLED WHEN YOU COME HOME${Save.data.swapped ? '' : ' · ONE SWAP A TRIP'}</h3>${contractRows(null)}` + drawToolRows();
}

// The tools, under the biomes: the one carried, the others to carry or make.
function drawToolRows() {
  const s = Save.data;
  return `<h3>TOOLS · CARRY ONE</h3>` + TOOL_IDS.map((id) => {
    const t = TOOLS[id], own = toolOwned(id), open = toolOpen(id), on = s.tool === id;
    const sub = own ? esc(t.text) : open ? `Make it from ${toolCostTags(id)}${esc(t.text)}` : `The star must reach magnitude ${T.tools[id].mag}.`;
    const btn = own ? (on ? '<span class="row-tag r-legendary">CARRIED</span>' : '') : open ? `<button class="mini" data-act="makeTool" data-arg="${id}" ${toolAffordable(id) ? '' : 'disabled'}>MAKE</button>` : '';
    return `<div class="row ${own ? '' : 'static'} ${on ? 'on' : ''}" ${own && !on ? `data-act="carryTool" data-arg="${id}"` : ''} ${open ? '' : 'style="opacity:.55"'}><img class="icon" src="${toolIconUrl(id)}" alt=""><span class="row-text"><span class="row-name">${esc(t.name)}</span><span class="row-sub">${sub}</span></span>${btn}</div>`;
  }).join('');
}
// What a tool costs, each with its icon and how many there are (a part
// in any grade).
function toolCostTags(id) {
  const c = T.tools[id].cost;
  return Object.keys(c).map((k) => costTag(PARTS[k] ? partId(k, 1) : k, c[k], toolHave(k), PARTS[k] ? `${PARTS[k].name} (any grade)` : stuffName(k))).join(' ');
}

// What an imprint costs from here: a heart of the lowest grade there is,
// or riftglass. Null if neither.
function imprintCost(src) {
  if ((src.riftglass || 0) >= T.imprint.glass) return { id: 'riftglass', n: T.imprint.glass };
  for (const g of [1, 2, 3]) if ((src[partId('heart', g)] || 0) > 0) return { id: partId('heart', g), n: 1 };
  return null;
}

// Where the forge draws its materials from: the stash at home, the cargo at
// an ancient forge.
function forgeSource() { return UI.forge.field && Game.dive ? Game.dive.cargo : Save.data.stash; }

// The kinds of blueprint, in the order the forge lists them.
const FORGE_GROUPS = [['FIGHTING', 'blade'], ['CASTING', 'focus'], ['ARMOR', 'armor'], ['CHARMS', 'charm'], ['PICKS', 'pick'], ['SPELL CORES', 'core']];

// A stand-in piece for a blueprint, for its icon.
function bpSample(id, tier = 1) { const bp = BLUEPRINTS[id]; return bp.kind === 'core' ? { kind: 'core', core: bp.core, tier, rarity: 'magic' } : { kind: bp.kind, bp: id, tier, rarity: 'common' }; }

function drawForge() {
  const stash = forgeSource(), F = UI.forge, known = Save.data.blueprints;
  $('forge-title').textContent = F.field ? 'AN ANCIENT FORGE' : 'THE FORGE';
  if (!F.bp || !known.includes(F.bp)) F.bp = known[0];
  const bp = BLUEPRINTS[F.bp];
  // what this blueprint can be made from, of what's to hand
  const ores = T.ores.filter((o) => (stash[o.id] || 0) > 0);
  const parts = PART_STACK_IDS.filter((id) => (stash[id] || 0) > 0 && bindsWith(F.bp, id));
  const exotics = T.exotics.filter((x) => (stash[x.id] || 0) > 0 && (bp.kind !== 'core'));
  if (!F.ore || !stash[F.ore]) F.ore = (ores.find((o) => stash[o.id] >= bp.ore) || ores[0] || T.ores[0]).id;
  if (!F.part || !parts.includes(F.part)) F.part = parts.find((id) => stash[id] >= bp.parts) || parts[0] || null;
  if (F.exotic && !stash[F.exotic]) F.exotic = null;
  const ore = T.ores[ORE_INDEX[F.ore]], haveOre = stash[F.ore] || 0, haveParts = F.part ? stash[F.part] || 0 : 0;
  const ready = haveOre >= bp.ore && haveParts >= bp.parts;

  const order = FORGE_GROUPS.map(([, kind]) => kind);
  const ids = known.slice().sort((a, b) => order.indexOf(BLUEPRINTS[a].kind) - order.indexOf(BLUEPRINTS[b].kind));
  const list = `<h3>1 · BLUEPRINT <span class="dim">· ${known.length} OF ${BP_IDS.length} KNOWN</span></h3><div class="bp-grid bp-strip">${ids.map((id) => `<button class="bp ${id === F.bp ? 'on' : ''}" data-act="forgeBp" data-arg="${id}"><img class="icon" src="${itemIconUrl(bpSample(id, ore.tier))}" alt=""><span>${esc(BLUEPRINTS[id].name)}</span></button>`).join('')}</div>`;
  const chip = (act, id, label, on, ok = true) => `<button class="chip ${on ? 'on' : ''}" data-act="${act}" data-arg="${id}" ${ok ? '' : 'disabled'}>${label}</button>`;
  const stuffIcon = (id) => `<img class="chip-icon" src="${stuffIconUrl(id)}" alt="">`;
  const oreChips = ores.map((o) => chip('forgeOre', o.id, `${stuffIcon(o.id)}${esc(o.name)}<small>have ${stash[o.id]} · tier ${o.tier}</small>`, o.id === F.ore, stash[o.id] >= bp.ore)).join('') || `<span class="note">${F.field ? 'No ore in your cargo.' : 'No ore banked. Mine some and bring it home.'}</span>`;
  const partChips = parts.map((id) => { const pk = parsePart(id), fam = PARTS[pk.kind].family; return chip('forgePart', id, `${stuffIcon(id)}${esc(partName(id))}<small>have ${stash[id]} · ${fam ? fam : 'any'}</small>`, id === F.part, stash[id] >= bp.parts); }).join('')
    || `<span class="note">No ${bp.partKinds ? bp.partKinds.map((k) => PARTS[k].name).join(' or ') : 'creature parts'} ${F.field ? 'in your cargo' : 'banked'}. Creatures leave them when they fall.</span>`;
  // powers the forge remembers, for this kind of piece (at home only)
  const known2 = (Save.data.codex || []).filter((k) => LEGENDARIES[k] && LEGENDARIES[k].kinds.includes(bp.kind));
  if (F.imprint && !known2.includes(F.imprint)) F.imprint = null;
  // paid from what's left once the binding is taken
  const left = Object.assign({}, stash);
  if (F.part) left[F.part] = (left[F.part] || 0) - bp.parts;
  const pay = imprintCost(left), canPay = !!pay;
  if (F.imprint && !canPay) F.imprint = null;
  // what an imprint takes from here, or why it can't be paid
  const hearts = [1, 2, 3].reduce((n, g) => n + Math.max(0, left[partId('heart', g)] || 0), 0);
  const impCost = pay ? `<p class="note cost-line">${F.imprint ? 'Takes' : 'Would take'} ${costTag(pay.id, pay.n, left[pay.id] || 0)}</p>`
    : `<p class="note cost-line short">Needs a heart or ${T.imprint.glass} Riftglass besides the binding: you have ${hearts} heart${hearts === 1 ? '' : 's'} and ${left.riftglass || 0} Riftglass.</p>`;
  const impChips = F.field || bp.kind === 'core' ? '' : known2.map((k) => chip('forgeImprint', k, `${esc(LEGENDARIES[k].name)}<small>${esc(LEGENDARIES[k].text.toLowerCase())}</small>`, k === F.imprint, canPay)).join('');
  const exWhat = (x) => (x.element ? ELEMENTS[x.element].name.toLowerCase() : x.family ? x.family : x.rarity ? 'rarity +1' : x.tierUp ? 'tier +1' : '');
  const exChips = exotics.map((x) => chip('forgeExotic', x.id, `${stuffIcon(x.id)}${esc(x.name)}<small>have ${stash[x.id]} · ${exWhat(x)}</small>`, x.id === F.exotic)).join('');

  // what these parts guarantee
  const pk = F.part && parsePart(F.part), ex = F.exotic && T.exotics.find((e) => e.id === F.exotic);
  const lines = [];
  if (bp.kind === 'core') lines.push(`A tier ${ore.tier} ${esc(bp.name)} core (tier ${Math.min(6, ore.tier + 1)} from a fine forge). ${esc(CORES[bp.core].text)}.`);
  else {
    const tier = Math.min(T.ores.length, ore.tier + (ex && ex.tierUp ? 1 : 0));
    const b = baseStats(bp.kind, tier, bp), base = itemBaseLine({ kind: bp.kind, base: b, tier });
    lines.push(`A tier ${tier} ${esc(bp.name.toLowerCase())}: ${esc(base)}.`);
    if (bp.text) lines.push(esc(bp.text));
    if (pk && PARTS[pk.kind].family) lines.push(`Bound with ${esc(partName(F.part).toLowerCase())}: ${pk.grade} ${PARTS[pk.kind].family} affix${pk.grade > 1 ? 'es' : ''} for sure${pk.grade > 1 ? `, ${Math.round(T.items.gradeBoost * (pk.grade - 1) * 100)}% stronger` : ''}.`);
    if (pk && pk.kind === 'heart') lines.push('A heart: a fine forge or better comes out legendary.');
    if (ex && ex.element && (bp.kind === 'blade' || bp.kind === 'focus')) lines.push(`${esc(ex.name)}: ${esc(ELEMENTS[ex.element].name.toLowerCase())}. ${esc(ELEMENTS[ex.element].text)}.`);
    else if (ex && ex.family) lines.push(`${esc(ex.name)}: a ${ex.family} affix for sure.`);
    else if (ex && ex.rarity) lines.push(`${esc(ex.name)}: a rarity higher.`);
    else if (ex && ex.tierUp) lines.push(`${esc(ex.name)}: a tier above its ore.`);
    else if (ex) lines.push(`${esc(ex.name)} does nothing for a ${esc(bp.name.toLowerCase())}.`);
    if (F.imprint) lines.push(`Imprinted with ${esc(LEGENDARIES[F.imprint].name)}: ${esc(LEGENDARIES[F.imprint].text.toLowerCase())}. A fine forge or better sets it; a rougher one, half the time.`);
    lines.push('The rest is in your strikes: rough, fair, fine or masterwork.');
  }
  // what FORGE takes, or why it can't yet
  const exPaid = ex && bp.kind !== 'core';
  const cost = !ready ? (haveOre < bp.ore ? `need ${bp.ore} ${ore.name}, have ${haveOre}` : !F.part ? `need ${bp.parts} ${bp.partKinds ? bp.partKinds.map((k) => PARTS[k].name).join(' or ') : 'creature part'}${bp.parts > 1 ? 's' : ''}` : `need ${bp.parts} ${partName(F.part)}, have ${haveParts}`)
    : [`${bp.ore} ${ore.name}`, `${bp.parts} ${PARTS[parsePart(F.part).kind].name}`, exPaid && `1 ${ex.name}`, F.imprint && pay && `${pay.n} ${stuffName(pay.id)}`].filter(Boolean).join(', ');
  $('forge-body').innerHTML = `
    ${list}
    <div class="recipe-panel">
      <div class="card-head"><img class="icon big" src="${itemIconUrl(bpSample(F.bp, ore.tier))}" alt=""><div class="grow"><div class="card-name">${esc(bp.name)}</div><div class="row-sub">${bp.ore} ore · ${bp.parts} part${bp.parts > 1 ? 's' : ''}${bp.kind !== 'core' ? ' · an exotic if you like' : ''}</div></div></div>
      <h3>2 · HEAD <span class="dim">· ${bp.ore} ORE</span></h3><div class="chips">${oreChips}</div>
      <h3>3 · BINDING <span class="dim">· ${bp.parts} PART${bp.parts > 1 ? 'S' : ''}</span></h3><div class="chips">${partChips}</div>
      ${exChips ? `<h3>4 · EXOTIC <span class="dim">· IF YOU LIKE</span></h3><div class="chips">${exChips}</div>` : ''}
      ${impChips ? `<h3>5 · IMPRINT <span class="dim">· A HEART OR ${T.imprint.glass} RIFTGLASS</span></h3>${impCost}<div class="chips">${impChips}</div>` : ''}
      <div class="preview">${lines.map((l) => `<p>${l}</p>`).join('')}</div>
      ${F.field ? '<p class="note">What you forge here goes in your cargo.</p>' : ''}
      <div class="menu forge-go"><button class="btn primary" data-act="craft" ${ready ? '' : 'disabled'}>FORGE<small>${esc(cost.toUpperCase())}</small></button></div>
    </div>`;
  // keep the chosen blueprint in sight in the strip
  const on = document.querySelector('#forge-body .bp.on');
  if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'center' });
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
    ${UI.gearRunes ? `<p class="note">Tap a piece to rework its affixes: reroll one, raise one, or add one. It's paid in ore of the piece's own tier: ${T.ores.slice(0, 3).map((o) => `${esc(o.name)} for tier ${o.tier}`).join(', ')}, and so on.</p>` : ''}
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
  if (st.moveSpeed) bits.push(`${st.moveSpeed > 0 ? '+' : ''}${Math.round(st.moveSpeed)}% speed`);
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
  const stuff = stuffIds().filter((id) => d.cargo[id]).map((id) => `<button class="row" data-act="cardStuff" data-arg="${id}"><img class="icon" src="${stuffIconUrl(id)}" alt=""><span class="row-text"><span class="row-name">${esc(stuffName(id))} × ${d.cargo[id]}</span><span class="row-sub">${ORE_INDEX[id] !== undefined ? 'Ore' : parsePart(id) ? 'Creature part' : 'Exotic material'} · weighs ${d.cargo[id]}</span></span></button>`).join('');
  const slots = pocketSlots(), pocket = d.pocket.map((e, i) => `<div class="row static">${e.item ? iconImg(e.item) : e.blueprint ? `<img class="icon" src="${itemIconUrl(bpSample(e.blueprint))}" alt="">` : `<img class="icon" src="${stuffIconUrl(e.stuff)}" alt="">`}<span class="row-text"><span class="row-name ${e.item ? 'r-' + e.item.rarity : e.blueprint ? 'r-legendary' : ''}">${esc(e.item ? e.item.name : e.blueprint ? 'Blueprint: ' + BLUEPRINTS[e.blueprint].name : `${stuffName(e.stuff)} × ${e.n}`)}</span><span class="row-sub">In the pocket</span></span><button class="mini" data-act="unpocket" data-arg="${i}">TAKE OUT</button></div>`).join('');
  $('cargo-body').innerHTML = `
    <div class="mag">CARGO ${cargoUsed(d)}/${d.stats.cargo}</div>
    <h3>POCKET · ${d.pocket.length}/${slots}</h3>
    ${pocket || '<p class="note">Empty. Whatever you pocket comes home even if you fall: tap something below to pocket it.</p>'}
    <h3>ORE AND MATERIALS</h3>${stuff || '<p class="note">No ore yet.</p>'}
    ${d.blueprints.length ? `<h3>BLUEPRINTS · LEARNED WHEN YOU GET HOME</h3>${d.blueprints.map((b, i) => `<div class="row static"><img class="icon" src="${itemIconUrl(bpSample(b.id))}" alt=""><span class="row-text"><span class="row-name r-legendary">${esc(BLUEPRINTS[b.id].name)}</span><span class="row-sub">Blueprint · weighs 1</span></span>${d.pocket.length < pocketSlots() ? `<button class="mini" data-act="pocketBp" data-arg="${i}">POCKET</button>` : ''}</div>`).join('')}` : ''}
    <h3>FOUND</h3>${items || '<p class="note">Nothing forged or found yet.</p>'}
    <h3>CONTRACTS</h3>${contractRows(d)}
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
  // a rune button names its cost in the piece's ore, or why it can't be done
  const oreName = stuffName(oreId), oreIcon = `<img class="cost-icon" src="${stuffIconUrl(oreId)}" alt="">`;
  const runeBtn = (cls, act, arg, label, n, block = '') => {
    const short = oreHave < n;
    return `<button class="${cls} rune-btn${short && !block ? ' short' : ''}" data-act="${act}"${arg === null ? '' : ` data-arg="${arg}"`} ${short || block ? 'disabled' : ''}><span>${label}</span><small>${block ? esc(block) : `${oreIcon}${esc(short ? `need ${n} ${oreName}, have ${oreHave}` : `${n} ${oreName}`)}`}</small></button>`;
  };
  const affixes = it.affixes.map((a, i) => `<li${runes ? ' class="runed"' : ''}><span class="aff">${esc(fmtAffix(a))}${rollBar(a)}</span>${runes ? `<span class="rune">${runeBtn('mini', 'reroll', i, 'REROLL', R.reroll)}${runeBtn('mini', 'upgrade', i, 'RAISE', R.upgrade, a.up >= 2 ? 'fully raised' : '')}</span>` : ''}</li>`).join('');
  let extra = '';
  if (it.power) extra += `<p class="power">★ ${esc(LEGENDARIES[it.power].text)}</p>`;
  if (it.set) {
    const n = computeStats(s.equip, s.attune).sets[it.set] || 0, S = SETS[it.set];
    extra += `<p class="set">${esc(S.name)} (${n}/3 worn)<br>2: ${esc(S.bonus2.text)}<br>3: ${esc(S.bonus3.text)}</p>`;
  }
  if (it.sockets) {
    extra += '<div class="sockets">' + it.sockets.map((core, i) => core
      ? `<div class="sock">◆ ${esc(core.name)} (tier ${core.tier}) ${home ? `<button class="mini" data-act="unsocket" data-arg="${i}">REMOVE</button>` : ''}</div>`
      : `<div class="sock">◇ Empty socket ${home ? `${s.items.some((x) => x.kind === 'core') ? `<button class="mini" data-act="pickCore" data-arg="${i}">SOCKET</button>` : '<button class="mini" disabled>NO CORES</button>'}` : ''}</div>`).join('') + '</div>';
    if (c.picking !== null) {
      const cores = s.items.filter((x) => x.kind === 'core');
      extra += '<div class="picker">' + cores.map((x) => `<button class="mini wide" data-act="socket" data-arg="${x.uid}">${esc(x.name)} · tier ${x.tier}</button>`).join('') + '</div>';
    }
  }
  const acts = [];
  const handBtns = (act) => [`<button class="btn primary" data-act="${act}" data-arg="main">EQUIP · MAIN</button>`, `<button class="btn primary" data-act="${act}" data-arg="off">EQUIP · OFF</button>`];
  // destructive: a second tap confirms, and says what it gives
  const sy = it.kind !== 'relic' && salvageYield(new Rng(1), it);
  const learns = it.power && c.where === 'stash' && !(Save.data.codex || []).includes(it.power);
  const salvageBtn = sy ? `<button class="btn danger" data-act="salvage" data-confirm="SURE? +${sy.n} ${esc(stuffName(sy.ore).toUpperCase())}${learns ? ', ITS POWER KEPT' : ''}">SALVAGE${learns ? ' · KEEP ITS POWER' : ''}</button>` : '';
  const slotOf = KIND_SLOT[it.kind];
  if (c.where === 'stash') {
    if (it.kind === 'relic') acts.push('<button class="btn primary" data-act="unseal">UNSEAL</button>');
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
  if (runes && canAddAffix(it)) acts.push(runeBtn('btn wide', 'addAffix', null, 'ADD AN AFFIX', R.add));
  const runeNote = runes ? `<p class="rune-head">${oreIcon}<span>Rune work on a tier ${it.tier} piece is paid in <b>${esc(oreName)}</b>. <span class="${oreHave < R.reroll ? 'short' : ''}">You have ${oreHave}.</span></span></p>` : '';
  const cmp = (c.where === 'stash' || c.where === 'cargo') ? compareTag(it, s.equip) : '';
  // stat by stat against what's worn in its slot
  const slot = (c.where === 'stash' || c.where === 'cargo') && compareSlot(s.equip, it);
  if (slot) {
    const cur = s.equip[slot], lines = compareLines(it, cur);
    extra += `<div class="compare"><div class="row-sub">${cur ? `AGAINST ${esc(cur.name.toUpperCase())} (${SLOT_NAMES[slot].toUpperCase()})` : `${SLOT_NAMES[slot].toUpperCase()} IS EMPTY`}</div>${lines.map((l) => `<div class="${l.up ? 'up' : 'down'}">${l.up ? '▲' : '▼'} ${esc(l.text)}</div>`).join('') || '<div class="dim">No change</div>'}</div>`;
  }
  const canFav = it.kind !== 'relic' && (c.where === 'stash' || c.where === 'equip');
  const favBtn = canFav ? `<button class="mini fav ${it.fav ? 'on' : ''}" data-act="fav" title="Keep: never salvaged">${it.fav ? '★ KEPT' : '☆ KEEP'}</button>` : '';
  const where = c.where === 'stash' ? 'IN THE STASH' : c.where === 'cargo' ? 'IN YOUR CARGO' : `WORN · ${SLOT_NAMES[c.key].toUpperCase()}`;
  $('card-body').innerHTML = cardBar(where, favBtn) + `<div class="card-scroll">
    <div class="card-head">${iconImg(it, 'icon big')}<div class="grow"><div class="card-name r-${it.rarity}">${esc(it.name)} ${cmp}</div><div class="row-sub">${esc(itemKindLine(it))}</div></div></div>
    <p class="base">${esc(itemBaseLine(it))}</p>
    ${itemNotes(it).map((n) => `<p class="note">${esc(n)}</p>`).join('')}
    ${runeNote}${affixes ? `<ul class="affixes">${affixes}</ul>` : ''}
    ${extra}
    ${acts.length ? `<div class="menu card-menu">${acts.join('')}</div>` : ''}</div>`;
}

// The card's header, held above what scrolls: where the piece is, KEEP,
// and the way out.
function cardBar(where, extra = '') {
  return `<div class="card-bar"><span class="card-where">${esc(where)}</span>${extra}<button class="head-close" data-act="closeCard" aria-label="Close">✕</button></div>`;
}

// Ore or an exotic in the cargo: how much, and dropping some.
function drawStuffCard(id) {
  const n = (Game.dive && Game.dive.cargo[id]) || 0, x = T.exotics.find((e) => e.id === id), pk = parsePart(id);
  const what = x ? (x.element ? `Worked into a weapon or focus at the forge, it carries ${ELEMENTS[x.element].name.toLowerCase()}: ${ELEMENTS[x.element].text.toLowerCase()}.` : x.family ? `Worked into a piece at the forge, it's sure to roll a ${x.family} affix.` : x.tierUp ? 'Left where a rift was sealed. Worked into a piece at the forge, it comes out a tier above its ore.' : 'Worked into a piece at the forge, it comes out a rarity higher.')
    : pk ? (PARTS[pk.kind].family ? `A creature part. It binds a forged piece with ${pk.grade} ${PARTS[pk.kind].family} affix${pk.grade > 1 ? 'es' : ''}.` : 'A heart. It binds anything, and a fine forge with it comes out legendary.')
    : `Tier ${T.ores[ORE_INDEX[id]].tier} ore, worth ${orePoints(id)} to the star.`;
  $('card-body').innerHTML = cardBar('IN YOUR CARGO') + `<div class="card-scroll">
    <div class="card-head"><img class="icon big" src="${stuffIconUrl(id)}" alt=""><div><div class="card-name">${esc(stuffName(id))} × ${n}</div><div class="row-sub">${x ? 'Exotic material' : pk ? 'Creature part' : 'Ore'}</div></div></div>
    <p class="base">${esc(what)}</p>
    <div class="menu">
      ${n && Game.dive.pocket.length < pocketSlots() ? `<button class="btn" data-act="pocket" data-arg="${T.cargo.pocketStack}">POCKET ${Math.min(n, T.cargo.pocketStack)} (SAFE IF YOU FALL)</button>` : ''}
      ${n ? `<button class="btn danger" data-act="dropStuff" data-arg="1">DROP 1</button>` : ''}
      ${n > 5 ? `<button class="btn danger" data-act="dropStuff" data-arg="5">DROP 5</button>` : ''}
      ${n > 1 ? `<button class="btn danger" data-act="dropStuff" data-arg="all">DROP ALL</button>` : ''}
    </div></div>`;
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
  closeReport: () => {
    UI.report = null; UI.close();
    Story.starGrew();
  },
  resumeRun: () => { UI.close(); resumeRun(); },
  dropRun: () => {
    UI.close();
    const r = Save.data.run;
    if (!r) return;
    Game.dive = newWorld({ seed: r.seed, biome: r.biome, depth: r.depth, zone: r.zone, cargo: r.cargo || {}, items: r.items || [], blueprints: r.blueprints || [], pocket: r.pocket || [], gotShard: r.gotShard, echoes: r.echoes });
    abandonDive();
  },
  storyNext: () => {
    const st = UI.story;
    if (!st) return;
    if (++st.i < st.lines.length) { UI.openedAt = Game.realT; UI.redraw(); return; }
    UI.story = null; UI.close();
    if (st.done) st.done();
  },
  lightBeacon: () => {
    Save.data.beaconLit = true; Save.save();
    UI.openStory(STORY_END, () => UI.useStation('wreck'));
  },
  recall: () => {
    UI.close();
    const d = Game.dive;
    if (d.channel && d.channel.kind !== 'recall') d.channel = null;
    startChannel('recall'); UI.toast('Hold still: recalling');
  },
  beacon: () => { UI.close(); plantBeacon(); },
  carryTool: (id) => { if (toolOwned(id)) { Save.data.tool = id; Save.save(); UI.redraw(); } },
  swapContract: (id) => { if (swapContract(id)) UI.redraw(); },
  makeTool: (id) => { if (makeTool(id)) { UI.toast(`Made: ${TOOLS[id].name}`, 'legendary'); UI.redraw(); } },
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
    if (e.item) d.items.push(e.item); else if (e.blueprint) d.blueprints.push({ id: e.blueprint }); else d.cargo[e.stuff] = (d.cargo[e.stuff] || 0) + e.n;
    UI.redraw();
  },
  pocketBp: (i) => {
    const d = Game.dive, b = d.blueprints[Number(i)];
    if (!b || d.pocket.length >= pocketSlots()) return;
    d.blueprints.splice(Number(i), 1);
    d.pocket.push({ blueprint: b.id });
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
    d.drops.push({ x: d.p.x, y: d.p.y, t: 0, stuff: id, n: k, left: true });
    if (!d.cargo[id]) UI.closeCard();
    UI.redraw();
  },

  forgeOre: (id) => { UI.forge.ore = id; UI.redraw(); },
  forgeExotic: (id) => { UI.forge.exotic = UI.forge.exotic === id ? null : id; UI.redraw(); },
  forgeBp: (id) => { UI.forge.bp = id; UI.forge.part = null; UI.redraw(); },
  forgePart: (id) => { UI.forge.part = id; UI.redraw(); },
  forgeImprint: (id) => { UI.forge.imprint = UI.forge.imprint === id ? null : id; UI.redraw(); },
  craft: () => {
    const F = UI.forge, src = forgeSource(), bp = BLUEPRINTS[F.bp];
    if ((src[F.ore] || 0) < bp.ore || !F.part || (src[F.part] || 0) < bp.parts) return;
    if (F.imprint && !F.field) { const left = Object.assign({}, src); left[F.part] -= bp.parts; if (!imprintCost(left)) return; }
    const take = (id, n) => { src[id] -= n; if (!src[id]) delete src[id]; };
    take(F.ore, bp.ore);
    take(F.part, bp.parts);
    let exotic = null;
    if (bp.kind !== 'core' && F.exotic && (src[F.exotic] || 0) > 0) { exotic = F.exotic; take(F.exotic, 1); }
    F.exotic = null;
    let imprint = null;
    if (F.imprint && !F.field && imprintCost(src)) {
      const pay = imprintCost(src);
      take(pay.id, pay.n);
      imprint = F.imprint;
    }
    F.imprint = null;
    if (!F.field) Save.save();
    Anvil.start({ bp: F.bp, ore: F.ore, part: F.part, exotic, imprint, field: !!F.field });
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
    d.drops.push({ x: d.p.x, y: d.p.y, t: 0, item: it, left: true });
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
    // a legendary broken down at home: the forge remembers its power
    const codex = Save.data.codex || (Save.data.codex = []);
    if (it.power && !field && !codex.includes(it.power)) { codex.push(it.power); UI.toast(`The forge remembers ${LEGENDARIES[it.power].name}: it can be imprinted now`, 'legendary'); }
    s[y.ore] = (s[y.ore] || 0) + y.n;
    if (y.part) s[y.part] = (s[y.part] || 0) + 1;
    if (y.exotic) s[y.exotic] = (s[y.exotic] || 0) + 1;
    if (field) {
      const d = Game.dive, over = cargoUsed(d) - d.stats.cargo;
      if (over > 0) { const k = Math.min(over, s[y.ore]); s[y.ore] -= k; if (!s[y.ore]) delete s[y.ore]; d.drops.push({ x: d.p.x, y: d.p.y, t: 0, stuff: y.ore, n: k, left: true }); }
    }
    UI.toast(`+${y.n} ${T.ores[ORE_INDEX[y.ore]].name}${y.part ? `, +1 ${partName(y.part)}` : ''}${y.exotic ? `, +1 ${exoticName(y.exotic)}` : ''}`);
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
      if (y.part) { s[y.part] = (s[y.part] || 0) + 1; got[y.part] = (got[y.part] || 0) + 1; }
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
    if (Game.dive && Game.dive.hub) { UI.close(); feedStarFx(Game.dive, k, after > before ? after : 0); if (after > before) Story.starGrew(); }
    else UI.redraw();
  },
  attune: (id) => {
    const s = Save.data;
    if (attunePointsLeft(s) <= 0 || (s.attune[id] || 0) >= T.attune[id].max) return;
    s.attune[id] = (s.attune[id] || 0) + 1;
    afterChange();
  },
};

