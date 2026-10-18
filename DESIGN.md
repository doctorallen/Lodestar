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
   - forge gear, picks and spell cores;
   - rework affixes and salvage what you don't need;
   - socket cores, unseal relics, feed the star and spend attunements.
2. **Set out:** pick one of the biomes the star reaches. An expedition is a chain of up to 4 sites, starting on the sunlit surface.
3. **Explore each site:** mine ore veins, fight, and pick up loot. Your cargo is limited.
4. **Push or leave:** each site has two Ways On, each signposted with the zone it leads to, and some have a lodeline home.
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
- **The chain has 4 sites.** The player decides how far to go along it, not how deep. A site's lodeline is certain at the first, then 80%, 60% and 40% (5% more for each magnitude past the first, to at most 90%, 75% and 55%), so pushing on stays a gamble. The star's growth also softens the emergency recall (2% less lost for each magnitude).
- **Danger rises with each site.** A site's enemy level is 4 × the biome's index plus the site (one more in a lair). Each level raises enemy health by 16% and damage by 8%. Deeper floors also have more enemies, more elites, and more of the biome's better ore and loot.
- **Cargo is limited** (40 units, more from attunements and affixes). Ore and exotics weigh 1, gear and relics 3. You can drop gear mid-dive to make room.
- **The pocket.** A few cargo slots whose contents survive a fall: 1 slot at first, 2 from magnitude 3, 3 from magnitude 5. A slot holds one piece of gear or up to 10 of an ore.
- **The star's pull on each floor.** A gold meter under the health bar, full on arrival, fades over about 75 seconds (a little less at each site).
  - **Half gone:** your lamp dims, and more enemies stir in the dark every so often.
  - **Gone:** the floor's lodeline goes dark and the Hollow comes, a shadow that hunts you and can't be staggered. The way out is a Way On, or the recall.
- **Leaving takes a moment.** EXTRACT in a lodeline is 1.5 s of standing still. Moving or being hit breaks it, and its light wakes anything nearby.
- **Emergency recall** (pause or cargo screen) works anywhere: 4 s standing still. The dark keeps a share of the cargo, 15% plus 6% a site, to 70% at most, but the pocket is safe.
- **Saved as you go.** The expedition is saved at every site and whenever the page is hidden; reopening the game offers to carry on from that site's start.
- **Health** comes back slowly once nothing has hurt you for 4 seconds. Healing motes drop from kills, and some affixes leech or regenerate.
- **The warden** is an optional loot piñata that can turn up in a side room from depth 4. It charges and fires rings of orbs. It's never needed for progression, and it drops three rare-or-better pieces and often a relic.

## The weather

About a third of expeditions set out under a **Lodestorm**. On the surface, every 20 s a strike falls within 6 tiles of the diver, marked by a tightening, flickering ring a second before. It hurts whatever stands in it (diver and enemies alike, the enemies with shock), and when it finds an ore vein it charges it into the biome's better ore. A storm is a hazard to dodge and a reason to stand near a vein when the ring appears.

## Contracts

Three small goals are always posted at the ledge, so every expedition, even a short one, works towards something. Each is settled when you come home by a lodeline or a recall, never after a fall:
- bring home some ore (a common amount of the lower ore, a few of the better);
- bring down some creatures of a kind;
- reach a site in a biome;
- seal a rift;
- ride a lodeline home from a given zone.

Each pays the star (25 × magnitude) and leaves an exotic, three parts or a riftglass, and a new one takes its place. Progress shows in the cargo screen mid-dive.

The board keeps moving: never two of a kind; 70% of hauls and reaches are set in the newest biome open; one that has stood for 3 expeditions is replaced; one may be swapped for free each time home; and meeting all three in one expedition pays the star twice.

## Tools

The diver carries one tool, chosen at the ledge before setting out. Each changes what you can see or do down there, so the choice shapes the expedition. The Compass is carried from the start; the rest are made once, from the stash, as the star grows.

| Tool | From magnitude | What it does |
|---|---|---|
| Lodeline Compass | 1 | An arrow round the diver to the nearest lit lodeline, or where none reaches, to the nearest way on (in its zone's colour). |
| Ore Sense | 2 | Veins within 9 tiles glint through the dark, and an arrow at the view's edge points to the nearest vein the pick can break. |
| Threat Radar | 2 | Marks at the view's edge for what's out there within 18 tiles: dim for the unaware, red for the hunting, elite colours, violet for the Hollow. |
| Surveyor's Map | 3 | A map of each site, drawn as you walk it, in the view's corner, with ways, lodeline and ancient forge once seen. |
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

- **Blueprints are item types**, each with its own feel. Six are known from the start: blade, focus, plate, charm, pick and the Arc Bolt core. The rest are found in the depths:

  | Blueprint | Slot | What it does |
  |---|---|---|
  | Spear | hand | Long, narrow thrusts; charged, a lunge through everything ahead |
  | Hammer | hand | Slow, wide blows that always stagger; charged, a ground slam |
  | Chain-whip | hand | Quick, wide sweeps at reach; charged, drags enemies in |
  | Staff | hand (casting) | More sockets; a charged cast fires everything three times |
  | Gauntlet | hand (casting) | One socket, cast hard and cheap, close range only |
  | Weave | armour | Light: dash 30% more often, move faster |
  | Shell | armour | Heavy: much more armour, a little slower |
  | Lantern | charm | A brighter lamp; the star's pull fades 20% slower |
  | Drill | pick | Mines 60% faster, but the noise wakes what's near |
  | Nova, Lodestone Pull, Ward Pulse | core | The other spell cores |

- **Where blueprints come from.** Elites sometimes drop one, the warden always does, and ancient forges often have one lying by them. Each biome favours its own. A blueprint rides home in the cargo (weight 1) and is learned when it gets there, so a fall loses it unless it's pocketed. A sealed relic can open into a piece of a blueprint not yet known.
- **A forging takes three things:**
  - **an ore head:** the blueprint's amount of one ore, which sets the tier;
  - **a binding:** creature parts, which guarantee affixes from their family, as many as the part's grade, each stronger the higher the grade;
  - **an exotic, optionally:** it gives a weapon or focus an element, guarantees an affix family, or raises the rarity.
- **The anvil decides the rest:** three timed strikes set the temper (rough, fair, fine, masterwork), which sets the rarity odds.
- **The forge previews** what the chosen parts guarantee before you commit.

| Part | From | Binds |
|---|---|---|
| Chitin | crawlers | defense |
| Ether | wisps | spell (and binds spell cores) |
| Cog | constructs | melee |
| Fibre | snapjaws | utility |
| Spore | spitters | mining |
| Heart | the warden | anything; a fine forge or better is legendary |

Parts come in three grades, Rim, Choir and Forge, one per biome. Deeper biomes give stronger bindings.

| Element | Exotic | On hit |
|---|---|---|
| Shock | Voltaic crystal | Arcs to the next enemy |
| Frost | Frostglass | Chills; a heavy hit on the chilled shatters for more |
| Ember | Emberglass | Burns |
| Blight | Blightcap | Poisons, spreading when its host falls |

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
| Twice-Told | blade or focus | Its socketed cores fire twice |
| Redwake | blade | Critical hits heal |
| Lodeheart | armour or charm | Kills heal and pull in nearby loot |
| Stormcaller | focus | Arc Bolts chain to two more enemies |

- **Sets.** Prospector's Regalia (pick, plate and charm): 2 pieces give +20% mining speed and +6 cargo; 3 pieces heal you when you break a vein and give +20% chance of double ore.
- **Sealed relics** only drop at rare or better and are unsealed at home.

## Combat and builds

- **Melee and magic.** A character can be melee only, magic only, or a balanced hybrid. Gear and attunements support all three.
- **Slots:** main hand, off hand, pick, armor and charm. Each hand takes a blade or a focus and has its own button, which shows what's held.
  - **A blade SWINGs**, aimed at the nearest enemy. Taps chain a three-hit combo, and the third hit is heavy: wider, harder, and it staggers. Holding past a swing charges a spin that hits everything round you.
  - **A focus CASTs.** Holding charges a stronger cast. Charged bolts are bigger and pass through enemies.
  - A press during a cooldown is held over until the cooldown ends, so taps never get lost.
  - Builds: blade and blade for melee, focus and focus for magic, blade and focus for a hybrid.
- **You start with a Scrap Blade and a Cracked Focus**, so the first fight has both melee and range.
- **The dash** is a quick burst that nothing can touch, from DASH or a flick of the move thumb. It's how you get out of a lunge or a charge.
- **Impact:**
  - a hit stops the world for an instant (the view doesn't shake: the designer found it unpleasant);
  - damage numbers pop off;
  - the weapon is drawn in hand: the blade sweeps its arc with a slash of light, and the focus floats glowing over the hand.
- **Spell cores** socket into blades and foci. They're a second layer of loot, found or forged.
  - **In a focus,** casting fires every core socketed in it, for charge. An empty focus casts a weak spark.
  - **In a blade,** its cores fire free on every third hit, at reduced power, so pure melee builds use cores too.
- **Charge** is the mana. It refills on its own, and melee hits refill it faster, which rewards hybrid play.
- **The spell cores** (Arc Bolt is known from the start; the rest are blueprints to find):

| Core | What it does |
|---|---|
| Arc Bolt | A fast bolt at the nearest enemy |
| Nova | A burst all around you |
| Lodestone Pull | Drags enemies in and stuns them |
| Ward Pulse | A shield that soaks damage for 5 seconds |
| Frost Lance | A lance of ice through a line of enemies; chills |
| Ember Burst | A lobbed ember that bursts and leaves burning ground |
| Chain Lightning | Leaps from enemy to enemy |
| Thorn Ring | Blighted thorns turning round you, cutting what comes close |
| Blink | Step through space a short way, untouchable as you go |
| Gravity Well | A knot of gravity that drags enemies into it |
| Phase Step | Dash through enemies, cutting each one you pass |

- **Modifiers** take a socket beside the spells and change every spell in the piece. More sockets (a staff) make room for combinations:

| Modifier | Effect |
|---|---|
| Split | Bolts, lances and embers fly three at once, a little weaker |
| Amplify | Wider and 20% harder |
| Quicken | A third less charge, and faster |
| Chain | Bolts and lightning jump to two more enemies |
| Echo | Everything casts again a moment later, weaker |
- **(proposed)** A ward for the off hand, and more cores.
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
| The ledge (DESCEND) | Pick a biome and jump |
| The forge (FORGE) | Make blades, foci, plate, charms, picks and spell cores from banked ore, with one exotic worked in. Every forge is played on the anvil |
| The rune bench (RUNES) | Rework affixes on any piece: reroll, raise, add |
| The locker (GEAR) | What's worn, the stash, stats; equip, socket cores, salvage, unseal relics |
| The star's altar (THE STAR) | Feed it ore, and spend attunements. Feeding sends you back out to watch the ore stream up into the star as it pulses and grows |
| The practice target | A construct that takes every hit and never falls, for trying combos |
| The *Meridian* (wreck) | The star's heart (shards found and set), the echoes, and lighting the beacon |

- **The anvil.** Each forge is three hammer strikes: a marker sweeps a bar, faster each time and dragging as it crosses the glowing zone, and you tap while it's in the zone.
  - A strike in the zone is good, and one in its marked middle is perfect.
  - The strikes add up to a quality from rough to masterwork, which shifts the rarity odds. A masterwork can even come out legendary.
  - For a spell core, a good forge raises its tier.
- **The reveal.** A forged piece or an unsealed relic rises in a beam of its rarity's colour, then its card opens.
- **After a dive,** a report says what came home or what was lost, then you're back on the plaza.

| Attunement | Each rank (up to 5) |
|---|---|
| Vitality | +15 max health |
| Capacity | +6 cargo |
| Might | +8% melee damage |
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
  - the contextual DESCEND or EXTRACT above them.
- **Sideways:** the view stands in the middle with the controls either side, as in NEO.
- Swings aim at the nearest enemy in reach, and spells at the nearest in sight. Mining targets the ore you're facing.
- CARGO in the top bar shows what you carry, ore and exotics included. Tap anything to equip it or drop it mid-dive. Dropped ore lies on the floor as a glowing heap you can pick back up.
- **Keyboard:**
  - WASD or the arrows to move,
  - J for the main hand and K for the off hand,
  - Shift or U to dash,
  - Space or L to mine,
  - E or Enter to act, I for cargo, Esc to pause.

## Presentation

- Top-down pixel art with 16 px tiles. The view always shows at least 176 game pixels on its shorter side (about 11–12 tiles), scaled up by whole device pixels.
- **Art style: "Glow + Detail".**
  - A grim, desaturated palette with four-step ramps and ordered dithering.
  - Darkness, where only magitech gives off light: the helmet lamp, ore glints, runes, glowing fungus, singing crystals, magma, enemies' eyes and cores, the lodelines and the Lodestar.
  - Light comes in a few dithered bands, and glowing things bloom.
- **Readability rule.** Rock tops are always darker than the floor, with lit rims and front faces where they meet it.
- **Biome looks.** Each biome changes its floor, rock and light colours and its enemies' colours. Each also has its own strange flora (flora.js), as sprites that stand on the floor, grow at the foot of walls, or hang from wall faces. Some sway or pulse:
  - **the Rim:** jelly caps trailing beads of light, frilled stalks, shelf fungus, split puffballs, blinking eye stalks, a lit pitcher, hanging roots, dripstone;
  - **the Choir:** bone tube worms, reed pipes, ribbed fans, bell flowers, spore sacs, weeping stone, ribbon fronds, chime cones;
  - **the Underforge:** ash caps, fungus on broken pipes, charred roots, a breathing vent flower, slag drips, a half-buried cog, a rust totem, cinder pods.
- **Alien light.** Faint veins glow in the rock. Flora glows dimly, in colours no ore uses, and never in crystal shapes: chartreuse on the Rim, dusky pink in the Choir, low ember in the Underforge.
- **Ambient life** (life.js), cosmetic only: a few small harmless creatures a site, unoutlined so they read as part of the ground, never as enemies or loot. Lizards and flocks of birds under the sky, glowing moths drawn to the lamp underground, scurriers along the foot of ruin walls. They bolt from the diver and from fights, then settle again. On the surface, cloud shadows drift on the wind and dust gusts by now and then; underground, drips and dust in the lamp.
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
