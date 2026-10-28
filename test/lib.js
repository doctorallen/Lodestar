'use strict';
// Shared plumbing for the headless tests, on Tycho's test kit
// (vendor/tycho/dist/testkit.cjs): launching Chromium (Playwright, or
// puppeteer-core with the Chrome in $CHROME), opening the game from the repo,
// waiting for it to be ready, and gathering every page error and console
// error so a test can fail on them.
const path = require('path');
const fs = require('fs');
const tk = require('../vendor/tycho/dist/testkit.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');

const chromePath = tk.chromePath;

// gl: with WebGL (in software, SwiftShader), so the GPU draws the frame
// (gpu.js); without, the 2D canvases and the JavaScript lighting run, as
// they do where there's no WebGL2.
const launch = ({ gl = false } = {}) => tk.launch({ gl });

const PHONE = { width: 390, height: 844, mobile: true };
const DESKTOP = { width: 1280, height: 800 };
const viewport = ({ width, height, mobile, scale }) => ({ width, height, mobile: !!mobile, scale: scale || (mobile ? 3 : 1) });

// Opens the game in a fresh page with an empty save (or with `save`, a save
// object written before the game loads), and resolves once it's ready.
// `errors` fills with page errors and console errors. A new game opens on
// the opening (intro.js); `intro: false` marks it seen first.
async function openGame(kit, { width = 390, height = 844, mobile = true, save = null, query = '', intro = true } = {}) {
  if (!intro) save = Object.assign({ introSeen: true }, save || {});
  const page = await kit.page(viewport({ width, height, mobile }));
  const errors = tk.errorsOf(page);
  const url = 'file://' + path.join(ROOT, 'index.html') + query;
  // (first without the loading, which would go on writing the old save
  // after it's cleared)
  await page.goto(url + (query ? '&' : '?') + 'noload');
  await page.evaluate((s) => { try { localStorage.clear(); if (s) localStorage.setItem('lodestar.save.v5', JSON.stringify(s)); } catch (e) {} }, save);
  await page.goto(url);
  // the loading screen (loader.js): once it's ready, the tap that begins
  // (a slow runner painting a desktop-sized view in software takes a while)
  await tk.waitFor(page, () => typeof Loader !== 'undefined' && (Loader.state === 'ready' || Game.ready), { timeout: 420000 });
  if (!(await page.evaluate(() => Game.ready))) {
    await new Promise((r) => setTimeout(r, 100));
    if (mobile) await page.touchscreen.tap(width / 2, height / 2); else await page.mouse.click(width / 2, height / 2);
  }
  await tk.waitFor(page, () => typeof Game !== 'undefined' && Game.ready, { timeout: 30000 });
  return { page, errors };
}

// waits for `fn` in the page; resolves true, or null on timeout
const until = (page, fn, timeout) => tk.waitFor(page, fn, { timeout }).then(() => true, () => null);

function outDir() { fs.mkdirSync(OUT, { recursive: true }); return OUT; }
async function shot(page, name) { await page.screenshot({ path: path.join(outDir(), name + '.png') }); }

// A test's verdict: prints the line and exits non-zero on failure.
const finish = tk.finish;

module.exports = { ROOT, OUT, PHONE, DESKTOP, chromePath, launch, openGame, outDir, shot, finish, until, viewport, tk };
