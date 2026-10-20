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
  return stuffIds().filter((id) => stash[id]).map((id) => `${stash[id]} ${id === 'thread' ? (stash[id] === 1 ? 'thread' : 'threads') : stuffName(id)}`).join(', ');
}
const exoticName = (id) => T.exotics.find((x) => x.id === id).name;
const stuffIds = () => T.ores.map((o) => o.id).concat(PART_STACK_IDS, T.exotics.map((x) => x.id), ['thread'], LIGHT_IDS);
const stuffName = (id) => (id === 'thread' ? 'Thread' : ORE_INDEX[id] !== undefined ? T.ores[ORE_INDEX[id]].name : parsePart(id) ? partName(id) : isLight(id) ? LIGHT_KINDS[id].name : exoticName(id));

// A cost that can't be missed: the material's icon, how many and what,
// and how many there are, in red when it's short.
function costTag(id, n, have, name = stuffName(id)) {
  return `<span class="cost-tag${have < n ? ' short' : ''}"><img class="cost-icon" src="${stuffIconUrl(id)}" alt="">${n} ${esc(name)} <span class="cost-have">· have ${have}</span></span>`;
}

function iconImg(item, cls = 'icon') { return `<img class="${cls}" src="${itemIconUrl(item)}" alt="">`; }
function itemRow(item, act, arg, tag = '') {
  if (item.kind === 'module') return moduleRow(item, act, arg, tag);
  return `<button class="row" data-act="${act}" data-arg="${arg}">${iconImg(item)}<span class="row-text"><span class="row-name ${item.q ? 'q-' + item.q : 'r-' + item.rarity}">${item.fav ? '★ ' : ''}${esc(item.name)}</span><span class="row-sub">${esc(itemKindLine(item))}</span><span class="row-gems">${isCaster(item) ? miniCircuit(item) : ''}${item.sockets ? miniSockets(item) : ''}</span></span>${tag}</button>`;
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
function circuitPanel(it, edit, c, drawer = edit) {
  if (edit && (typeof c.slot !== 'number' || c.slot >= it.slots.length)) c.slot = Math.max(0, it.slots.indexOf(null));
  const R = circuitReadout(it), links = it.links || [];
  // a linked pair: a chain drawn between its two tiles
  const tiles = it.slots.map((st, i) => (i ? `<span class="link${links.includes(i - 1) ? ' linked' : ''}" aria-hidden="true"></span>` : '') + stoneTile(st, Object.assign(edit ? { act: 'slotPick', arg: i, sel: drawer && c.slot === i } : {}, { linked: slotLinked(links, i) }))).join('');
  let h = `<h3>CIRCUIT · ${it.slots.length} SLOTS${links.length ? ' · 2 LINKED' : ''}</h3><div class="circuit${it.slots.length > 5 ? ' long' : ''}">${tiles}</div>`;
  // a resonance: a gold banner when it's live; a stir when it's a stone away
  const near = resonanceNear(it);
  if (near && near.live) h += `<div class="res-banner on">✦ RESONANCE · ${esc(near.live.name.toUpperCase())}</div><p class="res-text">${esc(capFirst(near.live.text))}. It hits ${Math.round((resonanceMult(it) - 1) * 100)}% harder.</p>`;
  else if (near && near.stir) h += `<div class="res-banner stir">Resonance stirs…${codexWhole(near.stir) ? ` one stone from ${esc(near.stir.name)}` : ''}</div>`;
  h += `<p class="circuit-cost">Costs <b>${R.cost} charge</b> a cast · held, <b>${R.held} charge</b>${R.close ? ' · close Forms give charge back' : ''}</p>`;
  h += `<div class="readout">${R.lines.map((l) => `<p${l.warn ? ' class="warn"' : l.ore ? ' class="ore"' : l.link ? ' class="linked"' : ''}>${esc(l.text)}</p>`).join('')}</div>`;
  if (!edit) return h + (c.where === 'cargo' || c.where === 'worn' ? '<p class="note">Its stones can be changed at home, at the locker.</p>' : '');
  if (!drawer) return h + '<p class="note">Tap a slot to change its stone.</p>';
  const sel = it.slots[c.slot], have = groupStones(Save.data.items);
  const grp = (kind, label, none) => {
    const list = have.filter((x) => stoneKind(x.stone) === kind);
    return `<div class="drawer-grp"><div class="gl">${label}</div><div class="drawer-row">${list.length ? list.map((x) => stoneTile(x, { act: 'slotPut', arg: x.stone + ':' + x.tier, count: x.n })).join('') : `<span class="note">${none}</span>`}</div></div>`;
  };
  h += `<div class="drawer"><div class="drawer-head"><span>SLOT ${c.slot + 1} · ${sel ? `${esc(stoneWords(sel.stone).name.toUpperCase())} · TIER ${sel.tier}` : 'EMPTY'}</span>${sel ? '<button class="mini" data-act="slotEmpty">TAKE OUT</button>' : ''}</div>
    <p class="note">Tap a stone to set it in slot ${c.slot + 1}. Socketing is free: change it as often as you like.</p>
    ${grp('form', 'FORMS · THE SHAPE', 'No spare Form stones: forge them at the forge.')}
    ${grp('element', 'ELEMENTS · THE DAMAGE', 'No Element stones: forge them from exotics, or Force from ore.')}
    ${grp('glyph', 'GLYPHS · WHAT CHANGES IT', 'No Glyph stones: forge them from creature parts.')}</div>`;
  return h;
}
// ▲ or ▼ against what's worn in the slot it would go in
function compareTag(item, equip) {
  if (item.kind === 'module') return moduleTag(item, equip);
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
  card: null, // { item, where, key, slot (the circuit's chosen slot), sock (the chosen socket), focus ('circuit' or 'modules'), bench, fuse }
  forge: { bp: null, ore: null, size: null, exotic: null, field: false },

  init() {
    for (const s of document.querySelectorAll('.screen')) s.addEventListener('click', (e) => UI.onTap(e));
    // a tap on the dark round the card closes it, as ✕ does
    $('card').addEventListener('click', (e) => { if (e.target === $('card')) { if (Game.realT - UI.openedAt >= T.ui.tapGuard) UI.acts.closeCard(); } else UI.onTap(e); });
    $('btn-pause').addEventListener('click', () => { if (Game.dive && !Game.modal) UI.openPause(); });
    $('btn-cargo').addEventListener('click', () => { if (Game.dive && !Game.dive.hub && !Game.modal) UI.openCargo(); });
    // TRAVEL at a spire; at the star's altar, ATTUNE (its screen)
    $('btn-act2').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!Game.dive || Game.modal) return;
      if (!Game.dive.hub) UI.openMap('travel');
      else if (actionHere() === 'altar') UI.show('screen-star');
      else if (actionHere() === 'forge') UI.show('screen-supplies');
    });
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
    // (news from the world goes too: it would lie over the panel's first line)
    for (const t of [...$('toasts').children]) {
      if (!t.classList.contains('r-tip')) { t.remove(); continue; }
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
    const r = { 'screen-resume': drawResume, 'screen-report': drawReport, 'screen-story': drawStory, 'screen-wreck': drawUplink_, 'screen-setout': drawSetOut, 'screen-forge': drawForge, 'screen-gear': drawGear, 'screen-bench': drawBench, 'screen-research': drawResearch, 'screen-star': drawStar, 'screen-cargo': drawCargo, 'screen-supplies': drawSupplies }[UI.screen];
    if (r) r();
    if (UI.card) drawCard();
    UI.placeToasts();
  },

  // report: how the last dive ended
  openReport(report) {
    UI.report = report;
    $('toasts').innerHTML = '';
    UI.show('screen-report');
  },

  // Walking up to a station in the outpost (or an ancient forge in a dive).
  useStation(id) {
    if (id === 'forge' || id === 'fieldForge') openForge(id === 'fieldForge');
    else if (id === 'altar') {
      if (Story.setShards()) { feedStarFx(Game.dive, 40, 0); snd('starFeed', { tier: 6, rate: 8, n: 24, stream: true }); return; }
      UI.show('screen-star');
    }
    else if (id === 'locker') UI.show('screen-gear');
    else if (id === 'runes') UI.show('screen-bench');
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
    UI.placeToasts();
  },
  closeCard() { UI.card = null; $('card').hidden = true; UI.placeToasts(); },

  // Someone speaking: Wick, or the star. Lines wait their turn.
  // A line spoken, queued behind any still being said. Lines wait while a
  // screen is open, so none is lost under a menu.
  // A line belongs to the place it was said in (placeKey): one that hasn't
  // begun by the time that place is left, or that has waited behind
  // others for long, is dropped, as it's no longer about anything here (a
  // first-time line of Wick's, `id`, is kept for the next time).
  speak(who, text, style = 'wick', id = null) {
    UI.lines = UI.lines || [];
    UI.lines.push({ who, text, style, t: 2.6 + text.length * 0.045, at: UI.placeKey(), id, waited: 0 });
  },
  updateSpeech(dt) {
    if (UI.lines && UI.lines.length) {
      const at = UI.placeKey();
      UI.lines = UI.lines.filter((l) => {
        if (!l.shown && !Game.modal) l.waited += dt || 0;
        // (one already being said is let finish)
        if (l.shown || (l.at === at && l.waited < T.ui.lineWait)) return true;
        if (!l.shown && l.id && Save.data.said) delete Save.data.said[l.id];
        return false;
      });
    }
    const l = UI.lines && UI.lines[0], box = $('speech');
    if (!l || Game.modal) { if (!box.hidden) box.hidden = true; return; }
    if (box.hidden || box.dataset.line !== l.text) {
      box.hidden = false;
      box.className = 'speech ' + l.style;
      box.innerHTML = `<b>${esc(l.who)}</b> ${esc(l.text)}`;
      box.dataset.line = l.text;
      snd('speak', { style: l.style });
    }
    l.shown = true;
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
    UI.placeToasts();
    if (kind === 'tip') UI.hintsSeen.add(msg);
    setTimeout(() => { el.remove(); UI.pumpToasts(); }, secs * 1000);
  },
  // Over a card, the toasts sit under its bar, clear of KEEP and its way
  // out (else where the stylesheet puts them).
  placeToasts() {
    const box = $('toasts'), bar = UI.card && !$('card').hidden && document.querySelector('#card-body .card-bar');
    const top = bar ? Math.round(bar.getBoundingClientRect().bottom + 4) + 'px' : '';
    if (box.style.top !== top) box.style.top = top;
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
    drawSupplyDeck(d);
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
    setTextIfChanged('btn-act', rh ? (rh.gate ? 'ENTER THE TEAR' : 'SEAL THE TEAR') : way || { setout: 'SET OUT', extract: d.deep ? 'RISE TO THE SURFACE' : 'BANK', stone: 'LIGHT THE WAYSTONE', plant: d.terr && !starHoldsSpire(d.terr) ? `SPIRE · MAGNITUDE ${spireMagFor(d.terr)}` : 'PLANT THE SPIRE', forge: 'FORGE', runes: 'REWORK', locker: 'OPEN LOCKER', altar: Story.shardsHeld() > Story.shardsSet() ? 'SET THE SHARD' : d.feed && d.feed.ore ? `GIVING ${stuffName(d.feed.ore).toUpperCase()} · ${Save.data.stash[d.feed.ore] || 0}` : lightWaiting() ? `FEED THE STAR · ${lightWaiting()}` : 'FEED THE STAR', wreck: 'OPEN THE UPLINK' }[a] || '');
    if (d.channel) setTextIfChanged('hud-depth', { recall: 'RECALLING…', seal: 'SEALING…', stone: 'LIGHTING…', plant: 'PLANTING…', travel: 'TRAVELLING…', extract: d.deep ? 'RISING…' : 'BANKING…' }[d.channel.kind] || 'RISING…');
    if (btn.hidden !== !a) btn.hidden = !a;
    // at a spire (or a beacon's light), TRAVEL too; at the altar, ATTUNE; at
    // the fabricator, SUPPLIES (supplies.js)
    const travel = a === 'extract' && d.sortie && !d.deep, attune = a === 'altar', sup = a === 'forge' && d.hub, b2 = $('btn-act2');
    if (b2.hidden !== !(travel || attune || sup)) { b2.hidden = !(travel || attune || sup); document.body.classList.toggle('act2', !b2.hidden); }
    if (travel || attune || sup) { const pts = attune ? attunePointsLeft(Save.data) : 0; setTextIfChanged('btn-act2', travel ? 'TRAVEL' : sup ? 'SUPPLIES' : pts > 0 ? `ATTUNE · ${pts}` : 'ATTUNE'); }
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
  const call = Story.landersCalled() ? '<p class="note">The colony is down. The ground round the star is theirs now, and the dark beyond it is still yours to walk.</p>'
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
    <h3>ECHOES · ${(s.echoes || []).length}/${ECHOES.length}</h3>${echoes || '<p class="note">None yet. The Kindlers before you left logs out in the dark.</p>'}
    <h3>THE LANDING</h3><p class="note">The Meridian's record of how we came down.</p>
    <div class="menu"><button class="btn" data-act="replayIntro">WATCH THE LANDING AGAIN</button></div>`;
}

// How the last dive ended, over the outpost.
function drawReport() {
  const r = UI.report;
  if (!r) return;
  const where = r.where || '';
  const gear = (items) => {
    if (!items || !items.length) return '';
    const m = items.filter && items.filter((it) => it.kind === 'module').length, g = items.length - (m || 0);
    return [m ? `${m} module${m > 1 ? 's' : ''}` : '', g ? `${g} piece${g > 1 ? 's' : ''} of gear` : ''].filter(Boolean).join(', ');
  };
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
    if (r.died) {
      // the haul waits where it fell (deeds.js)
      const c = r.cache;
      if (c) row('YOUR PACK', 'gold', `Left where you fell, in ${c.where}: ${[stuffLines(c.cargo), gear(c.items), c.blueprints.length ? `${c.blueprints.length} blueprint${c.blueprints.length > 1 ? 's' : ''}` : ''].filter(Boolean).join(', ')}. Go back for it: it waits there once. Fall again before you reach it, and it's lost.`);
      const o = r.oldCache;
      if (o) row('LOST TO THE DARK', 'bad', `Your older pack, in ${o.where}: ${[stuffLines(o.cargo), gear(o.items)].filter(Boolean).join(', ') || 'what was in it'}`);
    } else if (got) row('LOST', 'bad', got);
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
  if (r.contracts && r.contracts.bonus) row('THE WHOLE BOARD', 'gold', `Supplies besides: ${r.contracts.bonus.join(', ')}`);
  if (r.echoes) row('ECHOES', 'gold', `${r.echoes} found: read ${r.echoes > 1 ? 'them' : 'it'} at the uplink`);
  // the star: the light this sortie earned, what's waiting at the altar,
  // and how far to the next magnitude
  const s = Save.data, mag = magnitudeOf(s.star), lo = T.star.levels[mag - 1], hi = T.star.levels[mag], L = r.light || {}, wait = lightWaiting();
  const earned = [L.heartlight ? `${L.heartlight} heartlight` : '', (r.banked || {}).deeplight ? `${r.banked.deeplight} deeplight` : ''].filter(Boolean).join(', ');
  let star = '';
  if (earned || wait) {
    const k = hi ? Math.min(1, (s.star - lo) / (hi - lo)) : 1, k2 = hi ? Math.min(1, (s.star + wait - lo) / (hi - lo)) : 1;
    star = `<div class="rep-star"><div class="rep-row"><span class="rep-label gold">THE STAR</span><span class="rep-text">${earned ? `+${esc(earned)}. ` : ''}${wait} light waiting: feed it to the star at the altar${hi ? ` (${Math.max(0, hi - s.star)} to magnitude ${mag + 1})` : ''}.</span></div><div class="bar rep-bar"><div class="fill wait" style="width:${Math.round(k2 * 100)}%"></div><div class="fill" style="width:${Math.round(k * 100)}%"></div></div></div>`;
  }
  $('report-title').textContent = title;
  $('report-body').innerHTML = `<p class="rep-where">${esc(where)}</p>${rows.join('')}${star}`;
}

// The tools, under the map: the one carried, the others to carry, and
// those not made yet (they're made at the forge).
function drawToolRows() {
  const s = Save.data;
  return `<h3>TOOLS · CARRY ONE</h3>` + TOOL_IDS.map((id) => {
    const t = TOOLS[id], own = toolOwned(id), open = toolOpen(id), on = s.tool === id, known = id === 'compass' || s.blueprints.includes('tool_' + id);
    const sub = own ? esc(t.text) : !known ? 'Not yet known: the forge will work it out from something you bring home.' : open ? `Made at the forge (TOOLS). ${esc(t.text)}` : `The star must reach magnitude ${T.tools[id].mag}.`;
    const tag = own ? (on ? '<span class="row-tag r-legendary">CARRIED</span>' : '') : '';
    return `<div class="row ${own ? '' : 'static'} ${on ? 'on' : ''}" ${own && !on ? `data-act="carryTool" data-arg="${id}"` : ''} ${own || (open && known) ? '' : 'style="opacity:.55"'}><img class="icon" src="${toolIconUrl(id)}" alt=""><span class="row-text"><span class="row-name">${esc(t.name)}</span><span class="row-sub">${sub}</span></span>${tag}</div>`;
  }).join('');
}

// The star's screen, at its altar: its magnitude, the light waiting, what
// grows it and what it opens, and the attunements.
function drawStar() {
  const s = Save.data, mag = magnitudeOf(s.star), next = T.star.levels[mag], pts = attunePointsLeft(s), wait = lightWaiting();
  const light = LIGHT_IDS.slice().reverse().map((id) => `<div class="row static"><img class="icon" src="${lightIconUrl(id)}" alt=""><span class="row-text"><span class="row-name">${esc(LIGHT_KINDS[id].name)} × ${s.stash[id] || 0}</span><span class="row-sub">${esc(LIGHT_KINDS[id].text)}</span></span></div>`).join('');
  const shards = Story.shardsHeld() - Story.shardsSet();
  const att = Object.entries(T.attune).map(([id, A]) => {
    const r = s.attune[id] || 0;
    return `<div class="row static"><span class="row-text"><span class="row-name">${A.name} ${r}/${A.max}</span><span class="row-sub">${A.text} a rank</span></span><button class="mini" data-act="attune" data-arg="${id}" ${pts > 0 && r < A.max ? '' : 'disabled'}>+</button></div>`;
  }).join('');
  const D = T.deeds, ring = (r) => `ring ${r}`;
  const grows = [
    `Kindling a territory: ${D.heart.slice(1, 4).map((n, i) => `${n} heartlight in ${ring(i + 1)}`).join(', ')}, ${D.heart[4]} at the Edge.`,
    `Reaching a Deep's end the first time: ${D.deepEnd[1]} deeplight in ring 1 to ${D.deepEnd[4]} at the Edge, ${D.deepSite} more for each site past the first.`,
    `An ancient forge found: ${D.forge} deeplight. An echo: ${D.echo}.`,
    `A Keeper's shard, set here: ${T.story.shardStar}.`,
  ];
  const reach = T.star.ringMag.slice(2).map((m, i) => `<span class="${mag >= m ? 'ok' : ''}">${i + 2 === 4 ? 'The Edge' : 'Ring ' + (i + 2)}: magnitude ${m}${mag >= m ? ' ✓' : ''}</span>`).join(' · ');
  $('star-body').innerHTML = `
    <div class="mag">MAGNITUDE ${mag}${next !== undefined ? ` · ${s.star}/${next}` : ''}</div>
    ${wait ? `<div class="bar rep-bar star-bar"><div class="fill wait" style="width:${Math.round(Math.min(1, next ? (s.star + wait - T.star.levels[mag - 1]) / (next - T.star.levels[mag - 1]) : 1) * 100)}%"></div><div class="fill" style="width:${Math.round(Math.min(1, next ? (s.star - T.star.levels[mag - 1]) / (next - T.star.levels[mag - 1]) : 1) * 100)}%"></div></div>` : ''}
    <h3>LIGHT WAITING · ${wait}${shards > 0 ? ` · ${shards} SHARD${shards > 1 ? 'S' : ''}` : ''}</h3>
    <p class="note">${wait ? 'Hold FEED THE STAR at the altar and the light rises into it, mote by mote, faster the longer you hold. Let go to stop.' : 'None yet. The star grows from what you do out there, not from ore: bring its light home.'}</p>
    ${light}
    <h3>WHAT GROWS IT</h3><div class="next-steps">${grows.map((l) => `<p>${esc(l)}</p>`).join('')}</div>
    <h3>ITS REACH</h3><p class="note">A spire holds only where the star's light reaches. ${reach}.</p>
    <p class="note">Each magnitude also gives an attunement point, makes the star's light likelier to reach down into a Deep, a recall gentler, and now and then a pocket slot more.</p>
    <h3>ATTUNEMENTS · ${pts} POINT${pts === 1 ? '' : 'S'}</h3>${att}`;
}

function drawCargo() {
  const d = Game.dive;
  if (!d) return;
  const mods = d.items.filter((it) => it.kind === 'module'), items = d.items.filter((it) => it.kind !== 'module').map((it) => itemRow(it, 'cardCargo', it.uid, compareTag(it, Save.data.equip))).join('');
  const worn = SLOTS.filter((k) => Save.data.equip[k]).map((k) => itemRow(Save.data.equip[k], 'cardWorn', k, `<span class="slot">${SLOT_NAMES[k]}</span>`)).join('');
  const stuff = stuffIds().filter((id) => d.cargo[id]).map((id) => `<button class="row" data-act="cardStuff" data-arg="${id}"><img class="icon" src="${stuffIconUrl(id)}" alt=""><span class="row-text"><span class="row-name">${esc(stuffName(id))} × ${d.cargo[id]}</span><span class="row-sub">${ORE_INDEX[id] !== undefined ? 'Ore' : parsePart(id) ? 'Creature part' : isLight(id) ? 'Light for the star' : id === 'thread' ? 'Threads, from a module unravelled' : 'Exotic material'} · weighs ${isLight(id) ? 'nothing' : d.cargo[id]}</span></span></button>`).join('');
  const heart = (d.tally && d.tally.light && d.tally.light.heartlight) || 0, pack = Save.data.cache;
  const slots = pocketSlots(), pocket = d.pocket.map((e, i) => `<div class="row static">${e.item ? iconImg(e.item) : e.blueprint ? `<img class="icon" src="${recipeIconUrl(e.blueprint)}" alt="">` : `<img class="icon" src="${stuffIconUrl(e.stuff)}" alt="">`}<span class="row-text"><span class="row-name ${e.item ? 'r-' + e.item.rarity : e.blueprint ? 'r-legendary' : ''}">${esc(e.item ? e.item.name : e.blueprint ? 'Blueprint: ' + BLUEPRINTS[e.blueprint].name : `${stuffName(e.stuff)} × ${e.n}`)}</span><span class="row-sub">In the pocket</span></span><button class="mini" data-act="unpocket" data-arg="${i}">TAKE OUT</button></div>`).join('');
  $('cargo-body').innerHTML = `
    <div class="mag">CARGO ${cargoUsed(d)}/${d.stats.cargo}</div>
    <h3>POCKET · ${d.pocket.length}/${slots}</h3>
    ${pocket || '<p class="note">Empty. Whatever you pocket comes home even if you fall: tap something below to pocket it.</p>'}
    ${heart ? `<p class="note">${heart} heartlight earned this sortie: bound to you, safe whatever happens.</p>` : ''}
    <h3>ORE AND MATERIALS</h3>${stuff || '<p class="note">No ore yet.</p>'}
    ${supplyMakeHtml()}
    ${d.blueprints.length ? `<h3>BLUEPRINTS · LEARNED WHEN BANKED</h3>${d.blueprints.map((b, i) => `<div class="row static"><img class="icon" src="${recipeIconUrl(b.id)}" alt=""><span class="row-text"><span class="row-name r-legendary">${esc(BLUEPRINTS[b.id].name)}</span><span class="row-sub">Blueprint · weighs 1</span></span>${d.pocket.length < pocketSlots() ? `<button class="mini" data-act="pocketBp" data-arg="${i}">POCKET</button>` : ''}</div>`).join('')}` : ''}
    <h3>MODULES · ${mods.length} · WEIGH ${T.modules.weight} EACH</h3>${mods.map((m) => moduleRow(m, 'cardCargo', m.uid, moduleTag(m, Save.data.equip))).join('') || '<p class="note">None caught yet. When a creature falls, the suit catches its pattern now and then.</p>'}
    ${items ? `<h3>FOUND</h3>${items}` : ''}
    <h3>CONTRACTS</h3>${contractRows(d)}
    <h3>WORN</h3>${worn}
    <p class="note">What you wear, your pocket and your supplies are safe. If you fall, the rest of the cargo stays where you fell, in your pack: go back for it once. Fall again first and it's lost. Bank at a spire to be sure of it.</p>
    ${pack ? `<p class="note gold">Your pack waits in ${esc(pack.where)}.</p>` : ''}
    <div class="menu"><button class="btn" data-act="recall">EMERGENCY RECALL · LOSE ${Math.round(recallCost(d) * 100)}%</button></div>`;
}

// ---------------------------------------------------------------------------
// The cards (gearui.js draws the gear's)
// ---------------------------------------------------------------------------

// The card's header, held above what scrolls: where the piece is, KEEP,
// and the way out.
function cardBar(where, extra = '') {
  return `<div class="card-bar"><span class="card-where">${esc(where)}</span>${extra}<button class="head-close" data-act="closeCard" aria-label="Close">✕</button></div>`;
}

// Ore or an exotic in the cargo: how much, and dropping some.
function drawStuffCard(id) {
  const n = (Game.dive && Game.dive.cargo[id]) || 0, x = T.exotics.find((e) => e.id === id), pk = parsePart(id);
  const what = id === 'thread' ? 'A module unravelled. Threads pay for work at the rune bench: a tier up, a trait rerolled, two fused.'
    : x ? (x.element ? `Forged into a ${CIRCUIT_ELEMENTS[x.element].name} stone, it gives a spell ${CIRCUIT_ELEMENTS[x.element].name.toLowerCase()} damage: ${CIRCUIT_ELEMENTS[x.element].status}. Worked into a caster, the stone comes with it.` : x.id === 'bloodresin' ? 'At the rune bench, a trait rerolled with it comes out leech: a share of the damage you deal heals you.' : x.tierUp ? 'Left where a rift was sealed. Worked into a piece at the forge, it comes out a tier above its ore; at the rune bench, it imprints a power.' : 'At the rune bench, it adds a trait to a common or magic module.')
    : pk ? (PARTS[pk.kind].family ? `A creature part, for the forge: ${Object.keys(BLUEPRINTS).filter((b) => BLUEPRINTS[b].need && BLUEPRINTS[b].need[pk.kind] && !BLUEPRINTS[b].stone).map((b) => BLUEPRINTS[b].name.toLowerCase()).join(', ') || 'stones'} take it.` : "A warden's heart. At the rune bench, it imprints a power the forge remembers into a module.")
    : isLight(id) ? LIGHT_KINDS[id].text
    : `Tier ${T.ores[ORE_INDEX[id]].tier} ore. Forge with it, or make supplies from it.`;
  $('card-body').innerHTML = cardBar('IN YOUR CARGO') + `<div class="card-scroll">
    <div class="card-head"><img class="icon big" src="${stuffIconUrl(id)}" alt=""><div><div class="card-name">${esc(stuffName(id))} × ${n}</div><div class="row-sub">${id === 'thread' ? 'Threads' : x ? 'Exotic material' : pk ? 'Creature part' : isLight(id) ? 'Light for the star' : 'Ore'}</div></div></div>
    <p class="base">${esc(what)}</p>
    <div class="menu">
      ${n && Game.dive.pocket.length < pocketSlots() ? `<button class="btn" data-act="pocket" data-arg="${T.cargo.pocketStack}">POCKET ${Math.min(n, T.cargo.pocketStack)} (SAFE IF YOU FALL)</button>` : ''}
      ${n ? `<button class="btn danger" data-act="dropStuff" data-arg="1">DROP 1</button>` : ''}
      ${n > 5 ? `<button class="btn danger" data-act="dropStuff" data-arg="5">DROP 5</button>` : ''}
      ${n > 1 ? `<button class="btn danger" data-act="dropStuff" data-arg="all">DROP ALL</button>` : ''}
    </div></div>`;
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
  // (built while loading, if it was: loader.js)
  resumeRun: () => { UI.close(); if (!loaderCarryOn()) resumeRun(); },
  dropRun: () => {
    UI.close();
    Loader.landed = null;
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
  // the opening again, from the uplink (intro.js)
  replayIntro: () => { UI.close(); Intro.play(null); },
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

  // the pause screen's sound settings: on, soft, off, round again
  soundSet: (kind) => {
    const s = Save.data.settings || (Save.data.settings = {}), v = Snd.level(kind);
    s[kind] = v >= 1 ? T.sound.soft : v > 0 ? 0 : 1;
    Save.saveField('settings');
    Snd.applyLevels(false);
    drawSoundButtons();
  },
  // the pause screen's lamp: a beam the way you're turned, or the round
  // glow (render.js lampBeamOf; an example to compare)
  lampSet: () => {
    const s = Save.data.settings || (Save.data.settings = {});
    s.lamp = lampIsBeam() ? 'glow' : 'beam';
    Save.saveField('settings');
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
  setTextIfChanged('pause-lamp', `LAMP: ${lampIsBeam() ? 'BEAM' : 'GLOW'}`);
}

// A caster's stones moved into another, slot for slot; what doesn't fit goes
// to `list`.
function moveCircuit(from, to, list) {
  from.slots.forEach((st, i) => { if (!st) return; if (i < to.slots.length) to.slots[i] = st; else list.push(st); from.slots[i] = null; });
}
