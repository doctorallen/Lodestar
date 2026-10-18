# Lodestar: design

Lodestar is a top-down pixel-art mining and looting game for the phone browser. You play a prospector on an alien world where technology runs on arcane ore. From a fallen star hanging over a vast sinkhole, you dive into the depths, mine ore, fight, and decide when to push deeper and when to get out before you lose the haul.

It mixes Terraria and Starbound (always another ore to find, and the gear it makes) with Diablo (every drop is a roll of the dice, so you never keep the same gear for long).

Sections marked **(proposed)** are first drafts filled in after the interview and are open to change. Everything else was decided by the designer. `DECISIONS.md` logs each decision and why it was made.

## Pillars

1. **Always another upgrade.** A new ore leads to a new pick, which opens new depths, which leads to new gear.
2. **Every item is a roll.** Crafted and found gear both have random affixes. Materials let you steer the rolls, but never fix them completely.
3. **Push your luck.** The deeper you go, the better the loot and the higher the risk of losing it.
4. **Built for a thumb.** It plays well upright with one or two thumbs, in short or long sessions.

## The Lodestar (the base)

The Lodestar is a huge magnetic crystal that fell from the sky and now hangs over a sinkhole, held up by its own magnetic field. Your outpost is built on and around it.

- **Lodelines.** The star's magnetic lines reach down into the depths. Where a line reaches a floor, there's an extraction point: stand in it and you're pulled home along the line.
- **Its pull weakens with depth.** Lodelines become rarer the deeper you go, and the depths grow more hostile. This explains why there are extraction points at all, and why going deeper is more dangerous.
- **Feeding the star.** Ore fed to the star raises its **Magnitude**. Each new level reaches its lines deeper, which opens new biomes and stations, and gives an **attunement** point (see Character upgrades).
- **(proposed) Lore hook.** The deepest ore, Starmetal, is pieces of the Lodestar that broke off when it fell. Something down there has been collecting them.

## The loop

1. **At the Lodestar:** craft, modify and salvage gear, socket spell cores, feed the star, spend attunement points and manage the stash.
2. **Choose a lodeline:** pick one of the biomes the star currently reaches.
3. **Dive:** explore floors, mine ore veins, fight, and pick up loot. Your cargo is limited.
4. **Push or leave:** each floor has a shaft down. Some floors also have a lodeline out.
5. **Extract or die:** if you extract, everything you carried is banked. If you die, the gear you were wearing is safe, but everything picked up on this dive is lost.

## Expeditions

- **Floors** are procedural rooms and corridors, seeded so a floor can be rebuilt from its seed. Ore veins run into the walls, and some walls can be broken through to make shortcuts. Most rock can't be mined, so the layout stays readable.
- **No fixed length.** The player decides how deep to go.
- **Danger rises with depth.** Each floor down makes enemies stronger and loot better. Elite enemies with Diablo-style affixes (Fast, Shielded, Volatile…) become more common.
- **(proposed) Lodeline frequency.** Every floor has one down to depth 3. After that, each floor is a little less likely to have one, down to a minimum chance, so sometimes you have to go deeper to find a way out.
- **Cargo is limited** (upgradeable). When it fills up, you either extract, drop something, or salvage on the spot.
- **Optional bosses.** These loot piñatas turn up at depth. They're never needed for progression.

## Mining and ore

- **The pick's tier sets which ore it can mine.** Seeing an ore you can't mine yet is the hook for the next craft.
- **(proposed) Biomes and ore.** There are three biomes with two ores each. The higher-tier ore in each biome is more common deeper down.

| Biome | Feel | Ore (tier) |
|---|---|---|
| The Rim | Glowing fungal caverns just under the sinkhole's edge | Ferrite (1), Lumenite (2) |
| The Choir | Crystal caverns that sing when struck | Resonite (3), Aetherglass (4) |
| The Underforge | Ancient machine ruins near magma | Sigilite (5), Starmetal (6) |

- **(proposed) Exotic materials** come from gem nodes, elites and bosses. They shape crafting (see Loot).

## Loot

- **Crafted items roll affixes.** The ore sets the tier and base stats, and each craft rolls random affixes.
- **Materials shape the rolls.** Adding an exotic material to a craft guarantees one affix from its family. **(proposed)** Some examples:
  - Voltaic crystal gives shock.
  - Bloodresin gives life steal.
  - Frostglass gives chill.
  - Lodestone shard gives magnetism, such as pulling in loot or stunning with a pulse.
- **Modifying found loot.** Spend materials to reroll one affix, add one (if there's room), or upgrade one's value.
- **Salvage.** Break unwanted gear down into materials.
- **Rarities.** Common, Magic, Rare and Legendary. **(proposed)** These have 1, 2 and 3 affixes, and Legendary has 3 affixes plus a legendary power. An item never shows more than four lines, to keep it simple but interesting on a phone.
- **Legendary powers** change how you play rather than adding stats. For example, "mining a vein releases a shockwave", or "spells cast from a blade socket fire twice".
- **Sets.** Matched pieces give bonuses at 2 and 3 pieces worn.
- **Sealed relics.** These are unidentified items that only drop at Rare quality or above, so each one is strong and worth taking home. You don't know what one is until the Lodestar's light unseals it at base. Each takes a cargo slot, so it competes with ore.
- **Picks are loot too.** A pick's tier sets its mining power. Its affixes can include mining speed, ore luck, gem chance, vein sense (seeing veins through walls) and extra cargo.

## Combat and builds

- **Melee and magic.** A character can be melee only, magic only, or a balanced hybrid. Gear and attunements support all three.
- **Spell cores** are socketed into gear, like Path of Exile gems, and are a second layer of loot to find and craft.
- **(proposed) Slots.** Main hand and off hand (each takes a blade, a focus or a ward), plus pick, armor and charm.
  - Melee: blade + blade, or blade + ward.
  - Magic: focus + focus, or focus + ward.
  - Hybrid: blade + focus.
- **(proposed) Cores work for melee too.**
  - In a focus, a core is a spell you cast.
  - In a blade, the same core fires on hit. For example, Arc Bolt in a blade makes every third hit chain lightning.
  - Pure melee builds still use cores.
- **(proposed) Charge** is the mana. It regenerates on its own, and melee hits refill extra, which is what rewards hybrid play.
- **(proposed) First spell cores:**
  - Arc Bolt, a fast projectile.
  - Nova, a burst around you.
  - Lodestone Pull, which drags enemies in.
  - Ward Pulse, a short shield.

## The base: stations and upgrades

- **Stash** for gear and materials.
- **(proposed) Stations**, upgraded with materials:
  - **Forge:** crafts gear and picks.
  - **Coreworks:** crafts and modifies spell cores.
  - **Rune bench:** rerolls, adds and upgrades affixes.
  - **Salvager:** breaks gear down into materials.
- **Character upgrades** are **attunements**, bought with the points earned by feeding the star. They add things like health, charge, cargo size, extraction speed, and melee or spell power.

## Controls

- **Upright:** a floating joystick under the left thumb and action buttons under the right.
- **Sideways:** the view stands in the middle with the controls either side, as in NEO.
- Attacks aim at the nearest enemy, and mining targets the ore you're facing.
- **(proposed) Buttons:** ATTACK, CAST (one per socketed spell, at most two), DASH, and a contextual action (MINE, DESCEND, EXTRACT).
- Keyboard: WASD or the arrows to move, Space or J to mine, E to act, Esc to pause.

## Presentation

- Top-down pixel art with 16 px tiles. The view always shows at least 176 game pixels on its shorter side (about 11–12 tiles), scaled up by whole device pixels.
- **Art style: "Glow + Detail".** It takes a grim, desaturated palette with four-step ramps and ordered dithering, and sets it in darkness where only magitech gives off light: the helmet lamp, ore glints, runes, glowing fungus, singing crystals, magma, the lodelines and the Lodestar. Light comes in a few dithered bands, and glowing things bloom.
- **Readability rule.** Rock tops are always darker than the floor, with lit rims and front faces where they meet it.
- **Biome looks.** Each biome changes only its floor, rock and light colours, and what glows on its floor (fungus on the Rim, crystals in the Choir, magma in the Underforge).
- **(proposed) Lamp radius as a dial.** The lamp's radius could shrink as danger rises with depth.
- **Brightness setting.** Dark scenes lose contrast in bright sunlight, so the game will need one.

## First version: broad prototype

Broad and rough rather than narrow and polished:

- The base with every station working, even if the UI is rough.
- **3 biomes** with 2 ores each, giving 6 pick tiers.
- A handful of enemies per biome and one optional boss.
- The whole loot pipeline: crafting, affixes, material bias, modifying, salvage, every rarity, at least 2 legendaries, 1 set, sealed relics, and sockets with about 4 spell cores.
- Lodelines, cargo, death, and saving in localStorage.

### Built so far

- Seeded floors of rooms and corridors with ore veins, a shaft down, and a lodeline on most floors.
- Walking with the joystick or keys, mining ore up to your pick's tier, and limited cargo.
- Descending, extracting into the stash, and abandoning a dive (which loses the haul).
- The upright and sideways layouts, the headless tests, and the GitHub Pages workflow.

## Open questions

- The art style.
- Elites: their affixes and how often they appear by depth.
- Exact affix lists and number ranges.
- How cargo works: slots or weight, and whether ore stacks.
- What a dive gives back when you die, if anything. For now it gives nothing.
