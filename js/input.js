'use strict';
// ---------------------------------------------------------------------------
// Controls. On a phone: a floating joystick wherever the left thumb lands in
// the left deck, and buttons in the right deck: MINE (hold) and the
// contextual action (DESCEND, EXTRACT). Upright the decks sit side by side
// under the view; sideways they're either side of it. On a keyboard: WASD or
// the arrows to move, Space or J to mine, E or Enter to act, Esc to pause.
// The tests drive the same interface through Input.bot.
// ---------------------------------------------------------------------------

const STICK_R = 44; // CSS px
const STICK_DEAD = 6;

const Input = {
  move: { x: 0, y: 0 },
  stick: null, // { id, bx, by, x, y } in client px
  mineId: null, // the pointer holding MINE
  actReq: false,
  keys: new Set(),
  bot: null, // { x, y, mine, act } from the tests

  mining() {
    if (this.bot) return !!this.bot.mine;
    return this.mineId !== null || this.keys.has('Space') || this.keys.has('KeyJ');
  },
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
    this.mineId = null;
    this.actReq = false;
    $('btn-mine').classList.remove('held');
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

  const mine = $('btn-mine');
  mine.addEventListener('pointerdown', (e) => {
    if (Game.modal) return;
    e.preventDefault();
    Input.mineId = e.pointerId;
    try { mine.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
    mine.classList.add('held');
  });
  const endMine = (e) => { if (Input.mineId === e.pointerId) { Input.mineId = null; mine.classList.remove('held'); } };
  mine.addEventListener('pointerup', endMine);
  mine.addEventListener('pointercancel', endMine);

  $('btn-act').addEventListener('pointerdown', (e) => {
    if (Game.modal) return;
    e.preventDefault();
    Input.actReq = true;
  });

  const GAME_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
  window.addEventListener('keydown', (e) => {
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    if ((e.code === 'Escape' || e.code === 'KeyP') && Game.scene === 'dive') {
      if (Game.modal === 'screen-pause') UI.close();
      else if (!Game.modal) UI.openPause();
      return;
    }
    if ((e.code === 'KeyE' || e.code === 'Enter') && !Game.modal) Input.actReq = true;
    Input.keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => { if (GAME_KEYS.has(e.code)) e.preventDefault(); Input.keys.delete(e.code); });
  window.addEventListener('blur', () => Input.keys.clear());
}
