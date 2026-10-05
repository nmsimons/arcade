# Built-in jumping medal audit

October 5 update: jumping now uses a short tap and a brief post-takeoff hold to
control height. The maximum height is preserved, but the timings below were
recorded with the earlier directional-jump controls. A new full medal-time audit
with variable-height jumping remains unverified; level thresholds are unchanged.
The historical recordings now store their original jump impulses explicitly for
mechanism and contact regressions. Those preset replays do not establish times
for the new tap/hold controls.

October 4, 2026. All 22 levels in the current built-in catalog have a completed
fresh-start control recording. Seventeen medal sets were revised. The five
unchanged sets are First Leap, A Little Swing, A Bigger Swing, Boxes, and Nine.
JK was retuned after the author supplied the crate-and-small-ball route below;
its first recording had taken an unnecessary large-ball detour.

## Evidence and limits

The recordings run the production movement, prop physics, switches, pickups and
exit scoring against the current runtime JSON. They contain normal keyboard or
gamepad inputs, including walking and partial stick movement. They do not move
actors directly, replace layouts, override movement tuning, or force completion.
Experimental retries used copies of previously reached states; the retained
recordings are verified by replaying their entire input sequence from a fresh
load. This is automated route verification, not a claim of a complete graphical
playthrough or an enjoyment review.

First Leap, Untitled, and JK also had graphical gameplay checks. JK's fresh-start
browser keyboard replay scored 14.10 seconds with the crate stopped on the
elevator and the large ball left on its ledge. Spelunk I's current layout was
inspected in the graphical builder. A full normal-speed graphical
review of the remaining levels, their camera framing, and all advertised
alternatives remains unverified. In particular, Tower I's fastest route through
the third-floor window was supplied by the author; the recorded completion uses
the sixth-floor box alternative and the two-ball lobby setup.

Clock is the scored game time at doorway entry. Active is simulated active
play through completion, including the approximately 0.86-second exit animation.
A Bigger Swing and Uninvited Company use refunds; Drain uses a stopwatch.
These can make the scored clock substantially shorter than the active duration.
Medals use the scored clock. Earlier asset versions of Second Leap and Spelunk I
were discarded when their puzzles changed during the audit.

Gold allows margin beyond the recorded fluent route. Silver and bronze allow
hesitation, extra travel and recovery, with larger allowances for longer puzzles.
These are initial tuning judgments rather than a statistical study of players.

## Times in seconds

Before and after list gold / silver / bronze. Nine was newly added and its
initial 10 / 20 / 40 targets were retained.

| Level | Clock | Active | Before | After |
| --- | ---: | ---: | --- | --- |
| [Untitled](../public/levels/jumping/Untitled.jump-level.json) | 3.79 | 4.65 | 10 / 20 / 40 | 5 / 8 / 15 |
| [First Leap](../public/levels/jumping/00.json) | 2.61 | 3.47 | 3.5 / 6 / 15 | 3.5 / 6 / 15 |
| [Second Leap](../public/levels/jumping/01.json) | 5.95 | 6.81 | 4.5 / 6 / 15 | 7 / 10 / 15 |
| [A Little Swing](../public/levels/jumping/02.json) | 6.35 | 7.21 | 7 / 12 / 24 | 7 / 12 / 24 |
| [A Bigger Swing](../public/levels/jumping/03.json) | 0.71 | 9.95 | 1 / 5 / 15 | 1 / 5 / 15 |
| [Boxes](../public/levels/jumping/Boxes.jump-level.json) | 26.71 | 27.57 | 30 / 50 / 90 | 30 / 50 / 90 |
| [Balls](../public/levels/jumping/Balls.jump-level.json) | 24.56 | 25.42 | 12 / 20 / 30 | 28 / 40 / 60 |
| [Coins](../public/levels/jumping/Coins.jump-level.json) | 10.77 | 11.62 | 10 / 20 / 40 | 12 / 20 / 40 |
| [Spire I](../public/levels/jumping/spire1.jump-level.json) | 35.42 | 36.28 | 30 / 45 / 60 | 40 / 60 / 90 |
| [Turnaround](../public/levels/jumping/07.json) | 25.05 | 25.91 | 25 / 35 / 45 | 28 / 40 / 60 |
| [jk](../public/levels/jumping/jk.jump-level.json) | 14.10 | 14.96 | 14 / 30 / 60 | 25 / 40 / 60 |
| [Cross Purposes](../public/levels/jumping/06.json) | 25.50 | 26.36 | 5 / 10 / 15 | 28 / 40 / 60 |
| [Spire II](../public/levels/jumping/spire2.jump-level.json) | 42.77 | 43.63 | 10 / 20 / 40 | 50 / 70 / 100 |
| [Uninvited Company](../public/levels/jumping/08.json) | 2.22 | 12.07 | 12 / 23 / 40 | 4 / 12 / 25 |
| [Slow is Smooth](../public/levels/jumping/04.json) | 10.26 | 11.12 | 10 / 20 / 40 | 12 / 20 / 40 |
| [Tower I](../public/levels/jumping/Tower.jump-level.json) | 87.48 | 88.34 | 90 / 120 / 210 | 100 / 140 / 210 |
| [Level Five](../public/levels/jumping/05.json) | 21.27 | 22.12 | 15 / 25 / 60 | 25 / 40 / 60 |
| [Tower II](../public/levels/jumping/Tower%20II.jump-level.json) | 98.95 | 99.81 | 90 / 120 / 210 | 110 / 150 / 210 |
| [Nine](../public/levels/jumping/nine.jump-level.json) | 4.16 | 5.02 | 10 / 20 / 40 | 10 / 20 / 40 |
| [Spelunk I](../public/levels/jumping/spelunk1.jump-level.json) | 50.64 | 51.50 | 10 / 20 / 40 | 60 / 90 / 140 |
| [Drain](../public/levels/jumping/Drain.json) | 30.42 | 41.28 | 10 / 20 / 40 | 35 / 50 / 75 |
| [Ramping Up](../public/levels/jumping/rampingup.jump-level.json) | 44.76 | 45.62 | 10 / 20 / 40 | 55 / 80 / 120 |

## Required interactions checked

- **JK:** cross to the elevator plate without disturbing the large ball on its
  ledge. Raise the crate partway, then step off the plate to stop it beside the
  chute. The released small ball hits the crate, drops onto the lower ramp, and
  rolls onto the left exit plate. Leave the crate on the elevator and enter the
  powered doorway. The fresh-start recording scores 14.10 seconds; the author's
  20-second playthrough supports 25 / 40 / 60. The former 53.29-second recording
  proved completion, but missed this faster plan and did not justify 60-second
  gold.
- **Second Leap:** leave the ball on the starting pressure plate, jump past it,
  then cross the gap and enter the powered doorway. The revised puzzle takes
  5.95 seconds; its former 4.5-second gold no longer fits this route.
- **Cross Purposes:** the box blocks the unpowered gate, crosses the gap, and
  holds the mounted exit plate. Its original pressure behavior is preserved.
- **Ramping Up:** activate the gravity field and release the plate so a ball
  falls onto the platform and takes over the plate. Collect all ten coins and
  travel to the exit. The 44.76-second route supports 55 / 80 / 120.
- **Tower I:** use the sixth-floor box access route, hold the third-floor plate
  with its ball, retrieve the second ball, and arrange separate balls on the
  lobby and outside plates. The 87.48-second fluent run and 145.93-second learning
  completion support 100 / 140 / 210. The one-ball front-gate approach is not used
  as the solution for this map.
- **Tower II:** collect eight of nine coins, use boxes to hold the upper access
  doors, and send large balls down the right side. Bring cargo through the lower
  room into the lobby. Settle the delivery ball on the flat floor near the front
  gate, fully open that gate, and run at the ball so it blocks closing during
  delivery. Leave it on the outside plate and return through the building to the
  exit. The fixed lift prevents the large corridor ball from passing directly
  into the central shaft. The 98.95-second fluent run and 141.86-second learning
  completion support 110 / 150 / 210.
- **Nine:** keep buttons 4 and 1 on and the other three off: binary 01001,
  decimal 9. All 32 button patterns were checked; only 9 opens the door. The
  4.16-second movement run does not account for a player's first discovery of
  binary encoding, so the initial 10 / 20 / 40 targets remain.
- **Spelunk I:** leave buttons 2 and 4 on, collect the adjacent coin on descent,
  collect the lower-right coin, and use the long ladder to return. Jump from the
  lower beam into the central cave, use two wall jumps and turn toward the short
  rope, climb to the coin beneath the upper ledge, then move the large ball onto
  the exit plate and enter the door. All three coins, the cargo plate, and the
  four-button combination are verified. All 16 button patterns were checked;
  only buttons 2 and 4 open the gate. The 50.64-second fluent run and 64.77-second
  recovery run support 60 / 90 / 140.

The short levels with clock bonuses were judged by their actual scored time.
Uninvited Company was tightened to 4 / 12 / 25; A Bigger Swing's existing
1 / 5 / 15 remains attainable with its refund. Longer prop and coin routes were
relaxed where their previous targets were below demonstrated completion times.

## Repeatable checks

- [Control recordings](../tests/fixtures/jumping-builtin-medal-runs.json)
- [Route, cargo, catalog coverage and truth-table tests](../tests/jumping-builtin-medals.test.mjs)
- Run `npm run levels:check`: 22 assets validated.
- Run `node --test tests/jumping-builtin-medals.test.mjs`: 25 tests passed,
  including a gold completion for every current built-in level.

The route tests intentionally fail if an asset or shared movement change breaks
a recorded completion, changes its clock, or removes a required mechanism from
that route. Re-record a route after checking the changed level; do not merely
increase a deadline to hide a broken puzzle.
