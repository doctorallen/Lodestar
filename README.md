# Lodestar

A top-down pixel-art mining and looting game for the phone browser, upright or sideways. A fallen star hangs over a sinkhole on an alien world. Dive beneath it, mine arcane ore, and get out along one of its lodelines before the dark takes your haul.

`DESIGN.md` is the plan; `DECISIONS.md` says why things are the way they are.

**Play locally:** `python3 -m http.server 8000`, then open http://localhost:8000 (or open `index.html` directly).

## How to play

| | Phone | Keyboard |
|---|---|---|
| Move | Left thumb, anywhere on the left deck | WASD / arrows |
| Mine (hold) | MINE | Space / J |
| Descend / extract | The button that appears on a shaft or lodeline | E / Enter |
| Pause | II | Esc / P |

## Files

Every file is a classic script sharing one global scope, loaded in order by `index.html`.

| File | What's in it |
|---|---|
| `js/util.js` | DOM shortcut, error capture, seeded `Rng`, maths, colours, sprite helpers |
| `js/version.js` | The build stamp, written by `.githooks/pre-commit` |
| `js/tuning.js` | Every gameplay number, the ores and the biomes |
| `js/save.js` | The save in localStorage |
| `js/floor.js` | Seeded floor generation: rooms, corridors, veins, shaft, lodeline |
| `js/game.js` | Game state, the dive, walking, mining, leaving |
| `js/render.js` | The pixel view, the floor canvas, sprites, sparks |
| `js/input.js` | Joystick, buttons, keyboard, and `Input.bot` for the tests |
| `js/ui.js` | The Lodestar and pause screens, the top bar, toasts |
| `js/main.js` | Boot, the fixed-step loop, the upright and sideways layouts |
| `test/` | Static checks, floor generation with golden hashes, a headless smoke run |

## Tests

```sh
npm ci       # test tools only
npm test     # everything CI runs
```
