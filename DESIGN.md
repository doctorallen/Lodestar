# Lodestar: design

Lodestar is a top-down pixel-art mining and looting game for the phone browser. You play a Kindler, an explorer in a blue Charter suit with amber circuits, a faced helm with a brow lamp, and a little drone, on a world where technology runs on arcane ore. From a seed-star newly planted in the middle of a dark world, its Charter base round it, you carry its light out across the land, mine ore, fight, take the land one territory at a time, and decide when to push further and when to get back to a spire before you lose the haul.

It mixes Terraria and Starbound (always another ore to find, and the gear it makes) with Diablo (every drop is a roll of the dice, so you never keep the same gear for long).

Items marked **(proposed)** aren't settled or aren't built yet. Everything else was decided by the designer and is in the game. `DECISIONS.md` logs each decision and why it was made, and `js/tuning.js` holds every number.

## Pillars

1. **Always another upgrade.** A new ore leads to a new cutter, which opens new depths, which leads to new gear.
2. **Crafted bases, named cores, learned patterns.** What you forge is exactly what its recipe says, and nothing rolls: a core is its kind and its tier, and the power on it is a pattern the suit learned from a creature and the replicator printed for that creature's parts. The dark leaves parts and knowledge; only the Keepers, wardens, relics and ancient forges leave finds (legendaries). The anvil only adds.
3. **Push your luck.** The further out you go, the better the loot and the higher the risk of losing it.
4. **Built for a thumb.** It plays well upright with one or two thumbs, in short or long sessions.

## The story

**The Kindler.** You're a Kindler of the Lodestar Charter. The Charter sends seed-stars to dead worlds, and a Kindler rides down with each one to plant it, carry its light outward spire by spire, and carry the world up to it ore by ore, until the star is whole and can shine on all of it.
- **The landing:** a planned terraform, by the book. The seed comes down alone on a surveyed site in the middle of the world, and where it lands its light opens into the hollow sphere that is home. A new seed always starts small, its light reaching only a little way; growing it, by feeding it the light of what the Kindler does (land kindled, deep places found, the Keepers' shards), giving it the world's ore to taste, and planting spires to carry its light, is the Kindler's job. It's your first terraform, so you grow in skill as you go (the attunements are that skill). Wick has done this before.
- **The *Meridian*** is the colony ship waiting in orbit with its settlers asleep. They sleep until the star is whole: every band of its light at the Charter's mark (the Spectrum, below). Nobody comes down before. What the Kindler doesn't know until the end is what the spec means by whole: the sleepers are the star's last feeding, when it finishes its work.
- **The Spectrum: why ore matters to people who can build a star.** A seed-star makes anything from anything; what it can't do is shine on a world it doesn't know, and the Charter can't ship that knowledge ahead, because it has to be taken from the world itself. Ore is the world's body, and each kind the star is given at its altar is a band of light it learns to shine in: Iron (Ferrite), Lumen (Lumenite), Chord (Resonite), Glass (Aetherglass), Sigil (Sigilite), Star (Starmetal). A band's depth is the ore given (8, 24, 60, 120, 200 ore for depths 1 to 5); the Meridian's mark is depth 4. Depth 1 of a land's band lets the star kindle that land: the Choir needs Chord, the Underforge Sigil, the Edge Star; the Rim needs only the Iron the survey taught it. So the Kindler walks into dark land the star can't light yet, mines its ore, carries it home and gives it, and the star tastes it ("Oh. That's what the singing was.") and the land opens. The title bar at home is the spectrum: six bars with the mark across them, the whole game's state at a glance.
- **Why take ground:** it's the job. Every spire carries the star's light further, and the dark is thicker where the light has never been.

| Act | What happens |
|---|---|
| Ring 1 | Plant spires and the land wakes up, terraforming round each spire. The star speaks as it grows, and as it first tastes each ore. |
| Ring 2 (the turn) | The procedure itself is what's in question. The echoes, logs of earlier Kindlers, show that the world wasn't dead. The dark is the world's own living night, and the Hollow is what grows in it. The Keepers are earlier seed-stars that went dark. |
| Ring 3 | Each Keeper holds a shard of its dead star. Set the shards in yours and your light reaches further. |
| The Edge | The heart of the dark. You choose: **kindle it** (the world becomes a garden and the Hollow is gone) or **leave it** (the world keeps a night, the colony lives in the light, and the Hollow keeps to the dark). The game goes on after either. |

- **The shards:** a Keeper waits at the end of an expedition in each biome, and each is a gear check: what you forged and socketed is what gets you through, not a damage race (`T.enemies.phase`; a line under its health bar says what answers it, and Wick says it the first time):
  - the Rim's, a fungal crawler-queen that calls its brood, and every 16 s shells itself in a ward that only Force cracks (three hits, a heavy one counting two);
  - the Choir's, a towering tube-worm of crystal that turns all but a quarter of any hit until it's chilled, when Force shatters it for double: bring Frost and Force;
  - the Underforge's, a slag colossus wreathed in fire that turns all but 30% of a hit and leaves magma where it charges, until Frost quenches it for 6 s, when it's open (2.5×) and leaves none: bring Frost, and make the moment count.
- **Bringing them back:** a taken shard is bound to you and safe from any fall. Set it in the star at the altar, which feeds the star 40 light, a big jump (a ring-1 kindling is 12).
- **The colony never lands early.** The uplink shows the Meridian's sleepers and the spectrum against the spec; its tip burns warm when every band stands at the mark. The endings say what the spec meant: kindle, and the Meridian comes down into the light and the star takes it; leave, and it stays in orbit, asleep, with a slow way to wake them by hand.

How it's told:
- **An opening** on a new game: about 56 seconds of painted scenes that play on their own, a short caption each (`js/intro.js`, the words in `STORY_INTRO`): the Charter's craft crossing the dark with the seed-star held in a cage of light at its bow (a needle of a hull, hard-light vanes, a ring drive), the Meridian behind; the survey's beam sweeping the dark world and marking a site; the outpost's own modules and the planting cradle with the seed in its arms coming down by the book, the cradle locking; the Meridian in orbit and, close, its settlers asleep in their pods; and the outpost itself, where the star rises out of its cradle and lights, the modules wake one by one, the camera comes down to the Kindler stepping out of their pod with Wick ("I'm Wick, your drone"), and play starts right there. A tap hurries a scene (the first only brings the sound in); SKIP INTRO ends it; the uplink plays it again. A faint hint of unease: once, something on the dark face answers the survey's light, and late in the last shot, two cold points in the dark land past an opening.
- **Wick**, your drone, dry and kind, says a line the first time things happen: the first dive, parts, a blueprint, the anvil, the light thinning, a new biome, a Keeper, a shard, the first spire, the first territory kindled, the first dark tide, the first Deep, each ring, the Edge, the first feeding of the star, the first ore given to it and a land it hasn't tasted, the first heartlight and deeplight, a spire the star can't reach yet, the first pack left by a fall ("Your pack's still out there. We can go back for it.") and found again.
- **The star speaks** as it grows, a seed-star waking where it was planted, as each shard is set, when it first tastes heartlight and deeplight, and when it first tastes each ore.
- **Feeding seeds the turn.** It's the procedure: the star is fed the light of deeds. But the deeds take something from the world: kindling burns away the dark, the world's own night, and the star tastes it ("This light was night, a moment ago"). The echoes show earlier Kindlers fed their stars the same way ("the light I carry up to her: I used to think the night had no use for it"), and the last of them stopped feeding hers. By the Edge, the player has been doing the kindling all along.
- **Eight echoes:** logs of the Kindlers before, found by ancient forges, from elites now and then, and from every Keeper, and read at the uplink in the order found. The early ones are hopeful, the middle ones uneasy, and the later ones carry the turn.
- **The log:** one line for each territory kindled, by its clime.
- **Never say it outright.** No line says the dark is alive or that the Keepers were stars, and nothing before the ending says what the spec means by whole. The echoes and the star let it show.
- **The tone:** plain, warm and a little lonely, hopeful with unease. Short lines that read on a phone.

## The Lodestar (home)

The Lodestar is the seed-star the Charter sent down with you. It came down alone, by the book, and where it landed its light opened into a great hollow sphere on the ground: home is the inside of the star. Its floor is glass over the star's light, faceted, its seams the star's veins, hot under the heart; its skin is a wall of brightness two tiles thick with an opening towards each land next to it, so every way out is a doorway from day into night; and the heart of the star, a crystal many times the seed's size, hangs over the middle, so from the floor you see its lower point and nothing of its top. The land beyond grades in at each opening. There are no stations and no buildings: a seed-star makes anything from anything, and the star is the only thing at home.

- **Its light.** The star's light reaches the land next to it, and every spire planted further out carries it on. Out in the dark, your own light drains; in kindled land and at home it fills again.
- **The star grows from deeds, not ore.** What the Kindler does gives light, in motes carried home and fed to the star before it, a point each; the points raise the star's **magnitude**. Ore is for the Spectrum (The story): each kind given is a band the star learns to shine in.
  - **Heartlight:** kindling a territory, 12 in ring 1, 16 in ring 2, 24 in ring 3, 32 at the Edge. It's bound to the Kindler the moment the spire stands, safe from any fall.
  - **Deeplight:** first reaching a Deep's end (its deep vein, or its Keeper's lair), 8 in ring 1 to 20 at the Edge and 4 more for each site past the first; each ancient forge found, 4; each echo, 8. It rides in the cargo, so a fall leaves it in the pack: the push-your-luck stays.
  - **Shards:** a Keeper's heart-shard, set in the star, 40 at once.
  - **Magnitudes** at 0, 12, 40, 100, 200, 340, 520 and 740 light. Each gives an attunement point, casts everything faced a tier harder, cuts the next ore (the cutter's power is the magnitude), and opens a facet (at 2 and 4) and Wick's upgrades (2, 3, 3, 4); the heart is drawn larger from 4.
- **The star is the world's gate.** A spire holds only where the star's light reaches (ring 2 from magnitude 3, ring 3 from 5, the Edge from 7) and only in land whose band it has tasted to depth 1 (the Choir's Resonite, the Underforge's Sigilite, the Edge's Starmetal). Kindling every territory of a ring and reaching its Keeper's lair always gives enough light for the next ring's, so you're never stuck.
- **Kindled land terraforms by the light.** Round a territory's spire the ground turns to starstone, further at each magnitude, the star's gold veins run on out through the land past it, the ground greens and lit motes lie in it, what grows there grows thicker, and sparks of light rise off the stone (`js/terraform.js`, `T.terraform`).
- **The star has four faces** (`js/starui.js`). Stand before it (THE STAR; or THE STAR in the top bar from anywhere inside) and one screen has four chips:
  - **GIVE.** The feeding is a ritual, not a shop: hold FEED before the star and mote after mote of light rises from the Kindler's hands and drops into the heart, faster the longer you hold; deeplight first, heartlight last; let go and it stops. The Spectrum: six bands with the Meridian's mark across them, each with GIVE for the ore the stash holds. MAKE: supplies from the stash.
  - **TURN.** The build (Facets, below).
  - **ASK.** What the star needs next (NEXT, the light to its next magnitude, the bands dark to it), the *Meridian* and its sleepers against the spec, the shards set, the resonances known, the echoes, the log, and the landing again.
  - **GO.** The world map (SET OUT), and the star's senses.
- **Words:** Wick gives the why the first time ore comes home (the star has to taste the ground before it can light it) and the first time it's fed light (it's the procedure); the star remarks on the first taste of each ore and each kind of light.
- **What's next** is always said at home: over the view (NEXT) and at ASK and GO.

## The loop

1. **At the Lodestar:**
   - forge bases (rig frames, plate, charms, cutters), tools and the cores spells are built from; the forge studies what's new and reveals recipes;
   - build the rig's two spells at the locker from the cores you forged and found; upgrade cores (at the locker or the tuning bench), and salvage what you don't need;
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
- **Deeps.** Some territories have a hole down into a Deep of 1–3 sites (caves and ruins, ending in a deep vein), built as the old expeditions were, at the territory's own level: each site has a lodeline by chance (100, 80, 60%, more as the star grows), and a hole down to the next, or in the last a rope up. Your light drains down there too, and when it's gone a Deep's lodeline goes dark. Its lodeline (to the player, a shaft of the star's light), or the rope, takes you back up to the territory, by the Deep's hole. A hole is cut into the ground, a rope tied to a stake over its lip, glowing faintly from below in the colour of where it leads; the rope hangs into a pool of daylight. Veins mined in a Deep stay mined, and grow back after a few sorties, as in dark land. Under the furthest territory of each of the first three rings, the Deep ends in the region's Keeper's Lair while its heart-shard is missing (their own place in the world comes later).
- **The Lattice.** Under the world the Deeps join: in the last site of every Deep (but a Keeper's) a cleft goes on down, into a gallery of the Lattice, a web of tunnels laid out once a save on the same map as the land above (`lattice.js`, `T.lattice`): a shaft gallery under every territory with a Deep, a few junction galleries in the gaps reached only through the tunnels, joined so the web is one piece. A gallery is built as a territory is, with an opening towards each gallery it joins, at one depth past the land over it, richer in the region's deeper ore; there's no sky, so your light always drains, a little faster than above. In every junction, and some shafts, stands a **cold spire**, planted by a Kindler before and long dark: stand by it and hold for 15 s while the dark comes and it burns again, a spire of your own down there (bank, travel to and from it, your light coming back in its light, and a fall wakes you there), and 10 deeplight the first time. The map has a second layer, THE LATTICE, once a gallery has been walked: the tunnels between known galleries, each gallery's mark, your spires. So the Lattice is a second route to every ring, slow and dark and rich, under the star's gates: you can come up in ring 3 through a Deep long before a spire could hold there. (Later: the Keepers' lairs move down here, their own place in the world.)
- **The dark grows with the star.** In dark land, and under it, foes are at least the level of the highest territory kindled less 4 (`T.enemies.darkLag`), and their drops with them, so the land behind you stays a fight and ring 1 isn't a mow-through once ring 3 is lit. Kindled land stays quiet. A territory's card says when the dark has grown there.
- **Saved as you go.** A sortie is saved on arriving anywhere and whenever the page is hidden; reopening the game offers to carry on from where you came in.
- **Health** comes back slowly once nothing has hurt you for 4 seconds, but only in light: at home, in kindled land, by a lit lodeline or a landed beacon, or in a lit waystone's hold. In the dark nothing comes back of itself: healing motes drop from kills, Mending Injectors heal, and some affixes leech or regenerate. A sortie wears you down, and banking or pushing on is a real choice.
- **The warden** is an optional loot piñata that can turn up in a side room at depth 3 or more. It charges and fires rings of orbs. It drops three rare-or-better pieces and often a relic.
- **Carry it all.** There's no cargo limit and no weight; the top bar's CARGO shows how many things you carry. The push-your-luck is the fall: everything carried waits in the pack where you fell.
- **(proposed, stage 2)** More heart goals (purge the nest, cap the vents, carry the seed, break the Keeper), scouting, tithes and boons, richer kindled looks and settlers, optional dark tides on border territories. **(stage 3)** Keepers as ring gates, pick and spell gates, the Edge's own content.

## Climes

Every territory and every site of a Deep is also a **clime**: the kind of country it is. The region still sets the ore and how strong the enemies are; the clime sets how the place looks and feels. A territory's is fixed when the world is rolled; a Deep's sites roll theirs from the world's seed, so a hole's button names it (CLIMB DOWN: FLOODED GROTTO). Each zone's first clime is the look it always had, without a hazard.

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

One suggested goal at a time, the plainest first: a shard to set, the light waiting at the altar (first if it makes a magnitude), the pack to fetch, the gentlest land beside the light to kindle, a Deep to reach the end of, a Keeper's shard, the ore the star must taste for the land beside the light (and where to mine it), the magnitude the next ring needs. It's shown at the portal (NEXT) and as a small line over the view at home (`nextGoal`, deeds.js). (Contracts, three posted goals that paid things, were cut: DECISIONS.md, 2026-10-20.)

## The star's senses (the tools)

The tools are the star's senses, seen through the splinter, each open once a band of its light is deep enough (`senseOpen`, `T.tools[id].band`), always on from then. The Compass is the splinter itself.

| Sense | Opens at | What it does |
|---|---|---|
| Lodestone Compass | always | An arrow round the diver to the spire here, or in dark land to the opening towards the nearest kindled land; in a Deep, to its lit lodeline or the way on. |
| Ore Sense | Lumen 1 (8 Lumenite given) | Veins within 9 tiles glint through the dark, and an arrow at the view's edge points to the nearest vein the cutter can break. |
| Surveyor's Map | Lumen 1 | A map of each place, drawn as you walk it, in the view's corner, with its openings, holes, spire, waystones and ancient forge once seen. |
| Threat Radar | Chord 1 (8 Resonite) | Marks at the view's edge for what's out there within 18 tiles: dim for the unaware, red for the hunting, elite colours, violet for the Hollow. |
| Lode Beacon | Lumen 2 (24 Lumenite) | Once a sortie, from the pause menu: call a spire's light down where you stand, where no spire is: you can bank and travel from it, and standing in its light fills yours. |
| Capture Lens | Chord 2 | The suit reads a creature's pattern half again as fast. |

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

**Fewer, and each one a fight.** A room holds one to three (about 0.6 + 0.2 × depth + 0.4 × region, give or take one, so some rooms hold none and a fight is an event), composed rather than rolled one by one: the first closes in (a crawler or stalker, or the clime's own creature), the second keeps off (a wisp or spitter), so a pair covers each other. **The dark notices what you carry:** out in dark land, the more you hold (to about 60 things), the more each wave brings (up to two more), the sooner they come (up to 40% sooner), and the likelier what comes is an elite (to 35%); CARGO goes red when it has noticed, and banking puts it out. That is push-your-luck with teeth. Each takes six to eight hits at gear parity and each of its bites costs about a fifth to a quarter of your health (a shot, a glob or a beam three quarters of that), so every tell has to be read: dodge the lunge, then punish the opening, which takes 2.5× damage (a dazed stalker, a recovering crawler, a stranded eel, a spent wraith or hound). Fights are long enough for a second element to react with the first. Each kill pays about twice what it did and a vein gives one or two ore, so a sortie's haul holds up though sorties run shorter. The crawler, wisp and stalker are drawn a third bigger than they were, with bodies to match.

**The Rim is for learning.** Enemies there have 60% of their health and damage at level 1, rising to all of it at level 4 (the Rim's furthest): a crawler at level 1 falls to five hits of the starting Arc or Bolt. No room holds an elite for sure below level 3.

**Hits land.** A hit holds the foe still a moment (0.07 s, a heavy one 0.13 s) and jolts it the way it's knocked; a hit worth 15% of its health breaks off its wind-up and staggers it (not a boss or the Hollow, and not again within 1.2 s). Heavy hits stagger anything but the warden out of an attack.

**Elites carry affixes**, as Diablo's do: one, two from level 6, three from level 11 (`affixes.js`, `T.enemies.eliteAffixAt`), rolled so none clash (a Bulwark isn't Warded, a Blinker isn't Hulking). An elite has 1.8× the health and hits 1.2× as hard, and from level 3 one room in four holds one for sure, with a core for sure (magic or better). Every affix is shown three ways, a pip of its colour on the foe (one for each), its names in the pixel hand over its badges, and a tell of its own, and every one has an answer in the gear or the hands. Wick says a word on each the first time.

| Affix | What it does | The answer |
|---|---|---|
| Fast | moves half again as fast | don't let it round you |
| Tough | extra health | time |
| Volatile | bursts a moment after it dies | step back |
| Insulated | all but shrugs off Shock | the other spell |
| Fireproof | all but shrugs off Ember | the other spell |
| Warded | resists everything inside a shell of pale light until three Force hits (a heavy one counts two) crack it | something blunt |
| Shifting | its weakness moves to the next element every 6 s; its pip and badge change colour with it | watch the badge |
| Frosted | leaves chilling ground where it steps, which halves your step for a while | a dash crosses it; Ember on it melts the trail |
| Mortar | lobs a burst at where you stand every few seconds, the spot ringed for a second first | don't stand there |
| Chained | linked by a chain of light to the nearest foe: half of every hit on it passes to its partner | hit the weaker, or a Chain or Split hits both |
| Bulwark | every 8 s raises a shell for 3 s that stops bolts, lances and orbs (BLOCKED) | close spells pass; or wait it out |
| Broodmother | calls two of its kind every 10 s, four at most, at 40% health | a Nova, a Split, a Chain |
| Hulking | slow, and nothing staggers, stuns or knocks it | its openings are the way in |
| Splitter | splits into two of its kind at 45% health when it falls | have something ready |
| Leech | its hits heal it 60% of what they did | Blight on it stops that |
| Blinker | every 6 s blinks to your side, a ringed flash where it will land a third of a second first; landing on you hurts | dash on the flash |
| Thorned | a close hit on it cuts you back 30% of its bite | fight it at range |

**Weak and resistant** (natures.js). Every kind is weak to some elements and resists others, by what it's made of: weak takes ×1.5, resistant ×0.5, very resistant ×0.25. Nothing is ever immune.

| Kind | Force | Shock | Frost | Ember | Blight | Why |
|---|---|---|---|---|---|---|
| Crawler | | | | W | | a chitin shell, dry inside |
| Wisp | | R | | | I | no body, all ether |
| Stalker | | | | | W | living, thin-shelled |
| Snapjaw, spitter | | | R | W | R | living plants |
| The Hollow | R | R | R | R | R | the living dark; in a lit lodeline's light it loses them all |
| The warden, the Keepers | one W and one R by region: the Rim Ember W, Blight R; the Choir Force W, Frost R; the Underforge Frost W, Ember R | | | | | |

- **Climes shift it a step** (W to neither, neither to R, R to I, or back): the Frost Steppe more resistant to Frost and weaker to Ember; the Cinder Waste and the Magma Tubes to Ember and Frost; the Flooded Grotto to Ember and Shock; the Bloomfen and the Rootdeep to Blight and Ember; the Clockwork Vault to Force and Shock.
- **Force is mostly neutral:** it's every spell's element when it has none, so nothing met with the starting rig resists it: only the Hollow and the Gear Hound do (the Slag Crab's shell stands in for a resistance: 35% gets through, rather than 35% of a half), and the wisp, with no body to strike, shrugs off Shock and all but ignores Blight instead. At 0.3 for a resisted hit, a Force-resistant starting foe would be a wall for a fresh player.
- **No marks over what's hidden:** a skink under the sand, an eel under the water, a dropper on the roof or a wraith in its fissure shows none until it comes out.
- **Wick knows it, and it's obvious.** The Charter's survey knows every kind's nature, and it's shown wherever the decision is made: on the world map, a territory's card lists what lives there (its clime's creature first) with what each fears and shrugs off, since the cores are chosen before setting out; out in the land, a row of badges over every foe in sight, each a bold glyph on a dark tile at the view's grain, ▲ in the element's colour for weak, ▼ for resistant, a bar for very resistant, three at most, what it fears first (an elite's affix always among them); and on the two spell buttons, which light green with a ▲ badge when the nearest foe in reach fears that spell's element and go grey with ▼ when it resists it, so the thumb reads it without looking up. (Wick still remarks on the first weak and resisted hit.)
- **The hit carries it too:** a weak hit pops bigger and green with a crisp ring of its element's colour thrown out and a crack of a sound; a resisted one small and grey, a dull grey ring closing on the foe like a shell turning the blow, and a muffled thud; WEAK or RESIST under the number at most once every 0.8 s over a foe, and not when a reaction's name shows for that hit. A reaction's name stands over the foe above where its numbers rise, never over them. With the wrong element a fight is a slog (×0.3, ×0.15 all but shrugged off) and with the right one a rout (×1.75), so the cores you bring are the decision.

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
| Magma Tubes | Slag Crab | Sidesteps and pinches; its shell turns most of a blow until it's chilled or cracked by a heavy hit (its seams light); lava doesn't burn it | Claws up, a short red line | Frost / Ember | cog |
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

- **Exotic materials** drop from elites and the warden, and now and then from anything else. (Bloodresin is retired: it fed the old reroll, and no longer drops.)

## Facets: the rig is the star

There is no forge, no rig frame, no cores, no stash of gear and no item loot (`js/facets.js`; DECISIONS.md, 2026-10-23). The star is a crystal with facets, each something it has learned from the world, and the Kindler's build is which facets are turned to face them, at TURN. Three kinds:

| Facet | What it is | Where it comes from |
|---|---|---|
| **Shape** | How the light is cast: the Forms (Arc, Bolt, Lance, Orb, Glaive, Nova, Well, Ward) | The Arc and the Bolt from the first day; the next in order at each Deep's end; and an elite's fall teaches the Shape its affix names (Blinker the Bolt, Thorned the Lance, Mortar the Orb, Shifting the Glaive, Volatile the Nova, Hulking the Arc, Warded the Ward) |
| **Band** | What the light does: the Elements, one for each ore tasted (Iron Force, Chord Shock, Glass Frost, Sigil Blight, Star Ember; Lumen is the light itself and casts nothing) | The Spectrum: ore given at GIVE, as strong as the band's depth |
| **Turn** | The Mods (Quicken, Amplify, Chain, Split, Echo, Pierce, Linger) | An elite's fall teaches the Turn its affix names (Fast Quicken, Tough Amplify, Chained Chain, Broodmother and Splitter Split, Bulwark Pierce) |
| **Reading** | What the suit has read of a creature: its pattern as a bonus (Open wound, Drift, Edge, Rime…) | Four kills of the kind read (an elite counts two, a Keeper all; the Capture Lens reads faster) |
| **Old light** | A legendary power (Faultline, Twice-Told, Redwake, Lodeheart, Stormcaller) | A warden's or a Keeper's fall, and now and then an ancient forge; each once |

- **Two casts**, A from the right wrist and B from the left, each a Shape, a Band and up to two more facets (a Turn, a Reading or old light): the extra slots open at magnitude 2 and 4. A facet is one of each: faced in cast B, it leaves cast A. Turning is free, anywhere at home.
- **Everything faced is as strong as the star:** a Shape, a Turn or a Reading at the star's magnitude as a tier (to 6), a Band at its depth. The splinter cuts ore of the magnitude as a tier (Ferrite at 1, Lumenite at 2, Resonite at 3 as ring 2 opens, Sigilite at 5 as ring 3 does, Starmetal at 6).
- **The Splinter: armour is light.** The Kindler wears a shard of the Lodestar at the sternum, and the suit is the hard-light lattice it projects over a dark undersuit: a diamond lattice of the circuits' gold with a brighter node where its lines cross, drawn over him as faint as his light and closing a line each magnitude (`kdLattice`, `T.splinter`). The lattice is the armour (plate at the star's magnitude), and it is only as hard as the light in it: at home, in kindled land and at full light all of it; in the dark it thins with the light meter to 35% with the light gone (`latticeK`). The push-your-luck already in the game gets a second edge without a new number; Wick says so once as it first thins. The splinter is a light at the chest too.
- **What drops.** Creatures leave ore (the dark is of the world, and carries the world's body): an ordinary kill one of its land's, an elite two to four, a warden or a Keeper six of each of its land's two; a Keeper its shard and an echo; elites what they teach; a sealed tear the land's deeper ore. Nothing drops as an item, and nothing needs a bench.
- **Under the hood** the faced facets are built into the gear the combat code reads (`facetsApply`: a rig, the Splinter, with a core for each facet; a cutter; plate), so Forms, Elements, Mods, patterns, resonances and the caps work as they did.
- **An older save** turns its rig, stash and cores into facets: every Form and Mod it held is known, its rig's spells stay faced, each legendary power is kept, its parts and exotics become ore.

## Combat and builds

- **Everything is a spell, cast from the rig.** The rig is the Charter suit's wrist projector: a bracer on each forearm, an amber lens on its back. Its **frame** (forged at FRAMES, its ore setting its tier and power) drives **two spells**: A from the right wrist, B from the left, each its own button, which shows its Form. Nothing is held: the Kindler thrusts a fist at the aim and the light leaves the wrist. Close range is a spell too: the Arc and the Glaive.
- **Slots:** the rig, cutter, armor and charm.
  - **A press casts the spell**, for charge. A press during a cooldown is held over until the cooldown ends, so taps never get lost.
  - **Holding charges it:** 1.8× the damage for 1.5× the charge; charged bolts and lances are bigger and pass through more. A held Arc bursts into a Nova of its element instead.
  - With no rig worn, spell A is a free Arc.
- **A spell is three cores, in no order:** one **Form** (its shape and range), one **Element** (its damage and status; with none, Force) and one **Mod** (what changes it). A frame of Resonite or denser, a masterwork, or one with a Lodestone shard worked in has an **extra part** of the kind its ore chooses (Crafting, The extra slot). No Form: a weak spark.
- **A core's tier** (its ore's) makes its spell hit harder, and does nothing else: 25% a tier past the first for the Form, 5% for each other core. A core's card and its forge recipe say so.
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

- **The extra part.** A second Mod (Ferrite, Lumenite, Resonite): two of a Mod stack, two Splits fire five, two Echoes cast twice more. A second Element (Sigilite, Starmetal): both on one spell, each on half the hit, and they react with each other on the foe. A second Form (Aetherglass): the spell casts both, the second at 70%.
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
- **Ore identity.** A frame's ore (the one it's named for) favours an element: a spell of it is attuned, 25% harder and its status half again as long (Ferrite Force, Lumenite Shock, Aetherglass Frost, Sigilite Ember, Starmetal Blight; Resonite none, but its resonances are 25% stronger). And each ore has a way of its own, said on the card: Ferrite is blunt (heavy hits knock 40% and stagger 35% harder); Lumenite quick (spells wait 18% less, the charge pool a fifth smaller); Aetherglass far (bolts, lances and orbs fly a third further, and the aim reaches a third further); Sigilite heavy (the third Arc and charged casts hit a third harder); Starmetal lasting (every status holds half again as long). So a lower tier in the right ore can be the better frame for a territory, and a second frame is a craft worth making.
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

## Ore in the field

If ore is the world's body, the Kindler can use it before it's home, and the push-your-luck gets a new side: spend the world, or carry it up (`js/field.js`, `T.field`). Three uses, all from the cargo screen's SPEND HERE, all costing the ore of the land you stand in (the star's light here must be of here):
- **Plant light.** Spend 4 of the land's ore and the splinter sets a pocket of the star's light where you stand, four tiles across, for 90 s: the light meter fills in it and the lattice is whole. It fades.
- **Surge a band.** Spend 3 of the ore of the band a cast is in: the next cast of it is cast a depth above its band (35% harder). Ore as ammunition for the big moment, which also teaches what a deeper band will feel like before it's fed.
- **Raise the spire.** A spire is raised from the land's own ore: 6 of its first ore carried to the heart, taken as it's planted. Kindling needs the player to have mined this land, not just crossed it; the button says what's short.

## The seventh band

Elites now and then, and the Hollow always, leave **night-glass**: the dark's residue, a dull violet crystal the Charter's spec doesn't list and the star has no band for. It can be given at GIVE like any ore, and nothing says what it is. Given, it opens a seventh band, **Umbra**, drawn beside the six once any has been carried, with no mark across it: nobody drew one. Its facets are of the dark's own kind, opened by its depth and faced as Readings are: Draw (depth 1: the hits you land heal you), Snare (2: your hits chill), Veil (3: the lattice holds in the dark instead of thinning). Each depth also dims the day at home a shade. The player can ignore it for the whole game and lose nothing on the Charter's spec; the star is whole on the six. At the Edge the two endings stand: leave the night with the seventh band fed, and the ending says the star shines in all seven, the night held in its light. Neither line says the dark is alive. The seventh bar says it. Wick, the first time it's carried: "That's not on the Charter's list. You don't have to give the star anything. Just so you know."

## Wick's facets

Wick is the one thing at home that isn't the star, and stays a drone, dry and kind. His upgrades are facets the star lends him, each from a magnitude, on unless turned off at TURN:

| Facet | From magnitude | What it does |
|---|---|---|
| Scanner | 2 | Every 7 s out in the land, a ping: veins within 8 tiles glint, marks point to your pack |
| Lamp | 3 | A second, dimmer beam behind you, 62% of the lamp's reach |
| Hex Shield | 3 | Once a fight, a hit that would leave you under 35% is stopped; ready again after 20 s unhurt |
| Spark | 4 | Every 2.6 s, the nearest awake foe within 4 tiles takes 7% of its health (a boss 1.2%) |

## Supplies

Ore makes supplies, carried on the belt (4 of each, safe whatever happens, spent when used). Two kinds, no grades, stronger as the star grows (level 1 to magnitude 3, 2 to 6, 3 after):

| Supply | What it does (levels 1, 2, 3) |
|---|---|
| Mending Injector | heals 35 / 50 / 65% of your health at once |
| Lightcell | gives back 30 / 40 / 50% of your light, in dark land or a Deep |

- **Cost:** one is paid in the plainest ore there's enough of, the higher tiers costing fewer: 6 Ferrite, 4 Lumenite, 3 Resonite, 2 Aetherglass, 2 Sigilite or 1 Starmetal. The button's cost names the ore it will take.
- **Made at home** at the star's GIVE face: MAKE, the two kinds, how many carried, with its cost.
- **Made in the field:** MAKE in the cargo screen, from the ore carried (only what can be made is listed).
- **Used from the deck:** each has its own small round button at the top of the right deck, MEND (green) and LIGHT (gold), with its icon and how many on a badge; dim at none. Q and R on a keyboard.
- An older save's graded supplies merge into the two kinds; its Flares, Ward Cells and Blast Charges (cut) come back as 5 of their grade's plainer ore each.

## Onboarding: a little at a time

A new Kindler is walked through the first landing, then left to the star (`js/onboard.js`, `js/tutor.js`).
- **The first landing.** After the opening, Wick offers to walk you through it: WALK ME THROUGH IT or I KNOW THE DRILL. Walked through, one line of Wick's sits at the top of the view, the button that matters pulses, and a marker stands on the world: out of the lit opening into the gentle land, a vein mined, ARC, BOLT, DASH, the foe finished, eight Ferrite, home, the Ferrite given to the star (its first band deepens), and NEXT.
- **Tutorials: Wick points, you do.** The star's screen and the map each run a tutorial of three to five steps the first time they open (the dim, Wick's line, the target lit; SKIP); the star's turns to the face each step is on. Each screen's ? replays it, then a short reference; the top bar's ? pauses and walks the HUD.
- **Plain screens.** Labels of a word or two, numbers with icons, at most one short line on a card; no notes paragraphs. Costs always name their resource; a screen's way out is always in sight.
- **Why ore, said in play:** the first time ore comes home, Wick says what it's for; NEXT says to give it and what it opens; the star speaks on the first taste of each kind.

## Controls

- **Upright:** a floating joystick under the left thumb (a quick flick dashes). Under the right thumb, a cluster:
  - spell A, big, in the corner;
  - spell B;
  - DASH;
  - MINE, held to cut: the Kindler holds the cutter out at the rock, a blue-white beam bites it and throws molten sparks;
  - the contextual SET OUT, CLIMB DOWN or EXTRACT above them;
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
  - Light comes in fine bands (16 to daylight's), so it reads as a soft glow, not rings, and glowing things bloom.
  - The plan: these rules on the 16 px art (done), then 24 px tiles by enlarging the letter grids 1.5× before shading (done), then a hand redraw where the enlargement falls short.
- **Readability rule.** Rock tops are always darker than the floor, with lit rims and front faces where they meet it.
- **Shadows from the lamp** (shadow.js, the numbers in `T.light.shadow`). The diver carries the light, so the rock stops it: the floor behind a pillar or round a corner falls to the place's ambient light (never to black) until you step round it, and walking past a pillar sweeps its shadow across the floor. The shadow's edge follows the smooth wall line, not the tiles, cut on the light's own grid and in its bands. The rock the lamp strikes keeps a lit skin, and a wall's front face stays lit wherever the ground under it is lit and the lamp is south of it, so the readability rule holds; tops it can't reach fall to ambient. The floor's fixed lights (lava, vents, glowing plants, a temple's shaft) are stopped by the rock too; ore, which glows from inside it, and daylight, which is ambient, aren't. Big things (big plants, columns, enemies, the warden, portals) cast a short shadow on the ground straight away from the lamp, from the foot, a little longer the further they stand: two hard steps with a ragged edge in clusters, under the lit pass, a step dropping as the lamp's share of the light there falls. Small plants, critters and loot cast none. What glows (eyes, cores, ore, loot, telegraphs) shows through any shadow.
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
