# LAB stress tests

The current tools measure the production JavaScript simulation and renderer.
Run `npm run benchmark:lab-stress -- .local/lab-stress-results.json` with the
interactive previews paused and other builds, tests and benchmarks stopped.
The runner uses installed Edge and verifies hardware Canvas/compositing before
accepting an accelerated measurement.

## Playable development levels

Start `npm run dev`, open LAB's level menu and expand **Stress tests · Development**.
These read-only challenges live in `dev/levels/jumping/`, outside the public
asset directory. A serve-only
Vite plugin exposes their manifest and validated JSON in development; production
builds and production previews neither show the section nor serve its files.
The old built-in stress URLs have been retired. Play them from this menu section;
they do not participate in the normal campaign's next-level sequence.

| Level | Ropes | Loose props | Spotlights | Cycling lifts |
| --- | ---: | ---: | ---: | ---: |
| [Load Test](../dev/levels/jumping/Load%20Test.jump-level.json) | 8 | 24 | 4 | 3 |
| [Load Test Max](../dev/levels/jumping/Load%20Test%20Max.jump-level.json) | 40 | 80 | 16 | 6 |

Their original authored JSON is unchanged. The upper route crosses four rope
banks and ascending decks; the lower service passage has fixed ladders at both
ends. Falls into the machine bin can use ropes or two escape ladders. Optional
coins mark upper landings; the exit is always on, so recovery never requires
retrieving a lost prop. Low gravity and cycling lifts revisit ordinary contacts.

Fresh-start normal-control recordings completed the upper routes in 6.36 / 6.63 s
and the service routes in 15.09 s. Gold is 12 s, silver 25 s and bronze 80 s.
All four traces are retained in
[`jumping-stress-level-runs.json`](../tests/fixtures/jumping-stress-level-runs.json)
and replayed with the JavaScript solver by `node --test tests/jumping-stress-levels.test.mjs`.
Validate the collection with `npm run levels:check:dev`; `npm run levels:check`
continues to validate the 26 production built-ins independently.

The user completed the lighter Load Test on the Windows ARM PC and reported it
playable; Max ran poorly. A full manual review of every machine-bin recovery and
a MacBook measurement remain unverified. Start with the lighter level. These
maps differ from the numerical workloads below; their populations do not mean
that every object remains active, and benchmark FPS is not their measured FPS.

## Numerical workloads

Layout and object prototypes remain in
[`lab-stress.json`](../tests/fixtures/jumping/lab-stress.json), unchanged from the
investigation. Generated workloads pass the runtime schema and authoring limits.
They are numerical fixtures with placeholder medals, not authored challenges.

| Family | Population / motion |
| --- | --- |
| Free ropes | 1, 8, 24, 40 initially swinging ropes |
| Rope contacts | 8, 24, 40 ropes beside eight narrow walls |
| Lights | 1, 4, 8, 16 lights with 48 terrain blockers |
| Moving lights | 16 lights, 48 blockers, 16 props, six lifts, scrolling camera |
| Props | 8, 40, 80 boxes/balls with initial velocities |
| Mixed medium | 16 ropes, eight lights, 40 props, four lifts, walls, scrolling camera |
| Mixed maximum | 40 ropes, 16 lights, 80 props, six lifts, walls, scrolling camera |

Ropes have 65 segments and 520 units of material. The player stays unattached;
`scripts/benchmark-jumping-spelunk.mjs` separately covers the historical route
with attached ropes, switches and completion. Props receive identical impulses
in a supported low-gravity field; lifts have staggered starts. Activity counters
identify how many objects continue moving. Offscreen active objects simulate.

## Measurement and comparisons

Defaults remain 1280×800 CSS pixels, DPR 1, 30 warmup frames, 300 measured frames
and three fresh episodes. Each arm reloads the page, resetting globals, Matter
IDs and renderer caches. Level creation and settling occur before timing. Full
quality lighting has no adaptive reduction; actual backing dimensions, renderer
backend and buffer estimates are recorded.

Each RAF advances two 120 Hz ticks and submits one frame, even when slow. This
keeps simulated workloads equal and measures capacity, rather than the app's
wall-clock catch-up policy. The real game can perform extra catch-up work when
saturated. Menus, accounts, saves, audio and input latency are outside this test.

Reports retain raw CPU simulation/draw spans and RAF intervals, percentiles,
missed frames, object activity, end-state rope-quality diagnostics and final
trajectory hashes. RAF intervals include presentation and scheduling; CPU draw
spans exclude asynchronous GPU completion. The trailing callback observes the
last measured frame. Summary statistics use episode medians. Rope diagnostics
expose known extreme moving-prop contact limitations; they do not establish
subjective feel or universal collision guarantees.

Use `LAB_STRESS_COMPARE_COLLISION_QUERIES=1` for an alternating comparison of the
accepted cache against the original Matter queries. Both production bundles
come from the same current graph; the reference removes only the per-step cache
and restores its two query call sites. Both arms must use the same renderer and
backing dimensions and agree within 1e-6 world units. Reports also record exact
outcome-hash equality. Divergence, a browser error or a hidden page fails the run.
Checkpoints saved after each arm stay `complete: false` until all checks pass.

```powershell
$env:LAB_STRESS_COMPARE_COLLISION_QUERIES = '1'
$env:LAB_STRESS_CASES = 'props-80,mixed-medium,mixed-max'
$env:LAB_STRESS_FRAMES = '300'
$env:LAB_STRESS_EPISODES = '3'
npm run benchmark:lab-stress -- .local/collision-comparison.json
Remove-Item Env:LAB_STRESS_COMPARE_COLLISION_QUERIES, Env:LAB_STRESS_CASES, Env:LAB_STRESS_FRAMES, Env:LAB_STRESS_EPISODES
```

Without a reference, the runner records the current JavaScript engine alone.
`LAB_STRESS_COMPARE_BUILD` instead accepts an immutable earlier benchmark bundle
with its `index.html` and referenced assets. Copy `.local/lab-stress-build` after
a completed baseline before changing code: each run rebuilds that working folder.
The runner hashes entry HTML and JavaScript for each arm. Select one reference
mode. Legacy frozen harnesses are run in their JavaScript mode.

Other controls: `LAB_STRESS_WARMUP`, `LAB_STRESS_WIDTH`, `LAB_STRESS_HEIGHT`,
`LAB_STRESS_DPR` and `LAB_STRESS_BROWSER` (installed Playwright channel).
`LAB_STRESS_GPU=0` permits software diagnostics, unsuitable for hardware FPS claims.

## Profiling sustained frames

`npm run profile:lab-stress` records a simulation-only Node CPU profile. Select a
scenario with `LAB_STRESS_CASE`, starting frame with `LAB_STRESS_SKIP` (default
30), and window with `LAB_STRESS_FRAMES` (default 90). Advance from the same fresh
state before sampling. Use the uninstrumented browser runner for timing claims.

`npm run profile:lab-stress-browser` samples the production engine and hardware
renderer in Edge. Default is mixed-max / start 210 / 60 frames. The sustained
maximum window is 210–269; the medium spike is 150–209. A readable, unminified
build exposes JavaScript phase ancestry:

```powershell
$env:LAB_STRESS_CASE = 'mixed-max'
$env:LAB_STRESS_SKIP = '210'
$env:LAB_STRESS_FRAMES = '60'
$env:LAB_STRESS_PROFILE_READABLE = '1'
npm run profile:lab-stress-browser -- .local/max-javascript.cpuprofile
Remove-Item Env:LAB_STRESS_CASE, Env:LAB_STRESS_SKIP, Env:LAB_STRESS_FRAMES, Env:LAB_STRESS_PROFILE_READABLE
```

Sampling perturbs execution; profiles diagnose work rather than prove FPS.

## Archived native experiments

Rust rope kernels, the selective scheduler, Rapier and the rejected chain solver
were removed from the active codebase. Source, binaries, tests, provenance and
original reproduction commands remain at commit
`321d047`.
Use a separate checkout of that commit to reproduce those trials. Historical
reports and [findings](jumping-performance.md) retain their original conditions
and hashes; they are not fresh measurements of the cleaned JavaScript code.
