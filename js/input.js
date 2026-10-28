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
// The controls are Tycho's (Tycho.input.Controls): this keeps the names the
// game reads. A screen opening lets go of every thumb (Input.block) and
// starts the guard that keeps its buttons from taps for a moment
// (Input.guard, Input.guarded; T.ui.tapGuard).
// ---------------------------------------------------------------------------

const STICK_R = 44; // CSS px
const STICK_DEAD = 6;

const Input = {
  C: new Tycho.input.Controls({
    keys: {
      KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
      KeyJ: 'main', KeyK: 'off', Space: 'mine', KeyL: 'mine', KeyE: 'act', Enter: 'act', ShiftLeft: 'dash', ShiftRight: 'dash', KeyU: 'dash',
    },
    axes: { left: 'left', right: 'right', up: 'up', down: 'down', round: true },
    // act and dash wait to be taken; each hand's press and release since the game last looked
    presses: ['act', 'dash'],
    edges: ['main', 'off'],
    stick: { radius: STICK_R, dead: STICK_DEAD, inside: true, flick: { action: 'dash', get ms() { return T.dash.flickMs; }, get px() { return T.dash.flickPx; } }, onChange: () => drawStick() },
    // the tests' bot: { x, y, main, off, mine, act, actHeld, dash } (act: a press; actHeld: still down)
    bot: { held: { act: 'actHeld' }, press: { act: 'act', dash: 'dash' } },
    blocked: () => !!Game.modal,
    get guard() { return T.ui.tapGuard; },
    clock: () => Game.realT,
  }),
  get move() { return this.C.move; },
  get stick() { return this.C.stick; },
  get bot() { return this.C.bot; },
  set bot(b) { this.C.bot = b; },
  isHeld(k) { return this.C.held(k); },
  mining() { return this.isHeld('mine'); },
  // A hand's button for the game to read; reading clears its press and release.
  hand(slot) { return this.C.edges(slot); },
  consumeDash() { return this.C.take('dash'); },
  consumeAct() { return this.C.take('act'); },
  update() { this.C.update(); },
  // A screen opened: whatever thumbs were down let go, so they can't press
  // anything on it or carry on walking afterwards.
  block() { this.C.block(); },
  guard(s) { this.C.guard(s); },
  guarded() { return this.C.guarded(); },
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
  Input.C.listen({
    stick: $('deck-left'),
    buttons: { main: $('btn-main'), off: $('btn-off'), act: $('btn-act') },
    taps: { dash: $('btn-dash') },
    prevent: ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'],
    preventUp: true,
  });
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if ((e.code === 'Escape' || e.code === 'KeyP') && Game.dive) {
      if (Game.modal === 'screen-story') { /* it finishes itself */ }
      else if (Game.modal) UI.close();
      else UI.openPause();
    }
  });
  // (taps in the game's first moments count for nothing, as on a screen just opened)
  Input.guard();
}
