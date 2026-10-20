# Lodestar: design

Lodestar is a top-down pixel-art mining and looting game for the phone browser. You play a Kindler, an explorer in a blue Charter suit with amber circuits, a faced helm with a brow lamp, and a little drone, on a world where technology runs on arcane ore. From a seed-star newly planted in the middle of a dark world, its Charter base round it, you carry its light out across the land, mine ore, fight, take the land one territory at a time, and decide when to push further and when to get back to a spire before you lose the haul.

It mixes Terraria and Starbound (always another ore to find, and the gear it makes) with Diablo (every drop is a roll of the dice, so you never keep the same gear for long).

Items marked **(proposed)** aren't settled or aren't built yet. Everything else was decided by the designer and is in the game. `DECISIONS.md` logs each decision and why it was made, and `js/tuning.js` holds every number.

## Pillars

1. **Always another upgrade.** A new ore leads to a new cutter, which opens new depths, which leads to new gear.
2. **Crafted bases, found power.** What you forge is exactly what its recipe says; what you find (modules) is rolled, and gives it its identity. The anvil only adds.
3. **Push your luck.** The further out you go, the better the loot and the higher the risk of losing it.
4. **Built for a thumb.** It plays well upright with one or two thumbs, in short or long sessions.

## The story

**The Kindler.** You're a Kindler of the Lodestar Charter. The Charter sends seed-stars to dead worlds, and a Kindler rides down with each one to plant it and carry its light outward, spire by spire, until a colony can land.
- **The landing:** a planned terraform, by the book. The seed is planted on a surveyed site in the middle of the world, and the Charter's base modules come down with it. A new seed always starts small, its light reaching only a little way; growing it, by feeding it the light of what the Kindler does (land kindled, deep places found, the Keepers' shards) and planting spires to carry its light, is the Kindler's job. It's your first terraform, so you grow in skill as you go (the attunements are that skill). Wick has done this before.
- **The *Meridian*** is the colony ship waiting in orbit with its settlers asleep. For every 3 territories kindled it can send a lander, and the outpost becomes a settlement.
- **Why take ground:** it's the job. Every spire carries the star's light further, and the dark is thicker where the light has never been.

| Act | What happens |
|---|---|
| Ring 1 | Plant spires and the land wakes up. The first landers come down and the settlers arrive. The star speaks as it grows. |
| Ring 2 (the turn) | The procedure itself is what's in question. The echoes, logs of earlier Kindlers, show that the world wasn't dead. The dark is the world's own living night, and the Hollow is what grows in it. The Keepers are earlier seed-stars that went dark. |
| Ring 3 | Each Keeper holds a shard of its dead star. Set the shards in yours and your light reaches further. |
| The Edge | The heart of the dark. You choose: **kindle it** (the world becomes a garden and the Hollow is gone) or **leave it** (the world keeps a night, the colony lives in the light, and the Hollow keeps to the dark). The game goes on after either. |

- **The shards:** a Keeper waits at the end of an expedition in each biome:
  - the Rim's, a fungal crawler-queen that calls its brood;
  - the Choir's, a towering tube-worm;
  - the Underforge's, a slag colossus that leaves magma where it charges.
- **Bringing them back:** a taken shard is bound to you and safe from any fall. Set it in the star at the altar, which feeds the star 40 light, a big jump (a ring-1 kindling is 12).
- **Calling the colony down:** at the Meridian uplink, once all three shards are set and there's ground for 5 landers (15 territories kindled). Until the world map exists, the shards alone will do, and calling plays the "kindle" ending, as lighting the old beacon did.

How it's told:
- **An opening** on a new game: about 56 seconds of painted scenes that play on their own, a short caption each (`js/intro.js`, the words in `STORY_INTRO`): the Charter's craft crossing the dark with the seed-star, the Meridian behind; the survey's beam sweeping the dark world and marking a site; the outpost's own modules and the planting cradle with the seed in its arms coming down by the book, the cradle locking; the Meridian in orbit and, close, its settlers asleep in their pods; and the outpost itself, where the star rises out of its cradle and lights, the modules wake one by one, the camera comes down to the Kindler stepping out of their pod with Wick ("I'm Wick, your drone"), and play starts right there. A tap hurries a scene (the first only brings the sound in); SKIP INTRO ends it; the uplink plays it again. A faint hint of unease: once, something on the dark face answers the survey's light, and late in the last shot, two cold points in the dark land past an opening.
- **Wick**, your drone, dry and kind, says a line the first time things happen: the first dive, parts, a blueprint, the anvil, the light thinning, a new biome, a Keeper, a shard, the first spire, the first territory kindled, the first dark tide, the first Deep, each ring, the Edge, the first settlers, the first feeding of the star, the first heartlight and deeplight, a spire the star can't reach yet, the first pack left by a fall ("Your pack's still out there. We can go back for it.") and found again.
- **The star speaks** as it grows, a seed-star waking where it was planted, as each shard is set, and when it first tastes heartlight and deeplight.
- **Feeding seeds the turn.** It's the procedure: the star is fed the light of deeds. But the deeds take something from the world: kindling burns away the dark, the world's own night, and the star tastes it ("This light was night, a moment ago"). The echoes show earlier Kindlers fed their stars the same way ("the light I carry up to her: I used to think the night had no use for it"), and the last of them stopped feeding hers. By the Edge, the player has been doing the kindling all along.
- **Eight echoes:** logs of the Kindlers before, found by ancient forges, from elites now and then, and from every Keeper, and read at the uplink in the order found. The early ones are hopeful, the middle ones uneasy, and the later ones carry the turn.
- **Settlers** at the outpost, one for each lander down, stroll the plaza among the modules and their pods and say a line when you pass. After the turn, they've heard.
- **The log:** one line for each territory kindled, by its clime.
- **Never say it outright.** No line says the dark is alive or that the Keepers were stars. The echoes, the star and the settlers let it show.
- **The tone:** plain, warm and a little lonely, hopeful with unease. Short lines that read on a phone.

## The Lodestar (the base)

The Lodestar is the seed-star the Charter sent down with you, planted in the middle of the world. It hangs over its planting cradle, held up by its own magnetic field, and came down with the Charter's base modules, which stand round it on the cleared site: the outpost. A seed-star is planted small and fed the land's ore until it's strong enough to light a world: that's the procedure every Kindler follows, and this is your first.

- **Its light.** The star's light reaches the land next to the outpost, and every spire planted further out carries it on. Out in the dark, your own light drains; in kindled land and at home it fills again.
- **The star grows from deeds, not ore.** What the Kindler does gives light, in motes carried home and fed to the star at its altar, a point each; the points raise the star's **magnitude**. Ore is for the forge and for supplies, never for the star.
  - **Heartlight:** kindling a territory, 12 in ring 1, 16 in ring 2, 24 in ring 3, 32 at the Edge. It's bound to the Kindler the moment the spire stands, safe from any fall.
  - **Deeplight:** first reaching a Deep's end (its deep vein, or its Keeper's lair), 8 in ring 1 to 20 at the Edge and 4 more for each site past the first; each ancient forge found, 4; each echo, 8. It rides in the cargo, so a fall leaves it in the pack: the push-your-luck stays.
  - **Shards:** a Keeper's heart-shard, set at the altar, 40 at once.
  - **Magnitudes** at 0, 12, 40, 100, 200, 340, 520 and 740 light: the first kindling reaches magnitude 2, about half of ring 1 magnitude 3. Each gives an attunement point and a Deep's lodelines a little likelier; the tools open at 2 and 3.
- **The star is the world's gate.** A spire holds only where the star's light reaches: ring 1 from the start, ring 2 from magnitude 3, ring 3 from 5, the Edge from 7. You can walk anywhere, mine, fight and go down into Deeps, but not kindle past its reach. Kindling every territory of a ring and reaching its Keeper's lair always gives enough for the next ring's, so you're never stuck; with Deeps, echoes and the shard, about two thirds of a ring does it.
- **The feeding is a ritual, not a shop.** At the altar, hold HOLD TO FEED (the button shows it's a hold: a dot to press with rings pulsing out from it and round the button, and it fills as the flow speeds up): mote after mote of light rises from the Kindler's hands, bows up over the altar's bowl and drops into the star, faster the longer you hold (from 2.5 a second to 22 within about 2 s). Deeplight goes first, a cold blue-white spark wound round by a fainter twin; heartlight last, a warm gold spark with a cross of light, the crescendo. The flow rests a beat between them. Let go and it stops. The star brightens as each lands and swells with a ring of light at each magnitude reached. The button says what's going and how much is left (GIVING HEARTLIGHT · 24).
  - **The star's screen** (ATTUNE, beside it at the altar): the magnitude and a bar with the light waiting, each kind of light, what grows it, its reach, and the attunements.
  - Each mote leaves the stash and its point joins the star's at once (the save is never between the two); the star, its lodelines and lanterns are drawn as they were until each mote lands.
  - **Words:** Wick gives the why the first time (it's the procedure), and the star remarks on the first heartlight and the first deeplight it takes.
- **What's next** is always said at home: the portal's screen opens with a short list (the light waiting and how far to the next magnitude, a shard to set, your pack and where it lies, the gentlest land to kindle and its heartlight, how much more light the next ring's spires need, a Deep not yet reached and its deeplight, a Keeper waiting). Each territory's card on the map says what kindling it would give, and its Deep's end.
- **(proposed) Lore hook.** The deepest ore, Starmetal, is what's left of seed-stars that went dark: it tastes like the earlier, dimmed stars. Something out there has been collecting it.

## The loop

1. **At the Lodestar:**
   - forge bases (rig frames, plate, charms, cutters), tools and the cores spells are built from; the forge studies what's new and reveals recipes;
   - socket modules and build the rig's two spells at the locker; upgrade modules (at the locker or the tuning bench), and salvage what you don't need;
   - unseal relics, make supplies from old ore, feed the star the light your deeds earned, and spend attunements.
2. **Set out:** walk out of any of the outpost's openings into the land next to it, or take its portal: the world map, to set out to any spire, and the tool to carry (walking out carries the last one chosen).
3. **Push into the dark:** cross from territory to territory. In dark land your light drains, the enemies are out, and the ore is worth taking.
4. **Mine, fight, kindle:** work on a territory's heart goal, or just take what you can. There's no limit to what you carry. Some territories have a Deep below, a short dungeon richer in ore.
5. **Bank or fall:** bank at any spire (or walk home, or recall). If you fall, what you wear and your supplies are safe; the whole cargo stays where you fell, in your pack, to go back for once, and you wake at the last spire you touched.

## The world

The world is rolled once for each save from its seed (world.js) and kept in the save: the seed, and for each territory only what's been done to it. It's laid out in rings round the outpost:

| Ring | Region | Territories | Ore | Enemy level |
|---|---|---|---|---|
| 0 | The outpost: the cleared site round the star | 1 | | |
| 1 | The Rim | 7 | Ferrite, Lumenite | 1–4 |
| 2 | The Choir | 10 | Resonite, Aetherglass | 5–8 |
| 3 | The Underforge | 12 | Sigilite, Starmetal | 9–12 |
| 4 | The Edge | 10 | Sigilite, Starmetal (rich) | 13–16 |

- **A graph of neighbours.** On the world map each territory is the cell of land nearest its middle, with wandering borders; two that share a border are neighbours. Within a ring, danger rises the further out a territory stands (its depth, 1 to 4), so the land next to a spire is the gentle kind. The Edge is unknown on the map until walked, and its own content comes later.
- **Each territory has a fixed clime and a name** (a surface clime, leaning to its region's as the old sites did), a heart goal, and sometimes a Deep.
- **Territories are site-sized surface maps,** built by the floor generator from the world's seed and the territory's id (`generateTerritory`), so climes, hazards, undergrowth and rifts all apply and it's the same map every visit. Each has an opening at its edge for each neighbour, on the side facing it. Walking into one plays the portal transition (no shake) and you arrive at the matching opening in the neighbour, with a gold or grey label saying where it goes. They have a cavern fewer than a site did but more veins in each, so dark land is worth mining.
- **What persists:** a territory's state (dark, contested, kindled), its goal's progress, its tear sealed, and veins mined. Mined veins grow back after a few sorties in dark land; in kindled land they don't. Enemies come back each time you enter dark land. Kindled land is quiet: critters and now and then a straggler.
- **Your light** (the old star's pull) drains in dark land over about 3 minutes (180 s) and fills in kindled land and at home. Below 40% your lamp dims and the dark stirs more creatures every so often (one every 26 s in the Rim, two every 18 s in the Choir, two every 14 s beyond); at nothing the Hollow comes, in every dark territory you enter until it's back. Dark land is under a dim dusk; kindled land under daylight.
- **Spires.** Each kindled territory has one at its heart: a standing lodestone obelisk with a gold beam, and the outpost has its own. At a spire, **BANK** (1.5 s standing still, like the old EXTRACT) puts the cargo in the stash, and the sortie goes on. **TRAVEL** opens the world map: tap any spire to go there, or the star to go home; travelling banks first. The first ring-1 territory, the gentlest, starts kindled by the outpost's own spire, so the first sortie is gentle.
- **A fall** wakes you at the last spire you touched (the outpost if none). All of the cargo (ore, exotics, deeplight, gear, blueprints) stays where you fell: **your pack**, a Charter-blue pack on its side with its strap light still on and a faint beacon rising over it, in that territory or that site of its Deep. It's marked on the world map (a small amber pack), named on its territory's card, and in the place it stands labelled YOUR PACK, or a pip at the view's edge points to it. Walk to it and it's all yours again, once. Fall again before you reach it and the older pack is lost: there's only ever one, the newest. The report says where it lies and what's in it, and what was lost. It's kept in the save, and if the site is built differently when you come back (a Keeper's lair after its shard is taken), it stands on the nearest open ground. Giving up a sortie (offered when the game reopens with one under way) leaves the pack where you came in, as a fall would, and goes home.
- **Going home** (walking in, or travelling from a spire) banks everything. The star isn't fed by the ride home any more: its growth is in the deeds. The **emergency recall** works anywhere: 4 s standing still (2 s with the Forward Relay), and home with everything. Moving or being hit breaks it, so it's a way out of a quiet corner, not out of a fight; a fall leaves all of it out there in the dark, where you came close to dying, for a walk back.
- **Kindling.** A territory's heart goal, for now one of two:
  - **Light the waystones:** three old pylons, each a 2.5 s channel whose light wakes everything near; the last must then be held, standing in its light for 20 s while the dark sends more.
  - **Seal the tear:** a rift sits on the territory's heart (a graft or an ore wake); seal it, early and safe or late and rich.
  Done, the heart is marked in gold: plant the spire there (a 6 s channel) and the territory is kindled for good: its spire, full light, daylight, and what the dark sent burns away. Kindled ground is never lost. A goal's progress stays when you leave.
- **Deeps.** Some territories have a portal down into a Deep of 1–3 sites (caves and ruins, ending in a deep vein), built as the old expeditions were, at the territory's own level: each site has a lodeline by chance (100, 80, 60%, more as the star grows), and a portal on. Your light drains down there too, and when it's gone a Deep's lodeline goes dark. Its lodeline (to the player, a shaft of the star's light), or its last portal, takes you back up to the territory, by the Deep's portal. Under the furthest territory of each of the first three rings, the Deep ends in the region's Keeper's Lair while its heart-shard is missing (their own place in the world comes later).
- **Saved as you go.** A sortie is saved on arriving anywhere and whenever the page is hidden; reopening the game offers to carry on from where you came in.
- **Health** comes back slowly once nothing has hurt you for 4 seconds. Healing motes drop from kills, and some affixes leech or regenerate.
- **The warden** is an optional loot piñata that can turn up in a side room at depth 3 or more. It charges and fires rings of orbs. It drops three rare-or-better pieces and often a relic.
- **Carry it all.** There's no cargo limit and no weight; the top bar's CARGO shows how many things you carry. The push-your-luck is the fall: everything carried waits in the pack where you fell.
- **(proposed, stage 2)** More heart goals (purge the nest, cap the vents, carry the seed, break the Keeper), scouting, tithes and boons, richer kindled looks and settlers, optional dark tides on border territories. **(stage 3)** Keepers as ring gates, pick and spell gates, the Edge's own content.

## Climes

Every territory and every site of a Deep is also a **clime**: the kind of country it is. The region still sets the ore and how strong the enemies are; the clime sets how the place looks and feels. A territory's is fixed when the world is rolled; a Deep's sites roll theirs from the world's seed, so a portal's button names it (STEP THROUGH: FLOODED GROTTO). Each zone's first clime is the look it always had, without a hazard.

| Clime | Zone | Look | Its quirk | Leans to |
|---|---|---|---|---|
| Badlands | surface | today's sunlit mesas | none | |
| Frost Steppe | surface | lavender snow, indigo ice rock, a pale sun, snowfall; pines, snow shrubs, tusk arches | slick ice: a step carries on | the Choir |
| Cinder Waste | surface | black ash under a dim red sun, glowing fissures, falling embers; charred snags, fire lilies | vents that glow, then burst | the Underforge |
| Bloomfen | surface | olive moss over violet peat, pollen on the air; mushroom trees, cattails, toadstools | spore pods that swell and let go a drifting cloud | the Rim |
| Caverns | cave, deep | today's caves | none | |
| Flooded Grotto | cave, deep | violet stone, blue algae, still water with a glowing rim, more drips; kelp, anemones, sponges, moss beards | pools that slow you | the Choir |
| Magma Tubes | cave, deep | basalt and lava channels in a red glow, sparks rising; basalt columns, fire fungus | lava that burns (it never cuts ground off) | the Underforge |
| Rootdeep | cave, deep | walls woven of old roots, great roots across the floor, fireflies, hanging vines | spore pods | the Rim |
| Archive | ruin | today's ruins | none | |
| Overgrown Temple | ruin | pale flagstones with moss in the seams, shafts of daylight through the roof; broken columns, vines, flowers | reflecting pools that slow you | the Rim |
| Clockwork Vault | ruin | brass floor plates and gears set in the floor; clocks, pipes, chains | steam vents | the Underforge, the Choir |

- **Every clime can turn up in every region.** A region only leans (2–2.5×) towards the climes that suit it.
- **Hazards are mild, readable and fair.** Each shows before it bites (vents glow and ring their reach, pods swell and glow, lava and water are plain to see), a dash crosses any of them unharmed, and none is ever in the entry's cavern or beside a portal or a lodeline. Pools also slow walking enemies, and lava and vents burn them too. Each has a one-time tip.
- **Climes change generation a little, never its danger:** the Frost Steppe keeps fewer pillars and the Cinder Waste more, the Bloomfen, Rootdeep and Magma Tubes wander differently, but none has more, bigger or more open caverns (which meant more enemies at once, and more falls in the bot's runs). The hazards are laid over the ground afterwards from a generator of their own, so the tiles don't change.
- **A rift's graft** brings another clime's ground with it: a patch of Frost Steppe snow in a cave, or Magma Tubes basalt under the sky.
- The fighting flora dress as the clime's own plants, glow gone red.
- Each clime has a creature of its own (Enemies).

## The weather

About a third of sorties set out under a **Lodestorm**. On the surface, every 20 s a strike falls within 6 tiles of the diver, marked by a tightening, flickering ring a second before. It hurts whatever stands in it (diver and enemies alike, the enemies with shock), and when it finds an ore vein it charges it into the biome's better ore. A storm is a hazard to dodge and a reason to stand near a vein when the ring appears.

## What's next

One suggested goal at a time, the plainest first: a shard to set, the light waiting at the altar (first if it makes a magnitude), the pack to fetch, the gentlest land beside the light to kindle, a Deep to reach the end of, a Keeper's shard, the magnitude the next ring needs. It's shown at the portal (NEXT) and as a small line over the view at home (`nextGoal`, deeds.js). (Contracts, three posted goals that paid things, were cut: DECISIONS.md, 2026-10-20.)

## Tools

The diver carries one tool, chosen at the portal before setting out. Each changes what you can see or do out there, so the choice shapes the sortie. The Compass is carried from the start; the rest are made once, at the forge (its TOOLS tab), as the star grows.

| Tool | From magnitude | What it does |
|---|---|---|
| Lodestone Compass | 1 | An arrow round the diver to the spire here, or in dark land to the opening towards the nearest kindled land; in a Deep, to its lit lodeline or the portal on. |
| Ore Sense | 2 | Veins within 9 tiles glint through the dark, and an arrow at the view's edge points to the nearest vein the cutter can break. |
| Threat Radar | 2 | Marks at the view's edge for what's out there within 18 tiles: dim for the unaware, red for the hunting, elite colours, violet for the Hollow. |
| Surveyor's Map | 3 | A map of each place, drawn as you walk it, in the view's corner, with its openings, portals, spire, waystones and ancient forge once seen. |
| Capture Lens | 2 | Modules half again as likely. Revealed by research once the first module comes home; made from Lumenite and threads. |
| Lode Beacon | 2 | Once a sortie, from the pause menu: call a spire's light down where you stand, where no spire is: you can bank and travel from it, and standing in it brings your light back slowly. In a Deep it's a lodeline. It lands after 6 s, and its light wakes everything near. Not while a Keeper lives. |

## Rifts

Tears in the world, where something has cracked more than the ground. Dark land and a Deep's sites may hold one (a quarter of the gentlest, rising to over half of the hardest), and a territory whose heart goal is to seal the tear always has one on its heart. Sealed, it stays sealed. Each changes the site around it:
- **Graft:** another place has bled through. A blob of another biome's ground, stitched in with a glowing seam: a patch of sunlit badlands in a cave (its daylight with it), or a patch of cave on the surface. The ore inside is that biome's, so a graft can bring a better ore early.
- **Ore wake:** the rock round the tear has woken into ore, half of it the site's better ore.
- **Gate:** two tears in different rooms, one place. Step into one, out of the other: a shortcut, or an escape.
- **Inversion** (underground only): noon pours out of the tear and lights the dark around it, for as long as the tear is open.

**A tear doesn't wait.** Every 25 s an open tear (not a gate) sends out a rift-touched elite, three at most, and sealing it leaves one more riftglass for each still alive. Seal early and safely, or late and rich.

Ground near an open tear washes violet with flickers of the rift's colours. **SEAL THE TEAR** (any but a gate) is a 2.5 s channel in a light that wakes everything near, like extracting. It leaves 1–2 **riftglass**, an exotic found nowhere else: a piece forged with it comes out a tier above its ore. What a graft or an ore wake changed stays changed.

## Enemies

Every biome has the same three, in its own colours:
- **The crawler** closes in and circles. Then it crouches with its eyes flaring, shows a red line, lunges and bites. Afterwards it recovers, which leaves it open to a counter.
- **The wisp** keeps its distance, strafing, and fires slow orbs: one at first, three from depth 3.
- **The stalker** (from depth 2; `construct` in the code) is a lean alien biped in glossy chitin: a long smooth skull with slanted slits of its region's glow, a ribbed chest with a slit of glowing core, blade claws, legs that bend back at the knee, and a tail. It shows the line it will charge along, raising its blades like a mantis, then charges. If it hits a wall, it's dazed, and it takes extra damage while dazed.

**Flora that fights**, rooted and hidden among the harmless kind. It wears a harmless piece's shape with its glow gone red, so you can learn to read it:
- **The snapjaw** waits for you to come close. It shows its reach in a red ring, then snaps.
- **The spitter** (from depth 2) lobs a glob at where you stand, marking the spot first. The glob leaves a patch of spores that eats at you while you stand in it. A dash crosses it unharmed.

All of them glow brighter while winding up, so you can see the attack coming. Enemies wake when they see you or when one near them is hit, then find their way to you through the tunnels. One woken by another, or by a noise (a channel's light, a drill), looks about for half a second to a second and a half before it comes, so a pack arrives in ones and twos.

**They take turns.** In the Rim only one enemy winds up at a time (two from depth 3); each region out adds most of one more, and every three depths one more. Of the kinds that close in to fight (crawlers, droppers, crabs, stalkers), only the nearest two press the attack in the Rim (three in the Choir, four beyond); the rest hold off about four tiles out, circling, until one falls.

**The Rim is for learning.** A territory's rooms hold fewer enemies near the outpost (about 1 + 0.4 × depth + 0.8 × region, give or take one), and enemies there have half their health at level 1, rising evenly to all of it at level 8 (the Choir's furthest): a crawler at level 1 falls to three hits of the starting Arc or Bolt.

**Hits land.** A hit holds the foe still a moment (0.07 s, a heavy one 0.13 s) and jolts it the way it's knocked; a hit worth 15% of its health breaks off its wind-up and staggers it (not a boss or the Hollow, and not again within 1.2 s). Heavy hits stagger anything but the warden out of an attack.

**Elites** have more health, hit harder and often leave a magic-or-better module. They wear a coloured pip for their affix:
- **Fast:** moves half again as fast.
- **Tough:** extra health.
- **Volatile:** bursts a moment after it dies.
- **Insulated:** all but shrugs off Shock (×0.25).
- **Fireproof:** all but shrugs off Ember (×0.25).
- **Warded:** resists everything inside a shell of pale light, until three Force hits (a heavy one counts two) crack it open. Something blunt is always worth carrying.
- **Shifting:** its weakness moves to the next element every 6 s, and its pip and mark change colour with it.

**Weak and resistant** (natures.js). Every kind is weak to some elements and resists others, by what it's made of: weak takes ×1.5, resistant ×0.5, very resistant ×0.25. Nothing is ever immune.

| Kind | Force | Shock | Frost | Ember | Blight | Why |
|---|---|---|---|---|---|---|
| Crawler | | | | W | | a chitin shell, dry inside |
| Wisp | R | R | | | I | no body, all ether |
| Stalker | | | | | W | living, thin-shelled |
| Snapjaw, spitter | | | R | W | R | living plants |
| The Hollow | R | R | R | R | R | the living dark; in a lit lodeline's light it loses them all |
| The warden, the Keepers | one W and one R by region: the Rim Ember W, Blight R; the Choir Force W, Frost R; the Underforge Frost W, Ember R | | | | | |

- **Climes shift it a step** (W to neither, neither to R, R to I, or back): the Frost Steppe more resistant to Frost and weaker to Ember; the Cinder Waste and the Magma Tubes to Ember and Frost; the Flooded Grotto to Ember and Shock; the Bloomfen and the Rootdeep to Blight and Ember; the Clockwork Vault to Force and Shock.
- **Force is mostly neutral:** it's every spell's element when it has none, so only the wisp (no body to strike), the Hollow and two armoured clime creatures (the Slag Crab and the Gear Hound) resist it. The Slag Crab's shell stands in for its resistances while it's shut (35% gets through, rather than 35% of a half), and what it fears still counts.
- **No marks over what's hidden:** a skink under the sand, an eel under the water, a dropper on the roof or a wraith in its fissure shows none until it comes out.
- **Wick learns it.** The first hit of an element on a kind tells Wick its verdict, kept in the save. Over each awake foe, a mark for each verdict Wick knows: ▲ in the element's colour for weak, ▼ for resistant, a bar for very resistant, and "?" while some are still unknown; three at most, what it fears first, then what it resists most. An elite's affix always shows.
- **The numbers carry it:** a weak hit pops bigger and green, a resisted one small and grey; WEAK or RESIST under it at most once every 0.8 s over a foe, and not when a reaction's name shows for that hit. A reaction's name stands over the foe above where its numbers rise, never over them. Wick says so the first time each happens.

### Each clime's own creature

Every clime has a creature found nowhere else: about 30% of what a room holds in its clime, and elsewhere only where a rift's graft of that clime brings one or two (not the eel or the dropper, which need their water or a roof). The crawler, wisp, stalker and the fighting flora are the rest, everywhere. Each has its own attack, tied to its clime and its hazard, and like every enemy it shows its attack first (a red line, ring or mark, and it glows brighter as it winds up), a dash crosses every one, and it takes its turn with the others. Each leaves the creature part that suits it, can be an elite, and grows with the level like the rest. Wick says a word on each the first time it shows itself.

| Clime | Creature | Attack | Tell | Nature (weak / resists) | Part |
|---|---|---|---|---|---|
| Badlands | Dune Skink | Swims under the sand (a mound with eyes), bursts up under you and bites; then it's up a moment, scuttling, before it digs back under | A ring of sand under you, its reach in red | Frost / Ember | chitin |
| Frost Steppe | Tusker | A heavy charge; it slides on, can't turn, and on ice slides on until the rock stops it, dazed for longer | Its whole run in red, a ring where it will slam | Ember and Blight / Frost | chitin |
| Cinder Waste | Ash Wraith | Rises from a smouldering fissure, drifts in and bursts into embers, leaving burning ground; then it's a spent cinder | It swells and glows, its reach in a red ring | Frost / Ember | ether |
| Bloomfen | Bog Lurker | Sunk to its stalked eyes in its mire; its tongue lashes along a line and drags you a tile in | Its mouth opens, the line marked in red | Ember / Blight | spore |
| Caverns | Ceiling Dropper | Clings to the roof; drops on you, then fights like a squat crawler | Its shadow grows on the floor, following you a moment, then holding, ringed in red | Force / Shock | chitin |
| Flooded Grotto | Pool Eel | Swims in the pools (a fin and ripples), rears and lunges; on dry ground without a bite it's stranded | It rears, its line in red | Shock and Blight / Ember | fibre |
| Magma Tubes | Slag Crab | Sidesteps and pinches; its shell turns most of a blow until it's chilled or cracked by a heavy hit (its seams light); lava doesn't burn it | Claws up, a short red line | Frost / Ember and Force | cog |
| Rootdeep | Rootweaver | Keeps off and spits; strings root snares between the walls across your way, which hold your feet (a dash crosses) | A red line from its mouth; the snare's line in red | Ember / Blight | fibre |
| Archive | Sentinel Eye | Floats and sweeps a beam through an arc; rock stops it, so a pillar is cover | The arc it will sweep, and the line it starts from | Shock / Blight | ether |
| Overgrown Temple | Moss Idol | A temple guardian beast, half lion-dog and half gargoyle, moss over its back. Moves only out of the light (the heart of the lamp's reach, or a shaft of daylight), prowling low with its cracks faintly alight, and pounces from the dark; lit, it's a crouched statue | Haunches gathered, cracks and eyes ablaze, its line in red | Force / Frost | spore |
| Clockwork Vault | Gear Hound | Winds its key, then runs in straight lines, glancing off the walls twice; then it's spent | The key turning, the whole run shown with a ring at each wall | Shock / Force | cog |

While a skink is under the sand, an eel under the water or a dropper on the roof, nothing can strike it or aim at it. A stranded eel, a spent wraith or hound and a dropper that has just landed take half again as much, as a dazed stalker does.

## Mining and ore

- **The cutter gates ore.** A cutter made from an ore breaks the next one up: a Ferrite cutter breaks Lumenite. The Worn Cutter you start with breaks only Ferrite. Seeing ore you can't break is the hook for the next craft.
- **Biomes and ore.** Three biomes with two ores each. The better ore is more common deeper down.

| Biome | Feel | Ore (tier) |
|---|---|---|
| The Rim | The first ring of land round the star; glowing fungal caverns under it | Ferrite (1), Lumenite (2) |
| The Choir | Crystal caverns that sing when struck | Resonite (3), Aetherglass (4) |
| The Underforge | Ancient machine ruins near magma | Sigilite (5), Starmetal (6) |

- **Exotic materials** drop from elites and the warden, and now and then from anything else. (Bloodresin is retired: it fed the old reroll, no longer drops, and what was banked became threads.)

## Crafting (the heart of the game)

Gear is two halves: a **base you craft**, exactly what its recipe says, and **modules you find**, rolled loot that slots into it and gives it its identity. Joy comes in layers: a find each fight (a module), a craft each trip home (a base, an upgrade), an unlock every few sessions (the star).

- **Each half has its own currency:** bases are made from ore and creature parts; modules come from what you kill; their upgrades are paid in **threads** (from salvaging modules) and ore.

### Bases, at the forge

- **A recipe is known and exact.** The forge shows, for the ore you choose, the base's tier (the ore's), its stats, a rig frame's Mod slots and its **module sockets**, and the cost of every resource by name, with how many you have. There are no random affixes on a crafted base.
- **The anvil only adds.** Three strikes set the temper: rough as the recipe says, fair +5% on its numbers, fine +10%, a masterwork +15%, a module socket more and, on a rig frame, a second Mod slot. A fine forge or better makes a core a tier higher.
- **Sockets** by tier: 1 at tiers 1–2, 2 at 3–5, 3 at Starmetal; a cutter 1 (2 at 5–6), the worn cutter none.
- **What it takes:** the recipe's ore (any ore: it sets the tier; a rig frame 14, plate 21, a weave 16, a shell 26, a charm or lantern 13, a cutter 15, a drill 23) and parts. The plain recipes known from the start (the rig frame, plate, charm, cutter) take any creature's parts; the rest name their creature: weave 3 fibre, shell 3 chitin, lantern 2 spores, drill 2 cogs.
- **Optional exotics:** riftglass forges a base a tier above its ore; an elemental exotic worked into a rig frame brings its Element's core out with it; a Lodestone shard worked into a frame gives its spells a second Mod slot.
- **The forge's tabs:** FRAMES, CUTTERS (the cutter and the drill), CORES, ARMOR, CHARMS, TOOLS (the carried tools), BUILDINGS (the outpost's buildings), WICK (Wick's upgrades) and the CODEX (the resonances); a new game shows only FRAMES and CUTTERS, and the rest appear as they wake (Onboarding, below). A dot marks what can be made now, a tick what's built or fitted. At the top, **CLOSE TO MAKING** names up to two recipes better than what's worn that are short by a little, and what they're missing.
- **Cores** for spells (Combat and builds) are recipes too: a Form's 6 ore and 2 ether (a Ward's, a warden's heart); an Element's 4 ore and its exotic (Force needs none); a Mod's 5 ore and 3 of its creature's parts (chitin Pierce and Split, ether Echo, cogs Quicken, fibre Linger, spores Chain, any Amplify).
- **Tools** are made once at the forge, from the stash, when the star has grown enough (Tools).

### Research

Recipes are revealed by research, instantly, at the forge. When you bring home something new, the forge studies it the next time you open it, and a short reveal shows what it can make now:

| Brought home | Reveals |
|---|---|
| Lumenite | Lantern, Nova core |
| Resonite | Drill |
| Aetherglass | Lance core, Well core |
| Sigilite | Shell |
| Chitin | Pierce and Split cores |
| Ether | Echo core |
| Cog | Quicken core |
| Fibre | Linger core |
| Spore | Chain core |
| A warden's heart | Ward core |
| An elemental exotic | its Element's core |
| The first module | the Capture Lens |
| A module from a snapjaw, a wisp, a stalker | Weave, Orb core, Glaive core |

Known from the start: the rig frame, plate, charm and cutter, the Arc and Bolt, Force and Amplify, and the tools. Blueprints are gone as drops; an old save's blueprints are known recipes.

## Loot

- **Drops are materials, and modules.** Each creature leaves its own part, graded by the biome; elites and wardens more, and now and then an exotic or a sealed relic.
- **Modules** are the Diablo layer. The dark's creatures are made of the world's own living energy; when one dies, its pattern unravels, and the Charter suit's capture field catches the strongest thread of it and sets it in a blank lattice crystal. Rarity is how much of the pattern was caught.
  - **Few but meaningful:** a kill leaves one 7% of the time, an elite 65% (magic or better), a warden two and a Keeper three (rare or better, a tier up, a Keeper's legendaries three times likelier). A Deep's chances are 1.4 times, the Capture Lens 1.5 times, and the first eight modules ever come 2.6 times as often. About three or four a sortie.
  - **In the field:** the creature's energy draws in and collapses into a small faceted crystal in its rarity's colour, which glints now and then (rare and better stand in a beam). Walked over, the capture field's tether pulls a few motes to the Kindler.
  - **Rolled:** for the rig, armor, a charm or a cutter (a creature's family leans it: a crawler's to defense, a wisp's to spell, a stalker's to close, a snapjaw's to utility, a spitter's to mining, each clime creature its own). Traits by rarity: common 1, magic 2, rare 3, legendary 2 and a power, set 1 and the set bonus; each at 60% of an old item affix (there are more sockets than there were pieces). Their tier is where they were caught, so deeper modules roll higher.
  - **The card** says where it was caught ("Caught from an elite Wisp, Bloomfen"), its traits with how well each rolled, and UPGRADE or DOWNGRADE against what's in the socket it would take.
- **Socketing is free** at home, at the locker: tap a base, tap a socket, tap a module from the drawer, each line saying what it would change. A better base takes the old one's modules (and a frame its cores) when equipped.
- **Working a module is UPGRADE and SALVAGE, nothing else.** Both are buttons on its card at home, at the locker or the **tuning bench** (the outpost station that lists every module, socketed first):
  - **Upgrade** a tier (its lattice regrown in denser ore): 10 ore of the new tier and 4, 8, 14, 20 or 28 threads; every trait that grows with the tier grows.
  - **Salvage** a module into threads (common 1, magic 2, rare 4, legendary or set 7, +1 a tier above 1); a base into 40% of its ore (its modules and cores come out whole), now and then an exotic. SALVAGE ALL ▼ breaks down every base and module marked ▼ that isn't kept (★).
  - Legendaries are found, never made: there's no reroll, fusing, adding a trait or imprinting.
- **Sealed relics** open at home into a rare module or better.
- **Legendary powers** change how you play; a module carries one:

| Name | Kind | Power |
|---|---|---|
| Faultline | cutter | Breaking a vein sends out a shockwave |
| Twice-Told | rig | Every spell fires twice |
| Redwake | rig | Critical hits heal |
| Lodeheart | armour or charm | Kills heal and pull in nearby loot |
| Stormcaller | rig | Bolts chain to two more enemies |

- **Sets.** Prospector's Regalia: three set modules (Edge for a cutter, Seam for armor, Token for a charm). 2 socketed give +20% mining speed and +6 cargo; 3 heal you when you break a vein and give +20% chance of double ore.

## Combat and builds

- **Everything is a spell, cast from the rig.** The rig is the Charter suit's wrist projector: a bracer on each forearm, an amber lens on its back. Its **frame** (forged at FRAMES, its ore setting its tier and power) drives **two spells**: A from the right wrist, B from the left, each its own button, which shows its Form. Nothing is held: the Kindler thrusts a fist at the aim and the light leaves the wrist. Close range is a spell too: the Arc and the Glaive.
- **Slots:** the rig, cutter, armor and charm.
  - **A press casts the spell**, for charge. A press during a cooldown is held over until the cooldown ends, so taps never get lost.
  - **Holding charges it:** 1.8× the damage for 1.5× the charge; charged bolts and lances are bigger and pass through more. A held Arc bursts into a Nova of its element instead.
  - With no rig worn, spell A is a free Arc.
- **A spell is three cores, in no order:** one **Form** (its shape and range), one **Element** (its damage and status; with none, Force) and one **Mod** (what changes it). A better frame has **two Mod slots**: Resonite or denser, a masterwork, or a Lodestone shard worked in at the forge. No Form: a weak spark.
- **Charge** is the mana. It refills on its own. A cast costs its Form's charge times its Mods'. **Close Forms give charge back** for each foe they hit (2 a foe, 3 foes at most), so fighting close keeps the casting going.
- **Setting cores is free** at the locker: tap the rig, tap a part of a spell, tap a core from the drawer (it shows only the kind that part takes). Each spell reads as its name, `BOLT · SHOCK · CHAIN`, and one short line: its charge, and a resonance it wakes, or a Mod that does nothing for its Form.
- **You start with the Scrap Rig: A `ARC`, B `BOLT`**, so the first fight has close and far, and both have room to grow.

| Form | Range | Charge | What it does |
|---|---|---|---|
| Arc | close | 3 | A sweep of light in front. Tap, tap, tap: the third is heavy and staggers. Held, a Nova |
| Glaive | close | 6 | Two blades of light circle you for 3 s, cutting what they touch |
| Bolt | mid | 4 | A fast bolt at the nearest foe |
| Lance | far | 6 | A long lance that pierces a line of up to five |
| Orb | mid | 7 | A slow orb that drifts at the aim, pulsing damage round itself |
| Nova | area | 10 | A burst all round you |
| Well | area | 10 | A knot of gravity at the aim: yanks and stuns, then drags and grinds |
| Ward | guard | 9 | A shield that soaks damage for 5 s; its element hurts what strikes it |

| Mod | Charge × | What it does |
|---|---|---|
| Split | 1.3 | Three at once, each at 60% (a Glaive's blades tripled, a Ward's soak) |
| Amplify | 1.2 | 50% wider and 20% harder |
| Quicken | 0.67 | A third cheaper, and the hand waits less |
| Chain | 1.2 | Each hit leaps to 2 more foes |
| Echo | 1.25 | Casts again 0.4 s later at 60% |
| Pierce | 1.1 | Passes through 3 more (bolts and lances) |
| Linger | 1.2 | Leaves a field of its element where it ends, for 3 s |

- With two Mod slots, two of a Mod stack: two Splits fire five, two Echoes cast twice more.
- **Reactions** (reactions.js). Every element leaves its status on a foe for 3 s. A second element hitting a foe that still carries another's reacts, in either order: so spell A's element and spell B's play off each other. Each reaction's name flashes over its target in the pixel hand, and Wick explains it the first time.

  | Reaction | Elements | What it does |
  |---|---|---|
  | Shatter | Force + Frost | ×1.6 on the chilled; a frozen foe bursts, hurting what's round it |
  | Conduct | Frost + Shock | the shock leaps to every chilled foe within 5 tiles |
  | Steam | Frost + Ember | a cloud: foes in it lose the diver for 2 s |
  | Brittle | Frost + Blight | +25% from everything for 3 s |
  | Pyre | Ember + Blight | the poison left bursts at once |
  | Flare | Ember + Shock | blinds, and breaks wind-ups |
  | Scatter | Ember + Force | burning ground flung the way of the knock |
  | Jolt | Force + Shock | the stagger adds 2 overload |
  | Overload | Shock ×5 | stunned for 1 s |
  | Freeze | Frost ×3 | frozen solid |
  | Inferno | Ember on the burning | burns stack, and at three they spread |
  | Plague | Blight on the poisoned | the poison spreads at once |
  | Stun | a second heavy Force hit | stunned for 1 s |

  A boss takes a third of a stun, freeze, blinding or loss; the Hollow none.
- **Ore affinity.** A frame's ore (the one it's named for) favours an element: a spell of it is attuned, 25% harder and its status half again as long. One line on its card: Ferrite Force, Lumenite Shock, Aetherglass Frost, Sigilite Ember, Starmetal Blight; Resonite none, but its resonances are 25% stronger.
- **Resonances** (resonance.js): named spells, found by trying. A spell whose cores hold all of a resonance's parts, in any order, wakes it (a Mod over doesn't matter); the four-part ones need two Mod slots. A resonant spell hits 50% harder (a Resonite frame more), and does something its parts alone don't:

  | Resonance | Cores | What it does |
  |---|---|---|
  | Thunderhead | ORB SHOCK LINGER | the orb stops overhead and becomes a stormcloud, drifting over the nearest foe and striking it every 0.4 s for 4 s |
  | Shatterglass | LANCE FROST ECHO | the echo lance shatters the chilled along its line for double, flinging shards to either side |
  | Kindling Arc | ARC EMBER QUICKEN | every third arc sets the ground in front alight in a crescent |
  | Wildfire | ORB EMBER SPLIT LINGER | three orbs leave burning trails; plants catch, and the fire runs through them (for show) |
  | Stormglaive | GLAIVE SHOCK CHAIN AMPLIFY | the blades arc lightning to every foe within reach |
  | Starfall | BOLT FORCE SPLIT AMPLIFY | three bolts rise and meet as a falling star: a crater, a stun, a ring of light |

  The forge's **Codex** shows each as a row of unknown cores with its count; **resonance traces** show its parts one at a time: elites drop them now and then, they lie by ancient forges. Kindling Arc is known from the start, and building or casting one fills in its page. On the rig's card a resonant spell's line goes gold with its name.
- **(proposed)** The Lode and Rift elements, with more Forms, Mods and resonances.
- **The dash** is a quick burst that nothing can touch, from DASH or a flick of the move thumb. It's how you get out of a lunge or a charge.
- **Impact:**
  - a hit stops the world for an instant (the view doesn't shake: the designer found it unpleasant);
  - damage numbers pop off;
  - the spell leaves the wrist projector as the Kindler thrusts a fist at the aim (castfx.js); an Arc is a crescent of light swept across in front, the heavy third thicker and wider, throwing sparks.
- **The player is the Kindler,** in the Charter's blue and amber.
  - A near-black navy suit with amber-gold circuits, royal blue plate at the pauldrons, belt and gloves, the rig's bracers flaring to the wrists with an amber lens on each, and a pale gold seed-star on the chest.
  - A faced helm: an opaque blue shell, a faceplate of plain dark glass with a blue-white glint, and a warm-white brow lamp over it. The brow lamp is the lamp you see by, and its light and shadows come from it. From behind, a ridge runs down the helm and an air port sits on the back.
  - Blue is for everything solid and amber for every light; there's no teal on the suit.
  - Drawn in 8 facings, with a 4-frame walk.
  - Wick, a small drone, follows over its shoulder, bobbing, its teal eye turned the way the diver looks, clear of the brow lamp.

## The base: the outpost

Home is a place you walk, not a menu. It's the middle territory of the world: a cleared site round the star, its Charter base compact in the middle, every station a few steps apart:
- **The Lodestar** hangs over its planting cradle, bobbing, and grows bigger as it grows stronger. Its lodelines run out across the ground along the paths to the openings, one more for every magnitude, reaching further as it grows, and all the way and brighter towards land already kindled.
- **The base** came down with the seed: Charter modules (the fabricator, the locker, the tuning bench, the star's altar, the uplink, the portal's gate, the Kindler's habitat pod) standing on the cleared site's packed earth, landing pads round them, and faint trodden tracks out to the openings. Supply containers stand stacked by the modules. **Starstone** is the star's own growth: the ground round the cradle turns to gold-veined lodestone, a small ring at magnitude 1, spreading further at each magnitude (to the modules by about 4 or 5, most of the cleared site by 8), its edge creeping ahead in tendrils; and gold and lodestone crystal grows up the modules' feet and edges.
- **The light.** The outpost is the star's own ground, the first lit land, under the sky like kindled land; its daylight rises with the star, from a low warm light at magnitude 1 to full day by magnitude 6. Light masts round the ring come on, one for every magnitude.
- **Ways out.** An opening on its edge towards each land next to it, as a territory has, labelled with the land's name; walk out of one into that land, and walk back in through its opening home. Near each opening the cleared ground grades into the land beyond: its ground, its plants and its rock, so each side of the outpost looks like the land past it.
- **The settlement.** For each lander the *Meridian* sends (one for every 3 territories kindled), a lander on a pad, a habitat pod and a lamp beside it, and a settler on the plaza, up to six; all of them once the colony's called.
- **The stations:** walk up to one and the contextual button names it.

| Station | What it does |
|---|---|
| The portal (SET OUT) | In a Charter gate. The world map: a territory next to the outpost to walk out into, or a spire to set out to, and the tool to carry |
| The forge (FORGE, SUPPLIES) | The Charter's fabricator. Recipes by tab, each exact: rig frames, Form, Element and Mod cores, plate, charms, picks and tools, from banked ore, parts and exotics. Studies what's new (research). Every forge is played on the anvil. SUPPLIES, beside FORGE, makes supplies from ore |
| The tuning bench (TUNE) | Every module, socketed first: tap one to UPGRADE it (threads and the new tier's ore) or SALVAGE it (threads) |
| The locker (OPEN LOCKER) | What's worn, the rig's two spells and every module socket, the stash's modules, frames, bases and cores, stats; equip, socket modules and set cores (free), upgrade and salvage, unseal relics, KEEP |
| The star's altar (THE STAR) | Hold FEED THE STAR and the light your deeds earned rises into the star, mote by mote, faster the longer you hold, until you let go; ATTUNE shows the light waiting, what grows the star and its reach, and spends attunements. A shard carried home is set here instead (SET THE SHARD) |
| The practice target | A construct that takes every hit and never falls, for trying combos |
| The uplink (THE UPLINK) | A relay mast to the *Meridian* in orbit: the landers it can send, the shards set, the echoes, and calling the colony down |

- **The anvil.** Each forge is three hammer strikes: a marker sweeps a bar, faster each time and dragging as it crosses the glowing zone, and you tap while it's in the zone.
  - A strike in the zone is good, and one in its marked middle is perfect.
  - The strikes add up to a quality from rough to masterwork, which only adds to the recipe (Crafting): +5%, +10% or +15% on its numbers, and a masterwork a module socket more and a frame's second Mod slot.
  - A fine forge raises a core's tier.
- **The reveal.** A forged piece rises in a beam of its quality's colour (an unsealed module, its rarity's), then its card opens.
- **After a sortie,** a report says what came home or what was lost (and where you wake, after a fall), then you're back on the plaza or at that spire.

| Attunement | Each rank (up to 5) |
|---|---|
| Vitality | +15 max health |
| Proximity | +8% close spell damage |
| Clarity | +8% spell damage |
| Stride | +5% move speed |

### The buildings
The Charter planned more base than came down with the seed. Each building has a plot in the outpost's plan from the first day (a deck slab with amber corner lights, the seed-star stencilled on it while it's empty), the same spot every visit. Each is built once at the forge's BUILDINGS tab; the *Meridian* drops it, and it comes down to its plot on its thrusters the first time the plot is in view. They're painted as the stations are, cast the star's shadows and grow starstone. Numbers in `T.structures`.

| Building | Magnitude | Costs | What it does |
|---|---|---|---|
| Drone Bay | 2 | 8 Ferrite, 15 threads | Wick can be fitted with upgrades (the forge's WICK tab) |
| Refinery | 2 | 4 Lumenite, 35 threads | Level 1 of 3: supplies stronger (below). Upgraded at SUPPLIES: level 2 at magnitude 3 for 6 Resonite and 50 threads, level 3 at magnitude 5 for 6 Sigilite and 90 threads. Also 4 of an ore and 2 threads refine into 1 of the next ore up (one already brought home) |
| Forward Relay | 3 | 5 Resonite, 70 threads, 3 chitin | An emergency recall takes half the time; banking and travel at a spire are quicker |
| Settlers' Quarters | 4 | 4 Aetherglass, 100 threads, a Lodestone shard | Each time you come home the settlers bring 6 threads; two more settlers, and their lines |

### Wick's upgrades
Fitted once at the forge's WICK tab, once the Drone Bay stands; each can be turned off and on at the locker, free. Each shows what it does, and Wick says a line the first time. Numbers in `T.wickUp`.

| Upgrade | Magnitude | Costs | What it does |
|---|---|---|---|
| Scanner | 2 | 5 Lumenite, 15 threads, 3 spore | Every 7 s out in the land a ring goes out from Wick: veins within 8 tiles glint, arrows mark the pack and modules on the ground |
| Lamp | 3 | 6 Resonite, 25 threads, 3 fibre | A second, dimmer beam behind you (with the lamp as a beam) |
| Hex Shield | 3 | 8 Resonite, 50 threads, 3 chitin | Once a fight, a hex shield stops the hit that would leave you under 35% health; ready again after 20 s unhurt |
| Spark | 4 | 8 Aetherglass, 65 threads, 3 cogs | Every 2.6 s, a shock at the nearest awake foe within 4 tiles: 7% of its health |

### Fewer trips home
- **Ancient forges:** from depth 3, a floor sometimes has one in a side cavern. It forges from what you carry, on the same anvil, and the piece goes in your cargo.
- **Supplies in the field:** MAKE, in the cargo screen, makes Mending Injectors and Lightcells from the ore you carry.
- **The pack waits:** a fall leaves the haul where it fell, to go back for once.

## Supplies

Once the star isn't fed ore, old ore needs a use: it makes supplies, carried on the belt (4 of each, safe whatever happens, spent when used). Two kinds, no grades:

| Supply | What it does (no Refinery / levels 1, 2, 3) |
|---|---|
| Mending Injector | heals 35 / 50 / 65 / 80% of your health at once |
| Lightcell | gives back 30 / 40 / 50 / 60% of your light, in dark land or a Deep |

- **Cost:** one is paid in the plainest ore there's enough of, the higher tiers costing fewer: 6 Ferrite, 4 Lumenite, 3 Resonite, 2 Aetherglass, 2 Sigilite or 1 Starmetal. The button's cost names the ore it will take.
- **Made at home** at the fabricator: SUPPLIES, beside FORGE: the two kinds, how many carried, MAKE with its cost; under them the Refinery's level and its next upgrade, and refining.
- **Made in the field:** MAKE in the cargo screen, from the ore carried (only what can be made is listed).
- **Used from the deck:** each has its own small round button at the top of the right deck, MEND (green) and LIGHT (gold), with its icon and how many on a badge; dim at none. Q and R on a keyboard.
- An older save's graded supplies merge into the two kinds; its Flares, Ward Cells and Blast Charges (cut) come back as 5 of their grade's plainer ore each.

## Onboarding: a little at a time

A new Kindler isn't shown everything at once (`js/onboard.js`, `js/tutor.js`; DECISIONS.md, 2026-10-20).
- **Systems wake when their moment comes.** A new game has walking, mining, both spells (the Scrap Rig comes with ARC and BOLT), the dash, the portal and the openings, the forge's FRAMES and CUTTERS tabs and the locker's worn gear. The rest wakes, and stays awake: changing the rig's cores (the locker's drawer, CORES, CODEX) with the first core beyond the starting ones, researched or forged; module sockets, the locker's modules and the tuning bench with the first module caught; the star's altar and ATTUNE with the first light of a deed; SUPPLIES, MEND and LIGHT and the cargo's MAKE with the first ore brought home (after the walkthrough's cutter, if it's running); ARMOR and CHARMS after the first thing forged; TOOLS, BUILDINGS and the uplink at magnitude 2 (the uplink also with an echo or a shard); WICK with the Drone Bay. A station not yet awake stands dark and unlit at the outpost, its name dim with OFFLINE under it, and has no button. Each unlock is worked out from progress, so no save ever finds anything locked that it has used; a save from before onboarding opens with everything awake and every tutorial seen. Wick says a line as each wakes.
- **The first landing.** After the opening, Wick offers to walk you through it: WALK ME THROUGH IT or I KNOW THE DRILL. Walked through, one line of Wick's sits at the top of the view, the button that matters pulses, and a gold ring and chevron mark the spot on the world (an arrow at the view's edge when it's off it): out of the lit opening into the gentle land, a vein mined, a foe Wick calls up (ARC, then BOLT, then DASH, then finish it), a cutter's 15 Ferrite and a part, home (walk back, or RECALL), and a Ferrite cutter at the forge, whose tutorial takes over; then NEXT. It's eased: Ferrite gives two a vein while it runs, and the foes it calls always leave a part. ✕ on its line stops it. Either choice still wakes the systems a little at a time.
- **Tutorials: Wick points, you do.** The forge, the locker, the tuning bench, the star's screen, SUPPLIES, the portal's map and the uplink each run a tutorial of three to five steps the first time they open: the screen dims but for the one thing that matters and the way out (✕, which ends it), Wick says one short line by his portrait, and the step is done when you do it (tap what's lit, or NEXT for something only shown). A small SKIP is always there; a tap anywhere else does nothing. Each screen's header has a ? that plays its tutorial again, then a short reference: the explanations that used to sit on the screens. The ? in the top bar pauses the world and walks the HUD.
- **Plain screens.** Labels of a word or two, numbers with icons, at most one short line on a card; no notes paragraphs. Costs always name their resource; a screen's way out is always in sight.
- **At home, NEXT is marked:** when the next goal is the altar (light waiting, a shard), the altar has a faint violet ring.

## Controls

- **Upright:** a floating joystick under the left thumb (a quick flick dashes). Under the right thumb, a cluster:
  - spell A, big, in the corner;
  - spell B;
  - DASH;
  - MINE, held to cut: the Kindler holds the cutter out at the rock, a blue-white beam bites it and throws molten sparks;
  - the contextual SET OUT, STEP THROUGH or EXTRACT above them;
  - MEND and LIGHT, the two supplies, side by side at the deck's top-left.
- **Sideways:** the view stands in the middle with the controls either side, as in NEO.
- Close Forms aim at the nearest enemy in reach, and the rest at the nearest in sight. Mining targets the ore you're facing.
- CARGO in the top bar shows how many things you carry; its screen lists them, ore and exotics included. Tap anything to equip it or drop it mid-sortie. The pause screen has START OVER, which asks first (a screen saying everything is lost, then a second tap) and wipes all but the settings. Dropped ore lies on the floor as a glowing heap you can pick back up.
- **Keyboard:**
  - WASD or the arrows to move,
  - J for spell A and K for spell B,
  - Shift or U to dash,
  - Space or L to mine,
  - E or Enter to act, I for cargo, Esc to pause,
  - Q for a Mending Injector, R for a Lightcell.

## Presentation

- Top-down pixel art with 24 px tiles. The world is measured in world px (16 to a tile: every body, reach and speed); the art is drawn at 1.5 art px to each (`T.art.px`), so the extra detail is real pixels, never enlarged ones. One pixel size for everything drawn in the world. The view shows about 176 world px (264 art px, 11–12 tiles) on its shorter side, scaled up by whole device pixels: at least that, or a whole scale closer to it if it still shows nine tenths of it.
- **Art style: "Glow + Detail", drawn to the A+ rules** (DECISIONS.md; the knobs are in `T.art`).
  - A grim palette in short ramps, hue-shifted: shadows lean to violet, lights to warm gold. At most 3–4 tones of a material on one thing, chosen by its form, lit from the top left.
  - Texture in clusters of light and dark, never speckle. No dithering on creatures, sprites or props; a little at the edges of large ground gradients only.
  - Black outlines on creatures (the diver, enemies, critters); sel-outs, a much darker shade of the colour inside, on flora and props.
  - Darkness, where only magitech gives off light: the helmet lamp, ore glints, runes, glowing fungus, singing crystals, magma, enemies' eyes and cores, the lodelines and the Lodestar.
  - Light comes in a few hard bands, dithered only just at each step's edge, and glowing things bloom.
  - The plan: these rules on the 16 px art (done), then 24 px tiles by enlarging the letter grids 1.5× before shading (done), then a hand redraw where the enlargement falls short.
- **Readability rule.** Rock tops are always darker than the floor, with lit rims and front faces where they meet it.
- **Shadows from the lamp** (shadow.js, the numbers in `T.light.shadow`). The diver carries the light, so the rock stops it: the floor behind a pillar or round a corner falls to the place's ambient light (never to black) until you step round it, and walking past a pillar sweeps its shadow across the floor. The shadow's edge follows the smooth wall line, not the tiles, cut on the light's own grid and in its hard bands. The rock the lamp strikes keeps a lit skin, and a wall's front face stays lit wherever the ground under it is lit and the lamp is south of it, so the readability rule holds; tops it can't reach fall to ambient. The floor's fixed lights (lava, vents, glowing plants, a temple's shaft) are stopped by the rock too; ore, which glows from inside it, and daylight, which is ambient, aren't. Big things (big plants, columns, enemies, the warden, portals) cast a short shadow on the ground straight away from the lamp, from the foot, a little longer the further they stand: two hard steps with a ragged edge in clusters, under the lit pass, a step dropping as the lamp's share of the light there falls. Small plants, critters and loot cast none. What glows (eyes, cores, ore, loot, telegraphs) shows through any shadow.
- **Biome looks.** Each biome changes its enemies' colours, and in its own climes (Badlands, Caverns, Archive) its floor, rock and light colours; the other climes bring their own (see Climes). Each also has its own strange flora (flora.js), as sprites that stand on the floor, grow at the foot of walls, or hang from wall faces. Some sway or pulse underground:
  - **the Rim:** jelly caps trailing beads of light, frilled stalks, shelf fungus, split puffballs, blinking eye stalks, a lit pitcher, hanging roots, dripstone;
  - **the Choir:** bone tube worms, reed pipes, ribbed fans, bell flowers, spore sacs, weeping stone, ribbon fronds, chime cones;
  - **the Underforge:** ash caps, fungus on broken pipes, charred roots, a breathing vent flower, slag drips, a half-buried cog, a rust totem, cinder pods.
- **Flora grows into the place** (undergrowth.js, the numbers in `T.flora`), as merryfolk's countryside does, never stamped on bare ground:
  - by habitat: thick along a wall's foot and in its nooks, by water, towards lava or daylight underground; the middles of open ground stay mostly clear for a fight;
  - in drifts: each kind where its own seeded noise is high, so a drift is mostly of one kind and thins and frays at its edge, with the odd one out; big pieces are spaced by their size, small ones gather round them and along the walls;
  - rooted in beds painted into the floor: the ground round a plant drawn towards soil, moss, roots, litter, ash or thaw as its clime has it, its own clumps showing through, strewn with leaves or flecks; a clustered contact shadow tight under the foot, a little away from the light; the foot itself has no sel-out and is shaded into that shadow, with roots or a skirt of the bed's growth spreading from it and a few blades growing in front of it, so it melts into the ground; tufts, sprigs, moss pads, roots and scree (in the rock's own colours) as stamps in the flora's letter rows;
  - on the walls: moss climbing a short way up a face over a bed at its foot, roots, vines or icicles hanging from a lip, and under the sky a ragged fringe of dry grass, scrub, snow or moss over a mesa's lip;
  - stands of tall grass and reeds, drawn in rows among the actors, so whoever walks through one is hidden to the knees or the waist;
  - moving: under the sky everything leans in a wind of swells and gusts, a whole art pixel at a time, its top most and its foot not at all; underground a plant stirs as something brushes past;
  - ground that was rock when it grew stays bare when mined, and a piece on a wall that's mined away is gone;
  - the fighting flora are placed by the game; they get a bed and cover like any plant, and a harmless one or two of their own kind beside them.
- **Alien light.** Faint veins glow in the rock. Flora glows dimly, in colours no ore uses, and never in crystal shapes: chartreuse on the Rim, dusky pink in the Choir, low ember in the Underforge.
- **Ambient life** (life.js), cosmetic only: a few small harmless creatures a site, outlined as every creature is but small and muted, so they read as part of the place, never as enemies or loot. Lizards and flocks of birds under the sky, glowing moths drawn to the lamp underground, scurriers along the foot of ruin walls. They bolt from the diver and from fights, then settle again. On the surface, cloud shadows drift on the wind and dust gusts by now and then; underground, drips and dust in the lamp. Each clime has its own critters' colours and weather: snow, embers, pollen, fireflies, rising sparks.
- **Ore twinkles**, so it's the one thing in the rock that catches the eye.
- **Loot glows in its rarity's colour.** Rare and better stands up in a beam, so it's seen from across a room.
- **(proposed) Lamp radius as a dial.** The lamp's radius could shrink as danger rises with depth.
- **(proposed) Brightness setting.** Dark scenes lose contrast in bright sunlight.

## Sound

Everything is made in code with Web Audio (`js/audio.js`, `js/music.js`, `T.sound`); nothing is downloaded. Plain, warm, a little lonely, hopeful with unease: ambient, never busy or shrill.
- **The star's music grows with it.** A hum in D at magnitude 1, then a fifth, a soft chord, a slow figure of bells (before magnitude 4 only its two-note call), a high shimmer, a ninth, the figure in thirds, a deep bell. Feeding swells it, a ping for each mote of light; a magnitude reached blooms, and the next layer comes in. That's how the star speaks.
- **Out in the dark it thins** as your light drains, top layers first, and each place's own sound takes over: wind (dry, cold or soft), embers, lava, water and drips, a cave's room, creaking roots, a vault's clock, rain and far thunder in a storm. With the light out, a slow throb. In kindled land the star's chord comes back, with birds by day; kindling a territory brings the whole chord.
- **After the turn** a darker note creeps in: a flat sixth against the chord, phrases that fall to minor, and in the dark the place's sound breathes.
- **Effects** for what matters, soft and short, louder near the Kindler and panned: mining, hurts, the light fading, loot by rarity, the anvil, the reveal, banking, travel, kindling, landers.
- **The fight sounds like science fiction, not an arcade:** layered, film-style energy weapons and impacts (transient, FM body, texture, sub, a short reverb), rendered ahead into a few variants each after the first tap (`js/sndbank.js`). Each element has its character (Force a pressure wave, Shock an arc's crackle, Frost a crystalline shatter, Ember a plasma roar, Blight a corrosive hiss) and each Form its motion (a sweep, a discharge, a beam, a burst…). Stings are low brass swells.
- **Footsteps by material:** snow, packed earth, gravel, ash, moss, mud, stone, metal, ice, water, wood, roots, each its own, by the clime underfoot, a hazard waded through, or the outpost's paving.
- **Settings:** MUSIC and SOUNDS on the pause screen, each on, soft or off, kept in the save. Silent until the first tap; suspended while the page is hidden.

## The prototype

The aim is broad and rough rather than narrow and polished. Everything below is built:
- the base with every station;
- 3 biomes with 2 ores each and 6 cutter tiers;
- 3 enemies per biome, elites, and the optional warden;
- the whole loot pipeline;
- the world: rings of territories, light, spires, kindling, Deeps;
- cargo, death, and saving in localStorage.

The autopilot (`test/bot.js`) plays whole careers from a fresh save, out into the world and home again. With three minutes of light and no cargo limit, over 24 sorties it usually kindles 25–35 territories, ends at magnitude 7–8, and falls in about 4% of its sorties, mostly early (DECISIONS.md, 2026-10-20, leaner rules).

## Open questions

- Pacing: how long a sortie and a career should take for a person rather than the bot.
- What a sortie gives back when you fall, if anything. For now it gives nothing but what was banked; the rest waits in the pack.
