# Lodestar

A top-down pixel-art mining and looting game for the phone browser, upright or sideways. You're a Kindler on your first terraform: the seed-star is planted in the middle of a dead world, the Charter's base round it, and growing it is your job. Carry its light out, mine arcane ore, kindle the land a territory at a time, and get back to a spire before the dark takes your haul.

`DESIGN.md` is the plan; `DECISIONS.md` says why things are the way they are.

**Play locally:** `python3 -m http.server 8000`, then open http://localhost:8000 (or open `index.html` directly).

## How to play

| | Phone | Keyboard |
|---|---|---|
| Move | Left thumb, anywhere on the left deck | WASD / arrows |
| Spell A, from the right wrist (an Arc combos): tap to cast, hold to charge | The big button | J |
| Spell B, from the left wrist | The blue button | K |
| Dash | DASH, or flick the move thumb | Shift / U |
| Mine | MINE, held | Space / L |
| Set out / climb down / bank / light / plant | The button that appears at the portal, a hole, a spire, a waystone or a heart | E / Enter |
| Travel | TRAVEL, over BANK at a spire | |
| Cargo (and MAKE: supplies from the ore carried) | CARGO in the top bar | I |
| Use a Mending Injector / a Lightcell | MEND / LIGHT, the two small buttons at the right deck's top | Q / R |
| Pause (the MUSIC, SOUNDS and LAMP settings, FINE GRAIN, and START OVER) | II | Esc / P |
| How it works (the HUD; a screen's own ? in its header) | ? in the top bar | |

The loop:
1. Walk out of any of the outpost's openings into the land next to it, or take its portal: the world map, to set out to a spire.
2. Cross from territory to territory by the openings at their edges. Mine ore and fight what finds you.
3. Watch the gold meter, your light: it lasts about three minutes in dark land and fills in kindled land. When it's gone, something hunts you.
4. Light a territory's waystones or seal the tear at its heart, then plant a spire there, and it's kindled for good, and its heartlight is yours for the star. A spire holds only where the star's light reaches: ring 2 from magnitude 3, ring 3 from 5, the Edge from 7.
5. Carry as much as you like. At a spire, BANK your cargo, or TRAVEL to another spire or home. An emergency recall works anywhere and loses nothing, but you stand still for a few seconds.
6. If you fall, you wake at the last spire you touched. What you wear and your supplies are safe; all the cargo waits where you fell, in your pack, to go back for once. Fall again first and it's lost.
7. Some territories have a hole down into a Deep: a short dungeon of richer ore. Its end, the first time, gives deeplight for the star, as do ancient forges and echoes.

A new game starts with the essentials: after the opening, Wick offers to walk you through your first landing, and the rest of the outpost wakes as its moment comes (a station not yet awake stands dark, OFFLINE). Each screen's ? replays its tutorial and a short reference; the ? in the top bar walks the HUD.

At home, walk the outpost's stations:
- the forge: recipes, each saying exactly what it makes and costs, and the BUILDINGS tab, where the outpost's buildings are built (each comes down to its plot; once the Drone Bay stands, walk up to it to fit Wick with upgrades); it studies anything new you bring home and reveals what it can make from it; strike the anvil well and it adds to the piece; its Codex shows the resonances found so far; SUPPLIES beside it makes Mending Injectors and Lightcells from your plainest ore, upgrades the Refinery (each level makes both stronger) and refines ore up a grade once it stands;
- the locker (LOCKER in the top bar, anywhere at home, or at its station): your gear (crafted bases), the rig's two spells, each a Form, an Element and a Mod core (and the extra part a better frame's ore gives); changing them is free; the spare cores, the same ones stacked; a core's card merges three of a kind into one a tier denser, or salvages a spare into ore;
- the tuning bench: every core in one list, set in the rig first, the stash's stacked, three of a kind to MERGE;
- the star's altar: hold FEED THE STAR and the light your deeds earned (heartlight, deeplight) rises into it, until you let go; its screen shows the light waiting, the Spectrum (each band of the star's light, and GIVE to pour the stash's ore of that kind into it), its reach, and spends attunements;
- the uplink: the *Meridian* in orbit and its sleepers, the Spectrum against the Charter's spec, the shards, and the echoes;
- the portal: what's next (one goal, also shown over the view at home), the world map (with what each territory's kindling and Deep would give the star, and your pack), to set out to a spire, and the tools (each always on once made at the forge); or walk out of any opening on the outpost's edge.

Where there's WebGL2 the whole frame is drawn by the GPU (`docs/RENDERING.md`): one canvas, nothing read back. `?nogpu` in the address keeps the 2D canvases and the JavaScript lighting, as a browser without WebGL2 gets; `?perf` shows a readout over the frame (which path draws, what a frame costs, how the frames are spaced, the first error) for seeing what a phone sees.

FINE GRAIN, on the pause screen at home, draws the world at twice the art's pixels (3 to a world pixel, so the painted ground, the rock and the Kindler come out sharper, and the other sprites keep their look at the same size). It needs WebGL2, costs about twice the frame, and reloads the game; it's meant for a desktop or a strong phone. `?fine` or `?coarse` in the address overrides it.

## Files

Every file is a classic script sharing one global scope, loaded in order by `index.html`.

| File | What's in it |
|---|---|
| `js/util.js` | DOM shortcut, error capture, seeded `Rng`, maths, colours, sprite helpers |
| `js/version.js` | The build stamp, written by `.githooks/pre-commit` |
| `js/tuning.js` | Every gameplay number, the ores, exotics and biomes |
| `js/save.js` | The save in localStorage, and an older save's casters turned into rig frames and its circuits into the rig's two spells |
| `js/loader.js` | The loading screen, the Charter's systems booting up: a list of tasks (`loaderAdd`) run in slices with an honest bar, building ahead what play would otherwise build mid-fight (the sound bank, every Kindler frame, the place you'll land in, painted and drawn once, ring 1's creatures and plants), then TAP TO BEGIN |
| `js/audio.js` | Sound, made in code with Web Audio: the engine (started by the first tap, suspended when hidden, the settings), the effects (the opening's cues among them), and `snd(name, opts)`, the hook the game calls |
| `js/music.js` | The music that grows with the star and thins in the dark, each place's own sound, the turn's unease; footsteps, heartbeat, stings and landers it listens for |
| `js/sndbank.js` | The fight's sounds and the footsteps, layered and rendered ahead into a few variants each with an OfflineAudioContext (which needs no tap): every sound's first while the game loads, the rest while the loading allows, else in idle time; a play is only a buffer |
| `js/floor.js` | Seeded floor generation: rooms, corridors, veins, portals' places, lodeline; the outpost's site, its openings and its plan (its pads and the buildings' plots) |
| `js/world.js` | The world: its rings of territories laid out from the save's seed, their neighbours, climes, names and goals; each territory's map (`generateTerritory`) with its openings, heart and waystones |
| `js/art.js` | The art style: palettes, sprite builder, enemies, item icons, cave painting |
| `js/paint.js` | The painted style (docs/PAINTED.md): stroke ramps and strokes, the ground's tones, the rock rising as a heightfield from a steep three-quarter camera, occlusion, lazy painting in chunks, and the painted sprite builder |
| `js/flora.js` | Each biome's flora: sprites, palettes and how they anchor |
| `js/climes.js` | Climes: each one's palette, flora, critters and weather; rolling and naming them |
| `js/story.js` | The story: the opening's captions, Wick's lines, the star's words, the echoes, the shards and the endings; the kindled log's lines |
| `js/hub.js` | The outpost: stations, the star over its cradle and its lodelines across the ground, light masts, starstone, the uplink, the settlement's landers and pods, feeding the star the light of deeds (held at its altar) |
| `js/hubart.js` | The outpost, painted: the Charter's modules and the buildings, the star and its cradle, starstone, light masts, landers, pods and people; the ancient forges in the land |
| `js/hubground.js` | The outpost's ground: packed earth, the starstone spreading from the cradle as the star grows, its edges melding into each neighbour's land (ground, plants, rock), the landing pads and the buildings' plots, faint trodden tracks; `outpostGroundAt` (what's underfoot) |
| `js/anvil.js` | The forging minigame (its quality only adds), and the reveal of what arrives |
| `js/intro.js` | The opening: five painted scenes that play on their own (the crossing, the survey, the landing, the Meridian, the outpost), their captions, SKIP and tap to hurry, and the last shot drawn by the game itself as the modules wake, the camera comes down and the Kindler steps out of their pod and is handed over |
| `js/diver.js` | The player's sprite, painted: the Kindler posed and rendered in five facings (idle, walk, dash and cast), the bubble helm, the rig's sleeves and lenses, gloved hands, the amber trim, hand points and brow lamp; Wick |
| `js/circuits.js` | Spells: the Forms, Elements and Mods in words, the rig's two spells (a Form, an Element, one or two Mods), their charge, name and line, the resonances they wake, ore affinity; casting each Form, echoes, fields; what's in flight and what lingers |
| `js/blueprints.js` | What can be made: the recipes (bases, rig frames, cores, tools) and their costs, research (what reveals each), creature parts |
| `js/art2.js` | Art for crafting and the story: new item icons (the rig frame), parts, cores, the uplink, a tent, the Shard Keepers |
| `js/art3.js` | The sunlit surface's palette and plants, the rift, tool icons |
| `js/foesart.js` | Each clime's own creature: its frames drawn by hand at 24 px, and its colours |
| `js/items.js` | Affixes (the bonuses patterns print), legendaries; crafted bases (their stats, a frame's slots), cores (a kind and a tier, a pattern printed on as it's forged), relics; forging, salvage, the stats an outfit adds up to, comparing two pieces |
| `js/modules.js` | Cores on the ground: what a kill leaves (an elite the core its affix names, a warden or a Keeper a legendary), relics, research, old saves' gear turned into bases and cores, and how a core looks on the ground and as it's caught |
| `js/patterns.js` | A core is its name, and the pattern is what you learned: each creature kind's pattern, the suit reading kinds as they fall, printing a pattern onto a forged core for the creature's parts, legendary cores, the same cores stacked and three folded into one a tier denser, an older save's rolled cores and threads converted |
| `js/game.js` | Game state, a sortie's play: walking, mining, your light, channels, and how it ends |
| `js/enemies.js` | Spawning, the flow field, each enemy's behaviour, their shots |
| `js/affixes.js` | Elite affixes (Fast, Warded, Frosted, Mortar, Chained, Bulwark, Broodmother, Hulking, Splitter, Leech, Blinker, Thorned…): what each does, how it's rolled and shown |
| `js/foes.js` | Each clime's own creature: where it's placed, what it does, its tells and signs |
| `js/combat.js` | The hands' buttons, the dash, damage, kills and drops, pickups, cargo |
| `js/rifts.js` | Rifts: grafts, ore wakes, gates, inversions; sealing for riftglass |
| `js/portals.js` | The outpost's portal, and the ways in the field: a hole down into a Deep and on through its sites, the rope up from its last; going through, and the same moment crossing an edge or travelling |
| `js/frontier.js` | Playing the world: sorties, entering territories, your light, spires (banking and travel), waystones and kindling, the Deeps, a fall waking at a spire; the spire and waystones drawn |
| `js/storm.js` | The Lodestorm's strikes on the surface; rift-touched elites from open tears |
| `js/spectrum.js` | The Spectrum: the star's light has a band for each ore, deepened by the ore given at the altar; a land's band at depth 1 lets the star kindle it; the Meridian's marks, which every band must reach before its sleepers wake; the bars in the top bar and on the screens |
| `js/terraform.js` | Kindled land terraforming by the light: starstone spreading from a territory's spire, gold veins running on through the land, the ground greening, lit motes |
| `js/deeds.js` | The star grows from deeds: heartlight and deeplight, what each deed gives, the star's reach over the rings, the pack a fall leaves and recovering it, what's next from home, and rescaling an older save's star |
| `js/lattice.js` | The Lattice, the world under the world: the Deeps joined by tunnels into one web of galleries laid out from the save's seed (a shaft gallery under every Deep, junctions between), each built as a territory is, with no sky and the light always draining; the cold spires of Kindlers before, relit by a hold into spires of your own (bank, travel, your light back); the map's second layer |
| `js/tools.js` | The tools, each made once and always on: compass, ore sense, radar, map, beacon, lens |
| `js/hazards.js` | Each clime's hazard at play (pools, ice, lava, vents, spores), and painting a clime's ground |
| `js/life.js` | Ambient life and weather (cosmetic): critters, cloud shadows, dust, drips |
| `js/undergrowth.js` | How flora grows into a place (cosmetic): habitat, drifts, stands of tall grass, beds and ground cover painted into the floor, moss and roots on the walls, wind and stir |
| `js/shadow.js` | Shadows from the light: the rock stops the diver's lamp (and the floor's fixed lights) |
| `js/pshadow.js` | Cast shadows of what stands on the ground: silhouettes from the lamp, the sun and the outpost's lanterns, and contact shadows |
| `js/gpu.js` | The frame on the GPU: the view as one WebGL2 canvas, a batcher standing in for the 2D contexts (every sprite, dot and rectangle a quad; sprites in atlas pages, the floor's painted buffers as textures, the rock put back over an actor in the shader), the bloom and the last pass that shows it; the 2D canvases stand in without WebGL2 |
| `js/gllight.js` | The light pass of the GPU's frame: the lighting as a WebGL2 shader over the scene's framebuffer, the light's cells as a texture; the JavaScript lighting stands in without WebGL2 |
| `js/perf.js` | The `?perf` readout over the frame: the path, the frame's cost, the frames' spacing, the ground painted in-frame, the draws, the first error |
| `js/render.js` | The pixel view (art px, 1.5 to a world px), the frame drawn in order, the JavaScript lighting and bloom for the 2D path, sparks |
| `js/castfx.js` | How a cast looks (cosmetic): the Charter's technology: the muzzle at the wrist, the circuit sigil, lock-ons, motes, swept rings, an Arc's crescent, a Glaive's blades, an Orb, slugs and beams, a lance's scar, a Well, a Ward, impacts and marks on the ground |
| `js/hardlight.js` | The hard-light shapes the spells are built from: crisp lines, diamonds, hexagons, lock-on brackets, sigils, pressure waves, lattices, the seed-star; `castfxWarm()` paints them before a fight |
| `js/natures.js` | What each enemy is weak to and resists (`elementMultFor`), by kind, clime and elite affix; the badges over a foe, the WEAK and RESIST numbers and the hit's ring |
| `js/reactions.js` | Elements' statuses on enemies and the reactions between them (Shatter, Conduct, Steam…), the self stacks (Overload, Freeze…), and how they look |
| `js/resonance.js` | The six resonances as spells (Thunderhead, Shatterglass, Kindling Arc, Wildfire, Stormglaive, Starfall) and how they look; the Codex and resonance traces |
| `js/input.js` | Joystick, buttons, keyboard, and `Input.bot` for the tests |
| `js/ui.js` | The Lodestar, star, cargo and pause screens, the report, the screens' plumbing, the rig's spells on its card (and the drawer of cores), the top bar |
| `js/gearui.js` | The gear screens: the forge (recipes by tab, close to making, research's reveal), the locker, the tuning bench, and the cards for a base (a rig's spells and the drawer of cores) and a core (its bonus, its power, UPGRADE and SALVAGE) |
| `js/structures.js` | The outpost's buildings (the Drone Bay, the Refinery, the Forward Relay, the Settlers' Quarters): built once at the forge, coming down to their plots, drawn there, and what each does |
| `js/wick.js` | Wick's upgrades (the Scanner, the Lamp, the Hex Shield, the Spark): fitted and turned off and on at the Drone Bay, and at work out in the land |
| `js/supplies.js` | The two supplies (Mending Injector, Lightcell): their cost in ore, making them at home and in the field, their two deck buttons, using them, the SUPPLIES screen, and an older save's supplies converted |
| `js/worldmap.js` | The world map (SET OUT at the portal, TRAVEL at a spire) in pixel art, a territory's card, and the heart goal over the view |
| `js/onboard.js` | Bringing a new Kindler in: what's awake yet (each unlock worked out from progress, everything for an old save), Wick's offer after the opening, the guided first landing (its line over the view, the button it pulses, the marker on the world), the dark stations |
| `js/tutor.js` | The tutorials, as data a screen each: the dim with its holes, Wick's line, the step done when it's done; SKIP, the ? in each header and the top bar, and each screen's short reference |
| `js/main.js` | Boot, then the loading (`bootEnter` after its tap), the fixed-step loop, the upright and sideways layouts |
| `test/` | Static checks, floor and world generation with golden hashes, the gear tables (bases, cores, the bench, the migration of `fixtures/`, saves made before modules), a headless smoke run, and the autopilot (`botlib.js`) playing careers |

## Tests

```sh
npm ci       # test tools only
npm test     # everything CI runs
node test/bot.js --careers 4 --dives 40   # longer balance runs; results in test/out/balance.json
node test/gllight.js                      # the GPU's frame against the 2D path's, pixel for pixel, with WebGL in software
```
