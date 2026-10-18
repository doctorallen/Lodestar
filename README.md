# Lodestar

A top-down pixel-art mining and looting game for the phone browser, upright or sideways. A fallen star hangs over a sinkhole on an alien world. Dive beneath it, mine arcane ore, and get out along one of its lodelines before the dark takes your haul.

`DESIGN.md` is the plan; `DECISIONS.md` says why things are the way they are.

**Play locally:** `python3 -m http.server 8000`, then open http://localhost:8000 (or open `index.html` directly).

## How to play

| | Phone | Keyboard |
|---|---|---|
| Move | Left thumb, anywhere on the left deck | WASD / arrows |
| Main hand (cast its caster's circuit; an Arc combos): tap to cast, hold to charge | The big button | J |
| Off hand | The blue button | K |
| Dash | DASH, or flick the move thumb | Shift / U |
| Mine | MINE, held | Space / L |
| Set out / step through / extract | The button that appears at a portal or in a lodeline | E / Enter |
| Cargo | CARGO in the top bar | I |
| Pause | II | Esc / P |

The loop:
1. Set out through the outpost's portal into a biome the Lodestar reaches; at each site's exit, step through one of two portals to the next.
2. Mine ore and fight what finds you.
3. Watch the gold meter: the star's pull on each floor fades, and when it's gone the lodeline goes dark and something hunts you.
4. Stand still in a lodeline's gold beam and EXTRACT to bank your cargo, or use an emergency recall from anywhere and lose part of it.
5. If you fall, the cargo is lost, but what you wear and what's in your pocket are safe.

At home, walk the outpost's stations:
- the forge: strike the anvil well for better odds;
- the rune bench: rework affixes;
- the locker: your gear, and each caster's circuit, built from stones for free;
- the star's altar: feed it ore to grow it and open deeper biomes;
- the portal: set out again.

## Files

Every file is a classic script sharing one global scope, loaded in order by `index.html`.

| File | What's in it |
|---|---|
| `js/util.js` | DOM shortcut, error capture, seeded `Rng`, maths, colours, sprite helpers |
| `js/version.js` | The build stamp, written by `.githooks/pre-commit` |
| `js/tuning.js` | Every gameplay number, the ores, exotics and biomes |
| `js/save.js` | The save in localStorage |
| `js/floor.js` | Seeded floor generation: rooms, corridors, veins, portals' places, lodeline |
| `js/art.js` | The art style: palettes, sprite builder, enemies, item icons, cave painting |
| `js/flora.js` | Each biome's flora: sprites, palettes and how they anchor |
| `js/climes.js` | Climes: each one's palette, flora, critters and weather; rolling and naming them |
| `js/story.js` | The story: the opening, Wick's lines, the star's words, the echoes, the shards and the beacon |
| `js/hub.js` | The outpost: stations, the star over the pit, lanterns, feeding the star |
| `js/anvil.js` | The forging minigame, and the reveal of what arrives |
| `js/diver.js` | The player's sprite: the circuit diver's five facings, walk frames and hand points |
| `js/circuits.js` | Circuits: the Forms, Elements and Glyphs in words, reading a caster's slots, its charge and its words; casting each Form, triggers, echoes, fields; what's in flight and what lingers |
| `js/blueprints.js` | What can be forged: blueprints (casters, gear, stones), creature parts |
| `js/art2.js` | Art for crafting and the story: new item icons, parts, stones, the wreck, the Shard Keepers |
| `js/art3.js` | The sunlit surface's palette and plants, the rift, tool icons |
| `js/foesart.js` | Each clime's own creature: its frames drawn by hand at 24 px, and its colours |
| `js/items.js` | Affixes, rarities, legendaries, the set, casters and stones, relics; the forge, rune bench, salvage; stats |
| `js/game.js` | Game state, the dive, walking, mining, leaving |
| `js/enemies.js` | Spawning, the flow field, each enemy's behaviour, their shots |
| `js/foes.js` | Each clime's own creature: where it's placed, what it does, its tells and signs |
| `js/combat.js` | The hands' buttons, the dash, damage, kills and drops, pickups, cargo |
| `js/rifts.js` | Rifts: grafts, ore wakes, gates, inversions; sealing for riftglass |
| `js/portals.js` | The portals: each way on and the outpost's, drawn in their destination's colour; stepping through |
| `js/storm.js` | The Lodestorm's strikes on the surface; rift-touched elites from open tears |
| `js/contracts.js` | The three posted contracts, their tallies and rewards |
| `js/tools.js` | The carried tools: compass, ore sense, radar, map, satchel, beacon |
| `js/hazards.js` | Each clime's hazard at play (pools, ice, lava, vents, spores), and painting a clime's ground |
| `js/life.js` | Ambient life and weather (cosmetic): critters, cloud shadows, dust, drips |
| `js/undergrowth.js` | How flora grows into a place (cosmetic): habitat, drifts, stands of tall grass, beds and ground cover painted into the floor, moss and roots on the walls, wind and stir |
| `js/shadow.js` | Shadows from the light: the rock stops the diver's lamp (and the floor's fixed lights), and big things cast a short shadow away from it |
| `js/render.js` | The pixel view (art px, 1.5 to a world px), the floor canvas, lighting and bloom, sparks |
| `js/castfx.js` | How a cast looks (cosmetic): the flash at the fist, the rune circle, motes, swept rings, an Arc's crescent, a Glaive's blades, an Orb, bolts' trails, bursts and marks on the ground |
| `js/input.js` | Joystick, buttons, keyboard, and `Input.bot` for the tests |
| `js/ui.js` | The Lodestar, set out, forge, gear, star, cargo and pause screens, the item card (with a caster's circuit and the drawer of stones), the top bar |
| `js/main.js` | Boot, the fixed-step loop, the upright and sideways layouts |
| `test/` | Static checks, floor generation with golden hashes, the loot tables, a headless smoke run, and the autopilot (`botlib.js`) playing careers |

## Tests

```sh
npm ci       # test tools only
npm test     # everything CI runs
node test/bot.js --careers 4 --dives 40   # longer balance runs; results in test/out/balance.json
```
