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

`pntLook(b)` gives a floor look's ramps, cached:

- `ground`: 7 tones from the look's three floor colours (`calmRgb` under the sky, `rampRgb` underground, so they keep the old hue shift).
- `rock`: 10 tones from its three rock colours and three face colours, sorted by lightness, lit towards its rim colour (`rock[3]`).

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
- streaky lit patches (stretched noise, cut soft);
- the old clusters, faintly;
- a hard dark line and a falloff at a wall's foot, and a little beside walls;
- under the sky, a rock's shadow cast to the lower right as far as the rock stands high.

`paintCaveTile` (`art.js`) reads the tones (`View.groundTone`). Flagstones (`paving`) shift each stone's tone and keep their seams and bevels. The clime's hazards, decor and the flora's beds paint over the ground as before.

## The rock and the camera

The camera is a steep three-quarter view: **rock rises**.

- **Footprint.** It's unchanged: collision, generation and `View.rockPx` (the smooth wall line).
- **Heights.** `pntHeights` raises each rock pixel of the footprint from its distance in from the rock's edge (`T.paint.wall`): a steep rise of `face` px over `edge` px (the face), rounding over into a top, plus boulder bumps (`bump`, `bumpScale`) that grow in over `ramp` px. The sinkhole never rises (`View.pitPx`). Heights are in `View.rockH` (whole px) and `View.rockHf` (sixteenths, for smooth normals).
- **Projection.** `paintRockArea` marches each column from the front (south) back. Every surface point is drawn at its row less its height, and the steep ones are stretched down over the rows below them as a face. A rock's top therefore stands up over the ground north of it. For each pixel of rock, `View.rockLift` holds the lift plus 1 (0 for ground), and so the floor row the pixel stands on is `y + lift − 1`.
- **Shading.** Each rock pixel blends a top's value (its slope to the light, `lamLo`) and a face's (`faceBase`, plus `faceUp` for its height up the face, plus `faceWest` where it turns to the light), weighted by how steep it is (`steep`). It's then laid in strokes on the rock ramp (`topLo`–`topHi`, `faceLo`–`faceHi`), and then:
  - strata on faces: long strokes a shade or two off;
  - slabs (`T.paint.slab`): big cells, each its own tone, with a lit lip along the top and a dark crack under it, broken by noise;
  - soot creases where a top folds;
  - a lit rim along the silhouette's top edge, and a lit lip where a top turns down into a face;
  - soot at a face's foot.
- **Ore and veins.** These are on the rock layer (`pntRockDecor`): crystals on the ore tile's lifted top, and one on its face where it faces the ground. The ore's light, its twinkle and the mining target are lifted with it (`pntLiftAt`).
- **One picture.** The rock is laid over the ground in the floor's own buffers (`pntComposite`), so a frame still draws the floor as one picture. The rock buffer (`View.rockBuf`) is kept for occlusion.

### Occlusion

Anything standing north of rock that rises in front of it is hidden by it. After each actor in the sorted list is drawn, `paintOccludeActor(a, ox, oy)` draws the rock back over it with `paintOcclude(x, y, w, h, feetY, ox, oy)`: every rock pixel in the box whose floor row is south of the feet, in both layers, so a glow behind the rock is hidden too.

- An 8×8 block table (`View.rockBlk`, the furthest floor row any rock in the block stands on) passes over most sprites at once.
- Boxes are cached while they don't move.
- Hanging plants (`a.top`) belong to the rock and aren't covered.
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
| `ell(cx, cy, rx, ry, ramp, { lo, hi, bias, jit, mask, glow })` | A shaded dome. Its value comes from a sphere's normal against the upper-left light, laid on `ramp[lo..hi]` in short runs. `bias` lightens it; `jit` is the runs' jitter; `mask(x, y)` limits it; `glow` makes it emissive. |
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

## Known gaps after phase 1

- **Creatures, critters, flora, props, stations, the portals and the effects** are still A+ sprites with outlines. They stand and are hidden correctly, but their look clashes until they're repainted.
- **Wall growth is hidden.** Moss up a face, roots and icicles painted into the ground layer (`undergrowth.js`) and a clime's rock decor (`paintRootRock`) are covered by the rising rock. The flora phase should paint them onto the rock layer.
- **Hanging plants** (`anchor: 'ceiling'`) still hang from the footprint's edge, now at the foot of the face rather than its lip.
- **Ground effects aren't hidden.** Things drawn flat on the ground (hazard animations, cast marks, rift tint) aren't hidden by rock in front of them, and the rift's tint and a graft don't reach the rock.
- **Painting costs more.** A painted chunk costs about 3 times what the old painter did for the same area. The first walk through new ground costs a few ms a frame while it fills in.

## The outpost, people and effects (phase 2, branch `painted-hub`)

- **The outpost** is painted in `js/hubart.js` (helpers `hart…`; `hartStrokes` lays a region in short strokes from a value function). The stations (a brick forge with its chimney, anvil and fire; the rune bench; the locker; the altar and its floating shard; the uplink), the lanterns and the tents now stand among the walkers, sorted by their feet (`hubProps`, each with its own `hubDraw` and `paintOcclude`), so the Kindler passes behind them. The star is a faceted crystal in a loose amber halo; its lodelines fall in broken strokes. The portal is shaded in strokes, without its outline.
- **Lived in.** `HUB_DRESSING` places crates, barrels, sacks, a banner, a hand cart, a tool rack and a fire ring, more as landers come down; a worn seed-star is inlaid in the flagstones and a cable runs from the uplink. The smith hammers at the anvil once one lander is down, and a settler sits by the fire from two.
- **People.** Settlers are painted, about 36 px: hooded coats in four looks, a scarf, goggles with a teal glint, a lamp in the far hand, idle and a four-step walk. The Kindler's side view is broader, with his pack; from behind he's navy with royal-blue edges. Wick is a painted drone: a gunmetal dome with a dark glass band for its cyan eye, fins, a brass antenna and its violet lift glow.
- **Effects** (`js/castfx.js`, `T.paint.fx`): each element has a five-tone ramp. The Arc is a thick tapered crescent, white-hot on its outer edge, and rings are broken strokes. A spell's light lies on the ground as loose strokes of its colour. A death is a splash and a puff rather than a spray of pixels.
