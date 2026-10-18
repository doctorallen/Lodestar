'use strict';
// ---------------------------------------------------------------------------
// Drawing. The world is drawn into the #view canvas at one game pixel per
// canvas pixel, and CSS scales the canvas up by a whole number of device
// pixels so the pixels (and the dithering) stay square. The shorter side of
// the view always shows at least VIEW_MIN game pixels.
//
// A frame is drawn in two layers, colour (the view) and emissive (what
// glows), then lit: the world dims to an ambient light, each light source
// (the helmet lamp, ore, fungus, the lodeline) adds its colour back, the
// light is cut into a few dithered bands, and emissive pixels keep their own
// colour. Bloom from the emissive layer goes on last. A floor is painted
// once into pixel buffers when it's entered, and the tiles around a mined
// one are repainted. Sprites carry anchors ax/ay at the feet.
// ---------------------------------------------------------------------------

const VIEW_MIN = 176;

const View = {
  canvas: null, ctx: null, w: 0, h: 0, scale: 1, camX: 0, camY: 0,
  em: null, emCtx: null, light: null, lightCtx: null, blooms: [],
  floorFor: null, floorBuf: null, floorCol: null, floorEm: null, floorImgs: null, lights: [],
};
const Sprites = {};
const Sparks = [];

function setupView() {
  View.canvas = $('view');
  View.ctx = View.canvas.getContext('2d', { willReadFrequently: true });
}

function resizeView() {
  const r = $('stage').getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  if (r.width < 1 || r.height < 1) return;
  const k = Math.max(1, Math.floor((Math.min(r.width, r.height) * dpr) / VIEW_MIN));
  const w = Math.ceil((r.width * dpr) / k), h = Math.ceil((r.height * dpr) / k);
  if (w === View.w && h === View.h && k === View.scale) return;
  View.w = w; View.h = h; View.scale = k;
  View.canvas.width = w; View.canvas.height = h;
  View.canvas.style.width = (w * k) / dpr + 'px';
  View.canvas.style.height = (h * k) / dpr + 'px';
  View.ctx.imageSmoothingEnabled = false;
  const layer = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d', { willReadFrequently: true })]; };
  [View.em, View.emCtx] = layer();
  [View.light, View.lightCtx] = layer();
  View.blooms = T.light.bloom.map(([div, a]) => { const [c] = makeCanvas(Math.max(1, Math.round(w / div)), Math.max(1, Math.round(h / div))); return [c, a * T.light.glow]; });
}

function buildSprites() {
  const make = (legs) => {
    const s = buildArtSprite(PROSPECTOR_TOP.concat(legs));
    s.ax = s.w / 2; s.ay = s.h - 1.5;
    return s;
  };
  Sprites.prospector = [make(PROSPECTOR_LEGS.idle), make(PROSPECTOR_LEGS.walk)];
  Sprites.prospectorL = Sprites.prospector.map(flippedSprite);
}

// ---------------------------------------------------------------------------
// The floor
// ---------------------------------------------------------------------------
const artBiome = (f) => ART.biomes[T.biomes[f.biome].id];
const rgb01 = (hex) => rgbOf(hex).map((v) => v / 255);

// Does this patch of ground grow something that glows? Cosmetic, but
// seeded, so a floor always looks the same.
function hasDeco(f, tx, ty) {
  if (floorTile(f, tx, ty) !== TILE_FLOOR || (tx === f.entry.x && ty === f.entry.y)) return false;
  return hashInts(f.seed, f.depth, tx, ty, 0xdec0) % 1000 < T.light.decoChance * 1000;
}

function paintFloor(f) {
  const P = pixBuf(f.w * TILE, f.h * TILE);
  View.floorFor = f; View.floorBuf = P;
  for (let ty = 0; ty < f.h; ty++) for (let tx = 0; tx < f.w; tx++) paintTileArt(f, tx, ty);
  View.floorImgs = [new ImageData(P.col, P.w, P.h), new ImageData(P.em, P.w, P.h)];
  let x;
  [View.floorCol, x] = makeCanvas(P.w, P.h); x.putImageData(View.floorImgs[0], 0, 0);
  [View.floorEm, x] = makeCanvas(P.w, P.h); x.putImageData(View.floorImgs[1], 0, 0);
  View.lights = floorLights(f);
}

function paintTileArt(f, tx, ty) {
  const P = View.floorBuf, b = artBiome(f), t = floorTile(f, tx, ty), ox = tx * TILE, oy = ty * TILE;
  const r = new Rng(hashInts(f.seed, f.depth, tx, ty)), rnd = () => r.next();
  const open = (dx, dy) => !TILE_SOLID[floorTile(f, tx + dx, ty + dy)];
  if (!TILE_SOLID[t]) {
    paintGround(P, ox, oy, b, rnd, !open(0, -1));
    if (t === TILE_PAD) paintDish(P, ox, oy, b, 'pad');
    else if (t === TILE_SHAFT) paintDish(P, ox, oy, b, 'shaft');
    else if (hasDeco(f, tx, ty)) paintDeco(P, ox, oy, b, rnd);
    return;
  }
  const ore = t === TILE_ORE ? T.ores[f.ore[ty * f.w + tx] - 1].id : null;
  paintRock(P, ox, oy, b, rnd, { front: open(0, 1), up: open(0, -1), left: open(-1, 0), right: open(1, 0), ore });
}

// After mining: the tiles round tx, ty change their rims, faces and shadows.
function repaintAround(f, tx, ty) {
  if (View.floorFor !== f) return;
  for (let y = ty - 1; y <= ty + 1; y++) for (let x = tx - 1; x <= tx + 1; x++) if (x >= 0 && y >= 0 && x < f.w && y < f.h) paintTileArt(f, x, y);
  const dx = Math.max(0, tx - 1) * TILE, dy = Math.max(0, ty - 1) * TILE;
  View.floorCol.getContext('2d').putImageData(View.floorImgs[0], 0, 0, dx, dy, 3 * TILE, 3 * TILE);
  View.floorEm.getContext('2d').putImageData(View.floorImgs[1], 0, 0, dx, dy, 3 * TILE, 3 * TILE);
  View.lights = floorLights(f);
}

// The floor's fixed lights: every ore vein tile and every glowing deco.
function floorLights(f) {
  const L = [], b = artBiome(f), Lt = T.light;
  for (let ty = 0; ty < f.h; ty++)
    for (let tx = 0; tx < f.w; tx++) {
      const cx = (tx + 0.5) * TILE, cy = (ty + 0.5) * TILE;
      if (floorTile(f, tx, ty) === TILE_ORE) L.push({ x: cx, y: cy, r: Lt.ore[0] * TILE, i: Lt.ore[1], c: rgb01(ART.ores[T.ores[f.ore[ty * f.w + tx] - 1].id][2]) });
      else if (hasDeco(f, tx, ty)) L.push({ x: cx, y: cy, r: Lt.deco[0] * TILE, i: Lt.deco[1], c: rgb01(b.glow) });
    }
  return L;
}

// ---------------------------------------------------------------------------
// Sparks (cosmetic)
// ---------------------------------------------------------------------------
function spawnSparks(x, y, cols, n) {
  for (let i = 0; i < n; i++) {
    const a = FX_R.f(Math.PI * 2), s = FX_R.f(20, 60);
    Sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, t: FX_R.f(0.25, 0.5), col: FX_R.pick(cols) });
  }
}

function updateSparks(dt) {
  for (let i = Sparks.length - 1; i >= 0; i--) {
    const s = Sparks[i];
    s.t -= dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 160 * dt;
    if (s.t <= 0) Sparks.splice(i, 1);
  }
}

// ---------------------------------------------------------------------------
// Drawing into both layers
// ---------------------------------------------------------------------------
function drawArtSprite(spr, x, y) {
  View.ctx.drawImage(spr.c, x, y);
  const ex = View.emCtx;
  ex.globalCompositeOperation = 'destination-out';
  ex.drawImage(spr.c, x, y);
  ex.globalCompositeOperation = 'source-over';
  ex.drawImage(spr.ec, x, y);
}

// A pixel in colour, and in the emissive layer when it glows.
function dot(x, y, col, glow, alpha = 1) {
  const c = View.ctx;
  c.globalAlpha = alpha; c.fillStyle = col; c.fillRect(x, y, 1, 1); c.globalAlpha = 1;
  if (glow) { const e = View.emCtx; e.globalAlpha = alpha; e.fillStyle = col; e.fillRect(x, y, 1, 1); e.globalAlpha = 1; }
}

function pixelLine(x0, y0, x1, y1, col) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let n = 0; n < 64; n++) {
    dot(x0, y0, col);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

// ---------------------------------------------------------------------------
// Light
// ---------------------------------------------------------------------------

// Adds a light of colour c (0–1 a channel) and strength i, fading as
// (1 - d/r)² out to r. The light canvas holds half the light, so a channel
// can reach 2.
function addLight(lx, x, y, r, i, c) {
  const g = lx.createRadialGradient(x, y, 0, x, y, r);
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const f = (1 - t) * (1 - t) * i * 127.5;
    g.addColorStop(t, `rgb(${Math.min(255, c[0] * f) | 0},${Math.min(255, c[1] * f) | 0},${Math.min(255, c[2] * f) | 0})`);
  }
  lx.fillStyle = g;
  lx.fillRect(x - r, y - r, 2 * r, 2 * r);
}

// A light along a vertical line from y0 down to y1 (the lodeline's beam).
function addBeamLight(lx, x, y0, y1, r, i, c) {
  const g = lx.createLinearGradient(x - r, 0, x + r, 0);
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const d = Math.abs(t - 0.5) * 2, f = (1 - d) * (1 - d) * i * 127.5;
    g.addColorStop(t, `rgb(${c[0] * f | 0},${c[1] * f | 0},${c[2] * f | 0})`);
  }
  lx.fillStyle = g;
  lx.fillRect(x - r, y0, 2 * r, y1 - y0);
}

// Multiplies the view by the light, in dithered bands, and lets emissive
// pixels through at their own colour.
function lightScene(camX, camY) {
  const w = View.w, h = View.h, Lt = T.light;
  const img = View.ctx.getImageData(0, 0, w, h), d = img.data;
  const li = View.lightCtx.getImageData(0, 0, w, h).data;
  const em = View.emCtx.getImageData(0, 0, w, h).data;
  const B = Lt.bands, max = Lt.max, s = (2 / 255) * B;
  for (let y = 0; y < h; y++) {
    const row = ((y + camY) & 3) * 4;
    for (let x = 0; x < w; x++) {
      const k = (y * w + x) * 4, ea = em[k + 3];
      if (ea > 200) { d[k] = em[k]; d[k + 1] = em[k + 1]; d[k + 2] = em[k + 2]; continue; }
      const bt = (BAYER4[row + ((x + camX) & 3)] + 0.5) / 16;
      let q = Math.floor(li[k] * s + bt) / B; d[k] *= q > max ? max : q;
      q = Math.floor(li[k + 1] * s + bt) / B; d[k + 1] *= q > max ? max : q;
      q = Math.floor(li[k + 2] * s + bt) / B; d[k + 2] *= q > max ? max : q;
      if (ea > 0) { const a = ea / 255; d[k] += (em[k] - d[k]) * a; d[k + 1] += (em[k + 1] - d[k + 1]) * a; d[k + 2] += (em[k + 2] - d[k + 2]) * a; }
    }
  }
  View.ctx.putImageData(img, 0, 0);
}

// Bloom from the emissive layer, soft at low resolution so it still reads
// as pixels.
function bloomScene() {
  const x = View.ctx;
  for (const [c, a] of View.blooms) {
    const bx = c.getContext('2d');
    bx.imageSmoothingEnabled = true;
    bx.clearRect(0, 0, c.width, c.height);
    bx.drawImage(View.em, 0, 0, c.width, c.height);
    x.save();
    x.imageSmoothingEnabled = true;
    x.globalCompositeOperation = 'lighter';
    x.globalAlpha = a;
    x.drawImage(c, 0, 0, View.w, View.h);
    x.restore();
  }
}

// ---------------------------------------------------------------------------
// A frame
// ---------------------------------------------------------------------------
function renderFrame() {
  const x = View.ctx;
  if (!x || !View.w) return;
  x.fillStyle = '#000';
  x.fillRect(0, 0, View.w, View.h);
  const d = Game.dive;
  if (Game.scene !== 'dive' || !d) return;
  const f = d.floor, p = d.p, Lt = T.light, star = ART.pal.star;
  if (View.floorFor !== f) paintFloor(f);
  const fw = f.w * TILE, fh = f.h * TILE;
  const camX = (View.camX = Math.round(fw <= View.w ? (fw - View.w) / 2 : clamp(p.x - View.w / 2, 0, fw - View.w)));
  const camY = (View.camY = Math.round(fh <= View.h ? (fh - View.h) / 2 : clamp(p.y - 8 - View.h / 2, 0, fh - View.h)));
  const ox = -camX, oy = -camY, ex = View.emCtx;
  const tick = Math.floor(Game.realT * 8);
  ex.clearRect(0, 0, View.w, View.h);
  x.drawImage(View.floorCol, ox, oy);
  ex.drawImage(View.floorEm, ox, oy);
  const lights = [];

  // the lodeline: a shimmering beam from the anchor straight up
  if (f.pad) {
    const bx = (f.pad.x + 0.5) * TILE + ox, bot = (f.pad.y + 0.5) * TILE + oy, half = 3;
    if (bot > 0 && bx > -TILE && bx < View.w + TILE) {
      for (let y = 0; y < bot; y++)
        for (let i = -half; i < half; i++) {
          const edge = i === -half || i === half - 1;
          if (bayerAt(bx + i, y + tick) > (edge ? 0.45 : 0.75)) continue;
          dot(Math.round(bx + i - 0.5), y, edge ? star[1] : star[2], true, edge ? 0.55 : 0.8);
        }
      for (let i = 0; i < 6; i++) {
        const y = Math.round(bot - ((Game.realT * 16 + (i * bot) / 6) % bot));
        dot(Math.round(bx - 0.5 + ((i * 7) % (2 * half)) - half), y, star[3], true);
      }
      lights.push({ beam: true, x: bx, y0: 0, y1: bot, r: 1.6 * TILE, i: 0.9, c: rgb01(star[2]) });
      lights.push({ x: bx, y: bot, r: 1.6 * TILE, i: 0.8, c: rgb01(star[3]) });
    }
  }

  // loot on the floor, then everyone in order of their feet, then what flies
  for (const dr of d.drops) drawDrop(dr, ox, oy, lights);
  const actors = d.enemies.filter((e) => !e.dead).concat([p]).sort((a, b) => a.y - b.y);
  for (const a of actors) {
    if (a === p) drawProspector(d, ox, oy, tick, lights);
    else drawEnemy(d, a, ox, oy, tick, lights);
  }
  for (const b of d.bolts) {
    const col = b.kind === 'bolt' ? ART.cores.bolt : '#e8f4ff';
    dot(Math.round(b.x + ox - b.vx * 0.012), Math.round(b.y + oy - b.vy * 0.012), col, true, 0.5);
    for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1]]) dot(Math.round(b.x + ox) + i - 1, Math.round(b.y + oy) + j - 1, col, true);
    lights.push({ x: b.x + ox, y: b.y + oy, r: TILE, i: 0.7, c: rgb01(col) });
  }
  const shotCol = artBiome(f).glow;
  for (const sh of d.shots) {
    const sx = Math.round(sh.x + ox), sy = Math.round(sh.y + oy);
    for (const [i, j] of [[0, -1], [-1, 0], [0, 0], [1, 0], [0, 1]]) dot(sx + i, sy + j, i || j ? shotCol : '#ffffff', true);
    lights.push({ x: sx, y: sy, r: TILE, i: 0.6, c: rgb01(shotCol) });
  }
  for (const fx of d.fx) drawCombatFx(fx, ox, oy, tick, lights);
  for (const s of Sparks) dot(Math.round(s.x + ox), Math.round(s.y + oy), s.col, true);
  const fx = Math.round(p.x + ox), fy = Math.round(p.y + oy);

  // light it: ambient, the floor's lights in view, the lodeline, the lamp
  const lx = View.lightCtx, amb = Lt.ambient * 127.5;
  lx.globalCompositeOperation = 'source-over';
  lx.fillStyle = `rgb(${amb * Lt.tint[0] | 0},${amb * Lt.tint[1] | 0},${amb * Lt.tint[2] | 0})`;
  lx.fillRect(0, 0, View.w, View.h);
  lx.globalCompositeOperation = 'lighter';
  for (const s of View.lights) {
    const sx = s.x + ox, sy = s.y + oy;
    if (sx + s.r > 0 && sy + s.r > 0 && sx - s.r < View.w && sy - s.r < View.h) addLight(lx, sx, sy, s.r, s.i, s.c);
  }
  for (const s of lights) {
    if (s.beam) addBeamLight(lx, s.x, s.y0, s.y1, s.r, s.i, s.c);
    else addLight(lx, s.x, s.y, s.r, s.i, s.c);
  }
  // the lamp gutters out as the prospector dies
  const lamp = d.dying > 0 ? Math.max(0.15, d.dying / 1.4) : 1;
  addLight(lx, fx, fy - 13, Lt.lamp[0] * TILE * lamp, Lt.lamp[1] * lamp, rgb01(ART.pal.lamp[0]));
  lightScene(camX, camY);
  bloomScene();

  // on top, unlit: enemies' health, the ore being aimed at, and how far
  // through it the pick is
  for (const e of d.enemies) {
    if (e.dead || e.boss || (e.hp >= e.maxHp && !e.elite)) continue;
    const w = e.r * 2 + 4, bx = Math.round(e.x + ox - w / 2), by = Math.round(e.y + oy) - (e.type === 'wisp' ? 22 : e.type === 'construct' ? 20 : 16);
    x.fillStyle = '#000'; x.fillRect(bx - 1, by - 1, w + 2, 3);
    x.fillStyle = e.elite ? ELITE_COLS[e.elite] : '#d04848'; x.fillRect(bx, by, Math.max(1, Math.round((w * e.hp) / e.maxHp)), 1);
  }
  const boss = d.enemies.find((e) => e.boss && !e.dead && e.aggro);
  if (boss) {
    const w = Math.min(View.w - 24, 140), bx = Math.round((View.w - w) / 2);
    x.fillStyle = '#000'; x.fillRect(bx - 1, 5, w + 2, 4);
    x.fillStyle = '#c04040'; x.fillRect(bx, 6, Math.round((w * boss.hp) / boss.maxHp), 2);
  }
  if (d.target) {
    const tx = d.target.tx * TILE + ox, ty = d.target.ty * TILE + oy;
    x.fillStyle = Input.mining() ? '#fff2c8' : 'rgba(255,242,200,0.5)';
    for (const [cx, cy] of [[0, 0], [TILE - 3, 0], [0, TILE - 3], [TILE - 3, TILE - 3]]) { x.fillRect(tx + cx, ty + cy + (cy ? 2 : 0), 3, 1); x.fillRect(tx + cx + (cx ? 2 : 0), ty + cy, 1, 3); }
    if (p.mine && !p.mine.refused) {
      x.fillStyle = '#000'; x.fillRect(tx + 1, ty - 4, TILE - 2, 3);
      x.fillStyle = star[2]; x.fillRect(tx + 2, ty - 3, Math.round((TILE - 4) * Math.min(1, p.mine.prog)), 1);
    }
  }
}

// ---------------------------------------------------------------------------
// The people in it
// ---------------------------------------------------------------------------
const ELITE_COLS = { fast: '#7fe8ff', tough: '#ffd34d', volatile: '#ff5a3a' };
const _enemySprites = {};
function enemySprite(d, type) {
  const id = T.biomes[d.biome].id;
  if (!_enemySprites[id]) _enemySprites[id] = buildEnemySprites(id);
  return _enemySprites[id][type];
}

function drawShadow(fx, fy, rx) {
  const x = View.ctx;
  x.fillStyle = 'rgba(0,0,0,0.45)';
  x.fillRect(fx - rx + 1, fy - 1, rx * 2 - 1, 3);
  x.fillRect(fx - rx, fy, rx * 2 + 1, 1);
}

function drawProspector(d, ox, oy, tick, lights) {
  const p = d.p, x = View.ctx;
  const walking = p.walkT > 0;
  const frame = walking && Math.floor(p.walkT * 8) % 2 ? 1 : 0;
  const side = p.fx < -0.1 ? -1 : 1;
  const spr = (side < 0 ? Sprites.prospectorL : Sprites.prospector)[frame];
  const fx = Math.round(p.x + ox), fy = Math.round(p.y + oy);
  drawShadow(fx, fy, 5);
  // blink while hurt; fall still while dying
  if (!(p.invuln > 0 && tick % 2) && !(d.dying > 0 && tick % 3 === 0))
    drawArtSprite(spr, Math.round(fx - spr.ax), Math.round(fy - spr.ay - (walking && frame ? 1 : 0)));
  if (p.ward > 0) ringDots(fx, fy - 8, 11, ART.cores.ward, 0.5 + 0.3 * Math.sin(Game.realT * 6), true);
  const swinging = p.mine && !p.mine.refused && d.target;
  if (swinging) {
    const phase = tick % 4, striking = phase >= 2;
    const hx = fx + side * 5, hy = fy - 7 - (striking ? 0 : 1);
    const tx = (d.target.tx + 0.5) * TILE + ox - hx, ty = (d.target.ty + 0.5) * TILE + oy - hy;
    const m = Math.hypot(tx, ty) || 1;
    const head = striking ? { x: hx + (tx / m) * 8, y: hy + (ty / m) * 8 } : { x: hx + side * 4, y: hy - 7 };
    const wood = ART.pal.wood, tool = ART.pal.tool;
    pixelLine(hx, hy, head.x, head.y, wood[2]);
    pixelLine(head.x - 2, head.y - 1, head.x + 2, head.y - 1, tool[3]);
    pixelLine(head.x - 2, head.y, head.x + 2, head.y, tool[1]);
    if (phase === 2) lights.push({ x: head.x, y: head.y, r: 1.1 * TILE, i: 0.8, c: [1, 0.8, 0.6] });
  }
}

function drawEnemy(d, e, ox, oy, tick, lights) {
  const spr = enemySprite(d, e.type), x = View.ctx;
  let lift = 0;
  if (e.type === 'wisp') lift = 5 + Math.round(Math.sin(e.bob * 3) * 1.5);
  else if (e.state === 'chase' && Math.floor(e.bob * 8) % 2) lift = 1;
  const shake = e.state === 'windup' ? (tick % 2 ? 1 : -1) : 0;
  const fx = Math.round(e.x + ox), fy = Math.round(e.y + oy);
  if (fx < -40 || fy < -10 || fx > View.w + 40 || fy > View.h + 50) return;
  drawShadow(fx, fy, Math.max(3, e.r));
  const sx = Math.round(fx - spr.ax) + shake, sy = Math.round(fy - spr.ay - lift);
  if (e.flash > 0) {
    x.drawImage(spr.flash, sx, sy);
    const ex = View.emCtx;
    ex.globalCompositeOperation = 'destination-out'; ex.drawImage(spr.c, sx, sy);
    ex.globalCompositeOperation = 'source-over'; ex.drawImage(spr.flash, sx, sy);
  } else drawArtSprite(spr, sx, sy);
  const pal = ENEMY_PAL[T.biomes[d.biome].id];
  // their eyes and cores light the floor round them, brighter as they wind up
  const glow = e.type === 'crawler' ? ART.pal.eyeglow[0] : e.type === 'wisp' ? pal.crystal[0] : pal.rune[0];
  lights.push({ x: fx, y: fy - spr.h / 2, r: (e.boss ? 2.4 : e.type === 'wisp' ? 1.5 : 0.9) * TILE, i: e.state === 'windup' ? 1.2 : 0.5, c: rgb01(glow) });
  // an elite wears a pip of its affix's colour; a chilled one, a pale one
  if (e.elite) for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1]]) dot(fx + i, sy - 3 + j, ELITE_COLS[e.elite], true);
  if (e.slowT > 0) dot(fx + 3, sy - 2, '#c8f0ff', true);
}

function drawDrop(dr, ox, oy, lights) {
  const fx = Math.round(dr.x + ox), fy = Math.round(dr.y + oy) - 3 - Math.round(Math.sin(dr.t * 3 + dr.x) * 1.2);
  let col;
  if (dr.mote) col = '#c8ffd8';
  else if (dr.exotic) col = ART.exotics[dr.exotic];
  else col = ART.rarity[dr.item.rarity] || '#ffffff';
  if (dr.mote) { for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1]]) dot(fx + i, fy + j, col, true); }
  else {
    for (const [i, j] of [[0, -2], [-1, -1], [0, -1], [1, -1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [0, 2]]) dot(fx + i, fy + j, (i || j) ? col : '#ffffff', true);
    // the best of it stands up in a beam, so it's seen from across a room
    const it = dr.item;
    if (it && (it.rarity === 'rare' || it.rarity === 'legendary' || it.rarity === 'set' || it.rarity === 'relic'))
      for (let k = 3; k < 18; k++) dot(fx, fy - k, col, true, 0.7 * (1 - k / 18));
  }
  lights.push({ x: fx, y: fy, r: TILE, i: 0.5, c: rgb01(col) });
}

// A circle of dots
function ringDots(cx, cy, r, col, alpha, glow) {
  const n = Math.max(8, Math.round(r * 2.4));
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    dot(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * 0.75), col, glow, alpha);
  }
}

function drawCombatFx(fx, ox, oy, tick, lights) {
  const k = fx.t / fx.max, cx = fx.x + ox, cy = fx.y + oy;
  if (fx.kind === 'swing') {
    // a pale arc where the blade went
    const a0 = Math.atan2(fx.dy, fx.dx);
    for (let s = -5; s <= 5; s++) {
      const a = a0 + s * 0.2 * (1.2 - k * 0.4);
      for (const r of [11, 14, 17]) dot(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * 0.8), '#f4ecd8', true, k * (r === 14 ? 0.9 : 0.45));
    }
  } else if (fx.kind === 'nova') {
    ringDots(cx, cy, fx.r * (1 - k * 0.7), ART.cores.nova, k, true);
    lights.push({ x: cx, y: cy, r: fx.r * 1.3, i: k, c: rgb01(ART.cores.nova) });
  } else if (fx.kind === 'pull') {
    ringDots(cx, cy, fx.r * k, ART.cores.pull, 0.8, true);
  } else if (fx.kind === 'ward') {
    ringDots(cx, cy, 11 + 6 * k, ART.cores.ward, k, true);
  } else if (fx.kind === 'arc') {
    const n = 6;
    let px = cx, py = cy;
    for (let s = 1; s <= n; s++) {
      const tx = cx + ((fx.x2 + ox - cx) * s) / n + (s < n ? FX_R.i(-2, 2) : 0), ty = cy + ((fx.y2 + oy - cy) * s) / n + (s < n ? FX_R.i(-2, 2) : 0);
      pixelLineGlow(px, py, tx, ty, ART.exotics.voltaic);
      px = tx; py = ty;
    }
  } else if (fx.kind === 'blast') {
    ringDots(cx, cy, fx.r * (1 - k * 0.6), '#ff7a3a', k, true);
    lights.push({ x: cx, y: cy, r: fx.r * 1.5, i: 1.2 * k, c: [1, 0.5, 0.25] });
  } else if (fx.kind === 'volatile') {
    if (tick % 2) for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1]]) dot(Math.round(cx) + i, Math.round(cy) - 4 + j, '#ff5a3a', true);
    lights.push({ x: cx, y: cy, r: TILE, i: 0.8, c: [1, 0.35, 0.2] });
  }
}

function pixelLineGlow(x0, y0, x1, y1, col) {
  const n = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let s = 0; s <= n; s++) dot(Math.round(x0 + ((x1 - x0) * s) / n), Math.round(y0 + ((y1 - y0) * s) / n), col, true);
}
