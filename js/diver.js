'use strict';
// ---------------------------------------------------------------------------
// The player: the Kindler, in the Charter's blue and amber, painted in the
// painted style (paint.js, docs/PAINTED.md): shapes shaded in short strokes
// from the upper left, then the features set by hand, and no outline. A
// dark navy mass (the suit) with royal-blue plate catching the light on the
// helm, the pauldrons, the chest, the knees and the cuffs; a faced helm
// with a black pane and one glint, a warm-white brow lamp over it (the lamp
// you see by); amber circuits: a V down the chest to the seed-star, lines
// down the arms and shins, the buckle; from behind, a ridge down the helm
// and an air port. About 42 art px tall, drawn in five facings (S, SE, E,
// NE, N; the rest are mirrors), each an idle frame and a four-step walk (a
// foot down in front, passing with the body a pixel higher, the other foot,
// passing), and a cast pose in each, the arm on the aim's side thrust out
// (from the front and the back, the casting hand's own arm). Wick, the
// drone, is painted here too.
//
// kindlerFrame(face, frame, cast) paints one: { spr (PntSpr), hand (the
// main hand, where it holds a focus), lamp (the brow lamp's middle),
// castHand (the fist held out), restHand (the other hand in the pose),
// restBehind (whether that one is behind the body) }, in the sprite's px,
// its feet on row KINDLER_FEET in the middle of its KINDLER_W columns.
// ---------------------------------------------------------------------------

// What the rest of the game reads: the lamp's and the circuits' colours.
const DIVER_PAL = { lamp: ['#fff0d8'], circuit: ['#ffb030'], star: ['#ffe48a'], starHeart: ['#fffbea'] };
const KINDLER_W = 48, KINDLER_H = 47, KINDLER_FEET = 44;
const KP = {
  suit: ['#05060c', '#0a0b16', '#10132a', '#161b36'],
  plate: ['#0a0b16', '#141932', '#1c2f80', '#2f5cd8', '#86b0ff'],
  boot: ['#050405', '#0b0909', '#18120e', '#281e16'],
  amber: ['#8a4a16', '#d88c30', '#ffb030', '#ffe48a'],
  pane: ['#030409', '#05070d', '#0b1020'], glint: '#c6dcff',
};

// One frame. face: 'S', 'SE', 'E', 'NE' or 'N'; frame: 0 idle, 1-4 the
// walk; cast: null, or which arm is thrust out ('main', his right; 'off',
// his left: only from the front and the back, where it's the other arm).
function kindlerFrame(face, frame, cast) {
  const s = new PntSpr(KINDLER_W, KINDLER_H, hashInts(face.charCodeAt(0), face.length, frame, cast ? cast.length : 0));
  const P = KP, A = P.amber, Pl = P.plate, SUIT = P.suit, BOOT = P.boot, ox = KINDLER_W / 2, by = KINDLER_FEET;
  const back = face === 'N' || face === 'NE', side = face === 'E', turn = face === 'SE' || face === 'NE';
  const bob = frame === 2 || frame === 4 ? -1 : 0;
  // the walk: each foot's step along (dx) and lift (dy); a foot forward is
  // lower walking towards the camera, higher walking away
  const fwdY = back ? -1 : side ? 0 : 1, stride = side ? 3 : turn ? 2 : 0;
  const feet = [[0, 0], [0, 0]]; // [his right, his left]
  if (frame === 1) { feet[0] = [stride, fwdY]; feet[1] = [-stride, -1]; }
  else if (frame === 2) feet[1] = [0, -2];
  else if (frame === 3) { feet[1] = [stride, fwdY]; feet[0] = [-stride, -1]; }
  else if (frame === 4) feet[0] = [0, -2];
  // arms swing against the legs
  const swing = frame === 1 ? 1 : frame === 3 ? -1 : 0;
  // his right side: -1 on our left, 1 on our right, 0 towards us (from
  // the side)
  const rs = face === 'S' || face === 'SE' ? -1 : side ? 0 : 1;
  const legX = side ? [ox + 2, ox - 2] : turn ? [ox + rs * 4, ox - rs * 3] : [ox + rs * 4, ox - rs * 4];
  const shoulder = side ? [ox + 1, ox - 1] : turn ? [ox + rs * 9, ox - rs * 7] : [ox + rs * 9, ox - rs * 9];
  const torsoRx = side ? 7.4 : turn ? 7.8 : 8.6, hx = ox + (side ? 1 : turn && !back ? 1 : 0), hy = by - 35 + bob;
  // which arm and leg are nearer us (his right, but for the front and back,
  // where both are)
  const near = (who) => (side || turn ? who === 0 : true);

  // a leg: thigh and shin, a knee plate, the boot and its cuff, a line of
  // circuit down the shin's outer side
  const leg = (who) => {
    const [dx, dy] = feet[who], lx = legX[who] + (side ? dx : turn ? dx : 0), dark = (side || turn) && !near(who);
    const top = by - 22 + bob, fy = by - 1 + Math.min(0, dy), knee = by - 13 + bob + Math.round(dy / 2);
    s.limb([[legX[who], top], [lx, knee], [lx, fy - 3]], 5.2, 4.2, (t, sd) => (dark ? SUIT[sd < 0 ? 1 : 0] : sd < 0 ? SUIT[2] : sd > 0 ? SUIT[0] : SUIT[1]));
    if (!back) s.ell(lx - 0.3, knee - 0.5, 2.6, 2.2, Pl, { lo: dark ? 0 : 1, hi: dark ? 2 : 3 });
    const bootY = fy - 1.6 + (dy > 0 ? dy : 0);
    s.ell(lx + (side ? 1 : 0), bootY, side ? 4.2 : 3.6, 2.4, BOOT, { lo: 0, hi: dark ? 1 : 3 });
    s.ell(lx, bootY - 2.4, 3.0, 1.2, Pl, { lo: dark ? 0 : 1, hi: dark ? 1 : 3, jit: 0.1 });
    if (!dark) {
      const cx = Math.round(lx + (side ? -2 : lx < ox ? -2 : 2)), y0 = knee + 2, y1 = Math.round(bootY - 3);
      for (let y = y0; y <= y1; y++) s.px(cx, y, A[y === y0 ? 2 : 1], true);
    }
  };
  // an arm hanging from its shoulder, or thrust out to (tx, ty): upper arm
  // and forearm of suit, plate at the elbow and the cuff, the gauntlet
  const arm = (who, out) => {
    const sx0 = shoulder[who], sy0 = by - 30 + bob, dark = (side || turn) && !near(who), sw = who === 0 ? swing : -swing;
    if (out) {
      const [tx, ty] = out, ex = (sx0 + tx) / 2, ey = (sy0 + ty) / 2 + 1;
      s.limb([[sx0, sy0], [ex, ey], [tx, ty]], 4.2, 3.6, (t, sd) => (sd < 0 ? Pl[t > 0.5 ? 3 : 2] : sd > 0 ? SUIT[0] : Pl[1]));
      s.ell(tx, ty, 2.8, 2.6, Pl, { lo: 1, hi: 4 });
      // the gauntlet's lit lines, and the palm
      const n = Math.max(2, Math.round(Math.hypot(tx - ex, ty - ey) * 0.8));
      for (let i = 1; i < n; i++) s.px(Math.round(ex + ((tx - ex) * i) / n), Math.round(ey + ((ty - ey) * i) / n) - 1, A[i % 2 ? 2 : 1], true);
      s.px(tx, ty, A[3], true);
      return;
    }
    const out2 = side ? 0 : who === 0 ? rs : -rs, hx0 = sx0 + (side ? sw * 2 : out2 * 2), hy0 = by - 18 + bob - Math.abs(sw);
    const ex = (sx0 + hx0) / 2 + out2, ey = by - 24 + bob;
    s.limb([[sx0, sy0], [ex, ey], [hx0, hy0]], side ? 4.8 : 4.4, side ? 4 : 3.8, (t, sd) => (dark ? SUIT[sd < 0 ? 1 : 0] : sd < 0 ? (side ? Pl[2] : SUIT[3]) : sd > 0 ? SUIT[0] : side ? SUIT[2] : SUIT[1]));
    s.ell(ex, ey, side ? 2.4 : 2.0, side ? 2.2 : 1.8, Pl, { lo: dark ? 0 : 1, hi: dark ? 1 : back ? 2 : 3 });
    s.ell(hx0, hy0 + 1, 2.6, 2.4, Pl, { lo: dark ? 0 : 1, hi: dark ? 2 : back ? 3 : 4 });
    // a line of circuit down the outer arm, a light at the cuff
    if (!dark && !back) for (let y = sy0 + 2; y < ey; y++) s.px(Math.round(sx0 + (hx0 - sx0) * ((y - sy0) / (hy0 - sy0)) + (side ? -1 : out2 * 2)), y, A[1], true);
    s.px(hx0 + out2, hy0 + 2, A[dark ? 0 : 2], !dark);
  };

  // a cast: which arm, and where its fist is held out
  let castWho = -1, castAt = null;
  if (cast) {
    // (the arm on the aim's side: from three-quarters front, his left)
    castWho = (face === 'S' || face === 'N') && cast === 'off' ? 1 : face === 'SE' ? 1 : 0;
    const mir = castWho === 1 ? -1 : 1;
    castAt = { S: [ox + rs * 6 * mir, by - 22], SE: [ox + 12, by - 21], E: [ox + 13, by - 27], NE: [ox + 11, by - 35], N: [ox + rs * 10 * mir, by - 37] }[face];
    castAt = [Math.round(castAt[0]), Math.round(castAt[1] + bob)];
  }
  // the far arm and leg first, then the body, then what's near
  const farArm = side || turn ? 1 : -1;
  if (farArm >= 0 && castWho !== farArm) arm(farArm, null);
  if (side || turn) { leg(1); leg(0); } else { leg(0); leg(1); }
  // the pack on his back: from the side it stands out behind him, from
  // behind it's a dark block between the shoulders, lidded in plate
  const PACK = [SUIT[0], SUIT[1], SUIT[2], SUIT[3], Pl[1]];
  if (side) { s.box(ox - 10, by - 34 + bob, ox - 5, by - 22 + bob, PACK, { lo: 0, hi: 3 }); for (let y = by - 33 + bob; y <= by - 24 + bob; y++) s.px(ox - 10, y, PACK[y < by - 30 + bob ? 4 : 2]); }
  // hips and belt, with its buckle
  s.ell(ox, by - 21 + bob, torsoRx - 1.4, 3.4, SUIT, { lo: 0, hi: 2 });
  for (let x = Math.round(ox - torsoRx + 2); x <= Math.round(ox + torsoRx - 2); x++) s.px(x, by - 22 + bob, x < ox - 2 ? Pl[1] : Pl[0]);
  if (!back) { const bx = ox + (side ? 3 : turn ? rs : 0); s.px(bx, by - 22 + bob, A[2], true); s.px(bx + 1, by - 22 + bob, A[1], true); }
  // the torso and its plate
  s.ell(ox, by - 27 + bob, torsoRx, 6.4, SUIT, { lo: 0, hi: 3 });
  if (back) s.ell(ox - 0.5, by - 30 + bob, torsoRx - 1, 3.6, Pl, { lo: 0, hi: 2, bias: 0 });
  else s.ell(ox + (side ? 0.5 : -1), by - 28.5 + bob, torsoRx - (side ? 1.4 : 0.6), 5.4, Pl, { lo: 1, hi: 4, bias: 0.2 });
  // the pauldrons: the near one, or the one on the left, lit
  if (side) s.ell(ox, by - 31 + bob, 5.4, 3.8, Pl, { lo: 1, hi: 4, bias: 0.3 });
  else for (const who of [1, 0]) {
    const x = shoulder[who], lit = turn ? near(who) : x < ox;
    s.ell(x, by - 31 + bob, turn && !near(who) ? 3.6 : 4.6, 3.4, Pl, { lo: lit ? 1 : 0, hi: back ? (lit ? 3 : 2) : lit ? 4 : 3, bias: back ? (lit ? 0.1 : 0) : lit ? 0.3 : 0.1 });
  }
  if (!back) {
    // the chest's V of circuits down to the seed-star
    const cx = ox + (side ? 3 : turn ? 1 : 0), cy = by - 25 + bob;
    const ends = side ? [[ox - 2, by - 32 + bob], [ox + 5, by - 31 + bob]] : [[ox - (turn ? 7 : 8), by - 33 + bob], [ox + (turn ? 6 : 8), by - 33 + bob]];
    for (const [ex, ey] of ends) for (let i = 0; i <= 8; i++) s.px(Math.round(ex + ((cx - ex) * i) / 8), Math.round(ey + ((cy - ey) * i) / 8), A[ex < cx ? 2 : 1], true);
    for (const [dx, dy, c] of [[0, 0, DIVER_PAL.starHeart[0]], [-1, 0, DIVER_PAL.star[0]], [1, 0, DIVER_PAL.star[0]], [0, -1, DIVER_PAL.star[0]], [0, 1, DIVER_PAL.star[0]], [-2, 0, A[2]], [2, 0, A[2]], [0, 2, A[1]]]) s.px(cx + dx, cy + dy, c, true);
  } else {
    // the pack's air port between the shoulders, a seam down the spine
    const px = ox + (face === 'NE' ? -1 : 0);
    s.box(px - 5, by - 33 + bob, px + 5, by - 22 + bob, PACK, { lo: 0, hi: 2 });
    for (let x = px - 4; x <= px + 4; x++) s.px(x, by - 33 + bob, x < px ? Pl[2] : Pl[1]);
    s.ell(px, by - 29 + bob, 2.6, 2.2, Pl, { lo: 0, hi: 2 });
    s.px(px, by - 29 + bob, A[2], true); s.px(px - 1, by - 29 + bob, A[1], true);
    for (let y = by - 26 + bob; y <= by - 23 + bob; y++) s.px(px, y, A[0]);
  }
  // the near arm(s)
  for (const who of [0, 1]) if (who !== farArm) arm(who, castWho === who ? castAt : null);
  if (castWho === farArm && farArm >= 0) arm(farArm, castAt);

  // the helm: a chin guard, the dome lit on its upper left
  s.ell(hx + (side ? 1 : 0), hy + 5.6, side ? 5 : 6, 2.2, Pl, { lo: 0, hi: 2 });
  s.ell(hx, hy, 7.6, 7.2, Pl, { lo: 0, hi: back ? 3 : 4, bias: back ? -0.05 : 0.25 });
  let lamp;
  if (!back) {
    // the pane: a rounded black window, to the side the helm turns
    const pcx = hx + (side ? 3.8 : turn ? 1.8 : 0), prx = side ? 3.6 : turn ? 5 : 5.8, pry = 4.2, pcy = hy + 1.4;
    for (let y = Math.floor(pcy - pry); y <= Math.ceil(pcy + pry); y++) for (let x = Math.floor(pcx - prx - 1); x <= Math.ceil(pcx + prx + 1); x++) {
      const u = (x + 0.5 - pcx) / prx, v = (y + 0.5 - pcy) / pry, d = u * u + v * v;
      if (d <= 1) s.px(x, y, d < 0.7 ? P.pane[0] : d < 0.9 ? P.pane[1] : Pl[1]);
    }
    // one glint on the glass, upper left
    const gx = Math.round(pcx - prx * 0.62), gy = Math.round(pcy - pry * 0.45);
    s.px(gx, gy, P.glint); s.px(gx + 1, gy, '#5f8cf0'); s.px(gx, gy + 1, Pl[3]);
    // the brow lamp over the pane
    const lx = Math.round(pcx - 0.5), ly = Math.round(pcy - pry - 1.6);
    s.px(lx, ly, DIVER_PAL.lamp[0], true); s.px(lx + 1, ly, DIVER_PAL.lamp[0], true); s.px(lx - 1, ly, A[3], true); s.px(lx + 2, ly, A[2], true); s.px(lx, ly - 1, A[3], true);
    lamp = { x: lx + 1, y: ly + 0.5 };
  } else {
    // a ridge down the back of the helm, lit
    const rx = Math.round(hx + (face === 'NE' ? -1 : 0));
    for (let y = Math.round(hy - 6); y <= Math.round(hy + 4); y++) { s.px(rx, y, Pl[y < hy - 3 ? 3 : 2]); s.px(rx + 1, y, Pl[0]); }
    // (the lamp's glow just shows past the brow, turned away)
    if (face === 'NE') s.px(Math.round(hx + 6), Math.round(hy - 5), A[2], true);
    lamp = { x: hx + (face === 'NE' ? 4 : 0.5), y: hy - 5.5 };
  }
  // a highlight on the dome's crown
  for (const [dx, dy] of back ? [[-3, -5], [-4, -4]] : [[-2, -6], [-1, -6], [0, -6], [-3, -5], [-4, -4]]) s.px(Math.round(hx + dx), Math.round(hy + dy), Pl[back ? 3 : 4]);

  // the main hand (his right), resting
  const out = { spr: s, hand: { x: shoulder[0] + (side ? swing * 2 : rs * 2), y: by - 17 + bob - Math.abs(swing) }, lamp };
  if (cast) {
    out.castHand = { x: castAt[0], y: castAt[1] };
    const other = castWho === 0 ? 1 : 0;
    out.restHand = side ? null : { x: shoulder[other] + (other === 0 ? rs * 2 : -rs * 2), y: by - 17 + bob };
    out.restBehind = !(face === 'S' || face === 'SE');
  }
  return out;
}

// Every frame, as render.js wants them: diver[facing][frame] and
// cast[facing][main, off][frame], for the eight facings clockwise from
// east (facings: the drawn five's names; mirrored: those flipped).
function buildKindlerSprites(facings, mirrored) {
  const mk = (r) => {
    const sp = r.spr.done();
    sp.ax = KINDLER_W / 2; sp.ay = KINDLER_FEET;
    sp.hand = r.hand; sp.lamp = r.lamp;
    if (r.castHand) { sp.castHand = r.castHand; sp.restHand = r.restHand; sp.restBehind = r.restBehind; }
    sp.flash = tinted(sp.c, '#ffffff');
    return sp;
  };
  const flipS = (s) => {
    const f = flippedSprite(s), w = s.w;
    f.flash = flipped(s.flash);
    f.hand = { x: w - 1 - s.hand.x, y: s.hand.y }; f.lamp = { x: w - s.lamp.x, y: s.lamp.y };
    if (s.castHand) { f.castHand = { x: w - 1 - s.castHand.x, y: s.castHand.y }; f.restHand = s.restHand && { x: w - 1 - s.restHand.x, y: s.restHand.y }; }
    return f;
  };
  const cache = new Map(), get = (face, k, cast) => {
    const key = face + k + cast;
    if (!cache.has(key)) cache.set(key, mk(kindlerFrame(face, k, cast)));
    return cache.get(key);
  };
  const diver = facings.map((face, i) => [0, 1, 2, 3, 4].map((k) => (mirrored[i] ? flipS(get(face, k, null)) : get(face, k, null))));
  const cast = facings.map((face, i) => ['main', 'off'].map((slot) => [0, 1, 2, 3, 4].map((k) => {
    // (from the side either hand's pose is the same one)
    const s = get(face, k, face === 'S' || face === 'N' ? slot : 'main');
    const o = mirrored[i] ? flipS(s) : Object.assign({}, s);
    o.hand = diver[i][k].hand;
    return o;
  })));
  return { diver, cast };
}

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
