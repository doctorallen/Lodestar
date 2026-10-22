'use strict';
// The GPU lighting (gllight.js) agrees with the JavaScript lighting
// (render.js lightScene): the same unlit view, lit both ways, pixel for
// pixel within a tone, at home and on a floor, with the paint lab's
// NOCTURNE, SOFT BEAM EDGE and CANVAS on as well as off. Runs with WebGL
// in software (SwiftShader), and measures what each way costs.
const { launch, openGame, finish } = require('./lib');

(async () => {
  const failures = [];
  const browser = await launch({ gl: true });
  const { page, errors } = await openGame(browser, { query: '?noload', onboard: 'all' });
  const ok = await page.evaluate(() => glLightInit());
  if (!ok) { failures.push('no WebGL2 in the test browser'); finish('gllight', failures); return; }
  await page.evaluate(() => { if (Intro.on) Intro.skip(); });
  await new Promise((r) => setTimeout(r, 300));
  // Lights the frame as it stands both ways, from the same unlit view:
  // renderFrame with the GPU, the unlit view and the light kept on the
  // way; then the JavaScript lighting on a copy of that view.
  const compare = (label) => page.evaluate((label) => {
    const w = View.w, h = View.h;
    let unlit = null, args = null, gpu = null;
    const L0 = glLightScene;
    // (both read as the lighting leaves them, before what's drawn over
    // the lit view: cloud shade, the vignette)
    window.glLightScene = function (cx, cy) { unlit = View.ctx.getImageData(0, 0, w, h); args = [cx, cy]; const q = LateDots.q.slice(); const r = L0(cx, cy); unlit.q = q; gpu = View.ctx.getImageData(0, 0, w, h).data; return r; };
    renderFrame();
    window.glLightScene = L0;
    // the same, in JavaScript (the late dots queued again as they were)
    View.ctx.putImageData(unlit, 0, 0);
    LateDots.q = unlit.q;
    View.lightSoftware = true;
    lightScene(args[0], args[1]);
    View.lightSoftware = false;
    const cpu = View.ctx.getImageData(0, 0, w, h).data;
    let worst = 0, over = 0, sum = 0, n = 0;
    for (let i = 0; i < cpu.length; i += 4) {
      for (let c = 0; c < 3; c++) { const d = Math.abs(cpu[i + c] - gpu[i + c]); sum += d; if (d > worst) worst = d; if (d > 2) over++; }
      n += 3;
    }
    return { label, w, h, worst, over, mean: +(sum / n).toFixed(3), lit: cpu.some((v, i) => i % 4 !== 3 && v > 8) };
  }, label);
  const check = (r) => {
    if (!r.lit) failures.push(`${r.label}: the view is dark`);
    // (a tone either way from rounding; a few pixels more where a band's edge rounds the other way)
    if (r.over > r.w * r.h * 0.004) failures.push(`${r.label}: ${r.over} channels differ by more than 2 (worst ${r.worst}, mean ${r.mean})`);
    if (r.mean > 0.2) failures.push(`${r.label}: mean difference ${r.mean}`);
    console.log(`  ${r.label}: worst ${r.worst}, over 2: ${r.over}, mean ${r.mean}`);
  };
  check(await compare('home'));
  for (const lab of ['nocturne', 'soft', 'canvas']) {
    await page.evaluate((k) => Lab.set(k, true, { save: false }), lab);
    check(await compare('home ' + lab));
    await page.evaluate((k) => Lab.set(k, false, { save: false }), lab);
  }
  // out on a floor, where the ground's own tones are lifted and the
  // lamp's shadows fall
  await page.evaluate(() => { UI.close(); startSortie({ terr: 1, spire: true }); });
  await new Promise((r) => setTimeout(r, 1500));
  await page.evaluate(() => { for (let i = 0; i < 40; i++) renderFrame(); });
  check(await compare('floor'));
  await page.evaluate(() => Lab.set('broken', true, { save: false }));
  await new Promise((r) => setTimeout(r, 1500));
  check(await compare('floor broken'));
  await page.evaluate(() => Lab.set('broken', false, { save: false }));
  // what each costs
  const cost = await page.evaluate(async () => {
    const med = (a) => { a = a.slice().sort((x, y) => x - y); return a[a.length >> 1]; };
    const run = async (soft) => {
      View.lightSoftware = soft;
      const t = [], t0 = performance.now();
      while (performance.now() - t0 < 1500) { const s = performance.now(); renderFrame(); t.push(performance.now() - s); await new Promise((r) => requestAnimationFrame(r)); }
      View.lightSoftware = false;
      return med(t).toFixed(2);
    };
    return { gpu: await run(false), cpu: await run(true) };
  });
  console.log(`  a frame: GPU ${cost.gpu} ms, JavaScript ${cost.cpu} ms (SwiftShader, so the GPU's share is in software here too)`);
  for (const e of errors) failures.push(e);
  await browser.close();
  finish('gllight', failures);
})();
