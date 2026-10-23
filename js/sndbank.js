'use strict';
// ---------------------------------------------------------------------------
// The fight's sounds, rendered ahead (audio.js plays them). Each is built
// from several layers, as a film's are: a sharp transient, a body of
// frequency-modulated or detuned voices with inharmonic partials, a texture
// (crackle, grains, hiss, bubbles), a sub thump with harmonics a phone can
// play, and a short tail through a convolution reverb, all driven through a
// soft saturation. That's too much to build for every hit, so while the
// game loads (loader.js; else after the first tap) each is rendered a few
// times over (BANK_N variants, each a little different) into buffers with
// an OfflineAudioContext, one at a time between frames; a play is then just a buffer, a level, a pan and a
// slightly different speed. Until a sound's buffers are ready it's silent.
//
// The elements each have their own character: Force a concussive pressure
// wave, Shock an arc's snap and crackle, Frost a crystalline shatter and a
// cold hiss, Ember a plasma roar and fizz, Blight a corrosive bubbling hiss.
// The Forms move the air their own way: an Arc sweeps close, a Bolt is a
// discharge, a Lance a beam, an Orb a throb, a Nova a burst, a Well an
// implosion, a Ward a shield rising, a Glaive a whirr.
// ---------------------------------------------------------------------------

// Its rendering rate, at most (a 96 kHz phone renders at 48).
const BANK_RATE = 48000;
// ms between renders, so the game's frames come first.
const BANK_GAP = 40;
// The idle time (ms) a frame must have spare to render a buffer in play.
const BANK_IDLE_MS = 12;

// A soft saturation: tanh, so loud parts round off and gain harmonics.
function bkCurve(k) {
  const n = 1025, a = new Float32Array(n), m = Math.tanh(k); // (odd, so silence stays silent)
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; a[i] = Math.tanh(k * x) / m; }
  return a;
}
// A reverb's impulse: decaying noise, darker as it goes, with a few faint
// metal resonances ringing in it (room: a short hard space; hall: a long one).
function bkImpulse(rate, secs, metal) {
  const n = Math.floor(rate * secs), chs = [new Float32Array(n), new Float32Array(n)];
  const modes = metal ? [431, 1173, 1777, 2390] : [];
  for (let ch = 0; ch < 2; ch++) {
    let lp = 0;
    const d = chs[ch];
    for (let i = 0; i < n; i++) {
      const t = i / rate, env = Math.exp(-t * 6.5 / secs), k = 0.15 + 0.8 * Math.exp(-t * 4 / secs);
      lp += (sndRand() * 2 - 1 - lp) * k;
      let v = lp * env;
      for (let m = 0; m < modes.length; m++) v += Math.sin(2 * Math.PI * modes[m] * (1 + ch * 0.003) * t) * 0.05 * Math.exp(-t * (9 + m * 4));
      d[i] = t < 0.004 ? v * (t / 0.004) : v;
    }
  }
  return chs;
}

// --- the layers (on R, an offline render: { ctx, waves, noise }) -----------
// A carrier frequency-modulated by another at `ratio` times it: index i0
// (in multiples of f) falling to i1 with time constant id. Metal, a
// discharge, a roar, by its ratio and index. trem: [rate, depth].
function bkFM(R, o, t, v) {
  const c = R.ctx, car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), g = c.createGain(), gl = v.glide || 0.1;
  car.frequency.setValueAtTime(v.f, t); mod.frequency.setValueAtTime(v.f * v.ratio, t);
  if (v.f2) { car.frequency.exponentialRampToValueAtTime(v.f2, t + gl); mod.frequency.exponentialRampToValueAtTime(v.f2 * v.ratio, t + gl); }
  mg.gain.setValueAtTime(v.f * v.i0, t); mg.gain.setTargetAtTime(v.f * (v.i1 || 0), t, v.id || 0.05);
  mod.connect(mg); mg.connect(car.frequency);
  let node = car;
  if (v.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = v.lp; f.Q.value = 0.7; node.connect(f); node = f; }
  node = bkTrem(R, node, t, v.trem);
  node.connect(g);
  const end = sndEnv(g.gain, t, v.a || 0.002, v.g === undefined ? 1 : v.g, v.d || 0.1, v.hold);
  sndVoiceOut(R, o, v, g);
  car.start(t); mod.start(t); car.stop(end); mod.stop(end); car.stopAt = end;
  o.srcs.push(car); o.end = Math.max(o.end, end);
}
// A slow or fast swell on whatever passes (a whirr, a throb).
function bkTrem(R, node, t, trem) {
  if (!trem) return node;
  const c = R.ctx, g = c.createGain(), l = c.createOscillator(), lg = c.createGain();
  g.gain.value = 1 - trem[1] / 2; l.frequency.value = trem[0]; lg.gain.value = trem[1] / 2;
  l.connect(lg); lg.connect(g.gain); node.connect(g); l.start(t);
  return g;
}
// Several voices of one wave, spread over `spread` cents, through a filter
// sweeping lp to lp2: a wide, thick tone.
function bkStack(R, o, t, v) {
  const c = R.ctx, f = c.createBiquadFilter(), g = c.createGain(), n = v.n || 3, gl = v.glide || 0.2;
  f.type = 'lowpass'; f.Q.value = v.q || 0.9; f.frequency.setValueAtTime(v.lp, t);
  if (v.lp2) f.frequency.exponentialRampToValueAtTime(v.lp2, t + (v.sweep || 0.2));
  bkTrem(R, f, t, v.trem).connect(g);
  const end = sndEnv(g.gain, t, v.a || 0.01, (v.g === undefined ? 1 : v.g) / Math.sqrt(n), v.d || 0.2, v.hold);
  for (let i = 0; i < n; i++) {
    const osc = c.createOscillator(), k = Math.pow(2, ((n > 1 ? i / (n - 1) : 0.5) - 0.5) * (v.spread || 10) / 1200);
    if (R.waves[v.w]) osc.setPeriodicWave(R.waves[v.w]); else osc.type = v.w || 'sine';
    osc.frequency.setValueAtTime(v.f * k, t);
    if (v.f2) osc.frequency.exponentialRampToValueAtTime(v.f2 * k, t + gl);
    osc.connect(f); osc.start(t); osc.stop(end); osc.stopAt = end; o.srcs.push(osc);
  }
  sndVoiceOut(R, o, v, g);
  o.end = Math.max(o.end, end);
}
// A sub thump, through the saturation so it carries harmonics.
// (A phone plays only its harmonics, so it's kept under the rest, and
// never falls under 45 Hz.)
function bkSub(R, o, t, f, f2, d, g, glide) { sndTone(R, o, t, { f, f2: Math.max(45, f2), glide: glide || 0.08, a: 0.001, d, g: g * 0.6 }); }
// n short pings at random pitches in f [lo, hi] over `spread` s: a crystal,
// bubbles (glide > 1 lifts each), a shimmer.
function bkPings(R, o, t, n, spread, v) {
  for (let i = 0; i < n; i++) {
    const f = sndRange(v.f[0], v.f[1]), at = t + spread * Math.pow(sndRand(), v.shape || 1);
    sndTone(R, o, at, { f, f2: v.glide ? f * v.glide : 0, glide: 0.02, w: v.w, a: v.a || 0.0008, d: sndRange(v.d[0], v.d[1]), g: sndRange(v.g[0], v.g[1]), send: v.send });
  }
}
// n grains of noise, bands in f [lo, hi], over `spread` s, thinning out:
// crackle, fizz, shatter.
function bkGrains(R, o, t, n, spread, v) {
  for (let i = 0; i < n; i++) {
    sndNoise(R, o, t + spread * Math.pow(sndRand(), v.shape || 1.6), { f: sndRange(v.f[0], v.f[1]), q: v.q || 2, a: 0.0004, d: sndRange(v.d[0], v.d[1]), g: sndRange(v.g[0], v.g[1]) });
  }
}
// The crack at the front of a sound.
function bkSnap(R, o, t, g = 1, f = 1800, d = 0.004) { sndNoise(R, o, t, { ft: 'highpass', f, q: 0.7, a: 0.0003, d, g }); }

// Each element's character, as a cast leaves the hand.
const BANK_ELEMENT = {
  force(R, o, t) {
    bkSnap(R, o, t, 0.5, 2500, 0.003);
    sndNoise(R, o, t, { ft: 'lowpass', f: sndRange(2600, 3400), f2: 180, glide: 0.18, q: 0.8, a: 0.001, d: 0.08, g: 1 });
    bkSub(R, o, t, sndRange(82, 96), 42, 0.12, 0.9);
    bkFM(R, o, t, { f: sndRange(100, 118), ratio: 1.41, i0: 3, i1: 0.2, id: 0.04, d: 0.09, g: 0.5, lp: 1800 });
  },
  shock(R, o, t) {
    bkSnap(R, o, t, 1, 2000, 0.003);
    bkGrains(R, o, t, 24, 0.17, { f: [1800, 5200], d: [0.0012, 0.004], g: [0.3, 1] });
    bkFM(R, o, t, { f: sndRange(95, 125), ratio: 3.53, i0: 8, i1: 3, id: 0.15, a: 0.003, d: 0.07, hold: 0.05, g: 0.35, lp: 4200, trem: [sndRange(45, 70), 0.8] });
    bkFM(R, o, t + 0.01, { f: sndRange(1700, 2100), ratio: 0.5, i0: 2, i1: 0.2, id: 0.02, d: 0.03, g: 0.22, lp: 6000 });
  },
  frost(R, o, t) {
    bkSnap(R, o, t, 0.7, 3000, 0.003);
    bkPings(R, o, t, 9, 0.09, { f: [1600, 5200], d: [0.04, 0.2], g: [0.12, 0.35], send: 0.3 });
    bkGrains(R, o, t, 14, 0.1, { f: [3000, 6500], q: 3, d: [0.001, 0.003], g: [0.3, 0.8] });
    sndNoise(R, o, t, { f: 4800, q: 1.2, a: 0.02, d: 0.12, g: 0.3, send: 0.3 });
    bkFM(R, o, t, { f: sndRange(400, 450), ratio: 2.76, i0: 2, i1: 0.3, id: 0.03, d: 0.07, g: 0.4 });
  },
  ember(R, o, t) {
    bkSnap(R, o, t, 0.4, 1500, 0.004);
    sndNoise(R, o, t, { ft: 'lowpass', f: 300, f2: sndRange(2300, 2900), glide: 0.07, q: 1.4, a: 0.01, d: 0.13, g: 1.1 });
    bkFM(R, o, t, { f: sndRange(68, 80), ratio: 1.007, i0: 14, i1: 4, id: 0.12, a: 0.01, d: 0.12, g: 0.45, lp: 2500 });
    bkGrains(R, o, t + 0.02, 30, 0.26, { f: [2500, 6000], q: 1, d: [0.0015, 0.003], g: [0.1, 0.3], shape: 1.2 });
    bkSub(R, o, t, 75, 50, 0.08, 0.5);
  },
  blight(R, o, t) {
    sndNoise(R, o, t, { ft: 'lowpass', f: 1500, a: 0.001, d: 0.01, g: 0.6 });
    sndNoise(R, o, t, { f: 3500, q: 0.8, a: 0.02, d: 0.15, g: 0.4 });
    bkPings(R, o, t, 11, 0.3, { f: [280, 900], glide: 1.5, d: [0.015, 0.04], g: [0.3, 0.6], shape: 1.2 });
    bkFM(R, o, t, { f: sndRange(130, 150), ratio: 0.51, i0: 5, i1: 1, id: 0.08, a: 0.005, d: 0.12, g: 0.4, lp: 1200 });
  },
};
// The same, smaller, on a foe struck: the struck metal and its element.
function bkImpact(R, o, t, k = 1) {
  bkSnap(R, o, t, 1, 1800, 0.003);
  bkFM(R, o, t, { f: sndRange(170, 230) * k, ratio: sndRange(1.37, 1.47), i0: 4, i1: 0.3, id: 0.03, d: 0.06, g: 0.55, lp: 3500 });
  bkSub(R, o, t, 95 * k, 55, 0.05, 0.5);
}
const BANK_HIT = {
  force(R, o, t) { bkImpact(R, o, t, 0.85); sndNoise(R, o, t, { ft: 'lowpass', f: 2000, f2: 300, glide: 0.06, a: 0.001, d: 0.05, g: 0.7 }); },
  shock(R, o, t) { bkImpact(R, o, t); bkGrains(R, o, t, 12, 0.07, { f: [2000, 5000], d: [0.001, 0.003], g: [0.4, 1] }); },
  frost(R, o, t) { bkImpact(R, o, t, 1.2); bkPings(R, o, t, 5, 0.04, { f: [2000, 5000], d: [0.03, 0.12], g: [0.15, 0.35] }); bkGrains(R, o, t, 8, 0.05, { f: [3500, 6500], q: 3, d: [0.001, 0.002], g: [0.3, 0.7] }); },
  ember(R, o, t) { bkImpact(R, o, t, 0.9); sndNoise(R, o, t, { ft: 'lowpass', f: 600, f2: 3000, glide: 0.04, q: 1.2, a: 0.003, d: 0.06, g: 0.7 }); bkGrains(R, o, t + 0.02, 12, 0.13, { f: [2500, 5500], q: 1, d: [0.0015, 0.003], g: [0.1, 0.3] }); },
  blight(R, o, t) { bkImpact(R, o, t, 0.9); bkPings(R, o, t, 5, 0.1, { f: [300, 800], glide: 1.5, d: [0.015, 0.03], g: [0.3, 0.5] }); sndNoise(R, o, t, { f: 3500, q: 0.8, a: 0.005, d: 0.08, g: 0.35 }); },
};

// What's rendered: dur (s), ch (channels), verb ('room' or 'hall') and wet,
// drive (the saturation), and fn(R, out, t, variant).
const BANK = {};
for (const el of Object.keys(BANK_ELEMENT)) {
  BANK['cast.' + el] = { dur: 0.7, verb: 'room', wet: 0.2, fn: BANK_ELEMENT[el] };
  BANK['hit.' + el] = { dur: 0.45, verb: 'room', wet: 0.16, fn: BANK_HIT[el] };
}
Object.assign(BANK, {
  // the Forms
  'form.arc': { dur: 0.45, verb: 'room', wet: 0.15, fn(R, o, t) {
    sndNoise(R, o, t, { f: sndRange(320, 380), f2: sndRange(2900, 3400), glide: 0.09, q: 1.6, a: 0.02, d: 0.05, hold: 0.03, g: 1 });
    bkStack(R, o, t, { f: sndRange(205, 230), n: 3, spread: 14, w: 'hollow', lp: 500, lp2: 3500, sweep: 0.09, a: 0.015, d: 0.06, g: 0.55 });
  } },
  'form.arcHeavy': { dur: 0.7, verb: 'room', wet: 0.2, drive: 2, fn(R, o, t) {
    sndNoise(R, o, t, { f: sndRange(240, 290), f2: sndRange(2300, 2700), glide: 0.12, q: 1.4, a: 0.025, d: 0.07, hold: 0.04, g: 1 });
    bkStack(R, o, t, { f: sndRange(150, 170), n: 4, spread: 18, w: 'hollow', lp: 400, lp2: 2800, sweep: 0.12, a: 0.02, d: 0.09, g: 0.6 });
    bkSub(R, o, t + 0.05, 72, 40, 0.12, 0.9);
  } },
  'form.glaive': { dur: 0.6, verb: 'room', wet: 0.15, fn(R, o, t) {
    bkStack(R, o, t, { f: sndRange(280, 320), n: 3, spread: 20, w: 'hollow', lp: 2200, a: 0.03, d: 0.12, hold: 0.12, g: 0.6, trem: [sndRange(24, 30), 0.9] });
    sndNoise(R, o, t, { f: 1500, q: 1.8, a: 0.03, d: 0.1, hold: 0.1, g: 0.5 });
  } },
  'form.bolt': { dur: 0.55, verb: 'room', wet: 0.22, fn(R, o, t) {
    bkSnap(R, o, t, 1, 1500, 0.004);
    bkFM(R, o, t, { f: sndRange(520, 600), f2: sndRange(380, 420), glide: 0.12, ratio: 2.41, i0: 6, i1: 0.5, id: 0.03, d: 0.06, g: 0.6, lp: 5000 });
    sndNoise(R, o, t, { f: 2400, q: 0.8, a: 0.0005, d: 0.012, g: 0.7 });
  } },
  'form.lance': { dur: 0.75, verb: 'room', wet: 0.22, fn(R, o, t) {
    sndTone(R, o, t, { f: 2400, f2: 3400, glide: 0.06, a: 0.02, d: 0.02, g: 0.06 });
    bkSnap(R, o, t + 0.05, 1, 1800, 0.004);
    bkStack(R, o, t + 0.05, { f: sndRange(320, 340), n: 4, spread: 9, w: 'hollow', lp: 3200, a: 0.004, d: 0.08, hold: 0.18, g: 0.45 });
    bkFM(R, o, t + 0.05, { f: sndRange(650, 670), ratio: 1.5, i0: 3, i1: 1, id: 0.1, a: 0.004, d: 0.08, hold: 0.18, g: 0.3, lp: 3200 });
    sndNoise(R, o, t + 0.05, { f: 1200, q: 0.7, a: 0.004, d: 0.06, hold: 0.18, g: 0.3 });
  } },
  'form.orb': { dur: 0.7, verb: 'room', wet: 0.2, fn(R, o, t) {
    bkFM(R, o, t, { f: sndRange(140, 160), ratio: 2, i0: 4, i1: 2, id: 0.2, a: 0.04, d: 0.15, hold: 0.12, g: 0.6, lp: 1400, trem: [9, 0.6] });
    bkSub(R, o, t, 90, 70, 0.12, 0.3);
  } },
  'form.nova': { dur: 1.1, verb: 'room', wet: 0.35, drive: 2, fn(R, o, t) {
    bkSnap(R, o, t, 1, 1200, 0.005);
    bkSub(R, o, t, 75, 38, 0.22, 1, 0.25);
    sndNoise(R, o, t, { ft: 'lowpass', f: 7000, f2: 250, glide: 0.45, q: 0.7, a: 0.002, d: 0.18, g: 1 });
    bkFM(R, o, t, { f: sndRange(170, 190), ratio: 1.414, i0: 5, i1: 0.5, id: 0.1, d: 0.25, g: 0.35, lp: 2500 });
    bkGrains(R, o, t, 18, 0.3, { f: [1500, 4500], d: [0.0015, 0.004], g: [0.15, 0.4] });
  } },
  'form.well': { dur: 0.75, verb: 'room', wet: 0.2, fn(R, o, t) {
    sndNoise(R, o, t, { ft: 'lowpass', f: 200, f2: 2400, glide: 0.25, q: 1.2, a: 0.25, d: 0.02, g: 0.8 });
    bkFM(R, o, t, { f: 160, f2: 70, glide: 0.35, ratio: 0.5, i0: 4, i1: 1, id: 0.15, a: 0.05, d: 0.15, g: 0.5, lp: 900 });
    bkSub(R, o, t + 0.26, 70, 40, 0.1, 0.8);
    sndNoise(R, o, t + 0.26, { ft: 'lowpass', f: 1200, a: 0.001, d: 0.02, g: 0.5 });
  } },
  'form.ward': { dur: 0.75, verb: 'room', wet: 0.3, fn(R, o, t) {
    bkStack(R, o, t, { f: sndRange(215, 225), n: 4, spread: 10, w: 'hollow', lp: 400, lp2: 4000, sweep: 0.25, a: 0.08, d: 0.25, g: 0.5 });
    bkPings(R, o, t + 0.05, 6, 0.2, { f: [1400, 3200], d: [0.1, 0.25], g: [0.1, 0.2], send: 0.4 });
    bkFM(R, o, t, { f: 110, ratio: 3, i0: 2, i1: 2, a: 0.1, d: 0.3, g: 0.25 });
  } },
  'form.spark': { dur: 0.3, verb: 'room', wet: 0.15, fn(R, o, t) {
    bkSnap(R, o, t, 0.8, 2500, 0.003);
    bkFM(R, o, t, { f: sndRange(850, 950), ratio: 3.1, i0: 3, i1: 0, id: 0.015, d: 0.03, g: 0.4 });
  } },
  // a charged cast's release, under its Form
  'form.charged': { dur: 0.8, verb: 'room', wet: 0.25, drive: 2, fn(R, o, t) {
    bkSnap(R, o, t, 1, 1400, 0.005);
    sndNoise(R, o, t, { ft: 'lowpass', f: 5000, f2: 300, glide: 0.3, a: 0.002, d: 0.12, g: 0.8 });
    bkSub(R, o, t, 80, 40, 0.15, 0.9);
  } },
  // a resonance: a wide chord over the cast
  res: { dur: 1.9, ch: 2, verb: 'hall', wet: 0.5, fn(R, o, t) {
    for (const [s, g] of [[-12, 0.5], [7, 0.4], [16, 0.3]]) bkStack(R, o, t, { f: sndHz(s), n: 4, spread: 16, w: 'reed', lp: 500, lp2: 3000, sweep: 0.4, a: 0.05, d: 0.45, g });
    bkPings(R, o, t + 0.1, 6, 0.4, { f: [1500, 3500], d: [0.15, 0.4], g: [0.08, 0.15] });
  } },

  // a foe struck: heavy, and a crit's ring, over its element's hit
  'hit.heavy': { dur: 0.55, verb: 'room', wet: 0.2, drive: 2, fn(R, o, t) {
    bkSub(R, o, t, 70, 36, 0.14, 1);
    bkFM(R, o, t, { f: sndRange(115, 125), ratio: 2.73, i0: 6, i1: 0.5, id: 0.05, d: 0.18, g: 0.5, lp: 2500 });
    sndNoise(R, o, t, { ft: 'lowpass', f: 1500, a: 0.001, d: 0.05, g: 0.6 });
  } },
  // a hit turned by what it struck: a dull knock, no ring to it
  'hit.resist': { dur: 0.4, verb: 'room', wet: 0.1, fn(R, o, t) {
    bkSub(R, o, t, 120, 70, 0.09, 0.9);
    bkFM(R, o, t, { f: sndRange(200, 230), ratio: 1.02, i0: 1.5, i1: 0.2, id: 0.04, d: 0.08, g: 0.45, lp: 900 });
    sndNoise(R, o, t, { ft: 'lowpass', f: 700, f2: 250, glide: 0.05, a: 0.001, d: 0.06, g: 0.5 });
  } },
  // a hit on what fears it: a crack, bright and short
  'hit.weak': { dur: 0.45, verb: 'room', wet: 0.25, fn(R, o, t) {
    bkSnap(R, o, t, 0.9, 3200, 0.003);
    bkPings(R, o, t, 2, 0.008, { f: [2400, 3600], d: [0.08, 0.14], g: [0.3, 0.4] });
    bkFM(R, o, t, { f: sndRange(900, 980), ratio: 2.01, i0: 3, i1: 0.3, id: 0.03, d: 0.1, g: 0.35 });
  } },
  'hit.crit': { dur: 0.55, verb: 'room', wet: 0.3, fn(R, o, t) {
    bkSnap(R, o, t, 0.6, 2500, 0.002);
    bkPings(R, o, t, 3, 0.01, { f: [1700, 2600], d: [0.12, 0.2], g: [0.3, 0.4] });
    bkFM(R, o, t, { f: sndRange(1280, 1360), ratio: 1.414, i0: 1, i1: 0.2, id: 0.05, d: 0.15, g: 0.3 });
  } },
  // a foe dissolving; a boss, a long collapse
  kill: { dur: 0.8, verb: 'room', wet: 0.25, fn(R, o, t) {
    sndNoise(R, o, t, { f: 3500, f2: 400, glide: 0.35, q: 1.5, a: 0.005, d: 0.12, g: 0.8 });
    bkGrains(R, o, t, 16, 0.3, { f: [1500, 4000], d: [0.0015, 0.004], g: [0.2, 0.5] });
    bkSub(R, o, t, 90, 50, 0.06, 0.5);
    bkFM(R, o, t, { f: 300, f2: 120, glide: 0.3, ratio: 1.5, i0: 3, i1: 0, id: 0.08, a: 0.004, d: 0.1, g: 0.3, lp: 2000 });
  } },
  'kill.big': { dur: 2.4, ch: 2, verb: 'hall', wet: 0.4, drive: 2, fn(R, o, t) {
    bkSub(R, o, t, 60, 30, 0.45, 1, 0.6);
    sndNoise(R, o, t, { ft: 'lowpass', f: 5000, f2: 150, glide: 1.2, q: 0.7, a: 0.002, d: 0.5, g: 1 });
    bkFM(R, o, t, { f: 90, f2: 55, glide: 1.2, ratio: 2.76, i0: 5, i1: 1, id: 0.3, a: 0.01, d: 0.5, g: 0.5, lp: 1800 });
    bkGrains(R, o, t, 30, 1, { f: [1200, 4000], d: [0.002, 0.005], g: [0.15, 0.4] });
  } },
  // the Kindler's armour struck, the shield buzzing
  hurt: { dur: 0.6, verb: 'room', wet: 0.15, drive: 2, fn(R, o, t) {
    bkSnap(R, o, t, 1, 1200, 0.004);
    bkFM(R, o, t, { f: sndRange(200, 220), ratio: 2.31, i0: 5, i1: 0.5, id: 0.04, d: 0.09, g: 0.6, lp: 3000 });
    bkSub(R, o, t, 85, 45, 0.1, 0.9);
    bkFM(R, o, t + 0.01, { f: 520, ratio: 1.03, i0: 1, i1: 1, d: 0.12, g: 0.2, lp: 2500, trem: [14, 0.9] });
    sndNoise(R, o, t, { ft: 'lowpass', f: 2500, a: 0.001, d: 0.05, g: 0.6 });
  } },
  // the dash: a pneumatic hiss, the air, a servo
  dash: { dur: 0.45, verb: 'room', wet: 0.1, fn(R, o, t) {
    sndNoise(R, o, t, { f: 3500, f2: 1600, glide: 0.12, q: 1.3, a: 0.004, d: 0.06, g: 0.45 });
    sndNoise(R, o, t, { f: 500, f2: 1800, glide: 0.1, q: 1.2, a: 0.03, d: 0.07, g: 0.9 });
    bkFM(R, o, t, { f: sndRange(700, 780), f2: sndRange(1000, 1100), glide: 0.1, ratio: 2, i0: 0.6, i1: 0.3, a: 0.01, d: 0.05, g: 0.1 });
    bkSub(R, o, t, 120, 70, 0.03, 0.3);
  } },
  // two elements meeting: a surge, a crack, a ring
  react: { dur: 1, verb: 'room', wet: 0.35, fn(R, o, t) {
    sndTone(R, o, t, { f: 1800, f2: 3600, glide: 0.1, a: 0.05, d: 0.02, g: 0.06 });
    bkSnap(R, o, t + 0.1, 1, 1500, 0.004);
    bkFM(R, o, t + 0.1, { f: sndRange(860, 900), ratio: 1.5, i0: 2, i1: 0.5, id: 0.06, d: 0.25, g: 0.35 });
    bkPings(R, o, t + 0.1, 4, 0.05, { f: [1200, 3000], d: [0.2, 0.35], g: [0.12, 0.2] });
    bkGrains(R, o, t + 0.1, 10, 0.15, { f: [2000, 4500], d: [0.0015, 0.003], g: [0.2, 0.5] });
  } },
  // not enough charge: a relay's click, a fizzle
  noCharge: { dur: 0.3, fn(R, o, t) {
    bkSnap(R, o, t, 0.6, 2000, 0.002);
    sndTone(R, o, t, { f: 140, a: 0.001, d: 0.01, g: 0.4 });
    bkFM(R, o, t + 0.01, { f: 420, f2: 260, glide: 0.12, ratio: 2.1, i0: 1.5, i1: 0, id: 0.04, d: 0.05, g: 0.3, lp: 1500 });
  } },
  // a healing mote: a soft rising shimmer
  heal: { dur: 0.7, verb: 'room', wet: 0.3, fn(R, o, t) {
    [0, 4, 7, 12].forEach((s, i) => sndTone(R, o, t + i * 0.04, { f: sndHz(s + 12) * sndRange(0.997, 1.003), a: 0.01, d: 0.1, g: 0.25 }));
    sndNoise(R, o, t, { f: 2500, q: 2, a: 0.08, d: 0.1, g: 0.1 });
  } },
  // stings: a low brass swell when something big is first seen
  'sting.elite': { dur: 1.8, ch: 2, verb: 'hall', wet: 0.35, drive: 1.8, fn(R, o, t) {
    bkStack(R, o, t, { f: 146.8, n: 5, spread: 14, w: 'reed', lp: 350, lp2: 2200, sweep: 0.3, a: 0.03, d: 0.25, hold: 0.15, g: 0.9 });
    bkStack(R, o, t + 0.42, { f: 207.7, n: 5, spread: 14, w: 'reed', lp: 350, lp2: 2000, sweep: 0.3, a: 0.03, d: 0.35, hold: 0.15, g: 0.8 });
    bkSub(R, o, t, 73, 60, 0.2, 0.35);
  } },
  'sting.boss': { dur: 3.2, ch: 2, verb: 'hall', wet: 0.5, drive: 2, fn(R, o, t) {
    for (const [f, g] of [[73.4, 0.45], [146.8, 0.8], [220, 0.55]]) bkStack(R, o, t, { f, n: 6, spread: 16, w: 'reed', lp: 300, lp2: 2400, sweep: 0.6, a: 0.05, d: 0.6, hold: 0.5, g });
    bkSub(R, o, t, 55, 45, 0.6, 0.5);
    bkFM(R, o, t + 0.1, { f: 60, f2: 48, glide: 1.5, ratio: 2.76, i0: 4, i1: 1, id: 0.5, a: 0.2, d: 0.6, g: 0.3, lp: 1500 });
  } },
  'sting.hollow': { dur: 3.2, ch: 2, verb: 'hall', wet: 0.45, fn(R, o, t) {
    sndNoise(R, o, t, { ft: 'lowpass', f: 150, f2: 1800, glide: 1.2, q: 1, a: 1.2, d: 0.3, g: 0.8 });
    for (const s of [0, 1, 6]) bkStack(R, o, t + 0.3, { f: sndHz(s), n: 3, spread: 12, w: 'hollow', lp: 600, a: 0.8, d: 0.6, g: 0.45, trem: [0.7, 0.5] });
    bkFM(R, o, t + 0.5, { f: 60, ratio: 7.1, i0: 3, i1: 1, id: 0.6, a: 0.5, d: 0.5, g: 0.15, lp: 1200 });
  } },
});
// Footsteps, by what's underfoot: a heel and then a toe, each material its
// own. g: its level beside the others (sndGroundAt picks the material).
// Rendered at a lower rate: there's nothing in them over 7 kHz.
const BANK_STEPS = {
  // a soft, compressing crunch
  snow(R, o, t) {
    sndNoise(R, o, t, { ft: 'lowpass', f: 420, a: 0.006, d: 0.03, g: 0.5 });
    bkGrains(R, o, t + 0.005, 26, 0.1, { f: [1300, 3600], q: 1.5, d: [0.002, 0.006], g: [0.2, 0.6], shape: 0.8 });
    bkGrains(R, o, t + 0.09, 10, 0.05, { f: [1500, 3200], q: 1.5, d: [0.002, 0.005], g: [0.1, 0.35], shape: 0.8 });
  },
  // packed earth: a dull thud, a little grit
  dirt(R, o, t) {
    sndNoise(R, o, t, { f: sndRange(380, 450), q: 1.1, a: 0.002, d: 0.03, g: 1 });
    sndTone(R, o, t, { f: sndRange(160, 180), f2: 120, glide: 0.03, w: 'warm', a: 0.001, d: 0.02, g: 0.4 });
    bkGrains(R, o, t + 0.004, 5, 0.04, { f: [1800, 3800], q: 2, d: [0.0015, 0.003], g: [0.1, 0.3] });
    sndNoise(R, o, t + 0.07, { ft: 'lowpass', f: 650, a: 0.002, d: 0.018, g: 0.35 });
  },
  // a rattling crunch of stones
  gravel(R, o, t) {
    sndNoise(R, o, t, { ft: 'lowpass', f: 600, a: 0.002, d: 0.025, g: 0.55 });
    bkGrains(R, o, t + 0.003, 22, 0.1, { f: [900, 4200], q: 3, d: [0.002, 0.006], g: [0.25, 0.8], shape: 1.3 });
    bkGrains(R, o, t + 0.075, 12, 0.06, { f: [1000, 4000], q: 3, d: [0.002, 0.005], g: [0.15, 0.5], shape: 1.3 });
  },
  // ash, sand, dust: a soft shush
  ash(R, o, t) {
    sndNoise(R, o, t, { f: sndRange(1500, 2100), q: 0.6, a: 0.02, d: 0.035, hold: 0.025, g: 0.6 });
    sndNoise(R, o, t, { ft: 'lowpass', f: 380, a: 0.004, d: 0.025, g: 0.4 });
    sndNoise(R, o, t + 0.08, { f: sndRange(1800, 2400), q: 0.7, a: 0.015, d: 0.03, g: 0.35 });
  },
  // moss and grass: muffled, a swish of blades
  moss(R, o, t) {
    sndNoise(R, o, t, { ft: 'lowpass', f: 330, a: 0.004, d: 0.035, g: 0.9 });
    sndNoise(R, o, t + 0.01, { f: sndRange(2300, 2900), q: 0.9, a: 0.025, d: 0.04, g: 0.28 });
    bkGrains(R, o, t + 0.02, 6, 0.08, { f: [2500, 4500], q: 4, d: [0.002, 0.004], g: [0.05, 0.15] });
  },
  // a wet squelch, and the mud letting go
  mud(R, o, t) {
    sndNoise(R, o, t, { f: 300, f2: 900, glide: 0.06, q: 4, a: 0.006, d: 0.04, g: 0.9 });
    sndNoise(R, o, t, { ft: 'lowpass', f: 600, a: 0.003, d: 0.03, g: 0.5 });
    bkPings(R, o, t + 0.07, 2, 0.04, { f: [250, 500], glide: 1.6, d: [0.012, 0.025], g: [0.3, 0.5] });
  },
  // stone or flagstone: a hard short tap, heel and toe, a little room
  stone(R, o, t) {
    bkSnap(R, o, t, 0.5, 2000, 0.0025);
    sndNoise(R, o, t, { f: sndRange(1100, 1400), q: 3, a: 0.001, d: 0.015, g: 0.8 });
    sndTone(R, o, t, { f: sndRange(170, 200), a: 0.001, d: 0.015, g: 0.4 });
    bkSnap(R, o, t + 0.055, 0.3, 2200, 0.002);
    sndNoise(R, o, t + 0.055, { f: sndRange(1300, 1600), q: 3, a: 0.001, d: 0.01, g: 0.45 });
  },
  // deck plating: a resonant clank
  metal(R, o, t) {
    bkSnap(R, o, t, 0.5, 2500, 0.002);
    bkFM(R, o, t, { f: sndRange(300, 380), ratio: 2.76, i0: 2, i1: 0.3, id: 0.02, d: 0.06, g: 0.5, lp: 4000 });
    bkPings(R, o, t, 2, 0.003, { f: [1050, 2300], d: [0.04, 0.08], g: [0.12, 0.22] });
    sndNoise(R, o, t + 0.06, { f: 1800, q: 4, a: 0.001, d: 0.012, g: 0.3 });
  },
  // ice: a hard click with a glassy edge
  ice(R, o, t) {
    bkSnap(R, o, t, 0.7, 3000, 0.0018);
    bkPings(R, o, t, 3, 0.006, { f: [2500, 4500], d: [0.015, 0.035], g: [0.12, 0.25] });
    sndTone(R, o, t, { f: 260, a: 0.001, d: 0.01, g: 0.35 });
  },
  // shallow water: a splash, drops, a bubble
  water(R, o, t) {
    sndNoise(R, o, t, { f: sndRange(1000, 1400), q: 0.7, a: 0.008, d: 0.05, g: 0.8 });
    bkGrains(R, o, t + 0.02, 14, 0.13, { f: [1500, 4000], q: 3, d: [0.002, 0.005], g: [0.1, 0.35] });
    bkPings(R, o, t + 0.03, 2, 0.08, { f: [400, 800], glide: 1.5, d: [0.01, 0.02], g: [0.15, 0.3] });
  },
  // boards: a hollow knock
  wood(R, o, t) {
    sndNoise(R, o, t, { f: sndRange(330, 380), q: 8, a: 0.001, d: 0.03, g: 1 });
    sndTone(R, o, t, { f: sndRange(175, 190), a: 0.001, d: 0.03, g: 0.4 });
    bkSnap(R, o, t, 0.25, 2500, 0.002);
  },
  // great roots: a deeper hollow knock, a rustle
  roots(R, o, t) {
    sndNoise(R, o, t, { f: sndRange(290, 340), q: 10, a: 0.002, d: 0.04, g: 1 });
    sndTone(R, o, t, { f: sndRange(170, 190), w: 'warm', a: 0.002, d: 0.035, g: 0.35 });
    bkGrains(R, o, t + 0.02, 6, 0.07, { f: [1800, 3500], q: 2, d: [0.002, 0.004], g: [0.08, 0.2] });
  },
};
const BANK_STEP_G = { snow: 0.9, dirt: 1, gravel: 0.8, ash: 0.75, moss: 0.85, mud: 0.9, stone: 0.9, metal: 0.8, ice: 0.8, water: 1, wood: 0.8, roots: 0.9 };
for (const m of Object.keys(BANK_STEPS)) BANK['step.' + m] = { dur: 0.3, rate: 32000, n: 5, g: BANK_STEP_G[m], verb: m === 'stone' || m === 'metal' ? 'room' : null, wet: 0.12, drive: 1.1, fn: BANK_STEPS[m] };

// The opening's sounds (intro.js; audio.js plays them): long, soft and
// layered, a film's sound more than a game's, each in the hall, once
// (n 1), mono and at half the rate (nothing in them is over 8 kHz). Each
// scene has its chord (in the star's D) and its air; the thrusters are a
// low roar, the survey's beam a slow sweep of filtered air, the cradle's
// lock two muffled clunks and a chime, the star lighting a rising swell of
// its own chord, the modules waking soft chimes. They're rendered first
// while the opening plays, in the order it wants them (BANK_INTRO), and let
// go once it's over.
const BANK_INTRO_CHORDS = [[-12, -5, 2, 7], [-12, -7, -2, 5], [-17, -12, -5, 0], [-12, -3, 4, 9], [-12, 0, 4, 7, 12]];
const bkIntro = (dur, wet, fn) => ({ dur, verb: 'hall', wet, n: 1, rate: 24000, drive: 1.1, fn });
BANK_INTRO_CHORDS.forEach((C, k) => {
  const n = k + 1;
  BANK['intro.scene' + n] = bkIntro(9, 0.45, (R, o, t) => {
    C.forEach((st, i) => bkStack(R, o, t + i * 0.12, { f: sndHz(st), n: 3, spread: 12, w: 'warm', lp: 300, lp2: n === 4 ? 900 : 1500, sweep: 2.5, a: 1.6, hold: 1.8, d: 1.2, g: (n === 5 ? 0.6 : 0.5) / Math.sqrt(C.length), trem: [0.15 + i * 0.07, 0.25] }));
    // the air of the place: space, the planet's thin wind, the ship's hum
    if (n <= 2) sndNoise(R, o, t, { ft: 'lowpass', f: 300, f2: 760, glide: 4, q: 0.6, a: 1.8, hold: 2.5, d: 1.2, g: 0.3 });
    if (n === 3) sndNoise(R, o, t, { f: 420, f2: 300, glide: 5, q: 0.5, a: 1.2, hold: 3, d: 1.2, g: 0.28 });
    if (n === 4) { bkFM(R, o, t, { f: 110, ratio: 1.5, i0: 0.6, i1: 0.3, id: 2, a: 1.2, hold: 4, d: 1.2, g: 0.18, lp: 600, trem: [0.4, 0.3] }); bkPings(R, o, t + 1.6, 3, 2.5, { f: [1500, 2400], d: [0.4, 0.8], g: [0.04, 0.08] }); }
    if (n === 5) sndBell(R, o, t + 0.8, sndHz(12), 0.16, 1.6, 0);
  });
});
Object.assign(BANK, {
  'intro.craft': bkIntro(8, 0.3, (R, o, t) => {
    sndNoise(R, o, t, { ft: 'lowpass', f: 160, f2: 260, glide: 6, a: 1.5, hold: 4, d: 1.2, g: 0.5 });
    bkStack(R, o, t, { f: 55, n: 3, spread: 18, w: 'warm', lp: 240, a: 1.5, hold: 4, d: 1.2, g: 0.4, trem: [0.6, 0.2] });
  }),
  'intro.thrust': bkIntro(8, 0.25, (R, o, t) => {
    sndNoise(R, o, t, { ft: 'lowpass', f: 140, f2: 700, glide: 5.5, a: 1.2, hold: 4.5, d: 0.6, g: 0.85 });
    sndNoise(R, o, t + 1, { f: 1200, f2: 2200, glide: 4, q: 0.6, a: 1.5, hold: 3, d: 0.5, g: 0.12 });
    bkFM(R, o, t, { f: 46, f2: 62, glide: 6, ratio: 1.41, i0: 2.5, i1: 1.2, id: 3, lp: 420, a: 1.5, hold: 4, d: 0.6, g: 0.4, trem: [7, 0.15] });
    bkSub(R, o, t + 0.5, 52, 60, 2.5, 0.5, 4);
  }),
  'intro.beam': bkIntro(6, 0.5, (R, o, t) => {
    sndNoise(R, o, t, { f: 500, f2: 2400, glide: 3.6, q: 2.5, a: 0.6, hold: 2.8, d: 0.6, g: 0.6 });
    bkStack(R, o, t, { f: sndHz(9), n: 2, spread: 8, w: 'sine', lp: 2000, a: 0.8, hold: 2.6, d: 0.8, g: 0.25, trem: [5, 0.3] });
    bkPings(R, o, t + 0.6, 6, 3, { f: [1800, 3200], d: [0.08, 0.2], g: [0.03, 0.07] });
  }),
  'intro.site': bkIntro(4, 0.55, (R, o, t) => { sndBell(R, o, t, sndHz(14), 0.35, 0.9, 0); sndBell(R, o, t + 0.22, sndHz(21), 0.3, 1.1, 0); }),
  'intro.touchdown': bkIntro(3, 0.3, (R, o, t) => {
    bkFM(R, o, t, { f: 90, f2: 55, glide: 0.25, ratio: 1.37, i0: 2, i1: 0.2, id: 0.08, lp: 600, a: 0.01, d: 0.22, g: 0.6 });
    bkSub(R, o, t, 70, 48, 0.25, 0.8);
    sndNoise(R, o, t, { ft: 'lowpass', f: 600, f2: 160, glide: 0.5, a: 0.02, d: 0.3, g: 0.6 });
  }),
  'intro.lock': bkIntro(6, 0.45, (R, o, t) => {
    for (const dt of [0, 0.16]) {
      bkFM(R, o, t + dt, { f: 150, f2: 96, glide: 0.06, ratio: 2.41, i0: 3, i1: 0.3, id: 0.02, lp: 1200, a: 0.002, d: 0.07, g: 0.55 });
      sndNoise(R, o, t + dt, { f: 900, q: 1.6, a: 0.002, d: 0.04, g: 0.45 });
    }
    sndBell(R, o, t + 0.45, sndHz(12), 0.3, 1.2, 0);
    sndBell(R, o, t + 0.5, sndHz(19), 0.2, 1.4, 0);
    sndSwell(R, o, t + 0.4, [-12, 0, 7], 0.35, 0.4, 1.4, 'warm', 1100, 0);
  }),
  'intro.starLit': bkIntro(8, 0.5, (R, o, t) => {
    sndNoise(R, o, t, { ft: 'lowpass', f: 200, f2: 2600, glide: 1.8, a: 1.2, d: 0.8, g: 0.3 });
    [-12, 0, 4, 7, 12, 16].forEach((st, i) => bkStack(R, o, t + 0.2 + i * 0.08, { f: sndHz(st), n: 3, spread: 10, w: 'warm', lp: 400, lp2: 2000, sweep: 1.6, a: 1.3, hold: 0.6, d: 1.5, g: 0.32 }));
    bkPings(R, o, t + 1.2, 10, 1.5, { f: [1600, 3600], d: [0.2, 0.5], g: [0.03, 0.08] });
    sndBell(R, o, t + 1.4, sndHz(24), 0.25, 1.6, 0);
  }),
  'intro.ping': bkIntro(5, 0.55, (R, o, t) => { [0, 4, 7, 9, 12, 16, 19].forEach((n, i) => sndBell(R, o, t + i * 0.42, sndHz(n), 0.3 - i * 0.02, 0.7, 0)); }),
  'intro.end': bkIntro(5, 0.45, (R, o, t) => { [0, 7, 12].forEach((st) => bkStack(R, o, t, { f: sndHz(st), n: 3, spread: 10, w: 'warm', lp: 1300, a: 0.3, d: 1.2, g: 0.3 })); }),
  'intro.skip': bkIntro(1.2, 0.2, (R, o, t) => { sndNoise(R, o, t, { ft: 'lowpass', f: 900, f2: 200, glide: 0.4, a: 0.02, d: 0.25, g: 0.4 }); }),
});
const BANK_INTRO = ['intro.scene1', 'intro.craft', 'intro.scene2', 'intro.beam', 'intro.site', 'intro.scene3', 'intro.thrust', 'intro.touchdown', 'intro.lock', 'intro.scene4', 'intro.scene5', 'intro.starLit', 'intro.ping', 'intro.end', 'intro.skip'];

// How many of each to render (BANK_N of the commonest, two of the rest,
// one of the long rare ones), and the order (the commonest first).
const BANK_N = 4;
const BANK_MANY = new Set(['hit.force', 'hit.shock', 'hit.frost', 'hit.ember', 'hit.blight', 'form.arc', 'cast.force', 'cast.shock', 'cast.frost', 'cast.ember', 'cast.blight', 'form.bolt', 'dash', 'kill', 'hurt', 'form.arcHeavy']);
const BANK_ORDER = ['hit.force', 'hit.shock', 'hit.frost', 'hit.ember', 'hit.blight', 'form.arc', 'cast.force', 'cast.shock', 'cast.frost', 'cast.ember', 'cast.blight', 'form.bolt', 'form.spark', 'dash', 'kill', 'hurt', ...Object.keys(BANK_STEPS).map((m) => 'step.' + m), 'hit.heavy', 'hit.crit', 'hit.resist', 'hit.weak', 'form.arcHeavy', 'form.nova', 'form.lance', 'form.orb', 'form.well', 'form.ward', 'form.glaive', 'form.charged', 'react', 'noCharge', 'heal', 'kill.big', 'res', 'sting.elite', 'sting.boss', 'sting.hollow'];

const SndBank = {
  bufs: {}, started: false, done: false, bytes: 0, rate: BANK_RATE, irs: null, noises: null, ms: 0,
  has(k) { const b = this.bufs[k]; return !!(b && b !== 'busy' && b.length); },
  // a variant, not the one just played
  pick(k) {
    const b = this.bufs[k];
    let i = Math.floor(sndRand() * b.length);
    if (b.length > 1 && i === b.last) i = (i + 1) % b.length;
    b.last = i;
    return b[i];
  },
  // Renders everything, a buffer at a time, yielding between them: every
  // sound's first variant (the commonest first), then each one's second,
  // and so on, so each can play as soon as possible. While the game loads
  // (loader.js) that's before any tap: an offline context needs none, and
  // its buffers play in the live one the tap makes (resampled, if its rate
  // differs). Otherwise it starts a moment after the first tap, so the tap
  // itself isn't slowed, with BANK_GAP between buffers.
  // o.pace(k, n): awaited between buffers instead of the gap (the loading's
  // slices). o.enough(): asked once every sound has a variant; true leaves
  // the rest for idle time (idle()). o.intro: the opening's first sounds
  // first (a new game, whose opening plays on the tap).
  async start(rate, wait = 0, o = {}) {
    if (this.started) return;
    this.started = true;
    if (wait) await new Promise((r) => setTimeout(r, wait));
    this.rate = Math.min(BANK_RATE, rate || BANK_RATE);
    const t0 = performance.now(), per = [];
    this.irs = {};
    // (the opening's own first, while it plays; while a new game loads,
    // o.intro, its first scene's, and the rest as it plays)
    if (o.intro) await this.want(BANK_INTRO.slice(0, 2), () => true, o.pace);
    else if (typeof Intro !== 'undefined' && Intro.on) await this.want(BANK_INTRO, () => Intro.on);
    for (const k of BANK_ORDER) {
      const B = BANK[k], n = B.n || (B.dur > 1.5 ? 1 : BANK_MANY.has(k) ? BANK_N : 2);
      this.bufs[k] = this.bufs[k] || [];
      per.push([k, B, n]);
    }
    const q = (this.queue = []);
    for (let v = 0; v < BANK_N + 1; v++) for (const [k, B, n] of per) if (v < n) q.push([k, B, v]);
    this.total = q.length; this.first = per.length; this.made = 0;
    while (q.length) {
      if (this.made >= this.first && o.enough && o.enough()) break;
      await this.renderNext();
      if (o.pace) await o.pace(this.made, this.total);
      else if (q.length) await new Promise((r) => setTimeout(r, BANK_GAP));
    }
    this.ms = performance.now() - t0;
    this.done = !q.length;
  },
  async renderNext() {
    const [k, B, v] = this.queue.shift(), b = await this.renderOne(B, v);
    if (b) { this.bufs[k].push(b); this.bytes += b.length * b.numberOfChannels * 4; }
    this.made++;
  },
  // What the loading left, a buffer at a time, only when it can't be felt:
  // while a screen is open (the world stands still), or when the browser
  // says it's idle with time to spare. On a phone too busy for either, the
  // sounds play their first variants (at a slightly different speed each
  // time) until it isn't.
  idle() {
    if (this.idling || this.done || !this.queue || !this.queue.length) return;
    this.idling = true;
    const ric = typeof requestIdleCallback === 'function';
    const go = async () => {
      await this.renderNext();
      if (!this.queue.length) { this.done = true; this.idling = false; return; }
      wait();
    };
    const wait = () => {
      const free = () => typeof Game !== 'undefined' && (!!Game.modal || !Game.dive);
      if (ric) requestIdleCallback((dl) => (free() || dl.timeRemaining() >= BANK_IDLE_MS ? go() : wait()), { timeout: 1000 });
      else setTimeout(() => (free() ? go() : wait()), 250);
    };
    wait();
  },
  // Renders those of keys not yet rendered, in turn, while still() (the
  // opening's, while it plays); drop lets them go again. pace, if given,
  // is awaited between them instead of the gap.
  async want(keys, still = () => true, pace = null) {
    if (!this.rate || !this.irs) return;
    for (const k of keys) {
      if (!still()) return;
      if (this.has(k) || this.bufs[k] === 'busy') continue;
      this.bufs[k] = 'busy';
      const b = await this.renderOne(BANK[k], 0);
      this.bufs[k] = b ? [b] : [];
      if (b) this.bytes += b.length * b.numberOfChannels * 4;
      if (pace) await pace(0, 0); else await new Promise((r) => setTimeout(r, BANK_GAP));
    }
  },
  drop(keys) {
    for (const k of keys) { const b = this.bufs[k]; if (b && b.length && b !== 'busy') for (const x of b) this.bytes -= x.length * x.numberOfChannels * 4; delete this.bufs[k]; }
  },
  async renderOne(B, v) {
    const rate = Math.min(this.rate, B.rate || this.rate), ch = B.ch || 1, c = new OfflineAudioContext(ch, Math.ceil(B.dur * rate), rate);
    // (a noise buffer kept for each rate)
    const nz = this.noises || (this.noises = {});
    if (!nz[rate]) { const n = rate * 2, nb = c.createBuffer(1, n, rate), d = nb.getChannelData(0); for (let i = 0; i < n; i++) d[i] = sndRand() * 2 - 1; nz[rate] = nb; }
    const R = { ctx: c, waves: sndWaves(c), noise: nz[rate] };
    // the chain: the voices, the saturation, a high pass under the sub's
    // own, a low pass over what a phone makes harsh; the reverb beside it
    const out = c.createGain(), lp = c.createBiquadFilter(), hp = c.createBiquadFilter(), sh = c.createWaveShaper(), dry = c.createGain();
    out.connect(c.destination);
    lp.type = 'lowpass'; lp.frequency.value = 8000; lp.Q.value = 0.5; lp.connect(out);
    hp.type = 'highpass'; hp.frequency.value = 35; hp.connect(lp);
    sh.curve = bkCurve(B.drive || 1.4); sh.oversample = '2x'; sh.connect(hp);
    dry.connect(sh);
    let verbIn = dry;
    if (B.verb) {
      const ir = this.irs[B.verb + rate] || (this.irs[B.verb + rate] = bkImpulse(rate, B.verb === 'room' ? 0.45 : 1.4, B.verb === 'room')), ib = c.createBuffer(2, ir[0].length, rate);
      ib.copyToChannel(ir[0], 0); ib.copyToChannel(ir[1], 1);
      const cv = c.createConvolver(), vl = c.createBiquadFilter(), vg = c.createGain();
      cv.buffer = ib; vl.type = 'lowpass'; vl.frequency.value = 5000; vg.gain.value = B.wet || 0.2;
      verbIn = c.createGain(); verbIn.gain.value = 1; dry.connect(verbIn);
      verbIn.connect(cv); cv.connect(vl); vl.connect(vg); vg.connect(out);
    }
    const o = { node: dry, sendTo: verbIn, level: 1, srcs: [], end: 0, send: null };
    B.fn(R, o, 0.004, v);
    const buf = await c.startRendering();
    return bkTrim(c, buf);
  },
};

// A rendered sound, its peak brought to 1 and its end cut off once it's 46
// dB down (with a short fade).
function bkTrim(c, buf) {
  const chs = [];
  let peak = 0, last = 0;
  for (let k = 0; k < buf.numberOfChannels; k++) { const d = buf.getChannelData(k); chs.push(d); for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; } }
  if (peak < 1e-5) return null;
  for (const d of chs) for (let i = d.length - 1; i > last; i--) if (Math.abs(d[i]) > peak * 5e-3) { last = i; break; }
  const n = Math.min(buf.length, last + 1), fade = Math.floor(buf.sampleRate * 0.03), out = c.createBuffer(chs.length, n, buf.sampleRate);
  chs.forEach((d, k) => { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = (d[i] / peak) * Math.min(1, (n - i) / fade); out.copyToChannel(a, k); });
  return out;
}
