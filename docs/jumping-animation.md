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
