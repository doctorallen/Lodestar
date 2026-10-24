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
const stuffIds = () => T.ores.map((o) => o.id).concat(LIGHT_IDS, [NIGHTGLASS]);
const stuffName = (id) => (ORE_INDEX[id] !== undefined ? T.ores[ORE_INDEX[id]].name : isLight(id) ? LIGHT_KINDS[id].name : id === NIGHTGLASS ? 'Night-glass' : id);

// A cost that can't be missed: the material's icon, how many and what,
// and how many there are, in red when it's short.
function costTag(id, n, have, name = stuffName(id)) {
  return `<span class="cost-tag${have < n ? ' short' : ''}"><img class="cost-icon" src="${stuffIconUrl(id)}" alt="">${n} ${esc(name)} <span class="cost-have">· have ${have}</span></span>`;
}

// The card over a screen: ore or light in the cargo (drawStuffCard).
function drawCard() { if (UI.card && UI.card.stuff) drawStuffCard(UI.card.stuff); }

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
    // (at home it's the star's screen, from anywhere inside it)
    $('btn-cargo').addEventListener('click', () => { if (Game.dive && !Game.modal) { if (Game.dive.hub) { UI.face = 'turn'; UI.show('screen-star'); } else UI.openCargo(); } });
    // the Spectrum in the top bar opens the star's GIVE face
    $('hud-spec').addEventListener('click', () => { if (Game.dive && Game.dive.hub && !Game.modal) { UI.face = 'give'; UI.show('screen-star'); } });
    // the goal over the view folds to its heading when tapped, and back
    const goal = $('hud-goal'), S0 = () => Save.data.settings || (Save.data.settings = {});
    goal.classList.toggle('shut', !!(Save.data && Save.data.settings && Save.data.settings.goalShut));
    goal.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); const s = S0(); s.goalShut = !s.goalShut; goal.classList.toggle('shut', s.goalShut); Save.saveField('settings'); snd('tap', {}); });
    // TRAVEL at a spire; before the star, its screen (while FEED is the hold)
    $('btn-act2').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!Game.dive || Game.modal) return;
      if (!Game.dive.hub) UI.openMap('travel');
      else if (actionHere() === 'altar') UI.show('screen-star');
    });
    $('build').textContent = BUILD_INFO;
    // the tutorials' overlay and the ?s (tutor.js); the walkthrough's ✕
    Tutor.init();
    $('guide').querySelector('.guide-stop').addEventListener('click', () => Guide.stop());
    // the anvil takes a tap anywhere; the reveal, a tap once it has risen
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
    const r = { 'screen-resume': drawResume, 'screen-report': drawReport, 'screen-story': drawStory, 'screen-setout': drawSetOut, 'screen-star': drawStar, 'screen-cargo': drawCargo, 'screen-lab': drawLab }[UI.screen];
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

  // Standing before the star: a shard carried home is set, else its screen
  // opens (starui.js).
  useStation(id) {
    if (id === 'altar') {
      if (Story.setShards()) { feedStarFx(Game.dive, 40, 0); snd('starFeed', { tier: 6, rate: 8, n: 24, stream: true }); return; }
      UI.show('screen-star');
    }
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
    $('pause-beacon').hidden = home || !senseOpen('beacon') || !!Game.dive.beaconUsed || !!Game.dive.beacon;
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
    setTextIfChanged('btn-cargo', d.hub ? 'THE STAR' : `CARGO ${cargoCount(d)}`);
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
    setTextIfChanged('btn-act', rh ? (rh.gate ? 'ENTER THE TEAR' : 'SEAL THE TEAR') : way || { setout: 'SET OUT', extract: d.deep && !inLat ? 'RISE TO THE SURFACE' : 'BANK', relight: 'RELIGHT THE SPIRE', stone: 'LIGHT THE WAYSTONE', plant: d.terr && spireBlock(d.terr) ? `SPIRE · ${spireBlockShort(spireBlock(d.terr))}` : spireOreShort(d) ? `SPIRE · ${spireOreCost(d).n} ${stuffName(spireOreCost(d).ore).toUpperCase()}` : 'PLANT THE SPIRE', altar: Story.shardsHeld() > Story.shardsSet() ? 'SET THE SHARD' : d.feed && d.feed.ore ? `GIVING ${stuffName(d.feed.ore).toUpperCase()} · ${Save.data.stash[d.feed.ore] || 0}` : lightWaiting() ? `HOLD TO FEED · ${lightWaiting()}` : 'THE STAR' }[a] || '');
    if (d.channel) setTextIfChanged('hud-depth', { recall: 'RECALLING…', seal: 'SEALING…', stone: 'LIGHTING…', plant: 'PLANTING…', travel: 'TRAVELLING…', extract: d.deep && !inLat ? 'RISING…' : 'BANKING…' }[d.channel.kind] || 'RISING…');
    if (btn.hidden !== !a) btn.hidden = !a;
    // feeding the star is a hold, not a tap: the button says so, pulses to
    // be pressed, and fills as the flow speeds up while it's held
    const hold = a === 'altar' && !(Story.shardsHeld() > Story.shardsSet()) && (!!d.feed || lightWaiting() > 0);
    btn.classList.toggle('hold', hold);
    if (hold) { const k = d.feed ? Math.min(1, d.feed.t / T.star.feed.ramp) : 0, v = Math.round(k * 100) + '%'; if (btn.style.getPropertyValue('--fill') !== v) btn.style.setProperty('--fill', v); }
    // at a spire (or a beacon's light), TRAVEL too; before the star, while
    // FEED is the hold, its screen
    const travel = a === 'extract' && d.sortie && (!d.deep || inLat), attune = a === 'altar' && hold, b2 = $('btn-act2');
    if (b2.hidden !== !(travel || attune)) { b2.hidden = !(travel || attune); document.body.classList.toggle('act2', !b2.hidden); }
    if (travel || attune) { const pts = attune ? attunePointsLeft(Save.data) : 0; setTextIfChanged('btn-act2', travel ? 'TRAVEL' : pts > 0 ? `THE STAR · ${pts}` : 'THE STAR'); }
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

// How the last dive ended, over the outpost.
function drawReport() {
  const r = UI.report;
  if (!r) return;
  const where = r.where || '';
  const gear = () => '';
  const got = stuffLines(r.banked || r.lost || {});
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
  if (r.shard) row('SHARD', 'gold', 'Set it in the star');
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

// The star's senses, under the map: each open once its band is deep
// enough (facets.js senseOpen).
function drawToolRows() {
  return `<h3>THE STAR'S SENSES</h3>` + TOOL_IDS.map((id) => {
    const t = TOOLS[id], open = senseOpen(id);
    return `<div class="row static ${open ? '' : 'empty'}"><img class="icon" src="${toolIconUrl(id)}" alt=""><span class="row-text"><span class="row-name">${esc(t.name)}${open ? ' <span class="r-legendary">· ON</span>' : ''}</span><span class="row-sub">${esc(open ? t.text : `Opens at ${toolOpensLine(id)}`)}</span></span></div>`;
  }).join('');
}

function drawCargo() {
  const d = Game.dive;
  if (!d) return;
  const stuff = stuffIds().filter((id) => d.cargo[id]).map((id) => `<button class="row" data-act="cardStuff" data-arg="${id}"><img class="icon" src="${stuffIconUrl(id)}" alt=""><span class="row-text"><span class="row-name">${esc(stuffName(id))} × ${d.cargo[id]}</span><span class="row-sub">${stuffKindWord(id)}</span></span></button>`).join('');
  const heart = (d.tally && d.tally.light && d.tally.light.heartlight) || 0, pack = Save.data.cache;
  $('cargo-body').innerHTML = `
    <div class="mag">CARRYING ${cargoCount(d)}</div>
    <p class="note center">A fall leaves it all in your pack.</p>
    ${pack ? `<p class="note gold">Your old pack: ${esc(pack.where)}</p>` : ''}
    ${heart ? `<p class="note">+${heart} heartlight, safe</p>` : ''}
    <h3>ORE AND LIGHT</h3>${stuff || '<p class="note">None yet.</p>'}
    ${fieldSpendHtml(d)}
    ${supplyMakeHtml(true)}
    <div class="menu"><button class="btn" data-act="recall">EMERGENCY RECALL</button></div>
    <p class="note center">It loses nothing. Stand still ${Math.round(T.leave.recall)} s.</p>`;
}
// What a stack in the cargo is, in a word or two.
function stuffKindWord(id) { return ORE_INDEX[id] !== undefined ? `Ore · the ${bandName(id)} band` : isLight(id) ? 'Light for the star' : id === NIGHTGLASS ? "The dark's residue · unlisted" : 'Material'; }

// ---------------------------------------------------------------------------
// The cards
// ---------------------------------------------------------------------------

// The card's header, held above what scrolls: where the piece is, KEEP,
// and the way out.
function cardBar(where, extra = '') {
  return `<div class="card-bar"><span class="card-where">${esc(where)}</span>${extra}<button class="head-close" data-act="closeCard" aria-label="Close">✕</button></div>`;
}

// Ore or an exotic in the cargo: how much, and dropping some.
function drawStuffCard(id) {
  const n = (Game.dive && Game.dive.cargo[id]) || 0;
  const what = isLight(id) ? LIGHT_KINDS[id].text : id === NIGHTGLASS ? 'A dull violet crystal the Charter\'s spec doesn\'t list. The star can be given it. Nothing says what it is.' : `Tier ${T.ores[ORE_INDEX[id]].tier} ore. Given to the star, it deepens the ${bandName(id)} band${bandOpensWord(id) ? `; at depth 1 the star can light ${bandOpensWord(id)}` : ''}. The splinter makes supplies from it (MAKE).`;
  $('card-body').innerHTML = cardBar('IN YOUR CARGO') + `<div class="card-scroll">
    <div class="card-head"><img class="icon big" src="${stuffIconUrl(id)}" alt=""><div><div class="card-name">${esc(stuffName(id))} × ${n}</div><div class="row-sub">${esc(stuffKindWord(id))}</div></div></div>
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
    // the first time ore comes home: what the star wants it for (spectrum.js)
    if (T.ores.some((o) => (Save.data.stash[o.id] || 0) > 0)) Story.say('spectrum');
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
