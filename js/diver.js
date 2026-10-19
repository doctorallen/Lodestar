'use strict';
// ---------------------------------------------------------------------------
// The player: the Kindler, a lithe figure in a fitted navy suit, in the
// Charter's blue and amber, painted in the painted style (docs/PAINTED.md):
// no outline, a dark mass with a few lit accents. Small close-fitting
// plates of royal blue catch the light (a helm, shoulder caps, the upper
// chest, the forearms, kneecaps and shins); the helm has a dark visor pane
// with one glint and the warm-white brow lamp over it (the lamp you see
// by); amber circuits run in a V down the chest to the seed-star, round
// the cuffs and down the shins; a small pack rides on his back.
//
// He is posed, not drawn frame by frame: a skeleton (pelvis, a spine that
// leans and twists, legs and arms of two bones each, the head) is set by a
// pose (kdPose), its body built of tapered tubes and rounded volumes round
// the bones, and every frame is rendered from it in each facing (kdRender):
// the surface is sampled, projected the way the camera sees (height up,
// depth down the screen by KD_K), kept where it's nearest, shaded from the
// upper left and laid in strokes that stick to the body (each stroke is a
// cell of the surface, so they move with him rather than boil). Then the
// circuits, the star, the visor's glint and the lamp are set on by hand.
//
// The poses: an idle that breathes and shifts its weight; an eight-frame
// walk driven by the distance walked (contact, down, passing, up), the hips
// and shoulders turning against each other, the arms swinging against the
// legs a frame behind, elbows bending, the pack lagging; a lean into the
// first steps and a settle when he stops; the dash, leaning and stretched;
// and the cast's wind-back (held while charging), strike, follow-through
// and recovery, the shoulders and hips turning into it. kindlerPick picks
// the frame each draw (and turns him between facings over a moment);
// frames are built as they're first wanted, and the rest in the
// background a little each frame (kdWarm).
// ---------------------------------------------------------------------------

// What the rest of the game reads: the lamp's and the circuits' colours.
const DIVER_PAL = { lamp: ['#fff0d8'], circuit: ['#ffb030'], star: ['#ffe48a'], starHeart: ['#fffbea'] };
const KINDLER_W = 48, KINDLER_H = 47, KINDLER_FEET = 44;
const KP = {
  suit: ['#05060c', '#0a0b16', '#10132a', '#161b36', '#202a4e'],
  plate: ['#0a0b16', '#141932', '#1c2f80', '#2f5cd8', '#86b0ff'],
  boot: ['#050405', '#0b0909', '#18120e', '#281e16'],
  amber: ['#8a4a16', '#d88c30', '#ffb030', '#ffe48a'],
  pane: ['#030409', '#05070d', '#0b1020'], glint: '#c6dcff',
};

// The figure, in art px above the soles: the hip joints' height and half
// spacing, the leg and arm bones, the shoulder joints, the spine from the
// crotch to the neck's base, the torso's cross-section along it ([where,
// half width, half depth]), the helm's radii.
const KR = {
  hip: 19.4, hipW: 2.4, thigh: 9.7, shin: 9.3, ankle: 1.55,
  upper: 6.7, fore: 6.0, shoulder: 30.4, shoulderW: 4.3,
  crotch: 17.4, neck: 33.0,
  prof: [[0, 3.3, 2.3], [0.13, 4.1, 2.5], [0.3, 3.8, 2.3], [0.45, 3.1, 2.0], [0.62, 3.7, 2.4], [0.78, 4.4, 2.5], [0.9, 4.1, 2.1], [1, 1.7, 1.5]],
  head: [3.4, 4.0, 3.6],
};
// Depth (towards the camera) shows this much down the screen; the light,
// from the upper left and a little in front, as (x, up, towards us).
const KD_K = 0.7, KD_L = (() => { const v = [-0.55, 0.78, 0.4], m = Math.hypot(...v); return v.map((c) => c / m); })();
// The drawn facings' angles (x right, y down the screen).
const KD_FACE = { E: 0, SE: Math.PI / 4, S: Math.PI / 2, NE: -Math.PI / 4, N: -Math.PI / 2 }, KD_CHEAT = { E: -0.75, SE: -0.25, S: 0, NE: -0.5, N: 0 };

// ---- poses -----------------------------------------------------------------
// A pose: pel, the pelvis [side, height, forward]; hipYaw/chestYaw, the
// hips' and shoulders' turn (his right side forward is +); hipRoll (his
// right hip up is +); pitch, the lean forward; breath; headY, the head's
// own bob against the body; pack, its lag; feet, the ankles [side, lift,
// forward]; toe, each foot's tip (down +); arms, each { swing (forward +),
// abd (out), bend (the elbow) } or { hand: [side, height, forward] };
// stretch: along the way he faces (the dash).
const kdTau = Math.PI * 2;
function kdBob(s) { return -Math.cos(2 * kdTau * (s - 0.125)); }

function kdIdle(n) {
  const t = n / 8, w = Math.sin(kdTau * t), b = Math.sin(2 * kdTau * t);
  return {
    pel: [0.6 * w, KR.hip - 0.4 - 0.25 * Math.abs(w), 0], hipYaw: 0.05 * w, hipRoll: 0.08 * w, chestYaw: -0.04 * w, chestRoll: -0.03 * w, pitch: 0.02, breath: b, headY: 0, pack: -0.15 * b,
    feet: [[2.8, 0, 0.5], [-2.7, 0, -0.4]], toe: [0, 0],
    arms: [{ swing: 0.06 + 0.03 * b, abd: 0.13 - 0.03 * w, bend: 0.32 + 0.05 * b }, { swing: 0.04 - 0.03 * b, abd: 0.13 + 0.03 * w, bend: 0.3 + 0.04 * b }],
  };
}

// s: where in the cycle (0: his right heel down in front; 0.5 his left);
// a: how big the stride; lean: more lean, starting off.
function kdWalk(s, a, lean) {
  const A = 6 * a, lift = 2.9 * a, feet = [], toe = [];
  for (let i = 0; i < 2; i++) {
    const u = (s + 0.5 * i) % 1, side = i ? -2.5 : 2.5;
    if (u < 0.5) {
      const off = Math.max(0, u - 0.36);
      feet.push([side, off * 3.5, A * (1 - 4 * u)]); toe.push(off * 3);
    } else {
      const q = (u - 0.5) / 0.5, e = q * q * (3 - 2 * q);
      feet.push([side * 0.95, lift * Math.pow(Math.sin(Math.PI * Math.min(1, q * 1.1)), 0.8), -A + 2 * A * e]); toe.push(q < 0.4 ? 0.5 - q : -0.25 * Math.sin(Math.PI * (q - 0.4) / 0.6));
    }
  }
  const bob = 0.9 * a * kdBob(s), bobLag = 0.9 * a * kdBob(s - 0.125);
  const swing = (k) => k * 0.55 * a * Math.cos(kdTau * (s - 0.09)), bend = (k) => 0.5 + 0.55 * a * Math.max(0, k * Math.cos(kdTau * (s - 0.2)));
  return {
    pel: [0.55 * a * Math.sin(kdTau * s), KR.hip - 0.35 + bob, 0.4 * lean], hipYaw: 0.24 * a * Math.cos(kdTau * s), hipRoll: 0.07 * a * Math.sin(kdTau * s),
    chestYaw: -0.17 * a * Math.cos(kdTau * (s - 0.06)), chestRoll: -0.03 * a * Math.sin(kdTau * s), pitch: 0.065 * a + lean, breath: 0, headY: -0.45 * bob, pack: (bobLag - bob) * 0.9,
    feet, toe,
    arms: [{ swing: swing(-1), abd: 0.12, bend: bend(-1) }, { swing: swing(1), abd: 0.12, bend: bend(1) }],
  };
}

// Stopping: k 0, the last step caught, the body dipping; 1, the feet
// drawn together, the arms swinging on a little past. lead: the foot in
// front (0 his right, 1 his left).
function kdSettle(k, lead) {
  const f = lead ? -1 : 1, o = kdIdle(0);
  o.pel = [0.3 * f, KR.hip - (k ? 0.75 : 1.1), 0];
  o.feet = k ? [[2.8, 0, 0.9 * f], [-2.7, 0, -0.8 * f]] : [[2.6, 0, 2.6 * f], [-2.6, 0, -2.4 * f]];
  o.hipYaw = (k ? 0.04 : 0.12) * f; o.chestYaw = -(k ? 0.03 : 0.08) * f; o.pitch = k ? 0.01 : -0.03; o.headY = k ? 0.2 : 0.45; o.pack = k ? 0.3 : -0.5;
  o.arms = [{ swing: (k ? -0.12 : 0.3) * -f, abd: 0.15, bend: k ? 0.35 : 0.65 }, { swing: (k ? -0.12 : 0.3) * f, abd: 0.15, bend: k ? 0.35 : 0.65 }];
  return o;
}

// The dash: k 0, launching, leant hard and stretched out, pushing off
// the back foot, the arms swept back; 1, flying on.
function kdDash(k) {
  return {
    pel: [0, KR.hip - (k ? 0.8 : 1.2), k ? 1 : 1.6], hipYaw: 0.12, hipRoll: 0, chestYaw: -0.1, chestRoll: 0, pitch: k ? 0.26 : 0.36, breath: 0, headY: -0.3, pack: k ? -0.6 : -1.1,
    feet: k ? [[2.4, 0.8, 2.6], [-2.4, 3.2, -6.4]] : [[2.4, 0.3, 4.4], [-2.4, 2, -8.6]], toe: [k ? 0.1 : -0.2, 0.9],
    arms: [{ swing: k ? -0.75 : -1.0, abd: 0.3, bend: 0.25 }, { swing: k ? -0.6 : -0.85, abd: 0.3, bend: 0.3 }],
    stretch: k ? 1.06 : 1.1,
  };
}

// A cast laid over legs (a walk or idle pose): side, which arm (1 his
// right, -1 his left); ph: 'w' wound back (held while charging), 's' the
// strike (the instant it leaves the hand), 'f' following through, 'r'
// recovering. The shoulders and hips turn into it.
function kdCast(o, side, ph) {
  const C = {
    w: { hand: [5.6, 25.5, -3.6], yaw: -0.45, hip: -0.14, pitch: -0.05, low: 0.6, other: { swing: 0.45, abd: 0.15, bend: 0.75 } },
    s: { hand: [6.2, 28.4, 8.6], yaw: 0.36, hip: 0.12, pitch: 0.12, low: 0.5, other: { swing: -0.5, abd: 0.2, bend: 0.45 } },
    f: { hand: [4.2, 26.6, 9.2], yaw: 0.52, hip: 0.18, pitch: 0.17, low: 0.7, other: { swing: -0.6, abd: 0.22, bend: 0.5 } },
    r: { hand: [4.8, 24.2, 5.2], yaw: 0.22, hip: 0.08, pitch: 0.08, low: 0.4, other: { swing: -0.25, abd: 0.15, bend: 0.4 } },
  }[ph];
  o.chestYaw = o.chestYaw * 0.3 + C.yaw * side; o.hipYaw += C.hip * side; o.pitch = Math.max(o.pitch * 0.5, 0) + C.pitch;
  o.pel = [o.pel[0], o.pel[1] - C.low * (o.feet[0][1] + o.feet[1][1] > 0.5 ? 0.4 : 1), o.pel[2]];
  const i = side > 0 ? 0 : 1;
  o.arms = o.arms.slice();
  o.arms[i] = { hand: [C.hand[0] * side, C.hand[1], C.hand[2]] };
  o.arms[1 - i] = C.other;
  o.cast = i;
  return o;
}

// The pose for a key: 'i0'-'i7' idle, 'w0'-'w7' walk, 'g0'-'g7' walk
// starting off, 's'+'R'|'L'+'0'|'1' settling, 'd0' 'd1' the dash, and
// 'c'+('m'|'o')+phase+'|'+legs a cast over legs.
function kdPose(key) {
  if (key[0] === 'c') {
    const [up, legs] = key.split('|');
    return kdCast(kdPose(legs), up[1] === 'o' ? -1 : 1, up[2]);
  }
  const n = +key.slice(-1);
  if (key[0] === 'i') return kdIdle(n);
  if (key[0] === 'w') return kdWalk(n / 8, 1, 0);
  if (key[0] === 'g') return kdWalk(n / 8, 0.8, 0.1);
  if (key[0] === 's') return kdSettle(n, key[1] === 'L' ? 1 : 0);
  return kdDash(n);
}

// ---- the skeleton ------------------------------------------------------------
function kdYaw(v, a) { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c - v[2] * s, v[1], v[0] * s + v[2] * c]; }
function kdAdd(a, b, k = 1) { return [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]; }
function kdNorm(v) { const m = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / m, v[1] / m, v[2] / m]; }
// two bones from a to (towards) b, the middle joint bent towards hint
function kdIK(a, b, L1, L2, hint) {
  const d0 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], d = Math.hypot(...d0) || 1e-6, u = d0.map((c) => c / d), dm = Math.min(d, L1 + L2 - 0.02);
  const a1 = (L1 * L1 - L2 * L2 + dm * dm) / (2 * dm), h = Math.sqrt(Math.max(0, L1 * L1 - a1 * a1));
  const hd = hint[0] * u[0] + hint[1] * u[1] + hint[2] * u[2], n = kdNorm([hint[0] - u[0] * hd, hint[1] - u[1] * hd, hint[2] - u[2] * hd]);
  return { mid: [a[0] + u[0] * a1 + n[0] * h, a[1] + u[1] * a1 + n[1] * h, a[2] + u[2] * a1 + n[2] * h], end: kdAdd(a, u, dm) };
}
// the torso's cross-section at u (0 the crotch, 1 the neck's base)
function kdProf(u, breath) {
  const P = KR.prof;
  let i = 0;
  while (i < P.length - 2 && u > P[i + 1][0]) i++;
  const t = clamp((u - P[i][0]) / (P[i + 1][0] - P[i][0]), 0, 1), e = t * t * (3 - 2 * t), sw = u > 0.5 && u < 0.93 ? 1 + 0.035 * breath : 1;
  return [lerp(P[i][1], P[i + 1][1], e) * sw, lerp(P[i][2], P[i + 1][2], e) * sw];
}

// Joints and frames from a pose, in body px (x his right, y up, z his
// forward), the pelvis over the feet.
function kdRig(o) {
  const R = KR, pel = o.pel, len = R.neck - R.crotch, base = R.crotch - R.hip, sp = Math.sin(o.pitch);
  // the spine: a point and its turn at u
  const spine = (u) => {
    const h = base + len * u, lean = h > 0 ? sp * h * (0.75 + 0.25 * u) : sp * h * 0.3;
    const k = clamp((u - 0.2) / 0.6, 0, 1), e = k * k * (3 - 2 * k);
    return { c: [pel[0] * (1 - 0.35 * u), pel[1] + h * Math.cos(o.pitch * 0.6), pel[2] + lean], yaw: lerp(o.hipYaw, o.chestYaw, e), roll: lerp(o.hipRoll, o.chestRoll, e) };
  };
  const J = { spine, o };
  const us = (R.shoulder - R.crotch) / len, S = spine(us), lift = 0.35 * (o.breath || 0);
  J.chest = spine(0.66);
  J.shoulder = [1, -1].map((sd) => kdAdd(S.c, kdYaw([sd * R.shoulderW, lift + S.roll * sd * R.shoulderW - 0.2, -0.2], S.yaw)));
  J.hip = [1, -1].map((sd) => kdAdd(pel, kdYaw([sd * R.hipW, -0.5 + o.hipRoll * sd * R.hipW, 0], o.hipYaw)));
  // legs: knees bend forward (and a little out)
  J.knee = []; J.ankle = []; J.foot = [];
  for (let i = 0; i < 2; i++) {
    const f = o.feet[i], tgt = [f[0], R.ankle + f[1], f[2]], fwd = kdYaw([i ? -0.15 : 0.15, 0, 1], o.hipYaw * 0.5);
    const r = kdIK(J.hip[i], tgt, R.thigh, R.shin, fwd);
    J.knee.push(r.mid); J.ankle.push(r.end);
    J.foot.push({ yaw: o.hipYaw * 0.4, toe: (o.toe && o.toe[i]) || 0 });
  }
  // arms: swung from the shoulder, or reaching for a hand's place
  J.elbow = []; J.wrist = []; J.hand = [];
  for (let i = 0; i < 2; i++) {
    const a = o.arms[i], sd = i ? -1 : 1, s0 = J.shoulder[i];
    let el, wr;
    if (a.hand) {
      const r = kdIK(s0, kdAdd([a.hand[0], a.hand[1], a.hand[2]], [pel[0], pel[1] - R.hip, 0]), R.upper, R.fore, kdYaw([sd * 0.7, -0.6, -0.5], S.yaw));
      el = r.mid; wr = r.end;
    } else {
      const d1 = kdYaw([sd * Math.sin(a.abd), -Math.cos(a.abd) * Math.cos(a.swing), Math.cos(a.abd) * Math.sin(a.swing)], S.yaw);
      const s2 = a.swing + a.bend, d2 = kdYaw([sd * Math.sin(a.abd * 0.8), -Math.cos(a.abd) * Math.cos(s2), Math.cos(a.abd) * Math.sin(s2)], S.yaw);
      el = kdAdd(s0, d1, R.upper); wr = kdAdd(el, d2, R.fore);
    }
    J.elbow.push(el); J.wrist.push(wr);
    J.hand.push(kdAdd(wr, kdNorm([wr[0] - el[0], wr[1] - el[1], wr[2] - el[2]]), 1.1));
  }
  // the head: over the neck, turned half as far as the shoulders, kept
  // fairly level as he leans
  const top = spine(1);
  J.head = { c: kdAdd(top.c, [0, 4.5 + (o.headY || 0), 0.15 + sp * 0.6]), yaw: o.chestYaw * 0.55 + (o.headYaw || 0) };
  J.neck = top.c;
  return J;
}

// ---- rendering ---------------------------------------------------------------
// cos and sin of n steps round a circle, kept
const KD_TRIG = new Map();
function kdTrig(n) {
  let t = KD_TRIG.get(n);
  if (!t) { t = [new Float64Array(n), new Float64Array(n)]; for (let j = 0; j < n; j++) { t[0][j] = Math.cos((j / n) * kdTau); t[1][j] = Math.sin((j / n) * kdTau); } KD_TRIG.set(n, t); }
  return t;
}
// Materials: [ramp, lo, hi, gamma].
const KD_MAT = [null,
  [KP.suit, 0, 4, 1.35], // 1 suit
  [KP.plate, 1, 4, 1.45], // 2 plate
  [KP.boot, 0, 3, 1.2], // 3 boot
  [KP.pane, 0, 2, 1], // 4 visor
  [KP.plate, 1, 4, 1.9], // 5 helm
  [KP.plate, 0, 3, 1.3], // 6 glove
  [KP.suit, 0, 3, 1.2], // 7 pack
  [KP.plate, 0, 2, 1.2], // 8 belt, the visor's rim
  [KP.plate, 1, 3, 1.3], // 9 the plates on the legs
  [KP.plate, 2, 4, 1.1], // 10 the visor's rim
  [KP.plate, 2, 3, 1.5], // 11 the chin
];

// One frame: face, a drawn facing; key, a pose's key. Returns the sprite's
// parts: { spr (PntSpr), hand, offHand, lamp, castHand, restHand,
// restBehind } in its px, the feet on row KINDLER_FEET in the middle of
// its KINDLER_W columns.
function kdRender(face, key) {
  // (seen from the side, the head and shoulders are cheated a little
  // towards us, so the visor and the chest's circuits show)
  const o = kdPose(key), cheat = KD_CHEAT[face];
  o.chestYaw += cheat * 0.35; o.headYaw = (o.headYaw || 0) + cheat * 0.65;
  const J = kdRig(o), W = KINDLER_W, H = KINDLER_H, ox = W / 2, by = KINDLER_FEET + 0.5;
  const ang = KD_FACE[face], fx = Math.cos(ang), fy = Math.sin(ang), rx = -fy, ry = fx, st = o.stretch || 1;
  const N = W * H, zb = new Float32Array(N).fill(-1e9), mat = new Uint8Array(N), val = new Float32Array(N), part = new Uint8Array(N);
  const seed = hashInts(77, face.charCodeAt(0), face.length);
  // body px to the screen: [x, y, depth]
  const proj = (p) => {
    const z = p[2] * st, gx = p[0] * rx + z * fx, gw = p[0] * ry + z * fy, h = p[1] / Math.pow(st, 0.3);
    return [ox + gx, by - h + KD_K * gw, gw + KD_K * h];
  };
  const shade = (n) => {
    const gx = n[0] * rx + n[2] * fx, gw = n[0] * ry + n[2] * fy;
    return { s: gx * KD_L[0] + n[1] * KD_L[1] + gw * KD_L[2], v: KD_K * n[1] + gw };
  };
  const pelD = proj(o.pel)[2], sh0 = 1 / Math.pow(st, 0.3), Lx = KD_L[0], Ly = KD_L[1], Lz = KD_L[2];
  const cellA = new Int32Array(N), cellB = new Int32Array(N);
  // a sample of the surface: where (px, py, pz), its normal (nx, ny, nz),
  // what it is, which part, and the stroke cell it falls in (a, along; b,
  // around). (Scalars throughout: this runs some ten thousand times a
  // frame.)
  const put = (px, py, pz, nx, ny, nz, pt, a, b) => {
    const ngx = nx * rx + nz * fx, ngw = nx * ry + nz * fy;
    if (KD_K * ny + ngw < -0.25) return -1;
    const z = pz * st, gw = px * ry + z * fy, h = py * sh0;
    const x = Math.floor(ox + px * rx + z * fx), y = Math.floor(by - h + KD_K * gw);
    if (x < 0 || y < 0 || x >= W || y >= H) return -1;
    const i = y * W + x, dep = gw + KD_K * h;
    if (dep <= zb[i]) return -1;
    zb[i] = dep; part[i] = pt;
    // lit from the upper left; further back is darker
    const sv = 0.36 + 0.56 * (ngx * Lx + ny * Ly + ngw * Lz) - (pelD - dep > 1.5 ? (pelD - dep - 1.5) * 0.06 : 0);
    val[i] = sv < 0 ? 0 : sv > 1 ? 1 : sv;
    cellA[i] = Math.floor(a); cellB[i] = Math.floor(b + artHash(Math.floor(a), pt, 5) * 3);
    return i;
  };
  const step = 0.5;
  let partN = 0;
  // a rounded volume: c, radii [side, up, forward] turned by yaw; pw > 2
  // squares it off; tilt pitches it; matFn(nx, ny, nz, lx, ly, lz) (its
  // own frame) says what the surface is
  const ball = (c, r, yaw, matFn, pt0, pw = 2, tilt = 0) => {
    const pt = pt0 || ++partN, nT = Math.max(6, Math.ceil((Math.PI * Math.max(r[1], r[0], r[2])) / step));
    const cy = Math.cos(yaw), sy = Math.sin(yaw), c2 = Math.cos(tilt), s2 = Math.sin(tilt), e = 2 / pw, round = pw === 2;
    // (pw is 2 or 4)
    const sq = (v) => (round ? v : v < 0 ? -Math.sqrt(-v) : Math.sqrt(v)), nq = (v, rr) => (round ? v / rr : (v * v * v) / (rr * rr * rr * rr));
    for (let i = 0; i <= nT; i++) {
      const th = (i / nT) * Math.PI, ct = Math.cos(th), stt = Math.sin(th), nP = Math.max(6, Math.ceil((kdTau * Math.max(r[0], r[2]) * stt) / step));
      const qs = sq(stt), ly = r[1] * sq(ct), [TC, TS] = kdTrig(nP);
      for (let j = 0; j < nP; j++) {
        const ph = (j / nP) * kdTau, lx = r[0] * qs * sq(TC[j]), lz = r[2] * qs * sq(TS[j]);
        let nx = nq(lx, r[0]), ny = nq(ly, r[1]), nz = nq(lz, r[2]);
        const nm = 1 / (Math.hypot(nx, ny, nz) || 1);
        nx *= nm; ny *= nm; nz *= nm;
        // tilt (about the side), then yaw
        const ty = ly * c2 - lz * s2, tz = ly * s2 + lz * c2, tny = ny * c2 - nz * s2, tnz = ny * s2 + nz * c2;
        const k = put(c[0] + lx * cy - tz * sy, c[1] + ty, c[2] + lx * sy + tz * cy, nx * cy - tnz * sy, tny, nx * sy + tnz * cy, pt, th * r[1], ph * r[0]);
        if (k >= 0) mat[k] = matFn(nx, ny, nz, lx, ly, lz);
      }
    }
    return pt;
  };
  // a tube through points, radii at each; matFn(segment, t, nx, ny, nz)
  // says what the surface is; the joints between rounded (and the ends:
  // ends)
  const tube = (pts, rad, matFn, ends) => {
    const pt = ++partN;
    let along = 0;
    for (let s = 0; s + 1 < pts.length; s++) {
      const a = pts[s], b = pts[s + 1], dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz) || 1e-6, ux = dx / L, uy = dy / L, uz = dz / L;
      // a frame round the bone
      const e1 = kdNorm(Math.abs(uy) < 0.9 ? [uz, 0, -ux] : [1, 0, 0]);
      const e2 = [uy * e1[2] - uz * e1[1], uz * e1[0] - ux * e1[2], ux * e1[1] - uy * e1[0]];
      const nL = Math.max(2, Math.ceil(L / step));
      for (let k = 0; k <= nL; k++) {
        const t = k / nL, r = lerp(rad[s], rad[s + 1], t), cx = a[0] + dx * t, cy = a[1] + dy * t, cz = a[2] + dz * t, nA = Math.max(8, Math.ceil((kdTau * r) / step)), [TC, TS] = kdTrig(nA);
        for (let j = 0; j < nA; j++) {
          const th = (j / nA) * kdTau, cs = TC[j], sn = TS[j], nx = e1[0] * cs + e2[0] * sn, ny = e1[1] * cs + e2[1] * sn, nz = e1[2] * cs + e2[2] * sn;
          const i = put(cx + nx * r, cy + ny * r, cz + nz * r, nx, ny, nz, pt, along + t * L, th * r);
          if (i >= 0) mat[i] = matFn(s, t, nx, ny, nz);
        }
      }
      along += L;
    }
    pts.forEach((p, i) => {
      if (!ends && (i === 0 || i === pts.length - 1)) return;
      const sg = Math.min(i, pts.length - 2), tt = i ? 1 : 0;
      ball(p, [rad[i], rad[i], rad[i]], 0, (nx, ny, nz) => matFn(sg, tt, nx, ny, nz), pt);
    });
    return pt;
  };

  // the torso: rings up the spine, each turned and tilted as the spine is
  const torsoPt = (u, phi) => {
    const S = J.spine(u), [w, dp] = kdProf(u, o.breath || 0), cp = Math.cos(phi), sp = Math.sin(phi);
    const l = [w * cp, S.roll * w * cp, dp * sp + (u > 0.55 && u < 0.9 && sp > 0 ? 0.25 * sp : 0)];
    const [w2, d2] = kdProf(Math.min(1, u + 0.03), o.breath || 0), dr = ((w2 - w) * cp * cp + (d2 - dp) * sp * sp) / (0.03 * (KR.neck - KR.crotch));
    return { p: kdAdd(S.c, kdYaw(l, S.yaw)), n: kdNorm(kdYaw([cp / w, -dr * 1.4, sp / dp], S.yaw)) };
  };
  const torsoMat = (u, sp, cp, ny) => {
    if (u > 0.355 && u < 0.415) return 8; // the belt
    if (u > 0.64 && u < 0.86 && sp > 0.3) return 2; // the upper chest's plate
    if (u > 0.86 && Math.abs(cp) > 0.6 && ny > 0.3) return 2; // the yoke over the shoulders
    return 1;
  };
  const torso = () => {
    const pt = ++partN, len = KR.neck - KR.crotch, nU = Math.ceil(len / step), br = o.breath || 0;
    for (let k = 0; k <= nU; k++) {
      const u = k / nU, S = J.spine(u), [w, dp] = kdProf(u, br), [w2, d2] = kdProf(Math.min(1, u + 0.03), br), nA = Math.max(10, Math.ceil((kdTau * w) / step));
      const cy = Math.cos(S.yaw), sy = Math.sin(S.yaw), dW = (w2 - w) / (0.03 * len), dD = (d2 - dp) / (0.03 * len), bulge = u > 0.55 && u < 0.9 ? 0.25 : 0;
      const [TC, TS] = kdTrig(nA);
      for (let j = 0; j < nA; j++) {
        const phi = (j / nA) * kdTau, cp = TC[j], sp = TS[j];
        const lx = w * cp, ly = S.roll * w * cp, lz = dp * sp + (sp > 0 ? bulge * sp : 0);
        let nx = cp / w, ny = -(dW * cp * cp + dD * sp * sp) * 1.4, nz = sp / dp;
        const nm = 1 / Math.hypot(nx, ny, nz);
        nx *= nm; ny *= nm; nz *= nm;
        const i = put(S.c[0] + lx * cy - lz * sy, S.c[1] + ly, S.c[2] + lx * sy + lz * cy, nx * cy - nz * sy, ny, nx * sy + nz * cy, pt, u * len, phi * w);
        if (i >= 0) mat[i] = torsoMat(u, sp, cp, ny);
      }
    }
    return pt;
  };

  // legs: thigh and shin, a kneecap and a shin guard of plate, the boot
  const fwx = -Math.sin(o.hipYaw), fwz = Math.cos(o.hipYaw);
  const legMat = (s, t, nx, ny, nz) => {
    const dot = nx * fwx + nz * fwz;
    if (s === 0 && t > 0.82 && dot > 0.45) return 9;
    if (s === 1 && t > 0.15 && t < 0.72 && dot > 0.35) return 9;
    if (s === 1 && t > 0.86) return 9; // the boot's cuff
    return 1;
  };
  const leg = (i) => {
    tube([J.hip[i], J.knee[i], J.ankle[i]], [2.05, 1.6, 1.2], legMat, false);
    const F = J.foot[i];
    ball(kdAdd(J.ankle[i], kdYaw([0, -0.35, 0.95], F.yaw)), [1.5, 1.3, 2.5], F.yaw, () => 3, 0, 2, F.toe * 0.6);
  };
  // arms: a cap of plate on the shoulder, the forearm's bracer, the glove
  const armMat = (s, t, nx, ny) => {
    if (s === 0 && t < 0.2 && ny > 0.1) return 2;
    if (s === 1 && t > 0.55) return 2;
    return 1;
  };
  const arm = (i) => {
    tube([J.shoulder[i], J.elbow[i], J.wrist[i]], [1.5, 1.2, 1.08], armMat, true);
    ball(J.hand[i], [1.15, 1.2, 1.2], 0, () => 6);
  };
  // the pack, a rounded block between the shoulder blades, lidded in plate
  const pack = () => {
    const S = J.spine(0.68), [, dp] = kdProf(0.68, 0);
    J.packC = kdAdd(S.c, kdYaw([0, -0.4 + (o.pack || 0), -(dp + 1.05)], S.yaw)); J.packYaw = S.yaw;
    ball(J.packC, [2.9, 4.0, 1.25], S.yaw, (nx, ny, nz, lx, ly) => (ly > 2.9 ? 2 : 7), 0, 4);
  };
  // the helm: a rounded shell, squarer at the jaw, the visor across its
  // front; a neck under it
  const helm = () => {
    const Hd = J.head, r = KR.head;
    tube([J.neck, kdAdd(Hd.c, [0, -2.6, 0])], [1.45, 1.35], () => 1, false);
    ball(Hd.c, r, Hd.yaw, (nx, ny, nz, lx, ly, lz) => {
      const fz = lz / r[2], up = ly / r[1], sd = Math.abs(lx / r[0]);
      if (fz > 0.3 && up > -0.22 && up < 0.62 && sd < 0.92) return fz > 0.42 && up > -0.12 && up < 0.52 && sd < 0.84 ? 4 : 10;
      return up < -0.3 && fz > 0.3 ? 11 : 5; // (the chin)
    }, 0, 2, -0.28);
  };

  // (the depth sorts what's in front)
  torso();
  for (let i = 0; i < 2; i++) leg(i);
  for (let i = 0; i < 2; i++) arm(i);
  pack();
  helm();

  // a pixel the samples missed, inside a part: its neighbour's
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    if (mat[i]) continue;
    const l = i - 1, r = i + 1, u = i - W, d = i + W, n = (mat[l] ? 1 : 0) + (mat[r] ? 1 : 0) + (mat[u] ? 1 : 0) + (mat[d] ? 1 : 0);
    if (n < 3) continue;
    const j = mat[l] && mat[r] ? l : u;
    if (!mat[j]) continue;
    mat[i] = mat[j]; val[i] = val[j]; part[i] = part[j]; zb[i] = zb[j]; cellA[i] = cellA[j]; cellB[i] = cellB[j];
  }
  // where a part is overlapped by one nearer, it's in that one's shadow:
  // a dark seam, so limbs read against the body
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!mat[i]) continue;
    for (let k = 0; k < 4; k++) {
      const xx = x + (k === 0 ? 1 : k === 1 ? -1 : 0), yy = y + (k === 2 ? -1 : k === 3 ? 1 : 0);
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = yy * W + xx;
      if (mat[j] && part[j] !== part[i] && zb[j] > zb[i] + 1.2) { val[i] = Math.max(0, val[i] - 0.3); break; }
    }
  }
  // laid in strokes: each pixel the tone of its material at its light,
  // moved by its stroke's jitter
  const sp = new PntSpr(W, H, seed);
  for (let i = 0; i < N; i++) {
    if (!mat[i]) continue;
    const ia = cellA[i], ib = cellB[i], pt = part[i], jit = artHash(ia * 31 + pt, ib, seed) + artHash(ib, ia * 7 + pt, seed + 1) - 1;
    const [ramp, lo, hi, g] = KD_MAT[mat[i]], t = lo + (hi - lo) * Math.pow(val[i], g) + jit * 0.75;
    sp.px(i % W, (i / W) | 0, ramp[clamp(Math.round(t), lo, hi)]);
  }
  // features, by hand: a point on the body is drawn if nothing's nearer
  const seen = (p, slack = 0.9) => {
    const q = proj(p), x = Math.floor(q[0]), y = Math.floor(q[1]);
    if (x < 0 || y < 0 || x >= W || y >= H) return null;
    return q[2] >= zb[y * W + x] - slack ? [x, y] : null;
  };
  const A = KP.amber, done = new Set();
  const dot = (p, col, glow, slack) => { const s = seen(p, slack); if (s && !done.has(s[1] * W + s[0])) { done.add(s[1] * W + s[0]); sp.px(s[0], s[1], col, glow); } return s; };
  // the chest's V of circuits, down to the seed-star
  const starU = 0.6, front = Math.PI / 2;
  for (const sd of [-1, 1]) for (let k = 0; k <= 24; k++) {
    const t = k / 24, T0 = torsoPt(lerp(0.85, starU + 0.03, t), front + sd * lerp(0.95, 0.12, t));
    dot(kdAdd(T0.p, T0.n, 0.2), A[shade(T0.n).s > 0.05 ? 2 : 1], true);
  }
  const star = torsoPt(starU, front), sc = seen(kdAdd(star.p, star.n, 0.3));
  if (sc) {
    const [x, y] = sc;
    for (const [dx, dy, c] of [[-1, 0, DIVER_PAL.star[0]], [1, 0, DIVER_PAL.star[0]], [0, -1, DIVER_PAL.star[0]], [0, 1, DIVER_PAL.star[0]], [0, 0, DIVER_PAL.starHeart[0]]]) sp.px(x + dx, y + dy, c, true);
  }
  // the buckle
  const bk = torsoPt(0.39, front);
  dot(kdAdd(bk.p, bk.n, 0.3), A[1], true);
  // the cuffs: a ring of amber round each wrist; the shins: a line down
  // the outer front
  for (let i = 0; i < 2; i++) {
    const el = J.elbow[i], wr = J.wrist[i], dv = [wr[0] - el[0], wr[1] - el[1], wr[2] - el[2]], cuff = kdAdd(el, dv, 0.84), u = kdNorm(dv);
    const e1 = kdNorm(Math.abs(u[1]) < 0.9 ? [u[2], 0, -u[0]] : [1, 0, 0]), e2 = [u[1] * e1[2] - u[2] * e1[1], u[2] * e1[0] - u[0] * e1[2], u[0] * e1[1] - u[1] * e1[0]];
    for (let k = 0; k < 16; k++) {
      const th = (k / 16) * kdTau, n = kdAdd(kdAdd([0, 0, 0], e1, Math.cos(th)), e2, Math.sin(th));
      dot(kdAdd(cuff, n, 1.2), A[shade(n).s > 0 ? 2 : 1], true, 0.6);
    }
    const kn = J.knee[i], an = J.ankle[i], sd = i ? -1 : 1, out = kdNorm(kdYaw([sd * 0.75, 0, 0.66], o.hipYaw));
    for (let k = 0; k <= 12; k++) {
      const t = lerp(0.22, 0.84, k / 12), c = kdAdd(kn, [an[0] - kn[0], an[1] - kn[1], an[2] - kn[2]], t);
      dot(kdAdd(c, out, lerp(1.6, 1.25, t) + 0.1), A[k === 0 ? 2 : 1], true, 0.7);
    }
  }
  // the pack's air port, from behind: a lit ring and a light
  const pp = seen(kdAdd(J.packC, kdYaw([0, 0.6, -1.3], J.packYaw)), 0.6);
  if (pp) { sp.px(pp[0], pp[1], A[2], true); sp.px(pp[0] + 1, pp[1], A[1], true); sp.px(pp[0], pp[1] - 1, KP.plate[2]); sp.px(pp[0] + 1, pp[1] + 1, KP.plate[1]); }
  // the helm: a lit ridge down its back; the visor's glint, upper left;
  // the brow lamp over the visor
  const Hd = J.head, r = KR.head, tl = (l) => { const c2 = Math.cos(-0.28), s2 = Math.sin(-0.28); return [l[0], l[1] * c2 - l[2] * s2, l[1] * s2 + l[2] * c2]; };
  for (let k = 0; k <= 12; k++) {
    const th = lerp(0.15, 0.62, k / 12) * Math.PI, l = [0, r[1] * Math.cos(th) * 1.02, -r[2] * Math.sin(th) * 1.02];
    dot(kdAdd(Hd.c, kdYaw(tl(l), Hd.yaw)), KP.plate[k < 5 ? 3 : 2], false, 0.7);
  }
  let gl = null;
  for (let k = 0; k < W + H && !gl; k++) for (let y = Math.max(0, k - W + 2); y <= Math.min(H - 2, k); y++) {
    const x = k - y, i = y * W + x;
    if (x < W - 1 && mat[i] === 4 && mat[i + 1] === 4 && mat[i + W] === 4 && mat[i + W + 1] === 4) { gl = [x, y]; break; }
  }
  if (gl) { sp.px(gl[0], gl[1], KP.glint); sp.px(gl[0] + 1, gl[1], '#5f8cf0'); }
  const lampP = kdAdd(Hd.c, kdYaw(tl([0, r[1] * 0.62, r[2] * 0.85]), Hd.yaw)), lq = proj(lampP), ls = seen(lampP, 0.8);
  if (ls) {
    const [x, y] = ls;
    sp.px(x, y, DIVER_PAL.lamp[0], true); sp.px(x + 1, y, DIVER_PAL.lamp[0], true); sp.px(x - 1, y, A[3], true); sp.px(x + 2, y, A[2], true); sp.px(x, y - 1, A[3], true);
  } else if (fy < 0 && Math.abs(fx) > 0.3) {
    // turned away, the lamp's glow just shows past the helm
    const side = seen(kdAdd(Hd.c, kdYaw([r[0] * 0.75 * (fx >= 0 ? -1 : 1), r[1] * 0.55, r[2] * 0.55], Hd.yaw)), 0.8);
    if (side) sp.px(side[0] + (fx > 0 ? 1 : -1), side[1], A[2], true);
  }

  const pt2 = (p) => { const q = proj(p); return { x: Math.round(q[0] - 0.5), y: Math.round(q[1] - 0.5) }; };
  const out = { spr: sp, hand: pt2(J.hand[0]), offHand: pt2(J.hand[1]), lamp: { x: lq[0] + 0.5, y: lq[1] } };
  if (o.cast !== undefined) {
    const c = o.cast, other = 1 - c;
    out.castHand = pt2(J.hand[c]); out.restHand = pt2(J.hand[other]);
    out.restBehind = proj(J.hand[other])[2] < proj(J.spine(0.6).c)[2] - 0.5;
  }
  return out;
}

// ---- the frames, cached ------------------------------------------------------
const KD = { faces: null, mirror: null, base: new Map(), spr: new Map(), queue: [], built: 0 };

function kdMake(r) {
  const sp = r.spr.done();
  sp.ax = KINDLER_W / 2; sp.ay = KINDLER_FEET;
  sp.hand = r.hand; sp.offHand = r.offHand; sp.lamp = r.lamp;
  if (r.castHand) { sp.castHand = r.castHand; sp.restHand = r.restHand; sp.restBehind = r.restBehind; }
  sp.flash = tinted(sp.c, '#ffffff');
  return sp;
}
function kdFlip(s) {
  const f = flippedSprite(s), w = s.w, fl = (p) => p && { x: w - 1 - p.x, y: p.y };
  f.flash = flipped(s.flash);
  f.hand = fl(s.hand); f.offHand = fl(s.offHand); f.lamp = { x: w - s.lamp.x, y: s.lamp.y };
  if (s.castHand) { f.castHand = fl(s.castHand); f.restHand = fl(s.restHand); }
  return f;
}
function kdBase(face, key) {
  const k = face + key;
  let s = KD.base.get(k);
  if (!s) { s = kdMake(kdRender(face, key)); KD.base.set(k, s); KD.built++; }
  return s;
}
// The sprite for facing fi (0-7, clockwise from east) and a pose's key.
function kdGet(fi, key) {
  const k = fi + key;
  let s = KD.spr.get(k);
  if (!s) { const b = kdBase(KD.faces[fi], key); s = KD.mirror[fi] ? kdFlip(b) : b; KD.spr.set(k, s); }
  return s;
}
// A cast's key: from the front and the back, the casting hand's own arm;
// from the side and three-quarters, the arm on the aim's side.
function kdCastKey(face, slot, ph, legs) {
  const arm = face === 'S' || face === 'N' ? (slot === 'off' ? 'o' : 'm') : face === 'SE' ? 'o' : 'm';
  return 'c' + arm + ph + '|' + legs;
}
// Builds the next of the frames not yet wanted, n a draw, unless one was
// just built because it was wanted.
function kdWarm(n) {
  for (let i = 0; i < n && KD.queue.length && !KD.built; i++) { const [f, k] = KD.queue.shift(); kdBase(f, k); }
  KD.built = 0;
}

// What render.js wants at the start: diver[facing][0], each facing's first
// idle frame, and cast[facing][main, off][0], the strike over idle legs,
// for the eight facings clockwise from east (facings: the drawn five's
// names; mirrored: those flipped). The rest come from kindlerPick.
function buildKindlerSprites(facings, mirrored) {
  KD.faces = facings; KD.mirror = mirrored; KD.base.clear(); KD.spr.clear();
  const diver = facings.map((f, i) => [kdGet(i, 'i0')]);
  const cast = facings.map((f, i) => ['main', 'off'].map((slot) => [kdGet(i, kdCastKey(f, slot, 's', 'i0'))]));
  // the rest, in the order they're likely wanted
  const q = [], faces = ['S', 'E', 'SE', 'N', 'NE'], n8 = [0, 1, 2, 3, 4, 5, 6, 7];
  for (const f of faces) for (const k of n8) q.push([f, 'w' + k]);
  for (const f of faces) for (const k of n8) q.push([f, 'g' + k], [f, 'i' + k]);
  for (const f of faces) q.push([f, 'sR0'], [f, 'sR1'], [f, 'sL0'], [f, 'sL1'], [f, 'd0'], [f, 'd1']);
  const slots = (f) => (f === 'S' || f === 'N' ? ['main', 'off'] : ['main']);
  for (const f of faces) for (const sl of slots(f)) for (const ph of 'sfrw') q.push([f, kdCastKey(f, sl, ph, 'i0')]);
  // (a cast over walking legs is built when it's first wanted)
  KD.queue = q; KD.built = 0;
  return { diver, cast };
}

// The frame to draw for the diver now, and the way he's drawn facing:
// { spr, face: {x, y} }. cast: the cast pose being shown (render.js), or
// null. Keeps its own state on the dive (d.kAnim): the walk's phase, from
// the distance walked; the facing, turned towards where he faces at
// T.paint.kindler.turn; how long he's walked, stopped and stood.
function kindlerPick(d, cast) {
  const p = d.p, K = T.paint.kindler, now = Game.realT;
  let A = d.kAnim;
  if (!A || A.p !== p) A = d.kAnim = { p, t: now, x: p.x, y: p.y, ang: Math.atan2(p.fy, p.fx), ph: 0, walk: 0, stop: 9, idle: 0, lead: 'R' };
  const dt = clamp(now - A.t, 0, 0.1);
  A.t = now;
  let dist = Math.hypot(p.x - A.x, p.y - A.y) * AP;
  A.x = p.x; A.y = p.y;
  if (dist > 30) dist = 0; // (a jump: a way through, a new floor)
  const dashing = p.dashT > 0;
  // the facing: turned over a moment, the short way (a half turn through
  // facing the camera); casting or dashing, straight to it
  const want = cast ? cast.a : Math.atan2(p.fy, p.fx);
  if (dashing || cast) A.ang = want;
  else {
    let dA = Math.atan2(Math.sin(want - A.ang), Math.cos(want - A.ang));
    if (Math.abs(dA) > Math.PI - 0.3) dA = Math.abs(dA) * (Math.cos(A.ang) >= 0 ? 1 : -1);
    const stepA = K.turn * dt;
    A.ang += clamp(dA, -stepA, stepA);
  }
  const fi = facingIndex(Math.cos(A.ang), Math.sin(A.ang)), face = KD.faces[fi];
  const walking = p.walkT > 0 && !dashing && !(d.dying > 0);
  let key, legs = 'i0';
  if (dashing) {
    key = p.dashT > T.dash.time * 0.5 ? 'd0' : 'd1';
    A.walk = 0; A.stop = 0; A.lead = 'R';
  } else if (walking) {
    if (A.walk === 0) A.ph = K.startAt;
    A.walk += dt;
    // a stride's length on the screen: shorter seen from in front or behind
    const L = K.cycle * lerp(1, Math.hypot(Math.cos(A.ang), KD_K * Math.sin(A.ang)), K.depthCycle);
    A.ph = (A.ph + Math.max(dist, K.tread * dt) / L) % 1;
    const n = Math.floor(A.ph * 8) % 8;
    key = legs = (A.walk < K.start ? 'g' : 'w') + n;
    A.stop = 0; A.idle = 0;
    A.lead = A.ph < 0.25 || A.ph >= 0.75 ? 'R' : 'L';
  } else {
    A.walk = 0;
    A.stop += dt;
    if (A.stop < K.settle[0]) key = 's' + A.lead + '0';
    else if (A.stop < K.settle[1]) key = 's' + A.lead + '1';
    else { A.idle += dt; key = 'i' + (Math.floor((A.idle / K.idle) * 8) % 8); }
  }
  if (cast) {
    const k = 1 - cast.t / cast.max, ph = cast.charging ? 'w' : k < K.cast[0] ? 's' : k < K.cast[1] ? 'f' : 'r';
    key = kdCastKey(face, cast.slot, ph, legs[0] === 'g' ? 'w' + legs[1] : legs);
  }
  const spr = kdGet(fi, key);
  kdWarm(K.warm);
  return { spr, face: { x: Math.cos(A.ang), y: Math.sin(A.ang) } };
}

// A dash's afterimage: the launch, stretched.
function kindlerGhost(fi) { return KD.faces ? kdGet(fi, 'd1') : null; }

// Wick: a little round drone of dark gunmetal, lit from the upper left,
// with no outline: a dark glass band across its face (its cyan eye is set
// on it as it looks: render.js), a fin each side, a brass antenna with a
// lit tip, and the violet glow of its lift underneath. Its middle (cx, cy)
// is the band's middle.
function wickSprite() {
  const s = new PntSpr(15, 16, 77), cx = 7, cy = 8;
  const SHELL = ['#07080c', '#0f121a', '#1a1f2a', '#2a3242', '#46526a', '#7a88a0'];
  // the fins, behind the shell, darker
  for (const sx of [-1, 1]) s.ell(cx + sx * 5.6, cy + 1, 1.8, 2.6, SHELL, { lo: 0, hi: 2, jit: 0.1 });
  // the shell: a dome, the lower half a darker skirt
  s.ell(cx + 0.5, cy + 0.5, 5.4, 5.0, SHELL, { lo: 0, hi: 5, bias: 0.05 });
  s.ell(cx + 0.5, cy + 3.6, 4.0, 1.6, SHELL, { lo: 0, hi: 1, jit: 0.1 });
  // the glass band, a rim of plate over it lit on the left
  for (let x = cx - 4; x <= cx + 5; x++) {
    const end = x === cx - 4 || x === cx + 5;
    s.px(x, cy, end ? SHELL[1] : '#04060a'); s.px(x, cy + 1, end ? SHELL[0] : '#070a10');
    s.px(x, cy - 1, x < cx ? SHELL[4] : SHELL[3]);
  }
  // a glint on the crown, upper left
  s.px(cx - 2, cy - 4, SHELL[5]); s.px(cx - 1, cy - 4, SHELL[4]); s.px(cx - 3, cy - 3, SHELL[4]);
  // the antenna, brass, its tip lit
  s.px(cx + 2, cy - 5, '#4a3a20'); s.px(cx + 2, cy - 6, '#7a6234'); s.px(cx + 3, cy - 7, '#7a6234'); s.px(cx + 3, cy - 8, '#ffd890', true);
  // the lift's glow underneath
  s.px(cx, cy + 5, '#c9a2ff', true); s.px(cx + 1, cy + 5, '#c9a2ff', true); s.px(cx - 1, cy + 5, '#6a4a9a'); s.px(cx + 2, cy + 5, '#6a4a9a');
  const o = s.done();
  o.cx = cx; o.cy = cy;
  return o;
}
