# Decisions

The major gameplay decisions, newest last, and why each was made. Read this before changing one, and add new ones at the end.

## 2026-10-17: the founding interview

- **Top-down, not side-view.** Jumping and precise aiming are the hardest things to get right on touch controls. Walking in eight directions and mining the wall you face works with one thumb.
- **A persistent base plus roguelite dives.** Progress builds at home, while each dive is a fresh, seeded expedition. You get Terraria's long arc and short sessions to fit a phone.
- **Gear only, no block building.** All the depth goes into loot and crafting. Free building on a touch screen would cost a lot and add little to this game.
- **Crafting and Diablo-style loot together.** Crafted items roll affixes, exotic materials shape the rolls, found loot can be modified, and anything unwanted is salvaged. Crafting is never a fixed recipe and a drop is never wasted.
- **Death loses the haul, never the gear you're wearing.** This creates push-your-luck tension without wiping out hours of progress.
- **The player decides how deep to go, and extraction is at set points.** Leaving is a goal you have to reach, not a menu option.
- **Limited cargo.** It forces choices and gives you a reason to extract that has nothing to do with danger.
- **The pick's tier gates ore.** Seeing an ore you can't mine is the hook for the next craft.
- **Melee and magic, with spells in socketed cores.** Spells are a second layer of loot. A build can be melee only, magic only, or a balanced hybrid.
- **Optional bosses.** Bosses are loot piñatas at depth, never gates. The pick does the gating.
- **Rooms and corridors with ore veins, not fully destructible caves.** These are easier to read, design and balance.
- **Sealed relics are always strong.** Unidentified drops come only at Rare quality or above. The gamble is on which great item you got, never whether it's junk.
- **Rarity tiers, legendary powers and sets, with 2–4 affix lines per item.** Simple but interesting, and readable on a phone.
- **Danger rises with depth.** The further you push, the more the reason to leave builds up.
- **Magitech on an alien world.** A Starbound-style sci-fi world where the technology runs on magic.
- **The base is the Lodestar**, a fallen magnetic star over a sinkhole. Its lines are the extraction points, its pull weakening with depth is why the depths get more dangerous, and feeding it ore makes it grow. One idea explains three systems.
- **Upright first, sideways too.** It's built for one-handed upright play, with NEO's sideways layout as well.
- **A broad prototype first.** Every system in rough form across three biomes, to find what's fun before polishing.
- **NEO's tech approach.** Plain JavaScript, no build step, seeded generation, headless tests, and deploying to GitHub Pages.

## 2026-10-17: the art style

- **"Glow + Detail": D's detail in B's darkness.** Of the five styles compared, this one fits the setting and the push-your-luck feel best. Light shows you where to look, because ore, runes and lodelines glow in the dark. The 16px tiles keep 11–12 tiles across a phone screen. Dark rock tops with lit rims keep walls readable even where the light is low.

## 2026-10-17: the first playable loop

- **One button per hand.** A blade swings and a focus casts, each on its own held button. This keeps every build to the same few buttons, and makes melee, magic and hybrid builds simply a matter of what's held.
- **Cores fire from blades too.** In a focus, a core is a spell you cast for charge. In a blade, it fires free every third hit at reduced power. Cores stay worth finding for melee-only builds.
- **No off-hand ward yet.** Plate covers defense, and Ward Pulse is a core.
- **A pick breaks the ore above its own.** A Ferrite pick breaks Lumenite, and so on. The ore you can already mine always makes the key to the next.
- **The forge also makes cores, and the rune bench lives on the item card.** That means fewer screens to learn on a phone, and no separate Coreworks.
- **A Lodestone shard raises rarity rather than adding magnetism.** It gives one exotic a different and clearly useful job.
- **Cargo by weight:** ore and exotics weigh 1, gear and relics 3. Gear competes with ore without needing a grid inventory.
- **Rest heals.** Health returns slowly after a few seconds without being hurt. Without this, a bot that fought everything died on the first floor. Now danger builds with depth rather than with every fight.
- **The star's reach grows with it.** Each magnitude makes lodelines sure a floor deeper. Feeding the star makes deeper dives safer to try, as well as opening biomes.
- **Balance is checked by a bot.** The autopilot plays careers on every test run. It fails if a career can't bring a haul home early, improve its pick, or grow the star.

## 2026-10-17: feel, from the first time on a phone

- **Organic caves.** The designer found the room-and-corridor floors too blocky. Now there are lumpy caverns and tunnels that wander like rivers. Walls follow a smooth line through the tiles, rather than the tiles' squares, and bodies collide with that line, so what you see is what you bump into.
- **More alien.** Flora that glows, veins of light in the rock, specks in the ground, and less earthly biome colours.
- **Combat with timing.** Early fights were found unengaging, so the designer asked for:
  - combos and charged attacks (tap, tap, heavy; hold for a spin or a charged cast);
  - a dash with a moment of untouchability;
  - impact: hit-stop, shake, knockback, stagger and damage numbers;
  - enemies with readable tells, who take turns: circling crawlers that lunge, strafing wisps, constructs that show their charge line and are dazed by walls.
- **A visible weapon.** The blade is drawn swinging in the hand and the focus glowing over it, and the hand buttons show the held item's icon.
- **Start with a focus too.** Melee and range are both there from the first fight.
- **Hands are tapped, not held.** Holding now charges instead of repeating, which makes room for the charged attack.
- **Ore can be dropped like gear.** In the cargo screen it shows as rows you can drop by 1, 5 or all, and it lies as a heap to pick back up.
- **The character is the circuit diver**, chosen from seven concepts. Its suit's circuits and violet dome give its own light, and its drone is a separate sprite so it can follow.
