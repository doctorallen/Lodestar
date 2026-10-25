'use strict';
// ---------------------------------------------------------------------------
// The frame on the GPU (docs/RENDERING.md). Where there's WebGL2 the view
// is one WebGL canvas and everything the frame draws goes through a
// batcher that stands in for the 2D contexts (GpuCtx: fillRect, drawImage,
// globalAlpha, the blend modes, save/restore, a rect clip and a translate),
// so the game's drawing code is unchanged. Each call becomes a quad: a
// sprite's pixels live in an atlas (texture array pages, uploaded once from
// the canvas the builders painted), the floor's painted buffers go up as
// textures by the chunk as they're painted, and the rock standing in front
// of an actor is put back over it in the shader (the rule paintOcclude
// had) from the rock's lift texture, so nothing is drawn twice and nothing
// is ever read back. A frame: the scene into a framebuffer with a colour
// and an emissive attachment, the light pass (gllight.js) from that into
// the lit picture, the bloom from the emissive in passes on the world's
// grid, and a last pass that adds the two onto the canvas, with the unlit
// overlay's quads over it. Without WebGL2 the 2D canvases and the
// JavaScript lighting run as they always did (Gpu.on is false).
// ---------------------------------------------------------------------------

const Gpu = {
  on: false, tried: false, gl: null, canvas: null, w: 0, h: 0,
  // the frame's camera (view px of the floor's origin) and occlusion mode
  // for the quads pushed next: -2 none, -1 flat on the ground (any rock
  // covers it), else the feet's view row (rock standing south of it covers it)
  ox: 0, oy: 0, feet: -2,
  // the batch: quads of GPU_Q floats each, their state, where they go
  q: null, n: 0, cap: 0, runs: [], cur: null, target: 'scene', blend: 0, clip: null, dyn: null, litDone: false,
  oq: null, on_: 0, ocap: 0,
  frame: 0, stats: { quads: 0, draws: 0, uploads: 0 },
};
const GPU_Q = 15;
const GPU_F = { EM: 1, COL: 2, SOLID: 4, SMOOTH: 8, FLOOR: 16, FLOOREM: 32, DYN: 64 };
const GPU_BLEND = { 'source-over': 0, lighter: 1, 'destination-out': 2, multiply: 3, copy: 0, 'source-in': 0 };
const GPU_ATLAS = 2048, GPU_PAGES = 2, GPU_PAGES_MAX = 6, GPU_KEEP = 600, GPU_WARM_FRAMES = 240, GPU_RING = 24;

const GPU_ZERO = new Float32Array([0, 0, 0, 0]), GPU_BLACK = new Float32Array([0, 0, 0, 1]);

const GPU_QUAD_VS = `#version 300 es
in vec4 aRect; in vec4 aUV; in float aPage; in vec4 aTint; in float aFeet; in float aFlags;
uniform vec2 uViewF;
out vec2 vUV; flat out vec4 vBox; flat out float vPage; out vec4 vTint; flat out float vFeet; flat out int vFlags;
void main() {
  vec2 c = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  vec2 p = aRect.xy + c * aRect.zw;
  gl_Position = vec4(p.x / uViewF.x * 2.0 - 1.0, 1.0 - p.y / uViewF.y * 2.0, 0.0, 1.0);
  vUV = aUV.xy + c * (aUV.zw - aUV.xy);
  vBox = aUV; vPage = aPage; vTint = aTint; vFeet = aFeet; vFlags = int(aFlags);
}`;

const GPU_QUAD_FS = `#version 300 es
precision highp float; precision highp int; precision highp sampler2DArray; precision highp sampler2D;
in vec2 vUV; flat in vec4 vBox; flat in float vPage; in vec4 vTint; flat in float vFeet; flat in int vFlags;
uniform sampler2DArray uAtlas;
uniform sampler2D uFloorCol, uFloorEm, uRockLift, uDyn;
uniform ivec2 uView, uCam, uFloorSize;
uniform int uBlend;
layout(location = 0) out vec4 oCol;
layout(location = 1) out vec4 oEm;
vec4 page(vec2 t) { return texelFetch(uAtlas, ivec3(ivec2(floor(t)), int(vPage)), 0); }
void main() {
  vec4 c;
  if ((vFlags & ${GPU_F.SOLID}) != 0) c = vec4(1.0);
  else if ((vFlags & ${GPU_F.FLOOR}) != 0) c = texelFetch(uFloorCol, ivec2(floor(vUV)), 0);
  else if ((vFlags & ${GPU_F.FLOOREM}) != 0) c = texelFetch(uFloorEm, ivec2(floor(vUV)), 0);
  else if ((vFlags & ${GPU_F.DYN}) != 0) c = texelFetch(uDyn, ivec2(floor(vUV)), 0);
  else if ((vFlags & ${GPU_F.SMOOTH}) != 0) {
    // bilinear, within the sprite's own box of the page
    vec2 t = clamp(vUV - 0.5, vBox.xy, vBox.zw - 1.0), f = fract(t), t0 = floor(t);
    vec2 t1 = min(t0 + 1.0, vBox.zw - 1.0);
    c = mix(mix(page(t0), page(vec2(t1.x, t0.y)), f.x), mix(page(vec2(t0.x, t1.y)), page(t1), f.x), f.y);
  } else c = page(vUV);
  c *= vTint;
  // the rock standing in front: its pixel instead (paintOcclude's rule)
  if (vFeet > -1.5 && c.a > 0.0) {
    int px = int(gl_FragCoord.x), py = uView.y - 1 - int(gl_FragCoord.y);
    ivec2 fp = ivec2(px - uCam.x, py - uCam.y);
    if (fp.x >= 0 && fp.y >= 0 && fp.x < uFloorSize.x && fp.y < uFloorSize.y) {
      float lift = texelFetch(uRockLift, fp, 0).r * 255.0;
      if (lift > 0.5 && (vFeet < -0.5 || float(py) + lift - 1.0 > vFeet + 0.5)) {
        if (uBlend != 0) discard;
        oCol = (vFlags & ${GPU_F.COL}) != 0 ? texelFetch(uFloorCol, fp, 0) * c.a : vec4(0.0);
        oEm = (vFlags & ${GPU_F.EM}) != 0 ? texelFetch(uFloorEm, fp, 0) * c.a : vec4(0.0);
        return;
      }
    }
  }
  oCol = (vFlags & ${GPU_F.COL}) != 0 ? c : vec4(0.0);
  oEm = (vFlags & ${GPU_F.EM}) != 0 ? c : vec4(0.0);
}`;

const GPU_TRI_VS = `#version 300 es
void main() { vec2 p = vec2(float((gl_VertexID & 1) * 4) - 1.0, float((gl_VertexID & 2) * 2) - 1.0); gl_Position = vec4(p, 0.0, 1.0); }`;

// A bloom pass: each pixel the mean of the emissive layer over its s × s
// art px on the world's grid (render.js bloomSceneWorld).
const GPU_BLOOM_FS = `#version 300 es
precision highp float; precision highp int;
uniform sampler2D uEm; uniform ivec2 uView; uniform ivec2 uOut; uniform float uS; uniform vec2 uOrg;
out vec4 o;
void main() {
  int i = int(gl_FragCoord.x), j = uOut.y - 1 - int(gl_FragCoord.y);
  float x0 = uOrg.x + float(i) * uS, y0 = uOrg.y + float(j) * uS;
  int xa = int(floor(x0)), xb = int(floor(x0 + uS)), ya = int(floor(y0)), yb = int(floor(y0 + uS));
  vec4 sum = vec4(0.0); float n = 0.0;
  for (int y = ya; y < yb; y++) for (int x = xa; x < xb; x++) {
    n += 1.0;
    if (x < 0 || y < 0 || x >= uView.x || y >= uView.y) continue;
    sum += texelFetch(uEm, ivec2(x, uView.y - 1 - y), 0);
  }
  o = n > 0.0 ? sum / n : vec4(0.0);
}`;

// The last pass: the lit picture plus the bloom (its passes sampled
// smoothly on the world's grid), onto the canvas.
const GPU_OUT_FS = `#version 300 es
precision highp float; precision highp int;
uniform sampler2D uLit, uP0, uP1, uP2, uP3;
uniform ivec2 uView; uniform int uN;
uniform vec4 uPass[4]; // s, weight, org x, org y (view px of the pass's first pixel)
uniform vec2 uPassSize[4];
out vec4 o;
vec4 pass(int k, vec2 p) {
  vec2 q = (p - uPass[k].zw) / uPass[k].x - 0.5;
  vec2 uv = vec2(q.x + 0.5, uPassSize[k].y - 0.5 - q.y) / uPassSize[k];
  if (k == 0) return texture(uP0, uv); if (k == 1) return texture(uP1, uv); if (k == 2) return texture(uP2, uv); return texture(uP3, uv);
}
void main() {
  int x = int(gl_FragCoord.x), y = uView.y - 1 - int(gl_FragCoord.y);
  vec3 c = texelFetch(uLit, ivec2(x, int(gl_FragCoord.y)), 0).rgb;
  vec2 p = vec2(float(x) + 0.5, float(y) + 0.5);
  for (int k = 0; k < uN; k++) c += pass(k, p).rgb * uPass[k].y;
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

// ---- setup -----------------------------------------------------------------
function gpuShader(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s));
  return s;
}
function gpuProgram(gl, vs, fs, uniforms) {
  const p = gl.createProgram();
  gl.attachShader(p, gpuShader(gl, gl.VERTEX_SHADER, vs)); gl.attachShader(p, gpuShader(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
  const u = {};
  for (const n of uniforms) u[n] = gl.getUniformLocation(p, n);
  return { p, u };
}
function gpuTex(gl, unit, kind = gl.TEXTURE_2D, filter = gl.NEAREST) {
  const t = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(kind, t);
  gl.texParameteri(kind, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(kind, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(kind, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(kind, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

// Takes the view's canvas for WebGL2; false (and the 2D path) if the
// browser hasn't it. The query ?nogpu keeps the 2D path for comparison.
function gpuInit(canvas) {
  const G = Gpu;
  if (G.tried) return G.on;
  G.tried = true;
  if (/[?&]nogpu\b/.test(location.search)) return false;
  try {
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false });
    if (!gl) return false;
    G.gl = gl; G.canvas = canvas;
    G.quad = gpuProgram(gl, GPU_QUAD_VS, GPU_QUAD_FS, ['uViewF', 'uView', 'uCam', 'uFloorSize', 'uBlend', 'uAtlas', 'uFloorCol', 'uFloorEm', 'uRockLift', 'uDyn']);
    G.bloomP = gpuProgram(gl, GPU_TRI_VS, GPU_BLOOM_FS, ['uEm', 'uView', 'uOut', 'uS', 'uOrg']);
    G.outP = gpuProgram(gl, GPU_TRI_VS, GPU_OUT_FS, ['uLit', 'uP0', 'uP1', 'uP2', 'uP3', 'uView', 'uN', 'uPass', 'uPassSize']);
    // the quad's attributes, one set an instance
    // (a ring of buffers, each filled afresh for one draw: a buffer the GPU
    // may still be drawing from is never written, which stalls a phone)
    G.vao = gl.createVertexArray(); gl.bindVertexArray(G.vao);
    G.bufs = []; for (let i = 0; i < GPU_RING; i++) G.bufs.push(gl.createBuffer());
    G.bi = 0;
    G.cap = 4096; G.q = new Float32Array(G.cap * GPU_Q); G.n = 0;
    G.ocap = 1024; G.oq = new Float32Array(G.ocap * GPU_Q); G.on_ = 0;
    G.attribs = [['aRect', 4, 0], ['aUV', 4, 4], ['aPage', 1, 8], ['aTint', 4, 9], ['aFeet', 1, 13], ['aFlags', 1, 14]].map(([n, size, off]) => [gl.getAttribLocation(G.quad.p, n), size, off]);
    gl.bindBuffer(gl.ARRAY_BUFFER, G.bufs[0]);
    for (const [a, size, off] of G.attribs) { gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, size, gl.FLOAT, false, GPU_Q * 4, off * 4); gl.vertexAttribDivisor(a, 1); }
    gl.bindVertexArray(null);
    G.boundFb = undefined;
    G.triVao = gl.createVertexArray();
    // the texture units: 0 the atlas, 1-3 the floor, 4 a dynamic picture;
    // the light pass and the last pass bind their own from 5
    gl.useProgram(G.quad.p);
    gl.uniform1i(G.quad.u.uAtlas, 0); gl.uniform1i(G.quad.u.uFloorCol, 1); gl.uniform1i(G.quad.u.uFloorEm, 2); gl.uniform1i(G.quad.u.uRockLift, 3); gl.uniform1i(G.quad.u.uDyn, 4);
    gl.useProgram(G.bloomP.p); gl.uniform1i(G.bloomP.u.uEm, 5);
    gl.useProgram(G.outP.p); gl.uniform1i(G.outP.u.uLit, 5); gl.uniform1i(G.outP.u.uP0, 6); gl.uniform1i(G.outP.u.uP1, 7); gl.uniform1i(G.outP.u.uP2, 8); gl.uniform1i(G.outP.u.uP3, 9);
    gpuAtlasInit(GPU_PAGES);
    // a texel of each floor texture and the dynamic one, so every unit is complete
    for (const [unit, name] of [[1, 'floorCol'], [2, 'floorEm'], [3, 'rockLift'], [4, 'dynTex']]) { G[name] = gpuTex(gl, unit); gl.texImage2D(gl.TEXTURE_2D, 0, name === 'rockLift' ? gl.R8 : gl.RGBA8, 1, 1, 0, name === 'rockLift' ? gl.RED : gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); }
    G.floorW = 0; G.floorH = 0; G.floorFor = null; G.dirty = [];
    G.dynTexs = new WeakMap();
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.enable(gl.BLEND);
    G.on = true;
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); G.on = false; }, false);
    canvas.addEventListener('webglcontextrestored', () => { location.reload(); }, false);
  } catch (e) {
    noteError(e);
    G.on = false;
  }
  return G.on;
}

// The framebuffers at the view's size (render.js resizeView).
function gpuResize(w, h) {
  const G = Gpu, gl = G.gl;
  if (!G.on || (G.w === w && G.h === h)) return;
  G.w = w; G.h = h;
  const target = (names) => {
    const fb = gl.createFramebuffer(), texs = [];
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb); G.boundFb = fb;
    names.forEach((t, i) => { gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0); texs.push(t); });
    gl.drawBuffers(names.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
    return { fb, texs };
  };
  const tex2 = (filter) => { const t = gpuTex(gl, 5, gl.TEXTURE_2D, filter); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h); return t; };
  if (G.scene) for (const t of [G.sceneCol, G.sceneEm, G.litTex]) gl.deleteTexture(t);
  G.sceneCol = tex2(gl.NEAREST); G.sceneEm = tex2(gl.NEAREST); G.litTex = tex2(gl.NEAREST);
  G.scene = target([G.sceneCol, G.sceneEm]);
  G.lit = target([G.litTex, G.sceneEm]);
  // the bloom's passes (T.light.bloom: [downscale, strength] each)
  if (G.passes) for (const p of G.passes) { gl.deleteTexture(p.tex); gl.deleteFramebuffer(p.fb); }
  G.passes = T.light.bloom.slice(0, 4).map(([div, a]) => {
    const s = div * AP, pw = Math.ceil(w / s) + 2, ph = Math.ceil(h / s) + 2;
    const tex = gpuTex(gl, 5, gl.TEXTURE_2D, gl.LINEAR);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, pw, ph);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb); G.boundFb = fb; gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { s, a: a * T.light.glow, pw, ph, tex, fb, ox: 0, oy: 0 };
  });
  gpuBind(null);
  gpuBlank();
}

// ---- the atlas -------------------------------------------------------------
// Pages of GPU_ATLAS², a texture array; a canvas is placed on a shelf the
// first time it's drawn (and the pages rebuilt from the canvases still
// about when they fill) and found by the canvas after.
function gpuAtlasInit(pages) {
  const G = Gpu, gl = G.gl;
  if (G.atlasTex) gl.deleteTexture(G.atlasTex);
  G.atlasTex = gpuTex(gl, 0, gl.TEXTURE_2D_ARRAY);
  gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, GPU_ATLAS, GPU_ATLAS, pages);
  G.pages = pages;
  G.shelves = []; for (let p = 0; p < pages; p++) G.shelves.push({ y: 0, rows: [] });
  if (!G.pics) { G.pics = new WeakMap(); G.entries = []; }
}
// A place for w × h on some page, or null.
function gpuAtlasPlace(w, h) {
  const G = Gpu, hh = Math.min(GPU_ATLAS, (h + 7) & ~7);
  for (let p = 0; p < G.pages; p++) {
    const S = G.shelves[p];
    for (const r of S.rows) if (r.h >= hh && r.h <= hh * 2 && r.x + w <= GPU_ATLAS) { const e = { x: r.x, y: r.y, page: p }; r.x += w; return e; }
    if (S.y + hh <= GPU_ATLAS && w <= GPU_ATLAS) { const r = { y: S.y, h: hh, x: w }; S.rows.push(r); S.y += hh; return { x: 0, y: r.y, page: p }; }
  }
  return null;
}
// (from the canvas itself, which a browser can copy on the GPU, rather
// than its pixels read back; src: the canvas, image or ImageData)
function gpuUpload(e, src) {
  const G = Gpu, gl = G.gl;
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, G.atlasTex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, e.x, e.y, e.page, e.w, e.h, 1, gl.RGBA, gl.UNSIGNED_BYTE, src);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  G.stats.uploads++;
}
// The pages built again from the pictures drawn lately (the rest are let
// go), with a page more if they still don't fit.
function gpuAtlasRebuild(need) {
  const G = Gpu;
  const keep = G.entries.filter((e) => G.frame - e.used < GPU_KEEP && !e.dead);
  for (const e of G.entries) if (!keep.includes(e)) e.dead = true;
  const area = keep.reduce((s, e) => s + e.w * ((e.h + 7) & ~7), 0) + need;
  let pages = G.pages;
  while (pages < GPU_PAGES_MAX && area > pages * GPU_ATLAS * GPU_ATLAS * 0.7) pages++;
  gpuAtlasInit(pages);
  G.entries = [];
  keep.sort((a, b) => b.h - a.h);
  for (const e of keep) {
    const src = e.ref.deref();
    if (!src) { e.dead = true; continue; }
    const at = gpuAtlasPlace(e.w, e.h);
    if (!at) { e.dead = true; continue; }
    e.x = at.x; e.y = at.y; e.page = at.page; G.entries.push(e); gpuUpload(e, src);
  }
}
// Where a canvas (or image) is on the pages: { x, y, w, h, page }.
function gpuPic(src) {
  const G = Gpu;
  let e = G.pics.get(src);
  if (e && !e.dead) { e.used = G.frame; return e; }
  const w = src.width, h = src.height;
  if (!(w > 0 && h > 0)) return null;
  let at = gpuAtlasPlace(w, h);
  // (the pages full: what's queued is drawn from them as they are first,
  // then they're built again)
  if (!at) { gpuFlush(); gpuAtlasRebuild(w * h); at = gpuAtlasPlace(w, h); }
  if (!at) return null;
  // (the canvas is held weakly: the pages are rebuilt from those still about)
  e = { x: at.x, y: at.y, w, h, page: at.page, ref: new WeakRef(src), used: G.frame, dead: false };
  G.pics.set(src, e); G.entries.push(e);
  gpuUpload(e, src);
  return e;
}
// A sprite's pictures onto the pages ahead of its first frame (the
// loading, loader.js), so no frame in play waits for them.
function gpuWarm(spr) {
  if (!Gpu.on || !spr) return;
  if (spr.c) gpuPic(spr.c);
  if (spr.ec) gpuPic(spr.ec);
}
// A canvas drawn before has been painted again: its pixels are read anew
// the next time it's drawn.
function gpuDirty(src) { const e = Gpu.pics && Gpu.pics.get(src); if (e) { e.dead = true; Gpu.pics.delete(src); } }
// A picture of its own (bigger than a page, or pixels rewritten each
// frame): a 2D texture, the rows y0..y1 uploaded.
function gpuOwnTex(src, img, y0, y1) {
  const G = Gpu, gl = G.gl, w = src.width, h = src.height;
  let t = G.dynTexs.get(src);
  gl.activeTexture(gl.TEXTURE4);
  if (!t || t.w !== w || t.h !== h) {
    if (t) for (const x of t.texs) gl.deleteTexture(x);
    // (a ring: the one the GPU may still be drawing from isn't written)
    t = { texs: [], i: 0, tex: null, w, h };
    for (let i = 0; i < 3; i++) { t.texs.push(gpuTex(gl, 4)); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h); }
    G.dynTexs.set(src, t);
    y0 = 0; y1 = h;
  }
  if (img) {
    t.i = (t.i + 1) % t.texs.length; t.tex = t.texs[t.i];
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, w); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, y0);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, y0, w, y1 - y0, gl.RGBA, gl.UNSIGNED_BYTE, img.data);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    G.stats.uploads++;
  } else if (!t.tex) { t.tex = t.texs[0]; gl.bindTexture(gl.TEXTURE_2D, t.tex); }
  // (the texture of this upload, for the run that draws it: the same
  // source can be uploaded and drawn more than once a frame)
  return { tex: t.tex, w, h };
}

// ---- the floor's textures --------------------------------------------------
// The floor's painted buffers (paint.js: colour, emissive, the rock's
// lift) as textures: whole when a floor starts, else the boxes painted
// since (pntComposite marks them), before the frame draws the floor.
function gpuFloorStart(f, W, H) {
  const G = Gpu, gl = G.gl;
  if (!G.on) return;
  if (G.floorW !== W || G.floorH !== H) {
    for (const [unit, name, fmt] of [[1, 'floorCol', gl.RGBA8], [2, 'floorEm', gl.RGBA8], [3, 'rockLift', gl.R8]]) {
      gl.deleteTexture(G[name]); G[name] = gpuTex(gl, unit); gl.texStorage2D(gl.TEXTURE_2D, 1, fmt, W, H);
      if (G[name + 'Spare']) { gl.deleteTexture(G[name + 'Spare']); G[name + 'Spare'] = null; }
    }
    G.floorW = W; G.floorH = H;
  }
  G.floorFor = f;
  G.dirty = [[0, 0, W, H]];
}
// The painted window moved (paint.js pntWindowMove): the textures shifted
// on the GPU, so that what was at (x + dx, y + dy) is at (x, y), and only
// the strips exposed are uploaded as they're painted, not the whole lot
// again. (Each kind has a spare texture to copy into; they swap.)
function gpuFloorShift(dx, dy) {
  const G = Gpu, gl = G.gl, W = G.floorW, H = G.floorH;
  if (!G.on || !W || !G.floorFor) return false;
  const adx = Math.abs(dx), ady = Math.abs(dy);
  if (adx >= W || ady >= H) return false;
  // (the buffers have moved already: what's still to go up goes up from
  // its new place, after the shift)
  for (const b of G.dirty) { b[0] -= dx; b[1] -= dy; b[2] -= dx; b[3] -= dy; }
  if (!G.shiftFb) G.shiftFb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, G.shiftFb); G.boundFb = G.shiftFb;
  for (const [unit, name, fmt] of [[1, 'floorCol', gl.RGBA8], [2, 'floorEm', gl.RGBA8], [3, 'rockLift', gl.R8]]) {
    const spare = name + 'Spare';
    if (!G[spare]) { G[spare] = gpuTex(gl, unit); gl.texStorage2D(gl.TEXTURE_2D, 1, fmt, W, H); }
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, G[name], 0);
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, G[spare]);
    gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, Math.max(0, -dx), Math.max(0, -dy), Math.max(0, dx), Math.max(0, dy), W - adx, H - ady);
    const t = G[name]; G[name] = G[spare]; G[spare] = t;
  }
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, null, 0);
  gpuBind(null);
  G.stats.uploads++;
  return true;
}
function gpuFloorDirty(x0, y0, x1, y1) {
  const G = Gpu;
  if (!G.on || x1 <= x0 || y1 <= y0) return;
  if (G.dirty.length > 12) { const d = G.dirty; G.dirty = [[Math.min(...d.map((b) => b[0])), Math.min(...d.map((b) => b[1])), Math.max(...d.map((b) => b[2])), Math.max(...d.map((b) => b[3]))]]; }
  G.dirty.push([x0, y0, x1, y1]);
}
function gpuFloorSync() {
  const G = Gpu, gl = G.gl, W = G.floorW, H = G.floorH;
  if (!G.dirty.length || !View.floorImgs || View.floorImgs[0].width !== W) { G.dirty.length = 0; return; }
  const srcs = [[1, G.floorCol, gl.RGBA, View.floorImgs[0].data, 4], [2, G.floorEm, gl.RGBA, View.floorImgs[1].data, 4], [3, G.rockLift, gl.RED, View.rockLift, 1]];
  for (const [x0, y0, x1, y1] of G.dirty) {
    const bx0 = Math.max(0, x0), by0 = Math.max(0, y0), bw = Math.min(W, x1) - bx0, bh = Math.min(H, y1) - by0;
    if (bw <= 0 || bh <= 0) continue;
    for (const [unit, tex, fmt, data, bpp] of srcs) {
      if (!data) continue;
      // (the box copied out tight: a whole floor's row stride costs some
      // browsers a copy of the lot)
      let box = data;
      if (bw < W) {
        const n = bw * bh * bpp;
        if (!G.box || G.box.length < n) G.box = new Uint8Array(Math.max(n, 1 << 16));
        box = G.box.subarray(0, n);
        for (let y = 0; y < bh; y++) box.set(data.subarray(((by0 + y) * W + bx0) * bpp, ((by0 + y) * W + bx0 + bw) * bpp), y * bw * bpp);
      } else box = data.subarray(by0 * W * bpp, (by0 + bh) * W * bpp);
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, bx0, by0, bw, bh, fmt, gl.UNSIGNED_BYTE, box);
    }
    G.stats.uploads++;
  }
  G.dirty.length = 0;
}

// ---- the batch -------------------------------------------------------------
// The quads of a phase (the scene, or what's drawn over the lit picture)
// gather in one array, in order, as runs sharing a blend mode, a clip and
// a dynamic picture; a whole-layer clear is a run of its own. The phase
// is drawn at once (gpuFlush): the array goes up in one upload, to the
// next of a ring of buffers so none the GPU may still read is written,
// and each run is an instanced draw from its offset. The overlay's quads
// queue apart, drawn last onto the canvas.
// (binding the framebuffer that's bound already can end a render pass)
function gpuBind(fb) {
  const G = Gpu;
  if (G.boundFb === fb) return;
  G.gl.bindFramebuffer(G.gl.FRAMEBUFFER, fb);
  G.boundFb = fb;
}
function gpuRun() {
  const G = Gpu, c = G.cur;
  if (c && !c.clear && c.blend === G.blend && c.clip === G.clip && c.dyn === G.dyn) return c;
  G.cur = { start: G.n, n: 0, blend: G.blend, clip: G.clip, dyn: G.dyn };
  G.runs.push(G.cur);
  return G.cur;
}
function gpuPush(over, x, y, w, h, u0, v0, u1, v1, page, r, g, b, a, flags) {
  const G = Gpu;
  if (over) {
    if (G.on_ >= G.ocap) { G.ocap *= 2; const q = new Float32Array(G.ocap * GPU_Q); q.set(G.oq); G.oq = q; }
    const q = G.oq, k = G.on_++ * GPU_Q;
    q[k] = x; q[k + 1] = y; q[k + 2] = w; q[k + 3] = h; q[k + 4] = u0; q[k + 5] = v0; q[k + 6] = u1; q[k + 7] = v1; q[k + 8] = page; q[k + 9] = r; q[k + 10] = g; q[k + 11] = b; q[k + 12] = a; q[k + 13] = -2; q[k + 14] = flags;
    return;
  }
  if (G.n >= G.cap) { G.cap *= 2; const q = new Float32Array(G.cap * GPU_Q); q.set(G.q); G.q = q; }
  G.drawn = true;
  gpuRun().n++;
  const q = G.q, k = G.n++ * GPU_Q;
  q[k] = x; q[k + 1] = y; q[k + 2] = w; q[k + 3] = h; q[k + 4] = u0; q[k + 5] = v0; q[k + 6] = u1; q[k + 7] = v1; q[k + 8] = page; q[k + 9] = r; q[k + 10] = g; q[k + 11] = b; q[k + 12] = a; q[k + 13] = G.feet; q[k + 14] = flags;
}
// The state the quads pushed next are drawn with.
function gpuState(blend, clip, dyn) { const G = Gpu; G.blend = blend; G.clip = clip; G.dyn = dyn; }
// A whole-layer clear (clearRect over the view), in its place in the order.
function gpuClear(em, x, y, w, h) { const G = Gpu; G.runs.push({ clear: true, em, x, y, w, h }); G.cur = null; }
function gpuBlendSet(gl, blend) {
  if (blend === 1) gl.blendFunc(gl.ONE, gl.ONE);
  else if (blend === 2) gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
  else if (blend === 3) gl.blendFuncSeparate(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
}
function gpuScissor(gl, clip) {
  const G = Gpu;
  if (!clip) { gl.disable(gl.SCISSOR_TEST); return; }
  const x0 = Math.max(0, clip[0]), y0 = Math.max(0, clip[1]), x1 = Math.min(G.w, clip[2]), y1 = Math.min(G.h, clip[3]);
  gl.enable(gl.SCISSOR_TEST); gl.scissor(x0, Math.max(0, G.h - y1), Math.max(0, x1 - x0), Math.max(0, y1 - y0));
}
// The quad program and its textures, for the target, and the array q
// (n quads) uploaded to the ring's next buffer.
function gpuQuadsReady(q, n, target) {
  const G = Gpu, gl = G.gl;
  gpuBind(target === 'scene' ? G.scene.fb : target === 'lit' ? G.lit.fb : null);
  gl.viewport(0, 0, G.w, G.h);
  gl.useProgram(G.quad.p);
  gl.uniform2f(G.quad.u.uViewF, G.w, G.h); gl.uniform2i(G.quad.u.uView, G.w, G.h); gl.uniform2i(G.quad.u.uCam, G.ox + PWIN.x, G.oy + PWIN.y); gl.uniform2i(G.quad.u.uFloorSize, G.floorW, G.floorH);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, G.atlasTex);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, G.floorCol);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, G.floorEm);
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, G.rockLift);
  gl.bindVertexArray(G.vao);
  G.bi = (G.bi + 1) % GPU_RING;
  gl.bindBuffer(gl.ARRAY_BUFFER, G.bufs[G.bi]);
  gl.bufferData(gl.ARRAY_BUFFER, q.subarray(0, n * GPU_Q), gl.STREAM_DRAW);
  G.stats.uploads++;
}
// One run: its state, its quads from their offset.
function gpuDrawRun(start, n, blend, clip, dyn) {
  const G = Gpu, gl = G.gl;
  gl.uniform1i(G.quad.u.uBlend, blend);
  gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, dyn ? dyn.tex : G.dynTex);
  gpuBlendSet(gl, blend);
  gpuScissor(gl, clip);
  for (const [a, size, off] of G.attribs) gl.vertexAttribPointer(a, size, gl.FLOAT, false, GPU_Q * 4, (start * GPU_Q + off) * 4);
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
  G.stats.draws++; G.stats.quads += n;
}
// The phase drawn: its runs in order, into the target.
function gpuFlush() {
  const G = Gpu, gl = G.gl;
  if (!G.runs.length) return;
  if (G.n) gpuQuadsReady(G.q, G.n, G.target); else gpuBind(G.target === 'scene' ? G.scene.fb : G.lit.fb);
  for (const r of G.runs) {
    if (r.clear) { gpuScissor(gl, [r.x, r.y, r.x + r.w, r.y + r.h]); gl.clearBufferfv(gl.COLOR, r.em ? 1 : 0, GPU_ZERO); continue; }
    if (r.n) gpuDrawRun(r.start, r.n, r.blend, r.clip, r.dyn);
  }
  gl.disable(gl.SCISSOR_TEST);
  gl.bindVertexArray(null);
  G.n = 0; G.runs = []; G.cur = null;
}
function gpuDrop() { const G = Gpu; G.n = 0; G.runs = []; G.cur = null; }

// ---- a frame ---------------------------------------------------------------
function gpuFrameBegin() {
  const G = Gpu;
  if (!G.on) return;
  G.frame++; gpuDrop(); G.on_ = 0; G.target = 'scene'; G.litDone = false; G.feet = -2; G.ox = 0; G.oy = 0; G.drawn = false;
  G.stats.quads = 0; G.stats.draws = 0; G.stats.uploads = 0;
  // (both of the scene's layers cleared at once, as the pass opens)
  const gl = G.gl;
  gpuBind(G.scene.fb);
  gl.clearBufferfv(gl.COLOR, 0, GPU_BLACK); gl.clearBufferfv(gl.COLOR, 1, GPU_ZERO);
  for (const c of [View.ctx, View.emCtx, View.overCtx]) if (c && c.gpu) c.reset();
}
// Nothing to show: the lit picture and the glow black.
function gpuBlank() {
  const G = Gpu, gl = G.gl;
  gpuDrop();
  gpuBind(G.lit.fb);
  gl.clearBufferfv(gl.COLOR, 0, GPU_BLACK); gl.clearBufferfv(gl.COLOR, 1, GPU_ZERO);
  for (const p of G.passes) { gpuBind(p.fb); gl.clearBufferfv(gl.COLOR, 0, GPU_ZERO); }
  G.litDone = true;
}
// The scene is drawn: the light pass runs from it into the lit picture
// (gllight.js glLightScene), and what's drawn after goes over that.
function gpuLightBegin() {
  const G = Gpu, gl = G.gl;
  gpuFlush();
  gpuBind(G.lit.fb);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.NONE]);
  gl.viewport(0, 0, G.w, G.h);
  gl.disable(gl.BLEND);
  gl.bindVertexArray(G.triVao);
}
function gpuLightEnd() {
  const G = Gpu, gl = G.gl;
  gl.bindVertexArray(null);
  gl.enable(gl.BLEND);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
  G.target = 'lit'; G.litDone = true;
}
// The bloom's passes from the emissive layer, on the world's grid. cx,
// cy: the camera in the world (art px).
function gpuBloom(cx, cy) {
  const G = Gpu, gl = G.gl;
  gl.disable(gl.BLEND);
  gl.useProgram(G.bloomP.p);
  gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, G.sceneEm);
  gl.uniform2i(G.bloomP.u.uView, G.w, G.h);
  gl.bindVertexArray(G.triVao);
  for (const p of G.passes) {
    const gx = Math.floor(cx / p.s) * p.s, gy = Math.floor(cy / p.s) * p.s;
    p.ox = gx - cx; p.oy = gy - cy;
    gpuBind(p.fb);
    gl.viewport(0, 0, p.pw, p.ph);
    gl.uniform2i(G.bloomP.u.uOut, p.pw, p.ph); gl.uniform1f(G.bloomP.u.uS, p.s); gl.uniform2f(G.bloomP.u.uOrg, p.ox, p.oy);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  gl.bindVertexArray(null);
  gl.enable(gl.BLEND);
}
// The frame onto the canvas: the lit picture with the bloom added, then
// the overlay's quads.
function gpuFrameEnd() {
  const G = Gpu, gl = G.gl;
  if (!G.on || !G.w) return;
  // (a frame that didn't get as far as the light keeps the last lit
  // picture, as the 2D canvas kept it: what it queued isn't drawn)
  if (G.litDone) { gpuFlush(); gpuBloom(-G.ox, -G.oy); } else gpuDrop();
  gpuBind(null);
  gl.viewport(0, 0, G.w, G.h);
  gl.disable(gl.BLEND);
  gl.useProgram(G.outP.p);
  gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, G.litTex);
  const pass = new Float32Array(16), size = new Float32Array(8);
  G.passes.forEach((p, k) => { gl.activeTexture(gl.TEXTURE6 + k); gl.bindTexture(gl.TEXTURE_2D, p.tex); pass[k * 4] = p.s; pass[k * 4 + 1] = p.a; pass[k * 4 + 2] = p.ox; pass[k * 4 + 3] = p.oy; size[k * 2] = p.pw; size[k * 2 + 1] = p.ph; });
  gl.uniform2i(G.outP.u.uView, G.w, G.h); gl.uniform1i(G.outP.u.uN, G.passes.length); gl.uniform4fv(G.outP.u.uPass, pass); gl.uniform2fv(G.outP.u.uPassSize, size);
  gl.bindVertexArray(G.triVao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindVertexArray(null);
  gl.enable(gl.BLEND);
  if (G.on_) { gpuQuadsReady(G.oq, G.on_, 'canvas'); gpuDrawRun(0, G.on_, 0, null, G.odyn); gl.disable(gl.SCISSOR_TEST); gl.bindVertexArray(null); G.on_ = 0; G.odyn = null; }
}

// ---- a 2D context stood in for -------------------------------------------
// layers: GPU_F.COL, GPU_F.EM or both; over: the overlay's queue, drawn
// unlit over the frame; litOnly: never the scene (the overlay).
class GpuCtx {
  constructor(layers, over = false) {
    this.gpu = true; this.layers = layers; this.over = over;
    this.canvas = Gpu.canvas;
    this.reset();
  }
  reset() { this.fillStyle = '#000000'; this.globalAlpha = 1; this.globalCompositeOperation = 'source-over'; this.imageSmoothingEnabled = false; this.tx = 0; this.ty = 0; this.clipBox = null; this.stack = []; this.path = null; }
  get fillStyle() { return this._fs; }
  set fillStyle(v) { if (v !== this._fs) { this._fs = v; this._rgba = gpuColour(v); } }
  get globalCompositeOperation() { return this._op; }
  set globalCompositeOperation(v) { this._op = v; this._blend = GPU_BLEND[v] || 0; }
  save() { this.stack.push([this.tx, this.ty, this.clipBox, this.globalAlpha, this._fs, this._op, this.imageSmoothingEnabled]); }
  restore() { const s = this.stack.pop(); if (s) { this.tx = s[0]; this.ty = s[1]; this.clipBox = s[2]; this.globalAlpha = s[3]; this.fillStyle = s[4]; this.globalCompositeOperation = s[5]; this.imageSmoothingEnabled = s[6]; } }
  translate(x, y) { this.tx += x; this.ty += y; }
  beginPath() { this.path = null; }
  rect(x, y, w, h) { this.path = [x + this.tx, y + this.ty, x + w + this.tx, y + h + this.ty]; }
  closePath() {}
  clip() { if (this.path) { const p = this.path, c = this.clipBox; this.clipBox = c ? [Math.max(c[0], p[0]), Math.max(c[1], p[1]), Math.min(c[2], p[2]), Math.min(c[3], p[3])] : p; } }
  _state(dyn) { if (!this.over) gpuState(this._blend, this.clipBox, dyn || null); }
  fillRect(x, y, w, h) {
    const a = this.globalAlpha;
    if (a <= 0 || !(w > 0 && h > 0)) return;
    const c = this._rgba, ca = c[3] * a, G = Gpu;
    // (the frame's first fill of the whole view: the layer's clear colour instead)
    if (!this.over && !G.drawn && G.target === 'scene' && ca >= 1 && !this.clipBox && this._blend === 0 && x + this.tx <= 0 && y + this.ty <= 0 && w >= G.w && h >= G.h) {
      if (c[0] || c[1] || c[2]) { gpuBind(G.scene.fb); if (this.layers & GPU_F.COL) G.gl.clearBufferfv(G.gl.COLOR, 0, new Float32Array([c[0], c[1], c[2], 1])); if (this.layers & GPU_F.EM) G.gl.clearBufferfv(G.gl.COLOR, 1, new Float32Array([c[0], c[1], c[2], 1])); }
      return;
    }
    this._state(null);
    gpuPush(this.over, x + this.tx, y + this.ty, w, h, 0, 0, 1, 1, 0, c[0] * ca, c[1] * ca, c[2] * ca, ca, this.layers | GPU_F.SOLID);
  }
  clearRect(x, y, w, h) {
    if (this.over) return;
    const G = Gpu;
    if (x <= 0 && y <= 0 && w >= G.w && h >= G.h && !this.clipBox) {
      if (!G.drawn && G.target === 'scene') return;
      if (this.layers & GPU_F.EM) gpuClear(true, 0, 0, G.w, G.h); if (this.layers & GPU_F.COL) gpuClear(false, 0, 0, G.w, G.h);
      return;
    }
    gpuState(2, this.clipBox, null);
    gpuPush(false, x + this.tx, y + this.ty, w, h, 0, 0, 1, 1, 0, 0, 0, 0, 1, this.layers | GPU_F.SOLID);
  }
  // drawImage(img, dx, dy), (img, dx, dy, dw, dh), (img, sx, sy, sw, sh, dx, dy, dw, dh)
  drawImage(img, a1, a2, a3, a4, a5, a6, a7, a8) {
    const alpha = this.globalAlpha;
    if (alpha <= 0 || !img) return;
    let sx, sy, sw, sh, dx, dy, dw, dh;
    if (a5 === undefined) { sx = 0; sy = 0; sw = img.width; sh = img.height; dx = a1; dy = a2; dw = a3 === undefined ? sw : a3; dh = a4 === undefined ? sh : a4; }
    else { sx = a1; sy = a2; sw = a3; sh = a4; dx = a5; dy = a6; dw = a7; dh = a8; }
    if (!(sw > 0 && sh > 0 && dw !== 0 && dh !== 0)) return;
    // (a source box past the picture's edge is cut, keeping the scale, as the browser does)
    if (sx < 0) { const k = -sx / sw; dx += dw * k; dw -= dw * k; sw += sx; sx = 0; }
    if (sy < 0) { const k = -sy / sh; dy += dh * k; dh -= dh * k; sh += sy; sy = 0; }
    if (sx + sw > img.width) { const k = (sx + sw - img.width) / sw; dw -= dw * k; sw = img.width - sx; }
    if (sy + sh > img.height) { const k = (sy + sh - img.height) / sh; dh -= dh * k; sh = img.height - sy; }
    if (!(sw > 0 && sh > 0)) return;
    let flags = this.layers | (this.imageSmoothingEnabled ? GPU_F.SMOOTH : 0), u0, v0, page = 0, dyn = null;
    if (img === View.floorCol || img === View.floorEm) { if (Gpu.dirty.length) gpuFloorSync(); flags |= img === View.floorCol ? GPU_F.FLOOR : GPU_F.FLOOREM; u0 = sx; v0 = sy; }
    // (a picture too big for a page, or one that asks (gpuOwn: the stands'
    // atlas pages, which the shared atlas can't always find room for), as a
    // texture of its own)
    else if (img.gpuOwn || img.width > GPU_ATLAS || img.height > GPU_ATLAS) { const t = Gpu.dynTexs.get(img); dyn = t && t.tex ? { tex: t.tex } : gpuOwnTex(img, img.getContext('2d').getImageData(0, 0, img.width, img.height), 0, img.height); flags |= GPU_F.DYN; u0 = sx; v0 = sy; }
    else { const e = gpuPic(img); if (!e) return; u0 = e.x + sx; v0 = e.y + sy; page = e.page; if (flags & GPU_F.SMOOTH) { flags &= ~GPU_F.SMOOTH; if (dw !== sw || dh !== sh) flags |= GPU_F.SMOOTH; } }
    if (dyn && this.over) Gpu.odyn = dyn; else this._state(dyn);
    gpuPush(this.over, dx + this.tx, dy + this.ty, dw, dh, u0, v0, u0 + sw, v0 + sh, page, alpha, alpha, alpha, alpha, flags);
  }
  // Pixels rewritten each frame (an ImageData), the box sx, sy, sw, sh of
  // them at dx, dy: uploaded (the rows that changed) and drawn.
  drawPixels(img, sx, sy, sw, sh, dx, dy) {
    const alpha = this.globalAlpha;
    if (alpha <= 0 || !(sw > 0 && sh > 0)) return;
    const t = gpuOwnTex(img, img, sy, sy + sh);
    if (this.over) Gpu.odyn = t; else this._state(t);
    gpuPush(this.over, dx + this.tx, dy + this.ty, sw, sh, sx, sy, sx + sw, sy + sh, 0, alpha, alpha, alpha, alpha, this.layers | GPU_F.DYN);
  }
}

// A CSS colour as [r, g, b, a] in 0-1 (kept; the odd form through a canvas).
const _gpuCols = new Map();
function gpuColour(s) {
  let c = _gpuCols.get(s);
  if (c) return c;
  let m;
  if ((m = /^#([0-9a-f]{3,4})$/i.exec(s))) { const h = m[1]; c = [parseInt(h[0] + h[0], 16) / 255, parseInt(h[1] + h[1], 16) / 255, parseInt(h[2] + h[2], 16) / 255, h.length > 3 ? parseInt(h[3] + h[3], 16) / 255 : 1]; }
  else if ((m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(s))) { c = [parseInt(m[1].slice(0, 2), 16) / 255, parseInt(m[1].slice(2, 4), 16) / 255, parseInt(m[1].slice(4, 6), 16) / 255, m[2] ? parseInt(m[2], 16) / 255 : 1]; }
  else if ((m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(s))) c = [+m[1] / 255, +m[2] / 255, +m[3] / 255, m[4] === undefined ? 1 : +m[4]];
  else {
    const x = document.createElement('canvas').getContext('2d');
    x.fillStyle = s; x.fillRect(0, 0, 1, 1);
    const d = x.getImageData(0, 0, 1, 1).data;
    c = d[3] ? [d[0] / d[3], d[1] / d[3], d[2] / d[3], d[3] / 255] : [0, 0, 0, 0];
  }
  if (_gpuCols.size > 4096) _gpuCols.clear();
  _gpuCols.set(s, c);
  return c;
}
