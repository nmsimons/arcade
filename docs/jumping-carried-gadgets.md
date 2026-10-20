# Carried EMP and repulsor rifle for L.A.B. Experiments

**Prototype contract — October 20, 2026. Implemented on `codex/carried-gadgets` for review.**

This proposal focuses on two reusable tools: a carried EMP projector and a
repulsor rifle. The player deliberately picks up, carries, fires, and drops one
tool at a time. Equipping a sleeve preserves normal traversal. Tools belong
to their authored level and never enter a campaign inventory.

The behavior below is the starting contract for the playable prototype. Numerical
tuning and control ergonomics still require playtesting. The editor can place
both tools under **Gadgets**; **Stress tests · Development → Tool Bench** provides
a sandbox. Existing campaign levels and automatic EMP collectibles retain their
behavior. This revision supersedes the earlier automatic-pickup, hands-free gadget proposal.
Boosts, grapples, remote cars, and other gadgets are deferred outside this scope.

Use alongside [the physics contract](jumping-physics.md),
[level files and authoring](jumping-levels.md),
[the level design brief](jumping-level-design.md), and
[performance notes](jumping-performance.md).

## What these tools should add

The EMP makes choosing when to interrupt a system part of play. The rifle lets
the player apply force from a position where bodily pushing is unavailable.
Red fields add a further decision: where is the tool useful, and where must it
be left behind? Movement should retain its existing responsiveness.

Evaluate distinct demands such as interception, changing a moving object's
trajectory, preparing access, interrupting machinery, and choosing a firing
position. Adding another delivery to a plate does not by itself establish a
new idea. A larger level can coherently test familiar skills. A short level can
concentrate on one satisfying action. Every tool encounter need not require a
pickup, transport, drop, climb, and retrieval sequence.

## Pickup and drop

There is one carried tool and no stowed slot. Walking over a tool never collects
it. Coins and automatic clock/EMP pickups retain their existing collection rules.
A fresh **Pick up / Drop** press does one of the following:

- With empty hands, pick up the highlighted reachable tool.
- With a tool held, drop that tool. The same press cannot pick up its replacement.
- With neither a reachable tool nor a held tool, do nothing.

Start with a 60-unit reach measured from the hands to the nearest part of the
loose tool; this is a tuning value. Highlight one eligible tool, choosing the
nearest and breaking ties by stable object identity. Require an unobstructed
transfer into a clear carry pose. Terrain, gates, other solid objects, and active
red fields can prevent pickup. Being close through a wall is insufficient.
Pickup may occur from ordinary footing or free flight, including in water; it
cannot occur while a hand-dependent climb, hang, pull-up, or gravity-turn
transition is in progress. It never silently releases a grip.

Dropping places the complete tool just clear of the body, near its actual held
position. An aimed tool stays on its held side rather than being
moved through the torso to match facing. Test a short, swept outward placement
path; do not search across a wall or field for a convenient empty destination.
If there is no legal placement, retain the tool and show a brief blocked cue.
Turning or moving into clearer space provides another attempt. Ground support
is not required: an airborne drop is allowed. It inherits actual world travel
velocity without a throwing impulse, aim-directed launch, or extra recoil. Placement
follows the player's current orientation under reversed gravity and retains that
orientation near zero gravity.

Loose tools are finite-mass physical objects with ordinary gravity, contacts,
moving-support transport, and water buoyancy. The player walks through them:
they never trip, support, or receive a push/impact from the player, including
when swimming or riding a moving support. Drop can therefore release the sleeve
at its actual arm position without first clearing the player's body. Other
props, bots, terrain, red fields and repulsor pulses still interact with them.
Normal-weight sleeves float roughly half submerged; the optional heavy preset
sinks. Gravity plates affect both through the ordinary weight rules.
They can load a plate only when their actual supported mass meets its normal
rules. Neither a carried tool nor a nearby loose one supplies a remote load.
Tools do not expire, return automatically, or teleport to the player. Authored
recovery must account for a misplaced tool; a deliberate advanced failure may
require restarting, as other essential cargo can today.

## Movement while holding a tool

Both sleeves permit the complete ordinary movement set: running, jumping,
crouching, pushing, automatic steps, climbing, rope catches, ledge grabs and
pull-ups, deliberate lowering, wall braces/jumps, swimming, and riding supports.
Their speed, grip eligibility, motor forces and recovery remain the normal rules.
A tool does not require dropping before a ladder, crate, bank, or ledge.

The sleeve follows the normal right forearm during traversal, pushing and
reaching. Do not replace a planted palm or working arm with a carrying pose.
Aiming, firing, and EMP use are unavailable only while the right arm is supporting
the player: a planted climbing grip, rope hang/turn/rappel, ledge hand support,
right-palm wall brace, loaded pushing palm, or supported water/fall recovery. A free right hand remains
usable while the other hand supports the player. Ordinary foot-only steps do not
block use. Pull-ups release each hand according to the existing choreography;
ladder/rope climbing uses that hand's actual planted phase. Merely equipping a
gadget never suppresses a movement action.

When the right arm takes support, its ordinary contact pose takes priority over
pointing the tool. Movement controls always retain their normal meaning. The
tool follows directional input again when the arm is free; holding Fire never
queues a later shot through a grip. A failed use retains the tool and
gives a brief supporting-arm cue. Releasing a grip does not grant an extra jump
or reset cooldown.

Both tools are sleeves around the right forearm, with no handle or separate
handheld grip. Solve the arm first, then attach the sleeve to its elbow-to-wrist
axis. Its emitter and actual shot direction agree, including while running,
crouching, swimming, and under reversed gravity. The right arm renders in front
when facing right and behind the torso when facing left. Turning keeps the
sleeve's top panel upright rather than rolling its artwork upside down.
Draw the sleeve in the same layer as its arm, including behind the torso in
climbing/back views. Its artwork foreshortens with a forearm rotating through
depth during grips and swings; it must not float in front as a separate sprite.

Use compact, recognizable equipped poses. Normal traversal owns the arm's
terrain and prop clearance, so the cuff cannot arrest a legal grab or push.
The complete held sleeve still sweeps against red fields during movement,
turning, climbing and transport. At its first contact, the sleeve detaches on the
side the player approached from. Player movement and grip progress continue
normally. Ordinary body collision still applies to terrain, mechanisms, props,
bots, and blue fields.

Pickup, drop, aimed pose changes, and firing retain full obstruction checks.
A blocked aimed pose retains the last legal pose and prevents a stale-direction
shot. Red-field detachment preserves the same physical item and its cooldown;
it cannot stow the sleeve or put it across the field to fire from the far side.

## Controls and aiming

Movement and aiming happen together. There is no aim mode or aim modifier.

| Action | Keyboard / mouse | Controller | Touch |
| --- | --- | --- | --- |
| Pick up / Drop | E | X / Square | Tap Pick up / Drop |
| Fire either tool | F or primary mouse click in the play canvas | Right trigger / R2 | Tap Use / Fire |
| Move and point either tool | Arrow keys or WASD; combine directions for diagonals | Left stick or D-pad | Normal movement and Up/Down gestures |
| Jump | Space | A / Cross | Existing jump gestures |
| Detach from a rope or ledge | X | B / Circle | Existing downward flick |

Either tool snaps to the nearest of eight directions, 45 degrees apart. The
stick's radial dead zone rejects drift before selecting the nearest sector;
keyboard and D-pad combinations supply cardinal or diagonal directions, with
opposing keys cancelling on that axis. Walking with Shift does not change a
keyboard diagonal into a vertical angle. Apply the selected direction before
processing a shot in the same simulation step. Gravity inversion does not
invert aiming: up still points up on screen.

Directions keep all ordinary movement meanings, including running, air steering,
crouching, swimming, and climbing. Aiming adds no position lock, movement gate,
extra braking, or wait for neutral input. Jump remains separate. Pointing left or
right turns the player toward the shot; exactly vertical aim retains facing.
When directions are released, the tool returns to horizontal hip fire in the
current facing direction. Fire remains an independent fresh action and works
while moving or standing, subject to hand support, power, cooldown, and clearance.
There is no separate right-stick, mouse-pointer, Q, or left-trigger aiming path.

The displayed upper arm and forearm ease toward the selected pose together,
using the shortest angular path. The sleeve attaches to those same displayed
bones, so it never slides independently of the arm. Direction selection and
collision queries remain immediate; a fresh discharge aligns the displayed
emitter with its actual shot without delaying fire. Planted hand contacts keep
their ordinary traversal poses rather than receiving aim animation.

During ladder or rope travel, Up/Down keeps the ordinary hand-over-hand stroke,
including the unloaded reach between grips. A free hand may point away from the
climb, blending out and back along its reach before the next grip; firing still
aligns the emitter immediately. Catch and step transitions preserve a snapshot
of the incoming equipped arm, so later directional input cannot rewrite their
starting pose. Pull-ups and hanging grips retain their existing choreography.

**Show direction through the item itself.** The sleeve's emitter and arm pose
make its current direction legible at gameplay scale. Do not draw a reticle,
crosshair, projected line, target highlight, trajectory preview, or range marker.
A blocked pose/muzzle may give a brief cue on the item and an appropriate sound;
it does not reveal a distant target or obstruction. There is no automatic target
selection, homing, zoom, or world pause.

On touch, ordinary movement and vertical holds also select the tool direction.
Pick up / Drop and Use / Fire buttons sit outside the canvas gesture recognizer,
have generous touch targets, and retain their own pointers. A button press must
not jump, detach, or change a movement finger's role. Existing tap/flick jump
and detach gestures retain their timing and meaning. Both tools use the same aiming controls.
Actual phone ergonomics still require review.

## Activation and feedback

Use requires a fresh press (or completed touch tap). Holding a key/trigger never
auto-fires, queues a shot through cooldown, or uses a tool collected later.
Pickup and drop take priority over Use in the same step; no use occurs that
step. A newly picked-up tool waits for release and a fresh Use press. An empty
hand, blocked muzzle, cooldown, or disabled tool gives a short local cue and
never queues a later activation.

Both tools remain equipped after firing. A valid discharge starts its
cooldown even if it misses or strikes an immovable surface; empty space is a
legitimate shot. Retain cooldown on that physical tool through drop and pickup.

Show the held object, its name, the relevant controls, and ready/cooling/disabled
state without a large permanent inventory panel. Separate pickup, drop, EMP
discharge, rifle discharge, and impact cues. While a device is disabled, short
cyan/white lightning arcs crackle across its body or emitters. Three five-segment
arcs per body flicker at 14 Hz, with no particles, blur, dynamic lights, or new
lighting passes. Arc count stays fixed regardless of device size. There is no
countdown ring, number, or timer above the device. Use shape or a brief label as well as
color. Failed actions should not open a dialog or interrupt movement.

## Force fields and solid obstructions

| Participant or effect | Active blue field | Active red field |
| --- | --- | --- |
| Player with empty hands | Blocked by existing player contacts | Passes through |
| Loose tool, or tool transferring during pickup/drop | Passes through | Blocked as an object |
| Held tool | Tool passes; the player's body remains blocked | Detaches at the first swept contact on the approach side; player continues |
| Repulsor pulse | Passes through | Stops at the first field surface |
| Carried EMP bolt | Passes through the beam; hitting either emitter disables this field | Beam absorbs the bolt and disables this field |
| Automatic EMP collectible | Global effect disables the field | Global effect disables the field |

Walking, jumping, climbing, or riding through an active red field leaves the
same tool loose on the approach side without stopping the player or releasing
a grip. The item retains cooldown and ordinary physical behavior; its
velocity into the field is removed. It is recoverable where it drops. Carrying
it across requires finding a route around the field or removing power. Pickup,
aimed pose changes, and manual drops still require a clear transfer. Fast
travel and moving supports cannot skip the swept detachment check, and a muzzle
cannot be placed through a red field to fire from its far side.

Terrain and solid gates/lifts block tool transfers and shots. An EMP hit on a
gate/lift freezes it rather than opening it or continuing through it. Existing
player/object distinctions still apply to blue fields; they can separate the
player from something the rifle can affect. A rifle pulse has no physical body
that holds a switch or prevents a field from returning.

When red-field power returns, held and loose tools count as objects for the
existing pending-activation clearance rule. A field overlapping either waits
until the tool clears; the empty-handed player alone does not keep it pending.
Removing power removes collision immediately. Do not materialize a field inside
a tool, cut it off the player, eject either participant, or add a new grace timer.
Blue fields retain their existing player-clearance rule.

## Carried EMP

**Reusable projectile weapon; no ammunition.** With the right arm free, each
fresh Fire sends a visible electric bolt in the selected direction. Start with
1,200 units/second bolt speed, 900 units of range, a one-second cooldown, and a
ten-second disable. The sleeve stays equipped. A miss still spends cooldown.
Bolts sweep the whole distance traveled each step, so thin obstacles stop them.

The first hit consumes the bolt. A mechanism freezes at its current position,
retaining its direction, wait state, and ordinary collision hull. A shovebot
stops its motor, perception, timers, and recoil, stays solid, faces the shooter,
and loses its own headlight. Hitting a force field disables only that field;
either emitter can be targeted, while an active red beam also absorbs bolts.
A dry gravity plate is hit through its shallow emitter bar, not its invisible
field volume. Its gravity effect stops independently of other fields and water.
Terrain and loose props absorb bolts without an electrical effect. Ladders,
ropes, water, collectibles, switches, relays, and lights are not bolt targets.

The rest of the level keeps running: no global blackout, switch reset, remote
pump interruption, or changed exit logic. Disabling a gate stops it rather than
opening it. Repeated hits refresh ten seconds rather than adding durations.
When the effect ends, normal power and clearance rules apply; a force field
waits for overlapping bodies to clear before returning. Dropping the weapon
does not cancel an existing bolt or disable. Bolts work in the air and underwater.
There is no area effect in this version; the impact and crackle identify the hit
device without suggesting neighboring devices are affected.

Legacy automatic EMP collectibles retain their global five-second outages and
stacking duration. Both carried weapons stop firing during that outage; pickup,
drop, cooldowns, and existing local disable timers continue normally.

Potential uses include choosing a lift's stopping height, interrupting a charge,
removing one barrier, or switching off a particular gravity emitter while other
equipment keeps moving. Shared tuning and direct-hit rules apply across levels.

## Repulsor rifle

**Reusable; no ammunition or recharge pickups.** Each fresh Use fires one
bounded pulse along the selected direction. Start evaluation at 1,500 units of
range and a 0.4-second cooldown; both are provisional shared tuning values.
The current prop impulse is `3600 / mass`, capped at a 1,000-unit/second velocity
change and the existing prop speed limit. This is four times the first prototype's
mass-scaled impulse, with a higher cap for light objects. Grounded bot recoil
travels up to 180 units over 0.4 seconds, starting at up to 900 units/second and
decelerating at 2,250 units/second squared. Losing wheel footing reduces braking
to 225 units/second squared, preserving momentum over the lip before landing.
Each step sweeps the chassis and wheels against terrain, other bodies and red
fields. External force can leave the patrol lane; the motor then deactivates.
A hit never changes position at once.
The visible beam is a 25 ms flash. A separate small impact ring fades over 90 ms;
the beam must not linger in a running player's path after the shot.
Impulse strength and pulse width must be chosen through contact and usability
checks. Keep them consistent across levels rather than tuning each rifle to
make a particular puzzle work.

The pulse resolves its first physical hit along the full path from the hands
through the barrel and onward, using the hip-fire or aimed pose as appropriate.
A close obstacle blocks it even if the drawn muzzle would otherwise extend
beyond that obstacle. Use swept geometry with a small, consistent width; the
brief discharge artwork must reflect that width. The pulse is resolved
immediately; its artwork is not a traveling physics object or a persistent aim
guide.

| First hit | Result |
| --- | --- |
| Loose box, ball, or dropped tool | Apply a finite impulse in the shot direction. |
| Float-switch ball | Apply a bounded impulse through its existing constrained arm motion; switching follows the actual angle and electrical rules. |
| Shovebot | Interrupt its drive and produce bounded recoil and recovery, as specified below. |
| Terrain, closed gate, lift/platform, or active red field | Stop; no movement, damage, switching, or penetration. |
| Rope or ladder | Pass through without applying force or changing a grip. |
| Coin, timer pickup, automatic EMP, text, light, wire, or logic relay | Ignore as a physical target; continue to the next physical hit. |

Exclude the firing player and held rifle from their own query. The shot does
not pull, damage, collect items, toggle electrical inputs directly, or push the
player. There is no recoil jump or self-propulsion. Use a center-of-mass impulse
for loose props; do not add an arbitrary spin. Mass determines the velocity
change, and normal contacts determine rolling, blocked travel, and transmitted
force. The pulse itself hits one object; any ensuing chain reaction comes from
physical contacts. Repeated firing cannot force an object through terrain or
ignore the existing velocity bounds. Water does not block the pulse; submerged
objects retain ordinary buoyancy and resistance after the hit.

Shovebots use a driven controller. A hit interrupts windup/charge, applies bounded swept
recoil, and enters the normal recovery phase before sensing and driving again.
Terrain, red fields and other bodies constrain recoil. External force can carry
it over a cliff or past its authored patrol bounds. An unsupported chassis falls
under gravity and lands through swept contacts. Outside its patrol range it
deactivates for the remainder of the run, retaining its solid body and response
to further repulsor hits. Its motor never tries to return to the old range.
Physical player contact or a repulsor hit turns the bot to face the player,
including contact or a shot from behind. Merely standing nearby behind it does
not reveal the player. During recoil, it faces the shooter while moving away.
Further hits during recovery may displace it but do not restart its recovery
timer indefinitely. Inside its patrol range the normal recovery still resumes
its motor. This does not by itself establish a richer adversary; evaluate the
encounter separately from the rifle's object-manipulation uses.

## Level boundaries, pause, and restart

Tools and their state exist only within the current run. No tool,
cooldown, or effect transfers to another level or account inventory. Campaign
progress stores no transferable tool inventory. Accepted exit entry locks score
and tool input under the normal doorway rules. Leave held equipment in that
level; exiting requires no extra Drop chore.
The carry collision checks still apply before entry is accepted.

Entrance/awakening and clock startup retain their existing behavior. Gadget
actions add no preparation pause. All motion, cooldowns, and outages use
simulation time and freeze with a normal pause. Pause, focus loss, device
changes/disconnection, and touch cancellation clear pending actions. Returning
to play requires fresh presses and cannot fire or drop from a previously held
control. Directional aiming follows fresh movement input after resume, with
no retained aim session or pending shot.

Restart restores authored tools and positions, empties the hands, resets aim
and cooldowns, and clears outages, device disables, bolts, and pulses. Beginning another run or playtest
also clears this state. A future resume that preserves a world must preserve
held/loose identity and timers consistently; it cannot duplicate a tool or reset
its cooldown. A stranded tool has no automatic recall or replacement button.

## Authoring and compatibility

Gadgets are physical `props` entries with `kind: "box"` and an explicit
`gadget: "emp"` or `gadget: "repulsor"`. Other prop kinds reject this field.
They share the ordinary prop count limit and editor placement, naming, selection,
move, duplicate, undo, preview, and save/reopen paths. `size` retains the prop
scale parameter (default 40); sleeve hull width is `size * .4` and height is
`size * .2`. Positions use center X and unrotated bottom Y, like other props.
The same rectangle rotates, collides, loads plates, and integrates buoyancy when
loose. Held geometry uses those same dimensions on the forearm. Mutable
ownership, cooldown, aim, and device disables belong to run state.

Keep existing `pickups` entries with `kind: "emp"` as automatic on-contact EMPs.
Introduce carried tools as an explicitly distinct authoring feature; never
silently reinterpret old files. New carried EMP artwork must be distinguishable
from the floating automatic lightning collectible. Migrating an existing level
requires an explicit authored edit, completed routes, and a new medal review.
Do not change existing campaign levels as part of this prototype.

Teach pickup, drop, hand support, aiming, and red/blue behavior through clear,
recoverable encounters. Provide usable positions from which to observe and act,
and ensure required equipment can be reached and placed with normal controls.
Review tool-equipped grabs and pull-ups, swimming to a bank with the sleeve,
blocked drops, missed shots, and lost equipment. Intentional
restart states must be understandable. Favor meaningful choices over repeated
mandatory tool shuttling or extra waiting on every replay.

## Evaluation before implementation is accepted

First establish the carry/clearance and control behavior, then deliberate EMP
use, then the rifle's contacts and bot response. Use small disposable test
fixtures to isolate each rule. Production levels and a campaign rollout are
separate authoring work.

Verification should include:

- Deliberate pickup, highlighted target/ties, repeated presses,
  pickup during a jump, excluded grip/transition states, same-step pickup/use,
  swapping, and cooldown preserved through drop and pickup.
- Clear and blocked drops on either side, falls, moving supports, water,
  inversion/zero gravity, ordinary prop loads, and equipment recovery.
- Every allowed and blocked movement action, body impacts versus active pushing,
  carry/aim sweeps, automatic catches, supporting-arm use gates, and grip release without an extra
  jump or artificial motion.
- All eight stick sectors, keyboard/D-pad combinations, Shift-walk diagonals,
  neutral hip fire, same-step direction/fire, turning, and normal movement while
  pointing, including climbing and swimming.
- Smooth displayed arm/sleeve transitions without shortened bones, direction
  lag in shot resolution, or disturbance of a planted palm.
- Supporting-arm use gates, no queued shots, pickup/resume input safety,
  near-wall shots, diagonal stick drift, touch ownership, and item-only direction
  cues without reticles or projected guides.
- Both field modes for loose/held tools, automatic red-field detachment from
  either side and during climbing, preserved item state, transfer paths, pulses,
  fast movement, transport, inversion, EMP removal, and pending reactivation.
- Local EMP first-hit targets, duration/refresh, unobstructed devices continuing,
  eight-direction shots, cooldown preserved through drop, field reactivation,
  bounded crackle without countdowns, both tools disabled during a global outage,
  and unchanged legacy automatic EMP behavior.
- First-hit ordering and occlusion, misses, cooldown, mass differences, rolling,
  trapped/stacked props, float constraints, bots in each phase, and no tunneling,
  direct switching, self-recoil, permanent stun, or unsupported chain impulses.
- Exit entry, restart, fresh playtest, pause/resume, focus loss, device changes,
  file/editor round trips, and no inventory or effects carried between levels.

Play with normal keyboard, controller, and actual phone controls before claiming
usability. Review readability and enjoyment independently of automated checks.
Benchmark carry sweeps, aim queries, and firing in wide levels and dense prop
scenes. Bound candidate queries and visual effects; avoid new full-scene work,
lighting passes, or unbounded particles per frame.

## Tuning and remaining review

Pickup reach, tool dimensions/mass/buoyancy, drop clearance, rifle width/range,
impulse, cooldown, bot recoil/recovery, stick dead zone, and touch ergonomics need
measurement. In particular, test small floor balls and nearby ceilings with
eight-direction aim, and make sure a blocked carry pose never traps ordinary
movement or gravity turns. Revise the shared design if those encounters feel
awkward; do not patch individual levels with special tool rules.

The pickup/drop model, normal traversal, supporting-arm use gate, eight-direction movement aiming with neutral hip fire,
level-local ownership, field distinctions, reusable direct-hit EMP, and reusable
nonlethal rifle are the concrete proposal for review. Their ability to support
distinct, enjoyable challenges remains a playtesting question.
