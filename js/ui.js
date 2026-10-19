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
  return `<button class="row" data-act="${act}" data-arg="${arg}">${iconImg(item)}<span class="row-text"><span class="row-name r-${item.rarity}">${item.fav ? '★ ' : ''}${esc(item.name)}</span><span class="row-sub">${esc(itemKindLine(item))}</span>${isCaster(item) ? miniCircuit(item) : ''}</span>${tag}</button>`;
}

// ---------------------------------------------------------------------------
// Circuits on the screens: a stone as a tile, a caster's row of them, and
// the drawer of stones to socket
// ---------------------------------------------------------------------------
const STONE_ORDER = Object.keys(CIRCUIT_FORMS).concat(Object.keys(CIRCUIT_ELEMENTS), Object.keys(CIRCUIT_GLYPHS));

// A stone as a tile: a Form's is stone with a heavy rim, an Element's filled
// with its colour, a Glyph's etched with a dashed rim; or an empty slot.
// st: a stone, or { stone, tier }; opts: { act, arg, sel, mini, count }.
function stoneTile(st, opts = {}) {
  const tag = opts.act ? 'button' : 'span', cls = `${opts.sel ? ' sel' : ''}${opts.mini ? ' mini' : ''}${opts.linked ? ' linked' : ''}`;
  const attrs = opts.act ? ` data-act="${opts.act}" data-arg="${opts.arg}"` : '';
  if (!st) return `<${tag} class="tile t-empty${cls}"${attrs} aria-label="Empty slot"><b>·</b>${opts.mini ? '' : '<small>EMPTY</small>'}</${tag}>`;
  const W = stoneWords(st.stone), k = stoneKind(st.stone);
  const img = opts.mini ? '' : `<img src="${stoneIconUrl(st.stone)}" alt="">`;
  const sub = opts.mini ? '' : `<small>${opts.count ? '×' + opts.count + ' · ' : ''}T${st.tier}</small>`;
  return `<${tag} class="tile t-${k}${cls}" style="--c:${stoneTint(st.stone)}"${attrs} aria-label="${esc(W.name)}, tier ${st.tier}">${img}<b>${W.abbr}</b>${sub}</${tag}>`;
}
function miniCircuit(it) { return `<span class="mini-circuit">${it.slots.map((s) => stoneTile(s, { mini: true })).join('')}</span>`; }
// The stones in a list, one entry for each kind and tier: { stone, tier, n }.
function groupStones(items) {
  const m = new Map();
  for (const it of items) {
    if (it.kind !== 'stone') continue;
    const k = it.stone + ':' + it.tier, e = m.get(k) || { stone: it.stone, tier: it.tier, n: 0 };
    e.n++; m.set(k, e);
  }
  return [...m.values()].sort((a, b) => STONE_ORDER.indexOf(a.stone) - STONE_ORDER.indexOf(b.stone) || b.tier - a.tier);
}

// A caster's circuit on its card: the row of slots, what it costs, what it
// does in words; and at home, the drawer to socket stones from (free).
function circuitPanel(it, edit, c) {
  if (edit && (typeof c.slot !== 'number' || c.slot >= it.slots.length)) c.slot = Math.max(0, it.slots.indexOf(null));
  const R = circuitReadout(it), links = it.links || [];
  // a linked pair: a chain drawn between its two tiles
  const tiles = it.slots.map((st, i) => (i ? `<span class="link${links.includes(i - 1) ? ' linked' : ''}" aria-hidden="true"></span>` : '') + stoneTile(st, Object.assign(edit ? { act: 'slotPick', arg: i, sel: c.slot === i } : {}, { linked: slotLinked(links, i) }))).join('');
  let h = `<h3>CIRCUIT · ${it.slots.length} SLOTS${links.length ? ' · 2 LINKED' : ''}</h3><div class="circuit${it.slots.length > 5 ? ' long' : ''}">${tiles}</div>`;
  // a resonance: a gold banner when it's live; a stir when it's a stone away
  const near = resonanceNear(it);
  if (near && near.live) h += `<div class="res-banner on">✦ RESONANCE · ${esc(near.live.name.toUpperCase())}</div><p class="res-text">${esc(capFirst(near.live.text))}. It hits ${Math.round((resonanceMult(it) - 1) * 100)}% harder.</p>`;
  else if (near && near.stir) h += `<div class="res-banner stir">Resonance stirs…${codexWhole(near.stir) ? ` one stone from ${esc(near.stir.name)}` : ''}</div>`;
  h += `<p class="circuit-cost">Costs <b>${R.cost} charge</b> a cast · held, <b>${R.held} charge</b>${R.close ? ' · close Forms give charge back' : ''}</p>`;
  h += `<div class="readout">${R.lines.map((l) => `<p${l.warn ? ' class="warn"' : l.ore ? ' class="ore"' : l.link ? ' class="linked"' : ''}>${esc(l.text)}</p>`).join('')}</div>`;
  if (!edit) return h + (c.where === 'cargo' || c.where === 'worn' ? '<p class="note">Its stones can be changed at home, at the locker.</p>' : '');
  const sel = it.slots[c.slot], have = groupStones(Save.data.items);
  const grp = (kind, label, none) => {
    const list = have.filter((x) => stoneKind(x.stone) === kind);
    return `<div class="drawer-grp"><div class="gl">${label}</div><div class="drawer-row">${list.length ? list.map((x) => stoneTile(x, { act: 'slotPut', arg: x.stone + ':' + x.tier, count: x.n })).join('') : `<span class="note">${none}</span>`}</div></div>`;
  };
  h += `<div class="drawer"><div class="drawer-head"><span>SLOT ${c.slot + 1} · ${sel ? `${esc(stoneWords(sel.stone).name.toUpperCase())} · TIER ${sel.tier}` : 'EMPTY'}</span>${sel ? '<button class="mini" data-act="slotEmpty">TAKE OUT</button>' : ''}</div>
    <p class="note">Tap a stone to set it in slot ${c.slot + 1}. Socketing is free: change it as often as you like.</p>
    ${grp('form', 'FORMS · THE SHAPE', 'No spare Form stones: forge them from a Form blueprint.')}
    ${grp('element', 'ELEMENTS · THE DAMAGE', 'No Element stones: forge them from exotics, or Force from ore.')}
    ${grp('glyph', 'GLYPHS · WHAT CHANGES IT', 'No Glyph stones: forge them from creature parts.')}</div>`;
  return h;
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
  card: null, // { item, where, key, slot (the circuit's chosen slot) }
  forge: { bp: null, ore: null, part: null, exotic: null, field: false },

  init() {
    for (const s of document.querySelectorAll('.screen')) s.addEventListener('click', (e) => UI.onTap(e));
    // a tap on the dark round the card closes it, as ✕ does
    $('card').addEventListener('click', (e) => { if (e.target === $('card')) { if (Game.realT - UI.openedAt >= T.ui.tapGuard) UI.acts.closeCard(); } else UI.onTap(e); });
    $('btn-pause').addEventListener('click', () => { if (Game.dive && !Game.modal) UI.openPause(); });
    $('btn-cargo').addEventListener('click', () => { if (Game.dive && !Game.dive.hub && !Game.modal) UI.openCargo(); });
    $('btn-act2').addEventListener('pointerdown', (e) => { e.preventDefault(); if (Game.dive && !Game.dive.hub && !Game.modal) UI.openMap('travel'); });
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
    if (fn) { snd('tap'); fn(el.dataset.arg); }
  },

  show(id) {
    // a hint showing goes away with the world; one only just shown comes
    // back after (if it's still where it was given), and the rest count as read
    for (const t of [...$('toasts').children]) {
      if (!t.classList.contains('r-tip')) continue;
      if (Date.now() - t.dataset.born < 800) { UI.hintsSeen.delete(t.textContent); UI.hintQ.unshift({ msg: t.textContent, at: t.dataset.at }); }
      t.remove();
    }
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
    const r = { 'screen-resume': drawResume, 'screen-report': drawReport, 'screen-story': drawStory, 'screen-wreck': drawUplink_, 'screen-setout': drawSetOut, 'screen-forge': drawForge, 'screen-gear': drawGear, 'screen-star': drawStar, 'screen-cargo': drawCargo }[UI.screen];
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
    if (id === 'forge' || id === 'fieldForge') { UI.forge.field = id === 'fieldForge'; UI.show('screen-forge'); snd('forgeOpen'); }
    else if (id === 'altar') {
      if (Story.setShards()) { feedStarFx(Game.dive, 40, 0); snd('starFeed', { tier: 6, rate: 8, n: 24, stream: true }); return; }
      UI.show('screen-star');
    }
    else if (id === 'locker') { UI.gearRunes = false; UI.show('screen-gear'); }
    else if (id === 'runes') { UI.gearRunes = true; UI.show('screen-gear'); }
    else if (id === 'setout') UI.openMap('setout');
    else if (id === 'wreck') { UI.show('screen-wreck'); snd('uplink'); }
  },
  // The world map: 'setout' at the outpost's portal, 'travel' at a spire.
  openMap(mode) {
    UI.mapMode = mode;
    const d = Game.dive;
    if (UI.mapSel === undefined || UI.mapSel === null || !terrOf(UI.mapSel)) UI.mapSel = d && d.sortie ? d.terr : 0;
    UI.show('screen-setout');
  },
  openPause() {
    const home = !!(Game.dive && Game.dive.hub);
    $('pause-cargo').hidden = home; $('pause-abandon').hidden = home; $('pause-note').hidden = home; $('pause-recall').hidden = home;
    $('pause-beacon').hidden = home || Game.dive.tool !== 'beacon' || !!Game.dive.beaconUsed || !!Game.dive.beacon;
    if (!home) $('pause-recall').textContent = `EMERGENCY RECALL · LOSE ${Math.round(recallCost(Game.dive) * 100)}%`;
    drawSoundButtons();
    UI.show('screen-pause');
  },
  openCargo() { UI.show('screen-cargo'); },

  openCard(item, where, key) {
    UI.card = { item, where, key, slot: null };
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
      snd('speak', { style: l.style });
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

  // Toasts: at most T.ui.toasts on screen at once. News (any toast but a
  // hint) shows at once and pushes the oldest out. A hint waits its turn in
  // hintQ, and while a screen is open, so none lies over a panel or crowds
  // the news; it belongs to the place it was given in (placeKey), and is
  // dropped if that place has been left before its turn comes. Leaving a
  // place clears what it said from view, and a hint is never shown twice in
  // a sortie.
  hintQ: [], hintsSeen: new Set(), hintsFor: null, toastsAt: '',
  placeKey() { const d = Game.dive; return !d ? '' : d.hub ? 'home' : `${d.terr}/${d.deep ? d.deep.site : 0}`; },
  toast(msg, kind) {
    if (kind !== 'tip') { UI.showToast(msg, kind, UI.placeKey()); return; }
    if (UI.hintsFor !== Game.dive) { UI.hintsFor = Game.dive; UI.hintsSeen.clear(); }
    if (UI.hintsSeen.has(msg) || UI.hintQ.some((h) => h.msg === msg)) return;
    UI.hintQ.push({ msg, at: UI.placeKey() });
    UI.pumpToasts();
  },
  showToast(msg, kind, at) {
    const box = $('toasts'), most = T.ui.toasts;
    // the same words twice at once read as a stutter: the newer one only
    for (const o of [...box.children]) if (o.textContent === msg) o.remove();
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' r-' + kind : '');
    el.textContent = msg;
    el.dataset.at = at;
    el.dataset.born = Date.now();
    // long enough to read: a hint longer than news, and long lines longer
    const secs = clamp(msg.length * (kind === 'tip' ? 0.05 : 0.035), kind === 'tip' ? 2.6 : 1.8, 4.5);
    el.style.animationDuration = secs + 's';
    box.appendChild(el);
    while (box.children.length > most) box.firstChild.remove();
    if (kind === 'tip') UI.hintsSeen.add(msg);
    setTimeout(() => { el.remove(); UI.pumpToasts(); }, secs * 1000);
  },
  // Every step: what a place left behind goes, and a waiting hint shows if
  // there's room for it.
  pumpToasts() {
    const box = $('toasts'), at = UI.placeKey();
    if (at !== UI.toastsAt) {
      UI.toastsAt = at;
      for (const o of [...box.children]) if (o.dataset.at !== at) o.remove();
    }
    UI.hintQ = UI.hintQ.filter((h) => h.at === at);
    if (Game.modal) return;
    while (UI.hintQ.length && box.children.length < T.ui.toasts) { const h = UI.hintQ.shift(); UI.showToast(h.msg, 'tip', h.at); }
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
    UI.pumpToasts();
    if (!d) return;
    if (d.hub) {
      setTextIfChanged('hud-depth', `THE LODESTAR · MAGNITUDE ${magnitudeOf(Save.data.star)}`);
    }
    const p = d.p, st = d.stats;
    const hp = Math.max(0, p.hp / st.maxHp), ch = p.charge / st.maxCharge;
    const hpW = Math.round(hp * 100) + '%', chW = Math.round(ch * 100) + '%';
    if ($('hp-fill').style.width !== hpW) $('hp-fill').style.width = hpW;
    if ($('ch-fill').style.width !== chW) $('ch-fill').style.width = chW;
    $('hud-goal').hidden = !drawGoalHud(d);
    const pW = Math.round(d.pull * 100) + '%';
    if ($('pull-fill').style.width !== pW) $('pull-fill').style.width = pW;
    $('hud-pull').classList.toggle('fading', d.pull < T.pull.dimAt);
    $('hud-pull').classList.toggle('dark', d.pull <= 0);
    setTextIfChanged('hp-text', String(Math.ceil(p.hp)));
    $('hud-hp').classList.toggle('warded', p.ward > 0);
    $('hud-hp').classList.toggle('hurt', p.hurtT > 0);
    $('hud-ch').classList.toggle('low', p.lowCharge > 0);
    if (!d.hub) setTextIfChanged('hud-depth', d.deep ? `THE DEEP ${d.deep.site}/${d.deep.of}` : d.terr ? terrOf(d.terr).name.toUpperCase() : '');
    setTextIfChanged('btn-cargo', `CARGO ${cargoUsed(d)}/${st.cargo}`);
    const eq = Save.data.equip;
    for (const slot of ['main', 'off']) {
      // each hand's button shows its circuit's first Form
      const it = eq[slot], P = isCaster(it) ? parseCircuit(it.slots, it.links) : null, g = P && P.groups[0];
      const form = it ? (g ? g.form : null) : 'arc', tier = g ? g.tier : 1, btn = $('btn-' + slot), key = `${it ? it.uid : 'fist'}:${form}:${tier}`;
      if (btn.dataset.key !== key) {
        btn.dataset.key = key;
        btn.innerHTML = `<img class="btn-icon" src="${stoneIconUrl(form || 'bolt')}" alt=""><span>${!it ? 'FIST' : form ? CIRCUIT_FORMS[form].name.toUpperCase() : 'SPARK'}</span>`;
      }
      const h = p.hands[slot], lv = h.holding ? chargeLevel(h) : 0;
      btn.classList.toggle('charging', lv > 0 && lv < 1);
      btn.classList.toggle('charged', lv >= 1);
    }
    if ($('btn-off').hidden !== !eq.off) $('btn-off').hidden = !eq.off;
    $('btn-dash').classList.toggle('cooling', p.dashCd > 0);
    const a = !Game.modal ? actionHere() : null, btn = $('btn-act');
    const rh = a === 'rift' && riftHere(d);
    let way = '';
    if (a === 'way') way = !d.deep ? 'DOWN INTO THE DEEP' : d.deep.site >= d.deep.of ? 'BACK UP: ' + terrOf(d.terr).name.toUpperCase() : 'STEP THROUGH: ' + wayPlaceName(d, wayHere(d)).toUpperCase();
    setTextIfChanged('btn-act', rh ? (rh.gate ? 'ENTER THE TEAR' : 'SEAL THE TEAR') : way || { setout: 'SET OUT', extract: d.deep ? 'RISE TO THE SURFACE' : 'BANK', stone: 'LIGHT THE WAYSTONE', plant: 'PLANT THE SPIRE', forge: 'FORGE', runes: 'REWORK', locker: 'OPEN LOCKER', altar: Story.shardsHeld() > Story.shardsSet() ? 'SET THE SHARD' : 'FEED THE STAR', wreck: 'OPEN THE UPLINK' }[a] || '');
    if (d.channel) setTextIfChanged('hud-depth', { recall: 'RECALLING…', seal: 'SEALING…', stone: 'LIGHTING…', plant: 'PLANTING…', travel: 'TRAVELLING…', extract: d.deep ? 'RISING…' : 'BANKING…' }[d.channel.kind] || 'RISING…');
    if (btn.hidden !== !a) btn.hidden = !a;
    // at a spire (or a beacon's light), TRAVEL too
    const travel = a === 'extract' && d.sortie && !d.deep, b2 = $('btn-act2');
    if (b2.hidden !== !travel) b2.hidden = !travel;
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
  const t = terrOf(r.terr);
  $('resume-text').textContent = `A sortie was under way: ${t ? t.name : 'out in the world'}${r.deep ? `, in its Deep (site ${r.deep})` : ''}, carrying ${n ? n + ' things' : 'nothing yet'}. Carry on from where you came in, or give it up and lose the cargo (the pocket and what you banked are safe).`;
}

function drawStory() {
  const st = UI.story;
  if (!st) return;
  $('story-text').textContent = st.lines[st.i];
  $('story-step').textContent = `${st.i + 1} / ${st.lines.length}`;
}

// The Meridian uplink (the station 'wreck'): the colony ship in orbit, the
// landers it can send, the shards set, calling the colony down, and the
// echoes found.
function drawUplink_() {
  const s = Save.data, set = Story.shardsSet();
  const shardRow = (b, i) => {
    const has = (s.shards || []).includes(i);
    return `<div class="row static"><img class="icon" src="${art2IconUrl('shard', has ? {} : { shardglow: ['#2a2a30'], shardwarm: ['#3a3a40'], star: ['#202024', '#2a2a30', '#34343c', '#40404a'] })}" alt=""><span class="row-text"><span class="row-name">${has ? 'Recovered' : 'Held by the Keeper'} · ${esc(b.name)}</span><span class="row-sub">${has ? ((s.shards || []).indexOf(i) < set ? 'Set in the star' : 'Take it to the altar') : `In its Keeper's Lair, at the bottom of the Deep under the furthest territory of ring ${i + 1}`}</span></span></div>`;
  };
  // the landers: one for every few territories kindled
  const kindled = storyKindledCount(), landers = storyLanders(), every = T.story.landerEvery, need = T.story.callLanders;
  const landerNote = `Kindled: ${kindled} territor${kindled === 1 ? 'y' : 'ies'}. The Meridian can send a lander for every ${every}, so ${landers ? `${landers} can come down` : 'none can come down yet'}${landers < need ? `; ${(landers + 1) * every - kindled} more for the next` : ''}.`;
  const call = Story.landersCalled() ? '<p class="note">The colony is down. The rim is theirs now, and the dark beyond it is still yours to walk.</p>'
    : Story.canCall() ? '<div class="menu"><button class="btn primary" data-act="callLanders">CALL THE LANDERS</button></div>'
    : `<p class="note">The colony can land when all three shards are set in the star and there's ground for ${need} landers (${need * every} territories kindled).</p>`;
  // the log: a line for each territory kindled
  const log = storyKindled().map((t) => `<div class="echo"><p>${esc(kindleLogLine(t.clime, t.name))}</p></div>`).join('');
  const echoes = (s.echoes || []).map((i) => `<div class="echo"><b>${esc(ECHOES[i].title)}</b><p>${esc(ECHOES[i].text)}</p></div>`).join('');
  $('wreck-body').innerHTML = `
    <p class="note">The colony ship Meridian waits in orbit, its settlers asleep. This mast is how it hears us.</p>
    <h3>LANDERS · ${landers}</h3><p class="note">${esc(landerNote)}</p>
    <h3>SHARDS SET · ${set}/3</h3>${T.biomes.map(shardRow).join('')}
    ${call}
    ${log ? `<h3>THE LOG · ${kindled} KINDLED</h3>${log}` : ''}
    <h3>ECHOES · ${(s.echoes || []).length}/${ECHOES.length}</h3>${echoes || '<p class="note">None yet. The Kindlers before you left logs out in the dark.</p>'}`;
}

// How the last dive ended, over the outpost.
function drawReport() {
  const r = UI.report;
  if (!r) return;
  const where = r.where || '';
  const gear = (items) => (items && items.length ? `${items.length} piece${items.length > 1 ? 's' : ''} of gear` : '');
  const got = [stuffLines(r.banked || r.lost || {}), gear(r.items)].filter(Boolean).join(', ');
  const rows = [], row = (label, cls, text) => rows.push(`<div class="rep-row"><span class="rep-label ${cls}">${label}</span><span class="rep-text">${esc(text)}</span></div>`);
  let title;
  if (r.recalled) {
    title = 'RECALLED';
    if (got) row('BANKED', 'good', got);
    const lost = [stuffLines(r.recalled.lost), gear({ length: r.recalled.lostItems })].filter(Boolean).join(', ');
    if (lost) row('THE DARK KEPT', 'bad', lost);
  } else if (r.banked) { title = 'HOME'; row('BANKED', 'good', got || 'Nothing this time'); }
  else {
    title = r.died ? 'YOU FELL' : 'YOU GAVE UP';
    if (got) row('LOST', 'bad', got);
    const before = r.earlier && [stuffLines(r.earlier.stuff || {}), gear(r.earlier.items)].filter(Boolean).join(', ');
    if (before) row('BANKED BEFORE', 'good', before);
    if (r.wake) row('YOU WAKE', 'gold', `At the spire of ${r.wake}`);
  }
  if (r.kindled) row('KINDLED', 'gold', `${r.kindled} territor${r.kindled > 1 ? 'ies' : 'y'}`);
  if (r.kept && (r.kept.items.length || Object.keys(r.kept.stuff).length)) row('POCKET KEPT', 'gold', [stuffLines(r.kept.stuff), r.kept.items.map((i) => i.name).join(', ')].filter(Boolean).join(', '));
  const learned = (r.learned || []).concat((r.kept && r.kept.blueprints) || []);
  if (learned.length) row('LEARNED', 'gold', learned.map((id) => BLUEPRINTS[id].name).join(', '));
  if (r.lostBlueprints) row('BLUEPRINTS LOST', 'bad', `${r.lostBlueprints}, with the cargo`);
  if (r.shard) row('SHARD', 'gold', 'Carried home. Set it in the star at the altar.');
  for (const c of r.contracts || []) row('CONTRACT DONE', 'good', `${contractText(c)}: ${contractRewardText(c)}`);
  if (r.contracts && r.contracts.bonus) row('THE WHOLE BOARD', 'gold', `+${r.contracts.bonus} more to the star`);
  if (r.echoes) row('ECHOES', 'gold', `${r.echoes} found: read ${r.echoes > 1 ? 'them' : 'it'} at the uplink`);
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

// The tools, under the map: the one carried, the others to carry or make.
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

// The forge's tabs: gear (casters first), then each kind of stone.
const FORGE_TABS = [['GEAR', 'gear'], ['FORMS', 'form'], ['ELEMENTS', 'element'], ['GLYPHS', 'glyph'], ['CODEX', 'codex']];
const FORGE_ORDER = ['caster', 'armor', 'charm', 'pick'];
const forgeTabOf = (id) => BLUEPRINTS[id].stoneKind || 'gear';

// A stand-in piece for a blueprint, for its icon.
function bpSample(id, tier = 1) { const bp = BLUEPRINTS[id]; return bp.kind === 'stone' ? { kind: 'stone', stone: bp.stone, tier, rarity: 'magic' } : { kind: bp.kind, bp: id, tier, rarity: 'common' }; }

// A caster's slots by how the anvil goes, in words.
function slotWords(bpId) {
  const S = T.circuits.bases[BLUEPRINTS[bpId].style].slots, Q = ['rough', 'fair', 'fine', 'masterwork'], by = {};
  S.forEach((n, q) => (by[n] = by[n] || []).push(Q[q]));
  return Object.keys(by).map((n) => `${n} from a ${by[n].join(' or ')} forge`).join(', ');
}

function drawForge() {
  const stash = forgeSource(), F = UI.forge, known = Save.data.blueprints;
  $('forge-title').textContent = F.field ? 'AN ANCIENT FORGE' : 'THE FORGE';
  if (!F.bp || !known.includes(F.bp)) F.bp = known.find((id) => BLUEPRINTS[id].kind === 'caster') || known[0];
  F.tab = F.codex ? 'codex' : forgeTabOf(F.bp);
  if (F.codex) { drawCodex(); return; }
  const bp = BLUEPRINTS[F.bp], stone = bp.kind === 'stone';
  // what this blueprint can be made from, of what's to hand
  const ores = T.ores.filter((o) => (stash[o.id] || 0) > 0);
  const parts = PART_STACK_IDS.filter((id) => (stash[id] || 0) > 0 && bindsWith(F.bp, id));
  const exotics = stone ? [] : T.exotics.filter((x) => (stash[x.id] || 0) > 0);
  if (!F.ore || !stash[F.ore]) F.ore = (ores.find((o) => stash[o.id] >= bp.ore) || ores[0] || T.ores[0]).id;
  if (!F.part || !parts.includes(F.part)) F.part = parts.find((id) => stash[id] >= bp.parts) || parts[0] || null;
  if (F.exotic && (!stash[F.exotic] || stone)) F.exotic = null;
  const ore = T.ores[ORE_INDEX[F.ore]], haveOre = stash[F.ore] || 0, haveParts = F.part ? stash[F.part] || 0 : 0, haveEx = bp.exotic ? stash[bp.exotic] || 0 : 0;
  const ready = haveOre >= bp.ore && (!bp.parts || haveParts >= bp.parts) && (!bp.exotic || haveEx >= 1);

  const tabs = `<div class="chips forge-tabs">${FORGE_TABS.map(([label, tab]) => `<button class="chip ${F.tab === tab ? 'on' : ''}" data-act="forgeTab" data-arg="${tab}">${label}</button>`).join('')}</div>`;
  const inTab = known.filter((id) => forgeTabOf(id) === F.tab).sort((a, b) => FORGE_ORDER.indexOf(BLUEPRINTS[a].kind) - FORGE_ORDER.indexOf(BLUEPRINTS[b].kind) || BP_IDS.indexOf(a) - BP_IDS.indexOf(b));
  const all = BP_IDS.filter((id) => forgeTabOf(id) === F.tab).length;
  const list = `<h3>1 · BLUEPRINT <span class="dim">· ${inTab.length} OF ${all} KNOWN</span></h3>${tabs}<div class="bp-grid bp-strip">${inTab.map((id) => `<button class="bp ${id === F.bp ? 'on' : ''}" data-act="forgeBp" data-arg="${id}"><img class="icon" src="${itemIconUrl(bpSample(id, ore.tier))}" alt=""><span>${esc(BLUEPRINTS[id].name)}</span></button>`).join('')}</div>`;
  const chip = (act, id, label, on, ok = true) => `<button class="chip ${on ? 'on' : ''}" data-act="${act}" data-arg="${id}" ${ok ? '' : 'disabled'}>${label}</button>`;
  const stuffIcon = (id) => `<img class="chip-icon" src="${stuffIconUrl(id)}" alt="">`;
  const oreChips = ores.map((o) => chip('forgeOre', o.id, `${stuffIcon(o.id)}${esc(o.name)}<small>have ${stash[o.id]} · tier ${o.tier}</small>`, o.id === F.ore, stash[o.id] >= bp.ore)).join('') || `<span class="note">${F.field ? 'No ore in your cargo.' : 'No ore banked. Mine some and bring it home.'}</span>`;
  const partWord = bp.partKinds ? bp.partKinds.map((k) => PARTS[k].name).join(' or ') : 'creature parts';
  const partChips = parts.map((id) => { const pk = parsePart(id), fam = PARTS[pk.kind].family; return chip('forgePart', id, `${stuffIcon(id)}${esc(partName(id))}<small>have ${stash[id]} · ${stone ? 'binds it' : fam || 'any'}</small>`, id === F.part, stash[id] >= bp.parts); }).join('')
    || `<span class="note">No ${partWord} ${F.field ? 'in your cargo' : 'banked'}. Creatures leave them when they fall.</span>`;
  // powers the forge remembers, for this kind of piece (at home only)
  const known2 = (Save.data.codex || []).filter((k) => LEGENDARIES[k] && LEGENDARIES[k].kinds.includes(bp.kind));
  if (F.imprint && !known2.includes(F.imprint)) F.imprint = null;
  // paid from what's left once the binding is taken
  const left = Object.assign({}, stash);
  if (F.part && bp.parts) left[F.part] = (left[F.part] || 0) - bp.parts;
  const pay = imprintCost(left), canPay = !!pay;
  if (F.imprint && !canPay) F.imprint = null;
  // what an imprint takes from here, or why it can't be paid
  const hearts = [1, 2, 3].reduce((n, g) => n + Math.max(0, left[partId('heart', g)] || 0), 0);
  const impCost = pay ? `<p class="note cost-line">${F.imprint ? 'Takes' : 'Would take'} ${costTag(pay.id, pay.n, left[pay.id] || 0)}</p>`
    : `<p class="note cost-line short">Needs a heart or ${T.imprint.glass} Riftglass besides the binding: you have ${hearts} heart${hearts === 1 ? '' : 's'} and ${left.riftglass || 0} Riftglass.</p>`;
  const impChips = F.field || stone ? '' : known2.map((k) => chip('forgeImprint', k, `${esc(LEGENDARIES[k].name)}<small>${esc(LEGENDARIES[k].text.toLowerCase())}</small>`, k === F.imprint, canPay)).join('');
  const exWhat = (x) => (x.element ? `${CIRCUIT_ELEMENTS[x.element].name.toLowerCase()} stone` : x.family ? x.family : x.rarity ? 'rarity +1' : x.tierUp ? 'tier +1' : '');
  const exChips = exotics.map((x) => chip('forgeExotic', x.id, `${stuffIcon(x.id)}${esc(x.name)}<small>have ${stash[x.id]} · ${exWhat(x)}</small>`, x.id === F.exotic)).join('');

  // what these parts guarantee
  const pk = F.part && parsePart(F.part), ex = F.exotic && T.exotics.find((e) => e.id === F.exotic);
  const lines = [];
  if (stone) {
    lines.push(`A tier ${ore.tier} ${esc(bp.name)} stone, ${bp.stoneKind === 'element' ? 'an' : 'a'} ${STONE_KIND_NAMES[bp.stoneKind].toLowerCase()} (tier ${Math.min(T.ores.length, ore.tier + 1)} from a fine forge). ${esc(stoneLine(bp.stone))}`);
    lines.push('Socket it into a caster at the locker: it costs nothing to change.');
  } else {
    const tier = Math.min(T.ores.length, ore.tier + (ex && ex.tierUp ? 1 : 0));
    const b = baseStats(bp.kind, tier, bp), base = bp.kind === 'caster' ? `${b.power} spell power` : itemBaseLine({ kind: bp.kind, base: b, tier });
    lines.push(`A tier ${tier} ${esc(bp.name.toLowerCase())}: ${esc(base)}.`);
    if (bp.kind === 'caster') lines.push(`Slots: ${esc(slotWords(F.bp))}.`);
    if (bp.text) lines.push(esc(bp.text));
    if (pk && PARTS[pk.kind].family) lines.push(`Bound with ${esc(partName(F.part).toLowerCase())}: ${pk.grade} ${PARTS[pk.kind].family} affix${pk.grade > 1 ? 'es' : ''} for sure${pk.grade > 1 ? `, ${Math.round(T.items.gradeBoost * (pk.grade - 1) * 100)}% stronger` : ''}.`);
    if (pk && pk.kind === 'heart') lines.push('A heart: a fine forge or better comes out legendary.');
    if (ex && ex.element && bp.kind === 'caster') lines.push(`${esc(ex.name)}: a ${esc(CIRCUIT_ELEMENTS[ex.element].name)} stone comes out with it.`);
    else if (ex && ex.family) lines.push(`${esc(ex.name)}: a ${ex.family} affix for sure.`);
    else if (ex && ex.rarity) lines.push(`${esc(ex.name)}: a rarity higher.`);
    else if (ex && ex.tierUp) lines.push(`${esc(ex.name)}: a tier above its ore.`);
    else if (ex) lines.push(`${esc(ex.name)} does nothing for a ${esc(bp.name.toLowerCase())}.`);
    if (F.imprint) lines.push(`Imprinted with ${esc(LEGENDARIES[F.imprint].name)}: ${esc(LEGENDARIES[F.imprint].text.toLowerCase())}. A fine forge or better sets it; a rougher one, half the time.`);
    lines.push('The rest is in your strikes: rough, fair, fine or masterwork.');
  }
  // what FORGE takes, or why it can't yet
  const exName = bp.exotic && exoticName(bp.exotic);
  const cost = !ready ? (haveOre < bp.ore ? `need ${bp.ore} ${ore.name}, have ${haveOre}` : bp.exotic && haveEx < 1 ? `need 1 ${exName}, have 0` : !F.part ? `need ${bp.parts} ${partWord}` : `need ${bp.parts} ${partName(F.part)}, have ${haveParts}`)
    : [`${bp.ore} ${ore.name}`, bp.parts && `${bp.parts} ${PARTS[parsePart(F.part).kind].name}`, bp.exotic && `1 ${exName}`, !stone && ex && `1 ${ex.name}`, F.imprint && pay && `${pay.n} ${stuffName(pay.id)}`].filter(Boolean).join(', ');
  const need = [`${bp.ore} ore`, bp.parts && `${bp.parts} part${bp.parts > 1 ? 's' : ''}`, bp.exotic && `1 ${exName}`, !stone && 'an exotic if you like'].filter(Boolean).join(' · ');
  let step = 2;
  $('forge-body').innerHTML = `
    ${list}
    <div class="recipe-panel">
      <div class="card-head"><img class="icon big" src="${itemIconUrl(bpSample(F.bp, ore.tier))}" alt=""><div class="grow"><div class="card-name">${esc(bp.name)}${stone ? ' stone' : ''}</div><div class="row-sub">${esc(need)}</div></div></div>
      <h3>${step++} · HEAD <span class="dim">· ${bp.ore} ORE</span></h3><div class="chips">${oreChips}</div>
      ${bp.parts ? `<h3>${step++} · BINDING <span class="dim">· ${bp.parts} ${esc(stone ? partWord.toUpperCase() : `PART${bp.parts > 1 ? 'S' : ''}`)}</span></h3><div class="chips">${partChips}</div>` : ''}
      ${bp.exotic ? `<h3>${step++} · EXOTIC <span class="dim">· IT MAKES THE ELEMENT</span></h3><p class="note cost-line">Takes ${costTag(bp.exotic, 1, haveEx)}</p>` : ''}
      ${exChips ? `<h3>${step++} · EXOTIC <span class="dim">· IF YOU LIKE</span></h3><div class="chips">${exChips}</div>` : ''}
      ${impChips ? `<h3>${step++} · IMPRINT <span class="dim">· A HEART OR ${T.imprint.glass} RIFTGLASS</span></h3>${impCost}<div class="chips">${impChips}</div>` : ''}
      <div class="preview">${lines.map((l) => `<p>${l}</p>`).join('')}</div>
      ${F.field ? '<p class="note">What you forge here goes in your cargo.</p>' : ''}
      <div class="menu forge-go"><button class="btn primary" data-act="craft" ${ready ? '' : 'disabled'}>FORGE<small>${esc(cost.toUpperCase())}</small></button></div>
    </div>`;
  // keep the chosen blueprint in sight in the strip
  const on = document.querySelector('#forge-body .bp.on');
  if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'center' });
}

// The Codex: every resonance as a silhouette, its slot count and the parts
// resonance stones have shown; the whole of one, what it does.
function drawCodex() {
  const tabs = `<div class="chips forge-tabs">${FORGE_TABS.map(([label, tab]) => `<button class="chip ${tab === 'codex' ? 'on' : ''}" data-act="forgeTab" data-arg="${tab}">${label}</button>`).join('')}</div>`;
  const whole = RESONANCES.filter(codexWhole).length;
  const cards = RESONANCES.map((r) => {
    const shown = codexShown(r), all = codexWhole(r);
    const seq = r.seq.map((id, i) => (shown.includes(i) ? stoneTile({ stone: id, tier: 1 }, { mini: true }) : '<span class="tile mini t-unknown" aria-label="Not yet known"><b>?</b></span>')).join('');
    return `<div class="rcard${all ? ' whole' : ''}"><div class="rc-head"><b>${esc(r.name.toUpperCase())}</b><span>${r.seq.length} SLOTS</span></div><div class="mini-circuit">${seq}</div>
      <p class="note">${all ? esc(capFirst(r.text)) + '.' : `${shown.length} of ${r.seq.length} parts known. Resonance stones show the rest.`}</p></div>`;
  }).join('');
  $('forge-body').innerHTML = `<h3>THE CODEX · RESONANCES <span class="dim">· ${whole} OF ${RESONANCES.length} WHOLE</span></h3>${tabs}
    <p class="note">A resonance is an exact circuit that wakes into one spell. It must fill its caster exactly: a ${RESONANCES[0].seq.length}-part one needs a ${RESONANCES[0].seq.length}-slot caster. Resonance stones show their parts: elites drop them now and then, they lie by ancient forges, and contracts pay them.</p>
    <div class="codex">${cards}</div>`;
}

function drawGear() {
  const s = Save.data, st = computeStats(s.equip, s.attune);
  const slots = SLOTS.map((k) => {
    const it = s.equip[k];
    return it ? itemRow(it, 'cardEquip', k, `<span class="slot">${SLOT_NAMES[k]}</span>`)
      : `<div class="row empty"><span class="row-text"><span class="row-name">Empty</span><span class="row-sub">${SLOT_NAMES[k]}</span></span></div>`;
  }).join('');
  const kinds = ['relic', 'caster', 'armor', 'charm', 'pick'];
  const stash = s.items.filter((it) => it.kind !== 'stone').sort((a, b) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind) || b.tier - a.tier)
    .map((it) => itemRow(it, 'cardStash', it.uid, compareTag(it, s.equip))).join('');
  const stones = groupStones(s.items);
  $('gear-title').textContent = UI.gearRunes ? 'THE RUNE BENCH' : 'GEAR';
  $('gear-body').innerHTML = `
    ${UI.gearRunes ? `<p class="note">Tap a piece to rework its affixes: reroll one, raise one, or add one. It's paid in ore of the piece's own tier: ${T.ores.slice(0, 3).map((o) => `${esc(o.name)} for tier ${o.tier}`).join(', ')}, and so on.</p>` : ''}
    <div class="stats">${statLine(st)}</div>
    <h3>WORN</h3>${slots}
    <p class="note">Tap a caster to build its circuit from your stones.</p>
    <h3>STONES · ${stones.reduce((n, x) => n + x.n, 0)}</h3>${stones.length ? `<div class="drawer-row">${stones.map((x) => stoneTile(x, { act: 'cardStone', arg: x.stone + ':' + x.tier, count: x.n })).join('')}</div>` : '<p class="note">None spare. Forge Form, Element and Glyph stones at the forge.</p>'}
    <h3>STASH</h3>${stash || '<p class="note">Nothing banked. Gear you bring home lands here.</p>'}
    ${downgrades().length ? `<div class="menu"><button class="btn danger" data-act="salvageAll">${UI.salvageAllArmed ? `TAP AGAIN: SALVAGE ${downgrades().length}` : `SALVAGE ALL ▼ (${downgrades().length})`}</button></div><p class="note">Breaks down every piece marked ▼ that isn't kept (★). Stones and relics are left alone.</p>` : ''}
    <h3>MATERIALS</h3><p class="note">${esc(stuffLines(s.stash)) || 'None.'}</p>`;
}
function statLine(st) {
  const bits = [`${st.maxHp} health`, `${st.armor} armor`, `${st.cargo} cargo`];
  if (st.closeDmg) bits.push(`+${Math.round(st.closeDmg)}% close`);
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
  const att = Object.entries(T.attune).map(([id, A]) => {
    const r = s.attune[id] || 0;
    return `<div class="row static"><span class="row-text"><span class="row-name">${A.name} ${r}/${A.max}</span><span class="row-sub">${A.text} a rank</span></span><button class="mini" data-act="attune" data-arg="${id}" ${pts > 0 && r < A.max ? '' : 'disabled'}>+</button></div>`;
  }).join('');
  $('star-body').innerHTML = `
    <div class="mag">MAGNITUDE ${mag}${next !== undefined ? ` · ${s.star}/${next}` : ''}</div>
    <p class="note">Ore fed to the star makes it grow. Each magnitude gives an attunement point, makes the star's light likelier to reach down into a Deep, a recall gentler, and now and then a pocket slot more.</p>
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
    ${d.blueprints.length ? `<h3>BLUEPRINTS · LEARNED WHEN BANKED</h3>${d.blueprints.map((b, i) => `<div class="row static"><img class="icon" src="${itemIconUrl(bpSample(b.id))}" alt=""><span class="row-text"><span class="row-name r-legendary">${esc(BLUEPRINTS[b.id].name)}</span><span class="row-sub">Blueprint · weighs 1</span></span>${d.pocket.length < pocketSlots() ? `<button class="mini" data-act="pocketBp" data-arg="${i}">POCKET</button>` : ''}</div>`).join('')}` : ''}
    <h3>FOUND</h3>${items || '<p class="note">Nothing forged or found yet.</p>'}
    <h3>CONTRACTS</h3>${contractRows(d)}
    <h3>WORN</h3>${worn}
    <p class="note">What you wear and what's in your pocket are safe. The rest of the cargo is lost if you fall, until it's banked at a spire.</p>
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
  const runes = home && it.kind !== 'stone' && it.kind !== 'relic' && !(it.kind === 'pick' && it.tier === 0);
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
    ${isCaster(it) ? circuitPanel(it, home, c) : ''}
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
  const what = x ? (x.element ? `Forged into a ${CIRCUIT_ELEMENTS[x.element].name} stone, it gives a spell ${CIRCUIT_ELEMENTS[x.element].name.toLowerCase()} damage: ${CIRCUIT_ELEMENTS[x.element].status}. Worked into a caster, the stone comes with it.` : x.family ? `Worked into a piece at the forge, it's sure to roll a ${x.family} affix.` : x.tierUp ? 'Left where a rift was sealed. Worked into a piece at the forge, it comes out a tier above its ore.' : 'Worked into a piece at the forge, it comes out a rarity higher.')
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
  return s.items.filter((it) => !it.fav && it.kind !== 'stone' && it.kind !== 'relic' && /down/.test(compareTag(it, s.equip)));
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
  closeReport: () => {
    UI.report = null; UI.close();
    Story.starGrew();
  },
  resumeRun: () => { UI.close(); resumeRun(); },
  dropRun: () => {
    UI.close();
    const r = Save.data.run;
    if (!r) return;
    Game.dive = newWorld({ sortie: true, terr: r.terr, depth: 1, zone: 'surface', cargo: r.cargo || {}, items: r.items || [], blueprints: r.blueprints || [], pocket: r.pocket || [], gotShard: r.gotShard, echoes: r.echoes, banked: r.banked });
    abandonDive();
  },
  storyNext: () => {
    const st = UI.story;
    if (!st) return;
    if (++st.i < st.lines.length) { UI.openedAt = Game.realT; UI.redraw(); return; }
    UI.story = null; UI.close();
    if (st.done) st.done();
  },
  // calling the colony down, at the uplink (story.js)
  callLanders: () => { if (Story.canCall()) Story.callLanders(() => UI.useStation('wreck')); },
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
  forgeBp: (id) => { UI.forge.bp = id; UI.forge.part = null; UI.forge.codex = false; UI.redraw(); },
  forgeTab: (tab) => {
    if (tab === 'codex') { UI.forge.codex = true; UI.redraw(); return; }
    const id = Save.data.blueprints.find((b) => forgeTabOf(b) === tab);
    if (id) { UI.forge.bp = id; UI.forge.part = null; UI.forge.codex = false; UI.redraw(); }
  },
  forgePart: (id) => { UI.forge.part = id; UI.redraw(); },
  forgeImprint: (id) => { UI.forge.imprint = UI.forge.imprint === id ? null : id; UI.redraw(); },
  craft: () => {
    const F = UI.forge, src = forgeSource(), bp = BLUEPRINTS[F.bp], stone = bp.kind === 'stone';
    if ((src[F.ore] || 0) < bp.ore || (bp.parts && (!F.part || (src[F.part] || 0) < bp.parts)) || (bp.exotic && !(src[bp.exotic] > 0))) return;
    if (F.imprint && !F.field && !stone) { const left = Object.assign({}, src); if (bp.parts) left[F.part] -= bp.parts; if (!imprintCost(left)) return; }
    const take = (id, n) => { src[id] -= n; if (!src[id]) delete src[id]; };
    take(F.ore, bp.ore);
    if (bp.parts) take(F.part, bp.parts);
    let exotic = null;
    if (bp.exotic) { exotic = bp.exotic; take(exotic, 1); }
    else if (!stone && F.exotic && (src[F.exotic] || 0) > 0) { exotic = F.exotic; take(F.exotic, 1); }
    F.exotic = null;
    let imprint = null;
    if (F.imprint && !F.field && !stone && imprintCost(src)) {
      const pay = imprintCost(src);
      take(pay.id, pay.n);
      imprint = F.imprint;
    }
    F.imprint = null;
    if (!F.field) Save.save();
    snd('forgeFire');
    Anvil.start({ bp: F.bp, ore: F.ore, part: bp.parts ? F.part : null, exotic, imprint, field: !!F.field });
  },
  equip: (slot) => {
    const c = UI.card, it = c.item, eq = Save.data.equip;
    const list = c.where === 'cargo' ? Game.dive.items : Save.data.items;
    removeFrom(list, it);
    const old = eq[slot];
    if (old) list.push(old);
    eq[slot] = it;
    // a caster with nothing in it takes the circuit of the one it replaces
    if (isCaster(it) && isCaster(old) && !it.slots.some(Boolean) && old.slots.some(Boolean)) { moveCircuit(old, it, list); UI.toast('The circuit moves across'); }
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
    for (const st of it.slots || []) if (st) list.push(st);
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
    snd('unseal');
    Reveal.show(item, 'stash', UI.screen);
  },
  reroll: (i) => { const it = UI.card.item; if (spendOre(runeOre(it), T.runes.reroll)) { rerollAffix(Save.rng(), it, Number(i)); afterChange(); } },
  upgrade: (i) => { const it = UI.card.item; if (it.affixes[i].up < 2 && spendOre(runeOre(it), T.runes.upgrade)) { upgradeAffix(it, Number(i)); afterChange(); } },
  addAffix: () => { const it = UI.card.item; if (canAddAffix(it) && spendOre(runeOre(it), T.runes.add)) { addAffix(Save.rng(), it); afterChange(); } },
  // the circuit, at home: a slot chosen (tapped again, it's emptied), a
  // stone set in it from the stash, or taken out
  slotPick: (i) => {
    const c = UI.card, it = c.item;
    i = Number(i);
    if (c.slot === i && it.slots[i]) { Save.data.items.push(it.slots[i]); it.slots[i] = null; afterChange(); return; }
    c.slot = i; UI.redraw();
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
    const rng = Save.rng(), s = Save.data.stash, got = {};
    for (const it of downgrades()) {
      const y = salvageYield(rng, it);
      for (const st of it.slots || []) if (st) Save.data.items.push(st);
      removeFrom(Save.data.items, it);
      s[y.ore] = (s[y.ore] || 0) + y.n; got[y.ore] = (got[y.ore] || 0) + y.n;
      if (y.part) { s[y.part] = (s[y.part] || 0) + 1; got[y.part] = (got[y.part] || 0) + 1; }
      if (y.exotic) { s[y.exotic] = (s[y.exotic] || 0) + 1; got[y.exotic] = (got[y.exotic] || 0) + 1; }
    }
    UI.toast('Salvaged for ' + stuffLines(got));
    afterChange();
  },
  feed: (arg) => {
    const [id, n] = arg.split(':'), s = Save.data, before = magnitudeOf(s.star);
    const k = n === 'all' ? s.stash[id] || 0 : Math.min(10, s.stash[id] || 0);
    if (!k || !spendOre(id, k)) return;
    s.star += k * orePoints(id);
    const after = magnitudeOf(s.star);
    Save.save();
    // out to the outpost, to watch the star drink it (and hear it: the
    // stream of ore, then the bloom of a magnitude reached as it lands)
    snd('starFeed', { tier: T.ores[ORE_INDEX[id]].tier, rate: k, n: k, stream: true });
    if (after > before) snd('starGrow', { mag: after, delay: 1.4 });
    if (Game.dive && Game.dive.hub) { UI.close(); feedStarFx(Game.dive, k, after > before ? after : 0); if (after > before) Story.starGrew(); }
    else UI.redraw();
  },
  // the pause screen's sound settings: on, soft, off, round again
  soundSet: (kind) => {
    const s = Save.data.settings || (Save.data.settings = {}), v = Snd.level(kind);
    s[kind] = v >= 1 ? T.sound.soft : v > 0 ? 0 : 1;
    Save.saveField('settings');
    Snd.applyLevels(false);
    drawSoundButtons();
  },
  attune: (id) => {
    const s = Save.data;
    if (attunePointsLeft(s) <= 0 || (s.attune[id] || 0) >= T.attune[id].max) return;
    s.attune[id] = (s.attune[id] || 0) + 1;
    afterChange();
  },
};


// The pause screen's sound settings, as they stand.
function drawSoundButtons() {
  const word = (k) => { const v = Snd.level(k); return v >= 1 ? 'ON' : v > 0 ? 'SOFT' : 'OFF'; };
  setTextIfChanged('pause-music', `MUSIC: ${word('music')}`);
  setTextIfChanged('pause-sfx', `SOUNDS: ${word('sfx')}`);
}

// A caster's stones moved into another, slot for slot; what doesn't fit goes
// to `list`.
function moveCircuit(from, to, list) {
  from.slots.forEach((st, i) => { if (!st) return; if (i < to.slots.length) to.slots[i] = st; else list.push(st); from.slots[i] = null; });
}
