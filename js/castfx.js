'use strict';
// ---------------------------------------------------------------------------
// How a cast looks (cosmetic only). A spell still fires on the frame of the
// tap; everything here wraps round that instant: the diver's arm thrusts the
// caster at the aim (the pose frames are in diver.js, drawn in render.js), a
// burst flashes at the fist, a rune circle flashes under the feet, motes
// rise round the body; the big spells sweep a ring over
// the ground, push dust away and stir the flora. Bolts leave from the fist,
// trail and shed motes by their element, and burst where they land, leaving
// a mark on the ground that fades. A held charge gathers motes into the
// caster over a growing circle. An Arc sweeps a crescent of light across in
// front; a Glaive's blades turn round the diver; an Orb pulses. Moves leave
// afterimages, and an Echo's recast shows a ghost of the pose.
//
// Everything is drawn in whole art px: rings and glyphs are rasterised
// ellipses (cfxEllipse) painted once into small pictures and kept; motes are
// single dots; fading is in a few hard steps. Randomness is Math.random
// (FX_R), never the dive's generator. Numbers are in T.castFx.
// ---------------------------------------------------------------------------

const CFX = {
  dive: null,
  parts: [], // motes, streaks, sparks, cinders, smoke, ice, dust
  rings: [], // glyphs, sweeps, flashes, bursts
  decals: [], // marks on the ground
  ghosts: [], // afterimages of the diver
  flares: [], // lights that flare and die
  waves: [], // rings that stir the flora as they pass
  origin: null, // where the last cast's fist was, for the bolts it fired
  last: null, // the last cast's aim and hand, for an Echo
  focusAt: { main: null, off: null }, // each focus, from the feet, world px, as drawn
  day: false, // under the sky in daylight, this frame (cfxLight)
  dayLights: [], // the cast's lights this frame, in daylight
};

// Kinds of mote.
const CFX_STREAK = 1, CFX_MOTE = 2, CFX_SPARK = 3, CFX_CINDER = 4, CFX_SMOKE = 5, CFX_ICE = 6, CFX_DUST = 7, CFX_CONV = 8, CFX_DRIP = 9, CFX_GLIM = 10;

// How each element looks, whatever the spell's shape: its colour; the mote
// a bolt of it sheds as it flies (shed) and the ones it bursts into (burst,
// with dark: every other one a dull, unlit bit of it; smoke: a puff with
// them); and the mark it leaves on the ground (decal, cfxDecalPic). No
// element looks like force, in the cast's own colour.
const CFX_ELEMENTS = {
  force: { col: '#e8f4ff', shed: CFX_GLIM, burst: CFX_SPARK, decal: 'arcane' },
  shock: { col: ELEMENT_COLS.shock, shed: CFX_SPARK, burst: CFX_SPARK, decal: 'shock' },
  frost: { col: ELEMENT_COLS.frost, shed: CFX_ICE, burst: CFX_ICE, decal: 'frost' },
  ember: { col: ELEMENT_COLS.ember, shed: CFX_CINDER, burst: CFX_CINDER, smoke: true, decal: 'ember' },
  blight: { col: ELEMENT_COLS.blight, shed: CFX_DRIP, burst: CFX_SPARK, dark: '#4a6a28', decal: 'blight' },
  lode: { col: '#ffd890', shed: CFX_GLIM, burst: CFX_SPARK, decal: 'arcane' },
  rift: { col: '#c060ff', shed: CFX_SPARK, burst: CFX_SPARK, dark: '#3a1a5a', decal: 'arcane' },
};
const cfxEl = (el) => CFX_ELEMENTS[el] || CFX_ELEMENTS.force;
// How a projectile flies, by its Form: a spark wobbles, a lance is a shard
// with a glint, an orb a pulsing ball; the rest are small stars that turn.
const CFX_BOLT_LOOK = { spark: 'wobble', lance: 'lance', orb: 'orb', shard: 'lance' };
// A projectile's colour: its group's (its element's, else its Form's).
const cfxBoltCol = (b) => b.col || (b.element ? cfxEl(b.element).col : CFX_ELEMENTS.force.col);
const cfxBoltEl = (b) => b.element || null;

// The colour a caster casts in: its first group's (castFx's circuitCol).
function castFxCol(item) { return isCaster(item) ? circuitCol(item) : ART.forms.arc; }

// A fade in a few hard steps, from the share of a life left.
const cfxBand = (k) => (k > 0.75 ? 1 : k > 0.5 ? 0.75 : k > 0.25 ? 0.5 : k > 0 ? 0.25 : 0);

function cfxReset(d) {
  CFX.dive = d;
  CFX.parts.length = CFX.rings.length = CFX.decals.length = CFX.ghosts.length = CFX.flares.length = CFX.waves.length = 0;
  CFX.origin = CFX.last = null;
  CFX.focusAt.main = CFX.focusAt.off = null;
}

// A mote, unless there are already as many as allowed (T.castFx.cap).
function cfxPart(k, x, y, vx, vy, t, col, col2, follow) {
  if (CFX.parts.length >= T.castFx.cap) return null;
  const q = { k, x, y, vx, vy, t, max: t, col, col2: col2 || col, f: !!follow, a: 0, r: 0, h: 0, drag: 0, g: 0, id: (Math.random() * 1e6) | 0 };
  CFX.parts.push(q);
  return q;
}

function cfxFlare(x, y, r, i, col, t, follow) {
  if (CFX.flares.length >= T.castFx.flares) CFX.flares.shift();
  CFX.flares.push({ x, y, r, i, c: rgb01(col), t, max: t, f: !!follow });
}

// ---------------------------------------------------------------------------
// The pose: where the fist is, and how the body leans
// ---------------------------------------------------------------------------

// The aim of a cast: the nearest enemy in reach (as castSpell aims), else
// the way the diver faces.
function castFxAim(d) {
  const p = d.p, e = nearestEnemy(d, d.castRange || T.circuits.aimRange);
  return e ? Math.atan2(e.y - 4 - (p.y - 8), e.x - p.x) : Math.atan2(p.fy, p.fx);
}

// The cast pose's sprite for an aim and a hand.
function castFxSprite(a, slot, frame = 0) {
  return Sprites.diverCast ? Sprites.diverCast[facingIndex(Math.cos(a), Math.sin(a))][slot === 'off' ? 1 : 0][frame] : null;
}

// Where the focus is held out in the pose, from the feet, in world px.
function castFxHandRel(a, slot, style) {
  const spr = castFxSprite(a, slot);
  if (!spr) return { x: Math.cos(a) * 6, y: -10 + Math.sin(a) * 4 };
  const reach = (T.castFx.reach[style] || 0) + 1;
  return { x: (spr.castHand.x - spr.ax + Math.cos(a) * reach) / AP, y: (spr.castHand.y - spr.ay + Math.sin(a) * reach) / AP };
}

// How far the body leans into the cast, art px: in while the arm is out,
// back a little as it eases off.
function castFxLean(c) {
  if (c.charging) return { x: 0, y: 0 };
  const L = T.castFx.lean[c.style] || T.castFx.lean.wand, k = 1 - c.t / c.max, th = T.castFx.thrust;
  const s = k < th ? L[0] : k < th + (1 - th) * 0.5 ? -L[1] : 0;
  return { x: Math.round(Math.cos(c.a) * s), y: Math.round(Math.sin(c.a) * s * 0.75) };
}

// ---------------------------------------------------------------------------
// What a cast sets off
// ---------------------------------------------------------------------------

// A focus casts (castFocus): the pose, and the burst round it. kinds: the
// spells it fires.
function castFxStart(d, item, slot, style, charged, kinds) {
  if (CFX.dive !== d) cfxReset(d);
  const p = d.p, C = T.castFx, a = castFxAim(d);
  p.cast = { t: C.pose, max: C.pose, charged, slot, style, a, col: castFxCol(item) };
  const hand = castFxHandRel(a, slot, style), col = p.cast.col, big = charged || kinds.some((k) => (C.shapes[C.shapeOf[k]] || {}).big);
  CFX.origin = { x: hand.x, y: hand.y, t: Game.realT };
  CFX.last = { a, slot, style, col };
  cfxCastBurst(p, a, hand, col, big, charged, style);
  if (charged) cfxSweep(p.x, p.y, 4, 26, col, C.shapes.burst.time, false, C.shapes.burst.dust);
}

// The flash at the fist, the motes it kicks out, the circle under the feet,
// the motes rising round the body.
function cfxCastBurst(p, a, hand, col, big, charged, style, ghost) {
  const C = T.castFx, ca = Math.cos(a), sa = Math.sin(a), n = charged ? 2 : 1;
  CFX.rings.push({ kind: 'flash', x: hand.x, y: hand.y, a, col, t: C.flash[0] * n, max: C.flash[0] * n, f: true, big: charged || style === 'gauntlet' });
  cfxFlare(hand.x, hand.y, C.flash[1] * TILE * (charged ? 1.5 : 1), C.flash[2] * (ghost ? 0.5 : 1), col, C.flash[0] * 1.5, true);
  for (let k = 0; k < C.streaks * n; k++) {
    const b = a + FX_R.f(-0.6, 0.6), s = FX_R.f(C.streakSpeed[0], C.streakSpeed[1]);
    const q = cfxPart(CFX_STREAK, p.x + hand.x, p.y + hand.y, Math.cos(b) * s, Math.sin(b) * s, FX_R.f(0.12, 0.24), k % 3 ? col : '#ffffff', col);
    if (q) q.drag = 7;
  }
  const G = big ? C.glyphBig : C.glyph;
  CFX.rings.push({ kind: 'glyph', x: 0, y: 0, r0: G[0] * (charged ? 1.2 : 1), r1: G[1] * (charged ? 1.3 : 1), col, t: G[2], max: G[2], f: true, rot: FX_R.f(6) | 0, ghost: !!ghost });
  for (let k = 0; k < C.motes * n; k++) {
    const q = cfxPart(CFX_MOTE, 0, 0, 0, 0, C.moteTime * FX_R.f(0.7, 1.2), k % 2 ? col : mix(col, '#ffffff', 0.5), col, true);
    if (q) { q.a = (k / (C.motes * n)) * Math.PI * 2 + FX_R.f(0.4); q.r = FX_R.f(5, 9); q.h = FX_R.f(0, 4); }
  }
  // a gauntlet's punch: a knuckle-ring knocked off the fist
  if (style === 'gauntlet') CFX.rings.push({ kind: 'burst', x: hand.x + ca * 2, y: hand.y + sa * 2, r0: 1, r1: 6, col, t: 0.12, max: 0.12, f: true });
}

// An Echo casts again: a ghost of the pose and its circle, its fist the
// bolts' origin.
function castFxEcho(d) {
  if (CFX.dive !== d || !CFX.last || !Game.dive) return;
  const p = d.p, L = CFX.last, col = ART.glyphs.echo, hand = castFxHandRel(L.a, L.slot, L.style), spr = castFxSprite(L.a, L.slot);
  CFX.origin = { x: hand.x, y: hand.y, t: Game.realT };
  // (over the diver, or the diver would hide it)
  if (spr) CFX.ghosts.push({ spr, x: p.x, y: p.y, col, t: T.castFx.echo, max: T.castFx.echo, alpha: 0.45, over: true });
  cfxCastBurst(p, L.a, hand, mix(L.col, col, 0.5), false, false, L.style, true);
}

// A ring swept over the ground from r0 to r1 (world px), at x, y or round
// the diver (follow); in: drawn inwards. dust: how many motes of dust are
// pushed along with it.
function cfxSweep(x, y, r0, r1, col, t, follow, dust, inward) {
  const d = CFX.dive, p = d && d.p;
  CFX.rings.push({ kind: 'sweep', x: follow ? 0 : x, y: follow ? 0 : y, r0, r1, col, t, max: t, f: !!follow });
  if (!follow) CFX.waves.push({ x, y, r0, r1, t, max: t });
  if (!dust || !d) return;
  const cx = follow ? p.x : x, cy = follow ? p.y : y, f = d.floor, ground = artBiome(f), dc = [mix(ground.floor[2], '#ffffff', 0.18), ground.floor[1]];
  for (let k = 0; k < dust; k++) {
    const a = FX_R.f(Math.PI * 2), s = FX_R.f(40, 90) * (r1 / 40 + 0.4) * (inward ? -1 : 1), r = inward ? r1 * FX_R.f(0.7, 1) : FX_R.f(2, 6);
    const q = cfxPart(CFX_DUST, cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.6, Math.cos(a) * s, Math.sin(a) * s * 0.6, FX_R.f(0.3, 0.5), dc[k % 2]);
    if (q) q.drag = 5;
  }
}

// What a spell does about the diver, by its shape (T.castFx.shapes), in
// its element's look. castSpell calls this for each spell it casts
// (T.castFx.shapeOf says which shape each is); projectiles need nothing
// here, as their flight and landing are drawn from the bolts themselves.
//   shape: 'projectile', 'sweep' (close, in front), 'burst' (round the
//     diver), 'placed' (where it lands), 'move' (the diver goes), 'guard'.
//   element: CFX_ELEMENTS' key, or null; origin: { x, y }, world px; aim:
//     an angle.
//   opts: { r: its reach, world px; inward: it draws in rather than out;
//     col: its colour when it has no element; to: { x, y } where a move
//     ends; cut: a move that cuts through what it passes }.
function castFxFor(shape, element, origin, aim, opts = {}) {
  const d = Game.dive, S = T.castFx.shapes[shape];
  if (!d || !S || shape === 'projectile') return;
  if (CFX.dive !== d) cfxReset(d);
  const E = cfxEl(element), col = element ? E.col : opts.col || E.col, x = origin.x, y = origin.y, r = opts.r || 16;
  if (shape === 'move') { cfxMove(S, col, x, y, opts.to || origin, aim, opts.cut); return; }
  if (shape === 'guard') {
    // the shield draws in round the diver, motes rising off it
    CFX.rings.push({ kind: 'sweep', x: 0, y: -2, r0: S.ring[0], r1: S.ring[1], col, t: S.time, max: S.time, f: true, air: true });
    for (let k = 0; k < S.motes; k++) { const q = cfxPart(CFX_MOTE, 0, 0, 0, 0, T.castFx.moteTime * 1.4, k % 2 ? col : '#ffffff', col, true); if (q) { q.a = (k / S.motes) * Math.PI * 2; q.r = 10; q.h = FX_R.f(2, 10); } }
  } else if (shape === 'sweep') {
    // a crescent of light swept across in front, from one side of the aim
    // to the other; a heavy one wider, thicker and longer, throwing sparks
    const half = Math.acos(clamp(opts.cos === undefined ? 0.3 : opts.cos, -0.6, 0.9)), t = opts.heavy ? S.heavyTime : S.time;
    CFX.rings.push({ kind: 'crescent', x, y, a: aim, half, side: opts.side || 1, r, heavy: !!opts.heavy, col, t, max: t, f: false });
    const n = opts.heavy ? S.sparks : (S.sparks >> 1);
    for (let k = 0; k < n; k++) {
      const b = aim + opts.side * FX_R.f(-half, half) * 0.8, sp = FX_R.f(40, opts.heavy ? 110 : 70);
      const q = cfxPart(E.burst, x + Math.cos(b) * r * 0.8, y - 6 + Math.sin(b) * r * 0.6, Math.cos(b) * sp, Math.sin(b) * sp * 0.75 - 10, FX_R.f(0.12, 0.26), k % 3 ? col : '#ffffff', col);
      if (q) { q.g = E.burst === CFX_CINDER ? -20 : 60; q.drag = 4; }
    }
    if (opts.heavy) CFX.rings.push({ kind: 'burst', x: x + Math.cos(aim) * r * 0.75, y: y - 6 + Math.sin(aim) * r * 0.55, r0: 2, r1: 9, col, t: 0.14, max: 0.14, f: false });
    CFX.waves.push({ x: x + Math.cos(aim) * r * 0.5, y: y + Math.sin(aim) * r * 0.5, r0: 2, r1: r, t, max: t });
    if (S.dust) cfxSweep(x + Math.cos(aim) * r * 0.4, y + Math.sin(aim) * r * 0.3, 2, 3, col, 0.01, false, opts.heavy ? S.dust * 2 : S.dust);
    cfxFlare(x + Math.cos(aim) * r * 0.6, y - 6 + Math.sin(aim) * r * 0.45, r * S.bloom[0] * (opts.heavy ? 1.4 : 1), S.bloom[1] * (opts.heavy ? 1.3 : 1), col, S.bloom[2]);
    return;
  } else {
    const inward = !!opts.inward || shape === 'placed', t = S.time * (r > 50 ? 1.3 : 1);
    cfxSweep(x, y, inward ? r : S.from, inward ? S.from : r, col, t, false, S.dust, inward);
    if (S.glyph) CFX.rings.push({ kind: 'glyph', x, y, r0: r * S.glyph[0], r1: r * S.glyph[1], col, t: S.glyph[2], max: S.glyph[2], f: false, rot: 0 });
    // the element's bits thrown out over the ground
    for (let k = 0; k < (S.scatter || 0); k++) {
      const a = (k / S.scatter) * Math.PI * 2, dk = E.dark && k % 2 === 0, q = cfxPart(E.burst, x + Math.cos(a) * 4, y - 4 + Math.sin(a) * 3, Math.cos(a) * 70, Math.sin(a) * 45 - 20, FX_R.f(0.25, 0.4), dk ? E.dark : col, col);
      if (q) { q.g = E.burst === CFX_CINDER ? -20 : 120; q.dark = dk; }
    }
  }
  cfxFlare(x, y - 6, r * S.bloom[0], S.bloom[1], col, S.bloom[2]);
}

// A move: afterimages along the way, a flash and a pillar of light at each
// end, motes where it went (streaking, if it cut through).
function cfxMove(S, col, x0, y0, to, aim, cut) {
  const x1 = to.x, y1 = to.y, dx = Math.cos(aim), dy = Math.sin(aim), fi = facingIndex(dx, dy), spr = Sprites.diver ? Sprites.diver[fi][0] : null;
  for (let k = 0; k < S.ghosts; k++) {
    const u = k / S.ghosts;
    // the oldest (nearest the start) fade first
    if (spr) CFX.ghosts.push({ spr, x: lerp(x0, x1, u), y: lerp(y0, y1, u), col, t: S.time * (0.5 + u * 0.7), max: S.time * 1.2, alpha: S.alpha });
  }
  for (const [x, y, out] of [[x0, y0, true], [x1, y1, false]]) {
    CFX.rings.push({ kind: 'burst', x, y: y - 10, r0: out ? S.ends[0] : S.ends[1], r1: out ? S.ends[1] : S.ends[0], col, t: S.ends[2], max: S.ends[2], f: false, pillar: true });
    cfxFlare(x, y - 10, TILE * S.bloom[0], S.bloom[1], col, S.bloom[2]);
    for (let k = 0; k < 8; k++) {
      const a = FX_R.f(Math.PI * 2), s = FX_R.f(30, 70);
      cfxPart(CFX_SPARK, x, y - 10, Math.cos(a) * s, Math.sin(a) * s - 10, FX_R.f(0.15, 0.3), k % 2 ? col : '#ffffff');
    }
  }
  const L = dist(x0, y0, x1, y1);
  for (let s = 0; s < L; s += 5) {
    const u = s / (L || 1), q = cfxPart(cut ? CFX_STREAK : CFX_GLIM, lerp(x0, x1, u) + FX_R.f(-2, 2), lerp(y0, y1, u) - FX_R.f(4, 16), dx * (cut ? 60 : 0), dy * (cut ? 60 : 0) - 8, FX_R.f(0.2, 0.35), col);
    if (q) q.drag = 6;
  }
}

// A bolt strikes something (how: 'hit' an enemy, 'wall'); castFxBoltEnd
// when it's gone.
function castFxImpact(b, how) {
  const d = Game.dive;
  if (!d) return;
  if (CFX.dive !== d) cfxReset(d);
  b.cfxHit = how;
  cfxBurst(b.x, b.y, cfxBoltCol(b), b.big ? 1.6 : 1, cfxBoltEl(b));
}

function castFxBoltEnd(b) {
  if (!Game.dive || CFX.dive !== Game.dive) return;
  const el = cfxBoltEl(b);
  if (b.t === 0 && b.cfxHit) cfxDecal(b.x, b.y + 7, cfxEl(el).decal, b.big);
  else cfxBurst(b.x, b.y, cfxBoltCol(b), 0.4, el); // it ran out: a fizzle
}

// Ember's burst where its glob lands; a jump of a chain.
function castFxSpot(x, y, el, size = 1) {
  const d = Game.dive;
  if (!d) return;
  if (CFX.dive !== d) cfxReset(d);
  cfxBurst(x, y, cfxEl(el).col, size, el);
  if (size >= 1) cfxDecal(x, y + 4, cfxEl(el).decal, size > 1.4);
}

// Sparks, a ring and a flare of light where something lands.
function cfxBurst(x, y, col, size, el) {
  const I = T.castFx.impact, n = Math.round(I[0] * size), E = cfxEl(el);
  for (let k = 0; k < n; k++) {
    const a = FX_R.f(Math.PI * 2), s = FX_R.f(30, 80) * Math.sqrt(size), q = cfxPart(E.burst, x, y, Math.cos(a) * s, Math.sin(a) * s - 15, FX_R.f(0.15, 0.3), k % 3 ? col : '#ffffff', col);
    if (q) q.g = E.burst === CFX_CINDER ? -20 : 90;
  }
  if (E.smoke) for (let k = 0; k < 3 * size; k++) { const q = cfxPart(CFX_SMOKE, x + FX_R.f(-3, 3), y, FX_R.f(-8, 8), FX_R.f(-18, -8), FX_R.f(0.4, 0.7), '#2c2622', '#3e3630'); if (q) q.drag = 1; }
  if (size >= 0.6) CFX.rings.push({ kind: 'burst', x, y, r0: 2, r1: 5 + 3 * size, col, t: 0.12, max: 0.12, f: false });
  cfxFlare(x, y, I[1] * TILE * Math.sqrt(size), I[2] * Math.min(1.3, size), col, I[3]);
}

// ---------------------------------------------------------------------------
// Each step
// ---------------------------------------------------------------------------
function updateCastFx(dt) {
  const d = Game.dive;
  if (!d) return;
  if (CFX.dive !== d) cfxReset(d);
  const P = CFX.parts, p = d.p, C = T.castFx;
  // motes
  let n = 0;
  for (let i = 0; i < P.length; i++) {
    const q = P[i];
    if ((q.t -= dt) <= 0) continue;
    if (q.k === CFX_MOTE) { q.a += dt * 5; q.h += dt * 30; q.r = Math.max(2, q.r - dt * 6); }
    else if (q.k === CFX_CONV) {
      // drawn into the focus
      const to = CFX.focusAt[q.slot] || { x: 0, y: -12 }, k = 1 - Math.exp(-dt * 9);
      q.x += (p.x + to.x - q.x) * k; q.y += (p.y + to.y - q.y) * k;
    } else {
      if (q.drag) { const k = Math.exp(-q.drag * dt); q.vx *= k; q.vy *= k; }
      q.vy += q.g * dt;
      q.x += q.vx * dt; q.y += q.vy * dt;
    }
    P[n++] = q;
  }
  P.length = n;
  const tick = (list) => { let m = 0; for (const o of list) if ((o.t -= dt) > 0) list[m++] = o; list.length = m; };
  tick(CFX.rings); tick(CFX.decals); tick(CFX.ghosts); tick(CFX.flares); tick(CFX.waves);
  // bolts: leaving the fist, and what they shed
  const o = CFX.origin, fresh = o && Game.realT - o.t < 0.05;
  for (const b of d.bolts) {
    if (!b.cfx) {
      b.cfx = { ox: fresh ? o.x : 0, oy: fresh ? o.y + 8 : 0, born: Game.realT, emit: 0, n: 0 };
      if (fresh) for (let k = 0; k < 2; k++) {
        const sp = Math.hypot(b.vx, b.vy) || 1, s = FX_R.f(0.3, 0.6), q = cfxPart(CFX_STREAK, p.x + o.x, p.y + o.y, (b.vx / sp) * 90 * s + FX_R.f(-15, 15), (b.vy / sp) * 90 * s + FX_R.f(-15, 15), 0.14, '#ffffff', cfxBoltCol(b));
        if (q) q.drag = 6;
      }
    }
    if ((b.cfx.emit -= dt) > 0) continue;
    b.cfx.emit = C.bolt.every / (b.big ? 2 : 1);
    cfxShed(b.x, b.y, cfxBoltEl(b), cfxBoltCol(b), b.cfx.n++, b.vx, b.vy);
  }
  updateResonanceFx(dt);
  // a caster being charged draws motes in
  for (const slot of ['main', 'off']) {
    const h = p.hands[slot], it = Save.data.equip[slot];
    if (!h.holding || !isCaster(it)) continue;
    const lv = chargeLevel(h);
    if (lv <= 0 || FX_R.f() > C.charge.motes * lv * dt) continue;
    const at = CFX.focusAt[slot] || { x: 0, y: -12 }, a = FX_R.f(Math.PI * 2), r = FX_R.f(14, 22), col = castFxCol(it);
    const q = cfxPart(CFX_CONV, p.x + at.x + Math.cos(a) * r, p.y + at.y + Math.sin(a) * r * 0.7, 0, 0, FX_R.f(0.3, 0.45), FX_R.f() < 0.3 ? '#ffffff' : col, col);
    if (q) q.slot = slot;
  }
}

// What a bolt sheds as it flies, by its element (CFX_ELEMENTS' shed): ice
// that drifts down, cinders and smoke, sparks, drips, or a glimmer left
// hanging in its own colour.
function cfxShed(x, y, el, col, n, vx, vy) {
  const E = cfxEl(el), c = el ? E.col : col;
  switch (E.shed) {
    case CFX_ICE: { const q = cfxPart(CFX_ICE, x + FX_R.f(-1.5, 1.5), y + FX_R.f(-1.5, 1.5), vx * 0.05, 6, FX_R.f(0.3, 0.5), '#ffffff', c); if (q) q.g = 10; break; }
    case CFX_CINDER: { const q = cfxPart(CFX_CINDER, x, y, -vx * 0.08 + FX_R.f(-10, 10), FX_R.f(-30, -15), FX_R.f(0.25, 0.4), '#ffd070', c); if (q) q.g = -10; break; }
    case CFX_SPARK: { const a = FX_R.f(Math.PI * 2); cfxPart(CFX_SPARK, x, y, Math.cos(a) * 45, Math.sin(a) * 45, 0.1, n % 2 ? '#ffffff' : c); break; }
    case CFX_DRIP: { const q = cfxPart(CFX_DRIP, x, y + 1, 0, 8, FX_R.f(0.3, 0.45), c, E.dark || c); if (q) q.g = 70; break; }
    default: cfxPart(CFX_GLIM, x, y, 0, 0, 0.16, c);
  }
  if (E.smoke && n % 2 === 0) { const s = cfxPart(CFX_SMOKE, x, y, FX_R.f(-5, 5), FX_R.f(-14, -6), FX_R.f(0.4, 0.65), '#2c2622', '#3e3630'); if (s) s.drag = 1; }
}

// The flora stirs as a swept ring passes it (floraInView).
function castWaveStir(it) {
  for (const w of CFX.waves) {
    const r = lerp(w.r0, w.r1, 1 - w.t / w.max), m = Math.hypot(it.x - w.x, (it.y - w.y) / 0.6);
    if (Math.abs(m - r) < 8) { it.stir = 1; it.stirDir = (it.x < w.x) === (w.r1 > w.r0) ? -1 : 1; }
  }
}

// ---------------------------------------------------------------------------
// Rings, glyphs and marks, rasterised once and kept
// ---------------------------------------------------------------------------

// The pixels of an ellipse rx × ry art px round its middle (the midpoint
// algorithm, so a line a pixel wide with no doubled steps), each with its
// angle.
const _cfxEll = new Map();
function cfxEllipse(rx, ry) {
  const key = rx * 1000 + ry;
  let pts = _cfxEll.get(key);
  if (pts) return pts;
  const seen = new Set(), out = [], put = (x, y) => {
    for (const [i, j] of [[x, y], [-x, y], [x, -y], [-x, -y]]) { const k = (i + 512) * 1024 + j + 512; if (!seen.has(k)) { seen.add(k); out.push([i, j, Math.atan2(j / Math.max(1, ry), i / Math.max(1, rx))]); } }
  };
  if (rx <= 0 || ry <= 0) { put(0, 0); _cfxEll.set(key, out); return out; }
  const a2 = rx * rx, b2 = ry * ry;
  let x = 0, y = ry, dx = 0, dy = 2 * a2 * y, e = b2 - a2 * ry + 0.25 * a2;
  while (dx < dy) { put(x, y); x++; dx += 2 * b2; if (e < 0) e += dx + b2; else { y--; dy -= 2 * a2; e += dx - dy + b2; } }
  e = b2 * (x + 0.5) * (x + 0.5) + a2 * (y - 1) * (y - 1) - a2 * b2;
  while (y >= 0) { put(x, y); y--; dy -= 2 * a2; if (e > 0) e += a2 - dy; else { x++; dx += 2 * b2; e += dx - dy + a2; } }
  _cfxEll.set(key, out);
  return out;
}

// A picture kept by key, painted by paint(set) into w × h with its middle
// at cx, cy: set(x, y, colour) from the middle.
const _cfxPics = new Map();
function cfxPic(key, w, h, paint) {
  let pic = _cfxPics.get(key);
  if (pic) return pic;
  if (_cfxPics.size > 600) _cfxPics.clear();
  const img = new ImageData(w, h), D = img.data, cx = w >> 1, cy = h >> 1;
  paint((x, y, col, a = 1) => {
    const X = x + cx, Y = y + cy;
    if (X < 0 || Y < 0 || X >= w || Y >= h) return;
    const c = rgbOf(col), k = (Y * w + X) * 4;
    D[k] = c[0]; D[k + 1] = c[1]; D[k + 2] = c[2]; D[k + 3] = a * 255;
  });
  const [c, x] = makeCanvas(w, h);
  x.putImageData(img, 0, 0);
  pic = { c, cx, cy };
  _cfxPics.set(key, pic);
  return pic;
}

// A cast's light (x, y on the view, r world px, i, c as for lights). In
// the dark, as it is. Under the sky in daylight a light would only wash the
// ground and the diver out, so it's small and tight (T.castFx.day: a share
// of its radius), and kept to one band at most: lights that overlap are
// merged into one, and none is brighter than a band (cfxDayLights). The
// pixels carry the cast there, not the light.
function cfxLight(lights, x, y, r, i, c) {
  if (!CFX.day) { lights.push({ x, y, r, i, c }); return; }
  CFX.dayLights.push({ x, y, r: r * T.castFx.day, i: Math.min(i, 1 / T.art.lightSteps), c });
}

// The day's cast lights, those that overlap merged (the brightest's place
// and colour, the widest reach), into the frame's.
function cfxDayLights(lights) {
  const out = [];
  for (const l of CFX.dayLights) {
    const m = out.find((o) => Math.hypot(o.x - l.x, o.y - l.y) < (o.r + l.r) * AP);
    if (!m) { out.push(Object.assign({}, l)); continue; }
    if (l.i > m.i) { m.x = l.x; m.y = l.y; m.c = l.c; m.i = l.i; }
    m.r = Math.max(m.r, l.r);
  }
  for (const o of out) lights.push(o);
  CFX.dayLights.length = 0;
}

// A ring's radius in art px, in steps of 2 past 16, so the pictures kept
// for the rings on the ground are fewer.
const cfxQuant = (r) => (r <= 16 ? Math.round(r) : Math.round(r / 2) * 2);

// Draws a kept picture at the view's x, y (its middle), glowing.
function cfxBlit(pic, x, y, alpha) {
  const c = View.ctx, e = View.emCtx;
  c.globalAlpha = e.globalAlpha = alpha;
  c.drawImage(pic.c, x - pic.cx, y - pic.cy);
  e.drawImage(pic.c, x - pic.cx, y - pic.cy);
  c.globalAlpha = e.globalAlpha = 1;
}

// The rune circle: an outer ring, a broken inner one, and six marks between
// them turning. rx in art px; rot: which of six turns.
const CFX_RUNES = [[[0, 0], [0, -1], [1, 0]], [[-1, 0], [0, 0], [1, 0], [0, -1]], [[0, 0], [1, -1], [0, -1]], [[0, 0], [0, -1], [-1, -1], [1, -1]], [[-1, 0], [0, -1], [1, 0]], [[0, 0], [1, 0], [1, -1]]];
function cfxGlyphPic(rx, col, rot) {
  const ry = Math.max(1, Math.round(rx * 0.55));
  return cfxPic(`g${rx} ${col} ${rot}`, rx * 2 + 5, ry * 2 + 5, (set) => {
    const dark = mix(col, '#000000', 0.35), lite = mix(col, '#ffffff', 0.45);
    for (const [x, y] of cfxEllipse(rx, ry)) set(x, y, col);
    if (rx >= 7) for (const [x, y, a] of cfxEllipse(rx - 3, Math.max(1, ry - 2))) if (Math.floor(((a + Math.PI) * (rx - 3)) / 3) % 2 === 0) set(x, y, dark);
    const R = rx - 1.5, Ry = Math.max(1, ry - 1);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + (rot / 6) * (Math.PI / 3), mx = Math.round(Math.cos(a) * R), my = Math.round(Math.sin(a) * Ry);
      for (const [i, j] of rx >= 10 ? CFX_RUNES[k] : [[0, 0]]) set(mx + i, my + j, lite);
    }
    // a big circle: ticks round its rim too
    if (rx >= 15) for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2 + 0.26; set(Math.round(Math.cos(a) * (rx + 2)), Math.round(Math.sin(a) * (ry + 1)), col); }
  });
}

// A swept ring: a bright leading edge, its colour behind, a broken trail.
function cfxSweepPic(rx, col, aspect) {
  const ry = Math.max(1, Math.round(rx * aspect));
  return cfxPic(`s${rx} ${col} ${aspect}`, rx * 2 + 5, ry * 2 + 5, (set) => {
    const lite = mix(col, '#ffffff', 0.4), dark = mix(col, '#000000', 0.4);
    if (rx > 4) for (const [x, y, a] of cfxEllipse(rx - 2, Math.max(1, ry - 2))) if (Math.floor((a + Math.PI) * rx * 0.25) % 3) set(x, y, dark);
    if (rx > 1) for (const [x, y] of cfxEllipse(rx - 1, Math.max(1, ry - 1))) set(x, y, col);
    for (const [x, y] of cfxEllipse(rx, ry)) set(x, y, lite);
  });
}

// A thin ring of a colour, in dots (over everyone, where dots are queued
// and cheap), three quarters as tall as it's wide.
function cfxRingDots(cx, cy, rx, col, alpha) {
  for (const [x, y] of cfxEllipse(rx, Math.max(1, Math.round(rx * 0.75)))) dot(cx + x, cy + y, col, true, alpha);
}

// A mark left on the ground, by element: a scorch with embers in it, a star
// of frost, a burn crazed with sparks, a green splash, or a burnt rune.
// Each kind has a few shapes, painted once. A clump grown cell by cell from
// a middle, flattened as ground is. Returns { c: colour, e: what glows }.
const _cfxDecals = new Map();
function cfxDecalPic(kind, big, v) {
  const key = `${kind} ${big ? 1 : 0} ${v}`;
  let pic = _cfxDecals.get(key);
  if (pic) return pic;
  const n = big ? 26 : 15, cells = new Map([['0,0', 1]]), list = [[0, 0]];
  while (list.length < n) {
    const [x, y] = list[(Math.random() * list.length) | 0], dir = (Math.random() * 6) | 0;
    const nx = x + (dir < 2 ? 1 : dir < 4 ? -1 : 0), ny = y + (dir === 4 ? 1 : dir === 5 ? -1 : 0);
    if (Math.abs(ny) > (big ? 3 : 2)) continue;
    const k = nx + ',' + ny;
    if (!cells.has(k)) { cells.set(k, 1); list.push([nx, ny]); }
  }
  const nb = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([i, j]) => cells.has(x + i + ',' + (y + j))).length;
  const W = 24, H = 14, glows = [];
  const tones = {
    ember: ['#140c08', '#2a1a10'], shock: ['#141418', '#262a34'], blight: ['#26341a', '#3e5422'],
    frost: ['#e8f8ff', '#9cc8e0'], arcane: ['#18142a', '#2a2444'], spark: ['#1a1a22', '#2a2a36'],
  }[kind] || ['#18142a', '#2a2444'];
  const col = cfxPic(`dc${key}`, W, H, (set) => {
    if (kind === 'frost') {
      // a star of rime, not a clump
      const arms = big ? 5 : 3;
      for (let i = -arms; i <= arms; i++) set(i, 0, Math.abs(i) < 2 ? tones[0] : tones[1]);
      for (let j = -2; j <= 2; j++) set(0, j, Math.abs(j) < 2 ? tones[0] : tones[1]);
      for (const [i, j] of [[-2, -1], [2, 1], [2, -1], [-2, 1], [-3, -2], [3, 2]]) set(i, j, tones[1]);
      glows.push([0, 0, '#ffffff'], [-arms, 0, ELEMENT_COLS.frost], [arms, 0, ELEMENT_COLS.frost]);
      return;
    }
    for (const [x, y] of list) set(x, y, nb(x, y) >= 3 ? tones[0] : tones[1], 0.85);
    const lit = { ember: [ELEMENT_COLS.ember, '#ffd070'], shock: [ELEMENT_COLS.shock], blight: [ELEMENT_COLS.blight], arcane: [ART.forms.bolt], spark: ['#e8f4ff'] }[kind] || [ART.forms.bolt];
    const inner = list.filter(([x, y]) => nb(x, y) >= 3);
    for (let k = 0; k < (big ? 4 : 2); k++) { const [x, y] = inner[(Math.random() * inner.length) | 0] || [0, 0]; glows.push([x, y, lit[k % lit.length]]); }
    if (kind === 'shock') for (const s of [-1, 1]) for (let i = 2; i < 5; i++) glows.push([s * i, i % 2 ? 0 : -s, ELEMENT_COLS.shock]);
  });
  const em = cfxPic(`de${key}`, W, H, (set) => { for (const [x, y, c] of glows) set(x, y, c); });
  pic = { col, em };
  _cfxDecals.set(key, pic);
  return pic;
}

function cfxDecal(x, y, kind, big) {
  const D = CFX.decals, max = T.castFx.decal[1];
  if (D.length >= max) D.shift();
  const t = T.castFx.decal[0] * (big ? 1.3 : 1);
  D.push({ x, y, pic: cfxDecalPic(kind || 'spark', !!big, (Math.random() * 3) | 0), t, max: t });
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

// Under everyone: marks, glyphs, swept rings, a charging circle and the
// afterimages. ox, oy: the floor's offset on the view.
function drawCastGround(d, ox, oy, tick, lights) {
  const zl = !d.hub && T.zones[d.zone] && T.zones[d.zone].light;
  CFX.day = !!(zl && sunOf(d) > zl.lampAt);
  CFX.dayLights.length = 0;
  if (CFX.dive !== d) return;
  const p = d.p, c = View.ctx, e = View.emCtx;
  for (const m of CFX.decals) {
    const k = m.t / m.max, x = Math.round(m.x * AP) + ox, y = Math.round(m.y * AP) + oy;
    if (x < -20 || y < -20 || x > View.w + 20 || y > View.h + 20) continue;
    c.globalAlpha = cfxBand(k);
    c.drawImage(m.pic.col.c, x - m.pic.col.cx, y - m.pic.col.cy);
    // what glows in it dies first
    const g = cfxBand(k * 2 - 1);
    if (g > 0) { c.globalAlpha = g; c.drawImage(m.pic.em.c, x - m.pic.em.cx, y - m.pic.em.cy); e.globalAlpha = g; e.drawImage(m.pic.em.c, x - m.pic.em.cx, y - m.pic.em.cy); }
    c.globalAlpha = e.globalAlpha = 1;
  }
  const fx = Math.round(p.x * AP) + ox, fy = Math.round(p.y * AP) + oy;
  for (const r of CFX.rings) {
    if (r.kind !== 'glyph' && !(r.kind === 'sweep' && !r.air)) continue;
    const k = r.t / r.max, u = 1 - k, x = r.f ? fx + Math.round(r.x * AP) : Math.round(r.x * AP) + ox, y = r.f ? fy + Math.round(r.y * AP) : Math.round(r.y * AP) + oy;
    if (r.kind === 'glyph') {
      const rx = cfxQuant(lerp(r.r0, r.r1, 1 - (1 - u) * (1 - u)) * AP), rot = (r.rot + Math.floor(Game.realT * 12)) % 6;
      cfxBlit(cfxGlyphPic(rx, r.col, rot), x, y, cfxBand(k) * (r.ghost ? 0.5 : 1));
    } else {
      cfxBlit(cfxSweepPic(cfxQuant(lerp(r.r0, r.r1, 1 - (1 - u) * (1 - u)) * AP), r.col, 0.6), x, y, cfxBand(Math.min(1, k * 1.6)));
    }
  }
  // a caster being charged: a circle growing under the feet, flashing when full
  for (const slot of ['main', 'off']) {
    const h = p.hands[slot], it = Save.data.equip[slot];
    if (!h.holding || !isCaster(it)) continue;
    const lv = chargeLevel(h);
    if (lv <= 0) continue;
    const C = T.castFx.charge, rx = cfxQuant(lerp(C.glyph[0], C.glyph[1], lv) * AP), full = lv >= 1;
    cfxBlit(cfxGlyphPic(rx, full && tick % 2 ? '#ffffff' : castFxCol(it), Math.floor(Game.realT * (6 + lv * 10)) % 6), fx, fy, full ? 1 : lv > 0.5 ? 0.75 : 0.5);
  }
}
// Afterimages on the ground (an Echo's ghost goes over the diver:
// drawCastAir), drawn after the rock has been laid back over the ground's
// marks, as they stand up off it (render.js).
function cfxDrawGroundGhosts(d, ox, oy) {
  if (CFX.dive !== d) return;
  for (const g of CFX.ghosts) if (!g.over) cfxDrawGhost(g, ox, oy);
}

// An afterimage: the diver's silhouette in a colour.
function cfxDrawGhost(g, ox, oy) {
  const c = View.ctx, e = View.emCtx, k = g.t / g.max, spr = g.spr, pic = cfxTinted(spr, g.col), a = cfxBand(k) * g.alpha;
  const x = Math.round(g.x * AP) + ox - Math.round(spr.ax), y = Math.round(g.y * AP) + oy - Math.round(spr.ay);
  c.globalAlpha = a; c.drawImage(pic, x, y);
  e.globalAlpha = a * 0.6; e.drawImage(pic, x, y);
  c.globalAlpha = e.globalAlpha = 1;
  // (behind rock, hidden by it: paint.js)
  paintOcclude(x, y, spr.w, spr.h, Math.round(g.y * AP) + oy, ox, oy);
}

// A sprite's silhouette in a colour, kept.
const _cfxTint = new WeakMap();
function cfxTinted(spr, col) {
  let m = _cfxTint.get(spr.c);
  if (!m) _cfxTint.set(spr.c, (m = new Map()));
  let c = m.get(col);
  if (!c) m.set(col, (c = tinted(spr.c, col)));
  return c;
}

// Over everyone: the motes, the flash at the fist, rings round the body,
// bursts, and the lights they all give.
function drawCastAir(d, ox, oy, tick, lights) {
  if (CFX.dive !== d) return;
  for (const g of CFX.ghosts) if (g.over) cfxDrawGhost(g, ox, oy);
  const p = d.p, px = p.x, py = p.y;
  const vx = (wx) => Math.round(wx * AP) + ox, vy = (wy) => Math.round(wy * AP) + oy;
  for (const q of CFX.parts) {
    const k = q.t / q.max, a = cfxBand(k);
    switch (q.k) {
      case CFX_MOTE: {
        // round the diver, rising; those behind it dimmer
        const s = Math.sin(q.a), x = vx(px + Math.cos(q.a) * q.r), y = vy(py + s * q.r * 0.5 - q.h);
        dot(x, y, q.col, true, s < 0 ? a * 0.5 : a);
        break;
      }
      case CFX_STREAK: {
        const x = vx(q.x), y = vy(q.y), sp = Math.hypot(q.vx, q.vy) || 1;
        dot(x, y, q.col, true, a);
        if (sp > 20) dot(Math.round(x - (q.vx / sp) * 1.5), Math.round(y - (q.vy / sp) * 1.5), q.col2, true, a * 0.5);
        break;
      }
      case CFX_CINDER: dot(vx(q.x), vy(q.y), (tick + q.id) % 3 ? q.col2 : q.col, true, a); break;
      case CFX_SMOKE: {
        // a soft puff two px across, not glowing
        const x = vx(q.x), y = vy(q.y), sa = 0.55 * a;
        dot(x, y, q.col, false, sa); dot(x + 1, y, q.col2, false, sa); dot(x, y - 1, q.col2, false, sa * 0.8);
        if (k < 0.6) dot(x + 1, y - 1, q.col, false, sa * 0.7);
        break;
      }
      case CFX_ICE: dot(vx(q.x), vy(q.y), (tick + q.id) % 4 === 0 ? q.col : q.col2, true, a); break;
      case CFX_DUST: { const x = vx(q.x), y = vy(q.y); dot(x, y, q.col, false, a * 0.8); dot(x + 1, y, q.col, false, a * 0.6); break; }
      case CFX_CONV: {
        const x = vx(q.x), y = vy(q.y), at = CFX.focusAt[q.slot];
        dot(x, y, q.col, true, a > 0.5 ? 1 : 0.75);
        // a tail pointing out from the focus
        if (at) { const tx = q.x - px - at.x, ty = q.y - py - at.y, m = Math.hypot(tx, ty) || 1; if (m > 3) dot(Math.round(x + (tx / m) * 1.5), Math.round(y + (ty / m) * 1.5), q.col2, true, 0.5); }
        break;
      }
      case CFX_DRIP: dot(vx(q.x), vy(q.y), k > 0.5 ? q.col : q.col2, true, a); break;
      case CFX_SPARK: dot(vx(q.x), vy(q.y), q.col, !q.dark, a); break;
      default: dot(vx(q.x), vy(q.y), q.col, true, a * 0.75);
    }
  }
  const fx = vx(px), fy = vy(py);
  for (const r of CFX.rings) {
    const k = r.t / r.max, u = 1 - k, x = r.f ? fx + Math.round(r.x * AP) : vx(r.x), y = r.f ? fy + Math.round(r.y * AP) : vy(r.y);
    if (r.kind === 'flash') cfxDrawFlash(x, y, r.a, r.col, k, r.big);
    else if (r.kind === 'crescent') cfxDrawCrescent(r, x, y, u, lights);
    else if (r.kind === 'sweep' && r.air) {
      const rx = Math.round(lerp(r.r0, r.r1, u) * AP), a = cfxBand(Math.min(1, k * 1.6));
      cfxRingDots(x, y, rx, mix(r.col, '#ffffff', 0.4), a); cfxRingDots(x, y, rx - 1, r.col, a);
    } else if (r.kind === 'burst') {
      const rx = Math.round(lerp(r.r0, r.r1, u) * (r.pillar ? AP : 1));
      cfxRingDots(x, y, Math.max(1, rx), k > 0.5 ? '#ffffff' : r.col, cfxBand(k));
      // a blink's ends: a pillar of light up and down from the middle
      if (r.pillar) { const L = Math.round(ap(14) * k); for (let j = -L; j <= L; j++) dot(x, y + j, Math.abs(j) < 3 ? '#ffffff' : r.col, true, cfxBand(k * (1 - Math.abs(j) / (L + 1)))); }
    }
  }
  for (const l of CFX.flares) {
    const k = l.t / l.max;
    cfxLight(lights, l.f ? fx + Math.round(l.x * AP) : vx(l.x), l.f ? fy + Math.round(l.y * AP) : vy(l.y), l.r * (0.6 + 0.4 * k), l.i * k, l.c);
  }
  cfxDayLights(lights);
}

// The flash at the fist: a white heart, rays out along the aim and across
// it, shrinking a step at a time; a big one (charged, a gauntlet's punch)
// has longer rays and a ring.
function cfxDrawFlash(x, y, a, col, k, big) {
  const s = (k > 0.66 ? 3 : k > 0.33 ? 2 : 1) + (big ? 1 : 0), ca = Math.cos(a), sa = Math.sin(a);
  for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1]]) dot(x + i - (ca < 0 ? 1 : 0), y + j - 1, '#ffffff', true);
  for (let i = 1; i <= s + 1; i++) dot(Math.round(x + ca * (i + 1)), Math.round(y + sa * (i + 1)), i <= 1 ? '#ffffff' : col, true);
  for (let i = 1; i < s; i++) {
    dot(Math.round(x - sa * (i + 1)), Math.round(y + ca * (i + 1)), col, true, 0.75);
    dot(Math.round(x + sa * (i + 1)), Math.round(y - ca * (i + 1)), col, true, 0.75);
  }
  if (big || k < 0.66) ringDots(x, y, (1 - k) * (big ? 7 : 4) + 2, col, cfxBand(k), true);
}

// A bolt in flight: out of the fist, its head flickering and turning, a
// trail of dots behind, by kind (spark wobbles; a charged bolt is a turning
// star; a frost lance a shard with a glint running down it), and its light.
function drawCastBolt(b, ox, oy, tick, lights) {
  const c = b.cfx, age = c ? Game.realT - c.born : 1, o = c ? Math.max(0, 1 - age / T.castFx.bolt.originT) : 0;
  const bx = b.x + (c ? c.ox * o : 0), by = b.y + (c ? c.oy * o : 0), sp = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / sp, uy = b.vy / sp;
  const el = b.element, col = cfxBoltCol(b), look = CFX_BOLT_LOOK[b.kind];
  // a spark wobbles across its path
  const wob = look === 'wobble' ? Math.round(Math.sin(age * 45) * 1.2) : 0;
  const x = Math.round(bx * AP) + ox - Math.round(uy * wob), y = Math.round(by * AP) + oy + Math.round(ux * wob);
  if (look === 'orb') { cfxDrawOrb(b, x, y, tick, col, lights); return; }
  if (look === 'lance') {
    // (a Shatterglass shard is a short one)
    const n = ap(b.kind === 'shard' ? 3 : 6), glint = Math.floor(Game.realT * 30) % (n + 3);
    for (let k = 0; k < n; k++) dot(Math.round(x - ux * k), Math.round(y - uy * k), k === glint || k < ap(2) ? '#ffffff' : col, true, 1 - (k / AP) * 0.12);
    // its sides, a pixel either way at the middle: a shard, not a line
    for (const s of [-1, 1]) dot(Math.round(x - ux * ap(2) - uy * s), Math.round(y - uy * ap(2) + ux * s), mix(col, '#5a8aa8', 0.4), true, 0.75);
    cfxLight(lights, x, y, TILE, 0.6, rgb01(col));
    return;
  }
  // the trail: dots behind, dimmer and darker with each
  const n = T.castFx.bolt.trail + (b.big ? 4 : 0), dark = mix(col, '#000000', 0.35);
  for (let k = 1; k <= n; k++) {
    const tx = Math.round(x - ux * k * 2), ty = Math.round(y - uy * k * 2), a = cfxBand(1 - k / (n + 1));
    dot(tx, ty, k < 3 ? col : dark, true, a);
    if (b.big && k < 4) { dot(Math.round(tx - uy), Math.round(ty + ux), dark, true, a * 0.75); dot(Math.round(tx + uy), Math.round(ty - ux), dark, true, a * 0.75); }
  }
  if (b.big) {
    // a star that turns: a plus, then a cross
    const plus = (tick >> 1) % 2 === 0, pts = plus ? [[0, -1], [-1, 0], [1, 0], [0, 1], [2, 0], [-2, 0], [0, 2], [0, -2]] : [[-1, -1], [1, 1], [1, -1], [-1, 1], [2, 2], [-2, -2], [2, -2], [-2, 2]];
    for (const [i, j] of pts) dot(x + i, y + j, Math.abs(i) + Math.abs(j) > 2 ? dark : col, true);
    for (const [i, j] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]]) dot(x + i, y + j, i || j ? col : '#ffffff', true);
  } else {
    // a small star whose white point goes round it
    const w = tick % 4;
    [[1, 0], [0, 1], [-1, 0], [0, -1]].forEach(([i, j], q) => dot(x + i, y + j, q === w ? '#ffffff' : col, true));
    dot(x, y, '#ffffff', true);
  }
  // shock crackles about its head
  if (el === 'shock') for (let k = 0; k < 2; k++) dot(x + FX_R.i(-3, 3), y + FX_R.i(-3, 3), k ? '#ffffff' : col, true);
  cfxLight(lights, x, y, TILE * (b.big ? 1.4 : 1), 0.6 + (tick % 2) * 0.15, rgb01(col));
}

// A chain's arc: a jagged white line with the colour round it and a fork,
// jumping anew each frame; its ends flash.
function drawCastArc(fx, ox, oy, lights) {
  const k = fx.t / fx.max, x0 = Math.round(fx.x * AP) + ox, y0 = Math.round(fx.y * AP) + oy, x1 = Math.round(fx.x2 * AP) + ox, y1 = Math.round(fx.y2 * AP) + oy;
  const n = Math.max(3, Math.round(Math.hypot(x1 - x0, y1 - y0) / 8)), col = fx.col || ELEMENT_COLS.shock, a = cfxBand(k);
  let px = x0, py = y0;
  for (let s = 1; s <= n; s++) {
    const tx = Math.round(x0 + ((x1 - x0) * s) / n + (s < n ? FX_R.i(-3, 3) : 0)), ty = Math.round(y0 + ((y1 - y0) * s) / n + (s < n ? FX_R.i(-3, 3) : 0));
    cfxLine(px, py, tx, ty, k > 0.5 ? '#ffffff' : col, a);
    cfxLine(px, py + 1, tx, ty + 1, col, a * 0.5);
    if (s === (n >> 1) && k > 0.4) cfxLine(tx, ty, tx + FX_R.i(-6, 6), ty + FX_R.i(-6, 6), col, a * 0.75);
    px = tx; py = ty;
  }
  for (const [x, y] of [[x0, y0], [x1, y1]]) for (const [i, j] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) dot(x + i, y + j, i || j ? col : '#ffffff', true, a);
  cfxLight(lights, (x0 + x1) >> 1, (y0 + y1) >> 1, TILE * 1.4, 0.8 * k, rgb01(col));
}

function cfxLine(x0, y0, x1, y1, col, alpha) {
  const n = Math.max(1, Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
  for (let s = 0; s <= n; s++) dot(Math.round(x0 + ((x1 - x0) * s) / n), Math.round(y0 + ((y1 - y0) * s) / n), col, true, alpha);
}

// An Arc's crescent (art px x, y: where it was cast from; u: how far through
// its life): the leading edge sweeps across the aim's arc in the first part
// of its life, white at its head, the element's colour behind and a darker
// rim inside, then fades in steps. Heavy: twice as thick.
function cfxDrawCrescent(r, x, y, u, lights) {
  const lead = Math.min(1, u / 0.55), fade = u < 0.55 ? 1 : cfxBand((1 - u) / 0.45);
  if (fade <= 0) return;
  const R = Math.round(r.r * AP * 0.95), th = r.heavy ? 4 : 2, cy = y - Math.round(6 * AP), a0 = r.a - r.side * r.half, span = 2 * r.half * r.side;
  const tail = Math.max(0, lead - (r.heavy ? 1 : 0.8)), steps = Math.max(8, Math.round(Math.abs(span) * R * (lead - tail)));
  const lite = mix(r.col, '#ffffff', 0.45), dark = mix(r.col, '#000000', 0.35);
  for (let i = 0; i <= steps; i++) {
    const k = tail + ((lead - tail) * i) / steps, b = a0 + span * k, head = lead < 1 && i > steps * 0.85, age = cfxBand((i / steps) * 1.2);
    const c = Math.cos(b), sn = Math.sin(b);
    for (let j = 0; j <= th; j++) {
      const rr = R - j, col = head ? '#ffffff' : j === 0 ? lite : j === th ? dark : r.col;
      dot(Math.round(x + c * rr), Math.round(cy + sn * rr * 0.75), col, j < th, Math.min(1, age + 0.25) * fade);
    }
  }
  const b = a0 + span * lead;
  cfxLight(lights, Math.round(x + Math.cos(b) * R), Math.round(cy + Math.sin(b) * R * 0.75), TILE * (r.heavy ? 1.5 : 1.1), 0.8 * fade, rgb01(r.col));
}

// An orb in flight: a ball with a white heart in its colour, a darker rim,
// motes turning round it, and a ring when it pulses.
function cfxDrawOrb(b, x, y, tick, col, lights) {
  const dark = mix(col, '#000000', 0.4), R = 3;
  for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
    const e = i * i + j * j;
    if (e > R * R + 1) continue;
    dot(x + i, y + j, e <= 2 && i <= 0 && j <= 0 ? '#ffffff' : e >= R * R - 1 ? dark : col, true);
  }
  for (let k = 0; k < 3; k++) { const a = Game.realT * 5 + (k * Math.PI * 2) / 3; dot(Math.round(x + Math.cos(a) * ap(4)), Math.round(y + Math.sin(a) * ap(3)), k ? col : '#ffffff', true, 0.75); }
  const since = Game.realT - (b.orb ? b.orb.pulse : -1);
  if (since >= 0 && since < 0.2) { const k = since / 0.2; cfxRingDots(x, y + Math.round(6 * AP * 0.5), Math.max(2, Math.round(b.orb.r * AP * k)), k < 0.5 ? '#ffffff' : col, cfxBand(1 - k)); }
  cfxLight(lights, x, y, TILE * 1.3, 0.7 + (since < 0.15 ? 0.4 : 0), rgb01(col));
}

// A Glaive's blades (art px ox, oy: the floor's offset on the view): each
// a short crescent on the ring it turns round, its head white, a trail of
// dots behind it, all in its colour.
function drawCastGlaive(au, ox, oy, tick, lights) {
  const cx = Math.round(au.x * AP) + ox, cy = Math.round((au.y - 6) * AP) + oy, R = au.r * AP, fade = Math.min(1, au.t / 0.3);
  const dark = mix(au.col, '#000000', 0.35), lite = mix(au.col, '#ffffff', 0.5), seg = Math.round(R * 0.55);
  for (let n = 0; n < au.n; n++) {
    const a = au.a + (n / au.n) * Math.PI * 2, dir = Math.sign(au.spin) || 1;
    for (let i = 0; i <= seg; i++) {
      const b = a - (dir * i) / R, k = i / seg, c = Math.cos(b), s = Math.sin(b);
      for (const [rr, col] of [[R + 1, i < 2 ? '#ffffff' : lite], [R, i < 3 ? '#ffffff' : au.col], [R - 1, dark]]) {
        if (rr === R - 1 && i > seg * 0.6) continue;
        dot(Math.round(cx + c * rr), Math.round(cy + s * rr * 0.75), col, true, cfxBand(1 - k * 0.8) * fade);
      }
    }
  }
  cfxLight(lights, cx, cy, au.r * 1.1, 0.45 * fade, rgb01(au.col));
}
