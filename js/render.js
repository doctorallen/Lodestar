'use strict';
// ---------------------------------------------------------------------------
// Drawing. The world is drawn into the #view canvas at one game pixel per
// canvas pixel, and CSS scales the canvas up by a whole number of device
// pixels so the pixels stay square. The shorter side of the view always
// shows at least VIEW_MIN game pixels. A floor is painted once into its own
// canvas when it's entered, and a tile is repainted when it's mined. Sprites
// carry anchors ax/ay at the feet. All art here is placeholder.
// ---------------------------------------------------------------------------

const VIEW_MIN = 176;

const View = { canvas: null, ctx: null, w: 0, h: 0, scale: 1, camX: 0, camY: 0, floorCanvas: null, floorCtx: null, floorFor: null };
const Sprites = {};
const Sparks = [];

function setupView() {
  View.canvas = $('view');
  View.ctx = View.canvas.getContext('2d');
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
}

// ---------------------------------------------------------------------------
// Sprites
// ---------------------------------------------------------------------------
function anchored(c, ax, ay) { c.ax = ax; c.ay = ay; return c; }

function buildSprites() {
  const pal = { H: '#d9a441', h: '#9c6f22', L: '#fff6c8', S: '#e0b08a', E: '#1b1b1b', C: '#3d5a80', c: '#2a3f5a', B: '#6b4424', P: '#2b2b38', K: '#4a3020' };
  const top = [
    '...HHH...',
    '..HHHHHL.',
    '.hHHHHHh.',
    '..SSSES..',
    '..SSSSS..',
    '..CCCCC..',
    '.CCCCCCC.',
    '.cCCCCCc.',
    '.cBBBBBc.',
    '..CCCCC..',
  ];
  const stand = ['..PP.PP..', '..PP.PP..', '..KK.KK..'];
  const step = ['..PP..PP.', '.PP...PP.', '.KK....K.'];
  const make = (legs) => anchored(outlined(spriteFrom(top.concat(legs), pal), '#0b0a0d'), 5.5, 13.5);
  Sprites.prospector = [make(stand), make(step)];
  Sprites.prospectorL = Sprites.prospector.map((s) => anchored(flipped(s), s.width - s.ax, s.ay));
}

// ---------------------------------------------------------------------------
// The floor canvas
// ---------------------------------------------------------------------------
function paintFloor(f) {
  const [c, x] = makeCanvas(f.w * TILE, f.h * TILE);
  View.floorCanvas = c; View.floorCtx = x; View.floorFor = f;
  for (let ty = 0; ty < f.h; ty++) for (let tx = 0; tx < f.w; tx++) repaintTile(f, tx, ty);
}

function repaintTile(f, tx, ty) {
  if (View.floorFor !== f || tx < 0 || ty < 0 || tx >= f.w || ty >= f.h) return;
  const x = View.floorCtx, b = T.biomes[f.biome], t = floorTile(f, tx, ty), px = tx * TILE, py = ty * TILE;
  const r = new Rng(hashInts(tx, ty, f.depth));
  if (!TILE_SOLID[t]) {
    // the ground, speckled
    x.fillStyle = b.ground; x.fillRect(px, py, TILE, TILE);
    for (let n = 0; n < 7; n++) { x.fillStyle = shade(b.ground, r.chance(0.5) ? 0.12 : -0.25); x.fillRect(px + r.i(0, 15), py + r.i(0, 15), r.i(1, 2), 1); }
    // a wall above casts a band of shadow
    if (TILE_SOLID[floorTile(f, tx, ty - 1)]) { x.fillStyle = 'rgba(0,0,0,0.4)'; x.fillRect(px, py, TILE, 3); }
    if (t === TILE_SHAFT) {
      x.fillStyle = b.wall; x.fillRect(px + 1, py + 2, 14, 12);
      x.fillStyle = '#000'; x.fillRect(px + 2, py + 3, 12, 10);
      x.fillStyle = shade(b.wall, 0.3); x.fillRect(px + 2, py + 2, 12, 1);
    } else if (t === TILE_PAD) {
      x.fillStyle = shade(b.accent, -0.5);
      x.fillRect(px + 3, py + 4, 10, 8); x.fillRect(px + 4, py + 3, 8, 10);
      x.fillStyle = b.accent;
      x.fillRect(px + 5, py + 5, 6, 6);
    }
    return;
  }
  // rock: a dark top with a lit rim along every edge that meets the ground,
  // and a front face where the ground is in front of it
  const open = (dx, dy) => !TILE_SOLID[floorTile(f, tx + dx, ty + dy)];
  const front = open(0, 1);
  const topCol = t === TILE_EDGE ? shade(b.rock, -0.3) : b.rock;
  x.fillStyle = topCol; x.fillRect(px, py, TILE, TILE);
  for (let n = 0; n < 5; n++) { x.fillStyle = shade(topCol, 0.12); x.fillRect(px + r.i(1, 13), py + r.i(1, 9), 2, 1); }
  x.fillStyle = shade(b.wall, -0.15);
  if (open(-1, 0)) x.fillRect(px, py, 1, TILE);
  if (open(1, 0)) x.fillRect(px + TILE - 1, py, 1, TILE);
  if (open(0, -1)) x.fillRect(px, py, TILE, 1);
  if (front) {
    x.fillStyle = b.wall; x.fillRect(px, py + TILE - 6, TILE, 6);
    x.fillStyle = shade(b.wall, 0.25); x.fillRect(px, py + TILE - 7, TILE, 1);
    x.fillStyle = shade(b.wall, -0.25);
    for (let n = 0; n < 3; n++) x.fillRect(px + r.i(1, 14), py + TILE - r.i(2, 5), 1, 2);
  }
  if (t === TILE_ORE) {
    const o = T.ores[f.ore[ty * f.w + tx] - 1];
    const maxY = front ? 6 : 12;
    for (let n = 0; n < 4; n++) {
      const cx = px + r.i(2, 12), cy = py + r.i(2, maxY);
      x.fillStyle = shade(o.color, -0.35); x.fillRect(cx, cy + 1, 3, 2);
      x.fillStyle = o.color; x.fillRect(cx, cy, 2, 2);
      x.fillStyle = o.glint; x.fillRect(cx, cy, 1, 1);
    }
  }
}

// ---------------------------------------------------------------------------
// Sparks (cosmetic)
// ---------------------------------------------------------------------------
function spawnSparks(x, y, col, n) {
  for (let i = 0; i < n; i++) {
    const a = FX_R.f(Math.PI * 2), s = FX_R.f(20, 60);
    Sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, t: FX_R.f(0.25, 0.5), col });
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
// A frame
// ---------------------------------------------------------------------------
function renderFrame() {
  const x = View.ctx;
  if (!x || !View.w) return;
  x.fillStyle = '#07080a';
  x.fillRect(0, 0, View.w, View.h);
  const d = Game.dive;
  if (Game.scene !== 'dive' || !d) return;
  const f = d.floor, p = d.p, b = T.biomes[f.biome];
  if (View.floorFor !== f) paintFloor(f);
  const fw = f.w * TILE, fh = f.h * TILE;
  View.camX = Math.round(fw <= View.w ? (fw - View.w) / 2 : clamp(p.x - View.w / 2, 0, fw - View.w));
  View.camY = Math.round(fh <= View.h ? (fh - View.h) / 2 : clamp(p.y - 8 - View.h / 2, 0, fh - View.h));
  const ox = -View.camX, oy = -View.camY;
  x.drawImage(View.floorCanvas, ox, oy);

  // the ore being aimed at, and how far through it the pick is
  if (d.target) {
    const tx = d.target.tx * TILE + ox, ty = d.target.ty * TILE + oy;
    x.fillStyle = Input.mining() ? '#fff6c8' : 'rgba(255,246,200,0.55)';
    for (const [cx, cy] of [[0, 0], [TILE - 3, 0], [0, TILE - 3], [TILE - 3, TILE - 3]]) { x.fillRect(tx + cx, ty + cy, 3, 1); x.fillRect(tx + cx + (cx ? 2 : 0), ty + cy, 1, 3); }
    if (p.mine && !p.mine.refused) {
      x.fillStyle = '#000'; x.fillRect(tx + 1, ty - 4, TILE - 2, 3);
      x.fillStyle = '#f0c050'; x.fillRect(tx + 2, ty - 3, Math.round((TILE - 4) * Math.min(1, p.mine.prog)), 1);
    }
  }

  // the prospector, bobbing on the walk and leaning into a swing
  const walking = p.walkT > 0;
  const frame = walking && Math.floor(p.walkT * 8) % 2 ? 1 : 0;
  const set = p.fx < -0.1 ? Sprites.prospectorL : Sprites.prospector;
  const spr = set[frame];
  const swing = p.mine && !p.mine.refused ? Math.round(Math.sin(Game.realT * 28)) : 0;
  const sx = Math.round(p.x + ox - spr.ax + (d.target ? Math.sign(d.target.tx * TILE + 8 - p.x) * swing : 0));
  const sy = Math.round(p.y + oy - spr.ay - (walking && frame ? 1 : 0));
  x.fillStyle = 'rgba(0,0,0,0.35)';
  x.fillRect(Math.round(p.x + ox) - 3, Math.round(p.y + oy), 7, 2);
  x.drawImage(spr, sx, sy);

  for (const s of Sparks) { x.fillStyle = s.col; x.fillRect(Math.round(s.x + ox), Math.round(s.y + oy), 1, 1); }

  // the dark, and the helmet lamp
  const lx = p.x + ox, ly = p.y + oy - 10;
  const g = x.createRadialGradient(lx, ly, 28, lx, ly, 120);
  g.addColorStop(0, 'rgba(4,5,8,0)');
  g.addColorStop(1, 'rgba(4,5,8,0.85)');
  x.fillStyle = g;
  x.fillRect(0, 0, View.w, View.h);

  // the lodeline, glowing through the dark
  if (f.pad) {
    const px = f.pad.x * TILE + ox, py = f.pad.y * TILE + oy;
    const a = 0.35 + 0.15 * Math.sin(Game.realT * 3);
    x.fillStyle = b.accent;
    x.globalAlpha = a; x.fillRect(px + 6, 0, 4, py + 10);
    x.globalAlpha = a * 0.5; x.fillRect(px + 4, 0, 8, py + 10);
    x.globalAlpha = 1;
  }
}
