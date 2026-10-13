# LAB browser stress measurements

Run `npm run benchmark:lab-stress -- .local/lab-stress-results.json` with the
interactive preview paused and other builds, tests and benchmarks stopped.
The runner compiles the production simulation and renderer, launches installed
Edge, verifies hardware Canvas/compositing, and compares TypeScript and the
opt-in Rust/Wasm rope kernel sequentially. It refuses a software GPU substitute
unless explicitly selected for diagnostics.

## Playable density checks

Two authored levels in the built-in picker offer a hands-on comparison:

| Level | Ropes | Loose props | Spotlights | Cycling lifts |
| --- | ---: | ---: | ---: | ---: |
| [Load Test](../public/levels/jumping/Load%20Test.jump-level.json) | 8 | 24 | 4 | 3 |
| [Load Test Max](../public/levels/jumping/Load%20Test%20Max.jump-level.json) | 40 | 80 | 16 | 6 |

The hall's upper route crosses four rope banks and ascending decks; the lower
service passage has fixed ladders at both ends. Falls into the machine bin can
use the ropes or its two escape ladders. Optional coins mark the upper landings;
the exit is always on, so recovery never requires retrieving a lost prop.
The low-gravity bin and cycling lifts revisit contacts without scripted impulses.
Ropes use the standard 8-unit segments and saved settled paths. Lights illuminate
the route and recovery instructions; there are no new physics rules.

Fresh-start normal-control recordings completed the upper routes in **6.36 s /
6.63 s**, and the service route in **15.09 s**. Gold is 12 s, silver 25 s, and
bronze 80 s, allowing the quicker rope route a generous execution margin and
leaving exploration time. Gold traces are in
[`jumping-builtin-medal-runs.json`](../tests/fixtures/jumping-builtin-medal-runs.json);
both service traces are in
[`jumping-load-test-recovery-runs.json`](../tests/fixtures/jumping-load-test-recovery-runs.json).
Replay gold with `node --test --test-name-pattern "every built-in|Load Test" tests/jumping-builtin-medals.test.mjs`.
File validation covers all 28 built-ins. All 59 level-asset tests passed, and
both gold and both service routes also passed with the default TypeScript solver. The lighter version
was reviewed in the browser and the user completed it and reported it playable
on the Windows ARM PC. A full manual review of every machine-bin recovery and
a MacBook performance measurement remain unverified.

The first maximum draft ran poorly on that PC. Keep Max as the expensive
comparison and start with Load Test. These authored maps have different geometry,
motion and player interactions from the numerical benchmark below. Their object
counts are populations, not guarantees that every prop is moving every frame.
Do not reuse the benchmark's FPS figures as measurements of these levels.
Use `?labRopes=wasm&labSolver=active` on either level's URL for the opt-in solver;
omit the flags for the established TypeScript version. Keep resolution, route,
and other running previews consistent when comparing devices or backends.

## Alternative Rust physics capacity probe

`@dimforge/rapier2d-compat` 0.21.0 is a pinned development dependency. Its package
and both probe modules are excluded from normal gameplay. The build plugin
injects a delegation only into benchmark builds; production source files and the
shipped custom rope binary remain unchanged.

Run the final prop comparison in PowerShell with the previews paused and no
other builds, tests or measurements running:

```powershell
$env:LAB_STRESS_COMPARE_PROPS='1'
$env:LAB_STRESS_SOLVER='active'
$env:LAB_STRESS_RAPIER_ROPES='0'
$env:LAB_STRESS_CASES='props-80,mixed-medium,mixed-max'
$env:LAB_STRESS_FRAMES='300'
$env:LAB_STRESS_EPISODES='3'
node scripts/benchmark-lab-stress.mjs .local/lab-rapier-long.json
```

Remove these environment variables before reproducing older comparison modes.
Both arms use the same bundle, existing active Rust rope solver, counts, initial
inputs, simulation clock, viewport and full-quality renderer. The native prop
model uses true circles and changed trajectories, so this mode records drift
without claiming exact parity. No sleeping is allowed in the native engine.
The final crowded-scene residual-overlap gate is 0.5 units; separate mechanical
tests use 0.15. Native execution and fallback counters are retained. Unsupported
player/robot/water interactions delegate to the established prop solver, and
their performance has not been qualified by this numerical comparison.

`LAB_STRESS_RAPIER_ROPES='1'` enables the **rejected**, benchmark-only batched
soft-rope experiment. It checks fixed anchors within 0.001 units, total stretch
below 2%, local stretch below 10%, and zero blocked complete spans. It throws on
player-loaded ropes or fallback ticks. The crowded trial fails these gates;
it is not a playable mode or an accepted performance result. Raw arms are saved
before validation so rejected candidates remain inspectable.

Run `node --test tests/jumping-rapier-probe.test.mjs` for the narrower stack, CCD,
cargo, fallback and static rope tests. These do not replace the crowded gates.
For the slow-window diagnostic set `LAB_STRESS_PROPS='rapier'`,
`LAB_STRESS_SOLVER='active'`, `LAB_STRESS_PROFILE_READABLE='1'`,
`LAB_STRESS_CASE='mixed-max'`, `LAB_STRESS_SKIP='210'`, `LAB_STRESS_FRAMES='60'`,
then run `node scripts/profile-lab-stress-browser.mjs .local/rapier-max.cpuprofile`.
Readable profiles are unminified and diagnostic; use repeated uninstrumented
benchmark arms for FPS claims. [Recorded decision and results](jumping-performance.md).

## Rejected chain tension experiment

`LAB_STRESS_COMPARE_ROPE_ALGORITHM=1` selects the frozen dual-mode kernel in
[`tests/fixtures/jumping/lab-rope-chain-probe`](../tests/fixtures/jumping/lab-rope-chain-probe/).
The `ordered` and `chain` arms use that same binary, bundle, Matter props and
selected active-solver setting. The shipped kernel and source remain unchanged;
this experiment has no playable URL flag. Its changed trajectories are recorded,
not accepted as exact parity.

```powershell
$env:LAB_STRESS_COMPARE_PROPS='0'
$env:LAB_STRESS_RAPIER_ROPES='0'
$env:LAB_STRESS_COMPARE_ROPE_ALGORITHM='1'
$env:LAB_STRESS_SOLVER='active'
$env:LAB_STRESS_CASES='mixed-medium,mixed-max'
$env:LAB_STRESS_WARMUP='30'
$env:LAB_STRESS_FRAMES='300'
$env:LAB_STRESS_EPISODES='3'
node scripts/benchmark-lab-stress.mjs .local/lab-rope-chain-guarded.json
```

The expected result is a **nonzero exit** after all twelve arms are saved: local
stretch, total stretch and solid-crossing gates reject the candidate. Reports
retain `measurementsComplete: true`, `complete: false`, and `qualityFailures`.
Quality checks cover anchors within 0.001 units, local stretch below 10%, total
arc stretch below 2%, and zero blocked path legs, including corner bends. Checks
also record the reference and distinguish terrain, mechanism and prop contacts.
The extreme reference has unresolved contacts with dynamically intruding props;
the candidate does not solve that limitation. See the [recorded decision](jumping-performance.md).

`chainStats` contains attempts, chain passes, original pass budget, attempts
reaching the budget, and ordered retries. Rejected chain outputs rerun the old
solver from the same input packet. Chain-pass counts exclude that retry cost.
The eight numerical checks run with
`node --test tests/jumping-rope-chain.test.mjs`; these narrow checks do not
override the rejected mixed-scene gates or claim a manual feel review.

The archived Cargo crate can be rebuilt with a Rust toolchain containing
`wasm32-unknown-unknown`, without replacing production assets:

```powershell
cargo build --locked --release --target wasm32-unknown-unknown `
  --manifest-path tests/fixtures/jumping/lab-rope-chain-probe/Cargo.toml `
  --target-dir .local/lab-rope-chain-rebuild
```

Use `LAB_STRESS_WASM` to select the rebuilt `lab_rope.wasm` for a fresh run. The
committed fixture and build hashes identify the actually measured binary; a
different toolchain/path may produce a different binary hash. Clear these
environment variables before reproducing other modes.

## Workloads

The layout and object prototypes live in
[`tests/fixtures/jumping/lab-stress.json`](../tests/fixtures/jumping/lab-stress.json).
Every generated case passes the runtime level schema and current authoring
limits. These are numerical fixtures, not published challenges: their medal
times are placeholders and no route or enjoyment review is claimed.

| Family | Population / motion |
| --- | --- |
| Free ropes | 1, 8, 24, 40 initially swinging ropes |
| Rope contacts | 8, 24, 40 ropes beside eight narrow walls |
| Lights | 1, 4, 8, 16 lights with 48 terrain blockers |
| Moving lights | 16 lights, 48 blockers, 16 moving props, six lifts, scrolling camera |
| Props | 8, 40, 80 boxes/balls with initial velocities |
| Mixed medium | 16 ropes, eight lights, 40 props, four lifts, walls, scrolling camera |
| Mixed maximum | 40 ropes, 16 lights, 80 props, six lifts, walls, scrolling camera |

Ropes have 65 segments and 520 units of material. The player remains unattached;
the historical Spelunk replay separately covers actual controls, attached ropes,
switches and completion. Props use a supported low-gravity field to prolong
motion. Lifts have staggered starts. Activity counters report how many objects
continue moving throughout each measured window; settled scenes cannot silently
be presented as fully active stress results. Offscreen active objects simulate.

## Method and report

Defaults are 1280×800 CSS pixels at DPR 1, 30 warmup frames, 300 measured frames,
and three fresh episodes per backend. Backend order alternates. Each arm reloads
the page, resetting module caches, Matter IDs and renderer state. Installation,
level construction and initial settling happen before timing. Lighting stays at
full quality with adaptive reduction disabled; the production memory budget
still applies, and the report records actual backing dimensions and pixel ratio.

The five-second default captures late contact-heavy periods that short runs
missed. Historical reports retain their original explicit window lengths.

Each real animation callback advances exactly two 120 Hz simulation ticks and
submits one rendered frame. This makes workloads identical even when one arm
is slow. It measures capacity and presentation pacing, rather than the app's
wall-clock catch-up policy. A saturated real game may do additional catch-up
work. React menus, accounts, saves, audio and input latency are excluded.

The report retains raw simulation CPU, draw-submission CPU and animation-frame
intervals, plus p50/p95/p99, missed-frame counts, object activity, renderer backend,
estimated buffers and executed Wasm steps. RAF intervals include browser/GPU
scheduling and presentation. CPU draw spans do **not** time asynchronous GPU
execution. The trailing callback observes the final measured frame. Summary
tables use the median of episode statistics; p95 means 95% of sampled values
were at or below that time.

Machine/browser/GPU details and fixture, bundle and binary hashes identify the
measured build. Both arms must retain the same renderer and backing size. The
final player, prop, rope node/bend and mechanism state must agree within 1e-6
world units before timings are accepted. Reports also record exact hash equality.
This parity rule applies to the original and exact-optimization modes. Alternative
prop/rope model probes record drift and apply their separate mechanical gates.
An error, hidden page, unexpected Wasm fallback or required-parity divergence invalidates the run;
partial checkpoint reports have `complete: false`.

## Selecting runs

PowerShell example for a longer targeted comparison:

```powershell
$env:LAB_STRESS_CASES = 'ropes-contact-40,mixed-medium'
$env:LAB_STRESS_FRAMES = '300'
npm run benchmark:lab-stress -- .local/lab-stress-long.json
Remove-Item Env:LAB_STRESS_CASES, Env:LAB_STRESS_FRAMES
```

Other controls are `LAB_STRESS_WARMUP`, `LAB_STRESS_EPISODES`,
`LAB_STRESS_WIDTH`, `LAB_STRESS_HEIGHT`, `LAB_STRESS_DPR`, and
`LAB_STRESS_BROWSER` (installed Playwright channel). `LAB_STRESS_GPU=0` permits
a software diagnostic; such a run is unsuitable for hardware FPS claims.

`LAB_STRESS_WASM` selects an archived compatible binary for a fresh before/after
comparison; the report hashes the binary actually copied into the browser
bundle. The level JSON and simulation/rendering workload stay unchanged.
`LAB_STRESS_COMPARE_WASM` instead alternates that reference against the current
kernel, enabling Wasm in both arms and labeling them `before` / `optimized`.
It applies the same outcome and rendering checks. The original ABI 2 source,
binary and build-hash record are frozen in the test fixtures for reproduction:

```powershell
$env:LAB_STRESS_COMPARE_WASM = 'tests/fixtures/jumping/lab-rope-contact-reference.wasm'
$env:LAB_STRESS_FRAMES = '90'
npm run benchmark:lab-stress -- .local/contact-comparison.json
Remove-Item Env:LAB_STRESS_COMPARE_WASM, Env:LAB_STRESS_FRAMES
```

For the prop correction cache, `LAB_STRESS_COMPARE_COLLISION_QUERIES=1` builds
two production bundles from the same current source graph. The reference removes
only the per-step `CollisionQueries` allocation and changes its two call sites
back to `Matter.Query.collides`. Both arms execute the same Wasm binary. This
keeps the original collision predicates, corrections and query ordering available
for a repeatable comparison without replacing working source files:

```powershell
$env:LAB_STRESS_COMPARE_COLLISION_QUERIES = '1'
$env:LAB_STRESS_CASES = 'props-80,mixed-medium,mixed-max'
$env:LAB_STRESS_FRAMES = '300'
npm run benchmark:lab-stress -- .local/collision-comparison.json
Remove-Item Env:LAB_STRESS_COMPARE_COLLISION_QUERIES, Env:LAB_STRESS_CASES, Env:LAB_STRESS_FRAMES
```

`LAB_STRESS_COMPARE_BUILD` instead accepts an immutable previously compiled
benchmark directory containing `index.html`, its referenced assets, and
`lab-rope.wasm`. Copy `.local/lab-stress-build` after a completed baseline run
before changing code; the runner rebuilds that working output directory. Bundle
comparisons report hashes of the HTML and referenced JavaScript, and both binary
hashes. Select only one reference mode. The older historical reports hashed only
the entry HTML in `bundleHash`.

The report separately records Wasm linear-memory bytes. Renderer buffer estimates
exclude that memory and the JavaScript heap.

The selective solver is chosen with `LAB_STRESS_SOLVER=active`.
`LAB_STRESS_COMPARE_SOLVER=1` compares it against the disabled mode in the same
compiled source graph and Wasm binary, using `before` / `optimized` labels.
`LAB_STRESS_COMPARE_BUILD` can instead compare a frozen earlier implementation,
including its captured binary. The recorded final selective-solver run uses
that frozen reference. These exact-optimization modes retain the exact state checks:

```powershell
$env:LAB_STRESS_SOLVER = 'active'
$env:LAB_STRESS_COMPARE_SOLVER = '1'
$env:LAB_STRESS_CASES = 'props-80,mixed-medium,mixed-max'
npm run benchmark:lab-stress -- .local/selective-comparison.json
Remove-Item Env:LAB_STRESS_SOLVER, Env:LAB_STRESS_COMPARE_SOLVER, Env:LAB_STRESS_CASES
```

Experimental rows retain `solverStats` for prop scheduling and rope checks.
These counters cover warmup plus measured ticks. Percent skipped is a work count,
not a CPU percentage; a skipped empty/bounds/slack check can be far cheaper than
a remaining collision correction. The experimental browser URL is
`/untitled-jumping-game?labRopes=wasm&labSolver=active`.

Run existing physics/replay regressions with the flag preloaded using
`node --import ./tests/helpers/lab-active-solver.mjs --test <test files>`.
The separate active-solver tests explicitly alternate enabled/disabled modes
and compare every tick through the medium scene's sustained slow period.

For simulation attribution, run `npm run profile:lab-stress -- .local/mixed.cpuprofile`.
`LAB_STRESS_CASE` selects one scenario, `LAB_ROPE_BACKEND` selects TypeScript or
Wasm, `LAB_STRESS_SKIP` selects the starting frame (default 30), and
`LAB_STRESS_FRAMES` selects the window. The Node CPU profile advances
the same fixed workload before sampling and retains JavaScript/Wasm function
samples. It excludes rendering and profiling perturbs execution, so use the
uninstrumented browser runner for performance claims.

`npm run profile:lab-stress-browser` samples the actual production engine and
hardware renderer in Edge. It advances the same scene and scrolling camera from
a fresh start before enabling the sampler at the requested absolute frame. The
slow sustained maximum window is frames 210–269; the repeatable medium spike is
frames 150–209. Defaults are maximum / start 210 / 60 frames:

```powershell
$env:LAB_STRESS_CASE = 'mixed-max'
$env:LAB_STRESS_SKIP = '210'
$env:LAB_STRESS_FRAMES = '60'
npm run profile:lab-stress-browser -- .local/max-production.cpuprofile
$env:LAB_STRESS_PROFILE_PHASES = '1'
npm run profile:lab-stress-browser -- .local/max-phases.cpuprofile
Remove-Item Env:LAB_STRESS_CASE, Env:LAB_STRESS_SKIP, Env:LAB_STRESS_FRAMES, Env:LAB_STRESS_PROFILE_PHASES
```

The phase option builds a separate kernel under `.local` with named constraint,
node-contact, span-contact and recovery helpers whose inlining is disabled.
It preserves operation order and pass counts; it never replaces the production
source, binary or build record. Treat all profile timings as diagnostic only.
Percentages are shares of sampler observations, including idle/scheduling.
Use normal, uninstrumented matched runs for FPS or tail-latency claims.

Interpret small light-only/prop-only differences as controls: the Rust rope
kernel executes no steps in those cases. Repeated large rope gains establish
the value of this boundary. They do not establish that larger limits are ready
to ship, that packed mixed scenes are playable, or that lighting benefits from
a Rust physics port. Repeat on other hardware and real gameplay before changing
defaults or authoring limits. See the recorded
[performance results](jumping-performance.md#october-12-2026-browser-stress-matrix).
