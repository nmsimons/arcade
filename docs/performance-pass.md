# Runtime performance pass — September 22, 2026

This pass targets Urban Fire, Hard Vacuum and their shared model renderer.
The earlier [radiation-cache investigation](performance.md) remains a separate
historical measurement. No world density, art detail, collision iterations,
enemy behavior or audio thresholds were reduced for these optimizations.

## Results

Measured on a Snapdragon X1E80100 (12 logical CPUs, 31.6 GiB RAM), Windows arm64,
Chromium 153.0.8010.12, headless 1280×800 at DPR 1, no CPU throttling. These are
local measurements with visible scheduling variance, not portable timing limits.
Hard Vacuum uses two fresh 120-tick episodes per case (240 timing samples), plus
a separate 120-frame allocation pass. The moving-Haven allocation pass also
includes its 180 pre-transit ticks; allocation estimates include fixture setup
and diagnostic scans, not just steady simulation.

Urban Fire values below are the median across three episodes. Frame work and
paused work are episode p95 callback times; transitions are end-to-end medians.
Raw data: [before](performance/2026-09-22-urban-before.json),
[after](performance/2026-09-22-urban-after.json).

| Urban Fire measurement | Before | After |
|---|---:|---:|
| Playing callback work p95 | 38.3 ms | 19.6 ms |
| Paused callback work p95 | 15.4 ms | 0.3 ms |
| Observed callback interval p95 | 50.0 ms | 33.3 ms |
| City builds per deploy/pause/resume session | 4 | 1 |
| Deploy latency | 583 ms | 255 ms |
| Pause latency | 245 ms | 66 ms |
| Resume latency | 393 ms | 193 ms |

That is about 49% less measured playing callback work and 98% less paused work.
The uncached city/navigation rebuild was outside the animation callback, so the
transition measurements cover stalls that the frame-work statistic misses.

Hard Vacuum CPU work is simulation plus Canvas submission. Allocations are sampled
MiB per measured frame, not retained heap size. Raw data:
[before](performance/2026-09-22-hv-before.json),
[after](performance/2026-09-22-hv-after.json).

| Hard Vacuum scene | CPU p95 before → after | Allocations before → after | Frame interval p95 before → after |
|---|---:|---:|---:|
| Late field, 1× | 36.9 → 21.2 ms | 7.97 → 1.72 MiB | 83.4 → 83.3 ms |
| Late field, 3× | 71.3 → 48.4 ms | 26.95 → 4.72 MiB | 133.3 → 116.7 ms |
| Red chain, 1× | 46.5 → 18.3 ms | 8.99 → 1.96 MiB | 100.0 → 50.1 ms |
| Red chain, 3× | 81.1 → 33.7 ms | 29.26 → 5.93 MiB | 150.1 → 83.3 ms |
| Bot towing, 1× | 40.7 → 13.6 ms | 8.74 → 1.78 MiB | 100.1 → 50.1 ms |
| Bot towing, 3× | 77.3 → 37.5 ms | 31.56 → 6.06 MiB | 150.1 → 100.0 ms |
| Moving Haven, 1× | 43.2 → 27.4 ms | 17.14 → 2.98 MiB | 100.0 → 83.4 ms |
| Moving Haven, 3× | 83.5 → 56.0 ms | 62.21 → 10.86 MiB | 166.7 → 133.3 ms |
| Opening doors, 1× | 68.4 → 30.1 ms | 9.15 → 2.70 MiB | 133.3 → 83.5 ms |
| Opening doors, 3× | 67.1 → 51.8 ms | 30.91 → 6.73 MiB | 116.7 → 116.8 ms |
| Radiation flight, 1× | 18.4 → 10.4 ms | 4.32 → 1.00 MiB | 50.1 → 50.1 ms |
| Radiation flight, 3× | 32.8 → 17.7 ms | 7.77 → 1.63 MiB | 100.0 → 83.4 ms |

CPU p95 fell 23–67% across these cases (median reduction 45%); sampled allocation
volume fell 71–83%. Opening-door radiation outline work alone fell from 32.1 to
7.1 ms p95 at authored density. Post-GC retained heap remains around 4–5 MB;
the allocation improvement primarily removes temporary objects and GC pressure.

These runs do not establish consistent 60 Hz presentation. Several authored
scenes and every 3× stress scene still exceed the 16.7 ms CPU budget at p95;
headless frame intervals also include rasterization and browser scheduling and
remain substantially higher. The existing simultaneous-door baseline has a
slower 1× p95 than 3×, illustrating run-to-run variance. Longer gameplay sessions
and other hardware need their own measurements before claiming a frame-rate target.

## Changes

- Urban Fire retains its static city canvas and navigation graph across score,
  wave, deployment and pause changes. The animation effect reads current React
  state without restarting. Paused/menu frames redraw on state changes and resize;
  controller polling continues so resuming stays responsive.
- Urban Fire's small FPS counter averages actual frame intervals over half a
  second, excluding paused time and avoiding per-frame React updates.
- Civilian-vehicle contacts reject provably distant pairs before allocating SAT
  axes. Close contacts retain the same solver, order and fixed substeps. Bounds
  include rotated corners and long obstacles, and use current body positions.
- The shared 3D renderer calculates rotation trigonometry once per assembly/part,
  projects each vertex once, and avoids edge graphs unused by solid materials.
  Face normals no longer allocate an accumulator at every vertex. Face ordering,
  shading, markings and vector silhouettes are preserved.
- Hard Vacuum caches immutable Canvas paths and groups static power wiring once.
  Conservative camera bounds skip distant models, foundations and cable segments.
  Crossing cables and off-screen firing beams retain their visible portions.
- Large cavern contours have a weakly cached hierarchy of edge bounds. Nearest
  wall and ray queries still evaluate exact segments; original tie-breaking is
  preserved, including coincident vertices. Small polygons retain a linear scan.
  Nearby-ray bounds include long walls whose endpoints are both distant.
- Radiation outlines reuse the conservative local obstacle candidates already
  used by their cache signature. Animated doors no longer make every outline
  ray recheck distant station machinery. Actual radiation damage still uses the
  complete physical map; visual outlines are checked against full-map raycasts.

## Measurement method

The runners build isolated production bundles and own separate browser storage;
they never load the player's saved game. Timings, allocation sampling and CPU
profiling are separate runs. Reports include hardware, browser and sample counts.
Use the same machine and avoid concurrent builds, tests or profiling during timing
runs. Desktop background load and headless rasterization can still affect results.

Hard Vacuum exercises authored density in six seeded scenes: late field, red
chain explosions, bot towing, moving Haven, simultaneous doors and radiation
flight. The existing 3× density fixtures are stress workloads, not new content.
One fixed simulation tick and one Canvas draw run per real animation callback.
This does not model the adapter's variable catch-up ticks. CPU submission times
exclude GPU completion; observed frame intervals must be considered separately.

Urban Fire runs the actual production React adapter, controller polling and audio.
Three fresh episodes drive/fire for 300 real callbacks, then pause for 60 callbacks
and resume. This measures the opening battle, not a maximum-wave endurance run.
Real elapsed time drives this adapter, so faster runs can encounter different
enemy poses. Transition latency includes Playwright/browser scheduling. The city
build counter and paused callback costs separately verify resource lifetime and
idle work. There are no timing assertions tied to one machine in CI.

The Urban Fire runner now identifies the actual battlefield callback and excludes
the app's separate menu-controller RAF loop. The original Urban Fire reports above
predate that refinement: they sample both callbacks, including zero-gap callback
pairs, so their interval statistics should not be interpreted as gameplay FPS.
New runs use only game frames. `BENCHMARK_WIDTH`, `BENCHMARK_HEIGHT` and
`BENCHMARK_DPR` configure the viewport; `BENCHMARK_FRAMES` and
`BENCHMARK_EPISODES` also work for Urban Fire (defaults 300 and 3).

Run performance benchmarks while the interactive game is stopped. Separate browser
storage prevents save interference but does not isolate CPU or GPU load. Experimental
4K measurements taken during interactive play were not accepted as performance
evidence, and the experimental resolution/composition changes were reverted.

### Accelerated 4K follow-up

GPU inspection showed that the default Playwright headless shell uses SwiftShader
on this machine, with Canvas 2D and composition in software. The earlier headless
results are useful for CPU/allocation comparisons, not predictions of accelerated
gameplay FPS. The runner now records its GPU and fails an explicitly accelerated
run if hardware Canvas/compositing is unavailable.

With the interactive game paused, installed Chrome 153.0.8010.53 and
`BENCHMARK_GPU=1` reported the Adreno X1-85 through D3D11, with hardware Canvas and
compositing enabled. One unchanged-build 3840×2160 episode measured 5.9 ms CPU p95,
17.0 ms frame-interval p95, and a 16.89 ms mean interval (about 59 FPS).
[Raw baseline](performance/2026-09-22-urban-4k-gpu-baseline.json).

A separate experimental build with a smaller world canvas and DOM HUD did not
improve frame pacing enough to justify a visual-quality tradeoff. The playable
build retains the original full-resolution canvas and its FPS counter. This
matched the subsequent user finding: browser hardware acceleration had been
disabled. Enabling it resolved the reported full-screen slowdown without changing
the game's rendering resolution.

The GPU flag follows [Chromium's headless hardware guidance](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/gpu/using-gpu-hardware-in-headless-chrome.md).
It applies only to the isolated test browser; it does not change browser settings.

## Reproduce

```sh
npm run benchmark -- /tmp/hard-vacuum.json current
npm run benchmark:urban-fire -- /tmp/urban-fire.json current
BENCHMARK_SCENES=opening-doors BENCHMARK_DENSITIES=1 npm run benchmark -- /tmp/doors.json
BENCHMARK_PROFILE=1 npm run benchmark -- /tmp/vacuum-profile
BENCHMARK_PROFILE=1 npm run benchmark:urban-fire -- /tmp/urban-profile
node scripts/profile-summary.mjs /tmp/vacuum-profile.cpuprofile
BENCHMARK_BROWSER=chrome BENCHMARK_GPU=1 BENCHMARK_WIDTH=3840 BENCHMARK_HEIGHT=2160 npm run benchmark:urban-fire -- /tmp/urban-4k.json current
```

PowerShell uses `$env:BENCHMARK_SCENES='opening-doors'` (and similarly for other
options). `BENCHMARK_FRAMES` and `BENCHMARK_EPISODES` override the Hard Vacuum
defaults of 180 and 3. `BENCHMARK_BUILD` reuses a previously printed build directory
for comparisons without changing the live workspace; omit it to compile current
code. Keep reports outside `test-results`, which Playwright clears.

## Correctness checks

The indexed geometry matched the previous implementation exactly across 36,664
sampled cases spanning the station with closed/open doors and ten prototype maps,
including every outer-boundary vertex. Comparisons included wall distance, rays,
contact flags, impact speed, corrected positions and velocities. Two hundred
solid/vector model drawings also produced identical Canvas commands, coordinates,
styles and ordering against the previous renderer.

Permanent regressions cover subdivided concave contours, grazing rays, penetration
recovery, fresh geometry snapshots, cached paths, camera-edge padding, crossing
cables, rotated vehicle tips, long walls, static-resource reuse and pause/resize.
Gameplay/save tests and the production/development browser suites provide wider
coverage of physics, progression, combat, controls, audio and rendering.

All 12 final Hard Vacuum benchmark cases have identical outcome, peak and minimum
state records before and after. All six final scene screenshots are pixel-identical
([comparison data](performance/2026-09-22-visual-comparison.json)). The red-chain
comparison freezes `Date.now()` in both isolated pages to match its existing
wall-clock warning pulse; the other screenshots come directly from the timing
runs. Radiation outlines additionally match independently constructed full-map
raycasts for every source at five door-animation stages.

Validation completed:

- Production build and ESLint pass with the final runtime changes.
- The full Node run passed 519 tests. The subsequently added geometry and vehicle
  regressions passed targeted runs, as did the final radiation changes.
- All 172 browser cases are covered by passing runs: the full run passed 171;
  the remaining terrain test passed after its Canvas inspector learned to observe
  native `Path2D` strokes. Its geometry expectations are unchanged. The final
  radiation change also passed the focused flight and terrain browser checks.
