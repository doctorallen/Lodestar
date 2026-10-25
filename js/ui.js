'use strict';
// ---------------------------------------------------------------------------
// The screens (the story's panels, the pause screen, the paint lab, start
// over), the top bar, the deck's button labels, toasts and speech. Opening
// a screen sets Game.modal, which stops the simulation, and calls
// Input.block(); a screen's buttons ignore taps for its first 400 ms.
// Buttons say what they do with data-act (and data-arg); one handler per
// screen runs them, and the screen redraws.
// ---------------------------------------------------------------------------

function setTextIfChanged(id, s) { const el = $(id); if (el.textContent !== s) el.textContent = s; }
const esc = escapeHtml;

const UI = {
  openedAt: 0,
  screen: null,

  init() {
    for (const s of document.querySelectorAll('.screen')) s.addEventListener('click', (e) => UI.onTap(e));
    $('btn-pause').addEventListener('click', () => { if (Game.dive && !Game.modal) UI.openPause(); });
    $('btn-map').addEventListener('click', () => { if (Game.dive && !Game.modal) UI.show('screen-map'); });
    $('btn-map').classList.toggle('hot', false);
    $('build').textContent = BUILD_INFO;
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
    // back after, and the rest count as read
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
    UI.screen = null;
    Game.modal = null;
    Input.block();
  },

  redraw() {
    const r = { 'screen-story': drawStory, 'screen-lab': drawLab, 'screen-map': drawMap }[UI.screen];
    if (r) r();
    UI.placeToasts();
  },

  openPause() {
    drawSoundButtons();
    UI.show('screen-pause');
  },

  // Someone speaking: Wick, or the star. Lines wait their turn, and while a
  // screen is open, so none is lost under a menu. A first-time line of
  // Wick's (`id`) that waits too long is kept for the next time.
  speak(who, text, style = 'wick', id = null) {
    UI.lines = UI.lines || [];
    UI.lines.push({ who, text, style, t: 2.6 + text.length * 0.045, id, waited: 0 });
  },
  updateSpeech(dt) {
    if (UI.lines && UI.lines.length) {
      UI.lines = UI.lines.filter((l) => {
        if (!l.shown && !Game.modal) l.waited += dt || 0;
        if (l.shown || l.waited < T.ui.lineWait) return true;
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
  // the news; a hint is never shown twice in a world.
  hintQ: [], hintsSeen: new Set(), hintsFor: null,
  toast(msg, kind) {
    if (kind !== 'tip') { UI.showToast(msg, kind); return; }
    if (UI.hintsFor !== Game.dive) { UI.hintsFor = Game.dive; UI.hintsSeen.clear(); }
    if (UI.hintsSeen.has(msg) || UI.hintQ.some((h) => h.msg === msg)) return;
    UI.hintQ.push({ msg });
    UI.pumpToasts();
  },
  showToast(msg, kind) {
    const box = $('toasts'), most = T.ui.toasts;
    // the same words twice at once read as a stutter: the newer one only
    for (const o of [...box.children]) if (o.textContent === msg) o.remove();
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' r-' + kind : '');
    el.textContent = msg;
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
  placeToasts() {
    const box = $('toasts');
    if (box.style.top !== '') box.style.top = '';
  },
  // Every step: a waiting hint shows if there's room for it.
  pumpToasts() {
    const box = $('toasts');
    if (Game.modal) return;
    while (UI.hintQ.length && box.children.length < T.ui.toasts) { const h = UI.hintQ.shift(); UI.showToast(h.msg, 'tip'); }
  },

  // the top bar and the deck, every step
  frame(dt) {
    const d = Game.dive;
    UI.updateSpeech(dt || 0);
    document.body.classList.toggle('modal', !!Game.modal);
    document.body.classList.toggle('rapt', Game.modal === 'screen-story');
    document.body.classList.toggle('diving', !!d);
    UI.pumpToasts();
    if (!d) return;
    const p = d.p, st = d.stats;
    // one bar: your light, which is your health
    const hp = Math.max(0, p.hp / st.maxHp), hpW = Math.round(hp * 100) + '%';
    if ($('hp-fill').style.width !== hpW) $('hp-fill').style.width = hpW;
    setTextIfChanged('hp-text', String(Math.ceil(p.hp)));
    $('hud-hp').classList.toggle('warded', p.ward > 0);
    $('hud-hp').classList.toggle('hurt', p.hurtT > 0);
    $('hud-hp').classList.toggle('fading', hp < T.pull.dimAt);
    $('hud-hp').classList.toggle('lit', restingLight(d));
    setTextIfChanged('hud-depth', d.litG ? veinsNext(d) : restingLight(d) ? 'IN THE LIGHT' : 'THE DARK');
    // the thread's length left, a thin line under the bar
    const th = $('hud-thread');
    if (th.hidden !== !d.thread) th.hidden = !d.thread;
    if (d.thread) { const v = Math.round(Math.max(0, 1 - d.thread.len / d.thread.max) * 100) + '%'; if ($('thread-fill').style.width !== v) $('thread-fill').style.width = v; }
    const rig = Save.data.equip.main;
    // the foe the spells would reach: each button says whether it fears or
    // shrugs off that spell's element (natures.js)
    const foe = !Game.modal ? nearestEnemy(d, T.hud.verdictReach) : null;
    for (const slot of ['main', 'off']) {
      // each spell's button shows its Form
      const sp = rigSpell(rig, slot === 'off' ? 1 : 0), form = spellForm(sp), btn = $('btn-' + slot), key = `${rig.uid}:${form}`;
      if (btn.dataset.key !== key) {
        btn.dataset.key = key;
        const own = Save.data.casts && Save.data.casts[slot === 'off' ? 1 : 0];
        btn.innerHTML = `<img class="btn-icon" src="${stoneIconUrl(form || 'bolt')}" alt=""><span>${own ? castName(own).toUpperCase() : form ? CIRCUIT_FORMS[form].name.toUpperCase() : 'SPARK'}</span>`;
      }
      const h = p.hands[slot], lv = h.holding ? chargeLevel(h) : 0;
      btn.classList.toggle('charging', lv > 0 && lv < 1);
      btn.classList.toggle('charged', lv >= 1);
      let m = 1;
      if (foe && foe.type !== 'dummy') { const g = spellGroup(sp), els = g ? (g.els.length ? g.els : ['force']) : null; if (els) m = elementMult(foe, els); }
      btn.classList.toggle('weak', m > 1.01);
      btn.classList.toggle('resist', m < 0.99);
    }
    if ($('btn-off').hidden) $('btn-off').hidden = false;
    // the star could learn something: its button says so; and the motes carried
    $('btn-map').classList.toggle('hot', motesAffordable());
    const mh = motesHudHtml(d), me = $('hud-motes');
    if (me.dataset.v !== mh) { me.dataset.v = mh; me.innerHTML = mh; me.hidden = !mh; }
    $('btn-dash').classList.toggle('cooling', p.dashCd > 0);
    const a = !Game.modal ? actionHere() : null, btn = $('btn-act');
    setTextIfChanged('btn-act', a ? ({ 'take up': 'TAKE UP THE THREAD', plant: 'PLANT', join: 'JOIN', mend: 'MEND', descend: 'GO DOWN', ascend: 'CLIMB UP' })[a] || String(a).toUpperCase() : '');
    if (btn.hidden !== !a) btn.hidden = !a;
    if (d.channel) { setTextIfChanged('hud-depth', `${d.channel.kind.toUpperCase()}…`); btn.classList.add('hold'); const v = Math.round((d.channel.t / d.channel.max) * 100) + '%'; if (btn.style.getPropertyValue('--fill') !== v) btn.style.setProperty('--fill', v); }
    else btn.classList.remove('hold');
  },
};

// The story, a panel at a time.
function drawStory() {
  const st = UI.story;
  if (!st) return;
  $('story-text').textContent = st.lines[st.i];
  $('story-step').textContent = `${st.i + 1} / ${st.lines.length}`;
}

// ---------------------------------------------------------------------------
// What the buttons do
// ---------------------------------------------------------------------------
UI.acts = {
  go: (id) => UI.show(id),
  back: () => UI.close(),
  resume: () => UI.close(),
  // START OVER, from the pause screen: a screen that says what's lost, then
  // a second tap on its button (Save.startOver), and the game starts again
  restartAsk: () => UI.show('screen-restart'),
  restartBack: () => UI.openPause(),
  startOver: () => { Save.startOver(); UI.close(); location.reload(); },
  storyNext: () => {
    const st = UI.story;
    if (!st) return;
    if (++st.i < st.lines.length) { UI.openedAt = Game.realT; UI.redraw(); return; }
    UI.story = null; UI.close();
    if (st.done) st.done();
  },
  // the opening again (intro.js)
  replayIntro: () => { UI.close(); Intro.play(null); },
  // the star's screen: a shape read, a spell carried (shapes.js)
  moteLearn: (arg) => { if (moteLearn(arg)) UI.redraw(); },
  castCycle: (arg) => { const [i, part] = arg.split(':'); castCycle(Number(i), part); UI.redraw(); },
  // the map: a layer, the picked node stood at, the card put away (map.js)
  mapLayer: (l) => mapLayerSet(l),
  mapGo: () => mapGo(),
  mapCancel: () => { MapView.sel = -1; mapDrawCanvas(); mapBody(); },

  // the pause screen's sound settings: on, soft, off, round again
  soundSet: (kind) => {
    const s = Save.data.settings || (Save.data.settings = {}), v = Snd.level(kind);
    s[kind] = v >= 1 ? T.sound.soft : v > 0 ? 0 : 1;
    Save.saveField('settings');
    Snd.applyLevels(false);
    drawSoundButtons();
  },
  // the pause screen's lamp: a beam the way you're turned, or the round
  // glow (render.js lampBeamOf)
  lampSet: () => {
    const s = Save.data.settings || (Save.data.settings = {});
    s.lamp = lampIsBeam() ? 'glow' : 'beam';
    Save.saveField('settings');
    if (UI.screen === 'screen-lab') drawLab();
  },
  // the pause screen's FINE GRAIN (art.js artFinePx): the view at twice
  // the art's pixels. The art is built at its size as the game loads, so
  // the page is loaded again.
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
};

// The pause screen's sound settings, as they stand.
function drawSoundButtons() {
  const word = (k) => { const v = Snd.level(k); return v >= 1 ? 'ON' : v > 0 ? 'SOFT' : 'OFF'; };
  setTextIfChanged('pause-music', `MUSIC: ${word('music')}`);
  setTextIfChanged('pause-sfx', `SOUNDS: ${word('sfx')}`);
  // FINE GRAIN: where there's WebGL2 for the light (it reloads the page)
  const fine = $('pause-fine'), s = Save.data.settings || {};
  fine.hidden = !(typeof Gpu !== 'undefined' && Gpu.on);
  setTextIfChanged('pause-fine', `FINE GRAIN: ${s.fine ? 'ON' : 'OFF'}`);
}
