'use strict';
// ---------------------------------------------------------------------------
// Every gameplay number in one place. Distances are world pixels, times are
// seconds, speeds px/s. DESIGN.md explains the systems; where the two
// disagree, this file is the truth. The affix table is in items.js.
// ---------------------------------------------------------------------------

const T = {
  // charge is the mana: it refills at chargeRegen a second, and close Forms
  // give some back when they hit (T.circuits). magnet: how close loot must
  // be to be picked up. rest: health comes back at restRegen a second once
  // nothing has hurt the diver for restAfter seconds.
  // Health comes back (restRegen a second after restAfter s unhurt) only
  // where there's light: at home, in kindled land, within restLight px of
  // a lit lodeline or a landed beacon, or in a lit waystone's hold. In
  // the dark it's injectors and motes, so a sortie wears you down.
  player: {
    hp: 100, speed: 56, radius: 4, hurtInvuln: 0.5, restAfter: 4, restRegen: 3, restLight: 48,
    charge: 30, chargeRegen: 4.5, magnet: 14,
    dustEvery: 0.24, // s walked between the puffs of dust off his heels (game.js, render.js)
  },

  // Mining: the ore tile's nearest edge must be within `reach` of the feet
  // (10 reaches a wall from the middle of a corridor); the one nearest a
  // point `ahead` px in front of the diver is the target. A hardness-1
  // ore breaks after 1 / speed seconds of holding MINE, times the pick's
  // speed.
  // a drill wakes what's within drillNoise px. cutter: how it's drawn
  // (render.js drawCutter): its body px long, the beam stopping short of
  // the tile's middle (a share of a tile), sparks a frame thrown up to
  // spray px, the beam's sheath and the molten bite
  mine: { reach: 10, ahead: 10, speed: 1.4, hitEvery: 0.22, yield: [1, 2], drillNoise: 90, // (yield: ore a vein, least to most; with no regeneration in the dark a sortie is shorter, so a vein gives more)
    cutter: { body: 4, short: 0.08, sparks: 9, spray: 8, sheath: '#7fd8ff', molten: '#ff9a3a' } },

  // Your light (d.pull): full in kindled land and at home, it drains in the
  // dark over T.world.light seconds. Below dimAt the lamp dims (to lampMin)
  // and every waveEvery seconds `wave` more enemies stir in the dark (each
  // by region: the Rim, the Choir, the Underforge and the Edge, so the first
  // ring is a place to learn); when it's gone the Hollow comes (and a Deep's
  // lodeline goes dark). (With three minutes of light the lamp dims later,
  // at 40%, and the waves come as often as they did with 75 s.)
  pull: { dimAt: 0.4, lampMin: 0.6, waveEvery: [26, 18, 14], wave: [1, 2, 2],
    // The dark notices what you carry (game.js, d.heat: the cargo over
    // `cargo` things, to 1): its waves bring `wave` more at full heat and
    // come `quicker` sooner, and what they bring is an elite `elite` of the
    // time. Banking puts it out. said: the heat Wick remarks at.
    heat: { cargo: 60, wave: 2, quicker: 0.4, elite: 0.35, said: [0.5, 1] } },

  // Leaving takes a moment: standing in a lodeline, EXTRACT takes `extract`
  // seconds; an emergency recall works anywhere, loses nothing, but takes
  // `recall` seconds standing still. Moving or being hit breaks either.
  // Starting one wakes anything within `noise` px.
  leave: { extract: 1.5, recall: 4, noise: 160 },

  // Floors: a w × h tile grid of lumpy caverns (radius roomR tiles, at least
  // roomGap apart) joined by tunnels that wander (meander: how hard the
  // heading drifts each half-tile) at a half-width of tunnelR tiles, plus a
  // few extra tunnels so there are loops. pillar: the chance a big cavern
  // keeps a pillar of rock. wallNoise: how far the walls' line wanders off
  // the tiles. veins: ore veins per cavern (none in the entry's). padOdds:
  // the chance each site of a Deep has a lodeline (back up to the surface),
  // up by padPerMag for each magnitude past the first, to no more than padCap.
  // (Lowered with three minutes of light, so a Deep's way up is still a find.)
  floor: {
    w: 52, h: 52,
    rooms: [7, 10], roomR: [2.5, 4.8], roomGap: 3, loops: [1, 3],
    tunnelR: [1.0, 1.6], meander: 0.35, pillar: 0.4, wallNoise: 0.14,
    veins: [1, 2], veinLen: [2, 4],
    padOdds: [1, 0.7, 0.5, 0.35], padPerMag: 0.05, padCap: [1, 0.85, 0.7, 0.5],
  },
  // Zones: what kind of place a site is. gen: overrides of T.floor for its
  // generator. light: its ambient (a surface's runs from day, at full pull,
  // to dusk), tint and whether the diver's lamp is lit (a surface's lights
  // at dusk). enemies: weight multipliers. forge: the chance of an ancient
  // forge.
  zones: {
    cave: { name: 'Cave', gen: { veins: [1, 3] }, forge: 0.15 },
    surface: { name: 'Surface', gen: { rooms: [6, 8], roomR: [4, 7], roomGap: 2, tunnelR: [1.8, 2.6], meander: 0.25, veins: [0, 2], pillar: 0.8 }, light: { day: 1.15, dusk: 0.65, tint: [1.0, 0.92, 0.8], lampAt: 0.5 }, enemies: { wisp: 2, construct: 0.6 }, forge: 0.1 },
    ruin: { name: 'Ruin', gen: { rooms: [7, 9], roomW: [5, 9], roomH: [4, 7], veinChance: 0.5, veinLen: [2, 3] }, enemies: { construct: 2, crawler: 0.7 }, forge: 0.6 },
    lair: { name: "Keeper's Lair", gen: { rooms: [3, 4], veins: [1, 2] }, forge: 0 },
    deep: { name: 'Deep Vein', gen: { veins: [2, 3], veinLen: [3, 5] }, forge: 0.1, warden: 0.6 },
    lattice: { name: 'The Lattice', gen: { rooms: [6, 8], veins: [1, 2], veinLen: [3, 5], meander: 0.45 }, enemies: { construct: 1.5, crawler: 1.2 }, forge: 0.3, warden: 0.25 },
  },
  // The Lattice (lattice.js): the tunnels under the world, laid out once a
  // save on the world map. A shaft gallery lies under every territory with
  // a Deep (a cleft in the Deep's last site leads down), `jitter` px off
  // its middle, and `extra` junction galleries in the gaps, at least `apart`
  // px from any other and `inner` px out from the star; the tunnels are the
  // Gabriel graph of them. depthUp: a gallery stands this many depths past
  // the land over it. light: the light lasts this much of the surface's
  // time down there (no sky: it always drains). veins: more veins in each
  // cavern; oreDeep: the chance one is the region's deeper ore. spire.shaft:
  // the chance a shaft gallery holds a cold spire (every junction does).
  // relight: a cold spire takes the light over `hold` s standing within
  // holdR px of it, the dark sending `wave` more every waveEvery s. refill:
  // of your light a second, standing in a relit spire's light.
  lattice: {
    extra: 6, apart: 16, inner: 14, jitter: 5, depthUp: 1, light: 0.85,
    veins: [1, 2], oreDeep: 0.5,
    spire: { shaft: 0.35 },
    relight: { hold: 15, holdR: 40, waveEvery: 5, wave: 1 },
    refill: 0.06,
  },
  // The world (world.js, frontier.js): rolled once a save from its seed, in
  // rings round the outpost. Its layout lives on the world map, `map` px
  // square, the world a disc `disc` px across the middle.
  //   rings: n territories each, their middles r px from the star give or
  //     take band; region: its ore and enemies (T.biomes), or none for the
  //     outpost; edge: the Edge (unknown on the map until walked).
  //   warp: how far (px) a border wanders; border: the px of shared border
  //     that make two territories neighbours.
  //   depth: a territory's danger within its region, 1 to 4, by how far out
  //     it stands among its ring, spread evenly (the Edge adds edgeDepth,
  //     levels 13+).
  //   light: seconds of fresh light in dark land before the Hollow comes.
  //   goals: each heart goal's weight, plus perRing for each ring out.
  //   deep: the chance a territory has a portal down into a Deep, of
  //     `sites` sites; every ring's last territory has one, and while its
  //     region's shard is missing, its last site is the Keeper's Lair.
  //   exits: an opening at the map's edge for each neighbour, at least
  //     `apart` tiles from the next, its tunnel tunnelR tiles wide; walking
  //     within `reach` px of it crosses over, arriving `inward` tiles in.
  //   gen: a territory's own overrides of the surface's generator (a cavern
  //     fewer than a site: its passages to the openings make up the ground);
  //     veins: more veins in each cavern (but the first) than a site has.
  //   regrow: sorties before a mined vein in dark land, or in a Deep, grows
  //     back.
  //   straggler: the chance one enemy is left in kindled land; clear: tiles
  //     round where the diver arrives that start clear of enemies.
  //   waystone: lighting one is a `channel` s channel within `touch` px;
  //     the last must then be held `hold` s within holdR px, the dark sending
  //     `wave` more every waveEvery s; dim: an unlit one's faint glow, so
  //     it can be found in the dark [radius in tiles, strength]. plant: the
  //     spire's channel, s.
  //   sun: daylight on the surface (0 dusk, 1 noon) in dark land, in kindled
  //     land, and on the Edge.
  world: {
    map: 176, disc: 86, warp: 9, border: 3,
    rings: [
      { n: 1, r: 0, band: 0, region: null },
      { n: 7, r: 25, band: 5, region: 0 },
      { n: 10, r: 45, band: 5, region: 1 },
      { n: 12, r: 63, band: 4, region: 2 },
      { n: 10, r: 79, band: 3, region: 2, edge: true },
    ],
    edgeDepth: 4, light: 180,
    goals: { waystones: { weight: 3, perRing: 0 }, rift: { weight: 1, perRing: 0.5 } },
    deep: { chance: 0.35, sites: [1, 3] },
    exits: { apart: 9, tunnelR: 1.2, reach: 9, inward: 3 },
    gen: { rooms: [5, 7] }, veins: [0, 1], regrow: 3, straggler: 0.4, clear: 7,
    waystone: { channel: 2.5, touch: 18, hold: 20, holdR: 40, waveEvery: 8, wave: 1, dim: [1.4, 0.45] },
    plant: 6,
    sun: { dark: -0.35, kindled: 1, edge: -0.6 },
  },
  // The outpost (floor.js outpostFloor, hub.js): the middle of the world, a
  // cleared site `size` tiles square with an opening on its edge towards
  // each land next to it, as a territory has. rim: how deep the rock stands
  // round its edge (tiles, by noise between the two). passage: an opening's
  // way through it (its half width, tiles). meld: the cleared ground grades
  // into the land beyond each opening from `from` tiles in from the edge to
  // all of it by `to`, the border between two neighbours' sides wandering
  // `wobble` tiles; their plants grow there `flora` times as thickly as in
  // their own land, as much as the meld's weight to the power floraPow, and `outcrops` of their rock stand in it.
  // sun: the daylight over the site at magnitude 1, and from magnitude
  // sunFull on (the star's own ground grows brighter as it does). pads: the
  // landing pads round the plaza, `r` tiles out from the star. homeClear:
  // the ground kept clear round the Kindler's pod and before its door, of
  // pads and outcrops ([half width, behind its feet, in front], tiles).
  outpost: {
    size: 40, rim: [1.4, 3.4], passage: 1.7,
    meld: { from: 13, to: 3, wobble: 2.5, flora: 1.8, floraPow: 1.4 }, outcrops: [5, 8],
    sun: [0.35, 1], sunFull: 6, pads: { r: 11.5, n: 6 }, homeClear: [2.4, 2.0, 2.6],
    // lode: the lodelines out across the ground, reach [at magnitude 1,
    // more each magnitude] (tiles; all the way towards kindled land), how
    // fast their breaks run out (px/s), and how faint towards the dark.
    // stone: the starstone on the modules, a cluster on each spot from
    // magnitude 2, the next spot every `spread` magnitudes, a crystal more
    // every `grow` (at most `most`), glowing from glowFrom crystals' worth.
    // ground: the starstone spreading into the ground from the cradle,
    // reach [tiles at magnitude 1, more each magnitude], flattened by
    // squash; its edge wandering `wander` tiles by two noises (wobble: px
    // across a bump of each); tendrils [how far they creep ahead (tiles),
    // the ridge's cut, its noise's px]; vein: its gold veins' two noises
    // [across, down, across, down] (px), cut by veinCut [the bright, the
    // fine]; front: how deep the gold front at its edge is (tiles); glint:
    // the bright veins' glow near the cradle [the share of strokes lit at
    // the cradle, how strongly].
    ground: { reach: [2.2, 1.85], squash: 0.82, wander: 1.4, wobble: [70, 26], tendril: [3.2, 0.9, 38], vein: [34, 15, 12, 7], veinCut: [0.965, 0.975], front: 0.09, glint: [0.35, 0.5] },
    lode: { reach: [4, 2.4], speed: 26, dark: 0.45 },
    // pool: the star's light, lying on the ground round the cradle: its
    // reach and strength [at magnitude 0, more each magnitude] (tiles).
    pool: { r: [6, 1.1], i: [1.1, 0.08] },
    stone: { spread: 1.4, grow: 2, most: 5, glowFrom: 4 },
  },
  // Climes: the kind of country a site is, rolled when the way to it is
  // made (so its portal can name it). zones: where it can turn up; weight:
  // how often, times lean[region] in a region it leans to (every clime can
  // turn up in every region). The first of each zone is today's look and
  // has no hazard. gen: overrides of the floor's generator (never more or
  // bigger caverns, which would mean more enemies at once). light: a
  // surface's day, dusk and tint, or underground the ambient and tint.
  // hazard: its one quirk (T.hazards), with `haz` overriding how much of it
  // there is. Looks are in climes.js. resist: the nature its creatures pick
  // up: a step more resistant to one element (more: W to neither, neither
  // to R, R to I) and a step weaker to another (less: the other way).
  climes: {
    badlands: { zones: ['surface'], name: 'Badlands', weight: 2 },
    frost: { zones: ['surface'], name: 'Frost Steppe', weight: 2, lean: { choir: 2.5 }, hazard: 'slick', gen: { pillar: 0.4 }, light: { day: 1.0, dusk: 0.55, tint: [0.9, 0.97, 1.1] }, resist: { more: 'frost', less: 'ember' } },
    cinder: { zones: ['surface'], name: 'Cinder Waste', weight: 2, lean: { underforge: 2.5 }, hazard: 'vent', gen: { pillar: 1 }, light: { day: 0.95, dusk: 0.5, tint: [1.06, 0.86, 0.76] }, resist: { more: 'ember', less: 'frost' } },
    bloomfen: { zones: ['surface'], name: 'Bloomfen', weight: 2, lean: { rim: 2.5 }, hazard: 'spores', gen: { meander: 0.45, tunnelR: [1.6, 2.4] }, light: { day: 1.0, dusk: 0.58, tint: [0.98, 1.0, 0.86] }, resist: { more: 'blight', less: 'ember' } },
    caverns: { zones: ['cave', 'deep'], name: 'Caverns', weight: 2 },
    grotto: { zones: ['cave', 'deep'], name: 'Flooded Grotto', weight: 2, lean: { choir: 2.5 }, hazard: 'pool', light: { ambient: 0.5, tint: [0.72, 0.8, 1.0] }, resist: { more: 'ember', less: 'shock' } },
    magma: { zones: ['cave', 'deep'], name: 'Magma Tubes', weight: 2, lean: { underforge: 2.5 }, hazard: 'burn', gen: { meander: 0.25 }, light: { ambient: 0.4, tint: [1.0, 0.62, 0.5] }, resist: { more: 'ember', less: 'frost' } },
    rootdeep: { zones: ['cave', 'deep'], name: 'Rootdeep', weight: 2, lean: { rim: 2.5 }, hazard: 'spores', haz: { n: [6, 9] }, gen: { meander: 0.5, pillar: 0.8 }, light: { ambient: 0.44, tint: [0.84, 0.86, 0.66] }, resist: { more: 'blight', less: 'ember' } },
    archive: { zones: ['ruin'], name: 'Archive', weight: 2 },
    temple: { zones: ['ruin'], name: 'Overgrown Temple', weight: 2, lean: { rim: 2 }, hazard: 'pool', haz: { blobs: [3, 4], r: [1.4, 2.2] }, light: { ambient: 0.52, tint: [0.8, 0.92, 0.72] } },
    vault: { zones: ['ruin'], name: 'Clockwork Vault', weight: 2, lean: { underforge: 2, choir: 1.5 }, hazard: 'vent', light: { ambient: 0.46, tint: [1.0, 0.84, 0.66] }, resist: { more: 'force', less: 'shock' } },
  },
  // Hazards: mild, readable, and never in the entry's cavern or on a way,
  // the lodeline or beside them. A dash crosses any of them unharmed.
  //   pool: shallow water, brine or mud in `blobs` blobs (r tiles): walkers
  //     in it move at `slow` of their pace.
  //   slick: patches of ice: the diver's footing follows the stick at
  //     `grip` a second, so a step carries on.
  //   burn: `channels` lava channels `len` tiles long and a few `pools`,
  //     never cutting anything off: dps a second to the diver, and the same
  //     burn to what walks in it.
  //   vent: n vents that every `every` s glow for `tell` s, then burst for
  //     `burst` s, hurting within r px for dmg.
  //   spores: n pods that every `every` s let go a cloud r px across,
  //     drifting at `drift` px/s for `life` s; it eats dps a second.
  hazards: {
    pool: { blobs: [3, 5], r: [1.3, 2.6], slow: 0.7 },
    slick: { blobs: [4, 6], r: [1.8, 3.4], grip: 2.4 },
    burn: { channels: [5, 7], len: [8, 15], pools: [2, 3], dps: 7 },
    vent: { n: [6, 9], every: 5, tell: 1.2, burst: 0.6, r: 11, dmg: 7 },
    spores: { n: [5, 8], every: 7, life: 8, r: 12, dps: 3, drift: 5 },
  },
  // A portal (portals.js), each way on: stepping in takes `enter` seconds
  // (the world holds still), and the view opens over `arrive` on the other
  // side. reach: how near its threshold (px) the diver must stand. light:
  // [radius in tiles, strength], times sunLight under the sky. A way down
  // in the field is a hole instead: holeReach, how near its middle (px) the
  // diver must stand (it's solid); holeLight, its glow from below, as
  // light. The way up from a Deep's last site is a rope: ropeUp, tiles of
  // it in view; daylight, the pool it hangs in, as light.
  portal: { enter: 0.45, arrive: 0.7, reach: 11, light: [2.6, 1.0], sunLight: 0.55, holeReach: 20, holeLight: [1.6, 0.45], ropeUp: 2, daylight: [2, 2.4] },
  // A Lodestorm: the chance an expedition sets out under one; on the
  // surface a strike every `every` s (the first after `first`), within
  // `near` tiles of the diver, marked `warn` s ahead, hurting within
  // `radius` px; onOre: the chance it seeks out a vein.
  storm: { chance: 0.35, first: 8, every: 20, near: 6, warn: 1.1, radius: 20, dmg: 14, onOre: 0.4 },
  // Rifts: the chance of one at each site; how often each kind; a graft's
  // radius and the veins it brings; an ore wake's radius, veins and share of
  // the better ore; how near a tear you must stand (px), how long sealing
  // takes, the riftglass it leaves, an inversion's light (tiles).
  rifts: {
    chance: [0.25, 0.35, 0.45, 0.55],
    kinds: { graft: 3, bloom: 3, gate: 2, inversion: 2 },
    graftR: 6, graftOre: 4, bloomR: 4, bloomOre: 8, bloomRich: 0.5,
    touch: 12, seal: 2.5, glass: [1, 2], inversionR: 7, tintR: 4.5,
    // an open tear sends out a rift-touched elite every spawnEvery s, no
    // more than spawnMax alive
    spawnEvery: 25, spawnMax: 3,
  },
  // Tools: made once, and always with you from then on. The magnitude each
  // can be made at, and what it costs from the stash: something specific
  // (a part's kind takes parts of any grade, the lowest first; the Beacon
  // a warden's heart). sight/reach in tiles; the beacon lands after `land`
  // seconds and wakes what's within `noise` px; in a territory, standing
  // within `refill` px of it brings your light back at refillRate a second.
  // (band: the ore and the depth of its band that opens the sense:
  // facets.js senseOpen; the Compass is the splinter itself)
  tools: {
    compass: { mag: 1 },
    oresense: { mag: 1, band: ['lumenite', 1], reach: 9 },
    radar: { mag: 1, band: ['resonite', 1], reach: 18 },
    beacon: { mag: 1, band: ['lumenite', 2], land: 6, noise: 140, refill: 40, refillRate: 0.12 },
    map: { mag: 1, band: ['lumenite', 1], sight: 6 },
    lens: { mag: 1, band: ['resonite', 2] },
  },
  // The outpost's buildings (structures.js): each built once, at the
  // forge's BUILDINGS tab, and set down at its plot. mag: the magnitude the
  // star must have reached; cost: what it takes from the stash (ore, a
  // part's kind, an exotic). Mid-game goals.
  //   bay: the Drone Bay, where Wick is fitted with upgrades (wickUp).
  //   refinery: at the fabricator, `n` of an ore refine into one of the
  //     next ore up (only to an ore already brought home).
  //     Building it is level 1; `levels` are the upgrades past it, at the
  //     SUPPLIES screen (the magnitude each needs and its cost). Each level
  //     makes both supplies stronger (T.supplies).
  //   relay: an emergency recall takes `recall` of its time; banking and
  //     travelling at a spire, `bank`.
  //   quarters: built ahead for the sleepers; meanwhile the survey drones
  //     roost there, and each time you come home bring `pay` creature parts.
  structures: {
    bay: { mag: 2, cost: { ferrite: 12, chitin: 2 } },
    refinery: {
      mag: 2, cost: { lumenite: 10, cog: 2 }, n: 4,
      levels: [{ mag: 3, cost: { resonite: 10, ether: 3 } }, { mag: 5, cost: { sigilite: 10, spore: 3 } }],
    },
    relay: { mag: 3, cost: { resonite: 10, chitin: 3, cog: 2 }, recall: 0.5, bank: 0.6 },
    quarters: { mag: 4, cost: { aetherglass: 8, fiber: 4, lodeshard: 1 }, pay: 3 },
    // the plots (tiles; floor.js outpostPlots): the footprint kept clear
    // [half width, behind, in front of the feet], how far from the middle
    // they'd best be, and how far from the tracks out (the lodelines)
    plot: { box: [1.9, 1.4, 0.5], r: 10, path: 2.1 }, // (the slab's half width grew with the Quarters)
    // a building coming down to its plot: how long (s), from how high (px)
    land: { time: 1.8, high: 150 },
  },
  // Wick's upgrades (wick.js), fitted at the Drone Bay once it stands; each
  // can be turned off and on there, free.
  //   scan: every `every` s out in the land, a ping: veins within `reach`
  //     tiles glint for `show` s, and marks point to the pack and to
  //     modules on the ground.
  //   lamp: a second, dimmer beam behind you: × the lamp's reach and
  //     strength, its half-angle (degrees).
  //   shield: a hit that would leave you under `below` of your health is
  //     stopped by a hex shield; it's ready again once nothing has hurt you
  //     for `rest` s (once a fight).
  //   spark: every `every` s, a small shock at the nearest awake foe
  //     within `reach` px: `frac` of its health (a boss's, `boss`).
  wickUp: {
    scan: { mag: 2, cost: { lumenite: 6, spore: 3 }, every: 7, reach: 8, show: 3.5 },
    lamp: { mag: 3, cost: { resonite: 6, fiber: 3 }, reach: 0.62, i: 0.6, edge: 32 },
    shield: { mag: 3, cost: { resonite: 8, chitin: 4 }, below: 0.35, rest: 20 },
    spark: { mag: 4, cost: { aetherglass: 8, cog: 4 }, every: 2.6, reach: 64, frac: 0.07, boss: 0.012 },
  },

  // The chance a vein is the biome's deeper ore, by site.
  oreDeep: { base: 0.12, perFloor: 0.12, max: 0.6 },

  ores: [
    { id: 'ferrite', name: 'Ferrite', tier: 1, hardness: 1.0 },
    { id: 'lumenite', name: 'Lumenite', tier: 2, hardness: 1.5 },
    { id: 'resonite', name: 'Resonite', tier: 3, hardness: 2.0 },
    { id: 'aetherglass', name: 'Aetherglass', tier: 4, hardness: 2.6 },
    { id: 'sigilite', name: 'Sigilite', tier: 5, hardness: 3.3 },
    { id: 'starmetal', name: 'Starmetal', tier: 6, hardness: 4.0 },
  ],
  // Exotic materials: dropped by elites (and now and then anything else).
  // Each does one thing: an elemental one is forged into its Element core
  // (and worked into a rig frame, one comes out with it); a Lodestone shard
  // worked into a frame gives its spells a second Mod slot (and the
  // Settlers' Quarters take one); riftglass forges a piece a tier higher.
  // Bloodresin is retired (it fed the old reroll): it no longer drops, and
  // what's banked is unravelled into retiredThreads threads each.
  exotics: [
    { id: 'voltaic', name: 'Voltaic crystal', element: 'shock' },
    { id: 'frostglass', name: 'Frostglass', element: 'frost' },
    { id: 'emberglass', name: 'Emberglass', element: 'ember' },
    { id: 'blightcap', name: 'Blightcap', element: 'blight' },
    { id: 'bloodresin', name: 'Bloodresin', retired: true },
    { id: 'lodeshard', name: 'Lodestone shard', modSlot: true },
    // only from sealing a rift
    { id: 'riftglass', name: 'Riftglass', tierUp: true, riftOnly: true },
  ],

  // Each biome's look is in art.js, under the same id. A floor's enemy level
  // is biome × levelPerBiome + depth.
  biomes: [
    { id: 'rim', name: 'The Rim', ores: ['ferrite', 'lumenite'] },
    { id: 'choir', name: 'The Choir', ores: ['resonite', 'aetherglass'] },
    { id: 'underforge', name: 'The Underforge', ores: ['sigilite', 'starmetal'] },
  ],
  levelPerBiome: 4,

  // The hands: the rig's two spells, each its own button (spell A on the
  // right wrist, B on the left). A press casts it, holding past chargeStart
  // charges it, and letting go once it's past chargeFull casts it charged.
  // Close Forms aim at the nearest enemy within autoAim, else straight
  // ahead; another press within comboWindow carries an Arc's combo on.
  // fist: the power with no rig worn (spell A casts a free Arc).
  hands: { autoAim: 52, comboWindow: 0.6, chargeStart: 0.25, chargeFull: 0.7, fist: 3 },
  // The HUD: the spell buttons read the nearest foe within verdictReach px
  // (in sight) and say whether it fears or shrugs off each spell's element.
  hud: { verdictReach: 140 },
  retiredThreads: 4,
  // A dash: a burst of speed with a moment of untouchability. A flick of
  // the move thumb (flickPx in flickMs) dashes too.
  dash: { speed: 230, time: 0.13, invuln: 0.22, cooldown: 0.55, flickPx: 26, flickMs: 90 },
  // How hits land: the world freezes for hitstop (heavy: heavyStop);
  // knockback fades at knockDecay a second. The foe struck holds still for
  // targetStop s (heavy: heavyTargetStop) as the knock takes it, and a hit
  // of at least `flinch` of its health breaks off its wind-up, staggering it
  // for flinchTime s (not a boss's or the Hollow's; once every flinchGap s).
  // shotKnock: a bolt's or a lance's knock, px/s [plain, charged]. The view
  // doesn't shake (the designer found it unpleasant), but the shake values
  // are kept at 0 so it can be tried again.
  // A struck enemy wears a rim a pixel wide (render.js) for hurtFlash s;
  // no more than flashMost at once.
  impact: { flashMost: 4, hitstop: 0.045, heavyStop: 0.09, stopGap: 0.15, shake: 0, heavyShake: 0, hurtShake: 0, knockDecay: 9,
    targetStop: 0.07, heavyTargetStop: 0.13, flinch: 0.15, flinchTime: 0.25, flinchGap: 1.2, shotKnock: [75, 130] },

  // Spells (circuits.js): the rig's two, each one Form core, one Element
  // core and a Mod core (two, from a better frame: rig). The charge a cast
  // costs is its Form's cost times its Mods' costs (at least 1). Damage is
  // the rig's power × the Form's mult × its cores' growth (stoneGrowth a
  // tier past the first for the Form; otherGrowth for each other core) ×
  // (1 + spell damage %, + close damage % for close Forms).
  //   charged (held): chargedMult the damage for chargedCost the charge;
  //     bolts and lances are bigger and pass through chargedPierce more.
  //   aimRange: how far a cast looks for something to aim at.
  //   spark: what a spell with no Form casts (a weak bolt).
  //   rig: the frame. cd, a share of every spell's wait; area, a share of
  //     every reach; aim, its aimRange; extraTier, the tier from which a
  //     frame has its ore's extra part a spell (a masterwork or a Lodestone
  //     shard gives it sooner); form2Mult, what a second Form casts at.
  //   forms: cost, mult and cd (seconds the spell waits) for each, and:
  //     arc: combo [damage ×, cooldown, arc cos, knockback px/s]
  //       (the last is heavy and staggers); range px; heldMult, the damage
  //       of the Nova it bursts into when held (instead of chargedMult);
  //       slow: the share of its wait the diver walks slower and can't turn.
  //     glaive: blades circling at radius px for time s, spin rad/s; each
  //       cuts what's within reach px of it, the same foe again after
  //       `again` s, knocked knock px/s along; at most `most` at once.
  //     bolt, lance, orb: speed px/s, life s; lance pierces `pierce`; orb
  //       pulses every `every` s, hurting within radius px.
  //     nova: radius, knock px/s, chargedR (its radius, charged), splitOut
  //       (a Split's three stand this share of the radius out). well:
  //       radius, time, pull px/s, a tick every `every`, a first yank px/s
  //       and stun s; ahead: px out when nothing's in aim; splitOut.
  //     ward: soak (× power) for time s; thorns (× power) to what strikes it.
  //     close: it refunds `refund` charge for each foe it hits, for at most
  //       refundMost foes a cast. field: the radius of a Linger's field.
  //   glyphs (the Mods): cost, times the Form's (each Mod core of it).
  //     split: n each at mult, spread rad apart (closeSpread for an Arc's
  //     sweeps). amplify: area ×, damage ×. quicken: cd ×. chain: jumps a
  //     core, within range px, each falloff × the last. echo: again after
  //     delay at mult. pierce: more foes passed through. linger: a field of
  //     its element for time s, hurting dps × the hit a second.
  //   force: what Force adds: knockback ×.
  //   stones (the cores): what forging one takes: ore, parts (creature
  //     parts) or an exotic. A fine forge or better makes it a tier higher.
  circuits: {
    chargedMult: 1.8, chargedCost: 1.5, chargedPierce: 3, aimRange: 140,
    stoneGrowth: 0.15, otherGrowth: 0.05,
    spark: { cost: 3, mult: 0.6, cd: 0.3, speed: 170, life: 1.2 },
    // The rig: its wait and aim; a frame of extraTier or denser, a
    // masterwork or one forged with a Lodestone shard has an extra slot a
    // spell, of the kind its ore chooses (ores.extra below: a second Mod,
    // a second Element, a second Form); a second Form casts at form2Mult.
    rig: { cd: 0.9, area: 1, aim: 140, extraTier: 3, form2Mult: 0.7 },
    forms: {
      arc: { cost: 3, mult: 0.9, close: true, refund: 2, refundMost: 3, range: 22, heldMult: 2.2, field: 14, slow: 0.6,
        combo: [[1, 0.24, 0.3, 90], [1, 0.24, 0.3, 90], [1.7, 0.45, -0.1, 170]] },
      glaive: { cost: 6, mult: 0.5, close: true, refund: 1, refundMost: 4, cd: 0.4, blades: 2, radius: 20, reach: 7, time: 3, spin: 7, again: 0.35, most: 3, knock: 60, field: 20 },
      bolt: { cost: 4, mult: 1.0, cd: 0.3, speed: 170, life: 1.2, field: 12 },
      lance: { cost: 6, mult: 1.1, cd: 0.35, speed: 210, life: 0.9, pierce: 4, field: 12 },
      orb: { cost: 7, mult: 0.4, cd: 0.45, speed: 42, life: 3, every: 0.45, radius: 18, field: 18 },
      nova: { cost: 10, mult: 1.3, cd: 0.4, radius: 34, knock: 60, chargedR: 1.15, splitOut: 0.6, field: 26 },
      well: { cost: 10, mult: 0.3, cd: 0.45, radius: 56, time: 2.5, pull: 70, every: 0.5, yank: 120, stun: 0.5, ahead: 50, splitOut: 0.6, field: 30 },
      ward: { cost: 9, mult: 0, cd: 0.45, soak: 2.5, time: 5, thorns: 0.6, field: 20 },
    },
    glyphs: {
      split: { cost: 1.3, n: 3, mult: 0.6, spread: 0.28, closeSpread: 1.2 },
      amplify: { cost: 1.2, area: 1.5, dmg: 1.2 },
      quicken: { cost: 0.67, cd: 0.7 },
      chain: { cost: 1.2, jumps: 2, range: 54, falloff: 0.7 },
      echo: { cost: 1.25, delay: 0.4, mult: 0.6 },
      pierce: { cost: 1.1, more: 3 },
      linger: { cost: 1.2, time: 3, dps: 0.35, every: 0.5 },
    },
    force: { knock: 1.3 },
    stones: { form: { ore: 6, parts: 2 }, element: { ore: 4, exotic: 1 }, glyph: { ore: 5, parts: 3 } },
    // Weak and resistant (natures.js): a hit of an element is multiplied by
    // resist[verdict]: W weak, R resistant, I very resistant. Nothing is
    // ever immune. Each enemy's own verdicts are T.enemies.resist; a clime
    // moves them a step (T.climes[id].resist); an elite's affix adds its own
    // (T.enemies.eliteResist).
    // (what a weak, a resisted and an all-but-shrugged-off hit does: the
    // wrong element is a slog and the right one a rout, so the cores you
    // bring are the decision; 2026-10-22, were 1.5, 0.5, 0.25)
    resist: { W: 1.75, R: 0.3, I: 0.15 },
    // Reactions between statuses (reactions.js). Every element a hit
    // carries leaves its status on a foe for `status` s; a second element on
    // a carrier reacts, in either order, and two on one Form react on their
    // own. A reaction can't fire again on the same foe for cd s; its name
    // shows over it for word s, wordAbove px over its feet (above where its
    // numbers rise to), the next one stacked above. WEAK or RESIST shows
    // under a foe's number at most once every verdictEvery s.
    //   shatter: × the hit on the chilled; a frozen foe bursts, hurting
    //     what's within burst px for burstMult × the hit.
    //   conduct: the shock leaps to every chilled foe within range px, at
    //     mult × its share of the hit.
    //   steam: a cloud r px across where foes lose the diver for lost s.
    //   brittle: × everything the chilled and poisoned take, for `status` s.
    //   pyre: the poison left bursts at once, at mult × what it would do.
    //   flare: foes within r px are blinded for blind s, and wind-ups broken.
    //   scatter: n patches of burning ground flung step px apart along the
    //     knock, burning dps × the hit a second for time s.
    //   jolt: the overload stacks a stagger adds.
    //   Self stacks: overload (stacks of shock stun for stun s); freeze
    //   (chills that freeze solid for time s); inferno (burns that stack to
    //   most, then spread within r px); plague (poison spreads within r px
    //   on a hit); stun (a second heavy Force hit within `status` s stuns).
    //   control: the share of a stun, freeze, blind or loss a boss takes
    //   (the Hollow takes none).
    react: {
      status: 3, cd: 0.6, word: 0.9, control: 0.3, verdictEvery: 0.8, wordAbove: 34,
      shatter: { mult: 1.6, burst: 26, burstMult: 0.5 },
      conduct: { range: 80, mult: 0.6 },
      steam: { r: 24, lost: 2, cloud: 2 },
      brittle: { mult: 1.25 },
      pyre: { mult: 1 },
      flare: { r: 26, blind: 1.5 },
      scatter: { n: 3, step: 12, r: 7, time: 2.5, dps: 0.3 },
      jolt: { stacks: 2 },
      overload: { stacks: 5, stun: 1 },
      freeze: { stacks: 3, time: 1.6 },
      inferno: { most: 3, r: 32 },
      plague: { r: 40 },
      stun: { time: 1 },
    },
    // Ore affinity: a frame's ore (the one it's named for) favours an
    // element. A spell of it is attuned: attuned.dmg more damage and its
    // status attuned.status × as long. Resonite favours none: its
    // resonances are `resonance` stronger.
    attuned: { dmg: 0.25, status: 1.5 },
    // Each ore a frame is forged in has a way of its own beside its
    // element (2026-10-22): knock and stagger, heavy hits knock and
    // stagger harder; cd and charge, spells wait less and the pool is
    // smaller; reach, bolts, lances and orbs fly further (and the aim
    // reaches further); heavy, the third Arc and charged casts hit harder;
    // status, every status holds longer. So a lower tier in the right ore
    // can be the better frame for a territory, and a second frame is a
    // craft worth making.
    ores: {
      ferrite: { el: 'force', knock: 1.4, stagger: 1.35, extra: 'glyph', line: 'Blunt: heavy hits knock and stagger harder' },
      lumenite: { el: 'shock', cd: 0.82, charge: -0.2, extra: 'glyph', line: 'Quick: spells wait less; the charge pool is a fifth smaller' },
      resonite: { resonance: 0.25, extra: 'glyph', line: 'Resonant: a second Mod slot a spell' },
      aetherglass: { el: 'frost', reach: 1.35, extra: 'form', line: 'Far: bolts, lances and orbs fly a third further; a second Form slot a spell' },
      sigilite: { el: 'ember', heavy: 1.3, extra: 'element', line: 'Heavy: the third Arc and charged casts hit a third harder; a second Element slot a spell' },
      starmetal: { el: 'blight', status: 1.5, extra: 'element', line: 'Lasting: every status holds half again as long; a second Element slot a spell' },
    },
    // Resonances (resonance.js): a spell whose cores hold all of one's
    // parts hits mult × as hard. Resonance traces, which show parts of them
    // in the Codex, drop from elites (elite) and lie by an ancient forge
    // (forge).
    //   thunderhead: the orb flies `fly` s to a point `ahead` px out (or the
    //     foe in aim) and becomes a cloud `height` px up for `time` s,
    //     striking the nearest foe within r px every `every` s for mult × the
    //     spell's damage, drifting at drift px/s to stand over it.
    //   shatterglass: the echo's lance hits the chilled for mult ×, and
    //     flings `shards` shards out to either side, each shardMult × the
    //     hit, at shardSpeed px/s for shardLife s.
    //   kindling: every third Arc sets `flames` patches of fire (size px)
    //     alight in a crescent in front, half rad either side of the aim, at
    //     r × its reach, for time s, dps × the hit a second.
    //   wildfire: each orb drops a patch of fire (r px) every `every` px for
    //     time s, dps × the hit a second (at most `most` at once); flora
    //     within ignite px catches (cosmetic) and passes it on within spread
    //     px every spreadEvery s, burning burn s (at most flora at once).
    //   stormglaive: every `every` s the blades arc to every foe within
    //     reach px of the diver, for mult × a blade's cut.
    //   starfall: three bolts rise for rise s and meet over the target, the
    //     star falls for fall s; it strikes within r px for the three bolts'
    //     damage and burst × a bolt's more, stunning for stun s. ahead: px
    //     out with nothing in aim.
    resonance: {
      mult: 1.5, elite: 0.04, forge: 0.35,
      thunderhead: { fly: 0.3, ahead: 56, height: 30, time: 4, r: 64, every: 0.4, mult: 1, drift: 30 },
      shatterglass: { mult: 2, shards: 2, shardMult: 0.4, shardSpeed: 170, shardLife: 0.3 },
      kindling: { flames: 5, half: 0.9, r: 1, time: 3, dps: 0.3, size: 7 },
      wildfire: { every: 10, r: 7, time: 2.5, dps: 0.15, most: 60, ignite: 12, spread: 20, spreadEvery: 0.35, burn: 3, flora: 40 },
      stormglaive: { every: 0.45, reach: 64, mult: 0.5 },
      starfall: { rise: 0.5, fall: 0.16, r: 40, stun: 1, ahead: 70, burst: 1.3 },
    },
  },
  // How a cast looks (castfx.js; cosmetic only: the spell still fires on the
  // tap, and nothing here changes what it does). Sizes are world px, times
  // seconds, light radii tiles.
  //   pose: how long the diver holds the cast pose; thrust: the share of it
  //     the arm is out before it eases back. lean: [art px the body leans
  //     into the cast, art px it recoils back]; reach: art px past the fist
  //     the wrist projector's light leaves from.
  //   flash: the burst at the fist, [seconds, light radius, light]; streaks:
  //     how many motes it kicks out, [least, most] speed.
  //   glyph: the rune circle under the feet, [radius from, radius to,
  //     seconds]; glyphBig: the same for the big spells; motes: how many
  //     rise round the diver, and for how long.
  //   shapes: what a spell does about the diver, by its shape (castFxFor),
  //     so a new spell takes its shape's look: projectile (drawn from the
  //     bolts themselves); sweep (an Arc's crescent of light across the aim,
  //     time s, heavyTime for the heavy third, sparks thrown off it), burst (a ring swept
  //     out from the diver, or in), placed (swept in where it lands, with a
  //     rune circle, glyph: [radius from, to as a share of the reach,
  //     seconds]), guard (a ring drawing in round the diver: ring [from, to],
  //     motes rising), move (ghosts afterimages, alpha, ends: a ring at each
  //     end [small, big radius, seconds]). from: the radius a burst starts
  //     at (or ends at, inwards); time: its seconds; dust: motes of dust it
  //     pushes; scatter: bits of its element thrown out; bloom: [light
  //     radius as a share of the reach (move: tiles), light, seconds]; big:
  //     its cast has the big rune circle.
  //   shapeOf: each Form's shape (and a spark's).
  //   bolt: originT, how long a bolt takes to leave the fist for its true
  //     path; trail: dots behind it; every: seconds between the motes it
  //     sheds; core: its white-hot core, art px [plain, charged]; linger:
  //     how long its contrail stays where it went; light: [radius, tiles,
  //     strength]. impact: [sparks, light radius, light, seconds]; decal:
  //     [seconds a mark on the ground lasts, the most at once].
  //   charge: motes drawn into the focus a second at full charge; glyph
  //     radius [empty, full].
  //   echo: how long the ghost of a recast pose lasts.
  //   cap: the most motes alive at once (past it, new ones are skipped); flares: the
  //     most lights flaring at once (the oldest make way); day: under the
  //     sky in daylight, the share of its radius a cast's light keeps (and
  //     it's never brighter than dayMost: cfxLight).
  //   lock: a shot's or a placed spell's lock-on on its foe, [seconds,
  //     seconds its brackets take to close in, seconds its guide line
  //     shows]; scar: a lance's line burnt on the ground, [seconds it
  //     cools, the most at once]; beam: how far back from its head a
  //     lance's beam reaches, world px; swarm: how long Blight's nanites
  //     cling to what it struck.
  castFx: {
    // A creature's death, taken by the star (castfx.js castFxAbsorb): its
    // pixels draw in to a knot over where it stood for the first `gather`
    // of t seconds, and the knot streams off towards the star, as far as
    // `reach` world px (or to the star, if nearer), each mote setting off
    // up to `spread` of the way through behind the first.
    absorb: { t: 0.95, gather: 0.3, reach: 90, spread: 0.55 },
    pose: 0.2, thrust: 0.45,
    lean: [2, 1], reach: 2,
    flash: [0.14, 2.2, 1.4], streaks: 7, streakSpeed: [50, 110],
    glyph: [8, 13, 0.45], glyphBig: [11, 19, 0.6], motes: 6, moteTime: 0.55,
    shapes: {
      projectile: {},
      sweep: { time: 0.16, heavyTime: 0.24, sparks: 10, dust: 6, bloom: [1, 0.8, 0.2] },
      burst: { from: 4, time: 0.32, dust: 12, scatter: 12, bloom: [1.2, 1.1, 0.3], big: true },
      placed: { from: 4, time: 0.42, dust: 10, glyph: [0.5, 0.3, 0.7], bloom: [1.2, 1.1, 0.3], big: true },
      guard: { ring: [18, 9], time: 0.32, motes: 10, bloom: [1.2, 0.9, 0.3], big: true },
      move: { ghosts: 6, time: 0.3, alpha: 0.4, ends: [3, 12, 0.18], bloom: [2, 1.2, 0.25] },
    },
    shapeOf: { spark: 'projectile', bolt: 'projectile', lance: 'projectile', orb: 'projectile', arc: 'sweep', glaive: 'burst', nova: 'burst', well: 'placed', ward: 'guard' },
    bolt: { originT: 0.07, trail: 5, every: 0.035, core: [12, 18], linger: 0.26, light: [1.7, 0.85] }, impact: [12, 1.9, 1.7, 0.24], decal: [1.8, 16],
    charge: { motes: 40, glyph: [5, 13] },
    echo: 0.3,
    cap: 260, flares: 14, day: 0.33, dayMost: 0.2,
    lock: [0.45, 0.1, 0.1], scar: [0.9, 8], beam: 40, swarm: 1.1,
  },
  // What each element does on a hit (its core sets a spell's). shock: this
  // share of hits arcs on; frost: hits chill, and a heavy hit on the
  // chilled shatters for `shatter` times; ember: hits burn for burnTime,
  // `burn` of the hit a second; blight: poison for blightTime, `blight` of
  // the hit a second, spreading within blightSpread px when its host falls.
  elements: { shockChance: 0.3, shatter: 1.6, burn: 0.35, burnTime: 3, blight: 0.22, blightTime: 4, blightSpread: 40 },
  // shock arcs to the nearest other enemy within shockRange for shockMult;
  // chill slows by chillSlow for chillTime.
  onHit: { shockRange: 48, shockMult: 0.5, chillSlow: 0.5, chillTime: 2 },

  // Enemies at level 1; each level multiplies hp by hpGrowth and damage by
  // dmgGrowth. The first levels are gentler: hp × hpEarly at level 1,
  // rising evenly to all of it at level hpFullAt (the Choir's furthest), so
  // the Rim is for learning (not the Hollow's). windup: the tell before an
  // attack. weight: how often each turns up. No more than `attackers` (plus
  // attackersPerDepth a depth and attackersPerBiome a region, rounded down)
  // wind up at once; the rest circle. Of the kinds that close in to fight
  // (crawlers, droppers, crabs, constructs), only the nearest `press` (plus
  // pressPerBiome a region) come in; the rest hold off at holdBack px,
  // circling, until one falls. One woken by another, or by a noise, waits
  // wakeStagger s (between the two) before it comes.
  // A heavy hit staggers anything but the warden for staggerTime.
  // Fewer and tougher (2026-10-22): a room holds one to three, each kind's
  // health is hpScale times its number below and its damage dmgScale times
  // (bosses keep their own health), so a regular foe takes six to eight
  // hits at gear parity and its hit costs a fifth to a quarter of the
  // health; one in an exposed state (dazed, stranded, spent, recovering)
  // takes `exposed` times the damage, so the fight is dodge, then punish.
  enemies: {
    cull: 40, // tiles from the Kindler beyond which an unaware creature rests, unstepped
    // (hpEarly: the Rim's share of a foe's health and damage at level 1,
    // rising to all of it at hpFullAt; shotScale: what a shot, a glob or a
    // beam does against a bite, since it's harder to step out of)
    hpGrowth: 1.15, dmgGrowth: 1.14, hpScale: 1.7, dmgScale: 1.6, shotScale: 0.75, hpEarly: 0.6, hpFullAt: 4, aggro: 96, hurtFlash: 0.12, staggerTime: 0.35,
    attackers: 1, attackersPerDepth: 0.34, attackersPerBiome: 0.75, press: 2, pressPerBiome: 1, holdBack: 72, wakeStagger: [0.5, 1.6],
    // crawlers close to `circle` px, circle for a moment, wind up, lunge,
    // then recover (open to a counter)
    // (size: how much bigger the common kinds are drawn than their painters'
    // units, foespaint.js; their bodies, `radius`, grew with them)
    size: { crawler: 1.3, wisp: 1.3, construct: 1.3 },
    crawler: { hp: 26, dmg: 14, speed: 36, radius: 6, circle: 28, windup: 0.38, lungeSpeed: 145, lungeTime: 0.28, recover: 0.55, weight: 5, barY: 21 },
    // wisps keep `keep` px away and strafe; from fanDepth they fire three
    wisp: { hp: 17, dmg: 9, speed: 28, radius: 5, keep: 60, range: 115, windup: 0.55, cooldown: 1.9, shotSpeed: 72, fanDepth: 3, weight: 3, barY: 28 },
    // constructs show where they'll charge; one that hits a wall is dazed
    construct: { hp: 52, dmg: 16, speed: 20, radius: 8, range: 80, windup: 0.7, cooldown: 2.2, chargeSpeed: 135, chargeTime: 0.5, dazed: 1.3, weight: 2, barY: 26 },
    // flora that fights: rooted, hidden among the harmless kind until it
    // wakes. A snapjaw snaps at anything within `reach`; a spitter lobs a
    // glob that leaves spores on the ground (`puddle` px across, hurting
    // puddleDps a second for puddleTime)
    snapjaw: { hp: 30, dmg: 13, speed: 0, radius: 6, reach: 24, windup: 0.5, cooldown: 1.5, weight: 2, rooted: true },
    spitter: { hp: 20, dmg: 6, speed: 0, radius: 5, range: 110, windup: 0.6, cooldown: 2.4, shotSpeed: 60, puddle: 14, puddleDps: 9, puddleTime: 2.6, weight: 2, rooted: true },
    // Each clime's own creature (foes.js), a signature: signatureShare of
    // what a room holds in its clime, and nowhere else but a rift's graft of
    // that clime (graftFoes of them; not those that need its water or a
    // ceiling: noGraft). In an exposed state (stranded, spent, just landed)
    // one takes `exposed` times the damage, as a dazed one does. part: the
    // creature part it leaves. knock: how far hits push it (1 a crawler).
    // barY: how high its health bar sits (world px over its feet).
    signatureShare: 0.3, graftFoes: [1, 2], exposed: 2.5,
    signature: { badlands: 'skink', frost: 'tusker', cinder: 'wraith', bloomfen: 'lurker', caverns: 'dropper', grotto: 'eel', magma: 'crab', rootdeep: 'weaver', archive: 'sentinel', temple: 'idol', vault: 'hound' },
    // the Dune Skink (Badlands) swims under the sand (its speed), shows a
    // ring where it will burst up once within `strike` px, and bursts there
    // after windup s, biting within `burst` px; it stays up for `up` s,
    // then takes `dig` s to go back under
    skink: { hp: 24, dmg: 11, speed: 40, radius: 5, strike: 24, windup: 0.9, burst: 10, up: 1.5, dig: 0.4, cooldown: 1.2, part: 'chitin', barY: 14 },
    // the Tusker (Frost Steppe) shows where it will charge; past chargeTime
    // it slides on, losing speed at `grip` a second (iceGrip on ice, so on
    // ice it goes on until the rock stops it); it can't turn, and into rock
    // it's dazed (slam s, from a slide on ice). stopAt: px/s it stops at
    tusker: { hp: 64, dmg: 15, speed: 18, radius: 8, range: 88, windup: 0.85, cooldown: 2.4, chargeSpeed: 150, chargeTime: 0.45, grip: 9, iceGrip: 0.7, stopAt: 16, dazed: 1.4, slam: 2.2, knock: 0.3, part: 'chitin', barY: 22 },
    // the Ash Wraith (Cinder Waste) waits in a fissure until the diver is
    // within `notice` px, takes `rise` s to rise, drifts in, and within
    // burstAt px glows for windup s and bursts, hurting within `burst` px
    // and leaving burning ground (ashR px, ashTime s, ash × its damage a
    // second); then it's a spent cinder for `spent` s
    wraith: { hp: 22, dmg: 17, speed: 30, radius: 5, notice: 64, rise: 0.7, burstAt: 20, windup: 0.8, burst: 20, ashR: 13, ashTime: 2.4, ash: 0.35, spent: 1.8, cooldown: 1.6, flies: true, part: 'ether', barY: 22 },
    // the Bog Lurker (Bloomfen) sits half-sunk in its mire and never moves;
    // it marks a line `range` px long, then lashes its tongue along it
    // (`width` px either side), dragging what it catches `drag` px towards
    // itself over dragTime s
    lurker: { hp: 40, dmg: 12, speed: 0, radius: 6, range: 74, width: 5, windup: 0.75, cooldown: 2.2, drag: 16, dragTime: 0.18, anchored: true, part: 'spore', barY: 12 },
    // the Ceiling Dropper (Caverns) clings to the roof until the diver is
    // within `notice` px; its shadow grows on the floor for `fall` s,
    // following the diver for the first `track` s, then it drops, hurting
    // within `drop` px, lies `landed` s, and fights like a squat crawler
    // (windup, lunge and recover as a crawler's)
    dropper: { hp: 30, dmg: 13, speed: 30, radius: 6, notice: 46, fall: 1.0, track: 0.45, windup: 0.45, drop: 11, landed: 0.6, circle: 24, lungeSpeed: 120, lungeTime: 0.25, recover: 0.6, side: 0.8, noGraft: true, part: 'chitin', barY: 14 },
    // the Pool Eel (Flooded Grotto) swims in the pools at `speed`; within
    // `range` px it rears up for windup s showing its line, lunges, and if
    // it lands on dry ground without biting, lies stranded for `stranded`
    // s, then crawls back at crawlSpeed; back in the water it stays up for
    // `surface` s before it dives
    eel: { hp: 30, dmg: 13, speed: 46, radius: 5, range: 54, windup: 0.75, lungeSpeed: 190, lungeTime: 0.28, stranded: 1.6, crawlSpeed: 26, surface: 0.9, cooldown: 2.2, swims: true, noGraft: true, part: 'fiber', barY: 14 },
    // the Slag Crab (Magma Tubes) sidesteps round the diver (side × its
    // speed) and pinches. Its shell takes `shell` of the damage until it's
    // chilled, or cracked by a heavy hit for crackTime s. Lava can't burn it
    crab: { hp: 44, dmg: 14, speed: 26, radius: 6, circle: 24, windup: 0.5, lungeSpeed: 110, lungeTime: 0.22, recover: 0.5, side: 1.25, shell: 0.35, crackTime: 5, knock: 0.5, lavaProof: true, part: 'cog', barY: 15 },
    // the Rootweaver (Rootdeep) keeps `keep` px off and spits (shotSpeed);
    // every snareEvery s it strings a root snare between two walls across
    // the diver's way (each end at most snareReach px from the diver),
    // showing it for `weave` s: crossing one walks at snareSlow; it lasts
    // snareTime s, snareMax on a floor
    weaver: { hp: 26, dmg: 9, speed: 30, radius: 5, keep: 62, range: 110, windup: 0.55, cooldown: 2.0, shotSpeed: 80, snareEvery: 6, snareReach: 44, weave: 0.7, snareTime: 9, snareMax: 3, snareSlow: 0.45, snareWidth: 4, part: 'fiber', barY: 15 },
    // the Sentinel Eye (Archive) floats `keep` px off and sweeps a beam
    // through `arc` rad either side of the diver over `sweep` s, after
    // windup s showing the arc; rock stops the beam. One hit a sweep
    sentinel: { hp: 30, dmg: 11, speed: 16, radius: 5, keep: 74, range: 118, windup: 0.9, sweep: 1.2, arc: 0.7, cooldown: 3.0, flies: true, part: 'ether', barY: 24 },
    // the Moss Idol (Overgrown Temple) moves only out of the light: farther
    // than litReach of the lamp's reach, behind rock, and out of a shaft of
    // daylight (shaftReach of its radius). Unlit, within `pounce` px, it
    // winds up and lunges
    idol: { hp: 56, dmg: 15, speed: 56, radius: 6, pounce: 56, windup: 0.65, lungeSpeed: 150, lungeTime: 0.32, recover: 0.6, litReach: 0.6, shaftReach: 0.7, cooldown: 1.4, knock: 0.5, part: 'spore', barY: 22 },
    // the Gear Hound (Clockwork Vault) winds its key for windup s, showing
    // its run and where it will glance off the walls, then runs at
    // dashSpeed for at most dashTime s, ricocheting `bounces` times; then
    // it's spent for `spent` s
    hound: { hp: 34, dmg: 12, speed: 30, radius: 5, range: 96, windup: 0.9, dashSpeed: 165, dashTime: 1.4, bounces: 2, spent: 1.8, cooldown: 0.8, part: 'cog', barY: 17 },
    // (their natures are in `resist`, below, with the rest)
    // the Hollow: what comes when the star's pull is gone. It can't be
    // staggered, and it doesn't stop
    hollow: { hp: 900, dmg: 22, speed: 44, radius: 7, contact: 12, cooldown: 0.9 },
    // the practice target at the outpost: it never fights back or falls
    dummy: { hp: 400, dmg: 0, speed: 0, radius: 6 },
    // the Shard Keepers: a great charger that rings the room with orbs,
    // calls its brood (the Rim's), and leaves magma where it charges (the
    // Underforge's)
    // Each Keeper is a gear check (phase; enemies.js keeperPhaseHit): the
    // Rim's wards itself every `every` s (the Warded shell: Force cracks
    // it, `ward` hits); the Choir's crystal turns all but `shell` of a hit
    // unless it's chilled, when Force shatters it for `shatter`; the
    // Underforge's is wreathed in fire, turning all but `wreath`, until
    // Frost quenches it for `quench` s, when it's open (T.enemies.exposed)
    // and leaves no magma.
    phase: { rim: { every: 16, ward: 3 }, choir: { shell: 0.25, shatter: 2 }, underforge: { wreath: 0.3, quench: 6 } },
    keeper: { hp: 455, enrageAt: 90, enrageSpeed: 1.3, afterPull: 30, dmg: 18, speed: 22, radius: 12, range: 100, windup: 0.75, cooldown: 1.8, chargeSpeed: 130, chargeTime: 0.6, dazed: 1.5, shotSpeed: 70, shots: 12, summonEvery: 7, broodMax: 4, magma: 0.35, magmaR: 18, magmaTime: 4, summon: 2 },
    warden: { hp: 380, dmg: 16, speed: 18, radius: 9, range: 95, windup: 0.75, cooldown: 2.0, chargeSpeed: 125, chargeTime: 0.6, dazed: 1.6, shotSpeed: 65, shots: 10 },
    // a room's enemies: perRoom + perDepth × depth + perBiome × region,
    // give or take one (so some rooms hold none, and a fight is an event)
    perRoom: 0.6, perDepth: 0.2, perBiome: 0.4, maxPerRoom: 3,
    // elites: chance eliteBase + eliteDepth × depth, to eliteMax; elites:
    // how often each affix comes up
    // (an elite on a foe already 1.7× as tough: 1.8× its health and 1.2×
    // its damage, the room's boss rather than a wall; were 2.5 and 1.3)
    eliteBase: 0.05, eliteDepth: 0.04, eliteMax: 0.4, eliteHp: 1.8, eliteDmg: 1.2,
    elites: { fast: 3, tough: 3, volatile: 3, insulated: 2, fireproof: 2, warded: 1.5, shifting: 1.5, frosted: 2, mortar: 2, chained: 2, bulwark: 2, brood: 1.5, hulking: 2, splitter: 2, leech: 2, blink: 1.5, thorns: 2 },
    // how many affixes an elite carries (affixes.js): one, and one more at
    // each level in eliteAffixAt (so two from level 6, three from 11: the
    // second comes once ring 2's gear is in hand, not at its door);
    // eliteEvery: one room in this many holds an elite for sure, with a
    // module for sure
    eliteAffixAt: [6, 11], eliteEvery: 4, eliteSureFrom: 3, // (no sure elite room below this level: the Rim's first steps)
    // each affix's numbers (affixes.js): frosted ground every `every` s, r
    // px, for `time` s, the step at `slow`; a mortar every `every` s within
    // `range`, landing after `wind` s, `r` px round, `dmg` of a bite;
    // bulwark: a shell up for `up` s of `every`; brood: `n` of its kind
    // every `every` s, `most` alive, at `hp` of theirs; hulking: speed and
    // knock; splitter: `n` halves at `hp`; leech: heals `heal` of the hit;
    // blink: every `every` s from `from` px, landing after `wind` s, `dmg`
    // of a bite within `reach`; thorns: `back` of its bite for a close hit;
    // chained: links within `reach` px, `share` of the hit passed on
    affix: {
      frosted: { every: 0.3, r: 9, time: 3.2, slow: 0.5 }, mortar: { every: 4.5, range: 150, wind: 1.1, r: 15, dmg: 0.9 },
      bulwark: { every: 8, up: 3 }, brood: { every: 10, n: 2, most: 4, hp: 0.4 }, hulking: { speed: 0.7, knock: 0.2 },
      splitter: { n: 2, hp: 0.45 }, leech: { heal: 0.6 }, blink: { every: 6, from: 44, wind: 0.35, reach: 12, dmg: 0.6 },
      thorns: { back: 0.3 }, chained: { reach: 90, share: 0.5 },
    },
    fast: 1.5, tough: 1.6, volatileRadius: 26, volatileDmg: 1.5, volatileFuse: 0.6,
    // a warded elite resists everything until wardHits Force hits (a heavy
    // one counts two) break its shell; a shifting one's weakness moves to
    // the next element every shiftEvery s
    wardHits: 3, shiftEvery: 6,
    // What each kind is weak to (W), resists (R) or all but shrugs off (I),
    // by element (missing: neither). natures.js reads it: elementMultFor.
    resist: {
      crawler: { ember: 'W' }, // a chitin shell, dry inside
      // (no kind met with the starting rig's plain Force resists Force: at
      // 0.3 that was a wall for a fresh player, a wisp taking a dozen hits)
      wisp: { shock: 'R', blight: 'I' }, // no body, all ether
      construct: { blight: 'W' }, // the stalker: living, thin-shelled
      snapjaw: { frost: 'R', ember: 'W', blight: 'R' }, // living plants
      spitter: { frost: 'R', ember: 'W', blight: 'R' },
      hollow: { force: 'R', shock: 'R', frost: 'R', ember: 'R', blight: 'R' }, // the living dark
      // each clime's own creature (foes.js)
      skink: { frost: 'W', ember: 'R' }, tusker: { ember: 'W', blight: 'W', frost: 'R' }, wraith: { frost: 'W', ember: 'R' }, lurker: { ember: 'W', blight: 'R' },
      dropper: { force: 'W', shock: 'R' }, eel: { shock: 'W', blight: 'W', ember: 'R' }, crab: { frost: 'W', ember: 'R' }, weaver: { ember: 'W', blight: 'R' }, // (the crab's shell stands in for a Force resistance)
      sentinel: { shock: 'W', blight: 'R' }, idol: { force: 'W', frost: 'R' }, hound: { shock: 'W', force: 'R' },
    },
    // the warden and the Keepers: one weakness and one resistance, by region
    regionResist: {
      rim: { ember: 'W', blight: 'R' }, // fungal, and full of spores
      choir: { force: 'W', frost: 'R' }, // crystal that cracks, and is cold
      underforge: { frost: 'W', ember: 'R' }, // slag that's brittle in the cold
    },
    // what an elite's affix adds: it replaces the kind's own
    eliteResist: { insulated: { shock: 'I' }, fireproof: { ember: 'I' } },
    // the Hollow loses every resistance within hollowLight px of a lit
    // lodeline (for now; kindled light, later)
    hollowLight: 40,
    // the warden appears from bossDepth, in a side room, by chance
    bossDepth: 3, bossChance: 0.25,
    // the dark grows as the star does: in dark land (and under it) foes
    // are at least the level of the highest territory kindled, less this
    darkLag: 4,
  },

  // Drops. Enemies leave their own parts (part: the chance; partTwo: the
  // chance of a second), elites and the warden more, and now and then an
  // exotic or a sealed relic (it opens into a legendary core); and cores
  // (T.cores). Bases come from the forge. motes heal.
  // (with half the enemies, each kill pays about twice: part, partTwo,
  // exotic, relic and mote are set so a sortie's haul is what it was)
  // What a kill leaves (combat.js killDrops): part, the chance an ordinary
  // kill leaves an ore of its land; an elite eliteOre [least, most] of it, a
  // warden or a Keeper bossOre of each of its land's two. mote: a mote
  // heals moteShare of the health, moteHeal at least.
  loot: {
    part: 0.8, eliteOre: [2, 4], bossOre: 6,
    mote: 0.4, moteHeal: 14, moteShare: 0.15,
  },

  // Gear. Base numbers at tier 1, times tierGrowth a tier (affixes grow by
  // affixGrowth a tier). Each kind's crafting cost is in ore of its tier
  // (a pick is made from the ore it's named for, and breaks the next one).
  items: {
    tierGrowth: 1.28, affixGrowth: 0.3, gradeBoost: 0.2, // a part's grade over 1 strengthens what it binds
    caster: { power: 6 },
    armor: { armor: 4, armorGrowth: 0.75, hp: 16, hpGrowth: 1.35, cost: 10 },
    charm: { cost: 6 }, pick: { speedGrowth: 0.12, cost: 12 },
    armorK: 50, // damage taken × armorK / (armorK + armor)
  },
  // Caps on what affixes can add up to.
  caps: { crit: 50, castSpeed: 100, moveSpeed: 50, leech: 15, shock: 60, chill: 60, oreLuck: 100, mineSpeed: 200 },

  // Salvaging a crafted base gives back `back` of its ore (its modules come
  // out whole), and an exotic now and then.
  salvage: { back: 0.4, exotic: 0.15, exoticRare: 0.5 },

  // Crafted bases (blueprints.js, items.js). Exact: the recipe and its
  // ore's tier set the stats (and a rig frame's slots: T.circuits.rig), and
  // the anvil only adds. stat: how much more of its base numbers, by the
  // anvil's quality (rough, fair, fine, masterwork); a masterwork frame has
  // the extra slot.
  gear: { stat: [0, 0.05, 0.1, 0.15] },
  // Cores (patterns.js): a core is its kind and its tier, and nothing
  // rolls. Set in the rig's spells, free to swap at home; nothing else
  // takes them.
  //   elite: the chance an elite leaves the core its first affix names.
  //   legend: how many legendary cores a warden (boss) and a Keeper leave:
  //     any kind (kinds: the odds of a Form, an Element or a Mod), with a
  //     power, found and never made.
  //   merge: this many plain cores of a kind and tier fold into one a tier
  //     denser at the tuning bench. salvage: ore of a core's tier for a
  //     spare one.
  cores: {
    elite: 1, legend: { boss: 1, keeper: 1 },
    kinds: { form: 3, element: 3, glyph: 2 },
    merge: 3, salvage: { ore: 2 },
  },
  // Patterns (patterns.js): what the suit reads from each kind of creature
  // as it falls. scans: reads of a kind before the replicator knows its
  // pattern; an elite counts `elite`, a boss all; lens: the Capture Lens,
  // made, reads this many times as fast. known: the kinds the Charter's
  // survey read before the landing, known from the first day. parts: printing a pattern onto a
  // core takes this many of the creature's parts. roll: where in the
  // bonus's range a printed pattern stands (0–1); master: times this from a
  // masterwork forge. threadOre: an older save's threads become one Lumenite
  // each this many.
  patterns: { scans: 4, elite: 2, lens: 1.5, parts: 3, roll: 0.8, master: 1.25, threadOre: 3, known: ['crawler'] },

  // The Lodestar grows from deeds, not ore (deeds.js): each deed gives
  // light, motes of it, carried home and fed to the star at its altar, a
  // point each. Magnitude n needs levels[n - 1] points in all. Each level
  // past the first is an attunement point and a Deep's lodelines a little
  // likelier. ringMag: the magnitude a spire needs, by ring: the star's light
  // must reach that far before a spire can hold there. (Kindling every
  // territory of a ring, with its Keeper's lair reached, always reaches the
  // next ring's: never stuck.) scale: what this scale is, in the save
  // (deeds.js rescales an older star, keeping its magnitude).
  // feed: holding FEED THE STAR at the altar (hub.js). The light leaves the
  // stash a mote at a time, deeplight first and heartlight last, rate0 a
  // second at the start, climbing to rateMax over ramp s of holding (eased
  // in, so a tap gives one). Moving on to the next kind, the flow rests for
  // beat s and falls back to beatRamp of the way up. fly: s for a mote to
  // rise from the Kindler to the star; arc: world px its path bows up over
  // the altar's bowl. hum: how much each landing brightens the star (it
  // fades at humFade a second). lights: at most this many rising motes
  // carry a light of their own.
  // The Lodestar in the world (star.js; docs/VEINS.md). clear: the ground
  // opened round it (tiles, flattened by squash); hang: how high over its
  // ground point the heart hangs (tiles); standOff: where the Kindler
  // wakes, south of it (tiles). lightR: how far its light lies on the land
  // (tiles), lightPerMag more each magnitude, fading out over lightFade
  // tiles past that. core: the pieces of its core (a fall takes one; at
  // none the star goes out). heart: how many times the seed's size the
  // heart is drawn, small to magnitude bigFrom and big after. pool: its
  // light on the ground [at magnitude 0, more each] (tiles) and strength;
  // heartLight: the heart's own.
  star: {
    clear: 7, squash: 0.82, hang: 2.4, standOff: 3,
    lightR: 9, lightPerMag: 1.5, lightFade: 4, core: 7,
    heart: { small: 3, big: 4, bigFrom: 4 },
    pool: { r: [7, 0.8], i: 1.0 },
    heartLight: { r: [6, 1.1], i: [1.1, 0.08] },
  },
  // One bar (game.js updateBar): your light is your health. In light it
  // fills from empty in `fill` seconds; in the dark it drains in
  // T.world.light.
  bar: { fill: 4 },
  // The world's one map (game.js generateWorld): the generator's depth and
  // clime, and overrides of its numbers.
  worldgen: { depth: 1, clime: null, over: { w: 320, h: 320, rooms: [230, 270] } },
  // The Veins (veins.js). band: the light either side of a living vein and
  // round a node (tiles), by magnitude; thread: how far a thread reaches
  // (tiles), by magnitude; threadSpeed: the step with it in hand; wave: s
  // of threading between the dark waking along it, waveN each; step: px
  // between the thread's points; reach: how near a node to take up (tiles),
  // joinReach to join one, nodeGap the least between nodes; hold: the
  // hold's seconds [by the star, at the far reaches], join a dark node's;
  // nodeLight: a held node's own light, bitten `bite` of a creature's
  // damage a second within biteReach px of it; holdWave: s between the
  // dark's waves at a hold; light: the baked light along a vein (every so
  // many tiles) and at a node.
  veins: {
    band: [5, 5, 6, 6, 7, 8, 8], thread: [60, 80, 100, 120, 140, 170, 200], threadSpeed: 0.85, wave: 30, waveN: 1, step: 6,
    reach: 2.2, joinReach: 1.6, nodeGap: 6, hold: [45, 90], join: 20, relight: 30, nodeLight: 100, bite: 0.4, biteReach: 14, holdWave: 12,
    // old: the old Kindlers' dead nodes, n of them, far [least, most] tiles from the star
    old: { n: 6, far: [50, 120] },
    light: { every: 2, vein: 0.45, node: 0.9 },
  },
  // Magnitude (veins.js): the thresholds of the world's living light (vein
  // tiles, plus nodeWorth a living node), and what a cast hits at each.
  magnitude: { at: [0, 150, 400, 800, 1400, 2200, 3200], power: [1, 1.25, 1.5, 1.8, 2.1, 2.5, 3], nodeWorth: 20 },
  // Shapes (shapes.js): kills of a kind before its shape is read (an elite
  // counts two), and the magnitudes at which the star offers one of its own.
  shapes: { kills: 6, starAt: [2, 4, 6] },
  // The dark cuts veins while you're away (veins.js veinsCutOnReturn): one
  // for each `every` hours, at most `most` waiting; it picks veins far from
  // the star for choice. The Hollow stands at a cut's dark end.
  cuts: { every: 8, most: 2 },
  // Deeds (deeds.js): the light each gives the star. heart: heartlight for
  // kindling a territory, by ring; bound to the Kindler the moment the spire
  // stands, safe from any fall. deepEnd: deeplight for first reaching a
  // Deep's last site (its deep vein, or its Keeper's lair), by ring, and
  // deepSite more for each site past the first; forge: for each ancient
  // forge found; echo: for each echo. Deeplight rides in the cargo, so a
  // fall leaves it in the pack. (A Keeper's shard,
  // set at the altar, is T.story.shardStar.)
  // cache: a fall leaves the whole cargo where it fell, the Kindler's pack; walking
  // within `reach` px of it picks it up. beacon: its light (tiles, strength).
  deeds: {
    heart: [0, 12, 16, 24, 32], deepEnd: [0, 8, 12, 16, 20], deepSite: 4, forge: 4, echo: 8, coldSpire: 10,
    cache: { reach: 14, beacon: [1.6, 0.6] },
  },
  // Supplies (supplies.js): two kinds, made from ore at home (SUPPLIES at
  // the fabricator) or from the ore carried (MAKE, in the cargo). most: how
  // many of each can be carried; they're on the belt, safe whatever
  // happens, and spent when used. cost: what one takes of an ore, by the
  // ore's tier (Ferrite 6 ... Starmetal 1); it's paid in the plainest ore
  // there's enough of. Each Refinery level makes both stronger (no Refinery,
  // then levels 1 to 3: T.structures.refinery):
  //   injector: heals heal[level] of your health.
  //   cell: gives back light[level] of your light (dark land and Deeps).
  // refund: an old save's Flares, Ward Cells and Blast Charges come back as
  // this much of each grade's plainer ore (Ferrite, Resonite, Sigilite).
  supplies: {
    most: 4, cost: [6, 4, 3, 2, 2, 1],
    injector: { heal: [0.35, 0.5, 0.65, 0.8] },
    cell: { light: [0.3, 0.4, 0.5, 0.6] },
    refund: 5,
  },
  // The story (story.js): each region's Keeper waits in its lair, at the end
  // of its ring's furthest Deep, holding a shard of a star that went dark;
  // each shard set in the Lodestar adds shardStar points of light. An echo (a log of
  // the Kindlers before) turns up by an ancient forge, from an elite now and
  // then, and from every Keeper.
  //   turnEcho: from this many echoes read, the star's lines have heard.
  // The Meridian's sleepers wait in orbit until the star is whole (the
  // Spectrum, below); nobody comes down before.
  //   sleepers: how many sleep aboard the Meridian (the uplink says so).
  story: {
    shardStar: 40, echoForge: 0.5, echoElite: 0.05, turnEcho: 5, sleepers: 4000,
  },
  // The Spectrum (spectrum.js): the star's light has a band for each ore,
  // and a band's depth is how much of that ore has been given at the altar:
  // depths[d] ore reaches depth d. Depth 1 of a land's band lets the star
  // kindle that land (the Choir's is Resonite, the Underforge's Sigilite,
  // the Edge's Starmetal; the Rim's land needs nothing it didn't land
  // knowing). mark: the depth the Meridian's spec asks of every band, the
  // light the colony can live under; the star is whole when all six stand
  // there. startIron: the Iron the survey taught it, so it lands at depth 1.
  spectrum: { depths: [0, 8, 24, 60, 120, 200], mark: 4, startIron: 8 },
  // Home, the inside of the star (floor.js HOLLOW, hubground.js, hub.js):
  //   glass: the floor's tones, dark to light (amber glass over light);
  //   skin: the skin's, from its inner edge to the white wall; sectors and
  //   bands (tiles) cut the floor into facets; hot: the floor's colour
  //   under the heart, to hotR tiles, hotMix how far it goes; passage: how
  //   wide (tiles, each side of a way out's line) the skin stands open.
  //   heart: how many times the seed's size the heart is drawn, small
  //   until magnitude bigFrom, big after. light: the heart's pool on the
  //   floor [tiles at magnitude 0, more each magnitude] and its strength,
  //   and the skin's lights (how many, each one's reach in tiles, its
  //   strength).
  hollow: {
    glass: ['#2a1c0c', '#3a2810', '#4a3414', '#5a4018', '#6a4c1c', '#7a5a22'],
    skin: ['#8a6a22', '#b88a44', '#e4b64a', '#f6e7b0', '#fff7dc'],
    sectors: 24, bands: [5, 10, 15], hot: '#fff7dc', hotR: 4.5, hotMix: 0.35, passage: 1.7,
    heart: { small: 3, big: 4, bigFrom: 4 },
    light: { pool: [7, 0.8], poolI: 1.0, skinN: 16, skinR: 5, skinI: 0.8 },
  },
  // Facets (facets.js): extraAt, the magnitude at which each of a cast's
  // two extra facets opens (a Turn or a Reading beside its Shape and Band).
  facets: { extraAt: [2, 4] },
  // The Splinter (facets.js latticeK, diver.js kdLattice): the suit is a
  // lattice of hard light projected from a shard of the star at the
  // sternum, and armour is light: the lattice (the plate's armour) holds
  // `floor` of itself with your light gone, all of itself in the light.
  // lines: the lattice's spacing (px of the figure) at magnitude 1, and the
  // least it closes to as the star grows a line a magnitude; alpha, how
  // strongly it's drawn at full light. thinAt: the light at which Wick
  // first says it's thinning.
  splinter: { floor: 0.35, lines: [10, 6], alpha: 0.7, thinAt: 0.6 },
  // Ore in the field (field.js): plant, a pocket of the star's light for
  // `cost` of the land's ore, `r` tiles across, `time` s, filling your
  // light `refill` a second in it; surge, `cost` of a cast's band's ore for
  // the next cast `mult` harder; spire, the land's first ore a spire is
  // raised from; nightglass, the chance an elite leaves night-glass (the
  // Hollow always do); umbraDim, how much each depth of the seventh band
  // dims the day at home.
  field: { plant: { cost: 4, r: 4, time: 90, refill: 0.25 }, surge: { cost: 3, mult: 1.35 }, spire: 6, nightglass: 0.3, umbraDim: 0.05 },
  // Kindled land terraforming by the light (terraform.js): the starstone
  // spreading from a territory's spire, reach [tiles at magnitude 1, more
  // each magnitude], its shape as the outpost's ground's (T.outpost.ground),
  // stoneMix how far the land's ground goes to lodestone on it;
  // bloom: how far past the stone the ground greens, as a multiple of the
  // stone's reach, bloomK the share of strokes that take it at the stone's
  // edge, bloomPow how it thins outward, greenMix how far a stroke goes to
  // `green`; veinOut: the share of the gold veins that run on past the
  // stone, at its edge; mote: the chance a greened pixel is a lit mote of
  // `gold`;
  // flora: how much thicker what grows there grows; sparks: sparks of light
  // a second rising off the stone.
  terraform: {
    stoneW: 2.5, bloomOut: 3, stoneMix: 0.6, wander: 1.2, wobble: [60, 22], tendril: [2.8, 0.9, 34], vein: [30, 13, 11, 6], veinCut: [0.965, 0.975], front: 0.09, glint: [0.35, 0.5],
    bloom: 3.2, bloomK: 0.6, bloomPow: 1.3, greenMix: 0.42, green: '#5c8a3c', gold: '#f0c050', veinOut: 0.9, mote: 0.012, flora: 1.4, sparks: 3,
  },
  // By an ancient forge, the chance a legendary core lies, left by whoever
  // worked it (how often one stands is the zone's).
  fieldForge: { core: 0.35 },
  // The anvil: three strikes, each a marker sweeping a bar at `speeds`
  // (sweeps a second), slowed to `drag` of that while it's over the zone.
  // A strike inside the zone (`zone` of the bar wide, narrowing by `shrink`
  // a strike) is good; inside its middle `perfect` of it, perfect. Quality
  // (perfect 1, good 0.5, summed, rounded down) is rough, fair, fine or
  // masterwork, and only ever adds to the recipe (T.gear: stat, sockets, a
  // frame's second Mod slot); a fine forge or better makes a core a tier
  // higher.
  // Made kinder after the designer found it hard (it was speeds 0.9, 1.25,
  // 1.6, zone 0.26, shrink 0.04, no drag). The good window is now about
  // 500, 350 and 250 ms, strike by strike (was 290, 175, 110), so most
  // strikes land good; the perfect one about 125, 90 and 65 ms (was 85,
  // 55, 35, with perfect 0.3), so three in a row is still rare.
  anvil: {
    speeds: [0.75, 0.95, 1.15], drag: 0.75, zone: 0.28, shrink: 0.03, perfect: 0.25,
  },
  attune: {
    vitality: { name: 'Vitality', text: '+15 max health', max: 5, maxHp: 15 },
    proximity: { name: 'Proximity', text: '+8% close spell damage', max: 5, closeDmg: 8 },
    clarity: { name: 'Clarity', text: '+8% spell damage', max: 5, spellDmg: 8 },
    stride: { name: 'Stride', text: '+5% move speed', max: 5, moveSpeed: 5 },
  },

  // The art's look, "A+" (art.js; DECISIONS.md, 2026-10-18). Visual only.
  //   px: art pixels to a world pixel. The world (TILE, every body, reach
  //     and speed) is in world px; the art is drawn at px art px to each,
  //     so 1.5 is 24 art px to a 16 px tile. Sprites' letter grids are
  //     enlarged by it before they're shaded, floors are painted at it, and
  //     every distance below in px is multiplied by it.
  //   tones: the most tones of one material on one sprite, chosen by form
  //     (light from the top left), never spread as a gradient.
  //   hueShift: [shadows, lights, richer]: how far a ramp's darkest tone
  //     leans to violet (hue `violet`) and its lightest to warm gold (hue
  //     `gold`), 0-1, falling to nothing at the middle tone (a cool hue's
  //     lights stay cool), and the middle tones' extra saturation.
  //     groundHue: the same, softer, for the ground, rock and faces.
  //   form: how a sprite is shaded. edge: the radius (px) of the rounding
  //     at its silhouette; body: the share of the sprite's own size over
  //     which the whole of it is rounded; part: the rounding (px) of each
  //     material's patch; depth: how steeply rounded; light, shade: how far
  //     the lit and the turned-away sides move from the base tone; fall:
  //     how much darker its foot is than its head; crease: the shadow
  //     under a different material.
  //   dither: ordered dithering in sprites (A+: none).
  //   outline: by kind of sprite: 'black' (ART.outline), 'selout' (a much
  //     darker shade of the colour inside it) or 'none'. creature: the
  //     diver, enemies, critters; prop: flora, stations, portals, icons.
  //     selout: how dark a sel-out is, a share of the colour inside.
  //   cluster: the ground's texture, in clumps of light and dark: patch
  //     and grain (px across), and cut (how far the noise must swing from
  //     the middle before a clump takes the light or dark tone; higher
  //     means fewer, smaller clumps). rockCut: the same on rock tops.
  //   sunGround: the ground under the sky, kept calm so what stands on it
  //     stands out: soften, how far its dark and light clumps are drawn
  //     towards its middle tone (0-1), and cut, as cluster.cut.
  //   groundDither: ordered dithering at the edges of the ground's large
  //     gradients (wall shadows, the rift's wash).
  //   lightSteps: the light's bands for each 1.0 of light (fine, so a light
  //     reads as a soft glow, not rings: at 5, even a faint light's tail
  //     was a whole band); lightDither: how much of each step's edge is
  //     dithered (0 hard, 1 the whole step).
  //   lampPerPixel: each pixel's light read off a slope through its cell
  //     (render.js, lightScene), so the bands' edges move a pixel at a time
  //     as the diver walks rather than a cell (3 art px) at a time.
  //   steadyCam: the camera follows the diver's whole art px, so he stays
  //     on one pixel of the view as he walks (on a view an odd number of
  //     pixels across he wobbled a pixel either side).
  art: {
    px: 1.5, tones: 4, hueShift: [0.2, 0.3, 0.05], violet: 255, gold: 50, groundHue: [0.1, 0.1, 0],
    form: { edge: 1.5, body: 0.3, part: 2, depth: 1.6, light: 0.5, shade: 0.32, fall: 0.1, crease: 0.24 },
    dither: false, outline: { creature: 'black', prop: 'selout' }, selout: 0.42,
    cluster: { patch: 9, grain: 3, cut: 0.32 }, rockCut: 0.34, sunGround: { soften: 0.55, cut: 0.4 }, groundDither: true,
    lightSteps: 16, lightDither: 0, lampPerPixel: true, steadyCam: true,
  },
  // The painted style (paint.js, docs/PAINTED.md). All in art px.
  //   ramp: a clime's colours stretched to stroke ramps: dark, the two
  //     deeper tones' pull towards violet black; light, the two lighter
  //     ones' towards warm gold (rock: towards its rim colour).
  //   stroke: how a row's 8 px cells are cut: whole, the share left as one
  //     stroke; one, the share cut once (the rest twice).
  //   ground: base, the middle of the value (0-1) on its 7-tone ramp;
  //     swell [size, amount], a broad rise and fall; patch [across, down],
  //     the streaky lit patches' noise, patchCut where they begin and are
  //     full, patchSky/patchCave how much they lift; clump, the old
  //     clusters' share; foot, how far (px) a wall's foot darkens, footHard
  //     the hard line, footAmt its falloff; side, beside a wall; sunDir
  //     the step (px) towards the sun, sunSteps how many, sunSlope how
  //     much higher the rock must stand each step to shade, sunDark;
  //     jitter, the strokes' tone jitter.
  //   wall: the rock's height: face, how high its front rises; edge, how
  //     far in (px) it takes to rise (steep, then rounding over); bump and
  //     bumpScale, boulders on top; ramp, how far in they grow to full.
  //   rock: light [x, y, z], from the upper left; steep, the rise (px a px
  //     north) where a top turns into a face and where it is one; a top's value from its
  //     slope to the light (lamLo, the slope that's darkest), laid from
  //     topLo to topHi on its 10-tone ramp; a face's (faceBase, + faceUp
  //     at its full height, + faceWest turned to the light) from faceLo to
  //     faceHi; jitter; strata, the share of 16 px cells along a face row
  //     with a long darker (or lighter) stroke; crease, how far below its
  //     neighbours a point lies to be a soot crease; rim, the top edge's
  //     tone, lip where a top turns down into a face, foot the face's foot.
  //   slab: the cells rock is broken into (w × h), wobble of their edges;
  //     tone, each slab's offset; lip, the lift of its top row; crack, the
  //     tone of its bottom row; gate, how much of the lips and cracks
  //     is broken off (noise below it).
  //   occlude: draw the rock back over sprites behind it.
  //   lazy: a floor is painted in chunks as the view nears them: near,
  //     the margin (tiles) round the view painted before a frame; far, the
  //     margin painted as time allows, budget ms a frame, out from lead
  //     world px ahead of where the diver is heading; arrive, the budget
  //     a frame for the view still behind the iris while it opens.
  paint: {
    // shade (pshadow.js): the shadows baked into the ground's tones, as how
    // far each lowers its light value (0-1, as ground.sunDark): sun, by day
    // (times the daylight), for a stand's blades stand; light, from a fixed
    // light (times its share there); home, at the outpost (from its
    // lanterns); edge, at a silhouette's edge. contact: under a plant's foot
    // [small, middling, tall], pad (px past its foot's span), ry [least,
    // most] its depth, at [x, y] from the foot, fall (how softly it fades
    // out); cover: under a tuft or a stand's blade, coverPad, coverRy.
    shade: { mul: 0.75, sun: 0.32, stand: 0.6, light: 0.3, home: 0.6, edge: [1.5, 0.05], contact: [0.16, 0.24, 0.3], contactPad: [1, 2, 3], contactRy: [2.5, 4.5], contactAt: [0.5, 0.5], contactFall: 0.7, cover: 0.14, coverPad: 0.5, coverRy: 1.6 },
    lazy: { near: 2, far: 7, budget: 3, arrive: 12, lead: 96 },
    // window: the part of the floor whose painted pixels are kept (paint.js
    // PWIN), tiles square at [the coarse grain, FINE GRAIN]; it moves when
    // the view comes within `margin` tiles of its edge.
    window: { tiles: [64, 48], margin: 10 },
    ramp: { dark: [0.62, 0.3], light: [0.14, 0.28], rock: { dark: [0.6, 0.3], light: [0.3, 0.6] } },
    rampEven: { ground: { deep: 0.45, high: 0.24, gamma: 1 }, rock: { deep: 0.55, high: 0.45, gamma: 1.15 }, darkAt: [0.95, 0.42], liftGround: [0.7, 1.2], liftRock: [1.3, 2.2], under: [0.38, 8] },
    stroke: { whole: 0.12, one: 0.48 },
    // The paint lab's CALM FIELDS (paint.js pntGroundTones): where a broad
    // noise (scale px across and down, plus bias) is over cut, the ground
    // is calm: strokes in cells of `cell`, `whole` of them whole, the tone
    // jitter times jitter; elsewhere times busyJitter. It's cut back to
    // busy at a wall's foot (by feet) and under the baked shadows (by shade
    // times the shadow), where plants and stands are.
    calm: { scale: [48, 30], bias: 0.08, cut: 0.5, cell: 16, whole: 0.6, jitter: 0.2, busyJitter: 1.3, feet: 0.6, shade: 1.2 },
    // The paint lab's BRUSH and FINISH (pntBrush): today's numbers, each
    // brush's over them, then the finish's. cell: the strokes' cell (px);
    // whole, one: the shares of cells left whole and cut once; jitter:
    // times the ground's and rock's own; rows: a stroke's height; gTones,
    // rTones: the ground's and the rock's ramps (the rock's numbers above
    // are given for 10 and scaled). flat: hard, the lit patches cut hard.
    // ink: hatch, soot hatched over the shadows under hatchAt[0] of the
    // ramp, crossed under hatchAt[1]. wash: many tones, the light's bands
    // left as they are. dab: short dabs, as tall as they're wide. contour:
    // the ground's strokes follow the land (T.paint.contour).
    brush: {
      today: { cell: 8, jitter: 1, rows: 1, gTones: 7, rTones: 10 },
      broad: { cell: 14, whole: 0.4, one: 0.4, jitter: 0.8, rows: 2, gTones: 5, rTones: 7 },
      fine: { cell: 5, whole: 0.05, one: 0.45, jitter: 1.3, rows: 1, gTones: 9, rTones: 13 },
      dab: { cell: 4, whole: 1, one: 0, jitter: 1.4, rows: 3 },
      contour: { contour: true },
    },
    // The CONTOUR brush (pntContourTones): the ground's strokes run along
    // the land, round the foot of rock and along the open ground's slow
    // drift. The rock's pull: how much of it is in each block (block px),
    // blurred over blur blocks either side (twice), its edge's tangent
    // weighted by pull; elsewhere a drift (noise wander px across, turning
    // up to turn radians off level). Each pixel's tone is the average along
    // a line `reach` px either way through it, of the value and of a grain
    // in cells of `cell` px (times gain, in tones of a ground of 7). With BROKEN
    // COLOUR, a streak whose grain is over hueAt from the middle is warm
    // (under, cool).
    contour: { block: 6, blur: 3, margin: 48, pull: 12, wander: 70, turn: 0.7, reach: 5, cell: 2, gain: 9, hueAt: 0.06 },
    // The paint lab's IMPASTO (pntGroundTones, pntPaintRock): a stroke's
    // left end stands up hi tones and (on the ground) its right end sinks
    // lo, on `share` of the strokes at least `min` px long; on the rock only
    // the tops. Given for a ground of 7 tones (the rock's for 10), scaled.
    impasto: { hi: 1, lo: 1, share: 0.7, min: 4 },
    // The paint lab's BROKEN COLOUR (pntLook): `share` of the strokes take
    // a warm or a cool hue of the same lightness, `amt` of the way to each
    // tint.
    broken: { share: 0.6, amt: 0.5, warm: [1.3, 1.0, 0.62], cool: [0.7, 0.95, 1.35] },
    // The paint lab's BOUNCE (pntPaintRock): the lit ground's colour thrown
    // up a face's foot, `amt` of the ground's tone `tone` (its share of the
    // ramp) mixed in, `foot` of that on the soot row and the most `peak` px
    // up, fading out `reach` px up.
    bounce: { amt: 0.42, tone: 0.75, reach: 9, foot: 0.45, peak: 3 },
    // The paint lab's LIVING PAINT (render.js livePaint): a figure's strokes
    // shift a pixel now and then, `fps` times a second through `frames`
    // pictures (the first as drawn), `share` of its pixels taking a
    // neighbour's colour in each.
    live: { fps: 5, frames: 3, share: 0.16 },
    finish: {
      paint: {},
      flat: { cell: 16, whole: 0.85, one: 0.1, jitter: 0, gTones: 4, rTones: 5, hard: true },
      ink: { gTones: 5, rTones: 6, jitter: 0.5, hatch: true, hatchAt: [0.42, 0.22] },
      wash: { cell: 10, whole: 0.2, jitter: 0.4, gTones: 14, rTones: 20 },
    },
    // The paint lab's FORM STROKES (pntPaintRock, pntSlabs): on a face the
    // strokes run down, in runs `run` px tall (each column set off by its
    // own phase), the tone read at the run's middle; on a top, each
    // boulder's crown (where its dome stands over planeAt of its height) is
    // one plane, lit as a facet is; a crease gets a lit twin a pixel to its
    // upper left, tone crackLit (of 10).
    form: { run: 5, planeAt: 0.72, crackLit: 7 },
    ground: { base: 0.45, swell: 70, swellAmt: 0.2, patch: [64, 11], patchCut: [0.52, 0.62], patchSky: 0.36, patchCave: 0.32, clump: 0.06, foot: 7, footHard: 1, footAmt: 0.3, side: 0.1, sunDir: [2, 3], sunSteps: 9, sunSlope: 3.2, sunDark: 0.32, jitter: 0.62 },
    wall: { face: 22, edge: 5, bump: 16, bumpScale: 34, ramp: 9, boulder: 76, boulderR: [0.5, 0.95], boulderFlat: 1.6, rough: 0.2 },
    rock: { light: [-0.55, -0.45, 0.7], steep: [0.8, 2.2], lamLo: 0.2, topLo: 1.5, topHi: 6.6, faceBase: 0.15, faceUp: 0.55, faceWest: 0.3, faceLo: 1.5, faceHi: 5.5, jitter: 1.1, strata: 0.5, strataAmt: 1.6, crease: 1.6, creaseR: 3, rim: 8, rimLit: 0.6, lip: 7, foot: 0 },
    // big: the big planes, where a broad noise (s px across and down) is
    // over cut: a coarser grid k times the slab's, its cracks gated harder.
    // mason: a ruin's rock (a paved look) as dressed blocks instead: w, h a
    // block (px), jit how far a course's joints shift, its joints' gate and
    // side (as the slab's), tone, flat (as facet.flat), gone: the share of
    // blocks fallen out (soot).
    slab: { w: 34, h: 13, wobble: 0.8, tone: 0.35, lip: 1.5, crack: 0, side: 0.12, gate: 0.56, gateS: [14, 4], big: { cut: 0.55, k: [2.6, 2.4], s: [110, 70], gate: 0.75 }, mason: { w: 18, h: 8, jit: 5, gate: 0.2, side: 0.9, tone: 0.6, flat: 0.85, gone: 0.025 } },
    facet: { keep: 0.5, tilt: 0.2, smooth: 5, relief: 2, flat: 0.55 },
    occlude: true,
    // fx (castfx.js): a cast's light on the ground as strokes of its
    // colour, lightR its reach (a share of the light's), lightA how strongly;
    // arc, an Arc's crescent's thickness at its thickest (art px), light and
    // heavy.
    fx: { lightR: 0.42, lightA: 0.8, arc: [6, 8.5] },
    // hub (hubart.js, hub.js): the outpost's press keeps a beat of beat s:
    // its ram rests on the work after it strikes (rest, a share of the
    // beat, while the sparks fly), rises (rise), waits while the smith
    // pushes the lever over (wait), and comes down hard in what's left.
    // old: an ancient forge's cold light, [reach (tiles), strength], and how
    // fast it breathes (rad/s) and by how much.
    hub: { press: { beat: 1.5, rest: 0.16, rise: 0.46, wait: 0.26 }, old: { light: [1.8, 0.75], breath: 1.3, breathAmt: 0.15 } },
    // site (hubground.js): the outpost's ground. tear: where the land beyond
    // comes in, its border torn by two noises ([across, down] px, each) by
    // tearAmt. squash: how much a circle on the ground is flattened by the
    // camera. deck: a landing pad's plates, lodestone: the starstone in the
    // ground, seven tones each (by the ground's tone); vein: its gold, dark
    // to light. mark: the amber of a pad's ring [dark, light]; star: the
    // seed-star's [dark, light]; lamp: a pad's landing lights. padR: a pad's
    // radius (tiles). pathW: a trodden track's half width (tiles), trod how
    // dark it wears the earth.
    site: {
      tear: [9, 3, 30, 10], tearAmt: 0.85, squash: 0.72,
      deck: ['#232833', '#2d3340', '#383f4d', '#444c5b', '#515a6a', '#5e6879', '#6e7889'],
      lodestone: ['#13141b', '#1b1e27', '#242833', '#2e3340', '#3a404d', '#474e5c', '#58606f'],
      vein: ['#3e3424', '#6e5a34', '#a68a4e', '#d8bc76', '#fff0c0'],
      mark: [[150, 104, 40], [214, 160, 66]], star: [[200, 180, 130], [238, 222, 176]], lamp: '#ffc860',
      padR: 2.2, pathW: 0.9, trod: 0.72,
    },
    // hole (painthole.js): what lies below the floor. depth: how far down a
    // hazard's surface lies (art px), shade how far (a share of it) its
    // banks shade it from the light. A far wall: bank (a pool's, cut in
    // the ground, on the ground's ramp): [its tone at the lip, at the foot,
    // how much lighter turned to the light]; wallPow how fast it darkens; jitter, strata,
    // strataAmt as the rock's faces'; plane: the upright planes it breaks
    // into [px across, how far their tones differ]; crack: [the share of
    // their borders cracked, a crack's length]; lipTone: the far lip's
    // least tone [a wall's, a bank's]; wet, foot: how many rows of a bank's
    // foot are a wet dark band (at water or ice), and its most tone; lip: how many tones lighter the near rim's ground; lavaLift,
    // lavaLick: how much lava lights its bank, and the share of the bank's
    // foot laid in its colour's strokes; vent: how tall a vent's throat's far wall (px); wade: how much of a walker in a pool
    // or lava is under its surface (art px), wadeEase how fast it steps down.
    hole: { depth: { pool: 12, burn: 11, slick: 7 }, shade: 0.6, bank: [3.6, 1.2, 1.2], wet: 2, wallPow: 0.9, jitter: 0.45, strata: 0.45, strataAmt: 1.3, plane: [9, 0.7], crack: [0.3, 16], lipTone: [6.5, 5.5], foot: 0.5, lip: 3, lavaLift: 2, lavaLick: 0.75, vent: 5, wade: 6, wadeEase: 0.25 },
    // flora, props, ore and drops (pflora.js). ramp: a material's stroke
    // ramp (as ramp above); tones: [lo, hi] of the ramp's eight a form's
    // light is laid on; base, light, shade, fall, crease, rim, under: its
    // light value (as T.art.form, plus a lit top-left edge and a shadowed
    // underside); jit, wide, stroke: a stroke's jitter (all of it on a run
    // wide px across or more) and its longest run; clump, clumpH: foliage's
    // clumps (px across, how much they bulge); loose, stray: the share of
    // foliage's edge frayed away (where it's a mass: mass of the 25 px
    // round it), and of strays over it; strand: [foot,
    // tip] of a strand's light; strandForced, strandLo: tones a dark strand
    // gains up it, and its darkest; skirt, skirtLeafy, skirtThin: how much
    // of the shadowed side's rim (where the old outline was) a mass,
    // foliage and a strand keep, in their deepest tones; propJit: a prop's
    // strokes' jitter (pflRepaintProp).
    flora: {
      ramp: { dark: [0.55, 0.25], light: [0.18, 0.36] }, tones: [1, 7],
      base: 0.45, light: 0.55, shade: 0.42, fall: 0.22, crease: 0.22, rim: 0.12, under: 0.3, jit: 0.9, wide: 7, stroke: 5,
      clump: 4, clumpH: 0.45, loose: 0.25, mass: 15, stray: 0.12, strand: [0.1, 0.65], strandForced: 2, strandLo: 3, skirt: 0.9, skirtLeafy: 0.7, skirtThin: 0.5, propJit: 0.4,
    },
    // ore on the rock (pflOreTile): crystals [least, most] a cluster,
    // spread (px either way of its middle), h [the outer ones', the middle
    // ones'] (px), lean (px a px at its edges); flecks of it in the rock.
    ore: { crystals: [3, 4], spread: 5, h: [6, 10], lean: 0.18, flecks: 5 },
    // Creatures (foespaint.js): a dark mass in short strokes, lit from the
    // upper left. A letter grid's tone: base, plus its form's light (light
    // and shade, how far a facing to or from the light moves it), less fall
    // towards its feet and crease under another material, on a ramp of two
    // deeper tones, its own four and a lighter one. run: [least, most] px a
    // stroke; jitter: a stroke's tone, give or take; rim: the chance a lit
    // top edge pixel catches the light (rimHi: the top tone); under: how
    // dark its lowest edge goes. elite: how much of its lit rim takes its
    // affix's colour.
    // read: how a creature is made to read on any ground (fpReadable): top,
    // left, the chance a silhouette px on the light's side catches it, lit
    // drawn that far towards pale; shade, dark: the chance one on the shadow
    // side (or a thin limb) sinks, and how far towards the violet black;
    // glow: how much of its lit rim is laid over the light in the darkest
    // place (times its darkness), drawn glowLit towards pale; shadow: the contact shadow's [rim, core]
    // darkness.
    foes: {
      base: 0.47, light: 0.9, shade: 0.8, depth: 3, fall: 0.16, crease: 0.14, run: [2, 4], jitter: 0.32, rim: 0.85, rimHi: 0.35, under: 1, elite: 0.7,
      read: { top: 0.9, left: 0.6, lit: 0.28, glowLit: 0.6, pale: [255, 236, 200], shade: 0.85, dark: 0.55, glow: 0.7, shadow: [0.4, 0.62] },
    },
    // The Kindler's animation (diver.js kindlerPick): cycle, art px walked
    // Each gait's cycle is its own (diver.js kdCycle: the feet hold the
    // ground; the run's two steps cover 62 authored px, a jog of 2.7 steps
    // a second at the base speed), shortened seen from in front by
    // depthCycle of the view's foreshortening; tread, px a second the legs
    // keep moving against a wall; startAt, the walk's first phase; start,
    // s leant into the first steps; settle, s to the end of each stopping
    // frame; idle, s an idle cycle (a weight shift, two breaths); run, his
    // pace against the base speed past which he runs (the base speed is
    // a jog's: he runs at it, and walks slowed, a half-pressed stick or a
    // Shell's weight) and under which he walks again; turn, rad/s turning
    // between facings; cast, where (of the pose) the wind-back, the strike
    // and the follow-through end; warm, how many of the frames not yet
    // wanted are built a draw (none, the draw one was wanted); glance,
    // standing still: after s he looks about, for len s, every `every` s.
    kindler: { depthCycle: 0.5, tread: 30, startAt: 0.3, start: 0.2, run: [0.92, 0.8], settle: [0.08, 0.17], idle: 3.6, turn: 16, cast: [0.08, 0.32, 0.64], warm: 1, glance: { after: 3, every: 8.5, len: 2.4 } },
  },

  // How flora grows into a place (undergrowth.js; cosmetic, placed from the
  // floor's seed on the render side, so play and generation never change).
  //   Habitat, a tile's suitability: foot (a wall's foot, falling off over
  //     wallReach tiles), nook (3+ walls among the 8 round it), wet (within
  //     wetReach tiles of standing water, plus the set's own wet), light
  //     (within lightReach tiles of lava or a shaft of daylight
  //     underground), base (anywhere); from openFrom tiles off a wall only
  //     openKeep of it is left (more by water), so the middles of open
  //     ground stay clear. narrow: a passage fewer tiles across than this
  //     keeps its middle clear of stands.
  //   drift: the size of a drift of one kind (tiles across a bump of its
  //     noise); cut: how high its noise must be to grow there; fray: how
  //     softly that edge thins out; outlier: the odd one anywhere.
  //   floorP, wallP, ceilP: the most of a tile that grows a floor piece,
  //     a piece at the foot of a wall, one hanging from it (times the set's
  //     density). space: how far apart pieces
  //     stand, a share of their half widths added (sameKind: for small ones
  //     of a kind, which clump). gather: [least, most] small pieces round
  //     each big one.
  //   stand: tall grass and reeds (the set's tall): cut on its own noise,
  //     minSuit the least suitability, reach the most tiles from a wall
  //     (unless by water), rows a tile, gap px between stems.
  //   cover: stamps on the ground (tufts, sprigs, pebbles, moss, roots):
  //     [least, most] round a piece (round); along a wall's foot (foot, a
  //     share of tiles; scree: [least, most] pebbles); in the open (open).
  //   bed: the ground grown into round a plant: reach (px past its half
  //     width), squash (its depth for its width), fray (how ragged its edge),
  //     strokes (how much its edge breaks in short strokes),
  //     deep (where it turns its darker tone); outer, inner: how far the
  //     ground there is drawn to the bed's colour, at its edge and within
  //     deep; drift: how strongly a thick drift's tiles are bedded, so its
  //     plants' beds run together; litter (how much of it is
  //     strewn with leaves, ash or petals). shadow: a piece's contact
  //     shadow, tight under its foot: pad, world px past the foot either
  //     way; ry [least, most] its depth; dx, dy where its middle is from the
  //     foot's (away from the light); core, rim: what's left of the
  //     ground's colour in its middle and at its edge.
  //   melt: how a plant's foot melts into the ground: open, the art px at
  //     its foot with no sel-out; zone, how near its lowest row a column's
  //     foot must be; pull, how far each art px up from it is drawn to the
  //     ground in its shadow; ragged, the share of column pairs whose steps
  //     start a pixel higher (its lowest pixel drawn edge of the way).
  //     frontEvery: art px of foot for each clump of blades over it (two at
  //     least, but on a small piece, and frontMost at most), drawn ahead
  //     world px in front of it; skirt: the chance of a stamp of the
  //     bed's growth tight at each side of a foot; roots: [least, most] a
  //     side for the pieces that spread them, rootLen [least, most] art px,
  //     rootDrop: how often a root steps a pixel down as it goes.
  //   faceMoss: how far up a wall's face moss climbs over a bed at its
  //     foot (a share of the face); strands: roots or vines hanging from a
  //     lip (cut on their noise, past: the most px past the face's foot);
  //     lip: the most px a mesa's fringe of dry grass hangs.
  //   wind: under the sky (merryfolk's windAt): s, a steady push; swell
  //     [base, amount, speed]; gust [strength, speed]; amp: art px a
  //     full-height plant leans at wind 1. stir: [art px, seconds, reach px]:
  //     how far a plant leans as something brushes past, how long it takes
  //     to settle, and how close it must come.
  //   sets: per flora set: density, wet (the clime's own dampness), tall
  //     (how much grows in stands), scree, strands (how many hang).
  flora: {
    foot: 1, wallReach: 1.6, nook: 0.35, wet: 0.7, wetReach: 3, light: 0.5, lightReach: 3, base: 0.12, openFrom: 3, openKeep: 0.25, narrow: 4,
    drift: 3.2, cut: 0.1, fray: 0.28, outlier: 0.04,
    floorP: 0.55, wallP: 0.5, ceilP: 0.4, space: 0.9, sameKind: 0.8, gather: [1, 3],
    stand: { cut: 0.5, minSuit: 0.45, reach: 2, rows: 3, gap: 5 },
    cover: { round: [2, 4], foot: 0.7, scree: [1, 3], open: 0.03 },
    bed: { reach: 5, squash: 0.62, fray: 0.6, strokes: 0.7, deep: 0.45, outer: 0.3, inner: 0.55, litter: 0.6, drift: 0.6 },
    shadow: { pad: 1.5, ry: [1.2, 2.2], dx: 0.5, dy: 0.4, core: 0.68, rim: 0.84 },
    melt: { open: 3, zone: 6, pull: [0.55, 0.35, 0.15], ragged: 0.5, edge: 0.85, frontEvery: 7, frontMost: 5, ahead: 0.5, skirt: 0.6, roots: [1, 2], rootLen: [3, 6], rootDrop: 0.45 },
    faceMoss: 0.7, strands: { cut: 0.3, past: 3 }, lip: 3,
    wind: { s: 0.55, swell: [0.55, 0.45, 0.7], gust: [1.3, 0.45], amp: 2.2, stir: [1.5, 0.8, 9] },
    sets: {
      rim: { density: 1, wet: 0.1, tall: 0.5, scree: 1, strands: 1 },
      choir: { density: 1, wet: 0.2, tall: 0.4, scree: 1, strands: 1 },
      underforge: { density: 0.9, wet: 0, tall: 0.2, scree: 1.4, strands: 0.6 },
      surface: { density: 1.3, wet: 0, tall: 1, scree: 1.3, strands: 0 },
      frost: { density: 1.2, wet: 0, tall: 0.8, scree: 0.8, strands: 1 },
      cinder: { density: 1.1, wet: 0, tall: 0.4, scree: 1.6, strands: 0 },
      bloomfen: { density: 1.4, wet: 0.5, tall: 1.2, scree: 0.4, strands: 0.8 },
      grotto: { density: 1.1, wet: 0.4, tall: 0.6, scree: 0.8, strands: 1.2 },
      magma: { density: 0.9, wet: 0, tall: 0, scree: 1.6, strands: 0.3 },
      rootdeep: { density: 1.4, wet: 0.3, tall: 0.8, scree: 0.5, strands: 1.8 },
      temple: { density: 1.2, wet: 0.3, tall: 0.9, scree: 0.8, strands: 1.4 },
      vault: { density: 0.8, wet: 0, tall: 0.1, scree: 1.2, strands: 0 },
    },
  },

  // Light (render.js). The world dims to `ambient` (tinted; under the sky,
  // and at home, its zone's daylight); lights add back
  // [radius in tiles, strength]; the result is cut into T.art.lightSteps
  // bands, never brighter than `max`. flora: how bright a plant's glow is.
  // bloom: [downscale, strength] passes, times glow. bloomWorld: the
  // bloom's passes on grids fixed to the world, each pixel the average of
  // the glow under it, so a glow doesn't flare and vanish as the camera
  // moves (render.js, bloomSceneWorld). The lamp's radius may become a dial
  // that shrinks with depth.
  light: {
    ambient: 0.45, tint: [0.72, 0.76, 0.95], max: 1.9,
    lamp: [5, 1.35], ore: [1.7, 0.75], flora: 0.3,
    // hurt to under gutterAt of his health, the lamp flickers with his
    // heart, by up to `gutter` of its light at death's door (render.js
    // lampLevels)
    gutterAt: 0.3, gutter: 0.45,
    glow: 0.75, bloom: [[3, 0.7], [7, 0.6]], bloomWorld: true,
    // Violet in the dark (render.js lightScene, gllight.js): in a dark
    // place each of the light's bands is tinted towards `dark` by how
    // little of it is the lamp's (0 at the ambient, 1 at the top), and by
    // how dark the place is (darkAt: the ambient brightness it starts at
    // and is full by, as T.paint.rampEven.darkAt).
    violet: { dark: [0.72, 0.64, 1.0], darkAt: [0.95, 0.42] },
    // The paint lab's NOCTURNE (lightScene): outside the light the colour
    // goes, `amount` of the way to its lightness tinted `tint`, by the
    // band's share of the light (as the warm light's) and how dark the
    // place is (darkAt as warm's). The glow layer keeps its colour.
    nocturne: { amount: 0.85, tint: [0.86, 0.9, 1.18], darkAt: [0.95, 0.42] },
    // The paint lab's SOFT BEAM EDGE (lightScene): a band's edge broken in
    // strokes `len` px long along each row, the threshold moved up to
    // `amt` of a band either way.
    soft: { len: 5, amt: 0.9 },
    // The paint lab's CANVAS (lightScene): a weave pinned to the world,
    // threads `thread` px wide, lit ±amt across each thread and grain
    // more by thread.
    canvas: { thread: 2, amt: 0.045, grain: 0.03 },
    // Shadows (shadow.js; cosmetic). walls: the rock stops the lamp;
    // baked: and the floor's fixed lights (lava, vents, glowing plants).
    // eye: the brow lamp's height over the feet (world px; the painted
    // Kindler's lamp is 39 art px up: diver.js), where the lamp's light is centred; its
    // shadows are cast from under it. rays: how many rays for each cell
    // round the edge of the light's reach; step: art px
    // a ray moves at a time through the wall line; reach: world px past
    // where a ray strikes rock that's still lit (the skin of rock it
    // strikes); top: what a rock top it doesn't reach keeps of it.
    // cast (pshadow.js): what stands on the ground casts its silhouette.
    // lamp: how much of the lamp's share of the light its shadow takes back
    // (1: down to what the walls' shadows fall to), that share raised to
    // pow (below 1, darker where the lamp's share is small); least: none
    // where it's fainter than this at the caster's foot; lampK: [least, most]
    // its length for its height (as far from the lamp as the lamp stands
    // over its top: once); gap: a caster as tall as the lamp, or taller,
    // casts as if the lamp stood this share of its height over its top; spread: how much a point light widens it further up (1
    // as it would); edge: what a silhouette's edge pixel keeps of it. sun:
    // by day, how dark the sun's shadow of what moves (its strength, as
    // the baked ones' T.paint.shade.sun). fixedH: how high (px) the floor's
    // fixed lights stand, fixedMin the share of the light at a plant's foot
    // from which one casts, fixedK as lampK. home: the outpost's light masts
    // and forge: min, the share from which they cast; k as lampK; dark, as
    // lamp; full: the share that casts the full shadow; near: what moves
    // casts only within this share of the lamp's reach of the Kindler.
    // star: the star over the cradle at home: h, how high it hangs (px);
    // its reach r [tiles at magnitude 0, more each] and strength i [the
    // same]; k as lampK; full as home's; drop [at magnitude 1, at 8]: how
    // dark its shadows are; spread [the same]: how soft they are; lamp: how
    // much the Kindler's brow lamp, overhead, takes from its shadows of
    // what moves; kMove as k, for what moves. homeLamp: the lamp casts at
    // home from this strength (at dusk), for the few things nearest it.
    shadow: {
      walls: true, baked: true, eye: 26, rays: 1.25, step: 2, reach: 3, top: 0,
      cast: { lamp: 1, pow: 0.75, least: 0.3, lampK: [0.3, 1.6], gap: 0.3, spread: 0.8, edge: [1.5, 0.05], sun: 0.34, fixedH: 12, fixedMin: 0.25, fixedK: [0.4, 2], home: { min: 0.1, k: [0.4, 2.2], dark: 0.8, full: 0.2, near: 1 }, star: { h: 74, r: [17, 2], i: [1.3, 0.15], k: [0.5, 2.6], kMove: [0.5, 1.6], full: 0.3, drop: [0.72, 0.9], spread: [1.6, 0.7], lamp: 0.3 }, homeLamp: [0.5, 3], hover: { shrink: 0.06, least: 0.55, fade: 0.1, faint: 0.3 } },
    },
    // The suit lamp as a beam (an example to compare with the round glow:
    // render.js lampBeamOf, shadow.js addConeLight; cosmetic). on: the
    // default, until the pause screen's LAMP is set. It points the way the
    // Kindler is turned (the rig's smoothed facing), or the aim while
    // casting. reach: × the glow's reach; i: its strength on its axis.
    // core, edge: half-angles (degrees) of its full middle and of where it
    // has faded out, smoothly between; axis: how much brighter still
    // right on its axis; halo: a faint wider cone round it [its edge, ×
    // edge; strength]; ragged: how far its edges are broken into short
    // strokes across (degrees, all told); soften: its brightness across
    // it evened out over this share of the halo's edge's cosine range, so
    // its middle is a broad pool, not a stripe. pow: how it fades with distance, (1 − d)^pow (the glow's is
    // 2). rise: where the cone starts, from the feet (0) to
    // the brow lamp (1); back: art px its apex is set back behind that, so
    // it's already as wide as the body where it leaves him. spill: a dim
    // round light round him [its reach, × the glow's; strength]; hot: a
    // small bright spot at the lamp [reach, art px; strength]. low: as your
    // light drains below T.pull.dimAt it narrows (its half-angles × narrow
    // when it's all but gone) and gutters (dips of up to flicker).
    // sightSteps: the turns the walls' sight is worked out for; rays: its
    // rays, × T.light.shadow.rays (it reaches further). air: what
    // shows of it in the air, in a dark place: a haze of loose strokes in a
    // shaft from the lamp coming down to the ground [how many, alpha, how
    // far out (× reach)], and motes drifting in it [how many a 100 × 100
    // art px of cone, alpha].
    beam: {
      on: true, reach: 1.7, i: 1.75, core: 8, edge: 30, axis: 0.6, halo: [1.6, 0.16], ragged: 3, soften: 0.1, pow: 1.1, rise: 1, back: 4,
      spill: [0.36, 0.42], hot: [9, 0.7],
      low: { narrow: 0.7, flicker: 0.45 },
      sightSteps: 64, rays: 0.8,
      air: { haze: [46, 0.45, 0.6], motes: [3, 0.8] },
    },
  },

  // Wick, the drone (render.js, drawDrone; cosmetic): where it hovers from
  // the feet, in world px: back, how far behind the way the diver faces
  // ([across, up and down]); aside, how far to the side of it, the same
  // way; up, how high (clear of the helm's brow lamp in every facing, over
  // its whole bob). ease: how quickly it catches up (a second); bob: [its
  // speed, how far (world px)].
  wick: { back: [7, 4], aside: [6, 3], up: 29, ease: 5, bob: [3, 1.5] },

  // The opening (intro.js): five painted scenes that play on their own,
  // the last in the outpost itself. scenes: each one's length (s); fade:
  // the black into and out of each of the first four (s); capAt: when each
  // of their captions starts (s), typed at cps characters a second;
  // tapGuard: seconds before a tap counts; warm: seconds the outpost is
  // still drawn under the first scene (so it's painted); sndWait: the
  // longest (s) a cue waits for its sound to be rendered (sndbank.js). hub: the last
  // shot, in seconds into it: the fade in from black; the star rising out
  // of its cradle from `drop` art px down (over `rise`) and lighting (over
  // `lit`); the outpost's light up from `amb0` of its own (over `ambUp`);
  // its lodelines running out (over `lode`); the modules waking, the
  // nearest the cradle first: [the first, then one every, each light of
  // one after the one before]; the camera starting with the star `camAt`
  // of the way down the view and coming down over `cam`; the Kindler's pod
  // door open over `door`, his suit lamp flickering on over `lampOn` as he
  // looks out, and him stepping out and `step` tiles on at
  // `walk` of his pace; Wick lifting off his pack at `wickAt`; him turning
  // to the star at `look`; Wick's lines at `caps`; and something in the
  // dark over `dark`.
  intro: {
    scenes: [9, 9.5, 11, 9.5, 17.5], fade: 0.6, capAt: [1.0, 1.0, 1.2, 1.0], cps: 30, tapGuard: 0.4, warm: 1, sndWait: 2.5,
    hub: { fadeIn: 0.9, drop: 34, rise: [0.6, 3.2], lit: [0.8, 2.8], amb0: 0.3, ambUp: [1.5, 9], lode: [2.8, 6], wake: [2.6, 0.2, 0.08], camAt: 0.42, cam: [3.4, 8.2], door: [5.8, 7.6], lampOn: 0.6, step: 1.6, walk: 0.42, wickAt: 7.4, look: 8.4, caps: [8.0, 12.6], dark: [14.2, 15.4] },
  },


  // The paint lab (lab.js, docs/PAINTED.md): the painted look's options as
  // settings to flip in play, each default the look chosen so far. calm:
  // the ground in calm fields with the detail gathered (T.paint.calm); form: strokes
  // down the rock's faces, one big plane an outcrop, lit cracks
  // (T.paint.form); warm: the light's bands tinted, amber in the lamp and
  // violet in the dark (T.light.warm); air: the clime's motes and a haze
  // beyond the beam (T.air). impasto, broken, bounce (T.paint's), nocturne,
  // soft, canvas (T.light's), live (T.paint.live). brush: the strokes'
  // size and way (today, broad, fine, dab, contour; T.paint.brush);
  // finish: how much the paint shows (paint, flat, ink, wash;
  // T.paint.finish).
  lab: { calm: true, form: true, air: false, impasto: false, broken: false, nocturne: false, bounce: false, live: false, soft: false, canvas: false, brush: 'today', finish: 'wash' },
  // Air beyond the beam (air.js; the paint lab's AIR; cosmetic). motes:
  // per, how many a 100 × 100 art px of the floor, in the clime's glow
  // colour (the star's gold at home), at alpha, lit by the light where they
  // are; drifting up at speed [least, most] art px a second, swaying sway
  // px; wide of them two px across. haze: over dark land, a broad noise in
  // the ground's lightest tone at alpha (times the dark), scale art px a
  // bump, drifting speed px a second. vignette: the corners to the violet
  // black, from `from` of the shorter side out, alpha at the corner.
  air: { motes: { per: 2.5, alpha: 0.75, speed: [4, 10], sway: 4, wide: 0.3 }, haze: { alpha: 0.11, scale: 60, speed: 5 }, vignette: { from: 0.45, alpha: 0.42 } },

  // tapGuard: seconds a new screen ignores taps. toasts: the most on screen
  // at once (ui.js; hints wait their turn). lineWait: seconds a spoken line
  // waits behind others (out of any screen) before it's dropped as stale.
  ui: { tapGuard: 0.4, toasts: 2, lineWait: 14 },

  // Sound (audio.js, music.js; cosmetic). master, music, sfx: levels; soft:
  // a setting's soft level; space: the echo's level. voices: the most
  // effects sounding at once; gap: the least time (s) between two of the
  // same, unless the cue says. near: [full, silent] distance (px) from the
  // Kindler of an effect with a place, panned over panW px, at most panMax.
  // presence: how much of the star is there in kindled land, and in the
  // dark and a Deep [with no light, more with full]. figureAt: the presence
  // the figure needs; phraseRest, callRest: [least, most] s between its
  // phrases (callRest below magnitude 4) at home, times awayRest away; beat
  // (s). figure, bloom, ping: their levels; pingGap: s. Feeding swells the
  // hum (feedPer an ore, feedHeld while held, fading feedFade a second) by
  // feedSwell and opens it by feedOpen Hz. magLate: s before a magnitude
  // reached without its bloom is heard anyway; lift: s the whole chord
  // holds after kindling. bedUnder: how much the star's presence quiets a
  // place's own sound; bedDay: by day; events: their level; breath: its
  // level after the turn. uneaseFrom: the echoes read before the turn
  // starts to be heard; uneasyPhrase: the chance a phrase is uneasy after
  // it. lowHp: the share of health under which the heart beats; stingR: px
  // a big foe is first seen at; channel: a channel's tone. stepAhead: px
  // ahead of the Kindler's middle a footfall's ground is read (the foot that
  // lands is ahead of the body).
  sound: {
    stepAhead: 6, master: 0.9, music: 0.1, sfx: 0.8, soft: 0.4, space: 0.6, voices: 14, gap: 0.03,
    near: [50, 230], panW: 140, panMax: 0.7,
    presence: { kindled: 0.78, dark: [0.12, 0.66], deep: [0.04, 0.58] },
    figureAt: 0.62, phraseRest: [7, 12], callRest: [14, 22], awayRest: 1.5, beat: 0.8,
    figure: 0.5, bloom: 0.5, ping: 0.18, pingGap: 0.055,
    feedPer: 0.1, feedHeld: 0.6, feedFade: 0.45, feedSwell: 0.8, feedOpen: 900,
    magLate: 8, lift: 6, bedUnder: 0.55, bedDay: 0.6, events: 0.5, breath: 0.09,
    uneaseFrom: 2, uneasyPhrase: 0.6, lowHp: 0.3, stingR: 130, channel: 0.035,
  },
};
