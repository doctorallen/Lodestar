# Lodestar: design

Lodestar is a top-down pixel-art mining and looting game for the phone browser. You play a circuit diver, an explorer in an alien-tech suit with a glass dome and a little drone, on a world where technology runs on arcane ore. From a fallen star hanging over a vast sinkhole, you dive into the depths, mine ore, fight, and decide when to push deeper and when to get out before you lose the haul.

It mixes Terraria and Starbound (always another ore to find, and the gear it makes) with Diablo (every drop is a roll of the dice, so you never keep the same gear for long).

Items marked **(proposed)** aren't settled or aren't built yet. Everything else was decided by the designer and is in the game. `DECISIONS.md` logs each decision and why it was made, and `js/tuning.js` holds every number.

## Pillars

1. **Always another upgrade.** A new ore leads to a new pick, which opens new depths, which leads to new gear.
2. **Every item is a roll.** Crafted and found gear both have random affixes. Materials let you steer the rolls, but never fix them completely.
3. **Push your luck.** The deeper you go, the better the loot and the higher the risk of losing it.
4. **Built for a thumb.** It plays well upright with one or two thumbs, in short or long sessions.

## The story

**Stranded.** The *Meridian* was dragged out of the sky by the pull of a fallen star and broke on the rim of the sinkhole beneath it.
- **The way home:** the ship's beacon still works, but it needs power, and the only power here is the Lodestar.
- **The problem:** the star is dying. Its heart was shattered, and the Hollow carried the shards into the dark.
- **The goal:** a **Shard Keeper** guards one shard at the bottom of each biome:
  - the Rim's at depth 5, a fungal crawler-queen that calls its brood;
  - the Choir's at depth 6, a towering tube-worm;
  - the Underforge's at depth 7, a slag colossus that leaves magma where it charges.
- **Bringing them back:** a taken shard is bound to you and safe from any fall. Set it in the star at the altar, which feeds the star 400.
- **The end:** with all three set, the beacon can be lit at the wreck. The ending plays, and the game goes on after.

How it's told:
- **An opening** of five panels on a new game.
- **Wick**, your drone, says a line or two the first time things happen: the first dive, parts, a blueprint, the anvil, the pull fading, a new biome, a Keeper, a shard.
- **The star speaks** as it grows, and as its heart comes back.
- **Eight echoes:** logs of the crews it pulled down before. They're found by ancient forges, from elites now and then, and from every Keeper, and read at the wreck.

## The Lodestar (the base)

The Lodestar is a huge magnetic crystal that fell from the sky and now hangs over a sinkhole, held up by its own magnetic field. Your outpost is built on and around it.

- **Lodelines.** The star's magnetic lines reach down into the depths. Where a line reaches a floor, there's a gold beam: stand in it and tap EXTRACT to be pulled home with everything you carry.
- **Its pull weakens with depth.** Every floor has a lodeline down to a reach depth, which is 3 at first and one floor deeper per magnitude. Below that, each floor is less likely to have one (down to 35%), so sometimes you have to go deeper to find a way out.
- **Feeding the star.** Each ore fed is worth its tier² in points, and the points raise the star's **magnitude**. Each magnitude:
  - reaches the lodelines a floor deeper,
  - gives an attunement point.
- **Biomes open with magnitude.** The Choir opens at magnitude 3 and the Underforge at 5.
- **(proposed) Lore hook.** The deepest ore, Starmetal, is pieces of the Lodestar that broke off when it fell. Something down there has been collecting them.

## The loop

1. **At the Lodestar:**
   - forge casters, gear, picks and the stones circuits are built from;
   - rework affixes and salvage what you don't need;
   - build circuits at the locker, unseal relics, feed the star and spend attunements.
2. **Set out:** pick one of the biomes the star reaches. An expedition is a chain of up to 4 sites, starting on the sunlit surface.
3. **Explore each site:** mine ore veins, fight, and pick up loot. Your cargo is limited.
4. **Push or leave:** each site has two portals on, each in the colour of the zone it leads to, and some have a lodeline home.
5. **Extract or fall:** if you extract, everything in your cargo is banked. If you fall, what you wear is safe, but everything in the cargo is lost (ore, exotics, gear and relics).

## Expeditions

- **Floors** are seeded caverns, so a floor can be rebuilt from its seed:
  - lumpy caverns with ragged, rounded walls, joined by tunnels that wander like rivers;
  - some caverns keep a pillar of rock;
  - ore veins run into the walls;
  - most rock can't be mined, so the layout stays readable.
- **Walls follow a smooth line**, not the tile grid. Corners round off and edges wander by a few pixels, and bodies collide with that same line.
- **(proposed) Breakable walls** that open shortcuts.
- **Zones.** Every step along the chain changes zone, so no two sites in a row feel the same:
  - **Surface:** open, sunlit badlands under the sky. Its daylight is the star's pull: the sun sets as the pull fades, and night brings the Hollow. Wisps and constructs.
  - **Cave:** the meandering caverns, the biome's own creatures and flora.
  - **Ruin:** rectangular halls and pillars left by someone before, paved floors, more ancient forges, constructs.
  - **Deep Vein:** at the last site, rich in ore, likelier to hold the warden.
  - **Keeper's Lair:** at the last site, while the biome's heart-shard is still missing. An arena; the Keeper holds the shard, and the lodeline only lights when it falls. While the Keeper lives the star's pull doesn't fade (the Keeper holds the dark off), but after 90 s it rages: faster, with twice the ring of orbs. When it falls, its lodeline lights and a short 30 s pull begins: take the shard and go.
- **Portals.** The ways on are standing rings of lodestone, not holes, since the next site may be up on the surface as easily as further down. Each portal's face swirls in the colour of where it leads (warm daylight for the surface, cool blue for a cave, amber for a ruin, red for a Keeper's Lair, green for a Deep Vein), its runes glow in it, and its keystone carries that zone's glyph. They're dark stone, and their colours are never a rift's violet, magenta or cyan. STEP THROUGH: the world holds still while the view closes on the portal's face in its colour, then opens round the diver at the next site. No shake. The outpost has one too, its face the surface's daylight, and every expedition sets out through it.
- **The chain has 4 sites.** The player decides how far to go along it, not how deep. A site's lodeline is certain at the first, then 80%, 60% and 40% (5% more for each magnitude past the first, to at most 90%, 75% and 55%), so pushing on stays a gamble. The star's growth also softens the emergency recall (2% less lost for each magnitude).
- **Danger rises with each site.** A site's enemy level is 4 × the biome's index plus the site (one more in a lair). Each level raises enemy health by 16% and damage by 8%. Deeper floors also have more enemies, more elites, and more of the biome's better ore and loot.
- **Cargo is limited** (40 units, more from attunements and affixes). Ore and exotics weigh 1, gear and relics 3. You can drop gear mid-dive to make room.
- **The pocket.** A few cargo slots whose contents survive a fall: 1 slot at first, 2 from magnitude 3, 3 from magnitude 5. A slot holds one piece of gear or up to 10 of an ore.
- **The star's pull on each floor.** A gold meter under the health bar, full on arrival, fades over about 75 seconds (a little less at each site).
  - **Half gone:** your lamp dims, and more enemies stir in the dark every so often.
  - **Gone:** the floor's lodeline goes dark and the Hollow comes, a shadow that hunts you and can't be staggered. The way out is a portal on, or the recall.
- **Leaving takes a moment.** EXTRACT in a lodeline is 1.5 s of standing still. Moving or being hit breaks it, and its light wakes anything nearby.
- **Emergency recall** (pause or cargo screen) works anywhere: 4 s standing still. The dark keeps a share of the cargo, 15% plus 6% a site, to 70% at most, but the pocket is safe.
- **Saved as you go.** The expedition is saved at every site and whenever the page is hidden; reopening the game offers to carry on from that site's start.
- **Health** comes back slowly once nothing has hurt you for 4 seconds. Healing motes drop from kills, and some affixes leech or regenerate.
- **The warden** is an optional loot piñata that can turn up in a side room from depth 4. It charges and fires rings of orbs. It's never needed for progression, and it drops three rare-or-better pieces and often a relic.

## Climes

Every site is also a **clime**: the kind of country it is. The region still sets the ore and how strong the enemies are; the clime sets how the place looks and feels. It's rolled when the way to a site is made, so a portal's button already names it (STEP THROUGH: FROST STEPPE), the arrival toast names it, and the route becomes a choice of country as well as zone. Each zone's first clime is the look it always had, without a hazard.

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

## The weather

About a third of expeditions set out under a **Lodestorm**. On the surface, every 20 s a strike falls within 6 tiles of the diver, marked by a tightening, flickering ring a second before. It hurts whatever stands in it (diver and enemies alike, the enemies with shock), and when it finds an ore vein it charges it into the biome's better ore. A storm is a hazard to dodge and a reason to stand near a vein when the ring appears.

## Contracts

Three small goals are always posted at the portal, so every expedition, even a short one, works towards something. Each is settled when you come home by a lodeline or a recall, never after a fall:
- bring home some ore (a common amount of the lower ore, a few of the better);
- bring down some creatures of a kind;
- reach a site in a biome;
- seal a rift;
- ride a lodeline home from a given zone.

Each pays the star (25 × magnitude) and leaves an exotic, three parts, a riftglass or a resonance stone (while the Codex has pages to fill), and a new one takes its place. Progress shows in the cargo screen mid-dive.

The board keeps moving: never two of a kind; 70% of hauls and reaches are set in the newest biome open; one that has stood for 3 expeditions is replaced; one may be swapped for free each time home; and meeting all three in one expedition pays the star twice.

## Tools

The diver carries one tool, chosen at the portal before setting out. Each changes what you can see or do down there, so the choice shapes the expedition. The Compass is carried from the start; the rest are made once, from the stash, as the star grows.

| Tool | From magnitude | What it does |
|---|---|---|
| Lodeline Compass | 1 | An arrow round the diver to the nearest lit lodeline, or where none reaches, to the nearest portal on (in its zone's colour). |
| Ore Sense | 2 | Veins within 9 tiles glint through the dark, and an arrow at the view's edge points to the nearest vein the pick can break. |
| Threat Radar | 2 | Marks at the view's edge for what's out there within 18 tiles: dim for the unaware, red for the hunting, elite colours, violet for the Hollow. |
| Surveyor's Map | 3 | A map of each site, drawn as you walk it, in the view's corner, with portals, lodeline and ancient forge once seen. |
| Deep Satchel | 3 | One more pocket slot. |
| Lode Beacon | 2 | Once an expedition, from the pause menu: call a lodeline down where you stand, where no lit one reaches. It lands after 6 s, and its light wakes everything near. Not while a Keeper lives. |

## Rifts

Tears in the world, where the star's fall cracked more than the ground. A site may hold one (a quarter of first sites, rising to over half of last ones), above ground or below. Each changes the site around it:
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
- **The construct** (from depth 2) shows the line it will charge along, then charges. If it hits a wall, it's dazed, and it takes extra damage while dazed.

**Flora that fights**, rooted and hidden among the harmless kind. It wears a harmless piece's shape with its glow gone red, so you can learn to read it:
- **The snapjaw** waits for you to come close. It shows its reach in a red ring, then snaps.
- **The spitter** (from depth 2) lobs a glob at where you stand, marking the spot first. The glob leaves a patch of spores that eats at you while you stand in it. A dash crosses it unharmed.

All of them glow brighter while winding up, so you can see the attack coming. Enemies wake when they see you or when one near them is hit, then find their way to you through the tunnels.

Only two enemies can wind up at once, plus one more every three floors down. The rest circle and wait their turn. Your hits knock enemies back, and heavy hits stagger anything but the warden out of an attack.

**Elites** have more health, hit harder and always drop magic-or-better gear. They wear a coloured pip for their affix:
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
| Crawler | R | | | W | | a chitin shell, dry inside |
| Wisp | R | R | | | I | no body, all ether |
| Construct | R | W | | | I | an armoured machine |
| Snapjaw, spitter | | | R | W | R | living plants |
| The Hollow | R | R | R | R | R | the living dark; in a lit lodeline's light it loses them all |
| The warden, the Keepers | one W and one R by region: the Rim Ember W, Blight R; the Choir Force W, Frost R; the Underforge Frost W, Ember R | | | | | |

- **Climes shift it a step** (W to neither, neither to R, R to I, or back): the Frost Steppe more resistant to Frost and weaker to Ember; the Cinder Waste and the Magma Tubes to Ember and Frost; the Flooded Grotto to Ember and Shock; the Bloomfen and the Rootdeep to Blight and Ember; the Clockwork Vault to Force and Shock.
- **Wick learns it.** The first hit of an element on a kind tells Wick its verdict, kept in the save. Over each awake foe, a mark for each verdict Wick knows: ▲ in the element's colour for weak, ▼ for resistant, a bar for very resistant, and "?" while some are still unknown. An elite's affix always shows.
- **The numbers carry it:** a weak hit pops bigger and green with WEAK under it, a resisted one small and grey with RESIST. Wick says so the first time each happens.

## Mining and ore

- **The pick gates ore.** A pick made from an ore breaks the next one up: a Ferrite pick breaks Lumenite. The Rusty Pick you start with breaks only Ferrite. Seeing ore you can't break is the hook for the next craft.
- **Biomes and ore.** Three biomes with two ores each. The better ore is more common deeper down.

| Biome | Feel | Ore (tier) |
|---|---|---|
| The Rim | Glowing fungal caverns just under the sinkhole's edge | Ferrite (1), Lumenite (2) |
| The Choir | Crystal caverns that sing when struck | Resonite (3), Aetherglass (4) |
| The Underforge | Ancient machine ruins near magma | Sigilite (5), Starmetal (6) |

- **Exotic materials** drop from elites and the warden, and now and then from anything else.

## Crafting (the heart of the game)

Finished gear comes from the forge. Enemies leave the materials to make it, not gear.

- **Blueprints are item types**, each with its own feel. Known from the start: wand, gauntlet, plate, charm, pick, the Arc and Bolt Forms, and every Element and Glyph stone. The rest are found in the depths:

  | Blueprint | Slot | What it does |
  |---|---|---|
  | Staff | hand (caster) | 4–6 slots; slower to cast, every reach 30% wider |
  | Weave | armour | Light: dash 30% more often, move faster |
  | Shell | armour | Heavy: much more armour, a little slower |
  | Lantern | charm | A brighter lamp; the star's pull fades 20% slower |
  | Drill | pick | Mines 60% faster, but the noise wakes what's near |
  | Glaive, Lance, Orb, Nova, Well, Ward | Form stone | The other Forms (Combat and builds) |

- **Where blueprints come from.** Elites sometimes drop one, the warden always does, and ancient forges often have one lying by them. Each biome favours its own. A blueprint rides home in the cargo (weight 1) and is learned when it gets there, so a fall loses it unless it's pocketed. A sealed relic can open into a piece of a blueprint not yet known.
- **A forging takes three things:**
  - **an ore head:** the blueprint's amount of one ore, which sets the tier;
  - **a binding:** creature parts, which guarantee affixes from their family, as many as the part's grade, each stronger the higher the grade;
  - **an exotic, optionally:** an elemental one brings its Element stone out with a caster; the others guarantee an affix family, raise the rarity, or (riftglass) forge it a tier higher.
- **The anvil decides the rest:** three timed strikes set the temper (rough, fair, fine, masterwork), which sets the rarity odds and a caster's slots (a wand or gauntlet 3, 4 from a fine forge; a staff 4, 5 from fair or fine, 6 from a masterwork).
- **Stones** are forged too, for circuits (Combat and builds). A stone's tier is its ore's, one higher from a fine forge.
  - **Form stones:** 6 ore and 2 ether (or a heart), once the Form's blueprint is known.
  - **Element stones:** 4 ore and the element's exotic. Force needs no exotic.
  - **Glyph stones:** 5 ore and 3 creature parts: chitin makes Pierce and Split, ether Echo, cogs Quicken, fibre Linger and Trigger, spores Chain; any part makes Amplify.
- **The forge previews** what the chosen parts guarantee before you commit.

| Part | From | Binds |
|---|---|---|
| Chitin | crawlers | defense |
| Ether | wisps | spell (and binds Form stones) |
| Cog | constructs | close (close spell damage, cast speed, crits) |
| Fibre | snapjaws | utility |
| Spore | spitters | mining |
| Heart | the warden | anything; a fine forge or better is legendary |

Parts come in three grades, Rim, Choir and Forge, one per biome. Deeper biomes give stronger bindings.

| Element | Exotic | On hit | Stacked on itself |
|---|---|---|---|
| Force | none | Knocks back harder; heavy hits stagger | a second heavy hit stuns |
| Shock | Voltaic crystal | Arcs to the next enemy | five overload it, stunning |
| Frost | Frostglass | Chills (slows) | three freeze it solid |
| Ember | Emberglass | Burns | burns stack, and spread |
| Blight | Blightcap | Poisons, spreading when its host falls | poison spreads on a hit |

Shock is drawn in its stone's yellow everywhere in play (bolts, arcs, bursts, numbers), never cyan, which is the Glyphs' teal and the diver's circuits; the Voltaic crystal is yellow to match.

Bloodresin guarantees a leech affix, and a Lodestone shard raises the rarity.

### Imprinting

Salvaging a legendary at home writes its power into the forge's **Codex**. Any later forging of a piece that power suits can imprint it (step 5 at the forge), paid with a heart of any grade or 2 riftglass: a fine forge or better always sets it, a rougher one half the time. Found legendaries become recipes, and hearts and riftglass have a use. Elites drop sealed relics half as often (5%) to leave room for it.

## Loot

- **Drops are materials:** each creature's own part, graded by the biome. Elites drop more, sometimes an exotic, a blueprint or a sealed relic. The warden drops a heart, parts, a blueprint and often a relic.
- **The rune bench**, on any item card at home, costs ore of the item's tier:
  - reroll an affix,
  - upgrade one by 20% (twice at most),
  - add one, which also raises a common or magic item a rarity.
- **Salvage** gives back some ore, the part that bound the piece, and sometimes an exotic.
- **Rarities:** Common has 1 affix, Magic 2, Rare 3, Legendary 3 plus a legendary power, Set 2 plus a set bonus.
- **Legendary powers** change how you play:

| Name | Kind | Power |
|---|---|---|
| Faultline | pick | Breaking a vein sends out a shockwave |
| Twice-Told | caster | Every Form in its circuit fires twice |
| Redwake | caster | Critical hits heal |
| Lodeheart | armour or charm | Kills heal and pull in nearby loot |
| Stormcaller | caster | Bolts chain to two more enemies |

- **Sets.** Prospector's Regalia (pick, plate and charm): 2 pieces give +20% mining speed and +6 cargo; 3 pieces heal you when you break a vein and give +20% chance of double ore.
- **Sealed relics** only drop at rare or better and are unsealed at home.

## Combat and builds

- **Everything is a spell.** Each hand holds a caster, and each caster holds a short **circuit** of stones. Close range is a spell too: the Arc and the Glaive replaced the blade, the spear, the hammer, the whip and the spin.
- **Slots:** main hand, off hand, pick, armor and charm. Each hand has its own button, which shows its circuit's first Form.
  - **A press casts the whole circuit**, for charge. A press during a cooldown is held over until the cooldown ends, so taps never get lost.
  - **Holding charges it:** 1.8× the damage for 1.5× the charge; charged bolts and lances are bigger and pass through more. A held Arc bursts into a Nova of its element instead.
  - An empty main hand casts a free Arc with the fist.
- **Casters:**

  | Caster | Slots | Its way |
  |---|---|---|
  | Wand | 3–4 | Quick: the hand waits 15% less |
  | Gauntlet | 3–4 | Close Forms cost 1 charge less |
  | Staff | 4–6 | Slower (30% more wait), every reach 30% wider |

- **The circuit**, read left to right:
  - a **Form** starts a spell: its shape and range;
  - **Elements** after it set its damage type, two at most (the damage split between them, both statuses applied); with none, it's Force;
  - **Glyphs** change the Form to their left;
  - two Forms in a row fire together, and both are paid for;
  - **Trigger** makes the next Form fire from where this one hits or ends;
  - stones before the first Form do nothing; a circuit with no Form casts a weak spark.
- **Charge** is the mana. It refills on its own. A cast costs the sum of its Forms' costs, each times its glyphs'. **Close Forms give charge back** for each foe they hit (2 a foe, 3 foes at most), so fighting close keeps the casting going.
- **Socketing is free** at the locker: tap a caster, tap a slot, tap a stone from the drawer. The card says in words what the circuit does and what it costs.
- **You start with a Scrap Gauntlet `ARC · – · –` and a Cracked Wand `BOLT · – · –`**, so the first fight has close and far, and both have room to grow.

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

| Glyph | Charge × | What it does to the Form to its left |
|---|---|---|
| Split | 1.3 | Three at once, each at 60% (a Glaive's blades tripled, a Ward's soak) |
| Amplify | 1.2 | 50% wider and 20% harder |
| Quicken | 0.67 | A third cheaper, and the hand waits less |
| Chain | 1.2 | Each hit leaps to 2 more foes |
| Echo | 1.25 | Casts again 0.4 s later at 60% |
| Pierce | 1.1 | Passes through 3 more (bolts and lances) |
| Linger | 1.2 | Leaves a field of its element where it ends, for 3 s |
| Trigger | 1 | The next Form fires from where this one hits or ends |

- Two of a glyph stack: two Splits fire five, two Echoes cast twice more, and so on.
- **Reactions** (reactions.js). Every element leaves its status on a foe for 3 s. A second element hitting a foe that still carries another's reacts, in either order, and two elements on one Form react on their own. Each reaction's name flashes over its target in the pixel hand, and Wick explains it the first time.

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
- **Ore affinity.** A caster's ore (the one it's named for) favours an element. A spell of it is attuned: 25% harder (by its share of the spell's elements) and its status lasts half again as long. Each ore has a way of its own, shown on the caster's card and its readout:

  | Ore | Attuned to | And |
  |---|---|---|
  | Ferrite | Force | Glaives cost 1 less |
  | Lumenite | Shock | casts 10% faster |
  | Resonite | nothing | resonances 25% stronger |
  | Aetherglass | Frost | Lances reach 35% further |
  | Sigilite | Ember | Glyphs 10% stronger |
  | Starmetal | nothing | one slot more than its base |

- **Linked slots.** A masterwork caster has an even chance of a linked pair of slots, a gold chain between them. A Glyph in either counts twice, in what it does and what it costs.
- **Resonances** (resonance.js): exact circuits that wake into named spells. One must fill its caster exactly, so a 3-slot wand is worth keeping and a 5-slot staff is a find. A resonant circuit hits 50% harder (Resonite more), and does something its parts alone don't:

  | Resonance | Circuit | What it does |
  |---|---|---|
  | Thunderhead | ORB SHOCK LINGER | the orb stops overhead and becomes a stormcloud, drifting over the nearest foe and striking it every 0.4 s for 4 s |
  | Shatterglass | LANCE FROST ECHO | the echo lance shatters the chilled along its line for double, flinging shards to either side |
  | Kindling Arc | ARC EMBER QUICKEN | every third arc sets the ground in front alight in a crescent |
  | Wildfire | ORB EMBER SPLIT LINGER | three orbs leave burning trails; plants catch, and the fire runs through them (for show) |
  | Stormglaive | GLAIVE SHOCK CHAIN AMPLIFY | the blades arc lightning to every foe within reach |
  | Starfall | BOLT FORCE SPLIT TRIGGER NOVA | three bolts rise and meet as a falling star: a crater, a stun, a ring of light |

  The forge's **Codex** shows each as a silhouette with its slot count (`ORB · ? · LINGER`); **resonance stones** show its parts one at a time: elites drop them now and then, they lie by ancient forges, and contracts pay them. Kindling Arc is known from the start, and building or casting one fills in its page. At the locker, a circuit a stone away from one on a caster of the right size says *resonance stirs…*, and a live one wears a gold banner with its name.
- **(proposed)** The Lode and Rift elements, with more Forms, Glyphs and resonances.
- **The dash** is a quick burst that nothing can touch, from DASH or a flick of the move thumb. It's how you get out of a lunge or a charge.
- **Impact:**
  - a hit stops the world for an instant (the view doesn't shake: the designer found it unpleasant);
  - damage numbers pop off;
  - the caster is drawn in hand and the diver casts with it (castfx.js); an Arc is a crescent of light swept across in front, the heavy third thicker and wider, throwing sparks.
- **The player is the circuit diver.**
  - A sleek suit with glowing teal circuits, under a glass dome with a violet light inside. The dome is the lamp you see by.
  - Drawn in 8 facings, with a 4-frame walk.
  - A small drone follows over its shoulder, bobbing, its eye turned the way the diver looks.

## The base: the outpost

Home is a place you walk, not a menu. It's a compact plateau on the sinkhole's rim, every station a few steps apart:
- **The Lodestar** hangs over the pit, bobbing. Its lodelines run down into the dark, one more for every magnitude, and it grows bigger as it grows stronger.
- **Lanterns** round the plaza light up, one for every magnitude.
- **The stations:** walk up to one and the contextual button names it.

| Station | What it does |
|---|---|
| The portal (SET OUT) | Pick a biome, a tool, and step through onto its surface |
| The forge (FORGE) | Make casters, plate, charms, picks, and Form, Element and Glyph stones from banked ore, parts and exotics. Every forge is played on the anvil |
| The rune bench (RUNES) | Rework affixes on any piece: reroll, raise, add |
| The locker (GEAR) | What's worn, the stash and its stones, stats; equip, build circuits (free), salvage, unseal relics |
| The star's altar (THE STAR) | Feed it ore, and spend attunements. Feeding sends you back out to watch the ore stream up into the star as it pulses and grows |
| The practice target | A construct that takes every hit and never falls, for trying combos |
| The *Meridian* (wreck) | The star's heart (shards found and set), the echoes, and lighting the beacon |

- **The anvil.** Each forge is three hammer strikes: a marker sweeps a bar, faster each time and dragging as it crosses the glowing zone, and you tap while it's in the zone.
  - A strike in the zone is good, and one in its marked middle is perfect.
  - The strikes add up to a quality from rough to masterwork, which shifts the rarity odds. A masterwork can even come out legendary.
  - It sets a caster's slots, and a fine forge raises a stone's tier.
- **The reveal.** A forged piece or an unsealed relic rises in a beam of its rarity's colour, then its card opens.
- **After a dive,** a report says what came home or what was lost, then you're back on the plaza.

| Attunement | Each rank (up to 5) |
|---|---|
| Vitality | +15 max health |
| Capacity | +6 cargo |
| Proximity | +8% close spell damage |
| Clarity | +8% spell damage |
| Stride | +5% move speed |

### Fewer trips home
- **Salvage in the field:** break found gear down into ore in the cargo, so it isn't all weight. Ore that doesn't fit is left on the floor.
- **Ancient forges:** from depth 3, a floor sometimes has one in a side cavern. It forges from what you carry, on the same anvil, and the piece goes in your cargo.
- **The ride home feeds the star:** every extraction feeds it 3 × depth² points, so pushing deep grows the star directly.

## Controls

- **Upright:** a floating joystick under the left thumb (a quick flick dashes). Under the right thumb, a cluster:
  - the main hand, big, in the corner;
  - the off hand;
  - DASH;
  - MINE, held to dig;
  - the contextual SET OUT, STEP THROUGH or EXTRACT above them.
- **Sideways:** the view stands in the middle with the controls either side, as in NEO.
- Close Forms aim at the nearest enemy in reach, and the rest at the nearest in sight. Mining targets the ore you're facing.
- CARGO in the top bar shows what you carry, ore and exotics included. Tap anything to equip it or drop it mid-dive. Dropped ore lies on the floor as a glowing heap you can pick back up.
- **Keyboard:**
  - WASD or the arrows to move,
  - J for the main hand and K for the off hand,
  - Shift or U to dash,
  - Space or L to mine,
  - E or Enter to act, I for cargo, Esc to pause.

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

## The prototype

The aim is broad and rough rather than narrow and polished. Everything below is built:
- the base with every station;
- 3 biomes with 2 ores each and 6 pick tiers;
- 3 enemies per biome, elites, and the optional warden;
- the whole loot pipeline;
- lodelines, cargo, death, and saving in localStorage.

The autopilot (`test/bot.js`) plays whole careers from a fresh save. With its simple play it reaches the Choir after about 8 dives and magnitude 4–5 after about 25, and it rarely dies. A bot that never turns back dies 2–4 floors down in any biome with gear made for it.

## Open questions

- Pacing: how long a dive and a career should take for a person rather than the bot.
- What a dive gives back when you fall, if anything. For now it gives nothing.
- Sound.
- Saving a dive in progress, so closing the page doesn't lose it.
