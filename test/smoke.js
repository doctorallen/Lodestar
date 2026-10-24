'use strict';
// The game played headlessly in Chrome, upright on a phone and on a desktop:
// it boots through the loading screen without an error; the star stands
// at the middle with the Kindler in its light; the bar fills in the light
// and drains in the dark; a cast hits something; a fall wakes him at the
// star with the core a piece down; the pause screen opens and closes; and
// held sideways the layout turns; the thread, a node planted and held,
// the vein lit and saved, the map and travel by it. Screenshots go to test/out.
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
  // the veins: the thread taken up at the star, walked out along the
  // caverns, planted, held (he can't be hurt here: the fight is tested
  // above), set; the vein lit and counted; the map, and travel by it
  await page.evaluate(() => { const d = Game.dive; veinsTravel(d, 0); d.p.y -= TILE * 1.6; d.enemies = []; });
  await steps(page, { x: 0, y: 0 }, 5);
  if ((await page.evaluate(() => actionHere())) !== 'take up') fail('TAKE UP is not offered by the star');
  await steps(page, { x: 0, y: 0, act: true }, 1);
  await steps(page, { x: 0, y: 0 }, 5);
  if (!(await page.evaluate(() => !!Game.dive.thread))) fail('the thread was not taken up');
  const walked = await page.evaluate(() => {
    const d = Game.dive, f = d.floor, tx0 = Math.floor(d.p.x / TILE), ty0 = Math.floor(d.p.y / TILE), S = floorDistances(f.tiles, f.w, f.h, tx0, ty0);
    let goal = -1;
    for (let i = 0; i < S.length && goal < 0; i++) if (S[i] === 18) goal = i;
    if (goal < 0) return 'no goal';
    const B = floorDistances(f.tiles, f.w, f.h, goal % f.w, Math.floor(goal / f.w));
    let i = ty0 * f.w + tx0, n = 0;
    while (B[i] > 0 && n++ < 200) { let next = i; for (const j of [i + 1, i - 1, i + f.w, i - f.w]) if (B[j] >= 0 && B[j] < B[next]) next = j; if (next === i) break; i = next; d.p.x = ((i % f.w) + 0.5) * TILE; d.p.y = (Math.floor(i / f.w) + 0.5) * TILE; for (let k = 0; k < 3; k++) Game.step(1 / 60); }
    return { n, pts: d.thread && d.thread.pts.length, act: actionHere() };
  });
  if (!walked.pts || walked.pts < 10) fail(`the thread did not pay out (${JSON.stringify(walked)})`);
  if (walked.act !== 'plant') fail(`PLANT is not offered out there (${walked.act})`);
  await shot(page, 'smoke-thread');
  await steps(page, { x: 0, y: 0, act: true }, 1);
  if (!(await page.evaluate(() => !!Game.dive.hold))) fail('the hold did not begin');
  const core1 = await page.evaluate(() => { Save.data.core = 5; Game.dive.p.invuln = 1e9; return Save.data.core; });
  // (each wave the dark sends is put down, as a fighting Kindler would)
  for (let k = 0; k < 95; k++) { await steps(page, { x: 0, y: 0 }, 60); await page.evaluate(() => { for (const e of Game.dive.enemies) if (!e.dead && e.type !== 'dummy') killEnemy(e); }); }
  await page.evaluate(() => { Game.dive.p.invuln = 0; });
  const set = await page.evaluate(() => { const d = Game.dive, V = veinsState(); return { nodes: V.nodes.length, veins: V.veins.length, hold: !!d.hold, thread: !!d.thread, lit: starLight(d, d.p.x, d.p.y), worth: d.vWorth, core: Save.data.core, saved: JSON.parse(localStorage.getItem('lodestar.save.v5') || '{}').veins }; });
  if (set.nodes !== 2 || set.veins !== 1) fail(`the node did not set (${JSON.stringify(set)})`);
  if (set.hold || set.thread) fail('the hold or the thread stayed after the set');
  if (set.lit < 1) fail('the ground by the new node is not lit');
  if (!(set.worth > 0)) fail('the vein counts for nothing');
  if (set.core !== core1 + 1) fail(`the core did not mend a piece (${core1} to ${set.core})`);
  if (!set.saved || !set.saved.veins || set.saved.veins.length !== 1) fail('the vein was not saved');
  await shot(page, 'smoke-vein');
  await page.evaluate(() => UI.show('screen-map'));
  await sleep(450);
  if ((await page.evaluate(() => Game.modal)) !== 'screen-map') fail('the map did not open');
  await shot(page, 'smoke-map');
  const went = await page.evaluate(() => { UI.close(); const d = Game.dive, ok = veinsTravel(d, 0); return { ok, lit: starLight(d, d.p.x, d.p.y), near: dist(d.p.x, d.p.y, veinsState().nodes[0].x, veinsState().nodes[0].y) < TILE * 3 }; });
  if (!went.ok || !went.near) fail(`travel by the map did not stand him at the star (${JSON.stringify(went)})`);
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
