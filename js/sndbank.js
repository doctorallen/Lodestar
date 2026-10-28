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
// The rendering (the queue, the chain, the reverbs' impulses, the trim) is
// Tycho's (Tycho.audio.Bank); the recipes, the reverbs' rooms and the order
// are the sound's own.
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

// --- the layers (on R, an offline render: { ctx, waves, noise }) -----------
// A carrier frequency-modulated by another at `ratio` times it: index i0
// (in multiples of f) falling to i1 with time constant id. Metal, a
// discharge, a roar, by its ratio and index. trem: [rate, depth]. And
// several voices of one wave, spread over `spread` cents, through a filter
// sweeping lp to lp2: a wide, thick tone. (Both Tycho's.)
const bkFM = Tycho.audio.fm, bkStack = Tycho.audio.stack;
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

// The bank (Tycho.audio.Bank). While the game loads (loader.js) it renders
// before any tap: an offline context needs none, and its buffers play in
// the live one the tap makes (resampled, if its rate differs). Otherwise it
// starts a moment after the first tap, so the tap itself isn't slowed, with
// BANK_GAP between buffers. What the loading left is rendered a buffer at
// a time only when it can't be felt (SndBank.idle): while a screen is open
// (the world stands still), or when the browser says it's idle with time to
// spare; on a phone too busy for either, the sounds play their first
// variants (at a slightly different speed each time) until it isn't. The
// opening's own come first while it plays (and while a new game loads, the
// start's `intro`, its first scene's, and the rest as it plays).
const SndBank = new Tycho.audio.Bank({
  recipes: BANK, order: BANK_ORDER, rate: BANK_RATE, gap: BANK_GAP, idleMs: BANK_IDLE_MS, rand: SND_RAND, waves: SND_WAVE_AMPS,
  count: (k, B) => B.n || (B.dur > 1.5 ? 1 : BANK_MANY.has(k) ? BANK_N : 2),
  // the reverbs: a short hard room with a few faint metal resonances
  // ringing in it, and a long hall
  verbs: { room: { secs: 0.45, modes: [431, 1173, 1777, 2390] }, hall: { secs: 1.4 } },
  // the chain: the voices, the saturation, a high pass under the sub's
  // own, a low pass over what a phone makes harsh; the reverb beside it
  chain: { lp: 8000, lpQ: 0.5, hp: 35, drive: 1.4, oversample: '2x', verbLp: 5000, wet: 0.2 },
  // a rendered sound is cut off once it's 46 dB down (with a short fade)
  trim: { floor: 5e-3, fade: 0.03 },
  free: () => typeof Game !== 'undefined' && (!!Game.modal || !Game.dive),
  first: (bank, o) => (o.intro ? bank.want(BANK_INTRO.slice(0, 2), () => true, o.pace) : typeof Intro !== 'undefined' && Intro.on ? bank.want(BANK_INTRO, () => Intro.on) : null),
});
Snd.bank = SndBank;
