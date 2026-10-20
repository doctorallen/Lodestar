'use strict';
// ---------------------------------------------------------------------------
// Hard light: the Charter's spells drawn as engineered things (cosmetic
// only; DECISIONS.md, 2026-10-19). castfx.js lays out what a cast sets off;
// these are the shapes it's built from, all in whole art px:
//   - crisp lines a pixel wide (hlLine), diamonds and hexagons (hlDiamond,
//     hlPoly), a lock-on's four corner brackets (hlBrackets), a muzzle's
//     ring seen edge-on (hlEdgeRing);
//   - kept pictures, painted once: the cast's circuit sigil under the feet
//     (hlSigilPic), a pressure wave's ring (hlWavePic), a thin lattice ring
//     (hlRing, drawn as dots), a ward's hexagonal shell (hlLatticePic), the Charter's
//     seed-star (hlSeedPic), and any of them dissolving in scan-lines
//     (hlScanPic: every other row gone, then two rows in three);
//   - the Charter's own gold and blue, as accents on the element's colour.
// castfxWarm builds the pictures a fight needs, so none is painted mid-fight.
// ---------------------------------------------------------------------------

const HL_GOLD = ['#5a4418', '#a8822c', '#ffd34d', '#ffe9a0', '#fff8e0'];
const HL_BLUE = ['#18264a', '#2b467e', '#5078b4', '#8fb4ff', '#d8e8ff'];

// A line a pixel wide from x0, y0 to x1, y1 (art px), every `every`-th
// pixel, in colour (and the glow layer when it glows).
function hlLine(x0, y0, x1, y1, col, glow, alpha = 1, every = 1) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, n = 0;
  for (let i = 0; i < 400; i++) {
    if (n++ % every === 0) dot(x0, y0, col, glow, alpha);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

// Many pixels of one colour at once, straight into both layers (a ground
// effect drawn before the late dots: one canvas state for the lot).
// pts: [x, y, x, y, ...].
function hlDots(pts, col, glow, alpha) {
  if (!pts.length || alpha <= 0) return;
  const c = View.ctx, e = View.emCtx;
  c.globalAlpha = alpha; c.fillStyle = col;
  for (let i = 0; i < pts.length; i += 2) c.fillRect(pts[i], pts[i + 1], 1, 1);
  c.globalAlpha = 1;
  if (!glow) return;
  e.globalAlpha = alpha; e.fillStyle = col;
  for (let i = 0; i < pts.length; i += 2) e.fillRect(pts[i], pts[i + 1], 1, 1);
  e.globalAlpha = 1;
}

// A diamond (a square on its point) of radius r round x, y; tips: the
// colour of its four points, if not its own.
function hlDiamond(x, y, r, col, alpha = 1, tips = null) {
  if (r <= 0) { dot(x, y, col, true, alpha); return; }
  for (let i = 0; i < r; i++) {
    const j = r - i;
    dot(x + i, y - j, col, true, alpha); dot(x + j, y + i, col, true, alpha);
    dot(x - i, y + j, col, true, alpha); dot(x - j, y - i, col, true, alpha);
  }
  if (tips) for (const [i, j] of [[r, 0], [-r, 0], [0, r], [0, -r]]) dot(x + i, y + j, tips, true, alpha);
}

// A closed outline through pts ([[x, y], ...]); every: as hlLine.
function hlPoly(pts, col, alpha = 1, every = 1) {
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; hlLine(a[0], a[1], b[0], b[1], col, true, alpha, every); }
}
// A hexagon's corners round x, y: r across, ry down (a flattened one on
// the ground), turned by rot.
function hlHex(x, y, r, ry, rot) {
  const out = [];
  for (let k = 0; k < 6; k++) { const a = rot + (k * Math.PI) / 3; out.push([Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * ry)]); }
  return out;
}

// A lock-on: four corner brackets round a box w × h (art px) centred on x,
// y, each arm L long.
function hlBrackets(x, y, w, h, L, col, alpha = 1) {
  const x0 = Math.round(x - w / 2), x1 = Math.round(x + w / 2), y0 = Math.round(y - h / 2), y1 = Math.round(y + h / 2);
  for (let i = 0; i < L; i++) {
    dot(x0 + i, y0, col, true, alpha); dot(x0, y0 + i, col, true, alpha);
    dot(x1 - i, y0, col, true, alpha); dot(x1, y0 + i, col, true, alpha);
    dot(x0 + i, y1, col, true, alpha); dot(x0, y1 - i, col, true, alpha);
    dot(x1 - i, y1, col, true, alpha); dot(x1, y1 - i, col, true, alpha);
  }
}

// A ring seen edge-on, standing across the way a shot goes (a muzzle's or
// a shock's): r across it, r × 0.35 along it; a ux, uy along the way.
function hlEdgeRing(x, y, ux, uy, r, col, alpha, hot) {
  const n = Math.max(8, Math.round(r * 5)), vx = -uy, vy = ux;
  for (let k = 0; k < n; k++) {
    const t = (k / n) * Math.PI * 2, c = Math.cos(t) * r * 0.35, s = Math.sin(t) * r;
    dot(Math.round(x + ux * c + vx * s), Math.round(y + uy * c + vy * s), c > 0 && hot ? hot : col, true, alpha);
  }
}

// ---------------------------------------------------------------------------
// Kept pictures
// ---------------------------------------------------------------------------

// A radius in art px, in coarser steps the bigger it is, so fewer
// pictures are kept.
const hlQuant = (r) => (r <= 16 ? Math.max(1, Math.round(r)) : r <= 40 ? Math.round(r / 2) * 2 : Math.round(r / 4) * 4);

// A picture with every other row gone (n 2), or two rows in three (n 3):
// hard light switching off.
function hlScanPic(pic, n) {
  if (n <= 1) return pic;
  return cfxPic(`${pic.key} scan${n}`, pic.c.width, pic.c.height, null, (x) => {
    x.drawImage(pic.c, 0, 0);
    for (let y = 0; y < pic.c.height; y++) if (y % n) x.clearRect(0, y, pic.c.width, 1);
  });
}

// The circuit sigil under a caster's feet: an outer ring cut into
// segments (they turn with rot, one of six steps), a hexagon inside it with
// a gold node at each corner, traces out from the corners to the ring, and
// ticks round a big one's rim. rx in art px.
function hlSigilPic(rx, col, rot) {
  const ry = Math.max(1, Math.round(rx * 0.55));
  return cfxPic(`sg${rx} ${col} ${rot}`, rx * 2 + 7, ry * 2 + 7, (set) => {
    const R = cfxRamp(col), segs = rx >= 12 ? 12 : 6, turn = (rot / 6) * ((Math.PI * 2) / segs);
    for (const [x, y, a] of cfxEllipse(rx, ry)) {
      const s = (((a + Math.PI - turn) / (Math.PI * 2)) * segs) % 1, u = s < 0 ? s + 1 : s;
      if (u > 0.82) continue;
      set(x, y, y > 0 ? R[3] : R[2]);
      if (y > 0 && rx >= 8 && u < 0.4) set(x, y - 1, R[1], 0.8);
    }
    if (rx < 5) return;
    // the hexagon and its traces
    const hr = rx * 0.62, hry = ry * 0.62, rot2 = turn * -2 + Math.PI / 6;
    const hex = [];
    for (let k = 0; k < 6; k++) { const a = rot2 + (k * Math.PI) / 3; hex.push([Math.round(Math.cos(a) * hr), Math.round(Math.sin(a) * hry), a]); }
    for (let k = 0; k < 6; k++) {
      const [x0, y0] = hex[k], [x1, y1] = hex[(k + 1) % 6], n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let i = 0; i <= n; i++) set(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), R[2]);
    }
    for (let k = 0; k < 6; k++) {
      const [x0, y0, a] = hex[k];
      if (rx >= 9 && k % 2 === 0) {
        // a trace out to the ring: along the radius, then a node
        const x1 = Math.round(Math.cos(a) * (rx - 2)), y1 = Math.round(Math.sin(a) * (ry - 1)), n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
        for (let i = 1; i < n; i++) set(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), R[1]);
        set(x1, y1, HL_GOLD[3]);
      }
      set(x0, y0, HL_GOLD[k % 2 ? 2 : 4]);
      if (rx >= 12) { set(x0 + 1, y0, HL_GOLD[2]); set(x0 - 1, y0, HL_GOLD[1]); }
    }
    set(0, 0, R[4]); set(-1, 0, R[3]); set(1, 0, R[3]);
    if (rx >= 15) for (let k = 0; k < 24; k++) { if (k % 2) continue; const a = (k / 24) * Math.PI * 2 + turn; set(Math.round(Math.cos(a) * (rx + 2)), Math.round(Math.sin(a) * (ry + 1)), k % 6 ? R[2] : HL_GOLD[3]); }
  });
}

// A pressure wave's ring (a Nova's, a burst's, a Well's): a crisp edge a
// pixel wide, white-hot outside, its colour, then a band of short strokes
// along it thinning inwards (thicker at the front); twelve ticks across it
// like a lattice, the Charter's gold every third; a faint dotted ring
// inside. rx in art px; aspect: ry / rx.
function hlWavePic(rx, col, aspect) {
  const ry = Math.max(1, Math.round(rx * aspect)), w = rx * 2 + 9, h = ry * 2 + 9, R = cfxRamp(col), sd = rx * 13 + 7;
  return cfxPic(`hw${rx} ${col} ${aspect}`, w, h, (set) => {
    const th = clamp(Math.round(rx * 0.08), 1, 4);
    for (let y = -ry - 4; y <= ry + 4; y++) for (let x = -rx - 4; x <= rx + 4; x++) {
      const e = Math.hypot(x / rx, y / ry), d = (1 - e) * Math.min(rx, ry / aspect), a = Math.atan2(y / ry, x / rx), s = (a + Math.PI) * rx, front = Math.max(0, y / ry);
      const T = th * (1 + 0.7 * front) + 0.5, hs = artHash(Math.floor(s / 5), 2, sd);
      if (d >= -0.5 && d < 0.5) set(x, y, R[4]);
      else if (d >= 0.5 && d < 1.5) set(x, y, R[3]);
      else if (d >= 1.5 && d < 1.5 + T) { if (hs > 0.2) set(x, y, R[hs > 0.7 ? 2 : 1], 0.9); }
      else if (d >= 1.5 + T && d < 1.5 + T + rx * 0.22) {
        const k = (d - 1.5 - T) / (rx * 0.22);
        if (artHash(Math.floor(s / 3), Math.floor(d / 2), sd + 5) < 0.1 * (1 - k)) set(x, y, R[1], 0.8);
      }
    }
    // the lattice: ticks across the ring
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2 + 0.13, c = Math.cos(a), s = Math.sin(a), gold = k % 3 === 0;
      for (let i = -2; i <= 1; i++) set(Math.round(c * (rx + i)), Math.round(s * (ry + i * aspect)), gold ? HL_GOLD[i < 0 ? 3 : 2] : R[i < 0 ? 4 : 3]);
    }
    if (rx >= 10) for (const [x, y, a] of cfxEllipse(Math.round(rx * 0.7), Math.max(1, Math.round(ry * 0.7)))) if (Math.floor((a + Math.PI) * rx * 0.7) % 4 === 0) set(x, y, R[2], 0.7);
  });
}

// A thin ring a pixel wide round x, y (art px; rx across, rx × aspect
// down), lattice ticks round it, gold every other: its front a tone
// hotter than its back. every: only every n-th pixel of it (dotted).
// Drawn as dots, not kept: it's mostly empty, and the dots of an effect
// in the air cost next to nothing (render.js, LateDots).
function hlRing(x, y, rx, col, aspect, alpha = 1, every = 1) {
  if (alpha <= 0) return;
  const ry = Math.max(1, Math.round(rx * aspect)), R = cfxRamp(col);
  let n = 0;
  for (const [i, j] of cfxEllipse(rx, ry)) { if (n++ % every) continue; dot(x + i, y + j, j > 0 ? R[4] : R[3], true, alpha); }
  if (rx >= 6) for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + 0.39; dot(Math.round(x + Math.cos(a) * (rx + 1)), Math.round(y + Math.sin(a) * (ry + 1)), k % 2 ? R[3] : HL_GOLD[3], true, alpha); }
}
// The same switching off as hard light does, by k (its life left): whole,
// then every other pixel, then one in three.
function hlRingHard(x, y, rx, col, aspect, k) {
  if (k > 0) hlRing(x, y, rx, col, aspect, k > 0.25 ? 1 : 0.75, k > 0.5 ? 1 : k > 0.25 ? 2 : 3);
}

// A ward's shell, a bubble of hard light rx × ry (art px): a hexagonal
// lattice a pixel wide (cells hl px across), strong towards its rim and
// gone from its middle, so the diver shows through; a crisp rim, brighter
// at the front; a glint arc on its upper left where the light catches it;
// gold emitter nodes round it.
function hlLatticePic(rx, ry, col) {
  const R = cfxRamp(col), S = 3.6;
  // which hexagon (pointy-topped, S px to a side) a pixel is in
  const hexOf = (x, y) => {
    const q = ((Math.sqrt(3) / 3) * x - y / 3) / S, r = ((2 / 3) * y) / S, s = -q - r;
    let rq = Math.round(q), rr = Math.round(r);
    const rs = Math.round(s), dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
    if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
    return rq * 1000 + rr;
  };
  return cfxPic(`hx${rx} ${ry} ${col}`, rx * 2 + 5, ry * 2 + 5, (set) => {
    for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
      const e = Math.hypot(x / rx, y / ry);
      if (e > 1 || e < 0.62) continue;
      const h = hexOf(x + 0.5, y + 0.5);
      if (h === hexOf(x + 1.5, y + 0.5) && h === hexOf(x + 0.5, y + 1.5)) continue;
      set(x, y, e > 0.85 ? R[3] : R[2], e > 0.85 ? 0.85 : e > 0.74 ? 0.55 : 0.3);
    }
    for (const [x, y, a] of cfxEllipse(rx, ry)) {
      set(x, y, y > 0 ? R[4] : R[3], y > 0 ? 1 : 0.85);
      // the glint, on the upper left
      if (a < -1.9 && a > -2.9) { set(x + 1, y + 1, '#ffffff'); set(x + 2, y + 1, R[4], 0.8); }
    }
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + Math.PI / 6; set(Math.round(Math.cos(a) * rx), Math.round(Math.sin(a) * ry), HL_GOLD[4]); }
  });
}

// The Charter's mark, the seed-star: four long points and four short, a
// white heart, in pale gold, inside a ring of ticks; r in art px (the long
// points' reach). Glows whole.
function hlSeedPic(r) {
  return cfxPic(`seed${r}`, r * 2 + 9, r * 2 + 9, (set) => {
    const G = HL_GOLD;
    for (let k = 1; k <= r; k++) {
      const t = k / r, c = t < 0.3 ? '#ffffff' : t < 0.6 ? G[4] : t < 0.85 ? G[3] : G[2];
      for (const [i, j] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) set(i * k, j * k, c);
    }
    const s = Math.max(1, Math.round(r * 0.45));
    for (let k = 1; k <= s; k++) for (const [i, j] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) set(i * k, j * k, k < s ? G[3] : G[2]);
    for (let k = 1; k < Math.round(r * 0.4); k++) { set(k, 1, G[3]); set(-k, -1, G[3]); set(1, -k, G[3]); set(-1, k, G[3]); }
    set(0, 0, '#ffffff');
    if (r >= 6) for (let k = 0; k < 16; k++) { if (k % 4 === 0) continue; const a = (k / 16) * Math.PI * 2; set(Math.round(Math.cos(a) * (r + 2)), Math.round(Math.sin(a) * (r + 2)), G[k % 2 ? 2 : 3]); }
  });
}

// What a fight needs, painted now rather than mid-fight (the loading
// screen calls this): each element's pressure waves (and the Nova's and
// the Well's own colours), the cast sigils, the wards, the seed-star.
function castfxWarm() {
  const els = ['force', 'shock', 'frost', 'ember', 'blight'].map((e) => ELEMENT_COLS[e]), F = ART.forms, C = T.castFx, radii = [];
  for (let r = 2; r <= 88; r++) if (!radii.includes(hlQuant(r))) radii.push(hlQuant(r));
  for (const col of els.concat([F.nova, F.well])) for (const rx of radii) if (rx <= Math.ceil(T.circuits.forms.nova.radius * AP * 1.15)) hlWavePic(rx, col, 0.6);
  for (const col of els.concat([F.bolt, F.lance, F.orb, F.arc, F.ward, HL_GOLD[2]])) {
    for (let rot = 0; rot < 6; rot++) for (const r of [C.glyph[0], C.glyph[1], C.glyphBig[0], C.glyphBig[1]]) hlSigilPic(cfxQuant(r * AP), col, rot);
    const w = hlLatticePic(CFX_WARD[0], CFX_WARD[1], col);
    hlScanPic(w, 2); hlScanPic(w, 3);
  }
  for (const r of [5, 8, 12, 18]) hlSeedPic(r);
}
