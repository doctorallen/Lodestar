'use strict';
// ---------------------------------------------------------------------------
// Every gameplay number in one place. Distances are world pixels, times are
// seconds, speeds px/s. DESIGN.md explains the systems; where the two
// disagree, this file is the truth. The affix table is in items.js.
// ---------------------------------------------------------------------------

const T = {
  // charge is the mana: it refills at chargeRegen a second, and each melee
  // hit adds chargeOnHit. magnet: how close loot must be to be picked up.
  // rest: health comes back at restRegen a second once nothing has hurt the
  // diver for restAfter seconds.
  player: {
    hp: 100, speed: 56, radius: 4, hurtInvuln: 0.5, restAfter: 4, restRegen: 3,
    charge: 60, chargeRegen: 9, chargeOnHit: 3, magnet: 14,
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

  // The star's pull on each floor: full on arrival, it fades over `time`
  // seconds (less by perDepth a floor, to min). Below dimAt the lamp dims
  // (to lampMin) and every waveEvery seconds `wave` more enemies stir in the
  // dark; when it's gone the floor's lodeline goes dark and the Hollow comes.
  pull: { time: 100, perDepth: -5, min: 80, dimAt: 0.5, lampMin: 0.6, waveEvery: 16, wave: 2 },

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
  // the chance each site has a lodeline, up by padPerMag for each magnitude
  // past the first, to no more than padCap.
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
  // An expedition: `sites` long; site 1 is always on the surface; at each
  // exit two ways lead on to other zones. At the last exit, one way leads to
  // the Keeper's Lair (if its shard is still held there) or a Deep Vein.
  expedition: { sites: 4, ways: 2 },
  // Climes: the kind of country a site is, rolled when the way to it is
  // made (so its portal can name it). zones: where it can turn up; weight:
  // how often, times lean[region] in a region it leans to (every clime can
  // turn up in every region). The first of each zone is today's look and
  // has no hazard. gen: overrides of the floor's generator (never more or
  // bigger caverns, which would mean more enemies at once). light: a
  // surface's day, dusk and tint, or underground the ambient and tint.
  // hazard: its one quirk (T.hazards), with `haz` overriding how much of it
  // there is. Looks are in climes.js.
  climes: {
    badlands: { zones: ['surface'], name: 'Badlands', weight: 2 },
    frost: { zones: ['surface'], name: 'Frost Steppe', weight: 2, lean: { choir: 2.5 }, hazard: 'slick', gen: { pillar: 0.4 }, light: { day: 1.0, dusk: 0.55, tint: [0.9, 0.97, 1.1] } },
    cinder: { zones: ['surface'], name: 'Cinder Waste', weight: 2, lean: { underforge: 2.5 }, hazard: 'vent', gen: { pillar: 1 }, light: { day: 0.95, dusk: 0.5, tint: [1.06, 0.86, 0.76] } },
    bloomfen: { zones: ['surface'], name: 'Bloomfen', weight: 2, lean: { rim: 2.5 }, hazard: 'spores', gen: { meander: 0.45, tunnelR: [1.6, 2.4] }, light: { day: 1.0, dusk: 0.58, tint: [0.98, 1.0, 0.86] } },
    caverns: { zones: ['cave', 'deep'], name: 'Caverns', weight: 2 },
    grotto: { zones: ['cave', 'deep'], name: 'Flooded Grotto', weight: 2, lean: { choir: 2.5 }, hazard: 'pool', light: { ambient: 0.5, tint: [0.72, 0.8, 1.0] } },
    magma: { zones: ['cave', 'deep'], name: 'Magma Tubes', weight: 2, lean: { underforge: 2.5 }, hazard: 'burn', gen: { meander: 0.25 }, light: { ambient: 0.4, tint: [1.0, 0.62, 0.5] } },
    rootdeep: { zones: ['cave', 'deep'], name: 'Rootdeep', weight: 2, lean: { rim: 2.5 }, hazard: 'spores', haz: { n: [6, 9] }, gen: { meander: 0.5, pillar: 0.8 }, light: { ambient: 0.44, tint: [0.84, 0.86, 0.66] } },
    archive: { zones: ['ruin'], name: 'Archive', weight: 2 },
    temple: { zones: ['ruin'], name: 'Overgrown Temple', weight: 2, lean: { rim: 2 }, hazard: 'pool', haz: { blobs: [3, 4], r: [1.4, 2.2] }, light: { ambient: 0.52, tint: [0.8, 0.92, 0.72] } },
    vault: { zones: ['ruin'], name: 'Clockwork Vault', weight: 2, lean: { underforge: 2, choir: 1.5 }, hazard: 'vent', light: { ambient: 0.46, tint: [1.0, 0.84, 0.66] } },
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
  // newest: the share of hauls and reaches set in the newest biome open;
  // stale: how many expeditions one stands before it's replaced.
  contracts: { posted: 3, kinds: { haul: 3, hunt: 3, reach: 2, seal: 1, ride: 2 }, star: 25, newest: 0.7, stale: 3 },
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
  // wakes what's within `noise` px.
  tools: {
    compass: { mag: 1, cost: {} },
    oresense: { mag: 2, cost: { ferrite: 14, spore: 3 }, reach: 9 },
    radar: { mag: 2, cost: { ferrite: 14, ether: 3 }, reach: 18 },
    beacon: { mag: 2, cost: { lumenite: 6, cog: 3 }, land: 6, noise: 140 },
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
  // Worked into a forging, each does one thing: gives a weapon or focus an
  // element, guarantees an affix family, or raises the rarity a step.
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

  // Melee. Taps chain a combo, by the weapon's style: each swing hits
  // everything within range in an arc (cos of the half-angle) round the
  // aim, which is the nearest enemy within autoAim, else straight ahead.
  // combo: [damage ×, cooldown, arc cos, knockback px/s, lunge px, swing
  // time]; the last is heavy and staggers (a hammer's every blow is heavy).
  // Another tap within comboWindow carries the combo on. Holding the button
  // chargeStart past a swing starts a charge; let go once it's past
  // chargeFull for the style's charged move: a blade spins, a spear lunges
  // (reach px over time s), a hammer slams the ground, a whip drags enemies
  // in. fist: an empty main hand's damage.
  melee: {
    autoAim: 52, fist: 3, comboWindow: 0.6, chargeStart: 0.25, chargeFull: 0.7,
    styles: {
      blade: { range: 22, combo: [[1, 0.24, 0.3, 70, 4, 0.12], [1, 0.24, 0.3, 70, 4, 0.12], [1.7, 0.45, -0.1, 160, 9, 0.18]], charged: { move: 'spin', mult: 2.4, knock: 180, radius: 28, time: 0.25 } },
      spear: { range: 36, combo: [[1, 0.27, 0.8, 90, 6, 0.12], [1, 0.27, 0.8, 90, 6, 0.12], [1.6, 0.42, 0.75, 180, 12, 0.16]], charged: { move: 'lunge', mult: 2.3, knock: 160, reach: 64, time: 0.2 } },
      hammer: { range: 25, heavy: true, combo: [[1, 0.62, -0.2, 160, 3, 0.2], [1, 0.62, -0.2, 160, 3, 0.2], [1.5, 0.85, -0.5, 240, 6, 0.26]], charged: { move: 'slam', mult: 2.2, knock: 260, radius: 44, time: 0.3 } },
      whip: { range: 34, combo: [[1, 0.28, -0.3, 40, 0, 0.14], [1, 0.28, -0.3, 40, 0, 0.14], [1.5, 0.42, -0.55, 70, 0, 0.18]], charged: { move: 'drag', mult: 2.2, knock: 0, radius: 52, time: 0.22 } },
    },
  },
  // A dash: a burst of speed with a moment of untouchability. A flick of
  // the move thumb (flickPx in flickMs) dashes too.
  dash: { speed: 230, time: 0.13, invuln: 0.22, cooldown: 0.55, flickPx: 26, flickMs: 90 },
  // How hits land: the world freezes for hitstop (heavy: heavyStop);
  // knockback fades at knockDecay a second. The view doesn't shake (the
  // designer found it unpleasant), but the shake values are kept at 0 so it
  // can be tried again.
  impact: { hitstop: 0.045, heavyStop: 0.09, stopGap: 0.15, shake: 0, heavyShake: 0, hurtShake: 0, knockDecay: 9 },

  // Spells: an empty focus casts spark; socketed cores cast their own.
  // power is the focus's power; damage = power × mult. Holding to charge
  // casts at chargedMult the power for chargedCost the charge. A blade fires
  // its cores on every procEvery-th hit at procMult, for no charge.
  spells: {
    castCooldown: 0.3, procEvery: 3, procMult: 0.6, aimRange: 140, chargedMult: 1.8, chargedCost: 1.5,
    // a gauntlet casts at gauntletCost the charge, but only within gauntletRange;
    // a staff reaches staffRange, and its charged cast (three of everything)
    // costs staffChargedCost
    gauntletCost: 0.9, gauntletRange: 70, staffRange: 180, staffChargedCost: 2.4,
    spark: { cost: 5, mult: 0.6, speed: 170 },
    bolt: { cost: 8, mult: 1.0, speed: 170 },
    nova: { cost: 18, mult: 1.3, radius: 34 },
    pull: { cost: 14, mult: 0.5, radius: 72, stun: 0.7, speed: 160 },
    ward: { cost: 20, mult: 2.5, time: 5 },
    frost: { cost: 12, mult: 1.1, speed: 210, pierce: 4 },
    ember: { cost: 16, mult: 1.0, speed: 120, radius: 26, burnTime: 2.5, burn: 0.35 },
    chain: { cost: 14, mult: 0.85, range: 120, jumps: 4, jumpRange: 54, falloff: 0.85 },
    thorns: { cost: 18, mult: 0.45, radius: 24, time: 3, every: 0.5 },
    blink: { cost: 10, mult: 0, reach: 60, invuln: 0.25 },
    well: { cost: 18, mult: 0.3, radius: 56, time: 2.5, pull: 70, every: 0.5 },
    phase: { cost: 12, mult: 1.0, reach: 52, invuln: 0.3 },
  },
  // Modifiers: split fires three at splitMult each; amplify widens by
  // amplifyArea and hits amplifyDmg harder; quicken costs quickenCost and
  // cools down quickenCd faster; chain adds chainJumps; echo recasts after
  // echoDelay at echoMult.
  mods: { splitMult: 0.6, splitSpread: 0.28, amplifyArea: 1.5, amplifyDmg: 1.2, quickenCost: 0.67, quickenCd: 0.7, chainJumps: 2, echoDelay: 0.4, echoMult: 0.6 },
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
  //     bolts themselves); sweep (a close ring in front), burst (a ring swept
  //     out from the diver, or in), placed (swept in where it lands, with a
  //     rune circle, glyph: [radius from, to as a share of the reach,
  //     seconds]), guard (a ring drawing in round the diver: ring [from, to],
  //     motes rising), move (ghosts afterimages, alpha, ends: a ring at each
  //     end [small, big radius, seconds]). from: the radius a sweep starts
  //     at (or ends at, inwards); time: its seconds; dust: motes of dust it
  //     pushes; scatter: bits of its element thrown out; bloom: [light
  //     radius as a share of the reach (move: tiles), light, seconds]; big:
  //     its cast has the big rune circle.
  //   shapeOf: today's spells' shapes.
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
      sweep: { from: 3, time: 0.2, dust: 6, bloom: [1, 0.8, 0.2] },
      burst: { from: 4, time: 0.32, dust: 12, scatter: 12, bloom: [1.2, 1.1, 0.3], big: true },
      placed: { from: 4, time: 0.42, dust: 10, glyph: [0.5, 0.3, 0.7], bloom: [1.2, 1.1, 0.3], big: true },
      guard: { ring: [18, 9], time: 0.32, motes: 10, bloom: [1.2, 0.9, 0.3], big: true },
      move: { ghosts: 6, time: 0.3, alpha: 0.4, ends: [3, 12, 0.18], bloom: [2, 1.2, 0.25] },
    },
    shapeOf: { spark: 'projectile', bolt: 'projectile', frost: 'projectile', ember: 'projectile', chain: 'projectile', nova: 'burst', pull: 'burst', thorns: 'burst', well: 'placed', ward: 'guard', blink: 'move', phase: 'move' },
    bolt: { originT: 0.07, trail: 5, every: 0.035 }, impact: [7, 1.1, 1.1, 0.16], decal: [1.6, 16],
    charge: { motes: 40, glyph: [5, 13] },
    echo: 0.3,
    cap: 180, flares: 10, day: 0.33,
  },
  // Elements a weapon or focus carries. shock: this share of hits arcs on;
  // frost: hits chill, and a heavy hit on the chilled shatters for `shatter`
  // times; ember: hits burn for burnTime, `burn` of the hit a second; blight:
  // poison for blightTime, `blight` of the hit a second, spreading within
  // blightSpread px when its host falls.
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
    // elites: chance eliteBase + eliteDepth × depth, to eliteMax
    eliteBase: 0.06, eliteDepth: 0.035, eliteMax: 0.35, eliteHp: 2.5, eliteDmg: 1.3,
    fast: 1.5, tough: 1.6, volatileRadius: 26, volatileDmg: 1.5, volatileFuse: 0.6,
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
    blade: { dmg: 6, cost: 8 }, focus: { power: 6, cost: 8 },
    armor: { armor: 4, armorGrowth: 0.75, hp: 16, hpGrowth: 1.5, cost: 10 },
    charm: { cost: 6 }, pick: { speedGrowth: 0.12, cost: 12 }, core: { cost: 10, growth: 0.25 },
    affixes: { common: 1, magic: 2, rare: 3, legendary: 3, set: 2 },
    socket: { blade: 0.35, focus: 1, secondFocus: 0.5 },
    armorK: 50, // damage taken × armorK / (armorK + armor)
  },
  // Caps on what affixes can add up to.
  caps: { crit: 50, atkSpeed: 100, moveSpeed: 50, leech: 15, shock: 60, chill: 60, oreLuck: 100, mineSpeed: 200 },

  // The rune bench, in ore of the item's tier. add also raises the rarity.
  runes: { reroll: 4, upgrade: 6, upgradeBy: 0.2, add: 10 },
  salvage: { back: 0.4, exotic: 0.15, exoticRare: 0.5 },

  // The Lodestar. Each ore fed is worth tier² points; magnitude n needs
  // levels[n - 1] points in all. Each level past the first is an
  // attunement point and reaches lodelines a floor deeper. biomeAt: the
  // magnitude each biome opens at.
  // extractStar: what a ride home feeds the star, times the depth squared.
  star: { levels: [0, 60, 250, 900, 3000, 6000, 10000, 15000], biomeAt: [1, 3, 5], extractStar: 8 },
  // The story: each region's Keeper waits in its lair, at the end of an
  // expedition, holding a shard of the star's heart; each shard set in the star adds shardStar points.
  // An echo (a log of the crews before) turns up by an ancient forge, from
  // an elite now and then, and from every Keeper.
  story: { shardStar: 400, echoForge: 0.5, echoElite: 0.05 },
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
    might: { name: 'Might', text: '+8% melee damage', max: 5, meleeDmg: 8 },
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
  art: {
    px: 1.5, tones: 4, hueShift: [0.2, 0.3, 0.05], violet: 255, gold: 50, groundHue: [0.1, 0.1, 0],
    form: { edge: 1.5, body: 0.3, part: 2, depth: 1.6, light: 0.5, shade: 0.32, fall: 0.1, crease: 0.24 },
    dither: false, outline: { creature: 'black', prop: 'selout' }, selout: 0.42,
    cluster: { patch: 9, grain: 3, cut: 0.32 }, rockCut: 0.34, sunGround: { soften: 0.55, cut: 0.4 }, groundDither: true,
    lightSteps: 5, lightDither: 0.3,
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
    bed: { reach: 5, squash: 0.62, fray: 0.6, deep: 0.45, outer: 0.3, inner: 0.55, litter: 0.6, drift: 0.6 },
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
  // bloom: [downscale, strength] passes, times glow. The lamp's radius may
  // become a dial that shrinks with depth.
  light: {
    ambient: 0.45, hubAmbient: 0.85, tint: [0.72, 0.76, 0.95], max: 1.9,
    lamp: [5, 1.35], ore: [1.7, 0.75], flora: 0.3,
    glow: 0.75, bloom: [[3, 0.7], [7, 0.6]],
    // Shadows (shadow.js; cosmetic). walls: the rock stops the lamp;
    // baked: and the floor's fixed lights (lava, vents, glowing plants).
    // eye: the dome's height over the feet (world px), where the lamp's
    // light is centred; its shadows are cast from under it. rays: how many
    // rays for each cell round the edge of the light's reach; step: art px
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
      walls: true, baked: true, eye: 17, rays: 1.25, step: 2, reach: 3, top: 0,
      props: { steps: [0.2, 0.38], dark: [0.66, 0.48], core: [0.62, 0.6], len: [9, 0.12, 18], tall: 30, size: [0.6, 1.3], crown: 0.3, back: 0.35, fray: 0.35, portal: 9 },
    },
  },

  ui: { tapGuard: 0.4 }, // seconds a new screen ignores taps
};
