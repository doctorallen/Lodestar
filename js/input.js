'use strict';
// ---------------------------------------------------------------------------
// Controls. On a phone: a floating joystick wherever the left thumb lands in
// the left deck, and buttons in the right deck, all held: one for each hand
// (SWING for a blade, CAST for a focus), MINE, and the contextual action
// (DESCEND, EXTRACT). Upright the decks sit side by side under the view;
// sideways they're either side of it. On a keyboard: WASD or the arrows to
// move, J for the main hand, K for the off hand, Space or L to mine, E or
// Enter to act, Esc to pause. The tests drive the same interface through
// Input.bot.
// ---------------------------------------------------------------------------

const STICK_R = 44; // CSS px
const STICK_DEAD = 6;
const HOLD_BUTTONS = { main: 'btn-main', off: 'btn-off', mine: 'btn-mine' };
const HOLD_KEYS = { main: ['KeyJ'], off: ['KeyK'], mine: ['Space', 'KeyL'] };

const Input = {
  move: { x: 0, y: 0 },
  stick: null, // { id, bx, by, x, y } in client px
  held: { main: null, off: null, mine: null }, // the pointer holding each button
  actReq: false,
  keys: new Set(),
  bot: null, // { x, y, main, off, mine, act } from the tests

  isHeld(k) {
    if (this.bot) return !!this.bot[k];
    return this.held[k] !== null || HOLD_KEYS[k].some((c) => this.keys.has(c));
  },
  mining() { return this.isHeld('mine'); },
  handHeld(slot) { return this.isHeld(slot); },
  consumeAct() {
    if (this.bot) { const a = !!this.bot.act; this.bot.act = false; return a; }
    const a = this.actReq; this.actReq = false; return a;
  },
  update() {
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
    Input.stick = { id: e.pointerId, bx, by, x: e.clientX, y: e.clientY };
    try { left.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
    drawStick();
  });
  left.addEventListener('pointermove', (e) => {
    const s = Input.stick;
    if (!s || s.id !== e.pointerId) return;
    s.x = e.clientX; s.y = e.clientY;
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

  $('btn-act').addEventListener('pointerdown', (e) => {
    if (Game.modal) return;
    e.preventDefault();
    Input.actReq = true;
  });

  const GAME_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
  window.addEventListener('keydown', (e) => {
    if (GAME_KEYS.has(e.code) && !Game.modal) e.preventDefault();
    if (e.repeat) return;
    if ((e.code === 'Escape' || e.code === 'KeyP') && Game.scene === 'dive') {
      if (Game.modal) UI.close();
      else UI.openPause();
      return;
    }
    if (e.code === 'KeyI' && Game.scene === 'dive' && !Game.modal) { UI.openCargo(); return; }
    if ((e.code === 'KeyE' || e.code === 'Enter') && !Game.modal) Input.actReq = true;
    Input.keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => { if (GAME_KEYS.has(e.code)) e.preventDefault(); Input.keys.delete(e.code); });
  window.addEventListener('blur', () => Input.keys.clear());
}
