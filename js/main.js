'use strict';
// ---------------------------------------------------------------------------
// Boot and the loop. The simulation steps at a fixed 60 Hz (at most five
// steps a frame, so a slow phone slows down rather than walking through
// walls), and a frame is drawn on every animation frame. Game.step(dt) runs
// one step on its own, which is how the tests play the game quickly.
// ---------------------------------------------------------------------------

const STEP = 1 / 60;
let _acc = 0, _last = 0, _resizeT = 0;

function step(dtReal) {
  Game.realT += dtReal;
  Input.update(dtReal);
  updateSparks(dtReal);
  UI.frame(dtReal);
  View.shake = (View.shake || 0) * Math.exp(-14 * dtReal);
  if (Game.modal === 'screen-anvil') Anvil.update(dtReal);
  if (Game.dive && Game.dive.feedT > 0) Game.dive.feedT = Math.max(0, Game.dive.feedT - dtReal);
  if (Game.modal) return;
  // a hit lands: everything holds still for a moment
  if (Game.hitstop > 0) { Game.hitstop -= dtReal; return; }
  if (!Game.dive) return;
  updateCastFx(dtReal);
  const dt = dtReal * Game.timeScale;
  Game.t += dt;
  updateDive(dtReal, dt);
}

function frame(now) {
  const dt = Math.min(0.1, (now - _last) / 1000 || 0);
  _last = now;
  try {
    _acc += dt;
    let n = 0;
    while (_acc >= STEP && n < 5) { step(STEP); _acc -= STEP; n++; }
    if (n === 5) _acc = 0;
    _resizeT -= dt;
    if (_resizeT <= 0) { _resizeT = 0.5; fitLayout(); resizeView(); }
    Snd.tick(dt);
  } catch (e) {
    noteError(e);
  }
  try { renderFrame(); } catch (e) { noteError(e); }
  requestAnimationFrame(frame);
}

const Errors = [];
function noteError(e) {
  Errors.push(String((e && e.stack) || e));
  if (Errors.length > 20) Errors.shift();
  console.error(e);
}

// Held sideways (the screen more than 5:4 wide), the view stands in the
// middle with the decks either side (css: #app.wide).
const WIDE_RATIO = 1.25;
function fitLayout() {
  const app = $('app');
  const wide = window.innerWidth > window.innerHeight * WIDE_RATIO;
  if (app.classList.contains('wide') !== wide) app.classList.toggle('wide', wide);
  // older browsers without dvh: size to the visible viewport instead
  if (!(window.CSS && CSS.supports && CSS.supports('height', '100dvh'))) {
    const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    document.documentElement.style.setProperty('--app-h', h + 'px');
  }
}

function boot() {
  Save.load();
  buildSprites();
  setupView();
  setupInput();
  UI.init();
  fitLayout();
  resizeView();
  let rt = 0;
  const onResize = () => { clearTimeout(rt); rt = setTimeout(() => { fitLayout(); resizeView(); }, 100); };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
  // leaving the tab pauses a dive
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && Game.dive && !Game.dive.hub) {
      // the materials are already spent: make the piece before the page can die
      if (Game.modal === 'screen-anvil' && Anvil.job && Anvil.job.field) Anvil.finish();
      saveRun(Game.dive);
      if (!Game.modal) UI.openPause();
    }
  });
  Game.step = step;
  Game.render = renderFrame;
  Game.ready = true;
  enterHub();
  window.addEventListener('pagehide', () => { if (Game.dive && !Game.dive.hub) saveRun(Game.dive); });
  if (Save.data.run && !Save.unread) UI.show('screen-resume');
  if (Save.unread) UI.toast("The old save couldn't be read. It's been kept aside, and this is a new start");
  requestAnimationFrame((t) => { _last = t; frame(t); });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
