# Lighting feasibility lab

The `codex/lighting` branch now integrates the reviewed renderer into gameplay,
the studio and thumbnails. Version-2 files carry ambient and spotlights. The lab
and its fixture remain development-only; the shared compositor ships in the app.
See [the specification](jumping-lighting.md) and [authoring guide](jumping-levels.md#lighting-version-2).

Run `npm run dev`, then open `/untitled-jumping-game/lighting-lab` on the URL Vite
prints. The initial preview for this branch uses port 5175. The controls provide
Night mode and ambient 0–100 (35–57% actual brightness), a sustained EMP blackout, a completed exit, identical overlapping
lamps, and a moving/rotating crate. Play room switches to the normal movement and
simulation; arrows/WASD move and Space charges/releases a jump. Inspect room
returns to the controlled scene. Nothing saves level files, scores or settings.

Source markers are visible by default. They number each spotlight and show its
direction/spread. The exit indicator is not a light source. **Show sources**
hides this diagnostic overlay; it is not proposed fixture artwork. **Light** can
isolate one source without changing its power state or the room. Excluded sources
remain marked as hidden so their positions stay easy to compare.

**View** switches between the full room, the player, the shovebot, and the box
and ball. Close-ups follow their subject, including the player during Play room.
These views keep the room's actual lighting and occluders, including
offscreen ones. Source markers outside the camera are hidden instead of moving
their labels onto the edge of the close-up.

In Inspect room, **Elevator** scrubs its height and **Cycle elevator** repeats its
travel. Moving the slider stops the cycle; EMP pauses it. These controls are
disabled during Play room, where normal simulation owns the elevator. The middle
spotlight is at y=490, inside the elevator's y=620–440 travel, so the shadow
changes direction as the platform passes the source's height.

The JSON room is `tests/fixtures/jumping/lighting-prototype.json`. Its `level`
member uses the existing version-1 schema, and the experimental `lighting`
sidecar is read only by the lab. Do not copy this wrapper into a level collection.
This is an object/geometry study, not a campaign level with established medal times.

## Implemented for evaluation

- Full-intensity spotlight fields with no distance attenuation, maximum blending,
  ambient control and a daytime bypass. Authored lights
  stop at the level rectangle. Only spotlight sides retain a narrow soft edge.
  Its width is capped at two world units, so distant objects do not acquire a
  broad shaded band when a spotlight edge crosses them.
- Actual polygon outlines, concave openings, rotated crates, round balls,
  mechanisms and bot hulls. Static terrain uses prepared exposed union edges:
  adjacent tiles share a lit face, while walls and concave terrain cast onto later
  surfaces across air gaps. Gates and platforms join that boundary where their
  actual shapes touch or overlap it. Only affected edge portions update; the
  unaffected terrain field stays cached. Contact corners become square in both
  artwork and shadows, closing cosmetic pinholes; free corners remain rounded.
  Dynamic shapes use their current positions. Rounded box,
  mechanism, and bot chassis corners follow the artwork rather than collision
  rectangles.
- Readable clocks and coin meters at minimum 65% exposure, full-color pickups
  and effects, powered bot eyes, and the activated goal lens. Shared paint passes
  preserve the original draw order and translucent effects, including foreground
  occlusion. These readable parts do not illuminate nearby surfaces.
- Player color depends only on Night mode: warm paper at night, dark ink
  in daytime. There are no intermediate shades or color fades. Night mode off
  bypasses environmental lighting.
  Walking into spotlights or shadows,
  including the overhead head-shadow case, and toggling EMP cannot change it.
  Pose-following player shadows use the same vector skin curves as the artwork,
  flattened to within 0.2 world units. Body parts form one caster group, preserving
  gaps between limbs. Exit shadows fade with the figure. This uses no collision
  changes, additional framebuffer, or pixel readback.
- EMP-aware source fades and a green exit indicator that remains readable but
  emits no environmental light. Model tests also cover
  switch activation and mounted positions; the studio now authors both.
- The back wall, grid and wall text receive ambient only. Physical objects and
  terrain receive and block spotlights. Each lamp retains its short source glow;
  a much fainter full beam fades across the dark-room range; both disappear with Night mode off.
  Both respect occlusion, power, foreground artwork and level boundaries. The
  full beam reuses the resolved light field and existing scratch surfaces.
- Six reusable viewport surfaces, up to two cached stationary light fields, and a bounded gradient cache. Gameplay and studio backing pixels cap at two million (about 61 MiB for lighting surfaces).
  No renderer pixel readbacks. Test pixel reads are outside the rendering path.

## Verification and performance gate

Historical performance measurements below predate the ambient remapping. Their
nonzero ambient values refer to the former linear scale. Historical 100 means
fully lit daytime, now controlled by the Night mode toggle. Night zero is unchanged.

`tests/jumping-lighting.test.mjs` covers the field math, shadow geometry, power
transitions, mount displacement, fixture validity and player inks.
`tests/browser/jumpingLighting.dev.spec.mjs` checks actual Canvas pixels for
normal environmental rendering at 100 (with the chosen player ink), overlap,
source coverage, readable displays, foreground occlusion
and the EMP/exit relationship, unlimited reach and clipping at the level edges.
It also checks resolved source markers, isolation without scene mutations, and
inspection controls. Elevator shadows are compared with independent visibility
rays throughout travel, including crossing a lamp's height and returning to an
earlier position. Bot pixel tests cover chassis and wheels under narrow and wide
lights, external shadows, powered eyes and EMP, both facings, tilted poses and
windup. Distant cone-edge pixels are checked against exposure sampling. Player
tests compare shadow geometry with the actual artwork across running, crouching
and airborne poses in both facings, plus shadow movement, exit fades and readable
ink. Day/night color is checked at eight ambient settings under spotlights,
self-shadows, obstructions and EMP, including the Night mode transition and readable contrast throughout the remapped
dark-room range. The integration suite adds editor save/reopen/playtest, nonpersistent preview,
undo, mounts, file validation, template references, unchanged physics and coin
latching through EMP. Cache invalidation and high-DPI buffer limits have pixel
regressions too. The gate suite checks both orientations open/closed, ambient-only
wall art, the photographed layout with connected boundary terrain, and source
haze during obstruction and EMP. It also covers gate/platform seams in both
orientations and lighting directions, opening/reclosing small gaps, partial and
concave contacts, cache reuse/invalidation, offscreen joins, and the photographed
corner pinhole. Full-beam tests check faintness, ambient fading, constant distant
reach, EMP, and unchanged readable artwork. Terrain raster tests cover shared level boundaries at fractional zoom in day/night
views, texture alignment, real gaps and material paint order. Resting-shadow tests compare warm caches with fresh renders across movement,
rotation, gate travel, deletion, light edits, EMP and release. There are 41 lighting
browser cases and 42 lighting model/editor/cache cases.

The study and implemented authoring model use spotlights with adjustable aim/spread
and ambient for general fill. Round sources have been removed. Ambient zero maps
to the previously reviewed 35% brightness. Night ambient 0–100 spans 35–57% brightness. Disabling Night mode restores
full brightness without forgetting the ambient value or lamps. The study starts at zero. EMP preserves that baseline. The activated exit
retains its green lens during an outage without illuminating any nearby surfaces.
The current three-source arrangement remains a stress study. Authored rooms
should use architectural fixture placement and generally one or two spotlights
influencing the active area, as described in the lighting specification.

To reproduce the small-room benchmark with a running dev server:

```sh
LIGHTING_URL=http://127.0.0.1:5175 node scripts/benchmark-jumping-lighting.mjs
```

It warms each case for 20 frames and samples 80 more, with a moving box. It
reports CPU submission time and requestAnimationFrame intervals, not GPU timing.
September 27, 2026 measurements: Apple M5 Pro / macOS Darwin 25.5.0 /
headless Chromium 153.0.8010.12. CDP reports **SwiftShader, software Canvas and
disabled GPU compositing**. These numbers expose software-rendering cost; they
are not accelerated browser frame rates or representative-device certification.

Before adding player shadows, with the current unlimited spotlight model:

| Viewport | Ambient | 1 spotlight CPU p95 | 2 spotlights CPU p95 | 3 spotlights CPU p95 |
| --- | ---: | ---: | ---: | ---: |
| 1280 × 800 | 85 | 38.9 ms | 64.5 ms | 88.6 ms |
| 1280 × 800 | 0 | 40.0 ms | 64.9 ms | 91.7 ms |
| 1920 × 1080 | 85 | 77.2 ms | 126.4 ms | 179.0 ms |
| 1920 × 1080 | 0 | 75.8 ms | 126.6 ms | 174.1 ms |

Ambient 100 bypassed lighting at 0.4 ms / 0.2 ms respectively. Ambient 85 does
essentially the same work as zero; it is not a cheaper lighting mode. The five
buffers occupy 19.5 MiB at 1280 × 800 and 39.6 MiB at 1920 × 1080.

A follow-up at 1280 × 800, ambient 85, with the standing player's shadow added:

| Spotlights | Candidate edges | CPU p95 | Frame interval p95 |
| --- | ---: | ---: | ---: |
| 1 | 522 | 40.4 ms | 50.1 ms |
| 2 | 1044 | 68.6 ms | 83.3 ms |

This adds 246 player contour edges per light and no framebuffer memory. The
observed CPU p95 increase was 1.5 / 4.1 ms in successive runs, not a controlled
GPU measurement. Reproduce the short case with `LIGHTING_QUICK=1` alongside
`LIGHTING_URL`. The player stands still; a moving-pose stress case remains to be
measured. The in-app study's small 531-pixel-wide view showed about 1.2 ms render
submission p95 with all three lights, but that is a different viewport/backend
and does not establish full-resolution performance.

## Integration measurements

The earlier software-only results above describe the initial prototype. The
integrated renderer batches shadow wedges, culls cones facing away from the
viewport, prepares terrain groups off-thread, and caches at most two stationary
light fields. The current renderer has six reusable surfaces plus at most two
cached fields, together below 64 MiB. Hidden gameplay and
studio views release their surfaces; thumbnail surfaces are released after paint.

Full Chromium uses this Mac's Apple M5 Pro via ANGLE Metal, with accelerated
Canvas and GPU composition enabled. Before stationary caching, the integrated
1280×800 scene measured 1.0/1.5 ms CPU p95 for one/two lights, with 16.7 ms p95
frame intervals. The software headless shell measured 31.3/53.6 ms. This is a
backend difference, not evidence that dimmer ambient makes lighting cheaper.
These are CPU submission and rAF measurements, not direct GPU timestamps or
certification of lower-end devices.

Integration measurements before the ambient-only back wall and local source
haze, on the same machine/browser with stationary terrain caching (ambient 85):

| Case | One light CPU p95 | Two lights CPU p95 | Frame interval p95 |
| --- | ---: | ---: | ---: |
| 1280 × 800, DPR 1 | 1.0 ms | 1.5 ms | 16.8 / 16.7 ms |
| 1920 × 1080, DPR 1 | 0.8 ms | 1.1 ms | 16.7 / 16.8 ms |
| 1280 × 800, requested DPR 2 | 1.1 ms | 1.6 ms | 16.8 / 16.7 ms |
| 1280 × 800, DPR 2, scrolling, 4× CPU throttle | 4.7 ms | 6.4 ms | 16.7 / 16.7 ms |
| Maximum object counts, 1280 × 800 | 5.6 ms | 8.8 ms | 16.8 / 16.8 ms |

Ambient zero was comparable or slightly cheaper in this earlier run. Lighting
buffers then peaked at 53.4 MiB with the two-million-pixel backing-store cap; requested DPR 2
is reduced to stay within that cap. Full brightness used no lighting buffers.
The deliberately crowded stress case with **16 overlapping lamps** took
**196.2 ms CPU p95 / 200 ms frame p95**, so maximum file counts are safety limits,
not a performance guarantee. Author one or two beams affecting the active area;
16 simultaneously overlapping beams in a room full of moving objects is not a
viable target for this compositor. CPU throttling does not simulate a slower GPU.

Reproduce accelerated measurements with `LIGHTING_CHANNEL=chromium`. Add
`LIGHTING_DPR=2`, `LIGHTING_CPU_RATE=4`, or `LIGHTING_SCROLL=1` for the corresponding
cases; `LIGHTING_QUICK=1` selects the one/two-light 1280×800 cases.
`LIGHTING_STRESS=1` draws the maximum 160 terrain shapes, 80 props, 40 mechanisms,
30 bots and up to 16 overlapping lights. This deliberately crowded rendering
fixture is not a playable layout or a promised 60-fps authoring target.

Existing version 1 levels retain their daytime rendering. The saved built-in
Lights out and Tower I revisions demonstrate authored night lighting. Broader
mobile/low-end device review remains a separate hardware evaluation.

### Ambient-only wall and occlusion revision — 2026-09-27

At this revision the wall stayed at ambient, with only a short source haze at
each fixture. A later revision adds the faint full beam described above.
Static shadows use exposed terrain edges, so connected walls can shadow the
floor and concave terrain can shadow itself across an air gap. One foreground
coverage mask is shared by the wall corrections and haze each frame. This avoids
redrawing every physical object for each correction and adds no extra buffer.

Follow-up accelerated Chromium measurements on the same machine, ambient 85:

| Case | One light CPU p95 | Two lights CPU p95 | Frame interval p95 |
| --- | ---: | ---: | ---: |
| 1280 × 800, DPR 1 | 1.2 ms | 2.2 ms | 16.8 / 16.8 ms |
| 1280 × 800, requested DPR 2, scrolling, 4× CPU throttle | 6.3 ms | 8.9 ms | 16.8 / 16.8 ms |

Lighting buffers use 27.3 / 31.3 MiB at DPR 1 and 53.4 / 61.0 MiB at the capped
high-DPI resolution. These remain submission/frame measurements for this scene,
not GPU timings or a guarantee for every device and level.

### Moving structural joins and contact corners

Mechanisms now share only their contacting boundary intervals with terrain and
other mechanisms. The static field retains all unaffected edges; sliding along a
contact reuses it. Geometry recomputes when poses or terrain change, not per light.
Only nearby solids enter exact boundary clipping. The same cached corner radii
control artwork and shadow geometry, so a flush join has no cosmetic pinhole and
a separated mechanism immediately regains its rounded exposed corners.

Follow-up measurements on the same accelerated Chromium backend, ambient 85:

| Case | One light CPU p95 | Two lights CPU p95 | Frame interval p95 |
| --- | ---: | ---: | ---: |
| 1280 × 800, DPR 1, moving crate | 2.5 ms | 2.9 ms | 16.8 / 16.8 ms |
| DPR 1, crate and mechanisms moving | 2.7 ms | 3.2 ms | 16.7 / 16.7 ms |
| Requested DPR 2, moving mechanisms, scrolling, 4× CPU throttle | 16.0 ms | 18.6 ms | 16.7 / 16.8 ms |

No additional framebuffers were introduced: the cap remains about 61 MiB. The
throttled CPU tail approaches/exceeds a 60 Hz frame budget even though observed
rAF p95 remained about 16.8 ms; slower-device/GPU profiling is still needed. These
separate runs are useful bounds, not a controlled attribution of each millisecond.
Set `LIGHTING_MECHANISMS=1` to reproduce movement through closed contacts, opening
gaps and returning to contact with the benchmark script.

### Faint full beams in dark rooms

The short source glow is preserved. The full beam contributes at most 2.5% at
night ambient 0 and fades to about 0.6% at 100, disappearing in daytime, with constant reach and the
existing narrow cone edges. It reuses the final max light field and scratch
buffer, so overlap, occlusion, EMP and room clipping require no additional light
geometry or framebuffer. Foreground and wall-art masks preserve readable colors.

With `LIGHTING_QUICK=1 LIGHTING_AMBIENT=0 LIGHTING_MECHANISMS=1` on the same
accelerated Chromium backend at 1280×800, one/two lights measured 1.8/2.5 ms CPU
p95 and 16.7/16.8 ms frame interval p95. Buffer sizes were unchanged. These remain
measurements of the representative scene on this machine, not lower-end GPU
certification.


### Resting object shadow reuse

Stationary props, bots and structural mechanism boundaries now join the two
existing cached terrain fields after two unchanged frames. Exact silhouette and
opacity comparisons remove a moving object from that layer immediately; even
subpixel motion updates in the same frame. Other resting casters remain cached.
The player and fading silhouettes always stay in the live layer. Camera changes,
light edits, terrain revisions and power transitions invalidate the appropriate
fields. Hidden views still release all raster buffers.

This adds no canvases: one/two lamps still use 27.3/31.3 MiB at 1280×800, with
the existing high-DPI cap below 64 MiB. This caches shadow projection and raster
work, not the whole game image: animated artwork and final composition still
render every frame. Scrolling requires new viewport raster fields, while prepared
terrain geometry remains reusable. A moving object's shadow can span the room,
so a small rectangle around the object is not a safe redraw boundary.

Paired measurements on the same Apple M5 Pro / accelerated Chromium backend,
1280×800, Night ambient 0, one moving crate, fixed camera, 20 warmup and 80 measured
frames per case:

| Lights | Projected edges/frame before → after | CPU p95 before → after | Frame p95 before → after |
| --- | ---: | ---: | ---: |
| 1 | 437 → 274 | 1.3 → 1.2 ms | 16.8 → 16.8 ms |
| 2 | 879 → 548 | 1.8 → 1.5 ms | 16.7 → 16.7 ms |

The two-light case reduces projected shadow edges by about 38% and measured CPU
submission p95 by about 17%. These are scene-specific CPU/rAF measurements, not
GPU timings or a general frame-rate guarantee; the unchanged frame interval is
already near the display's 60 Hz cadence. Reproduce with
`LIGHTING_CHANNEL=chromium LIGHTING_QUICK=1 LIGHTING_AMBIENT=0` using the benchmark
script. Moving cameras and large numbers of active mechanisms benefit less.

### Projected object shadow fade

Player, box, ball and bot shadows now keep their crisp contact silhouette for
20 world units beyond the caster, then fade smoothly over 160 more. Structural
shadows remain opaque. A radial alpha mask follows light rays using the farthest
point of the assembled caster, reusing the current scratch canvas and resting
cache without increasing the buffer count. Browser regressions cover contact,
midpoint and fully faded receivers at multiple zooms, distant structural blockers,
and cached/fresh equivalence (within one 8-bit channel step for regrouped
fractional alpha masks). Lamp intensity still has unlimited reach.
