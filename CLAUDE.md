# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Lodestar is a top-down pixel-art mining and looting game for the phone browser (upright, or sideways with `#app.wide`) in plain JavaScript: no build step, no dependencies, no modules. Read `README.md` for the file map and controls, `js/tuning.js` for every number, `DESIGN.md` for the plan, and `DECISIONS.md` before changing a design decision. Log any new major gameplay decision there. Sections of `DESIGN.md` marked **(proposed)** aren't settled; ask before building on them in a way that's hard to undo.

## Commands

```sh
python3 -m http.server 8000     # play at http://localhost:8000 (or open index.html)
npm ci                          # test tools only
npm test                        # everything CI runs
node test/gen.js --update       # re-record golden hashes after an intended generation change
node test/bot.js --careers 20 --dives 24   # balance runs (dives: sorties a career); results in test/out/balance.json
git config core.hooksPath .githooks
```

## Architecture

- **Globals and load order.** Every file is a classic script in one global scope, loaded in order by `index.html` (`util.js` first, `main.js` last). A new file needs its `<script>` tag. `test/check.sh` fails on duplicate top-level names, so give helpers distinctive names.
- **Seeded generation.** Floors come from `generateFloor(seed, depth, biome)` using `Rng(hashInts(seed, depth, biome, …))`, never `Math.random`, so a floor can be rebuilt and the golden hashes stay stable. The world is laid out by `worldLayout(seed)` and each territory built by `generateTerritory(worldSeed, id)` the same way; the save keeps only the seed and what's been done to each territory. Enemy placement uses its own seeded Rng per floor. Mining yields, combat rolls and drops use `Game.dive.rng`; crafting and the rune bench use `Save.rng()`. Cosmetic effects may use `Math.random` (`FX_R`).
- **Time.** `Game.step(dt)` is one fixed 1/60 s step. The prospector runs on real time; the world runs on `dt * Game.timeScale`.
- **Modals.** A screen sets `Game.modal`, which stops the simulation. Opening one calls `Input.block()`, and its buttons ignore taps for 400 ms. Screen buttons carry `data-act`/`data-arg`, run through `UI.acts`, and the screen redraws.
- **The save.** The cargo is saved only when it's banked (at a spire, or home), so closing the page mid-sortie can't smuggle loot out. A sortie in progress is saved on arriving anywhere, and comes back where it came in.
- **Rendering.** The world is simulated in world px (`TILE` = 16) but drawn in art px, `T.art.px` (1.5) to a world px, so a tile is 24 art px (`ATILE`); convert with `ap()` and round to whole art px, and never draw a sprite at a non-integer scale. Letter-row sprites are enlarged 1.5× before shading (`scale15Rows`), except those redrawn by hand at the art's size, which are marked `artNative(rows)` and drawn to the size the old grid enlarged to, so anchors and hand points don't move. The `#view` canvas is one art px per canvas pixel, scaled up by whole device pixels, and the shorter side shows about `VIEW_MIN` (176) world px. Each frame has two layers, colour and emissive. It's lit in `lightScene` (ambient, plus each light source, in dithered bands, with emissive pixels at their own colour), then bloomed. A floor is painted once into pixel buffers (`art.js`), and the 3×3 tiles round a mined one are repainted. Sprites carry anchors `ax`/`ay` at the feet.
- **Art style.** `art.js` holds the palettes, sprites and tile painters for the chosen style (see DESIGN.md, Presentation). Only magitech glows. Rock tops are always darker than the floor, with lit rims and faces, so walls read as walls. Light numbers live in `T.light`.

## Testing changes

Drive the game headlessly with `puppeteer-core` through `test/lib.js` (`launch`, `openGame`). Wait 450 ms after a screen opens before tapping. `Input.bot = { x, y, main, off, mine, act }` drives the controls, and `UI.acts` runs any screen button. `test/botlib.js`'s `installBot` adds `Bot.sortie`, `Bot.home` and `Bot.career`, which play whole sorties and careers; use them to check balance after changing numbers. One-off scripts and screenshots go in `test/out/` (gitignored). Look at the screenshots for visual changes.

## Conventions

- Comments and in-game text are plain English. Match the surrounding density.
- Commits go to `main` with short sentence-case subjects. Every push to `main` deploys once the tests pass.
