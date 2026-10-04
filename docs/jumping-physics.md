# Jumping game contacts

The player uses the custom movement controller for its existing acceleration,
jumps on press, slope traction and climbing. Matter simulates loose props. Their
boundary is the contact model in `src/games/jumping/playerContacts.ts`.

Each collider has a stable identity and a current geometry snapshot. Terrain,
mechanisms, boxes and balls all appear in the player's collision world. A contact
query identifies the supporting surface and the nearest reachable pushing face.
The same policy supplies prop forces, the player motor, support transport and
the pushing pose. Only the selected prop receives the player's shove; a nearer
wall blocks an object behind it.

If the player braces against a wall or another object while standing on a loose
prop, the supporting prop receives the opposite shove at the feet. This lets a
ball roll back from a wall instead of behaving like fixed ground under the player.
Standing on a grippable surface balances weight and traction; it does not apply
a sideways force to that support. This keeps an idle player from propelling a
ball simply by standing off its center. The foot reaction requires an active shove.
Grounded bracing uses the actual exposed vertical face at hand height, including
faces inset within a single terrain polygon, rather than its bounding edge.
Airborne bracing and wall jumps use those same exposed faces. The inside
of an L-shaped polygon supports wall jumps like separate pieces of terrain;
covered seams, sloped faces, and gaps cannot supply a wall contact.
Body contacts also transfer normal load while airborne. A player wedged between
a ball and a wall can therefore displace the ball and regain footing. Requested
motion away from a contact does not cancel the weight on it when another wall
prevents separation. These contacts use the same swept player hull as movement.
Ball settling drag, including the stronger pressure-plate drag, applies only
without an active player load or shove. Otherwise it can cancel the force on a
large ball every physics step and leave the player suspended beside a wall.
The normal settling behavior resumes when the player releases contact.

A shove, body load or impact wakes the touching prop chain before the contact
solve. A sleeping neighbor must receive the transmitted force, rather than
acting as a fixed obstacle until the first prop gains speed. Connected driven
chains use extra velocity iterations to settle their coupled constraints when
blocked; isolated props retain the usual solver budget. Resting objects still
sleep normally. Regression coverage lives in `tests/jumping-prop-sleep.test.mjs`.

Prop-driven player displacement and carrying sweep against terrain, mechanisms,
other props and shovebots. During the shared contact solve, these sweeps use
the latest corrected prop positions, excluding only the object supplying the
motion. Any blocked displacement resolves back into that object. This keeps a
shove from squeezing the player inside a neighbouring ball or box, regardless
of contact order, while leaving normal movement and jumping available.

Mechanisms share position and travel geometry for both axes. A closing
gate reverses when blocked, completes its opening stroke, and waits for its full
closing path to clear for 0.6 seconds. Safety clearance checks the gate's actual
swept volume, rather than the travel requested for its passengers.

Carrying is requested movement, not a rigid attachment. When a player, box, or
ball on a mechanism meets an obstacle, resolve the passenger against that
obstacle and let the mechanism continue if its own next position fits. Horizontal
gates and platforms can slide out from under blocked passengers; descending
mechanisms can leave cargo on a receiving ledge. A player riding a carried crate
can also be left behind while the crate continues. Clipping a carry does not add
an artificial backward velocity.

Elevators first try to displace a contacted ball using the prop solver's collision
hulls. Floor, platform and wall normals are solved together, so a ball can roll
along a surface or push neighboring balls out of the way. Carried boxes use that
same contact solver, and the player's carry is swept against the available space.
Trial positions are committed only when every final hull fits. A passenger
trapped between the mechanism and terrain still blocks it; blocked trials impart
no motion or momentum. Near the crown of a ball, the elevator takes a shorter step to keep its
contact-driven speed bounded. A flat contact with no sideways normal does not
invent a rolling direction.
If terrain, another mechanism, a player or a trapped prop prevents further
travel, that position becomes the endpoint for the current trip. The elevator
uses its normal endpoint pause and reverses, continuing to cycle in the available
space. Each trip retries the full configured travel, so removing an obstruction
automatically restores the original range. Releasing its pressure plate still
pauses both travel and endpoint waiting.

Shovebots start aligned with their supporting slope and use each surface's
normal to account for a round wheel's clearance. This lets valid steep slopes
support both uphill and downhill driving without treating downhill travel as
a cliff. Each wheel still needs terrain directly beneath its center, and the
full chassis must clear the terrain. Regression coverage lives in
`tests/jumping-robot-slopes.test.mjs` and `tests/jumping-object-slopes.test.mjs`.

Shovebots recheck their current wheel support independently of driving. When a
prop moves out from under a wheel, the chassis settles toward the available
support with bounded tilt and downward motion, including during idle recovery.
Settling checks the complete hull and uses the same player displacement rules as
driving. The drive query retains its short support reach and cliff avoidance;
EMP pauses both driving and settling. Regression coverage lives in
`tests/jumping-robot-settling.test.mjs`.

Shovebot sight uses its current left/right facing before checking range and cover.
A player behind it cannot trigger a chase, windup, or charge or turn the bot around.
Moving behind an aggressive bot loses sight and restores patrol; an ordinary
patrol turn can reveal the player again. The eye color follows this same detection.

## Jump-on-press experiment

Every supported jump starts on a fresh press, including ground/coyote-time,
wall, slope, ledge, ladder and rope jumps. Ground and wall presses retain the
0.13-second buffer; holding never repeats a jump or adds charge. Catching a rope
or ledge consumes the held press, so release and press again to jump away.
A press during an automatic short step launches when that step finishes;
pausing clears pending presses.

Centered jumps start at 500 units/second upward. Directional input increases that
strength linearly to 800 at full stick deflection, using the length of the
horizontal/upward input vector (capped at one). Up can therefore make a strong
vertical jump without lateral motion. Partial upward input works below the
climbing threshold; Down alone does not add lift. Keyboard Up or lateral movement
supplies full input, while Shift reduces lateral input to walking strength.
Strength is sampled on the press and retained through buffering/short steps.

Horizontal momentum carries through takeoff, with gradual air steering, so
running still covers more distance than starting from rest. Wall jumps retain
their separate 500-unit/second upward impulse and 300-unit/second outward kick.
Grips and slopes use the same input-strength rule; rope releases also keep real
rope momentum. Holding cannot turn a ground jump into a later wall jump.

The selected defaults in `movementTuning.ts` are 500 base jump, 800 full-input
jump, 410 running speed, 1550 gravity, 300 air acceleration, 2000 ground
acceleration and 500 wall jump. The temporary in-game tuning sliders have been
removed; saved experimental browser settings no longer override these values.
Built-in routes and medal times have been checked against these defaults; see
[the medal audit](jumping-medal-audit.md) for completed control recordings and
the limits of the graphical playtesting.

## Step order

1. Read pressure plates and move mechanisms, carrying supported riders.
2. Apply shovebot actions and advance prop physics using the selected pushing
   contact. Carry riders and their foot anchors with their supporting prop.
3. Refresh collider geometry and calculate player movement. A braced motor
   follows the contact face and its footing instead of accelerating freely and
   then pulling the body back into place.
4. Sweep the player against all solids and resolve support, landing and sliding.
5. Publish `player.contacts`: final support, push contact, and resolved travel.
   Update the pushing blend, gait and footwork exactly once, from that result.
6. Evaluate pickups, pressure plates and goal completion at the final positions.

The exit has no pressure plate. Always-on exits start open; switched exits follow
their selected switch logic, opening and closing normally. Gates, elevators,
moving platforms, wall lights, spotlights and switched exits share OR (any active input),
AND (every connected input), or XOR (exactly one active input). Reversed flips
the combined result. Unconnected items stay off normally and on when reversed.
Omission preserves OR with reversal off. Enabling Relay makes an item's combined
result an input to its connected targets; Relay is off by default. Acyclic relay
chains settle immediately, independent of object order. Feedback loops are
invalid. Previews and gameplay use the same initial inputs and rules. Relay
outputs describe logical activation rather than physical gate position, safety
holds, movement, light fading or flicker. They follow inputs during EMP while
mechanisms pause and spotlights fade off normally.

Dedicated logic relays use that same evaluator and always expose their combined
result as an output. They have no physical geometry, lighting, sound or contact
behavior. Their position and rule artwork exist only in the studio; gameplay
and thumbnails never draw them. EMP affects their sensor inputs under the normal
pressure/latching rules, without adding a separate relay power state.

Pressure plates can mount on lifts: both contact samples, rendering and sound
use the host's current position plus the plate's saved horizontal offset.
The normal passenger solver carries player and prop loads. Mounting does not
change contact rules, debounce, plate modes or EMP behavior. Wall lights use the
goal indicator's activation colors and brightness, without emitting light or
adding colliders.

Plate inputs use Pressure (while loaded), Switch (latched after one press), or Toggle (one reversal
per press after release, with an authored initial state). Physical load and stored
activation are distinct; two sensor samples in one physics step cannot toggle
twice. Switch and Toggle retain their state during EMP; new presses wait for power.
Always-on elevators and moving platforms still obey global EMP pauses.

Entering the fully open back-wall door locks scoring and
starts a short authored movement, followed by the same contact/animation
finalization as normal movement. Its approach is swept against nearby objects;
entry never requires reaching a center point blocked by a prop. The result dialog
waits until this exit finishes.

Geometry must be refreshed after moving objects, and final contacts must be
revalidated after a jump or collision. These are successive stages of the same
contact policy, not independent object-specific decisions about the player.
When identifying the contacted face, retain only faces whose outward normal
can supply the collision's separating normal. A tall body's side midpoint may
sit above a short box; tiny solver overlap must not turn that lateral contact
into footing on the box's top. Otherwise a player pressed between that box and
a ball can alternate between distant slide-pose anchors while barely moving.
Nearly vertical faces remain wall contacts for slide selection: an upward normal
component below 0.01 can come from a resting box's slight solver tilt, and does
not provide a sliding foot placement. The solid body sweep still resolves those
faces normally.

Ledge grabs, ladder exits, rope transfers and lowering over an edge share the
terrain's actual exposed top corners. Inset towers and shelves within a single
polygon work like separate terrain pieces. Climbing exempts only the supporting
corner from the standing-body hull; ceilings and other parts of the same polygon
still obstruct the climb. A flush wall beneath a separate cap continues the same
supporting face, so its internal seam cannot block a rope transfer, pull-up or
lowering motion. Follow only touching face intervals; real gaps retain separate
collision geometry.

Rope contacts apply to the complete path, including spans between particles and
corner bends. Body corrections during climbing must keep adjacent spans clear;
clear endpoints alone cannot justify pulling a rope through an open gate or
window post. If the final constraint solve cuts through a solid, shorten that
step toward the previous clear configuration and reduce its stored velocity.
Rope contacts include gates and terrain throughout climbing and window transfers.
Regression coverage lives in `tests/jumping-rope-gate.test.mjs` and
`tests/browser/jumpingRopeGate.dev.spec.mjs`.

Automatic steps up low terrain prefer their normal 12-unit landing inset, but
can shorten it to 8 units when the next riser leaves a narrow tread. Both flat
soles need supported landing contacts, and the entire path uses the ordinary
player hull against every solid, including the supporting stair. This allows
20-unit treads without skipping risers, bridging gaps or accepting unsupported
tiny shelves. The hand-assisted climb above 40 units retains its existing path.

Pull-ups first choose a clear, supported landing with all current solids present,
including loose props. Prefer the usual reach, then a compact stance near the lip.
This lets the player climb at the normal pace into an existing pocket beside a
box and use the ordinary grounded shove when continuing forward. Only plan a
route through a movable prop when no clear landing route exists.

When a loose object resists that pull-up, advance the climb by the collision-safe
fraction of the current physics step along its authored curve. Waiting for an
entire animation step to fit creates long frozen poses punctuated by full-step
jumps, even when rendering is fast. The root, torso/head contact hull and limbs
must share the accepted progress. Prop forces still probe the next requested
step, so a yielding box permits continuous progress while a pinned obstacle
holds a stable pose. Returning to the ledge remains available.

The usual pull-up lands 20 units inside the lip. If a resisted pull stays below
half its normal pace for 0.15 seconds, look again for a clear near-edge stance.
This includes space opened by a still-moving prop, without waiting for it to
stop. The pull may reposition smoothly onto a tighter path with an inset as
small as 8 units. Check the full path and supported destination against the
current collision world before choosing it, then sweep both repositioning and
progress. The compact pose keeps its hand/knee supports at the same corner and
plants its feet at the nearer destination. Lowering searches the same paths,
so a narrow standing space reached by a jump or pull-up can still lead back to
a hang. Moving props continue to receive the normal shove; an obstruction with
no clear alternative still stops the climb. These are shared movement rules,
not exceptions for particular objects or levels.

## Boundaries to preserve

- Animation may reposition limbs, but never the player's physical root.
- Gait uses resolved travel, not requested speed or velocity before a collision.
  Support transport happens before that measurement, so riding does not make
  the player walk in place.
- Hand targets use the contacted face, including a box's tilt. Feet sample their
  own points on the terrain, with the resolved support defining their stance.
- Jumping, turning away and losing support release the push constraint. Cosmetic
  blend-out is not a physical contact and cannot keep applying prop forces.
- Physical surfaces belong in the collision world. Do not add a second player
  overlap correction after `stepPlayer`, or rewind and recompute its animation.
- Add future surface friction properties to the contact's collider/material and
  use them in the existing traction calculations; keep material decisions out
  of the renderer.

`tests/jumping-player-contacts.test.mjs` covers contact selection, bracing,
release and support transport. The slope, friction, prop-collision, animation
and climbing suites cover the movement behavior around that boundary.

## Motion continuity and diagnostics

Uninterrupted unsupported travel with gravity beyond 0.9 seconds eases into a
horizontal prone pose over 0.28 seconds. Upward grav lifts and unsupported
zero-g floating use the same timing; a weightless player retains the pose even
after drifting to rest. Entering zero g preserves an existing prone blend.
Ordinary jump ascent travels against gravity. The descent of an ordinary jump
does not reach that threshold. Climbing, wall bracing and slope sliding interrupt the fall
timer. The fall state changes presentation only: steering, grabbing, pushing,
jump buffering and jumping retain their ordinary rules. Ground contact starts a
0.95-second automatic recovery: finish flattening, pause briefly, push onto hands
and knees, bring the feet under the body, then stand. Prone knees and elbows
face the contact plane, trailing toes point down, and the neck follows the
horizontal torso so the silhouette reads as belly-down. Jumping or catching a
grip interrupts the pose.
Support transport and ordinary collision sweeps still apply; the animation does
not change the player hull. Gravity-facing ceiling contact returns to the normal
supported pose. Leaving weightlessness while traveling against gravity blends
back to the ordinary airborne pose over 0.28 seconds.
The same state runs in the reflected gravity frame. Respawn clears it.
Regression coverage lives in `tests/jumping-free-fall.test.mjs`.

A fading pushing pose remembers its collider identity until the blend reaches
zero. Reacquiring that same surface resumes the existing blend, including after
a brief gap in a moving box, ball or bot contact. A new surface starts its own
blend. This memory is presentation only: missing contacts release physical forces
immediately, and jumping or turning away still clears the pose.

Sliding uses the same blended locomotion pose on contact and release. The raw
`sliding.active` flag must not instantly replace the falling or running rig;
the slide amount blends both the body pose and its foot-plane correction. The
finished feet still clear actual terrain. This matters when a falling player
repeatedly touches a ball as it rolls away: real contact gaps can occur without
the limbs snapping back and forth. A separate wall brace keeps its own contact
and release blend when a slope contact starts, and both poses compose through
their existing weights.

Development builds observe the final player state after each physics step with
`JumpingMotionDiagnostics`. For a production build, open the game with
`?motionDebug=1` to enable the same observer. It reports repeated contact/state
reversals, abrupt joint reversals relative to the body, and physical root
oscillation separately. These are diagnostic candidates, not proof of a bug.
Intent changes, pauses, new players, respawns and teleports break the detection
window. Ordinary single transitions and continuously changing surface identities
do not count as repeated reversals.

Each episode emits one `[Jumping motion]` console warning. In browser developer
tools, `window.jumpingMotion.read()` returns detached copies of the most recent
two seconds (at most 240 samples) and the last eight reports, including level ID,
inputs, positions, velocities, contact identities, blend weights and local joint
positions. Reports survive pauses/restarts so they can be inspected afterward;
they remain in memory and are never sent to a server. Production play without
the flag does not sample poses for diagnostics.

The observer never changes physics or filters the rendered pose. Use captures to
find and fix unstable contacts or interrupted blends at their source. Do not
hold a physical contact alive, delay controls, move the player root, or smooth
planted feet away from their surface merely to conceal an oscillation.

## Gravity fields

Gravity plates define fixed rectangles and use standard switched or Always on
power. They obey EMP independently of logical relay outputs. Player and loose
prop acceleration is the area-weighted mean of the gravity field across the body.
Each overlapping active device contributes equally at a point; ordinary gravity
applies outside all fields. This prevents a center-point threshold from abruptly
reversing a large object. The player uses its tapered collision hull, rotated
boxes use their square hull, and balls use exact disk/rectangle intersection.
Rope particles use their local field multiplier with the rope's usual baseline.
Grips and authored climbing paths retain their constraints; release returns the
body to free movement. Field forces act through the center of mass.

Unsupported players in the five-percent gravity deadband experience air
resistance on both velocity axes: exponential drag at 0.6 per second halves
drift in about 1.16 seconds. Releasing horizontal input retains momentum for
this gradual slowdown; steering still uses the ordinary air acceleration.
Grounded and climbing controls retain their existing contact rules. Loose props
retain their existing free-drift behavior.

A free-flight collision in reduced gravity with an unsupported prop, or a
weightless collision, exchanges normal momentum using the player's mass and
the prop's mass and rotational inertia. The player slows or recoils,
and off-center box impacts also impart spin. Relative swept contacts work even
with neutral input or when the prop is approaching the player; solid barriers
occlude them. Solver substeps recompute remaining closing speed so an impact
cannot apply its initial momentum repeatedly. Ordinary grounded shoves, bracing
and gravitational loads continue through the existing contact-force policy.
This applies to floating props in weak gravity as well as zero gravity.
Regression coverage lives in `tests/jumping-zero-gravity.test.mjs`.

Ropes can be caught from either player orientation. Up and Down follow the
visible rope's vertical direction, including a rope floating upward from a floor
anchor. Nearly horizontal spans retain their last material direction. A player's
load uses the gravity averaged across their body, scaled to the rope's existing
baseline, independently of the field at their hands. The anchor stays fixed.

When gravity reverses during a rope hold, the body hangs from the retained hand
grip and turns over 0.45 seconds. The actual rotated hull is checked along the
arc; a blocked turn waits for clearance while climbing or release remains
available. A five-percent gravity deadband retains the current orientation near
zero. Releasing during a turn continues around the body center in free flight.
Turning motion and changes in the catch pose never add release momentum.
Jump pushes against current gravity, carrying real rope motion; letting go or
climbing off the free end preserves momentum without a forced downward kick.
Ceiling and ceiling-slope transfers use the existing reflected contact, support
and clear-path checks. Regression coverage lives in
`tests/jumping-rope-gravity.test.mjs` and
`tests/browser/jumpingRopeGravity.spec.mjs`. The rope CPU benchmark includes
matched upright and reverse-gravity player loads:
`node scripts/benchmark-jumping-ropes.mjs`.

Gravity that pulls away from the current footing releases ground and slide support
immediately. On reaching a solid surface in the gravity direction, the player
turns to plant their feet there, preserving the occupied body space and lateral
momentum. Under negative gravity, ceilings and the undersides of solid objects
support walking, running, crouching and downward jumps where grip permits;
steeper undersides slide under the same friction rules. The movement controller
uses reflected geometry, retaining ordinary friction, slopes and swept collisions.
Leaving the field restores ordinary acceleration without resetting velocity;
the player returns upright on landing on a normal floor. Player vertical
speed is bounded to ±1100; props use the solver's ±1000 integration bound. There
are no special field collision exceptions.

Pressure and gravity plates support ceiling-facing artwork via optional
`ceiling: true`. Gravity flipping selects the rectangle's emitter edge without
changing the field or its multiplier. Ceiling pressure plates use the same press
debounce, modes and EMP behavior, reading inverted feet and a prop's supported
top edge. Prop support follows the contact normal in its gravity direction;
it is not inferred from merely overlapping a switch. Mounted pressure plates
follow a platform's top or underside, carrying supported passengers with the
existing swept motion and obstruction rules. Regression coverage lives in
`tests/jumping-ceiling-plates.test.mjs`.

The runtime partitions at most 16 active rectangles into nonoverlapping vertical
strips, merging adjoining equal-gravity spans. This rebuilds only when device
power changes. Body queries reject distant strips/spans, use a fast full-coverage
path, and clip only partial coverage. Polygon clipping reuses bounded scratch
buffers; balls use an analytic area integral rather than particle sampling or
pixel reads. Rectangle size does not change simulation cost.

Matter keeps its existing sleeping and collision solver. Field changes wake
sleeping props; a `beforeSolve` hook corrects only gravitational integration after
Matter's sleep decision and before collision detection. It shifts the integrated
position and velocity while retaining the pre-step position. Applying a persistent
external force before Matter's sleeping decision would keep settled objects awake
indefinitely. Props at a reverse-gravity ceiling can sleep normally and wake on
power changes or contacts. Sleeping support is verified against current hulls
with a sub-pixel contact tolerance. A prop that loses support wakes. Unsupported
props under very weak nonzero acceleration cannot enter speed-based sleep;
ordinary-gravity props wake if that sleep test fires while unsupported. Standing
on a falling prop does not anchor it.
Field changes also wake resting ropes. Regression coverage lives in
`tests/jumping-prop-sleep.test.mjs`, `tests/jumping-gravity.test.mjs` and
`tests/browser/jumpingGravity.spec.mjs`. The reproducible CPU benchmark is
`node scripts/benchmark-jumping-gravity.mjs`; it is not a rendering/FPS guarantee.

Field visuals are separate from physics. Gameplay draws no filled rectangle or
direction grid. At most 96 tiny dust motes share the visible view, with at most
64 per plate. Motes keep a 2.5-raster-pixel minimum width when zoomed out and
use contrasting day/night ink with the existing minimum-exposure pass.
World-anchored cells are culled before drawing; large fields and
zoomed-out editor views retain the same limit. Seeded positions are evaluated
from `activeTime`, without particle integration, collision checks, light sources,
sprites or image buffers. Their direction follows the compiled local field, so
overlaps can show floating dust instead of competing arrows. Edge and lifetime
fades keep the rectangle from acquiring a hard visual boundary. Pausing freezes
the effect; EMP and power changes suppress it immediately. The studio retains
an outline for authoring. `node scripts/benchmark-jumping-gravity-render.mjs`
measures Canvas draw submission against a local Vite server on port 4176;
`GRAVITY_URL` can select another server. GPU completion and lighting passes are
excluded from that isolated benchmark.

## Player-only force fields

Active force-field rectangles are appended only to the player's contact world.
They use the existing swept hull, support, wall, crouch and reflected gravity
controller. Their ledges are disabled because a beam has no physical lip.
Physical rope obstacles are kept separately from player obstacles, including in
reverse gravity. Field geometry never enters Matter, prop preparation, robot
navigation or sight, mechanism obstruction geometry, or lighting casters.
Player transport from lifts, props and bots still sweeps against active fields;
the transporting object itself can pass through when it has room to separate.

Always on and standard switched fields obey EMP. Enabling a field while the
player's current body (including a climb or gravity-turn pose) overlaps it waits
for clearance, rather than resolving a new solid through their body. Removing
power removes collision immediately and releases unsupported footing normally.
At most 40 fixed rectangles add collision work. Artwork uses simple Canvas fills
with two ripples of at most 24 segments and eight time-evaluated sparks per beam;
no particle simulation, blur or
extra light source is involved. Coverage lives in
`tests/jumping-force-field.test.mjs` and `tests/browser/jumpingForceField.spec.mjs`.
