'use strict';
// ---------------------------------------------------------------------------
// The story. The Meridian was dragged out of the sky by the pull of a fallen
// star and broke on the rim of the sinkhole beneath it. Its beacon still
// works, but it needs power, and the only power here is the Lodestar, which
// is dying: its heart was shattered, and the Hollow carried the shards down
// into the dark. A Shard Keeper guards one at the bottom of each biome.
// Bring the three home, set them in the star, and the beacon can be lit.
//
// It's told in a short opening; by Wick, the diver's drone, in a line or two
// when something happens for the first time; by the star itself, which
// speaks as it grows; and in echoes, logs of the crews the star pulled down
// before, found in the depths and read at the wreck.
// ---------------------------------------------------------------------------

const STORY_INTRO = [
  'The Meridian was three days out when every instrument died at once.',
  'Something below had a pull no engine could fight. We fell out of the sky towards a light.',
  'A star. Fallen, cracked, hanging over a hole in the world, and dragging everything into it.',
  "I'm Wick, your drone. The ship is a wreck, but its beacon still works. It only needs power.",
  "The star has power. What's left of it. Its heart was shattered, and something in the dark carried the pieces down. Bring them back, and we can call for home.",
];

// Wick, the first time each thing happens.
const WICK = {
  firstDive: 'Through we go. Mine what glows, and mind the dark. The gold beam is our way back.',
  firstParts: 'Parts from what you killed. The forge can bind them into gear.',
  firstBlueprint: "A blueprint. Someone made things down here once. Get it home and we'll learn it.",
  firstForge: 'Strike when the marker crosses the glow. The better the strikes, the better the piece.',
  noPad: "No lodeline reaches this far. We go on, or I call us back from the pause menu, and the dark keeps a share of what we carry.",
  rift: 'A tear in the world. Things leak through. Seal it, and something solid is left behind.',
  rift_graft: "That ground isn't from here. Neither is the ore in it.",
  rift_bloom: 'The rock round the tear has woken. It is all ore now.',
  rift_gate: 'Two tears, one place. Step into one and out of the other.',
  rift_inversion: "Daylight, down here. It's coming out of the tear.",
  riftGate: 'I will never get used to that.',
  riftSealed: 'Riftglass. Forge with it, and the piece comes out a tier above its ore.',
  storm: "A lodestorm. Watch the ground: where it flickers, the sky is about to hit. It charges ore, if we let it.",
  riftSpawn: "Something came through the tear. It'll keep coming until we seal it.",
  pullFading: "The star's grip is slipping on this floor. We shouldn't stay much longer.",
  choir: 'The Choir. Everything here hums when it is struck. Even you.',
  underforge: "The Underforge. These ruins were built by someone. They didn't leave.",
  keeper: "That's a Keeper. It's holding a piece of the star's heart. I can feel it from here.",
  shard: 'A heart-shard! It hums like the star does. It is ours now, whatever happens. Take it home.',
  shardHome: 'Set it in the star, at the altar.',
  allShards: 'All three. The star is whole again. The beacon on the Meridian will take its light now.',
  echo: 'An echo: a log from a crew that fell before us. I will keep it at the wreck.',
};

// The star, as it grows, and as its heart comes back.
const STAR_SPEAKS = {
  2: '…light… you carry it back to me…',
  3: '…I remember falling. I remember the ones who fell after me…',
  4: '…they took my heart into the deep. They wanted to be warm…',
  5: '…the Hollow were travellers once. Like you. They stayed too long in the dark…',
  6: '…I pull because I am lonely. I did not know how to stop…',
  7: '…you could stay. Many have…',
};
const STORY_END = [
  'The star takes back its heart, and the light runs down its lodelines, and up the Meridian\'s mast.',
  'The beacon wakes. Somewhere far above, someone is listening.',
  "Wick: They're coming. Hours, maybe. Days at most.",
  'The star lets go of the sky. For the first time since it fell, nothing more will fall with it.',
  'You could leave when they come. Or you could stay a while, and see what the deep still holds.',
];
const SHARD_SPEAKS = [
  '…one piece of me, home… I can see further…',
  '…two… I can feel the sky again…',
  '…whole. Thank you. Go home, little light. I will let go.',
];

// Echoes: logs of the crews before, found in the depths, read at the wreck.
const ECHOES = [
  { title: 'Halcyon, day 1', text: "Pulled down. Hull's cracked but we're alive. There's a star here. Fallen, I mean. Hanging in the air over a pit." },
  { title: 'Halcyon, day 9', text: 'Built a forge from the drive housings. The ore down there takes an edge like nothing I have seen. The creatures fight like they mean it.' },
  { title: 'Halcyon, day 31', text: 'Marrow went down past the singing caves and did not come back. We heard her singing with them, after.' },
  { title: 'Saltmarsh survey log', text: 'Fourth ship found on the rim. All of them fell the same way. The star is not a star. It is a lure, or a well, or a wound.' },
  { title: 'Unsigned', text: 'The deeper you go the less the star can hold you. I stayed too long. Something walked with me in the dark. It wore my coat.' },
  { title: 'Halcyon, day 60', text: 'We broke the heart. We thought it would let go of us. It only went dark, and the dark came up out of the pit to take the pieces.' },
  { title: 'Keeper notes', text: 'The things guarding the shards are not guarding them. They are warming themselves on them, the way we warm ourselves at a fire.' },
  { title: 'Last log of the Halcyon', text: 'If you are reading this, light the beacon. Do not do what we did. Mend it. Then go home.' },
];

const Story = {
  // A line from Wick, once ever (and queued, so lines don't talk over each other).
  say(id) {
    const said = Save.data.said || (Save.data.said = {});
    if (said[id] || !WICK[id]) return;
    said[id] = true;
    UI.speak('WICK', WICK[id]);
  },
  // The star, when it grows: a line for every magnitude it passed (a big
  // feed can pass two), what opened, and the attunement to spend.
  starGrew() {
    const s = Save.data, mag = magnitudeOf(s.star);
    if (s.magSeen === undefined) s.magSeen = mag;
    if (mag <= s.magSeen) return;
    for (let m = s.magSeen + 1; m <= mag; m++) {
      if (STAR_SPEAKS[m]) UI.speak('THE STAR', STAR_SPEAKS[m], 'star');
      const b = T.star.biomeAt.indexOf(m);
      if (b > 0) UI.toast(`The star reaches the ${T.biomes[b].name}`, 'legendary');
    }
    UI.toast(`Magnitude ${mag}: ${mag - s.magSeen > 1 ? 'attunements' : 'an attunement'} to spend at the altar`);
    s.magSeen = mag;
    Save.save();
  },

  // The opening, the first time the game is played.
  intro() {
    if (Save.data.introSeen) return false;
    UI.openStory(STORY_INTRO, () => { Save.data.introSeen = true; Save.save(); UI.tip('hub', 'Walk to the portal under the star to set out'); });
    return true;
  },

  shardsHeld() { return (Save.data.shards || []).length; },
  shardsSet() { return Save.data.shardsSet || 0; },

  // Picking up a heart-shard: it's bound to the diver, safe from any fall.
  takeShard(biome) {
    const s = Save.data;
    s.shards = s.shards || [];
    if (!s.shards.includes(biome)) s.shards.push(biome);
    Save.saveField('shards');
    Story.say('shard');
  },

  // At the altar: set any shards carried home into the star.
  setShards() {
    const s = Save.data, held = (s.shards || []).length, set = s.shardsSet || 0;
    if (held <= set) return false;
    s.shardsSet = held;
    s.star += T.story.shardStar * (held - set);
    Save.save();
    UI.speak('THE STAR', SHARD_SPEAKS[held - 1], 'star');
    Story.starGrew();
    if (held === 3) Story.say('allShards');
    return true;
  },

  // An echo found in the depths: the next one not yet read.
  findEcho() {
    const s = Save.data;
    s.echoes = s.echoes || [];
    if (s.echoes.length >= ECHOES.length) return null;
    const i = s.echoes.length;
    s.echoes.push(i);
    Save.saveField('echoes');
    Story.say('echo');
    return ECHOES[i];
  },

  canLight() { return Story.shardsSet() >= 3; },
};
