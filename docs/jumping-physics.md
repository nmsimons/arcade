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
Body contacts also transfer normal load while airborne. A player wedged between
a ball and a wall can therefore displace the ball and regain footing. Requested
motion away from a contact does not cancel the weight on it when another wall
prevents separation. These contacts use the same swept player hull as movement.
Ball settling drag, including the stronger pressure-plate drag, applies only
without an active player load or shove. Otherwise it can cancel the force on a
large ball every physics step and leave the player suspended beside a wall.
The normal settling behavior resumes when the player releases contact.

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

Ledge grabs, ladder exits, rope transfers and lowering over an edge share the
terrain's actual exposed top corners. Inset towers and shelves within a single
polygon work like separate terrain pieces. Climbing exempts only the supporting
corner from the standing-body hull; ceilings and other parts of the same polygon
still obstruct the climb.

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
