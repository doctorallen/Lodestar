'use strict';
// The autopilot plays careers from a fresh save: sorties out into the
// world, then spends the haul at home, over and over. It fails if a career
// can't get anywhere: the first sorties must bring something home, the pick
// must improve, the star must grow, and some career must kindle a territory.
// node test/bot.js [--careers N] [--dives N] (sorties a career); results
// in test/out/balance.json
const fs = require('fs');
const path = require('path');
const { launch, openGame, outDir, finish } = require('./lib');
const { installBot } = require('./botlib');

const arg = (k, def) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : def; };
const CAREERS = arg('--careers', 2), DIVES = arg('--dives', 24);
// Each career plays a fixed world (seed SEED + career), so CI runs are
// repeatable; --seed 0 rolls a random world each time, for balance runs.
const SEED = arg('--seed', 101);

(async () => {
  const browser = await launch();
  const failures = [], all = [];
  try {
    for (let c = 0; c < CAREERS; c++) {
      const { page, errors } = await openGame(browser);
      await page.evaluate(installBot);
      if (SEED) await page.evaluate((seed) => { Save.data.world = freshWorld(seed); Save.save(); }, SEED + c);
      const runs = await page.evaluate((n) => Bot.career({ sorties: n }), DIVES);
      all.push(runs);
      const n = (k) => runs.filter((r) => r.ended === k).length, last = runs[runs.length - 1];
      const P = last.packs || {}, mins = Math.round(runs.reduce((a, r) => a + r.time, 0) / 60);
      console.log(`career ${c + 1}: ${n('home')} home, ${n('recalled')} recalled, ${n('died')} fell, ${n('timeout')} timed out; ${last.kindledAll} kindled, ${runs.filter((r) => r.deep).length} Deeps; magnitude ${last.mag} (${last.star} light), pick ${last.pick}, ${last.hands}, ${last.maxHp} hp; packs left ${P.left || 0}, recovered ${P.recovered || 0}, lost ${P.lost || 0}; supplies used ${JSON.stringify(P.used || {})}; ${mins} min out`);
      console.log(`  gear tiers ${last.gearTier.join('/')} (rig/armor/charm/pick); cores caught ${last.found}, set ${last.socketed}/${last.sockets} [${last.modRarities}] tiers ${last.modTiers.join(',')}; ${last.merges} merged, ${last.prints} printed, ${last.patterns} patterns known`);
      console.log(`  cores rolled: ${Object.entries(last.rolled || {}).map(([k, v]) => `${k} ${Object.entries(v).map(([r, n]) => r[0] + n).join(' ')}`).join('; ')}`);
      console.log(`  magnitude by sortie: ${runs.map((r) => r.mag).join(' ')}`);
      console.log(`  built and fitted (after sortie): ${Object.entries(last.built || {}).map(([id, n]) => `${id.replace(/^(bld|wick)_/, '')}@${n}`).join(' ') || 'nothing'}`);
      for (const r of runs) console.log(`  r${r.ring} L${String(r.level).padEnd(2)} ${(r.clime || '').padEnd(8)} ${r.ended.padEnd(8)}${r.kindled ? ' +K' : '   '}${r.deep ? ' D' : '  '} kills ${String(r.kills).padStart(3)} cargo ${String(r.cargo).padStart(2)} mods ${String(r.mods).padStart(2)} t ${String(r.time).padStart(3)}s | mag ${r.mag} pick ${r.pick} | ${r.why || r.home.join('; ')}`);
      if (last.found < 2) failures.push(`career ${c + 1}: only ${last.found} cores caught`);
      if (!last.socketed) failures.push(`career ${c + 1}: no core set`);
      if (!runs.slice(0, 4).some((r) => r.ended === 'home' || r.ended === 'recalled')) failures.push(`career ${c + 1}: none of the first four sorties came home`);
      if (last.pick < 2) failures.push(`career ${c + 1}: the pick never improved`);
      if (last.mag < 2) failures.push(`career ${c + 1}: the star never grew`);
      if (errors.length) failures.push(`career ${c + 1}: ` + errors.slice(0, 5).join(' | '));
      const errs = await page.evaluate(() => Errors.slice(0, 5));
      if (errs.length) failures.push(`career ${c + 1}: ` + errs.join(' | '));
      await page.close();
    }
  } catch (e) {
    failures.push(String(e.stack || e));
  } finally {
    await browser.close();
  }
  if (all.length && !all.some((r) => r[r.length - 1].kindledAll > 0)) failures.push('no career kindled a territory');
  fs.writeFileSync(path.join(outDir(), 'balance.json'), JSON.stringify(all, null, 1));
  const flat = all.flat(), k = (e) => flat.filter((r) => r.ended === e).length, N = flat.length || 1;
  if (all.length) console.log(`all: ${flat.length} sorties: ${(100 * k('died') / N).toFixed(1)}% fell, ${(100 * k('home') / N).toFixed(1)}% home, ${(100 * k('recalled') / N).toFixed(1)}% recalled, ${(100 * k('timeout') / N).toFixed(1)}% timed out; kindled per career ${(all.reduce((a, r) => a + r[r.length - 1].kindledAll, 0) / all.length).toFixed(2)}; magnitude ${(all.reduce((a, r) => a + r[r.length - 1].mag, 0) / all.length).toFixed(2)}, pick ${(all.reduce((a, r) => a + r[r.length - 1].pick, 0) / all.length).toFixed(2)}; a sortie: haul ${(flat.reduce((a, r) => a + r.cargo, 0) / N).toFixed(1)}, modules ${(flat.reduce((a, r) => a + r.mods, 0) / N).toFixed(2)}, kills ${(flat.reduce((a, r) => a + r.kills, 0) / N).toFixed(1)}, ${(flat.reduce((a, r) => a + r.time, 0) / N).toFixed(0)} s, ${flat.filter((r) => r.deep).length} Deeps`);
  finish('bot', failures);
})();
