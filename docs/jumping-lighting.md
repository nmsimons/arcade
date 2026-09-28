# Flat lighting for Untitled Jumping Game

**Implementation contract — September 27, 2026.**

Lighting is integrated into version-2 playable files, the level studio and
thumbnails on `codex/lighting`. Version-1 files keep their existing appearance.
The [lighting lab and measurements](jumping-lighting-prototype.md) document the
visual study and measured performance; the budgets below remain evaluation
targets, not a universal frame-rate guarantee. See [level files](jumping-levels.md#lighting-version-2)
for authoring instructions and the supported schema.

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
- Directional spotlights with neutral light; ambient provides general fill.
- Shadows from terrain and substantial physical objects, including moving ones.
- Lamps powered continuously or by existing pressure plates and coin switches.
- EMP behavior, lamps mounted to mechanisms, and a readable green exit indicator.
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
| Self-lit/readable | Its own artwork retains some or all brightness. It does not brighten adjacent pixels outside that artwork. | Clock face, collectible, powered bot eye, activated green goal lamp. |
| Emits light | Illuminates unobstructed space inside the level, without distance attenuation. | Authored spotlight. |

A readable clock is **not** an invisible room lamp. A gold coin is **not** a light
source. A self-lit object can be seen in a cast shadow but cannot be seen through
a foreground object that covers it. There is no player-centered fog of war:
visibility in darkness and line of sight from the player are separate concepts.

These distinctions are fixed by object type, not dozens of per-object toggles.

## 3. Ambient and local illumination

### Ambient

**Night mode** is a saved level toggle, off by default. Off means full original
brightness and bypasses environmental lighting. On enables spotlights and
**Ambient light**, an integer artistic scale from 0 to 100, default **100**.
Ambient controls minimum illumination everywhere, including cast shadows:
`A = 0.35 + 0.22 × clamp(ambient / 100, 0, 1)`. Zero means **35% brightness**,
our darkest usable room; 100 means **57% brightness**. The entire slider is smooth;
daytime is selected with the toggle, never an exceptional slider value.
Display ambient as a number without a percent sign. Keep its conversion shared
by rendering and sampling. Ambient is not blocked by geometry, consumed,
switched, or affected by EMP. It does not change while playing a level.

| Setting | Suggested use, not a guarantee of readability |
| --- | --- |
| Night mode off | Full original brightness, dark player ink for version-2 levels. |
| Night mode on, 60–100 | Lighter dark rooms; spotlights retain strong contrast. |
| Night mode on, 25–59 | Lamps establish rooms, destinations, and routes. |
| Night mode on, 1–24 | Separated light pools with a visible underlying layout. |
| Night mode on, 0 | Darkest supported setting: 35% brightness before spotlights. |

Disabling Night mode preserves ambient and lamps. The ambient controls remain
visible but disabled until Night mode is on. Toggling is undoable and saved with
the level. EMP and shadows never reduce the 35% baseline. Readable elements and
player treatment remain separate from this environmental minimum.

### Light shape and boundaries

All lights have unlimited reach, with no fade or cutoff based on distance.
Every authored light is a spotlight with direction and spread. There is no
omnidirectional lamp type. A spotlight extends indefinitely within its cone;
only the outermost 5% of its
half-angle softens to zero near the source. Cap that transition at **2 world
units** perpendicular to either cone edge. An angular feather alone becomes a
broad gradient at long distances and can shade most of a small object's body.
The cone's interior has constant intensity at every distance. There is no radius
property or radial edge.

Light stops at the level rectangle. Clip authored spotlights to
`0 ≤ x < width`, `0 ≤ y < height`; no beam or glow spills past the floor,
ceiling, or side boundaries. Outside that rectangle, placed lights contribute
nothing. Ambient remains unchanged. Terrain and objects inside the level still
block light, so unlimited reach does not mean shining through obstructions.

Keep spotlight edges deliberately sharper than realistic lighting, with just a
narrow smooth transition and no broad gradient. Authors do not edit softness
curves. Use one shared result for the game, editor, and thumbnails. Shadows have
crisp, antialiased boundaries; the first release has no penumbra or blurred shadow
that leaks through a wall. The player, boxes, balls, and shovebots retain full
shadow contrast for 40 world units past their farthest silhouette point, then
smoothly fade the projected shadow to zero over the next 240 units. This is an
art-direction choice to keep long shadows from dominating large terrain faces;
the sideways edges remain crisp. Terrain, gates, elevators, and moving platforms
keep opaque shadows at all distances. Neither lamp intensity nor ambient changes.
Measure the fade in world units along rays from the light, using one radial mask
per assembled caster; movement, zoom, and resting-shadow caching must agree.

### Combining lights

For a receiver point, use `A` from the shared ambient mapping above.
Each unobstructed lamp
contributes `angularFalloff × powerFade`, both in 0–1. Authored lamps always
use full intensity (100); brightness is controlled by the level ambient.
A blocked lamp contributes zero.
At the emission center itself, angular falloff is 1; there is no undefined
direction or division by zero. Use this smoothstep curve for the cone edge:
`1 - (3t² - 2t³)`, with `t` clamped to 0–1 across the relevant fade interval.
Use the greater of this angular contribution and `smoothstep(d / 2)`, where `d`
is the minimum signed perpendicular distance inside the two cone sides. This
keeps the original narrow transition near the source and caps its width farther
away. Apply the same rule in rendering and exposure sampling.

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

Night mode off bypasses the environmental-lighting work. Existing version-1 levels
without lighting continue to use their original renderer and player color.
Version-2 levels use the day/night player ink below.
Authored lamp fixtures remain visible in daytime, but their pools add no brightness.

## 4. Object-by-object contract

The back wall is a separate depth layer and its surface receives **ambient
only**. Terrain and physical objects receive spotlight illumination, block it,
and cast shadows onto other terrain and objects. Wall artwork and readable
indicators keep their specified exposure. The same separation applies in play,
the studio, thumbnails, and the lab.

Each powered fixture retains its short cone of source glow (56 world units).
Darker rooms also show a **very faint full-length airborne beam**, with no distance
falloff. Its maximum strength is 2.5% at ambient 0, fading smoothly to about
0.6% at 100; both beam and source haze disappear when Night mode is off.
Haze follows the same remapped brightness as surfaces, preserving its appearance
throughout the reviewed dark-room range.
Both effects stop at occluders and room boundaries and follow power and EMP
fading. The full beam sits behind physical objects, wall text, displays,
collectibles, and fixtures, preserving their colors and readability.

The full beam uses the already resolved strongest-light field, including its
narrow cone edges and shadows. Overlapping beams do not add brightness. It reuses
existing scratch surfaces and foreground coverage; it adds no light/occlusion
calculation or framebuffer. This faint atmospheric cue does not alter actual
surface illumination or the unlimited reach of the lights.


"Ordinary" means the environmental brightness from section 3. "Full" means the
object's current colors, not white, bloom, or unlimited emission. Minimum display
exposure is an artistic multiplier, not an accessibility contrast certification.

| Object or part | Response to ambient and lamps | Casts shadows? | Emits into the world? | EMP response |
| --- | --- | --- | --- | --- |
| Back wall and grid | Ambient surface; grid fades with its wall. A faint airborne beam may be visible in front at low ambient. | No. | No. | Ambient unchanged; beam fades out. |
| Terrain, pillars, platforms, slopes, enclosing floor/walls/ceiling | Ordinary; retain material colors and texture relationships. | Yes, using actual outlines. | No. | Unchanged. |
| Box, including its seams | Ordinary; all parts share exposure. | Yes, using its rotated shape. | No. | Keeps its existing loose-body behavior. |
| Ball and its rolling marker | Ordinary; marker remains part of the same shaded artwork. | Yes, using its round silhouette. | No. | Keeps moving normally. |
| Elevator, moving platform, vertical/horizontal gate | Ordinary; markings dim with the structure. | Yes, at its actual current position. | No, unless a separate lamp is mounted to it. | Stops as currently specified; remains an occluder. |
| Elevator cable/guide or other thin mechanical decoration | Ordinary. | No. | No. | Follows its mechanism's existing appearance. |
| Ladder and rope, including anchors | Ordinary; authors must illuminate important exits and catches. | No. | No. | Existing movement remains unchanged. |
| Pressure plate and its active/inactive strip | Ordinary. Its active color is a state indicator, not a luminous surface. | No; too small to justify extra shadow noise. | No. | Existing load/activation behavior; no invented glow. |
| Coin switch: entire display | Minimum 65% exposure; preserve segments, empty track, progress, and active-state contrast together. | No. | No. | Readout remains visible and counts coins. Switching still obeys EMP and latching rules. |
| Wall clock: entire face | Minimum 65% exposure, as described below. | No. | No. | Keeps showing the real clock and existing clock-effect states. |
| Official wall text | Ambient only. | No. | No. | Unchanged. |
| Red graffiti | Ambient only, including its red strokes. | No. | No. | Unchanged. |
| Player | Dedicated flat-silhouette readability treatment below. | Yes, using the current animated silhouette. | No; no automatic halo or headlamp. | Existing movement and animation unchanged. |
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
| Goal lamp after activation | Full existing green lens, visible even at ambient 0. | No. | No; the indicator never lights nearby surfaces. | Stays visibly green. |
| Open exit doorway | Retains its black opening; wall around it remains ambient-only. | No. | No. | Opens and accepts the player as usual. |
| Authored lamp housing | Ambient only, with a small, flat fixture. | No. | No. | Housing remains in place. |
| Authored lamp lens | Full neutral lens at full power; follows its power fade when switching. | No. | Its defined spotlight cone. | All authored lamps lose power. |
| Start/checkpoint floor markings in legacy playgrounds | Ordinary. | No. | No navigation beacon. | Unchanged. |
| Dust, foot/contact effects, and slide marks | Ordinary at their world position. | No. | No. | Existing effect behavior. |
| Pickup pulse/shrink, floating `−n`/`+n`, and EMP ring | Full source color, multiplied by the existing animation opacity. | No. | No flash of environmental light. | Animation continues unless the game is paused. |
| Menus, dialogs, HUD, focus indicators, editor handles/guides | Outside world lighting. | No. | No. | Unchanged. |

### Clocks and coin displays

Apply `max(ambientExposure, 0.65)` to the **whole display composition**. These
back-wall displays do not react to spotlights or passing shadows.
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
wall can become the same grey. Multiplying everything equally can also lose the
silhouette against the dimmed environment.

Choose one of exactly two flat player colors from **authored Night mode alone**:
warm paper `#f4f2e9` at every night ambient value; dark ink `#303c36` in daytime.
Do not interpolate between them or fade through intermediate greys. The same
color covers the whole figure at full exposure; the exit's existing fade still
multiplies its opacity. The ink changes only when switching to fully lit mode.

Spotlights, shadows (including the player's own), position, and EMP never change
this color. There is no local brightness sampling, temporal hysteresis,
or delayed initialization. Toggling Night mode in the study switches
the ink immediately. Changing ambient does not. Night mode is fixed within a level, so normal movement never
switches it. This is a readability treatment with no halo or emitted
light, and no change to pose, contact points, or animation timing.

An overhead head shadow exposed poor contrast in the initial torso-exposure
experiment. A subsequent continuous ambient-only blend lost the figure against
the wall around ambient 56 on the former linear scale. The two-ink rule removes that intermediate-grey
failure. Review both inks against bright spotlight patches as well as shadows;
it does not guarantee contrast against every possible background.

## 5. Shadows, receiving surfaces, and coverage

Only terrain and physical objects receive surface shadows. The back-wall grid
and wall artwork receive ambient illumination. Occlusion also interrupts the
faint airborne beam in dark rooms; it never subtracts ambient from the wall.

Use light-to-world geometry, not the shovebot's single sight ray. Reuse appropriate
intersection primitives and current geometry snapshots; do not assume bot sight
and room illumination are equivalent queries.

- Terrain uses its full polygon/profile outline, including concavities, slopes,
  undersides, and openings. No bounding-box shadows and no shadows from internal
  triangulation edges. A real opening transmits light.
- Boxes use their current rotation. Balls use a smooth round silhouette, with
  screen-error-bounded tessellation if needed. Bots use chassis and wheels.
  Rounded corners on boxes, bot chassis, and mechanisms follow the visible art;
  square collision corners must not cast invisible extensions. A mechanism corner
  becomes square only where it joins a terrain or mechanism face, in both artwork
  and shadow geometry. This closes cosmetic pinholes at flush joins; exposed
  corners stay rounded and regain rounding when a real gap opens. Point-only
  contact is not a shared face. Collision and movement rules are unchanged.
- Gates and platforms cast from their current occupied shape, never their whole
  travel range. A stopped or EMP-disabled object still blocks light.
- The player casts from the same posed outline used to draw its head, torso,
  arms, hands, legs and feet. Preserve gaps between limbs. Group the silhouette
  as one caster, so overlapping body parts do not shade one another. Keep its
  readability treatment independent of this shadow. During the exit animation,
  shadow opacity follows the figure's fade. No collision or pose changes.
- Static and moving occluders are independent of whether the player can currently
  see them. An offscreen lamp or obstruction can affect the visible room.
- Shadows affect environmental illumination, not ambient or an object's readable
  artwork. Shadows cannot become darker than ambient or darken a second light
  that reaches the same point from another direction.

A flat object's front face must not become black merely because it is also a
shadow caster. For a moving object's shadow, exclude its own assembled silhouette
before combining it with other casters' shadows. Another object's shadow can
still darken that face.

Touching/overlapping terrain must behave like continuous solid terrain. Internal
seams must neither leak light nor introduce shadows that depend on how an author
split one slab into rectangles. Prepare its exposed union boundary once, splitting
edges at crossings and shared endpoints and removing internal seams. Shadows
start at exposed edges where rays leave solid material. The first continuous
solid face receives light through its thickness; later terrain across an air gap
receives its shadow. This also applies to concave polygons and terrain connected
around the room boundary. **Never erase a shadow from an entire connected terrain
mass**: a wall can shade the floor behind it even when they join elsewhere.

Gates, elevators, and horizontal moving platforms participate in this same
structural boundary at their actual positions. Remove only shared/overlapping
edge intervals; keep all shadows across remaining air gaps. This works in both
lighting directions and for partial contacts. Loose boxes, balls, bots, and the
player remain independent casters. Prepare terrain once, retain the stationary
field for unaffected edges, and update only nearby boundary portions as mechanisms
move. A contact opening, closing, resizing, or disappearing must invalidate the
appropriate cached coverage, including when the mechanism itself is offscreen.

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
an outage at night ambient 0 leaves ordinary surfaces at 35% brightness. With
Night mode off, an outage changes lamp lenses and mechanism state but cannot darken
the environment. Readable artwork and the activated green exit indicator retain
their specified appearance; none casts light into the environment.

Switched lights are off until at least one active existing switch targets them.
Use the same OR relationship as mechanisms. Existing weight/touch plate behavior,
debounce, and coin latching remain the sole definitions of switch activation.
Do not add a second sensor, delay, or coin counter for lamps.

| Lamp | No EMP, no active target | No EMP, active target | During EMP |
| --- | --- | --- | --- |
| Always on | On | On | Off |
| Switched | Off | On | Off |
| Activated goal indicator (no emitted light) | Green, independently of targets | Green | Green |

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

The activated goal's existing lens stays green and readable, including on a
flipped goal and during EMP. It emits **no environmental light**, creates no
halo, and adds no source to the light list. Its active appearance responds
immediately to goal state. Nearby walls, floor, and objects retain their existing
lighting when the indicator turns on.

The goal remains self-contained: existing plate activation opens the door;
entering the doorway completes the level and locks scoring under the current
game rules. The lighting feature changes none of those events. An author must
provide a readable approach to the goal and doorway; the indicator does not
illuminate that route.

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
offsets without changing spread or aim. Detaching preserves the current authored
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

Add **Night mode** and **Ambient light** to Level settings. Disable ambient
controls when Night mode is off, preserving their values. Use the existing number-field style
and a synchronized slider. A drag makes one undo action. Add a single **Light**
tool under Back wall. Every light is a spotlight; there is no shape picker.
Default placement is direction 90 (down), spread 70, intensity 100, Always on,
unmounted.

The inspector exposes these controls in this order:

1. Existing object name and position controls.
2. Direction and spread.
3. Power, with connected switches named when switched.
4. Mount, with eligible mechanisms named.

Use the existing typography, field sizes, button treatment, spacing, and Help
dialog. No permanent explanation panel, new badge vocabulary, or live notices
that shift the layout. Validation uses the existing error presentation.

Selected spotlights show aim and spread handles. There is no range handle.
Numeric entry allows precision. Direction is in
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
Shrinking checks fixture bounds; illumination always stops at the new room
boundary. Mounted travel must still fit. Changing level dimensions
invalidates affected lighting caches. Moving/flipping the goal updates its artwork
only; it is not a light source.

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
  fields or rewriting collections. They remain daytime with no lamps.
- Version 2 keeps existing geometry/coordinate fields and adds required `lighting`
  with required `ambient` and `lights`, plus boolean `nightMode` in new saves.
  Older experimental version-2 files without the flag infer Night mode from
  `ambient < 100`; loading does not rewrite the file. Invalid flag types are rejected. Other existing mechanics retain their
  semantics. Version 2 supports both puzzle levels and legacy-style playgrounds.
- Saving the first nondefault lighting edit upgrades that level to version 2.
  Preview overrides do not upgrade it. Keep version 2 on subsequent saves even
  if the author removes all lamps and disables Night mode.
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
    "nightMode": true,
    "ambient": 35,
    "lights": [
      {
        "id": "entrance-lamp",
        "name": "Entrance",
        "x": 180,
        "y": 700,
        "direction": 90,
        "spread": 120,
        "power": "always"
      },
      {
        "id": "shaft-lamp",
        "name": "Shaft",
        "x": 680,
        "y": 500,
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
| `nightMode` | Boolean. New saves include it; older files infer it from `ambient < 100`. |
| `ambient` | Finite integer 0–100. Maps to 35–57% brightness when Night mode is on. |
| `lights` | Array, initially limited to 16 authored spotlights, including at most 4 mounted lights. The goal indicator is not a source and has no entry. |
| `id` | Nonempty stable string, at most 100 characters; unique across lights and mechanisms. Editor generates fresh IDs. |
| `name` | Optional, using existing object-name rules. Never HTML. |
| `x`, `y` | Finite world coordinates for the emission center in the authored start state; fixture inside playable room. |
| `intensity` | Optional legacy field. Valid integers 1–100 normalize to 100; omission defaults to 100. No authoring control. Off is a power state. |
| `power` | Exactly `always` or `switched`. |
| `direction` | Required; finite −180 to 180 degrees, zero right, positive clockwise in both editor label and saved file. Thus 90 points down. |
| `spread` | Required; finite 20–160 degrees for the whole cone, default 70. |
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
4. Render the back wall at ambient only; render terrain and objects in their
   established layer order, applying environmental or
   minimum-exposure treatment to each relevant composition.
5. Render the readable player at its established place in that order and apply
   existing exit opacity. Composite the faint airborne beam in dark rooms behind
   physical objects and readable wall art, preserving the stronger source glow.
   Draw UI and editor overlays outside world lighting.

This is a result contract, not a requirement to issue five independent full-world
draws. A single black overlay with holes is not sufficient unless it also handles
the nonadditive light rule, solid receivers, and readable parts correctly.

The current back-wall order must survive: door/displays/collectibles precede
terrain and actors. Separate emissive masks or additional passes must preserve
that occlusion. All artwork, lighting, and masks use the same camera transform,
zoom, render scale, and current object snapshot. No one-frame shadow trails.

### Bounded work

- With Night mode off, skip visibility/shadow computation and lighting buffers.
- Bound buffers by the visible viewport and a capped resolution, never by a
  20,000-by-6,000-unit level or the enclosing half-spaces.
- Spatially query cone/viewport bounds and caster bounds before exact work.
  Include sources anywhere in the level that can illuminate the viewport, and
  offscreen blockers between those sources and the viewport. Do not use a
  distance cutoff. Project shadows beyond all visible receivers, then clip the
  final light field to the level rectangle.
- Cache static exposed contours and stationary-light/static-shadow work. Camera
  motion alone must not rebuild all geometry. Cache keys include level revision,
  lamp geometry, room dimensions, and the relevant render scale.
- Reuse resting prop, bot and mechanism shadows in the existing stationary
  fields. Invalidate on any silhouette or opacity change, including subpixel
  motion; cache decisions must never delay movement or quantize shadows. Keep
  the animated player shadow live. Reuse must not increase the buffer budget.
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

Initial safety limits are 16 authored lights and 4 mounts. Also
limit static candidate contour edges to 4096 per light and 32768 summed across
the authored lights, using mounted travel envelopes for candidate
bounds. With unlimited reach, count the whole room's static contours unless they
can be conservatively excluded by direction. Diagnose excess complexity before
starting play; do not silently remove
lamps or shadows. This additional budget applies only to lighting-enabled levels
with Night mode on, not to existing fully lit levels. Include maximum legal props,
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
dynamic shadows, or adding distance cutoffs on a slower computer. Thin terrain must
continue blocking light at every quality level. The feasibility prototype must
resolve this before authoring levels whose solution relies on those shadows.

## 11. Readability, accessibility, and level design

Place lights as part of a believable building: ceiling fixtures, wall lamps,
work lights, or lamps attached deliberately to machinery. Aim each spotlight at
the space that fixture would serve. Avoid floating sources whose only purpose is
to produce a convenient shadow.

Prefer **one dominant spotlight per playable area**, with two contributing when
their overlap has a clear purpose. This is an authoring guideline, not a global
two-light limit. A large level can have many lit areas; architecture, beam aim,
and occlusion should generally leave only one or two sources influencing the
space the player is currently using. Do not enforce this by silently disabling
other lights at runtime. Test busy three-or-more-source arrangements as stress
cases, not as the default visual composition.

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
night ambient to 100 (57% brightness), without changing Night mode, and changes no sources, physics, timers, medals, records,
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
- Night ambient 0/50/100 maps to brightness 0.35/0.46/0.57; daytime is 1; constant intensity at near
  and far distances; cone limits; all four level boundaries; exact beam 0/1 endpoints; identical
  overlapping lamps; order independence; a second source illuminating a shadow.
- Concave terrain, a canted beam, thin walls, adjacent rectangles, overlapping
  terrain, real openings, boundary-mounted sources, and a lamp covered by a prop.
- Correctly lit caster faces; a box shadow on a ball; no bounding-box ball shadow;
  no shadow from triangulation seams, ropes, or ladders. Player shadows follow
  the animated silhouette in both facings, including crouches and jumps, and
  fade with the exiting figure without changing the player's readable ink.
- Actual gate/lift positions, blocked travel, rotated crates, moving bots,
  offscreen lamps/casters, camera scrolling, zoom, resize, and pixel-ratio changes.
- Clock normal/stopped/fast/finished states in darkness; all coin-meter states;
  all six pickups; active/inactive goal; calm/angry/EMP-disabled bot eyes. The
  activated green goal lens must not change surrounding illumination, including
  when flipped and during EMP.
- Readable items in cast shadows, and the same items hidden by foreground
  terrain/props/gates. Collection numbers and EMP rings retain their layer order.
- Switched OR logic, shared gate/lamp targets, pressure release during EMP,
  already-latched versus newly-reached coin thresholds, stacked EMPs, spawn EMP,
  time freeze/acceleration, pause/resume, restart, and exit completion.
- Player color initialization, both day/night inks and the mode toggle, the
  ambient-56 regression, repeated movement across light/shadow boundaries,
  crouching, and exit fade; no changes to physics/poses.
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
2. **Service corridor:** ambient 0, one or two architecturally placed spotlights
   influencing each playable area, a ladder access route, a jumping
   shortcut, one gate/lamp switch, and an ambient-readable wall hint. Demonstrate
   a fresh completion, an alternate route, and recovery.
3. **Moving light and outage:** platform-mounted cone, a crate that casts and
   receives a shadow, a coin switch, EMP, and the readable green exit indicator.
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
4. **World integration:** switched/mounted lamps, EMP, readable goal indicator, deterministic
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
