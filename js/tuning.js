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
  player: {
    hp: 100, speed: 56, radius: 4, hurtInvuln: 0.5, restAfter: 4, restRegen: 3,
    charge: 30, chargeRegen: 4.5, magnet: 14,
  },

  // Mining: the ore tile's nearest edge must be within `reach` of the feet
  // (10 reaches a wall from the middle of a corridor); the one nearest a
  // point `ahead` px in front of the diver is the target. A hardness-1
  // ore breaks after 1 / speed seconds of holding MINE, times the pick's
  // speed.
  mine: { reach: 10, ahead: 10, speed: 1.4, hitEvery: 0.22, yield: [1, 1], drillNoise: 90 }, // a drill wakes what's within drillNoise px

  // Cargo is counted in units: ore and exotics weigh 1, gear and relics
  // itemWeight. The pocket: slots (by magnitude, 1 to 8) whose contents
  // survive a fall; an ore stack in one holds at most pocketStack.
  cargo: { capacity: 40, itemWeight: 3, pocket: [1, 1, 2, 2, 3, 3, 3, 3], pocketStack: 10 },

  // Your light (d.pull): full in kindled land and at home, it drains in the
  // dark over T.world.light seconds. Below dimAt the lamp dims (to lampMin)
  // and every waveEvery seconds `wave` more enemies stir in the dark; when
  // it's gone the Hollow comes (and a Deep's lodeline goes dark).
  pull: { dimAt: 0.5, lampMin: 0.6, waveEvery: 16, wave: 2 },

  // Leaving takes a moment: standing in a lodeline, EXTRACT takes `extract`
  // seconds; an emergency recall works anywhere but takes `recall` seconds
  // and loses a share of the cargo, recallLoss + recallPerDepth a site, less
  // recallPerMag for each magnitude past the first (between recallMin and
  // recallMax). Moving or being hit breaks either. Starting one wakes
  // anything within `noise` px.
  leave: { extract: 1.5, recall: 4, recallLoss: 0.15, recallPerDepth: 0.06, recallPerMag: 0.02, recallMin: 0.05, recallMax: 0.7, noise: 160 },

  // Floors: a w × h tile grid of lumpy caverns (radius roomR tiles, at least
  // roomGap apart) joined by tunnels that wander (meander: how hard the
  // heading drifts each half-tile) at a half-width of tunnelR tiles, plus a
  // few extra tunnels so there are loops. pillar: the chance a big cavern
  // keeps a pillar of rock. wallNoise: how far the walls' line wanders off
  // the tiles. veins: ore veins per cavern (none in the entry's). padOdds:
  // the chance each site of a Deep has a lodeline (back up to the surface),
  // up by padPerMag for each magnitude past the first, to no more than padCap.
  floor: {
    w: 52, h: 52,
    rooms: [7, 10], roomR: [2.5, 4.8], roomGap: 3, loops: [1, 3],
    tunnelR: [1.0, 1.6], meander: 0.35, pillar: 0.4, wallNoise: 0.14,
    veins: [1, 2], veinLen: [2, 4],
    padOdds: [1, 0.8, 0.6, 0.4], padPerMag: 0.05, padCap: [1, 0.9, 0.75, 0.55],
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
  //   regrow: sorties before a mined vein in dark land grows back.
  //   straggler: the chance one enemy is left in kindled land; clear: tiles
  //     round where the diver arrives that start clear of enemies.
  //   waystone: lighting one is a `channel` s channel within `touch` px;
  //     the last must then be held `hold` s within holdR px, the dark sending
  //     `wave` more every waveEvery s. plant: the spire's channel, s.
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
    edgeDepth: 4, light: 75,
    goals: { waystones: { weight: 3, perRing: 0 }, rift: { weight: 1, perRing: 0.5 } },
    deep: { chance: 0.35, sites: [1, 3] },
    exits: { apart: 9, tunnelR: 1.2, reach: 9, inward: 3 },
    gen: { rooms: [5, 7] }, veins: [0, 1], regrow: 3, straggler: 0.4, clear: 7,
    waystone: { channel: 2.5, touch: 18, hold: 20, holdR: 40, waveEvery: 8, wave: 1 },
    plant: 6,
    sun: { dark: -0.35, kindled: 1, edge: -0.6 },
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
  // [radius in tiles, strength], times sunLight under the sky.
  portal: { enter: 0.45, arrive: 0.7, reach: 11, light: [2.6, 1.0], sunLight: 0.55 },
  // Contracts: how many are posted, how often each kind comes up, and the
  // star points each pays per magnitude.
  // newest: the share of hauls set in the furthest region reached;
  // stale: how many sorties one stands before it's replaced.
  // A hunt names a clime's own creature (one whose clime leans to a region
  // reached, or to none) with the chance huntSignature, huntN [least, most].
  contracts: { posted: 3, kinds: { haul: 3, hunt: 3, reach: 2, seal: 1, kindle: 2, deep: 1 }, star: 25, newest: 0.7, stale: 3, huntSignature: 0.4, huntN: [2, 4] },
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
  // Tools: the magnitude each can be made at, and what it costs from the
  // stash (a part's kind takes parts of any grade, the lowest first).
  // sight/reach in tiles; the beacon lands after `land` seconds and
  // wakes what's within `noise` px; in a territory, standing within `refill`
  // px of it brings your light back at refillRate a second.
  tools: {
    compass: { mag: 1, cost: {} },
    oresense: { mag: 2, cost: { ferrite: 14, spore: 3 }, reach: 9 },
    radar: { mag: 2, cost: { ferrite: 14, ether: 3 }, reach: 18 },
    beacon: { mag: 2, cost: { lumenite: 6, cog: 3 }, land: 6, noise: 140, refill: 40, refillRate: 0.12 },
    map: { mag: 3, cost: { lumenite: 8, fiber: 4 }, sight: 6 },
    satchel: { mag: 3, cost: { lumenite: 8, chitin: 4 } },
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
  // Each does one thing: an elemental one is forged into its Element stone
  // (and worked into a caster, one comes out with it); the others, worked
  // into a forging, guarantee an affix family, raise the rarity a step, or
  // forge it a tier higher.
  exotics: [
    { id: 'voltaic', name: 'Voltaic crystal', element: 'shock' },
    { id: 'frostglass', name: 'Frostglass', element: 'frost' },
    { id: 'emberglass', name: 'Emberglass', element: 'ember' },
    { id: 'blightcap', name: 'Blightcap', element: 'blight' },
    { id: 'bloodresin', name: 'Bloodresin', family: 'leech' },
    { id: 'lodeshard', name: 'Lodestone shard', rarity: true },
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

  // The hands. Each has its own button: a press casts its caster's whole
  // circuit, holding past chargeStart charges it, and letting go once it's
  // past chargeFull casts it charged. Close Forms aim at the nearest enemy
  // within autoAim, else straight ahead; another press within comboWindow
  // carries an Arc's combo on. fist: an empty main hand's power (it casts a
  // free Arc).
  hands: { autoAim: 52, comboWindow: 0.6, chargeStart: 0.25, chargeFull: 0.7, fist: 3 },
  // A dash: a burst of speed with a moment of untouchability. A flick of
  // the move thumb (flickPx in flickMs) dashes too.
  dash: { speed: 230, time: 0.13, invuln: 0.22, cooldown: 0.55, flickPx: 26, flickMs: 90 },
  // How hits land: the world freezes for hitstop (heavy: heavyStop);
  // knockback fades at knockDecay a second. The view doesn't shake (the
  // designer found it unpleasant), but the shake values are kept at 0 so it
  // can be tried again.
  // A struck enemy wears a rim a pixel wide (render.js) for hurtFlash s;
  // no more than flashMost at once.
  impact: { flashMost: 4, hitstop: 0.045, heavyStop: 0.09, stopGap: 0.15, shake: 0, heavyShake: 0, hurtShake: 0, knockDecay: 9 },

  // Circuits (circuits.js): a caster's row of slots, read left to right.
  // A Form starts a spell, Elements after it set its damage type, Glyphs
  // change it. The charge a cast costs is the sum of its Forms' costs, each
  // times its glyphs' costs (at least 1). Damage is the caster's power ×
  // the Form's mult × its stone's growth (stoneGrowth a tier past the first;
  // otherGrowth for each Element and Glyph stone with it) × (1 + spell
  // damage %, + close damage % for close Forms).
  //   charged (held): chargedMult the damage for chargedCost the charge;
  //     bolts and lances are bigger and pass through chargedPierce more.
  //   aimRange: how far a cast looks for something to aim at.
  //   spark: what a caster with no Form casts (a weak bolt).
  //   bases: slots, by the anvil's quality (rough, fair, fine, masterwork);
  //     cd, a share of the hand's wait; area, a share of every reach;
  //     closeCost, charge off each close Form; aim, its aimRange.
  //   forms: cost, mult and cd (seconds the hand waits) for each, and:
  //     arc: combo [damage ×, cooldown, arc cos, knockback px/s, lunge px]
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
  //   glyphs: cost, times the Form's (each stone of it). split: n each at
  //     mult, spread rad apart (closeSpread for an Arc's sweeps). amplify:
  //     area ×, damage ×. quicken: cd ×. chain: jumps a stone, within range
  //     px, each falloff × the last. echo: again after delay at mult.
  //     pierce: more foes passed through. linger: a field of its element
  //     for time s, hurting dps × the hit a second. trigger: no numbers.
  //   force: what Force adds: knockback ×.
  //   stones: what forging one takes: ore, parts (creature parts) or an
  //     exotic. A fine forge or better makes it a tier higher.
  circuits: {
    chargedMult: 1.8, chargedCost: 1.5, chargedPierce: 3, aimRange: 140,
    stoneGrowth: 0.25, otherGrowth: 0.05,
    spark: { cost: 3, mult: 0.6, cd: 0.3, speed: 170, life: 1.2 },
    bases: {
      wand: { slots: [3, 3, 4, 4], cd: 0.85, area: 1, aim: 140 },
      gauntlet: { slots: [3, 3, 4, 4], cd: 1, area: 1, closeCost: 1, aim: 130 },
      staff: { slots: [4, 5, 5, 6], cd: 1.3, area: 1.3, aim: 170 },
    },
    forms: {
      arc: { cost: 3, mult: 0.9, close: true, refund: 2, refundMost: 3, range: 22, heldMult: 2.2, field: 14, slow: 0.6,
        combo: [[1, 0.24, 0.3, 70, 4], [1, 0.24, 0.3, 70, 4], [1.7, 0.45, -0.1, 160, 9]] },
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
      trigger: { cost: 1 },
    },
    force: { knock: 1.3 },
    stones: { form: { ore: 6, parts: 2 }, element: { ore: 4, exotic: 1 }, glyph: { ore: 5, parts: 3 } },
    // Weak and resistant (natures.js): a hit of an element is multiplied by
    // resist[verdict]: W weak, R resistant, I very resistant. Nothing is
    // ever immune. Each enemy's own verdicts are T.enemies.resist; a clime
    // moves them a step (T.climes[id].resist); an elite's affix adds its own
    // (T.enemies.eliteResist).
    resist: { W: 1.5, R: 0.5, I: 0.25 },
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
    // Ore affinity: a caster's ore (the one it's named for) favours an
    // element. A spell of it is attuned: attuned.dmg more damage (by its
    // share of the spell's elements) and its status attuned.status × as
    // long. And each ore's own way: ferrite takes glaive charge off a
    // Glaive; lumenite casts `cast` faster; resonite makes its resonances
    // `resonance` stronger; aetherglass sends a Lance `lance` × as far;
    // sigilite makes its glyphs `glyphs` stronger; starmetal has `slots`
    // more than its base.
    attuned: { dmg: 0.25, status: 1.5 },
    ores: {
      ferrite: { el: 'force', glaive: 1 },
      lumenite: { el: 'shock', cast: 0.1 },
      resonite: { resonance: 0.25 },
      aetherglass: { el: 'frost', lance: 1.35 },
      sigilite: { el: 'ember', glyphs: 0.1 },
      starmetal: { slots: 1 },
    },
    // Linked slots: a masterwork caster's chance of a linked pair of slots;
    // a Glyph in either counts twice.
    links: { chance: 0.5 },
    // Resonances (resonance.js): a circuit that fills its caster exactly
    // with one of them hits mult × as hard. Resonance stones, which show
    // parts of them in the Codex, drop from elites (elite), lie by an
    // ancient forge (forge), and pay contracts (contract: its weight among
    // the rewards).
    //   thunderhead: the orb flies `fly` s to a point `ahead` px out (or the
    //     foe in aim) and becomes a cloud `height` px up for `time` s,
    //     striking the nearest foe within r px every `every` s for mult × the
    //     group's damage, drifting at drift px/s to stand over it.
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
    //     star falls for fall s; it strikes within r px for the nova's and
    //     the bolts' damage, stunning for stun s. ahead: px out with nothing
    //     in aim.
    resonance: {
      mult: 1.5, elite: 0.04, forge: 0.35, contract: 1,
      thunderhead: { fly: 0.3, ahead: 56, height: 30, time: 4, r: 64, every: 0.4, mult: 1, drift: 30 },
      shatterglass: { mult: 2, shards: 2, shardMult: 0.4, shardSpeed: 170, shardLife: 0.3 },
      kindling: { flames: 5, half: 0.9, r: 1, time: 3, dps: 0.3, size: 7 },
      wildfire: { every: 10, r: 7, time: 2.5, dps: 0.15, most: 60, ignite: 12, spread: 20, spreadEvery: 0.35, burn: 3, flora: 40 },
      stormglaive: { every: 0.45, reach: 64, mult: 0.5 },
      starfall: { rise: 0.5, fall: 0.16, r: 40, stun: 1, ahead: 70 },
    },
  },
  // How a cast looks (castfx.js; cosmetic only: the spell still fires on the
  // tap, and nothing here changes what it does). Sizes are world px, times
  // seconds, light radii tiles.
  //   pose: how long the diver holds the cast pose; thrust: the share of it
  //     the arm is out before it eases back. lean: by the focus's style, [art
  //     px the body leans into the cast, art px it recoils back]; reach: art
  //     px the focus is held out past the fist; lift: art px a staff's head
  //     rises before it swings down at the aim.
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
  //     sheds. impact: [sparks, light radius, light, seconds]; decal:
  //     [seconds a mark on the ground lasts, the most at once].
  //   charge: motes drawn into the focus a second at full charge; glyph
  //     radius [empty, full].
  //   echo: how long the ghost of a recast pose lasts.
  //   cap: the most motes alive at once (past it, new ones are skipped); flares: the
  //     most lights flaring at once (the oldest make way); day: under the
  //     sky in daylight, the share of its radius a cast's light keeps (and
  //     it's never brighter than one band of light: cfxLight).
  castFx: {
    pose: 0.2, thrust: 0.45,
    lean: { wand: [1, 1], gauntlet: [2, 1], staff: [1, 0] }, reach: { wand: 3, gauntlet: 1, staff: 4 }, lift: 4,
    flash: [0.12, 1.5, 1.0], streaks: 5, streakSpeed: [50, 110],
    glyph: [6, 10, 0.32], glyphBig: [9, 16, 0.5], motes: 6, moteTime: 0.55,
    shapes: {
      projectile: {},
      sweep: { time: 0.16, heavyTime: 0.24, sparks: 10, dust: 6, bloom: [1, 0.8, 0.2] },
      burst: { from: 4, time: 0.32, dust: 12, scatter: 12, bloom: [1.2, 1.1, 0.3], big: true },
      placed: { from: 4, time: 0.42, dust: 10, glyph: [0.5, 0.3, 0.7], bloom: [1.2, 1.1, 0.3], big: true },
      guard: { ring: [18, 9], time: 0.32, motes: 10, bloom: [1.2, 0.9, 0.3], big: true },
      move: { ghosts: 6, time: 0.3, alpha: 0.4, ends: [3, 12, 0.18], bloom: [2, 1.2, 0.25] },
    },
    shapeOf: { spark: 'projectile', bolt: 'projectile', lance: 'projectile', orb: 'projectile', arc: 'sweep', glaive: 'burst', nova: 'burst', well: 'placed', ward: 'guard' },
    bolt: { originT: 0.07, trail: 5, every: 0.035 }, impact: [7, 1.1, 1.1, 0.16], decal: [1.6, 16],
    charge: { motes: 40, glyph: [5, 13] },
    echo: 0.3,
    cap: 180, flares: 10, day: 0.33,
  },
  // What each element does on a hit (its stone sets a Form's). shock: this
  // share of hits arcs on; frost: hits chill, and a heavy hit on the
  // chilled shatters for `shatter` times; ember: hits burn for burnTime,
  // `burn` of the hit a second; blight: poison for blightTime, `blight` of
  // the hit a second, spreading within blightSpread px when its host falls.
  elements: { shockChance: 0.3, shatter: 1.6, burn: 0.35, burnTime: 3, blight: 0.22, blightTime: 4, blightSpread: 40 },
  // shock arcs to the nearest other enemy within shockRange for shockMult;
  // chill slows by chillSlow for chillTime.
  onHit: { shockRange: 48, shockMult: 0.5, chillSlow: 0.5, chillTime: 2 },

  // Enemies at level 1; each level multiplies hp by hpGrowth and damage by
  // dmgGrowth. windup: the tell before an attack. weight: how often each
  // turns up. No more than `attackers` (plus attackersPerDepth a floor)
  // wind up at once; the rest circle.
  // A heavy hit staggers anything but the warden for staggerTime.
  enemies: {
    hpGrowth: 1.16, dmgGrowth: 1.07, aggro: 96, hurtFlash: 0.08, attackers: 2, attackersPerDepth: 0.34, staggerTime: 0.35,
    // crawlers close to `circle` px, circle for a moment, wind up, lunge,
    // then recover (open to a counter)
    crawler: { hp: 26, dmg: 14, speed: 36, radius: 5, circle: 28, windup: 0.38, lungeSpeed: 145, lungeTime: 0.28, recover: 0.55, weight: 5 },
    // wisps keep `keep` px away and strafe; from fanDepth they fire three
    wisp: { hp: 17, dmg: 9, speed: 28, radius: 4, keep: 60, range: 115, windup: 0.55, cooldown: 1.9, shotSpeed: 72, fanDepth: 3, weight: 3 },
    // constructs show where they'll charge; one that hits a wall is dazed
    construct: { hp: 52, dmg: 16, speed: 20, radius: 6, range: 80, windup: 0.7, cooldown: 2.2, chargeSpeed: 135, chargeTime: 0.5, dazed: 1.3, weight: 2 },
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
    signatureShare: 0.3, graftFoes: [1, 2], exposed: 1.5,
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
    keeper: { hp: 455, enrageAt: 90, enrageSpeed: 1.3, afterPull: 30, dmg: 18, speed: 22, radius: 12, range: 100, windup: 0.75, cooldown: 1.8, chargeSpeed: 130, chargeTime: 0.6, dazed: 1.5, shotSpeed: 70, shots: 12, summonEvery: 7, broodMax: 4, magma: 0.35, magmaR: 18, magmaTime: 4, summon: 2 },
    warden: { hp: 380, dmg: 16, speed: 18, radius: 9, range: 95, windup: 0.75, cooldown: 2.0, chargeSpeed: 125, chargeTime: 0.6, dazed: 1.6, shotSpeed: 65, shots: 10 },
    // a room's enemies: perRoom + perDepth × depth, give or take one
    perRoom: 1.4, perDepth: 0.55, maxPerRoom: 6,
    // elites: chance eliteBase + eliteDepth × depth, to eliteMax; elites:
    // how often each affix comes up
    eliteBase: 0.06, eliteDepth: 0.035, eliteMax: 0.35, eliteHp: 2.5, eliteDmg: 1.3,
    elites: { fast: 3, tough: 3, volatile: 3, insulated: 2, fireproof: 2, warded: 1.5, shifting: 1.5 },
    fast: 1.5, tough: 1.6, volatileRadius: 26, volatileDmg: 1.5, volatileFuse: 0.6,
    // a warded elite resists everything until wardHits Force hits (a heavy
    // one counts two) break its shell; a shifting one's weakness moves to
    // the next element every shiftEvery s
    wardHits: 3, shiftEvery: 6,
    // What each kind is weak to (W), resists (R) or all but shrugs off (I),
    // by element (missing: neither). natures.js reads it: elementMultFor.
    resist: {
      crawler: { ember: 'W' }, // a chitin shell, dry inside
      wisp: { force: 'R', shock: 'R', blight: 'I' }, // no body, all ether
      construct: { shock: 'W', blight: 'I' }, // an armoured machine
      snapjaw: { frost: 'R', ember: 'W', blight: 'R' }, // living plants
      spitter: { frost: 'R', ember: 'W', blight: 'R' },
      hollow: { force: 'R', shock: 'R', frost: 'R', ember: 'R', blight: 'R' }, // the living dark
      // each clime's own creature (foes.js)
      skink: { frost: 'W', ember: 'R' }, tusker: { ember: 'W', frost: 'R' }, wraith: { frost: 'W', ember: 'R' }, lurker: { ember: 'W', blight: 'R' },
      dropper: { force: 'W', shock: 'R' }, eel: { shock: 'W', ember: 'R' }, crab: { frost: 'W', ember: 'R', force: 'R' }, weaver: { ember: 'W', blight: 'R' },
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
  },

  // Drops. Enemies leave their own parts (part: the chance; partTwo: the
  // chance of a second), elites and the warden more, and now and then an
  // exotic, a blueprint or a sealed relic. Finished gear comes from the
  // forge. motes heal. rarity: [base, per depth] weights (for relics).
  loot: {
    part: 0.45, partTwo: 0.15, eliteParts: [2, 3], bossParts: 4,
    exotic: 0.03, eliteExotic: 0.5, eliteBlueprint: 0.22,
    relic: 0.008, eliteRelic: 0.05, bossRelic: 0.6, mote: 0.14, moteHeal: 14,
    rarity: { common: [60, -2], magic: [30, 1], rare: [8, 1.2], legendary: [1, 0.35], set: [0.8, 0.25] },
  },

  // Gear. Base numbers at tier 1, times tierGrowth a tier (affixes grow by
  // affixGrowth a tier). Each kind's crafting cost is in ore of its tier
  // (a pick is made from the ore it's named for, and breaks the next one).
  items: {
    tierGrowth: 1.45, affixGrowth: 0.3, gradeBoost: 0.2, // a part's grade over 1 strengthens what it binds
    caster: { power: 6 },
    armor: { armor: 4, armorGrowth: 0.75, hp: 16, hpGrowth: 1.5, cost: 10 },
    charm: { cost: 6 }, pick: { speedGrowth: 0.12, cost: 12 },
    affixes: { common: 1, magic: 2, rare: 3, legendary: 3, set: 2 },
    armorK: 50, // damage taken × armorK / (armorK + armor)
  },
  // Caps on what affixes can add up to.
  caps: { crit: 50, castSpeed: 100, moveSpeed: 50, leech: 15, shock: 60, chill: 60, oreLuck: 100, mineSpeed: 200 },

  // The rune bench, in ore of the item's tier. add also raises the rarity.
  runes: { reroll: 4, upgrade: 6, upgradeBy: 0.2, add: 10 },
  salvage: { back: 0.4, exotic: 0.15, exoticRare: 0.5 },

  // The Lodestar. Each ore fed is worth tier² points; magnitude n needs
  // levels[n - 1] points in all. Each level past the first is an
  // attunement point, a Deep's lodelines a little likelier, a pocket slot
  // now and then (T.cargo.pocket) and a gentler recall.
  // extractStar: what coming home feeds the star, once a sortie, times the
  // square of the deepest dark land walked (its depth, 1 to 4).
  star: { levels: [0, 60, 250, 900, 3000, 6000, 10000, 15000], extractStar: 8 },
  // The story (story.js): each region's Keeper waits in its lair, at the end
  // of its ring's furthest Deep, holding a shard of a star that went dark;
  // each shard set in the Lodestar adds shardStar points. An echo (a log of
  // the Kindlers before) turns up by an ancient forge, from an elite now and
  // then, and from every Keeper.
  //   landerEvery: the Meridian can send a lander for every this many
  //     territories kindled. callLanders: how many landers' worth of kindled
  //     land it takes to call the colony down (with every shard set).
  //   turnEcho: from this many echoes read, the settlers have heard.
  //   settlers: figures at the outpost, perLander for each lander down (all
  //     of them, most, once the colony's called); their pace (world px a
  //     second), the pause between strolls (s), how near (tiles) the diver
  //     comes before one speaks, and how long (s) before that one speaks
  //     again.
  story: {
    shardStar: 400, echoForge: 0.5, echoElite: 0.05,
    landerEvery: 3, callLanders: 5, turnEcho: 5,
    settlers: { perLander: 1, most: 6, speed: 9, rest: [2, 6], talkR: 1.4, talkGap: 40 },
  },
  // An ancient forge stands on a floor this deep or deeper, by chance.
  // Imprinting a known legendary power at the forge costs a heart (any
  // grade) or `glass` riftglass; a fine forge or better always takes it,
  // a rougher one with `chance`.
  imprint: { glass: 2, chance: 0.5 },
  fieldForge: { blueprint: 0.6 }, // the chance a schematic lies by one (how often one stands is the zone's)
  // The anvil: three strikes, each a marker sweeping a bar at `speeds`
  // (sweeps a second), slowed to `drag` of that while it's over the zone.
  // A strike inside the zone (`zone` of the bar wide, narrowing by `shrink`
  // a strike) is good; inside its middle `perfect` of it, perfect. Quality
  // (perfect 1, good 0.5, summed, rounded down) picks the rarity odds:
  // [common, magic, rare, legendary] for quality 0–3.
  // Made kinder after the designer found it hard (it was speeds 0.9, 1.25,
  // 1.6, zone 0.26, shrink 0.04, no drag). The good window is now about
  // 500, 350 and 250 ms, strike by strike (was 290, 175, 110), so most
  // strikes land good; the perfect one about 125, 90 and 65 ms (was 85,
  // 55, 35, with perfect 0.3), so three in a row is still rare.
  anvil: {
    speeds: [0.75, 0.95, 1.15], drag: 0.75, zone: 0.28, shrink: 0.03, perfect: 0.25,
    odds: [[55, 35, 10, 0], [40, 42, 16, 2], [25, 44, 26, 5], [10, 38, 40, 12]],
  },
  attune: {
    vitality: { name: 'Vitality', text: '+15 max health', max: 5, maxHp: 15 },
    capacity: { name: 'Capacity', text: '+6 cargo', max: 5, cargo: 6 },
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
  //     gradients (wall shadows, the rift's wash, the sinkhole's faces).
  //   lightSteps: the light's bands for each 1.0 of light; lightDither: how
  //     much of each step's edge is dithered (0 hard, 1 the whole step).
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
    lightSteps: 5, lightDither: 0, lampPerPixel: true, steadyCam: true,
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
  //     margin painted as time allows, budget ms a frame.
  paint: {
    lazy: { near: 2, far: 7, budget: 3 },
    ramp: { dark: [0.62, 0.3], light: [0.14, 0.28], rock: { dark: [0.6, 0.3], light: [0.3, 0.6] } },
    stroke: { whole: 0.12, one: 0.48 },
    ground: { base: 0.47, swell: 70, swellAmt: 0.24, patch: [46, 14], patchCut: [0.5, 0.68], patchSky: 0.3, patchCave: 0.24, clump: 0.06, foot: 7, footHard: 1, footAmt: 0.3, side: 0.1, sunDir: [2, 3], sunSteps: 9, sunSlope: 3.2, sunDark: 0.32, jitter: 0.42 },
    wall: { face: 22, edge: 5, bump: 16, bumpScale: 34, ramp: 18 },
    rock: { light: [-0.55, -0.45, 0.7], steep: [0.8, 2.2], lamLo: 0.45, topLo: 2.6, topHi: 6.6, faceBase: 0.2, faceUp: 0.6, faceWest: 0.25, faceLo: 4, faceHi: 8, jitter: 0.8, strata: 0.45, crease: 2.5, rim: 8, lip: 8, foot: 1 },
    slab: { w: 46, h: 19, wobble: 0.8, tone: 0.8, lip: 1.5, crack: 1, gate: 0.5 },
    occlude: true,
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
  //     density; at the outpost, times hub). space: how far apart pieces
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
    floorP: 0.55, wallP: 0.5, ceilP: 0.4, hub: 0.4, space: 0.9, sameKind: 0.8, gather: [1, 3],
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

  // Light (render.js). The world dims to `ambient` (tinted; at home, the
  // brighter hubAmbient); lights add back
  // [radius in tiles, strength]; the result is cut into T.art.lightSteps
  // bands, never brighter than `max`. flora: how bright a plant's glow is.
  // bloom: [downscale, strength] passes, times glow. bloomWorld: the
  // bloom's passes on grids fixed to the world, each pixel the average of
  // the glow under it, so a glow doesn't flare and vanish as the camera
  // moves (render.js, bloomSceneWorld). The lamp's radius may become a dial
  // that shrinks with depth.
  light: {
    ambient: 0.45, hubAmbient: 0.85, tint: [0.72, 0.76, 0.95], max: 1.9,
    lamp: [5, 1.35], ore: [1.7, 0.75], flora: 0.3,
    glow: 0.75, bloom: [[3, 0.7], [7, 0.6]], bloomWorld: true,
    // Shadows (shadow.js; cosmetic). walls: the rock stops the lamp;
    // baked: and the floor's fixed lights (lava, vents, glowing plants).
    // eye: the brow lamp's height over the feet (world px; the painted
    // Kindler's lamp is 39 art px up: diver.js), where the lamp's light is centred; its
    // shadows are cast from under it. rays: how many rays for each cell
    // round the edge of the light's reach; step: art px
    // a ray moves at a time through the wall line; reach: world px past
    // where a ray strikes rock that's still lit (the skin of rock it
    // strikes); top: what a rock top it doesn't reach keeps of it.
    // props: what big things (big plants, enemies, portals) cast from the
    // lamp. steps: the lamp's share of the light at a foot from which the
    // rim, then the core, shows; dark: what's left of the ground's colour
    // in the rim and in the core; core: the core's width and length, as
    // shares of the shadow's; len: [world px at the foot, more for each
    // world px from the lamp, most]; tall: the height (world px) that casts
    // it that long, size: [least, most] the share for other heights; crown:
    // a plant's shadow is at least this share of its whole width across
    // (its crown's, not just its foot's); back: how far it rounds behind the
    // foot (a share of its width); fray: how ragged its edges (in clusters
    // of 2 art px); portal: a portal's half width (world px).
    shadow: {
      walls: true, baked: true, eye: 26, rays: 1.25, step: 2, reach: 3, top: 0,
      props: { steps: [0.2, 0.38], dark: [0.66, 0.48], core: [0.62, 0.6], len: [9, 0.12, 18], tall: 30, size: [0.6, 1.3], crown: 0.3, back: 0.35, fray: 0.35, portal: 9 },
    },
  },

  // Wick, the drone (render.js, drawDrone; cosmetic): where it hovers from
  // the feet, in world px: back, how far behind the way the diver faces
  // ([across, up and down]); aside, how far to the side of it, the same
  // way; up, how high (clear of the helm's brow lamp in every facing, over
  // its whole bob). ease: how quickly it catches up (a second); bob: [its
  // speed, how far (world px)].
  wick: { back: [7, 4], aside: [6, 3], up: 29, ease: 5, bob: [3, 1.5] },

  // tapGuard: seconds a new screen ignores taps. toasts: the most on screen
  // at once (ui.js; hints wait their turn).
  ui: { tapGuard: 0.4, toasts: 2 },
};
