# Making a fun jumping level

**First draft — September 27, 2026.** This is the design brief for creating and
reviewing levels in Untitled Jumping Game. It draws on the built-in maps, the
authored Tower maps, and the local Night Shift collection. Existing levels are
references, not evidence that every placement in them is ideal.

Use this alongside [level files and authoring](jumping-levels.md) and
[the physics contract](jumping-physics.md). This document describes design intent;
it does not introduce new mechanics or change the file format.

[Flat lighting](jumping-lighting.md) provides an
object-by-object visibility contract and lighting-specific authoring checks. Version-2 files support spotlights and a shared night-lighting baseline.
When authoring lighting-enabled levels  place fixtures as part
of the building and generally let one or two spotlights organize each playable
area. Enable Night mode for lighting; every night uses 35% ambient brightness (the original 0 setting).
Night mode off is fully lit. Zero is a readable baseline, not black;
the goal's green indicator remains readable without lighting the room.

## The promise

A good level feels like a small place worth figuring out. Its ordinary use is
legible. A gap, lock, awkward machine, or interruption creates a problem. The
player discovers more than one way through it.

First completion rewards understanding. Gold rewards a plan and fluent movement.
A missed jump creates another decision, a recovery, or a restart. There is no
death. The satisfying thought is “I see what I could do better.”

Most levels should take less than a minute, with gold under 30 seconds. Large
levels such as Tower are welcome when their size creates a richer journey.
Length alone does not make a level substantial.

Readable causes, dependable interactions, and demonstrated completion are
requirements. The route patterns and pacing below are defaults to apply with
judgment. A level can bend a default when that produces a clear, enjoyable idea.

## 1. Give the place a purpose

Before placing obstacles, describe the level in one sentence: “A delivery lift
has stopped below the loading dock,” or “The bridge opens with the warehouse
door, so crossing becomes the problem.” That sentence should suggest both the
space and the player's decision.

Tell a little story through architecture, objects, and changes of state. A broken
ladder, a crate beside a lift, and a handwritten warning can explain a situation
without a paragraph of lore. Names can finish the thought. Humor and surprise
work well when the player discovers them by acting.

The place can be stylized and improbable. Floating platforms belong here. It
should still suggest how someone normally uses it: a maintenance route, freight
access, a stairwell, a crossing, or a way to return home. Do not add decorative
supports or clutter solely to justify every platform.

Use the existing materials to distinguish ground, building, and machinery. Keep
their use consistent within the level. Material changes are visual cues; stone,
earth, chalk, and steel currently have the same collision and grip.

## 2. Build routes with different reasons to exist

An elevated destination will often benefit from three related routes:

| Route | What it contributes |
| --- | --- |
| Ordinary access | A ladder, lift, rope, stairs, or walkway makes the place understandable and offers a dependable approach. |
| Skilled shortcut | A charged jump, wall jump, rope transfer, or sequence of ledges trades execution risk for time. |
| Recovery | A missed move returns the player to somewhere useful, with a way to try again. |

These can share geometry. Every platform does not need its own ladder, and every
obstacle does not need a bypass. The level as a whole should usually offer more
than one meaningful solution or route. Two corridors with identical effort and
consequences do little work.

The ordinary route gives the shortcut context. Waiting for a lift, bringing a
crate, or walking back to a ladder makes a daring jump a considered choice.
Conversely, the ordinary route should remain satisfying to use. Excessive waiting
and long empty walks make it feel punitive.

Measure the tradeoff. A route that looks faster may lose time to acceleration,
boarding, or recovery. A ladder may beat an elaborate jump sequence. Decide
whether that discovery is a useful surprise or a reason to revise the layout.

### Interrupt the ordinary route deliberately

A locked door, difficult-to-activate elevator, or broken ladder can turn familiar
infrastructure into a puzzle. Two separated ladder segments can communicate a
break and invite a jump, prop, or alternate approach.

Let the player understand the interruption before making a large commitment.
Show the gap in the ladder, the locked passage, or the relationship between a
plate and a lift. A route that looks usable should not fail because of a tiny
collision snag or an unreachable last rung.

Restoring access and improvising around it can be two different solutions. Later
levels can close the comfortable route entirely, provided the remaining solution
uses readable, established mechanics. Avoid requiring the player to try every
door just to find out which ones matter.

### Make falling part of the layout

Give the level a continuous, nonlethal base and a considered recovery route.
First Leap's ladder returns the player to the starting side of the gap: the miss
costs time and preserves the challenge.

A fall need not erase an entire large level's progress. Lower routes, intermediate
landings, and connections back into the structure can make recovery interesting.
Intentional states that require restarting are acceptable, especially in advanced
puzzles, but the player should understand the mistake. Accidental wedges and
unexplained loss of an essential object are layout defects.

## 3. Teach a pattern, then give it a twist

Introduce an idea in a readable setting, let the player use it, then combine it
with something familiar. Across a collection, reuse patterns so that recognition
becomes a skill: a coin threshold, a returning lift, a low passage, a rope over a
gap, a box that can hold a plate.

Keep an early level's central question small. Later levels can combine those
questions. New mechanics do not all need to appear in the next map, and a map
does not improve simply by containing more object types.

Some rooms can be almost entirely about movement: a satisfying run of jumps,
coins tracing a climb, or a rope transfer that feels great when it comes together.
Give these the same care as a machine puzzle. Preserve room for momentum, playful
experimentation, and solutions the author did not anticipate.

Coins should shape a journey: draw the eye toward a route, require a useful
detour, unlock a new part of a room, or bring the player back through a changed
space. Avoid making the player sweep every corner after the interesting part is
over. Use thresholds to create choices when collecting every coin is unnecessary.

Large levels need distinct sections and a visible sense of progress. Tower's
repeated building bays make its structure readable while doors, props, and lift
connections change the local problem. A return journey can be especially strong
when earlier actions have changed the route. Repeating the exact same obstacle
at greater height usually adds duration rather than depth.

Between demanding levels, include a brief, playful idea that lets the player
move confidently. Challenge needs a rhythm across the collection.

## 4. Shape movement without fighting it

Vary silhouettes and elevations. Occasionally cant a platform or use a sloping
beam: it can change a takeoff, create a different landing height, guide a ball,
or make a room feel less assembled from identical shelves. Existing polygon and
terrain-profile tools support this; it does not require a new rotating-platform
mechanic.

Use shallow inclines intentionally, with clear endpoints and generous receiving
surfaces. Preserve flat areas where a crate must rest, a plate must be loaded, or
the exit needs support. A slightly tilted platform can introduce a useful choice;
a field of arbitrary angles makes movement harder to read.

Build around the actual movement envelope. The editor grid uses 20-unit tiles;
crouching fits a two-tile opening, and automatic step climbing reaches three
tiles under suitable conditions. These are useful starting dimensions, not proof
that any corner or ceiling arrangement will work. Test approaches, transitions,
and exits using normal movement.

Give ledge hangs and pull-ups room. Test rope exits where the rope meets a slope.
Leave enough space to approach a box and push it from the useful side. Avoid
packing a box, ball, and shovebot into the only place the player can hang or
land. The challenge should survive small differences in movement and prop
placement.

Shovebots work best as readable moving interference. Terrain and objects can
break their line of sight, creating refuges and timing choices. Standing on a
bot can be an expert opportunity; its acceleration makes it an unreliable lift.
Give a first encounter space to retreat or get above it. Increasing aggression
inside a cramped physics pile is rarely a good difficulty progression.

When a layout exposes a movement bug, reproduce and fix the shared rule with a
regression test. When a layout simply demands an unreliable maneuver, change
the layout. Do not add object-specific exceptions to make one puzzle work.

## 5. Put guidance and displays on the wall thoughtfully

### Graffiti is the voice of a hint

Use the existing red graffiti style for short, human advice near a decision:
“leave something heavy,” “ladder's out,” or “the clock stops. you don't.” Use
official text for functional labels such as a room name or destination.

A hint should point toward a relationship or overlooked possibility. It need
not narrate the solution. Place it where the player can read it before the
relevant action, from a safe position. A second, more specific hint can appear
near the difficult part if it earns its space.

Keep text brief. Rotate it with purpose and retain legibility. Avoid scattering
instructions across every surface or recreating a tutorial HUD on the wall.
Check the actual camera view: wall items render behind terrain and physical
objects, so an important sentence can become obscured.

### Coin meters belong to an objective

Treat a coin counter as a small status display. It does not need to dominate
the room, sit beside every coin, or lie directly in the player's path. The player
does not need to touch a coin switch to activate it.

Prefer one compact, legible display in a deliberate position: a top corner of
the relevant room, above the goal, or beside the gate or lift whose threshold it
represents. “Top corner” means a useful camera view, not the far corner of a
large map that the player never sees.

If several thresholds control different mechanisms, make each relationship
clear through proximity and a short label where necessary. Group related meters
with consistent spacing. Avoid several unexplained bars that appear to measure
the same objective.

New numeric coin counters use a compact six-by-two-tile face, matching clocks.
Older progress bars remain supported: horizontal bars can be six tiles wide and
one tile tall, and the vertical form swaps those dimensions. Convert old bars
deliberately and review nearby text and terrain after the footprint changes.

### Clocks should be easy to consult and easy to ignore

Place a clock in a quiet corner, near a significant decision, or above the exit.
It should help the player judge the run without competing with a landing,
collectible, hint, or character silhouette.

One display often serves a small level. Large levels may justify additional
clocks at major rooms or return points. Every display shows the same time; each
extra clock needs a visibility reason. Current clocks have a fixed six-by-two
tile footprint, so make them unobtrusive through placement rather than assuming
they can be resized.

Compose clocks, meters, and text together, with consistent margins and clear
space around them. Inspect them at gameplay scale, including while moving.
Cleanliness comes from fewer purposeful elements and disciplined use of the
existing palette, textures, and text styles.

## 6. Build more small chain reactions

Rube Goldberg situations fit this game: the player sets something in motion,
sees why the next thing happens, and uses the result. Start with a short chain of
two to four visible consequences. Complexity should come from relationships
between familiar objects.

These are patterns to prototype and playtest, not prevalidated layouts:

| Pattern | Possible sequence | The player's decision |
| --- | --- | --- |
| Delivery chute | Coins open a horizontal gate supporting a ball; the ball rolls down a canted surface into a plate's receiver; the plate powers a lift. | Prepare the route, then collect the final coin and board. |
| One switch, two consequences | A parked crate opens a door and retracts a bridge. | Restore the crossing, or use a rope and keep the door open. |
| Weight handoff | A released ball takes over a plate from a crate. | Recover the crate and use it as a step elsewhere. |
| Power interruption | EMP pauses machinery while a loose ball continues rolling into position. | Choose when to interrupt the machinery and where to be when it resumes. |
| Remote exit | A delivered object presses a separate plate connected to a switched exit. | Arrange the delivery, then travel to the doorway. |

The chain should be understandable in motion. Show the first cause and its
immediate effect together where possible. For a larger machine, let the player's
route reveal each connection. Provide a safe place to observe a first activation.
Avoid requiring a camera-wide search for an unseen consequence.

Give moving props generous ramps, bounded receivers, and stable resting places.
A chain should tolerate ordinary variations in contact and arrival time. Exact
corner impacts, lucky bounces, and dependence on a bot's initial patrol phase
make poor mandatory links. Test from a fresh load and repeated restarts, with
slightly different inputs.

Keep the player involved: preparation, release, boarding, interception, or taking
a newly opened route. Watching a satisfying short reaction is a reward. Waiting
through a long automatic sequence on every gold attempt is a tax.

Use the logic the game actually has. Coin thresholds share the level's collected
count, do not spend coins, and latch once powered and reached. Multiple active
switches targeting a mechanism provide alternative activation, not an AND
requirement. One switch can control several mechanisms. More elaborate sequencing
can come from geometry and motion; do not assume programmable delays or logic
gates exist.

Connections are optional. A switch may serve as a coin meter without activating
anything, and a gate, platform, or switched lamp may remain unconnected. Give
these objects a considered role in the layout; saving and playtesting must not
require wiring every object or invent a connection on the author's behalf.

Choose each plate's behavior deliberately: Pressure needs a continuing load,
Switch preserves a completed action, and Toggle allows the player to reverse it
after releasing and pressing again. Make the consequence legible, especially
for an initially on Toggle. Exits default to Always on; a locked exit needs an
explicit switch connection. Use Always on for a continuously cycling lift when
operating a switch adds no meaningful decision.

EMP pauses mechanisms and shovers globally for five seconds. Coins still count,
but a newly reached coin threshold waits for power before switching; an already
latched switch stays latched. Always-on exits remain open; switched exits follow
their inputs, including a Pressure plate turning off. Loose props and the player
keep moving, and stopped machines and bots remain physical obstacles. These
rules can create a puzzle, but should not become a hidden exception needed to
understand an introductory one.

## 7. Make time a route choice

Use collectibles to change decisions, not just decorate the fastest path. A
stopwatch can reward a detour before a long traverse. A time refund can reward
returning through a difficult room after time has accumulated. A visible penalty
can make a shorter passage a real tradeoff.

Respect the differences: the good stopwatch pauses the clock for ten seconds;
a numbered bonus removes up to its value from elapsed time, stopping at zero.
Unused refund is lost. A numbered penalty adds time, and the bad stopwatch makes
the clock run at twice its normal rate for five seconds. EMP affects machinery,
not the clock.

Place harmful collectibles where the player can see and evaluate them before
contact. Avoid concealing them behind attractive pickups or putting an
unavoidable surprise penalty just before the exit. A deliberately costly route
should advertise its cost.

Avoid handing out enough clock suppression to make a level's timing meaningless,
unless that is the level's explicit, satisfying discovery. Record both clock time
and real play duration when tuning a level with time effects.

Set medals from completed runs, including the approach into the exit doorway.
Activating a switched exit opens it; scoring locks when the player enters
the doorway. An object can activate a connected plate, but it cannot complete that final
journey for the player.

- **Gold:** an attainable, demonstrated run with a good plan and confident
  execution. Do not require unexplained physics tricks or perfect luck.
- **Silver:** a sound route with some hesitation, extra travel, or a modest
  recovery.
- **Bronze:** a reasonable learning run that still has momentum.
- **No medal:** a valid completion. Do not treat exploration as failure.

Tune each level individually. Automatic multipliers cannot account for lift
cycles, refunds, or alternate routes. Clever solutions within the game's rules
are welcome; they are a reason to evaluate the level, not automatically patch
the shortcut away.

## 8. Reuse good patterns, not entire answers

| Reference | Pattern worth carrying forward |
| --- | --- |
| [First Leap](../public/levels/jumping/00.json) | A direct challenge and a recovery ladder that preserves the original problem. |
| [Cross Purposes](../public/levels/jumping/06.json) | One action helps access and complicates the crossing. |
| [Turnaround](../public/levels/jumping/07.json) | Travel outward to change the route back toward the goal. |
| [Tower I](../public/levels/jumping/Tower.jump-level.json), and the local Tower II | Repeated architecture with different local connections, props, and access problems. |
| [Coins](../public/levels/jumping/Coins.jump-level.json) | Shared coin progress unlocks different stages of the same place. |
| Night Shift: Valve One | A moving-platform crossing with a useful recovery path and a timing decision at departure. |
| Night Shift: Nothing to Declare | Coins and a weighted plate offer materially different solutions. |
| Night Shift: Tower of Receipts | A large vertical journey with a return route and late refunds that give descent a purpose. |

Night Shift and Tower II are local authoring references, not required repository
assets. The lesson is their structure. Display placement, difficulty, and timing
still deserve review when reusing a pattern.

## 9. Author, play, simplify

1. Write the place's purpose and central decision in one sentence. Identify what
   the player already knows and what this level adds.
2. Sketch ordinary access, a faster or otherwise different solution, and
   recovery. Identify any intentionally broken or locked connection.
3. Build and play the routes with minimal geometry. Verify that both the
   comfortable and ambitious approaches work before adding complications.
4. If the idea calls for an interruption or chain reaction, add it. Check that
   its cause and consequence are legible and that machinery has room to operate.
5. Place purposeful coins and time effects. Compose graffiti, meters, and clocks
   in actual camera views. Apply materials consistently.
6. Test successful runs, mistakes, and alternate solutions. Record medal evidence
   and revise anything that relies on luck or a fragile interaction.
7. Remove objects, text, and empty travel that no longer earn their place.

### Review before calling it ready

- Can a new player see the immediate opportunity and understand the first
  obstacle without being told the whole solution?
- Does the ordinary route make sense? Is its interruption intentional and
  visible? Does another route offer a meaningful difference?
- Do falls, missed boarding attempts, and misplaced props have understandable
  consequences? Are required recoveries actually usable?
- Can every required jump, crouch transition, hang, rope exit, and object move be
  performed with normal controls from a fresh start?
- Do chains reset reliably and tolerate variation? Test riders, obstruction,
  early and late arrivals, and EMP expiry where relevant.
- Are hints readable before they are needed? Are displays compact, deliberately
  placed, and clear of important movement and silhouettes?
- Has someone completed the intended route and each advertised alternative?
  Has a real gold run reached the doorway within the threshold?
- Is it enjoyable to replay? Is any frustration caused by a decision or a
  demanding move, rather than unclear collision, prolonged waiting, or clutter?
- What can be removed without weakening the idea?

File validation and automated route checks are valuable, but do not establish
fun or legibility. Play at normal speed as well. Add regression coverage for
bugs found during playtesting, and keep level design within dependable shared
mechanics.
