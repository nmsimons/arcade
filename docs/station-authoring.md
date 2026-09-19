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

Cargo authoring and runtime construction share `CARGO_PHYSICS`: module 23/.65,
salvage 22/.65, core 27/1.8 (radius/mass). These preserve effective gameplay weights,
not the unused older .8/1.4/2 values. Validated constructors attach explicit body
identities; collision and both player/bot tether solvers share mass/capability
helpers. Rendering/save ID fields remain compatibility adapters.
The player winch retains its historical minimum inertia of 1 for tiny asteroids;
this does not override cargo weights or collision/maintenance-bot mass.
