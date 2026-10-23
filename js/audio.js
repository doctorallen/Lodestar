'use strict';
// ---------------------------------------------------------------------------
// Sound, made in code with Web Audio: nothing is loaded. This file is the
// engine and the effects; the music and each place's own sound are in
// music.js; the fight's sounds and the footsteps are layered and rendered
// ahead while the game loads (sndbank.js), and played here as buffers.
//
// snd(name, opts) plays a named cue (SND_CUES). A name it doesn't know
// does nothing, and nothing plays or throws before the first tap, when the
// browser lets a page make sound. Cues with opts.x, opts.y (world px) are
// quieter further from the Kindler and panned towards where they are. Each
// cue has a least gap between plays, and only T.sound.voices play at once
// (the important ones always play). Sound never touches the game: it only
// reads it, and its variation comes from its own generator (sndRand), never
// the game's.
//
// The chain: the effects' and the music's buses, an echo they both send to
// (the space), then a high pass under what a phone speaker can play, a low
// pass over 9 kHz, and a limiter. The settings (music and effects: on,
// soft or off) are kept in the save and set on the pause screen. The page
// hidden, the sound is suspended.
//
// The recipes' numbers (pitches, envelopes, filters) are the sound's own
// design and live here, as the art's palettes live in art.js; the mix and
// how the sound behaves is T.sound.
// ---------------------------------------------------------------------------

// Its own small generator, for the variation in each sound.
let _sndSeed = 0x2545f491;
function sndRand() { _sndSeed ^= _sndSeed << 13; _sndSeed ^= _sndSeed >>> 17; _sndSeed ^= _sndSeed << 5; _sndSeed >>>= 0; return _sndSeed / 4294967296; }
function sndRange(a, b) { return a + (b - a) * sndRand(); }
// A pitch, in semitones from D4 (the star's key is D major).
function sndHz(semi) { return 293.66 * Math.pow(2, semi / 12); }
function sndClamp(v, a, b) { return v < a ? a : v > b ? b : v; }

const Snd = {
  ctx: null, ready: false, failed: false, realtime: false,
  out: null, sfx: null, music: null, space: null, noise: null, waves: {},
  ends: [], last: {}, levels: { music: -1, sfx: -1 },

  // Makes the whole graph on ctx: the page's AudioContext (realtime), or
  // the tests' OfflineAudioContext.
  build(ctx, realtime) {
    const c = ctx;
    this.ctx = c; this.realtime = !!realtime; this.ends = []; this.last = {};
    // the limiter, a low pass over what a phone speaker makes harsh, and a
    // high pass under what it can't play at all
    const lim = c.createDynamicsCompressor();
    lim.threshold.value = -10; lim.knee.value = 6; lim.ratio.value = 10; lim.attack.value = 0.003; lim.release.value = 0.25;
    lim.connect(c.destination);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9000; lp.Q.value = 0.5; lp.connect(lim);
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 80; hp.Q.value = 0.6; hp.connect(lp);
    this.out = c.createGain(); this.out.gain.value = T.sound.master; this.out.connect(hp);
    this.sfx = c.createGain(); this.sfx.gain.value = 0; this.sfx.connect(this.out);
    this.music = c.createGain(); this.music.gain.value = 0; this.music.connect(this.out);
    // what's sent to the space goes through its bus's own level, so a
    // setting quiets its echoes too
    this.space = sndSpace(c, this.out);
    this.sfxSend = c.createGain(); this.sfxSend.gain.value = 0; this.sfxSend.connect(this.space);
    this.musicSend = c.createGain(); this.musicSend.gain.value = 0; this.musicSend.connect(this.space);
    // a second of white noise, looped by every noisy sound
    const n = c.sampleRate * 2, buf = c.createBuffer(1, n, c.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = sndRand() * 2 - 1;
    this.noise = buf;
    this.waves = sndWaves(c);
    this.levels = { music: -1, sfx: -1 };
    this.applyLevels(true);
    this.ready = true;
  },

  // A setting's level: 1 on, T.sound.soft soft, 0 off (on unless set).
  level(kind) {
    const s = typeof Save !== 'undefined' && Save.data && Save.data.settings;
    const v = s ? s[kind] : undefined;
    return v === undefined || v === true ? 1 : v === false ? 0 : sndClamp(+v || 0, 0, 1);
  },
  wanted() { return this.level('music') > 0 || this.level('sfx') > 0; },
  applyLevels(now) {
    if (!this.ctx) return;
    const m = this.level('music'), e = this.level('sfx'), t = this.ctx.currentTime;
    if (m !== this.levels.music) { for (const b of [this.music, this.musicSend]) b.gain.setTargetAtTime(m * T.sound.music, t, now ? 0.001 : 0.3); this.levels.music = m; }
    if (e !== this.levels.sfx) { for (const b of [this.sfx, this.sfxSend]) b.gain.setTargetAtTime(e * T.sound.sfx, t, now ? 0.001 : 0.05); this.levels.sfx = e; }
    // nothing wanted: the context sleeps, and costs nothing
    if (this.realtime && this.ctx.state !== 'closed' && typeof document !== 'undefined') {
      if (!this.wanted()) sndQuiet(this.ctx.suspend());
      else if (!document.hidden && this.ctx.state !== 'running') sndQuiet(this.ctx.resume());
    }
  },

  // A cue's voices meet in one node, its level and its pan, and leave
  // through the effects' bus, or the music's (and the space, through the
  // same bus's send, if any of them send).
  cueOut(t, g, pan, bus) {
    const c = this.ctx, node = c.createGain(), b = bus || this.sfx;
    node.gain.value = g;
    let last = node;
    if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; node.connect(p); last = p; }
    last.connect(b);
    return { node, last, send: null, sendTo: b === this.sfx ? this.sfxSend : this.musicSend, level: g, srcs: [], end: t, pan };
  },
  // Cut a finished cue loose once its last voice is done.
  cueDone(o) {
    let tail = null;
    for (const s of o.srcs) if (!tail || s.stopAt > tail.stopAt) tail = s;
    if (tail) tail.onended = () => { try { o.node.disconnect(); if (o.extra) o.extra.disconnect(); if (o.last !== o.node) o.last.disconnect(); if (o.send) o.send.disconnect(); } catch (e) { /* already loose */ } };
  },

  // Where a cue is heard from: { g, pan }, by its distance from the Kindler.
  where(o) {
    if (o.x === undefined || typeof Game === 'undefined' || !Game.dive) return { g: 1, pan: 0 };
    const p = Game.dive.p, dx = o.x - p.x, dy = o.y - p.y, m = Math.hypot(dx, dy), N = T.sound.near;
    const k = m <= N[0] ? 1 : m >= N[1] ? 0 : 1 - (m - N[0]) / (N[1] - N[0]);
    return { g: k * k, pan: sndClamp(dx / T.sound.panW, -T.sound.panMax, T.sound.panMax) };
  },

  // Plays cue `name` at `when` (now, if not given). Returns whether it played.
  play(name, opts, when) {
    const cue = SND_CUES[name];
    if (!cue || !this.ready) return false;
    const o = opts || {}, now = this.ctx.currentTime, t = Math.max(now, when || now);
    // the music's own moments are the music's, whatever the effects' setting
    if (cue.music) { cue.fn(this, null, t, o); return true; }
    if (this.levels.sfx <= 0) return false;
    if (t - (this.last[name] === undefined ? -99 : this.last[name]) < (cue.gap === undefined ? T.sound.gap : cue.gap)) return false;
    this.ends = this.ends.filter((e) => e > t);
    if (this.ends.length >= T.sound.voices && !cue.pri) return false;
    const parts = cue.bank ? cue.bank(o) : null;
    if (parts && !SndBank.has(parts[0][0])) return false;
    const w = cue.where ? cue.where(o) : this.where(o.x === undefined && cue.at ? cue.at() : o);
    if (w.g < 0.03) return false;
    this.last[name] = t;
    const out = this.cueOut(t, (cue.g || 0.3) * w.g * (o.g || 1), w.pan);
    if (parts) this.playBank(out, t, parts, cue.spread === undefined ? 0.04 : cue.spread, w.rate || 1, cue.lp);
    else cue.fn(this, out, t, o);
    if (cue.also) cue.also(t);
    this.cueDone(out);
    this.ends.push(out.end);
    return true;
  },

  // A cue from the bank (sndbank.js): each part [key, level, delay] a
  // rendered variant, all at one speed a little off true (and through a
  // low pass somewhere in lp [lo, hi], if it has one), so no two plays are
  // the same.
  playBank(out, t, parts, spread, k, lp) {
    const c = this.ctx, rate = k * (1 + sndRange(-spread, spread));
    if (lp) {
      const f = c.createBiquadFilter(), was = out.node;
      f.type = 'lowpass'; f.frequency.value = sndRange(lp[0], lp[1]); f.Q.value = 0.6;
      f.connect(was); out.node = f; out.extra = was;
    }
    for (const [k, g, dt] of parts) {
      if (!SndBank.has(k)) continue;
      const b = SndBank.pick(k), src = c.createBufferSource(), at = t + (dt || 0);
      src.buffer = b; src.playbackRate.value = rate;
      let node = src;
      if (g !== 1) { const gn = c.createGain(); gn.gain.value = g; src.connect(gn); node = gn; }
      node.connect(out.node);
      src.start(at); src.stopAt = at + b.duration / rate;
      out.srcs.push(src); out.end = Math.max(out.end, src.stopAt);
    }
  },

  // Every frame, from the loop: the settings, then the music and what it
  // listens for (music.js).
  tick(dt) {
    if (!this.ready || this.ctx.state !== 'running') return;
    try {
      this.applyLevels(false);
      if (typeof Music !== 'undefined') Music.tick(dt);
    } catch (e) { /* sound never stops the game */ }
  },
};

// Tones with a few soft harmonics, so a low note still sounds on a phone
// without being harsh, made on context c.
// (each made only when it's first wanted on c: making one costs a few ms)
const SND_WAVE_AMPS = {
  warm: [12, (k) => 1 / Math.pow(k, 1.45)],
  hollow: [11, (k) => (k % 2 ? 1 / Math.pow(k, 1.1) : 0.12 / k)],
  reed: [10, (k) => (k === 3 || k === 4 ? 0.7 : 1) / k],
};
function sndWaves(c) {
  const out = {};
  for (const [name, [n, f]] of Object.entries(SND_WAVE_AMPS)) {
    let w = null;
    Object.defineProperty(out, name, { enumerable: true, get() {
      if (!w) { const re = new Float32Array(n + 1), im = new Float32Array(n + 1); for (let k = 1; k <= n; k++) im[k] = f(k); w = c.createPeriodicWave(re, im); }
      return w;
    } });
  }
  return out;
}

// A promise from the context, its rejection ignored (a browser may refuse
// to resume, which isn't an error worth showing).
function sndQuiet(p) { if (p && p.catch) p.catch(() => {}); }

// The space: three delays fed back through a low pass, spread left and
// right, so what's sent to it rings on in a dark room.
function sndSpace(c, dest) {
  const inp = c.createGain(), out = c.createGain();
  inp.gain.value = 1; out.gain.value = T.sound.space;
  out.connect(dest);
  [[0.193, -0.6], [0.311, 0.6], [0.467, 0]].forEach(([dt, pan]) => {
    const dl = c.createDelay(1), lp = c.createBiquadFilter(), fb = c.createGain();
    dl.delayTime.value = dt; lp.type = 'lowpass'; lp.frequency.value = 2200; fb.gain.value = 0.48;
    inp.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl);
    if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; lp.connect(p); p.connect(out); } else lp.connect(out);
  });
  return inp;
}

// ---------------------------------------------------------------------------
// The voices a cue is made of. Each starts at t, rises over `a`, holds for
// `hold`, then dies away with time constant `d`; it's cut once it's
// silent. g: its level within the cue; send: how much goes to the space.
// ---------------------------------------------------------------------------
function sndEnv(p, t, a, g, d, hold) {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(g, t + a);
  if (hold) p.setValueAtTime(g, t + a + hold);
  p.setTargetAtTime(0, t + a + (hold || 0), d);
  return t + a + (hold || 0) + d * 6;
}
function sndVoiceOut(S, o, v, g) {
  g.connect(o.node);
  if (v.send) {
    if (!o.send) { o.send = S.ctx.createGain(); o.send.gain.value = o.level; o.send.connect(o.sendTo); }
    const s = S.ctx.createGain(); s.gain.value = v.send; g.connect(s); s.connect(o.send);
  }
}
// A tone: f (gliding to f2 over glide), w a wave (sine, triangle, square,
// or one of Snd.waves), lp a low pass, vib [rate, Hz] a wobble.
function sndTone(S, o, t, v) {
  const c = S.ctx, osc = c.createOscillator(), g = c.createGain();
  if (S.waves[v.w]) osc.setPeriodicWave(S.waves[v.w]); else osc.type = v.w || 'sine';
  osc.frequency.setValueAtTime(v.f, t);
  if (v.f2) osc.frequency.exponentialRampToValueAtTime(v.f2, t + (v.glide || 0.1));
  if (v.det) osc.detune.value = v.det;
  let node = osc;
  if (v.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = v.lp; f.Q.value = v.q || 0.7; node.connect(f); node = f; }
  node.connect(g);
  const end = sndEnv(g.gain, t, v.a || 0.005, v.g === undefined ? 1 : v.g, v.d || 0.1, v.hold);
  if (v.vib) {
    const lfo = c.createOscillator(), lg = c.createGain();
    lfo.frequency.value = v.vib[0]; lg.gain.value = v.vib[1];
    lfo.connect(lg); lg.connect(osc.frequency); lfo.start(t); lfo.stop(end);
  }
  sndVoiceOut(S, o, v, g);
  osc.start(t); osc.stop(end); osc.stopAt = end;
  o.srcs.push(osc); o.end = Math.max(o.end, end);
  return end;
}
// Noise through a filter: ft its type (bandpass unless said), f its
// frequency (sweeping to f2 over glide), q.
function sndNoise(S, o, t, v) {
  const c = S.ctx, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = S.noise; src.loop = true;
  f.type = v.ft || 'bandpass'; f.Q.value = v.q || 1;
  f.frequency.setValueAtTime(v.f, t);
  if (v.f2) f.frequency.exponentialRampToValueAtTime(v.f2, t + (v.glide || 0.1));
  src.connect(f); f.connect(g);
  const end = sndEnv(g.gain, t, v.a || 0.003, v.g === undefined ? 1 : v.g, v.d || 0.05, v.hold);
  sndVoiceOut(S, o, v, g);
  src.start(t, sndRand() * 1.5); src.stop(end); src.stopAt = end;
  o.srcs.push(src); o.end = Math.max(o.end, end);
  return end;
}
// A struck bell or crystal: a few partials, the higher dying sooner, none
// over 7 kHz.
function sndBell(S, o, t, f, g, d, send) {
  for (const [k, gk, dk] of [[1, 1, 1], [2.76, 0.28, 0.45], [5.4, 0.08, 0.22]]) {
    if (f * k > 7000) break;
    sndTone(S, o, t, { f: f * k, a: 0.002, g: g * gk, d: d * dk, send });
  }
}
// Little clicks of fire or static: n over `spread` s.
function sndCrackle(S, o, t, n, spread, g, f) {
  for (let i = 0; i < n; i++) sndNoise(S, o, t + sndRand() * spread, { f: f * sndRange(0.7, 1.3), q: 3, a: 0.001, d: 0.006, g: g * sndRange(0.4, 1) });
}
// A chord swelling in and dying slowly: semis from D4.
function sndSwell(S, o, t, semis, g, a, d, w = 'warm', lp = 1600, send = 0.3) {
  semis.forEach((s, i) => sndTone(S, o, t, { f: sndHz(s), w, lp, a, d, g: g / Math.sqrt(semis.length), det: (i % 2 ? 4 : -4), send }));
}

// What the Kindler walks on, for footsteps (the bank's step.<material>):
// a clime's ground, else water or ice where he wades. At the outpost it's
// packed earth unless Snd.hubGround(x, y) (world px) says otherwise, for
// the outpost's own paving to set.
const SND_CLIME_GROUND = { badlands: 'dirt', frost: 'snow', cinder: 'ash', bloomfen: 'moss', caverns: 'stone', grotto: 'stone', magma: 'gravel', rootdeep: 'roots', archive: 'stone', temple: 'stone', vault: 'metal' };
function sndGroundAt(d, x, y) {
  if (d.hub) return (Snd.hubGround && Snd.hubGround(x, y)) || 'dirt';
  if (d.wading === HAZ_CODES.pool) return 'water';
  if (d.wading === HAZ_CODES.slick) return 'ice';
  if (d.zone === 'lair') return 'stone';
  return SND_CLIME_GROUND[d.clime] || 'stone';
}

// Loot, by rarity: its notes (semis from D4), how far apart, how long each
// rings, and the space; the best shimmer, and glow under a chord.
const SND_LOOT = {
  common: { notes: [7, 12], step: 0.06, d: 0.12 },
  magic: { notes: [9, 12, 16], step: 0.06, d: 0.16, send: 0.15 },
  rare: { notes: [12, 16, 19], step: 0.07, d: 0.24, send: 0.25 },
  legendary: { notes: [12, 16, 19, 24], step: 0.08, d: 0.4, send: 0.4, shimmer: true, glow: true },
  set: { notes: [12, 14, 19, 26], step: 0.08, d: 0.4, send: 0.4, shimmer: true, glow: true },
  exotic: { notes: [14, 21], step: 0.05, d: 0.28, send: 0.3, shimmer: true },
  relic: { notes: [2, 9], step: 0.09, d: 0.2, send: 0.2, thud: true },
};
function sndLootNotes(S, o, t, L, g = 0.4) {
  L.notes.forEach((n, i) => sndBell(S, o, t + i * L.step, sndHz(n), g * (1 - i * 0.08), L.d, L.send));
  if (L.shimmer) sndNoise(S, o, t, { f: 5000, q: 2, a: 0.05, d: 0.3, g: 0.1, send: 0.4 });
  if (L.glow) sndSwell(S, o, t, [0, 7, 12], 0.25, 0.08, 0.45, 'warm', 1200, 0.3);
  if (L.thud) sndTone(S, o, t, { f: 160, f2: 110, w: 'warm', lp: 700, a: 0.003, d: 0.06, g: 0.6 });
}

// ---------------------------------------------------------------------------
// Each Form's motion, under its element: how loud (the sustained ones less).
const SND_FORM_G = { lance: 0.3, ward: 0.3, orb: 0.35, glaive: 0.4, nova: 0.5, well: 0.6 };

// The cues. g: the cue's level; gap: the least time between two (else
// T.sound.gap); pri: always plays, however many are sounding; music: a
// moment of the music's (music.js), heard whatever the effects' setting.
// fn(S, out, t, opts).
// ---------------------------------------------------------------------------
const SND_CUES = {
  // a screen's button: barely there
  tap: { g: 0.05, gap: 0.04, fn(S, o, t) { sndTone(S, o, t, { f: 1250, a: 0.002, d: 0.018 }); sndNoise(S, o, t, { f: 3000, q: 2, a: 0.001, d: 0.006, g: 0.4 }); } },
  // a footstep: ground (a material: BANK_STEPS), foot (0 left, 1 right),
  // each a little different in pitch, level and brightness
  step: { g: 0.07, gap: 0.1, spread: 0.05, lp: [3500, 7500], bank(a) {
    const k = 'step.' + (BANK['step.' + a.ground] ? a.ground : 'dirt');
    return [[k, BANK[k].g * sndRange(0.75, 1)]];
  }, where: (a) => ({ g: 1, pan: a.foot ? 0.12 : -0.12, rate: a.foot ? 1.01 : 0.99 }) },
  dash: { g: 0.25, gap: 0.15, bank: () => [['dash', 1]] },
  // cutting: tier, the ore's. A burst of the beam's hum, a sizzle where it
  // bites, and a crackle; higher for the deeper ores
  mine: { g: 0.26, gap: 0.08, fn(S, o, t, a) {
    const f = 150 + (a.tier || 1) * 18 + sndRange(-8, 8);
    sndTone(S, o, t, { f, w: 'sawtooth', lp: 1400, a: 0.004, d: 0.11, g: 0.3, vib: [38, 6] });
    sndTone(S, o, t, { f: f * 2.02, w: 'square', lp: 2200, a: 0.004, d: 0.07, g: 0.08 });
    sndNoise(S, o, t, { f: 4200 + (a.tier || 1) * 200, q: 1.2, a: 0.003, d: 0.08, g: 0.55 });
    sndNoise(S, o, t + sndRange(0.01, 0.04), { f: 1500, q: 3, a: 0.001, d: 0.015, g: 0.5 });
  } },
  // the ore breaks: rock crumbling, and a chime higher for the deeper ores
  oreBreak: { g: 0.28, gap: 0.08, pri: true, fn(S, o, t, a) {
    const tier = sndClamp(a.tier || 1, 1, 6), base = 12 + [0, 2, 4, 7, 9, 12][tier - 1], steps = [0, 4, 7];
    sndNoise(S, o, t, { ft: 'lowpass', f: 2400, f2: 350, glide: 0.25, q: 0.8, a: 0.003, d: 0.09, g: 0.75 });
    sndTone(S, o, t, { f: 180, f2: 110, glide: 0.08, w: 'warm', lp: 700, a: 0.002, d: 0.07, g: 0.6 });
    for (let i = 0; i < (tier > 3 ? 3 : 2); i++) sndBell(S, o, t + 0.05 + i * 0.07, sndHz(base + steps[i]), 0.34 - i * 0.05, 0.25 + tier * 0.04, 0.3);
  } },
  // the cutter can't break it, or there's no room
  mineRefuse: { g: 0.18, gap: 0.5, fn(S, o, t) {
    sndTone(S, o, t, { f: 220, f2: 150, glide: 0.06, w: 'warm', lp: 800, a: 0.002, d: 0.05, g: 1 });
    sndNoise(S, o, t, { f: 600, q: 0.8, a: 0.001, d: 0.03, g: 0.8 });
  } },

  // a cast: form, els (its elements), charged, step (an Arc's combo; the
  // third is heavy), res (a resonance). Its Form's motion and its element's
  // character, rendered (sndbank.js).
  cast: { g: 0.42, gap: 0.05, bank(a) {
    const form = a.form || 'spark', el = (a.els && a.els[0]) || 'force';
    const fk = form === 'arc' && a.step === 2 ? 'arcHeavy' : BANK['form.' + form] ? form : 'spark';
    const parts = [['form.' + fk, SND_FORM_G[fk] || 0.55], [BANK['cast.' + el] ? 'cast.' + el : 'cast.force', 0.55]];
    if (a.charged && form !== 'nova') parts.push(['form.charged', 0.5]);
    if (a.res) parts.push(['res', 0.5]);
    return parts;
  } },
  // charge too low to cast
  noCharge: { g: 0.14, gap: 0.35, bank: () => [['noCharge', 1]] },
  // a spell strikes a foe: el, crit, heavy; x, y
  hit: { g: 0.28, gap: 0.045, bank(a) {
    // (a resisted hit is muffled under a dull thud; a weak one cracks)
    const resisted = a.verdict === 'R' || a.verdict === 'I';
    const parts = [[BANK['hit.' + a.el] ? 'hit.' + a.el : 'hit.force', resisted ? 0.45 : 1]];
    if (resisted) parts.push(['hit.resist', 1]);
    else if (a.verdict === 'W') parts.push(['hit.weak', 0.8]);
    if (a.crit) parts.push(['hit.crit', 0.5]);
    if (a.heavy) parts.push(['hit.heavy', 0.7]);
    return parts;
  } },
  // a reaction between elements (Shatter, Conduct, Steam…)
  react: { g: 0.2, gap: 0.15, bank: () => [['react', 1]] },
  // a foe falls: big for a boss
  kill: { g: 0.3, gap: 0.06, bank: (a) => (a.big ? [['kill.big', 1.4]] : [['kill', 1]]) },
  // the Kindler is hurt (the music dips a moment)
  hurt: { g: 0.38, gap: 0.12, pri: true, bank: () => [['hurt', 1]], also(t) { if (typeof Music !== 'undefined') Music.duck(t, 0.55, 0.4); } },
  // low health: a heartbeat (music.js listens for it)
  heart: { g: 0.2, gap: 0.5, pri: true, fn(S, o, t) {
    for (const [dt, g] of [[0, 1], [0.17, 0.65]]) {
      sndTone(S, o, t + dt, { f: 130, f2: 85, glide: 0.08, w: 'warm', lp: 600, a: 0.004, d: 0.06, g });
      sndNoise(S, o, t + dt, { f: 320, q: 1.2, a: 0.004, d: 0.04, g: 1.2 * g });
    }
  } },
  // your light falls below half: the star's two notes, falling away
  lightLow: { g: 0.3, gap: 2, pri: true, fn(S, o, t) {
    sndTone(S, o, t, { f: sndHz(7), w: 'hollow', lp: 1500, a: 0.04, d: 0.5, g: 0.5, send: 0.4 });
    sndTone(S, o, t + 0.45, { f: sndHz(4), w: 'hollow', lp: 1100, a: 0.04, d: 0.8, g: 0.45, send: 0.4 });
    sndNoise(S, o, t, { ft: 'lowpass', f: 500, f2: 250, glide: 1.5, a: 0.4, d: 0.6, g: 0.25 });
  } },
  // your light is out: something is coming
  lightOut: { g: 0.24, gap: 3, pri: true, fn(S, o, t) {
    sndNoise(S, o, t, { ft: 'lowpass', f: 1400, f2: 180, glide: 2, a: 0.6, d: 0.9, g: 0.5, send: 0.3 });
    sndTone(S, o, t, { f: 146.8, w: 'warm', lp: 600, a: 0.8, d: 1, g: 0.4 });
    sndTone(S, o, t, { f: 155.6, w: 'warm', lp: 600, a: 0.8, d: 1, g: 0.4 });
    sndTone(S, o, t + 0.3, { f: 207.7, w: 'hollow', lp: 800, a: 0.6, d: 1, g: 0.25, send: 0.3 });
  } },
  // the Kindler falls: the star's chord, sinking
  death: { g: 0.3, gap: 2, pri: true, fn(S, o, t) {
    for (const s of [0, 4, 7]) sndTone(S, o, t, { f: sndHz(s), f2: sndHz(s - 12), glide: 1.4, w: 'warm', lp: 1300, a: 0.02, d: 0.5, hold: 0.3, g: 0.35, send: 0.4 });
    sndTone(S, o, t, { f: 160, f2: 70, glide: 0.3, w: 'warm', lp: 600, a: 0.003, d: 0.15, g: 0.8 });
    if (typeof Music !== 'undefined') Music.duck(t, 0.2, 2);
  } },

  // picking up ore or parts: a tick that climbs if they come quickly
  pickup: { g: 0.12, gap: 0.05, fn(S, o, t) {
    S.pickRun = t - (S.pickAt || -9) < 0.6 ? Math.min(6, (S.pickRun || 0) + 1) : 0;
    S.pickAt = t;
    sndBell(S, o, t, sndHz(19 + [0, 2, 4, 7, 9, 12, 14][S.pickRun]), 0.5, 0.06);
  } },
  // gear, an exotic or a relic: rarity (or 'exotic', 'relic')
  loot: { g: 0.28, gap: 0.1, pri: true, fn(S, o, t, a) { sndLootNotes(S, o, t, SND_LOOT[a.rarity] || SND_LOOT.common); } },
  blueprint: { g: 0.28, gap: 0.2, pri: true, fn(S, o, t) {
    sndNoise(S, o, t, { f: 3000, q: 0.8, a: 0.01, d: 0.05, g: 0.4 });
    sndNoise(S, o, t + 0.06, { f: 2400, q: 0.8, a: 0.01, d: 0.05, g: 0.3 });
    sndLootNotes(S, o, t + 0.05, SND_LOOT.rare);
  } },
  // a heart-shard: the star's chord, deep and long
  shard: { g: 0.26, gap: 1, pri: true, fn(S, o, t) { sndSwell(S, o, t, [-12, -5, 0, 4, 7], 0.6, 0.2, 1.2, 'warm', 1600, 0.5); sndLootNotes(S, o, t + 0.2, SND_LOOT.legendary, 0.35); } },
  // an echo found: a voice from before, half there
  echo: { g: 0.22, gap: 1, pri: true, fn(S, o, t) {
    sndTone(S, o, t, { f: sndHz(2), w: 'hollow', lp: 1200, vib: [5, 4], a: 0.5, d: 0.25, g: 0.5, send: 0.6 });
    sndTone(S, o, t + 0.2, { f: sndHz(8), w: 'hollow', lp: 1200, vib: [5, 4], a: 0.45, d: 0.35, g: 0.4, send: 0.6 });
    sndNoise(S, o, t, { f: 1200, q: 3, a: 0.6, d: 0.2, g: 0.2, send: 0.5 });
  } },
  // a healing mote
  heal: { g: 0.12, gap: 0.12, bank: () => [['heal', 1]] },
  // a resonance stone
  resStone: { g: 0.28, gap: 0.3, pri: true, fn(S, o, t) { sndLootNotes(S, o, t, SND_LOOT.legendary, 0.35); } },

  // banking at a spire: low, then three notes up
  bank: { g: 0.25, gap: 0.5, pri: true, fn(S, o, t) {
    sndTone(S, o, t, { f: 147, w: 'warm', lp: 900, a: 0.05, d: 0.3, g: 0.6 });
    [0, 7, 12].forEach((s, i) => sndBell(S, o, t + 0.08 + i * 0.1, sndHz(s), 0.4, 0.35, 0.3));
  } },
  // stepping through a portal or off an edge
  portal: { g: 0.26, gap: 0.3, pri: true, fn(S, o, t) {
    sndNoise(S, o, t, { f: 300, f2: 2000, glide: 0.35, q: 1.4, a: 0.12, d: 0.15, g: 0.8, send: 0.3 });
    sndTone(S, o, t, { f: 220, f2: 440, glide: 0.4, w: 'hollow', vib: [7, 6], lp: 1500, a: 0.1, d: 0.15, g: 0.4, send: 0.3 });
  } },
  // travelling between spires: the portal's swirl, and the star's chord
  travel: { g: 0.28, gap: 0.5, pri: true, fn(S, o, t) { SND_CUES.portal.fn(S, o, t); sndSwell(S, o, t + 0.1, [0, 7, 12], 0.4, 0.15, 0.4); } },
  // a channel (banking, lighting, planting…) broken off
  channelBreak: { g: 0.2, gap: 0.3, fn(S, o, t) { sndTone(S, o, t, { f: 520, f2: 260, glide: 0.15, w: 'hollow', lp: 1400, a: 0.004, d: 0.06 }); } },
  // a waystone lit, and all of them burning
  waystone: { g: 0.32, gap: 0.5, pri: true, fn(S, o, t) {
    sndBell(S, o, t, sndHz(0), 0.5, 0.9, 0.5); sndBell(S, o, t + 0.12, sndHz(7), 0.4, 1, 0.5);
    sndNoise(S, o, t, { f: 3000, q: 1.5, a: 0.1, d: 0.3, g: 0.12, send: 0.4 });
  } },
  waystonesBurn: { g: 0.24, gap: 1, pri: true, fn(S, o, t) {
    sndSwell(S, o, t, [0, 4, 7, 12], 0.6, 0.3, 1.1, 'warm', 1800, 0.5);
    [0, 7, 12, 16].forEach((s, i) => sndBell(S, o, t + 0.1 + i * 0.12, sndHz(s), 0.35, 0.6, 0.4));
  } },
  // a territory kindled: the star's chord comes back, and the land wakes
  kindle: { g: 0.25, gap: 2, pri: true, fn(S, o, t) {
    sndSwell(S, o, t, [-12, -5, 0, 4, 7, 14], 0.75, 0.6, 1.8, 'warm', 1800, 0.5);
    [12, 16, 19, 24, 26].forEach((s, i) => sndBell(S, o, t + 0.35 + i * 0.16, sndHz(s), 0.3, 0.7, 0.5));
    sndNoise(S, o, t, { ft: 'lowpass', f: 300, f2: 3000, glide: 1.2, a: 0.5, d: 0.6, g: 0.25, send: 0.4 });
    if (typeof Music !== 'undefined') Music.lift(t);
  } },
  // the beacon planted (calling), and its light landing
  beacon: { g: 0.26, gap: 1, pri: true, fn(S, o, t) { sndTone(S, o, t, { f: sndHz(0), f2: sndHz(12), glide: 0.6, w: 'hollow', lp: 1600, a: 0.05, d: 0.3, g: 0.6, send: 0.4 }); } },
  beaconLand: { g: 0.3, gap: 1, pri: true, fn(S, o, t) { SND_CUES.waystone.fn(S, o, t); sndTone(S, o, t, { f: 150, f2: 90, glide: 0.3, w: 'warm', lp: 600, a: 0.005, d: 0.2, g: 0.6 }); } },
  // a tear sealed, and stepping through one
  seal: { g: 0.3, gap: 1, pri: true, fn(S, o, t) {
    sndNoise(S, o, t, { f: 4000, f2: 600, glide: 0.5, q: 2, a: 0.3, d: 0.1, g: 0.4, send: 0.3 });
    sndBell(S, o, t + 0.35, sndHz(9), 0.45, 0.6, 0.5); sndBell(S, o, t + 0.47, sndHz(14), 0.35, 0.7, 0.5);
  } },
  riftGate: { g: 0.24, gap: 0.5, fn(S, o, t) { sndTone(S, o, t, { f: 700, f2: 300, glide: 0.25, w: 'hollow', vib: [11, 20], lp: 1800, a: 0.02, d: 0.1, g: 0.6, send: 0.3 }); sndNoise(S, o, t, { f: 1800, q: 3, a: 0.02, d: 0.12, g: 0.4 }); } },

  // the storm's strike: a crack, and thunder rolling off
  thunder: { g: 0.55, gap: 1, pri: true, fn(S, o, t) {
    sndNoise(S, o, t, { f: 1500, q: 0.7, a: 0.001, d: 0.04, g: 0.9 });
    sndNoise(S, o, t + 0.02, { ft: 'lowpass', f: 700, f2: 200, glide: 1.5, a: 0.03, d: 0.5, g: 0.9, send: 0.2 });
    sndNoise(S, o, t + 0.4, { ft: 'lowpass', f: 400, f2: 180, glide: 1.2, a: 0.2, d: 0.6, g: 0.5 });
  } },
  // a vent bursting
  vent: { g: 0.3, gap: 0.25, fn(S, o, t) {
    sndNoise(S, o, t, { ft: 'lowpass', f: 300, f2: 1600, glide: 0.1, a: 0.02, d: 0.15, g: 0.8 });
    sndNoise(S, o, t + 0.05, { f: 2600, q: 1, a: 0.03, d: 0.18, g: 0.25 });
  } },

  // the anvil: grade 'perfect', 'good' or 'miss'
  anvil: { g: 0.36, gap: 0.08, pri: true, fn(S, o, t, a) {
    const gr = a.grade, f = gr === 'perfect' ? 660 : gr === 'good' ? 560 : 400, ring = gr === 'perfect' ? 0.5 : gr === 'good' ? 0.25 : 0.05;
    sndTone(S, o, t, { f: 230, f2: 150, glide: 0.05, w: 'warm', lp: 1000, a: 0.001, d: 0.05, g: 0.8 });
    sndNoise(S, o, t, { f: 2500, q: 1, a: 0.001, d: 0.02, g: 0.6 });
    if (gr !== 'miss') for (const [k, g] of [[1, 0.5], [2.76, 0.25], [4.1, 0.1]]) sndTone(S, o, t, { f: f * k, a: 0.001, d: ring * (k > 1 ? 0.5 : 1), g, send: 0.25 });
    else sndNoise(S, o, t, { f: 700, q: 0.8, a: 0.002, d: 0.06, g: 0.9 });
    if (gr === 'perfect') sndCrackle(S, o, t + 0.02, 6, 0.25, 0.3, 4000);
  } },
  // the fire roused for a forging, and the forge station opened
  forgeFire: { g: 0.4, gap: 0.5, fn(S, o, t) {
    sndNoise(S, o, t, { ft: 'lowpass', f: 300, f2: 1400, glide: 0.4, q: 1, a: 0.2, d: 0.25, g: 0.9 });
    sndCrackle(S, o, t + 0.1, 6, 0.6, 0.35, 2000);
  } },
  forgeOpen: { g: 0.3, gap: 1, fn(S, o, t) { sndNoise(S, o, t, { ft: 'lowpass', f: 400, f2: 900, glide: 0.3, a: 0.12, d: 0.2, g: 0.8 }); sndCrackle(S, o, t, 5, 0.5, 0.35, 1800); } },
  // the foundry's press slamming onto hot metal, then a hiss; x, y (else
  // the forge's place at the outpost). Quiet, and fine every second or two.
  forgePress: { g: 0.2, gap: 0.5, at: () => musForgeAt(), fn(S, o, t) {
    sndTone(S, o, t, { f: 190, f2: 105, glide: 0.1, w: 'warm', lp: 900, a: 0.002, d: 0.09, g: 0.8 });
    sndTone(S, o, t, { f: 380, w: 'hollow', lp: 1600, a: 0.001, d: 0.07, g: 0.5 });
    sndTone(S, o, t, { f: 1050, a: 0.001, d: 0.05, g: 0.08 });
    sndNoise(S, o, t, { f: 900, q: 0.7, a: 0.001, d: 0.04, g: 0.8 });
    sndNoise(S, o, t + 0.12, { f: 3400, q: 0.9, a: 0.05, d: 0.25, g: 0.3 });
  } },
  // a relic's seal cracks
  unseal: { g: 0.3, gap: 0.5, pri: true, fn(S, o, t) {
    sndTone(S, o, t, { f: 210, f2: 120, glide: 0.1, w: 'warm', lp: 900, a: 0.002, d: 0.08, g: 0.7 });
    sndNoise(S, o, t, { f: 1800, q: 0.8, a: 0.001, d: 0.06, g: 1 });
    sndCrackle(S, o, t + 0.05, 5, 0.2, 0.4, 2600);
  } },
  // a piece rising in its beam: a swell, then its rarity's notes
  reveal: { g: 0.34, gap: 0.5, pri: true, fn(S, o, t, a) {
    const L = SND_LOOT[a.rarity] || SND_LOOT.common, best = a.rarity === 'legendary' || a.rarity === 'set';
    sndNoise(S, o, t, { ft: 'lowpass', f: 300, f2: best ? 3500 : 2000, glide: 0.5, a: 0.4, d: 0.12, g: 0.4, send: 0.3 });
    sndTone(S, o, t, { f: sndHz(-5), f2: sndHz(0), glide: 0.5, w: 'hollow', lp: 1400, a: 0.4, d: 0.15, g: 0.35, send: 0.3 });
    sndLootNotes(S, o, t + 0.5, L, 0.45);
    if (best) sndSwell(S, o, t + 0.5, [0, 4, 7, 14], 0.3, 0.1, 1.2, 'warm', 1800, 0.5);
  } },

  // something big seen: kind 'elite', 'boss' (a Keeper or the warden) or
  // 'hollow'
  sting: { g: 0.3, gap: 1.5, pri: true, spread: 0.02, bank: (a) => [[a.kind === 'hollow' ? 'sting.hollow' : a.kind === 'boss' ? 'sting.boss' : 'sting.elite', a.kind === 'boss' ? 1.2 : a.kind === 'hollow' ? 0.9 : 0.75]] },
  // the uplink to the Meridian: a carrier, and a few blips
  uplink: { g: 0.22, gap: 1, fn(S, o, t) {
    sndNoise(S, o, t, { f: 1800, q: 1.2, a: 0.02, d: 0.12, hold: 0.2, g: 0.3 });
    [1200, 1500, 1200, 1800].forEach((f, i) => sndTone(S, o, t + 0.12 + i * 0.11, { f, a: 0.003, d: 0.03, hold: 0.04, g: 0.4 }));
  } },
  // a lander coming down: a long roar and the star's chord
  lander: { g: 0.34, gap: 4, pri: true, fn(S, o, t) {
    sndNoise(S, o, t, { ft: 'lowpass', f: 250, f2: 900, glide: 2.5, a: 1.5, d: 0.8, g: 0.6, send: 0.3 });
    sndNoise(S, o, t + 2, { f: 3000, q: 0.6, a: 0.05, d: 0.4, g: 0.15 });
    sndSwell(S, o, t + 1.6, [0, 7, 12, 16], 0.5, 0.4, 1.4);
  } },
  // a line said: Wick's chirp, or the star's own voice
  speak: { g: 0.12, gap: 0.6, fn(S, o, t, a) {
    if (a.style === 'star') { sndSwell(S, o, t, [0, 7, 16], 0.6, 0.3, 0.9, 'hollow', 1800, 0.5); sndBell(S, o, t + 0.3, sndHz(19), 0.3, 0.5, 0.5); }
    else if (a.style === 'wick') { sndTone(S, o, t, { f: 900, f2: 1250, glide: 0.06, w: 'triangle', a: 0.005, d: 0.03, g: 1 }); sndTone(S, o, t + 0.09, { f: 1150, f2: 850, glide: 0.06, w: 'triangle', a: 0.005, d: 0.03, g: 0.8 }); }
  } },

  // The opening (intro.js): rendered ahead like the fight's sounds, one
  // of each (sndbank.js, BANK_INTRO), first while it plays; each at its own
  // speed (no spread), so its chords stay in the music's key.
  // introScene: n, the scene (1-5)
  introScene: { g: 0.2, gap: 0.5, pri: true, spread: 0, bank: (a) => [['intro.scene' + sndClamp(a.n || 1, 1, 5), 1]] },
  // craft: the craft's engine far off in space; else the landing's roar
  introThrust: { g: 0.26, gap: 1, pri: true, spread: 0, bank: (a) => [[a.craft ? 'intro.craft' : 'intro.thrust', 1]] },
  introBeam: { g: 0.1, gap: 1, spread: 0, bank: () => [['intro.beam', 1]] },
  introSite: { g: 0.12, gap: 1, spread: 0, bank: () => [['intro.site', 1]] },
  introTouchdown: { g: 0.2, gap: 0.3, spread: 0.02, bank: () => [['intro.touchdown', 1]] },
  introLock: { g: 0.24, gap: 1, pri: true, spread: 0, bank: () => [['intro.lock', 1]] },
  introStarLit: { g: 0.28, gap: 1, pri: true, spread: 0, bank: () => [['intro.starLit', 1]] },
  introPing: { g: 0.1, gap: 1, spread: 0, bank: () => [['intro.ping', 1]] },
  // skipped: only a soft fall
  introEnd: { g: 0.14, gap: 1, spread: 0, bank: (a) => [[a.skipped ? 'intro.skip' : 'intro.end', a.skipped ? 0.4 : 1]] },

  // the star, fed (the music's moments: music.js)
  starFeedStart: { music: true, fn() { Music.feedHeld = true; } },
  starFeedEnd: { music: true, fn() { Music.feedHeld = false; } },
  starFeed: { music: true, fn(S, o, t, a) { Music.fed(t, a); } },
  starGrow: { music: true, fn(S, o, t, a) { Music.grow(t, a); } },
};

// Whether a cue could sound now: its rendered buffers are ready (a cue
// made live always is). The opening waits for its own (intro.js).
function sndReady(name, opts) {
  const cue = SND_CUES[name];
  if (!cue || !cue.bank || !Snd.ready || typeof SndBank === 'undefined') return true;
  return cue.bank(opts || {}).every(([k]) => SndBank.has(k));
}

// The hook the game calls: a cue by name, never an error, nothing before
// the first tap.
function snd(name, opts) {
  if (!Snd.ready) return;
  try { Snd.play(name, opts); } catch (e) { /* sound never stops the game */ }
}

// The first tap (or key) makes the sound, as browsers ask; later ones wake
// it if the browser put it to sleep.
function sndUnlock() {
  if (Snd.failed) return;
  try {
    if (!Snd.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC || typeof T === 'undefined' || typeof Music === 'undefined') { Snd.failed = !AC; return; }
      let ctx;
      try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { ctx = new AC(); }
      Snd.build(ctx, true);
      Music.build(Snd);
      // the fight's sounds (sndbank.js) are rendered while the game loads,
      // before the tap; if they weren't (no loading, or it failed), they're
      // rendered now, between frames (sooner while the opening plays: it
      // wants its sounds now)
      if (typeof OfflineAudioContext !== 'undefined' && !SndBank.started) SndBank.start(ctx.sampleRate, typeof Intro !== 'undefined' && Intro.on ? 150 : 800).catch(() => {});
      // a moment of silence started inside the tap wakes iOS's output
      const b = ctx.createBufferSource(); b.buffer = ctx.createBuffer(1, 1, ctx.sampleRate); b.connect(ctx.destination); b.start(0);
    }
    if (Snd.ctx.state !== 'running' && !document.hidden && Snd.wanted()) sndQuiet(Snd.ctx.resume());
  } catch (e) { Snd.failed = true; }
}

if (typeof window !== 'undefined' && window.addEventListener && typeof document !== 'undefined' && document.addEventListener) {
  for (const ev of ['pointerdown', 'touchend', 'keydown', 'click']) window.addEventListener(ev, sndUnlock, { capture: true, passive: true });
  // hidden, it sleeps; back, it wakes (if it's wanted)
  document.addEventListener('visibilitychange', () => {
    if (!Snd.ctx) return;
    try { if (document.hidden) sndQuiet(Snd.ctx.suspend()); else if (Snd.wanted()) sndQuiet(Snd.ctx.resume()); } catch (e) { /* nothing to do */ }
  });
  window.addEventListener('pagehide', () => { try { if (Snd.ctx) sndQuiet(Snd.ctx.suspend()); } catch (e) { /* nothing to do */ } });
}
