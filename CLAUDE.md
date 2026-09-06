# Plutopia — working rules

Single-file Three.js r128 game in `index.html`. No build step. Bump `BUILD` in the HUD
on every push (Pages caches `index.html`). Push straight to `main` — the owner previews
live and does not want branches.

## Verification budget

**The owner tests the game. You do not.** He asks for a change, you make it, bump
`BUILD`, push. He previews it live and is the judge. Fast turnaround beats a proven
change — a wrong guess costs him one look; a verification pass costs him an hour.

The only thing that runs by default is the ~1s syntax check, because a file that
won't parse is a blank page and wastes the round trip he was going to spend testing.
That's it.

**Do not run, unless he explicitly asks:**
- `tools/shot.js` screenshots — ~10 minutes each under swiftshader.
- `npm run check:shader` / `check:sim` / `check:gait` — only when he asks, or when
  chasing a bug he has already reported and reading the code isn't settling it.

**Never:**
- Background waiter loops (`until ! pgrep ...; do sleep N; done`). They time out, get
  re-wrapped, and pile up as orphaned pollers.
- Re-running a probe hoping it passes.

**Reporting:** one or two lines — what changed, what to look at. Say "shipped
unverified" plainly; don't claim it looks right.

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
