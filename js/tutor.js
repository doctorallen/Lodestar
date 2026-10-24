'use strict';
// ---------------------------------------------------------------------------
// Tutorials: Wick points, you do. The screen dims but for the one thing
// that matters (and the way out, ✕, which ends it), Wick says a line, and
// the step is done when the player does it: taps what's lit, or makes the
// thing true that the step waits for. A step that only shows something has
// NEXT. A small SKIP is always there; a tap anywhere else does nothing.
//
// Each station's screen runs its tutorial the first time it opens (once
// ever), and its header's ? plays it again, then its short reference: the
// explanations that used to sit on the screens. The ? in the top bar plays
// the HUD's, pausing the world while it runs.
//
// A tutorial is data (TUTORS): its screen, its steps and its reference.
// A step: at (a selector, or a function giving an element), say (Wick's
// line), and either done (a function: true once it's been done), next
// (true, or a function: show NEXT instead), or neither (done when what's
// lit is tapped). when (a function): skip the step unless it holds. A step
// whose target isn't there is skipped.
// ---------------------------------------------------------------------------

const TUTORS = {
  star: {
    screen: 'screen-star', title: 'THE STAR',
    steps: [
      { at: '#star-body .faces', say: 'Four faces. GIVE feeds it, TURN is your build, ASK is what it knows, GO is the world.', next: true },
      { at: '#star-body .spec-list', say: 'Ore given is a band of its light. A land\'s band at depth 1, and it can light that land.', next: true, face: 'give' },
      { at: '#star-body .light-chips', say: 'Light from deeds grows its magnitude: stand before it and hold FEED.', next: true, face: 'give' },
      { at: '#star-body .row.facet', say: 'Your casts are its facets. Tap one to turn the star.', next: true, face: 'turn' },
      { at: '#star-body .att-list', say: 'A point each magnitude, spent here. Tap +.', next: true, face: 'turn' },
    ],
    ref: [
      'GIVE: ore deepens a band; light from deeds grows the magnitude.',
      'TURN: each cast is a Shape, a Band and, as the star grows, a Turn or a Reading.',
      'Shapes come from the Deeps\' ends and from elites; Readings from creatures read four times.',
      'A warden or a Keeper leaves a shard of old light: a power, while it faces you.',
      'ASK: what the star needs next, the Meridian, the shards, the echoes.',
      'Ring 2 needs magnitude 3, ring 3 needs 5, the Edge 7; and the land\'s band tasted.',
    ],
  },
  map: {
    screen: 'screen-setout', title: 'THE PORTAL',
    steps: [
      { at: '#world-map', say: 'The world. The star\'s in the middle. Tap a land.', done: (r) => r.tapped || UI.mapSel !== r.sel0 },
      { at: '#map-card .tcard', say: 'Its card: what lives there, its ore, how to kindle it.', next: true },
      { at: '#setout-body .next-steps', say: 'NEXT: a good place to start.', next: true },
    ],
    ref: [
      'Walk out into land next to the outpost, or set out to any spire.',
      'Your light lasts about three minutes in dark land, and fills in kindled land.',
      'Kindle land: its heart goal, then plant a spire at its heart.',
      'A spire banks your cargo, and travels to any other.',
      'The star\'s senses open as its bands deepen.',
    ],
  },
  hud: {
    screen: null, title: 'OUT THERE',
    steps: [
      { at: '#topbar .bars', say: 'Health, charge and your light. Dark land drains the light.', next: true },
      { at: '#deck-right', say: 'Spells A and B: tap, or hold to charge. DASH. Hold MINE by a vein.', next: true },
      { at: '#btn-cargo', say: 'What you carry. A fall leaves it in your pack.', next: true },
      { at: '#btn-pause', say: 'II pauses. RECALL takes you home from anywhere.', next: true },
    ],
    ref: [
      'Move with the left thumb; a flick dashes.',
      'When your light runs out, the dark hunts you.',
      'BANK at a spire, or carry it home. A fall leaves it all in your pack, once.',
      'A recall loses nothing, but you stand still a few seconds.',
    ],
  },
};
// The screens with a tutorial, and theirs.
const TUTOR_OF = Object.fromEntries(Object.entries(TUTORS).filter(([, t]) => t.screen).map(([id, t]) => [t.screen, id]));

function $q(sel) { return document.querySelector(sel); }

const Tutor = {
  run: null, // { id, i, replay, ref, tapped, sel0, el }
  pending: null,
  init() {
    const o = document.createElement('div');
    o.id = 'tutor'; o.className = 'tutor'; o.hidden = true;
    o.innerHTML = `<div class="tut-dim"></div><div class="tut-ring"></div>
      <div class="tut-say"><img class="tut-wick" alt=""><div class="tut-body"><p class="tut-line"></p><div class="tut-ref"></div>
      <div class="tut-btns"><span class="tut-step"></span><button class="tut-skip">SKIP</button><button class="tut-ok">NEXT</button></div></div></div>`;
    $('app').appendChild(o);
    o.querySelector('.tut-skip').addEventListener('click', (e) => { e.stopPropagation(); Tutor.skip(); });
    o.querySelector('.tut-ok').addEventListener('click', (e) => { e.stopPropagation(); Tutor.ok(); });
    // a tap on what's lit: noted (the screen's own handler runs it after)
    document.addEventListener('click', (e) => {
      const r = Tutor.run, st = r && !r.ref && Tutor.cur(), el = st && tutorTarget(st);
      if (!el || !(e.target === el || el.contains(e.target))) return;
      if (Game.realT - UI.openedAt >= T.ui.tapGuard) r.tapped = true;
    }, true);
    // a ? in each tutorial's screen header, before its way out
    for (const [screen, id] of Object.entries(TUTOR_OF)) {
      const close = document.querySelector(`#${screen} .head-close`);
      if (!close) continue;
      const b = document.createElement('button');
      b.className = 'head-help'; b.dataset.act = 'help'; b.dataset.arg = id; b.setAttribute('aria-label', 'How this works'); b.textContent = '?';
      close.parentNode.insertBefore(b, close);
    }
    // (on the press: the tap that ended the opening above it lifts here)
    $('btn-help').addEventListener('pointerdown', (e) => { e.preventDefault(); if (Game.dive && !Game.modal && !Intro.on) Tutor.start('hud', true); });
  },
  // A screen opened: its tutorial, the first time (a moment later, past
  // the screen's tap guard).
  auto(screen) {
    const id = TUTOR_OF[screen];
    if (!id || Tutor.run || !Save.data) return;
    const o = onboardState();
    if (o.seen[id] || o.mode === 'old') return;
    Tutor.pending = { id, at: Game.realT + T.ui.tapGuard + 0.05 };
  },
  start(id, replay = false) {
    const t = TUTORS[id];
    if (!t) return;
    Tutor.pending = null;
    onboardState().seen[id] = true;
    if (Save.data) Save.saveField('onboard');
    Tutor.run = { id, i: -1, replay, ref: false, tapped: false, sel0: UI.mapSel, paused: !t.screen };
    if (!t.screen) { Game.modal = 'tutor'; Input.block(); }
    $('tutor').hidden = false;
    $('tutor').querySelector('.tut-wick').src = wickPortraitUrl();
    Tutor.advance();
  },
  cur() { const r = Tutor.run; return r && TUTORS[r.id].steps[r.i]; },
  // On to the next step that can be shown, or the reference (on a replay),
  // or the end.
  advance() {
    const r = Tutor.run, steps = TUTORS[r.id].steps;
    r.tapped = false;
    for (r.i++; r.i < steps.length; r.i++) {
      const st = steps[r.i];
      if (st.when && !st.when(r)) continue;
      // (a step on another face of the star's screen turns to it: starui.js)
      if (st.face && UI.face !== st.face) { UI.face = st.face; UI.turn = null; UI.redraw(); }
      if (!tutorTarget(st)) continue;
      const el = tutorTarget(st);
      if (el.scrollIntoView) el.scrollIntoView({ block: 'center' });
      Tutor.show();
      return;
    }
    if (r.replay && !r.ref) { r.ref = true; Tutor.show(); return; }
    Tutor.end();
  },
  ok() {
    const r = Tutor.run;
    if (!r) return;
    snd('tap');
    if (r.ref) { Tutor.end(); return; }
    Tutor.advance();
  },
  // SKIP: on a replay, straight to the reference; else done.
  skip() {
    const r = Tutor.run;
    if (!r) return;
    snd('tap');
    if (r.replay && !r.ref) { r.ref = true; Tutor.show(); return; }
    Tutor.end();
  },
  end() {
    const r = Tutor.run;
    Tutor.run = null;
    const o = $('tutor');
    o.hidden = true;
    if (r && r.paused && Game.modal === 'tutor') { Game.modal = null; Input.block(); }
  },
  // The bubble's words and buttons for the step (or the reference).
  show() {
    const r = Tutor.run, t = TUTORS[r.id], st = Tutor.cur(), o = $('tutor');
    o.classList.toggle('ref', r.ref);
    o.querySelector('.tut-line').textContent = r.ref ? t.title : st.say;
    o.querySelector('.tut-ref').innerHTML = r.ref ? t.ref.map((l) => `<p>${esc(l)}</p>`).join('') : '';
    const n = t.steps.length;
    o.querySelector('.tut-step').textContent = r.ref ? '' : `${r.i + 1}/${n}`;
    o.querySelector('.tut-skip').hidden = r.ref;
    o.querySelector('.tut-ok').textContent = r.ref ? 'DONE' : 'NEXT';
    o.querySelector('.tut-ok').hidden = !r.ref && !(typeof st.next === 'function' ? st.next(r) : st.next);
    Tutor.place();
  },
  // Every step: the step done, or the screen gone; the light kept on what
  // matters as it moves.
  frame() {
    const P = Tutor.pending;
    if (P && Game.realT >= P.at) {
      Tutor.pending = null;
      if (UI.screen === TUTORS[P.id].screen) Tutor.start(P.id);
    }
    const r = Tutor.run;
    if (!r) return;
    const t = TUTORS[r.id];
    if (t.screen ? UI.screen !== t.screen : Game.modal !== 'tutor') { Tutor.end(); return; }
    if (!r.ref) {
      const st = Tutor.cur();
      const el = tutorTarget(st);
      const okNow = typeof st.next === 'function' ? st.next(r) : !!st.next;
      if (!el || (st.done ? st.done(r) : r.tapped)) { Tutor.advance(); return; }
      const ok = $('tutor').querySelector('.tut-ok');
      if (ok.hidden !== !okNow) { ok.hidden = !okNow; Tutor.place(); }
    }
    Tutor.place();
  },
  // The dim with its holes (what's lit, and the way out), the ring round
  // what's lit, and the bubble beside it, clear of the header.
  place() {
    const r = Tutor.run, o = $('tutor');
    if (!r) return;
    const W = window.innerWidth, H = window.innerHeight, say = o.querySelector('.tut-say'), ring = o.querySelector('.tut-ring'), dim = o.querySelector('.tut-dim');
    const st = !r.ref && Tutor.cur(), el = st && tutorTarget(st);
    if (r.ref) o.querySelector('.tut-ok').hidden = false;
    const holes = [];
    let tr = null;
    if (el) { const b = el.getBoundingClientRect(); tr = { l: Math.max(2, b.left - 4), t: Math.max(2, b.top - 4), r: Math.min(W - 2, b.right + 4), b: Math.min(H - 2, b.bottom + 4) }; holes.push(tr); }
    const out = tutorWayOut();
    // (not twice over the same place: evenodd would fill it in again)
    if (out && out !== el && !(el && el.contains(out))) { const b = out.getBoundingClientRect(); if (b.width) holes.push({ l: b.left - 2, t: b.top - 2, r: b.right + 2, b: b.bottom + 2 }); }
    const path = `M0 0H${W}V${H}H0Z` + holes.map((h) => `M${Math.round(h.l)} ${Math.round(h.t)}H${Math.round(h.r)}V${Math.round(h.b)}H${Math.round(h.l)}Z`).join('');
    const clip = `path(evenodd, "${path}")`;
    if (dim.dataset.clip !== clip) { dim.dataset.clip = clip; dim.style.clipPath = clip; }
    if (tr) Object.assign(ring.style, { display: '', left: tr.l + 'px', top: tr.t + 'px', width: tr.r - tr.l + 'px', height: tr.b - tr.t + 'px' });
    else ring.style.display = 'none';
    // the bubble: below what's lit if there's room, else above; never over
    // the screen's header (its way out)
    const head = r.paused ? null : document.querySelector(`#${TUTORS[r.id].screen} .screen-head`);
    const top0 = head ? head.getBoundingClientRect().bottom + 6 : 8, sw = Math.min(380, W - 24), sh = say.offsetHeight || 90;
    let x = W / 2 - sw / 2, y;
    if (!tr || r.ref) y = Math.max(top0, H / 2 - sh / 2);
    else {
      const below = H - tr.b - 12, above = tr.t - top0 - 12;
      y = below >= sh || below >= above ? tr.b + 10 : tr.t - 10 - sh;
      y = clamp(y, top0, H - sh - 8);
      x = clamp((tr.l + tr.r) / 2 - sw / 2, 12, W - sw - 12);
    }
    Object.assign(say.style, { left: Math.round(x) + 'px', top: Math.round(y) + 'px', width: sw + 'px' });
  },
};
// What a step lights: its element, if it's there and shown.
function tutorTarget(st) {
  const el = typeof st.at === 'function' ? st.at() : $q(st.at);
  if (!el || el.hidden) return null;
  const b = el.getBoundingClientRect();
  return b.width > 0 && b.height > 0 ? el : null;
}
// The way out of what's open: the card's ✕, else the screen's.
function tutorWayOut() {
  const r = Tutor.run;
  if (!r || r.paused) return null;
  if (UI.card && !$('card').hidden) return $q('#card [data-act=closeCard]');
  return $q(`#${TUTORS[r.id].screen} .head-close`);
}

Object.assign(UI.acts, {
  help: (id) => Tutor.start(id, true),
});
