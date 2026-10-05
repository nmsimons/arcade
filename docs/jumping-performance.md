# Lighting performance notes

## October 5, 2026: Final rope with earlier ropes still swinging

The first-rope improvement did not cover the worst case near the end of the wide
level. Previously released ropes still moved, and the terrain's overall bounds
retained its distant solid for all three ropes' repeated contact passes, despite
the ropes swinging inside empty pits.

Each rope now checks the actual terrain outline against its existing padded
current/predicted movement bounds before retaining the solid for contact solving.
An empty contact set skips particle/body terrain queries and clears old corner
bends on the original release pass. All ropes still simulate, including after
release and offscreen; resolution, iterations, forces and sleeping thresholds
are unchanged. In-place outline changes still wake a resting rope when terrain
enters its region.

A matched installed Edge 154 / Adreno X1-85 comparison replayed normal tap/hold
and climb inputs from spawn through all three ropes, then pumped the final rope
while the first two kept moving. At 704×892 CSS, DPR 1.5, using the GPU renderer,
300 measured frames after warmup produced:

| Final-rope measurement | Before | After |
| --- | ---: | ---: |
| Simulation CPU average, two 120 Hz ticks | 22.5 ms | 6.4 ms |
| Simulation CPU p95 | 27.6 ms | 9.2 ms |
| Average frame rate | 40.3 FPS | 60.4 FPS |
| Frame interval p95 | 34.0 ms | 17.4 ms |
| Frames exceeding 33.83 ms | 18 / 300 | 0 / 300 |

Player positions/velocities and every rope node's current/previous positions
produced identical checksums. A separate Node probe with all three ropes active
reduced average simulation CPU from 21.2 to 4.5 ms, also with identical trajectories.
The browser comparison includes rendering but isolates this input route and
viewport; it does not establish sustained 60 FPS on every machine or complete
the unfinished level's route/medal review. Run timings sequentially without
concurrent builds or tests.

Regressions in `tests/jumping-rope-region-performance.test.mjs` cover three
moving ropes in empty concave regions, a real adjacent wall contact, in-place
terrain edits waking a resting rope, and release of obsolete corner bends.

## October 5, 2026: Loaded ropes over wide concave terrain

A new 8,000-unit-wide level exposed another simulation cost: the single terrain
polygon's bounds covered its empty pits, so a loaded 115-segment rope repeatedly
searched distant edges and tested the body against every convex terrain piece.
The profile included nearest-boundary searches, body sweeps, penetration tests
and point-in-polygon work. Level width alone is not a sufficient cost estimate;
the outline, rope length, body location and repeated contact passes matter.

Collision queries now cache each convex piece's bounds, separating axes and
projections. Body/particle queries first reject pieces outside the complete
swept bounds, retaining rotated and reverse-gravity body extents. These caches
share the boundary geometry's coordinate/outline invalidation. An exact distance
to the previously selected edge seeds ordinary nearest-boundary queries, while
all competing edges still receive the usual comparison and first-edge ties.
Normal-directed face queries retain their existing traversal/tie policy.
Point-on-edge queries reject out-of-bounds edges before computing their cross
product. Rope resolution, solver passes, contacts and level layout are unchanged.

An isolated installed Edge 154 / Adreno X1-85 comparison used the same normal
tap/hold input recording from spawn, jumping the first gaps and climbing the
second gap's ledge, then catching and pumping the first rope. At 704×892 CSS,
DPR 1.5, with the GPU renderer, 300 measured loaded-rope frames after warmup:

| Simulation CPU for two 120 Hz ticks | Before | After |
| --- | ---: | ---: |
| Average | 14.4 ms | 8.2 ms |
| p95 | 17.0 ms | 10.6 ms |

The player and all rope-node trajectories had identical checksums. Both isolated
frame runs stayed near 60 FPS at this viewport, so the 43% average CPU reduction
demonstrates headroom, not a 43% FPS increase or a sustained live-play guarantee.
Node probes at different first-rope grip heights also retained exact trajectories.
A further comparison matched 32,000 geometry queries over 160 terrain objects,
including rotated/inverted bodies, particle sweeps and directed face selection.
Permanent regressions cover remote-piece rejection, full-path collision, cache
invalidation and nearest-face ties in
`tests/jumping-wide-terrain-performance.test.mjs`.

## October 5, 2026: Spelunk cave movement on Windows ARM

Spelunk's moving-game slowdown included substantial simulation work. A CPU
profile of its built-in completion recording found repeated cave-outline
construction and nearest-edge queries in rope contacts dominating the run.
Ropes continue simulating after release and while the player moves elsewhere.

Boundary queries now retain outline coordinates and edge lengths/normals in a
weak cache. Translation, resizing, replacement outlines and in-place vertex
edits invalidate the cached geometry. Clearly farther edges skip a distance
square root; close candidates retain the original comparison and normal tie
policy. Rope iterations, contacts, sleeping rules, lighting and level assets
are unchanged. The public authoring helper still returns independent arrays.

Matched sequential measurements on Snapdragon X Elite X1E80100, Windows ARM64,
Node 24.14.1, with one full warmup and one measured fresh-start completion:

| Simulation CPU for two 120 Hz ticks | Before | After |
| --- | ---: | ---: |
| Average | 21.1 ms | 5.9 ms |
| p95 | 42.2 ms | 11.2 ms |
| p99 | 51.4 ms | 14.4 ms |

This reduces p95 simulation work by about 74%; it is not a measured 74% FPS
increase. Rendering and browser scheduling are excluded. The historical input
recording keeps its explicit jump impulses to visit the same contacts before
and after. Player, prop, rope-node, mechanism and clock trajectories produced
the same SHA-256 checksum across all 6,180 ticks. This verifies simulation
equivalence rather than re-auditing the route with today's tap/hold controls.

Reproduce the CPU comparison with `node scripts/benchmark-jumping-spelunk.mjs`
(optional JSON output path as the first argument). Run timing comparisons
sequentially without concurrent builds or tests. Regression checks exercise
repeated contacts, cache invalidation, edited polygons/profiles, normal ties,
rope contacts and existing built-in completion recordings.

A separate installed Edge 154.0.4258.53 / Adreno X1-85 renderer-only control
at 1280×800, DPR 1, with 12 warmup and 180 measured frames already held 60 FPS
while scrolling through the opening view: draw CPU p95 5.2 ms, frame p95
16.8 ms, no frames above 33.83 ms. That control excludes live physics and does
not cover every part of the cave. Full-play frame pacing still depends on
viewport, GPU/browser and other work on the machine; sustained 60 FPS everywhere
is not established by these measurements.

## September 28, 2026: Tower on Windows ARM

The accepted performance target is a steady rate above 30 FPS, with 60 FPS a
preferred result rather than a requirement. Preserve lighting quality when the
game stays comfortably above that floor. Evaluate frame pacing, p95 intervals
and repeated long frames as well as average FPS; an average above 30 can still
hide distracting stutters. Keep the GPU renderer and prioritize measured,
low-risk improvements before considering a wider engine change.

In development, backtick (`) opens the developer panel with the **Performance
monitor** and **Lighting performance mode** controls. Backtick or Escape closes
the panel. Gameplay and measurements pause while it is open; the enabled monitor
remains visible during play. Production hides the panel, shortcut, monitor and performance-mode controls,
ignores the monitor's saved preference, and does not allocate the monitor.
Adaptive lighting runs in both development and production. The monitor records raw animation-frame intervals, not the simulation's
50 ms catch-up cap. CPU update and draw measurements do not include asynchronous
GPU execution or browser compositing. The rolling history is bounded and the UI
updates at most twice per second. Paused and hidden time is excluded.

Day and Night share the lighting performance settings, viewport/pixel-ratio
caps, off-thread structural preparation and bounded buffers. Daylight also
applies to legacy levels without lighting settings; the performance mode must
not require a saved Night mode flag to observe or reduce render resolution.

Every run starts at normal resolution. Player, prop and robot shadows are off
in gameplay and previews; terrain and mechanisms still block light.
**Lighting performance mode** is enabled by
default in development and production; an explicitly saved off preference is
honored in both builds. It observes two consecutive one-second windows below 35 FPS,
then caps
rendering at pixel ratio 1 and one million pixels. This trades some sharpness for
frame time; the HTML interface retains its native resolution. Terrain
and moving mechanisms still block light; all six authored Tower lights, exposure,
power/fades, haze and object artwork remain. It does not change level files or
physics. Disabling the mode, restarting, or entering a new level restores normal
resolution. The reduction is latched to avoid oscillating between quality levels.
The 35 FPS trigger leaves some headroom above the minimum while retaining full
quality at sustained rates in the high 30s and 40s.

Live play now prefers a WebGL2 light field when supported. The monitor identifies
the active backend as GPU or Canvas. The GPU pass keeps all authored lights and
structural shadow silhouettes at the normal render resolution until performance mode
detects sustained low frame rates. Editor/library previews retain Canvas. Unsupported GPU
capabilities, context loss, unsupported silhouettes or an exceeded buffer budget
fall back to the complete Canvas renderer.
Automatic selection also falls back for known software WebGL drivers such as
SwiftShader and llvmpipe, even if the browser accepts the performance-caveat flag.
This retains full graphics quality while avoiding CPU-emulated WebGL in live play.
Explicit `backend: 'gpu'` renderer experiments allow software WebGL so the GPU
visual and context-loss tests still execute on CI machines without a GPU.

### Full-quality changes

- Size the stationary-light cache from the existing 64 MiB lighting-buffer budget
  instead of always limiting it to two lights. Tower can cache all six at
  1280×800; the maximum render size still allows only two. Reallocation and
  eviction follow viewport changes.
- Clear and composite each shadow mask only over its projected pixel bounds,
  including a two-pixel antialiasing margin. Offscreen blockers remain included.
- Remove a redundant whole-buffer clear on cache hits.

No resolution, geometry, light count or exposure changes are made in full mode.
Eleven Tower frames matched the original renderer exactly in an independent
pixel comparison, including subpixel prop movement, rotation, fractional camera
movement, mechanism movement, zoom and EMP fade transitions. An additional
12-frame prototype-fixture sequence also matched exactly on separate canvases.

### Initial measurements

Machine: Snapdragon X Elite X1E80100, Windows ARM64, Adreno X1-85 GPU, driver
31.0.133.1. Browser: Edge 154.0.4258.37, headless, with accelerated Canvas 2D and
GPU compositing reported enabled. Viewport: 1280×800, DPR 1. The actual built-in
Tower asset has six lights, seven props and sixteen mechanisms. Each case has
12 warmup frames and 60 measured frames. These short renderer benchmarks are
not a completed playthrough or a prediction for other devices, display sizes,
browsers or the Codex embedded browser.

| Rendering mode | Stationary FPS | Scrolling FPS | Stationary draw CPU p95 | Scrolling draw CPU p95 |
| --- | ---: | ---: | ---: | ---: |
| Original renderer | 34.3 | 20.0 | 8.3 ms | 11.0 ms |
| Optimized, full shadows | 60.0 | 20.5 | 6.4 ms | 12.7 ms |
| Optimized, structural shadows | 60.0 | 36.0 | 4.7 ms | 5.0 ms |

Buffers rose from 31.25 to 46.875 MiB in these cases, remaining below the
unchanged 64 MiB cap. The saved budget now buys reuse of more lights.

The default bundled headless Chromium produced far slower results than the
hardware-accelerated installed browser; those results are not representative
of the user's live experience and are excluded from this table. Record browser,
GPU backend, resolution and device pixel ratio when comparing measurements.

To reproduce the current renderer on Windows PowerShell:

```powershell
$env:LIGHTING_CHANNEL = 'msedge'
node scripts/benchmark-jumping-tower.mjs
$env:LIGHTING_SHADOWS = 'structural'
node scripts/benchmark-jumping-tower.mjs
Remove-Item Env:LIGHTING_SHADOWS
```

`LIGHTING_URL` overrides the default local Vite URL. `LIGHTING_RENDERER` can
point to a same-origin reference renderer module for before/after comparisons.
The benchmark reports its browser and GPU feature status alongside measurements.
`LIGHTING_LEVEL` selects another level URL with lighting settings.
`LIGHTING_BACKEND=canvas` forces the reference path; the default `auto` tries GPU.
`LIGHTING_SHADOWS=structural` also uses the adaptive resolution cap, matching play
after a performance downgrade. Normal gameplay uses structural shadows at normal
resolution.
`LIGHTING_WIDTH`, `LIGHTING_HEIGHT`, `LIGHTING_DPR`, `LIGHTING_FRAMES` and
`LIGHTING_WARMUP` change the viewport and sample duration. Output includes p99,
worst frame interval and frames exceeding 33.83 ms (a half-millisecond tolerance
around 30 FPS). Longer runs also travel farther up the level; compare matching
settings and paths. This is a renderer benchmark with stationary preview objects,
not a simulation, input-latency measurement or completed playthrough.

Set `LIGHTING_TRACE=.local/lighting-trace.json` to save a Chromium graphics trace
with stationary/scrolling phase markers. Tracing adds overhead; use an untraced
run for comparable frame-rate measurements. Open the saved trace in a compatible
trace viewer to inspect raster, GPU-service and compositor activity.

### Architectural implication

Stationary reuse helps substantially, but camera movement invalidates the raster
fields and still costs heavily. The remaining gap between CPU submission time
and frame cadence is consistent with graphics/compositing pressure; it does not
identify one GPU operation conclusively.

If further Canvas work cannot meet the target, prototype a WebGL lighting
compositor behind the existing renderer boundary and compare Tower at matching
quality. Keep physics, authored levels, input, audio and editor workflows.
An engine or codebase migration is not justified by these measurements alone.
The reference Mac is currently unavailable, so no Mac comparison is claimed.

### Follow-up: scrolling investigation

The next pass targeted a steady 60 FPS at full lighting quality. None of the
experiments met that target, and none was enabled in the live game. In another
matched 60-frame run on the same Edge/Adreno setup:

| Diagnostic variant | Scrolling FPS |
| --- | ---: |
| Current full-quality renderer | 20.3 |
| Replace cone gradients with white fields | 22.1 |
| Omit shadow drawing entirely | 59.0 |
| Omit final world/exposure/haze composition | 33.7 |
| Direct drawing of structural shadows | 23.7 |
| Convex shadow hulls instead of overlapping edge wedges | 23.5 |
| WebGL stencil shadow masks, returned to Canvas per light | 25.0 |

The omission variants deliberately change the image and are diagnostic controls,
not quality modes. The WebGL prototype kept the casters but used a different
antialiasing method: eleven Tower comparison frames had maximum channel
differences of 16–21/255. Its Canvas buffer counter also excludes WebGL allocations,
so it has not demonstrated the production memory budget. It is not ready to ship.

A 90-frame scrolling trace of the current renderer recorded 17,173 raster calls
on the GPU service thread (about 191 per rendered frame). Raster processing and
end-raster flushing together occupied about four seconds, compared with about
0.71 seconds in animation-frame callbacks. These are instrumented, partly nested
CPU trace events, not hardware GPU timer results. They support investigating the
number of raster passes and cross-surface dependencies rather than attributing
the problem solely to JavaScript or the number of light-cone gradients.

A longer matched comparison (12 warmup + 180 measured frames, with more of Tower
visible during the scroll) produced 18.1 FPS / 75.0 ms p95 for the current renderer
and 27.1 FPS / 50.1 ms p95 for the hybrid WebGL prototype. That is still well short
of smooth motion. Even stationary measurements varied between runs; the short
60 FPS result above is not evidence of sustained performance.

The next useful architecture experiment is a complete GPU light-field pass:
retain shadow masks, cone evaluation and light combination in the same graphics
context, then transfer the resolved result once. The shadow-only hybrid leaves
the repeated transfers and Canvas composition in place, so its result neither
proves nor rules out that approach. Validate visual equivalence, memory use,
context-loss fallback and actual moving gameplay before selecting a replacement.
This remains a rendering subsystem decision; it provides no evidence that the
physics, level format, controls or editor need an engine migration.

### GPU light field: integrated result

The complete light-field implementation retains all lamps in one WebGL context.
An R8 shadow mask and stencil attachment are reused for each light, with four
coverage samples per pixel. Each caster receives a distinct stencil stamp;
clearing stencil per object made the first implementation much slower. Stamp
rollover clears only stencil, preserving accumulated occlusion. GPU max blending
resolves lamp exposure and a second panel holds source haze. Existing Canvas
artwork and its exposure/readability composition are preserved. There are no
per-object framebuffers or runtime pixel readbacks.

Conservative cone culling removes only blockers outside a lamp's angular reach,
with an antialiasing margin. Offscreen blockers remain included. The final path
samples the resolved GPU field directly, removing an unnecessary full-size copy.
Estimated buffers include the output atlas, multisampled mask/stencil, resolved
mask, vertex data and Canvas scratch surfaces, with the existing 64 MiB limit.
Driver/browser copies remain outside that estimate.

On the same installed Edge/Adreno setup, with 12 warmup + 180 measured frames:

| Mode / viewport | Scrolling FPS | Frame p95 | Estimated buffers |
| --- | ---: | ---: | ---: |
| Earlier Canvas reference, 1280×800 | 18.1 | 75.0 ms | 43.0 MiB |
| GPU full quality, 1280×800 | 57.9 | 17.0 ms | 32.2 MiB |
| GPU full quality, 1920×1080 CSS (1886×1061 rendered) | 42.4 | 33.6 ms | 63.0 MiB |

These are renderer-only comparisons, not sustained gameplay guarantees. A brief
live in-app-browser trial at 1280×720 CSS / DPR 1.5 showed about 29–32 FPS at full
resolution and about 49 FPS after adaptive reduction to 1280×720. Simulation CPU
time was substantial in that running level (roughly 10–16 ms/frame in sampled
windows). Live readings also vary with other work on the machine. A steady
60 FPS in actual play at every tested resolution has **not** been achieved.

Side-by-side Tower renders retained the composition and appearance. Pixel checks
cover fourteen frames with camera/subpixel movement, rotation, moving mechanisms,
EMP transitions, zoom, facing, crouch and exit fade. GPU multisampling differs
from Canvas antialiasing: these are visually close, not pixel-identical images.
Tests bound average channel error and the fraction of larger edge differences.
Additional checks cover strongest-light/duplicate/order invariance, fading and
covered sources, stencil rollover, first allocation, resize and context-loss
fallback. Concave triangulation and more than a thousand animated player outlines
are checked separately against their polygon areas.

### Validation and limits

The production build, 54 focused lighting/monitor/geometry unit checks and 20
selected browser checks passed, including GPU visuals and fallback, adaptive
resolution/restoration, monitor behavior and pause/menu accessibility. No GPU
checks were skipped in the reference Edge run. During the earlier Canvas
validation, fourteen existing lighting pixel checks failed in this Edge setup;
every one also failed against
the original renderer served by an isolated baseline server. They remain unresolved
baseline issues, so the lighting suite is not reported as fully green.

The broader Node suite passed 1,306 tests; two file-security tests could not create
Windows symlinks (`EPERM`). Targeted lint passes for the new modules and renderer;
the main game component has two existing React-hook lint errors, also confirmed
against its original source with the installed dependency versions.
