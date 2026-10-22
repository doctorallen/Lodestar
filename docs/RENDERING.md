# Rendering plan

**Status (2026-10-22):** step 1, the frame on the GPU, is built (`js/gpu.js`; DECISIONS.md, "the frame on the GPU"), with 0b, 0c and 0d of step 0 folded in. Measured after: Chrome 1.3 ms a frame coarse and 2.0 fine (from 4.3 and 7.6), WebKit 2 ms (from 20), no frame over 20 ms in Chrome at either grain. Still to do: 0a (the `?perf` readout), 0e (chunk painting off the frame), 0f (interpolation), step 2 and step 3.

Where the frame goes today, what was measured on 2026-10-22, what other browser games do, and the plan: the whole frame drawn by one GPU context, with nothing read back and nothing copied between the 2D canvas and WebGL. Numbers from the measurements are in the tables; the scripts that took them are described under Measuring.

## 1. The frame today

A frame is drawn in four stacked canvases (`#view`, `#view-glow`, `#bloom`, `#view-over`), each composited by the browser:

1. `#view` (2D, GPU-backed where there's WebGL2): the floor's painted picture is blitted, then every sprite, dot and rectangle, with the rock drawn back over each actor from a cached canvas (`paintOcclude`).
2. `#view-glow` (2D, software: `willReadFrequently`): the same again for what glows.
3. The light: the whole of `#view` is uploaded to a WebGL texture (`texImage2D` of the canvas), the shader lights it, and the WebGL canvas is drawn back into `#view` (`drawImage`). Two crossings between the 2D canvas and WebGL, every frame.
4. The bloom: `#view-glow` is shrunk through software canvases and summed into `#bloom`, which the browser adds over the view with `mix-blend-mode: plus-lighter`.
5. `#view-over` (2D): bars, numbers, labels.

Before the GPU lighting, `#view` was software too and the light was summed in JavaScript, which read the view back and wrote it again (12 ms a frame on this Mac, with major garbage collections from its allocations).

## 2. What was measured

Chrome 155 on the 16" MacBook Pro (Intel UHD 630 and AMD Radeon Pro 5500M; the main display at 60 Hz), a window on the real GPU, phone-sized page (390 × 844 at 3×), walking and mining on a floor for 12 s. Medians unless marked; ms.

| stage | coarse, GPU light | fine, GPU light | coarse, JavaScript light (as it was) |
|---|---|---|---|
| game step | 0.2 | 0.2 | 0.2 |
| chunk painting (`pntFrame`) | 0 (p99 5.9, max 7) | 0 (p95 6, max 27.6) | 0 (p99 5) |
| light (`lightScene`) | 1.7 | 3.0 | 8.4 (p95 18, max 64) |
| of which the view's upload (`texImage2D`) | 1.2 | 1.8 | |
| copy back (`drawImage` of the GL canvas) | < 0.1 | < 0.1 | |
| bloom (software) | 1.1 | 1.6 | 1.1 |
| the whole frame callback | 4.3 (p99 10.7) | 7.6 (p99 17) | 11.2 (p99 27) |
| main-thread frame incl. commit (`BeginMainFrame`) | 7.7 | 12.4 | 14.2 |
| frames over 16.7 ms, of ~620 | 4 | 85 | 175 |
| animation-frame gaps over 20 ms, of ~715 | 1 | 6 | 16 |

What this says:

- **In Chrome on this Mac the GPU light made things smoother, not rougher.** The JavaScript light missed a frame in four and had 30–65 ms garbage-collection spikes. The GPU light misses almost none at coarse grain.
- **At fine grain the main thread has no margin.** 12 ms of a 16.7 ms budget is spent before the compositor commits, so any spike (a chunk painted in-frame: up to 27 ms) drops frames. One frame in seven is late.
- **The upload of the view to WebGL costs more than the lighting itself** (1.2–1.8 ms of the 1.7–3.0). The shader and the copy back are under 0.3 ms together. At the desktop view size it's the same story.
- **The ~50 ms hitches in Chrome are not ours.** A Chrome trace shows 2–4 stalls of 37–57 ms per 10 s in the GPU process at buffer swap (`IOSurfaceImageBacking::WaitForCommandsToBeScheduled`, the wait for Metal to schedule the stacked canvases' raster), with or without WebGL (the no-WebGL control has them too), at both grains, and with the WebGL context on the low-power GPU. They're a Chrome-on-macOS compositor cost of composited canvas layers; fewer canvas layers is the lever we have on them.
- **The dual-GPU request costs a little.** With `powerPreference: 'high-performance'` the WebGL context runs on the AMD GPU while the canvases and compositor run on the Intel one; the trace shows three times as many cross-device waits (1877 vs 628 per 10 s), and Chrome's own guidance is that the switch itself stalls the system for about a second.

**WebKit** (Playwright's build of Safari 26's engine, on the same Mac, same walk, coarse grain; its clock is whole ms):

| stage | GPU light | JavaScript light (as it was) |
|---|---|---|
| the view's upload to WebGL (`texImage2D`) | 8 | |
| copy back (`drawImage` of the GL canvas) | 3 (max 46) | |
| light, in all | 12 | 68 |
| chunk painting | 0 (p95 19, max 87) | 14 (max 116) |
| the whole frame callback | 20 (p95 40) | 92 |
| animation-frame gap | 27 (p95 48, max 115) | 98 |
| frames over 34 ms, of all | 110 of 290 | 114 of 114 |

In WebKit the two crossings cost 11 ms a frame on their own, which is the readback path the research describes (section 3), and the frame never makes 60 Hz; a chunk painted in-frame takes 13–20 ms and up to 87. (The JavaScript light is far slower in JavaScriptCore than in V8, which is why Safari was the browser the GPU light was most needed in.) Fine grain in WebKit didn't finish loading in three minutes under the test harness; worth checking by hand before it's offered on Safari.

Playwright's WebKit isn't Safari itself and this Mac isn't an iPhone; the shape of the costs is what carries, not the numbers. Section 4 has what's known of Safari.

## 3. What browser games do

- **One GPU context draws everything.** The 2D canvas, where used at all, builds textures offline (sprite sheets, glyphs); nothing crosses from a 2D canvas into WebGL or back each frame. Drawing a WebGL canvas into a 2D canvas is a documented readback path in Chromium (issue 40314054, 5–19 ms a frame on the GPUs measured) and was slow enough in Firefox and Safari that the WebGL list's advice was "you probably can't hit 30 fps". In Safari, uploading a 2D canvas to a WebGL texture is today a full readback of the canvas to the content process, a CPU copy, and a re-upload (WebKit 294602, June 2025; "not much improved" in Safari 26.1), and `drawImage` from an offscreen WebGL canvas was up to 100× slower on iOS 17 with Advanced Tracking and Fingerprinting Protection on (WebKit 266181, 263013), a mode Private Browsing uses by default.
- **Pixel art is rendered at art resolution into a framebuffer, sampled nearest, and upscaled by a whole number**; the camera is snapped to whole art pixels after smoothing. Lodestar already does both (the canvas is one art px a pixel, scaled by whole device pixels in CSS; `T.art.steadyCam`).
- **Sprites come from an atlas and are drawn in batches**: one draw call per run of quads sharing a texture page and blend mode (PixiJS v8's batcher breaks a batch on a texture or blend change; a 2048² page holds every sprite this game has). Points and rectangles are quads too.
- **Lighting is a light buffer multiplied into the colour**, lights added into it one by one, with an emissive layer kept in a second render target (multiple render targets, WebGL2 core), not a second canvas. Normal maps are the usual way to light sprites' relief; a height map does the same for terrain.
- **Shadows in 2D are either a 1D shadow map per light** (occluders drawn into a small texture round the light, one ray per angle, then a lit/unlit test per pixel; mattdesl's pixel-perfect shadows) **or a march across a height map in the fragment shader** (the Godot top-down height-map shadow shaders). Lodestar's walls already have heights (`View.rockHf`), so the second needs no new art.
- **The game loop runs a fixed step and renders between steps by interpolation** on displays faster than the step (120 Hz phones, Chrome on high-refresh monitors; Safari holds `requestAnimationFrame` to 60 Hz). Lodestar steps at 60 Hz with no interpolation, which is fine at 60 Hz and judders on faster displays.
- **Work that isn't drawing goes to a worker**: `OffscreenCanvas` or plain typed arrays in a Web Worker, so painting new ground never lands inside a frame.
- **WebGPU** is on by default in Chrome (113; Android 121 on Android 12+ with Qualcomm/ARM GPUs), Safari 26 (macOS, iOS, iPadOS, September 2025), and Firefox 141 on desktop (Windows; macOS from 145); Firefox for Android is expected late 2026. iPhones on iOS 18 and under have no WebGPU. Engines that ship it (PixiJS, three.js, Construct, Babylon) keep WebGL2 as the fallback and report the gains where draw calls were the limit; two threads (Unity 6, Babylon) report WebGPU slower than WebGL2 until bind-group updates were fixed. Lodestar is fill-bound at under half a million pixels a frame; both APIs do that in well under a millisecond. The win here is in the architecture, not the API.

## 4. Safari

What the two crossings cost in WebKit is measured above (11 ms a frame); on an iPhone itself the numbers are still to come (step 0a below gives the game a way to show them). Two things apply to Safari in particular:

- Keep the WebGL canvas in the document (WebKit 266181's workaround: a hidden, offscreen WebGL canvas is what the slow fingerprinting path catches).
- Don't upload a 2D canvas to WebGL every frame (WebKit 294602): the scene must be drawn by WebGL in the first place.

## 5. The plan

The rule: the GPU draws the frame; the CPU decides what and where. Nothing is read back. Nothing is copied between the 2D canvas and WebGL. The 2D canvas is kept for what it's good at: building the art (the painters, the sprite builders, the glyphs) once, offline.

### Step 0: relief now (a day or two, no refactor)

Ship first; each is measurable on its own.

- **0a. A performance readout, `?perf`**: the last few seconds' animation-frame gaps as a histogram, the frame's stages, drawn on the overlay. The phone can't be driven from here; this is how we see what it sees.
- **0b. The lit picture stays where it's made.** The WebGL canvas becomes the on-screen `#view`; the 2D scene canvas goes offscreen. That removes the copy back (the Safari-slow `drawImage` of a WebGL canvas) and puts the WebGL canvas in the document. The upload stays, for now.
- **0c. The bloom in the shader.** A second pass over the emissive texture (halvings on the world grid, as `bloomSceneWorld` does, summed with the lit picture in the final pass). `#view-glow` is then uploaded once as a texture instead of being shrunk through four software canvases, and `#bloom` and its `mix-blend-mode` go. Four composited canvases become two (`#view`, `#view-over`). An earlier GPU bloom measured no faster than software in Chrome; the point now is fewer canvas layers at swap and no software canvases in the frame, which is where Safari and the Chrome swap stalls are.
- **0d. Drop `powerPreference: 'high-performance'`.** The context goes where the page is.
- **0e. Chunk painting that can't own a frame.** The budget (3 ms) is checked only between chunks and a fine-grain chunk takes up to 27 ms: check it per tile row, lower it at fine grain (`T.paint.lazy`), and paint the near ring ahead of the camera by the lead rather than when it's already in view. Then move `pntPaintChunk` to a worker (it's typed-array work from the floor and the palettes; the result is a chunk of pixels, transferable).
- **0f. Interpolated drawing** for the diver, foes and the camera (keep the last step's positions; draw at the fraction of a step since), so displays over 60 Hz are smooth. Not a cause of what's seen on 60 Hz screens; cheap to do now.

### Step 1: the frame on the GPU (the refactor, about two weeks)

A renderer, `js/gpu.js`, behind a small interface (textures and sub-rect uploads, render targets, a quad batcher with a shader, uniforms), so a WebGPU backend can stand behind the same interface later. WebGL2 first: it's everywhere the game runs.

1. **Sprites from atlas pages.** Every sprite canvas (the builders' output, the Kindler's frames, the glyphs) is packed into 2048² pages at load, with a pixel of padding, sampled nearest. `drawArtSprite(spr, x, y)` pushes a quad (position, size, page rectangle, tint, alpha, glow flag); the 38 call sites keep their signature. `dot()` (344 sites) pushes a 1 × 1 quad; `fillRect` on the view becomes a quad helper. Draw order is call order; the batch flushes when the page or the blend changes (one page for the world, one for the Kindler). `LateDots` and its `putImageData` go.
2. **The ground as textures.** The painters stay on the CPU (they're the art). A painted chunk (48 × 48 art px) goes up with `texSubImage2D` into the floor's colour, emissive and rock-lift textures, about 10 KB a chunk. The floor is one textured quad; `repaintAround` uploads the tiles it touched.
3. **The rock over actors, in the shader.** `paintOcclude`'s rule is one line per fragment: a rock pixel at row `ry` with lift `l` stands on floor row `ry + l − 1`, and covers an actor pixel whose feet are north of that. Each actor quad carries its feet row; the sprite shader samples the rock's lift and colour and outputs the rock where it stands in front (in both colour and emissive, as now). The 96-canvas occlusion cache goes, and with it the per-actor `drawImage` of rock.
4. **Emissive as a second render target**, written by the same draw (`gl.drawBuffers`), not a second canvas and a second set of calls.
5. **Light and bloom as now, from framebuffers**: the light cells stay on the CPU (a few thousand floats a frame; `addLight`, the sight marches); the light shader reads the scene framebuffer instead of an uploaded canvas; the bloom from step 0c; one final pass composes lit + bloom to the canvas.
6. **The overlay** (`#view-over`, bars, numbers, labels) stays a 2D canvas for this step: it's thin, nothing reads it back. Step 2 moves its text to the glyph atlas.
7. **Tests.** A golden comparison, as `test/gllight.js` does today: the same scene drawn by the new renderer and by the 2D path, equal within a tone, under SwiftShader at both grains. The `?perf` readout gives the numbers on a device; a `headless: false` script gives them on the Mac.

What moves: the per-frame draw calls (99 `drawImage`, 88 `fillRect`, 344 `dot`, 95 `globalAlpha`, 37 composite-mode sites, most through a handful of helpers in `render.js`, `castfx.js`, `hub.js`, `pshadow.js`). What stays: the 33 `putImageData` and 18 `getImageData` sites are all builders and painters, offline.

### Step 2: light and shadow on the GPU (after step 1 settles)

- **Shadows from the rock's heights.** The lamp's sight (`seeFrom`, rays marched in JavaScript over `View.rockPx` each frame the lamp moves) becomes a march in the light shader against the rock-height texture, or a 1D shadow map per light; the light grid stays coarse (`LC`), so the hard bands and the look stay. Actors' contact shadows (`pshadow.js`) become quads with a shadow shader.
- **Lit rock faces from heights.** With heights on the GPU, a face's and rim's light can come from the height's slope (a normal from the left-right, up-down differences) per light, which is normal-map lighting without authoring normal maps. The painters keep laying the strokes; the light moves over them.
- **Air in the final pass**: haze (a noise texture), motes (quads), the vignette, the beam's air, instead of 2D passes over the view.

### Step 3: a WebGPU backend (when there's a reason)

Behind step 1's interface: textures, render passes, a pipeline for quads and one for the light, the two shaders in WGSL. Enabled when `navigator.gpu` returns an adapter, WebGL2 kept for iOS 18 and under and Firefox for Android. What it would give this game: compute passes for the light cells and the sight marches (today CPU work), render bundles for the static ground, no global state. What it wouldn't: faster fill at this pixel count. Measure before it becomes the default, as the Unity and Babylon threads warn, and not before step 1 is stable and the share of WebGPU phones among players is known.

## 6. Order

1. Step 0a, 0b, 0d: one commit, then numbers from the phone with `?perf`.
2. Step 0c, 0e, 0f.
3. Step 1, as a branch behind a flag (`?gpu`) until the golden test passes and the phone's numbers are better; then the default, with the 2D path kept one release as the fallback where WebGL2 is missing.
4. Step 2, one piece at a time, each with its lab option as the paint lab does.
5. Step 3 if and when measured.

## 7. Measuring

Headless Chrome has no GPU (`test/lib.js` passes `--disable-gpu`; `launch({ gl: true })` is SwiftShader), so frame timing needs a window: launch puppeteer with `headless: false`, wrap `frame`, `renderFrame`, `pntFrame`, `lightScene`, `bloomScene` and the WebGL upload with `performance.now`, and keep the animation-frame gaps (what the player feels). `page.tracing` with the `gpu`, `cc` and `viz` categories shows the GPU process and the compositor; sum events by name and count those over 16 ms. The scripts used for the numbers above are in the session's scratchpad and are worth folding into `test/` as a manual `npm run perf`.
