# Lantern Isle

An autonomous ecosystem simulation in a single HTML file. An island populated by creatures
that forage, build, hunt and reproduce without scripting — the world starts quiet and,
over the course of a few in-game days, grows into a lit settlement.

It is a **scaffolding**, not a finished game. Every creature is a placeholder built from
noise-displaced primitives, with a clean seam for swapping in real models later.

---

## Running it

Open `index.html` in a browser. There is no build step and no package install.
Three.js r128 still loads from cdnjs; the two glTF loaders and the Draco decoder live in
`vendor/` (see **Models** below), so keep the page on a server — `file://`
will not fetch the model. `python3 -m http.server` is enough, and GitHub Pages serves it
as-is.

**On a phone**, use Share → Add to Home Screen. The page declares itself an app (the
`apple-*` metas for iOS, `manifest.webmanifest` for everything else) and runs full-screen
with no browser chrome; the HUD and sticks keep clear of the notch and home bar through
`env(safe-area-inset-*)`. The icons live in `icons/` and come from one source image:
`node tools/icons.js path/to/icon.png` crops the picture out of any bezel and writes the
three sizes. iOS masks its own corners, so a full-bleed square is what it wants.

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
primitive assembly, and the creature keeps behaving identically. The wanderer already works
this way — see below.

### Models

Any GLB goes through one pipeline, in `loadModel` / `attachRig` (defined above the creatures,
because creatures depend on them). A file is fetched, repaired and measured **once**; every
user after that gets a clone sharing its geometry and materials.

`MODEL` holds the repairs every Blender export so far has needed — `forceOpaque`,
`ambientLift`, and the walk playback bounds. They are model-wide, not per-model.

Three things are measured rather than hardcoded, so a re-export at another scale or tempo
still drops in:

- **Size.** `modelBounds()` walks every vertex through `boneTransform` when there is a
  skeleton. `Box3.setFromObject` is *wrong* on a skinned mesh — it transforms the rest-pose
  box by the world matrix and ignores the bind matrices, which on these exports (0.01
  armature scale against 100x inverse binds) is off by about 100x. It falls back to
  `setFromObject` for a static mesh, which has no `boneTransform` to walk. That same bad
  box drives frustum culling, hence `frustumCulled = false`.
- **Stride.** `measureStride()` samples how far a foot travels along z through the walk
  cycle; two of those per cycle is the ground speed the clip was authored for. Returned in
  model units and cached per file, so six creatures do not each pay for it.
- **Lantern position**, outboard of the widest point, so it does not hang through a face.

`cloneModel()` matters for creatures: a `SkinnedMesh` cannot be plain-cloned, because the
copy keeps pointing at the original skeleton and every instance moves as one. That is what
`vendor/three/SkeletonUtils.js` is for.

### The wanderer

`RIG` configures the player: `url`, `height`, `idle`/`walk` clip names, `blinkL`/`blinkR`
shape names, `lamp` (`null` derives it from the model's bounds), and `yaw`.

**`yaw` is not optional, and do not infer it from geometry.** The game treats +Z as
forward. Twice now a bounding-box or centroid reading of where the eye mesh sits gave the
wrong answer — the bind pose, the arms-out A-pose and the animated pose all disagree. The
only test worth trusting takes a minute: force `heading = 0` and `cam.az = Math.PI` (where
the follow cam sits while you walk forward) and look. Seeing the back means correct;
seeing the face means the model walks backwards.

**The blend tree** (`stepRig`) is driven by what the body is doing, never by the input.
On the ground it is idle → walk → run by measured speed, with the run taking over past
about twice the walk's authored pace and each cycle played at the rate its own stride was
measured for. In the water it is tread ↔ swim forward. A jump is three one-shots chained
by the physics: `jump_initiate` while `leadT` counts down, `jump_in_air` while airborne,
`jump_landing` for half a second after touchdown. Every weight fades over a tenth of a
second; the one-shots restart the moment they are wanted. A file that lacks a role simply
does not get it — no run clip and the walk carries on at speed, no jump clips and the old
procedural stretch comes back.

**`RIG.jumpLead`** is the knob that makes the initiate clip work at all. The crouch only
reads while the feet are still on the ground, so the physical launch is held for that long
after the press and the legs extend as he lifts. It is 0.15 s with the initiate clip played at double speed, so the crouch is over by the
time he lifts. It is a real input delay; if it feels late, set it to 0 and he launches on
the press.

Clip names are matched loosely by `pickClip`, because exporters decorate freely:
`Armature|walk_fwd`, `idle.001`, `alien_walk_cycle_v2` and `Walking` all resolve. It tries
exact, then case-insensitive, then a whole word inside the name, then a bare substring.

Matching on whole words rather than substrings is what keeps a transition clip honest. A
clip called `idle_to_walk` contains both words, and a plain substring test hands the same
clip back as the idle *and* the walk. Names carrying the other state's word are considered
last, and only when nothing cleaner exists.

Junk tracks are skipped outright: Blender leaves a one-frame `CINEMA_4D_Main` in these
exports and Mixamo adds a `mixamo.com`, and no real cycle runs under a quarter second.

The alien's rigged export carries `idle` and `walk_fwd` on a Mixamo skeleton and needs
`yaw: 0`. An earlier static export of the same model had no armature at all and faced the
other way; `tools/model.js` tells the two apart in one line.

### The camera

Pitch is fixed at `CAM_POL`. Looking up and down was never worth a whole stick axis, so
the right stick only orbits now and its vertical axis is free for something else. `solveCam`
still drops the boom below `CAM_POL` to clear a hill — that is collision, not the player
aiming, and it is why a pitch reading moves a little while orbiting.

The resting distance is 24. The boom only avoids the heightfield, so anything else between
the lens and the wanderer — a tree, a boulder, the canopy — used to just block him. Now a
screen-door hole is punched through any surface that is both closer to the camera than he
is and inside a circle around him on screen. It lives in the shared `MeshStandardMaterial`
shader (a prototype `onBeforeCompile`), because the trees are merged into a few big meshes
on shared materials and there is no object to fade; `holeUni` is aimed at his chest every
frame. The terrain opts out with `userData.noHole` — the ground in front of his feet is
always nearer than his chest, and a hole in the grass every frame is not what anyone wants.
Materials with their own `onBeforeCompile` (water, grass) are untouched.

There is a `BUILD` stamp in the HUD's perf line. Pages caches `index.html`, so a phone can
sit on an old build while the repo has moved on; that once cost a whole round trip arguing
about which way a model faced. Bump it with anything that changes behaviour.

### Creatures wearing models

`CREATURE_RIGS` maps a class name to a model config. The class keeps its entire brain; only
what you see changes. The primitive `build()` still runs and stays as the fallback — the
model hides it on arrival, so a failed fetch leaves a working creature. Each instance gets
its own mixer, driven by its actual travelled speed, and its `bob` is zeroed because the
clip carries its own.

Moving `creature_green.glb` to another species is one key in that map. It is on
`Burrower` (mudlark, six of them) rather than `Grazer` (thirteen to twenty) because each
instance costs a mixer stepping 174 channels every frame, and that adds up faster than the
draw calls do.

### Draco

The model is Draco-compressed (`KHR_draco_mesh_compression` is in `extensionsRequired`), so
`GLTFLoader` alone cannot read it — it needs a `DRACOLoader` and the decoder in
`vendor/draco/`. Those files are copied verbatim out of three r128 and pinned in-repo rather
than pulled from a CDN, so there is no second origin to trust and no path to break. It also
carries `EXT_texture_webp` with a PNG fallback; r128 understands both, and picks the webp.

### Blender exports arrive blended, and it looks like a broken texture

The first thing this model did was render as blocky garbage — the mesh smeared with
mismatched patches of its own texture. It reads exactly like a corrupt UV map, and it is not.

Blender writes `alphaMode: BLEND` for any material whose blend mode is not *Opaque*, even
when the texture is fully opaque. GLTFLoader honours that: `transparent = true`, and three
then sets `depthWrite = false`. The material is also `doubleSided`. With no depth writing, a
closed double-sided body draws its own back faces and innards over its front in whatever
order the index buffer happens to run — hence the patchwork.

`MODEL.forceOpaque` clears it at load, for every model (`transparent = false`, `depthWrite = true`). Fix it at
source instead where you can: in Blender, **Material Properties → Settings → Blend Mode →
Opaque**. Turn the flag off only for a model that genuinely needs to blend.

How to tell this class of bug apart from a real texture problem, in one step: swap the
material for a `MeshBasicMaterial` carrying the same map. Unlit removes lighting, depth
sorting and blending from the picture. If it comes back clean, the texture and the UVs are
fine and the fault is in the material or the draw order — not the asset.

It is worth saying what this was *not*, since compression is the obvious suspect: Draco left
the UVs at about 2^-19 precision, roughly 256x finer than a texel, and the normals unit-length
and smooth. The webp and its PNG fallback differ by a gamma step but carry the same picture.
None of them were the problem.

### Backlit, it turns into a cut-out

Jump toward the sun over open water and the body drops to solid black, leaving the eyes
floating — which is roughly what a physically-lit dark object does against a very bright
backdrop. The island's own creatures never show it because they are painted in much lighter
flat colours.

`MODEL.ambientLift` (0.45) has each surface emit a fraction of its own colour: the textured
body through `emissiveMap`, the flat eye materials through their `color`. So shadowed sides
bottom out at a dim version of themselves instead of black. Keep it well under the 0.88 bloom
threshold, or the creature starts to glow at night.

Worth knowing when chasing something like this: `updateSky()` rewrites every light's
intensity each frame, so poking a light from the console does nothing — the next frame puts
it back. Test lighting by changing the material, or by changing the time of day.

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

### Weather

Fronts come in off the sea every few minutes. `WX` is the whole thing: a small state machine
(`clear → building → rain → storm? → clearing → clear`, with the occasional `haze` that never
rains) and three smoothed numbers, `cloud`, `rain` and `storm`, each 0..1. Nothing else in the
file asks what the weather *is*; it asks how cloudy, wet, dark or windy it is, and that is
the pattern to keep — a new system should read those numbers, not the state name.

What reads them:

- **Sky.** The dome shader grew value-noise clouds projected onto a plane overhead, a
  lightning `uFlash`, and a rainbow drawn as a 40–42° cone around the anti-solar point (red
  outside, like the real one). Overcast pulls every palette colour toward one grey.
- **Rain** is a `Streaks` system — the same velocity-stretched cards as the waterfall. Each drop
  spawns a fixed height above whatever ground is under it and lives exactly long enough to
  reach it, so rain does not fall through hills. Drops take the fog colour, so they do not
  glare white at night. `mist` does the same.
- **Wind** is one vector and a strength. Grass leans downwind and flutters harder as it
  blows; campfire smoke and embers drift with it. The sea's wave steepness scales up in a
  storm from `WX.W0`, the resting values.
- **Lightning** is a jagged polyline aimed out in front of the camera (a bolt nobody sees is
  just a flash), drawn as a thin `LineSegments` core with a stretched `Streaks` card laid along
  each segment — one pixel of line is invisible on a phone, but a card pointed down the
  segment becomes a ribbon that blooms and fades — plus a whole-sky flash through the
  hemisphere light and exposure.
  A strike on land drops a real `Spark` — the same object a tap does — so lightning can seed a
  bloom through the existing chain, and the log reports it because it actually happened.
- **The world.** Rain fills `WX.wet`, which drains over about a day: trees grow faster and
  blooms charge faster while the ground is wet. Land creatures slow in a storm, kitewings
  come down out of the wind, the ferry waits it out, the campfire gutters.
- **The camera** tilts up from `CAM_POL` while a rainbow or a storm is up; the fixed pitch
  otherwise puts the horizon at the top edge of the frame, and neither the bow nor the bolts
  would ever be seen. Rainbows are only announced with the sun under about 40°, because above
  that the bow is entirely below the horizon.
- Clear nights get the odd shooting star, another `Streaks` instance.

`isle.wx.force = 'storm'` from the console jumps the machine. The smoothed values lag the
state by ten seconds or so; set them directly if you want the look now.

One thing this turned up: the frame loop clamped `dt` only from above, and a rAF timestamp
can trail the `performance.now()` that seeded `last`, so an early frame could run the whole
sim backwards for one tick. It is clamped at zero now.

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

## Mobile

The page must not scale. iOS ignores `user-scalable=no`, so a pinch or a double tap zooms
the *page* out from under the canvas and strands the render at a stale size inside a black
frame. Three things hold it down, and all three are needed:

- `touch-action:none` and `overscroll-behavior:none` on `html, body` — not just the canvas.
- `preventDefault` on Safari's `gesturestart`/`gesturechange`/`gestureend`, on `dblclick`, and
  on ctrl+wheel (that one is a trackpad pinch).
- `syncSize()` — idempotent, and called from the frame loop as well as from `resize`,
  `orientationchange` and `visualViewport`. Mobile browsers fire resize with transient
  values mid-gesture and sometimes skip the last one, so events alone cannot be trusted.
  Whatever they do, the next frame puts the canvas right.

Camera zoom is clamped to `ZMIN`..`ZMAX`. ZMIN was 8, close enough for a pinch to bury the
camera inside the wanderer; it is 14 now. A pinch step is also ratio-capped, because two
fingers landing a frame apart could otherwise fling the zoom across its whole range at once.

---

## Tools

Three Node scripts in `tools/`. All were written because I shipped bugs that these would
have caught.

```bash
npm install                            # three r128 + the GLSL validator, dev-only

npm run check:shader                   # compile the water shader for real
npm run check:terrain                  # land area, walkable %, height distribution
npm run check:sim                      # 6000 frames with no GPU, print sim stats
node tools/headless.js index.html 2400 storm   # ...starting in that weather
npm run check:model models/*.glb       # what is in a model, and can the game use it
```

Each also takes an explicit file and frame count, e.g. `node tools/headless.js index.html 2000`.

**glslcheck** pulls the water material out of the HTML, runs it through Three's real
`onBeforeCompile` path, resolves all `#include` chunks the way Three does, and compiles the
result as GLSL ES 1.0. Run this after *any* shader edit.

**model** reports what is actually inside a .glb or .fbx — armature, vertex weights,
clips, blend shapes, material alpha mode — and says plainly whether the game can use it.
Run it on both ends of the pipeline: if an FBX out of Cinema 4D shows joints, a skin
deformer and takes but the GLB out of Blender shows none, the loss happened in Blender,
not in the export. The glTF side is checked against both models in the repo; the FBX side
against synthetic fixtures, so treat its output as a strong hint rather than gospel.

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
- **`world.psys` is not all point sprites.** `Streaks` lives in the same list with a
  different material, so the old resize handler threw on `uScale` every time the window
  resized. It never showed up under test because `resize` never fires headless.
- **Steering is not pathfinding, and a claim is forever.** A tinker claims the nearest
  mature tree and steers straight at it. Behind a boulder cluster or up a slope past the
  `terrainOK` limit, the base stuck-escape clears `wp` and `target` but never the species'
  own `this.tree`, so it re-aimed every frame — one sat marching on the spot for 154 s in a
  headless run — and the tree stayed claimed, so no other tinker could take it. Every
  creature now has `stall` (seconds wanting to move and covering no ground); the tinker
  six of them the base class calls `abandon()` — the tinker's override unclaims and shuns
  the tree — and the creature roams *away* from the failed bearing for eight seconds before
  it is allowed to want anything again. That last part is what matters: scrambling a
  creature out of a pocket without it just sent it straight back down the same path. Only
  if roaming fails too, at fourteen seconds, does it scramble to the nearest spot that is
  actually valid (`findEscape`) with a puff of dust. `world.escapes` counts those; `headless.js`
  prints it with the walking-in-place episodes and the three longest stalls. Longest went
  from 190 s to 28 s; a number climbing back is a real trap to go and find.
- **Legs animate from ground covered, not intent.** `animK` is measured speed; `moveK` is
  still what locomotion uses. A blocked creature stands. It used to pantomime walking.
- **Measure a rig in its idle pose.** Mixamo keeps the bind-pose hips at the origin and the
  clips a hip-height above it, so a model normalised to its bind pose stood in the air the
  moment it idled. `idlePoseBounds` samples the idle clip at three times and unions them.
- **Deep water under you is not the same as being in it.** The swim state keyed off the
  terrain height alone, so a jump off a cliff went slow and flat while still in the air. It
  also needs `player.pos.y` at the surface.
- **The wake started with a hard line.** `if (along < -3.0) continue;` is a straight edge just
  ahead of the swimmer, at full strength even when treading water — it read as a sharp
  rectangle of light under the lantern. The V now grows in over a few units and the wake
  slot carries speed in the length of its heading vector, so a still swimmer leaves nothing.
- **Test the harness too.** More than once the tests were wrong, not the code — a collision
  check that didn't know about `minObR`, a canvas stub missing `createImageData`, a missing
  `window` stub. If a result looks insane, suspect the measurement first.
- **`headless.js` cannot see the model.** It stubs WebGL and never defines `GLTFLoader`, so
  the rig load is skipped and the placeholder stands in. Anything about the model itself has
  to be checked in a real browser.
- **Skinned meshes lie about their size.** See **Models** above; it costs you
  both a wrong scale and wrong frustum culling.

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
  method you need to touch. `loadRig()` is the worked example.
- Give the creature the rest of its verbs: jump, and a run cycle to fix the skating above.
- A seeded RNG for reproducible runs.
- LOD or instancing for distant trees; they dominate the draw call count.
- Give creatures memory — a mossback that remembers where good moss was, a tinker that
  returns to a favoured cairn.
- The LLM layer: creatures already have distinct roles, states and a causal event log.
  A creature's recent history is a natural prompt context for giving it a voice.
