'use strict';
// ---------------------------------------------------------------------------
// The outpost, painted (docs/PAINTED.md): the Charter's modules (the
// fabricator, the rune bench, the locker, the star's altar, the uplink,
// the portal's gate), the star and its cradle, starstone, the light masts,
// the habitat pods and landers, the settlers and the smith, and what's
// stacked by the modules; and the ancient forges out in the land. Each is
// built once with the sprite painter (PntSpr) and hartStrokes, short
// horizontal strokes of a few close tones lit from the upper left, with no
// outline; only lamps, runes, the forge's crucible, starstone and the star
// glow. hub.js and story.js place and draw them. Every helper here is named
// hart…; numbers are in T.paint.hub.
// ---------------------------------------------------------------------------

// Materials, dark to light.
const HART = {
  iron: ['#07080c', '#0e1118', '#181c26', '#252b38', '#38404f', '#566074'],
  stone: ['#0c0d11', '#15171d', '#1f222a', '#2c3039', '#3d424d', '#565c68'],
  slate: ['#08090c', '#0e1015', '#15181e', '#1d2129', '#282d37'],
  wood: ['#110b07', '#1c130c', '#2a1c12', '#3a2819', '#4e3622', '#664830'],
  canvas: ['#191511', '#26201a', '#352d24', '#463c30', '#5a4e3e', '#71644f'],
  brick: ['#160b09', '#26110d', '#3a1912', '#522318', '#6c3020', '#8a412a'],
  fire: ['#4a1006', '#902a0a', '#d85c18', '#ff9a34', '#ffd27a', '#fff6dc'],
  star: ['#3a1e08', '#6a3a12', '#a0601e', '#d08c30', '#eeb24a', '#ffd987', '#fff4d6'],
  skin: ['#2e1b14', '#4a2c20', '#6a4430', '#8a5e44', '#a87a5c'],
  crimson: ['#1e0a0e', '#3e1016', '#6a161e', '#9c2228', '#c0383a'],
  teal: '#7dffd8',
  // the Charter's modules: polished steel, gunmetal, the Charter's blue
  // panels, its amber lights and the seed-star's pale gold; and the ancient
  // forges' weathered plates, their rust and verdigris, and their cold glow
  steel: ['#1a1e26', '#2c323e', '#454d5c', '#647084', '#8e9aae', '#b4c0d0'],
  hull: ['#08090d', '#10131a', '#1a1e27', '#262c37', '#363e4c', '#4c5666', '#6a7688'],
  charter: ['#0a0f1e', '#111a32', '#18264a', '#203464', '#2b467e', '#3a5c9a', '#5078b4'],
  amber: ['#8a4a16', '#d88c30', '#ffb030', '#ffe48a'],
  mark: ['#6a5a34', '#b8a46a', '#e2d29c', '#fff4d0'],
  old: ['#0a0b0b', '#131615', '#1c211f', '#28302d', '#37413d', '#4b5751', '#64716a'],
  rust: ['#1c0e08', '#33190d', '#4d2a14', '#6a3c1e', '#8a5430'],
  verd: ['#0f1f1c', '#18332e', '#244a42', '#356659', '#4c8573'],
  cold: ['#062022', '#0e3e40', '#1f6e6c', '#48aaa2', '#8fe0d4', '#d4fff6'],
};

// A region laid in short horizontal strokes: for each row, strokes of 2 to
// 6 px (mostly short) at hashed places; each takes its tone from val at its
// middle (0..1, or null: not painted) plus a little jitter, on ramp. o: { glow,
// jit (default 0.18), lo, hi (the ramp's ends used) }.
function hartStrokes(s, x0, y0, x1, y1, val, ramp, seed, o = {}) {
  const lo = o.lo || 0, hi = o.hi === undefined ? ramp.length - 1 : o.hi, J = o.jit === undefined ? 0.18 : o.jit;
  for (let y = y0; y <= y1; y++) {
    let x = x0;
    while (x <= x1) {
      const h = artHash(x, y, seed), h2 = artHash(x, y, seed + 1);
      const len = 2 + Math.floor(h * h * 5), xm = Math.min(x1, x + (len >> 1));
      let v = val(xm, y);
      if (v === null || v === undefined) v = val(x, y);
      if (v === null || v === undefined) { x++; continue; }
      const t = lo + (hi - lo) * clamp(v + (h2 - 0.5) * 2 * J, 0, 1), col = ramp[clamp(Math.round(t), lo, hi)];
      for (let k = 0; k < len && x <= x1; k++, x++) if (val(x, y) !== null && val(x, y) !== undefined) s.px(x, y, col, o.glow);
    }
  }
}

// A sprite made once and kept (key), with its feet at ax, ay.
const _hartKept = new Map();
function hartKeep(key, make) {
  let s = _hartKept.get(key);
  if (!s) { s = artFine(make()); _hartKept.set(key, s); }
  return s;
}
function hartDone(s, ax, ay, extra) {
  const o = s.done();
  o.ax = ax; o.ay = ay;
  return Object.assign(o, extra || {});
}

// ---------------------------------------------------------------------------
// The fabricator: the Charter's forge module, set down with the seed. A
// clean block on a plinth, seen from above and in front: a gunmetal top
// with a hatch, a vent stack at its back, and a face of three panels (the
// Charter's blue either side, its seed-star on the left, the status lights
// on the right), an amber trim light under its lip, and in the middle a
// round glass port with the induction crucible glowing behind it (drawn
// over each frame, hartForgeFire, its middle at HART_MOUTH). Coolant pipes
// run out of its foot. To its left a hydraulic press on a C-frame over a
// forging bed; its ram is drawn on its own (hartPressRam), the bed's face at
// HART_ANVIL. Feet on row 61.
// ---------------------------------------------------------------------------
const HART_MOUTH = { x: 42, y: 44, r: 7.3 }; // the port's middle, and the glass's radius
// (the hand points above are in authored px; a sprite enlarged for FINE
// GRAIN (artFine, spr.f) has them this much further in)
function hartPt(spr, pt) { const F = (spr && spr.f) || 1; return { x: pt.x * F, y: pt.y * F }; }
const HART_ANVIL = { x: 9, y: 42 }; // the work on the bed, where the ram lands
const HART_RAM = { x: 3, y: 28, travel: 9 }; // where the ram hangs, raised, and how far it comes down
const HART_LEDS = [[55, 39, '#6cff9a'], [57, 39, '#ffb030'], [55, 41, '#62f0ff']]; // the status lights (the first blinks)
const HART_STACK = { x: 34, y: 8 }; // the vent stack's mouth
// A line of pixels from a to b.
function hartLine(s, a, b, col, glow) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]))));
  for (let i = 0; i <= n; i++) s.px(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n, typeof col === 'function' ? col(i / n) : col, glow);
}
// A hose or pipe along a curve (a to b, bent towards c), w px thick, lit
// along its upper edge.
function hartHose(s, a, c, b, w, ramp, lo = 0) {
  const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2);
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t, x = u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], y = u * u * a[1] + 2 * u * t * c[1] + t * t * b[1];
    for (let k = 0; k < w; k++) s.px(x, y + k, ramp[clamp(lo + (k === 0 ? 2 : k === w - 1 ? 0 : 1), 0, ramp.length - 1)]);
  }
}
// The Charter's seed-star, small: eight points round a bright heart (cx,
// cy its middle; big: the long points two px longer).
function hartSeedStar(s, cx, cy, big, glow) {
  const P = HART.mark, L = big ? 3 : 2;
  for (let k = 1; k <= L; k++) for (const [i, j] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) s.px(cx + i * k, cy + j * k, P[k === L ? 1 : 2], glow);
  for (const [i, j] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) s.px(cx + i, cy + j, P[1], glow);
  s.px(cx, cy, P[3], glow);
}
// A box seen from above and in front: its top (y0 to y1, narrowing
// `back` px each side at its back), its face (y1 to y2), lit from the left;
// ramp a gunmetal or a panel's. Its top's front edge lit, its face's foot
// dark.
function hartBlock(s, x0, x1, y0, y1, y2, ramp, seed, back = 2) {
  const n = ramp.length - 1;
  hartStrokes(s, x0, y0, x1, y1 - 1, (x, y) => { const b = back * (y1 - y) / Math.max(1, y1 - y0); return x < x0 + b || x > x1 - b ? null : 0.72 - (x - x0) / (x1 - x0) * 0.22 - (y1 - y) * 0.01; }, ramp, seed, { jit: 0.1 });
  hartStrokes(s, x0, y1, x1, y2, (x, y) => 0.5 - (x - x0) / (x1 - x0) * 0.3 - (y - y1) * 0.004, ramp, seed + 1, { jit: 0.1 });
  for (let x = x0; x <= x1; x++) { s.px(x, y1, ramp[x < (x0 + x1) / 2 ? n : n - 1]); s.px(x, y2, ramp[0]); }
  for (let y = y1 + 1; y < y2; y++) { s.px(x0, y, ramp[n - 1]); s.px(x1, y, ramp[1]); }
}
function hartForge() {
  return hartKeep('forge', () => {
    const W = 68, H = 64, FY = 61, s = new PntSpr(W, H, 501), Hu = HART.hull, CB = HART.charter, M = HART_MOUTH, St = HART.steel, Am = HART.amber;
    const xl = 24, xr = 62, top = 23, lip = 31, foot = 55;
    // the press: a column at the back of the bed, an arm over it, the
    // cylinder hanging from the arm's end (its ram is drawn over)
    hartStrokes(s, 15, 12, 19, 44, (x, y) => 0.5 - (x - 15) * 0.09 - (y - 12) * 0.003, Hu, 502, { jit: 0.12 });
    for (let y = 12; y <= 44; y++) s.px(15, y, Hu[y < 30 ? 6 : 5]);
    s.poly([[15, 16], [15, 23], [10.5, 16]], (x, y) => Hu[x < 13 ? 3 : 2]);
    hartStrokes(s, 2, 9, 19, 10, (x) => 0.82 - x * 0.012, Hu, 503);
    hartStrokes(s, 2, 11, 19, 15, (x, y) => 0.4 - (x - 2) * 0.008 - (y - 11) * 0.03, CB, 504, { jit: 0.12 });
    for (let x = 2; x <= 19; x++) { s.px(x, 9, x < 9 ? Hu[6] : Hu[5]); s.px(x, 16, Hu[1]); }
    for (let x = 4; x <= 13; x += 3) s.px(x, 13, Am[1]);
    hartStrokes(s, 4, 17, 13, 26, (x) => 0.85 - Math.abs(x - 6) * 0.1, St, 505, { jit: 0.1 });
    for (let x = 4; x <= 13; x++) { s.px(x, 19, St[1]); s.px(x, 20, x < 8 ? St[5] : St[3]); s.px(x, 24, St[1]); }
    hartStrokes(s, 6, 27, 11, 27, (x) => 0.6 - (x - 6) * 0.08, Hu, 506);
    // its hydraulic line, looping up off the arm and down to the body
    hartHose(s, [6, 8], [18, -6], [27, 27], 2, ['#0b0c10', '#14161c', '#2c313b']);
    // the vent stack at the back: a square tower, louvred, a cap
    hartStrokes(s, 30, 9, 37, 24, (x, y) => 0.7 - (x - 30) * 0.08, Hu, 508, { jit: 0.1 });
    for (let y = 10; y <= 24; y++) { s.px(30, y, Hu[6]); s.px(37, y, Hu[1]); }
    for (let y = 13; y <= 21; y += 2) for (let x = 31; x <= 36; x++) s.px(x, y, Hu[x < 33 ? 2 : 1]);
    s.box(29, 7, 38, 9, Hu, { lo: 2, hi: 6 });
    for (let x = 31; x <= 36; x++) s.px(x, 8, '#050506');
    s.px(34, 8, HART.fire[1], true);
    // the body: its top (a hatch, a fitting) and its face
    hartBlock(s, xl, xr, top, lip, foot - 1, Hu, 507, 3);
    s.box(45, 25, 55, 28, Hu, { lo: 1, hi: 5 });
    for (let x = 46; x <= 54; x++) s.px(x, 25, Hu[6]);
    s.px(50, 26, Am[2], true);
    s.box(27, 25, 31, 28, Hu, { lo: 2, hi: 5 });
    // the face's panels: the Charter's blue either side of the port's
    // gunmetal, their seams dark, their tops lit
    const panel = (x0, x1, ramp, sd) => {
      hartStrokes(s, x0, lip + 2, x1, foot - 2, (x, y) => 0.62 - (x - xl) / (xr - xl) * 0.36 - (y - lip) * 0.006, ramp, sd, { jit: 0.12 });
      for (let x = x0; x <= x1; x++) { s.px(x, lip + 2, ramp[ramp.length - 1]); s.px(x, foot - 2, ramp[1]); }
      for (let y = lip + 2; y <= foot - 2; y++) { s.px(x0, y, ramp[ramp.length - 2]); s.px(x1, y, ramp[0]); }
    };
    panel(xl + 1, 31, CB, 511); panel(53, xr - 1, CB, 512);
    for (let y = lip + 2; y <= foot - 2; y++) { s.px(32, y, Hu[0]); s.px(52, y, Hu[0]); }
    // the trim light under the lip, in short lit lengths
    for (let x = xl + 1; x <= xr - 1; x++) s.px(x, lip + 1, x % 7 < 5 ? Am[(x < 43 ? 3 : 2)] : Hu[1], x % 7 < 5);
    // the seed-star on the left panel, a stencilled stripe under it
    hartSeedStar(s, 28, 38, true);
    for (let x = 26; x <= 30; x++) s.px(x, 46, HART.mark[0]);
    for (let x = 26; x <= 30; x++) s.px(x, 48, HART.mark[0]);
    // the port: a raised bezel lit on its upper left, round dark glass
    for (let y = M.y - 10; y <= M.y + 10; y++) for (let x = M.x - 10; x <= M.x + 10; x++) {
      const dx = x - M.x, dy = y - M.y, r = Math.hypot(dx, dy);
      if (r <= M.r) s.px(x, y, '#0c0503');
      else if (r <= 8.2) s.px(x, y, -(dx * 0.55 + dy * 0.8) / r > 0.2 ? Hu[0] : Hu[2]);
      else if (r <= 9.9) { const l = -(dx * 0.55 + dy * 0.8) / r; s.px(x, y, Hu[clamp(Math.round(3.6 + l * 2.6 + (artHash(x, y, 512) - 0.5) * 0.6), 1, 6)]); }
    }
    for (let k = 0; k < 4; k++) { const a = (k + 0.5) / 4 * Math.PI * 2, bx = M.x + Math.cos(a) * 9, by = M.y + Math.sin(a) * 9; s.px(bx, by, Math.cos(a) * 0.55 + Math.sin(a) * 0.8 < 0 ? Hu[6] : Hu[4]); }
    // the status panel on the right (its lights are drawn glowing)
    for (let y = 37; y <= 45; y++) for (let x = 54; x <= 58; x++) s.px(x, y, y === 37 || x === 54 ? Hu[1] : '#07080b');
    for (let x = 54; x <= 58; x++) s.px(x, 46, CB[5]);
    for (const [x, y, c] of HART_LEDS) s.px(x, y, c, true);
    s.px(57, 41, '#3a1010');
    for (let x = 55; x <= 57; x++) s.px(x, 43, x < 57 ? '#1e6a70' : '#0e3a40', true);
    // the plinth: a clean gunmetal step, an amber line along its top
    hartStrokes(s, xl - 2, foot, xr + 2, FY, (x, y) => (y === foot ? 0.9 : 0.34 - (x - xl) * 0.004 - (y - foot) * 0.02), Hu, 514, { jit: 0.1 });
    for (let x = xl - 2; x <= xr + 2; x++) { s.px(x, foot + 1, x % 4 ? Am[1] : Am[0]); s.px(x, FY, Hu[0]); }
    for (let y = foot; y < FY; y++) { s.px(xl - 2, y, Hu[5]); s.px(xr + 2, y, Hu[1]); }
    // coolant pipes out of the plinth on the right, along the ground
    const CP = ['#090d12', '#142028', '#2c4250'];
    hartHose(s, [62, 57], [64, 59.5], [67, 59], 2, CP);
    hartHose(s, [60, 58], [61, 61], [67, 61], 2, CP);
    // the bed, in front of the column: a block seen from above and in
    // front, a die on its top, hazard chevrons along its foot
    hartStrokes(s, 1, 41, 17, 45, (x, y) => 0.8 - x * 0.012 - (y - 41) * 0.03, Hu, 515, { jit: 0.12 });
    for (let x = 4; x <= 14; x++) { s.px(x, 43, x < 8 ? Hu[3] : Hu[2]); s.px(x, 44, Hu[1]); }
    hartStrokes(s, 1, 46, 17, 60, (x, y) => 0.36 - (x - 1) * 0.012 - (y - 46) * 0.008, Hu, 516, { jit: 0.12 });
    for (let x = 1; x <= 17; x++) { s.px(x, 46, x < 8 ? Hu[6] : Hu[5]); s.px(x, 41, Hu[4]); s.px(x, 61, Hu[0]); }
    for (let y = 46; y <= 60; y++) s.px(1, y, Hu[4]);
    for (let y = 56; y <= 58; y++) for (let x = 2; x <= 16; x++) s.px(x, y, ((x + y) >> 1) % 2 ? (x < 8 ? Am[1] : Am[0]) : '#1c1408');
    for (const x of [3, 15]) s.px(x, 50, Hu[5]);
    return hartDone(s, M.x, FY, { stone: [[xl - 2, FY, -1], [xr + 3, FY, 1], [xr - 2, lip - 1, 1], [1, FY, -1], [xl + 6, lip - 1, -1]] });
  });
}
// The press's ram, e px down (0, raised, to HART_RAM.travel, on the work):
// a polished rod out of the cylinder, a die block at its foot.
function hartPressRam(e) {
  return hartKeep('ram' + e, () => {
    const s = new PntSpr(12, HART_RAM.travel + 6, 520), St = HART.steel;
    for (let y = 0; y <= e; y++) { s.px(5, y, St[5]); s.px(6, y, St[2]); }
    const y0 = e + 1;
    for (let x = 0; x <= 11; x++) s.px(x, y0, x < 6 ? St[5] : St[4]);
    hartStrokes(s, 0, y0 + 1, 11, y0 + 3, (x, y) => 0.6 - x * 0.04 - (y - y0) * 0.06, St, 521, { jit: 0.1 });
    for (let x = 0; x <= 11; x++) s.px(x, y0 + 4, St[0]);
    for (let y = y0 + 1; y <= y0 + 3; y++) s.px(0, y, St[5]);
    return hartDone(s, 0, 0);
  });
}
// The crucible behind the port, three frames: we look through the glass
// into the chamber, its heat haze shimmering over the crucible, the melt
// white-hot in its mouth, the coil's turns glowing round it, a glint on the
// glass. All of it glows but the glint.
function hartForgeFire(frame) {
  return hartKeep('fire' + frame, () => {
    const R = HART_MOUTH.r, c = 7, W = 15, s = new PntSpr(W, W, 540 + frame), F = HART.fire;
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const dx = x - c, dy = y - c;
      if (dx * dx + dy * dy > R * R) continue;
      const h = artHash(x >> 1, y, 541 + frame), half = 4.6 - (y - 6) * 0.18;
      let col, glow = true;
      if (y >= 6 && Math.abs(dx) <= half) {
        // the crucible: its melt in the mouth, its walls glowing
        if (y <= 7) col = Math.abs(dx) < 2.5 + (frame === 1 ? 0.6 : 0) || h < 0.3 ? F[5] : F[4];
        else col = Math.abs(dx) > half - 1.2 ? F[2] : y > 11 ? F[2] : h < 0.5 ? F[3] : F[2];
        if (y <= 7 && artHash(x, frame, 542) < 0.12) col = F[3];
      } else if (y >= 6) {
        // the coil's turns round it, and the dark between
        col = (y + (dx < 0 ? 0 : 1)) % 3 === 0 ? (h < 0.5 ? F[2] : F[1]) : '#1a0805';
        glow = col !== '#1a0805';
      } else {
        // heat haze over it, rising and shimmering
        const v = (y / 6) * 0.9 + Math.sin(x * 1.4 + frame * 2.1 - y * 0.7) * 0.2 + (h - 0.5) * 0.25;
        col = v < 0.25 ? '#2a0c06' : v < 0.55 ? F[0] : v < 0.85 ? F[1] : F[2];
      }
      s.px(x, y, col, glow);
    }
    // the glass: a glint on its upper left, its lower right edge darker
    s.px(3, 3, '#fff6dc'); s.px(4, 2, '#d8e2ec'); s.px(2, 5, '#a8b4c0');
    for (let a = 0.05; a < 0.45; a += 0.04) s.px(Math.round(c + Math.cos(a * Math.PI * 2) * (R - 0.6)), Math.round(c + Math.sin(a * Math.PI * 2) * (R - 0.6)), '#2a0c06');
    return hartDone(s, c, c);
  });
}
// A forge's light on the ground in front: loose strokes of its colour,
// thicker nearer the port, two frames (cool: the ancient forges' pale teal).
function hartForgeSpill(frame, cool) {
  return hartKeep('spill' + frame + (cool ? 'c' : ''), () => {
    const W = 70, H = 26, s = new PntSpr(W, H, 560 + frame), cols = cool ? ['#0c2628', '#123a3a', '#1c5452', '#2a706a'] : ['#5a1c0c', '#7a2c14', '#a8441c', '#c86428'];
    for (let n = 0; n < 170; n++) {
      const x = Math.floor(artHash(n, 1, 561 + frame) * (W - 5)), y = Math.floor(artHash(n, 2, 561 + frame) * H);
      const d = Math.hypot((x + 2 - 35) / 35, (y + 1) / H);
      if (d >= 1 || artHash(n, 3, 561 + frame) > (1 - d) ** 1.8 * 0.9) continue;
      const len = 2 + Math.floor(artHash(n, 4, 562) * 4), c = cols[clamp(Math.round((1 - d) * 3 + (artHash(n, 5, 563) - 0.5)), 0, 3)];
      for (let k = 0; k < len; k++) s.px(x + k, y, c);
    }
    return hartDone(s, 35, 0);
  });
}

// ---------------------------------------------------------------------------
// An ancient forge, out in the land: left by the Kindlers before, an older,
// heavier make of the same foundry. A squat block of thick plates on a
// plinth, rust run down from its bolts and verdigris on its top, its stack
// sheared off, a great bolted port whose glass is cracked, the crucible
// behind it still glowing, pale and cold (hartOldForgeGlow, its middle at
// HART_OLD.port). A worn bed at its left by the stump of its press. Dust
// of the ground it stands on is heaped round its foot, so it's painted for
// each look (pntLook's ground ramp), and kept.
// ---------------------------------------------------------------------------
const HART_OLD = { port: { x: 35, y: 33, r: 7.3 }, led: { x: 21, y: 28 }, foot: 54 };
const _hartOldKept = new WeakMap();
function hartOldForge(look) {
  let spr = _hartOldKept.get(look);
  if (spr) return spr;
  const W = 62, H = 58, FY = HART_OLD.foot, s = new PntSpr(W, H, 1601), O = HART.old, Ru = HART.rust, V = HART.verd, P = HART_OLD.port;
  const G = look.groundRgb.map((c) => rgbToHex(c[0], c[1], c[2])), moss = G.map((c) => mix(c, '#5a6a2c', 0.4));
  const rusty = (x, y, seed) => artHash(x, Math.floor(y / 3), seed) < 0.16 && artHash(x >> 2, y >> 3, seed + 1) < 0.5;
  // the stack, sheared off at a slant, at the back on the right
  const st0 = 41, st1 = 49, stTop = (x) => 4 + Math.round((x - st0) * 0.6 + (artHash(x, 0, 1602) < 0.4 ? 1 : 0));
  hartStrokes(s, st0, 3, st1, 15, (x, y) => (y < stTop(x) ? null : 0.62 - (x - st0) * 0.07), O, 1603, { jit: 0.12 });
  for (let x = st0; x <= st1; x++) { const y = stTop(x); s.px(x, y, x < st0 + 4 ? O[6] : O[5]); s.px(x, y + 1, '#060707'); if (x > st0 + 1 && x < st1 - 1) s.px(x, y + 2, '#060707'); }
  for (let y = 5; y <= 15; y++) { s.px(st0, y, O[5]); if (rusty(st0 + 3, y, 1604)) s.px(st0 + 3, y, Ru[2]); }
  for (let x = st0; x <= st1; x++) { s.px(x, 9, O[1]); s.px(x, 10, x < st0 + 3 ? O[5] : O[3]); }
  // the top, from above: a broad slab, its front edge chamfered and lit;
  // verdigris and drifted dust on it
  const T0 = 11, T1 = 57, top0 = 14, top1 = 19;
  hartStrokes(s, T0 + 2, top0, T1 - 2, top1, (x, y) => ((x === T0 + 2 || x === T1 - 2) && y === top0 ? null : 0.6 - (x - T0) * 0.008 - (y - top0) * 0.02), O, 1605, { jit: 0.14 });
  for (let x = T0 + 3; x <= T1 - 3; x++) s.px(x, top0, x < 30 ? O[6] : O[5]);
  for (let x = st0; x <= st1; x++) s.px(x, 16, O[1]);
  hartStrokes(s, T0, top1 + 1, T1, top1 + 3, (x, y) => (y === top1 + 1 ? 0.92 : 0.7) - (x - T0) * 0.008, O, 1606, { jit: 0.1 });
  for (let n = 0; n < 14; n++) {
    const x = T0 + 3 + Math.floor(artHash(n, 1, 1607) * (T1 - T0 - 6)), y = top0 + 1 + Math.floor(artHash(n, 2, 1607) * 5), len = 2 + Math.floor(artHash(n, 3, 1607) * 4), c = n % 3 ? V[2 + (n % 2)] : V[1];
    for (let k = 0; k < len; k++) if (s.get(x + k, y)) s.px(x + k, y, c);
  }
  for (let n = 0; n < 10; n++) {
    const x = T0 + 2 + Math.floor(artHash(n, 4, 1608) * 14), y = top0 + 1 + Math.floor(artHash(n, 5, 1608) * 5), len = 2 + Math.floor(artHash(n, 6, 1608) * 4);
    for (let k = 0; k < len; k++) if (s.get(x + k, y)) s.px(x + k, y, n % 3 ? G[4] : moss[3]);
  }
  // the face: two great plates over a plinth, the joint riveted, rust run
  // down from the rivets
  const F0 = 23, F1 = 47;
  hartStrokes(s, T0, F0, T1, F1, (x, y) => 0.5 - (x - T0) * 0.007 - (y - F0) * 0.006 + (x > 34 ? -0.05 : 0.04) + (rusty(x, y, 1609) ? -0.2 : 0), O, 1610, { jit: 0.13 });
  for (let y = F0; y <= F1; y++) { s.px(T0, y, O[5]); s.px(T1, y, O[1]); }
  for (let x = T0; x <= T1; x++) { s.px(x, F0 - 1, O[1]); s.px(x, 39, O[1]); if (x % 4 === 2) s.px(x, 40, x < 34 ? O[5] : O[4]); }
  for (let y = F0; y <= 39; y++) { s.px(T0 + 3, y, O[1]); s.px(T1 - 4, y, O[1]); if (y % 4 === 1) { s.px(T0 + 4, y, O[5]); s.px(T1 - 3, y, O[4]); } }
  for (let n = 0; n < 6; n++) {
    const x = T0 + 2 + Math.floor(artHash(n, 7, 1611) * (T1 - T0 - 4)), y0 = n % 2 ? 40 : F0 + 1, len = 3 + Math.floor(artHash(n, 8, 1611) * 6);
    if (Math.abs(x - P.x) < 12 && y0 < 44) continue;
    for (let k = 0; k < len; k++) if (artHash(x, k, 1626) < 0.8) s.px(x, y0 + k, k < 1 ? Ru[3] : Ru[k > len - 3 ? 1 : 2]);
  }
  // a faded seed-star painted beside the port by whoever came before
  for (const [i, j] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-2, 0], [2, 0], [0, -2], [0, 2]]) if (artHash(i, j, 1612) < 0.72) s.px(50 + i, 31 + j, i || j ? '#4e3e22' : '#6a5630');
  // the status light's housing (the light itself is drawn, dim, blinking)
  s.px(HART_OLD.led.x, HART_OLD.led.y, '#030404'); s.px(HART_OLD.led.x + 2, HART_OLD.led.y, '#2a0c0c'); s.px(HART_OLD.led.x + 1, HART_OLD.led.y - 1, O[5]);
  // the port: a massive bezel, ten bolts, the glass dark under the glow
  for (let y = P.y - 12; y <= P.y + 12; y++) for (let x = P.x - 12; x <= P.x + 12; x++) {
    const dx = x - P.x, dy = y - P.y, r = Math.hypot(dx, dy);
    if (r <= P.r) s.px(x, y, '#030a0a');
    else if (r <= 8.3) s.px(x, y, O[0]);
    else if (r <= 11.2) { const l = -(dx * 0.55 + dy * 0.8) / r; s.px(x, y, rusty(x, y, 1613) ? Ru[2] : O[clamp(Math.round(3 + l * 2.6 + (artHash(x >> 1, y, 1614) - 0.5) * 0.9), 1, 6)]); }
  }
  for (let k = 0; k < 10; k++) { const a = (k + 0.25) / 10 * Math.PI * 2, bx = P.x + Math.cos(a) * 9.8, by = P.y + Math.sin(a) * 9.8, lit = Math.cos(a) * 0.55 + Math.sin(a) * 0.8 < 0; s.px(bx, by, lit ? O[6] : O[4]); if (k % 3 === 1) s.px(bx, by + 1, Ru[3]); }
  // the plinth, wider, its edge lit, dust banked against it
  hartStrokes(s, T0 - 3, 48, T1 + 3, FY, (x, y) => (y === 48 ? 0.85 : 0.42 - (x - T0) * 0.006 - (y - 48) * 0.03 + (rusty(x, y, 1615) ? -0.15 : 0)), O, 1616, { jit: 0.13 });
  for (let x = T0 - 3; x <= T1 + 3; x++) s.px(x, 48, x < 30 ? O[6] : O[5]);
  // the old bed, worn hollow, and the sheared stump of its press
  hartStrokes(s, 4, 26, 8, 38, (x, y) => (y < 26 + (x * 3) % 4 ? null : 0.58 - (x - 4) * 0.1), O, 1617, { jit: 0.1 });
  for (let x = 4; x <= 8; x++) { s.px(x, 26 + (x * 3) % 4, O[6]); if (rusty(x, 30, 1618)) s.px(x, 31, Ru[2]); }
  hartStrokes(s, 1, 37, 15, 40, (x, y) => (x === 1 && y === 37 ? null : 0.66 - x * 0.012 - (y - 37) * 0.03), O, 1619, { jit: 0.12 });
  s.ell(8.5, 38.6, 3.6, 1.1, O, { lo: 0, hi: 2 });
  hartStrokes(s, 1, 41, 15, FY, (x, y) => 0.4 - x * 0.012 - (y - 41) * 0.012 + (rusty(x, y, 1620) ? -0.15 : 0), O, 1621, { jit: 0.13 });
  for (let x = 2; x <= 15; x++) s.px(x, 41, x < 7 ? O[6] : O[5]);
  for (let y = 38; y <= FY; y++) s.px(1, y, O[4]);
  // dust of the ground banked round its foot, lit on the mounds' left,
  // ragged where it melts into the ground; moss here and there
  const bank = (x) => 2.5 + 3.2 * Math.max(0, 1 - Math.abs(x - 8) / 9) + 4 * Math.max(0, 1 - Math.abs(x - 55) / 8) + 1.6 * Math.max(0, 1 - Math.abs(x - 26) / 6) + artHash(x >> 1, 0, 1622) * 1.2;
  for (let x = 0; x < W; x++) {
    const h = bank(x), y0 = Math.round(FY + 2 - h);
    for (let y = y0; y < H; y++) {
      const t = (y - y0) / Math.max(1, H - y0), slope = bank(x - 1) - bank(x + 1), v = 3.6 - t * 1.2 + slope * 0.7 + (y === y0 ? 0.8 : 0) + (artHash(x >> 1, y, 1623) - 0.5) * 1.2;
      if (y === y0 && artHash(x, 1, 1624) < 0.3) continue;
      const end = Math.min(x, W - 1 - x) < 4 ? 0.3 : 0;
      if (y > FY && artHash(x >> 1, y, 1625) < 0.25 + (y - FY) * 0.22 + end) continue;
      s.px(x, y, G[clamp(Math.round(v), 1, 6)]);
    }
  }
  for (const [x, y] of [[3, 51], [14, 52], [52, 49], [57, 50], [27, 53], [44, 53]]) for (let k = 0; k < 3; k++) { s.px(x + k, y, moss[k === 1 ? 4 : 3]); if (k === 1) s.px(x + k, y - 1, moss[2]); }
  spr = hartDone(s, 31, FY);
  _hartOldKept.set(look, spr);
  return spr;
}
// The crucible behind the cracked glass, three frames: a pale, cold glow
// slowly turning, darker veins through it, the cracks catching its light.
function hartOldForgeGlow(frame) {
  return hartKeep('oldglow' + frame, () => {
    const R = HART_OLD.port.r, c = 7, W = 15, s = new PntSpr(W, W, 1650 + frame), C = HART.cold;
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const dx = x - c, dy = y - c, r = Math.hypot(dx, dy);
      if (r > R) continue;
      const a = Math.atan2(dy, dx) + frame * 0.7, swirl = Math.sin(a * 3 + r * 0.9) * 0.5 + 0.5;
      const v = (1 - r / R) * 0.85 + swirl * 0.3 - 0.12 + (artHash(x >> 1, y, 1651 + frame) - 0.5) * 0.2;
      s.px(x, y, v < 0.15 ? '#041416' : C[clamp(Math.round(v * 5), 0, 5)], v >= 0.15);
    }
    // cracks from a blow on its upper right: dark lines, lit along one side
    const cracks = [[[10, 3], [7, 7], [3, 9]], [[10, 3], [12, 8], [11, 12]], [[10, 3], [5, 2]], [[7, 7], [7, 12]]];
    for (const pts of cracks) for (let i = 1; i < pts.length; i++) hartLine(s, pts[i - 1], pts[i], (t) => (artHash(Math.round(t * 9), i, 1655) < 0.25 ? '#e8fffa' : '#06181a'), false);
    for (const pts of cracks) for (let i = 1; i < pts.length; i++) { const [a, b] = [pts[i - 1], pts[i]]; s.px(Math.round((a[0] + b[0]) / 2) - 1, Math.round((a[1] + b[1]) / 2), '#e8fffa', true); }
    s.px(10, 3, '#f4fffc', true);
    s.px(3, 4, '#c8dcdc'); s.px(4, 3, '#a8bcbc');
    return hartDone(s, c, c);
  });
}

// ---------------------------------------------------------------------------
// The tuning bench: a Charter workstation, where modules are upgraded and
// unravelled. A steel bench on a frame, a cabinet of the Charter's blue
// under its right end, and on its top a dark work plate with a lattice
// cradle's ring lit amber in it and readouts either side, modules and a
// core laid out at its ends, and a work lamp on a jointed arm (its light
// at lamp). (Its station keeps the id 'runes', from when it was the rune
// bench.)
// ---------------------------------------------------------------------------
function hartRunes() {
  return hartKeep('runes', () => {
    const W = 46, H = 40, FY = 38, s = new PntSpr(W, H, 601), Hu = HART.hull, CB = HART.charter, S = HART.slate, glow = '#ffb030', gdim = '#8a4a16';
    // the frame's legs, and the cabinet under the right end
    for (const lx of [4, 21]) { hartStrokes(s, lx, 20, lx + 2, FY - 1, (x) => 0.6 - (x - lx) * 0.2, Hu, 602 + lx); s.px(lx - 1, FY, Hu[1]); s.px(lx + 3, FY, Hu[1]); }
    hartBlock(s, 26, 43, 20, 21, FY - 1, CB, 603, 0);
    for (let x = 27; x <= 42; x++) s.px(x, 29, CB[1]);
    for (const x of [33, 36]) { s.px(x, 25, HART.steel[4]); s.px(x, 33, HART.steel[4]); }
    for (let x = 26; x <= 43; x++) s.px(x, FY, Hu[0]);
    for (let x = 4; x <= 24; x++) s.px(x, 31, Hu[2]);
    // the top: a steel slab from above and its front edge, the work plate
    // set into it
    hartBlock(s, 1, 44, 8, 17, 20, Hu, 610, 2);
    hartStrokes(s, 8, 10, 36, 15, (x, y) => 0.3 + (36 - x) * 0.004, S, 611, { jit: 0.1 });
    for (let x = 8; x <= 36; x++) { s.px(x, 9, Hu[1]); s.px(x, 16, Hu[5]); }
    // the cradle's ring in the plate, and readouts either side
    const R = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (let a = 0; a < 16; a++) { const x = Math.round(22 + Math.cos(a / 16 * Math.PI * 2) * 5), y = Math.round(12.5 + Math.sin(a / 16 * Math.PI * 2) * 2); s.px(x, y, a % 4 ? gdim : glow, a % 4 === 0); }
    s.px(22, 12, glow, true);
    for (const [cx, cy] of [[11, 12], [15, 14], [29, 11], [33, 13]]) { s.px(cx, cy, glow, true); for (const [i, j] of R.slice(0, (cx * 3) % 4 + 1)) s.px(cx + i, cy + j, gdim, true); }
    // a module and a core laid out at its ends, amber lights on the frame
    const stones = [[40, 12, ART.stones.form.body], [42, 15, CB], [4, 13, ART.stones.ember.body]];
    for (const [x, y, ramp] of stones) s.ell(x, y, 1.8, 1.3, ramp, { lo: 0, hi: 3 });
    for (let x = 2; x <= 43; x += 6) s.px(x, 18, HART.amber[1]);
    // the work lamp: an arm up off the back, bent over the plate
    hartLine(s, [37, 9], [39, 1], Hu[5]); hartLine(s, [38, 9], [40, 1], Hu[2]);
    hartLine(s, [39, 1], [31, 3], Hu[5]); hartLine(s, [39, 2], [31, 4], Hu[2]);
    s.box(28, 3, 32, 5, Hu, { lo: 2, hi: 6 });
    s.px(30, 6, '#d8f4ff', true); s.px(29, 6, '#a8c8e0', true);
    return hartDone(s, 23, FY, { lamp: { x: 30, y: 6 }, stone: [[1, FY, -1], [44, FY, 1], [44, 19, 1]] });
  });
}

// ---------------------------------------------------------------------------
// The locker: the Charter's locker module, a tall cabinet, two doors of
// its blue with the diver's amber light down their inner edges, a narrow
// side in shadow, the Charter's star on its lid.
// ---------------------------------------------------------------------------
function hartLocker() {
  return hartKeep('locker', () => {
    const W = 30, H = 48, FY = 46, s = new PntSpr(W, H, 701), I = HART.iron, amb = DIVER_PAL.circuit[0];
    // the side, in shadow
    hartStrokes(s, 24, 6, 27, FY - 1, (x, y) => 0.15 + (y < 8 ? 0.1 : 0), I, 702, { hi: 3 });
    // the lid, from above
    hartStrokes(s, 2, 2, 26, 6, (x, y) => (y === 6 ? 0.85 : 0.5 + (26 - x) * 0.01), I, 703);
    for (let x = 3; x <= 25; x++) s.px(x, 2, x < 14 ? I[5] : I[4]);
    s.px(27, 3, I[2]); s.px(27, 4, I[2]); s.px(27, 5, I[1]);
    // the doors' faces
    hartStrokes(s, 2, 7, 23, FY - 1, (x, y) => (x === 13 ? 0.02 : 0.42 + (23 - x) * 0.008 - (y - 7) * 0.004 + (x < 13 ? 0.05 : 0)), HART.charter, 704, { jit: 0.12 });
    for (let y = 7; y <= FY - 1; y++) { s.px(2, y, HART.charter[5]); s.px(13, y, '#030406'); s.px(14, y, HART.charter[1]); }
    // vents near the top, handles, feet
    for (const x0 of [4, 16]) for (let k = 0; k < 3; k++) for (let x = x0; x <= x0 + 6; x++) s.px(x, 10 + k * 2, I[1]);
    for (const x of [11, 16]) { s.px(x, 25, I[5]); s.px(x, 26, I[4]); s.px(x, 27, I[3]); }
    for (const x of [3, 4, 22, 23]) s.px(x, FY, I[0]);
    // the amber light down each door's inner edge
    for (let y = 16; y <= FY - 5; y++) { s.px(11, y, y % 5 ? amb : '#ffe48a', true); s.px(16, y, y % 5 === 2 ? '#ffe48a' : amb, true); }
    // the Charter's star on the lid
    for (const [i, j, c] of [[0, 0, '#ffe48a'], [-1, 0, amb], [1, 0, amb]]) s.px(14 + i, 4 + j, c, true);
    return hartDone(s, 14, FY, { stone: [[2, FY, -1], [27, FY, 1], [26, 6, 1]] });
  });
}

// ---------------------------------------------------------------------------
// The star's altar: a stepped plinth and a column carved with lines of the
// star's metal, a bowl at its head. The shard over it is drawn on its own
// (hartShard), bobbing.
// ---------------------------------------------------------------------------
function hartAltar() {
  return hartKeep('altar', () => {
    const W = 30, H = 40, FY = 38, s = new PntSpr(W, H, 801), S = HART.stone, St = HART.star;
    const lit = (x0, x1) => (x, y) => 0.45 + (x1 - x) / (x1 - x0) * 0.25;
    // the bottom step and the next
    hartStrokes(s, 2, 32, 27, FY, (x, y) => (y === 32 ? 0.85 : lit(2, 27)(x, y) - 0.15), S, 802);
    hartStrokes(s, 5, 27, 24, 31, (x, y) => (y === 27 ? 0.85 : lit(5, 24)(x, y) - 0.1), S, 803);
    for (let x = 2; x <= 27; x++) s.px(x, FY, S[0]);
    // the column, rounded: lit on its left
    hartStrokes(s, 9, 11, 20, 26, (x) => 0.75 - Math.abs(x - 12) * 0.07, S, 804, { jit: 0.12 });
    // lines of star metal in it
    for (const y of [14, 22]) for (let x = 9; x <= 20; x++) s.px(x, y, x < 13 ? St[4] : x < 17 ? St[3] : St[2], x < 15);
    for (let y = 16; y <= 20; y++) s.px(14, y, y === 18 ? St[5] : St[3], true);
    // the bowl at its head, its rim lit, embers of star in it
    s.ell(14.5, 9, 7.5, 2.8, S, { lo: 1, hi: 5, bias: 0.1 });
    for (let x = 9; x <= 20; x++) s.px(x, 8, '#0e0a06');
    for (const x of [11, 14, 17]) s.px(x, 8, St[4], true);
    s.px(13, 8, St[5], true);
    return hartDone(s, 15, FY, { bowl: { x: 14.5, y: 7 }, stone: [[3, FY, -1], [27, FY, 1], [6, 31, -1]] });
  });
}
// The shard of the star over the altar: a small faceted crystal, glowing.
function hartShard() {
  return hartKeep('shard', () => {
    const s = new PntSpr(9, 15, 811);
    hartCrystal(s, 4, 0, 4, 14, 3.6, 0.45);
    return hartDone(s, 4, 14);
  });
}
// A faceted crystal of the star's metal into s: its top at (cx, y0), its
// foot at y1, its girdle half as wide as rx, at the share g down. The face
// to the upper left lit, the lower right in shadow, a hot heart through it.
function hartCrystal(s, cx, y0, _, y1, rx, g) {
  const St = HART.star, gy = y0 + (y1 - y0) * g, rid = cx - rx * 0.18;
  const faces = [
    [[[cx, y0], [cx - rx, gy], [rid, gy]], 0.92],
    [[[cx, y0], [rid, gy], [cx + rx, gy]], 0.66],
    [[[cx - rx, gy], [rid, gy], [cx, y1]], 0.5],
    [[[rid, gy], [cx + rx, gy], [cx, y1]], 0.26],
  ];
  for (const [pts, v] of faces) s.poly(pts, (x, y) => St[clamp(Math.round((v + (artHash(Math.floor(x / 3), y, 820) - 0.5) * 0.18 - (y - y0) / (y1 - y0) * 0.12) * 6), 0, 6)]);
  // edges: the ridge and the girdle lit, the shadow side's edge deep
  const line = (a, b, col) => { const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])); for (let i = 0; i <= n; i++) s.px(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n, col); };
  line([cx, y0], [rid, gy], St[6]); line([cx, y0], [cx - rx, gy], St[5]); line([cx - rx, gy], [cx + rx, gy], St[5]);
  line([cx + rx, gy], [cx, y1], St[2]);
  // all of it glows
  for (let i = 0; i < s.c.length; i++) if (s.c[i]) s.g[i] = 1;
}

// ---------------------------------------------------------------------------
// The Lodestar itself, over its cradle: a great faceted crystal, k its size
// (2 or 3, as it grows), and a loose halo of amber round it. Glowing.
// ---------------------------------------------------------------------------
function hartStar(k) {
  return hartKeep('star' + k, () => {
    const h = k === 3 ? 76 : 56, w = Math.round(h * 0.6), W = w + 30, H = h + 30, s = new PntSpr(W, H, 900 + k), cx = W >> 1, y0 = 15;
    hartCrystal(s, cx, y0, 0, y0 + h, w / 2, 0.56);
    const St = HART.star;
    // facets within the faces: a few long strokes lighter and darker
    for (let n = 0; n < h; n++) {
      const y = y0 + 4 + Math.floor(artHash(n, 1, 905) * (h - 8)), x = cx - w / 2 + Math.floor(artHash(n, 2, 905) * w), len = 3 + Math.floor(artHash(n, 3, 905) * 5);
      const base = s.get(x, y);
      if (!base) continue;
      const i = St.indexOf(base), j = clamp(i + (artHash(n, 4, 905) < 0.5 ? 1 : -1), 1, 6);
      for (let q = 0; q < len; q++) if (s.get(x + q, y)) s.px(x + q, y, St[j], true);
    }
    // its hot heart, showing through the lit face
    for (let n = 0; n < 9; n++) s.px(cx - 4 - Math.round(artHash(n, 7, 906) * 6), y0 + Math.round(h * (0.3 + artHash(n, 8, 906) * 0.25)), St[6], true);
    return hartDone(s, cx, y0 + Math.round(h * 0.56));
  });
}
// The halo round it: loose pixels of amber, denser near, two frames (not
// glowing: the star's light lights them).
function hartHalo(k, frame) {
  return hartKeep('halo' + k + frame, () => {
    const h = k === 3 ? 76 : 56, R = h * 0.7, W = Math.round(R * 2 + 8), s = new PntSpr(W, W, 950 + frame), c = W >> 1, cols = ['#5a3c18', '#8a6430', '#b88a44'];
    for (let n = 0; n < (k === 3 ? 900 : 600); n++) {
      const a = artHash(n, 1, 951 + frame) * Math.PI * 2, r = R * (0.36 + 0.64 * artHash(n, 2, 951 + frame) ** 1.4);
      if (artHash(n, 3, 951 + frame) > 0.75 * (1 - (r / R - 0.36) / 0.64)) continue;
      const x = Math.round(c + Math.cos(a) * r * 0.75), y = Math.round(c + Math.sin(a) * r), col = cols[r < R * 0.55 ? 2 : r < R * 0.75 ? 1 : 0];
      s.px(x, y, col); if (artHash(n, 4, 951) < 0.35) s.px(x + 1, y, col);
    }
    return hartDone(s, c, c);
  });
}
// ---------------------------------------------------------------------------
// The Meridian uplink: a lattice mast of dark steel on a slab, a dish turned
// to the sky, a console at its foot with a screen; the tip's lamp is drawn
// over it (dark until the colony's called). Points: tip, feed, screen.
// ---------------------------------------------------------------------------
function hartUplink() {
  return hartKeep('uplink', () => {
    const W = 48, H = 74, FY = 70, s = new PntSpr(W, H, 1001), I = HART.iron, cx = 22, top = 8;
    const line = (a, b, col) => { const n = Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]))); for (let i = 0; i <= n; i++) s.px(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n, col); };
    // the slab
    hartStrokes(s, 9, 64, 37, FY, (x, y) => (y === 64 ? 0.8 : 0.4 + (37 - x) * 0.01), HART.stone, 1002);
    for (let x = 9; x <= 37; x++) s.px(x, FY, HART.stone[0]);
    // the legs, lit on the left, and the lattice between them
    const L0 = [13, 64], R0 = [31, 64], T0 = [cx - 1, top], T1 = [cx + 1, top];
    line(L0, T0, I[4]); line([L0[0] + 1, L0[1]], [T0[0] + 1, T0[1]], I[3]);
    line(R0, T1, I[2]); line([R0[0] - 1, R0[1]], [T1[0] - 1, T1[1]], I[1]);
    const xAt = (a, b, y) => a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]);
    let prev = null;
    for (let y = 60; y > top + 4; y -= 8) {
      const l = [Math.round(xAt(L0, T0, y)) + 1, y], r = [Math.round(xAt(R0, T1, y)) - 1, y];
      line(l, r, I[2]);
      if (prev) { line(prev[0], r, I[1]); line(prev[1], l, I[2]); }
      prev = [l, r];
    }
    // the mast's head and the lamp's housing
    s.box(cx - 2, top - 3, cx + 2, top + 1, I, { lo: 1, hi: 4 });
    // the dish, on an arm to the left, its bowl to the sky
    line([cx - 2, 30], [9, 27], I[3]);
    const DISH = ['#1a1e26', '#2c323e', '#454d5c', '#647084', '#8e9aae', '#b4c0d0'];
    s.ell(8, 24, 7.5, 4.2, DISH, { lo: 1, hi: 5, bias: 0.2 });
    s.ell(8.5, 23.2, 5.6, 2.6, DISH, { lo: 0, hi: 3, bias: 0.1 });
    for (let a = 0; a < 1; a += 0.04) if (Math.cos(a * Math.PI * 2) < 0.2 && Math.sin(a * Math.PI * 2) < 0.3) s.px(8 + Math.cos(a * Math.PI * 2) * 7, 24 + Math.sin(a * Math.PI * 2) * 3.8, DISH[5]);
    line([8, 24], [10, 18], I[4]); s.px(10, 17, ART.pal.rune[0], true);
    // the console at its foot, its screen glowing
    s.box(31, 52, 43, 66, I, { lo: 1, hi: 4 });
    for (let x = 31; x <= 43; x++) s.px(x, 52, x < 36 ? I[5] : I[4]);
    for (let y = 55; y <= 59; y++) for (let x = 33; x <= 40; x++) s.px(x, y, (x + y) % 3 ? '#0e3a40' : '#1e6a70', true);
    s.px(34, 56, '#9cf8ff', true); s.px(35, 56, '#62f0ff', true); s.px(37, 58, '#62f0ff', true);
    for (const x of [33, 35, 37]) s.px(x, 62, x === 33 ? '#ffb030' : I[3], x === 33);
    // a cable from the console into the ground
    for (let x = 26; x <= 31; x++) s.px(x, 67 + (x < 29 ? 1 : 0), I[1]);
    return hartDone(s, cx, FY - 2, { tip: { x: cx, y: top - 4 }, feed: { x: 10, y: 17 }, screen: { x: 36, y: 57 }, stone: [[9, FY, -1], [38, FY, 1], [44, 66, 1], [13, 63, -1]] });
  });
}

// ---------------------------------------------------------------------------
// The planting cradle the star hangs over: a ring of Charter segments set in
// the ground, a socket of the Charter's blue in its middle with the seed's
// anchor glowing at its heart, and four arms rising round it to hold the
// star's field, a conduit of its gold up each arm's inner edge and a lamp at
// each tip (lamps). Feet at the ring's front.
// ---------------------------------------------------------------------------
function hartCradle() {
  return hartKeep('cradle', () => {
    const W = 92, H = 60, cx = 46, cy = 46, rx = 36, ry = 9.5, FY = 57, s = new PntSpr(W, H, 1601), Hu = HART.hull, CB = HART.charter, G = HART.star, lamps = [];
    const inE = (x, y, a, b) => ((x + 0.5 - cx) / a) ** 2 + ((y + 0.5 - cy) / b) ** 2 <= 1;
    // an arm: from its foot on the ring up and in to its tip, gunmetal lit
    // on its left, a gold conduit along its inner side
    const arm = (fx, fy, tx, ty, side, seed) => {
      const pts = [[fx, fy], [fx + (tx - fx) * 0.15, fy - (fy - ty) * 0.55], [tx, ty]];
      s.limb(pts, 4.6, 2.8, (t, sd) => Hu[sd < 0 ? 5 : sd > 0 ? 1 : 3]);
      for (let i = 0; i <= 30; i++) {
        const t = i / 30, u = 1 - t, x = u * u * pts[0][0] + 2 * u * t * pts[1][0] + t * t * pts[2][0], y = u * u * pts[0][1] + 2 * u * t * pts[1][1] + t * t * pts[2][1];
        s.px(x - side * 1.2, y, i % 5 === 0 ? G[6] : G[4], true);
      }
      s.box(tx - 2, ty - 2, tx + 2, ty + 1, CB, { lo: 2, hi: 6 });
      lamps.push([Math.round(tx), Math.round(ty - 1)]);
      void seed;
    };
    // the back arms, behind the ring
    arm(cx - 26, cy - 6, cx - 13, 9, -1, 1); arm(cx + 26, cy - 6, cx + 13, 9, 1, 2);
    // the ring's top: segments lit on the side to the light, their joints dark
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++)
      for (let x = cx - rx - 1; x <= cx + rx + 1; x++) {
        if (!inE(x, y, rx, ry) || inE(x, y, rx - 7, ry - 2.6)) continue;
        const a = Math.atan2((y + 0.5 - cy) / ry, (x + 0.5 - cx) / rx), seg = Math.floor((a + Math.PI) / (Math.PI * 2) * 16);
        const joint = Math.abs(((a + Math.PI) / (Math.PI * 2) * 16) - Math.round((a + Math.PI) / (Math.PI * 2) * 16)) < 0.06;
        const v = 0.62 - Math.cos(a + 0.6) * 0.18 + (artHash(seg, 1, 1602) - 0.5) * 0.12;
        s.px(x, y, joint ? Hu[1] : Hu[clamp(Math.round(v * 6 + (artHash(x >> 1, y, 1603) - 0.5) * 0.8), 1, 6)]);
      }
    // its outer edge lit at the back, an amber line round its inner edge
    for (let k = 0; k < 360; k++) {
      const a = k / 360 * Math.PI * 2, x = cx + Math.cos(a) * (rx - 7.5), y = cy + Math.sin(a) * (ry - 2.9);
      if (k % 12 < 8) s.px(x, y, HART.amber[Math.sin(a) > 0 ? 1 : 2], Math.sin(a) > 0);
      const ox = cx + Math.cos(a) * rx, oy = cy + Math.sin(a) * ry;
      if (Math.sin(a) < 0) s.px(ox, oy, Hu[6]);
    }
    // the socket inside it: the Charter's blue in plates, falling to the
    // anchor in its middle, which glows
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
      for (let x = cx - rx; x <= cx + rx; x++) {
        if (!inE(x, y, rx - 7.6, ry - 3)) continue;
        const u = (x + 0.5 - cx) / (rx - 7.6), v = (y + 0.5 - cy) / (ry - 3), r = Math.hypot(u, v), a = Math.atan2(v, u);
        const seam = Math.abs(Math.sin(a * 4)) < 0.08 && r > 0.3;
        let c = CB[clamp(Math.round(2 + (r * 2.2) + (v < 0 ? -0.6 : 0.4) + (artHash(x >> 1, y, 1604) - 0.5)), 0, 6)];
        if (seam) c = CB[0];
        if (r < 0.26) { s.px(x, y, r < 0.12 ? G[6] : r < 0.2 ? G[5] : G[3], true); continue; }
        s.px(x, y, c);
      }
    // its wall in front, below the ring: plates, their joints, small lights
    for (let x = cx - rx; x <= cx + rx; x++) {
      const u = (x + 0.5 - cx) / rx;
      if (Math.abs(u) > 1) continue;
      const y0 = Math.round(cy + ry * Math.sqrt(1 - u * u)), j = Math.round(((Math.asin(clamp(u, -1, 1)) + Math.PI) / (Math.PI * 2)) * 16 * 2) % 2;
      for (let y = y0 + 1; y <= Math.min(FY, y0 + 6); y++) s.px(x, y, y === y0 + 1 ? Hu[5] : Hu[clamp(Math.round(3.2 - u * 1.6 - (y - y0) * 0.18), 0, 6)]);
      if (j && artHash(Math.round(x / 3), 9, 1605) < 0.3) s.px(x, y0 + 4, HART.amber[2], true);
      s.px(x, Math.min(FY, y0 + 7), Hu[0]);
    }
    // the front arms
    arm(cx - 34, cy + 2, cx - 20, 14, -1, 3); arm(cx + 34, cy + 2, cx + 20, 14, 1, 4);
    // the seed-star on the wall's front
    hartSeedStar(s, cx, FY - 3, false);
    return hartDone(s, cx, FY, { lamps, stone: [[cx - 36, cy + 4, -1], [cx + 37, cy + 4, 1], [cx - 18, FY + 1, -1], [cx + 20, FY + 1, 1], [cx - 30, cy - 4, -1], [cx + 30, cy - 4, 1]] });
  });
}

// Starstone: a cluster of n crystals (1-5), gold and lodestone, the star's
// own, leaning to one side (side -1 left, 1 right, 0 up), v its variant.
// Each a faceted shard lit on its upper left, the gold ones glowing at the
// tip. Feet at its middle.
function hartStarstone(n, v, side) {
  return hartKeep('stone' + n + '/' + v + '/' + side, () => {
    const W = 24, H = 20, FY = 18, cx = 12, s = new PntSpr(W, H, 1701 + v * 7 + n), G = HART.star, L = LODESTONE;
    const order = [2, 0, 4, 1, 3].slice(0, n).sort((a, b) => Math.abs(b - 2) - Math.abs(a - 2));
    for (const i of order) {
      const h = 6 + (5 - Math.abs(i - 2) * 1.6) * (0.5 + n * 0.12) + artHash(i, v, 1702) * 3, rx = 2.2 + artHash(i, v, 1703) * 1.2 + (n - Math.abs(i - 2)) * 0.15;
      const bx = cx + (i - 2) * 3 + side * 1.5, tx = bx + side * (1.5 + Math.abs(i - 2)) * 0.7 + (i - 2) * 0.8, ty = FY - h, gold = (i + v) % 3 !== 1;
      const R = gold ? G : [L[0], L[1], L[2], L[3], G[3], G[4], G[5]];
      s.poly([[bx - rx, FY], [bx - rx * 0.7 + (tx - bx) * 0.5, FY - h * 0.55], [tx, ty], [bx + rx * 0.8 + (tx - bx) * 0.5, FY - h * 0.5], [bx + rx, FY]], (x, y) => {
        const left = x < bx + (tx - bx) * (FY - y) / Math.max(1, h);
        return R[clamp(Math.round((gold ? (left ? 4.6 : 2.6) : left ? 2.4 : 1) + (artHash(x, y, 1704) - 0.5) * 0.8 - (y - ty) / h * 0.8), 0, 6)];
      });
      hartLine(s, [bx, FY], [tx, ty], gold ? G[6] : G[4]);
      s.px(tx, ty, gold ? G[6] : G[5], true);
      if (gold) s.px(tx, ty + 1, G[5], true);
    }
    for (let x = cx - 8; x <= cx + 8; x++) if (s.get(x, FY - 1) && artHash(x, 1, 1705) < 0.6) s.px(x, FY, L[0]);
    return hartDone(s, cx, FY);
  });
}

// ---------------------------------------------------------------------------
// The portal's gate: two pylons of the Charter's blue either side of the
// portal, amber lights down their inner faces (lamps), a gunmetal lintel
// across them with the seed-star on it. Feet at the middle of its front.
// ---------------------------------------------------------------------------
function hartGate() {
  return hartKeep('gate', () => {
    const W = 68, H = 70, FY = 67, cx = 34, s = new PntSpr(W, H, 1801), Hu = HART.hull, CB = HART.charter, lamps = [];
    for (const [x0, x1] of [[3, 11], [57, 65]]) {
      // its foot, a step wider
      hartBlock(s, x0 - 2, x1 + 2, FY - 6, FY - 4, FY, Hu, 1802 + x0, 1);
      hartBlock(s, x0, x1, 12, 14, FY - 6, CB, 1804 + x0, 1);
      for (let y = 18; y < FY - 8; y += 9) for (let x = x0 + 1; x < x1; x++) s.px(x, y, CB[1]);
      const lx = x0 < cx ? x1 - 2 : x0 + 2;
      for (let y = 20; y < FY - 10; y += 6) { s.px(lx, y, HART.amber[2], true); lamps.push([lx, y]); }
    }
    // the lintel, the seed-star on its face
    hartBlock(s, 1, 67, 3, 7, 13, Hu, 1806, 2);
    for (let x = 2; x <= 66; x++) if (x % 5 < 3) s.px(x, 12, HART.amber[1]);
    hartSeedStar(s, cx, 10, true, true);
    return hartDone(s, cx, FY, { lamps, stone: [[1, FY, -1], [67, FY, 1], [12, FY, 1], [56, FY, -1]] });
  });
}

// ---------------------------------------------------------------------------
// A habitat pod: a Charter module to live in, a long box with rounded ends
// on skids, seen from above and in front, sized for the Kindler (about 42
// art px tall) to walk out of: a pale top with a vent, the Charter's blue
// face with a full-height door (a slit of light in it) and a lit window
// (lamps: its light), the seed-star, an amber light by the door. v: which
// way it's laid out (the door left or right).
// ---------------------------------------------------------------------------
function hartPod(v = 0) {
  return hartKeep('pod' + v, () => {
    const W = 100, H = 82, FY = 79, s = new PntSpr(W, H, 1901 + v), Hu = HART.hull, CB = HART.charter, St = HART.steel, lamps = [];
    const x0 = 3, x1 = 96, top = 4, lip = 22, foot = 72;
    // the skids
    for (const sx of [14, 84]) for (let k = 0; k < 3; k++) { hartLine(s, [sx + k, foot], [sx + k - 3, FY - 1], k === 0 ? Hu[4] : k === 1 ? Hu[3] : Hu[2]); }
    for (let x = 4; x <= 95; x++) s.px(x, FY - 1, x < 48 ? Hu[3] : Hu[2]);
    for (let x = 4; x <= 95; x++) s.px(x, FY, Hu[0]);
    // the top: pale panels, rounded at its ends, a vent on it
    hartStrokes(s, x0, top, x1, lip - 1, (x, y) => { const e = Math.min(x - x0, x1 - x); return e < 5 - (y - top) * 0.45 ? null : 0.78 - (x - x0) / (x1 - x0) * 0.2 - (lip - y) * 0.01; }, St, 1902 + v, { jit: 0.1 });
    for (let x = x0 + 8; x <= x1 - 8; x += 16) for (let y = top + 2; y < lip; y++) s.px(x, y, St[2]);
    const vx = v ? x0 + 14 : x0 + 58;
    s.box(vx, top + 4, vx + 16, top + 12, Hu, { lo: 2, hi: 5 });
    for (let x = vx + 2; x <= vx + 14; x += 3) for (let y = top + 6; y <= top + 10; y++) s.px(x, y, Hu[1]);
    // the face
    hartStrokes(s, x0, lip, x1, foot, (x, y) => { const e = Math.min(x - x0, x1 - x); return e < 3 - Math.min(3, (y - lip) * 0.5) ? null : 0.55 - (x - x0) / (x1 - x0) * 0.32 - (y - lip) * 0.003; }, CB, 1904 + v, { jit: 0.12 });
    for (let x = x0 + 1; x <= x1 - 1; x++) { s.px(x, lip, St[4]); s.px(x, lip + 1, St[3]); s.px(x, foot, CB[0]); s.px(x, foot - 1, CB[1]); }
    for (let y = lip + 2; y < foot - 1; y++) { s.px(x0 + 1, y, CB[5]); s.px(x0 + 2, y, CB[4]); s.px(x1 - 1, y, CB[1]); }
    for (let x = x0 + 3; x <= x1 - 3; x++) { s.px(x, lip + 5, CB[1]); s.px(x, foot - 8, CB[1]); }
    // the door, full height, its frame, a slit of light in it, an amber
    // lamp beside it and a handle light
    const dw = 18, dx = v ? x1 - 12 - dw : x0 + 9, dy = lip + 6, wx = v ? x0 + 12 : x1 - 42;
    for (let y = dy - 2; y < foot - 1; y++) for (let x = dx - 2; x <= dx + dw + 1; x++) s.px(x, y, x < dx || y < dy ? Hu[5] : x > dx + dw - 1 ? Hu[1] : Hu[1]);
    for (let y = dy; y < foot - 1; y++) for (let x = dx; x < dx + dw; x++) s.px(x, y, x === dx ? Hu[4] : x === dx + dw - 1 ? Hu[1] : (y - dy) % 9 === 8 ? Hu[1] : Hu[2 + (((x - dx) >> 3) & 1)]);
    for (let y = dy + 5; y <= dy + 16; y++) for (let x = dx + 7; x <= dx + 10; x++) s.px(x, y, x === dx + 7 || y === dy + 5 ? Hu[0] : '#ffc060', x !== dx + 7 && y !== dy + 5);
    lamps.push([dx + 9, dy + 10]);
    s.px(dx + dw - 4, dy + 24, HART.amber[2], true); s.px(dx + dw - 4, dy + 25, HART.amber[1], true);
    for (let k = 0; k < 3; k++) s.px(v ? dx + dw + 4 : dx - 5, dy + 2 + k, HART.amber[3 - (k >> 1)], true);
    // the window, lit warm inside, with a mullion
    for (let y = lip + 10; y <= lip + 26; y++) for (let x = wx; x <= wx + 28; x++) {
      const edge = y === lip + 10 || x === wx || x === wx + 28 || y === lip + 26 || x === wx + 14;
      s.px(x, y, edge ? Hu[1] : y > lip + 21 ? '#d8862c' : (x + y) % 5 === 0 ? '#ffe0a0' : '#ffc060', !edge);
    }
    lamps.push([wx + 14, lip + 18]);
    // the seed-star, and a row of small status lights under the window
    hartSeedStar(s, v ? x1 - 14 - dw - 20 : x0 + 9 + dw + 16, lip + 30, true);
    for (let k = 0; k < 4; k++) s.px(wx + 4 + k * 3, lip + 31, k === 0 ? '#5cffb4' : HART.amber[1 + (k & 1)], true);
    return hartDone(s, 50, FY, { lamps, door: { x: dx, y: dy, w: dw, h: foot - 1 - dy }, stone: [[2, FY, -1], [97, FY, 1], [x1, lip, 1], [x0 + 30, FY, 1], [x1 - 30, FY, -1]] });
  });
}

// ---------------------------------------------------------------------------
// A lander, down on its pad: a squat Charter craft, its hull gunmetal over a
// band of the Charter's blue, a pale nose cap, a row of ports, four legs
// splayed to the pad, red landing lights (lamps) blinking in turn.
// ---------------------------------------------------------------------------
function hartLander() {
  return hartKeep('lander', () => {
    // (k: its size against the first drawing, 50 × 50, which stood no
    // taller than the Kindler; every place below is in those units)
    const k = 2, K = (v) => Math.round(v * k), W = K(50), H = K(50), FY = K(47), cx = K(25), s = new PntSpr(W, H, 2001), Hu = HART.hull, CB = HART.charter, St = HART.steel, lamps = [];
    const thick = (a, b, col) => { for (let j = 0; j < k; j++) hartLine(s, [a[0] + j, a[1]], [b[0] + j, b[1]], col); };
    // the back legs, behind
    for (const sd of [-1, 1]) { thick([cx + sd * K(10), K(32)], [cx + sd * K(15), FY - K(5)], Hu[2]); s.box(cx + sd * K(15) - K(2), FY - K(6), cx + sd * K(15) + K(2), FY - K(4), Hu, { lo: 1, hi: 3 }); }
    // the hull: a rounded cone, lit on its left
    s.poly([[cx - K(18), K(36)], [cx - K(13), K(14)], [cx + K(13), K(14)], [cx + K(18), K(36)]], (x, y) => Hu[clamp(Math.round(5 - (x - cx + K(18)) / K(36) * 3.6 + (artHash(x >> 1, y, 2002) - 0.5) * 0.7), 1, 6)]);
    s.ell(cx, K(14), K(13), K(4), St, { lo: 1, hi: 5, bias: 0.15 });
    s.ell(cx - 1, K(13), K(6), K(2), St, { lo: 2, hi: 5, bias: 0.25 });
    for (let x = cx - K(12); x <= cx + K(12); x++) for (let j = 0; j < k; j++) s.px(x, K(17) + j, Hu[1]);
    // the blue band, a row of ports, the seed-star
    for (let y = K(24); y <= K(29); y++) {
      const half = K(13) + (y - K(14)) * K(5) / K(22);
      for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) s.px(x, y, CB[clamp(Math.round(5 - (x - cx + half) / (2 * half) * 3.5 - (y > K(29) - k ? 1 : 0)), 0, 6)]);
    }
    for (let q = -2; q <= 2; q++) for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) { s.px(cx + q * K(4) + i, K(20) + j, '#0a0e14'); s.px(cx + q * K(4) + k + i, K(20) + j, q < 0 ? '#3a4a5c' : '#141c26'); }
    hartSeedStar(s, cx, K(26), k > 1);
    // its skirt, and the front legs
    for (let x = cx - K(18); x <= cx + K(18); x++) { for (let j = 0; j < k; j++) s.px(x, K(36) + j, Hu[0]); for (let j = 1; j <= k; j++) s.px(x, K(36) - j, Hu[x < cx ? 4 : 2]); }
    for (const sd of [-1, 1]) {
      thick([cx + sd * K(15), K(31)], [cx + sd * K(22), FY - 1], Hu[sd < 0 ? 5 : 3]); thick([cx + sd * K(15) + k, K(31)], [cx + sd * K(22) + k, FY - 1], Hu[1]);
      s.box(cx + sd * K(22) - K(3), FY - K(2), cx + sd * K(22) + K(3), FY, Hu, { lo: 1, hi: 4 });
      lamps.push([cx + sd * K(17), K(34)]);
    }
    lamps.push([cx, K(10)]);
    return hartDone(s, cx, FY - 1, { lamps });
  });
}

// A light mast on its foot: a slim gunmetal pole with a band of the
// Charter's blue, a lamp head on an arm (lit: amber, glowing; dark: a dark
// pane). Lamp at lamp.x, lamp.y.
function hartLantern(lit) {
  return hartKeep('lantern' + lit, () => {
    const W = 14, H = 46, FY = 44, s = new PntSpr(W, H, 1101), Hu = HART.hull, CB = HART.charter, St = HART.star;
    for (let y = 4; y <= FY - 2; y++) { s.px(3, y, Hu[y < 14 ? 6 : 5]); s.px(4, y, Hu[2]); }
    for (let y = 26; y <= 30; y++) { s.px(3, y, CB[5]); s.px(4, y, CB[2]); }
    s.box(1, FY - 2, 6, FY, Hu, { lo: 0, hi: 4 });
    // the arm and the head
    for (let x = 3; x <= 11; x++) s.px(x, 4, x < 7 ? Hu[6] : Hu[5]);
    for (let x = 6; x <= 12; x++) s.px(x, 5, Hu[2]);
    for (let x = 7; x <= 12; x++) s.px(x, 6, lit ? (x === 9 || x === 10 ? St[6] : St[4]) : x === 8 ? '#3a4050' : '#141820', lit);
    for (let x = 7; x <= 12; x++) s.px(x, 7, lit ? St[2] : '#0e1218', lit);
    return hartDone(s, 4, FY, { lamp: { x: 9, y: 6 } });
  });
}

// ---------------------------------------------------------------------------
// People: a settler in a heavy coat and hood, a scarf, goggles with a teal
// glint, boots; about 36 px, three-quarters facing right (flipped for the
// left), idle and a four-step walk, a little lamp in the far hand. The
// smith, at the press: leather apron, tongs holding the work on the bed in
// the far hand, the near hand pushing the press's lever over and leaning
// into it. A settler sitting on a crate with a cup.
// ---------------------------------------------------------------------------
const HART_LOOKS = [
  { coat: ['#0d0d10', '#17171c', '#24242b', '#34343d', '#46464f'], scarf: HART.crimson, hood: ['#0f0c0a', '#1c1610', '#2c2218', '#3e3022', '#52402e'] },
  { coat: ['#0e0d09', '#1a1810', '#2a2618', '#3c3622', '#4e4630'], scarf: ['#1e1406', '#3a2608', '#5e3e0e', '#8a5c16', '#b07a26'], hood: ['#0a0b0e', '#14161b', '#20242b', '#2e333c', '#3e444f'] },
  { coat: ['#100a0b', '#1e1214', '#2e1c1f', '#40282c', '#54363a'], scarf: ['#0a1414', '#122624', '#1c3c38', '#2a5a52', '#3c7a70'], hood: ['#0d0d0a', '#191912', '#27271c', '#383828', '#4a4a36'] },
  { coat: ['#090d0d', '#111a19', '#1c2a28', '#283c39', '#364e4a'], scarf: HART.crimson, hood: ['#0f0b09', '#1e1610', '#30241a', '#443426', '#5a4632'] },
];
const HART_PERSON_W = 26, HART_PERSON_H = 40, HART_PERSON_FEET = 38;
// pose: 'walk' (frame 0 idle, 1-4 the walk), 'smith' (the lever: 0 back,
// 1 halfway, 2 pushed over), 'sit' (0, 1: the cup's steam)
function hartPerson(look, pose, frame) {
  return hartKeep('person' + look + pose + frame, () => {
    const L = HART_LOOKS[look % HART_LOOKS.length], W = pose === 'smith' ? 34 : HART_PERSON_W, s = new PntSpr(W, HART_PERSON_H, 1301 + look * 31 + frame);
    const ox = 12, by = HART_PERSON_FEET, C = L.coat, K = HART.skin, TR = ['#08080a', '#101014', '#1a1a20', '#26262e'], BOOT = ['#060404', '#100b08', '#1c140e', '#2a1e14'];
    const sit = pose === 'sit', bob = pose === 'walk' && (frame === 2 || frame === 4) ? -1 : 0;
    const steps = pose === 'walk' ? [[0, 0], [3, 0], [0, -1], [-3, 0], [0, -1]][frame] : [0, 0];
    const top = sit ? by - 14 : by - 18;
    // (the smith leans into the lever: his upper body ux, uy over)
    const ux = pose === 'smith' ? [0, 1, 1][frame] : 0, uy = pose === 'smith' && frame === 2 ? 1 : 0, bx = ox + ux;
    if (sit) {
      // the crate under him
      s.box(ox - 4, by - 9, ox + 7, by, HART.wood, { lo: 0, hi: 4 });
      for (let x = ox - 4; x <= ox + 7; x++) s.px(x, by - 9, HART.wood[x < ox + 1 ? 5 : 4]);
      for (let y = by - 8; y <= by; y++) s.px(ox + 1, y, HART.wood[1]);
      // his legs, out in front to the left
      for (const [k, dk] of [[0, -1], [1, 0]]) {
        s.limb([[ox + 1 + k * 2, top + 3], [ox - 7 + k * 2, top + 4], [ox - 8 + k * 2, by - 3]], 4.4, 3.8, (t, sd) => TR[k ? (sd < 0 ? 3 : 1) : sd < 0 ? 2 : 0]);
        s.ell(ox - 9 + k * 2, by - 1.6, 3.2, 1.8, BOOT, { lo: 0, hi: k ? 3 : 2 });
      }
    } else {
      // legs: the far one darker; boots
      for (const k of [1, 0]) {
        const lx = ox + (k ? 3 : -2) + (k ? -steps[0] : steps[0]) * 0.6, fy = by - 1 + (k ? (frame === 4 ? -1 : 0) : steps[1]);
        s.limb([[ox + (k ? 2 : -1), top + bob], [lx, by - 9 + bob], [lx, fy - 2]], 4.4, 3.8, (t, sd) => TR[k ? (sd < 0 ? 1 : 0) : sd < 0 ? 3 : sd > 0 ? 0 : 1]);
        s.ell(lx + 1, fy - 1, 3.2, 1.8, BOOT, { lo: 0, hi: k ? 2 : 3 });
      }
    }
    // the coat: flaring to the knee, the front's edge dark
    const cy = (sit ? by - 21 : by - 25) + bob + uy, hem = sit ? by - 11 : by - 11 + bob, sway = pose === 'walk' && frame % 2 ? (frame === 1 ? 1 : -1) : 0;
    s.poly([[bx - 6, cy - 4], [bx + 6, cy - 4], [ox + 8 + sway, hem], [ox - 7 + sway, hem]], (x, y) => C[x < ox - 3 ? 3 : x < ox + 4 ? 2 : 1]);
    s.ell(bx, cy, 7.4, 6.2, C, { lo: 1, hi: 4, bias: 0.05 });
    for (let y = cy + 1; y < hem; y++) s.px(ox + 2 + (y > cy + 6 ? sway : ux), y, C[0]);
    for (let x = ox - 6; x <= ox + 7; x++) if (artHash(x, 3, look) < 0.6) s.px(x + sway, hem, C[1]);
    if (pose === 'smith') {
      // the leather apron
      s.poly([[bx - 1, cy - 3], [bx + 6, cy - 3], [ox + 7, hem + 1], [ox - 2, hem + 1]], (x, y) => ['#24160e', '#33200f', '#45301a'][x < ox + 1 ? 2 : x < ox + 5 ? 1 : 0]);
    }
    // the far arm (his left, behind): holding a lamp, the tongs, or the cup
    const sy = cy - 4;
    if (pose === 'walk') {
      const sw = frame === 1 ? -2 : frame === 3 ? 2 : 0;
      s.limb([[ox - 4, sy], [ox - 6 + sw * 0.5, sy + 6], [ox - 6 + sw, sy + 11]], 3.6, 3.0, (t, sd) => C[sd < 0 ? 2 : 0]);
      s.px(ox - 6 + sw, sy + 13, '#ffd27a', true); s.px(ox - 6 + sw, sy + 14, '#ff9a34', true); s.px(ox - 6 + sw, sy + 12, HART.iron[3]);
    } else if (pose === 'smith') {
      // out over the bed, the tongs' jaws on the work under the ram (by - 21)
      s.limb([[bx - 3, sy + 1], [bx + 1, sy + 6], [ox + 7, by - 22]], 3.6, 3.0, (t, sd) => C[sd < 0 ? 3 : 1]);
      for (let i = 0; i < 7; i++) s.px(ox + 7 + i, by - 22 + (i > 3 ? 1 : 0), HART.iron[i < 3 ? 5 : 4]);
    }
    // the scarf, the face and the hood; goggles with a teal glint
    const hx = bx + (sit ? -1 : 1), hy = (sit ? by - 30 : by - 34) + bob + uy, f = sit ? -1 : 1;
    s.ell(bx + 0.5, cy - 5.5, 5.2, 2.4, L.scarf, { lo: 1, hi: 4 });
    // (the hood a dome lit along its upper left; the face looks out of its
    // opening on the side he faces, the hood's shadow behind it, lit on the
    // cheek; goggles a dark band with a bright glint, so the head reads as
    // a hooded face at a glance and not as a blob)
    const hcx = hx - f * 0.8, hcy = hy - 0.8, hrx = 4.6, hry = 5;
    s.ell(hcx, hcy, hrx, hry, L.hood, { lo: 1, hi: 4, bias: 0.1 });
    const inHood = (x, y) => ((x + 0.5 - hcx) / hrx) ** 2 + ((y + 0.5 - hcy) / hry) ** 2 <= 1;
    const fcx = hx + f * 1.9, fcy = hy + 1;
    for (let y = Math.floor(fcy - 3); y <= Math.ceil(fcy + 2); y++) for (let x = Math.floor(fcx - 3); x <= Math.ceil(fcx + 3); x++) {
      const u = (x + 0.5 - fcx) / 2.8, v = (y + 0.5 - fcy) / 3.2, d = u * u + v * v;
      if (d > 1 || !inHood(x, y)) continue;
      // the hood's shadow on the face's far side and brow, else skin: the
      // cheek nearest the light lit
      const back = u * f < -0.45 || v < -0.7;
      s.px(x, y, back ? L.hood[0] : v < 0.1 && u * f > 0.1 ? K[4] : v > 0.55 ? K[2] : K[3]);
    }
    // the hood's lit edge
    for (let y = Math.floor(hcy - hry); y <= hcy + 1; y++) for (let x = Math.floor(hcx - hrx); x <= hcx + 1; x++) if (inHood(x, y) && (!inHood(x, y - 1) || !inHood(x - 1, y)) && artHash(x, y, look + 77) < 0.8) s.px(x, y, mix(L.hood[4], '#f0e2c8', 0.35));
    s.px(hx + f * 1, hy, '#0a0c0e'); s.px(hx + f * 2, hy, '#16262a'); s.px(hx + f * 3, hy, '#a8fff0');
    if (pose === 'walk') {
      // the near arm, swinging
      const sw = frame === 1 ? 2 : frame === 3 ? -2 : 0;
      s.limb([[ox + 4, sy], [ox + 5 + sw * 0.5, sy + 6], [ox + 5 + sw, sy + 11]], 3.8, 3.2, (t, sd) => C[sd < 0 ? 4 : sd > 0 ? 1 : 2]);
      s.ell(ox + 5 + sw, sy + 12, 1.4, 1.4, K, { lo: 1, hi: 3 });
    } else if (pose === 'smith') {
      // the press's lever, on the bed's face, and the near arm pushing it
      // over: back, halfway, over (its grip under his hand)
      const pv = [ox + 9, by - 7], a = [-0.55, -0.1, 0.35][frame], gr = [pv[0] + Math.sin(a) * 11, pv[1] - Math.cos(a) * 11];
      hartLine(s, pv, gr, HART.steel[4]); hartLine(s, [pv[0] + 1, pv[1]], [gr[0] + 1, gr[1]], HART.steel[1]);
      s.px(pv[0], pv[1], HART.iron[4]); s.px(pv[0] + 1, pv[1], HART.iron[2]);
      for (const [i, j, c] of [[0, -1, 4], [1, -1, 3], [0, -2, 4], [1, -2, 2]]) s.px(gr[0] + i, gr[1] + j, HART.crimson[c]);
      const sh = [bx + 4, sy], el = [[bx + 1, sy + 6], [bx + 4, sy + 6], [bx + 7, sy + 5]][frame];
      s.limb([sh, el, gr], 4.0, 3.4, (t, sd) => C[sd < 0 ? 4 : 2]);
      s.ell(gr[0], gr[1] - 0.5, 1.6, 1.6, K, { lo: 1, hi: 3 });
    } else if (sit) {
      // an arm out to the left, a cup in hand, steam off it
      s.limb([[ox - 2, sy + 1], [ox - 6, sy + 5], [ox - 6, sy + 8]], 3.6, 3.2, (t, sd) => C[sd < 0 ? 4 : 1]);
      s.ell(ox - 6.5, sy + 9, 1.8, 2.0, HART.iron, { lo: 1, hi: 4 });
      if (frame === 0) { s.px(ox - 7, sy + 5, '#5e5a52'); s.px(ox - 8, sy + 3, '#46443e'); }
      else { s.px(ox - 6, sy + 4, '#46443e'); s.px(ox - 7, sy + 2, '#5e5a52'); }
    }
    return hartDone(s, ox, by);
  });
}

// ---------------------------------------------------------------------------
// What's set down by the modules: Charter supply containers stacked neatly
// (stack1, stack2, stack3: one, two, three), and a pennant on a mast, the
// Charter's blue with its seed-star. Each a kind here; HUB_DRESSING (hub.js)
// places them.
// ---------------------------------------------------------------------------
// One container into s, its front's lower left at x, y: w wide, h high
// (its face), its top seen above it.
function hartContainer(s, x, y, w, h, seed) {
  const Hu = HART.hull, CB = HART.charter;
  hartBlock(s, x, x + w - 1, y - h - 4, y - h, y, CB, seed, 1);
  for (let k = x + 3; k < x + w - 2; k += 4) for (let j = y - h + 2; j < y - 1; j++) s.px(k, j, CB[1]);
  for (const j of [y - h + 1, y - 1]) for (let i = x + 1; i < x + w - 1; i++) s.px(i, j, Hu[2]);
  s.px(x + w - 4, y - (h >> 1), HART.amber[2]);
  for (let i = x + 2; i < x + 6; i++) s.px(i, y - h + 3, HART.mark[1]);
}
function hartProp(kind) {
  return hartKeep('prop' + kind, () => {
    let s, ax, ay;
    if (kind === 'stack1' || kind === 'stack2' || kind === 'stack3') {
      const n = Number(kind[5]);
      s = new PntSpr(n === 3 ? 34 : 20, n === 1 ? 20 : 34, 1401 + n);
      if (n === 3) { hartContainer(s, 1, 33, 16, 10, 1402); hartContainer(s, 17, 33, 16, 10, 1403); hartContainer(s, 9, 19, 16, 10, 1404); ax = 17; ay = 33; }
      else if (n === 2) { hartContainer(s, 1, 33, 18, 10, 1405); hartContainer(s, 3, 19, 14, 10, 1406); ax = 10; ay = 33; }
      else { hartContainer(s, 1, 19, 18, 10, 1407); ax = 10; ay = 19; }
    } else if (kind === 'pennant') {
      // a mast, a long pennant of the Charter's blue, the seed-star on it
      s = new PntSpr(16, 52, 1440);
      const Hu = HART.hull, CB = HART.charter;
      for (let y = 1; y <= 49; y++) { s.px(2, y, Hu[y < 10 ? 6 : 5]); s.px(3, y, Hu[2]); }
      s.px(2, 0, HART.amber[2], true);
      for (let x = 2; x <= 13; x++) s.px(x, 3, Hu[5]);
      hartStrokes(s, 4, 4, 13, 28, (x, y) => (y > 24 && Math.abs(x - 8.5) < (y - 24) * 1.2 ? null : 0.62 - (x - 4) * 0.035 - (y - 4) * 0.008), CB, 1441);
      hartSeedStar(s, 8, 11, true);
      for (let x = 4; x <= 13; x++) s.px(x, 18, HART.amber[1]);
      s.box(0, 48, 5, 50, Hu, { lo: 0, hi: 3 });
      ax = 3; ay = 50;
    }
    return hartDone(s, ax, ay);
  });
}

// ---------------------------------------------------------------------------
// The outpost's buildings (structures.js), each a Charter module set down
// on its plot once it's built at the forge, in the same make as the
// stations: gunmetal, the Charter's blue panels, amber trim lights and the
// pale gold seed-star. Each names its starstone spots (stone) and the
// points its lights and moving parts are drawn at. Feet on row FY.
// ---------------------------------------------------------------------------
// A plinth: a clean gunmetal step from x0 to x1, top at y0, its foot at
// FY, an amber line along its top.
function hartPlinth(s, x0, x1, y0, FY, seed) {
  const Hu = HART.hull, Am = HART.amber;
  hartStrokes(s, x0, y0, x1, FY, (x, y) => (y === y0 ? 0.9 : 0.34 - (x - x0) * 0.004 - (y - y0) * 0.02), Hu, seed, { jit: 0.1 });
  for (let x = x0; x <= x1; x++) { s.px(x, y0 + 1, x % 4 ? Am[1] : Am[0]); s.px(x, FY, Hu[0]); }
  for (let y = y0; y < FY; y++) { s.px(x0, y, Hu[5]); s.px(x1, y, Hu[1]); }
}
// A panel of a ramp on a face (x0..x1, y0..y1), lit from the left, its
// seams dark and its top lit.
function hartPanel(s, x0, x1, y0, y1, ramp, seed) {
  const n = ramp.length - 1;
  hartStrokes(s, x0, y0, x1, y1, (x, y) => 0.6 - (x - x0) / Math.max(1, x1 - x0) * 0.3 - (y - y0) * 0.006, ramp, seed, { jit: 0.12 });
  for (let x = x0; x <= x1; x++) { s.px(x, y0, ramp[n]); s.px(x, y1, ramp[1]); }
  for (let y = y0; y <= y1; y++) { s.px(x0, y, ramp[n - 1]); s.px(x1, y, ramp[0]); }
}
// The amber trim light under a lip, in short lit lengths.
function hartTrim(s, x0, x1, y) {
  for (let x = x0; x <= x1; x++) s.px(x, y, x % 7 < 5 ? HART.amber[x < (x0 + x1) / 2 ? 3 : 2] : HART.hull[1], x % 7 < 5);
}

// The Drone Bay: Wick's hangar. A low module, its roller door half up over
// a dark bay where a charging cradle glows Wick's violet; a landing ring
// lit amber on its roof, a docking arm over it, and a mast with a blinking
// light (beacon). Points: cradle (the glow), beacon.
function hartBay() {
  return hartKeep('bay', () => {
    const W = 64, H = 56, FY = 53, s = new PntSpr(W, H, 2101), Hu = HART.hull, CB = HART.charter, St = HART.steel, Am = HART.amber;
    const xl = 6, xr = 57, top = 16, lip = 24, foot = FY - 6, V = ['#2a1a44', '#4a2e78', '#7a54b4', '#c9a2ff', '#efe0ff'];
    // the mast at the back right, its lamp drawn over
    for (let y = 2; y <= top + 2; y++) { s.px(52, y, Hu[y < 6 ? 6 : 5]); s.px(53, y, Hu[2]); }
    for (const y of [6, 10]) { s.px(50, y, Hu[4]); s.px(51, y, Hu[5]); s.px(54, y, Hu[2]); s.px(55, y, Hu[1]); }
    s.box(51, 1, 54, 2, Hu, { lo: 1, hi: 4 });
    // the body: its roof and its face
    hartBlock(s, xl, xr, top, lip, foot, Hu, 2102, 3);
    // the landing ring on the roof: a disc of deck plates, its rim lit
    // amber in short lengths, the seed-star in it
    s.ell(31, 20, 12, 3.2, St, { lo: 1, hi: 3, bias: 0.1, jit: 0.1 });
    for (let a = 0; a < 48; a++) { const t = a / 48 * Math.PI * 2, x = 31 + Math.cos(t) * 11.5, y = 20 + Math.sin(t) * 3; if (a % 4 !== 3) s.px(x, y, Math.sin(t) > 0 ? Am[2] : Am[1], a % 4 === 0); }
    hartSeedStar(s, 31, 20, false);
    // the docking arm, folded back over the roof at the left
    hartLine(s, [9, top + 1], [13, 7], Hu[5]); hartLine(s, [10, top + 1], [14, 7], Hu[2]);
    hartLine(s, [13, 7], [22, 9], Hu[5]); hartLine(s, [13, 8], [22, 10], Hu[2]);
    s.box(21, 8, 25, 11, Hu, { lo: 1, hi: 5 });
    s.px(23, 12, V[3], true);
    // the face: the Charter's blue either side of the bay
    hartPanel(s, xl + 1, 17, lip + 2, foot - 1, CB, 2103);
    hartPanel(s, 46, xr - 1, lip + 2, foot - 1, CB, 2104);
    hartSeedStar(s, 12, lip + 9, true);
    for (let x = 9; x <= 15; x++) { s.px(x, lip + 15, HART.mark[0]); s.px(x, lip + 17, HART.mark[0]); }
    // the status lights by the bay
    for (let y = lip + 5; y <= lip + 12; y++) for (let x = 49; x <= 54; x++) s.px(x, y, y === lip + 5 || x === 49 ? Hu[1] : '#07080b');
    for (const [x, y, c] of [[50, lip + 7, '#6cff9a'], [52, lip + 7, V[3]], [50, lip + 9, '#62f0ff'], [53, lip + 10, Am[2]]]) s.px(x, y, c, true);
    // the bay: a dark mouth, the door's slats rolled half up over it
    for (let y = lip + 2; y <= foot; y++) for (let x = 19; x <= 44; x++) s.px(x, y, y < lip + 11 ? Hu[(y - lip) % 3 === 0 ? 1 : x < 30 ? 4 : 3] : '#06050a');
    for (let x = 19; x <= 44; x++) { s.px(x, lip + 1, Hu[6]); s.px(x, lip + 11, Hu[0]); }
    for (let y = lip + 1; y <= foot; y++) { s.px(18, y, Hu[5]); s.px(45, y, Hu[1]); }
    // inside, the charging cradle: a ring on the floor glowing violet, a
    // spare drone shell resting on it, cables up the back wall
    for (let y = lip + 12; y <= foot - 1; y++) for (let x = 20; x <= 43; x++) s.px(x, y, (x + y) % 9 === 0 ? '#0e0c16' : '#08070d');
    for (let a = 0; a < 32; a++) { const t = a / 32 * Math.PI * 2, x = 31.5 + Math.cos(t) * 7, y = foot - 2.5 + Math.sin(t) * 1.6; s.px(x, y, Math.sin(t) > 0 ? V[3] : V[2], true); }
    s.ell(31.5, foot - 6, 4.2, 3.6, ['#07080c', '#0f121a', '#1a1f2a', '#2a3242', '#46526a'], { lo: 0, hi: 4, jit: 0.1 });
    for (let x = 28; x <= 35; x++) s.px(x, foot - 6, '#04060a');
    s.px(30, foot - 6, '#3a5a64'); s.px(31, foot - 6, '#3a5a64');
    for (const cx of [23, 40]) for (let y = lip + 12; y <= foot - 3; y++) s.px(cx + ((y >> 2) & 1), y, '#141826');
    // the trim light under the lip; hazard chevrons along the plinth
    hartTrim(s, xl + 1, xr - 1, lip + 1 - 1);
    hartPlinth(s, xl - 3, xr + 3, foot, FY, 2105);
    for (let y = foot + 2; y <= FY - 1; y++) for (let x = 19; x <= 44; x++) s.px(x, y, ((x + y) >> 1) % 2 ? Am[1] : '#1c1408');
    return hartDone(s, 32, FY, { cradle: { x: 31.5, y: foot - 3 }, beacon: { x: 52, y: 0 }, stone: [[xl - 3, FY, -1], [xr + 4, FY, 1], [xr - 1, lip, 1], [xl + 1, lip, -1]] });
  });
}

// The Refinery: two tall tanks of steel banded in gunmetal, piped into a
// smelter whose hopper takes the old ore at its top; a sight-glass in its
// face shows the melt glowing, a chimney at its back; refined bars
// stacked by its foot. Points: glass, stack (the chimney's mouth).
function hartRefinery() {
  return hartKeep('refinery', () => {
    const W = 66, H = 64, FY = 61, s = new PntSpr(W, H, 2201), Hu = HART.hull, CB = HART.charter, St = HART.steel, Am = HART.amber, F = HART.fire;
    const foot = FY - 5;
    // a tank: a cylinder lit on its left, a domed cap, dark bands round it
    const tank = (x0, x1, y0, seed) => {
      const cx = (x0 + x1) / 2, rx = (x1 - x0) / 2;
      hartStrokes(s, x0, y0, x1, foot, (x) => { const u = (x - cx) / rx; return 0.78 - (u + 1) * 0.32 - Math.max(0, -u - 0.75) * 0.6; }, St, seed, { jit: 0.1 });
      s.ell(cx, y0, rx + 0.4, 2.6, St, { lo: 2, hi: 5, bias: 0.15, jit: 0.1 });
      for (const y of [y0 + 7, Math.round((y0 + foot) / 2) + 2, foot - 5]) for (let x = x0; x <= x1; x++) { s.px(x, y, Hu[x < cx ? 3 : 1]); s.px(x, y + 1, Hu[0]); }
      for (let y = y0 + 2; y <= foot; y++) s.px(x1, y, St[0]);
    };
    // the chimney at the back right, louvred, capped
    hartStrokes(s, 52, 6, 57, 30, (x) => 0.72 - (x - 52) * 0.1, Hu, 2202, { jit: 0.1 });
    for (let y = 7; y <= 30; y++) { s.px(52, y, Hu[6]); s.px(57, y, Hu[1]); }
    for (let y = 10; y <= 22; y += 3) for (let x = 53; x <= 56; x++) s.px(x, y, Hu[1]);
    s.box(51, 3, 58, 5, Hu, { lo: 2, hi: 6 });
    for (let x = 53; x <= 56; x++) s.px(x, 4, '#050506');
    s.px(55, 4, F[1], true);
    // the tanks, the bigger behind
    tank(4, 17, 12, 2203);
    tank(17, 27, 20, 2204);
    // the smelter: its top, the hopper on it, and its face
    hartBlock(s, 28, 61, 28, 35, foot - 1, Hu, 2205, 3);
    s.poly([[35, 15], [53, 15], [49, 29], [39, 29]], (x, y) => Hu[clamp(Math.round(4.6 - (x - 35) * 0.13 - (y - 15) * 0.05 + (artHash(x >> 1, y, 2206) - 0.5) * 0.6), 1, 6)]);
    for (let x = 35; x <= 53; x++) s.px(x, 15, Hu[6]);
    s.ell(44, 15, 8.5, 2, ['#07080b', '#0e1015', '#15181e'], { lo: 0, hi: 2, jit: 0.1 });
    // old ore heaped in its mouth: the Rim's and the Choir's
    for (const [x, y, id] of [[40, 14, 'ferrite'], [43, 13, 'lumenite'], [46, 14, 'ferrite'], [44, 15, 'resonite'], [48, 15, 'lumenite'], [41, 16, 'resonite']]) { const r = ART.ores[id]; s.px(x, y, r[1]); s.px(x + 1, y, r[2]); s.px(x, y - 1, r[3], true); }
    // the face: the Charter's blue at the right, the sight-glass, gauges
    hartPanel(s, 52, 60, 37, foot - 2, CB, 2207);
    hartSeedStar(s, 56, 43, true);
    for (let y = 38; y <= 46; y++) for (let x = 33; x <= 49; x++) {
      const edge = y === 38 || y === 46 || x === 33 || x === 49;
      s.px(x, y, edge ? (y === 38 || x === 33 ? Hu[1] : Hu[5]) : y < 41 ? F[3] : y < 44 ? F[2] : F[1], !edge);
    }
    for (let x = 35; x <= 47; x += 3) s.px(x, 40, F[4], true);
    s.px(36, 39, '#fff6dc', true);
    for (const gx of [35, 41]) { s.ell(gx + 1.5, 51, 2, 2, St, { lo: 1, hi: 5 }); s.px(gx + 2, 50, '#d85c18'); }
    hartTrim(s, 29, 60, 36);
    // the pipes from the tanks into the smelter
    const PP = ['#0b0c10', '#1c212a', '#3c4452'];
    hartHose(s, [14, 27], [24, 18], [30, 33], 2, PP);
    hartHose(s, [25, 34], [28, 30], [31, 40], 2, PP);
    // the plinth, and refined bars stacked at its right foot
    hartPlinth(s, 2, 63, foot, FY, 2208);
    for (const [x, y] of [[57, foot - 2], [61, foot - 2], [59, foot - 4]]) for (let i = 0; i < 4; i++) { s.px(x + i, y, i < 2 ? HART.star[5] : HART.star[4]); s.px(x + i, y + 1, HART.star[2]); }
    return hartDone(s, 33, FY, { glass: { x: 41, y: 42 }, stack: { x: 55, y: 2 }, stone: [[2, FY, -1], [63, FY, 1], [17, 12, -1], [61, 34, 1]] });
  });
}

// The Forward Relay: a tapering pylon of gunmetal on a block of the
// Charter's blue, a gold conduit up its face; vanes splayed at its head,
// and in a cage at its top a crystal of the star's metal that carries its
// light out to the spires. A collar of amber lamps round its middle.
// Points: crystal (its heart), lamps.
function hartRelay() {
  return hartKeep('relay', () => {
    const W = 50, H = 80, FY = 77, s = new PntSpr(W, H, 2301), Hu = HART.hull, CB = HART.charter, Am = HART.amber, G = HART.star, lamps = [];
    const cx = 24, foot = FY - 4, base = 58;
    // the base block, the Charter's blue, and the plinth
    hartBlock(s, 4, 44, base, base + 5, foot, CB, 2302, 2);
    for (let x = 5; x <= 43; x++) s.px(x, base + 9, CB[1]);
    hartSeedStar(s, 10, base + 11, false);
    for (const x of [33, 36, 39]) { s.px(x, base + 11, x === 33 ? Am[2] : '#62f0ff', true); }
    hartTrim(s, 5, 43, base + 6);
    hartPlinth(s, 1, 47, foot, FY, 2303);
    // the pylon: wider at its foot, lit on its left
    s.poly([[cx - 7, base + 2], [cx - 3, 16], [cx + 3, 16], [cx + 7, base + 2]], (x, y) => {
      const half = 3 + (y - 16) / (base + 2 - 16) * 4, u = (x + 0.5 - cx) / half;
      return Hu[clamp(Math.round(5.2 - (u + 1) * 2 + (artHash(x, y >> 1, 2304) - 0.5) * 0.7), 1, 6)];
    });
    // the conduit up its face, glowing the star's gold, brighter up top
    for (let y = 18; y <= base; y++) s.px(cx - 1, y, y < 30 ? G[5] : y < 44 ? G[4] : G[3], true);
    // the collar, its lamps
    s.ell(cx, 38, 8.5, 2.2, Hu, { lo: 1, hi: 5, bias: 0.1, jit: 0.1 });
    for (const dx of [-6, -2, 2, 6]) { s.px(cx + dx, 39, Am[2], true); lamps.push([cx + dx, 39]); }
    // the vanes at its head, splayed out and up
    for (const sd of [-1, 1]) {
      s.poly([[cx + sd * 3, 22], [cx + sd * 13, 12], [cx + sd * 14, 15], [cx + sd * 3, 27]], (x, y) => Hu[sd < 0 ? (y < 18 ? 5 : 4) : (y < 18 ? 3 : 2)]);
      hartLine(s, [cx + sd * 3, 22], [cx + sd * 13, 12], sd < 0 ? Hu[6] : Hu[4]);
      s.px(cx + sd * 13, 13, Am[2], true); lamps.push([cx + sd * 13, 13]);
    }
    // the cage at the top, and the crystal in it
    hartCrystal(s, cx, 2, 0, 15, 4.4, 0.45);
    for (const dx of [-5, 5]) for (let y = 3; y <= 16; y++) s.px(cx + dx, y, dx < 0 ? Hu[5] : Hu[2]);
    for (let x = cx - 5; x <= cx + 5; x++) { s.px(x, 2, Hu[5]); s.px(x, 16, Hu[3]); }
    return hartDone(s, cx, FY, { crystal: { x: cx, y: 9 }, lamps, stone: [[1, FY, -1], [47, FY, 1], [4, base + 4, -1], [44, base + 4, 1]] });
  });
}

// The Settlers' Quarters: a long habitat module with a second stacked on
// its roof, a stair up the side to the upper door, warm windows (lamps), an
// awning over the lower door, a pennant on the roof, and a planter of the
// settlers' beans (they came up purple). Points: lamps.
function hartQuarters() {
  return hartKeep('quarters', () => {
    // (k: its size against the first drawing, 72 × 62, whose door came to
    // the Kindler's knee; every place below is in those units)
    const k = 1.6, K = (v) => Math.round(v * k), W = K(72), H = K(62), FY = K(59), s = new PntSpr(W, H, 2401), Hu = HART.hull, CB = HART.charter, St = HART.steel, Am = HART.amber, lamps = [];
    const win = (x0, y0, w, h) => {
      for (let y = y0; y <= y0 + h; y++) for (let x = x0; x <= x0 + w; x++) {
        const edge = y === y0 || x === x0 || x === x0 + w || y === y0 + h;
        s.px(x, y, edge ? Hu[1] : y > y0 + h - K(2) ? '#d8862c' : (x + y) % 5 === 0 ? '#ffe0a0' : '#ffc060', !edge);
      }
      lamps.push([x0 + (w >> 1), y0 + (h >> 1)]);
    };
    // a habitat box: a pale top rounded at its ends, a blue face
    const hab = (x0, x1, top, lip, foot, seed) => {
      hartStrokes(s, x0, top, x1, lip - 1, (x, y) => { const e = Math.min(x - x0, x1 - x); return e < K(3) - (y - top) * 0.6 / k ? null : 0.78 - (x - x0) / (x1 - x0) * 0.2 - (lip - y) * 0.015 / k; }, St, seed, { jit: 0.1 });
      for (let x = x0 + K(4); x <= x1 - K(4); x += K(12)) for (let y = top + 1; y < lip; y++) s.px(x, y, St[2]);
      hartStrokes(s, x0, lip, x1, foot, (x, y) => { const e = Math.min(x - x0, x1 - x); return e < K(2) - Math.min(K(2), (y - lip) * 0.5) ? null : 0.55 - (x - x0) / (x1 - x0) * 0.32 - (y - lip) * 0.005 / k; }, CB, seed + 1, { jit: 0.12 });
      for (let x = x0 + 1; x <= x1 - 1; x++) { s.px(x, lip, St[4]); s.px(x, foot, CB[0]); s.px(x, lip + K(3), CB[1]); }
      for (let y = lip + 1; y < foot; y++) { s.px(x0 + 1, y, CB[5]); s.px(x1 - 1, y, CB[1]); }
    };
    // the upper module, set back on the lower's roof; its pennant
    for (let y = 1; y <= K(18); y++) { s.px(K(56), y, Hu[y < K(6) ? 6 : 5]); s.px(K(56) + 1, y, Hu[2]); }
    s.px(K(56), 0, Am[2], true);
    hartStrokes(s, K(58), K(2), K(66), K(9), (x, y) => (y > K(7) && Math.abs(x - K(62)) < (y - K(7)) * 1.5 ? null : 0.62 - (x - K(58)) * 0.04 / k), CB, 2402);
    s.px(K(61), K(5), HART.mark[2]); s.px(K(61) + 1, K(5), HART.mark[3]);
    hab(K(16), K(58), K(10), K(18), K(33), 2403);
    win(K(22), K(22), K(10), K(6)); win(K(36), K(22), K(10), K(6));
    for (let y = K(22); y < K(33); y++) for (let x = K(50); x <= K(55); x++) s.px(x, y, x === K(50) || y === K(22) ? Hu[5] : x === K(55) ? Hu[1] : Hu[2 + ((y >> 2) & 1)]);
    s.px(K(54), K(28), Am[2], true);
    // the lower module, longer, in front
    hab(K(3), K(63), K(31), K(38), FY - K(3), 2405);
    win(K(26), K(42), K(9), K(6)); win(K(40), K(42), K(9), K(6));
    // its door, and the awning over it
    for (let y = K(42); y < FY - K(3); y++) for (let x = K(11); x <= K(19); x++) s.px(x, y, x === K(11) || y === K(42) ? Hu[5] : x === K(19) ? Hu[1] : Hu[2 + ((y >> 2) & 1)]);
    s.px(K(18), K(49), Am[2], true);
    const C = HART.canvas;
    hartStrokes(s, K(8), K(38), K(22), K(41), (x, y) => 0.72 - (y - K(38)) * 0.12 / k - (x - K(8)) * 0.01 / k, C, 2406);
    for (let x = K(8); x <= K(22); x++) s.px(x, K(41), x % 3 ? C[1] : C[0]);
    hartSeedStar(s, K(56), K(46), k > 1.3);
    // the stair up the right end to the upper door, its rail
    const steps = Math.round(9 * k);
    for (let q = 0; q <= steps; q++) { const x = K(66) - q * 1.2, y = FY - 2 - q * 2.6; for (let i = 0; i < K(4); i++) s.px(x + i - K(2), y, i < K(2) ? Hu[5] : Hu[3]); s.px(x - K(2), y + 1, Hu[1]); }
    hartLine(s, [K(68), FY - K(8)], [K(57), K(24)], Hu[4]); hartLine(s, [K(68), FY - 2], [K(68), FY - K(8)], Hu[3]);
    // the skids under it
    for (let x = K(4); x <= K(62); x++) s.px(x, FY - 2, x < K(30) ? Hu[3] : Hu[2]);
    for (let x = K(4); x <= K(66); x++) s.px(x, FY - 1, Hu[0]);
    // the planter of beans, by the door
    hartStrokes(s, 1, FY - K(5), K(9), FY - 1, (x, y) => (y === FY - K(5) ? 0.85 : 0.4 - (x - 1) * 0.02 / k), HART.wood, 2407);
    const BE = ['#2a1438', '#4a2266', '#7a3ca0', '#b070d8'];
    for (const [x, h] of [[2, 4], [4, 6], [6, 5], [8, 3], [10, 5], [12, 4]]) { if (x >= K(9)) continue; for (let j = 1; j <= K(h); j++) { s.px(x + ((j & 1) ? 0 : 1), FY - K(5) - j, j === K(h) ? BE[3] : BE[1 + (j % 2)]); if (j === K(h) - 1) s.px(x - 1, FY - K(5) - j, '#3e6a2c'); } }
    return hartDone(s, K(34), FY, { lamps, stone: [[1, FY, -1], [K(69), FY, 1], [K(63), K(37), 1], [K(16), K(17), -1]] });
  });
}
// Each building's sprite by its id.
function structureSprite(id) { return { bay: hartBay, refinery: hartRefinery, relay: hartRelay, quarters: hartQuarters }[id](); }
