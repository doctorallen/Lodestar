'use strict';
// ---------------------------------------------------------------------------
// The music, and each place's own sound (the engine is audio.js).
//
// The star's music is a hum in D that grows with it: a layer comes in at
// each magnitude (MUS_LAYERS), and the star's call, two notes now and then,
// becomes a slow figure of bells from magnitude 4 (MUS_PHRASES). Feeding it
// swells the hum and opens it out; a magnitude reached blooms, and the next
// layer comes in under it.
//
// How much of the star is there (presence, 0–1): all of it at home, most of
// it in kindled land, and out in the dark less as your light drains, the
// top layers going first. A Deep is further from it still. Under the music
// each place has its own sound (MUS_BEDS): two bands of noise for its wind,
// water or room, and what happens now and then (drips, embers, a clock),
// louder as the star thins. With your light out, a slow throb.
//
// After the turn (the echoes read, T.story.turnEcho) a darker note creeps
// in: a flat sixth rubbing against the star's chord, the figure sometimes
// falling to minor and not resolving, and in the dark, slow breathing in
// the place's own sound.
//
// Music.tick (every frame, from Snd.tick) also listens to the game for what
// it doesn't call itself: footsteps (from the Kindler's walk), a heartbeat
// at low health, a channel's rising tone, a sting when something big comes
// into view, and a lander's arrival at home.
// ---------------------------------------------------------------------------

// The continuous layers. mag: the magnitude it comes in at; at: how much of
// the star must be there for it (it fades in round that); notes: [semis
// from D4, detune cents]; w: its wave; bp, lp: its filters; lfo: [rate,
// Hz] on its low pass; g: its level; trem: [rate, depth] a slow swell.
const MUS_LAYERS = {
  hum: { mag: 1, at: 0.16, notes: [[-12, -4], [-12, 5], [0, 0]], w: 'warm', lp: 700, lfo: [0.06, 220], g: 0.14, trem: [0.11, 0.2] },
  fifth: { mag: 2, at: 0.32, notes: [[-5, -3], [-5, 4]], w: 'hollow', lp: 1100, g: 0.065, trem: [0.083, 0.3] },
  pad: { mag: 3, at: 0.46, notes: [[0, 0], [4, 3], [7, -3]], w: 'warm', bp: 850, lp: 2000, g: 0.05, trem: [0.05, 0.35] },
  shimmer: { mag: 5, at: 0.84, notes: [[19, -6], [24, 6]], w: 'sine', lp: 4000, g: 0.011, trem: [0.13, 0.6] },
  ninth: { mag: 6, at: 0.6, notes: [[2, 2], [9, -2]], w: 'hollow', lp: 1600, g: 0.026, trem: [0.07, 0.4] },
  // by the turn, not the magnitude: B flat against the star's A
  unease: { notes: [[-4, 0], [8, 3]], w: 'hollow', lp: 950, g: 0.04, trem: [0.031, 0.7] },
  // your light out (or a Keeper's hold): a slow throb
  dread: { notes: [[-12, 0], [-12, 28], [-6, 0]], w: 'warm', lp: 520, g: 0.05, trem: [0.4, 0.5] },
};
// The figure: [semis from D4, beats]. The call (below magnitude 4) is its
// first two notes; the uneasy ones come after the turn.
const MUS_CALL = [[7, 1], [12, 3]];
const MUS_PHRASES = [
  [[7, 1], [12, 1], [14, 1], [16, 2], [14, 3]],
  [[12, 1], [16, 1], [19, 2], [16, 1], [14, 3]],
  [[9, 1], [7, 1], [4, 2], [7, 1], [2, 3]],
  [[4, 1], [7, 1], [12, 3], [11, 1], [12, 3]],
];
const MUS_PHRASES_UNEASY = [
  [[7, 1], [12, 1], [14, 1], [15, 2], [10, 3]],
  [[12, 1], [15, 1], [19, 2], [20, 1], [19, 3]],
  [[9, 1], [8, 2], [7, 1], [3, 3]],
];
// The third below each pitch class of D major (and the uneasy notes), for
// the figure's second voice from magnitude 7.
const MUS_THIRD = [-3, -3, -3, -3, -4, -3, -3, -3, -4, -4, -3, -4];

// Each place's own sound. a, b: two bands of noise [Hz, Q, level]; gust:
// how much they rise and fall, and rate how quickly (wind gusting, water
// lapping); ev: what happens now and then [kind, least gap, most gap,
// level] (MUS_EVENTS).
const MUS_BEDS = {
  hub: { a: [520, 0.7, 0.07], b: [2400, 0.8, 0.008], gust: 0.35, rate: 0.15, ev: [['fire', 0.3, 1.4, 0.8]] },
  badlands: { a: [650, 0.8, 0.24], b: [2100, 1.5, 0.035], gust: 0.6, rate: 0.2, ev: [['skitter', 5, 14, 0.5]] },
  frost: { a: [900, 0.6, 0.27], b: [3000, 4, 0.03], gust: 0.7, rate: 0.25, ev: [['creak', 7, 18, 0.35]] },
  cinder: { a: [240, 1.2, 0.34], b: [1800, 0.8, 0.035], gust: 0.4, rate: 0.1, ev: [['crackle', 0.2, 1.2, 0.6]] },
  bloomfen: { a: [500, 0.7, 0.17], b: [3600, 1.5, 0.018], gust: 0.4, rate: 0.12, ev: [['plop', 2, 6, 0.6]] },
  caverns: { a: [330, 0.8, 0.19], b: [1200, 0.6, 0.022], gust: 0.25, rate: 0.06, ev: [['drip', 2, 5, 0.6]] },
  grotto: { a: [420, 0.9, 0.22], b: [1500, 0.8, 0.035], gust: 0.45, rate: 0.3, ev: [['drip', 1.4, 4, 0.7]] },
  magma: { a: [210, 1.4, 0.38], b: [900, 1, 0.045], gust: 0.5, rate: 0.12, ev: [['blorp', 1.5, 4, 0.6], ['crackle', 0.4, 1.5, 0.4]] },
  rootdeep: { a: [300, 0.8, 0.19], b: [800, 0.8, 0.028], gust: 0.3, rate: 0.08, ev: [['creak', 5, 12, 0.5], ['drip', 3, 8, 0.4]] },
  archive: { a: [400, 0.8, 0.14], b: [2600, 1, 0.012], gust: 0.2, rate: 0.05, ev: [['settle', 6, 15, 0.4]] },
  temple: { a: [520, 0.8, 0.17], b: [1400, 0.8, 0.028], gust: 0.45, rate: 0.15, ev: [['drip', 2, 6, 0.5]] },
  vault: { a: [380, 0.8, 0.15], b: [3200, 0.8, 0.018], gust: 0.2, rate: 0.05, ev: [['tick', 1, 1, 0.35]] },
  lair: { a: [260, 1, 0.28], b: [700, 1, 0.035], gust: 0.5, rate: 0.07, ev: [['groan', 6, 14, 0.5]] },
};
// A storm overhead: rain in place of the high band, and thunder far off.
const MUS_RAIN = { b: [2800, 0.5, 0.06], ev: ['rumble', 8, 20, 0.5] };

// What happens now and then in a place: (S, out, t, level).
const MUS_EVENTS = {
  drip(S, o, t, g) { const f = sndRange(1300, 2300); sndTone(S, o, t, { f, f2: f * 0.6, glide: 0.04, a: 0.001, d: 0.03, g, send: 0.35 }); },
  crackle(S, o, t, g) { sndCrackle(S, o, t, 2 + Math.floor(sndRand() * 4), 0.15, g, 2000); },
  plop(S, o, t, g) { sndTone(S, o, t, { f: 260, f2: 540, glide: 0.05, a: 0.003, d: 0.04, g }); sndNoise(S, o, t, { ft: 'lowpass', f: 600, a: 0.002, d: 0.03, g: g * 0.5 }); },
  creak(S, o, t, g) { const f = sndRange(190, 260); sndTone(S, o, t, { f, f2: f * 1.25, glide: 0.7, w: 'reed', lp: 900, vib: [9, 3], a: 0.2, d: 0.2, g }); },
  skitter(S, o, t, g) { for (let i = 0; i < 5; i++) sndNoise(S, o, t + i * sndRange(0.04, 0.09), { f: sndRange(2400, 3600), q: 4, a: 0.001, d: 0.006, g: g * sndRange(0.4, 1) }); },
  blorp(S, o, t, g) { sndTone(S, o, t, { f: 260, f2: 130, glide: 0.15, w: 'warm', lp: 650, a: 0.01, d: 0.06, g }); sndNoise(S, o, t, { ft: 'lowpass', f: 400, a: 0.01, d: 0.05, g: g * 0.6 }); },
  settle(S, o, t, g) { sndTone(S, o, t, { f: 220, f2: 180, glide: 0.03, w: 'warm', lp: 800, a: 0.001, d: 0.035, g }); sndNoise(S, o, t, { f: 1500, q: 2, a: 0.001, d: 0.01, g: g * 0.5, send: 0.4 }); },
  tick(S, o, t, g) { const hi = (Music.ticks = (Music.ticks || 0) + 1) % 2; sndNoise(S, o, t, { f: hi ? 2600 : 1900, q: 8, a: 0.001, d: 0.008, g }); sndTone(S, o, t, { f: hi ? 1800 : 1350, a: 0.001, d: 0.012, g: g * 0.4, send: 0.3 }); },
  groan(S, o, t, g) { sndTone(S, o, t, { f: 110, f2: 98, glide: 1.5, w: 'reed', lp: 520, a: 0.6, d: 0.6, g, send: 0.3 }); },
  chirp(S, o, t, g) { const f = sndRange(2300, 2900); for (let i = 0; i < 2 + Math.floor(sndRand() * 2); i++) sndTone(S, o, t + i * 0.11, { f, f2: f * 1.3, glide: 0.05, a: 0.004, d: 0.025, g: g * 0.7 }); },
  rumble(S, o, t, g) { sndNoise(S, o, t, { ft: 'lowpass', f: 320, f2: 160, glide: 2, a: 0.5, d: 0.8, g }); },
  // the outpost's forge, louder as you near it
  fire(S, o, t, g) { sndCrackle(S, o, t, 1 + Math.floor(sndRand() * 3), 0.2, g, 1800); },
};

// The last target set on each param, so an unchanged one isn't set again.
const _musLast = new WeakMap();
function musSet(p, v, now, tc) {
  const was = _musLast.get(p);
  if (was !== undefined && Math.abs(was - v) < 1e-4) return;
  _musLast.set(p, v);
  p.setTargetAtTime(v, now, tc);
}
// How much of a layer the star's presence s lets through: it fades in
// round its `at`.
function musPresence(s, at) { const k = sndClamp((s - at + 0.1) / 0.2, 0, 1); return k * k * (3 - 2 * k); }

// A continuous voice: its notes into its filters, a slow swell, and its level.
function musVoice(S, L, dest) {
  const c = S.ctx, out = c.createGain(), trem = c.createGain(), lp = c.createBiquadFilter();
  out.gain.value = 0; trem.gain.value = 1;
  lp.type = 'lowpass'; lp.frequency.value = L.lp; lp.Q.value = 0.6;
  lp.connect(trem); trem.connect(out); out.connect(dest);
  let head = lp;
  if (L.bp) { const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = L.bp; bp.Q.value = 0.7; bp.connect(lp); head = bp; }
  const lfo = (rate, depth, param) => { const o = c.createOscillator(), g = c.createGain(); o.frequency.value = rate; g.gain.value = depth; o.connect(g); g.connect(param); o.start(); };
  if (L.trem) lfo(L.trem[0], L.trem[1], trem.gain);
  if (L.lfo) lfo(L.lfo[0], L.lfo[1], lp.frequency);
  const oscs = L.notes.map(([s, det]) => {
    const o = c.createOscillator();
    if (S.waves[L.w]) o.setPeriodicWave(S.waves[L.w]); else o.type = L.w;
    o.frequency.value = sndHz(s); o.detune.value = det; o.connect(head); o.start();
    return o;
  });
  return { out, lp, oscs, L };
}
// A band of noise, looped, for a place's own sound.
function musBand(S, dest, type) {
  const c = S.ctx, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = S.noise; src.loop = true;
  f.type = type || 'bandpass'; f.frequency.value = 500; f.Q.value = 0.8; g.gain.value = 0;
  src.connect(f); f.connect(g); g.connect(dest);
  src.start(0, sndRand() * 1.8);
  return { f, g };
}

const Music = {
  S: null, built: false,
  v: {}, bands: null, master: null, chan: null,
  magHeard: 1, magWait: -1, bloomed: 0, growAt: -99, liftAt: -99,
  feed: 0, feedHeld: false, pingAt: -9, lastNow: 0, lastUp: -9,
  nextPhrase: 0, nextEv: {}, gust: 1, gustAt: 0, breathAt: 0, bedId: '',
  stepHalf: -1, heartAt: 0, stingAt: 0, seen: new WeakSet(),

  // The voices, built once on Snd's context and kept running (silent until
  // wanted), so nothing continuous is made while playing.
  build(S) {
    this.S = S;
    const c = S.ctx;
    this.master = c.createGain(); this.master.gain.value = 1; this.master.connect(S.music);
    this.v = {};
    for (const id of Object.keys(MUS_LAYERS)) this.v[id] = musVoice(S, MUS_LAYERS[id], this.master);
    // the bands of a place's sound, and the breath after the turn
    this.bands = { a: musBand(S, this.master), b: musBand(S, this.master), breath: musBand(S, this.master) };
    this.bands.breath.f.frequency.value = 650; this.bands.breath.f.Q.value = 0.6;
    // a channel's tone (an effect, so on the effects' bus)
    this.chan = musVoice(S, { notes: [[-5, 0], [2, 3]], w: 'hollow', lp: 1400, trem: [5, 0.25] }, S.sfx);
    const st = this.state();
    this.magHeard = this.bloomed = st.mag;
    this.magWait = -1; this.feed = 0; this.feedHeld = false;
    this.lastNow = c.currentTime; this.nextPhrase = c.currentTime + 3; this.nextEv = {};
    this.built = true;
  },

  // What the music is doing now, read from the game: mag; unease (0–1,
  // the turn); s, the star's presence; bed, the place's sound; day; storm;
  // dark (your light out); dying.
  state() {
    const P = T.sound.presence, s0 = typeof Save !== 'undefined' && Save.data, d = typeof Game !== 'undefined' && Game.dive;
    const echoes = ((s0 && s0.echoes) || []).length, U = T.sound.uneaseFrom;
    const st = { mag: s0 ? magnitudeOf() : 1, unease: sndClamp((echoes - U) / Math.max(1, T.story.turnEcho - U), 0, 1), s: 1, bed: 'hub', day: true, storm: false, dark: 0, dying: false };
    if (!d || d.hub) return st;
    const pull = sndClamp(d.pull, 0, 1);
    if (d.deep) {
      const held = d.zone === 'lair' && d.keeper && !d.keeper.dead;
      st.s = held ? 0 : P.deep[0] + P.deep[1] * pull; st.bed = d.zone === 'lair' ? 'lair' : d.clime || 'caverns'; st.day = false;
      st.dark = held ? 0.7 : pull <= 0 ? 1 : 0;
    } else if (typeof litAt === 'function' && litAt(d, d.p.x, d.p.y)) { st.s = P.kindled; st.bed = d.clime || 'badlands'; }
    else { st.s = P.dark[0] + P.dark[1] * pull; st.bed = d.clime || 'badlands'; st.day = false; st.dark = pull <= 0 ? 1 : 0; }
    st.storm = typeof stormHere === 'function' && stormHere(d);
    st.dying = d.dying > 0;
    return st;
  },

  // Every frame (real time): what the game doesn't call itself, then the
  // music ten times a second.
  tick(dt) {
    if (!this.built) return;
    const now = this.S.ctx.currentTime;
    this.listen(now);
    if (now - this.lastUp < 0.1) return;
    this.lastUp = now;
    this.update(now, this.state());
  },

  // The music at `now` for state st (the tests call this straight, with
  // their own times and states, on an OfflineAudioContext).
  update(now, st) {
    const S = this.S, dt = sndClamp(now - this.lastNow, 0, 0.5), X = T.sound;
    this.lastNow = now;
    // the magnitude heard: at once when the star grows (grow), else after a while
    if (st.mag < this.magHeard) this.magHeard = this.bloomed = st.mag;
    else if (st.mag > this.magHeard) { if (this.magWait < 0) this.magWait = now; else if (now - this.magWait > X.magLate) { this.magHeard = st.mag; this.magWait = -1; } }
    else this.magWait = -1;
    this.feed = Math.max(this.feedHeld ? X.feedHeld : 0, this.feed - dt * X.feedFade);
    const lift = now - this.liftAt < X.lift, s = st.dying ? 0 : lift ? Math.max(st.s, 1) : st.s, f = this.feed, mag = this.magHeard;
    const slow = now - this.growAt < 8 || lift, tc = slow ? 2.5 : 1.2;
    for (const id of ['hum', 'fifth', 'pad', 'shimmer', 'ninth']) {
      const V = this.v[id], L = V.L;
      let g = L.g * (mag >= L.mag ? 1 : 0) * musPresence(s, L.at);
      if (id === 'hum') g *= 1 + X.feedSwell * f;
      if (id === 'pad') g *= 1 + f;
      if (id === 'shimmer') g = Math.max(g, L.g * f * 0.8);
      musSet(V.out.gain, g, now, tc);
    }
    musSet(this.v.hum.lp.frequency, MUS_LAYERS.hum.lp + X.feedOpen * f, now, 0.4);
    musSet(this.v.unease.out.gain, MUS_LAYERS.unease.g * st.unease * (0.4 + 0.6 * musPresence(s, 0.3)), now, 3);
    musSet(this.v.dread.out.gain, MUS_LAYERS.dread.g * st.dark, now, 2);
    this.bed(now, st, s);
    // the call, or the figure, when there's star enough for it
    const fig = musPresence(s, X.figureAt);
    if (now >= this.nextPhrase) {
      if (fig > 0.05 && mag >= 1) this.phrase(now + 0.05, st, fig, mag);
      const R = mag >= 4 ? X.phraseRest : X.callRest;
      this.nextPhrase = now + sndRange(R[0], R[1]) * (st.bed === 'hub' ? 1 : X.awayRest);
    }
  },

  // One phrase of the figure (or the call), its bells and a soft voice
  // under each note.
  phrase(t, st, k, mag) {
    const S = this.S, X = T.sound, uneasy = sndRand() < st.unease * X.uneasyPhrase;
    const ph = mag < 4 ? MUS_CALL : uneasy ? MUS_PHRASES_UNEASY[Math.floor(sndRand() * MUS_PHRASES_UNEASY.length)] : MUS_PHRASES[Math.floor(sndRand() * MUS_PHRASES.length)];
    const o = S.cueOut(t, X.figure * k * (mag < 4 ? 0.7 : 1), 0, this.master), beat = X.beat;
    let at = t;
    // from magnitude 8 a deep bell opens the phrase
    if (mag >= 8) sndBell(S, o, at, sndHz(-12), 0.5, 2.5, 0.5);
    for (const [semi, len] of ph) {
      const det = st.unease ? -sndRange(0, 10) * st.unease : 0, f = sndHz(semi) * Math.pow(2, det / 1200);
      sndBell(S, o, at, f, 0.45, 0.9 + len * 0.3, 0.5);
      sndTone(S, o, at, { f, w: 'hollow', lp: 1800, a: 0.06, d: 0.35 * len, hold: 0.1, g: 0.22, send: 0.4 });
      if (mag >= 7) sndBell(S, o, at + 0.02, sndHz(semi + MUS_THIRD[((semi % 12) + 12) % 12]), 0.22, 0.8 + len * 0.3, 0.5);
      at += len * beat;
    }
    S.cueDone(o);
  },

  // A place's sound: its two bands rising and falling, more of it as the
  // star thins (and less by day); now and then its events; the breath.
  bed(now, st, s) {
    const S = this.S, X = T.sound, B = MUS_BEDS[st.bed] || MUS_BEDS.caverns, bd = this.bands;
    const k = (1 - X.bedUnder * s) * (st.day && st.bed !== 'hub' ? X.bedDay : 1);
    if (now >= this.gustAt) { this.gust = 1 + sndRange(-B.gust, B.gust * 0.5); this.gustAt = now + sndRange(0.5, 1.5) / Math.max(0.05, B.rate * 4); }
    const tc = st.bed !== this.bedId ? 1 : 0.6 / Math.max(0.1, B.rate * 2), b = st.storm ? MUS_RAIN.b : B.b;
    this.bedId = st.bed;
    musSet(bd.a.f.frequency, B.a[0] * (1 + 0.25 * (this.gust - 1)), now, tc);
    musSet(bd.a.f.Q, B.a[1], now, 1);
    musSet(bd.a.g.gain, B.a[2] * k * this.gust, now, tc);
    musSet(bd.b.f.frequency, b[0], now, 1);
    musSet(bd.b.f.Q, b[1], now, 1);
    musSet(bd.b.g.gain, b[2] * (st.storm ? 1 : k * (0.7 + 0.3 * this.gust)), now, tc);
    // the breath, in the dark after the turn
    if (now >= this.breathAt) {
      const g = X.breath * st.unease * (1 - s) * (st.day ? 0 : 1), p = this.bands.breath.g.gain;
      this.breathAt = now + sndRange(7, 9.5);
      _musLast.delete(p);
      p.setTargetAtTime(g, now, 0.9); p.setTargetAtTime(0, now + 2.8, 1.1);
    }
    // its events, and birds in kindled land by day, thunder in a storm
    const evs = B.ev.slice();
    if (st.day && st.bed !== 'hub') evs.push(['chirp', 4, 12, 0.5]);
    if (st.storm) evs.push(MUS_RAIN.ev);
    for (const [kind, lo, hi, g0] of evs) {
      if (this.nextEv[kind] === undefined) this.nextEv[kind] = now + sndRange(lo, hi);
      if (now < this.nextEv[kind]) continue;
      this.nextEv[kind] = now + sndRange(lo, hi);
      let g = g0 * k * X.events, pan = sndRange(-0.6, 0.6);
      // the forge's fire is where the forge is
      if (kind === 'fire') { const w = S.where(musForgeAt()); g = g0 * X.events * w.g; pan = w.pan; }
      if (kind === 'tick' || kind === 'chirp') g = g0 * X.events;
      if (g < 0.01) continue;
      const o = S.cueOut(now, g, pan, this.master);
      MUS_EVENTS[kind](S, o, now + sndRand() * 0.1, 1);
      S.cueDone(o);
    }
    for (const kind of Object.keys(this.nextEv)) if (!evs.some((e) => e[0] === kind)) delete this.nextEv[kind];
  },

  // The music dips a moment (a hit, a fall): to k, back after hold.
  duck(t, k, hold) {
    const p = this.master && this.master.gain;
    if (!p) return;
    p.cancelScheduledValues(t);
    p.setTargetAtTime(k, t, 0.04);
    p.setTargetAtTime(1, t + hold, 0.6);
  },
  // A territory kindled: the star's whole chord, for a while.
  lift(t) { this.liftAt = t; },

  // An ore lands in the star (starFeed): tier; rate, ore a second (the
  // altar's hold-to-feed sends one call an ore, up to 160 a second); stream:
  // n ore at once from the menu, heard as a stream as they rise. The hum
  // swells; a ping, higher for the deeper ores, at most every so often
  // (further apart and shorter the faster they come), brighter with rate.
  fed(t, a) {
    const S = this.S, X = T.sound, tier = sndClamp(a.tier || 1, 1, 6), rate = sndClamp(a.rate || 1, 1, 200);
    const n = a.stream ? sndClamp(Math.round(a.n || 1), 1, 24) : 1, fast = sndClamp(rate / 60, 0, 1);
    this.feed = Math.min(1, this.feed + X.feedPer / (1 + rate / 8) + 0.02 * (n - 1));
    if (S.levels.sfx <= 0) return;
    const base = 12 + [0, 2, 4, 7, 9, 12][tier - 1], gap = X.pingGap * (1 + fast);
    for (let i = 0; i < n; i++) {
      const at = t + (n > 1 ? 0.35 + 1.1 * Math.pow(i / n, 0.8) : 0);
      if (at - this.pingAt < gap) continue;
      this.pingAt = at;
      const o = S.cueOut(at, X.ping * (0.75 + 0.35 * fast), sndRange(-0.3, 0.3));
      this.pingStep = (this.pingStep || 0) + 1 + Math.floor(sndRand() * 2);
      sndBell(S, o, at, sndHz(base + [0, 2, 4, 7, 9][this.pingStep % 5]), 0.5, 0.22 - 0.1 * fast, 0.35);
      if (fast > 0.5) sndNoise(S, o, at, { f: 4200, q: 4, a: 0.005, d: 0.03, g: 0.12 * fast });
      S.cueDone(o);
      S.ends.push(o.end);
    }
  },

  // A magnitude reached (starGrow): a bloom of the star's chord, once a
  // magnitude, and its layer comes in under it.
  grow(t0, a) {
    const S = this.S, mag = a.mag || this.state().mag, t = t0 + (a.delay || 0);
    if (mag <= this.bloomed) return;
    this.bloomed = mag; this.magHeard = Math.max(this.magHeard, mag); this.growAt = t; this.magWait = -1;
    this.feed = 1;
    const o = S.cueOut(t, T.sound.bloom, 0, this.master);
    sndSwell(S, o, t, mag >= 5 ? [-12, 0, 4, 7, 14] : [-12, 0, 7, 12], 0.8, 1.1, 1.6, 'warm', 2000, 0.5);
    [12, 16, 19, 24].forEach((s, i) => sndBell(S, o, t + 0.5 + i * 0.22, sndHz(s), 0.35, 1.1, 0.5));
    sndNoise(S, o, t, { ft: 'lowpass', f: 400, f2: 3500, glide: 1.4, a: 0.8, d: 0.7, g: 0.12, send: 0.5 });
    S.cueDone(o);
  },

  // What the game doesn't call itself: footsteps, a heartbeat, a channel's
  // tone, stings, landers.
  listen(now) {
    const d = typeof Game !== 'undefined' && Game.dive, X = T.sound;
    const C = this.chan, ch = d && !Game.modal && d.channel;
    musSet(C.out.gain, ch ? X.channel : 0, now, ch ? 0.15 : 0.08);
    if (ch) musSet(C.oscs[0].frequency, sndHz(-5) * (1 + sndClamp(ch.t / ch.max, 0, 1)), now, 0.1);
    if (!d || Game.modal) { this.stepHalf = -1; return; }
    // a footstep each time a heel comes down (the walk's own phase, diver.js)
    const A = d.kAnim;
    if (A && A.walk > 0 && !(d.p.dashT > 0) && !(d.dying > 0)) {
      const half = Math.floor(A.ph * 2);
      // (the ground under the foot coming down, ahead of the body's middle)
      if (this.stepHalf >= 0 && half !== this.stepHalf) { const k = T.sound.stepAhead; snd('step', { ground: sndGroundAt(d, d.p.x + Math.cos(A.ang) * k, d.p.y + Math.sin(A.ang) * k), foot: half }); }
      this.stepHalf = half;
    } else this.stepHalf = -1;
    if (d.hub) return;
    const p = d.p, hp = p.hp / d.stats.maxHp;
    if (!(d.dying > 0) && hp > 0 && hp < X.lowHp && now >= this.heartAt) { snd('heart'); this.heartAt = now + (hp < X.lowHp / 2 ? 0.7 : 0.95); }
    // something big comes into view: a sting, once for each
    if (now >= this.stingAt) {
      this.stingAt = now + 0.25;
      for (const e of d.enemies) {
        if (e.dead || e.hid || !(e.elite || e.boss || e.type === 'hollow') || this.seen.has(e) || dist(e.x, e.y, p.x, p.y) > X.stingR) continue;
        this.seen.add(e);
        snd('sting', { kind: e.type === 'hollow' ? 'hollow' : e.boss ? 'boss' : 'elite' });
        break;
      }
    }
  },
};

// Where the outpost's forge stands (world px), at home.
function musForgeAt() {
  const d = typeof Game !== 'undefined' && Game.dive, f = null;
  return f ? { x: (f.x + 0.5) * TILE, y: (f.y + 0.5) * TILE } : { x: 1e9, y: 1e9 };
}
