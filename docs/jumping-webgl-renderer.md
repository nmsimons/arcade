# Moving LAB's renderer to WebGL

Status: proposed, November 10, 2026. Nothing here is built yet.

## Why

LAB draws every frame with the Canvas 2D API, and on the reference laptop
(Snapdragon X Elite, Adreno X1-85, Edge 157) it cannot hold 60 fps on its
heavier levels. A browser trace of Full Tilt settles where the time goes: the
browser's GPU process is busy 99% of every frame, while the page's main thread,
which runs all of LAB's JavaScript including physics, is busy about 30%
([performance notes](jumping-performance.md#what-the-gpu-pays-for)). LAB is not
held back by JavaScript. It is held back by how much drawing it asks for.

Canvas 2D is an immediate-mode vector API. Every frame, every terrain outline is
rasterised again, every clip builds a fresh mask, every glow is a separate blur,
and lighting is composed from several full-screen passes and replays. Canvas
caches cannot remove this exactly, because the camera moves continuously and a
cached image placed between device pixels resamples. The canvas fixes of
November 10 (terrain edges, display glow, panel strokes) gained 2–4 fps each at
DPR 1.5; what remains is the cost of the model itself.

WebGL changes the model. Static geometry is triangulated once and redrawn from
GPU memory; repeated artwork becomes textures and instanced quads; glows and
lighting become shader passes; and the whole frame is a few batched draw calls
rather than thousands of vector operations.

**Goal.** The same look and the same feel, at 60 fps. Physics, poses, level
files, the studio's authoring model, React UI and audio do not change.
Rendering never changes physics today (`stepPlayer`'s contract), and golden
traces prove it stays that way.

**Targets.** On the reference laptop at 1280×800 CSS and DPR 1.5, adaptive
quality off, measured with `npm run profile:jumping-level`: Full Tilt and Exit at
58 fps or better in every section, the GPU process under 60% busy, and main-thread
frame time no higher than today's.

## What exists

| Area | Today |
| --- | --- |
| World drawing | About 5,000 lines in 39 modules: `challengeRender.ts` orders the layers; artwork lives in `render.ts`, `athleteDraw.ts`, `terrainGroundCover.ts`, `goal.ts`, `pickups.ts`, `wallWiring.ts`, `gravityRender.ts`, `wallText.ts` and others |
| Lighting | `lightingRender.ts` (796 lines) and `environmentLighting.ts` compose the frame on Canvas 2D: 58 compositing-mode changes, scratch canvases and readable-floor replays. The daylight and night shadow field is already WebGL (`lightingGpuField.ts`, `lightingGpuShadows.ts`, about 370 lines), in its own context, copied in with `drawImage` |
| Canvas features used | Paths and `Path2D` (26 cached), arcs and rounded rectangles, 32 clips, 41 `drawImage`, patterns (terrain texture), gradients, 10 `shadowBlur` glows, text (wall texts, displays), compositing modes |
| Canvas owners | The game, the studio (`LevelBuilder.tsx`), library thumbnails (`LevelThumbnail.tsx`), the lighting lab and the model review |
| Levels | 43 built-in: 23 without lighting (daylight), 7 lit by day, 13 at night; 3 interior and 1 landscape environment; 9 facility areas |
| Tests | Golden traces hash physics, state and poses, all independent of drawing. Render unit tests drive draw functions with recording contexts. 53 of LAB's browser spec files observed the drawing by patching Canvas 2D calls: the robot through `installAthleteHeadObserver`, the camera through the wall's `fillRect`, and artwork details through other calls |
| Tools | `profile-jumping-level.mjs` (frame timing, `--skip` layer pricing, `--trace` GPU busy) and `compare-jumping-frames.mjs` (deterministic frame comparison) |

## Our own WebGL 2 renderer

**Decided: LAB gets its own renderer on WebGL 2, not a library.** PixiJS was the
other option. It would have saved building the basics, but its scene model and
pipeline would set limits on exactly the parts LAB depends on: the
exposure-floor lighting, the painter's order with wall layers, and the
studio's live geometry edits. Owning the renderer costs more weeks before the
first frame looks right, and gives full control of every pass. It is built
from these parts:

| Part | What it does | How |
| --- | --- | --- |
| Context and resources | One WebGL 2 context per game canvas; buffers, textures and render targets in a registry, within the GPU allowance | On context loss, release everything; on restore, rebuild from level data, which is the source of truth |
| Paths | The Canvas path model the artwork already uses: `moveTo`, `lineTo`, quadratic and Bézier curves, `arc`, `ellipse`, `roundRect`, `closePath` | A `PathBuilder` with the same calls, flattened to polylines at the current scale, so artwork code ports by changing its target, not its logic |
| Fills | Triangles from flattened outlines, with the nonzero and even-odd rules the artwork uses | Ear clipping for simple outlines; the stencil buffer for self-overlapping paths and even-odd fills. One small, well-tested triangulation library (earcut, about 3 KB) is the one dependency proposed |
| Strokes | Lines with Canvas's widths, joins (miter, round, bevel) and caps (butt, round, square), including sub-pixel hairlines (the wall grid, panel lines) | Extruded triangle strips; hairlines thinner than a device pixel keep their width and fade their alpha, as Canvas does |
| Anti-aliasing | Edges that look like Canvas's | Multisampling (4×) to begin with, judged on contact sheets; analytic edge coverage for hairlines and small shapes if multisampling is not close enough |
| Batching | Few draw calls per frame | One vertex format (position, colour, texture coordinates, an exposure floor); static meshes in GPU buffers, built once; per-frame geometry streamed into a ring buffer; draws sorted only where painter's order allows |
| Materials | Flat colour, the terrain material patterns, images | Repeating textures at the same half scale as today's patterns |
| Clips | Ground cover inside its rock and outside its occluders; doorways; levels' bounds | The stencil buffer, which supports nested clips and even-odd |
| Compositing | Multiply, lighter, destination-in and the other modes the lighting uses | Blend functions where one exists; otherwise a pass in the lighting composite |
| Glow | `shadowBlur` | A two-pass Gaussian blur on a small render target per glowing group, cached like today's display glow; sigma half the blur, as Canvas defines it |
| Text | Wall texts, display glyphs, placards | Rasterised once with Canvas 2D into a texture atlas (fonts are already loaded), drawn as quads |
| Lighting | The day and night composite | See below; the existing shadow-field shaders move into this context |

It targets WebGL 2 for its reach; WebGPU can follow later behind the same
interface. Development uses a frame debugger (Spector.js or the browser's) to
inspect passes and draw calls.

## Architecture

### One renderer interface, two backends

A `WorldRenderer` interface takes a run (or a studio preview), a view and a
frame time, and draws: `render`, `resize`, `dispose`, plus context-loss events.
`CanvasWorldRenderer` wraps today's `LightingRenderer` and `drawPuzzleWorld`
unchanged. `WebGLWorldRenderer` is new. The game chooses one per mount: WebGL by
default once it is ready, Canvas when WebGL 2 is unavailable, after an
unrecoverable context loss, or by a developer setting. Both stay until WebGL has
shipped as the default for a release.

Everything above the renderer is untouched: the simulation, `athletePose` (poses
are computed, then drawn), level parsing, the studio's editing logic, the React
HUD and dialogs.

### A retained scene in painter's order

The WebGL scene keeps `drawPuzzleWorld`'s order, which the look depends on: the
backdrop and wall, wall objects (gravity regions, light fixtures, doors, displays,
coin switches, pickups), terrain, mechanisms, plates, fields, props and
climbables, robots, the robot player, gadgets and water. What changes is when
work happens:

- **Built once per level, and again when the studio edits geometry:** backdrop
  wall and grid, terrain meshes with their material textures, underlap patches,
  edge relief and ground cover, wall wiring and wall texts (rendered to
  textures). The terrain revision counter this needs also replaces today's
  per-frame string cache keys.
- **Built when their content changes:** display faces and their glow (as the
  canvas glow cache does now), coin switch counts, door placards and boards.
- **Moved every frame by transform or uniform only:** pickups (instanced, the
  spin as a per-instance value), mechanisms, props, plates, fields, the bus.
- **Rebuilt every frame, batched:** ropes (triangle strips from the solver's
  nodes), the robot player and robots (their parts from the pose), movement and
  gadget effects, water surfaces.

### Lighting as a composite pass

Today a lit frame draws the world, multiplies it by the light field, then
replays readable artwork (the `WorldPaint` exposure floors of 0.65 and 1) through
scratch canvases so it never darkens below its floor. In WebGL the world renders
once into an offscreen target with two outputs: colour, and the exposure floor
each draw already declares through `paint(ctx, exposure, …)`. The existing shadow
field moves into the same WebGL context, and one composite shader produces
`colour × max(field, floor)` plus emission. Night mode, region lighting
(`environmentLighting.ts`), emissions and readable corrections become passes of
that shader instead of canvas replays. This is the largest single saving and the
largest piece of work.

### Camera, resolution and memory

The view maths stays as it is, including continuous camera movement: nothing is
snapped to pixels, so motion feels the same. The device pixel ratio becomes the
renderer's resolution. The existing GPU allowance (64 MiB, `gpuLightingBufferBytes`)
extends to meshes, atlases and render targets, with the same recovery when a
view would exceed it.

### Tests and tools

53 of LAB's browser spec files (65 counting the arcade's other games) observed
the drawing by patching Canvas 2D calls, which a WebGL renderer never makes.
They observe two kinds of thing. Many find the camera or the robot: about 40
catch the wall's `#f1f1ed` fill for the camera, and 11 find the player through
its head. The rest check artwork details (door
widths, clock readings, gravity dust, water droplets, colours) and are render
tests for one layer.

The drawing code therefore reports what it drew (`debugFrames.ts`): the wall,
with the camera transform, each head, with its body transform, and each digital
display, with its reading, at the same moments and with the same values the
hooks read. Reports are off unless a test
sets `jumping:debug-frames`. Both renderers report from the shared artwork
level, so they report alike. The locating specs move to these reports first; a
spec checking a layer's artwork moves to a report for that layer when the layer
is ported, not before. The profiling harness and the frame comparison gain
`--renderer canvas|webgl` once there are two renderers.

## Looking the same

Two renderers cannot match pixel for pixel: WebGL anti-aliases shapes
differently from Canvas 2D. The bar is the same look by eye, checked three ways:

1. **Contact sheets.** Fixed game states, deterministic through the fake clock,
   for every built-in level and key moment (opening, mid-route, lit and unlit,
   studio), Canvas and WebGL side by side at DPR 1 and 1.5, reviewed by you
   before each phase is called done.
2. **A perceptual check** in `compare-jumping-frames.mjs` that flags regions
   whose average difference exceeds a threshold, so a missing or misplaced object
   cannot slip through as "anti-aliasing".
3. **Strict WebGL-to-WebGL comparisons** once a phase is accepted, so later work
   cannot drift.

Known risks to the look, to settle in phase 1: hairline strokes (the wall grid
and panel lines), the terrain texture's fine marks, ground-cover tufts, glows,
text, and anti-aliased edges under the lighting multiply.

## Phases

Each phase ends with its exit check passed and its results in the performance
notes. Estimates assume one engineer working with Claude and will be revised
after phase 1, which builds the core and so shows the real pace.

| Phase | Work | Exit check | Estimate |
| --- | --- | --- | --- |
| 0. Foundations | Frame reports for the wall, heads and displays; the head observer, the camera hooks and the clock readers moved to them; each spec's remaining hooks listed by layer | The moved specs green on Canvas; no visual or timing change | 1 week |
| 1. Core and terrain | The `WorldRenderer` interface, designed against its first WebGL user, around today's renderer; the renderer core (context, paths, fills, strokes, anti-aliasing, batching, materials, clips) and, with it, the backdrop and terrain (fill, texture, edges, ground cover) for Full Tilt by day, Canvas drawing the rest on a transparent canvas above | GPU busy and fps measured against Canvas; terrain, hairlines and ground cover look the same by eye. **Go or no-go on the approach** | 2–3 weeks |
| 2. Daylight courses | Every layer `drawPuzzleWorld` draws, plus the daylight shadow field, in WebGL; one canvas | All 23 unlit levels pass the contact sheets and targets; WebGL default for them behind a setting | 2–3 weeks |
| 3. Lighting | The composite pass: day-lit and night levels, light sources, region lighting, emissions and readable floors, landscape and interior environments, charging bays, bus ending | All 43 levels pass; Exit meets the targets | 2–3 weeks |
| 4. Facility and studio | Facility areas (doors, boards, placards), the studio view (its selection and handles can stay a 2D overlay on top), thumbnails, lighting lab, model review | Studio and facility browser specs green on WebGL | 1–2 weeks |
| 5. Default | WebGL default everywhere, Canvas kept as fallback for one release; docs | Full suite on both renderers; targets met on the reference laptop | 1 week |

About 9–13 weeks in all. Phase 1's look and numbers decide whether it continues.

## Risks

- **Scope.** Five thousand lines of artwork and two thousand of lighting, with a
  long tail of small pieces (wire terminals, gadgets, the bus ending). Porting by
  layer, behind the interface, keeps the game shippable throughout.
- **Two renderers at once.** Every visual change during the move lands twice.
  Keep the move short, and freeze art changes per layer while it ports.
- **The look drifts.** Contact sheets per phase, then strict regression checks.
- **Devices.** WebGL 2 is near universal, but context loss, iOS Safari and
  integrated GPUs need testing; Canvas stays as the fallback.
- **Phase 1 splits the world across two canvases**, which only works
  for a contiguous bottom band of layers. It is a measurement step, not a
  shipping state.
- **Owning the renderer.** Anti-aliasing, strokes and text are ours to get right
  and to maintain. The contact sheets catch the look; a frame debugger and the
  render-path unit tests (paths, triangulation, strokes) catch the mechanics.

## Decisions for you

1. **Triangulation:** use earcut (about 3 KB, the one proposed dependency), or
   write our own ear clipping.
2. **The bar for "looks the same":** your review of contact sheets, with the
   perceptual check as a guard.
3. **Device floor:** WebGL 2 required for the new renderer, with Canvas as the
   fallback for how long.
4. **The studio:** move it fully, or keep its overlays in 2D above a WebGL world.

## First steps

Phase 0 is under way. The wall, head and display reports exist; the head
observer, every hook that only found the camera, and every clock reader use
them, so 12 files no longer patch the canvas. Display readings came first
because cached display glow (see the performance notes) hid the `shadowBlur`
the clock hooks keyed on. 41 LAB spec files still patch the canvas, each
watching one layer's artwork, and move with their layer:

| Layer | Specs still patching Canvas 2D |
| --- | --- |
| Props, plates, mechanisms, doors and lights (`challengeRender`, `goal`, `wallLight`, `lightFixture`) | jumpingEntrance, BallDescent, DownhillBallPush, FreeFall, InsetBrace, Lab, MechanismPassengers, RobotSlopes, Squeeze, FloatSwitch, Switches, Challenge, MountedPlates, LightingEditor, Branding, RopeGate, RopeProps, Menu |
| Pickups and wall text (`pickups`, `wallText`) | jumpingPickups, TimeBonus, TimePenalty, RobotRider, RobotSight, Emp |
| Coin switches (`coins`) | jumpingCoins |
| Robots and equipment (`androidArtwork`, `equipmentPalette`) | jumpingRobotEntrance, RbotWater, RbotWaterline, RepulsorBot, Gadgets |
| Gravity and water (`gravityRender`) | jumpingGravity, WaterEditor, WaterLevels, the jumpingWaterPerformance helper |
| Force fields, air boosters, wire terminals, terrain relief | jumpingForceField, AirBoosters, WireTerminals, SurfaceDepth |
| The studio (`LevelBuilder`, `builderPlacement`, `backWallEditing`) | jumpingBuilder, BuilderPlacement |

`jumping.spec.mjs` keeps one `fillText` hook, on the HUD-free view. Phase 1 then
defines `WorldRenderer` and starts the core with Full Tilt's terrain.
