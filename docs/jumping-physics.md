# Jumping game contacts

The player uses the custom movement controller for its existing acceleration,
charged jumps, slope traction and climbing. Matter simulates loose props. Their
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
Body contacts also transfer normal load while airborne. A player wedged between
a ball and a wall can therefore displace the ball and regain footing. Requested
motion away from a contact does not cancel the weight on it when another wall
prevents separation. These contacts use the same swept player hull as movement.
Ball settling drag, including the stronger pressure-plate drag, applies only
without an active player load or shove. Otherwise it can cancel the force on a
large ball every physics step and leave the player suspended beside a wall.
The normal settling behavior resumes when the player releases contact.

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

Shovebots recheck their current wheel support independently of driving. When a
prop moves out from under a wheel, the chassis settles toward the available
support with bounded tilt and downward motion, including during idle recovery.
Settling checks the complete hull and uses the same player displacement rules as
driving. The drive query retains its short support reach and cliff avoidance;
EMP pauses both driving and settling. Regression coverage lives in
`tests/jumping-robot-settling.test.mjs`.

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

Lighting the goal opens the exit. Entering the back-wall door locks scoring and
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
