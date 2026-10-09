# Reproducible acceptance checks

Use Node from `.nvmrc`: `npm ci`, `npm test`, `npm run lint`, `npm run build`,
`npx playwright install chromium webkit`, `npm run test:browser`. CI installs
Chromium and WebKit with OS dependencies and runs the same commands before deployment.

## Regressions for reported bugs

Every reported bug needs a permanent regression test alongside its fix. Reproduce
the reported geometry, input sequence, and initial state; confirm the test catches
the faulty behavior before applying the fix when possible. Exercise the actual
game simulation or public UI, and assert the player-visible outcome rather than
copying the implementation into the test.

For Untitled Jumping Game, keep physics and animation regressions in
`tests/jumping-*.test.mjs`. Include relevant boundary cases such as both approach
directions, exact tile clearances, interrupted input, and the first attempt after
loading or restarting. Animation checks should cover contact positions and motion
through the transition, not just the final pose. Add browser coverage for input,
rendering, editor, and dialog bugs, and visually inspect the affected animation or
layout. Screenshots supplement assertions; merely saving a screenshot does not
make it a regression test. If a report cannot yet be reproduced, say so explicitly.

Run the affected checks after each fix. These test locations are included in the
existing unit and browser CI jobs; a separate manual regression command must not
be the only way to exercise a reported bug.

## Game acceptance coverage

Node imports the same `createGameSession` used by React. `sessionReplay.mjs`
records seed and tick-indexed commands; assertion diagnostics include those
inputs, ship, mode, campaign and tether. Its pilot turns/thrusts through the real
controls. Flight scenarios never overwrite ship positions during traversal.
Saved-position fixtures define the start of an encounter; controlled scenes remove
unrelated ore but retain production collision, towing, bot, radiation and
progression systems. A separate schedule test uses the complete authored field.

Scenarios cover a grapple/receiver/door at 30/60/120/144 Hz; docking and recovery
banking across reload; physical radiation traversal; blaster combat, defeat
persistence and death/respawn; actual tether release on teleport; core towing,
Ignition Cradle completion, reload and continued exploration. Cosmetic variation
is checked against real mined-fragment outcomes. Clock tests bound hitches to
six ticks and assert no pause/survey catch-up. Existing focused mechanics and
geometry tests remain in the suite.

Spawn recovery checks load ships inside outer rock, an interior rock island and
a closed door, then follow the normal death/recovery flow. A hull merely touching
a wall must resolve its contact and stay alive. The saved checkpoint is updated
at death so reloading during the explosion cannot repeat the invalid spawn.

Playwright owns both servers and isolated browser contexts. Production tests
cover all routes, download isolation/failure recovery, saves, menus, keyboard
flight, survey/log/pause and HUD synchronization. A separate development project
exercises developer credits, map reveal and level jumps; production verifies the
developer shortcut is unavailable. Tests use public UI and browser storage,
never React internals or dependencies from another checkout. Failures retain
screenshots and traces under the ignored `test-results` directory.
CI uploads those diagnostics, including save/visibility state, for seven days.

The `iphone-webkit` project checks UJG at an iPhone landscape viewport and pixel
density. It measures wall-text ink placement, multiline spacing and clipping;
touch checks exercise tap and flick jumps, movement, simultaneous fingers,
climbing, cancellation, pause and browser-default suppression. The same checks
also run in Chromium. Automated pointer sequences establish input behavior;
actual iPhone playtesting establishes gesture feel and system interruptions.

Hard Vacuum's long recovery and departure checks pause the browser clock between actions and
advance it in 100 ms batches. This draws at 10 Hz while retaining all 60 Hz
physics steps within the six-step catch-up limit, instead of spending the test
timeout drawing thousands of intermediate frames. Short input/animation checks
still use normal frame pacing. A browser check verifies elapsed gameplay, and
unit replays compare 10 Hz with the existing 30/60/120/144 Hz schedules. No test
timeouts, assertions, or gameplay durations are relaxed. To reproduce slow-machine
conditions locally, prefix the browser command with `HV_TEST_CPU_RATE=6`.

UJG traversal checks wait for the selected level card to become visible before
pausing the installed clock, then wait for the playable canvas to receive focus.
Keep these readiness observations ahead of clock-controlled input; a loading
failure and a slow gameplay frame are different failures. Retain traces while
diagnosing either, and run a costly failing case alone before attributing its
timeout to movement.

UJG caps each rendered frame's elapsed time at 50 ms and advances physics at
120 Hz. Hard Vacuum's 100 ms batching helper therefore drops half the requested
UJG simulation time. Keep traversal and sampled animation at the existing normal
frame cadence unless a separate schedule equivalence check proves every elapsed
step and input transition is retained. Improve runtime/rendering cost instead of
lengthening deadlines, shortening traces, omitting frames, or replacing normal
controls with injected state. Rendering optimizations must compare the complete
image against the original composition, including occlusion, camera/size changes,
power loss, and artwork that needs a full-viewport fallback.

For passive settling without rendered-transition assertions, use
`advanceJumpingPassiveWait` only with an ordinary-versus-batched trace comparison.
Its initial native advance aligns with Playwright's 16 ms RAF schedule, full
48 ms batches stay within UJG's frame cap, and the native remainder preserves
the final RAF boundary. Blind 48 ms batching from an off-frame time can exceed
the cap; batching a partial tail can also add a simulation step. The permanent
clock comparisons cover both squeeze prop orders, their complete diagnostic
windows and both 125-frame held animations, plus every rope fixed step through
gravity settling, climbing and both departures. Keep held input, short entries,
departure checks, screenshots, assertions and their deadlines unchanged. These
comparisons establish pacing equivalence; they do not evaluate naturalness.

Daylight cache comparisons must witness the optimized path, compare every RGBA
channel to an explicitly uncached renderer, and include a warm fixed-view
sequence with moving foreground art. Check recovery indicators, rotated props,
material edges and terrain restored after an actor leaves; camera/mode changes
alone cannot establish cache correctness. A retained complete background also
needs wall-art, exit-fade and buffer-release/rebuild comparisons, and must stop
being reused when view, geometry or font readiness changes. Keep material-tile
allocation on the cold frame so warm frames still satisfy the resize checks.
Athlete-pose reuse must expire at the end of one synchronous, read-only render.
Skin, shadows and emissions may share that solve, but the next physics state
must solve again. Compare complete pixels with only `reuseAthletePose` disabled
on the reference, including both gravity frames, airborne and water poses,
low/crouched working contacts, powered night scenes and full-bright fallback.
Check ordinary queries, nested draws and exception cleanup separately. A
passing image comparison must also leave the player state unchanged.
Read-only contact queries may share `platformOutline` geometry, but authoring
must use independent `polygonPoints` arrays. In-place position, size, polygon
and profile edits must invalidate the shared outline, including mirrored,
rotated and rounded shapes. Preserve exact winding and redundant-edge filtering.
Compare full fixed-step contacts, footwork and rigs when changing these hot
queries; successful final positions alone can hide a one-frame support change.

For a lower-floor retarget beneath a moving curved support, verify the complete
later landing as well as the first contact. The descending shoe must remain
unloaded until its actual sole reaches current geometry. Compare physical root,
velocity, input state and moving-object traces exactly; also retain fixed bones,
real planted ankles and immediate fresh jump response. Inspect native animation
at ordinary and enlarged scale. A short transition that passes can still hide a
later torso drop. Run the steep-slide entry and release cases too: a slipping
face owns a different presentation handoff and must not inherit this landing.

Run `node scripts/diagnose-jumping-contacts.mjs` to measure the sixteen opposed
blocked braces and eight actual moving-prop step interruptions. It prints JSON
for the current source; a successful exit means the diagnostic ran, not that
the animation passed. The opposed sequence includes two-tick reversals, release
and a fresh jump. Review head and shoulder motion together, pelvis/chest/neck
proportions, fixed limb lengths, real walking anchors and first-force palms.
Walking-anchor comparisons exclude climbing's separate contact owner. Keep the
moving-prop interruption and later low-object contact in the same review: a
better first head sample can hide a collapsed torso or a worse subsequent shove.
`tests/jumping-step-return-pose.test.mjs` covers the complete normal moving-prop
return, loaded-contact handoff, free-hand skin and rejected wall-obstructed
preparation. `tests/jumping-step-return-gravity.test.mjs` adds real reverse-field
encounters with the same bone, torso, hand/shoe-skin and planted-ankle checks,
read-only pose queries and preparation-palm reflection. Both suites bound wrist
motion on every frame as well as on first force; moving a snap into the preceding
unloaded frame must fail the same complete-transition review.
`tests/jumping-push-anticipation.test.mjs` covers a close falling reach, rejected
blockers, immediate release, fresh/active jump priority, and exclusion of other
grip, recovery and balance owners. A retained interrupted-step rig can coordinate
its incoming reach; an ordinary approach must not replace a fading slide brace.
Keep the crowded box/ball/bot torso-continuity regression with these checks.
The falling-reach suite also exercises a whole running/walking ball descent:
the actual brief slip takes over from the outgoing reach without replacing the
whole rig at once. A returning step's turn can finish before landing; keep its
incoming reach owner until genuine footing or release ends that preparation.
Keep both files with the original step, ledge, foot-landing and slide suites; passing one
handoff must not excuse detached lip grips or later abrupt arm acquisition.
For ball palm clearance, distinguish the drawn circle from its circumscribed
collision polygon. A loaded tangent palm can clear the visible ball while lying
inside that polygon's narrow outer rim; never ignore true skin penetration or
alter the physical hull to make an animation assertion pass.

During a loaded step handoff, use the actual incoming contact direction even
if mechanical facing still belongs to the canceled climb for that tick. Fit
the pelvis to real planted ankles as well as fitting the shoulder to the force
palms. Clear a swinging shoe's final outline after torso fitting; retaining a
fixed ankle does not establish that its old shoe pitch clears the floor.
`diagnose-jumping-contacts.mjs` reports complete and first-force wrist maxima
alongside head/shoulder and contact measurements. A good head trace alone can
still conceal a late arm snap.

Resolve both images equally for paired
performance measurements and retain the same memory budget. A passing normal
CPU run does not complete slow-machine acceptance; the existing
`HV_TEST_CPU_RATE=2` helper also applies to Chromium UJG tests without changing
their clocks, deadlines or control traces.

UJG camera regressions cover a readable phone-scale figure, balanced framing of
short rooms, both enclosing contacts in taller rooms, resize continuity, room-end
clamping, water anchoring, and a running held jump whose destination is visible
before takeoff. The live view blends a bounded lead from actual velocity only
when the viewport needs more forward room; precision walking remains centered.
Camera sampling leaves the player untouched and freezes its presentation blend
while paused. `jumpingCamera.spec.mjs` uses real keyboard input and records the
native canvas transform, approach distance and complete camera trajectory across
phone/desktop and day/night sizes. `jumpingCameraRender.dev.spec.mjs` compares the
original/lit transforms across 48 viewport, pixel-density, water and gravity
combinations; it bounds Canvas transform rounding to less than .001 backing pixel.
Unlit-night rendering can omit black correction masks and empty haze passes;
`jumpingUnlitNight.dev.spec.mjs` compares every RGBA channel with the full original
composition, including power transitions, exit fading and the GPU/Canvas paths.

Bot-model checks validate mesh winding, mirrored grabber poses, garage clearance,
powered/damaged states, and presentation-only rendering without physics writes.
Healthy models are limited to four functional parts and 52 vertices; damage and
exhaust attachment checks keep the simplified silhouettes intact.
Combat checks require four blaster hits or fifty completed laser contacts, verify
five seconds of effective contact at maximum focus (twenty seconds stock), and
cover fractional-damage rounding, stock-capacitor bursts and mixed-weapon finishes.
Security-defense regressions exercise continuous laser fire at every focus level
and 30/60/120 Hz, preserving warning/burst timing while retreating from close range.
They also cover heavy-hit stagger recovery, uninterrupted tug grapples under laser fire, safe Haven,
cover and wall clearance, and real-session return fire against a stationary pilot.
Damage checks verify accumulating breaches and increasing
spark count, frequency, reach and lifetime at 30/60/120 Hz, including paused,
powered-off and destroyed craft.
A development-only canvas comparison draws the actual ship and bot renderers at
native and enlarged scales, including powered rest, saving `bot-models.png` under `test-results` for visual
inspection. The `bot-towing` benchmark exercises the same models in live gameplay.

Controller checks sample the same standard-layout input reader and production
flight session, including turn-only stick steering, proportional RT thrust and
LT reverse, LB/RB strafing, X tether, contextual Y dock/call/teleport, right-stick
click for the recorder, dead zones, held-action safety,
keyboard overlap, 30/60/120/144 Hz simulation, and neutral
input after screen/focus/device changes. Browser tests inject a virtual Gamepad
through `navigator.getGamepads` and exercise launch, flight, weapons, tether,
docking, menu navigation, map/log, disconnect/reconnect and save confirmations.
Menu acceptance checks cover the arcade selector, focus styling after mouse
input, restoring selection after sub-dialogs, safe confirmation defaults,
disabled purchases, visual grid columns, topmost-dialog routing, small-screen
scrolling and map selection versus panning. Keyboard checks cover Tab/Shift+Tab
reading order versus arrow-key grid navigation, Home/End, Page Up/Down, modal
focus containment, held keys across screens, upgrade focus after purchases,
failed-save cancellation, completion and nested-shortcut isolation. Responsive
checks exercise 360×640, 620×360 and 1280×800 layouts. Successful menu screenshots are
written under `test-results` for visual inspection. A custom-layout unit fixture
checks that alternate button and turn-axis assignments use the same reader.
The browser clock controls button holds and frame polling deterministically.
Hint checks cover live connect/disconnect, unsupported-pad fallback, selection
preservation, HUD/map/tutorial labels, and keyboard use while a pad is connected.
These checks do not replace testing real USB/Bluetooth hardware: verify stick
feel, layout detection and audio activation on the target controller/browser.

The Hard Vacuum audio regression renders the real thrust gain in an offline
browser audio context. Small trigger fluctuations must stay continuous; full
and low throttle must settle at proportional volumes, release must reach
silence, and a quick release/repress must preserve the new voice. A constant
input isolates volume dropouts from the random noise texture.

Arcade theme checks cover the three illustrated entry points without eagerly
loading game engines, per-game start/pause/loading/error treatments, controller
reconnection hints, and selection restored on return. They also check unclipped
focus at phone, landscape and desktop sizes and preserve Hard Vacuum's vector
console styling. Decorative cover stills share the actual game renderers, do not
add focus targets, and redraw at display resolution only when resized. Tests
check that they leave saves and audio untouched, remain still during selection,
and cannot block navigation if a decorative preview fails to download.
Focus checks keep primary/secondary materials distinct with one consistent ring,
no competing pseudo-element marker, and no moving button hit areas.

Flight-camera checks cover uniform viewport scaling from phone to 4K and
ultrawide layouts, centered flight, unchanged world geometry and paused state
during resizing, fixed-size desktop HUD, training, and floor-label docking at
both small and enlarged scales. Survey-map zoom remains independent.

## Survival-pod evacuation

`survivalPods.test.mjs` checks the twelve-pod manifest, eight locked ward pods,
four matching empty cradles, physical extraction paths, seal-time rescue and
payment, interrupted recovery, reload/death/travel persistence, moving panel
markers, real-command pod towing, both prerequisite orders and docked recovery. Cargo rendering and live
laser tests include every pod. Schema-eight migration preserves old earnings
and installed escape power while reopening the rescue objective.
`departure.test.mjs` checks the Access Tunnel spawn, the sealed outer lock,
launch-only clearance, every missing pod, missing power, wrong berth, an undocked pilot,
physical flight, interrupted-departure reloads and schema-nine migration.
Browser checks cover bank/manifest persistence without counters, ungrappled
fly-bys, the final docked rescue, disabled departures, keyboard/controller launch,
and the Access Tunnel. `havenActivation.test.mjs` checks the anchored socket,
actual hook flight, immediate persistence, dormant services, both death policies,
bot/debris restoration, schema-eleven migration and developer staging. Browser
checks exercise keyboard/controller activation and restart, recovery copy and reload.
They also cover the persistent first conversation and deliberate tether release;
the center-link model study checks its retracting hatch and fully hidden endpoint.
The development model study renders native/enlarged pods,
twelve numbered medical cradles and Haven’s lamps throughout folding.
The pod-animation study checks glass and cross pixels over four minutes of
rocking at minimum zoom, native size and enlarged scale. Unit coverage also
checks visible surface ordering and the one-time relocation of the old Breach
pod, preserving towed cargo, completed rescues, rewards and finished departures.

Flight training has headless coverage for its restricted loadout, square geometry,
real laser fragmentation, tether control, all three circular hopper openings,
simultaneous processing by both hoppers, visible mining shots before impact,
one-time credit awards, cell rejection by hoppers, shared moving-door collision,
receiver/door/log interaction, room-only recording text, automatic death reset,
pause and rejection of expedition-only commands. No persistence events are emitted.
Dispenser tests cover a red-free starting range, real white-rock cuts exposing red
fragments, replacement feed, physical chute clearance, ship/cargo interlocks during
charging, cooldown/capacity limits and pause/death/restart resets.
Browser tests exercise keyboard/controller entry, reset, recorder, leave, live
floor bindings, disconnect safety, and byte-for-byte preservation of both valid
and unreadable expedition saves. Pause-menu help also covers returning to the live
expedition, preserving its tether and progress through repeated training visits,
training restarts, failed saves, and held controller buttons across the return.
The development study renders mining, hoppers
and power practice at flight scale, including active hopper lasers and the powered
receiver/open door. It also guards against outside-world references in floor text.
It verifies all four induction exercises remain labeled and captures the dispenser
charging, launching and clearing its outlet through the real session/renderer.
Terminal tests cover powered-memory gating,
explicit connection, replay, saved downloads and the absence of unsolicited help.
Campaign presentation tests cap log length and density, exclude key-binding/UI
instructions, preserve retired recording IDs across save loads, and check Haven's floor
stencil timing and relocation. Terminal physics tests retain line-of-sight and
power gating checks. Browser coverage checks live keyboard/controller floor
bindings, socket retraction before Dock appears, tap-to-dock on small screens,
the absence of floating prompts/status toasts, and hidden retired downloads.
Review every log for story exposition plus an item clue, and some for a mechanic
expressed in the speaker's voice. Verify locations and functions against current
authored content, especially the opening Haven/shield sequence and Foundry relay.
Recorder rendering tests compare all eight models pixel-for-pixel in unread,
downloaded and connected states at three scales, with a visual contact sheet.
Log models, Haven's tether link and tethered information cards must not repeat
keyboard/controller training hints; docking and training floor bindings remain.
Wayfinding tests cover one sign per region, arrow direction toward the entry
gate, and the complete printed footprint inside walkable floor with doors closed.
Browser studies render every approach with closed/open gates and powered wiring
at desktop and narrow flight scales, preserving the original anchorage treatment.
They also reject small room-name labels on the floor while preserving explored
room labels on the local survey, region names on the overview, and HUD location text.
