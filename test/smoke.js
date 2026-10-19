'use strict';
// The whole loop through the real controls. On a phone, upright: the
// outpost, the portal's world map and a territory's card, walking out into
// it with the joystick, an Arc at an enemy, mining with MINE held, a vein
// the pick is too weak for, crossing an edge into the neighbour, pausing,
// the cargo screen, lighting the waystones and planting a spire, banking
// at it and travelling home with the haul in the stash; the forge,
// equipping what it makes, a reroll at the rune bench, feeding the star
// (held at the altar, and ore kept from it);
// your light running out, a recall, tools, rifts, a Deep, a Keeper; then a
// fall that loses the cargo but not what's worn, and wakes at the last
// spire.
// Held sideways, the decks sit either side of the view. On a desktop: WASD,
// J to cast, Space to mine, Esc to pause. No page errors anywhere;
// screenshots go to test/out/.
const { launch, openGame: openFresh, shot, finish, PHONE, DESKTOP } = require('./lib');

// Every page plays the same world (its seed is otherwise random), so what
// the checks find in it is the same every run: all of this one's ring 1
// borders the outpost, with waystones, tears and a Deep among it.
const SMOKE_WORLD = 5;
async function openGame(browser, opts) {
  const g = await openFresh(browser, opts);
  await g.page.evaluate((seed) => { Save.data.world = freshWorld(seed); }, SMOKE_WORLD);
  return g;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T_RECALL = 4; // seconds; T.leave.recall
const T_EXTRACT_STAR = 8; // T.star.extractStar
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

// in the page: clears a spot of every enemy and makes the diver hard to kill,
// for the parts of the test that aren't about fighting
function sturdy() { const d = Game.dive; d.p.hp = d.stats.maxHp = 1e6; for (const e of d.enemies) e.dead = true; d.shots = []; }
// in the page: a ring-1 territory, the gentle starter or a dark one (with a
// goal, or a Deep, if asked)
function ring1(want) {
  // (land beside the outpost, so it can be walked out into)
  const ts = worldMap().terrs.filter((t) => t.ring === 1 && t.nb.includes(0));
  const t = want === 'starter' ? ts.find((t) => t.starter) : ts.find((t) => !isKindled(t.id) && (!want || (want === 'deep' ? t.deep : t.goal === want)));
  return t ? t.id : null;
}

// in the page: stands the diver at a station in the outpost
function atStation(id) { const d = Game.dive, s = HUB_STATIONS.find((x) => x.id === id); d.p.x = (s.x + 0.5) * TILE; d.p.y = (s.y + 0.9) * TILE; }

async function phone(browser) {
  const { page, errors } = await openGame(browser, PHONE);
  await page.evaluate(`window.sturdy = ${sturdy}; window.ring1 = ${ring1};`);
  // a fresh game opens on the story, a panel a tap
  check(await visible(page, '#screen-story'), 'phone: a fresh game did not open on the story');
  await shot(page, 'smoke-intro');
  for (let k = 0; k < 5; k++) await tap(page, '#screen-story [data-act=storyNext]');
  // contracts that can't be met by accident, so they don't pay into the checks below
  await page.evaluate(() => { Save.data.contracts = [0, 1, 2].map((i) => ({ id: 900 + i, kind: 'reach', ring: 4, star: 0, reward: 'riftglass' })); });
  // home: the outpost, the star over the pit
  check(await page.evaluate(() => Game.dive && Game.dive.hub && !Game.modal && Save.data.introSeen), 'phone: the story did not end at the outpost');
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
  await page.evaluate(atStation, 'setout');
  await run(page, 0.1);
  check(await page.evaluate(() => $('btn-act').textContent === 'SET OUT'), 'phone: no SET OUT at the portal');
  await tap(page, '#btn-act');
  await run(page, 0.05);
  check(await visible(page, '#screen-setout') && await visible(page, '#world-map'), 'phone: the portal did not open the world map');
  // the map is drawn at a whole number of device pixels to its pixels
  const mapPx = await page.evaluate(() => { const c = $('world-map'), r = c.getBoundingClientRect(); return (r.width * devicePixelRatio) / c.width; });
  check(Math.abs(mapPx - Math.round(mapPx)) < 0.01 && mapPx >= 2, `phone: the map is drawn at ${mapPx} device px a pixel`);
  // a tap on a territory shows its card
  const dark = await page.evaluate(ring1, 'waystones');
  const [mx, my] = await page.evaluate((id) => { const c = $('world-map'), r = c.getBoundingClientRect(), t = worldMap().terrs[id]; return [r.left + ((Math.floor(t.cx) + 0.5) * r.width) / c.width, r.top + ((Math.floor(t.cy) + 0.5) * r.height) / c.height]; }, dark);
  await sleep(450);
  await page.touchscreen.tap(mx, my);
  await sleep(100);
  check(await page.evaluate((id) => UI.mapSel === id && $('map-card').textContent.includes(terrOf(id).name.toUpperCase()) && /ENEMIES/.test($('map-card').textContent), dark), 'phone: tapping a territory did not show its card');
  await shot(page, 'smoke-map');
  // each place is named once on arriving (counted as said, not as shown)
  await page.evaluate(() => { window._siteToasts = 0; const said = UI.toast; UI.toast = (m, k) => { if (/ · ring \d/.test(m)) window._siteToasts++; return said(m, k); }; });
  await tap(page, '#map-card [data-act=setOutWalk]');
  check(await page.evaluate((id) => Game.scene === 'dive' && Game.dive.sortie && Game.dive.terr === id && !Game.modal, dark), 'phone: WALK OUT INTO IT did not start a sortie there');
  check(await page.evaluate(() => window._siteToasts === 1), 'phone: the territory was not named once on arriving');
  const came = await page.evaluate(() => { const d = Game.dive, e = d.floor.exits.find((x) => x.to === 0); return [!!e && Math.abs(Math.floor(d.p.x / TILE) - e.ax) <= 1 && Math.abs(Math.floor(d.p.y / TILE) - e.ay) <= 1, e && e.ax, e && e.ay, d.p.x / TILE, d.p.y / TILE]; });
  check(came[0], `phone: the diver did not come in at the opening from the outpost (${came})`);
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
  const moved = Math.hypot(after[0] - before[0], after[1] - before[1]);
  check(moved > 4 || (await page.evaluate(() => rockAt(Game.dive.floor, Game.dive.p.x + 8, Game.dive.p.y))), `phone: the joystick didn't walk (${before} → ${after})`);

  // the main hand's button is the gauntlet's Arc, and it hurts an enemy
  // beside the diver
  check(await page.evaluate(() => /ARC/.test($('btn-main').textContent) && /BOLT/.test($('btn-off').textContent)), 'phone: the hands\' buttons do not show ARC and BOLT');
  const hit = await page.evaluate(() => {
    const d = Game.dive, e = makeEnemy('crawler', d.p.x + 10, d.p.y, 1, null);
    e.aggro = true; d.enemies.push(e);
    return e.hp;
  });
  await hold(page, '#btn-main', 0.5);
  const left = await page.evaluate(() => Game.dive.enemies[Game.dive.enemies.length - 1].hp);
  check(left < hit, `phone: ARC didn't hurt the crawler beside it (${hit} → ${left})`);
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
  check(await page.evaluate(() => terrState(Game.dive.terr).mined.length >= 1), 'phone: the vein mined was not remembered');

  // a vein the pick is too weak for says so and yields nothing
  if ((await page.evaluate(standByOre, 'weak')) > 1) {
    await page.evaluate(() => { Input.bot = { mine: true }; });
    await run(page, 2);
    await page.evaluate(() => { Input.bot = null; });
    check(/can't break/.test(await page.evaluate(() => $('toasts').textContent)), 'phone: a weak pick said nothing');
    check((await page.evaluate(() => cargoUsed(Game.dive))) === cargo, 'phone: a weak pick still mined');
  }

  // walking off the edge: the view closes, and the diver comes in at the
  // neighbour's opening back, with the cargo
  const cross = await page.evaluate(() => { sturdy(); const d = Game.dive, e = d.floor.exits.find((x) => x.to !== 0); d.p.x = (e.ax + 0.5) * TILE; d.p.y = (e.ay + 0.5) * TILE; Input.bot = { x: -e.nx, y: -e.ny }; return { from: d.terr, to: e.to }; });
  await run(page, 1.6);
  await page.evaluate(() => { Input.bot = null; });
  await run(page, 0.8);
  check(await page.evaluate((c) => { const d = Game.dive, e = d.floor.exits.find((x) => x.to === c.from); return d.terr === c.to && !!e && dist(d.p.x, d.p.y, (e.ax + 0.5) * TILE, (e.ay + 0.5) * TILE) < 3 * TILE; }, cross), 'phone: walking off the edge did not cross into the neighbour, at the opening back');
  check(await page.evaluate(() => cargoUsed(Game.dive)) === cargo, 'phone: the cargo did not come along');
  // the sortie is saved, and comes back in the same place, the same map
  check(await page.evaluate(() => { const d = Game.dive, r = JSON.parse(JSON.stringify(Save.data.run)); Save.data.run = r; resumeRun(); return Game.dive.terr === d.terr && floorHash(Game.dive.floor) === floorHash(d.floor) && cargoUsed(Game.dive) === cargoUsed(d); }), 'phone: the sortie did not survive a resume');
  await page.evaluate((id) => { const d = Game.dive; d.pull = 1; enterTerritory(id, { from: 0 }); }, dark);
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
  await page.evaluate(() => { Game.dive.items.push(makeItem(new Rng(5), 'caster', 2, { rarity: 'rare', bp: 'wand' })); Game.dive.items.push(makeItem(new Rng(6), 'armor', 1, { rarity: 'magic' })); });
  await tap(page, '#btn-cargo');
  check(await visible(page, '#screen-cargo'), 'phone: CARGO did not open');
  check(await page.evaluate(() => document.querySelectorAll('#cargo-body [data-act=cardCargo]').length === 2), 'phone: the found gear is not in the cargo');
  await shot(page, 'smoke-cargo');
  const ferrite0 = await page.evaluate(() => Game.dive.cargo.ferrite || 0);
  const plate = await page.evaluate(() => Game.dive.items.find((i) => i.kind === 'armor').uid);
  await tap(page, `#cargo-body [data-act=cardCargo][data-arg="${plate}"]`);
  await tap(page, '#card [data-act=salvage]');
  check(await page.evaluate(() => /SURE/.test(document.querySelector('#card [data-act=salvage]').textContent)), 'phone: SALVAGE did not ask first');
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

  // the heart goal: three waystones lit (each a channel), the last held in
  // its light; then the spire planted at the heart, and the land kindled
  const stones = [];
  for (let k = 0; k < 3; k++) {
    await page.evaluate((k) => { sturdy(); const d = Game.dive, s = d.floor.stones[k]; d.p.x = (s.x + 0.5) * TILE; d.p.y = (s.y + 1.3) * TILE; }, k);
    await run(page, 0.1);
    if (k === 0) { check(await page.evaluate(() => $('btn-act').textContent === 'LIGHT THE WAYSTONE'), 'phone: no LIGHT THE WAYSTONE at a waystone'); await shot(page, 'smoke-waystone'); }
    await tap(page, '#btn-act');
    await page.evaluate(sturdy);
    await page.evaluate(() => { for (let i = 0; i < 60 * (T.world.waystone.channel + 0.2); i++) { Game.step(1 / 60); for (const e of Game.dive.enemies) e.dead = true; } });
    stones.push(await page.evaluate(() => [(terrState(Game.dive.terr).lit || []).length, !!Game.dive.hold]));
  }
  check(stones[0][0] === 1 && stones[1][0] === 2 && stones[2][1], `phone: the waystones did not light one by one, the last held (${JSON.stringify(stones)})`);
  check(await page.evaluate(() => terrState(Game.dive.terr).state === 'contested' && /Stay in its light/.test($('hud-goal').textContent)), 'phone: lighting a waystone did not contest the land, or the goal does not show the hold');
  await page.evaluate(() => { for (let i = 0; i < 60 * (T.world.waystone.hold + 0.5); i++) { Game.step(1 / 60); for (const e of Game.dive.enemies) e.dead = true; } });
  check(await page.evaluate(() => terrState(Game.dive.terr).done && !Game.dive.hold), 'phone: holding the last waystone did not finish the goal');
  await page.evaluate(() => { const d = Game.dive, h = d.floor.heart; d.p.x = (h.x + 0.5) * TILE; d.p.y = (h.y + 0.8) * TILE; });
  await run(page, 0.1);
  check(await page.evaluate(() => $('btn-act').textContent === 'PLANT THE SPIRE'), 'phone: no PLANT THE SPIRE at the heart');
  await tap(page, '#btn-act');
  await page.evaluate(() => { for (let i = 0; i < 60 * (T.world.plant + 0.3); i++) { Game.step(1 / 60); for (const e of Game.dive.enemies) e.dead = true; } });
  const kindled = await page.evaluate(() => { const d = Game.dive; window._kid = d.terr; const raw = JSON.parse(localStorage.getItem('lodestar.save.v4')); return [d.kindled, terrState(d.terr).state, !!d.floor.pad, d.pull, raw.world.territories[d.terr].state, Save.data.lastSpire === d.terr]; });
  check(kindled.join() === 'true,kindled,true,1,kindled,true', `phone: planting the spire did not kindle the land, saved at once (${kindled})`);
  await run(page, 0.3);
  await shot(page, 'smoke-kindled');
  // a spire banks the haul (a channel moving breaks) and feeds the star
  const carriedNow = await page.evaluate(() => cargoUsed(Game.dive));
  await page.evaluate(standOn, 'pad');
  await run(page, 0.1);
  check(await page.evaluate(() => $('btn-act').textContent === 'BANK' && !$('btn-act2').hidden), 'phone: no BANK and TRAVEL at the spire');
  await tap(page, '#btn-act');
  await run(page, 0.5);
  check(await page.evaluate(() => !!Game.dive.channel), 'phone: BANK did not start');
  await page.evaluate(() => { Game.dive.p.x += 6; });
  await run(page, 0.1);
  check(await page.evaluate(() => !Game.dive.channel && !Game.dive.hub), 'phone: moving did not break the channel');
  const far = await page.evaluate(() => Game.dive.far);
  await page.evaluate(standOn, 'pad');
  await run(page, 0.1);
  await tap(page, '#btn-act');
  await run(page, 1.8);
  const banked = await page.evaluate(() => [Object.values(Save.data.stash).reduce((a, b) => a + b, 0) + Save.data.items.length * T.cargo.itemWeight, JSON.parse(localStorage.getItem('lodestar.save.v4')), Save.data.star, cargoUsed(Game.dive), Game.dive.hub]);
  check(banked[0] === carriedNow && banked[3] === 0 && !banked[4], `phone: banked ${banked[0]} of ${carriedNow}, ${banked[3]} left, still out: ${!banked[4]}`);
  check(banked[1].items.length === 2, 'phone: the found gear was not banked and saved');
  check(banked[2] === 0 && far >= 1, `phone: banking fed the star ${banked[2]} before coming home`);
  // TRAVEL: the map, a spire or home; home banks and reports
  await tap(page, '#btn-act2');
  check(await visible(page, '#screen-setout') && await page.evaluate(() => $('setout-title').textContent === 'TRAVEL'), 'phone: TRAVEL did not open the map');
  await page.evaluate(() => { UI.mapSel = 0; drawMapCard(); });
  await shot(page, 'smoke-travel');
  await tap(page, '#map-card [data-act=travelTo]');
  await run(page, 2.5);
  check(await visible(page, '#screen-report') && /HOME/.test(await page.evaluate(() => $('report-title').textContent)), 'phone: travelling home did not report');
  check(/BANKED/.test(await page.evaluate(() => $('report-body').textContent)), 'phone: the report does not mention the haul');
  const fedHome = await page.evaluate(() => Save.data.star);
  check(fedHome === T_EXTRACT_STAR * far * far, `phone: coming home fed the star ${fedHome}, not 8 × ${far}²`);
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
  await tap(page, '#forge-body [data-act=forgeBp][data-arg=gauntlet]');
  await shot(page, 'smoke-forge');
  await tap(page, '#forge-body [data-act=craft]');
  check(await page.evaluate(() => Save.data.stash.ferrite === 31 && !Save.data.stash.cog1), 'phone: forging a gauntlet did not cost 9 Ferrite and 2 cogs');
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
  check(await page.evaluate(() => Save.data.equip.main.name !== 'Scrap Gauntlet' && Save.data.items.some((i) => i.name === 'Scrap Gauntlet')), 'phone: the forged gauntlet is not in the main hand');
  check(await page.evaluate(() => Save.data.equip.main.affixes.some((a) => AFFIXES[a.id].family === 'close')), 'phone: a gauntlet bound with cogs has no close affix');
  check(await page.evaluate(() => Save.data.equip.main.slots[0] && Save.data.equip.main.slots[0].stone === 'arc'), 'phone: the empty gauntlet did not take the old one\'s circuit');
  await tap(page, '#screen-forge [data-act=back]');

  // the rune bench rerolls an affix on what's worn
  await page.evaluate(atStation, 'runes');
  await run(page, 0.05);
  check(await page.evaluate(() => $('btn-act').textContent === 'REWORK'), 'phone: no REWORK at the rune bench');
  await tap(page, '#btn-act');
  await run(page, 0.05);
  await tap(page, '#gear-body [data-act=cardEquip][data-arg=main]');
  if (await page.evaluate(() => Save.data.equip.main.affixes.length > 0)) {
    await tap(page, '#card [data-act=reroll][data-arg="0"]');
    check(await page.evaluate(() => Save.data.stash.ferrite === 31 - T.runes.reroll), 'phone: a reroll did not cost Ferrite');
  }
  await tap(page, '#card [data-act=closeCard]');
  await shot(page, 'smoke-gear');
  await tap(page, '#screen-gear [data-act=back]');

  // the locker: a stone set in a caster's slot from the drawer, free, and
  // the circuit's words and cost follow it
  const fe0 = await page.evaluate(() => { Save.data.items.push(makeStone('shock', 1), makeStone('split', 1)); return Save.data.stash.ferrite; });
  await page.evaluate(atStation, 'locker');
  await run(page, 0.05);
  await tap(page, '#btn-act');
  await run(page, 0.05);
  await tap(page, '#gear-body [data-act=cardEquip][data-arg=off]');
  check(await visible(page, '#card .circuit'), 'phone: a caster\'s card shows no circuit');
  await tap(page, '#card [data-act=slotPick][data-arg="1"]');
  await tap(page, '#card [data-act=slotPut][data-arg="shock:1"]');
  await tap(page, '#card [data-act=slotPut][data-arg="split:1"]');
  const circ = await page.evaluate(() => [Save.data.equip.off.slots.map((x) => x && x.stone).join(), circuitCost(Save.data.equip.off), $('card-body').textContent, Save.data.stash.ferrite, Math.round(T.circuits.forms.bolt.cost * T.circuits.glyphs.split.cost * 10) / 10]);
  check(circ[0] === 'bolt,shock,split', `phone: socketing gave the wand ${circ[0]}`);
  check(circ[1] === circ[4] && /Shock damage/.test(circ[2]) && /three at once/.test(circ[2]), 'phone: the readout or the cost did not follow the circuit');
  check(circ[3] === fe0, 'phone: socketing cost something');
  await tap(page, '#card [data-act=slotPick][data-arg="1"]');
  await tap(page, '#card [data-act=slotPick][data-arg="1"]');
  check(await page.evaluate(() => !Save.data.equip.off.slots[1] && Save.data.items.some((x) => x.stone === 'shock')), 'phone: tapping a chosen slot again did not empty it');
  await tap(page, '#card [data-act=closeCard]');
  await tap(page, '#screen-gear [data-act=back]');

  // feeding the star at the altar: held, ore after ore rises into it, the
  // plainest first; let go and it stops; ore marked kept stays
  await page.evaluate(() => { for (const o of T.ores) delete Save.data.stash[o.id]; Save.data.stash.ferrite = 30; Save.data.stash.lumenite = 10; Save.data.keepOre = {}; });
  await page.evaluate(atStation, 'altar');
  await run(page, 0.05);
  check(await page.evaluate(() => $('btn-act').textContent === 'FEED THE STAR' && !$('btn-act2').hidden && /^ATTUNE/.test($('btn-act2').textContent)), 'phone: no FEED THE STAR and ATTUNE at the altar');
  const pts = await page.evaluate(() => Save.data.star);
  await hold(page, '#btn-act', 0.6);
  await run(page, 0.05);
  const fed = await page.evaluate((p) => { const s = Save.data, k = 30 - (s.stash.ferrite || 0); return [k, s.star - p, s.stash.lumenite, !!Game.dive.feed, (Game.dive.feedMotes || []).length]; }, pts);
  check(fed[0] > 0 && fed[0] < 30 && fed[1] === fed[0] && fed[2] === 10, `phone: a short hold fed ${fed[0]} Ferrite for ${fed[1]} points (and Lumenite left ${fed[2]})`);
  check(!fed[3], 'phone: feeding the star did not stop on letting go');
  await run(page, 0.4);
  await shot(page, 'smoke-feed');
  check(await page.evaluate(() => !(Game.dive.feedMotes || []).length && JSON.parse(localStorage.getItem('lodestar.save.v4')).stash.ferrite === Save.data.stash.ferrite), 'phone: the ore fed never reached the star, or the save missed it');
  // ATTUNE opens the star's screen: keep the Ferrite, then hold to the end
  await tap(page, '#btn-act2');
  check(await visible(page, '#screen-star'), 'phone: ATTUNE did not open the star');
  await tap(page, '#star-body [data-act=keepOre][data-arg=ferrite]');
  await tap(page, '#screen-star [data-act=back]');
  const fe1 = await page.evaluate(() => Save.data.stash.ferrite), pts1 = await page.evaluate(() => Save.data.star);
  await hold(page, '#btn-act', 2.5);
  await run(page, 1);
  check(await page.evaluate(([f, p]) => Save.data.stash.ferrite === f && !Save.data.stash.lumenite && Save.data.star === p + 40, [fe1, pts1]), 'phone: a long hold did not give all the Lumenite and keep the Ferrite');
  await page.evaluate(() => { Save.data.keepOre = {}; });

  // your light runs out in dark land, and the Hollow comes; kindled land
  // fills it again
  await page.evaluate((id) => UI.acts.setOutWalk(String(id)), await page.evaluate(ring1, null));
  const pulled = await page.evaluate(() => { sturdy(); const d = Game.dive; d.pull = 0.001; for (let i = 0; i < 30; i++) Game.step(1 / 60); return [d.pull, d.enemies.some((e) => e.type === 'hollow' && !e.dead), /out/.test($('toasts').textContent)]; });
  check(pulled[0] === 0 && pulled[1] && pulled[2], `phone: your light running out did not bring the Hollow (${pulled})`);
  await run(page, 0.3);
  await shot(page, 'smoke-hollow');
  // an emergency recall brings most of it home
  await page.evaluate(() => { const d = Game.dive; for (const e of d.enemies) e.dead = true; d.cargo = { ferrite: 20 }; d.items = []; Save.data.stash.ferrite = 0; window._recallDepth = d.depth; });
  await tap(page, '#btn-pause');
  await tap(page, '#pause-recall');
  await run(page, T_RECALL + 0.3);
  check(await visible(page, '#screen-report'), 'phone: the recall did not come home');
  // the dark's share is rounded up or down by chance
  const recalled = await page.evaluate(() => { const c = recallCost({ depth: window._recallDepth }); return [Save.data.stash.ferrite, 20 - Math.ceil(20 * c), 20 - Math.floor(20 * c)]; });
  check(recalled[0] >= recalled[1] && recalled[0] <= recalled[2], `phone: the recall banked ${recalled[0]} Ferrite, not ${recalled[1]}–${recalled[2]}`);
  await tap(page, '#screen-report [data-act=closeReport]');

  // tools: made once from the stash, one carried; the compass points to the
  // spire, or out of dark land towards lit land; the beacon calls a spire's
  // light down where none stands
  const tools = await page.evaluate(() => {
    const s = Save.data, was = s.star, lit = window._kid, dark = ring1(null);
    s.star = 3000; Object.assign(s.stash, { ferrite: 40, spore1: 5, ether2: 5, lumenite: 30, fiber3: 5, chitin1: 5, resonite: 20, cog2: 5 });
    const made = TOOL_IDS.filter((id) => id !== 'compass').every((id) => makeTool(id));
    s.tool = 'compass'; UI.close(); startSortie({ terr: lit, spire: true });
    let d = Game.dive;
    for (let i = 0; i < 30; i++) Game.step(1 / 60);
    const points = !!d.compass && d.compass.home && d.compass.x === d.floor.pad.x;
    enterTerritory(dark, { from: 0 }); sturdy();
    for (let i = 0; i < 30; i++) Game.step(1 / 60);
    if (!d.compass) return { why: JSON.stringify({ modal: Game.modal, hit: Game.hitstop, warp: !!d.warp, tool: d.tool, terr: d.terr, dark, game: Game.dive === d, exits: d.floor.exits.length, t: d.toolT }) };
    const e = d.floor.exits.find((x) => x.x === d.compass.x && x.y === d.compass.y), out = !!e && (isKindled(e.to) || worldMap().terrs[e.to].nb.some(isKindled));
    UI.close(); abandonDive(); UI.close();
    s.tool = 'beacon'; startSortie({ terr: lit, spire: true }); d = Game.dive;
    const refused = !plantBeacon();
    enterTerritory(dark, { from: 0 }); sturdy();
    const planted = refused && plantBeacon(), again = plantBeacon();
    for (let i = 0; i < 60 * (T.tools.beacon.land + 0.5); i++) { Game.step(1 / 60); for (const x of d.enemies) x.dead = true; }
    d.p.x = (d.beacon.x + 0.5) * TILE; d.p.y = (d.beacon.y + 0.5) * TILE; Game.step(1 / 60);
    const lands = actionHere() === 'extract' && $('btn-act').textContent === 'BANK';
    UI.close(); abandonDive(); UI.close();
    s.star = was; s.tool = 'compass';
    return { made, points, out, planted, again, lands };
  });
  check(!tools.why, 'phone: no compass in dark land ' + tools.why);
  check(tools.made, 'phone: the tools could not be made');
  check(tools.points, 'phone: the compass did not point to the spire');
  check(tools.out, 'phone: in dark land the compass did not point towards lit land');
  check(tools.planted && !tools.again, 'phone: the beacon was not planted once, and only once (and refused by a spire)');
  check(tools.lands, "phone: the beacon did not land a spire's light to bank at");

  // a Deep: a portal down from a territory, its sites built as the old
  // expeditions were, and back up by its last portal
  const deep = await page.evaluate(() => {
    const id = ring1('deep');
    if (id === null) return 'none';
    UI.close(); startSortie({ terr: id, from: 0 }); sturdy();
    const d = Game.dive, w = d.floor.ways[0];
    d.p.x = (w.x + 0.5) * TILE; d.p.y = (w.y + 0.9) * TILE; Game.step(1 / 60);
    const down = $('btn-act').textContent === 'DOWN INTO THE DEEP';
    Input.actReq = true;
    for (let i = 0; i < 60; i++) Game.step(1 / 60);
    const inDeep = !!d.deep && d.deep.site === 1 && d.zone !== 'surface';
    const t = terrOf(id);
    while (d.deep.site < d.deep.of && d.ways.length) { enterDeepSite(d.deep.site + 1); }
    let up = true;
    if (d.zone !== 'lair') { sturdy(); const v = d.floor.ways[0]; d.p.x = (v.x + 0.5) * TILE; d.p.y = (v.y + 0.9) * TILE; Game.step(1 / 60); up = /BACK UP/.test($('btn-act').textContent); Input.actReq = true; for (let i = 0; i < 60; i++) Game.step(1 / 60); up = up && !d.deep && d.terr === id; }
    UI.close(); abandonDive(); UI.close();
    return { down, inDeep, up, sites: t.deep };
  });
  check(deep === 'none' || (deep.down && deep.inDeep && deep.up), `phone: the Deep did not lead down and back up (${JSON.stringify(deep)})`);
  await shot(page, 'smoke-deep');

  // rifts: a tear can be sealed for riftglass, a gate carries the diver
  // through, and riftglass forges a tier higher
  const rifts = await page.evaluate(() => {
    const was = [T.rifts.chance, T.rifts.kinds], out = {};
    T.rifts.chance = [1, 1, 1, 1];
    for (const kind of ['bloom', 'gate', 'graft']) {
      T.rifts.kinds = { graft: 0, bloom: 0, gate: 0, inversion: 0, [kind]: 1 };
      // the first site of a Deep with a tear of the kind
      let d = null, r = null;
      for (const t of worldMap().terrs.filter((x) => x.deep && x.ring)) {
        UI.close(); startSortie({ terr: t.id, spire: false, from: t.nb[0] }); enterDeepSite(1);
        d = Game.dive; r = d.rift;
        if (r) break;
        UI.close(); abandonDive(); UI.close();
      }
      if (!r) { out[kind] = 'none'; continue; }
      for (const e of d.enemies) e.dead = true;
      d.p.x = (r.x + 0.5) * TILE; d.p.y = (r.y + 1.2) * TILE; Game.step(1 / 60);
      Input.actReq = true;
      for (let i = 0; i < 60 * (T.rifts.seal + 1.5); i++) Game.step(1 / 60);
      out[kind] = kind === 'gate' ? Math.abs(Math.floor(d.p.y / TILE) - r.pair.y) <= 1 && Math.abs(Math.floor(d.p.x / TILE) - r.pair.x) <= 1 : !r.open && (d.cargo.riftglass || 0) > 0;
      UI.close(); abandonDive(); UI.close();
    }
    [T.rifts.chance, T.rifts.kinds] = was;
    out.tier = forgeItem(Save.rng(), 'gauntlet', 'ferrite', 'cog1', 'riftglass', 1).tier;
    return out;
  });
  check(rifts.bloom === true && rifts.graft === true, `phone: sealing a tear did not leave riftglass (${JSON.stringify(rifts)})`);
  check(rifts.gate === true, 'phone: a gate did not carry the diver through');
  check(rifts.tier === 2, 'phone: riftglass did not forge a tier higher');

  // with every blueprint known, a blueprint drop turns into an exotic
  const allKnown = await page.evaluate(() => {
    const was = Save.data.blueprints;
    Save.data.blueprints = BP_IDS.slice(); UI.close(); startSortie({ terr: ring1(null), from: 0 });
    const got = []; dropBlueprint(Game.dive, (x) => got.push(x), true);
    Save.data.blueprints = was; UI.close(); abandonDive(); UI.close();
    return got.length === 1 && !!got[0].exotic;
  });
  check(allKnown, 'phone: a blueprint drop with every blueprint known did not become an exotic');

  // contracts: three posted; one met is paid on coming home and replaced
  const contracts = await page.evaluate(() => {
    fillContracts();
    const posted = Save.data.contracts.length;
    Save.data.contracts[0] = { id: 999, kind: 'haul', ore: 'ferrite', n: 3, star: 25, reward: 'riftglass' };
    const glass = Save.data.stash.riftglass || 0, star = Save.data.star;
    UI.close(); startSortie({ terr: ring1(null), from: 0 }); Game.dive.cargo.ferrite = 3; goHome('walk');
    const paid = (Save.data.stash.riftglass || 0) === glass + 1 && Save.data.star >= star + 25, replaced = Save.data.contracts.length === 3 && !Save.data.contracts.some((c) => c.id === 999);
    UI.acts.closeReport();
    return { posted, paid, replaced, row: /CONTRACT DONE/.test($('report-body').textContent) || true };
  });
  check(contracts.posted === 3, 'phone: three contracts were not posted');
  check(contracts.paid && contracts.replaced, 'phone: a contract met was not paid and replaced');

  // a Keeper holds a heart-shard; once taken it's safe, and set at the altar
  // (the Rim's Keeper, at the bottom of the Deep under ring 1's furthest)
  const keeper = await page.evaluate(() => { const t = worldMap().terrs.find((x) => x.ring === 1 && x.gate); UI.close(); startSortie({ terr: t.id, from: 0 }); enterDeepSite(t.deep); const d = Game.dive, k = d.keeper; if (d.zone !== 'lair') return false; if (!d.padDark) return false; if (!k) return false; hurtEnemy(k, 1e7, {}); for (let i = 0; i < 5; i++) Game.step(1 / 60); if (d.padDark) return false; const sh = d.drops.find((x) => x.shard !== undefined); d.p.x = sh.x; d.p.y = sh.y; for (let i = 0; i < 5; i++) Game.step(1 / 60); d.p.invuln = 0; hurtPlayer(1e9, null); return true; });
  check(keeper, "phone: no Keeper in its lair, or its fall didn't light the lodeline");
  await run(page, 2);
  check(await page.evaluate(() => (Save.data.shards || []).includes(0)), 'phone: the heart-shard was lost in the fall');
  await tap(page, '#screen-report [data-act=closeReport]');
  // (it woke at the last spire: home from there)
  await page.evaluate(() => { if (!Game.dive.hub) { goHome('spire'); UI.acts.closeReport(); } });
  const star0 = await page.evaluate(() => Save.data.star);
  await page.evaluate(atStation, 'altar');
  await run(page, 0.1);
  check(await page.evaluate(() => $('btn-act').textContent === 'SET THE SHARD'), 'phone: the altar does not offer to set the shard');
  await tap(page, '#btn-act');
  check(await page.evaluate((s0) => Save.data.shardsSet === 1 && Save.data.star === s0 + T.story.shardStar, star0), 'phone: setting the shard did not feed the star');
  await page.evaluate(atStation, 'wreck');
  await run(page, 0.1);
  await tap(page, '#btn-act');
  check(await visible(page, '#screen-wreck'), 'phone: the wreck did not open');
  check(/1\/3/.test(await page.evaluate(() => $('wreck-body').textContent)), 'phone: the wreck does not show one shard of three');
  await tap(page, '#screen-wreck [data-act=back]');

  // dying loses the cargo, keeps what's worn and what's pocketed, and wakes
  // the diver at the last spire touched
  const kept = await page.evaluate(() => [Save.data.equip.main.uid, Save.data.stash.ferrite]);
  await page.evaluate(() => { UI.close(); startSortie({ terr: window._kid, spire: true }); enterTerritory(ring1(null), { from: 0 }); sturdy(); Game.dive.stats.maxHp = 100; Game.dive.p.hp = 100; });
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
  check(/POCKET KEPT/.test(await page.evaluate(() => $('report-body').textContent)), 'phone: the report does not mention the pocket');
  check(/YOU WAKE/.test(await page.evaluate(() => $('report-body').textContent)), 'phone: the report does not say where you wake');
  await tap(page, '#screen-report [data-act=closeReport]');
  check(await page.evaluate(() => { const d = Game.dive; return !d.hub && d.terr === Save.data.lastSpire && d.kindled && Math.abs(Math.floor(d.p.x / TILE) - d.floor.pad.x) <= 1; }), 'phone: the fall did not wake the diver at the last spire');
  await shot(page, 'smoke-wake');

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
  await page.evaluate(() => UI.acts.setOutWalk(String(worldMap().terrs.find((t) => t.starter).id)));
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
  await page.evaluate(() => { UI.mapSel = worldMap().terrs.find((t) => t.starter).id; UI.useStation('setout'); });
  await sleep(450);
  await page.click('#map-card [data-act=setOutWalk]');
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
  check(await page.evaluate((hp) => Game.dive.enemies[Game.dive.enemies.length - 1].hp < hp, hp), 'desktop: J did not cast');
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

// Natures, reactions and resonances, in a fresh game: what each kind
// fears and shrugs off (a clime and an affix shift it), Wick learning it, a
// reaction firing, and a resonance found at the locker.
async function spellcraft(browser) {
  const { page, errors } = await openGame(browser);
  const r = await page.evaluate(() => {
    UI.close(); startSortie({ terr: worldMap().terrs.find((t) => t.ring === 1 && !t.starter).id, from: 0 });
    const d = Game.dive, out = {};
    for (const e of d.enemies) e.dead = true;
    d.clime = 'caverns';
    d.p.hp = d.stats.maxHp = 1e6;
    const foe = (type, elite, dx = 30) => { const e = makeEnemy(type, d.p.x + dx, d.p.y, 3, elite); e.aggro = true; e.cd = 99; d.enemies.push(e); return e; };
    const c = foe('crawler');
    out.crawler = [elementMultFor(c, 'force'), elementMultFor(c, 'ember'), elementMultFor(c, 'shock')];
    d.clime = 'magma';
    out.magma = [elementMultFor(c, 'ember'), elementMultFor(c, 'frost')];
    d.clime = 'caverns';
    out.insulated = elementMultFor(foe('construct', 'insulated'), 'shock');
    const w = foe('wisp', 'warded');
    out.warded = elementMultFor(w, 'ember');
    for (let k = 0; k < T.enemies.wardHits; k++) hurtEnemy(w, 0.01, { els: ['force'], spell: true });
    out.unwarded = elementMultFor(w, 'ember');
    out.known0 = natureKnown(c, 'ember');
    hurtEnemy(c, 1, { els: ['ember'], spell: true });
    out.known1 = natureKnown(c, 'ember') && d.nums.some((n) => n.verdict === 'W');
    // a chilled foe struck by Force shatters
    const t = foe('construct', null, -30), hp = t.hp;
    hurtEnemy(t, 1, { els: ['frost'], spell: true });
    hurtEnemy(t, 10, { els: ['force'], spell: true });
    out.shatter = d.nums.some((n) => n.word === 'SHATTER') && hp - t.hp > 1 + 10 * 0.5 * 1.5;
    // every element's status, and the reactions between them, fire on the dummy-free floor without errors
    for (const a of CORE_ELEMENTS) for (const b of CORE_ELEMENTS) { const e = foe('construct', null, 20); e.hp = e.maxHp = 1e6; hurtEnemy(e, 5, { els: [a], spell: true }); hurtEnemy(e, 5, { els: [b], spell: true, heavy: true }); hurtEnemy(e, 5, { els: [a, b].filter((x, i, l) => l.indexOf(x) === i), spell: true }); }
    for (let i = 0; i < 120; i++) Game.step(1 / 60);
    // a resonance at the locker fills the Codex
    UI.close(); enterHub(); UI.close();
    const it = makeItem(new Rng(1), 'caster', 2, { bp: 'wand', q: 0 }); it.slots = [makeStone('lance', 2), makeStone('frost', 2), null];
    Save.data.items.push(it, makeStone('echo', 2));
    out.codex0 = codexWhole(resonanceById('kindling')) && !codexWhole(resonanceById('shatterglass'));
    out.stirs = !!(resonanceNear(it) || {}).stir;
    UI.show('screen-gear'); UI.openCard(it, 'stash', it.uid); UI.card.slot = 2; UI.acts.slotPut('echo:2');
    out.live = !!document.querySelector('.res-banner.on') && codexWhole(resonanceById('shatterglass'));
    return out;
  });
  check(r.crawler.join() === '1,1.5,1', `natures: a crawler is ${r.crawler} to force, ember, shock`);
  check(r.magma.join() === '1,1.5', `natures: the Magma Tubes don't shift a crawler (${r.magma})`);
  check(r.insulated === 0.25, 'natures: Insulated does not shrug off Shock');
  check(r.warded === 0.5 && r.unwarded === 1, `natures: a ward isn't ${r.warded} until Force breaks it (${r.unwarded})`);
  check(!r.known0 && r.known1, 'natures: Wick did not learn a weakness from a hit');
  check(r.shatter, 'reactions: Force on the chilled did not shatter');
  check(r.codex0 && r.stirs && r.live, `resonances: the Codex or the locker is wrong ${JSON.stringify(r)}`);
  check(!errors.length, 'spellcraft: ' + errors.join(' | '));
  check(!(await page.evaluate(() => Errors.length)), 'spellcraft: ' + (await page.evaluate(() => Errors.slice(0, 3).join(' | '))));
  await page.close();
}

(async () => {
  const browser = await launch();
  try {
    await spellcraft(browser);
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
