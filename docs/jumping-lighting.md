# Flat lighting for Untitled Jumping Game

**Design draft — September 27, 2026. Not implemented.**

This specifies the intended first lighting release, including how every existing
object behaves. It is a design contract for implementation and evaluation, not a
description of features available in the current editor. Do not add the proposed
fields to playable levels until the loader and renderer support them.

Read alongside [Making a fun jumping level](jumping-level-design.md),
[level files and authoring](jumping-levels.md), and
[the movement and mechanism contract](jumping-physics.md). Lighting must preserve
the latter's physics, timing, input, and scoring rules.

## 1. Intent and boundaries

Lighting gives a level atmosphere, organizes its spaces, and lets discovery
change the player's understanding of a route. A room can have a clearly lit
maintenance path, a dimmer shortcut, and a switch that reveals the next section.
It should still look like this game's flat, muted world.

The first release includes:

- One constant ambient-light value per level.
- Positioned round lamps and directional spotlights, with neutral light.
- Shadows from terrain and substantial physical objects, including moving ones.
- Lamps powered continuously or by existing pressure plates and coin switches.
- EMP behavior, lamps mounted to mechanisms, and a protected exit light.
- Consistent treatment of clocks, collectibles, characters, and other objects.
- Editing, previewing, saving, thumbnails, accessibility, and performance limits.

This is visibility and presentation. Darkness does **not** change shovebot
detection, traction, collision, collectible contact, trigger sensing, or scoring.
There is no new stealth rule. Shovebots continue to use their existing geometric
line of sight, even in complete darkness.

Exclude colored illumination, reflections, surface highlights, material normals,
3D shading, light bouncing, volumetric fog, bloom, lens flares, automatic exposure,
flicker effects, programmable light sequences, and player-carried lights. Steel
does not become reflective. A spinning coin retains its existing face and edge
colors; lighting does not introduce a new metallic highlight.

Moving lamps are attached to existing mechanisms, not new physics bodies.
No lighting-specific collision exceptions are permitted.

## 2. Three different concepts

| Concept | Meaning | Examples |
| --- | --- | --- |
| Receives light | Its existing colors become darker with its surroundings. | Terrain, crates, ladders, wall writing. |
| Self-lit/readable | Its own artwork retains some or all brightness. It does not brighten adjacent pixels outside that artwork. | Clock face, collectible, powered bot eye. |
| Emits light | Adds a pool of illumination, subject to range and obstruction. | Authored lamp, activated goal lamp. |

A readable clock is **not** an invisible room lamp. A gold coin is **not** a light
source. A self-lit object can be seen in a cast shadow but cannot be seen through
a foreground object that covers it. There is no player-centered fog of war:
visibility in darkness and line of sight from the player are separate concepts.

These distinctions are fixed by object type, not dozens of per-object toggles.

## 3. Ambient and local illumination

### Ambient

**Ambient light** is an integer from 0 to 100, default **100**. It is the minimum
environmental illumination everywhere in the room, including cast shadows.
Ambient light is not blocked by geometry, consumed, switched, or affected by EMP.
It does not change while playing a level.

| Value | Suggested use, not a guarantee of readability |
| --- | --- |
| 100 | Current appearance; everything is fully lit. |
| 60–80 | Subdued rooms with a readable overall layout. |
| 25–50 | Lamps establish rooms, destinations, and routes. |
| 5–20 | Exploration through separated pools of light. |
| 0 | No environmental visibility without a lamp; reserved for deliberate designs. |

At ambient 0, an unlit ordinary surface is black. The defined readable elements
and player treatment below are explicit exceptions. Do not add an undocumented
global brightness floor that makes 0 mean something different.

### Light shape and falloff

Use one shared falloff profile. Authors do not edit gradients or softness curves.
A round lamp has a fully illuminated inner 75% of its radius and a smooth fade
over the outer 25%. A spotlight uses the same radial profile within a cone; the
outermost 10% of its half-angle softens to zero. The center of the cone is even,
not a narrow hot spot. The cone and radius end at zero contribution.

Start with this smooth boundary, not visible concentric bands. The broad interior
keeps the graphic flat, while a short fade avoids a cutout or chalk-circle look.
The exact falloff proportions are visual-tuning values, with one shared result
for the game, editor, and thumbnails. Shadows have crisp, antialiased boundaries;
the first release has no penumbra or blurred shadow that leaks through a wall.

### Combining lights

For a receiver point, let `A` be ambient divided by 100. Each unobstructed lamp
contributes `intensity × radialFalloff × angularFalloff × powerFade`, all in 0–1.
The angular term is 1 for a round lamp. A blocked lamp contributes zero.
At the emission center itself, angular falloff is 1; there is no undefined
direction or division by zero. Use one shared smoothstep curve for both fades:
`1 - (3t² - 2t³)`, with `t` clamped to 0–1 across the relevant fade interval.

The environmental brightness is:

```text
strongest = maximum contribution from any lamp, or 0
brightness = A + (1 - A) × strongest
```

Use the **strongest** contribution, not addition or repeated transparent erasure.
Two identical lamps in the same position must look exactly like one. Overlapping
dim edges cannot accumulate into an accidental bright patch. Array order cannot
change the image. Full illumination restores the original material colors;
lighting never overexposes them or changes their hue.

Initially, multiply the existing sRGB artwork channels by this brightness, with
the readable-element exceptions below. This is an artistic exposure control, not
a physical lighting measurement. Do not mix competing gamma/falloff conventions
between render paths. Pixels at brightness 1 are unchanged.

Ambient 100 bypasses the environmental-lighting work. All existing version-1
levels must preserve their current appearance and performance characteristics.
Authored lamp fixtures in new levels remain visible at 100, but their pools add
no brightness.

## 4. Object-by-object contract

"Ordinary" means the environmental brightness from section 3. "Full" means the
object's current colors, not white, bloom, or unlimited emission. Minimum display
exposure is an artistic multiplier, not an accessibility contrast certification.

| Object or part | Response to ambient and lamps | Casts shadows? | Emits into the world? | EMP response |
| --- | --- | --- | --- | --- |
| Back wall and grid | Ordinary; grid fades with its wall. | No. | No. | Unchanged. |
| Terrain, pillars, platforms, slopes, enclosing floor/walls/ceiling | Ordinary; retain material colors and texture relationships. | Yes, using actual outlines. | No. | Unchanged. |
| Box, including its seams | Ordinary; all parts share exposure. | Yes, using its rotated shape. | No. | Keeps its existing loose-body behavior. |
| Ball and its rolling marker | Ordinary; marker remains part of the same shaded artwork. | Yes, using its round silhouette. | No. | Keeps moving normally. |
| Elevator, moving platform, vertical/horizontal gate | Ordinary; markings dim with the structure. | Yes, at its actual current position. | No, unless a separate lamp is mounted to it. | Stops as currently specified; remains an occluder. |
| Elevator cable/guide or other thin mechanical decoration | Ordinary. | No. | No. | Follows its mechanism's existing appearance. |
| Ladder and rope, including anchors | Ordinary; authors must illuminate important exits and catches. | No. | No. | Existing movement remains unchanged. |
| Pressure plate and its active/inactive strip | Ordinary. Its active color is a state indicator, not a luminous surface. | No; too small to justify extra shadow noise. | No. | Existing load/activation behavior; no invented glow. |
| Coin switch: entire display | Minimum 65% exposure; preserve segments, empty track, progress, and active-state contrast together. | No. | No. | Readout remains visible and counts coins. Switching still obeys EMP and latching rules. |
| Wall clock: entire face | Minimum 65% exposure, as described below. | No. | No. | Keeps showing the real clock and existing clock-effect states. |
| Official wall text | Ordinary. | No. | No. | Unchanged. |
| Red graffiti | Ordinary, including its red strokes. | No. | No. | Unchanged. |
| Player | Dedicated flat-silhouette readability treatment below. | No. | No; no automatic halo or headlamp. | Existing movement and animation unchanged. |
| Shovebot chassis, wheels, and antenna | Ordinary. | Yes, using chassis and wheels, not the antenna. | No. | Stops; silhouette remains solid and casts shadows. |
| Shovebot eye | Full existing calm/angry color while powered. | No additional shadow. | No headlight or beam. | Eye goes dark, matching existing behavior. |
| Coin | Full face and edge colors; retains its spin and thickness. | No. | No. | Remains collectible and animated. |
| Good stopwatch | Full existing amber artwork and backwards-moving hand. | No. | No. | Remains collectible and animated. |
| Time bonus | Full amber arrow and number; retains counterclockwise rotation. | No. | No. | Remains collectible and animated. |
| Time penalty | Full dark-red arrow and number; retains clockwise rotation. | No. | No. | Remains collectible and animated. |
| Fast stopwatch | Full dark-red artwork and fast clockwise hand. | No. | No. | Remains collectible and animated. |
| EMP pickup | Full gold face/edge colors and bolt animation. | No. | No, including during collection. | Remains collectible; another pickup extends the existing outage. |
| Goal plate, pole, and closed-door surroundings | Ordinary. | No extra shadows from the small plate/pole. The back-wall door is not new solid geometry. | No. | Protected goal logic continues. |
| Goal lamp before activation | Ordinary inactive lens. It must not look switched on in darkness. | No. | No. | Unchanged. |
| Goal lamp after activation | Full existing green lens. | No. | Yes: protected neutral round light, radius 200, intensity 100. | Stays lit and continues illuminating. |
| Open exit doorway | Retains its black opening; wall around it receives light normally. | No. | No. | Opens and accepts the player as usual. |
| Authored lamp housing | Ordinary, with a small, flat fixture. | No. | No. | Housing remains in place. |
| Authored lamp lens | Full neutral lens at full power; follows its power fade when switching. | No. | Its defined round/cone light. | All authored lamps lose power. |
| Start/checkpoint floor markings in legacy playgrounds | Ordinary. | No. | No navigation beacon. | Unchanged. |
| Dust, foot/contact effects, and slide marks | Ordinary at their world position. | No. | No. | Existing effect behavior. |
| Pickup pulse/shrink, floating `−n`/`+n`, and EMP ring | Full source color, multiplied by the existing animation opacity. | No. | No flash of environmental light. | Animation continues unless the game is paused. |
| Menus, dialogs, HUD, focus indicators, editor handles/guides | Outside world lighting. | No. | No. | Unchanged. |

### Clocks and coin displays

Apply `max(environmentalBrightness, 0.65)` to the **whole display composition**.
Do not leave dark digits invisible on a dimmed panel or illuminate only the filled
coin segments while making the threshold unreadable. Preserve the clock's normal,
stopped, fast, and finished palettes and symbols. Preserve the coin meter's empty,
partially filled, reached-but-unpowered, and activated appearances.

The 65% floor keeps a display useful without making every clock a bright white
rectangle in a dark room. Its suitability at minimum gameplay zoom is a prototype
acceptance item; tune one shared floor if necessary, not individual maps. Displays
do not illuminate graffiti, platforms, or the player beside them. Their wall
placement should remain discreet as required by the level-design brief.

Keeping these readouts alive during EMP is intentional: EMP interrupts mechanism
power, not the player's information about time and collection progress. A coin
meter remaining visible does not mean it can activate a new output during EMP.

### Collectibles and their effects

All six collectible types remain self-lit. A harmful pickup must not become a
harder-to-see trap just because it is red. Keep its shape, number, direction, and
movement distinguishable; test the dark red explicitly on the darkest back wall.
If the existing red fails that check, revise one shared dark-scene rendering
treatment for harmful icons and angry eyes, preserving their relationship. Do
not silently recolor individual pickups or require color alone to identify them.

A visible coin can suggest a route through darkness, but cannot prove that a
landing exists. Authors must provide the necessary environmental light too.
The spin, collection bounds, sounds, durations, and effects on time remain exactly
as they are. Numbered collection labels still start at the numeral inside the
collectible; lighting must not recenter them or draw a second numeral.

These are back-wall items. A box, ball, terrain piece, or gate can cover them.
The self-lit icon, floating number, and pickup ring must retain that same layer
ordering. Do not render all emissive artwork at the very end of the frame.

### Player readability

Simply leaving the grey player fully bright is insufficient: a partly darkened
wall can become the same grey. Multiplying everything equally also loses the
silhouette as the world approaches black.

The proposed treatment is a single flat silhouette selected from existing inks:
normal player grey in full light, dark UI ink in middling light, and light UI
paper in deep darkness. It is a readability exception, not a lamp. It exposes
neither nearby terrain nor hidden routes, adds no outline, and changes no pose,
contact point, body dimensions, or animation timing.

Prototype starting rules: sample environmental brightness at the physical torso
center, excluding any player emission (there is none). Use normal `#686b6e` at
0.85 or above, dark ink `#303c36` from 0.55 to 0.85, and paper `#f4f2e9` below
0.55. Keep one ink across the entire figure. Add 0.03 hysteresis at boundaries
and a 100 ms transition on the unpaused visual clock; initialize immediately to
the correct ink on load/restart. Do not read back canvas pixels every frame.
The exit's existing fade still multiplies the figure's opacity.

This is the most consequential proposed art change and must be judged in the
first prototype, including mixed bright/dark backgrounds and crouching. Thresholds
and transition duration are provisional. Ship neither rapid ink switching nor
a disappearing player to avoid making this decision. If this treatment looks
wrong, revise this section explicitly before expanding the feature.

## 5. Shadows, receiving surfaces, and coverage

Use light-to-world geometry, not the shovebot's single sight ray. Reuse appropriate
intersection primitives and current geometry snapshots; do not assume bot sight
and room illumination are equivalent queries.

- Terrain uses its full polygon/profile outline, including concavities, slopes,
  undersides, and openings. No bounding-box shadows and no shadows from internal
  triangulation edges. A real opening transmits light.
- Boxes use their current rotation. Balls use a smooth round silhouette, with
  screen-error-bounded tessellation if needed. Bots use chassis and wheels.
- Gates and platforms cast from their current occupied shape, never their whole
  travel range. A stopped or EMP-disabled object still blocks light.
- Static and moving occluders are independent of whether the player can currently
  see them. An offscreen lamp or obstruction can affect the visible room.
- Shadows affect environmental illumination, not ambient or an object's readable
  artwork. Shadows cannot become darker than ambient or darken a second light
  that reaches the same point from another direction.

A flat object's front face must not become black merely because it is also a
shadow caster. For a caster's shadow, exclude its own occupied silhouette from
the shadow region before combining it with other casters' shadows. Another
object's shadow can still darken that face. Never erase all shadows wherever
there is any solid object; that would make props immune to each other's shadows.

Touching/overlapping terrain must behave like continuous solid terrain. Internal
seams must neither leak light nor introduce shadows that depend on how an author
split one slab into rectangles. Derive exposed contours or equivalent coverage
once for static geometry. This is a required geometry prototype, not permission
to add a special case for each problematic map.

The enclosing walls and floor are solids too, but their existing enormous
half-space coordinates must not become enormous shadow polygons or textures.
Use finite room boundaries and viewport-clipped receiving faces. Illumination
does not reveal any playable space outside the level.

### Source placement

The lamp's point is its emission center, not the corner of its fixture. Normal
placement keeps the whole fixture, initially a 12-unit diameter envelope, inside
the room and its center at least 6 units from terrain. A ceiling lamp sits just
below the ceiling, not inside it. The cone points away from its small housing.
There is no collision shape and no automatic terrain carving.

A light inside an opaque solid contributes no environmental illumination. Do
not silently move its origin to an arbitrary nearest free point or let it shine
through its covering object. A moving crate can temporarily cover a lamp; moving
the crate away restores the same source. A mounted light does not ignore its
host's shadow. Its source must sit outside the host, on the intended side.

Invalid initial terrain placement is an editor/playability error. A movable
object covering an otherwise valid source at runtime is normal behavior, not a
malformed level. Boundary/tangent tolerances must be consistent across preview
and play and tested against thin walls; tolerances cannot punch visible holes.

## 6. Power, switches, goal, and time

Each authored lamp has **Power: Always on / Switched**, default Always on.
Always on still means electrically powered and therefore affected by EMP.
There is no author-selectable emergency exemption in this release.

**EMP switches off authored lights; it does not lower ambient light.** It must
not apply an extra full-screen darkness overlay. Once the switch-off fade ends,
an outage at ambient 35 leaves ordinary surfaces at 35 wherever the protected
goal lamp does not reach. At
ambient 100, an outage changes lamp lenses and mechanism state but cannot darken
the environment. At ambient 0, ordinary unlit surfaces become black; readable
artwork and the protected activated exit remain the stated exceptions.

Switched lights are off until at least one active existing switch targets them.
Use the same OR relationship as mechanisms. Existing weight/touch plate behavior,
debounce, and coin latching remain the sole definitions of switch activation.
Do not add a second sensor, delay, or coin counter for lamps.

| Lamp | No EMP, no active target | No EMP, active target | During EMP |
| --- | --- | --- | --- |
| Always on | On | On | Off |
| Switched | Off | On | Off |
| Activated goal lamp | On, independently of targets | On | On |

Only Switched lamps may appear as switch targets. The goal is never a target.
A plate can operate a gate and lamps together; turning lamps off cannot deactivate
the gate except through the plate's existing shared state.

Coin pickup continues during an outage. A new threshold waits for restored power
before latching and lighting its lamps. A previously latched threshold remains
latched while its lamps are temporarily dark and relights them on restoration.
Pressure-controlled lamps follow the plate's current powered state after the
outage, not a remembered pre-outage load.

Evaluate desired lamp power from the finalized simulation state, including
pickups collected in that step. The first rendered frame after EMP collection
must begin switching off; the expiry step must permit restoration. Never leave
the render one simulation step behind trigger or power changes.

Use one bounded **200 ms linear fade** between current and target lamp intensity
for power changes, including EMP. A new change starts from the current intensity;
it does not jump to an endpoint first. Lens and environmental emission use the
same fade. The fade has no effect on collision, mechanism activation, or the
five-second outage duration. Another EMP extends the outage without a relight.

Use an unpaused visual clock for fades, independent of displayed race time.
Stopwatches, time bonuses, penalties, and fast watches do not alter fade speed or
shadow movement. Pausing/tab suspension freezes fades, lamp motion, and the
existing world animations. Resume does not catch up a large wall-clock interval.
Sources remain visible before the run starts; initialize the correct power state
without a bright loading frame. A spawn-overlapping EMP can darken lamps before
movement starts while retaining its full existing outage duration.

The activated goal emits a neutral round pool of radius 200 at intensity 100,
from the current pole-light position, including a flipped goal. Its visible lens
stays green. The pool obeys ordinary shadows but is protected from EMP. Activation
uses the same fade; the lens's active state still responds immediately so goal
feedback is not delayed. This explicit goal exception does not apply to authored
lamps. At ambient 100 the pool changes no pixels.

The goal remains self-contained: existing plate activation opens the door;
entering the doorway completes the level and locks scoring under the current
game rules. The lighting feature changes none of those events. An author must
still provide a readable approach to an unactivated goal; the future exit pool
cannot illuminate the route retroactively.

## 7. Lamps mounted to mechanisms

Support mounting to a gate, elevator, or moving platform by stable mechanism ID.
The lamp translates with the host's actual displacement, including shortened
travel caused by obstruction. It never follows an imaginary unobstructed path.
It stops with the host during EMP; its own power follows section 6.

Mounting and switching are separate relationships. A lamp on an elevator may be
Always on even when the elevator's plate is released. A switched lamp may share
the elevator's plate or use another. The inspector names both relationships.

Lamp position in a file is its world position with the host at its authored
starting position. Runtime position is that point plus the host's displacement.
There is no second saved offset that can disagree with it. Direction stays in
world coordinates: flipping a horizontal mechanism changes its travel direction,
not the lamp's aim. Authors can rotate a spotlight separately.

In the editor, moving a host carries its mounted lights; resizing preserves their
offsets without scaling light radius. Detaching preserves the current authored
world position. Deleting a host detaches its lamps rather than deleting them.
Deleting a lamp removes only that lamp's switch connections. Each operation is
one undoable edit. Whole-level templates remap host and target IDs consistently.
Duplicating one lamp creates a new ID and preserves its mount and Power setting,
but does not silently add the duplicate to existing switches. Duplicating a
mechanism alone does not duplicate its mounted lamps.

Keep mounted emission centers outside the host and within 20 units of its
perimeter at the authored position. The full fixture must stay within the room
through its configured travel. Other terrain covering it during travel is
allowed, but is previewed and reported as an authoring warning.

Do not support mounts to the player, ropes, bots, props, or other lights yet.

## 8. Builder and collection experience

Add **Ambient light** to Level settings, using the existing number-field style
and a synchronized slider. A drag makes one undo action. Add a single **Light**
tool under Back wall; its inspector chooses Round or Spotlight. Default placement
is Round, radius 320 (16 tiles), intensity 100, Always on, unmounted.

The inspector exposes these controls in this order:

1. Existing object name and position controls.
2. Shape, radius, and intensity.
3. Direction and spread, visible only for Spotlight.
4. Power, with connected switches named when switched.
5. Mount, with eligible mechanisms named.

Use the existing typography, field sizes, button treatment, spacing, and Help
dialog. No permanent explanation panel, new badge vocabulary, or live notices
that shift the layout. Validation uses the existing error presentation.

Selected lamps show a radius handle and, for a spotlight, aim and spread handles.
Dragging radius respects Snap; numeric entry allows precision. Direction is in
degrees and supports keyboard adjustment. Click selects the fixture, not its
entire illuminated region, so a large light does not steal clicks from objects.
Unselected lights do not draw circles, cones, bounds, or connection spaghetti.
Pointer and Node keep their existing selection behavior.

Add one obvious **Lighting preview** toggle beside the view controls. Default it
on. Turning it off shows a fully lit editing view without altering ambient,
lamp definitions, dirty state, or saved data. Guides and selection remain readable
in either mode. Save and Test always starts with the authored lighting and the
player's visibility preference, not the editor override.

Preview represents the fresh run's initial power and object state; it does not
silently press every plate or latch every coin switch. When needed, the selected
lamp's inspector offers a momentary **Preview on** control that affects only the
editor and makes no undo/save change. Release, focus loss, deselection, closing
the editor, or starting a test clears it. Actual switch, EMP, and moving-shadow behavior is
verified in playtest with normal controls.

Keep the existing coordinate contract: editor origin is bottom-left, while JSON
Y increases downwards. Growing level height shifts lamp world Y with every other
authored object, adding space at the top. Mounted lamps shift exactly once.
Shrinking checks fixture bounds, not the full radius: light can extend beyond
the room and be clipped. Mounted travel must still fit. Changing level dimensions
or flipping/moving a goal invalidates affected lighting caches.

Level picker, Library, templates, and recycle-bin cards share the same thumbnail
renderer. Show authored initial lighting, with fixed simulation state and no
preview override or animated flicker. Use standard visibility, not the viewer's
brightness preference, so collection cards stay consistent. Dark maps may have
dark thumbnails; authors should compose the start view deliberately. Do not
secretly brighten thumbnails to promise visibility the level does not provide.

## 9. Proposed file format and compatibility

Lighting changes navigation enough that an older client must not silently discard
it. The current version-1 parser reconstructs known fields and would ignore a
new optional `lighting` property. Therefore lighting-enabled files use **level
version 2**. This does not change the collection manifest's version or ordering.

- Continue reading and saving existing version-1 files without adding lighting
  fields or rewriting collections. Their effective ambient is 100 with no lamps.
- Version 2 keeps existing geometry/coordinate fields and adds required `lighting`
  with required `ambient` and `lights`. Other existing mechanics retain their
  semantics. Version 2 supports both puzzle levels and legacy-style playgrounds.
- Saving the first nondefault lighting edit upgrades that level to version 2.
  Preview overrides do not upgrade it. Keep version 2 on subsequent saves even
  if the author removes all lamps and returns ambient to 100.
- Reject lighting fields in version-1 files in the new loader, with a useful
  version message. Reject unsupported future versions before editing/saving.
  Old clients already reject version 2 rather than stripping its lighting.
- Sharing, folder reloads, templates, dev built-in editing, production assets,
  recycle/restore, and level validation tools all preserve the new data. Records
  retain their existing level identity behavior; no unrelated record migration.

The following is a **fragment**, to merge into a complete proposed version-2
level. The mounted example assumes the level contains mechanism `service-lift`:

```json
{
  "version": 2,
  "lighting": {
    "ambient": 35,
    "lights": [
      {
        "id": "entrance-lamp",
        "name": "Entrance",
        "x": 180,
        "y": 700,
        "shape": "round",
        "radius": 320,
        "intensity": 100,
        "power": "always"
      },
      {
        "id": "shaft-lamp",
        "name": "Shaft",
        "x": 680,
        "y": 500,
        "shape": "spot",
        "radius": 480,
        "intensity": 100,
        "direction": 90,
        "spread": 70,
        "power": "switched",
        "mount": "service-lift"
      }
    ]
  }
}
```

An existing pressure plate or coin switch can include both IDs in
`targets: ["service-lift", "shaft-lamp"]`. The light and mechanism then share
activation without sharing identity. A playground without puzzle mechanisms or
switches can use stationary Always on lamps; unresolved mounts and switched
sources remain invalid rather than creating implicit puzzle machinery.

| Field | Contract |
| --- | --- |
| `ambient` | Finite integer 0–100. |
| `lights` | Array, initially limited to 16 authored lights, including at most 4 mounted lights. The goal's derived light is additional and not serialized. |
| `id` | Nonempty stable string, at most 100 characters; unique across lights and mechanisms. Editor generates fresh IDs. |
| `name` | Optional, using existing object-name rules. Never HTML. |
| `x`, `y` | Finite world coordinates for the emission center in the authored start state; fixture inside playable room. |
| `shape` | Exactly `round` or `spot`. |
| `radius` | Finite 40–1200 world units; default new object 320. Inspector also communicates tile count. |
| `intensity` | Finite integer 1–100. Off is a power state, not intensity zero. |
| `power` | Exactly `always` or `switched`. |
| `direction` | Required for `spot`, omitted for `round`; finite −180 to 180 degrees, zero right, positive clockwise in both editor label and saved file. Thus 90 points down. |
| `spread` | Required for `spot`, omitted for `round`; finite 20–160 degrees for the whole cone, default 70. |
| `mount` | Optional mechanism ID, never an object index, light ID, or recursive attachment. |

Required light fields are explicit in saved files. Do not infer missing fields
from arbitrary values on import. New-object defaults belong to the editor.

Extend existing switch `targets` to resolve mechanism IDs and Switched light IDs.
Legacy singular `target` remains readable. Version 2 permits up to 56 unique
targets (the existing 40-mechanism cap plus 16 lamps); version 1 keeps its existing
limit. Reject duplicate/colliding IDs and unresolved references for playable
files. A new unconnected Switched light is an editor validation error until
connected or changed to Always on. Changing it to Always on removes its incoming
switch connections in the same undo action. Removing a last target follows the
existing unresolved-switch validation rather than inventing a hidden target.

The first release has no saved caches, shader programs, expressions, URLs,
textures, arbitrary color strings, or user-provided animation data. Preserve
existing byte/count bounds and safe object reconstruction. Reject nonfinite
numbers, wrong types, invalid enum values, and invalid bounds before allocating
lighting surfaces. Malformed levels use the existing file error workflow.

## 10. Rendering and performance contract

The current game uses Canvas 2D. Preserve that renderer unless a measured
prototype demonstrates that the agreed contract cannot meet budget. Do not
rewrite the movement engine or introduce a general game engine for lighting.

Conceptually, each frame consists of:

1. Read final world transforms, power states, and animation time.
2. Gather lights and occluders capable of affecting the viewport.
3. Construct the environmental illumination field with correct strongest-light
   combination and surface/shadow coverage.
4. Render the world in its established layer order, applying environmental or
   minimum-exposure treatment to each relevant composition.
5. Render the readable player at its established place in that order and apply
   existing exit opacity. Draw UI and editor overlays outside world lighting.

This is a result contract, not a requirement to issue five independent full-world
draws. A single black overlay with holes is not sufficient unless it also handles
the nonadditive light rule, solid receivers, and readable parts correctly.

The current back-wall order must survive: door/displays/collectibles precede
terrain and actors. Separate emissive masks or additional passes must preserve
that occlusion. All artwork, lighting, and masks use the same camera transform,
zoom, render scale, and current object snapshot. No one-frame shadow trails.

### Bounded work

- At ambient 100, skip visibility/shadow computation and lighting buffers.
- Bound buffers by the visible viewport and a capped resolution, never by a
  20,000-by-6,000-unit level or the enclosing half-spaces.
- Spatially query light influence bounds and caster bounds before exact work.
  Include sources outside the viewport whose range reaches it and offscreen
  blockers between those sources and the viewport.
- Cache static exposed contours and stationary-light/static-shadow work. Camera
  motion alone must not rebuild all geometry. Cache keys include level revision,
  lamp geometry, room dimensions, and the relevant render scale.
- Update moving occluders from the same finalized transforms used for drawing.
  A rotating ball does not invalidate its round silhouette, but a translating
  ball does. A rotating box does invalidate its silhouette.
- Do not scan every polygon for every ray at 120 physics updates per second.
  Lighting is render work, independent of the simulation's step frequency.
- Do not allocate an offscreen full-resolution canvas for every lamp. Reuse
  scratch buffers; cap the complete lighting cache at 64 MiB with eviction.
  Avoid canvas readback in the frame loop.
- Static preparation must be chunked or done in a worker. Bound jobs, cancel
  outdated editor revisions, and discard stale results rather than overwriting
  a newer edit. Do not reveal a fully bright frame while preparation is pending.
  Initial loads retain the loading view until the first coherent frame is ready.
  Editor rebuilds retain the last coherent preview until its replacement is
  ready; any preparation status uses existing reserved space, not a new banner.

Initial safety limits are 16 authored lights, 4 mounts, and radius 1200. Also
limit static candidate contour edges to 4096 per light and 32768 summed across
the authored lights plus goal, using mounted travel envelopes for candidate
bounds. Diagnose excess complexity before starting play; do not silently remove
lamps or shadows. This additional budget applies only to lighting-enabled levels
below ambient 100, not to existing fully lit levels. Include maximum legal props,
bots, and mechanism counts in runtime stress testing, since they can move into
a light's influence after loading.

These are initial engineering budgets, not measured capability claims. The
prototype must establish a documented reference device/browser and test both
normal and CPU-throttled Chromium. Target **at most 2 ms p95 additional lighting
work at 1280×800** for the representative large level, including mask composition,
and retain the game's 60 fps target. Also measure 1920×1080 and device pixel
ratios 1 and 2, startup work, editor dragging, memory, and maximum legal overlap.
Report actual results; passing a unit test proves no frame-time claim.

If resolution reduction is necessary, keep the same lights, shadows, power,
and exposure rules. Never simplify by dropping the farthest lamp, skipping
dynamic shadows, or changing ranges on a slower computer. Thin terrain must
continue blocking light at every quality level. The feasibility prototype must
resolve this before authoring levels whose solution relies on those shadows.

## 11. Readability, accessibility, and level design

Darkness should conceal information worth discovering, not make reliable input
feel broken. Before a required jump or rope release, the necessary landing or
catch must be readable in time to act. Near-black mandatory geometry cannot be
justified by a nearby self-lit coin. Hidden optional rewards are different from
an invisible mandatory obstacle.

Graffiti is not fluorescent. Put a lamp where a hint should be read, preferably
from a safe position before the decision. Illuminate ladder tops, rope exits,
plate loads, receiving platforms, and the connection between a switch and its
effect. A moving lamp can reveal a route periodically, but the player needs a
safe place to observe and a viable recovery after missing it.

Introduce lights before combining them with EMP. The first outage should happen
where the consequence is understandable and recoverable. Do not force an early
player to restart merely because every route marker disappeared. A later dark
machine room can be challenging once the relationship has been taught.

Add **Brighter dark levels** as a player preference in Controls/accessibility,
without adding a HUD widget or another pause-menu action. It raises effective
ambient to at least 35 and changes no sources, physics, timers, medals, records,
or bot behavior. Persist the preference locally; never write it into a level.
It is not a competitive ruleset. This is a readability aid, not a claim that one
brightness value solves every visual-accessibility need.

UI stays at normal contrast. Controls have names, keyboard access, visible focus,
and controller behavior consistent with their existing peers. Do not rely on
color alone for lamp power or switch state. Keep compulsory lighting transitions
free of flashing/strobing; do not add decorative flicker. Reduced-motion settings
must not introduce a different gameplay-visible source position or timing rule.

Test the silhouette, harmful red icons, clock digits, meter segments, and hints
at the smallest gameplay zoom and a dim display. Automated contrast samples and
screenshots support, but do not replace, human review in motion.

## 12. Required verification

### Automated behavior and geometry

- Legacy version-1 round trips and full-bright visual parity, including all
  existing materials, collectible animations, and goal states.
- Ambient 0/35/100; radius and cone limits; exact 0/1 endpoints; identical
  overlapping lamps; order independence; a second source illuminating a shadow.
- Concave terrain, a canted beam, thin walls, adjacent rectangles, overlapping
  terrain, real openings, boundary-mounted sources, and a lamp covered by a prop.
- Correctly lit caster faces; a box shadow on a ball; no bounding-box ball shadow;
  no shadow from triangulation seams, ropes, ladders, or the player.
- Actual gate/lift positions, blocked travel, rotated crates, moving bots,
  offscreen lamps/casters, camera scrolling, zoom, resize, and pixel-ratio changes.
- Clock normal/stopped/fast/finished states in darkness; all coin-meter states;
  all six pickups; active/inactive goal; calm/angry/EMP-disabled bot eyes.
- Readable items in cast shadows, and the same items hidden by foreground
  terrain/props/gates. Collection numbers and EMP rings retain their layer order.
- Switched OR logic, shared gate/lamp targets, pressure release during EMP,
  already-latched versus newly-reached coin thresholds, stacked EMPs, spawn EMP,
  time freeze/acceleration, pause/resume, restart, and exit completion.
- Player ink initialization, threshold hysteresis, repeated movement across a
  boundary, crouching, and exit fade; no changes to physics/poses.
- Mounted light rest position, obstruction-shortened motion, detach, host delete,
  flip, resize, duplication, target cleanup, and template ID mapping.
- Save/reopen, file version failures, malformed/oversized inputs, load cancellation,
  complexity limits, and old version-1 assets remaining playable unchanged.
- Editor Snap, handles, number edits, undo/redo, grow-at-top coordinates, mounted
  coordinates shifting once, preview overrides never saved, and Save and Test.
- One deterministic thumbnail appearance across picker/library/recycle bin;
  returning from playtest preserves the authored document and unsaved edits.
- Repeat existing physics tests and compare identical input runs with lighting
  disabled/enabled: positions, contacts, timers, coins, and completion must match.

### Visual and performance fixtures

Create dedicated test fixtures, not new built-in campaign levels by default:

1. **Lighting contact sheet:** every object and state, at ambient 100/65/35/10/0,
   in light, at a falloff boundary, in shadow, and covered by another object.
2. **Service corridor:** ambient 35, three lamps, a ladder access route, a jumping
   shortcut, one gate/lamp switch, and a hint that becomes readable. Demonstrate
   a fresh completion, an alternate route, and recovery.
3. **Moving light and outage:** platform-mounted cone, a crate that casts and
   receives a shadow, a coin switch, EMP, and the protected activated exit.
4. **Tower-scale stress fixture:** dense static terrain, offscreen sources,
   maximum legal lights and moving occluders, and scrolling at multiple zooms.

Review the contact sheet before polishing an atmospheric showcase. A beautiful
room does not excuse an unreadable red pickup or a clock that paints over a ball.
Then playtest real decisions: first discovery, repeated gold attempts, missed
jumps, and an EMP at an inconvenient moment. Apply the level-design checklist.

## 13. Implementation sequence and review gates

This document authorizes no implementation by itself. When implementation is
requested, keep the steps small and reviewable:

1. **Feasibility/art prototype:** one room, ambient control, two overlapping
   sources, one concave caster, a moving box, the object contact sheet, and the
   performance measurements. Resolve solid-face shadows and player inks here.
2. **Core rendering:** stable light field, static/dynamic occlusion, layering,
   readable elements, legacy parity, and bounded resource use.
3. **Level data and editor:** version 2, validation, placement/handles, undo,
   persistence, thumbnails, and full-bright editing override.
4. **World integration:** switched/mounted lamps, EMP, goal emission, deterministic
   initialization and time behavior, and their regression tests.
5. **Playable demonstration:** the service corridor and outage fixture, visual
   review, accessibility check, performance regression check, and full CI.

Do not darken existing built-in or local levels automatically. Retrofitting a
level is a separate authoring change, with its own route review and medal runs.

The first visual review must settle the player ink treatment, the shared 65%
display floor, harmful-red legibility, and the falloff proportions. The first
performance review must settle measured budgets and mask resolution. These are
explicit tuning questions; the power, occlusion, file-safety, layer-order, and
gameplay-preservation rules above are requirements, not optional polish.

## 14. Existing integration points

These links describe where implementation must connect; none is changed by this
specification:

- [Level types, parsing, and playability validation](../src/games/jumping/level.ts)
  and [file size/count limits](../src/games/jumping/levelLimits.ts).
- [Backdrop and terrain rendering](../src/games/jumping/render.ts) and
  [puzzle world order, clocks, mechanisms, and goal](../src/games/jumping/challengeRender.ts).
- [Player silhouette](../src/games/jumping/athlete.ts),
  [collectibles and their effects](../src/games/jumping/pickups.ts), and
  [coin displays](../src/games/jumping/coins.ts).
- [Power, triggers, EMP, and simulation order](../src/games/jumping/challenge.ts),
  [mechanism geometry](../src/games/jumping/mechanisms.ts), and
  [bot shapes and existing sight rules](../src/games/jumping/robotPhysics.ts).
- [Editor objects, coordinates, and operations](../src/games/jumping/editor.ts)
  and [runtime asset loading](../src/games/jumping/levelAssets.ts).
