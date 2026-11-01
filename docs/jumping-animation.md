# Separating UJG character animation from physics

This note tracks [issue #86](https://github.com/nmsimons/arcade/issues/86): move
character animation out of the 120 Hz physics step, then speed up the
simulation. It records what each phase changed and the evidence for it. The
safety net is described in [testing](testing.md#ujg-golden-traces-and-the-fast-tier).

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

- Golden traces: `tests/jumping-golden-traces.test.mjs`, recorded at fcafc46.
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

- **Push grip.** `p.pushGrip` records how established a real push contact is,
  eased like the presented palms but ignoring anticipation. The swimming push
  load, the low swimming push reach and the water-bob rest check read it. The
  presented `p.pushing` rig is presentation only.
- **Arm support.** `rightArmSupporting` and `rightArmAnimating` use physical
  state: a loaded push supports a palm while its contact resists more than the
  body moves. The presented push amount, ledge reach, water-landing palm and
  impact ragdoll no longer gate aiming or firing.
- **Physics rig.** `gameplayPose.ts` solves the rig from `physicsView(p)`: the
  player with animation state, the presented push and reach, the fall clearance
  offset, captured turn poses, the water-landing pose and the animation kept by
  catches all at rest. The held tool frame, the repulsor robot's palm and firing
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
scripts: 7 of 175 traces change, all of them robot decisions or a swimming
push. A Quarantine robot hears a footfall and starts chasing at 3.05 s; robot
palms move the Quarantine II robot and four Rbot fixture routes (Aloft twice,
Quarantine II force field, Uninvited); and the small-water-prop runner reaches
its prop with a hull that no longer leans with the presented push hands. All 17
medal routes replay with identical positions, times and grades.

The gadget test that required the gameplay sleeve to equal the presented
forearm now requires it with animation at rest, and a new test requires that
no animation state moves the gameplay sleeve. While walking or turning, the
drawn sleeve can sit a few units from the sleeve that collides and fires.

Not verified by playtesting: robot hearing on the Rbot levels, the gadget
muzzle against the drawn sleeve while walking and turning, small-prop swimming
pushes, and a steered get-up's timing. The issue suggested simplified analytic
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
