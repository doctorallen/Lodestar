'use strict';
// ---------------------------------------------------------------------------
// Boot and the loop. The simulation steps at a fixed 60 Hz (at most five
// steps a frame, so a slow phone slows down rather than walking through
// walls), and a frame is drawn on every animation frame. Game.step(dt) runs
// one step on its own, which is how the tests play the game quickly.
// ---------------------------------------------------------------------------

const STEP = 1 / 60;
// The view's shake, dying away (Tycho's: View.shake; combat.js shakeView).
const VIEW_SHAKE = new Tycho.harm.Shake(View, 14);
// (Tycho's stepper: at most five steps a frame, the rest dropped)
const Steps = new Tycho.loop.Stepper({ dt: STEP, max: 5 });
let _resizeT = 0;

function step(dtReal) {
  Game.realT += dtReal;
  Input.update(dtReal);
  introUpdate(dtReal);
  updateSparks(dtReal);
  UI.frame(dtReal);
  VIEW_SHAKE.step(dtReal);
  if (Game.modal) return;
  // a hit lands: everything holds still for a moment (combat.js HITSTOP)
  if (HITSTOP.hold(dtReal)) return;
  if (!Game.dive) return;
  updateCastFx(dtReal);
  const dt = dtReal * Game.timeScale;
  Game.t += dt;
  updateDive(dtReal, dt);
}

function frame(now) {
  perfGap(now);
  const dt = Steps.since(now);
  try {
    Steps.advance(dt, step);
    _resizeT -= dt;
    if (_resizeT <= 0) { _resizeT = 0.5; fitLayout(); resizeView(); }
    Snd.tick(dt);
  } catch (e) {
    noteError(e);
  }
  try { renderAll(); } catch (e) { noteError(e); }
  requestAnimationFrame(frame);
}

// A frame: the game, and the opening over it while it plays (its first
// scenes cover the screen, and the game isn't drawn under them). Nor is it
// under a screen, which covers it too. The paint lab's sheet is the
// exception: the world shows above it (lab.js).
function renderAll() {
  if (!introCovers() && !(UI.screen && Game.modal === UI.screen && UI.screen !== 'screen-lab')) renderFrame();
  introDraw();
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
  // the paint lab from the address (lab.js; screenshots and the tests)
  Lab.fromQuery(location.search);
  buildSprites();
  setupView();
  setupInput();
  UI.init();
  // installing, and loading onto a new deploy (pwa.js)
  Pwa.init();
  fitLayout();
  resizeView();
  let rt = 0;
  const onResize = () => { clearTimeout(rt); rt = setTimeout(() => { fitLayout(); resizeView(); }, 100); };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
  // leaving the tab pauses the game
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    Save.data.lastSeen = Date.now(); Save.saveField('lastSeen');
    if (Game.dive && !Game.modal) UI.openPause();
  });
  window.addEventListener('pagehide', () => { Save.data.lastSeen = Date.now(); Save.saveField('lastSeen'); });
  Game.step = step;
  Game.render = renderAll;
  // the loading screen builds what play needs, then waits for a tap (loader.js)
  Loader.run(bootEnter);
}

// After the loading and its tap: where the game opens. The world was
// built while loading (Loader.landed).
function bootEnter() {
  requestAnimationFrame((t) => { Steps.last = t; frame(t); });
  if (!Loader.landed) enterWorld();
  else worldWelcome({});
  if (Save.unread) UI.toast("The old save couldn't be read. It's been kept aside, and this is a new start");
  Game.ready = true;
  Pwa.entered();
  // what of the sound the loading left, in idle time (sndbank.js)
  if (SndBank.started) SndBank.idle();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
