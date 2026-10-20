'use strict';
// ---------------------------------------------------------------------------
// The opening: five painted scenes that play on their own, a caption or two
// each (STORY_INTRO, story.js), then the camera comes down into the outpost
// and hands the Kindler over with no cut.
//   1. The Charter's craft crossing the dark between stars, the seed-star in
//      its cradle at the bow, the colony ship Meridian following behind.
//   2. The survey: a beam sweeping the dark world below, a site marked.
//   3. The seed and the base modules coming down on their thrusters onto
//      the marked site, and the cradle locking.
//   4. The Meridian in orbit; inside, its settlers asleep in rows.
//   5. The outpost, drawn by the game itself: the star rises over its
//      cradle and lights, its light runs out to the stations, and the camera
//      comes down to the Kindler stepping out with Wick. Then he's yours.
//
// Scenes 1-4 are drawn here, on a canvas over the whole screen, at the
// game's own scale (an art px is View.scale device px, as the view is), in
// the painted style (docs/PAINTED.md): every picture is built once with the
// game's tools (PntSpr, hartStrokes, hartCrystal, the ramps) and kept, and a
// frame only moves them, with light and a few strokes of particles. The game
// isn't drawn under them. Scene 5 is the live outpost (render.js reads
// Intro.hub: the camera, the star's rise and light, the outpost's light,
// Wick), with only a fade and the captions on this canvas.
//
// Everything in a scene is worked out from its time alone, so a tap can
// jump: to the caption shown in full, or to the next scene. SKIP INTRO ends
// it at once. However it ends (played out, skipped, or closed under it by
// a screen opening, as the tests do) it counts as seen.
//
// Every helper here is named intro…; numbers are in T.intro. Sound cues go
// through snd() if the game has it: introScene { n }, introBeam, introSite,
// introThrust, introTouchdown, introLock, introStarLit, introPing, introEnd.
// ---------------------------------------------------------------------------

// Colours, dark to light, beside the outpost's (HART) and the Kindler's (KP).
const INTRO_PAL = {
  space: ['#020206', '#04050b', '#070812', '#0a0c1a', '#0e1124', '#131630', '#1a1b3c', '#242248'],
  nebula: ['#0d0b20', '#161334', '#211a46', '#2d2154', '#3c2a60'],
  starDots: ['#4a5276', '#7880a8', '#b4bce0', '#eef0ff', '#ffe6b8'],
  // the Charter's blue, and the pale gold of its seed-star mark
  plate: ['#06081a', '#0b1230', '#121e4c', '#1a2c6c', '#253f92', '#3756b8'],
  mark: '#f4e4aa',
  amber: ['#5a2c0a', '#8a4a16', '#d88c30', '#ffb030', '#ffe48a'],
  thrust: ['#0c2a5a', '#1f5aa8', '#4a9ae8', '#a8dcff', '#f0fbff'],
  beam: ['#0a3634', '#145e58', '#26927f', '#5cd0b8', '#bdfbea'],
  rock: ['#050507', '#09090d', '#0e0d13', '#14131a', '#1b1922', '#24212b', '#2f2b36', '#3c3744'],
  limb: ['#20232e', '#353a48', '#525a6c', '#7a8496'],
  plain: ['#060609', '#0b0b10', '#121118', '#1a1821', '#23202b', '#2d2936', '#393342', '#463f4f'],
  dusk: ['#06070f', '#0b0c19', '#111325', '#191a31', '#22223c', '#2d2b47', '#3a3550'],
  dust: ['#221d19', '#352d25', '#4a3f32', '#625442'],
  glass: ['#08141a', '#0f242c', '#1a3a44', '#2c5a62', '#4e868a', '#86b8b6'],
  pod: '#5cffb4', cold: '#cfe4ff',
};

const Intro = {
  on: false, scene: 0, t: 0, age: 0, done: null, dive: null, hub: null,
  el: null, view: null, ctx: null, w: 0, h: 0, k: 1, sizeKey: '',
  sx: 0, sy: 0, sw: 0, sh: 0, cx: 0, cy: 0,
  kept: new Map(), capKey: '', fadeKey: '', walkFrom: null,
  // the opening, from the top; done once it's over, however it ends
  play(done) {
    introSetup();
    const I = Intro;
    Object.assign(I, { on: true, scene: 0, t: 0, age: 0, done, dive: Game.dive, hub: null, capKey: '', fadeKey: '' });
    Game.modal = 'intro';
    Input.block();
    I.el.hidden = false;
    document.body.classList.add('intro');
    document.body.classList.remove('intro-out');
    introSize();
    introSnd('introScene', { n: 1 });
    introCaption();
  },
  // a tap: the caption on now (or next) shown in full, or the next scene
  hurry() {
    const I = Intro;
    if (!I.on || I.age < T.intro.tapGuard) return;
    for (const c of introCaps(I.scene)) if (I.t < c.full) { introJump(c.full); return; }
    introNext();
  },
  skip() {
    if (!Intro.on || Intro.age < T.intro.tapGuard) return;
    introSnd('introEnd', { skipped: true });
    introFinish();
  },
};

function introSnd(name, o) { if (typeof snd === 'function') snd(name, o); }

// The page's parts, once: the overlay takes every tap and key while it runs.
function introSetup() {
  const I = Intro;
  if (I.el) return;
  I.el = $('intro');
  I.view = $('intro-view');
  I.ctx = I.view.getContext('2d');
  I.el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (e.target.closest('#intro-skip')) Intro.skip(); else Intro.hurry();
    Input.block();
  });
  window.addEventListener('keydown', (e) => {
    if (!Intro.on) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.repeat) return;
    if (e.code === 'Escape') Intro.skip();
    else if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') Intro.hurry();
  }, true);
}

// ---------------------------------------------------------------------------
// The timeline
// ---------------------------------------------------------------------------
const introEase = (t) => t * t * (3 - 2 * t);
const introOut = (t) => 1 - (1 - t) * (1 - t) * (1 - t);
// how far through [a, b] t is, 0..1
const introProg = (t, ab) => clamp((t - ab[0]) / (ab[1] - ab[0]), 0, 1);

// A scene's captions: { who, text, at (s), full (s, typed out) }.
function introCaps(n) {
  const TI = T.intro, lines = STORY_INTRO[n] || [], ats = n === 4 ? TI.hub.caps : [TI.capAt[n]];
  return lines.map((l, i) => ({ who: l.who || '', text: l.text, at: ats[i], full: ats[i] + l.text.length / TI.cps }));
}

// The sound cues a scene has, at their times.
const INTRO_CUES = [
  [[0.4, 'introThrust', { craft: true }]],
  [[0.8, 'introBeam'], [5.7, 'introSite']],
  [[0.6, 'introThrust'], [4.3, 'introTouchdown'], [5.6, 'introTouchdown'], [7.0, 'introTouchdown'], [7.4, 'introLock']],
  [],
  [[1.4, 'introStarLit'], [2.6, 'introPing']],
];

function introUpdate(dt) {
  const I = Intro;
  if (!I.on) return;
  // something else took over (a screen opened over it, or the outpost was
  // left): it's over
  if (Game.dive !== I.dive || (I.scene < 4 ? Game.modal !== 'intro' : Game.modal)) { introFinish(); return; }
  I.age += dt;
  const t0 = I.t;
  I.t += dt;
  for (const [at, name, o] of INTRO_CUES[I.scene]) if (at > t0 && at <= I.t) introSnd(name, o);
  if (I.scene === 4) introHubStep();
  if (I.t >= T.intro.scenes[I.scene]) introNext();
  if (I.on) introCaption();
}

// to a time in the scene (a tap), passing any cues on the way unheard
function introJump(t) {
  Intro.t = t;
  if (Intro.scene === 4) introHubStep();
  introCaption();
}

function introNext() {
  const I = Intro;
  I.scene++; I.t = 0;
  if (I.scene > 4) { introSnd('introEnd'); introFinish(); return; }
  introSnd('introScene', { n: I.scene + 1 });
  if (I.scene === 4) introHubBegin();
  introCaption();
}

// Over: the outpost as play has it, the controls back, seen for good.
function introFinish() {
  const I = Intro;
  if (!I.on) return;
  I.on = false;
  if (Game.modal === 'intro') Game.modal = null;
  const d = I.dive;
  if (I.hub && d && Game.dive === d) {
    const f = d.floor, p = d.p;
    // (skipped mid-walk: he's at the entry, Wick at his shoulder)
    if (p.y > (f.entry.y + 0.5) * TILE + 1) { p.x = (f.entry.x + 0.5) * TILE; p.y = (f.entry.y + 0.5) * TILE; }
    p.fx = 0; p.fy = -1; p.walkT = 0;
    if (!I.hub.wick) d.drone = null;
  }
  I.hub = null;
  Input.move.x = Input.move.y = 0;
  Input.block();
  I.el.hidden = true;
  document.body.classList.remove('intro');
  document.body.classList.add('intro-out');
  setTimeout(() => document.body.classList.remove('intro-out'), 1200);
  const done = I.done;
  I.done = null; I.dive = null;
  if (done) done();
}

// The caption on now, typed out a character at a time (the rest is laid
// out unseen, so the words don't move as they come).
function introCaption() {
  const I = Intro, caps = introCaps(I.scene), end = T.intro.scenes[I.scene];
  let c = null, i = -1;
  for (let j = 0; j < caps.length; j++) if (I.t >= caps[j].at && I.t < (j + 1 < caps.length ? caps[j + 1].at : end - 0.35)) { c = caps[j]; i = j; }
  const n = c ? Math.min(c.text.length, Math.floor((I.t - c.at) * T.intro.cps)) : 0;
  const key = c ? `${I.scene}/${i}/${n}` : 'none';
  if (key === I.capKey) return;
  const box = $('intro-cap'), wasOn = I.capKey !== 'none' && I.capKey !== '';
  I.capKey = key;
  if (!c) { box.classList.remove('on'); return; }
  box.innerHTML = (c.who ? `<b>${esc(c.who)}</b>` : '') + `<span>${esc(c.text.slice(0, n))}</span><span class="ghost">${esc(c.text.slice(n))}</span>`;
  box.classList.toggle('said', !!c.who);
  if (!wasOn || !box.classList.contains('on')) box.classList.add('on');
}

// ---------------------------------------------------------------------------
// Size: the canvas covers the screen, an art px to View.scale device px, so
// it's as crisp as the view and matches it pixel for pixel. The scenes are
// composed round the view's place on the screen (the stage).
// ---------------------------------------------------------------------------
function introSize() {
  const I = Intro, dpr = window.devicePixelRatio || 1, k = View.scale || 1;
  const r = I.el.getBoundingClientRect(), s = $('stage').getBoundingClientRect();
  const key = `${r.width}x${r.height}@${dpr}/${k}/${s.left},${s.top},${s.width},${s.height}`;
  if (key === I.sizeKey) return;
  I.sizeKey = key;
  const w = Math.max(1, Math.ceil((r.width * dpr) / k)), h = Math.max(1, Math.ceil((r.height * dpr) / k));
  if (w !== I.w || h !== I.h) I.kept.clear();
  I.w = w; I.h = h; I.k = k;
  I.view.width = w; I.view.height = h;
  I.view.style.width = (w * k) / dpr + 'px'; I.view.style.height = (h * k) / dpr + 'px';
  I.ctx.imageSmoothingEnabled = false;
  const a = (v) => Math.round((v * dpr) / k);
  I.sx = a(s.left - r.left); I.sy = a(s.top - r.top); I.sw = a(s.width); I.sh = a(s.height);
  I.cx = I.sx + (I.sw >> 1); I.cy = I.sy + (I.sh >> 1);
  I.fadeKey = '';
}

// Scenes 1-4 cover the screen, and the game isn't drawn under them, but
// for the first second (black, fading in), so the outpost's floor is
// painted and the Kindler's frames are built by the time it's wanted.
function introCovers() { return Intro.on && Intro.scene < 4 && Intro.age > T.intro.warm; }

function introDraw() {
  const I = Intro;
  if (!I.on) return;
  if (I.age < 0.05 || Math.floor(I.age * 2) !== Math.floor((I.age - 0.02) * 2)) introSize();
  const c = I.ctx, TI = T.intro;
  if (I.scene === 4) {
    // the outpost shows through; only the fade in from black is drawn
    const a = 1 - clamp(I.t / TI.hub.fadeIn, 0, 1), key = a.toFixed(2);
    if (key === I.fadeKey) return;
    I.fadeKey = key;
    c.clearRect(0, 0, I.w, I.h);
    if (a > 0) { c.globalAlpha = a; c.fillStyle = '#000'; c.fillRect(0, 0, I.w, I.h); c.globalAlpha = 1; }
    return;
  }
  I.fadeKey = '';
  const t = I.t, end = TI.scenes[I.scene];
  [introDrawCrossing, introDrawSurvey, introDrawDescent, introDrawOrbit][I.scene](c, t);
  // a scene fades in from black and out to it
  const f = TI.fade, a = t < f ? 1 - t / f : t > end - f ? (t - (end - f)) / f : 0;
  if (a > 0) { c.globalAlpha = Math.min(1, a); c.fillStyle = '#000'; c.fillRect(0, 0, I.w, I.h); c.globalAlpha = 1; }
  // the next scene's pictures are built while this one is black, so the
  // pause it takes (a few hundred ms on a slow phone) never shows
  if (t > end - f * 0.6) introPrebuild(I.scene + 1);
}
function introPrebuild(n) {
  if (n < 4) [introCrossingKit, introSurveyKit, introDescentKit, introOrbitKit][n]();
  else if (Intro.dive) introHubSkyPic(Intro.dive.floor.w * ATILE);
}

// A picture built once for this size of screen, and kept.
function introKeep(key, make) {
  let v = Intro.kept.get(key);
  if (!v) { v = make(); Intro.kept.set(key, v); }
  return v;
}

// ---------------------------------------------------------------------------
// Painting helpers, beside PntSpr and hartStrokes: big pictures are painted
// straight into 32-bit pixels.
// ---------------------------------------------------------------------------
function introRamp(hexes) { return hexes.map((h) => { const [r, g, b] = rgbOf(h); return (0xff000000 | (b << 16) | (g << 8) | r) >>> 0; }); }
function introLayer(w, h) {
  const [c, x] = makeCanvas(w, h), img = x.createImageData(c.width, c.height);
  return { c, x, img, d: new Uint32Array(img.data.buffer), w: c.width, h: c.height };
}
function introFlush(L) { L.x.putImageData(L.img, 0, 0); return L.c; }
// A region laid in short horizontal strokes, as hartStrokes, into a layer:
// V holds each pixel's value (0..1, or below 0: not painted).
function introStrokes(L, V, ramp, seed, jit = 0.16) {
  const n = ramp.length - 1, w = L.w;
  for (let y = 0; y < L.h; y++) {
    let x = 0;
    while (x < w) {
      const h = artHash(x, y, seed), len = 2 + Math.floor(h * h * 5), xm = Math.min(w - 1, x + (len >> 1));
      let v = V[y * w + xm];
      if (v < 0) v = V[y * w + x];
      if (v < 0) { x++; continue; }
      const col = ramp[clamp(Math.round(n * clamp(v + (artHash(x, y, seed + 1) - 0.5) * 2 * jit, 0, 1)), 0, n)];
      for (let k = 0; k < len && x < w; k++, x++) if (V[y * w + x] >= 0) L.d[y * w + x] = col;
    }
  }
}
// Loose strokes of a light's colour round a point: denser and brighter near
// it. rx, ry: its reach; drawn added on ('lighter').
function introHalo(rx, ry, hexes, seed, n) {
  return introKeep(`halo/${rx}/${ry}/${hexes.join()}/${seed}`, () => {
    const W = rx * 2 + 6, H = ry * 2 + 6, L = introLayer(W, H), R = introRamp(hexes), m = R.length - 1;
    for (let i = 0; i < n; i++) {
      const a = artHash(i, 1, seed) * Math.PI * 2, r = artHash(i, 2, seed) ** 1.7, x = Math.round(W / 2 + Math.cos(a) * r * rx), y = Math.round(H / 2 + Math.sin(a) * r * ry);
      const col = R[clamp(Math.round(m * (1 - r) + (artHash(i, 3, seed) - 0.5) * 1.4), 0, m)], len = 1 + Math.floor(artHash(i, 4, seed) * 3 * (1 - r * 0.5));
      for (let k = 0; k < len; k++) if (x + k >= 0 && x + k < W && y >= 0 && y < H) L.d[y * W + x + k] = col;
    }
    return { c: introFlush(L), ax: W >> 1, ay: H >> 1 };
  });
}
function introGlow(c, g, x, y, a) {
  c.globalCompositeOperation = 'lighter'; c.globalAlpha = clamp(a, 0, 1);
  c.drawImage(g.c, Math.round(x - g.ax), Math.round(y - g.ay));
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
}
function introDot(c, x, y, col, a = 1) { c.globalAlpha = clamp(a, 0, 1); c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), 1, 1); c.globalAlpha = 1; }
// a short horizontal stroke
function introDash(c, x, y, n, col, a = 1) { c.globalAlpha = clamp(a, 0, 1); c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), n, 1); c.globalAlpha = 1; }

// A panel of plate in strokes: lit along its top and left, darker down it,
// seams every `seam` px (dark, lit on their left).
function introPanel(s, x0, y0, x1, y1, ramp, seed, o = {}) {
  const h = Math.max(1, y1 - y0), seam = o.seam || 0, base = o.base === undefined ? 0.6 : o.base;
  hartStrokes(s, x0, y0, x1, y1, (x, y) => {
    if (y === y0) return 0.95;
    if (y === y1) return 0.08;
    if (seam && (x - x0) % seam === seam - 1) return 0.1;
    if (seam && (x - x0) % seam === seam - 2) return 0.8;
    return base - 0.28 * ((y - y0) / h) + (x === x0 ? 0.18 : 0) - (x === x1 ? 0.25 : 0);
  }, ramp, seed, { jit: 0.07 });
}
// The Charter's mark, the pale gold seed-star: a little four-pointed star.
function introMark(s, x, y, big) {
  const m = INTRO_PAL.mark, d = '#a08850';
  s.px(x, y, m); s.px(x - 1, y, d); s.px(x + 1, y, d); s.px(x, y - 1, m); s.px(x, y + 1, d);
  if (big) { s.px(x, y - 2, d); s.px(x, y + 2, d); s.px(x - 2, y, d); s.px(x + 2, y, d); }
}
// The seed-star's light on a sprite: some strokes near it turned to its gold.
function introStarLight(s, sx, sy, R, seed) {
  const St = HART.star;
  for (let y = Math.max(0, sy - R); y < Math.min(s.h, sy + R); y++)
    for (let x = Math.max(0, sx - R); x < Math.min(s.w, sx + R); x += 2) {
      const d = Math.hypot(x - sx, (y - sy) * 1.3) / R;
      if (d >= 1 || !s.get(x, y) || artHash(x >> 1, y, seed) > (1 - d) ** 1.5 * 0.75) continue;
      const col = St[clamp(Math.round(4 - d * 3), 1, 5)];
      s.px(x, y, col); if (s.get(x + 1, y)) s.px(x + 1, y, col);
    }
}

// A plume of thrust from a nozzle at x, y along (dx, dy), `len` px at full
// thrust i (0..1): short strokes, white-hot at the mouth, blue further out,
// changing a few times a second. Added on.
function introPlume(c, x, y, dx, dy, len, i, seed, wide = 1) {
  if (i <= 0.02) return;
  const R = INTRO_PAL.thrust, tick = Math.floor(Game.realT * 14), n = Math.round(8 + 22 * i), nx = -dy, ny = dx;
  c.globalCompositeOperation = 'lighter';
  for (let k = 0; k < n; k++) {
    const h1 = artHash(k, tick, seed), h2 = artHash(k, tick + 99, seed), u = h1 ** 1.4, along = u * len * (0.55 + 0.45 * i), side = (h2 - 0.5) * (1.6 + u * 4.5) * wide;
    const px = x + dx * along + nx * side, py = y + dy * along + ny * side, col = R[clamp(Math.round(4.4 - u * 4.2 - Math.abs(side) * 0.25), 0, 4)];
    introDash(c, px - 1, py, 2 + ((h2 * 7) | 0) % 3, col, (1 - u * 0.75) * (0.55 + 0.45 * i));
  }
  for (let k = -1; k <= 1; k++) introDot(c, x + nx * k * wide, y + ny * k * wide, R[4], 0.9 * i);
  c.globalCompositeOperation = 'source-over';
}

// ---------------------------------------------------------------------------
// The dark between stars: the deep blue-black in strokes, a faint band of
// cloud across it on a slant, and stars in layers that drift at their own
// pace (each layer wraps round).
// ---------------------------------------------------------------------------
function introSpace(w, h, seed, band = 0.35) {
  return introKeep(`space/${w}/${h}/${seed}`, () => {
    const L = introLayer(w, h), V = new Float32Array(w * h), N = new Float32Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const b = Math.exp(-((((y - h * band) - (x - w * 0.5) * 0.45) / (Math.min(w, h) * 0.3)) ** 2));
        const n1 = pntNoise(x, y, 64, 30, seed), n2 = pntNoise(x, y, 18, 7, seed + 3);
        V[y * w + x] = 0.1 + 0.32 * b * n1 + 0.12 * b * n2 + 0.06 * n1;
        N[y * w + x] = b * n1 * (0.7 + 0.3 * n2) > 0.5 ? (b * n1 * (0.7 + 0.3 * n2) - 0.5) * 2.6 : -1;
      }
    introStrokes(L, V, introRamp(INTRO_PAL.space), seed, 0.1);
    introStrokes(L, N, introRamp(INTRO_PAL.nebula), seed + 7, 0.14);
    return introFlush(L);
  });
}
function introStarLayer(w, h, n, seed, big) {
  return introKeep(`stars/${w}/${h}/${n}/${seed}`, () => {
    const [c, x] = makeCanvas(w, h), S = INTRO_PAL.starDots;
    for (let i = 0; i < n; i++) {
      const sx = Math.floor(artHash(i, 1, seed) * w), sy = Math.floor(artHash(i, 2, seed) * h), b = artHash(i, 3, seed) ** (big ? 1.5 : 2.5);
      x.fillStyle = S[Math.min(S.length - 1, Math.floor(b * S.length))];
      x.fillRect(sx, sy, 1, 1);
      if (big && b > 0.82) { x.globalAlpha = 0.45; for (const [i2, j2] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) x.fillRect(sx + i2, sy + j2, 1, 1); x.globalAlpha = 1; }
    }
    return c;
  });
}
// a layer drifted left by off px, wrapping
function introDrift(c, layer, off, y = 0) {
  const w = layer.width, o = ((Math.round(off) % w) + w) % w;
  c.drawImage(layer, -o, y);
  if (o > 0) c.drawImage(layer, w - o, y);
}
// a few stars twinkling over the layers
function introTwinkle(c, w, h, seed, t) {
  for (let i = 0; i < 7; i++) {
    const x = Math.floor(artHash(i, 5, seed) * w), y = Math.floor(artHash(i, 6, seed) * h), k = Math.max(0, Math.sin(t * (0.8 + artHash(i, 7, seed)) + i * 2.1));
    if (k < 0.2) continue;
    introDot(c, x, y, '#ffffff', k);
    if (k > 0.75) for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) introDot(c, x + a, y + b, '#b4bce0', (k - 0.75) * 2);
  }
}

// ---------------------------------------------------------------------------
// The Charter's craft, side on, going right: an engine block at the stern,
// a long truss spine with the base modules clamped along it, and at the bow
// a cradle of two arms round the seed-star. Two sizes (they're painted, not
// scaled): S 1 close (scene 1), and small, far off (scene 2).
// ---------------------------------------------------------------------------
function introCraft() {
  return introKeep('craft', () => {
    const W = 136, H = 42, s = new PntSpr(W, H, 1201), P = INTRO_PAL, I = HART.iron, Hu = HART.hull, St = HART.steel;
    // the truss spine: a beam, and a lattice above and below it
    introPanel(s, 26, 19, 108, 23, Hu, 1202, { seam: 9, base: 0.55 });
    for (let x = 28; x < 106; x += 6) {
      s.limb([[x, 17], [x + 3, 14], [x + 6, 17]], 0.6, 0.6, (t, side) => I[side < 0 ? 4 : 2]);
      s.limb([[x, 25], [x + 3, 28], [x + 6, 25]], 0.6, 0.6, (t, side) => I[side < 0 ? 3 : 1]);
    }
    // the base modules, clamped on: above the spine and below it
    for (const [x0, y0, x1, y1, sd] of [[33, 5, 52, 16, 1], [55, 4, 75, 16, 2], [78, 7, 95, 16, 3], [38, 26, 60, 35, 4], [64, 26, 88, 36, 5]]) {
      introPanel(s, x0, y0, x1, y1, P.plate, 1210 + sd, { seam: 11, base: y0 > 20 ? 0.45 : 0.62 });
      // gunmetal end caps, the amber band, the mark
      introPanel(s, x0, y0, x0 + 1, y1, St, 1220 + sd, { base: 0.5 });
      introPanel(s, x1 - 1, y0, x1, y1, St, 1230 + sd, { base: 0.3 });
      const by = y0 + ((y1 - y0) >> 1) + 1;
      for (let x = x0 + 3; x < x1 - 2; x++) if ((x >> 1) % 2 === 0) s.px(x, by, P.amber[y0 > 20 ? 1 : 2]);
      introMark(s, x0 + 5, y0 + 3, false);
    }
    // the engine block at the stern, its bell, and a ring of struts
    s.box(6, 11, 30, 31, St, { lo: 0, hi: 4 });
    introPanel(s, 9, 13, 27, 29, Hu, 1240, { seam: 6, base: 0.55 });
    s.poly([[0, 15], [7, 17], [7, 26], [0, 28]], (x, y) => I[y < 18 ? 4 : y > 25 ? 0 : 2]);
    for (let y = 16; y <= 27; y++) s.px(1, y, '#0a1424');
    s.px(12, 14, P.amber[3]); s.px(16, 14, P.amber[2]); s.px(24, 28, '#7dffd8');
    // the bow's cradle: two arms reaching round the seed-star
    s.limb([[106, 19], [113, 9], [121, 7], [126, 11]], 2.2, 1.2, (t, side) => St[side < 0 ? 4 : side > 0 ? 1 : 2]);
    s.limb([[106, 24], [113, 33], [121, 35], [126, 31]], 2.2, 1.2, (t, side) => St[side < 0 ? 3 : side > 0 ? 0 : 1]);
    s.box(102, 17, 109, 26, St, { lo: 0, hi: 4 });
    s.px(126, 10, P.amber[4]); s.px(126, 32, P.amber[3]);
    introStarLight(s, 120, 21, 30, 1250);
    // the seed itself
    hartCrystal(s, 120, 13, 0, 30, 5.5, 0.55);
    for (let n = 0; n < 4; n++) s.px(118 - n % 2, 18 + n, HART.star[6], true);
    const o = s.done();
    return Object.assign(o, { star: { x: 120, y: 21 }, nozzle: { x: 0, y: 21 } });
  });
}
function introCraftSmall() {
  return introKeep('craft-small', () => {
    const W = 50, H = 18, s = new PntSpr(W, H, 1261), P = INTRO_PAL, St = HART.steel;
    introPanel(s, 9, 8, 40, 9, HART.hull, 1262, { base: 0.5 });
    for (const [x0, y0, x1, y1] of [[13, 3, 20, 7], [22, 3, 30, 7], [16, 11, 26, 14], [32, 4, 37, 7]]) introPanel(s, x0, y0, x1, y1, P.plate, 1263 + x0, { base: 0.6 });
    s.box(2, 4, 10, 13, St, { lo: 0, hi: 4 });
    s.limb([[40, 8], [44, 4], [47, 6]], 0.8, 0.6, (t, side) => St[side < 0 ? 4 : 2]);
    s.limb([[40, 9], [44, 13], [47, 11]], 0.8, 0.6, (t, side) => St[side < 0 ? 3 : 1]);
    introStarLight(s, 45, 9, 12, 1264);
    hartCrystal(s, 45, 5, 0, 13, 2.4, 0.55);
    s.px(16, 5, INTRO_PAL.mark); s.px(5, 5, P.amber[3]);
    return Object.assign(s.done(), { star: { x: 45, y: 9 }, nozzle: { x: 2, y: 8 } });
  });
}

// ---------------------------------------------------------------------------
// The Meridian: a long colony ship, side on, going right (flip it to go
// left). A long hull lit from the upper left, two great rings of sleep
// decks, a stern of engines, a tapering bow, and a row of small lights down
// its flank where the pods are. Close (scene 4) and far (scene 1).
// ---------------------------------------------------------------------------
function introMeridian(far) {
  return introKeep(far ? 'meridian-far' : 'meridian', () => {
    const k = far ? 0.42 : 1, W = Math.round(236 * k) + 4, H = Math.round(48 * k) + 4, s = new PntSpr(W, H, far ? 1301 : 1302);
    const Hu = HART.hull, St = HART.steel, I = HART.iron, X = (v) => Math.round(v * k) + 2, Y = (v) => Math.round(v * k) + 2;
    const top = Y(16), bot = Y(32);
    // the hull: a long cylinder, lit along its top
    hartStrokes(s, X(22), top, X(200), bot, (x, y) => {
      const v = (y - top) / (bot - top);
      if (!far && (x - X(22)) % 15 === 14) return 0.12;
      return 0.78 - v * 0.7 + (y === top ? 0.2 : 0) - (y >= bot - 1 ? 0.15 : 0);
    }, Hu, far ? 1303 : 1304, { jit: 0.13 });
    // the bow, tapering
    s.poly([[X(200), top], [X(222), Y(21)], [X(232), Y(25)], [X(222), Y(29)], [X(200), bot + 1]], (x, y) => Hu[clamp(Math.round(5.5 - ((y - top) / (bot - top)) * 5), 0, 6)]);
    // two great rings: the sleep decks, seen edge on
    for (const rx of [X(78), X(124)]) {
      hartStrokes(s, rx - Math.round(6 * k), Y(4), rx + Math.round(6 * k), Y(44), (x, y) => {
        const u = (x - rx) / (6 * k), v = (y - Y(24)) / (20 * k);
        if (u * u * 0.35 + v * v > 1) return null;
        return 0.62 - v * 0.42 - u * 0.15;
      }, St, far ? 1305 : 1306 + rx, { jit: 0.12 });
      if (!far) for (let y = Y(7); y < Y(42); y += 3) s.px(rx - 2, y, '#0a0d14');
    }
    // the stern: three engine bells
    s.box(X(6), Y(11), X(24), Y(37), St, { lo: 0, hi: 4 });
    for (const ny of [Y(15), Y(24), Y(33)]) s.poly([[X(0), ny - Math.round(3 * k)], [X(7), ny - Math.round(2 * k)], [X(7), ny + Math.round(2 * k)], [X(0), ny + Math.round(3 * k)]], (x, y) => I[y < ny ? 3 : 1]);
    // a mast at the bow, a dish
    s.limb([[X(196), top], [X(196), Y(6)]], 0.6, 0.5, (t, side) => I[side < 0 ? 4 : 2]);
    s.px(X(196), Y(5), INTRO_PAL.amber[3]);
    // the pods' lights down its flank, most dark, a few lit
    for (let x = X(30); x < X(196); x += far ? 2 : 4) {
      if (Math.abs(x - X(78)) < 8 * k || Math.abs(x - X(124)) < 8 * k) continue;
      for (const yy of far ? [Y(22)] : [Y(21), Y(26)]) {
        const h = artHash(x, yy, 1310);
        s.px(x, yy, h < 0.35 ? '#7fe8c8' : h < 0.5 ? '#ffcf8a' : '#0b0f18');
      }
    }
    // the Charter's mark near the bow
    if (!far) introMark(s, X(186), Y(20), true);
    const o = s.done();
    return Object.assign(o, { nozzle: { x: X(0), y: Y(24) } });
  });
}

// ---------------------------------------------------------------------------
// A dead world, seen from orbit: a great disc lit very faintly from the
// upper left, its rock in strokes on a near-black ramp, craters with their
// far walls catching the light, a thin dusty rim along the lit limb. With it,
// the survey's contour lines over its face (drawn only where the beam has
// just passed). pcx, pcy, R: the disc in the picture.
// ---------------------------------------------------------------------------
function introPlanet(key, w, h, pcx, pcy, R, seed) {
  return introKeep(`planet/${key}`, () => {
    const L = introLayer(w, h), V = new Float32Array(w * h).fill(-1), C = introLayer(w, h), Hgt = new Float32Array(w * h).fill(-1);
    const lx = -0.55, ly = -0.72, lz = 0.42, craters = [];
    for (let i = 0; i < 22; i++) craters.push([(artHash(i, 1, seed) - 0.5) * 2.4, (artHash(i, 2, seed) - 0.5) * 1.6 - 0.2, 0.02 + artHash(i, 3, seed) ** 2 * 0.12]);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const nx = (x + 0.5 - pcx) / R, ny = (y + 0.5 - pcy) / R, q = nx * nx + ny * ny;
        if (q > 1) continue;
        const nz = Math.sqrt(1 - q), lon = Math.asin(clamp(nx / Math.sqrt(Math.max(1e-6, 1 - ny * ny)), -1, 1)), lat = Math.asin(ny);
        const U = lon * R * 0.9, Vv = lat * R * 0.9;
        let hgt = pntNoise(U, Vv, 46, 34, seed) * 0.6 + pntNoise(U, Vv, 15, 11, seed + 1) * 0.3 + pntNoise(U, Vv, 5, 4, seed + 2) * 0.1;
        let shade = 0;
        for (const [cu, cv, cr] of craters) {
          const du = (lon - cu) / cr, dv = (lat - cv) / cr, dd = Math.hypot(du, dv);
          if (dd < 1) { hgt -= 0.18 * (1 - dd * dd); shade += (du * 0.55 + dv * 0.72) * 0.5 * dd; }
          else if (dd < 1.3) hgt += 0.06 * (1.3 - dd) / 0.3;
        }
        const lam = Math.max(0, nx * lx + ny * ly + nz * lz);
        let v = 0.07 + 0.42 * lam ** 1.3 + (hgt - 0.5) * 0.22 + shade * lam * 0.5;
        // the lit limb: a thin rim of dust catching the far sun
        const edge = 1 - Math.sqrt(q);
        if (edge < 0.012) v += 0.35 * Math.max(0, -(nx * 0.6 + ny * 0.8));
        V[y * w + x] = clamp(v, 0, 1);
        Hgt[y * w + x] = nz > 0.18 ? hgt : -1;
      }
    introStrokes(L, V, introRamp(INTRO_PAL.rock), seed, 0.12);
    // the contours: where the height crosses a level, a line of the beam's
    // colour, faint towards the limb
    const B = introRamp(INTRO_PAL.beam);
    for (let y = 0; y < h - 1; y++)
      for (let x = 0; x < w - 1; x++) {
        const a = Hgt[y * w + x], b = Hgt[y * w + x + 1], c2 = Hgt[(y + 1) * w + x];
        if (a < 0 || b < 0 || c2 < 0) continue;
        const la = Math.floor(a * 11), lb = Math.floor(b * 11), lc = Math.floor(c2 * 11);
        if (la !== lb || la !== lc) C.d[y * w + x] = B[la % 3 === 0 ? 4 : 3];
        else if (artHash(x, y, seed + 9) < 0.012) C.d[y * w + x] = B[2];
      }
    return { c: introFlush(L), contour: introFlush(C), pcx, pcy, R };
  });
}
// where the disc's top edge is at x
function introLimbY(P, x) { const dx = x - P.pcx; return Math.abs(dx) >= P.R ? Infinity : P.pcy - Math.sqrt(P.R * P.R - dx * dx); }

// ---------------------------------------------------------------------------
// Scene 1: crossing the dark
// ---------------------------------------------------------------------------
function introCrossingKit() {
  const I = Intro;
  return { bg: introSpace(I.w, I.h, 1401), far: introStarLayer(I.w, I.h, Math.round(I.w * I.h / 260), 1402, false), mid: introStarLayer(I.w, I.h, Math.round(I.w * I.h / 900), 1403, true), near: introStarLayer(I.w, I.h, Math.round(I.w * I.h / 3200), 1404, true), craft: introCraft(), mer: introMeridian(true) };
}
function introDrawCrossing(c, t) {
  const I = Intro, K = introCrossingKit(), cr = K.craft, m = K.mer;
  c.drawImage(K.bg, 0, 0);
  introDrift(c, K.far, t * 1.5); introDrift(c, K.mid, t * 4); introDrift(c, K.near, t * 9);
  introTwinkle(c, I.w, I.h, 1405, t);
  // the Meridian far behind and below, following
  const mx = Math.round(I.cx - I.sw * 0.4 + t * 1.6), my = Math.round(I.cy + I.sh * 0.2);
  c.drawImage(m.c, mx, my);
  introPlume(c, mx + m.nozzle.x, my + m.nozzle.y, -1, 0, 7, 0.45, 1406, 0.6);
  introGlow(c, introHalo(6, 4, INTRO_PAL.thrust.slice(0, 3), 1407, 40), mx + m.nozzle.x - 2, my + m.nozzle.y, 0.6);
  // the craft, easing in to the middle, riding a little
  const x = Math.round(I.cx - cr.w / 2 - 14 + introOut(Math.min(1, t / 8)) * 18), y = Math.round(I.cy - I.sh * 0.12 - cr.h / 2 + Math.sin(t * 0.9) * 1.2);
  introPlume(c, x + cr.nozzle.x, y + cr.nozzle.y, -1, 0, 26, 0.85 + 0.15 * Math.sin(t * 9), 1408, 1.6);
  introGlow(c, introHalo(14, 9, INTRO_PAL.thrust.slice(0, 4), 1409, 160), x + cr.nozzle.x - 4, y + cr.nozzle.y, 0.7);
  c.drawImage(cr.c, x, y);
  // the seed-star's own light, breathing
  const sx = x + cr.star.x, sy = y + cr.star.y, br = 0.75 + 0.15 * Math.sin(t * 1.7);
  introGlow(c, introHalo(34, 30, ['#3a1e08', '#6a3a12', '#a0601e', '#d08c30', '#eeb24a', '#ffd987'], 1410, 700), sx, sy, 0.55 * br);
  introGlow(c, introHalo(12, 12, ['#a0601e', '#eeb24a', '#ffd987', '#fff4d6'], 1411, 160), sx, sy, 0.8 * br);
}

// ---------------------------------------------------------------------------
// Scene 2: the survey
// ---------------------------------------------------------------------------
function introSurveyKit() {
  const I = Intro, R = Math.round(Math.max(I.sw, I.sh * 0.6) * 1.3), top = I.sy + Math.round(I.sh * 0.4);
  return {
    bg: introSpace(I.w, I.h, 1501, 0.15), far: introStarLayer(I.w, I.h, Math.round(I.w * I.h / 300), 1502, false), mid: introStarLayer(I.w, I.h, Math.round(I.w * I.h / 1100), 1503, true),
    planet: introPlanet(`survey/${I.w}/${I.h}`, I.w, I.h, I.cx, top + R, R, 1504), craft: introCraftSmall(),
    // the site: right of middle, a little way down the face
    site: { x: I.cx + Math.round(I.sw * 0.1), y: top + Math.round(Math.min(I.sh * 0.32, (I.h - top) * 0.4)) },
  };
}
function introDrawSurvey(c, t) {
  const I = Intro, K = introSurveyKit(), P = K.planet, cr = K.craft, site = K.site;
  c.drawImage(K.bg, 0, 0);
  introDrift(c, K.far, t * 1.2); introDrift(c, K.mid, t * 3);
  introTwinkle(c, I.w, Math.round(introLimbY(P, I.cx)), 1505, t);
  c.drawImage(P.c, 0, 0);
  // the craft high over it, drifting right
  const x = Math.round(I.cx - cr.w / 2 - 20 + t * 2.2), y = Math.round(I.sy + I.sh * 0.14), bx = x + cr.w - 18, by = y + cr.h - 3;
  introPlume(c, x + cr.nozzle.x, y + cr.nozzle.y, -1, 0, 8, 0.6, 1506, 0.6);
  c.drawImage(cr.c, x, y);
  introGlow(c, introHalo(10, 9, ['#6a3a12', '#d08c30', '#ffd987'], 1507, 90), x + cr.star.x, y + cr.star.y, 0.7);
  // the sweep: out across the face and back to the site, then held on it
  const L0 = I.cx - I.sw * 0.42, L1 = I.cx + I.sw * 0.42, sweep = [0.8, 4.4], back = [4.4, 5.6];
  let sx = site.x, spread = 2;
  if (t < sweep[1]) { sx = lerp(L0, L1, introEase(introProg(t, sweep))); spread = 12; }
  else if (t < back[1]) { sx = lerp(L1, site.x, introEase(introProg(t, back))); spread = lerp(12, 3, introProg(t, back)); }
  const on = clamp((t - 0.5) / 0.4, 0, 1) * (t > 8.2 ? Math.max(0, 1 - (t - 8.2) / 0.6) : 1);
  const ty = site.y;
  // the face lit up where the beam has just passed: its contours, in a
  // footprint round where it falls and a trail behind, fading
  if (t > sweep[0] && t < back[1] + 0.8) {
    const dir = t < sweep[1] ? 1 : -1, fade = t < back[1] ? 1 : 1 - (t - back[1]) / 0.8, rx = spread * 1.6 + 8;
    for (let b = 6; b >= 0; b--) {
      c.save();
      c.beginPath(); c.ellipse(Math.round(sx - dir * b * 9), ty, rx + b * 2, (rx + b * 2) * 0.42, 0, 0, Math.PI * 2); c.clip();
      c.globalAlpha = [0.95, 0.6, 0.42, 0.3, 0.2, 0.12, 0.07][b] * fade;
      c.drawImage(P.contour, 0, 0);
      c.restore();
    }
  }
  // the beam: a fan of loose strokes from the craft down to the face
  if (on > 0) {
    const B = INTRO_PAL.beam, tick = Math.floor(Game.realT * 12);
    c.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 140; k++) {
      const u = artHash(k, tick, 1508), v = artHash(k, tick + 50, 1508) - 0.5, px = lerp(bx, sx + v * 2 * spread, u), py = lerp(by, ty, u);
      introDash(c, px - 1, py, 2 + (k % 3), B[clamp(Math.round(2 + u * 2 - Math.abs(v) * 3), 0, 4)], on * (0.3 + 0.4 * u));
    }
    for (let k = 0; k < 26; k++) {
      const a = artHash(k, tick, 1509) * Math.PI * 2, r = artHash(k, tick + 3, 1509);
      introDash(c, sx + Math.cos(a) * r * (spread + 3) - 1, ty + Math.sin(a) * r * (spread * 0.35 + 1.5), 2, B[4 - Math.round(r * 2)], on * 0.8);
    }
    c.globalCompositeOperation = 'source-over';
  }
  // the site, marked: amber brackets closing in round it, a ring, the
  // seed-star's mark blinking at its heart
  if (t > 5.4) {
    const k = introOut(introProg(t, [5.4, 6.4])), r = Math.round(lerp(22, 10, k)), A = INTRO_PAL.amber, a = Math.min(1, (t - 5.4) * 3);
    for (const [ix, iy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const ex = site.x + ix * r, ey = site.y + Math.round(iy * r * 0.5);
      for (let q = 0; q < 4; q++) { introDot(c, ex - ix * q, ey, A[3], a); introDot(c, ex, ey - iy * q, A[3], a * 0.8); }
    }
    const ring = 0.5 + 0.5 * Math.sin((t - 5.4) * 5);
    for (let q = 0; q < 28; q++) { const ang = (q / 28) * Math.PI * 2; introDot(c, site.x + Math.cos(ang) * (r - 3), site.y + Math.sin(ang) * (r - 3) * 0.45, A[2], a * 0.5 * ring); }
    introGlow(c, introHalo(7, 4, ['#6a3a12', '#d08c30', '#ffd987'], 1510, 50), site.x, site.y, a * (0.6 + 0.4 * ring));
    for (const [ix, iy, col] of [[0, 0, INTRO_PAL.mark], [1, 0, '#a08850'], [-1, 0, '#a08850'], [0, -1, INTRO_PAL.mark], [0, 1, '#a08850']]) introDot(c, site.x + ix, site.y + iy, col, a);
  }
  // far off on the dark face, once, something answers the light
  if (t > 6.9 && t < 8.3) {
    const k = Math.sin(((t - 6.9) / 1.4) * Math.PI) * 0.4, px = Math.round(I.cx - I.sw * 0.34), py = Math.round(Math.max(introLimbY(P, px) + 26, site.y + 22));
    introDot(c, px, py, INTRO_PAL.cold, k); introDot(c, px + 3, py, INTRO_PAL.cold, k * 0.8);
  }
}

// ---------------------------------------------------------------------------
// Scene 3: coming down. The site at night from low over the ground: a
// levelled pad with the survey's amber stakes at its corners, dark plain
// and far mesas. The base modules come down first (two far, two near), each
// on its thrusters, then the cradle with the seed in it; dust blows out
// along the ground, the thrusters' light lies on it in strokes. The cradle's
// arms close on the seed, its lights come on one by one, a ring of gold.
// ---------------------------------------------------------------------------
function introDescentKit() {
  const I = Intro;
  return introKeep(`descent/${I.w}/${I.h}`, () => {
    const hz = I.sy + Math.round(I.sh * 0.5), gy = I.sy + Math.round(I.sh * 0.78), w = I.w, h = I.h;
    // the ground, and the far mesas standing on the horizon
    const L = introLayer(w, h), V = new Float32Array(w * h).fill(-1), padRx = Math.round(Math.min(I.sw * 0.42, 120)), padRy = Math.round(padRx * 0.2);
    const ridge = (x) => hz - 2 - Math.round(Math.max(0, pntNoise(x, 0, 38, 1, 1601) - 0.35) * 40 + pntNoise(x, 0, 9, 1, 1602) * 4);
    // the sky low down: a faint dusty glow along the horizon, fewer stars
    const S = new Float32Array(w * h).fill(-1);
    for (let y = Math.max(0, hz - 80); y < hz; y++)
      for (let x = 0; x < w; x++) {
        if (y >= ridge(x)) continue;
        const k = 1 - (hz - y) / 80;
        if (k < 0.4 && artHash(x >> 1, y, 1610) > (k / 0.4) ** 2) continue;
        S[y * w + x] = k * k * 0.85 + (pntNoise(x, y, 40, 6, 1611) - 0.5) * 0.1;
      }
    introStrokes(L, S, introRamp(INTRO_PAL.dusk), 1612, 0.08);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (y < ridge(x)) continue;
        // the far mesas, dark against the glow
        if (y < hz) { V[y * w + x] = 0.04 + 0.08 * (1 - (hz - y) / 40) + pntNoise(x, y, 6, 3, 1603) * 0.05; continue; }
        const d = (y - hz) / Math.max(1, h - hz), pd = ((x - I.cx) / padRx) ** 2 + ((y - gy) / padRy) ** 2;
        // the plain: lighter far off under the glow, darker near
        let v = 0.5 - d * 0.32 + (pntNoise(x, y, 26 + d * 30, 3 + d * 5, 1604) - 0.5) * 0.24 + (pntNoise(x, y, 7, 2, 1605) - 0.5) * 0.1;
        // the pad: levelled, a step lighter and smoother, its far edge lit
        if (pd < 1) v = 0.56 - d * 0.2 + (pntNoise(x, y, 30, 6, 1606) - 0.5) * 0.06 + (pd > 0.8 && y < gy ? 0.16 : 0);
        V[y * w + x] = clamp(v, 0, 1);
      }
    introStrokes(L, V, introRamp(INTRO_PAL.plain), 1607, 0.1);
    // a few boulders, dark masses lit on their upper left
    const g = new PntSpr(w, h, 1608);
    for (let i = 0; i < 9; i++) {
      const bx = Math.round(artHash(i, 1, 1609) * w), by = Math.round(hz + 6 + artHash(i, 2, 1609) ** 0.7 * (h - hz - 10)), r = 2 + Math.round(artHash(i, 3, 1609) * (3 + (by - hz) / 22));
      if (Math.abs(bx - I.cx) < padRx + 12 && Math.abs(by - gy) < padRy + 16) continue;
      g.ell(bx, by - r * 0.4, r * 1.3, r * 0.75, INTRO_PAL.rock, { lo: 1, hi: 6, jit: 0.3 });
    }
    const gs = g.done();
    L.x.putImageData(L.img, 0, 0);
    L.x.drawImage(gs.c, 0, 0);
    // the modules (far ones smaller) and the cradle with the seed in it,
    // its arms open, half closed and closed
    const fx = Math.round(Math.min(I.sw * 0.17, 46)), nx = Math.round(Math.min(I.sw * 0.31, 86));
    return {
      ground: L.c, hz, gy, padRx, padRy,
      stakes: [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => ({ x: I.cx + Math.round(a * padRx * 0.82), y: gy + Math.round(b * padRy * 0.6) })),
      // each: x, where it lands (feet), its picture, when it sets off and lands
      fall: [
        { x: I.cx - fx, y: gy - padRy + 3, spr: introModule(true, 1), t0: 0.4, t1: 4.3 },
        { x: I.cx + fx, y: gy - padRy + 4, spr: introModule(true, 2), t0: 0.7, t1: 4.6 },
        { x: I.cx - nx, y: gy + 3, spr: introModule(false, 3), t0: 1.4, t1: 5.5 },
        { x: I.cx + nx, y: gy + 4, spr: introModule(false, 4), t0: 1.8, t1: 5.8 },
        { x: I.cx, y: gy + 1, spr: introCradle(0), cradle: true, t0: 2.6, t1: 7.0 },
      ],
    };
  });
}
// A base module, front on: a Charter-blue box on gunmetal, an amber band,
// the mark, landing legs out, two thrusters under it.
function introModule(far, seed) {
  return introKeep(`module/${far}/${seed}`, () => {
    const W = far ? 28 : 40, H = far ? 26 : 36, s = new PntSpr(W, H, 1700 + seed), P = INTRO_PAL, St = HART.steel, I = HART.iron, bw = W - 6, bh = far ? 15 : 21, x0 = 3, y0 = 2;
    // legs first (behind), then the body
    s.limb([[x0 + 3, y0 + bh - 2], [x0 - 1, H - 2]], 1, 0.7, (t, side) => I[side < 0 ? 3 : 1]);
    s.limb([[x0 + bw - 3, y0 + bh - 2], [x0 + bw + 1, H - 2]], 1, 0.7, (t, side) => I[side < 0 ? 2 : 0]);
    s.px(x0 - 1, H - 1, I[3]); s.px(x0 - 2, H - 1, I[2]); s.px(x0 + bw + 1, H - 1, I[2]); s.px(x0 + bw + 2, H - 1, I[1]);
    introPanel(s, x0, y0 + 2, x0 + bw, y0 + bh, P.plate, 1710 + seed, { seam: far ? 13 : 17, base: far ? 0.5 : 0.62 });
    // the roof, a lit gunmetal lip
    introPanel(s, x0 + 1, y0, x0 + bw - 1, y0 + 2, St, 1720 + seed, { base: 0.7 });
    for (let x = x0 + 2; x < x0 + bw - 1; x++) if ((x >> 1) % 2 === 0) s.px(x, y0 + bh - 4, P.amber[2]);
    introMark(s, x0 + (bw >> 1), y0 + (far ? 7 : 9), !far);
    s.px(x0 + bw - 3, y0 + 4, '#7dffd8');
    // the thrusters' bells under it
    for (const nx of [x0 + 5, x0 + bw - 5]) s.poly([[nx - 2, y0 + bh + 1], [nx + 2, y0 + bh + 1], [nx + 3, y0 + bh + 4], [nx - 3, y0 + bh + 4]], (x, y) => I[x < nx ? 3 : 1]);
    return Object.assign(s.done(), { ax: W >> 1, ay: H - 1, jets: [[x0 + 5 - (W >> 1), y0 + bh + 4 - (H - 1)], [x0 + bw - 5 - (W >> 1), y0 + bh + 4 - (H - 1)]] });
  });
}
// The cradle: a low hexagonal platform, gunmetal with a lit lip and amber
// sockets along its face, three arms, and the seed in it. arms: 0 open, 1
// half, 2 closed on the seed.
function introCradle(arms) {
  return introKeep(`cradle/${arms}`, () => {
    const W = 64, H = 54, s = new PntSpr(W, H, 1750 + arms), St = HART.steel, I = HART.iron, cx = 32, py = 40;
    // the back arm, behind the seed
    s.limb([[cx, py - 4], [cx + 1, py - 22], [cx, py - 30 + arms * 2]], 1.6, 1.1, (t, side) => I[side < 0 ? 2 : 0]);
    // the seed, sitting in its cradle
    hartCrystal(s, cx, py - 30, 0, py - 6, 7, 0.55);
    for (let n = 0; n < 5; n++) s.px(cx - 2 - (n % 2), py - 24 + n, HART.star[6], true);
    // the platform: a lit top, a darker face
    s.poly([[cx - 26, py - 4], [cx + 26, py - 4], [cx + 30, py], [cx - 30, py]], (x, y) => (y < py - 3 ? St[3] : HART.hull[5 - ((x >> 2) % 2)]));
    introPanel(s, cx - 30, py, cx + 30, py + 7, HART.hull, 1760, { seam: 15, base: 0.55 });
    for (let x = cx - 26; x <= cx + 26; x += 6) s.px(x, py + 3, '#2a1608');
    // the side arms: open (splayed out), half, closed in on the seed
    const reach = [[17, 30], [14, 27], [11, 22]][arms];
    for (const sd of [-1, 1]) {
      const bx = cx + sd * 25, tip = [cx + sd * reach[0], py - reach[1]], knee = [cx + sd * (reach[0] + 8 - arms * 3), py - 14 - arms * 2];
      s.limb([[bx, py - 3], knee, tip], 2.2, 1.3, (t, side) => (side < 0 ? St[sd < 0 ? 3 : 2] : HART.hull[side > 0 ? 2 : 4]));
      s.px(tip[0], tip[1], INTRO_PAL.amber[arms === 2 ? 4 : 1]);
    }
    // thrusters under the platform
    for (const nx of [cx - 18, cx + 18]) s.poly([[nx - 3, py + 7], [nx + 3, py + 7], [nx + 4, py + 11], [nx - 4, py + 11]], (x, y) => I[x < nx ? 3 : 1]);
    return Object.assign(s.done(), { ax: cx, ay: py + 11, jets: [[-18, 0], [18, 0]], star: { x: 0, y: -29 }, lights: [-26, -20, -14, -8, -2, 4, 10, 16, 22, 26].map((x) => [x, -8]) });
  });
}
function introDrawDescent(c, t) {
  const I = Intro, K = introDescentKit(), kit = introCrossingKit(), A = INTRO_PAL.amber;
  c.drawImage(kit.bg, 0, 0);
  introDrift(c, kit.far, 40 + t * 0.6); introDrift(c, kit.mid, 90 + t * 1.2);
  c.drawImage(K.ground, 0, 0);
  // the survey's stakes, blinking amber at the pad's corners
  K.stakes.forEach((s, i) => { const on = (Math.floor(t * 1.6) + i) % 2 === 0; introDot(c, s.x, s.y - 2, A[on ? 4 : 1]); introDot(c, s.x, s.y - 1, HART.iron[3]); introDot(c, s.x, s.y, HART.iron[2]); if (on) introGlow(c, introHalo(4, 2, ['#5a2c0a', '#d88c30'], 1801, 14), s.x, s.y - 1, 0.6); });
  const lock = 7.4, top = -10;
  for (const o of K.fall) {
    const k = introProg(t, [o.t0, o.t1]), land = t >= o.t1, spr = o.cradle ? introCradle(t < lock ? 0 : t < lock + 0.15 ? 1 : 2) : o.spr;
    if (t < o.t0) continue;
    const y = Math.round(lerp(top - 4, o.y, introOut(k))), x = Math.round(o.x + (land ? 0 : Math.sin(t * 2.3 + o.t0 * 5) * (1 - k) * 2));
    // thrust: a hard burn low down, cut at touchdown
    const thr = land ? Math.max(0, 1 - (t - o.t1) / 0.35) * 0.6 : 0.45 + 0.55 * k * k, hgt = o.y - y;
    // its light on the ground under it, and the dust it blows out
    if (thr > 0 && hgt < 90) {
      const near = 1 - hgt / 90, gl = introHalo(o.cradle ? 30 : 22, o.cradle ? 7 : 5, INTRO_PAL.thrust.slice(0, 4), 1802, o.cradle ? 220 : 150);
      introGlow(c, gl, o.x, o.y - 1, thr * near * 0.9);
    }
    introDust(c, o, t, x);
    for (const [jx, jy] of spr.jets) introPlume(c, x + jx, y + jy + 1, 0, 1, o.cradle ? 22 : 16, thr, 1803 + jx, 1.2);
    c.drawImage(spr.c, x - spr.ax, y - spr.ay);
    if (o.cradle) {
      // the seed's light, faint until it's planted, and then the lock
      const sx = x + spr.star.x, sy = y + spr.star.y;
      introGlow(c, introHalo(16, 14, ['#3a1e08', '#6a3a12', '#a0601e', '#d08c30'], 1804, 160), sx, sy, 0.55 + (t > lock ? 0.25 : 0));
      introGlow(c, introHalo(40, 8, ['#2a1606', '#4a2a0e', '#7a4a18'], 1807, 260), x, o.y - 2, (0.35 + (t > lock ? 0.3 : 0)) * clamp(1 - (o.y - y) / 60, 0, 1));
      if (t > lock) spr.lights.forEach(([lx, ly], i) => { if (t > lock + 0.15 + i * 0.07) { introDot(c, x + lx, y + ly + 3, A[4]); introGlow(c, introHalo(3, 2, ['#5a2c0a', '#ffb030'], 1805, 8), x + lx, y + ly + 3, 0.5); } });
      if (t > lock + 0.1 && t < lock + 2.2) {
        // a ring of gold along the ground, out from the cradle
        const q = (t - lock - 0.1) / 2.1, r = 8 + q * K.padRx * 1.3, tick = Math.floor(Game.realT * 10);
        for (let n = 0; n < 60; n++) {
          const a = (n / 60) * Math.PI * 2 + artHash(n, tick, 1806) * 0.08;
          introDash(c, o.x + Math.cos(a) * r - 1, o.y + Math.sin(a) * r * 0.22, 2, HART.star[n % 3 ? 4 : 5], (1 - q) * 0.7);
        }
      }
    }
  }
}
// Dust blown out along the ground from under a lander as it comes in:
// short strokes of the ground's colour, each a puff on its own path.
function introDust(c, o, t, x) {
  const D = INTRO_PAL.dust, low = o.t0 + (o.t1 - o.t0) * 0.62, end = o.t1 + 0.6, sz = o.cradle ? 1 : o.y < Intro.cy + 10 ? 0.6 : 0.85;
  if (t < low) return;
  for (let j = 0; j < 60; j++) {
    const born = low + j * 0.06;
    if (born > end || born > t) break;
    const age = t - born, life = 1.3 + artHash(j, 1, o.t0 * 100) * 0.7;
    if (age > life) continue;
    const dir = j % 2 ? 1 : -1, sp = (18 + artHash(j, 2, o.t0 * 100) * 30) * sz, q = age / life;
    const px = x + dir * (4 + sp * age * (1 - q * 0.4)), py = o.y - 1 - artHash(j, 3, o.t0 * 100) * 7 * q * sz;
    introDash(c, px - 1, py, 2 + (j % 3), D[clamp(3 - Math.floor(q * 4), 0, 3)], (1 - q) * 0.75);
  }
}

// ---------------------------------------------------------------------------
// Scene 4: the Meridian waiting in orbit over the dark world (the seed's
// point of gold down on it), then inside: its settlers asleep in rows of
// pods, each with a small light, the far rows dimmer.
// ---------------------------------------------------------------------------
function introOrbitKit() {
  const I = Intro, R = Math.round(Math.max(I.sw, I.sh) * 1.6), top = I.sy + Math.round(I.sh * 0.62);
  return {
    bg: introSpace(I.w, I.h, 1901, 0.28), far: introStarLayer(I.w, I.h, Math.round(I.w * I.h / 280), 1902, false), mid: introStarLayer(I.w, I.h, Math.round(I.w * I.h / 1000), 1903, true),
    planet: introPlanet(`orbit/${I.w}/${I.h}`, I.w, I.h, I.cx - Math.round(I.sw * 0.2), top + R, R, 1904), ship: introMeridian(false),
    seed: { x: I.cx + Math.round(I.sw * 0.22), y: top + 14 }, hall: introHall(),
  };
}
// The sleep deck: a dark bay of ribbed gunmetal, a cold strip of light
// along its top, and the pods racked in rows, each a capsule lying on its
// side with a long frosted window: in it a settler asleep, head on a
// pillow, the Charter's blue blanket to the shoulder, lit faintly teal from
// inside. Wider than the screen, so it can pan.
function introHall() {
  const I = Intro;
  return introKeep(`hall/${I.w}/${I.h}`, () => {
    const w = I.w + 160, h = I.h, L = introLayer(w, h), V = new Float32Array(w * h), y0 = I.sy + Math.round(I.sh * 0.03);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const rib = x % 130, near = Math.max(0, 1 - Math.abs(y - y0 - 4) / 90);
        let v = 0.14 + near * 0.26 + (pntNoise(x, y, 40, 12, 1911) - 0.5) * 0.1;
        if (rib < 4) v = rib === 0 ? 0.42 + near * 0.3 : rib === 3 ? 0.06 : 0.24;
        V[y * w + x] = clamp(v, 0, 1);
      }
    introStrokes(L, V, introRamp(HART.hull), 1912, 0.1);
    const B = introRamp(INTRO_PAL.glass);
    for (let x = 0; x < w; x++) if (x % 130 > 6) for (let y = y0; y < y0 + 2; y++) L.d[y * w + x] = B[y === y0 ? 5 : 4];
    const rows = [0.15, 0.42, 0.69].map((f) => I.sy + Math.round(I.sh * f));
    // the racks: a lit rail under each row, its shadow under that
    const St = introRamp(HART.steel);
    for (const ry of rows) for (let x = 0; x < w; x++) {
      const a = ry + 47;
      L.d[a * w + x] = St[artHash(x >> 2, a, 1916) < 0.7 ? 3 : 4]; L.d[(a + 1) * w + x] = St[2]; L.d[(a + 2) * w + x] = St[1];
      for (let k = 3; k < 9; k++) if (artHash(x >> 1, a + k, 1917) < 0.9 - k * 0.1) L.d[(a + k) * w + x] = introRamp(HART.hull)[0];
    }
    const bg = introFlush(L);
    const pods = [0, 1, 2].map((n) => introPod(1920 + n * 7, n));
    return { bg, w, pods, rows };
  });
}
function introPod(seed, look) {
  const W = 120, H = 46, s = new PntSpr(W, H, seed), G = INTRO_PAL.glass, Hu = HART.hull, St = HART.steel, P = INTRO_PAL.plate;
  // the shell: a long capsule, lit along its top, rounded at its ends,
  // darker down its belly
  hartStrokes(s, 0, 2, W - 1, H - 1, (x, y) => {
    const u = (x - W / 2) / (W / 2), v = (y - 2) / (H - 3), end = Math.max(0, Math.abs(u) - 0.93) / 0.07;
    if (end * end + (v * 2 - 1) ** 2 > 1 && Math.abs(u) > 0.93) return null;
    return 0.72 - v * 0.62 + (y === 2 ? 0.2 : 0) - (u > 0.9 ? 0.2 : 0) + (u < -0.9 ? 0.1 : 0);
  }, St, seed + 1, { lo: 0, hi: 4, jit: 0.08 });
  for (let x = 3; x < W - 3; x++) s.px(x, H - 4, Hu[2]);
  // the window
  const gx0 = 9, gx1 = W - 25, gy0 = 9, gy1 = 32;
  hartStrokes(s, gx0, gy0, gx1, gy1, (x, y) => 0.62 - ((y - gy0) / (gy1 - gy0)) * 0.42 - ((x - gx0) / (gx1 - gx0)) * 0.12, G, seed + 2, { lo: 1, hi: 4, jit: 0.08 });
  // the sleeper: a pillow, the head turned up, the blanket to the shoulder
  const hx = gx0 + 12, hy = gy0 + 11, skin = [['#2a1c1a', '#4a3430', '#6e4e44', '#8e6a5a', '#a88470'], ['#1e1612', '#34261e', '#4e3a2c', '#6a5038', '#82644a'], ['#2c2224', '#4c3a3a', '#705654', '#927470', '#b09088']][look % 3];
  s.ell(hx - 4, hy + 3, 7, 3.5, ['#3a4448', '#56646a', '#74848a', '#90a0a4'], { lo: 0, hi: 3 });
  s.ell(hx, hy, 5.2, 5.8, skin, { lo: 1, hi: 4 });
  const hair = ['#140c0a', '#20140e', '#2c1c14'];
  hartStrokes(s, hx - 6, hy - 6, hx + 3, hy + 1, (x, y) => ((x - hx + 1) ** 2 / 20 + (y - hy + 1) ** 2 / 26 < 1 && (x < hx - 1 || y < hy - 3) ? 0.5 : null), hair, seed + 3);
  s.px(hx + 2, hy - 1, skin[0]); s.px(hx + 3, hy - 1, skin[1]); s.px(hx + 3, hy + 1, skin[3]); s.px(hx + 2, hy + 3, skin[1]);
  hartStrokes(s, hx + 5, hy - 2, gx1 - 3, gy1 - 1, (x, y) => {
    const top = hy + 1 - Math.round(Math.sin(((x - hx - 5) / 10) * Math.PI) * (x < hx + 15 ? 3 : 0)) + Math.round(Math.sin(x * 0.3) * 0.6);
    return y < top ? null : 0.62 - (y - top) * 0.06 + (y === top ? 0.2 : 0);
  }, P, seed + 4, { lo: 1, hi: 4, jit: 0.06 });
  // the glass over it: frost along its top and corners, a glint at its left
  for (let n = 0; n < 34; n++) {
    const fx = gx0 + Math.floor(artHash(n, 1, seed) * (gx1 - gx0)), fy = artHash(n, 2, seed) < 0.6 ? gy0 + (n % 2) : gy1 - (n % 2);
    s.px(fx, fy, G[5]); if (n % 3 === 0) s.px(fx + 1, fy, G[4]);
  }
  for (let k = 0; k < 6; k++) s.px(gx0 + 2 + k, gy0 + 2 + (k >> 1), G[5]);
  for (let y = gy0 - 1; y <= gy1 + 1; y++) { s.px(gx0 - 1, y, St[3]); s.px(gx1 + 1, y, Hu[1]); }
  for (let x = gx0 - 1; x <= gx1 + 1; x++) { s.px(x, gy0 - 1, St[4]); s.px(x, gy1 + 1, Hu[1]); }
  // the panel at its foot: a readout, a light (drawn each frame)
  s.box(W - 21, 11, W - 8, 29, HART.iron, { lo: 0, hi: 3 });
  for (let k = 0; k < 4; k++) s.px(W - 18 + k * 2, 15, k % 2 ? '#1c5a40' : '#2e8a64');
  introMark(s, W - 14, 24, false);
  return Object.assign(s.done(), { light: { x: W - 14, y: 19 }, glass: { x: (gx0 + gx1) >> 1, y: (gy0 + gy1) >> 1, rx: (gx1 - gx0) >> 1 } });
}
function introDrawOrbit(c, t) {
  const I = Intro, K = introOrbitKit(), cut = 4.6, mix2 = clamp((t - cut) / 0.9, 0, 1);
  if (mix2 < 1) {
    c.drawImage(K.bg, 0, 0);
    introDrift(c, K.far, t * 0.8); introDrift(c, K.mid, t * 2);
    introTwinkle(c, I.w, Math.round(introLimbY(K.planet, I.cx)), 1905, t);
    c.drawImage(K.planet.c, 0, 0);
    // the seed down there, a point of gold on the dark
    const pulse = 0.65 + 0.35 * Math.sin(t * 2);
    introDot(c, K.seed.x, K.seed.y, HART.star[5]);
    introGlow(c, introHalo(4, 3, ['#6a3a12', '#d08c30', '#ffd987'], 1906, 18), K.seed.x, K.seed.y, pulse);
    // the ship, passing slowly left over the limb
    const s = K.ship, x = Math.round(I.cx - s.w / 2 + 16 - t * 4.5), y = Math.round(I.cy - I.sh * 0.1 - s.h / 2);
    c.save(); c.translate(x + s.w, y); c.scale(-1, 1); c.drawImage(s.c, 0, 0); c.restore();
    // a few of its pods' lights breathing
    for (let i = 0; i < 9; i++) {
      const px = x + s.w - 30 - Math.floor(artHash(i, 1, 1907) * (s.w - 60)), py = y + (i % 2 ? 21 : 26), k = Math.max(0, Math.sin(t * 1.3 + i * 1.7));
      introDot(c, px, py, '#bafff0', k * 0.9);
    }
    introPlume(c, x + s.w - s.nozzle.x, y + s.nozzle.y - 9, 1, 0, 6, 0.3, 1908, 0.5);
    introPlume(c, x + s.w - s.nozzle.x, y + s.nozzle.y + 9, 1, 0, 6, 0.3, 1909, 0.5);
  }
  if (mix2 > 0) {
    // inside: the rows of the sleeping, the view drifting slowly along
    const H = K.hall, pan = (t - cut) * 8, gl = introHalo(48, 16, ['#06201c', '#0c3a32', '#16584a', '#2a8a72'], 1915, 500);
    c.globalAlpha = mix2;
    c.drawImage(H.bg, -Math.round(pan * 0.7) - 30, 0);
    H.rows.forEach((ry, r) => {
      for (let i = -1; i < 6; i++) {
        const x = Math.round(i * 130 + (r % 2 ? -52 : 6) - pan), pod = H.pods[(i + r * 2 + 6) % 3];
        if (x > I.w || x + pod.w < 0) continue;
        c.drawImage(pod.c, x, ry);
        const ph = t * 0.7 + i * 1.9 + r * 2.6, k = 0.5 + 0.5 * Math.sin(ph);
        // the faint light inside each, breathing, and its status light
        introGlow(c, gl, x + pod.glass.x, ry + pod.glass.y, mix2 * (0.25 + 0.25 * k));
        const blink = (ph % 6.3) < 0.5;
        introDot(c, x + pod.light.x, ry + pod.light.y, blink ? '#d8fff0' : INTRO_PAL.pod, mix2 * (0.55 + 0.45 * k));
        if (blink) introGlow(c, introHalo(4, 3, ['#0c3a26', '#1f8a5a', '#5cffb4'], 1910, 18), x + pod.light.x, ry + pod.light.y, mix2);
      }
    });
    c.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------------------
// Scene 5, the last shot, in the outpost itself: the game draws it, and
// reads Intro.hub for the camera, the star's rise and light, how far the
// outpost's light has come up, the stations lighting and Wick. Where things
// are comes from the outpost's own data, so the shot follows the outpost:
//   the star and its cradle: STAR_AT (hub.js);
//   where the Kindler stands when it's over: the floor's entry
//     (makeHubFloor, floor.js), and he steps out from `step` tiles south;
//   the stations the light runs out to: HUB_STATIONS (floor.js);
//   somewhere dark: a tile of the pit away from the light.
// ---------------------------------------------------------------------------
function introHubShot(d) {
  const f = d.floor, H = T.intro.hub, star = { x: Math.round(STAR_AT.x * ATILE), y: Math.round(STAR_AT.y * ATILE) };
  const entry = { x: (f.entry.x + 0.5) * TILE, y: (f.entry.y + 0.5) * TILE };
  let from = { x: entry.x, y: entry.y + H.step * TILE };
  if (TILE_SOLID[floorTile(f, Math.floor(from.x / TILE), Math.floor(from.y / TILE))]) from = Object.assign({}, entry);
  const stations = HUB_STATIONS.filter((s) => s.id !== 'dummy').map((s) => ({ id: s.id, x: Math.round((s.x + 0.5) * ATILE), y: Math.round((s.y + 0.5) * ATILE) }));
  let dark = null;
  for (const [dx, dy] of [[-3.5, 3.2], [3.6, 3.0], [-2, 3.8]]) {
    const tx = Math.floor(STAR_AT.x + dx), ty = Math.floor(STAR_AT.y + dy);
    if (floorTile(f, tx, ty) === TILE_PIT) { dark = { x: Math.round((tx + 0.5) * ATILE), y: Math.round((ty + 0.5) * ATILE) }; break; }
  }
  return { star, entry, from, stations, dark };
}
function introHubBegin() {
  const I = Intro, d = I.dive, shot = introHubShot(d);
  Game.modal = null;
  Input.block();
  d.p.x = shot.from.x; d.p.y = shot.from.y; d.p.fx = 0; d.p.fy = -1; d.p.walkT = 0;
  d.drone = null;
  I.hub = { shot, k: 0, starDY: T.intro.hub.drop, lit: 0, amb: T.intro.hub.amb0, wick: false };
  introHubStep();
}
// Each step of the last shot: everything from the time, but the walk, which
// the Kindler does himself (pushed along as if by the stick); a jump in
// time puts him where he'd have got to.
function introHubStep() {
  const I = Intro, h = I.hub, H = T.intro.hub, t = I.t, d = I.dive;
  if (!h || !d) return;
  h.starDY = H.drop * (1 - introOut(introProg(t, H.rise)));
  h.lit = introEase(introProg(t, H.lit));
  h.amb = lerp(H.amb0, 1, introEase(introProg(t, H.ambUp)));
  h.k = introEase(introProg(t, H.cam));
  h.wick = t >= H.wickAt;
  const p = d.p, ey = h.shot.entry.y, pace = T.player.speed * (1 + (d.stats.moveSpeed || 0) / 100) * H.walk;
  const want = Math.max(ey, h.shot.from.y - Math.max(0, t - H.walkAt) * pace);
  if (p.y > want + 3) { p.y = want; p.x = h.shot.entry.x; }
  Input.move.x = 0;
  Input.move.y = t >= H.walkAt && p.y > ey + 0.5 ? -H.walk : 0;
}
// The camera: from high, the star well up in the view, down to where play
// keeps it (camY: where it would be).
function introCamY(camY) {
  const h = Intro.hub, y0 = h.shot.star.y - Math.round(View.h * T.intro.hub.camAt);
  return Math.round(lerp(Math.min(y0, camY), camY, h.k));
}
// Over the lit frame (render.js): the sky above the outpost while the
// camera is high, the light running out from the star to each station, and
// once, late, something in the dark.
function introHubSky(d, ox, oy) {
  const I = Intro, h = I.hub, t = I.t, x = View.ctx;
  // the sky and the far land, laid over the top of the floor
  if (oy > -20) {
    const W = d.floor.w * ATILE, sky = introHubSkyPic(W);
    x.drawImage(sky, ox, oy - sky.height + 30);
    // the Meridian, a light crossing high up
    const mx = Math.round(ox + ((t * 7 + 60) % W)), my = oy - 170;
    if (my > -2) { x.fillStyle = '#e8f4ff'; x.fillRect(mx, my, 1, 1); x.globalAlpha = 0.4; x.fillRect(mx - 1, my, 1, 1); x.globalAlpha = 1; }
  }
  introHubLights(h, ox, oy, t);
}
// The sky over the outpost, W art px across: the dark with its stars, and
// the far land's ridge along the foot, its lower edge broken where it lies
// over the floor's top.
function introHubSkyPic(W) {
  return introKeep(`hubsky/${W}`, () => {
    const SH = 260, L = introLayer(W, SH), V = new Float32Array(W * SH).fill(-1), M = new Float32Array(W * SH).fill(-1);
    const ridge = (x2) => SH - 22 - Math.round(pntNoise(x2, 0, 30, 1, 2001) * 18 + pntNoise(x2, 0, 7, 1, 2002) * 5);
    for (let y = 0; y < SH; y++)
      for (let x2 = 0; x2 < W; x2++) {
        const r = ridge(x2);
        if (y < r) V[y * W + x2] = 0.08 + 0.3 * (y / SH) ** 3 + (pntNoise(x2, y, 50, 14, 2003) - 0.5) * 0.08;
        else if (y < SH - 10 || artHash(x2 >> 2, y, 2004) < (SH - y) / 10) M[y * W + x2] = 0.08 + (y - r) / 60 + (pntNoise(x2, y, 9, 3, 2005) - 0.5) * 0.1;
      }
    introStrokes(L, V, introRamp(INTRO_PAL.space), 2006, 0.1);
    introStrokes(L, M, introRamp(INTRO_PAL.rock), 2007, 0.12);
    L.x.putImageData(L.img, 0, 0);
    const st = introStarLayer(W, SH - 40, Math.round(W * SH / 300), 2008, true);
    L.x.drawImage(st, 0, 0);
    return L.c;
  });
}
function introHubLights(h, ox, oy, t) {
  const H = T.intro.hub;
  // the light running out to the stations, and each catching it
  const sx = h.shot.star.x + ox, sy = h.shot.star.y + oy, r = (t - H.ping) * H.pingSpeed;
  if (r > 0) {
    const far = Math.max(...h.shot.stations.map((s) => Math.hypot(s.x - h.shot.star.x, (s.y - h.shot.star.y) / 0.75)));
    if (r < far + 20) ringDots(sx, sy, r, ART.pal.star[3], 0.55 * (1 - r / (far + 20)), true);
    for (const s of h.shot.stations) {
      const at = Math.hypot(s.x - h.shot.star.x, (s.y - h.shot.star.y) / 0.75), age = (r - at) / H.pingSpeed;
      if (age < 0 || age > 0.8) continue;
      const cx = s.x + ox, cy = s.y + oy;
      ringDots(cx, cy - 4, 3 + age * 14, ART.pal.star[3], 1 - age / 0.8, true);
      for (let n = 0; n < 6; n++) dot(cx - 5 + n * 2, cy - 6 - Math.round(age * (10 + n * 3)), ART.pal.star[n % 2 ? 2 : 3], true, 1 - age / 0.8);
    }
  }
  // late, in the dark of the pit, two cold points, for a moment
  const dk = h.shot.dark, a = Math.sin(clamp((t - H.dark[0]) / (H.dark[1] - H.dark[0]), 0, 1) * Math.PI) * 0.45;
  if (dk && a > 0.02) { dot(dk.x + ox, dk.y + oy, INTRO_PAL.cold, true, a); dot(dk.x + ox + 3, dk.y + oy, INTRO_PAL.cold, true, a); }
}
