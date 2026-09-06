# Plutopia — working rules

Single-file Three.js r128 game in `index.html`. No build step. Bump `BUILD` in the HUD
on every push (Pages caches `index.html`). Push straight to `main` — the owner previews
live and does not want branches.

## Verification budget

Time spent verifying is time and credits taken from the owner. Default to the cheap
checks and ship. Specifically:

**Run these — they are sub-second and have each caught real, shipped-breaking bugs:**
- `node --check index.html`-equivalent syntax check
- `npm run check:shader` (raw GLSL compile)
- `npm run check:sim` (headless sim: penetration, stuck timers, weather)
- `npm run check:gait` (rig/camera/placement probes)

Run them **once**, at the end, in a single foreground command. Not per-edit.

**Do NOT run these unless the owner asks for a picture, or correctness genuinely
cannot be established any other way:**
- `tools/shot.js` screenshots. Chromium under swiftshader takes ~10 minutes per
  render here. Eight of them is an afternoon of the owner's budget spent confirming
  things already known from reading the code. If one is truly needed: **one**, never
  a sweep.

**Never do this:**
- Background waiter loops (`until ! pgrep ...; do sleep N; done`). They time out, get
  re-wrapped, and pile up as orphaned pollers. If something must run long, run it in
  the foreground with a real timeout and accept the result.
- Re-running a failed probe hoping it passes. Probe flakiness is a bug in the probe.

**Reporting:** say what was checked and what was not. "Shipped without a render" is a
fine thing to say. Guessing that it looks right is not.

## Landmines (each cost a cycle)

- **TDZ**: a `const`/`let` read above its declaration kills the rest of the file, and
  `node --check` cannot see it. This has bitten six times. When adding a config object
  or a scaling constant inside a constructor, declare it at the top.
- **Chart space vs sphere space**: bone world positions are on the sphere; colliders,
  heights and creatures are on the flat chart. Convert with `muzzleChart()` /
  `jointChart()`.
- **`onBeforeCompile`**: an instance hook completely shadows the prototype's see-through
  hole. Chain via `holePatch(sh)`, and skip when `mat.userData.noHole`.
- **Geometry units**: `G.cyl` / `G.cylT` / `G.cone` / `G.sph` are unit-*radius*
  (scale = radius). `G.box` is unit-*size*. Mixing these built the vault at 2x.
- **Handedness**: forward is `(sin h, cos h)`; his right is `forward x up`.
  `up x forward` is his left — that mirrored every strafe.
