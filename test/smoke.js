'use strict';
// The whole loop through the real controls. On a phone, upright: the
// outpost, the portal's world map and a territory's card, walking out into
// it with the joystick, an Arc at an enemy, mining with MINE held, a vein
// the pick is too weak for, crossing an edge into the neighbour, pausing,
// the cargo screen, lighting the waystones and planting a spire, banking
// at it and travelling home with the haul in the stash; a module caught
// and tethered in; the forge's research and recipes, equipping the rig
// frame it makes (the cores move across), socketing a module, an upgrade
// at the tuning bench, cores set in the rig's spells; an old save's gear
// turned into bases, modules and the rig; feeding the star the
// light of deeds (held at the altar), supplies made at the fabricator and
// from the cargo, and used from their two buttons on the deck, the Refinery
// upgraded; the star's reach; your light running out, a recall that loses
// nothing, tools, the Drone Bay built and coming down to its
// plot, Wick's Scanner fitted, turned off and on, and pinging out in the
// land, rifts, a Deep, a Keeper; then a fall that
// leaves the whole cargo in a pack where it fell (not what's worn), wakes at
// the last spire, and the pack recovered. What's next, at the portal and
// over the view at home. START OVER asks first, then wipes all but the
// settings and opens on the landing again. An older save's star is
// rescaled; an older save's pocket, contracts and supplies are converted.
// Held sideways, the decks sit either side of the view. Opened again with
// a sortie under way, the loading builds its territory and CARRY ON is
// there at once. On a desktop: WASD,
// J to cast, Space to mine, Esc to pause. No page errors anywhere;
// screenshots go to test/out/.
const { launch, openGame: openFresh, shot, finish, PHONE, DESKTOP } = require('./lib');

// Every page plays the same world (its seed is otherwise random), so what
// the checks find in it is the same every run: all of this one's ring 1
// borders the outpost, with waystones, tears and a Deep among it.
const SMOKE_WORLD = 5;
async function openGame(browser, opts) {
  // (everything awake, no tutorial or walkthrough waiting: the
  // onboarding's own checks open the game without this)
  const g = await openFresh(browser, Object.assign({ onboard: 'all' }, opts));
  await g.page.evaluate((seed) => { Save.data.world = freshWorld(seed); }, SMOKE_WORLD);
  return g;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T_RECALL = 4; // seconds; T.leave.recall
const T_REFUND = 5; // T.supplies.refund
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
  // a fresh game opens on the opening, and SKIP INTRO ends it
  check(await visible(page, '#intro') && await page.evaluate(() => Intro.on && Game.modal === 'intro'), 'phone: a fresh game did not open on the opening');
  await shot(page, 'smoke-intro');
  await tap(page, '#intro-skip');
  await run(page, 0.05);
  check(!(await visible(page, '#intro')), 'phone: SKIP INTRO did not end the opening');
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
  // the star's altar stands in the way: the Kindler stops in front of it, not in it
  await page.evaluate(() => { Input.bot = { x: 0, y: -1 }; for (let i = 0; i < 90; i++) Game.step(1 / 60); Input.bot = null; });
  check(await page.evaluate(() => { const a = HUB_STATIONS.find((s) => s.id === 'altar'), d = Game.dive; return Math.abs(d.p.x - (a.x + 0.5) * TILE) > 12 || d.p.y > (a.y + 0.5) * TILE + 4; }), 'phone: the Kindler walked into the altar');
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

  // the joystick walks (away from the opening it came in by: the real loop
  // steps too while the thumb is down, and walking back out of it would
  // go home)
  await page.evaluate(calm);
  const before = await page.evaluate(() => [Game.dive.p.x, Game.dive.p.y]);
  const [lx, ly] = await center(page, '#deck-left');
  const inward = await page.evaluate(() => { const e = Game.dive.floor.exits.find((x) => x.to === 0); return e ? [e.nx, e.ny] : [1, 0]; });
  await page.touchscreen.touchStart(lx, ly);
  for (let i = 1; i <= 5; i++) await page.touchscreen.touchMove(lx + i * 8 * inward[0], ly + i * 8 * inward[1]);
  check(await visible(page, '#stick-base'), 'phone: no joystick under the thumb');
  await run(page, 0.6);
  await page.touchscreen.touchEnd();
  const after = await page.evaluate(() => [Game.dive.p.x, Game.dive.p.y]);
  const moved = Math.hypot(after[0] - before[0], after[1] - before[1]);
  check(moved > 4 || (await page.evaluate(() => rockAt(Game.dive.floor, Game.dive.p.x + 8, Game.dive.p.y))), `phone: the joystick didn't walk (${before} → ${after})`);

  // spell A's button is the Scrap Rig's Arc, and it hurts an enemy
  // beside the diver
  check(await page.evaluate(() => /ARC/.test($('btn-main').textContent) && /BOLT/.test($('btn-off').textContent)), 'phone: the hands\' buttons do not show ARC and BOLT');
  const hit = await page.evaluate(() => {
    const d = Game.dive, e = makeEnemy('crawler', d.p.x + 10, d.p.y, 1, null);
    e.aggro = true; d.enemies.push(e);
    // (kept by name: the dark may send another while the button is held)
    window._smokeCrawler = e;
    return e.hp;
  });
  await hold(page, '#btn-main', 0.5);
  const left = await page.evaluate(() => window._smokeCrawler.hp);
  check(left < hit, `phone: ARC didn't hurt the crawler beside it (${hit} → ${left})`);
  await shot(page, 'smoke-fight');
  await page.evaluate(calm);

  // mining a vein the cutter can break, with MINE held
  const tier = await page.evaluate(standByOre, 'ok');
  check(tier === 1, `phone: no tier-1 ore beside open ground (found ${tier})`);
  await run(page, 0.1);
  check(await page.evaluate(() => !!Game.dive.target), 'phone: standing at the ore, nothing is targeted');
  await hold(page, '#btn-mine', 1.4);
  const cargo = await page.evaluate(() => cargoCount(Game.dive));
  check(cargo >= 1, 'phone: holding MINE broke no ore');
  await shot(page, 'smoke-mining');
  check(await page.evaluate(() => terrState(Game.dive.terr).mined.length >= 1), 'phone: the vein mined was not remembered');

  // a vein the cutter is too weak for says so and yields nothing
  if ((await page.evaluate(standByOre, 'weak')) > 1) {
    await page.evaluate(() => { Input.bot = { mine: true }; });
    await run(page, 2);
    await page.evaluate(() => { Input.bot = null; });
    check(/can't break/.test(await page.evaluate(() => $('toasts').textContent)), 'phone: a weak cutter said nothing');
    check((await page.evaluate(() => cargoCount(Game.dive))) === cargo, 'phone: a weak cutter still mined');
  }

  // walking off the edge: the view closes, and the diver comes in at the
  // neighbour's opening back, with the cargo
  const cross = await page.evaluate(() => { sturdy(); const d = Game.dive, e = d.floor.exits.find((x) => x.to !== 0); d.p.x = (e.ax + 0.5) * TILE; d.p.y = (e.ay + 0.5) * TILE; Input.bot = { x: -e.nx, y: -e.ny }; return { from: d.terr, to: e.to }; });
  await run(page, 1.6);
  await page.evaluate(() => { Input.bot = null; });
  await run(page, 0.8);
  check(await page.evaluate((c) => { const d = Game.dive, e = d.floor.exits.find((x) => x.to === c.from); return d.terr === c.to && !!e && dist(d.p.x, d.p.y, (e.ax + 0.5) * TILE, (e.ay + 0.5) * TILE) < 3 * TILE; }, cross), 'phone: walking off the edge did not cross into the neighbour, at the opening back');
  check(await page.evaluate(() => cargoCount(Game.dive)) === cargo, 'phone: the cargo did not come along');
  // the sortie is saved, and comes back in the same place, the same map
  check(await page.evaluate(() => { const d = Game.dive, r = JSON.parse(JSON.stringify(Save.data.run)); Save.data.run = r; resumeRun(); return Game.dive.terr === d.terr && floorHash(Game.dive.floor) === floorHash(d.floor) && cargoCount(Game.dive) === cargoCount(d); }), 'phone: the sortie did not survive a resume');
  await page.evaluate((id) => { const d = Game.dive; d.pull = 1; enterTerritory(id, { from: 0 }); }, dark);
  await page.evaluate(calm);

  // pausing stops the world; CARGO shows what's carried (no limit, nothing
  // to pocket or salvage out there)
  await tap(page, '#btn-pause');
  check(await visible(page, '#screen-pause'), 'phone: II did not pause');
  const t0 = await page.evaluate(() => Game.dive.time);
  await run(page, 0.5);
  check(await page.evaluate((t0) => Game.dive.time === t0, t0), 'phone: the dive ran on while paused');
  await tap(page, '#pause-resume');
  check(!(await page.evaluate(() => Game.modal)), 'phone: RESUME did not close the pause');
  await page.evaluate(() => { Game.dive.items.push(makeModule(new Rng(5), 'caster', 2, { rarity: 'rare', src: { foe: 'wisp', clime: 'badlands' } })); Game.dive.items.push(makeBase('plate', 1)); Game.dive.items.push(makeModule(new Rng(7), 'charm', 1, { rarity: 'magic' })); });
  await tap(page, '#btn-cargo');
  check(await visible(page, '#screen-cargo'), 'phone: CARGO did not open');
  check(await page.evaluate(() => document.querySelectorAll('#cargo-body [data-act=cardCargo]').length === 3), 'phone: the found gear is not in the cargo');
  const charmMod = await page.evaluate(() => Game.dive.items.find((i) => i.kind === 'module' && i.fits === 'charm').uid);
  await tap(page, `#cargo-body [data-act=cardCargo][data-arg="${charmMod}"]`);
  check(/Caught from|charm/.test(await page.evaluate(() => $('card-body').textContent)), 'phone: a module card does not say what it is');
  check(await page.evaluate(() => !document.querySelector('#card [data-act=salvage]') && !document.querySelector('#card [data-act=pocket]')), 'phone: a module in the cargo can still be salvaged or pocketed');
  await tap(page, '#card [data-act=closeCard]');
  check(await page.evaluate(() => /CARRYING \d+/.test($('cargo-body').textContent) && !/POCKET|CONTRACT|LOSE \d|weighs/.test($('cargo-body').textContent)), 'phone: the cargo screen still speaks of the pocket, contracts, weight or loss');
  await page.evaluate(() => document.querySelector('#cargo-body .mag').scrollIntoView({ block: 'end' }));
  await shot(page, 'lean/cargo');
  await tap(page, '#screen-cargo [data-act=resume]');
  // a kill that leaves a module: its pattern caught in a crystal where it
  // fell, and taken, tethered in
  const caught = await page.evaluate(() => {
    UI.close();
    const d = Game.dive, was = T.modules.drop.foe, n0 = d.items.length;
    T.modules.drop.foe = 1;
    const e = makeEnemy('crawler', d.p.x + 30, d.p.y, 1); e.dead = false; d.enemies.push(e); killEnemy(e);
    T.modules.drop.foe = was;
    const dr = d.drops.find((x) => x.item && x.item.kind === 'module'), fx = d.fx.some((x) => x.kind === 'capture');
    if (!dr) return { dr: false };
    dr.x = d.p.x; dr.y = d.p.y;
    for (let i = 0; i < 40; i++) Game.step(1 / 60);
    return { dr: true, fx, got: d.items.length === n0 + 1 && d.items[d.items.length - 1].kind === 'module', src: d.items[d.items.length - 1].src && d.items[d.items.length - 1].src.foe };
  });
  check(caught.dr && caught.fx && caught.got && caught.src === 'crawler', `phone: a module was not caught and taken (${JSON.stringify(caught)})`);

  // an ancient forge forges from the cargo, and what it makes goes in it
  await page.evaluate(() => { const d = Game.dive; d.cargo.ferrite = 20; d.cargo.fiber1 = 3; d.fieldForge = { x: Math.floor(d.p.x / TILE), y: Math.floor(d.p.y / TILE) }; });
  await run(page, 0.05);
  check(await page.evaluate(() => $('btn-act').textContent === 'FORGE'), 'phone: no FORGE at an ancient forge');
  await tap(page, '#btn-act');
  await run(page, 0.05);
  check(await page.evaluate(() => $('forge-title').textContent === 'AN ANCIENT FORGE'), 'phone: the ancient forge did not open');
  await tap(page, '#forge-body [data-act=forgeTab][data-arg=charm]');
  await tap(page, '#forge-body [data-act=forgeBp][data-arg=charm]');
  await tap(page, '#forge-body [data-act=craft]');
  check(await visible(page, '#screen-anvil'), 'phone: forging did not go to the anvil');
  for (let k = 0; k < 3; k++) { await run(page, 0.4); await page.evaluate(() => Anvil.strike()); }
  await run(page, 0.8);
  check(await visible(page, '#screen-reveal'), 'phone: the forged piece was not revealed');
  await run(page, 2.5);
  check(await page.evaluate(() => Game.dive.items.some((i) => i.kind === 'charm') && Game.dive.cargo.ferrite === 20 - BLUEPRINTS.charm.ore && Game.dive.cargo.fiber1 === 1), 'phone: the ancient forge did not use the cargo, or the charm is not in it');
  await page.evaluate(() => { UI.closeCard(); UI.close(); Game.dive.fieldForge = null; });
  const carried = await page.evaluate(() => cargoCount(Game.dive));

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
    stones.push(await page.evaluate(() => { const d = Game.dive, s = d.floor.stones[d.hold ? d.hold.k : 0]; return [(terrState(d.terr).lit || []).length, !!d.hold, d.channel ? 'channel' : '', Game.modal || '', $('toasts').textContent.slice(-60), Math.round(d.p.x), Math.round(d.p.y), $('btn-act').textContent]; }));
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
  // its heart's light, bound to the Kindler and saved at once
  check(await page.evaluate(() => Save.data.stash.heartlight === T.deeds.heart[1] && JSON.parse(localStorage.getItem('lodestar.save.v4')).stash.heartlight === T.deeds.heart[1]), 'phone: kindling did not give its heartlight, saved at once');
  await run(page, 0.3);
  await shot(page, 'smoke-kindled');
  // a spire banks the haul (a channel moving breaks) and feeds the star
  const carriedNow = await page.evaluate(() => cargoCount(Game.dive));
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
  // (the first BANK's light woke whatever was in earshot; a hit landing
  // holds the world still, which a fixed wait doesn't allow for: this part
  // isn't about fighting, so the floor is cleared and the channel stepped
  // until it ends)
  await page.evaluate(() => { sturdy(); Game.hitstop = 0; });
  await page.evaluate(standOn, 'pad');
  await run(page, 0.1);
  await tap(page, '#btn-act');
  await page.evaluate(() => { let i = 0; for (; i < 240; i++) { Game.step(1 / 60); if (i > 0 && !Game.dive.channel) break; } window._bankSteps = i; Game.render(); });
  const banked = await page.evaluate(() => [Object.entries(Save.data.stash).filter(([k]) => !isLight(k)).reduce((a, [, b]) => a + b, 0) + Save.data.items.length, JSON.parse(localStorage.getItem('lodestar.save.v4')), Save.data.star, cargoCount(Game.dive), Game.dive.hub]);
  // (when it fails: what the page was doing instead)
  const why = await page.evaluate(() => { const d = Game.dive, t = d.floor.pad; return JSON.stringify({ steps: window._bankSteps, modal: Game.modal, channel: d.channel, act: $('btn-act').textContent, off: t && [d.p.x - (t.x + 0.5) * TILE, d.p.y - (t.y + 0.5) * TILE].map((v) => +v.toFixed(1)), hp: d.p.hp, dying: d.dying, foes: d.enemies.filter((e) => !e.dead).length, toasts: $('toasts').textContent.slice(-120) }); });
  check(banked[0] === carriedNow && banked[3] === 0 && !banked[4], `phone: banked ${banked[0]} of ${carriedNow}, ${banked[3]} left, still out: ${!banked[4]} ${why}`);
  check(banked[1].items.length === 5, `phone: the found gear was not banked and saved (${banked[1].items.length})`);
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
  // the star grows only when it's fed the light, at the altar
  const fedHome = await page.evaluate(() => Save.data.star);
  check(fedHome === 0, `phone: coming home fed the star ${fedHome} by itself`);
  check(/heartlight/.test(await page.evaluate(() => $('report-body').textContent)), 'phone: the report does not mention the heartlight earned');
  await shot(page, 'smoke-report');
  await tap(page, '#screen-report [data-act=closeReport]');
  check(await page.evaluate(() => Game.dive.hub && !Game.modal), 'phone: CONTINUE did not come back to the outpost');

  // the forge: what's new is studied first (a cog: the Quicken core);
  // then three strikes on the anvil, the reveal, the card
  await page.evaluate(() => { Save.data.stash.ferrite = 40; Save.data.stash.cog1 = 2; });
  await page.evaluate(atStation, 'forge');
  await run(page, 0.05);
  check(await page.evaluate(() => $('btn-act').textContent === 'FORGE'), 'phone: no FORGE at the forge');
  await tap(page, '#btn-act');
  await run(page, 0.05);
  check(await visible(page, '#screen-research') && await page.evaluate(() => Save.data.blueprints.includes('glyph_quicken') && /Quicken/.test($('research-body').textContent)), 'phone: the forge did not study the cog');
  await sleep(1200);
  await shot(page, 'smoke-research');
  await tap(page, '#research-body [data-act=researchDone]');
  check(await visible(page, '#screen-forge'), 'phone: the research did not go on to the forge');
  await tap(page, '#forge-body [data-act=forgeTab][data-arg=caster]');
  await tap(page, '#forge-body [data-act=forgeBp][data-arg=rig]');
  await tap(page, '#forge-body [data-act=forgeOre][data-arg=ferrite]');
  await shot(page, 'smoke-forge');
  check(await page.evaluate(() => new RegExp(BLUEPRINTS.rig.ore + ' Ferrite').test($('forge-body').textContent) && /2 creature parts/.test($('forge-body').textContent) && /1 socket/.test($('forge-body').textContent) && /1 Mod slot/.test($('forge-body').textContent) && /FRAMES/.test($('forge-body').textContent) && !/CASTERS|Wand|Staff|Gauntlet/.test($('forge-body').textContent)), 'phone: the rig frame\'s recipe does not say what it costs and makes');
  const parts0 = await page.evaluate(() => partsHave(Save.data.stash, 'any'));
  await tap(page, '#forge-body [data-act=craft]');
  check(await page.evaluate((p0) => Save.data.stash.ferrite === 40 - BLUEPRINTS.rig.ore && partsHave(Save.data.stash, 'any') === p0 - 2, parts0), 'phone: forging a rig frame did not cost its Ferrite and 2 creature parts');
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
  check(await page.evaluate(() => Save.data.equip.main.name !== 'Scrap Rig' && Save.data.items.some((i) => i.name === 'Scrap Rig')), 'phone: the forged frame is not the rig worn');
  check(await page.evaluate(() => { const g = Save.data.equip.main, want = recipePreview('rig', 1, g.q); return !g.affixes.length && g.sockets.length === want.sockets.length && g.base.power === want.base.power && rigMods(g) === rigMods(want); }), 'phone: the forged frame is not what its recipe said');
  check(await page.evaluate(() => spellName(Save.data.equip.main.spells[0]) === 'ARC' && spellName(Save.data.equip.main.spells[1]) === 'BOLT'), 'phone: the empty frame did not take the old one\'s cores');
  await tap(page, '#screen-forge [data-act=back]');

  // the locker: a module socketed into what's worn, free, and its traits
  // in the stats; the modules move across when the base is replaced
  const mod = await page.evaluate(() => { const m = makeModule(new Rng(11), 'caster', 1, { rarity: 'rare', src: { foe: 'construct', clime: 'badlands' } }); Save.data.items.push(m); Save.data.stash.thread = 30; Save.data.stash.lumenite = 20; return m.uid; });
  await page.evaluate(atStation, 'locker');
  await run(page, 0.05);
  await tap(page, '#btn-act');
  await run(page, 0.05);
  await tap(page, '#gear-body [data-act=cardEquip][data-arg=main]');
  await tap(page, '#card [data-act=sockPick][data-arg="0"]');
  await shot(page, 'smoke-sockets');
  const feSock = await page.evaluate(() => Save.data.stash.ferrite);
  await tap(page, `#card [data-act=sockPut][data-arg="${mod}"]`);
  check(await page.evaluate(([uid, fe]) => Save.data.equip.main.sockets[0] && String(Save.data.equip.main.sockets[0].uid) === String(uid) && Save.data.stash.ferrite === fe && Save.data.stash.thread === 30, [mod, feSock]), 'phone: socketing a module was not free, or it is not in the socket');
  check(await page.evaluate(() => { const m = Save.data.equip.main.sockets[0], st = computeStats(Save.data.equip, Save.data.attune); return m.affixes.every((a) => st[a.id] >= a.v); }), 'phone: a socketed module\'s traits are not in the stats');
  await tap(page, '#card [data-act=closeCard]');
  await shot(page, 'smoke-gear');
  await tap(page, '#screen-gear [data-act=back]');

  // the tuning bench: a tier up, paid in threads and ore; no reroll, fuse
  // or imprint
  await page.evaluate(atStation, 'runes');
  await run(page, 0.05);
  check(await page.evaluate(() => $('btn-act').textContent === 'TUNE'), 'phone: no TUNE at the tuning bench');
  await tap(page, '#btn-act');
  await run(page, 0.05);
  check(await visible(page, '#screen-bench'), 'phone: the tuning bench did not open');
  await tap(page, `#bench-body [data-act=benchMod][data-arg="${mod}"]`);
  await shot(page, 'smoke-bench');
  check(await page.evaluate(() => !document.querySelector('#card [data-act=modReroll], #card [data-act=modFuse], #card [data-act=modImprint], #card [data-act=modEnrich]') && /UPGRADE · TIER 2/.test($('card-body').textContent) && /Threads \+ 10 Lumenite/.test($('card-body').textContent)), 'phone: the bench offers more than UPGRADE, or its cost does not name its resources');
  const tier0 = await page.evaluate(() => Save.data.equip.main.sockets[0].tier);
  await tap(page, '#card [data-act=modUpgrade]');
  check(await page.evaluate((t) => Save.data.equip.main.sockets[0].tier === t + 1 && Save.data.stash.lumenite === 20 - T.modules.upgrade.ore && Save.data.stash.thread === 30 - T.modules.upgrade.threads[1], tier0), 'phone: the upgrade did not raise the tier for threads and Lumenite');
  await tap(page, '#card [data-act=closeCard]');
  await tap(page, '#screen-bench [data-act=back]');

  // the locker: cores set in spell B's parts from the drawer, free, and
  // its name and cost follow them
  const fe0 = await page.evaluate(() => { Save.data.items.push(makeStone('shock', 1), makeStone('split', 1)); return Save.data.stash.ferrite; });
  await page.evaluate(atStation, 'locker');
  await run(page, 0.05);
  await tap(page, '#btn-act');
  await run(page, 0.05);
  await tap(page, '#gear-body [data-act=cardEquip][data-arg=main]');
  check(await visible(page, '#card .spell'), 'phone: the rig\'s card shows no spells');
  await tap(page, '#card [data-act=partPick][data-arg="1:el"]');
  check(await page.evaluate(() => !document.querySelector('#card [data-act=partPut][data-arg^="split:"]')), 'phone: the drawer for an Element offers a Mod');
  await tap(page, '#card [data-act=partPut][data-arg="shock:1"]');
  await tap(page, '#card [data-act=partPick][data-arg="1:m0"]');
  await tap(page, '#card [data-act=partPut][data-arg="split:1"]');
  const circ = await page.evaluate(() => [spellName(Save.data.equip.main.spells[1]), spellCost(Save.data.equip.main.spells[1]), $('card-body').textContent, Save.data.stash.ferrite, Math.round(T.circuits.forms.bolt.cost * T.circuits.glyphs.split.cost * 10) / 10]);
  check(circ[0] === 'BOLT · SHOCK · SPLIT', `phone: setting cores gave spell B ${circ[0]}`);
  check(circ[1] === circ[4] && circ[2].includes(`BOLT · SHOCK · SPLIT`) && circ[2].includes(`${circ[4]} charge`), 'phone: the spell\'s name or cost did not follow its cores');
  check(circ[3] === fe0, 'phone: setting cores cost something');
  await shot(page, 'smoke-rig');
  await tap(page, '#card [data-act=partPick][data-arg="1:el"]');
  await tap(page, '#card [data-act=partPick][data-arg="1:el"]');
  check(await page.evaluate(() => !Save.data.equip.main.spells[1].el && Save.data.items.some((x) => x.stone === 'shock')), 'phone: tapping a chosen part again did not empty it');
  await tap(page, '#card [data-act=closeCard]');
  await tap(page, '#screen-gear [data-act=back]');

  // feeding the star at the altar: held, mote after mote of light rises
  // into it, deeplight first; let go and it stops; a long hold gives it all
  await page.evaluate(() => { Save.data.stash.heartlight = 20; Save.data.stash.deeplight = 6; Save.data.star = 0; Save.data.magSeen = 1; });
  await page.evaluate(atStation, 'altar');
  await run(page, 0.05);
  check(await page.evaluate(() => /^(FEED THE STAR|HOLD TO FEED)/.test($('btn-act').textContent) && ($('btn-act').classList.contains('hold') || !lightWaiting()) && !$('btn-act2').hidden && /^ATTUNE/.test($('btn-act2').textContent)), 'phone: no hold-to-feed and ATTUNE at the altar');
  await hold(page, '#btn-act', 0.8);
  await run(page, 0.05);
  const fed = await page.evaluate(() => { const s = Save.data; return [6 - (s.stash.deeplight || 0), s.star, s.stash.heartlight, !!Game.dive.feed, (Game.dive.feedMotes || []).length]; });
  check(fed[0] > 0 && fed[1] === fed[0] && fed[2] === 20, `phone: a short hold gave ${fed[0]} deeplight for ${fed[1]} points (and heartlight left ${fed[2]})`);
  check(!fed[3], 'phone: feeding the star did not stop on letting go');
  await run(page, (await page.evaluate(() => T.star.feed.fly)) + 0.3);
  check(await page.evaluate(() => !(Game.dive.feedMotes || []).length && JSON.parse(localStorage.getItem('lodestar.save.v4')).stash.deeplight === Save.data.stash.deeplight), 'phone: the light fed never reached the star, or the save missed it');
  await hold(page, '#btn-act', 0.5);
  await shot(page, 'smoke-feed');
  await hold(page, '#btn-act', 3);
  await run(page, 1.2);
  check(await page.evaluate(() => !Save.data.stash.heartlight && !Save.data.stash.deeplight && Save.data.star === 26 && magnitudeOf(Save.data.star) === 2), 'phone: a long hold did not give all the light, or the star did not grow');
  // ATTUNE opens the star's screen: the light, what grows it, its reach
  await tap(page, '#btn-act2');
  check(await visible(page, '#screen-star') && await page.evaluate(() => /REACH/.test($('star-body').textContent) && /ATTUNEMENTS/.test($('star-body').textContent) && !/WHAT GROWS IT/.test($('star-body').textContent)), 'phone: ATTUNE did not open the star, or it does not show its reach and attunements (what grows it is behind its ?)');
  await shot(page, 'smoke-star');
  await tap(page, '#screen-star [data-act=back]');

  // supplies: made from ore at the fabricator (SUPPLIES, beside FORGE)
  await page.evaluate(() => { Save.data.stash.ferrite = 40; Save.data.stash.lumenite = 20; Save.data.supplies = {}; });
  await page.evaluate(atStation, 'forge');
  await run(page, 0.05);
  check(await page.evaluate(() => $('btn-act2').textContent === 'SUPPLIES'), 'phone: no SUPPLIES at the fabricator');
  await tap(page, '#btn-act2');
  check(await visible(page, '#screen-supplies'), 'phone: SUPPLIES did not open');
  await tap(page, '#supplies-body [data-act=makeSupply][data-arg=injector]');
  await tap(page, '#supplies-body [data-act=makeSupply][data-arg=cell]');
  await shot(page, 'smoke-supplies');
  // (paid in the plainest ore there's enough of)
  check(await page.evaluate(() => Save.data.supplies.injector === 1 && Save.data.supplies.cell === 1 && Save.data.stash.ferrite === 40 - 2 * T.supplies.cost[0] && Save.data.stash.lumenite === 20), `phone: making supplies did not cost their ore (${await page.evaluate(() => JSON.stringify([Save.data.supplies, Save.data.stash.ferrite, Save.data.stash.lumenite]))})`);
  // with no Ferrite left, Lumenite pays, fewer of it
  await page.evaluate(() => { Save.data.stash.ferrite = 2; UI.redraw(); });
  await tap(page, '#supplies-body [data-act=makeSupply][data-arg=injector]');
  check(await page.evaluate(() => Save.data.supplies.injector === 2 && Save.data.stash.ferrite === 2 && Save.data.stash.lumenite === 20 - T.supplies.cost[1]), 'phone: a supply was not paid in the next ore up');
  // the Refinery: built, it makes both stronger; upgraded at SUPPLIES, more
  const ref = await page.evaluate(() => {
    const s = Save.data, p0 = [supplyPct('injector'), supplyPct('cell')];
    s.built = (s.built || []).concat('refinery'); s.landing = null;
    const p1 = [supplyPct('injector'), supplyPct('cell')];
    s.stash.resonite = 6; s.stash.thread = 50; s.star = Math.max(s.star, T.star.levels[2]);
    UI.redraw();
    return { p0, p1, row: /REFINERY · LEVEL 1\/3/.test($('supplies-body').textContent) };
  });
  check(ref.p0.join() === '35,30' && ref.p1.join() === '50,40' && ref.row, `phone: the Refinery does not strengthen supplies, or SUPPLIES does not show its level (${JSON.stringify(ref)})`);
  await shot(page, 'lean/supplies-refinery');
  await tap(page, '#supplies-body [data-act=upgradeRefinery]');
  check(await page.evaluate(() => refineryLevel() === 2 && supplyPct('injector') === 65 && supplyPct('cell') === 50 && !Save.data.stash.resonite && !Save.data.stash.thread && /LEVEL 2\/3/.test($('supplies-body').textContent)), 'phone: upgrading the Refinery did not cost its ore and threads, or did not strengthen supplies');
  await shot(page, 'lean/supplies-upgraded');
  await tap(page, '#screen-supplies [data-act=back]');
  // (and taken down again, for the checks of the forge's BUILDINGS below)
  await page.evaluate(() => { Save.data.built = Save.data.built.filter((id) => id !== 'refinery'); Save.data.refineryLv = 1; });

  // your light runs out in dark land, and the Hollow comes; kindled land
  // fills it again
  await page.evaluate((id) => UI.acts.setOutWalk(String(id)), await page.evaluate(ring1, null));
  const pulled = await page.evaluate(() => { sturdy(); const d = Game.dive; d.pull = 0.001; for (let i = 0; i < 30; i++) Game.step(1 / 60); return [d.pull, d.enemies.some((e) => e.type === 'hollow' && !e.dead), /out/.test($('toasts').textContent)]; });
  check(pulled[0] === 0 && pulled[1] && pulled[2], `phone: your light running out did not bring the Hollow (${pulled})`);
  await run(page, 0.3);
  await shot(page, 'smoke-hollow');
  // an emergency recall brings all of it home
  // (with light again, so the dark sends nothing to break the channel)
  await page.evaluate(() => { const d = Game.dive; for (const e of d.enemies) e.dead = true; d.pull = 1; d.cargo = { ferrite: 20 }; d.items = [makeBase('charm', 1)]; Save.data.stash.ferrite = 0; window._items0 = Save.data.items.length; });
  await tap(page, '#btn-pause');
  check(await page.evaluate(() => $('pause-recall').textContent === 'EMERGENCY RECALL' && $('pause-restart') && !$('pause-restart').hidden), 'phone: the pause screen does not have a plain EMERGENCY RECALL and START OVER');
  await shot(page, 'lean/pause-field');
  await tap(page, '#pause-recall');
  await run(page, T_RECALL + 0.3);
  check(await visible(page, '#screen-report'), 'phone: the recall did not come home');
  check(await page.evaluate(() => Save.data.stash.ferrite === 20 && Save.data.items.length === window._items0 + 1 && /RECALLED/.test($('report-title').textContent)), `phone: the recall did not bank everything (${await page.evaluate(() => Save.data.stash.ferrite)} Ferrite)`);
  await tap(page, '#screen-report [data-act=closeReport]');

  // tools: made once from the stash, one carried; the compass points to the
  // spire, or out of dark land towards lit land; the beacon calls a spire's
  // light down where none stands
  const tools = await page.evaluate(() => {
    const s = Save.data, was = s.star, lit = window._kid, dark = ring1(null);
    s.star = 3000; Object.assign(s.stash, { ferrite: 40, spore1: 5, ether2: 5, lumenite: 30, fiber3: 5, chitin1: 5, resonite: 20, cog2: 5 });
    s.blueprints.push('tool_lens'); s.stash.thread = 10;
    const made = TOOL_IDS.filter((id) => id !== 'compass').every((id) => makeTool(id));
    s.tool = 'compass'; UI.close(); startSortie({ terr: lit, spire: true });
    let d = Game.dive;
    for (let i = 0; i < 30; i++) Game.step(1 / 60);
    const points = !!d.compass && d.compass.home && d.compass.x === d.floor.pad.x;
    enterTerritory(dark, { from: 0 }); sturdy();
    for (let i = 0; i < 30; i++) Game.step(1 / 60);
    if (!d.compass) return { why: JSON.stringify({ modal: Game.modal, hit: Game.hitstop, warp: !!d.warp, tool: d.tool, terr: d.terr, dark, game: Game.dive === d, exits: d.floor.exits.length, t: d.toolT }) };
    const e = d.floor.exits.find((x) => x.x === d.compass.x && x.y === d.compass.y), out = !!e && (isKindled(e.to) || worldMap().terrs[e.to].nb.some(isKindled));
    UI.close(); goHome('walk'); UI.close();
    s.tool = 'beacon'; startSortie({ terr: lit, spire: true }); d = Game.dive;
    const refused = !plantBeacon();
    enterTerritory(dark, { from: 0 }); sturdy();
    const planted = refused && plantBeacon(), again = plantBeacon();
    for (let i = 0; i < 60 * (T.tools.beacon.land + 0.5); i++) { Game.step(1 / 60); for (const x of d.enemies) x.dead = true; }
    d.p.x = (d.beacon.x + 0.5) * TILE; d.p.y = (d.beacon.y + 0.5) * TILE; Game.step(1 / 60);
    const lands = actionHere() === 'extract' && $('btn-act').textContent === 'BANK';
    UI.close(); goHome('walk'); UI.close();
    s.star = was; s.tool = 'compass';
    return { made, points, out, planted, again, lands };
  });
  check(!tools.why, 'phone: no compass in dark land ' + tools.why);
  check(tools.made, 'phone: the tools could not be made');
  check(tools.points, 'phone: the compass did not point to the spire');
  check(tools.out, 'phone: in dark land the compass did not point towards lit land');
  check(tools.planted && !tools.again, 'phone: the beacon was not planted once, and only once (and refused by a spire)');
  check(tools.lands, "phone: the beacon did not land a spire's light to bank at");

  // the outpost's buildings and Wick's upgrades: the Drone Bay built at the
  // forge's BUILDINGS tab comes down to its plot once it's in view; walked
  // up to, Wick's Scanner is fitted there, turned off and on again; out in
  // the land it pings, and the veins near are marked
  await page.evaluate(() => {
    const s = Save.data; window._starWas = s.star; s.star = T.star.levels[2] + 1;
    Object.assign(s.stash, { ferrite: 60, lumenite: 20, thread: 60, spore1: 4 });
    UI.close(); enterHub(); UI.close(); researchStudy(); openForge(false);
  });
  await run(page, 0.5);
  await tap(page, '#forge-body [data-act=forgeTab][data-arg=structure]');
  const tab = await page.evaluate(() => (!document.querySelector('#forge-body [data-act=forgeBp][data-arg=wick_scan]') && !!document.querySelector('#forge-body [data-act=forgeTab][data-arg=structure].on') && document.querySelectorAll('#forge-body .bp i.made').length === 0) || JSON.stringify([Game.modal, UI.forge.bp, Save.data.built, Save.data.blueprints.filter((x) => /^(bld|wick)_/.test(x)), $('forge-body').textContent.slice(0, 200)]));
  check(tab === true, 'phone: the forge has no BUILDINGS tab ' + tab);
  await tap(page, '#forge-body [data-act=forgeBp][data-arg=bld_bay]');
  await tap(page, '#forge-body [data-act=craft]');
  const bay = await page.evaluate(() => {
    const s = Save.data, built = structureBuilt('bay') && s.landing === 'bay' && s.stash.thread === 60 - T.structures.bay.cost.thread;
    UI.close();
    // (its plot in view: it comes down, and stands)
    const d = Game.dive, p = d.floor.site.plots[0];
    d.p.x = (p.x + 0.5) * TILE; d.p.y = (p.y + 2.5) * TILE; Game.render();
    let down = false;
    for (let i = 0; i < 60 * (T.structures.land.time + 0.5); i++) { Game.step(1 / 60); if (i % 10 === 0) Game.render(); if (d.landing) down = true; }
    Game.render();
    return { built, down, stands: structureStands('bay') && !s.landing, drawn: hubProps(d).some((a) => a.structure === 'bay') };
  });
  check(bay.built, 'phone: the Drone Bay was not built from the stash');
  check(bay.down && bay.stands && bay.drawn, `phone: the Drone Bay did not come down to its plot (${JSON.stringify(bay)})`);
  await shot(page, 'smoke-dronebay');
  const atBay = await page.evaluate(() => {
    UI.close(); openForge(false);
    const noTab = !document.querySelector('#forge-body [data-act=forgeTab][data-arg=wick]');
    UI.close();
    const d = Game.dive, p = d.floor.site.plots[0];
    d.p.x = p.x * TILE; d.p.y = p.y * TILE + 14; Game.step(1 / 60);
    const here = actionHere() === 'bay' && $('btn-act').textContent === 'DRONE BAY';
    Input.actReq = true; Game.step(1 / 60);
    return { noTab, here, open: Game.modal === 'screen-forge' && $('forge-title').textContent === 'THE DRONE BAY' };
  });
  check(atBay.noTab && atBay.here && atBay.open, `phone: Wick is not fitted at the Drone Bay (${JSON.stringify(atBay)})`);
  await run(page, 0.5);
  await tap(page, '#forge-body [data-act=forgeBp][data-arg=wick_scan]');
  await tap(page, '#forge-body [data-act=craft]');
  check(await page.evaluate(() => wickOn('scan')), "phone: Wick's Scanner was not fitted");
  await tap(page, '#forge-body [data-act=wickToggle][data-arg=scan]');
  const off = await page.evaluate(() => !wickOn('scan') && wickFitted('scan'));
  await tap(page, '#forge-body [data-act=wickToggle][data-arg=scan]');
  check(off && (await page.evaluate(() => wickOn('scan'))), "phone: Wick's Scanner did not turn off and on at the Drone Bay");
  // the locker, from the top bar anywhere at home
  await page.evaluate(() => UI.close());
  await run(page, 0.5);
  await tap(page, '#btn-cargo');
  check(await page.evaluate(() => Game.modal === 'screen-gear' && $('btn-cargo').textContent === 'LOCKER'), 'phone: the top bar did not open the locker at home');
  const ping = await page.evaluate(() => {
    UI.close(); startSortie({ terr: ring1(null), from: 0 }); sturdy();
    const d = Game.dive, f = d.floor;
    // (beside a vein)
    for (let i = 0; i < f.tiles.length; i++) if (f.tiles[i] === TILE_ORE) { const x = i % f.w, y = Math.floor(i / f.w); if (!TILE_SOLID[floorTile(f, x, y + 1)]) { d.p.x = (x + 0.5) * TILE; d.p.y = (y + 1.5) * TILE; break; } }
    wickState(d).scanT = 0.01;
    for (let i = 0; i < 20; i++) Game.step(1 / 60);
    Game.render();
    const sc = d.wk.scan, out = { ping: !!sc, veins: sc ? sc.veins.length : 0 };
    UI.close(); goHome('walk'); UI.close();
    Save.data.star = window._starWas;
    return out;
  });
  check(ping.ping && ping.veins > 0, `phone: Wick's Scanner did not ping, marking the veins near (${JSON.stringify(ping)})`);

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
    // a vein broken down here stays broken when you come back down
    const vi = d.floor.tiles.findIndex((x) => x === TILE_ORE);
    if (vi >= 0) breakOre({ i: vi, tx: vi % d.floor.w, ty: Math.floor(vi / d.floor.w) }, T.ores[d.floor.ore[vi] - 1]);
    leaveDeep(); enterDeepSite(1);
    const kept = vi < 0 || d.floor.tiles[vi] !== TILE_ORE;
    const t = terrOf(id);
    while (d.deep.site < d.deep.of && d.ways.length) { enterDeepSite(d.deep.site + 1); }
    let up = true;
    if (d.zone !== 'lair') { sturdy(); const v = d.floor.ways[0]; d.p.x = (v.x + 0.5) * TILE; d.p.y = (v.y + 0.9) * TILE; Game.step(1 / 60); up = /BACK UP/.test($('btn-act').textContent); Input.actReq = true; for (let i = 0; i < 60; i++) Game.step(1 / 60); up = up && !d.deep && d.terr === id; }
    UI.close(); goHome('walk'); UI.close();
    return { down, inDeep, up, kept, sites: t.deep };
  });
  check(deep === 'none' || (deep.down && deep.inDeep && deep.up), `phone: the Deep did not lead down and back up (${JSON.stringify(deep)})`);
  check(deep === 'none' || deep.kept, 'phone: a vein mined in a Deep grew back on going down again');
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
        UI.close(); goHome('walk'); UI.close();
      }
      if (!r) { out[kind] = 'none'; continue; }
      for (const e of d.enemies) e.dead = true;
      d.p.x = (r.x + 0.5) * TILE; d.p.y = (r.y + 1.2) * TILE; Game.step(1 / 60);
      Input.actReq = true;
      for (let i = 0; i < 60 * (T.rifts.seal + 1.5); i++) Game.step(1 / 60);
      out[kind] = kind === 'gate' ? Math.abs(Math.floor(d.p.y / TILE) - r.pair.y) <= 1 && Math.abs(Math.floor(d.p.x / TILE) - r.pair.x) <= 1 : !r.open && (d.cargo.riftglass || 0) > 0;
      UI.close(); goHome('walk'); UI.close();
    }
    [T.rifts.chance, T.rifts.kinds] = was;
    out.tier = forgeItem('rig', 'ferrite', 'riftglass', 1).tier;
    return out;
  });
  check(rifts.bloom === true && rifts.graft === true, `phone: sealing a tear did not leave riftglass (${JSON.stringify(rifts)})`);
  check(rifts.gate === true, 'phone: a gate did not carry the diver through');
  check(rifts.tier === 2, 'phone: riftglass did not forge a tier higher');

  // a warden leaves two modules, rare or better, a tier above the floor's
  const warden = await page.evaluate(() => {
    UI.close(); startSortie({ terr: ring1(null), from: 0 });
    const d = Game.dive, e = makeEnemy('warden', d.p.x, d.p.y, 3); e.boss = true;
    const got = moduleDrops(d, e);
    UI.close(); goHome('walk'); UI.close();
    return got.length === T.modules.drop.boss && got.every((m) => ['rare', 'legendary', 'set'].includes(m.rarity) && m.src.foe === 'warden');
  });
  check(warden, 'phone: a warden did not leave its modules');

  // what's next: one goal, at the portal and over the view at home; and
  // the Settlers' Quarters bring threads each time home
  const next = await page.evaluate(() => {
    UI.close(); Game.step(1 / 60);
    const hud = !$('hud-goal').hidden && /NEXT/.test($('hud-goal').textContent) && $('hud-goal').textContent.length < 140;
    UI.useStation('setout');
    const portal = /NEXT/.test($('setout-body').textContent) && $('setout-body').querySelectorAll('.next-steps p').length === 1 && !/CONTRACT/.test($('setout-body').textContent);
    const goal = nextGoal();
    UI.close();
    const s = Save.data; s.built = (s.built || []).concat('quarters'); s.landing = null;
    const th = s.stash.thread || 0;
    startSortie({ terr: ring1(null), from: 0 }); goHome('walk');
    const paid = (s.stash.thread || 0) === th + T.structures.quarters.pay && /SETTLERS/.test($('report-body').textContent);
    UI.acts.closeReport();
    s.built = s.built.filter((id) => id !== 'quarters');
    return { hud, portal, goal, paid };
  });
  check(next.hud && next.portal && next.goal, `phone: no single next goal at the portal or over the view at home (${JSON.stringify(next)})`);
  check(next.paid, 'phone: the Settlers\' Quarters brought no threads home');
  await page.evaluate(() => { UI.close(); Game.step(1 / 60); Game.render(); });
  await shot(page, 'lean/home-next');
  await page.evaluate(() => UI.useStation('setout'));
  await sleep(450);
  await page.evaluate(() => { document.querySelector('#setout-body .next-steps').scrollIntoView({ block: 'center' }); });
  await shot(page, 'lean/portal-next');
  await page.evaluate(() => UI.close());

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

  // dying leaves the whole cargo, keeps what's worn, and wakes the diver at
  // the last spire touched
  const kept = await page.evaluate(() => [Save.data.equip.main.uid, Save.data.stash.ferrite]);
  await page.evaluate(() => { UI.close(); startSortie({ terr: window._kid, spire: true }); enterTerritory(ring1(null), { from: 0 }); sturdy(); Game.dive.stats.maxHp = 100; Game.dive.p.hp = 100; });
  await page.evaluate(() => { const d = Game.dive; d.cargo.ferrite = 9; d.items.push(makeRelic(1)); d.items.push(makeBase('charm', 1)); window._charms0 = Save.data.items.filter((i) => i.kind === 'charm').length; });
  await page.evaluate(() => { const d = Game.dive; d.p.invuln = 0; hurtPlayer(9999, null); });
  await run(page, 1);
  await shot(page, 'smoke-dying');
  await run(page, 1);
  check(await visible(page, '#screen-report'), 'phone: dying did not report');
  check(/YOU FELL/.test(await page.evaluate(() => $('report-title').textContent)), 'phone: the report does not say you fell');
  check(await page.evaluate(([w, fe]) => Save.data.equip.main.uid === w && Save.data.stash.ferrite === fe && !Save.data.items.some((i) => i.kind === 'relic'), kept), 'phone: dying kept the cargo or lost the gear');
  // the cargo waits where it fell, in the pack, saved
  check(await page.evaluate(() => { const c = Save.data.cache, raw = JSON.parse(localStorage.getItem('lodestar.save.v4')).cache; return !!c && c.cargo.ferrite === 9 && c.items.some((i) => i.kind === 'relic') && c.items.some((i) => i.kind === 'charm') && !!raw && raw.terr === c.terr; }), 'phone: the fall did not leave the whole cargo in a pack where it fell, saved');
  check(/YOUR PACK/.test(await page.evaluate(() => $('report-body').textContent)), 'phone: the report does not say where the pack is');
  check(await page.evaluate(() => Save.data.items.filter((i) => i.kind === 'charm').length === window._charms0), 'phone: a piece of the cargo came home from a fall');
  check(/YOU WAKE/.test(await page.evaluate(() => $('report-body').textContent)), 'phone: the report does not say where you wake');
  await tap(page, '#screen-report [data-act=closeReport]');
  check(await page.evaluate(() => { const d = Game.dive; return !d.hub && d.terr === Save.data.lastSpire && d.kindled && Math.abs(Math.floor(d.p.x / TILE) - d.floor.pad.x) <= 1; }), 'phone: the fall did not wake the diver at the last spire');
  await shot(page, 'smoke-wake');
  // back to the pack: it stands where the Kindler fell, and walking to it
  // takes it back, once
  const pack = await page.evaluate(() => {
    const c = Save.data.cache;
    UI.close(); enterTerritory(c.terr, { from: terrOf(c.terr).nb[0] }); sturdy();
    const d = Game.dive, at = cacheSpot(d, c);
    d.p.x = at.x; d.p.y = at.y + 40; for (let i = 0; i < 5; i++) Game.step(1 / 60);
    const before = !!Save.data.cache && !d.cargo.ferrite;
    Game.render();
    return before;
  });
  await shot(page, 'smoke-pack');
  const got = await page.evaluate(() => { const d = Game.dive, at = cacheSpot(d, Save.data.cache); d.p.x = at.x; d.p.y = at.y; for (let i = 0; i < 5; i++) Game.step(1 / 60); return [d.cargo.ferrite, d.items.some((i) => i.kind === 'relic'), Save.data.cache, JSON.parse(localStorage.getItem('lodestar.save.v4')).cache]; });
  check(pack && got[0] === 9 && got[1] && got[2] === null && got[3] === null, `phone: walking to the pack did not take it all back (${JSON.stringify(got)})`);
  // a fall before reaching it, and the older pack is lost: only the newest waits
  const twice = await page.evaluate(() => {
    const d = Game.dive; d.cargo = { ferrite: 3 }; d.p.invuln = 0; d.p.hp = 1; d.stats.maxHp = 100; hurtPlayer(1e9, null);
    for (let i = 0; i < 150; i++) Game.step(1 / 60);
    const first = JSON.stringify(Save.data.cache.cargo); UI.acts.closeReport();
    const e = Game.dive; e.cargo = { lumenite: 2 }; e.p.invuln = 0; e.stats.maxHp = 100; e.p.hp = 1; hurtPlayer(1e9, null);
    for (let i = 0; i < 150; i++) Game.step(1 / 60);
    const out = [first, JSON.stringify(Save.data.cache.cargo), /older pack/.test($('report-body').textContent)];
    UI.acts.closeReport();
    return out;
  });
  check(twice[0] === '{"ferrite":3}' && twice[1] === '{"lumenite":2}' && twice[2], `phone: a second fall did not lose the older pack (${twice})`);

  // supplies out in the world: each has its button on the deck, with how
  // many; MAKE in the cargo makes them from the ore carried
  await page.evaluate(() => { if (!Game.dive || Game.dive.hub) { UI.close(); startSortie({ terr: ring1(null), from: 0 }); } if (Game.dive.kindled) enterTerritory(ring1(null), { from: 0 }); sturdy(); const d = Game.dive; d.stats.maxHp = 100; d.p.hp = 30; d.pull = 0.3; Save.data.supplies = { injector: 1, cell: 2 }; });
  await run(page, 0.1);
  check(await visible(page, '#btn-mend') && await visible(page, '#btn-cell') && await page.evaluate(() => /MEND/.test($('btn-mend').textContent) && /1/.test($('btn-mend').querySelector('.supply-n').textContent) && /2/.test($('btn-cell').querySelector('.supply-n').textContent)), 'phone: the two supply buttons are not on the deck with their counts');
  await shot(page, 'lean/hud-upright');
  await tap(page, '#btn-mend');
  check(await page.evaluate(() => Game.dive.p.hp > 60 && !Save.data.supplies.injector && $('btn-mend').classList.contains('empty')), `phone: the injector did not heal (${await page.evaluate(() => Game.dive.p.hp)})`);
  await tap(page, '#btn-cell');
  check(await page.evaluate(() => Game.dive.pull > 0.55 && Save.data.supplies.cell === 1), `phone: the Lightcell did not give light back (${await page.evaluate(() => Game.dive.pull)})`);
  await page.evaluate(() => { Game.dive.cargo.ferrite = 10; });
  await tap(page, '#btn-cargo');
  check(/MAKE/.test(await page.evaluate(() => $('cargo-body').textContent)), 'phone: the cargo has no MAKE');
  await tap(page, '#cargo-body [data-act=makeSupply][data-arg="injector:field"]');
  check(await page.evaluate(() => Save.data.supplies.injector === 1 && Game.dive.cargo.ferrite === 10 - T.supplies.cost[0]), 'phone: MAKE in the field did not make an injector from the cargo');
  await shot(page, 'smoke-make');
  await tap(page, '#screen-cargo [data-act=resume]');

  // the star's reach: a spire won't hold in ring 2 before magnitude 3
  const reach = await page.evaluate(() => {
    const t = worldMap().terrs.find((x) => x.ring === 2);
    Save.data.star = 30; UI.close(); enterTerritory(t.id, { from: t.nb[0] }); sturdy();
    const d = Game.dive, h = d.floor.heart; terrState(t.id).done = true; if (d.rift && d.rift.heart) d.rift.open = false;
    d.p.x = (h.x + 0.5) * TILE; d.p.y = (h.y + 0.8) * TILE; Game.step(1 / 60); UI.frame(0);
    const label = $('btn-act').textContent; Input.actReq = true; Game.step(1 / 60);
    const out = [label, !d.channel, /magnitude 3/.test($('hud-goal').textContent)];
    terrState(t.id).done = false; d.channel = null;
    return out;
  });
  check(reach[0] === 'SPIRE · MAGNITUDE 3' && reach[1] && reach[2], `phone: a spire held in ring 2 before the star reached it (${reach})`);

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
  await page.evaluate(() => { Save.data.supplies = { injector: 3, cell: 1 }; UI.acts.setOutWalk(String(worldMap().terrs.find((t) => t.starter).id)); });
  await run(page, 0.2);
  const r = await page.evaluate(() => ['deck-left', 'stage', 'deck-right'].map((id) => document.getElementById(id).getBoundingClientRect()).map((b) => [b.left, b.right, b.width]));
  check(r[0][1] <= r[1][0] + 1 && r[1][1] <= r[2][0] + 1, `sideways: the decks are not either side of the view: ${JSON.stringify(r)}`);
  check(r[0][2] >= 150 && r[2][2] >= 150, `sideways: a deck is under 150px: ${r[0][2]}, ${r[2][2]}`);
  const fits = await page.evaluate(() => ['btn-main', 'btn-mine', 'btn-mend', 'btn-cell'].every((id) => { const b = document.getElementById(id).getBoundingClientRect(); return b.height > 0 && b.bottom <= innerHeight && b.top >= 0 && b.left >= 0 && b.right <= innerWidth; }));
  check(fits, 'sideways: a button is off the screen');
  const apart = await page.evaluate(() => { const a = $('btn-mend').getBoundingClientRect(), b = $('btn-cell').getBoundingClientRect(), dk = $('deck-right').getBoundingClientRect(); return a.right <= b.left && b.right <= dk.right && a.left >= dk.left; });
  check(apart, 'sideways: the supply buttons overlap or leave the deck');
  await shot(page, 'lean/hud-sideways');
  check(await page.evaluate(() => Math.min(View.w, View.h) >= 176), 'sideways: the view is under 176 game px');
  await shot(page, 'smoke-sideways');
  check(!errors.length, 'sideways: ' + errors.join(' | '));
  await page.close();
}

// On phones short and tall, upright: the deck's round buttons (the hands,
// DASH, MINE and the two supplies) all inside the deck, none on another.
async function deckSizes(browser) {
  for (const [width, height] of [[320, 568], [360, 640], [375, 667], [390, 844], [430, 932]]) {
    const { page, errors } = await openGame(browser, { width, height });
    await page.evaluate(() => { Save.data.supplies = { injector: 1, cell: 1 }; UI.acts.setOutWalk(String(worldMap().terrs.find((t) => t.starter).id)); });
    await run(page, 0.2);
    const bad = await page.evaluate(() => {
      const deck = $('deck-right').getBoundingClientRect(), out = [];
      const r = ['btn-main', 'btn-off', 'btn-dash', 'btn-mine', 'btn-mend', 'btn-cell'].filter((id) => !$(id).hidden).map((id) => [id, $(id).getBoundingClientRect()]);
      for (const [id, b] of r) if (b.top < deck.top - 1 || b.left < deck.left - 1 || b.right > deck.right + 1 || b.bottom > deck.bottom + 1) out.push(id + ' leaves the deck');
      for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
        const a = r[i][1], b = r[j][1], m = Math.hypot(a.left + a.width / 2 - b.left - b.width / 2, a.top + a.height / 2 - b.top - b.height / 2);
        if (m < (a.width + b.width) / 2) out.push(`${r[i][0]} on ${r[j][0]}`);
      }
      return out;
    });
    check(!bad.length, `deck at ${width}×${height}: ${bad.join(', ')}`);
    check(!errors.length, `deck at ${width}×${height}: ` + errors.join(' | '));
    await page.close();
  }
}

// Opening the game again with a sortie under way in the land where the
// pack lies: the loading builds that territory with the pack placed in it,
// and on CARRY ON walking to it takes it back.
async function reopenPack(browser) {
  const { page, errors } = await openGame(browser);
  const terr = await page.evaluate(() => {
    const t = worldMap().terrs.find((x) => x.ring === 1 && !x.starter && x.nb.includes(0));
    UI.close(); startSortie({ terr: t.id, from: 0 });
    const d = Game.dive; for (const e of d.enemies) e.dead = true;
    for (let i = 0; i < 30; i++) Game.step(1 / 60);
    Save.data.cache = { terr: t.id, site: 0, x: d.p.x + 20, y: d.p.y + 60, cargo: { ferrite: 7, deeplight: 4 }, items: [], blueprints: [], where: t.name };
    saveRun(d); Save.save();
    return t.id;
  });
  await page.reload();
  await page.waitForFunction(() => typeof Loader !== 'undefined' && Loader.state === 'ready', { timeout: 120000, polling: 100 });
  check(await page.evaluate((id) => { const d = Game.dive; return !!d && d.terr === id && !!d.cacheAt && d.cacheAt.floor === d.floor; }, terr), 'reopen: the pack was not placed in the territory built while loading');
  await page.touchscreen.tap(195, 420);
  await page.waitForFunction(() => Game.ready, { timeout: 10000 });
  await tap(page, '#screen-resume [data-act=resumeRun]');
  const got = await page.evaluate(() => { const d = Game.dive; for (const e of d.enemies) e.dead = true; d.p.x = d.cacheAt.x; d.p.y = d.cacheAt.y; for (let i = 0; i < 5; i++) Game.step(1 / 60); Game.render(); return [d.cargo.ferrite, d.cargo.deeplight, Save.data.cache]; });
  check(got[0] === 7 && got[1] === 4 && got[2] === null, `reopen: the pack was not taken back after carrying on (${JSON.stringify(got)})`);
  check(!errors.length, 'reopen pack: ' + errors.join(' | '));
  await page.close();
}

// An older save, its star fed ore: it loads with its magnitude kept (the
// points rescaled to light), its ore still ore, and nothing kept from the star.
async function migration(browser) {
  const { page, errors } = await openFresh(browser, Object.assign({}, PHONE, { save: { v: 5, star: 4500, magSeen: 5, keepOre: { ferrite: true }, introSeen: true, stash: { ferrite: 12, resonite: 3 } } }));
  const m = await page.evaluate(() => [magnitudeOf(Save.data.star), Save.data.star > T.star.levels[4] && Save.data.star < T.star.levels[5], Save.data.starScale === T.star.scale, Save.data.keepOre, Save.data.stash.ferrite, Save.data.stash.resonite]);
  check(m[0] === 5 && m[1] && m[2] && m[3] == null && m[4] === 12 && m[5] === 3, `migration: an older save's star or ore did not carry over (${JSON.stringify(m)})`);
  check(!errors.length, 'migration: ' + errors.join(' | '));
  await page.close();
}

// Opening the game again with a sortie under way: the loading builds and
// paints that territory, the tap shows the question, and CARRY ON is there
// at once (nothing painted again), named as it would be on arriving.
async function reopen(browser) {
  const { page, errors } = await openGame(browser);
  await page.evaluate(() => { UI.acts.setOutWalk(String(worldMap().terrs.find((t) => t.starter).id)); for (let i = 0; i < 60; i++) Game.step(1 / 60); saveRun(Game.dive); });
  const terr = await page.evaluate(() => Game.dive.terr);
  await page.reload();
  await page.waitForFunction(() => typeof Loader !== 'undefined' && Loader.state === 'ready', { timeout: 120000, polling: 100 });
  check(await page.evaluate(() => !Game.ready && Loader.jobs.every((j) => j.state === 'ok') && $('loader').classList.contains('ready')), 'reopen: the loading did not finish every task');
  check(await page.evaluate((id) => Game.dive && Game.dive.terr === id && View.floorFor === Game.dive.floor && View.pnt.left < View.pnt.nx * View.pnt.ny / 2, terr), 'reopen: the sortie\'s territory was not built and painted while loading');
  await shot(page, 'smoke-loader');
  await page.touchscreen.tap(195, 420);
  await page.waitForFunction(() => Game.ready, { timeout: 10000 });
  check(await visible(page, '#screen-resume') && await page.evaluate(() => $('loader').hidden || $('loader').classList.contains('gone')), 'reopen: the tap did not open the question');
  await page.evaluate(() => { window._named = 0; const said = UI.toast; UI.toast = (m, k) => { if (/ · ring \d/.test(m)) window._named++; return said(m, k); }; window._floor = View.floorFor; });
  await tap(page, '#screen-resume [data-act=resumeRun]');
  await run(page, 0.2);
  check(await page.evaluate((id) => !Game.modal && Game.dive.terr === id && View.floorFor === window._floor && window._named === 1, terr), 'reopen: CARRY ON did not carry on in the territory built while loading');
  check(!errors.length, 'reopen: ' + errors.join(' | '));
  check(!(await page.evaluate(() => Errors.length)), 'reopen: ' + (await page.evaluate(() => Errors.slice(0, 3).join(' | '))));
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
  check(await page.evaluate(() => cargoCount(Game.dive) >= 1), 'desktop: Space did not mine');
  await page.keyboard.press('Escape');
  check(await visible(page, '#screen-pause'), 'desktop: Esc did not pause');
  await shot(page, 'smoke-desktop');
  check(!errors.length, 'desktop: ' + errors.join(' | '));
  await page.close();
}

// The opening, played out: the loading's tap has brought the sound in, so a
// tap shows the caption in full, the next moves on; it plays through to the
// outpost and hands over there, the Kindler stepped out of his pod and the
// controls back; it's seen for good, and the
// uplink plays it again, which Esc ends.
async function opening(browser) {
  const { page, errors } = await openGame(browser, PHONE);
  check(await page.evaluate(() => Intro.on && Intro.scene === 0), 'opening: a fresh game did not open on it');
  await run(page, 1.2);
  // the loading's tap brought the sound in, so there's no TAP FOR SOUND
  check(!(await visible(page, '#intro-sound')) && (await page.evaluate(() => Intro.heard)), 'opening: TAP FOR SOUND after the loading\'s tap');
  await tap(page, '#intro');
  check(await page.evaluate(() => Intro.scene === 0 && $('intro-cap').querySelector('.ghost').textContent === '' && $('intro-cap').textContent === STORY_INTRO[0][0].text), 'opening: a tap did not show the caption in full');
  await tap(page, '#intro');
  check(await page.evaluate(() => Intro.scene === 1), 'opening: a second tap did not move on to the next scene');
  // the rest plays out on its own, into the outpost
  const [middle, last] = await page.evaluate(() => [T.intro.scenes.slice(1, 4).reduce((a, b) => a + b, 0), T.intro.scenes[4]]);
  await run(page, middle + 0.3);
  check(await page.evaluate(() => Intro.scene === 4 && !Game.modal && Intro.hub && Game.dive.hub), 'opening: the last scene is not the live outpost');
  await run(page, 6);
  await shot(page, 'smoke-opening-hub');
  await run(page, last - 6 + 0.6);
  const end = await page.evaluate(() => { const d = Game.dive, to = introHubShot(d).to; return { on: Intro.on, modal: Game.modal, seen: Save.data.introSeen, at: Math.hypot(d.p.x - to.x, d.p.y - to.y), cam: View.camY, hidden: $('intro').hidden }; });
  check(!end.on && !end.modal && end.seen && end.hidden, `opening: it did not hand over: ${JSON.stringify(end)}`);
  check(end.at < 3, `opening: the Kindler is ${end.at.toFixed(1)} px from where he steps out to`);
  // and it's his: the stick walks him (towards the middle of the plaza)
  const [x0, y0, ux, uy] = await page.evaluate(() => { const p = Game.dive.p, dx = OUTPOST_MIDDLE.x * TILE - p.x, dy = OUTPOST_MIDDLE.y * TILE - p.y, m = Math.hypot(dx, dy) || 1; return [p.x, p.y, dx / m, dy / m]; });
  const [hx, hy] = await center(page, '#deck-left');
  await page.touchscreen.touchStart(hx, hy);
  for (let i = 1; i <= 5; i++) await page.touchscreen.touchMove(hx + i * 8 * ux, hy + i * 8 * uy);
  await run(page, 0.4);
  await page.touchscreen.touchEnd();
  check(await page.evaluate(([x0, y0]) => Math.hypot(Game.dive.p.x - x0, Game.dive.p.y - y0) > 4, [x0, y0]), 'opening: the stick did not walk after the hand-over');
  // seen for good: home again, no opening
  await page.evaluate(() => enterHub());
  check(await page.evaluate(() => !Intro.on), 'opening: it played again on coming home');
  // the uplink plays it again; Esc ends it
  await page.evaluate(atStation, 'wreck');
  await page.evaluate(() => UI.useStation('wreck'));
  // (past the screen's tap guard in the game's own time, however slow its frames)
  await page.waitForFunction(() => Game.realT - UI.openedAt > T.ui.tapGuard + 0.05, { timeout: 10000 });
  await tap(page, '#wreck-body [data-act=replayIntro]');
  check(await page.evaluate(() => Intro.on && Game.modal === 'intro'), 'opening: the uplink did not play it again');
  await sleep(450);
  await page.keyboard.press('Escape');
  await run(page, 0.05);
  check(await page.evaluate(() => !Intro.on && !Game.modal), 'opening: Esc did not end it');
  check(!errors.length, 'opening: ' + errors.join(' | '));
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
    // (Wick knows every kind's nature: a crawler's badges show before any
    // hit, and a weak hit's number says WEAK)
    out.known0 = natureKnown(c, 'ember') && natureMarks(c).marks.some((m) => m.el === 'ember' && m.v === 'W');
    hurtEnemy(c, 1, { els: ['ember'], spell: true });
    out.known1 = d.nums.some((n) => n.verdict === 'W') && d.fx.some((f) => f.kind === 'verdict' && f.v === 'W');
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
    const it = makeBase('rig', 2, 0); it.spells[0].form = makeStone('lance', 2); it.spells[0].el = makeStone('frost', 2);
    Save.data.items.push(it, makeStone('echo', 2));
    out.codex0 = codexWhole(resonanceById('kindling')) && !codexWhole(resonanceById('shatterglass'));
    out.stirs = !!(resonanceNear(it.spells[0]) || {}).stir;
    UI.show('screen-gear'); UI.openCard(it, 'stash', it.uid); UI.card.focus = 'spells'; UI.card.part = '0:m0'; UI.acts.partPut('echo:2');
    out.live = !!document.querySelector('.spell.res') && /Shatterglass/.test($('card-body').textContent) && codexWhole(resonanceById('shatterglass'));
    out.RS = T.circuits.resist; return out;
  });
  const RS = r.RS;
  check(r.crawler.join() === `1,${RS.W},1`, `natures: a crawler is ${r.crawler} to force, ember, shock`);
  check(r.magma.join() === `1,${RS.W}`, `natures: the Magma Tubes don't shift a crawler (${r.magma})`);
  check(r.insulated === RS.I, 'natures: Insulated does not shrug off Shock');
  check(r.warded === RS.R && r.unwarded === 1, `natures: a ward isn't ${r.warded} until Force breaks it (${r.unwarded})`);
  check(r.known0 && r.known1, 'natures: the crawler\'s weakness did not show before the hit, or the hit did not say WEAK');
  check(r.shatter, 'reactions: Force on the chilled did not shatter');
  check(r.codex0 && r.stirs && r.live, `resonances: the Codex or the locker is wrong ${JSON.stringify(r)}`);
  check(!errors.length, 'spellcraft: ' + errors.join(' | '));
  check(!(await page.evaluate(() => Errors.length)), 'spellcraft: ' + (await page.evaluate(() => Errors.slice(0, 3).join(' | '))));
  await page.close();
}

// Saves made before modules (test/fixtures: on main's code, and on the
// preview's just before modules) and before the rig (v6): it loads, its
// gear is bases with modules in their sockets and one rig frame worn, its
// stats are what they were, and the locker, the bench and a card all open.
async function oldSave(browser) {
  const fs = require('fs'), path = require('path');
  for (const f of ['save-v5-home.json', 'save-v5-run.json', 'save-main-home.json', 'save-v6-home.json']) {
    const save = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8'));
    const { page, errors } = await openFresh(browser, Object.assign({ save }, PHONE));
    const r = await page.evaluate(() => {
      const s = Save.data, mods = SLOTS.flatMap((k) => baseModules(s.equip[k])).concat(s.items.filter((x) => x.kind === 'module'));
      const out = { v: s.v, bases: SLOTS.every((k) => !s.equip[k] || Array.isArray(s.equip[k].sockets)), rig: !!s.equip.main && s.equip.main.bp === 'rig' && s.equip.main.spells.length === 2 && !('off' in s.equip) && s.items.every((x) => x.kind !== 'caster' || x.spells), mods: mods.length, lode: mods.some((m) => m.power === 'lodeheart'), armor: computeStats(s.equip, s.attune).armor, run: !!s.run };
      if (s.run) { UI.close(); resumeRun(); out.resumed = !!Game.dive && Game.dive.items.every((it) => it.kind === 'module' || it.kind === 'relic' || Array.isArray(it.sockets)); UI.close(); goHome('walk'); UI.close(); }
      out.powers = mods.filter((x) => x.power).map((x) => x.power);
      UI.close(); UI.useStation('locker'); const m = mods.find((x) => x.power) || mods[0]; UI.openCard(m, 'stash', m.uid); UI.closeCard();
      UI.close(); UI.useStation('runes'); UI.acts.benchMod(mods[0].uid);
      out.bench = /UPGRADE/.test($('card-body').textContent) && !/REROLL|FUSE|IMPRINT/.test($('card-body').textContent);
      UI.closeCard(); UI.close(); UI.useStation('locker'); UI.acts.cardEquip('main');
      out.rigCard = /SPELLS/.test($('card-body').textContent) && !!document.querySelector('#card .spell');
      UI.closeCard(); UI.close(); UI.useStation('forge');
      out.forge = UI.screen === 'screen-forge' || UI.screen === 'screen-research';
      return out;
    });
    // the worn plate's 7 armor, its own +5 and the pick's +4, as before
    check(r.v === 7 && r.bases && r.rig && r.rigCard && r.mods >= 5 && r.lode && r.bench && r.forge && (f !== 'save-v5-home.json' || r.armor === 16), `old save ${f}: ${JSON.stringify(r)}`);
    if (f === 'save-v5-run.json') check(r.run && r.resumed, `old save ${f}: the sortie under way did not come back as bases and modules (${JSON.stringify(r)})`);
    await page.evaluate(() => { UI.close(); UI.useStation('locker'); });
    await new Promise((res) => setTimeout(res, 450));
    if (f === 'save-v5-home.json') await shot(page, 'smoke-oldsave-locker');
    check(!errors.length, `old save ${f}: ` + errors.join(' | '));
    check(!(await page.evaluate(() => Errors.length)), `old save ${f}: ` + (await page.evaluate(() => Errors.slice(0, 3).join(' | '))));
    await page.close();
  }
}

// START OVER, from the pause screen: a screen saying what's lost, with BACK
// in sight; a second tap on its button wipes every save but the settings,
// and the game opens again on the landing, fresh.
async function startOver(browser) {
  const { page, errors } = await openGame(browser, PHONE);
  await tap(page, '#intro-skip');
  await run(page, 0.05);
  await page.evaluate(() => {
    const s = Save.data; s.star = 120; s.stash.ferrite = 50; s.settings.music = 0; s.settings.lamp = 'glow'; s.cache = { terr: 1, site: 0, x: 0, y: 0, cargo: { ferrite: 2 }, items: [], blueprints: [], where: 'x' };
    Save.save(); localStorage.setItem('lodestar.save.v3', '{}'); localStorage.setItem('lodestar.save.v4.unread', '{}');
    UI.close(); startSortie({ terr: worldMap().terrs.find((t) => t.starter).id, from: 0 });
  });
  await run(page, 0.2);
  await tap(page, '#btn-pause');
  await tap(page, '#pause-restart');
  check(await visible(page, '#screen-restart') && /lost/i.test(await page.evaluate(() => $('screen-restart').textContent)), 'start over: no screen saying what is lost');
  await shot(page, 'lean/restart-ask');
  await tap(page, '#screen-restart [data-act=restartBack]');
  check(await visible(page, '#screen-pause') && await page.evaluate(() => Save.data.star === 120), 'start over: BACK did not go back to the pause screen, untouched');
  await tap(page, '#pause-restart');
  await tap(page, '#restart-go');
  check(await page.evaluate(() => /TAP AGAIN/.test($('restart-go').textContent) && Save.data.star === 120), 'start over: the first tap did not ask again');
  await shot(page, 'lean/restart-confirm');
  await sleep(450);
  const [x, y] = await center(page, '#restart-go');
  await Promise.all([page.waitForNavigation({ timeout: 60000 }), page.touchscreen.tap(x, y)]);
  await page.waitForFunction(() => typeof Loader !== 'undefined' && (Loader.state === 'ready' || Game.ready), { timeout: 120000, polling: 100 });
  if (!(await page.evaluate(() => Game.ready))) { await sleep(100); await page.touchscreen.tap(195, 420); }
  await page.waitForFunction(() => Game.ready, { timeout: 30000 });
  const r = await page.evaluate(() => {
    const keys = []; for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    const s = Save.data;
    return { keys, star: s.star, ferrite: s.stash.ferrite || 0, run: !!s.run, cache: !!s.cache, world: !!s.world && s.world.seed === 5, music: s.settings.music, lamp: s.settings.lamp, intro: Intro.on, resume: !$('screen-resume').hidden };
  });
  check(r.keys.join() === 'lodestar.save.v4' && r.star === 0 && !r.ferrite && !r.run && !r.cache && !r.world && !r.resume, `start over: something survived (${JSON.stringify(r)})`);
  check(r.music === 0 && r.lamp === 'glow', `start over: the settings were not kept (${JSON.stringify(r)})`);
  check(r.intro, 'start over: the game did not open on the landing');
  await shot(page, 'lean/restart-done');
  check(!errors.length, 'start over: ' + errors.join(' | '));
  await page.close();
}

// A save from before the lean rules: the pocket's contents in the stash,
// contracts gone, graded supplies merged (the gone kinds refunded as
// ore), a Capacity attunement's points back, a Deep Satchel refunded.
async function leanSave(browser) {
  const fs = require('fs'), path = require('path');
  const save = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'save-main-run.json'), 'utf8'));
  Object.assign(save, { supplies: { injector1: 2, injector3: 1, cell2: 1, flare1: 2, ward2: 1, charge3: 1 }, supplySel: 'flare', attune: { vitality: 1, capacity: 2 }, tools: ['compass', 'satchel'], tool: 'satchel', star: 120, starScale: 2 });
  save.run.pocket.push({ stuff: 'lumenite', n: 7 });
  const st0 = Object.assign({}, save.stash), pocketItem = save.run.pocket.find((e) => e.item).item.uid;
  const { page, errors } = await openFresh(browser, Object.assign({ save }, PHONE));
  const r = await page.evaluate((uid) => {
    const s = Save.data;
    const out = { supplies: s.supplies, sel: 'supplySel' in s, contracts: 'contracts' in s || 'swapped' in s, attune: s.attune, pts: attunePointsLeft(s), tools: s.tools, tool: s.tool, pocket: s.run && 'pocket' in s.run, item: s.items.some((i) => i.uid === uid), stash: Object.assign({}, s.stash) };
    UI.close(); resumeRun(); out.resumed = !!Game.dive && !Game.dive.hub && Game.dive.pocket === undefined; UI.close(); goHome('walk'); UI.close();
    UI.useStation('setout'); out.portal = /NEXT/.test($('setout-body').textContent); UI.close();
    return out;
  }, pocketItem);
  check(JSON.stringify(r.supplies) === '{"injector":3,"cell":1}' && !r.sel && !r.contracts, `lean save: supplies or contracts not converted (${JSON.stringify(r)})`);
  check(!r.attune.capacity && r.attune.vitality === 1 && r.pts === 4 - 1 - 1, `lean save: the Capacity points did not come back (${JSON.stringify(r.attune)}, ${r.pts})`);
  check(r.tools.join() === 'compass' && r.tool === 'compass', `lean save: the Deep Satchel is still carried (${r.tools})`);
  check(!r.pocket && r.item && r.stash.lumenite === (st0.lumenite || 0) + 7 + 8, `lean save: the pocket did not go to the stash (${JSON.stringify(r.stash)})`);
  check(r.stash.ferrite === (st0.ferrite || 0) + 2 * T_REFUND && r.stash.resonite === (st0.resonite || 0) + T_REFUND && r.stash.sigilite === (st0.sigilite || 0) + T_REFUND, `lean save: Flares, Ward Cells and Charges were not refunded as ore (${JSON.stringify(r.stash)})`);
  check(r.resumed && r.portal, `lean save: the sortie did not resume, or the portal has no next goal (${JSON.stringify(r)})`);
  check(!errors.length, 'lean save: ' + errors.join(' | '));
  check(!(await page.evaluate(() => Errors.length)), 'lean save: ' + (await page.evaluate(() => Errors.slice(0, 3).join(' | '))));
  await page.close();
}

// A new game: after the opening, Wick's offer. I KNOW THE DRILL: only the
// essentials are awake (FRAMES and CUTTERS at the forge, the bench, altar and
// uplink dark, no SUPPLIES, no MEND or LIGHT), the forge's tutorial runs
// the first time it opens (the dim, Wick's line, SKIP) and its ? plays it
// again, then the reference; a module caught wakes the bench, a deed's
// light the altar. An old save (a fixture) has everything awake, no offer,
// no tutorial.
async function onboarding(browser) {
  const { page, errors } = await openFresh(browser, PHONE);
  await page.evaluate((seed) => { Save.data.world = freshWorld(seed); }, SMOKE_WORLD);
  await tap(page, '#intro-skip');
  await run(page, 0.05);
  check(await visible(page, '#screen-onboard') && /WALK ME THROUGH IT/.test(await page.evaluate(() => $('screen-onboard').textContent)), 'onboarding: no offer to walk through it after the opening');
  await shot(page, 'onboard/offer');
  await tap(page, '#screen-onboard [data-act=guideNo]');
  check(await page.evaluate(() => !Game.modal && Save.data.onboard.mode === 'free' && !Save.data.onboard.guide), 'onboarding: I KNOW THE DRILL did not close the offer');
  const gate = await page.evaluate(() => {
    const at = (id) => { const d = Game.dive, s = HUB_STATIONS.find((x) => x.id === id); d.p.x = (s.x + 0.5) * TILE; d.p.y = (s.y + 0.9) * TILE; Game.step(1 / 60); return actionHere(); };
    return { bench: at('runes'), altar: at('altar'), uplink: at('wreck'), forge: at('forge'), sup: (Game.step(1 / 60), $('btn-act2').hidden), locker: at('locker'), portal: at('setout') };
  });
  check(!gate.bench && !gate.altar && !gate.uplink && gate.forge === 'forge' && gate.sup && gate.locker === 'locker' && gate.portal === 'setout', `onboarding: a new game's stations are not just the forge, locker and portal (${JSON.stringify(gate)})`);
  await shot(page, 'onboard/dormant');
  // the forge: only FRAMES and CUTTERS, and its tutorial the first time
  await page.evaluate(() => { const d = Game.dive, s = HUB_STATIONS.find((x) => x.id === 'forge'); d.p.x = (s.x + 0.5) * TILE; d.p.y = (s.y + 0.9) * TILE; Save.data.studied = RESEARCH.map((r) => r.id); });
  await run(page, 0.05);
  await tap(page, '#btn-act');
  await run(page, 0.05);
  const tabs = await page.evaluate(() => [...document.querySelectorAll('#forge-body .forge-tabs .chip')].map((b) => b.textContent).join());
  check(tabs === 'FRAMES,CUTTERS', `onboarding: a new game's forge shows ${tabs}`);
  await sleep(700);
  await run(page, 0.05);
  const tut = await page.evaluate(() => ({ run: Tutor.run && Tutor.run.id, shown: !$('tutor').hidden, line: $('tutor').querySelector('.tut-line').textContent, hit: (() => { const el = document.querySelector('#forge-body [data-act=forgeTab][data-arg=pick]'), r = el.getBoundingClientRect(), h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return h === el || el.contains(h); })(), blocked: (() => { const h = document.elementFromPoint(200, 790); return !!h && h.classList.contains('tut-dim'); })() }));
  check(tut.run === 'forge' && tut.shown && tut.line.length < 70 && tut.hit && tut.blocked, `onboarding: the forge's tutorial did not dim all but its target (${JSON.stringify(tut)})`);
  await shot(page, 'onboard/forge-tutorial');
  await tap(page, '#forge-body [data-act=forgeTab][data-arg=pick]');
  await run(page, 0.05);
  check(await page.evaluate(() => Tutor.run && Tutor.run.i === 1 && UI.forge.bp === 'pick'), 'onboarding: tapping what the tutorial lit did not move it on');
  await tap(page, '#tutor .tut-skip');
  check(await page.evaluate(() => !Tutor.run && $('tutor').hidden && Save.data.onboard.seen.forge), 'onboarding: SKIP did not end the tutorial');
  // its ? plays it again, then the reference
  await tap(page, '#screen-forge .head-help');
  await run(page, 0.05);
  check(await page.evaluate(() => Tutor.run && Tutor.run.id === 'forge' && Tutor.run.replay && !$('tutor').hidden), 'onboarding: ? did not replay the forge\'s tutorial');
  await tap(page, '#tutor .tut-skip');
  check(await page.evaluate(() => Tutor.run && Tutor.run.ref && $('tutor').querySelectorAll('.tut-ref p').length >= 3), 'onboarding: the replay has no reference after it');
  await shot(page, 'onboard/forge-reference');
  await tap(page, '#tutor .tut-ok');
  check(await page.evaluate(() => !Tutor.run && UI.screen === 'screen-forge'), 'onboarding: the reference did not close back to the forge');
  await tap(page, '#screen-forge [data-act=back]');
  // out in the land: no MEND or LIGHT yet
  await page.evaluate(() => { const t = worldMap().terrs.find((x) => x.starter); startSortie({ terr: t.id, from: 0 }); for (let i = 0; i < 10; i++) Game.step(1 / 60); });
  check(await page.evaluate(() => $('btn-mend').hidden && $('btn-cell').hidden && !$('btn-help').hidden), 'onboarding: MEND and LIGHT show before the first ore came home, or no ? in the top bar');
  // the HUD's ? pauses and plays its tour
  await tap(page, '#btn-help');
  check(await page.evaluate(() => Tutor.run && Tutor.run.id === 'hud' && Game.modal === 'tutor'), 'onboarding: the top bar\'s ? did not pause for the HUD\'s tour');
  await shot(page, 'onboard/hud-tutorial');
  await tap(page, '#tutor .tut-skip');
  await tap(page, '#tutor .tut-ok');
  check(await page.evaluate(() => !Tutor.run && !Game.modal), 'onboarding: the HUD\'s tour did not end and let the world go on');
  // a module caught wakes the bench; a deed's light, the altar
  const woke = await page.evaluate(() => {
    Save.data.modsFound = 1; Save.data.stash.heartlight = 12;
    for (let i = 0; i < 40; i++) Game.step(1 / 60);
    return { modules: onboardHas('modules'), altar: onboardHas('altar'), said: !!(Save.data.said || {}).wake_modules };
  });
  check(woke.modules && woke.altar && woke.said, `onboarding: a module and light did not wake the bench and altar (${JSON.stringify(woke)})`);
  check(!errors.length, 'onboarding: ' + errors.join(' | '));
  check(!(await page.evaluate(() => Errors.length)), 'onboarding: ' + (await page.evaluate(() => Errors.slice(0, 3).join(' | '))));
  await page.close();
  // an old save: nothing locked, no offer, no tutorial
  const save = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'fixtures', 'save-v6-home.json'), 'utf8'));
  save.introSeen = true;
  const old = await openFresh(browser, Object.assign({}, PHONE, { save }));
  const o = await old.page.evaluate(() => {
    UI.close();
    const d = Game.dive, s = HUB_STATIONS.find((x) => x.id === 'runes');
    d.p.x = (s.x + 0.5) * TILE; d.p.y = (s.y + 0.9) * TILE; Game.step(1 / 60);
    const bench = actionHere();
    openForge(false); UI.acts.researchDone && UI.screen === 'screen-research' && UI.acts.researchDone();
    return { mode: Save.data.onboard.mode, all: ONBOARD_KEYS.every((k) => onboardHas(k)), bench, tabs: forgeCats().length, pending: !!Tutor.pending || !!Tutor.run, offer: !$('screen-onboard').hidden };
  });
  await sleep(700);
  const o2 = await old.page.evaluate(() => !!Tutor.run);
  check(o.mode === 'old' && o.all && o.bench === 'runes' && o.tabs >= 7 && !o.pending && !o2 && !o.offer, `onboarding: an old save found something locked, or a tutorial or the offer (${JSON.stringify(o)})`);
  check(!old.errors.length, 'onboarding, old save: ' + old.errors.join(' | '));
  await old.page.close();
}

// The walkthrough, end to end: WALK ME THROUGH IT, out of the lit opening,
// a vein mined, ARC, BOLT, DASH, the foe finished (it leaves a part),
// twelve Ferrite, home, the forge's tutorial tapped through to the anvil,
// the Ferrite pick worn, and NEXT.
async function guidedLanding(browser) {
  const { page, errors } = await openFresh(browser, PHONE);
  await page.evaluate((seed) => { Save.data.world = freshWorld(seed); }, SMOKE_WORLD);
  await tap(page, '#intro-skip');
  await run(page, 0.05);
  await tap(page, '#screen-onboard [data-act=guideYes]');
  await run(page, 0.1);
  const step = () => page.evaluate(() => Save.data.onboard.guide);
  check(await step() === 'out' && await visible(page, '#guide') && await page.evaluate(() => !!Guide.mark(Game.dive)), 'guided: no line and marker for the way out');
  await shot(page, 'onboard/guided-out');
  // to the marked opening (the gentle land's)
  await page.evaluate(() => { const d = Game.dive, m = Guide.mark(d); d.p.x = m.x; d.p.y = m.y; });
  await run(page, 2.5);
  check(await page.evaluate(() => Game.dive.sortie && worldMap().terrs[Game.dive.terr].starter) && await step() === 'ore', `guided: walking out did not reach the gentle land and the ore step (${await step()})`);
  const standAtMark = () => page.evaluate(() => { const d = Game.dive, m = Guide.mark(d); if (!m) return false; const f = d.floor, tx = Math.floor(m.x / TILE), ty = Math.floor(m.y / TILE); for (const [a, b] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) if (!TILE_SOLID[floorTile(f, tx + a, ty + b)]) { d.p.x = (tx + a + 0.5) * TILE; d.p.y = (ty + b + 0.5) * TILE; d.p.fx = -a; d.p.fy = -b; return true; } return false; });
  await standAtMark();
  await page.evaluate(() => { Input.bot = { mine: true }; });
  await run(page, 1.5);
  await page.evaluate(() => { Input.bot = null; });
  check(await step() === 'arc' && await page.evaluate(() => Game.dive.enemies.some((e) => e.guide && !e.dead) && $('btn-main').classList.contains('guide-pulse')), `guided: mining did not move on to the fight, with a foe and ARC lit (${await step()})`);
  await shot(page, 'onboard/guided-fight');
  await hold(page, '#btn-main', 0.15);
  await run(page, 0.3);
  check(await step() === 'bolt', `guided: ARC did not move on to BOLT (${await step()})`);
  await hold(page, '#btn-off', 0.15);
  await run(page, 0.3);
  check(await step() === 'dash', `guided: BOLT did not move on to DASH (${await step()})`);
  await tap(page, '#btn-dash');
  await run(page, 0.3);
  check(['finish', 'haul'].includes(await step()), `guided: DASH did not move on (${await step()})`);
  for (let k = 0; k < 12 && (await step()) === 'finish'; k++) {
    await page.evaluate(() => { const d = Game.dive; for (const e of d.enemies) if (e.guide && !e.dead) { e.hp = 1; d.p.x = e.x - 14; d.p.y = e.y; d.p.fx = 1; d.p.fy = 0; } Input.bot = { main: true }; });
    await run(page, 0.15);
    await page.evaluate(() => { const d = Game.dive; Input.bot = null; for (const dr of d.drops) { dr.x = d.p.x; dr.y = d.p.y; } });
    await run(page, 0.6);
  }
  check(await step() === 'haul' && await page.evaluate(() => partsHave(Game.dive.cargo, 'any') >= 1), `guided: the foe did not fall and leave a part (${await step()})`);
  for (let k = 0; k < 14 && (await step()) === 'haul'; k++) {
    await standAtMark();
    await page.evaluate(() => { Input.bot = { mine: true }; for (const e of Game.dive.enemies) if (!e.guide) e.dead = true; });
    await run(page, 1.2);
  }
  await page.evaluate(() => { Input.bot = null; });
  check(await step() === 'home' && await page.evaluate(() => Game.dive.cargo.ferrite >= BLUEPRINTS.pick.ore), `guided: twelve Ferrite did not move on to home (${await step()})`);
  await page.evaluate(() => { const d = Game.dive, m = Guide.mark(d); d.p.x = m.x; d.p.y = m.y; });
  await run(page, 3);
  check(await visible(page, '#screen-report'), `guided: walking back did not come home (${await step()})`);
  await tap(page, '#screen-report [data-act=closeReport]');
  await run(page, 0.1);
  check(await step() === 'forge', `guided: home did not move on to the forge (${await step()})`);
  check(await page.evaluate(() => { const m = Guide.mark(Game.dive), s = HUB_STATIONS.find((x) => x.id === 'forge'); return !!m && Math.abs(m.x - (s.x + 0.5) * TILE) < 1; }), 'guided: the marker is not on the forge');
  await page.evaluate(() => { const d = Game.dive, s = HUB_STATIONS.find((x) => x.id === 'forge'); d.p.x = (s.x + 0.5) * TILE; d.p.y = (s.y + 0.9) * TILE; });
  await run(page, 0.05);
  await tap(page, '#btn-act');
  if (await page.evaluate(() => UI.screen === 'screen-research')) await tap(page, '#research-body [data-act=researchDone]');
  await sleep(600);
  await run(page, 0.05);
  // the forge's tutorial, done as it says: CUTTERS, NEXT, the ore, NEXT, FORGE
  for (let k = 0; k < 8 && (await page.evaluate(() => !!Tutor.run)); k++) {
    const st = await page.evaluate(() => ({ at: TUTORS[Tutor.run.id].steps[Tutor.run.i].at, ok: !$('tutor').querySelector('.tut-ok').hidden }));
    if (k === 2) await shot(page, 'onboard/guided-forge');
    await tap(page, st.ok ? '#tutor .tut-ok' : st.at);
    await run(page, 0.05);
  }
  check(await visible(page, '#screen-anvil'), 'guided: the forge\'s tutorial did not end at the anvil');
  for (let k = 0; k < 3; k++) { await run(page, 0.4); await page.evaluate(() => Anvil.strike()); }
  await run(page, 3.5);
  await tap(page, '#card [data-act=equip]');
  await run(page, 0.1);
  check(await page.evaluate(() => Save.data.equip.pick.tier === 1), 'guided: the Ferrite pick was not made and worn');
  await page.evaluate(() => UI.close());
  await run(page, 0.1);
  check(await step() === 'free', `guided: the pick did not move on to the last word (${await step()})`);
  await run(page, 8);
  check(await page.evaluate(() => !Save.data.onboard.guide && $('guide').hidden && !$('hud-goal').hidden && /NEXT/.test($('hud-goal').textContent)), 'guided: the walkthrough did not hand over to NEXT');
  await shot(page, 'onboard/guided-next');
  check(!errors.length, 'guided: ' + errors.join(' | '));
  check(!(await page.evaluate(() => Errors.length)), 'guided: ' + (await page.evaluate(() => Errors.slice(0, 3).join(' | '))));
  await page.close();
}

// The paint lab (lab.js): PAUSE → PAINT LAB opens the sheet with the room
// still showing; every row flips once and the frame still draws; RESET
// puts every row back; the address sets it before the game loads.
async function paintLab(browser) {
  const { page, errors } = await openGame(browser, Object.assign({}, PHONE, { query: '?lab=form:off,brush:broad' }));
  await page.evaluate(`window.ring1 = ${ring1}; window.sturdy = ${sturdy};`);
  check(await page.evaluate(() => Lab.get('form') === false && Lab.get('brush') === 'broad' && Lab.get('calm') === true), 'lab: ?lab= did not set the lab before the game loaded');
  await tap(page, '#intro-skip');
  await page.evaluate(() => { if (Game.modal === 'screen-onboard') UI.close(); });
  await page.evaluate((id) => UI.acts.setOutWalk(String(id)), await page.evaluate(() => ring1('waystones')));
  await page.evaluate(() => sturdy());
  await run(page, 0.3);
  await tap(page, '#btn-pause');
  check(await visible(page, '#pause-lab') && !(await page.evaluate(() => $('pause-lamp'))), 'lab: the pause screen has no PAINT LAB button (or still has LAMP)');
  await tap(page, '#pause-lab');
  check(await visible(page, '#screen-lab') && (await page.evaluate(() => document.querySelectorAll('#lab-rows .lab-row').length === LAB_ROWS.length)), 'lab: PAINT LAB did not open the sheet with every row');
  // the room shows above the sheet: the frame is still drawn under it
  check(await page.evaluate(() => { const r = $('screen-lab').getBoundingClientRect(), v = $('view').getBoundingClientRect(); return r.top > v.top + 40 && Game.modal === 'screen-lab'; }), 'lab: the sheet covers the room');
  await shot(page, 'smoke-lab');
  for (const r of await page.evaluate(() => LAB_ROWS.map((r) => r.key))) {
    const before = await page.evaluate((k) => Lab.get(k), r);
    await page.evaluate((k) => $('lab-' + k).scrollIntoView({ block: 'center' }), r);
    await tap(page, '#lab-' + r);
    const after = await page.evaluate((k) => Lab.get(k), r);
    check(after !== before, `lab: ${r} did not flip (${before} → ${after})`);
    await run(page, 0.2);
  }
  check(await page.evaluate(() => Lab.get('form') === true && Lab.get('brush') === 'fine' && Lab.get('finish') === 'paint' && !Lab.get('calm') && Lab.get('air') && Lab.get('impasto') && Lab.get('nocturne') && Lab.get('live') && Lab.get('canvas') && Save.data.settings.paint.calm === false), 'lab: the rows did not land in the save');
  check(await page.evaluate(() => !lampIsBeam()), 'lab: the LAMP row did not switch to the glow');
  await tap(page, '#lab-lamp');
  await page.evaluate(() => $('lab-reset').scrollIntoView({ block: 'center' }));
  await tap(page, '#lab-reset');
  check(await page.evaluate(() => !Lab.changed() && $('lab-reset').disabled && lampIsBeam()), 'lab: RESET did not put every row back');
  await tap(page, '#screen-lab [data-act=labBack]');
  check(await page.evaluate(() => Game.modal === null && $('screen-lab').hidden), 'lab: BACK did not close the sheet into play');
  await run(page, 0.3);
  check(!errors.length, 'lab: errors: ' + errors.slice(0, 3).join(' | '));
  await page.close();
}

// FINE GRAIN (art.js artFinePx): with ?fine the view is drawn at twice the
// art's pixels (AP 3, a tile 48 px): the sprites enlarged to it with their
// anchors, the Kindler rendered at the finer size, the labels' pixels
// wider; the frame renders with no errors, and a screenshot shows it.
async function fineGrain(browser) {
  const { page, errors } = await openGame(browser, Object.assign({}, PHONE, { query: '?noload&fine' }));
  await tap(page, '#intro-skip');
  await page.evaluate(() => { if (Game.modal === 'screen-onboard') UI.close(); });
  await run(page, 0.5);
  const r = await page.evaluate(() => {
    const k = Sprites.diver[2][0], forge = hartForge(), pack = packSprite(), lab = exitLabel('HOME', '#fff');
    return { AP, AF, ATILE, w: View.w, h: View.h, kindler: [k.w, k.h, k.ax, k.ay], forge: [forge.w, forge.h, forge.ax, forge.ay, forge.f], pack: [pack.w, pack.ax, pack.tip.x, pack.f], lab: lab.height, map: Math.round(View.w / AP) };
  });
  check(r.AP === 3 && r.AF === 2 && r.ATILE === 48, 'fine: the art scale is not 3 art px a world px: ' + JSON.stringify(r));
  check(r.kindler[0] === 96 && r.kindler[1] === 94 && r.kindler[2] === 48 && r.kindler[3] === 88, 'fine: the Kindler is not rendered at twice the size: ' + r.kindler);
  check(r.forge[4] === 2 && r.forge[0] === 136 && r.forge[2] === 84 && r.forge[3] === 122, 'fine: the forge was not enlarged with its anchors: ' + r.forge);
  check(r.pack[3] === 2 && r.pack[0] === 34 && r.pack[1] === 16 && r.pack[2] === 24, 'fine: the pack was not enlarged with its points: ' + r.pack);
  check(r.lab === 12, 'fine: a label picture is not twice as tall: ' + r.lab);
  check(r.map === 195, 'fine: the view does not show the same world width: ' + r.map);
  await shot(page, 'fine');
  check(!errors.length, 'fine: errors: ' + errors.slice(0, 3).join(' | '));
  await page.close();
}

(async () => {
  require('fs').mkdirSync(require('path').join(__dirname, 'out', 'lean'), { recursive: true });
  require('fs').mkdirSync(require('path').join(__dirname, 'out', 'onboard'), { recursive: true });
  const browser = await launch();
  try {
    await onboarding(browser);
    await guidedLanding(browser);
    await startOver(browser);
    await leanSave(browser);
    await oldSave(browser);
    await spellcraft(browser);
    await opening(browser);
    await phone(browser);
    await sideways(browser);
    await deckSizes(browser);
    await reopen(browser);
    await desktop(browser);
    await reopenPack(browser);
    await migration(browser);
    await paintLab(browser);
    await fineGrain(browser);
  } catch (e) {
    failures.push(String(e.stack || e));
  } finally {
    await browser.close();
  }
  finish('smoke', failures);
})();
