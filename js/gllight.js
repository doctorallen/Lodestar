'use strict';
// ---------------------------------------------------------------------------
// The light on the GPU. lightScene (render.js) lit the view a pixel at a
// time in JavaScript: the view read back, every pixel worked, and written
// again, which was most of a frame. Here the same sum runs as a fragment
// shader in WebGL2: the view and the light's cells go up as textures, one
// quad lights every pixel, and the result is drawn back over the view
// (the view's canvas stays the picture everything else draws on, and
// nothing after the lighting changes). Without WebGL2 the JavaScript
// lighting runs as before: both must agree (test/gllight.js checks they
// do, pixel for pixel within a tone).
//
// What the shader does, as lightScene does: a cell's light is quantized
// to the step below and above it, the threshold between the two is the
// dither (or the soft beam's strokes) moved by the slope through the cell
// (lampPerPixel), and the pixel is multiplied by its step's share of the
// cell's colour. In a dark place the lowest steps tint towards violet
// (T.light.violet). NOCTURNE drains the colour outside the light; the
// ground's own tones are taken back from lifted to unlifted where a light
// reaches daylight (lightUnlift); CANVAS lays its weave under the paint.
// ---------------------------------------------------------------------------

const GLight = { gl: null, ok: false, tried: false, w: 0, h: 0, prog: null, u: {}, tex: {}, gt: null, gtW: 0, gtH: 0, gtDirty: null, hue: null, pal: null, palKey: '', weave: null, weaveN: 0 };

const GLIGHT_VS = `#version 300 es
in vec2 aP;
void main() { gl_Position = vec4(aP, 0.0, 1.0); }`;

const GLIGHT_FS = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
uniform sampler2D uScene;
uniform sampler2D uCells;
uniform sampler2D uGT;
uniform sampler2D uHue;
uniform sampler2D uPal;
uniform sampler2D uWeave;
uniform ivec2 uSize;
uniform ivec2 uCellsSize;
uniform int uLC;
uniform ivec2 uP;
uniform ivec2 uCam;
uniform float uTop, uInv, uMx, uLo, uDz, uAmbI, uLpK;
uniform int uFit, uSoft, uNoct, uUnl, uHueOn, uWeaveOn, uWeaveN, uTones;
uniform vec3 uViolet;
uniform float uDark;
uniform vec3 uNT;
uniform float uNAmt, uNDark;
uniform float uUlK;
uniform ivec2 uFloor;
uniform float uSfLen, uSfK;
out vec4 o;

const int B[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);

float cellI(ivec2 c) {
  c = clamp(c, ivec2(0), uCellsSize - 1);
  vec3 l = texelFetch(uCells, c, 0).rgb;
  return max(l.r, max(l.g, l.b));
}
// a step's share of the lamp's light: 0 at the ambient, 1 at the top
float share(float level) { return clamp((level - uAmbI) * uLpK, 0.0, 1.0); }

void main() {
  int x = int(gl_FragCoord.x), y = uSize.y - 1 - int(gl_FragCoord.y);
  vec3 p = texelFetch(uScene, ivec2(x, y), 0).rgb;
  int gx = x + uP.x, gy = y + uP.y;
  ivec2 c = ivec2(gx / uLC, gy / uLC);
  vec3 l = texelFetch(uCells, clamp(c, ivec2(0), uCellsSize - 1), 0).rgb;
  float I = max(l.r, max(l.g, l.b));
  int wx = x + uCam.x, wy = y + uCam.y;
  float level, lp;
  vec3 lit;
  if (I <= 0.0) {
    level = 0.0; lp = 0.0; lit = vec3(0.0);
  } else {
    // the slope through the cell, from the cells either side
    float GX = 0.0, GY = 0.0, gxo = 0.0, oyv = 0.0;
    if (uFit == 1) {
      float k = 1.0 / float(2 * uLC);
      GX = floor((cellI(c + ivec2(1, 0)) - cellI(c - ivec2(1, 0))) * k * 65536.0) / 65536.0;
      GY = (cellI(c + ivec2(0, 1)) - cellI(c - ivec2(0, 1))) * k;
      gxo = GX * float((gx - c.x * uLC) - (uLC >> 1));
      oyv = float((gy - c.y * uLC) - (uLC >> 1));
    }
    float q0 = floor(I + uLo - (uFit == 1 ? abs(GX) + abs(GY) : 0.0)), q1 = q0 + 1.0;
    float cf = q1 - I - GY * oyv;
    // the threshold: a half, dithered, or the soft beam's strokes
    float th;
    if (uSoft == 1) {
      uint ph = (uint(wy) * 0x9e3779b1u) >> 27u;
      uint a = uint(int(floor(float(wx + int(ph)) / uSfLen))) * 0x85ebca6bu, b = uint(wy) * 0xc2b2ae35u;
      th = 0.5 + (float((a ^ b) >> 24u) - 127.5) * uSfK;
    } else {
      th = 0.5 + ((float(B[((wy & 3) << 2) + (wx & 3)]) + 0.5) / 16.0 - 0.5) * uDz;
    }
    bool hi = th + gxo >= cf;
    float q = min(hi ? q1 : q0, uTop);
    level = q * uInv; lp = share(level);
    float dark = (1.0 - lp) * uDark;
    vec3 tf = 1.0 + (uViolet - 1.0) * dark;
    vec3 f = min(l * (level / I) * tf, vec3(uMx));
    f = floor(f * 256.0 + 0.5) / 256.0;
    // the ground's own tone, taken back towards unlifted
    if (uUnl == 1 && wx >= 0 && wy >= 0 && wx < uFloor.x && wy < uFloor.y) {
      float ul = clamp((level - uAmbI) * uUlK, 0.0, 1.0);
      if (ul > 0.0) {
        int t = int(texelFetch(uGT, ivec2(wx, wy), 0).r * 255.0 + 0.5);
        int hu = uHueOn == 1 ? int(texelFetch(uHue, ivec2(wx, wy), 0).r * 255.0 + 0.5) : 0;
        vec3 a = texelFetch(uPal, ivec2(t, hu), 0).rgb;
        if (ivec3(p * 255.0 + 0.5) == ivec3(a * 255.0 + 0.5)) p = mix(p, texelFetch(uPal, ivec2(t, 3 + hu), 0).rgb, ul);
      }
    }
    lit = p * f;
  }
  // (from here in whole tones, as lightScene's integer sums go)
  vec3 t = floor(lit * 255.0 + 0.5);
  if (uNoct == 1) {
    // nocturne: the colour going, towards a cool grey of its lightness
    float nd = floor(uNAmt * uNDark * (1.0 - lp) * 256.0 + 0.5);
    float lum = floor(dot(t, vec3(77.0, 151.0, 28.0)) / 256.0);
    vec3 grey = floor(lum * floor(uNT * 256.0 + 0.5) / 256.0);
    t += floor((grey - t) * nd / 256.0);
  }
  t = clamp(t, 0.0, 255.0);
  if (uWeaveOn == 1) {
    int n = uWeaveN, ux = ((wx % n) + n) % n, uy = ((wy % n) + n) % n;
    float f = floor(texelFetch(uWeave, ivec2(ux, uy), 0).r * 255.0 + 0.5) + 128.0;
    t = floor(t * f / 256.0);
  }
  o = vec4(clamp(t, 0.0, 255.0) / 255.0, 1.0);
}`;

// Sets up WebGL2 once; false if the browser hasn't it.
function glLightInit() {
  const G = GLight;
  if (G.tried) return G.ok;
  G.tried = true;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    if (!gl) return false;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s)); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, GLIGHT_VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, GLIGHT_FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aP = gl.getAttribLocation(prog, 'aP');
    gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP, 2, gl.FLOAT, false, 0, 0);
    const names = ['uScene', 'uCells', 'uGT', 'uHue', 'uPal', 'uWeave', 'uSize', 'uCellsSize', 'uLC', 'uP', 'uCam', 'uTop', 'uInv', 'uMx', 'uLo', 'uDz', 'uAmbI', 'uLpK', 'uFit', 'uSoft', 'uNoct', 'uUnl', 'uHueOn', 'uWeaveOn', 'uWeaveN', 'uTones', 'uViolet', 'uDark', 'uNT', 'uNAmt', 'uNDark', 'uUlK', 'uFloor', 'uSfLen', 'uSfK'];
    for (const n of names) G.u[n] = gl.getUniformLocation(prog, n);
    // the textures, each on its own unit
    const tex = (unit, name) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.uniform1i(G.u[name], unit); G.tex[name] = t; };
    tex(0, 'uScene'); tex(1, 'uCells'); tex(2, 'uGT'); tex(3, 'uHue'); tex(4, 'uPal'); tex(5, 'uWeave');
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    // (a texel of each, so every unit is complete even when unused)
    for (const n of ['uGT', 'uHue', 'uWeave']) { gl.bindTexture(gl.TEXTURE_2D, G.tex[n]); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([0])); }
    gl.bindTexture(gl.TEXTURE_2D, G.tex.uPal); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    G.gl = gl; G.canvas = c; G.prog = prog; G.ok = true;
    c.addEventListener('webglcontextlost', (e) => { e.preventDefault(); G.ok = false; }, false);
    c.addEventListener('webglcontextrestored', () => { G.tried = false; G.ok = false; glLightInit(); }, false);
  } catch (e) {
    noteError(e);
    G.ok = false;
  }
  return G.ok;
}

// Rows y0..y1 of the ground's tones changed (paint.js pntGroundTones).
function glGroundDirty(y0, y1) {
  const G = GLight;
  if (!G.gtDirty) G.gtDirty = [y0, y1];
  else { if (y0 < G.gtDirty[0]) G.gtDirty[0] = y0; if (y1 > G.gtDirty[1]) G.gtDirty[1] = y1; }
}

// The ground's tones and hues up to date on the GPU (the whole floor on a
// new one, else the rows that changed).
function glLightGround(gl, G, GT, HUE, gW, gH) {
  const whole = G.gt !== GT || G.gtW !== gW || G.gtH !== gH;
  if (whole) { gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, G.tex.uGT); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gW, gH, 0, gl.RED, gl.UNSIGNED_BYTE, GT); G.gt = GT; G.gtW = gW; G.gtH = gH; G.hue = null; }
  else if (G.gtDirty) {
    const y0 = Math.max(0, G.gtDirty[0]), y1 = Math.min(gH, G.gtDirty[1]);
    if (y1 > y0) { gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, G.tex.uGT); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, y0, gW, y1 - y0, gl.RED, gl.UNSIGNED_BYTE, GT.subarray(y0 * gW, y1 * gW)); }
  }
  if (HUE && (whole || G.hue !== HUE || G.gtDirty)) {
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, G.tex.uHue);
    if (G.hue !== HUE) gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gW, gH, 0, gl.RED, gl.UNSIGNED_BYTE, HUE);
    else if (G.gtDirty) { const y0 = Math.max(0, G.gtDirty[0]), y1 = Math.min(gH, G.gtDirty[1]); if (y1 > y0) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, y0, gW, y1 - y0, gl.RED, gl.UNSIGNED_BYTE, HUE.subarray(y0 * gW, y1 * gW)); }
    G.hue = HUE;
  }
  G.gtDirty = null;
}

// The ground's ramps: rows 0-2 the lifted tones (plain, warm, cool), 3-5
// the unlifted.
function glLightPal(gl, G, GL, GU, nt) {
  const key = GL.ground.length + '/' + nt + '/' + (GL.groundW ? 1 : 0) + '/' + GL.ground[0] + '/' + GU.ground[0] + '/' + GL.ground[nt - 1];
  if (G.pal === GL && G.palKey === key) return;
  const b = new Uint8Array(nt * 6 * 4), rows = [GL.ground, GL.groundW || GL.ground, GL.groundC || GL.ground, GU.ground, GU.groundW || GU.ground, GU.groundC || GU.ground];
  rows.forEach((row, r) => { const src = new Uint8Array(row.buffer, row.byteOffset, Math.min(nt, row.length) * 4); b.set(src, r * nt * 4); });
  gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, G.tex.uPal);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, nt, 6, 0, gl.RGBA, gl.UNSIGNED_BYTE, b);
  G.pal = GL; G.palKey = key;
}

// The weave's factors for a tile of four threads (render.js labCanvasWeave).
function glLightWeave(gl, G) {
  const Cv = T.light.canvas, tw = Cv.thread, n = tw * 4;
  if (G.weaveN === n) return n;
  const b = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const over = ((Math.floor(x / tw) + Math.floor(y / tw)) & 1) === 0, u = over ? x % tw : y % tw;
    const edge = tw > 1 ? (u / (tw - 1)) * 2 - 1 : 0, grain = artHash(Math.floor(x / tw), Math.floor(y / tw), 0x5eed) * 2 - 1;
    // (the factor in 256ths, less 128, so a byte holds it exactly)
    b[y * n + x] = clamp(Math.round((1 - edge * Cv.amt + grain * Cv.grain) * 256) - 128, 0, 255);
  }
  gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, G.tex.uWeave);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, n, n, 0, gl.RED, gl.UNSIGNED_BYTE, b);
  G.weaveN = n;
  return n;
}

// Lights the view (View.canvas) in place: the same as lightScene's
// JavaScript, on the GPU. cx, cy: the camera in the world. Returns false
// if it couldn't, and the JavaScript lighting runs instead.
function glLightScene(cx, cy) {
  const G = GLight;
  if (!G.ok && !glLightInit()) return false;
  const gl = G.gl, w = View.w, h = View.h, Lt = T.light, A = T.art, L = View.light;
  if (G.w !== w || G.h !== h) { G.canvas.width = w; G.canvas.height = h; gl.viewport(0, 0, w, h); G.w = w; G.h = h; }
  // the view, with the late dots written in, and the light's cells
  lateDotsOnto(View.ctx, w, h);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, G.tex.uScene);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, View.canvas);
  const nc = L.w * L.h;
  if (!G.cells || G.cells.length < nc * 4) G.cells = new Float32Array(nc * 4);
  const cells = G.cells, a = L.a;
  for (let n = 0, o = 0, k = 0; n < nc; n++, o += 3, k += 4) { cells[k] = a[o]; cells[k + 1] = a[o + 1]; cells[k + 2] = a[o + 2]; }
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, G.tex.uCells);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, L.w, L.h, 0, gl.RGBA, gl.FLOAT, cells.subarray(0, nc * 4));
  // the numbers lightScene works from
  const top = Math.ceil(Lt.max * A.lightSteps), mx = Lt.max, inv = 1 / A.lightSteps, dz = A.lightDither, lo = 0.5 + (0.5 / 16 - 0.5) * dz;
  const ambI = View.lightAmbI || 0, lpK = 1 / Math.max(0.05, mx - ambI), Vi = Lt.violet;
  const dark = clamp((Vi.darkAt[0] - ambI) / (Vi.darkAt[0] - Vi.darkAt[1]), 0, 1);
  const noct = Lab.on('nocturne'), Nc = Lt.nocturne, nDark = noct ? clamp((Nc.darkAt[0] - ambI) / (Nc.darkAt[0] - Nc.darkAt[1]), 0, 1) : 0;
  const fCap = Math.max(1, ambI), gf = Game.dive && Game.dive.floor, gLook = View.groundLook, GT = View.groundTone;
  const unl = !!(gf && gLook && GT && View.pntLift > 0 && GT.length === gf.w * ATILE * gf.h * ATILE);
  const u = G.u;
  gl.uniform2i(u.uSize, w, h); gl.uniform2i(u.uCellsSize, L.w, L.h);
  gl.uniform1i(u.uLC, LC); gl.uniform2i(u.uP, cx - LC * L.x0, cy - LC * L.y0); gl.uniform2i(u.uCam, cx, cy);
  gl.uniform1f(u.uTop, top); gl.uniform1f(u.uInv, inv); gl.uniform1f(u.uMx, mx); gl.uniform1f(u.uLo, lo); gl.uniform1f(u.uDz, dz); gl.uniform1f(u.uAmbI, ambI); gl.uniform1f(u.uLpK, lpK);
  gl.uniform1i(u.uFit, A.lampPerPixel ? 1 : 0);
  gl.uniform3f(u.uViolet, Vi.dark[0], Vi.dark[1], Vi.dark[2]); gl.uniform1f(u.uDark, dark);
  gl.uniform1i(u.uNoct, nDark > 0 ? 1 : 0); gl.uniform3f(u.uNT, Nc.tint[0], Nc.tint[1], Nc.tint[2]); gl.uniform1f(u.uNAmt, Nc.amount); gl.uniform1f(u.uNDark, nDark);
  const soft = Lab.on('soft'), Sf = Lt.soft;
  gl.uniform1i(u.uSoft, soft ? 1 : 0); gl.uniform1f(u.uSfLen, Sf.len); gl.uniform1f(u.uSfK, Sf.amt / 255);
  if (unl) {
    const GL = pntLook(gLook), GU = pntLook(gLook, 0), gW = gf.w * ATILE, gH = gf.h * ATILE, HUE = GL.groundW ? View.groundHue : null;
    glLightGround(gl, G, GT, HUE, gW, gH);
    glLightPal(gl, G, GL, GU, GL.ground.length);
    gl.uniform1i(u.uUnl, 1); gl.uniform1i(u.uHueOn, HUE ? 1 : 0); gl.uniform2i(u.uFloor, gW, gH); gl.uniform1f(u.uUlK, 1 / Math.max(0.05, fCap - ambI)); gl.uniform1i(u.uTones, GL.ground.length);
  } else gl.uniform1i(u.uUnl, 0);
  if (Lab.on('canvas')) { gl.uniform1i(u.uWeaveOn, 1); gl.uniform1i(u.uWeaveN, glLightWeave(gl, G)); } else gl.uniform1i(u.uWeaveOn, 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  // back onto the view
  const x = View.ctx;
  x.globalCompositeOperation = 'copy';
  x.drawImage(G.canvas, 0, 0);
  x.globalCompositeOperation = 'source-over';
  lateDotsGlow(w, h);
  LateDots.q.length = 0;
  return true;
}

