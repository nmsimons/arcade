# Moving LAB's renderer to WebGL

Status: proposed November 10, 2026. Phases 0, 1 and 2 are done, and since
November 12 WebGL is the default for the daylight frames it draws (see
[Progress](#progress)); `?renderer=canvas` keeps Canvas alone.

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
| Paths | The Canvas path model the artwork already uses: `moveTo`, `lineTo`, quadratic and Bézier curves, `arc`, `ellipse`, `roundRect`, `closePath` | Built (phase 1): a recording context (`webgl/recorder.ts`) that the unchanged artwork draws into, and `ArtPath` (`webgl/artPath.ts`), a `Path2D` that remembers its geometry. Curves are flattened to 0.2 device pixels at the recorded zoom |
| Fills | Triangles from flattened outlines, with the nonzero and even-odd rules the artwork uses | Built: a convex outline is fanned; a simple outline, or an opaque fill of simple outlines, is ear-clipped (our own, `webgl/geometry.ts`); anything else, such as overlapping translucent shapes or even-odd, counts winding in the stencil and is then covered. No dependency was needed |
| Strokes | Lines with Canvas's widths, joins (miter, round, bevel) and caps (butt, round, square), including sub-pixel hairlines (the wall grid, panel lines) | Built: strokes two device pixels wide or more become triangles with Canvas's joins and caps; thinner ones become quads whose exact box-filtered coverage the shader computes, so hairlines keep their brightness as the camera moves. A translucent stroke covers each sample, or pixel, once, as Canvas strokes a path as one shape |
| Anti-aliasing | Edges that look like Canvas's | Built: 4× multisampling for fills and clips, exact coverage for thin strokes. Colours are kept straight and premultiplied in the shader, as Canvas blends, so faint tints match |
| Batching | Few draw calls per frame | Built (phase 2): one vertex format (position, line coverage, colour); retained scenes in GPU buffers, built once; each frame's geometry streamed into one buffer, with the triangles of shapes already seen copied from a cache; consecutive draws with the same clip, texture and exposure share a call |
| Materials | Flat colour, the terrain material patterns, images | Repeating textures at the same half scale as today's patterns |
| Clips | Ground cover inside its rock and outside its occluders; doorways; levels' bounds | Built: the stencil's high four bits count how many clips a sample is inside, the low four count winding, so clips nest and even-odd works; a clip off screen skips everything inside it |
| Compositing | Multiply, lighter, destination-in and the other modes the lighting uses | Blend functions where one exists; otherwise a pass in the lighting composite |
| Glow | `shadowBlur` | Built: Canvas draws each glowing shape's shadow once into a cached sprite, placed between pixels as Canvas places its cached glows; WebGL draws the shape over it |
| Text | Wall texts, display glyphs, placards | Built: Canvas draws each text into a cached sprite at its position's fraction of a pixel, as Canvas positions glyphs (a quarter pixel across, the baseline on a whole pixel), placed on whole pixels |
| Lighting | The day and night composite | Daylight built: one exposure per draw, from the field read at its pixel; night, lamps and environments in phase 3 |

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

Built in phase 2, per frame rather than per mount: `WorldRenderer`
(`worldRenderer.ts`) advances the lighting once and gives each frame to WebGL
when it covers it, otherwise to Canvas, and shows WebGL's canvas only while it
draws. A frame WebGL cannot reproduce is left to Canvas, never drawn wrongly.

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
| 1. Core and terrain | The renderer core (context, paths, fills, strokes, anti-aliasing, batching, materials, clips) and, with it, the backdrop and terrain (fill, texture, edges, ground cover) for Full Tilt by day, as pictures the Canvas frame places in its order | GPU busy and fps measured against Canvas; terrain, hairlines and ground cover look the same by eye. **Go or no-go on the approach** | 2–3 weeks; built in a day |
| 2. Daylight courses | Every layer `drawPuzzleWorld` draws, plus the daylight shadow field, in WebGL; one canvas | All 23 unlit levels pass the contact sheets and targets; WebGL default for them behind a setting | 2–3 weeks; built in a day |
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
- **Phase 1 hands WebGL pictures to the Canvas frame** (now only on daylight
  levels with lamps; phase 2 frames draw on their own canvas). That keeps every pass
  and the drawing order exact, but Chrome charges a canvas about 1 ms of
  main-thread time per frame for drawing a picture from another GPU context.
  It is a measurement step, not a shipping state; the charge leaves with phase 2.
- **Owning the renderer.** Anti-aliasing, strokes and text are ours to get right
  and to maintain. The contact sheets catch the look; a frame debugger and the
  render-path unit tests (paths, triangulation, strokes) catch the mechanics.

## Decisions for you

1. **Triangulation:** settled in phase 1 without earcut. Our own ear clipping
   covers simple outlines and the stencil covers the rest; revisit only if
   later layers need holes triangulated.
2. **The bar for "looks the same":** your review of contact sheets, with the
   perceptual check as a guard.
3. **Device floor:** WebGL 2 required for the new renderer, with Canvas as the
   fallback for how long.
4. **The studio:** move it fully, or keep its overlays in 2D above a WebGL world.

## Progress

### Phase 0: done

The wall, head and display reports exist; the head
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

`jumping.spec.mjs` keeps one `fillText` hook, on the HUD-free view.

### Phase 1: built and measured

**What is built.** The renderer core is in `src/games/jumping/webgl/`:
`artPath.ts` (the remembering `Path2D`), `recorder.ts` (the recording
context), `geometry.ts` (flattening, fans, ear clipping, strokes and thin
lines), `scene.ts` (operations to one static vertex buffer and a list of GPU
passes) and `glLayers.ts` (WebGL 2: a 4× multisampled target with a stencil,
resolved and handed out as an `ImageBitmap`). `worldLayers.ts` records the
backdrop and the terrain once per level and zoom, by running the ordinary
`drawLevelBackdrop` and `drawTerrain` against the recorder, and draws both
every frame from GPU memory. `LightingRenderer` places the two pictures where
it would have drawn their vectors, in every pass, so lighting, shadows and the
other layers are exactly as before. Ground cover and surface depth build
`ArtPath`s, which Canvas draws as before.

**Where it applies.** At first a developer setting, off by default (since
phase 2 it is the default; see below). Daylight levels without an environment
(the 23 unlit levels and the lit-by-day ones), in play. Night, regional
lighting, environments and the studio stay on Canvas; so does a frame whose
zoom is still animating, until it settles. Artwork using anything the recorder
does not reproduce (text, gradients, glows, images, dashes) stays on Canvas
for that layer. The profiler and the frame comparison take
`--renderer <name>=webgl`, so one build is measured or compared against itself.

**Full Tilt's scenes.** The backdrop is 168 fills, 3 strokes and 2 clips,
built into 7,596 vertices and 10 passes (the panels' 168 tints are one draw
call). The terrain is 50 fills, 33 strokes and 15 clips (the moss's planted
bands), 54,189 vertices and 49 passes: 17 direct draws, 2 stencil fills (the
translucent relief, whose strips overlap) and 15 clip pairs, of which only
those on screen are drawn. Recording and building take about 260 ms on the
development server, once per level and zoom.

**The look.** `compare-jumping-frames.mjs` plays the same build on both
renderers on a fake clock and compares every pixel. On Full Tilt's opening
hills, the 3100 hilltop and the 5450 steel section, at 0 and 900 ms, the mean
difference is 0.05 of 255 at DPR 1.5 and 0.07 to 0.10 at DPR 1; 0.5% to 1.3% of
channels differ by more than 2, all on edges: the moss bands' rims and the
terrain's silhouette, where 4× multisampling and Canvas's analytic coverage
round differently, and faint dots where grid lines cross. Contact sheets of the
three most different regions of each frame, magnified three times, are in
`.local/perf/webgl-sheets/`; at that size the two are hard to tell apart. A
browser test (`jumpingWebglLayers.dev.spec.mjs`) holds the WebGL layers to
Canvas on a software GPU: mean difference under 0.5, no 20-pixel block off by
2 or more on average, and the same camera report.

**Measured.** Full Tilt as it is now, in hardware Edge on the reference laptop,
one production build on both renderers, interleaved, three 6 s episodes per
section, adaptive quality off (`.local/perf/webgl-phase1-final`):

| Section | DPR 1.5 Canvas | DPR 1.5 WebGL layers | Frame CPU p50, Canvas / WebGL |
| --- | ---: | ---: | ---: |
| 120 (opening hills) | 54.6 fps, 12 missed | 56.9 fps, 0 missed | 4.5 / 4.1 ms |
| 1325 (pit, first rope) | 53.5 fps, 18 missed | 56.7 fps, 0 missed | 4.6 / 5.1 ms |
| 3100 (hilltop, pool) | 52.8 fps, 21 missed | 56.9 fps, 0 missed | 5.5 / 7.2 ms |
| 3875 (pool platform) | 48.0 fps, 48 missed | 57.0 fps, 0 missed | 4.6 / 7.1 ms |
| 5450 (steel, force fields) | 40.8 fps, 87 missed | 56.9 fps, 0 missed | 5.3 / 6.4 ms |

At DPR 1 both renderers hold the display's rate everywhere, with the same frame
CPU (3.8 to 4.9 ms). The GPU process's main thread, busy 93% to 99% of every
Canvas frame, is busy 56% to 78% with the WebGL layers, so the layers leave
headroom where Canvas had none. At DPR 1.5 the first key press stalls for 19 ms instead
of 36.

Main-thread time rises by up to 1.7 ms at DPR 1.5. Drawing the layers costs
0.2 ms a frame, less than the 0.6 to 0.7 ms Canvas spent on their vectors; the
rest is Chrome's charge for a picture from another GPU context (see the risks),
measured on its own at about 1 ms a frame, the same for one picture or two and
however it is handed over. It goes when one context draws the frame.

**Go or no-go: go.** The layers that Canvas took longest over now cost the GPU
little, the frame rate holds at DPR 1.5 where Canvas fell to 41 fps, and the
artwork is drawn by its own code, unchanged, at the same quality. Phase 2 is the
next step: every layer `drawPuzzleWorld` draws, the daylight shadow field moved
into this context, one canvas, and the `WorldRenderer` interface.

**Not yet.** Night and regional lighting, environments (landscape, interior,
cave), the studio and thumbnails, wall text, glows and gradients; a zoom still
animating uses Canvas until it settles.

**Memory.** The layers hold a 4× multisampled colour target and stencil (20
bytes a pixel), a coverage target (1), and the canvas with the two pictures it
hands out each frame (12): about 75 MB at 1920×1200, outside the 64 MiB lighting
allowance for now.

### Phase 2: daylight frames

**What is built.** WebGL draws the whole daylight frame on its own canvas, in
one context, and the game shows that canvas over the Canvas one while it draws
(`WorldRenderer`, `worldRenderer.ts`). Each frame goes to whichever renderer
covers it: the lighting state advances once, then WebGL draws daylight play
without lamps or an environment (`WebGLWorldFrame.covers`), and Canvas draws
everything else exactly as before. A frame WebGL cannot reproduce is never
drawn wrongly: it is left to Canvas, and the reason is counted.

- **Retained scenes.** The backdrop and the terrain are recorded once per level
  and per resting zoom, as in phase 1. The game passes the zoom the camera
  settles at, so the charging bay's waking zoom draws the same meshes, scaled.
- **Everything else, every frame.** The ordinary artwork (`drawPuzzleWorld`,
  wall wiring, wall text, water) runs against the recorder, which now knows the
  camera: it reports the true device transform, accepts device-space
  `setTransform`, and leaves out anything wholly off screen. The builder turns
  the operations into triangles through a cache of shapes it has already
  tessellated, keyed by shape relative to its first point, so a coin or a
  robot's panel that only moves costs a copy. Curves are flattened at a zoom
  step an eighth of an octave wide, so the cache survives a zoom animation.
- **Exposure.** Daylight's composite reduces to one exposure per draw: the
  light field where artwork receives light, the ambient level (0.95) where it
  does not, and at least its readability floor. Canvas reaches it by
  multiplying the frame by the field and correcting readable and structural
  artwork in later passes; blending is linear, so multiplying each draw first
  is the same. The recorder takes each draw's class from the `WorldPaint` call
  around it, and the shader applies it, reading the field at its pixel.
- **The field.** Daylight's parallel shadows are cast once for the whole level
  from the fixed structures and every frame from moving ones, drawn 4×
  multisampled into a texture with the same formula as the GPU field
  (`1 − (1 − a) × coverage`).
- **Text and glows.** Canvas draws them into small sprites (`sprites.ts`),
  cached. Text is drawn at its position's fraction of a pixel as Canvas places
  glyphs (a quarter pixel across, the baseline on a whole pixel, measured in
  Chromium and Edge) and placed on whole pixels, so it lands as crisply as
  Canvas draws it. A glow (`shadowBlur`) is drawn once and placed between
  pixels, as Canvas places its cached glows; WebGL draws the shape over it.
- **Paths.** The robots, pickups, gravity water and the L.A.B. stamp build
  `ArtPath`s, which now also read SVG path data and draw `roundRect`; the
  recorder adds dashes and images.
- **Phase 1's layers** draw through the same renderer (`GlFrame`), and still
  serve daylight levels with lamps (Drain, Tower), which phase 3 takes on.

**Where it applies.** By default since November 12, wherever the GPU runs
WebGL 2. 32 built-in levels are daylight without lamps or an environment: the
26 courses and the six daylight facility areas (Concourse, Assessment,
Construction, Security, Gravity, Puzzles). Night, lamps, the interior and
landscape environments, the bus ending and the studio stay on Canvas, and
phase 1's layers serve the daylight levels with lamps.

- **The setting.** `?renderer=canvas`, or localStorage `jumping:renderer` =
  `canvas`, keeps every frame on Canvas. A software WebGL driver (SwiftShader,
  llvmpipe, Microsoft's Basic Render Driver) is refused, as the GPU lighting
  field refuses it, because Canvas is faster there; `webgl-software` accepts
  one, for headless browser tests (`worldRendererSetting`).
- **One canvas until WebGL starts.** The renderer adds WebGL's canvas after the
  game's only once WebGL 2 starts, so a browser without it, or with a software
  driver, has exactly the page it had before. Headless Chromium's WebGL is
  SwiftShader, so the browser suite still exercises Canvas; WebKit's reports a
  GPU, so its two specs draw with WebGL. Tests find the game's canvas as
  `.jumping-game > canvas[role="img"]`, and the frame reports (`jumping-wall`,
  `jumping-head`) come from whichever canvas drew.

**Speed work along the way.** The first build doubled the main thread's frame
time, and a CPU profile showed where: every coin's arcs became curves before
culling, limbs that change shape every frame were ear-clipped by an algorithm
that restarted after each ear, convexity used `atan2` at every corner, and every
cached shape was compared value by value. Arcs are now recorded whole, with
their matrix, and become curves only when drawn; ear clipping walks a linked
ring and tests only reflex corners; convexity counts turns; shapes are found by
a 64-bit digest; path transforms no longer allocate. Together these took about
3 ms off each Full Tilt frame. Last, a shape is kept only once it has been
seen in two frames running: a limb or a spinning coin, which changes every
frame, is drawn without being stored. Arcs are flattened straight off the
ellipse, as Canvas draws them exactly.

**Played.** In hardware Edge, all 26 daylight courses were played for 20 s each
(running, jumping, ropes, swimming, bracing, floating) and the six daylight
facility areas watched for 10 s each: every frame, about 1,240 per course, was
drawn by WebGL, none was left to Canvas, and no page errors occurred. In play,
a Full Tilt frame records in about 1.75 ms, builds in 0.8 and is handed to the
GPU in 0.3; most of the recording is the artwork's own work, poses included,
which Canvas pays too.

**The look.** In deterministic play in hardware Edge (`compare-jumping-frames.mjs`,
one build on both renderers, ten courses at DPR 1 and 1.5, at the opening and
1.8 s in), WebGL frames differ from Canvas's by a mean of 0.08 to 0.53 of 255,
on edges. One view of each of the 32 levels on a software GPU differs by 0.4 to
1.1, the largest 20-pixel block usually by 2 to 2.6 at the robot's edges; at
four times magnified the robot is the same on both. Contact sheets of each
course's three most different regions, magnified three times, are in
`.local/perf/webgl-phase2-sheets/`. A browser test (`jumpingWebglLayers.dev.spec.mjs`)
holds four levels to Canvas on a software GPU and checks the per-frame choice.
The largest blocks have two causes, both small:

- **Wall artwork in simple daylight levels.** Doors and other artwork painted
  through `ambientPaint` receive daylight's ambient exposure, 0.95. Canvas gives
  them that once the camera rests (its cached background), but while the
  camera moves its cached ambient pass corrects only 128-pixel tiles over
  terrain and the robot's surroundings, so elsewhere such artwork is 5% brighter
  until the camera stops. WebGL always draws Canvas's resting value, so a door
  no longer brightens and dims as the camera starts and stops.
- **Glyphs on a quarter-pixel boundary.** Canvas places each glyph at its own
  quarter pixel; a sprite starts from the string's, so the odd glyph lands a
  quarter pixel over.

**Measured.** Full Tilt, one build on both renderers, interleaved, at DPR 1.5:
WebGL holds 56.5 to 56.7 fps (the display's 57 Hz) with 0 or 1 missed frames in
every section, where Canvas falls to 40.6 to 54.1 fps with 19 to 116 missed;
the GPU process is busy 20% to 41% instead of 96% to 100%; the first key press
stalls 19 ms instead of 36 to 53. Ascent, the heaviest level for physics, at DPR
1.5: 56.0 to 56.7 fps with 0 to 2 missed against Canvas's 48.3 to 51 with 42 to
60. At DPR 1 Canvas already holds the rate on both levels, and WebGL does too,
but on Ascent's two busiest sections it missed 2 and 5 frames in 18 s where
Canvas missed 0 and 1 ([performance notes](jumping-performance.md)).

The main thread is the cost: a WebGL frame takes up to about 1.7 ms more of it
than a Canvas frame (traces' totals), against the plan's target of no more.
Recording the world costs less than Canvas's drawing it; the extra is
tessellating shapes that change every frame and the GL calls.

**Go or no-go: go,** with the main thread as the work that remains. The frame
rate holds where Canvas could not, the GPU has headroom for phase 3's lighting,
every frame of play on every covered level was WebGL's, and the look is Canvas's
by eye.

**Next.** Phase 3, the lighting composite (night, lamps, environments), and
before it, the main thread: retained meshes for artwork that only moves (props,
mechanisms, robots' rigid parts) instead of recording it every frame, and the
robot's limbs as fixed meshes posed by transform. Both are taken up in
[After phase 2](#after-phase-2-the-default-and-the-main-thread).

**Memory.** The frame holds 26 bytes a pixel of targets (multisampled colour and
stencil, the multisampled field and its texture, the coverage target), about
52 MB at 2 megapixels, plus at most 4 MB of cached shapes and 8 MB of sprites:
within the 64 MiB lighting allowance, which Canvas's lighting buffers no longer
use while WebGL draws (they are released).

### After phase 2: the default, and the main thread

**The default.** Since November 12 WebGL draws the frames it covers wherever
the GPU runs WebGL 2 (see phase 2's *Where it applies*); `?renderer=canvas`
keeps Canvas alone.

**What the extra main-thread time was.** Phase 2 measured a WebGL frame at up
to 1.7 ms more main-thread time than a Canvas frame. Timed inside the game (the
development server in hardware Edge, DPR 1.5, two runs each), WebGL's drawing
takes less than Canvas's: 1.4 to 3.0 ms a frame on Full Tilt against 1.8 to 3.3,
and 2.3 to 3.2 on Ascent against 4.6 to 5.0. The rest of the frame, mostly
physics, takes longer under WebGL, although physics does the same work under
either renderer. A fixed piece of arithmetic timed every frame suggests why: in
three of four runs it took about 1.5 times as long while WebGL drew (a mean of
0.47 to 0.53 ms against 0.33 to 0.40). With the GPU process no longer busy, the
processor appears to run at a lower clock, so main-thread times on two
renderers are not comparable on this laptop, and the plan's target of no more
main-thread time than Canvas cannot be judged from them. One renderer before and
after a change, interleaved, can be compared, and that is how the work below
was measured.

**Shapes in their own frame.** The shape cache keyed a shape relative to its
first point, so a shape that turned (a robot's head and palm plates as it
leans, a spinning coin) missed every frame and was tessellated again. It now
keys each shape in its own frame, turned to the direction of its first point at
least half a unit away (or an arc's first axis), and turns the cached triangles
back into place; the key keeps the same 1/256-unit precision. Two kinds of fill
skip the cache entirely: a whole ellipse is a unit circle through its matrix,
so its fan comes from a unit circle cut into as many pieces as flattening would
cut it (coin faces, joints), and a coin's edge, an ellipse and a convex rim
winding the same way, is drawn as the two fans. A fill of several outlines now
fans each convex one and ear-clips the rest straight into the frame's vertices.

| Per frame | Full Tilt before | after | Ascent before | after |
| --- | ---: | ---: | ---: | ---: |
| Build, Node benchmark (400 frames, median of 7) | 0.312 ms | 0.119 ms | 0.333 ms | 0.252 ms |
| Shapes tessellated, Node benchmark | 31.6 | 12.6 | 25.0 | 16.4 |
| Build, in play in Edge (development server) | 0.83 ms | 0.44 to 0.47 ms | 0.90 ms | 0.59 to 0.80 ms |
| Shapes tessellated, in play in Edge | 35 | 11 | 37 | 16 |

In production bundles in hardware Edge, interleaved, three sections at DPR 1
and 1.5, three 8 s episodes each, both on WebGL (`.local/perf/next-1-fulltilt`
and `next-1-ascent`; the display ran at 60 Hz): the main thread's frame time
(p50) fell in 5 of 6 sections on each level, from a mean of 5.95 to 5.6 ms on
Full Tilt and from 7.9 to 6.5 ms on Ascent. Missed frames did not change beyond
the noise of real-time play (13 and 12 on Full Tilt, 37 and 41 on Ascent, over
18 episodes each). Ascent's p99 frame time is 10 to 27 ms on either build; it is
the heaviest level for physics, which phase 2's CPU profiles put at 37% to 58%
of its tick.

**What is still tessellated every frame.** The robots' arm and leg shells and
torsos, which bend with the pose, the water's waves and the boosters' plumes:
about 11 shapes a frame on Full Tilt and 16 on Ascent. Making the limbs fixed
meshes posed by transform would mean drawing the robot differently, so they are
drawn as before.

**Found along the way.** An opaque nonzero fill of several outlines was
triangulated outline by outline, which would fill a hole cut by an outline
winding the other way. No artwork draws one today (the stopwatch's ring is
filled even-odd), and such fills now go to the stencil.
