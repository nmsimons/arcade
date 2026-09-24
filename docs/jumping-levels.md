# Jumping level files

All authored levels are JSON assets. The app fetches them at runtime; neither maps
nor a campaign list are imported into its JavaScript bundle. The builder creates
empty documents, and the engine receives the selected level as data.

## Built-in levels

The asset folder is `public/levels/jumping/` in the repository and `levels/jumping/`
in the deployed app:

- `campaign/`: the numbered levels shown in the main menu.
- `playground.json`: the movement playground.
- `examples/`: builder templates, including `00-json-test-lab.json` and the older
  counterweight experiment.
- `index.json`: lists the filenames to fetch. It contains no level geometry.

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
It does not compile JavaScript or run gameplay tests. Upload that asset folder
using your hosting deployment process. Regular repository CI still performs the
full build and checks on pushes; the asset-only command is independent of it.
Normal development startup and app builds regenerate the index automatically.
While the dev server is running, run `levels:index` after changing filenames.

## Local levels and editing

Choose **Local folder → Open folder** in the game menu. The game reads JSON files
directly in that folder, sorts their filenames, and lets you play them or choose
**Edit selected level**. Files in nested folders and non-JSON files are ignored.
**Refresh folder** rereads external edits, additions, deletions, and renames.
Reopen the folder after reloading the page; the files themselves remain on disk.

In the builder, **Library → Open folder** selects the destination for **Save level**.
Load an existing file using **Local level files → Edit file** to update it. The
filename is editable under Level settings. Saving under a different filename
creates another file; a copy of an existing local level receives a new ID.
Saving refuses to overwrite a file that changed outside the builder since it was
loaded. Refresh and load the latest file, or save under another filename.

Direct folder writes use the browser's directory picker. If it is unavailable,
the folder input still loads levels, and **Export** downloads the edited JSON.
Reselect the folder to refresh it. No custom files are uploaded to a server.
Without a writable folder selected, **Save level** keeps a browser copy, clearly
reported in its status. Existing browser copies remain under Library, and the
automatic draft remains a local recovery copy.

Keep a level's `id` stable when changing its layout or filename. IDs identify best
times; filenames determine ordering. IDs must be unique within a collection.
Local best times are separate from built-in records. File imports into the builder
receive a fresh ID; opening a file from the local folder preserves its ID.

## Validation and reference level

`examples/00-json-test-lab.json` exercises every supported field: rectangular,
polygon and profile terrain; start, flag and checkpoint radius; attached and free
ladders; attached and free ropes with saved points, bends and material distances;
boxes, balls, a pusher, weight/touch triggers, an elevator, a gate and medal times.
It is available in **Level builder → Library → JSON Test Lab**.

```sh
npm run levels:check
node --test tests/jumping-level-assets.test.mjs
```

The first command validates the indexed files without building the app. The tests
check the reference level's round trip and gameplay, invalid field values, runtime
refresh, filename ordering, file failures, local saves and external-edit conflicts.
The existing movement tests read their maps from these same JSON assets.

## File format

The version 1 file contains `id`, `name`, `description`, `width`, `height`,
`spawn`, `platforms`, `checkpoints`, and `climbables` (ladders and ropes). A timed
trial also includes `floor`, `flag`, `times`, `props`, `robots`, `mechanisms`, and
`triggers`. Empty arrays are explicit. Old playground files without trial fields
remain readable.

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

Player starts and flags use a feet Y coordinate. Terrain uses a top-left `x, y`
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

Importing creates a fresh level ID. Structural validation rejects malformed or
unbounded geometry; editor validation checks clear starts and goals, room bounds,
and legacy connections. Neither replaces actually playing the route.
