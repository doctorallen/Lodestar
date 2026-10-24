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
const stuffIds = () => T.ores.map((o) => o.id).concat(PART_STACK_IDS, T.exotics.map((x) => x.id), LIGHT_IDS);
const stuffName = (id) => (ORE_INDEX[id] !== undefined ? T.ores[ORE_INDEX[id]].name : parsePart(id) ? partName(id) : isLight(id) ? LIGHT_KINDS[id].name : exoticName(id));

// A cost that can't be missed: the material's icon, how many and what,
// and how many there are, in red when it's short.
function costTag(id, n, have, name = stuffName(id)) {
  return `<span class="cost-tag${have < n ? ' short' : ''}"><img class="cost-icon" src="${stuffIconUrl(id)}" alt="">${n} ${esc(name)} <span class="cost-have">· have ${have}</span></span>`;
}

function iconImg(item, cls = 'icon') { return `<img class="${cls}" src="${itemIconUrl(item)}" alt="">`; }
function itemRow(item, act, arg, tag = '') {
  if (item.kind === 'stone') return coreRow(item, act, arg, tag);
  return `<button class="row" data-act="${act}" data-arg="${arg}">${iconImg(item)}<span class="row-text"><span class="row-name ${item.q ? 'q-' + item.q : 'r-' + item.rarity}">${item.fav ? '★ ' : ''}${esc(item.name)}</span><span class="row-sub">${esc(itemKindLine(item))}</span><span class="row-gems">${isCaster(item) ? miniSpells(item) : ''}</span></span>${tag}</button>`;
}
// A core's row: its icon, its name (a legendary's in gold, a printed one's
// in the print's teal), how many of it there are, its kind and tier, and
// its pattern and power in short.
function coreRow(c, act, arg, tag = '', sub = '', n = 1) {
  const traits = coreTraits(c).map((t) => t.text).join(' · ');
  return `<button class="row mod-row" data-act="${act}" data-arg="${arg}"><img class="icon" src="${stoneIconUrl(c.stone)}" alt=""><span class="row-text"><span class="row-name ${c.power ? 'r-legendary' : c.pattern ? 'printed' : 'r-common'}">${c.fav ? '★ ' : ''}${esc(c.name)}${n > 1 ? ` <small class="count">×${n}</small>` : ''}</span><span class="row-sub">${esc(sub || itemKindLine(c))}</span>${traits ? `<span class="row-traits">${esc(traits)}</span>` : ''}</span>${tag}</button>`;
}

// ---------------------------------------------------------------------------
// Spells on the screens: a core as a tile, the rig's two spells, and the
// drawer of cores to set in them
// ---------------------------------------------------------------------------
const STONE_ORDER = Object.keys(CIRCUIT_FORMS).concat(Object.keys(CIRCUIT_ELEMENTS), Object.keys(CIRCUIT_GLYPHS));

// A core as a tile: a Form's with a heavy rim, an Element's filled with its
// colour, a Mod's with a dashed rim; or an empty part, labelled with the
// kind it takes. st: a core, or { stone, tier }; opts: { act, arg, sel,
// mini, count, kind (an empty one's) }.
function stoneTile(st, opts = {}) {
  const tag = opts.act ? 'button' : 'span', cls = `${opts.sel ? ' sel' : ''}${opts.mini ? ' mini' : ''}`;
  const attrs = opts.act ? ` data-act="${opts.act}" data-arg="${opts.arg}"` : '';
  if (!st) return `<${tag} class="tile t-empty${cls}"${attrs} aria-label="Empty ${opts.kind ? STONE_KIND_NAMES[opts.kind] : 'part'}"><b>·</b>${opts.mini ? '' : `<small>${opts.kind ? STONE_KIND_NAMES[opts.kind].toUpperCase() : 'EMPTY'}</small>`}</${tag}>`;
  const W = stoneWords(st.stone), k = stoneKind(st.stone), rar = st.power ? 'legendary' : null;
  const img = opts.mini ? '' : `<img src="${stoneIconUrl(st.stone)}" alt="">`;
  const sub = opts.mini ? '' : `<small>${opts.count ? '×' + opts.count + ' · ' : ''}T${st.tier}</small>`;
  // (a printed core wears a teal pip, a legendary a gold one)
  const pip = rar || st.pattern ? `<i class="pip" style="background:${rar ? ART.rarity[rar] : CORE_PRINT_COL}"></i>` : '';
  return `<${tag} class="tile t-${k}${cls}${rar ? ' r-' + rar : ''}" style="--c:${stoneTint(st.stone)}"${attrs} aria-label="${esc(W.name)}, tier ${st.tier}">${img}<b>${W.abbr}</b>${sub}${pip}</${tag}>`;
}
// A spell's parts, in order: [key, core].
function miniSpells(it) { return (it.spells || []).map((sp) => `<span class="mini-circuit">${spellParts(sp).map(([key, c]) => stoneTile(c, { mini: true, kind: spellPartKind(key) })).join('')}</span>`).join(''); }
// The cores in a list, one entry for each kind and tier: { stone, tier, n }.
function groupStones(items) {
  const m = new Map();
  for (const it of items) {
    if (it.kind !== 'stone') continue;
    const k = it.stone + ':' + it.tier, e = m.get(k) || { stone: it.stone, tier: it.tier, n: 0 };
    e.n++; m.set(k, e);
  }
  return [...m.values()].sort((a, b) => STONE_ORDER.indexOf(a.stone) - STONE_ORDER.indexOf(b.stone) || b.tier - a.tier);
}

// The rig's two spells on its card: each a row of its parts, its name
// (BOLT · SHOCK · CHAIN) and one short line; at home, a part tapped opens
// the drawer of the cores that fit it (free to change). c.part: the chosen
// part, as 'i:key'.
function spellPanel(it, edit, c) {
  let h = '';
  it.spells.forEach((sp, i) => {
    const L = spellLine(it, sp), tiles = spellParts(sp).map(([key, core]) => stoneTile(core, Object.assign({ kind: spellPartKind(key) }, edit ? { act: 'partPick', arg: `${i}:${key}`, sel: c.part === `${i}:${key}` } : {}))).join('');
    h += `<div class="spell${L.res ? ' res' : ''}"><div class="spell-head"><b class="spell-key">${i ? 'B' : 'A'}</b><span class="spell-name">${esc(spellName(sp))}</span></div><div class="circuit">${tiles}</div><p class="spell-line${L.warn ? ' warn' : ''}">${esc(L.text)}</p></div>`;
  });
  if (!edit) return h;
  if (!c.part) return h;
  const [i, key] = c.part.split(':'), sp = it.spells[Number(i)], sel = spellGet(sp, key), kind = spellPartKind(key);
  // the spare cores of that kind, the same ones stacked (patterns.js)
  const list = coreGroups(Save.data.items.filter((x) => x.kind === 'stone' && stoneKind(x.stone) === kind)).sort((a, b) => STONE_ORDER.indexOf(a.c.stone) - STONE_ORDER.indexOf(b.c.stone) || coreWorth(b.c) - coreWorth(a.c));
  const second = key === 'el2' || key === 'form2' || key === 'm1';
  h += `<div class="drawer"><div class="drawer-head"><span>${i === '1' ? 'B' : 'A'} · ${second ? 'SECOND ' : ''}${STONE_KIND_NAMES[kind].toUpperCase()}${sel ? ' · ' + esc(stoneWords(sel.stone).name.toUpperCase()) : ''}</span>${sel ? `<span><button class="mini" data-act="cardStone" data-arg="${sel.uid}">LOOK</button><button class="mini" data-act="partOut">TAKE OUT</button></span>` : ''}</div>
    ${list.length ? list.map((g) => coreRow(g.c, 'partPut', g.c.uid, sel ? (coreWorth(g.c) > coreWorth(sel) * 1.05 ? '<span class="tag up">▲</span>' : coreWorth(g.c) < coreWorth(sel) * 0.95 ? '<span class="tag down">▼</span>' : '') : '<span class="tag up">▲</span>', '', g.n)).join('') : '<p class="note">None spare.</p>'}</div>`;
  return h;
}
// ▲ or ▼ against what's worn in the slot it would go in
function compareTag(item, equip) {
  if (item.kind === 'stone') return '';
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
  card: null, // { item, where, key, part (the chosen spell part, 'i:key'), bench (opened at the tuning bench), back (the rig's card a core's was opened from) }
  forge: { bp: null, ore: null, exotic: null, field: false },

  init() {
    for (const s of document.querySelectorAll('.screen')) s.addEventListener('click', (e) => UI.onTap(e));
    // a tap on the dark round the card closes it, as ✕ does
    $('card').addEventListener('click', (e) => { if (e.target === $('card')) { if (Game.realT - UI.openedAt >= T.ui.tapGuard) UI.acts.closeCard(); } else UI.onTap(e); });
    $('btn-pause').addEventListener('click', () => { if (Game.dive && !Game.modal) UI.openPause(); });
    // (at home it's the locker: what you own, anywhere in the outpost)
    $('btn-cargo').addEventListener('click', () => { if (Game.dive && !Game.modal) { if (Game.dive.hub) UI.show('screen-gear'); else UI.openCargo(); } });
    // the goal over the view folds to its heading when tapped, and back
    const goal = $('hud-goal'), S0 = () => Save.data.settings || (Save.data.settings = {});
    goal.classList.toggle('shut', !!(Save.data && Save.data.settings && Save.data.settings.goalShut));
    goal.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); const s = S0(); s.goalShut = !s.goalShut; goal.classList.toggle('shut', s.goalShut); Save.saveField('settings'); snd('tap', {}); });
    // TRAVEL at a spire; at the star's altar, ATTUNE (its screen)
    $('btn-act2').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!Game.dive || Game.modal) return;
      if (!Game.dive.hub) UI.openMap('travel');
      else if (actionHere() === 'altar') UI.show('screen-star');
      else if (actionHere() === 'forge' && onboardHas('supplies')) UI.show('screen-supplies');
    });
    $('build').textContent = BUILD_INFO;
    // the tutorials' overlay and the ?s (tutor.js); the walkthrough's ✕
    Tutor.init();
    $('guide').querySelector('.guide-stop').addEventListener('click', () => Guide.stop());
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
    Tutor.auto(id);
  },

  close() {
    Onboard.closed(UI.screen);
    for (const s of document.querySelectorAll('.screen')) s.hidden = true;
    UI.closeCard();
    UI.screen = null;
    Game.modal = null;
    Input.block();
  },

  redraw() {
    const r = { 'screen-resume': drawResume, 'screen-report': drawReport, 'screen-story': drawStory, 'screen-wreck': drawUplink_, 'screen-setout': drawSetOut, 'screen-forge': drawForge, 'screen-gear': drawGear, 'screen-bench': drawBench, 'screen-research': drawResearch, 'screen-star': drawStar, 'screen-cargo': drawCargo, 'screen-supplies': drawSupplies, 'screen-lab': drawLab }[UI.screen];
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
    else if (id === 'bay') openForge(false, true);
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
    $('pause-cargo').hidden = home; $('pause-note').hidden = home; $('pause-recall').hidden = home;
    $('pause-beacon').hidden = home || !toolOwned('beacon') || !!Game.dive.beaconUsed || !!Game.dive.beacon;
    drawSoundButtons();
    UI.show('screen-pause');
  },
  openCargo() { UI.show('screen-cargo'); },

  openCard(item, where, key) {
    UI.card = { item, where, key, part: null };
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
  placeKey() { const d = Game.dive; return !d ? '' : d.hub ? 'home' : d.lat !== null && d.lat !== undefined ? `L${d.lat}` : `${d.terr}/${d.deep ? d.deep.site : 0}`; },
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
    Onboard.tick(dt || 0);
    Guide.update(dt || 0);
    Tutor.frame();
    if (!d) return;
    if (d.hub) {
      setTextIfChanged('hud-depth', `MAGNITUDE ${magnitudeOf(Save.data.star)}`);
      // the Spectrum beside it (spectrum.js), drawn again when a band moves
      const key = BANDS.map((b) => bandGiven(b.ore)).join(','), sp = $('hud-spec');
      if (sp.dataset.key !== key) { sp.dataset.key = key; sp.innerHTML = spectrumBarsHtml(true); }
    }
    const p = d.p, st = d.stats;
    const hp = Math.max(0, p.hp / st.maxHp), ch = p.charge / st.maxCharge;
    const hpW = Math.round(hp * 100) + '%', chW = Math.round(ch * 100) + '%';
    if ($('hp-fill').style.width !== hpW) $('hp-fill').style.width = hpW;
    if ($('ch-fill').style.width !== chW) $('ch-fill').style.width = chW;
    $('hud-goal').hidden = !(d.hub ? !Guide.on() && drawNextHud() : drawGoalHud(d));
    const pW = Math.round(d.pull * 100) + '%';
    if ($('pull-fill').style.width !== pW) $('pull-fill').style.width = pW;
    $('hud-pull').classList.toggle('fading', d.pull < T.pull.dimAt);
    $('hud-pull').classList.toggle('dark', d.pull <= 0);
    setTextIfChanged('hp-text', String(Math.ceil(p.hp)));
    $('hud-hp').classList.toggle('warded', p.ward > 0);
    $('hud-hp').classList.toggle('hurt', p.hurtT > 0);
    $('hud-ch').classList.toggle('low', p.lowCharge > 0);
    const inLat = d.lat !== null && d.lat !== undefined;
    if (!d.hub) setTextIfChanged('hud-depth', inLat ? latticeNode(d.lat).name.toUpperCase() : d.deep ? `THE DEEP ${d.deep.site}/${d.deep.of}` : d.terr ? terrOf(d.terr).name.toUpperCase() : '');
    setTextIfChanged('btn-cargo', d.hub ? 'LOCKER' : `CARGO ${cargoCount(d)}`);
    // (the dark has noticed the haul: game.js updatePull)
    $('btn-cargo').classList.toggle('hot', !d.hub && !d.kindled && (d.heat || 0) >= T.pull.heat.said[0]);
    drawSupplyDeck(d);
    const eq = Save.data.equip;
    const rig = isCaster(eq.main) ? eq.main : null;
    // the foe the spells would reach: each button says whether it fears or
    // shrugs off that spell's element (natures.js)
    const foe = !d.hub && !Game.modal ? nearestEnemy(d, T.hud.verdictReach) : null;
    for (const slot of ['main', 'off']) {
      // each spell's button shows its Form
      const sp = rig && rigSpell(rig, slot === 'off' ? 1 : 0), form = rig ? spellForm(sp) : 'arc', btn = $('btn-' + slot), key = `${rig ? rig.uid : 'fist'}:${form}`;
      if (btn.dataset.key !== key) {
        btn.dataset.key = key;
        btn.innerHTML = `<img class="btn-icon" src="${stoneIconUrl(form || 'bolt')}" alt=""><span>${!rig ? 'FIST' : form ? CIRCUIT_FORMS[form].name.toUpperCase() : 'SPARK'}</span>`;
      }
      const h = p.hands[slot], lv = h.holding ? chargeLevel(h) : 0;
      btn.classList.toggle('charging', lv > 0 && lv < 1);
      btn.classList.toggle('charged', lv >= 1);
      let m = 1;
      if (foe && foe.type !== 'dummy') { const g = rig ? spellGroup(sp) : null, els = !rig ? ['force'] : g ? (g.els.length ? g.els : ['force']) : null; if (els) m = elementMult(foe, els); }
      btn.classList.toggle('weak', m > 1.01);
      btn.classList.toggle('resist', m < 0.99);
    }
    if ($('btn-off').hidden !== !rig) $('btn-off').hidden = !rig;
    $('btn-dash').classList.toggle('cooling', p.dashCd > 0);
    const a = !Game.modal ? actionHere() : null, btn = $('btn-act');
    const rh = a === 'rift' && riftHere(d);
    let way = '';
    if (a === 'way') { const wi = wayHere(d); way = inLat ? 'UP INTO THE DEEP' : d.ways[wi] === 'lattice' ? 'DOWN INTO THE LATTICE' : !d.deep ? 'DOWN INTO THE DEEP' : d.deep.site >= d.deep.of ? 'BACK UP: ' + terrOf(d.terr).name.toUpperCase() : 'CLIMB DOWN: ' + wayPlaceName(d, wi).toUpperCase(); }
    setTextIfChanged('btn-act', rh ? (rh.gate ? 'ENTER THE TEAR' : 'SEAL THE TEAR') : way || { setout: 'SET OUT', extract: d.deep && !inLat ? 'RISE TO THE SURFACE' : 'BANK', relight: 'RELIGHT THE SPIRE', stone: 'LIGHT THE WAYSTONE', plant: d.terr && spireBlock(d.terr) ? `SPIRE · ${spireBlockShort(spireBlock(d.terr))}` : 'PLANT THE SPIRE', forge: 'FORGE', runes: 'TUNE', locker: 'OPEN LOCKER', bay: 'DRONE BAY', altar: Story.shardsHeld() > Story.shardsSet() ? 'SET THE SHARD' : d.feed && d.feed.ore ? `GIVING ${stuffName(d.feed.ore).toUpperCase()} · ${Save.data.stash[d.feed.ore] || 0}` : lightWaiting() ? `HOLD TO FEED · ${lightWaiting()}` : 'FEED THE STAR', wreck: 'OPEN THE UPLINK' }[a] || '');
    if (d.channel) setTextIfChanged('hud-depth', { recall: 'RECALLING…', seal: 'SEALING…', stone: 'LIGHTING…', plant: 'PLANTING…', travel: 'TRAVELLING…', extract: d.deep && !inLat ? 'RISING…' : 'BANKING…' }[d.channel.kind] || 'RISING…');
    if (btn.hidden !== !a) btn.hidden = !a;
    // feeding the star is a hold, not a tap: the button says so, pulses to
    // be pressed, and fills as the flow speeds up while it's held
    const hold = a === 'altar' && !(Story.shardsHeld() > Story.shardsSet()) && (!!d.feed || lightWaiting() > 0);
    btn.classList.toggle('hold', hold);
    if (hold) { const k = d.feed ? Math.min(1, d.feed.t / T.star.feed.ramp) : 0, v = Math.round(k * 100) + '%'; if (btn.style.getPropertyValue('--fill') !== v) btn.style.setProperty('--fill', v); }
    // at a spire (or a beacon's light), TRAVEL too; at the altar, ATTUNE; at
    // the fabricator, SUPPLIES (supplies.js)
    const travel = a === 'extract' && d.sortie && (!d.deep || inLat), attune = a === 'altar', sup = a === 'forge' && d.hub && onboardHas('supplies'), b2 = $('btn-act2');
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
  $('resume-text').textContent = `Out in ${t ? t.name : 'the world'}${r.deep ? `, its Deep (site ${r.deep})` : ''}, carrying ${n}. Give up, and it waits in your pack.`;
}

function drawStory() {
  const st = UI.story;
  if (!st) return;
  $('story-text').textContent = st.lines[st.i];
  $('story-step').textContent = `${st.i + 1} / ${st.lines.length}`;
}

// The Meridian uplink (the station 'wreck'): the colony ship in orbit and
// its sleepers, the Spectrum against the Charter's spec (spectrum.js), the
// shards set, and the echoes found.
function drawUplink_() {
  const s = Save.data, set = Story.shardsSet();
  const shardRow = (b, i) => {
    const has = (s.shards || []).includes(i);
    return `<div class="row static"><img class="icon" src="${art2IconUrl('shard', has ? {} : { shardglow: ['#2a2a30'], shardwarm: ['#3a3a40'], star: ['#202024', '#2a2a30', '#34343c', '#40404a'] })}" alt=""><span class="row-text"><span class="row-name">${esc(b.name)}</span><span class="row-sub">${has ? ((s.shards || []).indexOf(i) < set ? 'Set in the star' : 'Set it at the altar') : `A Keeper holds it · ring ${i + 1}`}</span></span></div>`;
  };
  // the Meridian: its sleepers, and the spec the star is held to
  const kindled = storyKindledCount(), at = BANDS.filter((b) => bandAtMark(b.ore)).length;
  const meridian = spectrumComplete() ? '<p class="note">Every band at the mark. The star is whole, by the spec.</p>'
    : `<p class="note">${T.story.sleepers} sleepers in orbit. They wake when the star is whole: every band at the mark. ${at} of ${BANDS.length} stand there.</p>`;
  // the log: a line for each territory kindled
  const log = storyKindled().map((t) => `<div class="echo"><p>${esc(kindleLogLine(t.clime, t.name))}</p></div>`).join('');
  const echoes = (s.echoes || []).map((i) => `<div class="echo"><b>${esc(ECHOES[i].title)}</b><p>${esc(ECHOES[i].text)}</p></div>`).join('');
  $('wreck-body').innerHTML = `
    <h3>THE MERIDIAN</h3><div class="up-meridian">${meridian}<div class="spec-wrap">${spectrumBarsHtml(false)}</div>${spectrumRowsHtml(false)}</div>
    <h3>SHARDS SET · ${set}/3</h3><div class="up-shards">${T.biomes.map(shardRow).join('')}</div>
    <h3>ECHOES · ${(s.echoes || []).length}/${ECHOES.length}</h3><div class="up-echoes">${echoes || '<p class="note">None yet.</p>'}</div>
    ${log ? `<h3>THE LOG · ${kindled} KINDLED</h3>${log}` : ''}
    <div class="menu"><button class="btn quiet" data-act="replayIntro">WATCH THE LANDING AGAIN</button></div>`;
}

// How the last dive ended, over the outpost.
function drawReport() {
  const r = UI.report;
  if (!r) return;
  const where = r.where || '';
  const gear = (items) => {
    if (!items || !items.length) return '';
    const m = items.filter && items.filter((it) => it.kind === 'stone').length, g = items.length - (m || 0);
    return [m ? `${m} core${m > 1 ? 's' : ''}` : '', g ? `${g} piece${g > 1 ? 's' : ''} of gear` : ''].filter(Boolean).join(', ');
  };
  const got = [stuffLines(r.banked || r.lost || {}), gear(r.items)].filter(Boolean).join(', ');
  const rows = [], row = (label, cls, text) => rows.push(`<div class="rep-row"><span class="rep-label ${cls}">${label}</span><span class="rep-text">${esc(text)}</span></div>`);
  let title;
  if (r.banked) { title = r.recalled ? 'RECALLED' : 'HOME'; row('BANKED', 'good', got || 'Nothing this time'); }
  else {
    title = r.died ? 'YOU FELL' : 'YOU GAVE UP';
    // the haul waits where it was (deeds.js)
    const c = r.cache;
    if (c) row('YOUR PACK', 'gold', `In ${c.where}: ${[stuffLines(c.cargo), gear(c.items), c.blueprints.length ? `${c.blueprints.length} blueprint${c.blueprints.length > 1 ? 's' : ''}` : ''].filter(Boolean).join(', ')}`);
    const o = r.oldCache;
    if (o) row('LOST', 'bad', `Your older pack, in ${o.where}: ${[stuffLines(o.cargo), gear(o.items)].filter(Boolean).join(', ') || 'what was in it'}`);
    const before = r.earlier && [stuffLines(r.earlier.stuff || {}), gear(r.earlier.items)].filter(Boolean).join(', ');
    if (before) row('BANKED BEFORE', 'good', before);
    if (r.wake) row('YOU WAKE', 'gold', `At the spire of ${r.wake}`);
  }
  if (r.kindled) row('KINDLED', 'gold', `${r.kindled} territor${r.kindled > 1 ? 'ies' : 'y'}`);
  const learned = r.learned || [];
  if (learned.length) row('LEARNED', 'gold', learned.map((id) => BLUEPRINTS[id].name).join(', '));
  if (r.shard) row('SHARD', 'gold', 'Set it at the altar');
  if (r.settlers) row('THE QUARTERS', 'good', `+${r.settlers.n} ${stuffName(r.settlers.id)}`);
  if (r.echoes) row('ECHOES', 'gold', `${r.echoes} · at the uplink`);
  // the star: the light this sortie earned, what's waiting at the altar,
  // and how far to the next magnitude
  const s = Save.data, mag = magnitudeOf(s.star), lo = T.star.levels[mag - 1], hi = T.star.levels[mag], L = r.light || {}, wait = lightWaiting();
  const earned = [L.heartlight ? `${L.heartlight} heartlight` : '', (r.banked || {}).deeplight ? `${r.banked.deeplight} deeplight` : ''].filter(Boolean).join(', ');
  let star = '';
  if (earned || wait) {
    const k = hi ? Math.min(1, (s.star - lo) / (hi - lo)) : 1, k2 = hi ? Math.min(1, (s.star + wait - lo) / (hi - lo)) : 1;
    star = `<div class="rep-star"><div class="rep-row"><span class="rep-label gold">THE STAR</span><span class="rep-text">${[earned ? `+${esc(earned)}` : '', `${wait} waiting`, hi ? `${Math.max(0, hi - s.star)} to magnitude ${mag + 1}` : ''].filter(Boolean).join(' · ')}</span></div><div class="bar rep-bar"><div class="fill wait" style="width:${Math.round(k2 * 100)}%"></div><div class="fill" style="width:${Math.round(k * 100)}%"></div></div></div>`;
  }
  $('report-title').textContent = title;
  $('report-body').innerHTML = `<p class="rep-where">${esc(where)}</p>${rows.join('')}${star}`;
}

// The tools, under the map: those made (always on), and
// those not made yet (they're made at the forge).
function drawToolRows() {
  const s = Save.data;
  return `<h3>TOOLS</h3>` + TOOL_IDS.map((id) => {
    const t = TOOLS[id], own = toolOwned(id), open = toolOpen(id), known = id === 'compass' || s.blueprints.includes('tool_' + id);
    const sub = own ? esc(t.text) : !known ? 'Not yet known.' : open ? 'Make it at the forge.' : `Magnitude ${T.tools[id].mag}.`;
    const tag = own ? '<span class="row-tag r-legendary">ON</span>' : '';
    return `<div class="row static ${own ? 'on' : ''}" ${own || (open && known) ? '' : 'style="opacity:.55"'}><img class="icon" src="${toolIconUrl(id)}" alt=""><span class="row-text"><span class="row-name">${esc(t.name)}</span><span class="row-sub">${sub}</span></span>${tag}</div>`;
  }).join('');
}

// The star's screen, at its altar: its magnitude, the light waiting, the
// Spectrum (each band, and GIVE for the ore the stash holds: spectrum.js),
// its reach, and the attunements. (What grows it is behind the ?: tutor.js.)
function drawStar() {
  const s = Save.data, mag = magnitudeOf(s.star), next = T.star.levels[mag], lo = T.star.levels[mag - 1], pts = attunePointsLeft(s), wait = lightWaiting();
  const k = (v) => Math.round(Math.min(1, next ? (v - lo) / (next - lo) : 1) * 100);
  const light = LIGHT_IDS.slice().reverse().map((id) => `<span class="mat"><img class="cost-icon" src="${lightIconUrl(id)}" alt="">${s.stash[id] || 0} ${esc(LIGHT_KINDS[id].name)}</span>`).join('');
  const shards = Story.shardsHeld() - Story.shardsSet();
  const att = Object.entries(T.attune).map(([id, A]) => {
    const r = s.attune[id] || 0;
    return `<div class="row static"><span class="row-text"><span class="row-name">${A.name} ${r}/${A.max}</span><span class="row-sub">${A.text}</span></span><button class="mini" data-act="attune" data-arg="${id}" ${pts > 0 && r < A.max ? '' : 'disabled'}>+</button></div>`;
  }).join('');
  const reach = T.star.ringMag.slice(2).map((m, i) => `<span class="reach-chip${mag >= m ? ' ok' : ''}">${i + 2 === 4 ? 'EDGE' : 'RING ' + (i + 2)} · MAG ${m}${mag >= m ? ' ✓' : ''}</span>`).join('');
  $('star-body').innerHTML = `
    <div class="mag">MAGNITUDE ${mag}${next !== undefined ? ` · ${s.star}/${next}` : ''}</div>
    <div class="bar rep-bar star-bar"><div class="fill wait" style="width:${k(s.star + wait)}%"></div><div class="fill" style="width:${k(s.star)}%"></div></div>
    <h3>LIGHT WAITING · ${wait}${shards > 0 ? ` · ${shards} SHARD${shards > 1 ? 'S' : ''}` : ''}</h3>
    <div class="mats light-chips">${light}</div>
    <h3>THE SPECTRUM · ${BANDS.filter((b) => bandAtMark(b.ore)).length}/${BANDS.length} AT THE MARK</h3><div class="spec-list">${spectrumRowsHtml(true)}</div>
    <h3>REACH</h3><div class="reach">${reach}</div>
    <h3>ATTUNEMENTS · ${pts} POINT${pts === 1 ? '' : 'S'}</h3><div class="att-list">${att}</div>`;
}

function drawCargo() {
  const d = Game.dive;
  if (!d) return;
  const mods = d.items.filter((it) => it.kind === 'stone'), items = d.items.filter((it) => it.kind !== 'stone').map((it) => itemRow(it, 'cardCargo', it.uid, compareTag(it, Save.data.equip))).join('');
  const worn = SLOTS.filter((k) => Save.data.equip[k]).map((k) => itemRow(Save.data.equip[k], 'cardWorn', k, `<span class="slot">${SLOT_NAMES[k]}</span>`)).join('');
  const stuff = stuffIds().filter((id) => d.cargo[id]).map((id) => `<button class="row" data-act="cardStuff" data-arg="${id}"><img class="icon" src="${stuffIconUrl(id)}" alt=""><span class="row-text"><span class="row-name">${esc(stuffName(id))} × ${d.cargo[id]}</span><span class="row-sub">${stuffKindWord(id)}</span></span></button>`).join('');
  const heart = (d.tally && d.tally.light && d.tally.light.heartlight) || 0, pack = Save.data.cache;
  $('cargo-body').innerHTML = `
    <div class="mag">CARRYING ${cargoCount(d)}</div>
    <p class="note center">A fall leaves it all in your pack.</p>
    ${pack ? `<p class="note gold">Your old pack: ${esc(pack.where)}</p>` : ''}
    ${heart ? `<p class="note">+${heart} heartlight, safe</p>` : ''}
    <h3>ORE AND MATERIALS</h3>${stuff || '<p class="note">None yet.</p>'}
    ${onboardHas('supplies') ? supplyMakeHtml() : ''}
    ${d.blueprints.length ? `<h3>BLUEPRINTS</h3>${d.blueprints.map((b) => `<div class="row static"><img class="icon" src="${recipeIconUrl(b.id)}" alt=""><span class="row-text"><span class="row-name r-legendary">${esc(BLUEPRINTS[b.id].name)}</span><span class="row-sub">Blueprint</span></span></div>`).join('')}` : ''}
    ${mods.length ? `<h3>CORES · ${mods.length}</h3>${mods.map((m) => coreRow(m, 'cardCargo', m.uid)).join('')}` : ''}
    ${items ? `<h3>FOUND</h3>${items}` : ''}
    <h3>WORN · SAFE</h3>${worn}
    <div class="menu"><button class="btn" data-act="recall">EMERGENCY RECALL</button></div>
    <p class="note center">It loses nothing. Stand still ${Math.round(relayRecallTime())} s.</p>`;
}
// What a stack in the cargo is, in a word or two.
function stuffKindWord(id) { return ORE_INDEX[id] !== undefined ? 'Ore' : parsePart(id) ? 'Creature part' : isLight(id) ? 'Light for the star' : 'Exotic material'; }

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
  const what = x ? (x.element ? `Forges a ${CIRCUIT_ELEMENTS[x.element].name} core.` : x.retired ? 'Old stock.' : x.tierUp ? 'Forge with it: a tier above its ore.' : x.modSlot ? "Forge it into a rig frame: the ore's extra slot." : '')
    : pk ? (pk.kind !== 'heart' ? 'For the forge: recipes name what they take, and a pattern prints for its creature\'s parts.' : 'Forges a Ward core, or the Lode Beacon.')
    : isLight(id) ? LIGHT_KINDS[id].text
    : `Tier ${T.ores[ORE_INDEX[id]].tier} ore.`;
  $('card-body').innerHTML = cardBar('IN YOUR CARGO') + `<div class="card-scroll">
    <div class="card-head"><img class="icon big" src="${stuffIconUrl(id)}" alt=""><div><div class="card-name">${esc(stuffName(id))} × ${n}</div><div class="row-sub">${x ? 'Exotic material' : pk ? 'Creature part' : isLight(id) ? 'Light for the star' : 'Ore'}</div></div></div>
    <p class="base">${esc(what)}</p>
    <div class="menu">
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
  // START OVER, from the pause screen: a screen that says what's lost, then
  // a second tap on its button (Save.startOver), and the game starts again
  restartAsk: () => UI.show('screen-restart'),
  restartBack: () => UI.openPause(),
  startOver: () => { Save.startOver(); UI.close(); location.reload(); },
  closeReport: () => {
    UI.report = null; UI.close();
    Story.starGrew();
  },
  // (built while loading, if it was: loader.js)
  resumeRun: () => { UI.close(); if (!loaderCarryOn()) resumeRun(); },
  // giving up a sortie found under way: back where it came in, and the
  // haul left there in the pack, as a fall would (game.js loseDive)
  dropRun: () => {
    UI.close();
    if (!Save.data.run) return;
    if (!loaderCarryOn()) resumeRun();
    Loader.landed = null;
    loseDive(false);
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
  // ore into the star, from its screen (spectrum.js): all the stash holds
  giveOre: (ore) => { if (giveOre(ore, Save.data.stash[ore] || 0)) afterChange(); },
  recall: () => {
    UI.close();
    const d = Game.dive;
    if (d.channel && d.channel.kind !== 'recall') d.channel = null;
    startChannel('recall'); UI.toast('Hold still: recalling');
  },
  beacon: () => { UI.close(); plantBeacon(); },
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
    if (UI.screen === 'screen-lab') drawLab();
  },
  // the pause screen's FINE GRAIN (art.js artFinePx): the view at twice
  // the art's pixels. The art is built at its size as the game loads, so
  // the page is loaded again; only at home, where everything is banked.
  fineSet: () => {
    const s = Save.data.settings || (Save.data.settings = {});
    s.fine = !s.fine;
    Save.saveField('settings');
    try { location.reload(); } catch (e) { noteError(e); }
  },
  // the paint lab's rows (lab.js): a row's next value, every row back to
  // today's look, and the sheet closed back into play
  labSet: (key) => { Lab.cycle(key); drawLab(); },
  labReset: () => { Lab.reset(); drawLab(); },
  labBack: () => UI.close(),
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
  // FINE GRAIN: where there's WebGL2 for the light, and at home (it
  // reloads the page; a sortie's cargo isn't banked till you're back)
  const fine = $('pause-fine'), s = Save.data.settings || {};
  fine.hidden = !(typeof Gpu !== 'undefined' && Gpu.on && Game.dive && Game.dive.hub);
  setTextIfChanged('pause-fine', `FINE GRAIN: ${s.fine ? 'ON' : 'OFF'}`);
}

// A frame's cores moved into another, part for part; a Mod the new one has
// no slot for goes to `list`.
function moveSpells(from, to, list) {
  from.spells.forEach((sp, i) => {
    const dst = to.spells[i];
    for (const [key, c] of spellParts(sp)) {
      if (!c) continue;
      spellSet(sp, key, null);
      if ((key[0] === 'm' && Number(key.slice(1)) < dst.mods.length) || (key[0] !== 'm' && key in dst)) spellSet(dst, key, c); else list.push(c);
    }
  });
}
