# How Rbot hunts

**Written November 24, 2026.** Nick asked for an Rbot that is much smarter and
really challenges the player, within what is fair and within Rbot's physical
limits: one that hunts relentlessly instead of standing around, and predicts
where the player will be from the level itself (what is left to collect, what
powers the exit, where the exit is). This note records the principles, how the
hunter thinks today, how to measure it, and the rubric a reviewer scores against.
The movement and contact rules it relies on are in
[jumping-physics.md](jumping-physics.md) (Repulsorbots).

## Principles

- **Fair senses.** Rbot knows the map (terrain, routes, pickups, plates and their
  wiring, the exit, the authored entrance) as any player can see it. Changes to it
  (a pickup gone, a plate pressed, the exit lit) it learns only by seeing them, or
  for a pickup by hearing its chime. It knows the player only by sight (facing, range, a clear line), by sound
  (running, landings, gadget shots, a pickup's chime), by touch (bodies meeting)
  and by what it sees of its own hits. It never
  reads the hidden player's position or velocity. A pickup collected out of sight
  stays on its list until it sees the empty place or hears the chime there.
- **Physical.** Every movement is the player's own controller at Rbot's size:
  the same jumps, catches, climbs, swimming and recovery. Better hunting comes from
  better decisions, never from extra speed, reach or exceptions.
- **Readable threat.** The windup (0.8 s) and the locked aim stay, and a windup
  ends in its shot (a shove cuts in on it only to answer the player's own shove).
  The pulse sweeps along
  its line to the first thing it meets, so on level ground stopping or turning
  does not dodge it: getting off the line does. The arm tracks the player for
  the first 0.44 s, then holds still; a jump from then on clears the line (a jump
  before that is followed), and so does dropping off a ledge or putting cover
  between. The aim leads a player running
  or falling at a steady pace, never a climber. After a shove lands, the player
  gets a moment to find their feet before the next.
- **Never idle.** Standing still is acceptable only while winding up, recovering
  briefly from its own shot, or holding an ambush with the player in view.
  Anything else that stops it (a route the controller cannot finish, a ledge that
  will not take it, a player it can see but not reach) is a stall to break.

## How it hunts

The hunt starts with the run. Before any sighting or sound, Rbot reasons from the
entrance, as from a player last seen standing there. (A hunter whose home is
weightless keeps to its beat until it has a real clue; a docked one in a charging
bay sleeps until it is woken.)

From a clue (a sighting, a sound, or the entrance), `botPrediction.ts` asks where
the player is going:

- **Objectives.** Pickups it believes remain (coins weigh more when coin plates
  matter), plates and buttons that would light a switched exit, and the exit
  (much more once lit). Each is weighed by its value, by the player's route cost to
  it from the clue, and by the way the player was heading. A player thrown by a hit
  is heading nowhere. The player's routes are planned at the player's size, through
  gaps too small for Rbot; where Rbot goes is its own graph, matched to them by place.
  An objective the routes cannot get the player to (they crawl and wall jump where
  the graph does not go) still counts, as odds by its value and Rbot's own trip.
- **Still there.** The place they were last seen, likely for a player who was
  standing still, less so for one on the move, and less as time passes. A player
  seen in the air is placed where they will land; one seen braced on a wall or kicking
  off it is placed where they are, since a player working up a shaft is not falling,
  and the routes have no wall jumps to say where they will come out.
- **Intercept.** Along the player's route to each likely objective, the first
  dry footing Rbot can stand on beside it, and reach before the player, is the ambush
  point (none beside a crawlspace). Failing that,
  it goes to the objective itself, where the player must spend time. A player who
  has had time to reach an objective is taken to be there, not past it.
- **Old trails.** A clue more than 6 s old is odds over the objectives, with no
  route left to cut: it ranks them by value and by its own trip, and after 8 s it
  alternates checking them with sweeping places it has not seen.
- **Steadiness.** Every choice counts the bot's own trip against a place, and the
  current target is kept unless another is clearly (30%) better.
- **Ruling out.** An objective it can see with nobody there, where the player
  should already have been, is passed over for a while (the exit for less time);
  so is the last-seen spot once it has had a close look at it. Every new clue
  clears that list.

Seeing the player:

- In reach, it pursues and shoots as before, from the same reach.
- Out of reach (a shelf above, the far side of a gap, swimming: Rbot does not dive
  after a swimmer), it finds a **firing position** with a clear shot (it may shoot
  farther from there), or cuts the player off along their predicted route. Already
  standing at that point with the player in view, it holds an **ambush** there,
  facing them, ready to wind up when they come in reach.
- On the move and far by route, it may cut them off rather than follow.
- Standing still too long in plain view of a player it cannot reach or shoot, it
  moves somewhere else that might.

It does not change plans in the middle of a jump, nor, on a guess, halfway up a
climb. Reaching a place it came to look at, standing on it, it turns to look the
other way before it rules the place out. An objective it turns away from twice
before reaching it is set aside like a checked one.

Attacks:

- A windup ends in its shot, unless the player shoves the bot meanwhile: then it
  shoves back. After a shove the bot waits 1.5 s before the
  next, or less if the player has been standing for 0.3 s and nothing of its own
  has landed on them for a second.
- An attack is judged by what the bot sees of its result. Two in a row that
  barely move the player (pinned against a wall), or two shots at the player from
  about the same spot that meet something else first, make it back off for 0.7 s and
  hold its attacks for 2 s.
- Recovering from a shot in sight of the player, it does not turn its back on
  them.
- Without weight, stuck on a wall in view of the player without a shot for a
  second, it pushes off.
- A loose crate it presses on for a second, with too little headroom to jump on
  it, is shot out of the way, but the same crate not again for 30 s.

What the bot knows of the level's switches (plates, the exit lamp, float
switches, level gauges, gate contacts) starts as the level began and changes
only where it has a line of sight to them. It notices such fixtures all round,
not only ahead: they are part of the room, not the player.

A goal it cannot reach at all (an entrance behind a crawlspace, say) is approached
only as far as places it could come back from: a one-way drop taken just to be nearer
is a pit for good. The map holds up to 400 waypoints; a large cave whose surfaces
filled the old 160 had no ladders or ropes on it.

Breaking stalls (`botNavigation.ts`): pressing Up or Down on footing without
moving counts as stuck; a ledge caught three times in a few seconds, or a pull-up
the controller keeps turning back, is let go; a ladder-top pull-up that cannot
finish goes back down; a ledge caught just after stepping off it on the way down
is let go; a water exit leapt for three times or worked at for six seconds without
getting out gives way to another; and before any long planned jump it backs up
for a run-up. Pressing Up counts as stuck only within a ladder's boarding window,
and it walks right up to a ladder rather than easing off short of it. Three
seconds on one ladder without getting a body length and a half along it (someone
standing at its foot, say), it climbs back and sets that ladder aside, for longer
each time. Footing is
added at the foot and top of rises too steep to stand on, so a jump up one is on the
map (without it, a slope below such a rise is a pit to the planner), and a walk-off
drop may land a little past its waypoint on the same floor (a deck ending just inside
the floor below is otherwise a trap). A search
that has looked everywhere starts again from the place looked at longest ago. When every
place it can reach is in view (shut in a cage, say), no place is older than another, so it
paces to the far end each time instead; going back to the same nearest place had it turning
back and forth on the spot several times a second. After its own shot
it stands only briefly, then moves on while the arm recovers, steering in the air
too.

## Measuring it

`node scripts/rbot-hunt-lab.mjs` surveys every campaign level with an Rbot
(about two minutes on all cores):

- **Hiders**: the player stands still and silent on ten spots spread across the
  level for 60 s. How many it finds, how soon, how many it hits, its idle
  fraction and its longest idle streak (with where and why, in `--json`).
- **Runner**: the player heads for the nearest pickup, then the exit, by the
  planner's routes, for 90 s. First sighting, time in sight, idle, hits (and the
  bot's own shots and shoves), time within 250 units. Holding an ambush in view of
  the player is reported apart, as watching, not as idle.

`--trace <level> <x> <y>` prints the bot's state, plan and route every half second
for a player standing at a spot. Headless numbers cannot show whether the hunt
looks purposeful: watch it too (the dev server's L.A.B. levels, or the level
studio's playtest).

On the November 24 survey, against the morning's baseline, longest idle streaks
fell from 20 to 54 s on eight levels to about 5 s at most, and hiders found rose
from 134 of 170 to 144. Four independent review rounds (in the session's
`.local/rbot-hunt-20261124/reviews/`) took the rubric score from a capped 50 to 69
with no fairness cap. Orientation's
docked Rbot is asleep by design. The lab also reports `still`, the longest time
the bot went without moving a body length (outside windups, recovery and watched
ambushes), which catches a bot that bobs in place.

## Rubric

A reviewer scores the hunter out of 100:

| Criterion | Max | What earns it |
|---|---|---|
| Relentless | 20 | It is always doing something purposeful: no idle streak over 5 s anywhere in the survey, low idle fractions, and in play it never looks lost. |
| Prediction and interception | 20 | It uses the level: it heads where the player is going (remaining pickups, exit switches, the exit), cuts runners off, and does so for sensible reasons a player could understand. |
| Search | 15 | After losing the player, it follows sounds and the last-seen place, rules out what it can see, and sweeps on; hidden players are found when they are reachable. |
| Combat pressure | 15 | It shoots and shoves when it can, leads a steady runner, finds firing positions for players it cannot reach, and keeps pressure on without dithering. |
| Fairness | 15 | No knowledge of the hidden player; the windup and locked aim can be read and dodged; no stun-lock; a player who plays well can escape and finish. |
| Navigation under pressure | 10 | No loops, falls into traps of its own making, or water it cannot leave. |
| Readability | 5 | Its choices read as intent: no flip-flopping between targets, no turning back and forth. |

Caps: any use of the hidden player's position caps the total at 50; any idle streak
over 15 s in the survey (other than a docked bay) caps it at 70.

Ways to look for unfairness: a player hiding silently out of sight must not be
tracked through walls; a player collecting a coin out of sight and earshot must not
draw the bot; jumping once the arm has stopped tracking must dodge a shot on level
ground.
