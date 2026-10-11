# Jumping button and light puzzle specifications

These seven reusable components combine buttons, indicator lights, and logic
relays to operate a machine or unlock a route. Their challenges are changing
lamp patterns, satisfying relationships, arranging loads, and preparing a
crossing. They should add variety after the existing binary-number puzzles.

Each component can become a small level, a reusable studio template, or part of
a larger level. The circuit and central decision are requirements. The setting,
dimensions, materials, and route suggestions are starting points to adapt to the
requested level. Geometry and medal times must come from playable prototypes.

Use this alongside [Making a fun jumping level](jumping-level-design.md),
[Jumping level files](jumping-levels.md), and
[Jumping game contacts](jumping-physics.md). Those documents govern authoring,
movement, contact, and validation. These components use existing mechanics.

## Requesting a component later

Refer to this file and a component name, for example:

> Make a small level using Transfer the load from
> docs/jumping-logic-puzzles.md.

> Add Door versus bridge from docs/jumping-logic-puzzles.md to this level.

> Make a reusable studio template for the Lights Out panel from
> docs/jumping-logic-puzzles.md.

Specify a collection or target level when one matters. For a set of new levels,
give each component its own central role rather than putting all seven in one
room. Lights Out panel, Transfer the load, and Door versus bridge are the first
choices for a varied set: panel reasoning, physical preparation, and spatial
sequencing respectively.

## Shared mechanics and presentation

Letters such as A and B refer to a button's active state, not whether its face
is physically depressed. A value of 1 means active; 0 means inactive.

- **Toggle** reverses state once per press after release. Use it for revisable
  panel choices, with explicit `startsOn` values.
- **Pressure** stays active while the player, a crate, or a ball loads it. Use it
  when continued physical occupation is the puzzle.
- **AND** requires every connected input. **OR** requires any connected input.
- **XOR** in this game requires exactly one connected input. With two inputs it
  also computes ordinary binary parity. For parity across more inputs, chain
  two-input XOR relays; a single multi-input XOR is not equivalent.
- **NOT** means reversing a relay's result. A single-input OR relay with
  Reversed implements NOT of that input. Reversed two-input XOR tests equality.

Use dedicated logic relays for intermediate conditions. Their positions arrange
the studio diagram; they are invisible during play. Give relays descriptive
names and arrange their diagram from inputs toward outputs. Keep the wiring
acyclic; it settles immediately and supplies no programmable delay or memory.
Persistent choices come from Toggle or Switch buttons, and sequencing comes
from movement and geometry.

Use wall lights to display the actual conditions controlling the machine. A
condition relay can feed both its wall light and the final mechanism, so visible
feedback and activation share the same rule. Wall lights can instead be relays
when that makes the wiring simpler; enable their Relay setting explicitly.
An output controlled by several conditions must combine those inputs with AND.
Set a controlled lift or exit to Switched; gates already use switch inputs.

Use the existing indicator palette, with short labels and placement to explain
meaning. A lamp labelled "overload" indicates a problem when lit; it does not
require new lamp colors. Keep input states, condition lamps, and the relevant
machine visible together where practical. Indicators report logical conditions,
not completion of gate movement, lamp fades, or obstruction safety holds.

Buttons must be reachable and pressable with ordinary movement. Provide room
to release a Toggle before pressing it again, and avoid requiring the player to
walk over other Toggles merely to reach the chosen control. Do not introduce
numeric passwords, hidden timing windows, light sensors, or new interaction
controls to make these circuits work. Spotlights may provide atmosphere, but
the puzzle must remain readable through its wall indicators and physical state.

## Lights Out panel

**Central decision:** changing one button repairs some lamps while disturbing
others. The player must make all four lamps active.

Use four Toggle buttons, A through D, four condition lamps, and a gate or
switched exit. Every button changes at least two lamps. Provide brief guidance
such as "all four lit" and show the lamps from the button area.

### Circuit and starting state

```text
L1 = XOR(A, B)
L2 = XOR(B, C)
L3 = XOR(C, D)
T  = XOR(A, C)
L4 = XOR(T, D)
Ready = AND(L1, L2, L3, L4)
```

Each XOR above has exactly two inputs. L1 through L4 feed their matching lamps;
Ready operates the gate or exit.

Start A on and B, C, D off. Lamps L1 and L4 begin lit, while L2 and L3 are dark.
The unique solved state is A off, B on, C off, D on. From the starting state,
toggling A, B, and D solves the panel in any order. These letters and the solved
state are authoring information, not a password to print on the wall.

### Layout and recovery

Begin with a compact panel on generous footing. Use button and lamp alignment,
or brief connection labels, to make experimentation understandable. Show the
first press affecting several lamps. A later version can distribute controls
across nearby ledges, provided the lamp board stays useful from those positions.

The dependable solution lets the player revisit every control. A faster route
uses the three necessary toggles with fewer stops or a direct jump between
controls. Mistakes remain reversible; falls return to the panel without clearing
its choices. Restart restores the authored starting state.

### Acceptance

Check all 16 input states: only 0101 in A, B, C, D order activates Ready. Confirm
each button changes the intended two or three lamps, the initial lamps match the
spec, and revisiting a button reverses its effect after release. Play the
three-toggle solution and recovery from an unnecessary press.

## Agreement puzzle

**Central decision:** several relationships must hold at once. The player can
solve the puzzle with either of two complementary configurations.

Use four Toggle buttons, three condition lamps, and a switched lift or gate.
Label the lamps "A B same", "B C different", and "C D same". The labels describe
rules rather than disclosing a fixed setting for each button.

### Circuit and starting state

```text
SameAB = NOT XOR(A, B)
DifferentBC = XOR(B, C)
SameCD = NOT XOR(C, D)
Ready = AND(SameAB, DifferentBC, SameCD)
```

Use two-input XOR for every comparison, with Reversed on the equality relays.
Each comparison controls its matching lamp; Ready operates the machine.

Start all four buttons off. The two "same" lamps begin lit and the "different"
lamp begins dark. Both 0011 and 1100 satisfy the rules. Keep both solutions
valid; neither is a hidden preferred answer.

### Layout and recovery

Place comparison lamps between the controls they describe or group them beside
the machine with readable labels. Let the player observe that changing a shared
button, B or C, affects two relationships.

A compact arrangement teaches the rules. A larger version can make the two
solutions require different journeys: one reaches A and B, the other C and D.
Use differences in traversal to create a dependable route and a faster option.
All choices remain reversible, and a fall preserves the current configuration.

### Acceptance

Check all 16 states: Ready is active only for 0011 and 1100. Complete both
solutions with normal controls. Confirm matching includes two inactive buttons,
so the initial equality lamps and labels are accurate. Check that every control
remains accessible after a mistaken choice.

## Exactly two loads

**Central decision:** any two occupied plates power the machine, but a third
load stops it. Positioning the loads matters more than selecting a secret pair.

Use three Pressure plates, two movable crates, a switched lift, and wall lamps
labelled "ready" and "overload". Each plate must be large enough to support a
crate reliably. Leave separate walking and boarding space outside the plates.

### Circuit and starting state

```text
AB = AND(A, B)
AC = AND(A, C)
BC = AND(B, C)
AtLeastTwo = OR(AB, AC, BC)
Overload = AND(A, B, C)
Clear = NOT Overload
Ready = AND(AtLeastTwo, Clear)
```

Ready powers the lift and the readiness lamp. Overload powers the overload
lamp. Start all plates unloaded, with both crates on stable staging ground and
neither status lamp active. Optional input lamps can show which plates are
currently occupied.

### Layout and recovery

Let the player push both crates onto any pair of plates and reach the lift
without loading the third. All three pairs must work. Different pushing
distances or approaches can make one pair convenient and another faster with
careful movement. Do not distinguish the pairs through an unexplained mask.

Stepping onto the unused plate demonstrates overload: Ready turns off and the
lift pauses in place. Stepping away restores the condition and resumes the
lift. Provide room to retrieve a crate and change pairs without trapping it.
Do not require a crate to bridge two plates or depend on a marginal overlap.

### Acceptance

Check all eight input states: Ready is active only for 110, 101, and 011;
Overload is active only for 111. Physically load and use each pair from a fresh
start. Test a third load, release, paused boarding, and a displaced crate.
Verify that the arrangement remains stable after the player walks away.

## One from each bank

**Central decision:** select one option in each of two groups. Multiple choices
within either group invalidate that group's selection.

Use two banks of three Toggle buttons, A through C and D through F. Name the
banks for a plausible machine, such as "supply" and "destination". Each bank
has a readiness lamp, with a final lamp beside the controlled machine.

### Circuit and starting state

```text
SupplyReady = XOR(A, B, C)
DestinationReady = XOR(D, E, F)
Ready = AND(SupplyReady, DestinationReady)
```

Here the game's multi-input XOR is intentional: exactly one option must be
active in each bank. Start every button off. All nine combinations selecting
one supply and one destination are valid. Ready activates a gate, lift, or
switched exit.

### Layout and recovery

Separate the banks visually and place each bank's readiness lamp beside it.
Give options useful differences in access: an ordinary approach to one choice,
a quicker jump to another, or an option convenient on the return journey. The
player should be deciding which option suits the route, not guessing which
pair the author accepts.

An optional extension lets a selected option open its own side passage. Its
condition is `AND(option, that bank's readiness)`, so an invalid multiple
selection does not power several passages. Preserve all nine valid pairs and
keep controls reachable when their bank is invalid.

The player can correct an extra selection by revisiting its Toggle. A fall
preserves selections. No irreversible Switch button or automatic mutual
exclusion should silently change the specified behavior.

### Acceptance

Check all 64 states: exactly nine activate Ready. Play routes using each option
at least once, including the ordinary route and any advertised shortcut. Test
zero, one, two, and three active choices in either bank and recovery from an
extra selection. Include initial preview and restart behavior.

## Transfer the load

**Central decision:** establish a replacement load, confirm the handoff, then
recover the original crate for another purpose.

Use Pressure plate A with a movable crate, Pressure plate B with a ball
receiver, a Toggle release button R, a ball retaining gate, a delivery gate,
a switched departure lift, and status lamps. The retrieved crate should become
a useful step to the lift's loading bay, so retrieving it serves the route.

### Circuit and starting state

```text
DeliveryOpen = OR(A, B)
Release = AND(A, R)
TransferReady = AND(A, B)
DepartureReady = AND(B, NOT A)
```

DeliveryOpen powers a gate along the ball's delivery path. Release powers a
separate retaining gate on a shallow chute. TransferReady lights "handoff
ready"; DepartureReady powers the lift and a lamp labelled "crate clear".
Optionally mirror DeliveryOpen beside its gate.

Start A and B unloaded, R off, the crate accessible near A, and the ball
securely retained. Both gates begin closed and the lift begins stopped. Placing
the crate on A opens the delivery gate. Toggling R then releases the ball.
When the ball settles on B, the handoff lamp lights. Removing the crate from A
leaves the delivery gate powered by B and activates the departure lift.

### Layout and recovery

Show the chute, receiver, and status lamps from a safe observation point. Give
the ball a generous ramp and a physical stop that keeps its actual resting
center over B. The retaining and delivery gates must have clear travel paths.

The ordinary route prepares A, releases the ball, observes the handoff, retrieves
the crate, and uses it to board. A faster route reduces the player's travel
between release, retrieval, and boarding. It still relies on dependable ball
arrival rather than a lucky bounce or an exact timed press.

Removing the crate too early should close the gates safely and turn off the
departure condition. Restoring the crate must let a stalled delivery continue
when practical. Give the player access to a misplaced crate and the ball's
receiver. The lift cycles normally while powered; a missed boarding attempt
must allow another trip. Restart restores the complete delivery setup.

### Acceptance

Check all eight A, B, R states against the four stated conditions. From a fresh
start, complete the entire delivery with normal controls. Test early crate
removal, replacement, release-button reversal, late arrival, and missed boarding.
After retrieving the crate, confirm the ball keeps B active and the delivery
gate remains powered. Verify the crate's new use and the receiver's stability.

## Door versus bridge

**Central decision:** establish a crossing first, then convert the room into its
exit configuration after reaching permanent ground on the far side.

Use Toggle A on the near side, Toggle B on the far side, a retracting horizontal
gate serving as a bridge, an exit gate or switched exit, and two status lamps.
Both buttons start off. Put B on a fixed landing clear of the bridge's travel.

### Circuit and physical behavior

```text
CrossingReady = XOR(A, B)
DoorReady = AND(A, B)
BridgeRetract = NOT CrossingReady
```

CrossingReady controls "crossing ready"; DoorReady controls "door ready" and
the exit gate or exit. A horizontal gate extends when closed and retracts when
powered open. Therefore its activation must be BridgeRetract, not
CrossingReady. Connect A and B directly to that gate using XOR with Reversed,
or feed it an equivalent reversed CrossingReady relay.

| A | B | Crossing lamp | Bridge after travel | Door |
| --- | --- | --- | --- | --- |
| 0 | 0 | Off | Retracted | Closed |
| 1 | 0 | On | Extended | Closed |
| 0 | 1 | On | Extended | Closed |
| 1 | 1 | Off | Retracted | Open |

### Layout and recovery

The intended route turns A on, waits for a usable bridge, crosses to the fixed
landing, then turns B on. The door opens as the bridge retracts behind the
player. Show that both controls contribute to the door through labels or lamp
placement. A faster route can jump part of the crossing or approach B directly
from its landing, while still satisfying both buttons.

Give the gap a nonlethal base and a ladder or other dependable return to the
near side. Turning B off restores the bridge while A remains on. Keep B
reachable after the bridge retracts, and keep A reachable through recovery.
The player must be able to release and revisit either Toggle.

Gates start at their authored closed positions, so the bridge initially extends
across the gap even though both buttons off command it to retract once play
starts. Prevent an early crossing with a small access gate controlled by
CrossingReady. That access gate may be omitted if a tested approach gives the
bridge enough time to retract before the player can reach it. Keep this within
ordinary mechanism travel rather than adding a delay or changing initial-state
physics for the level.

Gate safety can delay closure around a player or prop. The circuit must not
depend on that delay or treat the crossing lamp as proof that movement has
finished. Require B to be pressed from permanent footing, with no need to
remain on a disappearing support.

### Acceptance

Check all four states against the table, allowing normal gate travel. Play from
the authored initial geometry, across the bridge, through the door, and back
after turning B off. Test a fall before crossing, after crossing, and after both
buttons are active. Check that gate safety, an obstruction, or an early sprint
does not create a mandatory fragile maneuver or defeat the central sequence.

## Buoyant lever switch

**Central decision:** use a force or physical load to move a visible lever and
change its electrical contact. The same component works with water and grav
lifts.

Use the studio's **Float switch**: one ball with its usual small dark dot, a
straight arm matching the exit lamp post's thickness, and a pivot matching the
wall light's size and face. Keep the artwork simple; the arm's actual movement
explains the switch. The ball has ordinary physical
contacts and buoyancy. Its fixed pivot and travel stops keep it attached.

Choose Raised or Lowered activation, with the contact changing near horizontal.
A small mechanical gap between activation and release prevents chatter. Set an
explicit starting position and keep the ball's entire sweep clear of unintended
obstructions. Adjustable arm length, ball size, travel angle, and horizontal
facing let the switch fit the room. See [Float switches](jumping-levels.md#float-switches)
for authoring and [the physics contract](jumping-physics.md#buoyant-lever-switches)
for movement and EMP behavior.

### Circuit and puzzle variants

- **Automatic fill:** `Fill = AND(Enable, FloatLowered)`. The water lifts the
  ball and stops filling when its contact changes. Draining restores the lower
  contact. Make the cutoff and the resulting route visible together.
- **Water or grav lift lock:** `Ready = AND(ManualButton, FloatRaised)`. The
  player prepares the field or water level, observes the readiness lamp, then
  operates the second control to open a gate.
- **Two reservoirs:** `Ready = AND(FloatRaisedA, FloatRaisedB)`. Separate tanks
  must both reach their conditions. Give each tank a local indicator and the
  final machine a shared readiness lamp.
- **Physical override:** a player or crate lowers the ball against its lifting
  force. The resulting contact controls another mechanism. Review the force on
  the load too: a crate fully inside a grav lift rises with the float. A load
  partly outside the field, or a heavy crate sinking in water, can press it down.
- **Mechanical cycle:** the Lowered contact powers its own grav lift; raising
  the ball removes lift, and dropping it restores lift. Its period comes from
  physical movement and the contact gap. Prototype its stability and readability
  before making boarding or another timed action depend on it.

### Layout and recovery

Teach the arm rising or dropping in a safe, visible setting before combining its
output with other buttons. Use a stable tank, a bounded field, or generous load
placement. Let the player recover a load, revisit pump controls, and retry a
missed boarding attempt. Avoid requiring an exact impact or a trapped prop.

### Acceptance

Play rising and falling activation with both water and a grav lift. Check the
opposite contact mode, a physical load, a blocked ball, stable behavior near the
threshold, and signals combined with buttons through ordinary logic. Test pause,
restart, EMP, initial preview, wiring, duplication, and save/reopen. For automatic
filling and mechanical cycles, verify the physical feedback over repeated
cycles and useful recovery. Review the simple silhouette at gameplay scale.

## Completion criteria for future builds

Before calling a component's level or template complete:

1. Author the map as runtime level JSON in the requested collection. Inspect
   representative existing files and the current schema before creating it.
2. Verify its complete input truth table through the game's switch evaluator,
   including starting states, restart, lamps, and controlled outputs. Inspect
   the studio wiring for incorrect connections and feedback loops.
3. Validate the authored files with the repository tools. Use
   `npm run levels:check` for built-ins; manage collection manifests under the
   level-file contract.
4. Play the intended route, each advertised alternative, and required recovery
   from a fresh start using normal controls. For props, review stability after
   the player releases them and walks away. Check mechanism travel separately
   from logical activation.
5. Review hints, lamps, and machine relationships at normal gameplay scale and
   speed. Show the cause and useful consequence of a first activation. Keep
   clocks and coin meters deliberate rather than adding them to every panel.
6. Establish level medals from completed runs, including a demonstrated faster
   route for gold. Apply the design brief's pacing defaults with judgment.
7. Preserve regression coverage for any shared bug found. Report file
   validation, automated logic or route checks, and actual playtesting distinctly;
   identify any remaining unverified interaction or route.

The circuits define logical behavior. A playable layout must still establish
reachability, readability, dependable physical interactions, recovery, and an
enjoyable route.
