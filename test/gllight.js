'use strict';
// The GPU's frame (gpu.js, with the light pass of gllight.js) agrees with
// the 2D path (the canvases and the JavaScript lighting, render.js): the
// same game state drawn both ways, the lit picture pixel for pixel within
// a tone, at home and on a floor, with the paint lab's NOCTURNE, SOFT BEAM
// EDGE and CANVAS on as well as off, and again after the atlas's pages are
// rebuilt. Runs with WebGL in software (SwiftShader), at both grains, and
// measures what each way costs.
const fs = require('fs');
const path = require('path');
const { launch, openGame, finish, outDir } = require('./lib');

(async () => {
  const failures = [];
  const browser = await launch({ gl: true });
  await runAt(browser, '', failures);
  // and at FINE GRAIN (art.js artFinePx), where the view has four times
  // the pixels and the dither and the soft beam's strokes are finer
  await runAt(browser, '&fine', failures);
  await browser.close();
  finish('gllight', failures);
})();

// Draws the frame as it stands both ways: by the GPU, its lit picture read
// back; then by the 2D path on canvases of its own, the JavaScript
// lighting. Both before the bloom and the overlay.
function compare(label) {
  const w = View.w, h = View.h, gl = Gpu.gl;
  renderFrame();
  const up = new Uint8Array(w * h * 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, Gpu.lit.fb); gl.readBuffer(gl.COLOR_ATTACHMENT0);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, up);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  // (rows run up the framebuffer)
  const gpu = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) gpu.set(up.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  const mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingEnabled = false; return [c, x]; };
  const keep = { ctx: View.ctx, em: View.em, emCtx: View.emCtx, over: View.over, overCtx: View.overCtx, bloomCtx: View.bloomCtx, bloom: window.bloomScene };
  const [, vx] = mk(), [ec, ex] = mk(), [oc, ox] = mk();
  let branch = null, err = null;
  const L0 = window.lightScene;
  window.lightScene = function (a, b) { branch = Gpu.on ? 'gpu' : 'js'; return L0(a, b); };
  Gpu.on = false; View.ctx = vx; View.em = ec; View.emCtx = ex; View.over = oc; View.overCtx = ox; View.bloomCtx = { clearRect() {} };
  window.bloomScene = () => {};
  try { renderFrame(); } catch (e) { err = String(e.stack || e); }
  window.lightScene = L0;
  Gpu.on = true; View.ctx = keep.ctx; View.em = keep.em; View.emCtx = keep.emCtx; View.over = keep.over; View.overCtx = keep.overCtx; View.bloomCtx = keep.bloomCtx; window.bloomScene = keep.bloom;
  const cpu = vx.getImageData(0, 0, w, h).data;
  let worst = 0, over = 0, sum = 0, n = 0;
  for (let i = 0; i < cpu.length; i += 4) {
    for (let c = 0; c < 3; c++) { const d = Math.abs(cpu[i + c] - gpu[i + c]); sum += d; if (d > worst) worst = d; if (d > 2) over++; }
    n += 3;
  }
  // (where they differ beyond the allowance, the two pictures and the
  // difference, side by side, for test/out)
  let side = null;
  if (over > w * h * 0.004) {
    const [sc, sx] = mk(); sc.width = w * 3;
    sx.putImageData(new ImageData(new Uint8ClampedArray(gpu.buffer), w, h), 0, 0);
    sx.putImageData(new ImageData(new Uint8ClampedArray(cpu.buffer.slice(0)), w, h), w, 0);
    const pic = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < cpu.length; i += 4) { const d = Math.max(Math.abs(cpu[i] - gpu[i]), Math.abs(cpu[i + 1] - gpu[i + 1]), Math.abs(cpu[i + 2] - gpu[i + 2])), g = (cpu[i] + cpu[i + 1] + cpu[i + 2]) / 6 + 40; pic[i] = d > 2 ? 255 : g; pic[i + 1] = d > 2 ? 0 : g; pic[i + 2] = d > 2 ? 0 : g; pic[i + 3] = 255; }
    sx.putImageData(new ImageData(pic, w, h), w * 2, 0);
    side = sc.toDataURL();
  }
  return { label, w, h, worst, over, mean: +(sum / n).toFixed(3), lit: cpu.some((v, i) => i % 4 !== 3 && v > 8), branch, err, side };
}

async function runAt(browser, grain, failures) {
  const { page, errors } = await openGame(browser, { query: '?noload' + grain, onboard: 'all' });
  const ok = await page.evaluate(() => Gpu.on && glLightInit());
  if (!ok) { failures.push('no WebGL2 in the test browser'); return; }
  await page.evaluate(() => { if (Intro.on) Intro.skip(); });
  await new Promise((r) => setTimeout(r, 300));
  const tag = grain ? ' (fine)' : '';
  const check = (r) => {
    r.label += tag;
    if (r.err) failures.push(`${r.label}: the 2D path threw: ${r.err.split('\n')[0]}`);
    if (r.branch !== 'js') failures.push(`${r.label}: the 2D path didn't light in JavaScript`);
    if (!r.lit) failures.push(`${r.label}: the view is dark`);
    // (a tone either way from rounding; a few pixels more where a band's
    // edge rounds the other way, or an effect draws from Math.random)
    if (r.over > r.w * r.h * 0.004) {
      failures.push(`${r.label}: ${r.over} channels differ by more than 2 (worst ${r.worst}, mean ${r.mean})`);
      if (r.side) { const f = path.join(outDir(), 'gllight-' + r.label.replace(/[^a-z0-9]+/gi, '-') + '.png'); fs.writeFileSync(f, Buffer.from(r.side.split(',')[1], 'base64')); console.log('  (see ' + f + ')'); }
    }
    if (r.mean > 0.2) failures.push(`${r.label}: mean difference ${r.mean}`);
    console.log(`  ${r.label}: worst ${r.worst}, over 2: ${r.over}, mean ${r.mean}`);
  };
  check(await page.evaluate(compare, 'home'));
  for (const lab of grain ? ['soft'] : ['nocturne', 'soft', 'canvas']) {
    await page.evaluate((k) => Lab.set(k, true, { save: false }), lab);
    check(await page.evaluate(compare, 'home ' + lab));
    await page.evaluate((k) => Lab.set(k, false, { save: false }), lab);
  }
  // out on a floor, where the ground's own tones are lifted, the lamp's
  // shadows fall and the rock stands in front of what walks behind it
  await page.evaluate(() => { UI.close(); startSortie({ terr: 1, spire: true }); });
  await new Promise((r) => setTimeout(r, 1500));
  // (the whole floor painted first, so neither frame paints a chunk the other hasn't: paint.js pntEnsure)
  const whole = () => page.evaluate(() => { const f = Game.dive.floor; renderFrame(); pntEnsure(f, 0, 0, f.w * ATILE, f.h * ATILE); for (let i = 0; i < 40; i++) renderFrame(); });
  await whole();
  check(await page.evaluate(compare, 'floor'));
  await page.evaluate(() => Lab.set('broken', true, { save: false }));
  await new Promise((r) => setTimeout(r, 1500));
  await whole();
  check(await page.evaluate(compare, 'floor broken'));
  await page.evaluate(() => Lab.set('broken', false, { save: false }));
  // a cast, with its hard light and sparks
  await page.evaluate(() => { Input.bot = { x: 1, y: 0, main: true }; for (let i = 0; i < 40; i++) Game.step(1 / 60); Input.bot = { x: 0, y: 0, main: false }; });
  check(await page.evaluate(compare, 'cast'));
  // the atlas's pages built again (gpu.js gpuAtlasRebuild): the same frame still
  const atlas = await page.evaluate(() => { const before = Gpu.entries.length; gpuAtlasRebuild(0); return { before, after: Gpu.entries.length, pages: Gpu.pages }; });
  check(await page.evaluate(compare, 'cast, atlas rebuilt'));
  console.log(`  atlas${tag}: ${atlas.after} of ${atlas.before} pictures kept on ${atlas.pages} pages`);
  // what each costs (not at fine grain: SwiftShader takes seconds a frame there)
  if (grain) { for (const e of errors) failures.push(e); await page.close(); return; }
  const cost = await page.evaluate(async () => {
    const med = (a) => { a = a.slice().sort((x, y) => x - y); return a[a.length >> 1]; };
    const t = [], t0 = performance.now();
    while (performance.now() - t0 < 1500) { const s = performance.now(); renderFrame(); t.push(performance.now() - s); await new Promise((r) => requestAnimationFrame(r)); }
    return med(t).toFixed(2);
  });
  console.log(`  a frame${tag}: ${cost} ms on the GPU (SwiftShader, so in software here too)`);
  for (const e of errors) failures.push(e);
  await page.close();
}
