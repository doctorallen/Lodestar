# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Lodestar is a top-down pixel-art mining and looting game for the phone browser (upright, or sideways with `#app.wide`) in plain JavaScript: no build step, no dependencies, no modules. Read `README.md` for the file map and controls, `js/tuning.js` for every number, `DESIGN.md` for the plan, and `DECISIONS.md` before changing a design decision. Log any new major gameplay decision there. Sections of `DESIGN.md` marked **(proposed)** aren't settled; ask before building on them in a way that's hard to undo.

## Commands

```sh
python3 -m http.server 8000     # play at http://localhost:8000 (or open index.html)
npm ci                          # test tools only
npm test                        # everything CI runs
node test/gen.js --update       # re-record golden hashes after an intended generation change
node test/bot.js --careers 4 --dives 40   # longer balance runs; results in test/out/balance.json
git config core.hooksPath .githooks
```

## Architecture

- **Globals and load order.** Every file is a classic script in one global scope, loaded in order by `index.html` (`util.js` first, `main.js` last). A new file needs its `<script>` tag. `test/check.sh` fails on duplicate top-level names, so give helpers distinctive names.
- **Seeded generation.** Floors come from `generateFloor(seed, depth, biome)` using `Rng(hashInts(seed, depth, biome, …))`, never `Math.random`, so a floor can be rebuilt and the golden hashes stay stable. Enemy placement uses its own seeded Rng per floor. Mining yields, combat rolls and drops use `Game.dive.rng`; crafting and the rune bench use `Save.rng()`. Cosmetic effects may use `Math.random` (`FX_R`).
- **Time.** `Game.step(dt)` is one fixed 1/60 s step. The prospector runs on real time; the world runs on `dt * Game.timeScale`.
- **Modals.** A screen sets `Game.modal`, which stops the simulation. Opening one calls `Input.block()`, and its buttons ignore taps for 400 ms. Screen buttons carry `data-act`/`data-arg`, run through `UI.acts`, and the screen redraws.
- **The save.** Nothing about a dive is saved until it ends (extract or fall), so equipping mid-dive can't be used to smuggle loot out by closing the page.
- **Rendering.** The world is drawn into the `#view` canvas at one game pixel per canvas pixel; CSS scales it up by whole device pixels (whole scales keep the dithering still), and the shorter side always shows at least `VIEW_MIN` (176) game px. Each frame has two layers, colour and emissive. It's lit in `lightScene` (ambient, plus each light source, in dithered bands, with emissive pixels at their own colour), then bloomed. A floor is painted once into pixel buffers (`art.js`), and the 3×3 tiles round a mined one are repainted. Sprites carry anchors `ax`/`ay` at the feet.
- **Art style.** `art.js` holds the palettes, sprites and tile painters for the chosen style (see DESIGN.md, Presentation). Only magitech glows. Rock tops are always darker than the floor, with lit rims and faces, so walls read as walls. Light numbers live in `T.light`.

## Testing changes

Drive the game headlessly with `puppeteer-core` through `test/lib.js` (`launch`, `openGame`). Wait 450 ms after a screen opens before tapping. `Input.bot = { x, y, main, off, mine, act }` drives the controls, and `UI.acts` runs any screen button. `test/botlib.js`'s `installBot` adds `Bot.dive`, `Bot.home` and `Bot.career`, which play whole dives and careers; use them to check balance after changing numbers. One-off scripts and screenshots go in `test/out/` (gitignored). Look at the screenshots for visual changes.

## Conventions

- Comments and in-game text are plain English. Match the surrounding density.
- Commits go to `main` with short sentence-case subjects. Every push to `main` deploys once the tests pass.
