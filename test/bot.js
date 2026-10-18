'use strict';
// The autopilot plays careers from a fresh save: dives, then spends the
// haul at home, over and over. It fails if a career can't get anywhere: the
// first dives must bring something home, the pick must improve, the star
// must grow, and a new biome must open within the dives played.
// node test/bot.js [--careers N] [--dives N]; results in test/out/balance.json
const fs = require('fs');
const path = require('path');
const { launch, openGame, outDir, finish } = require('./lib');
const { installBot } = require('./botlib');

const arg = (k, def) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : def; };
const CAREERS = arg('--careers', 2), DIVES = arg('--dives', 24);
const T_BIOMES = ['rim', 'choir', 'forge'];

(async () => {
  const browser = await launch();
  const failures = [], all = [];
  try {
    for (let c = 0; c < CAREERS; c++) {
      const { page, errors } = await openGame(browser);
      await page.evaluate(installBot);
      const runs = await page.evaluate((n) => Bot.career({ dives: n }), DIVES);
      all.push(runs);
      const extracted = runs.filter((r) => r.ended === 'extracted').length, died = runs.filter((r) => r.ended === 'died').length;
      const last = runs[runs.length - 1];
      console.log(`career ${c + 1}: ${extracted} extracted, ${died} died, ${runs.length - extracted - died} timed out; magnitude ${last.mag}, pick ${last.pick}, ${last.blade}, ${last.maxHp} hp`);
      for (const r of runs) console.log(`  ${T_BIOMES[r.biome]} d${r.depth} ${r.ended.padEnd(9)} kills ${String(r.kills).padStart(3)} cargo ${String(r.cargo).padStart(2)} items ${r.items} t ${r.time}s | mag ${r.mag} pick ${r.pick} ${r.blade} | ${r.why || r.home.join('; ')}`);
      if (!runs.slice(0, 4).some((r) => r.ended === 'extracted')) failures.push(`career ${c + 1}: none of the first four dives came home`);
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
  fs.writeFileSync(path.join(outDir(), 'balance.json'), JSON.stringify(all, null, 1));
  finish('bot', failures);
})();
