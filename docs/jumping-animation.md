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
preparation) changed no physics hash. So the solved pose and some animation
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
