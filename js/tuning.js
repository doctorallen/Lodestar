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
    charge: 50, chargeRegen: 5, chargeOnHit: 3, magnet: 14,
  },

  // Mining: the ore tile's nearest edge must be within `reach` of the feet
  // (10 reaches a wall from the middle of a corridor); the one nearest a
  // point `ahead` px in front of the diver is the target. A hardness-1
  // ore breaks after 1 / speed seconds of holding MINE, times the pick's
  // speed.
  mine: { reach: 10, ahead: 10, speed: 1.4, hitEvery: 0.22, yield: [1, 2] },

  // Cargo is counted in units: ore and exotics weigh 1, gear and relics
  // itemWeight.
  cargo: { capacity: 30, itemWeight: 3 },

  // Floors: a w × h tile grid of lumpy caverns (radius roomR tiles, at least
  // roomGap apart) joined by tunnels that wander (meander: how hard the
  // heading drifts each half-tile) at a half-width of tunnelR tiles, plus a
  // few extra tunnels so there are loops. pillar: the chance a big cavern
  // keeps a pillar of rock. wallNoise: how far the walls' line wanders off
  // the tiles. veins: ore veins per cavern (none in the entry's). The
  // Lodestar's line reaches every floor down to padSure (more as it grows,
  // see star); below that the chance falls by padFade a floor, to no less
  // than padMin.
  floor: {
    w: 52, h: 52,
    rooms: [7, 10], roomR: [2.5, 4.8], roomGap: 3, loops: [1, 3],
    tunnelR: [1.0, 1.6], meander: 0.35, pillar: 0.4, wallNoise: 0.14,
    veins: [1, 2], veinLen: [2, 4],
    padSure: 3, padFade: 0.15, padMin: 0.35,
  },
  // The chance a vein is the biome's deeper ore, by depth.
  oreDeep: { base: 0.12, perFloor: 0.06, max: 0.6 },

  ores: [
    { id: 'ferrite', name: 'Ferrite', tier: 1, hardness: 1.0 },
    { id: 'lumenite', name: 'Lumenite', tier: 2, hardness: 1.5 },
    { id: 'resonite', name: 'Resonite', tier: 3, hardness: 2.0 },
    { id: 'aetherglass', name: 'Aetherglass', tier: 4, hardness: 2.6 },
    { id: 'sigilite', name: 'Sigilite', tier: 5, hardness: 3.3 },
    { id: 'starmetal', name: 'Starmetal', tier: 6, hardness: 4.0 },
  ],
  // Exotic materials: dropped by elites (and now and then anything else).
  // In a craft, each guarantees an affix from its family; a lodestone shard
  // raises the rarity a step instead.
  exotics: [
    { id: 'voltaic', name: 'Voltaic crystal', family: 'shock' },
    { id: 'bloodresin', name: 'Bloodresin', family: 'leech' },
    { id: 'frostglass', name: 'Frostglass', family: 'chill' },
    { id: 'lodeshard', name: 'Lodestone shard', family: null },
  ],

  // Each biome's look is in art.js, under the same id. A floor's enemy level
  // is biome × levelPerBiome + depth.
  biomes: [
    { id: 'rim', name: 'The Rim', ores: ['ferrite', 'lumenite'] },
    { id: 'choir', name: 'The Choir', ores: ['resonite', 'aetherglass'] },
    { id: 'underforge', name: 'The Underforge', ores: ['sigilite', 'starmetal'] },
  ],
  levelPerBiome: 4,

  // Melee. Taps chain a combo: each swing hits everything within range in
  // an arc (cos of the half-angle) round the aim, which is the nearest enemy
  // within autoAim, else straight ahead. combo: [damage ×, cooldown, arc cos,
  // knockback px/s, lunge px, swing time]; the last is heavy, and staggers.
  // Another tap within comboWindow carries the combo on. Holding the button
  // chargeStart past a swing starts a charge; let go once it's past
  // chargeFull for a spin that hits all round (charged). fist: an empty
  // main hand's damage.
  melee: {
    range: 22, autoAim: 52, fist: 3, comboWindow: 0.6, chargeStart: 0.25, chargeFull: 0.7,
    combo: [[1, 0.24, 0.3, 70, 4, 0.12], [1, 0.24, 0.3, 70, 4, 0.12], [1.7, 0.45, -0.1, 160, 9, 0.18]],
    charged: { mult: 2.4, knock: 180, radius: 28, time: 0.25 },
  },
  // A dash: a burst of speed with a moment of untouchability. A flick of
  // the move thumb (flickPx in flickMs) dashes too.
  dash: { speed: 230, time: 0.13, invuln: 0.22, cooldown: 0.55, flickPx: 26, flickMs: 90 },
  // How hits land: the world freezes for hitstop (heavy: heavyStop);
  // knockback fades at knockDecay a second. The view doesn't shake (the
  // designer found it unpleasant), but the shake values are kept at 0 so it
  // can be tried again.
  impact: { hitstop: 0.045, heavyStop: 0.09, shake: 0, heavyShake: 0, hurtShake: 0, knockDecay: 9 },

  // Spells: an empty focus casts spark; socketed cores cast their own.
  // power is the focus's power; damage = power × mult. Holding to charge
  // casts at chargedMult the power for chargedCost the charge. A blade fires
  // its cores on every procEvery-th hit at procMult, for no charge.
  spells: {
    castCooldown: 0.3, procEvery: 3, procMult: 0.6, aimRange: 140, chargedMult: 1.8, chargedCost: 1.5,
    spark: { cost: 5, mult: 0.6, speed: 170 },
    bolt: { cost: 8, mult: 1.0, speed: 170 },
    nova: { cost: 18, mult: 1.3, radius: 34 },
    pull: { cost: 14, mult: 0.5, radius: 72, stun: 0.7, speed: 160 },
    ward: { cost: 20, mult: 2.5, time: 5 },
  },
  // shock arcs to the nearest other enemy within shockRange for shockMult;
  // chill slows by chillSlow for chillTime.
  onHit: { shockRange: 48, shockMult: 0.5, chillSlow: 0.5, chillTime: 2 },

  // Enemies at level 1; each level multiplies hp by hpGrowth and damage by
  // dmgGrowth. windup: the tell before an attack. weight: how often each
  // turns up. No more than `attackers` (plus attackersPerDepth a floor)
  // wind up at once; the rest circle.
  // A heavy hit staggers anything but the warden for staggerTime.
  enemies: {
    hpGrowth: 1.16, dmgGrowth: 1.08, aggro: 96, hurtFlash: 0.08, attackers: 2, attackersPerDepth: 0.34, staggerTime: 0.35,
    // crawlers close to `circle` px, circle for a moment, wind up, lunge,
    // then recover (open to a counter)
    crawler: { hp: 22, dmg: 10, speed: 36, radius: 5, circle: 28, windup: 0.45, lungeSpeed: 125, lungeTime: 0.28, recover: 0.55, weight: 5 },
    // wisps keep `keep` px away and strafe; from fanDepth they fire three
    wisp: { hp: 14, dmg: 8, speed: 28, radius: 4, keep: 60, range: 115, windup: 0.55, cooldown: 1.9, shotSpeed: 72, fanDepth: 3, weight: 3 },
    // constructs show where they'll charge; one that hits a wall is dazed
    construct: { hp: 45, dmg: 15, speed: 20, radius: 6, range: 80, windup: 0.7, cooldown: 2.2, chargeSpeed: 135, chargeTime: 0.5, dazed: 1.3, weight: 2, minDepth: 2 },
    // flora that fights: rooted, hidden among the harmless kind until it
    // wakes. A snapjaw snaps at anything within `reach`; a spitter lobs a
    // glob that leaves spores on the ground (`puddle` px across, hurting
    // puddleDps a second for puddleTime)
    snapjaw: { hp: 30, dmg: 13, speed: 0, radius: 6, reach: 24, windup: 0.5, cooldown: 1.5, weight: 2, rooted: true },
    spitter: { hp: 20, dmg: 6, speed: 0, radius: 5, range: 110, windup: 0.6, cooldown: 2.4, shotSpeed: 60, puddle: 14, puddleDps: 9, puddleTime: 2.6, weight: 2, minDepth: 2, rooted: true },
    // the practice target at the outpost: it never fights back or falls
    dummy: { hp: 400, dmg: 0, speed: 0, radius: 6 },
    warden: { hp: 380, dmg: 16, speed: 18, radius: 9, range: 95, windup: 0.75, cooldown: 2.0, chargeSpeed: 125, chargeTime: 0.6, dazed: 1.6, shotSpeed: 65, shots: 10 },
    // a room's enemies: perRoom + perDepth × depth, give or take one
    perRoom: 1.2, perDepth: 0.35, maxPerRoom: 6,
    // elites: chance eliteBase + eliteDepth × depth, to eliteMax
    eliteBase: 0.04, eliteDepth: 0.03, eliteMax: 0.35, eliteHp: 2.5, eliteDmg: 1.3,
    fast: 1.5, tough: 1.6, volatileRadius: 26, volatileDmg: 1.5, volatileFuse: 0.6,
    // the warden appears from bossDepth, in a side room, by chance
    bossDepth: 4, bossChance: 0.3,
  },

  // Drops. rarity weights: [base, per depth]. motes heal.
  loot: {
    drop: 0.18, eliteDrops: 1, bossDrops: 3, exotic: 0.04, eliteExotic: 0.6,
    relic: 0.01, eliteRelic: 0.12, bossRelic: 0.6, mote: 0.14, moteHeal: 14,
    rarity: { common: [60, -2], magic: [30, 1], rare: [8, 1.2], legendary: [1, 0.35], set: [0.8, 0.25] },
  },

  // Gear. Base numbers at tier 1, times tierGrowth a tier (affixes grow by
  // affixGrowth a tier). Each kind's crafting cost is in ore of its tier
  // (a pick is made from the ore it's named for, and breaks the next one).
  items: {
    tierGrowth: 1.45, affixGrowth: 0.3,
    blade: { dmg: 6, cost: 8 }, focus: { power: 6, cost: 8 },
    armor: { armor: 4, armorGrowth: 0.75, hp: 10, hpGrowth: 1.35, cost: 10 },
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
  star: { levels: [0, 60, 250, 900, 3000, 6000, 10000, 15000], biomeAt: [1, 3, 5], extractStar: 3 },
  // An ancient forge stands on a floor this deep or deeper, by chance.
  fieldForge: { depth: 3, chance: 0.3 },
  // The anvil: three strikes, each a marker sweeping a bar at `speeds`
  // (sweeps a second); a strike inside the zone (zone wide, narrowing by
  // shrink a strike) is good, inside its middle `perfect` is perfect.
  // Quality (perfect 1, good 0.5, summed, rounded down) picks the rarity
  // odds: [common, magic, rare, legendary] for quality 0–3.
  anvil: {
    speeds: [0.9, 1.25, 1.6], zone: 0.26, shrink: 0.04, perfect: 0.3,
    odds: [[55, 35, 10, 0], [40, 42, 16, 2], [25, 44, 26, 5], [10, 38, 40, 12]],
  },
  attune: {
    vitality: { name: 'Vitality', text: '+15 max health', max: 5, maxHp: 15 },
    capacity: { name: 'Capacity', text: '+6 cargo', max: 5, cargo: 6 },
    might: { name: 'Might', text: '+8% melee damage', max: 5, meleeDmg: 8 },
    clarity: { name: 'Clarity', text: '+8% spell damage', max: 5, spellDmg: 8 },
    stride: { name: 'Stride', text: '+5% move speed', max: 5, moveSpeed: 5 },
  },

  // Light (render.js). The world dims to `ambient` (tinted; at home, the
  // brighter hubAmbient); lights add back
  // [radius in tiles, strength]; the result is cut into `bands` dithered
  // steps, never brighter than `max`. flora: how bright a plant's glow is.
  // floraCeiling, floraWall: the share of ground under a wall face that
  // something hangs over, or grows at the foot of; floraNearWall, floraOpen:
  // the share of other ground, by a wall or out in the open, that grows a
  // plant (fewer at the outpost). bloom: [downscale, strength] passes, times
  // glow. The lamp's radius may become a dial that shrinks with depth.
  light: {
    ambient: 0.45, hubAmbient: 0.85, tint: [0.72, 0.76, 0.95], bands: 4, max: 1.9,
    lamp: [5, 1.35], ore: [1.7, 0.75], flora: 0.3,
    floraCeiling: 0.08, floraWall: 0.07, floraNearWall: 0.16, floraOpen: 0.025,
    glow: 0.75, bloom: [[3, 0.7], [7, 0.6]],
  },

  ui: { tapGuard: 0.4 }, // seconds a new screen ignores taps
};
