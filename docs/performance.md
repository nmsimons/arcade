# Hard Vacuum runtime measurements

For the later Urban Fire / Hard Vacuum pass, see
[September 22 runtime performance](performance-pass.md).

Measured September 19, 2026 on an Apple M5 Pro (18 logical CPUs, 24 GiB RAM),
macOS/Darwin 25.5.0 arm64, Chromium 153.0.8010.12, headless, 1280×800 at DPR 1,
no CPU throttling. Raw measurements: [before](performance-before.json) and
[after](performance-after.json) the local radiation-footprint cache change.
Timing runs had no concurrent project builds/tests. An earlier allocation-profiled
timing run was discarded: allocation sampling measurably changes frame timings.
These measurements cover the review-fix implementation at `e0395cd`, before the
subsequently requested automatic radiation-recharge change. The committed harness
can be rerun against current gameplay.

## Reproduce

Install the locked dependencies on Node 24 and Chromium as described in
[testing](testing.md), then run:

```sh
npm run benchmark -- /tmp/arcade-performance.json
# Optional smaller run:
BENCHMARK_SCENES=opening-doors npm run benchmark -- /tmp/arcade-doors.json
```

The runner builds an isolated production benchmark, owns a server on port 4177,
and opens its own Chromium context. It never accesses the user's saved game.
JSON is updated after each case; screenshots and build output are kept in the
temporary directory printed at completion. The benchmark is not shipped with
the arcade, and instrumentation performs no clock reads unless explicitly enabled.

`benchmarks/scenes.mjs` uses gameplay seed 713, cosmetic seed 23 and placement
seed 819. Three fresh 180-tick episodes produce 540 samples per case, one real
1/60 simulation step and one real Canvas draw per animation callback. Shared
renderer/wiring caches are warmed first; scene setup is outside CPU measurements.
This measures a reproducible one-tick workload, **not** the application's variable
number of catch-up ticks. At a missed frame the real application may need two
ticks, so stress results must not be interpreted as spare production capacity.

Fixtures retain the authored field and simulation systems. 1× means authored
debris density; 3× adds two seeded, geometry-validated copies of each asteroid,
not duplicate mission cargo. Actual surviving body totals are reported below.
The red-chain fixture adds seven fragments and arms one; the towing fixture
starts the real Coil tug holding field cargo; moving Haven traverses its real
route through 8/24 extra small rocks after its folding phase. The door fixture
opens all 20 socket doors simultaneously: a conservative concurrency case, not
a claim that normal play opens 20 doors at once. Radiation flight uses steering
and thrust commands through the medical bypass (413 units in each episode).
Node tests assert that chains, tethers, impacts, doors and exposure actually occur.

## CPU and observed frame intervals

Milliseconds; paired values are **p95 / p99**, not averages. Bodies include the
ship, rocks, loose cargo and bots; nearby is peak asteroid count within 720 units.
CPU work includes simulation, event processing, applicable snapshots/saves and
Canvas command submission. React reconciliation/layout, Web Audio and GPU raster
completion are excluded. Browser frame intervals include scheduling/raster effects;
CPU work below 16.67 ms does not alone establish 60 fps.

| Scene | Bodies | Nearby | Simulation | Drawing | Total work | Frame interval p95 |
|---|---:|---:|---:|---:|---:|---:|
| Late field 1× | 327 | 20 | 2.3 / 2.4 | 2.2 / 2.7 | 4.2 / 4.8 | 16.7 |
| Late field 3× | 937 | 61 | 6.4 / 8.1 | 2.9 / 5.4 | 9.2 / 12.6 | 33.4 |
| Red chain 1× | 327–336 | 29 | 2.8 / 3.0 | 2.5 / 2.9 | 4.9 / 5.7 | 16.7 |
| Red chain 3× | 937–952 | 75 | 7.3 / 8.9 | 3.3 / 5.8 | 10.6 / 13.1 | 33.4 |
| Bot towing 1× | 326 | 17 | 2.6 / 2.7 | 2.4 / 2.7 | 4.6 / 4.9 | 16.7 |
| Bot towing 3× | 934 | 51 | 7.5 / 8.5 | 2.8 / 3.8 | 10.2 / 13.0 | 33.4 |
| Moving Haven 1× | 335 | 28 | 2.9 / 3.5 | 2.5 / 2.7 | 5.0 / 6.3 | 16.7 |
| Moving Haven 3× | 955 | 79 | 7.0 / 7.3 | 2.8 / 4.8 | 9.7 / 12.8 | 33.4 |
| Opening doors 1× | 319 | 19 | 2.6 / 2.9 | 8.5 / 8.8 | 10.9 / 11.9 | 33.3 |
| Opening doors 3× | 913 | 55 | 7.4 / 8.0 | 9.0 / 10.1 | 16.4 / 18.6 | 33.4 |
| Radiation flight 1× | 327 | 6 | 0.6 / 0.7 | 1.9 / 2.2 | 2.5 / 2.8 | 16.7 |
| Radiation flight 3× | 937 | 15 | 1.6 / 1.8 | 2.0 / 2.4 | 3.5 / 4.0 | 16.7 |

Section p95 below is inclusive: collisions/geometry/dose are inside simulation;
footprints are inside drawing. Do not add percentiles or nested sections together.
Zero means below the displayed 0.1 ms resolution, not that the code did no work.
Saving includes validation, serialization, backup and isolated localStorage writes.
Save percentiles have only 3–6 samples per case; consult sample counts in the JSON.

| Scene | Collisions | Geometry | Dose | Footprints | HUD snapshot | Saving |
|---|---:|---:|---:|---:|---:|---:|
| Late field 1× / 3× | 1.3 / 4.0 | 0.1 / 0.1 | 0.0 / 0.0 | 0.1 / 0.0 | 0.1 / 0.1 | 0.2 / 0.3 |
| Red chain 1× / 3× | 1.6 / 4.7 | 0.1 / 0.1 | 0.0 / 0.0 | 0.0 / 0.1 | 0.1 / 0.1 | 0.1 / 0.2 |
| Bot towing 1× / 3× | 1.6 / 5.0 | 0.1 / 0.1 | 0.1 / 0.1 | 0.1 / 0.1 | 0.1 / 0.1 | 0.2 / 0.2 |
| Moving Haven 1× / 3× | 1.8 / 4.6 | 0.1 / 0.1 | 0.0 / 0.0 | 0.0 / 0.0 | 0.1 / 0.1 | 0.2 / 0.3 |
| Opening doors 1× / 3× | 1.5 / 4.9 | 0.2 / 0.2 | 0.1 / 0.1 | 6.4 / 6.4 | 0.1 / 0.1 | 0.2 / 0.2 |
| Radiation flight 1× / 3× | 0.2 / 0.9 | 0.1 / 0.1 | 0.1 / 0.1 | 0.0 / 0.0 | 0.1 / 0.1 | 0.2 / 0.2 |

## Allocation observations

A separate 120-frame pass uses Chromium heap sampling at 32 KiB intervals,
including collected objects. These are **sampled estimates**, not exact byte
counts or retained memory. Setup is included; moving Haven also includes its
180 pre-transit ticks, so its per-frame estimate is deliberately not directly
comparable to other scenes. Diagnostic scans are included. Post-GC heap numbers
come from the independent three-episode timing pass, before allocation profiling.

| Scene | Estimated MiB/frame 1× / 3× | Post-GC heap MiB 1× / 3× |
|---|---:|---:|
| Late field | 7.5 / 26.8 | 3.8 / 3.9 |
| Red chain | 9.0 / 29.5 | 4.1 / 4.0 |
| Bot towing | 8.5 / 31.1 | 4.1 / 4.1 |
| Moving Haven | 17.2 / 60.8 | 4.2 / 4.2 |
| Opening doors | 9.2 / 30.0 | 4.3 / 4.4 |
| Radiation flight | 3.7 / 7.1 | 4.4 / 4.4 |

Most allocated data is transient; the largest retained delta was 387 KiB while
warming additional caches. This short run cannot exclude a long-session leak.
Allocation estimates alone are not grounds for rewriting the collision system.

## Measured optimization and decisions

The old footprint cache keyed only by the entire map identity. Any animated door
rebuilt that identity, forcing all emitters to cast their visual rays again.
The change retains a bounded last footprint per emitter and boundary, keyed by
emitter geometry and nearby obstacle coordinates. Conservative bounds include
long edges even when neither vertex is nearby. Nearby door changes still invalidate
the exact outline. Physics, dose raycasts, map construction and collision order
are unchanged; this is a **visual-cache** optimization, not reduced damage accuracy.

| Door scenario | Before CPU p95 / p99 | After CPU p95 / p99 | Footprint p95 before → after |
|---|---:|---:|---:|
| Authored density | 15.2 / 16.3 | 10.9 / 11.9 | 10.8 → 6.4 |
| 3× stress | 20.7 / 23.3 | 16.4 / 18.6 | 11.0 → 6.4 |

That is a 28% reduction in authored-density p95 work, not a 28% increase in fps.
The simultaneous-door case still produces 33 ms browser intervals; stalls can
delay controls/catch-up even when their source is cosmetic work. Cached points
match fresh raycasts exactly for every emitter at five door positions. The
before/after door screenshots are byte-identical. Collision, seeded sessions,
radiation, cargo, routes and browser regressions were rerun after the change.

Practical budgets and disposition for #10:

- Target 60 Hz: 16.67 ms end-to-end, with one-tick CPU p95 ≤12 ms and p99 ≤16.67 ms
  to leave some browser/UI headroom. Authored scenes meet the CPU target on this
  machine; the conservative simultaneous-door case misses the observed-frame target.
- Keep current world density. 3× misses frame cadence and the door CPU budget.
  Before increasing density, profile on a lower-end target and measure actual
  multi-tick catch-up plus GPU/layout time, not this CPU harness alone.
- Implemented: local radiation-outline cache, justified above. If simultaneous
  nearby door animation becomes common, next investigate local raycast candidate
  filtering; preserve exact outlines and require a before/after measurement.
- Deferred, not required for current density: spatial collision candidates. Their
  p95 cost grows from 1.3–1.8 ms to 4–5 ms in dense scenes, but geometry/Canvas work
  and frame cadence must also be addressed before a density increase. No solver
  ordering or physics rewrite is justified by current-density results.
- HUD snapshots and saves are below 0.3 ms p95 here. Retain their current cadence;
  investigate only if save p95 exceeds 2 ms or snapshot p95 exceeds 1 ms on a target.
  Treat >1 MiB post-GC growth over repeated identical episodes as a memory
  investigation trigger, not proof of a leak or a brittle CI threshold.

These results are an investigation baseline, not a mobile performance guarantee
or a full campaign-duration endurance test. Browser automation verifies the full
React adapter separately; human playtesting and low-end GPU profiling remain
appropriate before a future content-density increase.
