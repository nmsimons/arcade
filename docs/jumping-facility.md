# The facility: wings, course doors and the evaluation

**Proposed design spec, November 1, 2026. First slice in progress.** Tracked in
[issue #91](https://github.com/nmsimons/arcade/issues/91).

**Status (November 6, 2026).** The facility is L.A.B.'s game: `/lab` opens it
in every build. The level grid is the development library at `/lab/library`,
in development builds only. What exists:

- The campaign file, which names only where a new game starts (`campaign.ts`).
  Everything else is read from the levels (`resolveCampaign` in `facility.ts`):
  the areas the robot can reach from the start, the wings, their courses, the
  dispatch door, and where exits, level doors and bulkheads lead and arrive. All
  of it is set in the level studio and checked by `npm run levels:check`.
- Facility areas: hub levels (`"kind": "hub"`) with level doors (`courseDoors`),
  bulkheads and evaluation boards (`hub.ts`). Up enters an open door. Every
  door has where it leads lettered on the wall above it: a level door its
  course (the dispatch door DISPATCH), a bulkhead the area beyond. A level
  door's placard is a screen of its course's data: its D deadline, then its
  best time and grade. The evaluation board shows each wing's passes, or SEALED.
- The level studio edits all of it. **Type** in the Level tab switches a level
  between Course and Facility area (a doorway exit becomes a bulkhead, and
  back). In a facility area, the Facility tools place level doors, bulkheads
  and evaluation boards, and **Leads to** in the inspector chooses each door's
  level (any course in the collection) or each bulkhead's facility area (any
  other facility area in the collection). The studio shows doors as the
  facility does: lettering, placards and boards as a new save sees them, and
  each level door or bulkhead named by where it leads, with no name of its
  own. A playtest opens every door.
- The facility loop (`facility.ts` and the game shell): a new save wakes in
  Orientation; a course returns the robot to its door, and a bulkhead leads to
  the matching bulkhead beyond it. The robot's place, Orientation included,
  autosaves on every move, and a returning save resumes there. The pause screen
  uses the phosphor style, with Restart area in facility areas and Restart
  course and Leave course in courses.
- The start screen ([issue #104](https://github.com/nmsimons/arcade/issues/104)):
  `/lab` stops on the robot's system display over the place it wakes in, with
  Continue, Progress and Restart, and the facility plays at `/lab/facility`
  (see [The start screen](#the-start-screen)).
- The opening, Orientation (`Orientation.jump-level.json`): an untimed
  facility area that wakes in Wake's charging pod at night, at the bottom of a
  pit under broken floor. The room above is a dead end: its door is jammed
  ("Blocked? Try the other end."). A rope through the hole in the floor climbs
  into the day-lit training hall with the tutorial lessons (the crate, two gaps
  with puddle ladders, and the rope over a pool). The hall's exit at the far
  end is jammed too ("Jammed again."), and the broken floor before it drops the
  robot into Company's dark cave, where the Repulsorbot wakes as the robot
  climbs the rope to Service access, Orientation's bulkhead to the concourse.
  The two dead doors are blocked doors (`wallDoors`), wall art that never opens. Arriving from the concourse steps out of Service
  access, at that far end. The robot's own pod stays where it is, open and empty, whenever it arrives by a
  door. Once Orientation has been visited (it has a saved state), the Repulsorbot has left: its pod stands
  open and empty and the robot is gone, however the robot arrives (`arrivalLevel`). Restart area forgets the
  saved state, so the Repulsorbot is back the next time Orientation is entered fresh. A headless test plays it end to end with ordinary
  inputs. Wake, the four tutorial levels and Company stay in the collection but
  leave the campaign; their direct links stay open. Orientation's golden traces await recording on Apple
  Silicon, like the other facility areas.
- Seven wings: Boot Camp (7 courses), Freight (5), Construction (7), Gravity
  (3), Security (6), Puzzles (3) and Assessment (2), for 33 required courses.
  The concourse's wiring opens them as wings are completed: Freight and
  Construction once Boot Camp is complete; Gravity once Freight or Construction
  is; Security once Freight, Construction and Gravity are; Puzzles once Gravity
  and Security are; and Assessment once all six others are. Slow is Smooth,
  Buoyancy and Full Tilt stay in the collection with no door; their direct links stay open.
  Most wings are still flat corridors that make the campaign playable end to
  end, not designed wings.
- Direct links ([Routes](#engineering-notes)): `/lab/levels/built-in/<file>` plays a
  course whose door is open, and finishing or leaving it returns the robot to
  that door. A locked course, a facility area or a missing file opens the
  facility instead, paused with the reason.
- The concourse, with a bulkhead to every wing, the evaluation board (the total, then each wing's passes or SEALED) and the dispatch door.
- Cloud saves carry the autosaved place to other devices. The facility waits
  briefly for an account's first cloud check before placing the robot, and a
  device whose only unsynced change is the place takes newer cloud saves without
  asking ([account cloud saves](account-cloud-saves.md)).
- The release: the dispatch door is wired to open once every wing is complete,
  onto Ascent I, the final course. Its exit leads into Ascent II, whose exit
  leads into Spelunk, whose exit leads into Exit; an F, or leaving, returns to
  the dispatch door. After the bus departs, the release screen shows the robot's
  release certificate and offers Return to the facility (see [The release](#the-release)). The escape levels still keep their timers and coins until their
  untimed redesign.

- Places are prepared ahead: within 300 units of an open door or bulkhead, the
  place behind it is prepared in the background, and a course prepares where it
  leads, by its exit or back, while it is played. Walking through then opens the
  next place at once. A place not yet prepared holds the last frame on screen;
  only after a second does the "Preparing level" dialog appear, with Cancel.

Not yet built: the door closing behind the robot,
lamps and grade letters on the board, a start
experience that is still a game before the facility
([issue #104](https://github.com/nmsimons/arcade/issues/104)), wing layouts and
art, shortcuts, certification doors, and golden traces for hub levels (record
them on Apple Silicon once the layouts settle; `tests/helpers/jumping-golden.mjs`
leaves hubs out until then).

This specifies how L.A.B. replaces its level grid with the facility itself: a
connected building the robot explores freely, with discipline wings around a
central concourse, course doors with in-world records, and the evaluation whose
release begins the escape. The story and progression rules it implements are
adopted in [the campaign canon](jumping-campaign.md), especially
[campaign shape](jumping-campaign.md#campaign-shape) and
[presenting the campaign in the world](jumping-campaign.md#presenting-the-campaign-in-the-world).
Read it with [level design](jumping-level-design.md), [level files](jumping-levels.md)
and [the outdoor finale brief](jumping-outdoors.md). Schema keys and file shapes
below are proposals to settle during the first slice.

## Why

The canon describes a robot moving through a building. The game presents a
person at a computer choosing tiles from a grid. During play, L.A.B. is already
in the world: there is no HUD, the clock hangs on the wall, and terminals carry
the text. What breaks it is everything between runs:

| Today | In the facility |
| --- | --- |
| Grid of level tiles | A building to explore: a concourse, and wings with a door for each course |
| "Level 12: Locked" tile | A dark door, and an unlit lamp on the evaluation board |
| Tile thumbnail, best time and grade | The placard beside the course door |
| Result dialog with time, grade and targets | The robot steps back out of the course door and its placard updates |
| Next level | The next door in that wing lights up |
| Try again | Walk back in, or **Restart course** from the pause screen |
| Level menu | **Leave course** from the pause screen returns to its door |
| Preparing level | The door closes while the course loads behind it |
| Continue | The game resumes where the robot was last autosaved |
| Certification shortfall text | The certification door's placard |

Course levels themselves do not change, apart from visual reskins to match
their wing. Their layouts, deadlines, medal routes, golden traces and browser
checks all remain valid, which is the main reason courses stay separate level
files rather than becoming rooms in one large map.

## The shape: a facility to explore

The facility is a metroidvania-style building. The player moves freely through
everything they have opened, backtracks at will, and chooses which open wing to
work on next. Progress opens access; it never changes what the robot can do.

```
                        ┌───────── shortcut ─────────┐
                        │                            │
 Orientation ─► CONCOURSE ◄─► Freight wing ──┘
         (linear)       board        ◄─► Construction wing ─┐
                        dispatch     ◄─► Water wing         │ shortcut
                        door         ◄─► Targets wing ◄─────┘
                          │          ◄─► Security wing (opens later)
                          ▼
                  Ascent I (final course?) ─► Ascent II ─► Spelunk ─► Exit
```

### The concourse

The central hall. It holds the evaluation board, wall maps, and the sealed exterior dispatch door, which is visible from the first visit so
the goal is always in view. Every wing's entrance opens off it. Orientation
leads into it through a bulkhead, which also leads back.

### Wings by discipline

Each wing houses one training discipline and groups that discipline's courses
behind its doors. Consistency within a wing gives it a sense of place; the
player supplies variety by moving between open wings, which is the answer to
the repetition a grouped wing could otherwise have. Within a wing, courses rise
in difficulty from the entrance to the far end, and the building's condition
worsens the same way. Series stay together (all five Scaffolds, all three
Quarantines).

A draft grouping from a scan of each level's mechanics and wall text. It is a
starting point for the catalog review, not a judgment of how each level plays:

| Wing | Discipline | Draft members (current names) | Identity |
| --- | --- | --- | --- |
| Orientation | Movement basics | Leaps and Bounds I, First Gap, Second Gap, A Little Swing, A Bigger Swing, Hop Skip Jump I and II, Slow is Smooth, Leaps and Bounds II | Intact, bright and clean: the facility as it was meant to look |
| Freight | Cargo, plates, gates, lifts | Level Five, Boxes, Balls, jk, Nine, Turnaround, Tower I and II | Warehouse racking, pallets, hazard striping, freight lifts |
| Construction | Height, ladders, ropes | Scaffold I to V, Spire I and II | Unfinished structure: girders, raw concrete, work lights |
| Water | Buoyancy, flooding, float switches | Buoyancy, Waterline I and II | Tiled basins, pipework, damp walls, algae |
| Targets | Coins and ball physics | Coins, Drain, Ramping Up, pinball | A scoring range: target boards, counters, ball returns |
| Security | Robots, fields, EMP | Company, Uninvited Company, Lock Out I and II, Quarantine I to III | Dark, red-lit bulkheads; the response units' home |
| Unplaced | Large mixed levels | Escapade, World I | Candidates for certification courses or a late wing |

Water is thin at three courses; the review may build it out, merge it, or make
it a branch of another wing.

### Wing identity

A wing's identity is its discipline, palette (terrain trim and back wall),
lighting, signage color, characteristic machines, ambient sound and condition.
The courses behind its doors share that identity, so existing courses are
reskinned to their wing through lighting, back wall, signage and wall stamps.
Reskins must not change terrain materials, which affect friction and therefore
physics. Distinct wing looks likely need new art: back-wall variants and trim
per wing, within a restrained palette each.

The first of that art is the back wall's finish (`wallFinish`, see
[level files](jumping-levels.md)), set on each wing's hub file since November
13, 2026: Freight and Construction use bolted panels, Security a riveted
bulkhead and Water a tiled wall. Orientation, Boot Camp, Gravity, Assessment
and the concourse keep the course wall, the facility as it was meant to look.
Courses behind the doors do not inherit their wing's finish yet; each course
can set its own.

### Getting around

Moving between wings must stay easy:

- **Adjacency.** Every wing's entrance is within 15 seconds of normal running
  from the concourse's center.
- **Shortcuts.** Each wing's far end opens a shortcut back to the concourse from
  the inside (a gate whose switch is on the far side, a drop, a freight lift).
  Once open, it stays open: shortcuts are derived from progress like doors.
- **Return budget.** With a wing's shortcut open, the concourse is at most 30
  seconds from any of its doors.
- **Wall maps.** "YOU ARE HERE" maps at the concourse and each wing entrance
  show the facility's layout, with lamps for open wings.
- **Transit.** Only if the facility outgrows these budgets: a freight lift or
  tram with one stop per wing, called by pressing Up at its wall button.

Wing-to-wing and concourse-to-wing connections cross level files through
bulkheads. Each bulkhead preloads the level beyond it while the robot
approaches, so the swap is hidden behind a door that closes and reopens.

### Autosave

The facility has no save points to visit; Wake's pod is the game's only
charging bay. The game autosaves the robot's place whenever it moves: the hub
and the door or bulkhead it came through, the door of the course it is playing,
or the course an exit led it into. Course records save when a course finishes, as they always
have.

Untimed places keep their state (`areaState.ts`). In the canon, the facility
resets its timed courses, and every other place is an ordinary place: the
opening, the concourse, the wings and the escape route stay as the robot left
them. Each untimed level saves, by its level ID:

- where each prop lies, including tools (a tool still in hand stays behind at
  the robot's feet, as it does at a door);
- mechanism positions, triggers and toggle groups, and so every switch they
  drive;
- float switches and water levels;
- tied ropes that have let go of an anchor.

Robots go back to their posts and the player's robot resumes at its door, as
the place autosave says; neither is saved. The state saves when the robot
leaves through a door or bulkhead, when the game pauses or the page is hidden
or closed, and every five seconds of play when something has changed. A course
that keeps its state, such as Exit, starts afresh once finished. **Restart
area** puts a place back as authored and forgets its saved state: it is the way
out if a crate ends up blocking the route. A saved state belongs to one version
of its level: editing the level's file starts that place afresh. **Restart** on
the start screen erases every saved place with the rest of the save.

Together these are the whole save.

### Access and clearance

Access is gated, not ability. The robot's movement never changes, because every
course is tuned for its full repertoire, and carried gadgets stay in the
course or area that provides them: entering a door leaves a held tool behind.
A sealed wing opens by the concourse's wiring: its bulkhead is Switched, and
the bulkheads of the wings it needs switch it on (Logic AND), each once its wing
is complete. The evaluation board shows a sealed wing as SEALED.

- Orientation's bulkhead leads onto the concourse, which is always open.
- Boot Camp opens with the concourse. The other wings open as the wings they
  need are complete (see the status above).
- Security carries much of the deterioration and the response-unit story.

### Course equipment stays in courses

Coins, coin switches, wall clocks and time pickups (stopwatch, fast stopwatch,
time bonus and penalty) exist only in timed courses. Facility areas and the
escape route use physical mechanisms only: plates and switches, gates, lifts
and platforms, water and float switches, gravity plates, force fields, wiring
and cargo. Tools and EMP charges may appear in either, as in Orientation's cave.

### Course doors

A course door is a wing object (proposed `courseDoors`):

```json
"courseDoors": [{ "id": "door-lab1", "x": 640, "y": 300, "course": "4a6b61ae-b74f-4305-97ba-8c0a282aaf80" }]
```

It uses the same 40-by-80 doorway as entrances and exits, with the same flat
sill and headroom rules. The course's name is lettered on the wall above it,
like a bulkhead's destination, and a placard screen beside it shows the
course's data. `course` is the course's stable level ID. A door's position is geometry and its course is
a link, like a switch's targets.

**Doors are switches, and open by switches.** The relationships between courses
are wired in their facility area, in the studio, rather than listed in the
campaign file:

- A level door opens always, or with **Power: Switched** (`"power": "switched"`)
  only while its wiring is on, as a switched exit does, with Logic and Reversed.
  A bulkhead can be switched the same way. Unswitched doors and bulkheads are
  always open.
- Every bulkhead is also a switch (`targets`): on once the area beyond it is
  complete, every level door in it passed. An area with no level doors has
  nothing left to pass.
- Every level door is also a switch (`targets`): on once the level behind it is
  passed, at D or better, or completed if untimed. An F or a level not yet
  finished leaves it off.
- A **grade average** (`gradeGates`) is a studio-only node in a facility area.
  It averages the best grades of the level doors it lists (A 4, B 3, C 2, D 1,
  and 0 for an F or no finish) and is on while the average reaches its grade,
  optionally Reversed.
- These are ordinary switch sources: they can drive switched doors and
  bulkheads, gates, lifts, lights or logic relays, and mix with plates and
  float switches. Most built-in wings are wired in sequence: each door after
  the first is Switched, and the door before it switches it on. Assessment's
  two doors are both always open.
- A passed course's door stays open, whatever its wiring says: a pass never
  relocks, so a pass carried over from the level grid keeps its door open.

Doors, direct links, the level library and the start screen's progress all
read the same wiring, from the courses' best grades and the area's switches as
the robot last left them. While the robot is in the area, a switched door opens
and shuts with its wiring, and its placard is dark while it is shut. A studio
playtest opens every door, but door switches and grade averages still read the
player's records. Wing access is wired the same way, by the concourse's
bulkheads (see [Access and clearance](#access-and-clearance)).

**Entering.** Standing in an open course doorway and pressing **Up** (controller
Up, touch drag up) enters it. Walking or running past never enters a door; this
differs from course exits, which finish on contact. The robot steps in, the door
closes behind it, and the course's own entrance plays. Locked doors stay closed
and ignore Up. Keep ladders and ropes clear of door fronts so Up is never
ambiguous.

**Placard states.** The placard is a dynamic phosphor display, drawn like the
wall timers and message screens, with the same lighting rules. It is reserved
for the course's data; the name is lettered above the door and stays while the
door is shut:

| State | Placard |
| --- | --- |
| Locked | Dark. No grade or time. |
| Unlocked, not run | NO RECORD and its D deadline. |
| Unlocked, run but not passed | BEST with the run's time and F, and its D deadline. |
| Passed | BEST with the best time, and GRADE with the best grade. |
| Untimed | UNTIMED, or COMPLETE once finished. |
| Dispatch door | SEALED, or UNIT RELEASED. |
| Improved just now | The new time and grade roll in; "PERSONAL BEST" on a new best. |
| Certification door | Source group, completion count and points, e.g. "CERTIFICATION 5 / 6", with the source courses' best grades. |

Standing at a placard with the camera settled may show the A/B/C/D targets that
the result dialog shows today. Placards are drawn behind terrain and actors,
have no collision, and render in previews and thumbnails.

A course returns the robot to its own door. A course may instead lead onward,
its exit opening elsewhere in the facility, but use this sparingly, for story
moments such as the final course.

### The evaluation board

The concourse's board shows one numbered lamp per required course, grouped by
wing in each wing's order, with the grade letter in each passed lamp and a total
such as "EVALUATION 12 / 40". Locked lamps are dark. Smaller boards at wing
entrances may show just that wing. The board replaces the grid's overview
without being a menu: nothing on it is selectable. Proposed as a wall object
`evaluationBoards: [{ x, y, w, h, wing? }]` whose content comes from the
facility's areas and saved records.

### The release and the escape route

The dispatch door is a level door like any other: it opens by its wiring, and
Always open means always open. The built-in concourse wires it from every
wing's bulkhead with Logic AND, so it opens once every wing is complete, which
is when the last required course is passed. The board reads EVALUATION
COMPLETE once every required course is passed, and UNIT RELEASED FOR DISPATCH
while the dispatch door is open, so it always agrees with the door.

The leading option, still to be settled, keeps **Ascent I as the final timed
course**: the facility's last test, behind the dispatch door. It keeps its coins,
coin locks and clocks, and its exit opens into Ascent II instead of returning to
a wing. That is where the dispatch route turns out to have collapsed. From there
the levels are the robot's own route: untimed, with no placards or grades, each
exit leading directly into the next level. Exit is unchanged; the bus is the
finish. After the bus departs, one closing screen remains (the canon's exception),
the release screen, offering **Return to the facility** for replays, and **Back to arcade**.

Making a level untimed is a redesign, not a setting:

| Level | Today | Untimed work |
| --- | --- | --- |
| Ascent I | 58 coins; the exit opens at 40 coins; 3 wall clocks; a stopwatch and a time bonus; D 240 s | None if it stays the final timed course. Otherwise it needs a new spine of physical work in place of the 40-coin exit lock. |
| Ascent II | No coins, clocks or pickups; D 50 s | Mostly a setting. Review its pacing at normal speed without a deadline. |
| Spelunk | A 3-coin lock opens a gate; 1 wall clock; D 240 s | Replace the coin lock with a physical mechanism, remove the clock, and review stretches whose only difficulty was the deadline. |

Untimed challenge comes from traversal, route-finding, physical puzzles and the
Repulsorbot, not from the clock. Redesigns follow the repository's level process
([level design](jumping-level-design.md), normal-control playtests, completion
routes in place of medal routes).

### The campaign file

Campaign structure lives in the levels, so the studio is the one place to edit
it. The one thing the levels cannot say, where a new game starts, lives in
`public/levels/jumping-campaign.json`, beside the built-in collection rather
than inside it, so level packs keep their format (level JSON and `index.json`
only). `src/games/jumping/campaign.ts` reads it:

```json
{ "version": 3, "start": "<Orientation, a facility area>" }
```

Everything else comes from the levels (`resolveCampaign` in `facility.ts`):

- **A new game** starts at the start area's entrance.
- **The facility** is every facility area the robot can reach from the start,
  through bulkheads and through courses whose exits lead into another area.
  There is no fixed concourse: any area can hold level doors and bulkheads, and
  there can be as many hubs as the layout needs.
- **The wings** are the reachable areas with level doors, other than the
  dispatch door. A wing's courses are the levels behind its doors. Each wing is
  open while a bulkhead into it, from any reachable area, is open: always, or by
  its wiring when it is Switched; a wing only an exit leads into is always open.
  Within a wing, each door opens by its wiring (see [Course doors](#course-doors)).
  An area with no level doors, such as a store room, is just a place.
- **The order** of the board, the start screen's Progress and campaign problems
  is by how near each wing is to the start, then the order the wiring opens wings
  and courses from a new save, left to right where it opens them together.
- **The dispatch door** is the level door marked `dispatch`, and the level
  behind it is the final course, released once the evaluation is complete.
- **A course outside the facility**, behind no door, is always open from its
  direct link and is not part of the evaluation.

A version 1 or 2 file, which listed the wings, the final course, the opening,
the concourse or the escape route, is refused with a note to keep only
`start`, mark the dispatch door and set where each exit leads in the studio.

### Where doors and exits lead

By default the robot goes back where it came from. Each link can say otherwise,
and each is set on the door or exit itself in the studio:

| Link | Default | Studio setting | File |
| --- | --- | --- | --- |
| A course's exit, when the run passes | Back to the level door it entered by | **Leads to** a course (entered at its start) or a facility area, and **Arrives at** a door there | `goal.leadsTo: { level, arrival? }` |
| A level door, coming back from its course | Out of the same door | **Returns through** another door or bulkhead in the area | `returnsTo` |
| A bulkhead | Out of the bulkhead on the far side that leads back | **Arrives at** a door or bulkhead in the area beyond | `arrivesAt` |

- **An F, or Leave course**, always goes back, so a course must be passed to
  move on. A course an exit led into goes back to wherever its route began: the
  escape route returns to the dispatch door.
- **A bus exit ends the game.** Overlook and walk-off exits cannot lead on.
- **A course an exit leads into** opens with the course its route began at, for
  direct links and resuming. The autosave keeps the robot in it, as it did in
  the old escape levels; a save from before this change that names an escape
  level resumes there.

`npm run levels:check` confirms that the start is a facility area; that every
level door leads to a timed course and each course has one way in (one door or
one exit); that the facility has one dispatch door; that exits, bulkheads and
their arrival doors lead somewhere real, a course being entered only at its
start; that exits never lead round in a loop; and that every facility area can
be reached from the start and left again. It then plays the wiring forward from
a new save, as if every course the robot reaches were passed, counting plates
and float switches both as they start and all on (`campaignWiringProblems`),
and reports any wing, level door, bulkhead or dispatch door that can never
open, so a way back that never opens cannot trap the robot. Still to add:
certification doors and sources, and the course-equipment rule for escape
levels once they are redesigned as untimed. `index.json` keeps loading every
level for the development library.

## Flows

### Starting the game

`/lab` opens the facility's start screen, and `/lab/facility` is the facility
in play. A new save starts in Orientation's charging pod.
A save with passed courses but no autosaved place, such as one from the level
grid, starts there too.
Orientation's bulkhead, Service access, opens onto the concourse, and the
concourse's Orientation bulkhead leads back to it. Afterward, the robot resumes where it was
last autosaved: at the door it came through, at a course's door if it left
mid-course, or in a course an exit led it into. A place that has since closed or
disappeared resumes at the start. The autosaved place is the only new saved value; doors, lamps,
bulkheads and shortcuts are all derived from best times and completions. All
three sync through [account cloud saves](account-cloud-saves.md); the place is
`Untitled Jumping Game/facility-place.json`. With cloud saves on, the facility
waits up to eight seconds for the account's first cloud check ("Checking your
cloud saves…") so a place saved on another device is where the robot appears. A
download that arrives later, while the robot stands in an area, updates the
saves but leaves the robot where it is. Each untimed place keeps its state
between visits (see [Autosave](#autosave)), saved as
`Untitled Jumping Game/facility-areas.json`.

#### The start screen

`/lab` stops at the start screen, a title screen that fills the view: the
robot's phosphor system display, as on the pause screen, over the place it
wakes in, still and ready to play and darkened behind the menu. One column holds
the L.A.B. Experiments mark the robot boots under, the place's name and
"ONLINE.", then the menu. Progress and Controls open in the same column and
scroll within it. A new save offers only **Start** and **Controls**. A save with a place or any
course record offers:

| Action | What it does |
| --- | --- |
| Continue | Plays on from the place behind the display, at `/lab/facility`. Esc, the controller's Menu button and B do the same. |
| Progress | Once released, the release certificate first. The evaluation total, then each wing: its passes, or Sealed, and each course's best time and grade or the D deadline to pass. Locked courses stay dark, as their placards do. |
| Restart | Asks first, with Cancel as the default, then erases every course record (best times and completions) and the robot's place, and wakes in Orientation's pod at `/lab/facility`. With cloud saves on, the erased save syncs like any other change, and earlier versions stay in the cloud save history. |
| Controls | How to play: it opens by saying a controller is the best way to play (or that one is connected), then lists what the robot can do, grouped as Move, Jump, Climb, Swim and Tools, each with how to do it on the controller, keyboard or touch in use. The courses teach the rest. |

**Level studio** (development builds) and **Back to arcade** sit along the foot
of the screen, beside reminders of the keys or controller buttons that choose
and select (none on touch). On a short screen, such as a phone on its side, the
mark sits beside the menu. The start screen also gives the reason when a
refused link sent the robot here.

Moving between the two addresses keeps the robot where it is: Continue goes
forward to `/lab/facility`, and the browser's Back returns to the start screen
over the robot as it stands, without reloading the area. Opening
`/lab/facility` directly, as on a reload, resumes at the autosaved place
without the start screen. Courses return the robot to their doors at
`/lab/facility`, and a restart lands there too.

### Entering, finishing and leaving a course

1. When the robot comes within about 300 units of an unlocked door, prepare that
   course in the level-preparation worker so entering has no visible wait. Built:
   the facility keeps up to eight places prepared, each copied on entry as
   Restart copies it, and a course also prepares the door it returns to.
2. Up at the door: the robot steps in, the door closes, the course entrance
   plays. If preparation has not finished, the closed door holds until it has;
   the "Preparing level" dialog does not appear. Built so far: the last frame
   holds in place of the closing door, and the dialog appears only if
   preparation takes more than a second, so it can still be cancelled.
3. The course runs exactly as today. Exit entry locks the score and saves the
   record at the same moment as today.
4. Instead of the result dialog, the wing reloads with the robot stepping out of
   the course door (the entrance animation, from that door). The placard and
   board lamp update in view, and a live region announces the result, e.g.
   "Boxes passed. Grade B, 42.37 seconds, personal best."
5. On F, the placard shows the run's time with F and the deadline; the next door stays dark.
6. **Leave course** on the pause screen returns to the door without a record.

#### The release

Finishing the game ends on the robot's system display too. Once the bus has
gone, the release screen fills the view over the place, as the start screen
does: the L.A.B. mark, the level's name and "RELEASED.", then the reward, the
**release certificate**: the unit rating it earned, then the courses passed, the
tally of best grades (A, B, C and D) and the total of its best times. The rating
comes from the average best grade, A = 4 to D = 1, over the graded courses
(`releaseCertificate.ts`): **Exemplary** with an A on every one, then
**Distinguished** (3.5 or more), **Commendable** (3), **Proficient** (2) and
**Satisfactory**. It lights up as the mark boots. The menu offers **Return to
the facility** (also Esc, the controller's Menu button and B) and **Progress**,
with Level studio (development builds), Back to arcade and the input reminders
along the foot. On a short screen the certificate takes the mark's place beside
the menu.

The release is kept. From then on the start screen carries a "Released for
dispatch" stamp with the rating under the L.A.B. mark, and Progress, on the
start and pause screens, opens with the certificate. It is derived from the
course records, with no saved value of its own: the game is released once a
level that ends it, such as Exit, has been completed (`gameReleased`), and the
certificate follows the best times as they improve. Restart erases it with them.
Outside the facility, as when Exit is played from the level library or a studio
test, the ordinary result dialog stays.

### The pause screen

Pausing in the facility opens the same system menu as the start screen, with
the same full-screen layout over the place: the place's name, "PAUSED.", the
menu, then the other destinations and the input reminders along the foot. Only
the L.A.B. mark stays on the start screen. Its actions depend on where the robot is:

| Where | Actions |
| --- | --- |
| Course | Resume, Restart course, Leave course, Progress, Controls, Back to arcade |
| Facility area (Orientation, a wing or the concourse) | Resume, Restart area, Progress, Controls, Back to arcade |
| A course an exit led into (the escape route) | Resume, Restart from entrance, Return to the facility, Progress, Controls, Back to arcade |

Progress is the start screen's evaluation report. Erasing the save stays on the
start screen, so it is never one press away mid-course. Outside the facility, in
the development library and studio playtests, the same menu is a panel over the
paused game, with **Level menu** or **Return to builder** in place of leaving and
no Progress.

Restart area returns the robot to where it came in: the door or bulkhead it
arrived through, or the opening's pod. It also puts the area back as authored,
forgetting its saved state. Development builds add **Level studio** as today. The controls
reference keeps its current content.

## Authoring rules for wings

These move into [Making a fun jumping level](jumping-level-design.md) when the
first wing ships.

- **No test-course feel.** No course equipment (coins, coin switches, clocks,
  time pickups), medals or grades. Traversal is light and confident: steps,
  short gaps, ladders, a rope.
- **Skills follow the doors.** The way to any unlocked door uses only skills
  taught by courses that open before it. Nothing in a wing is harder than the
  easiest course it leads to. Recovery is generous and every fall has a readable
  return.
- **Budgets.** Wing entrances within 15 seconds of the concourse's center; with
  the shortcut open, every door within 30 seconds of the concourse. Both are
  measured with automated normal-control routes.
- **Loops.** Every wing's far end opens a shortcut back to the concourse.
- **Machines, not hunters.** Shovebots and other working machines can keep their
  narrow jobs in wings. Hunting Repulsorbots belong in courses, where their
  pressure is the exercise.
- **Show the sealed building.** Staff doors and freight exits are visible and
  stay sealed. The canon's sealed access is something the robot sees, not reads.
- **Condition worsens with depth.** A wing's entrance is its best-kept part; its
  far end is its worst. In late wings, flooding and broken access reach the
  corridors, built only from established mechanics.
- **Identity is consistent.** One palette, lighting scheme, signage color and
  family of machines per wing, shared by its courses.
- **Signage, not instructions.** Destination signs at wing entrances, a placard
  per door, the boards, wall maps, industrial labels and brief graffiti. No
  control hints: courses teach controls.
- **Doors are unambiguous.** Ladders, ropes and climbable ledges stay clear of
  door fronts. Doors stand on flat floor in good light, readable from a
  distance.

## Course names and the catalog review

Names become signage. Every course lettered over a door needs a facility name, so the
review that assigns courses to wings also renames working titles such as "jk",
"pinball", "Nine" and "Level Five". Stable IDs keep progress through renames.
The review also settles wing membership and order, clearance, which built-ins
are required, which become certification courses, and which leave the campaign.
It precedes building any wing beyond Orientation.

## Engineering notes

- **Session.** The game shell gains a facility mode: the default screen becomes
  a wing run (an untimed level run with door and bulkhead handling) instead
  of the menu. A course run returns to a freshly loaded wing.
  `JumpingResultDialog` remains for studio playtests, the development
  library, and direct links to levels outside the campaign, which have no door
  to return to.
- **Progression.** `facilityProgress` counts passes with the `passedLevel`
  rule, opens each wing by the concourse's wiring and each wing door by its
  area's wiring (`campaignWiring`, which resolves an area's switches from the
  records and its saved switch states). Doors, placards, boards, bulkheads, direct links and the
  library's locks (`linkOpen`) all read from that one result. A collection that lacks the campaign's opening, such as a
  test fixture catalog, leaves every level open.
- **Routes.** `/lab` is the start screen and `/lab/facility` the facility in
  play; both share the loaded place, so moving between them never reloads it.
  `/lab/levels/built-in/<file>` plays a course directly when its door is open,
  and leaving returns to its door at `/lab/facility` (`linkedPlace`); a refused
  link lands on the start screen with the reason. The grid is the
  development-only library at `/lab/library`, with the stress tests and the
  studio. Only runs started there return to it: the studio's **Back to game**
  and its playtests go to `/lab/facility`. Production sends `/lab/library` to
  `/lab`.
- **Studio.** Built: Type (Course or Facility area), Level door (with a level
  picker), Bulkhead (with a destination picker) and Evaluation board. Still to
  come: Wall map, Sealed door, and later Transit button. A studio playtest
  opens every door, and entering one ends the test; crossing into real courses
  and other areas from a playtest is still to come.
- **Accessibility.** Placard, board and map content is mirrored in the visually
  hidden status region, as the player status is today. Standing at a door
  announces "Door: Boxes, best grade B." with no visible prompt. The pause screen
  keeps keyboard, controller and screen-reader behavior.
- **Performance.** Wings stay within sizes the game already runs (Exit is 75 KB
  and 20,800 units wide, under the 1 MB and 24,000-unit limits). Ambient
  machines off screen use the existing off-screen animation cadence. Wings are a
  good early beneficiary of the
  [Phase 5 geometry work](jumping-animation.md#phase-5-hot-spots-after-the-split).

## Tests

- **Unchanged:** course golden traces, medal routes and course browser specs,
  which open courses directly. Visual reskins must leave physics hashes
  untouched.
- **Rewritten:** course specs open courses by link (`openLevelLink`). The
  grid-driven specs became development library specs (`jumpingLevelMenu.dev`,
  `jumpingLibraryProgress.dev`, `jumpingLevelPicker.dev`,
  `jumpingPickerSecurity.dev`), and `jumpingGrades` checks locked links and
  door progression in a one-wing test campaign.
- **New:**
  - fresh-save progression through Wake, Orientation and into the concourse;
  - Up enters an open door, running past does not, a locked door ignores Up;
  - finishing returns to the door with the placard and board updated;
  - an F run keeps the next door dark;
  - a sealed wing's bulkhead opens once the wings wired to it are complete;
  - the autosave records the robot's place, and reload resumes there;
  - an untimed place comes back as it was left, and Restart area returns it to
    its authored layout;
  - shortcuts stay open after reload;
  - a direct link to a locked course is refused;
  - the start screen: a new save only starts, a returning save continues in
    place and shows its progress, and Restart erases the save only after
    confirming; Back and Continue move between `/lab` and `/lab/facility`
    without reloading the area, and `/lab/facility` opens without the start
    screen;
  - automated routes for the adjacency and return budgets, using normal
    controls;
  - campaign file validation, including the course-equipment rule.
- **Escape route conversion:** Ascent II and Spelunk medal routes become
  completion routes. Their golden physics hashes should not move from the
  timing change alone; Spelunk's redesign re-records its traces, with a note.

## Delivery

1. **Canon and this spec.** Done in this change.
2. **First slice, behind a development flag.** Wake; a short Orientation wing
   with four doors (Leaps and Bounds I, First Gap, Second Gap, A Little Swing)
   and its placards; a concourse stub with the board and the sealed dispatch
   door; one discipline wing entrance with two doors behind a
   bulkhead, to test moving between wings; Up to enter; return to the door; the
   phosphor pause screen; resume at the autosaved place.
3. **Playtest gate.** Normal-speed play from a fresh save: walking time, door
   readability, whether the building feels like a place rather than a menu,
   whether the wing identities read, mood. Automated checks cannot answer these.
4. **Catalog review**, then the remaining wings, their art, shortcuts,
   certification doors and the sealed-building dressing.
5. **The release and escape route.** The dispatch door, the board's completion,
   Ascent I as the final course (if confirmed), and the untimed conversion of
   Ascent II and Spelunk.
6. **Switch the default.** Done November 6, 2026
   ([issue #97](https://github.com/nmsimons/arcade/issues/97)): `/lab` opens the
   facility, the grid became the development library, and
   [level files](jumping-levels.md), [level design](jumping-level-design.md)
   and [testing](testing.md) are updated.

## Open decisions

1. **Wing membership and order.** The draft grouping above is a starting point.
2. **Clearance.** Which wings open with the concourse and which open later.
3. **Order within a wing.** The spec keeps one new door at a time within each
   wing, with freedom across wings.
4. **Ascent I.** The leading option makes it the final timed course leading into
   Ascent II; otherwise it needs an untimed redesign.
5. **A map on the pause screen.** Wall maps are adopted. A map of visited areas
   on the robot's own system display would fit the pause-screen exception.
6. **Transit.** Built only if the layout outgrows the movement budgets.
