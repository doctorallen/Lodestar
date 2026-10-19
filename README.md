# Lodestar

A top-down pixel-art mining and looting game for the phone browser, upright or sideways. You're a Kindler: you rode a seed-star down to a dead world to plant it, and it struck wrong and sank into a sinkhole. Carry its light out, mine arcane ore, kindle the land a territory at a time, and get back to a spire before the dark takes your haul.

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
| Set out / step through / bank / light / plant | The button that appears at a portal, a spire, a waystone or a heart | E / Enter |
| Travel | TRAVEL, over BANK at a spire | |
| Cargo | CARGO in the top bar | I |
| Pause (and the MUSIC and SOUNDS settings) | II | Esc / P |

The loop:
1. The outpost's portal opens the world map: walk out into a territory next to the outpost, or set out to a spire.
2. Cross from territory to territory by the openings at their edges. Mine ore and fight what finds you.
3. Watch the gold meter, your light: it drains in dark land and fills in kindled land. When it's gone, something hunts you.
4. Light a territory's waystones or seal the tear at its heart, then plant a spire there, and it's kindled for good.
5. At a spire, BANK your cargo, or TRAVEL to another spire or home. An emergency recall works anywhere and loses part of the cargo.
6. If you fall, the cargo is lost and you wake at the last spire you touched, but what you wear and what's in your pocket are safe.
7. Some territories have a portal down into a Deep: a short dungeon of richer ore.

At home, walk the outpost's stations:
- the forge: strike the anvil well for better odds; its Codex shows the resonances found;
- the rune bench: rework affixes;
- the locker: your gear, and each caster's circuit, built from stones for free;
- the star's altar: feed it ore to grow it;
- the uplink: the *Meridian* in orbit, the shards, the echoes, and calling the colony down;
- the portal: the world map, to set out again.

## Files

Every file is a classic script sharing one global scope, loaded in order by `index.html`.

| File | What's in it |
|---|---|
| `js/util.js` | DOM shortcut, error capture, seeded `Rng`, maths, colours, sprite helpers |
| `js/version.js` | The build stamp, written by `.githooks/pre-commit` |
| `js/tuning.js` | Every gameplay number, the ores, exotics and biomes |
| `js/save.js` | The save in localStorage |
| `js/audio.js` | Sound, made in code with Web Audio: the engine (started by the first tap, suspended when hidden, the settings), the effects, and `snd(name, opts)`, the hook the game calls |
| `js/music.js` | The music that grows with the star and thins in the dark, each place's own sound, the turn's unease; footsteps, heartbeat, stings and landers it listens for |
| `js/floor.js` | Seeded floor generation: rooms, corridors, veins, portals' places, lodeline |
| `js/world.js` | The world: its rings of territories laid out from the save's seed, their neighbours, climes, names and goals; each territory's map (`generateTerritory`) with its openings, heart and waystones |
| `js/art.js` | The art style: palettes, sprite builder, enemies, item icons, cave painting |
| `js/paint.js` | The painted style (docs/PAINTED.md): stroke ramps and strokes, the ground's tones, the rock rising as a heightfield from a steep three-quarter camera, occlusion, lazy painting in chunks, and the painted sprite builder |
| `js/flora.js` | Each biome's flora: sprites, palettes and how they anchor |
| `js/climes.js` | Climes: each one's palette, flora, critters and weather; rolling and naming them |
| `js/story.js` | The story: the opening, Wick's lines, the star's words, the echoes, the shards, the landers and the endings; the kindled log's lines; the settlers |
| `js/hub.js` | The outpost: stations, the star over the pit, lanterns, the uplink, the settlement's tents, feeding the star |
| `js/anvil.js` | The forging minigame, and the reveal of what arrives |
| `js/diver.js` | The player's sprite, painted: the Kindler's five facings, walk frames, cast poses, hand points and brow lamp; Wick |
| `js/circuits.js` | Circuits: the Forms, Elements and Glyphs in words, reading a caster's slots (and linked pairs), its charge and its words, ore affinity; casting each Form, triggers, echoes, fields; what's in flight and what lingers |
| `js/blueprints.js` | What can be forged: blueprints (casters, gear, stones), creature parts |
| `js/art2.js` | Art for crafting and the story: new item icons, parts, stones, the uplink, a tent, the Shard Keepers |
| `js/art3.js` | The sunlit surface's palette and plants, the rift, tool icons |
| `js/foesart.js` | Each clime's own creature: its frames drawn by hand at 24 px, and its colours |
| `js/items.js` | Affixes, rarities, legendaries, the set, casters and stones, relics; the forge, rune bench, salvage; stats |
| `js/game.js` | Game state, a sortie's play: walking, mining, your light, channels, and how it ends |
| `js/enemies.js` | Spawning, the flow field, each enemy's behaviour, their shots |
| `js/foes.js` | Each clime's own creature: where it's placed, what it does, its tells and signs |
| `js/combat.js` | The hands' buttons, the dash, damage, kills and drops, pickups, cargo |
| `js/rifts.js` | Rifts: grafts, ore wakes, gates, inversions; sealing for riftglass |
| `js/portals.js` | The portals: a Deep's, its ways on and the outpost's, drawn in their destination's colour; stepping through, and the same moment crossing an edge or travelling |
| `js/frontier.js` | Playing the world: sorties, entering territories, your light, spires (banking and travel), waystones and kindling, the Deeps, a fall waking at a spire; the spire and waystones drawn |
| `js/storm.js` | The Lodestorm's strikes on the surface; rift-touched elites from open tears |
| `js/contracts.js` | The three posted contracts, their tallies and rewards |
| `js/tools.js` | The carried tools: compass, ore sense, radar, map, satchel, beacon |
| `js/hazards.js` | Each clime's hazard at play (pools, ice, lava, vents, spores), and painting a clime's ground |
| `js/life.js` | Ambient life and weather (cosmetic): critters, cloud shadows, dust, drips |
| `js/undergrowth.js` | How flora grows into a place (cosmetic): habitat, drifts, stands of tall grass, beds and ground cover painted into the floor, moss and roots on the walls, wind and stir |
| `js/shadow.js` | Shadows from the light: the rock stops the diver's lamp (and the floor's fixed lights) |
| `js/pshadow.js` | Cast shadows of what stands on the ground: silhouettes from the lamp, the sun and the outpost's lanterns, and contact shadows |
| `js/render.js` | The pixel view (art px, 1.5 to a world px), the floor canvas, lighting and bloom, sparks |
| `js/castfx.js` | How a cast looks (cosmetic): the flash at the fist, the rune circle, motes, swept rings, an Arc's crescent, a Glaive's blades, an Orb, bolts' trails, bursts and marks on the ground |
| `js/natures.js` | What each enemy is weak to and resists (`elementMultFor`), by kind, clime and elite affix; what Wick has learned; the marks over a foe and the WEAK and RESIST numbers |
| `js/reactions.js` | Elements' statuses on enemies and the reactions between them (Shatter, Conduct, Steam…), the self stacks (Overload, Freeze…), and how they look |
| `js/resonance.js` | The six resonances as spells (Thunderhead, Shatterglass, Kindling Arc, Wildfire, Stormglaive, Starfall) and how they look; the Codex and resonance stones |
| `js/input.js` | Joystick, buttons, keyboard, and `Input.bot` for the tests |
| `js/ui.js` | The Lodestar, forge, gear, star, cargo and pause screens, the report, the item card (with a caster's circuit and the drawer of stones), the top bar |
| `js/worldmap.js` | The world map (SET OUT at the portal, TRAVEL at a spire) in pixel art, a territory's card, and the heart goal over the view |
| `js/main.js` | Boot, the fixed-step loop, the upright and sideways layouts |
| `test/` | Static checks, floor and world generation with golden hashes, the loot tables, a headless smoke run, and the autopilot (`botlib.js`) playing careers |

## Tests

```sh
npm ci       # test tools only
npm test     # everything CI runs
node test/bot.js --careers 4 --dives 40   # longer balance runs; results in test/out/balance.json
```
