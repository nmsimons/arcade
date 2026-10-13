# LAB Rust/Wasm rope prototype

The `codex/lab-rust-prototype` branch introduces an opt-in Rust kernel for awake
ropes that are not attached to the player. Its purpose is to measure whether
larger rope populations can retain the existing physics and visual quality.
Many ropes, lights and physics objects are the longer-term scaling direction;
this experiment does not raise authoring limits or change solver iterations.

## Try it

Run the app normally, then open `/untitled-jumping-game?labRopes=wasm`.
The selection applies to that LAB session, including subsequently selected
levels. Reload without the query to return to TypeScript. The same query works
in the desktop application's `arcade://game/` URL. This remains opt-in.

When the query is present, `window.labRopeWasm.status()` exposes installation,
enablement, executed Wasm steps and failures for development and acceptance
checks. A failed fetch/compile leaves TypeScript active. A kernel trap or invalid
result disables the experiment before copying any rope state back, and the
original solver handles that same tick. Missing binaries do not block play.

The player-attached rope always uses TypeScript, including body correction,
wall bracing, climbing and transfer rules. This first boundary concentrates on
the many other ropes in a large scene, rather than rewriting player movement.

## Implementation and builds

`native/lab-rope` is a dependency-free Rust crate targeting
`wasm32-unknown-unknown`. The module uses `f64`, the original segment resolution,
pass count and constraint ordering, complete-span contacts, corner bends and
the last-clear-configuration recovery. The JavaScript adapter retains broad
phase selection, sleeping/waking and per-particle gravity-field sampling.
Offscreen active ropes still simulate.

### Selective solver experiment

Add `&labSolver=active` to the Wasm URL to enable the separate selective-work
prototype. It remains opt-in; this is not the default solver or a 60 FPS mode.
`window.labSolverExperiment.status()` reports prop queries, skips and mutations.
`window.labRopeWasm.status()` adds `active` and four `activeStats` counters:
constraint visits/skips, then node-contact visits/skips. These counts include
cheap checks and cannot be interpreted directly as CPU savings.

Props retain the original ordered sweeps. A per-step dirty set reactivates a
query when its own hull changes or a moved collider's old/new bounds overlap it.
Tracked revisions replace repeated coordinate scans during this synchronous
epoch. Every translate, actor/robot hull change and float-switch projection in
that epoch must be reported; other cache callers continue exact coordinate
checking. Player/robot displacement and final support queries remain live.

Rope memoization is confined to a single solve, whose terrain is immutable.
Identical inputs reuse identical outputs. A slack constraint can also skip work
inside a conservative square certified by Manhattan distance. Outside-contact
regions use expanded bounds or nearest-boundary distance with wide numerical
margins and coordinate guards. A point leaving its region resumes the original
query. Region hits preserve the current coordinates. There are no reduced pass
counts, tolerances for changed outputs, dropped objects, or offscreen culling.
See the [measured results](jumping-performance.md) before drawing conclusions.

The kernel imports no JavaScript functions. A reusable, bounded workspace holds
nodes, saved configurations and prepared terrain edges. The adapter packs live
state once per awake rope tick and copies the result back for rendering and
player acquisition. Terrain outlines invalidate cached edges when coordinates
or vertices change. Transfers, packet validation and geometry preparation are
included in benchmarks; this is not yet a simulation with permanent Wasm
ownership or a worker pool.

The contact optimization adds conservative edge bounds, a nearest-edge bounding
tree for large hulls, binned ray candidates, and prepared convex corners. Exact
projection, contact and tie predicates still decide the result. Collider order,
constraint passes, rope resolution, forces and final-clear recovery stay the
same. A scene-wide spatial-index experiment added overhead in profiling and was
removed.

Large hulls retain nearest-face hints by local region rather than one hint shared
by contacts on opposite sides. A gated convex-face certificate handles points
projected strictly inside an unambiguous supporting face; vertices, near-boundary
contacts, distances over four units, flat/tiny faces, extreme coordinates and concave outlines retain the
complete query. The existing distance/tie calculations decide all other cases.

Prepared hulls are shared across rope calls by a geometry hash followed by an
exact coordinate check. A FIFO bounds retained geometry to 256 shapes and
16,384 vertices; changing and edited outlines receive new preparations. The
current terrain and packet workspaces are separate from that cache budget.
`window.labRopeWasm.status().memoryBytes` reports Wasm linear memory, which is
also recorded by the stress runner. It includes scratch/cache storage and grows
without shrinking; it is not a measurement of total process or JavaScript memory.

Install Rust and its Wasm standard library target, then run:

```sh
rustup target add wasm32-unknown-unknown
npm run build:lab-rope
npm run test:lab-rope
npm run build
```

The initial build used Rust 1.99.0. `LAB_CARGO` can select a Cargo executable;
otherwise the script uses an isolated `.local/cargo/bin/cargo.exe` if present,
or Cargo on PATH. Local Rust installation/cache directories and Cargo targets
are ignored. The Wasm binary and a source/artifact hash record live in `public/wasm`,
so ordinary web/desktop builds and tests do not require Rust. The unit suite
checks normalized text-source hashes and the binary hash to catch stale builds.
Rebuild the artifact whenever Rust source or Cargo configuration changes.

Web and desktop CSP permit Wasm compilation with `wasm-unsafe-eval`; JavaScript
`unsafe-eval` remains disallowed. The module is loaded from the application's
own assets and works with a deployment base path.

## Measurements and acceptance

The [browser stress matrix](jumping-stress.md) measures rope scaling, lights,
moving occluders, props and combined scenes using the production engine and
renderer. It retains actual frame intervals as well as simulation/draw CPU
spans, activity counters, GPU metadata and matched outcome hashes. Use those
results to judge visible gains; the earlier Node measurements isolate CPU work.

Run measurements sequentially with interactive games, builds and tests stopped:

```sh
npm run benchmark:lab-rope -- .local/rope-scaling.json
npm run benchmark:lab-stress -- .local/browser-stress.json
node scripts/benchmark-jumping-spelunk.mjs .local/spelunk-typescript.json
```

For the Wasm replay in PowerShell:

```powershell
$env:LAB_ROPE_BACKEND = 'wasm'
node scripts/benchmark-jumping-spelunk.mjs .local/spelunk-wasm.json
Remove-Item Env:LAB_ROPE_BACKEND
```

The scaling runner defaults to 1, 8, 32 and 64 active 760-unit ropes with 95
segments, in free swings and beside narrow walls. It measures two 120 Hz ticks
per sample after 30 warmup frames, with 120 measured frames per episode and
three episodes. Backend order alternates. Reports retain raw episode statistics
and compare the final trajectories and bend presence. `LAB_ROPE_COUNTS`,
`LAB_ROPE_CONTACTS` (`all`, `free`, `wall`), `LAB_ROPE_FRAMES` and
`LAB_ROPE_EPISODES` select other workloads. These are numerical stress fixtures,
not reviewed playable levels.

The Spelunk benchmark now advances the entrance animation before applying its
recording, matching the existing medal-test helper. That resolves its prior
completion assertion without changing the recording or game physics.

Parity checks cover free swings, partial final segments, long ropes, wall and
corner contacts, concave outlines, moving/in-place edited terrain, removed
obstacles, switched/inverted gravity, sleeping/waking, workspace growth,
loaded-rope fallback and recovery from adapter failure. A full historical
Spelunk replay compares player/rope trajectories and mechanisms, then checks
completion, Gold, coins and clock. The comparison tolerance is 1e-6 world units;
cross-runtime bitwise identity is not promised.

The combined stress fixture exposed a numerical parity bug in the first kernel:
Rust's library norm rounded differently from the existing `Math.hypot` in a
nearest-face tie. That tiny difference changed a contact choice and grew into a
different trajectory. ABI 2 preserves the tested JavaScript arithmetic order;
installation probes representative inputs and declines the experiment if the
host runtime disagrees. The mixed contact regression compares every tick rather
than merely its final state. No tolerance was widened to accept the divergence.

Production browser checks use ordinary keyboard controls to acquire and release
a rope, verify actual Wasm steps under the shipped CSP, and exercise missing
assets and incompatible host arithmetic. Desktop acceptance checks load the
backend from installed app assets.
CPU-only results exclude rendering, GPU completion, browser scheduling and input
latency. They cannot establish a whole-game FPS target or level enjoyment.

Validation on this branch after the contact optimization: 22 focused rope/stress
unit checks, three production-browser acceptance checks and one desktop
acceptance check passed. Web and desktop builds passed, including TypeScript
checking and built-in level validation. Repository lint passed with the existing
`.tmp` checkouts and native build output excluded. The broader Node run passed
2,449 checks; two file-security checks failed because Windows denied creation
of file symlinks (`EPERM`). Those permissions failures were not bypassed or
changed into skipped checks.

## Next boundaries

Use the measured benefit to decide whether to move attached-rope body contacts
and shared collision geometry into the kernel. That requires preserving gait,
grip transitions, contact normals, gravity turns and dynamic props; callbacks
inside each constraint pass would weaken the benefit.

For many lights, profile the existing GPU light field and moving-occluder
preparation separately. A Rust port of CPU geometry cannot remove GPU fill and
shadow-composition costs. For many loose props, measure Matter broad phase,
contacts and allocations before considering a separate solver. Preserve the
current mass, friction, switches, mechanisms and saves in every comparison.
