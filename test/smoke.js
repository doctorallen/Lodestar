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
// The whole loop, from the outpost: the ledge, a dive, the forge and its
// anvil, the rune bench, the star's altar.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T_RECALL = 4; // seconds; T.leave.recall
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

// in the page: puts the diver on open ground beside an ore of the
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

// in the page: stands the diver at a station in the outpost
function atStation(id) { const d = Game.dive, s = HUB_STATIONS.find((x) => x.id === id); d.p.x = (s.x + 0.5) * TILE; d.p.y = (s.y + 0.9) * TILE; }

async function phone(browser) {
  const { page, errors } = await openGame(browser, PHONE);
  // home: the outpost, the star over the pit
  check(await page.evaluate(() => Game.dive && Game.dive.hub && !Game.modal), 'phone: the game did not open at the outpost');
  await run(page, 0.2);
  await shot(page, 'smoke-outpost');
  // the walk works at home too
  const h0 = await page.evaluate(() => Game.dive.p.y);
  const [hx, hy] = await center(page, '#deck-left');
  await page.touchscreen.touchStart(hx, hy);
  for (let i = 1; i <= 5; i++) await page.touchscreen.touchMove(hx, hy - i * 8);
  await run(page, 0.5);
  await page.touchscreen.touchEnd();
  check(await page.evaluate((h0) => Game.dive.p.y < h0 - 4, h0), 'phone: the joystick did not walk at the outpost');
  await page.evaluate(atStation, 'descend');
  await run(page, 0.1);
  check(await page.evaluate(() => $('btn-act').textContent === 'DESCEND'), 'phone: no DESCEND at the ledge');
  await tap(page, '#btn-act');
  await run(page, 0.05);
  check(await visible(page, '#screen-descend'), 'phone: the ledge did not open the biomes');
  check(await page.evaluate(() => document.querySelectorAll('#descend-body .biome:disabled').length === 2), 'phone: the Choir and the Underforge are open on a fresh save');
  await tap(page, '#descend-body [data-act=dive][data-arg="0"]');
  check(await page.evaluate(() => Game.scene === 'dive' && !Game.dive.hub && !Game.modal && Game.dive.depth === 1), 'phone: tapping the Rim did not start a dive');
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
  const blocked = await page.evaluate(() => rockAt(Game.dive.floor, Game.dive.p.x + 8, Game.dive.p.y));
  check(after[0] > before[0] + 4 || blocked, `phone: the joystick didn't walk right (${before} → ${after})`);

  // SWING hits an enemy beside the diver
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

  // pausing stops the world; CARGO shows what's carried; gear salvaged in
  // the field turns into ore in the cargo
  await tap(page, '#btn-pause');
  check(await visible(page, '#screen-pause'), 'phone: II did not pause');
  const t0 = await page.evaluate(() => Game.dive.time);
  await run(page, 0.5);
  check(await page.evaluate((t0) => Game.dive.time === t0, t0), 'phone: the dive ran on while paused');
  await tap(page, '#pause-resume');
  check(!(await page.evaluate(() => Game.modal)), 'phone: RESUME did not close the pause');
  await page.evaluate(() => { Game.dive.items.push(makeItem(new Rng(5), 'blade', 2, { rarity: 'rare' })); Game.dive.items.push(makeItem(new Rng(6), 'armor', 1, { rarity: 'magic' })); });
  await tap(page, '#btn-cargo');
  check(await visible(page, '#screen-cargo'), 'phone: CARGO did not open');
  check(await page.evaluate(() => document.querySelectorAll('#cargo-body [data-act=cardCargo]').length === 2), 'phone: the found gear is not in the cargo');
  await shot(page, 'smoke-cargo');
  const ferrite0 = await page.evaluate(() => Game.dive.cargo.ferrite || 0);
  const plate = await page.evaluate(() => Game.dive.items.find((i) => i.kind === 'armor').uid);
  await tap(page, `#cargo-body [data-act=cardCargo][data-arg="${plate}"]`);
  await tap(page, '#card [data-act=salvage]');
  check(await page.evaluate((f0) => Game.dive.items.length === 1 && (Game.dive.cargo.ferrite || 0) > f0, ferrite0), 'phone: salvaging in the field gave no ore');
  await tap(page, '#screen-cargo [data-act=resume]');

  // an ancient forge forges from the cargo, and what it makes goes in it
  await page.evaluate(() => { const d = Game.dive; d.cargo.ferrite = 20; d.cargo.chitin1 = 3; d.fieldForge = { x: Math.floor(d.p.x / TILE), y: Math.floor(d.p.y / TILE) }; });
  await run(page, 0.05);
  check(await page.evaluate(() => $('btn-act').textContent === 'FORGE'), 'phone: no FORGE at an ancient forge');
  await tap(page, '#btn-act');
  await run(page, 0.05);
  check(await page.evaluate(() => $('forge-title').textContent === 'AN ANCIENT FORGE'), 'phone: the ancient forge did not open');
  await tap(page, '#forge-body [data-act=forgeBp][data-arg=charm]');
  await tap(page, '#forge-body [data-act=craft]');
  check(await visible(page, '#screen-anvil'), 'phone: forging did not go to the anvil');
  for (let k = 0; k < 3; k++) { await run(page, 0.4); await page.evaluate(() => Anvil.strike()); }
  await run(page, 0.8);
  check(await visible(page, '#screen-reveal'), 'phone: the forged piece was not revealed');
  await run(page, 2.5);
  check(await page.evaluate(() => Game.dive.items.some((i) => i.kind === 'charm') && Game.dive.cargo.ferrite === 20 - BLUEPRINTS.charm.ore && Game.dive.cargo.chitin1 === 1), 'phone: the ancient forge did not use the cargo, or the charm is not in it');
  await page.evaluate(() => { UI.closeCard(); UI.close(); Game.dive.fieldForge = null; });
  const carried = await page.evaluate(() => cargoUsed(Game.dive));

  // the lodeline home banks the haul and feeds the star
  await page.evaluate(standOn, 'pad');
  await run(page, 0.1);
  await shot(page, 'smoke-lodeline');
  check(await page.evaluate(() => $('btn-act').textContent === 'EXTRACT'), 'phone: no EXTRACT on the lodeline');
  // moving breaks the channel; standing still sees it through
  await tap(page, '#btn-act');
  await run(page, 0.5);
  check(await page.evaluate(() => !!Game.dive.channel), 'phone: EXTRACT did not start rising');
  await page.evaluate(() => { Game.dive.p.x += 6; });
  await run(page, 0.1);
  check(await page.evaluate(() => !Game.dive.channel && !Game.dive.hub), 'phone: moving did not break the channel');
  await page.evaluate(standOn, 'pad');
  await run(page, 0.1);
  await tap(page, '#btn-act');
  await run(page, 0.6);
  await shot(page, 'smoke-rising');
  await run(page, 1.2);
  check(await visible(page, '#screen-report'), 'phone: EXTRACT did not report the dive');
  check(/Banked/.test(await page.evaluate(() => $('report-body').textContent)), 'phone: the report does not mention the haul');
  const banked = await page.evaluate(() => [Object.values(Save.data.stash).reduce((a, b) => a + b, 0) + Save.data.items.length * T.cargo.itemWeight, JSON.parse(localStorage.getItem('lodestar.save.v2')), Save.data.star]);
  check(banked[0] === carried, `phone: banked ${banked[0]} of ${carried}`);
  check(banked[1].items.length === 2, 'phone: the found gear was not banked and saved');
  const fedWant = await page.evaluate(() => T.star.extractStar * 4);
  check(banked[2] === fedWant, `phone: the lodeline fed the star ${banked[2]}, not ${fedWant}`);
  await shot(page, 'smoke-report');
  await tap(page, '#screen-report [data-act=closeReport]');
  check(await page.evaluate(() => Game.dive.hub && !Game.modal), 'phone: CONTINUE did not come back to the outpost');

  // the forge: three strikes on the anvil, the reveal, the card
  await page.evaluate(() => { Save.data.stash.ferrite = 40; Save.data.stash.cog1 = 2; });
  await page.evaluate(atStation, 'forge');
  await run(page, 0.05);
  check(await page.evaluate(() => $('btn-act').textContent === 'FORGE'), 'phone: no FORGE at the forge');
  await tap(page, '#btn-act');
  await run(page, 0.05);
  await tap(page, '#forge-body [data-act=forgeBp][data-arg=blade]');
  await shot(page, 'smoke-forge');
  await tap(page, '#forge-body [data-act=craft]');
  check(await page.evaluate(() => Save.data.stash.ferrite === 32 && !Save.data.stash.cog1), 'phone: forging a blade did not cost 8 Ferrite and 2 cogs');
  await shot(page, 'smoke-anvil');
  const [ax, ay] = await center(page, '#anvil-canvas');
  for (let k = 0; k < 3; k++) { await run(page, 0.4); await page.touchscreen.tap(ax, ay); await sleep(60); }
  check(await page.evaluate(() => !Anvil.job || Anvil.job.strikes.length === 3), 'phone: three taps did not strike three times');
  await run(page, 0.8);
  await shot(page, 'smoke-reveal');
  await run(page, 2.5);
  check(await visible(page, '#card'), 'phone: the reveal did not open the card');
  await shot(page, 'smoke-forged');
  await tap(page, '#card [data-act=equip][data-arg=main]');
  check(await page.evaluate(() => Save.data.equip.main.name !== 'Scrap Blade' && Save.data.items.some((i) => i.name === 'Scrap Blade')), 'phone: the forged blade is not in the main hand');
  check(await page.evaluate(() => Save.data.equip.main.affixes.some((a) => AFFIXES[a.id].family === 'melee')), 'phone: a blade bound with cogs has no melee affix');
  await tap(page, '#screen-forge [data-act=back]');

  // the rune bench rerolls an affix on what's worn
  await page.evaluate(atStation, 'runes');
  await run(page, 0.05);
  check(await page.evaluate(() => $('btn-act').textContent === 'RUNES'), 'phone: no RUNES at the rune bench');
  await tap(page, '#btn-act');
  await run(page, 0.05);
  await tap(page, '#gear-body [data-act=cardEquip][data-arg=main]');
  if (await page.evaluate(() => Save.data.equip.main.affixes.length > 0)) {
    await tap(page, '#card [data-act=reroll][data-arg="0"]');
    check(await page.evaluate(() => Save.data.stash.ferrite === 32 - T.runes.reroll), 'phone: a reroll did not cost Ferrite');
  }
  await tap(page, '#card [data-act=closeCard]');
  await shot(page, 'smoke-gear');
  await tap(page, '#screen-gear [data-act=back]');

  // feeding the star at the altar: back out to watch it drink
  await page.evaluate(atStation, 'altar');
  await run(page, 0.05);
  check(await page.evaluate(() => $('btn-act').textContent === 'THE STAR'), 'phone: no THE STAR at the altar');
  await tap(page, '#btn-act');
  await run(page, 0.05);
  const pts = await page.evaluate(() => Save.data.star);
  await tap(page, '#star-body [data-act=feed][data-arg="ferrite:10"]');
  check(await page.evaluate((p) => Save.data.star === p + 10 && !Game.modal, pts), 'phone: feeding 10 Ferrite did not add 10 points and show the star');
  await run(page, 0.4);
  await shot(page, 'smoke-feed');

  // the star's pull fades: the lodeline goes dark and the Hollow comes
  await page.evaluate(() => UI.acts.dive('0'));
  const pulled = await page.evaluate(() => { const d = Game.dive; for (const e of d.enemies) e.dead = true; d.p.hp = 1e9; d.stats.maxHp = 1e9; d.pull = 0.001; for (let i = 0; i < 30; i++) Game.step(1 / 60); return [d.padDark, d.enemies.some((e) => e.type === 'hollow' && !e.dead), d.floor.pad ? (d.p.x = (d.floor.pad.x + 0.5) * TILE, d.p.y = (d.floor.pad.y + 0.5) * TILE, actionHere()) : null]; });
  check(pulled[0] && pulled[1], `phone: a drained pull did not darken the lodeline and bring the Hollow (${pulled})`);
  check(pulled[2] !== 'extract', 'phone: a dark lodeline still extracts');
  await run(page, 0.3);
  await shot(page, 'smoke-hollow');
  // an emergency recall brings most of it home
  await page.evaluate(() => { const d = Game.dive; for (const e of d.enemies) e.dead = true; d.cargo = { ferrite: 20 }; d.items = []; Save.data.stash.ferrite = 0; });
  await tap(page, '#btn-pause');
  await tap(page, '#pause-recall');
  await run(page, T_RECALL + 0.3);
  check(await visible(page, '#screen-report'), 'phone: the recall did not come home');
  const recalled = await page.evaluate(() => [Save.data.stash.ferrite, Math.round(20 * (1 - recallCost({ depth: 1 })))]);
  check(recalled[0] === recalled[1], `phone: the recall banked ${recalled[0]} Ferrite, not ${recalled[1]}`);
  await tap(page, '#screen-report [data-act=closeReport]');

  // dying loses the cargo, keeps what's worn and what's pocketed
  const kept = await page.evaluate(() => [Save.data.equip.main.uid, Save.data.stash.ferrite]);
  await page.evaluate(() => UI.acts.dive('0'));
  await page.evaluate(() => { const d = Game.dive; d.cargo.ferrite = 9; d.items.push(makeRelic(1)); d.items.push(makeItem(new Rng(9), 'charm', 1, { rarity: 'rare' })); });
  await tap(page, '#btn-cargo');
  const charm = await page.evaluate(() => Game.dive.items.find((i) => i.kind === 'charm').uid);
  await tap(page, `#cargo-body [data-act=cardCargo][data-arg="${charm}"]`);
  await tap(page, '#card [data-act=pocket]');
  check(await page.evaluate(() => Game.dive.pocket.length === 1), 'phone: POCKET did not pocket the charm');
  await tap(page, '#screen-cargo [data-act=resume]');
  await page.evaluate(() => { const d = Game.dive; d.p.invuln = 0; hurtPlayer(9999, null); });
  await run(page, 1);
  await shot(page, 'smoke-dying');
  await run(page, 1);
  check(await visible(page, '#screen-report'), 'phone: dying did not report');
  check(/YOU FELL/.test(await page.evaluate(() => $('report-title').textContent)), 'phone: the report does not say you fell');
  check(await page.evaluate(([w, fe]) => Save.data.equip.main.uid === w && Save.data.stash.ferrite === fe && !Save.data.items.some((i) => i.kind === 'relic'), kept), 'phone: dying kept the cargo or lost the gear');
  check(await page.evaluate(() => Save.data.items.some((i) => i.kind === 'charm')), 'phone: the pocketed charm did not survive the fall');
  check(/pocket kept/.test(await page.evaluate(() => $('report-body').textContent)), 'phone: the report does not mention the pocket');

  // every hole a mined vein leaves can be walked into, from the side or the corner
  const holes = await page.evaluate(() => {
    const bad = [];
    for (let seed = 1; seed <= 12; seed++) {
      const f = generateFloor(seed, 2, 0);
      for (let i = 0; i < f.w * f.h; i++) {
        if (f.tiles[i] !== TILE_ORE) continue;
        const tx = i % f.w, ty = Math.floor(i / f.w);
        let from = null;
        for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]) if (floorTile(f, tx + dx, ty + dy) === TILE_FLOOR) { from = [tx + dx, ty + dy]; break; }
        if (!from) continue;
        f.tiles[i] = TILE_FLOOR;
        const body = { x: (from[0] + 0.5) * TILE, y: (from[1] + 0.5) * TILE };
        for (let k = 0; k < 120; k++) { const a = norm((tx + 0.5) * TILE - body.x, (ty + 0.5) * TILE - body.y); moveBody(f, body, a.x, a.y, T.player.radius); }
        if (dist(body.x, body.y, (tx + 0.5) * TILE, (ty + 0.5) * TILE) > 4) bad.push(`seed ${seed} ${tx},${ty}`);
      }
    }
    return bad;
  });
  check(!holes.length, `phone: mined holes that can't be walked into: ${holes.slice(0, 5).join('; ')}`);

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
  await page.evaluate(() => UI.useStation('descend'));
  await sleep(450);
  await page.click('#descend-body [data-act=dive][data-arg="0"]');
  await run(page, 0.1);
  await page.evaluate(calm);
  const y0 = await page.evaluate(() => Game.dive.p.y);
  await page.keyboard.down('KeyS');
  await run(page, 0.5);
  await page.keyboard.up('KeyS');
  const y1 = await page.evaluate(() => Game.dive.p.y);
  const blocked = await page.evaluate(() => rockAt(Game.dive.floor, Game.dive.p.x, Game.dive.p.y + 8));
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
