# Team log

An overnight run of a small development team of agents. Each round, reviewers in different roles (QA, game design, engineering, balance, mobile UX) look at the game and report. The producer (the main Claude session) decides what to change, builds it, tests it, and commits. This log records what each round found, what was decided and why, and what shipped, so the designer can review it all in the morning. Major gameplay decisions also go in `DECISIONS.md`.

## The brief (from the designer, 2026-10-18)

- Polished and balanced.
- Real depth, but meaningful progress in a 5-minute session.
- A world that feels more alive and more varied.
- Not a fan of delving ever deeper within the same zone.
- Utility items that change the interface and gameplay, such as showing the way to the nearest lodeline.
- Consider the features suggested by the research into similar games.
- Make recommendations and track decisions. Commit often, and push when done.

- Overworld areas in sunlight, as well as the caves.
- Dimensional shifts and rifts that cause strange changes and variation to the map, both above and below ground.

## Round 1

### Design (lead designer)

**The finding.** In the latest balance run the bot ended 46 of 48 dives on depth 1, after about 74 s. With 130 s of pull per floor and the Keepers at depths 5–7, the story needed 8 minutes or more, which is too long for a 5-minute session. Depth was barely used.

**The proposal:**
- expeditions of 4 sites, each changing zone (surface, cave, ruin), with two "Ways On" to choose from at each exit;
- a sunlit surface whose daylight is the star's pull (sunset, then night and the Hollow);
- eight rift types, with Riftglass as their reward;
- a Tool slot (compass, ore sense, map, radar, beacon, rift lens, spyglass, sling);
- a contract board, wagers, a Daily Trace, save on suspend;
- critters, weather, survivors, Lodestorms;
- either-or attunement pairs with free respec, and a new mechanic at each magnitude.

**The producer's decisions:**
- **Adopted: the expedition chain** (4 sites, zone changes every step, two Ways On, the Keeper's Lair as a choice at site 4, about 75 s of pull per site, the ride home feeding 8 × site²). This directly answers "not a fan of delving deeper in the same zone" and "progress in 5 minutes".
- **Adopted: sunlit surface zones,** with the pull as the sun setting. One meter, now with a story.
- **Adopted: ruin zones** (rectangular halls, more forges and caches).
- **Adopted: the Tool slot,** the Compass known from the start, Ore Sense and Threat Radar first.
- **Adopted: rifts.** They come after the chain lands, starting with Graft, Negative, Ore wakes and Phase seams.
- **Adopted, later in the night if there's time:** attunement pairs, save between sites, contracts, the Daily Trace, survivors, weather.
- **Overturned decisions:** "the player decides how deep to go" becomes "the player decides how far to go along a 4-site chain". "Danger rises with depth" becomes "danger rises with each site". Both are logged in DECISIONS.md.


### The reviews (QA, engineer, balance, mobile UX)

Four reviewers looked at the game at the start of the night (before the expedition chain landed). Their reports are summarised here with what the producer did about each.

**QA** found no script errors, and these bugs, all fixed:
- DROP did nothing: what you dropped was picked straight back up. Now it stays down until you walk away.
- Swings missed an enemy standing on top of the diver (so the Hollow could never be meleed). The arc is now measured from where the swing began, and point-blank always hits.
- Esc or P during the anvil lost the materials and the piece. Esc now leaves the anvil, the reveal and the story alone, and closes a report properly.
- The warden dropped 5 hearts (its "parts" were hearts). Bosses now leave one heart and ordinary parts. Keepers now leave parts too.
- A shard taken mid-dive wasn't saved until the dive ended. Shards and echoes are now written to the save the moment they're taken.
- The Rim Keeper's brood had no cap (16 crawlers after a minute). Capped at 4.
- The wreck mislabelled shards taken out of order; jumps of two magnitudes skipped the star's lines and announced nothing. Every magnitude passed now gets its line, what opened, and the attunement to spend.
- The extract report left out the pocket; recall rounding made a single exotic always lost or always kept (now a fair coin); salvaging a modifier core gave 1 ore; the Hollow could be stunned by Pull and the whip's drag.

**Engineer** confirmed several of those, and also:
- A save that failed to load was silently replaced by a fresh game. Now it's kept aside under its own key, unknown ids are cleaned out on load, and the game says when it can't save.
- Bodies wedged in rock could walk through walls. A wedged body may now only work its way out, and enemies spawn on clear ground.
- Hitstop froze 17–23% of fight time. Bolts only freeze on big hits, and only a heavy hit can freeze again within 0.15 s.
- The star's pulse and the drone ran per drawn frame (twice as fast on 120 Hz screens). Moved to real time.
- **Deferred:** the performance work (bloom on the GPU, lighting in one pass, fewer dot calls, a faster floor paint). A busy fight costs about 23 ms a frame on a 4× slowed CPU, over budget for 60 fps on a mid-range phone. This is the biggest remaining technical item.

**Mobile UX**, fixed:
- Wick's lines and toasts sat over every screen. Lines now wait until screens close; toasts move to the foot of the screen, and hide during the anvil, a reveal and the story.
- Sideways, Wick's box sat over the diver; the anvil was clipped. Both fixed.
- On a 320 px phone the controls overlapped. The action button now floats above the right thumb, over the view's corner, and the cluster tightens on small screens.
- Touch targets raised to 44 px; the pull meter doubled in height.
- **Deferred:** the forge's layout (blueprints first, numbered steps), station labels in the outpost, the item card's button grid and confirmations, pickup toasts as floating numbers, and report layout. Logged for the next round.

**Balance** (measured on the old one-zone dives) found that 99% of dives ended on floor 1, because a floor held more ore than the cargo; that pure casters starved for charge; and that the Choir and Underforge Keepers were near-unwinnable because diver health didn't keep up with enemy damage. **Adopted, nearly as proposed:**

| Key | Before → after |
|---|---|
| ore per vein tile | 1–2 → 1 |
| cargo | 30 → 40 |
| charge / regen | 50 / 5 → 60 / 9 |
| gauntlet cost, Ember Burst | 0.75 → 0.9, 1.2 → 1.0 |
| staff, hammer slam, whip drag | 0.9 → 1.0, 2.6 → 2.2, 1.6 → 2.2 |
| armor health, its growth | 10 → 16, 1.35 → 1.5 |
| enemy damage growth | 1.08 → 1.07 |
| Keeper health, magma | 760 → 650, 0.6 → 0.35 of its damage |
| crawlers | damage 11 → 14, faster tell and lunge |
| constructs and spitters | from site 1 (so melee and mining bindings drop early) |
| parts | 0.6 / 0.25 → 0.45 / 0.15 |
| part grade bonus | 0.12 → 0.2 |
| shell and drill ore | 14 → 12 |
| pull per site | 80 s (−4) → 100 s (−5), at least 80 |

The analyst warned that an 80 s pull is about the bot's own rush time, so humans would meet the Hollow on almost every site; hence 100 s. After the change, bot dives reach sites 2–3 in 100–160 bot-seconds (about 3–5 minutes for a person), with 1 death in 6.

### What shipped after round 1

All of this is on `main`, pushed and deployed, with the full test suite passing at each commit.

- **Expeditions** (`f12ae85`): a chain of 4 sites (surface → two Ways On → … → a Keeper's Lair or a Deep Vein), each a different zone. The Keepers live in lairs whose lodeline only lights when they fall.
- **Review fixes** (`9ceb36d`, `6980fcd`): every bug in the QA and engineering lists above except the deferred performance work; the UX fixes for speech, toasts, the action button, small phones and the sideways anvil.
- **Balance** (`99130ff`): the analyst's table above.
- **The sunlit surface** (`145ae13`): the art pass's mesa palette and eight surface plants.
- **Tools** (`4b81854`): carry one, chosen at the ledge; six to make (Compass, Ore Sense, Threat Radar, Surveyor's Map, Deep Satchel, Lode Beacon).
- **Rifts** (`84137ed`): graft, ore wake, gate, inversion; seal one for riftglass, which forges a tier higher. Grafts are stitched in pixel by pixel with a glowing seam.
- **Saved between sites** (`6d2b936`): a dropped tab no longer loses an expedition.
- **UX round 2** (`f17d55a`, `544ecdf`, `b9888bc`): the forge reads in order with FORGE in reach; the card pairs its equip buttons and asks before salvaging or dropping; pickups float as +n instead of toasting; reports are rows with a star meter; the outpost's stations are labelled in a small pixel hand, and their buttons are verbs (SET OUT, FEED THE STAR, REWORK…).
- **Contracts** (`01a9bbb`): three small goals always posted at the ledge, paid when you come home.

**In progress on branches:** rendering performance (lighting and bloom; the engineer's worktree `lodestar-perf`), and the living world (critters and weather; `lodestar-life`). They'll be merged when they pass review.

## Round 2

Reviewers: QA (on everything new) and the lead designer (pacing, depth, what next), both on a snapshot at `b9888bc`.

### What round 2 found

**The lead designer** measured with a smarter copy of the bot (one that runs from the Hollow, seals rifts and takes the lair):
- **A 5-minute session works.** A first expedition took about 115 bot-seconds (4–6 human minutes) over 2.4 sites, banked 26 units, fed the star 58, met 0.9 contracts and made about one craft.
- **The finale was broken.** No Keeper fell in 210 career dives: the fight used up the whole pull, and the lodeline stayed dark until the Keeper died, so even a win usually ended in the Hollow.
- **The gamble vanished.** From magnitude 3, every site had a lodeline.
- **The board went stale.** Contracts fell from 0.8 a dive to 0.1–0.2 once players left the Rim, and the same board sat there for 25 dives.
- **Crafting was thin.** Found legendaries were the best weapon for long stretches; exotics and riftglass piled up unused.
- **The surface was hard to read:** mesa tops lighter than the ground, sparse plants, brown-on-brown dusk.
- **A crash** whenever a blueprint dropped once every blueprint was known (a slip in a search-and-replace). It hit every Keeper kill late in a career.

**QA** found 4 major bugs, all in tonight's new features, and 14 smaller ones:
- Dying and then closing the tab kept the run.
- A beacon still falling when the run was saved was lost.
- A beacon planted on an ancient forge or a tear could never be ridden home.
- Held sideways, a long report couldn't be scrolled.
- Plus: the lair's pull meter showed empty, the compass went blank in a lair, recall during a seal did nothing, and others.

### What the producer did

All shipped and pushed:
- **The crash fixed** (`213849c`), with a regression check.
- **Every QA item fixed** (`29e470f`), except an imprecise label at 320 px wide (clamped instead). Toasts over screens moved to the very top so they never cover a button.
- **The lair rebuilt as a fair finale:** the pull holds while the Keeper lives; it rages at 90 s; its fall lights the lodeline with 30 s to leave; 30% less health.
- **Lodeline odds** of 100/80/60/40% by site, rising a little with each magnitude; the star softens the recall instead (`ffb712c`).
- **The beacon at magnitude 2;** tool costs take parts of any grade.
- **Contracts keep moving** (`67f5a5e`).
- **Imprinting** (`080469d`): legendaries salvaged at home teach the forge's Codex; a heart or 2 riftglass imprints a known power on a new piece.
- **The surface reads:** darker mesa tops, twice the plants, a lighter dusk (`0b64319`).
- **The world acts on its own** (`cbecd25`): a Lodestorm over a third of expeditions, with marked strikes that can charge a vein into better ore; open tears send out rift-touched elites, and sealing pays more riftglass for each one alive.
- **Merged from the branches:**
  - the living world (`262032f`): lizards, flocks of birds, cave moths that circle the lamp, scurriers in ruins, drifting cloud shadows, dust gusts, drips;
  - faster rendering (`bf3693f`): about 35% less frame time and floors painted 2–2.5× faster on a slowed CPU, with the look unchanged.

**Not done, for the designer to weigh:**
- Grazers and a stranded diver to escort (two more surface events from the designer's list).
- Showing a lodeline mark on the signposts when the map is carried.
- More rift kinds (phase seams, gravity wells, time slips).
- Attunement pairs with free respec.
- A Daily Trace.
