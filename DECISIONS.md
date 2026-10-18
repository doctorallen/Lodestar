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

## 2026-10-17: what the first phone sessions showed

- **Only ore may look like ore.** Glowing flora in ore colours was mistaken for ore. Now flora is dim and coloured unlike any ore, ground specks are gone, rock veins are faint, and ore twinkles.
- **No screen shake.** The designer disliked it. Hit-stop, knockback and numbers carry the impact.

## 2026-10-17: home is a place

- **A walkable outpost instead of a menu.** The designer found forging through menus uninteresting. The base is now the sinkhole's rim, with the star over the pit and stations to walk up to, and it visibly grows with the star.
- **Forging is played.** Three timed strikes on an anvil set the quality, which shifts the rarity odds, so skill nudges the dice without replacing them.
- **Arrivals are shown.** Forged pieces and opened relics rise in their rarity's light, and fed ore streams into the star.
- **Fewer trips home:** salvage in the field, ancient forges deep down, and every ride home feeds the star.
- **Real flora.** The lumps are replaced by designed sprites (mushrooms, stalactites, tube worms, roots…) that sway, sort in depth with the actors, and never look like ore.
- **Some flora fights back.** Snapjaws and spitters hide in the undergrowth, rooted, red where the harmless kind is green, pink or ember.

## 2026-10-17: from the research into similar games

The designer asked to build the top recommendations from a survey of about 35 comparable games:
- **The star's pull, per floor** (Spelunky's ghost, Dredge's panic). Visible pressure to keep moving, felt rather than read: the lamp dims, the dark stirs, and when the pull's gone the Hollow hunts and the lodeline goes dark.
- **A pocket** (Tarkov's secure container, Moonlighter). A fall loses the cargo but never everything. It grows with the star and is never sold.
- **Leaving takes a moment** (Dark and Darker). Extracting is a short channel that a hit or a step breaks, so you have to clear the way first. An emergency recall from anywhere costs more the deeper you are, so there's always a way home, at a price.
- **A phone-sized item card** (Diablo Immortal, Death Must Die): per-stat comparison, roll bars, a keep star, and salvage-all for downgrades.

## 2026-10-18: crafting is the heart of the game

The designer found that so much loot made forging pointless, and that forged items lacked variety. They asked to lean into crafting, and chose:
- **Blueprints plus parts.** Blueprints are item types with their own feel (spear, hammer, chain-whip, staff, gauntlet, weave, shell, lantern, drill). Each is made from an ore head, a creature-part binding and an optional exotic, so the choice of parts steers the result, and the anvil gives the temper.
- **Materials, not gear.** Enemies drop their own parts, graded by biome, so the forge is where gear comes from and different recipes send you hunting different creatures.
- **Elements from exotics:** shock, frost (which shatters), ember (which burns) and blight (which spreads).
- **Blueprints must be carried home** to be learned. Finding one is a push-your-luck moment.
- **More spells, and modifiers to combine them**: elemental (Frost Lance, Ember Burst, Chain Lightning, Thorn Ring), movement (Blink, Gravity Well, Phase Step), and modifier cores (Split, Amplify, Quicken, Chain, Echo) that share sockets with the spells, so a piece's sockets are a choice between more spells and better ones.

## 2026-10-18: a story, and a tighter outpost

- **Stranded.** The designer chose this story: the *Meridian* wrecked on the rim, a dying star whose shattered heart powers the way home, and three Shard Keepers at fixed depths. It gives the dives a purpose and an end.
- **Told lightly.** A five-panel opening, one-off lines from Wick, the star speaking as it grows, and eight echoes. Phone sessions are short, so there are no long cutscenes.
- **Shards are safe once taken.** Losing a story piece to a fall would be more frustrating than tense.
- **The outpost is compact,** with every station a few steps apart and the wreck at the south edge. The designer found things too far apart.
- **Enemies a little tougher:** more health and damage, more per room, more elites.

## 2026-10-18: expeditions, not depth (overnight team, round 1)

The designer said they weren't a fan of delving ever deeper in the same zone, and wanted meaningful progress in a 5-minute session. The balance run showed the bot ending 46 of 48 dives on depth 1, and the Keepers at depths 5–7 put the story 8+ minutes away.
- **An expedition is a chain of 4 sites.** Each site is a different zone (surface, cave, ruin; the last a Deep Vein or a Keeper's Lair). This replaces "the player decides how deep to go" and "danger rises with depth".
- **Two Ways On at each exit,** signposted with their zones, so the route is a choice.
- **The Keepers live in lairs at the 4th site,** offered as one of the ways while that biome's shard is missing. A shard is now one full expedition away.
- **The sunlit surface** is where every expedition starts. Its daylight is the star's pull: dusk as it fades, night and the Hollow when it's gone.
- **Shorter, richer sites:** about 75 s of pull each, and the ride home feeds the star 8 × site², so going one site further is worth a lot.

## 2026-10-18: a Tool slot (overnight team, round 1)

The designer asked for utility items that change the interface and play, such as showing the way to the nearest extraction.
- **One tool carried, chosen at the ledge.** A single slot makes it a choice per expedition (find the way home, find ore, see danger, map the site, carry more safely, or make an exit) rather than a pile of upgrades.
- **Tools are made once, from the stash,** gated by the star's magnitude. They're a materials sink for the parts that pile up, and another reason to feed the star.
- **The Lode Beacon** answers a site with no lodeline: an exit you build, at the cost of 6 noisy seconds. It can't bypass a Keeper.

## 2026-10-18: rifts (overnight team, round 1)

The designer asked for dimensional shifts and rifts that cause strange changes and variation to the map, above and below ground.
- **Four kinds to start:** graft (another biome's ground and ore bleeding through), ore wake, gate (paired tears), and inversion (daylight underground). They change the map, the loot or the route, not just the look.
- **Sealing is the push-your-luck moment,** for riftglass, which forges a piece a tier above its ore. That's a reason to engage with a rift rather than walk past.
- **Placed from the dive's seed after generation,** so floors still rebuild exactly and the golden hashes are untouched.
- **Not adopted yet** from the designer's longer list: phase seams (walls that flicker), negative space, gravity wells, time slips. They're harder to read on a phone screen; worth a second round.

## 2026-10-18: an expedition survives the tab closing (overnight team, round 1)

Phones drop background tabs often. The run is now saved on arriving at each site and whenever the page is hidden, and offered back at the outpost on the next load: CARRY ON (from that site's entry, with the cargo, health and pull it had, and mined veins still gone) or GIVE IT UP (the cargo is lost, the pocket comes home). Enemies and drops on the site come back fresh. Since health and pull are saved too, closing the tab mid-fight doesn't buy much.

## 2026-10-18: contracts (overnight team, round 1)

To make a 5-minute session feel like progress beyond the haul, three contracts are always posted at the ledge and settled on coming home. They pay the star and a useful material, and steer expeditions (a biome, a zone, a creature, a rift) without forcing them. Falling settles nothing, so they add to the push-your-luck. No timers and no daily resets, so a short session never wastes one.
