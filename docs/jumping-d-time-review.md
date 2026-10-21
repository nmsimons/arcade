# D deadlines through World I

October 20, 2026. D is the deadline for a purposeful first completion: enough
time to understand the new problem and recover from a couple of mistakes.
These are individually reviewed authoring targets, not multiples of A or C.
A/B/C, layouts, collection order and levels after World I are unchanged.
Wake remains untimed.

The allowance includes reading the room, trying an initially plausible approach,
and the level's actual recovery cost. A simple movement lesson need not offer
several minutes; a cargo or water puzzle needs time to observe consequences.
Later courses assume familiarity with earlier controls. Optional time rewards
can help a run but are not assumed to be collected or used perfectly.

| Level | D | What the allowance covers |
| --- | ---: | --- |
| Leaps and Bounds I | 0:30 | Discover how to get over the crate, with failed approaches and another jump. |
| First Gap | 0:30 | Read the movement hint and recover via the ladder after two missed jumps. |
| Second Gap | 0:45 | Discover the ball/plate relationship, correct the load, and recover from a gap miss. |
| A Little Swing | 0:50 | Learn the catch and release, with time to return up the ladder and retry. |
| Level Five | 1:15 | Investigate the upper crate route or the downhill ball/gate solution, then correct a delivery. |
| A Bigger Swing | 0:50 | Learn the two-rope transfer and recover without requiring the stopwatch or either refund. |
| Leaps and Bounds II | 1:15 | Combine jumps, crate restraint and swings; swim out after misses and restore a moved crate. |
| Boxes | 2:30 | Identify the two gate loads, distinguish the crates and return from the lower delivery area. |
| Balls | 2:30 | Work out the two independent plate loads and correct balls that have rolled past a useful position. |
| Coins | 1:00 | Follow the staged coin thresholds, miss a pickup or boarding attempt, then use the exit lift. The direct sequence needs less discovery time than the cargo puzzles. |
| Spire I | 2:30 | Understand the linked gates and ball, explore the vertical route and repeat part of the ascent. |
| Turnaround | 2:00 | Reach and load the remote plate, understand the changed return route and recover a rope miss. |
| jk | 2:00 | Discover the small-ball release and crate/lift relationship rather than already knowing which cargo matters. |
| Spire II | 3:00 | Find a workable selection of twelve coins, revisit a missed section and recover a vertical fall. |
| Uninvited Company | 1:30 | Find the ascent while dealing with Rbot, with a retreat and another attempt; no perfect timing-pickup route assumed. |
| Tower I | 6:00 | Trace the shared lift and gate controls, deliver separate balls and recover from a wrong-floor trip. |
| Nine | 1:15 | Read the bit values, test a few combinations and correct mistaken toggles, without requiring an exhaustive search. |
| Spelunk I | 4:00 | Explore the coin route, experiment with the button pattern and deliver the final ball, with a detour or fall. |
| Ramping Up | 4:00 | Understand the gravity/cargo handoff, collect ten coins and revisit missed landings. |
| Tower II | 6:00 | Apply the familiar tower structure to coins, changed gates and cargo interference, with another trip through a section. |
| Escapade | 15:00 | Retain the conservative existing deadline for the three tower circuits, roof shutdowns and final gravity route. A complete route is still unrecorded; tightening this would be speculative. |
| Buoyancy | 3:00 | Observe filling and draining, experiment with the heavy ball and floats, and correct a cargo delivery or water cycle without relying on both timing rewards. |
| Waterline | 2:30 | Discover the paired pump effects and desired levels, overshoot and rebalance a couple of times, then return to the exit. |
| World I | 6:00 | Find ten coins across the larger space, change route after falls and navigate the final cargo pile/rope ascent. |

## Evidence and limits

Existing completed recordings in
`tests/fixtures/jumping-builtin-medal-runs.json` provide successful puzzle-route
and timing references. Historical `recorded-impulses` routes remain useful
mechanism evidence; they are not new measurements of current tap/hold play.
The current-control introduction recordings demonstrate First Gap at 2.61
scored seconds, 9.03 after a floor/ladder recovery, and A Little Swing at 6.27,
12.51 after recovery. The second recovery cost and reading allowance are design
budgets, not observations of an untrained player's run.

A new fresh-start LAB II current-control run completed in 28.85 scored seconds
(29.71 active). It catches the recovery rope after the longer jump,
pushes the crate off its plate, swims back to restore it, misses a later rope
transfer and swims out to the exit. It uses ordinary movement, held jump and Up;
no direct actor placement, mechanism overrides or timer edits establish the completion.
The D allowance leaves additional time for reading and discovering these actions.
Replaying with another 15 seconds of neutral reading time also completes, at
43.85 scored seconds, earning D with over thirty seconds still available.

A new World I current-control run completed in 70.59 scored seconds (71.45
active), collecting ten coins and entering the powered exit. It misses the upper
route, falls to the lower route, makes unsuccessful jumps and coin approaches,
crosses the final crate pile and climbs the exit rope. It collects neither time
pickup. This verifies a recovery route without making the first pass depend on
the high rope line or collecting all the coins.

A further World I run adds fifteen seconds of reading before the same initial
inputs. Changed bot timing alters its lower-route progress: it reaches the final
cargo area later, with fourteen coins. The original fixed input sequence alone
does not finish this variation. Further ordinary jumps and Up recover through
the crate pile, and it completes at 95.29 scored seconds (96.15 active), with no
time pickups. Its full trace includes that correction; it is not presented as
an identical route that tolerates arbitrary starting phases.

The three completed fresh-start input traces are retained in
`tests/fixtures/jumping-d-review-runs.json` and replayed against the current
authored files. They deliberately preserve the mistakes instead of presenting
only an optimized route. They do not establish that the initial A/B/C targets
for LAB II or World I are attainable; those audits remain pending.

Automated routes establish reachability and recovery costs, not first-time
understanding or enjoyment. A complete graphical first-run playtest of every
course, independent novice timing, and a completed
Escapade route remain unverified. Use the deadlines above as the next playtest
baseline; adjust the level whose discovery or recovery exceeds its allowance,
rather than relaxing the whole collection.
