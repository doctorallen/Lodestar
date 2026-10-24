# Lodestar

A top-down pixel-art game for the phone browser, upright or sideways. A seed-star has been brought to a dead world, and you are the Kindler woken to carry its light out: one dark map, the star at the middle of it, and you fighting what lives in the dark with the light draining as you go. The game is being rebuilt round the Veins (`DESIGN.md`): laying lines of the star's light outward by walking, planting nodes that must be defended while they set, and the star's growth being your own. What's here now is the ground of that: the star, the one bar, the fight, the dark.

`DESIGN.md` is the design; `DECISIONS.md` says why things are the way they are.

**Play locally:** `python3 -m http.server 8000`, then open http://localhost:8000 (or open `index.html` directly).

## How to play

| | Phone | Keyboard |
|---|---|---|
| Move | Left thumb, anywhere on the left deck | WASD / arrows |
| Spell A, from the right wrist (an Arc combos): tap to cast, hold to charge | The big button | J |
| Spell B, from the left wrist (a Bolt) | The blue button | K |
| Dash | DASH, or flick the move thumb | Shift / U |
| Act where you stand (the thread, the planting: coming) | The button that appears | E / Enter |
| Pause (MUSIC, SOUNDS, FINE GRAIN, the landing again, START OVER) | II | Esc / P |

- **One bar.** Your light is your health. In the star's light it fills; in the dark it drains, full to empty in three minutes, and a hit knocks a piece out of it. Below 40% the lamp dims and the dark stirs more creatures. At nothing you fall.
- **A fall** wakes you at the star, and the star's core loses one of its seven pieces. Standing a node sets gives one back (coming). At no pieces the star goes out, and the world with it.
- **The dark** lives in the caverns beyond the light: the crawler's crouch and lunge, the wisp's orbs, the stalker's reach, the snapjaw, the spitter, and each clime's own creature. Nothing hunts in the star's light.

Where there's WebGL2 the whole frame is drawn by the GPU (`docs/RENDERING.md`): one canvas, nothing read back. `?nogpu` in the address keeps the 2D canvases and the JavaScript lighting, as a browser without WebGL2 gets; `?perf` shows a readout over the frame (which path draws, what a frame costs, how the frames are spaced, the first error) for seeing what a phone sees.

FINE GRAIN, on the pause screen, draws the world at twice the art's pixels (3 to a world pixel, so the painted ground, the rock and the Kindler come out sharper). It needs WebGL2, costs about twice the frame, and reloads the game; it's meant for a desktop or a strong phone. `?fine` or `?coarse` in the address overrides it.

## Files

Every file is a classic script sharing one global scope, loaded in order by `index.html`.

| File | What's in it |
|---|---|
| `js/util.js` | DOM shortcut, error capture, seeded `Rng`, maths, colours, sprite helpers |
| `js/version.js` | The build stamp, written by `.githooks/pre-commit` |
| `js/tuning.js` | Every gameplay number, the ores and biomes, the star, the bar |
| `js/save.js` | The save in localStorage: the world's seed, the star's magnitude and core, the said lines, the settings |
| `js/lab.js` | The paint lab: the painted look's toggles, from the pause screen or the address |
| `js/loader.js` | The loading screen, the Charter's systems booting up: a list of tasks run in slices with an honest bar, building ahead what play would otherwise build mid-fight (the sound bank, every Kindler frame, the world painted and drawn once, the clime's creatures and plants), then TAP TO BEGIN |
| `js/audio.js` | Sound, made in code with Web Audio: the engine, the effects, and `snd(name, opts)`, the hook the game calls |
| `js/music.js` | The music that grows with the star and thins in the dark, each place's own sound; footsteps, heartbeat, stings |
| `js/sndbank.js` | The fight's sounds and the footsteps, layered and rendered ahead into a few variants each with an OfflineAudioContext |
| `js/floor.js` | Seeded floor generation: rooms, corridors, veins |
| `js/art.js` | The art style: palettes, sprite builder, enemies, icons, cave painting |
| `js/paint.js` | The painted style (docs/PAINTED.md): stroke ramps and strokes, the ground's tones, the rock rising as a heightfield from a steep three-quarter camera, occlusion, lazy painting in chunks, and the painted sprite builder |
| `js/paintrock.js`, `js/painthole.js`, `js/pflora.js` | The rock's growth and tint, pools and the wading cut, the painted plants |
| `js/flora.js`, `js/undergrowth.js` | Each biome's flora, and how it grows into a place |
| `js/climes.js`, `js/hazards.js` | Climes: each one's palette, flora, critters and weather; each clime's hazard at play |
| `js/story.js` | The story: the opening's captions, Wick's lines, the star's words, the echoes, the endings |
| `js/star.js` | The Lodestar in the world: where it stands, its light on the land (`starLight`, `litAt`), the daylight by it, the heart drawn colossal |
| `js/terraform.js` | The land terraforming by the light: starstone spreading from the star, gold veins running on through the land, the ground greening, lit motes |
| `js/hubart.js` | The star and its halo, painted; the older outpost's pieces, kept for the opening |
| `js/intro.js` | The opening: five painted scenes that play on their own, their captions, SKIP and tap to hurry, and the last shot drawn by the game itself |
| `js/diver.js` | The Kindler's sprite, painted: posed and rendered in five facings, the bubble helm, the Splinter's lattice of hard light over the suit; Wick |
| `js/circuits.js` | Spells: the Forms, Elements and Mods in words, the two spells, casting each Form; what's in flight and what lingers |
| `js/art2.js`, `js/art3.js` | Art for the story and the sunlit surface; icons |
| `js/foesart.js`, `js/foespaint.js` | Each clime's own creature: its frames drawn by hand, and its colours; the creatures painted |
| `js/game.js` | Game state, the world's play: the Kindler's numbers and two spells, the world built from the seed, walking, the bar, channels, a fall |
| `js/enemies.js`, `js/foes.js`, `js/affixes.js`, `js/natures.js`, `js/reactions.js`, `js/resonance.js` | Spawning, the flow field, each creature's behaviour and tells; elite affixes; what each is weak to; the elements' statuses; the resonances (the fight as it was, to be rethought) |
| `js/combat.js` | The hands' buttons, the dash, damage, kills, pickups |
| `js/storm.js` | The Lodestorm's strikes on the surface |
| `js/life.js` | Ambient life and weather (cosmetic): critters, cloud shadows, dust, drips |
| `js/shadow.js`, `js/pshadow.js` | Shadows from the light: the rock stops the lamp; cast shadows of what stands on the ground |
| `js/gpu.js`, `js/gllight.js`, `js/perf.js` | The frame on the GPU, its light pass, the `?perf` readout |
| `js/render.js` | The pixel view (art px, 1.5 to a world px), the frame drawn in order, the JavaScript lighting and bloom for the 2D path, sparks |
| `js/castfx.js`, `js/hardlight.js` | How a cast looks, and the hard-light shapes the spells are built from |
| `js/input.js` | Joystick, buttons, keyboard, and `Input.bot` for the tests |
| `js/ui.js` | The screens (the story's panels, pause, the paint lab, start over), the top bar, toasts and speech |
| `js/wick.js` | Wick, the drone at the Kindler's shoulder |
| `js/main.js` | Boot, then the loading (`bootEnter` after its tap), the fixed-step loop, the upright and sideways layouts |
| `test/` | Static checks, floor generation with golden hashes, the GPU's frame against the 2D path's, and a headless smoke run |

## Tests

```sh
npm ci       # test tools only
npm test     # everything CI runs
node test/gllight.js                      # the GPU's frame against the 2D path's, pixel for pixel, with WebGL in software
```
