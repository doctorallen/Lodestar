'use strict';
// Draws the app's icons (icons/) from the game's own star: the loading
// screen's mark (loader.js loaderStarMark, hubart.js hartStar in its halo),
// enlarged by whole pixels on the night's colour and cropped square. The
// star sits well inside the middle 80%, so a launcher's mask can round it.
// Run it again if the star's art changes: node test/icons.js
const path = require('path');
const fs = require('fs');
const { ROOT, launch, tk } = require('./lib');

const SIZES = [
  { file: 'icon-512.png', n: 512, k: 5 },
  { file: 'icon-192.png', n: 192, k: 2 },
  { file: 'apple-touch-icon.png', n: 180, k: 2 },
];

(async () => {
  const browser = await launch();
  try {
    const page = await browser.page();
    await page.goto('file://' + path.join(ROOT, 'index.html') + '?noload');
    await tk.waitFor(page, () => typeof Game !== 'undefined' && Game.ready, { timeout: 120000 });
    const out = await page.evaluate((sizes) => {
      const el = document.getElementById('loader');
      el.hidden = false;
      loaderStarMark(el);
      const mark = LoaderUI.star.frames[0];
      return sizes.map(({ n, k }) => {
        const c = document.createElement('canvas');
        c.width = c.height = n;
        const x = c.getContext('2d');
        x.fillStyle = '#07080a';
        x.fillRect(0, 0, n, n);
        x.imageSmoothingEnabled = false;
        const w = mark.width * k;
        x.drawImage(mark, Math.round((n - w) / 2), Math.round((n - w) / 2), w, w);
        return c.toDataURL('image/png').split(',')[1];
      });
    }, SIZES.map(({ n, k }) => ({ n, k })));
    fs.mkdirSync(path.join(ROOT, 'icons'), { recursive: true });
    SIZES.forEach((s, i) => fs.writeFileSync(path.join(ROOT, 'icons', s.file), Buffer.from(out[i], 'base64')));
    console.log('icons: ' + SIZES.map((s) => s.file).join(', '));
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
