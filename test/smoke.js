'use strict';
// The whole loop through the real controls. On a phone, upright: the
// Lodestar, DESCEND, walking with the joystick, mining a vein with MINE
// held, a vein the pick is too weak for, the shaft down, pausing, the
// lodeline home and the haul in the stash, then abandoning a dive and losing
// it. Held sideways, the decks sit either side of the view. On a desktop:
// WASD, Space to mine, Esc to pause. No page errors anywhere; screenshots go
// to test/out/.
const { launch, openGame, shot, finish, PHONE, DESKTOP } = require('./lib');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); };

// fast-forwards the game in the page
async function run(page, seconds) { await page.evaluate((s) => { for (let i = 0; i < s * 60; i++) Game.step(1 / 60); Game.render(); }, seconds); }
async function visible(page, id) { return page.evaluate((id) => { const el = document.getElementById(id); return !!el && !el.hidden && el.getBoundingClientRect().height > 0; }, id); }
async function center(page, sel) { return page.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel); }
async function tap(page, sel) { await sleep(450); const [x, y] = await center(page, sel); await page.touchscreen.tap(x, y); await sleep(60); }

// in the page: puts the prospector on open ground beside an ore of the given
// highest or lowest tier, facing it; returns the ore's tier
function standByOre(want) {
  const d = Game.dive, f = d.floor;
  const tiers = [];
  for (let i = 0; i < f.w * f.h; i++) if (f.tiles[i] === TILE_ORE) tiers.push(T.ores[f.ore[i] - 1].tier);
  if (!tiers.length) return null;
  const tier = want === 'weak' ? Math.max(...tiers) : Math.min(...tiers);
  for (let ty = 1; ty < f.h - 1; ty++)
    for (let tx = 1; tx < f.w - 1; tx++) {
      const i = ty * f.w + tx;
      if (f.tiles[i] !== TILE_ORE || T.ores[f.ore[i] - 1].tier !== tier) continue;
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        if (TILE_SOLID[floorTile(f, tx + dx, ty + dy)]) continue;
        d.p.x = (tx + dx + 0.5) * TILE; d.p.y = (ty + dy + 0.5) * TILE;
        d.p.fx = -dx; d.p.fy = -dy;
        return tier;
      }
    }
  return null;
}
function standOn(where) { const d = Game.dive, t = d.floor[where]; if (!t) return false; d.p.x = (t.x + 0.5) * TILE; d.p.y = (t.y + 0.5) * TILE; return true; }

async function phone(browser) {
  const { page, errors } = await openGame(browser, PHONE);
  check(await visible(page, 'screen-base'), 'phone: no Lodestar screen');
  await shot(page, 'smoke-base');
  await tap(page, '#base-descend');
  check(await page.evaluate(() => Game.scene === 'dive' && !Game.modal && Game.dive.depth === 1), 'phone: DESCEND did not start a dive');
  await run(page, 0.2);
  // the view fills the stage at a whole scale, and shows at least VIEW_MIN across
  const v = await page.evaluate(() => ({ w: View.w, h: View.h, k: View.scale, cssW: View.canvas.getBoundingClientRect().width, stageW: $('stage').getBoundingClientRect().width }));
  check(Math.min(v.w, v.h) >= 176 && v.cssW >= v.stageW - 1, `phone: the view is ${v.w}×${v.h} at ×${v.k}, ${v.cssW}px across a ${v.stageW}px stage`);

  // the joystick walks
  const before = await page.evaluate(() => [Game.dive.p.x, Game.dive.p.y]);
  const [lx, ly] = await center(page, '#deck-left');
  await page.touchscreen.touchStart(lx, ly);
  for (let i = 1; i <= 5; i++) await page.touchscreen.touchMove(lx + i * 8, ly);
  check(await visible(page, 'stick-base'), 'phone: no joystick under the thumb');
  await run(page, 0.6);
  await page.touchscreen.touchEnd();
  const after = await page.evaluate(() => [Game.dive.p.x, Game.dive.p.y]);
  const blocked = await page.evaluate(() => TILE_SOLID[floorTile(Game.dive.floor, Math.floor((Game.dive.p.x + 8) / TILE), Math.floor(Game.dive.p.y / TILE))]);
  check(after[0] > before[0] + 4 || blocked, `phone: the joystick didn't walk right (${before} → ${after})`);
  check(!(await visible(page, 'stick-base')), 'phone: the joystick stayed after the thumb lifted');

  // mining a vein the pick can break, with MINE held
  const tier = await page.evaluate(standByOre, 'ok');
  check(tier === 1, `phone: no tier-1 ore beside open ground (found ${tier})`);
  await run(page, 0.1);
  check(await page.evaluate(() => !!Game.dive.target), 'phone: standing at the ore, nothing is targeted');
  const [mx, my] = await center(page, '#btn-mine');
  await page.touchscreen.touchStart(mx, my);
  await run(page, 0.4);
  await shot(page, 'smoke-mining');
  await run(page, 1.0);
  await page.touchscreen.touchEnd();
  const cargo = await page.evaluate(() => Game.dive.cargoUsed);
  check(cargo >= 1, 'phone: holding MINE broke no ore');

  // a vein the pick is too weak for says so and yields nothing
  const weakTier = await page.evaluate(standByOre, 'weak');
  if (weakTier > 1) {
    await page.evaluate(() => { Input.bot = { mine: true }; });
    await run(page, 2);
    await page.evaluate(() => { Input.bot = null; });
    const toast = await page.evaluate(() => $('toasts').textContent);
    check(/can't break/.test(toast), `phone: a weak pick said "${toast}"`);
    check((await page.evaluate(() => Game.dive.cargoUsed)) === cargo, 'phone: a weak pick still mined');
  }

  // the shaft: DESCEND appears and takes the dive down
  await page.evaluate(standOn, 'shaft');
  await run(page, 0.1);
  check(await visible(page, 'btn-act'), 'phone: no DESCEND on the shaft');
  await tap(page, '#btn-act');
  await run(page, 0.1);
  check(await page.evaluate(() => Game.dive.depth === 2), 'phone: DESCEND did not go down');
  check(await page.evaluate(() => Game.dive.cargoUsed) === cargo, 'phone: the cargo did not come down the shaft');

  // pausing stops the world
  await tap(page, '#btn-pause');
  check(await visible(page, 'screen-pause'), 'phone: II did not pause');
  const t0 = await page.evaluate(() => Game.dive.time);
  await run(page, 0.5);
  check(await page.evaluate((t0) => Game.dive.time === t0, t0), 'phone: the dive ran on while paused');
  await tap(page, '#pause-resume');
  check(!(await page.evaluate(() => Game.modal)), 'phone: RESUME did not close the pause');

  // the lodeline home banks the haul
  await page.evaluate(standOn, 'pad');
  await run(page, 0.1);
  await shot(page, 'smoke-lodeline');
  check(await page.evaluate(() => $('btn-act').textContent === 'EXTRACT'), 'phone: no EXTRACT on the lodeline');
  await tap(page, '#btn-act');
  await run(page, 0.1);
  check(await visible(page, 'screen-base'), 'phone: EXTRACT did not come home');
  const banked = await page.evaluate(() => [Object.values(Save.data.stash).reduce((a, b) => a + b, 0), JSON.parse(localStorage.getItem('lodestar.save.v1')).stash]);
  check(banked[0] === cargo, `phone: banked ${banked[0]} of ${cargo}`);
  check(Object.values(banked[1]).reduce((a, b) => a + b, 0) === cargo, 'phone: the stash was not saved');
  check(/Banked/.test(await page.evaluate(() => $('base-report').textContent)), 'phone: the Lodestar does not report the haul');
  await shot(page, 'smoke-banked');

  // abandoning a dive loses its haul
  await tap(page, '#base-descend');
  await page.evaluate(standByOre, 'ok');
  await page.evaluate(() => { Input.bot = { mine: true }; });
  await run(page, 1.5);
  await page.evaluate(() => { Input.bot = null; });
  await tap(page, '#btn-pause');
  await tap(page, '#pause-abandon');
  check(await page.evaluate(() => /Lost/.test($('base-report').textContent)), 'phone: abandoning did not report the loss');
  check(await page.evaluate((c) => Object.values(Save.data.stash).reduce((a, b) => a + b, 0) === c, cargo), 'phone: abandoning banked the haul');

  check(!(await page.evaluate(() => ScriptErrors.length + Errors.length)), 'phone: script errors: ' + (await page.evaluate(() => JSON.stringify(ScriptErrors.concat(Errors)))));
  check(!errors.length, 'phone: ' + errors.join(' | '));
  await page.close();
}

async function sideways(browser) {
  const { page, errors } = await openGame(browser, { width: 844, height: 390 });
  await tap(page, '#base-descend');
  await run(page, 0.2);
  const r = await page.evaluate(() => ['deck-left', 'stage', 'deck-right'].map((id) => document.getElementById(id).getBoundingClientRect()).map((b) => [b.left, b.right, b.width]));
  check(r[0][1] <= r[1][0] + 1 && r[1][1] <= r[2][0] + 1, `sideways: the decks are not either side of the view: ${JSON.stringify(r)}`);
  check(r[0][2] >= 150 && r[2][2] >= 150, `sideways: a deck is under 150px: ${r[0][2]}, ${r[2][2]}`);
  check(await page.evaluate(() => Math.min(View.w, View.h) >= 176), 'sideways: the view is under 176 game px');
  await shot(page, 'smoke-sideways');
  check(!errors.length, 'sideways: ' + errors.join(' | '));
  await page.close();
}

async function desktop(browser) {
  const { page, errors } = await openGame(browser, DESKTOP);
  await sleep(450);
  await page.click('#base-descend');
  await run(page, 0.1);
  const x0 = await page.evaluate(() => Game.dive.p.y);
  await page.keyboard.down('KeyS');
  await run(page, 0.5);
  await page.keyboard.up('KeyS');
  const x1 = await page.evaluate(() => Game.dive.p.y);
  const blocked = await page.evaluate(() => TILE_SOLID[floorTile(Game.dive.floor, Math.floor(Game.dive.p.x / TILE), Math.floor((Game.dive.p.y + 8) / TILE))]);
  check(x1 > x0 + 4 || blocked, 'desktop: S did not walk down');
  await page.evaluate(standByOre, 'ok');
  await page.keyboard.down('Space');
  await run(page, 1.6);
  await page.keyboard.up('Space');
  check(await page.evaluate(() => Game.dive.cargoUsed >= 1), 'desktop: Space did not mine');
  await page.keyboard.press('Escape');
  check(await visible(page, 'screen-pause'), 'desktop: Esc did not pause');
  await shot(page, 'smoke-desktop');
  check(!errors.length, 'desktop: ' + errors.join(' | '));
  await page.close();
}

(async () => {
  const browser = await launch();
  try {
    await phone(browser);
    await sideways(browser);
    await desktop(browser);
  } catch (e) {
    failures.push(String(e.stack || e));
  } finally {
    await browser.close();
  }
  finish('smoke', failures);
})();
