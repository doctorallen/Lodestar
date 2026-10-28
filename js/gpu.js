'use strict';
// ---------------------------------------------------------------------------
// The frame on the GPU (docs/RENDERING.md), on Tycho's renderer, which grew
// from this file (vendor/tycho/docs/renderer.md). Where there's WebGL2 the
// view is one WebGL canvas and everything the frame draws goes through a
// batcher that stands in for the 2D contexts (View.ctx, View.emCtx and
// View.overCtx: fillRect, drawImage, globalAlpha, the blend modes,
// save/restore, a rect clip and a translate), so the game's drawing code is
// unchanged. Each call becomes a quad: a sprite's pixels live in an atlas
// (texture array pages, uploaded once from the canvas the builders painted),
// the floor's painted buffers go up as the ground's textures by the box as
// they're painted, and the rock standing in front of an actor is put back
// over it in the shader (the rule paintOcclude had) from the rock's lift
// texture, so nothing is drawn twice and nothing is ever read back. A frame:
// the scene into a framebuffer with a colour and an emissive attachment, the
// light pass (gllight.js) from that into the lit picture, the bloom from the
// emissive in passes on the world's grid, and a last pass that adds the two
// onto the canvas, with the unlit overlay's quads over it. Without WebGL2 the
// 2D canvases and the JavaScript lighting run as they always did (Gpu.on is
// false).
//
// This file keeps the names the rest of the game uses (Gpu, gpuPic, the
// floor's functions...) over Tycho's Gpu.
// ---------------------------------------------------------------------------

// Before WebGL2 is tried, and where there's none, a stand-in that's off.
let Gpu = { on: false, tried: false, feet: -2, ox: 0, oy: 0, stats: { quads: 0, draws: 0, uploads: 0 } };
const GPU_F = Tycho.gpu.F;
const GPU_ATLAS = 2048, GPU_WARM_FRAMES = 240;
const GPU_TRI_VS = Tycho.gpu.TRI_VS;

// Takes the view's canvas for WebGL2; false (and the 2D path) if the
// browser hasn't it. The query ?nogpu keeps the 2D path for comparison.
function gpuInit(canvas) {
  if (Gpu.tried) return Gpu.on;
  Gpu.tried = true;
  const g = Tycho.gpu.Gpu.create(canvas, { atlas: GPU_ATLAS, occlude: true, onError: (e) => noteError(e) });
  if (!g) return false;
  g.tried = true;
  // the ground is the floor's painted window: its canvases stand for its
  // textures, and its place in the world is the window's
  Object.defineProperty(g, 'groundSrc', { get: () => [View.floorCol, View.floorEm] });
  Object.defineProperty(g, 'groundX', { get: () => PWIN.x });
  Object.defineProperty(g, 'groundY', { get: () => PWIN.y });
  g.onGroundDraw = gpuFloorSync;
  Gpu = g;
  return true;
}

// The framebuffers at the view's size (render.js resizeView), with the
// bloom's passes (T.light.bloom: [downscale, strength] each).
function gpuResize(w, h) {
  if (!Gpu.on) return;
  Gpu.resize(w, h, T.light.bloom.slice(0, 4).map(([div, a]) => [div * AP, a * T.light.glow]));
}

// ---- the atlas -------------------------------------------------------------
// Where a canvas (or image) is on the pages: { x, y, w, h, page }.
function gpuPic(src) { return Gpu.pic(src); }
// A sprite's pictures onto the pages ahead of its first frame (the
// loading, loader.js), so no frame in play waits for them.
function gpuWarm(spr) { if (Gpu.on && spr) Gpu.warm(spr.c, spr.ec); }
// A canvas drawn before has been painted again: its pixels are read anew
// the next time it's drawn.
function gpuDirty(src) { if (Gpu.on) Gpu.dirty(src); }
// A picture of its own (bigger than a page, or pixels rewritten each
// frame): a 2D texture, the rows y0..y1 uploaded.
function gpuOwnTex(src, img, y0, y1) { return Gpu.ownTex(src, img, y0, y1); }

// ---- the floor's textures --------------------------------------------------
// The floor's painted buffers (paint.js: colour, emissive, the rock's lift)
// as the ground's textures: whole when a floor starts, else the boxes
// painted since (pntComposite marks them), before the frame draws the floor.
function gpuFloorStart(f, W, H) { if (Gpu.on) Gpu.groundStart(W, H); }
// The painted window moved (paint.js pntWindowMove): the textures shifted
// on the GPU, so only the strips exposed are uploaded as they're painted.
function gpuFloorShift(dx, dy) { return Gpu.on ? Gpu.groundShift(dx, dy) : false; }
function gpuFloorDirty(x0, y0, x1, y1) { if (Gpu.on) Gpu.groundDirty(x0, y0, x1, y1); }
function gpuFloorSync() {
  if (!View.floorImgs || View.floorImgs[0].width !== Gpu.groundW) { Gpu.groundDirtyBoxes.length = 0; return; }
  Gpu.groundSync(View.floorImgs[0].data, View.floorImgs[1].data, View.rockLift);
}

// ---- the light pass's plumbing (gllight.js) ---------------------------------
function gpuProgram(gl, vs, fs, uniforms) { return Gpu.program(vs, fs, uniforms); }
function gpuTex(gl, unit, kind, filter) { return Gpu.tex(unit, kind, filter); }
function gpuBind(fb) { Gpu.bind(fb); }
function gpuLightBegin() { Gpu.lightBegin(); }
function gpuLightEnd() { Gpu.lightEnd(); }

// ---- a frame ---------------------------------------------------------------
function gpuFrameBegin() { if (Gpu.on) Gpu.frameBegin([View.ctx, View.emCtx, View.overCtx]); }
// Nothing to show: the lit picture and the glow black.
function gpuBlank() { Gpu.blank(); }
// The frame onto the canvas: the lit picture with the bloom added, then the
// overlay's quads.
function gpuFrameEnd() { if (Gpu.on) Gpu.frameEnd(); }

// A 2D context stood in for: layers GPU_F.COL, GPU_F.EM or both; over: the
// overlay's queue, drawn unlit over the frame.
function GpuCtx(layers, over = false) { return Gpu.ctx(layers, over); }
// (for the tests: the atlas's pages built again from what's drawn lately)
function gpuAtlasRebuild(need) { Gpu.rebuild(need); }
