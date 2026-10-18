'use strict';
// ---------------------------------------------------------------------------
// Every gameplay number in one place. Distances are world pixels, times are
// seconds, speeds px/s. DESIGN.md explains the systems; where the two
// disagree, this file is the truth.
// ---------------------------------------------------------------------------

const T = {
  player: { speed: 56, radius: 4 },

  // Mining: the ore tile's nearest edge must be within `reach` of the feet
  // (10 reaches a wall from the middle of a corridor); the one
  // nearest a point `ahead` px in front of the prospector is the target. A
  // hardness-1 ore breaks after 1 / speed seconds of holding MINE.
  mine: { reach: 10, ahead: 10, speed: 1.4, hitEvery: 0.22, yield: [1, 2] },

  cargo: { capacity: 30 },

  // Floors: a w × h tile grid of rooms joined by corridors, plus a few extra
  // corridors so there are loops. veins: ore veins per room (none in the
  // entry room). The Lodestar's line reaches every floor down to padSure;
  // below that the chance falls by padFade a floor, to no less than padMin.
  floor: {
    w: 48, h: 48,
    rooms: [7, 10], roomW: [4, 9], roomH: [4, 7], loops: [1, 3],
    veins: [1, 3], veinLen: [2, 5],
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

  // Each biome's look is in art.js, under the same id.
  biomes: [
    { id: 'rim', name: 'The Rim', ores: ['ferrite', 'lumenite'] },
    { id: 'choir', name: 'The Choir', ores: ['resonite', 'aetherglass'] },
    { id: 'underforge', name: 'The Underforge', ores: ['sigilite', 'starmetal'] },
  ],

  // Light (render.js). The world dims to `ambient` (tinted); lights add back
  // [radius in tiles, strength]; the result is cut into `bands` dithered
  // steps, never brighter than `max`. decoChance: the share of open ground
  // that grows something glowing. bloom: [downscale, strength] passes, times
  // glow. The lamp's radius may become a dial that shrinks with depth.
  light: {
    ambient: 0.45, tint: [0.72, 0.76, 0.95], bands: 4, max: 1.9,
    lamp: [5, 1.6], ore: [1.7, 0.75], deco: [1.4, 0.55], decoChance: 0.05,
    glow: 0.75, bloom: [[3, 0.7], [7, 0.6]],
  },

  ui: { tapGuard: 0.4 }, // seconds a new screen ignores taps
};
