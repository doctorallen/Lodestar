'use strict';
// The game played headlessly in Chrome, upright on a phone and on a desktop:
// it boots through the loading screen without an error; the star stands
// at the middle with the Kindler in its light; the bar fills in the light
// and drains in the dark; a cast hits something; a fall wakes him at the
// star with the core a piece down; the pause screen opens and closes; and
// held sideways the layout turns. Screenshots go to test/out.
const { launch, openGame, shot, finish, PHONE, DESKTOP } = require('./lib');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Steps the game n fixed steps with the bot's controls set.
const steps = (page, bot, n) => page.evaluate((b, k) => { Input.bot = b; for (let i = 0; i < k; i++) Game.step(1 / 60); Input.bot = null; }, bot, n);
// Skips the opening, however far it has got.
async function skipIntro(page) {
  for (let i = 0; i < 20; i++) {
    const on = await page.evaluate(() => { if (typeof Intro !== 'undefined' && Intro.on) Intro.skip(); return (typeof Intro !== 'undefined' && Intro.on) || Game.modal === 'intro'; });
    if (!on) break;
    await sleep(400);
  }
}

async function phone(browser, failures) {
  const fail = (m) => failures.push('phone: ' + m);
  const { page, errors } = await openGame(browser, PHONE);
  await skipIntro(page);
  await sleep(500);
  const st = await page.evaluate(() => { const d = Game.dive, f = d.floor; return { star: f.star, lit: starLight(d, d.p.x, d.p.y), hp: d.p.hp, modal: Game.modal, foes: d.enemies.length, foesInLight: d.enemies.filter((e) => starLight(d, e.x, e.y) > 0).length, core: Save.data.core, introSeen: Save.data.introSeen }; });
  if (!st.star) fail('no star on the floor');
  if (st.lit < 1) fail(`the Kindler wakes outside the light (${st.lit})`);
  if (st.foesInLight) fail(`${st.foesInLight} creatures stand in the light`);
  if (!st.foes) fail('nothing lives in the dark');
  if (!st.introSeen) fail('the opening was not marked seen');
  await shot(page, 'smoke-star');
  // the bar: hurt, it fills in the light; in the dark it drains
  await page.evaluate(() => { Game.dive.p.hp = 40; });
  await steps(page, { x: 0, y: 0 }, 60);
  const filled = await page.evaluate(() => Game.dive.p.hp);
  if (filled <= 40) fail(`the bar did not fill in the light (${filled})`);
  // out into the dark: the furthest room from the star
  await page.evaluate(() => { const d = Game.dive, f = d.floor; const far = f.rooms.slice(1).sort((a, b) => Math.hypot(b.cx - f.star.x, b.cy - f.star.y) - Math.hypot(a.cx - f.star.x, a.cy - f.star.y))[0]; d.p.x = (far.cx + 0.5) * TILE; d.p.y = (far.cy + 0.5) * TILE; d.enemies = []; });
  const hp0 = await page.evaluate(() => Game.dive.p.hp);
  await steps(page, { x: 0, y: 0 }, 300);
  const dark = await page.evaluate(() => ({ hp: Game.dive.p.hp, lit: starLight(Game.dive, Game.dive.p.x, Game.dive.p.y), pull: Game.dive.pull }));
  if (dark.lit > 0) fail(`the far room is lit (${dark.lit})`);
  if (!(dark.hp < hp0)) fail(`the bar did not drain in the dark (${hp0} to ${dark.hp})`);
  if (Math.abs(dark.pull - dark.hp / 100) > 0.01) fail('the light meter does not read the bar');
  await shot(page, 'smoke-dark');
  // a cast hits: a crawler set in front, an Arc swung at it
  await page.evaluate(() => { const d = Game.dive, p = d.p; p.fx = 1; p.fy = 0; const e = makeEnemy('crawler', p.x + 14, p.y, 1, null); d.enemies = [e]; window.__e = e; });
  await steps(page, { x: 0, y: 0, main: true }, 3);
  await steps(page, { x: 0, y: 0 }, 30);
  const hit = await page.evaluate(() => ({ hp: window.__e.hp, max: window.__e.maxHp, casts: Game.dive.casts }));
  if (!(hit.hp < hit.max)) fail(`the Arc did not hit (${hit.hp} of ${hit.max})`);
  await shot(page, 'smoke-cast');
  // a fall: the bar out, the Kindler wakes at the star, the core a piece down
  const core0 = await page.evaluate(() => Save.data.core);
  await page.evaluate(() => { Game.dive.p.hp = 0.5; Game.dive.enemies = []; });
  await steps(page, { x: 0, y: 0 }, 60 * 3);
  await sleep(300);
  const fell = await page.evaluate(() => { const d = Game.dive; return { core: Save.data.core, falls: Save.data.falls, lit: starLight(d, d.p.x, d.p.y), hp: d.p.hp, dying: d.dying }; });
  if (fell.core !== core0 - 1) fail(`the core did not lose a piece (${core0} to ${fell.core})`);
  if (fell.lit < 1) fail('the Kindler did not wake at the star');
  if (fell.hp <= 0) fail('the bar did not come back');
  await shot(page, 'smoke-fell');
  // the pause screen, and back
  await page.evaluate(() => UI.openPause());
  await sleep(450);
  const paused = await page.evaluate(() => Game.modal);
  if (paused !== 'screen-pause') fail('the pause screen did not open');
  await shot(page, 'smoke-pause');
  await page.evaluate(() => UI.acts.resume());
  if (await page.evaluate(() => Game.modal)) fail('the pause screen did not close');
  for (const e of errors) fail(e);
  await page.close();
}

async function sideways(browser, failures) {
  const fail = (m) => failures.push('sideways: ' + m);
  const { page, errors } = await openGame(browser, { width: 844, height: 390, mobile: true, intro: false });
  await sleep(500);
  const wide = await page.evaluate(() => document.getElementById('app').classList.contains('wide'));
  if (!wide) fail('the layout did not turn sideways');
  await shot(page, 'smoke-sideways');
  for (const e of errors) fail(e);
  await page.close();
}

async function desktop(browser, failures) {
  const fail = (m) => failures.push('desktop: ' + m);
  const { page, errors } = await openGame(browser, Object.assign({ mobile: false, intro: false }, DESKTOP));
  await sleep(500);
  // the keys: walk with W for a second
  await page.keyboard.down('KeyW');
  await sleep(1000);
  await page.keyboard.up('KeyW');
  const moved = await page.evaluate(() => Game.dive.p.y < (Game.dive.floor.star.y + 0.5) * TILE + T.star.standOff * TILE - 4);
  if (!moved) fail('W did not walk the Kindler north');
  await shot(page, 'smoke-desktop');
  for (const e of errors) fail(e);
  await page.close();
}

(async () => {
  const failures = [];
  const browser = await launch();
  for (const run of [phone, sideways, desktop]) {
    try { await run(browser, failures); } catch (e) { failures.push(`${run.name}: ${e.stack || e}`); }
  }
  await browser.close();
  finish('smoke', failures);
})();
