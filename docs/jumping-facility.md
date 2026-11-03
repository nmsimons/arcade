# The facility: wings, course doors and the evaluation

**Proposed design spec, November 1, 2026. First slice in progress.** Tracked in
[issue #91](https://github.com/nmsimons/arcade/issues/91).

**Status (November 2, 2026).** Development builds open the facility at
`/lab/facility`, or from the **Facility** button on the level menu. What exists:

- The campaign file and wing progression (`campaign.ts`), checked by
  `npm run levels:check`.
- Facility areas: hub levels (`"kind": "hub"`) with level doors (`courseDoors`),
  bulkheads and evaluation boards (`hub.ts`). Up enters an open door. Placards
  show a course's name and D deadline, then its best time and grade; closed
  bulkheads show the clearance still needed.
- The level studio edits all of it. **Type** in the Level tab switches a level
  between Course and Facility area (a doorway exit becomes a bulkhead to the
  concourse, and back). In a facility area, the Facility tools place level
  doors, bulkheads and evaluation boards, and **Leads to** in the inspector
  chooses each door's level or each bulkhead's place. Studio placards name the
  destination, and a playtest opens every door.
- The facility loop (`facility.ts` and the game shell): a new save wakes in
  Orientation; a course returns the robot to its door, and a bulkhead leads to
  the matching bulkhead beyond it. The robot's place, Orientation included,
  autosaves on every move, and a returning save resumes there. The pause screen
  uses the phosphor style, with Restart area in facility areas and Restart
  course and Leave course in courses.
- The opening, Orientation (`Orientation.jump-level.json`): an untimed
  facility area that starts in Wake's charging pod at night. Its power plate
  opens a gate onto a day-lit training hall with the tutorial lessons (the
  crate, two gaps with puddle ladders, and the rope over a pool). Broken floor
  at the hall's far end drops the robot into Company's dark cave, where the
  Repulsorbot wakes as the robot climbs the rope to Service access, Orientation's
  bulkhead to the concourse. Arriving from the concourse steps out of Service
  access, at that far end. A headless test plays it end to end with ordinary
  inputs. Wake, the four tutorial levels and Company stay in the level grid but
  leave the campaign. Orientation's golden traces await recording on Apple
  Silicon, like the other facility areas.
- Every wing as stub hubs: Movement (Hop Skip Jump I and II, A Bigger Swing,
  Leaps and Bounds II, Slow is Smooth), Freight (8), Construction (7), Targets
  (4), Water (3), Security (6) and an Assessment wing for Escapade and World I,
  the two unplaced levels: 35 required courses. Water, Security and Assessment open through draft clearances (8 of
  Freight and Construction; 12 of Freight, Construction and Targets; 6 of Water
  and Security). The stubs are flat corridors that make the campaign playable
  end to end, not designed wings.
- The concourse, with a bulkhead to every wing, the evaluation board (the total, then each wing's passes or SEALED) and the dispatch door.
- The release: when all 40 courses are passed, the dispatch door opens onto
  Ascent I, the final course. Passing it leads through Ascent II, Spelunk and
  Exit, each opening into the next; after the bus departs, the closing card
  offers Return to the facility. The escape levels still keep their timers and
  coins until their untimed redesign.

Not yet built: preparing a course while the robot approaches its door (the
"Preparing level" dialog still appears), the door closing behind the robot,
lamps and grade letters on the board, the cloud save slot for the autosaved
place (it is saved on this device only), wing layouts and
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
or its escape level. Course records save when a course finishes, as they always
have. Together they are the whole save.

### Access and clearance

Access is gated, not ability. The robot's movement never changes, because every
course is tuned for its full repertoire, and carried gadgets stay in the
course or area that provides them: entering a door leaves a held tool behind. A wing opens through clearance: its bulkhead opens
once named courses are passed, and the bulkhead's placard shows what remains
("CLEARANCE: FREIGHT 6 / 8"). The draft below is for the review to settle:

- Orientation's bulkhead leads onto the concourse, which is always open.
- Freight, Construction and Targets open with the concourse.
- Water and Security open later, through clearance from the earlier wings.
  Security carries much of the deterioration and the response-unit story.

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
sill and headroom rules, plus a placard mounted on the wall beside it. `course`
is the course's stable level ID. A door's position is geometry and its course is
a link, like a switch's targets; wing order, clearance and certification live in
the campaign file.

**Entering.** Standing in an open course doorway and pressing **Up** (controller
Up, touch drag up) enters it. Walking or running past never enters a door; this
differs from course exits, which finish on contact. The robot steps in, the door
closes behind it, and the course's own entrance plays. Locked doors stay closed
and ignore Up. Keep ladders and ropes clear of door fronts so Up is never
ambiguous.

**Placard states.** The placard is a dynamic phosphor display, drawn like the
wall timers and message screens, with the same lighting rules:

| State | Placard |
| --- | --- |
| Locked | Dark. No name, grade or time. |
| Unlocked, not passed | Course name and its D deadline. After an F run, also "NOT PASSED". |
| Passed | Course name, best time, and the best grade in the left lamp bay. |
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
campaign file and saved records.

### The release and the escape route

When the last required course is passed, the board reads complete
("EVALUATION COMPLETE / UNIT RELEASED FOR DISPATCH" as draft copy) and the
dispatch door in the concourse opens.

The leading option, still to be settled, keeps **Ascent I as the final timed
course**: the facility's last test, behind the dispatch door. It keeps its coins,
coin locks and clocks, and its exit opens into Ascent II instead of returning to
a wing. That is where the dispatch route turns out to have collapsed. From there
the levels are the robot's own route: untimed, with no placards or grades, each
exit leading directly into the next level. Exit is unchanged; the bus is the
finish. After the bus departs, one closing card remains (the canon's exception),
offering **Return to the facility** for replays, and **Back to arcade**.

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

Campaign structure lives in `public/levels/jumping-campaign.json`, separate from
level geometry as the canon requires. It sits beside the built-in collection
rather than inside it, so level packs keep their format (level JSON and
`index.json` only). `src/games/jumping/campaign.ts` reads and checks it:

```json
{
  "version": 1,
  "opening": "<Orientation, a facility area>",
  "concourse": "<concourse level id>",
  "wings": [{
    "id": "movement",
    "name": "Movement",
    "level": "<movement wing level id>",
    "courses": ["<Hop Skip Jump I>", "…"],
    "clearance": null
  }, {
    "id": "water",
    "name": "Water",
    "level": "<water wing level id>",
    "courses": ["…"],
    "clearance": { "wings": ["freight", "construction"], "count": 8 }
  }],
  "finalCourse": "<Ascent I>",
  "escape": ["<Ascent II>", "<Spelunk>", "<Exit>"]
}
```

- **A new game** wakes at the opening's entrance. The opening is a facility
  area like the wings. Its bulkhead to the concourse (`"to": "concourse"`) and
  the concourse's bulkhead to it (`"to": "opening"`) are always open.
- **Every wing** opens off the concourse. Without a clearance it opens at once;
  with one, once `count` of the named courses are passed. A
  clearance names courses, whole wings, or both; `count` defaults to all of
  them.
- **Within a wing,** a door opens once the door before it is passed. A pass
  carried over from the level grid keeps its door passed and opens the next one.
- **The concourse** holds bulkheads to the opening and every wing, and one
  level door, the dispatch door to `finalCourse`. Passing the final course
  leads through `escape` in order.
- **`level` and `concourse`** name hub levels and stay optional until those
  levels exist.

`npm run levels:check` confirms that every level exists and has one role (a
facility area, one wing's course, the final course or an escape level), that
wing courses and the final course are timed, that the opening, the concourse
and the wing levels are facility areas, that each wing course has exactly one
door in its wing, that the concourse's only level door is the dispatch door,
that bulkheads join the opening and each wing to the concourse both ways, and
that every wing can open through clearance. Still to add: certification doors and sources, and the
course-equipment rule for escape levels once they are redesigned as untimed.
`index.json` keeps loading every level for the development library.

## Flows

### Starting the game

`/lab` opens the facility instead of the grid. A new save starts in Orientation's charging pod.
Orientation's bulkhead, Service access, opens onto the concourse, and the
concourse's Orientation bulkhead leads back to it. Afterward, the robot resumes where it was
last autosaved: at the door it came through, or at a course's door if it left
mid-course. A place that has since closed or disappeared resumes at the first
wing's entrance. The autosaved place is the only new saved value; doors, lamps,
bulkheads and shortcuts are all derived from best times and completions, which
already sync through account backups. The place needs a small new allowlisted
save slot (see
[account cloud saves](account-cloud-saves.md)). Wing world state (props moved,
switches pressed) resets each time a wing loads; nothing else in a wing needs
saving.

### Entering, finishing and leaving a course

1. When the robot comes within about 300 units of an unlocked door, prepare that
   course in the level-preparation worker so entering has no visible wait.
2. Up at the door: the robot steps in, the door closes, the course entrance
   plays. If preparation has not finished, the closed door holds until it has;
   the "Preparing level" dialog does not appear.
3. The course runs exactly as today. Exit entry locks the score and saves the
   record at the same moment as today.
4. Instead of the result dialog, the wing reloads with the robot stepping out of
   the course door (the entrance animation, from that door). The placard and
   board lamp update in view, and a live region announces the result, e.g.
   "Boxes passed. Grade B, 42.37 seconds, personal best."
5. On F, the placard shows the run and "NOT PASSED"; the next door stays dark.
6. **Leave course** on the pause screen returns to the door without a record.

### The pause screen

The pause screen becomes the robot's own system display: the terminals' green
phosphor on a dark panel, not a facility screen and not today's light dialog.
Its actions depend on where the robot is:

| Where | Actions |
| --- | --- |
| Course | Resume, Restart course, Leave course, Controls, Back to arcade |
| Facility area (Orientation, a wing or the concourse) | Resume, Restart area, Controls, Back to arcade |
| Escape route | Resume, Restart from entrance, Return to the facility, Controls, Back to arcade |

Restart area returns the robot to where it came in: the door or bulkhead it
arrived through, or the opening's pod. Development builds add **Level studio** as today. The controls
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

Names become signage. Every course on a placard needs a facility name, so the
review that assigns courses to wings also renames working titles such as "jk",
"pinball", "Nine" and "Level Five". Stable IDs keep progress through renames.
The review also settles wing membership and order, clearance, which built-ins
are required, which become certification courses, and which leave the campaign.
It precedes building any wing beyond Orientation.

## Engineering notes

- **Session.** The game shell gains a facility mode: the default screen becomes
  a wing run (an untimed level run with door and bulkhead handling) instead
  of the menu. A course run returns to a freshly loaded wing.
  `JumpingResultDialog` remains for studio playtests and the development
  library only.
- **Progression.** `unlockedLevels` today walks `index.json` order. It becomes a
  walk over each wing's order in the campaign file, plus clearance, with the same
  `passedLevel` rule. Doors, placards, boards, bulkheads and shortcuts all read
  from that one result.
- **Routes.** `/lab` opens the facility. `/lab/levels/built-in/<file>` still
  plays a course directly when it is unlocked, and leaving returns to its door.
  The grid moves to a development-only route (for example `/lab/library`) with
  the stress tests and the studio.
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
- **Rewritten:** the grid-driven specs (`jumpingMenu`, `jumpingLevelProgress`,
  the L.A.B. parts of `controllerMenus`) become facility progression specs.
- **New:**
  - fresh-save progression through Wake, Orientation and into the concourse;
  - Up enters an open door, running past does not, a locked door ignores Up;
  - finishing returns to the door with the placard and board updated;
  - an F run keeps the next door dark;
  - clearance opens a bulkhead exactly at its threshold;
  - the autosave records the robot's place, and reload resumes there;
  - shortcuts stay open after reload;
  - a direct link to a locked course is refused;
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
6. **Switch the default.** `/lab` opens the facility, the grid becomes the
   development library, and [level files](jumping-levels.md),
   [level design](jumping-level-design.md) and [testing](testing.md) are updated.

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
