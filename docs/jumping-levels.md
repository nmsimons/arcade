# Jumping level files

All authored levels are JSON assets. The app fetches them at runtime; neither maps
nor the level list are imported into its JavaScript bundle. The builder creates
empty documents, and the engine receives the selected level as data.

## Built-in levels

The asset folder is `public/levels/jumping/` in the repository and `levels/jumping/`
in the deployed app:

- `00-json-test-lab.json`: the only built-in level, available to play or copy in the builder.
- `index.json`: lists the filenames to fetch as `{ "version": 1, "levels": [...] }`.
  It contains no level geometry.

Add future built-ins directly to this folder. The old lessons, playground and
counterweight yard now live under `tests/fixtures/jumping/` solely for movement
regression tests. They are not copied into or offered by the deployed game.

The app sorts filenames, not titles or IDs. Use zero-padded prefixes such as
`00-intro.json`, `01-rope.json`, and `02-two-ropes.json`. The same ordering controls
the menu and Next level. The order of entries in the index does not matter.
Static hosting cannot enumerate directories, so adding, removing, or renaming a
file also requires updating the index:

```sh
npm run levels:index
```

Editing the contents of an existing file needs no index update. Choose **Refresh
levels** in the game menu to fetch the latest files. Requests and deployed JSON
responses disable caching. Failed files are named in the menu; valid files remain
available. Missing assets do not fall back to a compiled copy.

For an already built app, copy just the level assets into its deployment folder:

```sh
npm run levels:sync
# Or choose another deployment asset folder:
npm run levels:sync -- /path/to/site/levels/jumping
```

This regenerates the index and copies JSON to `dist/levels/jumping/` by default.
It removes obsolete files listed by the previous deployment index, including the
old campaign/examples layout. It does not compile JavaScript or run gameplay tests. Upload that asset folder
using your hosting deployment process. Regular repository CI still performs the
full build and checks on pushes; the asset-only command is independent of it.
Normal development startup and app builds regenerate the index automatically.
While the dev server is running, run `levels:index` after changing filenames.

## Local levels and editing

Choose **Local folder → Choose folder** in the game menu. The game reads JSON files
directly in that folder, sorts their filenames, and lets you play them or choose
**Edit selected level**. Files in nested folders and non-JSON files are ignored.
**Refresh** rereads external edits, additions, deletions, and renames.
The game remembers the selected folder in browser storage and automatically
reopens it on refresh or reload, with the local collection selected. It rereads
the current files from disk each time. Only the folder name and directory handle
are stored in IndexedDB; level contents and editor drafts are never cached there.
If the browser needs permission again, **Reconnect folder** restores access to
the same folder without another folder chooser. If read access remains available
but write permission has expired, levels load automatically and **Enable saving**
restores direct saves. A missing folder can be replaced with **Change folder**.

In the builder, **Library → Choose folder** selects the destination for **Save level**.
Click any file in the folder's list to open it for editing. **Change folder**
switches folders; the inspector's **Save location** takes you back to Library. The
filename is editable under Level settings. Saving under a different filename
creates another file; a copy of an existing local level receives a new ID.
**Use as template** under a local file starts a new draft with the same layout,
objects, timers, and settings, a new ID, and a filename such as `00-intro-copy.json`.
If that filename already exists, a numbered suffix is added. The source file is
unchanged; **Save level** writes the new file, or downloads it for read-only folders.
Saving refuses to overwrite a file that changed outside the builder since it was
loaded. Refresh and load the latest file, or save under another filename.

**Save level** writes to the selected writable folder. With no writable folder
open, it downloads a JSON file. **Export** always downloads a file. If the browser
cannot write directly to folders, its folder input still loads levels; use
**Reselect folder** to refresh it. These browsers remember the folder name but
require reselection after reload. The folder panel shows the save behavior and
level count. No custom files are uploaded to a server. Clearing this site's
browser storage also clears the remembered folder, without deleting local files.

There are no browser copies or automatic draft saves. Edits and undo history stay
in memory while returning from a playtest or the level menu, but reloading or
leaving the game discards unsaved work. Save a JSON file to keep changes. Old
browser level data is no longer read or written. Personal best times still use
browser storage independently of level files.

Keep a level's `id` stable when changing its layout or filename. IDs identify best
times; filenames determine ordering. IDs must be unique within a collection.
Local best times are separate from built-in records. Opening or importing a file
preserves its ID. Using a built-in or local level as a template creates a new ID.

## Validation and reference level

`00-json-test-lab.json` exercises every supported field: rectangular,
polygon and profile terrain; start, goal plate and checkpoint radius; attached and free
ladders; attached and free ropes with saved points, bends and material distances;
boxes, balls, a pusher, weight/touch triggers, an elevator, a gate, stopwatch pickups, wall timers,
multiline wall text and medal times.
It is available in **Level builder → Library → JSON Test Lab**.

```sh
npm run levels:check
node --test tests/jumping-level-assets.test.mjs
```

The first command validates the indexed files without building the app. The tests
check the reference level's round trip and gameplay, invalid field values, runtime
refresh, filename ordering, file failures, local saves and external-edit conflicts.
Movement regression tests load JSON fixtures from `tests/fixtures/jumping/`.
Browser tests inject those files through the asset loader; none are shipped as
hidden built-ins.

## File format

The version 1 file contains `id`, `name`, `description`, `width`, `height`,
`spawn`, `platforms`, `checkpoints`, and `climbables` (ladders and ropes). A timed
trial also includes `floor`, `goal`, `times`, `props`, `robots`, `mechanisms`, and
`triggers`. Empty arrays are explicit. Old playground files without trial fields
remain readable.

Optional `timers: [{ "x": 80, "y": 1220 }, ...]` places up to 40 wall displays.
Each point is the top-left of a 192 × 52 display in file coordinates. The entire
display must fit inside the room. **Back wall → Wall timer** places one in the
builder; select it to move, duplicate, or delete it. Inspector Y measures its top
above the floor, and increasing level height preserves that height. Terrain edits
do not move these wall objects.

Every display shows the same elapsed time: zero before the first movement, paused
with the game, latched when the goal light turns on, and zero again on restart.
Displays are drawn behind terrain and actors and have no collision. Their size
and position follow the world camera. There is no visible HUD clock; levels
without `timers` simply have no wall display. Older files may omit the array.

Optional `pickups: [{ "kind": "stopwatch", "x": 260, "y": 1360 }, ...]` places
up to 80 power-ups in a timed trial. Coordinates mark the center of the watch
face; its bounds extend 24 units left/right, 32 above, and 20 below and must fit
inside the room. Choose **Power-ups → Stopwatch** in the builder to place one,
then move, duplicate, delete, or undo it like other objects. Inspector X/Y use
the top-left of those bounds; increasing level height preserves its height
above the floor. Older level files may omit `pickups`.

Only player contact collects a stopwatch. It stops the level timer for 10 seconds
of gameplay, immediately pulses, then shrinks away over 0.34 seconds. The player,
enemies, and mechanisms keep moving normally. Extra watches add another 10 seconds
to the remaining pause. Time is never subtracted; the clock resumes from the same
value when the effect expires. Wall timers turn amber and show a small pause mark
while stopped. Medals and saved best times use the displayed time.

Pausing the game also pauses the remaining effect and pickup animation. A watch
collected at the start keeps its full duration until the first movement starts
the run. Restarting restores every pickup, clears the effect, and resets the time
to zero. Once the goal lights, the result is locked. Crates, balls, and pushers
cannot collect pickups, and pickups do not obstruct movement.

Optional `texts` places up to 80 text areas on the back wall, in both trials and
playgrounds. Each entry has `x`, `y` (top-left in JSON coordinates), `w`, `h`,
`text`, `fontSize`, and `align` (`left`, `center`, or `right`). For example:

```json
"texts": [{ "x": 80, "y": 1100, "w": 320, "h": 100,
  "text": "Hold to charge.\nRelease to jump.", "fontSize": 24, "align": "left" }]
```

Text uses flat, muted lettering with no panel or outline. Explicit newlines are
preserved; words wrap at the area's width, and excess lines are clipped to its
height. Font sizes range from 12 to 96 world units, text is limited to 1,000
characters, and areas are 40–2,000 units wide and 24–1,200 units high, bounded by
the level. Choose **Back wall → Wall text** in the builder, then edit content,
font size, alignment, position, and dimensions in the inspector. Text can be
duplicated, deleted, undone, and copied through templates. It moves with the
camera, sits behind terrain and actors, and never affects physics. Growing the
level adds space above it. Older files may omit `texts`.

The builder uses `(0, 0)` at the bottom-left, with positive X to the right and
positive Y upward. Inspector Y measures the object's top, a rope's anchor, or a
marker's feet above the floor. Grid snapping uses this same origin. Changing level
height adds or removes space at the top, preserving the entire layout's height
above the floor; shrinking stops before cropping an object. Undo restores the size
and layout together.

Version 1 **file and runtime coordinates** still use positive Y downward for
compatibility with existing levels. Convert an editor Y with `levelHeight - Y`.
The playable room is `[0, width] × [0, height]`; legacy trial files use `floor` as their interior
height. New editor files keep `height` and `floor` equal. Terrain outside all four
edges is structural and generated by `levelTerrain`, so it need not be authored.
The renderer fills the full outside viewport, with no visible end to the terrain.
During play, the camera leaves a 32-pixel margin below the room's floor,
independent of zoom. The player moves up toward the screen center
while climbing, then the camera follows them in the center as before.

The goal is a self-contained pressure plate and pole light. Its `goal: { x, y }`
point is the center of a 56-unit-wide plate at the supporting floor surface. The
light stands 44 units to its right, 96 units above the floor. Place the entire
plate on a flat surface and leave room for the light inside the level. The
builder's **Goal light** tool places and moves this assembly as one object.
A grounded player or crate whose bottom overlaps the plate activates it; a ball's
bottom contact must be over the plate. Airborne contact and touching the pole do
not count. Activation latches the light on and stops the timer. Movement and physics
continue for 1.5 seconds before the result dialog; the plate rises again if unloaded.
Pausing also pauses this reveal; restarting
resets the plate, light, and delay. The camera settles on the goal during the reveal,
including when an object activates it away from the player.

Existing version 1 files with `flag: { x, y }` remain readable: their flag point
becomes the goal plate center. Saved/exported files use `goal`; if both fields are
present, `goal` takes precedence. No separate trigger link is needed for this goal.

Player starts use a feet Y coordinate. Terrain uses a top-left `x, y`
and a `w, h` bounding rectangle. Without additional fields, it is a solid rectangle.
An optional `polygon` contains 3–64 local `[x, y]` vertices in either winding order;
it must be a simple, nonintersecting polygon contained in its bounds. Concave shapes,
undercuts, sloped sides and undersides are supported. Older monotonic `profile`
terrain remains readable. Do not supply both `profile` and `polygon`.

Ladders contain `x`, `top`, `bottom`, `platform: -1`, and `side: 1` for independent
placement. Legacy attached ladders retain a supporting terrain index and side.
Ropes contain anchor `x, y`, `length`, and `segments`. Optional
`anchor: { platform, x, y }` binds the rope to a terrain index with local edge
coordinates. The coordinates must lie on the terrain boundary. Editing terrain
carries its rope anchors; deleting terrain detaches its ropes and ladders.

Slopes through 45 degrees support walking. Above that angle, gravity carries the
player downhill. Player movement uses swept convex collision against decomposed
polygon pieces, including rope catches and climbs. A wall-side rope supports a
braced rappel; Up transfers onto a clear ledge, and Down from the rim lowers to
the adjacent rope before continuing to descend. Steering away pushes off the wall
while retaining the rope. Wall contacts resist
compression without pulling the player back toward the cliff. Continuing Down
climbs off the rope's end or steps onto ground; Up climbs onto a clear ledge.
Jump releases into a leap carrying swing momentum. B / Circle (keyboard X) drops
from the rope without a jump or wall push; holding it prevents another rope catch.
Rappel steps alternate between fixed wall footholds and lifted knee recoveries;
stopping smoothly returns both soles to the wall.
Body collisions constrain the loaded rope section while other sections keep
moving; a blocked climb retains the grip and allows retreat along the rope.

Medal `times` are increasing positive seconds: `gold < silver < bronze`.
Props, robots, mechanisms and trigger links remain readable and appear in the
reference templates. Their creation tools are not currently offered in the
builder. These arrays are empty in new levels; exports preserve existing data.

Importing preserves the level ID. Structural validation rejects malformed or
unbounded geometry; editor validation checks clear starts and goals, room bounds,
and legacy connections. Neither replaces actually playing the route.
