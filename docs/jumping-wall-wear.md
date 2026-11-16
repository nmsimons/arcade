# Missing panels and stain intensity

Status: proposed November 16, 2026. Built November 16, 2026: phase 1 (stain intensity and per-level
variation) and phase 2 (panel geometry, `panelAt`). Phases 3 to 5 not started.

Two additions to the back wall of Untitled Jumping Game, both artwork only:

- **Missing panels.** An author can take one panel out of the back wall, so the
  room's services show through the hole: pipes, cable trays, conduit and
  junction boxes in the dark void behind the panelling.
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

## Missing panels

### What the player sees

One panel of the back wall is gone. The panels around it are untouched, so the
hole has the exact outline of a panel and its joints: it reads as a panel taken
off, not as a hole in the room. Through it is the service void:

- **The cut edge.** The wall has thickness. Inside the top and left edges a
  shaded band (the panel above and to the left casting into the void, from the
  game's upper left light) about 5 units deep; inside the bottom and right
  edges a thin lit lip about 1.5 units, the face of the panel's edge catching
  the light. This is the joints' own language (shade top and left, light lip),
  turned inside out.
- **The back of the void.** A flat dark fill, darker than the wall but not
  black: `#3a403c` in daylight, so it never reads as an open doorway (doorways
  are darker and have a frame). A horizontal strut of steel channel crosses it
  where the layout puts one, with bolt slots marked by a short dark dash.
- **Services.** Running across the void, in front of its back and behind the
  cut edge:
  - **Pipes.** One to three runs, the same construction as wall pipes (body, one
    lit and one shaded band, flanges, a strap) but one step darker throughout,
    because they sit deeper and in shadow. Small and medium only.
  - **Cable trays.** A ladder tray (two rails and rungs every 12 units) with a
    bundle of three to five cables lying in it, each a 1.5 to 2.5 unit line in
    muted greys and one in a dull colour (oxide red, blue or the wiring's
    gray-green), sagging slightly between the rungs.
  - **Conduit.** A thin grey tube with a coupling every 60 units, sometimes
    turning down into a **junction box**: a small box (16 to 24 units) with a
    lid line and two screws.
  - **Loose cable.** In a broken panel only, one cable end hangs down out of a
    tray, with a short bare tip.

Everything inside is static. Nothing sparks, glows or moves (see decision D4).

### Two kinds of damage

| `damage` | Studio name | Looks like |
| --- | --- | --- |
| `"removed"` (default) | Removed | The whole panel taken off for maintenance: clean edges, and a dark bolt hole in each corner of the neighbouring joints where it was fixed. |
| `"broken"` | Broken | The panel smashed through: about two thirds of it gone, the rest still in place as two or three shards with a jagged edge (a deterministic outline per panel), short cracks running from the edge into the remaining shards, and the loose cable end. The shards keep their panel's tint, wear and stains. |

### Contents

| `contents` | Studio name | What is in the void |
| --- | --- | --- |
| `"services"` (default) | Pipes and wiring | Both pipes and electrical, as the layout gives them |
| `"pipes"` | Pipes | Pipe runs only, plus the strut |
| `"electrical"` | Wiring | Trays, conduit and junction boxes only, plus the strut |
| `"empty"` | Empty | The strut alone: a void with nothing in it |

### Layout of the void

The services are not arranged per hole. They belong to one continuous void
behind the whole wall, laid out on a world grid, and each missing panel is a
window onto it. So two neighbouring missing panels show the same pipe running
straight through from one into the next, and a missing panel in a 120-unit tile
shows the same services as the corner of a 360-unit course panel at that spot.

- **Horizontal service lines** at every 60 units of height, counted from the top
  of the level. Each line, for each 480-unit length of the wall, is one of: a
  pipe (small or medium), a cable tray, a conduit, or nothing. The choice is a
  hash of the line, the length and the level's ID (see
  [Stain variation per level](#variation-per-level)), weighted so that a void
  is about half empty: crowded voids look like texture.
- **Risers.** For each 480-unit column of the wall, one in three has a vertical
  run (a pipe or a conduit) at a hashed x.
- **Struts** at every 240 units of height.
- **Junction boxes** where a conduit meets a riser, or for one hashed conduit
  length in three.
- `contents` filters this layout: `"pipes"` keeps only pipe lines and risers,
  `"electrical"` only trays, conduit and boxes.

**At least one service per hole.** If the layout leaves a hole with nothing
(other than for `"empty"`), the line nearest its middle is promoted to the
first allowed kind. This promotion is that panel's own: its neighbours see the
line only where they are also promoted, so it can stop at a joint. That is
acceptable, since services do end.

The layout is deterministic, so a room looks the same on every visit, in the
studio, the game and thumbnails, on both renderers.

### Wall art around a hole

- **Paint does not cross the hole.** Hazard stripes and wall text are paint on
  the panel; where the panel is gone, so is the paint. Both are clipped out of
  missing panels (an even-odd clip of the level rectangle and the holes, which
  `ArtPath` already records).
- **Hardware does.** Wall pipes, wall wiring, blocked doors and charging bays
  are fixed to the wall and drawn over the hole, as if fixed to the panels
  either side. A wall pipe crossing a hole is a deliberate, good look.
- **Stains.** A removed panel's stains go with it. A panel whose top joint is a
  hole's bottom joint gets a stain from that joint, every time, because water
  leaks out of the void (`leak: true` makes it a long one, see below).
- **Displays may not overlap a hole.** A clock, coin meter or wall light
  mounted over a hole would have nothing to hang on. `levelProblems` reports
  "Move Clock 1 off Missing panel 2." for any wall-mounted display whose
  bounds overlap a hole. Exits, doors and charging bays may overlap.

### Leaks

`leak: true` adds a long stain running from the hole's bottom joint down the
wall below it: the full height of the panel below (or until terrain covers it),
twice a normal stain's width, in the stain colour at its level's opacity, with
a darker, narrower core. The void's bottom edge gets a damp band. A leak is the
one place an author asks for a stain at a chosen spot. Use it below pipes
(`"services"` or `"pipes"`); validation does not require that, but the design
guidance does.

### Lighting and night

The hole is wall artwork and is lit as the wall is: it takes the room's ambient,
spotlight pools and terrain shadows like any wall art (see
[Flat lighting](jumping-lighting.md), section 4). It emits nothing. In a
night-mode level, its lit lips and the highlights of its contents are drawn
stronger by the finish's joint factor (2.1) so its structure survives the
darkening, as panel joints do.

### Where a hole goes

A missing panel names a point on the wall, not a rectangle. Its hole is the
panel under that point, in the level's current finish:

- Changing the level's **Wall finish** keeps every hole at the panel under its
  point, so a hole always matches the joints around it.
- A point on one half of a double panel removes the whole double: it was cast as
  one piece.
- A hole that crosses the level's edge is clipped to it.
- In a landscape environment, the point must lie on a back wall drawn with the
  course wall. Cave walls and sky have no panels, and `levelProblems` reports
  "Put Missing panel 1 on a panelled back wall."
- Two missing panels that resolve to the same panel are a problem:
  "Missing panel 2 is the same panel as Missing panel 1."

`wallFinish.ts` gains `panelAt(finish, x, y)`, returning the panel's rectangle,
column and row with merged doubles resolved, and `drawWallPanels`'s geometry
moves into the same function for the course wall, so the hole and the drawn
joints can never disagree.

### File format

```json
"missingPanels": [
  { "x": 1260, "y": 300 },
  { "name": "Pump access", "x": 1620, "y": 300, "damage": "broken", "contents": "pipes", "leak": true }
]
```

| Field | Values | Default |
| --- | --- | --- |
| `name` | Optional object name, as for other objects | none |
| `x`, `y` | A point inside the level, in world units, y down, as other wall art | required |
| `damage` | `"removed"` or `"broken"` | `"removed"`, saved by leaving it out |
| `contents` | `"services"`, `"pipes"`, `"electrical"` or `"empty"` | `"services"`, saved by leaving it out |
| `leak` | `true` | left out |

Up to 24 per level (`MAX_MISSING_PANELS`). Like pipes and stripes, in any level,
version 1 or 2. Missing panels add no collision, grip, cover or light, and are
never entered.

### In the studio

- **Back wall → Missing panel.** Hovering the wall outlines the panel that a
  click would remove; a click removes it. The saved point is the panel's
  centre, so a later change of finish lands on the nearest panel to it.
- **Moving** a missing panel drags its point. The hole jumps from panel to
  panel as the point crosses joints, with the outline showing where it will
  land, and never sits between panels. Arrow keys move it one panel.
- **Duplicate** places the copy one panel to the right.
- **Object → Appearance:** **Damage** (Removed, Broken), **Contents** (Pipes and
  wiring, Pipes, Wiring, Empty) and **Leak** (a checkbox).
- **Level → World → Stains**, directly under Wall finish: see below.
- A missing panel's outline is the panel's rectangle; it has no resize handles.
- Selection, group moves, copy and paste, undo, labels ("Missing panel 2") and
  the builder icon follow the existing wall-art kinds (`editor.ts`,
  `editorSelection.ts`, `objectLabels.ts`, `BuilderIcon.tsx`,
  `builderPlacement.ts`, `LevelBuilder.tsx`).
- Changing the room's height keeps each point's height above the floor, as for
  other wall art. Because panel rows count from the top of the level, the hole
  may then move to the panel above or below; it stays on whole panels.

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

Terrain wear (cracks, chips, rust on steel, pebbles and soil in earth) is age and
material, not water, and stays as it is. Leaks on
missing panels are drawn at the level's stain opacity, but always appear,
including at `"none"`.

### Variation per level

The level's ID joins the hash for wall stains and pipe rust (and, in phase 3,
the void's layout), so each room has its own pattern, still stable across visits
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

- **A missing panel is a placed object with a reason.** Open the wall where
  someone would need to reach the services: beside a pump, a tank, a powered
  door, the junction a wall wire runs into, or where a wall pipe enters the
  wall. A broken panel says something hit it: a fallen crate, a crusher, a
  collapse. Two or three in a room is plenty; a wall of holes is texture.
- **Never let a hole look like a way through.** Keep missing panels away from
  the floor where their outline could be taken for a doorway, and do not use
  them to suggest a route the robot cannot take. The void's tone and visible
  services exist for that reason; do not choose `"empty"` low on the wall.
- **Keep hints and displays on whole panels.** Graffiti is clipped by a hole,
  and clocks, coin meters and wall lights may not overlap one.
- **Choose stains for the place, not the level's difficulty.** A new, clean wing
  can be Light or None. Freight, Water and anywhere flooded can be Heavy;
  Soaked is for rooms where water is the story (a burst main, a flooded
  basement). Use Leak to put one strong mark where it means something, under a
  failed pipe or a dripping service void.

## Implementation

### Phases

1. **Stain intensity and per-level variation.** `stains` in the format, parse,
   docs and studio; `panelStains` takes the intensity and level ID; pipe rust
   follows, and terrain wear takes the level ID. Small and self-contained.
2. **Panel geometry.** `panelAt` for the course wall and every finish, with the
   course wall's drawing moved onto it. No visible change.
3. **Missing panel artwork.** `wallMissingPanels.ts`: the void layout, the cut
   edge, both damage kinds, all four contents, leaks, the paint clip, and the
   display overlap check. Drawn in `drawLevelBackdrop` after hazard stripes and
   before wall wiring.
4. **Studio.** The Missing panel tool, inspector and Stains setting.
5. **Docs and a review sheet** (below), then the owner chooses levels to use
   them on. No built-in level changes in phases 1 to 4 except through the
   per-level stain variation.

### Rendering

- Each missing panel's artwork is built once into `ArtPath`s and cached per
  object, keyed on its point, damage, contents, leak, the level's finish, stains
  and ID, as `wallPipes.ts` does. Every `ellipse` and `arc` gets its own
  `moveTo` and `closePath`.
- Missing panels belong to the retained backdrop layer like other wall art, so
  WebGL records them once per level object. The Canvas renderer's daylight and
  night caches are already keyed on the level serial (`lightingRender.ts`), so
  studio edits redraw.
- No gradients, glows, `shadowBlur` or self-lit `paint` passes.
- Cost: a handful of fills and strokes per hole, nothing per frame. Stains are a
  `fillRect` per step of each streak in view (three to twelve steps): in a
  1600 × 900 view, about 50 on a Normal course wall and 280 on Normal tiles, 290
  and 1,500 at Soaked. Soaked tiles are the busiest case the spec allows.

### Tests

- **Unit:** parsing and validation of both fields (limits, duplicates, cave and
  sky placement, display overlap); `panelAt` for the course wall and every
  finish, including staggered rows, upright columns and merged doubles; a hole
  matching the joints drawn around it; the void layout continuing across two
  neighbouring holes; promotion leaving no hole empty except `"empty"`;
  stripes and wall text clipped out of holes; stain counts and opacity within
  each level's range and under the cap; `"none"` drawing no stain fill;
  determinism across calls and a change with the level ID; the WebGL recorder
  replaying all of it.
- **Wall finish tests** (`tests/jumping-wall-finish.test.mjs`): update to the
  stain intensity's fills (one fill, two at Soaked) and keep everything else
  they assert.
- **Browser:** a studio spec that removes a panel, changes its damage, contents
  and leak, drags it across a joint, changes the wall finish, sets Stains, saves,
  and checks the JSON and `levelProblems`.

### Review sheet

Before phase 5, a sheet like `.local/look/grit/sheet.html` showing:

- every finish, with a removed and a broken panel of each contents, in
  daylight, at night and under a spotlight;
- two neighbouring holes, to check continuity;
- a wall pipe crossing a hole, and graffiti and stripes clipped by one;
- the five stain levels side by side on the course wall and on two finishes;
- a hole beside a doorway, to check the two are never confused.

Readability and taste are the owner's call from the sheet; automated tests do
not cover them.

## Decisions for the owner

Each default is what gets built unless the owner says otherwise.

| # | Decision | Default |
| --- | --- | --- |
| D1 | Mix the level's ID into stains, rust and the void layout | Yes, built for stains and rust: every existing room's stains moved once. Not terrain wear, which stays world-anchored (see Variation per level). |
| D2 | `stains` also scales pipe rust | Yes, since both are water marks. Terrain wear is age, not water, and stays. |
| D3 | The void is one continuous world layout rather than composed per hole | Yes, so neighbouring holes join up. |
| D4 | A small status lamp in a junction box, lit while the room has power and dark during an EMP, or sparks from a broken panel's loose cable | Not built. A lamp is a self-lit pass (night only, with bounds); sparks are an effect with audio. Either can follow as its own change. |
| D5 | A wall pipe that dives into a hole (ends inside the void) | Not built. Today a wall pipe crossing a hole is drawn over it. |
| D6 | Per-area wetness (a wet corner on an otherwise Normal wall) | Not built. Leak covers the common case. |

## Out of scope

- Missing panels on cave walls, terrain or the sky.
- Anything the robot can interact with through a hole: reaching in, climbing
  the services, hiding.
- New stain shapes or colours, or stains on terrain faces.
- Changing which levels use any of this.
