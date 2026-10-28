'use strict';
// ---------------------------------------------------------------------------
// How a cast looks (cosmetic only). The Kindler's spells are the Lodestar
// Charter's technology, and look engineered (DECISIONS.md, 2026-10-19;
// docs/PAINTED.md, Effects): hard light in crisp lines a pixel wide,
// facets and lattices, the Charter's gold and blue as accents, switching
// off in scan-lines rather than fading. A spell still fires on the frame
// of the tap; everything here wraps round that instant: the diver's arm
// thrusts the wrist projector at the aim (the pose frames are in diver.js,
// drawn in render.js), a muzzle opens at the fist (a diamond, rails, a ring across
// the aim), a circuit sigil flashes under the feet, and a shot or a placed
// spell locks gold brackets on its foe with a guide line out to it. Shots
// fly as slugs with contrails (a lance a beam that burns a scar into the
// ground, an orb plasma in a hexagonal shell) and land in a flash frame and
// a shock ring, throwing their element: sparks that fall and bounce,
// molten gobs, facets of ice, a cloud of nanites. The big spells send a
// pressure wave over the ground from a hexagon of light; a Well pinches
// space round a dark core; a Ward is a bubble of hexagonal lattice. An Arc
// and a Glaive's blades are faceted crescents of hard light. A held charge
// gathers motes into the wrist projector over a growing sigil. Moves leave
// afterimages, and an Echo's recast shows a ghost of the pose. The shapes
// and kept pictures are in hardlight.js.
//
// Everything is drawn in whole art px: rings and sigils are rasterised
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
  locks: [], // lock-on brackets on what a cast is aimed at
  trails: [], // contrails: where shots have been, lingering
  swarms: [], // nanite clouds clinging to what Blight struck
  scars: [], // the lines a lance's beam burns into the ground, cooling
  origin: null, // where the last cast's fist was, for the bolts it fired
  last: null, // the last cast's aim and hand, for an Echo
  focusAt: { main: null, off: null }, // each wrist's projector, from the feet, world px, as drawn
  day: false, // under the sky in daylight, this frame (cfxLight)
  dayLights: [], // the cast's lights this frame, in daylight
};

// Kinds of mote.
const CFX_STREAK = 1, CFX_MOTE = 2, CFX_SPARK = 3, CFX_CINDER = 4, CFX_SMOKE = 5, CFX_ICE = 6, CFX_DUST = 7, CFX_CONV = 8, CFX_DRIP = 9, CFX_GLIM = 10, CFX_GOB = 11, CFX_NANITE = 12;

// How each element looks, whatever the spell's shape: its colour; the mote
// a bolt of it sheds as it flies (shed) and the ones it bursts into (burst,
// with dark: every other one a dull, unlit bit of it; smoke: a puff with
// them); and the mark it leaves on the ground (decal, cfxDecalPic). No
// element looks like force, in the cast's own colour.
const CFX_ELEMENTS = {
  force: { col: '#e8f4ff', shed: CFX_GLIM, burst: CFX_SPARK, decal: 'arcane' },
  shock: { col: ELEMENT_COLS.shock, shed: CFX_SPARK, burst: CFX_SPARK, decal: 'shock' },
  frost: { col: ELEMENT_COLS.frost, shed: CFX_ICE, burst: CFX_ICE, decal: 'frost' },
  ember: { col: ELEMENT_COLS.ember, shed: CFX_CINDER, burst: CFX_GOB, smoke: true, decal: 'ember' },
  blight: { col: ELEMENT_COLS.blight, shed: CFX_NANITE, burst: CFX_NANITE, dark: '#4a6a28', decal: 'blight' },
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

// The colour a spell casts in (slot 'main', spell A; 'off', B): its
// Element's, else its Form's.
function castFxCol(item, slot = 'main') { return isCaster(item) ? spellCol(rigSpell(item, slot === 'off' ? 1 : 0)) : ART.forms.arc; }

// A fade in a few hard steps, from the share of a life left.
const cfxBand = (k) => (k > 0.75 ? 1 : k > 0.5 ? 0.75 : k > 0.25 ? 0.5 : k > 0 ? 0.25 : 0);

// ---------------------------------------------------------------------------
// Painting (docs/PAINTED.md). An effect is laid in its colour's ramp of five
// tones: deep, dim, the colour itself, lit and white-hot. A crescent or a
// ring is thick and tapered, hottest along its leading edge, its back edge
// deep, with loose pixels of its colour round it, and it breaks up into
// gaps as it fades. Its light on the ground is loose short strokes of its
// colour, denser nearer (cfxLightPic), never an area recoloured. Rings and
// marks on the ground are painted in short horizontal strokes once and kept
// (cfxStrokePic); what moves every frame is set as dots.
// ---------------------------------------------------------------------------
const CFX_RAMPS = {
  [ELEMENT_COLS.ember]: ['#6a1e0c', '#c04818', '#ff8a3a', '#ffc070', '#fff0c8'],
  [ELEMENT_COLS.frost]: ['#24487a', '#5296c8', '#a8dcf4', '#d8f4ff', '#ffffff'],
  [ELEMENT_COLS.shock]: ['#7a5a0c', '#c89e1c', '#ffe45c', '#fff4a8', '#ffffff'],
  [ELEMENT_COLS.blight]: ['#243e12', '#4a7420', '#9ad04a', '#c8ec80', '#f0ffd0'],
  // (Force is kinetic: a clean white with the Charter's gold in it)
  [ELEMENT_COLS.force]: ['#4a3c22', '#a08a52', '#ece2c4', '#fff6dc', '#ffffff'],
  '#e8f4ff': ['#3a4a6a', '#7890b8', '#c4d8f4', '#e8f4ff', '#ffffff'],
  '#ffd890': ['#7a4214', '#d08a30', '#ffd890', '#fff0c0', '#fffbea'],
  '#c060ff': ['#3a1a5a', '#7a30b0', '#c060ff', '#e0b0ff', '#fff0ff'],
};
const _cfxRamps = new Map();
function cfxRamp(col) {
  let r = _cfxRamps.get(col);
  if (!r) {
    r = CFX_RAMPS[col] || [mix(col, '#0c0a18', 0.6), mix(col, '#0c0a18', 0.3), col, mix(col, '#ffffff', 0.45), mix(col, '#ffffff', 0.82)];
    _cfxRamps.set(col, r);
  }
  return r;
}
// A seed for something drawn every frame, so its strokes hold still.
const cfxSeed = (o) => o.sd || (o.sd = 1 + ((Math.random() * 1e6) | 0));

// An arc of light round x, cy (art px; R across, R × 0.75 down) from the
// angle aT (its tail) to aH (its head): th px thick at its thickest, a
// little towards the head, tapering to points; its outer edge white-hot,
// then lit, its colour, and its back edge deep; loose pixels outside it.
// broken (0..1): the share of it dropped as it fades. hot: its head white.
// hard: hard light, cut in facets (its thickness in steps, a dark seam
// between each), with no loose pixels, switching off in scan-lines rather
// than strokes, and a gold point at its head.
function cfxPaintArc(x, cy, R, aT, aH, th, ramp, alpha, seed, broken, hot, hard) {
  const span = aH - aT, steps = Math.max(6, Math.round(Math.abs(span) * R * 1.4)), nf = hard ? Math.max(3, Math.round((Math.abs(span) * R) / 7)) : 0;
  let lastF = -1;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, b = aT + span * t, c = Math.cos(b), s = Math.sin(b);
    const fi = hard ? Math.min(nf - 1, Math.floor(t * nf)) : 0, tw = hard ? (fi + 0.6) / nf : t, seam = hard && fi !== lastF && i > 0;
    lastF = fi;
    const w = th * Math.pow(Math.sin(Math.PI * Math.pow(Math.min(0.97, tw), 1.5)), 0.6), glow = Math.sin(Math.PI * t);
    for (let k = hard ? 0 : -1.6; k <= w; k += 0.7) {
      const rr = R - k, px = Math.round(x + c * rr), py = Math.round(cy + s * rr * 0.75), h = artHash(px, py, seed);
      if (k < 0) {
        // the glow outside the edge: loose pixels
        if (h < (broken ? 0.1 : 0.22) * (1 + k / 1.6) * glow) dot(px, py, ramp[h < 0.08 ? 1 : 2], true, alpha * 0.85);
        continue;
      }
      if (hard) {
        // (switching off in scan-lines)
        if (broken > 0.55 ? py % 3 : broken > 0.15 ? py & 1 : 0) continue;
        if (seam && k > 0.9) { dot(px, py, ramp[1], true, alpha * 0.9); continue; }
      } else if (broken && artHash(Math.floor(i / 3), Math.round(k), seed + 1) < broken * 0.8) continue;
      // (broken in strokes along it, not in pixels)
      let ti = k < 0.9 ? 4 : k < w * 0.55 ? 3 : k < w - 0.8 ? 2 : 1;
      if (hot && t > 0.88 && k < w * 0.7) ti = 4;
      if (broken > 0.3 && ti > 2) ti--;
      dot(px, py, ramp[ti], ti > 1, alpha);
    }
  }
  if (hard && hot) { const c = Math.cos(aH), s = Math.sin(aH); dot(Math.round(x + c * (R + 1)), Math.round(cy + s * (R + 1) * 0.75), HL_GOLD[4], true, alpha); dot(Math.round(x + c * (R + 2)), Math.round(cy + s * (R + 2) * 0.75), HL_GOLD[3], true, alpha * 0.8); }
}

// A ring of short strokes round cx, cy (rx × ry art px), a tone a stroke,
// a few gaps; its front half a pixel thicker (thick) and brighter than its
// back.
function cfxStrokeRing(cx, cy, rx, ry, ramp, alpha, seed, thick, gap = 0.18) {
  if (alpha <= 0) return;
  rx = Math.max(1, Math.round(rx)); ry = Math.max(1, Math.round(ry));
  for (const [x, y, a] of cfxEllipse(rx, ry)) {
    const h = artHash(Math.floor(((a + Math.PI) * rx) / 3), rx, seed);
    if (h < gap) continue;
    const ti = h > 0.78 ? 4 : h > 0.42 ? 3 : 2, front = y >= 0, al = front ? alpha : alpha * 0.7;
    dot(cx + x, cy + y, ramp[ti], true, al);
    if (thick && front && y > 0) dot(cx + x, cy + y - 1, ramp[ti - 1], true, al * 0.85);
  }
}

// Short streaks out from x, y: n of them at hashed angles, from r0 to r1
// art px out (r × 0.75 down), white-hot nearest, its colour out at the tip.
function cfxRays(x, y, r0, r1, n, ramp, alpha, seed) {
  for (let q = 0; q < n; q++) {
    const a = ((q + artHash(q, 3, seed) * 0.7) / n) * Math.PI * 2, s0 = r0 * (0.7 + 0.5 * artHash(q, 5, seed)), L = Math.max(1, Math.round((r1 - r0) * (0.6 + 0.4 * artHash(q, 7, seed))));
    const c = Math.cos(a), s = Math.sin(a) * 0.75;
    for (let j = 0; j <= L; j++) dot(Math.round(x + c * (s0 + j)), Math.round(y + s * (s0 + j)), ramp[j === 0 ? 4 : j <= L / 2 ? 3 : 2], true, alpha);
  }
}

// A kept picture painted in short horizontal strokes (pntStrokeRow): val(x,
// y) from the middle gives -1 where it's empty, else its tone on the ramp
// (0..1). A stroke takes the value at its middle, plus its jitter, so the
// edges go ragged in strokes, not in pixels.
function cfxStrokePic(key, w, h, ramp, val, seed, J = 0.7) {
  return cfxPic(key, w, h, (set) => {
    const cx = w >> 1, cy = h >> 1, mid = new Int32Array(w), jit = new Float32Array(w);
    for (let y = -cy; y < h - cy; y++) {
      pntStrokeRow(mid, jit, -cx, w, y + 64, seed);
      for (let i = 0; i < w; i++) {
        const x = i - cx, v = val(mid[i] - cx, y);
        if (v < 0 || (val(x, y) < 0 && artHash(x, y, seed) < 0.6)) continue;
        set(x, y, ramp[clamp(Math.round(v * (ramp.length - 1) + jit[i] * J), 0, ramp.length - 1)]);
      }
    }
  });
}

// A light's colour on the ground: loose strokes of it, 2 to 5 px, denser
// and lighter nearer the middle, r art px across (0.6 of it down). A few
// shapes of each, kept.
function cfxLightPic(r, col, v) {
  const ry = Math.max(2, Math.round(r * 0.6)), ramp = cfxRamp(col);
  return cfxPic(`l${r} ${col} ${v}`, r * 2 + 10, ry * 2 + 4, (set) => {
    const n = Math.round(r * ry * 1.4);
    for (let k = 0; k < n; k++) {
      const x = Math.round((artHash(k, v, r) * 2 - 1) * r), y = Math.round((artHash(k, v + 7, r) * 2 - 1) * ry), d = Math.hypot(x / r, y / ry);
      if (d >= 1 || artHash(k, v + 13, r) > Math.pow(1 - d, 1.6) * 0.32) continue;
      const L = 2 + Math.floor(artHash(k, v + 19, r) * (d < 0.4 ? 4 : 3)), ti = d < 0.2 ? 3 : d < 0.55 ? 2 : 1;
      for (let i = 0; i < L; i++) set(x + i - (L >> 1), y, ramp[ti], d < 0.5 ? 0.9 : 0.7);
    }
  });
}

function cfxReset(d) {
  CFX.dive = d;
  CFX.parts.length = CFX.rings.length = CFX.decals.length = CFX.ghosts.length = CFX.flares.length = CFX.waves.length = CFX.locks.length = CFX.scars.length = CFX.trails.length = CFX.swarms.length = 0;
  CFX.origin = CFX.last = null;
  CFX.focusAt.main = CFX.focusAt.off = null;
}

// A mote, unless there are already as many as allowed (T.castFx.cap).
function cfxPart(k, x, y, vx, vy, t, col, col2, follow) {
  if (CFX.parts.length >= T.castFx.cap) return null;
  const q = { k, x, y, vx, vy, t, max: t, col, col2: col2 || col, f: !!follow, a: 0, r: 0, h: 0, drag: 0, g: 0, floor: 1e9, id: (Math.random() * 1e6) | 0 };
  CFX.parts.push(q);
  return q;
}

function cfxFlare(x, y, r, i, col, t, follow) {
  if (CFX.flares.length >= T.castFx.flares) CFX.flares.shift();
  CFX.flares.push({ x, y, r, i, c: rgb01(col), col, v: (Math.random() * 3) | 0, t, max: t, f: !!follow });
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

// Where the wrist projector's light leaves in the pose, from the feet, in
// world px.
function castFxHandRel(a, slot) {
  const spr = castFxSprite(a, slot);
  if (!spr) return { x: Math.cos(a) * 6, y: -10 + Math.sin(a) * 4 };
  const reach = T.castFx.reach + 1;
  return { x: (spr.castHand.x - spr.ax + Math.cos(a) * reach) / AP, y: (spr.castHand.y - spr.ay + Math.sin(a) * reach) / AP };
}

// How far the body leans into the cast, art px: in while the arm is out,
// back a little as it eases off.
function castFxLean(c) {
  if (c.charging || c.hold) return { x: 0, y: 0 };
  const L = T.castFx.lean, k = 1 - c.t / c.max, th = T.castFx.thrust;
  const s = k < th ? L[0] : k < th + (1 - th) * 0.5 ? -L[1] : 0;
  return { x: Math.round(Math.cos(c.a) * s), y: Math.round(Math.sin(c.a) * s * 0.75) };
}

// ---------------------------------------------------------------------------
// What a cast sets off
// ---------------------------------------------------------------------------

// A spell is cast from a wrist (slot 'main' the right, 'off' the left):
// the pose, and the burst round the projector. kinds: the Forms it fires;
// col: its colour.
function castFxStart(d, item, slot, charged, kinds, col) {
  if (CFX.dive !== d) cfxReset(d);
  const p = d.p, C = T.castFx, a = castFxAim(d);
  p.cast = { t: C.pose, max: C.pose, charged, slot, a, col };
  const hand = castFxHandRel(a, slot), big = charged || kinds.some((k) => (C.shapes[C.shapeOf[k]] || {}).big);
  CFX.origin = { x: hand.x, y: hand.y, t: Game.realT };
  CFX.last = { a, slot, col };
  cfxCastBurst(p, a, hand, col, big, charged);
  if (charged) cfxSweep(p.x, p.y, 4, 26, col, C.shapes.burst.time, false, C.shapes.burst.dust);
  // a shot or a placed spell locks on to what it's aimed at, and a guide
  // line traces the way for an instant
  if (kinds.some((k) => C.shapeOf[k] === 'projectile' || C.shapeOf[k] === 'placed')) {
    const e = nearestEnemy(d, d.castRange || T.circuits.aimRange);
    if (e) cfxLock(e, col, hand);
  }
}

// A lock-on on e: brackets that close in on it and hold a moment; from
// the fist (hand, from the feet), a guide line out to it.
function cfxLock(e, col, hand) {
  const L = T.castFx.lock;
  for (const l of CFX.locks) if (l.e === e) { l.t = l.max = L[0]; l.col = col; l.hand = hand; l.born = Game.realT; return; }
  if (CFX.locks.length >= 4) CFX.locks.shift();
  CFX.locks.push({ e, col, t: L[0], max: L[0], hand, born: Game.realT });
}

// The flash at the fist, the motes it kicks out, the circle under the feet,
// the motes rising round the body.
function cfxCastBurst(p, a, hand, col, big, charged, ghost) {
  const C = T.castFx, n = charged ? 2 : 1;
  CFX.rings.push({ kind: 'flash', x: hand.x, y: hand.y, a, col, t: C.flash[0] * n, max: C.flash[0] * n, f: true, big: charged });
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
}

// An Echo casts again: a ghost of the pose and its circle, its fist the
// bolts' origin.
function castFxEcho(d) {
  if (CFX.dive !== d || !CFX.last || !Game.dive) return;
  const p = d.p, L = CFX.last, col = ART.glyphs.echo, hand = castFxHandRel(L.a, L.slot), spr = castFxSprite(L.a, L.slot);
  CFX.origin = { x: hand.x, y: hand.y, t: Game.realT };
  // (over the diver, or the diver would hide it)
  if (spr) CFX.ghosts.push({ spr, x: p.x, y: p.y, col, t: T.castFx.echo, max: T.castFx.echo, alpha: 0.45, over: true });
  cfxCastBurst(p, L.a, hand, mix(L.col, col, 0.5), false, false, true);
}

// A ring swept over the ground from r0 to r1 (world px), at x, y or round
// the diver (follow); in: drawn inwards. dust: how many motes of dust are
// pushed along with it.
function cfxSweep(x, y, r0, r1, col, t, follow, dust, inward) {
  const d = CFX.dive, p = d && d.p;
  CFX.rings.push({ kind: 'sweep', x: follow ? 0 : x, y: follow ? 0 : y, r0, r1, col, t, max: t, f: !!follow });
  if (!follow) CFX.waves.push({ x, y, r0, r1, t, max: t });
  if (!dust || !d) return;
  const cx = follow ? p.x : x, cy = follow ? p.y : y, f = d.floor, ground = climeLookAtPx(f, cx, cy), dc = [mix(ground.floor[2], '#ffffff', 0.18), ground.floor[1]];
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
      if (q) { q.g = E.burst === CFX_CINDER ? -20 : E.burst === CFX_NANITE ? 0 : 60; q.drag = 4; q.floor = y + 2; }
    }
    if (opts.heavy) CFX.rings.push({ kind: 'burst', x: x + Math.cos(aim) * r * 0.75, y: y - 6 + Math.sin(aim) * r * 0.55, r0: 2, r1: 9, col, t: 0.14, max: 0.14, f: false });
    CFX.waves.push({ x: x + Math.cos(aim) * r * 0.5, y: y + Math.sin(aim) * r * 0.5, r0: 2, r1: r, t, max: t });
    if (S.dust) cfxSweep(x + Math.cos(aim) * r * 0.4, y + Math.sin(aim) * r * 0.3, 2, 3, col, 0.01, false, opts.heavy ? S.dust * 2 : S.dust);
    cfxFlare(x + Math.cos(aim) * r * 0.6, y - 6 + Math.sin(aim) * r * 0.45, r * S.bloom[0] * (opts.heavy ? 1.4 : 1), S.bloom[1] * (opts.heavy ? 1.3 : 1), col, S.bloom[2]);
    return;
  } else {
    const inward = !!opts.inward || shape === 'placed', t = S.time * (r > 50 ? 1.3 : 1);
    cfxSweep(x, y, inward ? r : S.from, inward ? S.from : r, col, t, false, S.dust, inward);
    // at its heart a hexagon of hard light flashes open
    CFX.rings.push({ kind: 'hexflash', x, y, col, t: 0.16, max: 0.16, f: false, big: r > 30 });
    if (S.glyph) CFX.rings.push({ kind: 'glyph', x, y, r0: r * S.glyph[0], r1: r * S.glyph[1], col, t: S.glyph[2], max: S.glyph[2], f: false, rot: 0 });
    // the element's bits thrown out over the ground
    for (let k = 0; k < (S.scatter || 0); k++) {
      const a = (k / S.scatter) * Math.PI * 2, dk = E.dark && k % 2 === 0, q = cfxPart(E.burst, x + Math.cos(a) * 4, y - 4 + Math.sin(a) * 3, Math.cos(a) * 70, Math.sin(a) * 45 - 20, FX_R.f(0.25, 0.4), dk ? E.dark : col, col);
      if (q) { q.g = E.burst === CFX_CINDER ? -20 : E.burst === CFX_NANITE ? 0 : 120; q.drag = E.burst === CFX_NANITE ? 2.5 : 0; q.dark = dk; q.floor = y + 2; }
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
  const el = cfxBoltEl(b), size = b.big ? 1.6 : b.kind === 'shard' ? 0.7 : 1;
  cfxBurst(b.x, b.y, cfxBoltCol(b), size, el);
  // a mark on the ground under it, and Blight's swarm clings to what it hit
  cfxDecal(b.x, b.y + 8, cfxEl(el).decal, b.big);
  if (how === 'hit' && cfxStyle(el) === 'blight') cfxSwarmOn(b.x, b.y + 5, cfxBoltCol(b), b.big);
}

// Blight's swarm: a cloud of nanites on the foe nearest x, y, crawling
// over it and eating, for a second.
function cfxSwarmOn(x, y, col, big) {
  const d = Game.dive;
  let e = null, bd = 16;
  for (const q of d.enemies) { if (q.dead) continue; const m = dist(q.x, q.y, x, y); if (m < bd + q.r) { bd = m; e = q; } }
  if (!e) return;
  for (const w of CFX.swarms) if (w.e === e) { w.t = w.max; w.n = Math.min(40, w.n + 8); return; }
  if (CFX.swarms.length >= 8) CFX.swarms.shift();
  const t = T.castFx.swarm;
  CFX.swarms.push({ e, col, t, max: t, n: big ? 34 : 24, sd: 1 + ((Math.random() * 1e6) | 0) });
}

function castFxBoltEnd(b) {
  if (!Game.dive || CFX.dive !== Game.dive) return;
  const el = cfxBoltEl(b);
  if (!b.cfxHit) cfxBurst(b.x, b.y, cfxBoltCol(b), 0.4, el); // it ran out: a fizzle
}

// Ember's burst where its glob lands; a jump of a chain.
function castFxSpot(x, y, el, size = 1) {
  const d = Game.dive;
  if (!d) return;
  if (CFX.dive !== d) cfxReset(d);
  cfxBurst(x, y, cfxEl(el).col, size, el);
  if (size >= 1) cfxDecal(x, y + 4, cfxEl(el).decal, size > 1.4);
}

// A creature's death: the star takes it. The body goes out at once and
// nothing is left on the ground; its pixels, sampled from the frame it was
// drawn as, draw in to a knot of the star's light over where it stood,
// and the knot streams off the way the star lies (render.js drawAbsorbFx).
function castFxAbsorb(d, e) {
  const A = T.castFx.absorb, spr = enemySpriteNow(d, e), pts = [];
  if (spr && spr.c) {
    const w = spr.c.width, h = spr.c.height, D = spr.c.getContext('2d').getImageData(0, 0, w, h).data, all = [];
    // (one authored pixel each way; the picture is AF× at fine grain)
    const st = AF;
    for (let j = 0; j < h; j += st) for (let i = 0; i < w; i += st) {
      const o = (j * w + i) * 4;
      if (D[o + 3] < 128) continue;
      all.push({ dx: i - spr.ax, dy: j - spr.ay, col: '#' + ((D[o] << 16) | (D[o + 1] << 8) | D[o + 2]).toString(16).padStart(6, '0') });
    }
    const cap = e.boss ? 360 : 220, step = Math.max(1, all.length / cap);
    for (let k = 0; k < all.length; k += step) pts.push(all[Math.floor(k)]);
  }
  d.fx.push({ kind: 'absorb', x: e.x, y: e.y, t: A.t, max: A.t, pts, h: spr ? spr.ay : 10 * AF, big: !!e.boss, seed: (FX_R.f(0, 1) * 1000) | 0 });
  cfxFlare(e.x, e.y - 5, TILE * (e.boss ? 2 : 1.2), 0.7, ART.pal.star[2], 0.3);
}

// A spark (render.js's Sparks), at x, y on the view: a hot head and a
// streak of its colour back along its way, darker behind.
function cfxSpark(x, y, vx, vy, col, t) {
  const sp = Math.hypot(vx, vy) || 1, ux = vx / sp, uy = vy / sp, R = col === '#ffffff' ? null : cfxRamp(col);
  dot(x, y, R ? R[3] : col, true);
  if (sp > 15) dot(Math.round(x - ux * 1.5), Math.round(y - uy * 1.5), R ? R[2] : col, true, R ? 0.85 : 0.5);
  if (sp > 45 && R && t > 0.15) dot(Math.round(x - ux * 3), Math.round(y - uy * 3), R[1], true, 0.5);
}

// Where a shot lands: a flash frame, a shock ring, what its element
// throws (sparks that fall and bounce, molten gobs, ice, a cloud of
// nanites), and a flare of light (cfxDrawImpact draws the ring). Shock
// leaves emitter nodes arcing a moment; Frost grows crystals.
function cfxBurst(x, y, col, size, el) {
  const I = T.castFx.impact, n = Math.round(I[0] * size), E = cfxEl(el), st = cfxStyle(el);
  for (let k = 0; k < n; k++) {
    const a = FX_R.f(Math.PI * 2), s = FX_R.f(40, 110) * Math.sqrt(size), up = st === 'ember' ? -60 : -35;
    const q = cfxPart(E.burst === CFX_GLIM ? CFX_SPARK : E.burst, x, y, Math.cos(a) * s, Math.sin(a) * s * 0.75 + up, FX_R.f(0.25, 0.5) * (st === 'blight' ? 1.6 : 1), k % 3 ? col : '#ffffff', col);
    if (!q) continue;
    if (E.burst === CFX_NANITE) { q.drag = 4; q.vx *= 0.6; q.vy *= 0.6; q.col = k % 4 ? col : '#c890ff'; }
    else if (E.burst === CFX_CINDER) q.g = -20;
    else { q.g = st === 'ember' ? 300 : 260; q.floor = y + 8 + FX_R.f(-2, 2); q.drag = 0.8; }
  }
  if (E.smoke) for (let k = 0; k < 3 * size; k++) { const q = cfxPart(CFX_SMOKE, x + FX_R.f(-3, 3), y, FX_R.f(-8, 8), FX_R.f(-18, -8), FX_R.f(0.4, 0.7), '#2c2622', '#3e3630'); if (q) q.drag = 1; }
  CFX.rings.push({ kind: 'impact', x, y, col, st, size, t: 0.24, max: 0.24, f: false });
  if (size >= 0.6 && st === 'shock') CFX.rings.push({ kind: 'zap', x, y, col, size, t: 0.4, max: 0.4, f: false });
  if (size >= 0.6 && st === 'frost') CFX.rings.push({ kind: 'grow', x, y, col, size, t: 0.7, max: 0.7, f: false });
  cfxFlare(x, y, I[1] * TILE * Math.sqrt(size), I[2] * Math.min(1.3, size), st === 'ember' && size >= 0.6 ? col : col, I[3]);
}

// The ring where a shot lands (art px x, y; k: its life left): on its
// first frames an emissive white burst, spikes out, the flat ones longer;
// then a crisp ring two pixels thick running out (dotted as it dies), a
// dark stroke inside it so it holds on a pale floor; and by element: Force
// a heavy wave that bends the light (a bright edge, a dark band inside
// it, gold ticks), Shock arcs out from the heart, Frost facets, Ember a
// white-hot blob in a violet shell.
function cfxDrawImpact(r, x, y, k, ft) {
  const u = 1 - k, R = cfxRamp(r.col), b = cfxBand(k), sz = r.size, sd = cfxSeed(r);
  if (sz < 0.6) { hlDiamond(x, y, 2 + Math.round(u * 3), R[3], b); dot(x, y, R[4], true, b); return; }
  if (u < 0.16) {
    const rr = Math.round(3 + 2 * sz);
    for (let j = -rr; j <= rr; j++) for (let i = -rr; i <= rr; i++) if (i * i + j * j * 1.6 <= rr * rr) dot(x + i, y + j, '#ffffff', true);
    const L = Math.round(10 * sz);
    for (let i = rr; i <= L; i++) { const c = i < L * 0.6 ? '#ffffff' : R[4]; dot(x + i, y, c, true); dot(x - i, y, c, true); if (i <= L * 0.6) { dot(x, y + i, c, true); dot(x, y - i, c, true); } }
  }
  const rx = Math.round(3 + u * (12 + 8 * sz)), ry = Math.max(1, Math.round(rx * 0.75)), heavy = r.st === 'force';
  let n = 0;
  for (const [i, j] of cfxEllipse(rx, ry)) {
    if (u > 0.6 && n++ % 2) continue;
    dot(x + i, y + j, u < 0.35 ? '#ffffff' : R[j > 0 ? 4 : 3], true, b);
    const ii = i - Math.sign(i) * (Math.abs(i) > Math.abs(j) ? 1 : 0), jj = j - Math.sign(j) * (Math.abs(i) > Math.abs(j) ? 0 : 1);
    if (u < 0.6) dot(x + ii, y + jj, R[3], true, b * 0.9);
    // the dark band inside it: a heavy one bends the light
    if (heavy || u < 0.5) { const s = heavy ? 3 : 2; dot(x + Math.round(i * (1 - s / rx)), y + Math.round(j * (1 - s / ry)), '#000000', false, (heavy ? 0.4 : 0.25) * b); if (heavy) dot(x + Math.round(i * (1 - 4 / rx)), y + Math.round(j * (1 - 4 / ry)), '#000000', false, 0.3 * b); }
  }
  if (heavy) for (let q = 0; q < 8; q++) { const a = (q / 8) * Math.PI * 2 + Math.PI / 8, c = Math.cos(a), s = Math.sin(a) * 0.75; for (let i = 1; i <= 3; i++) dot(Math.round(x + c * (rx + i)), Math.round(y + s * (rx + i)), HL_GOLD[i === 1 ? 4 : 3], true, b); }
  else if (r.st === 'shock' && u < 0.7) for (let q = 0; q < 4; q++) {
    const a = artHash(q, ft >> 1, sd) * Math.PI * 2, L = rx + 4 + artHash(q, 5, sd) * 6;
    cfxPaintBolt(cfxBoltPath(x, y, x + Math.cos(a) * L, y + Math.sin(a) * L * 0.75, sd + ft, 0.3), R, b, 1, sd);
  } else if (r.st === 'frost') cfxShards(x, y, rx + 3, 6, R, b, sd, true);
  else if (r.st === 'ember') {
    const S = cfxRamp(CFX_SHELL), rr = rx + 3;
    let m = 0;
    for (const [i, j] of cfxEllipse(rr, Math.max(1, Math.round(rr * 0.75)))) if (m++ % 2 === 0) dot(x + i, y + j, S[u < 0.5 ? 4 : 3], true, b);
    if (u < 0.55) { const br = u < 0.3 ? 3 : 2; for (let j = -br; j <= br; j++) for (let i = -br; i <= br; i++) if (i * i + j * j <= br * br) dot(x + i, y + j, i * i + j * j <= 1 ? '#ffffff' : R[4], true); }
  }
}

// A column of the Charter's light from x, y (art px) up past the top of
// the view (a resonance waking, a star's strike): a white core, gold
// either side, narrowing as it dies and switching off in scan-lines, its
// light on the ground round its foot.
function cfxDrawPillar(r, x, y, k, ft, lights) {
  const w = Math.max(1, Math.round(r.w * (0.35 + 0.65 * k))), b = cfxBand(Math.min(1, k * 1.4)), G = HL_GOLD;
  for (let j = y; j >= -2; j--) {
    if (k < 0.5 && (j + ft) % 2) continue;
    if (k < 0.25 && (j + ft) % 3) continue;
    for (let i = -w; i <= w; i++) {
      const e = Math.abs(i) / (w + 0.5), h = artHash(i, j >> 2, ft >> 2);
      if (e > 0.75 && h < 0.4) continue;
      dot(x + i, j, e < 0.3 ? '#ffffff' : e < 0.6 ? G[4] : e < 0.85 ? G[3] : G[2], true, b);
    }
  }
  // its foot: a flat flare on the ground
  for (let i = -w * 3; i <= w * 3; i++) dot(x + i, y, Math.abs(i) < w ? '#ffffff' : G[3], true, b * (1 - Math.abs(i) / (w * 3 + 1)));
  cfxLight(lights, x, y - 6, TILE * (1.5 + r.w * 0.25), 1.4 * k, rgb01(G[3]));
}

// Shock's emitter nodes where it struck: three, turning, arcs jumping
// between them and into the heart, a new shape every other frame.
function cfxDrawZap(r, x, y, k, ft) {
  const R = cfxRamp(r.col), b = cfxBand(k), sd = cfxSeed(r), rr = Math.round(8 * r.size), nodes = [];
  for (let q = 0; q < 3; q++) { const a = Game.realT * 3 + (q * Math.PI * 2) / 3; nodes.push([Math.round(x + Math.cos(a) * rr), Math.round(y - 4 + Math.sin(a) * rr * 0.6)]); }
  for (let q = 0; q < 3; q++) {
    const a = nodes[q], c = nodes[(q + 1) % 3];
    if ((ft >> 1) % 3 !== q) cfxPaintBolt(cfxBoltPath(a[0], a[1], c[0], c[1], sd + (ft >> 1) * 7 + q, 0.3), R, b, 0.9, sd + q);
    else cfxPaintBolt(cfxBoltPath(a[0], a[1], x, y - 4, sd + (ft >> 1) * 5, 0.3), R, b, 1.1, sd);
    hlDiamond(a[0], a[1], 1, '#ffffff', b, HL_GOLD[4]);
  }
}

// Frost where it struck: crystals that grow out of it over their first
// third, hold, and switch off in scan-lines: long ones on six axes, short
// ones between, each lit on its upper side and deep below.
function cfxDrawGrow(r, x, y, k, ft) {
  const u = 1 - k, g = Math.min(1, u / 0.35), R = cfxRamp(r.col), sd = cfxSeed(r), b = k > 0.4 ? 1 : cfxBand(k / 0.4), Lmax = 11 * r.size;
  for (let q = 0; q < 12; q++) {
    const long = q % 2 === 0, a = (q / 12) * Math.PI * 2 + 0.26 + artHash(q, 1, sd) * 0.2, c = Math.cos(a), s = Math.sin(a) * 0.75, L = Math.round(Lmax * g * (long ? 0.8 + 0.4 * artHash(q, 2, sd) : 0.45));
    for (let i = 2; i <= L; i++) {
      const px = Math.round(x + c * i), py = Math.round(y + s * i), f = i / Math.max(1, L);
      if (k < 0.4 && (py + ft) % 2) continue;
      dot(px, py, R[f > 0.85 ? 4 : f < 0.4 ? 4 : 3], true, b);
      if (long && f < 0.7) { dot(px, py - 1, R[3], true, b); dot(px, py + 1, R[0], false, b * 0.7); }
      // a branch partway along
      if (long && i === Math.round(L * 0.55) && L > 5) for (let m = 1; m <= 3; m++) { dot(Math.round(px + Math.cos(a + 0.8) * m), Math.round(py + Math.sin(a + 0.8) * m * 0.75), R[3], true, b); dot(Math.round(px + Math.cos(a - 0.8) * m), Math.round(py + Math.sin(a - 0.8) * m * 0.75), R[2], true, b); }
    }
  }
  if (g < 1) hlDiamond(x, y, 2, '#ffffff', 1);
}

// Blight's swarms (vx, vy: a world point on the view): nanites crawling
// over the foe they cling to, thicker at first, eating: green specks, some
// with a violet sheen, some dark, a few drifting off.
function cfxDrawSwarms(vx, vy, ft) {
  for (const w of CFX.swarms) {
    const e = w.e;
    if (e.dead || e.hid) continue;
    const k = w.t / w.max, R = cfxRamp(w.col), n = Math.round(w.n * (0.4 + 0.6 * k)), cx = vx(e.x), cy = vy(e.y) - ap(e.r + 3), rx = ap(e.r + 3), ry = ap(e.r + 6);
    for (let q = 0; q < n; q++) {
      const h = artHash(q, (ft >> 1) + q, w.sd), h2 = artHash(q + 99, (ft >> 1) + q * 3, w.sd), x = Math.round(cx + (h - 0.5) * 2 * rx), y = Math.round(cy + (h2 - 0.5) * 2 * ry);
      const dk = q % 6 === 0;
      dot(x, y, dk ? '#142008' : q % 5 === 0 ? '#c890ff' : R[q % 3 ? 3 : 4], !dk, k > 0.3 ? 1 : 0.7);
      if (q % 4 === 0 && !dk) dot(x + 1, y, R[2], true, 0.8);
    }
    if (ft % 6 === 0 && k > 0.3) { const q = cfxPart(CFX_NANITE, e.x + FX_R.f(-e.r, e.r), e.y - FX_R.f(2, 12), FX_R.f(-10, 10), FX_R.f(-14, -4), FX_R.f(0.3, 0.5), w.col, w.col); if (q) q.drag = 2; }
  }
}

// Facets of ice out from x, y (art px) on n axes to r, the other axes
// half as long: each a line hot at its root, a pixel either side near it,
// lit on its upper side (a crystal, not a spray).
function cfxShards(x, y, r, n, R, alpha, sd, between) {
  for (let q = 0; q < n * (between ? 2 : 1); q++) {
    const long = q % 2 === 0 || !between, a = (q / (n * (between ? 2 : 1))) * Math.PI * 2 + 0.26 + artHash(q, 1, sd) * 0.15, c = Math.cos(a), s = Math.sin(a) * 0.75, L = Math.round(r * (long ? 1 : 0.5)), r0 = Math.round(r * 0.3);
    for (let i = r0; i <= L; i++) {
      const px = Math.round(x + c * i), py = Math.round(y + s * i), f = (i - r0) / Math.max(1, L - r0);
      dot(px, py, R[f < 0.4 ? 4 : f < 0.8 ? 3 : 2], true, alpha);
      if (f < 0.5 && long) { dot(Math.round(px + s), Math.round(py - c * 0.75) - 1, R[3], true, alpha * 0.8); dot(Math.round(px - s), Math.round(py + c * 0.75) + 1, R[1], true, alpha * 0.8); }
    }
  }
}

// The lock-ons (fx, fy: the diver's feet on the view): gold brackets that
// close in on their foe and hold, blinking as they go; a guide line out
// from the fist for an instant.
function cfxDrawLocks(fx, fy, vx, vy, ft) {
  const L = T.castFx.lock;
  for (const l of CFX.locks) {
    const e = l.e;
    if (e.dead || e.hid) continue;
    const age = Game.realT - l.born, k = l.t / l.max, snap = Math.min(1, age / L[1]), grow = 1 + (1 - snap) * (1 - snap) * 1.6;
    const cx = vx(e.x), cy = vy(e.y) - ap(e.r + 5), w = ap(e.r * 2 + 9) * grow, h = ap(e.r * 2 + 12) * grow;
    if (snap >= 1 && k < 0.35 && ft % 4 < 2) continue;
    hlBrackets(cx, cy, w, h, snap < 1 ? 4 : 6, HL_GOLD[snap < 1 ? 3 : 4], cfxBand(Math.min(1, k * 1.6)), 2);
    if (snap >= 1 && k > 0.35) {
      // the aim point: a small diamond in the spell's colour, ticks out
      const R = cfxRamp(l.col);
      hlDiamond(cx, cy, 2, R[4], 0.95);
      for (const [i, j] of [[5, 0], [-5, 0], [0, 4], [0, -4], [6, 0], [-6, 0]]) dot(cx + i, cy + j, R[3], true, 0.9);
    }
    if (age < L[2] && l.hand) {
      const x0 = fx + Math.round(l.hand.x * AP), y0 = fy + Math.round(l.hand.y * AP);
      hlLine(x0, y0, cx, cy, cfxRamp(l.col)[4], true, 0.85, 2);
      hlLine(x0, y0 + 1, cx, cy + 1, '#120c04', false, 0.35, 2);
    }
  }
}

// The Charter's seed-star flashing (a resonance wakes, a star falls): the
// mark itself, swelling and breaking to scan-lines as it dies.
function cfxDrawSeed(r, x, y, k) {
  const big = r.big ? 1 : 0, sz = k > 0.7 ? (big ? 18 : 8) : k > 0.4 ? (big ? 12 : 8) : big ? 12 : 5;
  cfxBlitHard(hlSeedPic(sz), x, y, k);
}

// A lance's scars on the ground (art px ox, oy: the floor's offset): a
// line burnt along its way, white-hot while the beam is on it, cooling
// through its colour to a dark burn that fades; Frost leaves ice across
// it, Shock forks off it, Ember stays hot longer, Blight eats ragged.
function cfxDrawScars(ox, oy) {
  for (const sc of CFX.scars) {
    let k = sc.t / sc.max;
    if (sc.st === 'ember') k = Math.min(1, k * 1.25);
    const x0 = Math.round(sc.x0 * AP) + ox, y0 = Math.round(sc.y0 * AP) + oy, x1 = Math.round(sc.x1 * AP) + ox, y1 = Math.round(sc.y1 * AP) + oy, L = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    if (Math.max(x0, x1) < -8 || Math.min(x0, x1) > View.w + 8 || Math.max(y0, y1) < -8 || Math.min(y0, y1) > View.h + 8) continue;
    const R = cfxRamp(sc.col), core = [], edge = [], ux = (x1 - x0) / L, uy = (y1 - y0) / L, hot = k > 0.82, broken = k > 0.6 ? 0.1 : k > 0.35 ? 0.35 : 0.6;
    // (the nearer the head, the hotter, while the beam's on it)
    for (let i = 0; i <= L; i++) {
      if (artHash(Math.floor(i / 3), 1, sc.sd) < broken * (1 - (sc.b ? i / L : 0))) continue;
      const x = Math.round(x0 + ux * i), y = Math.round(y0 + uy * i) + (sc.st === 'blight' && artHash(i, 2, sc.sd) < 0.3 ? 1 : 0);
      core.push(x, y);
      if (hot && artHash(i, 3, sc.sd) < 0.6) edge.push(x, y - 1);
      if (sc.st === 'frost' && k > 0.45 && i % 7 === 3) edge.push(x - 1, y - 1, x + 1, y + 1, x + 1, y - 1, x - 1, y + 1);
      if (sc.st === 'shock' && hot && i % 11 === 5) { const s = artHash(i, 4, sc.sd) < 0.5 ? 1 : -1; edge.push(x + s, y + 1, x + 2 * s, y + 1, x + 2 * s, y + 2); }
    }
    if (k > 0.3) {
      hlDots(core, R[hot ? 4 : k > 0.6 ? 3 : 2], true, k > 0.45 ? 1 : 0.7);
      hlDots(edge, R[hot ? 2 : 3], true, 0.8);
    } else hlDots(core, mix(R[0], '#0a0806', 0.4), false, k / 0.3 * 0.6);
  }
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
    } else Tycho.fx.move(q, dt); // drag, gravity, and a bounce off the ground under where it was thrown from
    P[n++] = q;
  }
  P.length = n;
  const tick = (list) => Tycho.fx.tick(list, dt);
  tick(CFX.rings); tick(CFX.decals); tick(CFX.ghosts); tick(CFX.flares); tick(CFX.waves); tick(CFX.locks); tick(CFX.scars); tick(CFX.swarms);
  // bolts: leaving the fist, and what they shed
  const o = CFX.origin, fresh = o && Game.realT - o.t < 0.05;
  for (const b of d.bolts) {
    if (!b.cfx) {
      b.cfx = { ox: fresh ? o.x : 0, oy: fresh ? o.y + 8 : 0, born: Game.realT, emit: 0, n: 0, x0: b.x, y0: b.y };
      // a lance burns its line into the ground as it goes
      if (b.kind === 'lance') {
        if (CFX.scars.length >= C.scar[1]) CFX.scars.shift();
        CFX.scars.push({ b, x0: b.x, y0: b.y + 8, x1: b.x, y1: b.y + 8, col: cfxBoltCol(b), st: cfxStyle(b.element), t: C.scar[0], max: C.scar[0], sd: 1 + ((Math.random() * 1e6) | 0) });
      }
      if (fresh) for (let k = 0; k < 2; k++) {
        const sp = Math.hypot(b.vx, b.vy) || 1, s = FX_R.f(0.3, 0.6), q = cfxPart(CFX_STREAK, p.x + o.x, p.y + o.y, (b.vx / sp) * 90 * s + FX_R.f(-15, 15), (b.vy / sp) * 90 * s + FX_R.f(-15, 15), 0.14, '#ffffff', cfxBoltCol(b));
        if (q) q.drag = 6;
      }
    }
    if ((b.cfx.emit -= dt) > 0) continue;
    b.cfx.emit = C.bolt.every / (b.big ? 2 : 1);
    cfxShed(b.x, b.y, cfxBoltEl(b), cfxBoltCol(b), b.cfx.n++, b.vx, b.vy);
    // a charged shot leaves shock rings standing in the air behind it
    if ((b.big || (cfxStyle(b.element) === 'force' && b.kind === 'bolt')) && b.cfx.n % 3 === 0) CFX.rings.push({ kind: 'edge', x: b.x, y: b.y, a: Math.atan2(b.vy, b.vx), col: cfxBoltCol(b), t: 0.16, max: 0.16, f: false });
  }
  // contrails: each shot's way, kept a while after it's gone
  const now = Game.realT, Lg = C.bolt.linger;
  for (const tr of CFX.trails) tr.alive = false;
  for (const b of d.bolts) {
    if (b.orb || b.kind === 'lance' || !b.cfx) continue;
    let tr = b.cfx.trail;
    if (!tr) {
      if (CFX.trails.length >= 24) CFX.trails.shift();
      const sp = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / sp, uy = b.vy / sp;
      tr = b.cfx.trail = { pts: [], col: cfxBoltCol(b), st: cfxStyle(b.element), big: b.big, lx: Math.abs(ux) > 0.3 ? 0 : -1, ly: Math.abs(ux) > 0.3 ? -1 : 0 };
      CFX.trails.push(tr);
    }
    const o2 = Math.max(0, 1 - (now - b.cfx.born) / C.bolt.originT);
    tr.pts.push([b.x + b.cfx.ox * o2, b.y + b.cfx.oy * o2, now, (Math.random() * 1000) | 0]);
    tr.alive = true;
  }
  for (const tr of CFX.trails) { let k = 0; while (k < tr.pts.length - 1 && now - tr.pts[k][2] > Lg) k++; if (k) tr.pts.splice(0, k); }
  CFX.trails = CFX.trails.filter((tr) => tr.alive || (tr.pts.length > 1 && now - tr.pts[tr.pts.length - 1][2] < Lg));
  for (const sc of CFX.scars) if (sc.b) { if (sc.b.t > 0 && d.bolts.includes(sc.b)) { sc.x1 = sc.b.x; sc.y1 = sc.b.y + 8; sc.t = sc.max; } else sc.b = null; }
  updateResonanceFx(dt);
  // a spell being charged draws motes into its wrist
  for (const slot of ['main', 'off']) {
    const h = p.hands[slot], it = Save.data.equip.main;
    if (!h.holding || !isCaster(it)) continue;
    const lv = chargeLevel(h);
    if (lv <= 0 || FX_R.f() > C.charge.motes * lv * dt) continue;
    const at = CFX.focusAt[slot] || { x: 0, y: -12 }, a = FX_R.f(Math.PI * 2), r = FX_R.f(14, 22), col = castFxCol(it, slot);
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
    case CFX_CINDER: {
      const q = cfxPart(CFX_CINDER, x, y, -vx * 0.08 + FX_R.f(-10, 10), FX_R.f(-30, -15), FX_R.f(0.25, 0.4), '#ffd070', c);
      if (q) q.g = -10;
      // and molten drips falling from it
      if (n % 2) { const g = cfxPart(CFX_GOB, x, y + 1, vx * 0.1, 10, FX_R.f(0.3, 0.45), '#ffd070', c); if (g) { g.g = 260; g.floor = y + 8; } }
      break;
    }
    case CFX_SPARK: { const a = FX_R.f(Math.PI * 2); cfxPart(CFX_SPARK, x, y, Math.cos(a) * 45, Math.sin(a) * 45, 0.1, n % 2 ? '#ffffff' : c); break; }
    case CFX_DRIP: { const q = cfxPart(CFX_DRIP, x, y + 1, 0, 8, FX_R.f(0.3, 0.45), c, E.dark || c); if (q) q.g = 70; break; }
    case CFX_NANITE: { for (let k = 0; k < 2; k++) { const q = cfxPart(CFX_NANITE, x + FX_R.f(-2, 2), y + FX_R.f(-2, 2), -vx * 0.05 + FX_R.f(-8, 8), FX_R.f(-6, 6), FX_R.f(0.3, 0.5), n % 3 ? c : '#c890ff', c); if (q) q.drag = 3; } break; }
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
// at cx, cy: set(x, y, colour) from the middle; or drawn by draw(context).
const _cfxPics = new Map();
function cfxPic(key, w, h, paint, draw) {
  let pic = _cfxPics.get(key);
  if (pic) return pic;
  if (_cfxPics.size > 1500) _cfxPics.clear();
  const cx = w >> 1, cy = h >> 1, [c, x] = makeCanvas(w, h);
  if (draw) draw(x);
  else {
    const img = new ImageData(w, h), D = img.data;
    paint((x, y, col, a = 1) => {
      const X = x + cx, Y = y + cy;
      if (X < 0 || Y < 0 || X >= w || Y >= h) return;
      const c = rgbOf(col), k = (Y * w + X) * 4;
      D[k] = c[0]; D[k + 1] = c[1]; D[k + 2] = c[2]; D[k + 3] = a * 255;
    });
    x.putImageData(img, 0, 0);
  }
  pic = { c, cx, cy, key };
  _cfxPics.set(key, pic);
  return pic;
}

// A cast's light (x, y on the view, r world px, i, c as for lights). In
// the dark, as it is. Under the sky in daylight a light would only wash the
// ground and the diver out, so it's small and tight (T.castFx.day: a share
// of its radius), and kept faint: lights that overlap are merged into
// one, and none is brighter than T.castFx.dayMost (cfxDayLights). The
// pixels carry the cast there, not the light.
function cfxLight(lights, x, y, r, i, c) {
  if (!CFX.day) { lights.push({ x, y, r, i, c }); return; }
  CFX.dayLights.push({ x, y, r: r * T.castFx.day, i: Math.min(i, T.castFx.dayMost), c });
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

// The rune circle: an outer ring in short strokes of two tones (a pixel
// thicker at the front), a broken inner one, and six marks between them
// turning. rx in art px; rot: which of six turns.
function cfxGlyphPic(rx, col, rot) { return hlSigilPic(rx, col, rot); }

// A kept picture switching off as hard light does: whole while k (the
// share of its life left) is over a half, then every other row, then two
// rows in three; alpha besides.
function cfxBlitHard(pic, x, y, k, alpha = 1) {
  if (k <= 0) return;
  cfxBlit(k > 0.5 ? pic : hlScanPic(pic, k > 0.25 ? 2 : 3), x, y, alpha * (k > 0.25 ? 1 : 0.75));
}

// A mark left on the ground, by element, each kind a few shapes painted
// once: a death's splash (cfxSplatPic); a shot's mark (cfxMarkPic):
// Ember a plasma splash, a scorch with molten pools glowing in it and a
// violet fleck or two; Frost a bloom of rime on six axes, branching;
// Shock a burn crazed with branching lines that glow; Blight a nanite
// stain, specks in it still glowing; Force a ring pressed into the ground
// with gold cracks out from it. What glows in it dies first.
// Returns { c: colour, e: what glows }.
const _cfxDecals = new Map();
function cfxDecalPic(kind, big, v) {
  if (!kind.startsWith('splat:')) return cfxMarkPic(kind, big, v);
  return cfxSplatPic(kind, big, v);
}
function cfxMarkPic(kind, big, v) {
  const key = `m${kind} ${big ? 1 : 0} ${v}`;
  let pic = _cfxDecals.get(key);
  if (pic) return pic;
  const W = 40, H = 20, glows = [], S = big ? 1.4 : 1, rnd = (() => { let q = hashInts(v, big ? 7 : 3, kind.length * 31 + kind.charCodeAt(0)); return () => ((q = (q * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); })();
  const col = cfxPic(`mc${key}`, W, H, (set) => {
    const blob = (rx, ry, c0, c1, a) => { for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) { const e = (x * x) / (rx * rx) + (y * y) / (ry * ry), h = artHash(x, y, v + 11); if (e <= 1 - h * 0.35) set(x, y, e < 0.4 ? c0 : c1, a); } };
    if (kind === 'ember') {
      blob(Math.round(7 * S), Math.round(3 * S), '#140806', '#2a140a', 0.9);
      for (let k = 0; k < (big ? 6 : 4); k++) { const x = Math.round((rnd() - 0.5) * 9 * S), y = Math.round((rnd() - 0.5) * 3 * S); glows.push([x, y, '#fff0c8'], [x + 1, y, ELEMENT_COLS.ember], [x - 1, y, '#ff6a20'], [x, y + 1, '#c04818']); }
      for (let k = 0; k < 3; k++) { const a = rnd() * Math.PI * 2; glows.push([Math.round(Math.cos(a) * 8 * S), Math.round(Math.sin(a) * 3.5 * S), CFX_SHELL]); }
    } else if (kind === 'frost') {
      for (let q = 0; q < 6; q++) {
        const a = (q / 6) * Math.PI * 2 + 0.26, L = Math.round((q % 2 ? 5 : 8) * S), c = Math.cos(a), sn = Math.sin(a) * 0.5;
        for (let i = 0; i <= L; i++) { const x = Math.round(c * i), y = Math.round(sn * i); set(x, y, i < L * 0.5 ? '#f4fcff' : '#b4dcf0'); if (i === Math.round(L * 0.6)) for (let m = 1; m <= 2; m++) { set(Math.round(x + Math.cos(a + 0.9) * m), Math.round(y + Math.sin(a + 0.9) * m * 0.5), '#cfeaf8'); set(Math.round(x + Math.cos(a - 0.9) * m), Math.round(y + Math.sin(a - 0.9) * m * 0.5), '#cfeaf8'); } }
        glows.push([Math.round(c * L), Math.round(sn * L), ELEMENT_COLS.frost]);
      }
      glows.push([0, 0, '#ffffff'], [1, 0, '#ffffff']);
    } else if (kind === 'shock') {
      blob(Math.round(3 * S), 2, '#0e0e14', '#1e2028', 0.9);
      for (let q = 0; q < (big ? 5 : 4); q++) {
        let x = 0, y = 0, a = rnd() * Math.PI * 2;
        for (let i = 0; i < Math.round(9 * S); i++) { a += (rnd() - 0.5) * 1.2; x += Math.cos(a); y += Math.sin(a) * 0.5; const X = Math.round(x), Y = Math.round(y); set(X, Y, '#16161e'); if (i % 2 === 0) glows.push([X, Y, i < 4 ? '#fff4a8' : ELEMENT_COLS.shock]); }
      }
    } else if (kind === 'blight') {
      blob(Math.round(6 * S), Math.round(3 * S), '#16200c', '#2a3a14', 0.85);
      for (let k = 0; k < (big ? 10 : 7); k++) { const x = Math.round((rnd() - 0.5) * 14 * S), y = Math.round((rnd() - 0.5) * 6 * S); set(x, y, '#3e5420'); glows.push([x, y, k % 3 === 0 ? '#c890ff' : ELEMENT_COLS.blight]); }
    } else {
      // a ring pressed in, darker inside, gold cracks out from it
      const rx = Math.round(5 * S), ry = Math.round(2.5 * S);
      blob(rx - 1, Math.max(1, ry - 1), '#100e18', '#1c1828', 0.75);
      for (const [x, y] of cfxEllipse(rx, ry)) set(x, y, y < 0 ? '#3a3448' : '#141020', 0.95);
      for (let q = 0; q < 6; q++) { const a = (q / 6) * Math.PI * 2 + rnd() * 0.4, c = Math.cos(a), sn = Math.sin(a) * 0.5; for (let i = rx; i <= rx + Math.round(3 * S); i++) { const X = Math.round(c * i), Y = Math.round(sn * i); set(X, Y, '#120e18'); glows.push([X, Y, i === rx ? HL_GOLD[4] : HL_GOLD[2]]); } }
    }
  });
  const em = cfxPic(`me${key}`, W, H, (set) => { for (const [x, y, c] of glows) set(x, y, c); });
  pic = { col, em, splat: false };
  _cfxDecals.set(key, pic);
  return pic;
}
function cfxSplatPic(kind, big, v) {
  const key = `${kind} ${big ? 1 : 0} ${v}`;
  let pic = _cfxDecals.get(key);
  if (pic) return pic;
  const n = (kind.startsWith('splat:') ? 1.4 : 1) * (big ? 26 : 15), cells = new Map([['0,0', 1]]), list = [[0, 0]];
  while (list.length < n) {
    const [x, y] = list[(Math.random() * list.length) | 0], dir = (Math.random() * 6) | 0;
    const nx = x + (dir < 2 ? 1 : dir < 4 ? -1 : 0), ny = y + (dir === 4 ? 1 : dir === 5 ? -1 : 0);
    if (Math.abs(ny) > (big ? 3 : 2)) continue;
    const k = nx + ',' + ny;
    if (!cells.has(k)) { cells.set(k, 1); list.push([nx, ny]); }
  }
  const nb = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([i, j]) => cells.has(x + i + ',' + (y + j))).length;
  const W = 24, H = 14, glows = [];
  // (a death's splash, in the colour after 'splat:')
  const sc = kind.startsWith('splat:') ? kind.slice(6) : null;
  const tones = sc ? [mix(sc, '#0a0806', 0.55), mix(sc, '#0a0806', 0.25)] : {
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
    if (sc) {
      // its upper-left edge wet and catching the light, so it holds on a
      // dark floor; flecks thrown round it, a short stroke each, some of
      // them still glowing (they die first)
      const lit = mix(sc, '#ffffff', 0.15);
      for (const [x, y] of list) if (!cells.has(x + ',' + (y - 1)) || !cells.has(x - 1 + ',' + y)) { if (Math.random() < 0.55) set(x, y, mix(sc, '#0a0806', 0.08), 0.9); }
      for (let k = 0; k < (big ? 9 : 6); k++) {
        const fx = Math.round((Math.random() * 2 - 1) * (big ? 11 : 8)), fy = Math.round((Math.random() * 2 - 1) * (big ? 4 : 3));
        set(fx, fy, tones[1], 0.9); set(fx + 1, fy, tones[1], 0.7);
        if (k % 2 === 0) glows.push([fx, fy, k % 4 ? sc : lit]);
      }
      for (let k = 0; k < (big ? 3 : 2); k++) { const [x, y] = list[(Math.random() * list.length) | 0]; glows.push([x, y, sc]); }
      return;
    }
    const lit = { ember: [ELEMENT_COLS.ember, '#ffd070'], shock: [ELEMENT_COLS.shock], blight: [ELEMENT_COLS.blight], arcane: [ART.forms.bolt], spark: ['#e8f4ff'] }[kind] || [ART.forms.bolt];
    const inner = list.filter(([x, y]) => nb(x, y) >= 3);
    for (let k = 0; k < (big ? 4 : 2); k++) { const [x, y] = inner[(Math.random() * inner.length) | 0] || [0, 0]; glows.push([x, y, lit[k % lit.length]]); }
    if (kind === 'shock') for (const s of [-1, 1]) for (let i = 2; i < 5; i++) glows.push([s * i, i % 2 ? 0 : -s, ELEMENT_COLS.shock]);
  });
  const em = cfxPic(`de${key}`, W, H, (set) => { for (const [x, y, c] of glows) set(x, y, c); });
  pic = { col, em, splat: !!sc };
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
  const zl = T.zones[d.zone] && T.zones[d.zone].light;
  CFX.day = !!(zl && sunOf(d) > zl.lampAt);
  CFX.dayLights.length = 0;
  if (CFX.dive !== d) return;
  const p = d.p, c = View.ctx, e = View.emCtx;
  for (const m of CFX.decals) {
    const k = m.t / m.max, x = Math.round(m.x * AP) + ox, y = Math.round(m.y * AP) + oy;
    if (x < -20 || y < -20 || x > View.w + 20 || y > View.h + 20) continue;
    c.globalAlpha = cfxBand(k);
    c.drawImage(m.pic.col.c, x - m.pic.col.cx, y - m.pic.col.cy);
    // (a death's splash in a dark place holds over the light a little, as
    // the floor there is painted lighter for the dark: it'd vanish in it)
    if (m.pic.splat && View.darkHere > 0.05) { e.globalAlpha = cfxBand(k) * 0.55 * View.darkHere; e.drawImage(m.pic.col.c, x - m.pic.col.cx, y - m.pic.col.cy); }
    // what glows in it dies first
    const g = cfxBand(k * 2 - 1);
    if (g > 0) { c.globalAlpha = g; c.drawImage(m.pic.em.c, x - m.pic.em.cx, y - m.pic.em.cy); e.globalAlpha = g; e.drawImage(m.pic.em.c, x - m.pic.em.cx, y - m.pic.em.cy); }
    c.globalAlpha = e.globalAlpha = 1;
  }
  cfxDrawScars(ox, oy);
  cfxWellCores(d, ox, oy);
  const fx = Math.round(p.x * AP) + ox, fy = Math.round(p.y * AP) + oy;
  // the casts' light on the ground: loose strokes of its colour under each
  // flare (on the ground under it: at the feet for one at the fist)
  for (const l of CFX.flares) {
    const k = l.t / l.max, a = cfxBand(k) * Math.min(1, 0.45 + l.i * 0.5);
    if (a <= 0) continue;
    const r = Math.max(8, Math.round((l.r * AP * T.paint.fx.lightR * (0.6 + 0.4 * k)) / 4) * 4), pic = cfxLightPic(r, l.col, l.v);
    const x = l.f ? fx + Math.round(l.x * AP) : Math.round(l.x * AP) + ox, y = l.f ? fy + 2 : Math.round((l.y + 6) * AP) + oy;
    if (x < -r - 8 || y < -r || x > View.w + r + 8 || y > View.h + r) continue;
    c.globalAlpha = a * T.paint.fx.lightA;
    c.drawImage(pic.c, x - pic.cx, y - pic.cy);
    c.globalAlpha = 1;
  }
  for (const r of CFX.rings) {
    if (r.kind !== 'glyph' && !(r.kind === 'sweep' && !r.air)) continue;
    const k = r.t / r.max, u = 1 - k, x = r.f ? fx + Math.round(r.x * AP) : Math.round(r.x * AP) + ox, y = r.f ? fy + Math.round(r.y * AP) : Math.round(r.y * AP) + oy;
    if (r.kind === 'glyph') {
      const rx = cfxQuant(lerp(r.r0, r.r1, 1 - (1 - u) * (1 - u)) * AP), rot = (r.rot + Math.floor(Game.realT * 12)) % 6;
      cfxBlitHard(cfxGlyphPic(rx, r.col, rot), x, y, k, r.ghost ? 0.5 : 1);
      if (r.seed) cfxBlitHard(hlSeedPic(8), x, y - 1, k);
    } else {
      // a pressure wave: crisp while it runs, in scan-lines as it dies
      cfxBlitHard(hlWavePic(hlQuant(lerp(r.r0, r.r1, 1 - (1 - u) * (1 - u)) * AP), r.col, 0.6), x, y, Math.min(1, k * 1.6));
    }
  }
  // a spell being charged: a circle growing under the feet, flashing when full
  for (const slot of ['main', 'off']) {
    const h = p.hands[slot], it = Save.data.equip.main;
    if (!h.holding || !isCaster(it)) continue;
    const lv = chargeLevel(h);
    if (lv <= 0) continue;
    const C = T.castFx.charge, rx = cfxQuant(lerp(C.glyph[0], C.glyph[1], lv) * AP), full = lv >= 1;
    cfxBlit(cfxGlyphPic(rx, full && tick % 2 ? '#ffffff' : castFxCol(it, slot), Math.floor(Game.realT * (6 + lv * 10)) % 6), fx, fy, full ? 1 : lv > 0.5 ? 0.75 : 0.5);
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
  const p = d.p, px = p.x, py = p.y, ft = Math.floor(Game.realT * 30);
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
      case CFX_STREAK: case CFX_SPARK: {
        // a short streak back along its way: a hot head, its colour behind
        const x = vx(q.x), y = vy(q.y), sp = Math.hypot(q.vx, q.vy) || 1, ux = q.vx / sp, uy = q.vy / sp;
        dot(x, y, q.col, !q.dark, a);
        if (sp > 20) {
          dot(Math.round(x - ux * 1.5), Math.round(y - uy * 1.5), q.col2, !q.dark, a * 0.75);
          if (sp > 55 && k > 0.4) dot(Math.round(x - ux * 3), Math.round(y - uy * 3), cfxRamp(q.col2)[1], !q.dark, a * 0.5);
        }
        break;
      }
      case CFX_CINDER: { const x = vx(q.x), y = vy(q.y); dot(x, y, (tick + q.id) % 3 ? q.col2 : q.col, true, a); if (k > 0.5) dot(x, y + 1, cfxRamp(q.col2)[1], true, a * 0.6); break; }
      case CFX_SMOKE: {
        // a soft puff, a short stroke and a top, not glowing
        const x = vx(q.x), y = vy(q.y), sa = 0.6 * a, w = k < 0.6 ? 3 : 2;
        for (let i = 0; i < w; i++) dot(x + i, y, i ? q.col2 : q.col, false, sa);
        dot(x + 1, y - 1, q.col2, false, sa * 0.8);
        if (k < 0.6) dot(x + 2, y - 1, q.col, false, sa * 0.6);
        break;
      }
      case CFX_ICE: { const x = vx(q.x), y = vy(q.y), lit = (tick + q.id) % 4 === 0; dot(x, y, lit ? q.col : q.col2, true, a); if (lit) dot(x, y - 1, cfxRamp(q.col2)[2], true, a * 0.6); break; }
      case CFX_DUST: { const x = vx(q.x), y = vy(q.y); dot(x, y, q.col, false, a * 0.8); dot(x + 1, y, q.col, false, a * 0.6); if (k > 0.5) dot(x + 2, y, q.col, false, a * 0.4); break; }
      case CFX_CONV: {
        const x = vx(q.x), y = vy(q.y), at = CFX.focusAt[q.slot];
        dot(x, y, q.col, true, a > 0.5 ? 1 : 0.75);
        // a tail pointing out from the focus
        if (at) { const tx = q.x - px - at.x, ty = q.y - py - at.y, m = Math.hypot(tx, ty) || 1; if (m > 3) dot(Math.round(x + (tx / m) * 1.5), Math.round(y + (ty / m) * 1.5), q.col2, true, 0.5); }
        break;
      }
      case CFX_GOB: {
        // a gob of a splash: a short stroke, its underside darker
        const x = vx(q.x), y = vy(q.y);
        dot(x, y, q.col, !q.dark, a); dot(x + 1, y, q.col, !q.dark, a); dot(x, y + 1, q.col2, false, a * 0.8);
        if (k > 0.5) dot(x - 1, y, q.col2, !q.dark, a * 0.7);
        break;
      }
      case CFX_DRIP: { const x = vx(q.x), y = vy(q.y); dot(x, y, k > 0.5 ? q.col : q.col2, true, a); dot(x, y - 1, q.col2, true, a * 0.5); break; }
      case CFX_NANITE: {
        // a nanite: a speck that never holds still
        const h = artHash(q.id & 1023, ft, 77);
        dot(vx(q.x) + ((h * 3) | 0) - 1, vy(q.y) + ((h * 7) | 0) % 3 - 1, q.col, true, a);
        break;
      }
      default: dot(vx(q.x), vy(q.y), q.col, true, a * 0.75);
    }
  }
  const fx = vx(px), fy = vy(py);
  for (const r of CFX.rings) {
    const k = r.t / r.max, u = 1 - k, x = r.f ? fx + Math.round(r.x * AP) : vx(r.x), y = r.f ? fy + Math.round(r.y * AP) : vy(r.y);
    if (r.kind === 'flash') cfxDrawFlash(x, y, r.a, r.col, k, r.big, cfxSeed(r));
    else if (r.kind === 'impact') cfxDrawImpact(r, x, y, k, ft);
    else if (r.kind === 'zap') cfxDrawZap(r, x, y, k, ft);
    else if (r.kind === 'pillar') cfxDrawPillar(r, x, y, k, ft, lights);
    else if (r.kind === 'grow') cfxDrawGrow(r, x, y, k, ft);
    else if (r.kind === 'edge') hlEdgeRing(x, y, Math.cos(r.a), Math.sin(r.a), 3 + u * 7, cfxRamp(r.col)[u < 0.5 ? 3 : 2], cfxBand(k), u < 0.4 ? '#ffffff' : cfxRamp(r.col)[4]);
    else if (r.kind === 'seed') cfxDrawSeed(r, x, y, k);
    else if (r.kind === 'hexflash') {
      const R = cfxRamp(r.col), rr = Math.round(4 + u * (r.big ? 22 : 15)), b = cfxBand(k);
      if (u < 0.2) { const fr = r.big ? 7 : 5; for (let j = -fr; j <= fr; j++) for (let i = -fr * 1.6; i <= fr * 1.6; i++) if ((i * i) / 2.56 + j * j <= fr * fr) dot(Math.round(x + i), y + j, '#ffffff', true); }
      hlPoly(hlHex(x, y, rr, Math.round(rr * 0.6), Math.PI / 6), R[u < 0.4 ? 4 : 3], b, u > 0.6 ? 2 : 1);
      hlPoly(hlHex(x, y + 1, rr - 1, Math.round(rr * 0.6) - 1, Math.PI / 6), R[u < 0.4 ? 3 : 2], b, u > 0.6 ? 2 : 1);
      if (u < 0.45) { hlDiamond(x, y, 3, '#ffffff', 1); for (let i = 4; i < 14; i++) { dot(x + i, y, R[4], true, b); dot(x - i, y, R[4], true, b); } }
      for (const [hx, hy] of hlHex(x, y, rr, Math.round(rr * 0.6), Math.PI / 6)) dot(hx, hy, HL_GOLD[4], true, b);
    }
    else if (r.kind === 'crescent') cfxDrawCrescent(r, x, y, u, lights);
    else if (r.kind === 'sweep' && r.air) {
      // a ward closing round the body: a crisp ring drawing in, and its
      // lattice switching on behind it, a row in three, then every other
      const rx = hlQuant(lerp(r.r0 * AP, CFX_WARD[0], u)), wy = y - CFX_WARD[2] - Math.round(r.y * AP);
      hlRing(x, wy, rx, r.col, CFX_WARD[1] / CFX_WARD[0], cfxBand(Math.min(1, k * 1.6)));
      if (u > 0.35) cfxBlit(hlScanPic(hlLatticePic(CFX_WARD[0], CFX_WARD[1], r.col), u > 0.7 ? 2 : 3), x, wy, 0.8);
    } else if (r.kind === 'burst') {
      const rx = Math.max(2, Math.round(lerp(r.r0, r.r1, u) * (r.pillar ? AP : 1.2))), R = cfxRamp(r.col), sd = cfxSeed(r), a = cfxBand(k);
      // streaks thrown out from a hot heart, and a crisp ring at their tips
      cfxRays(x, y, rx * 0.35, rx, r.pillar ? 6 : 8, R, a, sd);
      if (k > 0.5) hlDiamond(x, y, 1, R[4], a);
      if (u > 0.3) { let m = 0; for (const [i, j] of cfxEllipse(rx, Math.max(1, Math.round(rx * 0.75)))) if (u < 0.6 || m++ % 2) dot(x + i, y + j, R[j > 0 ? 4 : 3], true, a * 0.8); }
      // a blink's ends: a pillar of light up and down from the middle
      if (r.pillar) {
        const L = Math.round(ap(14) * k);
        for (let j = -L; j <= L; j++) {
          const e = Math.abs(j) / (L + 1), al = cfxBand(k * (1 - e)), h = artHash(j, 1, sd);
          dot(x, y + j, R[e < 0.25 ? 4 : 3], true, al);
          if (h < 0.7 - e) dot(x + 1, y + j, R[2], true, al * 0.8);
          if (h > 0.85) dot(x - 1 - (h > 0.93 ? 1 : 0), y + j, R[2], true, al * 0.6);
        }
      }
    }
  }
  cfxDrawLocks(fx, fy, vx, vy, ft);
  cfxDrawSwarms(vx, vy, ft);
  for (const l of CFX.flares) {
    const k = l.t / l.max;
    cfxLight(lights, l.f ? fx + Math.round(l.x * AP) : vx(l.x), l.f ? fy + Math.round(l.y * AP) : vy(l.y), l.r * (0.6 + 0.4 * k), l.i * k, l.c);
  }
  cfxDayLights(lights);
}

// The muzzle at the fist, a hard-light emitter: on its first frames a
// white-hot heart in a diamond, two rails along the aim either side of it;
// then the diamond opens out and breaks to its four points while a ring
// stands across the aim and runs out along it (a big cast: two, and a
// sigil's gold at the diamond's points).
function cfxDrawFlash(x, y, a, col, k, big, sd) {
  const R = cfxRamp(col), ca = Math.cos(a), sa = Math.sin(a), u = 1 - k, b = cfxBand(k), G = big ? 1.5 : 1;
  if (k > 0.6) {
    // its first frames: a white-hot heart, spikes out, in a diamond
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) dot(x + i, y + j, '#ffffff', true);
    for (let i = 2; i <= Math.round(5 * G); i++) for (const [p, q] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) dot(x + p * i, y + q * i, i < 4 ? '#ffffff' : R[4], true);
    hlDiamond(x, y, Math.round(6 * G), R[3], 1, HL_GOLD[4]);
    hlDiamond(x, y, Math.round(6 * G) + 1, R[0], 0.5);
  } else {
    // the diamond opening out, only its points left, gold
    const r = Math.round((6 + u * 12) * G);
    for (const [i, j] of [[r, 0], [-r, 0], [0, r], [0, -r]]) { const si = Math.sign(i), sj = Math.sign(j); dot(x + i, y + j, HL_GOLD[4], true, b); dot(x + i - si, y + j - sj, HL_GOLD[3], true, b); dot(x + si * (r - 2) + (sj ? 1 : 0), y + sj * (r - 2) + (si ? 1 : 0), R[3], true, b * 0.8); dot(x + si * (r - 2) - (sj ? 1 : 0), y + sj * (r - 2) - (si ? 1 : 0), R[3], true, b * 0.8); }
    for (const [i, j] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]]) dot(x + i, y + j, R[4], true, b);
  }
  // the rails: two lines along the aim, either side, a dark stroke outside
  const L = Math.round((6 + u * 10) * G);
  if (k > 0.25) for (const s of [-3, 3]) for (let i = 3; i < L; i++) {
    const px = Math.round(x + ca * i - sa * s), py = Math.round(y + sa * i + ca * s);
    dot(px, py, R[i < 6 ? 4 : 3], true, i > L - 3 ? b * 0.6 : b);
    dot(Math.round(px - sa * Math.sign(s)), Math.round(py + ca * Math.sign(s)), R[0], false, b * 0.5);
  }
  // the muzzle rings, standing across the aim and running out along it
  const rr = (3 + u * 8) * G, d = (3 + u * 13) * G;
  hlEdgeRing(x + ca * d, y + sa * d, ca, sa, rr, R[3], b, '#ffffff');
  if (u > 0.2) { const d2 = d * 0.55; hlEdgeRing(x + ca * d2, y + sa * d2, ca, sa, rr * 0.7, R[2], b * 0.85, R[4]); }
  // hot pixels thrown forward
  for (let n = 0; n < (big ? 9 : 6); n++) {
    const h = artHash(n, Math.floor(k * 6), sd), bb = a + (h - 0.5) * 1.3, r = (4 + u * 16 + artHash(n, 9, sd) * 4) * G;
    dot(Math.round(x + Math.cos(bb) * r), Math.round(y + Math.sin(bb) * r * 0.75), R[h < 0.5 ? 3 : 4], true, b);
  }
}

// Each element's look in flight and where it lands (cfxStyle): Force a
// kinetic slug, Shock arcs off a node, Frost a cut crystal, Ember plasma
// in a containment shell, Blight a swarm of nanites. Anything else
// (a Form's own colour, the lode's, a rift's) flies as Force does.
const cfxStyle = (el) => (el === 'shock' || el === 'frost' || el === 'ember' || el === 'blight' ? el : 'force');
// Ember's containment shell: its colour run towards violet.
const CFX_SHELL = '#b45cff';

// A shot in flight, by its Form and element: out of the fist, a slug with
// a hot core and a contrail of ionised strokes behind it (a lance a beam,
// an orb plasma held in a shell, a Shatterglass shard a crystal dart), and
// its light.
function drawCastBolt(b, ox, oy, tick, lights) {
  const c = b.cfx, age = c ? Game.realT - c.born : 1, o = c ? Math.max(0, 1 - age / T.castFx.bolt.originT) : 0;
  const bx = b.x + (c ? c.ox * o : 0), by = b.y + (c ? c.oy * o : 0), sp = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / sp, uy = b.vy / sp;
  const el = b.element, col = cfxBoltCol(b), look = CFX_BOLT_LOOK[b.kind], R = cfxRamp(col), sd = c ? cfxSeed(c) : 1, ft = Math.floor(Game.realT * 30);
  // a spark wobbles across its path
  const wob = look === 'wobble' ? Math.round(Math.sin(age * 45) * 1.2) : 0;
  const x = Math.round(bx * AP) + ox - Math.round(uy * wob), y = Math.round(by * AP) + oy + Math.round(ux * wob);
  const B = T.castFx.bolt;
  if (look === 'orb') { cfxDrawOrb(b, x, y, tick, col, lights); return; }
  if (b.kind === 'shard') { cfxDrawCrystal(x, y, ux, uy, 7, R, ft); cfxLight(lights, x, y, TILE * 1.1, 0.7, rgb01(col)); return; }
  if (look === 'lance') { cfxDrawBeam(b, x, y, ux, uy, R, ft, sd); cfxLight(lights, x, y, TILE * B.light[0] * 1.2, B.light[1], rgb01(col)); return; }
  const P = (i, j) => [Math.round(x + ux * i - uy * j), Math.round(y + uy * i + ux * j)], st = cfxStyle(el), big = b.big;
  // (which side of its way is the upper, lit one)
  const lit = ux > 0.3 ? -1 : ux < -0.3 ? 1 : uy > 0 ? 1 : -1;
  // the hot core: a white-hot line back from the head, three pixels thick
  // (five, charged), lit above and deep below, a dark stroke under it so
  // it holds on a pale floor (its contrail is drawn first: cfxDrawTrails)
  const L = big ? B.core[1] : B.core[0], w = big ? 2 : 1;
  for (let k = 0; k < L; k++) {
    const f = k / L, [tx, ty] = P(-k, 0);
    dot(tx, ty, k < 3 ? '#ffffff' : R[f < 0.6 ? 4 : 3], true);
    if (f < 0.75) for (let s = 1; s <= w; s++) {
      let [qx, qy] = P(-k, lit * s); dot(qx, qy, R[s === 1 && f < 0.5 ? 4 : 3], true);
      [qx, qy] = P(-k, -lit * s); dot(qx, qy, R[s === 1 && f < 0.3 ? 3 : 2], true);
    }
    if (f < 0.6) { const [qx, qy] = P(-k, -lit * (w + 1)); dot(qx, qy, R[0], false, 0.7); }
  }
  // the head
  if (st === 'frost') cfxDrawCrystal(x, y, ux, uy, big ? 11 : 8, R, ft);
  else if (st === 'ember') {
    // plasma: a white-hot heart, its colour round it, in a shell of violet
    // that turns
    const rr = big ? 3 : 2, S = cfxRamp(CFX_SHELL);
    for (let j = -rr; j <= rr; j++) for (let i = -rr; i <= rr; i++) { const e = i * i + j * j; if (e <= rr * rr + 1) dot(x + i, y + j, e <= 1 ? '#ffffff' : e <= 4 ? R[4] : R[3], true); }
    const sr = rr + 3, n = big ? 8 : 6;
    for (let q = 0; q < n; q++) { const a = Game.realT * 9 + (q * Math.PI * 2) / n; dot(Math.round(x + Math.cos(a) * sr), Math.round(y + Math.sin(a) * sr * 0.9), S[q % 2 ? 2 : 4], true); if (q % 2 === 0) dot(Math.round(x + Math.cos(a + 0.25) * sr), Math.round(y + Math.sin(a + 0.25) * sr * 0.9), S[3], true, 0.8); }
  } else if (st === 'blight') {
    // a swarm: a hot speck, nanites milling round it, some with a violet
    // sheen, some dark
    for (const [i, j] of [[0, 0], [1, 0], [0, 1]]) dot(x + i, y + j, R[4], true);
    const r = big ? 6 : 4;
    for (let q = 0; q < (big ? 22 : 14); q++) {
      const h = artHash(q, ft, sd), h2 = artHash(q, ft + 50, sd);
      dot(Math.round(x + (h - 0.5) * 2 * r - ux * h2 * 3), Math.round(y + (h2 - 0.5) * 2 * r * 0.8), q % 5 === 0 ? '#c890ff' : q % 7 === 0 ? '#1a2a0c' : R[q % 3 ? 3 : 2], q % 7 !== 0, 0.95);
    }
  } else {
    // a slug: a bow shock opening back from it, a glint at its tip
    const bs = big ? 7 : 5;
    for (const s of [-1, 1]) for (let i = 1; i <= bs; i++) { const [qx, qy] = P(-i * 0.9, s * (1 + i * 0.75)); dot(qx, qy, R[i < 3 ? 4 : i < 5 ? 3 : 2], true, i < bs - 1 ? 0.95 : 0.6); }
    const [gx, gy] = P(1, 0), [g2x, g2y] = P(2, 0);
    dot(gx, gy, '#ffffff', true); dot(g2x, g2y, ft % 2 ? HL_GOLD[4] : R[4], true);
    if (st === 'shock') {
      // arcs jumping off the head, a new shape each frame
      for (const s of [-1, 1]) {
        const h = artHash(s + 3, ft, sd), [x1, y1] = P(-2 - h * 3, s * (3 + h * 2)), [x2, y2] = P(-6 + h * 4, s * (6 + h * 3));
        hlLine(x, y, x1, y1, '#ffffff', true); hlLine(x1, y1, x2, y2, R[4], true, 0.9);
        dot(x2, y2, R[3], true);
      }
    }
  }
  if (big) {
    // charged: held in a turning diamond, its points gold, a ring across it
    hlDiamond(x, y, 8 + (ft % 2), R[3], 0.9, HL_GOLD[4]);
    hlEdgeRing(x - ux * 3, y - uy * 3, ux, uy, 6, R[3], 0.8, R[4]);
  }
  cfxLight(lights, x, y, TILE * B.light[0] * (big ? 1.5 : 1), B.light[1] + (tick % 2) * 0.15, rgb01(col));
}

// The contrails, before the shots (render.js): each a line through where
// its shot has been this last T.castFx.bolt.linger s, hot and thick
// nearest the shot, thinning and darkening to dashes, ionised strokes off
// it either side, a dark stroke under its hot part so it holds on a pale
// floor; Shock's zigzags, Ember's runs hot and long.
function cfxDrawTrails(ox, oy) {
  const now = Game.realT, Lg = T.castFx.bolt.linger;
  for (const tr of CFX.trails) {
    const pts = tr.pts, R = cfxRamp(tr.col), lx = tr.lx, ly = tr.ly;
    for (let i = pts.length - 1; i > 0; i--) {
      const p = pts[i], q = pts[i - 1], a = (now - q[2]) / Lg;
      if (a >= 1) break;
      const x0 = Math.round(p[0] * AP) + ox, y0 = Math.round(p[1] * AP) + oy, x1 = Math.round(q[0] * AP) + ox, y1 = Math.round(q[1] * AP) + oy;
      const L = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)), ti = a < 0.2 ? 4 : a < 0.45 ? 3 : a < 0.75 ? 2 : 1, al = a < 0.6 ? 1 : 0.75;
      for (let s = 0; s < L; s++) {
        const u = s / Math.max(1, L), x = Math.round(x0 + (x1 - x0) * u), y = Math.round(y0 + (y1 - y0) * u) + (tr.st === 'shock' ? Math.round((artHash(q[3] + s, 1, 5) - 0.5) * 2.4 * (1 - a)) : 0), h = artHash(q[3] + s, 3, 9);
        if (a > 0.55 && (s + q[3]) % 3 === 0) continue;
        dot(x, y, R[ti], true, al);
        if (a < (tr.big ? 0.6 : 0.35)) { dot(x + lx, y + ly, R[Math.max(1, ti - 1)], true, al); if (tr.big) dot(x - lx, y - ly, R[Math.max(1, ti - 1)], true, al); }
        if (a < 0.4) { const k = tr.big ? 2 : 1; dot(x - lx * k, y - ly * k, R[0], false, 0.55); }
        // ionised strokes off it
        if (h < 0.14 * (1 - a)) { const o = (h < 0.07 ? 1 : -1) * (2 + ((h * 50) | 0) % 2); dot(x + lx * o, y + ly * o, R[3], true, 0.85); dot(x + lx * o - ly, y + ly * o - lx, R[2], true, 0.7); }
      }
    }
  }
}

// A cut crystal flying point first at x, y along ux, uy, L px long: its
// middle hot, its upper side lit, its lower deep, a glint running down it.
function cfxDrawCrystal(x, y, ux, uy, L, R, ft) {
  const vx = -uy, vy = ux, lit = vy > 0 ? -1 : 1, g = ft % (L + 4);
  for (let i = 0; i < L; i++) {
    const px = Math.round(x - ux * i), py = Math.round(y - uy * i), w = i === 0 || i === L - 1 ? 0 : 1;
    dot(px, py, R[i === g || i < 2 ? 4 : 3], true);
    if (w) { dot(Math.round(px + vx * lit), Math.round(py + vy * lit), R[3], true); dot(Math.round(px - vx * lit), Math.round(py - vy * lit), R[1], true, 0.9); }
  }
  dot(Math.round(x + ux), Math.round(y + uy), '#ffffff', true, 0.8);
}

// A lance's beam: a hard core a pixel wide back from its head (as far as
// T.castFx.beam, never past where it was cast), white-hot nearest the
// head; its edges flicker, loose pixels shimmer off it, and its head is a
// hot point in a small diamond. (Its scar on the ground: cfxDrawScars.)
function cfxDrawBeam(b, x, y, ux, uy, R, ft, sd) {
  const c = b.cfx, vx = -uy, vy = ux, lit = vy > 0 ? -1 : 1;
  const n = Math.round(c && c.x0 !== undefined ? Math.min(Math.hypot(b.x - c.x0, b.y - c.y0), T.castFx.beam) * AP : ap(8));
  for (let k = 0; k <= n; k++) {
    const f = k / (n + 1), tx = Math.round(x - ux * k), ty = Math.round(y - uy * k), a = cfxBand(1 - f * 0.85), h = artHash(k >> 1, ft, sd);
    dot(tx, ty, R[f < 0.35 ? 4 : f < 0.7 ? 3 : 2], true, a);
    if (f < 0.45 || h > f * 0.9) dot(Math.round(tx + vx * lit), Math.round(ty + vy * lit), R[f < 0.4 ? 3 : 2], true, a * 0.9);
    if (f < 0.3 || h > 0.35 + f * 0.6) dot(Math.round(tx - vx * lit), Math.round(ty - vy * lit), R[f < 0.3 ? 2 : 1], true, a * 0.8);
    if (f < 0.25) dot(Math.round(tx + vx * lit * 2), Math.round(ty + vy * lit * 2), R[3], true, a * 0.8);
    if (f < 0.6) dot(Math.round(tx - vx * lit * 2), Math.round(ty - vy * lit * 2), R[0], false, 0.55);
    const h2 = artHash(k, ft + 7, sd);
    if (h2 < 0.07) { const s = h2 < 0.035 ? 2 : -2; dot(Math.round(tx + vx * s), Math.round(ty + vy * s), R[2], true, a * 0.6); }
  }
  hlDiamond(x, y, 2, R[3], 0.9, HL_GOLD[4]);
  dot(x, y, '#ffffff', true); dot(Math.round(x + ux), Math.round(y + uy), R[4], true); dot(Math.round(x + ux * 2), Math.round(y + uy * 2), R[3], true, 0.7);
}

// A chain's arc, painted: a bolt that forks and wanders (each span split
// at a displaced middle, again and again, so it bends at every scale, not
// in straight jags), white-hot down its core, lit on its upper side and its
// colour on the other, thickest in the middle and tapering to its ends,
// loose pixels of its colour flicking off it, and a thinner fork or two;
// it jumps to a new shape every few frames; its ends are emitter nodes.
function cfxBoltPath(x0, y0, x1, y1, seed, amp) {
  let pts = [[x0, y0], [x1, y1]];
  const L = Math.hypot(x1 - x0, y1 - y0);
  for (let lv = 0, a = amp * L; lv < 6 && L / pts.length > 3; lv++, a *= 0.55) {
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i], dx = q[0] - p[0], dy = q[1] - p[1], m = Math.hypot(dx, dy) || 1, o = (artHash(i, lv, seed) - 0.5) * 2 * a;
      out.push([(p[0] + q[0]) / 2 - (dy / m) * o, (p[1] + q[1]) / 2 + (dx / m) * o], q);
    }
    pts = out;
  }
  return pts;
}
function cfxPaintBolt(pts, R, alpha, w0, seed) {
  const n = pts.length - 1;
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[i + 1], dx = q[0] - p[0], dy = q[1] - p[1], m = Math.max(1, Math.round(Math.max(Math.abs(dx), Math.abs(dy)))), L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    // (the side towards the upper left is the lit one)
    const lit = nx * -0.55 + ny * -0.8 > 0 ? 1 : -1;
    for (let s = 0; s < m; s++) {
      const t = (i + s / m) / n, w = w0 * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0.04, t))), 0.5), x = Math.round(p[0] + (dx * s) / m), y = Math.round(p[1] + (dy * s) / m), h = artHash(x, y, seed);
      dot(x, y, R[w > 0.6 ? 4 : 3], true, alpha);
      if (w > 0.45) dot(Math.round(x + nx * lit), Math.round(y + ny * lit), R[3], true, alpha * 0.9);
      if (w > 0.8) dot(Math.round(x - nx * lit), Math.round(y - ny * lit), R[w > 1.2 ? 2 : 1], true, alpha * 0.85);
      else if (w > 0.3 && h < 0.5) dot(Math.round(x - nx * lit), Math.round(y - ny * lit), R[1], true, alpha * 0.7);
      if (w > 1.3 && h < 0.6) dot(Math.round(x + nx * lit * 2), Math.round(y + ny * lit * 2), R[2], true, alpha * 0.7);
      if (h > 0.9) { const k = h > 0.95 ? 3 : -3; dot(Math.round(x + nx * k), Math.round(y + ny * k), R[h > 0.97 ? 3 : 2], true, alpha * 0.7); }
    }
  }
}
function drawCastArc(fx, ox, oy, lights) {
  const k = fx.t / fx.max, x0 = Math.round(fx.x * AP) + ox, y0 = Math.round(fx.y * AP) + oy, x1 = Math.round(fx.x2 * AP) + ox, y1 = Math.round(fx.y2 * AP) + oy;
  const col = fx.col || ELEMENT_COLS.shock, R = cfxRamp(col), a = cfxBand(k), sd = cfxSeed(fx) + Math.floor(Game.realT * 15) * 7919, L = Math.hypot(x1 - x0, y1 - y0);
  const pts = cfxBoltPath(x0, y0, x1, y1, sd, 0.16);
  cfxPaintBolt(pts, R, a, k > 0.5 ? 1.6 : 1.1, sd);
  // a fork or two off it, thinner, tapering off
  for (let f = 0; f < (L > 40 ? 2 : 1); f++) {
    const i = Math.floor(pts.length * (0.3 + 0.4 * artHash(f, 9, sd))), p = pts[i], dir = Math.atan2(y1 - y0, x1 - x0) + (artHash(f, 10, sd) < 0.5 ? -1 : 1) * (0.5 + 0.5 * artHash(f, 11, sd)), fl = L * (0.18 + 0.15 * artHash(f, 12, sd));
    if (p && k > 0.3) cfxPaintBolt(cfxBoltPath(p[0], p[1], p[0] + Math.cos(dir) * fl, p[1] + Math.sin(dir) * fl, sd + f + 1, 0.22).slice(0), R, a * 0.85, 0.7, sd + 5);
  }
  // its ends are emitters: a node in a diamond, hot
  for (const [x, y] of [[x0, y0], [x1, y1]]) { hlDiamond(x, y, 2, R[3], a, HL_GOLD[4]); for (const [i, j] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) dot(x + i, y + j, i || j ? R[4] : '#ffffff', true, a); }
  cfxLight(lights, (x0 + x1) >> 1, (y0 + y1) >> 1, TILE * 1.4, 0.8 * k, rgb01(col));
}

// The diver's ward (fx, fy: his feet on the view): a bubble of hard light
// round him, a hexagonal lattice towards its rim (hlLatticePic), breathing,
// a row of light scanning down it now and then; in its first element's
// colour. CFX_WARD: its size across and down, and how high its middle
// stands, art px.
const CFX_WARD = [ap(13), ap(15), ap(13)];
function cfxDrawWard(p, fx, fy, lights) {
  const col = p.wardS ? p.wardS.col : ART.forms.ward, R = cfxRamp(col), [rx, ry, up] = CFX_WARD, cy = fy - up, t = Game.realT;
  cfxBlit(hlLatticePic(rx, ry, col), fx, cy, 0.42 + 0.12 * Math.sin(t * 6));
  const ph = (t * 0.8) % 1;
  if (ph < 0.45) {
    const v = ph / 0.45, yy = Math.round(-ry + v * 2 * ry), half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (yy / ry) * (yy / ry))));
    for (let i = -half; i <= half; i++) if ((i + yy) & 1) dot(fx + i, cy + yy, R[4], true, 0.35);
  }
  cfxLight(lights, fx, cy, TILE * 1.1, 0.25, rgb01(col));
}

// A gravity well (an aura; ox, oy: the floor's offset): spacetime
// pinched. A dark core with a bright event horizon round it, rings of
// compression drawing in from its reach (its hitbox) and brightening as
// they close, debris streaked inward, in its element's colour.
function drawCastWell(au, ox, oy, tick, lights) {
  const cx = Math.round(au.x * AP) + ox, cy = Math.round(au.y * AP) + oy, k = Math.min(1, au.t / 0.4), Rr = au.r * AP, col = au.col || ART.forms.well, R = cfxRamp(col), t = Game.realT, ft = Math.floor(t * 30);
  if (cx < -Rr - 10 || cx > View.w + Rr + 10 || cy < -Rr || cy > View.h + Rr) return;
  // the compression rings, three, closing in
  for (let q = 0; q < 3; q++) {
    const f = 1 - ((t * 0.9 + q / 3) % 1), rx = hlQuant(Math.max(6, Rr * f));
    hlRing(cx, cy, rx, col, 0.6, cfxBand(k) * (f > 0.7 ? 0.22 : f > 0.4 ? 0.45 : 0.85), f > 0.3 ? 2 : 1);
  }
  // debris drawn in, spiralling: a speck and a streak behind it, outward
  for (let n = 0, N = 30; n < N; n++) {
    const a = n * 0.7 - t * 4, r = Rr * (1 - ((n * 0.37 + t * 0.8) % 1)), x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.6, al = k * Math.min(1, (1 - r / Rr) * 1.6);
    dot(Math.round(x), Math.round(y), n % 3 ? R[2] : R[4], true, al);
    if (r > 8) dot(Math.round(x + Math.cos(a) * 2), Math.round(y + Math.sin(a) * 1.2), R[1], true, al * 0.6);
  }
  // the core's horizon, a crisp bright ring flickering a pixel (its dark
  // heart is on the ground: cfxWellCores)
  let m = 0;
  for (const [i, j] of cfxEllipse(5, 3)) { const h = artHash(m++, ft >> 1, 31); dot(cx + i, cy + j + (h > 0.85 ? (j < 0 ? -1 : 1) : 0), j < 0 ? R[3] : R[4], true, k); }
  dot(cx - 6, cy, HL_GOLD[4], true, k); dot(cx + 6, cy, HL_GOLD[4], true, k);
  cfxLight(lights, cx, cy, au.r, 0.5 * k, rgb01(col));
}

// The wells' dark hearts, on the ground under whatever they've caught.
function cfxWellCores(d, ox, oy) {
  for (const au of d.auras) {
    if (au.kind !== 'well') continue;
    const cx = Math.round(au.x * AP) + ox, cy = Math.round(au.y * AP) + oy, k = Math.min(1, au.t / 0.4), pts = [];
    for (let j = -2; j <= 2; j++) for (let i = -4; i <= 4; i++) if ((i * i) / 16 + (j * j) / 4 <= 1) pts.push(cx + i, cy + j);
    hlDots(pts, '#07040c', false, 0.92 * k);
  }
}

// An Arc's crescent (art px x, y: where it was cast from; u: how far through
// its life): a thick crescent of light whose head sweeps across the aim's
// arc in the first part of its life, white-hot along its outer edge and at
// its head, its colour within and deep at its back edge, motes drifting
// out from inside it; then it breaks up and fades in steps. Heavy: thicker.
function cfxDrawCrescent(r, x, y, u, lights) {
  const lead = Math.min(1, u / 0.55), fade = u < 0.55 ? 1 : cfxBand((1 - u) / 0.45);
  if (fade <= 0) return;
  const R = Math.round(r.r * AP * 0.95), cy = y - Math.round(6 * AP), a0 = r.a - r.side * r.half, span = 2 * r.half * r.side, sd = cfxSeed(r), ramp = cfxRamp(r.col);
  const tail = Math.max(0, lead - (r.heavy ? 1 : 0.85)), th = r.heavy ? T.paint.fx.arc[1] : T.paint.fx.arc[0];
  cfxPaintArc(x, cy, R, a0 + span * tail, a0 + span * lead, th, ramp, fade, sd, u < 0.55 ? 0 : (1 - fade) * 0.7 + 0.1, lead < 1, true);
  // motes drifting out from inside it
  for (let n = 0; n < (r.heavy ? 18 : 12); n++) {
    const t = tail + (lead - tail) * artHash(n, 1, sd), b = a0 + span * t, rr = R - 2 - artHash(n, 2, sd) * R * 0.55 + u * 6;
    dot(Math.round(x + Math.cos(b) * rr), Math.round(cy + Math.sin(b) * rr * 0.75), ramp[1 + Math.floor(artHash(n, 3, sd) * 3.99)], true, fade * (n % 3 ? 1 : 0.6));
  }
  const b = a0 + span * lead;
  cfxLight(lights, Math.round(x + Math.cos(b) * R), Math.round(cy + Math.sin(b) * R * 0.75), TILE * (r.heavy ? 1.5 : 1.1), 0.8 * fade, rgb01(r.col));
}

// An orb in flight: plasma held in a containment field. A heart shaded
// from the upper left in its colour, white-hot at its glint; round it a
// hexagon a pixel wide, turning, gold at two corners; inside, by element,
// arcs to the shell, a crystal, a violet churn, or a swarm. When it pulses,
// a lattice ring runs out over the ground to its reach (its hitbox).
function cfxDrawOrb(b, x, y, tick, col, lights) {
  const R = cfxRamp(col), r = 3, sd = b.cfx ? cfxSeed(b.cfx) : 1, ft = Math.floor(Game.realT * 30), st = cfxStyle(b.element);
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
    const e = i * i + j * j;
    if (e > r * r + 1) continue;
    const s = (i * 0.55 + j * 0.8) * -0.45 - (e > 5 ? 0.9 : 0);
    dot(x + i, y + j, R[clamp(Math.round(3.2 + s + (artHash(i + 9, j, (ft >> 2) + sd) - 0.5) * 0.8), 1, 4)], true);
  }
  dot(x - 1, y - 1, '#ffffff', true); dot(x, y - 1, '#ffffff', true, 0.8);
  const rot = Game.realT * 1.8, hex = hlHex(x, y, 7, 6, rot);
  hlPoly(hex, R[3], 0.85);
  dot(hex[0][0], hex[0][1], HL_GOLD[4], true); dot(hex[3][0], hex[3][1], HL_GOLD[4], true);
  if (st === 'shock') { const v = hex[ft % 6]; hlLine(x, y, v[0], v[1], R[4], true, 0.9); }
  else if (st === 'frost') hlDiamond(x, y, 3, R[4], 0.8);
  else if (st === 'ember') { const S = cfxRamp(CFX_SHELL); for (let q = 0; q < 3; q++) { const a = -Game.realT * 7 + q * 2.1; dot(Math.round(x + Math.cos(a) * 4), Math.round(y + Math.sin(a) * 3.5), S[3], true, 0.9); } }
  else if (st === 'blight') for (let q = 0; q < 6; q++) { const h = artHash(q, ft, sd); dot(Math.round(x + (h - 0.5) * 9), Math.round(y + (artHash(q, ft + 9, sd) - 0.5) * 8), q % 3 ? R[3] : '#c890ff', true, 0.85); }
  const since = Game.realT - (b.orb ? b.orb.pulse : -1);
  if (since >= 0 && since < 0.22) {
    const k = since / 0.22, rx = hlQuant(Math.max(2, b.orb.r * AP * Math.sqrt(k)));
    hlRingHard(x, y + Math.round(6 * AP * 0.5), rx, col, 0.75, 1 - k);
    if (k < 0.3) hlDiamond(x, y, 4 + Math.round(k * 10), R[4], 0.8);
  }
  cfxLight(lights, x, y, TILE * 1.3, 0.7 + (since < 0.15 ? 0.4 : 0), rgb01(col));
}

// A Glaive's blades (art px ox, oy: the floor's offset on the view): each
// a short thick crescent of hard light on the ring it turns round, cut in
// facets, its head white-hot and gold-tipped, tapering behind it; under
// them their rail, a dotted ring with a node at each blade's place.
function drawCastGlaive(au, ox, oy, tick, lights) {
  const cx = Math.round(au.x * AP) + ox, cy = Math.round((au.y - 6) * AP) + oy, R = Math.round(au.r * AP), fade = Math.min(1, au.t / 0.3);
  const ramp = cfxRamp(au.col), seg = R * 0.6, sd = cfxSeed(au), dir = Math.sign(au.spin) || 1;
  let m = 0;
  for (const [x, y] of cfxEllipse(R, Math.round(R * 0.75))) if (m++ % 4 === 0) dot(cx + x, cy + y, ramp[y > 0 ? 2 : 1], true, 0.45 * cfxBand(fade));
  for (let n = 0; n < au.n; n++) {
    const a = au.a + (n / au.n) * Math.PI * 2;
    cfxPaintArc(cx, cy, R, a - (dir * seg) / R, a, 3.2, ramp, cfxBand(fade), sd + n * 31 + (tick & 1), fade < 1 ? 1 - fade : 0, true, true);
  }
  cfxLight(lights, cx, cy, au.r * 1.1, 0.45 * fade, rgb01(au.col));
}
