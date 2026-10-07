# Carried gadgets for Untitled Jumping Game

**Design proposal — October 6, 2026. Deferred for later review.**

The player can carry one gadget and choose when to activate it with X. An EMP
should be something the player brings to the right place and uses at the right
moment. The same carrying system could support a boost jump, a grappling hook,
and a remote control car, with other gadgets added only when they create a
distinct movement or mechanism puzzle.

This is a proposal, not the current gameplay or an implementation commitment.
The shared carry mechanic and deliberate EMP activation are the central idea.
The gadget rules below are starting designs; tuning and the listed open decisions
need review before implementation.

Use alongside [the movement and mechanism contract](jumping-physics.md),
[level files and authoring](jumping-levels.md),
[the level design brief](jumping-level-design.md), and
[performance notes](jumping-performance.md). Gadget effects must use the game's
ordinary collision, contact, switch, gravity, and simulation rules.

## Carrying and activation

The player has one gadget slot. Contact collects a gadget when that slot is
empty. When it is occupied, another gadget stays in the world; walking over it
does not replace or consume either item. Coins and the existing clock
collectibles remain independent of the gadget slot.

Carrying a gadget does not occupy the player's hands for movement. The player
can still climb, catch ropes and ledges, push objects, and wall jump. A small
visible attachment at the belt or back identifies the carried gadget without
changing the player hull or movement strength.

A fresh Use press requests one activation. Holding Use must not repeat an
activation, deploy multiple objects, or fire immediately when a gadget is later
collected. If collection and Use occur in the same simulation step, a newly
collected gadget waits for another press. Empty-slot presses do nothing.

Consume a single-use gadget only when its effect actually starts. An invalid
activation, such as a grapple with no reachable anchor or a car with no clear
deployment space, retains the gadget and gives brief feedback. Reusable gadgets
remain in the slot while their tool or deployed object is available.

The first implementation can use consumable EMPs and boosts without a discard
control. Before reusable gadgets ship, choose an explicit way to discard, pack,
or exchange them. Automatic replacement is excluded; that would make accidental
contact change the player's plan.

## Controls and feedback

Proposed bindings are:

| Action | Keyboard | Controller | Mobile |
| --- | --- | --- | --- |
| Use carried gadget | X | X / Square | Tap the carried-item icon |
| Drop from a rope or ledge | Z | B / Circle | Existing downward flick |
| Jump and release into a leap | Space | A / Cross | Existing jump gestures |

Keyboard X currently drops from a rope or ledge. Adopting this proposal requires
moving that action to Z and updating the controls reference. Controller X is
available during play; its existing editor Duplicate binding remains scoped to
the editor.

The carried-item display shows one recognizable icon, a short name, and the Use
binding. Its active state should be readable through shape or text as well as
color. Mobile gets a generous touch target for that icon, visible when an item
is carried, rather than an additional gesture to memorize.

A mobile icon tap produces only Use. It must not also start movement, jump,
detach, or steal an existing movement pointer. Holding a movement finger while
tapping the item remains supported. The icon is outside the canvas gesture
recognizer and uses the same simulation input path as keyboard and controller.

Collection and activation have different feedback. Picking up an EMP must not
show the outage ring or play the power-down sound; those belong to activation.
Show failed use briefly without interrupting play or opening a dialog. A grapple
can highlight its valid target, and remote driving needs a clear control-mode
indicator.

## Time and run state

Using a gadget is gameplay intent and starts the level clock if the run has not
started. Picking one up without acting follows the current collection policy.
Activation does not pause the world. Effects, deployed objects, and the level
timer advance in simulation time; a normal pause freezes them together.

A full restart restores authored gadgets, empties the carried slot, removes
deployed gadget objects, clears their effects, and returns control to the player.
Closing a run or beginning a new playtest also clears its gadget state. Any
reset that preserves the world must preserve collection and inventory state
consistently rather than duplicating an item.

Exit entry locks scoring and further gadget use under the existing exit rules.
Loss of focus, pause, controller disconnection, and touch cancellation clear
pending Use input; resuming must not activate an item held before the interruption.

## EMP

**Single use.** Collect the EMP into the slot. X consumes it and starts the
existing global five-second power outage at the moment of activation.

Preserve the current electrical behavior: machinery and shovebots stop their
powered movement, authored lights fade off, and force fields and gravity plates
lose power. Existing switch, relay, and exit rules still apply. Stopped physical
objects remain obstacles. Ambient light, ordinary player motion, loose-object
physics, ropes, and the level clock continue under their existing rules.

An activation during an existing outage adds five seconds, as an additional EMP
does today. Carrying an EMP alone has no electrical effect. It remains usable
during an outage, allowing a deliberate extension after the player collects
another one into the freed slot.

Useful decisions include freezing a lift at a reachable height, stopping a
shovebot before crossing its path, and removing a player-only field while a ball
continues rolling. Authors must account for gravity plates losing power too;
the same EMP can help one part of a route and complicate another.

## Boost jump

**Single use.** X adds a bounded impulse away from the player's current gravity
direction. It can launch from supported ground or boost an existing airborne
arc. It does not require charging, and it does not reset the ordinary jump's
hold window, buffers, or other movement abilities.

The initial target is a modest, predictable extension: reach the next ledge,
cross a wider gap, or recover from a short jump. Choose the impulse through
playtesting rather than making it an unlimited flight ability. Apply the normal
velocity limits and swept collisions; a ceiling can stop the boost.

The design must define a launch direction inside the zero-gravity deadband.
Using the player's retained orientation is a candidate, not a settled rule.
Rope, ledge, and ladder use should perform the ordinary safe release before the
impulse; unsupported combinations should retain the item and explain the failure.

Do not award multiple impulses for a held button or automatically restore the
item on landing. Distinct artwork must distinguish a carried boost from a
stationary spring or an ordinary jump collectible.

## Grappling hook

**Reusable tool.** Start with clearly marked authored anchors and a fixed reach.
X attaches to an eligible anchor ahead and above the player. The target must be
within range and have an unobstructed hook path. Prefer a stable, visible target
selection rule over requiring precise cursor aiming, especially on phones.

Once attached, horizontal movement swings, Up and Down adjust rope length, X
detaches without a jump, and Jump releases into a leap carrying real momentum.
Keyboard Z, controller B, and the mobile detach gesture remain available for
ordinary release. A missed shot keeps the hook in the slot.

Use the existing rope contact and load rules, including collision with terrain
and gates, support from a contacted wall, and reversed gravity. The attachment
must not pull the player through a barrier or inject artificial swing momentum.
Detach if the anchor ceases to be valid. Limit the player to one active grapple.

Anchors give authors control over readable routes and prevent a new aiming
system from making every ceiling an implicit destination. Arbitrary terrain
attachment, grappling onto props, and firing in every direction are possible
later extensions, not part of the initial design.

Resolve target selection, gravity-relative aiming, length limits, and interaction
with an already-held rope before implementation. Benchmark long ropes and wide
levels before release, including attachment, reeling, swinging, and rendering.

## Remote control car

**Reusable tool with one deployed vehicle.** The item slot holds the remote
while its car exists. The first X press places the car in a clear space beside
the player and transfers movement control to it. Later X presses switch between
driving that same car and controlling the player; they do not spawn another car.
Blocked deployment retains the item and leaves player control active.

The car drives left and right. Start without a jump ability. Give it a small
physical body, finite mass, traction, speed, and limited motor force. It can
load pressure plates and push sufficiently light boxes and balls through real
contacts, while heavy or trapped objects can stall it. It cannot activate a
plate by proximity, force a prop through a wall, or move any object regardless
of its mass.

Returning control leaves the car where physics carries or settles it. It can
hold a pressure plate if it remains supported there; returning to the player
must not pin the car's position. The car cannot collect coins or gadgets, spend
the player's item, or enter the exit on the player's behalf.

While driving, the player stays physically present with neutral movement input.
Gravity, moving supports, and contact from other objects still affect the
player. The world and level clock continue. The camera follows the controlled
subject, and the display clearly identifies Player or Car control. Returning
to the player must remain available even if the car is blocked or offscreen.

EMP disables the car's motor and new powered driving, while its gravity and
ordinary physical contacts continue. Returning control remains available during
the outage. Decide whether an outage automatically returns the camera and
controls to the player or leaves the car selected without propulsion.

Authoring opportunities include low service passages, remote pressure plates,
and delivering a small ball while the player waits near a gate. Resolve packing
or recovering the car, losing it in an inaccessible area, radio range, plate
loading thresholds, and which barriers its body can cross before release.

## Other gadget candidates

These are optional ideas, not additional requirements for the carry system.

| Gadget | Activation | Distinct use |
| --- | --- | --- |
| Weighted puck | Drop or toss one small physical weight. | Deliver a plate load without moving a full-size crate; use rolling and falling routes. |
| Decoy | Place a temporary target that attracts a shovebot. | Redirect a chase or charge so the bot clears a path or pushes another object. |
| Portable spring | Deploy a spring pad at a valid supported position. | Make placement and access to the launch point part of the puzzle. |

The puck needs finite mass and the normal plate/contact rules. A decoy needs
clear targeting priority, duration, and EMP behavior. A spring needs a supported
deployment rule, bounded launch strength, and a decision about whether props can
trigger it. Each should earn its place with a puzzle the existing tools do not
already express well.

## Level files and editor support

Gadgets and grapple anchors belong in runtime level JSON. The studio should
place, name, inspect, move, duplicate, undo, preview, save, and reopen them using
the existing object workflow. Bound authored counts, validate references and
parameters, and render recognizable previews without starting their effects.

The current EMP activates on contact. Changing that behavior globally would
change existing routes and medal timing. The preferred new EMP experience is
carried activation; a compatibility option is to preserve existing on-contact
EMPs unless explicitly migrated, while new studio placements default to carried
EMPs. Decide this policy before selecting the exact schema or updating levels.
Do not silently reinterpret existing files.

Any new format must distinguish automatic collectibles from carried gadgets,
preserve existing file loading, and keep inventory, remaining uses, active
grapples, and deployed cars in run state rather than the authored definition.
Update the supported schema and authoring guide when implementation ships.

Introduce one gadget at a time. Use a visible consequence to teach activation,
then combine it with movement or machinery. Consider what happens after an early
EMP, a wasted boost, a missed hook, or a stranded car. Use the level design brief
for recovery and playtesting; establish medal times from completed runs after
changing an existing level's available actions.

## Implementation sequence

1. Add the one-slot runtime state, Use input, collection feedback, carried-item
   display, controls reference, and a carried EMP. Review legacy EMP migration.
2. Add the boost and tune its height, gravity direction, and safe releases.
3. Prototype the remote car and its contact, switching, camera, and recovery rules.
4. Prototype the grapple with authored anchors and verify rope performance.
5. Revisit the optional gadgets only after testing the earlier tools in actual
   levels.

This sequence is a proposed way to evaluate the ideas, not a commitment to ship
every gadget. Reusable tools require the explicit discard or exchange decision
before they become general level-authoring features.

## Verification before release

Shared checks must cover one-slot collection, occupied-slot contact, fresh Use
presses, held-input rejection, same-step collection, invalid activation,
restart, exit entry, pause, lost focus, and simultaneous mobile movement and use.
Verify keyboard and controller mappings in play and in the editor.

For EMP, verify no outage on collection, the full five seconds on activation,
extensions, stopped machinery, switches, exits, lights, force fields, and gravity
plates. Existing automatic EMP behavior needs regression coverage while supported.

For boosts, verify ground and airborne use, ceilings, reversed and zero gravity,
normal jump holds, safe release from grips, and bounded speed. For the car, verify
blocked deployment, real plate loading, limited pushing, stalls, slopes, EMP,
camera/control switching, and continued player physics. For grapples, verify
occlusion, stable targeting, rope collisions, reeling, momentum on release,
moving geometry, and gravity changes.

Playtest fresh starts with normal keyboard, controller, and iPhone controls.
Review readability, timing decisions, alternatives, and recovery separately
from automated correctness. Compare performance with the current game in wide
levels, rope scenes, and rooms containing many mechanisms. Cosmetic feedback
must not require unbounded particles, new lighting passes, or full-level work
each frame.

## Decisions to revisit

- Legacy EMP compatibility and which existing levels should migrate.
- How to deliberately discard or exchange a reusable gadget with accessible
  keyboard, controller, and mobile controls.
- Boost impulse, zero-gravity direction, and permitted grip-release states.
- Grapple range, target ranking, anchor placement, and minimum/maximum length.
- Car dimensions, motor force, traction, plate loading, range, recovery, and
  behavior when an EMP interrupts driving.
- Whether a deployed spring or puck frees the slot immediately, and how many
  such deployed objects a run permits.
- Which additional gadgets create enough distinct play to justify implementation.
