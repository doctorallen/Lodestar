'use strict';
// ---------------------------------------------------------------------------
// The story. You're a Kindler of the Lodestar Charter. Kindlers ride
// seed-stars down to dead worlds, plant them, and carry their light outward,
// spire by spire, and carry the world up to the star, ore by ore, until the
// star is whole and can shine on it (the Spectrum, spectrum.js). This seed,
// the Lodestar, was planted by the book on a surveyed site in the middle of
// the world, and the Charter's base modules came down with it. A new seed
// starts small: growing it is the Kindler's job, and this is your first.
// Wick has done it before. The Meridian, the colony ship, waits above with
// its sleepers, and nobody comes down until the star is whole. What the
// Kindler doesn't know until the end is what the spec means by whole.
//
// The turn comes in ring 2, in the echoes (logs of the Kindlers before):
// the world wasn't dead. The dark is its own living night, the Hollow is
// what grows in it, and the Keepers are earlier seed-stars that went dark.
// Their shards strengthen the Lodestar so its light reaches further. At the
// Edge, the heart of the dark, you choose: kindle it, or leave it.
//
// It's told in a short animated opening (intro.js); by Wick, the
// Kindler's drone, in a line the first time something happens; by the star, which speaks as it grows; in
// eight echoes, read at the uplink; and in one line in the log for each
// territory kindled.
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
//   firstCleft, firstLattice, firstColdSpire, firstRelit
//                  the Lattice under the world (lattice.js)
//   ring2, ring3   first entering ring 2, ring 3
//   theEdge        first reaching the Edge
//   firstFeed      the first time the star is fed at its altar (hub.js)
//   firstGive, starBand, spectrumWhole
//                  ore given to the star, a land it hasn't tasted, and
//                  every band at the mark (spectrum.js)
//   firstHeartlight, firstDeeplight, starReach, firstCache, firstRecover,
//   firstSupply    the light of deeds, the star's reach, the pack a fall
//                  leaves, and supplies (deeds.js, supplies.js)
//   bld_<id>       each of the outpost's buildings, as it comes down
//                  (structures.js)
//   tier<n>        the first piece forged of tier n past the first (anvil.js)
//   wick_<id>      each of Wick's upgrades, the first time it does its
//                  thing (wick.js)
//   wake_<key>     a system waking for a new Kindler (onboard.js)
// And:
//   playWorldLives(done)          the ending, once, at the last magnitude
// The uplink is the station with the id 'wreck' (floor.js HUB_STATIONS),
// kept so the outpost's layout needn't change.
// ---------------------------------------------------------------------------

// Said once, before the opening, to a player whose save came from before
// circuits.
const FRESH_START_LINE = 'The land round the star is one world now, to walk and kindle territory by territory, so your outpost starts afresh.';

// The opening (intro.js): five painted scenes, a caption or two each, that
// play on their own; the last is the outpost itself, and Wick speaks.
// What each shows is in intro.js.
const STORY_INTRO = [
  // the Charter's craft crossing the dark between stars, the seed-star in
  // its cradle at the bow, the Meridian following far behind
  [{ text: 'The Lodestar Charter sends seed-stars to dead worlds. A Kindler rides down with each one, to plant it.' }],
  // the survey's beam sweeping the dark world below, a site marked
  [{ text: 'The survey sweeps the dark below and marks a site. Bedrock, level, nothing moving.' }],
  // the seed and the base modules coming down on their thrusters, the
  // cradle locking
  [{ text: 'The seed comes down alone, by the book. Where it lands, its light opens, and the ground takes it.' }],
  // the Meridian in orbit; inside, its settlers asleep in rows
  [{ text: 'Above, the colony ship Meridian waits. Its settlers sleep until the star is whole.' }],
  // the outpost: the star rising over its cradle and lighting, the Kindler
  // stepping out, Wick lifting off the pack
  [
    { who: 'WICK', text: "I'm Wick, your drone. Your first planting? They all start this small." },
    { who: 'WICK', text: 'Kindle the land, and bring the world home to the star. Spire by spire, until it can shine on all of it.' },
  ],
];

// Wick, the first time each thing happens. Dry, and kind.
const WICK = {
  firstDive: 'Out we go. Mine what glows, and watch your light.',
  firstParts: 'Parts. A lot of teeth, for a dead world. The forge wants them.',
  firstBlueprint: "A blueprint. Charter make, older than ours. Get it home and we'll learn it.",
  firstForge: 'Strike when the marker crosses the glow. The recipe is the recipe; good strikes only add to it.',
  // the first piece forged of each tier past the first (anvil.js)
  tier2: 'Lumenite. It holds a charge better than iron. You will feel it.',
  tier3: 'Resonite rings when it is struck. Listen for it in the rock.',
  tier4: "Aetherglass. Charter ships were skinned in it. Don't drop it.",
  tier5: 'Sigilite. The Keepers wrote in this. I would rather not know what.',
  tier6: 'Starmetal. Nothing cuts deeper. Nothing should need to.',
  // cores (modules.js, gearui.js)
  core: 'A core. Charter standard: a Bolt is a Bolt. Set it in the rig at home, or fold three into one.',
  legendary: "That one's not standard. Someone's rig made it, long before ours. Keep it.",
  pattern: "The suit's been reading them as they fall. Six in, and the forge knows what that one is for.",
  print: 'Printed. The pattern is in the lattice now; it stays.',
  merge: 'Three into one. The lattice goes a grade denser.',
  research: "The forge studied what we brought in. New recipes.",
  rift: 'A tear in the world. Things leak through. Seal it, and something solid is left behind.',
  rift_graft: "That ground isn't from here. Neither is the ore in it.",
  rift_bloom: 'The rock round the tear has woken. It is all ore now.',
  rift_gate: 'Two tears, one place. Step into one and out of the other.',
  rift_inversion: "Daylight, down here. It's coming out of the tear, not from us.",
  riftGate: 'I will never get used to that.',
  riftSealed: "What's left behind is solid. Ore. The star can taste that.",
  storm: "A lodestorm. Where the ground flickers, the sky's about to hit.",
  riftSpawn: "Something came through the tear. It'll keep coming until we seal it.",
  pullFading: "Our light's thinning here. We shouldn't stay much longer.",
  heat1: "That's a lot in the pack. Things out here can tell.",
  heat2: "Everything in the dark knows what you're carrying now. Bank it, or hold on tight.",
  keeperWard: "It's shelled itself. Something blunt cracks that, nothing else.",
  keeperCrystal: "Crystal. Chill it first, then hit it hard with Force; otherwise it's a wall.",
  keeperFire: "It's wreathed in fire. Frost will quench that for a moment. Make the moment count.",
  // the first Deep under each outer region
  choir: "The Choir. Everything here hums when it's struck. Even you. The survey called it silent.",
  underforge: 'The Underforge. Someone built this. The survey said no one ever had.',
  keeper: "That's a Keeper. What it's holding hums like our star does. Only colder.",
  shard: "A shard. It's ours now, whatever happens. Take it home.",
  shardHome: 'Set it in the star, at the altar. It should reach further for it.',
  allShards: "All three. Our star's never shone like this. They'll see it from orbit.",
  echo: "An echo: a Kindler's log, from before us. I'll keep it at the uplink.",
  // the first time the star is fed, at its altar (hub.js)
  firstFeed: "By the book: fed light until it can light a world. You're doing fine.",
  // the star learning from the world (facets.js): a Shape, a Turn, a shard
  // of old light; and the first time the build is turned
  firstShape: 'The star read that. A new Shape: face it at TURN, and it casts it.',
  firstMod: "It learned a Turn. Face it beside a Shape and the cast changes. Nothing to carry.",
  firstDown: "Down, then. The sky can't follow you. The thread can.",
  firstUp: 'Air. Keep going; the Deep keeps.',
  firstLegend: "Old light. Another star's. Face it and its power is yours, as long as it faces you.",
  firstTurn: 'Face it the other way and it is a different suit. Nothing to carry home.',
  // the Splinter's lattice thinning in the dark (facets.js latticeK)
  latticeThin: "You're going dim. The suit's only as hard as the light in it.",
  // ore in the field (field.js): the first pocket planted, the first surge,
  // a spire short of its ore
  firstPlant: "Stand by it. The dark wants it more than it wants you.",
  firstSurge: 'Burning the ore in the cast. Wasteful. Effective.',
  spireOre: "A spire is raised from the ground it stands on. Mine some of this land first.",
  // night-glass, first carried (spectrum.js): the thing the spec never
  // listed
  nightglass: "That's not on the Charter's list. You don't have to give the star anything. Just so you know.",
  umbra: "It took it. The spec never had a word for that one, and now the star does.",
  // ore given to the star (spectrum.js): the first time, a land it hasn't
  // tasted, and every band at the Meridian's mark
  // coming home with ore for the first time: what it's for
  spectrum: "That ore is for the star. It can make anything, but it can only shine on ground it knows: every kind of ore it tastes is a band of its light, and a land stays dark to it until it has tasted that land's ore. GIVE, at the star.",
  firstGive: 'Ore, into the star. It has to taste the ground before it can light it. Nobody mentions that part in training.',
  starBand: "The star can't light this land yet. It hasn't tasted what's in the ground here. Bring some home and give it.",
  spectrumWhole: 'Every band at the mark. That is the whole spec. The Meridian will have seen it by now.',
  // the light of deeds (deeds.js), the first of each kind
  firstHeartlight: "Feel that? The heart's light. It's yours now. Take it home to the star.",
  firstDeeplight: "Deeplight. It's been down here a long time. It rides with the cargo, so mind it.",
  // the star's reach: a spire planted where its light can't hold yet
  starReach: "Our star can't reach this far yet. Bring it more light, and the spire will hold.",
  // a fall leaves the pack where it fell (deeds.js), and it's found again
  firstCache: "Your pack's still out there. We can go back for it.",
  firstRecover: "Still where you left it. Nothing out here touched it.",
  // supplies (supplies.js)
  firstSupply: 'Old ore still has its uses. The fabricator makes supplies from it.',
  // the world's (see the list at the top)
  firstSpire: "Our first spire. Kindlers don't conquer. We just carry the light further.",
  firstKindled: "Kindled. The ground's warming already. Funny how quiet it went.",
  // the veins (veins.js)
  firstThread: "That's the star's own light in your hand. Walk it out. Don't run: it doesn't like being pulled.",
  firstSet: 'It took. The ground will turn along it, give it a few nights.',
  firstJoin: 'Two ways to a place. Now the dark has to cut twice.',
  holdLost: "It didn't hold. Take up another, and plant it nearer next time.",
  // the motes (motes.js)
  firstMotes: "That's what it was made of. The star can read it, once it's home: plant a node and it's banked.",
  firstBank: "Banked. The star's screen has five trees: each kind of mote buys its own.",
  firstLearn: 'Learned. Put it in a cast, at CASTS, and the wrist casts it.',
  firstPassive: "That one's in you now, whatever you cast.",
  firstFoeCast: "See that? It casts what it is. What it leaves when it dies, the star can learn that from.",
  firstCut: "The dark cut a vein while we were away. The node past it has gone dark. Two ways to a place, and it can't.",
  hollowAtCut: "That's what cuts them. It follows into the light. Slowly.",
  holdWave: 'Here they come. Stand by it.',
  firstTide: "The dark's coming back in, like a tide. Hold the spire and it'll go out again. It always has.",
  firstDeep: "A Deep. Down here the star can't see us at all. Quick in, quicker out.",
  // the Lattice (lattice.js): the cleft seen, the first gallery, a cold
  // spire found, and one relit
  firstCleft: "That cleft goes on down. The survey never mapped anything under here.",
  firstLattice: 'Tunnels. Not ours, and not new. Someone cut these a long time ago, and they go on.',
  firstColdSpire: "A spire. Charter make, an old pattern. Whoever planted it isn't here to say what happened.",
  firstRelit: 'It took the light. That makes it ours: bank here, and the star can find us again.',
  ring2: "The second ring. Nobody's mapped this far. Nobody but whoever left those logs.",
  ring3: "The third ring. The dark's thick enough to lean on out here. Stay close.",
  theEdge: "The Edge. Whatever this world has at its heart, it's out there. I don't think it's sleeping.",
  // the outpost's buildings, as each comes down to its plot (structures.js)
  bld_bay: "A bay of my own. Charging cradle, spare fins, a window. I'll try not to get used to it.",
  bld_refinery: "The refinery's down. Injectors and Lightcells come out stronger now.",
  bld_relay: "The relay's up. The spires can hear the outpost now: a recall's quicker, and so is banking.",
  bld_quarters: "Quarters, built ahead for the sleepers. The survey drones have moved in meanwhile. They scavenge.",
  // Wick's upgrades, the first time each does its thing (wick.js)
  wick_scan: "Ping. That's me. Ore, your pack, anything with a pattern in it: I'll mark what I find.",
  wick_lamp: "I'll keep a light on behind us. You watch ahead.",
  wick_shield: "Got that one. Give me a while before the next.",
  wick_spark: "Sorry. Reflex. They gave me teeth, small ones.",
  // a system waking for a new Kindler (onboard.js), once each
  wake_spells: 'A new core. The rig\'s spells can be rebuilt now, at the locker.',
  wake_modules: 'The tuning bench is awake. Three cores of a kind fold into one a grade denser there.',
  wake_altar: 'Light from a deed. The star\'s altar is awake: feed it.',
  wake_supplies: 'The fabricator\'s on. SUPPLIES, beside the forge.',
  wake_gear: 'The forge has armour and charms for us now.',
  wake_tools: 'New tools at the forge. Carry one from the portal.',
  wake_buildings: 'The Meridian will drop buildings now. Plans at the forge.',
  wake_wick: 'Fit me with something. Walk me over to the Drone Bay.',
  wake_uplink: 'The uplink\'s warm. The Meridian is listening.',
  // natures (natures.js)
  weakHit: "It hates that. The badge over its head says what each kind fears; your buttons say it too.",
  resistHit: "That barely touched it. A grey button means it shrugs that element off. Try the other spell, or come back with other cores.",
  warded: "That one's warded. Only something blunt will crack its shell.",
  affix_warded: "That one's warded. Only something blunt will crack its shell.",
  affix_shifting: 'Its colour keeps changing, and so does what it fears. Watch the mark.',
  affix_fast: "Quick one. Don't let it round you.",
  affix_tough: "Thick-shelled. This one takes a while.",
  affix_volatile: "It'll go off when it dies. Step back first.",
  affix_insulated: 'Shock slides right off that one.',
  affix_fireproof: "Ember won't take on that one.",
  affix_frosted: 'It leaves ice where it goes. Dash across, or burn it off.',
  affix_mortar: "It's lobbing at where you stand. Don't stand there.",
  affix_chained: "Those two are linked. Hurt one, hurt both; the weaker first.",
  affix_bulwark: 'That shell stops anything you throw. Get in close, or wait it out.',
  affix_brood: "It's calling more. Something wide would help.",
  affix_hulking: "Nothing's going to stagger that. Hit it when it's open.",
  affix_splitter: 'It splits when it falls. Have something ready.',
  affix_leech: "It's drinking the hits it lands. Blight would stop that.",
  affix_blink: 'It jumps to you. Dash when you see the flash.',
  affix_thorns: "Hitting it close cuts you too. Keep your distance.",
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
  resonance: "The cores are in step. That's a resonance: the whole spell woke into something new.",
  resStone: "A resonance trace. Part of a spell that wakes. It's in the Codex at the forge.",
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

// The star, as it grows: a seed-star waking up where it was planted.
const STAR_SPEAKS = {
  2: '…warm… you carry light back to me…',
  3: '…I remember the cold between, and then being set down. Gently. Here…',
  4: '…the ground is breathing. I did not know ground did that…',
  5: '…there were others of me here, once. Very far down. Very dim. Someone fed them too…',
  6: '…the dark does not hate me. I think it only wants me quieter…',
  7: '…I could fill this whole world. Tell me where to stop…',
};
// The first light of each kind it takes: said once each, as the mote lands
// (Story.starTaste).
const STAR_TASTES = {
  heartlight: '…oh. This light was night, a moment ago. It tastes older than I am…',
  deeplight: '…this one comes from very far down. It tastes like me. Like a light that went out, long ago…',
  // the ores, as each is first given (spectrum.js): the star learning the
  // ground it's to light
  ferrite: '…iron. The survey said iron. It is heavier than they told me. I can hold it…',
  lumenite: '…oh. It keeps light the way I do. Smaller. I can see a little further by it…',
  resonite: "…oh. That's what the singing was…",
  aetherglass: '…clear all the way through, and cold. The cold keeps a shape in it. So can I…',
  sigilite: '…there is writing in this one. Not in a language. In a light. I nearly know it…',
  starmetal: '…I know this. Not from the Charter. From before I was lit…',
  nightglass: "…I don't know this one. The Charter didn't give me a name for it. It is… quiet…",
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
  { title: 'Halcyon, day 31', text: 'Fed the Halcyon the light of three hearts tonight, by the book. The dark pushes back hardest where we push hardest. It comes in like a tide, and goes out like one. Weather does not do that.' },
  { title: 'Saltmarsh survey log', text: 'Ours is the fourth seed sent here. We found the other three. Not their capsules. Their light, gone dim under the ground, and something curled round each one.' },
  { title: 'Unsigned', text: 'Went out past my light. Things moved in the dark that never came for me. Feeding. Singing. Raising their young. I was the strange thing there.' },
  { title: 'Halcyon, day 60', text: 'We called it dead because nothing here needed a sun. That was the whole mistake. Every spire I plant, something goes quiet. And the light I carry up to her: I used to think the night had no use for it.' },
  { title: 'Keeper notes', text: 'Cut into the thing in the lair. Under the shell was a Charter plate, worn smooth. Seed-star Wren, it said. Kindler unknown.' },
  { title: 'Last log of the Halcyon', text: "I've stopped feeding her. She burns low now. Not out. Just smaller. If you're the next one: you could light it all. Ask whose night it is first." },
];

// The ending (DESIGN.md, The end): the veins have reached every reach of
// the world, and the star says the world lives. The Kindler walks into the
// heart's light and doesn't come out; the light draws in along every vein
// and out again as day; the Meridian comes down; Wick, alone on the ground,
// says the one line he has been not saying. Told in panels, once; the game
// stays open after, the world lit.
const WORLD_LIVES_LINES = [
  'The last vein sets, and the star says the world lives. It has never spoken so plainly.',
  'You walk into the light under the heart, as you have a hundred times to take up a thread. This time there is no thread.',
  'The light draws in along every vein you laid, all at once, into the heart, and out again as day. All of it. Over all of it.',
  'Above, the Meridian turns, and comes down by the book, into the morning.',
  "Wick: I always knew. The Kindler is the part of the star that walks. It was never going to walk back out.",
  'Wick: …They will be fine down here. You saw to that. I will tell them whose it was.',
];
function playWorldLives(done) {
  Save.data.worldLives = true; Save.save();
  UI.openStory(WORLD_LIVES_LINES.slice(), done);
}

const Story = {
  // A line from Wick, once ever (and queued, so lines don't talk over each other).
  say(id) {
    const said = Save.data.said || (Save.data.said = {});
    if (said[id] || !WICK[id]) return;
    said[id] = true;
    UI.speak('WICK', WICK[id], 'wick', id);
  },
  // The star, when it grows: a line for every magnitude it passed (a big
  // feed can pass two), and the attunement to spend. (mag: the magnitude
  // it has reached as drawn, when ore is still rising into it.)
  starGrew(mag = magnitudeOf()) {
    const s = Save.data;
    if (s.magSeen === undefined) s.magSeen = mag;
    if (mag <= s.magSeen) return;
    snd('starGrow', { mag });
    for (let m = s.magSeen + 1; m <= mag; m++) {
      if (STAR_SPEAKS[m]) UI.speak('THE STAR', STAR_SPEAKS[m], 'star');
    }
    UI.toast(`The star grows: magnitude ${mag}`, 'legendary');
    s.magSeen = mag;
    Save.save();
  },

  // A mote landing in the star: the first of each kind of light it
  // remarks on, once each.
  starTaste(id) {
    const said = Save.data.said || (Save.data.said = {});
    if (!STAR_TASTES[id] || said['star_' + id]) return;
    said['star_' + id] = true;
    UI.speak('THE STAR', STAR_TASTES[id], 'star');
  },

  // The opening, the first time the game is played (intro.js). However it
  // ends, played out or skipped, it's seen.
  intro() {
    if (Save.data.introSeen) return false;
    const seen = () => { Save.data.introSeen = true; Save.data.freshStart = false; Save.save(); UI.tip('out', 'Walk out of the light. Your light drains in the dark; it fills back here'); };
    // a save from before circuits started over: one line to say why first
    if (Save.data.freshStart) UI.openStory([FRESH_START_LINE], () => Intro.play(seen));
    else Intro.play(seen);
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
};
