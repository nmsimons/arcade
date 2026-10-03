# Jumping level files

All authored levels are JSON assets. The app fetches them at runtime; neither maps
nor the level list are imported into its JavaScript bundle. The builder creates
empty documents, and the engine receives the selected level as data.

For route design, teaching, wall guidance, puzzles, and playtesting, see
[Making a fun jumping level](jumping-level-design.md).

Version 1 remains supported unchanged. Version 2 adds authored lighting, described
below and in the [flat-lighting specification](jumping-lighting.md). The studio
upgrades a level on its first Night mode or spotlight edit; it never silently
removes lighting when saving.

## Built-in levels

The asset folder is `public/levels/jumping/` in the repository and `levels/jumping/`
in the deployed app:

- `index.json`: lists the filenames to fetch as `{ "version": 1, "levels": [...] }`.
  It contains no level geometry and lists the built-ins in presentation order.
- `00.json`: First Leap.
- `01.json`: Second Leap.

Add future built-ins directly to this folder. The JSON test lab, old lessons,
playground and counterweight yard live under `tests/fixtures/jumping/` solely for
automated tests. They are not copied into or offered by the deployed game.
When the built-in catalog is empty, the level picker opens Local folder and the
builder omits the built-in templates section.

Local and built-in collections share the same `index.json` manifest format:

```json
{
  "version": 1,
  "order": "listed",
  "levels": ["intro.json", "ropes.json", "tower.json"]
}
```

`order: "listed"` uses this explicit sequence for the picker and Next level.
`order: "filename"`, or an omitted order mode, uses filename order. Connecting a
writable folder without a manifest automatically creates `index.json` in filename
mode, listing its JSON level files without modifying them. Read-only folders use
filename order and show how to enable saving to create the manifest. Existing
manifests are preserved, including on reload. Local files not listed in a custom
manifest appear after its entries, sorted by filename. Missing local files retain
their place as **Missing file** cards with only a Delete action. Invalid manifests
are reported; valid local files remain available in filename
order when the manifest cannot be read. Presentation order is never stored in
individual level JSON files.

Static hosting cannot enumerate directories, so adding, removing, or renaming a
file also requires updating the index. This command preserves the existing mode,
custom sequence and other manifest metadata, removes references to missing files,
and appends newly discovered files in filename order:

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

This regenerates the index and copies JSON to `dist/web/levels/jumping/` by default.
It removes obsolete JSON files listed by the previous deployment index. Source
and destination asset folders must contain only level JSON and `index.json`;
unexpected files, subdirectories, and symlinks stop publishing. Move unrelated
content out of the asset folder first; leave `Deleted levels` behind when
promoting a local collection. Every source level is validated before
copying, and regular builds (including direct `vite build`) enforce the same
allowlist. It does not compile JavaScript or run gameplay tests. Upload that asset folder
using your hosting deployment process. Regular repository CI still performs the
full build and checks on pushes; the asset-only command is independent of it.
App builds regenerate the index automatically. The local development editor
reads the folder directly and maintains the index as you save, rename and reorder.

## Shared-level safeguards

Level files and manifests have a 1 MB UTF-8 size limit. A collection allows at most
500 level files and 25 MB total, including its manifest. Reads run four at a time;
downloads count actual streamed bytes even when response headers omit their size.
The recycle bin has its own 500-entry / 25 MB budget. Make room in the bin before
moving more levels there when it is full. Save, rename, and restore also check the
destination budget before writing, while preserving external-edit checks.

Thumbnails draw authored geometry only and allocate canvas pixels while visible.
Rope settling and initial world preparation run in a disposable worker, with a
five-second deadline and cancellation when leaving the level. Failed preparation
keeps the picker and editor responsive; simplify overly complex ropes or terrain
before trying again. Saved settled ropes still start in their authored positions.

`npm run security:check` checks the locked dependencies against npm advisories.
CI runs this check along with validation, gameplay tests, lint, build, and browser
regressions.

## Local levels and editing

### Editing built-ins during development

With `npm run dev` open on localhost, built-in levels have the same **Edit**
controls as local levels. **Library** includes a **Built-in levels / Local folder**
selector. Open a built-in, edit it, and use **Save level** or **Save and Test**;
the JSON is written directly to `public/levels/jumping/` in the current checkout
and appears in Git. No folder picker or app rebuild is needed.

New levels and templates use the collection selected in Library. Filenames,
renames, drag/keyboard ordering, missing-file removal and recovery work the same
way in both collections. **Refresh** picks up edits made outside the game.
Switching collections in Library does not move the current draft or change its
save destination; opening or creating a level still asks about unsaved changes.

Built-in recovery copies live in the ignored `.local/jumping-recycle-bin/`
directory, outside the published assets. The repository writer is available only
through the local dev server with same-origin requests and a per-server token;
production builds and `vite preview` retain the read-only built-in experience.
Unfinished maps remain editable after restarting the dev server. Build and publish
validation still requires every built-in level to be ready to play.

Use `npm run prod` to build and run the customer experience locally, normally on
port 4173 alongside development on port 5173. It serves built-in JSON from `dist/web/`
and enables editing only for local folders. Restart this command after changes
to rebuild the preview. The two ports have separate browser storage and remembered
folder connections.

### Using the editor

Click an object to select it, drag it to move it, or drag empty space to pan.
Selecting a placement tool shows its default-size object under the mouse or
controller cursor while it hovers over the canvas. Every placement tool follows
the cursor in both directions; objects never jump to a distant surface below.
With **Snap** enabled, item positions and sizes align in 5-unit steps; terrain
positions, sizes and nodes use the 20-unit grid. Previews, placement, dragging,
resize handles, arrow-key nudges and numeric field steps follow this distinction.
Snap also catches nearby surfaces. Hold Alt or disable Snap to bypass this. The preview does not
edit the level; click to place it or drag to set its size. **Place on surface**
(End) moves a selected object to a supporting surface below.
Space + drag or the middle mouse button pans from anywhere. Placement tools return
to this default interaction after one use unless **Keep placing** is enabled;
press Esc or click the active tool again to stop placing. Zoom centers on the
selected object, or on the cursor for wheel zoom when nothing is selected.
Start and goal markers are already part of each time trial. Drag the existing
markers, or select **Start** / **Goal light** in the Inspector’s **Object** tab to edit their position.

The Inspector separates **Level** settings (names, save location, dimensions,
night mode, floor material, and medal times) from **Object** properties. Selecting
or placing an object opens **Object** automatically; switching tabs preserves the
selection. The tabs stay visible while scrolling. With a tab focused, Left/Right
arrows switch tabs and Home/End select the first/last tab.

Numeric inspector edits preview on the canvas as you type a complete number.
Arrow keys move focus in the direction pressed, following the visible layout.
Press Enter to start editing a focused field, or click it directly with the mouse.
After applying or cancelling, focus stays on the field and arrows navigate again.
Press Enter or leave the field to apply the edit as one undo step; Esc restores
the original value. Fields accept whole numbers, including seconds, and enforce
their supported bounds. Blank or incomplete entries leave the level unchanged;
decimal and scientific-notation entries are rejected.

The **Terrain** tool draws a rectangular starting shape. Select it to resize the
whole shape with the four square handles outside its bounding corners, or drag
the white nodes to change its geometry. Choose **Node** (N), or **Add node** in
the inspector, then click a terrain edge to insert a point at the preview marker.
You can drag the new point immediately, or enable **Keep placing** to add several.
The Node tool also highlights existing nodes under the pointer. Drag one to move
it without first selecting its terrain; the tool stays active for further edits.
Click an existing node, then press Delete / Backspace or use **Delete node** in the
inspector to remove it. At least three nodes must remain, and the outline cannot
cross itself. Arrow keys nudge the selected node; Shift nudges one unit.
Resizing keeps the opposite corner fixed and scales the existing nodes. Resizing
and node edits follow Snap; new points snap along the edge without changing its slope.

With terrain selected, the top toolbar enables **Rotate left/right**
(90° per click) and **Flip horizontal/vertical**. Transforms preserve
the bounding-box center, moving inward only when needed to stay inside the room;
rotation is refused if the shape cannot fit without resizing. Names and materials
are preserved. Attached rope anchors follow the same transform. Other objects stay
in place; legacy attached ladders become independent when their terrain rotates.
Each action can be undone or redone. Slopes become ordinary editable polygons when
transformed; no new level-file fields or gameplay rules are involved.

**Terrain → Steps narrow / Steps wide** stamps five one-grid-square
rises with treads one or two squares wide. Both have a stepped underside formed
by five one-square-thick steps overlapping their neighbors by one square.
Narrow steps are two squares wide; wide steps are three squares wide, including
the top landing. The overall size is 6 × 5 or 11 × 5 grid squares
(120 × 100 or 220 × 100 units). Click to place the full-sized template; it stays
inside the room even near an edge. **Keep placing** repeats it. Each template
becomes one ordinary terrain piece with editable nodes,
dimensions, material, duplication, transforms, and undo/redo.

Choose **Local folder → Choose folder** in the game menu. The game reads JSON files
directly in that folder, applies its manifest (or filename order), and lets you play them or choose
**Edit** on a level tile. Click a tile, press Enter, or press controller A while
it is selected to play immediately. Thumbnails fill the width of the picker.
Focus or hover a tile to show its name and medal times in the compact strip
below the grid. Add wall text to give players guidance inside a level.
Each tile has **Play** at the bottom right, beside **Edit** for local
levels. Controller Y (or keyboard Y) edits the selected local level. Built-in
levels remain available as templates in the builder's Library. Files in nested
folders and non-JSON files are ignored.
**Refresh** rereads external edits, additions, deletions, and renames.
The picker remembers your last selected collection separately from the folder
connection. A first visit defaults to built-ins when available; an empty built-in
catalog opens Local folder. Restoring a remembered folder never switches the tab.
The game automatically reopens that folder on refresh or reload. It rereads
the current files from disk each time. Only the folder name and directory handle
are stored in IndexedDB; level contents and editor drafts are never cached there.
If the browser needs permission again, **Reconnect folder** restores access to
the same folder without another folder chooser. If read access remains available
but write permission has expired, levels load automatically and **Enable saving**
restores direct saves. A missing folder can be replaced with **Change folder**.

Level studio supports standard controllers. **Y / △** switches between editor
controls and the canvas cursor. Returning to the controls restores the last
focused control and its inspector tab, including after entering with B, Tab, or
the mouse. The left stick, D-pad, and keyboard arrows move
focus according to the controls' positions; edges do not wrap. **A / ×** activates
buttons, checkboxes, and lists, or starts editing a field. While editing numbers,
Up/Right increases the value and Down/Left decreases it; A finishes and B cancels
the current entry, returning to navigation. A opens an on-screen keyboard for
names and wall text. **B / ○** cancels a drag, field entry, list, or dialog;
otherwise it also switches between the canvas and the last focused control,
keeping the selected object. The right stick scrolls the focused panel. Help's
**Controller** topic lists every binding.

On the canvas, the left stick moves the cursor. Hold A while moving to draw,
drag, resize, or edit terrain nodes, then release to apply one undoable edit.
The D-pad nudges the selected object or node. The right stick pans; the triggers
zoom out/in. Clicking the left stick gives fine movement, one-unit nudges, and
drags without snapping. **X / □** duplicates; **LB / L1** and **RB / R1** undo and
redo. **View / Share** opens Library; **Menu / Options** saves and playtests.
During a canvas drag, Menu first cancels the preview; press again to test.
Held inputs must be released after changing screens, opening a dialog, or
reconnecting. Leaving the window or disconnecting cancels an unfinished drag.
Native browser folder choosers may need the keyboard or mouse once; connected
folders work with the controller.

In the builder, **Library** opens a centered, nearly full-screen dialog. It contains
**New level**, local files, built-in templates, and folder controls. **Choose folder**
selects the destination for **Save level**. Replacing a draft with unsaved changes
offers **Save and continue**, **Discard changes**, or **Cancel**.
Click any file in the folder's list to open it for editing. **Change folder**
switches folders; the **Save location** control in the
Inspector’s **Level** tab takes you back to Library. The
filename and level name are independently editable in the **Level** tab. A new draft
creates no level file until its first save. Until then, its filename follows the level
name unless you type a filename yourself. Clearing the filename restores that
automatic suggestion. After saving, changing the level name leaves the filename
alone. Editing the filename renames the existing file on the next save, preserving
its ID and any manifest position. Rename collisions or changes made externally
block the operation; the original is retained until the replacement is saved.
**Use as template** under a local file starts a new draft with the same layout,
objects, timers, and settings, a new ID, and a filename based on its new level name.
It remains unwritten until Save. Choose another filename if it conflicts with an existing file. The source file is
unchanged; **Save level** writes the new file to the selected writable folder.
Saving refuses to overwrite a file that changed outside the builder since it was
loaded. Refresh and open the latest file before saving or renaming it.

**Save level** writes to the selected writable folder; **Save and Test** waits for
that save to finish before starting play. With no writable folder open, Library
opens to let you choose a folder or enable saving. There is no download fallback,
**Open file**, or **Export**. Put JSON files in the level folder and refresh, or
change folders to open them. If the browser cannot write directly to folders,
its folder input still loads levels for play; use
**Reselect folder** to refresh it. These browsers remember the folder name but
require reselection after reload. The folder panel shows the save behavior and
level count. No custom files are uploaded to a server. Clearing this site's
browser storage also clears the remembered folder, without deleting local files.

Drag level tiles directly in **Library** to change their order. With a level
focused, **Alt + Left/Right** moves it one position; **Alt + Up/Down** moves it
one row. Each move saves only `index.json`, switching to explicit listed order.
**Sort by filename** restores automatic filename ordering. Existing level bytes
and the current draft are untouched. A failed save leaves the sequence unchanged
and reports the problem; external manifest edits require refreshing first.

**Delete** on a local level moves it straight to the folder's recycle bin, without
a confirmation. The game verifies a recovery copy before removing the original
file and its index entry. An open draft stays in the editor; saving it again
creates a new file. If a file was deleted outside the game, its **Missing file**
card stays visible until **Delete** is clicked, which immediately removes only the
index entry without confirmation.
The game cannot recover externally deleted files it has not backed up.

**Library → Recycle bin** displays the same level thumbnails and filenames as the
library, with **Recover** and **Delete permanently** actions. Recovery preserves
the original file contents and level ID, refuses to overwrite existing files,
and lets you choose another filename. Recovered levels go at the end of a custom
order. **Delete permanently** and **Empty recycle bin** both require confirmation.
Read-only folders allow viewing the bin; enable saving to change it.
Recovery files live in `Deleted levels/<timestamp-id>/<filename>` inside the
selected folder, not in the operating system's Trash or Recycle Bin.

To share a collection, send its level JSON files and `index.json` together.
Leave out the `Deleted levels` subfolder.
OneDrive account levels use this same structure under
`Apps/Dream Large Arcade/Untitled Jumping Game/Levels`. Copy that folder's level
JSON files and manifest to a local folder or built-in assets without conversion.
Files copied into OneDrive appear in Account levels after automatic sync at the
level chooser, or by using **Refresh** in Account levels. Saved edits upload in
the background from the builder. Each account file shows its local/cloud state;
sign-in and Cloud saves are available without leaving the game.
Account-panel imports accept `index.json` alongside the level files and
preserve its order and metadata. See [cloud storage](account-cloud-saves.md) for
sync, conflicts, and recovery.
Another player can put them in one folder and choose it in the game. To promote
a local collection to built-in levels, copy the same files (including the
manifest) into `public/levels/jumping/`, then run `npm run levels:index` or
`npm run levels:sync`. No level-format conversion is needed. The manifest provides
a place to add chapter metadata later; chapter navigation is not implemented yet.

Menu tiles, builder templates and the overview all use the
game's world renderer for their static previews. They include props, shovebots,
pressure plates, both gate orientations, elevators, moving platforms, ropes, ladders, timers, text,
pickups and goal exits in their starting state.

The level menu is `/untitled-jumping-game`, playing a saved level uses
`/untitled-jumping-game/levels/built-in/<filename>` or
`/untitled-jumping-game/levels/local/<filename>`,
and the builder is `/untitled-jumping-game/builder`. Editing a local file uses
`/untitled-jumping-game/builder/local/<filename>`. Filenames are URL encoded.
Back and Forward navigate between these screens; returning from
Playtesting a file appends `/playtest` to its builder URL, for example
`/untitled-jumping-game/builder/local/Tower.json/playtest`. Back and **Return to
builder** preserve the current draft and undo history. Reloading a file playtest
uses the saved level; local links reopen the remembered folder or ask for access.
Unsaved levels use `/untitled-jumping-game/builder/playtest/<level-id>` and remain
session-only. Reloading an unsaved playtest returns to the empty builder.

There are no browser copies or automatic draft saves. Edits and undo history stay
in memory while returning from a playtest or the level menu, but reloading or
leaving the game discards unsaved work. Save a JSON file to keep changes. Old
browser level data is no longer read or written. Personal best times still use
browser storage independently of level files.

Keep a level's `id` stable when changing its layout or filename. IDs identify best
times; the collection manifest determines ordering, with filename order as the fallback. IDs must be unique within a collection.
Local best times are separate from built-in records. Opening a file
preserves its ID. Using a built-in or local level as a template creates a new ID.

## Validation and reference level

`tests/fixtures/jumping/00-json-test-lab.json` exercises every supported field: rectangular,
polygon and profile terrain; start, exit and checkpoint radius; attached and free
ladders; attached and free ropes with saved points, bends and material distances;
boxes, balls, a pusher, pressure plates, an elevator, a gate, stopwatch pickups, wall timers,
multiline wall text and medal times.
Browser tests supply it explicitly through their level fixture helper.

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

The version 1 file contains `id`, `name`, `width`, `height`,
`spawn`, `platforms`, `checkpoints`, and `climbables` (ladders and ropes). A timed
trial also includes `floor`, `goal`, `times`, `props`, `robots`, `mechanisms`, and
`triggers`. Empty arrays are explicit. Old playground files without trial fields
remain readable. Legacy `description` fields are ignored; use wall text for
in-level guidance.

Every object, including start, goal, and spotlights, accepts an optional `name` string of up to
80 characters. The Inspector's **Name** field sets it; clearing it restores the
default label. Names appear in the inspector heading, object picker, switch
connections, rope anchors, and object-specific validation errors. Labels retain
the object type and number to distinguish unnamed objects and duplicate names.
They survive edits, duplication, templates, and saves. Surrounding whitespace is
trimmed, and empty names are omitted. Mechanism connections still use their stable
IDs, so renaming a mechanism or spotlight does not change its connections.

Optional `timers: [{ "x": 80, "y": 1220 }, ...]` places up to 40 wall displays.
Each point is the top-left of a 120 × 40 (six-by-two-tile) digital display
in file coordinates. The entire display must fit inside the room.
**Back wall → Wall timer** places one in the builder; select it to move,
duplicate, or delete it. Inspector Y measures its top
above the floor, and increasing level height preserves that height. Terrain edits
do not move these wall objects.

Every display shows the same elapsed time as glowing seven-segment `00:00`
minutes and seconds, with no hours or fractions. The face saturates at `59:59`;
the underlying run time, medals, and best times retain their full precision and
range. Earlier, larger clocks keep their saved top-left positions. Digits are
green normally and on completion; the left LED bay shows effect/status icons.
The time is zero before the first movement, paused with the game, latched when
the player enters the exit, and zero again on restart.
Displays are drawn behind terrain and actors and have no collision. Their size
and position follow the world camera. There is no visible HUD clock; levels
without `timers` simply have no wall display. Older files may omit the array.

Optional `pickups: [{ "kind": "stopwatch", "x": 260, "y": 1360 }, ...]` places
up to 80 pickups (all kinds combined) in a timed trial. Coordinates mark the center of the watch
face; its bounds extend 24 units left/right, 32 above, and 20 below and must fit
inside the room. Choose **Collectibles → Stopwatch** in the builder to place one,
then move, duplicate, delete, or undo it like other objects. Inspector X/Y use
the top-left of those bounds; increasing level height preserves its height
above the floor. Older level files may omit `pickups`.

Only player contact collects a stopwatch. It stops the level timer for 10 seconds
of gameplay, immediately pulses, then shrinks away over 0.34 seconds. The player,
enemies, and mechanisms keep moving normally. Extra watches add another 10 seconds
to the remaining pause. Time is never subtracted; the clock resumes from the same
value when the effect expires. Wall timers turn amber and show a small pause mark
while stopped. Medals and saved best times use the full-precision run time.

Pausing the game also pauses the remaining effect and pickup animation. A watch
collected at the start keeps its full duration until the first movement starts
the run. Restarting restores every pickup, clears the effect, and resets the time
to zero. Entering the exit locks the result and ends collection. Crates, balls, and pushers
cannot collect pickups, and pickups do not obstruct movement.

**Collectibles → Time bonus** places a counterclockwise arrow with a number inside.
Set **Seconds off** to an integer from 1 to 9 (default 5). The JSON shape is
`{ "kind": "time-bonus", "seconds": 5, "x": 260, "y": 1360 }`.
Player contact immediately subtracts that many elapsed seconds, stopping at zero;
any unused seconds are discarded. It does not start or extend a stopwatch pause.
The item has the same placement bounds, pulse-and-shrink animation, and collection
sound as a stopwatch. The displayed number follows the configured value in the
editor, previews, and gameplay. Restarting restores it.

**Collectibles → Time penalty** is the dark-red opposite of a time bonus: its
arrow points and rotates clockwise, and contact adds the numbered seconds to
the clock. Set **Seconds added** from 1 to 9 (default 5). Its JSON shape is
`{ "kind": "time-penalty", "seconds": 5, "x": 420, "y": 1360 }`.
The number lifts directly from the icon as a fading `+5` while the arrow pulses
and shrinks. Penalties apply immediately even during a stopwatch freeze. Bonuses
and penalties touched in the same step are combined before clamping to zero.

**Collectibles → Fast stopwatch** uses the same dark-red color, with a hand
sweeping clockwise once every 1.2 seconds, versus the normal watch's slower
counterclockwise sweep every 8 seconds.
Its JSON shape is `{ "kind": "fast-stopwatch", "x": 500, "y": 1360 }`.
Contact makes the level clock run at **2× speed for 5 seconds** of gameplay;
the player and world keep their normal speed. Wall timers turn red and show a
fast-forward mark during the effect. Additional fast watches extend its duration
by 5 seconds each, without increasing the multiplier. A normal stopwatch still
freezes the clock; both durations count down during gameplay, including their
overlap. Pausing the game pauses both effects. A fast watch collected before the
run starts keeps its full duration until movement starts the run.

Both harmful pickups share the existing collection bounds and pulse-and-shrink
animation, with a lower collection chime. Only the player collects them. Restart
restores them and clears their effects; entering the exit locks the score and
ends collection. Medals and best times include all penalties.

**Collectibles → EMP** places a solid gold lightning bolt. It spins about its
vertical axis with the same thick edge and pace as a coin. Collection sends out
a gold ring as the bolt pulses and shrinks away,
with a soft power-down sound. Its JSON shape is
`{ "kind": "emp", "x": 600, "y": 1360 }`. Coordinates mark the center;
its placement bounds extend 24 units in each direction.

Player contact cuts power to **all gates, elevators, moving platforms, switches, and shovebots for
5 seconds**. Gates, elevators, moving platforms, and bots stop in place and resume from the same
position and phase afterward. They remain solid; a disabled bot cannot shove.
Always-on exits and exits held open by latched switches keep working. The clock, player, ropes, and loose
objects continue normally. Clock collectibles do not change the outage duration.

Coins still collect and fill every coin meter during the outage. A full meter
stays gold until power returns, then switches on and turns green. An already
activated coin switch stays latched through an EMP. Switch and Toggle plates also
retain their state. Plates do not register new presses during the outage; Pressure
plates turn off and respond to their current load when power returns. A switched
exit follows its inputs, so a Pressure-powered exit closes during the outage.
Extra EMPs add 5 seconds each. Pausing pauses the outage, a pickup collected before
the run starts keeps its full duration, and restarting clears it.

**Collectibles → Coin** places a plain gold disc with a thick edge that spins slowly, pulses and
disappears on player contact, with a short chime. Coins use
`{ "kind": "coin", "x": 260, "y": 1360 }` in the same `pickups` array.
Their center-based bounds extend 20 units in each direction. They increase the
level-wide collected total once each and do not change the timer. Their spin and
collection animation pause with the game; restart restores all coins and clears
the total. Collection remains available until the player enters the exit.

**Mechanisms → Coin switch** mounts a numeric display on the back wall, behind
terrain and actors with no collision. Set **Coins required** (1–80, default 3)
and check gates or elevators in **Activates**. Each switch uses the same collected
total, with its own threshold. Coins are not spent. New switches have the same
fixed 120 × 40 digital face as wall clocks, showing
`00/00`: collected total / required goal, both with leading zeros. The numerator
continues past the goal. Digits glow gold until activation, then green; a full
switch awaiting power during EMP stays gold.

Choose **Display → Numeric** to convert an existing bar, preserving its name,
threshold, connections, and center where room bounds allow it. Conversion can be
undone. Choose **Progress bar** for a segmented LED meter, then
**Orientation → Horizontal** to fill left to right or **Vertical** to fill bottom
to top. Every coin switch keeps its connected
mechanisms active until restart. An ordinary plate or another full coin switch
can also power the same mechanism. The editor flags thresholds above the number
of coins placed in the level.

Coin switches share the 40-switch limit with pressure plates. Their file shape is
`{ "mode": "coins", "x": 400, "y": 1200, "w": 200, "threshold": 3, "targets": ["gate-id"] }`.
This older file shape remains supported unchanged and retains its bar style.
Both bar orientations share the numeric face's dark frame and recessed glass.
Separate LED cells glow gold as coins are collected, then green on activation;
empty cells stay dim, and dark gaps separate the cells.
Numeric switches add `"display": "digital"`, use `"w": 120`, and omit
`orientation` and `h`. Their height is fixed at 40. Opening an old file does not
convert bars or rewrite the file.

For progress bars, coordinates mark the top-left of a one-tile-thick (20-unit) display;
its length is editable from 120 to 240 units. Horizontal switches omit `orientation` and use `w` for
their length. Vertical switches use `"orientation": "vertical", "w": 20, "h": 200`;
their height is editable in the inspector or with the top and bottom handles.
Changing orientation preserves the center where room bounds allow it.
They stay on the wall when terrain moves, and support names,
duplication, undo/redo, saving, and reopening like other objects.

Optional `texts` places up to 80 text areas on the back wall, in both trials and
playgrounds. Each entry has `x`, `y` (top-left in JSON coordinates), `w`, `h`,
`text`, `fontSize`, and `align` (`left`, `center`, or `right`). For example:

```json
"texts": [{ "x": 80, "y": 1100, "w": 320, "h": 100,
  "text": "Run up.\nPress to jump.", "fontSize": 24, "align": "left" }]
```

Text uses flat, muted lettering with no panel or outline. Explicit newlines are
preserved; words wrap at the area's width, and excess lines are clipped to its
height. Font sizes range from 12 to 96 world units, text is limited to 1,000
characters, and areas are 40–2,000 units wide and 24–1,200 units high, bounded by
the level. Choose **Back wall → Wall text** in the builder, then edit content,
font size, alignment, position, and dimensions in the inspector. **Style** selects
clean **Official** lettering or **Graffiti** marker lettering, muted red in daytime
and warm yellow in night mode for readability. The
graffiti font is bundled with the game and works offline. **Rotation (°)** turns
the area around its center, from −180 to 180 degrees; positive values turn
clockwise. The selection frame and resize handles rotate with it. In JSON,
`style: "graffiti"` and `rotation: -12` are optional; omitted fields retain the
original upright Official style. Rotated areas stay within the room. Text can be
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

Balls and boxes collide with each other, transfer momentum, and can rest on one
another. Balls use round contact against other balls and box corners. Larger
props carry more mass, and boxes are heavier than equally sized balls.
Boxes rotate, settle on their faces, and tip over edges. Moderate slopes can hold
a resting box; steeper slopes let it slide or tumble. Pushing applies a limited
force, with the player's hands following the tilted face and steps following
actual progress. Balls contact the complete terrain outline, including corners
and valleys. Placed props are lifted clear of terrain before play starts.
Falling boxes and balls make a brief impact sound when they land on the floor,
terrain, elevators or supported props. Harder landings sound stronger, larger
objects sound lower, and resting contact stays quiet.
Shovebots keep both wheels on connected slopes, tilt with the terrain, and stop
at cliffs and walls. A gate can slide past a ball touching its side while still
stopping before it would crush a prop beneath it.

The goal is an exit door with a pole indicator; it has no built-in pressure plate.
Select it in the builder to choose **Power: Always on** (the default) or **Switched**.
Always-on exits start fully open. Switched exits use the same **Switched by** and
**Activates** connections as gates, platforms, and spotlights. Its switch logic
and Reversed setting open and close the exit (OR by default). For a permanently unlocked
exit, connect a separate plate in Switch mode or a coin switch.

The saved `goal: { x, y }` point remains the legacy assembly origin, at floor height,
so existing doors and indicators do not move. The indicator stands 44 units to
its right, 96 units above the floor. The door is 40 units wide and 80 high,
centered 100 units to the origin's right. **Flip horizontally** mirrors both around
the origin, saved as `goal.flipX: true`. Leave flat support from the indicator to
the doorway and clear space above the door; the old plate area needs no support.
Drag the exit and indicator together in the builder. Closed doors blend into the
back wall; the builder and thumbnail show a dashed doorway guide.

The optional `goal.power` is `"always"` or `"switched"`; omission means Always on,
including in existing files. A switched goal also requires a unique `goal.id` for
connections, for example `goal: { "x": 800, "y": 920, "id": "exit", "power": "switched" }`
and a plate with `targets: ["exit"]`. The builder assigns the ID automatically.
IDs must be unique across the exit, mechanisms, and spotlights.

Opening the exit does not stop the clock or lock the medal. The player must walk
into its fully open doorway. Passing above it or rolling an object through it
does not finish the level. Entry locks scoring and takes a short final step into
the door; only after that animation does the result appear and save the personal
best. Once entry begins, a released switch cannot interrupt it. Pausing freezes
door and entry animations. Restart restores all authored initial states. The
camera follows the player when a distant switch opens the exit.

Existing version 1 files with `flag: { x, y }` remain readable with their original
door placement and default to Always on. Saved files use `goal`; if both fields
are present, `goal` takes precedence. No built-in level files need rewriting.

Player starts use a feet Y coordinate. Terrain uses a top-left `x, y`
and a `w, h` bounding rectangle. Without additional fields, it is a solid rectangle.
An optional `polygon` contains 3–64 local `[x, y]` vertices in either winding order;
it must be a simple, nonintersecting polygon contained in its bounds. Concave shapes,
undercuts, sloped sides and undersides are supported. Older monotonic `profile`
terrain remains readable. Do not supply both `profile` and `polygon`.

Terrain can specify `material: "stone"`, `"earth"`, `"chalk"`, or `"steel"`. Stone is a cool
gray with sparse flecks; Earth is a warm sand color with a fine grain; Chalk is a
smooth, pale sage; Steel is a blue-gray with fine, horizontal brush marks.
The level's optional `floorMaterial` applies the same palette
to its enclosing floor. Both default to Stone for existing files. These are
visual choices only: collision, friction and climbing are identical. Choose a
terrain piece's material in the inspector, or the floor material in the Inspector’s **Level** tab.
Materials are saved in the JSON and appear in the game, editor and thumbnails.

Ladders contain `x`, `top`, `bottom`, `platform: -1`, and `side: 1` for independent
placement. Legacy attached ladders retain a supporting terrain index and side.
Ropes contain anchor `x, y`, `length`, and `segments`. Optional
`anchor: { platform, x, y }` binds the rope to a terrain index with local edge
coordinates. The coordinates must lie on the terrain boundary. Editing terrain
carries its rope anchors; deleting terrain detaches its ropes and ladders.

All current terrain uses the same friction. Walking and stable starts depend on
whether surface grip can resist downhill gravity, with no fixed angle cutoff.
Uphill traction and climbing speed taper as that grip is consumed. Running speed
is measured along the surface, and releasing movement lets the player brake and
stand still wherever there is enough grip. Flat-ground acceleration and braking
retain their original tuning. When gravity overcomes grip, slipping builds
gradually; momentum can carry the player uphill briefly before friction and
gravity carry them downhill even while holding uphill. A slide can continue onto
a gentler incline until friction slows the player enough to regain footing.
Landing removes velocity into the surface and retains momentum along it; jumping
releases surface friction immediately. Player movement uses swept convex collision against decomposed
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
The builder's **Objects** tools place balls, boxes, and shovebots at the cursor,
with their feet at its height. Snap catches nearby surfaces; **Place on surface**
moves an existing object to a surface farther below.
Select a ball or box to change its size, or a shovebot to set its patrol limits.
Drag either square handle on the shovebot's patrol line to move that endpoint;
the inspector follows while dragging. Snap aligns endpoints to the grid, and
Alt bypasses snapping. Limits include the bot's starting position, stay inside
the level, and keep at least 50 units between endpoints.
The shovebot's **Headlight** checkbox is off by default. In night mode it adds
a 40° beam aimed 15° downward from the chassis, following its facing, slope tilt,
and windup pose. It uses the same shadows as spotlights and fades out during EMP.
The optional boolean `headlight` field is stored on the robot; omission means off.
Daytime preserves the setting but emits no beam. Headlights do not change the
bot's vision, movement, or collision hull.
Shovebots are solid bodies on wheels, with no projecting arm or bumper. The
player can stand, crouch, walk, and jump on their roof. Limited shoe traction
keeps up with ordinary movement but allows a sudden charge to pull the bot out
from under a rider. Departing preserves the player's earned momentum. Shovebots
push the player through physical contact, with no proximity knockback or upward
launch; a pinned player blocks the bot against a wall.
Shovebots only see ahead of their current left/right facing and need a clear line
from their eye to the player's body to pursue or charge. Players behind them
remain unseen until the bot turns toward them. Terrain, boxes, balls, mechanisms,
and other bots can provide cover;
wall decorations and collectibles do not. Losing sight restores ordinary patrol
and the calm eye color. Crouching behind low cover can hide the player.
The **Mechanisms** tools place elevators, moving platforms, vertical and horizontal gates, and pressure plates. Select a
plate and check one or more switched items in **Activates**, or select a gate,
switched elevator, moving platform, exit, or spotlight and check its switches in **Switched by**; new plates connect to
the nearest mechanism when possible. All support moving, duplication, undo/redo,
playtesting, and portable level files.

Connections are optional. A pressure plate or coin switch may have `targets: []`,
and any switched item may have no incoming switches. These objects can be saved
and played as placed. Unconnected switched mechanisms stay at their starting
positions, switched lights stay off, and switched exits stay closed, unless
Reversed is enabled (which turns an unconnected item on). Switches
still respond to weight or collected coins. Supplied target IDs must identify
existing items whose power is Switched (gates always use switches).

Elevators and moving platforms accept optional `power: "always"` or `"switched"`.
Omission preserves existing switched behavior. **Always on** runs their normal
travel cycle after the first gameplay input, including endpoint pauses and
obstruction reversal. EMP still pauses them. Gates have no power setting.
Changing any item's power to Always on removes its incoming connections.

Every switched item has **Logic**, **Reversed**, and **Relay** controls in
**Switch behavior**, beside **Switched by**. Logic combines only the connected inputs:

- **OR** (default): on when any connected input is active.
- **AND**: on when every connected input is active.
- **XOR**: on when exactly one connected input is active. Two or more active
  inputs turn it off, including three active inputs.

**Reversed** flips the combined result: off when the rule is met, on otherwise.
Reversed OR is on when none of its connected inputs are active. With no inputs,
all three rules are off normally and on when reversed. A single input works the
same in all three modes. Each item chooses its own rule and reversal.
Pressure, Switch, Toggle and coin switches contribute their current active
states, including authored Toggle starting states and latched coin switches.

**Relay** is off by default. Enable it on a gate, switched elevator, moving
platform, exit, wall light or spotlight to expose **Activates** and add the item to other
items' **Switched by** lists. Relay outputs use the item's resulting on/off state
after Logic and Reversed. Its ordinary behavior continues: a gate opens, an
elevator moves, an exit opens, or a spotlight shines. Relay outputs do not wait
for motion or fades, and do not follow gate obstruction safety or lamp flicker.
For example, two plates can feed an AND elevator acting as a relay, which then
switches a gate and a spotlight.

Chains settle in the same simulation step, independently of object order in the
file, and use the same initial states in studio previews and gameplay. Feedback
loops, including self-connections, show a wiring error naming the loop; break
one connection before saving or playing. Turning Relay off clears its outgoing
connections. Changing Power to Always on disables Relay and removes incoming
and outgoing wiring. Undo restores these changes. EMP keeps the existing sensor
latching rules; logical relay outputs follow those inputs while mechanisms
pause and lights fade off. Relay does not bypass EMP.

Versions 1 and 2 accept optional `switchLogic: "or"`, `"and"`, or `"xor"`, boolean
`switchReversed`, boolean `relay`, and outgoing `targets: ["item-id", ...]` on
mechanisms, wall lights and the goal; version-2 spotlights support the same fields. Omission
means OR, reversal off, and Relay off, preserving existing levels. Nonempty
outgoing targets require `relay: true` and existing switched destinations.
For example, `"switchLogic": "and", "switchReversed": true, "relay": true,
"targets": ["gate", "lamp"]` sends an on output unless every connected input is
active. Saves, templates and duplication preserve all settings; templates remap
relay targets along with switch targets. Invalid values and feedback loops are
rejected. Logic and Reversed remain stored when changing to Always on and apply
again when returning to Switched.

Vertical gates have a fixed width of 20, with no rope or anchor. Holding a connected
pressure plate raises the gate exactly its own height; releasing the plate lowers
it again. Older gates are narrowed around their original
center on import, and their `travel` is normalized to their height.

The **Horizontal gate** tool places a barrier 20 units tall. Drag horizontally
to set its width, or change the width in the inspector. It retracts left by its
own width while its plate is held. **Flip horizontally** reverses retraction to the
right; the closed barrier stays in place. Releasing the
plate closes it. Horizontal gates use `kind: "gate"`, `orientation: "horizontal"`,
and optional `flipX: true` in level files. Their `travel` always equals their width.

Elevators have a horizontal platform fixed at 20
units thick and an adjustable width. **Travel height** sets their vertical travel
from 60 to 1200 units. Dragging the selected elevator's top anchor adjusts the
same distance without moving the platform, and respects the Snap setting. The
travel path and stop appear when selected in the builder.
They make repeated trips between the starting
position and the anchor while a connected plate is held, with a pause at each end.
An obstruction becomes a temporary endpoint: the elevator pauses and reverses,
cycling through the available space without crushing players or props. Clearing
the obstruction lets it use its full travel again on the next trip.
Releasing the plate pauses the elevator in place; pressing again resumes it.

**Moving platform** is the horizontal version of the elevator, with the same
speed, endpoint pauses, passenger carrying, obstruction handling, and EMP behavior.
Click to place a platform that initially travels left, or drag from its starting
position toward the desired destination to set direction and distance. It stays
20 units thick; resizing its width does not change its travel. **Travel distance**
sets a range of 60–1200 units, also adjustable by dragging the far stop on the
canvas. **Flip horizontally** reverses travel without moving the starting platform.
Level files use `kind: "lift"`, `orientation: "horizontal"`, and optional
`flipX: true` for rightward travel. Omitting `orientation` keeps the vertical elevator.

One plate can power several mechanisms simultaneously. Connections are saved as
`targets: ["mechanism-id", "another-id"]`; legacy `target: "mechanism-id"`
connections are still accepted. Deleting a mechanism removes only its connection
from each plate or relay. Multiple inputs combine using Logic and Reversed. A closing
gate that meets a player or prop reopens completely. It stays open until the
closing path has been clear for 0.6 seconds, then closes. This safety override
also protects riders and carried props from being pinned against terrain.
Opening gates stop if their retraction path is blocked. Older elevator
thicknesses are normalized while preserving the standing surface where possible.
Every pressure plate accepts the grounded player, crates, and balls. Select **Mode**:

- **Pressure** (default): on while held down, off on release.
- **Switch**: the first press turns it on until restart, even after release.
- **Toggle**: each press reverses its state; release before pressing again. Choose
  **Starts: Off** (default) or **On**. Adding another load while held does not toggle.

All modes keep the existing 0.15-second press debounce. The physical plate follows
its load independently of its green active indicator. Restart resets Switch to
off and Toggle to its chosen starting state. An initially on Toggle powers its
targets in the first playable frame and in editor previews.

Files use optional `behavior: "pressure"`, `"switch"`, or `"toggle"` on the plate,
and optional boolean `startsOn` only for Toggle. Omitted `behavior` means Pressure;
omitted `startsOn` means off. The legacy `mode` values `weight` and `touch` remain
readable and preserved, with the same contact rules. Coin switches use
`mode: "coins"` and retain their existing latching rules; they have no plate behavior.
For example: `{ "mode": "weight", "behavior": "toggle", "startsOn": true,
"x": 120, "y": 920, "w": 100, "targets": ["exit"] }`.

Pressure plates attach to elevators and moving platforms when placed on their
top surface. **Mount** also lets you choose an existing platform wide enough
for the plate, or None to detach it. Mounted plates travel with the platform,
accepting the grounded player, boxes and balls at their moving position. All
three plate modes, their debounce and EMP behavior stay the same. Slide a plate
along the platform to change its offset; moving it off the surface detaches it.
Host edits carry the plate, keeping it within the platform width. The host
cannot be narrowed below its mounted plates' widths. Deleting the host detaches
its plates at their saved positions. Duplicating a plate preserves its mount
when it still fits; templates remap host IDs. Undo/redo and portable files
preserve the mount. Gates and coin switches cannot be used as mounts.

The optional plate field `mount: { "mechanism": "elevator-id", "x": 20 }` stores
a stable host ID and horizontal offset from its left edge. The plate's full
width must fit on a lift (`kind: "lift"`, vertical or horizontal). The loader
normalizes its saved `x, y` to the host's starting position plus this offset;
play uses the host's actual current position. Invalid hosts or offsets fail
validation. Omission preserves the existing fixed plate position.

**Back wall → Wall light** places the goal's circular indicator face on the
wall, with a 3-unit circular rim in the goal post's color. The face has the same
11-unit radius and active/inactive colors as the goal indicator. Wall lights
stay on the back wall, do not block movement, and do not emit a spotlight.
Select one to name it, move it, connect its inputs or enable Relay. It is always
a switched item and supports Logic and Reversed. Its active face remains
readable in Night mode, like the goal indicator; during EMP it follows its
logical inputs, including retained latches.

Both file versions accept up to 40 `wallLights`, each with a unique stable `id`,
center `x, y`, optional `name`, and the shared switch/relay fields. For example:
`"wallLights": [{ "id": "ready", "x": 500, "y": 300, "switchLogic": "and" }]`.
The 28×28 footprint must fit inside the level. Switches use the light's ID in
their existing `targets` array. Duplicates receive new IDs; templates remap all
connections. Saving, undo/redo, thumbnails and gameplay preserve its appearance
and settings. Wall lights do not require Night mode or version-2 lighting.

Opening a file preserves the level ID. Structural validation rejects malformed or
unbounded geometry; editor validation checks clear starts and goals, room bounds,
and legacy connections. Neither replaces actually playing the route.

## Lighting (version 2)

The back wall receives ambient illumination. Wall text and collectibles receive
spotlights and shadows, without casting shadows. Night rooms use the
ambient-0 appearance (fixed 35% baseline brightness) and a very faint full spotlight
beam. Gameplay, studio previews, and thumbnails share this brightness. The
short glow at each lamp remains stronger. Both disappear with Night mode off. Beams stop at terrain, mechanisms and room boundaries.
Spotlights illuminate movable objects. Terrain and mechanisms retain ambient
colors while casting shadows. Players, boxes, balls and robots receive lighting
without casting shadows in gameplay, studio previews and thumbnails. Only timer digits/status symbols, numeric coin
digits/icons, and filled coin segments keep a 65% brightness floor. Panels,
frames, and empty tracks follow room lighting. Haze never washes out
wall text, collectibles, or the player.

Spotlights belong to the back wall and do not block movement. In the studio,
enable **Level tab → Night mode** and use the
**Back wall → Spotlight** tool. Click to place, or drag to aim. Select a lamp to
change its direction, spread, power, flicker and name. The middle handle
aims; the outer handles change spread. Snap uses five-degree angle increments;
Alt bypasses it. Position fields refer to the light's center.

```json
"version": 2,
"lighting": {
  "nightMode": true,
  "ambient": 0,
  "lights": [
    {
      "id": "stairs-lamp",
      "name": "Stairs",
      "x": 640,
      "y": 80,
      "direction": 90,
      "spread": 70,
      "power": "always"
    }
  ]
}
```

This is a fragment of the existing level object; retain its other fields.
Night mode is off by default: the level is fully lit. With Night mode on, every level uses
35% ambient brightness. Turning Night mode off preserves the lights. New saves include boolean `nightMode`. Experimental
version-2 files without the flag infer it from `ambient < 100` before normalizing
ambient to 0. Valid older ambient values are accepted but no longer affect
brightness. Version-1 levels stay fully lit.
Lamps extend indefinitely within their cone,
stop at the level boundary, cast sharp shadows with narrow antialiased edges,
and never add their intensities together. Existing levels are not darkened.

Every lamp requires a unique stable ID across mechanisms and lights, center
coordinates, direction (−180–180°, positive clockwise, 90 down), whole-cone spread
(20–160°), and power (`always` or `switched`). Lamps always use full intensity.
The optional legacy `intensity` field accepts integers 1–100 and normalizes them
to 100; omission defaults to 100. Optional
`name` uses the normal object-name rules. There is no range, color, glow or texture
field. The 20×20 fixture footprint must fit inside the level.

Enable **Flicker** in the spotlight inspector for a malfunctioning lamp: irregular
dim stutters and brief dropouts between steady stretches. The optional JSON field
`"flicker": true` saves this choice; omission means steady, and other types are
rejected. Each lamp has its own repeatable pattern. Flicker animates in the studio
and during play, pauses with the game, and still obeys switched power and EMP.
The lens and emitted light flicker together; ambient brightness stays unchanged.
Thumbnails show the initial steady state. Duplicates and templates preserve the
option and use their new IDs for independent patterns.

A switched light connects to one or more pressure plates or coin switches by ID
in the existing `targets` array. Its **Switched by** section lists every pressure
plate and coin switch, just like the inspector for gates, elevators, and moving
platforms. Editing either this list or a switch’s **Activates** list updates the
same connections. Logic and Reversed combine the light's connected inputs. Changing
the light to Always on removes incoming connections. An unconnected switched
light is valid and stays off during play unless Reversed is enabled. Version 2 allows up to
97 switch targets (40 mechanisms, 16 spotlights, 40 wall lights, and one exit);
version 1 allows 81 (without spotlights).

Spotlights stay fixed on the back wall at their saved world coordinates. Gates,
elevators, and moving platforms cannot carry them. An older file's `mount` field
is discarded on load, keeping the light's position and switch connections even
if the former host no longer exists. Saving writes a wall light without `mount`.
Moving, resizing, or deleting mechanisms leaves lights in place. Templates remap
light and switch IDs together without changing wall positions.

EMP switches all lamps off with a brief fade; ambient stays unchanged. Coin
switches keep their existing latching rules. The green exit indicator stays
visible and never casts light. Pickups dim with their surroundings; clocks and coin
meters remain readable. The player uses light ink in Night mode and
dark ink in daytime, and receives the room's lighting without casting a shadow.

The **Lighting** canvas checkbox temporarily shows the scene fully lit. **Hold to
preview** temporarily powers a selected switched lamp. Neither changes the file,
undo history, thumbnails or playtest. Thumbnails show the authored initial state.
Night brightness is fixed for gameplay, previews, and thumbnails. Former saved player brightness preferences are ignored.

Files allow at most 16 wall lights. Shovebot headlights also count toward the
lighting complexity budget. Rooms with Night mode
on are limited to 4,096 static contour edges per light and 32,768 summed across
lights (counting the whole room conservatively). Excess complexity or malformed
fields produce a validation error before play. Geometry preparation runs in a
cancellable worker. Prefer one or two architecturally positioned beams per area;
the count limit is a safety bound, not a promise that sixteen overlapping beams
will be inexpensive on every device.
