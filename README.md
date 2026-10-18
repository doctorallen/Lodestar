# Lodestar

A top-down pixel-art mining and looting game for the phone browser, upright or sideways. A fallen star hangs over a sinkhole on an alien world. Dive beneath it, mine arcane ore, and get out along one of its lodelines before the dark takes your haul.

`DESIGN.md` is the plan; `DECISIONS.md` says why things are the way they are.

**Play locally:** `python3 -m http.server 8000`, then open http://localhost:8000 (or open `index.html` directly).

## How to play

| | Phone | Keyboard |
|---|---|---|
| Move | Left thumb, anywhere on the left deck | WASD / arrows |
| Main hand (swing a blade, cast a focus): tap for a combo, hold to charge | The big button | J |
| Off hand | The blue button | K |
| Dash | DASH, or flick the move thumb | Shift / U |
| Mine | MINE, held | Space / L |
| Descend / extract | The button that appears on a shaft or in a lodeline | E / Enter |
| Cargo | CARGO in the top bar | I |
| Pause | II | Esc / P |

The loop:
1. Descend into a biome the Lodestar reaches.
2. Mine ore and fight what finds you.
3. Watch the gold meter: the star's pull on each floor fades, and when it's gone the lodeline goes dark and something hunts you.
4. Stand still in a lodeline's gold beam and EXTRACT to bank your cargo, or use an emergency recall from anywhere and lose part of it.
5. If you fall, the cargo is lost, but what you wear and what's in your pocket are safe.

At home, walk the outpost's stations:
- the forge: strike the anvil well for better odds;
- the rune bench: rework affixes;
- the locker: your gear;
- the star's altar: feed it ore to grow it and open deeper biomes;
- the ledge: jump back in.

## Files

Every file is a classic script sharing one global scope, loaded in order by `index.html`.

| File | What's in it |
|---|---|
| `js/util.js` | DOM shortcut, error capture, seeded `Rng`, maths, colours, sprite helpers |
| `js/version.js` | The build stamp, written by `.githooks/pre-commit` |
| `js/tuning.js` | Every gameplay number, the ores, exotics and biomes |
| `js/save.js` | The save in localStorage |
| `js/floor.js` | Seeded floor generation: rooms, corridors, veins, shaft, lodeline |
| `js/art.js` | The art style: palettes, sprite builder, enemies, item icons, cave painting |
| `js/flora.js` | Each biome's flora: sprites, palettes and how they anchor |
| `js/story.js` | The story: the opening, Wick's lines, the star's words, the echoes, the shards and the beacon |
| `js/hub.js` | The outpost: stations, the star over the pit, lanterns, feeding the star |
| `js/anvil.js` | The forging minigame, and the reveal of what arrives |
| `js/diver.js` | The player's sprite: the circuit diver's five facings, walk frames and hand points |
| `js/blueprints.js` | What can be forged: blueprints, creature parts, elements |
| `js/art2.js` | Art for crafting and the story: new item icons, parts, the wreck, the Shard Keepers |
| `js/items.js` | Affixes, rarities, legendaries, the set, cores, relics; the forge, rune bench, salvage; stats |
| `js/game.js` | Game state, the dive, walking, mining, leaving |
| `js/enemies.js` | Spawning, the flow field, each enemy's behaviour, their shots |
| `js/combat.js` | Swings, spells, damage, kills and drops, pickups, cargo |
| `js/render.js` | The pixel view, the floor canvas, lighting and bloom, sparks |
| `js/input.js` | Joystick, buttons, keyboard, and `Input.bot` for the tests |
| `js/ui.js` | The Lodestar, descend, forge, gear, star, cargo and pause screens, the item card, the top bar |
| `js/main.js` | Boot, the fixed-step loop, the upright and sideways layouts |
| `test/` | Static checks, floor generation with golden hashes, the loot tables, a headless smoke run, and the autopilot (`botlib.js`) playing careers |

## Tests

```sh
npm ci       # test tools only
npm test     # everything CI runs
node test/bot.js --careers 4 --dives 40   # longer balance runs; results in test/out/balance.json
```
