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
    { id: 'ferrite', name: 'Ferrite', tier: 1, hardness: 1.0, color: '#b8573a', glint: '#ffb27a' },
    { id: 'lumenite', name: 'Lumenite', tier: 2, hardness: 1.5, color: '#2fae8f', glint: '#b8ffe6' },
    { id: 'resonite', name: 'Resonite', tier: 3, hardness: 2.0, color: '#7364e8', glint: '#d6ccff' },
    { id: 'aetherglass', name: 'Aetherglass', tier: 4, hardness: 2.6, color: '#7cc8e8', glint: '#f0fcff' },
    { id: 'sigilite', name: 'Sigilite', tier: 5, hardness: 3.3, color: '#d9a02a', glint: '#fff0a8' },
    { id: 'starmetal', name: 'Starmetal', tier: 6, hardness: 4.0, color: '#e8dcb0', glint: '#ffffff' },
  ],

  biomes: [
    // ground: the floor; rock: the tops of walls, darker than the floor so
    // walls read as walls; wall: their lit faces and rims
    { id: 'rim', name: 'The Rim', ores: ['ferrite', 'lumenite'], ground: '#3b342d', rock: '#141217', wall: '#5e5145', accent: '#8fe8d0' },
    { id: 'choir', name: 'The Choir', ores: ['resonite', 'aetherglass'], ground: '#2e3346', rock: '#101119', wall: '#4d5574', accent: '#c4b8ff' },
    { id: 'underforge', name: 'The Underforge', ores: ['sigilite', 'starmetal'], ground: '#3d2a24', rock: '#150d0c', wall: '#653a2e', accent: '#ffb85a' },
  ],

  ui: { tapGuard: 0.4 }, // seconds a new screen ignores taps
};
