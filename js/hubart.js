'use strict';
// ---------------------------------------------------------------------------
// The outpost, painted (docs/PAINTED.md): the stations, the star and its
// lodelines, the lanterns, the tents, the settlers and the smith, and the
// things lying about the plaza. Each is built once with the sprite painter
// (PntSpr) and hartStrokes, short horizontal strokes of a few close tones
// lit from the upper left, with no outline; only lamps, runes, the forge's
// crucible and the star glow. hub.js and story.js place and draw them. Every
// helper here is named hart…; numbers are in T.paint.hub.
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
  // the forge's lander hull, its heat shield, and the ancient forges' weathered
  // plates, their rust and verdigris, and their cold glow
  steel: ['#1a1e26', '#2c323e', '#454d5c', '#647084', '#8e9aae', '#b4c0d0'],
  livery: ['#3a3a36', '#5a5850', '#7e7a6c', '#a49e8a'],
  hull: ['#08090d', '#10131a', '#1a1e27', '#262c37', '#363e4c', '#4c5666', '#6a7688'],
  scorch: ['#0a0706', '#140e0b', '#20160f', '#2e2014', '#44301c', '#624426'],
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
  if (!s) { s = make(); _hartKept.set(key, s); }
  return s;
}
function hartDone(s, ax, ay, extra) {
  const o = s.done();
  o.ax = ax; o.ay = ay;
  return Object.assign(o, extra || {});
}

// ---------------------------------------------------------------------------
// The forge: a foundry built into the hull of a lander that came down here.
// A squat cone of gunmetal plates on its scorched heat shield, one landing
// leg still out, an exhaust stack and a hatch on its top, and in its face a
// round glass port with the induction crucible glowing behind it (drawn
// over each frame, hartForgeFire, its middle at HART_MOUTH), a panel of
// status lights, coolant pipes into the ground. To its left a hydraulic
// press on a C-frame over a forging bed; its ram is drawn on its own
// (hartPressRam), the bed's face at HART_ANVIL. Feet on row 61.
// ---------------------------------------------------------------------------
const HART_MOUTH = { x: 42, y: 44, r: 7.3 }; // the port's middle, and the glass's radius
const HART_ANVIL = { x: 9, y: 42 }; // the work on the bed, where the ram lands
const HART_RAM = { x: 3, y: 28, travel: 9 }; // where the ram hangs, raised, and how far it comes down
const HART_LEDS = [[54, 39, '#6cff9a'], [56, 39, '#ffb030'], [54, 41, '#62f0ff']]; // the status lights (the first blinks)
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
function hartForge() {
  return hartKeep('forge', () => {
    const W = 68, H = 64, FY = 61, s = new PntSpr(W, H, 501), Hu = HART.hull, I = HART.iron, Sc = HART.scorch, M = HART_MOUTH;
    // the hull: a cone cut off flat, its face from the lip of its top down
    // to the heat shield, lit on its left
    const cx = 42, top = 30, foot = 55, xl = (y) => 27 - (y - top) * 5 / (foot - top), xr = (y) => 57 + (y - top) * 5 / (foot - top);
    const capRx = 15.5, capRy = 4.2, capFront = (x) => top + capRy * Math.sqrt(Math.max(0, 1 - ((x + 0.5 - cx) / capRx) ** 2));
    // one landing leg still out, to the right, behind the hull
    hartLine(s, [58, 41], [65, 58], Hu[5]); hartLine(s, [59, 41], [66, 58], Hu[3]); hartLine(s, [59, 42], [66, 59], Hu[1]);
    s.box(61, 48, 63, 51, Hu, { lo: 2, hi: 6 });
    s.ell(65.5, 60, 2.6, 1.3, Hu, { lo: 1, hi: 5, bias: 0.15 });
    // the press: a column at the back of the bed, an arm over it, the
    // cylinder hanging from the arm's end (its ram is drawn over)
    hartStrokes(s, 15, 12, 19, 44, (x, y) => 0.5 - (x - 15) * 0.09 - (y - 12) * 0.003, Hu, 502, { jit: 0.12 });
    for (let y = 12; y <= 44; y++) s.px(15, y, Hu[y < 30 ? 6 : 5]);
    s.poly([[15, 16], [15, 23], [10.5, 16]], (x, y) => Hu[x < 13 ? 3 : 2]);
    hartStrokes(s, 2, 9, 19, 10, (x) => 0.82 - x * 0.012, Hu, 503);
    hartStrokes(s, 2, 11, 19, 15, (x, y) => 0.4 - (x - 2) * 0.008 - (y - 11) * 0.03, Hu, 504, { jit: 0.12 });
    for (let x = 2; x <= 19; x++) { s.px(x, 9, x < 9 ? Hu[6] : Hu[5]); s.px(x, 16, Hu[1]); }
    for (let y = 12; y <= 14; y++) for (let x = 3; x <= 13; x++) s.px(x, y, ((x + y) >> 1) % 2 ? (x < 8 ? '#a8701e' : '#8a5c16') : '#1c1408');
    const St = HART.steel;
    hartStrokes(s, 4, 17, 13, 26, (x) => 0.85 - Math.abs(x - 6) * 0.1, St, 505, { jit: 0.1 });
    for (let x = 4; x <= 13; x++) { s.px(x, 19, St[1]); s.px(x, 20, x < 8 ? St[5] : St[3]); s.px(x, 24, St[1]); }
    hartStrokes(s, 6, 27, 11, 27, (x) => 0.6 - (x - 6) * 0.08, Hu, 506);
    // its hydraulic line, looping up off the arm and down to the hull
    hartHose(s, [6, 8], [18, -6], [28, 29], 2, ['#0b0c10', '#14161c', '#2c313b']);
    // the hull's top, seen from above: a disc, its front lip lit
    hartStrokes(s, cx - 16, top - 5, cx + 16, top + 5, (x, y) => (((x + 0.5 - cx) / capRx) ** 2 + ((y + 0.5 - top) / capRy) ** 2 <= 1 ? 0.74 - (x - cx) * 0.014 - (y - top) * 0.02 : null), Hu, 507, { jit: 0.12 });
    // a hatch on it, a ring of bolts
    s.ell(47.5, 29.6, 5.2, 1.9, Hu, { lo: 2, hi: 6, bias: 0.12 });
    for (let x = 43; x <= 52; x++) s.px(x, 31, Hu[1]);
    // the exhaust stack at its back, sooted round its mouth
    hartStrokes(s, 31, 11, 36, 28, (x, y) => 0.74 - (x - 31) * 0.1 - (y < 14 ? 0.25 : 0), Hu, 508, { jit: 0.1 });
    for (let y = 12; y <= 28; y++) s.px(31, y, Hu[y < 15 ? 3 : 5]);
    for (const y of [17, 21]) for (let x = 31; x <= 36; x++) { s.px(x, y, Hu[0]); s.px(x, y + 1, x < 33 ? Hu[5] : Hu[3]); }
    s.ell(33.5, 11, 3.6, 1.4, Hu, { lo: 2, hi: 5 });
    for (let x = 32; x <= 35; x++) s.px(x, 11, '#050506');
    s.px(33, 11, HART.fire[1], true);
    // status lights on the stack and the press's column
    s.px(34, 25, '#ffb030', true); s.px(17, 32, '#6cff9a', true); s.px(17, 34, '#3a1010');
    for (let x = 31; x <= 36; x++) s.px(x, 29, Hu[1]);
    // the face: plates either side of the port, their seams riveted,
    // soot streaked up from the heat shield
    const seamA = (y) => Math.round(xl(y) + (xr(y) - xl(y)) * 0.18), seamB = (y) => Math.round(xl(y) + (xr(y) - xl(y)) * 0.82);
    const face = (x, y) => {
      if (y < top || y > foot - 1 || x < Math.round(xl(y)) || x > Math.round(xr(y)) || y < capFront(x)) return null;
      const u = (x - xl(y)) / (xr(y) - xl(y)), plate = x < seamA(y) ? 0 : x > seamB(y) ? 2 : 1, side = plate !== 1 && y > 47 ? 1 : 0;
      const soot = y > 49 && artHash(Math.floor(x / 2), 0, 509) < 0.4 ? (y - 49) * 0.05 : 0;
      return 0.7 - u * 0.55 + (artHash(plate, side, 510) - 0.5) * 0.12 - soot;
    };
    hartStrokes(s, 21, top, 63, foot - 1, face, Hu, 511, { jit: 0.13 });
    for (let x = 27; x <= 57; x++) { const y = Math.ceil(capFront(x)); s.px(x, y, x < 40 ? Hu[6] : Hu[5]); }
    for (let y = top + 2; y < foot; y++) {
      s.px(Math.round(xl(y)), y, Hu[y < 44 ? 6 : 5]); s.px(Math.round(xr(y)), y, Hu[1]);
      for (const sx of [seamA(y), seamB(y)]) if (y > capFront(sx) + 1) { s.px(sx, y, Hu[1]); if (y % 3 === 0) s.px(sx + 1, y, Hu[sx < cx ? 5 : 4]); }
    }
    for (let x = 22; x <= 62; x++) if ((x < seamA(48) || x > seamB(48)) && x > xl(48)) { s.px(x, 48, Hu[1]); if (x % 3 === 0) s.px(x, 49, Hu[x < cx ? 5 : 3]); }
    // the lander's livery: a band of pale paint under the lip, worn through
    for (let x = 23; x <= 61; x++) {
      const y0 = Math.ceil(capFront(x)) + 2;
      if (y0 + 1 >= foot || x < xl(y0) || x > xr(y0)) continue;
      const u = (x - xl(y0)) / (xr(y0) - xl(y0));
      for (let j = 0; j < 2; j++) if (artHash(x >> 1, j, 517) > 0.18) s.px(x, y0 + j, HART.livery[clamp(Math.round(3.6 - u * 3.2 - j * 0.6 + (artHash(x, j, 518) - 0.5)), 0, 3)]);
    }
    // the port: a raised bezel lit on its upper left, bolted, round dark glass
    for (let y = M.y - 10; y <= M.y + 10; y++) for (let x = M.x - 10; x <= M.x + 10; x++) {
      const dx = x - M.x, dy = y - M.y, r = Math.hypot(dx, dy);
      if (r <= M.r) s.px(x, y, '#0c0503');
      else if (r <= 8.2) s.px(x, y, -(dx * 0.55 + dy * 0.8) / r > 0.2 ? Hu[0] : Hu[2]);
      else if (r <= 9.9) { const l = -(dx * 0.55 + dy * 0.8) / r; s.px(x, y, Hu[clamp(Math.round(3.4 + l * 2.6 + (artHash(x, y, 512) - 0.5) * 0.8), 1, 6)]); }
    }
    for (let k = 0; k < 8; k++) { const a = (k + 0.5) / 8 * Math.PI * 2, bx = M.x + Math.cos(a) * 9, by = M.y + Math.sin(a) * 9; s.px(bx, by, Math.cos(a) * 0.55 + Math.sin(a) * 0.8 < 0 ? Hu[6] : Hu[4]); }
    // the status panel to its right (its lights are drawn glowing)
    for (let y = 37; y <= 46; y++) for (let x = 53; x <= 57; x++) s.px(x, y, y === 37 || x === 53 ? Hu[0] : '#07080b');
    for (let x = 53; x <= 57; x++) s.px(x, 47, Hu[5]);
    for (const [x, y, c] of HART_LEDS) s.px(x, y, c, true);
    s.px(56, 41, '#3a1010');
    for (let x = 54; x <= 56; x++) s.px(x, 44, x < 56 ? '#1e6a70' : '#0e3a40', true);
    // the heat shield: charred, ablated in streaks, flared a little
    const shield = (x, y) => (y < foot || y > FY || x < 22 - (y - foot) * 0.35 || x > 62 + (y - foot) * 0.35 ? null : 0.36 - (x - 21) * 0.006 - (y - foot) * 0.03 + (artHash(Math.floor(x / 3), y, 513) < 0.2 ? 0.25 : 0));
    hartStrokes(s, 19, foot, 65, FY, shield, Sc, 514, { jit: 0.2 });
    for (let x = 22; x <= 62; x++) { s.px(x, foot, x < cx ? Sc[5] : Sc[4]); s.px(x, FY, Sc[0]); }
    // coolant pipes out of its foot on the right, bending off along the
    // ground (they carry on across the flagstones: drawHubGround)
    const CP = ['#090d12', '#142028', '#2c4250'];
    hartHose(s, [59, 50], [59, 58.5], [67, 59], 2, CP);
    hartHose(s, [56, 53], [56, 60.5], [67, 61], 2, CP);
    s.px(58, 51, Hu[5]); s.px(59, 50, Hu[6]);
    // the bed, in front of the column: a block seen from above and in
    // front, a die on its top, hazard chevrons along its foot
    hartStrokes(s, 1, 41, 17, 45, (x, y) => 0.8 - x * 0.012 - (y - 41) * 0.03, Hu, 515, { jit: 0.12 });
    for (let x = 4; x <= 14; x++) { s.px(x, 43, x < 8 ? Hu[3] : Hu[2]); s.px(x, 44, Hu[1]); }
    hartStrokes(s, 1, 46, 17, 60, (x, y) => 0.36 - (x - 1) * 0.012 - (y - 46) * 0.008, Hu, 516, { jit: 0.12 });
    for (let x = 1; x <= 17; x++) { s.px(x, 46, x < 8 ? Hu[6] : Hu[5]); s.px(x, 41, Hu[4]); s.px(x, 61, Hu[0]); }
    for (let y = 46; y <= 60; y++) s.px(1, y, Hu[4]);
    for (let y = 56; y <= 58; y++) for (let x = 2; x <= 16; x++) s.px(x, y, ((x + y) >> 1) % 2 ? (x < 8 ? '#a8701e' : '#8a5c16') : '#1c1408');
    for (const x of [3, 15]) s.px(x, 50, Hu[5]);
    return hartDone(s, M.x, FY);
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
// The rune bench: a heavy slab of stone on two stout legs, its top carved
// with runes that glow, rune stones laid out on it, a candle.
// ---------------------------------------------------------------------------
function hartRunes() {
  return hartKeep('runes', () => {
    const W = 46, H = 34, FY = 32, s = new PntSpr(W, H, 601), S = HART.stone, glow = ART.pal.arcane[0], gdim = '#6a4c9a';
    // legs
    for (const lx of [5, 34]) {
      hartStrokes(s, lx, 18, lx + 6, FY, (x, y) => 0.3 + (lx + 6 - x) * 0.05 - (y - 18) * 0.008, S, 602 + lx);
      for (let y = 19; y <= FY; y++) s.px(lx, y, S[4]);
      for (let x = lx - 1; x <= lx + 7; x++) s.px(x, FY, S[1]);
    }
    // the slab's top, from above, and its front edge
    hartStrokes(s, 1, 4, 44, 14, (x, y) => (((x === 1 || x === 44) && (y === 4)) ? null : 0.55 + (44 - x) * 0.006 - (y - 4) * 0.012), S, 610);
    for (let x = 2; x <= 43; x++) s.px(x, 4, x < 22 ? S[5] : S[4]);
    hartStrokes(s, 1, 15, 44, 19, (x, y) => (y === 15 ? 0.78 : 0.3 - (y - 15) * 0.05 + (44 - x) * 0.003), S, 611);
    for (let x = 1; x <= 44; x++) s.px(x, 20, S[0]);
    // the runes carved in the top: a ring, and marks either side
    const R = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (let a = 0; a < 16; a++) { const x = Math.round(22 + Math.cos(a / 16 * Math.PI * 2) * 5), y = Math.round(9 + Math.sin(a / 16 * Math.PI * 2) * 3); s.px(x, y, a % 4 ? gdim : glow, a % 4 === 0); }
    s.px(22, 9, glow, true);
    for (const [cx, cy] of [[9, 8], [14, 11], [31, 8], [36, 11]]) { s.px(cx, cy, glow, true); for (const [i, j] of R.slice(0, (cx * 3) % 4 + 1)) s.px(cx + i, cy + j, gdim, true); }
    // rune stones laid on it, and a stub of candle
    const stones = [[39, 7, ART.stones.form.body], [41, 10, ART.stones.glyph.body], [5, 10, ART.stones.ember.body]];
    for (const [x, y, ramp] of stones) s.ell(x, y, 1.8, 1.3, ramp, { lo: 0, hi: 3 });
    s.px(28, 5, '#d8cfb8'); s.px(28, 6, '#a89c80'); s.px(28, 4, '#ffe8a0', true); s.px(28, 3, '#ffb347', true);
    return hartDone(s, 23, FY, { candle: { x: 28, y: 3 } });
  });
}

// ---------------------------------------------------------------------------
// The locker: a tall steel cabinet, two doors with the diver's amber light
// down their inner edges, a narrow side in shadow, the Charter's star on
// its lid.
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
    hartStrokes(s, 2, 7, 23, FY - 1, (x, y) => (x === 13 ? 0.02 : 0.42 + (23 - x) * 0.008 - (y - 7) * 0.004 + (x < 13 ? 0.05 : 0)), I, 704, { jit: 0.12 });
    for (let y = 7; y <= FY - 1; y++) { s.px(2, y, I[5]); s.px(13, y, '#030406'); s.px(14, y, I[1]); }
    // vents near the top, handles, feet
    for (const x0 of [4, 16]) for (let k = 0; k < 3; k++) for (let x = x0; x <= x0 + 6; x++) s.px(x, 10 + k * 2, I[1]);
    for (const x of [11, 16]) { s.px(x, 25, I[5]); s.px(x, 26, I[4]); s.px(x, 27, I[3]); }
    for (const x of [3, 4, 22, 23]) s.px(x, FY, I[0]);
    // the amber light down each door's inner edge
    for (let y = 16; y <= FY - 5; y++) { s.px(11, y, y % 5 ? amb : '#ffe48a', true); s.px(16, y, y % 5 === 2 ? '#ffe48a' : amb, true); }
    // the Charter's star on the lid
    for (const [i, j, c] of [[0, 0, '#ffe48a'], [-1, 0, amb], [1, 0, amb]]) s.px(14 + i, 4 + j, c, true);
    return hartDone(s, 14, FY);
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
    return hartDone(s, 15, FY, { bowl: { x: 14.5, y: 7 } });
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
// The Lodestar itself, over the pit: a great faceted crystal, k its size
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
// The lodelines: one for each magnitude, falling from the star's foot into
// the dark, spreading a little, broken, fading as they go. Four frames of
// the breaks running down. (x, y: the star's foot in the picture)
function hartLodelines(mag, frame) {
  return hartKeep('lode' + mag + '/' + frame, () => {
    const W = 100, H = 96, s = new PntSpr(W, H, 970), c = W >> 1, St = HART.star;
    for (let k = 0; k < mag; k++) {
      const off = (k - (mag - 1) / 2), len = 62 + ((k * 37) % 26), spread = off * 3.2;
      for (let y = 2; y < len; y++) {
        const t = y / len, x = Math.round(c + off * 2 + spread * t * 2.2);
        const gap = artHash(Math.floor((y + frame * 3 + k * 11) / 3), k, 971);
        if (gap < 0.12 + t * t * 0.75) continue;
        s.px(x, y, t < 0.3 ? St[5] : t < 0.65 ? St[4] : St[3], true);
        if (t < 0.4 && artHash(y, k, 972) < 0.3) s.px(x + (off < 0 ? -1 : 1), y, St[2], true);
      }
    }
    return hartDone(s, c, 0);
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
    return hartDone(s, cx, FY - 2, { tip: { x: cx, y: top - 4 }, feed: { x: 10, y: 17 }, screen: { x: 36, y: 57 } });
  });
}

// ---------------------------------------------------------------------------
// The portal at home is portals.js's; its plinth sits on the flagstones.
// ---------------------------------------------------------------------------

// A lantern on its post: a post of dark wood lit on its left, an arm, the
// lamp hanging from it (lit: glass glowing amber; dark: a dark pane), and a
// foot. Lamp at lamp.x, lamp.y.
function hartLantern(lit) {
  return hartKeep('lantern' + lit, () => {
    const W = 12, H = 40, FY = 38, s = new PntSpr(W, H, 1101), Wd = HART.wood, I = HART.iron, St = HART.star;
    for (let y = 3; y <= FY - 2; y++) { s.px(3, y, Wd[y < 12 ? 5 : 4]); s.px(4, y, Wd[2]); }
    s.box(2, FY - 2, 5, FY, HART.stone, { lo: 0, hi: 3 });
    // the arm, and the lamp's hook
    for (let x = 3; x <= 9; x++) s.px(x, 3, x < 6 ? Wd[5] : Wd[4]);
    s.px(4, 4, Wd[3]); s.px(9, 4, I[3]);
    // the lamp: a hood, a frame round the glass, a foot
    for (let x = 7; x <= 11; x++) s.px(x, 5, x < 9 ? I[4] : I[3]);
    s.px(8, 6, I[3]); s.px(9, 6, I[3]); s.px(10, 6, I[2]);
    for (let y = 7; y <= 11; y++) {
      s.px(7, y, I[3]); s.px(11, y, I[1]);
      for (let x = 8; x <= 10; x++) s.px(x, y, lit ? (y === 9 && x === 9 ? St[6] : y > 9 || x === 10 ? St[3] : St[5]) : x === 8 && y === 8 ? '#3a4050' : '#141820', lit);
    }
    for (let x = 7; x <= 11; x++) s.px(x, 12, I[2]);
    return hartDone(s, 4, FY, { lamp: { x: 9, y: 9 } });
  });
}

// A tent of canvas, its ridge running away from us: the gable faces us,
// lit on its left, the flap open on lamplight inside, the flap folded back,
// a pole at the ridge, a guy rope, pegs, and a patch.
function hartTent(v = 0) {
  return hartKeep('tent' + v, () => {
    const W = 50, H = 40, FY = 37, s = new PntSpr(W, H, 1201 + v), C = HART.canvas, cx = 24, top = 5, hw = 21;
    const inGable = (x, y) => y >= top && y <= FY - 1 && Math.abs(x + 0.5 - cx) <= hw * (y - top) / (FY - 1 - top) + 0.5;
    // the roof's two slopes going back, seen above the gable
    for (let y = 1; y <= top; y++) { s.px(cx, y, C[5]); s.px(cx - 1, y + 1, C[4]); s.px(cx + 1, y + 1, C[2]); }
    // the gable: lighter to the left
    hartStrokes(s, cx - hw, top, cx + hw, FY - 1, (x, y) => (inGable(x, y) ? 0.66 - (x - cx + hw) / (2 * hw) * 0.5 + (y - top) * 0.004 : null), C, 1203 + v, { jit: 0.22 });
    for (let y = top; y <= FY - 1; y++) { const w = hw * (y - top) / (FY - 1 - top); s.px(Math.round(cx - w), y, C[5]); s.px(Math.round(cx + w), y, C[1]); }
    // the flap open: dark, and the lamp's light inside
    const ft = top + 12, fw = 9;
    for (let y = ft; y <= FY - 1; y++) {
      const w = fw * (y - ft) / (FY - 1 - ft);
      for (let x = Math.round(cx - w); x <= Math.round(cx + w); x++) {
        const edge = x <= Math.round(cx - w) || x >= Math.round(cx + w), h = artHash(x, y, 1210 + v);
        const k = (y - ft) / (FY - 1 - ft) + (h - 0.5) * 0.25, warm = Math.abs(x - cx) < w * 0.6 && k > 0.55;
        s.px(x, y, edge ? C[0] : !warm ? (k > 0.35 ? '#24160c' : '#120a06') : k > 0.85 ? '#ffc060' : k > 0.7 ? '#d8862c' : '#7a4818', warm);
      }
    }
    // the flap folded back to the right
    for (let y = ft + 2; y <= FY - 2; y++) { const w = fw * (y - ft) / (FY - 1 - ft); s.px(Math.round(cx + w) + 1, y, C[4]); s.px(Math.round(cx + w) + 2, y, C[3]); }
    // the pole, a guy rope off the ridge to a peg, pegs at the corners
    for (let y = top - 3; y <= FY; y++) s.px(cx, y, y < ft ? HART.wood[4] : HART.wood[2]);
    for (let i = 0; i <= 16; i++) s.px(cx + hw + 2 + Math.round(i * 0.3), top + 6 + i + (i > 8 ? 1 : 0), C[1]);
    for (const x of [cx - hw - 1, cx + hw + 1, cx + hw + 7]) { s.px(x, FY, HART.wood[3]); s.px(x, FY - 1, HART.wood[4]); }
    // a patch on the lit side
    for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1], [2, 1]]) s.px(cx - 11 + i, FY - 10 + j, v % 2 ? HART.crimson[2] : '#4a5640');
    return hartDone(s, cx, FY, { lamp: { x: cx, y: FY - 4 } });
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
// The plaza's dressing: supply crates, barrels and sacks, a banner with the
// seed-star, a fire ring with a log, cables on the ground. Each is a kind
// here; HUB_DRESSING (hub.js) places them.
// ---------------------------------------------------------------------------
function hartProp(kind) {
  return hartKeep('prop' + kind, () => {
    let s, ax, ay;
    const Wd = HART.wood, I = HART.iron;
    if (kind === 'crate' || kind === 'crate2') {
      // a crate seen from above and in front: a lid, slats, a stencil
      const big = kind === 'crate', w = big ? 16 : 12, h = big ? 15 : 12, top = big ? 5 : 4;
      s = new PntSpr(w + 2, h + 1, 1401 + w);
      hartStrokes(s, 1, 0, w, top - 1, (x, y) => 0.7 - x * 0.012, Wd, 1402 + w);
      hartStrokes(s, 1, top, w, h - 1, (x, y) => ((y - top) % 4 === 3 ? 0.12 : 0.42 - (x / w) * 0.18), Wd, 1403 + w);
      for (let y = 0; y < h; y++) { s.px(1, y, Wd[5]); s.px(w, y, Wd[1]); }
      for (let x = 1; x <= w; x++) { s.px(x, top, Wd[5]); s.px(x, h, Wd[0]); }
      if (big) for (const [i, j] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) s.px((w >> 1) + 1 + i, top + 5 + j, '#8a6a3a');
      ax = (w >> 1) + 1; ay = h;
    } else if (kind === 'barrel') {
      s = new PntSpr(12, 16, 1420);
      hartStrokes(s, 1, 2, 10, 14, (x, y) => 0.75 - Math.abs(x - 3.5) * 0.08, Wd, 1421);
      for (const y of [4, 11]) for (let x = 1; x <= 10; x++) s.px(x, y, x < 5 ? I[4] : I[2]);
      s.ell(5.5, 2, 4.6, 1.7, Wd, { lo: 2, hi: 5 });
      s.px(4, 1, Wd[1]); s.px(5, 1, Wd[1]);
      for (let x = 1; x <= 10; x++) s.px(x, 15, Wd[0]);
      ax = 6; ay = 15;
    } else if (kind === 'sacks') {
      s = new PntSpr(18, 11, 1430);
      const SK = ['#1c1810', '#2c2618', '#3e3622', '#52482e', '#6a5e3e'];
      s.ell(5, 6.5, 4.6, 3.8, SK, { lo: 0, hi: 4 });
      s.ell(12, 7, 5, 3.4, SK, { lo: 0, hi: 4 });
      s.ell(8.5, 3.8, 4, 3, SK, { lo: 1, hi: 4, bias: 0.1 });
      s.px(8, 1, SK[1]); s.px(9, 1, SK[2]); s.px(12, 4, SK[1]);
      ax = 9; ay = 10;
    } else if (kind === 'banner') {
      // a pole with a crimson banner, the seed-star sewn on it
      s = new PntSpr(16, 48, 1440);
      const C = HART.crimson;
      for (let y = 1; y <= 46; y++) { s.px(2, y, Wd[y < 10 ? 5 : 4]); s.px(3, y, Wd[2]); }
      s.px(2, 0, '#b89a58'); s.px(3, 0, '#7a6234');
      for (let x = 2; x <= 14; x++) s.px(x, 3, Wd[4]);
      hartStrokes(s, 4, 4, 14, 22, (x, y) => (y === 22 && x % 2 ? null : 0.75 - (x - 4) * 0.04 - (y - 4) * 0.015), C, 1441);
      for (const [i, j] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [0, 2]]) s.px(9 + i, 11 + j, i || j ? '#d88c30' : '#ffe48a');
      s.box(0, 45, 5, 47, HART.stone, { lo: 0, hi: 3 });
      ax = 3; ay = 47;
    } else if (kind === 'firering') {
      // stones in a ring round a bed of embers (its flames are drawn over)
      s = new PntSpr(22, 12, 1450);
      for (let a = 0; a < 10; a++) { const x = 11 + Math.cos(a / 10 * Math.PI * 2) * 8.5, y = 6 + Math.sin(a / 10 * Math.PI * 2) * 3.8; s.ell(x, y, 2, 1.5, HART.stone, { lo: 0, hi: a > 2 && a < 7 ? 5 : 3 }); }
      for (let y = 4; y <= 8; y++) for (let x = 6; x <= 16; x++) if (((x - 11) / 5.5) ** 2 + ((y - 6) / 2.4) ** 2 <= 1) s.px(x, y, artHash(x, y, 1451) < 0.3 ? '#902a0a' : artHash(x, y, 1452) < 0.5 ? '#2a1008' : '#140806', artHash(x, y, 1451) < 0.3);
      ax = 11; ay = 10;
    } else if (kind === 'log') {
      s = new PntSpr(22, 8, 1460);
      s.limb([[2, 4], [19, 4]], 5.4, 5.0, (t, sd) => Wd[sd < 0 ? 5 : sd > 0 ? 1 : 3]);
      s.ell(19.5, 4, 1.6, 2.6, ['#3a2819', '#6a4b30', '#8a6a46'], { lo: 0, hi: 2 });
      ax = 11; ay = 7;
    } else if (kind === 'rack') {
      // a steel rack of tools by the forge: a frame, a pick, a cutting
      // torch on its bottle, a hammer
      s = new PntSpr(16, 28, 1470);
      const Hu = HART.hull;
      for (let y = 4; y <= 27; y++) { s.px(1, y, Hu[y < 12 ? 6 : 5]); s.px(14, y, Hu[2]); }
      for (let x = 1; x <= 14; x++) { s.px(x, 5, x < 7 ? Hu[6] : Hu[5]); s.px(x, 20, Hu[3]); }
      for (let y = 6; y <= 24; y++) { s.px(4, y, Wd[3]); s.px(11, y, Wd[3]); }
      for (let x = 1; x <= 7; x++) s.px(x, 6 + Math.abs(x - 4) * 0.4, I[x < 4 ? 5 : 3]);
      s.box(7, 12, 9, 25, HART.crimson, { lo: 1, hi: 4 });
      s.px(8, 11, I[4]); s.px(8, 10, I[3]); s.px(9, 10, I[3]); s.px(10, 10, '#62f0ff', true);
      s.box(10, 6, 12, 8, I, { lo: 1, hi: 4 });
      ax = 8; ay = 27;
    } else if (kind === 'cart') {
      // a hand cart heaped with ore, its handles down, two wheels
      s = new PntSpr(26, 18, 1490);
      hartStrokes(s, 3, 6, 20, 12, (x, y) => (y === 6 ? 0.85 : 0.45 - (x - 3) * 0.01 - (y - 6) * 0.04), Wd, 1491);
      for (let x = 3; x <= 20; x++) s.px(x, 13, Wd[0]);
      for (let i = 0; i < 6; i++) s.px(20 + i, 10 + (i >> 1), Wd[4]);
      const ores = [[6, 5, HART.star], [10, 4, HART.iron], [14, 5, HART.star], [17, 5, HART.iron], [8, 3, HART.iron], [12, 3, HART.star]];
      for (const [x, y, r] of ores) s.ell(x, y, 2.4, 1.8, r, { lo: 1, hi: r === HART.star ? 4 : 5 });
      s.px(12, 2, HART.star[6], true); s.px(6, 4, HART.star[5], true);
      for (const wx of [6, 17]) { s.ell(wx, 14, 3, 3, Wd, { lo: 0, hi: 3 }); s.px(wx, 14, I[3]); }
      ax = 12; ay = 17;
    }
    return hartDone(s, ax, ay);
  });
}
// A seed-star inlaid in the flagstones, worn: brass lines of an eight-
// pointed star in a ring, flattened as the ground is, broken where feet
// have worn it. Not glowing.
function hartInlay() {
  return hartKeep('inlay', () => {
    const R = 28, W = R * 2 + 3, H = Math.round(R * 1.24) + 3, s = new PntSpr(W, H, 1500), cx = W >> 1, cy = H >> 1, M = ['#201d18', '#2e2a20', '#3e3626', '#524630'];
    const put = (x, y, t) => { const X = Math.round(cx + x), Y = Math.round(cy + y * 0.62); if (artHash(Math.floor(X / 3), Y, 1501) < 0.34) return; s.px(X, Y, M[clamp(t + (artHash(X, Y, 1502) < 0.3 ? -1 : 0), 0, 3)]); };
    for (const r of [R, R - 4]) for (let a = 0; a < 1; a += 1 / (r * 7)) put(Math.cos(a * Math.PI * 2) * r, Math.sin(a * Math.PI * 2) * r, r === R ? 2 : 1);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 - Math.PI / 2, L = k % 2 ? R * 0.55 : R - 6, b0 = a - 0.32, b1 = a + 0.32, r0 = 9;
      for (const b of [b0, b1]) { const x0 = Math.cos(b) * r0, y0 = Math.sin(b) * r0, x1 = Math.cos(a) * L, y1 = Math.sin(a) * L, n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.2); for (let i = 0; i <= n; i++) put(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, k % 2 ? 2 : 3); }
    }
    for (let a = 0; a < 1; a += 1 / 40) put(Math.cos(a * Math.PI * 2) * 4, Math.sin(a * Math.PI * 2) * 4, 3);
    return hartDone(s, cx, cy);
  });
}
// Flames over a fire ring, three frames, glowing.
function hartFlames(frame) {
  return hartKeep('flames' + frame, () => {
    const W = 10, H = 10, s = new PntSpr(W, H, 1480 + frame), F = HART.fire;
    for (let x = 0; x < W; x++) {
      const tall = (Math.sin(x * 1.7 + frame * 2.3) * 0.5 + 0.5) * (1 - Math.abs(x - 4.5) / 5.5) * 9 + 1;
      for (let j = 0; j < tall; j++) { const v = 1 - j / tall; s.px(x, H - 1 - j, F[clamp(Math.round(1 + v * 4.2), 0, 5)], true); }
    }
    return hartDone(s, 5, H - 1);
  });
}
