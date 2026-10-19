'use strict';
// ---------------------------------------------------------------------------
// The story. You're a Kindler of the Lodestar Charter. Kindlers ride
// seed-stars down to dead worlds, plant them, and carry their light outward,
// spire by spire, until the colony waiting in orbit can land. This seed, the
// Lodestar, struck wrong, cracked, and sank into a sinkhole; you and Wick
// climbed out of the landing capsule onto its rim. The Meridian, the colony
// ship, waits above.
//
// The turn comes in ring 2, in the echoes (logs of the Kindlers before):
// the world wasn't dead. The dark is its own living night, the Hollow is
// what grows in it, and the Keepers are earlier seed-stars that went dark.
// Their shards strengthen the Lodestar so its light reaches further. At the
// Edge, the heart of the dark, you choose: kindle it, or leave it.
//
// It's told in a short opening; by Wick, the Kindler's drone, in a line the
// first time something happens; by the star, which speaks as it grows; in
// eight echoes, read at the uplink; by the settlers, as the outpost fills;
// and in one line in the log for each territory kindled.
//
// The rule: nobody ever says it outright. No line says the dark is alive or
// that the Keepers were stars; the echoes and the star let it show.
//
// For the world (rings, spires, territories). Wick's lines, each said once
// ever through Story.say(key):
//   firstSpire     the first spire planted
//   firstKindled   the first territory kindled
//   firstTide      the first dark tide
//   firstDeep      the first Deep entered
//   ring2, ring3   first entering ring 2, ring 3
//   theEdge        first reaching the Edge
//   firstSettlers  the first settlers at the outpost (said here, on coming
//                  home, once storyKindledCount() brings a lander)
//   firstFeed      the first time the star is fed at its altar (hub.js)
// And:
//   storyKindledCount()           territories kindled (0 with no world yet)
//   storyLanders()                landers the Meridian can send
//   kindleLogLine(clime, name)    the log's line for a territory kindled
//   playKindlerEnding(choice, done)  'kindle' or 'leave', at the Edge
//   Story.canCall(), Story.callLanders(done)  the colony, called at the uplink
// The uplink is the station with the id 'wreck' (floor.js HUB_STATIONS),
// kept so the outpost's layout needn't change.
// ---------------------------------------------------------------------------

// Said once, before the opening, to a player whose save came from before
// circuits.
const FRESH_START_LINE = 'The land round the star is one world now, to walk and kindle territory by territory, so your outpost starts afresh.';

// The opening: five panels, a tap each. The panels are words only for now;
// what each should show, when they get art:
const STORY_INTRO = [
  // a seed-star falling through the dark between stars, a capsule riding
  // its wake, the Charter's mark (the pale gold seed-star the Kindler wears
  // on the chest) on the capsule's side
  'The Lodestar Charter sends seed-stars to dead worlds. A Kindler rides down with each one, to plant it and carry its light outward.',
  // the star striking stone at a bad angle, a crack of light across it,
  // the ground giving way into a sinkhole
  'This seed struck wrong. It cracked, and sank into a hole in the world. The capsule came down on the rim.',
  // the Meridian high above, small and patient against the stars, its
  // settlers asleep in rows
  'High above, the colony ship Meridian waits in orbit. Its settlers sleep until there is ground lit enough to land on.',
  // the Kindler climbing out of the capsule: the blue Charter suit with its
  // amber circuits, the faced helm's dark glass and its brow lamp lit; Wick,
  // grey with its teal eye, over a shoulder; the star over the pit, its
  // light reaching only a few steps
  "I'm Wick, your drone. The star's hurt, but it's alive. For now its light barely reaches the rim.",
  // the outpost's first lantern lit, the dark all round it, and the
  // Kindler's brow lamp turned out towards it
  'So we do what Kindlers do. Feed it, carry its light out spire by spire, and call the landers down when the ground can hold them.',
];

// Wick, the first time each thing happens. Dry, and kind.
const WICK = {
  firstDive: "Out we go. Mine what glows, and watch your light. Out in the dark it only lasts so long.",
  firstParts: 'Parts, from what you killed. A lot of teeth, for a dead world. The forge can bind them into gear.',
  firstBlueprint: "A blueprint. Charter make, older than ours. Get it home and we'll learn it.",
  firstForge: 'Strike when the marker crosses the glow. The better the strikes, the better the piece.',
  rift: 'A tear in the world. Things leak through. Seal it, and something solid is left behind.',
  rift_graft: "That ground isn't from here. Neither is the ore in it.",
  rift_bloom: 'The rock round the tear has woken. It is all ore now.',
  rift_gate: 'Two tears, one place. Step into one and out of the other.',
  rift_inversion: "Daylight, down here. It's coming out of the tear, not from us.",
  riftGate: 'I will never get used to that.',
  riftSealed: 'Riftglass. Forge with it, and the piece comes out a tier above its ore.',
  storm: "A lodestorm. The star's restless. Where the ground flickers, the sky's about to hit. It charges ore, if we let it.",
  riftSpawn: "Something came through the tear. It'll keep coming until we seal it.",
  pullFading: "Our light's thinning here. We shouldn't stay much longer.",
  // the first Deep under each outer region
  choir: "The Choir. Everything here hums when it's struck. Even you. The survey called it silent.",
  underforge: 'The Underforge. Someone built this. The survey said no one ever had.',
  keeper: "That's a Keeper. What it's holding hums like our star does. Only colder.",
  shard: "A shard. It's ours now, whatever happens. Take it home.",
  shardHome: 'Set it in the star, at the altar. It should reach further for it.',
  allShards: "All three. Our star's never shone like this. They'll see it from orbit.",
  echo: "An echo: a Kindler's log, from before us. I'll keep it at the uplink.",
  // the first time the star is fed, at its altar (hub.js)
  firstFeed: "By the book, then. A seed-star is planted small and fed the land's ore until it can light a world. Your first. You're doing fine.",
  // the world's (see the list at the top)
  firstSpire: "Our first spire. Kindlers don't conquer. We just carry the light a little further than it was.",
  firstKindled: "Kindled. The ground's warming already. Funny how quiet it went.",
  firstTide: "The dark's coming back in, like a tide. Hold the spire and it'll go out again. It always has.",
  firstDeep: "A Deep. Down here the star can't see us at all. Quick in, quicker out.",
  ring2: "The second ring. Nobody's mapped this far. Nobody but whoever left those logs.",
  ring3: "The third ring. The dark's thick enough to lean on out here. Stay close.",
  theEdge: "The Edge. Whatever this world has at its heart, it's out there. I don't think it's sleeping.",
  firstSettlers: "The first lander's down. Settlers, on the rim. Try to look like you know what you're doing.",
  // natures (natures.js)
  weakHit: "It hates that. I'll mark what each kind fears over its head: a point up for what hurts it, down for what it shrugs off.",
  resistHit: "That barely touched it. Some things shrug an element off. Try the other hand.",
  warded: "That one's warded. Only something blunt will crack its shell.",
  wardBroken: 'The ward is down. Everything works on it now.',
  shifting: 'Its colour keeps changing, and so does what it fears. Watch the mark.',
  // reactions (reactions.js), the first time each happens
  react_shatter: 'Shatter! Ice breaks under a blow. Chill them, then hit them hard.',
  react_conduct: 'Conduct! Shock runs through everything that is chilled.',
  react_steam: "Steam. Fire on ice: whatever's in it can't see us for a moment.",
  react_brittle: 'Brittle. Chilled and poisoned, it cracks at anything.',
  react_pyre: 'Pyre! Fire set the poison off all at once.',
  react_flare: 'Flare. Fire and lightning blind, and break whatever it was winding up.',
  react_scatter: 'Scatter. A blow flings its fire across the ground.',
  react_jolt: 'Jolt. A heavy blow drives the charge in deeper.',
  react_overload: 'Overload! Enough shock, and it locks up.',
  react_freeze: 'Frozen solid. Hit it hard and it will shatter.',
  react_inferno: 'Inferno. Burns pile up, and the fire jumps to its neighbours.',
  react_plague: 'Plague. Poison on the poisoned spreads to everything near.',
  react_stun: 'Stunned. Two heavy blows in a row, and it reels.',
  // resonances (resonance.js)
  resonance: "The stones are singing together. That's a resonance: the whole circuit woke into one spell.",
  resStone: 'A resonance stone. It remembers part of a circuit that sings. I put it in the Codex at the forge.',
  // each clime's own creature, the first time it shows itself (foes.js)
  foe_skink: "Something's swimming under the sand. Where it rings under you, step off.",
  foe_tusker: "That one charges, and on ice it can't stop. Step aside and let the rock have it.",
  foe_wraith: "Ash, walking. It glows before it bursts. Don't be beside it then.",
  foe_lurker: 'Eyes in the mire. Its tongue reaches further than you think. Stay off the line it marks.',
  foe_dropper: 'Something was on the roof. Watch the floor for its shadow.',
  foe_eel: "A fin in the water. If it lunges and misses, it's stuck on dry ground for a moment.",
  foe_crab: 'Its shell turns most of what we throw. Freeze it, or crack it with a heavy blow.',
  foe_weaver: "It strings roots across the way. They'll hold your feet; dash through them.",
  foe_sentinel: 'A sentry. Its beam sweeps the hall. Put rock between us and it.',
  foe_idol: 'That statue moved. Only out of the light, I think. Keep it in the lamp.',
  foe_hound: "A wind-up hound. When the key stops, it runs, off the walls and all. After that it's spent.",
};

// The star, as it grows: a seed-star waking up where it fell.
const STAR_SPEAKS = {
  2: '…warm… you carry light back to me…',
  3: '…I was meant to land softly. I remember the cold between, and then the stone…',
  4: '…the ground is breathing. I did not know ground did that…',
  5: '…there were others of me here, once. Very far down. Very dim. Someone fed them too…',
  6: '…the dark does not hate me. I think it only wants me quieter…',
  7: '…I could fill this whole world. Tell me where to stop…',
};
// The first ore it ever takes, and the first Starmetal: said once each,
// as the ore lands (Story.starTaste).
const STAR_TASTES = {
  first: '…oh. The ground here. It tastes older than I am…',
  starmetal: '…this one tastes like me. Like a light that went out, long ago…',
};
// As each shard is set: another star's light, folded into its own.
const SHARD_SPEAKS = [
  '…another light, folded into mine. It was very old. I can reach further…',
  '…two. They are not angry, the ones who went out. Only tired…',
  '…three. I can feel the Edge from here. Carry me further, Kindler…',
];

// Echoes: logs of the Kindlers before, found in the depths, read at the
// uplink in the order found. Early ones hopeful, then uneasy, then the turn,
// never said outright.
const ECHOES = [
  { title: 'Halcyon, day 1', text: 'Planted clean. The Halcyon took first time and the rim lit up like a harbour. Dead world, as promised. Quiet as a held breath.' },
  { title: 'Halcyon, day 12', text: 'Third spire up. Each time, the land wakes a little: moss first, then lizards. The Charter says life rides down with the seed. I never knew it worked so fast.' },
  { title: 'Halcyon, day 31', text: 'Fed the Halcyon a full cart tonight, by the book. The dark pushes back hardest where we push hardest. It comes in like a tide, and goes out like one. Weather does not do that.' },
  { title: 'Saltmarsh survey log', text: 'Ours is the fourth seed sent here. We found the other three. Not their capsules. Their light, gone dim under the ground, and something curled round each one.' },
  { title: 'Unsigned', text: 'Went out past my light. Things moved in the dark that never came for me. Feeding. Singing. Raising their young. I was the strange thing there.' },
  { title: 'Halcyon, day 60', text: 'We called it dead because nothing here needed a sun. That was the whole mistake. Every spire I plant, something goes quiet. And the ore I carry up to her: I used to think the ground had no use for it.' },
  { title: 'Keeper notes', text: 'Cut into the thing in the lair. Under the shell was a Charter plate, worn smooth. Seed-star Wren, it said. Kindler unknown.' },
  { title: 'Last log of the Halcyon', text: "I've stopped feeding her. She burns low now. Not out. Just smaller. If you're the next one: you could light it all. Ask whose night it is first." },
];

// The endings, at the Edge: kindle the heart, or leave it. The game goes on
// after either.
const KINDLER_ENDINGS = {
  kindle: [
    // the Kindler at the heart of the dark, the Lodestar's light pouring
    // into it
    'At the heart of the dark, you give it your light. All of it, the way a Kindler is taught.',
    'Morning runs out from the Edge like water. It reaches the rim, and the old dim stars underground, and keeps going.',
    'The Hollow do not fight it. They thin, and pale, and are gone. Where they were, green comes up.',
    "Wick: It's a garden. A whole world of it. The Charter will call it a triumph.",
    'Wick: …It went very quiet, at the end. I keep listening for it.',
    'The landers come down into the first true morning. There is so much left to plant.',
  ],
  leave: [
    // the Kindler at the heart of the dark, light held close, turning back
    'At the heart of the dark, with your light in your hands, you choose not to.',
    'Something out there has waited a long time to see what you would do. It turns back to its night.',
    'The Hollow keep to the dark, and the light keeps what you gave it. There is a line between them now, and it holds.',
    "Wick: The Charter won't like it. I don't think anyone from the Charter has ever stood here.",
    'The landers come down at the warm edge of your light. The settlers learn to keep a lantern lit at night.',
    'And over them, for the first time in an age, the world has stars of its own.',
  ],
};
// Calling the colony down, at the uplink: three shards set, and ground
// kindled for T.story.callLanders landers.
const STORY_LANDING = [
  'The uplink sends one word to orbit: now.',
  'The Meridian wakes its sleepers. By nightfall the landers are down on the rim, in your light.',
  "Wick: That's the colony, then. We should probably tidy up.",
  // the Edge on the horizon past the last spire, dark, and very still
  'Out past the third ring, the Edge is still dark. Whatever waits at its heart is waiting for you.',
];

// One line in the log for each territory kindled, by its clime. {name} is
// the territory's.
const KINDLE_LOG = {
  badlands: ['{name} kindled. The dust settles, and something green finds the cracks.', '{name} kindled. The mesas hold the warmth long after dark.'],
  frost: ['{name} kindled. The ice ticks as it thaws, all night long.', '{name} kindled. Meltwater, running for the first time in an age.'],
  cinder: ['{name} kindled. The vents still smoke, but it smells like a hearth now.', '{name} kindled. Ash underfoot, and a first shoot through it.'],
  bloomfen: ['{name} kindled. Every bloom in the fen turned to face the star.', '{name} kindled. The fen went still, then started singing again. A different song.'],
  caverns: ['{name} kindled. Light in the cracks, all the way down.'],
  grotto: ['{name} kindled. The water is clear to the bottom now. Something moved off it.'],
  magma: ['{name} kindled. The rock still runs, but it runs gold.'],
  rootdeep: ['{name} kindled. The roots are pulling up, towards the light.', '{name} kindled. The spores have stopped drifting. Wick says they are waiting.'],
  archive: ['{name} kindled. The shelves are lit. Someone wrote all this. Someone read it.'],
  temple: ['{name} kindled. The temple doors face away from the star. They always did.'],
  vault: ['{name} kindled. The clocks inside started again. Wick thinks they were counting down.'],
  any: ['{name} kindled. The light holds, and the dark draws back.', '{name} kindled. Quiet there now.'],
};

// The settlers: who they are, and what they say when the Kindler walks by.
// Before the turn, and after enough echoes are read (T.story.turnEcho).
// {place}: a territory kindled, by name, when the world gives one.
const SETTLER_NAMES = ['ODA', 'BRENN', 'ISKA', 'TULLY', 'NELL', 'AMOS', 'PIP', 'MAREK'];
const SETTLER_LINES = {
  early: [
    'Morning, Kindler. Or whatever this is.',
    "The ground's warm here. My boots haven't been warm in ninety years.",
    'We planted beans by the lantern. Charter seed. They came up purple.',
    "The kids want to know what's past the last spire. I told them you are.",
    'Ninety years asleep, and the first thing I did was trip over your drone.',
    'Is it always this quiet, once it is lit?',
  ],
  late: [
    'Mind the edge of the light at night. Things wait there. Polite, mostly.',
    'My daughter left bread out past the lanterns. By morning it was gone, and a stone was left in its place.',
    'Those old logs you found. Does the Charter know?',
    "I don't mind the dark so much now. It's someone else's, that's all.",
    "My boy asked what the ore was for, before the star ate it. I didn't have an answer.",
  ],
  place: [
    "I hear {place}'s lit now. I'd like to see it, one day.",
    'They say {place} was all dark, before you. Hard to picture.',
  ],
};

// ---------------------------------------------------------------------------
// For the world: how much of it is kindled, and what that's worth.
// ---------------------------------------------------------------------------

// The territories kindled, as the world lays them out (so with a name and
// a clime), read from the world's save: Save.data.world.territories[id]
// .state === 'kindled' (frontier.js). The starter doesn't count, as the
// outpost's own light reaches it; none while there's no world yet.
function storyKindled() {
  const W = Save.data && Save.data.world;
  if (!W || !W.territories) return [];
  const terrs = worldLayout(W.seed).terrs;
  return Object.keys(W.territories).map(Number).filter((id) => { const s = W.territories[id]; return s && s.state === 'kindled' && !s.starter && terrs[id]; }).map((id) => terrs[id]);
}
function storyKindledCount() { return storyKindled().length; }
// Landers the Meridian can send: one for every few territories kindled.
function storyLanders() { return Math.floor(storyKindledCount() / T.story.landerEvery); }

// The log's line for a territory kindled: one of its clime's, the same one
// each time for the same name.
function kindleLogLine(clime, name) {
  const lines = KINDLE_LOG[clime] || KINDLE_LOG.any, n = String(name || 'The territory');
  let h = 0;
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) | 0;
  return lines[Math.abs(h) % lines.length].replace('{name}', n);
}

// An ending, in panels: 'kindle' or 'leave'. The choice is kept, and the
// game goes on after.
function playKindlerEnding(choice, done) {
  const key = choice === 'leave' ? 'leave' : 'kindle';
  Save.data.kindlerEnding = key; Save.save();
  UI.openStory(KINDLER_ENDINGS[key], done);
}

const Story = {
  // A line from Wick, once ever (and queued, so lines don't talk over each other).
  say(id) {
    const said = Save.data.said || (Save.data.said = {});
    if (said[id] || !WICK[id]) return;
    said[id] = true;
    UI.speak('WICK', WICK[id]);
  },
  // The star, when it grows: a line for every magnitude it passed (a big
  // feed can pass two), and the attunement to spend. (mag: the magnitude
  // it has reached as drawn, when ore is still rising into it.)
  starGrew(mag = magnitudeOf(Save.data.star)) {
    const s = Save.data;
    if (s.magSeen === undefined) s.magSeen = mag;
    if (mag <= s.magSeen) return;
    for (let m = s.magSeen + 1; m <= mag; m++) {
      if (STAR_SPEAKS[m]) UI.speak('THE STAR', STAR_SPEAKS[m], 'star');
    }
    UI.toast(`Magnitude ${mag}: ${mag - s.magSeen > 1 ? 'attunements' : 'an attunement'} to spend at the altar`);
    s.magSeen = mag;
    Save.save();
  },

  // An ore landing in the star: the first ever, and the first Starmetal,
  // it remarks on, once each.
  starTaste(ore) {
    const said = Save.data.said || (Save.data.said = {});
    for (const k of ['first', ore === 'starmetal' ? 'starmetal' : null]) {
      if (!k || said['star_' + k]) continue;
      said['star_' + k] = true;
      UI.speak('THE STAR', STAR_TASTES[k], 'star');
    }
  },

  // The opening, the first time the game is played.
  intro() {
    if (Save.data.introSeen) return false;
    // a save from before circuits started over: one line to say why
    const lines = Save.data.freshStart ? [FRESH_START_LINE].concat(STORY_INTRO) : STORY_INTRO;
    UI.openStory(lines, () => { Save.data.introSeen = true; Save.data.freshStart = false; Save.save(); UI.tip('hub', 'Walk to the portal under the star to set out'); });
    return true;
  },

  shardsHeld() { return (Save.data.shards || []).length; },
  shardsSet() { return Save.data.shardsSet || 0; },

  // Picking up a shard: it's bound to the Kindler, safe from any fall.
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

  // The colony can be called down when every shard is set and there's
  // ground kindled for enough landers.
  landersCalled() { return !!Save.data.landersCalled; },
  canCall() {
    return !Story.landersCalled() && Story.shardsSet() >= 3 && storyLanders() >= T.story.callLanders;
  },
  // Calling the landers, at the uplink: the colony comes down, and the Edge
  // is still out there (its choice, playKindlerEnding, is the Edge's own).
  callLanders(done) {
    Save.data.landersCalled = true; Save.save();
    UI.openStory(STORY_LANDING, done);
  },
};

// ---------------------------------------------------------------------------
// Settlers at the outpost: a few small figures, one for each lander down
// (all of them once the colony's called). Cosmetic: they stroll the plaza,
// stop, and say a line when the Kindler walks near. Painted in muted coats,
// each with a little star-lamp. Their strolling uses Math.random, as it
// changes nothing.
// ---------------------------------------------------------------------------

// A settler, painted (hubart.js): a hooded coat, a scarf, goggles, a lamp
// in the far hand; idle or a step of the walk, turned to the left (west)
// or the right. Four looks.
const SETTLER_LOOKS = HART_LOOKS;
const _settlerSprites = {};
function settlerSprite(look, frame, west) {
  const key = look + '/' + frame + '/' + west;
  if (!_settlerSprites[key]) {
    const s = hartPerson(look, 'walk', frame);
    _settlerSprites[key] = west ? flippedSprite(s) : s;
  }
  return _settlerSprites[key];
}

// Where settlers stroll (tiles): the open plaza south of the stations.
const SETTLER_SPOTS = [[8, 17], [14, 17], [11, 16], [9, 18], [13, 18], [7, 13], [15, 13], [10, 14], [12, 14], [11, 21]];

// How many settlers stand at the outpost now.
function settlerCount() {
  const S = T.story.settlers;
  return Story.landersCalled() ? S.most : Math.min(S.most, storyLanders() * S.perLander);
}

// Coming home: the settlers take their places (and the first ones say so).
function placeSettlers(d) {
  const n = settlerCount();
  d.settlers = [];
  for (let i = 0; i < n; i++) {
    const [tx, ty] = SETTLER_SPOTS[(i * 3) % SETTLER_SPOTS.length];
    d.settlers.push({ settler: true, look: i % SETTLER_LOOKS.length, name: SETTLER_NAMES[i % SETTLER_NAMES.length], x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE, tx: null, ty: null, restT: 1 + Math.random() * 3, walkT: 0, west: i % 2 === 1, talkT: 0 });
  }
  if (n > 0) Story.say('firstSettlers');
}

// A line a settler might say now: the late ones once the turn has come,
// and now and then one about a place kindled.
function settlerLine() {
  const L = SETTLER_LINES, late = (Save.data.echoes || []).length >= T.story.turnEcho;
  const places = storyKindled().map((x) => x.name).filter(Boolean), pick = (a) => a[Math.floor(Math.random() * a.length)];
  if (places.length && Math.random() < 0.3) return pick(L.place).replace('{place}', pick(places));
  return pick(late ? L.late.concat(L.early.slice(0, 2)) : L.early);
}

// Each step at home: stroll, rest, and speak when the Kindler comes near.
function updateSettlers(d, dt) {
  if (!d.settlers) return;
  const S = T.story.settlers, p = d.p;
  for (const s of d.settlers) {
    s.talkT = Math.max(0, s.talkT - dt);
    const near = dist(s.x, s.y, p.x, p.y) < S.talkR * TILE;
    if (near && s.talkT <= 0 && !(UI.lines && UI.lines.length)) {
      s.talkT = S.talkGap;
      UI.speak(s.name, settlerLine(), 'settler');
    }
    // they stand and face the Kindler while they're close
    if (near) { s.walkT = 0; s.west = p.x < s.x; continue; }
    if (s.tx === null) {
      if ((s.restT -= dt) > 0) { s.walkT = 0; continue; }
      const [tx, ty] = SETTLER_SPOTS[Math.floor(Math.random() * SETTLER_SPOTS.length)];
      s.tx = (tx + 0.5) * TILE + (Math.random() - 0.5) * TILE; s.ty = (ty + 0.5) * TILE + (Math.random() - 0.5) * TILE;
    }
    const dx = s.tx - s.x, dy = s.ty - s.y, m = Math.hypot(dx, dy), step = S.speed * dt;
    if (m <= step) { s.x = s.tx; s.y = s.ty; s.tx = null; s.restT = S.rest[0] + Math.random() * (S.rest[1] - S.rest[0]); s.walkT = 0; continue; }
    s.x += (dx / m) * step; s.y += (dy / m) * step; s.walkT += dt;
    if (Math.abs(dx) > 1) s.west = dx < 0;
  }
}

function drawSettler(d, s, ox, oy, lights) {
  const spr = settlerSprite(s.look, s.walkT > 0 ? 1 + (Math.floor(s.walkT * 7) % 4) : 0, s.west);
  const fx = Math.round(s.x * AP) + ox, fy = Math.round(s.y * AP) + oy, x = Math.round(fx - spr.ax), y = fy - spr.ay;
  drawShadow(fx, fy, 3);
  drawArtSprite(spr, x, y);
  // the little lamp each one carries, in the far hand
  lights.push({ x: fx + (s.west ? 6 : -6), y: y + 24, r: TILE * 0.9, i: 0.45, c: rgb01(ART.pal.star[2]) });
}
