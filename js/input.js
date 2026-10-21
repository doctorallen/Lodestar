'use strict';
// ---------------------------------------------------------------------------
// Controls. On a phone: a floating joystick wherever the left thumb lands in
// the left deck (a quick flick as it lands dashes), and buttons in the
// right deck: one for each hand (SWING for a blade, CAST for a focus: tap,
// tap again for a combo, hold to charge), DASH, MINE (held), and the
// contextual action (SET OUT, EXTRACT). Upright the decks sit side by side
// under the view; sideways they're either side of it. On a keyboard: WASD
// or the arrows to move, J for the main hand, K for the off hand, Shift or
// U to dash, Space or L to mine, E or Enter to act (held, to feed the star
// at its altar), I for cargo, Esc to
// pause, or to close the card or screen that's open. The tests drive the same interface through Input.bot.
// ---------------------------------------------------------------------------

const STICK_R = 44; // CSS px
const STICK_DEAD = 6;
const HOLD_BUTTONS = { main: 'btn-main', off: 'btn-off', mine: 'btn-mine', act: 'btn-act' };
const HOLD_KEYS = { main: ['KeyJ'], off: ['KeyK'], mine: ['Space', 'KeyL'], act: ['KeyE', 'Enter'] };
const DASH_KEYS = ['ShiftLeft', 'ShiftRight', 'KeyU'];

const Input = {
  move: { x: 0, y: 0 },
  stick: null, // { id, bx, by, x, y } in client px
  held: { main: null, off: null, mine: null, act: null }, // the pointer holding each button
  actReq: false,
  dashReq: null, // true, or a direction from a flick
  keys: new Set(),
  bot: null, // { x, y, main, off, mine, act, actHeld, dash } from the tests (act: a press; actHeld: still down)
  // each hand's button: down now, and a press or release since the game
  // last looked (they wait to be seen, so a hit's pause doesn't eat them)
  hands: { main: { down: false, pressed: false, released: false }, off: { down: false, pressed: false, released: false } },

  isHeld(k) {
    if (this.bot) return !!this.bot[k === 'act' ? 'actHeld' : k];
    return this.held[k] !== null || HOLD_KEYS[k].some((c) => this.keys.has(c));
  },
  mining() { return this.isHeld('mine'); },
  // A hand's button for the game to read; reading clears its press and release.
  hand(slot) {
    const h = this.hands[slot], out = { down: h.down, pressed: h.pressed, released: h.released };
    h.pressed = false; h.released = false;
    return out;
  },
  consumeDash() {
    if (this.bot) { const a = !!this.bot.dash; this.bot.dash = false; return a; }
    const r = this.dashReq; this.dashReq = null; return r;
  },
  consumeAct() {
    if (this.bot) { const a = !!this.bot.act; this.bot.act = false; return a; }
    const a = this.actReq; this.actReq = false; return a;
  },
  update() {
    for (const k of ['main', 'off']) {
      const h = this.hands[k], now = this.isHeld(k);
      if (now && !h.down) h.pressed = true;
      if (!now && h.down) h.released = true;
      h.down = now;
    }
    if (this.bot) { this.move.x = this.bot.x || 0; this.move.y = this.bot.y || 0; return; }
    const s = this.stick;
    if (s) {
      let dx = (s.x - s.bx) / STICK_R, dy = (s.y - s.by) / STICK_R;
      const m = Math.hypot(dx, dy);
      if (m * STICK_R < STICK_DEAD) dx = dy = 0;
      else if (m > 1) { dx /= m; dy /= m; }
      this.move.x = dx; this.move.y = dy;
      return;
    }
    const k = this.keys;
    const kx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const ky = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
    const m = Math.hypot(kx, ky) || 1;
    this.move.x = kx / m; this.move.y = ky / m;
  },
  // A screen opened: whatever thumbs were down let go, so they can't press
  // anything on it or carry on walking afterwards.
  block() {
    this.stick = null;
    this.actReq = false;
    for (const k in this.held) { this.held[k] = null; $(HOLD_BUTTONS[k]).classList.remove('held'); }
    for (const k in this.hands) Object.assign(this.hands[k], { down: false, pressed: false, released: false });
    this.dashReq = null;
    this.keys.clear();
    drawStick();
  },
};

function drawStick() {
  const s = Input.stick, base = $('stick-base');
  if (!s) { base.hidden = true; return; }
  base.hidden = false;
  base.style.left = s.bx - STICK_R + 'px';
  base.style.top = s.by - STICK_R + 'px';
  let dx = s.x - s.bx, dy = s.y - s.by;
  const m = Math.hypot(dx, dy);
  if (m > STICK_R) { dx *= STICK_R / m; dy *= STICK_R / m; }
  $('stick-knob').style.transform = `translate(${dx}px, ${dy}px)`;
}

function setupInput() {
  const left = $('deck-left');
  left.addEventListener('pointerdown', (e) => {
    if (Game.modal || Input.stick) return;
    e.preventDefault();
    // the whole stick stays inside the deck
    const r = left.getBoundingClientRect();
    const bx = clamp(e.clientX, r.left + STICK_R, Math.max(r.left + STICK_R, r.right - STICK_R));
    const by = clamp(e.clientY, r.top + STICK_R, Math.max(r.top + STICK_R, r.bottom - STICK_R));
    Input.stick = { id: e.pointerId, bx, by, x: e.clientX, y: e.clientY, t0: performance.now(), x0: e.clientX, y0: e.clientY, flicked: false };
    try { left.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
    drawStick();
  });
  left.addEventListener('pointermove', (e) => {
    const s = Input.stick;
    if (!s || s.id !== e.pointerId) return;
    s.x = e.clientX; s.y = e.clientY;
    // a quick flick as the thumb lands dashes that way
    const fx = s.x - s.x0, fy = s.y - s.y0;
    if (!s.flicked && performance.now() - s.t0 < T.dash.flickMs && Math.hypot(fx, fy) > T.dash.flickPx) { s.flicked = true; Input.dashReq = norm(fx, fy); }
    drawStick();
  });
  const endStick = (e) => { if (Input.stick && Input.stick.id === e.pointerId) { Input.stick = null; drawStick(); } };
  left.addEventListener('pointerup', endStick);
  left.addEventListener('pointercancel', endStick);

  for (const [k, id] of Object.entries(HOLD_BUTTONS)) {
    const btn = $(id);
    btn.addEventListener('pointerdown', (e) => {
      if (Game.modal) return;
      e.preventDefault();
      Input.held[k] = e.pointerId;
      try { btn.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
      btn.classList.add('held');
    });
    const end = (e) => { if (Input.held[k] === e.pointerId) { Input.held[k] = null; btn.classList.remove('held'); } };
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointercancel', end);
  }

  $('btn-dash').addEventListener('pointerdown', (e) => {
    if (Game.modal) return;
    e.preventDefault();
    Input.dashReq = true;
  });
  $('btn-act').addEventListener('pointerdown', (e) => {
    if (Game.modal) return;
    e.preventDefault();
    Input.actReq = true;
  });

  const GAME_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
  window.addEventListener('keydown', (e) => {
    if (GAME_KEYS.has(e.code) && !Game.modal) e.preventDefault();
    if (e.repeat) return;
    if ((e.code === 'Escape' || e.code === 'KeyP') && Game.dive) {
      if (Game.modal === 'screen-report') UI.acts.closeReport();
      // an item card closes first, back to the screen under it
      else if (UI.card && Game.modal !== 'screen-reveal') UI.acts.closeCard();
      else if (Game.modal === 'screen-anvil' || Game.modal === 'screen-reveal' || Game.modal === 'screen-story' || Game.modal === 'screen-resume') { /* these finish themselves, or need an answer */ }
      else if (Game.modal) UI.close();
      else UI.openPause();
      return;
    }
    if (e.code === 'KeyI' && Game.dive && !Game.modal) { if (Game.dive.hub) UI.show('screen-gear'); else UI.openCargo(); return; }
    if ((e.code === 'KeyE' || e.code === 'Enter') && !Game.modal) Input.actReq = true;
    if (DASH_KEYS.includes(e.code) && !Game.modal) Input.dashReq = true;
    Input.keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => { if (GAME_KEYS.has(e.code)) e.preventDefault(); Input.keys.delete(e.code); });
  window.addEventListener('blur', () => Input.keys.clear());
}
