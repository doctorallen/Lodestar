# Lodestar: design

Lodestar is a top-down pixel-art mining and looting game for the phone browser. You play a circuit diver, an explorer in an alien-tech suit with a glass dome and a little drone, on a world where technology runs on arcane ore. From a fallen star hanging over a vast sinkhole, you dive into the depths, mine ore, fight, and decide when to push deeper and when to get out before you lose the haul.

It mixes Terraria and Starbound (always another ore to find, and the gear it makes) with Diablo (every drop is a roll of the dice, so you never keep the same gear for long).

Items marked **(proposed)** aren't settled or aren't built yet. Everything else was decided by the designer and is in the game. `DECISIONS.md` logs each decision and why it was made, and `js/tuning.js` holds every number.

## Pillars

1. **Always another upgrade.** A new ore leads to a new pick, which opens new depths, which leads to new gear.
2. **Every item is a roll.** Crafted and found gear both have random affixes. Materials let you steer the rolls, but never fix them completely.
3. **Push your luck.** The deeper you go, the better the loot and the higher the risk of losing it.
4. **Built for a thumb.** It plays well upright with one or two thumbs, in short or long sessions.

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
2. **Descend:** pick one of the biomes the star reaches.
3. **Dive:** explore floors, mine ore veins, fight, and pick up loot. Your cargo is limited.
4. **Push or leave:** each floor has a shaft down, and most have a lodeline out.
5. **Extract or fall:** if you extract, everything in your cargo is banked. If you fall, what you wear is safe, but everything in the cargo is lost (ore, exotics, gear and relics).

## Expeditions

- **Floors** are seeded caverns, so a floor can be rebuilt from its seed:
  - lumpy caverns with ragged, rounded walls, joined by tunnels that wander like rivers;
  - some caverns keep a pillar of rock;
  - ore veins run into the walls;
  - most rock can't be mined, so the layout stays readable.
- **Walls follow a smooth line**, not the tile grid. Corners round off and edges wander by a few pixels, and bodies collide with that same line.
- **(proposed) Breakable walls** that open shortcuts.
- **No fixed length.** The player decides how deep to go.
- **Danger rises with depth.** A floor's enemy level is 4 × the biome's index plus the depth. Each level raises enemy health by 16% and damage by 8%. Deeper floors also have more enemies, more elites, and more of the biome's better ore and loot.
- **Cargo is limited** (30 units, more from attunements and affixes). Ore and exotics weigh 1, gear and relics 3. You can drop gear mid-dive to make room.
- **The pocket.** A few cargo slots whose contents survive a fall: 1 slot at first, 2 from magnitude 3, 3 from magnitude 5. A slot holds one piece of gear or up to 10 of an ore.
- **The star's pull on each floor.** A gold meter under the health bar, full on arrival, fades over about two minutes (less deeper down).
  - **Half gone:** your lamp dims, and more enemies stir in the dark every so often.
  - **Gone:** the floor's lodeline goes dark and the Hollow comes, a shadow that hunts you and can't be staggered. The way out is down the shaft.
- **Leaving takes a moment.** EXTRACT in a lodeline is 1.5 s of standing still. Moving or being hit breaks it, and its light wakes anything nearby.
- **Emergency recall** (pause or cargo screen) works anywhere: 4 s standing still. The dark keeps a share of the cargo, 15% plus 6% a floor down to 70% at most, but the pocket is safe.
- **Health** comes back slowly once nothing has hurt you for 4 seconds. Healing motes drop from kills, and some affixes leech or regenerate.
- **The warden** is an optional loot piñata that can turn up in a side room from depth 4. It charges and fires rings of orbs. It's never needed for progression, and it drops three rare-or-better pieces and often a relic.

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

Home is a place you walk, not a menu. It's a plateau on the sinkhole's rim:
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

- **The anvil.** Each forge is three hammer strikes: a marker sweeps a bar, faster each time, and you tap as it crosses the glowing zone.
  - A strike in the zone is good, and one dead in its middle is perfect.
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
