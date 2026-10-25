# Lodestar: The Veins

The design, settled 2026-10-24 after the interview in DECISIONS.md. The prune that moved the game onto it landed the same day (step one of the build order below); the steps after it are **(proposed)** until built. Numbers here are first guesses for `T`; play moves them.

## Pillars

1. **One bar.** Your light is your health. There is no second meter anywhere.
2. **You are the star.** How much of the world lives is how strong you are. Nothing is allocated, bought or crafted.
3. **The world is drawn, not flooded.** Light runs in veins you lay by walking. The map fills in as a tree you chose.
4. **Read the dark.** Every creature has a tell and a window. Few spells, strong and slow; the hit in the window is what wins.

## The story

The Charter's ship, the *Meridian*, brought a seed-star to a dead world and everyone aboard sleeps until the world can be lived on. One was woken: the Kindler, made of the star rather than merely bonded to it: a body of lodestone shards held apart by its light, with a point of light in every joint, and a crystal of the star for a head, which is the lamp he sees by, thrown as a beam the way he's turned. Wick, a drone, is awake with him, dry and kind. The Kindler's work is to lay the star's light across the world in veins until the world lives.

What the player isn't told: the Kindler is the star's hand. When the veins are whole the star draws its light home, and him with it. The sleepers wake and come down to a living world, and no one meets them. Wick knows, and that is what his kindness is. Nothing before the ending may say it; the heart's glow at the star, the light that holds the Kindler's shards together growing with it, and Wick's silences are allowed to show it.

No one has been here before. The world is as the dark made it.

## The world

One continuous map, generated once a save from the seed and kept; the save holds the seed and what's been done. The floor generator is run large (320 × 320 tiles, about a kilometre a side at the Kindler's pace), with the climes laid as **regions** round the star (`regions.js`): nine or so countries each about four old sites across, the Badlands nearest the star, their borders melding over a few tiles (ground, rock and light blended; each clime's flora, hazards, creatures and critters its own). There are no sites, rings or portals: the world is the one place, and you walk it. Nothing in it regrows but the creatures.

**The Deep.** Under the surface lies a second floor the same size (`deep.js`): caverns in the cave climes (the Caverns under the star, then the Flooded Grotto, the Magma Tubes, the Rootdeep), with no sun and no star of its own. Shafts join the two where open ground lies over open ground: a hole in the surface the Kindler goes down (GO DOWN) and climbs back up, thread in hand if he has it, so a vein can run down a shaft and light the Deep, and its nodes are stood at from the map like any other. The map shows one layer at a time.

The star stands in the open at the middle, its heart hanging large over the ground as the Hollow Star's did, its tip clear of the ground with its shadow under it, so the Kindler walks under it and it's drawn over him there; the ground round it is lit from the start: the first node is the star.

Painting a map this size is done in a window of the floor that moves with the view (64 tiles square, 48 at fine grain; `paint.js PWIN`), not as one buffer: the buffers hold the window, the overlap is copied along when it moves, and the strip exposed is painted in chunks as the view comes to it.


**The world's edge.** The land ends in a drop into the dark: the outermost tiles are the void, black, the ground meets it with a lit lip, and rock that meets it shows its face over it, so the edge never reads as more ground to walk on.

## The light

- **Sources.** The star, every living node, and the veins between living nodes. A vein lights a band along it, 5 tiles to each side at first. The daylight is of the place, not of where you stand: kindled land has its day and the dark its dusk, cell by cell, so from inside the light you see it fading out at the edge before you walk into the dark.
- **Lit ground.** Your bar fills (full in about 4 s). Nothing hunts there. The land terraforms by the light's age: starstone along the vein, then green, then growth, then the clime's own life, spreading a tile or two a session (the terraforming code already written, keyed to veins instead of spires).
- **Dark ground.** Your bar drains, full to empty in 180 s, and the dark is awake. The drain is the same everywhere; distance from the star changes what lives there, not how fast you go dim.

## One bar

Light is health. The bar is 100. In the dark it drains at 100/180 a second; a hit takes a piece (creature damage retuned to the bar, a crawler's bite about 12, a Keeper's blow about 35); in light it fills fast. At nothing you fall.

Spells have no cost but a cooldown. There is no charge, no supplies, no healing items: the bar comes back in light and nowhere else, so a trip into the dark is a breath held.

## Falling

You wake at the nearest living node. The thread you were laying is gone. And the star dims a piece.

**The core.** The star has a core of 7 pieces, shown as the lit facets of its heart. A fall takes one; a node set gives one back, to the 7. At no pieces the star goes out, the world is lost and the save ends with its own short ending. So a run of falls without a node set between them is the way the game is lost, and careful laying is the way it isn't. (Open: whether 7 is kind enough; the bot will say.)

## Veins and nodes

A **node** is a shard of the star planted in the ground: the lodestar small, a crystal the star's colour hanging over the spot, dim and bare when dark. It is **living** if a chain of living veins joins it to the star, and **dark** if not.

**Laying a vein.** At the star or any living node, hold TAKE UP (1 s) and the thread is in your hand: a line of the star's light from the node to you. Walk. The thread pays out behind you along the path you walk, pressed into the ground as a seam of the star's gold where your feet went, lit as it's laid (a shade under a vein that's set, with a small light every couple of tiles): it is in the world, not drawn over it, and when the node sets the seam brightens along its whole length.

While threading:
- no DASH, and your step is 85% (until you plant: from then the thread ends at the node, and you fight round it on your own feet, dash and all);
- the thread has a length, your magnitude's reach (60 tiles at first); the HUD shows what's left as a second thin line under the bar;
- the dark is drawn to the thread: every 30 s of threading a wave wakes along it behind you, so a long thread is a long fight;
- a fall loses the thread.

**Planting.** Where you stand, on open ground 6 tiles or more from any node: hold PLANT (1 s) and a shard of the star takes root in the ground, and **the hold** begins: 18 s near the star, to 30 s at the far reaches, never longer. Over the hold the node forms in the air where the thread ends, a lodestar small: one faceted crystal of the star growing from a point to its height, hanging over its shadow in a halo of its own, the thread's light running into it a mote at a time. The node has its own light, which is its health; the dark comes in waves for it and for you, and a creature within reach of the node bites it. If the node's light goes out the shard shatters, the thread snaps back to its start, and nothing is lit; take up again. Its light grows with it: from the moment the shard takes root, the light the vein will cast spreads out from the thread's line and round the node, a little further as the node grows, and the land under it begins to turn, so that when the node is whole its light is at its height. If it stands when the hold ends it **sets**: the light holds as it stands, the stone finishes turning under it, your bar fills, the core gains a piece, and Wick says a word.

**Joining.** A thread walked to an existing node, dark or living, joins it: to a dark one with a shorter hold (12 s), to a living one at once. So the map can be made a web, not just a tree. A node joined two ways survives one cut.

**Travel.** The map screen lets you stand at any living node: tap it, its card names it and where it is, and TRAVEL THERE sends the light running the veins over the map from where you stand to it, the shortest way through the living web (the map framed on the way, and turned to the other layer where the way goes down a shaft), and when it arrives so do you, set down in a flare of it. Veins are lit and quiet, so walking them is safe and dull, and the tap saves it. Set out from the node nearest the dark you want.

## The dark cuts

While you're away, the dark cuts. On return, for every 8 hours away a cut is rolled (at most two waiting, so a fortnight off isn't ruin), choosing a vein far from the star for choice. A cut vein goes dark along its length; nodes that only it joined go dark with it, their land stops turning (what greened stays, but stops), and the creatures come back there. The map shows the cut, and Wick names it when you arrive.

**Mending.** Take up a thread at the living end and walk it to the dark node along the old line, which the map and the ground still show, and the join relights everything beyond. The Hollow is what cuts, and it's sometimes still there at a cut: a chase, not a hold, and the one creature that follows you into light.

A web with loops needs less mending. That is the strategy of the weeks.

## Magnitude

The star's **magnitude** is how much of the world lives: living vein length in tiles, plus 20 a living node. It is never a number on the HUD; it is the heart's size, the light in the Kindler's joints, and one line at the star ("the light reaches 640 strides").

It gives, by thresholds (first guess 0, 150, 400, 800, 1400, 2200, 3200):

| Magnitude | Spell power | Thread | Band | Also |
|---|---|---|---|---|
| 1 | ×1.0 | 60 | 5 | two spells carried |
| 2 | ×1.25 | 80 | 5 | the star offers its first shape |
| 3 | ×1.5 | 100 | 6 | a third spell carried |
| 4 | ×1.8 | 120 | 6 | the star offers a shape |
| 5 | ×2.1 | 140 | 7 | the hold is 20% shorter |
| 6 | ×2.5 | 170 | 8 | the star offers a shape |
| 7 | ×3.0 | 200 | 8 | the ending is within reach |

A cut lowers magnitude until mended, so the world pushing back is felt in the hand.

## The dark

The roster stays as patterns, retuned to tells and windows and stripped of elements, affixes and badges: the crawler's crouch and lunge, the wisp's orbs, the stalker's reach, the snapjaw's ring, the spitter's marked glob, and each clime's own (the skink under the sand, the tusker's slide, the ash wraith, the bog lurker's tongue, and the rest). Each has one tell, one window, and a reason it's dangerous in a group.

- **Where it lives** is set by distance from the star (density and which kinds) and by the clime (which kinds). The gentle land round the star is crawlers alone; the far reaches are packs with a stalker in them.
- **Elites** are a bigger one of its kind with a second tell, in dark land only.
- **Keepers**, three, hold the far reaches of three regions, and each carries a legendary shape. They stand where they are until fought.
- **The Hollow** cuts veins and is sometimes at a cut. It follows into light, slowly, and leaves when the vein is mended.

Creatures hunt the Kindler, and during a hold the node; they never attack a set vein (cutting is what the dark does between sessions, so the player never watches the world come apart).

## Spells: learned from the dark

**What the dark leaves.** When a creature dies in your light the star takes what it was: a few motes of its **nature**, flown to you and counted on the HUD. Five natures, one for each element: **rime** (frost: the tusker, the eel, the idol), **cinder** (ember: the wraith, the crab, the skink), **spore** (blight: the spitter, the snapjaw, the lurker, the weaver), **spark** (shock: the wisp, the sentinel, the dropper, the hound), **grit** (force: the crawler, the stalker). A boss's and the Hollow's is its region's. An elite leaves three, a boss forty. You carry them: a fall loses them, and **a node setting banks them** at the star, so planting is how the dark's leavings come home. A creature resists its own nature's element and fears another's, so the Cinder Waste pays out what you'll use against the Frost Steppe, and the other way: the world pulls you across itself.

**The creatures cast what they teach.** Besides its own attack, each kind casts a spell of its nature's tree now and then, through the same cast code as the Kindler's, with a tell as it winds up: the wisp its shock orbs split in three, the crawler a glaive about itself, the stalker an amplified nova, the tusker a frost lance that pierces, the idol a frost ward, the wraith an ember burst cast twice, the crab an ember lance, the spitter a blight orb that lingers, the lurker a blight well, the sentinel a shock bolt. Its elements touch the Kindler in kind: frost chills his step, ember burns, blight eats at his light, shock holds him a moment, force shoves. So every node of a tree says which creature casts it, and what the star learns from a kind's motes is what the kind was seen to do.

**Five trees.** At the star (any time, from THE STAR), five trees, one a nature, each bought with its own motes and nothing else, a node at a time in order, the costs rising (3, 6, 10, 16, 24, 34). Every node is a thing for a cast:

- an **element**: the band a cast can be in, with its own touch (frost chills, ember burns and spreads, blight poisons and spreads, shock arcs, force knocks back; force is what a cast is with no element, so grit has no element node);
- that nature's **mods** (amplify and quicken in grit; split and chain in spark; pierce in rime; echo in cinder; linger in spore);
- a **form** or two, opened by the star's magnitude (glaive at 1 and nova at 3 in grit; orb at 1 in spark; ward at 2 in rime; lance at 1 in cinder; well at 2 in spore; arc and bolt are yours from the first day);
- a **passive** at the end, in you whatever you cast: heavy hand (grit: every cast harder), quick wrist (spark: every cast sooner), cold blood (rime: your light drains slower), kindled (cinder: your light fills faster), thick skin (spore: what hits you hurts less).

Twenty-three nodes, a few hours of the dark, and it never runs dry: the trees are the Kindler's growth, the magnitude the world's, and a form needs both.

**Casts.** Two casts, A and B. Each is a **form**, an **element** (or none) and the **mods** it has slots for (one at the start, a second at magnitude 3, a third at 5), set from everything learned: tap a part and a menu of what fits it opens under the cast. Nothing is used up or lost, so there is no inventory and nothing to sort: the longest list on the screen is a tree's five nodes. Each button says its cast (EMBER ARC) and whether the nearest creature fears or shrugs off it.

## The star's screen

One screen, from the star (walk into the heart's light) or the MAP button anywhere, which opens it on the map. Three parts, scrolled:

1. **THE WORLD.** The map, a layer at a time (THE SURFACE, THE DEEP), pinched to zoom: the regions in their own colours and their names as they're walked, veins in gold, nodes as marks, cuts marked red, shafts once seen, the Kindler. Tap a node for its card; TRAVEL THERE to go, and the light is seen running the veins to it.
2. **CASTS and THE TREES.** The two casts, each part tapped for a menu of what fits; the map opens on the Kindler, at the zoom from last time; then the five trees, each with its motes banked and carried, its nodes in order with LEARN and the cost.
3. **WICK.** His log, the *Meridian* overhead (how many sleep), the core's pieces, and the opening again.

Nothing else at home. No making, no stash, no feeding.

## The HUD

The bar at the top, and under it the thread's remaining length while threading; the same stands over the Kindler's head while he lays it, a bar and the strides left in digits, red when it's nearly out. The MAP button and pause. In the view's top right corner, always, the **minimap**: the forty tiles round you, two pixels a tile, drawn as you walk them (what you've seen of each layer is kept in the save) and wherever the living light lies; the ground in its region's colour, the lit land gold, the veins, the thread, the nodes, the shafts seen, you blinking at the middle, and at the edge a mark for the way to the nearest living light when it's off the map. Under the right thumb: A, B (and later C), DASH (dim while threading, free once the node is planted), and ACT, which reads TAKE UP, PLANT, JOIN or MEND as the ground allows, with the hold's ring over the node while it runs and the seconds left counted down over the node forming, large. The joystick under the left. One goal line under the bar at all times: what the ground in front of you is for ("Take up a thread here", "The dark cut the vein to Ashfall", "Six crawlers read: the star has a shape to shape").

## A session

1. Open the game at the star. Wick says what happened while you slept: a cut, or nothing. The map shows it.
2. Pick: mend the cut, lay a vein further into the frost, or hunt the stalker whose shape is one kill short. Tap the node nearest it.
3. Take up the thread. Walk into the dark, slow, the thread bright behind you and the dark waking along it. Fight without dashing; the bar drains; a wave or two.
4. Plant. The hold: a minute of waves at you and the node. Set. The vein lights behind you, the bar fills, the core mends.
5. Walk home along your own vein in light, or tap home. Read the shape. Pick a reading.

Ten to fifteen minutes. A trip that goes wrong costs the thread and a piece of the core; a trip that goes right leaves the map one line longer, for good.

## Onboarding

Wick walks the first trip in six lines: take up the thread at the star, walk to the marker, PLANT, hold ("stand by it; the dark wants it more than you"), the set, walk back. On the second open he says the only thing about the weeks: "It'll cut that while we're asleep, now and then. Two ways to a place and it can't."

## The end

When living veins reach the far marker of every region (one a clime, set by the generator), the star says the world lives. The last scene: the Kindler walks into the heart's light and doesn't come out; the light draws in along every vein to the star and out again as day; the *Meridian* comes down over a green world; Wick, alone on the ground, says the one line he has been not saying for weeks. Then the map, living, with the player's veins on it, as the credits.

## What's cut

Mining, ore, the cutter, cargo, the pack, banking. The Spectrum and bands, light as a currency, shards, facets, casts, Forms, Elements, Mods, Readings, attunements, resonances, the Codex, supplies, field spending, the seventh band. Rings, territories, heart goals, waystones, spires, kindling as a goal, Deeps, the Lattice tunnels, cold spires, rifts, portals. The Hollow Star as a place with an inside. Health, charge and light as three meters. Wick's toggles and the star's four faces.

## What's kept

The renderer and the painted style, the GPU frame, lighting and bloom, fine grain, the perf readout; the floor generator with its climes, hazards, undergrowth, water and lava; the Kindler and his animations and the lattice over him; the creature sprites and their patterns; input, the deck, the joystick, the screen plumbing; Wick, the opening (its home scene changed), the heart drawn large; the terraforming painter; the save's seed-and-deltas model; the test harness and the generator's golden hashes.

## Build order

Pruning in place: main is unplayable until the first step lands.

1. **The ground** (done 2026-10-24). One large map, painted in a window, the star in the open, one bar, movement, dash and a two-spell fight with placeholder spells; everything cut is deleted. Playable: walk out, fight, go dim, come back.
2. **The veins** (done 2026-10-24, but for the land's turning spreading with age). The thread, planting, the hold, the set, veins lighting, the map screen with travel, the save of nodes and veins, terraforming along veins, the core and falling.
3. **The star** (done 2026-10-24, with the readings as the old Forms and Mods until the fight is rethought; shapes from the world's ruins and old nodes still to come). Shapes from creatures and the star, the two readings, the star's screen, magnitude and its thresholds, cutting on return, mending, the Hollow at a cut.
4. **The dark and the words.** Creatures retuned to tells and windows, elites, Keepers at the far reaches, Wick's lines, the onboarding, the opening's home scene, the ending; the smoke test and the bot rewritten round the trip.

Added 2026-10-24, after play: the regions and the Deep (done), the thread pressed into the ground (done), the map with zoom, cards and layers (done), the hold capped at 30 s, and no one before us (the old nodes gone).

## First numbers for `T`

```
veins: { band: [5,5,6,6,7,8,8], thread: [60,80,100,120,140,170,200], threadSpeed: 0.85,
         wave: 30, takeUp: 1, plant: 1, hold: [18, 30], join: 12, nodeGap: 6,
         nodeLight: 100, core: 7, cutEvery: 8 * 3600, cutMax: 2 }
bar:   { max: 100, drain: 180, fill: 4 }
magnitude: { at: [0,150,400,800,1400,2200,3200], power: [1,1.25,1.5,1.8,2.1,2.5,3], nodeWorth: 20 }
motes: { kill: 1, elite: 3, boss: 40, cost: [3, 6, 10, 16, 24, 34], modSlotsAt: [1, 3, 5] }
world: { tiles: 320, chunk: 32, reaches: 1 }
regions: { area: 10816, meld: 7 }   deep: { n: 14, fromStar: 18, apart: 24 }
```
