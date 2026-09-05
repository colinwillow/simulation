# Plutopia

An autonomous ecosystem simulation in a single HTML file. A small planet with an island on
it, populated by creatures that forage, build, hunt and reproduce without scripting — the
world starts quiet and, over the course of a few in-game days, grows into a lit settlement.

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
2b. **The planet** (`PLANET`, `planetPos`, `planetQ`) — the projection that wraps the flat
   chart onto a sphere. Nothing above this line knows about it and almost nothing below does
   either; see **The planet** under Systems.
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
On the ground it is idle → walk → run, blended on the fraction of **its own top speed**
(`ctx.top`) that it is actually using, with each cycle played at the rate its own stride was
measured for.

That fraction matters. Keying the transition off the walk clip's authored pace — which is
what it used to do — put the wanderer in a full run at 6 u/s when he tops out at 17, a
third of the way up the stick. `MODEL.runAt`/`runFull` (.42/.74) and `moveAt`/`moveFull`
now place the handoffs: pure walk to 6.7 u/s, run easing in from 7.6, half and half near
10, flat out by 15. Creatures pass their own `this.speed` as the top.

In the water it is tread ↔ swim forward. A jump is three one-shots chained
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

### Movement

`MOVE` holds the whole feel. The wanderer carries a velocity now: `acc` closes it on what
the stick asks for, `drag` bleeds it off when the stick is let go, and the air numbers are
deliberately tiny — once he is off the ground the jump is committed and he keeps whatever
he took off with. Measured: 0 to 17 u/s in about six frames, back to 0 in seven, and a
jump taken at full speed lands at full speed. Before this, position was set directly from
the stick, so movement was instantly on or off and a jump had no arc to it.

The landing clip is planted, so it slid whenever he touched down moving. `landK` now fades
with ground speed and the run carries the landing instead; over 7 u/s it is skipped
outright. A real roll clip would be better than either.

A jump while swimming leaps straight up out of the water — there is nothing to crouch
against, so it skips the initiate and uses a smaller impulse.

**Weight.** `separate()` shares the overlap by footprint area rather than pushing every
creature with the same flat factor, and the player is pushed back by the remainder. A
grovewalker (radius 2.6 against the player's 1.2) now shoves back nearly all of it and
barely moves; a hopper is brushed aside. Measured push-back: grovewalker 8.1, mossback 7.0,
hopper 5.1, with the creatures moving 1.4, 5.5 and 18.6 units respectively.

### The fairy

The lantern is a creature, not a prop bolted to his shoulder. It lives in the scene rather
than on the body, and `updateFairy` pulls it toward a spot beside him with a soft spring
under heavy damping, so it lags when he sets off and drifts past when he stops. On top of
that it wanders on its own noise, darts now and then, and trails sparks from a `PSys` whose
rate rises with its own speed. A leash keeps it within 5.5 units of its anchor, because a
dart during a sprint could otherwise strand it half a field away. It trails 2.7–4 units
behind at rest and 4–7 while running, and a capsule around the body keeps it from passing
through him — it is a creature, not a halo.

### The ship

`models/alien_ship_orange.glb` arrived at 0.8 MB with 31 named bones, vertex weights, one
WebP-textured material, and no clips or blend shapes. The pose morphs authored in Cinema 4D
(legs retracted, hatch open, jets vectored) did not survive because they never could: glTF
morph targets move vertices, Blender writes them from mesh shape keys and animation from
actions, and a pose morph that drives joint hierarchy is neither. That was the better
outcome. Every mechanism is a joint, so the game drives each by any amount instead of
sliding between two authored states.

The rig's frame is +Z forward, +Y up, +X left (`leg_L` sits at +X; the rear flames run to
−Z). Each hinge was found the same way the hatch was: rotate the joint, watch its marker
bone move in the ship's own frame, keep the axis and sign that do the right thing. The
`SHIP` table records the answers: the hatch lifts on `hatch_pivot.rotation.x` negative; a
rear nozzle's `x` tips the flame up and down and its `y` swings it outward (`-y` left,
`+y` right); each side jet's exhaust axis is ±X, so the left one firing pushes the ship
right; the hips fold `leg_L +z`, `leg_R -z`, `leg_back +x` until the pads lie flat under
the rim, with the ankle counter-folded so the pad stays flat. None of it is guessed from
bone names.

`Ship` keeps a small control set — throttle, yaw, pitch, strafe, gear — and a smoothed
shadow of it that the joints actually follow, so nothing ever snaps. **Heading increases
toward +X, which is the ship's own left**, so a left stick has to raise it; it was lowering
it, and the bank and the nozzles — which are read off the yaw rate and the stick — followed
the wrong turn perfectly consistently. That is the trap: every part agreed with every other
part, and all of them were mirrored. `tools/sortie.js pilot` now asserts the whole chain from
one stick input, which is the only way to catch a fault that is self-consistent. The outside nozzle
swings out through a turn, both follow the nose through a climb, the hull banks and noses
with them, the side jets fire on strafe-toward and turn-away, and four `PSys` emitters read
their position and axis off the flame bones every frame so the exhaust follows the
vectoring.

The ship can also fly a **sortie** on its own (`SHIP.sortie`) — waiting until the player has
walked away, lifting straight up clear of the trees, flying one lap of the island at whatever
altitude clears the terrain and the great tree, and settling back on its pad. It was written
when nobody could fly it, and it is **off** now that somebody can: watching your own ship
take itself for a lap while you stand there reads as a bug, not as a world going on without
you. The code stays, because it exercises every joint and `tools/sortie.js` still runs it
(the tool forces the flag on). Its collider leaves with it and returns with it; the hatch
only answers the player while it is landed.

You can fly it. Walk up with the hatch open and a `board` button appears (or press B); the
wanderer vanishes into the hull, the hatch shuts, and the camera swings to a chase view
behind and above. Left stick is thrust and turn, right stick is climb and strafe (it stops
orbiting the camera while you are aboard); on a keyboard W S A D, Space/Shift, Q/E.
`PILOT` holds the feel, and everything in it is an acceleration or a rate — nothing sets a
speed directly — because weight was the brief. Lift-off is a sequence: hold climb and the
jets spool for 2.5 s with the hull trembling and the plume growing, then it unsticks and
climbs slowly; the gear folds itself once it is 9 units up. Thrust is an acceleration
against drag, so it reaches 12 u/s after two seconds, 23 after five, 31 after ten, and
coasts for seconds when you let go. Turning builds a yaw rate that the hull banks from and
that carries on for a beat after the stick centres; the side jets fire and the outside
nozzle swings out with it.

**Which way everything leans**, because three rounds of feedback were spent on it. The hull's
own axes are the answer, not a sign convention: rolling about its forward axis, positive
drops the *right* side, so a left turn wants negative roll and a strafe to the right wants
positive — it was subtracting, and leaned away from its own slide. Pitching about its X,
positive puts the nose *down*, so it noses into a run and lifts as it climbs; it used to do
the opposite of both. And a jet pushes the ship the way it is **not** pointing, so a climb
swings the nozzles down and a descent swings them up. The forward term on the nozzles is .75
and not .3 because the hull is already a quarter-radian nose-down in a run, which swings the
tailpipes up by more than a tenth of vectoring can take back: measured, the exhaust still
pointed up, so it has to over-correct the attitude to end up under the ship. `sortie.js pilot`
asserts all four from the geometry.

**Landing is proximity, not a place.** `deckY(x, z, y)` is the floor the ship can put its
feet on — the terrain, and the floating isle when you are over it and above its deck, so you
can fly *under* the isle and land *on* it. `groundY` deliberately stays the terrain alone;
every creature, mote and blade of grass reads that one and none of them has any business
standing on something eighty units up. The gear drops itself under 14 units and there is a
**flare** inside the last thirteen: the descent is bled off against how much is left, so
coming down anywhere near a surface settles onto the feet at under two units a second
instead of arriving on them. A held-down stick used to reach eleven, and anything past seven
was ruled a crash — which is why "get close to the ground and lower yourself onto it" did not
work. Over water there is still nothing to land on, so it hovers above the swell.

Getting out is one tap of the right stick once it is down: the hatch opens, he steps onto the
deck beside it, and `settleHere` makes wherever it came to rest its pad. Anything he was
doing before he climbed in is cleared on the way out — a swim left over from wading to it
kept its hold for a second after he stepped onto a deck eighty units up, and one second of
it steering the ground height toward the sea below was enough to drop him off the island.
`node tools/sortie.js index.html pilot` flies all of it under node and prints the timings.

### The interface

Three clusters, each folded away by default or on a tap, so what is on screen while you play
is the map, whatever the ship is offering you, and the sticks. The island's own title is the
button for its numbers; one `···` chip holds the debug controls; `notes` holds the log. The
`fold()` helper is four lines and every panel goes through it.

The minimap, top right, is the full map at a tenth the size — the same `drawMapTo` with the
labels dropped and the glyphs scaled by `K`, rather than a second thing to keep in step. It
redraws ten times a second and opens the full map when tapped.

**An id rule that sets `display` beats the UA stylesheet's `[hidden]`**, so a panel styled
`#btns{display:flex}` can never hide however carefully the JS sets the attribute. That cost
a cycle on the map panel and then again on the button column, so there is now a global
`[hidden]{display:none!important}` and it cannot happen to the next one.

### Interacting

There is no interact button on screen. Whatever is within reach writes itself to `ACT` each
frame — an icon, a label and something to run — and the right stick reads it: it lights
**cyan**, which is the one thing in this interface that is not amber. Every other lit control
is warm, so a warm highlight read as "a stick that happens to be under a thumb" rather than
as "there is something here". Cyan is the colour of the ship's own hull lights and of the
waypoint, the ring pings out of it on a beat, and the label goes with it. It lights,
pulses, wears the thing it would act on, and its label changes from LOOK to BOARD. A tap
runs it; a tap with nothing in reach is the jump it always was. `ACT.now` is cleared at the
top of the frame before anything can offer, and `showAct()` touches the DOM only when the
offer actually changes.

Adding the next one — picking a mudlark up — is one more `offerAct` call from whatever is
near, and nothing else changes. The ship offers itself only inside `SHIP.near`, which is 8
units: close enough that the hatch swinging open is the same signal as the stick lighting.

### The map

`map` on the HUD, or `m`. Drawn from the terrain's own vertex colours and heights rather
than re-sampled or hand-drawn, so it is the island you are standing on and cannot drift out
of step with it — change the terrain and the map changes with it, for free. Built once on
first open (23 ms) into an offscreen canvas at `SEG + 1` square; the markers are the only
per-frame work, so it costs nothing while closed and almost nothing while open.

Three things make it read as a map rather than a colour blob: relief shading from the slope
of the height field against a light from the north-west, a pale line wherever a land pixel
touches a water one, and a depth ramp for the sea that keeps a hint of the bed under the
shallows. **The vertex colours are linear** — `col()` converts on the way in and the
composite pass applies the gamma on the way out — so the map has to apply that gamma itself.
Writing them straight into a 2D canvas came out near black, and the massif went pure black
while the grass merely looked murky, which is a good way to lose an hour.

Filling it in as you explore is the reason the terrain and the markers are separate passes:
a third canvas painted with a soft circle at the player each frame, composited over the
terrain image with `destination-in`, is the whole of it. Nothing else has to change.

The big map is looked at through `MAP.view` — a centre in world coordinates and a span in
world units — so pinching and dragging move the view and the marker pass follows for free.
**Zooming does not re-render the terrain, and should not.** The mesh is one vertex every two
units, so sampling `height()` finer would draw ridges the ground does not have; magnifying
the image is exactly the interpolation the mesh already does between its own vertices, so it
is the faithful thing. Measured, the finer render is not even cheap: `height()` costs about
two microseconds, so a 256-square window is 131 ms. Detail instead comes from `MAP.lod`
showing more of the world — every grown lantern tree past 1.9x, blooms past 3x.

A tap on open ground drops a waypoint and a tap back on it takes it away; the tolerance is
26 screen pixels converted into world units, so it stays a thumb's width at any zoom. In the
world it is a beam you can see over a ridge, a bobbing pulse and a ring at its foot, and a
line of motes running from the player to it — the beam says where, the motes say which way.

### The camera

Pitch is fixed at `CAM_POL`. Looking up and down was never worth a whole stick axis, so
the right stick only orbits now and its vertical axis is free for something else. `solveCam`
still drops the boom below `CAM_POL` to clear a hill — that is collision, not the player
aiming, and it is why a pitch reading moves a little while orbiting.

`CAM_POL` is the polar angle from straight up, so **a bigger number is a lower camera**. It
was 1.05: thirty degrees above the horizon and fifteen units over his head, which framed the
ground he stood on and almost nothing ahead of him. It is 1.28 — seventeen degrees above the
horizon, nine units over his head — and the boom did not get shorter to do it, because
`sin(pol) * r` barely moves between the two, so he stays the same size on screen while the
treeline and the sky come into frame. Walking a few hundred units of rolling ground, the
solver never has to intervene and the lens keeps seven to nine units of clearance, so the
lower angle costs nothing in stability. The chase view is lower again at `PILOT.camPol`.

The resting distance is 20, and the chase view **borrows `cam.r` and gives it back**: it was
overwriting the zoom and never restoring it, so stepping out of the ship left you pulled
right back with whatever pinch you had set gone for good. `cam.rWalk` remembers it at the
moment of boarding. The boom only avoids the heightfield, so anything else between
the lens and the wanderer — a tree, a boulder, the canopy — used to just block him. Now a
screen-door hole is punched through any surface that is both closer to the camera than he
is and inside a circle around him on screen. It lives in the shared `MeshStandardMaterial`
shader (a prototype `onBeforeCompile`), because the trees are merged into a few big meshes
on shared materials and there is no object to fade; `holeUni` is aimed at his chest every
frame. The terrain opts out with `userData.noHole` — the ground in front of his feet is
always nearer than his chest, and a hole in the grass every frame is not what anyone wants.
Materials with their own `onBeforeCompile` (water, grass) are untouched.

**Bodies opt out too**, and this is not optional: his own skull is nearer the lens than his
chest, so the hole was punching through his head and showing his eyeballs from behind — most
visible once the camera pulled in close to clear some geometry, which is exactly when it is
least wanted. Models opt out by material in `prepModel`, one line covering the wanderer, the
mudlarks and the ship. Creatures cannot, because their materials are shared with the scenery
— a mossback and a moss tuft are both `M.moss` — so the `Creature` constructor swaps every
material for a cached no-hole copy via `solid()`, once, before `flatten` bakes them in. That
covers every species including ones not written yet. The copies are real clones, so
`updateSky` mirrors `emissiveIntensity` onto them or the glowing creatures stop pulsing at
night.

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

### The planet

The world is a sphere of radius **240**, which is `W` — the same number the flat island was
authored against. Circumference 1508, about four minutes' walk the whole way round, and a
horizon roughly seventy units out from the camera. You can see the ground fall away at the
edges of the frame from where you stand, and zooming out far enough puts the whole globe in
view with the island as a cap on top of it.

**Everything above the wrap is still flat.** `height(x,z)`, the obstacle field, every
steering behaviour, the buoyancy, the camera solver, the map, and every distance that has
ever been tuned all work in a flat chart in (x, z), exactly as they did. This is not a
convenience — it is the whole design. Spherical trigonometry in the AI would have meant
retuning every constant in the file, and there is no gameplay question the chart cannot
answer.

The wrap is **azimuthal equidistant**, chart origin at the north pole: a chart point at
distance `r` from the origin lands at polar angle `r / R`. Distance from the origin is
therefore exact everywhere — walk 60 units and you have gone 60 units of arc. What it costs
is spacing *around* the pole, which shrinks by `sin(θ)/θ`:

| chart r | arc | spacing |
|---|---|---|
| 0 | 0° | ×1.00 |
| 120 | 29° | ×0.96 |
| 240 (far shore) | 57° | ×0.84 |
| 480 | 115° | ×0.45 |
| 700 | 167° | ×0.08 |

So the island — everything out to about r 260 — is squeezed at worst 16% east–west, which
you will never see: objects keep their own size, only their spacing changes. Past r 480 it
gets severe, and that is six hundred units of empty ocean nobody has a reason to cross.
`PLANET.rim` stops you a little short of the far pole itself, where the projection is
singular; `height()` levels the last stretch before it to one depth so every spoke of the
mesh agrees about the single vertex they all meet at.

`npm run check:terrain` prints that table, and round-trips 600 points through
`planetPos` → `planetChart` — worst error 3e-13 units.

**How the wrap is actually applied.** Three ways, and only three:

1. **The scene graph.** `scene.add` is wrapped: anything dropped straight into the scene gets
   an overridden `updateMatrix` that reads its chart `position`/`rotation` and writes the
   world matrix. So a tree still does `g.position.copy(pos); alignTo(g, x, z, .35);
   g.rotateY(...)` and lands upright on a sphere, and `alignTo` did not have to change at
   all — it produces a chart-space tilt, and the planet frame is composed on top of it.
   Reparent an object under something else (a log picked up onto a bone) and it falls back to
   the stock compose, because then its transform is somebody else's local space.
   Opt out with `userData.flat`.
2. **Geometry built on the sphere.** Terrain, sea, foam: a polar grid (`polarGeo`) of rings
   and spokes, sampled from `height()` at the chart point and placed through `planetPos`.
   Rings are packed to about two units under the island and open out to six across the far
   ocean, so the whole globe costs *fewer* vertices than the old flat square did.
   `warpGeo` does the same to one merged mesh — the scattered rocks and driftwood, which span
   the world and so have no single group transform that could place them.
3. **`PLANET_GLSL`.** The same map in the vertex shader, for the things that place their own
   points: the Gerstner sea, the shoreline foam, `PSys`, `Streaks`, the motes. They all
   integrate flat and wrap on the way out. `planetRot(chart, v)` rotates a chart direction
   into world space, which is what `Streaks` needs for the velocity it stretches along.

**The camera** is solved entirely in chart terms — azimuth, pitch, the boom march against the
height field — but hung in the frame standing on the *target*, not laid back down on the
chart. A forty-unit boom laid on the chart follows the curve and sinks four units into the
hill behind him; the four-hundred-unit one the zoom allows would swing a hundred degrees
round the planet and look back at the far side.

**Lights and sky** are stated in the local frame at the camera target and rotated in, so the
sun keeps the elevation it always had over wherever you are standing. A sun fixed to one
point of a planet this small would put you in permanent dusk halfway through a walk. The sky
dome and the stars hang off `skyRig`, which follows the camera, carries the local frame, and
grows once you climb high enough that the far limb of the world reaches past it. Haze thins
with altitude for the same reason — the old density erased the planet from the air.

**The map** is still drawn in chart space, which is what you want for navigation: bearings
are true and radial distances are exact. It reads the `chart` and `hgt` attributes kept
alongside each terrain vertex rather than the vertex positions, which are now on the sphere.
Because the spokes fan apart on the way out, each vertex is splatted over as many raster
cells as its own local spacing needs — a fixed splat leaves the sister isle stippled with
sea.

### Moving on foot

Three things decide how the wanderer moves, and all three were reported by feel before they
had a number: "he really wants to run", "a steep hill should slow you down", "you should be
able to walk over rocks". `npm run check:gait` measures each one.

**The ramp.** Acceleration falls away as he approaches his own top speed —
`MOVE.acc * (1 - MOVE.accFall * smooth(0, 1, speed / MOVE.max))`. The first units come
quickly, because a tap has to move him, and the last take their time. Measured over two
seeds, on ground the probe picked as flat: a first step at 0.17-0.23s, walking pace at
0.33-0.50, a jog at 0.63-0.86, a run at 1.29-1.58. The spread is the ground -- "flat" there
means under a 3% grade, and a hill is priced in below. At the old flat 62 he did all of it
in 0.27 seconds, which is why nothing smaller than a run was possible. A half-held stick still settles on its own speed inside half a second, so
micro-movement is a matter of how far you push rather than how briefly.

Nothing else had to change for the animation: `stepRig` blends on `speed / MOVE.max`, so a
longer ramp means he walks for longer before the run mixes in, for free.

**Turning is not accelerating**, and the two must not share a rate. They did, and the ramp
above broke it: once acceleration had bled away near top speed, so had the ability to change
direction. A right-angle turn at full pelt needs twenty-four units of velocity change, and at
1.7 a second he arced round for fourteen of them — which reads as skating, and is exactly
what it was. The correction is split into the part along his current heading, which is a
change of speed and belongs to the ramp, and the part across it, which is a change of
direction and gets `MOVE.turn`. Letting go of the stick is all `along`, so drag is untouched.

Measured, before and after, by running the same probe against the previous commit
(`git show HEAD:index.html > /tmp/old.html && node tools/gait.js /tmp/old.html`):

| turn at full speed | before | after |
|---|---|---|
| 90° | never got there in 6s | 0.53s, speed held at 17 |
| 135° | 4.36s | 0.83s |
| 180° | 2.57s | 2.34s |

The reversal barely moves, and should not: turning right round has to pass through zero, and
the ramp governs getting back up to speed afterwards.

**Hills.** The gradient is read along the direction he is *walking*, one metre ahead — not
the slope of the ground under him, which would cost him just as much running along a contour
as straight up the face. Speed scales by `1 - grade * MOVE.hill`, floored at `MOVE.hillMin`,
with a small bonus downhill. Measured: 75-81% of flat speed on a 20° face, 62% on 33°, 35%
(the floor) on 48°, and a flat 17.7 — the downhill cap — going back down any of them. The
probe reports the grade the *game* reads, a forward difference one metre along the way he is
walking; its own centre-difference over three units is a different number, and reporting
that one made the results look inconsistent when they were not.

**Rocks.** `OB_PLAYER.climb` is the whole story. Anything whose top is within it of his feet
is something he goes *over* rather than *around*: `resolvePlayer` stops treating it as a
wall, and `standOn` raises his ground to its top so he ends up standing there. At the old
0.5 that only meant "his feet are already clear of it", so a knee-high boulder was a wall.
At 1.5 he walks up onto rocks, stumps, mounds and driftwood, and boulders taller than that
still stop him. Measured by charging rocks of a known height: 0.8 tall — walks up, rises
0.76; 1.2 — rises 1.14; 2.4 — stopped at 2.8 from centre, which is its radius plus his.
Trunks, cairns and the great tree register `Infinity` and were never in the conversation.

Only the player reads `climb`; creatures keep their own steering.

### Swapping a model onto a species

One table entry:

```js
const CREATURE_RIGS = {
  Grazer:   { url: 'models/purple_horny.glb',  height: 2.4,
              idle: 'idle', walk: 'walk', yaw: 0 },
  Burrower: { url: 'models/creature_green.glb', height: 1.6,
              idle: 'idle', walk: 'walk_fwd',
              blinkL: 'eye_L_close', blinkR: 'eye_R_close', yaw: 0 },
};
```

`yaw` is worth measuring rather than guessing: walk the skeleton's bind pose and see which way
the head sits. `mixamorig_Head` on the purple creature is at z +17.6 against a joint range of
0 to +27.7, so it faces +Z, which is already forward and needs no turn.

The class keeps its whole brain; this only changes what you see. Move a model to another
species by moving the key. Clips are looked up by *role* rather than by exact name, so a file
that lacks one simply does not get it — no run means the walk carries on at speed.

**Run `npm run check:model models/whatever.glb` first.** A GLB needs three things to stand in
for a body: a skin, `JOINTS_0`/`WEIGHTS_0` on the mesh, and at least one clip that is not the
exporter's default. C4D writes `CINEMA_4D_Main` and Mixamo writes `mixamo.com` for "here is
this object's transform" — three channels, one keyframe — and that is not a cycle however
many channels it has.

`attachRig` refuses a model that fails those checks: it removes the instance, warns once per
file, and never calls back, so the caller keeps the primitive body it already built. A
species that still walks on placeholder legs is a better failure than one that stops walking
and slides along as a rigid sculpt, which is what happened before the guard existed.

### The ship

Left stick is what the hull does — thrust and slide. Right stick is where it points and how
high it sits. Steering on the left and strafing on the right reads as inverted to anyone who
has flown anything.

Top speed is `PILOT.thrust / PILOT.drag`, and for a long time it was not: `update()` rebuilt
`this.vel` every frame from a position delta and clamped it to `SHIP.speed * 1.4`. That clamp
exists so a hitched frame cannot lurch the exhaust, and it is right for the scripted sortie,
which flies by setting the hull's position along a curve and has no integrated velocity of
its own. Applying it to the pilot, whose velocity *is* the thing being integrated, quietly
held the ship at 42 whatever the engine was set to — raising the thrust could never have
moved it. The rebuild is now skipped in the piloted state.

### The ship's flames and lamps

A jet is a solid thing with a shape, not a cloud of dots. `FLAME_GEO` is a unit cone growing
along -Z from its origin, so a mesh parented straight to a nozzle bone is sized with
`scale.set(radius, radius, length)` and follows the vectoring for free — swing a nozzle out
for a turn and its flame swings with it, which is most of why the ship reads as steering
rather than sliding. `flameMat()` shades it additively, white-hot at the throat falling to
red down its length, with shock diamonds standing in the plume the way they do in a real
nozzle. The particles that used to *be* the exhaust are the smoke it leaves behind now:
bigger, dimmer, slower.

The same cone with its diamonds turned off (`uDia: 0`) is a headlight. There is no extra
light in the scene doing that — a spot per headlight would recompile every material on the
island for two pools of light you only see at night. They come up at dusk and only fully
when someone is flying it; a parked ship with its beams on all night reads as abandoned.

Five flames: the two mains, the two attitude jets on the flanks, and a belly jet for coming
off a pad. The belly one deliberately does **not** read `sm.pitch` — that carries the forward
throttle's share of the vectoring, so reading it lit the underside all the way round a lap.
It answers to the spool against the ground, a commanded climb, and a sortie's own lift and
let-down.

The six light bones get an actual lamp each: a small emissive bead the bloom pass can catch,
so the parts meant to glow are lit objects rather than a sprite floating near them. They
never move relative to the hull, so all six bake into one mesh in ship space — one draw call,
the same as the halo they sit inside.

All of it is built in `buildFx()` rather than in the model's load callback, because the
headless harness fakes a skeleton and has no glTF loader: putting it there is what lets
`node tools/sortie.js index.html pilot` assert on the flames and the headlights at all.
Its stand-in skeleton carries the six lamp bones at their measured positions for the same
reason.

### Obstacle field
Solid things register a footprint circle in a coarse spatial hash (`obAdd`/`obRemove`).
Creatures use it three ways: rejecting waypoints, steering around things ahead
(with committed side-choice so they don't oscillate), and hard push-out if they end up inside.

The player queries it too, through `resolvePlayer`, which is the same hard push-out — it
corrects only the radial overlap, so motion along the surface survives and you slide round
a trunk rather than sticking to it, and the inward part of the velocity is cancelled so you
stop pushing into what just stopped you. `OB_PLAYER.minOb` (.9) is the size floor: below it
a footprint is ignored. That leaves blooms (.75) walk-through while stumps (.95), boulders
(1.1), trees (1.25 / 2.1), mounds (1.4), the campfire (2.1), cairns (3.5) and the great tree
(6.5) all stop you. Grass and moss register no footprint at all, so they were never in
question. `stepOver`/`stepHeight` let a jump clear the low things and never a trunk.

Measured by charging each one: big tree stops at 3.3 from centre against a predicted 3.3,
sapling 2.45 against 2.5, campfire 3.3, great tree 7.7, and a bloom is reached at 0.1.

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
Fresnel toward the live sky colour.

`waveY(x, z)` is the same four trains ported to JS and read from the live uniforms, so the
CPU knows where the surface is: the wanderer rides it (chest-deep treading, flatter and
shallower swimming, tilted to `waveNormal`), aquatic creatures sit on it, and the ferry rides
the real swell instead of a faked sine. Before this everything at sea sat at flat `SEA` while
the waves rolled over and under it. Keep the two in step: a change to `waveDisp()` in the
shader is a change here. Kelvin-style wake trails anything cutting the surface
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

### Memory, which is a harder limit than frame rate

Safari kills a tab that wants too much, and it does not say why: the page loads, drags, and
turns into "A problem repeatedly occurred". Frame rate is a budget you overspend; memory is
a wall you hit. Two things put the island through it, and both were invisible from the
draw-call counter that had been the focus until then.

**Textures.** The exported models carried 4096-square maps. One of those is 67 MB of RGBA on
the GPU and 89 with its mipmaps, and there were several: 341 MB resident in the scene, more
than a phone gives a whole tab, before a triangle was drawn. `shrinkTexture` caps them at
load — 1024 on mobile, 2048 elsewhere — by drawing each one once into a canvas. The wanderer
is a couple of hundred pixels tall on the screen he is played on, so nothing is visibly lost.
Scene texture memory went 341 MB to 21 MB. **Check the texture size before blaming anything
else**; a model's file size hides this completely, because a 4096 map of flat colour is a
tiny WebP and a ruinous texture.

**Unrolled geometry.** `mergeBin` used to call `toNonIndexed()` on every part before
concatenating. A blob is 221 vertices indexed and 960 unrolled, so merging the world for
draw calls quietly turned 1.2M vertices into 4.3M — 102 MB of buffers, mirrored again on the
GPU. It merges indexed now, which keeps every bit of the draw-call win: 39 MB, and the same
1300 calls.

Together: 443 MB of texture and geometry down to 61 MB, JS heap 137 MB to 71 MB, and the
load a third quicker. The models are still 17 MB to download, because they carry an
animation library nothing uses — that is a re-export away, and is bandwidth rather than
memory, since the keyframe data is only 4.5 MB decoded.

---

## Tools

The Node scripts in `tools/`. All were written because I shipped bugs that these would
have caught.

```bash
npm install                            # three r128 + the GLSL validator, dev-only

npm run check:shader                   # compile the water shader for real
npm run check:terrain                  # land area, walkable %, height distribution
npm run check:sim                      # 6000 frames with no GPU, print sim stats
node tools/headless.js index.html 2400 storm   # ...starting in that weather
npm run check:model models/*.glb       # what is in a model, and can the game use it
npm run check:ship                     # fly the ship's sortie with no GPU, report every joint
node tools/sortie.js index.html pilot  # ...or fly it by hand: board, lift, turn, strafe, land, get out
npm run check:swirl                    # does the lamp's swirl of motes go where the lamp goes
npm run check:gait                     # the acceleration ramp, what a hill costs, what he can climb onto
```

Each also takes an explicit file and frame count, e.g. `node tools/headless.js index.html 2000`.

**glslcheck** pulls the water material out of the HTML, runs it through Three's real
`onBeforeCompile` path, resolves all `#include` chunks the way Three does, and compiles the
result as GLSL ES 1.0. Run this after *any* shader edit.

**model** reports what is actually inside a .glb or .fbx — armature, vertex weights,
clips, blend shapes, material alpha mode, **texture dimensions and what they cost on the
GPU** — and says plainly whether the game can use it. That last one is the number no
exporter shows you: a file gets smaller because the codec got better at it, while the GPU
still unpacks every map to width × height × 4 bytes plus a third again for mipmaps. Three
4096 maps is 340 MB, and a phone has a couple of hundred for everything. The game rescales
oversized maps at load (`TEX_CAP`, 1024 on mobile), so this is a load-time and download cost
rather than a crash — but it is invisible without this readout.
Run it on both ends of the pipeline: if an FBX out of Cinema 4D shows joints, a skin
deformer and takes but the GLB out of Blender shows none, the loss happened in Blender,
not in the export. The glTF side is checked against both models in the repo; the FBX side
against synthetic fixtures, so treat its output as a strong hint rather than gospel.

**terrain** samples the height field on a grid and reports land area, walkable fraction and
height distribution. Use it to check terrain changes against intent instead of eyeballing.

**headless** stubs the DOM and WebGL, runs the simulation for N frames, and reports
population counts, collision penetration, stuck timers and progression. Use it to check that
ecology changes don't stall the world.

**sortie** builds on headless: the loader is not available under node, so it hands the ship
a stand-in skeleton of named bones at the measured positions and lets `Ship.update` fly a
whole sortie against it. It reports, per phase, the ranges of every control and joint, the
exhaust rates, whether the collider was down, terrain and great-tree clearance, and which
side jet fired for which turn. A change to the flight model or the rig's hinge table should
run this before it is believed.

`pilot` mode flies it by hand instead, and this is where the handedness lives. Every "which
way should this go" question is asked of the geometry rather than of a sign convention: the
hull's own axes are taken through its quaternion, so *nose down* is the local +Z ending up
below the horizon and *leaning right* is the local +X (the left wing) ending up above it.
The exhaust is asked the same way — `em.d` is the direction the flame actually travels, so
"the jets push it up" is `d.y < 0` and nothing has to be assumed about which way a bone's
rotation.x points. Three separate rounds of "it leans the wrong way" came from reasoning
about signs on paper; none would have survived being asked this way.

**swirl** answers one question — does the lamp's swirl of motes go where the lamp goes — and
exists because it cannot be answered in the browser. Software GL runs at a frame a second
and a swirl takes twenty seconds of world time to gather. It seeds two dozen motes on the
lamp by hand rather than waiting for one to form, because which motes the lamp *wins* depends
on where he happens to be standing (it bids 1.85 at 46 units against the great tree's 3.7 at
170), and that is a different question from whether the ones it holds follow it.

---

## Gotchas (each of these cost a debugging cycle)

- **Three r128 chunk order.** `defaultnormal_vertex` comes *before* `begin_vertex`, so
  `transformed` doesn't exist yet when you're computing normals. Use `position`.
- **`roughness` is a uniform.** You cannot assign to it in a fragment shader. Set a global
  in `map_fragment` and override `roughnessFactor` in `roughnessmap_fragment`.
- **Winding order.** A radial mesh wound the wrong way faces down and vanishes under
  backface culling — you'll see straight through the object to whatever's inside it.
  `polarGeo` winds its centre fan the opposite way round from its ring quads, which is
  correct and looks like a bug.
- **A group at the chart origin is not at the world origin.** Once `scene.add` wraps chart
  transforms, a group left at (0,0,0) holding children in absolute world coordinates gets
  moved to the north pole and takes them with it. Either give the group its own position and
  build the children local to it (which `Litter` now does, and which incidentally fixed it
  sinking toward the world origin as it faded), or mark it `userData.flat` and `warpGeo` its
  geometry, which is what the world-spanning scatter does.
- **Reading a world matrix back out.** `getWorldPosition` and `setFromMatrixPosition` now
  return real world coordinates, which are not chart coordinates. Three places do this and
  all three go back through `planetChart`: the leviathan's blowhole, and the ship's exhaust
  emitters (whose direction also needs the local frame taken back off it).
- **Long offsets don't survive the wrap.** Anything that adds hundreds of units to a chart
  position and expects it to still be nearby is wrong on a sphere: it goes round the planet.
  This caught the camera boom (fixed by hanging it in the local frame) and the meteors, which
  were flung 620 units sideways and came out under the ground.
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
| Planet radius | `PLANET.R` — bigger flattens the horizon and cuts the east–west squeeze |
| Terrain / sea mesh density | `TSPOKE`/`TRING`, `WSPOKE`/`WRING`, and `ringR` for the packing |
| Day length | `DAY` (seconds per full cycle) |
| Population caps | `MAX` |
| Tree growth rate | `GROW_T` |
| Beacon / tower thresholds | `BEACON_LVL`, `TOWER_MAX` |
| Mountain range placement | `RANGE` (line segment + width + height) |
| Wave size and grouping | `waterUni.uW` / `uG` |
| How fast he gets going | `MOVE.acc` and `MOVE.accFall` (the ramp), `MOVE.max` (the top) |
| What a hill costs | `MOVE.hill`, `MOVE.hillMin` |
| How sharply he can change direction | `MOVE.turn` (`airTurn`, `swimTurn`) |
| Ship top speed | `PILOT.thrust / PILOT.drag` — and see the clamp note under The ship |
| What he can climb onto | `OB_PLAYER.climb` |
| Waypoint trail spacing | `WAY.gap` (`WAY.N` is only the cap) |
| Flame sizes | `SHIP.jet` / `SHIP.side` / `SHIP.lift` / `SHIP.head` / `SHIP.bulb` |
| Quality tiers | `Q` |
| Texture ceiling at load | `TEX_CAP` (2048; a ceiling, not a target) |

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
- The far pole is a coordinate singularity in open ocean: the sea's wave trains are faded out
  before it and `PLANET.rim` stops you short, but nothing *wraps* there yet. Walking over the
  pole and coming up the other side needs the chart to fold, which is a real change and not
  worth making until there is a reason to go.
- The map is drawn in chart space, so it slightly overstates east–west distances out at the
  sister isle — 16% at the worst, where the sphere squeezes hardest. Bearings and radial
  distances are exact.
- Wakes are 120 units long, which was nothing on a flat world and is 8% of this planet's
  circumference. Isolated by hiding the sea, then the foam: the chevron across the far ocean
  in a zoomed-out shot is the ferry's Kelvin V, drawn exactly as it always was. It reads fine
  from the ground and only looks wrong from a height you cannot yet reach, so it is left
  alone rather than retuned blind.

---

## Where this is going

The sphere is the first piece of a larger shape, written down here so the next change knows
what it is building toward. Nothing below this paragraph exists yet.

### Decided: split the file into modules, as step one of multi-world

Not before, and not later. The trigger is the second planet — do it as the first commit of
that work, while there is still only one world in the file.

**Why then.** `height()`, `CENTERS`, `RANGE`, `MESA`, `LAGOON`, `STACKS` — the shape of this
particular island — currently share a scope with the renderer. A second planet turns that
into data, so the content/engine seam appears on its own and the cut is natural rather than
arbitrary. Splitting first and adding worlds second means one refactor instead of two.

**Why not now.** A 276-symbol export refactor produces no new behaviour and carries real
risk: a `const` referenced above its declaration silently takes the rest of the file with it,
which has happened twice, and circular imports make that class of failure worse before it
gets better. Nothing about the current file is blocking the work in front of it.

**What it is, concretely.** Native ES modules — `import`/`export` and a
`<script type="module">` in a thin `index.html`. **Still no build step**: browsers have
shipped this since 2018 and GitHub Pages serves it unchanged, so the push-to-preview loop
that this project runs on does not change at all. Not a bundler (one runtime dependency, and
it is already a CDN tag). Not JSX (the entire UI is ninety lines of CSS and a handful of
divs; there is no component tree to express).

Rough shape, following the section comments the file already has:

    src/core/     noise, the planet projection, world constants
    src/world/    terrain, water, grass, sky, weather
    src/life/     the Creature base and the species
    src/player/   movement, rig, camera, input
    src/ship/
    src/ui/       map, HUD, sticks
    index.html    CSS, markup, one <script type="module" src="src/main.js">

**What it actually buys.** Not performance — the runtime is identical, and cold start is a
hair slower for a few more requests. Two things: the file becomes readable by a person, and
the seven check tools stop being held together with string matching. Every one of them
currently slices the `<script>` block out of the HTML with a regex and `eval`s it; two slice
*sub-ranges* by searching for literal source text. That has broken twice — once when the
planet projection was inserted into a range `terrain.js` was slicing, once when the game was
renamed and all six lost the file at once. With modules they would just import what they
test.

**What protects the refactor.** The seven check scripts: terrain field, water shader, 6000
sim frames, the ship's sortie and piloted run, the gait probe, the mote swirl, and the model
parser. Run all of them either side of the split; a regression has somewhere to show up.

**Many small worlds.** Plutopia becomes one planet among several, each with its own
properties — a water world, a jungle world, different gravity, different species. The ship
already flies; it becomes the way between them. Most of what that needs is in place: the
projection is per-planet (`PLANET.R` is one number), `height()` is a pure function of a chart
point, and the whole simulation is written against a flat chart, so a second world is a
second chart and a second terrain field rather than a second engine. What it needs that does
not exist: more than one planet in the scene at once, an interplanetary flight mode where the
chart stops being the frame of reference, and per-world palettes, weather and species tables.

**Capture.** A plasma net cannon, and a hand for the things small enough to just pick up —
different creatures wanting different means, some needing a bigger container than others.
The `ACT` hook the ship boarding uses is the seam for this: the right stick already glows
when something is in reach and the interaction is a single tap. What is captured hangs below
the ship from a mechanical arm and tray, and flies with you.

**The lab.** Bring a creature home and the lab — which you have to build — processes its
genetic makeup, after which you can transform into that animal on cue.

**One base mesh.** This is the part that makes the rest cheap. Every character and animal is
the same base mesh wrapped differently, so transforming is blend shapes morphing between
them in real time rather than a model swap. Neither of the two characters made so far is
wrapped around the base mesh yet. When they are, the rig plumbing that already exists
(`attachRig`, the measured-state blend tree, the clip library) carries straight over, and the
morph targets ride alongside it.

**Building and resources.** Buildings that start ecosystems, and resources to collect to
build them. The cairn is the existing worked example of a thing you build that changes the
world's state; the ecology already reacts to `world.beacons` and `world.cairns`.

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
