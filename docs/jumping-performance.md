# Lighting performance notes

## September 28, 2026: Tower on Windows ARM

The accepted performance target is a steady rate above 30 FPS, with 60 FPS a
preferred result rather than a requirement. Preserve lighting quality when the
game stays comfortably above that floor. Evaluate frame pacing, p95 intervals
and repeated long frames as well as average FPS; an average above 30 can still
hide distracting stutters. Keep the GPU renderer and prioritize measured,
low-risk improvements before considering a wider engine change.

The in-game monitor is available with F2 or from the pause menu in development
only. Production hides the monitor, F2 shortcut and performance-mode controls,
ignores their saved preferences, and does not allocate the monitor or adaptive
controller. GPU lighting and full quality remain enabled in production. It records raw animation-frame intervals, not the simulation's
50 ms catch-up cap. CPU update and draw measurements do not include asynchronous
GPU execution or browser compositing. The rolling history is bounded and the UI
updates at most twice per second. Paused and hidden time is excluded.

Full quality remains the default on every device. The development-only **Lighting
performance mode** observes two consecutive one-second windows below 35 FPS,
then omits shadows from the player, loose props and robots for that run and caps
rendering at pixel ratio 1 and one million pixels. This trades some sharpness for
frame time; the HTML interface retains its native resolution. Terrain
and moving mechanisms still block light; all six authored Tower lights, exposure,
power/fades, haze and object artwork remain. It does not change level files or
physics. Disabling the mode, restarting, or entering a new level restores full
shadows and resolution. The reduction is latched to avoid oscillating between quality levels.
The 35 FPS trigger leaves some headroom above the minimum while retaining full
quality at sustained rates in the high 30s and 40s.

Live play now prefers a WebGL2 light field when supported. The monitor identifies
the active backend as GPU or Canvas. The GPU pass keeps all authored lights and
full shadow silhouettes at the normal render resolution until the player opts
into adaptive reduction. Editor/library previews retain Canvas. Unsupported GPU
capabilities, context loss, unsupported silhouettes or an exceeded buffer budget
fall back to the complete Canvas renderer.

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
`LIGHTING_SHADOWS=structural` also uses the adaptive resolution cap, matching play.
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
