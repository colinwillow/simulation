# Lantern Isle

An autonomous ecosystem simulation in a single HTML file. An island populated by creatures
that forage, build, hunt and reproduce without scripting — the world starts quiet and,
over the course of a few in-game days, grows into a lit settlement.

It is a **scaffolding**, not a finished game. Every creature is a placeholder built from
noise-displaced primitives, with a clean seam for swapping in real models later.

---

## Running it

Open the HTML file in a browser. There is no build step, no package install, no server.
Three.js r128 loads from cdnjs. That constraint is deliberate — keep it if you can, because
it makes the whole thing a single artifact you can open on a phone.

**Controls**

| Input | Action |
|---|---|
| Left stick / WASD / arrows | Move the wanderer |
| Right stick | Look |
| Tap right stick / Space | Jump |
| Scroll / pinch | Zoom |
| Tap the ground | Drop a spark (attracts motes; may seed a bloom) |
| `fly` button | Drone mode — free 3D movement, for reaching the floating isle |
| `free cam` button | Detach the camera and hide the wanderer |

---

## Architecture

One file, top to bottom, in dependency order:

1. **Quality tier** (`Q`, `MOBILE`) — segment counts, particle counts, shadow resolution
2. **Noise + terrain field** — `height(x,z)` is the source of truth for the world's shape.
   Everything else samples it: mesh generation, creature movement, camera collision, water depth.
3. **Renderer, materials, geometry pools** (`M`, `G`) — shared materials and displaced primitives
4. **Sky, lights, terrain mesh, water, foam, grass**
5. **Obstacle field** (`OB`) — spatial hash of solid footprints
6. **Particle systems** — `PSys` (point sprites) and `Streaks` (velocity-stretched billboards)
7. **Flora** — `LanternTree`, `GreatTree`, `MossTuft`, `Bloom`, `Log`, `Stump`, `Mound`, `Cairn`
8. **Creatures** — `Creature` base class plus seven species
9. **Landmarks** — `Campfire`, `FloatingIsle`, `Cave`, `Ferry`
10. **The wanderer** (player) and twin-stick input
11. **Post-processing** — bloom, grade, vignette
12. **Main loop**

### The core pattern

Every creature is a subclass of `Creature` with exactly two methods that matter:

```js
class Grazer extends Creature {
  build() { /* geometry — replace this with your model */ }
  think(dt) { /* behaviour — steering, state machine */ }
}
```

`build()` runs once in the constructor and assembles the body into `this.body`.
`think(dt)` runs every frame and sets steering intent. Everything else — locomotion,
collision, terrain alignment, leg animation, render smoothing — is handled by the base class.

**This is the seam for custom models.** Load a GLTF, drop it into `this.body`, delete the
primitive assembly, and the creature keeps behaving identically. Same for the wanderer
(one IIFE near the input section).

### Species

| Name | Role in the web |
|---|---|
| Mossback | Grazes moss, herds, seeds new moss, breeds |
| Tinker | Fells trees, hauls logs, builds cairns into lantern towers |
| Mudlark | Digs mounds which later flower into blooms |
| Glimmerfin | Schooling fish, follows the ferry's wake, leaps |
| Kitewing | Carries pollen between blooms, sows trees, roosts in the great tree |
| Grovewalker | Huge, slow, carries a grove on its back, browses canopies |
| Hopper | Tiny, trails the big grazers |
| Leviathan | Sea serpent; body follows its own wake, breaches and spouts |

The causal chains matter more than any individual species: mudlark digs → mound → bloom →
motes gather → seed → sapling → tinker fells it → cairn → beacon → creatures gather at the
light at night. The event log at the bottom only reports real chains, never flavour text.

---

## Systems worth understanding before you change things

### Obstacle field
Solid things register a footprint circle in a coarse spatial hash (`obAdd`/`obRemove`).
Creatures use it three ways: rejecting waypoints, steering around things ahead
(with committed side-choice so they don't oscillate), and hard push-out if they end up inside.

Escape hatches exist because a wedged creature stalls the ecology: a creature that can't be
pushed clear retreats toward its last known good position, and one that stays pinned for
2.5s briefly "ghosts" through. `minObR` lets big creatures ignore small footprints —
a grovewalker shoulders through saplings but goes around elders and boulders.

### Camera
A drone follow-cam. It marches the boom from you to the lens against the height field;
if blocked it first *climbs*, and only pulls in tight if climbing can't clear it. Returns
to rest slower than it reacts.

### Water
Gerstner waves (points move in circles, not up-down — that's what gives sharp crests and
flat troughs). Four trains, each modulated by a slow drifting envelope so waves arrive in
*sets*. Terrain depth is baked into the mesh as a vertex attribute for depth-based colour.
Fresnel toward the live sky colour. Kelvin-style wake trails anything cutting the surface
(4 slots, filled by priority each frame).

### Particles
Two systems. `PSys` is point sprites — fire, smoke, embers, mist. `Streaks` is instanced
quads that stretch along their velocity in view space — the waterfall, splash. Use `Streaks`
for anything fast and directional; the stretching is what sells motion.

---

## Tools

Three Node scripts in `tools/`. All were written because I shipped bugs that these would
have caught.

```bash
npm install three@0.128.0 glslang-validator-prebuilt-predownloaded

node tools/glslcheck.js index.html    # compile the water shader for real
node tools/terrain.js  index.html     # land area, walkable %, height distribution
node tools/headless.js index.html 6000 # run 6000 frames with no GPU, print sim stats
```

**glslcheck** pulls the water material out of the HTML, runs it through Three's real
`onBeforeCompile` path, resolves all `#include` chunks the way Three does, and compiles the
result as GLSL ES 1.0. Run this after *any* shader edit.

**terrain** samples the height field on a grid and reports land area, walkable fraction and
height distribution. Use it to check terrain changes against intent instead of eyeballing.

**headless** stubs the DOM and WebGL, runs the simulation for N frames, and reports
population counts, collision penetration, stuck timers and progression. Use it to check that
ecology changes don't stall the world.

---

## Gotchas (each of these cost a debugging cycle)

- **Three r128 chunk order.** `defaultnormal_vertex` comes *before* `begin_vertex`, so
  `transformed` doesn't exist yet when you're computing normals. Use `position`.
- **`roughness` is a uniform.** You cannot assign to it in a fragment shader. Set a global
  in `map_fragment` and override `roughnessFactor` in `roughnessmap_fragment`.
- **Winding order.** A radial mesh wound the wrong way faces down and vanishes under
  backface culling — you'll see straight through the object to whatever's inside it.
- **Downward faces go black.** A cone underside lit only by a sun above gets no light.
  There's a dim up-light (`fill`) for this.
- **Draw calls are the budget, not triangles.** `mergeBin()` bakes static sub-meshes into one
  buffer per material. Use it for anything that doesn't animate independently.
- **No `BufferGeometryUtils`** in the plain r128 build — that's why `mergeBin` is hand-rolled.
- **InstancedMesh colours** need `instanceColor` (via `setColorAt`), *not* `vertexColors`
  with a geometry colour attribute.
- **Bloom threshold is delicate.** Too low and ordinary daylight blooms, washing the whole
  scene to white. It's at 0.88 so only genuinely emissive things glow.
- **Test the harness too.** More than once the tests were wrong, not the code — a collision
  check that didn't know about `minObR`, a canvas stub missing `createImageData`. If a result
  looks insane, suspect the measurement first.

---

## Tuning knobs

| What | Where |
|---|---|
| World size | `W` (landform coords scale by `WS`) |
| Day length | `DAY` (seconds per full cycle) |
| Population caps | `MAX` |
| Tree growth rate | `GROW_T` |
| Beacon / tower thresholds | `BEACON_LVL`, `TOWER_MAX` |
| Mountain range placement | `RANGE` (line segment + width + height) |
| Wave size and grouping | `waterUni.uW` / `uG` |
| Quality tiers | `Q` |

---

## Known rough edges

- Ecology pace varies a lot between seeds. Some runs light a beacon by day 3, others by day 6.
  Worth adding a seeded RNG so runs are reproducible — that would make regressions far
  easier to spot.
- Mobile performance is untested at the current entity counts. The FPS/draw-call readout in
  the HUD is there for exactly this.
- Creatures wall-slide along obstructions rather than turning away, which can make them hug
  terrain and cover less ground than they used to.
- The floating isle's grove and the great tree's canopy are the heaviest mesh clusters.

---

## Where I'd go next

- Swap placeholder geometry for real models, species by species — `build()` is the only
  method you need to touch.
- A seeded RNG for reproducible runs.
- LOD or instancing for distant trees; they dominate the draw call count.
- Give creatures memory — a mossback that remembers where good moss was, a tinker that
  returns to a favoured cairn.
- The LLM layer: creatures already have distinct roles, states and a causal event log.
  A creature's recent history is a natural prompt context for giving it a voice.
