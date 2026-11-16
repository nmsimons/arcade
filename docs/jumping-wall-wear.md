# Loose panels and stain intensity

Status: proposed November 16, 2026 as missing panels and stain intensity; built November 16, 2026, with
missing panels replaced by loose panels (see [How the design changed](#how-the-design-changed)).

Two additions to the back wall of Untitled Jumping Game, both artwork only:

- **Loose panels.** An author can work one panel of the back wall loose: it hangs
  from its last bolt, tilted, and a wedge of the room's services shows in its
  frame behind it: pipes, cable trays, conduit and junction boxes.
- **Stain intensity.** Each level chooses how stained it is, from spotless to
  soaked, instead of every room carrying the same light grit.

Both keep the flat 2D look: solid fills, a lit and a shaded band where depth
needs one, no gradients, glows or blur. The [concept art](branding/lab-concept-rbot.webp)
is the mood reference, not the drawing style: its pipes, stained concrete and
service hardware are what we want, rendered the way the game already renders
pipes and panels.

Nothing here changes collision, cover, movement, lighting sources or saves of
player progress.

## What exists today

The back wall is drawn in `drawLevelBackdrop` (`render.ts`) in this order:

1. The wall's base fill `#f1f1ed`, its fine grid, and its panels: the plain
   course wall (`drawWallPanels` in `surfaceDepth.ts`, 360 × 240 panels, each
   row shifted half a panel) or a wing's finish (`drawWallFinish` in
   `wallFinish.ts`, five panel systems with their own module, bond and wear,
   including doubles cast as one piece with the panel to their left).
2. Hazard stripes (`hazardStripes.ts`), painted on the panels.
3. Wall wiring, charging bays, blocked doors (`wallDoor.ts`), then pipes
   (`wallPipes.ts`), all fixed to the wall.
4. Wall text (graffiti, stencils), painted last.

Every panel can carry stains from `panelStains` (`surfaceDepth.ts`): about a
third of panels get one or two faint streaks running down from their top joint,
filled once at `rgba(74,78,62,.075)` on the course wall and in the finish's own
ink at `.08` (`× 1.8` at night) on a finish. The choice is a hash of the
panel's world column and row only. So a room looks the same on every visit, but
the panel at a given world position has the same stain in every level. Terrain
wear (`surfaceDepth.ts`, the relief cache: cracks and chips in stone and chalk,
rust on steel, pebbles and soil in earth) and rust weeping from pipe joints
(`wallPipes.ts`) are fixed in the same way.

The panels are anchored to the world, with rows counted from the top of the
level (y = 0) and columns from x = 0.

## Loose panels

### What the player sees

One panel of the back wall has come off all but one of its top bolts and hangs
from it, tilted 4 to 8 degrees, so its other top corner has dropped.

- **The panel** is the whole panel under the author's point, in the level's
  finish (a double hangs as one piece). Its face is painted in the wall's own
  layers (base, the finish's wash, a middling panel tint), carries the wall's
  fine measurement grid turned with it, keeps its joints' light lip and shade,
  and shows its thickness as a darker edge along the side that dropped. The bolt
  it hangs from is drawn at its pivot.
- **Behind it,** in the panel's frame, is the service void: a pale grey-green
  (`#c6ccc7`), lighter than any terrain and darker than the wall, so it reads as
  the wall's own recess and never as rock or a doorway. The frame's depth shows
  as a shade inside its top and left, and the three bolt holes it pulled away
  from show at their corners. Services run across it (below).
- **Its shadow** falls down and to the right onto the void and the wall below.
- **Stains** are on the wall, under the panel: the room's own stains, pipe rust,
  and the stain that water from the void runs out under it, every time (a long
  one with a darker core where it leaks). The hanging panel covers all of them.

### What is behind it

| `contents` | Studio name | Behind it |
| --- | --- | --- |
| left out | Pipes and wiring | Both pipes and electrical, as the layout gives them |
| `"pipes"` | Pipes | Pipe runs only, plus struts |
| `"electrical"` | Wiring | Cable trays, conduit and junction boxes only, plus struts |
| `"empty"` | Empty | Struts alone |

The services belong to one void behind the whole wall, laid out on a world grid
from the level's ID: horizontal service lines every 60 units of height, each 480
units of them a pipe, cable tray, conduit or nothing (about half empty); risers
in one 480-unit column in three; struts every 240 units; junction boxes on a
third of conduit lengths and where conduit risers cross level conduit. So two
loose panels side by side show the same pipe running behind both. A panel whose
frame the layout leaves empty (other than for `"empty"`) gets a line of its own
across its middle.

### Placement and checks

A loose panel names a point on the wall; it is the panel under that point, so it
moves with the panels when **Wall finish** changes. The level reports one
outside the level; one not on a panelled wall (a landscape's sky and cave walls
have none); two on the same panel; and a wall timer, wall light or coin switch
on one, which would have nothing to hang on. Hardware fixed to the wall (pipes,
wiring, doors, charging bays) is drawn in front of it. Wall text is still drawn
over it.

### File format

```json
"loosePanels": [
  { "x": 1260, "y": 300 },
  { "name": "Pump access", "x": 1620, "y": 300, "hang": "right", "contents": "pipes", "leak": true }
]
```

| Field | Values | Default |
| --- | --- | --- |
| `name` | Optional object name | none |
| `x`, `y` | A point inside the level, in world units, y down | required |
| `hang` | `"left"` or `"right"`: the top corner whose bolt it hangs from | left out: the panel chooses, from the level's ID |
| `contents` | `"pipes"`, `"electrical"` or `"empty"` | left out: pipes and wiring |
| `leak` | `true` | left out |

Up to 24 per level (`MAX_LOOSE_PANELS`), in any level.

### In the studio

**Back wall → Loose panel.** Hovering shows the panel a click would loosen, its
frame outlined; a click loosens it and saves the panel's centre. Dragging moves
its point, and the panel jumps from panel to panel across the joints; the arrow
keys move it a panel at a time; **Duplicate** puts the copy on the next panel to
the right. **Object → Appearance:** **Hangs from** (Either corner, Left bolt,
Right bolt), **Behind it**, and **Leak**. Its outline is its frame; it has no
handles. Selection, copy and paste, undo and labels ("Loose panel 2") work as
for other wall art.

### How the design changed

The spec first proposed *missing panels*: a panel taken out, or smashed through,
showing the void. It was built that way (a removed or broken panel, with the
void at `#3a403c`) and then reviewed in the game:

1. **Too large and too dark.** A whole course panel (360 by 240, five times the
   robot's height) dominated the room, and the dark void read like a doorway.
   Holes became openings of about 80 units squared to their panel, with a mid
   grey-green void.
2. **Not working as a hole at all.** Owner's call: a hole in a flat 2D wall did
   not read well at any size. A loose panel, hanging askew over a wedge of the
   void, keeps the wall whole and only hints at what is behind it. The
   whole-panel size came back, since the panel stays on the wall.
3. **Details.** The face carries the wall's grid; stains and pipe rust sit under
   the hanging panel; the void was lightened again (`#8d958f` to `#c6ccc7`)
   because it still read as terrain.

## Stain intensity

### The setting

```json
"stains": "heavy"
```

One setting per level, `stains`, chooses how much water has stained the room.
It is saved by leaving it out for the current look.

| `stains` | Studio name | Panels stained | Stains per panel | Length (of the panel's height) | Opacity | Crosses the joint below |
| --- | --- | --- | --- | --- | --- | --- |
| `"none"` | None | none | 0 | | | no |
| `"light"` | Light | 1 in 6 | 1 | 0.15 to 0.4 | × 0.75 | no |
| left out | Normal | 1 in 3 (today's look) | 1 or 2 | 0.18 to 0.68 | × 1 | no |
| `"heavy"` | Heavy | 3 in 5 | 1 to 3 | 0.25 to 0.95 | × 1.25 | 1 in 3 long stains continue 0.2 to 0.5 of the next panel down |
| `"soaked"` | Soaked | 4 in 5 | 2 to 4 | 0.35 to 1.0 | × 1.45 | half of them; long ones get a darker, narrower core |

Opacity multiplies today's stain fill on the course wall (`.075`) and on a
finish (`.08`, `× 1.8` at night). The total is capped: at most `.16` anywhere in
daylight on Soaked, a streak and its core together (the core is `.045`). That
keeps the wall clearly lighter than terrain, keeps graffiti and displays
readable, and keeps the robot's contrast with the wall at or above today's (see
the look plan's contrast measurements in [jumping-look-plan.md](jumping-look-plan.md)).

The heavier levels keep the same shapes, a streak narrowing as it runs down.
No new kinds of mark appear: a soaked room is a wetter version of a normal one,
not a different style.

**As built, streaks are rectangles that never overlap** (`wallWear.ts`). The
daylight renderer redraws a clipped patch around moving actors over a cached
frame and must match it exactly (`jumpingExposureCorrection.dev.spec`). Chrome
rounds translucent paths differently under that clip: one fill of every
streak, the original slanted streaks, clusters of streaks in one path and even
single stepped paths each came out a level off somewhere, in about one layout in
three at Heavy and Soaked. Rectangles drawn with `fillRect`, as the panels' own
tints are, matched. So:

- A streak narrows and leans in level steps, each its own `fillRect`, with
  enough steps that it still reads as a taper at play scale.
- Separate rectangles add where they overlap, so streaks never do: a panel's
  streaks each take a slot across its width, inside the panel, and a streak that
  a long one from the row above runs into is left out. That choice looks only at
  the row above as laid, so it is the same from every view.
- A Soaked core lies over its own streak, the one overlap, within the cap.

In a few layouts in twenty, a Heavy or Soaked stain beside a moving actor or
under the floor's edge still comes out one level off in the redrawn patch, which
no one can see. The spec's Heavy and Soaked cases use a fixed level ID so they
stay deterministic; its default case takes a fresh ID, and so fresh stains, on
every run.

### What the setting covers

Stains are what water leaves, so the setting also scales the other water mark
by the same steps:

- **Rust weeping from pipe joints:** the chance per joint (today 3 in 4) and the
  streak's length.
- **L.A.B. wall stamps** (`stampWear.ts`): their ink wears with the room. Chips,
  specks and a few scuffs of paint are gone, and from Normal up some patches
  have thinned to under half strength; Light chips a stamp lightly, Soaked wears
  it hard, and None leaves it crisp. Wear is random per stamp, hashed from the
  level's ID and the stamp's place and size, so it is the same on every visit
  but reshuffles when the stamp is moved or resized. Marks are clip cut-outs
  laid clear of one another, so no ink is drawn twice.
  On Canvas, a stamp is rasterized whole on its own canvas and copied in at a
  whole-pixel offset (`drawStamp` in `wallText.ts`). Chrome rasterizes small
  paths differently when a clip cuts them, by up to a fifth of their ink and deep
  inside the clip, not just at its edge, so the daylight patch redraw came out
  visibly different on a rotated stamp, worn or not. A copied raster is the same
  under any clip. Other small wall-art paths that must survive the patch redraw
  need the same: `fillRect`, as the stains use, or a whole raster.

Terrain wear (cracks, chips, rust on steel, pebbles and soil in earth) is age and
material, not water, and stays as it is. The stain under a
loose panel is drawn at the level's stain opacity, but always appears,
including at `"none"`.

### Variation per level

The level's ID joins the hash for wall stains and pipe rust and the void's layout behind loose
panels, so each room has its own pattern, still stable across visits
and studio edits. Changing a level's ID reshuffles its stains, which is harmless.
This moved where stains fall in every existing level once; no level was authored
around a particular stain, since stains only arrived with commit `905ae21`.

**Terrain wear stays world-anchored** (decision D1, amended). Its marks only
match under the daylight patch redraw in the layouts they happen to fall in: with
the level ID mixed in, about a third of fresh layouts put a crack, pit or chip
where the redrawn patch came out a level off, and every test that builds a level
with `blankTrial` gets a fresh ID per run. Kept world-anchored, the layout the
specs check is the layout the game draws. Making terrain wear robust under the
patch, as the wall stains now are, is its own change.

### In the studio

**Level → World → Stains** (None, Light, Normal, Heavy, Soaked), directly under
**Wall finish**. Normal deletes the field.

## Design guidance

These go into [Making a fun jumping level](jumping-level-design.md), section 1,
beside the pipes and stripes guidance, replacing its line "Do not add more wear
by hand".

- **A loose panel is a placed object with a reason.** Loosen one where someone
  would have reached the services, or where something gave way: beside a pump,
  a tank, a powered door, the junction a wall wire runs into, or under a
  dripping pipe (with Leak). Two or three in a room is plenty; a wall of them is
  texture.
- **Keep hints and displays off them.** Clocks, coin switches and wall lights
  may not sit on one, and wall text is drawn over it as if the panel were still
  in place, so keep graffiti and hints on whole panels.
- **Choose stains for the place, not the level's difficulty.** A new, clean wing
  can be Light or None. Freight, Water and anywhere flooded can be Heavy;
  Soaked is for rooms where water is the story (a burst main, a flooded
  basement). Use Leak to put one strong mark where it means something, under a
  failed pipe or a dripping service void.

## Implementation

### Phases

1. **Stain intensity and per-level variation**: built.
2. **Panel geometry** (`panelAt` for the course wall and every finish): built.
3. **Missing panel artwork**: built, then replaced by loose panels
   (`wallLoosePanels.ts`); see [How the design changed](#how-the-design-changed).
4. **Studio**: the Loose panel tool and inspector, and the Stains setting.
5. **Docs and review sheets**, then the owner chooses levels to use them on. No
   built-in level uses either yet, apart from the per-level stain variation.

### Rendering

The daylight renderer redraws a clipped patch around moving actors over a cached
frame and must match it exactly (`jumpingExposureCorrection.dev.spec`). Chrome
rounds slanted edges, small paths and thin marks a level differently where that
clip passes, which shaped both features:

- **Stains** are level steps drawn with `fillRect` that never overlap (see
  Stain intensity above).
- **Each loose panel is drawn from its own raster.** On an HTML canvas its
  pieces (the void's rectangles, the tilted face and shadow, the grid) are drawn
  on a canvas of its own with the frame's transform shifted by whole pixels, and
  copied in, as the L.A.B. stamps are (`wallText.ts`). A copied raster is the
  same under any clip. A WebGL recording takes the pieces directly.
- The artwork is built once per panel, keyed on its point, hang, contents and
  leak and the level's finish, stains, ID and night, and the raster is kept while
  the transform holds. The face's grid is drawn at paint time, at the view's zoom,
  with the course wall's own spacing and hairline.
- When a level has loose panels, pipe rust is drawn before them (and the pipes
  after), so the panels cover it.
- Cost: a few dozen fills per panel, rasterized once per camera position.
  Stains are a `fillRect` per step of each streak in view (three to twelve
  steps): in a 1600 × 900 view, about 50 on a Normal course wall and 280 on
  Normal tiles, 290 and 1,500 at Soaked. Soaked tiles are the busiest case.

### Tests

- **Unit** (`jumping-wall-stains`, `jumping-wall-panels`, `jumping-loose-panels`):
  both fields' parsing and validation; `panelAt` against the joints the wall
  draws, doubles included; the hang (pivot and tilt); the void layout running
  behind neighbouring panels; every panel showing a service but an empty one;
  contents filtering; drawing over paint and under hardware; the studio edits.
- **Browser:** `jumpingLoosePanels.dev.spec` loosens a panel, sets its bolt,
  contents and leak, drags it across a joint, nudges it, changes the finish,
  sets Stains and saves; `jumpingExposureCorrection.dev.spec` runs its daylight
  scenes with Heavy and Soaked stains and with loose panels beside the actors.

### Review sheets

`.local/look/holes-sheet.mjs` (loose panels of every contents on any finish, day
and night, with a play-scale inset) and `.local/look/wall-sheet.mjs` (a fifth
argument sets the stain level). Readability and taste are the owner's call;
automated tests do not cover them.

## Decisions for the owner

Each default is what gets built unless the owner says otherwise.

| # | Decision | Default |
| --- | --- | --- |
| D1 | Mix the level's ID into stains, rust and the void layout | Yes, built for stains, rust and the void: every existing room's stains moved once. Not terrain wear, which stays world-anchored (see Variation per level). |
| D2 | `stains` also scales pipe rust | Yes, since both are water marks. Terrain wear is age, not water, and stays. |
| D3 | The void is one continuous world layout rather than composed per panel | Yes, so neighbouring loose panels show the same services. |
| D4 | A small status lamp in a junction box, lit while the room has power and dark during an EMP, or a loose panel that swings when the robot lands nearby | Not built. A lamp is a self-lit pass (night only, with bounds); a swing is an effect tied to physics. Either can follow as its own change. |
| D5 | Wall text painted on a loose panel turning with it | Not built. Text is drawn over the panel as if it were still in place. |
| D6 | Per-area wetness (a wet corner on an otherwise Normal wall) | Not built. Leak covers the common case. |

## Out of scope

- Loose panels on cave walls, terrain or the sky.
- Anything the robot can interact with: pulling a panel off, climbing the
  services, hiding behind one.
- New stain shapes or colours, or stains on terrain faces.
- Changing which levels use any of this.
