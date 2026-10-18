# Lodestar: design

Lodestar is a top-down pixel-art mining and looting game for the phone browser. You play a prospector on an alien world where technology runs on arcane ore. From a fallen star hanging over a vast sinkhole, you dive into the depths, mine ore, fight, and decide when to push deeper and when to get out before you lose the haul.

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

- **Floors** are procedural rooms and corridors, seeded so a floor can be rebuilt from its seed. Ore veins run into the walls. Most rock can't be mined, so the layout stays readable.
- **(proposed) Breakable walls** that open shortcuts.
- **No fixed length.** The player decides how deep to go.
- **Danger rises with depth.** A floor's enemy level is 4 × the biome's index plus the depth. Each level raises enemy health by 16% and damage by 8%. Deeper floors also have more enemies, more elites, and more of the biome's better ore and loot.
- **Cargo is limited** (30 units, more from attunements and affixes). Ore and exotics weigh 1, gear and relics 3. You can drop gear mid-dive to make room.
- **Health** comes back slowly once nothing has hurt you for 4 seconds. Healing motes drop from kills, and some affixes leech or regenerate.
- **The warden** is an optional loot piñata that can turn up in a side room from depth 4. It charges and fires rings of orbs. It's never needed for progression, and it drops three rare-or-better pieces and often a relic.

## Enemies

Every biome has the same three, in its own colours:
- **The crawler** runs in, winds up, bites, then hops back.
- **The wisp** keeps its distance and fires slow orbs.
- **The construct** (from depth 2) winds up, then charges in a straight line.

All of them glow brighter while winding up, so you can see the attack coming. Enemies wake when they see you or when one near them is hit, then find their way to you through the corridors.

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

## Loot

- **Crafted items roll affixes.** The ore sets the tier and base stats. Each craft rolls its rarity (mostly common or magic, sometimes rare) and its affixes.
- **Materials shape the rolls.** Working an exotic into a craft changes what comes out:
  - Voltaic crystal guarantees a shock affix (arcing lightning on hit).
  - Bloodresin guarantees a leech affix.
  - Frostglass guarantees a chill affix (slows on hit).
  - A Lodestone shard raises the rarity a step.
- **The rune bench**, on any item card at home, costs ore of the item's tier:
  - reroll an affix,
  - upgrade an affix by 20% (twice at most),
  - add an affix, which also raises a common or magic item a rarity.
- **Salvage** breaks gear down for some of its ore back, with a chance of an exotic.
- **Rarities:**
  - Common has 1 affix, Magic 2 and Rare 3.
  - Legendary has 3 affixes and a legendary power.
  - Set pieces have 2 affixes and a set bonus.
  - An item never shows more than four lines.
- **Legendary powers** change how you play:

| Name | Kind | Power |
|---|---|---|
| Faultline | pick | Breaking a vein sends out a shockwave |
| Twice-Told | blade or focus | Its socketed cores fire twice |
| Redwake | blade | Critical hits heal |
| Lodeheart | armor or charm | Kills heal and pull in nearby loot |
| Stormcaller | focus | Arc Bolts chain to two more enemies |

- **Sets.** Prospector's Regalia (pick, plate and charm):
  - 2 pieces: +20% mining speed and +6 cargo.
  - 3 pieces: breaking a vein heals, and +20% chance of double ore.
- **Sealed relics** are unidentified items that only drop at rare or better, so each one is worth taking home. One takes up gear weight in the cargo, so it competes with ore. The Lodestar's light unseals it at home.
- **Picks are loot too**, rolling mining affixes (mining speed, double ore) and utility ones.
- **UPGRADE / DOWNGRADE at a glance:** a ▲ or ▼ beside anything found, against what's worn in that slot.
- **(proposed)** Pick affixes for gem chance and vein sense (seeing veins through walls).

## Combat and builds

- **Melee and magic.** A character can be melee only, magic only, or a balanced hybrid. Gear and attunements support all three.
- **Slots:** main hand, off hand, pick, armor and charm. Each hand takes a blade or a focus and has its own button:
  - a blade SWINGs at everything in an arc in front, aimed at the nearest enemy;
  - a focus CASTs.
  - Melee: blade and blade. Magic: focus and focus. Hybrid: blade and focus.
- **Spell cores** socket into blades and foci. They're a second layer of loot, found or forged.
  - **In a focus,** casting fires every core socketed in it, for charge. An empty focus casts a weak spark.
  - **In a blade,** its cores fire free on every third hit, at reduced power, so pure melee builds use cores too.
- **Charge** is the mana. It refills on its own, and melee hits refill it faster, which rewards hybrid play.
- **The spell cores:**
  - **Arc Bolt:** a fast bolt at the nearest enemy.
  - **Nova:** a burst all around you.
  - **Lodestone Pull:** drags enemies in and stuns them.
  - **Ward Pulse:** a shield that soaks damage for 5 seconds.
- **(proposed)** A ward for the off hand, a dash, and more cores.

## The base

- **The forge** makes blades, foci, plate, charms, picks and spell cores from any banked ore. You can work one exotic into each piece.
- **Gear:** what's worn, the stash, stats, and materials. Tap anything for its card, which shows its affixes and has these actions:
  - equip or unequip,
  - the rune bench,
  - socketing cores,
  - salvage,
  - unsealing relics.
- **The star:** feed it ore, and spend attunements:

| Attunement | Each rank (up to 5) |
|---|---|
| Vitality | +15 max health |
| Capacity | +6 cargo |
| Might | +8% melee damage |
| Clarity | +8% spell damage |
| Stride | +5% move speed |

## Controls

- **Upright:** a floating joystick under the left thumb. Under the right thumb:
  - the main hand's button,
  - the off hand's button,
  - MINE, held to dig,
  - the contextual DESCEND or EXTRACT.
- **Sideways:** the view stands in the middle with the controls either side, as in NEO.
- Swings aim at the nearest enemy in reach, and spells at the nearest in sight. Mining targets the ore you're facing.
- CARGO in the top bar shows what you carry, and lets you equip or drop it mid-dive.
- **Keyboard:**
  - WASD or the arrows to move,
  - J for the main hand and K for the off hand,
  - Space or L to mine,
  - E or Enter to act, I for cargo, Esc to pause.

## Presentation

- Top-down pixel art with 16 px tiles. The view always shows at least 176 game pixels on its shorter side (about 11–12 tiles), scaled up by whole device pixels.
- **Art style: "Glow + Detail".**
  - A grim, desaturated palette with four-step ramps and ordered dithering.
  - Darkness, where only magitech gives off light: the helmet lamp, ore glints, runes, glowing fungus, singing crystals, magma, enemies' eyes and cores, the lodelines and the Lodestar.
  - Light comes in a few dithered bands, and glowing things bloom.
- **Readability rule.** Rock tops are always darker than the floor, with lit rims and front faces where they meet it.
- **Biome looks.** Each biome changes only its floor, rock and light colours, its enemies' colours, and what glows on its floor (fungus on the Rim, crystals in the Choir, magma in the Underforge).
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
