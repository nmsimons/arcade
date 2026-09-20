# Station authoring

- `stationIds.ts`: stable room, physical gate, circuit, cargo/entity and milestone IDs.
- `stationDefinitions.ts`: Ring and campaign content composed once for all consumers.
- `campaignWorld.ts` / `stationLayout.ts`: typed authored geometry, berths and routes.
- `stationProgression.ts`: ordered objectives, region prerequisites and fixed
  circuit consumers. Developer jumps and power wires derive from these same
  relationships. Recording triggers reference the corresponding circuit/flag.
- `stationExceptions.ts`: named introductory safety, early/final radiation and
  encounter-clearance exceptions. Values preserve the original topology/difficulty.
- `stationValidation.ts`: duplicate/missing IDs, dangling room/gate/circuit/flag
  references, invalid power targets, ordered prerequisite cycles and physical
  spawn/receiver placement checks. Negative tests deliberately corrupt each class.

Objective order is guidance, not a new lock on out-of-order exploration. Abstract
milestones are independent of physical doors. All authored socket doors remain
powered by the original cells; blast barriers still require the blaster. Existing
reachability, cargo clearance, Haven route, medical bypass, wire routing and
Ignition Cradle tests remain the geometry-level acceptance tests.

Main-map exposition must be restrained. Keep physical recordings (`RECORDS`) short
and about character/history, not a walkthrough. Do not explain training mechanics,
equipment locations, routes, receiver solutions or things the player can discover.
`stationWayfinding.ts` supplies one painted destination sign per main regional
approach, including Breach Anchorage. Reuse its lettering, color and solid arrow;
keep text upright and point the arrow along the actual entry passage. Short line
wraps fit narrow tunnels. Do not add signs for every room, puzzle or pickup.
Room-name labels belong on the survey map and HUD, not on the flight-world floor.
Check the whole sign footprint against closed-door geometry and inspect powered
conduits at both desktop and narrow flight scales when changing placement.
Control hints are permanent world stencils, never proximity-triggered HUD cards.
`campaignFloor.ts` puts Dock in Haven's center only once its socket is fully
retracted, and Call Haven at discovered empty berths. Logs and Haven's tether
link have no button hints; training teaches tether use. Offline logs retain their
equipment-status stencil. Preserve sparse industrial
labels, not floor lesson blocks. All recorders share the same model, and training,
station logs and Haven use `TetherInfo` for their deliberately tethered messages.
A record's circuit/flag is an availability condition; only a tether connection
downloads it. Flush recorders (`floorMounted`) use the same art but cannot obstruct cargo routes;
freestanding terminals retain solid housings. Give each story entry a reachable
reader and test sight lines. Haven's greeting uses its retiring center socket.
Preserve retired download IDs in `RETIRED_RECORD_IDS` for save compatibility,
without restoring their fixtures or including them in the journal/completion count.
Training geometry, hopper processing
and floor instructions are isolated in `training.ts` / `trainingRender.ts`, while
flight, weapons, tether physics and input use the same session as the expedition.
Write training copy as mining-pilot induction placards and instructor briefings,
limited to exercises in the bay, never references to the expedition. The dispenser's
rails share their rendering/collision geometry. Feed only white parent rocks;
red material must be exposed by fragmentation. Preserve outlet interlocks and
stock limits when changing its cycle. Hoppers reuse Haven's
mining-gun simulation, and the practice door uses the shared door model/colliders.
Station and training power cables and receiver current share `powerRender.ts`;
changes to the electrical visual language should apply to both.

Cargo authoring and runtime construction share `CARGO_PHYSICS`: module 23/.65,
salvage 22/.65, survival pod 24/.9, core 27/1.8 (radius/mass). These preserve effective gameplay weights,
not the unused older .8/1.4/2 values. Validated constructors attach explicit body
identities; collision and both player/bot tether solvers share mass/capability
helpers. Rendering/save ID fields remain compatibility adapters.
The player winch retains its historical minimum inertia of 1 for tiny asteroids;
this does not override cargo weights or collision/maintenance-bot mass.

`survivalPods.ts` owns all twelve pod IDs, their one-to-one ward cradles, the
four dispatched spawn locations and the rescue reward. Keep both medical rows
open toward the central tow lane and leave a central entrance from the lower
service tube. Cradle housings must not overlap their own cargo circles. All
twelve cradles have physical ward-bus feeds, including the four empty ones.
Run both pod extraction and conduit-routing tests after changing this layout.
Freight hold six is the first pod encounter; the former Breach pod now waits in
Refuge Approach. Keep the opening Breach and Access Tunnel free of pod spawns.
The pod's glass and medical cross are hull-face markings, projected and culled
with their parent face rather than independent meshes in the depth sort.

`campaignWorld.ts` also owns the shared access/departure centerline and outer
lock. The plain door stays fully sealed until Haven's authorized final launch;
core power alone cannot open it. It has no cell circuit or destructible barrier.
Rendered leaves and collision share `doorPanels`. Launch clearance checks omit
only those leaves, not other obstructions.
Keep the folded 70-unit Haven sweep clear all the way to the departure endpoint.
New-campaign spawning uses `newExpedition`; explicit berth staging still uses
`freshExpedition`, with Haven active. Real new games start with Haven dormant,
and death resets to the Access Tunnel until the central tether socket activates
her. Keep that blue socket at Haven's center, reachable through the deployed
ring's openings. It stays out during the first conversation, then retracts
permanently on disconnect. The internal room ID `arrival` is retained for save compatibility.
