# LAB performance notes

## October 13, 2026: Escapade tower catches

Falling into the tower lips spends most of its CPU time fitting the visible
limbs around concave terrain. In a catch-window profile, repeated palm-contour
queries and bend attempts dominated; player movement itself was inexpensive.
Elbow alternatives often leave the same palm unchanged. The limb solver now
reuses that exact palm query within its read-only solve and rejects common
blocked root/end caps or fixed-angle palms before trying 33 bend planes.
Contour detail, candidate order and collision tolerances are preserved.

The [CPU comparison](performance/2026-10-13-escapade-catches.json) uses Node
24.14.1 on Snapdragon X Elite and the same authored Escapade terrain for both
arms, comparing `6261cfa` with the change. It starts ordinary and prone falls at
35 exposed tower lips, runs 40 ticks per fall, warms all cases once and measures
three repetitions (8,400 samples per arm):

| Pose CPU time | Before | After |
| --- | ---: | ---: |
| Mean | 1.33 ms | 0.72 ms |
| p95 | 6.41 ms | 2.47 ms |
| p99 | 14.65 ms | 4.56 ms |
| Maximum | 31.50 ms | 27.96 ms |

All 70 falls catch their lip. The 2,800 sampled physics states and catch poses
match exactly between arms. Occasional high outliers remain; this is a CPU
diagnostic with static terrain, excluding props, mechanisms, lighting and frame
scheduling. It measures the catch fitting cost rather than whole-game FPS.

The apparent brief arm stretch has a separate cause: a prepared reach rebuilt
an already depth-folded arm from its projected angles at full planar lengths.
That extended the wrist immediately, even at zero contact weight. The reach now
keeps and gradually unfolds its existing depth, retaining the original rig at
zero weight and fixed bone lengths throughout. Mirrored-gravity regressions
check continuous joint movement and read-only drawing.

Four fresh-start production Edge checks preserve the complete authored world,
move only the entrance beside each tower, walk off with Shift, turn toward the
lip, settle into a hang and jump away using normal keyboard controls. All pass.
The focused Node regressions, production build and targeted lint also pass.
These probes do not establish a completed Escapade route or sustained 60 FPS.

Reproduce each CPU arm with
`node scripts/benchmark-jumping-ledge-catches.mjs --reference 6261cfa --output .local/escapade-before.json`
and `node scripts/benchmark-jumping-ledge-catches.mjs --output .local/escapade-after.json`.
Run them sequentially while other builds/tests and interactive previews are idle.
The report records the level/source hashes and retains every tested lip.

## October 13, 2026: Updated pinball spill sequence

The current local pinball file has thirteen balls, a loose box, a gate and a
20-unit-wide chute wall. Standing on the floor button activates the gravity
field; a ball escapes into the main room while the remaining balls collide near
the ceiling. This is a different authored file from the earlier investigation.

The fresh profile still points to simulation: round SAT projections and repeated
geometry fingerprints dominate the slow window. The correction stage now marks
every owned hull write explicitly, including sub-tolerance float-arm corrections.
Other collision-query callers retain full geometry inspection. Round projection
plans evaluate the two vertices surrounding each extremum and reuse scratch
ranges. Contact assembly reuses those exact projections with Matter's existing
support finder and original axis/ID ordering, eliminating the second vertex scan.
The solver budget, hull detail, sleep rules and object motion are unchanged.

The [spill report](performance/2026-10-13-pinball-spill.json) compares commit
`de5ac32` with these changes in the same current level, using three alternating
fresh pairs, 90 warmup plus 300 measured frames (simulation seconds 1.5–6.5),
1280×800 / DPR 1 and full-quality hardware Edge rendering. Medians:

| Measure | Before | After |
| --- | ---: | ---: |
| FPS | 35.8 | 50.7 |
| Simulation CPU p95 | 46.8 ms | 27.8 ms |
| Frame interval p95 | 50.3 ms | 33.4 ms |
| Frames above 33.83 ms / 300 | 65 | 4 |

All three paired trajectory hashes match exactly; each sequence includes a ball
spilling out of the chute. The baseline varies from 35.6–46.4 FPS, versus
50.6–52.0 after the change. Crowded contacts still miss some 60 Hz frames. These
fixed two-tick measurements exclude the real game's catch-up policy and do not
establish sustained 60 FPS in actual play.

Validation: 160 focused collision, prop, prone, water and traversal checks pass,
as do eight production-browser keyboard fall/catch/recovery checks, including
thin walls in both directions. The production build and targeted lint pass.
A live keyboard check also confirms standing on the current button while a ball
spills into the main room; actual gameplay still has frame spikes.

Reproduce with `ROUND_CONTACT_COMPARE_COMMIT=de5ac32`,
`ROUND_CONTACT_CASES=plate` and `ROUND_CONTACT_WARMUP=90`, then run
`node scripts/benchmark-jumping-round-contacts.mjs "public/levels/jumping/Untitled level 2.jump-level.json" .local/pinball-spill.json`.
Use the same saved level file for both arms; the report records its hash.

## October 13, 2026: Pinball round contacts

The new local `pinball` asset packs nine small balls and a heavy box into an
80-unit gravity shaft. Its slow opening is primarily simulation work: a Node
profile attributed about 75% of self samples to Matter collision detection,
mostly the repeated correction queries and sleeping-support probes. The
64-sided dry ball hulls require many vertex projections per separating axis.

`roundCollision.ts` now locates projection extrema directly for the existing
regular ball polygons. It evaluates their actual world vertices, retains axis
order and ties, and lets Matter create the original normal and support records
on the winning axes. Boxes and terrain retain full projection scans. The same
shortcut serves padded wake/support probes; the per-step collision cache still
requires exactly equal geometry. Hulls, iterations, sleep rules, controls,
lighting and the authored level are unchanged.

The [hardware Edge report](performance/2026-10-13-pinball-round-contacts.json)
contains three fresh alternating pairs per sequence, 30 warmup plus 300 measured
frames for the opening probes. The ascent advances 300 fresh-start frames before
measuring frames 300–599 (simulation seconds 5–10). It activates the adjacent
floor button, enters the shaft with ordinary run/held-jump controls and rises
into the ceiling ball cluster. Snapdragon X Elite / Adreno X1-85, 1280×800 / DPR 1,
GPU lighting at full quality, two 120 Hz ticks per RAF. Medians of episode statistics:

| Opening sequence | Simulation CPU p95 before → after | Frame interval p95 | FPS |
| --- | ---: | ---: | ---: |
| Push into crowded objects | 45.5 → 18.3 ms | 50.0 → 17.5 ms | 47.6 → 58.6 |
| Stand on gravity plate | 21.0 → 8.4 ms | 25.0 → 17.1 ms | 58.3 → 60.0 |
| Gravity-lift ascent | 47.2 → 16.0 ms | 50.1 → 17.0 ms | 34.4 → 59.6 |

Every paired per-frame player/prop/switch/field trajectory hash is identical.
The opening/ascent median counts of frames over 33.83 ms fall from 31/67 to zero
out of 300. These are performance probes, not completed routes. They exclude the
real game's catch-up policy, React, audio and persistence; they establish reduced
contact cost and stutters, not sustained 60 FPS throughout the level.

A separate production-game keyboard check averaged 53.6 FPS with 33.5 ms p95
and 66.5 ms p99 intervals, with no browser errors. It used real wall-clock input
durations, so its trajectory differs from the fixed-step ascent and it did not
reach the top. Catch-up and crowded contacts still produce live frame spikes;
the matched benchmark's near-60 FPS result is not a whole-game guarantee.

Reproduce with
`node scripts/benchmark-jumping-round-contacts.mjs "public/levels/jumping/Untitled level 2.jump-level.json" .local/round-contacts-results.json`.
The asset remains the user's local working file; supply its new path if renamed.
The runner compares the shortcut against Matter's original queries in the same
source graph, verifies hardware graphics and exact trajectories, and saves raw
timings. Stop other builds/tests and pause interactive previews while measuring.

Focused contact, gravity, sleeping, water and existing medal-route checks pass.
The independent medal-catalog coverage check currently fails because the two
new Untitled files have no recording or pending audit. Their routes and medal
times remain unverified. The production build and targeted TypeScript lint pass.

## October 13 cleanup decision

The active app remains in JavaScript. Keep the exact prop collision cache,
unchanged stress workloads, playable development-only stress maps, profiling
tools and these recorded findings. Remove Rust/Wasm, alternate solvers, Rapier,
native build/test tooling and their extra CSP permissions. No 60 FPS improvement
is claimed by this cleanup.

The sections below are a historical investigation log: references to a
"shipped" kernel, experimental flags and old validation counts describe the
build measured at that time. All experiment source, binaries, provenance and
original reproduction commands are preserved in
commit `321d047`.
Use [the current stress guide](jumping-stress.md) for the JavaScript tools and
development level launcher.

### JavaScript cleanup verification

The [fresh JavaScript-only report](performance/2026-10-13-lab-javascript-cleanup.json)
uses one paired episode per mixed case, with the same 30 warmup / 300 measured
frames, fixtures, 1280×800 / DPR 1, full lighting, hardware Edge GPU and two
120 Hz ticks per RAF. Both final trajectory hashes are identical and graphics
settings match. The interactive previews were idle; the earlier attempt after
a desktop-build reload was discarded before accepting measurements.

| Workload | Original queries → cache FPS | Frame interval p95 |
| --- | ---: | ---: |
| Mixed medium | 11.0 → 10.1 | 133.2 → 150.3 ms |
| Mixed maximum | 3.1 → 3.5 | 500.6 → 517.1 ms |

This verifies the cleaned comparison harness and physics parity, **not a new
mixed-scene speedup**. One episode is insufficient to qualify a regression or
gain, and both p95 intervals worsened. The repeated earlier cache measurements
used the native rope path; their mixed-scene FPS must not be presented as
JavaScript-only results. The cache is retained for its repeated prop-only wins
(those controls execute no native rope steps) and exact parity. The current
JavaScript mixed workloads remain expensive and have not been qualified at
60 FPS. Historical native results below retain their original build conditions.

## October 13, 2026: Chain tension solver trial — rejected

**The trial did not make the mixed LAB scenes cheaper while preserving their
mechanical quality.** The shipped Rust source, binary (`e83d8b69…`) and provenance
are restored. The rejected source, binary and build hashes are frozen in
`tests/fixtures/jumping/lab-rope-chain-probe/` at that commit.
The adapter exposes benchmark controls, but there is no playable query flag and
the shipped binary cannot enable this solver.

The [fresh slow-window profile](performance/2026-10-13-lab-rope-chain-before-profile.json)
uses the current Matter prop engine and active rope/prop experiments at maximum
frames 210–270. About 46.2% of samples descend through rope work and 33.2% through
props; constraint passes alone account for 19.3%, versus 9.8% span contacts and
7.5% node contacts. These are diagnostic samples from a readable phase build.
Inclusive ancestry was reprocessed from the same raw profile after fixing the
formatter's early exit at a Rust phase; phase/self counts did not change. The
earlier 69.3% rope finding used the separate Rapier prop model.

The experiment replaces local tension propagation with a simultaneous
tridiagonal chain projection. It uses Newton steps, a bounded active set that
drops compression multipliers, and a four-unit correction line search. It is
informed by [direct position-based chain solvers](https://onlinelibrary.wiley.com/doi/abs/10.1111/cgf.13326),
but is a simpler unilateral particle-chain trial, not that paper's rod model or
its claimed speedup. It retains 8-unit segments, integration, gravity, damping,
ordered node/whole-span contacts, corner bends and final-clear recovery. The
player-loaded rope still uses the original TypeScript solve. A complete contact
cycle can stop early only with stable bends, changes below 0.00001 units and
remaining tension error below 0.0005 units; the original maximum pass budget
remains available. This changes unattached trajectories, so exact parity is not
an acceptance requirement for this mode.

The first [unguarded medium pilot](performance/2026-10-13-lab-rope-chain-pilot-rejected.json)
measured 36.8 → 43.7 FPS, but failed the local-stretch and solid-crossing gates.
That was not an accepted gain. The guarded candidate reruns the ordered solver
from the untouched input packet whenever its final path crosses a solid, local
stretch reaches 10%, or total stretch reaches 2%. A regression checks that a
solid intruding around an anchor restores the exact ordered result for that tick.

The [final guarded report](performance/2026-10-13-lab-rope-chain-guarded-rejected.json)
contains all six planned alternating pairs / twelve arms: 30 warmup plus 300
measured frames, three episodes per mixed case, Edge 155 / Adreno X1-85,
1280×800 / DPR 1, hardware GPU, full-quality lighting and two 120 Hz ticks per RAF.
Both arms use Matter props and `labSolver=active` in the same bundle and frozen
dual-mode kernel (`c73f4825…`). Fixtures and populations are unchanged. Quality
checks occur after timing. Medians of episode statistics:

| Workload | Ordered → guarded chain FPS | Simulation CPU p95 | Frame interval p95 |
| --- | ---: | ---: | ---: |
| Mixed medium | 37.8 → 16.4 | 33.5 → 80.7 ms | 41.6 → 99.9 ms |
| Mixed maximum | 10.0 → 8.2 | 127.3 → 202.3 ms | 133.5 → 216.7 ms |

All paired FPS comparisons were worse. Medium varied substantially: ordered
19.9 / 37.8 / 42.5 FPS, chain 15.2 / 16.4 / 36.3. Maximum was ordered
9.9 / 10.0 / 10.0 versus chain 8.1 / 8.2 / 8.2. Use these paired measurements,
not ratios to earlier runs. Prop, rope and lift activity matched: about 24/40,
16/16 and 1.49/4 in medium; 59/80, 40/40 and 2.06/6 in maximum. States were
repeatable within each mode, but rope trajectories differed between modes.

The chain attempt averaged 39.5 / 37.7 passes out of 72. However, 4,911/10,560
medium rope ticks (46.5%) and 10,955/26,400 maximum ticks (41.5%) also reran the
full ordered solve. Those extra passes are excluded from the chain-pass counter.
Global matrix work and frequent full retries consume the nominal pass savings.
`chainStats` records attempts, chain passes, original budget, attempts reaching
that budget, and ordered retries. Wasm memory also excludes JavaScript heaps.

The new end-state checks expose a limitation in the reference too. Moving props
can invalidate the previous clear configuration: reference medium has 12 blocked
path legs against props, maximum 15; both have zero blocked legs against fixed
terrain or mechanisms. The candidate has 13 / 19 blocked prop legs, also zero
against terrain/mechanisms. Reference/candidate maximum total arc stretch is
3.50% / 7.53%; maximum local stretch is about 160% above rest in both. Thus the
absolute mechanical bars already fail in this extreme reference, and the trial
does not improve those limits. The guard preserves the ordered fallback's
contract for each rejected attempt, not a universal guarantee for dynamically
intruding props. No quality thresholds were widened to accept the trial.

The runner saves all requested arms even when these gates fail, then exits with
an assertion. Its report has `measurementsComplete: true`, `complete: false`
and explicit `qualityFailures`. These are rejected-candidate timings, not an
accepted performance improvement or proof that all rope algorithms must fail.

Free-swing peaks differed by at most 3.1%, and first-return timing by one/two
120 Hz ticks over five seconds for 240/760-unit ropes. The eight focused checks
cover those bounds, wall/corner clearance, exact loaded-rope behavior, catch/drop,
guard restoration, frozen provenance and safe refusal by the shipped kernel.
They do not qualify crowded contacts or establish subjective feel. The result
points to joint tension/contact resolution around moving props as the remaining
problem; fast tension propagation alone is insufficient. See
[reproduction](jumping-stress.md). No level layout or normal gameplay is changed.

Validation after archiving: all 26 focused probe/original-kernel tests passed,
including the historical Spelunk replay. Targeted lint and the production build
passed; the build validated 28 built-in levels. All four production-browser
checks passed (baseline/active release under CSP, missing binary, incompatible
arithmetic). Two short original-mode controls retained identical trajectory
hashes, and one free-rope archive control exercised the frozen chain binary with
zero retries and passed its quality gates. Short controls verify reproduction;
they do not supersede the rejected sustained mixed-scene measurements.

## October 13, 2026: Native-physics go/no-go investigation

**Recommendation: retain JavaScript as the app codebase; do not commit to a full
Rust rewrite on this evidence.** The accepted collision-cache improvement stays.
The existing Rust rope kernel remains an optional experiment. The current dense
mixed-scene limits remain real; this investigation did not establish sustained
60 FPS at those populations.

The user accepted small loose-object trajectory changes while retaining controls,
mechanics and overall feel. That allowed an algorithm comparison instead of
requiring bit-identical output. A benchmark-only Rapier 0.21.0 Rust/Wasm probe
replaces the ordinary prop solve. The real mechanism planner, player controller,
renderer, and optimized Rust rope solve continue. Production gameplay never
imports these probes. Direct player contacts, grabs, robots, inverted players,
water and float switches use the established prop boundary; this is a capacity
probe, not completed gameplay integration. No fallback occurred in the recorded
dense comparison arms.

The [final report](performance/2026-10-13-lab-rapier-long.json) contains three
alternating fresh pairs per case: 30 warmup + 300 measured frames, Edge 155,
Adreno X1-85, 1280×800 / DPR 1, full-quality lighting and two 120 Hz ticks per RAF.
The current comparison arm enables both existing opt-in experiments; this is not
a comparison with the unflagged TypeScript default. All arms share one bundle
and custom rope binary (`e83d8b69…`). Tables use medians of episode statistics.

| Workload | Current best → Rapier props FPS | Simulation CPU p95 | Combined CPU p95 |
| --- | ---: | ---: | ---: |
| 80 props | 17.5 → 60.3 | 150.8 → 7.3 ms | 152.5 → 9.3 ms |
| Mixed medium | 41.4 → 31.2 | 25.7 → 41.2 ms | 29.0 → 48.2 ms |
| Mixed maximum | 9.8 → 11.8 | 133.3 → 123.9 ms | 146.6 → 134.7 ms |

The prop-only gain is substantial, but it did not transfer to the mixed scenes.
Medium became about 24% slower by these medians; maximum gained about 21%, still
far below the previous 2× bar and 60 FPS. Maximum frame p95 was 150.1 → 134.0 ms.
Variation matters: the three medium pairs were 25.9→31.8, 41.4→31.2 and 41.9→31.1
FPS; maximum was 9.6→11.4, 9.8→11.8 and 10.1→18.9. Do not select the last maximum
episode as the result or compare today's medians with yesterday's runs.

Rapier uses true circles, f32 state in a 100-unit/metre scale, twelve solver
iterations with two internal PGS iterations, CCD, and hard contact settings.
Immovable kinematic hulls retain infinite-mass terrain and the existing mechanism
planner's cargo positions; both current and next native poses are set together,
avoiding a second carrying velocity. All native props are kept awake. Native
average moving populations were 77/80, 32/40 and 70/80, versus 59/80, 24/40 and
59/80 in the reference. Changed contact trajectories create a different rope
workload despite identical populations and inputs. These are whole-scene capacity
results for the alternative model, not a pure language speed comparison.

Every final native residual overlap was below the declared 0.5-unit crowded-scene
gate (0.311 / 0.331 / 0.015 units by case). Separate stacked-box, fast-ball thin-wall
and cargo tests require less than 0.15-unit penetration. Sleeping did not supply
the speedup. The report's `wasmMemoryBytes` covers only the custom rope kernel;
Rapier's additional memory is excluded. Fixture hashes match the previous stress
fixtures, and the bundle hash also fingerprints the embedded Rapier module.

The [slow-window profile](performance/2026-10-13-lab-rapier-max-profile.json) samples
maximum frames 210–270 after the prop substitution. About 69.3% of samples descend
through `stepRope`, 59.8% through its Rust/Wasm adapter, and 6.0% through the prop
step. Its readable diagnostic build is unminified; these are inclusive sampling
observations, not production timing fractions to add together. The limiting
rope work is already native Rust code. Translating remaining JavaScript alone
does not remove that algorithmic cost.

A separate batched Rapier soft-rope trial kept the same 8-unit particles, fixed
anchors, per-particle gravity sampling, tension-only edges and whole-surface
contacts. It disabled sleeping and rope-to-rope collisions, with lower rope
dominance to preserve one-way prop contact. The first budget failed the local
stretch gate. Raising edge stiffness and internal iterations produced a
[rejected medium pair](performance/2026-10-13-lab-rapier-rope-rejected.json): current
29.3 FPS versus candidate 12.9 FPS, 0.552-unit prop overlap, 15.2% local rope
stretch, and **four rope spans crossing solids**. Total rope stretch and anchor
drift were small, showing why those checks alone are insufficient. The report is
intentionally incomplete and the runner rejected it. Its timing is not an
accepted improvement. A simple static-wall rope test passed, but did not qualify
the crowded model.

This tests Rust/Wasm solver substitutions under the current renderer, not a
fully native desktop executable or a parallel engine/renderer redesign. Such a
redesign could produce different results, but would need its own successful
vertical slice before justifying a rewrite. The current evidence supports
keeping the JavaScript app and practical authored workloads. A separate prop-only
game or workload could justify Rapier; it does not justify integrating this
partial backend into LAB now. No replacement is enabled in normal gameplay.

All five focused probe tests passed, covering stack support, thin-wall CCD, cargo
positions, guarded legacy interactions, and static-wall rope clearance. Targeted
lint and the production TypeScript/Vite build passed; the build validated all 28
built-in levels. Probe identifiers are absent from the production JavaScript.
The original TypeScript/Wasm mode also passed two short parity controls (eight
ropes and eight props), with identical trajectory hashes. These short controls
verify harness compatibility, not sustained performance. The crowded soft-rope
model remains rejected regardless of the narrower test pass.
See [reproduction](jumping-stress.md) for the benchmark-only flags and limits.

## October 12, 2026: Selective solver experiment

The separate `labSolver=active` prototype tests whether revisiting only affected
work can double sustained mixed-scene FPS. Prop corrections track hull mutations
and reactivate queries overlapping either the old or new bounds. Rope constraints
and node contacts reuse exactly unchanged outcomes; conservative slack and
outside-contact regions also exclude movements that cannot change the result.
The original correction order, fixed steps, pass counts, sleep/wake policy,
segment resolution, terrain and lighting remain. This is an opt-in experiment.

An initial exact-input version gained only 10–13% in single long pairs. Its rope
inputs often changed by tiny amounts, so conservative regions were added with
wide numerical margins and coordinate guards. The final candidate was then
compared with the frozen implementation from before this experiment, including
its `c51cc273…` kernel. The candidate binary is `e83d8b69…`.

The [repeated long report](performance/2026-10-12-lab-active-long.json) contains
three alternating fresh pairs per case, 30 warmup + 300 measured frames,
Edge 155 / Adreno X1-85 at 1280×800 / DPR 1, full-quality lighting and two 120 Hz
ticks per RAF. Tables are medians of episode statistics:

| Workload | Before → selective FPS | Simulation CPU p95 | Combined CPU p95 |
| --- | ---: | ---: | ---: |
| 80 props | 13.6 → 15.8 | 176.8 → 167.2 ms | 179.3 → 168.8 ms |
| Mixed medium | 25.8 → 28.9 | 45.0 → 40.5 ms | 50.5 → 47.4 ms |
| Mixed maximum | 8.1 → 10.1 | 144.6 → 134.8 ms | 156.7 → 146.6 ms |

All nine long pairs had exactly identical final physics state. This is about
12% more medium FPS and 24% more maximum FPS, **well below the 2× success bar**.
Maximum simulation p95 improved only 7%. Its remaining CPU p95 spans nearly
nine 16.7 ms budgets. This does not establish a credible near-term 60 FPS path.

Counters were identical across repetitions: the scheduler skipped 72% / 82% of
medium/maximum prop correction queries, 91% / 89% of node-contact checks, but
only 12% of local constraint checks. High skip counts did not translate into
similar CPU savings. Cheap empty/bounds/slack checks were removed; remaining
changing contacts and constraints still dominate. There are no reduced physics
budgets behind the timing gains.

The [17-case coverage report](performance/2026-10-12-lab-active-coverage.json)
adds 17 exact matched pairs, for 26 accepted pairs / 52 arms across both reports.
Short-window results varied: 40 free ropes slowed from 49.1 to 42.9 FPS, wall
ropes from 44.4 to 40.8, and short mixed maximum from 7.9 to 7.4. These are single
pairs, not established regression medians, but show that the bookkeeping can
cost more than it saves in some workloads. Do not promote this flag to default.

Object activity matched the earlier runs: medium averaged 24/40 moving props,
16/16 ropes and 1.49/4 lifts; maximum 59/80 props, nearly 40/40 ropes and 2.06/6
lifts. The mixed Wasm-memory figures stayed around 3.3 MiB; this excludes extra
JavaScript scheduler state. Follow the [experiment and reproduction instructions](jumping-stress.md).
Keep the prototype for inspection, stop expanding this direction on the present
evidence, and retain the prior exact collision-cache optimization as the default.

All **1,074 physics regressions across 69 files passed with the experimental flag
preloaded**, including built-in medal replays, loaded ropes and grab/release,
stretch/contact/clearance checks, sleep/wake, props, robots, elevators and water.
The added test also compares every tick of the medium workload through its slow
period. TypeScript and lint passed, excluding pre-existing `.tmp` checkouts and
native build output. The production build validated all 26 built-in levels, and
all four production browser checks passed: baseline and active rope release
under CSP, missing-Wasm fallback, and incompatible-arithmetic fallback. Exact
state matches are stronger than relaxing trajectory tolerances to accept this
experiment.

## October 12, 2026: Sustained-frame investigation and prop queries

The slow periods repeat at fixed simulation times. In the existing 300-frame
reports, medium spikes around absolute frames 150–200 and maximum stays slow
around frames 210–270. Sampling those windows changed the diagnosis: the maximum
production-kernel profile put **63.1% of samples in Matter collision/SAT routines**
and 18.9% in Wasm. The medium phase profile put 46.2% in Matter collision and
29.5% in Wasm. Most collision samples descended from `stepPropPhysics`'s ordered
post-integration correction loop, rather than mechanism construction or the
engine's main collision detector. Recovery was below 0.2% in both phase profiles.

The [maximum production profile summary](performance/2026-10-12-lab-sustained-max-production-profile.json),
[maximum phase summary](performance/2026-10-12-lab-sustained-max-phases-profile.json)
and [medium phase summary](performance/2026-10-12-lab-sustained-medium-phases-profile.json)
retain counts, windows, fixture/binary hashes and sample rankings. Percentages
include idle/scheduling observations and are diagnostic, not uninstrumented
timings. The separate phase kernel inhibits helper inlining without changing
operation order; its maximum outcome hash exactly matched the production kernel.

`CollisionQueries` now reuses a pair's result during one prop correction step
only while both hulls are exactly unchanged. It compares position, every vertex
and axis coordinate (including signed zero), vertex identity, body ID and parent.
Bounds are tested live. Changed geometry runs the original Matter SAT; query
direction and candidate order are retained. Compound bodies and padded probes
use the original traversal. Corrections still read current mass and sleep state.
The cache is discarded each prop substep. This optimization applies to normal
TypeScript sessions too; the Rust source, binary and opt-in policy are unchanged.

A frozen production bundle from immediately before this change was alternated
against the new bundle. Both execute the **same** Rust binary (`c51cc273…`). All
17 unchanged fixtures passed a 30-warmup / 90-frame coverage pair with exactly
identical final physics state. The [coverage report](performance/2026-10-12-lab-collision-coverage.json)
contains 34 measured arms. Its short mixed scenes showed little gain, reinforcing
the need to include the later contact-heavy periods.

The decisive follow-up used 30 warmup + **300 measured frames**, three fresh
alternating pairs per case, Edge 155 / Adreno X1-85, 1280×800 / DPR 1, identical
full-quality lighting and exactly two 120 Hz ticks per animation callback:

| Five-second workload | Before → cached FPS | Simulation CPU p95 | Combined CPU p95 |
| --- | ---: | ---: | ---: |
| 80 props | 7.4 → 14.0 | 299.0 → 178.7 ms | 300.6 → 179.8 ms |
| 16 ropes, eight lights, 40 props, four lifts | 23.5 → 27.4 | 62.2 → 42.0 ms | 67.5 → 48.0 ms |
| 40 ropes, 16 lights, 80 props, six lifts | 6.0 → 9.1 | 259.7 → 138.6 ms | 270.7 → 150.9 ms |

These are medians of episode statistics. The [long-window report](performance/2026-10-12-lab-collision-long.json)
retains every timing sample, both bundle hashes and identical binary hashes.
Every one of its nine pairs had identical final state, for **26 exact matched
pairs across the coverage and repeated long runs**. Episode variation remained
large: cached maximum FPS was 9.1, 14.0 and 8.3; baseline was 5.9, 6.0 and 6.0.
Do not select the fastest episode as the result or compare unrelated runs.

The prop-only long control is important: its short window ran at 60 FPS while
later crowded contacts made it expensive without any ropes. The scene's activity
averaged about 59/80 moving props in both arms; medium averaged 24/40 moving
props and 16/16 moving ropes, and maximum 59/80 props and nearly 40/40 ropes.
Lifts averaged 1.49/4 and 2.06/6 moving. Natural settling is unchanged. Wasm
memory was unchanged at about 3.3 MiB in mixed scenes. JavaScript cache memory
is additional per-substep state and is not measured by that number.

In the [same maximum window after caching](performance/2026-10-12-lab-sustained-max-cached-profile.json),
Matter collision accounted for 11.5% of samples and Wasm 40.5%. Rope node contacts
were 19.5%, constraints 11.8%, span contacts 7.3%, and recovery 0.3%. The remaining
prop loop and exact geometry checks were also substantial. Its final outcome hash
again matched the earlier maximum profiles. The bottleneck has become distributed;
another distance-query adjustment or port of the remaining SAT alone cannot be
assumed to solve it.

This is a useful optimization: maximum average throughput improved about 52%
and its simulation p95 about 47%, with a stronger prop-only benefit. **It does
not establish a near-term path to 60 FPS at maximum density.** Maximum still
needs roughly 6.6× the measured throughput, and its combined CPU p95 is about
nine 16.7 ms frame budgets. Medium needs about 2.2× throughput. Further work
would need substantial reductions in both rope and prop-solver workload, with
lighting/presentation still included. Expanding the native port by itself is
not supported as the next step. Keep the rope prototype opt-in.

The runner now defaults to 300 measured frames. Its original-query reference
mode reconstructs the pre-cache prop module before TypeScript transformation;
the normalized source hash was verified against the frozen baseline. See
[reproduction and profiling](jumping-stress.md). All **1,070 physics regressions**
across 68 files passed, including exact query invalidation/order tests, built-in
medal replays, props, robots, elevators, water, ropes and Wasm parity. TypeScript
and the production build passed, including validation of 26 built-in levels.
All three production-browser checks passed for real rope release, CSP loading
and fallback. Repository lint passed, excluding pre-existing `.tmp` checkouts
and native build output.

## October 12, 2026: Repeated mixed-scene contact optimization

The earlier short-window Edge profile directed this round toward Rust rope solving
and its nearest-face, corner and containment queries. Matter geometry
construction was also visible; rendering was a smaller CPU cost. The kernel now
uses conservative edge/corner bounds, large-hull edge trees, binned ray queries,
regional nearest-face hints, guarded convex-face certificates and bounded shared
hull preparation. It retains the existing resolution, ordered constraints,
pass counts, forces, contacts and clear-configuration recovery. It remains opt-in.

The original, validated ABI 2 source/binary/build record is frozen in the test
fixtures. The runner alternates that reference against the optimized kernel,
with actual Wasm execution in both arms. Immutable binary buffers and per-arm
hashes prevent a rebuild from changing a running comparison. Fixtures, two
120 Hz ticks per RAF, viewport, lighting quality and renderer are identical.
Use these fresh matched comparisons rather than ratios between separate days
or development runs; even the unchanged reference showed substantial variation.

A 17-scenario coverage run used three alternating pairs, 30 warmup + 90 measured
frames, Edge 155.0.4283.45 / Adreno X1-85 at 1280×800 / DPR 1. Every one of its
51 pairs had identical final physics state. Before a final removal of duplicate
bounds checks, the short mixed-medium median improved from 31.0 to 36.7 FPS,
and mixed-maximum from 6.3 to 7.9 FPS. The
[coverage report](performance/2026-10-12-lab-contact-coverage.json) retains all
102 arms, raw samples and binary hashes. Small light/prop control differences
cannot be attributed to this kernel: they execute no rope steps.

The **final binary** was then measured over 300 frames (five simulated seconds
after warmup), again with three alternating fresh pairs per scene:

| Longer workload | Original Rust FPS / frame p95 | Optimized Rust FPS / frame p95 |
| --- | ---: | ---: |
| 40 ropes beside walls | 46.0 / 33.5 ms | 44.6 / 33.5 ms |
| 16 ropes, eight lights, 40 props, four lifts | 20.2 / 82.5 ms | 23.1 / 66.9 ms |
| 40 ropes, 16 lights, 80 props, six lifts | 5.4 / 275.0 ms | 5.8 / 267.1 ms |

These are medians of episode statistics. All nine pairs had exactly identical
final state. The [final long-window report](performance/2026-10-12-lab-contact-long.json)
records the current binary hash and every timing sample. Rope activity averaged
16/16 and 39.997/40 in the mixed scenes. Props naturally settled, averaging 24.0/40 and
59.0/80 moving respectively; these are not fully active prop populations for
the entire five-second window. The intended goal of 60 FPS has **not** been met.

The longer medium scene gained about 14% average FPS; maximum gained about 9%.
Neither establishes a large capacity increase. The wall-only control showed no
gain and was about 3% slower in its medians. The medium simulation CPU p95 was
69.2 → 67.7 ms, and maximum was 265.5 → 261.9 ms, while draw submission remained
about 9–15 ms. Average improvements therefore did not resolve the worst simulation
frames. The next investigation should focus on late-window constraint/contact
and clear-configuration recovery work, rather than claim that the initial
distance-query savings solved the mixed-scene bottleneck.

Wasm linear memory in the final mixed runs increased from 1.19–1.25 MiB to
3.25–3.31 MiB. Retained preparations are capped at 256 shapes / 16,384 vertices,
with a regression exercising repeated eviction. Renderer estimates stayed near
32.2 MiB; they exclude Wasm and JavaScript heaps and driver copies. Rust-only
speed ratios cannot establish full-app FPS, input latency, other devices or
enjoyment. [Reproduction and measurement scope](jumping-stress.md) document the
same exclusions as the original stress suite.

## October 12, 2026: Browser stress matrix

The production LAB simulation and full-quality renderer were compared in installed
Edge 155.0.4283.45 on Snapdragon X Elite / Adreno X1-85, Windows ARM64. Hardware
Canvas and compositing were verified. The interactive preview was paused during
measurements. Each of 17 JSON workloads had three fresh matched episodes with
alternating backend order: 30 warmup + 90 measured frames, 1280×800 CSS / DPR 1,
and exactly two 120 Hz ticks per real animation callback. The current ABI 2
binary before the contact optimization was used. No authoring limits or physics iterations changed.

| Workload | TypeScript FPS / frame p95 | Rust/Wasm FPS / frame p95 |
| --- | ---: | ---: |
| Eight free ropes | 60.0 / 16.8 ms | 60.0 / 16.9 ms |
| 40 free ropes | 58.4 / 24.1 ms | 60.0 / 17.1 ms |
| 40 ropes beside walls | 52.4 / 33.3 ms | 60.0 / 16.8 ms |
| 16 lights, 48 static blockers | 52.7 / 33.4 ms | 52.2 / 33.3 ms |
| 16 lights, 16 props, six lifts, scrolling | 44.6 / 33.4 ms | 47.8 / 33.4 ms |
| 80 moving props | 60.0 / 16.8 ms | 60.0 / 16.8 ms |
| 16 ropes, eight lights, 40 props, four lifts | 7.1 / 174.9 ms | 19.5 / 66.8 ms |
| 40 ropes, 16 lights, 80 props, six lifts | 2.1 / 550.0 ms | 6.2 / 183.4 ms |

Values are medians of the three episode statistics, not one pooled percentile.
The [raw report](performance/2026-10-12-lab-browser-stress.json) includes all
102 measured arms, timing arrays, episode variation, activity and build hashes.
Every one of the 51 comparisons had exactly matching final physics state
(maximum drift zero). All ropes kept moving during their measured windows;
the combined scenes averaged 39.8/40 and 79.0/80 moving props respectively.
Lifts pause naturally at their endpoints, so their activity is below the count
present in the scene. All arms retained the GPU renderer and matched backing
dimensions, with approximately 32.2 MiB of estimated renderer buffers.

A follow-up extended the wall-contact and mixed-medium cases to 300 measured
frames (five simulated seconds after warmup), again with three alternating
fresh episodes per backend. All six comparisons were exactly identical:

| Longer workload | TypeScript FPS / simulation p95 | Rust/Wasm FPS / simulation p95 |
| --- | ---: | ---: |
| 40 ropes beside walls | 33.4 / 33.3 ms | 46.6 / 23.4 ms |
| 16 ropes, eight lights, 40 props, four lifts | 10.2 / 143.0 ms | 22.2 / 64.4 ms |

The longer rope case kept all 40 ropes moving, but **neither backend sustained
60 FPS**. Its frame-interval p95 was 34.0/33.6 ms. The mixed case's frame p95
was 150.1/66.9 ms; props naturally settled, averaging 24.0/40 moving over this
window, while all 16 ropes stayed active. Its average FPS should not be treated
as a fully active 40-prop result. The
[long-window report](performance/2026-10-12-lab-browser-stress-long.json)
retains all timing samples and activity. Both windows support a real Rust benefit,
but the short 40-rope result does not establish sustained smooth play.

The rope benefit is clear when the scene runs out of simulation capacity. The
mixed-medium simulation CPU p95 fell from 164.9 to 57.3 ms, while draw submission
p95 stayed at 7.0 ms. At the maximum population it fell from 544.3 to 170.2 ms;
draw submission was 12.6–13.5 ms. Both packed mixed scenes remain too slow for
smooth play, even after the improvement. Shared contacts and moving collision
geometry deserve further profiling before increasing limits.

Light-only and prop-only arms execute **zero** Wasm rope steps: small differences
there are scheduling/run variation, not Rust gains. Sixteen lights lose frames
even with simulation p95 below 1 ms. That points to rendering/presentation as a
separate limitation; this measurement does not identify a specific GPU pass.
The rope kernel cannot resolve it. Eight-ropes-at-60-FPS also explains why a
normal preview can feel unchanged despite lower CPU work.

RAF intervals include browser/GPU scheduling and presentation. Simulation/draw
spans are CPU measurements and exclude asynchronous GPU execution. Fixed ticks
ensure identical workload, rather than exercising the app's wall-clock catch-up
policy; React UI, accounts, audio and input latency are excluded. These short
stress windows demonstrate capacity, not sustained whole-app FPS on all devices.
See [workloads, method and reproduction](jumping-stress.md).

The new mixed-contact workload also found a real numerical bug in the initial
kernel. Different distance rounding changed a nearest-face tie and then the
rope trajectory. ABI 2 matches the tested runtime's operation order and refuses
installation if arithmetic probes disagree. A regression checks exact state
on every tick through the formerly failing contact sequence. Divergent timings
were rejected; the comparison tolerance was not relaxed.

## October 12, 2026: Opt-in Rust/Wasm for unattached ropes

The first Rust kernel preserves free-rope integration, tension and complete-span
terrain contacts. Awake ropes not attached to the player can use Wasm; the
attached rope retains the existing TypeScript body/contact path. Load LAB with
`?labRopes=wasm` to try it. See [builds, architecture and acceptance](jumping-rust.md).
Ordinary sessions still use TypeScript.

Sequential measurements on Snapdragon X Elite X1E80100, Windows ARM64,
Node 24.14.1 and a Rust 1.99.0 release Wasm build produced:

These are historical, CPU-only results from the initial ABI 1 prototype. They
predate the mixed-contact rounding correction and are retained as development
evidence, rather than current-binary acceptance. Use the ABI 2 browser results
above for the current comparison.

| Historical Spelunk route, two 120 Hz ticks | TypeScript | Wasm |
| --- | ---: | ---: |
| Simulation CPU average | 8.99 ms | 4.15 ms |
| Simulation CPU p95 | 17.98 ms | 8.06 ms |

The 6,256-tick recording completed with the same Gold, coins and clock. The
player, props, rope nodes, mechanisms and elapsed-time trajectory hash was
identical on this runtime. Each backend had one complete warmup and one measured
fresh-start replay; the substantial tail/scheduling variance limits how broadly
these timing ratios can be applied. Raw reports:
[TypeScript](performance/2026-10-12-lab-spelunk-typescript.json),
[Wasm](performance/2026-10-12-lab-spelunk-wasm.json).

A separate scaling runner used three fresh episodes per backend, alternating
backend order, 30 warmup frames and 120 measured frames per episode. Each frame
advanced two ticks. Every active rope had 95 segments and 760 units of material.
The table reports the median of episode p95 CPU times, including culling,
sleep/wake checks, packing, transfers, result validation and solver work:

| Active ropes / workload | TypeScript p95 | Wasm p95 |
| --- | ---: | ---: |
| 8 / free swings | 5.13 ms | 4.78 ms |
| 32 / free swings | 40.11 ms | 35.95 ms |
| 64 / free swings | 73.80 ms | 72.60 ms |
| 8 / narrow wall contacts | 18.26 ms | 13.06 ms |
| 32 / narrow wall contacts | 66.37 ms | 52.99 ms |
| 64 / narrow wall contacts | 118.59 ms | 94.85 ms |

The final node trajectories were identical in these workloads, and bend presence
matched. The full [scaling report](performance/2026-10-12-lab-rope-scaling.json)
includes 1-rope cases and every episode. These are stress fixtures, not playable
level reviews. They demonstrate stronger benefits in repeated terrain queries
than in simple constraints; they do not establish 60 FPS with 64 long ropes.
All timings exclude rendering, GPU completion, browser scheduling and input.

The prototype remains opt-in. Production browser checks verify loading under
CSP, ordinary keyboard acquisition/release, actual Wasm execution after release
and playable fallback when the binary is missing. Whole-game performance,
additional hardware and attached-rope Wasm integration remain future work.

## October 10, 2026: Terrain inside switch-controlled reservoirs

Water reservoirs keep one scalar height each. Fill and Drain use ordinary switch
inputs; field partitions and exposed ripple spans update at most 30 Hz while
the level changes. Idle pumps and pumps at the low water mark or 100% do not rebuild geometry.
Terrain is subtracted once at world creation into nonoverlapping convex pieces,
then retained as one Canvas clipping path per reservoir. Pumping never repeats
that terrain subtraction or adds contacts, fluid particles, solver iterations,
currents or a volume grid. Surface arrays retain the global 128-point budget
and reuse their buffers while topology stays unchanged. Low performance mode
also skips ripple-geometry rebuilding; fill/drain and baseline buoyancy remain.
Normal/Heavy prop presets scale mass and the cached lifting contribution
inside the existing field-area pass. They add no fluid solver, collision shape
or geometric queries; variant artwork uses a few flat lines and rivets.

Run Vite, then `WATER_RESERVOIRS=1 node scripts/benchmark-jumping-water.mjs`.
The stress fixture has 16 reservoirs, 48 terrain blocks (including slopes and
roofs), 48 floats and 96 cached water-space pieces. Each measured frame advances
two 120 Hz game steps and submits Canvas artwork at 1280×800. After 120 warmup
frames, each configuration measures 240 frames. On Apple M5 Pro with Chromium
153.0.8010.12:

| Reservoirs / effects | Native median / p95 | 4× CPU median / p95 |
| --- | ---: | ---: |
| Static / on | 1.1 / 1.3 ms | 3.2 / 4.9 ms |
| Filling / on | 1.1 / 1.6 ms | 4.2 / 6.3 ms |
| Static / off | 0.8 / 1.1 ms | 3.0 / 4.7 ms |
| Filling / off | 0.9 / 1.2 ms | 3.5 / 5.1 ms |

Filling produced exactly 120 field/surface updates during the 240 measured
frames; static reservoirs produced none. Lighting and GPU completion are
excluded, and simulated 4× CPU throttling is not a measurement of a real slow
device. These timings do not establish whole-game frame rate.

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
monitor** and **Performance mode** controls. Backtick or Escape closes
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
**Performance mode** is enabled by
default in development and production; an explicitly saved off preference is
honored in both builds. It observes two consecutive one-second windows below 35 FPS,
then caps
rendering at pixel ratio 1 and one million pixels. This trades some sharpness for
frame time; the HTML interface retains its native resolution. Terrain
and moving mechanisms still block light; all six authored Tower lights, exposure,
power/fades, haze and object artwork remain. The same reduction stops optional
water-surface physics: entry observation, spring ticks and ripple
forces on floating props. Water uses its original flat fill. Swimming, ordinary
buoyancy, water resistance and splash audio continue normally. Disabling the mode,
restarting, or entering a new level restores resolution and fresh surface effects
without replaying skipped splashes. Level files do not change. The reduction is
latched to avoid oscillating between quality levels.
The 35 FPS trigger leaves some headroom above the minimum while retaining full
quality at sustained rates in the high 30s and 40s.

Water contacts use the visible swimming head/torso, short deliberate side
reaches and 32-sided small wet balls. Free swimming limbs no longer repeatedly
fit themselves around each moving prop. Dry ball geometry is unchanged.
Reproduce the six-ball route with Vite running and
`WATER_CONTACTS=1 WATER_CONTACT_LIGHTING=0 node scripts/benchmark-jumping-water.mjs`.
On an Apple M5 Pro with Chromium 153.0.8010.12, 852 frames per mode measured
simulation plus drawing submission at 1.5 ms p95 with surface effects, and
1.3 ms with them disabled. Simulated 4x CPU slowdown measured 6.2 / 5.9 ms
respectively; the busiest surface-pushing stage reached 9.1 ms p95 with effects.
These CPU measurements exclude lighting and GPU completion and do not establish
whole-game FPS. Omit `WATER_CONTACT_LIGHTING=0` to include the lighting backend,
which the report identifies; `WATER_CONTACT_PROFILE=/tmp/water` saves CPU profiles.

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
