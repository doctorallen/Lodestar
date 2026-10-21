'use strict';
// ---------------------------------------------------------------------------
// The creatures, painted (docs/PAINTED.md; numbers in T.paint.foes). Each is
// a dark mass shaded in short horizontal strokes, lit from the upper left,
// with no outline: a lit rim along its top, a few accent pixels in its own
// colour, eyes as single bright pixels, crystals faceted and lit on their
// left. A struck one gets a white rim (render.js spriteRim); an elite's lit
// rim takes its affix's colour (fpEliteRim).
//
// Two ways in:
//   From shapes (FpSpr, a PntSpr that knows each pixel's part): the
//     crawler, the wisp, the construct, the warden, the target and the
//     Hollow (fpEnemySprites), and each clime's own creature in every frame
//     it has (FP_FOE). The old A+ grids were the guide for each one's
//     shape, size and poses. The crawler and the construct gained a walk
//     and a wind-up (fpPose).
//   From a letter grid (fpPaintGrid): the Shard Keepers and the fighting
//     plants, which keep their hand-drawn shapes; each material on a ramp of
//     its own colours two tones deeper, its tone from its form against the
//     light, laid in strokes. Critters are flat colours with a lit top edge
//     (fpCritterCanvas).
// Every sprite keeps its old size and anchor, so hitboxes, hand points and
// the bars over them don't move. Each is built once and kept; a floor's are
// built as it's entered (fpWarm).
// ---------------------------------------------------------------------------

// A painted ramp from a material's tones (hex, dark to light): two deeper
// (towards the violet black), its own, one lighter (towards warm). Kept.
const _fpRamps = new Map();
function fpRamp(r) {
  const key = r.join();
  let o = _fpRamps.get(key);
  if (!o) {
    const rgb = r.map(rgbOf), top = rgb[rgb.length - 1];
    o = [pntMixRgb(rgb[0], PNT_DEEP, 0.55), pntMixRgb(rgb[0], PNT_DEEP, 0.25), ...rgb, pntMixRgb(top, PNT_WARM, 0.22), pntMixRgb(top, PNT_WARM, 0.45)].map((c) => rgbToHex(c[0], c[1], c[2]));
    _fpRamps.set(key, o);
  }
  return o;
}
// A glow's tones: dim, mid, itself, a hot heart.
const fpGlowRamp = (g) => [mix(g, '#000000', 0.5), mix(g, '#000000', 0.22), g, mix(g, '#ffffff', 0.55)];

// Materials kept as single bright pixels (eyes), and those lit as faceted
// crystals; any other glow is a core, brightest at its heart.
const FP_EYES = new Set(['eye', 'eyeglow']);
const FP_FACETS = new Set(['crystal', 'shardglow', 'shardwarm']);

// Paints a letter grid. pal, letters, glows: as buildArtSprite. o: { scale
// (how much the grid is enlarged, AP unless said), seed, foot (px of the
// old grid its feet stand above: footOff), eyes (how many px of an eye
// stay lit: 1 or 2), keepEyes (leave eyes whole), dark (shift every tone
// down this many steps) }.
function fpPaintGrid(rows, pal, letters, glows, o = {}) {
  const F = T.paint.foes, G = glows instanceof Set ? glows : new Set(glows);
  pal = Object.assign({}, ART.pal, pal);
  const scale = o.scale !== undefined ? o.scale : AP, drawn = ART_NATIVE.get(rows) || 1;
  if (scale !== drawn) rows = artScaleRows(rows, scale / drawn, new Set(Object.keys(letters).filter((ch) => letters[ch] && G.has(letters[ch][0]))));
  const h = rows.length, w = Math.max(...rows.map((r) => r.length)), W = w + 2, H = h + 2, N = W * H;
  const L = new Array(N).fill(null);
  let y0 = H, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = rows[y][x];
    if (!ch || ch === '.' || !letters[ch]) continue;
    L[(y + 1) * W + x + 1] = letters[ch];
    y0 = Math.min(y0, y + 1); y1 = Math.max(y1, y + 1);
  }
  const mat = (i) => (L[i] ? L[i][0] : null), glowAt = (i) => !!L[i] && G.has(L[i][0]);
  // how far in from the silhouette (dS) and from its material's edge (dM)
  const BIG = 1e6, dS = new Float32Array(N), dM = new Float32Array(N);
  for (let i = 0; i < N; i++) dS[i] = dM[i] = L[i] ? BIG : 0;
  const pass = (from, to, by, nb) => {
    for (let i = from; i !== to; i += by) {
      if (!L[i]) continue;
      for (const [d, c] of nb) {
        const j = i + d;
        if (dS[j] + c < dS[i]) dS[i] = dS[j] + c;
        const m = L[j] && L[j][0] === L[i][0] ? dM[j] : 0;
        if (m + c < dM[i]) dM[i] = m + c;
      }
    }
  };
  pass(W + 1, N - W - 1, 1, [[-1, 1], [-W, 1], [-W - 1, 1.4], [-W + 1, 1.4]]);
  pass(N - W - 2, W, -1, [[1, 1], [W, 1], [W + 1, 1.4], [W - 1, 1.4]]);
  const rB = Math.max(3, 0.32 * Math.min(w, h)), hgt = new Float32Array(N);
  for (let i = 0; i < N; i++) if (L[i]) hgt[i] = 0.5 * Math.min(1, (dS[i] - 0.5) / 2.2) + 0.3 * Math.min(1, (dS[i] - 0.5) / rB) + 0.2 * Math.min(1, (dM[i] - 0.5) / 2);
  // each pixel's place on its ramp, as a real number (NaN: a glow)
  const LX = -0.46, LY = -0.62, LZ = 0.64, tv = new Float32Array(N).fill(NaN), dark = o.dark || 0;
  const ramps = new Array(N);
  for (let i = 0; i < N; i++) {
    const e = L[i];
    if (!e || G.has(e[0])) continue;
    const ramp = (ramps[i] = fpRamp(pal[e[0]])), n = ramp.length, x = i % W, y = (i - x) / W;
    if (e[1] !== undefined) { tv[i] = Math.min(n - 1, e[1] + 1) - dark; continue; }
    const nx = -(hgt[i + 1] - hgt[i - 1]) * F.depth, ny = -(hgt[i + W] - hgt[i - W]) * F.depth;
    const lam = Math.max(0, (LX * nx + LY * ny + LZ) / Math.hypot(nx, ny, 1)) / LZ;
    let v = F.base + (lam - 1) * (lam > 1 ? F.light : F.shade) - F.fall * ((y - y0) / Math.max(1, y1 - y0));
    const up = mat(i - W);
    if (up && up !== e[0] && !glowAt(i - W)) v -= F.crease;
    tv[i] = v * (n - 1) - dark;
  }
  const s = new PntSpr(W, H, o.seed || hashInts(w, h, rows.length, rows[0].length));
  const hsh = (x, y, k) => artHash(x, y + k * 977, s.seed);
  // strokes: runs along each row, a tone each from its middle, jittered
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      const i = y * W + x;
      if (!L[i] || isNaN(tv[i]) || L[i][1] !== undefined) {
        if (L[i] && L[i][1] !== undefined) s.px(x, y, ramps[i][Math.max(0, Math.min(ramps[i].length - 1, Math.round(tv[i])))]);
        x++; continue;
      }
      const m = L[i][0], len = F.run[0] + Math.floor(hsh(x, y, 1) * (F.run[1] - F.run[0] + 1));
      let e = x;
      while (e < W && e - x < len && L[y * W + e] && L[y * W + e][0] === m && L[y * W + e][1] === undefined) e++;
      let sum = 0;
      for (let k = x; k < e; k++) sum += tv[y * W + k];
      const jit = (hsh(x, y, 2) + hsh(x, y, 3) - 1) * F.jitter * 1.7, n = ramps[i].length;
      for (let k = x; k < e; k++) {
        // (a run over a strong change of light bends with it)
        const t = 0.5 * (sum / (e - x)) + 0.5 * tv[y * W + k];
        s.px(k, y, ramps[i][Math.max(0, Math.min(n - 1, Math.round(t + jit)))]);
      }
      x = e;
    }
  }
  // the lit rim: the top edge (and the upper left) catches the light; the
  // lowest edge sinks into the dark
  for (let i = 0; i < N; i++) {
    const e = L[i];
    if (!e || isNaN(tv[i]) || e[1] !== undefined) continue;
    const x = i % W, y = (i - x) / W, ramp = ramps[i], n = ramp.length;
    const top = !L[i - W] || (glowAt(i - W) && !FP_EYES.has(mat(i - W))), left = !L[i - 1];
    if (top && hsh(x, y, 4) < F.rim * (left || !L[i - W - 1] ? 1 : 0.85)) {
      s.px(x, y, ramp[hsh(x, y, 5) < F.rimHi ? n - 1 : n - 2]);
      if (L[i + W] && !isNaN(tv[i + W]) && L[i + W][0] === e[0] && L[i + W][1] === undefined && hsh(x, y, 6) < 0.45) s.px(x, y + 1, ramp[n - 3]);
    } else if (left && !top && hsh(x, y, 7) < 0.2) s.px(x, y, ramp[Math.min(n - 2, Math.max(3, Math.round(tv[i]) + 1))]);
    else if (!L[i + W] && F.under) s.px(x, y, ramp[Math.min(1, Math.round(tv[i]))]);
  }
  // the glows: eyes as single bright pixels, crystals faceted, cores lit
  // from within
  const seen = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (seen[i] || !glowAt(i)) continue;
    const m = mat(i), comp = [i];
    seen[i] = 1;
    for (let k = 0; k < comp.length; k++) for (const d of [-1, 1, -W, W]) { const j = comp[k] + d; if (!seen[j] && mat(j) === m) { seen[j] = 1; comp.push(j); } }
    const g = pal[m][pal[m].length - 1], R = fpGlowRamp(g);
    let cx = 0, cy = 0, mx0 = W, mx1 = 0, my0 = H, my1 = 0;
    for (const j of comp) { const x = j % W, y = (j - x) / W; cx += x; cy += y; mx0 = Math.min(mx0, x); mx1 = Math.max(mx1, x); my0 = Math.min(my0, y); my1 = Math.max(my1, y); }
    cx /= comp.length; cy /= comp.length;
    if (FP_EYES.has(m) && !o.keepEyes) {
      // the eye: its upper-left pixel a hot glint, one beside it lit, the
      // rest a dark socket
      comp.sort((a, b) => (a % W) + ((a / W) | 0) * 1.3 - ((b % W) + ((b / W) | 0) * 1.3));
      const keep = o.eyes || (comp.length >= 4 ? 2 : 1), sock = fpRamp(pal.maw || pal.shell || ['#0a0608', '#140c10', '#20161a', '#2c2024'])[0];
      comp.forEach((j, k) => s.px(j % W, (j / W) | 0, k === 0 ? (comp.length > 1 ? R[3] : g) : k < keep ? g : sock, k < keep));
      continue;
    }
    const rw = Math.max(1, (mx1 - mx0 + 1) / 2), rh = Math.max(1, (my1 - my0 + 1) / 2);
    for (const j of comp) {
      const x = j % W, y = (j - x) / W, u = (x + 0.5 - (mx0 + mx1 + 1) / 2) / rw, v = (y + 0.5 - (my0 + my1 + 1) / 2) / rh;
      let t;
      if (FP_FACETS.has(m)) {
        // lit on its left face, the right in shade, its tip hottest
        const lean = (x - cx) / Math.max(1, rw);
        t = (lean <= 0 ? 2.15 : 1.0) - v * 0.45 + (y === my0 ? 0.8 : 0) + (hsh(x, y, 8) - 0.5) * 0.5;
      } else {
        const r = Math.hypot(u + 0.25, v + 0.25);
        t = 3.1 - r * 1.9 + (hsh(x, y, 8) - 0.5) * 0.4;
        if (comp.length <= 2) t = 2;
      }
      s.px(x, y, R[Math.max(0, Math.min(3, Math.round(t)))], true);
    }
  }
  const out = s.done();
  out.k = scale;
  out.ax = out.w / 2; out.ay = out.h - footOff(o.foot !== undefined ? o.foot : 1.5);
  out.flash = tinted(out.c, '#ffffff');
  return out;
}

// ---------------------------------------------------------------------------
// An elite's mark: its lit rim (the pixels along its top and upper left)
// in its affix's colour, glowing; a share of them (T.paint.foes.elite),
// set by place. Kept per sprite and colour.
// ---------------------------------------------------------------------------
const _fpEliteRims = new WeakMap();
function fpEliteRim(spr, col) {
  let m = _fpEliteRims.get(spr.c);
  if (!m) _fpEliteRims.set(spr.c, (m = new Map()));
  let c = m.get(col);
  if (c) return c;
  const w = spr.w, h = spr.h, src = spr.c.getContext('2d').getImageData(0, 0, w, h).data, [cv, cx] = makeCanvas(w, h), img = cx.createImageData(w, h), D = img.data;
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] > 0, [r, g, b] = rgbOf(col), [r2, g2, b2] = rgbOf(mix(col, '#ffffff', 0.45));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!solid(x, y) || (solid(x, y - 1) && solid(x - 1, y))) continue;
    if (solid(x, y - 1) && artHash(x, y, 0xe11) > T.paint.foes.elite * 0.6) continue;
    if (artHash(x, y, 0xe12) > T.paint.foes.elite) continue;
    const k = (y * w + x) * 4, hot = !solid(x, y - 1) && artHash(x, y, 0xe13) < 0.3;
    D[k] = hot ? r2 : r; D[k + 1] = hot ? g2 : g; D[k + 2] = hot ? b2 : b; D[k + 3] = 255;
  }
  cx.putImageData(img, 0, 0);
  m.set(col, cv);
  return cv;
}

// ---------------------------------------------------------------------------
// Read at a glance (T.paint.foes.read). A creature must stand off any ground,
// bright sand or a dark Deep, without an outline: its silhouette's edge on
// the light's side (top and left) catches it, a pale lit rim, broken; its
// edge on the shadow side (right and below) and its thin limbs sink into
// its own deepest tones, so it holds against light ground. The lit rim is
// kept apart too (rimEc), and in a dark place it's laid over the light a
// little (render.js drawEnemy), as the floor there is painted lighter for
// the dark. Mutates the sprite (keeping the unread picture as raw, for a
// mirrored one) and makes its flash again.
// ---------------------------------------------------------------------------
function fpReadable(spr, o = {}) {
  const R = T.paint.foes.read, w = spr.w, h = spr.h, x = spr.c.getContext('2d'), img = x.getImageData(0, 0, w, h), D = img.data;
  if (!spr.raw) { const [rc, rx] = makeCanvas(w, h); rx.drawImage(spr.c, 0, 0); spr.raw = rc; }
  const E = spr.ec ? spr.ec.getContext('2d').getImageData(0, 0, w, h).data : null;
  const A = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) A[i] = D[i * 4 + 3] > 0 ? (E && E[i * 4 + 3] > 0 ? 2 : 1) : 0;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : A[y * w + x]);
  const [rc, rcx] = makeCanvas(w, h), rim = rcx.createImageData(w, h), M = rim.data, seed = w * 131 + h, pale = R.pale, deep = PNT_DEEP;
  let lit = 0;
  for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {
    if (A[y * w + xx] !== 1) continue;
    const up = !at(xx, y - 1), lf = !at(xx - 1, y), dn = !at(xx, y + 1), rt = !at(xx + 1, y), k = (y * w + xx) * 4, hsh = artHash(xx, y, seed);
    const thin = (lf && rt) || (up && dn);
    let to = null, f = 0;
    if ((up && !(dn && thin && !lf)) || (lf && !rt && !dn)) {
      if (hsh < (up ? R.top : R.left)) { to = pale; f = up ? R.lit : R.lit * 0.75; }
    } else if (dn || rt || thin) {
      if (hsh < R.shade) { to = deep; f = dn ? R.dark : thin ? R.dark * 0.7 : R.dark * 0.8; }
    }
    if (!to) continue;
    const r = D[k], g = D[k + 1], b = D[k + 2];
    if (to === pale) {
      // (never darker than it was)
      // (a lit edge of its own colour in the picture, as bright ground would
      // swallow a pale one; the paler one only over the dark)
      D[k] = r + (to[0] - r) * f; D[k + 1] = g + (to[1] - g) * f; D[k + 2] = b + (to[2] - b) * f;
      const e = R.glowLit;
      M[k] = r + (to[0] - r) * e; M[k + 1] = g + (to[1] - g) * e; M[k + 2] = b + (to[2] - b) * e; M[k + 3] = 255; lit++;
    } else { D[k] = r + (to[0] - r) * f; D[k + 1] = g + (to[1] - g) * f; D[k + 2] = b + (to[2] - b) * f; }
  }
  x.putImageData(img, 0, 0);
  rcx.putImageData(rim, 0, 0);
  spr.rimEc = lit ? rc : null;
  spr.flash = tinted(spr.c, '#ffffff');
  return spr;
}

// A mirrored creature, read again from its unread picture (so its lit rim
// stays on its left).
function fpReadableFlip(base) {
  const s = flippedSprite(base);
  if (base.raw) { s.c = flipped(base.raw); s.raw = null; fpReadable(s); } else s.flash = tinted(s.c, '#ffffff');
  return s;
}

// ---------------------------------------------------------------------------
// What the rest of the game calls
// ---------------------------------------------------------------------------
// A clime's own creature, one frame (foesart.js foeSprite; its colours
// already picked for the variant), painted at its old frame's size.
function fpFoeSprite(type, frame, variant, rows, pal, letters) {
  const W = Math.max(...rows.map((r) => r.length)) + 2, H = rows.length + 2;
  if (FP_FOE[type]) return fpDone(FP_FOE[type](frame, variant, pal, W, H));
  return fpPaintGrid(rows, pal, letters, FOE_GLOWS, { seed: hashInts(type.length, type.charCodeAt(0), frame.length, frame.charCodeAt(0)) });
}

// The common enemies of a region (art.js buildEnemySprites).
function fpEnemySprites(biomeId) {
  const pal = ENEMY_PAL[biomeId], out = {};
  const wc = { shell: pal.shell, core: pal.crystal[0], heart: pal.coreglow[0], r0: 4.3, r1: 7.4, gap: 0.16 }, hc = { shell: ['#000000', '#030205', '#0a0712', '#161020'], inner: '#5a1478', core: '#ff2a6a', heart: '#ffd0dc', r0: 4.4, r1: 7.6, gap: 0.12 };
  out.wisp = fpWisp(17, 20, 1, wc, 0, biomeId.length); out.wisp.walk = fpWisp(17, 20, 1, wc, 1, biomeId.length);
  out.hollow = fpWisp(32, 38, 1.9, hc, 0, 7); out.hollow.walk = fpWisp(32, 38, 1.9, hc, 1, 7);
  for (const pose of ['idle', 'walk', 'windup']) {
    const c = fpConstruct(23, 23, 1, pal, pose, biomeId.length), w = fpConstruct(44, 44, 1.92, Object.assign({}, pal, { plate: ['#0c0a0e', '#1e1a22', '#34303c', '#565064'] }), pose, biomeId.length);
    if (pose === 'idle') { out.construct = c; out.warden = w; } else { out.construct[pose] = c; out.warden[pose] = w; }
  }
  out.dummy = fpTargetDummy(23, 23, 1, Object.assign({}, pal, { plate: ['#1c1810', '#3a3020', '#5e4c30', '#8a7048'], rune: [ART.pal.star[2]] }), 'idle', 3);
  out.crawler = fpCrawler(pal, 'idle', biomeId.length);
  out.crawler.walk = fpCrawler(pal, 'walk', biomeId.length);
  out.crawler.windup = fpCrawler(pal, 'windup', biomeId.length);
  for (const k of Object.keys(out)) if (k !== 'dummy') for (const f of [out[k], out[k].walk, out[k].windup]) if (f) fpReadable(f);
  return out;
}

// A region's Shard Keeper (render.js enemySprite): the Rim's from its grid
// (art2.js), the Choir's and the Underforge's painted from shapes.
function fpKeeperSprite(id) {
  if (FP_KEEPER[id]) return fpReadable(FP_KEEPER[id]());
  return fpReadable(fpPaintGrid(KEEPER_ROWS[id], Object.assign({}, ART2_PAL, KEEPER_PAL[id]), Object.assign({}, SPRITE_CHARS, ART2_LETTERS), [...SPRITE_GLOWS, ...ART2_GLOWS], { foot: 2 }));
}

// The heart-shard a Keeper holds: a faceted crystal of warm gold-white
// standing from (x, y), h px tall, with a halo of loose glints.
function fpKeeperShard(s, x, y, h, w) {
  const R = fpGlowRamp('#ffd890'), Z = [R[0], R[1], '#fff0c8', '#fffaf0'];
  s.tag('shard').shard(x, y, h, w, 0.4, Z);
  for (const [dx, dy] of [[-w, -h * 0.4], [w * 0.9, -h * 0.7], [-w * 0.6, -h * 1.05], [w * 1.2, -h * 0.2]]) s.px(x + dx, y + dy, R[2], true);
}

const FP_KEEPER = {
  // The Choir's Keeper: a gaunt strider of blue-black chitin, slung high on
  // four stilt legs (the far pair darker), its long neck curving up to a
  // narrow skull crowned with violet crystal; its ribcage open in front,
  // the heart-shard caged inside; crystal grown along its back. 60 × 72.
  choir() {
    const W = 60, H = 72, s = new FpSpr(W, H, hashInts(0xc401, 7)), cx = 30;
    const SH = fpRamp(['#0a0a18', '#16162c', '#262848', '#3c4068']), CR = fpGlowRamp('#b08cff'), body = (t, sd) => (sd < 0 ? SH[5] : sd > 0 ? SH[1] : SH[3]), far = (t, sd) => (sd < 0 ? SH[3] : SH[1]);
    // the far legs, then the near: hip, a knee out and down, a spiked foot
    for (const side of [-1, 1]) {
      s.tag('leg').limb([[cx + side * 4, 38], [cx + side * 11, 52], [cx + side * 8, 69]], 2.4, 1, far);
      s.tag('leg').limb([[cx + side * 8, 69], [cx + side * 8.5, 71]], 0.9, 0.3, far);
    }
    for (const side of [-1, 1]) {
      s.tag('leg').limb([[cx + side * 7, 36], [cx + side * 16, 47], [cx + side * 20, 58], [cx + side * 19, 69]], 4, 1.4, body);
      s.tag('leg').limb([[cx + side * 19, 69], [cx + side * 19.5, 71]], 1.2, 0.3, (t, sd) => SH[2]);
      // the knee: a spur of crystal
      s.tag('crystal').shard(cx + side * 16.5, 46, 4, 2, side * 1.5, CR);
    }
    // the thorax: a long dome, open in front where the shard is caged
    s.tag('body').ell(cx, 35, 12.5, 9, SH, { lo: 1, hi: 7, bias: 0.08 });
    s.tag('belly').ell(cx, 42, 8, 3.8, SH, { lo: 0, hi: 4 });
    // the cage: a dark hollow, the shard in it, ribs curving over it
    s.tag('cage').ell(cx, 37.5, 5.4, 5, [SH[0], SH[0], SH[1]], { lo: 0, hi: 2 });
    fpKeeperShard(s, cx, 42, 9, 4);
    s.tag('rib');
    for (const rx of [-4.2, -1.6, 1.6, 4.2]) s.limb([[cx + rx * 0.9, 31.5], [cx + rx * 1.3, 37.5], [cx + rx * 0.8, 42.5]], 1, 0.8, (t, sd) => (sd < 0 ? SH[6] : SH[3]));
    // crystal grown along its back
    for (const [x, h, lean] of [[-10, 5, -2], [-7, 7, -1.4], [6.5, 6, 1.5], [9.5, 4, 2.4]]) s.tag('crystal').shard(cx + x, 29 + Math.abs(x) * 0.2, h, 2.6, lean, CR);
    // the neck, curving up and back over the body, and the skull
    s.tag('neck').limb([[cx, 29], [cx - 3, 22], [cx - 1, 17], [cx + 1, 14]], 4.6, 3, body);
    s.tag('head').ell(cx + 1, 11, 4.6, 5.4, SH, { lo: 1, hi: 7, bias: 0.12 });
    s.tag('jaw').ell(cx + 1, 16.4, 2.4, 2, SH, { lo: 0, hi: 3 });
    // its crown: crystal spines fanned up from the skull
    for (const [x, h, lean] of [[-3.4, 4, -2.4], [-1.2, 5.5, -0.8], [1.2, 6, 0.6], [3.4, 4.5, 2.2]]) s.tag('crystal').shard(cx + 1 + x, 6.8, h, 1.8, lean, CR);
    // eyes: two pale slits, and a third over them
    s.tag('eye');
    for (const [x, y] of [[-2.4, 11], [-1.4, 11.6], [-0.6, 12], [2.6, 12], [3.4, 11.6], [4.4, 11]]) s.px(cx + x, y, CR[3], true);
    s.px(cx + 1, 9, CR[2], true); s.px(cx + 1, 8.4, CR[1], true);
    for (let x = cx - 0.5; x <= cx + 2.5; x++) s.px(x, 16.6, (Math.round(x) % 2) ? '#cfc4dc' : SH[0]);
    s.rim(['body', 'head', 'neck', 'leg'], fpHot(SH), SH[6], { p: 0.5, hot: 0.3 });
    return fpDone(s, 2);
  },
  // The Underforge's Keeper: a hulking brute of cooling slag that walks on
  // its knuckles, its head slung low between great shoulders, two horns
  // swept forward; magma glowing through the cracks in its plates and in
  // its jaw, the heart-shard set in a molten hollow in its chest. 62 × 62.
  underforge() {
    const W = 62, H = 62, s = new FpSpr(W, H, hashInts(0x5a6, 9)), cx = 31;
    const SL = fpRamp(['#140c0a', '#2e1c18', '#4a2e28', '#6a443a']), MG = fpGlowRamp('#ff7a2a'), body = (t, sd) => (sd < 0 ? SL[5] : sd > 0 ? SL[1] : SL[3]);
    // the hind legs, short and thick, behind
    for (const side of [-1, 1]) {
      s.tag('leg').limb([[cx + side * 9, 38], [cx + side * 13, 50], [cx + side * 12, 59]], 6, 4, (t, sd) => (sd < 0 ? SL[3] : SL[1]));
      s.tag('foot').ell(cx + side * 12.5, 59, 4, 2, SL, { lo: 0, hi: 3 });
    }
    // the back: a great hump of plate, a ridge of slag spikes along it
    s.tag('back').ell(cx, 26, 19, 13, SL, { lo: 1, hi: 7, bias: 0.06 });
    for (const [x, h] of [[-12, 4], [-7, 6], [-2, 7], [3, 7], [8, 6], [13, 4]]) s.tag('spike').limb([[cx + x, 17 - h * 0.1 + Math.abs(x) * 0.25], [cx + x * 1.1, 17 - h + Math.abs(x) * 0.25]], 3, 0.4, (t, sd) => (t > 0.7 ? SL[6] : sd < 0 ? SL[5] : SL[2]));
    // the arms: huge forearms, braced on the knuckles either side
    for (const side of [-1, 1]) {
      s.tag('arm').limb([[cx + side * 15, 24], [cx + side * 22, 38], [cx + side * 21, 52]], 8, 6.5, body);
      s.tag('fist').ell(cx + side * 21, 55, 5.4, 4.2, SL, { lo: 1, hi: 6, bias: 0.1 });
      for (const k of [-1, 0, 1]) s.tag('claw').limb([[cx + side * 21 + k * 2.6, 58], [cx + side * 21 + k * 3.2, 60.5]], 1.4, 0.4, (t) => (t > 0.5 ? '#d8c8b0' : SL[6]));
      s.tag('shoulder').ell(cx + side * 15, 22, 8, 7, SL, { lo: 2, hi: 7, bias: 0.12 });
    }
    // the chest, and the molten hollow with the shard in it
    s.tag('chest').ell(cx, 36, 11, 9, SL, { lo: 1, hi: 5 });
    s.tag('core').ell(cx, 38, 4.4, 4.6, [MG[0], MG[1], MG[2]], { lo: 0, hi: 2, glow: true });
    fpKeeperShard(s, cx, 41, 8, 4);
    // the head: low and forward between the shoulders, horns swept forward
    for (const side of [-1, 1]) s.tag('horn').limb([[cx + side * 4.5, 24], [cx + side * 9, 20], [cx + side * 10, 25], [cx + side * 8, 28.5]], 2.6, 0.3, (t, sd) => (t > 0.75 ? '#e0d4bc' : sd < 0 ? SL[6] : SL[3]));
    s.tag('head').ell(cx, 27, 6, 5, SL, { lo: 1, hi: 7, bias: 0.1 });
    // the jaw, a seam of magma, and the eyes, molten slits
    s.tag('maw');
    for (let x = cx - 3.5; x <= cx + 3.5; x++) { s.px(x, 30, MG[1], true); if (Math.abs(x - cx) < 2.5) s.px(x, 31, MG[0], true); }
    s.tag('eye');
    for (const side of [-1, 1]) { s.px(cx + side * 2.6, 26, MG[3], true); s.px(cx + side * 3.6, 25.5, MG[2], true); }
    // cracks of magma across the plates
    s.tag('crack');
    const cracks = [[[cx - 14, 22], [cx - 10, 27], [cx - 12, 31]], [[cx + 9, 18], [cx + 12, 24], [cx + 16, 26]], [[cx - 21, 34], [cx - 23, 40], [cx - 20, 45]], [[cx + 22, 36], [cx + 21, 42], [cx + 23, 47]], [[cx - 5, 33], [cx - 8, 37]], [[cx + 6, 33], [cx + 9, 36]]];
    for (const c of cracks) for (let i = 1; i < c.length; i++) { const [a, b] = [c[i - 1], c[i]], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])); for (let j = 0; j <= n; j++) { const x = a[0] + ((b[0] - a[0]) * j) / n, y = a[1] + ((b[1] - a[1]) * j) / n; if (s.tagAt(Math.round(x), Math.round(y))) s.px(x, y, j % 3 ? MG[1] : MG[2], true); } }
    s.rim(['back', 'shoulder', 'head', 'arm', 'spike'], fpHot(SL), SL[6], { p: 0.5, hot: 0.3 });
    return fpDone(s, 2);
  },
};

// A fighting plant, in the shape of a harmless one (render.js enemySprite).
// Painted as the flora is (pflora.js: by hand if its piece is, else from its
// last frame's grid), so it matches the plants round it; its cue is its
// glow gone red (kit.pal, set by the caller), and it stands where it did.
function fpPlantSprite(set, piece, kit, kind) {
  const f = piece.frames.length - 1, hand = PFL_HAND[piece.name];
  const out = Object.assign({}, hand ? hand(piece, f, kit, set + '/' + kind) : pflSprite(piece.frames[f], kit.pal, kit.letters, kit.glows));
  out.ax = out.w / 2; out.ay = out.h - footOff(1.5);
  out.flash = tinted(out.c, '#ffffff');
  return out;
}

// ---------------------------------------------------------------------------
// Painting from shapes. FpSpr is a PntSpr that remembers which part each
// pixel belongs to (tag), so a lit rim or a seam can find a part's edge.
// ---------------------------------------------------------------------------
class FpSpr extends PntSpr {
  constructor(w, h, seed, dk = 0) { super(w, h, seed); this.m = new Array(w * h).fill(null); this.cur = null; this.dk = dk; }
  tag(t) { this.cur = t; return this; }
  px(x, y, col, glow) {
    super.px(x, y, col, glow);
    x = Math.round(x); y = Math.round(y);
    if (col != null && x >= 0 && y >= 0 && x < this.w && y < this.h) this.m[y * this.w + x] = this.cur;
  }
  // (a darker creature, dk, lays its masses lower on its ramps)
  ell(cx, cy, rx, ry, ramp, o = {}) {
    const dk = o.glow ? 0 : this.dk;
    if (!dk) return super.ell(cx, cy, rx, ry, ramp, o);
    return super.ell(cx, cy, rx, ry, ramp, Object.assign({}, o, { lo: Math.max(0, (o.lo || 0) - dk), hi: (o.hi === undefined ? ramp.length - 1 : o.hi) - dk }));
  }
  // a flat plate facing us, x0..x1, y0..y1: strokes about tone `t` of the
  // ramp, its top row a lit lip, its left edge lit, its right and lowest
  // edges in shade; `round` clips its corners
  plate(x0, y0, x1, y1, R, o = {}) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const t0 = (o.t === undefined ? 3 : o.t) - (o.glow ? 0 : this.dk), n = R.length, lip = o.lip === undefined ? 2 : o.lip;
    for (let y = y0; y <= y1; y++) {
      let run = 0, rt = 0;
      for (let x = x0; x <= x1; x++) {
        if (o.round && (x === x0 || x === x1) && (y === y0 || y === y1)) continue;
        if (run <= 0) { rt = (this.rnd() + this.rnd() - 1) * 0.9; run = 2 + ((this.rnd() * 3) | 0); }
        run--;
        let t = t0 + rt - ((y - y0) / Math.max(1, y1 - y0)) * (o.fall === undefined ? 0.8 : o.fall);
        if (y === y0) t = t0 + lip + (this.rnd() < 0.3 ? 1 : 0);
        else if (x === x0) t += 1;
        else if (x === x1) t -= 1;
        if (y === y1 && y > y0) t -= 1;
        this.px(x, y, R[Math.max(0, Math.min(n - 1, Math.round(t)))], o.glow);
      }
    }
  }
  tagAt(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? null : this.m[y * this.w + x]; }
  h01(x, y, k) { return artHash(x, y + k * 977, this.seed); }
  // the lit rim: each pixel of these parts with nothing of them above it
  // (only what's in `under` above, or nothing) catches the light, a chance
  // `p` of `top` (else `next`), and the pixel below it a little
  rim(tags, top, next, o = {}) {
    const T0 = new Set(tags), U = new Set(o.under || []), p = o.p === undefined ? 0.85 : o.p, out = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const t = this.m[y * this.w + x];
      if (!T0.has(t) || (o.x0 !== undefined && (x < o.x0 || x > o.x1))) continue;
      const a = this.tagAt(x, y - 1);
      if (a !== null && !U.has(a) && !(o.left && this.tagAt(x - 1, y) === null)) continue;
      if (a !== null && !U.has(a) && o.left && this.h01(x, y, 31) > 0.5) continue;
      out.push([x, y]);
    }
    for (const [x, y] of out) {
      if (this.h01(x, y, 32) > p) continue;
      const k = this.h01(x, y, 33) < (o.hot === undefined ? 0.35 : o.hot);
      this.px(x, y, k ? top : next, o.glow);
      if (o.below && T0.has(this.tagAt(x, y + 1)) && this.h01(x, y, 34) < 0.45) this.px(x, y + 1, o.below, o.glow);
    }
  }
  // the lowest edge of these parts sinks into the dark
  under(tags, col) {
    const T0 = new Set(tags), out = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (T0.has(this.m[y * this.w + x]) && this.tagAt(x, y + 1) === null) out.push([x, y]);
    for (const [x, y] of out) this.px(x, y, col);
  }
  // a faceted crystal standing from (x, y), h px tall, w across its foot,
  // leaning `lean` px: its left face lit, the right in shade, its edge and
  // tip hot (a glow ramp: dim, mid, itself, hot)
  shard(x, y, h, w, lean, R, glow = true) {
    const tip = [x + lean, y - h];
    this.poly([[x - w / 2, y + 0.5], [x + 0.3, y + 0.5], tip], R[2]);
    this.poly([[x + 0.3, y + 0.5], [x + w / 2 + 0.2, y + 0.5], tip], R[0]);
    // its lit edge, up the left of the ridge
    const n = Math.max(2, Math.round(h));
    for (let i = 1; i <= n; i++) { const t = i / n; if (t > 0.45) this.px(x + lean * t - 0.3, y - h * t + 0.3, t > 0.8 ? R[3] : R[2], glow); }
    this.px(x + 0.6, y, R[1], glow);
    this.px(tip[0], tip[1], R[3], glow);
    if (glow) for (let yy = Math.floor(y - h); yy <= y; yy++) for (let xx = Math.floor(x - w / 2 - 1); xx <= x + w / 2 + 1; xx++) { const i = yy * this.w + xx; if (this.tagAt(xx, yy) === this.cur && xx >= 0 && yy >= 0 && xx < this.w && yy < this.h) this.g[i] = 1; }
  }
  done() {
    const out = super.done();
    return out;
  }
}

// An enemy sprite from an FpSpr: anchored at its feet (fy, the row they
// stand on, from the bottom: footOff), with its flash.
function fpDone(s, foot = 1.5, ax) {
  const out = s.done();
  out.ax = ax !== undefined ? ax : out.w / 2; out.ay = out.h - footOff(foot);
  out.flash = tinted(out.c, '#ffffff');
  return out;
}

// A shell ramp, painted: fpRamp's seven tones of a region's four.
// Hot light on a rim: a ramp's top, towards a pale warm.
const fpHot = (R) => mix(R[R.length - 1], '#efe2c8', 0.3);

// ---- the crawler -----------------------------------------------------------
// A crystal-backed beetle seen from the front and above: a domed carapace
// split down its back and cut across into plates, each lit along its top,
// a crest of faceted crystals in its region's glow, four red eyes (two big
// with a glint, two small), pale mandibles, three jointed legs a side, the
// far ones darker. pose: 'idle', 'walk' (the other three legs lifted),
// 'windup' (crouched, legs splayed, eyes hot). 29 × 20, feet on row 18.
function fpCrawler(pal, pose = 'idle', seed = 1) {
  const s = new FpSpr(29, 20, hashInts(seed, pose.length, 0xc4a)), SH = fpRamp(pal.shell), cx = 14;
  const CR = fpGlowRamp(pal.crystal[0]), EYE = ART.pal.eyeglow[0], BONE = ['#3a3028', '#6a5c4a', '#a89878', '#d8ccb0'];
  const crouch = pose === 'windup' ? 1 : 0, cy = 8.5 + crouch, splay = crouch;
  // legs, a tripod gait: hip under the shell's side, knee up and out, foot
  // down and out
  const leg = (side, k) => {
    const far = k === 0, up = pose === 'walk' && (k % 2 === 0) === (side < 0) ? 1 : 0;
    const hip = [cx + side * 7, cy + [0.5, 2.2, 3.6][k]];
    const knee = [cx + side * ([11.2, 12.2, 10.4][k] + splay), cy + [-1.6, 0.6, 3.8][k] - up - crouch * 0.5];
    const foot = [cx + side * ([13.6, 13.8, 11.6][k] + splay), [cy + 3, 15.6, 18][k] - up * 1.5];
    s.tag(far ? 'farleg' : 'leg').limb([hip, knee, foot], 1.1, 0.5, (t, sd) => (far ? SH[sd < 0 ? 2 : 1] : sd < 0 ? SH[4] : sd > 0 ? SH[1] : SH[2]));
    s.px(knee[0], knee[1] - 0.4, far ? SH[3] : SH[5]);
  };
  for (const side of [-1, 1]) leg(side, 0);
  // the carapace, and the head plate under its front
  s.tag('shell').ell(cx, cy, 9.4, 5.2, SH, { lo: 2, hi: 7, bias: 0.02 });
  s.tag('face').ell(cx, cy + 4, 6.2, 2.4, SH, { lo: 1, hi: 4, bias: -0.05 });
  for (const side of [-1, 1]) for (const k of [1, 2]) leg(side, k);
  // plates: the seam down its back and two across, each plate's top lip lit
  for (let y = Math.round(cy - 4); y <= cy + 2; y++) s.tag('seam').px(cx, y, SH[0]);
  for (const v of [-0.15, 0.45]) for (let x = cx - 9; x <= cx + 9; x++) {
    const y = Math.round(cy + v * 5.2 + ((x - cx) / 9.4) ** 2 * 1.6);
    if (s.tagAt(x, y) !== 'shell') continue;
    s.tag('seam').px(x, y, SH[x === cx ? 0 : 1]);
    if (s.tagAt(x, y + 1) === 'shell' && x !== cx && s.h01(x, y, 40) < (x < cx ? 0.85 : 0.4)) s.tag('shell').px(x, y + 1, x < cx - 3 ? SH[7] : x < cx ? SH[6] : SH[5]);
  }
  // the crest: three crystals along its spine, the middle one tallest
  s.tag('crystal');
  [[cx - 3.4, 3.4, 2.6, -0.7], [cx + 3.6, 3.0, 2.6, 0.7], [cx + 0.1, 5.2, 3.0, -0.2]].forEach(([x, h, w, l]) => s.shard(x, cy - 4 + Math.abs(x - cx) * 0.25, h - crouch * 0.5, w, l, CR));
  // the lit rim along its top, hot on the left
  s.rim(['shell'], fpHot(SH), SH[7], { under: ['crystal'], below: SH[6], hot: 0.5, p: 0.9, x0: 0, x1: cx + 4 });
  s.rim(['shell'], SH[6], SH[5], { under: ['crystal'], p: 0.6, x0: cx + 5, x1: 28 });
  s.rim(['face'], SH[5], SH[4], { p: 0.6, under: ['shell', 'seam'] });
  s.under(['face', 'shell'], SH[0]);
  // mandibles, pale at their tips
  for (const side of [-1, 1]) {
    const tip = [cx + side * 0.8, cy + 8.4 - crouch * 0.5];
    s.tag('jaw').limb([[cx + side * 1.8, cy + 5.6], [cx + side * 2.4, cy + 7.2], tip], 0.9, 0.5, (t, sd) => (t > 0.7 ? BONE[sd < 0 ? 2 : 1] : SH[sd < 0 ? 4 : 1]));
    s.px(tip[0], tip[1], BONE[3]);
  }
  // the eyes: two big, a glint each, two small; hot as it winds up
  const hot = pose === 'windup', E2 = mix(EYE, '#ffffff', hot ? 0.65 : 0.45), E0 = hot ? EYE : mix(EYE, '#000000', 0.3);
  s.tag('eye');
  for (const side of [-1, 1]) {
    const ex = side < 0 ? cx - 5 : cx + 4;
    s.px(ex, cy + 2.5, E2, true); s.px(ex + 1, cy + 2.5, EYE, true);
    s.px(ex, cy + 3.5, mix(EYE, '#000000', hot ? 0.1 : 0.35), true); s.px(ex + 1, cy + 3.5, mix(EYE, '#000000', hot ? 0.3 : 0.55), true);
    s.px(cx + side * 2, cy + 4, E0, true);
  }
  return fpDone(s);
}

// A common enemy's pose: its wind-up, a step of its walk, or as it stands.
function fpPose(spr, e) {
  if (e.state === 'windup' && spr.windup) return spr.windup;
  if ((e.state === 'chase' || e.state === 'circle') && spr.walk && Math.floor(e.bob * 8) % 2) return spr.walk;
  return spr;
}

// ---- the wisp and the Hollow -----------------------------------------------
// A ball of light breaking out of a dark shell: the core a sphere of its
// glow, hottest at the upper left; the shell in shards with gaps between,
// their upper-left edges catching the light; a smoky tail curling under
// it; a few motes. k: its size (1 the wisp, 17 × 20; the Hollow is twice
// that, near black round a magenta heart). frame 0 or 1: the tail's sway.
function fpWisp(W, H, k, C, frame = 0, seed = 1) {
  const s = new FpSpr(W, H, hashInts(seed, frame, W, 0x715)), SH = fpRamp(C.shell), cx = (W - 1) / 2, cy = 7.6 * k, sw = frame ? 1 : -1;
  const G = fpGlowRamp(C.core), IN = C.inner ? fpGlowRamp(C.inner) : G;
  // the tail: a tapered curl of smoke, its root lit by the core
  const tail = [[cx, cy + 5.6 * k], [cx + sw * 1.4 * k, cy + 7.8 * k], [cx - sw * 0.4 * k, cy + 9.6 * k], [cx - sw * 1.6 * k, H - 2.5]];
  s.tag('tail').limb(tail, 2.6 * k, 0.7, (t, sd) => (t < 0.3 ? (sd < 0 ? IN[1] : IN[0]) : t < 0.65 ? (sd < 0 ? SH[4] : SH[2]) : SH[sd < 0 ? 3 : 1]));
  s.px(tail[3][0], tail[3][1] + 0.5, SH[1]);
  // the shell: shards of a sphere round the core, gaps between
  const R0 = (C.r0 || 4.9) * k, R1 = (C.r1 || 6.9) * k, ph = seed * 0.7 + 0.4;
  s.tag('shell');
  for (let y = Math.floor(cy - R1 - 1); y <= cy + R1 + 1; y++) for (let x = Math.floor(cx - R1 - 1); x <= cx + R1 + 1; x++) {
    const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy * 1.04), a = Math.atan2(dy, dx);
    if (r < R0 || r > R1) continue;
    if (Math.abs(Math.sin(a * 2.5 + ph)) < (C.gap === undefined ? 0.3 : C.gap)) continue;
    const lit = (dx * -0.55 + dy * -0.8) / r, inner = (r - R0) / (R1 - R0);
    let t = 2.2 + lit * 2.4 - inner * 0.8 + (s.h01(x, y, 50) - 0.5) * 0.9;
    s.px(x, y, SH[Math.max(0, Math.min(SH.length - 2, Math.round(t)))]);
  }
  // their upper-left edges catch the light (and the core's glow on their
  // inner faces)
  s.rim(['shell'], fpHot(SH), SH[6], { p: 0.8, x0: 0, x1: Math.round(cx + 2 * k) });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (s.tagAt(x, y) !== 'shell') continue;
    const r = Math.hypot(x - cx, y - cy);
    if (r < R0 + 1 && s.h01(x, y, 51) < 0.55) s.px(x, y, IN[0]);
  }
  // the core, a sphere of light, its heart at the upper left
  if (C.inner) {
    // (the Hollow: a dark violet sphere round a small hot heart)
    s.tag('core').ell(cx, cy, R0 - 0.2, R0 - 0.2, ['#0c0414', '#1a0828', IN[0], IN[1]], { lo: 0, hi: 3, bias: -0.05, jit: 0.3, glow: true });
    s.ell(cx - 0.5, cy - 0.5, R0 * 0.42, R0 * 0.42, [G[0], G[1], G[2], G[3]], { lo: 1, hi: 3, bias: 0.25, jit: 0.15, glow: true });
  } else s.tag('core').ell(cx, cy, R0 - 0.2, R0 - 0.2, [IN[1], G[1], G[2], G[2], G[3]], { lo: 0, hi: 4, bias: 0.42, jit: 0.2, glow: true });
  const hx = Math.round(cx - (C.inner ? 1.4 : 1.4 * k)), hy = Math.round(cy - (C.inner ? 1.4 : 1.4 * k)), HOT = C.heart || G[3];
  s.px(hx, hy, HOT, true); s.px(hx + 1, hy, G[3], true); s.px(hx, hy + 1, G[3], true);

  // motes of its glow drifting off it
  for (let i = 0; i < 3 + 2 * k; i++) {
    const a = s.h01(i, frame, 52) * 6.28, r = R1 + 0.6 + s.h01(i, frame, 53) * 1.6 * k;
    s.px(cx + Math.cos(a) * r, cy + Math.sin(a) * r, i % 2 ? IN[1] : G[1], true);
  }
  return fpDone(s);
}

// ---- the construct and the warden -----------------------------------------
// A stalker of the dark: a lean biped in glossy chitin, seen from the front.
// A smooth, eyeless-looking skull with two slanted slits of its region's
// glow and a row of pale teeth; a spine swept up off each shoulder; a ribbed
// chest narrowing to a wasp waist, its core a slit of glow between the ribs;
// long arms ending in blade claws edged in glow, hanging to its knees; legs
// that bend back at the knee (digitigrade) onto splayed talons; a tail
// curling behind. k: its size (1: 23 × 23; the warden is 44 × 44, near
// black, with a crest of spines, four eyes and glowing seams down its
// blades). pose: 'idle', 'walk' (a stride, the arms swinging), 'windup'
// (crouched, the blades raised over its head, eyes and core hot).
function fpConstruct(W, H, k, pal, pose = 'idle', seed = 1) {
  const big = k > 1.5, s = new FpSpr(W, H, hashInts(seed, pose.length, W, 0xa11e));
  const SH = fpRamp(big ? pal.plate : pal.shell), G = fpGlowRamp(pal.rune[0]), cx = (W - 1) / 2;
  const hot = pose === 'windup', step = pose === 'walk', low = hot ? 1 : 0;
  // (a place in its units: x from the middle, y from the top)
  const P = (x, y) => [cx + x * k, (y + low) * k + 1], F = (x, y) => [cx + x * k, y * k + 1];
  const body = (t, sd) => (sd < 0 ? SH[5] : sd > 0 ? SH[1] : SH[3]);
  const far = (t, sd) => (sd < 0 ? SH[3] : SH[1]);
  // the tail, behind everything: from the hips, out and curling up
  s.tag('tail').limb([P(0.6, 13.4), P(3, 15.2), P(6.2, 15.8), P(8, 14.2), P(8.2, 12.8)], 1.4 * k, 0.3, (t, sd) => (t > 0.85 ? SH[4] : far(t, sd)));
  // the legs: thigh out to a high knee, the shin back in to the ankle,
  // talons splayed; one lifted mid-stride, both bent deeper crouched
  for (const side of [-1, 1]) {
    const lift = step && side < 0 ? 1.2 : 0, kx = side * (3.2 + low * 0.6), ky = 15.8 - lift * 0.6;
    const hip = P(side * 1.5, 13.2), knee = [cx + kx * k, (ky + low * 0.5) * k + 1], ankle = F(side * 2.2, 19.1 - lift), foot = 20.7 - lift;
    s.tag('leg').limb([hip, knee], 1.9 * k, 1.2 * k, body);
    s.tag('leg').limb([knee, ankle], 1.0 * k, 0.6 * k, body);
    s.tag('foot');
    for (const [tx, w] of [[side * 3.6, 0.7], [side * 1.2, 0.6], [side * 2.4, 0.7]]) s.limb([ankle, F(tx, foot)], w * k, 0.3, (t, sd) => (t > 0.7 ? SH[1] : sd < 0 ? SH[4] : SH[2]));
  }
  // the pelvis and the waist
  s.tag('hips').ell(...P(0, 13.1), 2.1 * k, 1.1 * k, SH, { lo: 1, hi: 5 });
  s.tag('waist').ell(...P(0, 11.5), 1.3 * k, 1.9 * k, SH, { lo: 1, hi: 5 });
  // the shoulder spines, swept up and out behind the chest
  for (const side of [-1, 1]) s.tag('spine').limb([P(side * 2.8, 8.4), P(side * 4.4, 6), P(side * 5, 4.6)], 1.4 * k, 0.3, (t, sd) => (t > 0.75 ? SH[6] : body(t, sd)));
  if (big) for (const side of [-1, 1]) s.tag('spine').limb([P(side * 1.6, 8), P(side * 2.8, 4.8), P(side * 3.2, 3.4)], 1.1 * k, 0.3, (t, sd) => (t > 0.75 ? SH[6] : body(t, sd)));
  // the chest: broad, tapering to the waist
  s.tag('chest').ell(...P(0, 9), 3.7 * k, 2.3 * k, SH, { lo: 1, hi: 6, bias: 0.05 });
  s.tag('chest').poly([P(-3.2, 9.6), P(3.2, 9.6), P(1.1, 12), P(-1.1, 12)], (x, y) => SH[x < cx - k ? 4 : x > cx + k ? 2 : 3]);
  // ribs: dark seams across, each lit along its top, broken at the middle
  for (const ry of big ? [8.6, 9.9, 11.1] : [9, 10.8]) {
    const [, y] = P(0, ry), half = Math.max(1, (3.4 - (ry - 8) * 0.9) * k);
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
      if (Math.abs(x - cx) < 1 || s.tagAt(x, Math.round(y)) !== 'chest') continue;
      s.px(x, y, SH[0]);
      if (s.tagAt(x, Math.round(y) - 1) === 'chest') s.px(x, y - 1, x < cx ? SH[5] : SH[4]);
    }
  }
  // the core: a slit of glow between the ribs, hot as it winds up
  s.tag('core');
  const [, c0] = P(0, 8.2), [, c1] = P(0, 11.6);
  for (let y = Math.round(c0); y <= Math.round(c1); y++) {
    const t = (y - c0) / Math.max(1, c1 - c0), mid = Math.abs(t - 0.4) < 0.3;
    s.px(cx, y, mid ? G[hot ? 3 : 2] : G[1], true);
    if (big) s.px(cx + (cx % 1 ? 0.5 : 1), y, mid ? G[2] : G[0], true);
  }
  // the arms: long and thin, the blades hanging along its legs; swinging
  // as it walks; winding up, folded high like a mantis, the blades hooked
  // down in front of it
  for (const side of [-1, 1]) {
    const sw = step ? side * 1.1 : 0;
    const sh = P(side * 3.5, 8.2);
    const el = hot ? P(side * 6.2, 5.6) : P(side * 5.4, 11.4 - sw);
    const wr = hot ? P(side * 7, 3.6) : P(side * 5.2, 14.4 - sw);
    const mid = hot ? P(side * 6.6, 6.8) : P(side * 6, 16.8 - sw), tip = hot ? P(side * 5.2, 9.6) : P(side * 5.1, 19.6 - sw);
    s.tag('arm').limb([sh, el], 1.3 * k, 0.9 * k, body);
    s.tag('arm').limb([el, wr], 0.9 * k, 0.8 * k, body);
    s.tag('blade').limb([wr, mid, tip], 1.2 * k, 0.15, (t, sd) => (sd > 0 ? SH[1] : sd < 0 ? SH[6] : SH[3]));
    // its outer edge glows, brightest towards the point
    const edge = [];
    for (let i = 2; i <= 10; i++) { const t = i / 10, a = t < 0.5 ? wr : mid, b = t < 0.5 ? mid : tip, u = t < 0.5 ? t * 2 : t * 2 - 1; edge.push([a[0] + (b[0] - a[0]) * u + side * 0.45 * k, a[1] + (b[1] - a[1]) * u, t]); }
    for (const [x, y, t] of edge) if (s.tagAt(Math.round(x), Math.round(y)) === 'blade') s.px(x, y, t > 0.6 ? G[hot ? 3 : 2] : G[1], true);
    // the shoulder: a glossy knob
    s.tag('shoulder').ell(sh[0], sh[1], 1.2 * k, 1.0 * k, SH, { lo: 2, hi: 7, bias: 0.1 });
  }
  // the neck and the head: a great smooth cranium tapering to a narrow jaw
  s.tag('neck').limb([P(0, 7.6), P(0, 6.2)], 1.2 * k, 1.0 * k, body);
  s.tag('head').ell(...P(0, 5.2), 1.3 * k, 1.6 * k, SH, { lo: 1, hi: 4 });
  s.tag('head').ell(...P(0, 2.9), 2.5 * k, 2.3 * k, SH, { lo: 1, hi: 7, bias: 0.14 });
  // the eyes: long slanted almonds of glow, wide set, the inner end low
  s.tag('eye');
  const eyePix = (ex, ey, len, tall) => {
    for (const side of [-1, 1]) {
      const n = Math.max(2, Math.round(len * k * 1.6));
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1), x = cx + side * (ex + len * u) * k, y = (ey + low - 0.7 * u) * k + 1, c = u > 0.3 && u < 0.8 ? G[hot ? 3 : 2] : G[hot ? 2 : 1];
        s.px(x, y, c, true);
        if (tall && u > 0.15 && u < 0.85) s.px(x, y + 1, G[1], true);
      }
    }
  };
  eyePix(0.6, 3.7, big ? 1.7 : 1.3, false);
  // the jaw: a seam of pale teeth, gaping as it winds up
  s.tag('teeth');
  const [, ty] = P(0, 5.9);
  for (let x = Math.round(cx - 0.8 * k); x <= Math.round(cx + 0.8 * k); x++) {
    if (!hot) { s.px(x, ty, SH[0]); continue; }
    s.px(x, ty, (x + Math.round(ty)) % 2 === 0 ? '#c8bca4' : SH[0]);
    s.px(x, ty + 1, G[0], true);
    if (big) s.px(x, ty + 2, (x + Math.round(ty)) % 2 ? '#d8ccb4' : SH[0]);
  }
  // gloss: a long sheen across the cranium
  s.tag('gloss');
  for (let i = 0; i < Math.round(2.2 * k); i++) s.px(cx - 1.3 * k + i * 0.45, (1.2 + low) * k + 1 + i * 0.35, i % 3 === 2 ? SH[6] : SH[7]);
  s.rim(['head', 'shoulder', 'spine'], fpHot(SH), SH[6], { p: 0.55, hot: 0.3 });
  return fpDone(s);
}

// The training target at the outpost: the old golem of plates on brass rods
// (a boxed head with a dark visor and two red eyes, broad pauldrons, a chest
// plate with its rune lit, arms of rod with plated fists, plated legs on
// brass feet).
function fpTargetDummy(W, H, k, pal, pose = 'idle', seed = 1) {
  const s = new FpSpr(W, H, hashInts(seed, pose.length, W, 0xc0a)), PL = fpRamp(pal.plate), MT = fpRamp(pal.metal || ART.pal.metal);
  const RN = fpGlowRamp(pal.rune[0]), EYE = ART.pal.eyeglow[0], cx = Math.floor(W / 2), big = k > 1.5;
  // (q: a length at its size; X, Y: a place from the middle and the top)
  const q = (v) => Math.round(v * k), low = pose === 'windup' ? q(1) : 0, step = pose === 'walk', X = (v) => cx + q(v), Y = (v) => q(v) + 1;
  // legs: a plate each on a brass foot; one lifted mid-stride
  for (const side of [-1, 1]) {
    const lift = step && side < 0 ? q(1) : 0, l0 = side < 0 ? X(-4) : X(2), l1 = side < 0 ? X(-2) : X(4);
    s.tag('leg').plate(l0, Y(14) + low, l1, Y(19) - lift, PL, { t: 4, lip: 1, fall: 1.2 });
    s.tag('foot').plate(l0 - q(1), Y(19) + 1 - lift, l1 + (side > 0 ? q(1) : 0), Y(20.6) - lift, MT, { t: 3, lip: 2, round: true });
  }
  // arms: brass rods, plated fists; swinging as it walks, drawn back to strike
  const back = pose === 'windup' ? q(1) : 0;
  for (const side of [-1, 1]) {
    const sw = step ? side * q(1) : 0, ax0 = side < 0 ? X(-8) : X(7), hy = Y(14) + low - sw - back;
    s.tag('arm').plate(ax0, Y(8) + low, ax0 + q(1.6), hy, MT, { t: 4, lip: 1, fall: 1.4 });
    s.tag('fist').plate(ax0 - q(0.6), hy + 1, ax0 + q(2.2), hy + q(2), PL, { t: 4, lip: 2, round: true });
  }
  // the chest, the brass band at its waist, the pauldrons over it
  s.tag('chest').plate(X(-5), Y(7) + low, X(5), Y(13) + low, PL, { t: 4.4, lip: 2, fall: 1.6 });
  s.tag('waist').plate(X(-4.6), Y(13) + 1 + low, X(4.6), Y(13.8) + 1 + low, MT, { t: 3, lip: 1 });
  for (const side of [-1, 1]) s.tag('shoulder').ell(cx + side * q(7) + (side > 0 ? 0 : 0.5), Y(7.6) + low, q(2.8) + 0.4, q(1.7) + 0.4, PL, { lo: 2, hi: 7, bias: 0.08 });
  // a neck, and the head: brass round a dark visor
  s.tag('neck').plate(X(-2), Y(5) + low, X(2), Y(7) + low, MT, { t: 1, lip: 0, fall: 0.4 });
  s.tag('head').plate(X(-4), Y(0) + low, X(4), Y(5.4) + low, MT, { t: 3, lip: 2, round: true });
  s.tag('visor').plate(X(-3), Y(1.4) + low, X(3), Y(4.4) + low, PL, { t: 1, lip: 0, fall: 0.5 });
  // seams: across the chest, down its middle under the rune; rivets on the
  // big one
  s.tag('seam');
  for (let x = X(-5) + 1; x < X(5); x++) if (Math.abs(x - cx) > q(1.6)) s.px(x, Y(9) + low, PL[1]);
  for (let y = Y(11) + low; y < Y(13) + low; y++) s.px(cx, y, PL[1]);
  if (big) for (const side of [-1, 1]) for (const dy of [8, 12]) { s.px(cx + side * q(4) - (side > 0 ? 1 : 0), Y(dy) + low, PL[6]); s.px(cx + side * q(4) - (side > 0 ? 1 : 0), Y(dy) + 1 + low, PL[1]); }
  // the rune, a faceted crystal in the chest
  const hot = pose === 'windup', ry = Y(10.2) + low, rr = big ? 2.6 : 1.4;
  s.tag('rune');
  for (let y = -Math.ceil(rr * 1.5); y <= Math.ceil(rr * 1.5); y++) for (let x = -Math.ceil(rr); x <= Math.ceil(rr); x++) {
    if (Math.abs(x) / (rr + 0.4) + Math.abs(y) / (rr * 1.5 + 0.4) > 1) continue;
    s.px(cx + x, ry + y, x < 0 || (x === 0 && y < 0) ? (y < 0 ? RN[3] : RN[2]) : y < 0 ? RN[2] : RN[hot ? 2 : 1], true);
  }
  // the eyes: a pixel each with a glint (two rows on the warden), hot as
  // it winds up
  const ey = Y(2.4) + low, E2 = mix(EYE, '#ffffff', hot ? 0.6 : 0.35);
  s.tag('eye');
  for (const side of [-1, 1]) {
    const ex = side < 0 ? cx - q(2) : cx + q(1);
    s.px(ex, ey, E2, true); s.px(ex + 1, ey, EYE, true);
    if (big) { s.px(ex, ey + 1, EYE, true); s.px(ex + 1, ey + 1, mix(EYE, '#000000', 0.3), true); }
    else if (hot) s.px(ex, ey + 1, mix(EYE, '#000000', 0.3), true);
  }
  // the lit rim over its top
  s.rim(['shoulder', 'head'], fpHot(MT), MT[7], { p: 0.6, hot: 0.4 });
  return fpDone(s);
}

// ---------------------------------------------------------------------------
// The climes' own creatures (foesart.js has their old grids, foes.js what
// they do), painted from shapes. Each painter takes the frame's name, its
// variant, its colours and the old frame's size (so anchors stay put) and
// returns an FpSpr. FP_FOE[type](frame, variant, pal, W, H).
// ---------------------------------------------------------------------------
const FP_FOE = {};
// a thin leg through points: lit on its upper-left side, darker if far
const fpThinLeg = (s, pts, R, far, w0 = 1.1, w1 = 0.6) => { const d = s.dk; s.limb(pts, w0, w1, (t, sd) => (far ? R[sd < 0 ? 3 - d : 1] : sd < 0 ? R[5 - d] : sd > 0 ? R[2 - d] : R[3 - d])); };
// a heap of sand or mire: a low dome in strokes, lit on top, its foot
// melting into the ground (its lowest row dark and broken)
function fpMound(s, cx, by, rx, ry, R, seed = 0) {
  s.tag('mound').ell(cx, by - ry, rx, ry, R, { lo: 1, hi: 6, bias: 0.12, jit: 0.35, mask: (x, y) => y <= by });
  for (let x = Math.floor(cx - rx); x <= cx + rx; x++) if (s.tagAt(x, by) === 'mound' && s.h01(x, seed, 60) < 0.45) s.px(x, by, null);
  s.rim(['mound'], R[6], R[5], { p: 0.55 });
  // grains
  for (let i = 0; i < rx * 0.8; i++) { const x = cx - rx * 0.8 + s.h01(i, seed, 61) * rx * 1.6, y = by - 1 - s.h01(i, seed, 62) * ry; if (s.tagAt(Math.round(x), Math.round(y)) === 'mound') s.px(x, y, R[s.h01(i, seed, 63) < 0.5 ? 2 : 5]); }
}

// ---- the Dune Skink --------------------------------------------------------
// From above: a slim rust lizard, a cream stripe down its back, amber eyes
// at its head's sides, four splayed legs with toes, its tail curling. move,
// move2: its legs stepping and its tail swinging; attack: reared out of
// the sand, jaws open on pale teeth; dig: half sunk; mound, mound2: a heap
// of sand with its eyes peeping.
FP_FOE.skink = (frame, v, P, W, H) => {
  const s = new FpSpr(W, H, hashInts(frame.length, frame.charCodeAt(2), 0x5c1), 2), R = fpRamp(P.hide), B = fpRamp(P.belly), SA = fpRamp(P.sand), TH = fpRamp(P.horn), EY = P.eye[0], cx = 10;
  const eye = (x, y) => { s.tag('eye').px(x, y, EY, true); };
  if (frame === 'mound' || frame === 'mound2') {
    const dx = frame === 'mound2' ? 1 : 0;
    fpMound(s, cx + dx, H - 2, 9.5, 4, SA, dx);
    eye(cx - 2 + dx, H - 6); eye(cx + 2 + dx, H - 6);
    return s;
  }
  if (frame === 'attack' || frame === 'dig') {
    const up = frame === 'attack';
    fpMound(s, cx, H - 2, 10.4, up ? 3 : 3.2, SA, 3);
    if (up) {
      // reared, seen head on: a throat, two eye bumps, the jaws open
      s.tag('body').ell(cx, H - 6, 3.6, 4, R, { lo: 2, hi: 6 });
      for (let y = H - 9; y < H - 3; y++) s.tag('stripe').px(cx, y, B[y % 2 ? 4 : 3]);
      s.tag('jaw').ell(cx - 3.6, 4.6, 3.2, 3.4, R, { lo: 2, hi: 7 }); s.tag('jaw').ell(cx + 3.6, 4.6, 3.2, 3.4, R, { lo: 1, hi: 6 });
      s.tag('maw').ell(cx, 6.2, 2.6, 2.6, ['#140806', '#2a0e0a', '#401410'], { lo: 0, hi: 2, bias: -0.2 });
      for (const [x, y] of [[cx - 2, 3], [cx + 2, 3], [cx - 2, 7], [cx + 2, 7], [cx, 9]]) s.tag('tooth').px(x, y, TH[x < cx ? 5 : 4]);
      s.rim(['jaw'], fpHot(R), R[7], { p: 0.9 });
      eye(cx - 5, 2); eye(cx + 4, 2);
    } else {
      s.tag('body').ell(cx, H - 5, 3.2, 3.4, R, { lo: 2, hi: 6, mask: (x, y) => y < H - 3 });
      s.tag('head').ell(cx, 3.2, 3.2, 2.6, R, { lo: 2, hi: 7 });
      for (const side of [-1, 1]) fpThinLeg(s, [[cx + side * 2.5, H - 5], [cx + side * 5, H - 5.5], [cx + side * 6, H - 4]], R, false);
      s.rim(['head', 'body'], fpHot(R), R[7], { p: 0.8 });
      eye(cx - 3, 3); eye(cx + 3, 3);
    }
    return s;
  }
  // walking: which legs reach forward, which way the tail swings
  const ph = frame === 'move' ? 1 : frame === 'move2' ? -1 : 0;
  const legs = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  for (const [side, end] of legs) {
    const fwd = ph * side * end * -1, hy = end < 0 ? 8 : 14, ky = hy + end * 0.4 - fwd * 0.8, fy = hy + end * 2.4 - fwd * 1.8;
    fpThinLeg(s, [[cx + side * 2.6, hy], [cx + side * 4.8, ky], [cx + side * 6.2, fy]], R, false, 1.4, 0.9);
    // toes, spread
    const tx = cx + side * 6.4, ty = Math.round(fy);
    s.tag('toe').px(tx + side, ty + end * -1, R[3]); s.px(tx - side * 0.2, ty + end, R[2]); s.px(tx + side, ty + end * 0.6, R[4]);
  }
  // the tail: from the hips, tapering, curling the way it swings
  const sw = ph === 0 ? 1 : -ph;
  s.tag('tail').limb([[cx, 15], [cx + sw * 0.6, 18.5], [cx + sw * 1.6, 21.5], [cx + sw * 2.6, 24.2]], 2.6, 0.6, (t, sd) => (sd < 0 ? R[5] : sd > 0 ? R[2] : R[3]));
  // the body, neck and head
  s.tag('body').ell(cx, 11.2, 3.5, 5.2, R, { lo: 2, hi: 6, bias: 0.02 });
  s.tag('body').ell(cx, 5.8, 2.4, 1.8, R, { lo: 2, hi: 6 });
  s.tag('head').ell(cx, 3, 2.9, 2.4, R, { lo: 2, hi: 7, bias: 0.04 });
  // the cream stripe down its back, in strokes
  for (let y = 6; y <= 15; y++) {
    const wdt = y >= 9 && y <= 13 ? 1 : 0;
    for (let x = cx - wdt; x <= cx + wdt; x++) s.tag('stripe').px(x, y, B[x < cx ? 5 : x > cx ? 3 : (y + s.h01(x, y, 64) * 2) % 3 < 1 ? 5 : 4]);
  }
  s.px(cx, 5, B[3]);
  s.rim(['head', 'body'], fpHot(R), R[7], { p: 0.85, under: ['stripe'] });
  s.rim(['tail'], R[6], R[5], { p: 0.5 });
  s.under(['body', 'tail'], R[1]);
  // amber eyes at the head's sides, the nostrils
  eye(cx - 3, 3); eye(cx + 3, 3);
  s.tag('nose').px(cx - 1, 1, R[1]); s.px(cx + 1, 1, R[1]);
  return s;
};

// ---- the Tusker ------------------------------------------------------------
// Side on, facing right (mirrored to face left): a great shaggy hump in
// dusk violet, frost along its ridge, a frosted trunk and an ivory tusk
// hooked forward and up, an ice-blue eye; fur hanging in strands over four
// thick legs, the far pair darker. move: a step; windup: head down, eye
// white-hot; charge: legs at full stretch.
FP_FOE.tusker = (frame, v, P, W, H) => {
  const s = new FpSpr(W, H, hashInts(frame.length, frame.charCodeAt(0), 0x705)), R = fpRamp(P.hide), B = fpRamp(P.belly), TU = fpRamp(P.horn);
  const low = frame === 'windup' || frame === 'charge' ? 1 : 0, by = H - 2;
  // legs: [x, far], each a thick column with a dark hoof
  const legs = [[8, true], [11, false], [19, true], [22, false]];
  legs.forEach(([x, far], i) => {
    let dx = 0, lift = 0;
    if (frame === 'move') { dx = i % 2 ? 0 : 0; lift = i === 1 || i === 2 ? 1 : 0; }
    if (frame === 'charge') dx = i < 2 ? -2 + (i % 2) * -1 : 2 + (i % 2);
    const top = by - 7, foot = by - lift, fx = x + dx + (far ? 1 : 0);
    s.tag(far ? 'farleg' : 'leg').limb([[x + (far ? 1 : 0), top], [fx, foot - 1.5]], 3.2, 2.8, (t, sd) => (far ? R[sd < 0 ? 3 : 1] : sd < 0 ? R[5] : sd > 0 ? R[2] : R[3]));
    s.tag('hoof').plate(Math.round(fx - 1.4), Math.round(foot - 1), Math.round(fx + 1.4), Math.round(foot), R, { t: far ? 0 : 1, lip: 1 });
  });
  // the body: a hump over a barrel
  s.tag('body').ell(14, 9.8 + low * 0.5, 12, 6, R, { lo: 2, hi: 6, bias: 0.02 });
  s.tag('body').ell(12.5, 7.4, 9.2, 5.8, R, { lo: 2, hi: 7, bias: 0.06 });
  // the head, low at the front, and the trunk hanging from it
  const hy = 10.4 + low;
  s.tag('head').ell(27, hy, 5.4, 4.4, R, { lo: 2, hi: 6, bias: -0.02 });
  s.tag('trunk').limb([[30.5, hy + 0.5], [32.6, hy + 2.6], [32.4, hy + 4.6 - low]], 2.6, 1.6, (t, sd) => (sd < 0 ? B[5] : sd > 0 ? B[2] : B[3]));
  // shag: strands hanging under the belly and the jaw
  for (let x = 4; x <= 29; x++) {
    let y = H - 1;
    while (y > 0 && !['body', 'head'].includes(s.tagAt(x, y))) y--;
    if (y <= 0 || s.h01(x, 0, 65) < 0.35) continue;
    const n = 1 + (s.h01(x, 1, 65) < 0.4 ? 1 : 0);
    for (let k = 1; k <= n; k++) if (!['leg', 'hoof'].includes(s.tagAt(x, y + k))) s.tag('shag').px(x, y + k, R[k === 1 ? 2 : 1]);
  }
  // frost along the ridge, thick on the hump, and on the brow
  s.rim(['body', 'head'], B[6], B[5], { p: 0.95, hot: 0.5, below: B[3] });
  for (let x = 6; x <= 20; x++) { let y = 0; while (y < H && s.tagAt(x, y) === null) y++; if (y < H - 1 && s.h01(x, 2, 65) < 0.6) s.px(x, y + 1, B[s.h01(x, 3, 65) < 0.5 ? 4 : 3]); }
  // fur strokes over the flank, darker, slanting back
  for (let i = 0; i < 16; i++) {
    const x = 5 + s.h01(i, 4, 65) * 20, y = 8 + s.h01(i, 5, 65) * 6;
    if (s.tagAt(Math.round(x), Math.round(y)) === 'body' && s.tagAt(Math.round(x) + 1, Math.round(y) + 1) === 'body') { s.px(x, y, R[2]); s.px(x + 1, y + 1, R[2]); }
  }
  // the tusk, ivory, hooked forward and up
  s.tag('tusk').limb([[28.2, hy + 3.4], [31, hy + 5.2], [33.6, hy + 3.6], [34, hy + 1.8]], 1.8, 0.8, (t, sd) => TU[sd < 0 ? 5 : sd > 0 ? 3 : 4]);
  s.px(34, hy + 1.6, TU[6]);
  // the eye: ice blue, white-hot as it winds up
  const hot = frame === 'windup' || frame === 'charge';
  s.tag('eye').px(27, hy - 1.4, hot ? P.white[0] : P.eye[0], true);
  if (hot) s.px(28, hy - 1.4, P.eye[0], true);
  s.under(['body'], R[1]);
  return s;
};

// ---- the Ash Wraith --------------------------------------------------------
// A hooded drift of pale ash round a dark face: two amber eyes, an ember
// heart in its breast, ragged sleeves, its hem thinning to a wisp. move:
// its wisp swings; windup: swelling with heat, cracks of fire across it,
// eyes and heart white-hot; rise: its hood out of the fissure; spent: a
// heap of cinder.
FP_FOE.wraith = (frame, v, P, W, H) => {
  const s = new FpSpr(W, H, hashInts(frame.length, frame.charCodeAt(0), 0x3a7)), R = fpRamp(P.hide), cx = (W - 1) / 2;
  const FL = fpGlowRamp(P.flame[0]), CO = fpGlowRamp(P.core[0]), EY = P.eye[0], hot = frame === 'windup';
  const face = (fx, fy, rx, ry) => {
    s.tag('face').ell(fx, fy, rx, ry, [P.maw[0], P.maw[0], R[0], R[1]], { lo: 0, hi: 2, bias: -0.3 });
    s.tag('eye').px(fx - 2, fy, hot ? P.white[0] : EY, true); s.px(fx + 2, fy, hot ? P.white[0] : EY, true);
  };
  if (frame === 'spent') {
    s.tag('ash').ell(cx, H - 3.6, 5.6, 2.8, R, { lo: 1, hi: 6, bias: 0.1, mask: (x, y) => y <= H - 2 });
    s.rim(['ash'], R[7], R[6], { p: 0.7 });
    s.tag('ember').px(cx, H - 4, CO[0], true); s.px(cx + 1, H - 3, FL[0], true);
    return s;
  }
  if (frame === 'rise') {
    s.tag('ash').ell(cx, 5, 6, 4.6, R, { lo: 2, hi: 7, bias: 0.06, mask: (x, y) => y <= H - 3 });
    face(cx, 4.4, 3.2, 1.8);
    for (const [x, y, k] of [[cx, 7, 2], [cx - 1, 8, 1], [cx + 1, 8, 1], [cx, 9, 2], [cx - 2, 7, 0], [cx + 2, 7, 0]]) s.tag('ember').px(x, y, FL[k], true);
    s.rim(['ash'], fpHot(R), R[7], { p: 0.9 });
    return s;
  }
  const sw = frame === 'move' ? -1.6 : 0, swell = hot ? 0.8 : 0;
  // the hem thinning to a wisp
  s.tag('ash').limb([[cx, 11], [cx + sw * 0.4, 14], [cx + sw, 16.4], [cx + sw * 1.6, H - 2]], 8.6 + swell, 0.8, (t, sd) => R[sd < 0 ? 5 : sd > 0 ? 2 : 3]);
  // ragged sleeves hanging at its sides
  for (const side of [-1, 1]) s.tag('ash').limb([[cx + side * 5.4, 8], [cx + side * (7.6 + swell), 10.5], [cx + side * (8.2 + swell), 13.2 + (side < 0 ? sw * 0.3 : 0)]], 2.6, 0.7, (t, sd) => R[side < 0 ? (sd < 0 ? 5 : 3) : sd < 0 ? 3 : 2]);
  // the cloak and the hood
  s.tag('ash').ell(cx, 9.6, 6.6 + swell, 4.6, R, { lo: 1, hi: 5, bias: 0 });
  s.tag('hood').ell(cx, 5.4, 5.6 + swell * 0.5, 5, R, { lo: 2, hi: 6, bias: 0.02 });
  face(cx, 5.8, 3.4, 2.4);
  // ash flakes: strokes of its palest tone on the lit side
  for (let i = 0; i < 7; i++) { const x = cx - 5 + s.h01(i, 0, 66) * 7, y = 7 + s.h01(i, 1, 66) * 7; if (s.tagAt(Math.round(x), Math.round(y)) === 'ash') { s.px(x, y, R[6]); s.px(x + 1, y, R[5]); } }
  s.rim(['hood', 'ash'], fpHot(R), R[7], { p: 0.9, under: ['hood'] });
  // the ember heart; cracks of fire as it winds up
  const hy = 10;
  s.tag('heart').px(cx, hy, hot ? P.white[0] : CO[3], true); s.px(cx - 1, hy, CO[2], true); s.px(cx + 1, hy, CO[1], true); s.px(cx, hy - 1, FL[2], true); s.px(cx, hy + 1, CO[1], true);
  if (hot) {
    for (const [x0, y0, dx, dy, n] of [[cx - 1, hy, -1, -0.6, 5], [cx + 1, hy, 1, -0.5, 5], [cx - 1, hy + 1, -0.7, 1, 5], [cx + 1, hy + 1, 0.8, 1, 5], [cx, hy + 2, 0, 1, 5]])
      for (let k = 1; k <= n; k++) if (s.tagAt(Math.round(x0 + dx * k), Math.round(y0 + dy * k)) === 'ash') s.px(x0 + dx * k, y0 + dy * k, FL[k < 3 ? 2 : 1], true);
    s.px(cx - 1, hy - 1, CO[2], true); s.px(cx + 1, hy - 1, CO[2], true); s.px(cx - 1, hy + 1, CO[2], true); s.px(cx + 1, hy + 1, CO[2], true);
  }
  return s;
};

// ---- the Bog Lurker --------------------------------------------------------
// Sunk to its eyes in the mire: a low dome of peat violet spotted with moss,
// two chartreuse eyes on stalks. blink: the eyes drawn down; windup: risen,
// a wide mouth, its pale throat; attack: gaping, its tongue's root alight.
FP_FOE.lurker = (frame, v, P, W, H) => {
  const s = new FpSpr(W, H, hashInts(frame.length, frame.charCodeAt(0), 0x1c4)), R = fpRamp(P.hide), M = fpRamp(P.moss), B = fpRamp(P.belly), cx = (W - 1) / 2;
  const up = frame === 'windup' || frame === 'attack', blink = frame === 'blink', by = H - 1.5;
  const top = up ? 4 : 5, ey = blink ? 2 : 1;
  // eye stalks and eyes
  for (const side of [-1, 1]) {
    const ex = cx + side * 6.5 - (side > 0 ? 0 : 0);
    s.tag('stalk').limb([[ex, top + 1.5], [ex + side * 0.3, ey + 1.5]], 1.2, 1, (t, sd) => R[sd < 0 ? 5 : 3]);
    s.tag('eye').px(ex - 0.5, ey, P.eye[0], true); s.px(ex + 0.5, ey, mix(P.eye[0], '#ffffff', 0.4), true);
    s.px(ex - 0.5, ey + 1, mix(P.eye[0], '#000000', 0.35), true); s.px(ex + 0.5, ey + 1, P.eye[0], true);
  }
  // the dome
  if (up) {
    s.tag('body').ell(cx, 9.4, 9.6, 6.4, R, { lo: 2, hi: 6, mask: (x, y) => y <= by });
    // the mouth: a dark slot across, its lip lit, the throat pale under it
    const open = frame === 'attack';
    for (let x = Math.round(cx - 8); x <= cx + 8; x++) {
      const d = Math.abs(x - cx) / 8.5, h = open ? Math.round(2.6 * Math.sqrt(1 - d * d)) : 1;
      for (let y = 9; y < 9 + h; y++) s.tag('maw').px(x, y, P.maw[0]);
      s.tag('lip').px(x, 8, R[d < 0.9 ? 4 : 3]);
      s.tag('throat').px(x, 9 + h, B[d < 0.5 ? 4 : 3]);
      if (H > 12 + h) s.px(x, 10 + h, B[2]);
    }
    if (open) { s.tag('tongue').px(cx, 10, P.core[0], true); s.px(cx - 1, 10, mix(P.core[0], '#000000', 0.3), true); s.px(cx + 1, 10, mix(P.core[0], '#000000', 0.3), true); s.px(cx, 11, mix(P.core[0], '#ffffff', 0.4), true); }
  } else s.tag('body').ell(cx, by + 2.4, 9.8, 6.4, R, { lo: 2, hi: 6, mask: (x, y) => y <= by });
  // moss spots
  for (const [dx, dy] of [[-5, 1], [-1, 2], [3, 1.4], [6, 2.4], [-7, 3.4]]) {
    const x = Math.round(cx + dx), y = Math.round(top + dy);
    if (s.tagAt(x, y) === 'body') { s.tag('moss').px(x, y, M[4]); if (s.tagAt(x + 1, y) === 'body') s.px(x + 1, y, M[3]); if (s.tagAt(x, y + 1) === 'body') s.px(x, y + 1, M[2]); }
  }
  s.rim(['body'], fpHot(R), R[7], { p: 0.9, under: ['stalk', 'moss'] });
  // the water line: its lowest row broken into the mire
  for (let x = 0; x < W; x++) if (s.tagAt(x, Math.floor(by)) === 'body' && s.h01(x, 7, 67) < 0.4) s.px(x, Math.floor(by), R[1]);
  return s;
};

// ---- the Ceiling Dropper ---------------------------------------------------
// A squat round thing: a grey-green carapace over a pale belly, a row of
// four red eyes along its rim, six hooked legs. move: its legs shifting;
// windup: hunched, eyes white-hot; drop: legs flung wide as it lands.
FP_FOE.dropper = (frame, v, P, W, H) => {
  const s = new FpSpr(W, H, hashInts(frame.length, frame.charCodeAt(0), 0xd2b), 1), R = fpRamp(P.hide), B = fpRamp(P.belly), cx = (W - 1) / 2;
  const hun = frame === 'windup' ? 1 : 0, wide = frame === 'drop', mv = frame === 'move';
  const cy = 5.6 + hun;
  // legs: three a side, hooked down to a point
  for (const side of [-1, 1]) for (let k = 0; k < 3; k++) {
    const hip = [cx + side * 5.4, cy + 1 + k * 1.4], sh = mv ? (k % 2 ? 1 : -1) * side : 0;
    const knee = wide ? [cx + side * (9 + k * 1.2), cy - 1.5 + k * 2.6] : [cx + side * (8.6 + k * 0.6), cy - 2.6 + k * 1.8 + sh];
    const foot = wide ? [cx + side * (11.6 + k * 0.4), cy + 1 + k * 2.6] : [cx + side * (9.6 + k * 0.4 - (k === 2 ? 1 : 0)), H - 2 - (2 - k) * 2.4 + sh];
    fpThinLeg(s, [hip, knee, foot], R, k === 0, 1.2, 0.6);
    s.tag('claw').px(foot[0], foot[1] + 0.5, R[1]);
  }
  // the belly under, then the carapace
  s.tag('belly').ell(cx, cy + 3.4, 5.6, 2.6, B, { lo: 2, hi: 5, bias: -0.05 });
  s.tag('shell').ell(cx, cy, 6.2, 4.6, R, { lo: 2, hi: 7, bias: 0.04, mask: (x, y) => y <= cy + 2.4 });
  // ridges on the carapace
  for (const dx of [-2, 2]) for (let y = Math.round(cy - 3); y <= cy + 1; y++) if (s.tagAt(Math.round(cx + dx), y) === 'shell') s.tag('ridge').px(cx + dx + (dx < 0 ? -0.4 : 0), y, R[dx < 0 ? 5 : 2]);
  s.rim(['shell'], fpHot(R), R[7], { p: 0.9, under: ['ridge'] });
  s.under(['belly'], B[1]);
  // the eyes: a row of four along the rim
  const hot = frame === 'windup';
  for (const dx of [-3, -1, 1, 3]) s.tag('eye').px(Math.round(cx + dx - (dx > 0 ? 0 : 0)), Math.round(cy + 2.8), hot ? P.white[0] : dx === -3 ? mix(P.eye[0], '#ffffff', 0.4) : P.eye[0], true);
  return s;
};

// ---- the Pool Eel ----------------------------------------------------------
// Deep teal over a pale belly, blue fins, glowing spots along it. fin: the
// fin cutting the water; rear: reared head on, mouth open on two fangs,
// eyes at its head's sides, fins spread; lunge: the gape wider; stranded,
// stranded2: on its side, flopping, its tail up or down.
FP_FOE.eel = (frame, v, P, W, H) => {
  const s = new FpSpr(W, H, hashInts(frame.length, frame.charCodeAt(0), 0xee1), 1), R = fpRamp(P.hide), B = fpRamp(P.belly), F = fpRamp(P.horn), cx = (W - 1) / 2;
  const SP = P.core[0], EY = P.eye[0];
  if (frame === 'fin') {
    s.tag('fin').poly([[1.5, H - 1.2], [W - 2.5, H - 1.2], [4.2, 1]], (x, y) => F[x < 4.6 ? 5 : x < 6 ? 4 : 3]);
    s.rim(['fin'], F[7], F[6], { p: 1 });
    return s;
  }
  if (frame === 'stranded' || frame === 'stranded2') {
    const up = frame === 'stranded2' ? -1 : 1;
    s.tag('body').limb([[3.4, 3.4], [7, 4.6], [11.5, 4.8], [15.5, 3.8], [18.5, 3 - (up < 0 ? 0.6 : -0.4)]], 3.6, 1.8, (t, sd) => (sd > 0 ? B[3] : sd < 0 ? R[5] : R[3]));
    s.tag('tailfin').poly([[18, 3], [W - 1.4, 1 + (up < 0 ? -0.5 : 1)], [W - 1.4, 4.2 + (up < 0 ? -1 : 1)]], F[4]);
    s.tag('fin').poly([[8, 6], [11, 6], [9, 7.6]], F[3]);
    s.rim(['body'], R[6], R[5], { p: 0.8 });
    s.tag('eye').px(4, 2.6, EY, true);
    s.tag('mouth').px(2.4, 4, P.maw[0]); s.px(3, 4.4, P.maw[0]);
    for (const x of [8, 12]) s.tag('spot').px(x, 5, SP, true);
    return s;
  }
  const lunge = frame === 'lunge';
  // the body below, rising: belly pale, spots glowing, fins spread
  s.tag('fin').poly([[cx - 2.4, 8], [cx - 5.6, 9.6], [cx - 2.4, 11]], F[5]); s.poly([[cx + 2.4, 8], [cx + 5.6, 9.6], [cx + 2.4, 11]], F[3]);
  s.tag('body').limb([[cx, 7], [cx, 10], [cx + (lunge ? 0 : 0.4), H - 1.5]], lunge ? 4.4 : 5, lunge ? 1.6 : 3.6, (t, sd) => (sd < 0 ? R[5] : sd > 0 ? R[2] : R[3]));
  for (let y = 8; y < H - 1; y++) if (s.tagAt(Math.round(cx), y) === 'body') s.tag('belly').px(cx, y, B[y % 3 ? 4 : 3]);
  for (const y of [9, 11]) s.tag('spot').px(cx + (y === 9 ? -1 : 1), y, SP, true);
  // the head, head on, and its open mouth
  const hw = lunge ? 5.6 : 4.8;
  s.tag('head').ell(cx, 4, hw, 3.8, R, { lo: 2, hi: 7, bias: 0.04 });
  const mw = lunge ? 3.8 : 2.6, mh = lunge ? 2 : 1.3;
  s.tag('maw').ell(cx, 5.6, mw, mh, [P.maw[0], P.maw[0], '#0c1828'], { lo: 0, hi: 2, bias: -0.3 });
  s.tag('fang').px(cx - mw + 1, 5, B[6]); s.px(cx + mw - 1, 5, B[5]);
  s.rim(['head'], fpHot(R), R[7], { p: 0.9 });
  s.tag('eye').px(cx - hw + 1, 3, EY, true); s.px(cx + hw - 1, 3, EY, true);
  return s;
};

// ---- the Slag Crab ---------------------------------------------------------
// From the front: a crusted dome of basalt cut by dark seams (alight when
// it's cracked, frosted when it's chilled), rust claws raised either side,
// eyes on stalks, legs splayed under it. move: its legs shifting; windup:
// claws flung open, eyes white-hot.
FP_FOE.crab = (frame, v, P, W, H) => {
  const s = new FpSpr(W, H, hashInts(frame.length, frame.charCodeAt(0), 0xc7a), 1), R = fpRamp(P.hide), C = fpRamp(P.horn), cx = (W - 1) / 2;
  const open = frame === 'windup', mv = frame === 'move', cr = v === 'cracked', cy = 6.6;
  // legs: three a side, jointed, splayed down and out
  for (const side of [-1, 1]) for (let k = 0; k < 3; k++) {
    const sh = mv ? ((k + (side > 0 ? 1 : 0)) % 2 ? 1 : -1) : 0;
    const hip = [cx + side * (3.5 + k * 1.6), cy + 3.6], knee = [cx + side * (6 + k * 2.6), cy + 4.4 + sh * 0.5], foot = [cx + side * (6.6 + k * 3.4) + sh * side * 0.6, H - 2 - (k === 1 ? 0.6 : 0)];
    fpThinLeg(s, [hip, knee, foot], R, false, 1.3, 0.7);
  }
  // claws: an arm up from the shell's side, a heavy pincer at its end
  for (const side of [-1, 1]) {
    const ax = cx + side * 8.6, px = cx + side * (open ? 11 : 10.6), py = open ? 2 : 2.4;
    s.tag('arm').limb([[cx + side * 6, cy + 1.6], [ax, cy + 0.6], [px, py + 2]], 2, 1.6, (t, sd) => C[sd < 0 ? 4 : 2]);
    // the pincer: two fingers, the lower fixed, the upper hinged open
    s.tag('claw').ell(px, py + 1.4, 2.4, 1.8, C, { lo: 2, hi: 6 });
    const tip = open ? -1.8 : -0.4;
    s.limb([[px - side * 0.4, py], [px + side * 1.2, py + tip], [px + side * 2.2, py + tip + 0.6]], 1.6, 0.8, (t, sd) => C[sd < 0 ? 6 : 3]);
    s.limb([[px, py + 2.6], [px + side * 1.8, py + 2.4], [px + side * 2.4, py + 1.2]], 1.3, 0.7, (t, sd) => C[sd < 0 ? 5 : 2]);
  }
  // eye stalks
  for (const side of [-1, 1]) {
    s.tag('stalk').limb([[cx + side * 3, cy - 3], [cx + side * 3.2, 1.6]], 1.1, 0.9, (t, sd) => R[sd < 0 ? 5 : 3]);
    s.tag('eye').px(cx + side * 3.2 - (side > 0 ? 0 : 0), 1, open ? P.white[0] : P.eye[0], true);
  }
  // the shell, crusted, and its seams
  s.tag('shell').ell(cx, cy + 0.6, 8.4, 5, R, { lo: 2, hi: 6, bias: 0, jit: 0.3 });
  const seam = cr ? fpGlowRamp(P.core[0]) : [P.seam[0], P.seam[0], P.seam[1], P.seam[2]];
  for (const [x0, y0, dx, dy, n] of [[cx - 4, cy - 2.6, 0.6, 1, 4], [cx + 4, cy - 2.6, -0.6, 1, 4], [cx - 1.4, cy + 0.6, -1, 0.5, 5], [cx + 1.4, cy + 0.6, 1, 0.5, 5], [cx, cy - 3.2, 0, 1, 2]])
    for (let k = 0; k <= n; k++) { const x = Math.round(x0 + dx * k), y = Math.round(y0 + dy * k); if (s.tagAt(x, y) === 'shell') s.tag('seam').px(x, y, seam[k % 2 ? 2 : 1], cr); }
  // crust: lumps catching the light
  for (let i = 0; i < 4; i++) { const x = Math.round(cx - 6 + s.h01(i, 0, 68) * 11), y = Math.round(cy - 2 + s.h01(i, 1, 68) * 5); if (s.tagAt(x, y) === 'shell' && s.tagAt(x + 1, y) === 'shell') { s.px(x, y, R[x < cx ? 5 : 4]); s.px(x + 1, y, R[x < cx ? 4 : 3]); s.px(x + 1, y + 1, R[1]); } }
  s.rim(['shell'], fpHot(R), R[6], { p: 0.85, under: ['stalk', 'seam'], hot: 0.25 });
  s.rim(['claw'], C[7], C[6], { p: 0.8 });
  s.under(['shell'], R[1]);
  return s;
};

// ---- the Rootweaver --------------------------------------------------------
// A spider of grey bark from above: a small head with three red eyes, a
// great abdomen grown over with roots and chartreuse sacs that glow, eight
// legs bent like roots. move: its legs stepping; windup: eyes white-hot,
// sacs bright.
FP_FOE.weaver = (frame, v, P, W, H) => {
  const s = new FpSpr(W, H, hashInts(frame.length, frame.charCodeAt(0), 0x3e4), 1), R = fpRamp(P.hide), M = fpRamp(P.moss), SC = fpGlowRamp(P.core[0]), cx = (W - 1) / 2;
  const hot = frame === 'windup', mv = frame === 'move';
  // legs: four a side, each a bent root with a knuckle
  for (const side of [-1, 1]) for (let k = 0; k < 4; k++) {
    const sh = mv ? ((k + (side > 0 ? 1 : 0)) % 2 ? 1.4 : -1.4) : 0;
    const hip = [cx + side * 2.6, 4.6 + k * 1.3];
    const knee = [cx + side * (6.6 + (k === 1 || k === 2 ? 1.6 : 0)), [1.6, 4.6, 8.4, 11][k] + sh * 0.6];
    const foot = [cx + side * ([9.6, 11.6, 11.6, 9.6][k]), [3, 6.6, 10.6, 14][k] + sh];
    s.dk = 2; fpThinLeg(s, [hip, knee, foot], R, false, 1.3, 0.6); s.dk = 1;
    s.tag('knuckle').px(knee[0], knee[1] - 0.5, R[4]);
  }
  // the abdomen, then the head before it
  s.tag('abd').ell(cx, 11.2, 6.2, 5.6, R, { lo: 2, hi: 5, bias: 0 });
  s.tag('head').ell(cx, 4.4, 2.6, 2.8, R, { lo: 2, hi: 6 });
  // roots over the abdomen: dark olive strands, lit on their left
  for (const [x0, dx] of [[cx - 3, -0.3], [cx, 0], [cx + 3, 0.3]]) for (let y = 7; y <= 15; y++) {
    const x = Math.round(x0 + dx * (y - 7) + Math.sin(y * 0.9 + x0) * 0.7);
    if (s.tagAt(x, y) === 'abd') { s.tag('root').px(x, y, M[3]); if (s.tagAt(x - 1, y) === 'abd' && y % 2) s.px(x - 1, y, M[4]); }
  }
  // the sacs, glowing
  for (const [x, y] of [[cx - 2, 10], [cx + 2, 10], [cx - 2, 13], [cx + 1, 13]]) {
    s.tag('sac').px(x, y, SC[hot ? 3 : 2], true); s.px(x + 1, y, SC[1], true); s.px(x, y + 1, SC[0], true);
  }
  s.rim(['abd'], fpHot(R), R[7], { p: 0.85, under: ['root', 'head'] });
  s.rim(['head'], R[6], R[5], { p: 0.6 });
  s.under(['abd'], R[1]);
  // the eyes: three, a pixel each
  const E = hot ? P.white[0] : P.eye[0];
  s.tag('eye').px(cx - 1, 2.6, E, true); s.px(cx + 1, 2.6, E, true); s.px(cx, 3.6, hot ? P.white[0] : mix(P.eye[0], '#ffffff', 0.35), true);
  return s;
};

// ---- the Sentinel Eye ------------------------------------------------------
// A floating ring of pale stone bound in brass round a great white eye, a
// red iris, a black pupil with one glint; a brass pendant under it with a
// coal at its tip. look: the iris turned aside; windup: the pupil wide;
// sweep: lids drawn to a slit, a beam of fire in it.
FP_FOE.sentinel = (frame, v, P, W, H) => {
  const s = new FpSpr(W, H, hashInts(frame.length, frame.charCodeAt(0), 0x5e9)), R = fpRamp(P.hide), BR = fpRamp(P.horn), SC = fpRamp(P.belly), cx = (W - 1) / 2, cy = 8.6;
  // the pendant
  s.tag('pend').limb([[cx, cy + 7], [cx, cy + 8.6]], 1.6, 1, (t, sd) => BR[sd < 0 ? 5 : 3]);
  s.tag('coal').px(cx, cy + 9.2, P.core[0], true); s.px(cx, cy + 8.2, mix(P.core[0], '#000000', 0.3), true);
  if (frame === 'windup' || frame === 'sweep') { s.px(cx, cy + 10, P.flame[0], true); s.px(cx - 1, cy + 9, mix(P.flame[0], '#000000', 0.4), true); s.px(cx + 1, cy + 9, mix(P.flame[0], '#000000', 0.4), true); }
  // the brass rim, the stone ring
  s.tag('brass').ell(cx, cy, 9.4, 8, BR, { lo: 1, hi: 6, bias: 0.05 });
  s.tag('stone').ell(cx, cy, 8.2, 6.8, R, { lo: 2, hi: 7, bias: 0.06 });
  // rivets on the brass
  for (const a of [0.5, 1.6, 2.6, 3.7, 4.7, 5.8]) { const x = cx + Math.cos(a) * 8.8, y = cy + Math.sin(a) * 7.4; s.tag('rivet').px(x, y, BR[Math.cos(a) * -0.55 + Math.sin(a) * -0.8 > 0 ? 7 : 4]); }
  s.rim(['brass'], fpHot(BR), BR[7], { p: 0.9 });
  if (frame === 'sweep') {
    // lids nearly shut: a slit of white with fire across it
    for (let x = Math.round(cx - 5); x <= cx + 5; x++) { s.tag('white').px(x, cy - 1, SC[4]); s.tag('beam').px(x, cy, Math.abs(x - cx) < 2 ? P.white[0] : P.flame[0], true); s.tag('white').px(x, cy + 1, SC[3]); }
    for (let x = Math.round(cx - 5); x <= cx + 5; x++) { s.tag('lid').px(x, cy - 2, R[6]); s.px(x, cy + 2, R[2]); }
    return s;
  }
  // the white of the eye, lit from the upper left
  s.tag('white').ell(cx, cy, 6, 4.8, SC, { lo: 3, hi: 7, bias: 0.15 });
  // the iris and the pupil, turned aside to look
  const ix = cx + (frame === 'look' ? -1.6 : 0), wide = frame === 'windup';
  s.tag('iris').ell(ix, cy, 3, 2.8, fpGlowRamp(P.eye[0]), { lo: 0, hi: 3, bias: 0.15, glow: true });
  s.tag('pupil').ell(ix, cy + 0.2, wide ? 1.9 : 1.2, wide ? 1.9 : 1.4, [P.maw[0], P.maw[0], '#200810'], { lo: 0, hi: 1 });
  s.tag('glint').px(ix - 1, cy - 1, P.white[0], true);
  return s;
};

// ---- the Moss Idol ---------------------------------------------------------
// Side on, facing right (mirrored to face left): a temple guardian beast,
// half lion-dog and half gargoyle, of weathered grey stone furred with moss
// along its back, its mane and its curled tail; an open maw with pale
// fangs; cracks across its stone. still: sitting as a statue, its eyes and
// cracks dark; creep, creep2: prowling low, cracks faintly alight; windup:
// haunches gathered, cracks and eyes blazing; lunge: at full stretch.
FP_FOE.idol = (frame, v, P, W, H) => {
  const s = new FpSpr(W, H, hashInts(frame.length, frame.charCodeAt(frame.length - 1), 0x1d0), 1), R = fpRamp(P.hide), M = fpRamp(P.moss), FG = fpRamp(P.belly);
  const by = H - 2, still = frame === 'still', blaze = frame === 'windup' || frame === 'lunge', CK = fpGlowRamp(P.core[0]);
  const lim = (pts, w0, w1, far) => s.tag(far ? 'farleg' : 'leg').limb(pts, w0, w1, (t, sd) => (far ? R[sd < 0 ? 3 : 1] : sd < 0 ? R[5] : sd > 0 ? R[2] : R[3]));
  const paw = (x, y, far) => s.tag(far ? 'farleg' : 'paw').ell(x + 0.6, y - 0.8, 2.2, 1.2, R, { lo: far ? 1 : 2, hi: far ? 3 : 5 });
  // the pose: [body spine], head [x, y], legs: [hip/shoulder, knee, foot, far]
  let spine, head, legs, tail;
  if (still) {
    spine = [[8, 14.6], [14.5, 12.4], [20.5, 10.6]]; head = [25.4, 6.6];
    legs = [[[23, 12], [23.4, 16.5], [23.6, by], true], [[20.6, 12], [20.8, 16.5], [21, by], false], [[9, 16], [12.4, 18], [11.6, by], false]];
    tail = [[3.6, 14], [1.8, 9.6], [2.6, 5], [1.6, 3.4]];
  } else if (frame === 'windup') {
    spine = [[6, 13.4], [13, 11.8], [20.5, 10]]; head = [25.4, 9.4];
    legs = [[[7.6, 15], [11, 17.6], [7, by], true], [[6, 15], [9.6, 18], [5, by], false], [[21.6, 13], [21, 17], [22.6, by], true], [[19.6, 13], [18.6, 17], [19.6, by], false]];
    tail = [[3.4, 12], [1.6, 8], [2.6, 4.6], [1.6, 3]];
  } else if (frame === 'lunge') {
    spine = [[5, 9.6], [13, 9.2], [21, 8.4]]; head = [25.4, 7.4];
    legs = [[[6.6, 11.6], [3.6, 13.6], [1.4, 16], true], [[5, 11.6], [3, 14.6], [3, 17.6], false], [[21.6, 11], [25, 13.6], [28.4, 15.6], true], [[19.6, 11], [23, 14.2], [26, 17.6], false]];
    tail = [[3, 8.6], [1.4, 5], [2, 2.4], [0.8, 1.2]];
  } else {
    const ph = frame === 'creep2' ? 1 : -1;
    spine = [[5.6, 10.6], [13.4, 10.2], [21, 9.8]]; head = [25.6, 9.4];
    legs = [[[7, 13], [6.4 - ph, 17], [6.6 - ph * 2, by], true], [[5.4, 13], [4.6 + ph, 17], [4.4 + ph * 2, by], false], [[21.4, 13], [21.6 + ph, 17], [22 + ph * 2, by], true], [[19.4, 13], [19 - ph, 17], [18.6 - ph * 2, by], false]];
    tail = [[3.4, 9.6], [1.6, 6], [2.4, 3.6], [1.4, 2]];
  }
  for (const [a, b, c, far] of legs) if (far) { lim([a, b, c], 3, 2.2, true); paw(c[0], c[1], true); }
  // the tail, curled up, a tuft of moss at its tip
  s.tag('tail').limb(tail, 2.6, 1.6, (t, sd) => (t > 0.75 ? M[sd < 0 ? 5 : 3] : sd < 0 ? R[5] : R[2]));
  // the body, chest and haunch
  s.tag('body').limb(spine, still ? 9.4 : 8, still ? 8.4 : 7.4, (t, sd) => R[sd < 0 ? 5 : sd > 0 ? 2 : 3]);
  s.tag('body').ell(spine[0][0] + 1, spine[0][1] + (still ? 1 : 0.4), still ? 5.6 : 4.6, still ? 5 : 4, R, { lo: 2, hi: 6 });
  s.tag('body').ell(spine[2][0], spine[2][1] + 0.8, 4.4, 4.4, R, { lo: 2, hi: 6, bias: 0.04 });
  for (const [a, b, c, far] of legs) if (!far) { lim([a, b, c], 3.4, 2.6, false); paw(c[0], c[1], false); }
  // the mane (moss) and the head, its maw open
  const [hx, hy] = head;
  s.tag('mane').ell(hx - 3.6, hy - 0.4, 3.8, 5.2, M, { lo: 2, hi: 6, jit: 0.45 });
  s.tag('head').ell(hx, hy, 4.4, 3.8, R, { lo: 2, hi: 7, bias: 0.05 });
  s.tag('ear').poly([[hx - 2.4, hy - 3], [hx - 0.6, hy - 3.2], [hx - 1.8, hy - 5.6]], R[5]);
  s.tag('maw').poly([[hx + 1, hy + 0.6], [hx + 4.8, hy + 0.2], [hx + 4.8, hy + 3.4], [hx + 1.4, hy + 2.6]], P.maw[0]);
  s.tag('fang').px(hx + 2, hy + 1, FG[5]); s.px(hx + 4, hy + 1, FG[4]); s.px(hx + 3, hy + 2.6, FG[4]);
  s.tag('jaw').limb([[hx - 0.6, hy + 2.8], [hx + 4.4, hy + 3.8]], 1.6, 1.2, (t, sd) => R[sd < 0 ? 4 : 2]);
  // moss over its back: the top edge furred green, a little hanging over
  s.rim(['body', 'head'], M[6], M[5], { p: 0.9, under: ['mane', 'ear', 'tail'], below: M[3], hot: 0.25 });
  s.rim(['mane'], M[7], M[6], { p: 0.7 });
  s.rim(['leg', 'paw'], R[6], R[5], { p: 0.5, under: ['body'] });
  s.under(['body', 'paw'], R[1]);
  // cracks across the stone: dark in a statue, faintly lit prowling,
  // blazing as it pounces
  const crack = still ? [R[0], R[1]] : blaze ? [CK[3], CK[2]] : [CK[1], CK[0]];
  for (const [x0, y0, pts] of [[spine[0][0] + 2, spine[0][1] - 2, [[1, 1], [0, 1], [1, 1], [1, 0]]], [spine[1][0] + 1, spine[1][1] - 2, [[1, 1], [-1, 1], [1, 1], [0, 1]]], [hx - 1, hy - 2, [[1, 1], [0, 1]]]]) {
    let x = x0, y = y0;
    pts.forEach(([dx, dy], k) => { x += dx; y += dy; if (['body', 'head'].includes(s.tagAt(Math.round(x), Math.round(y)))) s.tag('crack').px(x, y, crack[k % 2], !still); });
  }
  // the eye
  s.tag('eye').px(hx + 0.6, hy - 1, still ? R[0] : blaze ? P.white[0] : P.eye[0], !still);
  if (blaze) s.px(hx + 1.6, hy - 1, P.eye[0], true);
  return s;
};

// ---- the Gear Hound --------------------------------------------------------
// Side on, facing right (mirrored to face left): a wind-up dog of blued
// iron, plated, brass at its joints, its jaw and its rivets, a brass key
// in its back. move: a trot; wind, wind2: the key face on, then edge on;
// dash: at full stretch, ears back; spent: its head hung, eyes shut.
FP_FOE.hound = (frame, v, P, W, H) => {
  const s = new FpSpr(W, H, hashInts(frame.length, frame.charCodeAt(frame.length - 1), 0x40d), 1), R = fpRamp(P.hide), BR = fpRamp(P.horn);
  const by = H - 2, dash = frame === 'dash', spent = frame === 'spent', cy = dash ? 10 : 11;
  const lim = (pts, far) => s.tag(far ? 'farleg' : 'leg').limb(pts, 2.6, 2, (t, sd) => (far ? R[sd < 0 ? 3 : 1] : sd < 0 ? R[5] : sd > 0 ? R[2] : R[3]));
  const legs = [[6.6, true], [8.6, false], [15.4, true], [17.6, false]];
  const legPts = (x, i) => {
    const front = i >= 2, top = [x, cy + 2];
    if (dash) return front ? [top, [x + 3, cy + 4.4], [x + 6, cy + 5.6]] : [top, [x - 3, cy + 4.2], [x - 6, cy + 5]];
    const ph = frame === 'move' ? (i % 2 ? 1 : -1) : 0;
    return [top, [x + ph * 0.6, cy + 4.6], [x + ph * 1.4, by - (ph > 0 && i < 2 ? 0.6 : 0)]];
  };
  legs.forEach(([x, far], i) => { if (far) { const p = legPts(x, i); lim(p, true); s.tag('knee').px(p[1][0], p[1][1], BR[3]); } });
  // tail: a short stub of rod, up
  s.tag('tail').limb([[4, cy - 1], [2.6, cy - 3.4 + (dash ? 2 : 0)]], 1.4, 1, (t, sd) => R[sd < 0 ? 5 : 2]);
  // the body: a barrel of plate
  s.tag('body').ell(11.2, cy, 8.4, 4.2, R, { lo: 2, hi: 7, bias: 0.04 });
  legs.forEach(([x, far], i) => { if (!far) { const p = legPts(x, i); lim(p, false); s.tag('knee').px(p[1][0], p[1][1], BR[5]); s.tag('foot').px(p[2][0] + 0.6, p[2][1], R[1]); } });
  // neck and head; hung low when spent
  const hx = spent ? 20 : 19.6, hy = spent ? 10.4 : dash ? 5.6 : 5.4;
  s.tag('body').limb([[16.6, cy - 1], [hx - 1, hy + 1.6]], 5.2, 4.2, (t, sd) => R[sd < 0 ? 5 : 3]);
  s.tag('head').ell(hx, hy + 0.6, 4, 3.4, R, { lo: 2, hi: 7, bias: 0.05 });
  // the snout, its brass jaw
  s.tag('snout').plate(hx + 2, hy + 1, hx + 5, hy + 2.4, R, { t: 4, lip: 2 });
  s.tag('jaw').plate(hx + 1.6, hy + 3, hx + 4.6, hy + 3.6, BR, { t: 4, lip: 1 });
  s.tag('mouth').px(hx + 3, hy + 2.6, P.maw[0]); s.px(hx + 4, hy + 2.6, P.maw[0]);
  // the ear, pricked (laid back in a dash)
  if (dash) s.tag('ear').poly([[hx - 1.6, hy - 1.4], [hx + 0.4, hy - 2], [hx - 4.4, hy - 2.8]], R[5]);
  else s.tag('ear').poly([[hx - 1.8, hy - 1.6], [hx + 0.2, hy - 2], [hx - 1.4, hy - 4.8 + (spent ? 2 : 0)]], R[5]);
  // seams and brass rivets along the barrel
  for (let x = 6; x <= 16; x += 5) for (let y = Math.round(cy - 2); y <= cy + 2; y++) if (s.tagAt(x, y) === 'body') s.tag('seam').px(x, y, R[1]);
  for (const x of [5, 10, 15]) s.tag('rivet').px(x, cy + 1, BR[5]);
  s.rim(['body', 'head', 'snout'], fpHot(R), R[7], { p: 0.85, under: ['ear', 'key'] });
  s.under(['body'], R[1]);
  // the key: a stem up from its back to a brass bow, face on or edge on
  const kx = 9.6, edge = frame === 'wind2';
  s.tag('key').limb([[kx, cy - 2.6], [kx, cy - 6.4]], 1.2, 1.2, (t, sd) => BR[sd < 0 ? 6 : 4]);
  if (edge) s.limb([[kx, cy - 6.6], [kx, cy - 10.4]], 1.6, 1.6, (t, sd) => BR[sd < 0 ? 6 : 3]);
  else for (let a = 0; a < 6.28; a += 0.3) { const x = kx + Math.cos(a) * 2, y = cy - 8.6 + Math.sin(a) * 1.8; s.px(x, y, BR[Math.cos(a) * -0.55 + Math.sin(a) * -0.8 > 0.2 ? 7 : 4]); }
  // the eye: shut when spent
  s.tag('eye').px(hx + 0.6, hy, spent ? R[1] : P.eye[0], !spent);
  if (frame === 'wind' || frame === 'wind2' || dash) s.px(hx + 1.4, hy, mix(P.eye[0], '#ffffff', 0.4), true);
  return s;
};

// ---- critters ----------------------------------------------------------------
// The small harmless life (life.js): too small to shade by form, so each is
// its few flat colours with no outline, its top edge catching the light and
// its lowest sinking into shade, its eye a single dark (or lit) pixel. A
// pixel of clear all round, as before, so it stands where it did.
function fpCritterCanvas(rows, pal, kind) {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length)), W = w + 2, H = h + 2, P = pixBuf(W, H);
  const at = (x, y) => (y < 0 || y >= h || x < 0 || x >= w ? '.' : rows[y][x] || '.');
  const body = (ch) => ch !== '.' && ch !== 'E' && ch !== 'l' && ch !== 'k' && pal[ch];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = at(x, y);
    if (ch === '.' || !pal[ch]) continue;
    let col = pal[ch];
    if (body(ch)) {
      const top = at(x, y - 1) === '.', low = at(x, y + 1) === '.', r = artHash(x, y, w * 31 + h);
      if (top && r < 0.75) col = mix(col, '#f4e8cc', x < w / 2 ? 0.3 : 0.18);
      else if (low) col = mix(col, '#0a0810', 0.35);
      // a stroke or two of shade along the flank
      else if (r < 0.2) col = mix(col, '#0a0810', 0.15);
    }
    putPx(P, x + 1, y + 1, col);
  }
  return spriteFromBuf(P).c;
}

// On entering a floor (render.js): paint its creatures' sprites, every
// frame of each kind there, so none is painted mid-fight.
function fpWarm(d) {
  if (d.hub) return;
  enemySprite(d, 'crawler');
  const seen = new Set();
  for (const e of d.enemies || []) {
    if (seen.has(e.type)) continue;
    seen.add(e.type);
    if (FOE_ROWS[e.type]) for (const f of Object.keys(FOE_ROWS[e.type])) foeSprite(e.type, f);
    else enemySprite(d, e.type);
  }
}
