# Floating objects and the player in zero g

**Written November 18, 2026**, from probes of Untitled level 2 (a weightless room
with five balls and three boxes) and of single interactions in a weightless room.
It records how loose props and the player behave together without weight today,
proposes how they should, and sets the rubric a reviewer scores against. Negative
g, where everything settles onto the ceiling and the ordinary standing push
applies, already works well and is the comparison throughout.

The evidence tools:

- `node scripts/zero-g-lab.mjs [--only name] [--trace name] [--json file]`:
  scripted interactions, measured headlessly (contact episodes, hand gaps, speeds
  before and after, rebounds, time to rest, step cost, worst one-frame pose jump),
  plus the scenario level flown through in zero g and in negative g for cost.
- `node scripts/zero-g-filmstrip.mjs --out <dir> [--url <dev server>]`: the same
  kinds of scene drawn by the model review lab from fresh starts with ordinary
  inputs, saved as PNG filmstrips. Needs `npm run dev`.
- `node scripts/profile-jumping-level.mjs "Untitled level 2.jump-level.json"
  --snapshot <copy>`: frame cost in hardware Edge; give it a copy with the plate
  set to `-1` for the negative g comparison.

## How it behaves today

Measured on the November 18 baseline (`scripts/zero-g-lab.mjs`):

| Interaction | Today |
|---|---|
| A ball struck at 300 into a wall | Stops dead (rebound 0) and slides along the wall at 40 forever |
| A box struck at 300 into a wall | Rebounds at 13 with a little spin, then drifts |
| A ball at 250 into a resting ball | Both leave together at 125 and stay touching |
| A ball drifting at 8 | Stops dead after 0.74 s (it falls asleep in mid-air) |
| A struck ball | Keeps its speed indefinitely; the player, with air drag, never catches it |
| Thrust held into a ball for 3 s | 5 separate bumps, not a push |
| Thrust held into a box for 3 s | 8 bumps, the box spinning off |
| The parts that touch | The head: the body flies flat, arms trailing, and butts the prop; the head is drawn sunk into it |
| Drifting feet-first onto a prop at 60 | Lands, stands and rides it |
| Drifting onto a prop at 250 | Never lands: no crouch, no footing; both drift on, the prop ahead |
| Flying up toward a prop overhead | No feet-first roll (the roll ignores loose props): the head bumps it away |
| Jumping off a floating prop | The player leaves at the full push-off; the prop gets nothing back |
| A ball sliding along a wall past a player standing on it | Carries the player along the wall |

The causes, in the code:

- Every prop and terrain body has restitution 0 (`propPhysics.ts` `material`).
  Under gravity that keeps puzzles calm; without it nothing ever bounces, and a
  contact with no load has no friction, so a slide never ends.
- Props take air resistance only in water (`propFloatDrag`); the player has
  `zeroGravityDrag` and `zeroGravityAirDrag`. Struck props outrun the player.
- A slow prop goes to sleep (Matter's sleep threshold of 45 steps), which in
  zero g is a dead stop in mid-air.
- The player meets a floating prop only as a body contact (`impactSpeed`
  momentum exchange in `stepPropPhysics`). The standing push needs footing, so
  no hands are ever planned, and the float pose leads with the head.
- `surfaceAhead` (model.ts) skips loose props, so no roll turns the feet to one.
- `pushOff` treats every touched surface as immovable.

Cost: Untitled level 2 runs at 60 fps in both gravities. Frame CPU p50 was 3.8 and 3.1 ms
in zero g against 3.3 and 2.7 ms in negative g (two sections); headless physics
steps are cheaper in zero g (median 0.18 ms, p95 0.59) than in negative g (0.39,
1.32), so the extra is presentation. Nothing here is near a budget, but every
change below has to hold that.

## How it should behave

Implemented November 18, 2026, with the two open decisions taken as proposed
(bounce only without weight; push-offs split by mass). The rules as built are in
[Jumping game contacts](jumping-physics.md) (zero g) and the floating push in
[Jumping animation](jumping-animation.md).

1. **One air.** A prop without weight feels the same air the player does
   (`zeroGravityDrag + zeroGravityAirDrag * speed` per second), so a struck ball
   slows over a few seconds and can be caught. A weightless prop sleeps only
   once the air has all but stopped it (below about 1 a second), so a drift dies
   away instead of stopping dead.
2. **Surfaces answer like legs.** Without weight, an arrival slower than a stick
   speed stays; a faster one rebounds at a fraction of its speed across the
   surface (balls more than boxes; an off-centre box hit also spins). Along the
   surface the air takes the slide. A ball returns 0.5 of its speed and a box
   0.3; under gravity restitution stays 0, so no existing puzzle changes.
3. **Props meet props the same way.** A ball at 250 into a resting ball of the
   same size leaves the struck ball faster than the striker, and they part.
4. **One momentum budget.** Every exchange between player and prop conserves
   momentum with the player's mass: bumps (as now), landings (a hard arrival on
   a prop absorbs in the legs as on terrain, and the pair shares the momentum),
   push-offs (the prop takes the reaction) and held thrust (boots driving a
   prop the player is touching drive both). A push-off from a light prop sends
   the player off more slowly than one from a wall: the jump is a fixed change
   split by mass.
5. **Contact is visible.** What touches a prop is a hand or a foot, never the
   head. The hands meet whatever the body closes on beside it or overhead,
   whether the boots drive it there or not; feet take a prop coasted onto. A floating body about to meet a prop turns to meet it: feet-first onto
   one big enough to stand on (the same roll as for terrain), hands-first for a
   push, the arms reaching ahead so the palms meet the surface as it arrives and
   the elbows give with the hit. Thrust held into a prop keeps the palms on it,
   as the swimming push does.
6. **Standing on a floating prop is standing.** Land, stand, ride; jump off and
   the prop goes the other way. A small ball is a poor footing: it rolls away
   under a push-off rather than giving the full speed.
7. **No gravity regressions.** Nothing here changes motion under gravity:
   recorded routes and golden traces in gravity stay as they are.
8. **No sudden turns.** Orientation changes ease: the float's lean turns at most
   about half a turn a second, and anything the body can see coming starts early
   enough to stay within that.
9. **Physics never reads animation** (docs/jumping-animation.md, Phase 4).
   Reaching hands are presentation; whether a contact is a push or a bump, and
   the roll toward a prop, are decided from physics.
10. **Cost.** In the scenario, zero g physics stays at or under negative g's
   step cost, and frame CPU within 0.5 ms of negative g at the median.

## Rubric (100 points)

A reviewer scores what the lab, the filmstrips and their own probes show, with
one or two sentences of reasons per line.

| Criterion | Max | Full marks |
|---|---|---|
| Momentum and air | 15 | Struck props slow like the player and can be caught; every exchange conserves momentum with sensible masses; nothing stops dead mid-air |
| Surfaces | 15 | Fast hits rebound, slow ones stay; no endless slides; boxes spin plausibly; no sticking or chatter in corners |
| Prop on prop | 10 | Collisions part the bodies with a believable share of speed; stacks and clusters settle without jitter |
| Visible contact | 17 | Hands or feet, never the head, meet every prop the player touches; no gap or overlap over 3 units in contact frames; reach anticipates, arms or legs give |
| Pushing and herding | 10 | Held thrust gives one steady push with palms on the prop; a prop can be steered to a chosen spot |
| Standing on props | 15 | Landing (slow and fast) stands and rides; jumping off sends the prop back; the roll turns the feet to a prop it will land on |
| Stability and smooth turns | 8 | No pose snaps over 6 units in a frame, no tunnelling, no creep at rest. The drawn body never swings round suddenly: a turn the body could see coming (standing up to push, rolling onto a prop, letting go) stays under about 200° a second over any tenth of a second (the lab's `fastestTurnDegPerS`); one forced by a fast arrival may be quicker but never jumps between frames |
| Performance | 10 | Physics step and frame CPU within the budgets above |

Caps: a change that makes physics read animation scores at most 60. One that
changes motion under gravity without saying so scores at most 70. A scene where
the head is the contact scores at most 8 for visible contact.
