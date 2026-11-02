# Separating UJG character animation from physics

This note tracks [issue #86](https://github.com/nmsimons/arcade/issues/86): move
character animation out of the 120 Hz physics step, then speed up the
simulation. It records what each phase changed and the evidence for it. The
safety net is described in [testing](testing.md#ujg-golden-traces-and-the-fast-tier).

## Status

| Phase | State |
|---|---|
| 0. Safety net | Done: golden traces (built-in levels, medal routes, mechanism fixtures), fast tier, benchmark. |
| 1. Split `athlete.ts` | Done, with physics, state and pose hashes identical. |
| 2. `Player.anim` | Done for turns, slide entry, footwork, stride, gait, look and the ragdoll; physics and pose hashes identical. |
| 4. Gameplay reads physics | Done, ahead of Phase 3. The one intended physics change; see below for what moved. |
| 3. Animation cadence | Done: per-step, per-frame or off. The game animates visible actors every step and skips off-screen robots. |
| 5. Hot spots | Partly: operation-count guards and six exact optimizations (22% lower mean tick, 25% lower p95 frame over all scripts); remaining targets listed below. |

Deviations from the issue, each explained in its section: the phases ran in the
order 0, 1, 2, 4, 3; the game does not animate once per drawn frame; physics
still writes a few animation fields directly instead of emitting events; and
gameplay queries reuse the full pose solver on an animation-free player view
rather than simplified analytic rigs.

## Coupling measured in Phase 0

The issue's scratch experiment switched off the six animation updates inside
the physics step (`advanceDryTurn`, `advanceSlideEntry`, `advanceFootwork`,
`advanceMovingRecovery`, `settleFallClearance`, `advanceReturningStepPreparation`)
and found identical physics on six levels. The golden traces repeat that
experiment on all 45 levels and 17 medal routes. Physics changed in three of
the 107 traces, through three paths:

| Update switched off | Trace | First physics change | Path into gameplay |
|---|---|---|---|
| Footwork | Lock Out 2 medal route | tick 1067: gadget `blocked` | `heldToolFrame` reads the solved arm pose. The run later diverges in props, plates and player position. |
| Dry turn, footwork | Quarantine II runner | tick 822: repulsor robot aim and phase | `repulsorBotHand` reads the actor's solved palm; `hasFiringLine` decides between chase and windup from it. |
| Slide entry | rampingup medal route | tick 5245: player `pushing` | `anticipatePush` gates on `p.slideEntry` and `p.dryTurn`. `pushing.amount` feeds swimming push loads and the water-bob rest test. |

The other three updates (moving recovery, fall clearance and returning-step
preparation) changed no physics hash in these traces. Reading the code finds
further paths that no trace exercised:

- `advanceMovingRecovery` ends the physical fall (`p.freeFall = null`), and
  `advanceFreeFall` waits for `freeFall.moving` before ending it.
- Step-ups choose their leading foot from planted footwork, and the footing
  check that accepts the step uses that foot's offsets (`stepUp.ts`).
- Robots hear a footstep when footwork newly plants a foot while running
  (`botHearing.ts`).
- `settleWaterClearance` writes `waterMotion.bodyOffset` from the water pose,
  and the swimming collision outline includes it.

The same switch-off check on the fields the issue lists as unproven: look, air
boost and the impact ragdoll change no physics. Gait changes physics in four
traces (first on the Boxes medal route at tick 471, through push preparation),
because the captured turn pose and the dry ledge-reach pose both depend on it.
Landing changes a robot's decisions in one trace, through the robot's pose. So the solved pose and some animation
state are physics inputs today. Moving animation to frame rate (Phase 3) would
change physics until those reads are replaced (Phase 4). The phases therefore
run in the order 0, 1, 2, 4, 3, with 5 alongside. Phases 1 and 2 keep physics
hashes identical. Phase 4 is the one intended physics change. Phase 3 must then
keep physics identical again, which the golden traces check.

## Phase 0: safety net

- Golden traces: `tests/jumping-golden-traces.test.mjs`, recorded at fcafc46
  on arm64, and replayed only on arm64. CI checks animation-off physics against
  its own run ([testing](testing.md#ujg-golden-traces-and-the-fast-tier)).
- Fast tier: `npm run test:fast`.
- Benchmark: `scripts/benchmark-jumping-simulation.mjs`. At fcafc46 on an
  Apple M5 Pro (Node 25.9, arm64): 0.44 ms mean tick, 1.40 ms p95 tick and
  2.96 ms p95 frame over all scripts. Exit is the heaviest level, with a
  1.51 ms mean tick and an 8.08 ms p95 frame.

## Phase 1: athlete.ts split

`athlete.ts` is now a barrel for tests and tools. The code moved verbatim into:

| Module | Contents |
|---|---|
| `athleteRig.ts` | `AthletePose`, `Leg`, proportions, limb solvers, `transferPose`, `rotatePose`, `reflectAthletePose` |
| `athletePose.ts` | the per-render pose cache, `athletePose`, `presentedAthletePose`, mode dispatch (`resolveAthletePose`), the arm, shove and ankle passes, and the dry ledge-reach queries |
| `poses/*.ts` | one module per mode: locomotion, ledge, climbing, water, fall, ragdoll, sliding, wall brace, release turn, plus the push-turn blends |
| `athleteAnimation.ts` | the `advance*`, `capture*` and `settle*` functions and the impact ragdoll's start and advance |
| `athleteClearance.ts` | body, limb, hand and foot clearance |
| `athleteDraw.ts` | skin outlines and Canvas drawing |
| `characterTypes.ts`, `gait.ts` | `Player`, `JumpInput`, `Platform`, and `gaitPose` |

`resolveAthletePose` is a ten-line dispatcher. The 300-line locomotion pose is
split at its two seams: fitting the trunk to a loaded push, and the final
contact and clearance pass. The game modules import from the specific modules;
`model.ts` re-exports the moved types and `gaitPose`, so existing importers are
unchanged. Physics, state and pose hashes are identical.

`tests/jumping-module-boundaries.test.mjs` guards three rules: the headless
simulation (everything `challenge.ts` loads at runtime) loads no drawing
module; simulation modules use pose and animation code only through the listed
couplings; and the athlete modules import no runtime code from `model.ts`. The
listed couplings are the in-step animation calls in `model.ts` (Phase 3) and
these pose queries, which Phase 4 replaces:

- `gadgets.ts` and `repulsorBot.ts`: `athletePose` for the tool frame and the robot's palm.
- `repulsorBotRig.ts`: the robot rig's presented and awakening poses.
- `model.ts`: `athletePose`, `dryLedgeReach`, `dryLedgeReachPose` and `swimmingLedgeReach` for ledge reach.
- `playerContacts.ts` and `propPhysics.ts`: the swimming outline and swimming push hands; `dryPreparationFacesForward` and `retainInterruptedStepPose` for push anticipation.
- `actorImpulse.ts`: `startImpactRagdoll` when a shove or impulse knocks a body down.

The direct `model.ts` and `athlete.ts` cycle is gone. A wider runtime cycle
remains: `model.ts` calls the animation, and shared helpers that the poses use
(`climbables.ts`, `stepUp.ts`, `ropeGravity.ts` and others) reach `model.ts`
through `playerContacts.ts`, `gadgets.ts` and `actorImpulse.ts`, which import
`TUNING`, `STEP`, `cancelJumpInput` and `wantsCrouch` from it. Phase 3 removes
the animation calls from the step; moving those four values out of `model.ts`
would then break the rest of the cycle.

## Phase 2: animation state under `Player.anim`

`Player.anim` (`CharacterAnimation` in `characterTypes.ts`) now holds the dry
turn, slide entry, footwork, stride, gait, look and impact ragdoll. Hang, climb
and step snapshots keep the animation fields they captured under `caught.anim`;
poses and restores apply them over the live animation field by field, exactly
as the old spreads did. Shallow player copies that are kept for later, such as
the slide-entry snapshot, copy `anim` as well, so later updates to the live
player cannot leak into them.

Physics and pose hashes are identical; the state hash was re-recorded because
the fields moved. The full unit suite ran once with a tripwire that threw on
any read or write of the old field names, and nothing touched them.

Two parts of the issue's Phase 2 are deferred:

- `freeFall.moving`, `freeFall.bodyOffset` and `releaseTurn.pose` stay where
  they are. They live on objects that physics creates and clears, and the
  moving recovery itself ends the physical fall, so they move with Phase 4's
  fall-timer change.
- Replacing the remaining physics writes to animation (`translateFeet`,
  `rotateFeet`, the snapshot restores and the resets such as
  `p.anim.footwork = null`) with events moves to the start of Phase 3. An event
  applied later than the direct write it replaces can only change physics
  while gameplay still reads animation; after Phase 4 it cannot.

The boundary test now also lists, per simulation module, the animation fields
it touches. `model.ts` and `stepUp.ts` touch most of them; the rest are single
reads or resets in `actorImpulse.ts`, `armSupport.ts`, `botHearing.ts`,
`challenge.ts`, `climbables.ts`, `gadgets.ts`, `goal.ts`, `gravityFrame.ts`,
`playerContacts.ts`, `repulsorBot.ts` and `shove.ts`.

## Phase 4: gameplay reads physics, not animation

Phase 4 ran before Phase 3, for the reason given above. Its test is direct:
with every presentation pipeline switched off (dry turn, slide entry and their
captures, footwork, gait, look, fall clearance, moving recovery, returning-step
preparation, impact ragdoll, push anticipation and the presented push, ledge
reach, presented water clearance and the gadget arm easing), physics hashes are
identical to a normal run in all 175 golden traces. The golden set now includes
34 mechanism fixture levels from `tests/fixtures/jumping/`, which caught a
misclassification that the built-in levels did not exercise (the swimming lean
toward a small prop changes the push hands, so it is physics).

What gameplay reads instead:

- **Push rig.** `p.pushRig` is the motor's copy of the push rig: the same
  hands and easing as the presented `p.pushing` (one shared function), from
  real contacts only, without anticipation. The swimming push load, the low
  swimming push reach, the water-bob rest check, the arm-support rules and the
  physics rig's water poses read it. The presented `p.pushing` adds
  anticipation and is presentation only.
- **Arm support.** `rightArmSupporting` and `rightArmAnimating` read the push
  rig instead of the presented push, and no longer read ledge reach, the
  water-landing palm or the impact ragdoll.
- **Physics rig.** `gameplayPose.ts` solves the rig from `physicsView(p)`: the
  player with animation state, ledge reach, the fall clearance offset, captured
  turn poses, the water-landing pose and the animation kept by catches all at
  rest, and the push rig in place of the presented push. The held tool frame, the repulsor robot's palm and firing
  line, rope catches during a gravity turn, the swimming hull and hands, the
  ceiling brace, the water-landing floor hand, the lean toward small props and
  the hull's water clearance offset use it.
- **Fall timer.** A steered get-up from a prone recovery now ends the physical
  fall 0.1 s after steering begins (`freeFall.getUp`). The presented get-up
  blend is `p.anim.recovery` and can outlast the fall.
- **Footfalls.** Robots hear a running footfall every 40 units of grounded
  travel, with the existing 0.2 s cooldown, instead of when an animated foot
  plants.
- **Turn completion.** A gravity turn waits for its own timer, not for the
  captured pose's existence.
- **Water clearance.** The hull keeps `waterMotion.bodyOffset`, solved from the
  physics rig. The presented swimmer keeps its own `p.anim.waterClearance`.

Behaviour against fcafc46, comparing positions and velocities over the same
scripts: 6 of 175 traces change, all of them repulsor robot decisions. A
Quarantine robot hears a footfall and starts chasing at 3.05 s, and robot palms
move the Quarantine II robot and four Rbot fixture routes (Aloft twice,
Quarantine II force field, Uninvited). All 17 medal routes replay with
identical positions, times and grades.

An earlier version cleared the push from the physics rig entirely. That
changed swimming pushes slightly, and the Buoyancy keyboard route, which steers
to waypoints, then failed 10 of 24 repeats under six-worker browser load
(fcafc46: 1 of 36). With the push rig it passes 24 of 24.

The gadget test that required the gameplay sleeve to equal the presented
forearm now requires it with animation at rest, and a new test requires that
no animation state moves the gameplay sleeve. While walking or turning, the
drawn sleeve can sit a few units from the sleeve that collides and fires.

Not verified by playtesting: robot hearing on the Rbot levels, the gadget
muzzle against the drawn sleeve while walking and turning, the water levels
(Waterline, Buoyancy, Drain), and a steered get-up's timing. The issue suggested simplified analytic
rigs for these queries; the physics rig reuses the full pose solver with
animation at rest instead, which keeps the poses' clearance rules. Phase 5
measures its cost.

## Phase 3: animation cadence

`characterAnimation.ts` holds everything the movement step used to advance for
presentation: the presented push and its anticipation, returning-step
preparation, gait, look, footwork, the moving get-up, the dry turn, slide entry,
fall clearance, the impact ragdoll and the presented water clearance. Each
player has a cadence (`p.anim.cadence`):

- `'tick'`, the default, animates at the end of every physics step exactly as
  before. Tests and tools that check poses after each step are unchanged, and
  the golden pose hashes are identical.
- `'frame'` records each step's inputs in `p.anim.pending`, and
  `advanceCharacterAnimation(p)` animates once per drawn frame. A frame longer
  than 1/60 s animates in equal substeps, because footwork and the turn blends
  assume short steps; at 30 Hz a sprinting swing foot otherwise overshot by
  several units.
- `'off'` never animates. Headless runs that only need physics can use it.

The game animates the player and every robot within 160 units of the view
every step (`'tick'`), and switches robots farther away to `'off'`; one that
returns resumes from rest before it can be seen. It does not use `'frame'`.
Measured over the golden scripts (Apple M5 Pro, Node 25.9), against fcafc46:

| Cadence | Mean tick | p95 tick | p95 frame (two ticks and poses) |
|---|---:|---:|---:|
| `'tick'` | 0.389 ms (−12%) | 1.21 ms (−13%) | 2.55 ms (−14%) |
| `'frame'` | 0.322 ms (−27%) | 1.14 ms (−19%) | 2.47 ms (−17%) |
| `'off'` | 0.316 ms (−28%) | 1.13 ms (−19%) | 2.27 ms (−23%) |

Animating once per frame saved 3 to 5% of frame time over animating every
step (separate runs vary by a few percent), and lost continuity the browser tests check: 40 checks of flight
balance, slide entries, turns, footwork, camera framing and clock-paced
animation failed at 60 Hz with the repository's existing thresholds, and a
keyboard route that steers by the motion diagnostics took a different line.
Skipping animation is where the time is: a quarter of every tick for headless
runs and off-screen robots, with no visible change.

Animated players still capture a few things during the step, because they
depend on the state before the step changed it: the turn and slide-entry source
poses (at most once per frame), the presented ledge reach (inside the ledge
search), the impact ragdoll's source pose, the gravity-turn source pose and the
interrupted-step pose. With `'off'` none of them run.

The golden test now replays every trace with `'off'` and with `'frame'`
(animating every second step), and requires physics hashes identical to the
recorded `'tick'` run. `scripts/benchmark-jumping-simulation.mjs --cadence`
times each cadence. `tests/jumping-animation-cadence.test.mjs` replays five
medal routes at 30, 60 and 144 Hz with `'frame'` and requires exact bones, a
finite rig, and per-frame joint jumps no larger than animating every step
produces at the same frames (within 25% plus 3 units). Animating once per
frame does not reproduce the per-step poses: footwork re-seeds its stride phase
when walking starts, and that now happens on frame boundaries, so the feet can
settle half a stride apart from the per-step animation while both stay
continuous.

Not done as the issue proposed: physics still writes a few animation fields
directly instead of emitting events. It carries planted feet with a moving
support (`translateFeet`, `rotateFeet`), resets animation on transitions such as
a new hang, and stores and restores the animation captured by catches. These
writes are cheap, apply immediately at either cadence, and cannot affect motion
because physics never reads animation. Replacing them with an event queue would
change presentation timing without a measurable benefit, so it is left for a
decision.

## Phase 5: hot spots after the split

`tests/jumping-animation-cadence.test.mjs` counts work instead of timing it. On
the Boxes medal route, physics without animation solves no rig, while animating
every step solves more than a hundred. On a Waterline II explorer script,
physics without animation fits swimming limbs fewer than once per twenty body
solves (`waterPoseWork`). A change that puts a full pose solve back into the dry
movement step, or limb fitting back into the swimming hull, fails them.

CPU profiles of physics alone (`--cadence off`) before this work, as shares of
profiled samples:

| Level | Largest costs |
|---|---|
| Ascent, Waterline II | water-pose solves from the physics rig, 28–35% inclusive (swimming hull 10–18%, hull clearance 10–14%, ceiling brace 10–16%); building the physics view 2–6% self |
| Quarantine II | rope solver 22% self |
| Exit | prop collision queries 12.5% self, matter.js 9% |

### Optimizations

Each change leaves every golden physics, state and pose hash identical. They
remove work or change how values are read, never the arithmetic.

| Change | Where | Why it was slow |
|---|---|---|
| `waterBodyPose` stops `waterPose` after its body clearance. The swimming hull, the physics and presented clearance offsets, and the ceiling search use it. | `poses/waterPose.ts`, `athleteAnimation.ts` | They read only the torso, head and offset, but first fitted all four limbs to terrain, up to four passes per leg. The hull alone is built about 17 times per swimming tick. |
| The rope solver reads padded terrain boxes from a flat array. | `climbables.ts` | Every pass tests every particle against every nearby solid: about 17,500 tests per solve on Scaffold V, 0.4% of them hits. Solids come in many object shapes, so V8 cannot specialize the property reads. |
| Prop correction neighborhoods keep their padded bounds in a flat array and scan it in order. | `collisionQueries.ts` | Each tick rebuilt every prop's neighbor list by spreading a map of all solids and calling `Bounds.overlaps` on each. |
| Sleeping props build their candidate list only when used. | `propPhysics.ts` | A filtered copy of all solids was made for every prop each tick. |
| Inside `withTerrainQueries`, `bodyIntrusion` reads solid boxes from a flat array kept for that scope (`terrainBoxes`). Animation steps and the water body pose now run inside a scope. | `geometry.ts`, `athleteClearance.ts`, `characterAnimation.ts` | Every clearance sample scanned all colliders (96 objects in 13 shapes on Exit), and half the samples ran outside any scope. |
| `findRope` skips rope segments whose box is more than 26 units from every hand. | `climbables.ts` | It built path arrays for every segment of every rope on each call, though only a gap under 25 units can grab. |

Measured with `scripts/benchmark-jumping-simulation.mjs --source`, alternating
`main` (d43fcea) and this branch, best of three runs each, on an Apple M5 Pro
(Node 25.9) with other load on the machine:

| Level | Mean tick | p95 frame |
|---|---|---|
| All scripts | 0.398 → 0.312 ms (−22%) | 2.61 → 1.97 ms (−25%) |
| Exit | 1.34 → 1.00 ms (−25%) | 7.13 → 5.86 ms (−18%) |
| Waterline II | 1.17 → 0.73 ms (−38%) | 4.18 → 2.36 ms (−44%) |
| Scaffold V | 1.14 → 0.74 ms (−35%) | 4.83 → 2.76 ms (−43%) |
| Ascent I | 0.91 → 0.48 ms (−48%) | 5.74 → 4.11 ms (−29%) |
| World I | 1.06 → 0.95 ms (−10%) | 3.78 → 3.46 ms (−9%) |
| Tower I | 0.80 → 0.63 ms (−21%) | 3.00 → 2.26 ms (−25%) |
| Quarantine III | 0.56 → 0.37 ms (−34%) | 2.45 → 1.51 ms (−38%) |

Single benchmark runs vary by 15–20% under load, and in back-to-back A/B runs
the checkout that runs first is about 3% slower. Alternate the order and keep
the best of several runs before attributing a few percent to a change.

### Remaining targets

- The swimming hull is still built about 20 times per swimming tick from the
  same state. A cache needs an exact account of what the body pose reads,
  including a full dry pose when the swimmer rests on the pool floor.
- `syncPlatforms` runs about five times per tick and rebuilds every collider and
  prop shape. `ledgeExposed` and `groundAt` scan every collider outside terrain
  scopes. These dominate World I and stay large on Exit and the Towers.
- The common cause of the scans above is that platforms come in many object
  shapes. Building them with one shape would speed every scan at once, but
  touches every place a platform is created.
- The rope solver's constraint iteration (passes times particles) and matter.js
  on the prop-heavy levels.
