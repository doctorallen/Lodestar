'use strict';
// Shared plumbing for the headless tests: launching the installed Chrome,
// opening the game from the repo, waiting for it to be ready, and gathering
// every page error and console error so a test can fail on them.
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');

function chromePath() {
  if (process.env.CHROME) return process.env.CHROME;
  const mac = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (fs.existsSync(mac)) return mac;
  for (const p of ['/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium']) if (fs.existsSync(p)) return p;
  throw new Error('No Chrome found: set CHROME to the browser executable');
}

// gl: with WebGL (in software, SwiftShader), so the GPU draws the frame
// (gpu.js); without, the 2D canvases and the JavaScript lighting run, as
// they do where there's no WebGL2.
async function launch({ gl = false } = {}) {
  return puppeteer.launch({
    executablePath: chromePath(),
    headless: 'new',
    args: ['--allow-file-access-from-files', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'].concat(gl ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--disable-gpu']),
  });
}

const PHONE = { width: 390, height: 844, mobile: true };
const DESKTOP = { width: 1280, height: 800 };

// Opens the game in a fresh page with an empty save (or with `save`, a save
// object written before the game loads), and resolves once it's ready.
// `errors` fills with page errors and console errors. A new game opens on
// the opening, then Wick's offer to walk you through (onboard.js), with
// only the essentials awake; `onboard: 'all'` wakes everything and skips
// the offer and every tutorial, for tests that aren't about onboarding.
async function openGame(browser, { width = 390, height = 844, mobile = true, save = null, query = '', onboard = null } = {}) {
  const page = await browser.newPage();
  await page.setViewport(mobile ? { width, height, isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : { width, height });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const url = 'file://' + path.join(ROOT, 'index.html') + query;
  // (first without the loading, which would go on writing the old save
  // after it's cleared)
  await page.goto(url + (query ? '&' : '?') + 'noload');
  await page.evaluate((s) => { try { localStorage.clear(); if (s) localStorage.setItem('lodestar.save.v4', JSON.stringify(s)); } catch (e) {} }, save);
  await page.goto(url);
  // the loading screen (loader.js): once it's ready, the tap that begins
  await page.waitForFunction(() => typeof Loader !== 'undefined' && (Loader.state === 'ready' || Game.ready), { timeout: 120000, polling: 100 });
  if (!(await page.evaluate(() => Game.ready))) {
    await new Promise((r) => setTimeout(r, 100));
    if (mobile) await page.touchscreen.tap(width / 2, height / 2); else await page.mouse.click(width / 2, height / 2);
  }
  await page.waitForFunction(() => typeof Game !== 'undefined' && Game.ready, { timeout: 30000 });
  if (onboard === 'all') await page.evaluate(() => Onboard.testAll());
  return { page, errors };
}

function outDir() { fs.mkdirSync(OUT, { recursive: true }); return OUT; }
async function shot(page, name) { await page.screenshot({ path: path.join(outDir(), name + '.png') }); }

// A test's verdict: prints the line and exits non-zero on failure.
function finish(name, failures) {
  if (failures.length) { console.error(`${name}: FAIL\n  ` + failures.slice(0, 60).join('\n  ') + (failures.length > 60 ? `\n  …and ${failures.length - 60} more` : '')); process.exit(1); }
  console.log(`${name}: ok`);
}

module.exports = { ROOT, OUT, PHONE, DESKTOP, chromePath, launch, openGame, outDir, shot, finish };
