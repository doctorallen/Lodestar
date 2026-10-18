'use strict';
// The whole loop through the real controls. On a phone, upright: the
// Lodestar, DESCEND and a biome, walking with the joystick, swinging at an
// enemy, mining with MINE held, a vein the pick is too weak for, the shaft
// down, pausing, the cargo screen, the lodeline home and the haul in the
// stash; the forge, equipping what it makes, a reroll at the rune bench,
// feeding the star; then a death that loses the cargo but not what's worn.
// Held sideways, the decks sit either side of the view. On a desktop: WASD,
// J to swing, Space to mine, Esc to pause. No page errors anywhere;
// screenshots go to test/out/.
const { launch, openGame, shot, finish, PHONE, DESKTOP } = require('./lib');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); };

// fast-forwards the game in the page
async function run(page, seconds) { await page.evaluate((s) => { for (let i = 0; i < s * 60; i++) Game.step(1 / 60); Game.render(); }, seconds); }
async function visible(page, sel) { return page.evaluate((sel) => { const el = document.querySelector(sel); return !!el && !el.hidden && el.getBoundingClientRect().height > 0; }, sel); }
async function center(page, sel) { return page.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel); }
async function tap(page, sel) {
  await sleep(450);
  if (!(await page.$(sel))) throw new Error('nothing to tap at ' + sel);
  await page.evaluate((sel) => document.querySelector(sel).scrollIntoView({ block: 'center' }), sel);
  const [x, y] = await center(page, sel);
  await page.touchscreen.tap(x, y);
  await sleep(60);
}
async function hold(page, sel, seconds) {
  const [x, y] = await center(page, sel);
  await page.touchscreen.touchStart(x, y);
  await run(page, seconds);
  await page.touchscreen.touchEnd();
}

// in the page: puts the prospector on open ground beside an ore of the
// floor's highest ('weak') or lowest tier, facing it; returns its tier
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
// clears every enemy off the floor, so a test isn't interrupted
function calm() { for (const e of Game.dive.enemies) e.dead = true; Game.dive.shots = []; }

async function phone(browser) {
  const { page, errors } = await openGame(browser, PHONE);
  check(await visible(page, '#screen-base'), 'phone: no Lodestar screen');
  await shot(page, 'smoke-base');
  await tap(page, '#hub-body [data-act=go][data-arg=screen-descend]');
  check(await visible(page, '#screen-descend'), 'phone: DESCEND did not open the biomes');
  check(await page.evaluate(() => document.querySelectorAll('#descend-body .biome:disabled').length === 2), 'phone: the Choir and the Underforge are open on a fresh save');
  await tap(page, '#descend-body [data-act=dive][data-arg="0"]');
  check(await page.evaluate(() => Game.scene === 'dive' && !Game.modal && Game.dive.depth === 1), 'phone: tapping the Rim did not start a dive');
  await run(page, 0.2);
  const v = await page.evaluate(() => ({ w: View.w, h: View.h, cssW: View.canvas.getBoundingClientRect().width, stageW: $('stage').getBoundingClientRect().width }));
  check(Math.min(v.w, v.h) >= 176 && v.cssW >= v.stageW - 1, `phone: the view is ${v.w}×${v.h}, ${v.cssW}px across a ${v.stageW}px stage`);

  // the joystick walks
  await page.evaluate(calm);
  const before = await page.evaluate(() => [Game.dive.p.x, Game.dive.p.y]);
  const [lx, ly] = await center(page, '#deck-left');
  await page.touchscreen.touchStart(lx, ly);
  for (let i = 1; i <= 5; i++) await page.touchscreen.touchMove(lx + i * 8, ly);
  check(await visible(page, '#stick-base'), 'phone: no joystick under the thumb');
  await run(page, 0.6);
  await page.touchscreen.touchEnd();
  const after = await page.evaluate(() => [Game.dive.p.x, Game.dive.p.y]);
  const blocked = await page.evaluate(() => TILE_SOLID[floorTile(Game.dive.floor, Math.floor((Game.dive.p.x + 8) / TILE), Math.floor(Game.dive.p.y / TILE))]);
  check(after[0] > before[0] + 4 || blocked, `phone: the joystick didn't walk right (${before} → ${after})`);

  // SWING hits an enemy beside the prospector
  const hit = await page.evaluate(() => {
    const d = Game.dive, e = makeEnemy('crawler', d.p.x + 10, d.p.y, 1, null);
    e.aggro = true; d.enemies.push(e);
    return e.hp;
  });
  await hold(page, '#btn-main', 0.5);
  const left = await page.evaluate(() => Game.dive.enemies[Game.dive.enemies.length - 1].hp);
  check(left < hit, `phone: SWING didn't hurt the crawler beside it (${hit} → ${left})`);
  await shot(page, 'smoke-fight');
  await page.evaluate(calm);

  // mining a vein the pick can break, with MINE held
  const tier = await page.evaluate(standByOre, 'ok');
  check(tier === 1, `phone: no tier-1 ore beside open ground (found ${tier})`);
  await run(page, 0.1);
  check(await page.evaluate(() => !!Game.dive.target), 'phone: standing at the ore, nothing is targeted');
  await hold(page, '#btn-mine', 1.4);
  const cargo = await page.evaluate(() => cargoUsed(Game.dive));
  check(cargo >= 1, 'phone: holding MINE broke no ore');
  await shot(page, 'smoke-mining');

  // a vein the pick is too weak for says so and yields nothing
  if ((await page.evaluate(standByOre, 'weak')) > 1) {
    await page.evaluate(() => { Input.bot = { mine: true }; });
    await run(page, 2);
    await page.evaluate(() => { Input.bot = null; });
    check(/can't break/.test(await page.evaluate(() => $('toasts').textContent)), 'phone: a weak pick said nothing');
    check((await page.evaluate(() => cargoUsed(Game.dive))) === cargo, 'phone: a weak pick still mined');
  }

  // the shaft: DESCEND appears and takes the dive down
  await page.evaluate(standOn, 'shaft');
  await run(page, 0.1);
  check(await visible(page, '#btn-act'), 'phone: no DESCEND on the shaft');
  await tap(page, '#btn-act');
  await run(page, 0.1);
  check(await page.evaluate(() => Game.dive.depth === 2), 'phone: DESCEND did not go down');
  check(await page.evaluate(() => cargoUsed(Game.dive)) === cargo, 'phone: the cargo did not come down the shaft');
  await page.evaluate(calm);

  // pausing stops the world; CARGO shows what's carried
  await tap(page, '#btn-pause');
  check(await visible(page, '#screen-pause'), 'phone: II did not pause');
  const t0 = await page.evaluate(() => Game.dive.time);
  await run(page, 0.5);
  check(await page.evaluate((t0) => Game.dive.time === t0, t0), 'phone: the dive ran on while paused');
  await tap(page, '#pause-resume');
  check(!(await page.evaluate(() => Game.modal)), 'phone: RESUME did not close the pause');
  await page.evaluate(() => Game.dive.items.push(makeItem(new Rng(5), 'blade', 2, { rarity: 'rare' })));
  await tap(page, '#btn-cargo');
  check(await visible(page, '#screen-cargo'), 'phone: CARGO did not open');
  check(await page.evaluate(() => document.querySelectorAll('#cargo-body [data-act=cardCargo]').length === 1), 'phone: the found blade is not in the cargo');
  await shot(page, 'smoke-cargo');
  await tap(page, '#screen-cargo [data-act=resume]');

  // the lodeline home banks the haul
  await page.evaluate(standOn, 'pad');
  await run(page, 0.1);
  await shot(page, 'smoke-lodeline');
  check(await page.evaluate(() => $('btn-act').textContent === 'EXTRACT'), 'phone: no EXTRACT on the lodeline');
  await tap(page, '#btn-act');
  await run(page, 0.1);
  check(await visible(page, '#screen-base'), 'phone: EXTRACT did not come home');
  const banked = await page.evaluate(() => [Object.values(Save.data.stash).reduce((a, b) => a + b, 0), Save.data.items.length, JSON.parse(localStorage.getItem('lodestar.save.v2'))]);
  check(banked[0] === cargo, `phone: banked ${banked[0]} ore of ${cargo}`);
  check(banked[1] === 1 && banked[2].items.length === 1, 'phone: the found blade was not banked and saved');
  check(/Banked/.test(await page.evaluate(() => $('hub-body').textContent)), 'phone: the Lodestar does not report the haul');
  await shot(page, 'smoke-banked');

  // the forge makes a blade, which goes in the main hand
  await page.evaluate(() => { Save.data.stash.ferrite = 40; UI.redraw(); });
  await tap(page, '#hub-body [data-arg=screen-forge]');
  await tap(page, '#forge-body [data-act=craft][data-arg=blade]');
  check(await visible(page, '#card'), 'phone: forging showed no card');
  check(await page.evaluate(() => Save.data.stash.ferrite === 32), 'phone: forging a blade did not cost 8 Ferrite');
  await shot(page, 'smoke-forged');
  await tap(page, '#card [data-act=equip][data-arg=main]');
  check(await page.evaluate(() => Save.data.equip.main.name !== 'Scrap Blade' && Save.data.items.some((i) => i.name === 'Scrap Blade')), 'phone: the forged blade is not in the main hand');
  await tap(page, '#screen-forge [data-act=back]');

  // the rune bench rerolls an affix on what's worn
  await tap(page, '#hub-body [data-arg=screen-gear]');
  await tap(page, '#gear-body [data-act=cardEquip][data-arg=main]');
  if (await page.evaluate(() => Save.data.equip.main.affixes.length > 0)) {
    await tap(page, '#card [data-act=reroll][data-arg="0"]');
    check(await page.evaluate(() => Save.data.stash.ferrite === 32 - T.runes.reroll), 'phone: a reroll did not cost Ferrite');
  }
  await tap(page, '#card [data-act=closeCard]');
  await shot(page, 'smoke-gear');
  await tap(page, '#screen-gear [data-act=back]');

  // feeding the star
  await tap(page, '#hub-body [data-arg=screen-star]');
  const pts = await page.evaluate(() => Save.data.star);
  await tap(page, '#star-body [data-act=feed][data-arg="ferrite:10"]');
  check(await page.evaluate((p) => Save.data.star === p + 10, pts), 'phone: feeding 10 Ferrite did not add 10 points');
  await tap(page, '#screen-star [data-act=back]');

  // dying loses the cargo, keeps what's worn
  const kept = await page.evaluate(() => [Save.data.equip.main.uid, Save.data.stash.ferrite]);
  await tap(page, '#hub-body [data-arg=screen-descend]');
  await tap(page, '#descend-body [data-act=dive][data-arg="0"]');
  await page.evaluate(() => { const d = Game.dive; d.cargo.ferrite = 9; d.items.push(makeRelic(1)); d.p.invuln = 0; hurtPlayer(9999, null); });
  await run(page, 1);
  await shot(page, 'smoke-dying');
  await run(page, 1);
  check(await visible(page, '#screen-base'), 'phone: dying did not come home');
  check(/You fell/.test(await page.evaluate(() => $('hub-body').textContent)), 'phone: the Lodestar does not say you fell');
  check(await page.evaluate(([w, fe]) => Save.data.equip.main.uid === w && Save.data.stash.ferrite === fe && !Save.data.items.some((i) => i.kind === 'relic'), kept), 'phone: dying kept the cargo or lost the gear');

  check(!(await page.evaluate(() => ScriptErrors.length + Errors.length)), 'phone: script errors: ' + (await page.evaluate(() => JSON.stringify(ScriptErrors.concat(Errors)))));
  check(!errors.length, 'phone: ' + errors.join(' | '));
  await page.close();
}

async function sideways(browser) {
  const { page, errors } = await openGame(browser, { width: 844, height: 390 });
  await page.evaluate(() => UI.acts.dive('0'));
  await run(page, 0.2);
  const r = await page.evaluate(() => ['deck-left', 'stage', 'deck-right'].map((id) => document.getElementById(id).getBoundingClientRect()).map((b) => [b.left, b.right, b.width]));
  check(r[0][1] <= r[1][0] + 1 && r[1][1] <= r[2][0] + 1, `sideways: the decks are not either side of the view: ${JSON.stringify(r)}`);
  check(r[0][2] >= 150 && r[2][2] >= 150, `sideways: a deck is under 150px: ${r[0][2]}, ${r[2][2]}`);
  const fits = await page.evaluate(() => ['btn-main', 'btn-mine'].every((id) => { const b = document.getElementById(id).getBoundingClientRect(); return b.bottom <= innerHeight && b.top >= 0 && b.left >= 0 && b.right <= innerWidth; }));
  check(fits, 'sideways: a button is off the screen');
  check(await page.evaluate(() => Math.min(View.w, View.h) >= 176), 'sideways: the view is under 176 game px');
  await shot(page, 'smoke-sideways');
  check(!errors.length, 'sideways: ' + errors.join(' | '));
  await page.close();
}

async function desktop(browser) {
  const { page, errors } = await openGame(browser, DESKTOP);
  await sleep(450);
  await page.click('#hub-body [data-arg=screen-descend]');
  await sleep(450);
  await page.click('#descend-body [data-act=dive][data-arg="0"]');
  await run(page, 0.1);
  await page.evaluate(calm);
  const y0 = await page.evaluate(() => Game.dive.p.y);
  await page.keyboard.down('KeyS');
  await run(page, 0.5);
  await page.keyboard.up('KeyS');
  const y1 = await page.evaluate(() => Game.dive.p.y);
  const blocked = await page.evaluate(() => TILE_SOLID[floorTile(Game.dive.floor, Math.floor(Game.dive.p.x / TILE), Math.floor((Game.dive.p.y + 8) / TILE))]);
  check(y1 > y0 + 4 || blocked, 'desktop: S did not walk down');
  const hp = await page.evaluate(() => { const d = Game.dive, e = makeEnemy('crawler', d.p.x + 10, d.p.y, 1, null); d.enemies.push(e); return e.hp; });
  await page.keyboard.down('KeyJ');
  await run(page, 0.3);
  await page.keyboard.up('KeyJ');
  check(await page.evaluate((hp) => Game.dive.enemies[Game.dive.enemies.length - 1].hp < hp, hp), 'desktop: J did not swing');
  await page.evaluate(calm);
  await page.evaluate(standByOre, 'ok');
  await page.keyboard.down('Space');
  await run(page, 1.6);
  await page.keyboard.up('Space');
  check(await page.evaluate(() => cargoUsed(Game.dive) >= 1), 'desktop: Space did not mine');
  await page.keyboard.press('Escape');
  check(await visible(page, '#screen-pause'), 'desktop: Esc did not pause');
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
