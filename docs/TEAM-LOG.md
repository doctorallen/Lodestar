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

