# The painted style

Lodestar is moving from crisp "A+" pixel art (outlines, sel-outs, at most four tones) to a painted look in the manner of Death Trash, at the same framing (about 264×470 art px upright, 24 art px a tile, the Kindler about 42 px tall). This is the guide every phase follows. The code is `js/paint.js`; every number is in `T.paint` (`js/tuning.js`).

Phase 1 (done): the ground and the rock for every clime, the Deeps and the outpost; the rising-rock camera and occlusion; the Kindler and Wick. Later phases: creatures, flora, props and the outpost's buildings, effects, UI.

## The rules

1. **Strokes, not pixels.** Every surface is laid in short horizontal strokes, 2 to 8 px, mostly short, one tone each. A stroke takes its tone from the light value at its middle, plus a little jitter, so tones interlock along the light's gradients like oil paint. No fine noise, no dither, no lone pixels.
2. **Few close tones per material.** A material has a ramp of close tones of its own hues. Any one area shows 3 to 5 of them.
3. **The climes keep their colours.** A clime's palette (`CLIME_ART`, `ART.biomes`, `ART.surface`) is stretched into a ramp, never replaced. Death Trash's sepia is not used.
4. **No outlines.** Nothing has a black outline or a sel-out. A figure is a dark mass with a few lit accent pixels. A struck enemy gets a white (or element-coloured) rim a pixel wide on the unlit layer (`spriteRim`, already in `render.js`), and only while it flashes.
5. **Light from the upper left.** Form shading, lit lips and rims, and the glint on glass all assume it.
6. **Coloured light is strokes of its colour.** A spell, a forge or a portal never recolours an area. Where its light dominates, add loose strokes of its own colour, thicker nearer the source (effects phase).
7. **Only magitech glows.** The emissive layer is for lamps, circuits, ore glints, runes and the like, as before.
8. **The user's rules still hold.** No screen shake; walls read as walls (rock tops darker than the floor, lit rims and faces); flora never looks like ore; flora's feet melt into the ground; exits always visible; the "light holds still" lighting (`T.art.lightDither` 0, `lampPerPixel`, `steadyCam`, `T.light.bloomWorld`) and the lamp's shadows (`shadow.js`).

## Ramps

`pntRamp(anchors, light, P)` turns a few anchor colours (dark to light, as `[r, g, b]`) into a stroke ramp: two deeper tones (pulled towards a violet black by `T.paint.ramp.dark`), the anchors, and two lighter ones (towards `light`, warm gold by default, by `T.paint.ramp.light`).

`pntLook(b)` gives a floor look's ramps, cached. They're made by `pntRampEven` (`T.paint.rampEven`): tones evenly spaced in lightness along a path from soot (the first anchor drawn towards the violet black by `deep`) through the anchors to a light (the last drawn towards `light` by `high`), so neighbouring tones are always a visible step apart and the strokes show:

- `ground`: 7 tones from the look's three floor colours (`calmRgb` under the sky, `rampRgb` underground, so they keep the old hue shift).
- `rock`: 10 tones from its three rock colours and three face colours, sorted by lightness, lit towards its rim colour (`rock[3]`), with more of them in the darks (`gamma`). Walls read as walls: its middle tone is kept to at most `rampEven.under[0]` of the ground's middle (`pntRockUnder`), darkening less up the ramp and its lips and rims (from tone `under[1]`) not at all. (Rootdeep, the Temple and the Vault have rock and floor colours close enough to need it.)

**Painted for its light.** The per-frame light multiplies the painted colours, so a dim place (a Deep, dark land at dusk) would crush the strokes into near black. A floor is painted for the light it will be seen in: `pntDarkness(f)` (0 in daylight, 1 in a deep cave, from the place's ambient, `darkAt`) sets `View.pntLift`, and `pntLiftRamp` raises each tone by more the lighter it is (`liftGround`, `liftRock`: how much the lightest is raised, and the power), so soot stays soot while lit facets, lips and the ground's lit strokes still read. The rock's mid tones are raised no more than the ground's, so rock tops stay darker than the floor. If the place's light changes a lot (a territory kindled), the floor is painted again.

Each comes as whole pixels (`Uint32Array`, for writing into a buffer) and as `[r, g, b]` (`groundRgb`, `rockRgb`).

For a sprite, give each material its own ramp of 4 or 5 hex colours, dark to light. Pick the darkest as the mass and keep the top tone for edges that catch the light.

## Strokes

`pntStrokeRow(mid, jit, x0, n, y, seed)` cuts a row into strokes. Each row is split into 8 px cells, offset by a phase of its own, and each cell into one, two or three strokes at hashed places (`T.paint.stroke`). For every pixel from `x0` it writes:

- `mid`: the stroke's middle, as an index into the row;
- `jit`: the stroke's jitter, about −1 to 1 and near 0 most often.

A pixel's tone is `value[mid] × (n − 1) + jit × J`. It depends only on the place and the seed, so a region painted again (after mining, or chunk by chunk) matches its neighbours.

Noise for the light value comes from `pntNoiseRow(out, x0, n, y, sx, sy, seed)`, value noise a row at a time. It can be stretched (`sx` > `sy`) into streaks.

Everything is seeded by place (`artHash`, `hashInts` of the floor's seed), never `Math.random`.

## The ground

`pntGroundTones` works out each pixel's light value a row at a time, then lays strokes:

- a broad swell;
- streaky lit patches (noise stretched well across, cut fairly hard, `patch`, `patchCut`);
- the old clusters, faintly;
- a hard dark line and a falloff at a wall's foot, and a little beside walls;
- under the sky, a rock's shadow cast to the lower right as far as the rock stands high.

`paintCaveTile` (`art.js`) reads the tones (`View.groundTone`). Flagstones (`paving`) shift each stone's tone and keep their seams and bevels. The clime's hazards, decor and the flora's beds paint over the ground as before.

## The rock and the camera

The camera is a steep three-quarter view: **rock rises**.

- **Footprint.** It's unchanged: collision, generation and `View.rockPx` (the smooth wall line).
- **Heights.** `pntHeights` raises each rock pixel of the footprint from its distance in from the rock's edge (`T.paint.wall`): a steep rise of `face` px over `edge` px (the face), rounding over into a top, plus boulders up to `bump` px that grow in over `ramp` px. The boulders (`pntBoulder`, `pntBoulderAt`) are domes, one in each cell of a grid `boulder` px across (radii `boulderR`, some flatter-topped, `boulderFlat`), the height the highest dome there, with a little noise (`rough`): so a rock is a few big masses, with creases where they meet, and a boulder at the edge raises the face there. The sinkhole never rises (`View.pitPx`). Heights are in `View.rockH` (whole px) and `View.rockHf` (sixteenths, for smooth normals).
- **Projection.** `paintRockArea` marches each column from the front (south) back. Every surface point is drawn at its row less its height, and the steep ones are stretched down over the rows below them as a face. A rock's top therefore stands up over the ground north of it. For each pixel of rock, `View.rockLift` holds the lift plus 1 (0 for ground), and so the floor row the pixel stands on is `y + lift − 1`.
- **Shading.** Each rock pixel blends a top's value (its slope to the light, `lamLo`, steepened by `T.paint.facet.relief`) and a face's (`faceBase`, plus `faceUp` for its height up the face, plus `faceWest` where it turns to the light), weighted by how steep it is (`steep`). Faces are darker than lit tops. It's then laid in strokes on the rock ramp (`topLo`–`topHi`, `faceLo`–`faceHi`), and then:
  - facets: the rock is cut into slab cells in the view's px (`T.paint.slab`, wider than tall). Each facet is a flat plane: a top pixel's value is drawn (`T.paint.facet.flat`) towards its facet's own, the boulders' slope under the facet's site (`pntSlabSite`) tilted its own way (`tilt`), so a top reads as a few flat lit planes. Each facet has a tone of its own too (`slab.tone`). Where a broad noise is high (`slab.big`) the cells come from a grid two and a half times coarser, with harder-gated cracks, so a big mass has a few big planes among the smaller facets rather than an even mosaic;
  - masonry: a ruin's rock (a look with `paving`: the Temple, ruins) is cut into dressed blocks laid in courses instead (`slab.mason`, `pntBlocks`), joints shifted each course, nearly every joint cracked, a few blocks fallen out;
  - cracks: along a facet's foot, a dark crack, and under it along the next facet's top a lit bevel, both in broken lengths (a gate of noise stretched across, `gate`, `gateS`), and now and then down a facet's side (`side`). Never on every edge: that reads as cracked mud;
  - strata on faces: long strokes a shade or two off (`strata`, `strataAmt`);
  - soot in the creases where boulders meet (`crease`, `creaseR`);
  - a lit rim along the silhouette's top edge where the top faces the light (`rim`, `rimLit`; elsewhere a shade lighter), and a lit lip where a top turns down into a face;
  - soot at a face's foot.
  The facets read only the boulders, not the footprint, so mining changes no facet; a pixel's tone reads the heights only within `facet.smooth` px of its own surface point and its stroke's middle, which bounds the repaint after mining (`pntRepaintRock`).
- **What grows on it** (`paintrock.js`, `pnrRockGrowth`). The wall growth the undergrowth works out (moss climbing a face over a bed at its foot; roots, vines or icicles hanging from a lip; under the sky a ragged fringe of dry grass over a mesa's lip) is painted onto the rock layer, stretched to the face's height, so it shows on the faces and lips. A face is found from the footprint and heights (each south edge, up to the highest point its edge zone is drawn), not the drawn layer. Rootdeep's rock woven of roots follows the top's surface and runs down its faces. A tear's wash (`pnrTintRock`) and a graft's look (its rock ramp inside the graft's outline) reach the rock too, by where each rock pixel stands on the floor.
- **Ore and veins.** These are on the rock layer (`pntRockDecor`): crystals on the ore tile's lifted top, and one on its face where it faces the ground. The ore's light, its twinkle and the mining target are lifted with it (`pntLiftAt`).
- **One picture.** The rock is laid over the ground in the floor's own buffers (`pntComposite`), so a frame still draws the floor as one picture. The rock buffer (`View.rockBuf`) is kept for occlusion.

### Occlusion

Anything standing north of rock that rises in front of it is hidden by it. After each actor in the sorted list is drawn, `paintOccludeActor(a, ox, oy)` draws the rock back over it with `paintOcclude(x, y, w, h, feetY, ox, oy)`: every rock pixel in the box whose floor row is south of the feet, in both layers, so a glow behind the rock is hidden too.

- An 8×8 block table (`View.rockBlk`, the furthest floor row any rock in the block stands on) passes over most sprites at once.
- Boxes are cached while they don't move.
- Hanging plants (`a.top`) belong to the rock and aren't covered. They hang from the lip of the face over their anchor (`pnrLipAbove`), not its foot.
- **Flat things on the ground** have no feet to sort by. A hazard's bubbles and glints, ripples, foes' marks, a waystone's rings and cast marks are drawn before the actors; then `pnrOccludeGround` lays back the rock over every tile where one of them may have been drawn (found from the same state they're drawn from), all of each tile's rock pixels, in both layers, the rock's own glow put back. Each tile's rock is kept as a picture until it's painted again. Things that stand up off the ground (a vent's fire, a spore pod, an afterimage) are drawn after that, each hidden by its feet.
- Drops, the outpost's stations and the lanterns call `paintOcclude` themselves.

A new kind of actor needs a size in `paintOccludeActor`, or its own call to `paintOcclude`.

### Light and shadow

The per-frame lighting is unchanged. It multiplies the painted colours, so the painted ramps are albedo:

- In `shadow.js`, the lamp's rays still march through the footprint. A cell of the light grid counts as rock where the rock is drawn (`View.rockLift`). A face is lit where the ground below it is lit, up to the tallest lift (`pntMaxLift()`).
- Prop shadows skip drawn rock.
- The brow lamp is 39 art px over the feet (`T.light.shadow.eye` 26 world px); Wick hovers above it (`T.wick.up` 29).

### Painting lazily

A floor is painted in chunks of 48 art px (heights in chunks of 96) as the view nears them (`pntFrame`, `T.paint.lazy`):

- the view and `near` tiles around it before the frame is drawn;
- out to `far` tiles within `budget` ms a frame.

A fixed light whose sight reaches a newly painted chunk is worked out again once painting goes quiet. Mining (`repaintAround`) paints its neighbourhood first if it isn't yet.

## Sprites

`PntSpr(w, h, seed)` is the painted sprite builder (`paint.js`):

| Method | What it draws |
|---|---|
| `ell(cx, cy, rx, ry, ramp, { lo, hi, bias, jit, mask, glow })` | A shaded dome. Its value comes from a sphere's normal against the upper-left light, laid on `ramp[lo..hi]` in short runs. `bias` lightens it; `jit` is the runs' jitter; `mask(x, y)` limits it; `glow` makes it emissive. (Until the cleanup pass its light came from the lower right; the creatures' `FpSpr` had its own, now it only lowers a dark creature's tones and calls this.) |
| `limb(points, w0, w1, col(t, side))` | A tapered limb through the points. `side` is −1 on the lit edge, 1 on the shadow edge, 0 in the middle. |
| `poly(points, col)` | A filled polygon. `col` is a colour, or `(x, y) => colour`. |
| `px(x, y, col, glow)` | One pixel, set by hand: eyes, glints, circuits, lamps. |
| `box(x0, y0, x1, y1, ramp, o)` | A rounded block. |
| `flip()` | The sprite mirrored left to right. |
| `done()` | `{ c, ec, w, h }`, as `drawArtSprite` takes. |

How a figure is painted (see `kindlerFrame` in `diver.js`):

1. Far limbs first, darker (`lo`/`hi` lowered).
2. Then the body masses: dark ramps, with plate catching the light on its upper left.
3. Then near limbs.
4. Then the head.
5. Then the features by hand: a black pane with one glint, the brow lamp, amber circuit lines a pixel wide, eyes as single pixels.

Give the sprite its anchor (`ax`, `ay` at the feet) and its points (hands, lamp) in its own pixels, and `flash = tinted(c, '#ffffff')`.

- **Walk.** The Kindler's is a four-step cycle: a foot down in front, passing (the body a pixel higher, the other foot lifted), the other foot, passing. Walking towards the camera the forward foot is lower; walking away, it's higher. Arms swing against the legs.
- **Facings.** Five are drawn (S, SE, E, NE, N); the other three are mirrors (`buildKindlerSprites`).
- **Cast pose.** The arm on the aim's side is thrust out to a fist (`castHand`). From the front and back, the casting hand's own arm is used. `restHand` and `restBehind` give the other hand.

For creatures:

- dark masses, with lit rims on their plates;
- seams as dark strokes, with flesh showing low down;
- eyes as single bright pixels;
- legs as `limb`s, the far ones darker;
- crystals as `poly`s lit on their left.

The sample's crawler and wisp (`zsprites.py`) show the idea.

**Read at a glance** (`fpReadable`, `T.paint.foes.read`). Every creature sprite is finished so it stands off any ground without an outline: the silhouette's edge on the light's side (top, left) is drawn a little towards pale, broken; its edge on the shadow side (right, below) and its thin limbs sink towards the violet black, so it holds against light sand and snow; the contact shadow under its feet has a darker core. The lit rim is kept apart (`rimEc`) and drawn on the glow layer in a dark place, more the darker it is (`View.pntLift`, as the floor there is painted lighter for the dark), paler than in the picture. A mirrored creature is read again from its unread picture (`fpReadableFlip`), so its rim stays on the left. The skink and the Moss Idol are a step darker, as their colours sat too near their ground's.

**Fighting plants** are painted by the flora's painter (`pflSprite`, or a piece's hand painter), from the piece they imitate with its glow turned red (`fpPlantSprite`), so they match the plants round them.

## Known gaps after phase 1

- **Wall growth, hanging plants, ground effects, a tear's tint and a graft on the rock** were gaps after phase 1; the rock phase fixed them (above). A new kind of thing drawn flat on the ground needs its tiles marked in `pnrOccludeGround`.
- **The rock is still made by a rule.** Its boulders and facets are spread by noise, not by where a shape needs a big plane or a deep crack. The big planes (`slab.big`) break up the mosaic on big flat tops, but where they fall is chance.
- **Mining** paints again only the rock round the heights that changed (`pntHfWatch`, `pntHfChanged`; if none did, as when a vein is charged, the whole reach), and in a cave one row less of ground (the sun's shadow under the sky needs it). It matches a fresh paint pixel for pixel.
- **Painting costs more.** A painted chunk costs about 3 times what the old painter did for the same area. The first walk through new ground costs a few ms a frame while it fills in.

## The outpost, people and effects (phase 2, branch `painted-hub`)

- **The outpost** is painted in `js/hubart.js` (helpers `hart…`; `hartStrokes` lays a region in short strokes from a value function). The stations (a brick forge with its chimney, anvil and fire; the rune bench; the locker; the altar and its floating shard; the uplink), the lanterns and the tents now stand among the walkers, sorted by their feet (`hubProps`, each with its own `hubDraw` and `paintOcclude`), so the Kindler passes behind them. The star is a faceted crystal in a loose amber halo; its lodelines fall in broken strokes. The portal is shaded in strokes, without its outline.
- **Lived in.** `HUB_DRESSING` places crates, barrels, sacks, a banner, a hand cart, a tool rack and a fire ring, more as landers come down; a worn seed-star is inlaid in the flagstones and a cable runs from the uplink. The smith hammers at the anvil once one lander is down, and a settler sits by the fire from two.
- **People.** Settlers are painted, about 36 px: hooded coats in four looks, a scarf, goggles with a teal glint, a lamp in the far hand, idle and a four-step walk. The Kindler's side view is broader, with his pack; from behind he's navy with royal-blue edges. Wick is a painted drone: a gunmetal dome with a dark glass band for its cyan eye, fins, a brass antenna and its violet lift glow.
- **Effects** (`js/castfx.js`, `T.paint.fx`): each element has a five-tone ramp. The Arc is a thick tapered crescent, white-hot on its outer edge. A swept ring (a Nova, a Well, a burst) is painted along its curve, not in rows (rows stacked into bands of dashes on its sides): white-hot outside, its colour within, its deepest tones on its inner edge so a pale ring (frost) holds on snow, strokes 4 to 9 px along it, a rare gap, loose pixels off it and short strokes trailing inside. A chain's arc and the storm's strike are forking bolts (`cfxBoltPath`, `cfxPaintBolt`): split at displaced middles at every scale, white-hot core, lit on the upper side, deep on the other, tapering to the ends, a new shape every few frames. A spell's light lies on the ground as loose strokes of its colour. A death is a splash and a puff rather than a spray of pixels; its splash has a wet lit edge and glowing flecks that die first, and in a dark place it's laid over the light a little.
- **Settlers' heads** read as hooded faces: the hood's lit edge, the face in its opening (the cheek nearest the light lit, the hood's shadow behind), goggles a dark band with a bright glint.

## Flora, props, ore and drops

`js/pflora.js`, numbers in `T.paint.flora` and `T.paint.ore`.

- **Flora** (`pflSprite`, through `floraSprite`): a piece's letter grid is enlarged by the grid's own rules (scale3x), then painted: form shading from the upper left laid in short strokes on each material's eight-tone ramp (`pflRamp`); foliage (`PFL_LEAFY`) in loose clumps, frayed two px at a time, strays over its top; upright parts a pixel or two across are strands, lit up to their tips; no outline, but the shadowed side keeps a rim of deep tones. Same size and anchor as before. Pieces painted by hand instead are in `PFL_HAND`.
- **The ground cover** (`pflCoverKit`, through `ugKit`): rootlet tufts, sprigs, moss clumps, pebbles, roots, the stands' stems and the blades before a plant's foot, all by hand, as 32-bit stamps.
- **Ore** (`pflOreTile`, from `pntRockDecor`): a cluster of prisms (`pflCrystal`) out of a soot socket, flecks round it, one on the face. Crystals may stand up past their tile over what's behind them.
- **Props** (`pflRepaintProp`): a prop drawn in its stone's four tones is laid again in strokes, with a deep rim on its shadowed side and no outline. The spire, waystones and portals use it.
- **Drops** (`pflDropSprite`): a heap of prisms or a cut gem, cached by colour.
