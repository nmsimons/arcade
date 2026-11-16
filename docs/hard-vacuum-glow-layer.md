# Hard Vacuum glow layer

Status: proposed November 16, 2026. Not started.

Hard Vacuum draws its glows with Canvas `shadowBlur`, one blur pass on the GPU
for every glowing shape, every frame. This spec replaces those per-shape passes
with a few shared ones per frame: glowing shapes also draw into offscreen glow
layers, and each layer is blurred once and composited into the frame. The goal
is the same look for about a quarter of today's GPU work. Simulation, saves,
controls, audio and the React HUD do not change.

## Why

### What was measured

Measured November 15, 2026 on an Apple M5 Pro, hardware Chrome 157 (ANGLE on
Metal), the benchmark's six seeded scenes at authored density
(`benchmarks/scenes.mjs`), one 240-frame episode each, with a browser trace of
each thread's busy share (the method LAB's `profile-jumping-level.mjs --trace`
uses):

| Canvas size | Frame rate | Game work p95 | Page main thread | GPU process |
|---|---|---|---|---|
| 1280×800 | 60 fps in every scene | 2.1 to 3.4 ms | 12 to 15% busy | 11 to 18% busy |
| 2560×1600 | 60 fps | 2.5 to 3.6 ms | 14 to 17% | 14 to 16% |
| 3840×2160 | 60 fps | 2.9 to 5.1 ms | 16 to 21% | 16 to 22% |

The same scenes with every `shadowBlur` ignored (a measurement-only page
patch):

| Canvas size | GPU process with glows | GPU process without glows |
|---|---|---|
| 1280×800 | 11.6 to 17.6% | 3.3 to 3.7% |
| 3840×2160 | 18.0 to 22.0% | 4.0 to 4.7% |

About three quarters of Hard Vacuum's GPU work is glows. Without them it costs
the GPU about what LAB's WebGL renderer does on the same Mac (2.8% on Full Tilt
at DPR 1.5). Removing only the terrain wall's glow, the largest single shape,
changed nothing, so the cost is the number of blurred shapes, not their size.

### Not a WebGL port

LAB moved to WebGL ([jumping-webgl-renderer.md](jumping-webgl-renderer.md))
because its GPU process was busy 99% of every frame on the reference laptop.
Hard Vacuum holds 60 fps at 4K here with both the main thread and the GPU
process under a quarter busy. Its frame is light: a dark background, mostly
thin strokes, bodies outside the camera skipped, and a canvas sized in CSS
pixels, so a Retina display does not multiply its pixels. A WebGL port of its
roughly 2,500 lines of drawing would buy nothing measurable. The glows are the
one part of the frame that costs the GPU out of proportion, and they can be
fixed inside Canvas.

The reference laptop (Snapdragon X Elite, Adreno X1-85) has not been measured
for Hard Vacuum. Phase 0 makes that a one-command run, and its result decides
how much this work matters in practice.

### Where the blurred draws come from

Blurred draw calls per frame at 1280×800, counted by patching Canvas calls in
an unminified benchmark build, 120 frames per scene:

| Scene | Blurred draws per frame | `drawModel` faces and markings | `drawModel` edges | Rocks | Other |
|---|---:|---:|---:|---:|---|
| Late field | 42.0 | 23.0 | 10.0 | 6.0 | bots 2, terrain 1 |
| Red chain | 52.0 | 23.0 | 10.0 | 16.0 | bots 2, terrain 1 |
| Bot towing | 55.3 | 31.0 | 12.0 | 5.9 | radiation 4, bots 1.4, terrain 1 |
| Moving Haven | 28.9 | 17.9 | 4.0 | 6.0 | terrain 1 |
| Opening doors | 55.0 | 32.0 | 10.0 | 6.0 | radiation 4, bots 2, terrain 1 |
| Radiation flight | 35.7 | 21.7 | 6.0 | 0 | radiation 4, jets 3, terrain 1 |

The shared model renderer (`src/games/model3d.ts`) casts 60 to 80% of them:
every glowing face's outline, each of its edges stroked separately, and each
glowing marking. Its users are the ship, power cells, station objects (cores,
emitters, caches, pods), station bots and the ignition cradle. Every one of
them bobs, tumbles or banks with time, so their outlines change every frame.
That rules out LAB's approach (`src/games/jumping/glowCache.ts`), which draws a
glow once into a sprite and reuses it while the shape is unchanged.

Every glow site, with its blur in device pixels:

| Site | What glows | Blur |
|---|---|---|
| `model3d.ts` `drawModel` | Glowing faces (vector material); laser or flash illumination on any face | 4, plus illumination × 16 (× 8 for solid) |
| `model3d.ts` `drawModel` | Glowing markings | 2 |
| `render.ts` rocks | Blue rock and red rock edges; armed red pulse; laser glow | 10; 10 to 28 pulsing; up to 20 |
| `render.ts` rocks | Idle red fissures | 3 |
| `render.ts` blaster | Red bolts | 6 |
| `render.ts` phaser | Beam glow and core (two wavy gradient strokes) | 18, 22 |
| `render.ts` phaser | Particles | 10 |
| `shipRender.ts` | Shield rings, shield flash, recharge cradle | 6 to 18, 6 to 16, 4 |
| `stationBotModels.ts` | Bot thrusters | 4 |
| `havenRender.ts`, `havenLinkRender.ts` | Haven markers, link | 7; 2 to 7 |
| `teleportRender.ts` | Teleporter rings and core | 3 to 6, 5 |
| `radiationRender.ts` | Radiation shield | 5 |
| `debrisRender.ts` | Sparks | 4 |
| `terrainRender.ts` | Rock walls (once per frame) | 7 |

## Design

### Glow layers

A `GlowLayers` object belongs to one on-screen canvas (a `WeakMap` keyed by its
context, so the game, the benchmark page and any preview each get their own).
It owns three offscreen canvases, one per blur band:

| Band | Today's blurs | Blur applied | Resolution |
|---|---|---|---|
| Fine | 2 to 5 | σ = 1.5 device px | Full |
| Soft | 6 to 12 | σ = 4 device px | Half |
| Wide | above 12 | σ = 9 device px | Half |

Canvas draws a `shadowBlur` of B as a Gaussian with σ = B/2. The bands keep the
glows' sizes within about a third of today's. The soft and wide bands render at
half resolution because their blur removes the detail anyway, which quarters
their fill and blur cost; the fine band stays at full resolution so thin
outlines keep a tight halo.

A glow whose blur animates (the armed red rock pulse, shield rings, laser and
flash illumination) must not jump between bands. Its glow is split between the
two bands either side of its blur, weighted by where the blur falls between
their centres, so its size changes smoothly.

### Drawing into a layer

Each glow site keeps drawing its crisp shape on the main canvas with no shadow,
and also hands the glow to the layers through one call, shaped like LAB's
`drawCachedGlow`:

```ts
glowLayers(ctx).add(blur, color, mode, draw)
```

`draw` builds the same path on the layer's context, which arrives with the main
canvas's current transform (scaled for half-resolution bands), line width,
caps and joins, and `color` as both fill and stroke. `mode` says whether the
shape is filled, stroked or both. Canvas shadows take their alpha from the
shape as drawn, so `color`'s alpha is the shadow colour's alpha multiplied by
the shape's own alpha and `globalAlpha`; the call computes this, not each site.
The call allocates nothing per shape beyond what the path itself needs, in
keeping with the allocation work in [performance-pass.md](performance-pass.md).

Each band tracks the union of its shapes' bounds in device pixels, padded by 3σ.
Only that rectangle is cleared, blurred and composited.

### Compositing

Before the cavern clip is restored (the `ctx.restore() // cavern clip` line in
`render.ts`, after the ship and radiation shield), each band with any content is
drawn onto the main canvas at the identity transform under the same clip, with
`ctx.filter = 'blur(σpx)'` (σ halved for half-resolution bands). That is one
blur per band, at most three per frame, in place of 29 to 55.

The blur must keep each glow's colour, so it uses `filter`, not a shadow on
`drawImage`: a shadow takes only the image's alpha and paints it in one colour.
`filter` is feature-detected once per context (set it, read it back, and draw a
test pixel); where it is missing, every site falls back to today's
`shadowBlur`.

Today each glow lies beneath its own shape and beneath anything drawn after it.
In the layer it is composited after all the clipped world artwork, so a halo
lies over its own crisp outline and over objects drawn later, such as the ship
passing a blue rock. The halos are faint (shadow alphas of 0.12 to 0.5) and
share their shape's colour, so this should read the same by eye. The visual
review below decides it; a site whose look suffers can stay on `shadowBlur`.

Glows outside the cavern clip stay on `shadowBlur`: the terrain walls (one
draw, measured as costing nothing) and anything else drawn after the clip,
such as the expedition map overlay.

### The shared model renderer

`drawModel` gains an optional glow sink parameter. Hard Vacuum passes its glow
layers; Urban Fire, which shares `model3d.ts` (`src/games/urbanFire/`), passes
nothing and keeps `shadowBlur` unchanged until it is measured on its own. A
glowing face's edges, stroked one by one today for their separate opacities,
go into the layer as one call per face.

### Settings and fallback

`?glow=shadow`, or localStorage `hard-vacuum:glow` = `shadow`, keeps today's
`shadowBlur` drawing, as LAB's `?renderer=canvas` keeps its old renderer. It
serves A/B measurement and the visual comparison, and stays for at least one
release after the layer becomes the default. Node tests and recording contexts
have no `document`, so the layers fall back to `shadowBlur` there and existing
render unit tests keep their meaning.

## Phases

| Phase | Work | Exit check |
|---|---|---|
| 0. Tools | `npm run benchmark` gains `BENCHMARK_WIDTH`/`BENCHMARK_HEIGHT` (the page currently draws at a fixed 1280×800), `BENCHMARK_GPU=1` (hardware browser, failing on a software renderer, as Urban Fire's runner does), `BENCHMARK_TRACE=1` (each thread's busy share, the GPU process's included) and `BENCHMARK_GLOW=shadow\|layer`. Record the baseline on the M5 Pro and the Snapdragon laptop | Baseline reports committed under `docs/performance/` |
| 1. Layer and models | `GlowLayers`, the `filter` check and fallback, the setting; `drawModel`'s glow sink; rock edges and fissures | GPU process busy at 1280×800 down at least 50% from the baseline on the M5 Pro. **Go or no-go:** if not, stop and record why |
| 2. Remaining sites | Ship shield and recharge, bots, Haven and its link, teleporter, radiation shield, debris sparks, blaster bolts, phaser beam and particles | Targets below met; visual review passed |
| 3. Default | Layer on by default; `shadow` setting kept; results in [performance.md](performance.md); tests migrated | Full unit and browser suites green |

## Targets

On the M5 Pro, hardware Chrome, the six scenes at authored density, layer
against `shadow` interleaved in one run:

- GPU process busy at most 6% at 1280×800 (today 11 to 18%) and at most 8% at
  3840×2160 (today 16 to 22%).
- Drawing p95 on the main thread no more than 0.3 ms above `shadow`.
- 60 fps held in every scene at both sizes.

On the Snapdragon laptop, the same comparison recorded, with no target until
phase 0 has measured its baseline.

## Looking the same

The layers cannot match `shadowBlur` pixel for pixel: the bands round blur
sizes and the composite order changes. The bar is the same look by eye:

1. **Contact sheets.** The six benchmark scenes plus moments that exercise the
   animated glows: an armed red rock mid-pulse, the phaser firing into a rock,
   a laser-lit power cell, a station bot's flash, a shield hit and recharge,
   the teleporter, and Haven's lit markers. `shadow` and layer side by side at
   1280×800 and 2560×1600, reviewed by Nick before phase 3.
2. **A region check.** Screenshots compared in 32-pixel regions; any region
   whose mean difference exceeds 4/255 is listed for review, so a missing or
   misplaced glow cannot pass as a rounding difference.
3. **Gameplay unchanged.** The benchmark's outcome, peak and minimum records
   identical between `shadow` and layer, as in earlier passes.

## Tests

- New unit tests for `GlowLayers`: band choice and the split between bands,
  alpha multiplication, bounds and padding, the `filter` fallback, and that a
  context without `document` uses `shadowBlur`.
- `tests/browser/equipment.spec.mjs` counts shield draws by their
  `shadowColor`. Under the layer it counts what the shield adds to the glow
  layers instead, through a debug report that is off unless a test turns it on,
  as LAB's `debugFrames.ts` does.
- `tests/terrainRendering.test.mjs` and `tests/stationBotRendering.test.mjs`
  run without `document` and keep their current expectations.

## Out of scope

- A WebGL renderer for Hard Vacuum (see [Not a WebGL port](#not-a-webgl-port)).
- Urban Fire's glows, until measured.
- Drawing at the device pixel ratio. Hard Vacuum's canvas is sized in CSS
  pixels, so it is upscaled on Retina displays. Sharper output is a separate
  visual decision; at 2560×1600 the measurements above show it would fit the
  GPU budget.
