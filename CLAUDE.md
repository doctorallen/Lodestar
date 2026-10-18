# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Lodestar is a top-down pixel-art mining and looting game for the phone browser (upright, or sideways with `#app.wide`) in plain JavaScript: no build step, no dependencies, no modules. Read `README.md` for the file map and controls, `js/tuning.js` for every number, `DESIGN.md` for the plan, and `DECISIONS.md` before changing a design decision. Log any new major gameplay decision there. Sections of `DESIGN.md` marked **(proposed)** aren't settled; ask before building on them in a way that's hard to undo.

## Commands

```sh
python3 -m http.server 8000     # play at http://localhost:8000 (or open index.html)
npm ci                          # test tools only
npm test                        # everything CI runs
node test/gen.js --update       # re-record golden hashes after an intended generation change
git config core.hooksPath .githooks
```

## Architecture

- **Globals and load order.** Every file is a classic script in one global scope, loaded in order by `index.html` (`util.js` first, `main.js` last). A new file needs its `<script>` tag. `test/check.sh` fails on duplicate top-level names, so give helpers distinctive names.
- **Seeded generation.** Floors come from `generateFloor(seed, depth, biome)` using `Rng(hashInts(seed, depth, biome, …))`, never `Math.random`, so a floor can be rebuilt and the golden hashes stay stable. Mining yields and (later) combat and loot rolls use `Game.dive.rng`. Cosmetic effects may use `Math.random` (`FX_R`).
- **Time.** `Game.step(dt)` is one fixed 1/60 s step. The prospector runs on real time; the world runs on `dt * Game.timeScale`.
- **Modals.** A screen sets `Game.modal`, which stops the simulation. Opening one calls `Input.block()`, and its buttons ignore taps for 400 ms.
- **Rendering.** The world is drawn into the `#view` canvas at one game pixel per canvas pixel; CSS scales it up by whole device pixels, and the shorter side always shows at least `VIEW_MIN` (176) game px. A floor is painted once into its own canvas and tiles are repainted when mined. Sprites carry anchors `ax`/`ay` at the feet.
- **Tiles.** 16 px. Rock tops are darker than the ground, so walls read as walls; walls with ground in front of them show a lit face.

## Testing changes

Drive the game headlessly with `puppeteer-core` through `test/lib.js` (`launch`, `openGame`). Wait 450 ms after a screen opens before tapping. `Input.bot = { x, y, mine, act }` drives the controls. One-off scripts and screenshots go in `test/out/` (gitignored). Look at the screenshots for visual changes.

## Conventions

- Comments and in-game text are plain English. Match the surrounding density.
- Commits go to `main` with short sentence-case subjects. Every push to `main` deploys once the tests pass.
