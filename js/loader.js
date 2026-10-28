'use strict';
// ---------------------------------------------------------------------------
// Loading: the Charter's systems booting up. Before the game shows anything
// it builds what it would otherwise build in the middle of play (the fight's
// sounds, the Kindler's frames, the place you'll land in, painted, the
// creatures and plants of the land next to it), a slice at a time, with an
// honest bar, then waits for a tap: the tap the sound needs anyway.
//
// A task is one line of the boot log. Add one with
//   loaderAdd('PRIMING THE THING', weight, fn)
// from any file loaded after this one (at its top level). weight: about
// how long it takes beside the others (the Kindler's frames are 40, about
// 1.6 s on a desktop). fn(job) is
// called once, in order, after the built-in tasks, and may:
//   - do its work at once and return (keep it under ~12 ms);
//   - return a step function, called again and again in slices of about
//     12 ms until it returns true (it may call job.at(k, n) as it goes);
//   - or be async: `await job.yield()` often, which waits for the next
//     frame only once the slice is spent.
// job.at(k, n) shows "k/n" on its line and moves the bar; job.say(text)
// changes its line. A task that throws is skipped (its line says so), and
// whatever it didn't build is built lazily in play, as before. With
// ?noload in the address, or if anything here fails, the game starts as it
// always did.
// ---------------------------------------------------------------------------

const LOADER_SLICE = 12; // ms of work a frame
// (Tycho's loader runs the tasks a slice at a time; the screen is this file's)
const LoaderTasks = new Tycho.loader.Tasks({ slice: LOADER_SLICE, onError: (e) => noteError(e) });

const Loader = {
  extra: [], state: null, ms: 0, t0: 0,
  get jobs() { return LoaderTasks.jobs; },
  get mainDone() { return LoaderTasks.mainDone; },
  // what the loading left ready for the start: { hub }, or { run, held }
  // (the sortie under way, and what it would have said on arriving)
  landed: null,

  // Runs every task, then waits for the tap, then calls done().
  run(done) {
    const el = typeof document !== 'undefined' && document.getElementById('loader');
    if (!el || /[?&]noload\b/.test(location.search)) { if (el) el.hidden = true; done(); return; }
    let work;
    try {
      this.el = el; this.done = done;
      this.state = 'loading'; this.t0 = performance.now();
      el.hidden = false;
      // (nothing opens under it: the pause a hidden page asks for, say)
      Game.modal = 'loader';
      // The side lane (the sound bank: mostly waiting on another thread)
      // starts at once; the main lane runs its tasks one after another.
      work = LoaderTasks.run(loaderCoreJobs().concat(this.extra, loaderLateJobs()));
      loaderUIStart();
    } catch (e) {
      noteError(e);
      this.state = null; el.hidden = true; Game.modal = null;
      done();
      return;
    }
    work.then(() => this.ready(), (e) => { noteError(e); this.ready(); });
  },

  // Waits for the next frame once this slice's time is spent (or at once,
  // if now): the bar is drawn, and a frame shown, between slices.
  yield(now) { return LoaderTasks.yield(now); },

  // How far, 0..1: each task's share by its weight.
  progress() { return LoaderTasks.progress(); },

  ready() {
    if (this.state !== 'loading') return;
    this.ms = Math.round(performance.now() - this.t0);
    this.state = 'ready';
    loaderUIReady();
  },

  // The tap: the sound's own listener has already made the live context
  // (audio.js sndUnlock); the thumb that tapped presses nothing in play.
  begin() {
    if (this.state !== 'ready') return;
    this.state = 'done';
    window.removeEventListener('keydown', loaderKey);
    Input.block();
    this.el.classList.add('gone');
    setTimeout(() => { this.el.hidden = true; loaderUIStop(); }, 320);
    Game.modal = null;
    this.done();
  },
};

// Adds a task to the loading (see the top of this file).
function loaderAdd(label, weight, fn, opts) {
  Loader.extra.push(Object.assign({ label, weight: weight || 1, fn }, opts || {}));
}

// A task's handle: how far it's got, and its line.
// Runs fn on each of a list, a slice at a time: a step function for a task.
function loaderEach(job, list, fn) { return LoaderTasks.each(job, list, fn); }

// ---------------------------------------------------------------------------
// The built-in tasks
// ---------------------------------------------------------------------------
function loaderCoreJobs() {
  return [
    // the fight's sounds and the footsteps (sndbank.js): rendered on the
    // audio thread, so they run beside everything else
    typeof OfflineAudioContext !== 'undefined' && {
      label: 'SYNTHESISING AUDIO', weight: 20, side: true,
      // (every sound's first variant; the rest for as long as the main
      // lane is busy, then in idle time once play has begun)
      fn: (job) => SndBank.start(BANK_RATE, 0, {
        pace: (k, n) => { if (n) job.at(k, n, Math.min(1, k / SndBank.first)); return job.yield(); },
        enough: () => Loader.mainDone,
        intro: typeof BANK_INTRO !== 'undefined' && !Save.data.introSeen,
      }),
    },
    // where you'll wake: the outpost, or the sortie that was under way
    { label: 'SURVEYING TERRAIN', weight: 2, fn: (job) => loaderLand(job) },
    // every frame of the Kindler, each facing, pose and cast (diver.js)
    {
      label: 'CALIBRATING SUIT · KINDLER RIG', weight: 40,
      fn: (job) => loaderEach(job, kindlerEveryFrame(), ([fi, key]) => {
        const s = kdGet(fi, key);
        if (typeof pshSil === 'function') pshSil(s);
        // (the likeliest frames onto the GPU's atlas now; the rest as they come)
        if (job.k < GPU_WARM_FRAMES) gpuWarm(s);
      }),
    },
    // the ground and the rock where you land, every chunk, nearest first
    { label: 'PAINTING THE GROUND', weight: 50, fn: (job) => loaderPaint(job) },
    // the view swept over it: the outpost's modules, the plants, their
    // shadows, the lights, all drawn once out of sight
    { label: 'LIGHTING THE SITE', weight: 6, fn: (job) => loaderSweep(job) },
    // the creatures and plants of the land next door (ring 1's climes)
    { label: 'READING LIFE SIGNS', weight: 3, fn: (job) => loaderClimes(job) },
  ];
}
// Hooks for what other parts of the game build ahead, if they're there;
// and last, the first view itself.
function loaderLateJobs() {
  return [
    typeof castfxWarm === 'function' && { label: 'PRIMING CIRCUITS', weight: 4, fn: (job) => castfxWarm(job) },
    // the opening's painted scenes, for a new game (intro.js)
    typeof Intro !== 'undefined' && (typeof Intro.warm === 'function' || typeof introPrebuild === 'function') && !Save.data.introSeen && { label: 'DEVELOPING THE LANDING RECORD', weight: 8, fn: (job) => loaderIntro(job) },
    { label: 'WAKING WICK', weight: 1, fn: () => loaderFirstView() },
  ];
}

// Builds the place the game will open on, without a word yet: the outpost
// (enterHub, quiet), or the sortie under way (resumeRun, its toasts and
// Wick's lines held until it's carried on: loaderReplay).
function loaderLand() {
  enterWorld({ quiet: true });
  Loader.landed = { world: true };
}

// Paints every chunk of the floor within a few views of where you stand,
// the nearest first.
function loaderPaint(job) {
  const d = Game.dive;
  if (!d) return;
  const f = d.floor;
  job.say('PAINTING THE GROUND');
  paintFloor(f);
  const S = View.pnt, cx = d.p.x * AP, cy = d.p.y * AP, reach = 2.4 * Math.max(View.w, View.h);
  const todo = [];
  for (let j = 0; j < S.ny; j++) for (let i = 0; i < S.nx; i++) {
    const m = Math.hypot(PWIN.x + (i + 0.5) * PNT_CH - cx, PWIN.y + (j + 0.5) * PNT_CH - cy);
    if (m < reach) todo.push([m, i, j]);
  }
  todo.sort((a, b) => a[0] - b[0]);
  return loaderEach(job, todo, ([, i, j]) => { if (!S.done[j * S.nx + i]) pntPaintChunk(f, i, j); });
}

// Draws the view (hidden under the loading screen) from points across the
// floor, so everything it would draw for the first time in play is built
// now; then puts the Kindler back where he stands.
function loaderSweep(job) {
  const d = Game.dive;
  if (!d || !View.w) return;
  job.say('LIGHTING THE LAND');
  const p = d.p, home = { x: p.x, y: p.y }, f = d.floor, sw = (View.w * 0.8) / AP, sh = (View.h * 0.8) / AP;
  // (within the painted window, so the sweep doesn't move it: paint.js PWIN)
  const reach = Math.max(View.w, Math.min(2.2 * Math.max(View.w, View.h), PWIN.w / 2 - View.w, PWIN.h / 2 - View.h)) / AP, pts = [];
  for (let y = sh / 2; y < f.h * TILE; y += sh) for (let x = sw / 2; x < f.w * TILE; x += sw) if (Math.hypot(x - home.x, y - home.y) < reach) pts.push({ x, y });
  pts.sort((a, b) => Math.hypot(a.x - home.x, a.y - home.y) - Math.hypot(b.x - home.x, b.y - home.y));
  let i = 0;
  return () => {
    if (i < pts.length) { p.x = pts[i].x; p.y = pts[i].y; renderFrame(); i++; }
    job.at(i, pts.length);
    if (i < pts.length) return false;
    p.x = home.x; p.y = home.y; d.kAnim = null;
    return true;
  };
}

// The creatures and the plants of the world's clime: every frame of each,
// as fpWarm would build them on entering.
function loaderClimes(job) {
  const d = Game.dive, list = d ? [{ clime: d.clime, biome: d.biome, depth: d.depth }] : [];
  // each clime's work, as many small pieces
  const work = [];
  for (const t of list) {
    const fd = { biome: t.biome, depth: t.depth, floor: { clime: t.clime } };
    for (const type of ['crawler', 'snapjaw', 'spitter']) work.push(() => enemySprite(fd, type));
    const sig = foeOfClime(t.clime);
    if (sig && FOE_ROWS[sig]) for (const fr of Object.keys(FOE_ROWS[sig])) {
      work.push(() => foeSprite(sig, fr));
      if (sig === 'tusker' || sig === 'hound' || sig === 'idol') work.push(() => foeSprite(sig, fr, 'flip'));
      if (sig === 'crab') work.push(() => foeSprite(sig, fr, 'cracked'), () => foeSprite(sig, fr, 'frozen'));
    }
    const set = CLIME_FLORA[t.clime] ? t.clime : T.biomes[t.biome].id, kit = floraKit(set);
    for (const piece of kit.pieces || []) for (let fr = 0; fr < piece.frames.length; fr++) work.push(() => { const s = floraSprite(set, piece, fr); if (typeof pshSil === 'function') pshSil(s); });
  }
  job.say('READING LIFE SIGNS · ' + list.length + (list.length === 1 ? ' CLIME' : ' CLIMES'));
  return loaderEach(job, work, (fn) => fn());
}

// The opening's first four scenes' pictures (its fifth is the outpost,
// already painted), built for this screen, a scene a slice: it's measured
// on its overlay, shown for that moment under the loading screen.
function loaderIntro(job) {
  if (typeof Intro.warm === 'function') return Intro.warm(job);
  introSetup();
  let n = 0;
  return () => {
    const el = Intro.el, was = el.hidden;
    el.hidden = false;
    try { introSize(); introPrebuild(n); } finally { el.hidden = was; }
    job.at(++n, 4);
    return n >= 4;
  };
}

// The first view, drawn once where you stand: whatever's left to build for it.
function loaderFirstView() {
  if (!Game.dive || !View.w) return;
  renderFrame();
  Game.dive.kAnim = null;
}

// ---------------------------------------------------------------------------
// The screen: the seed-star brightening, the boot log, the conduit filling
// ---------------------------------------------------------------------------
const LoaderUI = { raf: 0, shown: -1, lines: null, segs: [], pct: -1, star: null };

function loaderUIStart() {
  const U = LoaderUI, el = Loader.el;
  U.log = el.querySelector('.ld-log'); U.fill = el.querySelector('.ld-fill'); U.pctEl = el.querySelector('.ld-pct');
  U.now = el.querySelector('.ld-now'); U.halo = el.querySelector('.ld-halo'); U.mark = el.querySelector('.ld-mark');
  // the build, at the foot (version.js)
  const bd = el.querySelector('.ld-build'); if (bd) bd.textContent = BUILD_INFO;
  const segs = el.querySelector('.ld-segs');
  segs.textContent = '';
  U.segs = [];
  for (let i = 0; i < 24; i++) { const s = document.createElement('i'); segs.appendChild(s); U.segs.push(s); }
  U.rows = new Map();
  loaderStarMark(el);
  const tick = () => { loaderUIDraw(); U.raf = requestAnimationFrame(tick); };
  U.raf = requestAnimationFrame(tick);
  loaderUIDraw();
}
function loaderUIStop() { cancelAnimationFrame(LoaderUI.raf); }

// The mark: the Lodestar as the game draws it over its cradle (hubart.js
// hartStar, at its first size) in its halo, its light spread round it the
// way the scene's bloom does; the halo's two frames alternate as in play.
// Drawn once into a canvas shown at whole device pixels an art pixel.
function loaderStarMark(el) {
  const cv = el.querySelector('.ld-star-cv');
  if (!cv || typeof hartStar !== 'function') return;
  try {
    // (at fine grain the sprites are AF times the size: drawn back at the
    // art's own size here)
    const N = 100, cx = 50, cy = 50, st = hartStar(2), q = st.f || 1;
    const frames = [0, 1].map((f) => {
      const c = document.createElement('canvas');
      c.width = c.height = N;
      const x = c.getContext('2d'), halo = hartHalo(2, f), hq = halo.f || 1;
      x.imageSmoothingEnabled = false;
      x.globalAlpha = 0.8;
      x.drawImage(halo.c, cx - halo.ax / hq, cy - halo.ay / hq - 4, halo.w / hq, halo.h / hq);
      x.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2, r = i % 2 ? 2 : 4;
        x.globalAlpha = 0.07;
        x.drawImage(st.ec, cx - st.ax / q + Math.cos(a) * r, cy - st.ay / q + Math.sin(a) * r, st.w / q, st.h / q);
      }
      x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
      x.drawImage(st.c, cx - st.ax / q, cy - st.ay / q, st.w / q, st.h / q);
      return c;
    });
    const dpr = window.devicePixelRatio || 1, k = Math.max(1, Math.round(1.2 * dpr));
    cv.width = cv.height = N;
    cv.style.width = cv.style.height = (N * k / dpr) + 'px';
    cv.getContext('2d').drawImage(frames[0], 0, 0);
    cv.hidden = false;
    LoaderUI.star = { cv, frames, shown: 0, still: window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches };
  } catch (e) { noteError(e); }
}

// Once a frame: only what changed is touched.
function loaderUIDraw() {
  const U = LoaderUI, k = Loader.progress(), pct = Math.floor(k * 100);
  if (pct !== U.pct) {
    U.pct = pct;
    U.pctEl.textContent = String(pct).padStart(3, ' ') + '%';
    U.fill.style.transform = `scaleX(${k.toFixed(4)})`;
    const lit = Math.floor(k * U.segs.length + 1e-6);
    U.segs.forEach((s, i) => s.classList.toggle('on', i < lit));
    // the star wakes as the systems do
    U.halo.style.opacity = (0.15 + 0.85 * k).toFixed(3);
    U.mark.style.setProperty('--wake', k.toFixed(3));
  }
  // the halo's loose amber, two frames at three a second, as in play
  const S = U.star;
  if (S && !S.still) {
    const f = Math.floor(performance.now() / 333) % 2;
    if (f !== S.shown) { S.shown = f; const x = S.cv.getContext('2d'); x.clearRect(0, 0, S.cv.width, S.cv.height); x.drawImage(S.frames[f], 0, 0); }
  }
  // the log: a line for each task begun, its count or OK
  for (const j of Loader.jobs) {
    if (j.state === 'wait') continue;
    let row = U.rows.get(j);
    if (!row) {
      row = document.createElement('div');
      row.className = 'ld-line';
      row.innerHTML = '<span class="ld-tx"></span><span class="ld-dots"></span><span class="ld-st"></span>';
      U.log.appendChild(row);
      U.rows.set(j, row);
      while (U.log.children.length > 7) U.log.firstChild.remove();
    }
    const st = j.state === 'ok' ? 'OK' : j.state === 'skip' ? 'SKIPPED' : j.n ? `${j.k}/${j.n}` : '';
    const key = j.line + '|' + st;
    if (row.dataset.k !== key) {
      row.dataset.k = key;
      row.firstChild.textContent = j.line;
      row.lastChild.textContent = st;
      row.className = 'ld-line' + (j.state === 'run' ? ' run' : j.state === 'skip' ? ' skip' : ' ok');
    }
  }
  const run = Loader.jobs.find((j) => j.state === 'run' && !j.side) || Loader.jobs.find((j) => j.state === 'run');
  const now = Loader.state === 'ready' ? 'ALL SYSTEMS READY' : run ? run.line : 'POWERING UP';
  if (U.now.textContent !== now) U.now.textContent = now;
}

function loaderUIReady() {
  const el = Loader.el;
  loaderUIDraw();
  el.classList.add('ready');
  const go = el.querySelector('.ld-go');
  go.hidden = false;
  // (on the click, once the tap is over, so it lands on nothing beneath)
  el.addEventListener('click', () => Loader.begin());
  window.addEventListener('keydown', loaderKey);
}
function loaderKey(e) { if (!e.repeat) Loader.begin(); }
