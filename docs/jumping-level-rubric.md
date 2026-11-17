# Scoring a jumping level

**Written November 16, 2026**, from a review of the 36 timed courses behind the
facility's doors and the three levels of the escape route. It sharpens
[Making a fun jumping level](jumping-level-design.md) into findings that can be
checked and a 100-point rubric that a reviewer can apply to one level. The
design brief stays the authority on how to build; this says how to judge.

## What the catalog shows

Each finding names the courses it comes from. They are observations about what
holds up in the built-in set, not new mechanics.

1. **One question, said in a sentence.** The courses that hold up ask one thing:
   Drain (ride the ramps down, take the lift back), Nine (make nine in binary),
   Waterline I (three coupled shafts, one pattern), Full Tilt (how much speed
   can you keep), Level Five (the ball opens the gate you are standing behind).
   The weakest retired layouts asked "which corner coin next?" over and over.
2. **The question shows in the first view.** Lock Out I shows the tool, the
   field and the ball in one screen. Ramping Up starts the player beside the
   plate that runs the whole room. Where the opening view shows neither the
   obstacle nor the goal, the first ten seconds are spent walking, not thinking.
3. **What the player starts comes back to them.** The best mechanisms return a
   consequence the player then uses: Ramping Up's plate lifts balls that roll
   down the ramps the player is climbing; Drain's last coins release the ball
   pit; Turnaround sends the player out to change the way back.
4. **An ordinary way and a line worth learning.** Hop Skip Jump I completes in
   4.2 s on the upper line and 11.6 s by its ladders, and both are pleasant.
   Full Tilt pays its fastest line in coin tiers. A course with one viable line
   has a deadline; a course with two has a decision.
5. **Coins draw the route, thresholds make the choice.** Full Tilt opens at 10
   of 76 coins and the Scaffolds at about two thirds. All-coin exits (Drain's
   45, Scaffold I's 14) turn the last third of a run into cleanup unless every
   coin lies on the line.
6. **Short.** The median A time is 30 s; 19 of 36 courses have A at or under
   30 s, and 31 at or under 60 s. The median D deadline is 4.3 times its A.
   The long courses (Tower, Scaffold I, Escapade) earn their length with
   distinct sections and a changed return, not with more of the same storey.
7. **Recovery is another route.** In the Scaffold keepers a hit or a miss feeds
   into a different approach. A fall that only repeats a long climb is a tax.
8. **The wing's discipline is the subject.** A Gravity course is about a field
   changing what falling means. A Puzzles course is a system the player can
   read, reason about and revise. An Assessment course asks for several
   disciplines in one journey and lets the player choose a line through them.
9. **Three to five kinds of object.** Levels with one idea use few object
   types (Nine: toggles, relays, lamps). More types appear only in the large
   mixed courses, and there each section still uses a few.

10. **Speed carries, so a clean layout can play itself.** Running speed is kept
    through jumps, field boundaries and flips, and catches are forgiving. A
    course built only from well-tuned contacts can therefore be finished by
    holding one direction, with a jump or two for the fast grade. Several of
    the first courses reviewed against this rubric did exactly that on their
    first draft (Flip Side finished at B with no input but Right): every
    contact worked and nothing was asked. Play the null run (below) before
    anything else.

### Gaps worth filling

- **Gravity.** Every Gravity course uses upward lifts (strength 1 or 3) with
  balls and coins. No course is about walking on a ceiling, weightless drift,
  half or double gravity, or a switched field the player must choose to turn
  on or off. All of these are supported and dependable (see
  [gravity fields](jumping-physics.md#gravity-fields)).
- **Puzzles.** The catalog's logic puzzles are number or pattern puzzles (Nine,
  the Quarantine panels, the Waterline shafts). The panel, handoff and
  crossing components in [the logic puzzle specifications](jumping-logic-puzzles.md)
  have no course yet.
- **Assessment.** The four courses are large and each leans on one or two
  disciplines. None samples every wing's skill in one run with a choice of line
  at each station.

## The rubric

Score each criterion from 0 to its maximum. Half points are fine.

| Criterion | Max | Full marks | Low marks |
| --- | ---: | --- | --- |
| **Central idea** | 15 | One sentence names the place and the player's decision. The idea is new to the catalog or a real twist on one, and it is the wing's discipline. | A tour of object types; an idea another course already owns; a mechanic used as decoration. |
| **Readability** | 15 | The first view shows the first obstacle and where the run is headed. Every cause is seen with its effect. A hint sits before the decision it serves, in few words. | The player must try things to learn what they do. Text explains what the room should have shown. Lamps or meters with no visible subject. |
| **Routes and decisions** | 15 | An ordinary way, a skilled way and a recovery, each with a different reason to exist and a measured difference in time. At least one decision the player can get wrong and correct. | One corridor. Alternatives with the same effort and result. A shortcut that is strictly better and no harder. |
| **Movement** | 15 | Phrases with rhythm: speed is kept between obstacles, landings have run-out, contacts are dependable with a few frames of slack either way. | Forced stops, waits on machinery, long crawls or flat walks, a pixel-exact takeoff, a catch that works on one frame. |
| **Challenge** | 10 | The difficulty is a decision or a demanding move that reads as fair. A leaves a ceiling to chase; D admits a careful first run with two ordinary mistakes. | Trivial at A, or hard through luck, hidden rules or blind jumps. D that only a known route can meet. |
| **Recovery** | 10 | Every fall and misplaced prop leads somewhere useful within a few seconds, and the player can tell what went wrong. Intentional restart states are obvious. | A soft lock, a lost essential object, or a miss that repeats most of the level. |
| **Pacing and economy** | 10 | Length fits the idea (A at or under 30 s unless the journey earns more). Every object, coin and line of text does work. | Padding, cleanup coins, repeated storeys, clutter, clock suppression that makes time meaningless. |
| **Place and presentation** | 5 | The room has a purpose and a condition; machines are installed where they work; clock, meters and hints are composed in real camera views and stay clear of landings. | Floating parts with no reason, displays on top of each other or behind terrain. |
| **Evidence** | 5 | The file validates; a normal-control recording from a fresh start earns A with margin; the alternative and the recovery have been played; grade times come from those runs. | Times guessed; routes claimed but not played. |

### Caps

Apply after adding up. They stop a polished level with a broken core from
scoring well.

- A required move, catch or delivery that fails when played with normal
  controls: total at most 50.
- A soft lock the player cannot read as their own mistake: total at most 60.
- No recorded A route from a fresh start: total at most 65.
- The central idea can be skipped by a route that is no harder: total at most 70.
- The null run finishes: holding one direction from the start, with no other
  input except Up at the door, completes the course. Total at most 70, unless
  the course is an opening lesson whose whole purpose is that run.

### Bands

| Total | Meaning |
| --- | --- |
| 90 and up | Belongs in the campaign as it stands. |
| 80 to 89 | Good; named revisions would lift it. |
| 65 to 79 | A sound idea with real problems in routes, movement or reading. |
| Under 65 | Rework the layout or the idea. |

## Reviewing

A review is of one level at a time, by someone who did not build it.

1. Read the level file, its overview picture and its author's note. State the
   central idea in your own sentence before reading the author's.
2. Replay the recorded route and confirm the grade. Play the null run: hold
   the direction of travel and nothing else. Note where it stops, or that it
   finishes and with what grade. Then play at least one run the author did not
   record: the route a new player would try first, and one deliberate miss at
   the hardest move, to see where it lands and how long the return takes.
3. Check every claim that scores points: the alternative route's time, the
   recovery, the truth table of any circuit, the stability of any delivered
   prop after the player walks away.
4. Score each criterion with one or two sentences of reasons, apply the caps,
   and list the changes that would raise the score most, in order.

A headless replay shows what the simulation does. It does not show whether a
hint can be read at gameplay scale or whether a jump feels good in the hand;
say so where a score rests on that, and keep such judgments conservative.
