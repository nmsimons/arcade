# Making a fun jumping level

**Updated October 20, 2026.** This is the design brief for creating and
reviewing levels in L.A.B. Experiments (Leaps and Bounds). It draws on the built-in maps, the
authored Tower maps, and the local Night Shift collection. Existing levels are
references, not evidence that every placement in them is ideal.

Use this alongside [the campaign canon](jumping-campaign.md),
[level files and authoring](jumping-levels.md), and
[the physics contract](jumping-physics.md). The
[outdoor finale brief](jumping-outdoors.md) specifies the terrain, sky, and escape
reveal. These design documents distinguish approved direction from implemented
features; they do not themselves change mechanics or the file format.

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

First completion rewards understanding. A rewards a plan and fluent movement.
A missed jump creates another decision, a recovery, or a restart. There is no
death. The satisfying thought is “I see what I could do better.”

Most levels should take less than a minute, with A under 30 seconds. Large
levels such as Tower are welcome when their size creates a richer journey.
Length alone does not make a level substantial.

Readable causes, dependable interactions, and demonstrated completion are
requirements. The route patterns and pacing below are defaults to apply with
judgment. A level can bend a default when that produces a clear, enjoyable idea.

Performance and movement feel have the highest priority. Visual polish must fit
within that budget. Simplify or remove decorative work when it reduces frame
rate, input responsiveness, or the clarity of movement. Test representative
authored levels on the target machine; attractive still frames do not establish
that an effect is affordable during play.

## Campaign context

L.A.B. trained autonomous robots for useful work. Society collapsed, the staff
disappeared, and the facility's automatic systems continued. A power-recovery
cycle wakes one robot left in a charging bay. With no operator responding, it
forms its own goal: leave. The surviving route passes through every required
training area, ending in an escape into the outside world.

The [campaign canon and progression rules](jumping-campaign.md) are authoritative
for story levels. Completing a required level unlocks the next, including a
completion at D or better. B averages open optional advanced areas only;
they never gate the escape. The campaign has an authored order, an awakening,
and a definite ending. Experimental collections do not automatically become
required campaign areas.

Give each campaign space both an original training purpose and a present
condition. Early exercises teach recognizable tasks; later rooms combine those
skills with readable deterioration and improvised access. A playful movement
room can still belong to a mobility course. Preserve dependable physics,
alternative solutions, recovery, and the nonlethal character of the game.

Tell the story through use: abandoned work, dated notices, maintenance advice,
and machinery still following its routine. Official labels serve the facility;
red graffiti comes from people who worked there. Keep the cause and date of the
collapse unresolved. The robot's decision to leave and its eventual escape must
be clear without reading every wall.

The first full outdoor landscape belongs to the finale. Earlier daylight,
plants, or a restricted glimpse can foreshadow it, but reserve the broad sky,
open horizon, and playable natural ground for the
[escape reveal](jumping-outdoors.md). The player needs time and control to
experience that payoff.

Underground is a place, not a global time of day. Use authored cave back walls
below the surface and open daylight above them, so climbing out reveals an
actual change of enclosure. Preserve broad sky and playable natural ground for
the final emergence. Exit ends by running off the right edge into continuing
ground and sky. Keep that final approach open and readable in landscape and
portrait views; it needs no training door, indicator, or separate finish action.
An optional overlook finish can still offer a place to linger in other levels.
Use the standard cavern back wall. Keep outdoors equally simple: flat blue sky
and sparse clouds, with the playable terrain supplying the landscape. Light the
terrain according to its exposed surfaces, so a sunlit roof does not make its
deep cave wall glow. Review the robot's silhouette on both sides using its
normal day/night material palettes, preserving the shell, face, joints and markings.

Choose enclosure artwork separately from lighting. An indoor course may have a
day-lit upper area and a dark lower cave using the same course wall throughout;
mixed light does not require sky. Back walls are named background regions edited
with ordinary object and node tools. They must never introduce collision, cover,
or a level-specific movement rule.

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

Place recognizable background hardware deliberately. Grates, vents, cables, and
service panels should have chosen positions and a purpose in the room; do not
scatter them procedurally as wall texture. Shared surface treatments such as
panel joints and subtle interior edge relief can establish material depth
without adding implied machinery. Keep terrain silhouettes crisp, without
decorative drop-shadow halos. Keep decorative hardware clear of hints
and distinguish it from usable ropes, ladders, and powered mechanisms.

When a level promises a building, group its running surfaces into usable rooms
and connected rooflines. Let door openings, service passages and ladder hatches
explain how the storeys connect. A few substantial halls and open loading yards
read more clearly than a separate support under every ledge. Preserve the jump
arcs and recovery routes when adding walls; architecture is playable terrain.

Use the existing materials to distinguish ground, building, and machinery. Keep
their use consistent within the level. Material changes are visual cues; stone,
earth, chalk, and steel currently have the same collision and grip.

Give machines an installed place and a visible job. A floor grav emitter should
meet its boarding surface; a ceiling emitter should meet the underside that
holds it. Check the emitter edge, rather than only the field rectangle. Connect
the arrival, powered travel and departure to the surrounding room. Shaft walls
or a receiving tray should help the route work, rather than merely decorate an
otherwise unexplained machine. A few coherent work areas usually tell a clearer
story than adding a separate prop, joke and ladder at every gap. Let the player
experience the joke through an action, such as being handled by a parcel sorter.

## 2. Build routes with different reasons to exist

An elevated destination will often benefit from three related routes:

| Route | What it contributes |
| --- | --- |
| Ordinary access | A ladder, lift, rope, stairs, or walkway makes the place understandable and offers a dependable approach. |
| Skilled shortcut | A running jump, wall jump, rope transfer, or sequence of ledges trades execution risk for time. |
| Recovery | A missed move returns the player to somewhere useful, with a way to try again. |

These can share geometry. Every platform does not need its own ladder, and every
obstacle does not need a bypass. The level as a whole should usually offer more
than one meaningful solution or route. Two corridors with identical effort and
consequences do little work.

When offering high, middle and low lines, give them distinct elevations and
consequences. A higher destination lets the expert line keep its momentum while
lower arrivals choose a climb or lift. Leave enough separation for the middle
route's jumps and for readable falls between storeys; closely stacked shelves
can turn a route choice into an accidental ceiling collision.

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

For a wide left-to-right course, build short movement phrases with distinct
silhouettes: rising landings, a moving crossing, a swing, then a new takeoff.
Leave room to carry running speed between them. Connect missed jumps back into
the nearby section so a fall need not repeat the whole journey. If ordinary
access uses a moving platform, check its phase when the player actually arrives;
starting it on boarding can avoid an empty wait for its first return.

When promising a continuous fast line, record a run that holds forward through
the course and check the movement between obstacles, not just its completion
time. A forced pull-up, a swing that dies before release, or a wall that arrests
the next jump can break the rhythm of an otherwise quick route. Match receiving
platforms to the actual swing release arc, leave some running room after a
landing, and check modest timing variations. Short rope jumps and downhill
landings can carry a line more naturally than a full-height jump at every gap.

Coins should shape a journey: draw the eye toward a route, require a useful
detour, unlock a new part of a room, or bring the player back through a changed
space. Avoid making the player sweep every corner after the interesting part is
over. Use thresholds to create choices when collecting every coin is unnecessary.

### Teach different contact rules where they first matter

Visually related objects can need different actions. An airborne rope catches
automatically; a ladder needs vertical input. A swimming player can catch a
terrain bank automatically, while a loose float needs Up to request a grip.
Force fields support and block the player without offering a lip grab, and loose
props pass through them. EMP activates on collection and can remove a field or
stop a moving support. Introduce these differences in a recoverable encounter
before combining them with a timing challenge. Let the player see a useful
escape and the consequence of a missed grip or power change.

Prefer action names such as “hold jump” or “hold up” in authored graffiti;
the live controls and action cue supply the current device binding. Review
the text from the approach and recovery positions at narrow gameplay scale.
A hint on the wall behind solid terrain, or a sentence clipped halfway through
its action, does not teach the rule. Keep each hint local and brief rather than
listing every movement rule in the room.

Equipped forearm gadgets preserve normal traversal. Do not build routine
drop/climb/retrieve chores around a ladder, ledge, or push. Aim/use pause only
while the equipped right arm supports the player; red object fields detach the
sleeve while the player continues. Teach this tool boundary through a useful, recoverable
choice. See [the gadget contract](jumping-carried-gadgets.md) for the shared rules.

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

When beams should have a uniform thickness, measure it perpendicular to each
surface segment and join the offset undersides with miters. Equal vertical
offsets make slopes thinner than horizontal members. Walking surfaces can stay
on the authoring grid while calculated underside vertices fall between grid lines.

Attach a rope at a platform end to its top corner, rather than its underside.
Keep the free end deliberately placed when changing the anchor. Ladders are
foreground passages: an attached player or Rbot can climb through terrain, so
platform crossings need no gap. Put the authored upper end at or above the
intended landing and leave clear standing space there and at intermediate exits.
The hands transfer to the deck's lip for a rear-facing ledge mantle. Down deliberately
boards a ladder through a floor; ordinary walking keeps that floor solid.
Gates, movable objects and the actor's blocking forcefields still obstruct the
ladder route. Side-mounted ladders can retain their hand-to-ledge transfer.

The entrance is a doorway, with a 40-unit flat sill and 80 units of clear
headroom. Work that landing into the architecture instead of placing the player
directly on a slope or balancing the door on a narrow ledge. Review the opening
from a fresh start: the silhouette emerges and the door closes before machinery
and the medal clock activate automatically.

The supported charging-bay entrance gives the campaign's
[opening](jumping-campaign.md#opening-wake) its awakening, with both feet planted
and no door sequence. Give that first occupied pod a readable capsule silhouette
and enough screen space to make the awakening matter. Use a short, clear sequence
of restored power, the robot waking, and the cover releasing; reveal the room
before handing over control. Keep its light restrained and its cradle visible
after departure. Layer the glass and front sill over the robot, including its
feet, so the occupant reads as inside the capsule rather than standing in front
of a wall panel. Use an authored, flat steel plinth when the robot should
step or hop down from the pod; keep that first descent small and recoverable.
Ordinary entrances retain the doorway contract above.
An Rbot's optional charging bay can echo that awakening in a later encounter.
Keep the sleeping occupant visible from the approach and let ordinary sight or
sound start its local wake-up while the player retains control. Leave a useful
escape and readable space around its wider capsule; the pod artwork supplies
no containment. Use a single installed unit when the story calls for one
recurring hunter, rather than adding decorative copies of the adversary.
The [final outdoor coda](jumping-campaign.md#finale-outside) still needs separate
runtime support before authoring.

Build around the actual movement envelope. The wall grid uses 20-unit tiles;
crouching fits a two-tile opening, and automatic step climbing reaches three
tiles under suitable conditions. These are useful starting dimensions, not proof
that any corner or ceiling arrangement will work. Test approaches, transitions,
and exits using normal movement. Editor snapping uses 5-unit steps independently
of these wall tiles; use that precision when the route needs finer placement.

Give ledge hangs and pull-ups room. Test rope exits where the rope meets a slope.
Treat a pool as a space with a visible, usable exit. Give its rim an exposed
grippable edge and room for the player's body and landing, or provide a lower
bank or ladder. Test reaching and pulling out from the water with normal controls;
a nearby top surface alone does not establish an exit. Consider floating props,
a blocked pull-up when reviewing recovery. Water is always present; switches and
EMPs cannot empty the pool.
Give water physical containment: a visible basin floor and banks that reach its
waterline. Compose the reservoir and its access together, including ramps or
steps where the lower route enters and leaves it. An open water rectangle with
no containing architecture does not read as a pool.
Flooded passages can place coins and other pickups below the surface. Give the
player room to dive, turn, and stop beside the item; submerged steering maintains
depth and release eases into an upright float after a short glide. Test the passage in both directions
and test returning to the surface with Up. Size openings for the actual collision
envelope and visible limb clearance, including the turn and release poses, rather
than assuming the prone drawing fits any thin slot. A covered route should show
its continuation or a usable way back before the player commits to it.
Leave enough space to approach a box and push it from the useful side. Avoid
packing a box, ball, and shovebot into the only place the player can hang or
land. The challenge should survive small differences in movement and prop
placement.

Shovebots work best as readable moving interference. Terrain and objects can
break their line of sight, creating refuges and timing choices. Standing on a
bot can be an expert opportunity; its acceleration makes it an unreliable lift.
Give a first encounter space to retreat or get above it. Increasing aggression
inside a cramped physics pile is rarely a good difficulty progression.

Rbots can operate controls, so include their access when designing a trap.
A control in the hunter's approach can change state before the player reaches
it. Place the control deliberately and test which side of the barrier contains
the hunter when it activates. Consider a reversible control when an early seal
can trap the hunter on the exit side; test reopening it, luring the hunter
through, and sealing it again with normal movement. Verify the resulting trap
against pursuit and firing, rather than assuming that reaching the switch ends
the encounter.

Receiving plates can meet the level boundary. Put the plate under the ball's
actual resting center; do not add a stop solely to work around an editor inset.
Use a separate stop when it serves the layout, rather than requiring one for a
boundary receiver.

When a layout exposes a movement bug, reproduce and fix the shared rule with a
regression test. When a layout simply demands an unreliable maneuver, change
the layout. Do not add object-specific exceptions to make one puzzle work.

## 5. Put guidance and displays on the wall thoughtfully

### Graffiti is the voice of a hint

Use the existing red graffiti style for short, human advice near a decision:
“leave something heavy,” “ladder's out,” or “the clock stops. you don't.” Use
official text for functional labels such as a room name or destination.
These labels should read as painted facility stencils; reserve monospace machine
lettering for message screens.

A hint should point toward a relationship or overlooked possibility. It need
not narrate the solution. Place it where the player can read it before the
relevant action, from a safe position. A second, more specific hint can appear
near the difficult part if it earns its space.

Keep text brief. Rotate it with purpose and retain legibility. Avoid scattering
instructions across every surface or recreating a tutorial HUD on the wall.
Check the actual camera view: wall items render behind terrain and physical
objects, so an important sentence can become obscured.

Use L.A.B. crate stencils and wall stamps sparingly to suggest the place's
ordinary use. Crate branding is an opt-in appearance choice; plain crates remain
part of the same world. Keep facility marks separate from functional labels and
graffiti hints, with enough space that they do not compete with movement,
collectibles, clocks, or the advice a player needs to read.

Optional wires should read as thin cables mounted on the back wall. End them at
small wall terminals near the connected equipment, leaving a clear gap; avoid
heavy conduit or cables that run directly into a floor switch or moving part.
Keep exit terminals clear of both the indicator pole and the doorway. Wires
approaching from below should rise beside the exit assembly to a separate wall
jack, rather than ending on the pole.
Keep their paths quiet and clear of important lettering. Use the built-in soft gray-green
inactive and quiet green energized appearances to reveal cause and effect.
Color shows each source's signal; the destination may still be waiting for
other inputs. Keep the indication thin and still. A small, soft glow makes live
wires easier to see in Night mode; it should not overwhelm the center line.

Use a message screen for a brief machine status such as “OPERATOR CONNECTION /
NO RESPONSE.” Its dark frame and restrained green phosphor belong to the same
hardware family as clocks. Give it clear space and check its message at gameplay
scale, especially in Night mode. A screen can suggest that an unattended system
is still running; it does not need scrolling diagnostics, a reading delay, or a
large block of lore. Keep human hints in graffiti and destinations in official
lettering. Prefer one purposeful screen to a wall of competing readouts.

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
Size a plate receiver around the object's actual resting contact: a ball loads
the floor beneath its center. Put a physical stop where a freely rolling ball
will remain on the plate; do not depend on the player's hands braking a downhill
delivery or on the ball's silhouette merely overlapping the plate. Check the
receiver after the player releases and walks away.
A chain should tolerate ordinary variations in contact and arrival time. Exact
corner impacts, lucky bounces, and dependence on a bot's initial patrol phase
make poor mandatory links. Test from a fresh load and repeated restarts, with
slightly different inputs.

Keep the player involved: preparation, release, boarding, interception, or taking
a newly opened route. Watching a satisfying short reaction is a reward. Waiting
through a long automatic sequence on every gold attempt is a tax.

Use the logic the game actually has. Coin thresholds share the level's collected
count, do not spend coins, and latch once powered and reached. Switched items
default to OR; choose AND for all connected inputs or XOR for exactly one,
optionally reversing the result. One switch can control several mechanisms.
Use a dedicated logic relay for intermediate combinations that need no visible
world object. Physical items can also relay their result when their ordinary
behavior earns a place in the puzzle. Logic nodes are invisible during play,
so make their causes and consequences readable through the actual buttons,
lights and mechanisms. More elaborate sequencing can come from geometry and
motion; programmable delays are not supported.

For reusable circuits and their route, recovery, and playtesting criteria, see
[Button and light puzzle specifications](jumping-logic-puzzles.md). The seven
components cover lamp patterns, agreement, load counts, grouped selections,
load handoffs, changing a crossing into an exit configuration, and buoyant levers
that react to water or grav lifts.

Connections are optional. A switch may serve as a coin meter without activating
anything, and a gate, platform, or switched lamp may remain unconnected. Give
these objects a considered role in the layout; saving and playtesting must not
require wiring every object or invent a connection on the author's behalf.

Choose each plate's behavior deliberately: Pressure needs a continuing load,
Switch preserves a completed action, and Toggle allows the player to reverse it
after releasing and pressing again. Make the consequence legible, especially
for an initially on Switch or Toggle. A Switch that starts on can make a shutdown
permanent until restart; its depressed plate marks the completed action.
Exits default to Always on; a locked exit needs an
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

Set grade deadlines from completed runs, including the approach into the exit doorway.
Activating a switched exit opens it; scoring locks when the player enters
the doorway. An object can activate a connected plate, but it cannot complete that final
journey for the player.

- **A:** an attainable, demonstrated run with a good plan and confident
  execution. Do not require unexplained physics tricks or perfect luck.
- **B:** a sound route with some hesitation, extra travel, or a modest
  recovery.
- **C:** a reasonable learning run that still has momentum.
- **D:** a realistic first completion, including time to read the room and make
  a considered recovery. It must still require purposeful play, rather than
  making the deadline irrelevant. Tune this separately for each level.
- **F:** the D deadline has expired. Keep the world playable for exploration,
  but this run cannot unlock the next level, even after a time refund. Grey
  time bonuses, penalties and both stopwatches remain visible and uncollected.
  Coins, gadgets and mechanisms continue working.

Campaign progression requires D or better, except untimed story sequences.
Clocks show the current grade and time remaining until F; at F they dim at zero.
Locked picker slots reveal only their number and locked status, never a name,
thumbnail or action that exposes the level. The authoring library remains available.
For the
fixed source groups, point values, and permanent unlocks used by optional
advanced areas, follow the [certification rules](jumping-campaign.md#optional-advanced-areas).

Tune each level individually. Automatic multipliers cannot account for lift
cycles, refunds, or alternate routes. Clever solutions within the game's rules
are welcome; they are a reason to evaluate the level, not automatically patch
the shortcut away.

For D, budget time to understand the level's new decision and recover from a
couple of ordinary mistakes. Count the actual return journey after a fall,
another lift cycle, correcting a load, or reversing a mistaken switch choice;
do not just add a few seconds to the expert route. Later courses can rely on
skills already taught, while allowing time to understand their new combination.
Check a route without perfectly timed refunds or stopwatches when those rewards
are optional. Do not make the next unlock depend on knowing the fastest line.
The [D-time review through World I](jumping-d-time-review.md) records the current
deadlines, reasons, route evidence and remaining playtest limits.

Keep normal-control recordings of measured routes against the current level
files, and replay them from a fresh start after movement or puzzle changes.
Capture the reviewed layouts alongside long-lived regression recordings in
`tests/fixtures/` so Studio edits and retired courses do not break old physics
checks. Keep those checks distinct from fresh audits of the current catalog;
passing a captured route does not certify a subsequently edited level.
Include required cargo deliveries and continuing plate loads in the evidence.
Give A some execution margin beyond a reproducible input recording; it is
a demonstration of attainability, not a substitute for playing at normal speed
or reviewing readability and enjoyment.

If a recording is much slower than an author's or player's completed run,
investigate their route before relaxing medals. A successful recording alone
does not establish a fluent gold route.

## 8. Reuse good patterns, not entire answers

| Reference | Pattern worth carrying forward |
| --- | --- |
| [First Leap](../public/levels/jumping/00.json) | A direct challenge and a recovery ladder that preserves the original problem. |
| Cross Purposes (retired reference) | One action helps access and complicates the crossing. |
| [Turnaround](../public/levels/jumping/07.json) | Travel outward to change the route back toward the goal. |
| [Tower I](../public/levels/jumping/Tower.jump-level.json), [Tower II](../public/levels/jumping/Tower%20II.jump-level.json) | Repeated architecture with different local connections, props, and access problems. |
| [Coins](../public/levels/jumping/Coins.jump-level.json) | Shared coin progress unlocks different stages of the same place. |
| Night Shift: Valve One | A moving-platform crossing with a useful recovery path and a timing decision at departure. |
| Night Shift: Nothing to Declare | Coins and a weighted plate offer materially different solutions. |
| Night Shift: Tower of Receipts | A large vertical journey with a return route and late refunds that give descent a purpose. |

Night Shift is a local authoring reference, not a required repository
asset. The lesson is its structure. Display placement, difficulty, and timing
still deserve review when reusing a pattern.

## 9. Author, play, simplify

1. Write the place's purpose and central decision in one sentence. Identify what
   the player already knows and what this level adds.
   For a campaign level, also identify its training purpose, present condition,
   chapter position, and contribution to the journey toward the outside.
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
- For a campaign level, does its place and condition fit the canon? Does a valid
  D-or-better completion advance the required route? Are optional
  certification requirements visible and separate from that route?
- For the opening and finale, have their story beats, input, scoring boundaries,
  and presentation been reviewed against the campaign and outdoor briefs?
- What can be removed without weakening the idea?

File validation and automated route checks are valuable, but do not establish
fun or legibility. Play at normal speed as well. Add regression coverage for
bugs found during playtesting, and keep level design within dependable shared
mechanics.
