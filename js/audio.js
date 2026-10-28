'use strict';
// ---------------------------------------------------------------------------
// Sound, made in code with Web Audio: nothing is loaded. The engine is
// Tycho's (Tycho.audio: vendor/tycho/docs/audio.md); this file is the
// sound's own: the mix, the chain and the space it's built with, the waves,
// and the effects' recipes. The music and each place's own sound are in
// music.js; the fight's sounds and the footsteps are layered and rendered
// ahead while the game loads (sndbank.js), and played here as buffers.
//
// snd(name, opts) plays a named cue (SND_CUES). A name it doesn't know
// does nothing, and nothing plays or throws before the first tap, when the
// browser lets a page make sound. Cues with opts.x, opts.y (world px) are
// quieter further from the Kindler and panned towards where they are. Each
// cue has a least gap between plays, and only T.sound.voices play at once
// (the important ones always play). Sound never touches the game: it only
// reads it, and its variation comes from its own generator (SND_RAND, which
// the engine, the bank and the music share), never the game's.
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
const SND_RAND = new Tycho.audio.Rand(0x2545f491);
function sndRand() { return SND_RAND.next(); }
function sndRange(a, b) { return a + (b - a) * sndRand(); }
// A pitch, in semitones from D4 (the star's key is D major).
const SND_ROOT = 293.66;
function sndHz(semi) { return Tycho.audio.hz(semi, SND_ROOT); }
function sndClamp(v, a, b) { return v < a ? a : v > b ? b : v; }

// Tones with a few soft harmonics, so a low note still sounds on a phone
// without being harsh (each made on a context only when it's first wanted:
// making one costs a few ms).
const SND_WAVE_AMPS = {
  warm: [12, (k) => 1 / Math.pow(k, 1.45)],
  hollow: [11, (k) => (k % 2 ? 1 / Math.pow(k, 1.1) : 0.12 / k)],
  reed: [10, (k) => (k === 3 || k === 4 ? 0.7 : 1) / k],
};

// ---------------------------------------------------------------------------
// The voices a cue is made of (Tycho's). Each starts at t, rises over `a`,
// holds for `hold`, then dies away with time constant `d`; it's cut once
// it's silent. g: its level within the cue; send: how much goes to the
// space. A tone: f (gliding to f2 over glide), w a wave (sine, triangle,
// square, or one of SND_WAVE_AMPS), lp a low pass, vib [rate, Hz] a wobble.
// Noise through a filter: ft its type (bandpass unless said), f its
// frequency (sweeping to f2 over glide), q.
// ---------------------------------------------------------------------------
const sndEnv = Tycho.audio.env, sndVoiceOut = Tycho.audio.voiceOut, sndTone = Tycho.audio.tone, sndNoise = Tycho.audio.noise;
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

// The engine (Tycho.audio.Engine): the chain's and the space's numbers
// are the sound's; the mix is T.sound, read live. A setting's level: 1 on,
// T.sound.soft soft, 0 off (on unless set). Distance is from the Kindler.
const Snd = new Tycho.audio.Engine({
  cues: SND_CUES, mix: T.sound, rand: SND_RAND, waves: SND_WAVE_AMPS, root: SND_ROOT,
  chain: { threshold: -10, knee: 6, ratio: 10, attack: 0.003, release: 0.25, lp: 9000, lpQ: 0.5, hp: 80, hpQ: 0.6 },
  // three delays fed back through a low pass, spread left and right, so
  // what's sent to it rings on in a dark room
  space: { taps: [[0.193, -0.6], [0.311, 0.6], [0.467, 0]], lp: 2200, fb: 0.48 },
  level(kind) { const s = typeof Save !== 'undefined' && Save.data && Save.data.settings; return Tycho.audio.setting(s ? s[kind] : undefined); },
  listener: () => (typeof Game !== 'undefined' && Game.dive ? Game.dive.p : null),
  canStart: () => typeof T !== 'undefined' && typeof Music !== 'undefined',
  // the fight's sounds (sndbank.js) are rendered while the game loads,
  // before the tap; if they weren't (no loading, or it failed), they're
  // rendered now, between frames (sooner while the opening plays: it
  // wants its sounds now)
  onStart(ctx) { if (typeof OfflineAudioContext !== 'undefined' && !SndBank.started) SndBank.start(ctx.sampleRate, typeof Intro !== 'undefined' && Intro.on ? 150 : 800).catch(() => {}); },
});

// Whether a cue could sound now: its rendered buffers are ready (a cue
// made live always is). The opening waits for its own (intro.js).
function sndReady(name, opts) { return Snd.canPlay(name, opts); }

// The hook the game calls: a cue by name, never an error, nothing before
// the first tap.
function snd(name, opts) { Snd.cue(name, opts); }

// The first tap (or key) makes the sound, as browsers ask; later ones wake
// it if the browser put it to sleep. Hidden, it sleeps; back, it wakes (if
// it's wanted).
Snd.listen();
